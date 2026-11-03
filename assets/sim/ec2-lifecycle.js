// 시뮬레이터: EC2 인스턴스 수명 주기. 동작(시작·중지·최대 절전·재부팅·종료·OS 종료)에 따른 상태 전이와
// 과금, EBS 루트 볼륨, 인스턴스 스토어, RAM, 퍼블릭 IPv4, Elastic IP의 변화를 보여 준다.
// 동작 규칙은 EC2 사용 설명서 "Amazon EC2 instance state changes"(ec2-instance-lifecycle) 표를 따른다.
// 전이 시간과 주소 값은 화면용이다. AWS 수치는 사실 항목(F)에서만 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['ec2-lifecycle'] = function (root, F) {
  const STEP_MS = 1300; // 화면 실험용. AWS 수치 아님 (pending/stopping/shutting-down 표시 시간)
  const d = (id) => (F && F[id] ? F[id].display : '');

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 동작에 따라 인스턴스 상태와 리소스가 어떻게 바뀌나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">EBS 루트 볼륨과 인스턴스 스토어 볼륨이 하나씩 붙은 인스턴스입니다. 먼저 시작 옵션을 고르고 <b>시작</b>을 누르세요.
    <b>running</b>이 될 때마다 새 과금 기간이 열리고 최소 <b>${d('ec2.ondemand.billing.min')}</b>이 붙습니다. 재부팅은 새 과금 기간을 열지 않습니다.
    최대 절전은 시작할 때만 켤 수 있고, 최대 절전 상태는 <b>${d('ec2.hib.max.duration')}</b>을 넘겨 유지하는 것을 지원하지 않습니다.
    전이 시간과 IP 주소는 화면용 가짜 값입니다.</p>
    <div class="lc-opts">
      <label><input type="checkbox" data-o="hib"> 최대 절전 사용 (시작 시에만)</label>
      <label><input type="checkbox" data-o="dot" checked> 루트 볼륨 DeleteOnTermination</label>
      <label><input type="checkbox" data-o="eip"> Elastic IP 연결</label>
      <label><input type="checkbox" data-o="tp"> 종료 방지</label>
      <label>OS 종료 시 동작 <select data-o="sdb"><option value="stop">중지(기본)</option><option value="terminate">종료</option></select></label>
    </div>
    <div class="ctrls lc-btns">
      <button class="primary" data-a="start">시작</button>
      <button data-a="stop">중지</button>
      <button data-a="hibernate">최대 절전</button>
      <button data-a="reboot">재부팅</button>
      <button data-a="terminate">종료</button>
      <button data-a="os">OS에서 shutdown</button>
      <button data-a="reset">초기화</button>
    </div>
    <div class="lc-state" data-state></div>
    <div class="lc-grid" data-res></div>
    <div class="lc-log" aria-live="polite" data-log></div>`;
  const st = document.createElement('style');
  st.textContent = `.lc-opts{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;margin:6px 0 8px}
  .lc-opts label{display:inline-flex;align-items:center;gap:4px;min-width:0}
  .lc-opts select{max-width:100%;font-size:13px}
  .lc-btns{display:flex;flex-wrap:wrap;gap:6px}
  .lc-btns button[disabled]{opacity:.4;cursor:not-allowed}
  .lc-state{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0;font-family:var(--mono);font-size:12.5px}
  .lc-st{padding:3px 8px;border-radius:12px;background:var(--paper);color:var(--muted);border:1px solid var(--line)}
  .lc-st.on{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700}
  .lc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}
  .lc-cell{background:var(--paper);border-radius:8px;padding:6px 8px;font-size:12.5px;min-width:0;border-left:4px solid var(--line2)}
  .lc-cell .k{color:var(--muted);font-size:11.5px}.lc-cell .v{font-weight:700;overflow-wrap:anywhere}
  .lc-cell.good{border-left-color:var(--accent)}.lc-cell.bad{border-left-color:var(--warn)}
  .lc-log{font-family:var(--mono);font-size:12.5px;background:#1F1E1B;color:#ECE8DF;border-radius:8px;padding:8px 10px;margin-top:10px;height:130px;overflow:auto;overflow-wrap:anywhere}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const opt = (k) => q(`[data-o="${k}"]`);
  const STATES = ['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'];
  let S, timer = null;

  // 화면용 가짜 퍼블릭 IPv4 (문서 예시 대역 203.0.113.0/24). AWS 수치 아님
  const fakeIp = () => '203.0.113.' + (10 + Math.floor(Math.random() * 240));

  function reset() {
    clearTimeout(timer); timer = null;
    S = { st: 'none', hibernating: false, starts: 0, root: '없음', store: '없음', ram: '없음', pub: '없음', priv: '없음', eipNote: '', log: [] };
    opt('hib').disabled = false;
    q('[data-log]').innerHTML = '';
    log('아직 띄우지 않았다. 시작 옵션을 고르고 [시작]을 누른다.');
  }
  function log(t) {
    S.log.push(t); if (S.log.length > 80) S.log.shift();
    const L = q('[data-log]'); L.innerHTML = S.log.map((x) => `<div>${x}</div>`).join(''); L.scrollTop = L.scrollHeight;
  }
  const eip = () => opt('eip').checked;
  const later = (fn) => { clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(); render(); }, STEP_MS); };

  function toRunning(fromStopped) {
    S.st = 'pending'; render();
    later(() => {
      S.st = 'running'; S.starts++;
      if (!eip()) S.pub = fakeIp();
      if (S.hibernating) { S.ram = '루트 볼륨에서 복원, 프로세스 이어서 실행'; S.hibernating = false; }
      else S.ram = '사용 중';
      if (!fromStopped) S.store = '데이터 있음';
      else if (S.store.startsWith('지워짐')) S.store = '빈 볼륨 (이전 데이터 없음)';
      log(`running: 새 과금 기간 시작 (시작 ${S.starts}번째, 최소 ${d('ec2.ondemand.billing.min')} 과금). ${fromStopped ? '보통 새 호스트에서 뜬다.' : ''}`);
    });
  }

  function act(a) {
    const s = S.st;
    if (a === 'start') {
      if (s === 'none') {
        opt('hib').disabled = true;
        S.root = '있음 (EBS)'; S.priv = '10.0.1.25'; // 화면용 가짜 주소. AWS 수치 아님
        log(`시작: pending. 최대 절전 ${opt('hib').checked ? '켬' : '끔'} (이제 바꿀 수 없다).`);
        toRunning(false);
      } else if (s === 'stopped') {
        log(S.hibernating ? '시작: 최대 절전에서 깨운다. pending.' : '시작: pending.');
        toRunning(true);
      }
      return;
    }
    if (a === 'stop' || a === 'hibernate') {
      if (s !== 'running') return;
      const hib = a === 'hibernate';
      if (hib && !opt('hib').checked) { log('거부: 최대 절전은 시작할 때 켜야 한다. 이미 있는 인스턴스에는 켤 수 없다.'); return; }
      S.st = 'stopping'; S.hibernating = hib;
      log(hib ? 'stopping (최대 절전): RAM 내용을 EBS 루트 볼륨에 쓰는 중. 이 상태는 과금된다.' : 'stopping: 이 상태부터 인스턴스 사용 요금이 멈춘다.');
      render();
      later(() => {
        S.st = 'stopped';
        S.ram = hib ? '루트 볼륨에 저장됨' : '지워짐';
        S.store = '지워짐';
        if (!eip()) S.pub = '반납됨 (다시 시작하면 새 주소)';
        log(`stopped: 인스턴스 사용 요금 없음. EBS 볼륨 저장 요금은 계속${eip() ? ', Elastic IP 요금도 계속' : ''}. 인스턴스 스토어 데이터 지워짐.`);
      });
      return;
    }
    if (a === 'reboot') {
      if (s !== 'running') return;
      S.ram = '지워짐 → OS 다시 부팅';
      log('재부팅: 같은 호스트, running 유지. 퍼블릭 IPv4·인스턴스 스토어 데이터 유지. 새 과금 기간 없음.');
      render();
      later(() => { S.ram = '사용 중'; log('재부팅 끝.'); });
      return;
    }
    if (a === 'terminate' || a === 'os') {
      if (!(s === 'running' || (a === 'terminate' && s === 'stopped'))) return;
      let term = a === 'terminate';
      if (a === 'os') {
        if (opt('sdb').value === 'stop') { log('OS shutdown: 종료 동작이 "중지"라 인스턴스가 중지된다.'); act('stop'); return; }
        term = true;
        if (opt('tp').checked) log('OS shutdown: 종료 동작이 "종료"다. 종료 방지는 OS에서 끄는 것을 막지 못한다.');
      } else if (opt('tp').checked) {
        log('거부: 종료 방지(DisableApiTermination)가 켜져 있어 콘솔·CLI·API로 종료할 수 없다.');
        return;
      }
      if (!term) return;
      S.st = 'shutting-down'; S.hibernating = false;
      log('shutting-down: 이 상태부터 인스턴스 요금이 멈춘다.');
      render();
      later(() => {
        S.st = 'terminated';
        S.ram = '지워짐'; S.store = '지워짐'; S.priv = '없음';
        S.root = opt('dot').checked ? '삭제됨 (DeleteOnTermination=true)' : '남음, 저장 요금 계속 (DeleteOnTermination=false)';
        S.pub = eip() ? '없음' : '반납됨';
        S.eipNote = eip() ? '연결 해제됨. 주소는 계정에 남고 요금도 계속' : '';
        log(`terminated: 다시 시작할 수 없다. 루트 볼륨 ${opt('dot').checked ? '삭제' : '보존'}.${eip() ? ' Elastic IP 연결 해제.' : ''}`);
      });
    }
  }

  function billing() {
    if (S.st === 'running') return ['과금 중', 'bad'];
    if (S.st === 'stopping' && S.hibernating) return ['과금 중 (최대 절전 stopping)', 'bad'];
    if (S.st === 'none') return ['해당 없음', ''];
    return ['인스턴스 사용 요금 없음', 'good'];
  }
  function render() {
    const s = S.st;
    q('[data-state]').innerHTML = STATES.map((x) => `<span class="lc-st${x === s ? ' on' : ''}">${x}</span>`).join('') + (s === 'stopped' && S.hibernating ? '<span class="lc-st">(최대 절전)</span>' : '');
    const [bill, bc] = billing();
    const eipVal = s === 'none' ? (eip() ? '연결 예정' : '없음') : S.eipNote || (eip() ? '연결됨 (상태와 상관없이 과금)' : '없음');
    const pubVal = eip() && s !== 'none' && s !== 'terminated' ? 'Elastic IP 주소 사용' : S.pub;
    const cells = [
      ['인스턴스 사용 요금', bill, bc],
      ['과금 기간을 연 시작 횟수', String(S.starts), ''],
      ['EBS 루트 볼륨', S.root, S.root.startsWith('삭제') ? 'bad' : S.root.startsWith('남음') ? 'bad' : ''],
      ['인스턴스 스토어 데이터', S.store, S.store.startsWith('지워짐') ? 'bad' : ''],
      ['RAM 내용', S.ram, S.ram.startsWith('지워짐') ? 'bad' : S.ram.startsWith('루트') ? 'good' : ''],
      ['퍼블릭 IPv4', pubVal, String(pubVal).startsWith('반납') ? 'bad' : ''],
      ['Elastic IP', eipVal, ''],
      ['프라이빗 IPv4', S.priv, ''],
    ];
    q('[data-res]').innerHTML = cells.map(([k, v, c]) => `<div class="lc-cell ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const busy = timer !== null;
    const en = {
      start: !busy && (s === 'none' || s === 'stopped'),
      stop: !busy && s === 'running',
      hibernate: !busy && s === 'running',
      reboot: !busy && s === 'running',
      terminate: !busy && (s === 'running' || s === 'stopped'),
      os: !busy && s === 'running',
      reset: true,
    };
    root.querySelectorAll('.lc-btns button').forEach((b) => { b.disabled = !en[b.dataset.a]; });
  }

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.a === 'reset') reset(); else act(b.dataset.a);
    render();
  });
  root.addEventListener('change', (ev) => {
    const o = ev.target.dataset && ev.target.dataset.o;
    if (!o || S.st === 'none') { render(); return; }
    if (o === 'eip') {
      if (S.st === 'terminated') { ev.target.checked = !ev.target.checked; return; }
      log(ev.target.checked ? 'Elastic IP 연결: 퍼블릭 주소가 Elastic IP로 바뀐다.' : 'Elastic IP 해제: 실행 중이면 새 퍼블릭 IPv4를 받는다(화면용 단순화).');
      if (!ev.target.checked) S.pub = S.st === 'running' ? fakeIp() : '반납됨 (다시 시작하면 새 주소)';
    }
    if (o === 'tp') log(`종료 방지 ${ev.target.checked ? '켬' : '끔'}. 실행 중이든 중지 중이든 바꿀 수 있다.`);
    if (o === 'dot') log(`루트 볼륨 DeleteOnTermination=${ev.target.checked}.`);
    if (o === 'sdb') log(`OS 종료 시 동작: ${ev.target.value === 'stop' ? '중지' : '종료'}.`);
    render();
  });
  reset();
  render();
  const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); clearTimeout(timer); } }, 1000);
};

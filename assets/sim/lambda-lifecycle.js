// 시뮬레이터: 실행 환경 수명 주기(콜드 스타트, 웜 스타트, 동결, 종료)와 프로비저닝된 동시성.
// 시간·개수 상수는 보기 쉽게 줄인 값이다. AWS 수치는 사실 항목(F)에서 받아 설명에만 쓴다.
window.SIMS = window.SIMS || {};
window.SIMS['lambda-lifecycle'] = function (root, F) {
  const INIT_MS = 1600; // 화면 실험용. AWS 수치 아님 (콜드 스타트 초기화 시간)
  const RUN_MS = 1400; // 화면 실험용. AWS 수치 아님 (핸들러 실행 시간)
  const IDLE_MS = 9000; // 화면 실험용. AWS 수치 아님 (실제 유휴 유지 시간은 문서에 없음)
  const GONE_MS = 1500; // 화면 실험용. AWS 수치 아님 (종료된 카드를 지우기 전 표시 시간)
  const MAX_ENV = 6; // 화면 실험용. AWS 수치 아님 (이 데모의 동시성 한도)
  const PC_MAX = 3; // 화면 실험용. AWS 수치 아님 (슬라이더 상한)
  const d = (id) => (F && F[id] ? F[id].display : '');

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 실행 환경은 언제 만들어지고 언제 사라지나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">요청을 보내 보세요. 쉬고 있는(동결된) 환경이 있으면 다시 쓰고(웜 스타트), 없으면 새로 만듭니다(콜드 스타트).
    한동안 요청이 없으면 온디맨드 환경은 종료됩니다. 프로비저닝된 동시성을 올리면 그 수만큼 미리 초기화된 환경이 대기합니다.
    여기 시간과 한도는 보기 쉽게 줄인 값입니다. 실제로 Init 단계는 보통 <b>${d('lambda.init.timeout')}</b>까지 허용되고,
    콜드 스타트는 보통 호출의 <b>${d('lambda.coldstart.share')}</b>에서 일어납니다. 쉬는 환경을 얼마나 오래 남겨 두는지는 문서에 수치가 없습니다.</p>
    <div class="ctrls">
      <button class="primary" data-a="one">요청 1건</button>
      <button data-a="burst">요청 3건 동시</button>
      <button data-a="auto" aria-pressed="false">자동 요청: 끔</button>
      <label class="f">프로비저닝된 동시성 <input type="range" min="0" max="${PC_MAX}" value="0" data-pc> <b data-pco>0</b></label>
      <button data-a="reset">초기화</button>
    </div>
    <div class="ll-stats" data-stats></div>
    <div class="ll-legend"><span class="ll-dot init"></span>초기화(Init) <span class="ll-dot busy"></span>처리 중(Invoke) <span class="ll-dot frozen"></span>동결(대기) <span class="ll-dot gone"></span>종료(Shutdown)</div>
    <div class="ll-grid" data-envs></div>
    <div class="ll-log" aria-live="polite" data-log></div>`;
  const st = document.createElement('style');
  st.textContent = `.ll-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin:8px 0}
  .ll-stat{background:var(--paper);border-radius:8px;padding:6px 8px;font-size:12.5px;color:var(--muted)}.ll-stat b{display:block;font-size:17px;color:inherit}
  .ll-legend{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-bottom:6px}
  .ll-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;vertical-align:-1px}
  .ll-dot.init,.ll-env.init{background:var(--warn-soft);border-color:var(--warn)}.ll-dot.init{background:var(--warn)}
  .ll-dot.busy{background:var(--accent)}.ll-dot.frozen{background:#9BB7D4}.ll-dot.gone{background:var(--line2)}
  .ll-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:8px;min-height:84px;background:var(--paper);border-radius:8px;padding:8px}
  .ll-env{background:#fff;border:1.5px solid var(--line2);border-radius:8px;padding:6px 7px;font-size:12.5px;min-width:0}
  .ll-env.busy{border-color:var(--accent)}.ll-env.frozen{border-color:#9BB7D4;background:#F3F7FB}.ll-env.gone{opacity:.45;border-style:dashed}
  .ll-env .n{font-family:var(--mono);font-weight:700;display:flex;justify-content:space-between;gap:4px}
  .ll-env .pc{font-size:11px;font-weight:700;color:var(--accent)}
  .ll-env .s{margin-top:2px;overflow-wrap:anywhere}.ll-env .m{color:var(--muted);font-size:11.5px;overflow-wrap:anywhere}
  .ll-bar{height:5px;background:var(--line);border-radius:3px;margin-top:5px;overflow:hidden}.ll-bar i{display:block;height:100%;width:0;background:var(--accent)}
  .ll-env.init .ll-bar i{background:var(--warn)}.ll-env.frozen .ll-bar i{background:#9BB7D4}
  .ll-empty{color:var(--muted);font-size:13px;grid-column:1/-1;align-self:center}
  .ll-log{font-family:var(--mono);font-size:12.5px;background:#1F1E1B;color:#ECE8DF;border-radius:8px;padding:8px 10px;margin-top:10px;height:120px;overflow:auto;overflow-wrap:anywhere}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const now = () => performance.now();
  let S, autoTimer = null;

  function reset() {
    S = { seq: 0, rseq: 0, envs: [], cold: 0, warm: 0, thr: 0, made: 0, ended: 0, log: [] };
    q('[data-pc]').value = 0; q('[data-pco]').textContent = '0';
    q('[data-log]').innerHTML = '';
    log('초기화: 실행 환경 없음. 요청을 보내 보세요.');
  }
  function log(t) {
    S.log.push(t); if (S.log.length > 60) S.log.shift();
    const L = q('[data-log]'); L.innerHTML = S.log.map((x) => `<div>${x}</div>`).join(''); L.scrollTop = L.scrollHeight;
  }
  const alive = () => S.envs.filter((e) => e.st !== 'gone');
  function newEnv(pc) {
    const e = { id: 'E' + ++S.seq, st: 'init', pc, t0: now(), until: now() + INIT_MS, req: null, idle0: 0 };
    S.envs.push(e); S.made++; return e;
  }
  function start(e, r) { e.st = 'busy'; e.req = r; e.t0 = now(); e.until = now() + RUN_MS; }
  function request() {
    const r = 'R' + ++S.rseq;
    const free = alive().filter((e) => e.st === 'frozen').sort((a, b) => b.pc - a.pc)[0];
    if (free) {
      S.warm++; start(free, r);
      log(`${r} → ${free.id} 재사용: 웜 스타트 (${free.pc ? '프로비저닝된 환경' : '동결 상태에서 녹임'})`);
      return;
    }
    if (alive().length >= MAX_ENV) {
      S.thr++; log(`${r} → 스로틀(429): 이 데모의 동시성 한도 ${MAX_ENV}개를 모두 쓰는 중`);
      return;
    }
    const e = newEnv(false); e.req = r; S.cold++;
    log(`${r} → 쓸 환경 없음 → ${e.id} 새로 만듦: 콜드 스타트 (Init 후 실행)`);
  }
  function setPC(n) {
    q('[data-pco]').textContent = n;
    let cur = alive().filter((e) => e.pc);
    while (cur.length < n) {
      if (alive().length >= MAX_ENV) { log(`프로비저닝: 이 데모의 동시성 한도 ${MAX_ENV}개를 넘을 수 없음`); break; }
      const e = newEnv(true); cur.push(e); log(`프로비저닝: ${e.id} 미리 초기화 시작 (요청과 무관)`); }
    while (cur.length > n) {
      const e = cur.pop();
      e.pc = false;
      if (e.st === 'frozen') { e.idle0 = now(); log(`${e.id}: 프로비저닝 해제 → 이제 온디맨드 환경처럼 쉬다가 종료됨`); }
      else log(`${e.id}: 프로비저닝 해제 (지금 작업이 끝나면 온디맨드처럼 동작)`);
    }
  }
  function tick() {
    const t = now();
    for (const e of S.envs) {
      if (e.st === 'init' && t >= e.until) {
        if (e.req) { log(`${e.id}: Init 끝 → ${e.req} 처리 시작`); start(e, e.req); }
        else { e.st = 'frozen'; e.idle0 = t; log(`${e.id}: 미리 초기화 완료 → 요청 대기`); }
      } else if (e.st === 'busy' && t >= e.until) {
        log(`${e.id}: ${e.req} 처리 끝 → 동결(freeze)`);
        e.st = 'frozen'; e.req = null; e.idle0 = t;
      } else if (e.st === 'frozen' && !e.pc && t - e.idle0 >= IDLE_MS) {
        e.st = 'gone'; e.t0 = t; S.ended++;
        log(`${e.id}: 오래 쉼 → 종료(Shutdown). 다음 요청은 다시 콜드 스타트`);
      }
    }
    S.envs = S.envs.filter((e) => !(e.st === 'gone' && t - e.t0 > GONE_MS));
    render();
  }
  function render() {
    const t = now();
    q('[data-stats]').innerHTML = [
      ['콜드 스타트', S.cold], ['웜 스타트', S.warm], ['스로틀', S.thr], ['살아 있는 환경', alive().length], ['종료된 환경', S.ended],
    ].map(([k, v]) => `<div class="ll-stat">${k}<b>${v}</b></div>`).join('');
    const G = q('[data-envs]');
    if (!S.envs.length) { G.innerHTML = '<div class="ll-empty">실행 환경이 없습니다. 첫 요청은 콜드 스타트가 됩니다.</div>'; return; }
    G.innerHTML = S.envs.map((e) => {
      let s, m, p;
      if (e.st === 'init') { s = '초기화 중'; m = e.req ? `${e.req} 대기 (콜드 스타트)` : '미리 초기화'; p = (t - e.t0) / (e.until - e.t0); }
      else if (e.st === 'busy') { s = `${e.req} 처리 중`; m = '핸들러 실행'; p = (t - e.t0) / (e.until - e.t0); }
      else if (e.st === 'frozen') {
        s = '동결(대기)';
        if (e.pc) { m = '프로비저닝: 종료 안 됨'; p = 1; }
        else { const left = Math.max(0, IDLE_MS - (t - e.idle0)); m = `종료까지 ${(left / 1000).toFixed(1)}s (데모)`; p = left / IDLE_MS; }
      } else { s = '종료됨'; m = '사라지는 중'; p = 0; }
      return `<div class="ll-env ${e.st}"><div class="n">${e.id}${e.pc ? '<span class="pc">PC</span>' : ''}</div><div class="s">${s}</div><div class="m">${m}</div><div class="ll-bar"><i style="width:${Math.min(100, Math.max(0, p * 100))}%"></i></div></div>`;
    }).join('');
  }
  function setAuto(on) {
    const b = q('[data-a="auto"]');
    b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '자동 요청: 켬' : '자동 요청: 끔';
    clearTimeout(autoTimer); autoTimer = null;
    if (!on) return;
    const loop = () => {
      const k = Math.random() < 0.2 ? 3 : 1; // 화면 실험용. AWS 수치 아님 (가끔 몰리는 요청)
      for (let i = 0; i < k; i++) request();
      autoTimer = setTimeout(loop, 600 + Math.random() * 2400); // 화면 실험용. AWS 수치 아님
    };
    loop();
  }

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'one') request();
    else if (a === 'burst') { request(); request(); request(); }
    else if (a === 'auto') setAuto(b.getAttribute('aria-pressed') !== 'true');
    else if (a === 'reset') { setAuto(false); reset(); }
    render();
  });
  q('[data-pc]').addEventListener('input', (ev) => setPC(+ev.target.value));
  reset();
  render();
  const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); clearTimeout(autoTimer); return; } tick(); }, 100);
};

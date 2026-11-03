// 시뮬레이터: CodeDeploy가 Lambda 별칭의 트래픽을 원래 버전에서 새 버전으로 옮기는 모습.
// 배포 구성의 비율·대기·간격은 모두 사실 항목(F)에서 받는다. 배포 중 경보가 울리면 원래 버전으로 롤백한다.
window.SIMS = window.SIMS || {};
window.SIMS['lambda-alias-shift'] = function (root, F) {
  const v = (id) => F[id].value;
  const step = v('lambda.codedeploy.step.pct'); // 카나리 첫 단계·선형 한 단계 비율(%)
  const CONFIGS = [
    { name: 'LambdaCanary10Percent5Minutes', kind: 'canary', wait: v('lambda.codedeploy.canary.wait.5') },
    { name: 'LambdaCanary10Percent10Minutes', kind: 'canary', wait: v('lambda.codedeploy.canary.wait.10') },
    { name: 'LambdaCanary10Percent15Minutes', kind: 'canary', wait: v('lambda.codedeploy.canary.wait.15') },
    { name: 'LambdaCanary10Percent30Minutes', kind: 'canary', wait: v('lambda.codedeploy.canary.wait.30') },
    { name: 'LambdaLinear10PercentEvery1Minute', kind: 'linear', every: v('lambda.codedeploy.linear.every.1') },
    { name: 'LambdaLinear10PercentEvery2Minutes', kind: 'linear', every: v('lambda.codedeploy.linear.every.2') },
    { name: 'LambdaLinear10PercentEvery3Minutes', kind: 'linear', every: v('lambda.codedeploy.linear.every.3') },
    { name: 'LambdaLinear10PercentEvery10Minutes', kind: 'linear', every: v('lambda.codedeploy.linear.every.10') },
    { name: 'LambdaAllAtOnce', kind: 'all' },
  ];
  const TICK_MS = 350; // 화면 실험용. AWS 수치 아님 (재생할 때 1분을 보여 주는 실제 시간)

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 배포 구성별 트래픽 이동과 경보 롤백</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">배포 구성을 고르고 재생하세요. 막대 하나가 1분이고, 색칠된 높이가 새 버전으로 가는 트래픽 비율입니다. "경보"를 켜면 정한 분에 CloudWatch 경보가 울리고, 배포 중이면 CodeDeploy가 모든 트래픽을 원래 버전으로 되돌립니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f" style="max-width:100%">배포 구성 <select data-cfg style="max-width:100%">${CONFIGS.map((c, i) => `<option value="${i}">${c.name}</option>`).join('')}</select></label>
      <label class="f"><input type="checkbox" data-al> 경보 발생</label>
      <label class="f">경보 시각(분) <input type="number" min="0" step="1" value="3" data-at style="width:5em"></label>
      <button class="primary" data-a="play">재생</button>
      <button data-a="reset">처음으로</button>
    </div>
    <div class="as-chart" data-chart aria-hidden="true"></div>
    <div class="as-axis"><span>0분</span><span data-end></span></div>
    <div class="stats" data-out></div>
    <p class="note" data-desc style="overflow-wrap:anywhere"></p>
    <p class="note">사용한 사실: 한 단계 비율 ${F['lambda.codedeploy.step.pct'].display}, 카나리 대기 ${F['lambda.codedeploy.canary.wait.5'].display}~${F['lambda.codedeploy.canary.wait.30'].display}, 선형 간격 ${F['lambda.codedeploy.linear.every.1'].display}~${F['lambda.codedeploy.linear.every.10'].display}. 분 단위로 그린 근사치입니다. BeforeAllowTraffic 후크는 0분 전에, AfterAllowTraffic 후크는 이동이 끝난 뒤 실행되며 여기서는 시간을 그리지 않습니다. 이 실험은 배포 중에 울린 경보만 다룹니다.</p>`;
  const st = document.createElement('style');
  st.textContent = `.as-chart{display:flex;align-items:flex-end;gap:1px;height:120px;background:var(--paper);border-radius:8px;padding:6px;margin-top:8px;overflow:hidden}
  .as-bar{flex:1 1 0;min-width:0;height:100%;background:#D5DEE8;border-radius:2px 2px 0 0;position:relative;display:flex;align-items:flex-end}
  .as-bar i{display:block;width:100%;background:var(--accent);border-radius:2px 2px 0 0}
  .as-bar.fut{opacity:.35}.as-bar.rb i{background:var(--bad,#C0392B)}.as-bar.now{outline:2px solid var(--ink,#222);outline-offset:-1px}
  .as-axis{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}`;
  root.appendChild(st);
  const q = (s) => root.querySelector(s);
  let t = 0, timer = null;

  // 새 버전 비율(%)을 분 단위로 계산. 경보가 없을 때의 계획값
  function planned(c, m) {
    if (c.kind === 'all') return 100;
    if (c.kind === 'canary') return m < c.wait ? step : 100;
    return Math.min(100, step * (Math.floor(m / c.every) + 1));
  }
  function finishAt(c) {
    if (c.kind === 'all') return 0;
    if (c.kind === 'canary') return c.wait;
    return (Math.ceil(100 / step) - 1) * c.every;
  }
  function state() {
    const c = CONFIGS[+q('[data-cfg]').value];
    const fin = finishAt(c);
    const alarmOn = q('[data-al]').checked;
    const at = Math.max(0, Math.floor(+q('[data-at]').value || 0));
    const rollback = alarmOn && at <= fin; // 배포가 끝나기 전(이동 중) 경보만 롤백으로 그린다
    const total = Math.max(fin + 2, rollback ? at + 2 : 0, 6);
    return { c, fin, alarmOn, at, rollback, total };
  }
  function pct(s, m) { return s.rollback && m >= s.at ? 0 : planned(s.c, m); }
  function render() {
    const s = state();
    if (t > s.total - 1) t = s.total - 1;
    let bars = '';
    for (let m = 0; m < s.total; m++) {
      const p = pct(s, m);
      const cls = ['as-bar', m > t ? 'fut' : '', s.rollback && m >= s.at ? 'rb' : '', m === t ? 'now' : ''].join(' ');
      bars += `<div class="${cls}" title="${m}분: 새 버전 ${p}%"><i style="height:${Math.max(p, 0)}%"></i></div>`;
    }
    q('[data-chart]').innerHTML = bars;
    q('[data-end]').textContent = `${s.total - 1}분`;
    const p = pct(s, t);
    let status;
    if (s.rollback && t >= s.at) status = '롤백됨: 원래 버전 100%';
    else if (t >= s.fin) status = '이동 완료 (AfterAllowTraffic 후크 뒤 성공)';
    else status = '트래픽 이동 중';
    q('[data-out]').innerHTML = `
      <div class="stat"><div class="k">경과</div><div class="v">${t}분</div></div>
      <div class="stat"><div class="k">원래 버전</div><div class="v">${100 - p}%</div></div>
      <div class="stat acc"><div class="k">새 버전</div><div class="v">${p}%</div></div>
      <div class="stat ${s.rollback && t >= s.at ? 'bad' : ''}"><div class="k">상태</div><div class="v">${status}</div></div>`;
    let d;
    if (s.c.kind === 'canary') d = `카나리: 0분에 새 버전 ${step}%, ${s.c.wait}분에 나머지를 한 번에 옮깁니다.`;
    else if (s.c.kind === 'linear') d = `선형: ${s.c.every}분마다 ${step}%씩 옮겨 ${s.fin}분에 100%가 됩니다.`;
    else d = 'AllAtOnce: 0분에 모든 트래픽이 새 버전으로 갑니다. 경보가 울려 되돌리기 전까지 모든 요청이 새 코드를 탑니다.';
    if (s.alarmOn && !s.rollback) d += ` 경보 시각(${s.at}분)이 이동 완료(${s.fin}분) 뒤라서 이 실험에서는 롤백을 그리지 않습니다.`;
    if (s.rollback) d += ` ${s.at}분에 경보 → 그때까지 새 버전이 받던 ${planned(s.c, Math.max(0, s.at - 1))}% 안팎의 요청이 영향을 받았고, 그 뒤로는 원래 버전이 모두 받습니다.`;
    q('[data-desc]').textContent = d;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } q('[data-a="play"]').textContent = '재생'; }
  q('[data-a="play"]').addEventListener('click', () => {
    if (timer) { stop(); return; }
    const s = state();
    if (t >= s.total - 1) t = 0;
    q('[data-a="play"]').textContent = '멈춤';
    timer = setInterval(() => { const s2 = state(); if (t >= s2.total - 1) { stop(); return; } t++; render(); }, TICK_MS);
  });
  q('[data-a="reset"]').addEventListener('click', () => { stop(); t = 0; render(); });
  root.querySelectorAll('select,input').forEach((el) => el.addEventListener('input', () => { stop(); render(); }));
  root.querySelectorAll('input[type=checkbox]').forEach((el) => el.addEventListener('change', () => { stop(); render(); }));
  render();
};

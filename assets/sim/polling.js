// 시뮬레이터: 짧은 폴링과 긴 폴링의 요청 수 비교.
// 한 소비자가 일정 시간 동안 ReceiveMessage를 몇 번 보내고, 그중 빈 응답이 몇 번인지 그린다.
// 긴 폴링 대기 시간의 범위는 사실 항목(F)에서 받는다. 나머지 상수는 화면 실험용이다.
window.SIMS = window.SIMS || {};
window.SIMS['polling'] = function (root, F) {
  const WAIT_MAX = F['sqs.longpoll.wait.max'].value; // 긴 폴링 대기 최댓값 (사실 항목)
  const WAIT_MIN = F['sqs.longpoll.wait.min'].value; // 긴 폴링 대기 최솟값 (사실 항목)
  const SPAN = 60; // 화면 실험용. 관찰 구간 길이(초). AWS 수치 아님
  const SHORT_GAP = 1; // 화면 실험용. 짧은 폴링 루프가 요청 사이에 쉬는 시간(초)이라고 가정. AWS 수치 아님
  const MISS = 0.3; // 화면 실험용. 짧은 폴링이 일부 서버만 보느라 메시지를 놓칠 확률(가정). AWS 수치 아님
  const RATE = { min: 1, max: 20, start: 5 }; // 화면 실험용. 분당 도착 메시지 수 슬라이더. AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 소비자 1대가 보내는 수신 요청</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">위 줄의 점은 메시지가 큐에 들어온 시점입니다. 막대 하나가 <code>ReceiveMessage</code> 요청 하나입니다.
    진한 막대는 메시지를 받은 응답, 옅은 막대는 빈 응답입니다. 빨간 테두리는 메시지가 있는데도 비어 온 응답(거짓 빈 응답)입니다.
    짧은 폴링은 요청 사이에 잠깐 쉬는 루프를 가정했고, 놓칠 확률은 보기 위해 정한 값입니다. 긴 폴링 대기 시간은 ${F['sqs.longpoll.wait.min'].display}부터 ${F['sqs.longpoll.wait.max'].display}까지 고를 수 있습니다.</p>
    <div class="ctrls">
      <button class="primary" data-a="run">새 트래픽 만들기</button>
      <label class="f">분당 메시지 <input type="range" min="${RATE.min}" max="${RATE.max}" value="${RATE.start}" data-n> <b data-no></b></label>
      <label class="f">긴 폴링 대기 <input type="range" min="${WAIT_MIN}" max="${WAIT_MAX}" value="${WAIT_MAX}" data-w> <b data-wo></b></label>
      <label class="f"><input type="checkbox" checked data-miss> 짧은 폴링의 놓침 보기</label>
    </div>
    <svg class="pl-svg" viewBox="0 0 760 210" role="img" aria-label="짧은 폴링과 긴 폴링의 요청 타임라인"></svg>
    <div class="stats" data-out></div>
    <p class="note">요금은 응답이 비어 있어도 요청 1건으로 계산됩니다. 짧은 폴링과 긴 폴링의 요청 단가는 같으므로, 요청 수가 곧 비용 차이입니다.</p>`;
  const st = document.createElement('style');
  st.textContent = `.pl-svg{display:block;width:100%;height:auto;max-width:100%;background:var(--paper);border-radius:8px;margin:8px 0}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const svg = q('svg');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
  let arr = [];
  let seedMiss = [];

  function newTraffic() {
    const n = +q('[data-n]').value;
    arr = Array.from({ length: n }, () => Math.random() * (SPAN - 2) + 1).sort((a, b) => a - b);
    seedMiss = Array.from({ length: SPAN * 2 }, () => Math.random());
    draw();
  }

  // 짧은 폴링: 즉시 응답. 일부 서버만 보므로(가정) 대기 중인 메시지를 놓칠 수 있다.
  function simShort(useMiss) {
    const res = []; const pend = []; let ai = 0; let k = 0;
    for (let t = 0; t < SPAN; t += SHORT_GAP) {
      while (ai < arr.length && arr[ai] <= t) pend.push(arr[ai++]);
      const missed = useMiss && pend.length > 0 && seedMiss[k++ % seedMiss.length] < MISS;
      const got = missed ? [] : pend.splice(0);
      res.push({ s: t, e: t + 0.3, got, falseEmpty: missed });
    }
    return res;
  }
  // 긴 폴링: 모든 서버를 보고, 메시지가 오면 바로 응답, 없으면 대기 시간이 끝날 때 빈 응답.
  function simLong(wait) {
    const res = []; let t = 0; let ai = 0;
    while (t < SPAN) {
      const pend = [];
      while (ai < arr.length && arr[ai] <= t) pend.push(arr[ai++]);
      if (pend.length) { res.push({ s: t, e: t + 0.3, got: pend }); t += 0.35; continue; }
      const nxt = ai < arr.length ? arr[ai] : Infinity;
      if (nxt <= t + wait) { const got = []; while (ai < arr.length && arr[ai] <= nxt + 1e-9) got.push(arr[ai++]); res.push({ s: t, e: nxt, got }); t = nxt + 0.05; }
      else { res.push({ s: t, e: Math.min(SPAN, t + wait), got: [] }); t += wait; }
    }
    return res;
  }

  function draw() {
    const wait = +q('[data-w]').value; const useMiss = q('[data-miss]').checked;
    q('[data-no]').textContent = q('[data-n]').value;
    q('[data-wo]').textContent = wait + '초';
    const S = simShort(useMiss); const L = simLong(wait);
    svg.innerHTML = '';
    const X0 = 120, X1 = 746; const X = (v) => X0 + (X1 - X0) * Math.min(v, SPAN) / SPAN;
    const lbl = (y, t) => { const e = el('text', { x: X0 - 10, y, 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: '#3A3833' }); e.textContent = t; };
    lbl(32, '메시지 도착'); lbl(92, '짧은 폴링'); lbl(152, '긴 폴링');
    el('line', { x1: X0, x2: X1, y1: 28, y2: 28, stroke: '#CFC8BA' });
    arr.forEach((a) => el('circle', { cx: X(a), cy: 28, r: 5, fill: '#B8175A' }));
    S.forEach((r) => el('rect', { x: X(r.s), y: 76, width: Math.max(3, X(r.e) - X(r.s)), height: 26, rx: 1.5, fill: r.got.length ? '#1C1B18' : '#D8D2C5', stroke: r.falseEmpty ? '#B3261E' : 'none', 'stroke-width': 2 }));
    L.forEach((r) => el('rect', { x: X(r.s) + 1, y: 136, width: Math.max(3, X(r.e) - X(r.s) - 2), height: 26, rx: 3, fill: r.got.length ? '#1C1B18' : '#E8E3D8', stroke: r.got.length ? 'none' : '#CFC8BA' }));
    for (let s = 0; s <= SPAN; s += 10) { const e = el('text', { x: X(s), y: 196, 'text-anchor': 'middle', 'font-size': 13, fill: '#6E6A60' }); e.textContent = s + 's'; }

    const empt = (R) => R.filter((r) => !r.got.length).length;
    const fe = S.filter((r) => r.falseEmpty).length;
    const save = S.length ? Math.round((1 - L.length / S.length) * 100) : 0;
    q('[data-out]').innerHTML =
      `<div class="stat bad"><div class="k">짧은 폴링 요청 / 빈 응답</div><div class="v">${S.length} / ${empt(S)}</div></div>` +
      `<div class="stat"><div class="k">그중 거짓 빈 응답</div><div class="v">${fe}</div></div>` +
      `<div class="stat ok"><div class="k">긴 폴링 요청 / 빈 응답</div><div class="v">${L.length} / ${empt(L)}</div></div>` +
      `<div class="stat acc"><div class="k">요청 수 차이</div><div class="v">${save}% 적음</div></div>`;
  }

  root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.a === 'run') newTraffic(); });
  q('[data-n]').addEventListener('input', newTraffic);
  q('[data-w]').addEventListener('input', draw);
  q('[data-miss]').addEventListener('change', draw);
  newTraffic();
};

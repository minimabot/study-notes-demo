// 시뮬레이터: 부하 평준화(load leveling). 직접 호출과 큐를 두고 처리할 때를 비교한다.
// 유입량·처리 능력·시간은 모두 화면 실험용으로 정한 값이다. AWS 수치는 사실 항목(F)에서 받아 문장으로만 보여 준다.
window.SIMS = window.SIMS || {};
window.SIMS['load-leveling'] = function (root, F) {
  const T = 60;                        // 그래프 길이(초). 화면 실험용. AWS 수치 아님
  const BASE = 40;                     // 평소 유입량(건/초). 화면 실험용. AWS 수치 아님
  const SPIKE_FROM = 15, SPIKE_TO = 25; // 몰림 구간(초). 화면 실험용. AWS 수치 아님
  const SPIKE = { min: 80, max: 240, step: 10, start: 160 }; // 몰림 크기(건/초). 화면 실험용. AWS 수치 아님
  const CAP = { min: 50, max: 120, step: 5, start: 60 };     // 소비자 처리 능력(건/초). 화면 실험용. AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 몰려드는 요청을 누가 받아 내나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">평소에는 초당 ${BASE}건이 들어오고, ${SPIKE_FROM}~${SPIKE_TO}초 구간에 요청이 몰린다. 소비자는 정해진 속도 이상으로 처리하지 못한다.
    "직접 호출"과 "큐 사용"을 바꿔 가며 실패 건수와 큐에 쌓이는 양을 비교해 보자. 숫자는 보기 쉽게 정한 값이다.</p>
    <div class="ctrls">
      <div class="ll-seg" role="group" aria-label="방식">
        <button type="button" data-mode="direct" aria-pressed="true">직접 호출</button>
        <button type="button" data-mode="queue" aria-pressed="false">큐 사용</button>
      </div>
      <label class="f">몰림 크기 <input type="range" min="${SPIKE.min}" max="${SPIKE.max}" step="${SPIKE.step}" value="${SPIKE.start}" data-spike> <b data-spike-o></b></label>
      <label class="f">소비자 처리 능력 <input type="range" min="${CAP.min}" max="${CAP.max}" step="${CAP.step}" value="${CAP.start}" data-cap> <b data-cap-o></b></label>
    </div>
    <svg class="ll-chart" viewBox="0 0 400 220" role="img" aria-label="시간에 따른 유입량, 처리량, 큐 백로그 그래프" data-chart></svg>
    <div class="ll-legend" data-legend></div>
    <div class="stats" data-stats></div>
    <p class="note">실제 SQS 큐에 쌓아 둘 수 있는 메시지 수는 ${F['sqs.backlog.max'].display}이다. 다만 메시지는 보관 기간(기본 ${F['sqs.retention.default'].display}, 최대 ${F['sqs.retention.max'].display})이 지나면 처리 여부와 관계없이 지워진다.</p>`;

  const st = document.createElement('style');
  st.textContent = `.ll-seg{display:flex;gap:0}.ll-seg button{border-radius:0}.ll-seg button:first-child{border-radius:8px 0 0 8px}.ll-seg button:last-child{border-radius:0 8px 8px 0;margin-left:-1px}
  .ll-seg button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff;font-weight:700}
  .ll-chart{display:block;width:100%;height:auto;max-width:100%;background:var(--paper);border-radius:8px}
  .ll-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--ink2);margin:8px 0 10px}
  .ll-legend span{display:inline-flex;align-items:center;gap:6px}.ll-legend i{display:inline-block;width:14px;height:4px;border-radius:2px}
  .ll-legend i.box{height:10px;width:12px;opacity:.6}
  .lab input[type=range]{max-width:150px}`;
  root.appendChild(st);

  const NS = 'http://www.w3.org/2000/svg';
  const q = (s) => root.querySelector(s);
  const svg = q('[data-chart]');
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
  let mode = 'direct';

  function simulate(spike, cap) {
    const inc = [], proc = [], fail = [], back = [];
    let b = 0, maxB = 0, failed = 0, drainT = null, maxWait = 0;
    for (let t = 0; t <= T; t++) {
      const x = t >= SPIKE_FROM && t < SPIKE_TO ? spike : BASE;
      inc.push(x);
      if (mode === 'direct') {
        const p = Math.min(x, cap); proc.push(p);
        const f = x - p; fail.push(f); failed += f; back.push(0);
      } else {
        const avail = x + b; const p = Math.min(cap, avail);
        b = avail - p; proc.push(p); fail.push(0); back.push(b);
        if (b > maxB) maxB = b;
        maxWait = Math.max(maxWait, b / cap); // 쌓인 양을 처리 능력으로 나눈 대략적인 대기 시간
        if (t >= SPIKE_TO && b === 0 && drainT === null) drainT = t;
      }
    }
    return { inc, proc, fail, back, maxB, failed, drainT, maxWait };
  }

  function draw() {
    const spike = +q('[data-spike]').value, cap = +q('[data-cap]').value;
    q('[data-spike-o]').textContent = spike + '건/초';
    q('[data-cap-o]').textContent = cap + '건/초';
    const r = simulate(spike, cap);
    svg.innerHTML = '';
    const W = 400, H = 220, L = 34, R = 8, TP = 10, B = 24;
    const ymax = Math.max(250, spike + 20);
    const X = (t) => L + (W - L - R) * t / T;
    const Y = (v) => TP + (H - TP - B) * (1 - Math.min(v, ymax) / ymax);
    for (let v = 0; v <= ymax; v += 50) {
      el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: '#E2DDD2' });
      el('text', { x: L - 5, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6E6A60' }).textContent = v;
    }
    for (let t = 0; t <= T; t += 10) el('text', { x: X(t), y: H - 7, 'text-anchor': 'middle', 'font-size': 11, fill: '#6E6A60' }).textContent = t + '초';

    if (mode === 'queue') {
      // 백로그는 같은 축(건)으로 그린다. 축을 넘으면 위쪽에서 잘린다.
      const pts = r.back.map((v, t) => `${X(t)},${Y(v)}`);
      el('polygon', { points: `${X(0)},${Y(0)} ${pts.join(' ')} ${X(T)},${Y(0)}`, fill: '#FBE9F0', stroke: '#B8175A', 'stroke-width': 1.2 });
    } else {
      const top = r.inc.map((v, t) => `${X(t)},${Y(v)}`);
      const bot = r.proc.map((v, t) => `${X(t)},${Y(v)}`).reverse();
      el('polygon', { points: top.join(' ') + ' ' + bot.join(' '), fill: '#F3B9B4' });
    }
    el('line', { x1: L, x2: W - R, y1: Y(cap), y2: Y(cap), stroke: '#2C7A57', 'stroke-dasharray': '4 4' });
    el('polyline', { points: r.inc.map((v, t) => `${X(t)},${Y(v)}`).join(' '), fill: 'none', stroke: '#1C1B18', 'stroke-width': 1.4, 'stroke-dasharray': '2 3' });
    el('polyline', { points: r.proc.map((v, t) => `${X(t)},${Y(v)}`).join(' '), fill: 'none', stroke: '#2C7A57', 'stroke-width': 2 });

    q('[data-legend]').innerHTML =
      `<span><i style="background:#1C1B18"></i>들어온 요청</span><span><i style="background:#2C7A57"></i>처리한 요청 (최대 ${cap}건/초)</span>` +
      (mode === 'queue' ? '<span><i class="box" style="background:#B8175A"></i>큐에 쌓인 메시지</span>' : '<span><i class="box" style="background:#B3261E"></i>실패한 요청</span>');

    q('[data-stats]').innerHTML = mode === 'direct'
      ? `<div class="stat bad"><div class="k">실패한 요청</div><div class="v">${fmt(r.failed)}건</div></div>
         <div class="stat"><div class="k">소비자 상태</div><div class="v">${r.failed ? '처리 능력 초과' : '여유 있음'}</div></div>`
      : `<div class="stat"><div class="k">실패한 요청</div><div class="v">0건</div></div>
         <div class="stat acc"><div class="k">가장 많이 쌓인 양</div><div class="v">${fmt(r.maxB)}건</div></div>
         <div class="stat"><div class="k">큐가 다 비는 시점</div><div class="v">${r.drainT === null ? T + '초 이후' : r.drainT + '초'}</div></div>
         <div class="stat"><div class="k">가장 오래 기다린 메시지(대략)</div><div class="v">${r.maxWait.toFixed(1)}초</div></div>`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    mode = b.dataset.mode;
    root.querySelectorAll('button[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  q('[data-spike]').addEventListener('input', draw);
  q('[data-cap]').addEventListener('input', draw);
  draw();
};

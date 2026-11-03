// 시뮬레이터: 대상 추적 조정 정책이 부하에 따라 원하는 용량을 바꾸는 모습.
// 부하 곡선·부팅 시간·시작 직후 CPU 튀는 정도·경보 판단 횟수는 모두 화면 실험용으로 정한 값이다.
// AWS 수치(기본 인스턴스 워밍업 시작값, 기본 휴지 기간)는 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['asg-target-tracking'] = function (root, F) {
  const T = 180;          // 그래프 길이(분). 화면 실험용. AWS 수치 아님
  const MIN = 2, MAX = 20; // 그룹 최소·최대 용량(대). 화면 실험용. AWS 수치 아님
  const BOOT = 2;         // 시작 후 InService까지 걸리는 시간(분). 화면 실험용. AWS 수치 아님
  const SPIKE_LEN = 3;    // InService 직후 CPU가 튀는 시간(분). 화면 실험용. AWS 수치 아님
  const SPIKE_ADD = 45;   // 그동안 더해지는 CPU(%p). 화면 실험용. AWS 수치 아님
  const OUT_PTS = 3;      // 확장 판단에 필요한 연속 초과 횟수(분). 화면 실험용. AWS 수치 아님
  const IN_PTS = 10;      // 축소 판단에 필요한 연속 미달 횟수(분). 화면 실험용. AWS 수치 아님
  const IN_RATIO = 0.1;   // 한 번에 줄이는 최대 비율. 화면 실험용. AWS 수치 아님
  const HOT = 90;         // 과부하로 보는 CPU(%). 화면 실험용. AWS 수치 아님
  const TGT = { min: 30, max: 80, step: 5, start: 50 }; // 목표 CPU(%). 화면 실험용. AWS 수치 아님
  const warmStart = Math.round(F['ec2.asg.warmup.start'].value / 60); // 문서가 제안하는 워밍업 시작값(분)
  const WARM = { min: 0, max: 10, step: 1, start: warmStart };

  // 부하: 인스턴스 한 대가 CPU 100%일 때 처리량을 100으로 본 값. 화면 실험용. AWS 수치 아님
  const CURVES = {
    ramp: (t) => t < 30 ? 150 : t < 70 ? 150 + (t - 30) * 11.25 : t < 110 ? 600 : t < 140 ? 600 - (t - 110) * 400 / 30 : 200,
    spike: (t) => t < 40 ? 200 : t < 95 ? 560 : 200,
  };

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 대상 추적 정책은 언제 늘리고 언제 줄이나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">그룹 평균 CPU를 목표값에 맞추는 대상 추적 정책을 단순하게 흉내 낸다. 새 인스턴스는 부팅에 ${BOOT}분이 걸리고, 서비스에 들어간 직후 ${SPIKE_LEN}분 동안 CPU가 더 높게 나온다고 가정했다.
    워밍업을 0으로 두면 이 튀는 값이 지표에 섞여 필요 이상으로 늘어난다. 숫자는 보기 쉽게 정한 값이다.</p>
    <div class="ctrls">
      <div class="at-seg" role="group" aria-label="부하 모양">
        <button type="button" data-curve="ramp" aria-pressed="true">서서히 증가</button>
        <button type="button" data-curve="spike" aria-pressed="false">갑자기 증가</button>
      </div>
      <label class="f">목표 CPU <input type="range" min="${TGT.min}" max="${TGT.max}" step="${TGT.step}" value="${TGT.start}" data-tgt> <b data-tgt-o></b></label>
      <label class="f">인스턴스 워밍업 <input type="range" min="${WARM.min}" max="${WARM.max}" step="${WARM.step}" value="${WARM.start}" data-warm> <b data-warm-o></b></label>
    </div>
    <svg class="at-chart" viewBox="0 0 400 170" role="img" aria-label="시간에 따른 필요 대수, 원하는 용량, 서비스 중 인스턴스 수" data-cap></svg>
    <div class="at-legend"><span><i style="background:#6E6A60"></i>필요 대수(부하÷목표)</span><span><i style="background:#B8175A"></i>원하는 용량</span><span><i style="background:#2C7A57"></i>InService 인스턴스</span></div>
    <svg class="at-chart" viewBox="0 0 400 150" role="img" aria-label="시간에 따른 실제 평균 CPU와 정책이 본 지표" data-cpu></svg>
    <div class="at-legend"><span><i style="background:#1C1B18"></i>실제 평균 CPU</span><span><i style="background:#C26A00"></i>정책이 본 지표(워밍업 제외)</span><span><i style="background:#2C7A57"></i>목표</span></div>
    <div class="stats" data-stats></div>
    <p class="note">문서 기준: 기본 인스턴스 워밍업은 기본으로 꺼져 있고, 값을 모르면 ${F['ec2.asg.warmup.start'].display}부터 시작하라고 권한다(위 슬라이더 시작값).
    기본 휴지 기간 ${F['ec2.asg.cooldown.default'].display}은 단순 조정 정책에만 걸리고 대상 추적에는 걸리지 않는다.
    실제 정책은 CloudWatch 경보로 판단하며, 이 실험의 판단 횟수·축소 폭은 동작을 보이려고 정한 값이다.</p>`;

  const st = document.createElement('style');
  st.textContent = `.at-seg{display:flex;gap:0}.at-seg button{border-radius:0}.at-seg button:first-child{border-radius:8px 0 0 8px}.at-seg button:last-child{border-radius:0 8px 8px 0;margin-left:-1px}
  .at-seg button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff;font-weight:700}
  .at-chart{display:block;width:100%;height:auto;max-width:100%;background:var(--paper);border-radius:8px;margin-top:8px}
  .at-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--ink2);margin:6px 0 4px}
  .at-legend span{display:inline-flex;align-items:center;gap:6px}.at-legend i{display:inline-block;width:14px;height:4px;border-radius:2px}
  .lab input[type=range]{max-width:150px}`;
  root.appendChild(st);

  const NS = 'http://www.w3.org/2000/svg';
  const q = (s) => root.querySelector(s);
  let curve = 'ramp';

  function simulate(target, warm) {
    const load = CURVES[curve];
    const clamp = (n) => Math.max(MIN, Math.min(MAX, n));
    let desired = clamp(Math.ceil(load(0) / target));
    let fleet = Array.from({ length: desired }, () => ({ born: -100 })); // 처음부터 데워진 인스턴스
    let outN = 0, inN = 0, outActs = 0, inActs = 0, instMin = 0, hotMin = 0, peak = desired;
    const R = { need: [], des: [], svc: [], cpu: [], met: [] };
    for (let t = 0; t <= T; t++) {
      const L = load(t);
      const svc = fleet.filter((i) => t - i.born >= BOOT);
      const pending = fleet.length - svc.length;
      const base = svc.length ? Math.min(100, L / svc.length) : 100;
      let sumAll = 0, sumM = 0, nM = 0, warming = 0;
      svc.forEach((i) => {
        const age = t - (i.born + BOOT);
        const c = Math.min(100, base + (age < SPIKE_LEN ? SPIKE_ADD : 0));
        sumAll += c;
        if (age < warm) warming++; else { sumM += c; nM++; }
      });
      const cpu = svc.length ? sumAll / svc.length : 100;
      const M = nM ? sumM / nM : null; // 워밍업 중인 인스턴스는 지표에 넣지 않는다

      if (M !== null) {
        // 확장: 지표가 목표를 넘는 상태가 이어지면, 워밍업·부팅 중인 인스턴스도 이미 있는 용량으로 치고 필요한 만큼 올린다
        outN = M > target ? outN + 1 : 0;
        if (outN >= OUT_PTS) {
          const req = clamp(Math.ceil(svc.length * M / target));
          if (req > desired) { desired = req; outActs++; }
        }
        // 축소: 확장 중(부팅·워밍업 인스턴스가 있음)이면 막히고, 미달이 오래 이어질 때만 조금씩 줄인다
        if (pending || warming) inN = 0;
        else inN = M < target ? inN + 1 : 0;
        if (inN >= IN_PTS) {
          const req = clamp(Math.ceil(svc.length * M / target));
          if (req < desired) { desired = Math.max(req, desired - Math.max(1, Math.floor(desired * IN_RATIO))); inActs++; }
          inN = 0;
        }
      }
      // 원하는 용량에 맞춰 띄우거나 종료한다(부팅 중인 것부터 종료)
      while (fleet.length < desired) fleet.push({ born: t });
      while (fleet.length > desired) { fleet.sort((a, b) => a.born - b.born); fleet.pop(); }
      peak = Math.max(peak, desired);
      instMin += fleet.length;
      if (cpu >= HOT) hotMin++;
      R.need.push(L / target); R.des.push(desired); R.svc.push(svc.length); R.cpu.push(cpu); R.met.push(M);
    }
    return { R, outActs, inActs, instMin, hotMin, peak };
  }

  function chart(svg, H, ymax, ticks, fmtY) {
    svg.innerHTML = '';
    const W = 400, Lp = 30, Rp = 8, TP = 8, B = 20;
    const X = (t) => Lp + (W - Lp - Rp) * t / T;
    const Y = (v) => TP + (H - TP - B) * (1 - Math.min(v, ymax) / ymax);
    const el = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    ticks.forEach((v) => {
      el('line', { x1: Lp, x2: W - Rp, y1: Y(v), y2: Y(v), stroke: '#E2DDD2' });
      el('text', { x: Lp - 4, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#6E6A60' }).textContent = fmtY(v);
    });
    for (let t = 0; t <= T; t += 30) el('text', { x: X(t), y: H - 5, 'text-anchor': t === T ? 'end' : t === 0 ? 'start' : 'middle', 'font-size': 10, fill: '#6E6A60' }).textContent = t + '분';
    return {
      line: (arr, color, w, dash, step) => {
        let d = '', prev = null;
        arr.forEach((v, t) => {
          if (v === null) { prev = null; return; }
          if (prev === null) d += `M${X(t)},${Y(v)}`;
          else d += step ? `L${X(t)},${Y(prev)}L${X(t)},${Y(v)}` : `L${X(t)},${Y(v)}`;
          prev = v;
        });
        const a = { d, fill: 'none', stroke: color, 'stroke-width': w };
        if (dash) a['stroke-dasharray'] = dash;
        el('path', a);
      },
      hline: (v, color) => el('line', { x1: Lp, x2: W - Rp, y1: Y(v), y2: Y(v), stroke: color, 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }),
    };
  }

  function draw() {
    const target = +q('[data-tgt]').value, warm = +q('[data-warm]').value;
    q('[data-tgt-o]').textContent = target + '%';
    q('[data-warm-o]').textContent = warm + '분';
    const r = simulate(target, warm);
    const c1 = chart(q('[data-cap]'), 170, MAX, [0, 5, 10, 15, 20], (v) => v);
    c1.line(r.R.need, '#6E6A60', 1.4, '3 3', false);
    c1.line(r.R.des, '#B8175A', 2, null, true);
    c1.line(r.R.svc, '#2C7A57', 1.6, null, true);
    const c2 = chart(q('[data-cpu]'), 150, 100, [0, 25, 50, 75, 100], (v) => v + '%');
    c2.hline(target, '#2C7A57');
    c2.line(r.R.cpu, '#1C1B18', 1.4, null, false);
    c2.line(r.R.met, '#C26A00', 1.4, '2 2', false);
    q('[data-stats]').innerHTML =
      `<div class="stat acc"><div class="k">가장 큰 원하는 용량</div><div class="v">${r.peak}대</div></div>
       <div class="stat"><div class="k">확장 / 축소 활동</div><div class="v">${r.outActs}번 / ${r.inActs}번</div></div>
       <div class="stat"><div class="k">인스턴스 사용량(비용 대용)</div><div class="v">${r.instMin.toLocaleString('ko-KR')} 대·분</div></div>
       <div class="stat ${r.hotMin ? 'bad' : ''}"><div class="k">평균 CPU ${HOT}% 이상인 시간</div><div class="v">${r.hotMin}분</div></div>`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-curve]'); if (!b) return;
    curve = b.dataset.curve;
    root.querySelectorAll('button[data-curve]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  q('[data-tgt]').addEventListener('input', draw);
  q('[data-warm]').addEventListener('input', draw);
  draw();
};

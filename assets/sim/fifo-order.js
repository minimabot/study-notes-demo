// 시뮬레이터: 1~8번을 순서대로 보냈을 때 받는 순서.
// 표준 큐의 뒤섞임·중복은 "일어날 수 있다"를 보여 주는 무작위 예시다. 실제 빈도를 뜻하지 않는다.
window.SIMS = window.SIMS || {};
window.SIMS['fifo-order'] = function (root, F) {
  const N = 8; // 화면 실험용. AWS 수치 아님
  const SHUFFLE = 0.45; // 화면 실험용 뒤섞임 확률. AWS 수치 아님
  const DUP = 0.25; // 화면 실험용 중복 확률. AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 1~${N}번을 순서대로 보냈을 때 받는 순서</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">생산자가 1부터 ${N}까지 차례로 보낸다. 표준 큐는 최선 노력 순서(best-effort ordering)와 최소 한 번 전달이라 순서가 바뀌거나 같은 메시지가 두 번 올 수 있다(아래는 무작위 예시다).
    FIFO 큐는 같은 메시지 그룹 안에서 보낸 순서대로, 중복 없이 전달한다. 중복 제거 간격은 <b>${F['sqs.fifo.dedup.interval'].display}</b>다.</p>
    <div class="ctrls">
      <button class="primary" data-a="run">1~${N} 전송</button>
      <label class="f"><input type="checkbox" data-g> FIFO 그룹 2개로 나누기 (홀수 → A, 짝수 → B)</label>
    </div>
    <div class="fo-row"><div class="fo-l">표준 큐가 받은 순서</div><div class="fo-chips" data-std></div></div>
    <div class="fo-row"><div class="fo-l">FIFO 큐가 받은 순서</div><div class="fo-chips" data-fifo></div></div>
    <p class="muted" data-note></p>`;
  const st = document.createElement('style');
  st.textContent = `.fo-row{background:var(--paper);border-radius:8px;padding:10px;margin-bottom:8px}
  .fo-l{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px}
  .fo-chips{display:flex;flex-wrap:wrap;gap:6px;min-height:30px}
  .fo-chip{font-family:var(--mono);font-size:13px;background:#fff;border:1px solid var(--line2);border-radius:6px;padding:3px 8px;white-space:nowrap}
  .fo-chip.bad{border-color:var(--warn);background:var(--warn-soft)}
  .fo-chip.dup{border-style:dashed;border-color:var(--warn)}
  .fo-chip.gA{border-left:4px solid var(--accent)}.fo-chip.gB{border-left:4px solid var(--muted)}`;
  root.appendChild(st);
  const q = (s) => root.querySelector(s);

  function standard() {
    const a = Array.from({ length: N }, (_, i) => i + 1);
    for (let i = 0; i < N - 1; i++) if (Math.random() < SHUFFLE) [a[i], a[i + 1]] = [a[i + 1], a[i]];
    const out = [];
    for (const x of a) { out.push({ n: x }); if (Math.random() < DUP) out.push({ n: x, dup: true }); }
    return out;
  }
  function fifo(groups) {
    const all = Array.from({ length: N }, (_, i) => ({ n: i + 1, g: groups ? ((i + 1) % 2 ? 'A' : 'B') : 'A' }));
    if (!groups) return all;
    // 그룹 사이의 순서는 정해지지 않는다. 그룹 안의 순서만 유지하며 무작위로 섞는다.
    const A = all.filter((m) => m.g === 'A'), B = all.filter((m) => m.g === 'B'), out = [];
    while (A.length || B.length) out.push((!B.length || (A.length && Math.random() < 0.5) ? A : B).shift());
    return out;
  }
  function run() {
    const groups = q('[data-g]').checked;
    let maxSeen = 0;
    q('[data-std]').innerHTML = standard().map((m) => {
      const bad = !m.dup && m.n < maxSeen; maxSeen = Math.max(maxSeen, m.n);
      return `<span class="fo-chip ${m.dup ? 'dup' : bad ? 'bad' : ''}">${m.n}${m.dup ? ' (중복)' : ''}</span>`;
    }).join('');
    q('[data-fifo]').innerHTML = fifo(groups).map((m) => `<span class="fo-chip ${groups ? 'g' + m.g : ''}">${groups ? m.g + ':' : ''}${m.n}</span>`).join('');
    q('[data-note]').textContent = groups
      ? '그룹 A(1,3,5,7)와 그룹 B(2,4,6,8)는 각각 순서가 지켜진다. 두 그룹 사이의 순서는 보장되지 않는다.'
      : '모든 메시지가 같은 그룹이라 큐 전체가 한 줄로 순서대로 나온다. 대신 소비자 하나의 속도로만 흐른다.';
  }
  root.addEventListener('click', (e) => { if (e.target.closest('[data-a="run"]')) run(); });
  q('[data-g]').addEventListener('change', run);
  run();
};

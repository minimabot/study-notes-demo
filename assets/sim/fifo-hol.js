// 시뮬레이터: 메시지 그룹 안의 Head-of-line blocking과 DLQ.
// 한 단계 = 한 번의 수신·처리 시도(가시성 제한 시간이 한 번 끝나는 주기). 시간 축은 데모용이다.
window.SIMS = window.SIMS || {};
window.SIMS['fifo-hol'] = function (root, F) {
  const PER_GROUP = 5; // 화면 실험용. AWS 수치 아님
  const MAX_RECEIVE = 3; // 화면 실험용 최대 수신 횟수(maxReceiveCount). AWS 수치 아님
  const STEP_MS = 800; // 화면 실험용. AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 그룹 맨 앞 메시지가 계속 실패하면</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">차량 ID를 그룹 ID로 쓴다. 한 단계마다 그룹별로 맨 앞 메시지 하나를 받아 처리한다. 실패한 메시지는 지워지지 않아 가시성 제한 시간이 끝난 뒤 다시 받는다.
    그동안 같은 그룹의 다음 메시지는 나오지 않는다. 처리 중 메시지 한도는 실제로 <b>${F['sqs.inflight.fifo.max'].display}</b>다.</p>
    <div class="ctrls">
      <button class="primary" data-a="play">재생</button>
      <button data-a="step">한 단계</button>
      <button data-a="reset">초기화</button>
      <label class="f"><input type="checkbox" data-poison checked> A1을 계속 실패하는 메시지로</label>
      <label class="f"><input type="checkbox" data-dlq> DLQ 사용 (최대 수신 ${MAX_RECEIVE}회, 실험용 값)</label>
    </div>
    <div data-lanes></div>
    <div class="fh-lane"><div class="fh-nm">DLQ</div><div class="fh-chips" data-dlqbox></div></div>
    <p class="muted" data-note></p>`;
  const st = document.createElement('style');
  st.textContent = `.fh-lane{background:var(--paper);border-radius:8px;padding:8px 10px;margin-bottom:8px}
  .fh-nm{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between;gap:8px}
  .fh-sub{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fh-sub>div>small{display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px}
  .fh-chips{display:flex;flex-wrap:wrap;gap:5px;min-height:28px}
  .fh-chip{font-family:var(--mono);font-size:12.5px;background:#fff;border:1px solid var(--line2);border-radius:6px;padding:2px 7px;white-space:nowrap}
  .fh-chip.poison{border-color:var(--warn);background:var(--warn-soft)}.fh-chip.ok{border-color:var(--accent)}
  .fh-chip i{font-style:normal;font-size:11px;color:var(--muted);margin-left:4px}
  .fh-blk{color:var(--warn);font-weight:700}
  @media (max-width:600px){.fh-sub{grid-template-columns:1fr}}`;
  root.appendChild(st);
  const q = (s) => root.querySelector(s);
  let L, dlq, steps, timer = null;

  function reset() {
    stop();
    const poison = q('[data-poison]').checked;
    L = ['A', 'B', 'C'].map((g) => ({ g, q: Array.from({ length: PER_GROUP }, (_, i) => ({ id: g + (i + 1), rc: 0, poison: poison && g === 'A' && i === 0 })), done: [] }));
    dlq = []; steps = 0; render();
  }
  function step() {
    let any = false; steps++;
    for (const l of L) {
      if (!l.q.length) continue; any = true;
      const h = l.q[0]; h.rc++;
      if (h.poison) { if (q('[data-dlq]').checked && h.rc >= MAX_RECEIVE) dlq.push(l.q.shift()); }
      else l.done.push(l.q.shift());
    }
    if (!any) { steps--; stop(); }
    render();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; const b = q('[data-a="play"]'); if (b) b.textContent = '재생'; }
  function render() {
    q('[data-lanes]').innerHTML = L.map((l) => {
      const blocked = l.q[0] && l.q[0].poison;
      return `<div class="fh-lane"><div class="fh-nm"><span>그룹 vehicle-${l.g}</span>${blocked ? '<span class="fh-blk">막힘: 맨 앞 실패 중</span>' : ''}</div>
      <div class="fh-sub"><div><small>대기</small><div class="fh-chips">${l.q.map((m) => `<span class="fh-chip ${m.poison ? 'poison' : ''}">${m.id}${m.poison && m.rc ? `<i>실패 ${m.rc}</i>` : ''}</span>`).join('') || '<span class="muted">비어 있음</span>'}</div></div>
      <div><small>처리 완료(삭제)</small><div class="fh-chips">${l.done.map((m) => `<span class="fh-chip ok">${m.id}</span>`).join('')}</div></div></div></div>`;
    }).join('');
    q('[data-dlqbox]').innerHTML = dlq.map((m) => `<span class="fh-chip poison">${m.id}<i>수신 ${m.rc}</i></span>`).join('') || '<span class="muted">비어 있음</span>';
    const a = L[0];
    let note = `단계 ${steps}. `;
    if (a.q[0] && a.q[0].poison) note += q('[data-dlq]').checked ? `A1이 ${MAX_RECEIVE}번 수신되면 DLQ로 옮겨지고 A2부터 흐른다.` : `DLQ가 없다. 이 실험은 소비자가 계속 받기만 하고 A1을 지우지 않는다고 본다. 그러면 A1은 보존 기간(기본 ${F['sqs.retention.default'].display}, 최대 ${F['sqs.retention.max'].display}) 안에서 되풀이해 수신될 수 있고, 그동안 A2 이후는 막힌다. 실험은 만료를 생략했다. 실제로는 A1이 만료되면 처리되지 않은 채 지워지고, 뒤의 메시지도 각자 보존 기간이 끝나면 지워질 수 있다. B, C 그룹은 이 막힘의 직접 영향을 받지 않는다.`;
    else if (dlq.length) note += 'A1이 DLQ로 빠져 그룹 A가 다시 흐른다. 대신 A1은 원래 순서에서 빠졌다.';
    else note += '막힌 그룹이 없다.';
    q('[data-note]').textContent = note;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'reset') reset();
    else if (a === 'step') { stop(); if (L.every((l) => !l.q.length)) reset(); step(); }
    else if (a === 'play') {
      if (timer) { stop(); return; }
      if (L.every((l) => !l.q.length)) reset();
      timer = setInterval(step, STEP_MS); b.textContent = '일시정지';
    }
  });
  q('[data-poison]').addEventListener('change', reset);
  q('[data-dlq]').addEventListener('change', reset);
  reset();
};

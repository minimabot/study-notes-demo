// 시뮬레이터: 가시성 제한 시간 실험실.
// 시간은 데모용으로 줄인 값(초 단위 슬라이더)이다. 실제 기본값·최댓값은 사실 항목(F)에서 받아 화면에 표시만 한다.
window.SIMS = window.SIMS || {};
window.SIMS['visibility-lab'] = function (root, F) {
  const DEMO = { min: 3, max: 20, start: 8 }; // 화면 실험용 축소 시간. AWS 수치가 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 받은 메시지는 언제 다시 보이나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">메시지를 보내고 소비자 A·B로 받아 보세요. 삭제하지 않거나 "장애"를 누르면 시간이 끝난 뒤 메시지가 큐에 다시 나타납니다.
    여기 시간은 보기 쉽게 줄인 값입니다. 실제 기본값은 <b>${F['sqs.visibility.default'].display}</b>, 최대 <b>${F['sqs.visibility.max'].display}</b>입니다.</p>
    <div class="ctrls">
      <button class="primary" data-a="send">메시지 보내기</button>
      <label class="f">숨김 시간 <input type="range" min="${DEMO.min}" max="${DEMO.max}" value="${DEMO.start}" data-vt> <b data-vto></b></label>
      <button data-a="reset">초기화</button>
    </div>
    <div class="vl-grid">
      <div class="vl-zone"><div class="vl-h">큐 (보이는 메시지) <span data-qn>0</span></div><div class="vl-chips" data-q></div></div>
      <div class="vl-zone"><div class="vl-h">소비자</div><div data-c></div></div>
      <div class="vl-zone"><div class="vl-h">삭제 완료 <span data-dn>0</span> · 다시 보인 횟수 <span data-rn>0</span></div></div>
    </div>
    <div class="vl-log" aria-live="polite" data-log></div>`;
  const st = document.createElement('style');
  st.textContent = `.vl-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:10px}.vl-grid .vl-zone:last-child{grid-column:1/-1}
  .vl-zone{background:var(--paper);border-radius:8px;padding:10px;min-height:70px}.vl-h{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between}
  .vl-chips{display:flex;flex-wrap:wrap;gap:6px}.vl-chip{font-family:var(--mono);font-size:13px;background:#fff;border:1px solid var(--line2);border-radius:6px;padding:3px 8px}
  .vl-chip.back{border-color:var(--warn);background:var(--warn-soft)}
  .vl-cons{background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px}.vl-cons .row{display:flex;justify-content:space-between;font-size:14px}
  .vl-bar{height:6px;background:var(--line);border-radius:3px;margin:6px 0;overflow:hidden}.vl-bar i{display:block;height:100%;background:var(--accent);width:0}
  .vl-cons .btns{display:flex;flex-wrap:wrap;gap:6px}.vl-cons button{min-height:36px;padding:5px 10px;font-size:13px}
  .vl-log{font-family:var(--mono);font-size:12.5px;background:#1F1E1B;color:#ECE8DF;border-radius:8px;padding:8px 10px;margin-top:10px;height:110px;overflow:auto}
  @media (max-width:600px){.vl-grid{grid-template-columns:1fr}}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  let S;
  const reset = () => { S = { seq: 0, msgs: [], cons: { A: null, B: null }, deleted: 0, reappear: 0, log: [] }; q('[data-c]').innerHTML = ''; render(); };
  const now = () => performance.now();
  const vt = () => +q('[data-vt]').value;
  const log = (t) => { S.log.push(t); if (S.log.length > 40) S.log.shift(); const L = q('[data-log]'); L.innerHTML = S.log.map((x) => `<div>${x}</div>`).join(''); L.scrollTop = L.scrollHeight; };
  const visible = () => S.msgs.filter((m) => m.st === 'visible');

  function tick() {
    const t = now();
    for (const m of S.msgs) {
      if (m.st === 'inflight' && t >= m.until) {
        if (m.owner) S.cons[m.owner] = null;
        log(`⏱ ${m.id}: 숨김 시간 끝 → 다시 보임 (소비자 ${m.last}가 삭제하지 못함)`);
        m.st = 'visible'; m.back = true; m.owner = null; S.reappear++;
      }
    }
    render();
  }
  function receive(c) {
    if (S.cons[c]) return;
    const m = visible()[0];
    if (!m) { log(`소비자 ${c}: 받을 메시지 없음`); return; }
    m.st = 'inflight'; m.owner = c; m.last = c; m.rc++; m.start = now(); m.until = now() + vt() * 1000; S.cons[c] = m.id;
    log(`소비자 ${c}: ${m.id} 받음 (${m.rc}번째 수신) → ${vt()}초 동안 숨김`);
  }
  function del(c) { const m = S.msgs.find((x) => x.id === S.cons[c]); if (!m) return; m.st = 'deleted'; S.cons[c] = null; S.deleted++; log(`소비자 ${c}: ${m.id} 처리 완료 → DeleteMessage`); }
  function extend(c) { const m = S.msgs.find((x) => x.id === S.cons[c]); if (!m) return; m.until = now() + vt() * 1000; m.start = now(); log(`소비자 ${c}: ${m.id} 숨김 시간 연장 (ChangeMessageVisibility)`); }
  function crash(c) { const m = S.msgs.find((x) => x.id === S.cons[c]); if (!m) return; m.owner = null; S.cons[c] = null; log(`💥 소비자 ${c} 장애: ${m.id}는 삭제되지 않은 채 숨김 시간이 끝나기를 기다림`); }

  function render() {
    q('[data-vto]').textContent = vt() + '초';
    const vis = visible();
    q('[data-q]').innerHTML = vis.map((m) => `<span class="vl-chip ${m.back ? 'back' : ''}">${m.id}${m.back ? ' ↺' : ''}</span>`).join('') || '<span class="muted">비어 있음</span>';
    q('[data-qn]').textContent = vis.length;
    const orphans = S.msgs.filter((m) => m.st === 'inflight' && !m.owner);
    const C = q('[data-c]');
    if (!C.children.length) {
      C.innerHTML = ['A', 'B'].map((c) => `<div class="vl-cons" data-cn="${c}"><div class="row"><b>소비자 ${c}</b><span data-in></span></div><div class="vl-bar"><i></i></div>
      <div class="btns"><button data-a="r">받기</button><button data-a="d">처리 완료·삭제</button><button data-a="e">연장</button><button class="danger" data-a="x">장애</button></div></div>`).join('') + '<div class="muted" data-orph></div>';
    }
    for (const c of ['A', 'B']) {
      const el = C.querySelector(`[data-cn="${c}"]`); const m = S.msgs.find((x) => x.id === S.cons[c]);
      el.querySelector('[data-in]').textContent = m ? `${m.id} 처리 중 · 남은 숨김 ${Math.max(0, (m.until - now()) / 1000).toFixed(1)}초` : '대기';
      el.querySelector('.vl-bar i').style.width = m ? Math.min(100, ((now() - m.start) / (m.until - m.start)) * 100) + '%' : '0';
      el.querySelectorAll('button:not([data-a="r"])').forEach((b) => (b.disabled = !m));
      el.querySelector('[data-a="r"]').disabled = !!m;
    }
    C.querySelector('[data-orph]').textContent = orphans.length ? `숨겨진 채 주인 없는 메시지: ${orphans.map((m) => `${m.id}(${Math.max(0, (m.until - now()) / 1000).toFixed(1)}초)`).join(', ')}` : '';
    q('[data-dn]').textContent = S.deleted; q('[data-rn]').textContent = S.reappear;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a; const c = b.closest('[data-cn]')?.dataset.cn;
    if (a === 'send') { const m = { id: 'M' + ++S.seq, st: 'visible', rc: 0 }; S.msgs.push(m); log(`SendMessage → ${m.id}`); }
    else if (a === 'reset') { reset(); return; }
    else ({ r: receive, d: del, e: extend, x: crash })[a]?.(c);
    render();
  });
  q('[data-vt]').addEventListener('input', render);
  reset();
  setInterval(tick, 200);
};

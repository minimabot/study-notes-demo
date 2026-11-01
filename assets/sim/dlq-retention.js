// 계산기: 메시지가 DLQ에 얼마나 머무는지. Standard는 처음 들어온 시각을 유지하고, FIFO는 DLQ로 옮겨진 시각으로 새로 센다.
// 보존 기간의 최솟값·최댓값·기본값은 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['dlq-retention'] = function (root, F) {
  const DAY = 86400;
  const maxD = F['sqs.retention.max'].value / DAY;
  const defD = F['sqs.retention.default'].value / DAY;
  const START_MOVE = 3.5; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: DLQ 보존 기간 함정</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">보존 기간은 기본 ${F['sqs.retention.default'].display}, 최소 ${F['sqs.retention.min'].display}, 최대 ${F['sqs.retention.max'].display}입니다. 여기서는 일 단위로만 고릅니다.</p>
    <div class="ctrls">
      <label class="f">큐 종류 <select data-type><option value="std">Standard</option><option value="fifo">FIFO</option></select></label>
      <label class="f">원본 큐 보존(일) <input type="number" min="1" max="${maxD}" step="1" value="${defD}" data-src></label>
      <label class="f">DLQ 보존(일) <input type="number" min="1" max="${maxD}" step="1" value="${defD}" data-dlq></label>
      <label class="f">DLQ로 옮겨진 시점(처음 보낸 뒤 일) <input type="number" min="0" max="${maxD}" step="0.5" value="${START_MOVE}" data-mv></label>
    </div>
    <div data-bars style="margin:10px 0;max-width:100%"></div>
    <div class="stats" data-out></div>
    <p class="note">사용한 사실: 보존 기간 기본값 ${F['sqs.retention.default'].display}, 최솟값 ${F['sqs.retention.min'].display}, 최댓값 ${F['sqs.retention.max'].display}. 출처는 아래 "출처"에 있습니다.</p>`;
  const q = (s) => root.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (d) => d < 1 ? `${Math.round(d * 24)}시간` : `${+d.toFixed(1)}일`;
  const bar = (label, from, to, total, color) => {
    const l = (100 * from / total).toFixed(2), w = (100 * Math.max(0, to - from) / total).toFixed(2);
    return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div style="flex:0 0 64px;font-size:12.5px;font-weight:700">${label}</div><div style="position:relative;flex:1;min-width:0;height:20px;background:#F3F0EA;border-radius:4px"><div style="position:absolute;left:${l}%;width:${w}%;top:0;bottom:0;background:${color};border-radius:4px"></div></div></div>`;
  };
  const f = () => {
    const type = q('[data-type]').value;
    const src = clamp(+q('[data-src]').value || 1, 1, maxD);
    const dq = clamp(+q('[data-dlq]').value || 1, 1, maxD);
    // 원본 보존 기간이 지나면 메시지는 이미 지워졌으므로 그 뒤에는 옮겨질 수 없다
    const mv = clamp(+q('[data-mv]').value || 0, 0, src);
    const end = type === 'std' ? Math.max(mv, dq) : mv + dq;
    const stay = end - mv;
    const total = Math.max(end, src, 1);
    q('[data-bars]').innerHTML =
      bar('원본 큐', 0, mv, total, '#E9B9CB') +
      bar('DLQ', mv, end, total, stay < 1 ? '#E8A39D' : '#B9D8C2') +
      `<div style="font-size:11px;color:#6E6A60;text-align:right">가로축: 처음 보낸 때부터 ${fmt(total)}</div>`;
    let html = `<div class="stat ${stay < 1 ? 'bad' : 'ok'}"><div class="k">DLQ에 머무는 시간</div><div class="v">${stay <= 0 ? '즉시 삭제' : fmt(stay)}</div></div>` +
      `<div class="stat"><div class="k">DLQ에서 사라지는 때</div><div class="v">처음 보낸 뒤 ${fmt(end)}</div></div>`;
    if (type === 'std' && dq <= src) html += `<div class="stat acc"><div class="k">권장</div><div class="v">DLQ 보존 기간을 원본(${fmt(src)})보다 길게</div></div>`;
    if (+q('[data-mv]').value > src) html += `<div class="stat bad"><div class="k">주의</div><div class="v">원본 보존 기간이 지나 이미 삭제된 메시지는 DLQ로 갈 수 없음</div></div>`;
    q('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  f();
};

// 계산기: Lambda가 SQS를 읽을 때 큐의 가시성 제한 시간 권장값.
// 배수·최댓값·Lambda 제한 시간 최댓값은 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['vt-calc'] = function (root, F) {
  const mult = F['lambda.sqs.vt-multiplier'].value;
  const cap = F['sqs.visibility.max'].value;
  const fnMax = F['lambda.timeout.max'].value;
  const START = { fn: 30, bw: 0 }; // 입력칸 시작값(예시). AWS 수치가 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 큐의 가시성 제한 시간 권장값</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">권장식: 함수 제한 시간 × <b>${F['lambda.sqs.vt-multiplier'].display}</b> + 배치 대기 시간. 결과는 큐 최댓값(${F['sqs.visibility.max'].display})을 넘을 수 없습니다.</p>
    <div class="ctrls">
      <label class="f">함수 제한 시간(초) <input type="number" min="1" value="${START.fn}" data-fn></label>
      <label class="f">배치 대기 시간(초) <input type="number" min="0" value="${START.bw}" data-bw></label>
    </div>
    <div class="stats" data-out></div>
    <p class="note">사용한 사실: 배수 ${F['lambda.sqs.vt-multiplier'].display}, 큐 최댓값 ${F['sqs.visibility.max'].display}, Lambda 제한 시간 최댓값 ${F['lambda.timeout.max'].display}. 각 값의 출처는 아래 "출처"에 있습니다.</p>`;
  const fmt = (s) => s >= 3600 ? `${(s / 3600).toFixed(1)}시간` : s >= 60 ? `${(s / 60).toFixed(1)}분` : `${s}초`;
  const f = () => {
    const fn = Math.max(1, +root.querySelector('[data-fn]').value || 1);
    const bw = Math.max(0, +root.querySelector('[data-bw]').value || 0);
    const v = fn * mult + bw;
    let html = `<div class="stat acc"><div class="k">권장 가시성 제한 시간</div><div class="v">${Math.min(v, cap).toLocaleString()}초</div></div><div class="stat"><div class="k">읽기 쉬운 단위</div><div class="v">${fmt(Math.min(v, cap))}</div></div>`;
    if (fn > fnMax) html += `<div class="stat bad"><div class="k">주의</div><div class="v">함수 제한 시간이 Lambda 최댓값(${F['lambda.timeout.max'].display})을 넘음</div></div>`;
    if (v > cap) html += `<div class="stat bad"><div class="k">주의</div><div class="v">권장값이 큐 최댓값을 넘음 → 함수 제한 시간을 줄이세요</div></div>`;
    root.querySelector('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', f));
  f();
};

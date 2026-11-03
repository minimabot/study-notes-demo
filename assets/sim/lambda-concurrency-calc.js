// 계산기: 초당 요청 수와 평균 실행 시간으로 필요한 동시성을 구하고, 계정 동시성·동기 RPS 한도·확장 속도와 비교한다.
// 계정 동시성 기본값, 실행 환경당 동기 RPS, 확장 속도·구간, 예약하지 않은 풀 최솟값은 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['lambda-concurrency-calc'] = function (root, F) {
  const acctDefault = F['lambda.concurrency.account.default'].value; // 리전당 계정 동시성 기본 할당량
  const rpsPerEnv = F['lambda.rps-per-env.sync'].value;              // 동시성 1당 동기 RPS (한도 = 동시성 × 이 값)
  const rate = F['lambda.scaling.rate'].value;                       // 구간마다 늘어나는 실행 환경 수
  const interval = F['lambda.scaling.interval'].value;               // 확장 속도 기준 구간(초)
  const minUnres = F['lambda.concurrency.unreserved.min'].value;     // 예약 없는 함수용으로 늘 남는 동시성
  const START = { rps: 2000, ms: 300, other: 0 }; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 필요한 동시성</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">동시성 = 초당 요청 수 × 평균 실행 시간(초). 동기 호출에는 요청 수 한도(동시성 × ${F['lambda.rps-per-env.sync'].display})도 함께 걸리므로 두 조건을 모두 봅니다. 이 함수에는 예약된 동시성이 없다고 가정합니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f">초당 요청 수 <input type="number" min="0" step="1" value="${START.rps}" data-rps style="max-width:100%"></label>
      <label class="f">평균 실행 시간(ms) <input type="number" min="1" step="1" value="${START.ms}" data-ms style="max-width:100%"></label>
      <label class="f">다른 함수에 예약한 동시성 합계 <input type="number" min="0" step="1" value="${START.other}" data-other style="max-width:100%"></label>
      <label class="f">계정 동시성 한도 <input type="number" min="1" step="1" value="${acctDefault}" data-acct style="max-width:100%"></label>
    </div>
    <div class="stats" data-out></div>
    <ol class="note" data-steps style="padding-left:1.2em;overflow-wrap:anywhere"></ol>
    <p class="note">사용한 사실: 계정 동시성 기본 ${F['lambda.concurrency.account.default'].display}, 실행 환경당 동기 요청 ${F['lambda.rps-per-env.sync'].display}, 확장 속도 ${F['lambda.scaling.rate'].display}, 예약 없는 함수용 최소 ${F['lambda.concurrency.unreserved.min'].display}. 평균값으로 낸 대략의 추정이며, 확장 시간은 Lambda가 확장 여유를 연속으로 채운다는 점을 무시한 근사치입니다. 출처는 아래 "출처"에 있습니다.</p>`;
  const q = (s) => root.querySelector(s);
  const n = (x) => (Math.round(x * 100) / 100).toLocaleString();
  const f = () => {
    const rps = Math.max(0, +q('[data-rps]').value || 0);
    const ms = Math.max(1, +q('[data-ms]').value || 1);
    const acct = Math.max(1, Math.floor(+q('[data-acct]').value || acctDefault));
    let other = Math.max(0, Math.floor(+q('[data-other]').value || 0));
    const otherMax = Math.max(0, acct - minUnres);
    const otherOver = other > otherMax;
    if (otherOver) other = otherMax;
    const conc = Math.ceil(rps * ms / 1000 - 1e-9);
    const avail = acct - other;                 // 이 함수가 쓸 수 있는 예약 없는 풀(다른 예약 없는 함수와 공유)
    const rpsLimit = avail * rpsPerEnv;
    const needByRps = Math.ceil(rps / rpsPerEnv - 1e-9);
    const needEff = Math.max(conc, needByRps);  // 동시성과 요청 수 한도를 모두 만족하는 동시성
    const okConc = conc <= avail;
    const okRps = rps <= rpsLimit;
    const steps1 = Math.ceil(needEff / rate - 1e-9);
    const tScale = steps1 * interval;
    const steps = [
      `필요 동시성: ${rps.toLocaleString()} 요청/초 × ${n(ms / 1000)} 초 = ${n(rps * ms / 1000)} → 올림 <b>${conc.toLocaleString()}</b>`,
      `이 함수가 쓸 수 있는 풀: 계정 ${acct.toLocaleString()} − 다른 함수 예약 ${other.toLocaleString()} = <b>${avail.toLocaleString()}</b> (예약 없는 다른 함수와 함께 씀)`,
      `동기 요청 수 한도: ${avail.toLocaleString()} × ${rpsPerEnv} = <b>${rpsLimit.toLocaleString()}</b> 요청/초 → 요청 수 기준 필요 동시성 ${needByRps.toLocaleString()}`,
      `두 조건을 모두 만족하는 동시성: max(${conc.toLocaleString()}, ${needByRps.toLocaleString()}) = <b>${needEff.toLocaleString()}</b> → 계정 한도는 최소 ${(needEff + other).toLocaleString()} 필요`,
      `0에서 확장하는 데 걸리는 대략의 시간: ${needEff.toLocaleString()} ÷ ${rate.toLocaleString()} → ${steps1}구간 × ${interval}초 ≈ <b>${tScale.toLocaleString()}초</b>`,
    ];
    let html = `<div class="stat acc"><div class="k">필요 동시성(요청 수 한도 반영)</div><div class="v">${needEff.toLocaleString()}</div></div>`;
    html += `<div class="stat ${okConc ? '' : 'bad'}"><div class="k">동시성 한도</div><div class="v">${okConc ? '여유 있음' : '부족 → 스로틀(429)'}</div></div>`;
    html += `<div class="stat ${okRps ? '' : 'bad'}"><div class="k">동기 요청 수 한도</div><div class="v">${okRps ? '여유 있음' : '부족 → 스로틀(429)'}</div></div>`;
    html += `<div class="stat"><div class="k">확장 시간(근사)</div><div class="v">약 ${tScale.toLocaleString()}초</div></div>`;
    if (okConc && !okRps) html += `<div class="stat bad"><div class="k">주의</div><div class="v">동시성은 충분해도 실행 시간이 짧아 요청 수 한도에 먼저 걸림</div></div>`;
    if (otherOver) html += `<div class="stat bad"><div class="k">주의</div><div class="v">예약 합계는 계정 한도 − ${F['lambda.concurrency.unreserved.min'].display}까지만 가능해 그 값으로 계산함</div></div>`;
    q('[data-out]').innerHTML = html;
    q('[data-steps]').innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  };
  root.querySelectorAll('input').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

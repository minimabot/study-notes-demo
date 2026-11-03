// 계산기: 초당 요청 수와 평균 실행 시간으로 필요한 동시성을 구하고, 계정 동시성·계정 요청 수 한도와 비교하고 확장 속도를 안내한다.
// 계정 동시성 기본값, 동시성 1당 요청 수 한도, 확장 속도, 예약하지 않은 풀 최솟값은 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['lambda-concurrency-calc'] = function (root, F) {
  const acctDefault = F['lambda.concurrency.account.default'].value; // 리전당 계정 동시성 기본 할당량
  const rpsPerEnv = F['lambda.rps-per-env.sync'].value;              // 동시성 1당 동기 RPS (한도 = 동시성 × 이 값)
  const rate = F['lambda.scaling.rate'].value;                       // 구간마다 늘어나는 실행 환경 수
  const minUnres = F['lambda.concurrency.unreserved.min'].value;     // 예약 없는 함수용으로 늘 남는 동시성
  const START = { rps: 2000, ms: 300, other: 0 }; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 필요한 동시성</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">동시성 = 초당 요청 수 × 평균 실행 시간(초). 동기 호출에는 동시성이 걸린 할당량마다 요청 수 한도(동시성 1당 ${F['lambda.rps-per-env.sync'].display})도 붙으므로 두 조건을 함께 봅니다. 이 함수에는 예약된 동시성이 없다고 가정합니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f">초당 요청 수 <input type="number" min="0" step="1" value="${START.rps}" data-rps style="max-width:100%"></label>
      <label class="f">평균 실행 시간(ms) <input type="number" min="1" step="1" value="${START.ms}" data-ms style="max-width:100%"></label>
      <label class="f">다른 함수에 예약한 동시성 합계 <input type="number" min="0" step="1" value="${START.other}" data-other style="max-width:100%"></label>
      <label class="f">다른 함수들의 동기 요청 수(초당, 모르면 비움) <input type="number" min="0" step="1" value="" placeholder="모름" data-orps style="max-width:100%"></label>
      <label class="f">계정 동시성 한도 <input type="number" min="1" step="1" value="${acctDefault}" data-acct style="max-width:100%"></label>
    </div>
    <div class="stats" data-out></div>
    <ol class="note" data-steps style="padding-left:1.2em;overflow-wrap:anywhere"></ol>
    <p class="note">사용한 사실: 계정 동시성 기본 ${F['lambda.concurrency.account.default'].display}, 동시성 1당 요청 수 한도 ${F['lambda.rps-per-env.sync'].display}, 함수별 확장 속도 ${F['lambda.scaling.rate'].display}, 예약 없는 함수용 최소 ${F['lambda.concurrency.unreserved.min'].display}. 평균값으로 낸 대략의 추정입니다. 확장에 걸리는 시간은 초기 여유와 요청 도착 패턴에 따라 달라서 계산하지 않습니다. 출처는 아래 "출처"에 있습니다.</p>`;
  const q = (s) => root.querySelector(s);
  const L = (x) => x.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const f = () => {
    const rps = Math.max(0, +q('[data-rps]').value || 0);
    const ms = Math.max(1, Math.round(+q('[data-ms]').value || 1)); // 정수 ms만 사용
    const acct = Math.max(1, Math.floor(+q('[data-acct]').value || acctDefault));
    const orpsRaw = q('[data-orps]').value.trim();
    const orpsKnown = orpsRaw !== '' && isFinite(+orpsRaw);
    const orps = orpsKnown ? Math.max(0, +orpsRaw) : 0;
    let other = Math.max(0, Math.floor(+q('[data-other]').value || 0));
    const otherMax = Math.max(0, acct - minUnres);
    const otherOver = other > otherMax;
    if (otherOver) other = otherMax;
    const conc = Math.ceil(rps * ms / 1000 - 1e-9);
    const avail = acct - other;                 // 예약 없는 풀 크기(다른 예약 없는 함수와 공유)
    const acctRps = acct * rpsPerEnv;           // 문서에 명시된 계정 전체 요청 수 한도
    const totalRps = rps + orps;
    const poolRps = avail * rpsPerEnv;          // 보수적 추정. 문서에 직접 명시되지 않음
    const okConc = conc <= avail;
    let rpsCls, rpsMsg;
    if (rps > acctRps) { rpsCls = 'bad'; rpsMsg = '이 함수만으로 초과 → 스로틀(429)'; }
    else if (!orpsKnown) { rpsCls = ''; rpsMsg = '판정 불가(다른 함수 요청 수 필요)'; }
    else if (totalRps > acctRps) { rpsCls = 'bad'; rpsMsg = '합계 초과 → 스로틀(429)'; }
    else { rpsCls = ''; rpsMsg = '합계가 한도 이내'; }
    const needAcct = Math.max(conc + other, Math.ceil(totalRps / rpsPerEnv - 1e-9));
    const steps = [
      `필요 동시성: ${rps.toLocaleString()} 요청/초 × ${ms.toLocaleString()} ms ÷ 1,000 = ${L(rps * ms / 1000)} → 올림 <b>${conc.toLocaleString()}</b>`,
      `예약 없는 풀: 계정 ${acct.toLocaleString()} − 다른 함수 예약 ${other.toLocaleString()} = <b>${avail.toLocaleString()}</b> (예약 없는 다른 함수의 실제 사용분만큼 줄어듦)`,
      `계정 전체 요청 수 한도: ${acct.toLocaleString()} × ${rpsPerEnv} = <b>${acctRps.toLocaleString()}</b> 요청/초. 다른 함수의 실제 요청과 함께 씀${orpsKnown ? ` → 합계 ${L(totalRps)}` : ''}`,
      `참고(보수적 추정, 문서에 직접 명시되지 않음): 예약 없는 풀 기준 ${avail.toLocaleString()} × ${rpsPerEnv} = ${poolRps.toLocaleString()} 요청/초`,
      `계정 한도 대략의 필요량: max(동시성 ${(conc + other).toLocaleString()}, 요청 수 ${Math.ceil(totalRps / rpsPerEnv - 1e-9).toLocaleString()}) = <b>${needAcct.toLocaleString()}</b>${orpsKnown ? '' : ' (다른 함수 요청 수 0으로 둠)'}`,
      `확장 속도: 함수별 ${F['lambda.scaling.rate'].display}. 실제 확장 시간은 초기 여유·요청 패턴에 따라 달라 보장치가 없음`,
    ];
    let html = `<div class="stat acc"><div class="k">필요 동시성</div><div class="v">${conc.toLocaleString()}</div></div>`;
    html += `<div class="stat ${okConc ? '' : 'bad'}"><div class="k">동시성(예약 없는 풀)</div><div class="v">${okConc ? '풀 크기 이내(다른 함수 사용분 미반영)' : '부족 → 스로틀(429)'}</div></div>`;
    html += `<div class="stat ${rpsCls}"><div class="k">계정 요청 수 한도</div><div class="v">${rpsMsg}</div></div>`;
    if (rps > poolRps && rps <= acctRps) html += `<div class="stat"><div class="k">주의</div><div class="v">보수적 추정(풀 기준 요청 수)은 넘음. 확정 판정은 아님</div></div>`;
    if (otherOver) html += `<div class="stat bad"><div class="k">주의</div><div class="v">예약 합계는 계정 한도 − ${F['lambda.concurrency.unreserved.min'].display}까지만 가능해 그 값으로 계산함</div></div>`;
    q('[data-out]').innerHTML = html;
    q('[data-steps]').innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  };
  root.querySelectorAll('input').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

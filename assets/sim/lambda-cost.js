// 계산기: Lambda 이벤트 함수 월간 요금 추정 (요청, 실행 시간, 임시 스토리지, 프로비저닝된 동시성).
// 단가·무료 등급·메모리·스토리지 범위는 모두 사실 항목(F)에서 받는다.
// 단가의 근거는 AWS Price List API 가격표다(data/facts/lambda-cost.yaml 머리 주석 참고).
window.SIMS = window.SIMS || {};
window.SIMS['lambda-cost'] = function (root, F) {
  const p = (id) => F[id].value;
  const MEM_MIN = p('lambda.memory.min'), MEM_MAX = p('lambda.memory.max');
  const TMP_MIN = p('lambda.tmp.min'), TMP_MAX = p('lambda.tmp.max');
  const T_MAX_MS = p('lambda.timeout.max') * 1000; // 제한 시간 최댓값(ms)
  const FREE_REQ = p('lambda.free.requests'), FREE_GBS = p('lambda.free.gbs');
  const TIER1 = { x86: p('lambda.price.duration.x86.tier1'), arm: p('lambda.price.duration.arm.tier1') };
  const PRICE = {
    apne2: {
      req: p('lambda.price.request.apne2'), tmp: p('lambda.price.storage.apne2'),
      x86: { d: p('lambda.price.duration.x86.apne2'), pc: p('lambda.price.pc.x86.apne2'), pcd: p('lambda.price.pc-duration.x86.apne2') },
      arm: { d: p('lambda.price.duration.arm.apne2'), pc: p('lambda.price.pc.arm.apne2'), pcd: p('lambda.price.pc-duration.arm.apne2') },
    },
    use1: {
      req: p('lambda.price.request.use1'), tmp: p('lambda.price.storage.use1'),
      x86: { d: p('lambda.price.duration.x86.use1'), pc: p('lambda.price.pc.x86.use1'), pcd: p('lambda.price.pc-duration.x86.use1') },
      arm: { d: p('lambda.price.duration.arm.use1'), pc: p('lambda.price.pc.arm.use1'), pcd: p('lambda.price.pc-duration.arm.use1') },
    },
  };
  const REGION_NAME = { apne2: '서울(ap-northeast-2)', use1: '미국 동부 버지니아 북부(us-east-1)' }; // 표시용 이름
  const ARCH_NAME = { x86: 'x86_64', arm: 'arm64' }; // 표시용 이름
  const HOURS = 730; // 화면 계산용 가정. 한 달을 730시간으로 본다. AWS 수치 아님
  const START = { req: 5, ms: 120, mem: 512, tmp: TMP_MIN, pcN: 0, pcH: HOURS, pcShare: 100 }; // 입력칸 시작값(예시). AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: Lambda 함수 월간 요금 추정</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">기준 리전은 <b>${REGION_NAME.apne2}</b>, 단가는 <b>${F['lambda.price.offer-version'].display}</b> 기준입니다. 근사치이므로 실제 청구액은 AWS 요금 페이지나 AWS Pricing Calculator로 확인하세요.</p>
    <div class="ctrls">
      <label class="f">월 요청 수(백만 건) <input type="number" min="0" step="0.5" value="${START.req}" data-req></label>
      <label class="f">평균 청구 실행 시간(ms, 호출별 올림 후 평균) <input type="number" min="1" max="${T_MAX_MS}" step="any" value="${START.ms}" data-ms></label>
      <label class="f">메모리(MB) <input type="number" min="${MEM_MIN}" max="${MEM_MAX}" step="64" value="${START.mem}" data-mem></label>
    </div>
    <div class="ctrls">
      <label class="f">아키텍처 <select data-arch><option value="x86">x86_64</option><option value="arm">arm64</option></select></label>
      <label class="f">리전 <select data-rg><option value="apne2">서울 (기준)</option><option value="use1">us-east-1 (참고)</option></select></label>
      <label class="f">임시 스토리지(MB) <input type="number" min="${TMP_MIN}" max="${TMP_MAX}" step="512" value="${START.tmp}" data-tmp></label>
    </div>
    <div class="ctrls">
      <label class="f">프로비저닝된 동시성 <input type="number" min="0" step="1" value="${START.pcN}" data-pcn></label>
      <label class="f">켜 둔 시간(월) <input type="number" min="0" max="${HOURS}" step="1" value="${START.pcH}" data-pch></label>
      <label class="f">PC가 처리한 호출 비율(%) <input type="number" min="0" max="100" step="5" value="${START.pcShare}" data-pcs></label>
    </div>
    <div class="ctrls">
      <label class="f"><input type="checkbox" data-free checked> 무료 등급 빼기</label>
    </div>
    <div class="stats" data-out></div>
    <ul class="note lc-asm">
      <li>요청 요금 = 월 요청 수 × 요청 단가. 실행 시간(GB-초) = 요청 수 × 평균 청구 실행 시간 × 메모리(GB). 청구 실행 시간은 호출마다 ${F['lambda.billing.duration-rounding'].display}한 값이므로, 그 평균을 넣으면 다시 올리지 않고 그대로 곱한다. 콜드 스타트의 초기화 시간은 넣지 않은 근사치다. 콜드 스타트가 잦으면 실제 요금이 더 나온다.</li>
      <li>실행 시간 단가는 첫 요금 구간(x86 ${F['lambda.price.duration.x86.tier1'].display}, arm64 ${F['lambda.price.duration.arm.tier1'].display}) 값만 쓴다. 이를 넘으면 실제로는 더 싸다.</li>
      <li>무료 등급(${F['lambda.free.requests'].display}, ${F['lambda.free.gbs'].display})은 이 함수 하나가 모두 쓴다고 본다. 다른 함수가 이미 썼다면 체크를 끈다. 프로비저닝된 동시성을 켠 함수에는 무료 등급이 적용되지 않는다.</li>
      <li>임시 스토리지는 기본 ${F['lambda.tmp.min'].display}를 넘는 설정량만 실행 시간 동안 과금한다.</li>
      <li>프로비저닝된 동시성(PC) = 동시성 × 메모리(GB) × 켜 둔 시간. 실제로는 ${F['lambda.price.pc.rounding'].display}한다. PC가 처리한 호출의 실행 시간은 PC 실행 단가로, 나머지는 일반 단가로 계산한다. PC 용량을 넘는 몫은 일반 단가로 넘긴다.</li>
      <li>한 달은 ${HOURS}시간으로 본다. 데이터 전송, CloudWatch Logs, 연결 서비스(API Gateway, SQS 등) 요금은 넣지 않았다.</li>
    </ul>`;
  const st = document.createElement('style');
  st.textContent = `[data-sim="lambda-cost"] select{font:inherit;font-size:14px;padding:5px 6px;border:1px solid var(--line2);border-radius:6px;max-width:100%}
  [data-sim="lambda-cost"] .f{flex-wrap:wrap}
  [data-sim="lambda-cost"] input[type=number]{max-width:100%}
  .lc-asm{padding-left:18px}.lc-asm li{margin:0 0 4px}`;
  root.appendChild(st);

  const $ = (s) => root.querySelector(s);
  const val = (s, min, max) => Math.min(max ?? Infinity, Math.max(min, +$(s).value || 0));
  const usd = (v) => `${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')} USD`;
  const fmt = (v, d = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: d });

  // 한 아키텍처에 대한 월 요금
  const calc = (arch, x) => {
    const P = PRICE[x.rg], A = P[arch];
    const gb = x.mem / 1024;
    const gbs = x.req * (x.ms / 1000) * gb;              // 전체 실행 GB-초
    const pcCapGbs = x.pcN * gb * x.pcH * 3600;           // PC로 잡아 둔 GB-초
    let pcGbs = x.pcN > 0 ? gbs * (x.pcShare / 100) : 0;  // PC가 처리한 실행 GB-초
    const over = pcGbs > pcCapGbs;
    if (over) pcGbs = pcCapGbs;
    const odGbs = gbs - pcGbs;
    const free = x.free && x.pcN === 0;
    const billReq = Math.max(0, x.req - (free ? FREE_REQ : 0));
    const billOd = Math.max(0, odGbs - (free ? FREE_GBS : 0));
    const tmpGbs = x.req * (x.ms / 1000) * Math.max(0, x.tmp - TMP_MIN) / 1024;
    const c = {
      req: (billReq / 1e6) * P.req,
      dur: billOd * A.d,
      pcd: pcGbs * A.pcd,
      pc: pcCapGbs * A.pc,
      tmp: tmpGbs * P.tmp,
    };
    c.total = c.req + c.dur + c.pcd + c.pc + c.tmp;
    // 같은 호출을 PC 없이 일반 단가로 처리했을 때
    const noPc = (Math.max(0, x.req - (x.free ? FREE_REQ : 0)) / 1e6) * P.req + Math.max(0, gbs - (x.free ? FREE_GBS : 0)) * A.d + c.tmp;
    return { c, gbs, pcGbs, pcCapGbs, over, free, noPc };
  };

  const f = () => {
    const x = {
      req: val('[data-req]', 0) * 1e6,
      ms: val('[data-ms]', 1, T_MAX_MS), // 호출별 올림을 마친 평균이므로 다시 올리지 않는다
      mem: Math.round(val('[data-mem]', MEM_MIN, MEM_MAX)),
      tmp: Math.round(val('[data-tmp]', TMP_MIN, TMP_MAX)),
      pcN: Math.floor(val('[data-pcn]', 0)),
      pcH: val('[data-pch]', 0, HOURS),
      pcShare: val('[data-pcs]', 0, 100),
      free: $('[data-free]').checked,
      rg: $('[data-rg]').value,
    };
    const arch = $('[data-arch]').value, other = arch === 'x86' ? 'arm' : 'x86';
    const r = calc(arch, x), o = calc(other, x);
    const c = r.c;
    let html = `
      <div class="stat"><div class="k">월 실행 시간</div><div class="v">${fmt(r.gbs, 0)} GB-초</div></div>
      <div class="stat"><div class="k">요청 요금</div><div class="v">${usd(c.req)}</div></div>
      <div class="stat"><div class="k">실행 시간 요금 (일반)</div><div class="v">${usd(c.dur)}</div></div>`;
    if (x.pcN > 0) html += `
      <div class="stat"><div class="k">PC 유지 요금 (동시성 ${fmt(x.pcN)}, ${fmt(x.pcH, 1)}시간)</div><div class="v">${usd(c.pc)}</div></div>
      <div class="stat"><div class="k">PC 실행 시간 요금</div><div class="v">${usd(c.pcd)}</div></div>
      <div class="stat"><div class="k">PC 사용률 (처리한 GB-초 / 잡아 둔 GB-초)</div><div class="v">${r.pcCapGbs ? fmt((100 * r.pcGbs) / r.pcCapGbs, 1) : 0}%</div></div>`;
    if (x.tmp > TMP_MIN) html += `<div class="stat"><div class="k">임시 스토리지 추가분</div><div class="v">${usd(c.tmp)}</div></div>`;
    html += `
      <div class="stat acc"><div class="k">월 합계 (${ARCH_NAME[arch]}, ${REGION_NAME[x.rg]})</div><div class="v">${usd(c.total)}</div></div>
      <div class="stat"><div class="k">같은 실행 시간이면 ${ARCH_NAME[other]}</div><div class="v">${usd(o.c.total)}</div></div>`;
    if (x.pcN > 0) html += `<div class="stat"><div class="k">PC 없이 일반 단가로 처리하면</div><div class="v">${usd(r.noPc)}</div></div>`;
    if (x.free && x.pcN > 0) html += `<div class="stat bad"><div class="k">참고</div><div class="v">프로비저닝된 동시성을 켠 함수라 무료 등급을 빼지 않았다</div></div>`;
    if (r.over) html += `<div class="stat bad"><div class="k">주의</div><div class="v">PC가 처리한다고 넣은 실행 시간이 잡아 둔 PC 용량보다 크다. 넘는 몫은 일반 단가로 계산했다</div></div>`;
    if (r.gbs > TIER1[arch]) html += `<div class="stat bad"><div class="k">참고</div><div class="v">월 실행 시간이 첫 요금 구간(${F[`lambda.price.duration.${arch}.tier1`].display})을 넘는다. 넘는 몫은 실제로 더 낮은 단가가 붙는다</div></div>`;
    $('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

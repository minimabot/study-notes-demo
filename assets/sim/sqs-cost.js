// 계산기: 월간 SQS 요금 추정 (시제품 sqs.html의 '계산기: 월간 SQS 요금 추정'을 옮김).
// 단가·프리 티어·64 KB 조각 크기·배치 최대 개수·메시지 최대 크기·KMS 단가는 모두 사실 항목(F)에서 받는다.
// 단가의 근거는 AWS Price List API 가격표다(data/facts/sqs-cost.yaml 머리 주석 참고).
window.SIMS = window.SIMS || {};
window.SIMS['sqs-cost'] = function (root, F) {
  const CHUNK = F['sqs.billing.chunk-size'].value; // 요금 계산 조각 크기(바이트)
  const MAX_MSG = F['sqs.message.max-size'].value; // 요청 하나의 페이로드 최대(바이트)
  const BATCH_MAX = F['sqs.batch.max-messages'].value;
  const WAIT_MAX = F['sqs.longpoll.wait.max'].value;
  const FREE = F['sqs.price.free-tier.requests'].value;
  const TIER1_MAX = F['sqs.price.tier1.max'].value;
  const PRICE = { // 100만 요청당 USD
    apne2: { std: F['sqs.price.standard.apne2'].value, fifo: F['sqs.price.fifo.apne2'].value },
    use1: { std: F['sqs.price.standard.use1'].value, fifo: F['sqs.price.fifo.use1'].value },
  };
  const REGION_NAME = { apne2: '서울(ap-northeast-2)', use1: '미국 동부 버지니아 북부(us-east-1)' }; // 표시용 이름
  const KMS_PRICE = F['kms.price.requests.apne2'].value; // 1만 요청당 USD
  const KMS_FREE = F['kms.price.free-tier.requests'].value;
  const KMS_KEY = F['kms.price.key-month.apne2'].value;
  const REUSE = [F['sqs.sse.key-reuse.min'], F['sqs.sse.key-reuse.default'], F['sqs.sse.key-reuse.max']];
  const DAYS = 30; // 화면 계산용 가정. 한 달을 30일로 본다. AWS 수치 아님
  const DAY_S = 86400; // 하루의 초 수(달력 상수). AWS 수치 아님
  const SHORT_GAP = 1; // 화면 계산용 가정. 짧은 폴링 루프가 요청 사이에 쉬는 시간(초). AWS 수치 아님
  const START = { n: 100000, kb: 2, b: 1, c: 4, p: 1, cons: 1 }; // 입력칸 시작값(예시). AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 월간 SQS 요금 추정</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">기준 리전은 <b>${REGION_NAME.apne2}</b>, 단가는 <b>${F['sqs.price.offer-version'].display}</b> 기준입니다. 근사치이므로 실제 청구액은 AWS 요금 페이지나 AWS Pricing Calculator로 확인하세요.</p>
    <div class="ctrls">
      <label class="f">하루 메시지 수 <input type="number" min="0" step="10000" value="${START.n}" data-n></label>
      <label class="f">메시지 크기(KB) <input type="number" min="1" max="${Math.floor(MAX_MSG / 1024)}" value="${START.kb}" data-kb></label>
      <label class="f">배치 크기 <input type="range" min="1" max="${BATCH_MAX}" value="${START.b}" data-b> <b data-bo></b></label>
    </div>
    <div class="ctrls">
      <label class="f">큐 유형 <select data-t><option value="std">Standard</option><option value="fifo">FIFO</option></select></label>
      <label class="f">리전 <select data-r><option value="apne2">서울 (기준)</option><option value="use1">us-east-1 (참고)</option></select></label>
      <label class="f">폴링 <select data-p><option value="long">긴 폴링 (${F['sqs.longpoll.wait.max'].display} 대기)</option><option value="short">짧은 폴링 (쉬지 않고 반복)</option></select></label>
      <label class="f">소비자 수 <input type="number" min="1" max="500" value="${START.c}" data-c></label>
    </div>
    <div class="ctrls">
      <label class="f"><input type="checkbox" data-k> SSE-KMS 사용</label>
      <label class="f">데이터 키 재사용 기간 <select data-d>${REUSE.map((x, i) => `<option value="${x.value}"${i === 1 ? ' selected' : ''}>${x.display}</option>`).join('')}</select></label>
      <label class="f">보내는 주체 수 <input type="number" min="1" value="${START.p}" data-pp></label>
      <label class="f">받는 주체 수 <input type="number" min="1" value="${START.cons}" data-pc></label>
      <label class="f"><input type="checkbox" data-cmk> 고객 관리형 키</label>
    </div>
    <div class="sc-bar" data-bar></div>
    <div class="sc-leg" data-leg></div>
    <div class="stats" data-out></div>
    <ul class="note sc-asm">
      <li>메시지 1건마다 보내기·받기·삭제가 한 번씩 일어난다고 본다. 배치를 쓰면 세 동작 모두 같은 배치 크기로 묶는다고 본다.</li>
      <li>보내기와 받기는 배치 합계 페이로드를 ${F['sqs.billing.chunk-size'].display} 조각으로 나눈 수만큼 요청으로 센다. 삭제는 배치당 요청 1건으로 센다.</li>
      <li>빈 응답은 추정값이다. 소비자마다 긴 폴링이면 대기 시간마다, 짧은 폴링이면 ${SHORT_GAP}초마다 한 번 받기 요청을 보낸다고 보고, 그중 메시지를 받은 요청을 뺀 나머지를 빈 응답으로 센다.</li>
      <li>한 달은 ${DAYS}일로 계산한다. 프리 티어(${F['sqs.price.free-tier.requests'].display})는 모든 리전 합산이므로, 다른 큐가 이미 쓰고 있다면 실제 무료분은 더 적다.</li>
      <li>첫 유료 구간 단가만 쓴다. 월 요청이 ${F['sqs.price.tier1.max'].display}을 넘으면 실제로는 넘는 부분이 더 싼 단가로 계산된다.</li>
      <li>가시성 연장(ChangeMessageVisibility), 큐 속성 조회 같은 다른 API 호출, 공정 큐 추가 요금, 데이터 전송 요금(다른 리전·인터넷), S3 요금은 넣지 않았다.</li>
      <li>KMS 호출 수는 SQS 개발자 안내서의 추정식 (기간 ÷ 재사용 기간) × (2 × 보내는 주체 + 받는 주체)를 큐 하나에 적용한다. 실제는 이보다 많을 수 있다. KMS 단가는 서울 값(${F['kms.price.requests.apne2'].display})을 쓰고, KMS 프리 티어(${F['kms.price.free-tier.requests'].display})는 이 큐가 혼자 쓴다고 본다.</li>
    </ul>`;
  const st = document.createElement('style');
  st.textContent = `.sc-bar{display:flex;width:100%;max-width:100%;height:26px;border-radius:6px;overflow:hidden;background:var(--paper);margin:6px 0}
  .sc-bar span{display:block;height:100%;min-width:0}
  .sc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink2);margin:0 0 10px}
  .sc-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  [data-sim="sqs-cost"] select{font:inherit;font-size:14px;padding:5px 6px;border:1px solid var(--line2);border-radius:6px;max-width:100%}
  [data-sim="sqs-cost"] .f{flex-wrap:wrap}
  .sc-asm{padding-left:18px}.sc-asm li{margin:0 0 4px}`;
  root.appendChild(st);

  const $ = (s) => root.querySelector(s);
  const num = (s, min) => Math.max(min, Math.floor(+$(s).value || 0));
  const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
  const usd = (v) => `${v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')} USD`;

  // 한 달 요청 수를 항목별로 계산한다.
  const model = (n, bytes, b, interval, c) => {
    const calls = Math.ceil(n / b); // 하루 배치 호출 수
    const chunks = Math.ceil((b * bytes) / CHUNK);
    const send = calls * chunks, recv = calls * chunks, del = calls;
    const empty = Math.max(0, c * (DAY_S / interval) - calls);
    return { send: send * DAYS, recv: recv * DAYS, del: del * DAYS, empty: empty * DAYS, chunks };
  };
  const bill = (total, price) => (Math.max(0, total - FREE) / 1e6) * price;

  const f = () => {
    const n = num('[data-n]', 0);
    const kb = Math.min(Math.floor(MAX_MSG / 1024), num('[data-kb]', 1));
    const bytes = kb * 1024;
    let b = +$('[data-b]').value;
    $('[data-bo]').textContent = b;
    const bFit = Math.max(1, Math.floor(MAX_MSG / bytes)); // 배치 합계가 최대 크기를 넘지 않는 개수
    const over = b > bFit;
    if (over) b = bFit;
    const region = $('[data-r]').value, type = $('[data-t]').value;
    const price = PRICE[region][type];
    const interval = $('[data-p]').value === 'long' ? WAIT_MAX : SHORT_GAP;
    const c = num('[data-c]', 1);
    const m = model(n, bytes, b, interval, c);
    const total = m.send + m.recv + m.del + m.empty;
    const sqsUsd = bill(total, price);
    const base = model(n, bytes, 1, SHORT_GAP, c); // 비교 기준: 배치 없음 + 짧은 폴링
    const baseTotal = base.send + base.recv + base.del + base.empty;
    const baseUsd = bill(baseTotal, price);

    let kmsUsd = 0, kmsReq = 0;
    const kmsOn = $('[data-k]').checked;
    root.querySelectorAll('[data-d],[data-pp],[data-pc],[data-cmk]').forEach((x) => { x.disabled = !kmsOn; });
    if (kmsOn) {
      const D = +$('[data-d]').value, P = num('[data-pp]', 1), C = num('[data-pc]', 1);
      kmsReq = ((DAYS * DAY_S) / D) * (2 * P + C);
      kmsUsd = (Math.max(0, kmsReq - KMS_FREE) / 10000) * KMS_PRICE + ($('[data-cmk]').checked ? KMS_KEY : 0);
    }

    const parts = [['보내기', m.send, 'var(--ink)'], ['받기', m.recv, 'var(--ink2)'], ['삭제', m.del, 'var(--line2)'], ['빈 응답', m.empty, 'var(--bad)']];
    $('[data-bar]').innerHTML = parts.map(([t, v, col]) => `<span title="${t}" style="width:${total ? (100 * v) / total : 0}%;background:${col}"></span>`).join('');
    $('[data-leg]').innerHTML = parts.map(([t, v, col]) => `<span><i style="background:${col}"></i>${t} ${fmt(v)}</span>`).join('');

    let html = `
      <div class="stat"><div class="k">월간 요청 수</div><div class="v">${fmt(total)}</div></div>
      <div class="stat"><div class="k">요청 1건당 메시지 / 조각</div><div class="v">${b}개 / ${m.chunks}조각</div></div>
      <div class="stat acc"><div class="k">예상 SQS 월 요금 (${REGION_NAME[region]})</div><div class="v">${usd(sqsUsd)}</div></div>
      <div class="stat"><div class="k">비교: 배치 없이 짧은 폴링이면</div><div class="v">${fmt(baseTotal)}건 · ${usd(baseUsd)}</div></div>`;
    if (kmsOn) html += `<div class="stat"><div class="k">KMS 호출 수 · 요금 (서울 단가)</div><div class="v">${fmt(kmsReq)}건 · ${usd(kmsUsd)}</div></div>`;
    if (over) html += `<div class="stat bad"><div class="k">주의</div><div class="v">배치 합계가 요청 최대 크기(${F['sqs.message.max-size'].display})를 넘어 배치 크기를 ${b}개로 줄여 계산함</div></div>`;
    if (total > TIER1_MAX) html += `<div class="stat bad"><div class="k">주의</div><div class="v">월 요청이 첫 구간 상한을 넘음 → 실제 요금은 이보다 낮음</div></div>`;
    $('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

// 계산기: 항목 크기·초당 요청 수·읽기/쓰기 종류로 필요한 RCU·WCU를 구한다.
// 단위 크기(4 KB·1 KB), 최종 일관성 배수, 트랜잭션 배수, 항목 최대 크기는 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['ddb-capacity-calc'] = function (root, F) {
  const rSize = F['dynamodb.rcu.item-size'].value;      // 바이트
  const wSize = F['dynamodb.wcu.item-size'].value;      // 바이트
  const evPer = F['dynamodb.read.eventual-per-unit'].value;
  const txn = F['dynamodb.txn.unit-multiplier'].value;
  const maxItem = F['dynamodb.item.max-size'].value;    // 바이트
  const KB = 1024; // 입력 단위 환산(KB → 바이트). 문서의 KB 표기와 같은 1024 기준
  const START = { kb: 6.5, r: 100, w: 10 }; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 필요한 RCU·WCU</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">읽기는 ${F['dynamodb.rcu.item-size'].display}, 쓰기는 ${F['dynamodb.wcu.item-size'].display} 단위로 항목 크기를 <b>올림</b>한 뒤 초당 요청 수를 곱합니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f">항목 크기(KB) <input type="number" min="0.001" step="0.1" value="${START.kb}" data-kb style="max-width:100%"></label>
      <label class="f">초당 읽기 <input type="number" min="0" step="1" value="${START.r}" data-r style="max-width:100%"></label>
      <label class="f">초당 쓰기 <input type="number" min="0" step="1" value="${START.w}" data-w style="max-width:100%"></label>
      <label class="f">읽기 종류
        <select data-rt style="max-width:100%">
          <option value="eventual">최종 일관된 읽기</option>
          <option value="strong">강력한 일관된 읽기</option>
          <option value="txn">트랜잭션 읽기</option>
        </select></label>
      <label class="f">쓰기 종류
        <select data-wt style="max-width:100%">
          <option value="std">일반 쓰기</option>
          <option value="txn">트랜잭션 쓰기</option>
        </select></label>
    </div>
    <div class="stats" data-out></div>
    <ol class="note" data-steps style="padding-left:1.2em;overflow-wrap:anywhere"></ol>
    <p class="note">사용한 사실: 읽기 단위 ${F['dynamodb.rcu.item-size'].display}, 쓰기 단위 ${F['dynamodb.wcu.item-size'].display}, 최종 일관성은 단위 하나로 초당 ${F['dynamodb.read.eventual-per-unit'].display}, 트랜잭션 ${F['dynamodb.txn.unit-multiplier'].display}, 항목 최대 ${F['dynamodb.item.max-size'].display}. 출처는 아래 "출처"에 있습니다.</p>`;
  const q = (s) => root.querySelector(s);
  const n = (x) => (Math.round(x * 1000) / 1000).toLocaleString();
  const f = () => {
    const kb = Math.max(0.001, +q('[data-kb]').value || 0.001);
    const r = Math.max(0, Math.floor(+q('[data-r]').value || 0));
    const w = Math.max(0, Math.floor(+q('[data-w]').value || 0));
    const rt = q('[data-rt]').value, wt = q('[data-wt]').value;
    const bytes = Math.round(kb * KB);
    const rChunks = Math.ceil(bytes / rSize);
    const wChunks = Math.ceil(bytes / wSize);
    const rDiv = rt === 'eventual' ? evPer : 1;
    const rMul = rt === 'txn' ? txn : 1;
    const perRead = (rChunks * rMul) / rDiv;
    const rTotal = Math.ceil(perRead * r - 1e-9);
    const wMul = wt === 'txn' ? txn : 1;
    const perWrite = wChunks * wMul;
    const wTotal = perWrite * w;
    const rLabel = { eventual: '최종 일관된 읽기', strong: '강력한 일관된 읽기', txn: '트랜잭션 읽기' }[rt];
    const steps = [
      `읽기 크기: ${n(kb)} KB ÷ ${F['dynamodb.rcu.item-size'].display} = ${n(bytes / rSize)} → 올림 <b>${rChunks}</b> 단위`,
      rt === 'eventual' ? `${rLabel}: ${rChunks} ÷ ${evPer} = 요청 하나에 <b>${n(perRead)}</b> RCU`
        : rt === 'txn' ? `${rLabel}: ${rChunks} × ${txn} = 요청 하나에 <b>${n(perRead)}</b> RCU`
        : `${rLabel}: 요청 하나에 <b>${n(perRead)}</b> RCU`,
      `초당 읽기 ${r.toLocaleString()} × ${n(perRead)} = ${n(perRead * r)} → 필요 RCU <b>${rTotal.toLocaleString()}</b>`,
      `쓰기 크기: ${n(kb)} KB ÷ ${F['dynamodb.wcu.item-size'].display} = ${n(bytes / wSize)} → 올림 <b>${wChunks}</b> 단위`,
      wt === 'txn' ? `트랜잭션 쓰기: ${wChunks} × ${txn} = 요청 하나에 <b>${perWrite}</b> WCU` : `일반 쓰기: 요청 하나에 <b>${perWrite}</b> WCU`,
      `초당 쓰기 ${w.toLocaleString()} × ${perWrite} = 필요 WCU <b>${wTotal.toLocaleString()}</b>`,
    ];
    let html = `<div class="stat acc"><div class="k">필요 RCU</div><div class="v">${rTotal.toLocaleString()}</div></div><div class="stat acc"><div class="k">필요 WCU</div><div class="v">${wTotal.toLocaleString()}</div></div>`;
    if (bytes > maxItem) html += `<div class="stat bad"><div class="k">주의</div><div class="v">항목 최대 크기(${F['dynamodb.item.max-size'].display})를 넘어 저장할 수 없음</div></div>`;
    q('[data-out]').innerHTML = html;
    q('[data-steps]').innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  };
  root.querySelectorAll('input,select').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

// 계산기: 같은 필터를 Query와 Scan에 걸었을 때 읽는 양과 돌려받는 양 비교.
// 페이지 최대 크기, 읽기 단위 크기, 최종 일관성 배수, 항목 최대 크기는 사실 항목(F)에서 받는다.
// 읽기 용량은 페이지마다 읽은 크기 합을 읽기 단위 크기로 올림해 계산한 근사치다.
window.SIMS = window.SIMS || {};
window.SIMS['ddb-query-vs-scan'] = function (root, F) {
  const PAGE = F['dynamodb.query.page.max'].value;     // 호출 한 번이 읽는 최대 바이트
  const RU = F['dynamodb.rcu.item-size'].value;        // 읽기 단위 하나가 처리하는 크기
  const EV = F['dynamodb.read.eventual-per-unit'].value; // 최종 일관성 읽기는 이 배수만큼 싸다
  const ITEM_MAX = F['dynamodb.item.max-size'].value;
  // 입력칸 시작값(예시). AWS 수치가 아님
  const START = { items: 100000, customers: 1000, kb: 2, pct: 10 };
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: Query와 Scan에 같은 필터를 걸면</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">주문 테이블(파티션 키 = 고객 ID)에서 "상태 = SHIPPED" 필터를 건다고 하자. Query는 고객 한 명의 주문만 읽고, Scan은 테이블 전체를 읽는다. 필터는 읽은 <b>뒤에</b> 적용되므로 읽기 용량은 "읽은 양"으로 계산된다. 호출 한 번은 최대 <b>${F['dynamodb.query.page.max'].display}</b>를 읽는다.</p>
    <div class="ctrls qs-ctrls">
      <label class="f">전체 항목 수 <input type="number" min="1" value="${START.items}" data-items></label>
      <label class="f">고객 수 <input type="number" min="1" value="${START.customers}" data-cust></label>
      <label class="f">항목 크기(KB) <input type="number" min="0.1" step="0.1" value="${START.kb}" data-kb></label>
      <label class="f">필터 통과 비율(%) <input type="number" min="0" max="100" value="${START.pct}" data-pct></label>
    </div>
    <div class="qs-grid" data-out></div>
    <p class="note">읽기 용량은 최종 일관성 읽기(기본값) 기준 근사치다. 사용한 사실: 페이지 ${F['dynamodb.query.page.max'].display}, 읽기 단위 ${F['dynamodb.rcu.item-size'].display}, 최종 일관성 ${F['dynamodb.read.eventual-per-unit'].display}/단위, 항목 최대 ${F['dynamodb.item.max-size'].display}. 출처는 아래 "출처"에 있다.</p>`;
  const st = document.createElement('style');
  st.textContent = `.qs-ctrls{display:grid;grid-template-columns:1fr 1fr;gap:8px}.qs-ctrls input{width:100%;box-sizing:border-box}
  .qs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .qs-card{background:var(--paper);border-radius:8px;padding:10px;min-width:0}.qs-card h4{margin:0 0 6px;font-size:14px}
  .qs-row{display:flex;justify-content:space-between;gap:6px;font-size:13px;padding:2px 0}.qs-row b{font-family:var(--mono);text-align:right}
  .qs-bar{height:8px;background:var(--line);border-radius:4px;margin:6px 0;overflow:hidden;position:relative}
  .qs-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--line2)}.qs-bar u{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}
  .qs-warn{grid-column:1/-1;font-size:13px;color:var(--warn)}
  @media (max-width:600px){.qs-grid,.qs-ctrls{grid-template-columns:1fr}}`;
  root.appendChild(st);
  const n = (v) => Math.round(v).toLocaleString();
  const calc = (read, size, pct) => {
    const bytes = read * size;
    const perPage = Math.max(1, Math.floor(PAGE / size)); // 한 페이지에 들어가는 항목 수
    const pages = Math.max(1, Math.ceil(read / perPage));
    let units = 0;
    for (let left = read; left > 0; left -= perPage) units += Math.ceil(Math.min(left, perPage) * size / RU);
    return { read, ret: read * pct / 100, pages, rcu: units / EV, bytes };
  };
  const card = (title, r, total) => {
    const w = total ? Math.max(1, (r.read / total) * 100) : 0;
    const wr = total ? (r.ret / total) * 100 : 0;
    return `<div class="qs-card"><h4>${title}</h4>
      <div class="qs-bar" title="회색: 읽은 양, 색: 돌려받은 양"><i style="width:${w}%"></i><u style="width:${wr}%"></u></div>
      <div class="qs-row"><span>읽은 항목 (ScannedCount)</span><b>${n(r.read)}</b></div>
      <div class="qs-row"><span>돌려받은 항목 (Count)</span><b>${n(r.ret)}</b></div>
      <div class="qs-row"><span>필요한 호출(페이지) 수</span><b>${n(r.pages)}</b></div>
      <div class="qs-row"><span>읽기 용량 단위(근사)</span><b>${r.rcu.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b></div></div>`;
  };
  const f = () => {
    const items = Math.max(1, Math.floor(+root.querySelector('[data-items]').value || 1));
    const cust = Math.min(items, Math.max(1, Math.floor(+root.querySelector('[data-cust]').value || 1)));
    let size = Math.max(0.1, +root.querySelector('[data-kb]').value || 0.1) * 1024;
    const pct = Math.min(100, Math.max(0, +root.querySelector('[data-pct]').value || 0));
    let warn = '';
    if (size > ITEM_MAX) { size = ITEM_MAX; warn = `항목 크기는 최대 ${F['dynamodb.item.max-size'].display}이므로 그 값으로 계산했다.`; }
    const q = calc(Math.ceil(items / cust), size, pct);
    const s = calc(items, size, pct);
    root.querySelector('[data-out]').innerHTML = card('Query (고객 한 명)', q, items) + card('Scan (테이블 전체)', s, items) +
      `<div class="qs-warn">${warn} 필터 통과 비율을 바꿔도 두 쪽의 읽기 용량은 그대로다. 줄이려면 읽는 범위 자체를 키나 인덱스로 좁혀야 한다.</div>`;
  };
  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', f));
  f();
};

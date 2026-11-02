// 계산기: DynamoDB 월간 요금 추정 (온디맨드 vs 프로비저닝, Standard vs Standard-IA).
// 단가·프리 티어·단위 크기·최종적 일관성 비율·Auto Scaling 권장 목표는 모두 사실 항목(F)에서 받는다.
// 단가의 근거는 AWS Price List API 가격표다(data/facts/dynamodb-cost.yaml 머리 주석 참고).
window.SIMS = window.SIMS || {};
window.SIMS['ddb-cost'] = function (root, F) {
  const RCU_SIZE = F['dynamodb.rcu.item-size'].value; // 읽기 단위 하나의 크기(바이트)
  const WCU_SIZE = F['dynamodb.wcu.item-size'].value; // 쓰기 단위 하나의 크기(바이트)
  const EVENTUAL = F['dynamodb.read.eventual-per-unit'].value; // 최종적 일관성이면 단위 하나로 읽는 횟수
  const ITEM_MAX = F['dynamodb.item.max-size'].value; // 항목 최대 크기(바이트)
  const TARGET = F['dynamodb.autoscaling.target.recommended'].value; // 권장 목표 사용률(%)
  const FREE_GB = F['dynamodb.price.free-tier.storage'].value;
  const FREE_CU = F['dynamodb.price.free-tier.capacity'].value;
  const BREAKEVEN = F['dynamodb.tableclass.ia-breakeven'].value;
  const p = (id) => F[id].value;
  const PRICE = { // od: 100만 단위당 USD, prov: 단위-시간당 USD, gb: GB-월당 USD
    apne2: {
      std: { odR: p('dynamodb.price.od.read.std.apne2'), odW: p('dynamodb.price.od.write.std.apne2'), rcu: p('dynamodb.price.prov.rcu.std.apne2'), wcu: p('dynamodb.price.prov.wcu.std.apne2'), gb: p('dynamodb.price.storage.std.apne2') },
      ia: { odR: p('dynamodb.price.od.read.ia.apne2'), odW: p('dynamodb.price.od.write.ia.apne2'), rcu: p('dynamodb.price.prov.rcu.ia.apne2'), wcu: p('dynamodb.price.prov.wcu.ia.apne2'), gb: p('dynamodb.price.storage.ia.apne2') },
      pitr: p('dynamodb.price.pitr.apne2'),
    },
    use1: {
      std: { odR: p('dynamodb.price.od.read.std.use1'), odW: p('dynamodb.price.od.write.std.use1'), rcu: p('dynamodb.price.prov.rcu.std.use1'), wcu: p('dynamodb.price.prov.wcu.std.use1'), gb: p('dynamodb.price.storage.std.use1') },
      ia: { odR: p('dynamodb.price.od.read.ia.use1'), odW: p('dynamodb.price.od.write.ia.use1'), rcu: p('dynamodb.price.prov.rcu.ia.use1'), wcu: p('dynamodb.price.prov.wcu.ia.use1'), gb: p('dynamodb.price.storage.ia.use1') },
      pitr: p('dynamodb.price.pitr.us-east-1'),
    },
  };
  const REGION_NAME = { apne2: '서울(ap-northeast-2)', use1: '미국 동부 버지니아 북부(us-east-1)' }; // 표시용 이름
  const CLASS_NAME = { std: 'Standard', ia: 'Standard-IA' };
  const HOURS = 730; // 화면 계산용 가정. 한 달을 730시간으로 본다. AWS 수치 아님
  const START = { r: 200, w: 50, kb: 2, gb: 500, rep: 1, peak: 2 }; // 입력칸 시작값(예시). AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: DynamoDB 월간 요금 추정</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">기준 리전은 <b>${REGION_NAME.apne2}</b>, 단가는 <b>${F['dynamodb.price.offer-version'].display}</b> 기준입니다. 근사치이므로 실제 청구액은 AWS 요금 페이지나 AWS Pricing Calculator로 확인하세요.</p>
    <div class="ctrls">
      <label class="f">평균 읽기/초 <input type="number" min="0" step="10" value="${START.r}" data-r></label>
      <label class="f">평균 쓰기/초 <input type="number" min="0" step="10" value="${START.w}" data-w></label>
      <label class="f">항목 크기(KB) <input type="number" min="0.1" max="${ITEM_MAX / 1024}" step="0.1" value="${START.kb}" data-kb></label>
      <label class="f">읽기 일관성 <select data-c><option value="ev">최종적 일관성</option><option value="st">강력한 일관성</option></select></label>
    </div>
    <div class="ctrls">
      <label class="f">저장(GB) <input type="number" min="0" step="10" value="${START.gb}" data-gb></label>
      <label class="f">테이블 클래스 <select data-tc><option value="std">Standard</option><option value="ia">Standard-IA</option></select></label>
      <label class="f">리전 <select data-rg><option value="apne2">서울 (기준)</option><option value="use1">us-east-1 (참고)</option></select></label>
      <label class="f">리플리카 수 <input type="number" min="1" max="10" value="${START.rep}" data-rep></label>
    </div>
    <div class="ctrls">
      <label class="f">최고치/평균 <input type="number" min="1" max="20" step="0.5" value="${START.peak}" data-pk></label>
      <label class="f">목표 사용률(%) <input type="number" min="${F['dynamodb.autoscaling.target.min'].value}" max="${F['dynamodb.autoscaling.target.max'].value}" value="${TARGET}" data-u></label>
      <label class="f"><input type="checkbox" data-as checked> Auto Scaling</label>
      <label class="f"><input type="checkbox" data-pitr> PITR</label>
      <label class="f"><input type="checkbox" data-free> 프리 티어 적용</label>
    </div>
    <div data-bars></div>
    <div class="stats" data-out></div>
    <ul class="note dc-asm">
      <li>읽기 단위 = 항목 크기를 ${F['dynamodb.rcu.item-size'].display}로 나눠 올림한 값. 최종적 일관성이면 그 절반(${F['dynamodb.read.eventual-per-unit'].display})으로 본다. 쓰기 단위 = 항목 크기를 ${F['dynamodb.wcu.item-size'].display}로 나눠 올림한 값. 트랜잭션, GSI 쓰기, 스트림, DAX, 백업 보관, 데이터 전송은 넣지 않았다.</li>
      <li>요청은 한 달 내내 입력한 평균으로 고르게 온다고 본다. 한 달은 ${HOURS}시간으로 계산한다.</li>
      <li>프로비저닝: Auto Scaling을 켜면 평균 소비량 ÷ 목표 사용률만큼, 끄면 최고치(평균 × 최고치/평균) ÷ 목표 사용률만큼을 한 달 내내 잡아 둔다고 본다. 실제 Auto Scaling은 시간대마다 용량을 바꾸므로 결과가 다르다.</li>
      <li>리플리카 수가 2 이상이면 글로벌 테이블로 보고, 모든 리플리카의 쓰기를 복제 쓰기 단위(rWCU, 기준 가격표에서 일반 쓰기와 같은 단가)로, 저장을 리플리카마다 센다. rWCU 무료 구간은 일반 WCU와 별도로 표시되며, 여기서는 rWCU 합계에서 한 번만 뺀다. 모든 리플리카에 선택한 리전 단가를 쓴다. 읽기는 입력한 값 전체를 한 번만 센다.</li>
      <li>프리 티어(Standard만: 저장 ${F['dynamodb.price.free-tier.storage'].display}, ${F['dynamodb.price.free-tier.capacity'].display})는 이 테이블 하나가 혼자 쓴다고 보고 한 번만 뺀다. Standard-IA에는 무료 구간이 없다.</li>
      <li>PITR은 저장 GB에 PITR 단가를 곱한다(첫 리플리카만). 예약 용량 할인은 넣지 않았다. 예약은 Standard 프로비저닝에만 적용된다.</li>
    </ul>`;
  const st = document.createElement('style');
  st.textContent = `[data-sim="ddb-cost"] select{font:inherit;font-size:14px;padding:5px 6px;border:1px solid var(--line2);border-radius:6px;max-width:100%}
  [data-sim="ddb-cost"] .f{flex-wrap:wrap}
  .dc-row{margin:6px 0 10px}.dc-row .k{font-size:13px;color:var(--ink2);margin-bottom:3px}
  .dc-bar{display:flex;width:100%;max-width:100%;height:22px;border-radius:6px;overflow:hidden;background:var(--paper)}
  .dc-bar span{display:block;height:100%;min-width:0}
  .dc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink2);margin:4px 0 0}
  .dc-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  .dc-asm{padding-left:18px}.dc-asm li{margin:0 0 4px}`;
  root.appendChild(st);

  const $ = (s) => root.querySelector(s);
  const val = (s, min) => Math.max(min, +$(s).value || 0);
  const usd = (v) => `${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')} USD`;
  const fmt = (v) => Math.round(v).toLocaleString('ko-KR');

  // 한 클래스·한 모드의 월 요금을 항목별로 계산한다.
  const calc = (o, cls, mode) => {
    const P = PRICE[o.region][cls];
    const free = o.free && cls === 'std';
    const secs = HOURS * 3600;
    const rUnits = o.rps * o.ru, wUnits = o.wps * o.wu; // 초당 소비 단위
    let read, write, units = null;
    if (mode === 'od') {
      read = ((rUnits * secs) / 1e6) * P.odR;
      write = ((wUnits * o.rep * secs) / 1e6) * P.odW;
    } else {
      const k = o.autoscale ? 1 : o.peak;
      const rcu = Math.ceil((rUnits * k) / (o.util / 100));
      const wcu = Math.ceil((wUnits * k) / (o.util / 100));
      units = { rcu, wcu };
      read = Math.max(0, rcu - (free ? FREE_CU : 0)) * HOURS * P.rcu;
      // 글로벌 테이블(리플리카 2 이상)은 모든 리플리카 쓰기를 복제 쓰기 단위(rWCU)로 센다.
      // 가격표상 rWCU는 WCU와 단가가 같고 무료 구간이 따로 있다. 합계에서 무료분을 한 번만 뺀다(단순화).
      const wTotal = wcu * o.rep;
      write = Math.max(0, wTotal - (free ? FREE_CU : 0)) * HOURS * P.wcu;
    }
    const storage = Math.max(0, o.gb * o.rep - (free ? FREE_GB : 0)) * P.gb;
    const pitr = o.pitr ? o.gb * PRICE[o.region].pitr : 0;
    return { read, write, storage, pitr, total: read + write + storage + pitr, units };
  };

  const f = () => {
    const kb = Math.min(ITEM_MAX / 1024, val('[data-kb]', 0.1));
    const bytes = kb * 1024;
    const strong = $('[data-c]').value === 'st';
    const o = {
      rps: val('[data-r]', 0), wps: val('[data-w]', 0), gb: val('[data-gb]', 0),
      rep: Math.floor(val('[data-rep]', 1)), peak: val('[data-pk]', 1),
      util: Math.min(F['dynamodb.autoscaling.target.max'].value, Math.max(F['dynamodb.autoscaling.target.min'].value, val('[data-u]', 1))),
      autoscale: $('[data-as]').checked, pitr: $('[data-pitr]').checked, free: $('[data-free]').checked,
      region: $('[data-rg]').value,
      ru: Math.ceil(bytes / RCU_SIZE) / (strong ? 1 : EVENTUAL),
      wu: Math.ceil(bytes / WCU_SIZE),
    };
    const cls = $('[data-tc]').value, other = cls === 'std' ? 'ia' : 'std';
    const od = calc(o, cls, 'od'), pv = calc(o, cls, 'pv');
    const odO = calc(o, other, 'od'), pvO = calc(o, other, 'pv');

    const parts = (c) => [['읽기', c.read, 'var(--ink)'], ['쓰기', c.write, 'var(--ink2)'], ['저장', c.storage, 'var(--line2)'], ['PITR', c.pitr, 'var(--bad)']];
    const max = Math.max(od.total, pv.total) || 1;
    const bar = (t, c) => `<div class="dc-row"><div class="k">${t}: <b>${usd(c.total)}</b></div>
      <div class="dc-bar" style="width:${(100 * c.total) / max}%">${parts(c).map(([n, v, col]) => `<span title="${n}" style="width:${c.total ? (100 * v) / c.total : 0}%;background:${col}"></span>`).join('')}</div></div>`;
    $('[data-bars]').innerHTML = bar(`온디맨드 (${CLASS_NAME[cls]})`, od) + bar(`프로비저닝 (${CLASS_NAME[cls]})`, pv)
      + `<div class="dc-leg">${parts(od).map(([n, , col]) => `<span><i style="background:${col}"></i>${n}</span>`).join('')}</div>`;

    // 저장 비용 ÷ 처리량 비용 (Standard 기준, 문서의 IA 판단 기준)
    const s = calc(o, 'std', 'od'), sp = calc(o, 'std', 'pv');
    const ratio = (c) => (c.read + c.write ? (100 * c.storage) / (c.read + c.write) : Infinity);
    const rOd = ratio(s), rPv = ratio(sp);
    const pct = (r) => (r === Infinity ? '처리량 0' : `${Math.round(r)}%`);

    let html = `
      <div class="stat"><div class="k">읽기·쓰기 1건당 단위</div><div class="v">읽기 ${o.ru} · 쓰기 ${o.wu}</div></div>
      <div class="stat acc"><div class="k">온디맨드 월 요금 (${REGION_NAME[o.region]})</div><div class="v">${usd(od.total)}</div></div>
      <div class="stat acc"><div class="k">프로비저닝 월 요금 (RCU ${fmt(pv.units.rcu)} · WCU ${fmt(pv.units.wcu)})</div><div class="v">${usd(pv.total)}</div></div>
      <div class="stat"><div class="k">${CLASS_NAME[other]}였다면 (온디맨드 / 프로비저닝)</div><div class="v">${usd(odO.total)} / ${usd(pvO.total)}</div></div>
      <div class="stat"><div class="k">Standard 기준 저장 ÷ 처리량 비용 (온디맨드 / 프로비저닝)</div><div class="v">${pct(rOd)} / ${pct(rPv)}</div></div>`;
    if (Math.min(rOd, rPv) > BREAKEVEN) html += `<div class="stat"><div class="k">참고</div><div class="v">저장 비용이 처리량 비용의 ${F['dynamodb.tableclass.ia-breakeven'].display}를 넘음 → Standard-IA 검토 대상</div></div>`;
    if (cls === 'ia' && o.free) html += `<div class="stat bad"><div class="k">주의</div><div class="v">Standard-IA에는 프리 티어가 적용되지 않음</div></div>`;
    $('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

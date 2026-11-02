// 계산기: Kinesis Data Streams 월간 요금 추정 (온디맨드 표준 vs 프로비저닝).
// 단가·단위 크기·샤드 용량·보존 구간·향상된 팬아웃 한도는 모두 사실 항목(F)에서 받는다.
// 단가의 근거는 AWS Price List API 가격표다(data/facts/kinesis-cost.yaml 머리 주석 참고).
window.SIMS = window.SIMS || {};
window.SIMS['kds-cost'] = function (root, F) {
  const p = (id) => F[id].value;
  const wMB = p('kinesis.shard.write');           // 샤드당 초당 쓰기 MB
  const wRec = p('kinesis.shard.write-records');  // 샤드당 초당 쓰기 레코드 수
  const rMB = p('kinesis.shard.read');            // 샤드당 공유 읽기 MB
  const PUT_KB = p('kinesis.price.put-unit.size'); // PUT 페이로드 단위 크기(KB)
  const ROUND_B = p('kinesis.price.od.ingest-rounding'); // 온디맨드 수집 올림 단위(바이트)
  const RET_DEF_H = p('kinesis.retention.default') / 3600; // 기본 보존(시간)
  const RET_EXT_H = p('kinesis.retention.extended-tier') / 3600; // 연장 보존 구간 끝(시간)
  const RET_MAX_H = p('kinesis.retention.max') / 3600; // 최대 보존(시간)
  const EFO_MAX = p('kinesis.efo.consumers.max');
  const OD_READX = p('kinesis.ondemand.read-multiplier');
  const PRICE = {
    apne2: {
      shardHr: p('kinesis.price.shard-hour.apne2'), put: p('kinesis.price.put-unit.apne2'), extHr: p('kinesis.price.extended-shard-hour.apne2'),
      efoHr: p('kinesis.price.efo-shard-hour.apne2'), efoGB: p('kinesis.price.efo-retrieval.apne2'), lt: p('kinesis.price.longterm-storage.apne2'),
      odStream: p('kinesis.price.od.stream-hour.apne2'), odIn: p('kinesis.price.od.ingest.apne2'), odOut: p('kinesis.price.od.retrieval.apne2'),
      odEfo: p('kinesis.price.od.efo-retrieval.apne2'), odExt: p('kinesis.price.od.extended-retention.apne2'),
    },
    use1: {
      shardHr: p('kinesis.price.shard-hour.use1'), put: p('kinesis.price.put-unit.use1'), extHr: p('kinesis.price.extended-shard-hour.use1'),
      efoHr: p('kinesis.price.efo-shard-hour.use1'), efoGB: p('kinesis.price.efo-retrieval.use1'), lt: p('kinesis.price.longterm-storage.use1'),
      odStream: p('kinesis.price.od.stream-hour.use1'), odIn: p('kinesis.price.od.ingest.use1'), odOut: p('kinesis.price.od.retrieval.use1'),
      odEfo: p('kinesis.price.od.efo-retrieval.use1'), odExt: p('kinesis.price.od.extended-retention.use1'),
    },
  };
  const REGION_NAME = { apne2: '서울(ap-northeast-2)', use1: '미국 동부 버지니아 북부(us-east-1)' }; // 표시용 이름
  const KB = 1024, MB = KB * KB, GB = MB * KB; // 단위 환산. 요금 페이지 예시와 같은 1024 기준
  const HOURS = 730; // 화면 계산용 가정. 한 달을 730시간으로 본다. AWS 수치 아님
  const START = { r: 1000, kb: 2, pk: 2, sh: 1, efo: 0, ret: RET_DEF_H }; // 입력칸 시작값(예시). AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: Kinesis Data Streams 월간 요금 추정</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">기준 리전은 <b>${REGION_NAME.apne2}</b>, 단가는 <b>${F['kinesis.price.offer-version'].display}</b> 기준입니다. 근사치이므로 실제 청구액은 AWS 요금 페이지나 AWS Pricing Calculator로 확인하세요.</p>
    <div class="ctrls">
      <label class="f">평균 레코드/초 <input type="number" min="0" step="100" value="${START.r}" data-r></label>
      <label class="f">평균 레코드 크기(KB) <input type="number" min="0.01" step="0.1" value="${START.kb}" data-kb></label>
      <label class="f">최고치/평균 <input type="number" min="1" max="20" step="0.5" value="${START.pk}" data-pk></label>
    </div>
    <div class="ctrls">
      <label class="f">공유 소비자 수 <input type="number" min="0" max="20" step="1" value="${START.sh}" data-sh></label>
      <label class="f">EFO 소비자 수 <input type="number" min="0" max="${EFO_MAX}" step="1" value="${START.efo}" data-efo></label>
      <label class="f">보존 기간(시간) <input type="number" min="${RET_DEF_H}" max="${RET_MAX_H}" step="24" value="${START.ret}" data-ret></label>
    </div>
    <div class="ctrls">
      <label class="f">리전 <select data-rg><option value="apne2">서울 (기준)</option><option value="use1">us-east-1 (참고)</option></select></label>
      <label class="f"><input type="checkbox" data-agg> KPL 집계</label>
    </div>
    <div data-bars></div>
    <div class="stats" data-out></div>
    <ul class="note kc-asm">
      <li>레코드는 한 달 내내 입력한 평균으로 고르게 온다고 본다. 한 달은 ${HOURS}시간으로 계산한다. 온디맨드 표준만 다룬다(On-demand Advantage 제외).</li>
      <li>프로비저닝 샤드 수 = 최고치(평균 × 최고치/평균) 기준으로 쓰기 데이터 양(${F['kinesis.shard.write'].display}, 레코드 크기는 KB 올림), 쓰기 레코드 수(${F['kinesis.shard.write-records'].display}), 공유 소비자 읽기(${F['kinesis.shard.read'].display}) 중 가장 큰 값. 키 분포가 고르다고 본다. 샤드 수는 한 달 내내 고정이다.</li>
      <li>PUT 페이로드 단위 = 레코드마다 크기를 ${F['kinesis.price.put-unit.size'].display}로 나눠 올림. 온디맨드 수집량 = ${F['kinesis.price.od.ingest-rounding'].display}. 조회량은 실제 크기로, 소비자마다 전체 데이터를 한 번씩 읽는다고 본다.</li>
      <li>KPL 집계를 켜면, ${F['kinesis.price.put-unit.size'].display}보다 작은 레코드가 ${F['kinesis.price.put-unit.size'].display} 크기 Kinesis 레코드로 빈틈없이 묶인다고 본다. 실제 묶음 크기는 KPL 설정과 버퍼 시간에 따라 다르다.</li>
      <li>보존: 기본값(${F['kinesis.retention.default'].display})을 넘으면 프로비저닝은 모든 샤드 시간에 연장 보존 요금, 온디맨드는 기본값 초과 ~ ${F['kinesis.retention.extended-tier'].display} 구간 저장 GB에 GB-월 요금. ${F['kinesis.retention.extended-tier'].display}를 넘는 저장분은 두 모드 모두 장기 보존 GB-월 요금. 저장량은 실제 크기로 계산한다. 장기 보존 데이터 조회 요금은 넣지 않았다(소비자가 최신 데이터만 읽는다고 본다).</li>
      <li>프로비저닝 EFO = 소비자 수 × 샤드 수 × 시간 + 조회 GB. 온디맨드 EFO = 조회 GB만. KMS, 데이터 전송, Lambda·Firehose 같은 연결 서비스 요금은 넣지 않았다.</li>
    </ul>`;
  const st = document.createElement('style');
  st.textContent = `[data-sim="kds-cost"] select{font:inherit;font-size:14px;padding:5px 6px;border:1px solid var(--line2);border-radius:6px;max-width:100%}
  [data-sim="kds-cost"] .f{flex-wrap:wrap}
  [data-sim="kds-cost"] input[type=number]{max-width:100%}
  .kc-row{margin:6px 0 10px}.kc-row .k{font-size:13px;color:var(--ink2);margin-bottom:3px}
  .kc-bar{display:flex;width:100%;max-width:100%;height:22px;border-radius:6px;overflow:hidden;background:var(--paper)}
  .kc-bar span{display:block;height:100%;min-width:0}
  .kc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink2);margin:4px 0 0}
  .kc-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  .kc-asm{padding-left:18px}.kc-asm li{margin:0 0 4px}`;
  root.appendChild(st);

  const $ = (s) => root.querySelector(s);
  const val = (s, min, max) => Math.min(max ?? Infinity, Math.max(min, +$(s).value || 0));
  const usd = (v) => `${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')} USD`;
  const fmt = (v, d = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: d });
  const COLORS = { base: 'var(--ink)', put: 'var(--ink2)', read: 'var(--line2)', ret: 'var(--bad)', efo: 'var(--acc, #6a8)' };
  const NAMES = { base: '샤드·스트림 시간', put: 'PUT 단위·수집', read: '조회', ret: '보존', efo: '향상된 팬아웃' };

  const f = () => {
    const rps = val('[data-r]', 0), kb = val('[data-kb]', 0.01), peak = val('[data-pk]', 1, 20);
    const nSh = Math.floor(val('[data-sh]', 0, 20)), nEfo = Math.floor(val('[data-efo]', 0, EFO_MAX));
    const ret = val('[data-ret]', RET_DEF_H, RET_MAX_H);
    const agg = $('[data-agg]').checked && kb < PUT_KB; // 단위보다 큰 레코드는 묶지 않는다
    const P = PRICE[$('[data-rg]').value];
    const secs = HOURS * 3600;
    const inB = rps * kb * KB;                         // 실제 초당 바이트
    const kdsRps = agg ? inB / (PUT_KB * KB) : rps;    // Kinesis에 들어가는 초당 레코드 수
    const kdsKB = agg ? PUT_KB : kb;                   // Kinesis 레코드 하나의 크기(KB)
    const outGBm = (inB * secs) / GB;                  // 소비자 하나가 한 달에 읽는 GB

    // 프로비저닝 샤드 수
    const sW = Math.ceil((peak * kdsRps * Math.ceil(kdsKB)) / KB / wMB - 1e-9);
    const sRec = Math.ceil((peak * kdsRps) / wRec - 1e-9);
    const sR = nSh ? Math.ceil((peak * nSh * inB) / MB / rMB - 1e-9) : 0;
    const shards = Math.max(1, sW, sRec, sR);
    const why = shards === sR && sR > Math.max(sW, sRec) ? '공유 소비자 읽기' : sRec >= sW ? '쓰기 레코드 수' : '쓰기 데이터 양';

    // 보존 구간별 평균 저장 GB
    const extH = Math.max(0, Math.min(ret, RET_EXT_H) - RET_DEF_H);
    const ltH = Math.max(0, ret - RET_EXT_H);
    const extGB = (inB * extH * 3600) / GB, ltGB = (inB * ltH * 3600) / GB;

    const putUnits = kdsRps * Math.ceil(kdsKB / PUT_KB - 1e-9) * secs;
    const pv = {
      base: shards * HOURS * P.shardHr,
      put: (putUnits / 1e6) * P.put,
      read: 0,
      ret: (ret > RET_DEF_H ? shards * HOURS * P.extHr : 0) + ltGB * P.lt,
      efo: nEfo * shards * HOURS * P.efoHr + nEfo * outGBm * P.efoGB,
    };
    const inGBod = (kdsRps * Math.ceil((kdsKB * KB) / ROUND_B - 1e-9) * ROUND_B * secs) / GB;
    const od = {
      base: HOURS * P.odStream,
      put: inGBod * P.odIn,
      read: nSh * outGBm * P.odOut,
      ret: extGB * P.odExt + ltGB * P.lt,
      efo: nEfo * outGBm * P.odEfo,
    };
    const tot = (c) => Object.values(c).reduce((a, b) => a + b, 0);
    const tPv = tot(pv), tOd = tot(od), max = Math.max(tPv, tOd) || 1;
    const bar = (t, c, total) => `<div class="kc-row"><div class="k">${t}: <b>${usd(total)}</b></div>
      <div class="kc-bar" style="width:${(100 * total) / max}%">${Object.keys(NAMES).map((k) => `<span title="${NAMES[k]}" style="width:${total ? (100 * c[k]) / total : 0}%;background:${COLORS[k]}"></span>`).join('')}</div></div>`;
    $('[data-bars]').innerHTML = bar('온디맨드 표준', od, tOd) + bar(`프로비저닝 (샤드 ${fmt(shards)}개)`, pv, tPv)
      + `<div class="kc-leg">${Object.keys(NAMES).map((k) => `<span><i style="background:${COLORS[k]}"></i>${NAMES[k]}</span>`).join('')}</div>`;

    const cheaper = tPv < tOd ? `프로비저닝이 ${fmt(tOd / (tPv || 1), 1)}배 싸다` : `온디맨드가 ${fmt(tPv / (tOd || 1), 1)}배 싸다`;
    let html = `
      <div class="stat"><div class="k">평균 쓰기 (최고치)</div><div class="v">${fmt(inB / MB, 2)} MB/s (${fmt((peak * inB) / MB, 2)} MB/s)</div></div>
      <div class="stat"><div class="k">Kinesis 레코드/초${agg ? ' (집계 후)' : ''}</div><div class="v">${fmt(kdsRps, 1)}</div></div>
      <div class="stat acc"><div class="k">온디맨드 표준 월 요금</div><div class="v">${usd(tOd)}</div></div>
      <div class="stat acc"><div class="k">프로비저닝 월 요금 (샤드 ${fmt(shards)}개, 기준: ${why})</div><div class="v">${usd(tPv)}</div></div>
      <div class="stat"><div class="k">비교</div><div class="v">${cheaper}</div></div>
      <div class="stat"><div class="k">월 PUT 페이로드 단위 (프로비저닝)</div><div class="v">${fmt(putUnits / 1e6, 1)} 백만</div></div>`;
    if (nSh > OD_READX) html += `<div class="stat bad"><div class="k">주의 (온디맨드)</div><div class="v">온디맨드 GetRecords 읽기 처리량은 ${F['kinesis.ondemand.read-multiplier'].display}이다. 공유 소비자 ${nSh}개가 모두 읽으면 이를 넘어 읽기 스로틀이 날 수 있다. 향상된 팬아웃을 검토한다.</div></div>`;
    if ($('[data-agg]').checked && !agg) html += `<div class="stat"><div class="k">참고</div><div class="v">레코드가 ${F['kinesis.price.put-unit.size'].display} 이상이라 집계 효과를 넣지 않았다</div></div>`;
    $('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

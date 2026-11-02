// 계산기: 평균 레코드 크기·초당 레코드 수·소비자 수·소비자 종류로 프로비저닝 모드에 필요한 샤드 수를 구한다.
// 샤드 쓰기 용량(데이터 양·레코드 수), 공유 읽기 용량, 향상된 팬아웃 처리량·소비자 수, 레코드 최대 크기는 모두 사실 항목(F)에서 받는다.
window.SIMS = window.SIMS || {};
window.SIMS['kds-shard-calc'] = function (root, F) {
  const wMB = F['kinesis.shard.write'].value;          // 샤드당 초당 쓰기 MB
  const wRec = F['kinesis.shard.write-records'].value; // 샤드당 초당 쓰기 레코드 수
  const rMB = F['kinesis.shard.read'].value;           // 샤드당 공유 읽기 MB
  const efoMB = F['kinesis.efo.throughput'].value;     // 향상된 팬아웃 소비자 하나의 샤드당 MB
  const efoMax = F['kinesis.efo.consumers.max'].value; // 향상된 팬아웃 소비자 등록 수
  const maxRec = F['kinesis.record.max-size'].value;   // 바이트
  const KB = 1024; // 단위 환산(MB → KB, KB → 바이트). 개발자 안내서의 샤드 계산식과 같은 1024 기준
  const START = { kb: 3.2, r: 600, c: 3 }; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 프로비저닝 샤드 수</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">레코드 크기를 KB 단위로 <b>올림</b>한 뒤, 쓰기(데이터 양·레코드 수)와 읽기 중 가장 많은 샤드가 필요한 쪽을 고릅니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f">평균 레코드 크기(KB) <input type="number" min="0.001" step="0.1" value="${START.kb}" data-kb style="max-width:100%"></label>
      <label class="f">초당 쓰는 레코드 수 <input type="number" min="0" step="1" value="${START.r}" data-r style="max-width:100%"></label>
      <label class="f">소비자 수 <input type="number" min="1" step="1" value="${START.c}" data-c style="max-width:100%"></label>
      <label class="f">소비자 종류
        <select data-t style="max-width:100%">
          <option value="shared">공유 처리량(GetRecords)</option>
          <option value="efo">향상된 팬아웃(SubscribeToShard)</option>
        </select></label>
    </div>
    <div class="stats" data-out></div>
    <ol class="note" data-steps style="padding-left:1.2em;overflow-wrap:anywhere"></ol>
    <p class="note">사용한 사실: 샤드 쓰기 ${F['kinesis.shard.write'].display}, 샤드 공유 읽기 ${F['kinesis.shard.read'].display}, 향상된 팬아웃 소비자 하나당 ${F['kinesis.efo.throughput'].display}(등록 ${F['kinesis.efo.consumers.max'].display}), 레코드 최대 ${F['kinesis.record.max-size'].display}. 최고치 기준으로 넣고, 키 분포가 고르다고 가정한 값입니다. 출처는 아래 "출처"에 있습니다.</p>`;
  const q = (s) => root.querySelector(s);
  const n = (x) => (Math.round(x * 1000) / 1000).toLocaleString();
  const f = () => {
    const kb = Math.max(0.001, +q('[data-kb]').value || 0.001);
    const r = Math.max(0, Math.floor(+q('[data-r]').value || 0));
    const c = Math.max(1, Math.floor(+q('[data-c]').value || 1));
    const t = q('[data-t]').value;
    const kbUp = Math.ceil(kb - 1e-9);
    const writeKB = kbUp * r;
    const sWriteMB = Math.ceil(writeKB / (wMB * KB) - 1e-9);
    const sWriteRec = Math.ceil(r / wRec - 1e-9);
    let sRead, readLine;
    if (t === 'shared') {
      const readKB = writeKB * c;
      sRead = Math.ceil(readKB / (rMB * KB) - 1e-9);
      readLine = `읽기(공유): 쓰기 ${writeKB.toLocaleString()} KB/s × 소비자 ${c} = ${readKB.toLocaleString()} KB/s → ÷ ${(rMB * KB).toLocaleString()} KB/s(샤드 하나를 모든 소비자가 나눠 씀) = ${n(readKB / (rMB * KB))} → 올림 <b>${sRead}</b>`;
    } else {
      sRead = Math.ceil(writeKB / (efoMB * KB) - 1e-9);
      readLine = `읽기(향상된 팬아웃): 소비자마다 샤드당 ${(efoMB * KB).toLocaleString()} KB/s를 따로 받으므로 소비자 수를 곱하지 않음 → ${writeKB.toLocaleString()} ÷ ${(efoMB * KB).toLocaleString()} = ${n(writeKB / (efoMB * KB))} → 올림 <b>${sRead}</b>`;
    }
    const need = Math.max(1, sWriteMB, sWriteRec, sRead);
    const by = need === sWriteMB ? '쓰기 데이터 양' : need === sWriteRec ? '쓰기 레코드 수' : need === sRead ? '읽기' : '최소 1';
    const steps = [
      `레코드 크기 ${n(kb)} KB → KB 단위로 올림 <b>${kbUp}</b> KB`,
      `쓰기 대역폭: ${kbUp} KB × 초당 ${r.toLocaleString()}건 = <b>${writeKB.toLocaleString()}</b> KB/s`,
      `쓰기(데이터 양): ${writeKB.toLocaleString()} ÷ ${(wMB * KB).toLocaleString()} KB/s = ${n(writeKB / (wMB * KB))} → 올림 <b>${sWriteMB}</b>`,
      `쓰기(레코드 수): ${r.toLocaleString()} ÷ ${wRec.toLocaleString()} = ${n(r / wRec)} → 올림 <b>${sWriteRec}</b>`,
      readLine,
      `가장 큰 값 = 필요한 샤드 <b>${need.toLocaleString()}</b> (결정 요인: ${by})`,
    ];
    let html = `<div class="stat acc"><div class="k">필요한 샤드</div><div class="v">${need.toLocaleString()}</div></div><div class="stat"><div class="k">쓰기 / 레코드 / 읽기</div><div class="v">${sWriteMB} / ${sWriteRec} / ${sRead}</div></div>`;
    if (t === 'efo' && c > efoMax) html += `<div class="stat bad"><div class="k">주의</div><div class="v">향상된 팬아웃 소비자 등록 한도(${F['kinesis.efo.consumers.max'].display})를 넘음</div></div>`;
    if (t === 'shared' && c > 1) html += `<div class="stat"><div class="k">참고</div><div class="v">공유 소비자는 읽기 용량과 호출 횟수를 나눠 씀. 소비자가 여럿이면 향상된 팬아웃도 검토</div></div>`;
    if (kb * KB > maxRec) html += `<div class="stat bad"><div class="k">주의</div><div class="v">레코드 최대 크기(${F['kinesis.record.max-size'].display})를 넘어 쓸 수 없음</div></div>`;
    q('[data-out]').innerHTML = html;
    q('[data-steps]').innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  };
  root.querySelectorAll('input,select').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

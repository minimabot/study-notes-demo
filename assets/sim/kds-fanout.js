// 시뮬레이터: 샤드 하나, 소비자 N개. 공유 처리량과 향상된 팬아웃의 소비자별 읽기 몫 비교.
// AWS 수치는 사실 항목(F)에서만 받는다. 슬라이더 범위는 화면 실험용 값이다.
window.SIMS = window.SIMS || {};
window.SIMS['kds-fanout'] = function (root, F) {
  const READ = F['kinesis.shard.read'].value;          // 샤드 공유 읽기 MB/s
  const TPS = F['kinesis.getrecords.tps'].value;       // 샤드당 GetRecords 호출/초 (공유 합)
  const EFO = F['kinesis.efo.throughput'].value;       // 향상된 팬아웃 소비자당 MB/s
  const EFO_MAX = F['kinesis.efo.consumers.max'].value; // 스트림당 등록 가능 소비자 수
  const WRITE = F['kinesis.shard.write'].value;        // 샤드 쓰기 MB/s (쓰기 속도 슬라이더 상한)
  const DEMO = { nMax: 24, nStart: 3, wSteps: 10 };    // 화면 실험용. AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 소비자가 늘면 각자 얼마나 읽나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">샤드 하나에 소비자 애플리케이션을 붙여 보세요. 공유 처리량에서는 샤드의 읽기 <b>${F['kinesis.shard.read'].display}</b>와
    GetRecords <b>${F['kinesis.getrecords.tps'].display}</b>를 모두가 나눠 씁니다. 향상된 팬아웃에서는 소비자마다 <b>${F['kinesis.efo.throughput'].display}</b>를 따로 받습니다.</p>
    <div class="ctrls">
      <label class="f">방식 <select data-mode><option value="shared">공유 처리량</option><option value="efo">향상된 팬아웃</option></select></label>
      <label class="f">소비자 수 <input type="range" min="1" max="${DEMO.nMax}" value="${DEMO.nStart}" data-n> <b data-no></b></label>
      <label class="f">쓰기 속도 <input type="range" min="1" max="${DEMO.wSteps}" value="${DEMO.wSteps}" data-w> <b data-wo></b></label>
    </div>
    <div class="kf-sum" data-sum></div>
    <div class="kf-list" data-list></div>
    <p class="muted kf-note" data-note></p>`;
  const st = document.createElement('style');
  st.textContent = `.kf-sum{background:var(--paper);border-radius:8px;padding:10px;font-size:14px;margin:8px 0;line-height:1.6}
  .kf-list{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
  .kf-row{display:grid;grid-template-columns:4.2em 1fr;gap:8px;align-items:center;font-size:13px}
  .kf-row .nm{font-family:var(--mono);color:var(--muted)}
  .kf-bar{position:relative;height:22px;background:var(--line);border-radius:4px;overflow:hidden;min-width:0}
  .kf-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}
  .kf-bar u{position:absolute;top:0;bottom:0;width:2px;background:#1F1E1B;text-decoration:none}
  .kf-bar span{position:relative;padding:0 6px;line-height:22px;font-family:var(--mono);font-size:12px;white-space:nowrap}
  .kf-row.lag .kf-bar i{background:var(--warn)}.kf-row.off .kf-bar{opacity:.45}
  .kf-note{font-size:12.5px;margin-top:8px}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const fmt = (x) => (Math.round(x * 100) / 100).toString();

  function render() {
    const mode = q('[data-mode]').value;
    const n = +q('[data-n]').value;
    const w = (WRITE * +q('[data-w]').value) / DEMO.wSteps; // 쓰기 속도 MB/s (샤드 쓰기 한도 이내)
    q('[data-no]').textContent = n + '개';
    q('[data-wo]').textContent = fmt(w) + ' MB/s';

    const rows = [];
    let lagging = 0;
    const scale = Math.max(READ, EFO); // 막대 전체 폭 = 샤드 하나 기준 최대 읽기 몫
    for (let i = 0; i < n; i++) {
      let cap, calls = null, off = false;
      if (mode === 'shared') { cap = READ / n; calls = TPS / n; }
      else if (i < EFO_MAX) { cap = EFO; }
      else { cap = 0; off = true; }
      const got = Math.min(w, cap);
      const lag = !off && cap < w;
      if (lag) lagging++;
      const label = off ? '등록 불가' : `${fmt(got)} / ${fmt(cap)} MB/s${calls !== null ? ` · 호출 ${fmt(calls)}회/초` : ''}`;
      rows.push(`<div class="kf-row ${lag ? 'lag' : ''} ${off ? 'off' : ''}"><span class="nm">앱 ${i + 1}</span>
        <div class="kf-bar"><i style="width:${(cap / scale) * 100}%"></i><u style="left:calc(${(w / scale) * 100}% - 1px)"></u><span>${label}</span></div></div>`);
    }
    q('[data-list]').innerHTML = rows.join('');

    let sum;
    if (mode === 'shared') {
      sum = `소비자마다 읽기 몫 <b>${fmt(READ / n)} MB/s</b>, GetRecords <b>${fmt(TPS / n)}회/초</b>
        (한 번 부른 뒤 약 ${fmt(n / TPS)}초 기다려야 함). 쓰기 속도를 못 따라가는 소비자: <b>${lagging}개</b>.`;
    } else {
      const reg = Math.min(n, EFO_MAX);
      sum = `등록된 소비자 <b>${reg}개</b>가 각자 <b>${fmt(EFO)} MB/s</b>를 받음. 샤드 전체로 나가는 양 ${fmt(reg * Math.min(w, EFO))} MB/s.
        ${n > EFO_MAX ? `<br>스트림당 등록 한도(${F['kinesis.efo.consumers.max'].display})를 넘은 ${n - EFO_MAX}개는 등록할 수 없음.` : ''}`;
    }
    q('[data-sum]').innerHTML = sum;
    q('[data-note]').innerHTML = `검은 선은 쓰기 속도(따라가야 할 양), 주황 막대는 몫이 쓰기 속도보다 작아 밀리는 소비자다.
      문서의 평균 전파 지연: 공유 처리량 소비자 하나 ${F['kinesis.shared.latency.one'].display}, 다섯 ${F['kinesis.shared.latency.five'].display} / 향상된 팬아웃 ${F['kinesis.efo.latency'].display}.
      향상된 팬아웃은 추가 요금(데이터 검색, 소비자-샤드 시간)이 든다.`;
  }
  root.addEventListener('input', render);
  root.addEventListener('change', render);
  render();
};

// 실험: 파티션 키 전략에 따라 파티션마다 부하가 어떻게 쌓이는지 본다.
// 파티션 하나의 한도(읽기·쓰기)는 사실 항목(F)에서 받는다.
// 단순화: 키 값 하나는 한 파티션에만 놓인다고 본다. 실제로는 적응형 용량이 파티션을 다시 나눌 수 있다.
window.SIMS = window.SIMS || {};
window.SIMS['ddb-hot-partition'] = function (root, F) {
  const RMAX = F['dynamodb.partition.read.max'].value;
  const WMAX = F['dynamodb.partition.write.max'].value;
  const P = 8; // 화면 실험용 파티션 수. AWS 수치 아님
  const USERS = 5000; // 화면 실험용 사용자 수. AWS 수치 아님
  const STATUS = [['ACTIVE', 0.6], ['PENDING', 0.3], ['DONE', 0.1]]; // 화면 실험용 상태 값과 비율. AWS 수치 아님
  const START = { rate: 3000, shards: 10 }; // 입력칸 시작값(예시). AWS 수치 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 핫 파티션</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">키 전략과 초당 요청량을 바꿔 보세요. 막대는 파티션마다 받는 부하이고, 세로선은 파티션 하나의 한도(읽기 ${F['dynamodb.partition.read.max'].display}, 쓰기 ${F['dynamodb.partition.write.max'].display})입니다.</p>
    <div class="hp-ctrls">
      <label class="f">파티션 키 전략
        <select data-k>
          <option value="status">상태 코드 (status)</option>
          <option value="user">사용자 ID (userId)</option>
          <option value="shard">날짜 + 접미사 (date#N)</option>
        </select></label>
      <label class="f">요청 종류
        <select data-op><option value="w">쓰기</option><option value="r">읽기</option></select></label>
      <label class="f">초당 요청 단위 <input type="number" min="0" step="100" value="${START.rate}" data-rate></label>
      <label class="f" data-shwrap>접미사 수 N <input type="number" min="1" max="200" step="1" value="${START.shards}" data-n></label>
    </div>
    <div class="stats" data-out></div>
    <div class="hp-bars" data-bars></div>
    <p class="note">파티션 수(${P}), 사용자 수, 상태 비율은 화면 실험용 값이며 AWS 수치가 아닙니다. 실제 파티션 수는 DynamoDB가 정하고 보여 주지 않습니다. 이 실험은 키 값 하나가 한 파티션에 있다고 단순화했습니다.</p>`;
  const st = document.createElement('style');
  st.textContent = `.hp-ctrls{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hp-ctrls select,.hp-ctrls input{width:100%;box-sizing:border-box}
  .hp-bars{margin-top:10px}.hp-row{display:grid;grid-template-columns:2.6em 1fr 5.5em;gap:6px;align-items:center;font-size:12px;margin:3px 0}
  .hp-row b{font-family:var(--mono);text-align:right;overflow-wrap:anywhere}
  .hp-track{position:relative;height:12px;background:var(--line);border-radius:4px;overflow:hidden;min-width:0}
  .hp-track i{position:absolute;left:0;top:0;bottom:0;background:var(--accent)}.hp-track i.over{background:var(--warn)}
  .hp-track s{position:absolute;top:0;bottom:0;width:2px;background:var(--ink,#000)}
  .hp-keys{font-size:11px;color:var(--muted,#666);grid-column:2/4;overflow-wrap:anywhere}
  @media (max-width:600px){.hp-ctrls{grid-template-columns:1fr}}`;
  root.appendChild(st);
  const q = (s) => root.querySelector(s);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % P; };
  const n = (v) => Math.round(v).toLocaleString();
  const f = () => {
    const kind = q('[data-k]').value, op = q('[data-op]').value;
    const rate = Math.max(0, +q('[data-rate]').value || 0);
    const N = Math.min(200, Math.max(1, Math.floor(+q('[data-n]').value || 1)));
    q('[data-shwrap]').style.display = kind === 'shard' ? '' : 'none';
    const lim = op === 'r' ? RMAX : WMAX;
    let keys = [];
    if (kind === 'status') keys = STATUS.map(([k, s]) => [k, rate * s]);
    else if (kind === 'user') for (let i = 0; i < USERS; i++) keys.push(['u-' + i, rate / USERS]);
    else for (let i = 1; i <= N; i++) keys.push(['2026-11-02#' + i, rate / N]);
    const load = new Array(P).fill(0), names = Array.from({ length: P }, () => []);
    keys.forEach(([k, v]) => { const p = hash(k); load[p] += v; names[p].push(k); });
    const maxKey = Math.max(...keys.map((x) => x[1]));
    const over = load.reduce((a, v) => a + Math.max(0, v - lim), 0);
    const used = load.filter((v) => v > 0).length;
    const scale = Math.max(lim * 1.5, ...load);
    q('[data-out]').innerHTML = `<div class="stat"><div class="k">키 값 수</div><div class="v">${keys.length.toLocaleString()}</div></div>
      <div class="stat"><div class="k">쓰이는 파티션</div><div class="v">${used} / ${P}</div></div>
      <div class="stat"><div class="k">가장 바쁜 키 값</div><div class="v">${n(maxKey)}/초</div></div>
      <div class="stat ${over > 0 ? 'bad' : 'acc'}"><div class="k">한도 초과분(스로틀 예상)</div><div class="v">${n(over)}/초</div></div>`;
    q('[data-bars]').innerHTML = load.map((v, i) => {
      const ks = names[i];
      const label = kind === 'user' ? (ks.length ? `사용자 ${ks.length.toLocaleString()}명` : '') : ks.join(', ');
      return `<div class="hp-row"><span>P${i + 1}</span><div class="hp-track"><i class="${v > lim ? 'over' : ''}" style="width:${(v / scale) * 100}%"></i><s style="left:${(lim / scale) * 100}%"></s></div><b>${n(v)}</b>${label ? `<div class="hp-keys">${label}</div>` : ''}</div>`;
    }).join('') + (maxKey > lim ? `<p class="note" style="color:var(--warn)">키 값 하나의 부하가 파티션 한도를 넘습니다. 적응형 용량으로도 받을 수 없으니 키를 다시 설계하거나 접미사를 늘려야 합니다.</p>` : '');
  };
  root.querySelectorAll('input,select').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

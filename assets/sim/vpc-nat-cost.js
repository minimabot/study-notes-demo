// 계산기: 프라이빗 서브넷 → 같은 리전 S3로 보내는 트래픽의 월 비용 비교
// (a) NAT 게이트웨이 경유, (b) S3 게이트웨이 엔드포인트, (c) S3 인터페이스 엔드포인트.
// 단가는 모두 사실 항목(F)에서 받는다. 근거는 AWS Price List API 가격표(data/facts/vpc-network-cost.yaml 머리 주석).
window.SIMS = window.SIMS || {};
window.SIMS['vpc-nat-cost'] = function (root, F) {
  const p = (id) => F[id].value;
  const PRICE = {
    apne2: {
      natHr: p('vpc.price.natgw-hour.apne2'), natGB: p('vpc.price.natgw-gb.apne2'),
      ieHr: p('vpc.price.interface-endpoint-hour.apne2'), ieGB: p('vpc.price.interface-endpoint-gb'),
      azGB: p('vpc.price.inter-az-gb'), ipHr: p('vpc.price.public-ipv4-hour'),
    },
    use1: {
      natHr: p('vpc.price.natgw-hour.use1'), natGB: p('vpc.price.natgw-gb.use1'),
      ieHr: p('vpc.price.interface-endpoint-hour.use1'), ieGB: p('vpc.price.interface-endpoint-gb'),
      azGB: p('vpc.price.inter-az-gb'), ipHr: p('vpc.price.public-ipv4-hour'),
    },
  };
  const REGION_NAME = { apne2: '서울(ap-northeast-2)', use1: '미국 동부 버지니아 북부(us-east-1)' }; // 표시용 이름
  const HOURS = 730; // 화면 계산용 가정. 한 달을 730시간으로 본다. AWS 수치 아님
  const START = { gb: 2000, az: 2 }; // 입력칸 시작값(예시). AWS 수치 아님

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: 프라이빗 서브넷에서 S3로 가는 길의 월 비용</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">기준 리전은 <b>${REGION_NAME.apne2}</b>, 단가는 <b>${F['vpc.price.offer-version'].display}</b> 기준입니다. 근사치이므로 실제 청구액은 AWS 요금 페이지나 AWS Pricing Calculator로 확인하세요.</p>
    <div class="ctrls">
      <label class="f">S3로 보내는 양(GB/월) <input type="number" min="0" step="100" value="${START.gb}" data-gb></label>
      <label class="f">프라이빗 서브넷이 있는 영역 수 <input type="number" min="1" max="6" step="1" value="${START.az}" data-az></label>
    </div>
    <div class="ctrls">
      <label class="f">NAT 게이트웨이 배치 <select data-nat><option value="per-az">영역마다 하나</option><option value="one">하나만 공유</option></select></label>
      <label class="f">리전 <select data-rg><option value="apne2">서울 (기준)</option><option value="use1">us-east-1 (참고)</option></select></label>
    </div>
    <div class="ctrls">
      <label class="f"><input type="checkbox" data-need> 인터넷용으로 NAT 게이트웨이가 어차피 필요하다</label>
    </div>
    <div data-bars></div>
    <div class="stats" data-out></div>
    <ul class="note vn-asm">
      <li>S3 버킷은 같은 리전에 있다. 같은 리전의 EC2와 S3 사이 전송 자체에는 데이터 전송 요금이 없다고 본다(요금 페이지 설명). S3 요청 요금과 저장 요금은 넣지 않았다.</li>
      <li>한 달은 ${HOURS}시간으로 계산한다. 트래픽은 영역마다 고르게 나뉜다고 본다. 입력한 GB만 센다(응답 트래픽은 작다고 보고 뺐다).</li>
      <li>(a) NAT: 시간 요금 × NAT 수 + 처리 GB 요금(${F['vpc.price.natgw-gb.apne2'].display}, 서울). 퍼블릭 NAT 게이트웨이마다 탄력적 IP 하나의 퍼블릭 IPv4 요금(${F['vpc.price.public-ipv4-hour'].display})을 더한다. NAT 하나를 공유하면 다른 영역에서 오는 몫에 영역 간 전송 요금(${F['vpc.price.inter-az-gb'].display})을 GB당 한 번 더한다. 실제로는 방향마다 붙을 수 있어 더 늘 수 있다.</li>
      <li>(b) 게이트웨이 엔드포인트: 시간 요금과 처리 요금이 없다.</li>
      <li>(c) 인터페이스 엔드포인트: 영역마다 엔드포인트 네트워크 인터페이스를 하나씩 둔다. 시간 요금 × 영역 수 + 처리 GB 요금(${F['vpc.price.interface-endpoint-gb'].display}). 인스턴스는 같은 영역의 인터페이스를 쓴다고 본다.</li>
      <li>"어차피 필요하다"를 켜면 NAT 게이트웨이의 시간 요금과 퍼블릭 IPv4 요금은 세 방식 모두에 똑같이 들어가므로 비교에서 뺀다. 이때 차이는 처리 GB 요금과 영역 간 요금, 인터페이스 엔드포인트 시간 요금에서만 생긴다.</li>
    </ul>`;
  const st = document.createElement('style');
  st.textContent = `[data-sim="vpc-nat-cost"] select{font:inherit;font-size:14px;padding:5px 6px;border:1px solid var(--line2);border-radius:6px;max-width:100%}
  [data-sim="vpc-nat-cost"] .f{flex-wrap:wrap}
  [data-sim="vpc-nat-cost"] input[type=number]{max-width:100%}
  .vn-row{margin:6px 0 10px}.vn-row .k{font-size:13px;color:var(--ink2);margin-bottom:3px}
  .vn-bar{display:flex;width:100%;max-width:100%;height:22px;border-radius:6px;overflow:hidden;background:var(--paper)}
  .vn-bar span{display:block;height:100%;min-width:0}
  .vn-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink2);margin:4px 0 0}
  .vn-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  .vn-asm{padding-left:18px}.vn-asm li{margin:0 0 4px}`;
  root.appendChild(st);

  const $ = (s) => root.querySelector(s);
  const val = (s, min, max) => Math.min(max ?? Infinity, Math.max(min, +$(s).value || 0));
  const usd = (v) => `${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')} USD`;
  const fmt = (v, d = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: d });
  const COLORS = { hour: 'var(--ink)', gb: 'var(--ink2)', xaz: 'var(--bad)', ip: 'var(--line2)' };
  const NAMES = { hour: '시간 요금', gb: '처리 GB 요금', xaz: '영역 간 전송', ip: '퍼블릭 IPv4' };

  const f = () => {
    const gb = val('[data-gb]', 0), az = Math.floor(val('[data-az]', 1, 6));
    const shared = $('[data-nat]').value === 'one';
    const need = $('[data-need]').checked;
    const P = PRICE[$('[data-rg]').value];
    const nNat = shared ? 1 : az;
    const crossGB = shared ? (gb * (az - 1)) / az : 0; // 다른 영역에서 NAT로 넘어가는 몫

    const natFixed = { hour: nNat * HOURS * P.natHr, ip: nNat * HOURS * P.ipHr };
    const fixed = need ? 0 : 1; // 어차피 필요한 NAT는 비교에서 뺀다
    const a = { hour: fixed * natFixed.hour, gb: gb * P.natGB, xaz: crossGB * P.azGB, ip: fixed * natFixed.ip };
    const b = { hour: 0, gb: 0, xaz: 0, ip: 0 };
    const c = { hour: az * HOURS * P.ieHr, gb: gb * P.ieGB, xaz: 0, ip: 0 };
    const tot = (x) => Object.values(x).reduce((s, v) => s + v, 0);
    const tA = tot(a), tB = tot(b), tC = tot(c), max = Math.max(tA, tB, tC) || 1;
    const bar = (t, x, total) => `<div class="vn-row"><div class="k">${t}: <b>${usd(total)}</b></div>
      <div class="vn-bar" style="width:${Math.max(0.5, (100 * total) / max)}%">${Object.keys(NAMES).map((k) => `<span title="${NAMES[k]}" style="width:${total ? (100 * x[k]) / total : 0}%;background:${COLORS[k]}"></span>`).join('')}</div></div>`;
    $('[data-bars]').innerHTML = bar(`(a) NAT 게이트웨이 ${fmt(nNat)}개 경유`, a, tA) + bar('(b) S3 게이트웨이 엔드포인트', b, tB) + bar(`(c) S3 인터페이스 엔드포인트 (영역 ${fmt(az)}개)`, c, tC)
      + `<div class="vn-leg">${Object.keys(NAMES).map((k) => `<span><i style="background:${COLORS[k]}"></i>${NAMES[k]}</span>`).join('')}</div>`;

    // 인터페이스 엔드포인트가 NAT보다 싸지는 GB (NAT 고정비 포함 기준)
    const perGB = P.natGB + (shared ? ((az - 1) / az) * P.azGB : 0) - P.ieGB;
    const beGB = perGB > 0 ? Math.max(0, (az * HOURS * P.ieHr - (natFixed.hour + natFixed.ip) * fixed) / perGB) : Infinity;
    let html = `
      <div class="stat"><div class="k">리전 / 가격표</div><div class="v">${REGION_NAME[$('[data-rg]').value]} / ${F['vpc.price.offer-version'].display}</div></div>
      <div class="stat acc"><div class="k">(a) NAT 경유 월 비용</div><div class="v">${usd(tA)}</div></div>
      <div class="stat acc"><div class="k">(b) 게이트웨이 엔드포인트 월 비용</div><div class="v">${usd(tB)}</div></div>
      <div class="stat acc"><div class="k">(c) 인터페이스 엔드포인트 월 비용</div><div class="v">${usd(tC)}</div></div>
      <div class="stat"><div class="k">(a) 대신 (b)를 쓰면 줄어드는 금액</div><div class="v">${usd(tA - tB)} / 월</div></div>
      <div class="stat"><div class="k">(c)가 (a)보다 싸지는 지점</div><div class="v">${beGB === Infinity ? '이 조건에서는 없음' : beGB < 1 ? '전송량과 관계없이 (c)가 싸다' : `월 약 ${fmt(beGB)} GB 이상`}</div></div>`;
    if (shared && az > 1) html += `<div class="stat bad"><div class="k">가용성 주의</div><div class="v">NAT 게이트웨이를 하나만 두면 그 영역이 멈출 때 다른 영역의 인터넷 출구도 함께 막힌다. 영역 간 전송 요금도 붙는다.</div></div>`;
    $('[data-out]').innerHTML = html;
  };
  root.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

// 시뮬레이터: 요청 하나가 네트워크 ACL(인) → 보안 그룹(인) → 보안 그룹(아웃) → 네트워크 ACL(아웃)을 지나는 과정.
// 임시 포트 범위는 사실 항목(F)에서 받는다. 클라이언트 IP·규칙 번호·예시 포트 범위는 화면 실험용 값이다.
window.SIMS = window.SIMS || {};
window.SIMS['vpc-sg-nacl'] = function (root, F) {
  const range = (id) => String(F[id].value).split('-').map(Number);
  const CLIENTS = {
    linux: { name: 'Linux 클라이언트', r: range('vpc.ephemeral.linux') },
    windows: { name: 'Windows 클라이언트', r: range('vpc.ephemeral.windows') },
    aws: { name: 'ELB·NAT 게이트웨이', r: range('vpc.ephemeral.aws-services') },
  };
  // 범위 안의 대표 포트 하나를 고른다. 화면 실험용. AWS 수치 아님
  const pickPort = (r) => r[0] + Math.floor((r[1] - r[0]) / 10);
  const IPS = { good: '198.51.100.7', bad: '203.0.113.50' }; // 화면 실험용 예시 주소. AWS 수치 아님
  const BAD_CIDR = '203.0.113.0/24';
  const DOC_EXAMPLE = [32768, 65535]; // 문서 예시 ACL의 임시 포트 범위. 화면 실험용 선택지
  const aws = range('vpc.ephemeral.aws-services');

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 패킷은 어디서 막히나</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">인터넷 클라이언트가 웹 서버의 TCP 443으로 요청을 보냅니다. 규칙을 켜고 끄면서 요청과 응답이 어느 단계에서 막히는지 보세요.
    네트워크 ACL은 상태를 저장하지 않아 응답 방향 규칙이 따로 필요하고, 보안 그룹은 상태를 저장해 응답을 자동으로 내보냅니다.</p>
    <div class="sn-ctrl">
      <fieldset><legend>클라이언트</legend>
        <label>종류 <select data-k="client">${Object.entries(CLIENTS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select></label>
        <label>출발지 <select data-k="ip"><option value="good">정상 사용자 ${IPS.good}</option><option value="bad">공격 대역 ${IPS.bad}</option></select></label>
      </fieldset>
      <fieldset><legend>네트워크 ACL 인바운드</legend>
        <label><input type="checkbox" data-k="naclDeny"> ${BAD_CIDR} 모두 거부, 규칙 번호
          <select data-k="denyNo"><option value="90">90</option><option value="110">110</option></select></label>
        <label><input type="checkbox" data-k="naclIn443" checked> 규칙 100: TCP 443 허용 (0.0.0.0/0)</label>
      </fieldset>
      <fieldset><legend>보안 그룹</legend>
        <label><input type="checkbox" data-k="sgIn443" checked> 인바운드: TCP 443 허용 (0.0.0.0/0)</label>
        <label><input type="checkbox" data-k="sgOutAll"> 아웃바운드: 모든 트래픽 허용 (기본 규칙)</label>
      </fieldset>
      <fieldset><legend>네트워크 ACL 아웃바운드 (규칙 100)</legend>
        <select data-k="naclOut">
          <option value="none">규칙 없음</option>
          <option value="443">TCP 443만 허용</option>
          <option value="doc">TCP ${DOC_EXAMPLE[0]}-${DOC_EXAMPLE[1]} 허용</option>
          <option value="aws">TCP ${aws[0]}-${aws[1]} 허용</option>
        </select>
      </fieldset>
    </div>
    <div class="sn-pkt" data-pkt></div>
    <ol class="sn-steps" data-steps></ol>
    <div class="sn-res" aria-live="polite" data-res></div>`;
  const st = document.createElement('style');
  st.textContent = `.sn-ctrl{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .sn-ctrl fieldset{border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:0;min-width:0;background:var(--paper)}
  .sn-ctrl legend{font-size:12.5px;font-weight:700;color:var(--muted);padding:0 4px}
  .sn-ctrl label{display:block;font-size:13.5px;margin:4px 0;line-height:1.5}
  .sn-ctrl select{max-width:100%;font-size:13px}
  .sn-pkt{font-family:var(--mono);font-size:12.5px;margin:10px 0 6px;word-break:break-all;color:var(--muted)}
  .sn-steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .sn-steps li{border:1px solid var(--line2);border-radius:8px;padding:8px;background:#fff;font-size:13px;min-width:0}
  .sn-steps li b{display:block;font-size:12.5px;margin-bottom:4px}
  .sn-steps li.ok{border-color:#3a8a4f;background:#eef7f0}.sn-steps li.no{border-color:var(--warn);background:var(--warn-soft)}
  .sn-steps li.skip{opacity:.5}
  .sn-res{margin-top:10px;font-size:14px;font-weight:700}
  @media (max-width:600px){.sn-ctrl{grid-template-columns:1fr}.sn-steps{grid-template-columns:1fr 1fr}}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const val = (k) => { const el = q(`[data-k="${k}"]`); return el.type === 'checkbox' ? el.checked : el.value; };

  // 네트워크 ACL: 낮은 번호부터 보고 처음 맞는 규칙에서 멈춘다. 아무것도 맞지 않으면 * 규칙(거부)
  function evalNacl(rules, pkt) {
    for (const r of [...rules].sort((a, b) => a.no - b.no)) if (r.match(pkt)) return { allow: r.allow, why: `규칙 ${r.no} (${r.label})` };
    return { allow: false, why: '* 규칙 (맞는 규칙 없음 → 거부)' };
  }

  function run() {
    const c = CLIENTS[val('client')];
    const ip = IPS[val('ip')];
    const cport = pickPort(c.r);
    const isBad = val('ip') === 'bad';
    q('[data-pkt]').textContent = `요청: ${ip}:${cport} → 웹 서버:443 · 응답: 웹 서버:443 → ${ip}:${cport}`;

    const inRules = [];
    if (val('naclDeny')) inRules.push({ no: +val('denyNo'), allow: false, label: `${BAD_CIDR} 거부`, match: () => isBad });
    if (val('naclIn443')) inRules.push({ no: 100, allow: true, label: 'TCP 443 허용', match: (p) => p.dport === 443 });
    const o = val('naclOut');
    const outRules = [];
    if (o === '443') outRules.push({ no: 100, allow: true, label: 'TCP 443 허용', match: (p) => p.dport === 443 });
    if (o === 'doc') outRules.push({ no: 100, allow: true, label: `TCP ${DOC_EXAMPLE.join('-')} 허용`, match: (p) => p.dport >= DOC_EXAMPLE[0] && p.dport <= DOC_EXAMPLE[1] });
    if (o === 'aws') outRules.push({ no: 100, allow: true, label: `TCP ${aws.join('-')} 허용`, match: (p) => p.dport >= aws[0] && p.dport <= aws[1] });

    const steps = [];
    const n1 = evalNacl(inRules, { dport: 443 });
    steps.push({ t: '① 네트워크 ACL 인바운드', ok: n1.allow, msg: n1.why });
    const sgIn = val('sgIn443');
    steps.push({ t: '② 보안 그룹 인바운드', ok: sgIn, msg: sgIn ? 'TCP 443 허용 규칙과 맞음' : '맞는 허용 규칙 없음 (보안 그룹은 허용 규칙만 있다)' });
    steps.push({ t: '③ 보안 그룹 아웃바운드', ok: true, msg: val('sgOutAll') ? '응답은 상태 저장으로 통과 (아웃바운드 규칙과 무관)' : '아웃바운드 규칙이 없어도 허용된 요청의 응답은 자동 통과 (상태 저장)' });
    const n4 = evalNacl(outRules, { dport: cport });
    steps.push({ t: '④ 네트워크 ACL 아웃바운드', ok: n4.allow, msg: `목적지 포트 ${cport} → ${n4.why}` });

    let dropped = -1;
    for (let i = 0; i < steps.length; i++) if (!steps[i].ok) { dropped = i; break; }
    q('[data-steps]').innerHTML = steps.map((s, i) => {
      const cls = dropped >= 0 && i > dropped ? 'skip' : s.ok ? 'ok' : 'no';
      const mark = cls === 'skip' ? '–' : s.ok ? '✓' : '✗';
      return `<li class="${cls}"><b>${mark} ${s.t}</b>${cls === 'skip' ? '도달하지 않음' : s.msg}</li>`;
    }).join('');
    const R = q('[data-res]');
    if (dropped < 0) R.textContent = isBad ? '⚠ 응답까지 도착했다. 공격 대역이 막히지 않았다.' : '✓ 응답이 클라이언트에 도착했다.';
    else if (dropped === 0 && isBad && n1.why.includes('거부') && !n1.why.startsWith('*')) R.textContent = '✓ 공격 대역의 요청이 서브넷 경계에서 막혔다.';
    else if (dropped === 3) R.textContent = '✗ 요청은 서버에 닿았지만 응답이 서브넷을 나가지 못했다. 네트워크 ACL은 응답 방향(클라이언트 임시 포트)을 따로 열어야 한다.';
    else R.textContent = `✗ ${steps[dropped].t}에서 요청이 버려졌다.`;
  }

  root.addEventListener('change', run);
  run();
};

// 계산기: VPC IPv4 CIDR을 계층 × 가용 영역 수만큼 같은 크기의 서브넷으로 나누고, 서브넷마다 쓸 수 있는 주소 수를 보여 준다.
// CIDR 크기 한도(/16~/28)와 서브넷 예약 주소 수는 사실 항목(F)에서 받는다. IPv4 계산은 32비트 정수로 한다.
window.SIMS = window.SIMS || {};
window.SIMS['vpc-cidr-calc'] = function (root, F) {
  const LARGEST = F['vpc.cidr.ipv4.largest'].value;   // 가장 큰 블록의 접두사 길이 (16)
  const SMALLEST = F['vpc.cidr.ipv4.smallest'].value; // 가장 작은 블록의 접두사 길이 (28)
  const RESERVED = F['vpc.subnet.reserved-ips'].value; // 서브넷마다 예약되는 주소 수
  const START = { cidr: '10.20.0.0/16', sp: 20, az: 3, tier: 3 }; // 입력칸 시작값(예시). AWS 수치 아님
  const MAX_ROWS = 64; // 화면에 그릴 서브넷 행 수 상한. 화면용. AWS 수치 아님
  const TIER_NAMES = ['퍼블릭', '애플리케이션', '데이터베이스', '계층 4', '계층 5', '계층 6'];
  // 예약된 주소의 역할(앞 네 개 + 마지막 하나). subnet-sizing 문서 기준
  const ROLES = ['네트워크 주소', 'VPC 라우터', 'AWS 예약(Amazon DNS 서버는 VPC 기본 CIDR 범위의 + 2 주소)', '향후 사용 예약', '브로드캐스트 주소(VPC는 브로드캐스트 미지원)'];

  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: VPC CIDR 나누기</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">VPC CIDR과 서브넷 크기, 가용 영역 수, 계층 수를 넣으면 계층 → 가용 영역 순서로 겹치지 않게 서브넷을 잘라 줍니다.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f">VPC IPv4 CIDR <input type="text" value="${START.cidr}" data-cidr style="max-width:100%" inputmode="decimal" autocomplete="off"></label>
      <label class="f">서브넷 접두사 길이(/) <input type="number" min="0" max="32" step="1" value="${START.sp}" data-sp style="max-width:100%"></label>
      <label class="f">가용 영역 수 <input type="number" min="1" max="6" step="1" value="${START.az}" data-az style="max-width:100%"></label>
      <label class="f">계층 수 <input type="number" min="1" max="6" step="1" value="${START.tier}" data-tier style="max-width:100%"></label>
    </div>
    <div class="stats" data-out></div>
    <div data-list style="overflow-wrap:anywhere"></div>
    <p class="note">사용한 사실: VPC·서브넷 IPv4 크기 ${F['vpc.cidr.ipv4.largest'].display} ~ ${F['vpc.cidr.ipv4.smallest'].display}, 서브넷 예약 주소 ${F['vpc.subnet.reserved-ips'].display}. 출처는 아래 "출처"에 있습니다. 실제 계정에서는 CIDR 할당량과 다른 VPC·사내 네트워크와의 겹침도 확인해야 합니다.</p>`;

  const q = (s) => root.querySelector(s);
  const toStr = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const parseIp = (s) => {
    const p = s.trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const x of p) {
      if (!/^\d{1,3}$/.test(x) || +x > 255) return null;
      n = n * 256 + +x;
    }
    return n >>> 0;
  };
  const mask = (len) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);
  const inRange = (ip, base, len) => ((ip & mask(len)) >>> 0) === base;
  const size = (len) => Math.pow(2, 32 - len);
  const fmt = (n) => n.toLocaleString();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 문서가 VPC CIDR로 쓸 수 없다고 한 범위와 주의할 범위
  const FORBIDDEN = [['0.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['224.0.0.0', 4]];
  const RFC1918 = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16]];
  const overlaps = (b1, l1, b2, l2) => { const l = Math.min(l1, l2); return ((b1 & mask(l)) >>> 0) === ((b2 & mask(l)) >>> 0); };

  const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  const f = () => {
    const out = q('[data-out]'); const list = q('[data-list]');
    const raw = q('[data-cidr]').value.trim();
    const m = raw.match(/^([\d.]+)\/(\d{1,2})$/);
    const ip = m ? parseIp(m[1]) : null;
    const vp = m ? +m[2] : NaN;
    if (ip === null || !(vp >= 0 && vp <= 32)) {
      out.innerHTML = stat('입력 오류', '예: 10.0.0.0/16 형식으로 넣으세요', 'bad'); list.innerHTML = ''; return;
    }
    const base = (ip & mask(vp)) >>> 0;
    const sp = Math.floor(+q('[data-sp]').value);
    const az = Math.min(6, Math.max(1, Math.floor(+q('[data-az]').value || 1)));
    const tier = Math.min(6, Math.max(1, Math.floor(+q('[data-tier]').value || 1)));
    let html = '';
    const warns = [];
    if (base !== ip) warns.push(`호스트 비트가 0이 아닙니다. API는 표준 형식 <b>${toStr(base)}/${vp}</b>로 고쳐서 만듭니다.`);
    if (vp < LARGEST || vp > SMALLEST) warns.push(`VPC CIDR 크기는 /${LARGEST}~/${SMALLEST}여야 합니다(지금 /${vp}).`);
    for (const [b, l] of FORBIDDEN) if (overlaps(base, vp, parseIp(b), l)) warns.push(`${b}/${l} 범위와 겹칩니다. VPC CIDR로 쓸 수 없는 범위입니다.`);
    if (overlaps(base, vp, parseIp('172.17.0.0'), 16)) warns.push('172.17.0.0/16과 겹칩니다. 일부 AWS 서비스(예: SageMaker AI)가 쓰는 범위라 문서는 피하라고 합니다.');
    const isPrivate = RFC1918.some(([b, l]) => vp >= l && inRange(base, parseIp(b), l));
    if (!isPrivate) warns.push('RFC 1918 사설 범위 밖입니다. 만들 수는 있지만 문서는 사설 범위를 권장합니다.');

    if (!(sp >= 0 && sp <= 32)) { out.innerHTML = stat('입력 오류', '서브넷 접두사 길이를 0~32로 넣으세요', 'bad'); list.innerHTML = ''; return; }
    if (sp < vp) warns.push(`서브넷(/${sp})이 VPC(/${vp})보다 클 수 없습니다.`);
    if (sp < LARGEST || sp > SMALLEST) warns.push(`서브넷 크기도 /${LARGEST}~/${SMALLEST}여야 합니다(지금 /${sp}).`);

    const need = az * tier;
    const fits = sp >= vp ? Math.pow(2, sp - vp) : 0;
    const per = size(sp);
    const usable = Math.max(0, per - RESERVED);
    const used = Math.min(need, fits) * per;
    html += stat('VPC 주소 수', `${fmt(size(vp))} (/${vp})`, 'acc');
    html += stat('서브넷 하나', `전체 ${fmt(per)} · 사용 가능 ${fmt(usable)}`);
    html += stat('필요 / 가능한 서브넷', `${need} / ${fmt(fits)}`, need > fits ? 'bad' : '');
    if (fits >= need) html += stat('남는 주소(확장 여유)', `${fmt(size(vp) - used)} (${Math.round(((size(vp) - used) / size(vp)) * 100)}%)`);
    if (need > fits) warns.push(`/${vp} 안에 /${sp} 서브넷은 ${fmt(fits)}개까지만 들어갑니다. 서브넷을 줄이거나(접두사를 키우거나) VPC를 키우세요.`);
    html += warns.map((w) => stat('주의', w, 'bad')).join('');
    out.innerHTML = html;

    if (sp < vp || need > fits || sp > 32) { list.innerHTML = ''; return; }
    const rows = [];
    for (let t = 0; t < tier; t++) {
      for (let a = 0; a < az; a++) {
        const i = t * az + a;
        if (i >= MAX_ROWS) break;
        const sb = (base + i * per) >>> 0;
        rows.push(`<tr><td>${esc(TIER_NAMES[t])} · AZ ${String.fromCharCode(97 + a)}</td><td><code>${toStr(sb)}/${sp}</code><br><span class="muted">${toStr(sb)} ~ ${toStr((sb + per - 1) >>> 0)}</span></td><td>${fmt(usable)}</td></tr>`);
      }
    }
    const first = base;
    const res = per >= RESERVED
      ? [0, 1, 2, 3].map((k) => [toStr((first + k) >>> 0), ROLES[k]]).concat([[toStr((first + per - 1) >>> 0), ROLES[4]]])
      : [];
    list.innerHTML = `
      <div class="tablewrap"><table><thead><tr><th>서브넷</th><th>CIDR · 범위</th><th>사용 가능</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      ${need > MAX_ROWS ? `<p class="note">앞의 ${MAX_ROWS}개만 표시했습니다.</p>` : ''}
      <p class="note"><b>첫 서브넷의 예약 주소</b></p>
      <ol class="note" style="padding-left:1.2em">${res.map(([a, r]) => `<li><code>${a}</code> — ${r}</li>`).join('')}</ol>`;
  };
  root.querySelectorAll('input').forEach((i) => { i.addEventListener('input', f); i.addEventListener('change', f); });
  f();
};

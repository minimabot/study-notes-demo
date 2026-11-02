// 실험: 서브넷 라우팅 테이블과 목적지 IPv4 주소를 넣으면 가장 긴 접두사 일치(longest prefix match)로 고른 경로를 보여 준다.
// 같은 대상 범위가 겹칠 때는 문서의 우선순위(정적 > 접두사 목록 > 전파)를 따른다. AWS 수치는 쓰지 않는다.
window.SIMS = window.SIMS || {};
window.SIMS['vpc-route-lookup'] = function (root, F) {
  // 시작값(예시). AWS 수치 아님
  const START_TABLE = [
    '10.0.0.0/16 local',
    '10.1.0.0/16 pcx-peer',
    '10.0.0.0/8 tgw-hub',
    '172.16.0.0/12 vgw-vpn 전파',
    '172.16.5.0/24 tgw-hub',
    '0.0.0.0/0 igw-main',
  ].join('\n');
  const START_IP = '10.1.7.20';
  const KIND = { static: 0, pl: 1, prop: 2 }; // 같은 길이일 때 작은 값이 우선
  const KIND_KO = ['정적', '접두사 목록', '전파'];

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 라우팅 테이블 찾기</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">한 줄에 경로 하나: <code>대상CIDR 대상</code>. 전파된 경로는 끝에 <code>전파</code>, 접두사 목록 경로는 <code>목록</code>을 붙입니다. 목적지 주소를 바꿔 보세요.</p>
    <div class="ctrls" style="flex-wrap:wrap">
      <label class="f" style="flex:1 1 100%">라우팅 테이블
        <textarea data-t rows="7" spellcheck="false" style="width:100%;max-width:100%;box-sizing:border-box;font-family:monospace">${START_TABLE}</textarea></label>
      <label class="f">목적지 IPv4 주소 <input type="text" value="${START_IP}" data-ip style="max-width:100%" inputmode="decimal" autocomplete="off"></label>
    </div>
    <div class="stats" data-out></div>
    <div data-list style="overflow-wrap:anywhere"></div>
    <p class="note">여기서는 IPv4만 다룹니다. 실제 라우팅 테이블에서 IPv4와 IPv6 경로는 따로 따집니다(<code>0.0.0.0/0</code>은 IPv6를 포함하지 않음). 접두사 목록 경로는 목록의 CIDR 하나로 단순화했습니다.</p>`;

  const q = (s) => root.querySelector(s);
  const parseIp = (s) => {
    const p = s.trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; }
    return n >>> 0;
  };
  const mask = (len) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  const f = () => {
    const out = q('[data-out]'); const list = q('[data-list]');
    const routes = []; const bad = [];
    q('[data-t]').value.split('\n').forEach((line, i) => {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return;
      const m = (parts[0] || '').match(/^([\d.]+)\/(\d{1,2})$/);
      const ip = m ? parseIp(m[1]) : null;
      const len = m ? +m[2] : -1;
      if (ip === null || len < 0 || len > 32 || parts.length < 2) { bad.push(i + 1); return; }
      const flag = parts.slice(2).join(' ');
      const kind = /전파|prop/i.test(flag) ? KIND.prop : /목록|pl-/i.test(flag) || /^pl-/.test(parts[1]) ? KIND.pl : KIND.static;
      routes.push({ line: i + 1, text: `${parts[0]} → ${parts[1]}`, base: (ip & mask(len)) >>> 0, len, target: parts[1], kind });
    });
    const dst = parseIp(q('[data-ip]').value);
    let html = '';
    if (bad.length) html += stat('형식 오류', `${bad.join(', ')}번째 줄을 건너뜀`, 'bad');
    if (dst === null) { out.innerHTML = html + stat('입력 오류', '목적지 주소를 예: 10.0.1.5 형식으로 넣으세요', 'bad'); list.innerHTML = ''; return; }
    const matches = routes.filter((r) => ((dst & mask(r.len)) >>> 0) === r.base);
    matches.sort((a, b) => b.len - a.len || a.kind - b.kind || a.line - b.line);
    const win = matches[0];
    if (!win) html += stat('결과', '일치하는 경로 없음 → 패킷을 버린다(블랙홀)', 'bad');
    else {
      html += stat('선택된 대상', esc(win.target), 'acc');
      const tie = matches.filter((r) => r.len === win.len);
      let why = `일치한 경로 중 접두사가 가장 긴 /${win.len}`;
      if (tie.length > 1) why += `. 같은 길이가 ${tie.length}개라 ${KIND_KO[win.kind]} 경로가 우선`;
      if (tie.length > 1 && tie.every((r) => r.kind === KIND.pl)) why += ' (접두사 목록끼리 겹치면 AWS가 임의로 하나를 고른 뒤 계속 그것을 씀)';
      html += stat('이유', why);
    }
    out.innerHTML = html;
    list.innerHTML = `<div class="tablewrap"><table><thead><tr><th>경로</th><th>일치?</th></tr></thead><tbody>${routes.map((r) => {
      const hit = matches.includes(r);
      const mark = r === win ? '<b>선택</b>' : hit ? '일치(덜 구체적이거나 우선순위 낮음)' : '—';
      return `<tr><td><code>${esc(r.text)}</code>${r.kind ? ` <span class="muted">(${KIND_KO[r.kind]})</span>` : ''}</td><td>${mark}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };
  root.querySelectorAll('input,textarea').forEach((i) => i.addEventListener('input', f));
  f();
};

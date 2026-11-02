// 시뮬레이터: IAM 정책 평가 흐름도를 따라 요청 하나의 최종 판정과 그 판정을 낸 단계를 보여 준다.
// 근거: reference_policies_evaluation-logic_policy-eval-denyallow, reference_policies_evaluation-logic-cross-account.
// 단순화: RCP는 기본 RCPFullAWSAccess만 있다고 보고, 세션 정책은 넘기지 않았다고 본다. AWS 수치는 쓰지 않는다.
window.SIMS = window.SIMS || {};
window.SIMS['iam-eval'] = function (root) {
  const PRINCIPALS = {
    user: { name: 'IAM 사용자 · 리소스 정책 Principal = 사용자 ARN', session: false },
    roleArn: { name: '역할 세션 · 리소스 정책 Principal = 역할 ARN', session: true },
    roleSession: { name: '역할 세션 · 리소스 정책 Principal = 역할 세션 ARN', session: true },
  };
  const opt = (pairs) => pairs.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: 이 요청은 허용될까</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">보안 주체가 S3 버킷의 객체를 읽으려 합니다. 정책을 바꾸면서 AWS 평가 흐름도의 어느 단계에서 판정이 나는지 보세요.
    RCP는 기본 정책(RCPFullAWSAccess)만 있고, 세션 정책은 넘기지 않았다고 가정합니다.</p>
    <div class="ie-ctrl">
      <fieldset><legend>요청</legend>
        <label>계정 관계 <select data-k="acct">${opt([['same', '같은 계정'], ['cross', '다른 계정(교차 계정)']])}</select></label>
        <label>보안 주체 <select data-k="pr">${opt(Object.entries(PRINCIPALS).map(([k, p]) => [k, p.name]))}</select></label>
      </fieldset>
      <fieldset><legend>보안 주체 쪽 정책</legend>
        <label>자격 증명 기반 정책 <select data-k="id">${opt([['allow', 'Allow 문 있음'], ['none', '해당 문 없음'], ['deny', 'Deny 문 있음']])}</select></label>
        <label>권한 경계 <select data-k="pb">${opt([['none', '설정 안 함'], ['allow', '설정, 이 작업 허용'], ['noallow', '설정, 이 작업 허용 안 함']])}</select></label>
        <label>SCP (보안 주체 계정) <select data-k="scp">${opt([['allow', '이 작업 허용'], ['noallow', '허용하는 문 없음']])}</select></label>
      </fieldset>
      <fieldset><legend>리소스 쪽 정책</legend>
        <label>리소스 기반 정책(버킷 정책) <select data-k="rb">${opt([['none', '해당 문 없음'], ['allow', '이 보안 주체에 Allow'], ['deny', '이 보안 주체에 Deny']])}</select></label>
      </fieldset>
    </div>
    <ol class="ie-steps" data-steps></ol>
    <div class="ie-res" aria-live="polite" data-res></div>`;
  const st = document.createElement('style');
  st.textContent = `.ie-ctrl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .ie-ctrl fieldset{border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:0;min-width:0;background:var(--paper)}
  .ie-ctrl legend{font-size:12.5px;font-weight:700;color:var(--muted);padding:0 4px}
  .ie-ctrl label{display:block;font-size:13.5px;margin:4px 0;line-height:1.5}
  .ie-ctrl select{display:block;width:100%;max-width:100%;font-size:13px;margin-top:2px}
  .ie-steps{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:6px}
  .ie-steps li{border:1px solid var(--line2);border-radius:8px;padding:7px 9px;background:#fff;font-size:13px;min-width:0;overflow-wrap:anywhere}
  .ie-steps li b{display:block;font-size:12.5px;margin-bottom:2px}
  .ie-steps li.pass{border-color:#3a8a4f;background:#eef7f0}
  .ie-steps li.allow{border-color:#3a8a4f;background:#dff0e3;font-weight:600}
  .ie-steps li.deny{border-color:var(--warn);background:var(--warn-soft);font-weight:600}
  .ie-steps li.skip{opacity:.5}
  .ie-steps li.acct{border:none;background:none;padding:6px 0 0;font-weight:700;color:var(--muted)}
  .ie-res{margin-top:10px;font-size:14px;font-weight:700}
  @media (max-width:600px){.ie-ctrl{grid-template-columns:1fr}}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  const val = (k) => q(`[data-k="${k}"]`).value;

  // 단일 계정 평가 흐름도. kind: 'single' | 'principalSide' | 'resourceSide'
  // 반환: { steps: [...], decision: 'Allow'|'Deny', by: 단계 이름 }
  function evaluate(kind, s) {
    const steps = [];
    const P = PRINCIPALS[s.pr];
    const done = (decision, idx) => {
      steps[idx].cls = decision === 'Allow' ? 'allow' : 'deny';
      for (let i = idx + 1; i < steps.length; i++) steps[i].cls = 'skip';
      return { steps, decision, by: steps[idx].t };
    };
    const push = (t, msg) => { steps.push({ t, msg, cls: 'pass' }); return steps.length - 1; };
    const hasId = kind !== 'resourceSide';
    const hasRb = kind !== 'principalSide';

    // ① 명시적 거부: 이 계정에서 적용되는 모든 정책의 Deny 문을 먼저 찾는다
    const denies = [];
    if (hasId && s.id === 'deny') denies.push('자격 증명 기반 정책');
    if (hasRb && s.rb === 'deny') denies.push('리소스 기반 정책');
    let i = push('① 명시적 거부 확인', denies.length ? `${denies.join('·')}에 맞는 Deny 문이 있다` : '적용되는 Deny 문이 없다 → 계속');
    if (denies.length) return done('Deny', i);

    // ② RCP: 리소스가 있는 계정에 적용. 기본 RCPFullAWSAccess는 떼어 낼 수 없어 항상 Allow가 있다
    if (hasRb) push('② RCP', '기본 RCPFullAWSAccess가 허용 → 계속');

    // ③ SCP: 보안 주체가 속한 계정에 적용
    if (hasId) {
      i = push('③ SCP', s.scp === 'allow' ? 'SCP가 이 작업을 허용 → 계속' : '적용되는 Allow 문이 없다 → 거부');
      if (s.scp !== 'allow') return done('Deny', i);
    }

    // ④ 리소스 기반 정책
    if (hasRb) {
      if (kind === 'resourceSide') {
        i = push('④ 리소스 기반 정책', s.rb === 'allow' ? '다른 계정의 이 보안 주체를 허용 → 리소스 계정 평가 허용' : '다른 계정 보안 주체를 허용하는 문이 없다 → 거부');
        return done(s.rb === 'allow' ? 'Allow' : 'Deny', i);
      }
      if (s.rb === 'allow') {
        if (s.pr === 'user' || s.pr === 'roleSession') {
          i = push('④ 리소스 기반 정책', `${s.pr === 'user' ? '사용자 ARN' : '역할 세션 ARN'}에 직접 허용 → 자격 증명 기반 정책·권한 경계·세션 정책의 묵시적 거부와 상관없이 허용`);
          return done('Allow', i);
        }
        // 역할 ARN에 허용: 권한 경계·세션 정책의 묵시적 거부에는 제한된다 (자격 증명 기반 정책은 필요 없다)
        push('④ 리소스 기반 정책', '역할 ARN에 허용 → 자격 증명 기반 정책은 없어도 되지만 권한 경계·세션 정책은 확인');
        i = push('⑥ 권한 경계', s.pb === 'noallow' ? '경계가 이 작업을 허용하지 않는다 → 묵시적 거부' : s.pb === 'none' ? '경계 없음 → 계속' : '경계가 허용 → 계속');
        if (s.pb === 'noallow') return done('Deny', i);
        i = push('⑦ 세션 정책', '역할 세션이고 세션 정책을 넘기지 않음 → 허용');
        return done('Allow', i);
      }
      push('④ 리소스 기반 정책', '이 보안 주체를 허용하는 문이 없다 → 계속');
    }

    // ⑤ 자격 증명 기반 정책
    i = push('⑤ 자격 증명 기반 정책', s.id === 'allow' ? '이 작업을 허용 → 계속' : '허용하는 문이 없다 → 묵시적 거부');
    if (s.id !== 'allow') return done('Deny', i);
    // ⑥ 권한 경계
    i = push('⑥ 권한 경계', s.pb === 'noallow' ? '경계가 이 작업을 허용하지 않는다 → 묵시적 거부' : s.pb === 'none' ? '경계 없음 → 계속' : '경계가 허용 → 계속');
    if (s.pb === 'noallow') return done('Deny', i);
    // ⑦ 세션 정책
    i = push('⑦ 세션 정책', P.session ? '역할 세션이고 세션 정책을 넘기지 않음 → 허용' : '세션 보안 주체가 아님 → 허용');
    return done('Allow', i);
  }

  const li = (s) => `<li class="${s.cls}"><b>${s.cls === 'allow' ? '✓' : s.cls === 'deny' ? '✗' : s.cls === 'skip' ? '–' : '→'} ${s.t}</b>${s.cls === 'skip' ? '평가하지 않음' : s.msg}</li>`;

  function run() {
    const s = { acct: val('acct'), pr: val('pr'), id: val('id'), pb: val('pb'), scp: val('scp'), rb: val('rb') };
    const R = q('[data-res]');
    if (s.acct === 'same') {
      const r = evaluate('single', s);
      q('[data-steps]').innerHTML = r.steps.map(li).join('');
      R.textContent = `${r.decision === 'Allow' ? '✓ 허용' : '✗ 거부'} — ${r.by} 단계에서 결정됐다.`;
      return;
    }
    // 교차 계정: 보안 주체 계정과 리소스 계정을 각각 평가하고, 둘 다 Allow여야 허용
    const a = evaluate('principalSide', s);
    const b = evaluate('resourceSide', s);
    q('[data-steps]').innerHTML = `<li class="acct">보안 주체 계정(신뢰받는 계정) 평가: ${a.decision}</li>${a.steps.map(li).join('')}`
      + `<li class="acct">리소스 계정(신뢰하는 계정) 평가: ${b.decision}</li>${b.steps.map(li).join('')}`;
    if (a.decision === 'Allow' && b.decision === 'Allow') R.textContent = '✓ 허용 — 두 계정의 평가가 모두 Allow다.';
    else {
      const who = [a.decision === 'Deny' ? `보안 주체 계정(${a.by})` : '', b.decision === 'Deny' ? `리소스 계정(${b.by})` : ''].filter(Boolean).join(', ');
      R.textContent = `✗ 거부 — ${who}에서 거부됐다. 교차 계정 요청은 양쪽 모두 허용해야 한다.`;
    }
  }

  root.addEventListener('change', run);
  run();
};

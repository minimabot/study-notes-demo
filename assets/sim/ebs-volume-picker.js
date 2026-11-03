// 계산기: 요구 사항(크기, IOPS, 처리량, 접근 패턴, 부팅 여부)에 맞는 EBS 볼륨 유형 고르기.
// 모든 한도·비율은 사실 항목(F)에서 받는다. io1 처리량은 IOPS·I/O 크기에 따라 달라 상한만 비교한다.
window.SIMS = window.SIMS || {};
window.SIMS['ebs-volume-picker'] = function (root, F) {
  const v = (id) => F[id].value;
  const d = (id) => F[id].display;
  const START = { size: 500, iops: 6000, tput: 250 }; // 입력칸 시작값(예시). AWS 수치가 아님
  const TIB = 1024; // 단위 환산(GiB→TiB). AWS 수치가 아님
  root.innerHTML = `
    <div class="lab-h"><div class="t">계산기: EBS 볼륨 유형 고르기</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">요구 사항을 넣으면 각 유형이 맞는지와, gp3·io2에서 기본값 위로 얼마를 더 프로비저닝해야 하는지 보여 줍니다.</p>
    <div class="ctrls">
      <label class="f">크기(GiB) <input type="number" min="1" value="${START.size}" data-size></label>
      <label class="f">필요 IOPS <input type="number" min="0" value="${START.iops}" data-iops></label>
      <label class="f">필요 처리량(MiB/s) <input type="number" min="0" value="${START.tput}" data-tput></label>
      <label class="f">접근 패턴 <select data-pat><option value="random">작은 무작위 I/O</option><option value="seq">큰 순차 I/O</option></select></label>
      <label class="f"><input type="checkbox" data-boot> 부팅(루트) 볼륨</label>
    </div>
    <div class="stats" data-out></div>
    <p class="note">사용한 사실: gp3 기본 ${d('ec2.ebs.gp3.iops.base')}·${d('ec2.ebs.gp3.tput.base')}, 최대 ${d('ec2.ebs.gp3.iops.max')}·${d('ec2.ebs.gp3.tput.max')}(2025-09 상향 값), gp2 ${d('ec2.ebs.gp2.iops.per-gib')}, io2 ${d('ec2.ebs.io2.iops.per-gib')}·최대 ${d('ec2.ebs.io2.iops.max')}, io1 ${d('ec2.ebs.io1.iops.per-gib')}, st1·sc1 TiB당 기준/버스트 처리량 등. Nitro 기반이 아닌 인스턴스는 io1·io2에서 ${d('ec2.ebs.non-nitro.iops')}까지만 냅니다. 인스턴스 자체의 EBS 대역폭 한도는 따로 확인하세요.</p>`;
  const num = (sel) => Math.max(0, +root.querySelector(sel).value || 0);
  const fmt = (n) => Math.round(n).toLocaleString();
  const card = (cls, k, val) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${val}</div></div>`;

  function check(size, iops, tput, pat, boot) {
    const out = [];
    const hddReason = [];
    if (boot) hddReason.push('부팅 볼륨 불가');
    if (pat === 'random') hddReason.push('작은 무작위 I/O에는 SSD 권장');

    // gp3
    (() => {
      const why = [];
      if (size < v('ec2.ebs.gp.size.min') || size > v('ec2.ebs.gp3.size.max')) why.push(`크기 범위 밖(${d('ec2.ebs.gp.size.min')}~${d('ec2.ebs.gp3.size.max')})`);
      const needForTput = tput > v('ec2.ebs.gp3.tput.base') ? tput / v('ec2.ebs.gp3.tput.per-iops') : 0;
      const prov = Math.max(v('ec2.ebs.gp3.iops.base'), iops, needForTput);
      const cap = Math.min(v('ec2.ebs.gp3.iops.max'), Math.max(v('ec2.ebs.gp3.iops.base'), size * v('ec2.ebs.gp3.iops.per-gib')));
      if (prov > cap) why.push(`이 크기에서 IOPS 상한 ${fmt(cap)}`);
      if (tput > v('ec2.ebs.gp3.tput.max')) why.push(`처리량 상한 ${d('ec2.ebs.gp3.tput.max')}`);
      const extraI = Math.max(0, prov - v('ec2.ebs.gp3.iops.base'));
      const provT = Math.max(v('ec2.ebs.gp3.tput.base'), tput);
      const extraT = Math.max(0, provT - v('ec2.ebs.gp3.tput.base'));
      out.push(why.length ? card('bad', 'gp3 ✗', why.join(', '))
        : card('acc', 'gp3 ✓', `IOPS ${fmt(prov)} (기본 위 +${fmt(extraI)}), 처리량 ${fmt(provT)} MiB/s (기본 위 +${fmt(extraT)})`));
    })();

    // gp2
    (() => {
      const why = [];
      let note = '';
      if (size < v('ec2.ebs.gp.size.min') || size > v('ec2.ebs.size.max.16t')) why.push(`크기 범위 밖(최대 ${d('ec2.ebs.size.max.16t')})`);
      const base = Math.min(v('ec2.ebs.gp2.iops.max'), Math.max(v('ec2.ebs.gp2.iops.min'), size * v('ec2.ebs.gp2.iops.per-gib')));
      const canBurst = size < v('ec2.ebs.gp2.burst.size');
      if (iops > base) {
        if (canBurst && iops <= v('ec2.ebs.gp2.burst')) note = `기준 ${fmt(base)} IOPS. 요구치는 크레딧이 있을 때 버스트로만 가능`;
        else why.push(`이 크기의 기준 IOPS ${fmt(base)}`);
      }
      const tcap = size >= v('ec2.ebs.gp2.tput.full-gib') ? v('ec2.ebs.gp2.tput.max')
        : size > v('ec2.ebs.gp2.tput.small-gib') ? v('ec2.ebs.gp2.tput.max') : v('ec2.ebs.gp2.tput.min');
      if (tput > tcap) why.push(`이 크기의 처리량 상한 ${fmt(tcap)} MiB/s`);
      else if (size > v('ec2.ebs.gp2.tput.small-gib') && size < v('ec2.ebs.gp2.tput.full-gib') && tput > v('ec2.ebs.gp2.tput.min')) note += (note ? '; ' : '') + '처리량은 버스트로만 도달';
      out.push(why.length ? card('bad', 'gp2 ✗', why.join(', '))
        : card(note ? '' : 'acc', note ? 'gp2 △' : 'gp2 ✓', note || `기준 ${fmt(base)} IOPS로 충족`));
    })();

    // io2 Block Express
    (() => {
      const why = [];
      if (size < v('ec2.ebs.pio.size.min') || size > v('ec2.ebs.io2.size.max')) why.push(`크기 범위 밖(${d('ec2.ebs.pio.size.min')}~${d('ec2.ebs.io2.size.max')})`);
      const prov = Math.max(iops, tput / v('ec2.ebs.io2.tput.per-iops'));
      const cap = Math.min(v('ec2.ebs.io2.iops.max'), size * v('ec2.ebs.io2.iops.per-gib'));
      if (prov > cap) why.push(`이 크기에서 IOPS 상한 ${fmt(cap)}`);
      if (tput > v('ec2.ebs.io2.tput.max')) why.push(`처리량 상한 ${d('ec2.ebs.io2.tput.max')}`);
      out.push(why.length ? card('bad', 'io2 ✗', why.join(', '))
        : card('acc', 'io2 ✓', `IOPS ${fmt(prov)} 프로비저닝 (처리량 요구 포함)${prov > v('ec2.ebs.non-nitro.iops') ? ' · Nitro 필요' : ''}`));
    })();

    // io1
    (() => {
      const why = [];
      if (size < v('ec2.ebs.pio.size.min') || size > v('ec2.ebs.size.max.16t')) why.push(`크기 범위 밖(최대 ${d('ec2.ebs.size.max.16t')})`);
      const prov = Math.max(v('ec2.ebs.io1.iops.min'), iops);
      const cap = Math.min(v('ec2.ebs.io1.iops.max'), size * v('ec2.ebs.io1.iops.per-gib'));
      if (prov > cap) why.push(`이 크기에서 IOPS 상한 ${fmt(cap)}`);
      if (tput > v('ec2.ebs.io1.tput.max')) why.push(`처리량 상한 ${d('ec2.ebs.io1.tput.max')}`);
      out.push(why.length ? card('bad', 'io1 ✗', why.join(', '))
        : card('', 'io1 △', `IOPS ${fmt(prov)}. 처리량은 IOPS·I/O 크기에 따라 달라 문서 표로 확인`));
    })();

    // st1, sc1
    [['st1', 'ec2.ebs.st1'], ['sc1', 'ec2.ebs.sc1']].forEach(([name, p]) => {
      const why = hddReason.slice();
      if (size < v('ec2.ebs.hdd.size.min') || size > v('ec2.ebs.size.max.16t')) why.push(`크기 범위 밖(${d('ec2.ebs.hdd.size.min')}~${d('ec2.ebs.size.max.16t')})`);
      if (iops > v(p + '.iops.max')) why.push(`IOPS 상한 ${d(p + '.iops.max')}`);
      const base = Math.min(v(p + '.tput.max'), v(p + '.base.per-tib') * size / TIB);
      const burst = Math.min(v(p + '.tput.max'), v(p + '.burst.per-tib') * size / TIB);
      let note = '';
      if (tput > burst) why.push(`이 크기의 버스트 처리량 ${fmt(burst)} MiB/s`);
      else if (tput > base) note = `기준 ${fmt(base)} MiB/s. 요구치는 버스트로만 가능`;
      out.push(why.length ? card('bad', `${name} ✗`, why.join(', '))
        : card(note ? '' : 'acc', note ? `${name} △` : `${name} ✓`, note || `기준 처리량 ${fmt(base)} MiB/s로 충족`));
    });
    return out.join('');
  }

  const f = () => {
    const size = Math.max(1, num('[data-size]'));
    root.querySelector('[data-out]').innerHTML = check(size, num('[data-iops]'), num('[data-tput]'),
      root.querySelector('[data-pat]').value, root.querySelector('[data-boot]').checked);
  };
  root.querySelectorAll('input[type=number]').forEach((i) => i.addEventListener('input', f));
  root.querySelectorAll('select,input[type=checkbox]').forEach((i) => i.addEventListener('change', f));
  f();
};

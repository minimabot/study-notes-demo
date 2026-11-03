// 시뮬레이터: AbstractApplicationContext.refresh()의 단계를 하나씩 넘기며
// 무엇이 정의되고 무엇이 객체로 만들어지는지, 어느 확장 지점이 도는지 본다.
// 빈 목록은 작은 Boot 웹 앱을 가정한 예시다. 실제 앱의 빈 수·이름과 다르다.
window.SIMS = window.SIMS || {};
window.SIMS['spring-refresh'] = function (root, F) {
  const d = (id) => (F && F[id] ? F[id].display : '');
  const FAIL_AT = 11; // 화면 실험용. 실패를 주입하는 refresh 단계 번호(finishBeanFactoryInitialization)

  // p: refresh 단계 번호. Boot 앞 준비는 음수, Boot 뒤 마무리는 13 이상
  const REFRESH = [
    { p: 1, m: 'prepareRefresh()', what: '활성 표시, 프로퍼티 소스 초기화, 필수 속성 검사, 이른 이벤트 집합 준비', ext: '하위 클래스의 initPropertySources()' },
    { p: 2, m: 'obtainFreshBeanFactory()', what: 'DefaultListableBeanFactory를 받는다. GenericApplicationContext는 한 번만 refresh할 수 있다', ext: '없음' },
    { p: 3, m: 'prepareBeanFactory()', what: '클래스로더, ApplicationContextAwareProcessor·ApplicationListenerDetector 등록, environment 싱글톤 등록', ext: '없음 (프레임워크 기본 부품)' },
    { p: 4, m: 'postProcessBeanFactory()', what: '하위 클래스 훅. 기본 구현은 비어 있다', ext: '컨텍스트 하위 클래스' },
    { p: 5, m: 'invokeBeanFactoryPostProcessors()', what: 'ConfigurationClassPostProcessor가 스캔·@Import·@Bean·자동 구성을 빈 정의로 등록한다. 아직 애플리케이션 객체는 없다', ext: 'BeanDefinitionRegistryPostProcessor → BeanFactoryPostProcessor (PriorityOrdered → Ordered → 나머지)' },
    { p: 6, m: 'registerBeanPostProcessors()', what: 'BeanPostProcessor 빈만 먼저 만들어 공장에 등록한다', ext: 'BeanPostProcessor 등록 (PriorityOrdered → Ordered → 나머지)' },
    { p: 7, m: 'initMessageSource()', what: 'messageSource 빈을 찾거나 빈 위임 객체를 등록한다', ext: 'messageSource 빈을 직접 정의하면 그것을 쓴다' },
    { p: 8, m: 'initApplicationEventMulticaster()', what: '이벤트 배포기를 찾거나 SimpleApplicationEventMulticaster를 만든다', ext: 'applicationEventMulticaster 빈을 직접 정의하면 그것을 쓴다' },
    { p: 9, m: 'onRefresh()', what: '하위 클래스 훅. Boot 서블릿 웹 컨텍스트는 웹 서버 객체를 만든다(아직 시작 전)', ext: '컨텍스트 하위 클래스' },
    { p: 10, m: 'registerListeners()', what: '리스너 빈 이름을 배포기에 등록하고, 쌓인 이른 이벤트를 보낸다', ext: 'ApplicationListener' },
    { p: 11, m: 'finishBeanFactoryInitialization()', what: '정의를 동결하고, 지연 초기화가 아닌 싱글톤을 모두 만든다. 만들 때마다 BeanPostProcessor가 돌아 프록시가 씌워진다', ext: 'BeanPostProcessor(빈마다), 이어서 SmartInitializingSingleton' },
    { p: 12, m: 'finishRefresh()', what: '생명주기 처리기 준비, SmartLifecycle 시작(웹 서버가 포트를 연다), ContextRefreshedEvent 발행', ext: 'SmartLifecycle.start(), ContextRefreshedEvent 리스너' },
  ];
  const BOOT_PRE = [
    { p: -4, m: 'listeners.starting()', what: 'ApplicationStartingEvent. 리스너·초기화기 등록 외에는 아무것도 하지 않은 때', ext: 'SpringApplicationRunListener', boot: true },
    { p: -3, m: 'prepareEnvironment()', what: 'Environment 준비. ApplicationEnvironmentPreparedEvent', ext: 'Environment 관련 리스너', boot: true },
    { p: -2, m: 'createApplicationContext()', what: '웹 애플리케이션 종류에 맞는 컨텍스트를 만든다. 이때 애너테이션 처리기들의 정의가 등록된다', ext: '없음', boot: true },
    { p: -1, m: 'prepareContext()', what: '초기화기 적용(ApplicationContextInitializedEvent), 주 클래스를 정의로 로드(ApplicationPreparedEvent)', ext: 'ApplicationContextInitializer', boot: true },
  ];
  const BOOT_POST = [
    { p: 13, m: 'listeners.started()', what: 'ApplicationStartedEvent. 러너는 아직 안 돌았다', ext: 'ApplicationListener', boot: true },
    { p: 14, m: 'callRunners()', what: 'ApplicationRunner·CommandLineRunner를 순서대로 호출한다', ext: 'ApplicationRunner, CommandLineRunner', boot: true },
    { p: 15, m: 'listeners.ready()', what: 'ApplicationReadyEvent. 준비 상태가 트래픽 수용으로 바뀐다', ext: 'ApplicationListener', boot: true },
  ];
  // def: 정의가 생기는 단계, inst: 객체가 생기는 단계 (예시 앱)
  const BEANS = [
    { n: 'ConfigurationClassPostProcessor', k: 'BFPP', def: -2, inst: 5 },
    { n: 'AutowiredAnnotationBeanPostProcessor', k: 'BPP', def: -2, inst: 6 },
    { n: 'CommonAnnotationBeanPostProcessor', k: 'BPP', def: -2, inst: 6 },
    { n: 'App (주 클래스)', k: '설정', def: -1, inst: 11 },
    { n: 'environment', k: '내부', def: 3, inst: 3 },
    { n: 'OrderService', k: '앱', def: 5, inst: 11, proxy: true },
    { n: 'OrderRepository', k: '앱', def: 5, inst: 11 },
    { n: 'dataSource (자동 구성)', k: '앱', def: 5, inst: 11 },
    { n: 'AOP 프록시 생성기', k: 'BPP', def: 5, inst: 6 },
    { n: 'messageSource', k: '내부', def: 7, inst: 7 },
    { n: 'applicationEventMulticaster', k: '내부', def: 8, inst: 8 },
    { n: 'webServer', k: '내부', def: 9, inst: 9, startAt: 12 },
  ];

  root.innerHTML = `
    <div class="lab-h"><div class="t">실험: refresh()의 단계 따라가기</div><div class="badge">INTERACTIVE</div></div>
    <p class="hint">refresh()는 <b>${d('spring.refresh.phase-count')}</b>로 나뉜다. '다음'을 눌러 단계를 넘기면 아래 빈 목록에서
    <b>정의만 있는 빈</b>(점선)과 <b>객체가 만들어진 빈</b>(실선)이 바뀐다. 빈 목록은 작은 Boot 웹 앱을 가정한 예시다.</p>
    <div class="ctrls">
      <button data-a="prev">이전</button>
      <button class="primary" data-a="next">다음</button>
      <button data-a="reset">처음</button>
      <label class="f"><input type="checkbox" data-boot> Boot run() 앞뒤 포함</label>
      <label class="f"><input type="checkbox" data-fail> ⑪에서 예외 주입</label>
    </div>
    <div class="sr-steps" data-steps></div>
    <div class="sr-card" data-card aria-live="polite"></div>
    <div class="sr-legend"><span class="sr-sw def"></span>정의만 있음 <span class="sr-sw inst"></span>객체 있음 <span class="sr-sw gone"></span>파괴됨</div>
    <div class="sr-beans" data-beans></div>`;
  const st = document.createElement('style');
  st.textContent = `.sr-steps{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
  .sr-steps span{font-family:var(--mono);font-size:11.5px;padding:2px 6px;border-radius:6px;background:var(--paper);color:var(--muted);border:1px solid var(--line)}
  .sr-steps span.done{color:inherit}.sr-steps span.cur{background:var(--accent);color:#fff;border-color:var(--accent)}
  .sr-steps span.boot{border-style:dashed}.sr-steps span.bad{background:var(--warn);color:#fff;border-color:var(--warn)}
  .sr-card{background:var(--paper);border-radius:8px;padding:10px 12px;font-size:13.5px;min-width:0}
  .sr-card .m{font-family:var(--mono);font-weight:700;font-size:14px;overflow-wrap:anywhere}
  .sr-card .r{margin-top:6px;overflow-wrap:anywhere}.sr-card .r b{display:inline-block;min-width:4.5em;color:var(--muted);font-weight:600}
  .sr-card.err{background:var(--warn-soft);border-left:3px solid var(--warn)}
  .sr-legend{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin:10px 0 6px}
  .sr-sw{display:inline-block;width:14px;height:10px;border-radius:3px;margin-right:3px;vertical-align:-1px;border:1.5px dashed var(--line2)}
  .sr-sw.inst{border:1.5px solid var(--accent);background:#fff}.sr-sw.gone{border:1.5px solid var(--line2);background:var(--line)}
  .sr-beans{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
  .sr-b{border:1.5px dashed var(--line2);border-radius:8px;padding:5px 7px;font-size:12px;min-width:0;background:#fff}
  .sr-b .n{font-family:var(--mono);font-weight:700;overflow-wrap:anywhere}.sr-b .k{color:var(--muted);font-size:11px}
  .sr-b.none{opacity:.3}.sr-b.inst{border-style:solid;border-color:var(--accent)}
  .sr-b.gone{border-style:solid;background:var(--line);opacity:.6;text-decoration:line-through}`;
  root.appendChild(st);

  const q = (s) => root.querySelector(s);
  let i = 0;
  let failed = false;

  function seq() {
    const boot = q('[data-boot]').checked;
    return boot ? [...BOOT_PRE, ...REFRESH, ...BOOT_POST] : REFRESH;
  }
  const failOn = () => q('[data-fail]').checked;

  function render() {
    const S = seq();
    const cur = S[i];
    const failNow = failOn() && cur.p === FAIL_AT;
    failed = failNow;
    q('[data-steps]').innerHTML = S.map((s, k) => {
      const label = s.boot ? s.m.replace('()', '') : (s.p < 10 ? '0' : '') + s.p;
      let c = k < i ? 'done' : '';
      if (k === i) c = failNow ? 'bad' : 'cur';
      return `<span class="${c} ${s.boot ? 'boot' : ''}" title="${s.m}">${label}</span>`;
    }).join('');

    const card = q('[data-card]');
    card.className = 'sr-card' + (failNow ? ' err' : '');
    const tag = cur.boot ? 'SpringApplication.run' : `refresh() 단계 ${cur.p}`;
    if (failNow) {
      card.innerHTML = `<div class="m">${cur.m} → 예외!</div>
        <div class="r"><b>무슨 일</b> 싱글톤을 만들던 중 한 빈의 생성자가 예외를 던졌다.</div>
        <div class="r"><b>정리 순서</b> 시작된 생명주기 빈 정지 → destroyBeans()로 이미 만든 싱글톤 파괴 → cancelRefresh()로 활성 표시 해제 → 예외를 다시 던진다.</div>
        <div class="r"><b>로그 읽기</b> 파괴 콜백 로그가 섞이므로 맨 아래 Caused by부터 본다. Boot는 ApplicationFailedEvent를 보내고 실패 분석 결과를 출력한다.</div>`;
    } else {
      card.innerHTML = `<div class="m">${cur.m}</div>
        <div class="r"><b>위치</b> ${tag}</div>
        <div class="r"><b>하는 일</b> ${cur.what}</div>
        <div class="r"><b>확장 지점</b> ${cur.ext}</div>`;
    }

    const p = cur.p;
    q('[data-beans]').innerHTML = BEANS.map((b) => {
      let c = 'none';
      let k = b.k;
      if (p >= b.def) c = 'def';
      if (p >= b.inst) c = 'inst';
      if (failNow && b.inst <= FAIL_AT) c = 'gone';
      if (c === 'inst' && b.proxy && p >= 11) k += ' · 프록시로 보관';
      if (c === 'inst' && b.startAt) k += p >= b.startAt ? ' · 시작됨' : ' · 아직 시작 전';
      if (c === 'def') k += ' · 정의만';
      return `<div class="sr-b ${c}"><div class="n">${b.n}</div><div class="k">${k}</div></div>`;
    }).join('');

    q('[data-a="prev"]').disabled = i === 0;
    q('[data-a="next"]').disabled = i === S.length - 1 || failed;
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (!a) return;
    if (a === 'next' && i < seq().length - 1 && !failed) i++;
    if (a === 'prev' && i > 0) i--;
    if (a === 'reset') i = 0;
    render();
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-boot]')) i = 0;
    render();
  });
  render();
};

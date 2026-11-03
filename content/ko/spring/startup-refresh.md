---
chapter: spring/startup-refresh
---

@topic spring/startup-refresh/overview

**겉 동작.** 컨테이너가 "시작된다"는 것은 `ApplicationContext.refresh()` 한 번이 끝까지 도는 것이다. Spring Boot의 `SpringApplication.run(..)`도 앞뒤 준비를 한 뒤 결국 이 메서드를 부른다. `refresh()`는 {{fact:spring.refresh.phase-count}}로 나뉘지만, 큰 흐름은 넷이다.

1. **준비.** 환경 값을 확인하고 빈 공장을 얻어 기본 부품을 꽂는다.
2. **정의 단계.** `BeanFactoryPostProcessor`가 빈 정의를 모으고 고친다. `@ComponentScan`, `@Bean`, Boot 자동 구성이 모두 여기서 정의가 된다.
3. **인스턴스 단계 준비와 실행.** `BeanPostProcessor`를 먼저 만들어 등록한 뒤, 나머지 싱글톤을 모두 만든다.
4. **완료.** 생명주기 빈을 시작하고(Boot라면 웹 서버가 이때 포트를 연다) `ContextRefreshedEvent`를 보낸다.

순서가 중요한 이유는 하나다. **앞 단계에서 만들어진 객체는 뒤 단계의 처리를 받지 못한다.** 정의 단계에서 너무 일찍 만들어진 빈은 `@Autowired`도 AOP 프록시도 받지 못한다. 이 장의 실무 함정은 대부분 여기서 나온다.

@topic spring/startup-refresh/phases

**내부 동작.** [`AbstractApplicationContext.refresh()`(L581)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L581)의 본문을 v7.0.8 기준으로 순서대로 본다. 메서드 이름 옆 링크는 `refresh()` 안의 호출 줄이다.

| 단계 | 하는 일 |
|---|---|
| ① [`prepareRefresh()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L589) | 활성 표시, 프로퍼티 소스 초기화, [필수 속성 검사(L687)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L687), 이른 이벤트를 담아 둘 집합 준비 |
| ② [`obtainFreshBeanFactory()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L592) | 하위 클래스에서 빈 공장을 받는다. `GenericApplicationContext`는 [한 번만 refresh할 수 있다(L293)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/GenericApplicationContext.java#L293) |
| ③ [`prepareBeanFactory()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L595) | 클래스로더, `ApplicationContextAwareProcessor`·`ApplicationListenerDetector` 등록, `BeanFactory`·`ApplicationContext`를 주입 가능한 타입으로 등록, `environment` 싱글톤 등록 |
| ④ [`postProcessBeanFactory()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L599) | 하위 클래스용 빈 훅. [기본 구현은 비어 있다(L786)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L786) |
| ⑤ [`invokeBeanFactoryPostProcessors()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L603) | 정의 단계. `ConfigurationClassPostProcessor`가 스캔·`@Import`·`@Bean`·자동 구성을 정의로 등록하고, 다른 처리기가 `${..}` 자리표시자 등을 고친다 |
| ⑥ [`registerBeanPostProcessors()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L605) | `BeanPostProcessor` 빈만 먼저 만들어 공장에 등록한다(`@Autowired` 처리기, AOP 프록시 생성기 등) |
| ⑦ [`initMessageSource()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L609) | `messageSource` 빈을 찾고, 없으면 [빈 위임 객체를 등록한다(L837)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L837) |
| ⑧ [`initApplicationEventMulticaster()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L612) | 이벤트 배포기를 찾고, 없으면 [`SimpleApplicationEventMulticaster`를 만든다(L863)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L863) |
| ⑨ [`onRefresh()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L615) | 하위 클래스 훅. Boot의 서블릿 웹 컨텍스트는 [여기서 웹 서버 객체를 만든다(L149)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/module/spring-boot-web-server/src/main/java/org/springframework/boot/web/server/servlet/context/ServletWebServerApplicationContext.java#L149) |
| ⑩ [`registerListeners()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L618) | 리스너 빈 **이름** 을 배포기에 등록하고(객체는 아직 만들지 않는다), 그동안 쌓인 [이른 이벤트를 보낸다(L932)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L932) |
| ⑪ [`finishBeanFactoryInitialization()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L621) | 변환 서비스·값 해석기 준비, [정의 동결(L991)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L991), [지연 초기화가 아닌 싱글톤을 모두 생성(L994)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L994). 끝나면 `SmartInitializingSingleton` 콜백 |
| ⑫ [`finishRefresh()`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L624) | 캐시 정리, 생명주기 처리기 준비, [`SmartLifecycle` 빈 시작(L1013)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L1013), [`ContextRefreshedEvent` 발행(L1016)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L1016) |

Boot 웹 앱의 웹 서버는 ⑨에서 객체만 만들어지고, [시작·정지용 생명주기 빈(L183)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/module/spring-boot-web-server/src/main/java/org/springframework/boot/web/server/servlet/context/ServletWebServerApplicationContext.java#L183)으로 등록되어 ⑫에서 실제로 시작된다. 그래서 모든 싱글톤이 준비되기 전에는 요청을 받지 않는다.

**실패하면.** ⑤~⑫ 중 예외가 나면 `refresh()`는 이미 시작한 생명주기 빈을 멈추고, [이미 만든 싱글톤을 파괴하고(L644)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L644), [활성 표시를 되돌린 뒤(L647)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java#L647) 예외를 다시 던진다. 시작 실패 로그에 종료 콜백 로그가 섞여 나오는 이유다.

아래 실험에서 단계를 하나씩 넘기며 무엇이 만들어지고 어느 확장 지점이 도는지 본다. 실패 주입을 켜면 ⑪에서 예외가 났을 때의 정리 경로를 볼 수 있다.

@sim spring-refresh

@topic spring/startup-refresh/post-processor-order

**후처리기 실행 순서.** ⑤와 ⑥은 [`PostProcessorRegistrationDelegate`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L68)에 위임된다. ⑤의 순서는 이렇다.

1. 정의를 **등록할 수 있는** 처리기(`BeanDefinitionRegistryPostProcessor`) 중 `PriorityOrdered`인 것 → `Ordered`인 것 → 나머지 순으로 실행한다. [`PriorityOrdered` 단계(L107)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L107)에 `ConfigurationClassPostProcessor`가 있다.
2. "나머지"는 [새 처리기가 더 나오지 않을 때까지 반복한다(L134)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L134). 처리기가 다른 처리기의 정의를 등록할 수 있기 때문이다.
3. 그다음 일반 `BeanFactoryPostProcessor`를 같은 세 등급 순서로 실행한다.

⑥도 `PriorityOrdered` → `Ordered` → 나머지 순서로 `BeanPostProcessor`를 만들어 등록한다. 이때 [`BeanPostProcessorChecker`(L391)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L391)도 함께 등록된다. 후처리기를 만드는 도중에 일반 빈이 만들어지면 이 검사기가 경고를 남긴다(아래 함정 2).

> **설명 상자 — 왜 "먼저 만들어진 빈"은 처리를 못 받나.** 후처리기는 공장의 목록에 들어간 뒤에 만들어지는 빈에만 적용된다. 이미 만들어진 객체를 거슬러 올라가 다시 처리하지 않는다. 그래서 ⑤에서 만들어진 빈에는 ⑥에서 등록되는 `@Autowired` 처리기와 AOP 프록시 생성기가 적용되지 않는다.

@topic spring/startup-refresh/boot-run

**Spring Boot의 `run()` 흐름.** [`SpringApplication.run(String...)`(L292)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L292)은 `refresh()`를 감싸는 준비와 마무리다. 각 지점에서 Boot 이벤트가 나간다.

| 순서 | 코드 | 나가는 이벤트와 의미 |
|---|---|---|
| 1 | [`listeners.starting(..)`(L301)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L301) | `ApplicationStartingEvent`. 리스너·초기화기 등록 외에는 아무것도 하지 않은 때 |
| 2 | [`prepareEnvironment(..)`(L304)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L304) | `ApplicationEnvironmentPreparedEvent`. 쓸 `Environment`가 정해졌고 컨텍스트는 아직 없다 |
| 3 | [`createApplicationContext()`(L306)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L306) | 클래스패스로 정한 웹 애플리케이션 종류(서블릿, 리액티브, 없음)에 맞는 컨텍스트를 만든다 |
| 4 | [`prepareContext(..)`(L308)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L308) | 초기화기 적용 뒤 `ApplicationContextInitializedEvent`, [주 클래스 등 소스를 정의로 로드(L404)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L404)한 뒤 `ApplicationPreparedEvent` |
| 5 | [`refreshContext(..)`(L309)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L309) | 종료 훅 등록 후 위의 `refresh()`. 중간에 `WebServerInitializedEvent`, 끝에 `ContextRefreshedEvent` |
| 6 | [`listeners.started(..)`(L315)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L315) | `ApplicationStartedEvent`. 러너는 아직 안 돌았다 |
| 7 | [`callRunners(..)`(L316)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L316) | `ApplicationRunner`·`CommandLineRunner` 빈을 [순서대로 정렬해 호출(L755)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L755) |
| 8 | [`listeners.ready(..)`(L323)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L323) | `ApplicationReadyEvent`. 이어서 준비 상태(readiness)가 트래픽 수용으로 바뀐다 |

실패하면 [`handleRunFailure`(L319)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L319)가 `ApplicationFailedEvent`를 보내고, 실패 분석기(FailureAnalyzer)가 원인을 사람이 읽는 문장으로 보여 준다.

4번 시점에 레지스트리에 있는 애플리케이션 정의는 `@SpringBootApplication`이 붙은 주 클래스 정도다. 그 클래스의 `@ComponentScan`과 `@EnableAutoConfiguration`은 5번 안의 ⑤ 단계에서야 처리된다.

@topic spring/startup-refresh/pitfalls

**실무 함정 1 — `BeanFactoryPostProcessor`에 빈을 주입하거나 `getBean`을 부른다.** ⑤에서 도는 처리기가 일반 빈을 요구하면 그 빈은 ⑥보다 먼저 만들어진다. 그 빈에는 `@Autowired`·`@Value`가 처리되지 않고, `@Transactional` 프록시도 씌워지지 않는다. 공식 문서도 처리기 안에서 빈 인스턴스를 다루면 이른 생성으로 후처리를 건너뛸 수 있다고 경고한다.

설정 클래스에서 처리기를 `@Bean`으로 만들 때도 같다. 메서드가 `static`이 아니면 처리기를 만들려고 **설정 클래스 객체부터** 만들어야 하므로, 그 설정 클래스의 `@Autowired`·`@Value`·`@PostConstruct`가 무시된다. 이때 [INFO 로그(L390)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassEnhancer.java#L390)가 남는다.

```java
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

 @Configuration
public class InfraConfig {
    // static: InfraConfig 객체를 만들지 않고도 처리기를 만들 수 있다
    @Bean
    static BeanFactoryPostProcessor auditDefinitions() {
        return beanFactory -> {
            // 정의만 읽고 고친다. getBean(..)은 부르지 않는다
            for (String name : beanFactory.getBeanDefinitionNames()) {
                if (name.endsWith("Client")) {
                    beanFactory.getBeanDefinition(name).setLazyInit(true);
                }
            }
        };
    }
}
```

**실무 함정 2 — `BeanPostProcessor`가 다른 빈에 의존한다.** ⑥에서 후처리기를 만들 때 그 후처리기가 주입받는 빈도 함께 만들어진다. 그 빈은 아직 등록이 끝나지 않은 후처리기를 받지 못한다. 로그에 [`... is not eligible for getting processed by all BeanPostProcessors`(L438)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L438)가 보이면 그 빈은 AOP 프록시가 빠졌을 수 있다. 후처리기의 의존은 `ObjectProvider`로 늦게 꺼내거나 없앤다.

**실무 함정 3 — 생성자나 `@PostConstruct`에서 무거운 일을 한다.** ⑪의 싱글톤 생성은 기본적으로 시작 스레드에서 차례로 돈다(백그라운드 부트스트랩을 따로 설정하지 않은 경우). 외부 API 호출, 큰 캐시 예열을 생성자에 두면 그만큼 시작이 늦어지고, 실패하면 앱 전체가 뜨지 않는다. 또 이 시점에는 웹 서버가 아직 시작 전이다. Boot 문서는 시작 시 할 작업을 `@PostConstruct` 같은 생명주기 콜백 대신 `ApplicationRunner`·`CommandLineRunner`에 두라고 권한다. 러너는 모든 빈과 웹 서버가 준비된 뒤, 준비 완료(`ApplicationReadyEvent`) 전에 돈다. 트래픽을 받기 전에 꼭 끝나야 하는 일이면 러너, 받기 시작한 뒤 해도 되는 일이면 `ApplicationReadyEvent` 리스너가 맞다.

**실무 함정 4 — 시작 실패 로그를 위에서부터 읽는다.** `refresh()`는 실패하면 만든 빈을 파괴하므로, 로그 위쪽에는 원인과 관계없는 종료 로그가 섞인다. 맨 아래 `Caused by:`와 Boot의 `APPLICATION FAILED TO START` 설명을 먼저 본다. 자동 구성 때문이라면 `--debug`로 조건 평가 보고서를 켠다({{ch:spring/configuration}}).

@quiz

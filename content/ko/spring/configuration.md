---
chapter: spring/configuration
---

@topic spring/configuration/ccpp

**겉 동작.** `@Configuration`, `@ComponentScan`, `@Import`, `@Bean`은 모두 "어떤 빈 정의를 등록할지"를 적는 표시다. 이 표시를 읽어 실제로 정의를 등록하는 것은 `ConfigurationClassPostProcessor` 하나다. Boot의 자동 구성도 이 처리기가 `@Import`를 따라가다 만나는 한 갈래다.

**내부 동작.** [`ConfigurationClassPostProcessor`(L152)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L152)는 `BeanDefinitionRegistryPostProcessor`이면서 `PriorityOrdered`다. 그 안에서의 순서 값은 [{{fact:spring.ccpp.order}}(L210)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L210)이다. 그래서 `refresh()`의 ⑤ 단계에서 가장 먼저 도는 무리에 속한다({{ch:spring/startup-refresh}}). 하는 일은 두 갈래다.

1. [`postProcessBeanDefinitionRegistry`(L304)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L304) → [`processConfigBeanDefinitions`(L389)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L389): 정의를 **등록** 한다.
2. [`postProcessBeanFactory`(L324)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L324) → [`enhanceConfigurationClasses`(L514)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L514): 풀 모드 설정 클래스를 CGLIB 하위 클래스로 **바꿔 둔다**(다음 절).

등록 쪽은 "파싱 → 정의 읽기"를 새 설정 클래스가 안 나올 때까지 반복한다. [`parser.parse(candidates)`(L452)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L452)가 설정 클래스를 모델(`ConfigurationClass`)로 만들고, [`reader.loadBeanDefinitions(..)`(L464)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassPostProcessor.java#L464)가 그 모델을 빈 정의로 바꿔 레지스트리에 넣는다. 파서의 [`doProcessConfigurationClass`(L305)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L305)는 클래스 하나를 이 순서로 읽는다.

| 순서 | 처리 | 결과 |
|---|---|---|
| 1 | 중첩 클래스 | 안쪽 설정 클래스부터 재귀 처리 |
| 2 | `@PropertySource` | `Environment`에 프로퍼티 소스 추가 |
| 3 | [`@ComponentScan`(L349)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L349) | **즉시** 스캔해 정의 등록. 찾은 클래스가 설정 클래스면 재귀 파싱 |
| 4 | [`@Import`(L364)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L364) | 일반 클래스·`ImportSelector`·`ImportBeanDefinitionRegistrar` 처리. [`DeferredImportSelector`는 미뤄 둔다(L604)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L604) |
| 5 | `@ImportResource` | XML 위치 기록 |
| 6 | [`@Bean` 메서드(L379)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L379) | 메서드 목록을 모델에 기록(정의 등록은 리더가 한다) |
| 7 | 인터페이스 기본 메서드, 상위 클래스 | 상위 클래스가 있으면 같은 처리를 반복 |

모든 후보를 파싱한 뒤에야 [미뤄 둔 `DeferredImportSelector`를 처리한다(L200)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L200). Boot 자동 구성이 사용자 설정보다 **늦게** 정의되는 이유가 이것이다.

@topic spring/configuration/full-vs-lite

**겉 동작.** `@Configuration` 클래스 안에서 `@Bean` 메서드가 다른 `@Bean` 메서드를 직접 불러도 같은 싱글톤이 나온다. 단, **풀 모드** 일 때만이다. `@Configuration`의 [`proxyBeanMethods` 기본값(L477)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/Configuration.java#L477)은 {{fact:spring.configuration.proxy-bean-methods.default}}이고, 이것을 끄면 **라이트 모드**(`@Bean` Lite Mode)가 된다.

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class RateLimiter { }
record OrderService(RateLimiter limiter) { }
record InvoiceService(RateLimiter limiter) { }

 @Configuration // proxyBeanMethods = true (기본)
public class AppConfig {
    @Bean
    RateLimiter rateLimiter() { return new RateLimiter(); }

    @Bean
    OrderService orderService() { return new OrderService(rateLimiter()); }

    @Bean
    InvoiceService invoiceService() { return new InvoiceService(rateLimiter()); }
}
// 풀 모드: orderService.limiter() == invoiceService.limiter() → true
// @Configuration(proxyBeanMethods = false)로 바꾸면 → false. rateLimiter()가 그냥 자바 메서드로 두 번 불린다
```

**내부 동작.** ⑤ 단계 끝에 `enhanceConfigurationClasses`가 풀 모드 설정 클래스의 빈 정의에서 클래스를 **CGLIB으로 만든 하위 클래스로 바꿔 둔다.** 그래서 컨테이너가 만드는 `AppConfig` 객체는 실제로 `AppConfig$$SpringCGLIB$$0` 같은 하위 클래스다. 이 하위 클래스의 `@Bean` 메서드는 [`BeanMethodInterceptor`(L342)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassEnhancer.java#L342)를 거친다.

- 컨테이너가 그 빈을 만들려고 메서드를 부른 것이면([`isCurrentlyInvokedFactoryMethod`, L384](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassEnhancer.java#L384)) 원래 메서드 본문을 실행한다.
- 그 밖의 호출, 즉 `orderService()` 안에서 `rateLimiter()`를 부른 것이면 본문을 실행하지 않고 [`resolveBeanReference`(L401)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassEnhancer.java#L401)로 컨테이너에서 `rateLimiter` 빈을 꺼내 돌려준다.

라이트 모드에서는 하위 클래스가 없으니 가로챌 곳도 없다. `rateLimiter()`는 평범한 자바 메서드 호출이고, 부를 때마다 `new`가 실행된다. 이렇게 만들어진 객체는 컨테이너가 모르는 객체라 `@PostConstruct`, 프록시도 받지 못한다.

> **설명 상자 — CGLIB 하위 클래스.** CGLIB은 실행 중에 바이트코드를 만들어 원래 클래스를 상속한 클래스를 정의하는 라이브러리다(Spring 안에 다시 포장되어 들어 있다). 상속으로 메서드를 재정의하므로 `final` 클래스나 `final` 메서드는 가로챌 수 없다. 풀 모드 설정 클래스에 `final`을 쓸 수 없는 이유다.

**라이트 모드를 권하는 경우.** 메서드끼리 직접 부르지 않고, 필요한 빈을 **매개변수로 받으면** 두 모드의 결과가 같다. 이 경우 CGLIB 처리를 생략할 수 있어 Boot 자동 구성은 모두 라이트 모드로 선언되어 있다. [`@AutoConfiguration`은 `@Configuration(proxyBeanMethods = false)`를 메타 애너테이션으로 단다(L46)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfiguration.java#L46).

```java
 @Configuration(proxyBeanMethods = false)
public class AppConfig {
    @Bean RateLimiter rateLimiter() { return new RateLimiter(); }
    @Bean OrderService orderService(RateLimiter limiter) { return new OrderService(limiter); }
    @Bean InvoiceService invoiceService(RateLimiter limiter) { return new InvoiceService(limiter); }
}
```

@topic spring/configuration/conditional

**`@Conditional`은 정의 단계의 if문이다.** 조건이 거짓이면 그 설정 클래스나 `@Bean` 메서드는 **정의 자체가 등록되지 않는다.** 객체를 만들었다가 버리는 것이 아니다. `@Profile`도 `@Conditional`로 구현된 조건이다.

판단은 [`ConditionEvaluator.shouldSkip`(L81)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConditionEvaluator.java#L81)이 한다. 조건이 평가되는 시점은 두 가지다.

| 시점(ConfigurationPhase) | 어디서 | 무엇을 거른다 |
|---|---|---|
| `PARSE_CONFIGURATION` | [파서가 설정 클래스를 읽기 전(L249)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L249) | 설정 클래스를 아예 읽지 않는다. 그 안의 스캔·`@Import`·`@Bean`이 모두 사라진다 |
| `REGISTER_BEAN` | [리더가 설정 클래스(L135)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassBeanDefinitionReader.java#L135)와 [`@Bean` 메서드(L196)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassBeanDefinitionReader.java#L196)를 정의로 바꿀 때 | 정의 등록만 건너뛴다. "이미 등록된 빈이 있는가" 같은 조건은 이 시점에 평가해야 의미가 있다 |

조건은 정의 단계에서 돌기 때문에 **지금까지 등록된 정의** 만 볼 수 있다. 빈 객체는 아직 없고, 나중에 등록될 정의는 보이지 않는다. 다음 절의 순서 문제가 여기서 나온다.

@topic spring/configuration/auto-configuration

**Boot 자동 구성의 경로.** `@SpringBootApplication`은 [`@SpringBootConfiguration`, `@EnableAutoConfiguration`, `@ComponentScan`을 합친 것이다(L42–L44)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/SpringBootApplication.java#L42). `@EnableAutoConfiguration`은 `AutoConfigurationImportSelector`를 `@Import`한다.

1. [`AutoConfigurationImportSelector`는 `DeferredImportSelector`다(L66)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#L66). 그래서 사용자 설정 클래스와 컴포넌트 스캔 결과를 모두 파싱한 **뒤에** 처리된다.
2. [후보 목록(L188)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#L188)은 클래스패스의 모든 jar에 있는 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 파일에서 읽는다. 한 줄에 클래스 이름 하나다.
3. 제외 설정(`exclude`)을 빼고, [`@ConditionalOnClass` 같은 가벼운 조건으로 먼저 거른다(L140)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#L140). 클래스를 로드하지 않고 미리 만든 메타데이터로 판단한다.
4. 남은 후보를 [`before`/`after`/`@AutoConfigureOrder`로 정렬한다(L508)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#L508). 이 정렬은 **정의 등록 순서** 만 정한다. 객체 생성 순서는 의존 관계가 정한다.
5. 각 자동 구성 클래스는 보통 설정 클래스처럼 파싱되고, `@ConditionalOnMissingBean` 등은 `REGISTER_BEAN` 시점에 평가된다.

**`@ConditionalOnMissingBean`이 사용자 빈을 보고 물러나는 이유.** 1번 덕분에 자동 구성의 조건이 평가될 때는 사용자의 정의가 이미 레지스트리에 있다. Boot 문서와 [`@ConditionalOnMissingBean` Javadoc(L45)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/ConditionalOnMissingBean.java#L45)은 이 조건이 "지금까지 처리된 정의"만 보므로 자동 구성 클래스에만 쓰라고 권한다. 다른 자동 구성이 같은 빈을 만들 수 있다면 그 뒤(`after`)에 오게 해야 한다.

```java
// 라이브러리 쪽: com.acme.audit.autoconfigure.AuditAutoConfiguration
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

 @AutoConfiguration
 @ConditionalOnClass(AuditClient.class)
public class AuditAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean(AuditClient.class) // 물러날 기준 타입을 인터페이스로 명시
    DefaultAuditClient auditClient() {             // 반환 타입은 구체 클래스
        return new DefaultAuditClient();
    }
}
```

`@ConditionalOnMissingBean`에 타입을 적지 않으면 **메서드 반환 타입** 이 기준이 된다. 위 예에서 타입을 빼면 "`DefaultAuditClient`가 없는가"를 묻게 되어, 사용자가 자기 `AuditClient` 구현을 등록해도 물러나지 않고 같은 인터페이스 빈이 둘이 된다.

@topic spring/configuration/debugging

**어떤 자동 구성이 왜 적용됐는지 보기.**

- `--debug`로 실행하거나 `debug=true`를 설정하면 시작 로그에 **조건 평가 보고서**(Conditions Evaluation Report)가 나온다. 자동 구성마다 맞은 조건(Positive matches)과 안 맞은 조건(Negative matches), 그 이유가 적혀 있다.
- Actuator를 쓰면 `conditions` 엔드포인트로 실행 중인 앱의 같은 보고서를 본다.
- 자동 구성 테스트는 `ApplicationContextRunner`로 작은 컨텍스트를 띄워 "사용자 빈이 있을 때 물러나는가"를 검사한다.

```java
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class AuditAutoConfigurationTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(AuditAutoConfiguration.class));

    @Test
    void backsOffWhenUserDefinesClient() {
        runner.withUserConfiguration(UserConfig.class).run(ctx -> {
            assertThat(ctx).hasSingleBean(AuditClient.class);
            assertThat(ctx.getBean(AuditClient.class)).isInstanceOf(MyAuditClient.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    static class UserConfig {
        @Bean AuditClient myAuditClient() { return new MyAuditClient(); }
    }
}
```

**실무 함정.**

- **사용자 설정에 `@ConditionalOnMissingBean`을 쓴다.** 사용자 설정 클래스끼리는 파싱 순서가 보장되지 않는다. 조건을 평가할 때 상대 정의가 아직 없으면 둘 다 등록된다. 이 조건은 자동 구성에만 쓴다.
- **자동 구성 클래스가 컴포넌트 스캔에 걸린다.** 스캔으로 등록되면 `DeferredImportSelector` 순서를 타지 않으므로 사용자 정의보다 먼저 조건이 평가될 수 있다. Boot 문서는 자동 구성을 imports 파일로만 로드하고, 스캔 대상 패키지 밖에 두라고 한다.
- **`@Bean` 메서드를 서로 호출하는 라이트 모드.** `proxyBeanMethods = false`인 클래스에서 다른 `@Bean` 메서드를 부르면 싱글톤이 아니라 새 객체가 나온다. 매개변수로 받는다.
- **풀 모드 설정 클래스를 `final`로 선언한다.** CGLIB이 상속할 수 없어 시작이 실패한다. 자바 `record`도 `final`이라 풀 모드 설정 클래스로 쓸 수 없다.
- **자동 구성 정렬로 생성 순서를 바꾸려 한다.** `after`/`before`는 정의 순서만 바꾼다. 실제 생성 순서가 필요하면 의존 관계(주입)나 `@DependsOn`으로 표현한다.

@quiz

@design

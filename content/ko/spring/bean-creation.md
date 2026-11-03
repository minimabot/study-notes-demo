---
chapter: spring/bean-creation
---

@topic spring/bean-creation/overview

**겉 동작.** `getBean("orderService")` 한 번, 또는 시작 때 컨테이너가 싱글톤을 미리 만드는 한 번 뒤에서는 늘 같은 순서가 돈다. 순서를 네 덩어리로 기억하면 된다.

| 순서 | 하는 일 |
|---|---|
| 인스턴스화 | 생성자나 `@Bean` 메서드를 불러 **객체를 만든다** |
| 속성 채우기 | `@Autowired` 필드·세터, `@Value`에 **값을 넣는다** |
| 초기화 | `Aware` 콜백, `@PostConstruct`, 초기화 메서드를 부르고 **필요하면 프록시로 바꿔 끼운다** |
| 파괴 등록 | 종료 때 부를 콜백이 있으면 **목록에 올린다** |

이 순서에서 실무 규칙 몇 가지가 바로 나온다. 생성자 안에서는 `@Autowired` 필드가 아직 비어 있다(속성 채우기 전이다). `@PostConstruct` 안의 `this`는 프록시가 아니다(프록시는 초기화 맨 끝에 만들어진다). 컨테이너 밖에서 `new`로 만든 객체에는 이 중 아무것도 일어나지 않는다({{ch:spring/why-container}}).

> **설명 상자 — 리플렉션(Reflection).** 클래스 이름이나 `Class` 객체만 가지고 실행 중에 생성자를 찾아 부르고, 필드에 값을 넣고, 메서드를 부르는 Java 기능이다(`java.lang.reflect`). 컨테이너는 컴파일 때 우리 클래스를 모르므로, 빈 정의에 적힌 클래스와 애너테이션을 읽어 리플렉션으로 객체를 만들고 주입한다. `private` 필드에도 값을 넣을 수 있는 것이 이 때문이다.

@topic spring/bean-creation/get-bean

**내부 동작 ① — `doGetBean`.** [`AbstractBeanFactory.getBean(String)`(L195)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L195)은 바로 [`doGetBean`(L236)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L236)으로 넘어간다. 여기서 하는 일은 "이미 있으면 꺼내고, 없으면 스코프에 맞게 만든다"이다.

1. [싱글톤 캐시를 먼저 본다(L244)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L244). 이미 만들어진 싱글톤이면 그대로 돌려준다. 이 조회는 만드는 중인 빈의 **이른 참조**까지 볼 수 있다. 순환 참조가 풀리는 지점이다({{ch:spring/dependency-injection}}).
2. 없으면, 같은 프로토타입을 이 스레드에서 이미 만드는 중인지 검사해 [순환이면 `BeanCurrentlyInCreationException`을 던진다(L261)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L261).
3. 부모·자식 정의를 합친 [병합 정의(RootBeanDefinition)를 얻는다(L296)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L296). 이후 단계는 모두 이 병합 정의를 본다.
4. [`depends-on`에 적힌 빈을 먼저 만든다(L300)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L300). 주입 관계가 없어도 순서만 맞춰야 할 때 쓰는 장치다.
5. 스코프별로 갈린다. [싱글톤(L330)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L330)은 레지스트리의 잠금 아래 `createBean`을 한 번만 부르고 결과를 캐시에 넣는다. [프로토타입(L346)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L346)은 매번 `createBean`을 부르고 캐시하지 않는다. [그 밖의 스코프(L360)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L360)는 등록된 `Scope` 객체에 "없으면 만들어 달라"고 맡긴다({{ch:spring/scopes}}).

[`AbstractAutowireCapableBeanFactory.createBean`(L488)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L488)은 클래스를 확정한 뒤 두 번의 기회를 준다. 먼저 [`resolveBeforeInstantiation`(L514)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L514)으로 `InstantiationAwareBeanPostProcessor`가 **객체를 대신 만들어 돌려줄 기회**를 준다. 여기서 무언가를 돌려받으면 [바로 초기화 후 처리만 거쳐(L1133)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1133) 끝난다. 사용자 지정 `TargetSource`를 쓰는 특수한 AOP 설정이 이 길을 쓴다. 보통은 `null`이 나오고 [`doCreateBean`(L556)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L556)으로 간다.

@topic spring/bean-creation/instantiate

**내부 동작 ② — 객체 만들기.** `doCreateBean`의 첫 줄은 [`createBeanInstance`(L1175)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1175)다. 어떤 방법으로 만들지는 이 순서로 정한다.

| 우선순위 | 조건 | 만드는 방법 |
|---|---|---|
| 1 | 정의에 인스턴스 공급자(Supplier)가 있다 | [공급자를 부른다(L1187)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1187). 함수형 등록·AOT가 쓴다 |
| 2 | 팩터리 메서드 이름이 있다 | [`instantiateUsingFactoryMethod`(L1192)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1192). `@Bean` 메서드 빈이 여기로 간다 |
| 3 | 후처리기가 후보 생성자를 골랐다 | [`determineConstructorsFromBeanPostProcessors`(L1216)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1216) → [`autowireConstructor`(L1219)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1219) |
| 4 | 선호 생성자가 있다 | [`getPreferredConstructors`(L1223)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1223) |
| 5 | 아무것도 없다 | [기본 생성자로 만든다(L1229)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1229) |

3번의 "후처리기"가 [`AutowiredAnnotationBeanPostProcessor.determineCandidateConstructors`(L349)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L349)다. `@Autowired` 생성자가 있으면 그것을 고르고, 없더라도 [생성자가 하나뿐이고 매개변수가 있으면 그것을 고른다(L434)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L434). 그래서 생성자가 하나인 클래스는 `@Autowired`를 붙이지 않아도 생성자 주입이 된다. 생성자가 여럿인데 어느 것에도 `@Autowired`가 없으면 기본 생성자로 떨어진다. 이때 기본 생성자가 없으면 "No default constructor found"로 시작이 실패한다.

`autowireConstructor`와 `instantiateUsingFactoryMethod`는 `ConstructorResolver`로 넘어가 매개변수 하나하나를 의존성 해석기로 찾는다. 생성자 매개변수를 찾는 그 순간 그 의존 빈의 `getBean`이 재귀로 돈다. 의존 그래프의 깊이 우선 순서로 빈이 만들어지는 이유다.

객체가 생기면 바로 [`applyMergedBeanDefinitionPostProcessors`(L577)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L577)가 돈다. 여기서 `AutowiredAnnotationBeanPostProcessor`는 [클래스를 훑어 `@Autowired`·`@Value`가 붙은 필드와 메서드 목록을 만들어 둔다(L279)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L279). `CommonAnnotationBeanPostProcessor`는 `@PostConstruct`·`@PreDestroy` 메서드를 찾아 둔다. 실제 주입과 호출은 뒤 단계에서 이 목록을 쓴다. 정의마다 한 번만 하므로 프로토타입 빈을 여러 번 만들어도 클래스를 다시 훑지 않는다.

@topic spring/bean-creation/populate-initialize

**내부 동작 ③ — 속성 채우기.** 이른 참조 등록({{ch:spring/dependency-injection}})을 거친 뒤 [`populateBean`(L1390)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1390)이 돈다.

- 먼저 [`postProcessAfterInstantiation`(L1418)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1418)이 `false`를 돌려주는 후처리기가 있으면 속성 채우기를 통째로 건너뛴다.
- XML 시절의 이름·타입 자동 연결(autowire mode)이 켜진 정의라면 여기서 처리한다. 애너테이션 방식에서는 꺼져 있다.
- 핵심은 [`postProcessProperties`(L1444)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1444)다. `AutowiredAnnotationBeanPostProcessor`가 [앞서 만든 주입 목록으로 값을 찾아 넣는다(L490)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L490). 필드라면 [리플렉션으로 `field.set`을 한다(L752)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L752).

**내부 동작 ④ — 초기화.** [`initializeBean`(L1797)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1797)은 {{fact:spring.initialize-bean.step-count}}로 이루어진다.

1. [`invokeAwareMethods`(L1803)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1803): `BeanNameAware`, `BeanClassLoaderAware`, `BeanFactoryAware`만 여기서 부른다. `ApplicationContextAware`·`EnvironmentAware` 같은 컨텍스트 쪽 `Aware`는 다음 단계의 `ApplicationContextAwareProcessor`가 부른다.
2. [`applyBeanPostProcessorsBeforeInitialization`(L1807)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1807): 모든 후처리기의 "초기화 전" 훅. `@PostConstruct`는 여기서 [`InitDestroyAnnotationBeanPostProcessor`(L214)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/InitDestroyAnnotationBeanPostProcessor.java#L214)가 부른다. 이 처리기의 하위 클래스인 `CommonAnnotationBeanPostProcessor`는 순서 값이 {{fact:spring.bpp.common-annotation.order}}인 `PriorityOrdered`지만, 빈 정의 병합 후처리기(`MergedBeanDefinitionPostProcessor`)이기도 해서 [등록 단계 끝에 다시 등록된다(L285)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/PostProcessorRegistrationDelegate.java#L285). 다시 등록하면 [목록에서 빼고 맨 뒤에 붙이므로(L987)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L987) 실행 순서는 순서를 정하지 않은 사용자 후처리기보다 **뒤** 가 된다.
3. [`invokeInitMethods`(L1811)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1811): `InitializingBean.afterPropertiesSet()` 다음에 정의에 적힌 초기화 메서드(`@Bean(initMethod = ..)`)를 부른다.
4. [`applyBeanPostProcessorsAfterInitialization`(L1818)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1818): "초기화 후" 훅. **AOP 자동 프록시 생성기가 여기서 원본을 프록시로 바꿔 돌려준다**({{ch:spring/proxies-aop}}). 이 반환값이 컨테이너에 등록되는 최종 빈이다.

마지막으로 [`registerDisposableBeanIfNecessary`(L641)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L641)가 `@PreDestroy`, `DisposableBean`, `destroyMethod`, `AutoCloseable` 같은 파괴 콜백이 있는 빈을 [종료 목록에 올린다(L1922)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanFactory.java#L1922). 프로토타입 빈은 등록되지 않는다. 컨테이너가 프로토타입의 종료를 책임지지 않는 이유다.

순서를 직접 찍어 보면 아래와 같다. 파일 이름은 `Probe.java`다.

```java
package com.example.demo;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.BeanNameAware;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

public class Probe implements BeanNameAware, InitializingBean {

    public Probe() { System.out.println("1 생성자"); }

    @Autowired
    void setEnvironment(Environment env) { System.out.println("2 @Autowired 세터"); }

    @Override
    public void setBeanName(String name) { System.out.println("3 BeanNameAware: " + name); }

    @PostConstruct
    void postConstruct() { System.out.println("5 @PostConstruct"); }

    @Override
    public void afterPropertiesSet() { System.out.println("6 afterPropertiesSet"); }

    void customInit() { System.out.println("7 initMethod"); }
}

 @Configuration(proxyBeanMethods = false)
class ProbeConfig {

    @Bean(initMethod = "customInit")
    Probe probe() { return new Probe(); }

    // static: 설정 클래스보다 먼저 만들 수 있게 한다
    @Bean
    static BeanPostProcessor tracer() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessBeforeInitialization(Object bean, String name) {
                if (bean instanceof Probe) System.out.println("4 사용자 BPP before");
                return bean;
            }
            @Override
            public Object postProcessAfterInitialization(Object bean, String name) {
                if (bean instanceof Probe) System.out.println("8 사용자 BPP after");
                return bean;
            }
        };
    }
}
```

사용자 후처리기의 "초기화 전" 훅(4)이 `@PostConstruct`(5)보다 먼저 찍힌다. 둘 다 같은 단계에서 돌지만, `@PostConstruct`를 부르는 내부 처리기가 목록 맨 뒤로 다시 등록되기 때문이다. 사용자 후처리기가 `@PostConstruct`가 끝난 상태를 전제해야 한다면 초기화 후 훅을 쓴다.

@topic spring/bean-creation/preinstantiate-lazy

**미리 만들기와 지연 초기화.** `refresh()`의 싱글톤 생성 단계({{ch:spring/startup-refresh}})는 [`DefaultListableBeanFactory.preInstantiateSingletons()`(L1102)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1102)다. 등록 순서대로 정의를 돌며 추상이 아닌 싱글톤을 만든다. [지연 초기화(lazy-init)가 아니면 만들고(L1189)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1189), 지연이면 건너뛴다. 모두 만든 뒤에는 [`SmartInitializingSingleton.afterSingletonsInstantiated()`(L1147)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1147)를 부른다. "다른 모든 싱글톤이 준비된 뒤"에 할 일을 두는 자리다. 정의에 백그라운드 초기화가 표시되어 있고 부트스트랩 실행기가 있으면 [다른 스레드에서 만든다(L1170)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1170). 설정하지 않으면 모두 시작 스레드에서 차례로 만든다.

지연 초기화는 두 가지로 켠다.

- 빈 하나: 클래스나 `@Bean` 메서드에 `@Lazy`.
- 앱 전체: `spring.main.lazy-initialization=true`. 기본값은 {{fact:spring.boot.lazy-initialization.default}}이다. 특정 빈만 다시 미리 만들려면 `@Lazy(false)`를 붙인다.

지연 빈도 **다른 미리 만드는 빈이 주입받으면 그때 만들어진다.** `@Lazy`는 "아무도 원하지 않으면 미루라"는 뜻이지 "절대 시작 때 만들지 마라"가 아니다. 주입 지점까지 늦추려면 주입받는 쪽에도 `@Lazy`를 붙여 프록시를 받아야 한다({{ch:spring/dependency-injection}}).

**실무 함정.**

- **생성자에서 `@Autowired` 필드를 쓴다.** 필드 주입은 속성 채우기 단계에서 일어나므로 생성자 안에서는 `null`이다. 생성자 주입으로 바꾸면 문제 자체가 사라진다.
- **`@PostConstruct`에서 자기 `@Transactional` 메서드를 부른다.** 초기화 콜백은 프록시가 만들어지기 전, 원본 객체에서 돈다. 트랜잭션도 다른 어드바이스도 걸리지 않는다. 공식 문서도 초기화 코드에서 프록시 기능에 기대지 말라고 한다. 이런 일은 `ApplicationRunner`나 `ApplicationReadyEvent` 리스너로 옮긴다.
- **`static` 필드에 `@Autowired`.** 정적 필드는 인스턴스마다 주입하는 대상이 아니라서 [INFO 로그 한 줄만 남기고 무시된다(L562)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.java#L562). 값은 `null`로 남는다.
- **지연 초기화를 켜서 시작 시간을 줄였다.** 설정 오류나 빠진 빈이 시작 때가 아니라 첫 요청 때 드러난다. 첫 요청의 응답도 느려진다. Boot 문서도 이 단점을 적고 있다. 운영 환경에서 켤 때는 시작 직후 주요 경로를 한 번씩 부르는 점검을 함께 둔다.
- **`BeanPostProcessor`가 `null`을 돌려준다.** 초기화 전·후 훅의 반환값이 다음 처리기로 넘어가고 결국 빈이 된다. 받은 객체를 바꾸지 않을 때는 그대로 돌려준다.

@quiz

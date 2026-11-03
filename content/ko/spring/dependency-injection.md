---
chapter: spring/dependency-injection
---

@topic spring/dependency-injection/styles

**겉 동작.** 의존성 주입(Dependency Injection)은 객체가 필요한 협력 객체를 스스로 만들거나 찾지 않고 **바깥에서 받는** 방식이다. Spring에서 받는 길은 셋이다.

| 방식 | 언제 들어오나 | 특징 |
|---|---|---|
| 생성자 주입 | 객체를 만드는 순간 | 필드를 `final`로 둘 수 있다. 빠진 의존이 있으면 객체가 아예 안 만들어진다 |
| 세터(메서드) 주입 | 객체를 만든 뒤 속성 채우기 단계 | 선택적 의존, 나중에 바꿀 수 있는 의존에 맞다 |
| 필드 주입 | 객체를 만든 뒤 속성 채우기 단계 | 코드는 짧지만 컨테이너 없이 테스트하기 어렵다 |

공식 문서는 필수 의존에는 생성자, 선택 의존에는 세터를 쓰라고 하고, Spring 팀은 생성자 주입을 권한다고 적는다. 이유는 앞 장의 생성 순서({{ch:spring/bean-creation}})에서 나온다.

- 생성자 주입은 **인스턴스화 단계**에서 끝난다. 객체가 존재하는 순간 의존이 모두 들어 있다. 필드·세터 주입은 그 뒤 `populateBean`에서 리플렉션으로 넣으므로, 생성자 안에서는 아직 `null`이다.
- 생성자 주입은 `new OrderService(fakeRepo)`처럼 평범한 Java로 테스트할 수 있다. 필드 주입은 리플렉션이나 컨테이너가 있어야 값을 넣을 수 있다.
- 생성자 매개변수가 많아지면 눈에 띈다. 문서도 매개변수가 많은 생성자는 책임이 너무 많다는 신호라고 한다.
- 순환 의존이 생기면 **시작 때 바로 실패한다.** 숨기지 않고 드러낸다. 아래에서 이유를 본다.

```java
package com.example.order;

import org.springframework.stereotype.Service;

 @Service
public class OrderService {
    private final OrderRepository orders;
    private final PaymentClient payments;

    // 생성자가 하나뿐이므로 @Autowired가 없어도 이 생성자로 주입된다
    public OrderService(OrderRepository orders, PaymentClient payments) {
        this.orders = orders;
        this.payments = payments;
    }
}
```

@topic spring/dependency-injection/resolution

**내부 동작 ① — 후보 고르기.** 매개변수든 필드든 주입 지점 하나는 `DependencyDescriptor`로 표현되고 [`DefaultListableBeanFactory.resolveDependency`(L1637)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1637)로 들어간다. 먼저 주입 지점의 **타입 모양** 으로 갈린다.

| 주입 지점 타입 | 처리 |
|---|---|
| `Optional<T>` | [없으면 `Optional.empty()`(L1641)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1641) |
| `ObjectProvider<T>`, `ObjectFactory<T>` | [지금 찾지 않고 꺼내는 객체를 준다(L1646)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1646). `getObject()`, `getIfAvailable()`을 부를 때 찾는다 |
| `@Lazy`가 붙은 지점 | [지연 해석 프록시를 준다(L1652)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1652). 프록시의 메서드가 처음 불릴 때 진짜 빈을 찾는다 |
| 그 밖 | [`doResolveDependency`(L1662)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1662)로 바로 찾는다 |

`doResolveDependency`는 다시 둘로 나뉜다. `List<T>`, `Map<String, T>`, 배열이면 [모든 후보를 모아 준다(L1718)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1718). 단일 값이면 [후보를 찾고(L1723)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1723), 없으면 [실패하고(L1732)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1732), 여럿이면 [하나를 고른다(L1742)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1742). 후보 찾기는 타입뿐 아니라 제네릭 인자(`Repository<Order>`와 `Repository<User>`를 구별한다)와 `@Qualifier`까지 맞춰 본다.

여럿 중 하나를 고르는 [`determineAutowireCandidate`(L2038)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L2038)의 순서는 이렇다.

1. `@Primary`가 붙은 후보([L2041](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L2041)). `@Fallback`이 붙은 후보는 거꾸로 다른 후보가 없을 때만 쓰인다.
2. 주입 지점의 **이름**(매개변수·필드 이름)과 같은 이름의 빈([L2046](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L2046)).
3. `@Qualifier` 값이 가리키는 이름의 빈([L2055](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L2055)).
4. `@Priority` 값이 가장 높은 빈([L2064](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L2064)).
5. 그래도 못 고르면 `NoUniqueBeanDefinitionException`으로 시작이 실패한다.

2번 때문에 생기는 함정이 있다. 결제 구현이 `tossPayment`와 `kakaoPayment` 두 빈일 때, 매개변수 이름을 `tossPayment`로 쓰면 아무 표시 없이 그 빈이 들어간다. 이름을 바꾸는 리팩터링 한 번에 주입 대상이 바뀌거나 시작이 깨진다. 의도를 코드에 남기려면 `@Qualifier`를 쓴다.

```java
package com.example.payment;

import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

 @Service
public class CheckoutService {
    private final PaymentGateway gateway;
    private final List<PaymentGateway> all;          // 모든 구현, @Order 순서
    private final ObjectProvider<FraudChecker> fraud; // 없을 수도 있는 의존

    public CheckoutService(@Qualifier("tossPayment") PaymentGateway gateway,
                           List<PaymentGateway> all,
                           ObjectProvider<FraudChecker> fraud) {
        this.gateway = gateway;
        this.all = all;
        this.fraud = fraud;
    }

    public void pay(long amount) {
        fraud.ifAvailable(f -> f.check(amount));
        gateway.charge(amount);
    }
}
```

> **설명 상자 — `@Lazy` 주입 지점의 정체.** `@Lazy`를 주입 지점에 붙이면 [`ContextAnnotationAutowireCandidateResolver`(L53)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ContextAnnotationAutowireCandidateResolver.java#L53)가 [`ProxyFactory`로 프록시를 만들어(L100)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/ContextAnnotationAutowireCandidateResolver.java#L100) 넣는다. 이 프록시의 대상(TargetSource)은 "부를 때마다 컨테이너에서 진짜 빈을 찾는" 객체다. 그래서 주입 시점에는 진짜 빈이 없어도 된다. 대신 첫 호출 때 찾다가 실패하면 그때 예외가 난다.

@topic spring/dependency-injection/singleton-caches

**내부 동작 ② — 싱글톤 레지스트리의 캐시.** 싱글톤은 [`DefaultSingletonBeanRegistry`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L86)에 보관된다. 캐시는 {{fact:spring.singleton-registry.cache-count}}다.

| 캐시 | 담는 것 |
|---|---|
| [`singletonObjects`(L86)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L86) | 생성이 끝난 완성품 |
| [`singletonFactories`(L89)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L89) | 만드는 중인 빈의 "이른 참조를 만들어 줄 함수" |
| [`earlySingletonObjects`(L95)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L95) | 그 함수로 한 번 만들어 낸 이른 참조 |

이른 참조 함수는 `doCreateBean`이 **객체를 만든 직후, 속성을 채우기 전에** 등록한다. 조건은 [싱글톤이고, 순환 참조가 허용되어 있고, 지금 만드는 중일 때(L589)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L589)다. 등록되는 함수는 [`getEarlyBeanReference`(L596)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L596)를 부르는 람다다.

세터나 필드로 서로를 주입받는 `A ↔ B`가 순환 참조 허용 상태에서 풀리는 과정은 이렇다.

1. `A`를 만들기 시작한다. 레지스트리가 [`A`를 "만드는 중" 목록에 넣는다(L539)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L539).
2. `A` 객체가 생성자로 만들어진다. 아직 `b` 필드는 비어 있다. `singletonFactories`에 `A`의 이른 참조 함수를 넣는다.
3. `A`의 속성 채우기에서 `B`가 필요하다. `getBean("b")` → `B` 객체 생성 → `B`의 속성 채우기에서 `A`가 필요하다.
4. `getBean("a")`의 [캐시 조회(L208)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L208)가 완성품 캐시에서 `A`를 못 찾는다. 그런데 `A`가 만드는 중이므로 `earlySingletonObjects`를 보고, 거기도 없으면 `singletonFactories`의 함수를 불러 이른 참조를 만들어 [옮겨 담는다(L229)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L229).
5. `B`는 덜 만든 `A`를 받고 생성을 마친다. `A`도 `B`를 받고 생성을 마친다.

**이 과정은 객체가 이미 존재해야 성립한다.** 2번에서 객체가 만들어졌기 때문에 4번에서 넘겨줄 것이 있다.

@topic spring/dependency-injection/cycles

**생성자 순환은 왜 풀리지 않나.** `A(B b)`와 `B(A a)`라면 `A` 객체를 만들려면 `B`가 먼저 있어야 한다. 2번 단계(객체 생성)에 도달하지 못하므로 이른 참조 함수가 등록되지 않는다. `B`를 만들다 다시 `getBean("a")`에 오면 캐시는 비어 있고, 생성을 새로 시작하려는 순간 [`beforeSingletonCreation`이 "이미 만드는 중"을 보고 `BeanCurrentlyInCreationException`을 던진다(L541)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java#L541). 공식 문서도 생성자 주입끼리의 순환은 풀 수 없고 이 예외가 난다고 적는다.

**Spring Boot는 세터·필드 순환도 막는다.** Framework 자체의 기본값은 [`allowCircularReferences = true`(L131)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L131), 즉 {{fact:spring.circular.framework.default}}이다. Boot는 [`spring.main.allow-circular-references`(L37)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/ApplicationProperties.java#L37) 기본값 {{fact:spring.circular.boot.default}}를 [컨텍스트 준비 때 공장에 넣는다(L376)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L376). 그러면 위 4번의 이른 참조 등록 조건이 거짓이 되어 세터·필드 순환도 실패한다. 실패 분석기는 순환 경로를 그림으로 보여 주고 [순환 참조에 기대지 말라는 문장(L57)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/diagnostics/analyzer/BeanCurrentlyInCreationFailureAnalyzer.java#L57)을 붙인다.

```text
The dependencies of some of the beans in the application context form a cycle:
┌─────┐
|  orderService defined in file [.../OrderService.class]
↑     ↓
|  paymentService defined in file [.../PaymentService.class]
└─────┘
```

**프록시와 이른 참조.** 순환 참조를 허용했을 때 더 깊은 문제가 있다. `A`에 `@Transactional`이 있으면 최종 빈은 `A`의 프록시다. 그런데 `B`는 4번에서 **초기화 전의 `A`** 를 받았다. 이 어긋남을 막으려고 이른 참조 함수는 [`SmartInstantiationAwareBeanPostProcessor.getEarlyBeanReference`를 차례로 부른다(L966)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L966). AOP 자동 프록시 생성기는 이 훅에서 [프록시를 미리 만들어 주고 원본을 기억해 둔다(L237)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L237). 나중에 초기화 후 훅에서는 [이미 프록시를 만든 원본이면 다시 감싸지 않는다(L288)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L288). 그래서 `B`가 받은 이른 참조와 최종 빈이 같은 프록시가 된다.

이른 참조 훅이 없는 후처리기가 초기화 후에 빈을 감싸면 이 장치가 통하지 않는다. `@Async`를 처리하는 후처리기의 부모 [`AbstractAdvisingBeanPostProcessor`(L38)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/AbstractAdvisingBeanPostProcessor.java#L38)가 그런 예다. 이때 `doCreateBean`은 [다른 빈이 원본을 받았는데 최종 빈은 감싸졌다는 오류(L628)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L628)로 시작을 멈춘다.

> **설명 상자 — 이른 참조(early reference).** 생성은 됐지만 속성 채우기와 초기화가 끝나지 않은 빈을 가리키는 참조다. 받은 쪽은 그 시점에 상대의 필드가 비어 있을 수 있고, 프록시가 아닌 원본일 수도 있다. 순환을 "허용한다"는 것은 이런 덜 된 객체가 다른 빈에 들어가는 것을 허용한다는 뜻이다.

@topic spring/dependency-injection/pitfalls

**실무 함정과 대처.** 순환이 시작 오류로 드러나면 설정을 켜기 전에 구조부터 본다.

- **`allow-circular-references=true`로 덮는다.** 덜 만든 객체가 주입되고, 위의 프록시 어긋남 오류를 만날 수 있다. 생성자 순환은 이 설정으로도 풀리지 않는다.
- **필드 주입으로 바꿔 순환을 숨긴다.** Boot 기본값에서는 필드 순환도 실패한다. 실패하지 않게 설정을 바꾸면 위와 같다.
- **`@Lazy`나 `ObjectProvider`로 끊는다.** 시작은 되지만 순환 구조는 그대로 남는다. 급한 장애를 막는 임시 수단으로만 쓰고 이유를 주석으로 남긴다.
- **구조로 푼다.** 두 서비스가 서로를 부르는 이유는 대개 "둘 다 쓰는 작은 일"이 한쪽에 들어가 있기 때문이다. 그 일을 세 번째 빈으로 빼거나, 한 방향 호출을 이벤트로 바꾼다({{ch:spring/events}}).
- **같은 타입 빈이 여럿인데 이름에 기댄다.** 매개변수 이름 일치는 조용히 동작한다. `@Qualifier` 또는 `@Primary`로 명시한다.

@design

@quiz

---
chapter: spring/proxies-aop
---

@topic spring/proxies-aop/overview

**겉 동작.** `@Transactional`, `@Async`, `@Cacheable`, 직접 만든 `@Aspect`는 모두 같은 방식으로 동작한다. 컨테이너가 빈을 만든 뒤 **프록시(proxy)로 바꿔 끼우고**, 다른 빈에는 그 프록시를 주입한다. 호출은 프록시에 먼저 도착하고, 프록시가 부가 기능(트랜잭션 시작, 다른 스레드로 넘기기, 캐시 조회)을 한 뒤 진짜 객체(대상, target)를 부른다.

```text
Controller ──▶ OrderService$$SpringCGLIB$$0 (프록시) ──▶ OrderService (대상)
                 └ 트랜잭션 인터셉터, 사용자 Aspect ...
```

이 구조에서 실무 규칙 두 가지가 나온다. 첫째, **프록시를 거치는 호출만** 부가 기능을 받는다. 대상 객체 안에서 `this.other()`로 부르면 프록시를 건너뛴다. 둘째, **프록시가 가로챌 수 있는 메서드만** 부가 기능을 받는다. 어떤 메서드를 가로챌 수 있는지는 프록시 종류에 달려 있다.

> **설명 상자 — 프록시의 두 종류.** **JDK 동적 프록시**는 JDK의 `java.lang.reflect.Proxy`가 실행 중에 **인터페이스를 구현하는** 새 클래스를 만든다. 인터페이스에 있는 메서드만 가로챌 수 있고, 주입받는 쪽도 인터페이스 타입으로 받아야 한다. **CGLIB 프록시**는 실행 중에 **대상 클래스를 상속하는** 하위 클래스를 바이트코드로 만든다. 클래스 타입으로 주입받을 수 있지만, 상속으로 덮어쓸 수 없는 것(`final` 클래스·메서드, `private` 메서드)은 가로채지 못한다. Spring은 CGLIB를 `org.springframework.cglib` 패키지로 내장하고 있다.

@topic spring/proxies-aop/auto-proxy

**내부 동작 ① — 누가 언제 감싸나.** 감싸는 일은 `BeanPostProcessor`인 [`AbstractAutoProxyCreator`](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L285)가 한다. `@EnableAspectJAutoProxy`나 `@EnableTransactionManagement`가 이 처리기의 하위 클래스를 등록하고, 여러 설정이 있어도 하나의 처리기로 합쳐진다. 빈 생성 순서({{ch:spring/bean-creation}})의 맨 끝, [`postProcessAfterInitialization`(L285)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L285)에서 돈다.

1. 순환 참조 때문에 [이미 이른 프록시를 만든 빈이면 건너뛴다(L288)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L288)({{ch:spring/dependency-injection}}).
2. [`wrapIfNecessary`(L321)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L321): 어드바이스·포인트컷 같은 [AOP 기반 시설 빈이면 감싸지 않는다(L328)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L328).
3. [이 빈에 적용되는 어드바이저 목록을 구한다(L334)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L334). 컨테이너의 모든 `Advisor` 빈과 `@Aspect` 빈에서 만든 어드바이저 중, 포인트컷이 이 클래스의 메서드 하나라도 맞는 것만 남긴다. `@Transactional`의 어드바이저는 "메서드나 클래스에 `@Transactional`이 있는가"를 포인트컷으로 쓴다.
4. 목록이 비어 있지 않으면 [원본을 `SingletonTargetSource`로 감싸 프록시를 만든다(L337)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/autoproxy/AbstractAutoProxyCreator.java#L337). 비어 있으면 원본을 그대로 돌려준다.

그래서 **같은 클래스의 빈이라도 어노테이션이 하나도 맞지 않으면 프록시가 아니다.** 반대로 `@Transactional` 메서드가 하나만 있어도 빈 전체가 프록시가 된다.

@topic spring/proxies-aop/jdk-vs-cglib

**내부 동작 ② — 어떤 프록시를 만드나.** 프록시 종류는 [`DefaultAopProxyFactory.createAopProxy`(L60)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/DefaultAopProxyFactory.java#L60)가 정한다.

- [클래스 프록시 강제(proxyTargetClass)가 켜졌거나, 사용자 인터페이스가 없으면(L61)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/DefaultAopProxyFactory.java#L61) CGLIB. 단, 대상이 인터페이스이거나 이미 JDK 프록시이거나 람다면 [JDK 프록시(L69)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/DefaultAopProxyFactory.java#L69).
- 그 밖에는 [JDK 프록시(L74)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/DefaultAopProxyFactory.java#L74).

`proxyTargetClass`의 기본값이 Framework와 Boot에서 다르다.

| 환경 | 기본값 | 결과 |
|---|---|---|
| Spring Framework만 | [{{fact:spring.aop.proxy-target-class.framework.default}}(L70)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/ProxyConfig.java#L70) | 인터페이스를 구현한 빈은 JDK 프록시 |
| Spring Boot | [`spring.aop.proxy-target-class` 기본 {{fact:spring.aop.proxy-target-class.boot.default}}(L51)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/aop/AopAutoConfiguration.java#L51) | 인터페이스가 있어도 CGLIB |

Boot의 트랜잭션 자동 구성도 [같은 속성으로 프록시 종류를 정한다(L70)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/module/spring-boot-transaction/src/main/java/org/springframework/boot/transaction/autoconfigure/TransactionAutoConfiguration.java#L70). Boot에서 `spring.aop.proxy-target-class=false`로 바꾸면, `OrderService` 인터페이스의 구현 클래스 `OrderServiceImpl`을 **클래스 타입으로** 주입받던 곳이 `BeanNotOfRequiredTypeException`("expected to be of type ... but was actually of type jdk.proxy...")으로 시작에 실패한다. 프록시는 인터페이스만 구현할 뿐 구현 클래스의 하위 타입이 아니기 때문이다.

CGLIB 프록시를 만들 때 Spring은 대상 클래스를 검사해 [가로챌 수 없는 `final` 메서드가 있으면 로그를 남긴다(L299)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/CglibAopProxy.java#L299). 공식 문서가 정리한 제약은 이렇다.

- `final` 클래스는 상속할 수 없으므로 클래스 프록시를 만들 수 없다. 시작이 실패한다.
- `final` 메서드, `private` 메서드는 덮어쓸 수 없으므로 어드바이스가 걸리지 않는다. **오류 없이 조용히** 원본이 불린다.
- 다른 패키지의 부모 클래스에 있는 package-private 메서드처럼 하위 클래스에서 보이지 않는 메서드도 같다.

Java `record`와 Kotlin 클래스는 기본이 `final`이다. 서비스 빈을 record로 만들면 `@Transactional`을 붙일 수 없다.

@topic spring/proxies-aop/chain

**내부 동작 ③ — 호출이 사슬을 지나는 방법.** JDK 프록시라면 [`JdkDynamicAopProxy.invoke`(L166)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/JdkDynamicAopProxy.java#L166), CGLIB라면 [`DynamicAdvisedInterceptor.intercept`(L691)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/CglibAopProxy.java#L691)가 호출을 받는다. 둘이 하는 일은 같다.

1. 이 메서드에 맞는 [인터셉터 사슬을 구한다(L206)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/JdkDynamicAopProxy.java#L206). 결과는 메서드별로 캐시된다.
2. 사슬이 비어 있으면 리플렉션으로 대상을 바로 부른다.
3. 아니면 [`ReflectiveMethodInvocation`을 만들어(L220)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/JdkDynamicAopProxy.java#L220) `proceed()`를 부른다.

[`proceed()`(L155)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/ReflectiveMethodInvocation.java#L155)는 인덱스 하나로 사슬을 걷는다. [마지막을 지났으면 대상 메서드를 부르고(L158)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/ReflectiveMethodInvocation.java#L158), 아니면 [다음 인터셉터의 `invoke(this)`를 부른다(L179)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/ReflectiveMethodInvocation.java#L179). 인터셉터는 자기 일을 하다가 `invocation.proceed()`를 불러 다음으로 넘긴다. 그래서 사슬은 양파 모양이다. 먼저 들어간 인터셉터가 가장 나중에 빠져나온다.

```java
package com.example.aop;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

 @Aspect
 @Component
 @Order(0) // 값이 작을수록 바깥쪽. 트랜잭션 어드바이저 기본 순서는 가장 낮은 우선순위다
public class TimingAspect {

    @Around("execution(* com.example.order..*Service.*(..))")
    public Object time(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed(); // 다음 인터셉터 → ... → 대상 메서드
        } finally {
            System.out.printf("%s %d µs%n", pjp.getSignature().toShortString(),
                    (System.nanoTime() - start) / 1_000);
        }
    }
}
```

`@Order(0)`이면 이 측정은 트랜잭션 인터셉터 바깥에서 돈다. 측정 시간에 커밋 시간이 들어간다. 순서를 반대로 하면 트랜잭션 안쪽의 시간만 잰다. `@Aspect`를 쓰려면 AspectJ 위버(`aspectjweaver`)가 클래스패스에 있어야 한다. 없으면 Boot는 [AspectJ 자동 프록시 설정을 건너뛴다(L39)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/aop/AopAutoConfiguration.java#L39).

@topic spring/proxies-aop/pitfalls

**실무 함정 1 — 자기 호출(self-invocation).** 가장 흔하다.

```java
package com.example.report;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

 @Service
public class ReportService {
    public void rebuildAll() {
        for (long id : ids()) {
            rebuild(id); // this.rebuild(id): 프록시를 거치지 않는다
        }
    }

    @Transactional
    public void rebuild(long id) { /* ... */ }

    private List<Long> ids() { return List.of(1L, 2L); }
}
```

컨트롤러가 `rebuildAll()`을 부르면 호출은 프록시를 지나 대상 객체로 들어간다. 그 안의 `rebuild(id)`는 대상 객체의 `this`에서 부르므로 사슬을 다시 지나지 않는다. CGLIB 프록시도 같다. Spring의 CGLIB 프록시는 대상 객체를 따로 두고 위임하는 구조라서, 대상 안의 `this`는 프록시가 아니다. 공식 문서도 프록시 방식에서는 바깥에서 들어온 호출만 가로챈다고 적는다.

대처는 순서대로 고른다.

- **다른 빈으로 나눈다.** `rebuild`를 `ReportRebuilder` 빈으로 옮기고 주입받아 부른다. 가장 단순하고 의도가 드러난다.
- **자기 프록시를 주입받는다.** `@Lazy`로 자기 자신(`ReportService self`)을 주입받아 `self.rebuild(id)`. 동작하지만 구조가 숨는다.
- **`AopContext.currentProxy()`.** 프록시 설정의 `exposeProxy`(기본 {{fact:spring.aop.expose-proxy.default}})를 켜면 [호출 동안 현재 프록시를 스레드에 보관한다(L196)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/framework/JdkDynamicAopProxy.java#L196). 코드가 Spring AOP에 묶인다.
- **AspectJ 위빙.** 바이트코드에 직접 넣으므로 자기 호출도 가로챈다. 빌드·실행 설정이 필요하다.

**실무 함정 2 — `private`·`final` 메서드.** 위에서 본 대로 조용히 무시된다. IDE 경고에 기대지 말고, 부가 기능이 필요한 메서드는 프록시가 덮어쓸 수 있게 둔다.

**실무 함정 3 — 초기화 콜백에서 부가 기능을 기대한다.** `@PostConstruct`는 프록시가 만들어지기 전에 원본에서 돈다({{ch:spring/bean-creation}}).

**실무 함정 4 — `getClass()`로 타입을 판단한다.** CGLIB 프록시의 `getClass()`는 `OrderService$$SpringCGLIB$$0`이다. 진짜 클래스는 [`AopUtils.getTargetClass`(L123)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/support/AopUtils.java#L123)로 구한다. 프록시인지는 [`AopUtils.isAopProxy`(L82)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/support/AopUtils.java#L82), 종류는 [`isJdkDynamicProxy`(L96)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/support/AopUtils.java#L96)·[`isCglibProxy`(L109)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-aop/src/main/java/org/springframework/aop/support/AopUtils.java#L109)로 확인한다.

```java
package com.example.order;

import org.springframework.aop.support.AopUtils;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

 @Configuration(proxyBeanMethods = false)
class ProxyReportConfig {
    @Bean
    ApplicationRunner proxyReport(OrderService orderService) {
        return args -> System.out.printf("proxy=%s cglib=%s target=%s%n",
                AopUtils.isAopProxy(orderService),
                AopUtils.isCglibProxy(orderService),
                AopUtils.getTargetClass(orderService).getSimpleName());
    }
}
```

트랜잭션이 안 걸리는 것 같으면 이 출력부터 본다. `proxy=false`면 어드바이저가 이 빈에 맞지 않은 것이고, `proxy=true`인데도 안 걸리면 자기 호출이나 `private`·`final` 메서드를 의심한다.

@quiz

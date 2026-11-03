---
chapter: spring/container
---

@topic spring/container/beanfactory-vs-context

**겉 동작.** Spring 컨테이너를 가리키는 인터페이스는 둘이다. `BeanFactory`는 "이름이나 타입을 주면 빈을 돌려준다"는 기본 계약(`getBean`)이다. `ApplicationContext`는 그 위에 실무에 필요한 기능을 얹은 것이다. 애플리케이션 코드는 거의 항상 `ApplicationContext`를 쓴다. Spring Boot의 `SpringApplication.run(..)`이 돌려주는 것도 `ApplicationContext`다.

| 기능 | BeanFactory만 | ApplicationContext |
|---|---|---|
| 빈 생성과 의존성 연결 | 한다 | 한다 |
| 생명주기 관리(시작·정지 콜백) | 하지 않는다 | 한다 |
| `BeanPostProcessor`·`BeanFactoryPostProcessor` 자동 등록 | 하지 않는다 | 한다 |
| 메시지(국제화), 이벤트 발행 | 없다 | 있다 |

**내부 동작.** [`ApplicationContext` 선언(L59)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/ApplicationContext.java#L59)을 보면 `ListableBeanFactory`, `HierarchicalBeanFactory`에 더해 `MessageSource`, `ApplicationEventPublisher`, `ResourcePatternResolver`, `EnvironmentCapable`을 함께 상속한다. 즉 컨텍스트는 "빈 공장 + 메시지 + 이벤트 + 리소스 읽기 + 환경 설정"을 한 객체로 묶은 것이다.

그런데 컨텍스트가 빈 공장 기능을 직접 구현하지는 않는다. 주로 쓰이는 `GenericApplicationContext` 계열은 안에 [`DefaultListableBeanFactory`를 필드로 하나 들고(L108)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/support/GenericApplicationContext.java#L108) `getBean` 요청을 그쪽으로 넘긴다. 컨텍스트가 더하는 핵심은 **"언제 무엇을 부를지"를 정한 시작 절차** 다. 후처리기를 찾아 등록하고, 싱글톤을 미리 만들고, 이벤트를 보내는 순서가 `refresh()`에 들어 있다({{ch:spring/startup-refresh}}).

> **설명 상자 — 후처리기 두 종류.** `BeanFactoryPostProcessor`는 **빈 정의**(설계도)를 고치는 확장 지점이다. 빈 객체가 만들어지기 전에 돈다. `BeanPostProcessor`는 **빈 객체**를 받아 고치거나 바꿔 끼우는 확장 지점이다. 빈마다 만든 직후에 돈다. `@Autowired` 처리, `@PostConstruct` 호출, AOP 프록시 생성이 모두 `BeanPostProcessor`가 하는 일이다.

@topic spring/container/bean-definition

**빈 정의(BeanDefinition)는 설계도다.** 빈은 그 설계도로 만든 객체다. 컨테이너는 객체를 만들기 전에 먼저 설계도를 모은다. [`BeanDefinition` 인터페이스(L42)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/config/BeanDefinition.java#L42)가 담는 정보는 다음과 같다.

| 항목 | 뜻 |
|---|---|
| 클래스 이름 | 만들 클래스. `@Bean` 메서드라면 비어 있을 수 있다 |
| 스코프 | 싱글톤, 프로토타입 등. 기본값은 빈 문자열이고 싱글톤으로 다룬다 |
| 지연 초기화(lazy-init) | 시작 때 미리 만들지, 처음 요청할 때 만들지 |
| depends-on, primary | 먼저 만들어야 할 빈, 같은 타입 후보 중 우선할 빈 |
| 팩터리 빈 이름·팩터리 메서드 이름 | `@Bean` 메서드로 만드는 빈이면 "어느 설정 빈의 어느 메서드를 부를지" |
| 생성자 인자, 프로퍼티 값 | XML·프로그래밍 방식으로 미리 정한 값 |
| 초기화·파괴 메서드 이름 | 만든 뒤와 종료 때 부를 메서드 |
| 역할(role) | 애플리케이션 빈인지, 프레임워크 내부(인프라) 빈인지 |

스코프 기본값이 빈 문자열인 것은 [`AbstractBeanDefinition.SCOPE_DEFAULT`(L68)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractBeanDefinition.java#L68)에서 확인할 수 있다. `@Bean` 메서드로 만든 빈은 클래스 이름 대신 [팩터리 빈 이름(L213)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/config/BeanDefinition.java#L213)과 [팩터리 메서드 이름(L232)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/config/BeanDefinition.java#L232)을 채운다.

실행 중인 Boot 앱에서 정의를 직접 볼 수 있다.

```java
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

 @SpringBootApplication
public class InspectApp {
    public static void main(String[] args) {
        ConfigurableApplicationContext ctx = SpringApplication.run(InspectApp.class, args);
        ConfigurableListableBeanFactory bf = ctx.getBeanFactory();
        for (String name : bf.getBeanDefinitionNames()) {
            BeanDefinition bd = bf.getBeanDefinition(name);
            if (bd.getRole() == BeanDefinition.ROLE_APPLICATION) {
                System.out.printf("%s class=%s scope='%s' lazy=%s factory=%s#%s%n",
                        name, bd.getBeanClassName(), bd.getScope(), bd.isLazyInit(),
                        bd.getFactoryBeanName(), bd.getFactoryMethodName());
            }
        }
    }
}
```

`@Component` 클래스는 `class=`가 채워지고, `@Bean` 메서드 빈은 `class=null`에 `factory=설정빈#메서드`가 찍힌다. 둘은 같은 설계도 형식으로 저장되고, 만드는 방법만 다르다.

@topic spring/container/registry-dlbf

**등록 창구: `BeanDefinitionRegistry`.** 빈 정의를 넣고 빼는 인터페이스다. 핵심 메서드는 [`registerBeanDefinition(이름, 정의)`(L61)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/BeanDefinitionRegistry.java#L61)이다. 컴포넌트 스캔도, `@Bean` 처리도, Boot 자동 구성도 결국 이 메서드를 부른다.

**핵심 구현: `DefaultListableBeanFactory`.** [이 클래스(L132)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L132)가 레지스트리이면서 빈 공장이다. 정의는 [`beanDefinitionMap`(L191)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L191)에 이름을 키로 들어가고, 등록 순서는 따로 목록으로 기억한다. 만든 싱글톤 객체는 정의와 다른 곳(싱글톤 캐시)에 보관된다. **정의를 등록하는 것과 객체를 만드는 것은 별개의 일이다.**

```java
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.beans.factory.support.RootBeanDefinition;
import jakarta.annotation.PostConstruct;

public class PlainFactoryDemo {
    public static class Greeter {
        @PostConstruct
        void init() { System.out.println("init 호출됨"); }
        String hello() { return "hi"; }
    }

    public static void main(String[] args) {
        var factory = new DefaultListableBeanFactory();
        factory.registerBeanDefinition("greeter", new RootBeanDefinition(Greeter.class));
        System.out.println(factory.containsSingleton("greeter")); // false: 정의만 있다
        Greeter g = factory.getBean(Greeter.class);               // 이때 처음 만든다
        System.out.println(factory.containsSingleton("greeter")); // true
        System.out.println(g.hello());                            // "init 호출됨"은 찍히지 않는다
    }
}
```

마지막 줄에서 `@PostConstruct`가 불리지 않는 이유는 위 표의 "후처리기 자동 등록"이 없어서다. `@PostConstruct`를 처리하는 `CommonAnnotationBeanPostProcessor`를 아무도 등록하지 않았다. 컨텍스트를 쓰면 이 일이 자동으로 된다.

**같은 이름으로 다시 등록하면.** [`registerBeanDefinition`(L1252)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1252)은 같은 이름의 정의가 이미 있으면 덮어쓰기가 허용되는지 보고, 허용되지 않으면 [`BeanDefinitionOverrideException`을 던진다(L1271)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultListableBeanFactory.java#L1271). 기본값은 프레임워크와 Boot가 다르다.

| 환경 | 같은 이름 덮어쓰기 기본값 |
|---|---|
| Spring Framework만 | {{fact:spring.override.framework.default}} |
| Spring Boot | {{fact:spring.override.boot.default}}. `SpringApplication`이 [컨텍스트 준비 중에 이 값을 공장에 넣는다(L378)](https://github.com/spring-projects/spring-boot/blob/v4.1.2/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#L378) |

@topic spring/container/annotation-registration

**애너테이션 설정은 어떻게 정의가 되나.** `new AnnotationConfigApplicationContext(AppConfig.class)`를 따라가면 객체를 하나도 만들기 전에 정의가 쌓이는 과정이 보인다.

1. [생성자(L68)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigApplicationContext.java#L68)가 `AnnotatedBeanDefinitionReader`를 만든다. 이 리더는 [`AnnotationConfigUtils.registerAnnotationConfigProcessors`를 부른다(L90)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotatedBeanDefinitionReader.java#L90).
2. [이 메서드(L143)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigUtils.java#L143)는 프레임워크 내부 빈의 **정의** 를 등록한다. [`ConfigurationClassPostProcessor`(L159)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigUtils.java#L159), [`AutowiredAnnotationBeanPostProcessor`(L165)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigUtils.java#L165), [`CommonAnnotationBeanPostProcessor`(L172)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigUtils.java#L172) 등이다.
3. [`register(AppConfig.class)` 뒤 `refresh()`(L91–L92)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-context/src/main/java/org/springframework/context/annotation/AnnotationConfigApplicationContext.java#L91). 이 시점의 레지스트리에는 내부 처리기 몇 개와 `AppConfig` 정의 하나만 있다. `@Service` 클래스들은 아직 정의조차 없다.
4. `refresh()` 안에서 `ConfigurationClassPostProcessor`가 `AppConfig`를 읽고 `@ComponentScan`, `@Import`, `@Bean`을 처리해 나머지 정의를 모두 등록한다. 이 처리기도 `BeanFactoryPostProcessor`라서 애플리케이션 빈이 만들어지기 **전에** 돈다({{ch:spring/configuration}}).
5. 정의가 다 모이면 그때 싱글톤을 만든다.

Spring Boot도 같다. `SpringApplication`은 컨텍스트를 준비할 때 `main` 클래스 하나만 정의로 넣고, 나머지는 `refresh()` 안에서 같은 처리기가 채운다({{ch:spring/startup-refresh}}).

**실무 함정.**

- **Boot에서 같은 이름의 빈이 둘이면 시작이 실패한다.** 서로 다른 설정 클래스에 같은 이름의 `@Bean` 메서드(`dataSource()` 등)를 두면 두 번째 등록이 `BeanDefinitionOverrideException`으로 끝난다. 프레임워크 단독 예제에서는 조용히 덮어써지던 코드가 Boot로 옮기면 깨지는 이유다. 이름을 다르게 하거나, 같은 타입 중 하나를 고르려면 `@Primary`나 `@Qualifier`를 쓴다. `spring.main.allow-bean-definition-overriding=true`는 어느 정의가 이겼는지 감추므로 마지막 수단이다.
- **`BeanFactory`를 직접 만들어 쓰면 애너테이션이 동작하지 않는다.** 위 예처럼 후처리기가 없어서다. 테스트에서 가볍게 쓰려고 `DefaultListableBeanFactory`를 만들었다면 `@Autowired`, `@PostConstruct`가 무시된다는 것을 기억한다.
- **"정의가 있다"와 "객체가 있다"를 섞지 않는다.** 정의 단계에서 도는 코드(`BeanFactoryPostProcessor`, 조건 판단)는 빈 객체를 찾으면 안 된다. 찾는 순간 그 빈이 너무 일찍 만들어진다. 이유는 {{ch:spring/startup-refresh}}에서 본다.

@quiz

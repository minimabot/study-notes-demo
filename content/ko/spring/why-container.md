---
chapter: spring/why-container
---

@topic spring/why-container/by-hand

이 장은 Spring을 처음 쓰는 백엔드 개발자를 위한 출발점이다. 컨테이너가 하는 일을 먼저 손으로 해 보고, 그중 무엇을 컨테이너가 넘겨받는지 본다. 대상 버전은 Spring Framework 7.0.8, Spring Boot 4.1.2, Java 25다.

**겉 동작.** 주문을 받는 작은 서비스를 생각한다. `OrderService`는 저장소(`OrderRepository`)와 결제 클라이언트(`PaymentClient`)가 필요하고, 둘은 설정 값(DB 주소, 결제 서버 주소)이 필요하다. Spring 없이 조립하면 `main`이 모든 객체를 직접 만든다.

```java
import java.util.Map;

interface OrderRepository { void save(String orderId); }
interface PaymentClient { void charge(String orderId, long amount); }

record AppConfig(String dbUrl, String paymentBaseUrl) {
    static AppConfig from(Map<String, String> env) {
        return new AppConfig(env.getOrDefault("DB_URL", "jdbc:h2:mem:app"),
                env.getOrDefault("PAY_URL", "http://localhost:9000"));
    }
}

final class JdbcOrderRepository implements OrderRepository {
    private final String url;
    JdbcOrderRepository(String url) { this.url = url; }
    public void save(String orderId) { System.out.println("save " + orderId + " -> " + url); }
}

final class HttpPaymentClient implements PaymentClient {
    private final String baseUrl;
    HttpPaymentClient(String baseUrl) { this.baseUrl = baseUrl; }
    public void charge(String orderId, long amount) { System.out.println("charge " + amount + " @ " + baseUrl); }
}

class OrderService {
    private final OrderRepository repository;
    private final PaymentClient payment;
    OrderService(OrderRepository repository, PaymentClient payment) {
        this.repository = repository;
        this.payment = payment;
    }
    void place(String orderId, long amount) {
        payment.charge(orderId, amount);
        repository.save(orderId);
    }
}

public class App {
    public static void main(String[] args) {
        AppConfig config = AppConfig.from(System.getenv());                    // ① 설정을 읽는다
        OrderRepository repository = new JdbcOrderRepository(config.dbUrl());  // ② 의존 대상부터 만든다
        PaymentClient payment = new HttpPaymentClient(config.paymentBaseUrl());
        OrderService service = new OrderService(repository, payment);         // ③ 생성자로 넘긴다
        service.place("o-1", 1000);
    }
}
```

생성자로 의존 대상을 받는 것 자체가 **의존성 주입(Dependency Injection)** 이다. Spring이 없어도 이 방식은 좋은 설계다. 문제는 객체가 늘어날 때 `main`이 떠안는 일이다.

- **순서.** 의존 대상을 먼저 만들어야 한다. 객체가 수백 개면 `main`은 의존 그래프를 손으로 정렬하는 코드가 된다.
- **하나만 만들기.** `OrderService`를 두 곳에서 쓰면 같은 인스턴스를 넘겨야 한다. `getInstance()` 같은 정적 싱글톤으로 풀면 테스트에서 가짜 객체로 바꾸기 어렵다.
- **정리.** 커넥션 풀, 스레드 풀은 끝날 때 닫아야 하고, 만든 순서의 역순으로 닫아야 안전하다.
- **공통 관심사.** 트랜잭션 시작·커밋, 실행 시간 측정 같은 코드를 메서드마다 반복하지 않으려면 객체를 다른 객체로 감싸야 한다. 그러면 `main`은 `new TimedOrderService(new OrderService(...))`처럼 감싸는 순서까지 알아야 한다.
- **설정.** 개발·운영 환경마다 값과 구성이 다르다. 분기가 `main`에 쌓인다.

@topic spring/why-container/what-container-takes

**컨테이너가 넘겨받는 것.** Spring의 IoC 컨테이너는 위 목록을 대신한다. `new`가 사라지는 것이 아니다. `new`를 부르는 곳이 `main`에서 컨테이너 안으로 옮겨질 뿐이다.

| 손으로 하던 일 | 컨테이너가 하는 방식 |
|---|---|
| 무엇을 어떻게 만들지 적기 | 클래스마다 **빈 정의(BeanDefinition)** 를 등록한다({{ch:spring/container}}) |
| 의존 순서 맞추기 | 생성자 매개변수를 보고 필요한 빈을 먼저 만든다({{ch:spring/dependency-injection}}) |
| 하나만 만들기 | 기본 스코프가 싱글톤이고 컨테이너가 인스턴스를 보관한다({{ch:spring/scopes}}) |
| 닫기 | 종료 때 파괴 콜백을 부른다({{ch:spring/bean-lifecycle}}) |
| 감싸기 | 빈을 만든 직후 프록시로 바꿔 끼운다({{ch:spring/proxies-aop}}) |
| 환경별 설정 | `Environment`, `@Configuration`, 조건부 자동 구성({{ch:spring/configuration}}) |

같은 앱을 Spring Boot로 쓰면 이렇다.

```java
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;

 @SpringBootApplication
public class App {
    public static void main(String[] args) {
        SpringApplication.run(App.class, args);
    }
}

 @Repository
class JdbcOrderRepository implements OrderRepository {
    private final String url;
    JdbcOrderRepository(@Value("${app.db-url:jdbc:h2:mem:app}") String url) { this.url = url; }
    public void save(String orderId) { System.out.println("save " + orderId + " -> " + url); }
}

 @Component
class HttpPaymentClient implements PaymentClient {
    private final String baseUrl;
    HttpPaymentClient(@Value("${app.pay-url:http://localhost:9000}") String baseUrl) { this.baseUrl = baseUrl; }
    public void charge(String orderId, long amount) { System.out.println("charge " + amount + " @ " + baseUrl); }
}

 @Service
class OrderService {
    private final OrderRepository repository;
    private final PaymentClient payment;
    OrderService(OrderRepository repository, PaymentClient payment) { // 생성자가 하나면 그대로 주입 대상
        this.repository = repository;
        this.payment = payment;
    }
}
// OrderRepository, PaymentClient 인터페이스는 앞 예제와 같다
```

`main`에는 객체를 만드는 코드가 없다. 설정 값은 `@Value`로, 의존 대상은 생성자 매개변수로 컨테이너가 채운다.

**내부 동작 미리 보기.** 컨테이너는 두 단계로 일한다.

1. **정의 단계.** 클래스패스를 훑고 설정 클래스를 읽어 "무엇을 어떻게 만들지"를 빈 정의로 모은다. 이때는 애플리케이션 객체를 만들지 않는다.
2. **인스턴스 단계.** 정의를 하나씩 꺼내 리플렉션으로 생성자를 부르고, 만든 직후 후처리기(`BeanPostProcessor`)에 넘긴다. 후처리기가 원래 객체 대신 프록시를 돌려주면 컨테이너는 그 프록시를 빈으로 보관한다.

이 두 단계가 어떤 순서로 도는지는 {{ch:spring/startup-refresh}}에서 소스로 따라간다.

> **설명 상자 — 리플렉션(reflection).** 실행 중에 클래스의 생성자·메서드·애너테이션을 읽고 호출하는 JDK 기능이다. `Class.forName(..)`, `getDeclaredConstructors()`, `Constructor.newInstance(..)`가 대표적이다. 컨테이너는 이것으로 "이 클래스의 생성자는 무엇을 받는가"를 알아내고 객체를 만든다.

> **설명 상자 — 프록시(proxy).** 진짜 객체 앞에 서서 같은 메서드를 받는 대리 객체다. 호출을 받으면 앞뒤에 일을 붙이고(트랜잭션 시작, 시간 측정) 진짜 객체에 넘긴다. 인터페이스를 구현하는 방식은 JDK 동적 프록시(`java.lang.reflect.Proxy`), 클래스를 상속하는 방식은 CGLIB이다.

핵심은 이것이다. **컨테이너가 객체를 직접 만들기 때문에, 만든 직후에 끼어들어 다른 객체로 바꿔 끼울 수 있다.** `@Transactional`, `@Async`, `@Cacheable`이 동작하는 이유이고, 반대로 이것들이 가끔 동작하지 않는 이유이기도 하다.

@topic spring/why-container/pitfalls

**실무 함정.** 아래는 모두 "컨테이너가 만든 객체만 컨테이너가 관리한다"는 한 가지 사실에서 나온다.

- **`new`로 만든 객체에는 아무것도 붙지 않는다.** `new OrderService(..)`로 만든 객체는 컨테이너를 거치지 않았으므로 `@Autowired` 필드는 `null`이고, `@Transactional`은 무시된다. 프록시를 씌울 기회가 없었기 때문이다. 빈이 필요하면 주입받는다.
- **같은 객체 안의 호출은 프록시를 거치지 않는다.** 프록시는 바깥에서 들어오는 호출만 가로챈다. `this.save()`처럼 자기 메서드를 부르면 프록시가 아니라 진짜 객체로 바로 간다. 자세한 내용은 {{ch:spring/proxies-aop}}와 {{ch:spring/transactional}}에서 다룬다.
- **컨테이너는 등록된 것만 안다.** 컴포넌트 스캔 범위 밖 패키지에 둔 클래스는 빈 정의가 없다. 주입할 때 `NoSuchBeanDefinitionException`이나 "required a bean of type ... that could not be found"로 시작이 실패한다. 기본 스캔 범위는 `@SpringBootApplication`이 붙은 클래스의 패키지와 그 하위 패키지다.
- **빈을 정적 필드에 넣어 두지 않는다.** 정적 필드는 컨테이너 수명과 따로 산다. 테스트에서 컨텍스트를 여러 번 만들면 이전 컨텍스트의 객체가 남는다.

@quiz

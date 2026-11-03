---
chapter: spring/transactional
---

@topic spring/transactional/overview

**겉 동작.** 메서드에 `@Transactional`을 붙이면, 그 메서드가 프록시를 거쳐 불릴 때 앞에서 트랜잭션을 시작하고, 정상으로 끝나면 커밋하고, 정해진 예외가 나면 롤백한다. 메서드 안의 `JdbcTemplate`, JPA `EntityManager`, Spring Data 저장소는 따로 연결을 넘겨받지 않아도 **같은 연결, 같은 트랜잭션** 을 쓴다.

```java
package com.example.order;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

 @Service
public class OrderService {
    private final OrderRepository orders;
    private final StockRepository stocks;

    public OrderService(OrderRepository orders, StockRepository stocks) {
        this.orders = orders;
        this.stocks = stocks;
    }

    @Transactional
    public long place(long productId, int qty) {
        stocks.decrease(productId, qty);              // 같은 트랜잭션
        return orders.save(new Order(productId, qty)).getId(); // 같은 트랜잭션
    }
}
```

기본 설정은 전파 {{fact:spring.tx.propagation.default}}, 격리 수준 {{fact:spring.tx.isolation.default}}, 읽기 전용 {{fact:spring.tx.read-only.default}}, 롤백 대상 {{fact:spring.tx.rollback.default}}이다. 이 장은 이 문장 하나 하나가 내부에서 무엇인지 따라간다. 앞의 두 질문, "누가 앞뒤에서 시작·커밋하나"와 "어떻게 저장소들이 같은 연결을 쓰나"의 답은 각각 **프록시** 와 **스레드에 묶인 자원** 이다.

> **설명 상자 — ThreadLocal.** `ThreadLocal`은 스레드마다 따로 값을 하나씩 갖는 변수다. 같은 `ThreadLocal`을 읽어도 요청을 처리하는 스레드 A와 B는 서로 다른 값을 본다. Spring 트랜잭션은 "지금 이 스레드의 트랜잭션 연결"을 `ThreadLocal`에 넣어 둔다. 그래서 매개변수로 넘기지 않아도 같은 스레드의 코드는 같은 연결을 찾고, **다른 스레드로 넘어가면 찾지 못한다.**

@topic spring/transactional/interceptor

**내부 동작 ① — 인터셉터.** `@Transactional` 빈은 AOP 프록시다({{ch:spring/proxies-aop}}). 사슬 안의 [`TransactionInterceptor.invoke`(L123)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionInterceptor.java#L123)가 [`TransactionAspectSupport.invokeWithinTransaction`(L333)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L333)을 부른다. 명령형(블로킹) 메서드의 길은 이렇다.

1. 메서드·클래스의 `@Transactional`을 읽어 트랜잭션 속성을 구하고, [쓸 트랜잭션 관리자를 고른다(L339)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L339).
2. [`createTransactionIfNecessary`(L365)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L365): 관리자의 `getTransaction(속성)`을 부르고, 결과를 `TransactionInfo`로 묶어 [스레드에 보관한다(L124)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L124).
3. [다음 인터셉터 또는 대상 메서드를 부른다(L371)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L371).
4. 예외가 나면 [`completeTransactionAfterThrowing`(L375)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L375): [롤백 규칙에 맞으면 롤백(L705)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L705), 맞지 않으면 **커밋** 한다.
5. 정상이면 [`commitTransactionAfterReturning`(L408)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L408)이 [관리자의 `commit`을 부른다(L687)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java#L687).

**내부 동작 ② — 관리자와 스레드에 묶인 연결.** 관리자는 `PlatformTransactionManager`다. JDBC라면 `DataSourceTransactionManager`, JPA라면 `JpaTransactionManager`를 Boot가 자동 구성한다. 공통 흐름은 [`AbstractPlatformTransactionManager.getTransaction`(L373)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L373)에 있고, 실제 연결 작업은 하위 클래스가 한다. [`DataSourceTransactionManager.doBegin`(L263)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L263)을 보면 트랜잭션 시작이 물리적으로 무엇인지 보인다.

- 풀에서 연결을 하나 꺼낸다.
- 격리 수준·읽기 전용을 연결에 반영하고, [`setAutoCommit(false)`(L297)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L297)로 자동 커밋을 끈다.
- [그 연결을 `TransactionSynchronizationManager`에 `DataSource`를 키로 묶는다(L310)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L310).

[`TransactionSynchronizationManager`(L77)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/TransactionSynchronizationManager.java#L77)는 정적 `ThreadLocal` 몇 개의 묶음이다. `JdbcTemplate`이 연결을 얻을 때 쓰는 [`DataSourceUtils.doGetConnection`(L103)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceUtils.java#L103)은 먼저 [이 스레드에 묶인 연결이 있는지 본다(L106)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceUtils.java#L106). 있으면 그것을 쓴다. 이것이 "같은 트랜잭션"의 정체다. 커밋 때는 [`con.commit()`(L343)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L343), 롤백 때는 `con.rollback()`을 부르고, 정리 단계에서 [묶음을 풀고(L381)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L381) 자동 커밋을 되돌린 뒤 연결을 풀에 반납한다.

@topic spring/transactional/propagation

**전파(propagation)는 "이미 트랜잭션이 있을 때 어떻게 할지"다.** `getTransaction`은 [이 스레드에 트랜잭션이 이미 있으면(L382)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L382) [`handleExistingTransaction`(L426)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L426)으로 간다. 문서는 **논리 트랜잭션**(메서드마다의 범위)과 **물리 트랜잭션**(실제 DB 트랜잭션)을 구별하라고 한다.

| 전파 | 이미 있을 때 물리적으로 일어나는 일 |
|---|---|
| `REQUIRED`(기본) | [기존 트랜잭션에 참여한다(L494)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L494). 새 연결도 새 DB 트랜잭션도 없다. 논리 범위만 하나 더 생긴다 |
| `REQUIRES_NEW` | [기존 것을 보류하고(L450)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L450) 스레드에서 연결 묶음을 떼어 둔 뒤, **풀에서 연결을 하나 더 꺼내** 새 DB 트랜잭션을 시작한다. 끝나면 기존 것을 되돌린다 |
| `NESTED` | [같은 연결에 저장점(savepoint)을 만든다(L477)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L477). 안쪽 롤백은 저장점까지만 되돌린다. JDBC 연결에서만 된다 |

**`REQUIRED` 참여와 rollback-only.** 안쪽 `@Transactional` 메서드가 예외로 끝나면 참여 중인 안쪽 범위는 스스로 롤백할 수 없다. 대신 [물리 트랜잭션 전체에 "롤백만 가능(rollback-only)" 표시를 한다(L905)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L905). 이 동작을 정하는 `globalRollbackOnParticipationFailure`의 기본값은 [{{fact:spring.tx.global-rollback-on-participation-failure.default}}(L138)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L138)다. 바깥 메서드가 그 예외를 잡고 정상 종료하면 커밋을 시도하지만, [표시를 본 관리자는 롤백하고(L749)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/support/AbstractPlatformTransactionManager.java#L749) `UnexpectedRollbackException`을 던진다. 호출자가 커밋된 줄 착각하지 않게 하려는 장치다.

**`REQUIRES_NEW`와 커넥션 풀.** 바깥 트랜잭션의 연결은 보류되는 동안에도 반납되지 않는다. 한 요청이 연결을 둘 쥔다. 동시에 바깥 트랜잭션을 연 스레드 수만큼 풀이 차 있으면, 모두 안쪽 연결을 기다리며 멈춘다. 공식 문서도 풀 크기가 동시 스레드 수보다 넉넉하지 않으면 쓰지 말라고 한다.

**같은 연결을 공유한다는 뜻의 다른 면.** `REQUIRES_NEW` 안에서는 바깥 트랜잭션이 아직 커밋하지 않은 데이터가 격리 수준에 따라 보이지 않는다. 바깥이 막 넣은 행을 안쪽이 읽거나 잠그려 하면 기다리다 교착에 빠질 수 있다.

@topic spring/transactional/rollback-readonly

**롤백 규칙.** 기본 규칙은 [`DefaultTransactionAttribute.rollbackOn`(L180)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/DefaultTransactionAttribute.java#L180) 한 줄이다. `RuntimeException`이나 `Error`면 롤백, **검사 예외(checked exception)는 커밋** 이다. `@Transactional(rollbackFor = ..)`를 주면 [`RuleBasedTransactionAttribute.rollbackOn`(L123)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/interceptor/RuleBasedTransactionAttribute.java#L123)이 규칙들 중 **예외 계층에서 가장 가까운 규칙** 을 골라 따른다. 맞는 규칙이 없으면 기본 규칙으로 돌아간다.

앱 전체 기본을 바꾸는 방법도 있다. `@EnableTransactionManagement(rollbackOn = RollbackOn.ALL_EXCEPTIONS)`면 검사 예외도 롤백한다. 이 속성의 기본값은 [{{fact:spring.tx.rollback-on.global.default}}(L222)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/annotation/EnableTransactionManagement.java#L222)다. 공식 문서는 메서드별 규칙이 이 전역 기본보다 우선한다고 적는다.

```java
// 검사 예외 PaymentDeclinedException에서도 롤백한다
 @Transactional(rollbackFor = PaymentDeclinedException.class)
public void pay(long orderId) throws PaymentDeclinedException { /* ... */ }
```

**`readOnly = true`가 실제로 하는 일.** 관리자와 드라이버마다 다르다. "읽기만 한다"는 힌트를 아래로 내려보내는 것이고, 쓰기를 막는 보장은 아니다.

| 계층 | 효과 |
|---|---|
| JDBC (`DataSourceTransactionManager`) | [연결에 `setReadOnly(true)`(L234)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceUtils.java#L234). `enforceReadOnly`(기본 {{fact:spring.tx.dstm.enforce-read-only.default}})를 켜면 [`SET TRANSACTION READ ONLY` 문을 보낸다(L459)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java#L459) |
| Hibernate (`JpaTransactionManager`) | [플러시 모드를 MANUAL로(L177)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-orm/src/main/java/org/springframework/orm/jpa/vendor/HibernateJpaDialect.java#L177), [세션 기본을 읽기 전용으로(L156)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-orm/src/main/java/org/springframework/orm/jpa/vendor/HibernateJpaDialect.java#L156). 변경 감지 스냅숏을 덜 만들고 커밋 때 자동 플러시하지 않는다 |
| 라우팅 `DataSource` | `TransactionSynchronizationManager.isCurrentTransactionReadOnly()`로 읽기 복제본을 고를 수 있다 |

참여하는 안쪽 메서드의 `readOnly`는 무시된다. 물리 트랜잭션의 성격은 시작한 바깥 메서드가 정한다.

@topic spring/transactional/pitfalls

**실무 함정 1 — 자기 호출.** 같은 클래스 안에서 `this.save()`로 부르면 프록시를 건너뛰어 트랜잭션이 시작되지 않는다({{ch:spring/proxies-aop}}). 공식 문서는 "롤백을 시험하기 전까지는 동작하는 것처럼 보일 수 있다"고 경고한다. 메서드를 다른 빈으로 옮긴다.

**실무 함정 2 — 메서드 가시성.** `@EnableTransactionManagement`(Boot 자동 구성 포함)는 [`publicMethodsOnly`를 끄고(L86)](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-tx/src/main/java/org/springframework/transaction/annotation/AbstractTransactionManagementConfiguration.java#L86) 속성 원본을 만든다. 그래서 CGLIB 프록시에서는 `protected`·package-private 메서드에도 트랜잭션이 걸린다. `private` 메서드는 프록시가 덮어쓸 수 없으므로 여전히 걸리지 않는다. JDK 프록시라면 인터페이스에 선언된 `public` 메서드만 된다.

**실무 함정 3 — 검사 예외는 커밋된다.** `IOException`을 던지며 끝난 메서드의 쓰기는 그대로 커밋된다. 롤백이 필요하면 `rollbackFor`를 쓰거나 비검사 예외로 감싸 던진다.

**실무 함정 4 — 예외를 잡아 삼킨다.** 메서드 안에서 `catch`하고 정상 반환하면 인터셉터는 예외를 보지 못하므로 커밋한다. 잡아야 한다면 `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()`로 표시하거나 다시 던진다. 반대로 안쪽 `REQUIRED` 메서드의 예외를 바깥에서 잡으면, 이미 rollback-only 표시가 붙어 `UnexpectedRollbackException`이 난다.

**실무 함정 5 — 다른 스레드로 넘어간다.** 트랜잭션 연결은 `ThreadLocal`에 묶여 있다. `@Async` 메서드, `CompletableFuture.supplyAsync(..)`, 직접 만든 스레드 안의 코드는 호출한 쪽의 트랜잭션을 보지 못한다. 그 안의 저장소 호출은 트랜잭션 없이(또는 그 스레드에서 새로 시작한 별도 트랜잭션으로) 돈다. 바깥이 롤백되어도 되돌아가지 않고, 바깥이 커밋하기 전의 데이터는 보이지 않는다. 비동기 작업에는 커밋이 끝난 뒤 넘길 데이터(ID 등)를 주고, 필요하면 그 작업에 자기 `@Transactional`을 둔다. 커밋 뒤에 실행할 일은 `@TransactionalEventListener`로 거는 방법이 있다({{ch:spring/events}}).

**실무 함정 6 — 트랜잭션 안에서 외부 API를 부른다.** 트랜잭션이 열린 동안 연결과 잠금을 쥐고 있다. 느린 HTTP 호출을 그 안에 두면 풀이 마르고 잠금 대기가 길어진다. 외부 호출은 트랜잭션 밖으로 빼고, 결과 저장만 짧은 트랜잭션으로 한다.

@design

@quiz

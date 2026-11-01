---
chapter: dynamodb/transactions
---

@topic dynamodb/transactions/apis

**트랜잭션(Transactions)** 은 여러 항목의 변경을 "모두 되거나, 하나도 안 되거나"로 묶는 기능이다. 한 테이블 안이든 여러 테이블에 걸치든 쓸 수 있고, DynamoDB에서 ACID(원자성·일관성·격리성·내구성)를 보장한다. 켜는 비용은 따로 없다.

API는 두 개다.

| API | 묶을 수 있는 작업 |
|---|---|
| `TransactWriteItems` | `Put`, `Update`, `Delete`, `ConditionCheck` |
| `TransactGetItems` | `Get` |

`ConditionCheck`는 항목을 바꾸지 않고 조건만 확인한다. 예를 들어 "고객 항목이 존재하고 상태가 활성일 때만 주문을 쓴다"처럼, 다른 항목의 상태를 쓰기의 전제 조건으로 걸 때 쓴다.

두 API 모두 같은 한도를 따른다.

- 트랜잭션 하나에 서로 다른 항목 최대 {{fact:dynamodb.txn.max-items}}, 전체 크기 최대 {{fact:dynamodb.txn.max-size}}.
- 대상 테이블은 **같은 계정, 같은 리전** 안에 있어야 한다.
- 인덱스에는 트랜잭션을 걸 수 없다. 테이블 항목만 대상이다.
- 한 트랜잭션 안에서 **같은 항목을 두 번 다룰 수 없다.** 같은 항목에 `ConditionCheck`와 `Update`를 함께 넣으면 검증 오류가 난다. 조건은 `Update` 자체의 조건식에 넣는다.

`BatchWriteItem`과 헷갈리기 쉽다. 배치는 요청 수를 줄이는 장치일 뿐이라 일부만 성공할 수 있다. 트랜잭션은 하나라도 실패하면 아무것도 바뀌지 않는다.

권한은 각 작업의 기반 API 권한을 따른다. `Put`은 `dynamodb:PutItem`, `Update`는 `dynamodb:UpdateItem`이 필요하다. `ConditionCheck`만은 별도 권한 `dynamodb:ConditionCheckItem`을 쓴다.

@topic dynamodb/transactions/idempotency-conflicts

**멱등성(Idempotency).** 네트워크 시간 초과로 응답을 못 받으면, 클라이언트는 트랜잭션이 반영됐는지 알 수 없다. 이때 같은 요청을 다시 보내도 두 번 반영되지 않도록 `TransactWriteItems`에 **클라이언트 토큰(`ClientRequestToken`)** 을 넣는다.

- 같은 토큰으로 다시 보내면, 처음 요청이 성공했을 경우 아무것도 바꾸지 않고 성공을 돌려준다.
- 토큰은 그 요청이 끝난 뒤 {{fact:dynamodb.txn.client-token.window}} 동안 유효하다. 그 뒤에 같은 토큰을 쓰면 **새 요청**으로 처리된다.
- 유효 기간 안에 같은 토큰으로 다른 파라미터를 보내면 `IdempotentParameterMismatch` 오류가 난다.
- AWS SDK는 토큰을 알아서 넣는다. SDK를 쓰지 않으면 직접 넣으라고 AWS는 권장한다.

**실패하는 경우.** 쓰기 트랜잭션은 다음일 때 실패한다.

1. 조건식 하나라도 거짓이다.
2. 같은 항목을 두 작업이 대상으로 삼았다(검증 오류).
3. 진행 중인 다른 트랜잭션과 충돌했다.
4. 프로비저닝된 용량이 모자란다.
5. 변경 결과 항목이 {{fact:dynamodb.item.max-size}}를 넘는 등 검증 오류가 났다.

**충돌 처리.** 트랜잭션에 포함된 항목에 다른 요청이 동시에 들어오면 충돌이 난다.

| 거절된 요청 | 받는 오류 |
|---|---|
| 일반 `PutItem`·`UpdateItem`·`DeleteItem` | `TransactionConflictException` |
| `TransactWriteItems`·`TransactGetItems` | `TransactionCanceledException` |

`TransactionCanceledException`에는 `CancellationReasons` 목록이 들어 있다. 요청에 넣은 순서대로 항목마다 실패 이유(예: `ConditionalCheckFailed`, `TransactionConflict`)를 알려 준다. 이 오류는 SDK가 자동으로 재시도하지 않는다. 진행 중인 트랜잭션과 동시에 들어온 일반 `GetItem`은 둘 다 성공할 수 있다. 실패한 항목 수준 요청은 CloudWatch의 `TransactionConflict` 지표로 센다.

@topic dynamodb/transactions/isolation-capacity

**격리 수준(Isolation levels).** 트랜잭션과 다른 작업 사이의 격리 수준은 다음과 같다.

| 상대 작업 | 격리 수준 |
|---|---|
| `PutItem`, `UpdateItem`, `DeleteItem`, `GetItem`, 다른 트랜잭션 | 직렬화 가능(Serializable) |
| `Query`, `Scan`, `BatchGetItem`(요청 전체) | 커밋된 읽기(Read-committed) |
| `BatchWriteItem`(요청 전체) | 직렬화 불가 |

직렬화 가능은 "작업이 하나씩 차례로 실행된 것과 같은 결과"를 뜻한다. 커밋된 읽기는 끝내 실패한 트랜잭션의 중간 상태를 읽지 않는다는 뜻일 뿐이다. 여러 항목을 따로 `GetItem` 하면 트랜잭션 전후 상태가 섞여 보일 수 있다. 여러 항목을 한 시점의 모습으로 읽으려면 `TransactGetItems`를 쓴다. 트랜잭션 직후 최종 일관된 읽기는 잠깐 옛 값을 돌려줄 수 있으므로, 바로 최신 값이 필요하면 강력한 일관된 읽기를 쓴다.

**용량.** DynamoDB는 트랜잭션의 항목마다 준비(prepare)와 커밋(commit) 두 번의 읽기·쓰기를 한다. 그래서 일반 작업의 {{fact:dynamodb.txn.unit-multiplier}} 용량 단위를 쓴다. 이 두 번은 CloudWatch 지표에도 보인다.

- 조건 실패 등으로 **취소된 트랜잭션도** 시도한 항목만큼 용량을 쓴다.
- SDK는 `TransactionInProgressException`이면 재시도하므로, 그 재시도가 쓰는 용량도 계획에 넣는다.
- DAX를 거쳐 `TransactWriteItems`를 쓰면 DAX가 캐시를 채우려고 뒤에서 `TransactGetItems`를 부르므로 읽기 단위가 더 든다.

**전파는 원자적이지 않다.** 트랜잭션이 끝나면 변경이 GSI, 스트림, 백업으로 차례로 퍼진다. 같은 트랜잭션의 스트림 레코드가 서로 다른 때에 나타나고, 다른 트랜잭션 레코드와 섞일 수 있다. 스트림 소비자는 트랜잭션 단위의 원자성이나 순서를 가정하면 안 된다. 글로벌 테이블에서도 트랜잭션 보장은 **호출한 리전 안에서만** 성립한다. 다른 리전 복제본에서는 일부만 반영된 상태가 보일 수 있다. 자세한 내용은 {{ch:dynamodb/global-tables}}에서 다룬다.

AWS가 권장하는 사용법은 다음과 같다.

- 꼭 함께 바뀌어야 하는 작업만 묶는다. 작은 트랜잭션이 처리량이 높고 성공할 가능성도 크다.
- 여러 항목에 걸쳐 늘 함께 바뀌는 속성은 한 항목으로 모아 트랜잭션 범위를 줄인다.
- 대량 적재에는 트랜잭션 대신 `BatchWriteItem`을 쓴다.

@topic dynamodb/transactions/conditional-writes

트랜잭션이 아니어도 항목 하나는 안전하게 다룰 수 있다. 기본 쓰기(`PutItem`, `UpdateItem`, `DeleteItem`)는 조건 없이 덮어쓴다. 두 사용자가 같은 항목을 차례로 고치면 먼저 쓴 값이 사라진다(갱신 손실).

**조건부 쓰기(Conditional writes)** 는 **조건 표현식(Condition expression)** 이 참일 때만 쓰기를 실행한다. 예를 들어 "현재 가격이 읽었을 때 값과 같을 때만 새 가격으로 바꾼다", "같은 키 항목이 없을 때만 넣는다(`attribute_not_exists`)"처럼 쓴다. 조건이 거짓이면 `ConditionalCheckFailedException`이 난다. `ReturnValuesOnConditionCheckFailure`를 `ALL_OLD`로 두면 실패 응답에 현재 항목 값이 담겨, 따로 읽지 않고도 왜 실패했는지 볼 수 있다.

조건부 쓰기는 **조건이 바꾸려는 속성을 확인하면 멱등적**이다. "재고가 {{raw:5}}일 때만 {{raw:4}}로 바꾼다"는 요청은 응답을 못 받아 다시 보내도 한 번만 반영된다.

**원자성 카운터(Atomic counter)** 는 `UpdateItem`의 `SET n = n + :inc`처럼 현재 값을 읽지 않고 숫자를 올리거나 내리는 방식이다. 다른 쓰기를 방해하지 않고, 요청은 받은 순서대로 적용된다. 하지만 **멱등적이지 않다.** 실패한 줄 알고 다시 보내면 두 번 더해질 수 있다. 방문자 수처럼 약간 틀려도 되는 값에는 맞고, 잔액처럼 틀리면 안 되는 값에는 조건부 업데이트를 쓰라고 AWS는 안내한다.

@topic dynamodb/transactions/concurrency

`UpdateItem` 같은 단일 쓰기는 그 자체로 원자적이고 항상 최신 항목에 적용된다. 문제는 **읽고 → 계산하고 → 다시 쓰는** 흐름이다. 읽은 뒤 쓰기 전에 다른 프로세스가 항목을 바꿀 수 있다. AWS는 세 가지 방법을 비교한다.

| 방법 | 맞는 상황 |
|---|---|
| 낙관적 잠금(Optimistic locking): 버전 속성 + 조건부 쓰기 | 충돌이 드물고 재시도가 싸며, 항목 하나를 고칠 때 |
| 트랜잭션(`TransactWriteItems`) | 여러 항목을 원자적으로 바꾸거나, 조건 확인과 쓰기를 한 번에 묶을 때 |
| 잠금 클라이언트(Lock client): 임대·하트비트를 쓰는 잠금 테이블 | 오래 걸리는 작업, 외부 자원 조율, 프로세스가 죽으면 잠금이 자동으로 풀려야 할 때 |

**낙관적 잠금**은 항목에 버전 번호 속성을 둔다.

1. 항목을 읽고 버전 값을 기억한다.
2. 새 값을 쓰면서 버전을 하나 올리고, 조건으로 "버전이 내가 읽은 값과 같을 때"를 건다.
3. 그사이 누가 먼저 고쳤으면 조건이 거짓이 되어 쓰기가 실패한다. 다시 읽고 재시도한다.

잠금을 잡고 기다리지 않으므로 충돌이 드물면 처리량이 높다. 충돌이 잦으면 재시도가 늘어 오히려 손해다.

> **주의:** 글로벌 테이블은 리전 간 동시 쓰기를 "마지막 쓰기 우선(last writer wins)"으로 맞춘다. 다른 리전의 쓰기는 버전 조건을 거치지 않으므로, 버전 번호 낙관적 잠금이 리전 사이에서는 기대대로 동작하지 않는다.

@quiz

@design

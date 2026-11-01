---
chapter: dynamodb/reads-writes
---

@topic dynamodb/reads-writes/consistency

DynamoDB에 쓰기를 하고 HTTP 200 응답을 받으면, 그 쓰기는 끝났고 내구성 있게 저장된 것이다. 그런데 바로 다음 읽기가 그 값을 보여 주는지는 **읽기 일관성(Read consistency)** 설정에 달려 있다.

| 종류 | 특징 |
|---|---|
| 최종 일관된 읽기(Eventually consistent read) | 기본값이다. 방금 끝난 쓰기가 아직 안 보일 수 있다. 조금 뒤 다시 읽으면 최신 값이 나온다. 비용은 강력한 일관성의 절반이다 |
| 강력한 일관된 읽기(Strongly consistent read) | `GetItem`·`Query`·`Scan`에 `ConsistentRead=true`를 주면 된다. 그 전에 성공한 모든 쓰기를 반영한 값을 돌려준다 |

어디서 읽느냐에 따라 고를 수 있는 범위가 다르다.

- **테이블과 로컬 보조 인덱스(LSI):** 두 방식 모두 쓸 수 있다.
- **글로벌 보조 인덱스(GSI)와 DynamoDB Streams:** 최종 일관된 읽기만 된다. GSI에 강력한 일관된 읽기를 요청할 수 없다. 최신 값이 꼭 필요하면 기본 테이블에서 읽는다.

어느 방식이든 DynamoDB는 **커밋된 읽기(read-committed)** 격리를 보장한다. 실패한 쓰기의 중간 상태가 읽히는 일은 없다. 다만 읽은 직후에 다른 요청이 그 항목을 바꾸는 것까지 막아 주지는 않는다.

> **글로벌 테이블(Global tables):** 기본 모드인 다중 리전 최종 일관성(MREC)에서는 다른 리전 복제본에 변경이 보통 짧은 지연 뒤에 반영된다. 다중 리전 강력한 일관성(MRSC)을 고르면 쓰기가 다른 리전까지 동기로 복제된 뒤 응답하므로, 어느 복제본에서든 강력한 일관된 읽기가 최신 값을 돌려준다. 자세한 내용은 {{ch:dynamodb/global-tables}}에서 다룬다.

@topic dynamodb/reads-writes/units

DynamoDB는 읽기와 쓰기를 **용량 단위**로 센다. 프로비저닝된 모드에서는 읽기 용량 단위(RCU, Read Capacity Unit)와 쓰기 용량 단위(WCU, Write Capacity Unit), 온디맨드 모드에서는 읽기 요청 단위(RRU)와 쓰기 요청 단위(WRU)라고 부른다. 크기 기준은 같다.

| 요청 | 단위 소비 (크기 단위마다) |
|---|---|
| 강력한 일관된 읽기 | {{fact:dynamodb.rcu.item-size}}마다 읽기 단위 하나 |
| 최종 일관된 읽기 | 읽기 단위 하나로 {{fact:dynamodb.read.eventual-per-unit}} (즉 절반) |
| 트랜잭션 읽기 | 강력한 일관된 읽기의 {{fact:dynamodb.txn.unit-multiplier}} |
| 일반 쓰기 | {{fact:dynamodb.wcu.item-size}}마다 쓰기 단위 하나 |
| 트랜잭션 쓰기 | 일반 쓰기의 {{fact:dynamodb.txn.unit-multiplier}} |

계산 순서는 늘 같다.

1. **항목 크기를 단위 크기로 올림한다.** 읽기는 {{fact:dynamodb.rcu.item-size}}, 쓰기는 {{fact:dynamodb.wcu.item-size}} 경계까지 올린다. {{raw:3,500바이트}} 항목을 읽어도 {{fact:dynamodb.rcu.item-size}} 항목을 읽은 것과 같다.
2. **읽기·쓰기 종류에 따라 나누거나 곱한다.** 최종 일관성은 절반, 트랜잭션은 두 배다.
3. **초당 요청 수를 곱한다.** 프로비저닝할 값은 마지막에 정수로 올린다.

예를 들어 {{raw:8 KB}} 항목 하나를 강력한 일관성으로 읽으면 읽기 단위 {{raw:2}}개, 최종 일관성이면 {{raw:1}}개, 트랜잭션이면 {{raw:4}}개가 든다. 항목 크기는 속성 이름과 값의 길이를 모두 더한 값이다. 속성 이름을 짧게 지으면 저장 용량과 소비 단위를 함께 줄일 수 있다.

@sim ddb-capacity-calc

@topic dynamodb/reads-writes/operations

API마다 "크기"를 재는 방법이 다르다. 시험에서 자주 묻는 부분이다.

| 읽기 API | 크기 계산 |
|---|---|
| `GetItem` | 항목 하나의 크기를 올림한다 |
| `BatchGetItem` | 항목마다 **먼저 올림한 뒤** 더한다. {{raw:1.5 KB}}와 {{raw:6.5 KB}}를 읽으면 {{raw:4 KB}} + {{raw:8 KB}} = {{raw:12 KB}}로 센다 |
| `Query` | 돌려받는 항목 크기를 **모두 더한 뒤** 한 번 올림한다. 작은 항목을 많이 읽을수록 유리하다 |
| `Scan` | 돌려받은 항목이 아니라 **평가한 항목** 전체 크기로 센다. 필터로 걸러 낸 항목도 비용에 들어간다 |

읽기에서 놓치기 쉬운 점이 세 가지 있다.

- 없는 항목을 읽어도 읽기 단위가 소비된다.
- 일부 속성만 골라 받아도(프로젝션) 항목 전체 크기로 계산한다.
- `Query`·`Scan`에서 개수만 세어도(Count) 항목을 다 읽는 것과 같은 단위가 든다.

| 쓰기 API | 크기 계산 |
|---|---|
| `PutItem` | 같은 키의 기존 항목을 덮어쓰면, 기존 항목과 새 항목 중 **큰 쪽** |
| `UpdateItem` | 수정 전후 중 큰 쪽. 속성 하나만 바꿔도 항목 **전체 크기**로 센다 |
| `DeleteItem` | 지운 항목의 크기 |
| `BatchWriteItem` | 항목마다 먼저 올림한 뒤 더한다 |
| `TransactWriteItems` | 준비와 커밋으로 두 번 쓰므로 단위가 두 배다. 트랜잭션이 취소되어도 소비된다 |

> **주의:** 조건부 쓰기(Conditional write)는 조건이 거짓이라 실패해도 쓰기 단위를 소비한다. 소비량은 대상 항목(기존 항목 또는 새로 쓰려던 항목)의 크기로 정해진다. 조건 실패가 잦은 설계라면 이 비용을 함께 계산한다.

@quiz

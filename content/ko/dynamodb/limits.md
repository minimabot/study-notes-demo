---
chapter: dynamodb/limits
---

@topic dynamodb/limits/items

이 장은 한도를 한곳에 모은 참조용 장이다. 공식 문서는 한도를 두 가지로 나눈다. **할당량(Quota)** 은 계정·리전마다 기본값이 있고 일부는 늘릴 수 있다. **제약(Constraint)** 은 항목 크기나 키 길이처럼 API와 데이터 모델에 걸린 규칙이다. 따로 적지 않으면 할당량은 리전마다 따로 센다. 크기는 이진 단위다. KB는 1,024바이트이고, 더 큰 단위도 1,024씩 커진다.

| 대상 | 한도 |
|---|---|
| 항목 하나의 크기 | {{fact:dynamodb.item.max-size}}. 속성 **이름**의 길이도 포함한다 |
| 테이블 크기, 항목 수 | 실질적인 상한 없음 |
| 속성 이름 | 1자 이상, 최대 {{fact:dynamodb.attribute.name.max-length}} |
| 중첩 속성 깊이 | {{fact:dynamodb.attribute.nesting.max-depth}} |
| 숫자(Number) 정밀도 | {{fact:dynamodb.number.precision.max}} |
| List·Map·Set 안의 값 수 | 상한 없음. 항목 크기 안에만 들면 된다 |
| 테이블·인덱스 이름 | {{fact:dynamodb.name.table.min-length}}~{{fact:dynamodb.name.table.max-length}}, 영문자·숫자·`_`·`-`·`.` |

- String과 Binary 길이는 따로 한도가 없고 항목 크기가 상한이다. String은 UTF-8 바이트 수로 잰다.
- 키 속성이 아니면 빈 String·Binary 값을 넣을 수 있다. 빈 List·Map도 된다. 빈 Set은 안 된다.
- LSI가 있으면, 테이블 항목과 그 항목에 해당하는 모든 LSI 항목을 합친 크기도 {{fact:dynamodb.item.max-size}} 안에 들어야 한다.
- 정밀도가 중요한 숫자는 문자열로 바꿔 보내라고 문서는 안내한다.

속성 이름이 항목 크기에 들어가므로, 항목이 아주 많은 테이블에서는 긴 속성 이름이 저장 공간과 처리량을 더 쓴다. 항목 구성은 {{ch:dynamodb/core-components}}에서 다뤘다.

@topic dynamodb/limits/keys-indexes

| 대상 | 한도 |
|---|---|
| 파티션 키 값 길이 | {{fact:dynamodb.key.min-length}}~{{fact:dynamodb.key.partition.max-length}} |
| 정렬 키 값 길이 | {{fact:dynamodb.key.min-length}}~{{fact:dynamodb.key.sort.max-length}} |
| 서로 다른 파티션 키 값 수 | 실질적인 상한 없음 |
| LSI 수 | 테이블당 {{fact:dynamodb.lsi.max}} |
| GSI 수 | 테이블당 기본 {{fact:dynamodb.gsi.default-quota}}. 늘릴 수 있다 |
| 직접 지정해 투영하는 속성 | 모든 LSI·GSI 합쳐 {{fact:dynamodb.index.projected-attributes.max}} |
| LSI가 있는 테이블의 항목 컬렉션 | 파티션 키 값 하나당 {{fact:dynamodb.lsi.item-collection.max}} |

- 투영 한도는 `ProjectionType`이 `INCLUDE`일 때 `NonKeyAttributes`에 적은 속성 수의 합이다. 같은 속성을 두 인덱스에 넣으면 두 개로 센다. `KEYS_ONLY`와 `ALL`에는 걸리지 않는다.
- 보조 인덱스의 키 속성 이름과, LSI에 `INCLUDE`로 투영한 속성 이름은 {{fact:dynamodb.attribute.name.index-key.max-length}}까지다.
- LSI 항목 컬렉션 한도는 LSI가 기본 테이블과 같은 파티션에 함께 놓이기 때문에 생긴다. GSI에는 이 한도가 없다. 넘으면 `ItemCollectionSizeLimitExceededException`을 받는다.

인덱스 설계는 {{ch:dynamodb/secondary-indexes}}에서 다뤘다.

@topic dynamodb/limits/api

데이터 API 한도다.

| API | 한도 |
|---|---|
| `BatchGetItem` | 최대 {{fact:dynamodb.batch-get.max-items}}, 합계 {{fact:dynamodb.batch.max-total-size}} |
| `BatchWriteItem` | Put·Delete 요청 최대 {{fact:dynamodb.batch-write.max-requests}}, 합계 {{fact:dynamodb.batch.max-total-size}} |
| 트랜잭션 | 서로 다른 항목 최대 {{fact:dynamodb.txn.max-items}}, 데이터 {{fact:dynamodb.txn.max-size}} |
| `Query`·`Scan` 한 번의 결과 | {{fact:dynamodb.query.page.max}}. 나머지는 `LastEvaluatedKey`로 이어 읽는다 |

- 트랜잭션은 한 항목에 두 동작을 걸 수 없고, 여러 계정이나 여러 리전의 테이블을 묶을 수 없다. 자세한 내용은 {{ch:dynamodb/transactions}}에 있다.
- 배치는 원자적이지 않다. 일부만 실패하면 처리하지 못한 것을 돌려준다({{ch:dynamodb/monitoring}}).

**식(Expression) 한도.** `ConditionExpression`, `UpdateExpression`, `FilterExpression`, `ProjectionExpression`에 함께 걸린다.

| 대상 | 한도 |
|---|---|
| 식 문자열 하나 | {{fact:dynamodb.expression.max-length}} |
| 식 속성 이름·값 하나(`#name`, `:val`) | {{fact:dynamodb.expression.placeholder.max-length}} |
| 치환 변수 전체 길이 합 | {{fact:dynamodb.expression.substitution.max-total}} |
| 연산자·함수 수 | {{fact:dynamodb.expression.operators.max}} |
| `IN`의 피연산자 수 | {{fact:dynamodb.expression.in-operands.max}} |

연산자 한도를 넘으면 `ValidationException`을 받는다. `UpdateExpression`의 `SET a = ...`에서 `=`는 대입이라 연산자로 세지 않지만, 조건식·필터식의 `=`는 센다. 예약어와 같은 이름은 쓸 수 있지만, 식에 넣을 때는 `ExpressionAttributeNames`로 바꿔 써야 한다.

**컨트롤 플레인 한도.** `CreateTable`·`UpdateTable`·`DeleteTable` 등이 동시에 진행 중인 테이블·인덱스는 합쳐서 {{fact:dynamodb.control-plane.concurrent.max}}를 넘을 수 없다. 넘으면 `LimitExceededException`이 난다. 이런 변경형 요청과 `DescribeTable`·`ListTables` 같은 읽기 전용 요청은 각각 {{fact:dynamodb.control-plane.mutable-rps}}까지 보낼 수 있다. `DescribeLimits`처럼 가끔만 부르라고 정해 둔 API도 있다.

@topic dynamodb/limits/throughput

| 할당량 | 온디맨드 | 프로비저닝 |
|---|---|---|
| 테이블당 | {{fact:dynamodb.throughput.table-default}} | {{fact:dynamodb.throughput.table-default}} |
| 계정당(리전) | 적용 안 됨 | {{fact:dynamodb.throughput.account-default}} |
| 테이블·GSI 최소값 | 적용 안 됨 | {{fact:dynamodb.throughput.provisioned-min}} |

- **프로비저닝 모드.** 테이블당 한도는 테이블이나 GSI 하나에 줄 수 있는 최대치다. 그리고 계정의 모든 프로비저닝 테이블과 GSI를 합친 양이 계정 한도 아래여야 한다. 계정 한도를 테이블 하나에 몰아 써도 된다.
- **온디맨드 모드.** 테이블 하나 또는 그 안의 GSI 하나가 쓸 수 있는 양에 테이블당 한도가 걸린다. 계정 한도는 걸리지 않는다. 이 한도를 넘으면 `AccountLimitExceeded` 이유로 스로틀된다.
- 표의 값은 **기본값**이지 최대치가 아니다. 증가를 요청할 수 있다.
- 파티션 하나의 한도({{fact:dynamodb.partition.read.max}}, {{fact:dynamodb.partition.write.max}})는 할당량이 아니라 내부 한도다. 늘려 달라고 요청하는 대상이 아니다. 키 설계로 피한다({{ch:dynamodb/partitions}}).

**용량 변경 횟수.** 프로비저닝 용량은 원하는 만큼 자주 올릴 수 있다. 다만 아주 빠르게 올리는 것은 허용되지 않는다. 줄이기는 횟수 제한이 있다. 하루(UTC)가 시작될 때 쓸 수 있는 감소 횟수는 {{fact:dynamodb.capacity.decrease.available}}다. 그 뒤 한 시간마다 한 번씩 다시 생기지만, 한꺼번에 쌓아 둘 수 있는 것도 {{fact:dynamodb.capacity.decrease.available}}까지다. 그래서 하루에 최대 {{fact:dynamodb.capacity.decrease.daily-max}} 줄일 수 있다. 테이블과 GSI는 따로 센다. 단, 한 요청에서 둘을 함께 줄이다 어느 한쪽이라도 한도를 넘으면 요청 전체가 거절된다. 프로비저닝에서 온디맨드로 바꾸기는 {{fact:dynamodb.capacity.switch-to-ondemand.max}}까지다({{ch:dynamodb/capacity}}).

**그 밖의 계정 할당량.**

| 대상 | 한도 |
|---|---|
| 리전별 테이블 수 | 초기 {{fact:dynamodb.tables.per-region.default}}. AWS 계정 팀과 협의해 최대 {{fact:dynamodb.tables.per-region.max}} |
| 활성 예약 용량 | {{fact:dynamodb.reserved.account-max}} (RCU와 WCU 합계) |

테이블이 {{fact:dynamodb.tables.per-region.max}}보다 많이 필요하면, AWS는 계정을 여러 개로 나누라고 권장한다.

@topic dynamodb/limits/adjustable

할당량은 **Service Quotas 콘솔**에서 확인한다. 리전을 고르면 할당량마다 적용된 값, AWS 기본값, 사용률, **조정 가능(Adjustability)** 여부가 나온다. CLI로는 `aws service-quotas list-aws-default-service-quotas --service-code dynamodb`로 기본값을, `list-service-quotas`로 계정에 적용된 값을 본다.

조정 가능한 할당량의 예는 다음과 같다.

- 테이블당 읽기·쓰기 처리량, 계정당 처리량
- 테이블당 GSI 수
- 활성 예약 용량

테이블 수는 초기 한도를 넘기려면 AWS 계정 팀과 협의한다. 반면 항목 크기, 키 길이, 배치·트랜잭션·식 한도처럼 "제약"으로 묶인 값은 데이터 모델을 설계할 때 지켜야 하는 규칙으로 다룬다. 어떤 값이 조정 가능한지 헷갈리면 Service Quotas 콘솔의 조정 가능 열로 확인한다.

증가 요청 방법은 다음과 같다.

1. Service Quotas 콘솔에서 리전을 고른다.
2. 조정 가능한 할당량을 골라 **할당량 증가 요청**을 누르고 새 값을 넣는다.
3. 콘솔에 없는 조정 가능 할당량은 Support Center에서 할당량 증가 케이스를 연다.

요청은 승인, 거절, 일부 승인될 수 있다. 바로 반영되지 않고 며칠이 걸릴 수 있다. 그러니 행사 직전이 아니라 미리 요청한다.

> **주의:** 글로벌 테이블은 모든 복제본 리전의 테이블 쓰기 처리량 한도가 같아야 한다. 한 리전에서만 한도를 올려 두면 다른 리전에 복제본을 만들 때 실패할 수 있다. 복제본을 추가하기 전에 모든 리전에서 같은 값으로 맞춘다({{ch:dynamodb/global-tables}}).

@quiz

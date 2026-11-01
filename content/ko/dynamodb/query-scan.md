---
chapter: dynamodb/query-scan
---

@topic dynamodb/query-scan/query

DynamoDB에서 여러 항목을 읽는 방법은 두 가지다. **`Query`** 는 키로 범위를 좁혀 읽고, **`Scan`** 은 테이블이나 인덱스를 처음부터 끝까지 읽는다. 대부분의 앱은 `Query`로 동작하도록 설계한다.

`Query`의 조건은 **키 조건 표현식(Key Condition Expression)** 으로 준다.

- **파티션 키는 필수, 등호(`=`)만.** 값 하나를 정확히 줘야 한다.
- **정렬 키는 선택.** `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `begins_with` 중 하나로 범위를 좁힌다.
- 비키 속성은 키 조건에 쓸 수 없다.

같은 파티션 키 값의 항목은 정렬 키 순서로 붙어 저장된다. 그래서 `Query` 결과는 항상 정렬 키 순서다. 기본은 오름차순이고, `ScanIndexForward`를 `false`로 주면 내림차순이 된다. "최근 주문 순"처럼 날짜를 정렬 키로 두는 이유다.

`Query`는 테이블뿐 아니라 보조 인덱스에도 쓴다. 기본 키에 없는 속성으로 찾아야 하면 인덱스를 만들고 그 인덱스를 `Query`한다({{ch:dynamodb/secondary-indexes}}).

읽기 일관성은 기본이 **최종 일관성(Eventually Consistent)** 이다. `ConsistentRead`를 `true`로 주면 **강력한 일관성(Strongly Consistent)** 읽기가 되고 읽기 용량을 더 쓴다. GSI에서는 강력한 일관성을 고를 수 없다. 용량 계산은 {{ch:dynamodb/reads-writes}}에서 다룬다.

| 무엇을 Query·Scan하나 | 읽기 용량을 쓰는 곳 |
|---|---|
| 테이블 | 테이블 |
| GSI | 그 GSI |
| LSI | 기본 테이블 |

@topic dynamodb/query-scan/filter

**필터 표현식(Filter Expression)** 은 읽은 결과에서 일부만 돌려받게 하는 조건이다. 가장 흔한 오해가 여기서 나온다.

- **필터는 읽은 뒤에 적용된다.** DynamoDB는 키 조건에 맞는 항목을 먼저 읽고, 그다음 필터로 거르고, 남은 것만 돌려준다.
- **그래서 읽기 용량은 줄지 않는다.** 필터가 있든 없든 읽은 항목 크기만큼 용량을 쓴다.
- **페이지 한도도 필터 전에 적용된다.** 호출 한 번은 최대 {{fact:dynamodb.query.page.max}}를 읽는다. 이 한도는 필터를 적용하기 전 데이터 기준이다.
- `Query`의 필터에는 파티션 키나 정렬 키를 쓸 수 없다. 키 조건은 키 조건 표현식에 쓴다. `Scan`의 필터에는 키 속성도 쓸 수 있다.

응답에는 두 숫자가 있다.

| 값 | 뜻 |
|---|---|
| `ScannedCount` | 필터 전에 읽은 항목 수 |
| `Count` | 필터 뒤에 남아 돌려준 항목 수 |

`ScannedCount`는 큰데 `Count`가 작으면, 많이 읽고 대부분 버린다는 뜻이다. 비용 낭비 신호다. 자주 쓰는 조건이라면 필터 대신 그 조건을 키로 하는 인덱스를 만든다.

**프로젝션 표현식(Projection Expression)** 으로 돌려받을 속성을 줄일 수도 있다. 네트워크로 오가는 데이터는 줄지만, 읽기 용량은 항목 전체 크기로 계산되므로 줄지 않는다.

**`Limit`** 은 "돌려받을 수"가 아니라 "읽을 항목 수"의 상한이다. `Limit`을 {{raw:10}}으로 주고 필터를 걸면, 항목 {{raw:10}}개를 읽고 그중 맞는 것만 돌려준다. 결과가 {{raw:10}}개보다 적어도 데이터가 더 없다는 뜻이 아니다.

@sim ddb-query-vs-scan

@topic dynamodb/query-scan/pagination

결과가 많으면 DynamoDB는 결과를 **페이지**로 나눠 준다. 한 페이지는 최대 {{fact:dynamodb.query.page.max}}이고, `Limit`을 주면 그 수에서도 끊긴다.

다음 페이지를 읽는 순서는 이렇다.

1. 응답에 `LastEvaluatedKey`가 있으면 아직 끝나지 않은 것이다.
2. 같은 조건으로 다시 요청하면서 그 값을 `ExclusiveStartKey`에 넣는다.
3. `LastEvaluatedKey`가 응답에 없을 때까지 반복한다.

두 가지를 주의한다.

- **빈 페이지가 와도 끝이 아니다.** 필터가 있으면 한 페이지 분량을 읽었는데 맞는 항목이 하나도 없을 수 있다. 이때도 `LastEvaluatedKey`가 온다. 끝났는지는 `LastEvaluatedKey`가 없는지로만 판단한다.
- **`LastEvaluatedKey`가 있다고 남은 데이터가 꼭 있는 것도 아니다.** 페이지 경계에서 멈췄다는 뜻일 뿐이다.

AWS CLI는 기본적으로 페이지를 끝까지 자동으로 넘긴다. AWS SDK도 페이지를 넘기는 도구(페지네이터 등)를 제공한다. 직접 저수준 API를 부를 때만 위 반복을 짜면 된다.

@topic dynamodb/query-scan/scan

**`Scan`** 은 테이블이나 인덱스의 **모든 항목**을 읽는다. 필터를 붙여도 전부 읽는 것은 같다. 그래서 테이블이 커질수록 느려지고, 큰 테이블에서는 `Scan` 한 번이 많은 읽기 용량을 순식간에 써 버릴 수 있다.

`Scan`이 위험한 이유는 비용만이 아니다. 연속된 항목을 읽으므로 같은 파티션에 요청이 몰린다. 그러면 같은 테이블을 쓰는 중요한 요청이 스로틀링될 수 있다.

AWS가 안내하는 대응은 이렇다.

- **`Query`로 바꾼다.** 테이블과 인덱스를 `Scan` 대신 `Query`를 쓰도록 설계한다. 가장 먼저 할 일이다.
- **페이지를 작게 한다.** `Limit`으로 한 번에 읽는 양을 줄이면 요청 사이에 틈이 생겨 다른 요청이 용량을 쓸 수 있다.
- **분리한다.** 중요한 트래픽을 받지 않는 테이블(예: 같은 데이터를 쓰는 별도 테이블)에서 `Scan`한다.
- **재시도한다.** 스로틀링 응답에는 지수 백오프로 재시도한다.

**병렬 스캔(Parallel Scan).** 기본 `Scan`은 한 번에 파티션 하나만 읽어서 느리다. 병렬 스캔은 테이블을 세그먼트로 나눠 여러 작업자가 동시에 읽는다.

- 작업자마다 `Segment`(자기 번호)와 `TotalSegments`(전체 수)를 준다. `TotalSegments`는 최대 {{fact:dynamodb.scan.total-segments.max}}다.
- 세그먼트는 파티션 키의 해시로 나뉜다. 같은 파티션 키의 항목은 항상 같은 세그먼트로 간다. 그래서 세그먼트 크기가 고르지 않을 수 있다.
- AWS는 테이블이 {{fact:dynamodb.scan.parallel.table-size-hint}} 이상이고, 읽기 용량이 남고, 순차 `Scan`이 너무 느릴 때 병렬 스캔이 알맞다고 안내한다.
- 시작점은 데이터 {{fact:dynamodb.scan.parallel.gb-per-segment}}마다 세그먼트 하나다. 그다음 지표를 보며 조정한다.
- 작업자가 많으면 테이블 읽기 용량을 다 써 버린다. `Limit`으로 작업자 한 명이 독차지하지 않게 한다.

`Scan`은 기본이 최종 일관성 읽기다. `ConsistentRead`를 `true`로 주면 `Scan`을 시작하기 전에 끝난 쓰기가 모두 결과에 들어가고, 읽기 용량은 두 배가 든다.

@topic dynamodb/query-scan/expressions

DynamoDB는 조건과 대상을 **식(Expression)** 문자열로 받는다. 종류는 다섯 가지다.

| 식 | 쓰는 곳과 역할 |
|---|---|
| 키 조건 표현식 | `Query`가 읽을 항목 범위 |
| 필터 표현식 | `Query`·`Scan`이 읽은 결과 중 돌려줄 항목 |
| 프로젝션 표현식 | `GetItem`·`Query`·`Scan`이 돌려줄 속성 |
| 조건 표현식 | `PutItem`·`UpdateItem`·`DeleteItem`을 실행할 조건 |
| 업데이트 표현식 | `UpdateItem`이 속성을 바꾸는 방법 (`SET`, `REMOVE`, `ADD`, `DELETE`) |

식 안에서는 자리표시자를 쓴다.

- **표현식 속성 이름(Expression Attribute Name)**: `#`로 시작한다. 속성 이름이 예약어(예: `Status`, `Views`)이거나 특수 문자를 포함할 때 쓴다.
- **표현식 속성 값(Expression Attribute Value)**: `:`로 시작한다. 값을 식 문자열에 직접 넣지 않고 따로 넘긴다.

```
KeyConditionExpression: "customerId = :c AND begins_with(orderDate, :m)"
FilterExpression:       "#s = :s"
ExpressionAttributeNames:  { "#s": "status" }
ExpressionAttributeValues: { ":c": "C-1", ":m": "2026-10", ":s": "PAID" }
```

식 문자열 하나는 최대 {{fact:dynamodb.expression.max-length}}다. 조건 표현식으로 "없을 때만 쓰기"(`attribute_not_exists`) 같은 조건부 쓰기를 하는 방법은 {{ch:dynamodb/reads-writes}}에서 다룬다.

**PartiQL.** DynamoDB는 SQL과 비슷한 문법인 PartiQL로도 읽고 쓸 수 있다. 콘솔, NoSQL Workbench, AWS CLI, API에서 쓴다. 겉모습은 SQL이지만 동작은 같다. `SELECT`의 `WHERE`에 파티션 키 등호(`=`)나 `IN` 조건이 없으면 **테이블 전체 스캔**이 된다. IAM 정책으로 전체 스캔이 되는 문장을 막을 수 있다.

@quiz

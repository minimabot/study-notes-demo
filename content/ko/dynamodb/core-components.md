---
chapter: dynamodb/core-components
---

@topic dynamodb/core-components/tables-items-attributes

DynamoDB에서 다루는 기본 단위는 셋이다.

| 구성 요소 | 관계형 DB에서 비슷한 것 |
|---|---|
| 테이블(Table): 항목의 모음 | 테이블 |
| 항목(Item): 속성의 모음. 테이블 안에서 하나로 구별된다 | 행(row) |
| 속성(Attribute): 더 나눌 필요 없는 데이터 하나 | 열(column) |

관계형 DB와 크게 다른 점은 **스키마가 없다(schemaless)** 는 것이다. 테이블을 만들 때 정하는 것은 기본 키뿐이다. 나머지 속성은 항목마다 달라도 된다. 예를 들어 `Users` 테이블에서 어떤 항목은 `Phone`이 있고, 다른 항목은 `Address`만 있어도 된다.

- 테이블에 넣을 수 있는 항목 수에는 제한이 없다.
- 항목 하나는 속성 이름까지 합쳐 최대 {{fact:dynamodb.item.max-size}}다.
- 속성 값으로 맵이나 목록을 넣어 중첩할 수 있고, 깊이는 {{fact:dynamodb.attribute.nesting.max-depth}}까지다.

```json
{ "UserId": "u-1001", "Name": "Kim", "Address": { "City": "Seoul", "Zip": "04524" } }
```

@topic dynamodb/core-components/primary-key

모든 항목은 **기본 키(primary key)** 로 구별된다. 기본 키는 두 종류다.

| 종류 | 구성 | 같은 값이 허용되는가 |
|---|---|---|
| 단순 기본 키 | 파티션 키(partition key) 하나 | 파티션 키 값이 항목마다 달라야 한다 |
| 복합 기본 키(composite primary key) | 파티션 키 + 정렬 키(sort key) | 파티션 키가 같아도 정렬 키가 다르면 된다 |

- **파티션 키**는 DynamoDB가 내부 해시 함수에 넣어 항목을 저장할 파티션을 정하는 값이다. 그래서 해시 속성(hash attribute)이라고도 부른다.
- **정렬 키**는 같은 파티션 키를 가진 항목들을 정렬해 두는 값이다. 범위 속성(range attribute)이라고도 부른다.

복합 키가 쓸모 있는 이유는 **범위 조회** 때문이다. 파티션 키 `CustomerId`, 정렬 키 `OrderDate`로 두면 "이 고객의 지난달 주문"을 `Query` 한 번으로 가져온다. 단순 키로는 항목을 하나씩 찾을 수밖에 없다.

키 값의 길이에도 한도가 있다. 문자열·이진 형식일 때 파티션 키는 {{fact:dynamodb.key.partition.max-length}}, 정렬 키는 {{fact:dynamodb.key.sort.max-length}}까지다.

> **주의:** 스키마가 없다고 해도 기본 키 속성만은 예외다. 항목을 쓸 때(`PutItem`) 기본 키 속성은 반드시 넣어야 하고, 형식도 테이블을 만들 때 정한 것과 같아야 한다. 기본 키가 아닌 다른 속성으로 조회해야 하면 보조 인덱스를 쓴다.

@topic dynamodb/core-components/data-types-naming

속성 형식은 세 묶음이다.

| 묶음 | 형식 |
|---|---|
| 스칼라(Scalar): 값 하나 | 숫자, 문자열, 이진, 부울, null |
| 문서(Document): 중첩 구조 | 목록(List), 맵(Map) |
| 집합(Set): 같은 형식 값 여럿 | 문자열 집합, 숫자 집합, 이진 집합 |

알아 둘 규칙:

- **기본 키 속성은 문자열·숫자·이진만 된다.** 부울, 맵, 집합은 키가 될 수 없다.
- **날짜 형식은 따로 없다.** ISO 8601 문자열이나 에포크 초(epoch seconds) 숫자로 저장한다. 에포크 초 숫자는 저장 공간이 작고, TTL(Time to Live)로 만료 항목을 자동 삭제할 때도 이 형식을 쓴다.
- 숫자는 최대 {{fact:dynamodb.number.precision.max}} 정밀도다. 더 필요하면 문자열로 저장한다.

이름 규칙:

- 이름은 UTF-8이고 대소문자를 구별한다.
- 테이블·인덱스 이름은 {{fact:dynamodb.name.table.min-length}} 이상 {{fact:dynamodb.name.table.max-length}} 이하이고, 영문자·숫자와 `_` `-` `.`만 쓴다.
- **속성 이름은 짧게 짓는다.** 속성 이름도 항목 크기에 들어가서 저장 용량과 읽기·쓰기 단위 계산에 포함되기 때문이다.
- **예약어와 특수 문자(`#`, `:`)는 이름으로 피한다.** 쓸 수는 있지만, 식(expression)에서 쓸 때마다 자리표시자(expression attribute name)를 정의해야 한다.

@topic dynamodb/core-components/api

DynamoDB API는 하는 일에 따라 나뉜다.

| 분류 | 대표 작업 |
|---|---|
| 컨트롤 플레인(Control plane): 테이블과 인덱스 관리 | `CreateTable`, `DescribeTable`, `ListTables`, `UpdateTable`, `DeleteTable` |
| 데이터 플레인(Data plane): 항목 읽기·쓰기 | `PutItem`, `GetItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan`, `BatchWriteItem`, `BatchGetItem` |
| Streams: 변경 기록 읽기 | `ListStreams`, `DescribeStream`, `GetShardIterator`, `GetRecords` |
| 트랜잭션 | `TransactWriteItems`, `TransactGetItems` |

데이터 플레인에서 시험에 자주 엮이는 차이:

- **`GetItem`** 은 기본 키 전체를 주고 항목 하나를 읽는다.
- **`Query`** 는 파티션 키 값 하나에 속한 항목을 읽는다. 정렬 키 조건으로 범위를 좁힐 수 있다.
- **`Scan`** 은 테이블이나 인덱스 전체를 읽는다. 필터를 걸어도 읽는 양은 줄지 않는다. 키로 찾을 수 있으면 `Query`를 쓴다.
- **배치 작업**은 네트워크 왕복을 줄인다. `BatchWriteItem`은 요청 {{fact:dynamodb.batch-write.max-requests}}까지, `BatchGetItem`은 항목 {{fact:dynamodb.batch-get.max-items}}까지 담는다. 트랜잭션과 달리 전부 성공하거나 전부 실패하지 않는다.

같은 작업을 SQL과 비슷한 PartiQL 문(`ExecuteStatement`, `BatchExecuteStatement`, `ExecuteTransaction`)으로도 할 수 있다.

@quiz

---
chapter: dynamodb/streams-ttl
---

@topic dynamodb/streams-ttl/cdc-options

**변경 데이터 캡처(Change data capture, CDC)** 는 테이블 항목이 생기고, 바뀌고, 지워질 때마다 그 변경을 거의 실시간으로 기록해 다른 애플리케이션이 받아 쓰게 하는 것이다. 새 고객에게 환영 메일 보내기, 변경 이력을 S3에 남기기, 실시간 지표 집계 같은 일에 쓴다.

DynamoDB에는 CDC 방식이 두 가지 있다. 한 테이블에 둘 다 켤 수도 있다.

| 항목 | DynamoDB Streams | Kinesis Data Streams for DynamoDB |
|---|---|---|
| 보관 기간 | {{fact:dynamodb.streams.retention}} | 최대 {{fact:kinesis.retention.max}} |
| 샤드당 소비자 | {{fact:dynamodb.streams.readers-per-shard}} | {{fact:dynamodb.kds.consumers-per-shard}}, 향상된 팬아웃이면 {{fact:dynamodb.kds.consumers-per-shard.efo}} |
| 순서 | 항목마다 실제 변경 순서대로 | 순서가 바뀔 수 있다. 타임스탬프로 맞춘다 |
| 중복 | 스트림 안에 중복이 없다 | 가끔 중복이 생긴다 |
| 처리 도구 | Lambda, Streams Kinesis 어댑터 | Lambda, Data Firehose, Managed Service for Apache Flink, Glue 등 |

고르는 기준은 대략 이렇다. Lambda 트리거 하나 둘로 변경에 반응하면 되면 DynamoDB Streams가 단순하다. 보관 기간이 길어야 하거나, 소비자가 많거나, Firehose·Flink 같은 분석 도구로 바로 보내야 하면 Kinesis Data Streams를 쓴다.

@topic dynamodb/streams-ttl/streams

**DynamoDB 스트림(DynamoDB Streams)** 을 켜면 항목이 바뀔 때마다 **스트림 레코드(Stream record)** 가 하나 쓰인다. 레코드에 무엇을 담을지는 **스트림 보기 유형(StreamViewType)** 으로 정한다.

| 보기 유형 | 담기는 내용 |
|---|---|
| `KEYS_ONLY` | 바뀐 항목의 키 속성만 |
| `NEW_IMAGE` | 바뀐 뒤 항목 전체 |
| `OLD_IMAGE` | 바뀌기 전 항목 전체 |
| `NEW_AND_OLD_IMAGES` | 전후 항목 전체 |

보기 유형은 한 번 정하면 고칠 수 없다. 바꾸려면 스트림을 끄고 새로 켜야 하고, 그러면 새 ARN의 새 스트림이 생긴다.

DynamoDB Streams가 보장하는 것은 두 가지다.

- 각 레코드는 스트림에 **정확히 한 번** 나타난다.
- **항목 하나**에 대한 레코드는 실제 변경 순서대로 나타난다. 순서 보장은 같은 기본 키 단위다. 테이블 전체나 파티션 키 전체의 순서는 보장하지 않는다.

그 밖에 알아 둘 동작은 다음과 같다.

- 레코드는 {{fact:dynamodb.streams.retention}} 동안 보관되고, 그보다 오래된 것은 언제든 지워질 수 있다. 소비자가 그보다 오래 밀리면 데이터를 잃는다.
- 스트림은 비동기로 쓰이므로 켜도 테이블 성능에 영향이 없다.
- 레코드는 **샤드(Shard)** 로 묶인다. 열린 샤드 하나는 테이블 파티션 하나에 대응하고, 파티션이 늘면 샤드도 늘어난다. 샤드는 쪼개질 수 있으므로 부모 샤드를 자식보다 먼저 처리해야 순서가 지켜진다.
- 샤드 하나를 동시에 읽는 프로세스는 {{fact:dynamodb.streams.readers-per-shard}}를 넘기지 않는다. 넘으면 스로틀될 수 있다.
- 데이터를 실제로 바꾸지 않는 `PutItem`·`UpdateItem`은 레코드를 남기지 않는다.
- 스트림은 테이블과 엔드포인트가 따로다. SDK에서도 DynamoDB Streams 클라이언트를 따로 만든다.
- 트랜잭션 하나의 레코드들이 한꺼번에 나타나지 않을 수 있다. {{ch:dynamodb/transactions}}에서 다뤘다.

@topic dynamodb/streams-ttl/lambda-triggers

스트림 ARN을 Lambda 함수에 연결하면 **트리거(Trigger)** 가 된다. 이 연결이 Lambda의 **이벤트 소스 매핑(Event source mapping)** 이다.

- Lambda가 스트림을 {{fact:dynamodb.streams.lambda.poll-rate}} 폴링하고, 새 레코드가 있으면 배치로 묶어 함수를 동기 호출한다.
- 한 스트림에 붙이는 함수는 {{fact:dynamodb.streams.readers-per-shard}}까지로 둔다. 더 붙이면 읽기 스로틀이 날 수 있다. 소비자가 더 필요하면 Kinesis Data Streams 방식을 검토한다.
- 기본으로 샤드 하나를 함수 인스턴스 하나가 순서대로 처리한다. 병렬화 계수(`ParallelizationFactor`)를 최대 {{fact:dynamodb.streams.lambda.parallelization.max}}까지 올리면 샤드 하나를 여러 인스턴스가 처리하면서도 항목별 순서는 지킨다.

**실패 처리.** 함수가 오류를 내면 Lambda는 성공하거나 레코드가 만료될 때까지 **같은 배치를 계속 재시도**한다. 그동안 그 샤드의 뒤 레코드는 막힌다. 그래서 배치를 나눠 재시도하기, 재시도 횟수 제한, 너무 오래된 레코드 버리기 같은 옵션을 함께 정한다. 세부 옵션은 Lambda 개발자 안내서의 이벤트 소스 매핑 문서를 본다.

> **주의:** "스트림 안에 정확히 한 번"은 저장에 대한 보장이다. Lambda 소비자는 **최소 한 번(at-least-once)** 처리라서, 재시도 때 같은 레코드를 두 번 처리할 수 있다. 함수 코드는 멱등적으로 만든다. 예를 들어 레코드의 시퀀스 번호나 이벤트 ID를 기준으로 조건부 쓰기를 해 중복을 거른다.

AWS가 권하는 Lambda 트리거 작성법은 이렇다. AWS 서비스 클라이언트는 핸들러 밖 초기화 코드에서 만들어 재사용한다. 함수는 짧게 끝내고, 무거운 후처리는 Step Functions 같은 비동기 흐름으로 넘긴다.

@topic dynamodb/streams-ttl/kinesis

**Kinesis Data Streams for DynamoDB** 는 항목 변경을 사용자가 가진 Kinesis 데이터 스트림으로 복제한다. 레코드에는 변경 시각, 기본 키, 변경 전후 항목이 들어 있다. 이 역시 비동기라 테이블 성능에 영향이 없다.

- 테이블과 **같은 계정, 같은 리전**의 Kinesis 데이터 스트림 **하나**로만 보낼 수 있다.
- 레코드 순서가 실제 변경 순서와 다를 수 있고, 같은 변경이 두 번 올 수 있다. 레코드의 `ApproximateCreationDateTime`으로 순서를 맞추고 중복을 걸러 낸다.
- 요금은 DynamoDB의 변경 데이터 캡처 단위 요금과 Kinesis Data Streams 요금이 따로 붙는다.
- 보관 기간과 소비자 수는 Kinesis 쪽 설정을 따른다. 샤드 용량과 향상된 팬아웃은 Kinesis 문서에서 다룬다.

DynamoDB Streams와의 가장 큰 차이는 "순서와 중복을 소비자가 처리해야 한다"는 점이다. 대신 오래 보관하고, 여러 분석 서비스로 바로 보낼 수 있다.

@topic dynamodb/streams-ttl/ttl

**TTL(Time to Live)** 은 항목마다 만료 시각을 적어 두면 DynamoDB가 지나간 항목을 알아서 지우는 기능이다. 세션, 임시 토큰, 오래된 로그처럼 일정 시간 뒤 쓸모없는 데이터에 쓴다.

**설정.** 테이블에서 TTL을 켜고, 만료 시각을 담을 속성 이름을 하나 정한다.

- 값은 **숫자(Number) 타입의 Unix epoch 초**여야 한다. 문자열이거나 밀리초면 TTL이 그 항목을 무시한다.
- 값이 현재보다 {{fact:dynamodb.ttl.past-limit}} 넘게 과거면 삭제 대상이 되지 않는다.
- 최소 TTL 길이는 없다. 흔히 생성·수정 시각에 보관 기간을 더해 계산한다.

**삭제 시점.** 만료된 항목은 바로 지워지지 않는다. 백그라운드 작업이 **보통 만료 뒤 며칠 안에** 지운다. 그 전까지는 읽기·쓰기 결과에 계속 나오고, 저장 비용과 읽기 비용에도 들어간다. 그래서 정확히 만료 시각에 사라져야 하는 데이터라면 `Query`·`Scan`에 필터 표현식(만료 시각 > 현재 시각)을 걸어 걸러 낸다. 삭제 전이라면 TTL 값을 미래로 고치거나 지워 만료를 취소할 수도 있다. 이때는 그사이 지워지지 않았는지 조건식으로 확인하라고 AWS는 권장한다.

**비용과 부수 효과.**

| 항목 | 동작 |
|---|---|
| 쓰기 용량 | TTL 삭제는 WCU를 쓰지 않는다 |
| 인덱스 | 일반 삭제처럼 LSI·GSI에서도 지워진다 |
| 스트림 | 삭제 레코드가 남는다. 사용자 삭제가 아니라 **서비스 삭제**로 표시된다 |
| 글로벌 테이블 | 다른 리전 복제본에도 삭제가 복제되고, 복제 쓰기 요금이 붙는다 |

스트림에서 TTL 삭제는 `userIdentity.type`이 `Service`, `principalId`가 `dynamodb.amazonaws.com`인 레코드로 구분한다. 이를 이용해 "만료된 항목만 S3에 보관"하는 Lambda를 만들 수 있다. 다만 글로벌 테이블에서는 삭제가 일어난 리전의 스트림에서만 이렇게 구분된다.

@quiz

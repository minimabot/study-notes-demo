---
chapter: dynamodb/monitoring
---

@topic dynamodb/monitoring/metrics

DynamoDB는 테이블 상태를 **Amazon CloudWatch 지표(Metric)** 로 자동으로 보낸다. 따로 켤 것이 없다. 지표는 `AWS/DynamoDB` 네임스페이스에 있고, 테이블 이름(`TableName`), GSI 이름(`GlobalSecondaryIndexName`), 작업(`Operation`) 같은 **차원(Dimension)** 으로 나뉜다.

AWS는 평소 성능의 **기준선(Baseline)** 을 먼저 잡으라고 안내한다. 최소한 소비 용량, 용량을 넘은 요청, 시스템 오류 세 가지를 시간대와 부하별로 기록해 두면, 이상한 값을 알아보기 쉽다.

자주 보는 지표는 다음과 같다.

| 지표 | 무엇을 알려 주나 |
|---|---|
| `ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits` | 실제로 쓴 읽기·쓰기 단위. 프로비저닝 값이나 한도와 비교한다 |
| `ThrottledRequests` | 스로틀된 요청 수 |
| `ReadThrottleEvents`, `WriteThrottleEvents` | 스로틀된 읽기·쓰기 이벤트 수. 테이블과 GSI를 따로 본다 |
| `SystemErrors` | HTTP 500 응답 수(서비스 쪽 오류) |
| `UserErrors` | HTTP 400 응답 수(요청 쪽 오류) |
| `SuccessfulRequestLatency` | 성공한 요청의 서비스 내부 지연 시간 |
| `ReplicationLatency` | 글로벌 테이블에서 한 복제본의 변경이 다른 복제본에 나타나기까지 걸린 시간 |

읽을 때 알아 둘 점이 있다.

- **집계 간격.** 위 지표처럼 소비 용량·스로틀·오류·지연 시간 지표는 {{fact:dynamodb.metrics.period.fast}} 간격으로 모인다. 그 밖의 지표(계정 사용률, 프로비저닝 값 등)는 {{fact:dynamodb.metrics.period.default}} 간격이다.
- **초당 값으로 바꾸기.** 소비 용량은 `Sum` 통계를 쓴다. 한 기간의 합을 그 기간의 초 수로 나누면 초당 평균이 된다. 다만 평균이라서 그 안의 짧은 급증은 드러나지 않는다.
- **`ThrottledRequests`는 요청 단위로 센다.** GSI가 있는 테이블에 쓰면 테이블 쓰기와 각 GSI 쓰기가 따로 일어난다. 이 중 몇 개가 스로틀돼도 `ThrottledRequests`는 하나만 오른다. 그래서 실제 규모는 `ReadThrottleEvents`·`WriteThrottleEvents`로 확인한다. 배치 요청은 안의 요청이 **모두** 스로틀될 때만 `ThrottledRequests`가 오른다.
- **`UserErrors`는 테이블별이 아니다.** 현재 계정·리전 전체의 HTTP 400 합계다. 조건부 쓰기가 실패한 경우(`ConditionalCheckFailedException`)는 `UserErrors`가 아니라 `ConditionalCheckFailedRequests`에 들어간다.
- **`ReplicationLatency`** 는 받는 리전(`ReceivingRegion`) 차원으로 본다. 글로벌 테이블은 {{ch:dynamodb/global-tables}}에서 다뤘다.

@topic dynamodb/monitoring/alarms

**CloudWatch 경보(Alarm)** 는 지표 하나를 정해 둔 기간 동안 지켜보다가, 임계값을 넘은 상태가 정해 둔 기간 수만큼 이어지면 동작한다. 보통 Amazon SNS 주제로 알림을 보낸다. 상태가 "바뀌고 유지될 때" 동작하므로, 이미 경보 상태라는 이유만으로 계속 동작하지는 않는다.

DynamoDB에 흔히 거는 경보는 다음과 같다.

| 경보 대상 | 설정 예 |
|---|---|
| 소비 용량 | 프로비저닝 값의 {{raw:80%}}에 해당하는 소비량(`Sum`)을 넘으면 알림. 용량을 다 쓰기 전에 안다 |
| 스로틀 | `ReadThrottleEvents`·`WriteThrottleEvents`가 {{raw:0}}보다 크면 알림. GSI는 GSI 차원으로 따로 건다 |
| 시스템 오류 | `SystemErrors`의 `Sum`이 {{raw:0}}보다 크면 알림 |

> **주의: 차원을 빠뜨리면 경보가 영원히 울리지 않는다.** CloudWatch는 빠진 차원을 대신 합쳐 주지 않는다. 그리고 차원이 빠진 경보를 만들어도 오류가 나지 않는다. 예를 들어 `SystemErrors`는 `TableName`과 `Operation` 두 차원 조합으로만 나온다. `TableName`만 지정한 경보는 데이터를 하나도 받지 못해 `INSUFFICIENT_DATA` 상태에 머문다. GSI의 프로비저닝 값을 보려면 `TableName`과 `GlobalSecondaryIndexName`을 함께 지정한다.

경보를 만든 뒤에는 `set-alarm-state`로 상태를 강제로 바꿔 알림이 실제로 오는지 시험할 수 있다.

계정 단위로 보는 지표도 있다. `AccountProvisionedReadCapacityUtilization`처럼 계정 처리량 한도 대비 사용률을 알려 주는 지표에 경보를 걸면, 한도에 닿기 전에 증가를 요청할 수 있다. 한도 값은 {{ch:dynamodb/limits}}에 모았다.

@topic dynamodb/monitoring/throttling

**스로틀링(Throttling)** 은 DynamoDB가 요청을 일부러 거절하는 것이다. 이유는 네 가지로 나뉜다.

| 이유 | 언제 |
|---|---|
| 키 범위(파티션) 한도 초과 | 두 모드 모두. 한 파티션에 몰린 소비가 파티션 한도({{fact:dynamodb.partition.read.max}}, {{fact:dynamodb.partition.write.max}})를 넘었다 |
| 프로비저닝 처리량 초과 | 프로비저닝된 모드. 테이블이나 GSI에 정해 둔 RCU·WCU를 넘었다 |
| 계정 수준 한도 초과 | 온디맨드 모드. 테이블·GSI별 리전 처리량 한도를 넘었다. 증가를 요청할 수 있다 |
| 온디맨드 최대 처리량 초과 | 온디맨드 모드. 사용자가 비용 통제용으로 걸어 둔 최대 처리량을 넘었다 |

**1단계: 예외 안의 이유를 읽는다.** 스로틀된 요청은 `ProvisionedThroughputExceededException`, `ThrottlingException`, `RequestLimitExceeded` 같은 예외를 받는다. 예외에는 `ThrottlingReasons` 목록이 들어 있고, 각 항목에 이유(reason)와 자원 ARN이 있다. 이유는 `<자원 종류><작업 종류><한도 종류>` 형식이다.

- 자원 종류: `Table` 또는 `Index`
- 작업 종류: `Read` 또는 `Write`
- 한도 종류: `KeyRangeThroughputExceeded`, `ProvisionedThroughputExceeded`, `AccountLimitExceeded`, `MaxOnDemandThroughputExceeded`

예를 들어 `TableWriteKeyRangeThroughputExceeded`는 테이블 전체가 아니라 특정 파티션 키 범위가 쓰기 한도를 넘었다는 뜻이다. 이때 테이블 용량을 올리는 것은 답이 아니다. 핫 파티션을 풀어야 한다.

**2단계: 이유에 맞는 지표를 본다.** 이유마다 같은 이름의 지표가 있다. `...KeyRangeThroughputExceeded`는 `ReadKeyRangeThroughputThrottleEvents`·`WriteKeyRangeThroughputThrottleEvents`, `...ProvisionedThroughputExceeded`는 `...ProvisionedThroughputThrottleEvents`, `...AccountLimitExceeded`는 `...AccountLimitThrottleEvents`, `...MaxOnDemandThroughputExceeded`는 `...MaxOnDemandThroughputThrottleEvents`다. `ThrottledRequests`·`ReadThrottleEvents`·`WriteThrottleEvents`는 이유를 가리지 않고 합친 값이다.

**3단계: 파티션 문제면 키를 찾는다.** 다음 절의 Contributor Insights로 가장 많이 스로틀된 키를 찾는다. 특정 키가 튀지 않는데도 키 범위 스로틀이 나면, 하나의 핫 키가 아니라 `Scan` 순서대로 쓰기처럼 키 범위를 차례로 훑는 접근이 원인일 수 있다. 이때는 속도를 제한하거나 병렬 스캔으로 접근을 흩는다. 키 설계는 {{ch:dynamodb/partitions}}에서 다뤘다.

**4단계: 이유에 맞게 고치고, 5단계: 같은 지표로 효과를 확인한다.**

| 원인 | 대응 |
|---|---|
| 키 범위 | 파티션 키 설계를 바꾸거나 쓰기를 분산한다. 용량 모드를 바꿔도 이 한도는 그대로다 |
| 프로비저닝 초과 | 용량을 올리거나 Auto Scaling·온디맨드를 검토한다({{ch:dynamodb/capacity}}) |
| 계정 한도 | 한도 증가를 요청한다 |
| 최대 처리량 | 직접 정한 값을 올리거나 해제한다 |

**GSI 역압(back-pressure).** GSI는 비동기로 갱신된다. 그런데 GSI가 갱신을 감당하지 못하면 DynamoDB는 **기본 테이블 쓰기**를 스로틀한다. 테이블 용량이 넉넉해도 그렇다. 이때 예외의 자원 ARN은 GSI(`.../index/<인덱스 이름>`)를 가리키지만 실패한 것은 테이블 쓰기다. GSI는 자기 파티션 키로 따로 파티션을 나누므로, 테이블 키가 고르게 퍼져 있어도 GSI 키(예: 값이 몇 개뿐인 `status`)에는 핫 파티션이 생길 수 있다. 이유 문자열은 `IndexWriteProvisionedThroughputExceeded`, `IndexWriteKeyRangeThroughputExceeded`처럼 `Index`로 시작한다.

@topic dynamodb/monitoring/logging

**AWS CloudTrail** 은 DynamoDB API 호출을 이벤트로 기록한다. 콘솔에서 한 호출, 코드에서 한 호출, PartiQL 호출이 모두 들어간다. 최근 이벤트는 따로 설정하지 않아도 **이벤트 기록(Event history)** 에서 볼 수 있다. 계속 보관하려면 **추적(Trail)** 을 만들어 S3 버킷으로 보낸다. CloudWatch Logs로 보내 경보를 걸거나, Amazon Athena로 조회해 원본 IP·사용자별로 활동을 살필 수 있다.

기록 대상은 두 종류이고, 기본값이 다르다.

| 종류 | 예 | 기본 기록 |
|---|---|---|
| 컨트롤 플레인(Control plane) 이벤트 | `CreateTable`, `UpdateTable`, `DeleteTable`, `UpdateTimeToLive`, 백업·복원, 글로벌 테이블 | 기록된다 |
| 데이터 플레인(Data plane) 이벤트 | `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan`, 배치·트랜잭션, Streams `GetRecords` | 추적에서 데이터 이벤트를 켜야 기록된다 |

- 데이터 이벤트는 자원 종류로 거를 수 있다. `AWS::DynamoDB::Stream`만 고르면 Streams API만 기록한다. `AWS::DynamoDB::Table`을 고르면 테이블과 Streams 이벤트를 모두 기록한다.
- TTL이 항목을 지우는 동작은 CloudTrail에 기록되지 않는다.
- `GetRecords`를 기록하면 글로벌 테이블 복제처럼 DynamoDB 내부 작업의 호출도 잡힌다. DynamoDB 요금은 없지만 CloudTrail 데이터 이벤트 요금은 붙는다. AWS 서비스가 시작한 이벤트를 빼는 선택기를 쓴다.

**CloudWatch Contributor Insights for DynamoDB** 는 테이블이나 GSI에서 가장 많이 접근되거나 가장 많이 스로틀된 키를 보여 준다. 테이블 성능에는 영향을 주지 않도록 설계됐다. 요금은 CloudWatch 쪽에 붙는다. 모드는 두 가지다.

| 모드 | 추적 대상 | 쓰임 |
|---|---|---|
| 스로틀된 키(Throttled keys) | 가장 많이 스로틀된 항목 | 스로틀이 날 때만 이벤트를 처리하므로 늘 켜 두기에 비용이 적다. 스로틀이 없으면 그래프가 비어 있다 |
| 접근·스로틀된 키(Accessed and throttled keys) | 가장 많이 접근된 항목 + 가장 많이 스로틀된 항목 | 접근 패턴 전체를 볼 때 |

- 켜면 DynamoDB가 CloudWatch 규칙을 대신 만든다. 이 규칙은 CloudWatch에서 직접 고치거나 지울 수 없고, 기능을 끄면 함께 지워진다.
- 정렬 키가 있으면 파티션 키 기준과 파티션 키+정렬 키 기준 규칙이 따로 생긴다.
- 기본 키가 세분화된 액세스 제어(FGAC)로 보호하는 값이라면 주의한다. CloudWatch 권한이 있는 사용자는 그래프에서 키 값을 볼 수 있다.

@topic dynamodb/monitoring/errors

DynamoDB 오류는 HTTP 상태 코드, 예외 이름, 메시지로 이뤄진다. 재시도할지는 종류로 정한다.

| 분류 | 예외 예 | 재시도 |
|---|---|---|
| 400, 스로틀 | `ProvisionedThroughputExceededException`, `ThrottlingException`, `RequestLimitExceeded` | 한다(백오프와 함께) |
| 400, 기타 재시도 가능 | `LimitExceededException`(동시 컨트롤 플레인 작업이 많음), `ItemCollectionSizeLimitExceededException`, `ReplicatedWriteConflictException` | 한다 |
| 400, 요청을 고쳐야 함 | `ValidationException`, `ConditionalCheckFailedException`, `AccessDeniedException`, `ResourceNotFoundException`, `ResourceInUseException` | 하지 않는다. 요청을 고친다 |
| 5xx | `InternalServerError`(500), `ServiceUnavailable`(503) | 한다 |

`LimitExceededException`은 생성·수정·삭제 중인 테이블과 인덱스가 합쳐서 {{fact:dynamodb.control-plane.concurrent.max}}를 넘을 때 난다.

**지수 백오프(Exponential backoff).** AWS SDK는 재시도와 지수 백오프를 자동으로 한다. 실패가 이어질수록 다음 재시도까지 기다리는 시간을 늘린다. 여러 클라이언트가 동시에 재시도하면 무작위 지연(지터, jitter)을 섞어 충돌을 줄인다. SDK 없이 직접 호출한다면 5xx와 스로틀 오류는 재시도하고, 나머지 4xx는 요청을 고친다. 재시도 횟수와 백오프 값은 SDK 설정으로 바꿀 수 있다.

**배치 요청.** `BatchGetItem`·`BatchWriteItem`은 일부만 실패해도 전체가 실패하지 않는다. 처리하지 못한 키와 항목을 `UnprocessedKeys`·`UnprocessedItems`로 돌려준다. 가장 흔한 원인은 스로틀이다. 이것들만 백오프를 두고 다시 보낸다.

**내부 서버 오류(HTTP 500).** 분산 서비스라 가끔 나는 것은 정상이고 바로 재시도해도 된다. 주의할 점이 하나 있다. 쓰기에서 500을 받으면 실제로는 성공했을 수도 있다. `TransactWriteItems`는 그대로 재시도해도 되지만, `PutItem`·`UpdateItem`·`DeleteItem`은 항목 상태를 먼저 읽거나 조건식을 붙여 재시도한다. 오류가 계속되면 AWS Health Dashboard를 먼저 확인한다. {{fact:dynamodb.ise.escalation.window}} 동안 전체 실패율이 {{fact:dynamodb.ise.escalation.rate}} 이상이면 AWS Support에 알릴 때로 안내된다. 이때 영향받은 테이블, 시간대, 요청 ID를 함께 준다. 그래서 애플리케이션 로그에 요청 ID를 남겨 둔다.

**지연 시간.** `SuccessfulRequestLatency`는 DynamoDB 안에서 걸린 시간만 잰다. 네트워크와 클라이언트 쪽 시간은 빠진다. 가끔 튀는 `Maximum`이나 높은 백분위수는 걱정할 일이 아니다. `Average`나 p50이 크게 오르고 그대로 있으면 살펴본다. p50은 보통 요청, p99는 가장 느린 일부 요청을 보여 준다. 줄이는 방법은 다음과 같다.

- 연결을 재사용한다(keep-alive). 새 HTTPS 연결은 왕복이 여러 번 필요하다.
- 강력한 일관성이 필요 없으면 최종 일관된 읽기를 쓴다.
- 꼬리 지연이 중요하면 요청 헤징(먼저 온 응답을 쓰는 중복 요청)을 검토한다. 제한 시간을 너무 짧게 잡으면 오히려 가용성이 떨어진다.
- 사용자와 먼 리전이면 글로벌 테이블, 읽기가 많으면 DAX나 ElastiCache 캐시를 검토한다.

@quiz

@design

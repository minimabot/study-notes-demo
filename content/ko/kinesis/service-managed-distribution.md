---
chapter: kinesis/service-managed-distribution
---

@topic kinesis/service-managed-distribution/what

**레코드 분배 전략(Record distribution strategy)** 은 레코드를 어느 샤드에 넣을지 누가 정하는지를 고르는 스트림 수준 설정이다. 두 가지가 있다.

| 전략 | 동작 |
|---|---|
| 사용자 관리형 파티션 키(`USER_PARTITION_KEY`, 기본값) | 생산자가 레코드마다 파티션 키를 넣는다. 키의 해시 값으로 샤드가 정해진다. 같은 키는 같은 샤드에 순서대로 들어간다 |
| 서비스 관리형 레코드 분배(`AUTO`) | 서비스가 내부 알고리즘으로 레코드를 샤드에 고르게 퍼뜨린다. 파티션 키가 필요 없다 |

이 기능은 개발자 안내서에 최근 추가됐다(문서 기록상 2026년). 시험 범위인지는 확인되지 않았다. 해시 키와 샤드 배정의 기본은 {{ch:kinesis/key-concepts}}, 파티션 키 설계는 {{ch:kinesis/producers}}에서 다룬다.

서비스 관리형 분배의 성질은 다음과 같다.

- **온디맨드 스트림 전용.** 온디맨드 표준과 On-demand Advantage에서만 쓴다. 프로비저닝 스트림에 켜려 하면 `InvalidArgumentException`이 난다({{ch:kinesis/capacity-modes}}).
- **순서 보장이 없다.** 같은 업무 개체(사용자, 계좌, 기기)의 레코드가 같은 샤드로 간다는 보장이 없다.
- **파티션 키는 무시된다.** `PutRecord`·`PutRecords`에 키를 넣어도 샤드 배정에 쓰이지 않는다.
- **스트림 안에서 섞을 수 없다.** 한 스트림은 한 전략만 쓴다. 순서가 필요한 데이터와 아닌 데이터가 같이 있으면 스트림을 나눈다.
- **추가 요금과 새 한도가 없다.** 기존 요금과 한도가 그대로다.

@topic kinesis/service-managed-distribution/when

고르는 기준은 **순서가 필요한가** 다.

| 서비스 관리형 분배가 맞는 경우 | 사용자 관리형 키를 유지할 경우 |
|---|---|
| 로그 집계, 지표 수집 | 데이터베이스 변경 데이터 캡처(CDC). 같은 행의 변경을 차례로 처리해야 한다 |
| IoT 텔레메트리 | 계좌 단위 순서가 필요한 금융 거래 |
| 클릭스트림 분석 | 한 세션의 이벤트를 함께 처리하는 세션 분석 |

얻는 것은 **뜨거운 샤드(Hot shard)가 사라진다** 는 점이다. 키가 고르지 않거나, 몰리는 키가 시간에 따라 바뀌는 경우에도 서비스가 고르게 나눈다. 프로비저닝 모드에서 `ExplicitHashKey`나 샤드 분할로 직접 풀던 문제를 서비스에 맡기는 셈이다. 대신 순서와 "같은 키는 같은 샤드"라는 성질을 버린다.

@topic kinesis/service-managed-distribution/configure

**켜기.** 새 스트림은 `CreateStream`에 `RecordDistributionStrategy`를 `AUTO`로 넣는다. 지정하지 않으면 `USER_PARTITION_KEY`다. 기존 온디맨드 스트림은 `UpdateStreamRecordDistributionStrategy` API로 바꾼다. 필요한 IAM 권한은 `kinesis:CreateStream`, `kinesis:UpdateStreamRecordDistributionStrategy`, 현재 전략을 보는 `kinesis:DescribeStreamSummary`다.

**즉시 반영된다.** 변경은 {{fact:kinesis.smd.propagation}} 안에 서비스 전체에 퍼진다. 점진 배포나 카나리가 없고, 소비자에게 알리거나 배수(drain)하지도 않는다. 처리 중인 배치 한가운데서 동작이 바뀔 수 있다. 언제든 되돌릴 수 있지만, AWS는 운영 전에 비운영 환경에서 실제와 비슷한 트래픽으로 먼저 시험하라고 권장한다.

**전환 때 일어나는 일.**

- 이미 스트림에 있는 레코드는 원래 샤드에 남는다. 새 레코드부터 새 전략을 따른다.
- `USER_PARTITION_KEY` → `AUTO`: 같은 키의 레코드가 더는 같은 샤드에 모이지 않는다.
- `AUTO` → `USER_PARTITION_KEY`: 생산자는 다시 키를 넣어야 한다. 키를 빼면 쓰기가 실패한다. `AUTO` 동안 쓴 레코드는 재배치되지 않으므로, 한 키의 레코드가 전환 전후 샤드에 나뉘어 있을 수 있다.

설정 오류는 다음 셋이다.

| 오류 | 원인 |
|---|---|
| `InvalidArgumentException` | 프로비저닝 스트림에 `AUTO`를 켜려 했다 |
| `ResourceNotFoundException` | 스트림이 없다 |
| `LimitExceededException` | 동시 설정 변경이 너무 많다. 기다렸다 재시도한다 |

@topic kinesis/service-managed-distribution/producers-consumers

**생산자.**

- 파티션 키를 계속 넣는 기존 생산자는 코드를 바꾸지 않아도 된다. 서비스가 값을 무시한다. 그래서 여러 팀의 배포를 맞추지 않고도 운영 스트림에서 켤 수 있다.
- 키를 아예 빼려면(null 파티션 키) 최신 KPL이나 최신 SDK로 올린다.
- `ExplicitHashKey`는 무시되고, `PutRecord`의 `SequenceNumberForOrdering`은 넣으면 거부된다. 둘 다 코드에서 빼는 것이 권장 사항이다.
- 배치는 계속 `PutRecords`로 묶는다. `WriteProvisionedThroughputExceeded` 지표로 뜨거운 샤드가 없는지 확인한다.

**KPL 집계(Aggregation)는 어느 버전에서도 지원되지 않는다.** 집계를 끄거나, 최신 KPL로 올리고 `kinesis:DescribeStreamSummary` 권한을 준다. 최신 KPL은 이 API로 서비스 관리형 스트림인지 알아보고 집계를 스스로 끈다. 권한이 없으면 집계로 되돌아가고, 그렇게 쓰인 집계 레코드는 KCL 소비자가 집계 해제하는 과정에서 **조용히 버려질 수 있다.**

**소비자.**

- `GetRecords`·`SubscribeToShard`는 키 없이 쓰인 레코드의 `PartitionKey`를 비어 있는(null) 값으로 돌려준다. 이 값이 늘 있다고 가정한 코드는 실행 중에 실패한다. `AUTO`를 켜기 전에 소비자부터 고친다.
- 파티션 키를 업무 로직(라우팅, 그룹화)에 쓰지 않는다. 레코드 사이의 순서도 가정하지 않는다.
- 샤드 이터레이터, 리샤딩 처리, 체크포인트 방식은 그대로다. KCL은 바꿀 것이 없다.

@topic kinesis/service-managed-distribution/integrations

AWS 서비스 연동은 대부분 그대로 동작한다. 차이는 "파티션 키가 비어 있을 수 있다"는 점에서 나온다.

| 서비스 | 알아 둘 점 |
|---|---|
| Lambda 이벤트 소스 매핑 | 그대로 동작한다. 이벤트의 `partitionKey`가 null일 수 있다 |
| Amazon Data Firehose | 그대로 동작한다. 변환 Lambda 입력과 Snowflake 메타데이터에서는 null 대신 빈 문자열로 보인다 |
| Managed Service for Apache Flink | 현재 커넥터(`flink-connector-aws-kinesis-streams`)는 그대로 된다. 레거시 커넥터는 KPL 집계를 쓰므로 먼저 옮긴다 |
| DynamoDB(Kinesis로 변경 데이터 보내기) | 그대로 된다. 다만 한 항목의 변경이 여러 샤드로 흩어진다. 순서는 `ApproximateCreationDateTime`으로 맞춘다 |
| 스트리밍 테이블·S3 전송 | 키가 있든 없든 그대로 전달된다({{ch:kinesis/data-delivery}}) |

@quiz

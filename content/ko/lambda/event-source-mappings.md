---
chapter: lambda/event-source-mappings
---

@topic lambda/event-source-mappings/basics

**이벤트 소스 매핑(event source mapping)** 은 큐나 스트림을 읽어 레코드를 배치로 묶고 함수를 부르는 Lambda 리소스다. 매핑 안에서 실제로 소스를 읽는 일은 **이벤트 폴러(event poller)** 가 맡는다. 폴러 수는 기본적으로 Lambda가 메시지 양에 맞춰 늘리고 줄인다. 트리거(S3, SNS, API Gateway의 push)와의 차이는 {{ch:lambda/invocation}}에서 다뤘다.

이벤트 소스 매핑을 쓰는 소스는 일곱 가지다.

- 큐: Amazon SQS, Amazon MQ
- 스트림: Amazon Kinesis Data Streams, Amazon DynamoDB Streams
- Kafka: Amazon MSK, 자체 관리형 Apache Kafka
- 변경 스트림: Amazon DocumentDB(MongoDB 호환)

알아 둘 점:

- **최소 한 번 처리.** 같은 레코드가 두 번 올 수 있다. 문서는 함수 코드를 멱등하게 만들라고 강하게 권한다.
- **소스를 읽는 권한은 실행 역할에 둔다.** Lambda가 함수 대신 소스를 폴링하므로, 함수의 리소스 기반 정책이 아니라 실행 역할에 읽기 권한이 있어야 한다. `AWSLambdaSQSQueueExecutionRole`, `AWSLambdaKinesisExecutionRole`, `AWSLambdaDynamoDBExecutionRole`, `AWSLambdaMSKExecutionRole` 같은 AWS 관리형 정책이 출발점이다({{ch:lambda/permissions}}).
- **API.** `CreateEventSourceMapping`, `UpdateEventSourceMapping`, `GetEventSourceMapping`, `ListEventSourceMappings`, `DeleteEventSourceMapping`. 매핑을 끄면(비활성화) 폴링이 멈춘다.
- 소스별 세부 설정은 그 서비스 장에 있다. SQS는 {{ch:sqs/integrations}}, Kinesis는 {{ch:kinesis/consumers}}, DynamoDB Streams는 {{ch:dynamodb/streams-ttl}}.

@topic lambda/event-source-mappings/batching

매핑은 레코드를 모아 한 번의 호출에 넘긴다. 다음 셋 중 하나가 먼저 채워지면 함수를 부른다.

1. **배치 기간(batching window, `MaximumBatchingWindowInSeconds`)** 이 끝났다. 레코드를 모으는 최대 시간이다. 최댓값은 {{fact:lambda.sqs.batch.window.max}}이고 초 단위로만 정한다.
2. **배치 크기(`BatchSize`)** 에 닿았다. 한 배치의 최대 레코드 수다.
3. 모은 페이로드가 {{fact:lambda.payload.sync.max}}에 닿았다. 이 한도는 바꿀 수 없다.

| 소스 | 기본 배치 기간 | 배치 크기 기본값 / 최댓값 |
|---|---|---|
| SQS | {{fact:lambda.sqs.batch.window.default}} | {{fact:lambda.sqs.batch.default}} / 표준 {{fact:lambda.sqs.batch.max-standard}}, FIFO {{fact:lambda.sqs.batch.max-fifo}} |
| Kinesis, DynamoDB Streams | {{fact:lambda.sqs.batch.window.default}} (레코드가 있으면 바로 호출) | {{fact:kinesis.lambda.batch.default}} / {{fact:kinesis.lambda.batch.max}} |
| MSK, 자체 관리형 Kafka, MQ, DocumentDB | {{fact:lambda.esm.batch-window.default.kafka-mq-docdb}} | Kinesis와 같다 |

- MQ·DocumentDB·Kafka의 기본 배치 기간은 초 단위가 아니다. 한 번 바꾸면 그 기본값으로 되돌릴 수 없고, 되돌리려면 매핑을 새로 만든다.
- 배치를 크게 잡으면 호출 한 번의 고정 비용을 여러 레코드가 나눠 진다. 문서는 배치·레코드 크기를 바꿔 가며 시험해, 폴링 빈도가 함수 처리 속도에 맞게 하라고 권한다.
- MSK, 자체 관리형 Kafka, DocumentDB, Amazon MQ 매핑은 함수 제한 시간이 {{fact:lambda.esm.timeout.max.kafka-mq-docdb}} 이하여야 한다. 일반 최댓값({{fact:lambda.timeout.max}})보다 짧다. 오류와 재시도를 처리할 여유를 남기기 위해서다.
- Lambda는 확장(extension)이 끝나기를 기다리지 않고 다음 배치를 보낸다. 그래서 동시성 지표가 예상(예: 샤드 수)보다 잠깐 높게 보일 수 있고, 동시성 한도에 걸릴 수도 있다({{ch:lambda/concurrency}}).

@topic lambda/event-source-mappings/filtering

**이벤트 필터링(event filtering)** 은 함수에 넘길 레코드를 매핑에서 미리 고르는 기능이다. 필요 없는 레코드로 함수를 부르지 않으므로 호출 수와 비용이 준다.

- 지원: SQS, Kinesis, DynamoDB Streams, Amazon MQ, MSK, 자체 관리형 Kafka. **DocumentDB는 지원하지 않는다.**
- `FilterCriteria` 안에 필터(`Filters`)를 여러 개 두고, 각 필터는 `Pattern` 문자열 하나다. 문법은 EventBridge 이벤트 패턴과 같다(같음, 접두사·접미사, `anything-but`, 숫자 범위, `exists`, `$or` 등).
- 매핑 하나에 기본 {{fact:lambda.esm.filters.default}}까지, 할당량을 늘리면 {{fact:lambda.esm.filters.max}}까지 둔다. 필터끼리는 **OR** 다. 하나라도 맞으면 함수로 간다.
- 데이터 필드의 키가 소스마다 다르다. SQS는 `body`, Kinesis·MQ는 `data`, DynamoDB는 `dynamodb`, Kafka는 `value`다. 키를 틀리면 아무것도 맞지 않는다.
- 문자열은 대소문자까지 정확히 맞아야 하고, 숫자도 표기가 다르면 다른 값으로 본다. `exists`는 말단 필드에만 쓴다.

**맞지 않은 레코드는 어떻게 되나.** 소스마다 다르다.

| 소스 | 필터에 안 맞으면 |
|---|---|
| SQS | Lambda가 큐에서 메시지를 자동으로 지운다. 나중에 다시 처리할 수 없다 |
| Kinesis, DynamoDB Streams | 반복자(iterator)가 그 레코드를 지나간다. 레코드는 보존 기간이 지나면 스트림에서 사라진다 |
| MSK, 자체 관리형 Kafka | 버린다. 맞은 것과 함께 함수 호출이 성공한 뒤 오프셋을 커밋한다 |
| Amazon MQ | 버린다. 걸러 낼 때 바로 확인(acknowledge)한다 |

SQS에서 필터를 걸 때는 버려도 되는 메시지인지 먼저 따진다. 같은 큐를 다른 소비자도 읽어야 한다면, 큐를 나누거나 SNS 팬아웃으로 갈라 받는 편이 안전하다({{ch:sqs/integrations}}). 필터 조건에 민감한 값이 들어가면 고객 관리형 KMS 키로 암호화할 수 있다. 이때 평문으로 보려면 `kms:Decrypt` 권한이 필요하다.

@topic lambda/event-source-mappings/errors

**기본 동작은 "배치 전체 재처리"다.** 함수가 오류를 내면 매핑은 배치 전체를 성공하거나 레코드가 만료될 때까지 다시 보낸다. 스트림에서는 순서를 지키려고 그동안 그 샤드의 처리를 멈춘다. 그래서 처리할 수 없는 레코드 하나가 샤드 전체를 막을 수 있다. 서비스 오류나 스로틀처럼 배치가 함수에 닿지 못한 경우는 재시도 횟수에 세지 않는다.

**부분 배치 응답(partial batch response).** 함수 응답 형식에 `ReportBatchItemFailures`를 켜면, 함수가 실패한 항목 ID만 `batchItemFailures`로 돌려준다. Lambda는 그 항목만(스트림은 실패한 첫 레코드부터) 다시 처리한다. 성공한 레코드를 또 처리하지 않아도 된다.

| 소스 | 실패를 다루는 방법 | 버린 배치 보관 |
|---|---|---|
| SQS | 가시성 제한 시간이 지나면 메시지가 다시 보인다. 부분 배치 응답 지원 | 큐의 리드라이브 정책(DLQ) ({{ch:sqs/integrations}}) |
| Kinesis, DynamoDB Streams | 최대 재시도 횟수(최대 {{fact:kinesis.lambda.retry.max}}), 최대 레코드 나이(최대 {{fact:kinesis.lambda.record-age.max}}), 오류 시 배치 분할(`BisectBatchOnFunctionError`), 부분 배치 응답 | 실패 시 대상(on-failure destination). SQS, SNS, S3 |
| MSK, 자체 관리형 Kafka | 재시도·레코드 나이·배치 분할·부분 배치 응답 설정은 프로비저닝된 모드에서 쓴다 | 실패 시 대상. SQS, SNS, S3, Kafka 토픽 |
| Amazon MQ | 브로커의 재전송 정책을 쓴다(사용자 지정 불가, 최대 {{fact:lambda.esm.mq.max-redeliveries}}). 복구할 수 없는 오류면 그 소비자가 멈춘다 | 브로커 쪽 DLQ |

- 스트림의 재시도·레코드 나이 기본값은 -1(무한)이다. 그대로 두면 막힌 레코드가 만료될 때까지 샤드가 멈춘다. 재시도 상한, 레코드 나이, 배치 분할, 실패 시 대상을 함께 정하는 것이 일반적인 구성이다({{ch:kinesis/consumers}}, {{ch:dynamodb/streams-ttl}}).
- Kafka에서 재시도를 무한으로 두고 실패 시 대상을 설정하면, Lambda가 재시도를 {{fact:lambda.esm.kafka.retry.cap-with-destination}}로 묶는다.
- 실패 시 대상에 쓰는 권한(`sqs:SendMessage`, `sns:Publish`, S3는 `s3:PutObject`·`s3:ListBucket`)은 실행 역할에 둔다. 비동기 호출의 대상과 이름이 같지만 설정 위치(매핑)와 조건(실패 시만)이 다르다({{ch:lambda/async-invocation}}).
- MQ 매핑이 멈췄다면 `StateTransitionReason`을 본다. `EVENT_SOURCE_AUTHN_ERROR`(인증 실패), `EVENT_SOURCE_AUTHZ_ERROR`(권한 부족) 같은 코드가 이유를 알려 준다.

**지연을 보는 지표.** 스트림·DocumentDB는 `IteratorAge`(레코드가 들어온 뒤 함수로 넘어가기까지의 시간), Kafka는 `OffsetLag`(최신 레코드와 처리한 레코드의 오프셋 차이)를 본다. 둘 다 계속 오르면 처리가 들어오는 속도를 못 따라가는 것이다.

@topic lambda/event-source-mappings/provisioned-mode

**프로비저닝된 모드(provisioned mode).** 기본(온디맨드) 모드에서는 Lambda가 폴러 수를 알아서 조절한다. 프로비저닝된 모드에서는 매핑 전용 폴러의 최솟값과 최댓값을 정해 두어, 갑작스러운 폭주에도 지연을 일정하게 유지한다. MSK, 자체 관리형 Kafka, SQS에서 쓸 수 있고 폴러 사용량에 따라 추가 요금이 붙는다.

| 소스 | 폴러 하나의 처리 능력 | 최대 폴러 수 상한 |
|---|---|---|
| MSK, 자체 관리형 Kafka | {{fact:lambda.esm.pm.kafka.poller-capacity}} | {{fact:lambda.esm.pm.kafka.pollers.max}} |
| SQS | {{fact:lambda.esm.pm.sqs.poller-capacity}} | {{fact:lambda.esm.pm.sqs.pollers.max}} |

- 동시성 설정은 함수의 확장을, 프로비저닝된 모드는 매핑의 처리량을 다룬다. 둘을 따로 맞춰야 할 수 있다.
- SQS에서는 프로비저닝된 모드와 매핑의 최대 동시성 설정을 함께 쓸 수 없다. 최대 폴러 수로 동시성을 조절한다.
- 지연을 최소로 하려면 배치 기간을 0으로 둔다.
- VPC 안의 Kafka 클러스터를 읽을 때, 온디맨드 모드는 클러스터 VPC에서 Lambda·STS로 가는 NAT 게이트웨이나 PrivateLink 엔드포인트가 필요하다. 프로비저닝된 모드는 그 연결을 Lambda가 처리한다({{ch:lambda/networking}}).
- 쓰는 폴러 수는 `ProvisionedPollers` 지표로 본다.

**매핑 지표.** 매핑에 지표 설정(`EventSourceMappingMetricsConfig`)을 켜면 SQS, Kinesis, DynamoDB, Kafka 매핑에서 다음 같은 지표를 받는다. 매핑을 끄면 지표도 나오지 않는다.

| 지표 | 뜻 |
|---|---|
| `PolledEventCount` | 소스에서 읽은 이벤트 수. 0이면 폴링이 제대로 되는지 의심한다 |
| `FilteredOutEventCount` | 필터에 걸러진 이벤트 수 |
| `FailedInvokeEventCount` | 호출에 실패한 이벤트 수(권한·네트워크 오류, 함수 삭제 등) |
| `OnFailureDestinationDeliveredEventCount` | 실패 시 대상으로 보낸 이벤트 수 |

최소 한 번 처리라서, 이벤트를 세는 지표에는 같은 이벤트가 두 번 잡힐 수 있다.

@quiz

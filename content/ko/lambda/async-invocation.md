---
chapter: lambda/async-invocation
---

@topic lambda/async-invocation/queue

**비동기 호출(Asynchronous invocation)** 은 호출한 쪽이 함수 결과를 기다리지 않는 방식이다. Amazon S3 이벤트 알림이나 Amazon SNS처럼 많은 AWS 서비스가 함수를 비동기로 부른다. CLI·SDK에서는 `Invoke`의 `InvocationType`을 `Event`로 준다(호출 방식 전체 비교는 {{ch:lambda/invocation}}).

동작 순서는 다음과 같다.

1. Lambda가 이벤트를 함수별 **내부 대기열(event queue)** 에 넣는다.
2. 넣는 데 성공하면 곧바로 성공 응답(HTTP 202)을 돌려준다. 함수 결과는 응답에 들어 있지 않다. 대기열에 넣지 못했을 때만 오류가 돌아온다.
3. 별도 프로세스가 대기열에서 이벤트를 꺼내 함수를 실행한다.

이 대기열 때문에 알아 둘 점이 있다.

- **중복 전달.** 함수가 오류 없이 끝나도 같은 이벤트를 두 번 이상 받을 수 있다. 대기열 자체가 최종적 일관성을 갖기 때문이다.
- **유실 가능성.** 함수가 들어오는 이벤트를 따라가지 못하면 이벤트가 함수에 전달되지 않고 대기열에서 지워질 수도 있다. 대기열이 길면 새 이벤트가 전달되기 전에 최대 보존 기간을 넘겨 버려지기도 한다.
- 그래서 문서는 함수가 중복 이벤트를 문제없이 처리하게 만들고(멱등성), 동시성을 넉넉히 두라고 한다.

@topic lambda/async-invocation/retries-event-age

**재시도 규칙.** 비동기 호출의 재시도는 호출한 서비스가 아니라 Lambda가 한다. 그래서 어느 서비스가 불렀든 규칙이 같다. 오류 종류에 따라 두 갈래로 나뉜다.

| 오류 종류 | Lambda의 처리 |
|---|---|
| 함수 오류: 코드가 던진 오류, 시간 초과 같은 런타임 오류 | 기본 {{fact:lambda.async.retries.max}} 더 실행한다. 첫 시도와 둘째 사이 {{fact:lambda.async.retry.wait.first}}, 둘째와 셋째 사이 {{fact:lambda.async.retry.wait.second}}을 기다린다 |
| 스로틀(429)과 시스템 오류(500번대) | 이벤트를 대기열에 되돌리고 최대 이벤트 보존 기간 동안 계속 다시 시도한다. 간격은 {{fact:lambda.async.throttle-backoff.first}}부터 지수적으로 늘어 최대 {{fact:lambda.async.throttle-backoff.max}}까지 간다 |

대기열이 길어지면 Lambda는 재시도 간격을 늘리고 대기열에서 읽는 속도를 줄인다. 스로틀은 재시도 횟수를 쓰지 않는다는 점에 주의한다. 동시성이 모자라면 이벤트가 몇 시간씩 대기열에 머무를 수 있다({{ch:lambda/concurrency}}).

**오류 처리 설정.** 함수, 버전, 별칭마다 정한다.

| 설정 | 뜻 |
|---|---|
| `MaximumRetryAttempts` (재시도 횟수) | 함수 오류 때 다시 시도할 횟수. 0부터 {{fact:lambda.async.retries.max}}까지 |
| `MaximumEventAgeInSeconds` (이벤트 최대 보존 기간) | 이벤트를 대기열에 두는 최대 시간. {{fact:lambda.async.event-age.min}}부터 {{fact:lambda.async.event-age.max}}까지이고 기본값이 최댓값이다 |

- 이벤트가 최대 보존 기간을 넘거나 모든 재시도에 실패하면 Lambda는 그 이벤트를 버린다. 버린 이벤트를 남기려면 실패 시 대상이나 DLQ를 설정한다.
- 재시도가 무의미한 작업(오래된 데이터는 쓸모가 없는 경우 등)은 재시도를 0으로, 보존 기간을 짧게 둔다.
- CLI `put-function-event-invoke-config`는 기존 설정을 통째로 덮어쓴다. 일부만 바꾸려면 `update-function-event-invoke-config`를 쓴다.

@topic lambda/async-invocation/destinations-dlq

**대상(Destinations).** 비동기 호출이 끝난 뒤 그 **호출 기록(invocation record)** 을 다른 리소스로 보낸다. 성공 시 대상(on-success)과 실패 시 대상(on-failure)을 따로 둘 수 있다. 실패 시 대상은 모든 시도에 실패했거나 최대 보존 기간을 넘었을 때 쓰인다. 함수, 버전, 별칭마다 설정한다.

| 대상 종류 | 실행 역할에 필요한 권한 |
|---|---|
| SQS 표준 큐 | `sqs:SendMessage` |
| SNS 표준 주제 | `sns:Publish` |
| S3 버킷 (실패 시만) | `s3:PutObject`, `s3:ListBucket` |
| Lambda 함수 | `lambda:InvokeFunction` |
| EventBridge 이벤트 버스 | `events:PutEvents` |

- 호출 기록은 JSON이다. 원래 이벤트, 응답(오류 내용), 기록을 보낸 이유(조건), 시도 횟수 같은 정보가 들어 있다.
- FIFO 큐·FIFO 주제는 대상이 될 수 없다. 전달에 실패하면 `DestinationDeliveryFailures` 지표가 나온다(권한, 크기 한도 등).
- SNS는 메시지 크기 한도가 작아, 원래 페이로드가 비동기 페이로드 한도({{fact:lambda.payload.async.max}})에 가까우면 메타데이터가 붙은 호출 기록이 한도를 넘을 수 있다. 큰 페이로드는 SQS나 S3 대상을 쓴다.
- S3 대상 버킷을 지우고 설정을 그대로 두면, 다른 계정이 같은 이름의 버킷을 만들어 기록을 받아 갈 위험이 있다. 실행 역할의 `s3:PutObject`를 내 계정 버킷으로 제한한다.
- Kinesis, DynamoDB Streams, Kafka 이벤트 소스 매핑도 실패 기록을 대상으로 보낼 수 있다. 이것은 비동기 호출이 아니라 매핑 쪽 설정이다({{ch:lambda/event-source-mappings}}).

**배달 못한 편지 대기열(DLQ, dead-letter queue).** 실패 시 대상보다 먼저 있던 방식이다. 쓰이는 때(모든 시도 실패 또는 만료)는 같지만 다른 점이 많다.

| 구분 | 실패 시 대상 | DLQ |
|---|---|---|
| 보내는 내용 | 호출 기록(이벤트 + 응답·오류 정보 + 조건) | 원래 이벤트 그대로. 속성으로 `RequestID`, `ErrorCode`, `ErrorMessage`(앞 {{fact:lambda.dlq.error-message.max}})만 붙는다 |
| 대상 | SQS, SNS, S3, Lambda, EventBridge | SQS 표준 큐, SNS 표준 주제만 |
| 성공 기록 | 성공 시 대상을 따로 둘 수 있다 | 없다 |
| 설정 단위 | 함수, 버전, 별칭 | 함수 단위만. 모든 버전이 `$LATEST`의 DLQ 설정을 쓴다 |
| 전달 실패 | `DestinationDeliveryFailures` 지표 | 이벤트를 지우고 `DeadLetterErrors` 지표 |

- DLQ에 쌓인 이벤트는 그 큐를 함수의 이벤트 소스로 붙이거나 직접 꺼내 다시 처리한다.
- 대상 큐·주제가 고객 관리형 KMS 키로 암호화되어 있으면 실행 역할과 키 정책 양쪽에 권한이 있어야 한다.
- **SQS를 이벤트 소스로 쓰는 함수는 다르다.** 그 경우는 비동기 호출이 아니므로 함수의 DLQ가 아니라 SQS 큐 자체의 DLQ(재드라이브 정책)를 설정한다({{ch:sqs/integrations}}).
- 예약된 동시성을 0으로 두면 새 비동기 이벤트는 재시도 없이 바로 DLQ나 실패 시 대상으로 간다. 함수를 다시 켠 뒤 그곳에서 꺼내 처리해야 한다.

@topic lambda/async-invocation/retry-by-invocation-type

재시도를 누가 하는지는 호출 방식에 따라 다르다. 같은 함수라도 어떻게 불렸느냐에 따라 오류 처리를 따로 설계한다.

| 호출 방식 | 재시도 |
|---|---|
| 직접 동기 호출 | Lambda가 재시도하지 않는다. 호출한 쪽이 다시 부르거나, 대기열로 보내거나, 무시한다 |
| 다른 서비스의 동기 호출 | 그 서비스가 정한다. 예: API Gateway는 Lambda 호출을 재시도하지 않는다. 기본 오류 처리에서는 Lambda가 호출을 거절하면 500, 함수 오류나 잘못된 응답 형식이면 502를 클라이언트에 준다(통합 방식과 사용자 정의 오류 응답에 따라 달라질 수 있다). S3 Batch Operations는 `TemporaryFailure`면 다시 시도한다 |
| 비동기 호출 | 어느 서비스가 불렀든 Lambda가 함수 오류를 {{fact:lambda.async.retries.max}}까지 재시도한다 |
| 이벤트 소스 매핑(스트림) | 배치 전체를 다시 시도한다. 계속 실패하면 오류가 풀리거나 레코드가 만료될 때까지 그 샤드 처리가 막힌다. `IteratorAge` 지표로 감시한다({{ch:kinesis/consumers}}, {{ch:dynamodb/streams-ttl}}) |
| 이벤트 소스 매핑(큐) | 큐의 가시성 제한 시간과 재드라이브 정책이 재시도 간격과 실패 메시지의 행선지를 정한다({{ch:sqs/integrations}}) |

**멱등성(idempotency).** 재시도할 때 함수 코드는 이전 시도에서 끝까지, 일부만, 또는 전혀 실행되지 않았을 수 있다. 비동기 호출은 오류가 없어도 중복 전달이 있다. 그래서 같은 이벤트를 여러 번 처리해도 결과가 한 번 처리한 것과 같도록 만든다. 흔한 방법은 이벤트의 고유 ID(요청 ID, 주문 번호 등)를 DynamoDB 같은 저장소에 조건부 쓰기로 기록하고, 이미 처리한 ID면 건너뛰는 것이다.

@quiz

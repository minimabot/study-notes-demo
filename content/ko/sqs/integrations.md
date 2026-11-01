---
chapter: sqs/integrations
---

@topic sqs/integrations/sns-fanout

SQS 큐 하나에 들어온 메시지는 소비자 한 곳이 받아 처리하고 지운다. 같은 이벤트를 여러 서비스가 각자 처리해야 한다면 **Amazon SNS 주제(topic)** 를 앞에 두고, 서비스마다 큐를 하나씩 만들어 그 주제를 구독시킨다. 주제에 메시지를 게시하면 SNS가 구독한 큐마다 한 부씩 넣어 준다. 이것을 **팬아웃(fan-out)** 이라고 한다.

큐를 서비스마다 따로 두는 이유는 서로의 장애가 번지지 않게 하기 위해서다. 큐마다 쌓이는 속도, 재시도, 데드레터 큐(DLQ)가 따로 있으므로, 한 서비스가 멈춰도 다른 서비스의 큐는 계속 처리된다.

구독할 때 알아 둘 점:

- **큐 정책.** SNS는 HTTPS로 SQS에 메시지를 보낸다. 큐 정책에서 서비스 주체 `sns.amazonaws.com`에 `sqs:SendMessage`를 허용하고, `aws:SourceArn` 조건으로 그 주제만 허용한다. SQS 콘솔의 "Amazon SNS 주제 구독" 기능을 쓰면 이 문을 대신 넣어 준다.
- **문 개수 한도.** 구독 하나가 큐 정책에 문을 하나 더한다. 큐 정책의 문은 {{fact:sqs.policy.max-statements}}까지라서, 이를 넘으면 구독 전달이 실패한다.
- **다른 계정의 주제.** 주제 쪽 정책에서 큐 계정의 `sns:Subscribe`를 허용하고, 큐 쪽 정책에서 그 주제의 `SendMessage`를 허용한다. 양쪽 모두 필요하다.
- **암호화된 큐.** SSE-KMS 큐라면 고객 관리형 키의 키 정책에 SNS를 넣어야 한다({{ch:sqs/security}} 참고).
- **원시 메시지 전송(Raw message delivery).** 기본값에서는 SQS 메시지 본문이 SNS 메타데이터를 담은 JSON 봉투가 된다. 구독 속성 `RawMessageDelivery`를 켜면 SNS 메타데이터를 빼고 게시한 내용 그대로 넣는다.

@topic sqs/integrations/lambda-esm

Lambda 함수를 SQS 소비자로 쓰면 폴링, 삭제, 확장을 Lambda가 대신한다. 이 일을 하는 것이 **이벤트 소스 매핑(Event Source Mapping)** 이다. 이벤트 소스 매핑은 큐를 폴링해 메시지를 배치로 모으고, 함수를 **동기**로 호출한다.

| 함수 결과 | 메시지는 어떻게 되나 |
|---|---|
| 정상 종료 | Lambda가 배치의 메시지를 큐에서 지운다 |
| 오류 | 기본값에서는 배치 전체가 큐에 남고, 가시성 제한 시간이 끝나면 다시 보인다 |

주요 설정:

- **배치 크기(Batch size).** 한 번에 함수로 넘기는 메시지 수의 상한. 기본값 {{fact:lambda.sqs.batch.default}}, Standard 큐는 최대 {{fact:lambda.sqs.batch.max-standard}}, FIFO 큐는 최대 {{fact:lambda.sqs.batch.max-fifo}}다. 배치 전체가 동기 호출 페이로드 한도({{fact:lambda.payload.sync.max}}) 안에 들어가야 하므로, 메시지가 크면 설정보다 적게 올 수 있다.
- **배치 기간(Batch window, `MaximumBatchingWindowInSeconds`).** 함수를 부르기 전에 메시지를 모으는 최대 시간. 기본값 {{fact:lambda.sqs.batch.window.default}}, 최대 {{fact:lambda.sqs.batch.window.max}}다. Standard 큐에만 적용된다. 배치 크기를 {{fact:lambda.sqs.batch.window-threshold}}보다 크게 잡으면 배치 기간을 {{fact:lambda.sqs.batch.window.min-large}} 이상으로 함께 정해야 한다.
- **필터 조건(Filter criteria).** 조건에 맞는 메시지만 함수로 보낸다. SQS에서는 조건에 맞지 않는 메시지를 Lambda가 **큐에서 지운다.** 다른 소비자가 그 메시지를 받아야 한다면 필터 대신 큐를 나눈다.
- **가시성 제한 시간.** 큐의 가시성 제한 시간은 함수 제한 시간보다 길어야 하고, 권장값이 따로 있다. 계산 방법은 {{ch:sqs/visibility-timeout}}에서 다룬다.

권한과 제약:

- 실행 역할에 `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`가 필요하다. AWS 관리형 정책 `AWSLambdaSQSQueueExecutionRole`에 들어 있다. 암호화된 큐라면 `kms:Decrypt`도 더한다.
- 큐와 함수는 같은 리전에 있어야 한다. 계정은 달라도 된다.
- 함수 하나가 큐 여러 개를 읽을 수 있다(큐마다 이벤트 소스 매핑을 만든다). 큐 하나에 함수 여러 개를 붙일 수도 있지만, 메시지 하나는 그중 한 함수만 받는다. 모든 함수가 같은 이벤트를 받아야 한다면 앞의 팬아웃 구조를 쓴다.

@topic sqs/integrations/lambda-errors

**배치 하나에서 한 건만 실패해도 기본값에서는 배치 전체가 다시 처리된다.** 이미 성공한 메시지도 다시 보이므로 같은 일이 여러 번 일어난다.

이를 막는 것이 **부분 배치 응답(partial batch response)** 이다.

1. 이벤트 소스 매핑의 함수 응답 유형에 `ReportBatchItemFailures`를 켠다.
2. 함수는 예외를 밖으로 던지지 않고 메시지마다 잡는다. 실패한 메시지의 ID만 `batchItemFailures` 목록에 `itemIdentifier`로 담아 돌려준다.
3. Lambda는 목록에 없는 메시지를 지우고, 목록에 있는 메시지만 큐에 남긴다.

함정:

- 함수가 예외를 던지면 응답 목록과 상관없이 배치 전체가 실패로 처리된다.
- 응답 JSON이 잘못되었거나, `itemIdentifier`가 비었거나, 배치에 없는 메시지 ID를 넣어도 배치 전체가 실패다. 빈 목록은 전체 성공이다.
- FIFO 큐에서는 첫 실패에서 처리를 멈추고, 실패한 메시지와 아직 처리하지 않은 메시지를 모두 목록에 넣는다. 그래야 순서가 지켜진다.
- 응답이 제대로 동작하는지는 SQS 지표 `NumberOfMessagesDeleted`가 0으로 떨어지지 않는지, `ApproximateAgeOfOldestMessage`가 갑자기 오르지 않는지로 확인한다.

`ReportBatchItemFailures`를 켜면 함수 호출이 실패해도 Lambda가 폴링 속도를 줄이지 않는다. 켜지 않으면 코드 오류가 날 때 Lambda가 이 매핑에 주는 동시성을 점점 줄인다.

**계속 실패하는 메시지는 DLQ로 보낸다.** DLQ는 원본 큐의 재드라이브 정책에 건다. AWS는 Lambda가 읽는 원본 큐의 `maxReceiveCount`를 {{fact:sqs.dlq.lambda-max-receive.recommended}}로 두어 몇 번 재시도할 여유를 주라고 권장한다. 자세한 동작은 {{ch:sqs/dlq}}에서 다룬다. 같은 메시지가 두 번 처리될 수 있으므로 함수는 멱등하게 만든다.

@topic sqs/integrations/lambda-scaling

**기본 모드의 확장.** Standard 큐에 메시지가 생기면 Lambda는 {{fact:lambda.sqs.scaling.initial}}로 시작한다. 메시지가 계속 남아 있으면 {{fact:lambda.sqs.scaling.ramp}}씩 늘리고, 매핑 하나는 동시에 {{fact:lambda.sqs.scaling.max-default}}까지 처리한다. 계정의 동시성 한도도 함께 적용된다. FIFO 큐에서는 동시 호출 수가 메시지 그룹 수를 넘지 않는다.

큐가 빨리 비는 것이 늘 좋은 것은 아니다. 함수 뒤에 연결 수가 정해진 DB나 호출 한도가 있는 외부 API가 있으면, Lambda가 늘어나는 만큼 그쪽이 먼저 무너진다. 동시성을 묶는 방법은 둘이다.

| 설정 | 어디에 거나, 무엇이 일어나나 |
|---|---|
| 최대 동시성(Maximum concurrency) | 이벤트 소스 매핑에 건다. 범위 {{fact:lambda.sqs.max-concurrency.min}}~{{fact:lambda.sqs.max-concurrency.max}}. 이 매핑이 동시에 띄우는 함수 수를 묶는다. 처리하지 못한 메시지는 큐에서 기다린다. 추가 요금이 없다 |
| 예약된 동시성(Reserved concurrency) | 함수에 건다. 함수 전체의 상한이다. 이것만 낮게 걸면 폴러가 가져온 메시지의 호출이 스로틀된다. 스로틀된 메시지는 가시성 제한 시간이 지나면 큐로 돌아가고, 수신 횟수가 쌓이면 DLQ로 갈 수 있다 |

뒤쪽 시스템을 보호하려면 최대 동시성을 쓴다. 둘을 함께 쓸 때는 예약된 동시성을 그 함수에 붙은 모든 SQS 매핑의 최대 동시성 합계 이상으로 둔다. 그렇지 않으면 스로틀이 생긴다. 예약된 동시성을 건다면 {{fact:lambda.sqs.reserved.min-recommended}} 이상으로 둔다. 함수 하나에 큐가 여러 개 붙어 있으면 최대 동시성은 매핑마다 따로 정할 수 있어서, 한 큐가 함수의 동시성을 다 써 버리는 일을 막는다.

**프로비저닝 모드(Provisioned mode).** 지연에 민감한 대량 처리용으로, 매핑 전용 이벤트 폴러의 최소·최대 수를 직접 정한다. 기본 모드보다 빨리 늘어나고, 동시 호출은 {{fact:lambda.sqs.provisioned.max-concurrency}}까지 간다. 별도 요금이 붙는다. 최대 동시성과 함께 쓸 수 없고, 이때는 최대 폴러 수로 동시성을 묶는다.

@topic sqs/integrations/eventbridge

**EventBridge 규칙 → SQS.** Amazon EventBridge 규칙은 AWS 서비스나 애플리케이션의 이벤트 중 조건에 맞는 것을 골라 대상(target)으로 보낸다. Standard 큐와 FIFO 큐 모두 대상이 될 수 있고, 큐에는 JSON 형식의 이벤트가 들어간다. 대상이 바로 처리하지 못할 때 큐를 버퍼로 둔다. 이때도 큐 정책에서 `events.amazonaws.com`의 `SendMessage`를 `aws:SourceArn`으로 그 규칙에만 허용한다.

**EventBridge Pipes: SQS → 대상.** 파이프(Pipe)는 원본 하나와 대상 하나를 잇는 점대점 연결이다. SQS 큐를 원본으로 두고 필터, 보강(enrichment), 변환을 거쳐 Step Functions, API Gateway 같은 대상으로 보낸다. 소비자 코드를 따로 쓰지 않아도 된다.

> **주의:** 파이프가 읽은 메시지는 필터에 맞든 안 맞든 처리 후 큐에서 지워진다. 한 큐를 원본으로 하는 파이프를 여러 개 만들면 메시지가 파이프 사이에 나뉠 뿐, 각 파이프가 모든 메시지를 받지 않는다. 같은 메시지가 여러 곳에 가야 한다면 팬아웃을 쓴다.

| 필요한 것 | 고를 것 |
|---|---|
| 이벤트 하나를 여러 서비스가 각자 처리 | SNS 주제 → 서비스별 SQS 큐 |
| AWS 서비스 이벤트를 골라 큐에 쌓기 | EventBridge 규칙 → SQS |
| 큐 메시지를 코드 없이 다른 서비스로 전달 | EventBridge Pipes (원본: SQS) |
| 큐 메시지를 코드로 처리 | Lambda 이벤트 소스 매핑 |

@quiz

@design

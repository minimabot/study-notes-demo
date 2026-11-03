---
chapter: lambda/invocation
---

@topic lambda/invocation/types

Lambda 함수를 실행하는 것을 **간접 호출(invocation)** 이라고 한다. 이 노트에서는 줄여서 "호출"이라고 쓴다. 호출 방식은 세 가지로 나눠 보면 정리된다.

| 방식 | 동작 |
|---|---|
| 동기식 호출(synchronous) | 호출자가 함수가 끝날 때까지 기다리고, 함수의 응답을 그대로 받는다 |
| 비동기식 호출(asynchronous) | Lambda가 이벤트를 내부 대기열에 넣고 바로 "받았다"고만 답한다. 함수는 나중에 별도 프로세스가 대기열에서 꺼내 실행한다 |
| 이벤트 소스 매핑(event source mapping) | Lambda의 이벤트 폴러(event poller)가 큐·스트림을 읽어 레코드를 배치로 묶은 뒤 함수를 부른다 |

**직접 호출할 때** 는 `Invoke` API의 `InvocationType` 파라미터로 동기와 비동기를 고른다.

- `RequestResponse`: 동기식. 응답 본문에 함수가 돌려준 객체나 오류가 담긴다. Lambda가 함수를 실행했다면 함수가 오류를 냈더라도 상태 코드는 `200`이다. 오류 여부는 응답 내용을 봐야 안다.
- `Event`: 비동기식. 대기열에 넣는 데 성공하면 상태 코드 `202`와 빈 응답이 온다. 대기열에 넣지 못하면 그때 오류가 돌아온다.

직접 호출하는 수단은 콘솔 테스트 이벤트, AWS SDK, AWS CLI(`aws lambda invoke`), `Invoke` API, 함수 URL(HTTP(S) 엔드포인트)이 있다({{ch:lambda/function-urls}}).

**어느 쪽을 고를까.** 호출자가 결과를 바로 써야 하면(API 응답, 로그인 처리) 동기식이다. 결과를 기다릴 필요가 없고 처리 시간을 호출자와 떼어 놓고 싶으면 비동기식이다. 쌓인 메시지나 스트림 레코드를 꾸준히 처리하려면 이벤트 소스 매핑이다.

이벤트 소스 매핑은 트리거와 몇 가지가 다르다.

- 트리거는 이벤트를 내는 서비스가 저장·관리하는 알림 설정이다. 이벤트 소스 매핑은 Lambda 안에서 만들고 관리하는 리소스다.
- 이벤트 소스 매핑은 레코드를 배치로 모아 한 번에 넘긴다. 레코드는 배치 크기(`BatchSize`)와 배치 기간(`MaximumBatchingWindowInSeconds`)에 따라 모인다. 다음 레코드를 넣으면 페이로드 한도({{fact:lambda.payload.sync.max}})를 넘는 경우 그 레코드는 넣지 않으므로, 한도 때문에 배치가 더 일찍 나갈 수 있다. Lambda와 소스가 붙이는 메타데이터도 크기에 들어가서 실제 레코드 수가 설정한 배치 크기보다 적을 수 있다.
- 이벤트 소스 매핑은 각 이벤트를 **최소 한 번** 처리한다. 같은 레코드가 두 번 올 수 있으므로 함수 코드를 멱등(idempotent)하게 만든다.

소스별 설정은 {{ch:lambda/event-source-mappings}}, SQS는 {{ch:sqs/integrations}}, Kinesis는 {{ch:kinesis/consumers}}, DynamoDB Streams는 {{ch:dynamodb/streams-ttl}}에서 다룬다.

@topic lambda/invocation/services

다른 AWS 서비스가 함수를 부를 때 어떤 방식인지는 서비스가 정한다. 개발자 안내서의 표에서 자주 나오는 것을 추리면 다음과 같다.

| 서비스 | 호출 방식 |
|---|---|
| API Gateway, Application Load Balancer | 동기식 |
| Amazon Cognito(사용자 풀 트리거), Amazon Lex, Amazon Data Firehose(변환) | 동기식 |
| S3 Batch Operations, VPC Lattice | 동기식 |
| Amazon S3(이벤트 알림), Amazon SNS | 비동기식 |
| EventBridge 이벤트 버스·규칙, EventBridge Scheduler | 비동기식 |
| CloudWatch Logs(구독 필터), AWS Config, CloudFormation, CodePipeline, AWS IoT, Amazon SES | 비동기식 |
| EventBridge Pipes, AWS Step Functions | 동기식 또는 비동기식 |
| Amazon SQS, Kinesis Data Streams, DynamoDB Streams | 이벤트 소스 매핑 |
| Amazon MQ, Amazon MSK, 자체 관리형 Apache Kafka, DocumentDB | 이벤트 소스 매핑 |

외우는 요령은 이렇다.

- **사람이나 클라이언트가 응답을 기다리는 앞단**(API Gateway, ALB, Cognito, Lex)은 동기식이다.
- **"무슨 일이 일어났다"고 알리는 서비스**(S3, SNS, EventBridge)는 비동기식이다.
- **큐와 스트림**(SQS, Kinesis, DynamoDB Streams, Kafka, MQ)은 Lambda가 읽어 오는 이벤트 소스 매핑이다.

함수에 트리거가 여러 개 있으면 각 트리거는 서로 독립된 호출자처럼 동작한다. 함수가 받는 이벤트 하나에는 한 트리거의 데이터만 들어 있다.

@topic lambda/invocation/limits-throttling

**페이로드 한도.** 호출 방식마다 다르다.

| 구분 | 한도 |
|---|---|
| 동기식 요청 | {{fact:lambda.payload.sync.max}} |
| 동기식 응답 | {{fact:lambda.payload.sync.max}} (응답 스트리밍을 쓰면 {{fact:lambda.streaming.max}}) |
| 비동기식 요청 | {{fact:lambda.payload.async.max}} |
| 이벤트 소스 매핑 배치 | 레코드와 메타데이터를 합쳐 {{fact:lambda.payload.sync.max}} 이하. 넘치면 설정한 배치 크기보다 적게 보낸다 |

비동기 한도는 늘어난 적이 있어 예전 자료에는 더 작은 값이 남아 있다. 현재 할당량 페이지 값({{fact:lambda.payload.async.max}})을 기준으로 삼는다. 다만 SNS의 메시지 크기 한도는 이보다 작다. 그래서 큰 비동기 이벤트의 호출 기록(원래 페이로드 + 메타데이터)은 SNS 대상으로 전달되지 않을 수 있다고 문서가 따로 경고한다({{ch:lambda/async-invocation}}).

**스로틀(throttle).** 함수가 쓸 수 있는 동시성이 바닥나거나 확장 속도를 넘으면 추가 요청은 스로틀 오류(HTTP `429`)를 받는다. 이후 무슨 일이 생기는지는 호출 방식마다 다르다.

| 방식 | 스로틀되면 |
|---|---|
| 동기식 | 오류가 호출자에게 그대로 돌아간다. Lambda 쪽에 쌓아 두는 대기열은 없다. 다시 보낼지는 호출자가 정한다. AWS SDK·CLI는 스로틀을 자동으로 몇 번 재시도한다 |
| 비동기식 | Lambda가 이벤트를 대기열에 되돌려 놓고 간격을 늘려 가며 다시 시도한다. 최대 이벤트 보존 기간(기본 {{fact:lambda.async.event-age.max}}) 안에서 계속한다. 대기열이 길면 이벤트가 함수에 닿기 전에 만료될 수 있다 |
| 이벤트 소스 매핑 | 레코드는 소스에 남아 있고 Lambda가 다시 시도한다. 스트림에서는 배치가 함수에 닿지 못한 스로틀이 재시도 횟수에 세지 않는다. SQS에서는 매핑에 배정하는 동시성을 줄여 가며 재시도하다가, 가시성 제한 시간이 지나면 메시지가 큐에 다시 보인다 |

동기식 요청 수에는 별도 상한도 있다. 계정 동시성, 예약된 동시성처럼 동시성이 걸린 할당량마다 동시성 1당 {{fact:lambda.rps-per-env.sync}}의 초당 요청 한도가 함께 붙는다. 이것은 실행 환경 하나의 처리량 상한이 아니라 할당량 전체에 걸리는 요청 수 한도다. 비동기식은 이런 초당 요청 상한이 없고 동시성만 따진다. 동시성 계산은 {{ch:lambda/concurrency}}에서 다룬다.

@topic lambda/invocation/retries

함수가 실패했을 때 **누가 다시 시도하는가** 가 호출 방식마다 다르다. 시험에서 자주 묻는 대목이다.

| 방식 | 함수 오류 시 재시도 |
|---|---|
| 동기식(직접 호출) | Lambda는 재시도하지 않는다. 호출자가 응답의 오류를 보고 다시 부를지, 큐로 보낼지, 무시할지 정한다 |
| 동기식(서비스가 호출) | 그 서비스가 정한다. 예: API Gateway는 Lambda 호출을 재시도하지 않는다. 기본 오류 처리에서는 Lambda가 호출을 거절하면 500, 함수 오류나 잘못된 응답 형식이면 502를 클라이언트에 준다(통합 방식과 사용자 정의 오류 응답에 따라 달라질 수 있다). S3 Batch Operations는 함수가 `TemporaryFailure`를 돌려주면 재시도한다 |
| 비동기식 | Lambda가 기본 {{fact:lambda.async.retries.max}} 더 시도한다. 그래도 실패하면 버리거나, 설정해 둔 실패 대상(on-failure destination)·배달 못한 편지 대기열(DLQ)로 보낸다 |
| 이벤트 소스 매핑(스트림) | 배치 전체를 성공하거나 레코드가 만료될 때까지 다시 처리한다. 그동안 그 샤드의 처리가 멈춘다. 재시도 횟수와 실패 대상을 설정할 수 있다 |
| 이벤트 소스 매핑(큐) | 큐의 가시성 제한 시간이 재시도 간격을, 큐의 리드라이브 정책(DLQ)이 최종 실패 처리를 정한다 |

비동기식 재시도의 대기 간격, 보존 기간 조정, 대상 설정은 {{ch:lambda/async-invocation}}에서, 스트림의 배치 분할·부분 실패 보고는 {{ch:lambda/event-source-mappings}}에서 다룬다.

**재시도가 있으면 중복이 생긴다.** 실패한 호출이라도 코드가 끝까지, 일부만, 또는 전혀 안 돌았을 수 있다. 비동기 대기열은 결과적 일관성이라 오류가 없어도 같은 이벤트가 두 번 올 수 있다. 이벤트 소스 매핑도 최소 한 번 전달이다. 그래서 문서는 함수를 멱등하게 쓰라고 권한다. 주문 ID 같은 키로 이미 처리했는지 확인하는 방식이 흔하다.

@quiz

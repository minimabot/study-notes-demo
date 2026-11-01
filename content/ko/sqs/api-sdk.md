---
chapter: sqs/api-sdk
---

@topic sqs/api-sdk/access

SQS를 쓰는 길은 네 가지다. 콘솔, AWS CLI, AWS SDK, 그리고 HTTP로 직접 부르는 API다. 실제 애플리케이션은 거의 SDK를 쓴다.

| 방법 | 쓰는 곳 |
|---|---|
| 콘솔 | 큐 만들기, 설정 확인, 손으로 메시지 한두 개 보내 보기 |
| AWS CLI | 스크립트, 실습, 운영 중 점검 |
| AWS SDK | 애플리케이션 코드 (Java, Python, Go, JavaScript, .NET 등) |
| HTTP API 직접 호출 | SDK가 없는 환경. 서명을 직접 만들어야 한다 |

SDK를 쓰면 세 가지를 대신 해 준다.

- **요청 서명.** 자격 증명으로 요청에 암호 서명을 붙인다.
- **재시도.** 일시적인 오류가 나면 다시 보낸다.
- **오류 응답 처리.** 서버 오류를 언어별 예외나 오류 객체로 바꿔 준다.

요청은 리전 엔드포인트로 간다. 서울 리전이면 `sqs.ap-northeast-2.amazonaws.com`이다. 엔드포인트는 리전마다 따로라서, 서로 다른 리전에 같은 이름의 큐가 있어도 데이터를 나누지 않는다. 큐 이름과 큐 URL은 대소문자를 구분한다.

큐를 가리킬 때는 이름이 아니라 **큐 URL**을 쓴다. 이름만 안다면 `GetQueueUrl`로 URL을 먼저 얻는다.

@topic sqs/api-sdk/protocol

SDK와 SQS 서버가 주고받는 형식(전송 프로토콜)은 두 가지다.

| 프로토콜 | 특징 |
|---|---|
| AWS JSON 프로토콜 | 요청과 응답이 JSON이다. 현재 SDK의 기본 |
| AWS query 프로토콜 | 매개변수를 URL 쿼리나 폼으로 보내고 XML로 받는다. 예전 방식 |

AWS JSON 프로토콜은 직렬화·역직렬화가 가볍다. AWS 성능 시험에서는 종단 간 처리 지연이 {{fact:sqs.api.json.latency-reduction}} 줄었고, 클라이언트의 CPU·메모리 사용도 줄었다.

알아 둘 점:

- 새 프로토콜을 쓰려고 코드를 고칠 필요는 없다. **SDK를 일정 버전 이상으로 올리면** 자동으로 AWS JSON 프로토콜을 쓴다. 언어별 최소 버전은 AWS JSON 프로토콜 FAQ 표에 있다.
- AWS query 프로토콜은 계속 지원된다. 더 낮은 SDK 버전을 쓰면 query 프로토콜로 동작한다.
- SDK를 직접 고쳐 쓰거나, XML 응답을 가정하는 자체 클라이언트를 섞어 쓰면 JSON 프로토콜과 맞지 않을 수 있다. SDK를 올린 뒤 이런 도구가 깨지면 이 점부터 본다.

query 프로토콜로 직접 부르는 요청은 대략 이런 모양이다. `Action`이 API 이름이고, `AUTHPARAMS` 자리에 서명 정보가 들어간다.

```
https://sqs.ap-northeast-2.amazonaws.com/123456789012/orders
?Action=SendMessage
&MessageBody=hello
&Version=2012-11-05
&AUTHPARAMS
```

@topic sqs/api-sdk/batch

SQS 요금은 요청 수로 매긴다. 메시지마다 요청을 하나씩 보내면 요청 수가 그대로 메시지 수가 된다. **배치 작업(batch actions)** 은 메시지 여러 개를 요청 하나로 처리한다.

| 단건 API | 배치 API |
|---|---|
| `SendMessage` | `SendMessageBatch` |
| `DeleteMessage` | `DeleteMessageBatch` |
| `ChangeMessageVisibility` | `ChangeMessageVisibilityBatch` |

받기 쪽에는 따로 배치 API가 없다. `ReceiveMessage`의 `MaxNumberOfMessages`로 한 번에 여러 개를 받는다.

규칙:

- 요청 하나에 메시지는 최대 {{fact:sqs.batch.max-messages}}다. `SendMessageBatch`는 메시지 크기의 **합**도 {{fact:sqs.api.batch.max-total-size}}를 넘을 수 없다.
- 항목마다 배치 안에서 겹치지 않는 `Id`를 붙인다. 응답에서 어느 항목이 성공했는지 이 `Id`로 맞춘다.
- **일부만 실패할 수 있다.** 요청 전체는 성공으로 돌아와도 응답의 `Failed` 목록에 실패한 항목이 들어 있을 수 있다. `Failed`를 확인하고 그 항목만 다시 보낸다.
- **권한은 단건 API에 준다.** `SendMessageBatch` 같은 배치 작업에 권한을 따로 줄 수 없다. `sqs:SendMessage`를 허용하면 `SendMessageBatch`도 허용된다. 삭제·가시성 변경도 같다.
- 콘솔은 배치 작업을 지원하지 않는다. CLI나 SDK를 쓴다.

**클라이언트 쪽 버퍼링.** 코드를 크게 바꾸지 않고 배치를 쓰는 방법도 있다. 단건 호출을 SDK가 잠시 모아 두었다가 배치 요청으로 바꿔 보낸다.

- AWS SDK for Java 1.x: `AmazonSQSBufferedAsyncClient`. `AmazonSQSAsyncClient`와 같은 인터페이스라서 바꾸기 쉽다. 긴 폴링과 미리 받기(prefetch)도 한다. **FIFO 큐는 지원하지 않는다.**
- AWS SDK for Java 2.x: `SqsAsyncBatchManager`. `SqsAsyncClient.batchManager()`로 만들고, `sendMessage()`·`deleteMessage()`를 단건과 같은 모양으로 부르면 SDK가 묶어 보낸다.

> **주의:** 미리 받아 둔 메시지도 가시성 제한 시간이 흐른다. 버퍼에 오래 쌓아 두면 처리하기 전에 다시 보여서 중복 처리가 생길 수 있다. 미리 받는 양을 너무 크게 잡지 않는다.

@topic sqs/api-sdk/cli

AWS CLI로 한 바퀴 돌려 보면 API의 모양이 보인다. 아래 숫자는 예시 값이다. 실습 전체 과정은 {{ch:sqs/labs}}에 있다.

```bash
export AWS_REGION=ap-northeast-2

# 큐 URL 얻기
Q_URL=$(aws sqs get-queue-url --queue-name orders --query QueueUrl --output text)

# 보내기
aws sqs send-message --queue-url "$Q_URL" --message-body '{"orderId":"o-1001"}'

# 한 번에 여러 개 보내기 (배치)
aws sqs send-message-batch --queue-url "$Q_URL" --entries '[
  {"Id":"m1","MessageBody":"first"},
  {"Id":"m2","MessageBody":"second"}
]'

# 긴 폴링으로 받기 (최대 10개, 최대 20초 대기)
aws sqs receive-message --queue-url "$Q_URL" \
  --max-number-of-messages 10 --wait-time-seconds 20 \
  --message-system-attribute-names ApproximateReceiveCount

# 처리가 끝난 메시지 지우기 (받을 때 나온 ReceiptHandle 사용)
aws sqs delete-message --queue-url "$Q_URL" --receipt-handle "<ReceiptHandle>"
```

- 지울 때는 메시지 ID가 아니라 **수신 핸들(ReceiptHandle)** 을 쓴다. 수신 핸들은 받을 때마다 새로 나온다.
- `--wait-time-seconds`는 긴 폴링 대기 시간이다. 최댓값은 {{fact:sqs.longpoll.wait.max}}다. 자세한 내용은 {{ch:sqs/polling}}에 있다.
- `send-message-batch`의 결과에는 `Successful`과 `Failed`가 따로 나온다.

@topic sqs/api-sdk/java

이 교재에서 Java 코드는 이 장에만 나온다. AWS SDK for Java 2.x를 쓴다. 다른 언어 SDK도 API 이름과 매개변수는 같다.

의존성(Gradle):

```groovy
implementation platform('software.amazon.awssdk:bom:2.x.x')   // 최신 버전으로 바꾼다
implementation 'software.amazon.awssdk:sqs'
```

보내기 (단건, 배치):

```java
SqsClient sqs = SqsClient.builder().region(Region.AP_NORTHEAST_2).build();
String queueUrl = sqs.getQueueUrl(r -> r.queueName("orders")).queueUrl();

// 단건
sqs.sendMessage(SendMessageRequest.builder()
        .queueUrl(queueUrl)
        .messageBody("{\"orderId\":\"o-1001\"}")
        .messageAttributes(Map.of("eventType", MessageAttributeValue.builder()
                .dataType("String").stringValue("OrderCreated").build()))
        // FIFO 큐라면 .messageGroupId(...)가 필요하다
        .build());

// 배치: Id는 배치 안에서만 겹치지 않으면 된다. 한 번에 최대 10개
List<SendMessageBatchRequestEntry> entries = events.stream()
        .map(e -> SendMessageBatchRequestEntry.builder()
                .id(e.id())
                .messageBody(e.toJson())
                .build())
        .toList();
SendMessageBatchResponse res = sqs.sendMessageBatch(r -> r.queueUrl(queueUrl).entries(entries));
// 요청이 성공해도 일부 항목은 실패할 수 있다
for (BatchResultErrorEntry f : res.failed()) {
    log.warn("send failed id={} code={} senderFault={}", f.id(), f.code(), f.senderFault());
    // 실패한 항목만 다시 보낸다
}
```

받고 지우기 (긴 폴링 + 배치 삭제):

```java
while (running) {
    List<Message> messages = sqs.receiveMessage(ReceiveMessageRequest.builder()
            .queueUrl(queueUrl)
            .maxNumberOfMessages(10)
            .waitTimeSeconds(20)                       // 긴 폴링
            .messageSystemAttributeNames(MessageSystemAttributeName.APPROXIMATE_RECEIVE_COUNT)
            .messageAttributeNames("All")
            .build()).messages();

    List<DeleteMessageBatchRequestEntry> done = new ArrayList<>();
    for (Message m : messages) {
        try {
            handle(m);                                 // 두 번 처리돼도 결과가 같게 만든다
            done.add(DeleteMessageBatchRequestEntry.builder()
                    .id(m.messageId())
                    .receiptHandle(m.receiptHandle())
                    .build());
        } catch (Exception e) {
            // 지우지 않으면 가시성 제한 시간이 끝난 뒤 다시 받는다
            log.error("failed, will be retried", e);
        }
    }
    if (!done.isEmpty()) {
        DeleteMessageBatchResponse del =
                sqs.deleteMessageBatch(r -> r.queueUrl(queueUrl).entries(done));
        del.failed().forEach(f -> log.warn("delete failed id={} code={}", f.id(), f.code()));
    }
}
```

오래 걸리는 작업은 처리하는 동안 가시성 제한 시간을 늘린다(하트비트). 이유와 한도는 {{ch:sqs/visibility-timeout}}에 있다.

```java
sqs.changeMessageVisibility(r -> r.queueUrl(queueUrl)
        .receiptHandle(m.receiptHandle())
        .visibilityTimeout(60));                       // 지금부터 다시 60초 숨긴다
```

자동 배치를 쓰려면 비동기 클라이언트에서 배치 관리자를 만든다. 호출 모양은 단건과 같다.

```java
SqsAsyncClient async = SqsAsyncClient.builder().region(Region.AP_NORTHEAST_2).build();
SqsAsyncBatchManager batch = async.batchManager();
batch.sendMessage(r -> r.queueUrl(queueUrl).messageBody("hello"));   // SDK가 모아서 배치로 보낸다
// 끝낼 때 batch.close()
```

정리:

- `waitTimeSeconds`로 긴 폴링을 켜면 빈 응답과 요청 수가 준다.
- 처리 성공한 메시지만 지운다. 실패한 메시지는 두면 다시 온다. 여러 번 실패하면 {{ch:sqs/dlq}}로 보낸다.
- 배치 응답은 항상 `failed()`를 확인한다.

@quiz

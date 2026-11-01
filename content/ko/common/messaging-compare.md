---
chapter: common/messaging-compare
---

@topic common/messaging-compare/models

AWS에서 "보내는 쪽과 받는 쪽을 떼어 놓는" 서비스는 여럿이다. 겉보기에는 비슷하지만 메시지를 다루는 방식이 서로 다르다. 먼저 네 가지 모델을 구분한다.

| 서비스 | 모델 | 메시지 하나를 누가 받나 |
|---|---|---|
| Amazon SQS | 큐. 소비자가 가져간다(pull) | 소비자 한 곳이 받아 처리하고 지운다 |
| Amazon SNS | 게시/구독(pub/sub). SNS가 밀어 준다(push) | 주제(topic)를 구독한 모든 구독자가 한 부씩 받는다 |
| Amazon EventBridge | 이벤트 버스. 규칙이 골라 대상으로 보낸다 | 이벤트 패턴이 맞는 규칙마다, 그 규칙의 대상 모두가 받는다 |
| Amazon Kinesis Data Streams | 스트림. 순서 있는 기록을 쌓아 두고 읽는다 | 여러 애플리케이션이 같은 기록을 각자 자기 위치에서 읽는다 |

- **SQS**는 일을 쌓아 두는 곳이다. 소비자가 폴링해서 받고, 처리가 끝나면 지운다. 읽은 메시지는 다른 소비자에게 가지 않는다. 자세한 내용은 {{ch:sqs/overview}}에서 다룬다.
- **SNS**는 알리는 곳이다. 게시한 메시지를 SQS 큐, Lambda 함수, HTTP(S) 엔드포인트, 이메일, SMS, 모바일 푸시 같은 구독자에게 나눠 보낸다. 메시지를 쌓아 두지 않는다.
- **EventBridge**는 이벤트를 골라 보내는 곳이다. AWS 서비스, 자체 애플리케이션, SaaS 파트너가 보낸 이벤트를 받아, 규칙(rule)의 이벤트 패턴으로 내용을 보고 대상(target)으로 보낸다. 규칙 하나에는 대상을 {{fact:eventbridge.targets-per-rule.max}}까지 붙일 수 있다.
- **Kinesis Data Streams**는 흐르는 데이터를 담는 곳이다. 데이터 스트림은 샤드(shard)의 묶음이고, 기록(record)은 읽어도 지워지지 않는다. 보존 기간(retention period)이 지나야 사라진다.

**Amazon MQ**는 결이 다르다. Apache ActiveMQ나 RabbitMQ 같은 메시지 브로커를 관리형으로 운영해 주는 서비스다. 이미 표준 메시징 프로토콜(JMS, AMQP 등)로 짠 애플리케이션을 코드를 거의 고치지 않고 옮길 때 쓴다.

@topic common/messaging-compare/ordering

순서와 중복은 서비스와 옵션에 따라 다르다. "순서가 필요하다"면 **어떤 범위의 순서인지**를 먼저 정한다.

| 서비스 | 순서 | 중복 |
|---|---|---|
| SQS 표준 대기열 | 보장하지 않는다 (최선의 순서) | 최소 1회 전송. 드물게 두 번 온다 |
| SQS FIFO 대기열 | 메시지 그룹 안에서 보낸 순서 | 중복 제거 간격 안의 중복을 걸러 낸다 |
| SNS 표준 주제 | 보장하지 않는다 | 소비자가 중복에 대비해야 한다 |
| SNS FIFO 주제 | 메시지 그룹 안에서 게시한 순서 | 중복 제거 간격({{fact:sns.fifo.dedup.interval}}) 안의 중복을 걸러 낸다 |
| EventBridge (규칙 방식) | 보장하지 않는다. 대상에 임의 순서로 간다 | 최소 1회 전송 |
| Kinesis Data Streams | 샤드 안에서 순서대로 읽는다 | 생산자 재시도로 같은 기록이 두 번 들어갈 수 있다 |

- SQS FIFO와 SNS FIFO는 둘 다 **메시지 그룹 ID** 단위로 순서를 지킨다. 그룹끼리는 나란히 처리된다. SQS 쪽 동작은 {{ch:sqs/fifo}}에서 다룬다.
- Kinesis는 **파티션 키(partition key)** 로 기록이 들어갈 샤드를 정한다. 같은 파티션 키는 같은 샤드로 가므로, 주문 ID를 파티션 키로 쓰면 주문별 순서가 지켜진다. 샤드끼리의 순서는 없다.
- 어느 서비스든 소비자 쪽 재시도나 장애로 같은 일이 두 번 처리될 수 있다. 되돌리기 어려운 작업은 멱등하게 만든다.

@topic common/messaging-compare/retention

"지난 메시지를 다시 읽을 수 있는가"는 서비스를 가르는 큰 차이다.

- **SQS**: 메시지는 소비자가 지우거나 보관 기간이 끝날 때까지 남는다. 기본 {{fact:sqs.retention.default}}, 최대 {{fact:sqs.retention.max}}다. 다만 지운 메시지는 다시 읽을 수 없다. 이력 저장소로 쓰면 안 된다.
- **SNS**: 메시지를 쌓아 두지 않고 바로 구독자에게 보낸다. 예외로 **FIFO 주제**는 메시지 아카이브를 켜면 주제 안에 최대 {{fact:sns.archive.retention.max}} 동안 보관하고, 구독자가 정한 시간대의 메시지를 다시 받을(재생, replay) 수 있다.
- **EventBridge**: 이벤트 버스 자체는 이벤트를 쌓아 두지 않는다. 대신 **아카이브(archive)** 를 만들면 이벤트 패턴에 맞는 이벤트를 저장해 두었다가 원래 버스로 다시 보낼(재생) 수 있다. 보관 기간을 정하지 않으면 기한 없이 둔다. 버스에 들어온 이벤트가 아카이브에 닿기까지 지연이 있어서, AWS는 재생을 {{fact:eventbridge.archive.replay-delay.recommended}} 정도 미루라고 권장한다.
- **Kinesis Data Streams**: 기록은 읽어도 남는다. 보존 기간은 기본 {{fact:kinesis.retention.default}}이고 최대 {{fact:kinesis.retention.max}}까지 늘릴 수 있다(기본값보다 길면 추가 요금). 소비자는 보존 기간 안이라면 원하는 위치부터 다시 읽을 수 있다. 소비자가 오래 멈췄다가 돌아올 때를 대비한 안전망이 보존 기간이다.

> **참고:** EventBridge에는 규칙 대신 구독자(subscriber)로 보내는 새 **Custom Event Bus**도 있다. 이 버스는 정한 기간(최대 {{fact:eventbridge.bus-v2.retention.max}}) 동안 이벤트를 보관하고, 순서 있는 전달과 재생을 지원한다. 최근 추가된 기능이라 시험 반영 여부는 알 수 없다. 이 장의 EventBridge 설명은 규칙과 대상으로 라우팅하는 기존 방식(Custom Event Bus - Classic) 기준이다.

@topic common/messaging-compare/throughput

용량을 누가 관리하는지도 다르다.

- **SQS 표준 대기열**은 초당 호출 수가 사실상 무제한이다. FIFO 대기열은 한도가 있고 높은 처리량 모드로 올린다({{ch:sqs/queue-types}}).
- **SNS**는 계정·리전 단위의 게시 한도가 있다. 예를 들어 서울 리전 표준 주제는 기본 {{fact:sns.publish.standard.seoul}}이다(리전마다 다르고 올릴 수 있다). FIFO 주제는 주제당 기본 {{fact:sns.fifo.topic.default-mps}}, 메시지 그룹 하나당 {{fact:sns.fifo.group.max-mps}}이다.
- **EventBridge**도 리전마다 다른 한도가 있다. 서울 리전 기본값은 `PutEvents` 요청 {{fact:eventbridge.putevents.seoul}}, 대상 호출 {{fact:eventbridge.invocations.seoul}}이다. 호출 한도를 넘으면 버려지지 않고 늦게 전달된다.
- **Kinesis Data Streams**는 용량 방식을 고른다.
  - 프로비저닝 모드: 샤드 수를 직접 정한다. 샤드 하나의 쓰기 용량은 {{fact:kinesis.shard.write}}, 읽기 용량은 {{fact:kinesis.shard.read}}다. 스트림 용량은 샤드 용량의 합이다.
  - 온디맨드 모드: 샤드를 Kinesis가 늘리고 줄인다. 쓴 만큼 낸다.

Kinesis에서 소비자를 여럿 붙이면 읽기 용량이 문제가 된다. 공유 처리량 소비자는 샤드의 읽기 용량을 나눠 쓴다. **향상된 팬아웃(enhanced fan-out)** 소비자는 소비자마다 {{fact:kinesis.efo.throughput}}의 전용 처리량을 받고, 폴링하지 않고 데이터를 밀어 받는다. 스트림 하나에 {{fact:kinesis.efo.consumers.max}}까지 등록할 수 있다.

@topic common/messaging-compare/choose

고를 때는 질문 세 개를 차례로 던진다.

1. **이 메시지를 받을 곳이 하나인가, 여럿인가?**
   하나면 SQS다. 여럿이면 SNS, EventBridge, Kinesis 중에서 고른다.
2. **받는 쪽을 무엇으로 고르는가?**
   AWS 서비스 이벤트나 SaaS 이벤트를 내용으로 골라 보내야 하면 EventBridge다. 정해진 구독자 모두에게 빠르게 뿌리면 SNS다. SNS도 구독 필터 정책으로 구독자별로 거를 수 있다.
3. **지난 데이터를 다시 읽거나, 순서대로 대량으로 흘려야 하는가?**
   클릭 기록, 센서 값, 로그처럼 끊임없이 들어오는 데이터를 여러 애플리케이션이 실시간으로 읽고, 필요하면 되돌아가 다시 읽어야 하면 Kinesis Data Streams다.

| 요구 | 고를 것 |
|---|---|
| 작업을 쌓아 두고 작업자가 하나씩 처리. 처리 속도는 작업자에게 맞춘다 | SQS |
| 이벤트 하나를 여러 서비스가 각자 처리 | SNS 주제 → 서비스별 SQS 큐 ({{ch:common/fanout}}) |
| AWS 서비스·SaaS 이벤트를 내용으로 골라 여러 대상에 전달, 다른 계정·리전으로 전달 | EventBridge |
| 실시간 데이터를 여러 애플리케이션이 읽고, 보존 기간 안에서 다시 읽기 | Kinesis Data Streams |
| 기존 JMS·AMQP 애플리케이션을 그대로 옮기기 | Amazon MQ |

이들은 함께 쓰는 일이 많다. 예를 들어 EventBridge 규칙의 대상으로 SQS 큐를 두어 버퍼로 쓰고, SNS 주제 뒤에 큐를 두어 구독자마다 재시도와 DLQ를 따로 둔다. 큐 쪽 연결 방법은 {{ch:sqs/integrations}}에서 다룬다.

@quiz

@design

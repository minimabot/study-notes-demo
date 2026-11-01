---
chapter: common/fanout
---

@topic common/fanout/why

**팬아웃(fan-out)** 은 메시지 하나를 여러 곳에 복제해 보내는 구조다. AWS에서 가장 흔한 형태는 **SNS 주제 하나 → 서비스마다 SQS 큐 하나**다. 주문이 들어오면 주문 서비스는 주제에 한 번만 게시하고, 결제·배송·분석 서비스는 각자 자기 큐에서 같은 주문 메시지를 받아 간다. {{ch:sqs/integrations}}에서 짧게 다룬 내용을 이 장에서 넓힌다.

SNS가 Lambda나 HTTP 엔드포인트로 바로 보내도 되는데 왜 가운데에 큐를 두는가. 이유는 세 가지다.

1. **소비자가 서로 묶이지 않는다.** 생산자는 구독자가 몇인지 모른다. 새 서비스가 생기면 큐를 하나 더 만들어 구독시키면 끝이다. 생산자 코드는 고치지 않는다.
2. **버퍼가 생긴다.** SNS는 메시지를 쌓아 두지 않고 바로 밀어 보낸다. 큐가 받아 두면 소비자는 자기 속도로 꺼내 간다. 소비자가 잠시 멈춰도 메시지는 큐의 보관 기간({{fact:sqs.retention.max}}까지) 동안 남는다.
3. **재시도와 실패 처리가 구독자마다 따로다.** 큐마다 가시성 제한 시간, 최대 수신 횟수, 데드레터 큐(DLQ)를 따로 정한다. 분석 서비스가 고장 나도 결제 큐는 영향을 받지 않는다.

SNS가 큐에 넣는 단계에서 실패할 수도 있다. 큐 정책이 바뀌어 권한이 없어졌거나 큐가 지워진 경우(클라이언트 쪽 오류)는 재시도하지 않는다. 서버 쪽 오류면 SQS·Lambda 구독에 대해 {{fact:sns.retry.aws-managed}} 재시도한다. 끝내 전달하지 못한 메시지는 버려지는데, **구독에 DLQ(SQS 큐)를 걸어 두면** 그 큐에 남는다. 구독 DLQ는 구독과 같은 계정·리전에 있어야 한다.

@topic common/fanout/permissions

SNS가 큐에 메시지를 넣으려면 **큐 정책**이 SNS를 허용해야 한다.

```json
{
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:ap-northeast-2:111122223333:payment-queue",
  "Condition": { "ArnEquals": { "aws:SourceArn": "arn:aws:sns:ap-northeast-2:111122223333:orders" } }
}
```

- **`aws:SourceArn` 조건을 꼭 둔다.** 서비스 주체만 허용하면 다른 주제도 이 큐에 쓸 수 있다(혼동된 대리자 문제, confused deputy). 큐가 여러 주제를 구독하면 주제마다 문을 하나씩 두거나, `aws:SourceAccount`로 계정 단위로 묶는다.
- **문 개수 한도.** SQS 콘솔의 "Amazon SNS 주제 구독"을 쓰면 구독마다 문이 하나씩 더해진다. 큐 정책의 문은 {{fact:sqs.policy.max-statements}}까지다.
- **암호화된 큐.** SSE-KMS 큐라면 고객 관리형 키의 키 정책에서 SNS 서비스 주체에 KMS 권한을 줘야 한다. AWS 관리형 키(`aws/sqs`)로는 정책을 고칠 수 없다. 자세한 내용은 {{ch:sqs/security}}에 있다.

**다른 계정의 큐.** 주제 계정(A)과 큐 계정(B)이 다르면 양쪽 정책이 모두 필요하다.

| 계정 | 정책에 넣을 것 |
|---|---|
| 주제 소유자(A) | 주제 정책에서 B 계정의 `sns:Subscribe`를 허용 |
| 큐 소유자(B) | 큐 정책에서 A의 주제(`aws:SourceArn`)에 `sqs:SendMessage`를 허용 |

구독을 누가 만드느냐에 따라 확인 절차가 다르다. **큐 소유자가 구독을 만들면** 확인 없이 바로 활성화된다. 주제 소유자가 남의 큐를 구독시키면 큐 쪽에서 확인 메시지를 받아 확인해야 한다. AWS는 가능하면 큐 소유자가 구독을 만들라고 권장한다.

**다른 리전의 큐.** SNS는 다른 리전의 SQS 큐로도 보낸다. 구독은 주제가 있는 리전에서 만든다. 어느 한쪽이 옵트인 리전(opt-in Region, 기본으로 켜져 있지 않은 리전)이면 큐 정책의 주체를 `sns.<리전>.amazonaws.com` 형식의 리전별 주체로 바꿔야 한다.

@topic common/fanout/raw-and-filter

**원시 메시지 전송(Raw message delivery).** 기본값에서 큐에 들어가는 본문은 SNS가 감싼 JSON이다. `Type`, `MessageId`, `TopicArn`, `Message`, `Timestamp`, 서명 정보 같은 메타데이터가 붙고, 게시한 내용은 `Message` 칸에 문자열로 들어간다. 소비자는 JSON을 한 번 풀어야 원래 내용을 얻는다.

구독 속성 `RawMessageDelivery`를 `true`로 켜면 메타데이터를 빼고 게시한 내용 그대로 넣는다. 주의할 점:

- 원시 메시지 전송을 켠 SQS 구독에는 메시지 속성을 {{fact:sns.raw.max-attributes}}까지만 보낼 수 있다. 이를 넘는 메시지는 SNS가 버린다.
- FIFO 주제의 시퀀스 번호 같은 SNS 메타데이터도 함께 빠진다.
- 소비자가 "어느 주제에서 왔는지"를 알아야 한다면 켜지 않는다.

**구독 필터 정책(Subscription filter policy).** 기본값에서 구독자는 주제의 모든 메시지를 받는다. 구독에 필터 정책(JSON)을 걸면 조건에 맞는 메시지만 그 구독으로 간다. 필터 정책 범위는 둘 중 하나를 고른다.

| 범위 | 무엇을 비교하나 |
|---|---|
| `MessageAttributes` (기본) | 게시할 때 붙인 메시지 속성 |
| `MessageBody` | 메시지 본문. 본문이 올바른 JSON이어야 한다 |

예를 들어 `{"region": ["kr"], "amount": [{"numeric": [">=", 100000]}]}`처럼 문자열 일치, 숫자 범위, 접두사, `anything-but` 같은 연산자를 쓴다. 정책에 적은 키는 모두 맞아야 하고(AND), 한 키의 값 목록은 그중 하나만 맞으면 된다(OR).

- 필터는 **구독마다** 건다. 거른 메시지는 그 큐에 아예 들어가지 않으므로, 큐 소비자 코드에서 버리는 것보다 요청 수가 준다.
- 필터 정책을 추가하거나 바꾸면 완전히 적용되기까지 {{fact:sns.filter-policy.propagation}}이 걸릴 수 있다. 배포 직후 잠시는 예전 조건으로 걸러질 수 있다.
- 주제 하나에 필터 정책은 기본 {{fact:sns.filter-policies.per-topic}}까지다.

@topic common/fanout/fifo

순서가 중요한 팬아웃은 **SNS FIFO 주제 → SQS FIFO 큐**로 만든다. 주제 이름도 `.fifo`로 끝나야 한다.

- **메시지 그룹 ID**는 게시할 때 반드시 넣는다. SNS FIFO 주제는 같은 그룹 안의 메시지를 게시한 순서대로, 중복 없이 큐에 넣고, 그룹 ID를 구독한 FIFO 큐에 그대로 넘긴다. 그룹끼리는 나란히 전달된다.
- 그룹과 구독 사이에 짝이 없다. 어느 그룹의 메시지든 (필터 정책에 맞으면) 모든 구독 큐로 간다.
- **중복 제거**: 같은 중복 제거 ID로 {{fact:sns.fifo.dedup.interval}} 안에 다시 게시하면 게시는 받아들이지만 전달하지 않는다. 내용 기반 중복 제거를 켜면 ID를 생략할 수 있다.
- **구독자 종류**: FIFO 주제는 SQS 큐만 구독할 수 있다. 이메일, SMS, HTTP(S), 모바일 푸시는 구독할 수 없다. Lambda로 처리하려면 큐를 구독시키고 그 큐를 Lambda가 읽게 한다.
- **표준 큐도 구독할 수 있다.** 순서가 덜 중요한 소비자(예: 분석)는 FIFO 주제에 표준 큐를 붙여 비용을 줄인다. 이 큐에는 그룹 ID가 넘어가지 않고 순서와 중복 제거도 보장되지 않는다.
- **한도**: FIFO 주제의 구독은 기본 {{fact:sns.subscriptions.fifo.max}}다(표준 주제는 {{fact:sns.subscriptions.standard.max}}). 메시지 그룹 하나는 {{fact:sns.fifo.group.max-mps}}까지 전달한다. 처리량을 높이려면 그룹 ID를 많이, 고르게 쓴다. 구독한 SQS FIFO 큐에는 높은 처리량 모드를 켠다({{ch:sqs/fifo}}).

> **주의:** 한 큐의 정책이 잘못되어 전달이 실패하면, 그 큐만 다른 큐와 어긋난다. 다른 큐들은 계속 받는다. 실패한 메시지는 구독에 DLQ가 없으면 버려진다. FIFO 팬아웃에서는 구독마다 DLQ를 거는 것이 특히 중요하다.

FIFO 주제는 **메시지 아카이브와 재생**도 지원한다. 주제 소유자가 아카이브를 켜고 보관 기간(최대 {{fact:sns.archive.retention.max}})을 정하면, 구독자는 구독의 `ReplayPolicy`로 시간대를 골라 지난 메시지를 다시 받을 수 있다. 장애로 놓친 메시지를 복구하거나, 새 환경에 같은 상태를 다시 만들 때 쓴다.

@topic common/fanout/alternatives

팬아웃을 SNS로만 만드는 것은 아니다.

| 방법 | 언제 맞나 |
|---|---|
| SNS 주제 → 여러 SQS 큐 | 애플리케이션 이벤트를 여러 서비스에 빠르게 뿌린다. 구독자가 많다 |
| EventBridge 규칙 → 여러 대상 | AWS 서비스·SaaS 이벤트를 내용으로 골라 보낸다. 다른 계정·리전 버스로 넘긴다 |
| Kinesis Data Streams → 여러 소비자 | 대량의 순서 있는 데이터를 여러 애플리케이션이 각자 읽고, 다시 읽기도 한다 |

- **EventBridge 규칙**은 대상을 {{fact:eventbridge.targets-per-rule.max}}까지 붙인다. 더 많은 곳에 보내려면 규칙을 늘리거나, 대상으로 SNS 주제를 두어 다시 퍼뜨린다. 대상 전달이 실패하면 기본으로 {{fact:eventbridge.retry.default-duration}} 동안 최대 {{fact:eventbridge.retry.default-attempts}} 재시도하고, 대상마다 DLQ(SQS 표준 큐)를 걸 수 있다.
- **다른 계정·리전으로 이벤트 넘기기**는 EventBridge가 쉽다. 받는 쪽 버스의 리소스 정책에서 보내는 계정(또는 조직)을 허용하고, 보내는 쪽 규칙의 대상으로 그 버스를 둔다. 받은 이벤트를 다시 셋째 계정으로 넘기는 연쇄 전달은 되지 않는다.
- **EventBridge Pipes는 팬아웃이 아니다.** 원본 하나와 대상 하나를 잇는 점대점 연결이다. 같은 큐를 원본으로 하는 파이프를 여러 개 만들면 메시지가 나뉠 뿐이다({{ch:sqs/integrations}}). 여러 대상이 필요하면 파이프의 대상을 이벤트 버스로 두고 버스의 규칙으로 퍼뜨린다.
- **큐 하나에 소비자 여럿**은 팬아웃이 아니다. 메시지 하나는 그중 한 소비자만 받는다. 이것은 일을 나눠 처리하는 구조다.

서비스별 특성 비교는 {{ch:common/messaging-compare}}에 있다.

@quiz

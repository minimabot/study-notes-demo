---
chapter: sqs/delay-timers
---

@topic sqs/delay-timers/delay-queue

보낸 메시지를 바로 소비자에게 보여 주지 않고 잠시 묶어 두고 싶을 때가 있다. 예를 들어 주문이 들어온 직후에는 다른 시스템의 기록이 아직 끝나지 않아서, 조금 뒤에 처리해야 맞는 경우다.

**지연 큐(Delay Queue, 한국어 문서: 지연 대기열)** 는 큐 전체에 이 대기 시간을 거는 방법이다. 큐 속성 `DelaySeconds`(콘솔의 전송 지연)를 0보다 크게 두면 그 큐는 지연 큐가 된다. 그 뒤로 큐에 들어오는 모든 메시지는 정한 시간 동안 어떤 소비자에게도 보이지 않는다. 시간이 지나면 보통 메시지처럼 받을 수 있다.

- 기본값이자 최솟값은 {{fact:sqs.delay.default}}다. 즉 따로 정하지 않으면 지연이 없다.
- 최댓값은 {{fact:sqs.delay.max}}다.
- 지연 중인 메시지 수는 `ApproximateNumberOfMessagesDelayed` 지표로 본다. 보이는 메시지 수(`ApproximateNumberOfMessagesVisible`)에는 들어가지 않는다.

@topic sqs/delay-timers/message-timer

**메시지 타이머(Message Timer)** 는 메시지 하나에만 대기 시간을 거는 방법이다. `SendMessage`(또는 `SendMessageBatch`의 각 항목)에 `DelaySeconds`를 넣는다. 값의 범위는 지연 큐와 같다. 가장 작은 값은 {{fact:sqs.delay.default}}, 가장 큰 값은 {{fact:sqs.delay.max}}다. 메시지에 값을 넣지 않으면 큐에 걸린 `DelaySeconds`가 그대로 적용되고, 넣으면 그 메시지만 큐 값 대신 자기 값을 따른다.

| 항목 | 지연 큐 | 메시지 타이머 |
|---|---|---|
| 거는 곳 | 큐 속성 `DelaySeconds` | 보낼 때 메시지마다 `DelaySeconds` |
| 둘 다 있을 때 | 메시지 타이머가 이긴다 | 큐의 값을 덮어쓴다 |
| FIFO 큐 | 쓸 수 있다 | 쓸 수 없다 |

FIFO 큐는 메시지마다 다른 지연을 허용하지 않는다. FIFO 큐에서 지연이 필요하면 큐 단위의 지연 큐 설정만 쓸 수 있다.

> **주의:** 큐의 지연 값을 바꿀 때 큐 종류에 따라 결과가 다르다. Standard 큐에서는 바꾼 값이 **이미 큐에 있는 메시지에는 적용되지 않는다.** FIFO 큐에서는 **이미 큐에 있는 메시지에도 적용된다.** 운영 중인 FIFO 큐의 지연 값을 늘리면 대기 중인 메시지까지 늦어질 수 있다.

@topic sqs/delay-timers/vs-visibility

지연과 가시성 제한 시간은 둘 다 "메시지를 잠시 보이지 않게 한다"는 점이 같다. 다른 것은 **숨기기 시작하는 시점**이다.

| 기능 | 숨기는 시점 |
|---|---|
| 지연 큐·메시지 타이머 | 메시지가 큐에 **처음 들어올 때** |
| 가시성 제한 시간 | 소비자가 메시지를 **받은 뒤** |

메시지 하나의 흐름으로 보면 이렇다. 큐에 들어온다 → (지연 시간 동안 숨김) → 보인다 → 소비자가 받는다 → (가시성 제한 시간 동안 숨김) → 삭제되거나 다시 보인다. 지연은 메시지마다 처음 한 번만 걸린다. 처리에 실패해서 다시 보일 때마다 늦추고 싶다면 그것은 가시성 제한 시간이나 `ChangeMessageVisibility`로 다룬다. 자세한 내용은 {{ch:sqs/visibility-timeout}}에 있다.

@topic sqs/delay-timers/longer-schedules

지연 큐와 메시지 타이머로는 {{fact:sqs.delay.max}}보다 먼 미래를 정할 수 없다. "하루 뒤에 알림 보내기", "매주 월요일에 작업 넣기"처럼 더 길거나 반복되는 일정은 SQS만으로 만들지 않는다.

AWS는 이런 경우 **Amazon EventBridge Scheduler** 를 권한다. EventBridge Scheduler는 정한 시각에 한 번, 또는 반복해서 API 작업을 실행한다. 대상에 SQS 큐를 두면 정한 시각에 메시지를 넣을 수 있다. 메시지 하나하나에 일정을 거는 것도 된다.

정리하면, 짧게 늦추는 것은 SQS의 지연으로, 시각을 정해 두는 예약은 EventBridge Scheduler로 나눈다.

@quiz

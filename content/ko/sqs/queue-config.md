---
chapter: sqs/queue-config
---

@topic sqs/queue-config/core

큐를 만들거나 편집할 때 정하는 값을 한곳에 모았다. 각 값의 자세한 동작은 해당 장에서 다룬다. 이 장은 시험 직전에 보는 표로 쓰면 된다.

| 설정 (API 속성 이름) | 기본값 | 범위 |
|---|---|---|
| 가시성 제한 시간 (`VisibilityTimeout`) | {{fact:sqs.visibility.default}} | {{fact:sqs.visibility.min}} ~ {{fact:sqs.visibility.max}} |
| 메시지 보존 기간 (`MessageRetentionPeriod`) | {{fact:sqs.retention.default}} | {{fact:sqs.retention.min}} ~ {{fact:sqs.retention.max}} |
| 전송 지연 (`DelaySeconds`) | {{fact:sqs.delay.default}} | {{fact:sqs.delay.default}} ~ {{fact:sqs.delay.max}} |
| 최대 메시지 크기 (`MaximumMessageSize`) | {{fact:sqs.message.max-size}} | {{fact:sqs.queue.max-message-size.min}} ~ {{fact:sqs.message.max-size}} |
| 메시지 수신 대기 시간 (`ReceiveMessageWaitTimeSeconds`) | {{fact:sqs.receive-wait.default}} | {{fact:sqs.receive-wait.default}} ~ {{fact:sqs.longpoll.wait.max}} |

표를 읽을 때 알아 둘 점이다.

- **가시성 제한 시간(Visibility Timeout).** 큐에 정한 값은 모든 메시지의 기본값이다. 메시지 하나하나의 값은 콘솔이 아니라 SDK·API(`ChangeMessageVisibility`)로 바꾼다. 자세한 내용은 {{ch:sqs/visibility-timeout}}에 있다.
- **메시지 보존 기간(Message Retention Period).** 이 시간이 지나면 처리되지 않은 메시지도 SQS가 지운다. DLQ의 보존 기간은 원본보다 길게 잡아야 한다는 점은 {{ch:sqs/dlq}}에서 다룬다.
- **전송 지연(Delivery Delay).** 큐에 들어온 메시지를 이 시간 동안 아무에게도 보여 주지 않는다. 큐 전체에 거는 값이다.
- **최대 메시지 크기(Maximum Message Size).** 이 크기를 넘는 메시지는 SQS가 거부한다. 기본값이 곧 SQS가 허용하는 최댓값이므로, 보통은 더 작게 제한하고 싶을 때만 바꾼다. 상한을 넘는 데이터는 S3에 두고 참조만 보내는 방법을 쓴다.
- **메시지 수신 대기 시간(Receive Message Wait Time).** {{fact:sqs.receive-wait.default}}이면 짧은 폴링, 그보다 크면 긴 폴링이다. 요청마다 `WaitTimeSeconds`로 따로 정할 수도 있다.

@topic sqs/queue-config/other

시간·크기 말고도 큐에는 아래 설정이 있다.

| 설정 | 하는 일 |
|---|---|
| 배달 못한 편지 대기열 (리드라이브 정책) | 원본 큐에 건다. 수신 횟수가 `maxReceiveCount`를 넘은 메시지를 DLQ로 옮긴다 |
| 리드라이브 허용 정책 | DLQ 쪽에 건다. 어떤 원본 큐가 이 큐를 DLQ로 쓸 수 있는지 정한다 |
| 암호화 | 서버 측 암호화(SSE). SQS 소유 키(SSE-SQS)와 KMS 키(SSE-KMS) 중 하나만 고른다 |
| 액세스 정책 | 누가 이 큐에 보내고 받을 수 있는지 정하는 리소스 기반 정책 |
| 태그 | 비용 분류와 권한 조건에 쓰는 키-값 쌍 |
| 콘텐츠 기반 중복 제거 (FIFO만) | 메시지 본문의 해시로 중복 제거 ID를 자동으로 만든다. 기본은 꺼져 있다 |
| 높은 처리량 FIFO (FIFO만) | 중복 제거 범위를 메시지 그룹으로, 처리량 한도를 메시지 그룹 단위로 바꿔 처리량을 높인다 |

> **바꿀 수 없는 것:** 큐 종류(Standard / FIFO)는 만든 뒤 바꿀 수 없다. 다른 설정은 편집 화면이나 `SetQueueAttributes`로 바꾼다. 종류를 바꾸려면 새 큐를 만들어 옮긴다.

@topic sqs/queue-config/changes

설정을 바꿔도 곧바로 모든 곳에 적용되지는 않는다.

- 대부분의 속성은 바뀐 값이 SQS 전체에 퍼지는 데 {{fact:sqs.attributes.propagation}}가 걸린다.
- 메시지 보존 기간은 {{fact:sqs.attributes.retention-propagation}}이 걸린다.

> **주의:** 보존 기간을 줄이면 **이미 큐에 있는 메시지에도** 새 값이 적용된다. 새 보존 기간보다 오래된 메시지는 만료되어 지워질 수 있다. 쌓인 메시지가 있는 큐에서 보존 기간을 줄일 때는 먼저 처리하거나 옮겨 둔다.

@topic sqs/queue-config/purge-delete

메시지만 지울지, 큐까지 지울지에 따라 쓰는 기능이 다르다. 둘 다 지운 메시지는 되살릴 수 없다.

| 구분 | 제거 (Purge, `PurgeQueue`) | 대기열 삭제 (`DeleteQueue`) |
|---|---|---|
| 지우는 것 | 큐 안의 모든 메시지. 처리 중(in-flight) 메시지도 포함 | 큐 자체와 그 안의 모든 메시지 |
| 큐 URL·설정 | 그대로 남는다 | 사라진다 |
| 걸리는 시간 | {{fact:sqs.purge.duration}}. 크기와 상관없이 다 기다리라고 안내한다 | {{fact:sqs.delete-queue.duration}} |
| 주의 | 진행 중에 다시 요청하면 `PurgeQueueInProgress` 오류 | 같은 이름으로 다시 만들려면 {{fact:sqs.delete-queue.name-reuse-wait}} 기다린다 |

두 작업 모두 끝나기 전 짧은 시간에는 예상과 다른 일이 생긴다.

- **제거 중:** 제거를 요청하기 전에 보낸 메시지가 잠깐 수신될 수 있지만 곧 지워진다. 요청 뒤에 보낸 메시지도 제거 중이면 함께 지워질 수 있다. 제거가 끝난 뒤에 새 메시지를 보낸다.
- **삭제 중:** 삭제가 끝나기 전에 보낸 `SendMessage`가 성공으로 응답할 수 있다. 하지만 삭제가 끝나면 큐와 그 메시지는 모두 없다.

큐가 비었는지 확인한 뒤 삭제하고 싶다면, 먼저 생산자를 멈춘다. 그다음 `ApproximateNumberOfMessagesVisible`, `ApproximateNumberOfMessagesNotVisible`, `ApproximateNumberOfMessagesDelayed` 세 값이 몇 분 동안 계속 0인지 본다(콘솔 모니터링 탭이나 `GetQueueAttributes`). 긴 폴링으로 빈 응답을 받았다는 것만으로는 확실하지 않다. 수신 대기 시간이 짧으면 메시지가 남아 있어도 빈 응답이 올 수 있다.

@quiz

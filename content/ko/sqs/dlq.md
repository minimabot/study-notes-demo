---
chapter: sqs/dlq
---

@topic sqs/dlq/basics

형식이 깨졌거나 코드 버그에 걸린 메시지는 몇 번을 다시 받아도 처리에 실패한다. 이런 메시지를 독 메시지(poison message)라고 부른다. 큐에 그대로 두면 가시성 제한 시간이 끝날 때마다 다시 나타나 소비자의 시간과 요청 비용을 계속 쓴다. 이런 메시지를 따로 모아 두는 큐가 **배달 못한 편지 대기열(Dead-Letter Queue, DLQ)** 이다.

DLQ는 특별한 종류의 큐가 아니다. 보통 큐를 하나 먼저 만들고, 실패한 메시지를 내보낼 쪽인 **원본 큐(source queue)** 에 그 큐를 연결한다. SQS가 DLQ를 대신 만들어 주지는 않는다.

연결은 원본 큐의 **리드라이브 정책(Redrive Policy)** 으로 한다. 값은 두 개다.

| 항목 | 뜻 |
|---|---|
| `deadLetterTargetArn` | 실패한 메시지를 보낼 DLQ의 ARN |
| `maxReceiveCount` | 삭제되지 않은 채 받을 수 있는 횟수. 수신 횟수가 이 값을 넘으면 DLQ로 옮겨진다 |

`maxReceiveCount`는 {{fact:sqs.dlq.max-receive.min}}부터 {{fact:sqs.dlq.max-receive.max}}까지 정할 수 있다. API로 정책을 넣으면서 값을 빼면 {{fact:sqs.dlq.max-receive.default}}이 된다. 너무 낮으면 일시적인 네트워크 오류 한 번에도 정상 메시지가 DLQ로 간다. AWS는 재시도할 여유가 충분하도록 넉넉히 잡으라고 안내한다.

연결 조건은 세 가지다.

- **같은 계정, 같은 리전.** 다른 계정이나 다른 리전의 큐는 DLQ로 쓸 수 없다.
- **같은 종류.** Standard 큐의 DLQ는 Standard 큐, FIFO 큐의 DLQ는 FIFO 큐여야 한다.
- **DLQ 쪽의 허락.** DLQ에는 **리드라이브 허용 정책(Redrive Allow Policy)** 이 있다. 모든 원본 허용(`allowAll`, 기본값), 지정한 원본만 허용(`byQueue`, 최대 {{fact:sqs.dlq.redrive-allow.byqueue-max}}), 모두 거부(`denyAll`) 중 하나를 고른다.

> **참고:** Standard 큐에 `maxReceiveCount`가 {{fact:sqs.dlq.reorder-receive-threshold}}보다 크게 잡혀 있으면, 삭제되지 않고 {{fact:sqs.dlq.reorder-receive-threshold}} 이상 수신된 메시지를 SQS가 큐 뒤쪽으로 보낸다. 독 메시지가 다른 메시지 앞을 계속 막지 않게 하는 동작이다.

> **FIFO 큐 주의:** FIFO 큐에서 메시지 하나가 계속 실패하면, 그 메시지가 삭제되거나 DLQ로 옮겨질 때까지 같은 메시지 그룹의 다음 메시지가 나오지 않는다. DLQ는 이 막힘을 풀어 준다. 대신 실패한 메시지가 빠지면서 그룹 안의 순서가 깨진다. 순서가 바뀌면 의미가 달라지는 작업(예: 편집 명령 목록)이라면 AWS는 FIFO 큐에 DLQ를 쓰지 말라고 안내한다.

@topic sqs/dlq/retention

DLQ에서 메시지가 언제 사라지는지는 큐 종류에 따라 다르다. 시험에도 실무에도 자주 걸리는 부분이다.

| 큐 종류 | DLQ로 옮겨질 때 | DLQ에서 사라지는 때 |
|---|---|---|
| Standard | 처음 큐에 들어온 시각(enqueue timestamp)을 그대로 가져간다 | 처음 들어온 시각 + DLQ의 보존 기간 |
| FIFO | 들어온 시각이 DLQ로 옮겨진 시각으로 새로 바뀐다 | DLQ로 옮겨진 시각 + DLQ의 보존 기간 |

Standard 큐의 예를 보자. 원본 큐에서 {{raw:1일}}을 보낸 메시지가 DLQ로 옮겨졌고, DLQ의 보존 기간이 {{raw:4일}}이다. 이 메시지는 DLQ에서 {{raw:3일}}만 머물고 사라진다. DLQ 보존 기간이 원본보다 짧거나 같으면, 원본에서 오래 버틴 메시지는 DLQ에 도착하자마자 지워질 수도 있다. 원인을 조사할 시간이 없어진다.

그래서 AWS는 **DLQ의 보존 기간을 원본 큐보다 항상 길게** 두라고 권한다. 보존 기간은 기본 {{fact:sqs.retention.default}}, 최대 {{fact:sqs.retention.max}}이다. 원본 큐가 이미 최댓값이라면 DLQ를 더 길게 잡을 수 없으니 원본 큐의 보존 기간을 줄이는 쪽을 검토한다.

또 하나 헷갈리는 점이 있다. DLQ의 `ApproximateAgeOfOldestMessage` 지표는 처음 보낸 시각이 아니라 DLQ로 옮겨진 시각부터 센다. Standard 큐에서 이 지표만 보고 "아직 여유가 있다"고 판단하면 안 된다.

@sim dlq-retention

@topic sqs/dlq/lambda

Lambda 함수가 SQS 큐를 읽는 구조(이벤트 소스 매핑)에서 처리에 계속 실패하는 메시지를 모으려면, **DLQ를 Lambda 함수가 아니라 원본 SQS 큐에** 붙인다.

- Lambda 함수 설정에도 DLQ와 실패 시 대상(on-failure destination) 항목이 있다. 이것은 **비동기 호출**에서 버려진 이벤트를 받는 자리다. SQS 이벤트 소스 매핑에서 실패한 메시지는 여기로 가지 않는다.
- Lambda는 실패한 배치의 메시지를 지우지 않고 큐로 돌려보낸다. 메시지는 가시성 제한 시간이 끝나면 다시 보이고, 수신 횟수가 원본 큐의 `maxReceiveCount`를 넘으면 SQS가 DLQ로 옮긴다. 즉 DLQ로 보내는 주체는 Lambda가 아니라 SQS다.
- AWS는 이 경우 `maxReceiveCount`를 {{fact:sqs.dlq.lambda-max-receive.recommended}}으로 두라고 권한다. 함수 스로틀이나 일시 오류로 몇 번 실패해도 바로 DLQ로 가지 않게 하는 여유다.

기본 동작에서는 배치 안의 메시지 하나만 실패해도 배치 전체가 큐로 돌아간다. 그러면 이미 처리에 성공한 메시지의 수신 횟수까지 올라가서 엉뚱하게 DLQ로 갈 수 있다. 이벤트 소스 매핑에 `ReportBatchItemFailures`(부분 배치 응답)를 켜고 실패한 메시지 ID만 돌려주면 실패한 메시지만 다시 보인다. 가시성 제한 시간과 Lambda의 관계는 {{ch:sqs/visibility-timeout}}에 있다.

@topic sqs/dlq/redrive

버그를 고쳤다면 DLQ에 쌓인 메시지를 다시 처리해야 한다. 이것이 **DLQ 리드라이브(dead-letter queue redrive)** 다. 콘솔의 "DLQ 리드라이브 시작" 또는 API `StartMessageMoveTask`로 시작하고, `ListMessageMoveTasks`로 진행 상황을 보고, `CancelMessageMoveTask`로 멈춘다.

| 항목 | 내용 |
|---|---|
| 보낼 곳 | 기본은 원래 원본 큐. 같은 종류의 다른 큐(사용자 지정 대상)도 된다 |
| 속도 | 시스템 최적화, 또는 직접 지정(최대 {{fact:sqs.redrive.velocity.max}}) |
| 순서 | DLQ에서 오래된 메시지부터 보낸다. 받는 큐에서는 새로 들어오는 메시지와 섞인다 |
| 보존 기간 | 새 메시지로 취급된다. 새 메시지 ID와 새 들어온 시각을 받으므로 보존 기간이 다시 시작된다 |
| 한도 | 작업 하나는 최대 {{fact:sqs.redrive.task.max-duration}}, 계정당 활성 작업 {{fact:sqs.redrive.tasks.per-account}}, 큐 하나당 동시에 {{fact:sqs.redrive.tasks.per-queue}} |

- **고치지 않고 되돌리면 같은 일이 반복된다.** 리드라이브 중에 메시지를 거르거나 고칠 수 없다. 원인(코드나 메시지 형식)을 먼저 해결한다.
- **천천히 보낸다.** 한꺼번에 돌려보내면 원본 큐의 소비자가 밀린다. AWS는 작은 속도로 시작해 원본 큐 상태를 보며 늘리라고 권한다.
- **취소해도 이미 옮긴 메시지는 받는 큐에 남는다.**

운영에서 자주 만나는 문제는 아래와 같다.

| 증상 | 원인과 대처 |
|---|---|
| DLQ에 메시지가 쌓였는데 아무도 모른다 | DLQ의 `ApproximateNumberOfMessagesVisible`에 CloudWatch 경보를 건다. 자동으로 옮겨진 메시지는 `NumberOfMessagesSent`에 잡히지 않으므로 이 지표로는 알 수 없다 |
| 콘솔에서 메시지를 몇 번 열어 봤더니 DLQ로 갔다 | 콘솔에서 메시지를 보는 것도 수신으로 센다. 운영 중인 큐는 콘솔 열람을 피하거나 `maxReceiveCount`를 늘린다 |
| 리드라이브가 `AccessDenied`로 실패한다 | DLQ에 대한 `sqs:StartMessageMoveTask`·`ReceiveMessage`·`DeleteMessage`·`GetQueueAttributes`, 받는 큐에 대한 `sqs:SendMessage`가 필요하다. 암호화된 큐라면 KMS 권한(`kms:Decrypt`, `kms:GenerateDataKey`)도 필요하다 |
| `CouldNotDetermineMessageSource` | DLQ에 직접 `SendMessage`로 넣었거나 SNS·Lambda가 보낸 메시지라 원본을 알 수 없다. 사용자 지정 대상으로 리드라이브한다 |
| `NonExistentQueue` | 원본 큐가 삭제되었다. 존재하는 큐를 대상으로 지정한다 |

@quiz

@design

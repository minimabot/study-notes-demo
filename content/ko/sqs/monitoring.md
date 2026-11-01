---
chapter: sqs/monitoring
---

@topic sqs/monitoring/metrics

SQS는 큐의 지표(metric)를 Amazon CloudWatch의 `AWS/SQS` 네임스페이스로 자동으로 보낸다. 따로 켤 것이 없고, 지표 요금도 따로 붙지 않는다. Standard 큐와 FIFO 큐 모두 지원한다.

지표는 {{fact:sqs.cw.metric-interval}} 간격으로 들어온다. 다만 큐가 "활성"일 때만 보낸다. 메시지가 있거나 큐를 부르는 요청이 있으면 {{fact:sqs.cw.active-window}} 동안 활성으로 본다. 그보다 오래 아무 일이 없으면 지표 전송이 멈춘다. 그래서 조용한 큐의 그래프에는 0 대신 빈 구간이 생긴다. 다시 활성화되면 지표가 {{fact:sqs.cw.reactivation-delay}} 늦게 나올 수 있다.

SQS는 분산 시스템이라 이름에 `Approximate`가 붙은 지표는 근삿값이다. 운영 판단에는 충분하지만 정확한 개수로 읽으면 안 된다.

자주 보는 지표는 다음과 같다.

| 지표 | 무엇을 알려 주나 |
|---|---|
| `ApproximateNumberOfMessagesVisible` | 지금 받을 수 있는 메시지 수. 쌓인 일(백로그)의 크기 |
| `ApproximateNumberOfMessagesNotVisible` | 받았지만 아직 지우지 않은 처리 중(in-flight) 메시지 수 |
| `ApproximateNumberOfMessagesDelayed` | 지연 때문에 아직 받을 수 없는 메시지 수 |
| `ApproximateAgeOfOldestMessage` | 처리되지 않은 가장 오래된 메시지의 나이(초) |
| `NumberOfEmptyReceives` | 메시지 없이 끝난 `ReceiveMessage` 호출 수 |
| `NumberOfMessagesSent` / `Received` / `Deleted` | 보내기·받기·지우기 활동량 |

읽을 때 주의할 점이 몇 가지 있다.

- **`ApproximateAgeOfOldestMessage`는 독약 메시지를 빼고 센다.** Standard 큐에서 {{fact:sqs.dlq.reorder-receive-threshold}} 이상 받고도 지워지지 않은 메시지는 큐 뒤로 밀린다. 지표는 그다음 메시지의 나이를 보여 준다. FIFO 큐는 순서를 지키느라 이렇게 밀지 않는다. 실패한 메시지가 그 메시지 그룹을 막는다.
- **DLQ로 옮겨지면 나이가 새로 시작된다.** DLQ의 `ApproximateAgeOfOldestMessage`는 처음 보낸 시각이 아니라 옮겨진 시각 기준이다.
- **`NumberOfMessagesSent`는 자동 이동을 세지 않는다.** 최대 수신 횟수를 넘어 DLQ로 옮겨진 메시지는 이 지표에 잡히지 않는다. 그래서 DLQ에서는 보낸 수와 받은 수가 맞지 않을 수 있다.
- **`NumberOfEmptyReceives`가 높으면 폴링을 본다.** 큐가 비었거나, 짧은 폴링을 쓰거나, 소비자가 생산보다 빠를 때 높아진다.
- **`NumberOfMessagesReceived`와 `Deleted`는 고유 메시지 수가 아니다.** 같은 메시지를 여러 번 받거나 지워도 그때마다 센다.

FIFO 큐에는 `ApproximateNumberOfGroupsWithInflightMessages`(처리 중인 메시지가 있는 그룹 수)와 `NumberOfDeduplicatedSentMessages`(중복으로 걸러진 메시지 수)도 있다. 백로그가 큰데 처리 중인 그룹 수가 낮게 머문다면 소비자를 늘리거나 메시지 그룹 수를 늘린다.

@topic sqs/monitoring/alarms-scaling

CloudWatch 경보(alarm)는 지표가 정한 값을 넘은 상태로 정한 기간 동안 머물 때 동작한다. 상태가 바뀌어야 동작하고, Amazon SNS 주제로 알림을 보내거나 Auto Scaling 정책을 실행할 수 있다.

무엇에 경보를 걸지는 알고 싶은 것에 따라 정한다.

| 알고 싶은 것 | 볼 지표 |
|---|---|
| 처리가 늦어지고 있나 | `ApproximateAgeOfOldestMessage` |
| 일이 쌓이고 있나 | `ApproximateNumberOfMessagesVisible` |
| DLQ에 메시지가 들어왔나 | DLQ의 `ApproximateNumberOfMessagesVisible` |
| 소비자가 멈췄나 | `ApproximateNumberOfMessagesNotVisible` |

- **DLQ는 `ApproximateNumberOfMessagesVisible`로 본다.** AWS가 DLQ 감시에 권하는 지표다. `NumberOfMessagesSent`는 자동으로 옮겨진 메시지를 세지 않으므로 DLQ 경보에 맞지 않는다.
- **`ApproximateNumberOfMessagesNotVisible` 경보는 여러 데이터 포인트로 판단한다.** 메시지를 저장하는 서버 하나가 잠시 응답하지 않으면, 빈 큐에서도 이 값이 잠깐 0이 아닐 수 있다. 보통 몇 분 안에 풀린다. 값 하나만 보고 울리게 하면 잘못된 경보가 난다.

**소비자를 큐 깊이에 맞춰 늘리고 줄인다.** EC2 Auto Scaling 그룹이 소비자라면, AWS는 큐 길이 자체가 아니라 **인스턴스당 백로그(backlog per instance)** 를 목표 추적(target tracking) 조정 정책의 지표로 쓰라고 안내한다.

- 인스턴스당 백로그 = 받을 수 있는 메시지 수 ÷ `InService` 상태 인스턴스 수
- 목표값 = 허용할 수 있는 지연 ÷ 메시지 하나의 평균 처리 시간

큐 길이만 목표로 삼으면 인스턴스 수를 고려하지 못한다. 큐가 줄어드는 동안에도 필요 이상으로 인스턴스를 더할 수 있다. 예를 들어 허용 지연이 {{raw:10초}}, 메시지 하나 처리가 {{raw:0.1초}}면 목표값은 인스턴스당 메시지 {{raw:100개}}다. 이 값은 사용자 지정 지표로 올릴 필요 없이 CloudWatch 지표 수학(metric math)으로 계산할 수 있다. AWS도 비용과 수고를 줄이려면 지표 수학을 쓰라고 한다.

소비자가 Lambda라면 이벤트 소스 매핑이 메시지 양에 따라 폴러 수를 스스로 조절한다. 직접 스케일링 정책을 만들 필요가 없다.

스케일링만으로는 부족할 때가 있다. 소비자마다 긴 폴링과 배치 수신·삭제를 쓰면 같은 인스턴스로 더 많이 처리한다. 이 내용은 {{ch:sqs/best-practices}}에 있다.

@topic sqs/monitoring/cloudtrail

AWS CloudTrail은 누가, 언제, 어디서 SQS API를 불렀는지 기록한다. 요청한 주체(루트 사용자, IAM 사용자, 역할, 다른 AWS 서비스)와 IP 주소도 남는다. 지표가 "얼마나"를 알려 준다면 CloudTrail은 "누가 무엇을"을 알려 준다.

SQS 이벤트는 두 종류로 나뉜다.

| 종류 | 예 | 기본 기록 |
|---|---|---|
| 관리 이벤트(management event) | `CreateQueue`, `DeleteQueue`, `SetQueueAttributes`, `PurgeQueue`, `AddPermission` | 켜져 있다 |
| 데이터 이벤트(data event) | `SendMessage`, `ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`, `GetQueueAttributes` | 꺼져 있다 |

- **관리 이벤트는 따로 설정하지 않아도 남는다.** 계정을 만들면 CloudTrail 이벤트 기록(Event history)에서 리전별로 지난 {{fact:cloudtrail.event-history.retention}}의 관리 이벤트를 무료로 볼 수 있다.
- **더 오래 보관하려면 추적(trail)이나 CloudTrail Lake 이벤트 데이터 스토어를 만든다.** 추적은 로그를 S3 버킷으로 보낸다. AWS는 모든 리전의 활동을 담도록 멀티 리전 추적을 권한다.
- **메시지 단위 호출은 데이터 이벤트로 따로 켠다.** 고급 이벤트 선택기(advanced event selector)에 리소스 유형 `AWS::SQS::Queue`를 지정하고, 필요하면 `eventName`으로 `SendMessage`만 고르는 식으로 좁힌다. 데이터 이벤트는 양이 많고 추가 요금이 붙는다. 이벤트 기록 화면에는 나오지 않는다.

이벤트에는 메시지 본문이 그대로 남지 않고 숨겨진다. SQS 문서 기록에 따르면 모든 SQS API가 CloudTrail에 기록되도록 범위가 넓어진 것은 2025-01-10 변경이다. 그보다 앞선 자료는 지금 내용과 다를 수 있다.

@topic sqs/monitoring/troubleshooting

문제가 생기면 증상부터 좁힌다. SQS 문서의 문제 해결 페이지를 바탕으로 자주 만나는 경우를 모았다.

**메시지를 받지 못한다(`ReceiveMessage`가 빈 응답).**

| 확인할 것 | 방법 |
|---|---|
| 큐가 정말 비었나 | `ApproximateNumberOfMessagesVisible`, `NotVisible`, `Delayed`가 몇 분 동안 모두 0이면 빈 큐로 본다 |
| 지연 중인가 | 큐의 `DelaySeconds`와 `ApproximateNumberOfMessagesDelayed`를 본다 |
| 다른 소비자가 처리 중인가 | 가시성 제한 시간 동안 숨겨진다. FIFO 큐에서는 같은 그룹의 다음 메시지도 나오지 않는다 |
| 짧은 폴링인가 | 일부 서버만 보므로 메시지가 있어도 빈 응답이 올 수 있다. 긴 폴링으로 바꾼다 |
| 처리 중 메시지 한도에 닿았나 | 긴 폴링에서 한도({{fact:sqs.inflight.standard.max}})를 넘으면 오류 없이 빈 응답이 온다 |

**FIFO 큐에서 `ThrottlingException`이 난다.** 높은 처리량 모드가 아닌 FIFO 큐는 API 작업별로 {{fact:sqs.fifo.tps.per-partition}}까지 받는다. 넘으면 메시지가 있어도 스로틀된다. 높은 처리량 모드를 켜거나, 배치 작업으로 메시지 처리량을 {{fact:sqs.fifo.batched.msgs-per-sec}}까지 올리거나, 메시지 그룹 ID 종류를 늘린다. 자세한 내용은 {{ch:sqs/fifo}}에 있다.

**API 오류가 난다.**

- `QueueDoesNotExist`: 클라이언트의 리전이 맞는지 본다. 큐가 최근에 지워졌는지는 CloudTrail에서 `DeleteQueue`를 찾아 확인한다. 권한이 없을 때도 같은 오류가 난다.
- `ReceiptHandleIsInvalid` / `InvalidParameterValue`: `DeleteMessage`에 넘긴 영수증 핸들이 틀렸거나(앞의 오류) 만료되었다(뒤의 오류). 넘긴 핸들을 확인한다.
- `AccessDenied`: 큐 정책과 IAM 정책을 함께 본다. SSE가 고객 관리형 KMS 키로 켜져 있으면 KMS 권한도 필요하다. {{ch:sqs/security}}에서 다룬다.

**DLQ 관련.** 콘솔에서 메시지를 보는 것도 수신으로 센다. 콘솔에서 여러 번 열어 보면 그 메시지가 DLQ로 옮겨질 수 있다. 리드라이브 작업이 실패하면 권한을 먼저 본다. 자세한 내용은 {{ch:sqs/dlq}}에 있다.

**메시지 흐름을 따라가려면 AWS X-Ray를 쓴다.** 추적 헤더를 `X-Amzn-Trace-Id` 헤더나 `AWSTraceHeader` 메시지 시스템 속성으로 넘기면, 생산자에서 SQS를 거쳐 소비자까지 이어진 요청을 볼 수 있다. 오류와 지연 데이터를 모으려면 X-Ray SDK로 SQS 클라이언트를 계측한다. X-Ray 콘솔에서는 SQS와 다른 서비스의 연결 지도, 평균 지연, 실패율을 본다.

@quiz

@design

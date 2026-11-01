---
chapter: sqs/security
---

@topic sqs/security/access-policies

SQS에서 권한을 거는 대상은 **큐** 하나뿐이다. 누가 그 큐에 무엇을 할 수 있는지는 두 종류의 정책으로 정한다.

| 정책 | 붙는 곳과 묻는 질문 |
|---|---|
| IAM 정책(자격 증명 기반 정책) | 사용자·역할에 붙는다. "이 역할이 어떤 큐에 무엇을 할 수 있나" |
| 큐 정책(액세스 정책, 리소스 기반 정책) | 큐에 붙는다. "누가 이 큐에 무엇을 할 수 있나" |

기본값은 단순하다. 큐를 만든 계정(큐 소유자)만 메시지를 보내고 받을 수 있다. 같은 계정 안이라면 둘 중 어느 쪽으로 허용해도 대개 결과가 같다.

**다른 계정에서 쓰게 하려면 큐 정책이 꼭 있어야 한다.** 다른 계정의 IAM 정책만으로는 접근할 수 없다. 큐 정책에서 상대 계정의 보안 주체에게 `SendMessage`, `ReceiveMessage` 같은 작업을 직접 허용해야 한다. 상대 계정이 내 계정의 역할을 맡게(AssumeRole) 하는 방법도 있지만, 문서는 이때도 큐 정책에 그 주체를 허용해 두라고 안내한다.

교차 계정으로 아예 줄 수 없는 작업도 있다. `CreateQueue`, `DeleteQueue`, `SetQueueAttributes`, `AddPermission`, `RemovePermission`, `ListQueues`, 태그 작업, 메시지 이동 작업(`StartMessageMoveTask` 등)은 큐를 가진 계정 안의 주체만 할 수 있다.

큐 정책에는 크기 한도가 있다.

- 정책 전체 {{fact:sqs.policy.max-size}}
- 문(statement) {{fact:sqs.policy.max-statements}}, 보안 주체 {{fact:sqs.policy.max-principals}}, 조건 {{fact:sqs.policy.max-conditions}}
- 문 하나당 작업 {{fact:sqs.policy.max-actions-per-statement}}

콘솔에서 큐를 SNS 주제에 구독시키면 큐 정책에 문이 하나씩 붙는다. 구독이 많아지면 문 개수 한도에 먼저 닿는다({{ch:sqs/integrations}} 참고).

@topic sqs/security/least-privilege

AWS 보안 모범 사례 문서가 SQS에 대해 먼저 꼽는 것은 세 가지다.

1. **큐를 공개하지 않는다.** 큐 정책의 `Principal`을 `"*"`나 빈 값으로 두지 않고, 구체적인 계정·역할을 적는다.
2. **역할별로 필요한 작업만 준다.** SQS는 생산자·소비자 구조라서 권한도 셋으로 나누기 쉽다.
   - 관리자: 큐 생성·수정·삭제, 큐 정책 관리
   - 생산자: 메시지 보내기
   - 소비자: 메시지 받기와 삭제 (필요하면 가시성 변경)
3. **자격 증명을 코드나 EC2에 저장하지 않는다.** IAM 역할로 임시 자격 증명을 받는다. Lambda, EC2, ECS 모두 같다.

**AWS 서비스에게 보내기를 허용할 때는 출처를 묶는다.** SNS, S3, EventBridge 같은 서비스가 큐에 보내도록 큐 정책에서 서비스 주체(예: `sns.amazonaws.com`)를 허용할 때, `aws:SourceArn`(또는 `aws:SourceAccount`) 조건으로 "내 이 주제에서 온 요청만"이라고 좁힌다. 이 조건이 없으면 남의 리소스가 그 서비스를 거쳐 내 큐에 쓸 수 있다. 이것을 **혼동된 대리자(confused deputy)** 문제라고 한다.

**태그로 권한을 거는 방법도 있다.** 속성 기반 액세스 제어(ABAC)는 큐 태그와 IAM 주체의 태그가 맞을 때만 허용하는 정책을 쓴다. 큐가 늘어날 때마다 정책을 고치지 않아도 된다. 일부 리전은 아직 지원하지 않는다.

> **주의:** 모든 주체를 거부(Deny)하는 큐 정책을 잘못 걸면 큐 소유자도 큐를 고칠 수 없게 된다. AWS Organizations 회원 계정이라면 관리 계정이 AWS 관리형 정책 `SQSUnlockQueuePolicy`를 쓰는 권한 있는 작업으로 잘못된 정책을 지울 수 있다.

@topic sqs/security/encryption-at-rest

**서버 측 암호화(SSE, Server-Side Encryption)** 는 SQS가 메시지를 받는 즉시 암호화해 저장하고, 권한 있는 소비자에게 줄 때 복호화하는 기능이다. 키를 누가 관리하느냐에 따라 두 가지가 있다.

| 방식 | 특징 |
|---|---|
| SSE-SQS | SQS가 관리하는 키. 키를 만들거나 관리할 일이 없고 추가 요금이 없다. 새 큐의 기본값 |
| SSE-KMS | AWS KMS 키. AWS 관리형 키(`alias/aws/sqs`) 또는 고객 관리형 키. 키 정책으로 통제하고 CloudTrail로 키 사용을 감사한다. KMS 요금이 붙는다 |

**암호화되는 것은 메시지 본문뿐이다.** 큐 이름·속성, 메시지 ID·타임스탬프·메시지 속성, 큐 지표는 암호화되지 않는다. 그래서 민감한 값을 메시지 속성이나 큐 이름, 태그에 넣지 않는다.

알아 둘 동작:

- 암호화를 켠 뒤에 들어온 메시지만 암호화된다. 이미 쌓인 메시지는 그대로다.
- 암호화를 꺼도 이미 암호화된 메시지는 암호화된 채로 남는다.
- 암호화된 큐에서 DLQ로 옮겨진 메시지는 DLQ가 암호화되지 않았어도 암호화된 채로 남는다.
- SSE를 켠 큐에는 익명 요청이 거부되고, 모든 요청이 HTTPS와 서명 버전 4를 써야 한다.

**SSE-KMS의 비용과 데이터 키 재사용 기간.** SQS는 KMS 키로 데이터 키를 암호화해 메시지와 함께 저장한다(봉투 암호화). 데이터 키를 매번 새로 받지 않고 일정 시간 재사용하는데, 이 시간이 **데이터 키 재사용 기간**이다. 기본값은 {{fact:sqs.sse.key-reuse.default}}, 범위는 {{fact:sqs.sse.key-reuse.min}}~{{fact:sqs.sse.key-reuse.max}}다. 짧게 잡으면 보안은 나아지지만 KMS 호출과 요금이 늘어난다. 데이터 키는 보안 주체마다 따로 쓰므로, 보내고 받는 주체가 많을수록 KMS 호출도 늘어난다.

**SSE-KMS 큐를 쓰는 쪽에 필요한 KMS 권한.**

- 소비자: `ReceiveMessage`를 하려면 그 키에 대한 `kms:Decrypt`가 필요하다. DLQ에서 받는다면 원본 큐의 키에 대한 `kms:Decrypt`도 필요하다.
- 생산자: 문서 기록(Document history)에는 2024년 7월부터 `SendMessage`에 `kms:Decrypt`가 더 이상 필요 없고 {{fact:sqs.sse.producer-kms-actions}}만 있으면 된다고 적혀 있다. 그런데 키 관리 페이지는 아직 생산자에게 두 권한을 모두 주라고 안내한다. 두 문서가 다르므로 운영에서는 두 권한을 다 주는 쪽이 안전하다.

**AWS 서비스가 암호화된 큐에 보낼 때는 고객 관리형 키가 필요하다.** SNS, S3 이벤트 알림, EventBridge가 SSE-KMS 큐에 메시지를 넣으려면 그 서비스 주체가 `kms:GenerateDataKey`와 `kms:Decrypt`를 쓸 수 있어야 한다. AWS 관리형 키의 키 정책은 고칠 수 없으므로, 고객 관리형 키를 만들어 키 정책에 서비스 주체를 추가한다. 같은 이유로, AWS 관리형 키로 암호화한 큐는 다른 계정의 Lambda 함수를 호출할 수 없다.

KMS 키를 바꿔도 이전 키로 암호화된 메시지는 이전 키가 있어야 읽힌다. 남은 메시지를 모두 처리하기 전에는 이전 키를 지우거나 끄지 않는다.

@topic sqs/security/transit-network

**전송 중 암호화.** SQS API를 부르는 클라이언트는 {{fact:sqs.tls.min-version}} 이상과 PFS 암호 스위트를 지원해야 한다. AWS는 TLS 1.3을 권장한다. 문제는 HTTP 엔드포인트로도 요청이 들어올 수 있다는 점이다. 큐 정책에 `aws:SecureTransport`가 `false`인 요청을 거부(Deny)하는 문을 넣어 TLS만 쓰게 강제한다.

**인터넷을 거치지 않는 경로: 인터페이스 VPC 엔드포인트.** VPC 안의 EC2나 Lambda가 SQS를 부를 때 인터넷 게이트웨이, NAT, VPN 없이 연결하려면 **인터페이스 VPC 엔드포인트(AWS PrivateLink)** 를 만든다. 몇 가지 조건이 있다.

- HTTPS 엔드포인트에서만 쓸 수 있다.
- 프라이빗 DNS를 켜고 `sqs.<리전>.amazonaws.com` 형식의 엔드포인트를 쓴다. `queue.amazonaws.com` 같은 예전 엔드포인트는 프라이빗 DNS가 지원하지 않는다.
- FIPS 엔드포인트도 PrivateLink로 쓸 수 있다.

통제는 양쪽에서 건다.

| 어디에 | 무엇을 정하나 |
|---|---|
| VPC 엔드포인트 정책 | 이 엔드포인트를 지나는 요청 중 어떤 주체·작업·큐를 허용할지 |
| 큐 정책의 `aws:sourceVpce`·`aws:SourceVpc` 조건 | 이 큐를 어떤 엔드포인트·VPC를 거친 요청만 쓸 수 있게 할지 |

엔드포인트 정책만으로는 부족하다. 같은 사용자가 VPC 밖에서 다른 경로로 큐를 부를 수 있기 때문이다. 큐를 VPC 안에서만 쓰게 하려면 큐 정책에 "이 엔드포인트가 아니면 거부" 문을 넣는다.

> **주의:** 큐 정책에서 `sqs:*` 전체를 특정 엔드포인트로만 묶으면, 큐 정책을 고치는 관리 작업도 그 엔드포인트를 거쳐야 한다. 나중에 정책을 고치지 못할 수 있으니 메시지 작업(`SendMessage`, `ReceiveMessage` 등)만 묶는 편이 낫다. DLQ 재드라이브처럼 AWS 서비스가 대신 호출하는 기능을 쓰면 VPC 조건에 예외를 두어야 한다({{ch:sqs/dlq}} 참고).

@quiz

---
chapter: dynamodb/security
---

@topic dynamodb/security/shared-iam

DynamoDB 보안도 **공동 책임 모델(Shared responsibility model)** 을 따른다. 서비스를 돌리는 인프라는 AWS가 지킨다. 누가 어떤 데이터에 접근하는지, 데이터를 어떤 키로 암호화하는지, 어떤 네트워크로 접속하는지는 고객이 정한다.

**인증은 IAM 역할로.** DynamoDB API 요청에는 IAM 주체의 자격 증명으로 서명해야 한다. AWS는 액세스 키를 애플리케이션이나 EC2 인스턴스에 직접 저장하지 말고, IAM 역할로 임시 자격 증명을 받으라고 권장한다. 장기 자격 증명은 자동으로 교체되지 않아 유출되면 피해가 크다.

**권한은 최소 권한(Least privilege)으로.** 누구에게, 어떤 테이블·인덱스에, 어떤 작업을 허용할지 좁혀서 준다. 정책을 붙이는 방식은 두 가지다.

| 방식 | 붙이는 곳 |
|---|---|
| 자격 증명 기반 정책(Identity-based policy) | IAM 사용자·그룹·역할. AWS 관리형 정책이나 직접 만든 고객 관리형 정책 |
| 리소스 기반 정책(Resource-based policy) | 테이블, 인덱스, 스트림 자체 |

**리소스 기반 정책.** 테이블에 붙인 정책은 그 테이블과 인덱스에 대한 접근을 정한다. 크기는 {{fact:dynamodb.rbp.max-size}}까지다. 가장 큰 쓰임새는 **교차 계정 접근**이다. 다른 계정의 역할에 역할 위임 없이 테이블 접근을 줄 수 있다. IAM Access Analyzer가 외부 접근을 보고하고, 퍼블릭 액세스 차단(Block Public Access)이 정책 작성 과정에서 자동으로 켜져 공개 접근을 막는다.

**속성 기반 액세스 제어(ABAC, Attribute-based access control).** 태그로 권한을 준다. 예를 들어 `aws:ResourceTag/environment`가 `staging`인 테이블만 수정하게 할 수 있다. 새 테이블이나 새 사용자가 생겨도 태그만 맞추면 되므로 정책 수가 줄어든다. 다만 복원한 테이블에는 태그가 따라오지 않으므로 복원 뒤 태그를 다시 붙여야 한다.

@topic dynamodb/security/fgac

**세분화된 액세스 제어(Fine-grained access control).** IAM 정책의 `Condition` 요소에 DynamoDB 조건 키를 넣어 테이블 안의 **항목**과 **속성**까지 접근을 제한한다.

| 조건 키 | 제한하는 것 |
|---|---|
| `dynamodb:LeadingKeys` | 파티션 키 값. 사용자 ID와 같은 항목만 허용하는 식이다 |
| `dynamodb:Attributes` | 요청이 다루는 최상위 속성 목록 |
| `dynamodb:Select` | `Select` 파라미터. `SPECIFIC_ATTRIBUTES`만 허용해 "모든 속성" 요청을 막는다 |
| `dynamodb:ReturnValues` | 쓰기 뒤 돌려받는 값. `ALL_OLD`, `ALL_NEW`를 막는다 |

**항목 단위 제한의 전형.** 사용자 데이터를 한 테이블에 모으고 파티션 키를 사용자 ID로 둔다. 정책에서 `dynamodb:LeadingKeys`를 사용자 ID 정책 변수(예: 웹 자격 증명 연동의 `${www.amazon.com:user_id}`)와 같게 건다. 그러면 사용자는 자기 파티션의 항목만 읽고 쓴다.

알아 둘 규칙이 있다.

- `LeadingKeys`는 이름이 복수형이고, 반드시 `ForAllValues` 한정자와 함께 쓴다.
- 허용 작업에 `Scan`을 넣지 않는다. `Scan`은 파티션 키와 상관없이 모든 항목을 읽는다.
- 속성 제한은 **요청에 적힌 속성만** 검사한다. `ProjectionExpression`이 없는 읽기는 모든 속성을 돌려준다. 그래서 `dynamodb:Attributes`와 함께 `dynamodb:Select`, `dynamodb:ReturnValues`도 제한한다.
- `dynamodb:Attributes`를 쓰면 테이블과 인덱스의 키 속성 이름을 모두 목록에 넣어야 한다.
- AWS는 거부(Deny) 기반으로 거꾸로 쓰는 정책을 피하고 허용(Allow) 기반으로 쓰라고 권장한다. 거부 기반은 바르게 쓰기 어렵고, API가 바뀌면 무력해질 수 있다.

> **주의:** 이 제한은 DAX를 거치는 경로에는 적용되지 않는다. DAX에서는 클러스터 서비스 역할의 권한이 쓰인다({{ch:dynamodb/dax}}). 또 글로벌 테이블 복제에 쓰는 서비스 연결 역할에 이런 조건을 걸면 복제가 끊길 수 있다.

@topic dynamodb/security/encryption

**저장 시 암호화(Encryption at rest)는 늘 켜져 있다.** 테이블의 모든 사용자 데이터가 AWS KMS 키로 암호화된다. 기본 키, 로컬·글로벌 보조 인덱스, 스트림, 글로벌 테이블, 백업이 모두 포함된다. 끌 수 없다. 고를 수 있는 것은 키의 종류다.

| 키 | 특징 |
|---|---|
| AWS 소유 키(AWS owned key) | 기본값. 계정에 저장되지 않고 DynamoDB가 소유한다. 추가 요금이 없다. 키를 보거나 사용 기록을 감사할 수 없다 |
| AWS 관리형 키(AWS managed key) | 계정에 저장되는 `aws/dynamodb` 키. 키 정책을 보고 CloudTrail로 사용을 감사할 수 있지만, 권한을 바꾸지는 못한다. KMS 요금이 든다 |
| 고객 관리형 키(Customer managed key) | 계정에서 직접 만들고 소유·관리한다. 키 정책, 활성화·비활성화, 교체를 직접 정한다. KMS 요금이 든다 |

키 종류는 테이블을 만들 때 고르고, 기존 테이블에서도 언제든 바꿀 수 있다. 데이터는 투명하게 복호화되므로 애플리케이션 코드를 바꿀 필요가 없다.

**언제 고객 관리형 키인가.** 키 정책으로 누가 키를 쓸지 직접 정해야 하거나, 키를 직접 교체·비활성화할 수 있어야 한다는 요구가 있으면 고객 관리형 키를 쓴다. 키 사용 감사만 필요하면 AWS 관리형 키로도 된다. 그런 요구가 없으면 기본인 AWS 소유 키로 충분하다.

> **주의:** 고객 관리형 키를 비활성화하거나 삭제 예약하면 DynamoDB도 데이터를 복호화하지 못한다. 테이블은 접근 불가(Inaccessible) 상태가 된다. {{fact:dynamodb.cmk.inaccessible-grace}} 안에 키 접근을 되돌리지 않으면 테이블이 보관(archive) 처리되고, DynamoDB가 만든 백업에서 새 테이블로 복원해야 한다.

**전송 중 암호화.** DynamoDB API는 HTTPS로만 접속한다. 클라이언트는 {{fact:dynamodb.tls.min-version}} 이상을 지원해야 하고, AWS는 TLS 1.3을 권장한다. 완전 순방향 비밀성(PFS)을 지원하는 암호 모음도 필요하다.

**클라이언트 측 암호화.** 민감한 데이터는 DynamoDB에 보내기 전에 애플리케이션에서 암호화하는 방법도 있다. AWS Database Encryption SDK가 항목 속성을 암호화하고 서명한다. 어떤 속성을 암호화할지 직접 고른다. 파티션 키·정렬 키 값은 CloudTrail 같은 로그에 나타날 수 있으므로 민감한 평문을 키에 넣지 않는다. 테이블 이름 같은 이름 칸에도 고객 번호 같은 정보를 넣지 않는다.

@topic dynamodb/security/network

기본적으로 VPC 안의 EC2는 인터넷 게이트웨이나 NAT를 거쳐 DynamoDB 퍼블릭 엔드포인트에 접속한다. **VPC 엔드포인트(VPC endpoint)** 를 두면 퍼블릭 인터넷에 나가지 않고 AWS 네트워크 안에서 접속한다. 인스턴스에 퍼블릭 IP도, 인터넷 게이트웨이도, NAT도 필요 없다. 엔드포인트는 두 종류다.

| 항목 | 게이트웨이 엔드포인트(Gateway endpoint) | 인터페이스 엔드포인트(Interface endpoint, AWS PrivateLink) |
|---|---|---|
| 동작 | 라우팅 테이블에 경로를 추가한다. DynamoDB 퍼블릭 IP를 쓴다 | 서브넷에 ENI를 만들고 VPC의 프라이빗 IP를 쓴다 |
| 온프레미스·다른 리전에서 | 쓸 수 없다 | VPN, Direct Connect, VPC 피어링, Transit Gateway로 쓸 수 있다 |
| 요금 | 없다 | 있다 |

두 종류를 한 VPC에 함께 둘 수 있다. VPC 안에서만 접속하면 무료인 게이트웨이 엔드포인트로 충분하다. 온프레미스에서 프라이빗하게 접속해야 하면 인터페이스 엔드포인트를 쓴다. 게이트웨이 엔드포인트는 기존 리전 엔드포인트 이름을 그대로 쓰므로 앱을 고치지 않아도 되고, 인터페이스 엔드포인트는 클라이언트가 VPC 엔드포인트 전용 URL을 쓰도록 설정한다. 인터페이스 엔드포인트 하나는 {{fact:dynamodb.privatelink.max-rps}}까지 받는다.

**엔드포인트로만 접근하게 묶기.** 두 가지를 함께 쓴다.

- **VPC 엔드포인트 정책(Endpoint policy).** 엔드포인트를 지나는 요청이 어떤 테이블에 어떤 작업을 할 수 있는지 제한한다.
- **`aws:sourceVpce` 조건.** 사용자·그룹·역할에 붙인 IAM 정책에 걸어, 지정한 VPC 엔드포인트를 거친 요청만 허용한다.

@topic dynamodb/security/protect

**삭제 방지(Deletion protection).** 테이블 속성 하나로 관리자 실수로 테이블이 지워지는 것을 막는다. 켜져 있으면 권한이 있는 사람도 테이블을 지울 수 없다. 기본값은 꺼짐이며, 글로벌 테이블 복제본과 백업에서 복원한 테이블도 꺼진 상태로 생긴다. `CreateTable`이나 `UpdateTable`, 콘솔, CloudFormation으로 켠다. 백업과 PITR은 {{ch:dynamodb/backup-restore}}에서 다뤘다.

**보안 모범 사례 요약.** AWS가 예방 차원에서 권장하는 것들이다.

1. IAM 역할의 임시 자격 증명으로 접근한다.
2. 최소 권한 정책을 쓰고, 필요하면 조건 키로 항목·속성까지 좁힌다.
3. VPC 안에서만 쓰면 VPC 엔드포인트와 엔드포인트 정책으로 접근 경로를 제한한다.
4. 민감한 데이터는 클라이언트 측 암호화를 검토한다.
5. 기본 키 이름과 값, 테이블 이름에 민감한 정보를 넣지 않는다.

탐지 쪽으로는 CloudTrail로 테이블 관리 작업(제어 영역)과 항목 읽기·쓰기(데이터 영역) 호출을 기록한다.

@quiz

@design

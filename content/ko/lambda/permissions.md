---
chapter: lambda/permissions
---

@topic lambda/permissions/execution-role

Lambda 권한은 두 방향으로 나뉜다({{ch:lambda/overview}}). 이 장은 그 둘과, 함수를 만들고 고치는 사람의 권한을 차례로 본다.

| 무엇을 허용하나 | 어디에 둔다 |
|---|---|
| 함수가 다른 AWS 리소스를 쓰기 | 실행 역할(execution role)의 권한 정책 |
| 다른 서비스·계정이 함수를 부르기 | 함수의 리소스 기반 정책(resource-based policy) |
| 사람·CI가 함수를 만들고 설정하기 | 그 IAM 주체의 자격 증명 기반 정책(identity-based policy) |

**실행 역할.** 함수가 AWS API를 부를 때 쓰는 IAM 역할이다. 모든 함수에 하나씩 반드시 있다. 역할 일반은 {{ch:iam/roles}}에서 다뤘다.

- **신뢰 정책** 에 Lambda 서비스 주체 `lambda.amazonaws.com`이 `sts:AssumeRole`을 할 수 있게 적는다. 이것이 빠지면 Lambda가 역할을 수임하지 못한다.
- 호출 때 Lambda가 역할을 자동으로 수임하고, 임시 자격 증명을 환경 변수로 넣는다. SDK는 이것을 알아서 찾는다. 코드에서 같은 역할로 `sts:AssumeRole`을 다시 부르지 않는다.
- 최소한 CloudWatch Logs에 로그를 쓸 권한이 있어야 한다. AWS 관리형 정책 **`AWSLambdaBasicExecutionRole`** 이 그 권한이다. 콘솔에서 함수를 만들면 이 정책만 붙은 기본 역할이 생긴다.
- **이벤트 소스 매핑은 실행 역할로 소스를 읽는다.** SQS·Kinesis·DynamoDB Streams·MSK를 읽는 권한은 함수 정책이 아니라 실행 역할에 둔다(`AWSLambdaSQSQueueExecutionRole` 등, {{ch:lambda/event-source-mappings}}). VPC 연결에 필요한 ENI 권한(`AWSLambdaVPCAccessExecutionRole`)도 실행 역할에 둔다({{ch:lambda/networking}}).
- 관리형 정책은 출발점이다. 문서는 운영에 내보내기 전에 꼭 필요한 권한만 남기라고 권한다. IAM Access Analyzer가 CloudTrail 기록을 보고 실제로 쓴 권한만 담은 정책 초안을 만들어 준다.

**`lambda:SourceFunctionArn` 조건 키.** 함수 코드 안에서 나간 요청에는 그 함수의 ARN이 자격 증명 맥락에 실린다. 이 키를 자격 증명 기반 정책이나 SCP에 쓰면 "이 함수 코드에서 온 요청만"으로 좁힐 수 있다. 같은 역할을 다른 곳에서 써도 막힌다.

- 리소스 기반 정책에는 쓸 수 없다.
- 버전·별칭 ARN이 아니라 버전 없는 함수 ARN을 쓴다.
- Lambda가 실행 환경 밖에서 하는 호출(이벤트 소스 매핑의 폴링, VPC ENI 생성, 환경 변수 KMS 복호화)에는 실리지 않는다.

@topic lambda/permissions/resource-based

**리소스 기반 정책** 은 함수(또는 버전·별칭)에 붙는 정책이다. 누가(Principal) 어떤 동작(대개 `lambda:InvokeFunction`)을 할 수 있는지 적는다. 콘솔에서 트리거를 추가하면 이 정책에 문장이 자동으로 들어간다. 크기 한도는 {{fact:lambda.resource-policy.max-size}}다.

**AWS 서비스가 부를 때.** S3, SNS, EventBridge, API Gateway 같은 서비스가 함수를 부를 때 Lambda는 **리소스 기반 정책만** 본다. Principal에 서비스 주체(`s3.amazonaws.com` 등)를 쓰고, 조건으로 범위를 좁힌다.

- `aws:SourceArn`: 어느 리소스(버킷, 토픽, API)가 부를 수 있는지 정한다.
- `aws:SourceAccount`: 그 리소스가 어느 계정 소유여야 하는지 정한다. **S3는 버킷 ARN에 계정 ID가 없다.** 버킷을 지운 뒤 다른 계정이 같은 이름으로 만들 수 있으므로, S3에는 `aws:SourceAccount`를 함께 쓴다.
- 서비스 주체만 적고 조건을 빼면 그 서비스를 쓰는 **어느 계정의 리소스든** 함수를 부를 수 있게 된다(혼동된 대리자 문제, {{ch:iam/with-services}}).

**다른 계정이 부를 때.** Principal에 계정(`arn:aws:iam::111122223333:root`)이나 특정 역할 ARN을 적는다. 다른 계정의 사용자는 자기 계정의 자격 증명 기반 정책에서도 `lambda:InvokeFunction`을 허용받아야 한다. 계정 사이 접근은 양쪽이 모두 허용해야 한다({{ch:iam/cross-account}}).

- 문장의 Resource를 별칭 ARN(`...:function:my-function:prod`)으로 쓰면 그 별칭으로만 부를 수 있다({{ch:lambda/versions-aliases}}).
- 여러 함수에 걸친 권한이나, 함수 하나에 묶이지 않는 동작은 리소스 기반 정책 대신 IAM 역할로 준다.

**정책을 넣는 두 방법.**

| 방법 | 특징 |
|---|---|
| `AddPermission` (`add-permission`) | 허용(Allow) 문장을 하나씩 더한다. 조건 키는 `aws:SourceArn`, `aws:SourceAccount`, `aws:PrincipalOrgID`만 |
| `PutResourcePolicy` (`put-resource-policy`) | JSON 정책 전체를 넣는다. Deny 문장, 여러 Principal, 모든 전역 조건 키를 쓸 수 있다. **기존 정책을 통째로 바꾼다** |

- 최신 문서는 전체 JSON 방식을 권한다. 다만 시험 문항과 예전 자료는 대개 `add-permission`으로 설명한다. 둘 다 결과는 같은 리소스 기반 정책이다.
- `put-resource-policy`는 `add-permission`으로 넣은 문장까지 덮어쓴다. 먼저 `get-resource-policy`로 현재 정책을 받아 합친다.
- 조직 전체에 열 때는 `aws:PrincipalOrgID`로 AWS Organizations 조직을 조건으로 건다.

@topic lambda/permissions/identity-based

사람이나 CI 파이프라인이 함수를 만들고 바꾸려면 그 IAM 주체에 Lambda 동작을 허용한다. 정책 일반은 {{ch:iam/policies}}에서 다뤘다.

- **리소스로 좁힌다.** 함수 동작은 함수·버전·별칭 ARN으로, 이벤트 소스 매핑 동작은 매핑 ARN이나 `lambda:FunctionArn` 조건(연결된 함수)으로 좁힌다. 예: 이름이 `intern-`으로 시작하는 함수만.
- `Invoke` API의 동작 이름은 `lambda:InvokeFunction`이다. 나머지는 대개 `lambda:` + API 이름이다.
- **조심할 동작.** `AddPermission`·`PutResourcePolicy`는 누가 함수를 부를지 바꾸고, `PutFunctionConcurrency`는 계정 동시성을 떼어 가 다른 함수에 영향을 준다. 문서의 예시 정책도 개발자에게 이 둘을 주지 않는다. `lambda:Principal` 조건으로 정책에 넣을 수 있는 Principal을 제한할 수 있다.
- **`iam:PassRole`.** 함수에 실행 역할을 지정하는 사람은 그 역할에 대한 `iam:PassRole`이 있어야 한다. 넘길 수 있는 역할을 특정 ARN으로 좁히면, 자기보다 큰 권한을 가진 역할을 함수에 붙여 권한을 키우는 일을 막는다.
- **VPC 조건 키.** `lambda:VpcIds`, `lambda:SubnetIds`, `lambda:SecurityGroupIds`로 "VPC에 연결된 함수만 만들 수 있다" 같은 규칙을 건다({{ch:lambda/networking}}).
- **트리거 설정에는 그 서비스 권한도 필요하다.** S3 트리거를 만들려면 버킷 알림을 바꾸는 S3 권한이 있어야 한다.

**속성 기반 액세스 제어(ABAC).** 함수, 이벤트 소스 매핑, 코드 서명 구성에 태그를 달고 정책 조건에 `aws:ResourceTag`, `aws:RequestTag`, `aws:PrincipalTag`, `aws:TagKeys`를 쓴다. 예: 사용자 태그 `team`과 함수 태그 `team`이 같을 때만 호출·수정을 허용한다. 함수가 늘어도 정책을 고치지 않아도 된다. 계층(layer)에는 태그를 달 수 없다. 조건 키를 지원하는 동작은 서비스 권한 참조(Service Authorization Reference)에서 확인한다({{ch:iam/conditions-abac}}).

**권한 경계(permissions boundary).** 개발자에게 실행 역할을 직접 만들게 할 때 쓴다. 역할 생성을 허용하되 특정 권한 경계를 붙인 역할만 만들 수 있게 하면, 그 역할(그리고 그 역할을 쓰는 함수)은 경계를 넘는 권한을 갖지 못한다. 동작 방식은 {{ch:iam/policies}}에 있다.

@topic lambda/permissions/code-signing

**코드 서명(code signing).** AWS Signer로 서명한 코드만 함수에 배포되게 하는 기능이다. 서명 프로필을 허용 목록에 넣은 **코드 서명 구성(code signing configuration)** 을 만들어 함수에 붙인다. .zip과 컨테이너 이미지 함수에 쓴다.

- 배포할 때 무결성(서명 후 바뀌지 않았는지), 만료, 허용된 프로필인지, 폐기 여부를 확인한다.
- 만료·불일치·폐기 검사가 실패했을 때의 동작(`UntrustedArtifactOnDeployment`)은 `Warn`(기본값. 배포하고 경고·지표만 남김)과 `Enforce`(배포를 막음) 중에서 고른다.
- 배포 시점에만 검사하므로 실행 성능에는 영향이 없다. 이미 배포된 서명 없는 코드는 새로 배포할 때까지 그대로 돈다.
- 함수에 붙이는 계층도 허용된 프로필로 서명되어 있어야 한다.
- Signer와 코드 서명에는 추가 요금이 없다.
- 관리자는 `lambda:CodeSigningConfigArn` 조건 키로 개발자가 함수를 만들거나 고칠 때 지정한 코드 서명 구성을 쓰게 강제할 수 있다.

@quiz

@design

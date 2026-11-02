---
chapter: iam/access-analysis
---

@topic iam/access-analysis/analyzer

**IAM Access Analyzer** 는 정책을 자동 추론(automated reasoning)으로 분석해 "누가 무엇에 접근할 수 있는가"를 찾아 주는 IAM 기능이다. 분석기(analyzer)를 만들면 결과로 **결과(finding)** 를 낸다. 분석기는 세 종류다.

| 분석기 | 찾는 것 |
|---|---|
| 외부 액세스(external access) | 신뢰 영역 밖의 보안 주체에게 공유된 리소스. 퍼블릭과 교차 계정 액세스 |
| 미사용 액세스(unused access) | 쓰지 않는 역할, IAM 사용자의 쓰지 않는 액세스 키·암호, 쓰지 않는 서비스·작업 권한 |
| 내부 액세스(internal access) | 지정한 중요 리소스에 조직·계정 안의 어떤 사용자·역할이 접근할 수 있는가 |

**외부 액세스 분석기.** 분석기를 만들 때 계정이나 조직을 고른다. 이것이 **신뢰 영역(zone of trust)** 이다. 신뢰 영역 안의 공유는 안전하다고 보고, 리소스 기반 정책이 신뢰 영역 밖(다른 계정, 익명 사용자, 페더레이션 사용자 등)에 접근을 주면 그 건마다 결과를 낸다. 조직을 신뢰 영역으로 고르면, 멤버 계정끼리 버킷을 공유해도 결과가 나오지 않고 조직 밖 계정에 열 때만 나온다.

- 분석 대상은 리소스 기반 정책이 붙는 리소스다. S3 버킷, IAM 역할(신뢰 정책), KMS 키, Lambda 함수·계층, SQS 큐, Secrets Manager 비밀, SNS 주제, EBS·RDS 스냅샷, ECR 리포지토리, EFS, DynamoDB 테이블·스트림 등이다.
- 정책이 추가·변경되면 {{fact:iam.access-analyzer.policy-change.scan}} 안에 다시 분석한다. 변경 알림을 놓친 드문 경우에도 {{fact:iam.access-analyzer.periodic-scan}} 안의 주기 검사에서 잡는다. 고친 결과를 바로 확인하려면 결과 화면의 **다시 스캔(Rescan)** 이나 `StartResourceScan`을 쓴다.
- **외부 액세스 분석은 리전 단위다.** 분석기를 만든 리전의 리소스만 본다. 리소스를 쓰는 리전마다 분석기를 만들어야 한다.
- 외부 액세스 결과는 무료다.

**미사용 액세스 분석기.** 모든 IAM 역할과 사용자를 계속 감시해, **추적 기간(tracking period)** 동안 쓰지 않은 것을 결과로 낸다. 추적 기간은 {{fact:iam.access-analyzer.unused.tracking-period.max}}에서 고르고, 그 기간 내내 존재한 엔터티만 평가한다. 결과는 리전에 따라 달라지지 않으므로 리전마다 만들 필요가 없다. 분석한 역할·사용자 수에 따라 요금이 붙는다. 이 분석기는 아래의 마지막 액세스 정보를 바탕으로 한다.

**내부 액세스 분석기.** 지정한 S3 버킷, DynamoDB 테이블, RDS 스냅샷 같은 리소스에 대해 조직·계정 안의 접근 경로를 찾는다. 외부 액세스 결과와 함께 보면 신뢰 경계 안팎의 모든 접근을 볼 수 있다. 모니터링하는 리소스 수에 따라 요금이 붙는다. 2025년에 추가된 기능이라 시험 반영 여부는 알 수 없다.

**공통 사항**

- 계정 수준 분석기는 유형별로 계정·리전당 {{fact:iam.access-analyzer.analyzers-per-account}}다. 조직 수준 분석기는 관리 계정이나 위임된 관리자 계정에서 만든다.
- 분석기를 만들면 서비스 연결 역할 `AWSServiceRoleForAccessAnalyzer`가 생긴다.
- 의도한 공유라면 결과를 **보관(archive)** 한다. **보관 규칙(archive rule)** 을 두면 조건에 맞는 새 결과를 자동으로 보관한다. 고쳐서 접근이 사라진 결과는 해결됨(resolved)이 된다.
- 결과는 처음에 활성(Active) 상태이고, 보관하거나 접근을 없애면 바뀐다. 결과는 EventBridge로 보내 자동 대응하거나, Security Hub로 모아 볼 수 있다.

@topic iam/access-analysis/validate-generate-preview

Access Analyzer는 리소스를 감시하는 것 말고도 **정책을 쓰는 단계** 에서 쓰는 기능이 있다.

**정책 검사(policy validation).** 정책을 IAM 정책 문법과 AWS 모범 사례에 비추어 검사한다. 검사 항목은 {{fact:iam.access-analyzer.policy-checks.min}}다. IAM 콘솔의 JSON 편집기에서 관리형 정책이나 사용자·역할 인라인 정책을 만들거나 고칠 때 아래 네 갈래로 결과가 나온다. 그룹 인라인 정책에는 결과를 내지 않는다. CLI·API(`ValidatePolicy`)로도 부를 수 있다.

| 갈래 | 뜻 |
|---|---|
| 보안(Security) | 너무 넓게 허용해 보안 위험으로 보는 접근 |
| 오류(Errors) | 정책이 동작하지 못하게 하는 줄 |
| 경고(Warnings) | 모범 사례에 어긋나지만 보안 위험은 아닌 것 |
| 제안(Suggestions) | 권한에 영향 없는 개선점 |

**사용자 지정 정책 검사(custom policy checks).** 내 보안 기준으로 정책을 검사한다. 검사마다 요금이 붙는다.

- `CheckNoNewAccess`: 고친 정책이 이전 버전보다 새 접근을 허용하는가. 콘솔의 **새 액세스 확인** 탭이 이것이다.
- `CheckAccessNotGranted`: 지정한 작업(예: 민감한 작업)을 허용하지 않는가.
- `CheckNoPublicAccess`: 리소스 정책이 퍼블릭 접근을 줄 수 있는가.

이 검사들은 CI/CD 파이프라인에 넣어 배포 전에 정책을 막는 데 쓸 수 있다.

**정책 생성(policy generation).** 사용자나 역할의 CloudTrail 활동을 읽어, 실제로 쓴 서비스·작업만 담은 정책 템플릿을 만든다. 최소 권한으로 줄일 때 쓴다({{ch:iam/best-practices}}).

- 계정에 CloudTrail **추적(trail)** 이 있어야 한다. 이벤트 기록(Event history)만으로는 안 된다. Access Analyzer가 추적 버킷을 읽도록 서비스 역할도 지정한다.
- 분석 기간은 최대 {{fact:iam.access-analyzer.policy-generation.range.max}}다. 기간을 줄이면 빨리 끝난다.
- EC2처럼 지원하는 서비스는 작업 수준까지, 나머지는 서비스 수준까지만 채운다. S3 데이터 이벤트 같은 데이터 이벤트의 작업은 찾지 않는다. `iam:PassRole`은 CloudTrail에 남지 않아 생성된 정책에 들어가지 않는다.
- 거부된 요청도 포함해 모든 이벤트를 본다. 생성된 정책은 검토하며 리소스와 조건을 직접 채운 뒤 관리형 정책으로 저장한다. 콘솔에서는 {{fact:iam.access-analyzer.generated-policy.console-keep}} 동안만 다시 볼 수 있다.
- 감사 용도로 쓰지 말라고 문서가 못박는다. 감사는 CloudTrail로 한다.
- AWS Control Tower가 만든 추적은 쓸 수 없다.

**액세스 미리 보기(access preview).** 리소스 권한을 배포하기 **전에** 바뀐 정책이 퍼블릭·교차 계정 접근을 어떻게 바꾸는지 결과 형태로 미리 본다. S3 콘솔에서는 버킷 정책을 저장하기 전에, API로는 S3 버킷, KMS 키, IAM 역할, SQS 큐, Secrets Manager 비밀에 대해 쓸 수 있다.

@topic iam/access-analysis/last-accessed-report

**마지막 액세스 정보(last accessed information).** IAM 사용자·그룹·역할·정책별로, 허용된 서비스와 작업을 마지막으로 언제 시도했는지 보여 준다. 콘솔에서는 각 엔터티의 **마지막 액세스(Last Accessed)** 탭에서 본다. 쓰지 않는 서비스를 찾아 권한을 줄일 때 쓴다.

- 최근 활동은 {{fact:iam.last-accessed.console-delay}} 안에 나타난다. 서비스 정보의 추적 기간은 {{fact:iam.last-accessed.service-tracking.min}}다.
- 작업 수준 정보는 CloudTrail 관리 이벤트(생성·삭제·수정 같은 제어 영역 작업)만 다룬다. 데이터 영역 이벤트는 없다. `iam:PassRole`은 추적하지 않는다.
- 성공만이 아니라 **모든 시도** 를 기록한다. 낯선 항목이 있다고 해서 침해됐다는 뜻은 아니다. 거부된 시도일 수 있다. 성공 여부의 기준 자료는 CloudTrail이다.
- 자격 증명 기반 정책(사용자·역할에 직접 또는 그룹을 통해 붙은 정책)이 허용한 서비스만 보인다. 리소스 기반 정책, ACL, SCP, 권한 경계, 세션 정책이 허용한 접근은 보고서에 없다.
- 보고서는 만든 보안 주체만 볼 수 있다. 역할 세션으로 만들었다면 같은 세션 안에서 받아야 한다.
- Organizations 관리 계정에서는 조직 루트·OU·계정 단위로, SCP가 허용한 서비스에 대한 마지막 액세스를 볼 수 있다. SCP를 줄일 근거가 된다.

**자격 증명 보고서(credential report).** 계정의 **모든 IAM 사용자와 루트 사용자** 의 자격 증명 상태를 CSV로 내려받는다. 암호 사용 여부·마지막 사용·마지막 변경·다음 교체 예정일, 액세스 키 활성 여부와 마지막 사용·교체 시각, MFA 사용 여부 등이 열로 나온다. 감사와 규정 준수에 쓰고, 외부 감사인에게 줄 수도 있다.

- 생성은 `iam:GenerateCredentialReport`, 다운로드는 `iam:GetCredentialReport` 권한이 필요하다.
- 새 보고서는 {{fact:iam.credential-report.min-interval}}마다 만들 수 있다. 그보다 최근 보고서가 있으면 그것을 내려받는다.
- 사용자당 처음 두 액세스 키, 암호, MFA, X.509 서명 인증서만 담는다. CodeCommit 암호 같은 서비스별 자격 증명은 없다.

| 질문 | 쓸 도구 |
|---|---|
| 이 역할이 실제로 쓰는 서비스는? | 마지막 액세스 정보, 미사용 액세스 분석기 |
| {{raw:90일}} 넘게 안 쓴 액세스 키를 가진 사용자는? | 자격 증명 보고서, 미사용 액세스 분석기 |
| 조직 밖에 열린 버킷·역할은? | 외부 액세스 분석기 |
| 누가 언제 무엇을 했나? | CloudTrail |

@topic iam/access-analysis/simulator-troubleshoot

**IAM 정책 시뮬레이터(policy simulator).** 실제 요청을 보내지 않고, 주어진 정책으로 특정 작업·리소스가 허용되는지 거부되는지 계산한다. 허용이나 명시적 거부라면 어느 정책의 어느 문장 때문인지도 보여 준다.

| 모드 | 쓰임 |
|---|---|
| 보안 주체 모드(Principal) | 기존 사용자·그룹·역할에 붙은 정책을 시험한다. API는 `SimulatePrincipalPolicy` |
| 사용자 지정 모드(Custom) | 붙이기 전 정책을 붙여 넣어 시험한다. API는 `SimulateCustomPolicy` |

- 권한 경계(한 번에 하나), SCP, 직접 넣어 준 리소스 기반 정책도 함께 평가한다. SCP가 허용·거부했는지는 알려 주지만 보안상 SCP의 일치한 문장은 보여 주지 않는다.
- 콘솔이 아니면 리소스의 정책을 대신 가져오지 않는다. 리소스 기반 정책을 넣으려면 직접 준다.
- 조건 키 값은 일부 보안 주체·조직 키만 자동으로 채우고 나머지(예: `aws:SourceIp`, `aws:MultiFactorAuthPresent`)는 직접 입력한다.
- **실제 환경과 다를 수 있다.** 실제 서비스 호출이 없고, RCP는 지원하지 않으며, VPC 엔드포인트 정책, 역할 체인, 한 리소스에 여러 리소스 정책 같은 경우는 결과가 다를 수 있다. 시뮬레이션 뒤 실제 환경에서 확인한다.

**액세스 거부 오류 읽기.** 거부는 두 가지다. 명시적 거부(explicit deny)는 `Deny` 문이 걸린 것이고, 암묵적 거부(implicit deny)는 거부도 허용도 없는 것이다({{ch:iam/policy-evaluation}}). 많은 서비스의 오류 메시지가 이것을 문구로 구분한다.

| 문구 | 뜻 |
|---|---|
| `with an explicit deny in a <유형> policy` | 그 유형의 정책에 `Deny` 문이 있다. 정책 ARN이 붙기도 한다 |
| `because no <유형> policy allows the <작업> action` | 그 유형의 정책에 허용이 없다 |

유형 자리에는 identity-based, resource-based, service control, resource control, permissions boundary, session, VPC endpoint 등이 온다. 여러 정책 유형이 함께 거부해도 메시지에는 하나만 나온다. 그러니 메시지가 가리킨 정책 외에 다른 정책도 함께 본다. 확인 순서는 대략 이렇다. 자격 증명 기반 정책과 조건 충족 여부, 리소스 기반 정책(다른 계정이면 양쪽 모두 허용이 필요하다), 권한 경계, 세션 정책, SCP·RCP, VPC 엔드포인트 정책, 임시 자격 증명 만료 여부.

**인코딩된 권한 부여 메시지.** 일부 AWS 작업은 거부 응답(HTTP 403)에 **인코딩된 메시지(encoded authorization message)** 를 넣는다. 요청자가 보면 안 되는 정보가 들어 있을 수 있어 인코딩한 것이다. `sts:DecodeAuthorizationMessage` 권한이 있는 사람이 STS `DecodeAuthorizationMessage`(CLI `aws sts decode-authorization-message`)로 풀면 명시적·암묵적 거부 여부, 요청한 보안 주체·작업·리소스, 조건 키 값이 나온다.

거부 메시지에 권한 부여 ID를 넣어 원인을 한 번에 조회하는 **Access Troubleshooter** 는 문서 기준 공개 미리 보기(preview) 단계다. 시험 반영 여부는 알 수 없다.

@topic iam/access-analysis/cloudtrail

**CloudTrail** 은 IAM과 STS의 모든 API 호출을 이벤트로 남긴다. 콘솔 조작도 API 호출로 기록된다. 계정을 만들면 CloudTrail이 이미 켜져 있어, 추적이 없어도 **이벤트 기록(Event history)** 에서 최근 이벤트를 볼 수 있다. 오래 보관하려면 **추적(trail)** 을 만들어 S3로 보낸다. 콘솔에서 만든 추적은 기본으로 모든 리전에 적용된다.

| 기록되는 것 | 참고 |
|---|---|
| IAM·STS의 인증된 모든 API 요청 | `CreateUser`, `DeleteRole`, `AssumeRole` 등 |
| 인증되지 않은 `AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity` | IdP가 준 정보도 남는다. 너무 잘못된 요청은 빠질 수 있다 |
| 다른 서비스로 보낸 인증된 요청 | 루트·IAM 사용자·역할·서비스 중 누가 했는지 `userIdentity`에 남는다 |
| 콘솔·CLI·SDK 로그인 이벤트 | IAM 사용자, 페더레이션 보안 주체의 성공·실패 로그인 |

알아 둘 점이 있다.

- **잘못된 사용자 이름으로 실패한 로그인** 은 입력한 이름을 `HIDDEN_DUE_TO_SECURITY_REASONS`로 가린다. 사용자 이름 칸에 암호를 잘못 넣었을 수도 있기 때문이다.
- 다른 계정의 역할을 수임하면 STS 호출은 호출한 계정과 역할이 있는 계정 모두에 남는다. 그 뒤 역할로 한 호출에는 역할 정보만 남고 원래 사용자는 보이지 않는다. 누가 했는지 추적하려면 신뢰 정책에서 `sts:SourceIdentity`나 `sts:RoleSessionName`을 요구한다.
- 교차 계정 역할 수임이 **거부되면** 그 요청은 대상 계정의 CloudTrail에 남지 않는다. `AssumeRoot` 권한 있는 세션의 거부도 마찬가지다.
- MFA로 로그인한 IAM 사용자가 역할을 수임하면 세션 정보에 `mfaAuthenticated: true`가 남는다. 다만 이것은 기록일 뿐, 역할 자격 증명으로 호출할 때 IAM이 MFA를 요구하는지와는 별개다.
- STS 전역 엔드포인트로 보낸 요청의 로그는 미국 동부(버지니아 북부) 리전으로 간다. 리전 엔드포인트로 보낸 요청은 그 리전에 남는다({{ch:iam/temporary-credentials}}).

@quiz

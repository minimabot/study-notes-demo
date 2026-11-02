---
chapter: iam/policies
---

@topic iam/policies/types

**정책(policy)** 은 권한을 적은 문서다. 자격 증명이나 리소스에 붙이면, 요청이 들어올 때 AWS가 그 정책을 보고 허용할지 거부할지 정한다. 대부분 JSON 문서로 저장된다. 콘솔, CLI, API 어느 쪽으로 요청하든 같은 정책이 적용된다.

정책은 두 부류로 나눠 보면 쉽다. **권한을 주는 정책** 과 **최대 권한을 제한하기만 하는 정책** 이다.

| 정책 종류 | 하는 일 |
|---|---|
| 자격 증명 기반 정책(identity-based policy) | 사용자·그룹·역할에 붙여 그 자격 증명에 권한을 준다 |
| 리소스 기반 정책(resource-based policy) | S3 버킷 같은 리소스에 붙여, 정책에 적은 보안 주체에 권한을 준다 |
| 권한 경계(permissions boundary) | 사용자·역할이 자격 증명 기반 정책으로 받을 수 있는 최대 권한을 정한다. 권한을 주지 않는다 |
| 서비스 제어 정책(SCP) | 조직(AWS Organizations)의 계정·OU 안 사용자와 역할의 최대 권한을 정한다. 권한을 주지 않는다 |
| 리소스 제어 정책(RCP) | 조직 계정 안 리소스의 최대 권한을 정한다. 권한을 주지 않는다 |
| 액세스 제어 목록(ACL) | 다른 계정의 보안 주체에게 리소스 접근을 준다. JSON이 아닌 유일한 형식이다 |
| 세션 정책(session policy) | 역할 세션이나 페더레이션 사용자 세션을 만들 때 넘겨, 그 세션의 권한을 줄인다. 권한을 주지 않는다 |

조금 더 짚어 둘 점이다.

- **리소스 기반 정책** 은 항상 그 리소스에 들어 있는 인라인 정책이다. 관리형 리소스 기반 정책은 없다. 대표 예는 S3 버킷 정책과 IAM 역할의 **신뢰 정책(trust policy)** 이다. 역할은 자격 증명이면서 리소스이기도 해서, 신뢰 정책(누가 이 역할을 맡을 수 있나)과 권한 정책(맡은 뒤 무엇을 할 수 있나)을 둘 다 붙인다.
- **같은 계정** 안에서는 리소스 기반 정책이 보안 주체에게 직접 허용하면 자격 증명 기반 정책이 따로 없어도 된다. **다른 계정** 의 보안 주체라면 그쪽 계정에서도 자격 증명 기반 정책으로 허용해야 한다. 자세한 판정은 {{ch:iam/policy-evaluation}}에서 다룬다.
- **SCP와 RCP** 는 조직에서 모든 기능(all features)을 켰을 때만 쓸 수 있다. 둘 다 멤버 계정의 루트 사용자에게도 적용된다. SCP는 "누가(보안 주체)", RCP는 "무엇에(리소스)" 쪽의 상한이다.
- **ACL** 은 같은 계정 안의 보안 주체에게는 권한을 줄 수 없다. S3, AWS WAF, Amazon VPC가 ACL을 지원하는 예다.
- **세션 정책** 은 `AssumeRole`, `AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`, `GetFederationToken`을 부를 때 넘긴다. JSON 문서 하나(`Policy`)와 관리형 정책 ARN 최대 {{fact:iam.session-policy.managed-arns.max}}(`PolicyArns`)를 넘길 수 있다. 세션 권한은 자격 증명 기반 정책과 세션 정책의 교집합이다.

이 밖에 문서는 VPC 엔드포인트 정책과 AWS RAM 리소스 공유도 정책 종류로 함께 소개한다. VPC 엔드포인트 정책은 엔드포인트를 지나는 트래픽에만 걸리는 추가 경계다.

**루트 사용자** 에는 자격 증명 기반 정책도 권한 경계도 붙일 수 없다. 다만 리소스 기반 정책이나 ACL의 보안 주체로는 지정할 수 있고, 조직의 멤버 계정이라면 SCP·RCP의 영향을 받는다.

@topic iam/policies/managed-inline

자격 증명 기반 정책은 다시 세 가지로 나뉜다.

| 종류 | 관리 주체와 특징 |
|---|---|
| AWS 관리형 정책(AWS managed policy) | AWS가 만들고 고친다. 내용을 바꿀 수 없다. 여러 자격 증명에 붙인다 |
| 고객 관리형 정책(customer managed policy) | 내 계정에서 만들고 고친다. 여러 자격 증명에 붙인다 |
| 인라인 정책(inline policy) | 사용자·그룹·역할 하나에 직접 넣는다. 그 자격 증명을 지우면 같이 지워진다 |

**관리형 정책** 은 자기 ARN을 가진 독립된 정책이다(예: `arn:aws:iam::aws:policy/IAMReadOnlyAccess`). AWS 관리형 정책은 AWS가 새 서비스나 API를 내면 갱신하고, 그 변경은 붙어 있는 모든 자격 증명에 곧바로 반영된다. 직무별 정책(job function policy)도 이 부류다. 편하지만 최소 권한을 보장하지 않는다.

**AWS 권장.** 대부분은 인라인 정책보다 관리형 정책을 쓴다. 관리형 정책은 여러 곳에 재사용하고, 한 번 고치면 모든 곳에 반영되고, 버전으로 되돌릴 수 있고, 붙이기·떼기만 다른 관리자에게 맡기는 식으로 관리를 나눌 수 있다. 최소 권한을 가장 안전하게 주는 방법은 필요한 권한만 담은 고객 관리형 정책을 직접 쓰는 것이다. AWS 관리형 정책으로 시작했다면 실제 쓰는 권한을 지켜본 뒤 고객 관리형 정책으로 좁힌다.

**인라인 정책이 맞는 경우.** 정책과 자격 증명을 엄격하게 하나 대 하나로 묶고 싶을 때다. 그 권한이 실수로 다른 자격 증명에 붙는 일이 없다.

**크기 한도.** 고객 관리형 정책 하나는 {{fact:iam.managed-policy.max-size}}까지다. 인라인 정책은 개수 제한이 없지만, 한 자격 증명에 넣은 인라인 정책 전체 합계가 사용자 {{fact:iam.inline.user-size.max}}, 그룹 {{fact:iam.inline.group-size.max}}, 역할 {{fact:iam.inline.role-size.max}}를 넘을 수 없다. 붙일 수 있는 관리형 정책 수는 역할 {{fact:iam.quota.managed-per-role}}, 사용자 {{fact:iam.quota.managed-per-user}}, 그룹 {{fact:iam.quota.managed-per-group}}다.

@topic iam/policies/json-elements

JSON 정책은 맨 위의 선택 정보(`Version` 등)와 하나 이상의 **문(statement)** 으로 이뤄진다. 한 정책 안의 여러 문, 그리고 요청에 걸리는 여러 정책은 논리 OR로 합쳐서 본다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadReportsWithMfa",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::example-reports",
        "arn:aws:s3:::example-reports/*"
      ],
      "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }
    }
  ]
}
```

| 요소 | 뜻 |
|---|---|
| `Version` | 정책 언어 버전. 항상 `2012-10-17`을 쓴다 |
| `Statement` | 문을 담는 상자. 하나 또는 배열 |
| `Sid` | 문을 구분하는 선택 ID. IAM API로 이 값을 꺼낼 수는 없다 |
| `Effect` | `Allow` 또는 `Deny` |
| `Principal` | 리소스 기반 정책에서 누구에게 적용할지. 자격 증명 기반 정책에는 쓸 수 없다 |
| `Action` / `NotAction` | 대상 작업 / 적은 작업을 뺀 나머지 전부 |
| `Resource` / `NotResource` | 대상 리소스 ARN / 적은 리소스를 뺀 나머지 전부 |
| `Condition` | 문이 적용되는 조건. 조건이 참일 때만 문이 효력을 갖는다 |

- **`Version`** 을 빼거나 예전 값인 `2008-10-17`을 쓰면 정책 변수 같은 기능이 작동하지 않는다. `${aws:username}`이 변수로 풀리지 않고 글자 그대로 비교된다. 이 요소는 아래에서 다룰 "관리형 정책 버전"과 다른 것이다.
- **`Principal`** 에는 계정, IAM 사용자, IAM 역할, 역할 세션, 페더레이션 사용자, AWS 서비스, 모든 보안 주체(`*`)를 쓸 수 있다. **IAM 그룹은 보안 주체가 될 수 없다.** 그룹은 권한을 묶는 단위일 뿐 인증 대상이 아니기 때문이다. 자격 증명 기반 정책에서는 정책이 붙은 자격 증명이 곧 보안 주체다.
- **`Resource`** 는 ARN으로 적고, 각 ARN 구간 안에서 `*`(아무 글자)와 `?`(한 글자)를 쓸 수 있다. 서비스 구간에는 와일드카드를 쓸 수 없다. 문에는 `Resource`나 `NotResource` 중 하나가 있어야 한다.
- **`NotAction`·`NotResource` 와 `Allow`를 함께 쓸 때 조심한다.** `"Effect": "Allow", "NotAction": "iam:*", "Resource": "*"`는 IAM을 뺀 모든 서비스의 모든 작업을 허용한다. 적지 않은 것이 전부 허용되므로 생각보다 넓어진다. 문서는 `Allow` + `"Action": "*"` + `NotResource` 조합을 절대 쓰지 말라고 경고한다. 자기에게 정책을 붙여 빠진 리소스까지 열 수 있기 때문이다.
- **`NotAction` 과 `Deny`** 는 "적은 작업을 뺀 나머지를 거부"다. 예를 들어 MFA로 로그인하지 않았으면 IAM 작업을 뺀 모든 작업을 거부하는 문을 만들 수 있다. 이 문은 거부만 하므로, 실제로 쓸 작업은 다른 문에서 따로 허용해야 한다.

**AWS 권장.** 한 문에 여러 권한을 몰아넣지 말고 리소스 종류별로 문이나 정책을 나눈다. 정책을 만들거나 고칠 때 IAM Access Analyzer의 정책 검사(policy validation)로 검토한다.

@topic iam/policies/variables-versions

**정책 변수(policy variable).** 정책을 쓸 때 값을 미리 알 수 없으면 `${...}` 자리표시자를 쓴다. 요청할 때 요청 컨텍스트의 값으로 바뀐다. 사용자마다 자기 이름의 S3 폴더만 쓰게 하는 정책 하나를 모든 사용자에게 붙이는 식이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::example-home/${aws:username}/*"
  }]
}
```

- 변수는 `Resource` 요소와 `Condition`의 문자열 비교에 쓸 수 있다. `Resource`에서는 ARN의 리소스 부분에만 쓰고, 서비스나 계정 구간은 변수로 바꿀 수 없다. 태그 값도 변수로 쓴다(`${aws:PrincipalTag/team}`). 이것이 {{ch:iam/conditions-abac}}에서 다루는 ABAC의 바탕이다.
- 값이 하나뿐인 컨텍스트 키만 변수로 쓸 수 있다. 값이 여럿인 키(예: `aws:TagKeys`)는 변수가 될 수 없다.
- AWS가 변수 값을 찾지 못하면 그 문 전체가 무효가 될 수 있다. 예를 들어 `aws:TokenIssueTime`은 임시 자격 증명으로 요청할 때만 값이 있다. 이런 경우에 대비해 `...IfExists` 조건 연산자를 쓴다.

**관리형 정책 버전(policy version).** 고객 관리형 정책을 고치면 기존 정책을 덮어쓰지 않고 새 **버전** 을 만든다. 버전 중 하나가 **기본 버전(default version)** 이고, 실제로 적용되는 것은 기본 버전뿐이다.

- 버전은 최대 {{fact:iam.policy.versions.max}}까지 저장된다. CLI·API로 그 이상 고치려면 먼저 기본이 아닌 버전을 지워야 한다. 콘솔은 저장할 때 지울 버전을 고르게 한다.
- 기본 버전은 지울 수 없다. 버전을 지워도 남은 버전의 번호는 바뀌지 않아 번호가 띄엄띄엄해질 수 있다.
- **되돌리기(roll back):** 새 버전이 문제를 일으키면 이전 버전을 기본 버전으로 다시 지정한다. 정책을 새로 쓰지 않아도 즉시 되돌아간다.
- 인라인 정책에는 버전이 없다.
- 누군가 정책 내용을 못 바꾸게 하려면 `iam:CreatePolicyVersion`과 `iam:SetDefaultPolicyVersion`을 **둘 다** 거부해야 한다. 앞의 작업으로도 새 버전을 기본으로 만들 수 있기 때문이다.

@quiz

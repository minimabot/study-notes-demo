---
chapter: iam/conditions-abac
---

@topic iam/conditions-abac/condition-block

**`Condition` 요소** 는 문이 효력을 갖는 조건을 정한다. 정책에 적은 **조건 키(condition key)** 와 값을, 요청 컨텍스트에 들어 있는 같은 키의 값과 **조건 연산자(condition operator)** 로 비교한다. 조건이 참일 때만 그 문의 `Allow`나 `Deny`가 적용된다.

```json
"Condition": {
  "StringEquals": { "aws:PrincipalTag/team": ["red", "blue"] },
  "IpAddress":    { "aws:SourceIp": "203.0.113.0/24" }
}
```

여러 개를 적으면 이렇게 합친다.

| 구성 | 결합 방식 |
|---|---|
| 조건 연산자가 여럿 | AND |
| 한 연산자 안에 키가 여럿 | AND |
| 한 키에 값이 여럿 | OR |
| 부정 연산자(`StringNotEquals` 등)의 값이 여럿 | NOR (어느 값과도 맞지 않아야 참) |

위 예는 "팀 태그가 red **또는** blue **이고**, 출발 IP가 그 대역 안"일 때 참이다.

**연산자 종류.** 문자열(`StringEquals`, `StringLike` 등), 숫자, 날짜, 불(`Bool`), 이진, IP 주소(`IpAddress`, `NotIpAddress`), ARN(`ArnEquals`, `ArnLike` 등)이 있다. 키마다 쓸 수 있는 연산자가 정해져 있다. 예를 들어 `aws:SourceIp`는 IP 주소 연산자, `aws:SecureTransport`는 `Bool`을 쓴다.

- 키 **이름** 은 대소문자를 가리지 않는다(`aws:SourceIP` = `aws:sourceip`). 값의 대소문자는 연산자에 따라 다르다. `StringEquals`는 가리고 `StringEqualsIgnoreCase`는 가리지 않는다.
- 전역 조건 키는 `aws:`로 시작한다. 서비스별 키는 그 서비스 접두어를 쓴다(예: `ec2:InstanceType`, `iam:PermissionsBoundary`).
- **키가 요청에 없으면** 비교는 거짓이다. 단, 부정 연산자(`StringNotLike`, `ArnNotLike` 등)는 키가 없으면 참이 된다. 이 규칙의 예외가 다음 절의 `...IfExists`와 `Null`이다.

@topic iam/conditions-abac/multivalued

**단일 값과 다중 값.** 구분 기준은 정책에 적은 값의 개수가 아니라 **요청 컨텍스트에 들어오는 값의 개수** 다.

- **단일 값 키:** 요청에 값이 하나 이하다. `aws:SourceVpce`(요청은 엔드포인트 하나만 거친다), `aws:PrincipalTag/키`, `aws:ResourceTag/키`, `aws:RequestTag/키`가 그렇다.
- **다중 값 키:** 요청에 값이 여럿 올 수 있다. `aws:TagKeys`(요청에 넣은 태그 키 목록), `aws:CalledVia`가 그렇다. 반드시 **집합 연산자** 를 붙인다.

| 집합 연산자 | 참이 되는 경우 |
|---|---|
| `ForAllValues:` | 요청의 **모든** 값이 정책 값 중 하나와 맞는다. 요청에 키가 없거나 값이 비어도 참 |
| `ForAnyValue:` | 요청 값 중 **하나 이상** 이 정책 값 중 하나와 맞는다. 키가 없으면 거짓 |

- **`ForAllValues`와 `Allow`를 함께 쓸 때 조심한다.** 태그 키를 하나도 넣지 않은 요청도 참이 된다. 문서는 `Null` 연산자로 키가 있는지(`"false"`) 함께 확인하라고 권한다.
- **단일 값 키에는 집합 연산자를 쓰지 않는다.** 정책이 생각보다 넓게 허용될 수 있다.

**`...IfExists`.** `Null`을 뺀 모든 연산자 뒤에 붙일 수 있다(예: `StringLikeIfExists`). "키가 요청에 있으면 비교하고, 없으면 참"이라는 뜻이다. 어떤 리소스에는 있고 어떤 리소스에는 없는 키를 한 문에서 다룰 때 쓴다. 예를 들어 `ec2:InstanceType`을 `StringLikeIfExists`로 걸면, 인스턴스 유형 키가 있는 요청만 유형을 검사하고 키가 없는 다른 EC2 리소스 요청은 통과시킨다.

**`Null`.** 키가 있는지 없는지만 본다. `"true"`는 키가 없음(null), `"false"`는 키가 있고 값이 null이 아님이다. `Null` 조건에는 정책 변수를 쓸 수 없다.

```json
"Condition": {
  "ForAllValues:StringEquals": { "aws:TagKeys": ["project", "cost-center"] },
  "Null": { "aws:TagKeys": "false" }
}
```

이 조건은 "태그 키를 하나 이상 넣었고, 넣은 키가 모두 `project`나 `cost-center` 중 하나"일 때만 참이다.

@topic iam/conditions-abac/global-keys

시험과 실무에서 자주 쓰는 전역 조건 키다.

| 키 | 확인하는 것 |
|---|---|
| `aws:SourceIp` | 요청자의 공인 IP. VPC 엔드포인트를 거친 요청에는 이 키가 없다 |
| `aws:SourceVpce` | 요청이 거친 VPC 엔드포인트 ID. 엔드포인트를 거칠 때만 있다 |
| `aws:MultiFactorAuthPresent` | 임시 자격 증명이 MFA로 인증됐는지. 장기 액세스 키 요청에는 키가 없다 |
| `aws:PrincipalOrgID` | 보안 주체가 속한 조직 ID. 조직 멤버일 때만 있다 |
| `aws:RequestedRegion` | 요청이 호출한 리전. 항상 있다 |
| `aws:SecureTransport` | TLS로 보냈는지(`true`/`false`). 항상 있다 |
| `aws:PrincipalTag/키` | 요청하는 보안 주체(사용자·역할·세션 태그)의 태그 |
| `aws:ResourceTag/키` | 대상 리소스에 붙은 태그 |
| `aws:RequestTag/키`, `aws:TagKeys` | 요청에 넣어 보내는 태그 값 / 태그 키 목록 |

키마다 함정이 있다.

- **`aws:SourceIp`** 는 공인 IP 대역에만 쓴다. VPC 엔드포인트로 들어온 요청에는 키가 없으므로, 그런 경로를 제한하려면 `aws:SourceVpce`(또는 `aws:SourceVpc`)를 쓴다. AWS 서비스가 사용자 대신 다른 서비스를 부르는 경우(전달 액세스 세션, FAS)에는 원래 요청의 네트워크 정보가 남지 않는다. 이런 키로 `Deny`를 걸면 서비스 호출까지 막힐 수 있어, 문서는 `aws:ViaAWSService`나 `aws:PrincipalIsAWSService`로 예외를 두는 방법을 안내한다.
- **`aws:MultiFactorAuthPresent`** 는 장기 자격 증명(액세스 키) 요청에는 아예 없다. 그래서 `"Deny"` + `Bool` + `"false"`는 액세스 키 요청을 막지 못한다. MFA 없는 요청을 모두 거부하려면 문서 권장대로 `BoolIfExists`를 쓴다.

```json
{ "Effect": "Deny", "Action": "*", "Resource": "*",
  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } } }
```

- **`aws:PrincipalOrgID`** 를 리소스 기반 정책에 쓰면 조직의 모든 계정 ID를 나열하지 않아도 된다. 계정이 조직에 들어오고 나가도 정책을 고칠 필요가 없다.
- **`aws:RequestedRegion`** 으로 특정 리전 밖을 거부할 때, IAM 같은 전역 서비스는 엔드포인트가 us-east-1 하나라 함께 막힌다. 문서는 `NotAction`으로 전역 서비스를 빼는 방법을 제시한다. 또 이 키는 호출한 엔드포인트를 제한할 뿐, S3 복제처럼 다른 리전에 미치는 영향까지 막지는 않는다.
- **`aws:SecureTransport`** 는 TLS로 보낸 요청에만 특정 작업을 허용할 때 쓴다. 이 키는 항상 요청에 들어 있다.
- **태그 키** 의 키 이름은 대소문자를 가리지 않지만 값은 가린다. `aws:ResourceTag/Env`에 `Production`을 적으면 `production`과는 맞지 않는다.

@topic iam/conditions-abac/abac

**속성 기반 액세스 제어(ABAC, Attribute-Based Access Control)** 는 속성으로 권한을 정하는 방식이다. AWS에서는 이 속성이 **태그** 다. 대표 패턴은 "보안 주체의 태그와 리소스의 태그가 같으면 허용"이다.

전통적인 **역할 기반 액세스 제어(RBAC)** 는 직무마다 정책을 만들고, 그 정책에 접근할 리소스를 하나하나 적는다. 새 리소스가 생기면 정책을 고쳐야 한다. ABAC는 이 부담을 줄인다.

| 비교 | RBAC | ABAC |
|---|---|---|
| 정책 수 | 직무·프로젝트마다 늘어난다 | 적은 수의 정책을 공유한다 |
| 새 리소스 | 정책에 ARN을 추가한다 | 맞는 태그를 붙이면 바로 접근된다 |
| 새 프로젝트 | 새 정책을 만든다 | 새 태그 값을 가진 역할만 만든다 |

문서의 튜토리얼은 `access-project`, `access-team`, `cost-center` 태그를 쓴다. 모든 프로젝트 역할에 **같은 정책 하나** 를 붙이고, 역할마다 태그 값만 다르게 준다. 정책의 핵심 문은 이렇다.

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:*",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/access-project": "${aws:PrincipalTag/access-project}",
      "aws:ResourceTag/access-team": "${aws:PrincipalTag/access-team}"
    },
    "ForAllValues:StringEquals": {
      "aws:TagKeys": ["access-project", "access-team", "cost-center", "Name", "OwnedBy"]
    },
    "StringEqualsIfExists": {
      "aws:RequestTag/access-project": "${aws:PrincipalTag/access-project}",
      "aws:RequestTag/access-team": "${aws:PrincipalTag/access-team}"
    }
  }
}
```

- 첫 블록은 리소스 태그가 보안 주체 태그와 같을 때 참이다. 정책 변수(`${aws:PrincipalTag/...}`)로 값을 비교한다.
- 둘째 블록은 요청에 넣은 태그 키가 모두 허용 목록 안에 있을 때 참이다. 태그를 넣지 않는 읽기 요청도 통과한다.
- 셋째 블록은 태그를 넣는 요청(생성 등)이라면 그 태그 값이 자기 태그와 같아야 한다. 태그를 넣지 않는 요청은 `IfExists` 덕분에 통과한다. 그래서 직원은 자기 프로젝트 태그를 붙인 리소스만 만들 수 있고, 만든 뒤에도 그 리소스에 접근할 수 있다.

ABAC를 안전하게 쓰려면 태그 자체를 지켜야 한다.

- 접근 제어에 쓰는 태그(`access-*`)를 지우는 작업을 거부한다. 튜토리얼은 `ForAnyValue:StringLike`로 `aws:TagKeys`가 `access-*`와 맞는 `UntagResource`를 거부한다.
- 리소스 기반 정책을 만들거나 고치는 작업(`secretsmanager:*Policy`)을 거부해, 태그를 우회하는 권한 변경을 막는다.
- 다른 정책이 더 넓게 허용하면(예: `AdministratorAccess`) ABAC 정책은 그 권한을 줄이지 못한다. 허용은 합집합이기 때문이다.

**페더레이션과 함께.** SAML이나 OIDC 공급자가 사내 디렉터리의 속성을 **세션 태그(session tag)** 로 넘기게 하면, 그 값이 `aws:PrincipalTag`로 들어와 같은 ABAC 정책에 쓰인다. 세션 태그는 키마다 값 하나만 넘길 수 있다. 세션 태그는 {{ch:iam/temporary-credentials}}에서 다룬다.

**AWS 권장.** 태그 키 이름 규칙을 계정 전체에서 일관되게 지키게 하고, 태그로 접근을 제어할 때는 `aws:TagKeys`로 허용할 태그 키를 정해 둔다.

@quiz

---
chapter: iam/federation
---

@topic iam/federation/choose

**자격 증명 페더레이션(identity federation)** 은 사용자 정보를 AWS 밖의 **ID 제공업체(IdP, identity provider)** 에 두고, 그 IdP에서 로그인한 사용자에게 AWS 접근을 주는 방식이다. AWS 안에 IAM 사용자를 만들지 않으므로 장기 자격 증명을 나눠 주거나 앱에 심을 일이 없다. 사용자는 임시 자격 증명으로 일한다({{ch:iam/temporary-credentials}}).

AWS는 사람 사용자(human user)에게 IAM 사용자를 따로 만들지 말고 IdP 페더레이션을 쓰라고 권장한다. 어떤 방식을 쓸지는 대상과 계정 구성에 따라 다르다.

| 방식 | 맞는 경우 | 연결하는 ID 소스 |
|---|---|---|
| IAM Identity Center | AWS Organizations로 묶은 여러 계정, 회사 직원(workforce) | SAML 2.0, AWS Managed Microsoft AD, Identity Center 디렉터리 |
| IAM 페더레이션 | 단일 독립 계정. 짧고 작은 규모의 사람 사용자, 또는 기계 사용자 | SAML 2.0, OIDC |
| Amazon Cognito 자격 증명 풀 | 계정 구성과 무관. IAM 권한으로 AWS 리소스에 접근하는 앱의 최종 사용자 | SAML 2.0, OIDC, 일부 OAuth 2.0 소셜 IdP |

**IAM Identity Center** 는 사람 사용자의 접근을 한곳에서 관리하는 서비스이고, AWS가 사람 사용자 관리용으로 먼저 권하는 방식이다. 사용자·그룹에 여러 계정의 접근과 권한을 배정하고, 사용자는 AWS 액세스 포털에서 콘솔이나 SAML 지원 애플리케이션으로 SSO한다. 사용자는 단기 자격 증명을 받는다. Identity Center 자체는 이 권의 범위 밖이고, 여기서는 IAM 사용 설명서가 설명하는 위치만 기억한다.

IAM 페더레이션을 쓰려면 계정에 **IAM ID 제공업체 엔터티** 를 만들어 IdP와 신뢰 관계를 맺고, 그 IdP를 보안 주체로 신뢰하는 역할을 만든다. IdP가 넘기는 사용자 속성(부서, 직급 등)을 세션 태그로 받아 세밀한 권한 조건에 쓸 수 있다.

@topic iam/federation/saml

**SAML 2.0 페더레이션** 은 회사 IdP(예: Microsoft AD FS, Shibboleth)로 로그인한 사용자가 AWS 콘솔이나 API를 쓰게 한다. 사용자는 회사 계정으로 한 번만 로그인하면 된다(SSO).

API 접근의 흐름은 다음과 같다.

1. 사용자가 클라이언트 앱에서 회사 IdP에 인증을 요청한다.
2. IdP가 회사 디렉터리로 사용자를 인증하고, 사용자 정보가 담긴 **SAML 어설션(assertion)** 을 돌려준다.
3. 앱이 `AssumeRoleWithSAML`을 부른다. SAML 공급자 ARN, 수임할 역할 ARN, 어설션을 넘긴다.
4. STS가 임시 자격 증명을 돌려주고, 앱은 그것으로 AWS API를 부른다.

미리 해 둘 설정은 양쪽에 있다.

| 쪽 | 할 일 |
|---|---|
| 회사 IdP | AWS를 서비스 공급자(SP)로 등록한다. AWS의 SAML 메타데이터 문서를 쓴다. 사용자·그룹을 IAM 역할에 매핑하는 어설션 속성을 정의한다 |
| AWS 계정 | IdP의 메타데이터 XML로 IAM SAML 공급자를 만든다. 그 공급자를 `Principal`로 신뢰하는 역할을 만든다 |

역할 신뢰 정책은 대략 이렇다. `saml:aud`로 AWS 로그인 엔드포인트를 확인하고, 필요하면 SAML 속성으로 수임 대상을 더 좁힌다.

```json
{ "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::111122223333:saml-provider/ExampleIdP" },
  "Action": "sts:AssumeRoleWithSAML",
  "Condition": { "StringEquals": { "saml:aud": "https://signin.aws.amazon.com/saml" } } }
```

알아 둘 점은 다음과 같다.

- 신뢰 정책에 쓰는 SAML 공급자는 **역할과 같은 계정** 에 있어야 한다.
- 콘솔 SSO도 된다. 사용자가 회사 포털에서 AWS를 고르면 추가 로그인 없이 콘솔로 넘어간다.
- IAM SAML 페더레이션은 암호화된 SAML 어설션을 받는다. IdP 쪽에서 만든 개인 키를 IAM SAML 공급자에 올려 두면 STS가 복호화한다.
- 복원력을 위해 AWS는 여러 리전의 SAML 로그인 엔드포인트를 쓰도록 IdP와 AWS 쪽을 구성하라고 권장한다.
- IAM은 SAML 메타데이터 안 X.509 인증서의 만료를 따지지 않는다. 인증서 만료는 직접 감시하고 교체한다.

@topic iam/federation/oidc

**OIDC 페더레이션** 은 OpenID Connect 호환 IdP가 발급한 **JWT(JSON Web Token)** 를 임시 자격 증명으로 바꾸는 방식이다. API는 `AssumeRoleWithWebIdentity`다. 대표적인 쓰임은 GitHub Actions처럼 AWS 밖에서 도는 CI/CD 워크플로가 AWS 리소스를 쓰는 경우다. AWS는 이런 앱에 장기 자격 증명을 저장하지 말고 OIDC로 필요할 때마다 임시 자격 증명을 받으라고 강하게 권한다.

설정 순서는 SAML과 비슷하다. IAM에 OIDC 공급자(IdP의 발급자 URL과 대상 audience)를 만들고, 그 공급자를 `Federated` 보안 주체로 신뢰하는 역할을 만든다. 신뢰 정책에는 조건을 꼭 둔다.

- `aud`: 토큰이 어느 앱(클라이언트 ID)을 위해 발급됐는지 확인한다. 예: `accounts.google.com:aud`, `cognito-identity.amazonaws.com:aud`.
- `sub`: 토큰의 주체를 확인한다. GitHub라면 `token.actions.githubusercontent.com:sub`로 조직·리포지토리·브랜치를 좁힌다. 좁히지 않으면 남의 조직 워크플로도 내 역할을 수임할 수 있다. IAM은 이 키가 없거나 값이 와일드카드뿐이면 신뢰 정책 생성·수정을 거부한다.

여러 조직이 같은 발급자 URL을 쓰는 **공유 OIDC 공급자** 에는 IAM이 특정 클레임 검사를 강제한다(identity-provider controls). 이 통제는 2025년에 추가됐고 대상 공급자 목록이 계속 늘고 있어, 시험 반영 여부는 확인되지 않았다.

그 밖의 동작은 다음과 같다.

- IAM은 OIDC IdP의 JWKS 엔드포인트 TLS 인증서를 신뢰하는 루트 CA 목록으로 검증한다. 그 CA에 없는 인증서이거나 인증서를 가져오지 못할 때만 IdP 설정에 넣은 지문(thumbprint)으로 검증한다.
- JWT의 `exp` 만료 시각이 지나도 {{fact:iam.oidc.jwt-clock-skew}} 안에 도착하면 시계 오차로 보고 받아 준다.

**모바일·웹 앱 사용자는 Amazon Cognito를 권장한다.** Cognito 사용자 풀이 가입·로그인을 맡고, 자격 증명 풀이 `AssumeRoleWithWebIdentity`로 사용자별 임시 자격 증명을 받아 준다. STS와 같은 IdP를 지원하면서 비인증(게스트) 접근과 기기 간 데이터 동기화도 제공한다. 앱이 IdP 토큰을 직접 STS에 넘기는 구조보다 관리할 것이 적다.

@topic iam/federation/roles-anywhere

AWS 밖의 서버·컨테이너 같은 **기계 워크로드** 에 장기 액세스 키를 나눠 주지 않으려면 **IAM Roles Anywhere** 를 쓴다. 조직의 인증 기관(CA)이 발급한 X.509 인증서로 워크로드를 인증하고, IAM 역할의 임시 자격 증명을 받게 한다. 온프레미스 데이터 센터나 다른 클라우드의 워크로드가 대상이다. 사람 사용자가 아니라 기계 신원을 위한 것이라는 점에서 SAML·OIDC 페더레이션과 쓰임이 다르다.

@topic iam/federation/outbound

**아웃바운드 자격 증명 페더레이션(outbound identity federation)** 은 방향이 반대다. AWS 워크로드가 **외부 서비스** 에 자기 신원을 증명한다. 최근 추가된 기능이라 시험 범위인지 확인되지 않았다.

1. 계정에서 이 기능을 켠다.
2. Lambda 함수 같은 워크로드가 STS `GetWebIdentityToken`을 불러 서명된 JWT를 받는다.
3. 워크로드가 그 JWT를 외부 서비스(다른 클라우드, SaaS, 자체 앱)에 보낸다.
4. 외부 서비스는 토큰의 발급자 URL에서 AWS의 검증 키를 받아 서명과 만료·주체·대상 클레임을 확인하고 접근을 준다.

외부 서비스용 API 키나 비밀번호를 코드·환경 변수에 둘 필요가 없어진다. 제약과 통제는 다음과 같다.

- 토큰 수명은 기본 {{fact:iam.outbound-token.default}}, 최대 {{fact:iam.outbound-token.max}}이고, 문서는 짧게 쓰라고 권한다.
- 호출하려면 `sts:GetWebIdentityToken` 권한이 있어야 한다. `sts:IdentityTokenAudience`(받을 서비스), `sts:DurationSeconds`(수명), `sts:SigningAlgorithm`(서명 알고리즘) 조건 키로 제한한다.
- STS 글로벌 엔드포인트에서는 부를 수 없다.
- 이 토큰은 AWS로 들어오는 OIDC 페더레이션(`AssumeRoleWithWebIdentity`)에는 쓸 수 없다.

@quiz

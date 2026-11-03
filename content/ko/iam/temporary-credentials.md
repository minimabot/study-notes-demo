---
chapter: iam/temporary-credentials
---

@topic iam/temporary-credentials/overview

**임시 보안 자격 증명(temporary security credentials)** 은 **AWS STS(AWS Security Token Service)** 가 요청을 받을 때마다 새로 만들어 주는 자격 증명이다. 쓰는 법은 IAM 사용자의 액세스 키와 거의 같다. 다른 점은 두 가지다.

- **수명이 짧다.** 몇 분에서 몇 시간 사이로 정한다. 만료되면 AWS는 그 자격 증명으로 서명한 요청을 더 이상 받지 않는다.
- **IAM 사용자에 붙어 보관되지 않는다.** 장기 액세스 키와 달리 요청할 때마다 새로 만들어 건넨다. 만료 전이든 후든, 요청할 권한이 남아 있으면 새로 받으면 된다.

임시 자격 증명은 액세스 키 ID, 보안 액세스 키, **세션 토큰(session token)** 세 가지로 이뤄진다. 요청에 세션 토큰이 함께 들어가야 한다.

이 성질 덕분에 얻는 것은 다음과 같다.

- 애플리케이션에 장기 자격 증명을 심거나 나눠 줄 필요가 없다.
- AWS 안에 사용자를 따로 만들지 않고도 외부 사용자에게 접근을 줄 수 있다. 역할({{ch:iam/roles}})과 페더레이션({{ch:iam/federation}})이 모두 이 위에서 돌아간다.
- 쓸 일이 끝나면 저절로 만료되므로 교체하거나 지울 일이 줄어든다.

임시 자격 증명이 쓰이는 대표 상황은 페더레이션, 다른 계정으로의 위임({{ch:iam/cross-account}}), EC2 인스턴스 역할 같은 AWS 서비스용 역할이다.

@topic iam/temporary-credentials/api-compare

IAM 문서가 비교하는 대표 STS API는 다섯 가지다. 누가 부르는지가 가장 크게 다르다. 이 밖에 멤버 계정의 루트 작업에만 쓰는 `sts:AssumeRoot`가 있는데, 이것은 {{ch:iam/identities}}에서 다룬다.

| API | 누가 부르나 |
|---|---|
| `AssumeRole` | IAM 사용자, 또는 이미 임시 자격 증명을 가진 역할 세션 |
| `AssumeRoleWithSAML` | 누구나. 알려진 SAML IdP가 인증했다는 SAML 응답을 함께 넘긴다 |
| `AssumeRoleWithWebIdentity` | 누구나. 알려진 OIDC IdP가 발급한 JWT를 함께 넘긴다 |
| `GetFederationToken` | IAM 사용자 또는 루트 사용자 |
| `GetSessionToken` | IAM 사용자 또는 루트 사용자 |

**유효 기간.** 표의 다섯 API 모두 최소 {{fact:iam.sts.duration.min}}이다.

| API | 기본 / 최대 |
|---|---|
| `AssumeRole*` 세 가지 | 기본 {{fact:iam.sts.role-session.default}}. 최대는 역할의 최대 세션 기간 설정(설정 상한 {{fact:iam.role.session.max}}) |
| `GetFederationToken`, `GetSessionToken` (IAM 사용자) | 기본 {{fact:iam.sts.user-session.default}} / 최대 {{fact:iam.sts.user-session.max}} |
| 같은 두 API (루트 사용자) | 기본·최대 모두 {{fact:iam.sts.root-session.max}} |

**MFA와 세션 정책.**

| API | MFA 정보 전달 | 세션 정책 |
|---|---|---|
| `AssumeRole` | 된다 | 된다 |
| `AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity` | 안 된다 (IdP 쪽에서 인증) | 된다 |
| `GetFederationToken` | 안 된다 | 된다 |
| `GetSessionToken` | 된다 | 안 된다 |

**받은 자격 증명으로 할 수 없는 일.**

- `AssumeRole*`로 받은 자격 증명: `GetFederationToken`, `GetSessionToken`을 부를 수 없다.
- `GetFederationToken`으로 받은 자격 증명: CLI·API로 IAM 작업을 할 수 없다(콘솔 세션은 예외). STS는 `GetCallerIdentity`만 부를 수 있다. 콘솔 SSO URL을 만드는 데는 쓸 수 있다.
- `GetSessionToken`으로 받은 자격 증명: 요청에 MFA 정보를 넣지 않았다면 IAM API를 부를 수 없다. STS는 `AssumeRole`과 `GetCallerIdentity`만 부를 수 있다. 콘솔 SSO에는 쓸 수 없다.

고르는 기준을 짧게 정리하면 이렇다. 다른 권한을 잠시 쓰려면 `AssumeRole`, 회사 IdP 사용자는 `AssumeRoleWithSAML`, 웹·모바일·CI 같은 OIDC 사용자는 `AssumeRoleWithWebIdentity`다. IAM 사용자가 MFA로 보호된 API를 CLI에서 부르려면 `GetSessionToken`에 MFA 정보를 넣는다. `GetFederationToken`은 직접 만든 자격 증명 브로커가 사용자 대신 부르는 용도다.

@topic iam/temporary-credentials/session-policies-tags

**세션 정책(session policy)** 은 역할 세션이나 페더레이션 사용자 세션을 만들 때 매개변수로 넘기는 정책이다. 세션의 권한은 **역할(또는 사용자)의 자격 증명 기반 정책과 세션 정책의 교집합** 이 된다. 세션 정책은 권한을 줄이기만 하고 늘리지는 못한다.

- `AssumeRole`, `AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`에서는 `Policy`로 인라인 JSON 하나, `PolicyArns`로 관리형 정책을 {{fact:iam.session-policy.managed-arns.max}}까지 넘긴다. 합친 평문 크기 한도는 {{fact:iam.session-policy.max-size}}다.
- `GetFederationToken`에서 세션 정책은 선택 매개변수지만 보통 함께 넘긴다. 사용자 정책과 세션 정책을 거쳐 생기는 권한은 두 정책의 교집합이다. 세션 정책 없이 부르면 사용자 정책만으로는 대개 세션에 권한이 생기지 않는다. 다만 같은 계정의 리소스 기반 정책이 그 페더레이션 사용자 세션 ARN을 직접 허용할 수는 있다. 명시적 거부 같은 다른 제한은 여전히 적용된다.
- 리소스 기반 정책이 역할이나 사용자의 ARN을 보안 주체로 지정했다면 그 허용도 세션 정책으로 걸러진다. 명시적 거부는 어느 정책에 있든 이긴다({{ch:iam/policy-evaluation}}).

**세션 태그(session tag)** 는 역할을 수임하거나 사용자를 페더레이션할 때 넘기는 키-값 속성이다. 세션으로 보낸 요청에는 `aws:PrincipalTag`로 들어가므로 ABAC 조건에 쓴다({{ch:iam/conditions-abac}}).

- 넘기는 방법: `AssumeRole`·`GetFederationToken`은 `Tags` 매개변수, SAML은 `PrincipalTag` 속성, OIDC는 토큰의 클레임.
- 콘솔의 역할 전환(Switch Role)으로는 넘길 수 없다.
- 해당 API 권한에 더해 `sts:TagSession` 권한이 있어야 한다. IdP가 태그를 넘기면 그 IdP와 연결된 모든 역할의 신뢰 정책에 `sts:TagSession`이 있어야 하고, 없으면 수임이 실패한다.
- 한도: 태그 {{fact:iam.session-tags.max}}, 키 {{fact:iam.session-tags.key-length.max}}, 값 {{fact:iam.session-tags.value-length.max}}. 값은 하나만 넣을 수 있다. 세션 정책과 세션 태그는 세션 토큰 크기를 키우고, 토큰이 한도를 넘으면 요청이 실패한다. 응답의 `SessionTokenUtilization`으로 사용률을 본다.

**역할 체인(role chaining)** 은 한 역할의 임시 자격 증명으로 다른 역할을 수임하는 것이다. 두 가지를 기억한다.

1. 체인으로 얻은 세션은 역할의 최대 세션 기간 설정과 관계없이 {{fact:iam.role.chaining.max-session}}으로 묶인다. 사용자 자격 증명으로 처음 역할을 수임할 때나 EC2 인스턴스 프로파일에는 이 제한이 없다.
2. 세션 태그는 기본으로 다음 세션에 넘어가지 않는다. **전이적(transitive)** 으로 지정한 태그만 체인을 따라 이어진다. `GetFederationToken`에서는 전이적 태그를 지정할 수 없다.

@topic iam/temporary-credentials/endpoints

STS에는 **글로벌 엔드포인트(global endpoint)** `sts.amazonaws.com`과 리전마다 있는 **리전 엔드포인트(Regional endpoint)** 가 있다. 리전 엔드포인트에서 받은 토큰은 모든 리전에서 쓴다. 글로벌 엔드포인트 토큰은 기본 설정으로는 기본으로 켜진 리전에서만 쓰이므로, 옵트인 리전에서 쓰려면 토큰 버전 설정을 바꿔야 한다(아래 표).

AWS는 리전 엔드포인트를 권장한다. 문서가 드는 이유는 세 가지다.

| 이유 | 내용 |
|---|---|
| 지연 시간 | 워크로드와 가까운 리전에서 응답한다 |
| 장애 격리 | 한 리전 문제의 영향 범위를 그 리전에 묶는다. 글로벌 엔드포인트는 다른 리전으로 자동 장애 조치하지 않는다 |
| 토큰 유효 범위 | 리전 엔드포인트 토큰은 모든 리전에서 쓴다. 글로벌 엔드포인트 토큰은 기본으로 켜진 리전에서만 쓰이므로, 옵트인 리전을 쓰려면 설정을 바꿔야 한다 |

기본으로 켜진 리전의 STS 엔드포인트는 IAM 콘솔의 계정 설정에서 끄고 켤 수 있다. 끄고 켜는 기준은 **자격 증명이 만들어지는 계정** 이다. 옵트인 리전은 리전을 활성화하면 STS도 자동으로 켜지고 끌 수 없다. 다른 계정의 역할을 옵트인 리전 엔드포인트로 수임하려면 역할이 있는 계정이 그 리전을 활성화해 두어야 한다. 누가 어느 리전을 쓰는지는 `aws:RequestedRegion` 조건으로 제한한다.

2025년에 글로벌 엔드포인트 동작이 바뀌었다. 기본으로 켜진 리전에서 Amazon DNS 서버로 이름을 풀면, 글로벌 엔드포인트 요청이 요청이 나온 그 리전에서 처리된다. 옵트인 리전이나 다른 DNS 리졸버를 쓰면 여전히 미국 동부(버지니아 북부)에서 처리된다. 바뀐 뒤에도 글로벌 엔드포인트 요청의 CloudTrail 로그는 `us-east-1`로 가고, `aws:RequestedRegion` 값은 `us-east-1`이다. 시험이 이 변경을 반영하는지는 확인되지 않았다. 리전 엔드포인트를 쓰라는 권장은 그대로다. 이 변경으로 글로벌 엔드포인트 요청은 리전 엔드포인트와 요청 할당량을 나눠 쓰지 않게 됐다. 할당량 페이지에는 아직 예정된 변경으로 적혀 있어 문서끼리 표현이 다르다.

STS 요청 할당량은 계정·리전 단위로 공유하며, AWS 자격 증명으로 부르는 요청의 기본값은 {{fact:iam.sts.rps}}다.

@topic iam/temporary-credentials/revoke-caller

임시 자격 증명은 만료 전까지 유효하다. 콘솔 세션을 길게 허용했는데 자격 증명이 새어 나갔다면, 만료를 기다리지 않고 **역할의 세션을 취소** 한다.

- IAM 콘솔에서 역할을 열고 **세션 취소(Revoke sessions)** 탭의 **활성 세션 취소** 를 고른다. IAM은 `AWSRevokeOlderSessions`라는 인라인 정책을 역할에 붙인다. 이 정책은 그 시점 이전에 수임한 세션의 모든 작업을 거부한다. 정책 전파 지연을 감안해 {{fact:iam.role.revoke.future-buffer}} 뒤까지 막는다.
- 누른 뒤 {{fact:iam.role.revoke.future-buffer}}가 지나서 새로 수임한 세션은 영향을 받지 않는다. 정당한 사용자는 그만큼 기다렸다가 다시 수임한다. 정책이 전파되는 데 지연이 있을 수 있다. CLI는 자격 증명을 캐시하므로 캐시를 지워야 새 자격 증명을 받는다.
- 이 거부는 그 역할의 모든 사용자에게 걸린다. 오래 열린 콘솔 세션만 골라 막지 않는다.
- 필요한 권한은 그 역할에 대한 `iam:PutRolePolicy`다. 서비스 연결 역할은 세션을 취소할 수 없다. IAM Identity Center 권한 세트가 만든 역할은 IAM에서 고칠 수 없으므로 Identity Center에서 취소한다.

직접 정책을 쓸 수도 있다. `aws:TokenIssueTime`이 특정 시각보다 이르면 모든 작업을 `Deny`하는 문장이다. 이 키는 임시 자격 증명으로 서명한 요청에만 있으므로, IAM 사용자의 장기 자격 증명 요청에는 영향이 없다.

```json
{ "Effect": "Deny", "Action": "*", "Resource": "*",
  "Condition": { "DateLessThan": { "aws:TokenIssueTime": "2026-11-03T00:00:00Z" } } }
```

**`GetCallerIdentity`** 는 지금 쓰는 자격 증명이 어느 계정의 어떤 보안 주체인지 알려 준다. 권한이 필요 없다. 정책에서 `sts:GetCallerIdentity`를 명시적으로 거부해도 호출된다. 거부당해도 같은 정보가 드러나기 때문이다. 역할 수임이 제대로 됐는지 확인할 때 가장 먼저 부른다.

@quiz

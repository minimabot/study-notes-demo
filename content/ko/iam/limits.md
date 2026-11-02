---
chapter: iam/limits
---

@topic iam/limits/object-quotas

IAM과 STS의 한도는 세 종류로 나뉜다. **개수 할당량** 은 일부를 올릴 수 있고, **글자 수·크기 한도** 는 올릴 수 없으며, **STS 요청 할당량** 은 따로 지원 티켓으로 올린다. 이 장은 참고표다. 각 수치가 왜 중요한지는 해당 장에서 다뤘다.

계정 단위 개수 할당량은 다음과 같다. 괄호 안이 올릴 수 있는 최대값이다.

| 항목 | 기본 (최대) |
|---|---|
| 역할 | {{fact:iam.quota.roles}} |
| 인스턴스 프로파일 | {{fact:iam.quota.instance-profiles}} |
| 그룹 | {{fact:iam.quota.groups}} |
| 고객 관리형 정책 | {{fact:iam.quota.customer-managed-policies}} |
| OIDC 공급자 | {{fact:iam.quota.oidc-providers}} |
| 서버 인증서 | {{fact:iam.quota.server-certificates}} |

엔터티 하나에 붙는 개수는 다음과 같다.

| 항목 | 값 |
|---|---|
| 역할에 연결하는 관리형 정책 | {{fact:iam.quota.managed-per-role}} |
| 사용자에 연결하는 관리형 정책 | {{fact:iam.quota.managed-per-user}} |
| 그룹에 연결하는 관리형 정책 | {{fact:iam.quota.managed-per-group}} |
| 사용자 하나의 액세스 키 | {{fact:iam.access-keys.per-user}} |
| 사용자·루트 하나의 MFA 디바이스 | {{fact:iam.mfa.devices.max}} |
| 인스턴스 프로파일 하나의 역할 | {{fact:iam.instance-profile.roles.max}} |
| 관리형 정책 하나의 저장 버전 | {{fact:iam.policy.versions.max}} |

그룹에 붙이는 관리형 정책 수와 서버 인증서 수는 기본값과 최대값이 같아 사실상 올릴 수 없다. 관리형 정책 수가 모자라면 정책을 합치거나, 사용자를 여러 그룹에 나눠 넣는 방식으로 설계를 바꾼다. 인라인 정책은 개수 제한이 없지만 아래의 합계 크기 제한이 있다.

지금 계정이 할당량을 얼마나 쓰는지는 `GetAccountSummary` API(CLI `aws iam get-account-summary`)로 본다.

@topic iam/limits/increase

**올리는 방법.** IAM 개수 할당량은 **Service Quotas** 콘솔에서 요청한다. 문서 절차대로 콘솔 상단에서 리전을 **미국 동부(버지니아 북부)** 로 바꾼 뒤 IAM을 검색한다.

- 최대값까지의 요청은 자동으로 승인되고 몇 분 안에 처리된다.
- 최대값을 넘는 값은 요청할 수 없다. 설계를 바꿔야 한다.
- STS 요청 할당량은 Service Quotas가 아니라 AWS Support 티켓으로 올린다.
- IAM Access Analyzer, IAM Roles Anywhere 할당량은 각 서비스의 할당량 표에 따로 있다. 예를 들어 Access Analyzer의 계정 수준 분석기는 유형별로 계정·리전당 {{fact:iam.access-analyzer.analyzers-per-account}}이고 올릴 수 없다({{ch:iam/access-analysis}}).

@topic iam/limits/names-sizes

글자 수와 크기 한도는 **올릴 수 없다.** 단, 역할 신뢰 정책 길이는 예외로 Service Quotas에서 올릴 수 있다.

**이름과 식별자**

| 항목 | 최대 길이 |
|---|---|
| 사용자 이름, 역할 이름 | {{fact:iam.name.user.max}}, {{fact:iam.name.role.max}} |
| 그룹 이름 | {{fact:iam.name.group.max}} |
| 정책 이름 | {{fact:iam.name.policy.max}} |
| 인스턴스 프로파일 이름 | {{fact:iam.name.instance-profile.max}} |
| 경로(path) | {{fact:iam.path.max}} |
| 역할 세션 이름 | {{fact:iam.role-session-name.max}} |
| 외부 ID | {{fact:iam.external-id.length}} |
| 계정 별칭 | {{fact:iam.account-alias.length}} |
| 태그 키 / 값 (IAM 리소스 태그와 세션 태그 공통) | {{fact:iam.session-tags.key-length.max}} / {{fact:iam.session-tags.value-length.max}} |
| IAM 고유 ID | {{fact:iam.unique-id.max}} |
| 사용자 암호 | {{fact:iam.password.max-length}} |

- 콘솔의 역할 전환(Switch Role)으로 쓸 역할은 경로와 역할 이름을 합쳐 {{fact:iam.name.role.max}}를 넘을 수 없다.
- 사용자·그룹·역할·인스턴스 프로파일 이름은 계정 안에서 대소문자를 구분하지 않고 유일해야 한다. `ADMINS`와 `admins`를 함께 만들 수 없다.
- 이름에는 영숫자와 `+ = , . @ _ -`만 쓴다. 경로는 `/`로 시작하고 끝난다.
- 계정 별칭은 소문자, DNS 이름 규칙을 따르고, 열두 자리 숫자만으로 된 별칭은 안 된다(계정 ID와 헷갈리기 때문이다).

**정책 크기.** IAM은 공백을 빼고 글자 수를 센다.

| 정책 | 한도 |
|---|---|
| 고객 관리형 정책 하나 | {{fact:iam.managed-policy.max-size}} |
| 사용자 인라인 정책 합계 | {{fact:iam.inline.user-size.max}} |
| 그룹 인라인 정책 합계 | {{fact:iam.inline.group-size.max}} |
| 역할 인라인 정책 합계 | {{fact:iam.inline.role-size.max}} |
| 역할 신뢰 정책 | {{fact:iam.quota.trust-policy-length}} |

인라인 정책은 여러 개 붙일 수 있지만, 한 엔터티에 붙은 인라인 정책 **전체의 합** 이 위 한도를 넘을 수 없다. 정책이 너무 크면 관리형 정책 여러 개로 나누거나, 와일드카드와 정책 변수로 문장을 줄인다({{ch:iam/policies}}).

@topic iam/limits/sts-sessions

임시 자격 증명과 세션 관련 한도다. 의미는 {{ch:iam/roles}}와 {{ch:iam/temporary-credentials}}에서 다뤘다.

| 항목 | 값 |
|---|---|
| 역할 최대 세션 기간 설정 | {{fact:iam.role.max-session.default}}부터 {{fact:iam.role.session.max}}까지 |
| `DurationSeconds` 최소 / 생략 시 | {{fact:iam.sts.duration.min}} / {{fact:iam.sts.role-session.default}} |
| 역할 체인 세션 | 최대 {{fact:iam.role.chaining.max-session}} |
| 세션 정책 (JSON + 관리형 정책 ARN 합계) | {{fact:iam.session-policy.max-size}} |
| 세션에 넘기는 관리형 정책 ARN | {{fact:iam.session-policy.managed-arns.max}} |
| 세션 태그 | {{fact:iam.session-tags.max}} |
| SAML 인증 응답 (base64) | {{fact:iam.saml-response.max}} |

세션 정책과 세션 태그는 위 한도와 별개로 **세션 토큰 크기** 한도도 차지한다. 응답의 `SessionTokenUtilization`이 토큰이 한도의 몇 퍼센트를 쓰는지 알려 준다. 예전의 `PackedPolicySize`는 더 쓰지 않는다. 콘솔은 세션 정보를 덧붙여 토큰을 키울 수 있으므로 세션 정책은 CLI·API로 넘기는 것이 권장이다.

**STS 요청 할당량.** AWS 자격 증명으로 부르는 STS 요청은 계정·리전당 {{fact:iam.sts.rps}}이 기본이다. `AssumeRole`, `GetCallerIdentity`, `GetSessionToken`, `GetFederationToken`, `GetAccessKeyInfo`, `DecodeAuthorizationMessage`가 이 할당량을 **함께** 쓴다.

- 예: 같은 리전에서 `GetCallerIdentity`와 `AssumeRole`을 함께 많이 부르면 두 호출 수가 합쳐서 계산된다.
- AWS 서비스 위탁자가 역할을 수임하는 요청(예: Lambda가 실행 역할을 수임)은 내 계정 할당량을 쓰지 않는다.
- 교차 계정 `AssumeRole`은 호출한 계정의 할당량만 쓴다. 대상 계정은 쓰지 않는다.
- 전역 엔드포인트가 바뀌면서, 기본으로 켜진 리전에서는 전역 엔드포인트 요청이 리전 엔드포인트와 할당량을 나눠 쓰지 않는다. 여러 리전에서 온 요청은 리전마다 따로 할당량을 받는다.

@quiz

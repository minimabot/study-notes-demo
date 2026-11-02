---
chapter: iam/roles
---

@topic iam/roles/basics

**IAM 역할(IAM role)** 은 계정 안에 만드는, 권한이 정해진 자격 증명이다. 권한 정책으로 할 수 있는 일이 정해진다는 점은 IAM 사용자와 같다. 다른 점은 두 가지다.

- 특정 한 사람에게 묶이지 않는다. 필요한 대상이 **수임(assume)** 해서 쓴다.
- 암호나 액세스 키 같은 장기 자격 증명이 없다. 수임하면 그 **역할 세션(role session)** 용 임시 자격 증명을 받는다(STS가 발급한다. {{ch:iam/temporary-credentials}}).

역할을 수임할 수 있는 대상은 다음과 같다.

- 같은 계정이나 다른 계정의 IAM 사용자
- 같은 계정의 다른 역할
- 서비스 위탁자(service principal): EC2·Lambda처럼 코드를 돌리는 서비스, S3 복제처럼 대신 작업하는 기능, IAM Roles Anywhere처럼 AWS 밖 애플리케이션에 자격 증명을 주는 서비스
- SAML 2.0·OIDC 호환 외부 IdP로 인증된 사용자({{ch:iam/federation}})

**역할에는 정책이 두 겹으로 붙는다.**

| 정책 | 정하는 것 |
|---|---|
| 신뢰 정책(trust policy) | **누가** 이 역할을 수임할 수 있는가. 역할에 반드시 하나만 붙는 리소스 기반 정책이다. `Principal`에 계정, 사용자, 역할, 서비스를 쓴다 |
| 권한 정책(permissions policy) | 수임한 뒤 **무엇을** 할 수 있는가. 일반 자격 증명 기반 정책(관리형·인라인)이다 |

신뢰 정책이 허용하지 않으면 권한 정책이 아무리 넓어도 아무도 쓸 수 없다. 반대로 신뢰 정책만 있고 권한 정책이 없으면 수임은 되지만 할 수 있는 일이 없다. 신뢰 정책의 `Principal` ARN에는 와일드카드(`*`)를 섞어 쓸 수 없다.

**위임(delegation).** 리소스를 가진 계정(신뢰하는 계정)에 역할을 만들고, 사용자가 있는 계정(신뢰받는 계정)을 신뢰 정책에 적는다. 그리고 신뢰받는 계정 쪽에서도 사용자에게 그 역할을 수임할 권한(`sts:AssumeRole`)을 준다. 양쪽이 모두 허용해야 한다. 역할을 수임한 사용자는 그동안 자기 원래 권한을 내려놓고 역할의 권한만 갖는다. 역할을 그만 쓰면 원래 권한으로 돌아온다. 소유 주체가 다른 계정 사이에서는 외부 ID(external ID)로 안전성을 높인다({{ch:iam/cross-account}}).

계정을 새로 만들면 역할은 하나도 없다. 서비스를 쓰기 시작하면 그 서비스가 서비스 연결 역할을 추가할 수 있다. 계정당 역할 수 기본 할당량은 {{fact:iam.quota.roles}}다.

@topic iam/roles/service-roles-passrole

AWS 서비스가 나를 대신해 일하게 할 때 쓰는 역할은 두 종류다.

| 구분 | 서비스 역할(service role) | 서비스 연결 역할(service-linked role) |
|---|---|---|
| 누가 만들고 고치나 | IAM 관리자가 만들고, 고치고, 지운다 | 서비스가 미리 정의한다. 관리자는 권한을 볼 수만 있고 고칠 수 없다 |
| 신뢰·권한 | 직접 정한다 | 서비스가 정한 신뢰 정책·권한 정책이 그대로 붙는다. 그 권한 정책은 다른 엔터티에 붙일 수 없다 |
| 생성 | 직접 만든다 | 서비스가 자동으로 만들기도 하고, 서비스 마법사나 IAM에서 만들기도 한다 |
| 삭제 | 직접 지운다 | 관련 리소스를 먼저 지워야 지울 수 있다. 권한이 실수로 사라지는 것을 막는다 |
| ARN 예 | `role/service-role/QuickSightAction`처럼 일반 역할과 같은 모양 | 언제나 `role/aws-service-role/<서비스 위탁자>/...` |

예: Amazon EC2 Auto Scaling은 처음 Auto Scaling 그룹을 만들 때 `AWSServiceRoleForAutoScaling` 서비스 연결 역할을 스스로 만든다. 서비스 연결 역할에는 권한 경계를 붙일 수 없고, 세션 취소도 할 수 없다. 계정에 새 서비스 연결 역할이 생겼다는 메일을 받았다면 서비스가 만든 것이므로 지우지 않는다.

**역할 전달(PassRole).** 많은 서비스는 설정할 때 역할을 넘겨받아 두었다가 나중에 그 역할을 수임한다. EC2 인스턴스를 띄우며 역할을 붙이거나, Lambda 함수를 만들며 실행 역할을 지정하는 것이 그렇다. 이때 역할을 넘기는 사람에게 **`iam:PassRole` 권한** 이 있어야 한다.

PassRole이 따로 있는 이유는 권한 상승을 막기 위해서다. S3 권한이 전혀 없는 Alice가 S3 전체 권한을 가진 역할을 서비스에 넘길 수 있다면, 서비스를 통해 S3를 마음대로 쓰게 된다. 그래서 다음처럼 좁힌다.

- `Resource`에 넘겨도 되는 역할 ARN만 적는다(예: 이름이 `EC2-roles-for-XYZ-`로 시작하는 역할만).
- `iam:PassedToService` 조건 키로 넘길 대상 서비스를 정한다(예: `ec2.amazonaws.com`).
- 보통 역할 정보를 볼 수 있게 `iam:GetRole`을 함께 준다.

주의할 점이 있다.

- PassRole은 같은 계정의 서비스에만 역할을 넘긴다. 다른 계정의 역할을 직접 넘길 수 없다.
- 역할에 태그를 달고 `ResourceTag` 조건으로 PassRole을 통제하는 방식은 결과가 일정하지 않다고 문서가 경고한다. ARN으로 좁힌다.
- 서비스 연결 역할을 직접 지정할 때도 PassRole 권한이 필요하다. 지정하지 않고 기본 역할을 쓰게 두면 필요 없다.

@topic iam/roles/ec2-lambda

AWS 안에서 도는 코드에 권한을 줄 때 장기 액세스 키를 심지 않는다. 역할을 쓰면 자격 증명이 임시이고 자동으로 바뀌므로 키를 배포·교체할 일이 없다.

**EC2: 인스턴스 프로파일(instance profile).** EC2 위의 애플리케이션은 가상화된 OS 안에 있어 역할을 바로 받을 수 없다. 그래서 역할을 담는 그릇인 인스턴스 프로파일을 인스턴스에 붙인다.

- 콘솔에서 EC2용 역할을 만들면 같은 이름의 인스턴스 프로파일이 자동으로 생긴다. EC2 콘솔에서 고르는 "IAM 역할" 목록도 사실은 인스턴스 프로파일 목록이다.
- CLI·API로는 역할과 인스턴스 프로파일을 따로 만들고, 역할을 프로파일에 넣은 뒤(`add-role-to-instance-profile`), 인스턴스를 띄울 때 프로파일 이름을 지정한다. 실행 중인 인스턴스에도 붙일 수 있다(`associate-iam-instance-profile`).
- 인스턴스 프로파일 하나에 담는 역할은 {{fact:iam.instance-profile.roles.max}}다. 그래서 한 인스턴스의 모든 애플리케이션이 같은 역할을 공유한다. 컨테이너마다 권한을 나누려면 ECS 작업 역할(task role)을 쓴다.
- 애플리케이션은 인스턴스 메타데이터의 `iam/security-credentials/<역할 이름>`에서 임시 자격 증명을 얻는다. SDK가 이를 알아서 처리하고, 만료 전에 새 자격 증명으로 바꿔 준다.
- 권한을 바꾸려면 역할의 권한 정책을 고치거나 인스턴스 프로파일을 교체한다. 프로파일에서 역할을 빼고 다른 역할을 넣는 방식은 반영까지 {{fact:iam.instance-profile.role-removal-delay}}이 걸릴 수 있어 권하지 않는다.
- 인스턴스를 역할과 함께 띄우는 사람에게는 EC2 실행 권한과 `iam:PassRole`이 필요하다. 계정당 인스턴스 프로파일 수 기본 할당량은 {{fact:iam.quota.instance-profiles}}다.

**Lambda: 실행 역할(execution role).** Lambda 함수에 붙이는 역할이다. 신뢰 정책에 `lambda.amazonaws.com`을 서비스 위탁자로 적고, 권한 정책에 함수가 쓸 리소스 권한을 적는다. Lambda가 함수를 호출할 때 이 역할을 스스로 수임하므로, 함수 코드에서 `sts:AssumeRole`로 실행 역할을 직접 수임하지 않는다. 콘솔에서 함수를 만들 때 기본으로 생기는 실행 역할은 CloudWatch Logs에 로그를 쓰는 최소 권한(`AWSLambdaBasicExecutionRole`)만 갖는다. DynamoDB 쓰기처럼 더 필요한 권한은 최소 권한으로 따로 붙인다.

같은 역할을 여러 인스턴스가 쓰면, 역할 하나만 고쳐도 모든 인스턴스에 반영된다는 장점도 있다.

@topic iam/roles/sessions

**최대 세션 기간(maximum session duration).** 역할마다 정하는 설정으로, 콘솔·CLI·API로 수임한 세션이 얼마나 갈 수 있는지의 상한이다. {{fact:iam.role.max-session.default}}부터 {{fact:iam.role.session.max}}까지 정할 수 있고, 정하지 않으면 {{fact:iam.role.max-session.default}}다. AWS 서비스가 수임하는 세션은 이 설정의 제한을 받지 않는다. 설정을 바꾸면 다음 수임부터 적용된다.

| 수임 방법 | 세션 길이 |
|---|---|
| CLI `--duration-seconds`, API `DurationSeconds` | {{fact:iam.sts.duration.min}}부터 그 역할의 최대 세션 기간까지 요청. 값을 안 주면 {{fact:iam.sts.role-session.default}} |
| 콘솔에서 역할 전환(IAM 사용자) | 역할의 최대 세션 기간과 사용자 콘솔 세션(기본 {{fact:iam.console.user-session}})의 남은 시간 가운데 짧은 쪽 |
| 역할 체인 | 최대 {{fact:iam.role.chaining.max-session}} |

**역할 체인(role chaining).** 역할의 임시 자격 증명으로 다른 역할을 수임하는 것이다. 사용자가 RoleA를 수임하고, RoleA의 자격 증명으로 RoleB를 수임하는 식이다. 역할 체인으로 얻은 세션은 각 역할의 최대 세션 기간과 관계없이 {{fact:iam.role.chaining.max-session}}을 넘을 수 없다. 체인에서 이보다 긴 `DurationSeconds`를 요청하면 줄여 주는 게 아니라 **호출이 실패한다**. 세션 태그를 전이(transitive)로 지정하면 체인의 다음 세션들로 이어진다.

**세션 취소(revoke sessions).** 세션을 길게 두면 자격 증명이 새어 나갔을 때 그만큼 오래 악용될 수 있다. 이미 발급된 임시 자격 증명은 지울 수 없으므로, 대신 "이 시각 전에 발급된 자격 증명은 모두 거부"하는 정책을 붙인다.

- 콘솔의 역할 화면에서 **활성 세션 취소** 를 누르면 IAM이 `AWSRevokeOlderSessions` 인라인 정책을 붙인다. `aws:TokenIssueTime` 조건으로, 누른 시점(전파 지연을 고려해 {{fact:iam.role.revoke.future-buffer}} 뒤까지) 이전에 수임한 세션의 모든 작업을 거부한다.
- 그 뒤에 새로 수임한 세션은 영향을 받지 않는다. 정당한 사용자는 다시 수임하면 된다. CLI는 자격 증명을 캐시하므로 캐시를 지워야 할 수 있다.
- 이 정책은 그 역할의 모든 사용자에게 걸린다. 콘솔 세션만 골라 막지 않는다.
- 이를 하려면 그 역할에 대한 `iam:PutRolePolicy` 권한이 있어야 한다.
- 서비스 연결 역할과 IAM Identity Center 권한 세트가 만든 역할은 여기서 취소할 수 없다. 권한 세트 세션은 Identity Center에서 취소한다.

@quiz

@design

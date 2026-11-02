---
chapter: iam/with-services
---

@topic iam/with-services/ec2-imds

이 장은 IAM을 실제 서비스에 붙일 때 자주 쓰는 모양을 모은다. 역할·정책의 기본 개념은 {{ch:iam/roles}}와 {{ch:iam/policies}}에 있으므로 여기서는 "어디에 무엇을 붙이는가"만 다룬다.

**EC2 인스턴스 프로파일과 IMDSv2.** EC2 위의 코드는 인스턴스 프로파일(instance profile)에 담긴 역할의 임시 자격 증명을 쓴다. 프로파일을 만들고 붙이는 방법은 {{ch:iam/roles}}에 있다. 여기서는 코드가 자격 증명을 **어디서 어떻게** 받는지를 본다.

자격 증명은 인스턴스 메타데이터 서비스(IMDS, Instance Metadata Service)의 `iam/security-credentials/<역할 이름>` 경로에서 나온다. IMDS에는 두 방식이 있다.

| 방식 | 요청 모양 |
|---|---|
| IMDSv1 | `GET` 한 번으로 바로 값을 읽는다 |
| IMDSv2 | 먼저 `PUT`으로 세션 토큰을 받고, 이후 `GET`마다 토큰 헤더를 붙인다 |

IMDSv2 토큰의 유효 시간은 {{fact:iam.imds.token-ttl.min}}부터 {{fact:iam.imds.token-ttl.max}}까지 정한다. 손으로 확인하면 다음과 같다.

```bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
# 붙은 역할 이름
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
# 그 역할의 임시 자격 증명(AccessKeyId, SecretAccessKey, Token, Expiration)
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/<역할 이름>
```

실무에서 정할 것:

- **IMDSv2만 쓰게 한다.** 인스턴스 메타데이터 옵션의 `HttpTokens`를 `required`로 두면 토큰 없는 IMDSv1 요청이 거부된다. 리전마다 계정 기본값을 IMDSv2로 정할 수도 있다. 이 기본값은 **새** 인스턴스에만 걸리고 이미 떠 있는 인스턴스는 바꾸지 않는다.
- **컨테이너가 있으면 응답 홉 제한(hop limit)을 본다.** 토큰 응답이 컨테이너까지 오려면 네트워크 홉을 하나 더 지나야 한다. 계정 기본값을 IMDSv2로 두면 홉 제한도 함께 `2`로 잡힌다. 홉 제한이 `1`이면 브리지 네트워크 컨테이너에서 토큰을 못 받는다.
- **코드에서 직접 curl하지 않는다.** AWS SDK가 토큰 발급, 자격 증명 조회, 만료 전 갱신을 알아서 한다. 최신 SDK는 IMDSv2를 먼저 쓰고, 일부 SDK는 IMDSv1로 되돌아가는(fallback) 동작을 설정으로 끌 수 있다.
- **역할은 인스턴스 단위다.** 한 인스턴스의 모든 프로세스가 같은 역할을 쓴다. 프로세스나 컨테이너마다 권한을 나누려면 ECS 작업 역할(task role)처럼 그 단위의 역할을 쓴다.

@topic iam/with-services/credential-chain

**SDK 자격 증명 공급자 체인(credential provider chain).** SDK와 AWS CLI는 자격 증명을 정해진 순서로 여러 곳에서 찾고, 처음 찾은 것을 쓴다. 체인의 정확한 순서는 SDK마다 조금씩 다르지만 대체로 다음 순서다.

| 순서 | 출처 |
|---|---|
| 1 | 코드나 명령 옵션에 직접 준 값 |
| 2 | 환경 변수(`AWS_ACCESS_KEY_ID` 등) |
| 3 | 공유 `config`·`credentials` 파일의 프로필(역할 수임, 웹 자격 증명, IAM Identity Center, 외부 프로세스 설정 포함) |
| 4 | 컨테이너 자격 증명(ECS 작업 역할, EKS) |
| 5 | EC2 인스턴스 메타데이터(인스턴스 프로파일) |

이 순서에서 나오는 실무 규칙:

- **앞쪽에 남은 키가 역할을 가린다.** EC2에 역할을 붙였는데도 권한 오류가 나면, 환경 변수나 `~/.aws/credentials`에 예전 액세스 키가 남아 있지 않은지 먼저 본다. 체인은 앞에서 찾으면 멈추므로 인스턴스 프로파일까지 가지 않는다.
- **지금 누구로 요청하는지는 `aws sts get-caller-identity`로 확인한다.** 결과의 ARN이 `assumed-role/<역할>/<인스턴스 ID>`면 인스턴스 프로파일이 쓰이고 있다.
- **AWS 안에서 도는 코드에는 키를 넣지 않는다.** EC2는 인스턴스 프로파일, Lambda는 실행 역할, ECS는 작업 역할을 쓰고 코드에는 자격 증명 설정을 두지 않는다. SDK가 체인에서 알아서 찾는다.
- **사람은 IAM Identity Center나 역할 수임 프로필을 쓴다.** `config` 파일의 프로필에 `role_arn`과 `source_profile`을 적으면 SDK가 `AssumeRole`을 대신 호출하고 갱신한다.
- 표준 공급자를 쓰면 SDK는 만료 전에 자격 증명을 자동으로 갱신한다. 임시 자격 증명을 직접 받아 코드에 고정하면 이 갱신이 사라진다.

@topic iam/with-services/lambda-invoke

**Lambda에는 정책이 두 갈래로 걸린다.** 둘을 섞으면 권한 오류를 엉뚱한 곳에서 찾게 된다.

| 구분 | 실행 역할(execution role) | 리소스 기반 정책(함수 정책) |
|---|---|---|
| 답하는 질문 | 함수가 **무엇을** 할 수 있나 | **누가** 함수를 호출할 수 있나 |
| 붙는 곳 | IAM 역할(신뢰 주체 `lambda.amazonaws.com`) | 함수(또는 별칭·버전) |
| 예 | DynamoDB 쓰기, SQS 읽기, 로그 쓰기 | S3·SNS·API Gateway가 함수를 호출 |

- 실행 역할은 {{ch:iam/roles}}에서 본 대로 Lambda가 수임한다. 함수가 SQS 대기열이나 Kinesis 스트림을 **폴링** 해 읽는 이벤트 소스 매핑은 Lambda가 실행 역할로 읽어 오므로 실행 역할에 읽기 권한이 필요하다({{ch:sqs/security}}, {{ch:kinesis/security}}).
- 반대로 S3·SNS·EventBridge처럼 다른 서비스가 함수를 **밀어 넣어** 호출하면 함수의 리소스 기반 정책에 그 서비스의 `lambda:InvokeFunction`을 허용한다. 콘솔에서 트리거를 붙이면 자동으로 들어가지만 CLI·IaC로 만들면 직접 넣어야 한다.

```bash
aws lambda add-permission --function-name thumb-fn \
  --statement-id s3-invoke --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::example-upload-bucket \
  --source-account 111122223333
```

- 서비스 위탁자에게 허용할 때는 `--source-arn`(그리고 S3처럼 ARN에 계정이 없는 경우 `--source-account`)으로 **어느 리소스가** 호출할 수 있는지 좁힌다. 좁히지 않으면 다른 계정의 버킷도 같은 서비스 이름으로 내 함수를 부를 수 있다(혼동된 대리자 문제, {{ch:iam/cross-account}}).
- 다른 계정의 역할이 함수를 직접 호출하게 할 때도 함수 정책에 그 계정이나 역할을 적고, 그쪽 계정에서도 IAM 정책으로 허용해야 한다.
- `add-permission`은 문을 하나씩 더한다. `put-resource-policy`는 정책 전체를 바꾸므로 앞서 더한 문이 사라진다.

**서비스 연결 역할(service-linked role).** 서비스가 정한 권한으로 서비스가 직접 쓰는 역할이다(예: Auto Scaling, IAM Access Analyzer). 사람이 권한을 고치지 않고, 관련 리소스를 지워야 역할을 지울 수 있다. 처음 그 기능을 쓸 때 자동으로 생기거나 `aws iam create-service-linked-role --aws-service-name <서비스 위탁자>`로 만든다. 만드는 사람에게는 `iam:CreateServiceLinkedRole` 권한이 필요하다. 일반 서비스 역할·PassRole과의 차이는 {{ch:iam/roles}}에 있다.

@topic iam/with-services/resource-policies

**S3 버킷 정책과 IAM 정책.** 둘 다 허용을 줄 수 있다. 같은 계정인지 다른 계정인지에 따라 필요한 것이 달라진다.

| 상황 | 필요한 허용 |
|---|---|
| 같은 계정 | 버킷 정책 **또는** IAM 정책 중 하나. 어디에도 거부가 없어야 한다 |
| 다른 계정 | 버킷 소유 계정의 버킷 정책 **그리고** 요청자 계정의 IAM 정책 |

교차 계정에서 B 계정의 역할이 A 계정 버킷을 읽는 예다. A 쪽 버킷 정책:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadFromAccountBAppRole",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::222233334444:role/app-reader" },
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::example-shared-data/*"
  }]
}
```

B 쪽 `app-reader` 역할의 권한 정책:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::example-shared-data/*"
  }]
}
```

- 버킷 정책에 B 계정 전체(`arn:aws:iam::222233334444:root`)를 적으면 B 계정의 관리자에게 위임한다는 뜻이다. B 안의 사용자·역할은 B의 IAM 정책으로 다시 허용받아야 한다. 판정 순서는 {{ch:iam/policy-evaluation}}에 있다.
- 교차 계정 접근에는 이 방식(리소스 기반 정책) 말고 A 계정에 역할을 두고 B가 수임하는 방식도 있다. 고르는 기준은 {{ch:iam/cross-account}}에 있다.
- 버킷 정책에 `aws:SourceVpce` 조건을 두면 특정 VPC 엔드포인트를 거친 요청만 받게 할 수 있다({{ch:vpc/endpoints-privatelink}}).

**KMS 키 정책.** KMS 키는 다른 리소스와 달리 **키 정책이 허용하지 않으면 IAM 정책만으로는 아무도 키를 쓸 수 없다.** 기본 키 정책의 첫 문은 계정 위탁자(`arn:aws:iam::<계정>:root`)에 `kms:*`를 주는데, 이것은 사용자 한 명에게 권한을 주는 것이 아니라 "이 계정은 IAM 정책으로 키 권한을 나눠 줘도 된다"는 뜻이다. 그래서 SSE-KMS로 암호화된 S3 객체를 다른 계정에서 읽으려면 버킷 정책과 요청자 IAM 정책 말고도 고객 관리형 키의 키 정책이 그 계정에 `kms:Decrypt`를 열어 줘야 한다. AWS 관리형 키(`aws/s3`)는 키 정책을 바꿀 수 없으므로 다른 계정에 열어 줄 수 없다.

같은 원리가 다른 서비스에도 있다. SQS 대기열 정책은 {{ch:sqs/security}}, DynamoDB 리소스 기반 정책은 {{ch:dynamodb/security}}, Kinesis 스트림 정책은 {{ch:kinesis/security}}에서 다룬다.

@topic iam/with-services/ci-oidc

**CI/CD에 액세스 키 대신 OIDC.** GitHub Actions 같은 외부 CI가 AWS에 배포하려면 예전에는 IAM 사용자 액세스 키를 CI 비밀 값에 넣었다. 키는 오래 살고, 유출되면 직접 지우기 전까지 쓰인다. OIDC 페더레이션을 쓰면 워크플로가 실행마다 받은 토큰(JWT)을 `AssumeRoleWithWebIdentity`로 임시 자격 증명과 바꾼다. 저장할 키가 없다. OIDC의 원리는 {{ch:iam/federation}}에 있다.

설정 순서:

1. IAM에 OIDC 자격 증명 공급자를 만든다. 공급자 URL은 `https://token.actions.githubusercontent.com`, 대상(audience)은 `sts.amazonaws.com`이다.
2. 그 공급자를 신뢰하는 역할을 만들고, 신뢰 정책에서 `aud`와 `sub`로 어느 리포지토리·브랜치만 수임할 수 있는지 좁힌다.
3. 역할의 권한 정책은 배포에 필요한 작업만 준다.
4. 워크플로에 OIDC 토큰 발급 권한(`id-token: write`)을 주고, 공식 액션 등으로 역할 ARN을 지정해 수임한다(GitHub 문서의 설정을 따른다).

신뢰 정책 예:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:example-org/web-app:ref:refs/heads/main"
      }
    }
  }]
}
```

- **`sub`를 반드시 좁힌다.** GitHub 공급자는 여러 조직이 함께 쓰는 공유 공급자다. `sub` 조건이 없거나 값이 와일드카드뿐이면 IAM이 신뢰 정책 생성·수정을 거부한다. 조직만 적고 리포지토리를 `*`로 두면 그 조직의 아무 리포지토리나 수임할 수 있다. 문서는 특정 리포지토리·브랜치로 좁히라고 권한다.
- GitHub 환경(environment)을 쓰면 환경에 보호 규칙을 두어 배포할 수 있는 브랜치를 제한하는 것도 권한다.
- 운영 배포 역할과 테스트 역할을 나누고 `sub` 값도 다르게 둔다. 예: 운영 역할은 `main` 브랜치만, 테스트 역할은 모든 브랜치.
- 이미 키를 쓰고 있다면 OIDC 역할로 옮긴 뒤 키를 비활성화하고, 자격 증명 보고서로 키의 마지막 사용 시점을 확인한 뒤 지운다({{ch:iam/labs}}).

@quiz

@design

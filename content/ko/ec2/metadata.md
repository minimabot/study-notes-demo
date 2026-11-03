---
chapter: ec2/metadata
---

@topic ec2/metadata/basics

**인스턴스 메타데이터(instance metadata)** 는 실행 중인 인스턴스가 자기 자신에 대해 알 수 있는 데이터다. 인스턴스 안에서 **인스턴스 메타데이터 서비스(IMDS, Instance Metadata Service)** 에 HTTP로 물어 얻는다.

| 엔드포인트 | 조건 |
|---|---|
| IPv4 `169.254.169.254` | IMDS를 켜면 기본으로 켜진다 |
| IPv6 `[fd00:ec2::254]` | 따로 켜야 한다. Nitro 기반 인스턴스, IPv6를 지원하는 서브넷에서만 |

두 주소 모두 링크 로컬 주소라 그 인스턴스 안에서만 닿는다. 경로는 `http://169.254.169.254/latest/meta-data/...`처럼 쓴다. 버전 대신 `latest`를 쓰면 새 메타데이터 빌드가 나와도 코드를 고치지 않아도 된다.

IMDS로 얻는 것:

| 종류 | 예 |
|---|---|
| 메타데이터 항목 | `ami-id`, `instance-id`, `instance-type`, `local-ipv4`, `placement/availability-zone`, `security-groups`, `iam/security-credentials/<역할 이름>`, `events/maintenance/scheduled`, `spot/instance-action` |
| 동적 데이터 | 인스턴스 자격 증명 문서(instance identity document) |
| 사용자 데이터 | 띄울 때 넣은 사용자 데이터(`/latest/user-data`, {{ch:ec2/launch-user-data}}) |

- IMDS 요청에는 요금이 없다.
- 링크 로컬 주소를 쓰는 서비스(IMDS, Route 53 Resolver DNS, NTP 등)는 합쳐서 인스턴스당 {{fact:ec2.linklocal.pps}} 한도가 있다. 메타데이터를 매번 새로 부르지 말고 필요한 값은 캐시한다.
- 태그도 메타데이터로 읽을 수 있지만, 인스턴스 메타데이터 옵션에서 따로 허용해야 한다.
- **메타데이터와 사용자 데이터는 인증이나 암호화로 보호되지 않는다.** 인스턴스에 접근할 수 있는 사람과 인스턴스에서 도는 소프트웨어가 읽을 수 있다. 그래서 민감한 값을 사용자 데이터에 두지 않고, 메타데이터 접근 자체도 아래처럼 좁힌다.

@topic ec2/metadata/imdsv2

IMDS에는 두 방식이 있다. 기본으로 둘 다 받는다.

| 구분 | IMDSv1 | IMDSv2 |
|---|---|---|
| 방식 | 요청·응답. `GET`만 보내면 된다 | 세션 기반. 먼저 `PUT`으로 토큰을 받고, 그 토큰을 헤더에 넣어 `GET` |
| 토큰 | 없음 | 인스턴스 전용. 다른 인스턴스에서는 거부된다 |
| 막는 것 | — | 열린 방화벽, 리버스 프록시, SSRF(서버 측 요청 위조) 같은 경로로 메타데이터가 새는 것을 줄인다 |

**IMDSv2 순서.**
1. `PUT /latest/api/token`에 헤더 `X-aws-ec2-metadata-token-ttl-seconds`로 토큰 수명(TTL)을 준다. {{fact:ec2.imds.token.ttl.min}}~{{fact:ec2.imds.token.ttl.max}}이다.
2. 받은 토큰을 `X-aws-ec2-metadata-token` 헤더에 넣어 `GET`한다. 토큰이 만료될 때까지 다시 쓴다. 만료되면 새로 `PUT`한다.
3. IMDSv2가 필수(`HttpTokens=required`)인데 토큰이 없거나 만료되면 `401 Unauthorized`가 돌아온다.

토큰 방식이 도움이 되는 이유: 토큰을 받으려면 먼저 `PUT`을 보내야 하고, `X-Forwarded-For` 헤더가 붙은 `PUT`은 거부되며, 토큰 응답은 홉 제한 때문에 인스턴스 밖으로 멀리 가지 못한다. 그래서 앱이 받은 URL을 대신 `GET`하게 만드는 SSRF나 열린 리버스 프록시만으로는 메타데이터를 얻기 어려워진다.

**홉 제한(hop limit).** `PUT` 응답 패킷이 지날 수 있는 네트워크 홉 수다. 기본은 {{fact:ec2.imds.hop.default}}이고 최대 {{fact:ec2.imds.hop.max}}까지 정한다. 홉 제한이 낮으면 토큰이 인스턴스 밖으로 나가지 못한다.

- **컨테이너 주의.** 브리지 네트워크 등으로 인스턴스 위에서 도는 컨테이너에서 IMDS로 가는 것은 홉이 하나 더 붙는다. 홉 제한이 {{fact:ec2.imds.hop.default}}이면 컨테이너는 토큰을 받지 못한다. IMDSv2를 요구하는 SDK는 응답을 못 받고, 일부 SDK는 재시도 뒤 IMDSv1로 떨어져 지연이 생긴다.
- 문서가 권하는 대처: 리전 같은 설정은 컨테이너에 직접 넘기거나, 컨테이너가 IMDS를 꼭 써야 하면 홉 제한을 {{fact:ec2.imds.hop.container}}로 올린다. 필요 이상으로 올리면 토큰이 더 멀리 갈 수 있으니 높게 잡지 않는다.

**SDK.** 최신 AWS SDK와 CLI는 기본으로 IMDSv2를 쓴다. 오래된 SDK를 쓰는 앱이 있다면 IMDSv2를 필수로 바꾸기 전에 올린다.

@topic ec2/metadata/defaults-policy

인스턴스마다 정하는 메타데이터 옵션은 다음과 같다. 실행 중이든 중지 중이든 바꿀 수 있다.

| 옵션 | 값 |
|---|---|
| IMDS | 켬 / 끔. 끄면 어떤 코드도 메타데이터를 읽지 못한다 |
| IPv6 엔드포인트 | 켬 / 끔 |
| 메타데이터 버전(`HttpTokens`) | `optional`(v1·v2 모두) / `required`(v2만) |
| 응답 홉 제한(`HttpPutResponseHopLimit`) | 위 범위의 정수 |
| 메타데이터의 태그 접근 | 켬 / 끔 |

**어디서 정하나.** 세 곳에서 정하고, 시작할 때 옵션마다 따로 우선순위를 따진다.

| 우선순위 | 위치 | 내용 |
|---|---|---|
| 1 | 시작할 때 인스턴스 설정 | 시작 템플릿이나 시작 파라미터에 준 값 |
| 2 | 계정 기본값(리전별) | 리전마다 계정 기본 IMDS 설정을 둔다. 새로 띄우는 인스턴스에만 적용되고, 있는 인스턴스는 바뀌지 않는다 |
| 3 | AMI | `imds-support`(`ImdsSupport`)를 `v2.0`으로 등록한 AMI로 띄우면 IMDSv2 필수, 홉 제한 {{fact:ec2.imds.hop.container}}가 된다. `HttpTokens`와 홉 제한에만 적용된다 |

- Amazon Linux 2023 AMI는 `ImdsSupport=v2.0`이라 기본으로 IMDSv1이 꺼져 있다.
- 계정 기본값을 IMDSv2로 두면 콘솔에서 새 인스턴스는 "V2 only"와 홉 제한 {{fact:ec2.imds.hop.container}}로 뜬다. 컨테이너를 돌리지 않으면 홉 제한은 "기본 설정 없음"으로 둔다.
- 여러 계정·리전에 한 번에 적용하려면 AWS Organizations의 선언적 정책(declarative policy)을 쓴다. 이때 계정 안에서 직접 바꿀 수 없다.

**IAM 정책으로 강제.**
- `ec2:MetadataHttpTokens` 조건으로 `required`가 아닌 인스턴스를 띄우거나 그렇게 바꾸지 못하게 한다. `ec2:MetadataHttpPutResponseHopLimit`로 홉 제한 상한을 둔다. 조건에 맞지 않는 호출은 `UnauthorizedOperation`으로 실패한다.
- `ec2:RoleDelivery`를 `2.0`으로 요구하면, IMDSv1으로 받은 역할 자격 증명으로 부른 API가 거부된다. IAM 정책이나 SCP에 쓴다.
- `ModifyInstanceMetadataOptions`를 쓸 수 있는 주체를 줄여, 설정을 되돌리지 못하게 한다.

**IMDSv2로 옮기는 순서(문서 권장).**
1. IMDSv1을 허용하는 인스턴스를 찾고 IMDSv1 사용을 조사한다. CloudWatch 지표 `MetadataNoToken`(IMDSv1 호출 수)을 보고, 오픈 소스 IMDS Packet Analyzer로 어떤 프로세스가 IMDSv1을 부르는지 찾는다.
2. 소프트웨어(SDK, 에이전트)를 IMDSv2를 쓰도록 올린다. `MetadataNoToken`이 0이 되는지 본다.
3. 인스턴스에서 IMDSv2를 필수로 바꾼다. 그 뒤 거부된 IMDSv1 호출은 `MetadataNoTokenRejected`로 본다.
4. 계정 기본값을 IMDSv2 필수로 둔다.
5. 새 인스턴스에 IMDSv2를 강제한다(다음 절, 또는 위 IAM 조건).

**로컬 방화벽으로 좁히기.** IMDS가 필요 없는 프로세스는 OS 방화벽(Linux iptables의 `owner` 모듈 등)으로 `169.254.169.254` 접근을 막는다. 특정 사용자만 허용하는 허용 규칙 방식이 나중에 소프트웨어가 바뀌어도 실수로 열릴 가능성이 낮다. iptables 규칙은 기본으로 재부팅 뒤 남지 않으므로 따로 영구화한다.

@topic ec2/metadata/enforcement

2025년 이후 추가된 기능이다. 시험 범위인지 알 수 없다.

- **계정 수준 IMDSv2 강제(IMDSv2 enforcement).** 리전마다 켠다. 켜면 IMDSv2 필수로 설정된 인스턴스만 뜬다. 인스턴스 설정, 계정 기본값, AMI 중 어디에서도 `HttpTokens=required`가 정해지지 않으면 시작이 실패한다. 우선순위로 설정을 정한 다음에 검사한다. 모든 소프트웨어가 IMDSv2를 쓰고 기본값을 `required`로 바꾼 뒤에 켜라고 문서가 권한다. 강제를 되돌리지 못하게 `ModifyInstanceMetadataDefaults` 권한을 IAM으로 막는다.
- **CloudWatch 지표 `ImdsV1Enabled`.** 호출이 있을 때만 나오는 `MetadataNoToken`과 달리, 인스턴스 설정을 보고 IMDSv1을 허용하는 인스턴스면 값을 낸다. 합계를 보면 IMDSv1이 열린 인스턴스 수를 계정·리전마다 알 수 있다.

@topic ec2/metadata/identity-credentials

**인스턴스 프로파일 자격 증명.** 인스턴스에 IAM 역할(인스턴스 프로파일)을 붙이면, 인스턴스의 앱은 IMDS의 `iam/security-credentials/<역할 이름>`에서 **임시 보안 자격 증명** 을 받는다({{ch:iam/roles}}).

- 자격 증명은 임시이고 AWS가 자동으로 바꾼다. 이전 것이 만료되기 최소 {{fact:ec2.imds.cred.refresh}} 전에 새 것이 나온다.
- AWS SDK, AWS CLI, Tools for Windows PowerShell은 이 값을 알아서 가져다 쓴다. 코드에 액세스 키를 넣지 않는다.
- 같은 역할을 다시 `sts:AssumeRole`할 필요가 없다. 세션 태그나 세션 정책이 필요할 때만 그렇게 하며, 그때는 역할이 자기 자신을 맡도록 신뢰 정책에 허용해야 한다.
- 역할에는 앱에 필요한 권한만 준다. 메타데이터가 새면 그 권한이 그대로 넘어가기 때문이다.
- 주의: 앱 대신 HTTP 호출을 하는 소프트웨어(HTTP 프록시, HTML/CSS 검사기, XML 포함을 처리하는 XML 처리기 등)가 자격 증명을 밖으로 노출하지 않게 한다. IMDSv2 필수와 홉 제한이 이런 경로를 줄인다.

`identity-credentials/ec2/security-credentials/ec2-instance`에는 별도의 **인스턴스 자격 증명 역할** 자격 증명이 있다. EC2 Instance Connect, Systems Manager 기본 호스트 관리 같은 기능에 인스턴스가 자신을 밝히는 용도이고, 정책이 붙지 않아 다른 API 권한이 없다.

**인스턴스 자격 증명 문서(instance identity document).** IMDS의 동적 데이터로 얻는 평문 JSON이다. 인스턴스를 띄우거나, 중지 후 시작하거나, 재시작할 때 만들어진다.

- 담는 값: 계정 ID, 리전, 가용 영역, 인스턴스 ID, 인스턴스 유형, AMI ID, 아키텍처, 프라이빗 IP, 시작 시각, Marketplace 제품 코드 등.
- 문서와 함께 서명이 세 가지(base64 인코딩 서명, PKCS7, RSA-2048) 있다. AWS 공개 인증서로 서명을 검증하면 문서가 진짜 그 인스턴스에서 나왔는지 확인할 수 있다.
- 쓰는 곳: 인스턴스가 외부 서비스(라이선스 서버, 등록 서비스 등)에 "나는 이 계정의 이 인스턴스다"를 증명할 때. 인스턴스 자신의 속성을 검증할 때.

@quiz

@design

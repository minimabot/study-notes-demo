---
chapter: lambda/configuration
---

@topic lambda/configuration/memory-architecture

**메모리(Memory)** 는 함수가 실행 중에 쓸 수 있는 메모리 양이다. Lambda에는 CPU를 따로 고르는 설정이 없다. CPU 성능은 메모리 설정에 비례해 배정된다. 그래서 메모리가 함수 성능을 조절하는 가장 큰 손잡이다.

- 범위: {{fact:lambda.memory.min}}부터 {{fact:lambda.memory.max}}까지, MB 단위로 정한다. 기본값은 가장 낮은 {{fact:lambda.memory.min}}이다.
- 메모리를 {{fact:lambda.memory.one-vcpu}}로 두면 vCPU 하나에 해당하는 CPU를 받는다.
- 문서는 최솟값을 이벤트를 변환해 다른 서비스로 넘기는 정도의 단순한 함수에만 쓰라고 권한다.
- 라이브러리나 계층을 많이 불러오거나, S3·EFS와 데이터를 주고받는 함수는 메모리를 늘리면 빨라질 수 있다. CPU, 네트워크, 메모리 어느 쪽이 병목이어도 메모리를 늘리는 것이 해법이 된다.

**알맞은 값 찾기.**

| 방법 | 내용 |
|---|---|
| CloudWatch 관찰 | 메모리 사용량이 설정값에 가까워지면 경보를 건다. CPU·I/O 병목은 실행 시간(Duration)으로 본다 |
| AWS Lambda Power Tuning | 오픈 소스 도구다. Step Functions로 같은 함수를 여러 메모리 값으로 실제 실행해 성능을 비교한다. CI/CD에 넣어 새 함수마다 잴 수 있다 |
| AWS Compute Optimizer | 옵트인하면 메모리 설정 추천을 받고 Lambda 콘솔에서 바로 적용할 수 있다. x86_64 함수만 지원한다 |

**명령 세트 아키텍처(instruction set architecture).** 함수를 돌릴 프로세서 종류다.

| 아키텍처 | 특징 |
|---|---|
| arm64 | AWS Graviton 프로세서. 같은 함수를 x86_64로 돌릴 때보다 가격 대비 성능이 크게 나을 수 있다. 대부분의 리전에서 쓸 수 있다 |
| x86_64 | x86 계열 프로세서. 기본 선택지 |

arm64로 옮길 때 확인할 것은 다음과 같다.

- 업로드한 코드, 서드 파티 라이브러리, 계층, 확장, 컨테이너 이미지가 모두 arm64용이어야 한다. 콘솔 편집기로만 쓴 코드는 대개 그대로 돌아간다.
- 문서는 의존성 목록을 만들고, 테스트하고, 두 아키텍처 성능을 비교한 뒤 단계적으로 배포하라고 한다. 별칭의 가중치 라우팅으로 트래픽을 나눠 비교할 수 있다({{ch:lambda/versions-aliases}}).
- 특정 Graviton 세대를 보장하지 않는다. 코드는 arm64 호환이기만 하면 된다.

@topic lambda/configuration/timeout-storage

**제한 시간(Timeout).** 함수가 한 번 호출에 실행될 수 있는 최대 시간이다. 이 시간을 넘으면 Lambda가 실행을 멈추고 오류로 처리한다.

- 기본값은 {{fact:lambda.timeout.default}}이고, {{fact:lambda.timeout.min}} 단위로 최대 {{fact:lambda.timeout.max}}까지 늘릴 수 있다.
- 제한 시간을 평균 실행 시간에 가깝게 잡으면 가끔 느린 호출이 시간 초과로 실패한다. 실행 시간은 처리할 데이터 양과 호출하는 다른 서비스의 지연에 따라 달라진다. S3에서 평소보다 큰 객체를 받거나, 외부 서비스 응답이 늦거나, 입력이 복잡할 때가 대표적이다.
- 테스트할 때는 작은 표본이 아니라 실제로 예상되는 상한 크기의 데이터를 쓴다.
- 함수를 SQS 이벤트 소스로 쓸 때는 큐의 가시성 제한 시간을 함수 제한 시간의 {{fact:lambda.sqs.vt-multiplier}}로 잡는다({{ch:sqs/integrations}}).

**임시 스토리지(Ephemeral storage).** 함수는 `/tmp` 디렉터리를 쓸 수 있다. 실행 환경마다 따로 있고, 환경이 사라지면 내용도 사라진다. 저장된 데이터는 AWS 관리형 키로 저장 시 암호화된다.

- 크기는 {{fact:lambda.tmp.min}}(기본값)부터 {{fact:lambda.tmp.max}}까지 MB 단위로 정한다.
- 늘리면 좋은 경우: 중간 결과를 파일로 쓰는 ETL, S3에서 큰 모델·참조 파일을 받아 쓰는 ML 추론, 큰 객체·PDF·미디어·위성 이미지 처리.
- 같은 실행 환경이 재사용되면 앞 호출이 남긴 파일이 남아 있을 수 있다. 캐시로 쓸 수는 있지만 반드시 있다고 가정하면 안 된다.

**파일 시스템(EFS).** 여러 실행 환경이 같은 파일을 함께 읽고 써야 하거나, `/tmp`보다 크고 오래가는 저장소가 필요하면 Amazon EFS 파일 시스템을 로컬 디렉터리에 마운트한다.

- 함수가 VPC에 연결되어 있어야 하고, 함수가 연결되는 가용 영역마다 마운트 대상이 있어야 한다. 문서는 가용 영역을 둘 이상 쓰라고 권한다.
- 보안 그룹에서 NFS(포트 2049) 트래픽을 허용한다.
- 함수는 액세스 포인트를 통해 연결한다. 루트가 아닌 경로를 쓰는 액세스 포인트가 성능에 좋다.
- 파일 시스템에 사용자 정의 IAM 정책이 있으면 실행 역할에 `elasticfilesystem:ClientMount`(쓰기까지 하면 `ClientWrite`)가 필요하다.
- 문서에는 S3 버킷을 파일 시스템처럼 마운트하는 Amazon S3 Files도 있다. 한 함수에 EFS와 S3 Files를 함께 붙일 수는 없다. 최근에 추가된 기능이라 여기서는 이름만 적는다.

@topic lambda/configuration/envvars-secrets

**환경 변수(Environment variables).** 코드를 고치지 않고 함수 동작을 바꾸는 키-값 문자열이다. 같은 코드로 함수를 둘 만들고, 하나는 테스트 DB, 하나는 운영 DB 주소를 환경 변수로 주는 식으로 쓴다. 로그 수준(`LOG_LEVEL`)을 바꾸는 것도 흔한 예다.

- 환경 변수는 버전별 설정이다. 게시 전 버전(`$LATEST`)에서 정하고, 버전을 게시하면 그 버전에 고정된다({{ch:lambda/versions-aliases}}).
- 키는 글자로 시작하는 두 글자 이상, 영문·숫자·밑줄만 쓴다. 전체 크기 합계는 {{fact:lambda.envvars.max-size}}를 넘을 수 없다.
- 값은 그대로의 문자열이다. Lambda가 다른 변수를 펼쳐 주지 않으므로 필요한 계산은 코드에서 한다.
- CLI `update-function-configuration`은 `Variables` 전체를 바꾼다. 하나만 추가해도 기존 값을 모두 함께 보내야 한다.
- `AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, `_HANDLER`처럼 런타임이 정하는 예약 변수는 직접 설정할 수 없다. 실행 역할의 임시 자격 증명도 예약 변수로 들어온다.

**암호화.**

| 구분 | 내용 |
|---|---|
| 저장 시 암호화 | 항상 켜져 있다. 기본은 AWS 관리형 키로, 설정할 것도 요금도 없다. 키 교체를 직접 관리하거나 조직 규정이 있으면 고객 관리형 키(KMS)를 지정한다(`KMSKeyArn`) |
| 전송 중 암호화 | 선택이다. 콘솔의 암호화 도우미로 값을 클라이언트 측에서 암호화한다. 함수 코드가 값을 직접 복호화하므로 실행 역할에 `kms:Decrypt`가 필요하다 |

고객 관리형 키를 쓰면 그 키에 접근할 수 있는 사람만 환경 변수를 보고 고칠 수 있다. `kms:Decrypt`가 없는 사용자는 함수를 관리할 수는 있어도 환경 변수 값은 볼 수 없다. 특정 사용자에게 값을 숨기려면 그 키에 대한 거부 문장을 붙인다.

**비밀 값은 환경 변수에 두지 않는다.** 문서는 DB 자격 증명, API 키, 토큰 같은 민감한 값은 환경 변수 대신 AWS Secrets Manager에 두라고 권한다. 함수에서 꺼내 쓰는 방법은 두 가지다.

- AWS Parameters and Secrets Lambda Extension: 런타임과 관계없이 로컬 HTTP 엔드포인트로 Secrets Manager 비밀과 Systems Manager Parameter Store 파라미터를 가져온다. 값을 캐시하므로(기본 {{fact:lambda.secrets-extension.cache-ttl}}) 호출마다 API를 부르지 않는다. 확장은 계층으로 붙인다.
- Powertools for AWS Lambda의 parameters 유틸리티: 코드 안에서 Secrets Manager, Parameter Store, AppConfig를 함께 다룬다.

@topic lambda/configuration/streaming-tags

**응답 스트리밍(Response streaming).** 함수가 응답을 다 만들 때까지 기다리지 않고 만드는 대로 클라이언트에 흘려보낸다. 첫 바이트가 빨리 도착하고(TTFB), 응답 전체를 메모리에 담을 필요가 없어 큰 응답에 유리하다.

- 함수 URL, `InvokeWithResponseStream` API, API Gateway 프록시 통합으로 쓴다. 관리형 런타임은 Node.js가 지원한다. 다른 언어는 사용자 지정 런타임이나 Lambda Web Adapter를 쓴다.
- 앞쪽 {{fact:lambda.streaming.uncapped}}는 대역폭 제한 없이 나가고, 그 뒤는 최대 {{fact:lambda.streaming.rate}}로 나간다. 스트리밍 응답 최대 크기는 {{fact:lambda.streaming.max}}다.
- 클라이언트 연결이 끊겨도 함수는 멈추지 않고 끝까지 돌며 그만큼 요금이 나간다. 제한 시간을 길게 잡을 때 주의한다.
- VPC 안에서는 함수 URL로 스트리밍할 수 없다. SDK의 `InvokeWithResponseStream`과 Lambda 인터페이스 VPC 엔드포인트를 쓴다.

**태그(Tags).** 함수에 붙이는 키-값 쌍이다. 비용 분류, 리소스 정리, 콘솔 필터에 쓰고, 속성 기반 접근 제어(ABAC)의 조건으로도 쓴다.

- 태그는 함수 단위로 붙는다. 버전·별칭에 따로 붙지 않고, 버전을 게시할 때 고정되는 버전별 설정에도 들어가지 않는다.
- 필요한 권한은 `lambda:TagResource`(태그 달기·생성 시 태그), `lambda:ListTags`(태그 보기)다. 태그가 있는 함수에 `GetFunction`을 부를 때도 `ListTags` 권한이 필요하다. 지우려면 `lambda:UntagResource`를 준다.

@quiz

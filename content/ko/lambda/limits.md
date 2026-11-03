---
chapter: lambda/limits
---

@topic lambda/limits/how-quotas-work

이 장은 Lambda 할당량(quota)을 한곳에 모은 참고표다. 각 값의 뜻과 쓰임은 링크한 장에서 다룬다.

**두 종류.** 할당량에는 늘려 달라고 요청할 수 있는 것(soft limit)과 바꿀 수 없는 것(hard limit)이 있다. 현재 값, 사용량, 증가 요청은 Service Quotas 콘솔에서 본다. 동시 실행 수와 코드 저장 공간은 **리전마다** 따로 센다. ENI 할당량은 **VPC마다** 센다.

**늘릴 수 있는 것.**

| 항목 | 기본값 |
|---|---|
| 동시 실행 수 | {{fact:lambda.concurrency.account.default}} ({{ch:lambda/concurrency}}) |
| VPC당 탄력적 네트워크 인터페이스 | {{fact:lambda.vpc.eni-per-vpc}} ({{ch:lambda/networking}}) |
| 실행 환경 네트워크 대역폭 | {{fact:lambda.network.bandwidth}}. VPC에 연결하지 않은 함수만 증가 요청. 승인되면 메모리에 비례해 {{fact:lambda.network.bandwidth.increased-max}}까지 |
| 이벤트 소스 매핑 필터 수 | {{fact:lambda.esm.filters.default}}, 최대 {{fact:lambda.esm.filters.max}} ({{ch:lambda/event-source-mappings}}) |

**새 계정은 낮게 시작한다.** 새 AWS 계정은 동시성과 메모리 할당량이 기본값보다 낮을 수 있고, 사용량에 따라 AWS가 자동으로 올린다. 큰 부하 시험 전에 Service Quotas에서 실제 값을 확인한다.

**늘릴 수 없는 것의 대표.** 코드 저장 공간 {{fact:lambda.code-storage.max}}가 있다. 함수 버전과 계층 버전이 하나하나 공간을 차지한다. 쓰지 않는 버전·계층 버전을 지우거나, 문서가 안내하는 대로 코드를 자체 관리 S3 저장소에 두는 방식으로 피한다({{ch:lambda/packaging-runtimes}}).

**한도에 다가갈 때 알림 받기.** `ClaimedAccountConcurrency`를 `SERVICE_QUOTA(ConcurrentExecutions)`로 나눈 사용률에 경보를 걸면 동시성 한도 증가를 미리 요청할 수 있다({{ch:lambda/concurrency}}). Service Quotas 콘솔도 사용률 경보를 지원한다.

**다른 서비스와 맞추기.** Lambda 앞뒤 서비스도 각자 할당량이 있다. 예를 들어 API Gateway의 기본 스로틀 한도는 Lambda의 기본 동시성보다 크다. 그래서 API Gateway가 받은 요청을 Lambda가 다 처리하지 못할 수 있다. 예상 트래픽에 맞게 Lambda 동시성 증가를 요청하고, 운영 전에 부하 시험으로 어느 한도가 먼저 걸리는지 확인한다({{ch:lambda/function-urls}}).

@topic lambda/limits/function-config

함수 구성·배포·실행 한도다. 따로 적지 않은 것은 바꿀 수 없다.

| 항목 | 한도 |
|---|---|
| 메모리 | {{fact:lambda.memory.min}}~{{fact:lambda.memory.max}}. CPU는 메모리에 비례. {{fact:lambda.memory.one-vcpu}}에서 vCPU 하나 |
| 제한 시간 | 최대 {{fact:lambda.timeout.max}} (기본 {{fact:lambda.timeout.default}}) |
| 환경 변수 | 합계 {{fact:lambda.envvars.max-size}} |
| 리소스 기반 정책 | {{fact:lambda.resource-policy.max-size}} |
| 계층 | {{fact:lambda.layers.max}} |
| 익스텐션 | {{fact:lambda.extensions.max}} |
| `/tmp` 임시 스토리지 | {{fact:lambda.tmp.min}}~{{fact:lambda.tmp.max}} |
| 파일 디스크립터 | {{fact:lambda.file-descriptors.max}} |
| 프로세스·스레드 | {{fact:lambda.processes.max}} |
| 콘솔 테스트 이벤트 | {{fact:lambda.console.test-events.max}} |

**배포 패키지.**

| 항목 | 한도 |
|---|---|
| .zip 직접 업로드(API·SDK·콘솔) | {{fact:lambda.zip.max-zipped}}(압축 상태). 더 크면 S3에 올려 지정 |
| .zip 압축 해제 크기 | {{fact:lambda.zip.max-unzipped}}. 코드, 계층, 사용자 지정 런타임, 익스텐션 합계 |
| 컨테이너 이미지 | {{fact:lambda.image.max-size}}(압축 해제, 모든 계층 포함). 이미지는 Amazon ECR에 저장되어 ECR 할당량을 따른다 |
| 컨테이너 이미지 설정 | {{fact:lambda.image.settings.max}} |
| 콘솔 코드 편집기 | {{fact:lambda.console-editor.max}} |

- 압축 해제 크기 한도는 계층까지 합한 값이다. 큰 라이브러리를 계층으로 옮겨도 한도는 늘지 않는다. 그럴 때는 컨테이너 이미지를 쓴다({{ch:lambda/packaging-runtimes}}).
- 메모리·제한 시간·`/tmp`의 설정 방법은 {{ch:lambda/configuration}}에 있다.

@topic lambda/limits/invocation-api

**호출 페이로드.**

| 항목 | 한도 |
|---|---|
| 동기 요청·응답 | 각각 {{fact:lambda.payload.sync.max}} |
| 스트리밍 응답 | {{fact:lambda.streaming.max}}. 앞부분 {{fact:lambda.streaming.uncapped}}까지는 대역폭 제한 없음, 그 뒤 {{fact:lambda.streaming.rate}} |
| 비동기 요청 | {{fact:lambda.payload.async.max}} |
| 요청 줄 + 헤더 값 | 합계 {{fact:lambda.payload.headers.max}} |

페이로드가 한도를 넘으면 큰 데이터는 S3에 두고 이벤트에는 객체 키만 넘긴다. 클라이언트가 큰 파일을 올려야 하면 함수가 S3 미리 서명된 URL을 돌려주고 클라이언트가 S3에 직접 올리게 한다.

**확장과 요청 수.**

| 항목 | 한도 |
|---|---|
| 함수별 확장 속도 | {{fact:lambda.scaling.rate}} |
| 동기 호출 요청 수 | 동시성 × {{fact:lambda.rps-per-env.sync}} (함수·리전) |
| 비동기 호출 요청 수 | 실행 환경당 제한 없음. 쓸 수 있는 동시성만 따진다 |
| 프로비저닝된 동시성 버전·별칭 | 할당된 프로비저닝 수 × {{fact:lambda.rps-per-env.sync}} |

자세한 계산은 {{ch:lambda/concurrency}}에 있다.

**제어 플레인 API.** 함수 생성·수정·조회 같은 관리 API에도 한도가 있고, 모두 늘릴 수 없다.

| API | 한도 |
|---|---|
| `GetFunction` | {{fact:lambda.api.getfunction.rps}} |
| `GetPolicy` | {{fact:lambda.api.getpolicy.rps}} |
| 그 밖의 제어 플레인 API 전체 | {{fact:lambda.control-plane.rps}}. API마다가 아니라 **모두 합친** 값 |

배포 파이프라인이 함수 수십 개를 한꺼번에 고치면 이 한도에 걸려 `TooManyRequestsException`이 날 수 있다. 지수 백오프로 재시도하고 배포를 나눠 돌린다.

**이벤트 소스 매핑.** 배치 크기, 배치 기간, 최대 동시성 같은 값은 소스마다 다르다. SQS는 {{ch:sqs/integrations}}, 공통 설정과 프로비저닝된 모드는 {{ch:lambda/event-source-mappings}}에서 다룬다.

@topic lambda/limits/other-compute

2025년 이후 추가된 실행 방식에는 따로 할당량이 있다. 시험 범위인지 아직 알 수 없으므로 존재만 알아 둔다.

- **Lambda Managed Instances**: 비동기 호출과 이벤트 소스 매핑(Amazon MQ·DocumentDB 제외)으로 부르면 제한 시간이 {{fact:lambda.mi.timeout.async-esm}}까지다. 파일 디스크립터·프로세스 한도도 일반 함수보다 높다.
- **지속성 함수(Durable functions)**: 리전당 실행 중인 지속성 실행은 {{fact:lambda.durable.executions.running}}(늘릴 수 있음). 실행 하나의 작업 수 {{fact:lambda.durable.operations.max}}, 누적 저장 {{fact:lambda.durable.storage.max}}, 작업 하나의 페이로드 {{fact:lambda.durable.payload-per-op.max}}는 늘릴 수 없다. 관련 API마다 초당 요청 한도가 따로 있다.
- **Lambda MicroVMs, Lambda Web Functions**: 메모리 합계, vCPU, 초당 요청 수 같은 계정 할당량을 따로 둔다.

이 방식들의 개념과 쓰임은 {{ch:lambda/new-compute-options}}에서 다룬다.

@quiz

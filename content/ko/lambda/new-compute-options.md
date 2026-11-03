---
chapter: lambda/new-compute-options
---

@topic lambda/new-compute-options/intro

이 장은 최근 Lambda 개발자 안내서에 추가된 실행 방식을 짧게 정리한다. **모두 2025년 이후에 나온 기능이라 시험에 나오는지 알 수 없다.** 시험 준비가 목적이면 앞 장의 기본 함수를 먼저 익힌다. 여기서는 무엇인지, 언제 쓰는지, 알아 둘 제한만 본다.

문서는 기존 Lambda 함수를 이제 **이벤트 함수(Lambda Event Functions)** 라고 부른다. 이벤트를 받아 핸들러를 실행하는, 앞 장에서 다룬 그 함수다. 아래 기능 중 지속성 함수, 관리형 인스턴스, 테넌트 격리 모드는 이벤트 함수 위에 얹는 설정이다. Web Functions와 MicroVMs는 이벤트 함수와 다른 별도의 자원이다.

| 기능 | 문서에서 찾은 날짜 |
|---|---|
| 지속성 함수(Durable functions) | 문서 기록에 출시 항목은 없다. 전용 관리형 정책이 {{fact:lambda.durable.policy-added}}에 추가됐다 |
| Lambda 관리형 인스턴스(Managed Instances) | 문서 기록상 {{fact:lambda.mi.released}} |
| Lambda Web Functions | 문서 기록에 항목이 없다 |
| Lambda MicroVMs | 문서 기록에 항목이 없다 |
| 테넌트 격리 모드(Tenant isolation mode) | 문서 기록에 항목이 없다 |

SnapStart는 새 기능이 아니고 {{ch:lambda/execution-environment}}에서 다뤘다. 이 장의 요금은 {{fact:lambda.price.offer-version}} 기준 서울 리전 값이다. 리전마다 다르고 자주 바뀐다.

@topic lambda/new-compute-options/durable

**지속성 함수(Durable functions)** 는 여러 단계로 된 작업을 함수 하나의 코드로 쓰고, 중간에 끊겨도 이어 가게 하는 기능이다. 실행 하나가 최대 {{fact:lambda.durable.execution.max}}까지 이어질 수 있다.

동작 방식은 **체크포인트와 재실행(replay)** 이다.

- 핸들러를 지속성 실행 SDK로 감싸면 `DurableContext`를 받는다. 여기서 **단계(step)** 와 **대기(wait)** 같은 지속성 작업을 쓴다.
- 단계가 끝나면 결과가 체크포인트로 저장된다. 함수가 멈췄다가 다시 불리면 코드는 처음부터 다시 돌지만, 끝난 단계는 저장된 결과를 쓰고 건너뛴다.
- 대기 중에는 함수가 멈춰 있어서 실행 시간 요금이 붙지 않는다. 사람 승인을 며칠 기다리는 흐름에 맞다.

**언제 쓰는가.** 주문 처리, 결제, 승인 절차, AI 모델 호출을 잇는 흐름처럼 여러 단계를 거치고 실패해도 이어 가야 하는 일에 쓴다. 비슷한 일을 하는 AWS Step Functions와는 이렇게 나뉜다.

| | 지속성 함수 | Step Functions |
|---|---|---|
| 흐름 정의 | 일반 프로그래밍 언어 코드 | 그래프 기반 정의 언어, 시각 편집기 |
| 맞는 경우 | 흐름이 업무 로직과 붙어 있는 애플리케이션 개발 | 여러 AWS 서비스를 잇는 오케스트레이션 |

**알아 둘 제한.**

- 함수를 만들 때 지속성 설정을 켠다. CLI에서는 `--durable-config`로 실행 제한 시간(`ExecutionTimeout`)과 기록 보관 기간(`RetentionPeriodInDays`)을 준다. 콘솔의 실행 제한 시간 기본값은 {{fact:lambda.durable.execution-timeout.default}}, 보관 기간은 기본 {{fact:lambda.durable.retention.default}}, {{fact:lambda.durable.retention.min}}~{{fact:lambda.durable.retention.max}}이다.
- 실행 제한 시간은 지속성 실행 전체에, 함수 제한 시간은 한 번의 호출에 걸린다. 둘은 다른 설정이다.
- **버전·별칭·`$LATEST`를 붙인 이름으로만 호출한다.** 한정자 없는 ARN은 받지 않는다. 실행은 시작한 버전에 고정되어, 며칠 뒤 재개해도 같은 코드로 재실행된다. `$LATEST`로 시작한 실행은 고정되지 않으므로 운영에서는 번호 버전이나 별칭을 쓴다.
- 동기 호출은 함수 제한 시간 최댓값({{fact:lambda.timeout.max}})보다 오래 기다리지 못한다. 긴 실행은 비동기로 부른다.
- 실패 처리에 DLQ는 쓸 수 있지만 Lambda 대상(destination)은 지원하지 않는다.
- 지원 런타임은 Node.js, Python, Java, .NET의 일부 버전이다. 재실행해도 결과가 같도록 코드를 결정적으로 짜야 한다.

**요금(서울).** 일반 요청·실행 시간 요금에 더해 지속성 작업 {{fact:lambda.durable.price.ops.apne2}}, 쓴 데이터 {{fact:lambda.durable.price.written.apne2}}, 보관 데이터 {{fact:lambda.durable.price.retained.apne2}}가 붙는다. 재실행으로 생긴 호출도 실행 시간 요금을 낸다.

@topic lambda/new-compute-options/managed-instances

**Lambda 관리형 인스턴스(Managed Instances)** 는 이벤트 함수를 **고객 계정의 EC2 인스턴스**에서 돌리는 방식이다. Graviton4 같은 최신 인스턴스 유형을 고를 수 있다. 인스턴스 수명 주기, OS·런타임 패치, 라우팅, 확장은 Lambda가 맡는다.

구성 순서는 셋이다.

1. **용량 공급자(capacity provider)** 를 만든다. VPC 설정을 주고, 필요하면 인스턴스 요구 사항과 확장 설정을 준다.
2. 함수를 평소처럼 만들고 용량 공급자에 붙인다.
3. 함수 버전을 게시한다. 이때 Lambda가 가용 영역 복원력을 위해 기본 {{fact:lambda.mi.initial-instances}}를 띄우고 실행 환경을 준비한 뒤 버전을 ACTIVE로 바꾼다.

기본 이벤트 함수와 다른 점:

| 항목 | 관리형 인스턴스 |
|---|---|
| 동시성 | 실행 환경 하나가 여러 호출을 동시에 처리한다. 코드가 스레드 안전해야 한다 |
| 격리 | Firecracker 대신 EC2 Nitro 위 컨테이너로 격리한다. 용량 공급자가 보안 경계다 |
| 확장 | CPU 사용률만 보고 비동기로 늘린다. 콜드 스타트가 없고, 트래픽이 없어도 최소 실행 환경 수만큼 남는다 |
| 요금 | 요청 요금 + EC2 인스턴스 요금 + 관리 수수료({{fact:lambda.mi.management-fee}}) |

**언제 쓰는가.** 트래픽이 크고 예측 가능한 워크로드다. 기본 설정은 {{fact:lambda.mi.scale-doubling}}의 증가를 따라간다. 갑자기 튀는 트래픽이나 0까지 줄어야 하는 워크로드는 기본 이벤트 함수가 맞다. EC2 Savings Plans나 예약 인스턴스로 인스턴스 요금을 낮출 수 있지만, 이 할인은 관리 수수료에는 적용되지 않는다.

**알아 둘 제한.**

- 인스턴스는 계정에 있고 요금도 계정에 붙지만, 직접 종료할 수 없다. 용량 공급자를 지우면 Lambda가 정리한다.
- 계정당 용량 공급자 {{fact:lambda.mi.capacity-providers.max}}, 용량 공급자당 함수 버전 {{fact:lambda.mi.versions-per-cp}}, vCPU {{fact:lambda.mi.vcpu-per-cp}}다. EC2 vCPU 할당량과 서브넷 IP 수에도 걸린다.
- 비동기 호출과 이벤트 소스 매핑 호출은 함수 제한 시간을 {{fact:lambda.mi.timeout.async-esm}}까지 줄 수 있다.
- 테넌트 격리 모드와 함께 쓸 수 없다.

@topic lambda/new-compute-options/web-functions

**Lambda Web Functions** 는 웹 앱과 API 백엔드를 서버리스 HTTP 서버로 돌리는 자원이다. 코드가 포트에서 직접 요청을 받는다. Express, Hono 같은 Node.js 프레임워크를 Lambda 전용 어댑터 없이 쓴다. Lambda가 HTTPS 엔드포인트를 만들어 준다.

- **리비전(revision)** 은 코드와 설정의 바꿀 수 없는 스냅샷이다. **엔드포인트(endpoint)** 가 HTTP 요청을 리비전 한두 개로 보낸다.
- 실행 환경 하나가 여러 요청을 동시에 처리한다. 환경마다 {{fact:lambda.web.env.memory}}를 쓴다. Arm64로만 돈다.
- 엔드포인트마다 IAM 인증이나 애플리케이션 자체 인증을 고른다. 사용자 지정 도메인이나 AWS WAF가 필요하면 앞에 CloudFront를 둔다.
- 엔드포인트를 여러 리전에 두고 지연 시간 기반으로 요청을 나눌 수 있다.
- 트래픽이 없으면 실행 환경이 0까지 준다. 첫 요청은 새 환경이 준비될 때까지 기다릴 수 있다.

**언제 쓰는가.** HTTP 요청을 직접 받는 웹 애플리케이션, REST·GraphQL API, 서버 측 렌더링, 응답 스트리밍이다. 큐 메시지나 파일 업로드 같은 이벤트 처리는 이벤트 함수가 맞다.

**알아 둘 제한.**

- 지금은 Node.js 런타임만 지원한다. 네이티브 의존성은 Linux arm64용으로 빌드해야 한다.
- 서버는 시작 후 {{fact:lambda.web.listen.deadline}} 안에 포트를 열어야 한다.
- 요청 하나의 제한 시간은 {{fact:lambda.web.timeout.min}}~{{fact:lambda.timeout.max}}이고 기본 {{fact:lambda.web.timeout.default}}다.
- 엔드포인트에 요청 속도 제한(최대 {{fact:lambda.web.rate-limit.max}})과 실행 환경 수 상한을 걸 수 있다. 넘는 요청은 HTTP 429를 받는다. 데이터베이스 같은 하위 시스템을 보호하는 데 쓴다.

**요금(서울).** 요청 {{fact:lambda.web.price.request.apne2}}, 실제로 쓴 CPU 시간 {{fact:lambda.web.price.vcpu.apne2}}, 실행 환경이 살아 있는 동안의 메모리 {{fact:lambda.web.price.memory.apne2}}, 그리고 데이터 전송이다. DB 응답을 기다리는 동안 CPU 요금은 거의 없지만 메모리 요금은 요청 사이 유휴 시간에도 쌓인다.

@topic lambda/new-compute-options/isolation

사용자 코드나 테넌트 데이터를 서로 떼어 놓아야 할 때 쓰는 두 기능이다.

**Lambda MicroVMs.** 사용자나 AI 에이전트가 접속해 코드를 돌리는, 격리된 서버리스 실행 환경이다. Firecracker로 VM 수준 격리를 주고 OS 기능을 모두 쓸 수 있다.

1. 애플리케이션 코드와 `Dockerfile`을 zip으로 묶어 S3에 올린다.
2. API로 MicroVM 이미지를 만든다. Lambda가 `Dockerfile`을 실행하고, 앱을 띄운 뒤, 초기화된 상태를 스냅샷으로 남긴다.
3. 세션이나 작업마다 `run-microvm`을 부른다. 스냅샷에서 빠르게 시작한다. 클라이언트는 MicroVM마다 있는 HTTPS 엔드포인트로 접속한다.
4. 쉬는 동안에는 메모리·디스크 상태를 유지한 채 일시 중지하고, 트래픽이 오면 재개한다. 수명 주기 정책으로 자동으로 하거나 API로 직접 한다.
5. 세션이 끝나면 종료해 자원을 놓는다.

쓰는 곳은 대화형 개발 환경, AI가 만든 코드를 돌리는 샌드박스, 사용자 스크립트를 돌리는 노트북·게임 서버, 테넌트를 격리하는 CI/CD 작업이다. 제한: 수명은 최대 {{fact:lambda.microvm.lifetime.max}}(일시 중지 시간 포함), 자동 일시 중지까지의 무트래픽 시간은 최대 {{fact:lambda.microvm.idle.max}}이다. 기준 자원(기본 {{fact:lambda.microvm.baseline.default}})을 정하면 바쁠 때 {{fact:lambda.microvm.burst}}까지 늘어나고, 기준치를 넘는 사용분만 따로 낸다. 서울 리전 가격표({{fact:lambda.price.offer-version}})에는 MicroVM 요금 항목이 없다. 쓰려는 리전에서 제공되는지 먼저 확인한다.

**테넌트 격리 모드(Tenant isolation mode).** 이벤트 함수 **하나**로 여러 테넌트를 받으면서, 실행 환경은 테넌트끼리 섞이지 않게 하는 설정이다. 호출할 때 `tenant-id`를 주면 Lambda는 그 테넌트에 묶인 실행 환경을 찾고, 없으면 새로 만든다. 다른 테넌트가 쓰던 환경은 다시 쓰지 않는다.

- **언제 쓰는가.** 최종 사용자가 낸 코드를 실행하거나, 테넌트별 민감 데이터를 처리하는 SaaS다. 테넌트마다 함수를 따로 만들고 라우팅을 짜는 일을 덜어 준다.
- **함수를 만들 때만 켤 수 있다.** 기존 함수에 나중에 켜지 못한다.
- `tenant-id` 없이 호출하면 실패한다. 동기·비동기 호출과 API Gateway 트리거로 부를 수 있다.
- 함수 URL, 프로비저닝된 동시성, SnapStart, 관리형 인스턴스와 함께 쓸 수 없다.
- 실행 역할은 모든 테넌트에 같이 적용된다. 권한까지 테넌트별로 나뉘지는 않는다.
- 테넌트별 환경이라 콜드 스타트가 는다. 격리 실행 환경 수는 {{fact:lambda.tenant.envs-per-1000}}까지다.
- 아시아 태평양(뉴질랜드)을 뺀 모든 상용 리전에서 지원한다. 서울은 새 격리 환경을 만들 때마다 x86 {{fact:lambda.tenant.price.x86.apne2}}, arm64 {{fact:lambda.tenant.price.arm.apne2}}가 일반 요금에 더 붙는다.

@quiz

---
chapter: lambda/packaging-runtimes
---

@topic lambda/packaging-runtimes/managed-runtimes

**런타임(runtime)** 은 Lambda와 함수 코드 사이에서 이벤트, 컨텍스트 정보, 응답을 주고받는 언어별 환경이다. Lambda가 제공하는 **관리형 런타임(managed runtime)** 은 Node.js, Python, Java, .NET, Ruby다. 언어의 메이저 버전마다 따로 있고, 각각 `nodejs24.x`, `python3.14` 같은 **런타임 식별자(runtime identifier)** 를 가진다.

- 메이저 버전 사이의 호환은 보장하지 않는다. 그래서 새 메이저 버전으로 옮기는 일(식별자 바꾸기)은 사용자가 직접 한다.
- 런타임은 Amazon Linux 배포판과 짝을 이룬다. Node.js 20, Python 3.12, Java 21, .NET 8, Ruby 3.3과 그 뒤 버전은 Amazon Linux 2023(AL2023) 기반이다.
- 지원되는 모든 런타임은 x86_64와 arm64를 둘 다 지원한다. 아키텍처 선택은 {{ch:lambda/configuration}}에서 다룬다.
- Lambda는 언어 버전이 장기 지원(LTS) 단계에 들어가야 새 관리형 런타임을 낸다.
- **미리 보기(public preview) 런타임** 은 SLA와 기술 지원 대상이 아니다. 운영 환경에 쓰지 않는다.

**SDK는 패키지에 넣는다.** Node.js, Python, Ruby 런타임에는 AWS SDK가 들어 있지만, Lambda가 수시로 버전을 올린다. 문서는 코드가 쓰는 SDK 모듈을 배포 패키지에 직접 넣으라고 권한다. 런타임의 SDK는 콘솔 편집기나 CloudFormation 인라인 코드처럼 패키지를 넣을 수 없을 때만 쓴다.

**사용 중단(deprecation) 정책.** 런타임의 주요 구성 요소(대개 언어 버전, 때로는 OS)가 커뮤니티 지원을 끝내면 Lambda도 그 런타임을 사용 중단한다.

| 단계 | 시점 | 일어나는 일 |
|---|---|---|
| 사전 알림 | 사용 중단 {{fact:lambda.runtime.deprecation.notice}} 전부터 | 이메일, AWS Health Dashboard, Trusted Advisor로 알린다 |
| 사용 중단 | 사용 중단일 | 보안 패치와 기술 지원이 끝난다. 콘솔에서는 만들거나 고칠 수 없지만 CLI·SAM·CloudFormation으로는 아직 된다 |
| 생성 차단 | 사용 중단 후 {{fact:lambda.runtime.block-create.after}} 이상 | 새 함수를 만들 수 없다 |
| 업데이트 차단 | 사용 중단 후 {{fact:lambda.runtime.block-update.after}} 이상 | 기존 함수의 코드·구성을 고칠 수 없다. 지원되는 런타임으로 올리는 것은 되지만, 사용 중단 런타임으로 되돌리기는 막힐 수 있다 |

- 사용 중단된 런타임으로도 함수 호출은 계속된다. 다만 패치 없이 그대로 제공되는 것이라 위험하다.
- 런타임에 따라 생성·업데이트 차단 날짜를 위 기간보다 늦추기도 한다. 정확한 날짜는 런타임 표를 본다.
- 이메일과 Health Dashboard는 `$LATEST`를 쓰는 함수만 나열한다. 게시된 버전까지 전부 보려면 Trusted Advisor를 쓴다.
- 컨테이너 이미지 함수는 사용 중단 알림을 받지 못한다. 기본 이미지의 일정을 직접 챙긴다.

**공동 책임.** 관리형 런타임과 기본 이미지의 보안 패치를 만들고 내는 것은 Lambda 몫이다. 함수 코드와 의존성의 패치, 사용 중단 전에 지원되는 런타임으로 옮기는 것은 사용자 몫이다. 컨테이너 이미지라면 최신 기본 이미지로 다시 빌드해 배포하는 것도 사용자 몫이다.

@topic lambda/packaging-runtimes/runtime-updates

같은 런타임 식별자 안에서도 Lambda는 보안 패치, 버그 수정, 마이너 버전 지원을 계속 낸다. 이 하나하나가 **런타임 버전(runtime version)** 이다. 런타임 버전마다 번호와 ARN이 있고, 함수 로그의 `INIT_START` 줄에서 지금 쓰는 런타임 버전 ARN을 볼 수 있다. 런타임 버전 번호는 언어 버전 번호와 관계없고 꼭 연속되지도 않는다.

**런타임 관리 제어(runtime management controls).** 함수 버전마다 업데이트 모드를 정한다(`PutRuntimeManagementConfig`).

| 모드 | 동작 |
|---|---|
| Auto (기본값) | 두 단계 출시로 최신 런타임 버전에 자동으로 올린다. 대부분의 함수에 권장 |
| Function update | 함수를 만들거나 고칠 때만 최신 런타임 버전으로 올린다. 런타임 변경을 배포 시점에 맞춘다 |
| Manual | 지정한 런타임 버전 ARN을 계속 쓴다. 호환 문제가 났을 때 임시로 되돌리는 용도 |

**두 단계 출시.** 새 런타임 버전은 먼저 함수를 만들거나 `UpdateFunctionCode`·`UpdateFunctionConfiguration`으로 고칠 때 적용된다. 그다음 단계에서 아직 안 올라간 Auto 모드 함수를 Lambda가 올린다. 활발히 배포하는 함수는 대개 첫 단계에서 새 버전을 받으므로, 문제가 나면 배포와 함께 바로 알아챈다. 출시는 리전마다 차례로 진행되어, 같은 날 배포해도 리전마다 런타임 버전이 다를 수 있다. 런타임 버전을 모든 환경에서 똑같이 맞춰야 한다면 문서는 Manual 모드가 아니라 컨테이너 이미지를 권한다.

**되돌리기(rollback).** 새 런타임 버전이 드물게 함수와 맞지 않을 때 두 방법이 있다.

- Manual 모드로 바꾸고 이전 런타임 버전 ARN을 지정한다. 오래 머무를 곳이 아니라 고칠 시간을 버는 임시 조치다.
- Function update 모드와 게시된 버전을 함께 쓴다. 이 모드에서 게시된 버전은 코드·설정·런타임 버전이 함께 고정되므로, 별칭을 이전 버전으로 옮기면 셋이 한꺼번에 되돌아간다({{ch:lambda/versions-aliases}}). 대신 정기적으로 함수를 고치고 새 버전을 게시해야 최신 패치를 받는다.

**호환성을 지키는 의존성 관리.** 문서는 가능하면 SDK를 포함한 모든 의존성을 패키지에 넣으라고 한다. 런타임에 든 패키지를 쓰면서 그 패키지가 기대는 하위 패키지만 내 패키지에 넣으면, 런타임 쪽이 바뀔 때 버전이 어긋날 수 있다. 시스템 라이브러리를 직접 덮어쓰는 것도 피한다.

@topic lambda/packaging-runtimes/zip

**배포 패키지(deployment package)** 는 두 종류다. .zip 파일 아카이브와 컨테이너 이미지. 패키지 유형은 함수를 만들 때 정하고, 나중에 바꿀 수 없다. 바꾸려면 함수를 새로 만든다.

**.zip 크기 한도.**

| 경로 | 한도 |
|---|---|
| Lambda API·SDK나 콘솔에서 직접 올리기(압축 상태) | {{fact:lambda.zip.max-zipped}} |
| 그보다 크면 | Amazon S3에 올리고 버킷·키를 지정한다 |
| 압축을 푼 전체 크기(함수 코드 + 계층 + 사용자 지정 런타임 + 익스텐션) | {{fact:lambda.zip.max-unzipped}} |
| 콘솔 코드 편집기로 직접 고치기 | {{fact:lambda.console-editor.max}}까지, Node.js·Python·Ruby만 |

- S3로 올려도 압축 해제 한도는 그대로다. 이 한도를 넘으면 컨테이너 이미지로 옮기는 것을 검토한다.
- 계정의 코드 저장 공간에도 한도({{fact:lambda.code-storage.max}})가 있다. 게시한 함수 버전과 계층 버전이 각각 공간을 차지하므로, 쓰지 않는 오래된 버전을 지운다.
- 콘솔에서 저장하면 콘솔이 .zip을 만들어 준다. IDE에서 개발하면 직접 .zip을 만들어 올린다(`UpdateFunctionCode`).
- 런타임을 다른 언어로 바꾸거나 아키텍처를 바꾸면, 그 런타임·아키텍처에 맞게 빌드한 새 .zip이 필요하다. 네이티브 라이브러리가 든 패키지는 특히 그렇다.
- CloudFormation에서는 `AWS::Lambda::Function`의 `Code`에 S3 위치를 주거나 짧은 코드를 인라인으로 넣는다. SAM의 `CodeUri`가 바뀌면 새 코드가 배포된다.
- 함께 쓰는 의존성은 계층으로 뺄 수 있다({{ch:lambda/layers-extensions}}).

@topic lambda/packaging-runtimes/container-images

컨테이너 이미지로 함수를 만들 수도 있다. 이미지를 빌드해 **Amazon ECR** 리포지토리에 올리고, 함수를 만들 때 이미지 URI를 지정한다. 압축을 푼 이미지는 모든 레이어를 합쳐 {{fact:lambda.image.max-size}}까지다. .zip의 압축 해제 한도({{fact:lambda.zip.max-unzipped}})보다 훨씬 커서 큰 라이브러리나 모델 파일이 있을 때 쓴다.

**기본 이미지 세 가지.**

| 방법 | 내용 |
|---|---|
| AWS 기본 이미지(언어별) | 언어 런타임과 Lambda에 필요한 구성 요소가 이미 들어 있다. 코드와 의존성만 더한다 |
| AWS OS 전용 기본 이미지(`provided`) | Amazon Linux와 런타임 인터페이스 에뮬레이터만 있다. Go·Rust 같은 컴파일 언어나 관리형 런타임이 없는 언어에 쓴다 |
| AWS가 아닌 이미지 | Docker 이미지 매니페스트 V2 스키마 2나 OCI 형식이면 된다. **런타임 인터페이스 클라이언트(runtime interface client, RIC)** 를 직접 넣어야 한다 |

RIC는 Lambda 런타임 API를 구현해 Lambda와 함수 코드 사이를 잇는다. AWS는 Node.js, Python, Java, .NET, Go, Ruby, Rust용 오픈 소스 RIC를 제공한다. 로컬 테스트에는 런타임 인터페이스 에뮬레이터(RIE)를 쓴다.

**이미지 요건.**

- Linux 이미지만 된다. 이미지 하나는 아키텍처 하나만 대상으로 한다. 다중 아키텍처 이미지는 지원하지 않는다.
- 읽기 전용 파일 시스템에서 돌 수 있어야 한다. 쓰기는 `/tmp`에만 한다.
- Lambda의 기본 사용자는 권한이 최소인 Linux 사용자다. 그 사용자가 실행에 필요한 파일을 모두 읽을 수 있어야 한다.
- 시작 시간을 줄이려면 다단계 빌드(multi-stage build)로 이미지를 작게 만든다.

**ECR 권한.** 같은 계정의 리포지토리면 실행 역할의 자격 증명 기반 정책이나 리포지토리 정책 중 한쪽에서 `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`를 허용하면 된다. 다른 계정의 리포지토리면 양쪽 모두 허용해야 한다. IAM 정책 평가는 {{ch:iam/policies}}에서 다룬다.

**함수 상태.** 이미지를 올리거나 바꾸면 Lambda가 이미지를 최적화하는 동안 함수가 `Pending`이고, 끝나면 `Active`가 된다. `Active` 전에는 호출할 수 없다. 여러 주 동안 호출이 없으면 `Inactive`가 되고, 다음 첫 호출은 거부된 채 다시 최적화된다. ECR에서 이미지가 지워지거나 권한이 없어지면 `Failed`가 되어 호출이 실패한다. 그래서 ECR 수명 주기 정책(lifecycle policy)이 함수가 쓰는 이미지를 지우지 않게 주의한다.

**패치는 다시 빌드해야 받는다.** 관리형 런타임과 달리 이미지는 자동으로 패치되지 않는다. 갱신된 기본 이미지로 다시 빌드하고 함수 코드를 업데이트해야 한다. 반대로 런타임 버전을 환경 사이에서 정확히 맞추고 싶을 때는 이 성질이 장점이 된다. 이미지 함수에는 Lambda 계층을 붙일 수 없다. 필요한 것은 이미지 안에 넣는다.

@topic lambda/packaging-runtimes/custom-runtimes

**OS 전용 런타임(OS-only runtime).** 관리형 런타임이 없는 언어는 `provided` 계열 런타임(현재 `provided.al2023`)을 쓴다. 쓰임은 세 가지다.

- **네이티브 사전 컴파일(AOT)**: Go, Rust, Swift, C++, .NET Native AOT, GraalVM Native Image처럼 실행 파일 하나로 컴파일되는 언어. 실행 파일에 RIC를 넣고, Linux와 함수 아키텍처(x86_64·arm64)에 맞게 컴파일한다. Go 1.x 관리형 런타임은 사용 중단되었고, Go는 이 방식으로 계속 쓴다.
- **외부 런타임**: PHP용 Bref처럼 이미 만들어진 런타임.
- **사용자 지정 런타임(custom runtime)**: Lambda가 아직 제공하지 않는 언어나 언어 버전을 직접 구현한다. 가장 드문 경우다.

**사용자 지정 런타임이 하는 일.** 진입점은 `bootstrap`이라는 실행 파일이다. 함수 패키지 루트에 없으면 Lambda는 계층에서 찾는다. 없거나 실행 권한이 없으면 `Runtime.InvalidEntrypoint` 오류가 난다.

- **초기화**: 환경 변수에서 설정과 핸들러 이름을 읽고, 핸들러 파일을 불러 전역 코드를 실행한다. 실패하면 초기화 오류 API를 부르고 끝낸다. 초기화 시간도 과금되고 제한 시간에 포함된다.
- **처리 루프**: 런타임 API의 next invocation으로 이벤트를 받는다 → `Lambda-Runtime-Trace-Id` 헤더 값을 `_X_AMZN_TRACE_ID`에 넣어 X-Ray 추적을 잇는다 → 컨텍스트를 만들어 핸들러를 부른다 → invocation response나 invocation error API로 결과를 보낸다.

런타임은 함수 패키지에 넣거나 계층으로 나눠 여러 함수가 함께 쓰게 할 수 있다. 실행 환경의 단계(Init, Invoke, Shutdown)는 {{ch:lambda/execution-environment}}에서 다룬다.

@quiz

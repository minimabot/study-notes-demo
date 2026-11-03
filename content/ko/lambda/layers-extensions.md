---
chapter: lambda/layers-extensions
---

@topic lambda/layers-extensions/layers

**계층(Layer)** 은 함수 코드에 더해 쓰는 코드나 데이터를 담은 .zip 파일 아카이브다. 보통 라이브러리 의존성, 사용자 지정 런타임, 설정 파일을 담는다. 함수에 붙이면 Lambda가 실행 환경을 준비할 때 계층 내용을 **`/opt`** 디렉터리에 풀어 놓는다.

쓰는 이유:

- 배포 패키지를 작게 유지한다. 의존성을 빼면 함수 코드만 자주 배포할 수 있다.
- 핵심 로직과 의존성을 나눠 따로 업데이트한다.
- 같은 의존성을 여러 함수가 함께 쓴다.
- 패키지가 작아지면 콘솔 코드 편집기를 다시 쓸 수 있다.
- 런타임에 든 SDK 버전이 바뀌어도 영향받지 않도록, 필요한 SDK 버전을 계층에 고정한다.

**경로 맞추기.** 런타임마다 `/opt` 아래 특정 폴더가 이미 검색 경로에 들어 있다. .zip 안의 폴더 구조를 그에 맞춰야 코드에서 바로 불러 쓸 수 있다.

| 런타임 | .zip 안 경로 (예) |
|---|---|
| Node.js | `nodejs/node_modules` |
| Python | `python` 또는 `python/lib/python3.x/site-packages` |
| Java | `java/lib` (`CLASSPATH`) |
| Ruby | `ruby/gems/<버전>` (`GEM_PATH`), `ruby/lib` |
| 모든 런타임 | `bin` (`PATH`), `lib` (`LD_LIBRARY_PATH`) |

함수는 Amazon Linux에서 돈다. 네이티브 확장이 든 라이브러리는 Linux 환경(예: Docker)에서 빌드해야 맞는다.

**한도와 제약.**

- 함수 하나에 계층은 {{fact:lambda.layers.max}}까지 붙인다.
- 함수와 모든 계층을 합친 압축 해제 크기는 {{fact:lambda.zip.max-unzipped}}를 넘을 수 없다. 계층으로 나눠도 이 한도는 늘지 않는다({{ch:lambda/packaging-runtimes}}).
- **.zip으로 배포한 함수에만** 쓴다. 컨테이너 이미지 함수는 계층을 붙일 수 없고, 필요한 런타임과 의존성을 이미지 안에 넣는다.
- 붙인 순서대로 Lambda가 내용을 합친다. 같은 경로의 파일이 겹치면 순서가 결과를 바꾸므로, 콘솔의 Merge earlier·Merge later로 순서를 조정한다.
- Go와 Rust는 계층을 쓰지 않는 것이 좋다. 의존성까지 실행 파일 하나로 컴파일하는 언어라서, 계층으로 빼면 초기화 때 추가로 불러와야 해 콜드 스타트가 늘 수 있다.

@topic lambda/layers-extensions/layer-versions

**계층 버전(layer version).** 계층을 만들면 버전 1이 생기고, 내용을 고쳐 다시 게시(`PublishLayerVersion`)할 때마다 번호가 하나씩 늘어난다. 각 버전은 바뀌지 않는 스냅숏이고 고유한 ARN(`...:layer:my-layer:1`)이 있다.

- 함수에 붙일 때는 **정확한 버전 ARN** 을 지정한다. "최신 버전"을 따라가는 방식이 아니다. 계층을 고친 뒤 함수에서도 새 버전으로 바꿔 줘야 반영된다.
- 함수의 계층 구성은 게시된 함수 버전에 함께 고정된다({{ch:lambda/versions-aliases}}).
- 계층을 만들 때 호환 런타임과 호환 아키텍처를 적어 둘 수 있다. `ListLayers --compatible-runtime`으로 맞는 계층을 찾는다.
- 권한은 기존 버전에서도 언제든 바꿀 수 있지만, 내용이나 다른 설정을 바꾸려면 새 버전을 만든다.

**삭제.** `DeleteLayerVersion`으로 버전을 지운다.

- 지운 버전을 이미 쓰고 있는 함수는 그 내용으로 계속 돈다. 함수가 비활성화되지도 않는다.
- 지운 버전으로 새 함수를 만들 수는 없다.
- 계층 버전 번호도 다시 쓰지 않는다.
- Lambda 관리형 스토리지에 올린 계층은 계정 코드 저장 한도({{fact:lambda.code-storage.max}})를 차지한다. 지우면 그 저장 공간이 줄어든다. 다만 그 계층을 쓰는 함수에서는 여전히 함수의 압축 해제 크기 한도에 들어간다.

**다른 계정과 공유.** 계층 버전의 리소스 기반 정책에 문을 추가한다(`add-layer-version-permission`).

- 한 문에 계정 하나, 모든 계정(`*`), 또는 조직(`--organization-id`) 하나를 줄 수 있다. 여럿에게 주려면 문을 여러 개 추가한다.
- 권한은 **버전마다** 따로다. 새 버전을 게시하면 공유 권한을 다시 준다.
- 쓰는 쪽은 그 버전에 `lambda:GetLayerVersion` 권한이 있어야 한다. 같은 계정이면 사용자 정책으로, 다른 계정이면 소유 계정의 리소스 기반 정책으로 준다.
- 권한이 회수되어도 이미 그 계층을 붙인 함수는 계속 돈다. 함수의 계층 버전을 계정을 넘어 일괄 업데이트할 수는 없다.

@topic lambda/layers-extensions/extensions

**익스텐션(Extension)** 은 함수 실행 환경 안에서 함께 돌며 모니터링, 관측성, 보안, 거버넌스 도구를 함수에 붙이는 수단이다. AWS 파트너가 만든 것을 쓰거나 Extensions API로 직접 만든다. 모든 관리형 런타임이 지원한다.

| 구분 | 외부 익스텐션(external) | 내부 익스텐션(internal) |
|---|---|---|
| 실행 방식 | 실행 환경 안의 별도 프로세스 | 런타임 프로세스의 일부 |
| 언어 | 함수와 다른 언어로 써도 된다 | 런타임 언어에 묶인다 |
| 붙이는 법 | `/opt/extensions/`의 실행 파일. 계층으로 넣는다 | 래퍼 스크립트나 `JAVA_TOOL_OPTIONS` 같은 런타임 내 방식 |
| 호출 뒤 | 함수 응답 뒤에도 계속 돌 수 있다 | 런타임과 함께 동작 |

**붙이기.** .zip 함수는 익스텐션을 계층으로 추가한다. 한 계층에 익스텐션 여러 개를 넣을 수 있고, 함수 하나에 등록할 수 있는 익스텐션은 {{fact:lambda.extensions.max}}까지다. 컨테이너 이미지 함수는 Dockerfile에서 익스텐션 파일을 이미지의 `/opt/extensions/`에 복사한다. Init 단계에서 Lambda는 `/opt/extensions/`의 파일을 각각 익스텐션 실행 파일로 보고 모두 병렬로 시작한다.

**수명 주기와 성능 영향.**

- Init 단계는 익스텐션 초기화 → 런타임 초기화 → 함수 초기화 순으로 나뉜다. 모든 익스텐션이 초기화를 마쳐야 함수가 호출된다. 초기화가 느린 익스텐션은 콜드 스타트를 늘린다.
- 익스텐션은 함수와 CPU, 메모리, 디스크를 나눠 쓴다. 무거운 작업을 하면 함수 실행 시간이 늘어난다.
- 함수가 응답한 뒤 익스텐션이 일을 더 하는 시간은 `PostRuntimeExtensionsDuration` 지표로 본다. 메모리 증가는 Lambda Insights의 `MaxMemoryUsed`로 본다.
- 실행 환경이 종료될 때 외부 익스텐션은 `Shutdown` 이벤트를 받아 정리할 시간을 얻는다. 익스텐션 종류에 따라 이 시간 상한이 달라진다({{ch:lambda/execution-environment}}).
- 익스텐션 크기도 함수의 압축 해제 크기 한도({{fact:lambda.zip.max-unzipped}})에 들어간다.

**요금과 권한.** 익스텐션이 쓰는 실행 시간도 함수 실행 시간처럼 과금된다. 설치 자체는 무료이고, 파트너 익스텐션 요금은 파트너가 정한다. 익스텐션은 함수와 같은 실행 역할 권한을 쓴다. 따로 권한을 나눌 수 없으므로, 믿을 수 있는 익스텐션만 붙인다.

@topic lambda/layers-extensions/common-extensions

**AWS Parameters and Secrets Lambda Extension.** Secrets Manager 비밀과 Systems Manager Parameter Store 파라미터를 함수에서 꺼내 쓰는 AWS 제공 익스텐션이다. 계층으로 붙인다.

- 함수는 `localhost` 포트 {{fact:lambda.secrets-extension.port}}의 HTTP 엔드포인트로 값을 요청한다. 요청 헤더 `X-Aws-Parameters-Secrets-Token`에 `AWS_SESSION_TOKEN` 환경 변수 값을 넣는다.
- 받은 값을 캐시해(기본 {{fact:lambda.secrets-extension.cache-ttl}}) 호출마다 Secrets Manager API를 부르지 않는다. 지연과 API 비용이 준다. 캐시 시간 같은 동작은 환경 변수로 조정한다.
- 실행 역할에 해당 비밀·파라미터를 읽을 권한(KMS 키 복호화 포함)이 있어야 한다.
- 비밀 값을 환경 변수에 두지 않는 이유와 다른 방법(Powertools)은 {{ch:lambda/configuration}}에서 다룬다.

**모니터링·보안 에이전트.** CloudWatch Lambda Insights, AWS Distro for OpenTelemetry(ADOT), 여러 파트너의 APM·보안 도구가 익스텐션 계층으로 제공된다. 함수 코드를 거의 바꾸지 않고 지표, 추적, 로그를 수집한다. 성능 영향은 위 절의 지표로 확인한다.

**Telemetry API.** 익스텐션이 Lambda에서 텔레메트리를 거의 실시간으로 받는 API다. 구독할 수 있는 스트림은 세 가지다.

- 플랫폼 텔레메트리: 실행 환경·익스텐션 수명 주기와 호출에 관한 로그, 지표, 추적
- 함수 로그: 함수 코드가 남긴 로그
- 익스텐션 로그: 익스텐션 코드가 남긴 로그

익스텐션은 이 데이터를 걸러 S3나 외부 관측성 도구로 보낸다. 익스텐션이 구독해도 Lambda는 로그와 지표를 CloudWatch에, 추적을 X-Ray에(켜 둔 경우) 그대로 보낸다. Telemetry API는 예전 Logs API를 대체한다. Logs API도 동작하지만 문서는 앞으로 Telemetry API만 쓰라고 권한다. 한 익스텐션이 둘 중 하나로 구독하면 다른 쪽 구독은 오류가 난다. 로그 수집 전반은 {{ch:lambda/monitoring}}에서 다룬다.

@quiz

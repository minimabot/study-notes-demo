---
chapter: lambda/versions-aliases
---

@topic lambda/versions-aliases/versions

함수 코드를 배포하면 늘 **`$LATEST`** 를 덮어쓴다. `$LATEST`는 게시하지 않은(unpublished) 작업본이다. 지금 상태를 남겨 두려면 **버전(version)** 을 게시한다. 콘솔의 Publish new version이나 `PublishVersion` API(`aws lambda publish-version`)를 쓴다.

**게시된 버전은 바뀌지 않는다.** 게시하는 순간 코드와 대부분의 설정이 스냅숏으로 고정된다. 고치려면 `$LATEST`를 바꾸고 새 버전을 다시 게시한다.

| 게시하면 고정되는 것 | 게시 뒤에도 바꿀 수 있는 것 |
|---|---|
| 코드, 런타임, 핸들러, 아키텍처, 메모리, 제한 시간, 환경 변수, 계층, VPC, 실행 역할, DLQ, 임시 스토리지, 로깅·추적 설정, SnapStart 등 | 트리거, 대상(destination), 프로비저닝된 동시성, 비동기 호출 설정, DB 연결·프록시 |

- 게시할 것이 없으면 새 버전이 생기지 않는다. 마지막으로 게시한 버전과 `$LATEST`가 같으면 게시해도 그 버전이 그대로다.
- 예약된 동시성처럼 운영 설정을 바꾸는 것은 새 버전을 만들 이유가 되지 않는다.
- 버전 번호는 계속 커지기만 한다. 함수를 지우고 같은 이름으로 다시 만들어도 예전 번호를 다시 쓰지 않는다.
- 런타임 관리 모드가 Auto면 게시된 버전도 런타임 패치 버전이 자동으로 올라간다. Function update나 Manual이면 그대로다({{ch:lambda/packaging-runtimes}}).

**ARN 두 가지.**

| 형태 | 예 | 뜻 |
|---|---|---|
| 정규화된 ARN(qualified ARN) | `...:function:helloworld:42` | 끝에 버전(또는 별칭)이 붙는다. 그 버전을 가리킨다 |
| 정규화되지 않은 ARN(unqualified ARN) | `...:function:helloworld` | 접미사가 없다. 호출하면 `$LATEST`가 실행된다 |

대부분의 API는 두 형태를 다 받는다. 다만 별칭을 만들 때는 정규화되지 않은 ARN을 쓸 수 없다.

@topic lambda/versions-aliases/aliases

**별칭(alias)** 은 특정 버전을 가리키는 이름표다. 가리키는 버전은 나중에 바꿀 수 있다. `prod`, `beta`처럼 이름을 붙이고, 별칭마다 고유한 ARN(`...:function:helloworld:prod`)이 생긴다. API는 `CreateAlias`, `UpdateAlias`, `DeleteAlias`다.

- 별칭은 버전만 가리킨다. 다른 별칭을 가리킬 수 없다.
- 새 버전을 배포할 때 별칭을 그 버전으로 옮기면 된다. 이전 버전으로 되돌릴 때도 별칭만 다시 옮긴다.

**호출하는 쪽은 별칭을 쓴다.**

- **이벤트 소스와 트리거**: S3 알림이나 이벤트 소스 매핑에 별칭 ARN을 넣어 두면, 버전을 바꿀 때 매핑을 고칠 필요가 없다.
- **리소스 기반 정책**: 권한을 별칭 범위(`--qualifier PROD`)로 주면 버전이 바뀌어도 정책을 고치지 않는다. 이때 호출 쪽은 별칭 ARN으로 불러야 한다. 별칭 없이 부르거나, 별칭이 가리키는 버전 번호로 직접 불러도 권한 오류가 난다. 권한 정책 자체는 {{ch:lambda/permissions}}에서 다룬다.
- **환경 구분**: 같은 함수에 `dev`, `test`, `prod` 별칭을 두고 각각 다른 버전을 가리키게 해 환경을 나눌 수 있다. 버전에 고정된 환경 변수를 함께 쓰면 환경별 설정도 버전과 함께 움직인다({{ch:lambda/configuration}}).

**프로비저닝된 동시성은 버전이나 별칭에 건다.** `$LATEST`에는 걸 수 없다. 별칭에 걸어 두면, 클라이언트가 그 별칭을 호출해야 미리 준비된 환경을 쓴다. 정규화되지 않은 ARN으로 부르면 `$LATEST`가 실행되어 효과가 없다. 값 정하기와 Auto Scaling은 {{ch:lambda/concurrency}}에서 다룬다. SnapStart도 게시된 버전과 그 별칭에만 쓴다({{ch:lambda/execution-environment}}).

@topic lambda/versions-aliases/weighted-routing

**가중치 별칭(weighted alias).** 별칭 하나가 두 버전에 트래픽을 나눠 보낸다. 새 버전에 적은 비율만 먼저 보내 보고, 문제가 있으면 비율을 0으로 돌린다. 이것이 **카나리 배포(canary deployment)** 다. 모든 트래픽을 한 번에 바꾸는 블루/그린 배포와 달리 일부 요청만 새 버전을 탄다.

조건:

- 별칭 하나가 가리킬 수 있는 버전은 {{fact:lambda.alias.routing.max-versions}}까지다.
- 두 버전 모두 게시된 버전이어야 한다. `$LATEST`는 안 된다.
- 두 버전의 실행 역할이 같아야 한다.
- 두 버전의 DLQ 설정이 같거나, 둘 다 없어야 한다.

설정은 `routing-config`의 `AdditionalVersionWeights`로 준다. 추가 버전에 준 비율을 뺀 나머지가 기본 버전으로 간다. 예를 들어 추가 버전에 {{raw:0.05}}를 주면 그 버전이 약 {{raw:5%}}, 기본 버전이 나머지를 받는다. 배포를 끝낼 때는 별칭의 기본 버전을 새 버전으로 바꾸고 가중치를 비운다.

알아 둘 점:

- 나누기는 확률로 한다. 트래픽이 적으면 실제 비율이 설정과 꽤 다를 수 있다.
- 어느 버전이 실행됐는지는 CloudWatch Logs의 `START` 줄(`Version:`), 지표의 `ExecutedVersion` 차원, 동기 호출 응답의 `x-amz-executed-version` 헤더로 안다.
- 프로비저닝된 동시성을 쓰는 함수라면, 가중치 라우팅이 걸려 있는 동안 프로비저닝 값을 넉넉히 두어야 넘침(spillover) 호출을 피한다.
- 아키텍처를 x86_64에서 arm64로 바꾸는 것처럼 성능을 비교하며 옮길 때도 이 방법을 쓴다({{ch:lambda/configuration}}).

@topic lambda/versions-aliases/codedeploy

가중치를 손으로 올리는 대신 **AWS CodeDeploy** 가 단계적으로 옮기게 할 수 있다. CodeDeploy의 배포 플랫폼을 AWS Lambda로 고르면, 원래 버전에서 새 버전으로 별칭의 트래픽을 배포 구성(deployment configuration)대로 옮긴다. 밑에서 쓰는 것은 앞 절의 가중치 별칭이다.

**배포 구성.** 미리 정의된 구성은 세 종류다(이름 앞에 `CodeDeployDefault.`가 붙는다). 사용자 지정 카나리·선형 구성도 만들 수 있다.

| 종류 | 미리 정의된 구성 | 트래픽 이동 |
|---|---|---|
| 카나리(Canary) | `LambdaCanary10Percent5Minutes`, `…10Minutes`, `…15Minutes`, `…30Minutes` | 먼저 {{fact:lambda.codedeploy.step.pct}}를 옮기고, 정한 시간({{fact:lambda.codedeploy.canary.wait.5}}~{{fact:lambda.codedeploy.canary.wait.30}}) 뒤 나머지를 한 번에 옮긴다 |
| 선형(Linear) | `LambdaLinear10PercentEvery1Minute`, `…Every2Minutes`, `…Every3Minutes`, `…Every10Minutes` | 정한 간격({{fact:lambda.codedeploy.linear.every.1}}~{{fact:lambda.codedeploy.linear.every.10}})마다 {{fact:lambda.codedeploy.step.pct}}씩 같은 크기로 옮긴다 |
| 한 번에(AllAtOnce) | `LambdaAllAtOnce` | 모든 트래픽을 즉시 옮긴다 |

**수명 주기 후크(hook).** AppSpec 파일의 `hooks`에 검증용 Lambda 함수를 지정한다.

- `BeforeAllowTraffic`: 트래픽을 옮기기 전에 실행한다. 새 버전 설정이 맞는지 미리 확인한다.
- `AfterAllowTraffic`: 트래픽을 모두 옮긴 뒤 실행한다. 통합 테스트 같은 사후 검증을 한다.
- 후크 함수는 `PutLifecycleEventHookExecutionStatus`로 `Succeeded`나 `Failed`를 CodeDeploy에 알려야 한다. {{fact:lambda.codedeploy.hook.timeout}} 안에 알리지 않으면 배포는 실패로 처리된다.

**자동 롤백.** 배포 그룹에 CloudWatch 경보와 롤백 조건을 설정한다. 배포가 실패하거나(후크 실패 포함) 경보가 울리면 CodeDeploy가 트래픽을 원래 버전으로 되돌린다. CodeDeploy의 롤백은 이전에 배포한 리비전을 새 배포로 다시 내보내는 방식이다. 경보는 보통 별칭과 새 버전의 `Errors` 지표에 건다. 개별 배포에서 그룹의 롤백 설정을 덮어쓸 수도 있다.

**AWS SAM으로 묶기.** SAM 템플릿의 `AWS::Serverless::Function`에 두 속성을 쓰면 위 구성을 SAM이 만든다.

- `AutoPublishAlias: live`: 코드가 바뀐 것(코드 S3 URI의 변화)을 감지해 새 버전을 게시하고, `live` 별칭을 만들거나 그 버전으로 옮긴다. 호출하는 쪽은 이 별칭으로 불러야 한다.
- `DeploymentPreference`: `Type`(예: `Canary10Percent10Minutes`), `Alarms`(롤백을 일으킬 경보 목록), `Hooks`(`PreTraffic`, `PostTraffic` 함수)를 준다. SAM이 CodeDeploy 애플리케이션과 배포 그룹을 만든다.
- 처음 배포할 때는 옮겨 올 이전 버전이 없다. 먼저 `AutoPublishAlias`만으로 한 번 배포하고, 그다음 배포부터 `DeploymentPreference`로 단계적 배포를 한다.

CI/CD 파이프라인 전체(CodePipeline, CodeBuild)는 이 장 범위 밖이다. 이 흐름에서 Lambda가 맡는 부분은 "불변 버전 + 별칭 + 가중치"다.

@sim lambda-alias-shift

@quiz

@design

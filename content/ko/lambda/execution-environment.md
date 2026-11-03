---
chapter: lambda/execution-environment
---

@topic lambda/execution-environment/lifecycle

**실행 환경(execution environment)** 은 함수가 실제로 도는 격리된 공간이다. 함수를 만들 때 정한 메모리와 제한 시간으로 Lambda가 준비한다. 안에는 함수의 런타임 프로세스와 외부 익스텐션(extension) 프로세스가 함께 돈다. 둘은 권한, 자격 증명, 환경 변수를 공유한다. 런타임은 런타임 API로, 익스텐션은 익스텐션 API로 Lambda와 통신한다.

실행 환경은 세 단계를 거친다. 각 단계는 Lambda가 런타임과 익스텐션에 이벤트를 보내면서 시작되고, 모두가 `Next` API 요청을 보내면 끝난다.

| 단계 | 하는 일 |
|---|---|
| 초기화(Init) | 익스텐션 시작 → 런타임 부트스트랩 → 핸들러 밖의 정적 코드 실행 |
| 간접 호출(Invoke) | 이벤트를 받아 핸들러 실행. 함수 제한 시간이 이 단계 전체(런타임 + 익스텐션)를 묶는다 |
| 종료(Shutdown) | 런타임을 끝내고 익스텐션에 `Shutdown` 이벤트를 보내 정리할 시간을 준다 |

**초기화 단계 제한.** 보통 함수의 Init 단계는 {{fact:lambda.init.timeout}}까지다. 이 안에 끝나지 않으면 Lambda는 첫 호출 때 함수 제한 시간을 걸고 Init을 다시 시도한다. 프로비저닝된 동시성, SnapStart, 관리형 인스턴스를 쓰는 함수는 이 제한이 없다. 대신 {{fact:lambda.init.timeout.extended-floor}}와 함수 제한 시간(최대 {{fact:lambda.timeout.max}}) 중 큰 값이 적용된다.

**동결과 재사용.** 호출이 끝나고 처리할 이벤트가 없으면 Lambda는 실행 환경을 **동결(freeze)** 한다. 다음 요청이 같은 함수로 오면 녹여서(thaw) 다시 쓴다. 얼마나 오래 남겨 두는지는 문서에 수치가 없다("일정 기간"). 그리고 계속 호출되는 함수라도 런타임 업데이트와 유지 관리를 위해 몇 시간마다 실행 환경을 바꾼다. 실행 환경이 영원히 남는다고 가정하면 안 된다.

**종료 단계 제한.** 익스텐션 구성에 따라 다르다.

| 등록된 익스텐션 | Shutdown 최대 길이 |
|---|---|
| 없음 | {{fact:lambda.shutdown.max.no-ext}} |
| 내부 익스텐션 | {{fact:lambda.shutdown.max.internal-ext}} |
| 외부 익스텐션 하나 이상 | {{fact:lambda.shutdown.max.external-ext}} |

이 안에 응답하지 않으면 Lambda가 `SIGKILL`로 프로세스를 끝낸다.

**호출 중 실패.** 함수가 Invoke 단계에서 죽거나 제한 시간을 넘기면 Lambda는 실행 환경을 **재설정(reset)** 한다. 종료 단계처럼 런타임을 끝내고 익스텐션에 이유를 담은 `Shutdown` 이벤트를 보낸다. 그 환경이 다음 호출에 쓰이면 Init이 다시 돈다. 이것을 억제된 초기화(suppressed init)라고 하며, 로그에 Init이 따로 찍히지 않고 다음 호출의 시간에 섞여 보인다. 재설정은 `/tmp` 내용을 지우지 않는다.

Init이 실패하거나 시간을 넘기면 `INIT_REPORT` 로그에 오류가 남는다. 성공했을 때는 SnapStart나 프로비저닝된 동시성을 쓰는 함수만 `INIT_REPORT`를 남긴다.

@topic lambda/execution-environment/reuse

실행 환경이 재사용되면 다음이 이어진다.

- **핸들러 밖에서 만든 객체** 는 초기화된 채 남는다. 데이터베이스 연결, SDK 클라이언트를 핸들러 밖에서 만들면 다음 호출이 그대로 쓴다. 연결이 이미 있는지 확인하고 없을 때만 만드는 코드를 넣는다.
- **`/tmp` 디렉터리** 는 동결 중에도 내용이 남는다. 크기는 {{fact:lambda.tmp.min}}부터 {{fact:lambda.tmp.max}}까지 정할 수 있다. 호출 사이의 임시 캐시로 쓸 수 있지만, 쓰기 전에 데이터가 있는지 확인한다.
- **끝나지 않은 백그라운드 작업·콜백** 은 다음에 환경이 녹을 때 이어서 돈다. 핸들러가 끝나기 전에 모두 마무리한다.

예를 들어 Python에서는 다음처럼 클라이언트를 핸들러 밖에 둔다.

```python
import boto3
s3 = boto3.client('s3')          # Init 단계에서 한 번 실행

def lambda_handler(event, context):
    request_id = context.aws_request_id   # 호출마다 바뀌는 값은 핸들러 안에서
    ...
```

**주의할 점.**

- 재사용은 성능 최적화일 뿐 보장이 아니다. 상태는 외부 저장소에 둔다.
- 사용자 데이터, 이벤트, 보안에 민감한 정보를 실행 환경에 남기지 않는다. 다음 호출(다른 사용자일 수 있다)로 새어 나갈 수 있다.
- 한 번의 호출에서만 쓰는 값을 전역 변수에 두지 않는다. 핸들러 안의 지역 변수로 둔다.
- Lambda는 쉬고 있는 연결을 시간이 지나면 끊는다. 끊긴 연결을 다시 쓰면 오류가 나므로 런타임의 keep-alive 설정을 쓴다.

@topic lambda/execution-environment/cold-start

요청이 왔는데 쓸 수 있는 실행 환경이 없으면 Lambda는 새로 만든다. 코드를 내려받고, 환경을 띄우고, 핸들러 밖의 초기화 코드를 실행한 뒤에야 핸들러가 돈다. 앞부분 준비 과정을 흔히 **콜드 스타트(cold start)** 라고 한다. 이미 준비된 환경을 다시 쓰는 경우는 **웜 스타트(warm start)** 다.

- 문서 기준으로 콜드 스타트는 보통 호출의 {{fact:lambda.coldstart.share}}에서 일어나고, 길이는 {{fact:lambda.coldstart.duration-range}} 정도다.
- 자주 호출되지 않는 개발·테스트 함수에서 더 자주 보인다.
- 이 시간도 요금이 청구되고, 그만큼 응답이 늦어진다.
- 온디맨드 함수도 Lambda가 요청보다 먼저 환경을 초기화해 두는 경우가 있다. 문서는 이 동작에 기대지 말라고 한다.

@sim lambda-lifecycle

**콜드 스타트를 줄이는 방법.**

| 방법 | 내용 |
|---|---|
| 정적 초기화 줄이기 | 필요한 라이브러리만 가져온다(SDK 전체 대신 쓰는 서비스 클라이언트만). 일부 경로에서만 쓰는 객체는 처음 쓸 때 만든다(지연 로딩). 초기화가 무거운 함수는 작은 함수 여러 개로 나눈다 |
| 패키지 줄이기 | 배포 패키지와 계층에 든 의존성이 크면 초기화가 길어진다({{ch:lambda/packaging-runtimes}}) |
| 프로비저닝된 동시성(Provisioned Concurrency) | 지정한 수만큼 실행 환경을 미리 초기화해 둔다. 시작 시간을 예측 가능하게 해야 할 때 문서가 권하는 방법이다. 비용이 따로 든다({{ch:lambda/concurrency}}) |
| SnapStart | 초기화한 실행 환경의 스냅샷에서 새 환경을 재개한다(다음 절) |

초기화 코드는 웜 스타트 때 다시 돌지 않는다. 그래서 "핸들러 밖에서 연결을 만들어 재사용"하는 것과 "초기화를 가볍게"하는 것 사이에서 균형을 잡는다. 자주 쓰는 연결은 핸들러 밖에 두고, 드물게 쓰는 무거운 객체는 지연 로딩한다.

@topic lambda/execution-environment/snapstart

**Lambda SnapStart** 는 함수 버전을 게시할 때 Init 단계를 미리 돌린다. 그리고 초기화된 실행 환경의 메모리·디스크 상태를 Firecracker microVM 스냅샷으로 떠서 암호화해 캐시에 둔다. 이후 그 버전을 처음 호출하거나 확장할 때, 새 환경을 처음부터 초기화하지 않고 스냅샷에서 **복원(Restore)** 한다. 복원 단계(런타임 로드 + 복원 후 런타임 후크)는 {{fact:lambda.restore.timeout}} 안에 끝나야 하고, 넘기면 `SnapStartTimeoutException`이 난다.

| 항목 | 내용 |
|---|---|
| 지원 런타임 | Java 11 이상, Python 3.12 이상, .NET 8 이상 (관리형 런타임과 해당 기본 이미지, .zip·컨테이너 이미지) |
| 지원하지 않음 | Node.js·Ruby 등 다른 관리형 런타임, OS 전용 런타임, 프로비저닝된 동시성, Amazon EFS, Amazon S3 Files, 기본값({{fact:lambda.tmp.min}})보다 큰 임시 스토리지 |
| 쓸 수 있는 대상 | 게시된 버전과 버전을 가리키는 별칭만. `$LATEST`에는 못 쓴다({{ch:lambda/versions-aliases}}) |
| 요금 | Java는 추가 요금 없음. Python·.NET은 스냅샷 캐싱(버전마다, 최소 {{fact:lambda.snapstart.cache.min-billing}})과 복원할 때마다 요금 |

SnapStart는 호출이 많은 함수에서 효과가 크다. 드물게 불리는 함수는 개선이 덜할 수 있다. 콜드 스타트 지연 요구가 아주 엄격하면 문서는 프로비저닝된 동시성을 권한다.

**하나의 스냅샷을 여러 환경이 나눠 쓴다** 는 점이 핵심 주의 사항이다.

- **고유성(uniqueness).** 초기화 중에 만든 고유 ID, 비밀 값, 난수 시드는 스냅샷에 담겨 모든 환경에 똑같이 복제된다. 이런 값은 핸들러 안에서 만들거나, 복원 후 런타임 후크(runtime hook)에서 다시 만든다. 난수는 암호학적으로 안전한 난수 생성기(CSPRNG)를 쓴다.
- **네트워크 연결.** 초기화 때 연 연결이 복원 후에도 살아 있다는 보장이 없다. 상태를 확인하고 필요하면 다시 연다. AWS SDK가 연 연결은 대개 자동으로 이어진다.
- **임시 데이터.** 초기화 때 받은 임시 자격 증명이나 저장해 둔 타임스탬프는 낡았을 수 있다. 핸들러에서 쓰기 전에 새로 고친다(이것은 SnapStart를 쓰지 않을 때도 권장된다).

런타임 후크는 스냅샷 직전(before-checkpoint)과 복원 직후(after-restore)에 코드를 돌리는 장치다. 복원 후 후크의 실행 시간도 요금에 들어간다.

@quiz

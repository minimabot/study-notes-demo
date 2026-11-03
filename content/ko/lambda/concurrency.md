---
chapter: lambda/concurrency
---

@topic lambda/concurrency/basics

**동시성(Concurrency)** 은 함수가 같은 순간에 처리하고 있는 요청 수다. 실행 환경 하나는 한 번에 요청 하나만 처리한다. 그래서 동시에 요청이 열 개 들어와 있으면 실행 환경이 열 개 필요하다. 요청이 끝난 실행 환경은 다음 요청에 재사용되고, 비어 있는 환경이 없을 때만 새 환경을 만든다(콜드 스타트, {{ch:lambda/execution-environment}}).

**필요한 동시성 어림하기.**

> 동시성 = 평균 초당 요청 수 × 평균 실행 시간(초)

- 초당 {{raw:100건}}, 평균 {{raw:1초}}면 동시성은 {{raw:100}}이다.
- 같은 초당 {{raw:100건}}이라도 평균 {{raw:0.5초}}면 {{raw:50}}이다. 환경 하나가 초당 두 건씩 처리하는 셈이다.
- 동시성은 초당 요청 수와 다르다. 실행 시간이 짧을수록 같은 요청 수에 필요한 동시성이 줄어든다.

**계정 동시성 할당량.** 한 리전의 모든 함수가 나눠 쓰는 동시성 합계다. 기본값은 {{fact:lambda.concurrency.account.default}}이고 Service Quotas로 늘려 달라고 요청한다. 새 계정은 이보다 낮게 시작해 사용량에 따라 자동으로 올라갈 수 있다.

**요청 수 한도도 함께 본다.** 동시성과 별개로, 동기 호출에는 초당 요청 수 한도가 있다. 한도는 동시성 × {{fact:lambda.rps-per-env.sync}}다. 계정 동시성이 기본값이면 계정 전체가 받을 수 있는 동기 요청은 그 곱만큼이다.

- 평균 실행 시간이 아주 짧은 함수는 동시성은 넉넉한데 요청 수 한도에 먼저 걸릴 수 있다. 예: 평균 {{raw:50 ms}}에 초당 {{raw:20,000건}}이면 동시성은 {{raw:1,000}}이지만, 요청 수 한도가 그 절반이라 스로틀된다. 이때는 계정 동시성 자체를 올려야 한다.
- 문서는 이 한도를 "실행 환경 하나가 그만큼만 처리한다"로 읽으면 안 된다고 한다. Lambda는 환경 하나하나가 아니라 전체 동시성과 전체 요청 수로 판정한다.
- 비동기 호출은 실행 환경당 요청 수 제한이 없고, 쓸 수 있는 동시성으로만 제한된다.

@sim lambda-concurrency-calc

@topic lambda/concurrency/scaling-throttling

**확장 속도(concurrency scaling rate).** 갑작스러운 폭주에 지나치게 늘어나는 것을 막으려고, Lambda는 함수마다 늘어나는 속도를 제한한다. 함수별로 {{fact:lambda.scaling.rate}}까지 늘어난다(요청 수로 보면 같은 구간마다 그 수 × {{fact:lambda.rps-per-env.sync}}).

- 함수별 한도라서 각 함수가 따로 늘어난다.
- 실제로는 구간마다 한 번에 채우지 않고 시간에 따라 꾸준히 채운다. 쓰지 않은 몫은 쌓이지 않는다.
- 늘어나는 속도는 계정 동시성 한도와 다른 개념이다. 속도 한도가 있어도 대부분의 워크로드에는 충분하다고 문서는 설명한다.

**스로틀링(throttling).** 요청이 확장 속도보다 빨리 들어오거나, 함수가 쓸 수 있는 동시성을 다 쓰면 추가 요청은 스로틀된다. HTTP 상태 코드 429, 오류 이름 `TooManyRequestsException`이다. 스로틀 뒤에 무슨 일이 일어나는지는 호출 방식에 따라 다르다.

| 호출 방식 | 스로틀되면 |
|---|---|
| 동기 호출 | 호출한 쪽이 429를 받는다. 재시도는 호출한 쪽(SDK, 클라이언트) 몫이다 |
| 비동기 호출 | Lambda가 이벤트를 내부 대기열에 되돌리고 최대 이벤트 보존 기간 동안 다시 시도한다({{ch:lambda/async-invocation}}) |
| 이벤트 소스 매핑 | Lambda가 폴링 속도를 조절하고 다시 시도한다. SQS는 {{ch:sqs/integrations}}, Kinesis는 {{ch:kinesis/consumers}}, DynamoDB Streams는 {{ch:dynamodb/streams-ttl}} |

@topic lambda/concurrency/reserved

**예약된 동시성(Reserved concurrency).** 함수 하나에 계정 동시성 일부를 떼어 주는 설정이다. 이 값이 그 함수의 **최솟값이자 최댓값** 이 된다.

- 떼어 준 몫은 다른 함수가 쓸 수 없다. 중요한 함수가 다른 함수 때문에 동시성을 못 얻는 일을 막는다.
- 반대로 그 함수는 예약한 값을 넘어 늘어나지 못한다. 남는 동시성이 계정에 있어도 쓰지 못하고 스로틀된다. 이 성질로 DB 연결처럼 처리량이 정해진 하위 리소스가 넘치지 않게 막는다.
- 함수가 예약분을 다 쓰지 않아도 다른 함수는 그 몫을 쓸 수 없다. 남는 몫은 낭비된다.
- 예약에는 요금이 없다.

**예약하지 않은 풀.** 예약이 없는 함수들은 남은 동시성을 함께 나눠 쓴다. Lambda는 계정 한도와 관계없이 이 풀에 늘 {{fact:lambda.concurrency.unreserved.min}}을 남긴다. 그래서 기본 할당량에서 예약할 수 있는 합계는 {{fact:lambda.concurrency.reservable.default}}이고, 계정 한도를 올리면 그만큼 늘어난다. 함수 하나에 계정 동시성 전부를 예약할 수는 없다.

**동시성을 0으로.** 예약된 동시성을 0으로 두면 함수가 전혀 실행되지 않는다. 문제가 생긴 함수를 급히 멈출 때 쓴다. 비동기 호출 함수라면 새 이벤트가 재시도 없이 바로 DLQ나 실패 시 대상으로 간다.

**값 정하기.** CloudWatch의 `ConcurrentExecutions` 최댓값을 보고 그 이상으로 잡거나, 위 공식에 `Invocations`와 `Duration` 지표를 넣어 어림한다. 하위 리소스가 견디는 처리량도 함께 따진다.

API는 `PutFunctionConcurrency`, `GetFunctionConcurrency`, `DeleteFunctionConcurrency`다. Amazon MQ 이벤트 소스 매핑에는 따로 정해진 최대 동시성이 있어, 예약·프로비저닝 설정으로 바뀌지 않는다.

@topic lambda/concurrency/provisioned

**프로비저닝된 동시성(Provisioned concurrency).** 정한 수만큼 실행 환경을 미리 초기화해 두는 설정이다. 초기화 코드가 할당 시점에 이미 돌았으므로 요청이 오면 바로 처리한다. 콜드 스타트 지연에 민감한 웹·모바일 같은 대화형 워크로드에 맞다. 데이터 처리 파이프라인 같은 비동기 워크로드에는 대개 필요 없다.

| 구분 | 예약된 동시성 | 프로비저닝된 동시성 |
|---|---|---|
| 뜻 | 함수가 쓸 수 있는 실행 환경 수의 상한(이자 보장) | 미리 초기화해 둔 실행 환경 수 |
| 콜드 스타트 | 요청이 올 때 환경을 만들므로 생길 수 있다 | 미리 만들어 두므로 거의 없다 |
| 다 쓰면 | 스로틀된다 | 예약된 동시성이 없으면 예약하지 않은 풀로 넘친다(콜드 스타트 가능). 예약이 있으면 예약 상한까지 쓰고 그 뒤 스로틀 |
| 요금 | 없다 | 추가 요금. 쓰지 않아도 할당된 동안 과금된다 |

알아 둘 규칙:

- **버전이나 별칭에만 설정한다.** `$LATEST`에는 설정할 수 없다. 이벤트 소스나 클라이언트가 그 버전·별칭을 호출해야 효과가 있다. 콜드 스타트가 계속 보이면 호출 대상이 맞는지부터 본다({{ch:lambda/versions-aliases}}).
- 예약된 동시성과 함께 쓸 수 있다. 이때 프로비저닝된 값은 예약된 값을 넘을 수 없다. 버전·별칭들의 프로비저닝 합계가 예약값과 같으면 `$LATEST`는 스로틀된다.
- 바로 켜지지 않는다. 준비에 잠시 걸리고, 함수별로 {{fact:lambda.pc.allocation-rate}}씩 할당한다. 요청한 수를 모두 할당해야 쓸 수 있다.
- 동기 요청 수 한도도 프로비저닝된 수 × {{fact:lambda.rps-per-env.sync}}로 따로 걸린다. 이를 넘거나 동시성을 넘으면 일반 동시성으로 넘친다.
- 문서는 평소 최대 동시성에 {{fact:lambda.pc.buffer.recommended}} 정도 여유를 더하라고 제안한다.
- 초기화를 핸들러 밖으로 최대한 옮기면 그 비용을 할당 시점에 미리 치른다. 실행 환경 안에서는 `AWS_LAMBDA_INITIALIZATION_TYPE` 환경 변수로 `provisioned-concurrency`인지 `on-demand`인지 알 수 있다.
- Lambda는 뒤에서 환경을 재활용하므로, 프로비저닝을 써도 드물게 초기화 지연이 생길 수 있다.
- Java 런타임은 추가 요금 없는 Lambda SnapStart로도 시작 지연을 줄일 수 있다. 같은 버전에 SnapStart와 프로비저닝된 동시성을 함께 쓸 수는 없다.

**Application Auto Scaling으로 자동 조정.** 별칭(또는 버전)을 확장 대상(`lambda:function:ProvisionedConcurrency`)으로 등록하고 정책을 붙인다. 먼저 초기 프로비저닝 값을 설정해 둔다.

- 예측 가능한 피크: 예약 조정(scheduled scaling).
- 예측하기 어려운 트래픽: `LambdaProvisionedConcurrencyUtilization` 지표의 목표 추적(target tracking). 목표는 {{fact:lambda.pc.target.min}}~{{fact:lambda.pc.target.max}} 사이로 준다. 두 CloudWatch 경보를 만들어 늘리고 줄인다.
- 경보는 기본적으로 평균 통계를 쓰고, 부하가 {{fact:lambda.pc.autoscaling.sustain}} 이상 이어져야 늘린다. 짧게 튀는 트래픽이면 최대(Maximum) 통계가 더 낫다.
- 요청이 없으면 사용률 지표가 나오지 않아 경보가 `INSUFFICIENT_DATA`가 되고 조정이 멈춘다. 예상 못한 요금으로 이어질 수 있다.

@topic lambda/concurrency/monitoring

동시성 지표의 세분성은 {{fact:lambda.metrics.concurrency.period}}이다.

| 지표 | 뜻 (권장 통계) |
|---|---|
| `ConcurrentExecutions` | 지금 실행 중인 호출 수. 함수·버전·별칭별 (MAX) |
| `UnreservedConcurrentExecutions` | 예약하지 않은 풀을 쓰는 호출 수. 리전 전체 (MAX) |
| `ClaimedAccountConcurrency` | 온디맨드 호출에 쓸 수 없는 동시성. 예약하지 않은 풀 사용량 + 할당된 동시성 (MAX) |
| `ProvisionedConcurrentExecutions` | 프로비저닝된 환경 중 실제 처리 중인 수 (MAX) |
| `ProvisionedConcurrencyUtilization` | 위 값 ÷ 할당된 프로비저닝 수 (MAX) |
| `ProvisionedConcurrencyInvocations` | 프로비저닝된 환경에서 실행된 호출 횟수 (SUM) |
| `ProvisionedConcurrencySpilloverInvocations` | 프로비저닝을 다 써서 일반 동시성으로 넘친 호출 횟수 (SUM) |

- **넘침(spillover)이 많으면** 프로비저닝된 동시성이 모자란 것이다. 늘리거나 Auto Scaling을 붙인다. 사용률이 계속 낮으면 너무 많이 할당한 것이다.
- `ProvisionedConcurrencyInvocations` + `ProvisionedConcurrencySpilloverInvocations` = 전체 `Invocations`다.
- **`ClaimedAccountConcurrency`가 계정 여유를 보여 준다.** Lambda는 남은 동시성을 판단할 때 실제 실행 수(`ConcurrentExecutions`)가 아니라 이 값을 쓴다. 예약·프로비저닝을 많이 걸어 두면 실제 사용이 적어도 이미 "점유"된 것으로 본다. 할당된 동시성은 모든 함수의 예약 합계에, 예약 없이 프로비저닝만 쓴 함수의 프로비저닝 합계를 더한 값이다.
- 이 값을 `SERVICE_QUOTA(ConcurrentExecutions)`로 나눠 계정 사용률을 만들고, 경보를 걸어 한도 증가를 미리 요청한다.
- CLI `get-account-settings`의 `UnreservedConcurrentExecutions`는 아직 예약할 수 있는 동시성을 보여 준다.

@quiz

@design

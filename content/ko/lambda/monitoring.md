---
chapter: lambda/monitoring
---

@topic lambda/monitoring/metrics

Lambda는 따로 설정하지 않아도 함수마다 지표를 Amazon CloudWatch에 보낸다. 무엇을 어떤 통계로 보느냐가 중요하다.

**호출 지표(invocation metrics).** 호출 하나마다 결과를 1로 기록하는 지표다. 합계(`Sum`) 통계로 본다.

| 지표 | 뜻 |
|---|---|
| `Invocations` | 함수 코드가 실행된 횟수. 성공과 함수 오류를 모두 센다. 청구되는 요청 수와 같다 |
| `Errors` | 함수 오류로 끝난 호출 수. 코드가 던진 예외와 런타임 오류(제한 시간 초과 등)를 센다 |
| `Throttles` | 스로틀된 호출 요청 수 |
| `DeadLetterErrors` | 비동기 호출에서 DLQ로 보내려다 실패한 횟수 |
| `DestinationDeliveryFailures` | 비동기 호출·스트림 이벤트 소스 매핑에서 대상으로 보내려다 실패한 횟수 |
| `RecursiveInvocationsDropped` | 재귀 루프로 판단해 Lambda가 멈춘 호출 수 |

- **스로틀은 `Invocations`에도 `Errors`에도 들어가지 않는다.** 요청이 함수 코드에 닿지 못했기 때문이다. 클라이언트는 429를 받는데 `Errors`가 0이면 `Throttles`를 본다({{ch:lambda/concurrency}}).
- 오류율은 `Errors` ÷ `Invocations`로 구한다. `Errors`의 시각은 오류가 난 때가 아니라 호출이 시작된 때다.
- 재귀 루프 감지는 지원되는 AWS SDK가 붙이는 메타데이터로 요청 체인을 따라간다. 같은 체인에서 함수가 {{fact:lambda.recursion.threshold}} 불리면 다음 호출을 버린다.

**성능 지표(performance metrics).** 평균(`Average`)이나 최대(`Max`)로 본다.

- `Duration`: 이벤트를 처리하는 데 쓴 시간. 콜드 스타트의 초기화 시간은 들어가지 않는다. 백분위수(`p95`, `p99`)도 지원한다. 평균은 느린 소수 호출을 가린다. 가끔 생기는 지연은 백분위수와 최대로 찾는다.
- `PostRuntimeExtensionsDuration`: 함수 코드가 끝난 뒤 익스텐션이 더 쓴 시간({{ch:lambda/layers-extensions}}).
- `IteratorAge`(DynamoDB·Kinesis·DocumentDB)와 `OffsetLag`(Kafka): 이벤트 소스 매핑이 밀리는지 보여 준다({{ch:lambda/event-source-mappings}}).

**동시성 지표.** `ConcurrentExecutions` 등은 최대 통계로 본다. 자세한 내용은 {{ch:lambda/concurrency}}에 있다.

**비동기 호출 지표.** 비동기 대기열의 상태를 보여 준다({{ch:lambda/async-invocation}}).

| 지표 | 뜻 |
|---|---|
| `AsyncEventsReceived` | Lambda가 대기열에 넣은 이벤트 수. `Invocations`와 차이가 크면 밀리거나 버려지는 이벤트가 있다 |
| `AsyncEventAge` | 대기열에 들어간 뒤 함수가 호출되기까지의 시간. 재시도·스로틀이 많으면 오른다 |
| `AsyncEventsDropped` | 함수를 성공적으로 처리하지 못한 채 버린 이벤트 수(보존 기간 만료, 재시도 소진, 예약된 동시성 0 등). DLQ나 실패 시 대상이 있으면 버리기 전에 그쪽으로 보낸다 |

`AsyncEventAge`나 `AsyncEventsDropped`가 오르면 원인은 대개 둘 중 하나다. `Errors`가 높으면 함수 오류, `Throttles`가 높으면 동시성 부족이다.

**이벤트 소스 매핑 지표.** SQS, Kinesis, DynamoDB, Kafka 매핑은 지표 그룹(`EventCount`, `ErrorCount`, `KafkaMetrics`)을 켜야 `PolledEventCount`, `FilteredOutEventCount`, `FailedInvokeEventCount`, `DroppedEventCount` 같은 지표가 나온다. 매핑을 끄면 이 지표도 나오지 않는다.

**경보(alarm).** 지표에 CloudWatch 경보를 걸어 Amazon SNS로 알리거나 다른 조치를 부른다. 흔한 조합은 오류율, `Throttles` 합계, `Duration` p99(제한 시간에 가까워지는지), `IteratorAge` 최대, `AsyncEventAge` 최대다.

@topic lambda/monitoring/logs

**기본 동작.** 실행 역할에 권한이 있으면 Lambda는 모든 호출의 로그를 CloudWatch Logs에 보낸다. 로그 그룹은 처음 호출될 때 `/aws/lambda/<함수 이름>`으로 생긴다. 코드가 표준 출력이나 런타임 로거로 남긴 로그(애플리케이션 로그)와 Lambda가 남기는 `START`, `END`, `REPORT` 같은 로그(시스템 로그)가 함께 쌓인다. `REPORT` 줄에는 실행 시간, 청구 시간, 설정 메모리, 최대 사용 메모리, 초기화 시간이 나온다.

- 필요한 권한은 `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`다. AWS 관리형 정책 `AWSLambdaBasicExecutionRole`에 들어 있다({{ch:lambda/permissions}}).
- 로그 사용에 Lambda 추가 요금은 없고, CloudWatch Logs 요금이 붙는다.

**고급 로깅 제어(advanced logging controls).** 함수의 로깅 구성(`LoggingConfig`)에서 세 가지를 정한다.

| 설정 | 내용 |
|---|---|
| 로그 형식(`LogFormat`) | `Text`(기본값) 또는 `JSON` |
| 로그 수준 | 애플리케이션 로그(`ApplicationLogLevel`)와 시스템 로그(`SystemLogLevel`)를 따로 정한다. **JSON 형식일 때만** 쓴다 |
| 로그 그룹 | 기본 그룹 대신 사용자 지정 그룹. 여러 함수가 한 그룹을 함께 쓸 수 있다 |

- **JSON 형식.** 로그가 키-값 쌍이 되어 검색·필터·자동 분석이 쉬워진다. 애플리케이션 로그에는 `timestamp`, `level`, `message`, `requestId`가 들어간다. 문서는 기존 도구가 일반 텍스트에 기대고 있지 않다면 JSON을 고르라고 권한다. 로그 크기는 조금 커진다.
- 지원되는 런타임의 기본 로거(Node.js `console`, Python `logging`, Java `LambdaLogger`·Log4j2 등)를 쓰면 코드를 바꾸지 않아도 JSON으로 나간다. 다른 런타임은 Powertools for AWS Lambda처럼 JSON을 쓰는 라이브러리를 쓴다. 이미 JSON인 로그는 두 번 감싸지 않는다.
- **로그 수준 필터.** 고른 수준과 그보다 심각한 수준만 보낸다. 애플리케이션 로그는 `TRACE`~`FATAL`, 시스템 로그는 `DEBUG`·`INFO`·`WARN`이다. 수준이 없는 로그는 `INFO`로 본다. 형식만 JSON으로 바꾸고 수준을 정하지 않으면 둘 다 `INFO`가 된다. 코드에서 직접 수준을 정하면(예: Python `setLevel()`) 그 값이 우선한다.
- 운영에서는 `INFO`나 `WARN`으로 두어 비용을 줄이고, 조사할 때만 `DEBUG`로 내린다. 코드 배포 없이 구성만 바꾸면 된다.
- 사용자 지정 로그 그룹 이름은 `aws/`로 시작할 수 없다. 그러면 로그가 전달되지 않는다. CLI로 로그 그룹을 바꿀 때는 Lambda가 실행 역할에 권한을 자동으로 넣어 주지 않는다.
- 형식을 바꿔도 이미 저장된 로그는 바뀌지 않는다. Node.js에서 EMF(embedded metric format) 로그를 쓰면 JSON으로 바꾼 뒤 지표가 인식되는지 시험한다.

**로그 대상.** CloudWatch Logs가 기본이다. 콘솔에서 Amazon S3(장기 보관, Athena 분석)나 Amazon Data Firehose(OpenSearch Service나 외부 관측성 도구로 전달)로 보낼 수도 있다. S3·Firehose에 쓸 권한은 Lambda가 자동으로 넣지 않는다.

**로그 찾기.** Lambda 콘솔의 모니터링 탭, CloudWatch 콘솔, AWS CLI로 본다. CloudWatch Logs Insights로 로그 그룹을 질의하면 `Task timed out` 같은 오류만 골라 세거나 `requestId`로 한 호출의 로그를 모을 수 있다. Live Tail로 실시간으로 볼 수도 있다.

**로그가 안 보일 때.**

| 증상 | 확인할 것 |
|---|---|
| 로그가 전혀 없다 | 실행 역할의 CloudWatch Logs 권한. 권한을 더한 뒤 코드나 구성을 살짝 바꿔 이전 자격 증명을 쓰는 실행 환경을 교체한다 |
| 방금 호출했는데 없다 | 나타나기까지 {{fact:lambda.logs.visible-delay}} 걸릴 수 있다 |
| 일부만 빠진다 | 계정이 CloudWatch Logs API 할당량(`PutLogEvents` 등)에 걸렸거나, 로그 스트림 하나의 출력이 {{fact:lambda.logs.drop-rate}}를 넘었다. JSON 형식이면 Lambda가 `logsDropped` 이벤트를 남기려 한다 |

함수 구성 변경 같은 Lambda API 호출 기록은 AWS CloudTrail에 남는다. 로그와는 다른 감사 기록이다.

@topic lambda/monitoring/xray

**AWS X-Ray** 는 요청이 여러 서비스를 거치는 경로를 추적(trace)으로 보여 준다. 서비스 맵에서 느린 구간과 오류가 난 구간을 찾는다.

**추적 모드.**

| 모드 | 동작 |
|---|---|
| 활성 추적(`Active`) | 샘플링된 요청마다 Lambda가 추적 세그먼트를 만들어 X-Ray에 보낸다 |
| `PassThrough`(기본값) | 추적 헤더만 하위 서비스로 넘기고 추적은 보내지 않는다. 상위 서비스가 샘플링하기로 정한 요청이라도 마찬가지다 |

- 예전에는 API Gateway 같은 상위 서비스가 추적 헤더를 붙이면 Lambda가 추적을 자동으로 보냈다. 지금은 그렇지 않으므로, 함수 추적이 필요하면 활성 추적을 켠다.
- 샘플링 비율은 {{fact:lambda.xray.sampling}}이다. 모든 요청을 추적하지 않는다. 함수에서 이 비율을 바꿀 수 없다. 대개 API Gateway 같은 상위 서비스가 샘플링 여부를 정하고, Lambda는 추적 헤더의 결정을 따른다.
- SQS 같은 메시지 생산자의 추적은 뒤의 Lambda 추적과 자동으로 이어진다. Kafka(MSK·자체 관리형), Amazon MQ, DocumentDB 이벤트 소스 매핑은 X-Ray 추적을 지원하지 않는다.

**권한과 설정.**

- 실행 역할에 `xray:PutTraceSegments`, `xray:PutTelemetryRecords`가 필요하다. AWS 관리형 정책 `AWSXRayDaemonWriteAccess`에 들어 있다. 콘솔에서 켜면 Lambda가 권한을 넣어 주지만, CLI·CloudFormation으로 켜면 직접 넣는다.
- CLI·API는 `UpdateFunctionConfiguration`의 `TracingConfig`(`Mode=Active`), CloudFormation은 `TracingConfig`, AWS SAM은 `Tracing` 속성이다.
- 추적 모드는 버전별 구성이다. 게시된 버전에서는 바꿀 수 없다. 새 버전을 게시한다({{ch:lambda/versions-aliases}}).

**추적 읽기.** 추적 하나에 세그먼트가 두 개 생긴다.

| 세그먼트 | 담는 것 |
|---|---|
| `AWS::Lambda` | Lambda 서비스 쪽 일. 실행 환경 준비, 코드·계층 내려받기 |
| `AWS::Lambda::Function` | 함수가 한 일. 초기화(`Init`)와 호출 처리, 코드에서 만든 하위 세그먼트 |

- `AWS::Lambda`에 오류가 있으면 Lambda 서비스 쪽 문제, `AWS::Lambda::Function`에 오류가 있으면 함수 쪽 문제다.
- 초기화 하위 세그먼트가 보이면 그 호출이 콜드 스타트였다는 뜻이다. 프로비저닝된 동시성이나 미리 초기화된 환경이면 초기화와 호출 사이에 긴 틈이 보일 수 있다.
- 하위 서비스 호출(DynamoDB, 외부 HTTP)을 하위 세그먼트로 남기려면 코드에서 X-Ray SDK, AWS Distro for OpenTelemetry(ADOT), Powertools의 Tracer로 계측한다. 주석(annotation)을 달면 그 값으로 추적을 검색할 수 있다.
- 문서에 따르면 함수 세그먼트의 하위 구조가 바뀌는 중이다. 예전 형식은 `Initialization`·`Invocation`·`Overhead` 하위 세그먼트, 새 형식은 `Init` 하위 세그먼트와 `aws.responseLatency` 같은 주석으로 보여 준다.

@topic lambda/monitoring/insights-signals-powertools

기본 지표·로그·추적으로 모자랄 때 쓰는 도구들이다.

| 도구 | 하는 일 | 켜는 방법 |
|---|---|---|
| CloudWatch Lambda Insights | CPU 시간, 메모리, 디스크, 네트워크 사용량과 콜드 스타트 같은 시스템 수준 지표를 모은다 | Lambda Insights 익스텐션을 계층으로 붙인다. 실행 역할에 `CloudWatchLambdaInsightsExecutionRolePolicy` |
| CloudWatch Application Signals | 요청 수, 가용성, 지연, 오류·장애율을 모아 애플리케이션 성능 대시보드와 서비스 수준 목표(SLO)를 만든다 | 콘솔에서 켜면 ADOT 계층, 실행 역할 정책, `AWS_LAMBDA_EXEC_WRAPPER` 환경 변수를 Lambda가 넣는다 |
| Powertools for AWS Lambda | 코드 안에서 구조화 로그(Logger), 추적(Tracer), 사용자 지정 지표(Metrics)를 쉽게 만든다 | 라이브러리나 계층으로 넣는다. Python, TypeScript, Java, .NET |

- **Lambda Insights** 는 호출마다 성능 로그를 하나({{fact:lambda.insights.log-per-invoke}}) `/aws/lambda-insights/` 로그 그룹에 남기고, CloudWatch가 EMF로 지표를 뽑는다. 함수마다 {{fact:lambda.insights.metrics}} 요금이 붙고, 호출이 없으면 요금도 없다. 메모리 사용률이 한도에 가까운 함수, 갑자기 느려진 함수를 찾는 데 쓴다. 익스텐션을 지원하는 런타임에서 쓸 수 있다.
- **Application Signals** 는 지원 런타임이 정해져 있다. 함수에 X-Ray SDK 계측 코드가 남아 있으면 계층의 계측과 부딪치므로 지운다. 처음 쓸 때 CloudWatch 콘솔에서 한 번 서비스 검색을 설정하고, 데이터가 보이기까지 {{fact:lambda.appsignals.data-delay}} 걸릴 수 있다.
- **사용자 지정 지표.** 코드에서 업무 지표(주문 수, 외부 API 실패 수)를 남기려면 EMF 형식으로 로그를 쓰는 것이 간단하다. CloudWatch가 로그에서 지표를 뽑으므로 `PutMetricData`를 동기로 부르지 않아도 된다. Powertools의 Metrics가 EMF를 쓴다.
- 익스텐션으로 텔레메트리를 외부 도구에 보내는 방법(Telemetry API)은 {{ch:lambda/layers-extensions}}에 있다.

@topic lambda/monitoring/troubleshooting

자주 만나는 증상과 원인이다. 먼저 `REPORT` 로그, `Duration`·`Errors`·`Throttles` 지표, X-Ray 추적으로 어느 단계에서 생긴 일인지 가른다.

**제한 시간 초과(`Task timed out`).** 제한 시간 기본값은 {{fact:lambda.timeout.default}}, 최댓값은 {{fact:lambda.timeout.max}}다({{ch:lambda/configuration}}).

| 원인 | 단서와 조치 |
|---|---|
| 하위 서비스(외부 API, DB)가 늦게 응답 | X-Ray에서 해당 하위 세그먼트가 길다. 호출마다 SDK·HTTP 클라이언트 제한 시간을 함수 제한 시간보다 짧게 두고, 재시도(백오프)·오류 처리를 넣는다 |
| 메모리·CPU 부족 | `REPORT`의 최대 사용 메모리가 설정값에 가깝거나, 로컬보다 훨씬 느리다. 메모리를 늘리면 CPU도 비례해 늘어난다 |
| 제한 시간이 평균 실행 시간에 너무 가깝다 | 큰 파일, 큰 입력이 올 때만 넘는다. 상한에 가까운 데이터로 시험하고 여유를 둔다 |
| 초기화(Init) 단계 초과 | 다음 호출에서 Init을 다시 하는데(suppressed init), 제한 시간이 짧으면 또 넘는다. 제한 시간·메모리를 늘리거나 초기화 코드를 줄인다({{ch:lambda/execution-environment}}) |
| VPC 연결 뒤 외부 호출 | 인터넷 경로(NAT 게이트웨이)나 VPC 엔드포인트가 없다. 네트워크 ACL이 임시 포트를 막으면 가끔만 실패한다({{ch:lambda/networking}}) |
| 웜 호출이 쌓일수록 느려짐 | 전역 변수·라이브러리가 호출마다 메모리를 키우는 누수. 실행 환경이 다시 만들어지면 잠시 정상으로 돌아온다 |

**하위 서비스가 버티지 못할 때.** Lambda는 빨리 늘어나므로 서버리스가 아닌 하위 서비스가 밀릴 수 있다. 문서는 세 가지를 든다. 자주 바뀌지 않는 값은 캐시한다. 쓰기는 SQS 큐를 사이에 둔다. RDS처럼 연결을 오래 잡는 대상은 RDS Proxy로 연결을 모은다. 예약된 동시성으로 상한을 둘 수도 있다({{ch:lambda/concurrency}}).

**권한 오류.**

- `not authorized to perform: lambda:InvokeFunction`: 호출하는 사용자·역할에 호출 권한이 없다. 다른 서비스나 계정이 부르면 함수의 리소스 기반 정책을 본다({{ch:lambda/permissions}}).
- 함수 안에서 `AccessDeniedException`: 실행 역할에 대상 서비스 권한이 없다.

**그 밖에.**

- 스로틀(429): 동시성·요청 수 한도. `Throttles`, `ConcurrentExecutions`를 본다({{ch:lambda/concurrency}}).
- 바라지 않은 버전이 실행됨: 호출하는 쪽이 어느 버전·별칭을 부르는지 확인한다. `ExecutedVersion` 차원으로 지표를 나눠 볼 수 있다({{ch:lambda/versions-aliases}}).
- 비동기 콜백이 다음 호출에서 실행됨(Node.js): 핸들러가 비동기 작업을 기다리지 않고 끝났다. `async`/`await`로 기다린다.

@quiz

@design

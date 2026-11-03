---
chapter: lambda/overview
---

@topic lambda/overview/what-is

**AWS Lambda** 는 서버를 만들거나 관리하지 않고 코드를 실행하는 서버리스(serverless) 컴퓨팅 서비스다. 개발자는 코드와 설정만 올린다. 그 아래의 서버 유지 관리, 용량 준비, 확장, 운영 체제 패치, 로그 수집은 Lambda가 맡는다.

| 누가 | 맡는 일 |
|---|---|
| 개발자 | 함수 코드, 메모리·제한 시간 같은 설정, 권한(실행 역할·리소스 기반 정책) |
| Lambda | 서버와 운영 체제, 용량 준비, 자동 확장, 관리형 런타임 보안 패치, 로그 전송 |

함수는 요청이 올 때만 실행되고, 일이 끝나면 멈춘다. 요금도 그에 맞춰 매긴다. 기본 함수는 **요청 수** 와 **실행 시간(메모리 크기 × 실행 시간, GB-초)** 으로 청구된다. 미리 약정할 것은 없다. 요청이 없으면 실행 요금도 없다. 그래서 트래픽이 드물거나 들쭉날쭉한 일에서 비용이 잘 맞는다(비용 계산은 {{ch:lambda/cost}}).

메모리는 {{fact:lambda.memory.min}}부터 {{fact:lambda.memory.max}}까지 고른다. CPU는 따로 고르지 않는다. 메모리에 비례해 배정된다({{ch:lambda/configuration}}).

> 이름 메모: 최근 문서는 기존 Lambda 함수를 **이벤트 함수(Event Functions)** 라고 부른다. 새로 나온 다른 실행 방식과 구분하려는 이름이다. API(`CreateFunction`, `Invoke`), SDK, CLI, `AWS::Lambda::Function`, ARN은 그대로 "function"이다. 코드나 템플릿을 바꿀 필요는 없다. 이 노트에서 "함수"는 이 기본 함수를 뜻한다.

@topic lambda/overview/concepts

Lambda를 이해하려면 아래 용어부터 잡는다.

| 용어 | 뜻 |
|---|---|
| 함수(function) | 이벤트가 오면 실행되는 코드 묶음. 한 가지 일을 맡는다 |
| 핸들러(handler) | 함수 코드 안에서 이벤트를 받아 처리하는 메서드. 함수마다 하나다 |
| 배포 패키지(deployment package) | 코드와 의존성을 묶은 것. .zip 파일 아카이브 또는 컨테이너 이미지 |
| 이벤트(event) | 함수가 처리할 데이터. JSON 문서로 오고, 런타임이 언어 객체로 바꿔 핸들러에 넘긴다 |
| 트리거(trigger) | 이벤트 소스와 함수를 잇는 설정. 함수 하나에 여러 개를 둘 수 있다 |
| 이벤트 소스 매핑(event source mapping) | SQS·Kinesis 같은 큐·스트림을 Lambda가 폴링해 배치로 함수를 부르는 Lambda 리소스 |
| 실행 환경(execution environment) | 함수가 실제로 도는 격리된 환경. Lambda가 만들고 재사용하고 없앤다({{ch:lambda/execution-environment}}) |
| 런타임(runtime) | 실행 환경 안에서 Lambda와 함수 사이에 이벤트와 응답을 전달하는 언어별 환경. 관리형 런타임은 Lambda가 보안 패치를 적용한다. 직접 만든 런타임도 쓸 수 있다 |

**트리거와 이벤트 소스 매핑은 다르다.** S3, SNS, API Gateway는 이벤트가 생기면 Lambda를 직접 부른다(push). 이 설정은 이벤트를 내는 서비스 쪽에 저장된다. 반면 SQS, Kinesis, DynamoDB Streams, Amazon MQ, Kafka, DocumentDB는 Lambda가 소스를 읽어 온다(poll). 이때 쓰는 이벤트 소스 매핑은 Lambda 쪽 리소스다. 자세한 차이는 {{ch:lambda/invocation}}에서 다룬다.

**권한은 두 방향이다.**

- 함수가 다른 AWS 서비스를 쓸 권한: **실행 역할(execution role)**. 모든 함수에 하나씩 반드시 있다. 함수가 호출되면 Lambda가 이 역할을 수임한다. 역할 하나를 여러 함수가 같이 쓸 수도 있다. 콘솔에서 함수를 만들면 CloudWatch Logs에 로그를 쓰는 기본 권한만 가진 역할이 자동으로 생긴다({{ch:iam/roles}}).
- 다른 서비스·계정이 함수를 부를 권한: 함수의 **리소스 기반 정책(resource-based policy)** 에 `lambda:InvokeFunction`을 허용한다. 콘솔에서 트리거를 만들면 이 권한이 자동으로 추가된다.

두 경우 모두 최소 권한으로 좁힌다. 예를 들어 S3가 함수를 부르게 할 때는 S3 서비스 전체가 아니라 특정 버킷이나 특정 계정의 버킷으로 한정한다({{ch:lambda/permissions}}).

@topic lambda/overview/when-to-use

문서가 드는 대표 쓰임새는 다음과 같다.

- 파일 처리: S3에 파일이 올라오면 바로 처리
- 데이터베이스 변경 대응: DynamoDB 항목이 바뀔 때 후속 작업({{ch:dynamodb/streams-ttl}})
- 예약 작업: EventBridge 일정으로 주기 실행
- 스트림 처리: Kinesis Data Streams 레코드 처리({{ch:kinesis/consumers}})
- 큐 소비: SQS 메시지 처리({{ch:sqs/integrations}})
- 웹·모바일·IoT 백엔드: API Gateway, Application Load Balancer, 함수 URL 뒤에서 요청 처리

**Lambda가 맞지 않는 경우** 도 알아 둔다. 할당량 페이지는 Lambda를 "호출 사이에 상태를 들고 있지 않는, 짧게 끝나는 작업"용이라고 설명한다.

| 상황 | 이유와 대안 |
|---|---|
| 한 번에 오래 도는 작업 | 호출 하나는 최대 {{fact:lambda.timeout.max}}에서 끊긴다. 일을 잘게 나눠 Step Functions로 잇거나, ECS·Fargate·EC2·AWS Batch를 쓴다 |
| 호출 사이에 상태를 꼭 유지해야 하는 일 | 실행 환경은 재사용될 수도 있지만 보장되지 않는다. 상태는 DynamoDB, S3, ElastiCache 같은 외부 저장소에 둔다 |
| 메모리·디스크를 아주 많이 쓰는 일 | 메모리 상한 {{fact:lambda.memory.max}}, `/tmp` 상한 {{fact:lambda.tmp.max}}을 넘는 작업은 EC2 등이 낫다 |
| 큰 요청·응답을 한 번에 주고받는 일 | 동기 호출의 요청·응답은 각각 {{fact:lambda.payload.sync.max}}까지다. 큰 데이터는 S3에 두고 위치만 넘긴다 |
| 늘 일정하게 높은 부하 | 요청 단위 과금이 서버를 계속 켜 두는 방식보다 비쌀 수 있다. 비용을 직접 비교한다({{ch:lambda/cost}}) |
| 첫 요청 지연이 조금도 허용되지 않는 일 | 새 실행 환경을 만들 때 콜드 스타트 지연이 생긴다. 프로비저닝된 동시성 등으로 줄일 수 있지만 비용이 든다({{ch:lambda/execution-environment}}) |

동시 실행 수에도 상한이 있다. 리전당 기본 할당량은 {{fact:lambda.concurrency.account.default}}이고, 계정 안의 모든 함수가 나눠 쓴다({{ch:lambda/concurrency}}).

@topic lambda/overview/new-primitives

최근 Lambda 문서에는 기본 함수 외의 실행 방식이 추가됐다. 2025년 이후에 나온 기능이라 시험 범위에 들어가는지 알 수 없다. 여기서는 이름만 짚고, 자세한 내용은 {{ch:lambda/new-compute-options}}에서 다룬다.

| 기능 | 한 줄 설명 |
|---|---|
| 지속성 함수(Durable functions) | 단계 사이에 체크포인트를 남기며 멈췄다가 이어 가는 장기 워크플로용 함수 |
| Lambda 관리형 인스턴스(Managed Instances) | 고객 계정의 전용 EC2 용량에서 함수를 돌린다. 실행 환경 하나가 여러 요청을 동시에 처리한다 |
| Lambda Web Functions | Node.js HTTP 서버 코드를 그대로 올려 웹 앱·API를 돌리는 방식 |
| Lambda MicroVMs | 사용자·작업마다 따로 쓰는 격리 환경. 일시 중지와 재개를 API로 직접 다룬다 |

이 장과 이어지는 장의 수치(제한 시간 최댓값, 실행 환경당 요청 하나 등)는 별도 언급이 없으면 기본 함수 기준이다.

@quiz

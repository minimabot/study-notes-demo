---
chapter: lambda/function-urls
---

@topic lambda/function-urls/basics

**함수 URL(Function URL)** 은 함수 하나에 붙는 전용 HTTP(S) 엔드포인트다. API Gateway 같은 앞단 없이 HTTP 요청으로 함수를 부른다.

- 주소 모양은 `https://<url-id>.lambda-url.<리전>.on.aws`이다. Lambda가 고유한 주소를 만들어 주고, 한 번 만들면 바뀌지 않는다.
- **별칭이나 `$LATEST`에만** 붙인다. 게시된 버전 번호에는 붙일 수 없다. 운영에서는 별칭에 붙여 두고 별칭이 가리키는 버전을 바꾼다({{ch:lambda/versions-aliases}}).
- IPv4·IPv6 모두 받는다(dual stack). **공용 인터넷으로만** 접근한다. 함수 자체는 AWS PrivateLink를 지원하지만 함수 URL은 지원하지 않는다.
- 모든 리전에서 쓸 수 있는 것은 아니다.
- 함수 URL을 지우면 되살릴 수 없고, 새로 만들면 다른 주소가 나온다. 함수를 지운 직후 같은 이름으로 새 함수를 만들면 예전 URL이 새 함수에 연결될 수 있다. 삭제가 비동기로 처리되기 때문이다.
- 함수 URL 자체에는 추가 요금이 없다. 함수 호출과 실행 시간 요금만 낸다.

**만드는 방법.** 콘솔, CLI(`create-function-url-config`, 함수가 먼저 있어야 함), CloudFormation(`AWS::Lambda::Url`)이 있다. 필수 값은 인증 유형(`AuthType`)과 대상 함수, 선택 값은 별칭(`Qualifier`), CORS, 호출 모드(`InvokeMode`)다.

**호출 모드.** 기본값 `BUFFERED`는 응답을 다 만든 뒤 한 번에 보낸다. 동기 응답 한도({{fact:lambda.payload.sync.max}})가 걸린다. `RESPONSE_STREAM`은 만드는 대로 흘려보내 첫 바이트가 빨리 도착하고, 더 큰 응답({{fact:lambda.streaming.max}})을 보낼 수 있다. 응답 스트리밍의 조건과 대역폭은 {{ch:lambda/configuration}}에서 다룬다.

@topic lambda/function-urls/auth

함수 URL의 접근 제어는 **인증 유형(`AuthType`)** 과 **함수의 리소스 기반 정책** 두 가지로 정한다.

| 인증 유형 | 동작 |
|---|---|
| `AWS_IAM` | IAM으로 인증·인가한다. 요청에 SigV4 서명이 있어야 한다. 호출자의 자격 증명 기반 정책과 함수의 리소스 기반 정책으로 판정한다 |
| `NONE` | Lambda가 인증하지 않는다. 하지만 리소스 기반 정책이 공개 접근을 허용해야 요청을 받는다 |

**필요한 권한.** 함수 URL을 부르려면 `lambda:InvokeFunctionUrl`과 `lambda:InvokeFunction`이 모두 필요하다. 문서에 따르면 2025년 10월부터 새로 만드는 함수 URL에 두 권한이 함께 요구된다. 예전 자료에는 `lambda:InvokeFunctionUrl`만 나온다. CLI의 `add-permission`으로 넣을 때는 두 문장을 따로 추가한다.

**`AWS_IAM`일 때 누가 허용되는가.**

- 같은 계정의 주체: 자격 증명 기반 정책 **또는** 리소스 기반 정책 중 하나가 허용하면 된다.
- 다른 계정의 주체: 자기 계정의 자격 증명 기반 정책 **과** 함수의 리소스 기반 정책이 **모두** 허용해야 한다({{ch:lambda/permissions}}).

**`NONE`일 때.**

- 콘솔이나 AWS SAM으로 만들면 Lambda가 공개 허용 정책을 자동으로 만든다. CLI, CloudFormation, API로 만들면 직접 넣어야 한다. 정책이 없으면 `NONE`이어도 **403 Forbidden** 이 난다.
- 주소를 아는 누구나 함수를 부를 수 있게 된다. 필요하면 함수 코드에서 직접 인증(토큰 검사 등)을 한다.
- 함수 URL을 지워도 이 정책은 남는다. 직접 지운다.

**조건 키.**

| 조건 키 | 쓰임 |
|---|---|
| `lambda:FunctionUrlAuthType` | 정책이 특정 인증 유형(`AWS_IAM`·`NONE`)일 때만 적용되게 한다 |
| `lambda:InvokedViaFunctionUrl` | `lambda:InvokeFunction`을 함수 URL을 거친 호출로만 좁힌다. 없으면 같은 주체가 다른 방법으로도 함수를 부를 수 있다 |

- 문서는 `NONE`일 때 `lambda:InvokedViaFunctionUrl`을 정책에 넣으라고 권한다.
- **조직 단위로 막기.** 서비스 제어 정책(SCP)에서 `lambda:FunctionUrlAuthType`이 `AWS_IAM`이 아닌 `CreateFunctionUrlConfig`·`UpdateFunctionUrlConfig`를 거부하면 공개 URL을 만들지 못하게 할 수 있다.
- IAM Access Analyzer는 함수 URL을 통한 공개·교차 계정 접근을 찾아 준다.

@topic lambda/function-urls/invocation-cors

**호출.** `AWS_IAM`이면 요청마다 SigV4로 서명한다. Lambda가 서명을 다시 계산해 맞을 때만 처리한다. `NONE`이면 브라우저, curl 등 아무 HTTP 클라이언트로 부른다. 함수 URL 호출은 동기 호출이다.

**이벤트 형식.** 요청과 응답은 **API Gateway 페이로드 형식 버전 2.0** 과 같은 구조다. 그래서 HTTP API용으로 짠 핸들러를 거의 그대로 쓸 수 있다.

- 요청 이벤트에는 `rawPath`, `rawQueryString`, `headers`, `queryStringParameters`, `cookies`, `body`, `requestContext`가 들어 있다. 이진 본문이면 `body`가 base64이고 `isBase64Encoded`가 참이다.
- `routeKey`, `stage`는 `$default` 자리표시자이고 `pathParameters`, `stageVariables`는 쓰지 않는다. 경로 분기는 함수가 `rawPath`를 보고 직접 한다.
- `AWS_IAM`이면 `requestContext.authorizer.iam`에 호출자의 계정, ARN, 사용자 ID가 들어간다.
- 응답에서 `statusCode`를 빼고 JSON만 돌려주면 Lambda가 상태 코드 200, `content-type: application/json`으로 해석한다. 쿠키는 `set-cookie` 헤더를 직접 쓰지 말고 응답 객체의 `cookies` 배열에 넣는다.

**CORS(교차 출처 리소스 공유).** 다른 도메인의 웹 페이지가 함수 URL을 부르면 CORS를 설정한다. `AllowOrigins`, `AllowMethods`, `AllowHeaders`, `ExposeHeaders`, `AllowCredentials`, `MaxAge`를 정하면 Lambda가 모든 응답에 헤더를 붙인다.

- 함수 코드도 CORS 헤더를 보내면 충돌한다. 사전 요청(OPTIONS)에는 함수 URL 설정만 쓰지만, GET·POST 같은 실제 요청에는 두 헤더가 함께 나가 `Access-Control-Allow-Origin` 값이 중복되는 오류가 날 수 있다.
- 문서는 CORS를 모두 함수 URL 설정에서 하라고 권한다.

**스로틀과 차단.** 함수 URL에는 따로 요청 제한 설정이 없다. 함수의 **예약된 동시성** 으로 묶는다({{ch:lambda/concurrency}}).

- 초당 요청 상한은 예약된 동시성 × {{fact:lambda.rps-per-env.sync}}다. 동시성이나 요청 수를 넘으면 429를 돌려준다.
- 급히 모든 요청을 막으려면 예약된 동시성을 0으로 둔다. 되돌리려면 예약 설정을 지우거나 0보다 크게 바꾼다.
- 앞에 대기열이 없으므로 넘친 요청은 쌓이지 않고 바로 거부된다. 재시도는 클라이언트 몫이다.

**모니터링.** 함수 URL 요청에는 전용 CloudWatch 지표가 있다.

| 지표 | 뜻 (권장 통계) |
|---|---|
| `UrlRequestCount` | 함수 URL로 들어온 요청 수 (Sum) |
| `Url4xxCount` | 4XX를 돌려준 요청 수. 인증 실패, 스로틀 등 (Sum) |
| `Url5xxCount` | 5XX를 돌려준 요청 수. 함수 오류, 제한 시간 초과 등 (Sum) |
| `UrlRequestLatency` | 요청을 받은 때부터 응답을 돌려줄 때까지 (Average, Max) |

차원은 `FunctionName`, `Resource`(함수 이름 + `$LATEST` 또는 별칭), `ExecutedVersion`이다. 함수 URL 구성 API(`CreateFunctionUrlConfig` 등)는 CloudTrail 관리 이벤트로 남고, 이벤트 기록에서 {{fact:cloudtrail.event-history.retention}} 볼 수 있다. `InvokeFunctionUrl` 요청은 데이터 이벤트라 기본으로 기록되지 않는다. 데이터 이벤트 로깅을 켜야 한다. 함수 쪽 지표·로그는 {{ch:lambda/monitoring}}에서 다룬다.

@topic lambda/function-urls/choose

HTTP로 함수를 부르는 방법은 함수 URL, Amazon API Gateway(REST API, HTTP API, WebSocket API), Application Load Balancer(ALB)가 있다. 셋 다 함수를 **동기로** 부른다({{ch:lambda/invocation}}).

| 필요한 것 | 함수 URL | API Gateway | ALB |
|---|---|---|---|
| 인증 | IAM 또는 없음 | IAM, Lambda 권한 부여자, Amazon Cognito 사용자 풀, OAuth 2.0 | 리스너 규칙의 사용자 인증(OIDC, Cognito) |
| 요청 제한 | 예약된 동시성뿐 | API·단계·메서드별 스로틀, 사용 계획과 API 키 | 따로 없음(함수 동시성) |
| 요청 검증·변환, 캐시 | 없음 | 있음(주로 REST API) | 없음 |
| 사용자 지정 도메인 | 직접은 없음 | 있음 | 자기 도메인을 DNS로 연결하고 인증서를 붙인다 |
| AWS WAF | 붙일 수 없음 | REST API에 붙인다 | 붙일 수 있다 |
| 사설 접근 | 없음(공용 인터넷만) | 프라이빗 API(VPC 안에서만) | 내부 로드 밸런서 |
| 비용 | 함수 요금만 | 호출 수·데이터 전송·캐시 요금 추가 | 로드 밸런서 시간·사용량 요금 추가 |

**고르는 기준.**

- **함수 URL**: 웹훅 수신, 사내 도구, 시제품처럼 간단하고 비용을 줄이고 싶을 때. 함수 하나에 엔드포인트 하나가 필요할 때. 문서도 간단한 애플리케이션과 시제품에 권한다.
- **API Gateway**: 운영용 공개 API. 여러 경로를 함수 여러 개에 나누고, 사용자 인증(Cognito, 권한 부여자), 클라이언트별 스로틀, 요청 검증, 캐시, 단계·카나리 배포, OpenAPI 문서가 필요할 때. API Gateway 쪽 기본 스로틀 한도는 Lambda 기본 동시성보다 크므로, 트래픽이 많으면 Lambda 동시성 한도도 함께 늘린다({{ch:lambda/limits}}).
- **ALB**: 이미 ALB 뒤에 EC2·컨테이너가 있고, 경로·헤더 규칙으로 일부 요청만 함수로 보내고 싶을 때. 함수 리소스 기반 정책에 `elasticloadbalancing.amazonaws.com` 호출 권한을 주고, 함수를 대상으로 하는 대상 그룹을 만든다. 이벤트 형식은 ALB 고유 형식이다.
- 어느 쪽이든 앞단은 대기열이 아니다. 갑자기 몰리는 쓰기를 버리지 않아야 한다면 SQS를 사이에 두는 비동기 설계를 함께 검토한다({{ch:lambda/concurrency}}).

@quiz

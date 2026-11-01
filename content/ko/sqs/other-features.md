---
chapter: sqs/other-features
---

@topic sqs/other-features/temporary-queues

요청-응답(request-response) 방식에서는 요청자가 응답을 받을 큐가 필요하다. 요청마다 큐를 새로 만들고 지우면 API 호출이 늘고 관리도 번거롭다. **임시 큐(Temporary Queues)** 는 이 부담을 줄이는 방법이다. 한국어 문서 이름은 "임시 대기열"이다.

임시 큐는 SQS 서비스 기능이 아니라 AWS가 공개한 Java용 클라이언트 라이브러리 **Temporary Queue Client** 가 만든다. 핵심은 **가상 큐(virtual queue)** 다.

- 가상 큐는 클라이언트 안에만 있는 자료 구조다. 실제 SQS 큐 하나(호스트 큐)에 여러 가상 큐를 얹는다.
- 가상 큐를 만들고 지울 때 SQS API를 부르지 않는다. 그래서 가상 큐 자체에는 비용이 들지 않는다.
- 가상 큐 URL은 호스트 큐 URL 뒤에 `#가상큐이름`을 붙인 모양이다. 기존 송수신 코드를 그대로 쓸 수 있다.
- 생산자가 가상 큐로 보내면 클라이언트가 가상 큐 이름을 메시지 속성에 붙여 호스트 큐로 보낸다. 백그라운드 스레드가 호스트 큐를 읽어 메시지를 알맞은 가상 큐로 나눠 준다.

**주의할 점.**

- 처리량 한도(TPS)는 호스트 큐 하나에 얹힌 가상 큐 전체에 함께 적용된다.
- 가상 큐들이 같은 호스트 큐를 쓰면서 같은 `MessageGroupId`를 쓰면 서로 막을 수 있다. 가상 큐마다 다른 `MessageGroupId`를 쓴다.
- 다 쓰면 `shutdown()`을 불러 자원을 돌려준다. 클라이언트가 비정상 종료되어도 다른 클라이언트가 정리한다. 쓰는 중인 호스트 큐에는 주기적으로 태그를 달고, 같은 접두어를 가진 큐 가운데 {{fact:sqs.temp-queues.idle-cleanup}} 넘게 태그가 갱신되지 않은 큐를 지운다(기본값).

@topic sqs/other-features/message-attributes

메시지에는 본문 말고도 메타데이터를 붙일 수 있다. 두 종류가 있다.

| 종류 | 용도 |
|---|---|
| 메시지 속성(Message Attributes) | 앱이 쓰는 사용자 정의 메타데이터 |
| 메시지 시스템 속성(Message System Attributes) | 다른 AWS 서비스가 쓰는 메타데이터 |

**메시지 속성.** 타임스탬프, 서명, 식별자처럼 구조가 있는 값을 본문과 따로 붙인다. 소비자는 본문을 풀어 보지 않고도 속성만 보고 처리 방법을 고를 수 있다.

- 메시지 하나에 최대 {{fact:sqs.message.attributes.max}}까지 붙인다.
- 속성의 이름·형식·값은 모두 메시지 크기 한도 {{fact:sqs.message.max-size}}에 포함된다.
- 이름은 최대 {{fact:sqs.message.attribute-name.max-length}}이고 대소문자를 구분한다. `AWS.`나 `Amazon.`으로 시작할 수 없다.
- 형식은 `String`, `Number`, `Binary` 세 가지다. 뒤에 `Number.int`, `Binary.png`처럼 표시를 붙일 수 있다. SQS는 이 표시를 해석하지 않는다.
- SDK는 받은 속성의 MD5 요약값을 확인해 전송 중 손상을 잡는다. MD5 확인을 지원하지 않는 SDK나 Query API를 쓰면 직접 계산해야 한다.

> **주의:** 서버 측 암호화(SSE)는 메시지 본문만 암호화한다. 메시지 속성은 암호화되지 않으므로 민감한 값을 넣지 않는다. 자세한 내용은 {{ch:sqs/security}}에 있다.

**메시지 시스템 속성.** 지금 지원하는 것은 `AWSTraceHeader` 하나다. AWS X-Ray 추적 헤더 문자열을 담아 큐를 거치는 요청을 하나의 추적으로 잇는다. 형식은 `String`이어야 한다. 사용자 정의 속성과 달리 시스템 속성의 크기는 메시지 크기에 포함되지 않고, 메시지 속성 개수 한도와도 별개다.

@topic sqs/other-features/cost-tags

큐가 많아지면 어느 큐가 어느 팀, 어느 환경 것인지 알기 어렵다. **비용 할당 태그(Cost Allocation Tags)** 는 큐에 붙이는 키-값 쌍이다. 예를 들어 `QueueType=Production`, `QueueType=Testing`처럼 붙여 운영 큐와 시험 큐를 나눈다.

태그를 붙이기만 해서는 청구서가 나뉘지 않는다. 결제(Billing) 쪽에서 태그 키를 비용 할당에 쓰도록 설정해야 청구 보고서에 태그 키와 값이 나타난다. 그러면 SQS 요금을 팀이나 프로젝트별로 나눠 볼 수 있다.

| 규칙 | 내용 |
|---|---|
| 개수 | 큐 하나에 {{fact:sqs.tags.recommended-max}}보다 많이 붙이는 것은 권장하지 않는다 |
| 길이 | 키는 최대 {{fact:sqs.tags.key.max-length}}, 값은 최대 {{fact:sqs.tags.value.max-length}}. 키는 필수, 값은 비워도 된다 |
| 표기 | 대소문자를 구분한다. `aws:` 접두어는 쓸 수 없다 |
| 덮어쓰기 | 같은 키로 새 태그를 붙이면 기존 값이 바뀐다 |
| 호출 한도 | 태그 작업은 계정당 {{fact:sqs.tags.api.tps}}까지. 더 필요하면 한도 상향을 요청한다 |

SQS는 태그에 뜻을 두지 않고 문자열로만 다룬다. 콘솔에서는 큐를 만들거나 편집할 때 **태그** 영역에서 추가·수정·삭제한다. 태그는 IAM 조건에도 쓸 수 있다(속성 기반 액세스 제어). 태그도 암호화되지 않으므로 민감한 값을 넣지 않는다.

@topic sqs/other-features/list-pagination

`ListQueues`와 `ListDeadLetterSourceQueues`는 큐 목록을 돌려준다. 응답 하나에 최대 {{fact:sqs.list-queues.max-results}}까지 담긴다.

여기에 함정이 있다. `MaxResults`를 지정하지 않으면 응답의 `NextToken`이 항상 비어 있다. 큐가 더 있어도 다음 페이지를 받을 방법이 없다. 모든 큐를 빠짐없이 훑으려면 이렇게 한다.

1. 요청에 `MaxResults`를 넣는다.
2. 응답에 `NextToken`이 있으면 그 값을 다음 요청에 넣어 다시 부른다.
3. `NextToken`이 비어 있으면 끝이다.

대부분의 AWS SDK에는 이 반복을 대신 해 주는 페이지네이터가 있다.

@quiz

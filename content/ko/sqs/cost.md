---
chapter: sqs/cost
---

@topic sqs/cost/requests

SQS는 쓴 만큼만 내고 최소 요금이 없다. 요금의 중심은 **요청 수**다. 모든 SQS API 호출이 요청 한 건으로 계산된다. `SendMessage`, `ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`는 물론 `GetQueueAttributes` 같은 관리 호출도 요청이다. 메시지가 하나도 담기지 않은 빈 응답도 요청 한 건이다.

- **프리 티어(Free Tier).** 모든 고객은 {{fact:sqs.price.free-tier.requests}}을 무료로 쓴다. 이 양은 모든 리전(GovCloud 제외)의 사용량을 합쳐 계산하고, 남은 양은 다음 달로 넘어가지 않는다.
- **FIFO 단가.** FIFO 큐에서 메시지를 보내고, 받고, 지우고, 가시성을 바꾸는 호출은 FIFO 단가로 계산된다. 큐 속성 조회 같은 나머지 호출은 FIFO 큐라도 Standard 단가다.

프리 티어를 넘는 요청의 단가는 다음과 같다. 서울 리전을 기준으로 삼고, 미국 동부(버지니아 북부)를 참고로 붙인다.

| 큐 유형 | 서울 (ap-northeast-2) | us-east-1 (참고) |
|---|---|---|
| Standard | {{fact:sqs.price.standard.apne2}} | {{fact:sqs.price.standard.use1}} |
| FIFO | {{fact:sqs.price.fifo.apne2}} | {{fact:sqs.price.fifo.use1}} |

위 값은 월 사용량이 {{fact:sqs.price.tier1.max}} 이하인 첫 유료 구간의 단가다. 이보다 많이 쓰면 넘는 부분에 더 낮은 단가가 붙는다. 구간이 내려갈 때의 단가는 리전마다 다르다. 요금은 리전마다 다르고 자주 바뀐다. 이 장의 값은 {{fact:sqs.price.offer-version}} 기준이므로, 실제 단가는 요금 페이지나 AWS Pricing Calculator에서 다시 확인한다.

공정 큐(fair queue)를 쓰는 Standard 큐에서는 메시지 그룹 ID가 붙은 메시지를 다루는 요청에 추가 요금({{fact:sqs.price.fair.apne2}}, 서울)이 Standard 요금과 별도로 더해진다.

@topic sqs/cost/payload

요청 한 건이 곧 메시지 한 건은 아니다. SQS는 요청 하나의 페이로드를 **{{fact:sqs.billing.chunk-size}} 조각**으로 나누고, 조각 하나를 요청 한 건으로 센다. 최대 크기({{fact:sqs.message.max-size}})의 페이로드를 한 번에 보내면 {{fact:sqs.billing.requests-per-max-message}}으로 계산된다.

| 한 요청의 페이로드 | 계산되는 요청 수 |
|---|---|
| {{raw:10 KB}} 메시지 하나 | {{raw:1건}} |
| {{raw:65 KB}} 메시지 하나 | {{raw:2건}} (조각 경계를 조금 넘음) |
| {{raw:2 KB}} 메시지 {{raw:10개}}를 배치로 | {{raw:1건}} (합계 {{raw:20 KB}}) |
| {{fact:sqs.message.max-size}} 페이로드 | {{fact:sqs.billing.requests-per-max-message}} |

배치 요청 하나에는 메시지를 {{fact:sqs.batch.max-messages}}까지 담을 수 있고, 합계 페이로드는 {{fact:sqs.message.max-size}}를 넘을 수 없다. 작은 메시지를 배치로 묶으면 합계가 조각 하나 안에 들어가는 동안은 요청 한 건으로 끝난다.

크기에서 생기는 낭비는 두 가지로 줄인다.

- **조각 경계를 의식한다.** 조각 크기를 조금 넘는 메시지는 요청이 두 배로 계산된다. 쓰지 않는 필드를 빼거나 압축해서 경계 아래로 내리면 그만큼 준다.
- **큰 데이터는 S3로 보낸다.** Amazon SQS 확장 클라이언트 라이브러리로 본문을 S3에 두고 참조만 보내면 SQS 요청은 줄지만, S3 저장과 요청 요금이 따로 붙는다. 자세한 방법은 {{ch:sqs/large-messages}}에서 다룬다.

@topic sqs/cost/fewer-requests

메시지 한 건을 처리하는 데는 보통 보내기, 받기, 삭제 세 번의 요청이 든다. 여기에 메시지가 없을 때 소비자가 보내는 빈 응답이 더해진다. 요청을 줄이는 방법은 세 가지다.

1. **긴 폴링(Long polling).** 짧은 폴링은 큐가 비어 있어도 곧바로 빈 응답을 돌려준다. 소비자가 쉬지 않고 묻는 구조라면 요금 대부분이 빈 응답이 된다. 긴 폴링은 메시지가 올 때까지 최대 {{fact:sqs.longpoll.wait.max}} 기다려 빈 응답과 거짓 빈 응답을 줄인다. 두 방식의 요청 단가는 같으므로 차이는 요청 횟수에서 난다. 자세한 동작은 {{ch:sqs/polling}}에 있다.
2. **배치(batch).** `SendMessageBatch`, `DeleteMessageBatch`, `ChangeMessageVisibilityBatch`는 메시지를 {{fact:sqs.batch.max-messages}}까지 묶어 요청 하나로 처리한다. 받을 때는 `ReceiveMessage`의 `MaxNumberOfMessages`를 올려 한 번에 여러 개를 받는다. 세 동작을 모두 묶으면 요청 수가 묶은 개수만큼 나눠진다. 다만 합계 페이로드가 조각 크기를 넘으면 조각 수만큼 다시 늘어난다. 배치 설계는 {{ch:sqs/best-practices}}에서 다룬다.
3. **필요 없는 호출을 뺀다.** 모든 호출이 요청이므로, 처리 중 가시성을 너무 잦게 연장하거나 큐 속성을 반복해서 조회하는 코드도 요금을 늘린다.

**Lambda가 큐를 읽을 때.** 이벤트 소스 매핑은 Lambda가 대신 긴 폴링으로 큐를 읽고, 메시지를 배치로 묶어 함수를 배치마다 한 번 호출한다. 성공한 배치의 메시지 삭제도 Lambda가 한다. 이때 Lambda가 보내는 폴링 요청도 SQS 요청 요금으로 청구된다. 배치 크기를 키우면(Standard 큐 최대 {{fact:lambda.sqs.batch.max-standard}}) 함수 호출 횟수가 줄어 Lambda 쪽 비용도 준다. 대신 배치 하나의 처리 시간이 길어지므로 가시성 제한 시간을 함께 맞춘다({{ch:sqs/visibility-timeout}}).

@sim sqs-cost

@topic sqs/cost/other-charges

요청 요금 말고도 다음 요금이 붙을 수 있다.

**데이터 전송.** 보내는 쪽, 받는 쪽, 큐가 모두 같은 리전에 있으면 SQS 데이터 전송 요금이 없다. 다른 리전과 주고받거나 인터넷과 주고받으면 일반 AWS 데이터 전송 요금이 붙는다. 그래서 생산자와 소비자는 큐와 같은 리전에 두는 편이 싸다.

**서버 측 암호화.** SSE-SQS(SQS 관리 키)는 추가 요금이 없다. SSE-KMS를 쓰면 SQS가 AWS KMS를 부르는 호출마다 KMS 요청 요금({{fact:kms.price.requests.apne2}}, 서울)이 붙는다. KMS 요청에도 프리 티어({{fact:kms.price.free-tier.requests}})가 있다. 고객 관리형 키를 쓰면 키 보관 요금({{fact:kms.price.key-month.apne2}}, 서울)도 붙는다. 암호화 방식의 차이는 {{ch:sqs/security}}에서 다룬다.

SQS는 데이터 키를 매번 새로 받지 않고 **데이터 키 재사용 기간(data key reuse period)** 동안 재사용한다. 그래서 KMS 호출 수는 메시지 수가 아니라 재사용 기간과 보안 주체 수로 정해진다. SQS 개발자 안내서는 큐 하나의 호출 수를 다음 식으로 추정한다.

```
R = (B / D) × (2 × P + C)
B = 청구 기간(초), D = 데이터 키 재사용 기간(초)
P = 보내는 보안 주체 수, C = 받는 보안 주체 수
```

- 보내는 주체는 새 데이터 키 생성과 복호화를 모두 부르므로 받는 주체보다 두 배로 센다.
- 재사용 기간은 기본 {{fact:sqs.sse.key-reuse.default}}이고 최대 {{fact:sqs.sse.key-reuse.max}}까지 늘릴 수 있다. 길게 잡을수록 호출이 줄지만, 같은 데이터 키로 암호화되는 메시지가 늘어난다. 보안 요구와 비용을 함께 보고 정한다.
- SQS가 분산 시스템이라 실제 호출 수는 이 식보다 많을 수 있다.

**비용 나눠 보기.** 큐가 많으면 큐에 비용 할당 태그(cost allocation tag)를 붙인다. 용도, 소유 팀, 환경 같은 태그를 붙이고 청구서에 태그를 포함하도록 설정하면, 어느 큐가 요금을 쓰는지 나눠 볼 수 있다.

@quiz

@design

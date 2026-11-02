---
chapter: kinesis/producers
---

@topic kinesis/producers/put-apis

**생산자(Producer)** 는 Kinesis 데이터 스트림에 레코드를 쓰는 애플리케이션이다. 레코드를 넣을 때는 세 가지를 정한다. 스트림 이름(또는 ARN), **파티션 키(Partition key)**, 데이터 블롭이다. 서비스는 데이터 블롭을 열어 보거나 바꾸지 않는다. 파티션 키로 샤드를 고르고, 쓰기가 끝나면 **시퀀스 번호(Sequence number)** 를 붙인다. 샤드와 시퀀스 번호의 기본 개념은 {{ch:kinesis/key-concepts}}에서 다룬다.

쓰는 방법은 여러 가지다.

| 방법 | 쓰임새 |
|---|---|
| SDK로 API 직접 호출 | `PutRecord`, `PutRecords`. 지연을 조금도 더하고 싶지 않을 때 |
| Kinesis Producer Library(KPL) | 높은 쓰기 처리량. 집계·수집·재시도를 대신 해 준다 |
| Kinesis 에이전트(Kinesis Agent) | 서버의 로그 파일을 따라가며 보낸다 |
| 다른 AWS 서비스 | CloudWatch Logs, DynamoDB, IoT Core 등이 직접 쓴다 |

API는 두 개다.

- **`PutRecord`**: 요청 하나에 레코드 하나. 레코드마다 HTTP 요청이 따로 나간다.
- **`PutRecords`**: 요청 하나에 레코드 여러 건. 한 요청에 최대 {{fact:kinesis.putrecords.max-records}}, 요청 전체 크기는 {{fact:kinesis.putrecords.request-max-size}}까지다(파티션 키 포함). 레코드 하나는 {{fact:kinesis.record.max-size}}까지 넣을 수 있다. 요청 하나에 서로 다른 파티션 키를 섞어도 된다.

AWS는 대부분의 애플리케이션에 `PutRecords`를 권한다. 요청 수가 줄어 생산자 하나가 낼 수 있는 처리량이 커진다.

**순서.** `GetRecords`로 읽은 레코드는 샤드 안에서 시퀀스 번호 순으로 정렬되어 나온다. 다만 같은 파티션 키로 아주 빠르게 연달아 `PutRecord`를 부르면, 돌려받는 시퀀스 번호가 꼭 커지는 순서라는 보장은 없다. 같은 파티션 키 안에서 엄격하게 증가하는 시퀀스 번호가 필요하면 `PutRecord`의 `SequenceNumberForOrdering`에 직전 레코드의 시퀀스 번호를 넣는다. 이 매개변수는 `PutRecords`에는 없고, 서로 다른 파티션 키 사이의 순서는 보장하지 않는다.

> **주의:** 시퀀스 번호를 데이터 묶음을 찾는 색인처럼 쓰면 안 된다. 데이터를 논리적으로 나누려면 파티션 키를 쓰거나 스트림을 따로 만든다.

@topic kinesis/producers/partial-failures

`PutRecords`는 **부분 실패(Partial failure)** 가 날 수 있다. 요청 안의 레코드 하나가 실패해도 나머지 레코드는 계속 처리된다. 그래서 HTTP 호출 자체는 성공으로 끝나도, 일부 레코드는 스트림에 들어가지 않았을 수 있다.

응답의 `Records` 배열은 요청 배열과 길이가 같고 순서도 같다. 요청의 n번째 레코드 결과가 응답의 n번째 칸에 있다.

| 응답 칸 | 내용 |
|---|---|
| 성공한 레코드 | `SequenceNumber`, `ShardId` |
| 실패한 레코드 | `ErrorCode`, `ErrorMessage` |

`ErrorCode`는 `ProvisionedThroughputExceededException`(샤드 처리량 초과) 또는 `InternalFailure`다. 스로틀일 때 `ErrorMessage`에는 계정, 스트림, 샤드 ID가 들어 있어 어느 샤드가 막혔는지 알 수 있다.

처리 순서는 이렇다.

1. 응답의 `FailedRecordCount`가 0보다 큰지 본다.
2. `ErrorCode`가 비어 있지 않은 칸의 원래 레코드만 모은다.
3. 모은 레코드로 다음 `PutRecords`를 보낸다. 실패가 남지 않을 때까지 반복한다.

전체 요청을 통째로 다시 보내면 이미 성공한 레코드까지 한 번 더 들어간다. 그래도 재시도는 어차피 중복을 만들 수 있다. 응답을 받기 전에 네트워크 시간 초과가 나면, 생산자는 레코드가 들어갔는지 알 수 없어 다시 보낸다. 두 번 다 성공하면 데이터는 같고 시퀀스 번호만 다른 레코드가 두 개 생긴다. 엄격한 보장이 필요하면 레코드 안에 고유 키를 넣어 소비자 쪽에서 중복을 걸러 낸다. 소비자 쪽 중복은 {{ch:kinesis/consumers}}에서 다룬다.

스로틀이 계속되면 재시도 사이에 간격을 두는 **백오프(Backoff)** 를 쓴다. SDK는 자체 재시도 동작을 갖고 있으니 설정을 확인한다. 그래도 계속 막히면 재시도로 풀 문제가 아니다. 스트림 용량을 늘리거나({{ch:kinesis/capacity-modes}}, {{ch:kinesis/resharding}}) 파티션 키를 다시 설계한다.

@topic kinesis/producers/partition-key

서비스는 파티션 키를 MD5 해시 함수에 넣어 128비트 정수로 바꾸고, 그 값이 속한 해시 키 범위의 샤드에 레코드를 넣는다. 파티션 키는 유니코드 문자열이고 최대 {{fact:kinesis.partition-key.max-length}}다.

이 방식에서 두 가지가 따라 나온다.

- **같은 키는 늘 같은 샤드로 간다.** 그래서 같은 키의 레코드는 한 샤드 안에서 순서대로 읽힌다. 주문 ID, 기기 ID처럼 순서가 필요한 단위를 키로 고른다.
- **키가 적으면 샤드가 놀거나 한쪽이 막힌다.** 샤드 하나의 쓰기 용량은 {{fact:kinesis.shard.write}}다. 키 하나에 몰리는 양이 이보다 훨씬 작아야 하고, 서로 다른 키 수는 샤드 수보다 훨씬 많아야 데이터가 고르게 퍼진다.

| 키 선택 | 결과 |
|---|---|
| 사용자 ID처럼 값이 많은 키 | 샤드에 고르게 퍼진다. 사용자 단위 순서가 지켜진다 |
| 국가 코드처럼 값이 적은 키 | 큰 나라의 샤드만 스로틀된다(핫 샤드) |
| 무작위 값 | 가장 고르게 퍼지지만 순서 단위가 없어진다 |

**`ExplicitHashKey`.** 파티션 키 해시 대신 128비트 해시 값을 직접 넣어 어느 샤드로 갈지 정하는 매개변수다. 샤드의 해시 키 범위를 알고 있을 때 특정 샤드를 겨냥하거나, 직접 분배 규칙을 짤 때 쓴다. 이때도 파티션 키는 여전히 넣어야 한다.

스트림의 레코드 분배 전략을 서비스가 관리하는 `AUTO`로 바꾸면 사정이 다르다. 파티션 키는 선택이 되고, 넣은 파티션 키와 `ExplicitHashKey`는 무시된다. 이 방식은 {{ch:kinesis/service-managed-distribution}}에서 다룬다.

@topic kinesis/producers/kpl

**Kinesis Producer Library(KPL)** 는 생산자 코드와 Kinesis API 사이에 끼는 라이브러리다. 데이터를 넣는 일만 맡는다(스트림 생성·리샤딩 같은 관리는 SDK의 API가 한다). KPL이 대신 해 주는 일은 다섯 가지다.

1. 설정할 수 있는 자동 재시도
2. **수집(Collection)**: 여러 Kinesis 레코드를 `PutRecords` 한 번에 묶어 보낸다
3. **집계(Aggregation)**: 작은 사용자 레코드 여러 개를 Kinesis 레코드 하나에 담는다
4. KCL과 맞물려 소비자 쪽에서 집계를 자동으로 풀어 준다(디집계, De-aggregation)
5. CloudWatch에 처리량·오류 지표를 보낸다

**집계가 필요한 이유.** 샤드 쓰기 한도 {{fact:kinesis.shard.write}}에는 바이트 한도와 건수 한도가 함께 있다. 레코드가 작으면 바이트는 남는데 건수 한도에 먼저 걸린다. 예를 들어 {{raw:512바이트}}짜리 레코드를 초당 {{raw:1,000건}} 쓰면 바이트는 절반만 쓰고 건수는 꽉 찬다. 집계로 이 레코드들을 {{raw:10건}} 남짓의 Kinesis 레코드에 담으면 건수 부담이 크게 준다. 두 가지 배치(집계·수집)는 따로 켜고 끌 수 있고, 기본은 둘 다 켜져 있다.

> **주의:** 집계된 레코드는 소비자가 풀어야 한다. KCL(Java)은 자동으로 푼다. `GetRecords`를 직접 부르는 소비자는 KPL의 디집계 라이브러리가 필요하다. 집계된 레코드 안의 사용자 레코드들은 같은 시퀀스 번호를 나눠 쓰고, 하위 시퀀스 번호로 구분된다.

**지연이라는 대가.** KPL은 레코드를 버퍼에 모았다가 보낸다. 그래서 최대 `RecordMaxBufferedTime`만큼 지연이 더해진다. 이 값을 키우면 묶음 효율이 오르고, 줄이면 지연이 준다. 이 지연을 견딜 수 없는 애플리케이션은 SDK로 직접 쓴다. KPL에 레코드를 넣는 호출은 바로 돌아오고, 결과는 나중에 `Future`로 받는다. AWS는 특별한 이유가 없으면 이 비동기 방식을 쓰라고 한다.

**재시도와 속도 제한.** `PutRecords`에서 실패한 레코드는 KPL 버퍼로 자동으로 돌아간다. 새 마감 시간은 현재 `RecordMaxBufferedTime`의 절반과 레코드 수명(TTL) 중 작은 값이다. KPL 재시도에는 **백오프 알고리즘이 없다.** 대신 생산자 하나가 샤드 하나에 보내는 양을 토큰 버킷으로 제한한다. 기본 임계값은 {{fact:kinesis.kpl.rate-limit.default}}라서 생산자 하나로도 샤드를 꽉 채울 수 있다. AWS의 권장은 이 임계값을 낮추기보다, 적극적으로 재시도하고 그래도 남는 스로틀은 용량 확장과 파티션 키 전략으로 푸는 것이다.

@topic kinesis/producers/agents-troubleshooting

**Kinesis 에이전트(Kinesis Agent).** Linux 서버에 설치하는 독립 Java 애플리케이션이다. 지정한 파일을 계속 지켜보다가 새 줄을 스트림으로 보낸다. 파일 교체(로테이션), 체크포인트, 실패 시 재시도를 알아서 하고 CloudWatch 지표도 보낸다. 기본은 줄바꿈 문자로 레코드를 나누며, 여러 줄 레코드도 설정할 수 있다. 웹 서버나 로그 서버의 로그를 코드 없이 모을 때 쓴다.

**다른 AWS 서비스.** 직접 스트림에 쓰는 서비스가 여럿 있다. CloudWatch Logs 구독 필터, DynamoDB(변경 데이터 캡처), AWS IoT Core 규칙, Amazon EventBridge, AWS DMS, Aurora 등이다. 로그를 실시간으로 모아 분석하려면 CloudWatch Logs 구독 필터로 스트림에 보내는 구성을 떠올린다.

**생산자가 예상보다 느릴 때.** 진단 순서는 이렇다.

1. **한도에 걸렸는지 본다.** 어느 API가 스로틀되는지 확인한다. 샤드 쓰기 한도 말고도 스트림 단위 API 한도가 있다. 예를 들어 `CreateStream`, `ListStreams`, `GetShardIterator` 등은 {{fact:kinesis.api.control-plane.tps}}로 제한된다. 이런 호출을 쓰기 경로에서 자주 부르고 있지 않은지 본다.
2. **핫 샤드를 찾는다.** 특정 파티션 키 하나가 한도에 부딪히고 나머지 샤드는 한가하면, 키 설계 문제다. 최고 처리량을 재고 샤드 수와 함께 따진다.
3. **생산자 구조를 고친다.** 서버형 생산자는 KPL, `PutRecords`, 또는 큰 파일로 묶은 뒤 `PutRecord`를 쓴다. 묶을 수 없으면 여러 스레드나 비동기 클라이언트로 동시에 쓴다. 모바일 앱처럼 연결이 끊기는 생산자는 `PutRecords` 같은 묶음 쓰기가 필요하다.
4. **`flushSync()` 남용을 찾는다.** KPL의 `flushSync()`는 종료할 때 버퍼를 비우는 용도다. 쓰기마다 부르면 {{fact:kinesis.kpl.flushsync.delay}} 정도의 지연이 더해진다.

계산 팁도 하나 있다. 처리량 계산에서 `PutRecord`는 레코드마다 KB 단위로 올림하지만, `PutRecords`는 요청 안 레코드 크기의 합으로 계산한다. 작은 레코드를 많이 보낼수록 `PutRecords`가 유리하다.

암호화된 스트림에 쓰다가 KMS 키 권한 오류가 나면, 생산자 역할에 그 KMS 키를 쓸 권한이 없는 것이다. 키 정책이나 IAM 정책에서 권한을 준다({{ch:kinesis/security}}).

@quiz

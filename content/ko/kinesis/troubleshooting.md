---
chapter: kinesis/troubleshooting
---

@topic kinesis/troubleshooting/triage

문제를 고치기 전에 **어느 쪽이 막혔는지** 부터 가른다. 증상마다 먼저 볼 지표가 있다. 지표 자체는 {{ch:kinesis/monitoring}}에서 다룬다.

| 증상 | 먼저 볼 것 |
|---|---|
| 생산자가 예외를 받는다 | `WriteProvisionedThroughputExceeded`, `PutRecords.ThrottledRecords`. 어느 API가 스로틀되는지 |
| 소비자가 점점 뒤처진다 | `GetRecords.IteratorAgeMilliseconds`(Maximum), KCL `MillisBehindLatest` |
| 읽기가 예상보다 느리다 | `ReadProvisionedThroughputExceeded`, 같은 스트림을 읽는 애플리케이션 수 |
| `ExpiredIteratorException` | `GetRecords` 호출 간격, 임대 테이블의 쓰기 용량 |
| 레코드가 두 번 처리된다 | 생산자 재시도, 작업자 재시작·리샤딩·배포 시점 |
| 레코드가 빠진다 | `processRecords`의 예외 처리, 보존 기간, Lambda의 버려진 배치 |
| KMS 권한 오류 | 생산자·소비자 역할의 KMS 키 권한 |

**스트림 합만 보지 않는다.** 스트림 수준 지표는 모든 샤드의 합이다. 스트림 전체로는 여유가 있는데 예외가 난다면 샤드 하나가 막힌 것일 수 있다. 샤드 수준 지표를 켜서 샤드마다 본다.

**KMS 권한 오류.** 암호화된 스트림에 쓰거나 읽는 애플리케이션에 KMS 키 권한이 없으면 난다. 키 정책이나 IAM 정책으로 권한을 준다({{ch:kinesis/security}}).

@topic kinesis/troubleshooting/throttling

**쓰기 스로틀.** 원인은 대개 셋 중 하나다.

1. **스트림 용량이 모자란다.** 샤드 하나의 쓰기 한도는 {{fact:kinesis.shard.write}}다. 최고 처리량을 레코드 크기와 초당 레코드 수로 재고 샤드 수와 견준다({{ch:kinesis/capacity-modes}}). 온디맨드 모드도 이전 최고치를 크게 넘는 급증에서는 스로틀될 수 있다.
2. **핫 샤드.** 파티션 키 하나가 한 샤드의 한도에 부딪히고 나머지는 한가한 경우다. 샤드 수준 `IncomingBytes`·`WriteProvisionedThroughputExceeded`로 그 샤드를 찾는다. 파티션 키를 다시 설계하거나({{ch:kinesis/producers}}), 그 샤드를 나눈다({{ch:kinesis/resharding}}).
3. **관리 API 한도.** 샤드 한도 말고 스트림 단위 API 한도도 있다. `CreateStream`, `DeleteStream`, `ListStreams`, `GetShardIterator`, `MergeShards`는 {{fact:kinesis.api.control-plane.tps}}, `DescribeStream`은 {{fact:kinesis.api.describestream.tps}}, `DescribeStreamSummary`는 {{fact:kinesis.api.describestreamsummary.tps}}다. 쓰기 경로에서 레코드마다 이런 API를 부르면 데이터 양과 상관없이 막힌다. 결과를 캐시하고 쓰기 경로에서 뺀다.

크기 계산에서 하나 더 볼 점이 있다. `PutRecord`는 레코드마다 KB 단위로 올림해 계산하지만, `PutRecords`는 요청 안 레코드 크기의 합으로 계산한다. 그래서 작은 레코드를 하나씩 보내면 같은 데이터라도 한도에 더 빨리 닿는다. KPL을 쓰는데 느리다면 `flushSync()`를 쓰기마다 부르고 있지 않은지 본다. 종료할 때 쓰는 기능이고, 쓰기마다 부르면 {{fact:kinesis.kpl.flushsync.delay}} 정도의 지연이 붙는다.

스로틀된 요청은 백오프와 함께 재시도한다. `PutRecords`는 실패한 레코드만 골라 다시 보낸다({{ch:kinesis/producers}}). 재시도가 계속 필요하다면 재시도로 풀 문제가 아니라 용량이나 키 문제다.

**읽기 스로틀.** 공유 처리량 소비자는 샤드당 {{fact:kinesis.shard.read}}와 `GetRecords` {{fact:kinesis.getrecords.tps}}를 **모든 애플리케이션이 나눠 쓴다.**

- 애플리케이션 여럿이 한 스트림을 읽으면 합이 한도를 넘는다. 샤드를 늘리거나 향상된 팬아웃 소비자로 옮긴다({{ch:kinesis/consumers}}).
- 폴링을 너무 자주 하면 호출 한도에 걸린다. KCL의 폴링 간격을 {{fact:kinesis.poll.min-safe-interval}}보다 낮추지 않는다.
- `GetRecords`가 최대 크기를 돌려준 뒤 {{fact:kinesis.getrecords.cooldown}} 안에 다시 부르면 예외가 난다.
- 한 번에 읽는 레코드 수(`maxRecords`)를 너무 낮게 잡으면 읽기가 느려진다. 문서는 보통 기본값을 쓰라고 한다.

소비자 애플리케이션이 하나뿐이라면, 읽기 한도가 쓰기 한도보다 크므로 쓰는 속도보다 늘 빨리 읽을 수 있다. 그런데도 뒤처진다면 읽기 한도가 아니라 처리 로직을 의심한다. 빈 처리기로 돌려 읽기 처리량을 비교해 보면 가를 수 있다.

@topic kinesis/troubleshooting/iterator

"만료"라는 말이 두 가지 뜻으로 쓰인다. 섞으면 진단이 틀어진다.

| 무엇이 | 언제 | 결과 |
|---|---|---|
| 샤드 이터레이터 | 발급 뒤 {{fact:kinesis.iterator.expiry}} | `ExpiredIteratorException`. 새 이터레이터를 받으면 되고 데이터는 그대로다 |
| 레코드 | 보존 기간이 지나면 | 레코드가 사라진다. 아직 읽지 않았어도 되찾을 수 없다 |

**이터레이터 만료.** `GetRecords`는 매번 다음 호출에 쓸 `NextShardIterator`를 돌려준다. 처리 시간이 길거나 네트워크가 끊기거나 소비자가 멈춰서 {{fact:kinesis.iterator.expiry}} 넘게 `GetRecords`를 부르지 않으면 만료된다. 대책은 만료 전에 새로 받기, 만료 예외를 잡아 마지막 위치에서 새 이터레이터 받기, 또는 이를 대신해 주는 KCL 쓰기다. 받자마자 만료된다면 KCL 임대 테이블(DynamoDB)의 쓰기 용량이 모자란 경우가 많다. 샤드가 많을수록 잘 생긴다.

**레코드 만료.** 소비자가 보존 기간보다 오래 밀리면 생긴다. 이터레이터 나이가 {{fact:kinesis.iterator-age.risk}}를 넘으면 위험 신호다. 급한 대로 보존 기간을 늘리고({{ch:kinesis/retention-large-records}}), 그다음 원인을 찾는다. 갑자기 튀는 모양은 하류 API 실패 같은 일시적 문제, 꾸준히 오르는 모양은 처리 속도 부족이다. 이 진단 순서는 {{ch:kinesis/consumers}}에 정리했다.

**`GetRecords`가 빈 배열을 준다.** 오류가 아니다. 이터레이터 근처에 데이터가 없으면 빈 결과가 바로 온다. 백오프 없이 `NextShardIterator`로 계속 부른다. `NextShardIterator`가 `null`이면 샤드가 닫힌 것이다(리샤딩 뒤).

@topic kinesis/troubleshooting/duplicates-skips

Kinesis Data Streams 애플리케이션은 같은 레코드를 **두 번 이상 받을 수 있다.** 원인은 두 쪽에 있다.

- **생산자 재시도.** `PutRecord`를 보낸 뒤 응답 전에 네트워크 시간 초과가 나면, 생산자는 성공했는지 몰라 다시 보낸다. 둘 다 성공하면 데이터는 같고 **시퀀스 번호만 다른** 레코드가 두 개 생긴다. 그래서 시퀀스 번호로는 중복을 가를 수 없다. 엄격한 보장이 필요하면 생산자가 레코드 안에 고유 키를 넣고 소비자가 그것으로 걸러 낸다.
- **소비자 재시도.** 레코드 프로세서는 작업자가 갑자기 죽을 때, 작업자를 늘리거나 줄일 때, 샤드를 나누거나 합칠 때, 배포할 때 다시 시작한다. 다시 시작하면 마지막 체크포인트부터 읽으므로, 체크포인트 뒤에 처리한 레코드를 한 번 더 받는다. 문서는 중복 대부분이 생산자보다 이쪽에서 생긴다고 한다.

**멱등 처리.** 같은 레코드를 두 번 처리해도 결과가 한 번 처리한 것과 같게 만든다. 최종 대상이 중복을 다룰 수 있다면(고유 ID로 덮어쓰기, 버전 관리 등) 거기에 맡기는 것이 문서의 권장이다. S3에 파일로 모으는 예는 {{ch:kinesis/consumers}}에 있다.

**레코드가 빠지는 경우.**

- **KCL `processRecords`의 처리하지 않은 예외.** 가장 흔한 원인이다. KCL은 예외를 삼키고, 같은 실패가 끝없이 반복되지 않도록 그 배치를 다시 보내지 않은 채 다음 배치로 넘어간다. 예외는 `processRecords` 안에서 모두 처리한다.
- **보존 기간 초과.** 위 절의 레코드 만료다.
- **Lambda가 버린 배치.** 최대 재시도 횟수나 최대 레코드 나이에 닿은 배치는 버려진다. 실패 시 대상을 두면 그 배치의 샤드·시퀀스 번호 범위가 남으므로, 나중에 그 범위를 다시 읽을 수 있다.

**한 샤드를 두 프로세서가 잠시 함께 처리한다.** 네트워크가 끊긴 작업자는 장애 조치 시간(기본 {{fact:kinesis.kcl.failover.default}})이 지나면 죽은 것으로 보고, 다른 작업자가 임대를 넘겨받는다. 끊겼던 작업자가 돌아오면 잠깐 겹친다. 밀려난 쪽은 종료 이유 `ZOMBIE`를 받고, 체크포인트를 시도하면 `ShutdownException`을 받는다. 그때 깔끔하게 빠져나오게 짠다. 지역을 건너는 호출처럼 연결이 자주 끊기는 환경이면 장애 조치 시간을 더 길게 잡는다.

**Lambda 소비자.** 함수 오류가 나면 그 샤드가 멈추는 것, 배치 이등분·부분 배치 응답·실패 시 대상으로 푸는 방법은 {{ch:kinesis/consumers}}에서 다룬다. Lambda 이벤트 소스 매핑도 최소 한 번 처리이므로 함수는 멱등해야 한다.

@topic kinesis/troubleshooting/fis

오류 대응 코드는 실제 장애가 나기 전에 시험해 두는 편이 낫다. **AWS Fault Injection Service(FIS)** 는 대상 IAM 역할이 부르는 Kinesis Data Streams API에 오류를 일부러 넣는다. 문서에 최근 추가된 연동이라 시험 범위인지는 확인되지 않았다.

| FIS 동작 | 넣는 오류 |
|---|---|
| `aws:kinesis:inject-api-provisioned-throughput-exception` | `ProvisionedThroughputExceededException` |
| `aws:kinesis:inject-api-expired-iterator-exception` | `ExpiredIteratorException` (`GetRecords` 대상) |
| `aws:fis:inject-api-throttle-error` | `ThrottlingException` |
| `aws:fis:inject-api-internal-error` | `InternalFailure` |
| `aws:fis:inject-api-unavailable-error` | `ServiceUnavailable` |

- 프로비저닝·온디맨드 스트림 모두에 쓸 수 있다.
- 실험은 정한 기간이 끝나면 멈춘다. 도중에 직접 멈추거나, CloudWatch 경보를 중지 조건으로 걸 수 있다.
- 실험 템플릿에서 대상 역할, 대상 API, 스트림, 기간, 비율(요청 중 몇 할에 오류를 넣을지)을 정한다. 실행하는 쪽에는 `kinesis:InjectApiError` 권한이 필요하다.

예를 들어 스로틀 예외를 넣어 생산자의 백오프 재시도가 레코드를 잃지 않는지, 이터레이터 만료를 넣어 소비자가 새 이터레이터를 받아 이어 읽는지 확인한다.

@quiz

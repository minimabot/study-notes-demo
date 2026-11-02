---
chapter: kinesis/consumers
---

@topic kinesis/consumers/shared-vs-efo

**소비자(Consumer)** 는 스트림의 데이터를 읽어 처리하는 애플리케이션이다. 직접 만들 때는 KCL이나 SDK를 쓰고, 관리형으로는 AWS Lambda, Amazon Data Firehose, Amazon Managed Service for Apache Flink를 쓴다. 어느 쪽이든 먼저 정할 것은 **읽기 처리량을 어떻게 받느냐**다. 방식은 두 가지다.

| 항목 | 공유 처리량 소비자 | 향상된 팬아웃(Enhanced fan-out) 소비자 |
|---|---|---|
| 읽기 처리량 | 샤드당 {{fact:kinesis.shard.read}}를 모든 소비자가 나눠 쓴다 | 소비자마다 {{fact:kinesis.efo.throughput}}를 따로 받는다 |
| 전달 방식 | 소비자가 `GetRecords`로 당겨 온다(풀, HTTP) | 서비스가 `SubscribeToShard`로 밀어 준다(푸시, HTTP/2) |
| 전파 지연 | 소비자 하나일 때 {{fact:kinesis.shared.latency.one}}, 다섯이면 {{fact:kinesis.shared.latency.five}} | 소비자 수와 상관없이 {{fact:kinesis.efo.latency}} |
| 추가 요금 | 없다 | 데이터 검색 요금과 소비자-샤드 시간 요금 |

**공유 처리량(Shared throughput).** 샤드 하나의 읽기 한도는 바이트와 호출 수 두 가지다. 바이트는 {{fact:kinesis.shard.read}}, `GetRecords` 호출은 {{fact:kinesis.getrecords.tps}}다. 이 둘은 그 샤드를 읽는 모든 애플리케이션의 **합**에 걸린다. 그래서 AWS는 애플리케이션마다 {{fact:kinesis.poll.recommended}} 폴링을 권한다. 그래야 여러 애플리케이션이 함께 읽어도 호출 한도를 넘지 않는다. 소비자가 늘수록 각자 받는 몫이 줄고, 폴링 간격 때문에 지연도 커진다.

`GetRecords` 한 번은 최대 {{fact:kinesis.getrecords.max-records}}, {{fact:kinesis.getrecords.max-size}}까지 돌려준다. 최대 크기를 받았다면 {{fact:kinesis.getrecords.cooldown}} 안에 다시 부르는 호출은 `ProvisionedThroughputExceededException`을 받는다. 한 번에 많이 읽은 만큼 쉬어야 한다는 뜻이다.

**향상된 팬아웃(Enhanced fan-out).** 소비자를 스트림에 등록(`RegisterStreamConsumer`)하면 그 소비자 전용 파이프가 생긴다. 소비자가 `SubscribeToShard`를 부르면 서비스가 HTTP/2 연결로 레코드를 밀어 준다. 다른 소비자와 처리량을 다투지 않으므로, 소비자를 더해도 기존 소비자가 느려지지 않는다. 스트림 하나에 등록할 수 있는 소비자 수는 {{fact:kinesis.efo.consumers.max}}다. `SubscribeToShard`는 {{fact:kinesis.subscribetoshard.rate}} 부를 수 있다. KCL 2.0 이상으로 만들면 KCL이 모든 샤드를 구독해 주고, API로 직접 만들면 샤드를 골라 구독할 수 있다.

고르는 기준은 단순하다. 읽는 애플리케이션이 하나둘이고 지연이 {{fact:kinesis.shared.latency.one}} 수준이어도 되면 공유 처리량으로 충분하다. 여러 팀이 같은 스트림을 낮은 지연으로 읽어야 하면 향상된 팬아웃을 쓴다. 요금은 {{ch:kinesis/cost}}에서 다룬다.

@sim kds-fanout

@topic kinesis/consumers/kcl

**Kinesis Client Library(KCL)** 는 분산 소비자를 만드는 Java 라이브러리다. 다른 언어는 MultiLangDaemon을 거쳐 쓴다. KCL이 맡는 일은 작업자 사이 부하 분산, 작업자 장애 대응, 체크포인트, 샤드 분할·병합 대응이다. 개발자는 레코드를 처리하는 로직만 쓴다.

| 개념 | 뜻 |
|---|---|
| 작업자(Worker) | 소비자 애플리케이션의 실행 단위. 여러 대가 함께 돈다 |
| 레코드 프로세서(Record processor) | 처리 로직. 작업자는 임대를 가진 샤드마다 하나씩 만든다 |
| 임대(Lease) | 샤드와 작업자의 짝. 한 시점에 샤드 하나는 작업자 하나에만 묶인다 |
| 임대 테이블(Lease table) | 모든 임대를 기록하는 DynamoDB 테이블. 애플리케이션마다 하나 |
| 체크포인트(Checkpoint) | 샤드에서 마지막으로 처리한 위치. 임대 테이블에 저장된다 |

작업자 하나는 임대를 여러 개 가질 수 있다. 그래서 **샤드 수보다 작업자를 많이 둬도 처리량은 늘지 않는다.** 남는 작업자는 놀다가 다른 작업자가 죽으면 임대를 넘겨받는다. 작업자가 멈추거나 실패하면 KCL이 다른 작업자에게 임대를 준다. 실패로 보는 시간(`failoverTimeMillis`)의 기본값은 {{fact:kinesis.kcl.failover.default}}다.

임대 테이블은 DynamoDB 테이블이다({{ch:dynamodb/overview}}). 기본으로 KCL 애플리케이션 이름이 테이블 이름이 되므로, 애플리케이션 이름은 서로 겹치지 않아야 한다. 샤드가 아주 많으면 이 테이블의 쓰기 용량이 모자라 문제가 생길 수 있다.

**중복은 정상이다.** KCL은 최소 한 번(at-least-once) 전달을 한다. 작업자가 갑자기 죽거나, 작업자를 늘리거나 줄이거나, 샤드가 분할·병합되거나, 배포할 때 레코드 프로세서가 다시 시작된다. 다시 시작한 프로세서는 마지막 체크포인트부터 읽으므로, 체크포인트 이후 처리한 레코드를 한 번 더 받는다. 대책은 멱등 처리다. 최종 대상이 중복을 다룰 수 있으면(고유 ID로 덮어쓰기 등) 거기에 기댄다. 예를 들어 S3에 파일로 모을 때는 파일마다 레코드 수를 고정하고, 파일 이름에 샤드 ID와 첫 시퀀스 번호를 넣는다. 그러면 다시 처리해도 같은 이름의 같은 파일을 한 번 더 쓸 뿐이다.

@topic kinesis/consumers/lambda

Lambda는 **이벤트 소스 매핑(Event source mapping)** 으로 스트림을 읽고, 배치를 모아 함수를 동기 호출한다. 배치 하나에는 한 샤드의 레코드만 들어간다. 연결 방식은 두 가지다.

- **표준 이터레이터:** Lambda가 샤드마다 {{fact:kinesis.lambda.poll.base}} 폴링한다. 밀린 레코드가 있으면 따라잡을 때까지 계속 읽는다. 다른 소비자와 샤드 읽기 처리량을 나눠 쓴다.
- **향상된 팬아웃:** 스트림 소비자를 등록하고 그 소비자 ARN으로 매핑을 만든다. 전용 연결로 레코드를 밀어 받아 지연이 줄고 다른 애플리케이션에 영향을 주지 않는다.

주요 설정은 이렇다.

| 설정 | 내용 |
|---|---|
| 배치 크기(BatchSize) | 기본 {{fact:kinesis.lambda.batch.default}}, 최대 {{fact:kinesis.lambda.batch.max}} |
| 배치 기간(MaximumBatchingWindowInSeconds) | 레코드를 모으며 기다리는 시간. 최대 {{fact:lambda.sqs.batch.window.max}}. 배치는 가득 차거나, 기간이 끝나거나, 페이로드가 {{fact:lambda.payload.sync.max}}에 이르면 넘어간다 |
| 병렬화 계수(ParallelizationFactor) | 샤드 하나에서 동시에 처리하는 배치 수. 최대 {{fact:kinesis.lambda.parallelization.max}}. 같은 파티션 키 안의 순서는 지켜진다 |
| 시작 위치(StartingPosition) | `LATEST`, `TRIM_HORIZON`, `AT_TIMESTAMP` |

Lambda는 한 샤드의 레코드를 순서대로 처리한다. 그래서 **함수가 오류를 내면 그 샤드는 멈춘다.** 같은 배치를 다시 시도하는 동안 뒤의 레코드는 기다린다. 기본값에서는 재시도 횟수와 레코드 나이에 제한이 없어서, 나쁜 레코드 하나가 오랫동안 샤드를 막을 수 있다. 다음 설정으로 막는다.

- **최대 재시도 횟수(MaximumRetryAttempts)**: 최대 {{fact:kinesis.lambda.retry.max}}. 적당한 값으로 줄인다.
- **최대 레코드 나이(MaximumRecordAgeInSeconds)**: 최대 {{fact:kinesis.lambda.record-age.max}}. 이보다 오래된 레코드는 버린다.
- **오류 시 배치 이등분(BisectBatchOnFunctionError)**: 실패한 배치를 반으로 나눠 다시 시도해 나쁜 레코드를 좁혀 간다. 나누는 일은 재시도 횟수를 쓰지 않는다.
- **부분 배치 응답(ReportBatchItemFailures)**: 함수가 실패한 레코드의 시퀀스 번호를 돌려주면, 그중 가장 작은 시퀀스 번호를 체크포인트로 삼아 그 지점부터 다시 시도한다. 앞의 성공한 레코드는 다시 처리하지 않는다. 매핑에서 켜야 동작한다.
- **실패 시 대상(On-failure destination)**: 끝내 버리는 배치의 정보를 SQS 큐, SNS 토픽, S3 버킷 등에 남긴다. S3가 아니면 레코드 본문이 아니라 메타데이터(샤드, 시퀀스 번호 범위)가 간다. 나중에 그 범위를 스트림에서 다시 읽어 처리한다.

> **주의:** 매핑을 만들거나 바꾸는 동안에는 폴링 시작이 몇 분 늦을 수 있다. 시작 위치가 `LATEST`면 그 사이 이벤트를 놓칠 수 있다. 놓치면 안 되면 `TRIM_HORIZON`이나 `AT_TIMESTAMP`를 쓴다. 이벤트 소스 매핑은 최소 한 번 처리하므로 함수는 멱등해야 한다.

처리 속도를 올리려면 샤드를 늘리거나 병렬화 계수를 올린다. 샤드가 많아지면 오류가 난 샤드 하나가 전체에 주는 영향도 줄어든다. SQS와의 비교는 {{ch:sqs/integrations}}에서 볼 수 있다.

@topic kinesis/consumers/managed

**Amazon Data Firehose.** 스트림을 원본으로 지정하면 Firehose가 레코드를 읽어 Amazon S3, Amazon Redshift, Amazon OpenSearch Service, Splunk, HTTP 엔드포인트 등으로 전달한다. 전달 전에 데이터 변환과 레코드 형식 변환도 할 수 있다. 코드 없이 "스트림 → 저장소"를 잇는 용도이며, 버퍼링을 하므로 밀리초 단위 반응이 필요한 처리에는 맞지 않는다.

**Amazon Managed Service for Apache Flink.** SQL, Java, Scala로 스트림을 처리·분석하는 애플리케이션을 돌린다. 참조 데이터로 보강하거나, 시간 창으로 집계하거나, 이상 징후를 찾는 데 쓴다. 결과는 다른 Kinesis 스트림, Firehose, Lambda로 보낼 수 있다. 실시간 로그 분석처럼 상태를 가진 연속 처리가 필요할 때 고른다.

@topic kinesis/consumers/troubleshooting

**얼마나 밀렸는지부터 본다.** 스트림 단위 지표 `GetRecords.IteratorAgeMilliseconds`는 가장 오래된 읽기 위치가 지금으로부터 얼마나 떨어져 있는지를 보여 준다. KCL을 쓰면 샤드별 `MillisBehindLatest`로 더 자세히 본다. Lambda는 `IteratorAge` 지표를 낸다.

> **주의:** 이터레이터 나이가 {{fact:kinesis.iterator-age.risk}}를 넘으면, 처리하기 전에 레코드가 만료되어 사라질 위험이 있다. 보존 기간 기본값은 {{fact:kinesis.retention.default}}다. 급한 대로 보존 기간을 늘려(최대 {{fact:kinesis.retention.max}}) 손실을 막고 원인을 찾는다({{ch:kinesis/retention-large-records}}).

지표 모양으로 원인을 가른다.

| 모양 | 뜻 |
|---|---|
| 갑자기 튄다 | 일시적 문제. 하류 API 실패 등 |
| 꾸준히 오른다 | 처리 속도가 쓰기 속도를 못 따라간다. 자원 부족이나 처리 로직 병목 |

꾸준히 오르면 처리 시간을 본다. 처리량이 늘 때 처리 시간도 늘면 로직이 확장되지 않는 것이다. 처리량과 상관없이 늘면 중요 경로의 블로킹 호출을 의심한다. 그다음 샤드를 늘려 병렬성을 높이거나({{ch:kinesis/resharding}}), 작업자 자원을 늘린다.

**자주 보는 증상.**

- **읽기가 예상보다 느리다.** 여러 애플리케이션의 읽기 합이 샤드 한도를 넘었을 수 있다. 이 경우 샤드를 늘리거나 향상된 팬아웃으로 옮긴다. `maxRecords`를 너무 낮게 잡았을 수도 있다. 보통은 기본값을 쓴다.
- **폴링을 너무 자주 한다.** 지연을 줄이려고 KCL의 `idleTimeBetweenReadsInMillis`를 {{fact:kinesis.poll.min-safe-interval}}보다 낮추면 호출 한도 {{fact:kinesis.getrecords.tps}}에 걸린다. 그 값 근처라도 애플리케이션이 둘 이상이면 같은 문제가 난다. 예외가 쌓이면 지수 백오프로 오히려 지연이 커진다.
- **레코드를 건너뛴다.** `processRecords`에서 처리하지 않은 예외가 나면 KCL은 그 배치를 다시 보내지 않고 다음 배치로 넘어간다. 예외는 `processRecords` 안에서 모두 처리한다.
- **`GetRecords`가 빈 배열을 준다.** 데이터가 있어도 이터레이터 근처에 없으면 빈 결과가 온다. 정상이다. 돌려받은 `NextShardIterator`로 계속 부른다. `NextShardIterator`가 `null`이면 샤드가 닫힌 것이다.
- **샤드 이터레이터가 만료된다.** 이터레이터는 {{fact:kinesis.iterator.expiry}} 뒤 만료된다. 그 시간 넘게 `GetRecords`를 부르지 않았거나 소비자를 재시작한 경우다. 받자마자 만료되면 KCL 임대 테이블의 쓰기 용량 부족을 의심한다.
- **한 샤드를 두 프로세서가 잠시 함께 처리한다.** 네트워크가 끊긴 작업자의 임대를 다른 작업자가 넘겨받으면, 끊겼던 작업자가 돌아오는 동안 잠깐 겹친다. 밀려난 쪽은 종료 이유 `ZOMBIE`를 받고, 체크포인트를 시도하면 `ShutdownException`을 받는다. 이때 깔끔하게 정리하고 빠져나온다.

@design

@quiz

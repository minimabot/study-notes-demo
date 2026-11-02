---
chapter: kinesis/monitoring
---

@topic kinesis/monitoring/tools

Kinesis Data Streams를 지켜보는 도구는 다섯 가지다. 무엇을 보느냐에 따라 고른다.

| 도구 | 보는 것 |
|---|---|
| Amazon CloudWatch 지표 | 스트림과 샤드의 처리량, 스로틀, 소비 지연 |
| Kinesis 에이전트 지표 | 에이전트가 제대로 보내는지(`AWSKinesisAgent` 네임스페이스) |
| AWS CloudTrail | 누가 언제 어떤 API를 불렀는지 |
| KCL 지표 | 소비자 애플리케이션의 샤드·작업자별 처리 상태 |
| KPL 지표 | 생산자 쪽 버퍼, 재시도, 오류 |

서비스가 내는 지표는 `AWS/Kinesis` 네임스페이스에 들어간다. KCL·KPL·에이전트 지표는 애플리케이션이 직접 올리는 **사용자 지정 지표(Custom metrics)** 라서 CloudWatch 요금이 따로 붙는다. 에이전트는 보낸 바이트(`BytesSent`), 보낸 시도(`RecordSendAttempts`), 실패(`RecordSendErrors`), 스로틀 외 서비스 오류(`ServiceErrors`)를 낸다.

@topic kinesis/monitoring/stream-vs-shard

CloudWatch 지표는 두 수준이다. 둘 다 {{fact:kinesis.metrics.interval}}마다 보낸다.

| 수준 | 특징 |
|---|---|
| 기본(스트림 수준) | 늘 켜져 있고 무료다. 차원은 `StreamName` |
| 향상된(샤드 수준) | 따로 켜야 하고 요금이 붙는다. 차원은 `StreamName`, `ShardId` |

**샤드 수준 지표는 문제를 찾을 때 쓴다.** 스트림 수준 지표는 평소 상태를 보기에 충분하다. 하지만 샤드 하나만 막히는 핫 샤드는 스트림 전체 합에 묻힌다. 이때 `EnableEnhancedMonitoring` API(또는 콘솔)로 샤드 수준 지표를 켠다. 끄는 API는 `DisableEnhancedMonitoring`이다. 샤드 수준 지표는 샤드마다·지표마다 사용자 지정 지표 요금이 붙으므로, 필요한 지표만 켜거나 조사가 끝나면 끈다.

샤드 수준에서 켤 수 있는 지표는 일곱 가지다. 이름이 스트림 수준과 조금 다르다.

| 샤드 수준 | 스트림 수준 이름 |
|---|---|
| `IncomingBytes`, `IncomingRecords` | 같은 이름 |
| `OutgoingBytes`, `OutgoingRecords` | `GetRecords.Bytes`, `GetRecords.Records` |
| `IteratorAgeMilliseconds` | `GetRecords.IteratorAgeMilliseconds` |
| `WriteProvisionedThroughputExceeded` | 같은 이름 |
| `ReadProvisionedThroughputExceeded` | 같은 이름 |

샤드 수준의 `OutgoingBytes`·`OutgoingRecords`에는 `GetRecords`로 읽은 양과 `SubscribeToShard` 이벤트로 밀어 준 양이 함께 들어간다.

**향상된 팬아웃 소비자 지표.** `SubscribeToShard` 관련 지표는 차원이 `StreamName`, `ConsumerName`이라 소비자마다 따로 본다. 공유 처리량 소비자와 향상된 팬아웃 소비자의 차이는 {{ch:kinesis/consumers}}에서 다룬다.

@topic kinesis/monitoring/key-metrics

지표가 많아도 먼저 볼 것은 정해져 있다.

| 지표 | 뜻 |
|---|---|
| `IncomingBytes`, `IncomingRecords` | 성공적으로 쓴 바이트·레코드 수. 샤드 수와 견줘 사용률을 본다 |
| `WriteProvisionedThroughputExceeded` | 쓰기 스로틀로 거부된 레코드 수 |
| `ReadProvisionedThroughputExceeded` | 스로틀된 `GetRecords` 호출 수 |
| `GetRecords.IteratorAgeMilliseconds` | 읽은 마지막 레코드가 지금으로부터 얼마나 오래됐는지. 0이면 따라잡은 상태 |
| `PutRecord.Success`, `PutRecords.Success`, `GetRecords.Success` | 성공한 호출 수. Average는 성공 비율이다 |
| `PutRecords.ThrottledRecords`, `PutRecords.FailedRecords` | `PutRecords` 안에서 스로틀·내부 오류로 거부된 레코드 수 |

**통계 고르기.** 지표마다 맞는 통계가 있다.

- **이터레이터 나이 → Maximum.** 가장 뒤처진 소비자를 봐야 하기 때문이다. 이터레이터 나이가 {{fact:kinesis.iterator-age.risk}}를 넘으면 처리 전에 레코드가 만료될 위험이 있다. AWS는 그 전에 알 수 있도록 Maximum 통계로 경보를 걸라고 권장한다. 예를 들어 보존 기간이 기본값이면 그 절반보다 한참 아래에 임계값을 둔다.
- **스로틀 지표 → Average가 가장 흔하다.** Maximum이 0이면 그 기간에 스로틀이 전혀 없었다는 뜻이다. 쓰기 쪽은 Minimum이 0이 아니면 그 기간 내내 스로틀이 있었다는 뜻이다.
- **성공 지표 → Average로 경보.** 쓰기 실패를 보려면 생산자가 쓰는 API에 맞춰 `PutRecord.Success` 또는 `PutRecords.Success`를 고른다. KPL은 `PutRecords`를 쓰므로 `PutRecords.Success`를 본다. 읽기 실패는 `GetRecords.Success`로 본다.
- `PutRecords.FailedRecords`의 내부 오류는 가끔 나는 것이 정상이고, 재시도하면 된다.

**향상된 팬아웃 소비자.** `SubscribeToShard` 구독은 {{fact:kinesis.efo.subscription.lifetime}} 유지되고 다시 구독해야 한다. 그래서 `SubscribeToShard.Success`는 적어도 그 주기로 한 번 나온다. 같은 소비자가 이미 구독 중이거나 호출 한도를 넘으면 `SubscribeToShard.RateExceeded`가 나온다. 소비 지연은 `GetRecords` 지표가 아니라 `SubscribeToShardEvent.MillisBehindLatest`로 본다.

**경보 다음.** 경보는 Amazon SNS 주제로 알림을 보내거나 자동 대응을 시작하게 연결한다. 경보가 울린 뒤 무엇을 고칠지는 {{ch:kinesis/troubleshooting}}에서 다룬다.

@topic kinesis/monitoring/kcl-kpl

서비스 지표만으로는 "어느 작업자가, 어느 처리 단계에서" 느린지 알 수 없다. KCL과 KPL이 올리는 지표가 그 빈칸을 채운다.

**KCL 지표.** 네임스페이스는 KCL을 띄울 때 정한 **애플리케이션 이름** 이다. 지표는 애플리케이션 전체, 작업자별, 샤드별로 나뉜다.

| 지표 | 뜻 |
|---|---|
| `MillisBehindLatest` | 샤드의 현재 이터레이터가 최신 레코드보다 얼마나 뒤처졌는지. 샤드별 소비 지연을 가장 정확히 보여 준다 |
| `RecordsProcessed`, `DataBytesProcessed` | 처리한 레코드 수와 바이트 |
| `RecordProcessor.processRecords.Time` | 내 처리 로직이 걸린 시간 |
| `ExpiredIterator` | `GetRecords`에서 이터레이터 만료를 받은 횟수 |
| `LostLeases`, `CurrentLeases` | 잃은 임대, 가진 임대 수 |

- **수준(Metric level):** `NONE`, `SUMMARY`, `DETAILED`. 기본은 `DETAILED`(전부 보냄)다. 비용이 걱정되면 낮춘다.
- **차원:** `Operation`, `ShardId`, `WorkerIdentifier`. 작업자 ID가 재시작할 때마다 바뀌면 지표 묶음이 계속 새로 생기므로, 작업자 ID를 고정하는 편이 낫다.

**KPL 지표.** 생산자 쪽 상태를 본다.

| 지표 | 뜻 |
|---|---|
| `UserRecordsPending` | 버퍼에 있거나 보내는 중인 사용자 레코드 수 |
| `BufferingTime` | 레코드가 KPL에 들어와 나갈 때까지의 시간 |
| `RetriesPerRecord` | 사용자 레코드 하나당 재시도 횟수 |
| `AllErrors`, `ErrorsByCode` | 오류 수. `ErrorsByCode`는 오류 코드별로 나눈다 |

KPL에도 수준(`NONE`, `SUMMARY`, `DETAILED`)이 있고, 세분도(Granularity)는 `GLOBAL`, `STREAM`, `SHARD` 중 고른다. 기본은 `SHARD`다. `SHARD`를 고르면 같은 지표를 샤드·스트림·전체 수준으로 모두 올리므로 지표 수가 빠르게 는다. 호스트 이름 같은 차원을 더해 생산자 무리 사이의 부하 차이를 볼 수도 있다. KPL 설정은 실행 뒤 바꿀 수 없으므로 처음에 정한다. KPL 자체는 {{ch:kinesis/producers}}에서 다룬다.

@topic kinesis/monitoring/cloudtrail

**AWS CloudTrail** 은 Kinesis Data Streams API 호출을 이벤트로 기록한다. 콘솔에서 한 작업과 코드에서 부른 API가 모두 들어간다.

- **이벤트 기록(Event history).** 따로 설정하지 않아도 최근 이벤트를 CloudTrail 콘솔에서 보고 검색할 수 있다.
- **추적(Trail).** 오래 보관하려면 추적을 만들어 로그 파일을 S3 버킷으로 계속 보낸다. 콘솔에서 만든 추적은 기본으로 모든 리전에 적용된다.
- **기록되는 것.** 문서의 목록에는 `CreateStream`, `DeleteStream`, `IncreaseStreamRetentionPeriod`, `DecreaseStreamRetentionPeriod`, `SplitShard`, `MergeShards`, `UpdateShardCount`, `UpdateStreamMode`, `StartStreamEncryption`, `StopStreamEncryption`, `EnableEnhancedMonitoring` 같은 관리 작업과 `PutRecord`, `PutRecords`, `GetRecords`, `SubscribeToShard` 같은 데이터 작업이 함께 있다.
- **누가 했는가.** 이벤트의 `userIdentity`로 루트·IAM 사용자 자격 증명인지, 역할의 임시 자격 증명인지, 다른 AWS 서비스인지 구분한다. 요청 IP, 시각, 요청 매개변수도 남는다.

지표가 "무슨 일이 일어나는가"를 보여 준다면, CloudTrail은 "누가 바꿨는가"를 보여 준다. 예를 들어 어느 날부터 오래된 레코드가 사라졌다면 `DecreaseStreamRetentionPeriod` 이벤트를 찾아본다. 로그 파일 안의 이벤트는 순서대로 쌓이지 않으므로 시각으로 정렬해 읽는다.

@quiz

@design

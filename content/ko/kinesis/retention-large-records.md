---
chapter: kinesis/retention-large-records
---

@topic kinesis/retention-large-records/retention

**보존 기간(Retention period)** 은 레코드가 스트림에 들어온 때부터 더는 읽을 수 없게 될 때까지의 시간이다. 스트림은 실시간으로 쓰고 읽는 용도라서 레코드를 샤드에 잠시만 둔다. 기본값과 최댓값, 바꾸는 API는 {{ch:kinesis/key-concepts}}에서 정리했다. 여기서는 바꿀 때의 동작을 본다.

| 방향 | 반영 시점 |
|---|---|
| 늘리기 (`IncreaseStreamRetentionPeriod`) | 몇 분 안에 옛 기준으로 레코드를 지우는 일을 멈춘다 |
| 줄이기 (`DecreaseStreamRetentionPeriod`) | 새 기준보다 오래된 레코드를 거의 즉시 읽을 수 없게 한다 |

- 두 API 모두 스트림 이름과 **시간 단위** 보존 기간을 받는다. 최솟값은 기본값과 같은 {{fact:kinesis.retention.default}}, 최댓값은 {{fact:kinesis.retention.max}}다.
- 콘솔에서는 여러 스트림의 보존 기간을 한꺼번에 바꿀 수 있다. 현재 값은 `DescribeStream`으로 확인한다.
- 늘린 값은 몇 분 안에 반영된다. 예를 들어 {{raw:24시간}}을 {{raw:48시간}}으로 늘리면, 반영된 뒤에는 옛 기준으로 지워질 레코드도 새 기간까지 남는다. 다만 반영되기 전에 기한이 지난 레코드는 이미 읽을 수 없으므로, 소비자가 밀리기 시작하면 만료가 닥치기 전에 여유 있게 늘린다.
- **줄이는 쪽은 되돌릴 수 없다.** 줄이는 즉시 오래된 레코드가 사라지므로, 아직 읽지 않은 소비자가 없는지 먼저 확인한다.

보존 기간은 **안전망** 이다. 처리 로직에 버그가 있거나 하류 서비스가 오래 멈추면, 소비자가 회복할 때까지 레코드를 붙잡아 두는 것이 보존 기간이다. AWS는 이런 경우를 모두 따져 미리 정해 두라고 하고, 장애가 났을 때 그 자리에서 늘리는 데도 쓸 수 있다고 한다. 소비자가 밀릴 때 보존 기간을 늘려 시간을 버는 방법은 {{ch:kinesis/consumers}}와 {{ch:kinesis/troubleshooting}}에서 다룬다.

@topic kinesis/retention-large-records/retention-cost

기본 {{fact:kinesis.retention.default}}보다 길게 두면 추가 요금이 붙는다. 요금 페이지는 길이에 따라 두 구간으로 나눈다.

| 구간 | 범위 |
|---|---|
| 연장 데이터 보존(Extended data retention) | 기본값을 넘고 {{fact:kinesis.retention.extended-tier}}까지 |
| 장기 데이터 보존(Long-term data retention) | {{fact:kinesis.retention.extended-tier}}를 넘고 {{fact:kinesis.retention.max}}까지 |

요금을 매기는 단위는 용량 모드마다 다르다.

- **프로비저닝 모드.** 연장 보존은 **샤드 시간** 마다 붙는다. 장기 보존 구간의 데이터는 저장량(GB-월)으로 매긴다. 장기 보존 구간의 데이터를 `GetRecords`로 읽으면 GB당 **조회 요금** 이 더 붙는다. 향상된 팬아웃(`SubscribeToShard`)으로 읽으면 이 조회 요금은 없다. 기본·연장 구간의 데이터를 읽을 때도 없다.
- **온디맨드 표준 모드.** 연장·장기 보존 모두 저장량(GB-월)으로 매기고, 장기 구간 단가가 더 낮다.
- **On-demand Advantage.** 연장 보존을 구간 없이 저장량(GB-월)으로 매긴다({{ch:kinesis/capacity-modes}}).

설계할 때 기억할 점은 두 가지다. 첫째, 보존 기간은 "오래 쌓아 두는 저장소"가 아니라 다시 읽기를 위한 시간이다. 오래 둘 데이터는 Firehose 등으로 S3에 옮기는 편이 맞다. 둘째, 장기 구간의 데이터를 자주 다시 읽는다면 조회 요금이 붙는 읽기 방식인지 확인한다. 단가는 리전마다 다르고 자주 바뀌므로 요금 페이지에서 확인한다. 요금 전반은 {{ch:kinesis/cost}}에서 다룬다.

@topic kinesis/retention-large-records/replay

보존 기간 안의 레코드는 몇 번이고 다시 읽을 수 있다. 어디서부터 읽을지는 **샤드 이터레이터(Shard iterator)** 의 종류로 정한다. `GetShardIterator`를 부를 때 고른다.

| 이터레이터 유형 | 읽기 시작 위치 |
|---|---|
| `TRIM_HORIZON` | 샤드에 남아 있는 가장 오래된 레코드 |
| `LATEST` | 가장 최근 레코드 바로 뒤(이제부터 들어오는 것) |
| `AT_TIMESTAMP` | 지정한 시각 또는 그 뒤에 들어온 첫 레코드 |
| `AT_SEQUENCE_NUMBER` | 지정한 시퀀스 번호의 레코드 |
| `AFTER_SEQUENCE_NUMBER` | 지정한 시퀀스 번호 바로 뒤의 레코드 |

**시각으로 다시 읽기.** 잘못된 코드를 배포했다가 되돌렸다면, 배포 시각을 `AT_TIMESTAMP`로 주고 그때부터 다시 처리한다. 보존 기간을 넘긴 레코드는 이미 없으므로, 다시 읽을 수 있는 범위는 보존 기간이 정한다.

**KCL에서 주의할 점.** KCL의 시작 위치 설정(`initialPositionInStreamExtended`, 기본 `TRIM_HORIZON`)은 **임대를 처음 만들 때만** 쓰인다. 임대 테이블에 체크포인트가 있으면 설정을 바꿔도 체크포인트부터 읽는다. 그래서 과거 시점부터 다시 처리하려면, 새 애플리케이션 이름(곧 새 임대 테이블)으로 `AT_TIMESTAMP`를 주고 띄우는 방법을 쓴다. KCL과 임대 테이블은 {{ch:kinesis/consumers}}에서 다룬다.

**Lambda.** 이벤트 소스 매핑의 시작 위치(`StartingPosition`)에도 `AT_TIMESTAMP`가 있다. 매핑을 새로 만들 때 정한다.

@topic kinesis/retention-large-records/large-records

스트림은 레코드를 최대 {{fact:kinesis.record.max-size}}까지 받을 수 있다. 다만 새 스트림이든 기존 스트림이든 최대 레코드 크기의 기본값은 {{fact:kinesis.record.default-max-size}}이므로, 쓰려면 스트림 설정을 바꿔야 한다. 문서에 최근 추가된 기능이라 시험 범위인지는 확인되지 않았다. 지원 리전이 정해져 있고, 서울 리전은 목록에 있다.

**샤드 용량은 그대로다.** 큰 레코드는 샤드가 잠깐 지속 용량을 넘어 버스트했다가 다시 차오르는 방식으로 받는다. 샤드 쓰기·읽기 한도는 바뀌지 않는다. 이 점은 {{ch:kinesis/key-concepts}}에서 자세히 설명했다. 그래서 문서는 큰 레코드를 {{fact:kinesis.large-record.share-max}}로 유지하라고 권한다. 너무 자주 보내면 평소 트래픽이 쓸 용량이 줄어든다.

**설정.**

- 기존 스트림: 콘솔 **구성** 탭의 최대 레코드 크기 편집, 또는 `UpdateMaxRecordSize` API.
- 새 스트림: `CreateStream`의 `MaxRecordSizeInKiB` 매개변수.
- 확인: `DescribeStreamSummary`가 `MaxRecordSizeInKiB`를 돌려준다.
- 올리기 전에 모든 하류 애플리케이션이 큰 레코드를 다룰 수 있는지 확인한다.

**스로틀 줄이기.** 큰 레코드 뒤에는 용량이 다시 찰 때까지 쓰기가 스로틀될 수 있다. 대책은 세 가지다.

1. 생산자에 지수 백오프 재시도를 둔다.
2. 무작위 파티션 키로 큰 레코드를 여러 샤드에 퍼뜨린다.
3. 큰 페이로드가 계속 이어지는 경우라면 본문은 S3에 두고 스트림에는 위치 정보만 보낸다.

**하류 호환성.** 같이 쓰는 구성 요소마다 조건이 있다.

| 구성 요소 | 조건 |
|---|---|
| KCL·KPL | KCL 2.x 이상, KPL 1.0.5 이상 |
| AWS Lambda | base64 인코딩과 메타데이터를 합쳐 {{fact:lambda.payload.sync.max}}까지 처리한다. 그보다 큰 레코드는 실패 시 대상으로 간다 |
| Amazon Data Firehose | S3 전달은 된다(동적 파티셔닝을 쓰면 안 된다). HTTP 엔드포인트·Snowflake·Redshift 전달은 안 된다 |
| Flink 커넥터 | 소스 커넥터는 된다. 싱크 커넥터로는 기본 크기를 넘는 레코드를 쓰지 않는다 |

Lambda 소비자에서는 큰 레코드를 쓰지 않더라도 이벤트 소스 매핑에 **실패 시 대상** 을 만들어 두라고 문서는 권장한다. 그래야 버려지는 레코드가 없다. 실패 시 대상의 동작은 {{ch:kinesis/consumers}}에서 다룬다.

@quiz

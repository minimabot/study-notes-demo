---
chapter: kinesis/key-concepts
---

@topic kinesis/key-concepts/architecture

KDS의 큰 그림은 단순하다. **생산자(producer)** 가 데이터를 계속 스트림에 넣고, **소비자(consumer)** 가 실시간으로 꺼내 처리한다. 소비자는 처리 결과를 DynamoDB, Amazon Redshift, Amazon S3 같은 곳에 저장하거나 다른 스트림에 다시 넣는다.

- **생산자**: 레코드를 스트림에 넣는 쪽이다. 로그를 보내는 웹 서버가 한 예다. `PutRecord`(한 건)나 `PutRecords`(여러 건, 요청당 {{fact:kinesis.putrecords.max-records}}까지)를 호출한다.
- **소비자**: 레코드를 읽어 처리하는 쪽이다. 문서는 이것을 Kinesis Data Streams 애플리케이션이라고 부른다. EC2 인스턴스 무리에서 돌리는 사용자 애플리케이션, AWS Lambda, Amazon Data Firehose 등이 소비자가 될 수 있다.
- 소비자는 두 종류다. 샤드의 읽기 용량을 다른 소비자와 나눠 쓰는 **공유 팬아웃(shared fan-out) 소비자**, 소비자마다 전용 읽기 용량({{fact:kinesis.efo.throughput}})을 받는 **향상된 팬아웃(enhanced fan-out) 소비자**다. 자세한 차이는 {{ch:kinesis/consumers}}에서 다룬다.
- **Kinesis Client Library(KCL)** 는 소비자 애플리케이션에 넣어 쓰는 라이브러리다. 샤드마다 처리기가 하나씩 돌게 맞춰 주고, 어디까지 읽었는지 같은 메타데이터를 DynamoDB 테이블에 저장한다.

@topic kinesis/key-concepts/stream-shard

**데이터 스트림(data stream)** 은 **샤드(shard)** 의 묶음이다. 샤드는 스트림 안에서 고유하게 구분되는, 순서 있는 데이터 레코드의 줄이다. 샤드 하나가 정해진 용량 단위가 되고, 스트림 용량은 샤드 용량을 모두 더한 값이다.

| 방향 | 샤드 하나의 한도 |
|---|---|
| 쓰기 | {{fact:kinesis.shard.write}} (파티션 키 포함) |
| 읽기 (공유 팬아웃) | {{fact:kinesis.shard.read}} |

쓰기 한도는 두 조건 중 **먼저 닿는 쪽**에서 걸린다. 작은 레코드를 아주 많이 보내면 건수 한도에, 큰 레코드를 보내면 바이트 한도에 먼저 닿는다. 한도를 넘는 쓰기는 `ProvisionedThroughputExceededException`으로 스로틀된다.

> **주의: 한도 표의 `PutRecord` 행을 지속 처리량으로 읽지 않는다.** 한도 페이지의 `PutRecord` 행에는 샤드당 쓰기 총량이 초당 최대 {{fact:kinesis.record.max-size}}처럼 적혀 있다. 그러나 같은 페이지의 `PutRecords` 행과 스트림 처리량 행, 용어 페이지는 모두 샤드당 {{fact:kinesis.shard.write}}로 적는다. 큰 레코드 안내 페이지도 큰 레코드를 지원해도 **샤드 처리량 한도는 바뀌지 않는다**고 분명히 말한다. 레코드는 최대 {{fact:kinesis.record.max-size}}까지 받을 수 있는데, 이는 샤드가 잠깐 버스트해서 큰 레코드 하나를 받아 내고 그 뒤 용량이 다시 차오르는 방식이다. 따라서 "레코드 한 건은 최대 {{fact:kinesis.record.max-size}}까지 받을 수 있다"와 "샤드의 지속 쓰기 용량은 {{fact:kinesis.shard.write}}다"를 함께 기억한다. 큰 레코드를 계속 보내는 용도로는 설계되지 않았다.

용량을 정하는 방식이 **용량 모드(capacity mode)** 다. 프로비저닝된 모드에서는 샤드 수를 직접 정하고 샤드 수만큼 시간당 요금을 낸다. 온디맨드 모드에서는 Kinesis가 샤드를 알아서 관리하고 쓴 처리량만큼 낸다. 두 모드 비교는 {{ch:kinesis/capacity-modes}}에서 다룬다.

@topic kinesis/key-concepts/record

**데이터 레코드(data record)** 는 스트림에 저장되는 데이터 한 단위다. 세 부분으로 이루어진다.

| 구성 | 설명 |
|---|---|
| 데이터 blob(data blob) | 실제 내용. 바꿀 수 없는 바이트 열이다. Kinesis는 안을 들여다보거나 해석하거나 고치지 않는다 |
| 파티션 키(partition key) | 레코드를 어느 샤드에 넣을지 정하는 값. 생산자가 넣을 때 반드시 정한다 |
| 시퀀스 번호(sequence number) | 레코드가 들어온 뒤 Kinesis가 붙이는 번호. 생산자가 정하지 않는다 |

**레코드 크기.** 스트림의 최대 레코드 크기는 기본 {{fact:kinesis.record.default-max-size}}다. 스트림 설정을 바꾸면 최대 {{fact:kinesis.record.max-size}}까지 올릴 수 있다(base64 인코딩 전 페이로드 기준). 용어 페이지에는 아직 데이터 blob의 최대 크기가 기본값 수준으로 적혀 있는데, 큰 레코드 기능이 생기기 전의 설명이다. 큰 레코드는 이따금 섞여 들어오는 경우를 위한 기능이고 지원 리전이 정해져 있다. 자세한 내용은 {{ch:kinesis/retention-large-records}}에서 다룬다.

**시퀀스 번호.** 같은 샤드 안에서 파티션 키별로 고유하다. 같은 파티션 키의 번호는 대체로 시간이 갈수록 커지고, 쓰기 사이 간격이 길수록 더 커진다. 다만 시퀀스 번호를 데이터 묶음을 찾는 색인처럼 쓰면 안 된다. 데이터 묶음을 나누려면 파티션 키를 쓰거나 스트림을 따로 만든다.

@topic kinesis/key-concepts/partition-key

파티션 키는 **유니코드 문자열** 이고 최대 {{fact:kinesis.partition-key.max-length}}다. Kinesis는 파티션 키를 MD5 해시 함수에 넣어 {{fact:kinesis.hash-key.bits}} 정수(해시 키 값)로 바꾼다.

- 샤드마다 **해시 키 범위(hash key range)** 가 있다. 이어진 정수 구간이다. 해시 키 값이 들어가는 범위의 샤드가 그 레코드를 받는다.
- 열린(OPEN) 샤드들의 범위를 모으면 해시 키 값 전체를 빈틈없이 덮는다. 그래서 어떤 파티션 키든 받을 샤드가 정확히 하나 있다.
- 샤드를 나누거나(split) 합치면(merge) 이 범위가 다시 나뉜다. 리샤딩은 {{ch:kinesis/resharding}}에서 다룬다.

**순서는 샤드 안에서만 지켜진다.** 같은 파티션 키는 해시 키 값이 같으므로 늘 같은 샤드로 간다. 소비자가 `GetRecords`로 받는 레코드는 시퀀스 번호 순으로 정렬되어 있다. 그래서 주문 ID를 파티션 키로 쓰면 한 주문의 이벤트는 들어간 순서대로 읽힌다. 서로 다른 샤드에 있는 레코드끼리는 순서가 없다.

> **참고:** 짧은 간격으로 `PutRecord`를 연달아 부르면 같은 파티션 키라도 시퀀스 번호가 꼭 커진다는 보장은 없다. 엄격하게 커지는 순서가 필요하면 `PutRecord`의 `SequenceNumberForOrdering` 매개변수에 바로 앞 레코드의 시퀀스 번호를 넣는다. 이 매개변수는 `PutRecords`에는 없다.

**키 고르기.** 파티션 키 종류가 적거나 한 키에 데이터가 몰리면, 그 키가 가는 샤드 하나만 한도에 닿는다(핫 샤드). 다른 샤드에 여유가 있어도 소용없다. 순서가 필요한 단위를 지키는 범위에서 키를 고르게 퍼뜨린다.

@topic kinesis/key-concepts/retention

**보존 기간(retention period)** 은 레코드를 넣은 뒤 읽을 수 있는 시간이다.

| 항목 | 값 |
|---|---|
| 기본값(최솟값) | {{fact:kinesis.retention.default}} |
| 최댓값 | {{fact:kinesis.retention.max}} |
| 바꾸는 API | `IncreaseStreamRetentionPeriod`, `DecreaseStreamRetentionPeriod` |

기본값보다 길게 두면 추가 요금이 붙는다. 보존 기간 안의 레코드는 몇 번이고 다시 읽을 수 있다. 소비자에 버그가 있어 다시 처리해야 하거나, 소비자가 오래 멈췄다가 돌아와도 보존 기간 안이라면 데이터를 잃지 않는다. 반대로 그보다 오래 밀리면 아직 읽지 않은 레코드도 사라진다. 보존 기간과 큰 레코드는 {{ch:kinesis/retention-large-records}}에서 더 다룬다.

@quiz

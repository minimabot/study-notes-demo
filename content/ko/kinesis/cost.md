---
chapter: kinesis/cost
---

@topic kinesis/cost/provisioned

Kinesis Data Streams 요금은 용량 모드(capacity mode)에 따라 매기는 방식이 다르다. 프로비저닝 모드는 **잡아 둔 용량**으로, 온디맨드 모드는 **실제로 흘려보낸 데이터 양**으로 낸다. 모드의 동작 차이는 {{ch:kinesis/capacity-modes}}에서 다뤘고, 여기서는 요금만 본다.

**프로비저닝 모드(Provisioned)** 의 기본 요금은 둘이다.

- **샤드 시간(shard hour).** 스트림에 열려 있는 샤드 하나가 한 시간 있으면 한 번 센다. 샤드 하나는 쓰기 {{fact:kinesis.shard.write}}, 읽기 {{fact:kinesis.shard.read}}를 준다. 데이터를 넣지 않아도 샤드가 열려 있으면 낸다.
- **PUT 페이로드 단위(PUT Payload Unit).** 생산자가 넣은 레코드를 {{fact:kinesis.price.put-unit.size}} 조각으로 나눠 센다. 조각에 못 미치는 나머지도 한 단위다. 그래서 아주 작은 레코드도 한 건마다 한 단위를 쓴다.

기본 보존 기간({{fact:kinesis.retention.default}}) 안의 데이터를 GetRecords로 읽는 데에는 따로 요금이 없다. 공유 처리량 소비자가 몇이든 읽기 요금은 샤드 시간에 들어 있다.

서울 리전을 기준으로 하고 미국 동부(버지니아 북부)를 참고로 붙인다.

| 항목 | 서울 (ap-northeast-2) | us-east-1 (참고) |
|---|---|---|
| 샤드 시간 | {{fact:kinesis.price.shard-hour.apne2}} | {{fact:kinesis.price.shard-hour.use1}} |
| PUT 페이로드 단위 | {{fact:kinesis.price.put-unit.apne2}} | {{fact:kinesis.price.put-unit.use1}} |

요금은 리전마다 다르고 자주 바뀐다. 이 장의 값은 {{fact:kinesis.price.offer-version}} 기준이다. 실제 단가는 요금 페이지나 AWS Pricing Calculator에서 다시 확인한다.

프로비저닝 비용을 정하는 것은 **샤드 수**다. 샤드 수는 최고치 트래픽에 맞춰 잡으므로, 평균이 최고치보다 훨씬 낮으면 쓰지 않는 용량에도 낸다. 샤드 수 계산은 {{ch:kinesis/capacity-modes}}, 샤드를 늘리고 줄이는 방법은 {{ch:kinesis/resharding}}에 있다.

@topic kinesis/cost/on-demand

**온디맨드 표준 모드(On-demand Standard)** 는 요금 항목이 셋이다.

- **스트림 시간.** 온디맨드 스트림 하나가 한 시간 있으면 한 번 센다. 트래픽과 관계없는 고정 요금이다.
- **수집(Data-In).** 쓴 데이터 양을 GB로 센다. 레코드 크기는 {{fact:kinesis.price.od.ingest-rounding}}한다. 기본 보존 기간({{fact:kinesis.retention.default}}) 저장은 수집 요금에 들어 있다.
- **조회(Data-Out).** 읽은 데이터 양을 GB로 센다. 조회량은 올림하지 않는다. 공유 처리량 소비자가 둘이면 같은 데이터를 두 번 읽은 것이므로 두 번 낸다.

| 항목 | 서울 (ap-northeast-2) | us-east-1 (참고) |
|---|---|---|
| 스트림 시간 | {{fact:kinesis.price.od.stream-hour.apne2}} | {{fact:kinesis.price.od.stream-hour.use1}} |
| 수집 | {{fact:kinesis.price.od.ingest.apne2}} | {{fact:kinesis.price.od.ingest.use1}} |
| 조회 | {{fact:kinesis.price.od.retrieval.apne2}} | {{fact:kinesis.price.od.retrieval.use1}} |

서울에서는 스트림 시간 단가가 샤드 시간 단가보다 높다. 그래서 트래픽이 거의 없는 작은 스트림도 온디맨드로 두면 샤드 하나짜리 프로비저닝 스트림보다 비싸다. 스트림이 많을수록 이 고정 요금이 쌓인다.

**어느 모드가 싼가.** 기준은 **평균 사용률**이다.

- **프로비저닝이 유리한 경우.** 트래픽이 꾸준하거나 천천히 늘어 샤드 수를 평균에 가깝게 맞출 수 있다. 데이터 양이 많을수록 차이가 커진다. 샤드 시간은 데이터 양과 관계없는 값이고, PUT 단위 단가는 낮기 때문이다.
- **온디맨드가 유리한 경우.** 트래픽이 들쭉날쭉하거나 예측하기 어렵고, 최고치에 맞춰 잡은 샤드가 대부분의 시간 동안 놀게 된다. 새 워크로드라 트래픽을 아직 모를 때도 온디맨드로 시작해 사용량을 본 뒤 정한다.

모드는 바꿀 수 있지만 {{fact:kinesis.mode-switch.max}}까지다. 아래 계산기로 같은 트래픽을 두 모드로 비교해 본다.

**On-demand Advantage.** 계정·리전 단위 설정이다. 켜면 그 리전의 모든 온디맨드 스트림에서 스트림 시간 요금이 없어지고, 수집·조회·연장 보존 단가가 표준보다 {{fact:kinesis.advantage.discount}} 낮아진다. 향상된 팬아웃 조회에도 추가 단가가 없다. 대신 리전 전체 온디맨드 스트림 합계로 {{fact:kinesis.advantage.commit}}를 약정하고, 모자라면 차액을 같은 할인 단가로 낸다. 켠 뒤 {{fact:kinesis.advantage.min-period}}이 지나야 끌 수 있다. 사용량이 약정 근처이거나 그 이상이고, 소비자가 많거나 스트림이 아주 많을 때 검토한다. 자세한 동작은 {{ch:kinesis/capacity-modes}}에 있다.

@topic kinesis/cost/fanout-retention

**향상된 팬아웃(Enhanced fan-out, EFO).** 등록한 소비자마다 샤드당 {{fact:kinesis.efo.throughput}}의 전용 읽기 처리량을 준다. 대신 요금이 따로 붙는다. 동작은 {{ch:kinesis/consumers}}에 있다.

| 항목 (서울) | 프로비저닝 | 온디맨드 표준 |
|---|---|---|
| 소비자-샤드 시간 | {{fact:kinesis.price.efo-shard-hour.apne2}} | 항목 없음 |
| EFO 조회 | {{fact:kinesis.price.efo-retrieval.apne2}} | {{fact:kinesis.price.od.efo-retrieval.apne2}} |

- 프로비저닝에서는 **소비자 수 × 샤드 수**만큼 시간 요금이 붙는다. 샤드를 늘리면 EFO 비용도 함께 는다. 여기에 읽은 GB만큼 조회 요금을 더 낸다.
- 온디맨드 표준에서는 시간 요금이 없고, 읽은 GB를 일반 조회보다 높은 단가로 낸다.
- us-east-1은 프로비저닝이 {{fact:kinesis.price.efo-shard-hour.use1}}와 {{fact:kinesis.price.efo-retrieval.use1}}, 온디맨드가 {{fact:kinesis.price.od.efo-retrieval.use1}}이다.

EFO는 소비자가 여럿이라 공유 읽기 용량({{fact:kinesis.shard.read}})이 모자라거나 지연을 줄여야 할 때 쓴다. 소비자가 하나뿐이고 지연 요구가 느슨하면 공유 처리량 소비자가 싸다. 프로비저닝에서 공유 소비자의 읽기는 샤드 시간에 이미 들어 있기 때문이다.

**보존 기간.** 기본값은 {{fact:kinesis.retention.default}}이고 최대 {{fact:kinesis.retention.max}}까지 늘릴 수 있다. 기본값을 넘으면 요금이 붙고, 구간에 따라 단가가 다르다.

| 구간 | 프로비저닝 (서울) | 온디맨드 표준 (서울) |
|---|---|---|
| 기본값 초과 ~ {{fact:kinesis.retention.extended-tier}} (연장 보존) | {{fact:kinesis.price.extended-shard-hour.apne2}} | {{fact:kinesis.price.od.extended-retention.apne2}} |
| {{fact:kinesis.retention.extended-tier}} 초과 (장기 보존) | {{fact:kinesis.price.longterm-storage.apne2}} | {{fact:kinesis.price.longterm-storage.apne2}} |

- **프로비저닝의 연장 보존은 샤드 시간으로 낸다.** 보존 기간을 늘리면 데이터를 얼마나 저장하든 모든 샤드 시간에 추가 요금이 붙는다. 서울에서는 이 추가 단가가 기본 샤드 시간 단가보다 높다. 보존 기간을 늘리는 것만으로 샤드 비용이 두 배 넘게 될 수 있다.
- **온디맨드의 연장 보존은 저장한 GB-월로 낸다.** 데이터 양이 적으면 부담이 작다.
- **장기 보존**은 두 모드 모두 GB-월로 낸다. 장기 보존 구간에 들어간 데이터를 GetRecords로 읽으면 프로비저닝에서 {{fact:kinesis.price.longterm-retrieval.apne2}}(서울)의 조회 요금이 붙는다. 향상된 팬아웃(SubscribeToShard)으로 읽으면 이 요금은 없다. 기본·연장 보존 구간의 데이터를 읽는 데에는 이 요금이 없다. 가격표와 요금 페이지의 온디맨드 표준 표에는 장기 보존 조회 항목이 따로 없다.

보존 기간은 소비자가 장애에서 회복해 밀린 데이터를 다 읽을 수 있을 만큼 잡는다. 긴 보관이 목적이라면 스트림 보존 기간을 늘리기보다 Amazon Data Firehose로 S3에 내보내는 쪽이 대개 맞다. 스트림은 실시간 처리용 임시 저장소다.

@topic kinesis/cost/checklist

요금표만큼 **단위를 덜 쓰는 것**이 중요하다. 다음 순서로 점검한다.

1. **작은 레코드는 묶는다.** 프로비저닝에서는 레코드 한 건이 아무리 작아도 PUT 페이로드 단위를 하나 쓴다. Kinesis Producer Library(KPL)의 집계(aggregation)는 여러 사용자 레코드를 Kinesis 레코드 하나로 묶는다. 묶은 레코드가 {{fact:kinesis.price.put-unit.size}}에 가까우면 PUT 단위 수가 크게 준다. 샤드의 레코드 수 한도({{fact:kinesis.shard.write-records}})에 먼저 걸리던 스트림은 샤드 수도 줄일 수 있다. 온디맨드에서는 레코드마다 {{fact:kinesis.price.od.ingest-rounding}}하므로, 작은 레코드를 묶으면 올림으로 늘어나는 수집량이 준다. 소비자는 KCL이나 KPL 집계 해제 모듈로 레코드를 다시 풀어야 한다({{ch:kinesis/producers}}).
2. **샤드 수를 실제 사용량에 맞춘다.** CloudWatch의 `IncomingBytes`, `IncomingRecords`, `GetRecords.Bytes`를 보고 최고치 대비 여유가 지나치게 크면 샤드를 줄인다. 하루 중 트래픽이 크게 바뀌면 `UpdateShardCount`로 시간대마다 바꾸는 방법도 있다({{ch:kinesis/resharding}}).
3. **모드를 다시 본다.** 사용률이 낮은 프로비저닝 스트림은 온디맨드로, 꾸준하고 큰 온디맨드 스트림은 프로비저닝으로 옮기는 것을 계산해 본다. 온디맨드 스트림이 많은 계정은 스트림 시간 고정 요금 합계도 확인한다.
4. **EFO는 필요한 소비자에만 쓴다.** 프로비저닝에서는 소비자 수 × 샤드 수로 시간 요금이 붙는다. 쓰지 않는 등록 소비자는 지운다.
5. **보존 기간을 필요한 만큼만 둔다.** 프로비저닝에서 보존 기간을 기본값보다 조금만 늘려도 모든 샤드 시간에 연장 보존 요금이 붙는다. 회복에 필요한 기간을 정하고, 긴 보관은 S3로 보낸다.
6. **안 쓰는 스트림을 지운다.** 프로비저닝 샤드와 온디맨드 스트림 시간은 데이터가 없어도 낸다. 실습·시험용 스트림은 끝나면 지운다. 스트림에 비용 할당 태그를 붙이면 Cost Explorer에서 스트림별 비용을 나눠 볼 수 있다.
7. **서버 측 암호화 비용을 안다.** 기본 KMS 키(`aws/kinesis`)는 키 요금이 없지만 Kinesis가 대신 부르는 KMS API 호출은 요금이 붙는다. 이 호출 수는 생산자·소비자가 쓰는 자격 증명 수에 따라 는다. IAM 역할을 맡을 때마다 새 자격 증명이 생기므로, 받은 자격 증명을 캐시하면 호출을 줄일 수 있다.

@sim kds-cost

@quiz

@design

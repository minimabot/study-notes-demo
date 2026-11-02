---
chapter: dynamodb/cost
---

@topic dynamodb/cost/throughput

DynamoDB 요금은 크게 세 덩어리다. **읽기·쓰기 처리량**, **저장**, 그리고 백업·복제·스트림 같은 **부가 기능**이다. 읽기·쓰기를 어떻게 매기는지는 용량 모드(capacity mode)에 따라 다르다. 두 모드의 동작 차이는 {{ch:dynamodb/capacity}}에서 다뤘고, 여기서는 요금만 본다.

- **온디맨드 용량 모드(On-demand).** 실제로 처리한 요청만큼 낸다. 읽기는 읽기 요청 단위(RRU), 쓰기는 쓰기 요청 단위(WRU)로 센다. 요청이 없으면 처리량 요금도 없다.
- **프로비저닝된 용량 모드(Provisioned).** 초당 처리량을 읽기 용량 단위(RCU)와 쓰기 용량 단위(WCU)로 미리 정하고, 정해 둔 용량을 시간 단위로 낸다. 실제로 쓰지 않은 용량도 요금에 들어간다.

단위 하나가 처리하는 크기는 두 모드가 같다. 읽기 단위 하나는 {{fact:dynamodb.rcu.item-size}}까지의 강력한 일관된 읽기 한 번이고, 최종적 일관된 읽기(eventually consistent read)라면 {{fact:dynamodb.read.eventual-per-unit}}이다. 쓰기 단위 하나는 {{fact:dynamodb.wcu.item-size}}까지의 쓰기 한 번이다. 트랜잭션 읽기·쓰기는 단위를 {{fact:dynamodb.txn.unit-multiplier}}로 쓴다. 항목이 크면 크기를 단위 크기로 나눠 올림한 수만큼 단위가 든다.

서울 리전을 기준으로 하고 미국 동부(버지니아 북부)를 참고로 붙인다. Standard 테이블 클래스의 값이다.

| 항목 | 서울 (ap-northeast-2) | us-east-1 (참고) |
|---|---|---|
| 온디맨드 읽기 | {{fact:dynamodb.price.od.read.std.apne2}} | {{fact:dynamodb.price.od.read.std.use1}} |
| 온디맨드 쓰기 | {{fact:dynamodb.price.od.write.std.apne2}} | {{fact:dynamodb.price.od.write.std.use1}} |
| 프로비저닝 읽기 | {{fact:dynamodb.price.prov.rcu.std.apne2}} | {{fact:dynamodb.price.prov.rcu.std.use1}} |
| 프로비저닝 쓰기 | {{fact:dynamodb.price.prov.wcu.std.apne2}} | {{fact:dynamodb.price.prov.wcu.std.use1}} |

프로비저닝(Standard)에는 프리 티어로 {{fact:dynamodb.price.free-tier.capacity}}가 있다. 요금은 리전마다 다르고 자주 바뀐다. 이 장의 값은 {{fact:dynamodb.price.offer-version}} 기준이므로, 실제 단가는 요금 페이지나 AWS Pricing Calculator에서 다시 확인한다.

**어느 모드가 싼가.** 같은 요청량을 계속 낸다면 프로비저닝이 싸다. 대신 프로비저닝은 최고치에 맞춰 여유를 두어야 하고, 쓰지 않은 용량도 낸다. AWS 비용 최적화 안내는 다음 신호를 기준으로 삼는다.

- **온디맨드가 맞는 경우.** 트래픽이 시간에 따라 바뀌거나, 배치 작업으로 요청량이 들쭉날쭉하거나, 언제 몰릴지 예측하기 어렵다. 한 시간 안에 트래픽이 0이나 {{fact:dynamodb.cost.ondemand.low-ratio}} 아래로 떨어지는 일이 잦다.
- **프로비저닝이 맞는 경우.** 시간·하루 단위로 꾸준하고 예측 가능하며, 짧은 급증이 적다. Auto Scaling으로 소비 용량에 프로비저닝 용량을 가깝게 붙인다. 목표 사용률은 보통 {{fact:dynamodb.autoscaling.target.recommended}}로 둔다.

결국 비교 기준은 **평균 사용률**이다. 프로비저닝 용량을 평균 소비량에 가깝게 유지할 수 있으면 프로비저닝이, 평균이 최고치보다 훨씬 낮으면 온디맨드가 유리하다. 아래 계산기로 직접 비교해 본다.

@topic dynamodb/cost/table-class

**저장 요금.** 테이블과 인덱스에 담긴 데이터 크기로 매긴다. 크기는 시간마다 재고, 한 달 평균으로 GB-월 요금을 낸다. 청구되는 크기는 속성 이름과 값의 바이트 수에 {{fact:dynamodb.storage.item-overhead}}의 오버헤드를 더한 값이다. 그래서 `DescribeTable`이 보여 주는 크기보다 청구서의 크기가 크다. 보조 인덱스에 투영한 속성도 따로 저장되므로 저장 요금이 붙는다. Standard 테이블 클래스에는 프리 티어로 {{fact:dynamodb.price.free-tier.storage}}가 있다.

**테이블 클래스(table class).** 테이블마다 클래스가 하나 붙고, 그 테이블의 보조 인덱스도 같은 클래스를 따른다.

- **DynamoDB Standard.** 기본값이다. AWS는 대부분의 워크로드에 이것을 권한다. 처리량 단가가 낮다.
- **DynamoDB Standard-IA(Standard-Infrequent Access).** 저장 단가가 Standard보다 {{fact:dynamodb.tableclass.ia.storage-saving}} 낮은 대신, 읽기·쓰기 단가가 {{fact:dynamodb.tableclass.ia.throughput-premium}} 높다. 성능, 내구성, 가용성은 같다. API와 엔드포인트도 같아서 코드를 고치지 않는다.

| 항목 (서울) | Standard | Standard-IA |
|---|---|---|
| 저장 | {{fact:dynamodb.price.storage.std.apne2}} | {{fact:dynamodb.price.storage.ia.apne2}} |
| 온디맨드 읽기 | {{fact:dynamodb.price.od.read.std.apne2}} | {{fact:dynamodb.price.od.read.ia.apne2}} |
| 온디맨드 쓰기 | {{fact:dynamodb.price.od.write.std.apne2}} | {{fact:dynamodb.price.od.write.ia.apne2}} |
| 프로비저닝 읽기 | {{fact:dynamodb.price.prov.rcu.std.apne2}} | {{fact:dynamodb.price.prov.rcu.ia.apne2}} |
| 프로비저닝 쓰기 | {{fact:dynamodb.price.prov.wcu.std.apne2}} | {{fact:dynamodb.price.prov.wcu.ia.apne2}} |

us-east-1의 Standard-IA 저장 단가는 {{fact:dynamodb.price.storage.ia.use1}}이다(Standard는 {{fact:dynamodb.price.storage.std.use1}}).

**IA가 이득인 때.** 저장이 비용의 주인 테이블이다. 오래된 주문 이력, 애플리케이션 로그, 지난 게시물처럼 많이 쌓아 두고 드물게 읽는 데이터가 여기에 든다. 개발자 안내서는 Standard로 계산한 저장 비용이 처리량 비용의 {{fact:dynamodb.tableclass.ia-breakeven}}를 넘으면 IA가 총비용을 줄일 수 있다고 쓴다. 비용 최적화 안내는 같은 기준을 "전체 월 비용의 약 {{fact:dynamodb.tableclass.ia-breakeven}}"로 적는다. 어느 쪽이든 대략의 기준이므로, Cost Explorer나 비용 및 사용 보고서(CUR)에서 테이블의 실제 저장·처리량 비용을 뽑아 두 클래스로 계산해 본다.

주의할 점은 세 가지다.

- **프리 티어가 없다.** IA의 저장과 프로비저닝 용량에는 무료 구간이 없다. 작은 테이블은 IA로 바꿔도 이득이 거의 없다.
- **예약 용량이 안 된다.** 예약 용량을 산 Standard 테이블을 IA로 옮기면 할인이 사라져 오히려 비쌀 수 있다.
- **자주 못 바꾼다.** 클래스 변경은 {{fact:dynamodb.tableclass.update.max}}까지다. 변경은 백그라운드로 진행되고 그동안 테이블은 평소처럼 쓸 수 있다.

테이블 하나에 뜨거운 데이터와 차가운 데이터가 섞여 있으면 클래스 하나로는 둘 다 맞출 수 없다. 이때는 최근 데이터는 Standard 테이블에, 오래된 데이터는 별도의 Standard-IA 테이블에 두는 방법을 쓴다.

@sim ddb-cost

@topic dynamodb/cost/reserved

**예약 용량(reserved capacity)** 은 일정량의 프로비저닝 처리량을 약정 기간 동안 쓰기로 하고 할인을 받는 방식이다. 한 번 선결제(부분 선결제)를 내고, 약정한 용량을 할인된 시간 단가로 낸다. 약정 기간은 {{fact:dynamodb.reserved.term.short}}이고, 일부 리전에서는 {{fact:dynamodb.reserved.term.long}}도 고를 수 있다. 표준 요금 대비 절감 폭은 1년이 {{fact:dynamodb.reserved.discount.short}}, 3년이 {{fact:dynamodb.reserved.discount.long}}이다. 구매 단위는 RCU 또는 WCU {{fact:dynamodb.reserved.allocation}}이다.

조건이 많으므로 하나씩 확인한다.

- **Standard 클래스, 프로비저닝 모드, 단일 리전 용량만 된다.** 온디맨드 테이블, Standard-IA 테이블, 글로벌 테이블의 복제된 쓰기 용량 단위(rWCU)에는 쓸 수 없다.
- **산 리전에만 적용된다.** 다른 리전이나 계정으로 옮기거나, 팔거나, 취소할 수 없다.
- **쓰지 않아도 낸다.** 약정한 용량 전체를 실제 사용과 관계없이 낸다. 약정보다 더 프로비저닝한 부분은 일반 프로비저닝 단가로 낸다.

그래서 예약 용량은 **오래 바뀌지 않을 기본 사용량**에만 산다. 지난 사용량에서 늘 깔려 있는 바닥 수준을 예약으로 덮고, 그 위의 변동은 Auto Scaling으로 맞춘다. 트래픽이 아직 불안정하거나 IA로 옮길 계획이 있는 테이블에는 사지 않는다.

@topic dynamodb/cost/other-charges

**백업과 PITR.** 자세한 동작은 {{ch:dynamodb/backup-restore}}에 있다. 요금은 다음과 같다.

| 항목 | 서울 | us-east-1 (참고) |
|---|---|---|
| PITR(특정 시점으로 복구) | {{fact:dynamodb.price.pitr.apne2}} | {{fact:dynamodb.price.pitr.us-east-1}} |
| 온디맨드 백업 보관 | {{fact:dynamodb.price.backup.apne2}} | {{fact:dynamodb.price.backup.us-east-1}} |
| 복원 | {{fact:dynamodb.price.restore.apne2}} | {{fact:dynamodb.price.restore.us-east-1}} |

- PITR은 켜 둔 동안 테이블(LSI 포함) 크기로 계속 낸다. 백업을 몇 번 만드는지와 관계없다.
- 온디맨드 백업은 모든 백업 크기의 합으로 낸다. 달이 바뀌는 날 남아 있는 백업의 한 달 치가 한꺼번에 잡히고, 중간에 지우면 나중에 실제 기간으로 조정된다. 그래서 매달 첫날 비용이 튀어 보이는데, 정상이다. 보존 기간이 긴 백업이 쌓이면 이 비용이 커지므로 보존 정책을 정해 둔다.
- 복원은 복원한 데이터 크기(GSI 포함)로 한 번 낸다. S3로 내보내기와 가져오기도 GB 단위로 따로 낸다.

**글로벌 테이블.** 리플리카 테이블에 쓰면 쓰기를 복제된 쓰기 요청 단위(rWRU, 온디맨드)나 복제된 쓰기 용량 단위(rWCU, 프로비저닝)로 센다. 단가는 일반 쓰기 단위와 같지만, **리플리카가 있는 모든 리전에서** 낸다. 리플리카가 셋이면 쓰기 한 번이 세 리전에서 각각 청구된다. 저장도 리플리카마다 낸다. GSI 갱신은 일반 쓰기 단위로 센다. 리플리카를 새로 추가하면 그 리전에서 복원 요금이 붙는다. 리전 사이 복제에는 데이터 전송 요금이 없다. 재해 복구만이 목적이고 복구 목표가 느슨하다면, 글로벌 테이블 대신 AWS Backup으로 다른 리전에 백업을 복사하는 편이 싸다는 것이 AWS 비용 최적화 안내의 설명이다. 자세한 동작은 {{ch:dynamodb/global-tables}}에 있다.

**스트림.** DynamoDB Streams는 스트림을 읽는 `GetRecords` 호출로 요금을 매긴다. Lambda 트리거와 글로벌 테이블 복제가 읽는 것은 요금이 없다. 그 밖의 소비자는 계정·리전마다 {{fact:dynamodb.price.streams.free-tier}}까지 무료이고, 넘는 부분은 {{fact:dynamodb.price.streams.read.apne2}}(서울)이다. Kinesis Data Streams로 변경 데이터를 보내면 쓰기 크기를 {{fact:dynamodb.wcu.item-size}} 단위로 나눈 변경 데이터 캡처 단위(CDU)로 내고, Kinesis 요금도 따로 붙는다. 자세한 것은 {{ch:dynamodb/streams-ttl}}에 있다.

**DAX.** DynamoDB Accelerator는 클러스터 노드가 떠 있는 시간으로 낸다. 노드 유형과 수로 비용이 정해지므로 요청이 적어도 비용이 줄지 않는다. 반대로 읽기가 많고 캐시 적중률이 높으면 테이블 읽기 단위를 줄인다. 적합성 판단은 {{ch:dynamodb/dax}}에서 다룬다.

**데이터 전송.** DynamoDB로 들어오는 전송과, 같은 리전 안의 다른 AWS 서비스와 주고받는 전송은 요금이 없다. 인터넷으로 나가는 전송과 리전을 넘는 전송은 요금이 붙고, 리전을 넘으면 양쪽 모두에서 청구된다. 애플리케이션은 테이블과 같은 리전에 둔다.

@topic dynamodb/cost/checklist

요금표를 보는 것만큼 **단위를 덜 쓰는 것**이 중요하다. 다음 순서로 점검한다.

1. **최종적 일관된 읽기를 기본으로 쓴다.** 읽기는 기본이 최종적 일관성이다. 강력한 일관된 읽기는 같은 크기에 단위를 {{fact:dynamodb.read.eventual-per-unit}} 더 많이 쓴다. 정말 필요한 접근 패턴에만 강력한 일관성을 쓴다. 트랜잭션도 단위를 {{fact:dynamodb.txn.unit-multiplier}}로 쓰므로, 원자성이 필요 없는 작업은 일반 API로 처리한다.
2. **Scan 대신 Query를 쓴다.** Scan은 테이블 전체를 읽고 읽은 만큼 단위를 쓴다. 필터 표현식은 읽은 뒤에 거르므로 단위를 줄이지 않는다. 접근 패턴에 맞는 키와 인덱스로 Query를 쓴다({{ch:dynamodb/query-scan}}). 분석용 대량 읽기는 S3로 내보내기(Export to S3) 후 Athena로 처리하면 테이블 용량을 쓰지 않는다.
3. **인덱스 프로젝션을 줄인다.** GSI에 쓰는 쓰기는 인덱스마다 따로 단위를 쓰고, 투영한 속성은 따로 저장된다. `ALL` 대신 `KEYS_ONLY`나 `INCLUDE`로 필요한 속성만 넣는다. 쓰지 않는 인덱스는 지운다({{ch:dynamodb/secondary-indexes}}).
4. **삭제는 TTL에 맡긴다.** 만료 시각 속성을 두고 Time to Live(TTL)를 켜면 DynamoDB가 만료된 항목을 지운다. TTL 삭제는 쓰기 용량을 쓰지 않는다. 배치 작업으로 `DeleteItem`을 돌리면 지울 때마다 쓰기 단위를 낸다. 지워진 항목은 스트림에 남으므로 Lambda로 받아 S3 같은 싼 저장소에 보관할 수 있다. 글로벌 테이블에서는 다른 리전으로 복제되는 삭제에 복제 쓰기 요금이 붙는다.
5. **항목을 작게 유지한다.** 항목 크기는 속성 이름과 값의 합이다. 속성 이름을 짧게 지으면 저장 크기가 줄고, 항목이 다음 단위 경계({{fact:dynamodb.rcu.item-size}}, {{fact:dynamodb.wcu.item-size}})를 넘지 않게 할 수 있다. 큰 값은 압축하거나 S3에 두고 참조만 저장한다.
6. **차가운 데이터를 분리한다.** 오래된 데이터는 Standard-IA 테이블로 옮기거나, 보존 기한이 지나면 TTL로 지우고 S3에 보관한다.
7. **용량 모드와 예약을 다시 본다.** 프로비저닝 테이블의 사용률이 낮으면 온디맨드나 낮은 용량으로, 꾸준한 온디맨드 테이블은 프로비저닝과 예약 용량으로 옮기는 것을 검토한다.
8. **쓰지 않는 자원을 찾는다.** 읽기·쓰기가 거의 없는 테이블, 쓰지 않는 GSI, 오래 쌓인 온디맨드 백업을 찾아 정리한다. 테이블에 비용 할당 태그를 붙이면 Cost Explorer에서 테이블별 비용을 나눠 볼 수 있다.

@quiz

@design

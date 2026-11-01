---
chapter: dynamodb/capacity
---

@topic dynamodb/capacity/modes

테이블의 **처리량 모드(Throughput mode)** 는 용량을 누가 관리하고 요금을 어떻게 매기는지를 정한다. 모드는 두 가지다.

| 모드 | 특징 |
|---|---|
| 온디맨드 모드(On-demand mode) | 처리량을 미리 정하지 않는다. 읽기·쓰기 요청 수만큼 요금을 낸다. 트래픽이 없으면 처리량 요금도 없다. AWS가 대부분의 워크로드에 기본값이자 권장 모드로 안내한다 |
| 프로비저닝된 모드(Provisioned mode) | 초당 RCU·WCU를 직접 정한다. 실제로 쓴 양이 아니라 **정해 둔 양**에 시간 단위로 요금을 낸다. 꾸준하고 예측 가능한 트래픽에서 비용을 예측하기 쉽다 |

두 모드는 지연 시간, SLA, 보안 수준이 같다. 달라지는 것은 용량 관리 방식과 요금뿐이다.

두 모드 모두 테이블 하나에 기본 처리량 한도가 있다. 기본값은 {{fact:dynamodb.throughput.table-default}}이고, 한도 증가를 요청할 수 있다. 이 한도를 넘는 요청은 스로틀된다. 단위 크기 계산은 {{ch:dynamodb/reads-writes}}에서 다뤘다.

@topic dynamodb/capacity/on-demand

온디맨드 테이블은 트래픽에 맞춰 스스로 늘어난다. 그래도 "무한히 즉시"는 아니다. 규칙을 알아 두어야 한다.

- **새 테이블의 출발점.** 새 온디맨드 테이블은 바로 {{fact:dynamodb.ondemand.new-table.write}}, {{fact:dynamodb.ondemand.new-table.read}}까지 감당한다.
- **이전 최고치의 {{fact:dynamodb.ondemand.peak-multiplier}}까지는 즉시.** 한 번 도달한 최고 트래픽(이전 최고치)의 {{fact:dynamodb.ondemand.peak-multiplier}}까지는 바로 받아 준다. 더 높은 트래픽이 이어지면 그 값이 새 최고치가 된다.
- **그 이상은 시간이 필요하다.** 이전 최고치의 {{fact:dynamodb.ondemand.peak-multiplier}}를 {{fact:dynamodb.ondemand.peak-growth-window}} 안에 넘기면 스로틀될 수 있다. AWS는 이런 큰 증가 전에 테이블을 미리 데우거나(사전 워밍), 증가를 {{fact:dynamodb.ondemand.peak-growth-window}} 이상에 걸쳐 나누라고 권장한다.

**최대 처리량(Maximum throughput)** 은 온디맨드 테이블과 GSI에 선택적으로 거는 상한이다. 읽기와 쓰기를 따로 정한다. 쓰임새는 세 가지다.

1. 비용 상한을 둔다.
2. 잘못된 코드나 폭주한 프로세스가 쓰는 양을 막는다.
3. 용량이 고정된 하위 시스템이 한꺼번에 몰린 이벤트에 넘어지지 않게 한다.

상한을 넘는 요청은 `ThrottlingException`을 받는다. 다만 이 상한은 보장된 천장이 아니라 목표값이다. 버스트 용량 때문에 잠깐 넘을 수 있다.

@topic dynamodb/capacity/provisioned

프로비저닝된 모드에서는 RCU와 WCU를 직접 정한다. 대량 적재처럼 일시적으로 많이 써야 하면 `UpdateTable`로 올렸다가 끝나면 내릴 수 있다.

**Auto Scaling.** 콘솔에서 테이블을 만들면 기본으로 켜진다. Application Auto Scaling의 대상 추적(target tracking) 정책으로 동작한다. 정하는 값은 세 가지다.

| 설정 | 설명 |
|---|---|
| 최소·최대 용량 | 자동 조정이 움직일 수 있는 범위 |
| 목표 사용률(Target utilization) | 프로비저닝 대비 소비 비율. {{fact:dynamodb.autoscaling.target.min}}~{{fact:dynamodb.autoscaling.target.max}}에서 고르며, AWS 권장값은 {{fact:dynamodb.autoscaling.target.recommended}} |
| 대상 | 테이블 읽기, 테이블 쓰기, 각 GSI를 따로 정한다 |

Auto Scaling은 **즉시 반응하지 않는다.** 소비 용량이 목표를 {{fact:dynamodb.autoscaling.scale-out-breach}} 넘어야 확장이 시작되고, 그 뒤 `UpdateTable`이 반영되는 데 다시 몇 분이 걸린다. 축소는 소비가 {{fact:dynamodb.autoscaling.scale-in-datapoints}} 동안 목표보다 낮을 때 일어난다. 그래서 짧고 날카로운 스파이크는 Auto Scaling이 아니라 버스트 용량이 받아 낸다.

> **주의:** 테이블에 Auto Scaling을 켰다면 GSI에도 같은 설정을 적용하라고 AWS는 강하게 권장한다. GSI의 용량이 모자라면 테이블 쓰기까지 스로틀될 수 있다. 기존 테이블에 GSI를 새로 만들면 백필이 끝날 때까지 그 GSI에는 Auto Scaling이 적용되지 않는다.

**예약 용량(Reserved capacity).** 프로비저닝된 모드이고 Standard 테이블 클래스인 테이블에만 살 수 있다. {{fact:dynamodb.reserved.allocation}}씩 사고, 약정 기간은 {{fact:dynamodb.reserved.term.short}}(일부 리전은 {{fact:dynamodb.reserved.term.long}})이다. 실제 사용량과 상관없이 약정한 양을 모두 내므로, 늘 깔려 있는 기준 사용량에 맞춰 산다. 온디맨드 모드, Standard-IA 테이블 클래스에는 쓸 수 없다. 산 리전에만 적용되고 취소나 이전이 안 된다.

@topic dynamodb/capacity/warm-burst

**웜 처리량(Warm throughput)** 은 테이블이나 GSI가 지금 **즉시** 받아 줄 수 있는 초당 읽기·쓰기 양이다. 과거 사용량에 따라 정해지고, 모든 테이블에서 무료로 확인할 수 있다. 온디맨드 테이블이거나, 프로비저닝 값을 이 수준으로 올리면 그만큼의 요청을 바로 처리할 수 있다.

제품 출시나 할인 행사처럼 트래픽이 평소보다 몇 십 배 넘게 뛸 예정이면, 웜 처리량을 미리 올릴 수 있다. 이것이 **사전 워밍(Pre-warming)** 이다.

- 처리량 모드나 용량 설정을 바꾸지 않는다. 즉시 받아 줄 수 있는 바닥만 높인다.
- 미리 올린 만큼은 요금이 든다. 기본 웜 처리량 확인은 무료다.
- 완료까지 걸리는 시간은 값과 테이블 크기에 따라 다르다. 행사 직전이 아니라 미리 한다.

**버스트 용량(Burst capacity)** 은 다 쓰지 않은 처리량의 일부를 최대 {{fact:dynamodb.burst.retention}} 분량까지 모아 두었다가 순간 스파이크에 쓰는 장치다. 다만 DynamoDB가 백그라운드 유지 작업에 먼저 쓸 수도 있으므로, 용량 계획에 넣어 계산하면 안 된다.

**적응형 용량(Adaptive capacity)** 은 접근이 한 파티션에 몰릴 때 그 파티션에 처리량을 더 나눠 주는 기능이다. 모든 테이블에서 자동으로 켜져 있다. 그래도 파티션 하나의 한도({{fact:dynamodb.partition.read.max}}, {{fact:dynamodb.partition.write.max}})는 넘을 수 없다. 자세한 내용은 {{ch:dynamodb/partitions}}에서 다룬다.

@topic dynamodb/capacity/switching

모드는 나중에 바꿀 수 있지만 방향에 따라 제약이 다르다.

| 방향 | 제약 |
|---|---|
| 프로비저닝 → 온디맨드 | {{fact:dynamodb.capacity.switch-to-ondemand.max}}까지 |
| 온디맨드 → 프로비저닝 | 언제든 가능 |

**프로비저닝에서 온디맨드로.** 전환에는 몇 분이 걸리고, 그동안은 기존 프로비저닝 값만큼 처리한다. 처음 온디맨드로 바꾼 테이블은 이전 최고치가 없으므로, 새 온디맨드 테이블의 출발점과 그동안 프로비저닝했던 최댓값 중 큰 쪽을 바로 감당한다. 콘솔로 바꾸면 Auto Scaling 설정이 지워지고, CLI·SDK로 바꾸면 남아 있다가 다시 프로비저닝으로 돌아올 때 쓰인다.

**온디맨드에서 프로비저닝으로.** 온디맨드에서 도달했던 최고치만큼 처리하다가 새 설정으로 넘어간다. CloudWatch의 과거 소비량을 보고, 전환 직후를 버틸 만큼 초기 값을 넉넉하게 잡는다. 콘솔은 목표 사용률 {{fact:dynamodb.autoscaling.target.recommended}}의 Auto Scaling을 함께 켜도록 권장한다.

@quiz

@design

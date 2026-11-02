---
chapter: kinesis/capacity-modes
---

@topic kinesis/capacity-modes/modes

**용량 모드(Capacity mode)** 는 데이터 스트림의 용량을 누가 관리하고 요금을 어떻게 매기는지를 정한다. Kinesis Data Streams에는 세 가지가 있다.

| 모드 | 특징 |
|---|---|
| 온디맨드 표준(On-demand Standard) | 용량을 미리 정하지 않는다. 샤드 수는 서비스가 관리한다. 쓰고 읽은 데이터 양(GB)만큼 요금을 낸다 |
| On-demand Advantage | 계정 수준 설정이다. 온디맨드 스트림에 웜 처리량과 다른 요금 구조를 더한다. 아래에서 따로 다룬다 |
| 프로비저닝(Provisioned) | 샤드 수를 직접 정한다. 스트림 용량은 샤드 용량의 합이다. 샤드 단위로 요금을 낸다 |

어느 모드든 쓰기는 `PutRecord`·`PutRecords`로 한다. 읽기는 `GetRecords`를 쓰는 기본(공유 처리량) 소비자와 `SubscribeToShard`를 쓰는 향상된 팬아웃(Enhanced Fan-Out, EFO) 소비자를 모두 쓸 수 있다. 보존 기간, 암호화, 모니터링 지표 같은 기능과 내구성·가용성도 모드와 상관없이 같다.

고르는 기준은 트래픽의 모양이다.

- **변동이 크고 예측하기 어렵다 → 온디맨드.** 최고치에 맞춰 샤드를 깔아 두면 평소 사용률이 낮아 비용이 샌다.
- **예측할 수 있고 용량 계산이 쉽다 → 프로비저닝.** 데이터가 샤드에 어떻게 나뉘는지 세밀하게 다루고 싶을 때도 프로비저닝이다.

샤드와 파티션 키의 기본 개념은 {{ch:kinesis/key-concepts}}에서 다룬다.

@topic kinesis/capacity-modes/on-demand

온디맨드 스트림은 쓰기 처리량에 맞춰 샤드를 스스로 늘린다. 그래도 "무한히 즉시"는 아니다.

- **새 스트림의 출발점.** 새로 만든 온디맨드 스트림은 기본으로 쓰기 {{fact:kinesis.ondemand.default-write}}, 읽기 {{fact:kinesis.ondemand.default-read}}를 갖는다.
- **최근 최고치의 {{fact:kinesis.ondemand.peak-multiplier}}까지는 바로 받는다.** 기준은 최근 {{fact:kinesis.ondemand.peak-lookback}} 동안의 최고 쓰기 처리량이다. 새 최고치가 이어지면 기준도 따라 오른다. 예를 들어 쓰기가 {{raw:10~40 MB/s}} 사이였다면 {{raw:80 MB/s}}까지는 바로 받는다.
- **그보다 빠른 증가는 스로틀될 수 있다.** 이전 최고치의 {{fact:kinesis.ondemand.peak-multiplier}}를 {{fact:kinesis.ondemand.throttle-window}} 안에 넘기면, 데이터가 샤드에 고르게 퍼져 있어도 쓰기·읽기 예외가 약 {{fact:kinesis.ondemand.throttle-window}} 동안 날 수 있다. AWS는 이런 요청을 모두 재시도하라고 권장한다.
- **스트림 하나의 상한은 리전마다 다르다.** 미국 동부(버지니아 북부)·미국 서부(오레곤)·유럽(아일랜드)은 {{fact:kinesis.ondemand.max.major-regions}}, 서울을 포함한 기타 리전은 {{fact:kinesis.ondemand.max.other-regions}}다. 기타 리전은 지원 요청으로 높일 수 있다.

**읽기.** 읽기 용량은 쓰기 처리량에 비례해 늘어난다. `GetRecords`로는 {{fact:kinesis.ondemand.read-multiplier}}를 읽을 수 있다. AWS는 `GetRecords` 소비자를 하나만 두어 장애 뒤 밀린 데이터를 따라잡을 여유를 남기고, 소비자 애플리케이션이 둘 이상이면 향상된 팬아웃을 쓰라고 권장한다. 향상된 팬아웃 소비자는 {{fact:kinesis.efo.consumers.max}}까지 등록할 수 있고, 저마다 전용 처리량을 받는다.

**치우친 파티션 키.** 온디맨드 모드는 샤드 하나로 들어오는 트래픽이 {{fact:kinesis.ondemand.split-threshold}}를 넘으면 {{fact:kinesis.ondemand.split-delay}} 안에 그 샤드를 나눈다. 상위 샤드의 해시 키 범위를 하위 샤드에 똑같이 나누는 방식이다. 그래서 키 분포가 조금 고르지 않아도 적응한다. 한계는 두 가지다.

1. 파티션 키 하나가 샤드 한도({{fact:kinesis.shard.write}})를 넘으면 나눠도 소용없다. 같은 키는 늘 같은 샤드로 간다.
2. 트래픽을 몰고 오는 해시 키를 찾아 따로 떼어 내지 않는다. 키가 심하게 치우쳤다면 AWS는 샤드를 원하는 지점에서 나눌 수 있는 프로비저닝 모드를 권장한다.

@topic kinesis/capacity-modes/advantage

**On-demand Advantage** 는 한 리전의 모든 온디맨드 스트림에 적용되는 계정 수준 설정이다. 문서에 최근 추가된 기능이라 시험 범위인지는 확인되지 않았다. 스트림은 지금처럼 사용량에 따라 자동으로 늘고, 다음이 더해진다.

- **웜 처리량(Warm throughput).** 쓰기 용량을 미리 확보한다. 예를 들어 행사 때 {{raw:200 MB/s}}가 예상되면 웜 처리량을 그 값으로 미리 둔다. 추가 요금은 없다. 콘솔의 웜 처리량 편집이나 `UpdateStreamWarmThroughput` API로 설정하고, 프로비저닝에서 온디맨드로 바꿀 때(`UpdateStreamMode`)도 함께 정할 수 있다.
- **줄이기.** 일시적인 급증으로 스트림이 웜 처리량보다 크게 늘었다면, 웜 처리량을 같은 값이나 더 낮은 값으로 다시 설정해 축소를 일으킨다. 용량은 요청한 값과 최근 한 시간의 최고 수집량을 감당할 값 중 큰 쪽까지만 줄어든다.
- **요금.** 스트림마다 붙던 고정 요금이 없어지고 수집·조회·연장 보존 요금만 남는다. 각 단가는 온디맨드 표준보다 {{fact:kinesis.advantage.discount}} 낮다. 향상된 팬아웃 조회에도 할증이 없다.
- **향상된 팬아웃 소비자.** 스트림당 등록 수가 {{fact:kinesis.advantage.efo-consumers}}로 늘어난다.

대신 약정이 있다. 켜면 리전의 온디맨드 스트림 전체로 {{fact:kinesis.advantage.commit}}을 약정한다. 덜 쓰면 모자란 만큼을 같은 할인 단가로 낸다. 켠 뒤 {{fact:kinesis.advantage.min-period}}이 지나야 끌 수 있고, 온디맨드 표준으로 돌아가려면 스트림에 설정한 웜 처리량을 먼저 지워야 한다. 사용량이 약정 근처나 그 이상으로 꾸준하거나, 팬아웃 소비자가 많거나, 스트림이 수백 개인 계정에 맞는다.

@topic kinesis/capacity-modes/provisioned

프로비저닝 모드에서는 샤드 수를 직접 정한다. 계산에 필요한 값은 다음과 같다.

| 입력 | 뜻 |
|---|---|
| 평균 레코드 크기 | KB 단위로 올림한 값 |
| 초당 레코드 수 | 초당 쓰는 레코드 수 |
| 소비자 수 | 같은 데이터를 따로따로 동시에 읽는 애플리케이션 수 |

개발자 안내서의 계산식을 풀어 쓰면 이렇다.

```
쓰기 대역폭(KB/s) = 평균 레코드 크기(KB, 올림) × 초당 레코드 수
읽기 대역폭(KB/s) = 쓰기 대역폭 × 소비자 수
샤드 수 = 올림( max( 쓰기 대역폭 ÷ 1024, 읽기 대역폭 ÷ 2048 ) )
```

1024와 2048은 샤드 하나의 쓰기 용량({{fact:kinesis.shard.write}})과 공유 읽기 용량({{fact:kinesis.shard.read}})을 KB로 바꾼 값이다. 계산식에는 없지만 샤드 쓰기에는 레코드 수 한도({{fact:kinesis.shard.write-records}})도 있다. 작은 레코드를 아주 많이 쓰면 데이터 양보다 레코드 수가 샤드 수를 정한다. 아래 계산기는 세 가지를 모두 따진다.

읽기 대역폭에 소비자 수를 곱하는 것은 **공유 처리량 소비자** 의 경우다. 이들은 샤드 하나의 읽기 용량을 함께 나눠 쓴다. **향상된 팬아웃 소비자** 는 저마다 {{fact:kinesis.efo.throughput}}를 따로 받으므로, 소비자를 늘려도 샤드가 더 필요해지지 않는다.

@sim kds-shard-calc

계산 결과는 키 분포가 고르다는 가정 위의 값이다. 최고치에 맞춰 잡지 않았거나, 파티션 키가 한 샤드로 몰리면 프로비저닝 모드에서도 처리량 초과 예외가 난다. 이때는 직접 샤드 수를 늘리거나 뜨거운 샤드를 나눈다. 샤드 수는 콘솔이나 `UpdateShardCount` API로 바꾸며, 생산자와 소비자가 읽고 쓰는 중에도 바꿀 수 있다. 자세한 방법은 {{ch:kinesis/resharding}}에서 다룬다.

@topic kinesis/capacity-modes/switching

스트림 하나는 온디맨드와 프로비저닝 사이를 {{fact:kinesis.mode-switch.max}} 바꿀 수 있다. 콘솔의 **구성** 탭에서 용량 모드를 편집하거나 `UpdateStreamMode` API를 쓴다.

- **중단이 없다.** 바꾸는 동안에도 읽고 쓸 수 있다. 상태는 `UPDATING`이 되고, `ACTIVE`로 돌아올 때까지 다른 속성은 바꿀 수 없다.
- **샤드 수는 그대로 시작한다.** 어느 방향이든 전환 직후에는 이전 샤드 수를 유지한다.

| 방향 | 전환 뒤 |
|---|---|
| 프로비저닝 → 온디맨드 | 서비스가 쓰기 처리량을 보고 샤드 수를 조정한다 |
| 온디맨드 → 프로비저닝 | 샤드 수를 감시하고 조정하는 일이 내 몫이 된다 |

계정의 온디맨드 스트림 수에는 기본 한도({{fact:kinesis.ondemand.streams.default}})가 있고 늘릴 수 있다. 온디맨드 표준과 On-demand Advantage 사이의 전환은 스트림 설정이 아니라 계정 설정이다(위 절 참고).

@quiz

@design

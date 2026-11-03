---
chapter: ec2/spot
---

@topic ec2/spot/pricing-pools

**스팟 인스턴스(Spot Instances)** 는 EC2의 남는 용량을 온디맨드보다 싸게 쓰는 방식이다. 절감 폭은 {{fact:ec2.spot.max-discount}}다. 대신 EC2가 용량을 되찾아야 할 때 인스턴스를 돌려줘야 한다. 실행 중에는 온디맨드 인스턴스와 똑같이 동작한다. 차이는 "EC2가 끊을 수 있다"는 것 하나다.

**용어.**

| 용어 | 뜻 |
|---|---|
| 스팟 용량 풀(Spot capacity pool) | 같은 인스턴스 유형, 같은 가용 영역의 남는 인스턴스 묶음. 예: `ap-northeast-2a`의 `m5.large` |
| 스팟 가격(Spot price) | 시간당 가격. EC2가 정하고, 장기적인 수요·공급에 따라 서서히 바뀐다 |
| 스팟 인스턴스 요청 | 일회성(one-time) 또는 영구(persistent). 영구 요청은 인스턴스가 중단되면 EC2가 다시 제출한다 |

- 입찰하지 않는다. 요청에 최고 가격(maximum price)을 줄 수는 있지만, 주면 주지 않을 때보다 더 자주 중단된다.
- 가격은 가용 영역마다 다르다. 콘솔이나 `describe-spot-price-history`로 지난 가격을 본다.
- 스팟 인스턴스에는 Savings Plans가 적용되지 않는다. 스팟 사용이 Compute Savings Plans 약정을 소진하지도 않는다.
- 할당량은 온디맨드처럼 vCPU 수로 센다. 종료한 뒤 요청을 취소하지 않으면 그 요청이 할당량에 남을 수 있다.
- 스팟 인스턴스는 인스턴스 유형을 바꿀 수 없다.

**중단될 때 요금.**

| 누가 끊었나 | 요금(Windows, SUSE를 뺀 Linux) |
|---|---|
| EC2가 중단 | 첫 시간 안이면 요금 없음. 그 뒤면 쓴 초만큼 |
| 사용자가 중지·종료 | 쓴 초만큼 |

SUSE는 시간 단위로 계산하는 등 규칙이 다르다. 중단으로 중지된 동안에는 남아 있는 EBS 볼륨 요금만 낸다.

**맞는 워크로드와 맞지 않는 워크로드.**

- 맞는다: 상태가 없고(stateless), 장애를 견디고, 유연한 일. 빅데이터, 컨테이너 워크로드, CI/CD, 상태 없는 웹 서버, HPC, 렌더링, 배치 작업, 데이터 분석.
- 맞지 않는다: 유연하지 않은 일, 상태를 갖는 일, 장애를 견디지 못하는 일, 노드끼리 강하게 묶인 일. 목표 용량이 잠깐이라도 모자라면 안 되는 일.

@topic ec2/spot/interruptions

**스팟 인스턴스 중단(Spot Instance interruption)** 은 EC2가 스팟 인스턴스를 되찾는 일이다. 이유는 세 가지다.

- 용량: EC2가 용량을 다시 써야 할 때. 주된 이유이며, 호스트 유지 관리나 하드웨어 폐기 때도 일어난다.
- 가격: 스팟 가격이 요청에 준 최고 가격보다 높아졌을 때.
- 제약: 시작 그룹(launch group)이나 가용 영역 그룹 같은 제약을 더는 지킬 수 없을 때. 그룹 전체가 함께 종료된다.

**중단 동작(interruption behavior).** 요청할 때 정한다.

| 동작 | 특징 |
|---|---|
| 종료(terminate) | 기본값 |
| 중지(stop) | 영구 요청이어야 한다(EC2 Fleet은 `maintain` 유형). 같은 가용 영역·유형에 용량이 생기면 EC2만 다시 시작할 수 있다. 중지된 동안 EBS 볼륨 요금만 낸다 |
| 최대 절전(hibernate) | 메모리 내용을 저장해 두고 나중에 이어서 시작한다. 최대 절전은 바로 시작되므로 미리 알림 시간이 없다 |

시간에 유연한 작업이라면 종료 대신 중지나 최대 절전으로 두면 용량이 돌아왔을 때 자동으로 이어진다.

**스팟 인스턴스 중단 알림(interruption notice).** EC2가 스팟 인스턴스를 중지·종료하기 {{fact:ec2.spot.notice}} 전에 알림을 보낸다.

- Amazon EventBridge 이벤트 `EC2 Spot Instance Interruption Warning`. `instance-action` 값은 `stop`, `terminate`, `hibernate` 중 하나다.
- 인스턴스 메타데이터 `spot/instance-action`(IMDSv2로 읽는다). 중단 예정이 아니면 항목이 없어 HTTP 404가 돌아온다. 예전 항목 `termination-time`은 호환용이다.
- 문서는 이 알림을 {{fact:ec2.spot.notice.poll}} 확인하라고 권한다. 알림은 최선 노력(best effort)으로 보낸다.
- 동작이 최대 절전이면 알림은 오지만, 최대 절전이 바로 시작되므로 그만큼의 여유는 없다.

**EC2 인스턴스 리밸런싱 권고(rebalance recommendation).** 스팟 인스턴스의 중단 위험이 높아졌다는 신호다. 중단 알림보다 먼저 올 수 있어 미리 움직일 시간을 준다. 다만 늘 먼저 오지는 않고, 중단 알림과 함께 올 수도 있다. EventBridge 이벤트 `EC2 Instance Rebalance Recommendation`과 인스턴스 메타데이터로 받는다.

신호를 받으면 할 수 있는 일:

- 정상 종료 준비: 로그를 Amazon S3에 올리고, SQS 작업자를 멈추고, DNS에서 빠진다. 진행 상황을 외부 스토리지에 저장한다.
- 그 인스턴스에 새 작업을 배정하지 않는다.
- 대체 인스턴스를 미리 띄운다. Auto Scaling 그룹과 EC2 Fleet의 **용량 재조정(Capacity Rebalancing)** 이 이 신호를 받아 자동으로 한다.

문서는 EventBridge 규칙으로 리밸런싱 권고와 중단 알림을 잡아, 작업 체크포인트를 남기거나 중단을 정상적으로 처리하라고 권한다. 중단 대응은 AWS FIS(Fault Injection Service)로 일부러 중단을 일으켜 시험해 볼 수 있다.

@topic ec2/spot/allocation

EC2 Fleet이나 Auto Scaling 그룹에 여러 인스턴스 유형과 가용 영역을 주면, 가능한 스팟 용량 풀이 여러 개 생긴다. **할당 전략(allocation strategy)** 은 그중 어느 풀에서 인스턴스를 가져올지 정한다.

| 전략 | 고르는 풀과 맞는 경우 |
|---|---|
| 가격 용량 최적화(`price-capacity-optimized`, 권장) | 가용 용량이 많은 풀들 가운데 가장 싼 풀. 곧 중단될 가능성이 낮으면서 가격도 낮다. 대부분의 스팟 워크로드(상태 없는 컨테이너, 마이크로서비스, 웹, 분석, 배치)에 맞다 |
| 용량 최적화(`capacity-optimized`) | 가용 용량이 가장 많은 풀. 다시 시작하는 비용이 큰 일(긴 CI, 렌더링, 딥러닝, HPC)에 맞다. 유형 우선순위를 주는 `capacity-optimized-prioritized`도 있다 |
| 다양화(`diversified`) | 모든 풀에 고르게 나눈다 |
| 최저 가격(`lowest-price`, 권장하지 않음) | 가장 싼 풀. 용량을 보지 않아 중단 위험이 가장 높다. AWS CLI에서는 기본값이라 직접 바꿔 줘야 한다 |

스팟 가격은 장기 추세로 서서히 바뀌지만 용량은 실시간으로 바뀐다. 그래서 가격만 보는 전략보다 용량을 함께 보는 전략이 중단이 적다.

**스팟 배치 점수(Spot placement score).** 필요한 스팟 용량과 인스턴스 유형 요구(또는 속성)를 주면, 리전이나 가용 영역마다 요청이 성공할 가능성을 {{fact:ec2.spot.sps.max}}로 알려 준다.

- 쓰는 곳: 다른 리전으로 스팟 용량을 옮기거나 늘릴 때, 단일 가용 영역 워크로드에 맞는 영역을 찾을 때, 앞으로의 확장 리전을 고를 때, 알맞은 유형 조합을 찾을 때.
- 그 시점의 추천일 뿐이다. 용량을 보장하지 않고 중단 위험을 예측하지도 않는다.
- 서로 다른 유형을 {{fact:ec2.spot.sps.min-types}} 지정해야 한다(P, G, Trn, Inf 패밀리는 예외). 적게 주면 낮은 점수가 나온다.
- 추가 요금은 없다.

@topic ec2/spot/best-practices

문서가 정리한 스팟 모범 사례:

- **개별 인스턴스를 중단에 대비시킨다.** 리밸런싱 권고와 중단 알림을 받아 체크포인트를 남기고 정상 종료한다(앞 절).
- **유형과 가용 영역에 유연하다.** 워크로드마다 인스턴스 유형을 {{fact:ec2.spot.flex.types}} 허용하는 것이 경험칙이다. 예를 들어 `c5.large`만 고집하지 말고 c4, m5, m4 패밀리의 large도 허용한다. VPC의 모든 가용 영역을 쓰게 설정한다. 수직 확장이 되는 워크로드는 더 큰 유형도 넣고, 수평 확장만 되면 온디맨드 수요가 적은 이전 세대 유형도 넣는다.
- **속성 기반 인스턴스 유형 선택(attribute-based instance type selection)을 쓴다.** vCPU, 메모리 같은 속성만 주면 맞는 유형을 자동으로 고르고, 새로 나온 유형도 자동으로 포함한다.
- **스팟 배치 점수로 리전·가용 영역을 고른다.**
- **Auto Scaling 그룹이나 EC2 Fleet으로 전체 용량을 관리한다.** 인스턴스 한 대가 아니라 vCPU·메모리 같은 전체 용량으로 생각한다. 목표 용량을 정하면 중단되거나 종료된 인스턴스를 자동으로 대체한다({{ch:ec2/auto-scaling}}).
- **가격 용량 최적화 할당 전략을 쓴다.**
- **스팟을 다루는 AWS 서비스를 쓴다.** Amazon EMR, Amazon ECS, AWS Batch, Amazon EKS, Amazon SageMaker AI, AWS Elastic Beanstalk, Amazon GameLift Servers.

**요청 API 고르기.**

| API | 쓰나 |
|---|---|
| `CreateAutoScalingGroup` | 쓴다. 수명 주기 관리와 확장을 그룹에 맡길 때 |
| `CreateFleet` (EC2 Fleet) | 쓴다. 수명 주기를 직접 관리할 때. 자동 확장이 필요 없으면 `instant` 유형을 권한다. 스팟 할당 전략 기본값이 최저 가격이니 바꿔 준다 |
| `RunInstances` | 유형 하나만 쓸 때. 여러 유형을 섞지 못해 권하지 않는다 |
| `RequestSpotFleet`, `RequestSpotInstances` | 쓰지 않는다. 더 투자하지 않는 레거시 API다 |

**하지 말 것.** 유연하지 않거나 상태를 갖는 워크로드를 스팟에 올리고, 중단되면 온디맨드로 장애 조치(failover)하는 설계를 문서는 강하게 말린다. 온디맨드로 몰리면 다른 스팟 인스턴스의 중단을 부를 수 있고, 같은 유형·가용 영역 조합의 온디맨드 용량도 구하기 어려울 수 있다. 이런 워크로드는 처음부터 온디맨드나 약정 할인({{ch:ec2/purchasing-options}})으로 돌린다.

@quiz

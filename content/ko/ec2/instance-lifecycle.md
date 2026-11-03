---
chapter: ec2/instance-lifecycle
---

@topic ec2/instance-lifecycle/states-billing

인스턴스는 띄운 순간부터 종료될 때까지 정해진 상태를 지난다.

| 상태 | 뜻 | 인스턴스 사용 요금 |
|---|---|---|
| `pending` | `running`으로 갈 준비 중. 띄울 때와 중지 후 시작할 때 거친다 | 없음 |
| `running` | 실행 중. 쓸 수 있다 | 있음 |
| `stopping` | 중지 준비 중 | 없음. 단 **최대 절전** 이면 있음 |
| `stopped` | 꺼져 있다. 언제든 다시 시작한다 | 없음 |
| `shutting-down` | 종료 준비 중 | 없음 |
| `terminated` | 영구 삭제됨. 다시 시작할 수 없다 | 없음 |

- `running`이 되는 순간부터 초 단위로 과금된다. 접속하지 않고 놀고 있어도 마찬가지다. **시작할 때마다** 최소 {{fact:ec2.ondemand.billing.min}}이 붙는다. 재부팅은 새 과금 기간을 열지 않는다.
- "요금 없음"은 인스턴스 사용 요금 얘기다. EBS 볼륨과 Elastic IP 주소는 인스턴스 상태와 상관없이 요금이 나간다. 중지한 인스턴스도 볼륨 저장 요금은 계속 낸다.
- 예약 인스턴스는 적용받던 인스턴스를 종료해도 기간 끝까지 결제 옵션대로 청구된다({{ch:ec2/purchasing-options}}).
- 종료한 인스턴스는 콘솔에 잠시 보이다가 사라진다. 접속하거나 되살릴 수 없다.

아래 실험에서 버튼을 눌러 상태가 어떻게 바뀌는지, 그때 과금과 스토리지·주소가 어떻게 되는지 확인한다.

@sim ec2-lifecycle

@topic ec2/instance-lifecycle/stop-hibernate-terminate

네 가지 동작을 비교한다. 중지와 최대 절전은 **루트가 EBS 볼륨인 인스턴스** 만 된다. 루트가 인스턴스 스토어이면 실행 중이거나 종료뿐이다.

| 항목 | 재부팅 | 중지 | 최대 절전 | 종료 |
|---|---|---|---|---|
| 호스트 | 그대로 | 보통 새 호스트 | 보통 새 호스트 | 없음 |
| 프라이빗 IPv4, IPv6 | 유지 | 유지 | 유지 | 없음 |
| 퍼블릭 IPv4 | 유지 | 반납, 시작 때 새 주소 | 반납, 시작 때 새 주소 | 없음 |
| Elastic IP | 연결 유지 | 연결 유지 | 연결 유지 | 연결 해제 |
| 인스턴스 스토어 데이터 | 유지 | 지워짐 | 지워짐 | 지워짐 |
| EBS 루트 볼륨 | 유지 | 유지 | 유지 | 기본은 삭제 |
| RAM 내용 | 지워짐 | 지워짐 | 루트 볼륨에 저장 | 지워짐 |

**재부팅.** OS를 다시 켜는 것과 같다. 문서는 OS 안에서 재부팅 명령을 치기보다 EC2(콘솔·CLI·API)로 재부팅하라고 권한다.

**중지(stop).** 상태 확인에 실패했거나 앱이 이상할 때 중지 후 시작으로 새 호스트에 옮겨 고칠 수 있다. 중지한 동안에는 인스턴스 유형, 사용자 데이터 같은 일부 속성을 바꿀 수 있다. 퍼블릭 IPv4가 바뀌므로 고정 주소가 필요하면 Elastic IP를 쓴다({{ch:vpc/internet-access}}).

**최대 절전(hibernate).** OS가 디스크로 절전(suspend-to-disk)해 RAM 내용을 EBS 루트 볼륨에 쓴 뒤 꺼진다. 다시 시작하면 RAM을 읽어 들여 프로세스가 멈췄던 곳에서 이어진다. 메모리에 캐시를 오래 데우는 앱이나, 초기화에 시간이 걸리는 서비스를 빨리 되살릴 때 쓴다.

최대 절전 조건(주요한 것):
- **시작할 때** 최대 절전을 켜야 한다. 이미 있는 인스턴스에는 켤 수 없다.
- 지원하는 AMI(HVM)와 인스턴스 패밀리여야 한다.
- 루트 볼륨이 EBS이고, RAM을 담을 만큼 크고, **암호화** 되어 있어야 한다. EBS 기본 암호화를 켜거나, 띄울 때 암호화하거나, 암호화된 AMI를 쓴다.
- RAM이 Linux는 {{fact:ec2.hib.linux.ram.max}}보다 작아야 하고, Windows는 {{fact:ec2.hib.win.ram.max}} 이하여야 한다.
- {{fact:ec2.hib.max.duration}}을 넘겨 최대 절전 상태로 두는 것은 지원하지 않는다.
- Auto Scaling 그룹이나 Amazon ECS가 쓰는 인스턴스는 최대 절전할 수 없다. Auto Scaling 그룹에서 시도하면 그룹이 비정상으로 보고 교체할 수 있다.
- 최대 절전 상태에서는 인스턴스를 수정할 수 없다. 이 점이 그냥 중지와 다르다.
- 스팟 인스턴스도 된다. 사용자가 최대 절전한 경우 용량이 있고 스팟 가격이 최고 가격 이하일 때 다시 시작한다({{ch:ec2/spot}}).

**종료(terminate).** 인스턴스를 영구히 지운다. EBS 볼륨은 볼륨마다 `DeleteOnTermination` 속성에 따라 지워지거나 남는다(다음 절).

@topic ec2/instance-lifecycle/protection

**종료 방지(termination protection, `DisableApiTermination`).** 켜면 콘솔·CLI·API의 `TerminateInstances`로 종료할 수 없다. 기본은 꺼져 있다. 막지 못하는 것이 있다.

- OS 안에서 끄는 경우. 종료 동작이 `terminate`이면 OS의 shutdown 명령으로 인스턴스가 종료된다.
- AWS의 예정된 이벤트에 따른 종료.
- EC2 Auto Scaling의 비정상 교체와 축소(scale-in). 이를 막으려면 Auto Scaling의 인스턴스 축소 보호(scale-in protection)를 쓴다.
- 스팟 인스턴스에는 켤 수 없다.

**중지 방지(stop protection, `DisableApiStop`).** 콘솔·CLI·API로 중지하는 것을 막는다. API로 종료하는 것도 함께 막지만, `DisableApiTermination` 값을 바꾸지는 않는다. OS 명령, 예정된 이벤트, Auto Scaling은 막지 못한다. 루트가 인스턴스 스토어인 인스턴스와 스팟 인스턴스에는 켤 수 없다.

**인스턴스 시작 종료 동작(`InstanceInitiatedShutdownBehavior`).** 인스턴스 안에서 OS를 끌 때 인스턴스를 **중지** 할지 **종료** 할지 정한다. 기본은 중지다. 실행 중이든 중지 중이든 바꿀 수 있다. 루트가 인스턴스 스토어이면 OS를 끄면 늘 종료된다.

**종료할 때 볼륨 처리(`DeleteOnTermination`).** EBS 볼륨마다 따로 정한다. 남긴 볼륨은 계속 과금된다.

| 볼륨 | 붙인 시점 | 기본 동작 |
|---|---|---|
| 루트 볼륨 | 시작할 때 | 삭제 |
| 데이터 볼륨 | 시작할 때(콘솔) | 보존 |
| 데이터 볼륨 | 시작할 때(CLI) | 삭제 |
| 루트·데이터 볼륨 | 시작한 뒤 붙임 | 보존 |

루트 볼륨의 데이터를 종료 뒤에도 남기려면 시작할 때나 실행 중에 루트 볼륨의 `DeleteOnTermination`을 `false`로 바꾼다. 인스턴스 스토어와 RAM의 데이터는 종료하면 어떤 설정으로도 남지 않는다.

@topic ec2/instance-lifecycle/recovery-events

**자동 인스턴스 복구(automatic instance recovery).** 호스트의 하드웨어·소프트웨어 문제로 **시스템 상태 확인(system status check)** 이 실패하면, AWS가 인스턴스를 다른 호스트로 옮긴다. 인스턴스 쪽에서는 예정에 없던 재부팅처럼 보인다. **인스턴스 상태 확인(instance status check)** 만 실패한 경우(OS 문제 등)에는 동작하지 않는다.

| 구분 | 간소화된 자동 복구 | CloudWatch 작업 기반 복구 |
|---|---|---|
| 설정 | 지원 인스턴스는 시작할 때 기본으로 켜진다 | `StatusCheckFailed_System` 경보에 복구 작업을 직접 건다 |
| 알림 | AWS Health 대시보드 | SNS 등으로 원하는 대로 |
| 인스턴스 스토어를 붙여 시작한 인스턴스 | 지원 안 함 | 일부 유형 지원. 데이터는 잃는다 |
| 비용 | 추가 비용 없음 | CloudWatch 요금이 붙을 수 있다 |

- 복구 뒤 남는 것: 인스턴스 ID, 프라이빗·퍼블릭·Elastic IP 주소, 인스턴스 메타데이터, 배치 그룹, 붙은 EBS 볼륨, 가용 영역.
- 잃는 것: RAM 데이터, OS 가동 시간(0부터 다시), CloudWatch 작업 기반이면 인스턴스 스토어 데이터.
- 미리 설정해 두어야 동작한다. 용량이 없거나 큰 장애 중에는 실패할 수 있다. 실패하면 직접 중지 후 시작한다.
- 이 기능은 **인스턴스 한 대** 를 위한 것이다. 시스템의 고가용성은 여러 가용 영역에 걸친 Auto Scaling 그룹과 Elastic Load Balancing으로 만든다고 문서가 권한다({{ch:ec2/auto-scaling}}, {{ch:ec2/load-balancing}}).

**예정된 이벤트(scheduled events).** AWS가 인프라 유지 관리를 위해 인스턴스의 재부팅, 중지, 폐기를 미리 잡는다. 계정 이메일과 AWS Health 이벤트로 알리며, Health 이벤트는 Amazon EventBridge로 받아 자동 처리할 수 있다.

| 이벤트 | 일어나는 일 |
|---|---|
| 인스턴스 중지(instance-stop) | 정한 시각에 중지된다. 다시 시작하면 새 호스트로 옮겨진다. EBS 루트만 해당 |
| 인스턴스 폐기(instance-retirement) | EBS 루트면 중지, 인스턴스 스토어 루트면 종료 |
| 인스턴스 재부팅(instance-reboot) | 같은 호스트에서 재부팅하며 그동안 호스트를 정비한다 |
| 시스템 재부팅(system-reboot) | 재부팅하면서 새 호스트로 옮긴다 |
| 시스템 유지 관리(system-maintenance) | 네트워크·전원 정비로 잠시 영향을 받을 수 있다 |

- 사용자가 이벤트를 만들 수는 없다. 일부 이벤트는 날짜를 바꾸거나, 이벤트 창(event window)을 정해 원하는 시간대에 일어나게 할 수 있다.
- 대응: 편한 때 직접 중지 후 시작해 새 호스트로 옮긴다. 재부팅은 같은 호스트에 남으므로 이것과 다르다. AWS Health 이벤트에 반응해 중지·시작을 자동으로 하게 할 수도 있다. 이벤트는 인스턴스 메타데이터의 `events/maintenance/scheduled`에서도 보인다.
- Auto Scaling 그룹에 속한 인스턴스는 상태 확인에 따라 그룹이 알아서 교체한다.
- 종료 방지와 중지 방지는 예정된 이벤트를 막지 못한다.

@quiz

---
chapter: ec2/ebs
---

@topic ec2/ebs/basics

**Amazon EBS(Elastic Block Store) 볼륨** 은 인스턴스에 붙여 쓰는 블록 스토리지다. OS에서는 물리 디스크처럼 보인다. 파일 시스템을 만들어 쓰거나 데이터베이스가 직접 쓴다. 객체(S3)·파일(EFS) 스토리지와의 비교는 {{ch:ec2/instance-store-efs}}에서 다룬다.

| 성질 | 내용 |
|---|---|
| 수명 | 인스턴스와 따로 존재한다. 인스턴스를 중지해도 데이터가 남는다 |
| 범위 | **가용 영역 하나** 에 속한다. 같은 가용 영역의 인스턴스에만 붙는다 |
| 연결 | 한 인스턴스에 여러 볼륨을 붙일 수 있다. 붙일 수 있는 개수는 인스턴스 유형·크기마다 다르다 |
| 내구성 | io2 Block Express {{fact:ec2.ebs.io2.durability}}, 나머지 유형 {{fact:ec2.ebs.durability.other}} |
| 백업 | AWS가 자동으로 백업하지 않는다. 스냅샷을 정기적으로 만드는 것은 고객 몫이다({{ch:ec2/ebs-snapshots}}) |

**다른 가용 영역으로 옮기기.** 볼륨을 직접 옮기는 기능은 없다. 스냅샷을 만들고, 원하는 가용 영역에서 그 스냅샷으로 새 볼륨을 만든다. 스냅샷은 리전의 모든 가용 영역에 복제돼 있어서 어느 가용 영역에서나 복원할 수 있다.

**종료 시 삭제(DeleteOnTermination).** 인스턴스를 종료할 때 볼륨마다 이 속성에 따라 지우거나 남긴다. 남긴 볼륨은 계속 과금된다.

| 볼륨 | 붙인 시점·방법 | 기본 동작 |
|---|---|---|
| 루트 볼륨 | 시작할 때 | 삭제 |
| 루트 볼륨 | 시작한 뒤 | 보존 |
| 데이터 볼륨 | 시작할 때, 콘솔 | 보존 |
| 데이터 볼륨 | 시작할 때, CLI | 삭제 |
| 데이터 볼륨 | 시작한 뒤 | 보존 |

문서 권장: OS와 데이터를 서로 다른 볼륨에 두고, 데이터 볼륨은 종료 뒤에도 남게 한다. 인스턴스 상태 변화와 종료 방지는 {{ch:ec2/instance-lifecycle}}.

**다중 연결(Multi-Attach).** 프로비저닝된 IOPS SSD(io1, io2) 볼륨 하나를 같은 가용 영역의 Nitro 기반 인스턴스 최대 {{fact:ec2.ebs.multiattach.max}}에 동시에 붙인다. 붙은 인스턴스는 모두 읽고 쓸 수 있다.
- XFS, EXT4 같은 일반 파일 시스템은 여러 서버가 동시에 쓰도록 만들어지지 않았다. **클러스터 파일 시스템** 을 쓰고, 쓰기 순서는 앱이 맞춘다. io1·io2는 NVMe 예약 같은 I/O 펜싱을 지원한다.
- Linux는 io1·io2, Windows는 io2만 지원한다. 부팅 볼륨으로 만들 수 없다. 인스턴스를 시작할 때 켤 수 없다. 붙어 있는 동안 켜고 끌 수 없다.
- EBS 계층 문제가 생기면 붙은 모든 인스턴스가 영향을 받는다.
- 여러 인스턴스가 파일을 공유하는 일반 용도라면 Amazon EFS 같은 공유 파일 스토리지를 먼저 본다({{ch:ec2/instance-store-efs}}).

@topic ec2/ebs/volume-types

볼륨 유형은 크게 SSD와 HDD로 나뉜다. SSD는 작은 I/O가 잦은 트랜잭션 작업(성능 지표: IOPS), HDD는 큰 순차 I/O(성능 지표: 처리량)에 맞다.

**SSD 유형.**

| 항목 | gp3 | gp2 | io2 Block Express | io1 |
|---|---|---|---|---|
| 크기 | {{fact:ec2.ebs.gp.size.min}}~{{fact:ec2.ebs.gp3.size.max}} | {{fact:ec2.ebs.gp.size.min}}~{{fact:ec2.ebs.size.max.16t}} | {{fact:ec2.ebs.pio.size.min}}~{{fact:ec2.ebs.io2.size.max}} | {{fact:ec2.ebs.pio.size.min}}~{{fact:ec2.ebs.size.max.16t}} |
| 최대 IOPS | {{fact:ec2.ebs.gp3.iops.max}} | {{fact:ec2.ebs.gp2.iops.max}} | {{fact:ec2.ebs.io2.iops.max}} | {{fact:ec2.ebs.io1.iops.max}} |
| 최대 처리량 | {{fact:ec2.ebs.gp3.tput.max}} | {{fact:ec2.ebs.gp2.tput.max}} | {{fact:ec2.ebs.io2.tput.max}} | {{fact:ec2.ebs.io1.tput.max}} |
| Multi-Attach | 안 됨 | 안 됨 | 됨 | 됨 |

모든 SSD 유형은 부팅 볼륨이 된다. 표가 넓으므로 휴대폰에서는 아래 설명을 기준으로 본다.

**범용 SSD gp3(General Purpose SSD).** 대부분의 워크로드에 권하는 유형이고 가장 싼 SSD다.
- 크기와 상관없이 기본 {{fact:ec2.ebs.gp3.iops.base}}와 {{fact:ec2.ebs.gp3.tput.base}}가 스토리지 요금에 포함된다.
- 더 필요하면 **크기와 따로** IOPS와 처리량을 추가로 프로비저닝한다(추가 요금). IOPS는 {{fact:ec2.ebs.gp3.iops.per-gib}}까지, 처리량은 {{fact:ec2.ebs.gp3.tput.per-iops}}까지다.
- 버스트를 쓰지 않는다. 프로비저닝한 성능을 계속 낸다.
- gp2보다 GiB당 가격이 {{fact:ec2.ebs.gp3.price.cheaper}} 낮다(문서 표현).
- gp3의 최대 크기·IOPS·처리량은 2025년 9월에 올라갔다. 시험 문제는 그 전 상한을 전제로 할 수 있으니, 숫자보다 "크기와 성능을 따로 정한다"는 성질로 판단한다.

**범용 SSD gp2.** 성능이 크기에 묶인다.
- 기준 IOPS는 {{fact:ec2.ebs.gp2.iops.per-gib}}, 최소 {{fact:ec2.ebs.gp2.iops.min}}, 최대 {{fact:ec2.ebs.gp2.iops.max}}다.
- {{fact:ec2.ebs.gp2.burst.size}} 미만 볼륨은 I/O 크레딧으로 {{fact:ec2.ebs.gp2.burst}}까지 버스트한다. 크레딧은 최대 {{fact:ec2.ebs.gp2.credit.max}}까지 쌓이고(처음에도 이만큼 받는다), 가득 차면 최대 버스트를 {{fact:ec2.ebs.gp2.burst.min-duration}} 이상 유지한다. 크레딧이 바닥나면 기준 IOPS로 떨어진다. CloudWatch `BurstBalance` 지표로 남은 크레딧 비율을 본다.
- 처리량은 {{fact:ec2.ebs.gp2.tput.small-gib}} 이하에서 최대 {{fact:ec2.ebs.gp2.tput.min}}, {{fact:ec2.ebs.gp2.tput.full-gib}} 이상에서 {{fact:ec2.ebs.gp2.tput.max}}다. 그 사이는 버스트로만 {{fact:ec2.ebs.gp2.tput.max}}에 닿는다.
- 성능만 위해 볼륨을 키우던 gp2는 gp3로 바꾸면 크기와 성능을 따로 정할 수 있다.

**프로비저닝된 IOPS SSD io2 Block Express(Provisioned IOPS SSD).** 지연에 민감하고 높은 IOPS가 꾸준히 필요한 핵심 워크로드(대형 데이터베이스 등)에 쓴다.
- 평균 지연이 밀리초 미만(sub-millisecond)으로 짧고 고르다. 내구성이 {{fact:ec2.ebs.io2.durability}}로 가장 높다.
- IOPS는 {{fact:ec2.ebs.io2.iops.per-gib}}까지, 처리량은 {{fact:ec2.ebs.io2.tput.per-iops}} 비율로 IOPS에 따라 오른다.
- 최대 IOPS는 Nitro 기반 인스턴스에서만 낸다. 다른 인스턴스에서는 {{fact:ec2.ebs.non-nitro.iops}}까지다.
- 2025-04-30부터 새로 만든 것과 기존 것 모두, io2 볼륨은 io2 Block Express다.

**io1.** 이전 세대 프로비저닝 IOPS 유형이다. IOPS는 {{fact:ec2.ebs.io1.iops.per-gib}}까지다. 처리량은 프로비저닝 IOPS와 I/O 크기에 따라 달라지고, 최대 처리량은 최대 IOPS와 Nitro 기반 인스턴스에서만 나온다. 문서는 Multi-Attach에도 io2를 권한다.

**HDD 유형.** 둘 다 부팅 볼륨이 될 수 없고 Multi-Attach도 안 된다. 크기는 {{fact:ec2.ebs.hdd.size.min}}~{{fact:ec2.ebs.size.max.16t}}이다. gp2처럼 크레딧(버킷) 방식이고, 처리량은 크기에 비례한다.

| 항목 | 처리량 최적화 HDD st1 | Cold HDD sc1 |
|---|---|---|
| 맞는 일 | 자주 읽는 큰 순차 데이터: 빅데이터, 데이터 웨어하우스, 로그 처리 | 드물게 읽는 데이터, 가장 낮은 저장 비용 |
| 기준 처리량 | {{fact:ec2.ebs.st1.base.per-tib}} | {{fact:ec2.ebs.sc1.base.per-tib}} |
| 버스트 처리량 | {{fact:ec2.ebs.st1.burst.per-tib}} | {{fact:ec2.ebs.sc1.burst.per-tib}} |
| 볼륨 최대 처리량 | {{fact:ec2.ebs.st1.tput.max}} | {{fact:ec2.ebs.sc1.tput.max}} |
| 최대 IOPS | {{fact:ec2.ebs.st1.iops.max}} | {{fact:ec2.ebs.sc1.iops.max}} |

HDD의 IOPS는 큰 I/O 크기를 기준으로 센 값이다. 작은 무작위 I/O에는 SSD를 쓰라고 문서가 권한다. 이전 세대 마그네틱(standard)은 새로 쓰지 않는다.

**고르는 순서.**
1. 부팅 볼륨이거나 작은 무작위 I/O면 SSD다.
2. 대부분은 gp3로 시작한다.
3. 지연이 아주 짧고 고르게, 또는 gp3 상한을 넘는 IOPS·처리량이 필요하거나 Multi-Attach가 필요하면 io2 Block Express다.
4. 큰 순차 I/O이고 비용이 중요하면 st1, 거의 읽지 않으면 sc1이다.

@sim ebs-volume-picker

@topic ec2/ebs/modify-performance

**탄력적 볼륨(Elastic Volumes).** 볼륨 크기를 늘리고, 유형을 바꾸고, IOPS·처리량을 조정한다. 지원 인스턴스(현재 세대 등)에서는 볼륨을 떼거나 인스턴스를 재시작하지 않고 한다. 수정 자체에는 요금이 없고, 수정이 시작되면 새 구성 요금을 낸다.

- **크기는 늘리기만 된다.** 줄이려면 작은 새 볼륨을 만들어 rsync 같은 도구로 옮긴다.
- 크기를 늘린 뒤 OS에서 파티션과 파일 시스템을 직접 넓혀야 새 공간을 쓴다. 늘어난 크기는 수정이 `optimizing` 상태가 되면 쓸 수 있다.
- 한 번 수정하면 `completed`가 될 때까지 같은 볼륨을 다시 수정할 수 없다. 이동 {{fact:ec2.ebs.modify.window}} 안에 볼륨당 {{fact:ec2.ebs.modify.per-window}}까지 수정한다. 요청은 취소할 수 없다.
- 수정은 몇 분에서 몇 시간 걸린다. 초기화가 덜 된 볼륨은 더 오래 걸린다.
- gp2를 gp3로 바꿀 때 IOPS·처리량을 정하지 않으면, 원래 gp2 성능과 gp3 기본값 중 큰 쪽으로 자동 설정된다.
- 루트 볼륨(io1·io2·gp2·gp3)은 st1·sc1로 바꿀 수 없다. Multi-Attach 볼륨은 io1과 io2 사이로만 바꾼다.
- 이전 세대 인스턴스 등에서 오류가 나면, 데이터 볼륨은 떼고 수정한 뒤 다시 붙이고, 루트 볼륨은 인스턴스를 중지하고 수정한다.
- MBR 파티션은 큰 부팅 볼륨을 지원하지 못하므로, 부팅 볼륨을 아주 크게 늘리려면 GPT인지 먼저 확인한다.

**EBS 최적화 인스턴스(EBS-optimized).** EBS I/O에 전용 대역폭을 주어 다른 트래픽과 다투지 않게 한다. 유형에 따라 세 가지다. 기본으로 EBS 최적화인 유형은 따로 켤 필요가 없다. 선택해서 켜는 유형은 시간당 추가 요금이 붙는다. 지원하지 않는 유형도 있다.

**성능의 상한은 둘 중 작은 쪽이다.** 인스턴스 유형의 EBS 성능 한도와, 붙은 볼륨들의 성능 합. 큰 볼륨을 붙여도 인스턴스 쪽 EBS 대역폭이 작으면 그만큼만 나온다. 문서는 앱이 필요한 것보다 EBS 처리량이 넉넉한 인스턴스 유형을 고르라고 권한다. IOPS와 처리량 한도는 I/O 크기에 따라 어느 쪽이 먼저 걸리는지 달라진다.

**점검할 지표.** CloudWatch의 EBS 지표로 IOPS·처리량·대기열 길이를 본다. gp2·st1·sc1은 `BurstBalance`가 줄어드는지 본다. 크레딧이 자주 바닥나면 크기를 늘리거나 gp3·io2로 바꾼다. 스냅샷으로 만든 볼륨은 처음 읽는 블록이 느릴 수 있다(초기화, {{ch:ec2/ebs-snapshots}}).

@topic ec2/ebs/encryption

**EBS 암호화.** 볼륨과 스냅샷을 AWS KMS 키로 암호화한다. 키 관리 인프라를 직접 만들 필요가 없다. 모든 볼륨 유형과 모든 현재·이전 세대 인스턴스 유형이 지원하고, IOPS 성능은 암호화하지 않은 볼륨과 같다(지연에 미치는 영향은 작다).

암호화된 볼륨에서 암호화되는 것:
- 볼륨 안의 저장 데이터
- 볼륨과 인스턴스 사이를 오가는 데이터(암호화는 인스턴스가 도는 호스트에서 한다)
- 볼륨으로 만든 모든 스냅샷과, 그 스냅샷으로 만든 모든 볼륨

**키.**
- 리전마다 AWS 관리형 키 `aws/ebs`가 자동으로 생기고, 따로 정하지 않으면 이 키를 쓴다.
- 직접 만든 대칭 고객 관리형 키를 쓸 수도 있다. 키 정책과 교체 주기를 직접 정할 수 있고, 스냅샷을 다른 계정과 공유하려면 고객 관리형 키가 필요하다({{ch:ec2/ebs-snapshots}}).
- 볼륨 데이터는 KMS가 만든 데이터 키(AES-256)로 암호화하고, 데이터 키는 KMS 키로 암호화해 볼륨 정보와 함께 둔다.
- 볼륨·스냅샷에 묶인 KMS 키는 바꿀 수 없다. 스냅샷을 복사할 때 다른 키를 지정하는 방법만 있다.
- KMS 키를 쓸 수 없게 만들어도 이미 붙은 볼륨은 데이터 키로 계속 동작한다. 볼륨을 떼었다가 다시 붙일 때 실패한다.
- 사용자에게 `kms:CreateGrant`, `kms:Decrypt`, `kms:DescribeKey`, `kms:GenerateDataKeyWithoutPlaintext`, `kms:ReEncrypt` 권한이 필요하다. `kms:CreateGrant`는 `kms:GrantIsForAWSResource` 조건으로 좁힌다(문서 권장).

**기본 암호화(encryption by default).** 계정의 **리전별** 설정이다. 켜면 그 리전에서 새로 만드는 볼륨과 스냅샷 복사본이 늘 암호화된다. 이미 있는 볼륨과 스냅샷에는 영향이 없다. 켠 리전에서는 개별 볼륨만 암호화를 끌 수 없다.

**암호화하지 않은 볼륨을 암호화하려면.** 바로 암호화할 수는 없다.
1. 볼륨의 스냅샷을 만든다(암호화 안 됨).
2. 그 스냅샷을 암호화해 복사하거나, 그 스냅샷으로 암호화된 새 볼륨을 만든다.
3. 새 볼륨으로 바꿔 붙인다.

반대로 암호화된 볼륨이나 스냅샷의 암호화를 없앨 수는 없다. 암호화된 스냅샷은 공개로 공유할 수 없다.

인스턴스 보안 전반은 {{ch:ec2/security-access}}, 키 정책과 KMS 자체는 IAM 권({{ch:iam/roles}})과 KMS 문서를 참고한다.

@topic ec2/ebs/recent

2025년 이후 추가되거나 바뀐 내용이다. 시험 범위인지 알 수 없다.

- **gp3 상한 상향(2025-09).** 최대 크기 {{fact:ec2.ebs.gp3.size.max}}, IOPS {{fact:ec2.ebs.gp3.iops.max}}, 처리량 {{fact:ec2.ebs.gp3.tput.max}}. 위 표는 이 값을 쓴다.
- **볼륨 초기화 프로비저닝 속도(Provisioned Rate for Volume Initialization, 2025-05).** 스냅샷으로 볼륨을 만들 때 {{fact:ec2.ebs.init.rate.min}}~{{fact:ec2.ebs.init.rate.max}} 사이로 초기화 속도를 정해, 볼륨이 정해진 시간 안에 전체 성능에 도달하게 한다. 여러 볼륨을 동시에 만들 때 완료 시점을 예측하기 쉽다.
- **볼륨 복사(2025-10).** 같은 가용 영역 안에서 볼륨을 즉시 시점 복사한다. 복사본은 크래시 일관성(crash-consistent)이다. 위 초기화 속도 지정과 빠른 스냅샷 복원은 볼륨 복사에 쓸 수 없다.
- **휴지통의 EBS 볼륨 지원(2025-11).** 지운 볼륨을 보존 규칙에 따라 최대 {{fact:ec2.rbin.vol.retention.max}} 동안 휴지통에 두고 되살린다. 스냅샷·AMI 휴지통은 {{ch:ec2/ebs-snapshots}}.

@quiz

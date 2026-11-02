---
chapter: dynamodb/backup-restore
---

@topic dynamodb/backup-restore/pitr

**특정 시점으로 복구(Point-in-time recovery, PITR)** 는 테이블을 연속으로 백업해 두는 기능이다. 켜 두기만 하면 일정을 짜거나 백업을 지울 필요가 없다. 배포한 코드의 버그가 여러 항목의 값을 잘못 덮어썼거나, 운영자가 엉뚱한 항목을 지웠을 때 그 직전 상태로 되돌리는 데 쓴다.

- **복원 범위.** 테이블에 표시되는 가장 이른 시점(`EarliestRestorableDateTime`)과 가장 늦은 시점(`LatestRestorableDateTime`) 사이의 아무 초로 되돌린다. 앞쪽 끝은 최대 {{fact:dynamodb.pitr.window.max}} 전까지이고, PITR을 켠 지 얼마 안 됐으면 그보다 짧다. 뒤쪽 끝은 보통 현재보다 {{fact:dynamodb.pitr.latest-restorable-lag}} 전이다.
- **요금.** 테이블과 LSI 크기로 매긴다.
- **성능 영향 없음.** PITR은 테이블 성능이나 API 지연에 영향을 주지 않는다.
- **끄면 처음부터.** PITR을 껐다가 다시 켜면 복원 가능한 시작 시점이 새로 시작된다. 이전 기록으로는 돌아갈 수 없다.
- **삭제된 테이블.** PITR이 켜진 테이블을 지우면 DynamoDB가 삭제 직전 상태의 **시스템 백업**(`<테이블 이름>$DeletedTableBackup`)을 만들어 {{fact:dynamodb.pitr.deleted-system-backup.retention}} 동안 추가 요금 없이 보관한다. 이 백업으로는 삭제 직전 한 시점으로만 되돌린다.

API에서 `ContinuousBackupsStatus`는 항상 `ENABLED`로 나온다. PITR이 실제로 켜졌는지는 `PointInTimeRecoveryStatus`로 본다. 새 테이블은 `DISABLED`다.

글로벌 테이블의 복제본에도 각각 PITR을 켤 수 있다. 복원하면 글로벌 테이블에 속하지 않은 독립 테이블이 생긴다. 실수로 지운 테이블 자체를 막으려면 **삭제 방지(Deletion protection)** 를 함께 켠다.

@topic dynamodb/backup-restore/on-demand-aws-backup

**온디맨드 백업(On-demand backup)** 은 원할 때 테이블 전체를 스냅샷으로 남기는 기능이다. 규정 준수용 장기 보관이나 큰 작업 직전의 기준점으로 쓴다.

- 요청 즉시 처리되고 몇 분 안에 복원에 쓸 수 있다. 테이블 크기와 상관없다.
- 프로비저닝된 처리량을 쓰지 않고 성능에 영향이 없다. 백업 수에 제한이 없다.
- 매번 테이블 전체를 백업한다. 진행 중인 백업은 멈추거나 취소할 수 없고, 그동안 원본 테이블을 지울 수 없다.
- 항목 사이의 인과적 일관성은 보장하지 않는다. 다만 항목 간 시차는 보통 아주 짧다.
- 요금은 백업 크기와 보관 기간으로 매긴다. 매달 첫날에 남아 있는 백업의 한 달 치가 한꺼번에 잡히고, 중간에 지우면 실제 사용분으로 조정된다. 그래서 매달 첫날 비용이 튀어 보이는 것은 정상이다.

온디맨드 백업은 DynamoDB에서 직접 만들 수도, **AWS Backup** 으로 관리할 수도 있다. AWS Backup은 계정·리전마다 옵트인해야 쓸 수 있고, 다음을 더해 준다.

| 기능 | 내용 |
|---|---|
| 예약 백업 | 백업 계획(Backup plan)으로 매시간~매월 자동 백업과 보존 기간을 정한다 |
| 리전 간·계정 간 복사 | 백업을 다른 리전이나 다른 계정의 백업 볼트로 자동 복사한다 |
| 콜드 스토리지 | 수명 주기 규칙으로 오래된 백업을 더 싼 저장소로 옮기거나 지운다 |
| 별도 암호화 키 | 백업 볼트에서 테이블 키와 다른 KMS 키로 암호화한다 |
| 감사·WORM | Backup Audit Manager로 정책 준수를 점검하고, Vault Lock으로 백업을 지우거나 바꾸지 못하게 한다 |

DynamoDB 백업 자체는 태그와 ABAC를 지원하지 않는다. AWS는 백업에 ABAC를 쓰려면 AWS Backup을 쓰라고 권장한다. 스크립트 없이 일정과 정리를 자동화하려는 경우에도 AWS Backup이 맞다.

@topic dynamodb/backup-restore/restore

PITR이든 온디맨드 백업이든 **복원은 언제나 새 테이블로** 한다. 원래 테이블 위에 덮어쓰지 않는다. 복원은 테이블의 처리량을 쓰지 않는다.

**복원할 때 바꿀 수 있는 것**: GSI, LSI, 청구(용량) 모드, 프로비저닝 읽기·쓰기 용량, 암호화 설정. 전체 복원이면 백업 당시의 프로비저닝 값과 GSI·LSI가 그대로 들어온다. 인덱스를 일부 또는 모두 빼면 복원이 더 빠르고 싸다.

**다른 리전으로 복원.** 원본과 다른 리전에 새 테이블을 만들 수 있다. 원본 리전의 데이터 전송 요금과 복원 요금을 낸다(일부 리전 제외).

**복원된 테이블에 직접 다시 설정할 것.**

- Auto Scaling 정책, IAM 정책, 리소스 기반 정책
- CloudWatch 지표·경보, Contributor Insights
- 태그, 스트림 설정, TTL 설정
- 삭제 방지, PITR 설정
- 글로벌 테이블이었다면 복제본

스트림을 다시 켜면 스트림 ARN이 달라지므로 IAM 정책과 소비자 코드의 참조도 고친다. 복원 시간은 여러 요인에 따라 다르며 테이블 크기와 꼭 비례하지 않는다. 몇 시간 걸릴 수 있다.

**전체 복원 대신 되돌리기.** 잘못된 쓰기가 일부라면 원래 테이블을 그대로 두고 그 쓰기만 되돌릴 수 있다. PITR 기간 안의 해당 시간대를 **증분 내보내기**({{fact:dynamodb.export.incremental.min-period}}~{{fact:dynamodb.export.incremental.max-period}})로 S3에 받아, 이전 이미지(old image)를 다시 써 넣는다. 큰 테이블에서는 전체 복원보다 빠르고 싸며, 테이블 이름과 설정을 바꿀 일이 없다.

@topic dynamodb/backup-restore/s3-export-import

**S3로 내보내기(Export to S3).** PITR 기간 안의 시점을 골라 테이블 데이터를 S3 버킷에 쓴다. PITR이 켜져 있어야 한다.

- 전체 내보내기와 증분 내보내기(그 기간에 바뀐 항목만)가 있다.
- 비동기로 동작하고 읽기 용량을 쓰지 않으며 테이블 성능에 영향이 없다.
- 형식은 DynamoDB JSON과 Amazon Ion이다. Athena, AWS Glue, Amazon EMR 같은 분석 서비스에서 바로 쓴다.
- 완료 시간에 SLA가 없다. AWS는 정해진 시간 안에 끝난다고 가정하는 흐름을 만들지 말라고 권장한다.

**S3에서 가져오기(Import from S3).** S3의 CSV, DynamoDB JSON, Amazon Ion 데이터(압축 가능)로 **새 테이블**을 만든다. 기존 테이블로는 가져올 수 없다.

- 새 테이블의 쓰기 용량을 쓰지 않는다. 요금은 원본 데이터의 압축 전 크기로 매긴다.
- GSI는 함께 만들 수 있지만 LSI는 안 된다. 끝난 뒤 글로벌 테이블 복제본을 더할 수 있다.
- 다른 계정의 버킷이나 다른 리전에서도 가져올 수 있다.
- 키가 겹치는 항목은 마지막 것만 남는다.

내보내기를 다른 리전 버킷에 두면 리전 장애 때 다른 리전에서 가져와 테이블을 다시 만드는 복구 경로가 된다. 테이블의 일부만 골라 내보내는 방법은 다음 절에서 본다.

@topic dynamodb/backup-restore/recent-features

아래 두 기능은 문서 기록상 2025년 이후에 추가되었다. 시험 범위에 들어가는지는 확인되지 않았으므로 시험 태그를 달지 않았다.

**PITR 복구 기간 설정(문서 기록상 2025년).** 테이블마다 `RecoveryPeriodInDays`로 PITR을 얼마나 거슬러 올라갈지 {{fact:dynamodb.pitr.window.min}}~{{fact:dynamodb.pitr.window.max}} 사이에서 고른다.

- 기간을 줄이면 가장 이른 복원 시점이 바로 당겨진다. 새 기간 밖으로 밀려난 시점으로는 더 이상 돌아갈 수 없다.
- 기간을 늘리면 가장 이른 복원 시점이 바로 뒤로 가지 않는다. 그때부터 백업이 쌓여 새 기간을 채울 때까지 기다려야 한다.
- 기간을 짧게 잡아도 PITR 요금은 줄지 않는다. 요금은 기간이 아니라 테이블과 LSI 크기로 정해진다.

**필터 내보내기(Filtered export, 문서 기록상 2026년).** S3로 내보낼 때 테이블 전체 대신 일부만 고른다. 키 조건·필터·프로젝션 식을 내보내기 요청에 넣고, 전체 내보내기와 증분 내보내기 모두에 쓸 수 있다. 필터를 쓴다고 따로 요금이 붙지는 않는다.

@topic dynamodb/backup-restore/dr-strategy

재해 복구(DR) 방식은 두 목표로 고른다.

- **RTO(Recovery time objective)**: 서비스가 멈춰 있어도 되는 최대 시간. "얼마나 오래 멈춰도 되나?"
- **RPO(Recovery point objective)**: 잃어도 되는 데이터의 최대 시간 폭. "얼마만큼 잃어도 되나?"

DynamoDB DR 안내서의 비교를 줄이면 다음과 같다.

| 방식 | RPO / RTO / 범위 |
|---|---|
| PITR | 초 / 분~시간 / 백업은 원본 리전에만 있다 |
| 온디맨드 백업 | 백업 간격(예: 매일이면 하루) / 분~시간 / 같은 리전, 다른 리전으로 복원 가능 |
| AWS Backup 계획 | 일정 간격(가장 짧게 {{fact:dynamodb.backup.aws-backup.min-frequency}}) / 분~시간 / 리전 간·계정 간 사본 |
| S3 내보내기·가져오기 | 분 / 시간 / 다른 리전 버킷 가능 |
| 글로벌 테이블(MREC) | 초 / 거의 0 / 다중 리전 운영 |

고르는 기준은 다음과 같다.

- **사람의 실수(삭제, 잘못된 쓰기)**: PITR과 삭제 방지. 단일 리전 안의 보호이므로 리전 장애 대책은 따로 둔다.
- **비용을 아끼고 몇 시간 멈춰도 되는 서비스**: 온디맨드 백업, AWS Backup, S3 내보내기.
- **규정 준수(보관 기간, 지리적 분산, 감사)**: AWS Backup 백업 계획 + 리전 간 복사 + Vault Lock.
- **멈추면 매출이 바로 줄어드는 서비스**: 글로벌 테이블. 운영 비용이 가장 높다.

비용 감각을 위해 미국 동부(버지니아 북부) 기준 값을 보면, PITR은 {{fact:dynamodb.price.pitr.us-east-1}}, 온디맨드 백업은 {{fact:dynamodb.price.backup.us-east-1}}, 복원은 {{fact:dynamodb.price.restore.us-east-1}}이다. 요금은 리전마다 다르고 자주 바뀐다. 글로벌 테이블은 복제 쓰기 요금이 리전 수만큼 든다({{ch:dynamodb/global-tables}}).

방식은 겹쳐 쓴다. 글로벌 테이블은 잘못된 쓰기도 복제하므로, 글로벌 테이블을 써도 PITR은 켠다.

@quiz

@design

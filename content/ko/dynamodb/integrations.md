---
chapter: dynamodb/integrations
---

@topic dynamodb/integrations/overview

DynamoDB는 다른 AWS 서비스와 묶어 쓰는 일이 많다. 묶는 방법은 크게 두 갈래다.

| 갈래 | 쓰는 기능 |
|---|---|
| 한꺼번에 옮기기(스냅샷) | S3로 내보내기, S3에서 가져오기, Redshift `COPY` |
| 바뀐 것만 따라가기(CDC) | DynamoDB Streams, Kinesis Data Streams, 증분 내보내기 |

제로 ETL(Zero-ETL) 통합, EventBridge Pipes 같은 관리형 통합도 속을 보면 이 두 가지를 조합한 것이다. 그래서 통합을 고를 때는 "처음 한 번 옮기는 데 무엇을 쓰나", "그 뒤 변경을 무엇으로 따라가나"를 따로 본다.

AWS가 통합에 대해 권장하는 점:

- **처음 복제할 스냅샷은 S3 내보내기로 만든다.** 비용이 낮고 애플리케이션과 처리량을 다투지 않는다. 백업을 새 테이블로 복원한 뒤 스캔하는 방법도 처리량은 다투지 않지만 대체로 훨씬 비싸다.
- **내보낼 때는 `StartTime`(내보낼 시점)을 정해 둔다.** 그래야 CDC를 어디서부터 이어 받을지 분명하다.
- **내보내기 버킷에 수명 주기 만료를 건다.** 회사 규정이 없다면 {{fact:dynamodb.integrations.export-lifecycle.typical}} 정도가 대체로 안전하다고 안내된다. 남은 파일 비용과 정책 위반을 막는다.
- **변경 감지에 스캔을 쓰지 않는다.** 작을 때는 되지만 금방 감당할 수 없게 된다.
- **스트림 소비자 수를 먼저 센다.** DynamoDB Streams는 샤드마다 동시에 읽는 소비자를 보통 {{fact:dynamodb.streams.readers-per-shard}}까지만 둔다. Lambda 트리거, 글로벌 테이블, OpenSearch 통합이 모두 이 자리를 쓴다.

@topic dynamodb/integrations/s3

S3 내보내기(Export to S3)와 S3 가져오기(Import from S3)는 코드 없이 S3와 테이블 사이에서 데이터를 옮긴다. 동작과 제약은 {{ch:dynamodb/backup-restore}}에 정리했다. 여기서는 통합 관점만 본다.

| 기능 | 통합에서 쓰는 곳 |
|---|---|
| 전체 내보내기 | Athena, AWS Glue, Amazon EMR, SageMaker AI로 분석. 다른 시스템의 첫 적재 |
| 증분 내보내기 | 실시간이 필요 없는 CDC. 두 시점 사이 변경만 받는다 |
| 가져오기 | 다른 계정·리전 데이터로 새 테이블 만들기, 계정 간 테이블 이전 |

통합에서 기억할 점:

- 내보내기는 PITR이 켜져 있어야 하고, 읽기 용량을 쓰지 않는다. 운영 트래픽에 영향이 없다.
- 내보내기 완료 시간에는 SLA가 없다. "몇 분 안에 끝난다"를 전제로 흐름을 짜지 않는다.
- 가져오기는 **새 테이블**에만 된다. 기존 테이블에 덧붙이려면 직접 쓰기 코드를 만든다.
- 스냅샷으로 S3 내보내기를 썼다면, 이어지는 변경도 증분 내보내기로 받으면 처리 코드를 거의 그대로 다시 쓸 수 있다.

@topic dynamodb/integrations/analytics

DynamoDB는 키로 찾는 일에 맞춘 저장소다. 집계, 조인, 전문 검색은 다른 서비스로 데이터를 넘겨서 한다.

**Amazon Redshift `COPY`.** Redshift SQL의 `COPY` 명령으로 테이블을 Redshift로 복사한다.

- 복사는 원본 테이블의 **읽기 용량을 쓴다.** `READRATIO`로 프로비저닝 읽기 용량 중 쓸 비율을 정한다. AWS는 이 값을 평소 남는 용량보다 낮게 잡으라고 권장한다.
- 복사가 끝난 뒤 Redshift 쿼리는 사본을 읽으므로 DynamoDB에 영향이 없다.
- NoSQL에서 SQL로 옮기는 것이라 규칙이 다르다. Redshift 테이블을 미리 만들고, 열 타입과 빈 값(NULL) 처리 방식을 정해 둔다.

```sql
-- Redshift에서 실행. 읽기 용량의 50%까지만 쓴다 (예시 값)
copy music_analytics from 'dynamodb://Music'
iam_role 'arn:aws:iam::123456789012:role/RedshiftCopyRole'
readratio 50;
```

**Redshift 제로 ETL 통합(Zero-ETL integration).** 원본 테이블과 대상 Redshift를 지정하면 복제를 AWS가 맡는다.

- 켜면 먼저 테이블 전체를 내보내 채우고, 그 뒤 **증분 내보내기**로 {{fact:dynamodb.integrations.redshift-zero-etl.interval-min}}~{{fact:dynamodb.integrations.redshift-zero-etl.interval-max}}마다 변경을 반영한다. 실시간이 아니다.
- 원본 테이블에 PITR이 켜져 있어야 한다.
- 테이블에 **리소스 기반 정책**을 붙여 Redshift 서비스가 내보내기를 할 수 있게 한다. 같은 계정이면 콘솔의 "Fix it for me"가 정책을 대신 붙인다. 다른 계정이면 직접 붙인다.
- 내보내기 기반이므로 테이블 성능에 영향이 없다.

**Amazon OpenSearch Service 제로 ETL 통합.** OpenSearch Ingestion의 DynamoDB 플러그인으로 파이프라인을 만든다.

- 처음에는 S3 내보내기로 스냅샷을 적재하고, 그 뒤 **DynamoDB Streams**로 변경을 거의 실시간으로 따라간다. 그래서 PITR과 스트림이 둘 다 켜져 있어야 한다. 스냅샷만, 또는 스트림만 쓰는 파이프라인도 만들 수 있다.
- 테이블의 읽기·쓰기 처리량을 쓰지 않는다. 대신 스트림 소비자 자리 하나를 차지한다.
- 처리 중 복구할 수 없는 이벤트는 데드레터 큐(DLQ)로 보낼 수 있다. 중단이 길어져 스트림 보관 기간({{fact:dynamodb.streams.retention}})을 넘기면 그사이 변경을 잃는다. 그때는 인덱스를 새로 만든다.
- 항목마다 이벤트로 처리되므로, 속성을 빼거나 합치고 인덱스를 나눠 보낼 수 있다.

> **주의:** 두 제로 ETL 통합은 최근 몇 년 사이 나온 기능이다. 시험 범위에 들어가는지는 확인하지 못했다. 시험에서는 "분석은 S3 내보내기 + Athena", "검색은 스트림 + OpenSearch" 같은 원리 쪽을 먼저 익힌다.

@topic dynamodb/integrations/events

테이블 변경에 반응하는 길은 세 가지다.

| 방법 | 맞는 경우 |
|---|---|
| Streams + Lambda 트리거 | 변경마다 함수 하나 둘을 돌리면 된다 |
| Streams + EventBridge Pipes + 이벤트 버스 | 소비자가 많거나, 규칙으로 나눠 보내거나, 보강이 필요하다 |
| Kinesis Data Streams for DynamoDB | 보관 기간이 길거나 Firehose·Flink 같은 분석 도구로 보낸다 |

**Lambda 트리거.** Lambda가 스트림을 폴링해 레코드 배치로 함수를 부른다. 이벤트 소스 매핑(Event source mapping)으로 연결하고, Lambda 이벤트 필터링으로 조건에 맞는 레코드만 함수에 넘길 수 있다. 배치 크기, 실패 처리, 멱등성은 {{ch:dynamodb/streams-ttl}}에서 다룬다.

**EventBridge Pipes.** 스트림 소비자는 샤드마다 {{fact:dynamodb.streams.readers-per-shard}}까지라서, 받는 쪽이 많으면 자리가 모자란다. 이때 파이프 하나를 소비자로 두고 이벤트 버스로 넘기면, 버스의 규칙이 여러 대상으로 나눠 보낸다(팬아웃).

1. 테이블에 스트림을 켠다. 이미 켜져 있으면 소비자가 둘 미만인지 확인한다.
2. 이벤트 버스를 만든다. 스키마 검색(Schema discovery)을 켜 두면 첫 이벤트로 스키마를 추론한다.
3. 파이프를 만든다. 원본은 테이블의 스트림, 대상은 이벤트 버스다. 필요하면 파이프에서 필터와 보강(enrichment)을 건다.
4. 버스에 규칙을 만든다. 예를 들어 정렬 키가 `user#`로 시작하는 항목만 어느 Lambda로 보낸다. 모든 변경을 받으려면 패턴을 `{"source": ["aws.dynamodb"]}`로 둔다.

@topic dynamodb/integrations/cognito

웹·모바일 앱이 DynamoDB를 직접 부를 때, AWS는 **Amazon Cognito**로 자격 증명을 받으라고 권장한다. 앱 파일에 액세스 키를 넣지 않기 위해서다.

흐름:

1. Cognito 자격 증명 풀(Identity pool)을 만든다. 로그인하지 않은 사용자도 받으려면 인증되지 않은 자격 증명을 허용한다.
2. IAM 역할을 만든다. 신뢰 정책은 `cognito-identity.amazonaws.com`이 `sts:AssumeRoleWithWebIdentity`로 이 역할을 맡게 하고, 조건으로 자기 풀 ID만 허용한다.
3. 역할에 DynamoDB 권한을 붙인다. 인증되지 않은 사용자가 쓰는 역할이므로 꼭 필요한 권한만 준다. 사용자별로 자기 항목만 다루게 하려면 IAM 정책 조건(`dynamodb:LeadingKeys`)으로 세밀한 접근 제어를 건다. {{ch:dynamodb/security}}를 본다.
4. 풀에 역할을 연결하고, 앱의 SDK가 Cognito에서 임시 자격 증명을 받아 쓰게 한다.

@quiz

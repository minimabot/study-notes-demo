---
chapter: kinesis/data-delivery
---

@topic kinesis/data-delivery/options

스트림의 데이터를 다른 서비스로 보내는 길은 여러 가지다. 직접 소비자를 짜지 않고 관리형 서비스에 맡기는 경우를 이 장에서 묶어 본다. KCL·Lambda로 직접 읽는 방법은 {{ch:kinesis/consumers}}에서 다룬다.

| 방법 | 고르는 경우 |
|---|---|
| Amazon Data Firehose | 코드 없이 S3, Redshift, OpenSearch Service, Splunk, HTTP 엔드포인트 등으로 적재. 변환·형식 변환도 필요할 때 |
| 스트리밍 테이블·S3 전송 | 온디맨드 스트림을 같은 리전의 Iceberg 테이블이나 S3 버킷으로 그대로 옮길 때. Kinesis 자체 기능이다 |
| Managed Service for Apache Flink | 시간 창 집계, 보강, 이상 탐지 같은 상태가 있는 연속 처리 |
| Amazon EventBridge Pipes | 레코드를 걸러 내거나 보강해 한 대상에 점대점으로 넘길 때 |
| Lambda 이벤트 소스 매핑 | 레코드마다 짧은 사용자 코드를 돌릴 때 |
| Amazon Redshift 스트리밍 수집 | S3를 거치지 않고 Redshift 구체화된 뷰로 바로 받을 때 |

**Kinesis Data Streams와 Firehose의 차이.** Data Streams는 데이터를 보존 기간 동안 저장하고, 여러 소비자가 각자 위치에서 다시 읽을 수 있는 스트림이다. 샤드(또는 온디맨드 용량)와 소비자는 내가 고른다. Firehose는 받은 데이터를 버퍼에 모았다가 대상에 적재하는 전달 서비스다. 소비자 코드를 쓰지 않는 대신, 버퍼링을 하므로 레코드가 들어오자마자 반응해야 하는 처리에는 맞지 않는다. 흔한 조합은 "여러 소비자가 읽는 Data Streams + 그중 하나로 Firehose를 붙여 보관"이다. SQS·SNS와의 비교는 {{ch:common/messaging-compare}}를 본다.

@topic kinesis/data-delivery/firehose

Firehose 전송 스트림의 원본(source)으로 Kinesis 데이터 스트림을 지정하면 Firehose가 스트림을 읽어 대상으로 보낸다.

- **대상.** Amazon S3, Amazon Redshift, Amazon OpenSearch Service, Splunk, 사용자 지정 HTTP 엔드포인트, Datadog·MongoDB·New Relic 같은 지원 제3자 HTTP 엔드포인트.
- **변환.** 전달 전에 데이터 레코드를 변환하거나 레코드 형식을 바꿀 수 있다.

KPL로 쓴 집계 레코드도 Firehose가 읽을 수 있다. 생산자 쪽 설정은 {{ch:kinesis/producers}}를 본다.

@topic kinesis/data-delivery/managed-delivery

**스트리밍 테이블(Streaming tables)과 Amazon S3 전송(S3 delivery)** 은 Kinesis Data Streams가 직접 제공하는 전송 기능이다. 문서에 최근 추가됐고(문서 기록상 2026년), 시험 범위인지는 확인되지 않았다. 스트림에 `CreateChannel`을 호출해 대상을 정하면, 서비스가 스트림을 읽고 버퍼링·집계해 파일로 쓴다. 커넥터나 소비자 애플리케이션, 컴퓨팅 자원을 준비하지 않는다. 스트림의 읽기 처리량을 쓰지 않으며, 향상된 팬아웃 슬롯도 차지하지 않아 기존 소비자에 영향이 없다.

| 대상 | 특징 |
|---|---|
| 스트리밍 테이블(S3 Tables의 Apache Iceberg 테이블) | Parquet로 바꾸고 인라인 압축(compaction)으로 작은 파일 문제를 줄인다. AWS Glue 스키마 레지스트리의 스키마가 필요하고, 스키마에 맞지 않는 레코드는 전달되지 않는다. 배달 못한 레코드 정보를 담을 S3 DLQ가 필수다 |
| 범용 S3 버킷 | 레코드를 원래 형식 그대로 묶어 쓴다. 압축(GZIP, ZSTD, NONE), 스토리지 클래스, 객체 키 템플릿을 고른다. DLQ는 선택이다 |

**조건과 제약.**

- **온디맨드 전용.** 원본 스트림은 온디맨드 표준이나 On-demand Advantage여야 한다. 프로비저닝은 지원하지 않는다({{ch:kinesis/capacity-modes}}).
- **같은 리전만.** 교차 리전 전송은 안 된다. 교차 계정은 범용 S3 버킷 대상만, 그것도 대상 버킷만 다른 계정에 둘 수 있다. 스트리밍 테이블은 스트림·테이블 버킷·스키마 레지스트리가 모두 같은 계정이어야 한다.
- **변환·수정이 없다.** 레코드를 그대로 전달하고 추가만 한다(append-only). 갱신·업서트는 안 된다.
- **백필이 없다.** 전송이 활성 상태가 된 뒤에 쓰인 레코드만 전달한다.
- **스키마 진화가 없다.** 스키마를 바꾸려면 전송을 지우고 다시 만든다. 스트리밍 테이블은 기존 테이블이 아니라 새 테이블을 만든다.
- **고칠 수 있는 설정은 둘뿐.** 데이터 최신성과 로그 설정만 바꿀 수 있다.
- **개수.** 스트림당 {{fact:kinesis.delivery.per-stream}}까지다. 제어 API 한도는 {{fact:kinesis.delivery.api-tps}}다.

**데이터 최신성(Data freshness).** 전달 전에 버퍼링하는 최대 시간이다. {{fact:kinesis.delivery.freshness.range}} 사이에서 정하고 기본값은 {{fact:kinesis.delivery.freshness.default}}다. 낮추면 빨리 도착하지만 파일이 작아지고, 높이면 파일이 크고 적어진다.

**암호화.** 전달된 데이터는 S3에 저장 시 암호화된다. 기본은 SSE-S3이고, 대칭 고객 관리형 KMS 키(SSE-KMS)를 고를 수 있다. `aws/kinesis` 키는 대상 암호화에 쓸 수 없다. 또 **원본 스트림이 `aws/kinesis`로 암호화돼 있으면 `CreateChannel`이 바로 실패한다.** `StartStreamEncryption`으로 고객 관리형 키로 바꾼 뒤 만든다.

**운영.** 전송은 IAM 서비스 실행 역할로 대상에 쓴다. AWS는 이 역할의 신뢰 정책에 `aws:SourceArn`과 `aws:SourceAccount` 조건을 넣어 혼동된 대리인(confused deputy) 문제를 막고, 리소스 ARN을 와일드카드 없이 좁히라고 권장한다. 지표는 `DeliveryToS3.*`, `DeliveryToIceberg.*` 이름으로 나온다. 데이터 최신성과 실패 레코드 수에 경보를 걸고 DLQ를 늘 설정하라는 것이 문서의 권장 사항이다.

@topic kinesis/data-delivery/other-integrations

**Managed Service for Apache Flink.** SQL, Java, Scala로 스트림을 처리하는 애플리케이션을 호스팅한다. 참조 데이터로 보강하고, 시간에 걸쳐 집계하고, 기계 학습으로 이상을 찾는다. 결과는 다른 Kinesis 스트림, Firehose 전송 스트림, Lambda로 보낸다. 실행 역할이 스트림을 읽으므로 암호화된 스트림이면 `kms:Decrypt`가 필요하다.

**Amazon EventBridge Pipes.** Kinesis 스트림을 원본으로 받아, 선택적으로 필터·보강·변환을 거친 뒤 지원 대상 하나로 보낸다. 생산자와 소비자를 점대점으로 잇는 용도다. 반대로 Kinesis 스트림을 Pipes나 EventBridge 규칙의 대상으로 써서 이벤트를 스트림에 넣을 수도 있다.

**Lambda.** 이벤트 소스 매핑이 샤드를 폴링해 함수를 배치로 호출한다. 배치 크기, 병렬화 계수, 실패 처리 같은 설정은 {{ch:kinesis/consumers}}에서 다룬다.

**Amazon Redshift 스트리밍 수집.** 스트림을 Redshift 구체화된 뷰로 바로 받는다. Firehose처럼 S3에 먼저 내려놓는 단계가 없다.

**고르는 순서.** 대상이 저장소이고 가공이 거의 없으면 Firehose나 S3 전송을 먼저 본다. 둘 중에서는 원본 스트림이 온디맨드이고, 같은 리전 S3·Iceberg로 그대로 보내면 되면 S3 전송·스트리밍 테이블, 변환이 필요하거나 대상이 S3 밖이거나 스트림이 프로비저닝이면 Firehose다. 상태가 있는 계산이 필요하면 Flink, 레코드 단위 로직이면 Lambda, 걸러서 다른 서비스 하나로 넘기면 Pipes다.

@quiz

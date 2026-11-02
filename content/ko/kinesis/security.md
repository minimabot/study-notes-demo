---
chapter: kinesis/security
---

@topic kinesis/security/sse

**서버 측 암호화(Server-side encryption, SSE)** 를 켠 스트림에서는 암호화와 복호화를 Kinesis Data Streams가 맡는다. 들어온 레코드는 AWS KMS 키로 잠긴 채 보관되고, 소비자에게는 풀린 상태로 건네진다. 생산자와 소비자 코드는 키를 받거나 암호 연산을 직접 하지 않는다. 다만 대상은 SSE를 켠 뒤 들어오는 레코드다. 켜기 전에 이미 저장된 비암호화 레코드는 켠 뒤에도 암호화되지 않는다. SSE를 끈 상태에서 새로 들어오는 레코드에도 SSE는 적용되지 않는다.

고를 수 있는 키는 두 종류다.

| 키 | 특징 |
|---|---|
| AWS 관리형 키(`aws/kinesis`) | Kinesis가 만든 키. 키 자체는 무료다. 별도 IAM 권한이 필요 없다. 교차 계정 공유에는 쓸 수 없다 |
| 고객 관리형 키(Customer managed key) | 계정에서 직접 만든 KMS 키. 키 요금이 든다. 키 정책으로 누가 쓸지 정한다. 다른 계정의 키도 ARN으로 지정할 수 있다 |

알아 둘 동작은 다음과 같다.

- **켜는 동안의 상태.** SSE를 켜면 스트림은 대기 상태를 거쳐 다시 활성 상태가 된다. 이미 들어 있던 레코드는 위에서 본 대로 그대로 남는다.
- **비용.** 어느 키든 Kinesis가 대신 부르는 KMS API 호출 요금은 낸다. Kinesis는 {{fact:kinesis.sse.datakey-rotation}} 데이터 키를 교체하며 KMS를 부른다. 이 호출은 생산자·소비자가 쓰는 자격 증명마다 따로 생긴다. IAM 역할은 역할을 맡을 때마다 새 자격 증명이 되므로, AWS는 자격 증명을 캐시해 KMS 비용을 줄이라고 안내한다.
- **성능.** 일반 지연 시간이 {{fact:kinesis.sse.latency-overhead}} 늘어난다.
- **전송 중 암호화.** API 요청은 TLS로 보낸다. 클라이언트는 TLS 1.2 이상을 지원해야 하고, AWS는 TLS 1.3을 권장한다. FIPS 검증 모듈이 필요하면 FIPS 엔드포인트를 쓴다.

@topic kinesis/security/kms-permissions

고객 관리형 키를 쓰면 **키 정책과 IAM 정책에서 생산자·소비자에게 키 사용 권한을 줘야 한다.** 빠뜨리면 쓰기와 읽기가 실패한다. 문서는 이 실패가 데이터 손실, 처리 지연, 애플리케이션 멈춤으로 이어질 수 있다고 경고한다.

| 주체 | 필요한 KMS 권한 |
|---|---|
| 생산자 | `kms:GenerateDataKey` |
| 소비자 | `kms:Decrypt` |
| 스트림 관리자 | `kms:List*`, `kms:DescribeKey*` |

Lambda와 Managed Service for Apache Flink도 역할로 스트림을 읽으므로, 그 실행 역할에 `kms:Decrypt`를 넣는다.

**암호화 컨텍스트(Encryption context).** Kinesis는 KMS를 부를 때마다 스트림 ARN을 `aws:kinesis:arn` 값으로 넘긴다. 키 정책이나 IAM 정책에 `kms:EncryptionContext:aws:kinesis:arn` 조건 키를 걸면 그 키를 특정 스트림의 요청에만 쓰게 묶을 수 있다. 이 값은 CloudTrail 로그에 평문으로 남아 감사에도 쓴다.

**확인.** 암호화를 켠 뒤에는 CloudWatch의 `PutRecord.Success`, `PutRecords.Success`, `GetRecords.Success` 지표를 지켜보라고 AWS는 권장한다. 권한이 빠졌다면 이 값이 먼저 떨어진다.

@topic kinesis/security/iam-rbp

**자격 증명 기반 정책(Identity-based policy).** 기본적으로 모든 요청은 거부된다. 명시적 허용이 기본 거부를 이기고, 명시적 거부는 모든 허용을 이긴다. 작업 이름은 `kinesis:` 접두어를 붙이고(`kinesis:PutRecords`), 리소스는 ARN으로 적는다.

```
arn:aws:kinesis:<리전>:<계정 ID>:stream/<스트림 이름>
```

KCL 애플리케이션은 임대 테이블에 DynamoDB를, 지표에 CloudWatch를 쓰므로 그 권한도 정책에 넣어야 한다({{ch:kinesis/consumers}}).

**리소스 기반 정책(Resource-based policy).** 데이터 스트림이나 등록된 소비자에 직접 붙여 다른 계정, IAM 사용자, IAM 역할에 접근을 준다. 콘솔의 **데이터 스트림 공유** 탭이나 `PutResourcePolicy` API로 붙인다. 공유할 수 있는 작업은 읽기·쓰기에 필요한 것들(`GetRecords`, `GetShardIterator`, `ListShards`, `DescribeStreamSummary`, `PutRecord`, `PutRecords`, 소비자 수준의 `SubscribeToShard`, `DescribeStreamConsumer`)이다.

교차 계정 접근에서 헷갈리기 쉬운 규칙은 이렇다.

- **신뢰는 양쪽에서 맺는다.** 리소스 정책에 다른 계정 주체를 넣는 것은 절반이다. 그 계정에서도 자격 증명 기반 정책으로 같은 리소스 접근을 허용해야 한다. 같은 계정 주체라면 리소스 정책만으로 된다.
- **향상된 팬아웃 소비자를 공유하려면 정책이 둘이다.** 스트림 ARN에 대한 정책과 소비자 ARN에 대한 정책이 모두 필요하다.
- **호출할 때 ARN을 쓴다.** 교차 계정 작업은 스트림 이름이 아니라 스트림 ARN(소비자는 소비자 ARN)으로 지정한다. KPL은 스트림 ARN 지정을 지원하지 않으므로, 다른 계정 스트림에 쓸 때는 AWS SDK를 쓴다. KCL은 1.x는 1.15.0 이상, 2.x는 2.5.3 이상이어야 하고, 설정에 스트림 ARN을 넣는다.
- **Lambda.** 다른 계정의 Lambda 실행 역할을 주체로 넣고, 공유 작업에 `kinesis:DescribeStream`을 꼭 포함한다.
- **정책을 고치면 통째로 바뀐다.** 기존 리소스 정책을 갱신하면 새 정책으로 교체되므로 필요한 문장을 모두 다시 넣는다.
- **암호화된 스트림.** `aws/kinesis`로 암호화한 스트림은 리소스 정책으로 공유할 수 없다. 고객 관리형 키로 바꾸고, KMS 키 정책에서 상대 계정에 키 사용을 허용하고, 상대 계정 IAM 정책에도 키 권한을 넣는다.

리소스 정책 API에는 {{fact:kinesis.resource-policy.api-tps}}라는 호출 한도가 있다.

@topic kinesis/security/vpc

**인터페이스 VPC 엔드포인트(Interface VPC endpoint).** AWS PrivateLink로 VPC 안에 프라이빗 IP를 가진 네트워크 인터페이스를 만들고, 그 길로 Kinesis Data Streams에 접속한다. 인터넷 게이트웨이, NAT 장치, VPN, Direct Connect가 필요 없고 트래픽이 Amazon 네트워크를 벗어나지 않는다. 스트림·생산자·소비자 설정은 바꾸지 않아도 된다. 서울 리전도 엔드포인트 정책을 지원한다.

KPL과 KCL은 CloudWatch, DynamoDB도 부른다. 이 호출은 그 서비스에 쓰는 엔드포인트(퍼블릭 또는 VPC 엔드포인트)를 따라간다. 인터넷 경로가 없는 서브넷이라면 Kinesis만이 아니라 이 서비스들의 엔드포인트도 준비해야 한다.

접근을 좁히는 방법은 두 겹이다.

| 위치 | 하는 일 |
|---|---|
| VPC 엔드포인트 정책 | 이 엔드포인트로 할 수 있는 작업·스트림을 제한한다. 예: 특정 스트림만, 또는 `List*`·`Describe*`만 |
| IAM 정책의 `aws:sourceVpce` 조건 | 특정 엔드포인트를 거치지 않은 요청을 거부한다. 예: `StringNotEquals`로 다른 경로의 `kinesis:*`를 `Deny` |

@topic kinesis/security/best-practices

AWS가 보안 모범 사례로 드는 것은 네 가지다.

1. **최소 권한.** 작업에 필요한 작업·리소스만 허용한다. 실수와 악의의 피해 범위가 줄어든다.
2. **IAM 역할.** 장기 자격 증명을 클라이언트 애플리케이션이나 S3 버킷에 저장하지 않는다. 자동으로 교체되지 않아 유출되면 피해가 크다. 역할로 임시 자격 증명을 받는다.
3. **서버 측 암호화.** 저장 데이터와 전송 중 데이터를 암호화한다(위 절).
4. **CloudTrail.** API 호출을 기록해 누가, 언제, 어디서 무엇을 했는지 확인한다.

**복원력(Resilience).** Kinesis Data Streams는 물리적으로 분리된 여러 가용 영역으로 이루어진 AWS 리전 인프라 위에서 동작한다. 소비자 쪽 장애(레코드 처리기, 워커, EC2 인스턴스)는 KCL이 샤드를 다른 워커에 다시 맡기는 방식으로 넘긴다. AWS는 소비자 EC2 인스턴스를 Auto Scaling 그룹으로 돌려 고장 난 인스턴스를 자동으로 바꾸라고 권장한다.

**규정 준수(Compliance).** Kinesis Data Streams가 어떤 규정 준수 프로그램 범위에 드는지는 「규정 준수 프로그램별 범위 내 AWS 서비스(AWS services in Scope by Compliance Program)」 페이지에서 확인하고, 제3자 감사 보고서는 AWS Artifact에서 받는다. 데이터의 민감도와 규정에 맞게 위의 통제를 고르는 일은 고객 몫이다.

@quiz

@design

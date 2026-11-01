---
chapter: dynamodb/overview
---

@topic dynamodb/overview/what

**Amazon DynamoDB**는 AWS가 운영하는 NoSQL 데이터베이스다. 핵심 성격은 네 가지로 정리된다.

| 성격 | 뜻 |
|---|---|
| 서버리스(Serverless) | 서버를 고르거나 패치할 일이 없다. 엔진 버전도, 유지 관리 기간도 없다 |
| 완전 관리형(Fully managed) | 설치, 고가용성, 하드웨어 준비, 백업, 모니터링을 AWS가 맡는다 |
| NoSQL | 키-값(key-value)과 문서(document) 데이터 모델을 지원한다 |
| 규모와 상관없는 지연 시간 | 사용자가 적든 아주 많든 한 자릿수 밀리초 수준의 응답을 목표로 설계됐다 |

테이블을 만들면 바로 운영 트래픽을 받을 수 있다. 온디맨드 용량 모드(on-demand capacity mode)를 쓰면 요청한 만큼만 돈을 내고, 트래픽이 없을 때는 처리량 비용이 들지 않는다. 용량 모드는 뒤의 장에서 따로 다룬다.

> **주의:** "서버리스"는 설계를 안 해도 된다는 뜻이 아니다. 데이터를 어떤 키로 나눌지는 여전히 사용자가 정한다. 잘못 정하면 일부 파티션에 요청이 몰려 제한(throttling)이 생긴다. 이 내용은 {{ch:dynamodb/partitions}}에서 다룬다.

@topic dynamodb/overview/use-cases

DynamoDB는 **일정한 성능이 필요하고 운영 부담은 적어야 하는** 운영(OLTP) 업무에 맞춰 만들어졌다. AWS 문서가 드는 예는 다음과 같다.

- **금융 서비스:** 거래 원장, 대출 관리 같은 업무. 여러 항목을 한 번에 바꾸는 트랜잭션(transactions)이 필요할 때 쓴다.
- **게임:** 게임 상태, 플레이어 데이터, 세션 기록, 순위표. 출시 직후처럼 트래픽이 급히 늘고 줄 때 맞다.
- **스트리밍·미디어:** 콘텐츠 메타데이터, 시청 목록, 북마크.

이런 업무를 받치는 기능이 함께 있다.

| 기능 | 하는 일 |
|---|---|
| 글로벌 테이블(Global tables) | 여러 리전에 복제하고, 모든 리전에서 읽기·쓰기를 받는다 |
| ACID 트랜잭션 | 여러 항목을 전부 바꾸거나 전혀 바꾸지 않는다 |
| DynamoDB Streams | 항목이 바뀔 때마다 변경 기록을 시간 순서로 남긴다 |
| 보조 인덱스(Secondary indexes) | 기본 키가 아닌 다른 속성으로도 조회한다 |
| DAX | DynamoDB 전용 인메모리 캐시 |

Lambda, API Gateway, AppSync 같은 서버리스 서비스와 붙여서 백엔드 전체를 서버 없이 만들 수 있다. S3로 내보내기·가져오기도 지원한다.

@topic dynamodb/overview/vs-relational

DynamoDB가 모든 경우에 낫지는 않다. 둘은 잘하는 일이 다르다.

| 기준 | 관계형 DB(RDBMS) | DynamoDB |
|---|---|---|
| 잘 맞는 일 | 즉석(ad hoc) 쿼리, 데이터 웨어하우스, OLAP | 웹 규모 앱, 게임, 소셜, IoT |
| 스키마 | 테이블·열을 미리 정의한다 | 기본 키만 정하면 나머지 속성은 자유롭다 |
| 조회 | SQL과 JOIN | 키로 찾는다. JOIN이 없다 |
| 늘리는 방식 | 주로 더 큰 서버로 키운다(scale up) | 분산 하드웨어로 넓힌다(scale out) |

JOIN이 없기 때문에 AWS는 **데이터를 비정규화(denormalize)** 해서 한 번의 요청으로 답할 수 있게 모델링하라고 권한다. 그러려면 "어떤 화면이 어떤 데이터를 어떤 키로 읽는가"(접근 패턴)를 먼저 정해야 한다.

관계형 DB가 나은 경우:

- 조회 조건이 미리 정해지지 않고 자주 바뀐다.
- 여러 테이블을 엮는 복잡한 집계·보고서가 핵심이다.
- 기존 SQL 애플리케이션을 그대로 옮겨야 한다.

DynamoDB도 SQL과 비슷한 문법인 PartiQL을 지원한다. 다만 문법이 비슷할 뿐 JOIN 같은 관계형 기능이 생기지는 않는다.

@topic dynamodb/overview/security-resilience

- **접근 제어는 IAM으로 한다.** DynamoDB에는 DB 사용자 이름이나 비밀번호가 없다. 세분화된 접근 제어(fine-grained access control)로 항목·속성 단위까지 권한을 좁힐 수 있다.
- **저장 데이터는 기본으로 암호화된다.** AWS 소유 키, AWS 관리형 키, 고객 관리형 키 중에서 고른다. 기본값인 AWS 소유 키는 추가 비용이 없다.
- **데이터는 자동으로 여러 곳에 복제된다.** 기본으로 {{fact:dynamodb.resilience.az-count}}의 가용 영역(Availability Zone)에 복제되고, 단일 리전 테이블의 가용성 SLA는 {{fact:dynamodb.sla.availability.standard}}다.
- 리전 장애까지 대비하려면 글로벌 테이블을, 실수로 지운 데이터를 되살리려면 시점 복구(PITR)와 온디맨드 백업을 쓴다. 각각 뒤의 장에서 다룬다.

@quiz

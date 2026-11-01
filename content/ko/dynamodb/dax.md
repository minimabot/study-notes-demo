---
chapter: dynamodb/dax
---

@topic dynamodb/dax/what

**DynamoDB Accelerator(DAX)** 는 DynamoDB 앞에 두는 인메모리 캐시 서비스다. DynamoDB는 대부분 한 자릿수 밀리초 안에 응답한다. DAX는 최종적 일관된 읽기(eventually consistent read)를 마이크로초 단위로 줄여 준다.

DAX가 하는 일은 세 가지로 정리된다.

| 목적 | 내용 |
|---|---|
| 지연 시간 단축 | 캐시에 있는 항목은 DynamoDB까지 가지 않고 메모리에서 바로 돌려준다 |
| 코드 변경 최소화 | DynamoDB와 API가 호환된다. 클라이언트만 DAX 클라이언트로 바꾼다 |
| 읽기 용량 절감 | 반복 읽기를 캐시가 받아 테이블의 RCU를 덜 쓴다. 읽기가 몰리는 핫 키에도 도움이 된다 |

파티션 하나는 {{fact:dynamodb.partition.read.max}}를 넘게 읽을 수 없다. 같은 항목을 아주 많이 읽는 경우 DAX를 두면 그 항목의 읽기를 이 한도 너머로 늘릴 수 있다. 파티션 한도는 {{ch:dynamodb/partitions}}에서 다뤘다.

**DAX 클라이언트.** 애플리케이션은 언어별 DAX 클라이언트(Go, Java, Node.js, Python, .NET)를 쓴다. 클라이언트는 모든 DynamoDB API 요청을 DAX 클러스터로 보내고, DAX가 직접 처리할 수 없는 요청은 DynamoDB로 넘긴다. `CreateTable`, `UpdateTable` 같은 테이블 관리 작업은 DAX가 처리하지 않으므로 DynamoDB에 직접 보낸다.

> **비교:** DAX는 DynamoDB 전용이고 키-값 접근에 맞춰져 있다. 리스트·셋·해시 같은 자료 구조, pub/sub, 여러 데이터 소스 앞의 범용 캐시가 필요하면 Amazon ElastiCache를 쓴다.

@topic dynamodb/dax/caches

DAX 클러스터 안에는 서로 독립된 캐시가 두 개 있다.

| 캐시 | 담는 것 |
|---|---|
| 항목 캐시(Item cache) | `GetItem`, `BatchGetItem` 결과. 기본 키 값으로 저장한다 |
| 쿼리 캐시(Query cache) | `Query`, `Scan` 결과 집합. 요청 파라미터 값으로 저장한다 |

**읽기 흐름.** 최종적 일관된 읽기 요청이 오면 DAX는 먼저 캐시를 본다. 있으면(캐시 적중, cache hit) 바로 돌려준다. 없으면(캐시 누락, cache miss) DynamoDB에서 최종적 일관된 읽기로 가져와 캐시에 넣고 돌려준다.

**강력한 일관된 읽기는 그냥 통과한다.** `ConsistentRead`를 true로 준 요청과 `TransactGetItems`는 DAX가 DynamoDB로 넘기고, 결과를 캐시하지 않는다. DAX는 DynamoDB와 강하게 묶여 있지 않아서 강력한 일관성을 스스로 보장할 수 없기 때문이다. 이런 읽기는 처음부터 DAX를 거치지 않고 DynamoDB로 보내는 편이 클러스터 자원을 아낀다.

**쓰기는 라이트-스루(Write-through)다.** `PutItem`, `UpdateItem`, `DeleteItem`, `BatchWriteItem`은 DAX가 먼저 DynamoDB에 쓰고, 성공을 확인한 뒤 항목 캐시를 고친다. DynamoDB 쓰기가 실패하면(스로틀 포함) 캐시에도 남지 않는다. 그래서 캐시 무효화 코드를 직접 짤 필요가 없다.

**만료와 축출.** 두 캐시 모두 TTL과 LRU(가장 오래전에 쓴 것부터 축출)로 관리한다. 항목 캐시 TTL 기본값은 {{fact:dynamodb.dax.item-ttl.default}}다. 캐시가 가득 차면 TTL이 남아 있어도 오래된 것부터 밀려난다. LRU는 끌 수 없다. DynamoDB에 없는 항목을 찾은 결과도 빈 값으로 캐시한다(네거티브 캐싱, negative caching).

@topic dynamodb/dax/consistency

DAX를 쓰면 "오래된 값"을 읽는 경우가 몇 가지 생긴다. 시험에 자주 나오는 함정이다.

1. **노드 사이 복제.** 쓰기는 기본 노드의 캐시를 고친 뒤 다른 노드로 최종적 일관성 방식으로 복제된다. 복제는 {{fact:dynamodb.dax.replication.typical}} 걸린다. 그동안 두 클라이언트가 같은 키를 읽어도 다른 값을 볼 수 있다.
2. **DAX를 우회한 쓰기.** 다른 프로그램이 DynamoDB에 직접 쓰면 DAX는 그 사실을 모른다. 항목의 TTL이 끝나거나 축출될 때까지 DAX는 예전 값을 돌려준다.
3. **쿼리 캐시는 항목 쓰기로 갱신되지 않는다.** DAX로 `PutItem`을 해도 바뀌는 것은 항목 캐시뿐이다. 이미 캐시된 `Query` 결과는 TTL이 끝날 때까지 그대로다. 같은 이유로 `Scan`을 돌려 항목 캐시를 미리 채울 수도 없다.

**쓰기 전략.** 대량 적재처럼 쓰기가 많고 그 데이터를 거의 읽지 않으면, DAX를 거치지 않고 DynamoDB에 바로 쓰는 **라이트 어라운드(Write-around)** 가 낫다. DAX를 거쳐 많이 쓰면 LRU 축출이 잦아져 캐시 효과가 떨어지고, 쓰기마다 네트워크 홉이 하나 더 생긴다. 대신 라이트 어라운드에서는 캐시가 DynamoDB와 어긋날 수 있다는 점을 감수한다.

**DAX를 쓰지 말아야 할 때.**

| 상황 | 이유 |
|---|---|
| 강력한 일관된 읽기나 트랜잭션 읽기가 필요 | 캐시하지 않고 통과만 시킨다 |
| 쓰기가 많은 워크로드 | 쓰기가 노드 간 복제를 늘려 자원을 더 쓰고 가용성 위험이 커진다 |
| 반복 읽기가 적은 데이터 | 적중률이 낮으면 누락이 늘어 오히려 자원을 쓴다. DAX는 적중률 {{fact:dynamodb.dax.hit-rate.best}}일 때 가장 좋다 |
| 밀리초 지연으로 충분한 단순한 앱 | DynamoDB만으로 충분하다. 비용과 복잡도만 는다 |

반대로 읽기 대 쓰기 비율이 {{fact:dynamodb.dax.read-write-ratio}}인 읽기 위주 앱, 인기 상품처럼 같은 키를 반복해 읽는 앱, 마이크로초 응답이 필요한 앱이 DAX에 맞다.

@topic dynamodb/dax/cluster

**노드와 클러스터.** DAX 클러스터는 노드로 이뤄진다. 노드 하나가 기본 노드(Primary node)로서 DynamoDB 쓰기를 맡고, 나머지는 읽기 복제본(Read replica)이다. 한 클러스터는 {{fact:dynamodb.dax.cluster.max-nodes}}까지 둘 수 있다. 기본 노드가 고장 나면 DAX가 읽기 복제본 하나를 새 기본 노드로 자동 전환한다.

> **주의:** 운영 환경에는 {{fact:dynamodb.dax.cluster.min-prod-nodes}} 이상을 각각 다른 가용 영역에 두라고 AWS는 강하게 권장한다. 노드가 한두 개인 클러스터는 장애에 견디지 못하고 캐시 데이터를 잃을 수 있다.

**확장 방법은 두 가지다.**

| 방법 | 언제 |
|---|---|
| 노드 추가(수평) | 적중률이 높고 읽기 비중이 클 때. 읽기 처리량이 늘어난다 |
| 더 큰 노드 유형(수직) | 기본 노드 CPU, 축출률, 캐시 메모리 사용률이 높을 때. 새 클러스터를 만들어야 한다 |

DAX 노드의 용량을 넘는 요청은 `ThrottlingException`을 받는다. CloudWatch의 `ThrottledRequestCount`가 자주 오르면 클러스터를 키운다. 크기를 정할 때는 적중률(`ItemCacheHits` / (`ItemCacheHits` + `ItemCacheMisses`)), 초당 RCU, 초당 WCU를 추정한 뒤 부하 테스트로 확인한다. 일반적인 적중률은 {{fact:dynamodb.dax.hit-rate.typical}}다.

**네트워크와 범위.** DAX는 VPC 안에서만 돈다. 클러스터를 만들 때 서브넷 그룹(보통 프라이빗 서브넷)을 정하고, 보안 그룹에 {{fact:dynamodb.dax.port}} 인바운드 규칙을 연다. DAX 클러스터는 같은 리전의 테이블만 다룬다. 한 클러스터에 붙일 테이블은 {{fact:dynamodb.dax.cluster.max-tables}}를 넘지 않게 한다. 애플리케이션은 개별 노드가 아니라 **클러스터 엔드포인트**에 접속한다. 그래야 노드를 늘리거나 줄여도 코드를 고치지 않는다.

**유지 관리 기간.** 클러스터마다 주간 유지 관리 기간이 있고, 이때 노드가 교체되며 일시적인 오류나 스로틀이 생길 수 있다. 사용량이 가장 적은 시간으로 잡는다.

@topic dynamodb/dax/security

**IAM 권한은 두 겹이다.** DAX와 DynamoDB는 IAM을 쓰지만 보안 모델이 다르다.

| 대상 | 정하는 것 |
|---|---|
| 서비스 역할(Service role) | 클러스터에 붙이는 IAM 역할. DAX가 사용자 대신 어떤 테이블에 어떤 DynamoDB 작업을 할 수 있는지 정한다. `dynamodb:DescribeTable`이 꼭 필요하다 |
| 사용자·역할 정책 | 사용자가 어떤 DAX 클러스터에 어떤 DAX API(`dax:GetItem` 등)를 부를 수 있는지 정한다 |

> **주의:** DAX를 거치면 사용자는 **클러스터 서비스 역할의 권한**을 물려받는다. DynamoDB 쪽에 걸어 둔 사용자별 IAM 제한(항목 단위 제한 포함)은 DAX 경로에서 적용되지 않는다. 사용자마다 데이터를 나눠야 하면 클러스터를 따로 만들고 클러스터마다 서비스 역할을 좁게 준다.

**암호화.**

- **저장 시 암호화(Encryption at rest).** 클러스터를 만들 때만 켤 수 있고, 나중에 켜거나 끌 수 없다. DAX가 기본 노드에서 복제본으로 변경을 전할 때 디스크에 쓰는 데이터를 AES-256으로 암호화한다. 키는 AWS 관리형 키(AWS managed key)를 쓰며, **고객 관리형 키는 지원하지 않는다.**
- **전송 중 암호화(Encryption in transit).** 역시 클러스터를 만들 때만 정한다. 켜면 애플리케이션과 클러스터 사이를 TLS로 암호화하고, 클라이언트가 클러스터의 x509 인증서로 상대를 확인한다. 켠 클러스터는 암호화하지 않은 연결을 받지 않는다. 엔드포인트가 `dax://` 대신 `daxs://`로 시작한다. 기존 클러스터에 적용하려면 새 클러스터를 만들어 트래픽을 옮긴다.

전송 중 암호화를 켜면 ACM이 발급한 인증서에 클러스터 이름이 들어가고, 이 이름은 공개 인증서 투명성(CT) 로그에 남는다. 클러스터 이름에 고객 번호 같은 민감한 정보를 넣지 않는다. DynamoDB 쪽 보안은 {{ch:dynamodb/security}}에서 다룬다.

@quiz

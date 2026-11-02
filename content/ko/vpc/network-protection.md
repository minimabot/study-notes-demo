---
chapter: vpc/network-protection
---

@topic vpc/network-protection/layers

VPC의 트래픽을 거르는 장치는 여러 겹이다. 겹마다 보는 위치와 보는 내용이 다르다. 하나로 모든 것을 막으려 하지 말고, 겹을 나눠 쌓는다(심층 방어).

| 장치 | 보는 계층 | 상태 저장 | 붙는 곳 |
|---|---|---|---|
| 보안 그룹(Security group) | IP·포트·프로토콜 | 예 | 네트워크 인터페이스 |
| 네트워크 ACL(Network ACL) | IP·포트·프로토콜 | 아니요 | 서브넷 |
| AWS Network Firewall | 네트워크~애플리케이션(도메인, 침입 탐지 규칙) | 둘 다(상태 비저장·상태 저장 엔진) | 방화벽 서브넷의 방화벽 엔드포인트. 라우팅으로 지나가게 한다 |
| Route 53 Resolver DNS 방화벽(DNS Firewall) | DNS 질의의 도메인 이름 | 해당 없음(질의 단위) | VPC에 연결한 규칙 그룹 |
| AWS WAF | HTTP·HTTPS 요청 | 해당 없음(요청 단위) | CloudFront, Application Load Balancer, API Gateway REST API 같은 리소스 |

보안 그룹과 네트워크 ACL은 {{ch:vpc/security-groups-nacl}}에서 자세히 다룬다. AWS가 인프라 보안 문서에서 제시하는 기본 순서는 이렇다.

- **보안 그룹을 주된 통제 수단으로 쓴다.** 상태 저장이고 다른 보안 그룹을 참조할 수 있어 쓰임이 넓다.
- **네트워크 ACL은 보조 통제다.** 서브넷 전체에 걸리므로, 누가 보안 그룹을 잘못 붙여 인스턴스를 띄워도 한 번 더 막는다.
- 인터넷에서 직접 닿지 않아야 할 인스턴스는 프라이빗 서브넷에 두고, 라우팅 테이블에는 필요한 최소 경로만 둔다.
- 흐름 로그로 트래픽을 보고, Network Access Analyzer로 의도하지 않은 경로를 찾고, Network Firewall로 서브넷을 흔한 네트워크 위협에서 지킨다. GuardDuty는 흐름 로그 등을 바탕으로 위협을 탐지한다.

**WAF와 Shield는 VPC 기능이 아니다.** AWS WAF는 웹 요청(HTTP·HTTPS)을 보고 SQL 삽입 같은 애플리케이션 계층 공격을 거른다. VPC나 서브넷이 아니라 CloudFront 배포, Application Load Balancer, API Gateway REST API 같은 리소스에 웹 ACL을 붙인다. AWS Shield는 DDoS 대응이다. 모든 AWS 고객은 추가 비용 없이 흔한 볼륨형 공격(UDP 반사, TCP SYN 플러드 등)에 대한 기본 보호를 받고, 유료인 Shield Advanced가 탐지·완화·대응을 더한다. 시험에서 "SQL 삽입·웹 공격"이면 WAF, "DDoS"면 Shield, "서브넷을 오가는 패킷·도메인 필터링"이면 Network Firewall, "DNS 질의로 새는 데이터"면 DNS 방화벽을 먼저 떠올린다. 여러 계정에 이 규칙들을 한꺼번에 배포할 때는 AWS Firewall Manager를 쓴다.

@topic vpc/network-protection/network-firewall

**AWS Network Firewall** 은 VPC용 관리형 방화벽이자 침입 탐지·방지(IDS/IPS) 서비스다. 상태 저장 방식이고, 처리 용량은 AWS가 관리한다. 구성 요소는 셋이다.

| 리소스 | 하는 일 |
|---|---|
| 방화벽(Firewall) | 정책을 보호할 VPC와 잇는다. 방화벽 엔드포인트를 둘 가용 영역과 서브넷, 로깅 설정을 담는다 |
| 방화벽 정책(Firewall policy) | 어떤 규칙 그룹을 어떤 기본 동작으로 적용할지 정한다. 여러 방화벽이 함께 쓸 수 있다 |
| 규칙 그룹(Rule group) | 다시 쓸 수 있는 검사 규칙 묶음. 상태 비저장과 상태 저장 두 종류 |

**두 엔진.** 패킷은 먼저 **상태 비저장(stateless) 엔진** 을 지난다. 패킷 하나하나를 따로 보고, 우선순위 순서로 처음 맞는 규칙에서 멈춘다. 네트워크 ACL과 비슷하다. 여기서 버리거나, 통과시키거나, **상태 저장(stateful) 엔진** 으로 넘긴다. 상태 저장 엔진은 흐름(연결)의 맥락에서 보고, Suricata 호환 규칙으로 도메인 목록·프로토콜·침입 탐지 서명까지 다룬다. 보안 그룹과 비슷하지만 기본 동작이 다르다. 보안 그룹은 기본이 거부인데, 상태 저장 엔진은 기본이 통과다. 그래서 "허용 목록만 통과" 같은 정책을 원하면 기본 동작이나 규칙을 명시해야 한다.

**방화벽 서브넷과 라우팅.** 방화벽을 붙이는 순서는 이렇다.

1. 방화벽 엔드포인트를 둘 가용 영역마다 **방화벽 전용 서브넷** 을 만든다. 방화벽 엔드포인트는 자기가 있는 서브넷을 드나드는 트래픽은 거르지 못한다. 그래서 이 서브넷에는 다른 워크로드를 두지 않는다.
2. 방화벽을 만들면서 그 서브넷들을 지정한다. 서브넷마다 방화벽 엔드포인트가 생긴다.
3. 방화벽 정책과 규칙 그룹을 정한다.
4. **라우팅 테이블을 고쳐 트래픽이 엔드포인트를 지나가게 한다.** 방화벽은 경로 위에 놓여야만 일한다.

인터넷 게이트웨이가 있는 단순한 구조에서는 세 군데를 바꾼다.

| 라우팅 테이블 | 경로 |
|---|---|
| 워크로드 서브넷 | VPC 안은 `local`, `0.0.0.0/0` → 방화벽 엔드포인트 |
| 방화벽 서브넷 | VPC 안은 `local`, `0.0.0.0/0` → 인터넷 게이트웨이 |
| 인터넷 게이트웨이(게이트웨이 라우팅 테이블, 엣지 연결) | 워크로드 서브넷 CIDR → 같은 영역의 방화벽 엔드포인트 |

들어오는 방향은 게이트웨이 라우팅 테이블이 맡는다({{ch:vpc/subnets-routing}}). NAT 게이트웨이가 함께 있으면 NAT 게이트웨이 서브넷의 경로도 방화벽 엔드포인트를 지나게 맞춘다.

**비대칭 라우팅을 피한다.** Network Firewall은 요청과 응답이 같은 엔드포인트를 지나야 제대로 검사한다. 엔드포인트는 가용 영역마다 하나씩 두고, 각 영역의 서브넷은 같은 영역의 엔드포인트로 보내는 것이 흔한 구성이다. 한 가용 영역의 처리량은 {{fact:vpc.nfw.bw-per-az}}까지이고, 그 영역의 엔드포인트가 나눠 쓴다.

**중앙 집중 검사.** VPC가 많으면 VPC마다 방화벽을 두는 대신, 전송 게이트웨이(Transit Gateway)에 **검사 VPC** 를 붙이고 모든 VPC의 트래픽을 그곳으로 돌린다({{ch:vpc/transit-gateway}}). 이때 검사 VPC 연결에 **어플라이언스 모드(appliance mode)** 를 켜야 한 흐름이 같은 가용 영역의 엔드포인트를 지난다. 전송 게이트웨이 라우팅 테이블에서 갈 때와 돌아올 때 모두 검사 VPC를 거치게 한다. 전송 게이트웨이에 Network Firewall을 직접 붙이는 **네트워크 기능 연결(network function attachment)** 도 있다. 검사 VPC를 직접 만들 필요가 없지만 {{fact:vpc.tgw.nf-attachment.since}}에 추가된 기능이라 시험 범위인지는 확인되지 않았다.

**지원하지 않는 구성.** VPC 피어링을 거치는 트래픽, 클라이언트 IP 보존을 켠 Global Accelerator 트래픽, EC2가 Amazon 제공 DNS로 보내는 질의는 Network Firewall이 검사하지 않는다. DNS 질의 쪽은 다음 절의 DNS 방화벽이 맡는다.

@topic vpc/network-protection/dns-firewall

**Route 53 Resolver DNS 방화벽(DNS Firewall)** 은 VPC에서 Route 53 Resolver(VPC의 `.2` 주소)로 나가는 DNS 질의를 도메인 이름으로 거른다. 별도 장비 없이 Resolver의 기능으로 동작한다.

- **도메인 목록(Domain list)** 에 도메인을 담고, **규칙 그룹(Rule group)** 의 규칙마다 도메인 목록 하나와 동작(허용·차단·경고)을 정한다. 차단한 질의에 돌려줄 응답도 고를 수 있다.
- 규칙 그룹을 VPC에 연결하면 그 VPC의 질의가 걸러진다.

주된 쓰임은 **DNS를 이용한 데이터 유출(DNS exfiltration)** 차단이다. 공격자가 인스턴스를 장악한 뒤 자기 도메인을 조회하는 질의에 데이터를 실어 내보내는 경우다. 네트워크 ACL은 Resolver로 오가는 DNS 요청을 아예 막지 못하고, 보안 그룹도 질의 내용을 보지 않는다. 그리고 Network Firewall도 Resolver가 대신 하는 조회는 보지 못한다. 반대로 DNS 방화벽은 질의만 보므로, 인스턴스가 IP 주소로 직접 연결하는 트래픽은 막지 못한다. 둘은 서로 보완한다.

| 구분 | DNS 방화벽 | Network Firewall |
|---|---|---|
| 보는 것 | Resolver를 거치는 DNS 질의 | 서브넷을 오가는 패킷·흐름 |
| 도메인 필터링 시점 | 이름을 풀 때 | 연결할 때(TLS SNI, HTTP Host 등) |
| 놓치는 것 | IP로 직접 하는 연결 | Resolver가 대신 하는 조회 |

여러 계정의 VPC에 같은 규칙 그룹을 붙여야 하면 AWS Firewall Manager를 쓴다. Firewall Manager는 정책 범위에 새로 들어온 VPC에도 연결을 자동으로 추가한다.

@topic vpc/network-protection/bpa

{{ch:vpc/internet-access}}에서 소개한 **VPC 퍼블릭 액세스 차단(VPC Block Public Access, BPA)** 을 운영 관점에서 더 본다. 이 기능은 {{fact:vpc.bpa.since}}에 문서에 추가됐다. 시험 범위인지는 확인되지 않았다.

BPA는 계정의 한 리전 전체에 걸리는 설정이다. 라우팅 테이블이나 보안 그룹이 인터넷을 열어 두어도 BPA가 우선해 막는다.

- **양방향(Bidirectional)**: 인터넷 게이트웨이와 송신 전용 인터넷 게이트웨이를 오가는 트래픽을 모두 막는다.
- **수신 전용(Ingress-only)**: 들어오는 트래픽만 막는다. 밖으로 연결만 여는 NAT 게이트웨이와 송신 전용 인터넷 게이트웨이는 쓸 수 있다.

**제외(exclusion).** VPC나 서브넷 단위로 예외를 둔다. 제외 모드는 양방향 허용과 송신 전용 허용이다(송신 전용 제외는 BPA가 양방향일 때만 의미가 있다). VPC에 제외를 두면 그 안의 모든 서브넷에 적용된다. BPA를 켜기 전에 제외를 미리 만들어 둘 수 있어, 켜는 순간 필요한 트래픽이 끊기지 않게 준비할 수 있다. 제외 수 기본 할당량은 {{fact:vpc.bpa.exclusions}}다.

**놓치기 쉬운 점.**

- 인터넷에 노출된 로드 밸런서의 서브넷 중 하나만 제외하면, 로드 밸런서는 그 서브넷으로 공개 트래픽을 받아 제외되지 않은 서브넷의 대상으로 넘긴다. 대상까지 확실히 막으려면 로드 밸런서 서브넷을 하나도 제외하지 않는다.
- Network Firewall이나 Gateway Load Balancer로 인터넷 트래픽을 검사한다면, 엔드포인트가 있는 서브넷을 제외해야 트래픽이 흐른다.
- 인터넷 게이트웨이를 거치지 않는 사설 연결(Site-to-Site VPN, 전송 게이트웨이, Client VPN 등)은 영향을 받지 않는다. VPC 안에서 Resolver로 가는 질의도 막히지 않는다.
- 공유 VPC에서는 소유자의 BPA 설정이 참여자 트래픽에도 걸리고, 참여자는 바꿀 수 없다({{ch:vpc/sharing-multi-account}}).
- AWS Organizations의 **선언적 정책(declarative policy)** 으로 조직 계정 전체에 BPA를 강제할 수 있다. 정책은 제외를 허용할지만 정하고, 제외 자체는 VPC 소유 계정에서 만든다.

AWS는 운영 계정에서 BPA를 켜기 전에 인터넷이 필요한 워크로드를 꼼꼼히 검토하라고 권한다. Network Access Analyzer와 Reachability Analyzer로 영향을 미리 볼 수 있다.

@topic vpc/network-protection/encryption-controls

**VPC 암호화 제어(VPC Encryption Controls)** 는 리전 안 VPC 내부와 VPC 사이 트래픽이 전송 중 암호화되는지 보여 주고, 원하면 강제하는 기능이다. {{fact:vpc.encryption-controls.since}}에 문서에 추가됐고 시험 범위인지는 확인되지 않았다. 암호화는 Nitro 하드웨어가 하는 암호화와 애플리케이션 계층 암호화(TLS 등)를 함께 인정한다.

| 모드 | 동작 |
|---|---|
| 모니터(Monitor) | 흐름이 암호화됐는지 보여 주고, 평문을 허용할 수 있는 리소스를 찾아 준다 |
| 적용(Enforce) | VPC 안에서 평문 통신을 허용하는 기능·리소스를 만들거나 붙이지 못하게 막는다 |

- **기존 VPC는 모니터 모드부터** 켠다. 걸리는 리소스를 고친 뒤 적용 모드로 바꾼다. 새 VPC는 만들 때 바로 적용 모드로 둘 수 있다.
- 흐름 로그에 `encryption-status` 필드를 넣으면 흐름마다 암호화 여부가 남는다. 기존 흐름 로그에는 자동으로 붙지 않으므로 새로 만든다. AWS는 `traffic-path`, `flow-direction` 필드도 함께 넣기를 권한다.
- 인터넷 게이트웨이, NAT 게이트웨이처럼 AWS 네트워크 밖으로 나가는 리소스는 종단 간 암호화를 고객이 책임진다. 이런 리소스는 **제외(exclusion)** 로 두며, 제외할 수 있는 종류는 {{fact:vpc.encryption-controls.exclusion-types}}뿐이다.
- Gateway Load Balancer와 Network Firewall이 있는 VPC는 적용 모드를 쓸 수 없고 모니터 모드로만 둔다. 앞 절의 검사 구조와 함께 쓸 때 알아 둔다.
- 오래된 인스턴스 유형처럼 하드웨어 암호화를 지원하지 않는 리소스는 최신 Nitro 유형으로 옮겨야 한다. Load Balancer, Fargate 등은 모니터 모드를 켜면 AWS가 자동으로 옮긴다.

@quiz

@design

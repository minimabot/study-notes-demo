---
chapter: ec2/load-balancing
---

@topic ec2/load-balancing/alb-routing

**Elastic Load Balancing(ELB)** 은 들어오는 트래픽을 여러 대상(EC2 인스턴스, 컨테이너, IP 주소 등)에 나눠 보낸다. 대상의 상태를 확인해 정상인 대상에만 보내고, 트래픽 양에 맞춰 로드 밸런서 자체도 알아서 늘린다. 종류는 **Application Load Balancer(ALB)**, **Network Load Balancer(NLB)**, **Gateway Load Balancer(GWLB)**, 그리고 이전 세대인 **Classic Load Balancer(CLB)** 다.

가용 영역을 켜면 그 영역에 **로드 밸런서 노드** 가 생긴다. 클라이언트는 DNS 이름으로 접속하고, DNS가 노드 IP 가운데 하나를 돌려준다. 그래서 여러 가용 영역을 켜고 영역마다 대상을 두는 것이 가용성의 기본이다. ALB는 서브넷을 적어도 두 가용 영역에서 골라야 한다.

**ALB 구성 요소.** ALB는 OSI 7계층(애플리케이션 계층)에서 HTTP 요청을 보고 보낼 곳을 정한다.

| 요소 | 하는 일 |
|---|---|
| 리스너(listener) | 정한 프로토콜(HTTP, HTTPS)과 포트로 연결을 받는다 |
| 규칙(rule) | 우선순위, 조건, 작업으로 이뤄진다. 조건이 맞으면 작업을 한다. 리스너마다 기본 규칙(default rule)이 반드시 있다 |
| 대상 그룹(target group) | 요청을 받을 대상 묶음. 프로토콜·포트와 상태 확인을 대상 그룹마다 정한다. 한 대상을 여러 대상 그룹에 넣을 수 있다 |

**규칙 평가.** 리스너는 규칙을 우선순위 번호가 낮은 것부터 본다. 어느 것도 맞지 않으면 마지막에 기본 규칙을 실행한다. 기본 규칙에는 조건을 둘 수 없다.

조건 종류:
- **경로(`path-pattern`)**: `/api/*`, `/images/*`처럼 URL 경로로 나눈다. 한 로드 밸런서 뒤에 작은 서비스 여러 개를 둘 때 쓴다.
- **호스트(`host-header`)**: `api.example.com`, `shop.example.com`처럼 도메인마다 다른 대상 그룹으로 보낸다. 로드 밸런서 하나로 여러 도메인을 받는다.
- HTTP 헤더(`http-header`), 메서드(`http-request-method`), 쿼리 문자열(`query-string`), 원본 IP(`source-ip`).

작업 종류:
- **`forward`**: 대상 그룹으로 보낸다. 대상 그룹 여러 개에 가중치를 주어 나눌 수 있다(한 작업에 {{fact:ec2.alb.tg.per-action}}까지). 새 버전에 일부만 보내는 배포에 쓴다.
- **`redirect`**: 다른 URL로 돌려보낸다. HTTP를 HTTPS로 돌리는 데 흔히 쓴다.
- **`fixed-response`**: 정한 HTTP 응답을 바로 돌려준다.
- **`authenticate-cognito`, `authenticate-oidc`**: 대상에 보내기 전에 사용자를 인증한다. HTTPS 리스너에서만 된다.

규칙 수는 ALB당 {{fact:ec2.alb.rules.max}}가 기본 할당량이다(조정 가능).

**대상 유형.** 대상 그룹을 만들 때 정하고 나중에 바꿀 수 없다.
- `instance`: 인스턴스 ID로 등록한다. 기본 네트워크 인터페이스의 기본 프라이빗 IP로 보낸다. Auto Scaling 그룹과 붙일 때 쓴다.
- `ip`: 프라이빗 IP로 등록한다. 피어링된 VPC, Direct Connect·VPN으로 이어진 온프레미스 서버도 넣을 수 있다. 퍼블릭 IP는 안 된다.
- `lambda`: Lambda 함수 하나를 등록한다.

**TLS 종료.** HTTPS 리스너는 로드 밸런서에 SSL/TLS 서버 인증서를 두고, 클라이언트와의 TLS를 로드 밸런서에서 끝낸 뒤 대상에 보낸다. 인증서는 보통 ACM(AWS Certificate Manager)에서 받는다. 보안 정책(security policy)으로 허용할 프로토콜과 암호를 정한다. 인증서 목록에 여러 인증서를 넣으면 클라이언트가 보낸 호스트 이름(SNI, Server Name Indication)에 맞는 인증서를 고른다. 그래서 HTTPS 리스너 하나로 여러 도메인을 받는다. 대상 그룹 프로토콜을 HTTPS로 두면 로드 밸런서에서 대상까지도 다시 암호화한다.

**클라이언트 IP 보기: `X-Forwarded-For`.** ALB는 클라이언트 연결을 끊고 대상에 새 연결을 맺는다. 그래서 대상의 접근 로그에는 로드 밸런서 IP만 남는다. ALB는 기본으로 클라이언트 IP를 `X-Forwarded-For` 요청 헤더에 넣어(이미 있으면 덧붙여) 보낸다. 원래 프로토콜과 포트는 `X-Forwarded-Proto`, `X-Forwarded-Port`로 온다. 이 헤더는 클라이언트도 마음대로 넣을 수 있으므로, 믿을 수 있는 시스템이 붙인 항목만 믿는다.

**연결 유휴 제한 시간.** 데이터가 오가지 않는 연결을 닫기까지의 시간이다. ALB 기본값은 {{fact:ec2.alb.idle.default}}이다. 긴 업로드가 있으면 늘리고, 대상 애플리케이션의 keep-alive 제한 시간은 로드 밸런서 값보다 길게 두라고 문서가 권한다.

@topic ec2/load-balancing/target-groups-health

**상태 확인(health check).** 로드 밸런서 노드가 대상 그룹 설정대로 대상에 주기적으로 요청을 보낸다. ALB는 HTTP·HTTPS `GET`으로 확인한다.

| 설정 | ALB 기본값 |
|---|---|
| 경로 | `/` |
| 간격(`HealthCheckIntervalSeconds`) | {{fact:ec2.elb.hc.interval.default}} |
| 제한 시간(`HealthCheckTimeoutSeconds`) | {{fact:ec2.alb.hc.timeout.default}} |
| 정상 임계값(`HealthyThresholdCount`) | 연속 성공 {{fact:ec2.elb.hc.healthy.default}} |
| 비정상 임계값(`UnhealthyThresholdCount`) | 연속 실패 {{fact:ec2.elb.hc.unhealthy.default}} |
| 성공 코드(`Matcher`) | `200` |

- 새로 등록한 대상은 첫 상태 확인 한 번만 통과하면 트래픽을 받기 시작한다. 정상 임계값은 비정상이던 대상이 정상으로 돌아올 때 쓰인다.
- 대상 상태: `initial`(등록·첫 확인 중), `healthy`, `unhealthy`, `unused`(대상 그룹이 규칙에 없거나, 대상의 가용 영역이 켜져 있지 않거나, 인스턴스가 중지됨), `draining`(등록 취소 중), `unavailable`(상태 확인 꺼짐).
- **모두 비정상이면 열어 둔다(fail open).** 대상 그룹의 대상이 전부 비정상이면, 로드 밸런서는 상태와 상관없이 모든 대상에 보낸다. 상태 확인 경로가 잘못 설정되어 전부 실패하면 오히려 트래픽이 그대로 가는 이유다.
- **실패할 때 볼 곳(문서의 점검 목록).** 대상의 보안 그룹이 로드 밸런서에서 오는 상태 확인 포트·프로토콜을 허용하는가. 대상 서브넷의 네트워크 ACL이 상태 확인 포트 인바운드와 임시 포트 아웃바운드를 허용하는가({{ch:vpc/security-groups-nacl}}). 상태 확인 경로가 실제로 있는가. 앱이 기대한 성공 코드를 돌려주는가(리디렉션이나 인증 요구로 `200` 외의 코드가 나오면 `Target.ResponseCodeMismatch`). 응답이 늦으면 `Target.Timeout`이다. 대상이 과부하인지도 본다.
- 대상이 로드 밸런서에서만 트래픽을 받게 하려면, 대상 보안 그룹의 인바운드 원본을 로드 밸런서 보안 그룹으로 둔다.

**등록 취소 지연(deregistration delay, 연결 드레이닝).** 대상을 대상 그룹에서 빼면 로드 밸런서는 새 요청 보내기를 멈추고, 대상은 `draining` 상태로 처리 중인 요청을 마친다. 기다리는 시간은 기본 {{fact:ec2.elb.dereg.default}}, 최대 {{fact:ec2.elb.dereg.max}}이다. 요청이 짧은 앱이면 줄여서 축소와 배포를 빠르게 한다. Auto Scaling이 인스턴스를 종료할 때도 이 드레이닝을 기다린다({{ch:ec2/auto-scaling}}).

**느린 시작(slow start).** 새로 등록된 대상에 트래픽을 한꺼번에 주지 않고 정한 기간 동안 비율을 선형으로 늘린다. 캐시를 데워야 하는 앱에 쓴다. 기본은 꺼져 있고, 켜면 {{fact:ec2.alb.slowstart.min}}~{{fact:ec2.alb.slowstart.max}} 사이로 정한다.

**라우팅 알고리즘.** 대상 그룹마다 정한다. 기본은 라운드 로빈(`round_robin`)이다. 요청 처리 시간이 들쭉날쭉하면 처리 중인 요청이 가장 적은 대상에 보내는 `least_outstanding_requests`가 낫다. `weighted_random`도 있다.

**고정 세션(sticky session).** 같은 클라이언트의 요청을 같은 대상에 계속 보낸다. 대상 그룹 속성이고 기본은 꺼져 있다. 서버 메모리에 세션을 두는 오래된 앱을 옮길 때 쓴다.

| 방식 | 쿠키 |
|---|---|
| 기간 기반(`lb_cookie`) | 로드 밸런서가 만드는 `AWSALB` 쿠키 |
| 애플리케이션 기반(`app_cookie`) | 앱이 만든 쿠키(이름을 지정)를 기준으로 로드 밸런서가 고정용 쿠키를 따로 만든다. `AWSALB`, `AWSALBAPP`, `AWSALBTG`는 예약된 이름이라 앱 쿠키 이름으로 못 쓴다 |

쿠키 유효 기간 기본값은 {{fact:ec2.alb.sticky.default}}, 최대 {{fact:ec2.alb.sticky.max}}이다. 고정 세션을 쓰면 첫 대상만 알고리즘으로 고르고 그 뒤로는 알고리즘을 건너뛴다. 그래서 부하가 고르게 나뉘지 않을 수 있다. 세션을 DynamoDB나 ElastiCache 같은 외부 저장소로 빼면 고정 세션이 필요 없다.

@topic ec2/load-balancing/cross-zone

**교차 영역 로드 밸런싱(cross-zone load balancing).** 각 로드 밸런서 노드가 자기 가용 영역의 대상에만 보낼지, 켜진 모든 가용 영역의 대상에 보낼지 정한다.

예를 들어 영역 A에 대상 {{raw:2대}}, 영역 B에 대상 {{raw:8대}}가 있고 DNS가 두 노드에 클라이언트를 반씩 보낸다고 하자.
- 켜면: 노드마다 대상 {{raw:10대}} 전체에 나누므로 대상마다 {{raw:10%}}씩 받는다.
- 끄면: 영역 A의 대상 두 대가 절반을 나눠 각각 {{raw:25%}}, 영역 B의 여덟 대가 각각 {{raw:6.25%}}를 받는다. 영역마다 대상 수가 다르면 부하가 치우친다.

| 종류 | 교차 영역 기본과 바꾸는 곳 |
|---|---|
| ALB | 로드 밸런서 수준에서 늘 켜져 있고 끌 수 없다. 대상 그룹마다 끌 수 있다 |
| NLB | 꺼져 있다. 로드 밸런서 수준에서 언제든 켜고, 대상 그룹마다 따로 켜고 끌 수 있다 |
| GWLB | 꺼져 있다. 만든 뒤 켜고 끌 수 있다 |

- NLB에서 교차 영역을 켜면 가용 영역 사이로 오가는 트래픽에 EC2 데이터 전송 요금이 붙는다고 문서가 밝힌다.

- 교차 영역을 끄면 가용 영역마다 대상 수를 고르게 맞추는 것이 더 중요해진다. Auto Scaling 그룹이 가용 영역 균형을 맞추는 이유 가운데 하나다.
- NLB는 대상 그룹에 어떤 가용 영역의 정상 대상이 하나도 없으면 그 영역 노드 IP를 DNS에서 뺀다. 문서는 대상 그룹마다 켜진 가용 영역 각각에 대상을 적어도 하나 두라고 권한다.

@topic ec2/load-balancing/nlb

**NLB** 는 OSI 4계층(전송 계층)에서 동작한다. HTTP 내용을 보지 않고 연결(흐름) 단위로 대상을 고른다. 초당 수백만 요청을 다룰 수 있고 지연이 낮다. 프로토콜은 TCP, UDP, TCP_UDP, TLS다.

**대상 고르기.** TCP는 프로토콜, 원본 IP·포트, 목적지 IP·포트, TCP 시퀀스 번호로 만든 흐름 해시로 대상을 고른다. 한 TCP 연결은 끝날 때까지 한 대상으로 간다. UDP 흐름도 원본·목적지가 같으면 늘 같은 대상으로 간다.

**고정 IP.** NLB는 가용 영역마다 네트워크 인터페이스를 만들고, 그 영역 노드는 고정 IP를 쓴다.
- 인터넷 경계(internet-facing) NLB는 {{fact:ec2.nlb.eip.per-az}} 탄력적 IP(Elastic IP)를 붙일 수 있다. 지정하지 않으면 AWS가 하나씩 준다.
- 내부(internal) NLB는 서브넷마다 프라이빗 IP를 직접 지정할 수 있다.
- 방화벽 허용 목록에 IP를 등록해야 하는 고객이나, DNS 대신 IP로 접속하는 클라이언트가 있을 때 쓴다. ALB에는 고정 IP가 없다. ALB 앞에 고정 IP가 필요하면 NLB의 대상 유형 `alb`로 ALB를 NLB 뒤에 둔다.

**클라이언트 IP 보존(client IP preservation).** NLB는 클라이언트의 원본 IP를 대상에 그대로 넘길 수 있다. `X-Forwarded-For` 같은 헤더가 필요 없다.

| 대상 그룹 | 기본 |
|---|---|
| `instance` 유형 | 켜짐 |
| `ip` 유형(UDP, TCP_UDP) | 켜짐 |
| `ip` 유형(TCP, TLS) | 꺼짐. 속성으로 켤 수 있다 |

보존이 켜져 있으면 대상의 보안 그룹은 로드 밸런서 IP가 아니라 **클라이언트 IP** 를 허용해야 한다. 꺼져 있으면 원본은 NLB의 프라이빗 IP다.

**TLS.** TLS 리스너는 NLB에서 TLS를 끝내 대상의 암호화 부담을 덜어 준다. 서버 인증서가 필요하다. 대상에서 직접 복호화해야 하면(종단 간 암호화를 요구하는 규정 등) 443 포트에 TCP 리스너를 두어 암호화된 트래픽을 그대로 넘긴다(통과, passthrough).

**그 밖의 특징.**
- 보안 그룹을 붙일 수 있다. 대상 보안 그룹에서 NLB 보안 그룹을 참조하면 대상에 직접 오는 트래픽을 막는다.
- TCP 흐름의 유휴 제한 시간 기본값은 {{fact:ec2.nlb.idle.tcp}}이다. TLS 리스너는 이 값으로 고정이다.
- 상태 확인 기본 프로토콜은 TCP다. HTTP·HTTPS 확인도 된다. 간격과 임계값 기본값은 ALB와 같고, TCP 확인의 제한 시간 기본값은 {{fact:ec2.nlb.hc.timeout.tcp}}이다.
- 등록 취소 지연 기본값은 ALB와 같은 {{fact:ec2.elb.dereg.default}}이다.

2025년 이후 NLB에 QUIC·TCP_QUIC 프로토콜, 리스너 규칙, 가중치 대상 그룹이 추가됐다. 시험 범위인지 알 수 없다.

@topic ec2/load-balancing/choose

**Gateway Load Balancer(GWLB).** 방화벽, 침입 탐지·방지(IDS/IPS), 심층 패킷 검사 같은 **가상 어플라이언스** 를 늘리고 관리하는 데 쓴다. OSI 3계층(네트워크 계층)에서 모든 포트의 IP 패킷을 받아 어플라이언스 대상 그룹에 보낸다. 투명한 네트워크 게이트웨이와 로드 밸런서를 합친 것이다. 다른 VPC의 트래픽은 **Gateway Load Balancer 엔드포인트**(VPC 엔드포인트의 한 종류)로 받고, 라우팅 테이블에서 이 엔드포인트를 다음 홉으로 지정해 트래픽을 검사 장비로 돌린다({{ch:vpc/subnets-routing}}). 어플라이언스와는 GENEVE 프로토콜로 패킷을 주고받는다.

**Classic Load Balancer.** 이전 세대 로드 밸런서다. AWS는 현재 세대(ALB, NLB)로 옮기라고 권한다. 새 설계에서는 고르지 않는다.

**고르는 기준.**

| 항목 | ALB | NLB |
|---|---|---|
| 계층 | 7계층(HTTP, HTTPS, gRPC) | 4계층(TCP, UDP, TLS) |
| 라우팅 근거 | 경로, 호스트, 헤더, 메서드, 쿼리 | 흐름 해시(포트별 리스너) |
| 고정 IP | 없음(DNS 이름으로 접속) | 가용 영역마다 고정 IP, 탄력적 IP 지정 가능 |
| 클라이언트 IP | `X-Forwarded-For` 헤더 | 원본 IP 그대로(보존 설정) |
| 교차 영역 기본 | 켜짐(로드 밸런서 수준) | 꺼짐. 켜면 데이터 전송 요금 |
| 대상 | 인스턴스, IP, Lambda | 인스턴스, IP, ALB |
| 그 밖 | 사용자 인증, 리디렉션, 고정 응답, 고정 세션 | 매우 많은 연결과 낮은 지연, 비HTTP 프로토콜 |

- HTTP 기반 웹 앱, 마이크로서비스, 컨테이너 → ALB.
- TCP·UDP 프로토콜, 고정 IP, 극단적인 성능, 클라이언트 IP를 패킷 그대로 받아야 함 → NLB.
- 트래픽을 보안 장비 무리로 통과시켜야 함 → GWLB.

@quiz

@design

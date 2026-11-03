---
chapter: vpc/hybrid-vpn
---

@topic vpc/hybrid-vpn/s2s-components

VPC의 인스턴스는 기본으로 사내 데이터 센터와 통신하지 못한다. 사내망과 사설로 잇는 방법은 크게 둘이다. 인터넷 위에 암호화 터널을 놓는 **AWS Site-to-Site VPN** 과, 전용 회선을 쓰는 **AWS Direct Connect** 다. 이 절은 Site-to-Site VPN의 구성 요소를 다룬다.

Site-to-Site VPN은 IPsec VPN이다. 구성 요소는 다음과 같다.

| 구성 요소 | 설명 |
|---|---|
| 고객 게이트웨이 장치(Customer gateway device) | 사내 쪽의 실제 라우터·방화벽 장비나 소프트웨어 |
| 고객 게이트웨이(Customer gateway) | 그 장치의 정보(공인 IP, BGP ASN 등)를 AWS에 알려 주려고 만드는 AWS 리소스 |
| 가상 프라이빗 게이트웨이(Virtual private gateway) | AWS 쪽 VPN 끝점. VPC **하나** 에 붙는다 |
| 전송 게이트웨이(Transit gateway) | AWS 쪽 끝점으로 쓸 수도 있다. 여러 VPC와 사내망을 한 허브에 묶는다({{ch:vpc/transit-gateway}}) |

**터널 두 개.** VPN 연결 하나에는 터널이 {{fact:vpc.vpn.tunnels-per-connection}} 들어 있다. 두 터널은 서로 다른 가용 영역에서 끝난다. 퍼블릭 IP VPN이면 터널마다 고유한 공인 IP를 쓰고, 사설 IP VPN이면 사설 IP를 쓴다. AWS는 유지 보수 때 터널 하나를 잠시 내리기도 하므로 **두 터널을 모두 설정해야** 한다. 사내에서 AWS로 보내는 트래픽을 두 터널에 어떻게 나눌지는 고객 게이트웨이 장치의 라우팅 설정에 달렸다. 가상 프라이빗 게이트웨이가 사내로 보낼 때는 보통 한 터널을 골라 쓰고, AWS 쪽에 문제가 생기면 다른 터널로 옮긴다. 전송 게이트웨이에 붙인 동적 라우팅 VPN은 ECMP로 여러 터널에 트래픽을 나눠 실을 수 있다. 이 선택은 바뀔 수 있으므로, AWS는 비대칭 라우팅을 허용하는 장비를 강하게 권장한다.

**터널을 여는 쪽.** 기본으로 고객 게이트웨이 장치가 트래픽을 만들어 IKE 협상을 시작해야 터널이 올라온다. 터널 옵션에서 AWS가 협상을 시작하게 바꿀 수도 있다.

**AWS 쪽 게이트웨이 고르기.**

- 가상 프라이빗 게이트웨이는 VPC에 한 번에 하나만 붙는다. Amazon 쪽 BGP ASN을 정하지 않으면 {{fact:vpc.vpn.vgw.default-asn}}을 쓰고, 만든 뒤에는 바꿀 수 없다.
- 같은 VPN을 여러 VPC가 써야 하면 전송 게이트웨이를 쓰라고 문서는 권장한다. 가상 프라이빗 게이트웨이에서 전송 게이트웨이로 대상 게이트웨이를 바꿀 수도 있다.
- IPv6 트래픽, 가속화, ECMP는 전송 게이트웨이에서만 된다. 가상 프라이빗 게이트웨이는 IPv6를 지원하지 않는다.

**경로.** 가상 프라이빗 게이트웨이를 쓰면 서브넷 라우팅 테이블에 사내 대역 → 가상 프라이빗 게이트웨이 경로가 있어야 한다. 직접 넣거나 경로 전파를 켠다. 전파 경로 수 한도({{fact:vpc.quota.propagated-routes}})와 우선순위는 {{ch:vpc/subnets-routing}}에 있다. VPC 쪽 보안 그룹과 네트워크 ACL도 사내 대역을 허용해야 한다.

**주요 한도.**

| 항목 | 값 |
|---|---|
| 표준 터널 하나의 대역폭 | {{fact:vpc.vpn.tunnel.bw.standard}} |
| 표준 터널 하나의 패킷 처리량 | {{fact:vpc.vpn.tunnel.pps.standard}} |
| MTU / MSS | {{fact:vpc.vpn.mtu}} / {{fact:vpc.vpn.mss}}. 점보 프레임과 경로 MTU 검색은 지원하지 않는다 |
| 리전당 VPN 연결 | {{fact:vpc.vpn.quota.conn-per-region}} (조정 가능) |
| 가상 프라이빗 게이트웨이당 VPN 연결 | {{fact:vpc.vpn.quota.conn-per-vgw}} (조정 가능) |
| 리전당 고객 게이트웨이 / 가상 프라이빗 게이트웨이 | {{fact:vpc.vpn.quota.cgw-per-region}} / {{fact:vpc.vpn.quota.vgw-per-region}} |
| 사내 → VPN 동적 경로 | 가상 프라이빗 게이트웨이 {{fact:vpc.vpn.routes.cgw-to-vgw}}, 전송 게이트웨이 {{fact:vpc.vpn.routes.cgw-to-tgw}} |

터널 대역폭은 상한일 뿐이다. 실제 처리량은 패킷 크기, TCP·UDP 비율, 인터넷 구간 상태에 따라 낮아진다. 사내와 VPC들의 CIDR이 겹치지 않게 잡는 것도 문서가 권장하는 사항이다({{ch:vpc/ip-addressing}}).

**AWS Client VPN.** Site-to-Site VPN이 "사내망 전체 ↔ VPC"라면, Client VPN은 "사용자 한 명의 기기 ↔ AWS·사내 리소스"다. OpenVPN 기반 클라이언트로 TLS 터널을 열고, Active Directory·SAML 페더레이션·인증서로 사용자를 인증한다. Client VPN 엔드포인트를 VPC 서브넷이나 전송 게이트웨이에 연결해 쓰는 관리형 서비스다. 재택 근무자가 프라이빗 서브넷의 서버에 접속해야 하는 경우가 전형적인 쓰임이다.

@topic vpc/hybrid-vpn/routing-ha

**정적 라우팅과 동적 라우팅.** VPN 연결을 만들 때 둘 중 하나를 고른다.

| 방식 | 특징 |
|---|---|
| 정적(static) | 사내 대역을 직접 입력한다. 장비가 BGP를 지원하지 않을 때 쓴다 |
| 동적(dynamic, BGP) | 고객 게이트웨이 장치가 BGP로 경로를 광고한다. 장애를 감지해 다른 터널로 넘어가기 쉽다 |

AWS는 장비가 지원하면 **BGP를 쓰라고 권장** 한다. BGP의 생존 확인이 두 번째 터널로의 장애 조치를 돕기 때문이다. BGP를 고르면 정적 경로를 따로 넣을 수 없다.

**가상 프라이빗 게이트웨이의 경로 선택.** 가장 긴 접두사가 먼저다. 다만 **터널 끝점의 상태가 다른 어떤 속성보다 앞선다.** 접두사가 같으면 다음 순서로 고른다.

1. Direct Connect에서 BGP로 전파된 경로
2. VPN 연결에 직접 넣은 정적 경로
3. VPN에서 BGP로 전파된 경로
4. BGP VPN끼리는 AS PATH가 짧은 쪽, 같으면 MED가 낮은 쪽

그래서 **같은 사내 대역을 Direct Connect와 VPN이 함께 광고하면 Direct Connect가 주 경로, VPN이 예비 경로** 가 된다. 전송 게이트웨이도 전파 경로끼리 Direct Connect 게이트웨이를 VPN보다 앞에 둔다({{ch:vpc/transit-gateway}}). AWS는 경로 선택에 영향을 주려면 더 구체적인 BGP 경로를 광고하라고 권장한다.

**대역폭 늘리기.** 가상 프라이빗 게이트웨이는 연결이 여러 개여도 모든 연결에서 터널 하나만 주 경로로 쓴다. 터널 여러 개를 동시에 쓰려면 **전송 게이트웨이 + BGP + 등가 다중 경로(ECMP)** 로 터널들을 묶는다. 정적 라우팅 VPN이나 가상 프라이빗 게이트웨이에서는 ECMP를 쓸 수 없다.

**고객 쪽 장애에 대비하기.** 터널 두 개는 AWS 쪽 장애를 막아 줄 뿐, 사내 장비가 하나면 그 장비가 단일 장애 지점이다. 두 번째 고객 게이트웨이 장치로 **두 번째 VPN 연결** 을 만들고, 두 장치가 같은 사내 대역을 광고하게 한다. 한 장치가 죽으면 BGP가 경로를 거두어 남은 장치로 트래픽이 간다. 한 장치를 점검하는 동안에도 통신이 이어진다.

**VPN CloudHub.** 지점이 여러 곳이면 가상 프라이빗 게이트웨이 하나에 지점마다 동적 라우팅 VPN을 만든다. 지점마다 고유한 BGP ASN을 쓰고 지점 고유의 대역을 광고하면, 가상 프라이빗 게이트웨이가 경로를 다시 광고해 **지점끼리도** 통신할 수 있다. 대역이 겹치면 안 된다.

**가속화된 VPN(Accelerated VPN).** AWS Global Accelerator를 써서 사내에서 가장 가까운 AWS 엣지 로케이션으로 들어온 뒤 AWS 글로벌 네트워크로 간다. 인터넷 구간의 혼잡을 줄이려는 것이다.

- **전송 게이트웨이에 붙은 VPN에서만** 된다.
- 기존 연결에서 켜거나 끌 수 없다. 새 연결을 만들어 옮긴다.
- NAT 통과(NAT-T)가 필요하고, IKE 협상은 고객 게이트웨이 장치가 시작해야 한다.
- Direct Connect 퍼블릭 가상 인터페이스와 함께 쓸 수 없다.

@topic vpc/hybrid-vpn/monitoring

VPN 장애 대부분은 "터널이 내려갔다", "터널은 올라왔는데 경로가 없다", "경로는 있는데 필터가 막는다" 중 하나다. 순서대로 확인한다.

**CloudWatch 지표.** VPN 지표는 자동으로 CloudWatch에 들어온다.

| 지표 | 읽는 법 |
|---|---|
| `TunnelState` | 정적 VPN은 1이 UP, 0이 DOWN. BGP VPN은 1이 ESTABLISHED, 나머지는 0. 연결 단위로 보면 0과 1 사이 값은 적어도 한 터널이 정상이 아니라는 뜻이다 |
| `TunnelDataIn` | 고객 게이트웨이에서 AWS로 받은 바이트(복호화 뒤). 합계 통계로 본다 |
| `TunnelDataOut` | AWS에서 고객 게이트웨이로 보낸 바이트(암호화 전) |

차원은 `VpnId`(연결)와 `TunnelIpAddress`(터널)다. 데이터 지표는 터널이 내려가 있어도 상태 확인과 BGP 요청 때문에 값이 찍힐 수 있다. 터널 상태는 `TunnelState`로 판단한다. 콘솔의 터널 상태 표시는 짧은 끊김을 놓칠 수 있으므로 CloudWatch 지표와 로그를 쓰라고 문서는 권한다. 터널마다 `TunnelState` 경보를 걸어 두면 한 터널만 내려가 이중화가 깨진 상태도 알 수 있다.

**Site-to-Site VPN 로그.** 켜면 터널 수립, IKE 협상, DPD(dead peer detection) 메시지, BGP 상태와 경로 변경이 CloudWatch Logs에 남는다. 터널이 올라오지 않을 때 어느 단계에서 실패하는지 본다.

**AWS Health 이벤트.** 터널 상태 변화, 권장 설정, 한도 접근 같은 알림이 Health Dashboard로 온다. 문서는 이 이벤트를 자동 장애 조치의 계기로 쓰라고 안내한다.

**자주 보는 원인.**

- 고객 게이트웨이 장치가 트래픽을 만들지 않아 터널이 안 올라온다. 장치에서 IKE를 시작하거나, AWS가 시작하도록 터널 옵션을 바꾼다.
- 터널은 UP인데 통신이 안 된다. VPC 라우팅 테이블에 사내 대역 경로나 경로 전파가 없거나, 사내 장비에 VPC 대역 경로가 없다. 같은 접두사의 정적 경로가 다른 대상을 가리켜 전파 경로를 이기는 경우도 있다.
- 보안 그룹·네트워크 ACL이 사내 대역을 막는다. 흐름 로그의 REJECT로 확인한다({{ch:vpc/flow-logs-monitoring}}).
- 큰 패킷만 실패한다. MTU {{fact:vpc.vpn.mtu}}보다 큰 패킷이 조각나거나 버려진다. 장비에서 MTU·MSS를 맞춘다.
- 한 터널만 쓰도록 설정해 두어 유지 보수 때 끊긴다. 두 터널을 모두 설정한다.

@topic vpc/hybrid-vpn/direct-connect

**AWS Direct Connect** 는 사내 네트워크를 Direct Connect 로케이션의 AWS 라우터에 이더넷 광케이블로 잇는다. 인터넷 서비스 제공자를 거치지 않으므로 대역폭과 지연이 일정하다. 사내 라우터는 BGP와 802.1Q VLAN을 지원해야 한다.

**연결 종류.**

| 종류 | 특징 |
|---|---|
| 전용 연결(Dedicated connection) | AWS에 직접 요청한다. 포트 속도는 {{fact:vpc.dx.dedicated.speeds}} 중에서 고르고 바꿀 수 없다. 가상 인터페이스를 여럿({{fact:vpc.dx.vif-per-dedicated}}) 만든다. 링크 집계 그룹(LAG)으로 묶을 수 있다 |
| 호스팅 연결(Hosted connection) | Direct Connect 파트너가 만들어 주고 내가 수락한다. 속도는 {{fact:vpc.dx.hosted.speeds}}이고 파트너가 바꾼다. 가상 인터페이스는 {{fact:vpc.dx.vif-per-hosted}}다. 설정 속도를 넘는 트래픽은 버려진다 |

**가상 인터페이스(Virtual interface, VIF).** 연결 위에 만드는 논리 회선이다.

| 유형 | 닿는 곳 |
|---|---|
| 프라이빗 가상 인터페이스 | VPC(가상 프라이빗 게이트웨이). Direct Connect 게이트웨이를 거치면 여러 리전·계정의 VPC |
| 퍼블릭 가상 인터페이스 | S3 같은 AWS 퍼블릭 서비스의 공인 주소 |
| 전송 가상 인터페이스 | Direct Connect 게이트웨이와 연결된 전송 게이트웨이 |

**Direct Connect 게이트웨이(Direct Connect gateway).** 전역 리소스다. 가상 인터페이스 하나로 여러 리전의 가상 프라이빗 게이트웨이(최대 {{fact:vpc.dx.vgw-per-dxgw}})나 전송 게이트웨이(최대 {{fact:vpc.dx.tgw-per-dxgw}})에 닿게 해 준다. 트래픽 경로 밖에서 경로만 중계하는 BGP 경로 반사기처럼 동작한다. 같은 Direct Connect 게이트웨이에 붙은 VPC끼리 서로 통신시키는 용도는 아니다. 사내에서 프라이빗·전송 가상 인터페이스로 광고하는 경로는 기본 {{fact:vpc.dx.routes.private-vif}}이고, 넘으면 BGP 세션이 내려간다.

**암호화.** Direct Connect 회선은 그 자체로 IPsec 터널이 아니다. 전송 구간 암호화가 요구되면 다음 중에서 고른다.

- **Direct Connect 위의 프라이빗 IP VPN.** 전송 가상 인터페이스 → Direct Connect 게이트웨이 → 전송 게이트웨이 구성 위에 사설 IP로 Site-to-Site VPN을 올린다. 공인 IP나 추가 서드파티 VPN 장비 없이 IPsec 암호화를 얻는다. 사내 쪽 터널 끝은 기존 고객 게이트웨이 장치가 맡고(사설 IP 기반 IPsec VPN을 지원해야 한다), 양쪽 끝에 사설 IP를 준다. 문서는 금융·의료·공공의 규정 준수를 대표 쓰임으로 든다.
- **퍼블릭 가상 인터페이스 위의 VPN.** 예전 방식이다. VPN 끝점에 공인 IP가 필요하다.
- **MACsec.** 전용 연결에서 사내 라우터와 Direct Connect 장비 사이 구간을 2계층에서 암호화한다. 점대점 구간만 보호하고 종단 간 암호화는 아니다.

**복원력.** Direct Connect 복원력 툴킷의 연결 마법사는 모델별로 필요한 전용 연결 수를 주문하게 돕는다.

| 모델 | 구성과 SLA |
|---|---|
| 최대 복원력(Maximum resiliency) | 둘 이상의 로케이션에서 각각 별도 장비로 끝나는 연결. 장비·회선·로케이션 장애를 견딘다. {{fact:vpc.dx.sla.max}} |
| 높은 복원력(High resiliency) | 두 로케이션에 연결 하나씩. 회선 절단·장비 장애·로케이션 장애를 견딘다. {{fact:vpc.dx.sla.high}} |
| 개발·테스트 | 한 로케이션의 별도 장비에 연결 두 개. 중요하지 않은 워크로드용 |

SLA를 받으려면 SLA 문서의 조건을 모두 갖춰야 한다. 툴킷은 BGP 세션을 내려 장애 조치를 시험하는 기능도 준다.

**VPN을 예비로.** 회선을 두 개 두기 어렵다면 Direct Connect 하나에 Site-to-Site VPN을 예비 경로로 붙인다. 같은 대역을 둘 다 광고하면 앞 절의 우선순위에 따라 평소에는 Direct Connect를, 회선이 끊기면 VPN을 쓴다. 다만 VPN 대역폭은 터널당 {{fact:vpc.vpn.tunnel.bw.standard}}이므로, 장애 때 줄어든 대역폭으로 버틸 수 있는지 따져야 한다. VPN을 전송 게이트웨이에 붙이면 ECMP로 터널을 묶어 예비 대역폭을 늘릴 수 있다.

@topic vpc/hybrid-vpn/new-features

Site-to-Site VPN 안내서에 최근 추가된 기능이다. 시험 범위인지는 확인되지 않았다.

- **대역폭 확장 터널(Large Bandwidth Tunnel).** 터널 하나가 {{fact:vpc.vpn.tunnel.bw.large}}를 낸다. 전송 게이트웨이나 Cloud WAN에 붙은 VPN에서만 되고, 두 터널이 같은 대역폭 설정이어야 한다. 가속화와 함께 쓸 수 없고, 고객 게이트웨이에 고정 IP가 있어야 한다. 대용량 Direct Connect의 예비 경로를 대표 쓰임으로 든다. ECMP 없이도 터널 하나의 대역폭이 커진다.
- **Site-to-Site VPN Concentrator.** 원격 사이트 여러 곳의 VPN 연결을 한곳에 모아 관리하는 허브다. BGP만 지원하고, 터널 하나의 대역폭은 {{fact:vpc.vpn.concentrator.tunnel-bw}}다.
- **IPv6 외부 터널 주소.** 전송 게이트웨이·Cloud WAN의 VPN은 터널 바깥 주소도 IPv6로 쓸 수 있다. VPN 연결 하나가 IPv4와 IPv6 트래픽을 동시에 나르지는 못하고, 기존 IPv4 연결을 IPv6로 바꿀 수도 없다.

@quiz

@design

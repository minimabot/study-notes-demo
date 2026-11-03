---
chapter: vpc/limits
---

@topic vpc/limits/how-quotas-work

이 장은 참조용이다. 각 수치의 의미와 쓰임은 해당 장에서 설명하고, 여기서는 한곳에 모아 어떤 것을 늘릴 수 있는지 정리한다.

**읽는 법.**

- 따로 적지 않으면 할당량(예전 이름: 한도)은 **계정·리전 단위** 다.
- "VPC당", "라우팅 테이블당"처럼 리소스 단위 할당량을 늘리면 그 리전의 **같은 종류 리소스 전체** 가 함께 늘어난다. 특정 VPC 하나만 늘릴 수는 없다.
- 공유 VPC에서는 참여자가 만든 리소스가 **참여자 계정의 할당량** 에 잡힌다. 일반 VPC 할당량은 공유 서브넷에도 그대로 적용된다.
- 할당량끼리 엮인 것이 있다. 리전당 인터넷 게이트웨이 수는 리전당 VPC 수를 늘리면 같이 늘어나고, 보안 그룹 규칙 수와 인터페이스당 보안 그룹 수는 곱이 상한을 넘을 수 없다.

**늘리는 법.**

1. 조정 가능(Adjustable)한 할당량은 **Service Quotas** 콘솔에서 상향을 요청한다. 같은 화면에서 현재 적용 값을 확인한다.
2. 고객 관리형 접두사 목록 할당량처럼 조정은 되지만 Service Quotas로 요청할 수 없는 것은 **AWS Support 사례** 로 요청한다.
3. 조정 불가 항목(예: 라우팅 테이블당 전파 경로 수, Resolver로 보내는 패킷 수)은 설계를 바꿔야 한다. 전파 경로가 모자라면 기본 경로를 광고하라고 문서가 안내한다.

**미리 늘려 둔다.** 장애 대비용 대기 환경(다른 리전 등)은 평소에 리소스가 적어도, 전환할 때 같은 규모가 필요하다. 할당량은 계정·리전마다 따로이므로 대기 리전의 할당량도 미리 운영 리전 수준으로 맞춰 둔다.

@topic vpc/limits/vpc-subnets-addresses

| 항목 | 기본값 | 조정 |
|---|---|---|
| 리전당 VPC | {{fact:vpc.quota.vpcs-per-region}} | 가능(수백 개까지) |
| VPC당 서브넷 | {{fact:vpc.quota.subnets-per-vpc}} | 가능 |
| VPC당 IPv4 CIDR 블록(기본 포함) | {{fact:vpc.quota.ipv4-cidrs-per-vpc}} | 가능 |
| VPC당 IPv6 CIDR 블록 | {{fact:vpc.quota.ipv6-cidrs-per-vpc}} | 가능 |
| 리전당 네트워크 인터페이스 | {{fact:vpc.quota.eni-per-region}} | 가능 |
| 리전당 탄력적 IP 주소 | {{fact:vpc.quota.eip-per-region}} | 가능 |
| VPC당 네트워크 주소 사용량(NAU) | {{fact:vpc.nau.quota.per-vpc}} | 가능 |
| 같은 리전 피어링 VPC를 합친 NAU | {{fact:vpc.nau.quota.peered}} | 가능 |
| 계정·리전당 BPA 제외 | {{fact:vpc.bpa.exclusions}} | 가능 |

- 네트워크 인터페이스 할당량은 이름은 리전당이지만 실제로는 가용 영역마다 따로 적용된다. 공유 VPC에도 같이 적용된다.
- **NAU(Network Address Usage)** 는 VPC 크기를 재는 단위다. IP 주소 하나는 {{fact:vpc.nau.units.ip}}, NAT 게이트웨이·Lambda 함수·전송 게이트웨이 연결 같은 리소스 하나는 {{fact:vpc.nau.units.service}}를 차지한다. NAU 여유가 있어도 개별 리소스 할당량을 넘으면 리소스를 만들 수 없다. 자세한 계산은 {{ch:vpc/ip-addressing}}에 있다.
- 탄력적 IP 할당량은 공유 VPC에도 적용된다. 공유 VPC의 퍼블릭 IPv4 요금은 소유자가 낸다({{ch:vpc/sharing-multi-account}}).
- 인스턴스당 네트워크 인터페이스 수는 인스턴스 유형마다 다르고 조정할 수 없다.

@topic vpc/limits/gateways-connections

| 항목 | 기본값 | 조정 |
|---|---|---|
| VPC에 붙이는 인터넷 게이트웨이 | {{fact:vpc.quota.igw-per-vpc}} | 불가 |
| 리전당 인터넷 게이트웨이 | {{fact:vpc.quota.igw-per-region}} | VPC 할당량과 함께 |
| 리전당 송신 전용 인터넷 게이트웨이 | {{fact:vpc.quota.eigw-per-region}} | VPC 할당량과 함께 |
| 가용 영역당 NAT 게이트웨이 | {{fact:vpc.quota.natgw-per-az}} | 가능 |
| 퍼블릭 NAT 게이트웨이당 탄력적 IP | {{fact:vpc.natgw.eip.default}} | 가능 |
| NAT 게이트웨이당 IP 주소 | {{fact:vpc.natgw.ips.max}} | 가능 |
| VPC당 인터페이스·GWLB 엔드포인트 합계 | {{fact:vpc.endpoint.interface-per-vpc}} | 가능 |
| 리전당 게이트웨이 엔드포인트 | {{fact:vpc.endpoint.gateway-per-region}} | 가능 |
| VPC당 활성 피어링 연결 | {{fact:vpc.peering.active-per-vpc}} | 가능 |
| 대기 중인 피어링 요청 | {{fact:vpc.peering.pending-requests}} | 가능 |
| 계정당 전송 게이트웨이 | {{fact:vpc.tgw.per-account}} | 가능 |
| VPC당 전송 게이트웨이 | {{fact:vpc.tgw.per-vpc}} | 불가 |
| 전송 게이트웨이당 연결 | {{fact:vpc.tgw.attachments}} | 가능 |

- NAT 게이트웨이는 대기(pending)·사용 가능(available)·삭제 중(deleting) 상태일 때만 할당량에 잡힌다.
- 인터넷 게이트웨이와 송신 전용 인터넷 게이트웨이는 VPC 하나에 한 번에 하나씩만 붙는다. 리전당 개수를 늘리려면 리전당 VPC 할당량을 늘린다.
- 각 연결 방식의 대역폭·MTU 같은 성능 한도는 {{ch:vpc/nat}}, {{ch:vpc/endpoints-privatelink}}, {{ch:vpc/peering}}, {{ch:vpc/transit-gateway}}에 있다.

@topic vpc/limits/filters-routes

| 항목 | 기본값 | 조정 |
|---|---|---|
| 리전당 보안 그룹 | {{fact:vpc.quota.sg-per-region}} | 가능 |
| 보안 그룹당 규칙(인바운드·아웃바운드 각각) | {{fact:vpc.quota.sg-rules}} | 가능 |
| 네트워크 인터페이스당 보안 그룹 | {{fact:vpc.quota.sg-per-eni}} | 가능 |
| VPC당 네트워크 ACL | {{fact:vpc.quota.nacls-per-vpc}} | 가능 |
| 네트워크 ACL당 규칙(인바운드·아웃바운드 각각) | {{fact:vpc.quota.nacl-rules}} | 최대 {{fact:vpc.quota.nacl-rules.max}} |
| VPC당 라우팅 테이블(기본 포함) | {{fact:vpc.quota.route-tables-per-vpc}} | 가능 |
| 라우팅 테이블당 정적 경로 | {{fact:vpc.quota.routes-per-table}} | 가능 |
| 라우팅 테이블당 전파 경로 | {{fact:vpc.quota.propagated-routes}} | 불가 |
| 고객 관리형 접두사 목록당 항목 | {{fact:vpc.quota.prefix-list-entries}} | 지원 사례로 |

**보안 그룹 규칙은 곱으로 묶인다.** "보안 그룹당 규칙 수 × 인터페이스당 보안 그룹 수"는 {{fact:vpc.quota.sg-rules-x-eni}}을 넘을 수 없다. 규칙 수를 크게 올리면 인터페이스에 붙일 수 있는 그룹 수가 그만큼 줄어든다. 규칙 수 할당량은 인바운드와 아웃바운드에, 그리고 IPv4 규칙과 IPv6 규칙에 각각 따로 적용된다.

**접두사 목록은 실제 항목 수로 세지 않는다.** 보안 그룹 규칙이나 라우팅 테이블에서 고객 관리형 접두사 목록을 참조하면 그 목록에 정한 **최대 항목 수** 만큼, AWS 관리형 접두사 목록을 참조하면 그 목록의 **가중치(weight)** 만큼 규칙·경로 수를 차지한다. 고객 관리형 목록의 최대 항목을 넉넉히 잡아 두면 규칙 할당량을 금방 채운다.

**늘릴 때 성능 경고가 붙는 것.** 네트워크 ACL 규칙과 라우팅 테이블 경로는 늘릴 수 있지만 문서가 네트워크 성능에 영향이 있을 수 있다고 적는다. 네트워크 ACL 규칙이 모자라면 대역을 묶거나 보안 그룹으로 옮길 수 있는지 먼저 본다. 경로가 많으면 경로를 요약하거나 접두사 목록, 전송 게이트웨이로 정리한다.

**연결 장애로 나타날 때.** 사내 경로 일부만 닿지 않으면 라우팅 테이블당 전파 경로 한도를, 보안 그룹 규칙을 더하다 오류가 나면 규칙 수와 곱 제한을 먼저 확인한다. 할당량 초과는 설정 오류처럼 보이지만 규칙 자체는 맞는 경우가 많다.

@topic vpc/limits/sharing

| 항목 | 기본값 | 조정 |
|---|---|---|
| VPC당 서브넷을 공유받는 참여자 계정 | {{fact:vpc.quota.shared-participants}} | 가능 |
| 계정 하나가 공유받을 수 있는 서브넷 | {{fact:vpc.quota.subnets-shared-per-account}} | 가능 |

- 참여자 계정 수는 VPC 단위로, 그 VPC에서 공유한 모든 서브넷을 합쳐 센다.
- 참여자가 만든 인스턴스·인터페이스·보안 그룹은 참여자 계정의 할당량에 잡힌다.
- 공유받은 보안 그룹과 자기 보안 그룹을 한 인터페이스에 함께 붙이면, 인터페이스당 보안 그룹 수는 소유자와 참여자의 할당량 중 작은 값이 적용된다. 소유자 계정 할당량을 함께 확인한다.

@quiz

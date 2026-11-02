---
chapter: vpc/dns-dhcp
---

@topic vpc/dns-dhcp/amazon-dns

VPC 안의 인스턴스는 따로 DNS 서버를 세우지 않아도 이름을 풀 수 있다. AWS가 VPC마다 **Amazon DNS 서버** 를 주기 때문이다. 문서는 이것을 Route 53 Resolver, 또는 DHCP 옵션 값 이름 그대로 `AmazonProvidedDNS`라고도 부른다. Route 53 문서(개발자 안내서)에서는 최근 이름이 **Route 53 VPC Resolver** 로 바뀌었다. 같은 것이다.

리전의 가용 영역마다 들어 있고, 다음 세 주소로 닿는다.

| 주소 | 설명 |
|---|---|
| `169.254.169.253` | IPv4 링크 로컬 주소 |
| `fd00:ec2::253` | IPv6 링크 로컬 주소 |
| VPC 기본 IPv4 CIDR의 시작 + 2 | 예: `10.0.0.0/16`이면 `10.0.0.2` |

시작 + 2 주소가 서브넷마다 예약되는 이유가 이것이다({{ch:vpc/ip-addressing}}). 질의는 링크 로컬 경로로 Resolver에 사설로 전달되고 네트워크에 드러나지 않는다.

알아 둘 성질은 다음과 같다.

- **재귀 질의만 받는다.** 권한 있는 DNS 서버처럼 동작하지 않는다.
- **보안 그룹과 네트워크 ACL로 거를 수 없다.** Amazon DNS 서버로 가는 트래픽은 둘 다 평가하지 않는다({{ch:vpc/security-groups-nacl}}). 질의 내용을 걸러야 하면 Route 53 Resolver DNS Firewall을 쓴다({{ch:vpc/network-protection}}).
- **흐름 로그에 남지 않는다.** Amazon DNS 서버로 가는 질의는 흐름 로그가 기록하지 않는다. 직접 세운 DNS 서버로 가는 트래픽은 기록된다({{ch:vpc/flow-logs-monitoring}}).
- **풀어 주는 이름.** EC2가 붙여 주는 프라이빗·퍼블릭 DNS 호스트 이름, Route 53 프라이빗 호스팅 영역의 레코드, 그리고 인터넷의 공개 도메인이다.

**패킷 한도.** 네트워크 인터페이스 하나가 링크 로컬 서비스로 보낼 수 있는 패킷은 {{fact:vpc.dns.pps-per-eni}}다. 이 한도는 DNS만이 아니라 인스턴스 메타데이터(IMDS), Amazon Time Sync Service(NTP), Windows 라이선스 활성화 요청을 **합친** 값이고, 늘릴 수 없다. 넘으면 Resolver가 트래픽을 거부한다. 이름 풀이가 가끔 실패하는데 설정에는 문제가 없다면, DNS 질의 폭주나 메타데이터 조회가 이 한도에 닿았는지 의심해 본다.

**인스턴스 호스트 이름.** 인스턴스는 늘 프라이빗 IPv4 주소와 그에 맞는 프라이빗 DNS 호스트 이름을 받는다. 퍼블릭 IPv4 주소가 있고 아래 두 DNS 속성이 켜져 있으면 퍼블릭 DNS 호스트 이름도 받는다. 퍼블릭 DNS 이름은 VPC 밖에서 풀면 퍼블릭 주소로, VPC 안에서 풀면 프라이빗 주소로 답한다. 피어링 너머에서도 프라이빗 주소로 받으려면 피어링 연결의 DNS 확인을 켠다({{ch:vpc/peering}}).

@topic vpc/dns-dhcp/attributes

VPC에는 DNS 동작을 정하는 속성이 둘 있다.

| 속성 | 뜻과 기본값 |
|---|---|
| DNS 확인(`enableDnsSupport`) | Amazon DNS 서버로 이름 풀이를 할 수 있는지. 기본값은 켜짐 |
| DNS 호스트 이름(`enableDnsHostnames`) | 퍼블릭 IP가 있는 인스턴스에 퍼블릭 DNS 호스트 이름을 줄지. 기본 VPC만 켜짐, 직접 만든 VPC는 꺼짐 |

두 속성의 조합에 따라 결과가 갈린다.

- **둘 다 켜짐.** 퍼블릭 IP가 있는 인스턴스가 퍼블릭 DNS 호스트 이름을 받고, Amazon DNS 서버가 Amazon 제공 프라이빗 DNS 호스트 이름을 푼다. 이미 떠 있던 인스턴스도 나중에 켜면 이름을 받는다.
- **하나라도 꺼짐.** 퍼블릭 DNS 호스트 이름이 붙지 않고, Amazon 제공 프라이빗 호스트 이름도 풀리지 않는다. DHCP 옵션 세트에 사용자 지정 도메인 이름이 있으면 인스턴스는 그 도메인으로 된 호스트 이름을 받는다. 이때 이름 풀이는 직접 지정한 DNS 서버가 맡아야 한다.

**둘 다 켜야 하는 경우.** 다음 둘을 쓰려면 두 속성을 모두 `true`로 둔다. 시험과 운영에서 자주 걸리는 지점이다.

1. Route 53 **프라이빗 호스팅 영역(private hosted zone)** 에 정의한 사용자 지정 도메인 이름
2. 인터페이스 VPC 엔드포인트의 **프라이빗 DNS** ({{ch:vpc/endpoints-privatelink}})

**프라이빗 호스팅 영역.** `example.internal` 같은 내부 도메인의 레코드를 담는 그릇이다. 하나 이상의 VPC에 연결하고, 그 VPC 안에서만 풀린다. 인터넷에는 드러나지 않는다. VPN 너머처럼 VPC 밖에서 이 이름을 바로 풀 수는 없다. 온프레미스에서 풀려면 아래의 Resolver 인바운드 엔드포인트를 쓴다.

**오래된 VPC.** Resolver는 VPC CIDR이 RFC 1918 사설 범위 밖이어도 프라이빗 DNS 호스트 이름을 푼다. 다만 {{fact:vpc.dns.non-rfc1918-cutoff}} 이전에 만든 VPC는 그렇지 않고, 지원 센터에 요청해야 켜진다.

속성은 콘솔의 VPC 설정 편집이나 CLI `modify-vpc-attribute`로 바꾸고, `describe-vpc-attribute`로 확인한다.

@topic vpc/dns-dhcp/dhcp-options

VPC의 인스턴스는 **DHCP(Dynamic Host Configuration Protocol)** 로 IP 임대와 네트워크 설정을 받는다. 무엇을 나눠 줄지는 **DHCP 옵션 세트(DHCP option set)** 가 정한다.

**기본 DHCP 옵션 세트.** 리전마다 하나 있다. 따로 정하지 않은 VPC는 이것을 쓴다.

| 항목 | 기본 세트의 값 |
|---|---|
| 도메인 이름 서버 | 늘 `AmazonProvidedDNS` |
| 도메인 이름 | 리전의 EC2 내부 도메인 |
| IPv6 기본 설정 임대 시간 | {{fact:vpc.dhcp.ipv6-lease.default}} |
| NTP 서버, NetBIOS | 비어 있다. 인스턴스는 기본으로 Amazon Time Sync Service에서 시간을 받는다 |

**사용자 지정 옵션 세트.** 사내 DNS 서버, 사내 도메인 이름, NTP 서버, NetBIOS 설정을 넣어 만들 수 있다.

- 도메인 이름 서버는 {{fact:vpc.dhcp.dns-servers.max}}까지 넣는다. `AmazonProvidedDNS`와 사용자 지정 서버를 **섞으면 예상하지 못한 동작** 이 생길 수 있다고 문서는 경고한다.
- NTP 서버는 {{fact:vpc.dhcp.ntp-servers.max}}, NetBIOS 이름 서버는 {{fact:vpc.dhcp.netbios-servers.max}}까지다. NetBIOS 노드 유형은 2(P-node)를 권장한다. 브로드캐스트와 멀티캐스트는 지원하지 않는다.
- 도메인 이름은 직접 소유한 이름만 쓴다. 여러 도메인을 공백으로 나눠 넣으면 Windows와 일부 Linux는 이것을 한 덩어리로 읽는다. 그런 OS가 있으면 하나만 넣는다.
- 인터넷 게이트웨이가 있는 VPC에서는 도메인 이름 서버를 비우지 않는다. DNS가 없으면 인스턴스가 인터넷에도 나가지 못한다.

**운영 규칙.**

- **만든 뒤 고칠 수 없다.** 값을 바꾸려면 새 옵션 세트를 만들고 VPC에 연결한다.
- **VPC 하나에 옵션 세트 하나.** 한 옵션 세트를 여러 VPC가 같이 쓸 수는 있다.
- **재시작은 필요 없다.** 새 세트를 연결하면 기존 인스턴스도 DHCP 임대를 갱신할 때 새 값을 받는다. 몇 시간 걸릴 수 있고, 급하면 OS에서 임대를 직접 갱신한다.
- **옵션 세트를 아예 떼면** 그 VPC의 이름 풀이가 꺼진다. Nitro 기반 인스턴스는 그래도 `169.254.169.253`을 기본 DNS 서버로 받지만, Xen 기반 인스턴스는 DNS 서버가 없어 인터넷에도 나가지 못한다.
- **사용 중인 세트는 지울 수 없다.** 연결된 VPC를 먼저 다른 세트로 옮긴다.

**사용자 지정 DNS 서버의 함정.** Amazon EMR처럼 Hadoop을 쓰는 서비스는 인스턴스가 자기 FQDN을 풀 수 있어야 한다. 도메인 이름 서버를 사내 DNS로 바꾸면 이것이 깨질 수 있다. 사내 DNS에 `<리전>.compute.internal` 도메인을 Amazon DNS 서버로 넘기는 조건부 전달자를 둔다.

@topic vpc/dns-dhcp/hybrid-resolver

VPC와 사내 데이터 센터를 VPN이나 Direct Connect로 이으면({{ch:vpc/hybrid-vpn}}) 이름 풀이도 양쪽으로 이어야 한다. VPC의 인스턴스는 사내 도메인을, 사내 서버는 프라이빗 호스팅 영역의 이름을 풀어야 한다. 이때 Route 53 Resolver의 **엔드포인트(Resolver endpoint)** 와 **규칙(Resolver rule)** 을 쓴다.

| 구성 요소 | 방향과 역할 |
|---|---|
| 인바운드 엔드포인트(Inbound endpoint) | 사내망·다른 VPC → VPC. 사내 DNS 서버가 이 엔드포인트의 IP로 질의를 넘기면 Resolver가 프라이빗 호스팅 영역 등을 풀어 준다 |
| 아웃바운드 엔드포인트(Outbound endpoint) | VPC → 사내망·다른 VPC. 질의가 이 엔드포인트의 IP에서 출발해 사내 DNS 서버로 간다 |
| 전달 규칙(Forwarding rule) | 도메인 하나마다 하나. "이 도메인은 이 사내 DNS 서버 IP들로 넘긴다"를 정하고 VPC에 연결한다 |

동작 예시는 다음과 같다.

1. **VPC → 사내.** 인스턴스가 `corp.example.com`을 VPC + 2 주소에 묻는다. 이 도메인에 맞는 전달 규칙이 있으면 Resolver는 아웃바운드 엔드포인트를 거쳐 사내 DNS 서버로 넘긴다. 여러 규칙이 맞으면 가장 구체적인 도메인의 규칙을 쓴다.
2. **사내 → VPC.** 사내 DNS 서버에 "`aws.example.com`은 인바운드 엔드포인트 IP로 넘긴다"는 조건부 전달을 둔다. 질의가 VPN·Direct Connect를 건너 인바운드 엔드포인트에 닿으면 Resolver가 프라이빗 호스팅 영역을 보고 답한다.

설계할 때 지킬 점은 다음과 같다.

- **사내에서 VPC + 2 주소로 직접 넘기지 않는다.** 지원하지 않는 방식이고 결과가 불안정하다. 인바운드 엔드포인트를 쓴다.
- **엔드포인트 IP는 VPC의 프라이빗 주소다.** 엔드포인트에 지정한 IP마다 네트워크 인터페이스가 생긴다. 공인 주소가 아니므로 사내망과는 VPN이나 Direct Connect로 이어져 있어야 한다. 아웃바운드는 NAT 게이트웨이를 거쳐 나갈 수도 있다.
- **전달 대상은 모두 닿아야 한다.** Resolver는 규칙의 대상 IP 중 하나를 무작위로 고르고, 답이 없으면 다른 대상으로 다시 보낸다. 닿지 않는 대상이 섞여 있으면 이름 풀이가 늦어진다.
- **공유.** 규칙은 여러 계정에 공유할 수 있고, 아웃바운드 엔드포인트 하나를 같은 리전의 여러 VPC가 쓸 수 있다. 엔드포인트는 VPC 소유자만 만든다.

@quiz

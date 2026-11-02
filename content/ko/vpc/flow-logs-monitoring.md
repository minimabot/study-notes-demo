---
chapter: vpc/flow-logs-monitoring
---

@topic vpc/flow-logs-monitoring/basics

**VPC 흐름 로그(VPC Flow Logs)** 는 VPC의 네트워크 인터페이스를 드나드는 IP 트래픽 정보를 기록한다. 패킷 내용이 아니라 "누가, 어디로, 어떤 포트로, 얼마나, 허용됐는지"를 남긴다. 쓰임은 다음과 같다.

- 보안 그룹이 너무 막고 있는지 진단
- 인스턴스에 실제로 닿는 트래픽 확인
- 트래픽의 방향 확인

흐름 로그는 트래픽 경로 밖에서 수집한다. 그래서 만들거나 지워도 네트워크 처리량과 지연 시간에 영향이 없다.

**만들 때 정하는 세 가지.**

1. **대상 리소스.** VPC, 서브넷, 네트워크 인터페이스 중 하나다. VPC나 서브넷에 만들면 그 안의 모든 네트워크 인터페이스가 기록된다. 나중에 생긴 인스턴스의 인터페이스도 트래픽이 생기는 순간 포함된다. ELB, RDS, NAT 게이트웨이, 전송 게이트웨이처럼 다른 서비스가 만든 인터페이스도 대상이 된다.
2. **트래픽 유형.** 허용된 트래픽(ACCEPT), 거부된 트래픽(REJECT), 모두(ALL) 중에서 고른다.
3. **대상(destination).**

| 대상 | 특징 |
|---|---|
| CloudWatch Logs | 로그 그룹 안에 네트워크 인터페이스마다 로그 스트림이 생긴다. 흐름 로그 서비스가 맡을 IAM 역할이 필요하다. 지표 필터·경보와 바로 이어진다 |
| Amazon S3 | 기존 버킷에 로그 파일을 쌓는다. 버킷 정책이 전달을 허용해야 한다. 텍스트(기본) 또는 Parquet, Hive 호환 접두사, 시간 단위 파티션을 고를 수 있다. 파일은 {{fact:vpc.flowlogs.s3.file-interval}} 간격으로 올라간다. Athena로 SQL 질의를 한다 |
| Amazon Data Firehose | 전송 스트림으로 보낸다. 변환·압축을 거쳐 다른 분석 도구로 넘길 때 쓴다. 다른 계정으로도 보낼 수 있다 |

CloudWatch Logs로 보낼 때 역할에는 로그 그룹·스트림을 만들고 이벤트를 넣는 권한이 있어야 하고, 신뢰 정책의 주체는 `vpc-flow-logs.amazonaws.com`이어야 한다. 이것이 빠지면 상태에 `Access error`가 뜬다.

**제약.**

- **만든 뒤 설정을 바꿀 수 없다.** IAM 역할도, 레코드 형식도 그대로다. 필드를 더하려면 흐름 로그를 지우고 새로 만든다.
- **피어링된 VPC에는 만들 수 없다.** 상대 VPC가 내 계정에 있을 때만 된다.
- 리소스 하나에 계정당 흐름 로그 구독은 {{fact:vpc.flowlogs.subscriptions-per-resource}}까지다.
- 흐름 로그를 지워도 이미 쌓인 데이터는 남는다. 대상에서 따로 지운다.

**요금.** 흐름 로그 자체가 아니라 대상에 넣는 양에 따라 CloudWatch의 판매 로그(vended logs) 수집·보관 요금이 붙는다. 트래픽이 많은 VPC 전체를 ALL로 기록하면 양이 크게 늘어난다. 대상 리소스에 비용 할당 태그를 달면 흐름 로그 비용을 따로 볼 수 있다.

@topic vpc/flow-logs-monitoring/records

**흐름 로그 레코드(flow log record)** 한 줄은 집계 간격 동안 네트워크 인터페이스 하나에서 관찰한 흐름 하나다. 흐름은 출발지·목적지 주소, 출발지·목적지 포트, 프로토콜의 다섯 가지 값(5-tuple)으로 구분한다. 값은 공백으로 나뉜다.

**집계 간격(aggregation interval).** 한 흐름을 모아 레코드 하나로 만드는 기간이다. 기본 최대 간격은 {{fact:vpc.flowlogs.aggregation.default}}이고, 만들 때 {{fact:vpc.flowlogs.aggregation.short}}로 줄일 수 있다. 짧게 하면 레코드가 더 많이 생긴다. Nitro 기반 인스턴스는 설정과 관계없이 늘 {{fact:vpc.flowlogs.aggregation.short}} 이하로 집계된다.

집계가 끝난 뒤에도 전달에 시간이 든다. 보통 CloudWatch Logs는 {{fact:vpc.flowlogs.delivery.cwl}}, S3는 {{fact:vpc.flowlogs.delivery.s3}}가 걸리고, 최선 노력이라 더 늦을 수도 있다. 흐름 로그는 실시간 도구가 아니다. 갓 만든 흐름 로그는 로그 그룹이 생기고 데이터가 보이기까지 {{fact:vpc.flowlogs.setup-delay}} 걸리기도 한다. 로그 그룹은 기록할 트래픽이 생겨야 만들어진다.

**기본 형식(default format).** 버전 2 필드를 정해진 순서로 담는다. 바꿀 수 없다.

```
version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status
```

| 필드 | 읽는 법 |
|---|---|
| `protocol` | IANA 번호. 6은 TCP, 17은 UDP, 1은 ICMP |
| `action` | ACCEPT 또는 REJECT. REJECT는 보안 그룹이나 네트워크 ACL이 막았거나, 연결이 닫힌 뒤 패킷이 도착한 경우다 |
| `log-status` | OK(정상), NODATA(그 간격에 트래픽 없음), SKIPDATA(내부 용량 문제 등으로 일부 레코드를 건너뜀) |

**사용자 지정 형식(custom format).** 필요한 필드만 골라 순서를 정한다. 자주 쓰는 추가 필드는 다음과 같다.

| 필드 | 쓰임 |
|---|---|
| `vpc-id`, `subnet-id`, `instance-id` | 어느 리소스의 레코드인지 바로 보인다 |
| `tcp-flags` | SYN(2), SYN-ACK(18), FIN(1), RST(4)의 비트 합. 누가 연결을 열었는지 가린다 |
| `pkt-srcaddr`, `pkt-dstaddr` | 원래 패킷의 주소. NAT 게이트웨이처럼 중간 인터페이스를 거치면 `srcaddr`·`dstaddr`와 달라진다 |
| `flow-direction`, `traffic-path` | 인그레스·이그레스 방향, 나가는 트래픽이 지난 경로(인터넷 게이트웨이, 전송 게이트웨이 등) |
| `pkt-src-aws-service`, `pkt-dst-aws-service` | 상대 주소가 어느 AWS 서비스 대역인지 |

`dstaddr`에는 보조 IP로 온 트래픽도 인터페이스의 기본 프라이빗 IPv4 주소로 찍힌다. 원래 목적지가 필요하면 `pkt-dstaddr`를 넣는다.

**기록되지 않는 트래픽.** 다음은 흐름 로그에 나오지 않는다. 시험에 자주 나오는 목록이다.

- 인스턴스가 **Amazon DNS 서버** 로 보내는 트래픽 (직접 세운 DNS 서버로 가는 트래픽은 기록된다)
- 인스턴스 메타데이터 `169.254.169.254`, Amazon Time Sync Service `169.254.169.123`
- **DHCP**, **ARP**, 기본 VPC 라우터의 예약 주소로 가는 트래픽
- Windows 라이선스 활성화 트래픽
- 트래픽 미러링의 원본 트래픽 (미러링 대상 쪽 트래픽만 보인다)
- 엔드포인트 네트워크 인터페이스와 Network Load Balancer 인터페이스 사이 트래픽

@topic vpc/flow-logs-monitoring/reading

흐름 로그로 보안 그룹과 네트워크 ACL 중 어디서 막혔는지 가리려면 두 가지 성질을 쓴다({{ch:vpc/security-groups-nacl}}).

- **보안 그룹은 상태 저장(stateful)이다.** 들어온 요청이 허용되면 응답은 규칙과 관계없이 나간다.
- **네트워크 ACL은 상태 비저장(stateless)이다.** 응답도 규칙을 따로 통과해야 한다.

그래서 "요청은 ACCEPT인데 응답이 REJECT"라면 보안 그룹일 수 없다. 응답을 막을 수 있는 것은 네트워크 ACL뿐이다.

**예제.** 퍼블릭 서브넷의 웹 서버(네트워크 인터페이스 프라이빗 주소 `10.0.1.25`)에 대해 기본 형식으로 다음 세 줄이 기록됐다.

```
2 123456789012 eni-0a1b2c3d4e5f60718 198.51.100.20 10.0.1.25 50432 443 6 8 640 1730000000 1730000060 ACCEPT OK
2 123456789012 eni-0a1b2c3d4e5f60718 10.0.1.25 198.51.100.20 443 50432 6 8 4120 1730000000 1730000060 REJECT OK
2 123456789012 eni-0a1b2c3d4e5f60718 203.0.113.9 10.0.1.25 61001 22 6 3 180 1730000000 1730000060 REJECT OK
```

1. **첫째 줄.** `198.51.100.20`에서 TCP(6) 443으로 들어온 요청이 ACCEPT다. 인바운드 방향으로는 네트워크 ACL과 보안 그룹을 모두 통과했다.
2. **둘째 줄.** 같은 연결의 응답이다. 출발지 포트 443, 목적지 포트 50432(클라이언트의 임시 포트)로 나가다가 REJECT됐다. 보안 그룹은 상태 저장이라 허용된 요청의 응답을 막지 않는다. 따라서 **서브넷 네트워크 ACL의 아웃바운드 규칙** 이 임시 포트 범위를 열지 않은 것이다. 아웃바운드에 임시 포트 범위({{fact:vpc.ephemeral.linux}} 등 클라이언트에 맞게)를 허용하면 고쳐진다.
3. **셋째 줄.** `203.0.113.9`에서 SSH(22)로 들어온 요청이 REJECT이고, 짝이 되는 응답 줄이 없다. 요청이 인스턴스에 닿지 못했다는 뜻이다. 이 줄만으로는 보안 그룹인지 네트워크 ACL 인바운드인지 정할 수 없다. 네트워크 ACL 인바운드가 22를 허용하고 있다면 원인은 보안 그룹이다. 의도한 차단이라면 고칠 것이 없다.

정리하면 **REJECT 한 줄만 있으면 인바운드 단계(보안 그룹 또는 네트워크 ACL)**, **ACCEPT 뒤에 응답 REJECT가 따라오면 네트워크 ACL** 이다. 흐름 로그는 어느 규칙이 막았는지 직접 알려 주지 않는다. `reject-reason` 필드도 VPC 퍼블릭 액세스 차단(BPA)과 암호화 제어 때문에 거부된 경우만 표시한다.

**지표 필터와 경보.** CloudWatch Logs로 보낸 흐름 로그는 다른 로그처럼 지표 필터를 걸 수 있다. 예를 들어 다음 패턴은 TCP 22로 들어와 거부된 레코드를 센다.

```
[version, account, eni, source, destination, srcport, destport="22", protocol="6", packets, bytes, windowstart, windowend, action="REJECT", flowlogstatus]
```

지표 값을 1로 두고 합계(Sum) 통계로 경보를 만들면, 일정 시간 안에 거부된 SSH 시도가 기준을 넘을 때 SNS로 알림을 받는다. 콘솔에서 로그 그룹을 필터 표현식으로 검색할 수도 있다.

**Athena.** S3에 쌓은 흐름 로그는 Athena로 질의한다. 콘솔이나 CLI에서 CloudFormation 템플릿을 생성하면 테이블, 파티션 적재, 미리 만든 질의(가장 많이 통신한 리소스, 거부가 많은 IP 등)가 함께 만들어진다. 대량 로그를 오래 두고 분석하려면 Parquet 형식과 시간 단위 파티션이 질의 비용과 시간을 줄인다.

@topic vpc/flow-logs-monitoring/tools

흐름 로그는 이미 지나간 트래픽의 기록이다. 다른 질문에는 다른 도구가 맞다.

| 도구 | 답하는 질문 |
|---|---|
| VPC 흐름 로그 | 실제로 어떤 트래픽이 오갔고 허용·거부됐는가 |
| Reachability Analyzer | 지금 설정대로라면 A에서 B로 닿는가, 막는다면 어느 구성 요소인가 |
| Network Access Analyzer | 내 리소스에 의도하지 않은 네트워크 접근 경로가 있는가 |
| 트래픽 미러링(Traffic Mirroring) | 패킷 내용 자체를 봐야 하는가 |
| CloudTrail | 누가 언제 보안 그룹·라우팅 테이블 같은 설정을 바꿨는가 |

**Reachability Analyzer.** 원본과 대상을 정하고(예: 인터넷 게이트웨이 → EC2 인스턴스, TCP 22) 경로를 분석한다.

- **패킷을 보내지 않는다.** 네트워크 설정으로 모델을 만들어 따지는 정적 분석이다. 그래서 지연 시간이나 패킷 손실은 알 수 없다. 인스턴스 OS 방화벽이나 애플리케이션이 꺼져 있는 문제도 보이지 않는다.
- 닿으면 홉 단위 경로를 보여 주고, 닿지 않으면 막는 구성 요소(보안 그룹, 네트워크 ACL, 라우팅 테이블 등)를 알려 준다. 막는 요소가 더 있을 수 있으므로 고친 뒤 다시 돌린다.
- 원본·대상은 인스턴스, 인터넷 게이트웨이, 네트워크 인터페이스, 전송 게이트웨이와 그 연결, 가상 프라이빗 게이트웨이, VPC 엔드포인트와 엔드포인트 서비스, 피어링 연결이다. 대상에는 IP 주소도 쓸 수 있다.
- 원본과 대상은 같은 리전에 있어야 하고, 같은 VPC이거나 피어링·전송 게이트웨이로 이어진 VPC여야 한다. 같은 조직의 다른 계정이어도 된다.
- 분석 한 번마다 요금이 붙는다.

**Network Access Analyzer.** 원하는 접근 범위를 정해 두고, 그것을 벗어나는 네트워크 경로를 찾는다. 보안 상태를 점검하고 규정 준수를 보여 줄 때 쓴다.

**트래픽 미러링.** 인스턴스 네트워크 인터페이스의 트래픽을 복사해 보안·모니터링 장비로 보낸다. 원본(source), 필터(filter), 대상(target), 세션(session)으로 구성하고, 대상은 장비 인스턴스나 그 앞의 Network Load Balancer·Gateway Load Balancer다. 내용 검사나 위협 탐지처럼 흐름 로그의 요약 정보로는 부족할 때 쓴다. 지원 인스턴스 유형이 정해져 있다.

**CloudWatch 지표.** VPC 자체는 네트워크 주소 사용량(NAU) 지표를 보낸다. VPC마다 모니터링을 켜야 하고 {{fact:vpc.cw.nau-metric-interval}} 보고된다. 한도에 가까워지면 경보를 걸어 둔다({{ch:vpc/ip-addressing}}). NAT 게이트웨이 지표는 {{ch:vpc/nat}}, VPN 터널 지표는 {{ch:vpc/hybrid-vpn}}에서 다룬다. 전송 게이트웨이에도 별도의 흐름 로그가 있다({{ch:vpc/transit-gateway}}).

@quiz

@design

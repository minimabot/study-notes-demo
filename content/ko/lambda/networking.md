---
chapter: lambda/networking
---

@topic lambda/networking/vpc-attach

**기본 상태.** 모든 함수는 Lambda가 소유·관리하는 VPC 안에서 돈다. 이 VPC는 고객에게 보이지 않고, 인터넷과 AWS 서비스 공개 엔드포인트에 나갈 수 있다. 그래서 VPC 설정이 없는 함수는 인터넷에 바로 나간다. 대신 고객 VPC 안의 사설 리소스(RDS, ElastiCache, 사설 IP의 EC2)에는 닿지 못한다.

**고객 VPC에 연결하기.** 사설 리소스에 닿아야 하면 함수에 VPC 구성(`VpcConfig`: 서브넷 ID 목록, 보안 그룹 ID 목록)을 넣는다. 리소스가 있는 **프라이빗 서브넷** 을 고른다. 고가용성을 위해 가용 영역 여럿의 서브넷을 넣는 것이 보통이다. VPC 기본 개념은 {{ch:vpc/subnets-routing}}, 보안 그룹은 {{ch:vpc/security-groups-nacl}}에 있다.

- 함수의 보안 그룹은 나가는 트래픽을 정한다. 대상 리소스(예: DB) 보안 그룹의 인바운드에 함수의 보안 그룹을 허용한다.
- 전용 테넌시(dedicated tenancy) VPC에는 바로 연결할 수 없다.
- 연결을 풀려면 서브넷·보안 그룹 목록을 비워서 구성을 갱신한다.

**Hyperplane ENI.** 함수를 VPC에 연결하면 Lambda가 고객 서브넷에 **Hyperplane 탄력적 네트워크 인터페이스(ENI)** 를 만들고 관리한다. 함수 실행 환경은 이 ENI를 거쳐 VPC로 들어간다.

- ENI는 **서브넷과 보안 그룹의 조합** 마다 하나다. 같은 조합을 쓰는 같은 계정의 다른 함수는 그 ENI를 함께 쓴다. 문서는 함수들에 같은 서브넷·보안 그룹 조합을 주어 ENI를 나눠 쓰게 하라고 권한다.
- ENI 하나가 {{fact:lambda.vpc.hyperplane.connections}}을 처리하고, 넘으면 Lambda가 ENI를 늘린다. 실행 환경마다 ENI를 만들던 예전 방식과 달리, 동시성이 늘어도 ENI가 그만큼 늘지 않는다.
- 새 함수는 ENI가 준비될 때까지 **Pending** 상태라 호출할 수 없다. 몇 분 걸릴 수 있다. 기존 함수의 VPC 설정을 바꾸는 동안에는 이전 버전을 계속 호출할 수 있지만, 코드 갱신·버전 발행은 할 수 없다.
- 함수가 {{fact:lambda.vpc.eni.idle-reclaim}} 동안 호출되지 않으면 Lambda가 ENI를 회수하고 함수를 **Inactive** 로 바꾼다. 다음 호출은 실패하고, ENI를 다시 만드는 동안 Pending이 된다. 문서는 ENI가 계속 있다고 가정하고 설계하지 말라고 한다.
- VPC 구성을 지우면 ENI 삭제에 {{fact:lambda.vpc.eni.delete-max}} 걸린다. 다른 함수나 발행된 버전이 쓰고 있으면 지우지 않는다.

**필요한 권한.** Lambda는 실행 역할로 ENI를 만들고 지운다. AWS 관리형 정책 `AWSLambdaVPCAccessExecutionRole`에 `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DescribeSubnets`, `ec2:DeleteNetworkInterface`, `ec2:AssignPrivateIpAddresses`, `ec2:UnassignPrivateIpAddresses`가 들어 있다(리소스는 `*`).

- 이 권한은 ENI를 만들 때만 쓰고, 호출에는 쓰지 않는다.
- 그런데 실행 역할의 권한이라 함수 코드도 이 EC2 API를 부를 수 있게 된다. 문서는 `lambda:SourceFunctionArn` 조건을 건 Deny 문장으로 코드에서 나가는 EC2 호출만 막으라고 권한다({{ch:lambda/permissions}}).
- 실행 역할을 ENI 삭제 전에 지우면 Lambda가 ENI를 지우지 못한다. 그때는 직접 지운다.
- 함수를 VPC에 연결하는 사용자에게도 `ec2:DescribeSecurityGroups`, `ec2:DescribeSubnets`, `ec2:DescribeVpcs`, `ec2:GetSecurityGroupsForVpc` 권한이 있어야 한다.

@topic lambda/networking/internet-and-services

**VPC에 연결하면 나가는 트래픽이 모두 그 VPC를 지난다.** 그래서 VPC에 인터넷 경로가 없으면 함수도 인터넷과 AWS 서비스 공개 엔드포인트에 닿지 못한다. 증상은 오류보다 **제한 시간 초과** 로 먼저 나타나는 일이 많다.

**퍼블릭 서브넷에 연결해도 인터넷에 나가지 못한다.** 함수에 퍼블릭 IP가 생기지 않기 때문이다. 문서는 함수를 프라이빗 서브넷에 연결하고, 인터넷이 필요하면 다음처럼 구성하라고 한다.

| 구성 요소 | 하는 일 |
|---|---|
| 프라이빗 서브넷(함수) | 라우팅 테이블에서 `0.0.0.0/0`을 NAT 게이트웨이로 보낸다 |
| 퍼블릭 서브넷 | NAT 게이트웨이가 있다. 라우팅 테이블에서 `0.0.0.0/0`을 인터넷 게이트웨이로 보낸다 |
| IPv6(듀얼 스택) | 프라이빗 서브넷의 `::/0`을 송신 전용 인터넷 게이트웨이로 보낸다 |

NAT 게이트웨이는 퍼블릭 서브넷에 있지만, 그 경로는 프라이빗 서브넷 라우팅 테이블에 적는다는 점을 헷갈리지 않는다. NAT 게이트웨이의 구성·요금·고가용성은 {{ch:vpc/nat}}에서 다뤘다.

**인터넷 없이 AWS 서비스에 닿기.** 함수가 S3, DynamoDB, SQS, Secrets Manager 같은 AWS 서비스만 부르면 된다면 NAT 대신 **VPC 엔드포인트** 를 둔다. S3·DynamoDB는 게이트웨이 엔드포인트, 나머지 대부분은 인터페이스 엔드포인트(AWS PrivateLink)다. 트래픽이 인터넷으로 나가지 않고, 엔드포인트 정책으로 범위를 좁힐 수 있다. 종류와 요금 차이는 {{ch:vpc/endpoints-privatelink}}에 있다.

**이벤트 소스 매핑의 네트워크.** SQS·Kinesis·DynamoDB Streams 매핑은 Lambda가 함수 밖에서 폴링하므로, 함수를 VPC에 넣었다고 매핑이 끊기지 않는다. 반면 VPC 안의 MSK 클러스터를 읽는 매핑은 Lambda가 클러스터의 서브넷·보안 그룹으로 Hyperplane ENI를 만들어 폴링한다. 온디맨드 모드라면 클러스터 VPC에서 Lambda·STS로 가는 NAT 게이트웨이나 PrivateLink 엔드포인트도 있어야 한다. DocumentDB 매핑도 온디맨드 모드에서는 PrivateLink 엔드포인트가 필요하다. 프로비저닝된 모드는 이 연결을 Lambda가 처리한다({{ch:lambda/event-source-mappings}}).

@topic lambda/networking/ipv6

**IPv6 아웃바운드.** VPC에 연결된 함수는 듀얼 스택 서브넷의 리소스에 IPv6로 연결할 수 있다. 기본은 꺼져 있다. 콘솔에서 켜거나 `--vpc-config Ipv6AllowedForDualStack=true`로 켠다.

- 함수에 연결한 **모든 서브넷이 듀얼 스택** 이어야 한다(IPv4·IPv6 CIDR가 모두 있음).
- IPv6 전용 서브넷은 지원하지 않는다.
- VPC에 연결하지 않은 함수는 IPv6 아웃바운드 연결을 쓸 수 없다.
- IPv6로 인터넷에 나가려면 송신 전용 인터넷 게이트웨이 경로가 필요하다(위 표).

@topic lambda/networking/inbound-endpoints

**Lambda API용 인터페이스 VPC 엔드포인트.** 앞 절은 함수가 밖으로 나가는 길이었다. 이 절은 반대 방향이다. VPC 안의 EC2나 다른 함수가 `Invoke` 같은 Lambda API를 부를 때, 인터넷 게이트웨이나 NAT 없이 PrivateLink로 부른다.

- 서비스 이름 `com.amazonaws.<리전>.lambda`로 인터페이스 엔드포인트를 만든다. 서브넷마다 ENI가 생기고 그 사설 IP가 입구가 된다.
- **프라이빗 DNS** 를 켜면 기본 Lambda 엔드포인트 이름(`lambda.<리전>.amazonaws.com`)이 그대로 엔드포인트로 간다. 코드를 바꿀 필요가 없다. VPC의 `enableDnsHostnames`와 `enableDnsSupport`가 켜져 있어야 한다.
- **엔드포인트 정책** 으로 누가 어느 함수를 부를지 좁힌다. 함수 ARN은 버전 없는 것과 버전·별칭이 붙은 것을 함께 적어야 한다.
- Lambda 자체에는 추가 요금이 없고, PrivateLink 표준 요금(가용 영역별 시간 요금과 처리 데이터 요금)이 붙는다.
- 피어링한 다른 VPC의 리소스도 이 엔드포인트를 거쳐 Lambda API를 부를 수 있다.
- Lambda는 쉬고 있는 연결을 정리하므로, 지속 연결을 쓰려면 런타임의 keep-alive를 켠다.
- VPC 안에서 응답 스트리밍이 필요하면 함수 URL 대신 이 엔드포인트와 `InvokeWithResponseStream`을 쓴다({{ch:lambda/configuration}}).

@topic lambda/networking/pitfalls

**흔한 문제와 확인할 곳.**

| 증상 | 먼저 볼 것 |
|---|---|
| VPC 연결 뒤 외부 API·AWS 서비스 호출이 제한 시간 초과 | 프라이빗 서브넷의 NAT 경로, 또는 VPC 엔드포인트 |
| 네트워크 ACL을 쓰는 서브넷에서 연결이 가끔 끊김 | 임시 포트 범위 `1024`~`65535`를 TCP·UDP 모두 허용했는지 |
| `ENILimitReachedException` | VPC당 ENI 할당량 {{fact:lambda.vpc.eni-per-vpc}}. EFS 등 다른 서비스와 함께 쓴다. 서브넷·보안 그룹 조합을 줄이거나 증가를 요청한다 |
| Lambda가 만든 ENI의 보안 그룹을 바꾸려다 거부됨 | Lambda 관리 ENI는 직접 고칠 수 없다. 함수의 VPC 구성을 바꾼다 |
| `UNKNOWNHOSTEXCEPTION` | DNS 설정. 큰 응답 때문에 TCP DNS로 넘어가면 함수당 동시 연결 {{fact:lambda.vpc.dns-tcp.max}}에 걸릴 수 있다 |
| 오래 쉰 함수의 첫 호출 실패 | ENI가 회수되어 Inactive가 된 것이다. 다시 Pending을 거친다 |

- 서브넷의 남은 IP 주소도 확인한다. 주소가 모자라면 ENI를 만들지 못한다.
- `use1-az3`은 Lambda VPC 함수 용량이 제한된 가용 영역이라, 문서는 이 영역의 서브넷을 쓰지 말라고 한다.

**조직 규칙으로 강제하기.** `lambda:VpcIds`, `lambda:SubnetIds`, `lambda:SecurityGroupIds` 조건 키를 `CreateFunction`·`UpdateFunctionConfiguration`에 걸어, VPC에 연결된 함수만 만들게 하거나 특정 VPC·서브넷·보안 그룹만 쓰게 한다. VPC ID는 요청 값이 아니라 Lambda가 서브넷과 보안 그룹으로 알아낸다.

**DB 연결은 RDS Proxy로 묶는다.** 함수가 동시에 늘면 실행 환경마다 DB 연결을 연다. 문서는 운영 환경, 특히 짧은 연결을 자주 열고 닫는 함수에 Amazon RDS Proxy를 권한다. 프록시가 연결 풀을 관리해 DB 연결이 바닥나지 않게 한다. 함수는 DB가 있는 VPC에 연결해야 하고, 인증 정보는 Secrets Manager에 둔다. 예약된 동시성으로 상한을 함께 두는 설계는 {{ch:lambda/concurrency}}에 있다.

**다른 계정 VPC의 리소스.** 함수 계정의 VPC와 리소스 계정의 VPC를 피어링하고, 함수를 자기 계정 VPC에 연결한다({{ch:vpc/peering}}).

@quiz

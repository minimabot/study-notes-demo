---
chapter: vpc/labs
---

@topic vpc/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 구성을 AWS CLI로 직접 만들고 확인한다. 모든 예시는 서울 리전(`ap-northeast-2`)을 쓴다. 이름 태그는 `vpc-lab`으로 시작한다. 만드는 모양은 {{ch:vpc/design-patterns}}의 "서버는 프라이빗 서브넷에" 구성을 줄인 것이다.

> **경고: NAT 게이트웨이와 퍼블릭 IPv4 주소는 트래픽이 없어도 시간 단위로 요금이 붙는다.** NAT 게이트웨이는 {{fact:vpc.price.natgw-hour.apne2}}, NAT에 붙인 탄력적 IP는 {{fact:vpc.price.public-ipv4-hour}}(서울)다. 시험 인스턴스, CloudWatch Logs 수집, Reachability Analyzer 분석({{fact:vpc.price.reachability-analysis}})에도 요금이 붙는다. 실습을 한 번에 끝내고 마지막 정리 단계를 빼먹지 않는다. 요금은 {{ch:vpc/network-cost}}에 있다.

준비:

- [ ] AWS CLI 버전 2를 설치하고 `aws configure`로 자격 증명을 넣었다
- [ ] 실습용 IAM 사용자나 역할에 EC2·VPC, IAM 역할 생성, CloudWatch Logs 권한이 있다
- [ ] 리전의 VPC·탄력적 IP 할당량에 여유가 있다(기본 할당량은 VPC {{fact:vpc.quota.vpcs-per-region}}, 탄력적 IP {{fact:vpc.quota.eip-per-region}})
- [ ] 셸에서 리전을 고정했다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity      # 자격 증명 확인
# 앞의 두 가용 영역 이름을 변수에 담는다
read AZ1 AZ2 <<< $(aws ec2 describe-availability-zones \
  --query "AvailabilityZones[0:2].ZoneName" --output text)
echo $AZ1 $AZ2
```

알아 둘 점:

- 아래 명령은 앞 단계에서 받은 ID를 셸 변수에 담아 다음 단계에 넘긴다. 셸을 닫으면 변수가 사라지므로 한 셸에서 이어서 한다.
- CIDR, 이름, 포트는 모두 예시 값이다.
- 운영 환경은 영역마다 NAT 게이트웨이를 둔다. 실습에서는 비용을 줄이려고 **하나만** 만든다.

@topic vpc/labs/vpc-subnets

**목표:** VPC 하나, 두 영역에 퍼블릭 서브넷 {{raw:2개}}와 프라이빗 서브넷 {{raw:2개}}, 인터넷 게이트웨이와 퍼블릭 라우팅 테이블을 만든다.

```bash
# 1) VPC
VPC=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=vpc-lab}]' \
  --query Vpc.VpcId --output text)
aws ec2 wait vpc-available --vpc-ids $VPC
aws ec2 modify-vpc-attribute --vpc-id $VPC --enable-dns-hostnames

# 2) 서브넷 4개 (퍼블릭 2, 프라이빗 2)
mk() { aws ec2 create-subnet --vpc-id $VPC --cidr-block $1 --availability-zone $2 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$3}]" \
  --query Subnet.SubnetId --output text; }
PUB1=$(mk 10.0.0.0/24 $AZ1 vpc-lab-pub-1)
PUB2=$(mk 10.0.1.0/24 $AZ2 vpc-lab-pub-2)
PRI1=$(mk 10.0.10.0/24 $AZ1 vpc-lab-pri-1)
PRI2=$(mk 10.0.11.0/24 $AZ2 vpc-lab-pri-2)

# 3) 인터넷 게이트웨이 만들고 붙이기
IGW=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=vpc-lab-igw}]' \
  --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW --vpc-id $VPC

# 4) 퍼블릭 라우팅 테이블: 0.0.0.0/0 → IGW, 퍼블릭 서브넷 2개에 연결
RT_PUB=$(aws ec2 create-route-table --vpc-id $VPC \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=vpc-lab-rt-pub}]' \
  --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $RT_PUB --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW
aws ec2 associate-route-table --route-table-id $RT_PUB --subnet-id $PUB1
aws ec2 associate-route-table --route-table-id $RT_PUB --subnet-id $PUB2

# 5) 확인
aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC \
  --query "Subnets[].[Tags[?Key=='Name']|[0].Value,CidrBlock,AvailabilityZone,AvailableIpAddressCount]" --output table
aws ec2 describe-route-tables --route-table-ids $RT_PUB --query "RouteTables[0].Routes"
```

확인:

- [ ] 서브넷 {{raw:4개}}가 두 영역에 나뉘어 있다. `/24` 서브넷의 사용 가능 주소는 전체보다 {{fact:vpc.subnet.reserved-ips}}만큼 적다
- [ ] 퍼블릭 라우팅 테이블에 `10.0.0.0/16 → local`과 `0.0.0.0/0 → igw-...`가 있다. local 경로는 지우거나 바꿀 수 없다
- [ ] 프라이빗 서브넷은 아직 명시적으로 연결된 라우팅 테이블이 없어 **기본(main) 라우팅 테이블**을 쓴다. 기본 테이블에는 local 경로만 있다
- [ ] 퍼블릭 서브넷이 "퍼블릭"인 이유는 이름이 아니라 인터넷 게이트웨이로 가는 경로 때문이다({{ch:vpc/subnets-routing}})

@topic vpc/labs/nat-security

**목표:** 퍼블릭 서브넷에 NAT 게이트웨이를 만들고, 프라이빗 서브넷이 그쪽으로 나가게 한다. 서버용 보안 그룹을 만든다.

```bash
# 1) 탄력적 IP 할당 → NAT 게이트웨이 (영역 1의 퍼블릭 서브넷)
EIP=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=vpc-lab-nat-eip}]' \
  --query AllocationId --output text)
NAT=$(aws ec2 create-nat-gateway --subnet-id $PUB1 --allocation-id $EIP \
  --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=vpc-lab-nat}]' \
  --query NatGateway.NatGatewayId --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT   # 몇 분 걸린다

# 2) 프라이빗 라우팅 테이블: 0.0.0.0/0 → NAT, 프라이빗 서브넷 2개에 연결
RT_PRI=$(aws ec2 create-route-table --vpc-id $VPC \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=vpc-lab-rt-pri}]' \
  --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $RT_PRI --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT
aws ec2 associate-route-table --route-table-id $RT_PRI --subnet-id $PRI1
aws ec2 associate-route-table --route-table-id $RT_PRI --subnet-id $PRI2

# 3) 보안 그룹: 로드 밸런서 역할 SG와 서버 SG (SG 참조 사슬)
SG_LB=$(aws ec2 create-security-group --group-name vpc-lab-lb --description "lab lb" \
  --vpc-id $VPC --query GroupId --output text)
SG_APP=$(aws ec2 create-security-group --group-name vpc-lab-app --description "lab app" \
  --vpc-id $VPC --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_LB --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_APP --protocol tcp --port 80 --source-group $SG_LB
aws ec2 describe-security-groups --group-ids $SG_APP --query "SecurityGroups[0].IpPermissions"
```

확인:

- [ ] NAT 게이트웨이 상태가 `available`이고 퍼블릭 IP가 탄력적 IP와 같다
- [ ] 프라이빗 라우팅 테이블이 영역 1의 NAT 하나를 두 서브넷이 함께 쓴다. 영역 1이 멈추면 영역 2의 출구도 끊긴다. 운영이라면 영역 2에도 NAT와 라우팅 테이블을 따로 만든다({{ch:vpc/nat}})
- [ ] 서버 보안 그룹의 인바운드 출발지가 CIDR이 아니라 `vpc-lab-lb` 보안 그룹 ID다
- [ ] 보안 그룹에 아웃바운드 규칙을 따로 넣지 않았는데도 모든 아웃바운드가 허용돼 있다. 새 보안 그룹의 기본값이다({{ch:vpc/security-groups-nacl}})

@topic vpc/labs/endpoint-flowlogs

**목표:** S3 게이트웨이 엔드포인트를 붙이고, VPC 흐름 로그를 CloudWatch Logs로 보낸다. 선택으로 시험 인스턴스를 띄워 NAT 경로를 확인하고, Reachability Analyzer로 막힌 경로를 분석한다.

```bash
# 1) S3 게이트웨이 엔드포인트 → 프라이빗 라우팅 테이블에 연결
VPCE=$(aws ec2 create-vpc-endpoint --vpc-id $VPC \
  --service-name com.amazonaws.$AWS_REGION.s3 --route-table-ids $RT_PRI \
  --query VpcEndpoint.VpcEndpointId --output text)
aws ec2 describe-route-tables --route-table-ids $RT_PRI \
  --query "RouteTables[0].Routes[].[DestinationPrefixListId,DestinationCidrBlock,GatewayId,NatGatewayId]" --output table

# 2) 흐름 로그용 IAM 역할 (신뢰 주체: vpc-flow-logs.amazonaws.com)
cat > trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"vpc-flow-logs.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
cat > perm.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Resource":"*","Action":[
 "logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents",
 "logs:DescribeLogGroups","logs:DescribeLogStreams"]}]}
EOF
ROLE_ARN=$(aws iam create-role --role-name vpc-lab-flowlogs \
  --assume-role-policy-document file://trust.json --query Role.Arn --output text)
aws iam put-role-policy --role-name vpc-lab-flowlogs --policy-name flowlogs \
  --policy-document file://perm.json

# 3) 로그 그룹 + VPC 흐름 로그
aws logs create-log-group --log-group-name /vpc-lab/flow
FL=$(aws ec2 create-flow-logs --resource-type VPC --resource-ids $VPC \
  --traffic-type ALL --log-group-name /vpc-lab/flow \
  --deliver-logs-permission-arn $ROLE_ARN --query "FlowLogIds[0]" --output text)

# 4) (선택) 프라이빗 서브넷에 시험 인스턴스. 사용자 데이터가 NAT로 외부에 접속해 결과를 콘솔에 찍는다
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)
cat > ud.sh <<'EOF'
#!/bin/bash
echo "NAT_TEST $(curl -s -o /dev/null -w '%{http_code}' https://aws.amazon.com)" > /dev/console
EOF
INST=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --subnet-id $PRI1 --security-group-ids $SG_APP --user-data file://ud.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=vpc-lab-test}]' \
  --query "Instances[0].InstanceId" --output text)
aws ec2 wait instance-running --instance-ids $INST
# 몇 분 뒤
aws ec2 get-console-output --instance-id $INST --latest --output text | grep NAT_TEST
aws logs tail /vpc-lab/flow --since 15m | head -20

# 5) (선택) Reachability Analyzer: 인터넷 게이트웨이 → 시험 인스턴스 80번
NIP=$(aws ec2 create-network-insights-path --source $IGW --destination $INST \
  --protocol tcp --destination-port 80 --query NetworkInsightsPath.NetworkInsightsPathId --output text)
NIA=$(aws ec2 start-network-insights-analysis --network-insights-path-id $NIP \
  --query NetworkInsightsAnalysis.NetworkInsightsAnalysisId --output text)
sleep 60
aws ec2 describe-network-insights-analyses --network-insights-analysis-ids $NIA \
  --query "NetworkInsightsAnalyses[0].[Status,NetworkPathFound,Explanations[0].ExplanationCode]"
```

확인:

- [ ] 프라이빗 라우팅 테이블에 `pl-...`(S3 접두사 목록) → `vpce-...` 경로가 생겼다. 엔드포인트를 만들 때 라우팅 테이블을 지정하면 경로가 자동으로 들어간다. 이 경로가 `0.0.0.0/0 → NAT`보다 구체적이라 S3 트래픽은 NAT를 지나지 않는다({{ch:vpc/endpoints-privatelink}})
- [ ] 흐름 로그 상태가 `ACTIVE`다. 로그는 실시간이 아니라 집계 간격이 지난 뒤 들어온다. 처음 몇 분은 비어 있을 수 있다
- [ ] (선택) 콘솔 출력에 `NAT_TEST 200` 같은 줄이 있다. 프라이빗 서브넷의 인스턴스가 NAT를 거쳐 인터넷에 나갔다. 흐름 로그에서 인스턴스 사설 IP의 `ACCEPT` 기록을 찾는다
- [ ] (선택) 분석 결과 `NetworkPathFound`가 `false`다. 인스턴스가 프라이빗 서브넷에 있고 퍼블릭 IP도 없으므로 인터넷에서 닿을 수 없다. 설명 코드가 어느 구성 요소에서 막혔는지 알려 준다
- [ ] 흐름 로그 권한 오류가 나면 역할의 신뢰 주체와 권한 정책을 먼저 본다

@topic vpc/labs/cleanup

**목표:** 만든 것을 의존 관계의 역순으로 모두 지운다. 순서가 틀리면 `DependencyViolation` 오류가 난다.

```bash
# 1) 시험 인스턴스와 분석 기록
aws ec2 terminate-instances --instance-ids $INST
aws ec2 wait instance-terminated --instance-ids $INST
aws ec2 delete-network-insights-analysis --network-insights-analysis-id $NIA
aws ec2 delete-network-insights-path --network-insights-path-id $NIP

# 2) 흐름 로그, 로그 그룹, IAM 역할
aws ec2 delete-flow-logs --flow-log-ids $FL
aws logs delete-log-group --log-group-name /vpc-lab/flow
aws iam delete-role-policy --role-name vpc-lab-flowlogs --policy-name flowlogs
aws iam delete-role --role-name vpc-lab-flowlogs

# 3) S3 게이트웨이 엔드포인트
aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $VPCE

# 4) NAT 게이트웨이 → 지워질 때까지 기다린 뒤 탄력적 IP 해제
aws ec2 delete-nat-gateway --nat-gateway-id $NAT
aws ec2 wait nat-gateway-deleted --nat-gateway-ids $NAT
aws ec2 release-address --allocation-id $EIP

# 5) 보안 그룹 (참조하는 쪽 먼저)
aws ec2 delete-security-group --group-id $SG_APP
aws ec2 delete-security-group --group-id $SG_LB

# 6) 라우팅 테이블: 연결 해제 후 삭제
for RT in $RT_PUB $RT_PRI; do
  for A in $(aws ec2 describe-route-tables --route-table-ids $RT \
      --query "RouteTables[0].Associations[].RouteTableAssociationId" --output text); do
    aws ec2 disassociate-route-table --association-id $A
  done
  aws ec2 delete-route-table --route-table-id $RT
done

# 7) 인터넷 게이트웨이 분리·삭제 → 서브넷 → VPC
aws ec2 detach-internet-gateway --internet-gateway-id $IGW --vpc-id $VPC
aws ec2 delete-internet-gateway --internet-gateway-id $IGW
for S in $PUB1 $PUB2 $PRI1 $PRI2; do aws ec2 delete-subnet --subnet-id $S; done
aws ec2 delete-vpc --vpc-id $VPC
rm -f trust.json perm.json ud.sh
```

확인:

- [ ] `describe-nat-gateways`에서 NAT 게이트웨이 상태가 `deleted`다. NAT를 지운 뒤에도 탄력적 IP를 해제하지 않으면 유휴 퍼블릭 IPv4로 {{fact:vpc.price.public-ipv4-hour}}가 계속 붙는다
- [ ] `describe-addresses`에 `vpc-lab-nat-eip`가 없다
- [ ] 탄력적 IP를 NAT보다 먼저 해제하려 하면 아직 연결돼 있어 실패한다. NAT 삭제를 기다린 뒤 해제한다
- [ ] 기본(main) 라우팅 테이블, 기본 네트워크 ACL, 기본 보안 그룹은 따로 지우지 않는다. VPC와 함께 사라진다
- [ ] `describe-vpcs --vpc-ids $VPC`가 `InvalidVpcID.NotFound`를 돌려준다
- [ ] 셸 변수를 잃었다면 콘솔의 VPC 리소스 맵에서 `vpc-lab` 태그로 남은 리소스를 찾는다. 콘솔에서 VPC를 지우면 서브넷·라우팅 테이블·인터넷 게이트웨이 같은 하위 리소스를 함께 지워 준다. NAT 게이트웨이와 인스턴스는 먼저 지워야 한다

@quiz

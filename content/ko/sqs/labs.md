---
chapter: sqs/labs
---

@topic sqs/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 동작을 AWS CLI로 직접 확인한다. 모든 예시는 서울 리전(`ap-northeast-2`)을 쓴다.

> **경고: 실습이 끝나면 만든 리소스를 반드시 지운다.** 큐는 요청이 없으면 거의 비용이 들지 않지만, 실습 4의 VPC 엔드포인트와 EC2 인스턴스는 켜 두는 동안 계속 요금이 붙는다. 각 실습 끝의 정리 단계를 빼먹지 않는다.

준비:

- [ ] AWS CLI 버전 2를 설치하고 `aws configure`로 자격 증명을 넣었다
- [ ] 실습용 IAM 사용자나 역할에 SQS 권한이 있다 (실습 4는 CloudFormation·EC2·VPC 권한도 필요)
- [ ] 셸에서 리전을 고정했다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity      # 자격 증명 확인
```

알아 둘 점:

- 큐를 지우면 실제 삭제까지 {{fact:sqs.delete-queue.duration}}가 걸릴 수 있다. 같은 이름으로 다시 만들려면 {{fact:sqs.delete-queue.name-reuse-wait}} 기다린다.
- 큐 속성을 바꾸면 반영까지 {{fact:sqs.attributes.propagation}}가 걸릴 수 있다. 바꾼 직후 결과가 이상하면 조금 기다렸다가 다시 본다.

@topic sqs/labs/standard

**목표:** Standard 큐를 만들고, 긴 폴링으로 받고, 가시성 제한 시간 동안 메시지가 숨는 것을 본다.

```bash
# 1) 큐 만들기: 가시성 제한 시간을 일부러 짧게(10초), 긴 폴링 대기 20초
Q_URL=$(aws sqs create-queue --queue-name lab-std \
  --attributes VisibilityTimeout=10,ReceiveMessageWaitTimeSeconds=20 \
  --query QueueUrl --output text)
echo "$Q_URL"

# 2) 보내기
aws sqs send-message --queue-url "$Q_URL" --message-body 'hello-1'

# 3) 받기 (큐 속성 덕분에 긴 폴링으로 동작)
aws sqs receive-message --queue-url "$Q_URL" \
  --message-system-attribute-names ApproximateReceiveCount

# 4) 곧바로 한 번 더 받기 → 빈 응답 (메시지가 숨겨져 있다)
aws sqs receive-message --queue-url "$Q_URL" --wait-time-seconds 1

# 5) 10초 넘게 기다린 뒤 받기 → 같은 메시지가 다시 온다. ApproximateReceiveCount가 2
sleep 11
aws sqs receive-message --queue-url "$Q_URL" \
  --message-system-attribute-names ApproximateReceiveCount

# 6) 이번에 받은 ReceiptHandle로 지우기
aws sqs delete-message --queue-url "$Q_URL" --receipt-handle "<ReceiptHandle>"
```

확인할 것:

- [ ] 4단계에서 빈 응답이 오고, 응답이 바로 오지 않고 잠시 기다렸다 온다 (긴 폴링)
- [ ] 5단계의 `ReceiptHandle`이 3단계와 다르다. 지울 때는 **가장 최근에** 받은 핸들을 쓴다
- [ ] 6단계 뒤에는 기다려도 메시지가 다시 오지 않는다
- [ ] 받는 즉시 `change-message-visibility --visibility-timeout 0`을 부르면 바로 다시 보이는 것도 확인했다 (선택)

이 실습의 {{raw:10초}}는 관찰용으로 줄인 값이다. 큐 기본값은 {{fact:sqs.visibility.default}}다. 이유는 {{ch:sqs/visibility-timeout}}, 긴 폴링은 {{ch:sqs/polling}}에 있다.

정리:

- [ ] `aws sqs delete-queue --queue-url "$Q_URL"`

@topic sqs/labs/dlq

**목표:** 처리에 계속 실패하는 메시지가 데드레터 큐(DLQ)로 옮겨지는 것을 보고, 원래 큐로 되돌린다(재드라이브).

```bash
# 1) DLQ 만들고 ARN 얻기 (보관 기간 14일 = 1209600초)
DLQ_URL=$(aws sqs create-queue --queue-name lab-dlq \
  --attributes MessageRetentionPeriod=1209600 --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

# 2) 원본 큐: 3번 받고도 지우지 않으면 DLQ로
cat > attrs.json <<EOF
{ "VisibilityTimeout": "10",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"3\"}" }
EOF
Q_URL=$(aws sqs create-queue --queue-name lab-src \
  --attributes file://attrs.json --query QueueUrl --output text)

# 3) 보내기
aws sqs send-message --queue-url "$Q_URL" --message-body 'poison'

# 4) 받기만 하고 지우지 않기를 반복 (처리 실패 흉내)
for i in 1 2 3 4; do
  aws sqs receive-message --queue-url "$Q_URL" --wait-time-seconds 5 \
    --message-system-attribute-names ApproximateReceiveCount \
    --query 'Messages[0].Attributes'
  sleep 11
done

# 5) DLQ에 들어왔는지 확인
aws sqs get-queue-attributes --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages

# 6) 재드라이브: 목적지를 비우면 원래 큐로 돌아간다
aws sqs start-message-move-task --source-arn "$DLQ_ARN"
aws sqs list-message-move-tasks --source-arn "$DLQ_ARN"
```

확인할 것:

- [ ] 받은 횟수(`ApproximateReceiveCount`)가 최대 수신 횟수(`maxReceiveCount`, 여기서는 {{raw:3}})를 넘는 순간 원본 큐에서 사라진다. 4번째 받기에서는 빈 응답이 온다
- [ ] DLQ의 `ApproximateNumberOfMessages`가 1이 된다 (지표는 근삿값이라 조금 늦을 수 있다)
- [ ] 재드라이브 뒤 원본 큐에서 다시 받을 수 있다
- [ ] DLQ 보관 기간을 원본 큐보다 길게 잡은 이유를 설명할 수 있다 ({{ch:sqs/dlq}})

정리:

- [ ] `aws sqs delete-queue --queue-url "$Q_URL"`
- [ ] `aws sqs delete-queue --queue-url "$DLQ_URL"`
- [ ] `rm attrs.json`

@topic sqs/labs/fifo

**목표:** FIFO 큐에서 같은 메시지 그룹의 순서가 지켜지는 것과, 중복 제거가 되는 것을 본다. FIFO 큐 이름은 반드시 `.fifo`로 끝난다.

```bash
# 1) FIFO 큐 (콘텐츠 기반 중복 제거 켬)
F_URL=$(aws sqs create-queue --queue-name lab.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=10 \
  --query QueueUrl --output text)

# 2) 같은 그룹으로 세 건
for n in 1 2 3; do
  aws sqs send-message --queue-url "$F_URL" \
    --message-group-id order-42 --message-body "step-$n"
done

# 3) 한 건만 받고 지우지 않기 → 다시 받으면 step-2가 나오지 않는다
aws sqs receive-message --queue-url "$F_URL" --max-number-of-messages 1
aws sqs receive-message --queue-url "$F_URL" --max-number-of-messages 1 --wait-time-seconds 2

# 4) 같은 본문을 다시 보내기 → 중복 제거 기간 안이면 한 건만 남는다
aws sqs send-message --queue-url "$F_URL" --message-group-id dup-test --message-body same
aws sqs send-message --queue-url "$F_URL" --message-group-id dup-test --message-body same
```

확인할 것:

- [ ] 3단계 두 번째 받기에서 `order-42` 그룹의 다음 메시지가 나오지 않는다. 첫 메시지를 지우거나 가시성 제한 시간이 끝나야 나온다
- [ ] 4단계 두 응답의 `MessageId`가 같다. 중복 제거 기간은 {{fact:sqs.fifo.dedup.interval}}다
- [ ] 3단계 첫 메시지를 지운 뒤 `step-2`, `step-3`이 순서대로 나온다

자세한 규칙은 {{ch:sqs/fifo}}에 있다.

정리:

- [ ] `aws sqs delete-queue --queue-url "$F_URL"`

@topic sqs/labs/iac-vpc

**CloudFormation으로 큐 만들기.** 손으로 만든 큐는 설정이 흩어지기 쉽다. 템플릿으로 두면 같은 큐를 다시 만들고 한 번에 지울 수 있다. 아래는 원본 큐와 DLQ를 함께 만드는 YAML 템플릿이다.

```yaml
# queue.yaml
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  LabDlq:
    Type: AWS::SQS::Queue
    Properties:
      MessageRetentionPeriod: 1209600
  LabQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 30
      ReceiveMessageWaitTimeSeconds: 20
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt LabDlq.Arn
        maxReceiveCount: 5
Outputs:
  QueueUrl:
    Value: !Ref LabQueue          # AWS::SQS::Queue의 Ref는 큐 URL
  QueueArn:
    Value: !GetAtt LabQueue.Arn
```

```bash
aws cloudformation deploy --template-file queue.yaml --stack-name sqs-lab
aws cloudformation describe-stacks --stack-name sqs-lab --query 'Stacks[0].Outputs'
```

- [ ] 스택이 `CREATE_COMPLETE`가 되고, 출력에 큐 URL과 ARN이 보인다
- [ ] 큐 이름을 정하지 않으면 CloudFormation이 스택 이름을 넣어 이름을 만든다는 것을 확인했다
- [ ] FIFO 큐로 바꾸려면 `FifoQueue: true`를 넣고, 이름을 줄 때는 `.fifo`로 끝나게 한다
- [ ] 정리: `aws cloudformation delete-stack --stack-name sqs-lab` (스택에 든 큐가 함께 지워진다)

**VPC 안에서 인터넷 없이 보내기 (개요).** 인터넷으로 나가지 못하는 사설 서브넷의 EC2도 **인터페이스 VPC 엔드포인트(Interface VPC endpoint)** 를 두면 SQS에 메시지를 보낼 수 있다. 트래픽은 AWS 네트워크 안에 머문다. 큰 흐름만 적는다.

- [ ] 사설 서브넷에 EC2를 두고, 엔드포인트가 없을 때 `aws sqs send-message`가 실패하는 것을 먼저 본다
- [ ] VPC 엔드포인트를 만든다. 서비스 이름은 `com.amazonaws.ap-northeast-2.sqs`, 유형은 Interface, **프라이빗 DNS를 켠다**
- [ ] 엔드포인트의 보안 그룹이 EC2에서 오는 HTTPS를 허용한다. VPC 엔드포인트는 HTTPS 엔드포인트만 쓸 수 있다
- [ ] EC2에서 다시 보내 본다. 엔드포인트 주소는 `sqs.ap-northeast-2.amazonaws.com` 형식이어야 한다. `queue.amazonaws.com` 같은 예전 엔드포인트는 프라이빗 DNS가 지원하지 않는다
- [ ] 필요하면 엔드포인트 정책이나 큐 정책의 `aws:sourceVpce` 조건으로 이 엔드포인트를 거친 요청만 허용한다 ({{ch:sqs/security}})

```bash
aws ec2 create-vpc-endpoint --vpc-endpoint-type Interface \
  --vpc-id vpc-xxxx --subnet-ids subnet-xxxx --security-group-ids sg-xxxx \
  --service-name com.amazonaws.ap-northeast-2.sqs --private-dns-enabled

# EC2 안에서
aws sqs send-message --region ap-northeast-2 \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/123456789012/lab-queue \
  --message-body "hello from vpc"
```

> **경고:** VPC 엔드포인트와 EC2 인스턴스는 쓰지 않아도 켜져 있는 동안 요금이 붙는다. 실습이 끝나면 엔드포인트(`aws ec2 delete-vpc-endpoints`), EC2 인스턴스, 실습용 VPC 스택, 키 페어를 모두 지운다.

**더 해 볼 과제:**

- [ ] {{ch:sqs/api-sdk}}의 Java 소비 루프를 실습 1의 큐에 붙여 실행한다
- [ ] Lambda 함수에 SQS 트리거를 걸고 부분 배치 응답(`ReportBatchItemFailures`)을 켠 뒤, 일부 메시지만 일부러 실패시켜 어떤 메시지가 다시 오는지 본다 ({{ch:sqs/integrations}})

@quiz

---
chapter: lambda/labs
---

@topic lambda/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 호출 방식, 동시성, 버전과 별칭, SQS 트리거를 AWS CLI로 직접 만들고 확인한다. 모든 예시는 서울 리전(`ap-northeast-2`)을 쓴다. 이름은 `lambda-lab`으로 시작한다.

> **요금:** 이 실습의 호출 수는 무료 등급({{fact:lambda.free.requests}}, {{fact:lambda.free.gbs}}) 안에 들어갈 만큼 작다. 그래도 CloudWatch Logs 저장과 SQS 요청은 따로 계산된다. 마지막 정리 단계를 빼먹지 않는다. 요금은 {{ch:lambda/cost}}에 있다.

준비:

- [ ] AWS CLI 버전 2를 설치하고 `aws configure`로 자격 증명을 넣었다
- [ ] 실습용 IAM 사용자나 역할에 Lambda, IAM 역할 생성, SQS, CloudWatch Logs 권한이 있다
- [ ] `zip`과 `jq`가 설치되어 있다
- [ ] 셸에서 리전을 고정했다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
mkdir -p ~/lambda-lab && cd ~/lambda-lab
```

**1) 실행 역할.** 함수가 맡을 역할을 만든다. 신뢰 정책은 Lambda 서비스만 이 역할을 맡게 한다. 로그 쓰기용 관리형 정책과, 뒤에서 쓸 SQS 읽기용 관리형 정책을 붙인다.

```bash
cat > trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
aws iam create-role --role-name lambda-lab-role \
  --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name lambda-lab-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam attach-role-policy --role-name lambda-lab-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole
ROLE_ARN=arn:aws:iam::$ACCOUNT:role/lambda-lab-role
sleep 10   # 새 역할이 전파될 때까지 잠시 기다린다
```

역할을 만든 직후 함수를 만들면 "역할을 맡을 수 없다"는 오류가 날 수 있다. IAM 변경이 퍼지는 데 시간이 걸리기 때문이다. 잠시 뒤 다시 하면 된다. 실행 역할은 {{ch:lambda/permissions}}에 있다.

**2) 함수 만들기(.zip).** 이벤트에 따라 세 가지로 동작하는 Python 함수 하나를 쓴다. `sleep`이 있으면 그만큼 기다리고, SQS 레코드가 오면 부분 배치 응답을 돌려준다. 응답에는 실행된 버전을 넣는다.

```bash
cat > app.py <<'EOF'
import json, os, time

def handler(event, context):
    if "Records" in event:                       # SQS 배치
        failures = []
        for r in event["Records"]:
            print("got", r["messageId"], r["body"])
            if "fail" in r["body"]:
                failures.append({"itemIdentifier": r["messageId"]})
        return {"batchItemFailures": failures}
    time.sleep(event.get("sleep", 0))            # 동시성 실험용
    print("event:", json.dumps(event))
    return {"version": os.environ["AWS_LAMBDA_FUNCTION_VERSION"], "msg": event.get("msg", "hi")}
EOF
zip -q fn.zip app.py
aws lambda create-function --function-name lambda-lab-fn \
  --runtime python3.13 --architectures arm64 \
  --handler app.handler --zip-file fileb://fn.zip \
  --role $ROLE_ARN --memory-size 128 --timeout 10
aws lambda wait function-active-v2 --function-name lambda-lab-fn
```

- [ ] `get-function-configuration`에서 `State`가 `Active`다
- [ ] 메모리는 최솟값({{fact:lambda.memory.min}}), 제한 시간은 기본값({{fact:lambda.timeout.default}}) 대신 실습용 값을 줬다

@topic lambda/labs/invoke-logs

**목표:** 같은 함수를 동기와 비동기로 불러 응답 차이를 보고, 로그에서 과금 정보를 읽는다. 호출 방식은 {{ch:lambda/invocation}}, 비동기 처리는 {{ch:lambda/async-invocation}}에 있다.

```bash
# 동기 호출(RequestResponse): 결과를 기다려 받는다
aws lambda invoke --function-name lambda-lab-fn \
  --cli-binary-format raw-in-base64-out \
  --payload '{"msg":"sync"}' --log-type Tail out.json \
  --query '{Status:StatusCode,Ver:ExecutedVersion,Log:LogResult}' --output json \
  | tee r.json
cat out.json; echo
jq -r .Log r.json | base64 --decode        # 마지막 로그 4 KB

# 비동기 호출(Event): 큐에 넣고 바로 돌아온다
aws lambda invoke --function-name lambda-lab-fn \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event --payload '{"msg":"async"}' out2.json
cat out2.json; echo                         # 비어 있다

# 로그 보기
aws logs tail /aws/lambda/lambda-lab-fn --since 10m
```

확인:

- [ ] 동기 호출은 `StatusCode` 200과 함수 반환값을 받았다. `ExecutedVersion`은 `$LATEST`다
- [ ] 비동기 호출은 `StatusCode` 202를 받았고 출력 파일이 비어 있다. 결과는 로그에서만 보인다
- [ ] 로그의 `REPORT` 줄에서 `Duration`, `Billed Duration`, `Memory Size`, `Max Memory Used`를 찾았다
- [ ] `--cli-binary-format raw-in-base64-out`을 빼면 CLI 버전 2가 페이로드를 base64로 보고 오류를 낸다는 것을 알았다

`Billed Duration`과 `Memory Size`를 곱한 값이 이 호출의 GB-초다. 메모리를 바꿔 같은 호출을 해 보면 {{ch:lambda/cost}}의 메모리와 실행 시간 맞바꿈을 직접 볼 수 있다.

비동기 호출이 함수 오류로 실패하면 Lambda가 최대 {{fact:lambda.async.retries.max}} 다시 시도한다. 스로틀로 처리하지 못한 이벤트는 최대 {{fact:lambda.async.event-age.max}} 동안 큐에 남아 재시도된다.

@topic lambda/labs/concurrency

**목표:** 예약된 동시성(Reserved concurrency)을 작게 걸어 스로틀링을 일부러 일으킨다. 개념은 {{ch:lambda/concurrency}}에 있다.

AWS CLI는 기본 재시도 모드에서 스로틀 오류를 받으면 스스로 다시 시도한다(최대 {{fact:lambda.lab.cli.max-attempts.default}}). 그래서 스로틀이 잘 안 보인다. 실습에서는 재시도를 끈다.

```bash
aws lambda put-function-concurrency --function-name lambda-lab-fn \
  --reserved-concurrent-executions 1

export AWS_MAX_ATTEMPTS=1           # CLI 자동 재시도 끄기
for i in 1 2 3 4 5; do
  aws lambda invoke --function-name lambda-lab-fn \
    --cli-binary-format raw-in-base64-out \
    --payload '{"sleep":5}' /dev/null --query StatusCode 2>&1 | tail -1 &
done; wait
unset AWS_MAX_ATTEMPTS

# 1분쯤 뒤 Throttles 지표 확인
aws cloudwatch get-metric-statistics --namespace AWS/Lambda \
  --metric-name Throttles --dimensions Name=FunctionName,Value=lambda-lab-fn \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '-15 min' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 60 --statistics Sum
```

확인:

- [ ] 동시에 보낸 다섯 호출 중 하나만 200을 받고, 나머지는 `TooManyRequestsException`(HTTP 429, `Reason: ReservedFunctionConcurrentInvocationLimitExceeded`)으로 실패했다
- [ ] `Throttles` 지표에 실패한 수만큼 값이 찍혔다

```bash
# 0으로 두면 함수가 전혀 실행되지 않는다(긴급 차단 스위치)
aws lambda put-function-concurrency --function-name lambda-lab-fn \
  --reserved-concurrent-executions 0
aws lambda invoke --function-name lambda-lab-fn /dev/null   # 스로틀
aws lambda delete-function-concurrency --function-name lambda-lab-fn
```

- [ ] 예약을 지운 뒤에는 함수가 예약하지 않은 풀을 다시 쓴다

@topic lambda/labs/versions-alias

**목표:** 버전을 두 개 게시하고, 별칭으로 트래픽을 나눠 보낸다. 개념은 {{ch:lambda/versions-aliases}}에 있다.

```bash
V1=$(aws lambda publish-version --function-name lambda-lab-fn \
  --description v1 --query Version --output text)

# 코드를 조금 바꿔 두 번째 버전을 만든다
sed -i.bak 's/"hi"/"hi-v2"/' app.py && zip -q fn.zip app.py
aws lambda update-function-code --function-name lambda-lab-fn --zip-file fileb://fn.zip
aws lambda wait function-updated-v2 --function-name lambda-lab-fn
V2=$(aws lambda publish-version --function-name lambda-lab-fn \
  --description v2 --query Version --output text)
echo $V1 $V2

# live 별칭: 기본은 V1, V2에 20%
aws lambda create-alias --function-name lambda-lab-fn --name live \
  --function-version $V1 \
  --routing-config "AdditionalVersionWeights={\"$V2\"=0.2}"

for i in $(seq 1 20); do
  aws lambda invoke --function-name lambda-lab-fn:live /dev/null \
    --query ExecutedVersion --output text
done | sort | uniq -c
```

확인:

- [ ] 별칭 호출 결과가 두 버전으로 나뉘었다. 횟수는 호출이 적어 정확히 맞지 않는다
- [ ] 응답의 `ExecutedVersion`으로 실제로 실행된 버전을 알 수 있다
- [ ] 가중치 라우팅은 버전을 최대 {{fact:lambda.alias.routing.max-versions}}까지만 나눈다는 것을 알았다

```bash
# 문제가 없으면 V2로 완전히 옮긴다
aws lambda update-alias --function-name lambda-lab-fn --name live \
  --function-version $V2 --routing-config 'AdditionalVersionWeights={}'
aws lambda invoke --function-name lambda-lab-fn:live out.json && cat out.json
```

운영에서는 이 전환을 CodeDeploy의 카나리·선형 배포로 자동화하고, 경보가 울리면 되돌린다.

@topic lambda/labs/sqs-cleanup

**목표:** SQS 큐를 트리거로 붙이고, 부분 배치 응답으로 실패한 메시지만 다시 받게 한다. 그다음 모두 정리한다. 개념은 {{ch:lambda/event-source-mappings}}에 있다.

큐의 가시성 제한 시간은 함수 제한 시간의 {{fact:lambda.sqs.vt-multiplier}} 이상으로 둔다. 아래에서 함수 제한 시간이 `10`초이므로 `60`초를 준다. 실패를 반복하는 메시지는 DLQ로 보낸다.

```bash
DLQ_URL=$(aws sqs create-queue --queue-name lambda-lab-dlq --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url $DLQ_URL \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
cat > q.json <<EOF
{"VisibilityTimeout":"60",
 "RedrivePolicy":"{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"3\"}"}
EOF
Q_URL=$(aws sqs create-queue --queue-name lambda-lab-q --attributes file://q.json \
  --query QueueUrl --output text)
Q_ARN=$(aws sqs get-queue-attributes --queue-url $Q_URL \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

# live 별칭에 트리거를 붙이고 부분 배치 응답을 켠다
ESM=$(aws lambda create-event-source-mapping --function-name lambda-lab-fn:live \
  --event-source-arn $Q_ARN --batch-size 10 \
  --function-response-types ReportBatchItemFailures --query UUID --output text)

for b in ok-1 ok-2 fail-3 ok-4; do
  aws sqs send-message --queue-url $Q_URL --message-body $b > /dev/null
done
sleep 30; aws logs tail /aws/lambda/lambda-lab-fn --since 5m | grep got
```

확인:

- [ ] `ok-*` 메시지는 한 번 처리되고 큐에서 지워졌다
- [ ] `fail-3`만 가시성 제한 시간이 지날 때마다 다시 처리됐고, 세 번 받은 뒤 DLQ로 옮겨졌다(몇 분 걸린다)
- [ ] `--function-response-types`를 주지 않으면 Lambda가 `batchItemFailures`를 무시하고 배치 전체를 성공으로 처리한다는 것을 알았다

```bash
aws sqs receive-message --queue-url $DLQ_URL --query 'Messages[].Body'
```

**정리.** 만든 순서의 반대로 지운다.

```bash
aws lambda delete-event-source-mapping --uuid $ESM
aws lambda delete-function --function-name lambda-lab-fn   # 버전·별칭도 함께 지워진다
aws sqs delete-queue --queue-url $Q_URL
aws sqs delete-queue --queue-url $DLQ_URL
aws logs delete-log-group --log-group-name /aws/lambda/lambda-lab-fn
for p in service-role/AWSLambdaBasicExecutionRole service-role/AWSLambdaSQSQueueExecutionRole; do
  aws iam detach-role-policy --role-name lambda-lab-role --policy-arn arn:aws:iam::aws:policy/$p
done
aws iam delete-role --role-name lambda-lab-role
```

- [ ] `aws lambda list-functions`에 `lambda-lab-fn`이 없다
- [ ] `aws sqs list-queues --queue-name-prefix lambda-lab`가 비어 있다
- [ ] 로그 그룹과 IAM 역할이 지워졌다

함수를 지워도 로그 그룹은 남는다. 로그 그룹을 따로 지우지 않으면 저장 요금이 계속 붙는다.

@quiz

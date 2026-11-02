---
chapter: kinesis/labs
---

@topic kinesis/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 동작을 AWS CLI로 직접 확인한다. 모든 예시는 서울 리전(`ap-northeast-2`)을 쓴다. 스트림 이름은 `kds-lab`이다.

> **경고: 스트림은 데이터를 넣지 않아도 시간 단위로 요금이 붙는다.** 프로비저닝 모드는 열린 샤드마다 샤드 시간({{fact:kinesis.price.shard-hour.apne2}}, 서울)을, 온디맨드 표준 모드는 스트림마다 스트림 시간({{fact:kinesis.price.od.stream-hour.apne2}}, 서울)을 낸다. 실습을 한 번에 끝내고 마지막 정리 단계를 빼먹지 않는다. 요금은 {{ch:kinesis/cost}}에 있다.

준비:

- [ ] AWS CLI 버전 2를 설치하고 `aws configure`로 자격 증명을 넣었다
- [ ] 실습용 IAM 사용자나 역할에 Kinesis 권한이 있다. Lambda 실습에는 IAM 역할 생성, Lambda 함수 생성 권한도 필요하다
- [ ] 셸에서 리전을 고정했다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity      # 자격 증명 확인
```

알아 둘 점:

- 스트림 만들기, 샤드 수 바꾸기, 암호화 켜기, 모드 바꾸기는 비동기다. 상태가 `ACTIVE`로 돌아올 때까지 기다린 뒤 다음 단계로 간다.
- CLI 버전 2는 `--data` 같은 바이너리 값을 기본으로 base64 문자열로 해석한다. 평문을 그대로 넣으려면 `--cli-binary-format raw-in-base64-out`을 붙인다.
- 아래 숫자와 이름은 모두 예시 값이다.

@topic kinesis/labs/basics

**목표:** 샤드 하나짜리 프로비저닝 스트림을 만들고, 레코드를 쓰고, 샤드 이터레이터로 읽는다.

```bash
# 1) 프로비저닝 스트림 만들기 (샤드 1개)
aws kinesis create-stream --stream-name kds-lab --shard-count 1 \
  --stream-mode-details StreamMode=PROVISIONED
aws kinesis wait stream-exists --stream-name kds-lab
aws kinesis describe-stream-summary --stream-name kds-lab \
  --query "StreamDescriptionSummary.[StreamStatus,StreamModeDetails.StreamMode,OpenShardCount,RetentionPeriodHours,EncryptionType]"

# 2) 레코드 한 건 쓰기
aws kinesis put-record --stream-name kds-lab --partition-key user-1 \
  --data '{"event":"click","n":1}' --cli-binary-format raw-in-base64-out

# 3) 여러 건 한 번에 쓰기 (PutRecords)
aws kinesis put-records --stream-name kds-lab --cli-binary-format raw-in-base64-out \
  --records Data='{"event":"view","n":2}',PartitionKey=user-2 \
            Data='{"event":"view","n":3}',PartitionKey=user-3

# 4) 샤드 이터레이터를 받아 처음부터 읽기
SHARD_ID=$(aws kinesis list-shards --stream-name kds-lab \
  --query "Shards[0].ShardId" --output text)
ITER=$(aws kinesis get-shard-iterator --stream-name kds-lab --shard-id "$SHARD_ID" \
  --shard-iterator-type TRIM_HORIZON --query "ShardIterator" --output text)
aws kinesis get-records --shard-iterator "$ITER"

# 5) Data는 base64로 나온다. 첫 레코드를 풀어 본다
aws kinesis get-records --shard-iterator "$ITER" \
  --query "Records[0].Data" --output text | base64 --decode; echo
```

확인할 것:

- [ ] 1단계 결과가 `ACTIVE`, `PROVISIONED`, 샤드 {{raw:1개}}, 기본 보존 기간({{fact:kinesis.retention.default}}), `NONE`이다
- [ ] 2단계 응답에 `ShardId`와 `SequenceNumber`가 있다
- [ ] 3단계 응답의 `FailedRecordCount`가 0이다. 0이 아니면 `Records` 안에서 `ErrorCode`가 있는 항목만 다시 보내야 한다. PutRecords는 일부만 실패할 수 있다
- [ ] 4단계 응답의 `Records`에 세 건이 같은 샤드에서 쓴 순서대로 나온다. 빈 결과가 나오면 `NextShardIterator`로 다시 부른다. 레코드가 있어도 한 번에 다 오지 않을 수 있다
- [ ] 응답에 `NextShardIterator`와 `MillisBehindLatest`가 있다. 읽을 것을 다 따라잡으면 `MillisBehindLatest`가 0이 된다
- [ ] 이터레이터를 받고 {{fact:kinesis.iterator.expiry}}이 지나 다시 쓰면 `ExpiredIteratorException`이 난다. 새로 받는다

PutRecords 한 번에 넣을 수 있는 레코드는 {{fact:kinesis.putrecords.max-records}}이다. 이터레이터 종류(`TRIM_HORIZON`, `LATEST`, `AT_SEQUENCE_NUMBER` 등)와 파티션 키는 {{ch:kinesis/key-concepts}}에 있다.

@topic kinesis/labs/resize-encrypt

**목표:** 샤드 수를 늘리고, 서버 측 암호화(SSE)를 켠다.

```bash
# 1) 샤드 수를 1개에서 2개로 (균등 분할)
aws kinesis update-shard-count --stream-name kds-lab \
  --target-shard-count 2 --scaling-type UNIFORM_SCALING
aws kinesis describe-stream-summary --stream-name kds-lab \
  --query "StreamDescriptionSummary.[StreamStatus,OpenShardCount]"
# UPDATING이면 잠시 뒤 다시 확인한다
aws kinesis list-shards --stream-name kds-lab \
  --query "Shards[].[ShardId,ParentShardId,SequenceNumberRange.EndingSequenceNumber]" --output table

# 2) AWS 관리형 키(aws/kinesis)로 서버 측 암호화 켜기
aws kinesis start-stream-encryption --stream-name kds-lab \
  --encryption-type KMS --key-id alias/aws/kinesis
aws kinesis describe-stream-summary --stream-name kds-lab \
  --query "StreamDescriptionSummary.[StreamStatus,EncryptionType,KeyId]"

# 3) 암호화 뒤에도 쓰기·읽기는 그대로다
aws kinesis put-record --stream-name kds-lab --partition-key user-9 \
  --data '{"event":"after-sse"}' --cli-binary-format raw-in-base64-out
```

확인할 것:

- [ ] 1단계가 끝나면 열린 샤드가 {{raw:2개}}다. `list-shards`에 원래 샤드(부모)도 보이는데, 끝 시퀀스 번호가 있어 닫힌 샤드다. 닫힌 샤드의 데이터는 보존 기간 동안 읽을 수 있다
- [ ] `update-shard-count`는 한 번에 {{fact:kinesis.usc.scale-up-max}}까지만 늘릴 수 있고, 줄일 때는 {{fact:kinesis.usc.scale-down-min}}까지다. 호출 횟수에도 한도({{fact:kinesis.usc.daily-max}})가 있다
- [ ] 2단계 뒤 `EncryptionType`이 `KMS`다. 암호화는 켠 뒤 들어오는 레코드부터 적용된다
- [ ] 3단계 쓰기가 성공한다. 고객 관리형 키를 쓰면 생산자·소비자에 그 키의 KMS 권한이 따로 필요하다

샤드를 나누고 합치는 동작은 {{ch:kinesis/resharding}}에 있다.

@topic kinesis/labs/lambda

**목표:** Lambda 함수를 스트림의 소비자로 붙이고, 레코드가 함수로 들어오는지 확인한다. 함수는 간단히 레코드를 로그로 찍기만 한다.

```bash
# 1) 실행 역할: Kinesis 읽기와 로그 쓰기 권한이 든 관리형 정책을 붙인다
aws iam create-role --role-name kds-lab-lambda-role --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name kds-lab-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole
ROLE_ARN=$(aws iam get-role --role-name kds-lab-lambda-role --query "Role.Arn" --output text)

# 2) 함수: 받은 레코드의 data(base64)를 풀어 출력한다
cat > app.py <<'EOF'
import base64
def handler(event, context):
    for r in event["Records"]:
        print(r["kinesis"]["partitionKey"], base64.b64decode(r["kinesis"]["data"]).decode())
EOF
zip function.zip app.py
sleep 10   # 새 역할이 퍼질 때까지 잠시 기다린다
aws lambda create-function --function-name kds-lab-fn --runtime python3.13 \
  --handler app.handler --role "$ROLE_ARN" --zip-file fileb://function.zip

# 3) 이벤트 소스 매핑: 스트림 처음부터 100건씩 읽는다
STREAM_ARN=$(aws kinesis describe-stream-summary --stream-name kds-lab \
  --query "StreamDescriptionSummary.StreamARN" --output text)
aws lambda create-event-source-mapping --function-name kds-lab-fn \
  --event-source-arn "$STREAM_ARN" --starting-position TRIM_HORIZON --batch-size 100
aws lambda list-event-source-mappings --function-name kds-lab-fn \
  --query "EventSourceMappings[].[UUID,State]"

# 4) 레코드를 더 넣고 로그 확인
aws kinesis put-record --stream-name kds-lab --partition-key user-7 \
  --data '{"event":"to-lambda"}' --cli-binary-format raw-in-base64-out
aws logs tail /aws/lambda/kds-lab-fn --since 10m
```

확인할 것:

- [ ] 매핑 상태가 `Creating`에서 `Enabled`로 바뀐다
- [ ] 로그에 앞 실습에서 넣은 레코드와 방금 넣은 레코드가 찍힌다. `TRIM_HORIZON`이라 보존 기간 안의 옛 레코드도 읽는다. `LATEST`면 매핑 이후 레코드만 읽는다
- [ ] 배치 크기를 주지 않으면 기본값은 {{fact:kinesis.lambda.batch.default}}이다
- [ ] 함수가 예외를 던지면 같은 배치를 다시 시도하고, 그동안 그 샤드의 처리가 멈춘다. 실패 처리 설정은 {{ch:kinesis/consumers}}에 있다

Lambda는 GetRecords를 쓰는 공유 처리량 소비자로 읽는다. 다른 소비자와 샤드 읽기 용량을 나눠 쓴다.

@topic kinesis/labs/mode-cleanup

**목표:** 스트림을 온디맨드 모드로 바꾼 뒤, 만든 자원을 모두 지운다.

```bash
# 1) 온디맨드 모드로 전환
aws kinesis update-stream-mode --stream-arn "$STREAM_ARN" \
  --stream-mode-details StreamMode=ON_DEMAND
aws kinesis describe-stream-summary --stream-name kds-lab \
  --query "StreamDescriptionSummary.[StreamStatus,StreamModeDetails.StreamMode,OpenShardCount]"

# 2) 정리: 이벤트 소스 매핑 → 함수 → 역할 → 스트림 순서
UUID=$(aws lambda list-event-source-mappings --function-name kds-lab-fn \
  --query "EventSourceMappings[0].UUID" --output text)
aws lambda delete-event-source-mapping --uuid "$UUID"
aws lambda delete-function --function-name kds-lab-fn
aws iam detach-role-policy --role-name kds-lab-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole
aws iam delete-role --role-name kds-lab-lambda-role

# 향상된 팬아웃 소비자를 등록했다면 --enforce-consumer-deletion으로 함께 지운다
aws kinesis delete-stream --stream-name kds-lab --enforce-consumer-deletion
aws kinesis wait stream-not-exists --stream-name kds-lab
aws kinesis list-streams --query "StreamNames"
```

확인할 것:

- [ ] 1단계가 끝나면 모드가 `ON_DEMAND`다. 이때부터는 샤드 시간 대신 스트림 시간과 수집·조회 GB로 요금이 붙는다. 샤드 수는 Kinesis가 관리한다
- [ ] 모드 전환은 {{fact:kinesis.mode-switch.max}}까지다. 실습을 되풀이할 때 이 한도에 걸릴 수 있다
- [ ] `list-streams`에 `kds-lab`이 없다. 스트림을 지우면 남은 데이터도 함께 사라진다
- [ ] Lambda 로그 그룹(`/aws/lambda/kds-lab-fn`)은 함수와 별개로 남는다. 필요 없으면 `aws logs delete-log-group`으로 지운다
- [ ] 다른 장 실습에서 만든 Firehose 스트림, 등록 소비자, CloudWatch 경보가 있으면 함께 지운다

@quiz

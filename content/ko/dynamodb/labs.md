---
chapter: dynamodb/labs
---

@topic dynamodb/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 동작을 AWS CLI로 직접 확인한다. 모든 예시는 서울 리전(`ap-northeast-2`)을 쓴다. 공식 시작하기 안내의 `Music` 테이블을 그대로 따른다.

> **경고: 실습이 끝나면 테이블을 반드시 지운다.** 온디맨드 테이블은 요청이 없으면 요청 요금이 없지만, 저장한 데이터, 켜 둔 PITR, 만든 백업에는 요금이 계속 붙는다. 마지막 정리 단계를 빼먹지 않는다.

준비:

- [ ] AWS CLI 버전 2를 설치하고 `aws configure`로 자격 증명을 넣었다
- [ ] 실습용 IAM 사용자나 역할에 DynamoDB 권한이 있다 (스트림 읽기에는 `dynamodb:GetRecords` 등도 필요)
- [ ] 셸에서 리전을 고정했다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity      # 자격 증명 확인
```

알아 둘 점:

- 테이블 만들기, GSI 추가, 스트림 켜기 같은 컨트롤 플레인 작업은 비동기다. 상태가 `ACTIVE`가 될 때까지 기다린 뒤 다음 단계로 간다.
- 아래 숫자와 이름은 모두 예시 값이다.

@topic dynamodb/labs/table-items

**목표:** 복합 기본 키(파티션 키 + 정렬 키) 테이블을 만들고, 항목을 쓰고·읽고·고치고·쿼리한다.

```bash
# 1) 테이블 만들기: 파티션 키 Artist, 정렬 키 SongTitle, 온디맨드
aws dynamodb create-table --table-name Music \
  --attribute-definitions AttributeName=Artist,AttributeType=S AttributeName=SongTitle,AttributeType=S \
  --key-schema AttributeName=Artist,KeyType=HASH AttributeName=SongTitle,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb wait table-exists --table-name Music
aws dynamodb describe-table --table-name Music --query "Table.TableStatus"

# 2) 쓰기
aws dynamodb put-item --table-name Music --item \
  '{"Artist":{"S":"No One You Know"},"SongTitle":{"S":"Call Me Today"},"AlbumTitle":{"S":"Somewhat Famous"},"Awards":{"N":"1"}}'
aws dynamodb put-item --table-name Music --item \
  '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"},"AlbumTitle":{"S":"Songs About Life"},"Awards":{"N":"10"}}'
aws dynamodb put-item --table-name Music --item \
  '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"PartiQL Rocks"},"AlbumTitle":{"S":"Another Album Title"},"Awards":{"N":"8"}}'

# 3) 기본 키로 읽기 (강한 일관성)
aws dynamodb get-item --table-name Music --consistent-read \
  --key '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"}}'

# 4) 고치기: 앨범 제목을 바꾸고 바뀐 값을 돌려받는다
aws dynamodb update-item --table-name Music \
  --key '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"}}' \
  --update-expression "SET AlbumTitle = :t" \
  --expression-attribute-values '{":t":{"S":"Updated Album Title"}}' \
  --return-values ALL_NEW

# 5) 조건부 고치기: 조건이 거짓이면 실패한다
aws dynamodb update-item --table-name Music \
  --key '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"}}' \
  --update-expression "SET Awards = Awards + :one" \
  --condition-expression "Awards < :max" \
  --expression-attribute-values '{":one":{"N":"1"},":max":{"N":"5"}}'

# 6) 쿼리: 한 아티스트의 곡 전체
aws dynamodb query --table-name Music \
  --key-condition-expression "Artist = :a" \
  --expression-attribute-values '{":a":{"S":"Acme Band"}}'
```

확인할 것:

- [ ] 1단계 뒤 `TableStatus`가 `ACTIVE`다
- [ ] 4단계 응답의 `Attributes`에 바뀐 앨범 제목이 보인다
- [ ] 5단계가 `ConditionalCheckFailedException`으로 실패한다 (현재 값이 조건보다 크다). 항목은 그대로다
- [ ] 6단계 결과가 정렬 키(`SongTitle`) 순서로 나온다. `--no-scan-index-forward`를 붙이면 거꾸로 나온다
- [ ] 쿼리에서 파티션 키 조건을 빼면 `ValidationException`이 난다

@topic dynamodb/labs/gsi

**목표:** 기존 테이블에 글로벌 보조 인덱스(GSI)를 더하고, 기본 키가 아닌 속성으로 쿼리한다.

```bash
# 1) GSI 추가: AlbumTitle을 파티션 키로, 모든 속성을 투영
aws dynamodb update-table --table-name Music \
  --attribute-definitions AttributeName=AlbumTitle,AttributeType=S \
  --global-secondary-index-updates '[{"Create":{
      "IndexName":"AlbumTitle-index",
      "KeySchema":[{"AttributeName":"AlbumTitle","KeyType":"HASH"}],
      "Projection":{"ProjectionType":"ALL"}}}]'

# 2) 인덱스가 ACTIVE가 될 때까지 확인 (기존 항목을 채우는 동안 CREATING)
aws dynamodb describe-table --table-name Music \
  --query "Table.GlobalSecondaryIndexes[0].[IndexName,IndexStatus]"

# 3) 인덱스로 쿼리
aws dynamodb query --table-name Music --index-name AlbumTitle-index \
  --key-condition-expression "AlbumTitle = :t" \
  --expression-attribute-values '{":t":{"S":"Somewhat Famous"}}'

# 4) 강한 일관성으로 GSI를 읽어 보기 → 실패해야 한다
aws dynamodb query --table-name Music --index-name AlbumTitle-index --consistent-read \
  --key-condition-expression "AlbumTitle = :t" \
  --expression-attribute-values '{":t":{"S":"Somewhat Famous"}}'
```

확인할 것:

- [ ] 온디맨드 테이블이라 GSI에 용량을 따로 정하지 않았다
- [ ] 3단계에서 `No One You Know`의 항목이 나온다
- [ ] 4단계는 `ValidationException`으로 실패한다. GSI는 최종 일관성 읽기만 된다
- [ ] `AlbumTitle`이 없는 항목은 인덱스에 들어가지 않는다(희소 인덱스). 이유는 {{ch:dynamodb/secondary-indexes}}에 있다

@topic dynamodb/labs/ttl-pitr

**목표:** TTL과 특정 시점 복구(PITR)를 켜고 설정을 확인한다.

```bash
# 1) TTL 켜기: 만료 시각 속성 이름은 ExpiresAt
aws dynamodb update-time-to-live --table-name Music \
  --time-to-live-specification "Enabled=true, AttributeName=ExpiresAt"
aws dynamodb describe-time-to-live --table-name Music

# 2) 만료 시각이 지난 항목 넣기: Number 타입, Unix epoch 초
PAST=$(( $(date +%s) - 3600 ))
aws dynamodb put-item --table-name Music --item \
  "{\"Artist\":{\"S\":\"Temp Band\"},\"SongTitle\":{\"S\":\"Gone Soon\"},\"ExpiresAt\":{\"N\":\"$PAST\"}}"

# 3) 만료됐지만 아직 지워지지 않은 항목을 읽기에서 거르기
NOW=$(date +%s)
aws dynamodb query --table-name Music \
  --key-condition-expression "Artist = :a" \
  --filter-expression "attribute_not_exists(ExpiresAt) OR ExpiresAt > :now" \
  --expression-attribute-values "{\":a\":{\"S\":\"Temp Band\"},\":now\":{\"N\":\"$NOW\"}}"

# 4) PITR 켜기
aws dynamodb update-continuous-backups --table-name Music \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
aws dynamodb describe-continuous-backups --table-name Music \
  --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription"
```

확인할 것:

- [ ] `describe-time-to-live`의 상태가 `ENABLING`을 거쳐 `ENABLED`가 된다
- [ ] 2단계 항목은 넣은 직후 `get-item`으로 여전히 읽힌다. TTL 삭제는 만료 즉시가 아니라 백그라운드에서 나중에 일어난다. 자세한 것은 {{ch:dynamodb/streams-ttl}}
- [ ] 3단계 결과의 `Count`는 0, `ScannedCount`는 1이다. 필터는 읽은 뒤에 거른다
- [ ] PITR 상태가 `ENABLED`이고 `EarliestRestorableDateTime`, `LatestRestorableDateTime`이 보인다. 복원 방법은 {{ch:dynamodb/backup-restore}}

@topic dynamodb/labs/streams

**목표:** 스트림을 켜고, 항목을 바꾼 뒤 스트림 레코드를 직접 읽는다.

```bash
# 1) 스트림 켜기: 바뀌기 전후 이미지를 모두 담는다
aws dynamodb update-table --table-name Music \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
STREAM_ARN=$(aws dynamodb describe-table --table-name Music \
  --query "Table.LatestStreamArn" --output text)

# 2) 변경 만들기: 고치기 한 번, 지우기 한 번
aws dynamodb update-item --table-name Music \
  --key '{"Artist":{"S":"No One You Know"},"SongTitle":{"S":"Call Me Today"}}' \
  --update-expression "SET Awards = :n" --expression-attribute-values '{":n":{"N":"2"}}'
aws dynamodb delete-item --table-name Music \
  --key '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"PartiQL Rocks"}}'

# 3) 샤드를 찾고, 처음부터 읽는 반복자를 받아 레코드 읽기
SHARD_ID=$(aws dynamodbstreams describe-stream --stream-arn "$STREAM_ARN" \
  --query "StreamDescription.Shards[0].ShardId" --output text)
ITER=$(aws dynamodbstreams get-shard-iterator --stream-arn "$STREAM_ARN" \
  --shard-id "$SHARD_ID" --shard-iterator-type TRIM_HORIZON \
  --query "ShardIterator" --output text)
aws dynamodbstreams get-records --shard-iterator "$ITER"
```

확인할 것:

- [ ] 레코드의 `eventName`이 `MODIFY`, `REMOVE`로 나온다
- [ ] `MODIFY` 레코드에 `OldImage`와 `NewImage`가 둘 다 있고, `REMOVE`에는 `OldImage`만 있다
- [ ] 스트림을 켜기 전의 변경은 레코드가 없다
- [ ] 샤드가 여러 개면 다른 샤드에 레코드가 있을 수 있다. 빈 결과면 `Shards`의 다른 항목도 읽어 본다
- [ ] 레코드는 {{fact:dynamodb.streams.retention}} 동안만 남는다

실제 서비스에서는 이렇게 직접 읽기보다 Lambda 트리거나 EventBridge Pipes를 붙인다. {{ch:dynamodb/streams-ttl}}, {{ch:dynamodb/integrations}}를 본다.

@topic dynamodb/labs/cleanup

**정리.** 테이블을 지우면 항목, 인덱스, 스트림이 함께 사라진다.

```bash
# 삭제 방지가 켜져 있으면 먼저 끈다
aws dynamodb update-table --table-name Music --no-deletion-protection-enabled

aws dynamodb delete-table --table-name Music
aws dynamodb wait table-not-exists --table-name Music

# 남은 백업 확인 (기본값은 사용자 백업만 보여 준다. ALL로 시스템 백업까지 본다)
aws dynamodb list-backups --table-name Music --backup-type ALL
```

확인할 것:

- [ ] `list-tables`에 `Music`이 없다
- [ ] PITR이 켜진 테이블을 지우면 시스템 백업이 자동으로 생긴다. {{fact:dynamodb.pitr.deleted-system-backup.retention}} 동안 무료로 보관된다. `list-backups --backup-type ALL`로 확인한다
- [ ] 직접 만든 온디맨드 백업이나 AWS Backup 백업은 테이블과 별개로 남아 요금이 붙는다. 실습 중 만들었다면 지운다
- [ ] 다른 장의 실습용으로 만든 Lambda 함수, 이벤트 소스 매핑, EventBridge 파이프가 있으면 함께 지운다

@quiz

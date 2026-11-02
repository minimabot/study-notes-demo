---
chapter: dynamodb/sdk
---

@topic dynamodb/sdk/overview

애플리케이션은 AWS SDK로 DynamoDB를 부른다. SDK는 언어마다 있다(Java, Python, JavaScript, Go, .NET, Kotlin, Rust 등). 어느 SDK든 결국 DynamoDB의 저수준 HTTP API를 부르고, 그 사이에서 다음 일을 대신 한다.

- 요청을 HTTP로 만들고 매개변수를 직렬화한다.
- 요청마다 암호 서명을 붙인다.
- 리전 엔드포인트로 보내고 응답을 받는다.
- 응답에서 결과를 꺼낸다. 실패하면 HTTP 오류 코드와 메시지를 언어별 예외로 바꾼다.
- 오류가 나면 기본 재시도를 한다.

SDK가 주는 인터페이스는 층이 나뉜다. 어떤 층이 있는지는 언어마다 다르다.

| 인터페이스 | 특징 |
|---|---|
| 저수준(Low-level) | API와 일대일. 모든 기능을 쓸 수 있다. 속성마다 타입 표시(`S`, `N` 등)를 직접 붙인다 |
| 문서(Document) | 항목을 JSON 문서처럼 다룬다. 타입 표시를 덜 쓴다 |
| 객체 지속성(Object persistence) | 코드의 클래스와 테이블을 대응시킨다. 변환은 SDK가 한다 |

**계정 기반 엔드포인트.** 최근 SDK는 `https://<계정 ID>.ddb.<리전>.amazonaws.com` 형식의 계정 기반 엔드포인트를 자동으로 쓴다. SDK 클라이언트 하나로 여러 계정을 부르면 연결을 다시 쓰기 어려워진다. AWS는 클라이언트 인스턴스 하나가 상대하는 계정 수를 줄이라고 권장한다. 리전 엔드포인트를 계속 쓰려면 `ACCOUNT_ID_ENDPOINT_MODE` 설정을 바꾼다.

@topic dynamodb/sdk/java-clients

AWS SDK for Java 2.x에서 DynamoDB를 쓰는 클래스는 두 층이다.

| 클래스 | 층 |
|---|---|
| `DynamoDbClient`, `DynamoDbAsyncClient` | 저수준 클라이언트. 항목을 `Map<String, AttributeValue>`로 다룬다 |
| `DynamoDbEnhancedClient`, `DynamoDbEnhancedAsyncClient` | 향상된 클라이언트(Enhanced Client). 자바 클래스와 테이블을 대응시킨다 |

이름에 관한 혼동이 하나 있다. Java 1.x의 패키지 이름 `com.amazonaws.dynamodbv2`에서 "v2"는 Java 2.x가 아니라 DynamoDB 저수준 API의 두 번째 버전을 뜻한다. Java 1.x의 객체 대응 클래스는 `DynamoDBMapper`이고, 2.x에서는 향상된 클라이언트가 그 자리를 맡는다.

**동기와 비동기.** 동기 클라이언트는 응답이 올 때까지 스레드를 막는다. 비동기 클라이언트는 바로 `CompletableFuture`를 돌려준다. 스레드 몇 개로 동시 요청을 많이 처리할 때 비동기가 유리하다. 다만 `join()`·`get()`을 부르면 그 자리에서 다시 막힌다.

**HTTP 클라이언트.** 2.x는 HTTP 클라이언트를 골라 끼운다.

| HTTP 클라이언트 | 쓰는 곳 |
|---|---|
| Apache 기반 | 동기 클라이언트의 기본 |
| `UrlConnectionHttpClient` | 동기. Apache 기반보다 빨리 뜨지만 기능이 적다 |
| Netty 기반 | 비동기 클라이언트의 기본 |
| AWS CRT 기반 | 동기·비동기 모두. 새로 나온 선택지 |

실무 규칙:

- 클라이언트는 한 번 만들어 재사용한다. 요청마다 만들면 연결과 스레드를 매번 새로 연다. Lambda에서는 핸들러 밖(초기화 단계)에서 만든다.
- 리전을 코드나 설정에 분명히 둔다. 서울이면 `Region.AP_NORTHEAST_2`다.
- 자격 증명은 코드에 넣지 않는다. 기본 자격 증명 공급자 체인이 환경 변수, 프로필, IAM 역할 순으로 찾는다.

@topic dynamodb/sdk/errors-retries

예외 목록과 재시도 여부 표는 {{ch:dynamodb/monitoring}}에 있다. 코드를 쓸 때 기억할 것만 줄인다.

| 예외 | 코드에서 할 일 |
|---|---|
| `ProvisionedThroughputExceededException`, `ThrottlingException`, `RequestLimitExceeded` | SDK가 백오프로 재시도한다. 계속 나면 용량과 키 분포를 본다 |
| `ConditionalCheckFailedException` | 재시도하지 않는다. 조건이 거짓이었다는 뜻이므로 업무 로직으로 처리한다 |
| `ValidationException`, `ResourceNotFoundException`, `AccessDeniedException` | 재시도하지 않는다. 요청·테이블 이름·권한을 고친다 |
| `TransactionCanceledException` | 취소 이유 목록을 본다. 자세한 것은 {{ch:dynamodb/transactions}} |
| HTTP 5xx (`InternalServerError`) | 재시도한다. 단건 쓰기는 이미 반영됐을 수 있으니 조건식을 붙인다 |

**SDK의 재시도 설정(Java 2.x).** 재시도는 재시도 전략(`RetryStrategy`)이 맡는다.

- `standard`: 다른 SDK와 맞춘 방식이다. 재시도마다 0부터 지수로 커지는 상한 사이에서 무작위로 기다린다(전체 지터, full jitter). AWS가 대부분의 경우에 권장한다.
- `legacy`: 따로 정하지 않으면 쓰는 기본값이다. 스로틀과 다른 오류를 다르게 다룬다.
- `adaptive`: `standard`에 클라이언트 쪽 요청 속도 제한을 더한다. 지연이 예측 가능해야 하면 권장하지 않는다.

DynamoDB 클라이언트의 기본값은 최대 시도 {{fact:dynamodb.sdk.java.max-attempts.default}}(첫 시도 포함), 백오프 기준 지연 {{fact:dynamodb.sdk.java.backoff.base}}, 최대 지연 {{fact:dynamodb.sdk.java.backoff.max}}다. SDK 버전에 따라 바뀔 수 있으니 쓰는 버전의 문서를 확인한다.

시간 제한도 함께 정한다. `apiCallAttemptTimeout`은 시도 한 번의 제한, `apiCallTimeout`은 재시도를 모두 합친 호출 전체의 제한이다. SDK는 이 둘의 기본값을 두지 않는다. 사용자 요청을 받는 API라면 호출 전체 제한을 꼭 둔다. 그래야 재시도가 길어져도 응답이 무한정 늦어지지 않는다.

```java
// 시도 최대 6회, 백오프 100ms에서 시작해 최대 1초 (예시 값)
StandardRetryStrategy retry = AwsRetryStrategy.standardRetryStrategy().toBuilder()
        .maxAttempts(6)
        .backoffStrategy(BackoffStrategy.exponentialDelay(Duration.ofMillis(100), Duration.ofSeconds(1)))
        .build();

DynamoDbClient ddb = DynamoDbClient.builder()
        .region(Region.AP_NORTHEAST_2)
        .overrideConfiguration(o -> o
                .retryStrategy(retry)
                .apiCallAttemptTimeout(Duration.ofMillis(500))
                .apiCallTimeout(Duration.ofSeconds(3)))
        .build();
```

**배치는 따로 처리한다.** `BatchWriteItem`·`BatchGetItem`이 돌려주는 `UnprocessedItems`·`UnprocessedKeys`는 SDK가 다시 보내 주지 않는다. 코드에서 백오프를 두고 그것만 다시 보낸다.

@topic dynamodb/sdk/cli

AWS CLI의 명령은 저수준 API와 같은 모양이다. 속성 값마다 타입 표시를 붙인다. 아래 값은 예시다. 전체 실습은 {{ch:dynamodb/labs}}에 있다.

```bash
export AWS_REGION=ap-northeast-2

# 쓰기: 같은 키가 이미 있으면 실패하게 조건을 건다
aws dynamodb put-item --table-name Music \
  --item '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"},"AlbumTitle":{"S":"Songs About Life"},"Year":{"N":"2020"}}' \
  --condition-expression "attribute_not_exists(Artist)"

# 기본 키로 읽기: 강한 일관성
aws dynamodb get-item --table-name Music --consistent-read \
  --key '{"Artist":{"S":"Acme Band"},"SongTitle":{"S":"Happy Day"}}'

# 쿼리: 파티션 키는 =, 정렬 키는 begins_with
aws dynamodb query --table-name Music \
  --key-condition-expression "Artist = :a AND begins_with(SongTitle, :p)" \
  --expression-attribute-values '{":a":{"S":"Acme Band"},":p":{"S":"Happy"}}' \
  --projection-expression "SongTitle, AlbumTitle" \
  --return-consumed-capacity TOTAL
```

- 숫자(`N`) 값도 JSON에서는 문자열로 보낸다. 언어 사이 정밀도 손실을 막기 위해서다.
- 키 조건식에는 파티션 키 등호가 꼭 있어야 한다. 정렬 키에는 `=`, `<`, `BETWEEN`, `begins_with` 등을 쓴다. 필터와의 차이는 {{ch:dynamodb/query-scan}}에 있다.
- 예약어(`Year`, `Name` 등)를 식에 쓰려면 `--expression-attribute-names '{"#y":"Year"}'`처럼 자리 표시자를 쓴다.
- `--return-consumed-capacity TOTAL`로 요청이 쓴 용량 단위를 볼 수 있다.

@topic dynamodb/sdk/java-enhanced

향상된 클라이언트로 같은 일을 해 본다. 클래스에 주석(annotation)으로 키를 표시하면 SDK가 항목과 객체를 서로 바꾼다.

```java
// 모델 클래스. 향상된 클라이언트는 public 클래스와 기본 생성자, getter/setter가 필요하다
public final class Models {
    @DynamoDbBean
    public static class Song {
        private String artist;
        private String songTitle;
        private String albumTitle;
        private Integer year;

        @DynamoDbPartitionKey
        @DynamoDbAttribute("Artist")
        public String getArtist() { return artist; }
        public void setArtist(String v) { this.artist = v; }

        @DynamoDbSortKey
        @DynamoDbAttribute("SongTitle")
        public String getSongTitle() { return songTitle; }
        public void setSongTitle(String v) { this.songTitle = v; }

        @DynamoDbAttribute("AlbumTitle")
        public String getAlbumTitle() { return albumTitle; }
        public void setAlbumTitle(String v) { this.albumTitle = v; }

        @DynamoDbAttribute("Year")
        public Integer getYear() { return year; }
        public void setYear(Integer v) { this.year = v; }
    }
}
```

```java
// 클라이언트는 한 번 만들어 재사용한다
DynamoDbClient ddb = DynamoDbClient.builder().region(Region.AP_NORTHEAST_2).build();
DynamoDbEnhancedClient enhanced = DynamoDbEnhancedClient.builder().dynamoDbClient(ddb).build();
DynamoDbTable<Song> music = enhanced.table("Music", TableSchema.fromBean(Song.class));

// 조건부 쓰기: 같은 키가 없을 때만 넣는다
Song s = new Song();
s.setArtist("Acme Band"); s.setSongTitle("Happy Day");
s.setAlbumTitle("Songs About Life"); s.setYear(2020);
try {
    music.putItem(PutItemEnhancedRequest.builder(Song.class)
            .item(s)
            .conditionExpression(Expression.builder()
                    .expression("attribute_not_exists(Artist)")
                    .build())
            .build());
} catch (ConditionalCheckFailedException e) {
    // 이미 있다. 재시도하지 않고 업무 규칙대로 처리한다
}

// 기본 키로 읽기 (강한 일관성)
Key key = Key.builder().partitionValue("Acme Band").sortValue("Happy Day").build();
Song got = music.getItem(r -> r.key(key).consistentRead(true));

// 쿼리: 파티션 키가 같고 정렬 키가 "Happy"로 시작하는 항목
PageIterable<Song> pages = music.query(QueryEnhancedRequest.builder()
        .queryConditional(QueryConditional.sortBeginsWith(
                Key.builder().partitionValue("Acme Band").sortValue("Happy").build()))
        .build());
pages.items().forEach(song -> System.out.println(song.getSongTitle()));  // 페이지는 SDK가 이어 받는다
```

같은 읽기를 저수준 클라이언트로 쓰면 이렇게 된다. 타입 표시와 변환을 코드가 직접 한다.

```java
Map<String, AttributeValue> k = Map.of(
        "Artist", AttributeValue.fromS("Acme Band"),
        "SongTitle", AttributeValue.fromS("Happy Day"));
Map<String, AttributeValue> item = ddb.getItem(r -> r.tableName("Music").key(k).consistentRead(true)).item();
String album = item.get("AlbumTitle").s();
```

고르는 기준:

- 테이블 구조가 클래스로 고정돼 있으면 향상된 클라이언트가 코드가 짧고 실수가 적다.
- 항목마다 속성이 크게 다르거나(단일 테이블 설계의 여러 엔터티), 새 API 기능을 바로 써야 하면 저수준 클라이언트가 편하다. 저수준 클라이언트는 모든 API를 쓸 수 있다.
- 둘은 같은 `DynamoDbClient`를 공유할 수 있어 섞어 써도 된다.

@quiz

---
chapter: lambda/cost
---

@topic lambda/cost/dimensions

이벤트 함수(기본 Lambda 함수)의 요금은 기본적으로 둘이다. **요청 수**와 **실행 시간(duration)** 이다. 실행 시간은 메모리 크기를 곱한 **GB-초(GB-second)** 로 센다. 메모리 {{raw:1 GB}} 함수가 {{raw:1초}} 돌면 {{raw:1 GB-초}}다. 실행 시간은 핸들러가 이벤트를 처리한 시간을 호출마다 {{fact:lambda.billing.duration-rounding}}해 센다. 핸들러 처리 시간 말고도 콜드 스타트 때 핸들러 밖 코드가 도는 초기화 단계 같은 시간이 청구 대상이 될 수 있다. 일반 호출의 초기화 시간은 로그 REPORT 줄의 Init Duration에서 볼 수 있다. 프로비저닝된 동시성이나 SnapStart처럼 실행 방식이 다르면 초기화 로그가 남는 곳과 과금 방식도 달라진다.

서울 리전을 기준으로 하고 미국 동부(버지니아 북부)를 참고로 붙인다.

| 항목 | 서울 (ap-northeast-2) | us-east-1 (참고) |
|---|---|---|
| 요청 | {{fact:lambda.price.request.apne2}} | {{fact:lambda.price.request.use1}} |
| 실행 시간 x86_64 | {{fact:lambda.price.duration.x86.apne2}} | {{fact:lambda.price.duration.x86.use1}} |
| 실행 시간 arm64 | {{fact:lambda.price.duration.arm.apne2}} | {{fact:lambda.price.duration.arm.use1}} |
| 임시 스토리지 추가분 | {{fact:lambda.price.storage.apne2}} | {{fact:lambda.price.storage.use1}} |

요금은 리전마다 다르고 자주 바뀐다. 이 장의 값은 {{fact:lambda.price.offer-version}} 기준이다. 서울의 요청·실행 시간 단가는 us-east-1과 같고, 프로비저닝된 동시성과 임시 스토리지는 서울이 더 높다.

- **실행 시간 단가는 구간제다.** 위 값은 첫 구간이다. 한 달 사용량이 x86 {{fact:lambda.price.duration.x86.tier1}}, arm64 {{fact:lambda.price.duration.arm.tier1}}를 넘으면 그 위는 더 낮은 단가가 붙는다. 대부분의 계정은 첫 구간 안에 있다.
- **무료 등급.** 매달 {{fact:lambda.free.requests}}과 {{fact:lambda.free.gbs}}를 빼 준다. 프로비저닝된 동시성을 켠 함수에는 적용되지 않는다.
- **임시 스토리지(`/tmp`).** 기본 {{fact:lambda.tmp.min}}는 무료다. 그보다 크게 잡은 몫만 실행 시간 동안 GB-초로 낸다.
- **함께 붙는 요금.** CloudWatch Logs 수집·보관, 데이터 전송, 함수를 부르는 서비스(API Gateway, SQS 등)의 요금은 따로 낸다. VPC에 붙인 함수가 NAT 게이트웨이로 인터넷에 나가면 NAT 요금도 붙는다({{ch:lambda/networking}}).

요청 단가는 아키텍처와 관계없이 같다. 그래서 아주 짧은 함수를 아주 많이 부르면 요청 요금이 실행 시간 요금보다 커질 수 있다. 이때는 호출 수 자체를 줄이는 것이 효과가 크다(마지막 절).

@topic lambda/cost/memory-duration

메모리 설정은 CPU도 함께 정한다. Lambda는 메모리에 비례해 CPU를 주고, {{fact:lambda.memory.one-vcpu}}에서 vCPU 하나에 해당하는 몫을 준다. 메모리는 {{fact:lambda.memory.min}}부터 {{fact:lambda.memory.max}}까지 정할 수 있다({{ch:lambda/configuration}}).

요금은 **메모리 × 실행 시간**이므로, 메모리를 늘려 실행 시간이 그 이상 줄면 오히려 싸진다.

| 예시 (CPU를 많이 쓰는 함수) | GB-초 |
|---|---|
| {{raw:512 MB}}, {{raw:800 ms}} | {{raw:0.5 GB}} × {{raw:0.8초}} = {{raw:0.4 GB-초}} |
| {{raw:1,024 MB}}, {{raw:350 ms}} | {{raw:1 GB}} × {{raw:0.35초}} = {{raw:0.35 GB-초}} |

두 번째가 더 빠르고 더 싸다. 반대로 대부분의 시간을 DB나 외부 API 응답을 기다리는 함수는 메모리를 늘려도 실행 시간이 거의 줄지 않는다. 이때 메모리를 두 배로 올리면 요금도 거의 두 배가 된다.

그래서 메모리는 짐작하지 말고 재 본다.

- **로그의 `REPORT` 줄.** 호출마다 `Duration`, `Billed Duration`, `Memory Size`, `Max Memory Used`가 남는다. 쓰는 메모리가 설정보다 훨씬 작고 실행 시간이 메모리에 덜 민감하면 줄일 여지가 있다.
- **AWS Lambda Power Tuning.** 문서가 소개하는 오픈 소스 도구다. Step Functions로 같은 함수를 여러 메모리 값으로 돌려 시간과 비용을 비교한다. 실제 호출을 하므로 실습 계정의 요금이 조금 붙는다.
- **AWS Compute Optimizer.** 옵트인하면 함수 메모리 권장값을 콘솔에서 보여 준다. x86_64 함수만 지원한다.

@topic lambda/cost/arm64-provisioned

**arm64(Graviton).** 같은 메모리라면 arm64의 GB-초 단가가 낮다. 서울 기준 {{fact:lambda.price.duration.arm.apne2}} 대 {{fact:lambda.price.duration.x86.apne2}}다. 문서는 arm64가 같은 함수를 x86_64에서 돌릴 때보다 가격 대비 성능이 좋을 수 있다고 쓴다. 다만 실행 시간은 워크로드에 따라 달라지므로 바꾼 뒤 재 본다.

옮기기 전에 확인할 것:

- 순수 Python·Node.js 코드는 대개 그대로 돈다. **네이티브 바이너리를 가진 의존성과 계층(layer)** 은 arm64용으로 다시 빌드해야 한다.
- 컨테이너 이미지는 arm64용 이미지로 다시 빌드한다.
- 모니터링·보안 에이전트 같은 확장(extension)도 arm64를 지원해야 한다.
- 별칭의 가중치 라우팅으로 arm64 버전에 트래픽 일부만 보내 오류율과 실행 시간을 비교하면 안전하다({{ch:lambda/versions-aliases}}).

**프로비저닝된 동시성(Provisioned Concurrency).** 미리 초기화한 실행 환경을 잡아 두는 기능이다({{ch:lambda/concurrency}}). 요금이 셋으로 나뉜다.

| 항목 | 서울 x86_64 | 서울 arm64 |
|---|---|---|
| 유지 요금 (설정한 동시성 × 메모리 × 켜 둔 시간) | {{fact:lambda.price.pc.x86.apne2}} | {{fact:lambda.price.pc.arm.apne2}} |
| PC로 처리한 호출의 실행 시간 | {{fact:lambda.price.pc-duration.x86.apne2}} | {{fact:lambda.price.pc-duration.arm.apne2}} |
| 요청 | {{fact:lambda.price.request.apne2}} | {{fact:lambda.price.request.apne2}} |

- 유지 요금은 호출이 없어도 켜 둔 동안 계속 붙고, 시간은 {{fact:lambda.price.pc.rounding}}한다.
- 설정한 동시성을 넘는 호출은 일반 단가로 낸다.
- 무료 등급이 적용되지 않는다.
- us-east-1은 유지 요금 {{fact:lambda.price.pc.x86.use1}}, 실행 시간 {{fact:lambda.price.pc-duration.x86.use1}}(x86_64)이다.

**비용만 보면 언제 이득인가.** 잡아 둔 환경을 얼마나 꽉 채워 쓰는지(사용률)에 달렸다. 위 단가로 계산하면 us-east-1에서는 사용률이 약 {{raw:60%}}를 넘을 때 일반 단가보다 싸진다. **서울에서는 유지 요금과 PC 실행 단가의 합이 일반 실행 단가(첫 구간)보다 조금 높다.** 다 채워 써도 일반 호출보다 싸지지 않는다. 그래서 서울에서 프로비저닝된 동시성은 비용을 줄이는 수단이 아니라 콜드 스타트를 없애는 데 돈을 쓰는 수단으로 본다. 필요한 시간대에만 켜도록 Application Auto Scaling 일정이나 목표 추적을 건다. Java라면 추가 요금이 없는 SnapStart를 먼저 검토한다({{ch:lambda/execution-environment}}).

@topic lambda/cost/checklist

다음 순서로 점검한다.

1. **메모리를 재서 맞춘다.** `Max Memory Used`와 실행 시간을 보고, Power Tuning이나 Compute Optimizer로 확인한다. CPU를 많이 쓰면 늘리는 쪽이, 기다리는 시간이 길면 줄이는 쪽이 싸다.
2. **arm64로 옮긴다.** 의존성을 확인하고 일부 트래픽으로 시험한 뒤 바꾼다.
3. **실행 시간을 줄인다.** SDK 클라이언트와 DB 연결은 핸들러 밖에서 만들어 재사용한다. 함수 안에서 다른 함수를 동기로 불러 기다리지 않는다. 기다리는 동안에도 두 함수 모두 실행 시간을 낸다. 오래 기다리는 흐름은 Step Functions로 옮긴다.
4. **호출 수를 줄인다.** 이벤트 소스 매핑의 이벤트 필터로 처리할 필요 없는 레코드를 걸러 낸다. 거른 레코드는 함수를 부르지 않는다. SQS·Kinesis 배치 크기와 배치 기간을 늘려 한 번에 더 많이 처리한다({{ch:lambda/event-source-mappings}}).
5. **제한 시간을 알맞게 둔다.** 멈춘 호출이 최댓값({{fact:lambda.timeout.max}})까지 돌며 요금을 쌓지 않게, 정상 실행 시간에 여유를 조금 더한 값으로 둔다.
6. **프로비저닝된 동시성은 필요한 곳과 시간에만 둔다.** 사용률을 `ProvisionedConcurrencyUtilization` 지표로 보고 줄이거나 일정을 건다.
7. **임시 스토리지와 로그를 줄인다.** `/tmp`는 필요한 만큼만 늘린다. 로그 수준을 낮추고 로그 그룹 보관 기간을 정한다. 로그 양이 많은 함수는 CloudWatch Logs 요금이 Lambda 요금보다 클 수 있다.
8. **꾸준한 사용량은 약정으로 낮춘다.** Compute Savings Plans는 Lambda 실행 시간과 프로비저닝된 동시성에도 적용된다. 트래픽이 크고 일정한 워크로드는 관리형 인스턴스도 비교한다({{ch:lambda/new-compute-options}}).
9. **비용을 나눠 본다.** 함수에 비용 할당 태그를 붙이면 Cost Explorer에서 함수·팀별로 볼 수 있다. 의도치 않은 재귀 호출(함수가 자기 출력을 다시 입력으로 받는 구조)은 요금을 크게 늘리므로 구조로 막는다.

@sim lambda-cost

@quiz

@design

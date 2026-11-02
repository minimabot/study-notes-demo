---
chapter: sqs/visibility-timeout
---

@topic sqs/visibility-timeout/basics

SQS에서 메시지를 받는 일과 지우는 일은 따로 일어난다. 소비자 A가 메시지를 가져가도 큐에는 그 메시지가 그대로 남는다. 그 대신 SQS는 정해 둔 시간 동안 B나 C 같은 다른 소비자가 이 메시지를 받지 못하도록 가시성을 제한한다. 이 시간을 **가시성 제한 시간(Visibility Timeout)** 이라 부른다. 다만 이 시간 안에도 같은 메시지가 두 번 전달될 가능성이 완전히 없어지지는 않는다.

흐름은 세 갈래로 나뉜다.

1. **처리 성공 → 삭제.** 소비자가 시간 안에 `DeleteMessage`를 호출하면 메시지가 사라진다.
2. **시간 초과 → 다시 보임.** 소비자가 죽거나 처리가 늦어서 삭제하지 못하면, 시간이 끝나는 순간 메시지가 다시 보이고 다른 소비자가 받아 간다. 재시도 코드를 따로 짜지 않아도 재시도가 일어나는 이유다.
3. **처리 포기 → 즉시 반납.** 받은 메시지를 처리하지 않기로 했다면 `ChangeMessageVisibility`로 남은 시간을 {{fact:sqs.visibility.min}}으로 바꿔 바로 돌려줄 수 있다.

큐의 기본값은 {{fact:sqs.visibility.default}}이고, 최대 {{fact:sqs.visibility.max}}까지 늘릴 수 있다.

> **주의:** 숨겨 두는 동안에도 같은 메시지가 두 번 전달될 수 있다. Standard 큐는 "적어도 한 번" 전달을 약속할 뿐, 숨김 시간 안의 중복 전달이 절대 없다고 보장하지 않는다. 그래서 소비자는 같은 메시지를 두 번 처리해도 결과가 같도록(멱등하게) 만들어야 한다.

@sim visibility-lab

@topic sqs/visibility-timeout/sizing

| 설정 | 생기는 일 |
|---|---|
| 너무 짧다 | 처리 중인 메시지가 다시 보여서 다른 소비자가 같은 일을 한 번 더 한다 (중복 처리) |
| 너무 길다 | 소비자가 죽었을 때 그 메시지는 시간이 끝날 때까지 아무도 처리하지 못한다 (재처리 지연) |
| 처리 시간이 들쭉날쭉하다 | 짧게 잡고, 처리하는 동안 `ChangeMessageVisibility`로 주기적으로 연장한다 (하트비트) |

기준은 **평균이 아니라, 평소 처리에 걸리는 가장 긴 시간**이다. 처리 시간을 아직 모른다면 AWS는 {{fact:sqs.visibility.initial-suggestion}} 정도의 짧은 값으로 시작해서 늘려 가라고 안내한다.

@topic sqs/visibility-timeout/lambda

Lambda가 SQS 큐를 읽게 하면(이벤트 소스 매핑), Lambda가 메시지를 받아 함수를 실행한다. 이때 두 가지 규칙이 있다.

- **함수 제한 시간 ≤ 큐의 가시성 제한 시간.** 이 조건을 어기면 이벤트 소스 매핑을 만들거나 고칠 때 Lambda가 오류를 낸다.
- **권장값은 함수 제한 시간의 {{fact:lambda.sqs.vt-multiplier}} + 배치 대기 시간.** 함수가 스로틀되어 재시도하는 동안 메시지가 다시 보여 중복 처리되는 일을 막기 위한 여유다.

함수 제한 시간은 최대 {{fact:lambda.timeout.max}}다.

@sim vt-calc

@topic sqs/visibility-timeout/limits

- **연장에도 끝이 있다.** `ChangeMessageVisibility`로 계속 늘려도 {{fact:sqs.visibility.max-from-first-receive}}을 넘을 수 없다. 연장할 때마다 한도가 새로 시작되지 않는다. 이보다 오래 걸리는 작업은 AWS Step Functions로 옮기거나 작은 단계로 쪼갠다.
- **처리 중 메시지 수에도 한도가 있다.** 받았지만 아직 지우지 않은 메시지(in-flight)는 Standard 큐에서 {{fact:sqs.inflight.standard.max}}까지다. 짧은 폴링에서 한도에 닿으면 `OverLimit` 오류가 나고, 긴 폴링에서는 오류 없이 새 메시지를 주지 않는다. 가시성 제한 시간을 길게 잡고 삭제를 잊으면 이 한도에 가까워진다.
- **FIFO 큐에서는 순서가 걸린다.** 같은 메시지 그룹의 메시지가 처리 중이면, 그 그룹의 다음 메시지는 앞 메시지가 삭제되거나 시간이 끝날 때까지 나오지 않는다.

@quiz

@design

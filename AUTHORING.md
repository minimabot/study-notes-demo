# 작성 규칙 (AUTHORING)

이 저장소는 AWS 학습용 비공식 한국어 노트다. 한 장을 쓸 때 아래 규칙을 지킨다. 견본은 `content/ko/sqs/visibility-timeout.md`와 그에 딸린 데이터 파일이다. 쓰기 전에 견본을 먼저 읽는다.

## 1. 근거
- 근거는 AWS 공식 문서와 공식 시험 가이드뿐이다. 내려받은 사본은 `../sources/sqs/`(SQS 개발자 안내서 .md), `../sources/exam-guides/`에 있다. 필요하면 `https://docs.aws.amazon.com/.../<page>.md`를 curl로 더 받는다.
- 공식 문서 문장을 번역하거나 거의 그대로 옮기지 않는다. 내용을 이해한 뒤 직접 다시 쓴다. 그림도 따라 그리지 않는다.
- Udemy 등 유료 강의의 구성이나 표현을 따르지 않는다. 강사 이름을 쓰지 않는다.
- 실제 시험 문항, 덤프, 유료 문제집을 쓰지 않는다.
- 시제품 `../sqs.html`의 본문은 재료로 쓸 수 있다. 다만 시제품의 수치는 믿지 말고, 모든 수치를 공식 문서로 다시 확인한다.

## 2. 수치 (사실 항목)
- 본문·퀴즈·해설에 "숫자+단위"(초, 분, 시간, 일, 배, 개, 건, KiB, MiB, GB, TPS, %)를 직접 쓰면 빌드가 실패한다.
- 수치는 `data/facts/*.yaml`의 사실 항목으로 두고 `{{fact:ID}}`로 참조한다.
- 새 사실을 추가하기 전에 반드시 `grep -rn "<키워드>" data/facts/`로 같은 뜻의 항목이 있는지 찾는다. 있으면 재사용한다. 같은 값을 다른 ID로 두 번 만들지 않는다.
- 새 사실은 자기 장 전용 파일 `data/facts/sqs-<장이름>.yaml`에만 추가한다. 공용 파일(`sqs-core.yaml`, `lambda.yaml`)은 고치지 않는다.
- 사실 항목의 칸: `id, value, unit, display.ko, label.ko, source_en(필수, 영어 원문 URL), source_ko(선택), checked(대조한 날, YYYY-MM-DD), volatile(자주 바뀌면 true), history(바뀐 기록이 확인되면)`.
- 시나리오 속 예시 값처럼 AWS 수치가 아닌 숫자는 `{{raw:30초}}`로 쓴다.
- 리전마다 다른 값은 label에 리전을 적고, 본문에 "리전마다 다르다"를 함께 쓴다. 서울 리전 값이 목록에 따로 없으면 "기타 리전" 값이 서울에 해당한다.

## 3. 본문 파일 `content/ko/sqs/<장이름>.md`
- 머리말:
  ```
  ---
  chapter: sqs/<장이름>
  ---
  ```
- 지시어(줄 전체):
  - `@topic <주제 ID>`: 절 시작. 제목·태그는 데이터에서 나온다. 본문에 `##` 제목을 따로 쓰지 않는다.
  - `@sim <이름>`: 시뮬레이터 자리. `assets/sim/<이름>.js`가 있어야 한다.
  - `@quiz`: 확인 퀴즈 자리. 장 끝에 반드시 둔다.
  - `@design`: 설계 과제 자리. 이 장에 설계 과제가 있을 때만 둔다.
- 다른 장으로 가는 링크: `{{ch:sqs/dlq}}`.
- 문체: 견본처럼 "~다" 체, 짧은 문장, 쉬운 말. 과장 형용사(혁신적, 강력한, 원활한 등) 금지.
- 용어: 처음 나올 때 한국어 공식 용어와 영어를 함께 쓴다. 예: 가시성 제한 시간(Visibility Timeout). 한국어판 공식 문서(`docs.aws.amazon.com/ko_kr/...`)의 번역어를 따른다.
- 분량: 주제 3~5개. 표는 2~3열로 짧게(휴대폰에서 카드로 바뀐다).

## 4. 장·주제 정의 `data/topics/sqs/<장이름>.yaml`
```yaml
chapter:
  id: sqs/<장이름>
  title: { ko: "..." }
  track: exam-core        # exam-core(시험 핵심) | practice(실무 심화)
  doc_source: <근거가 된 개발자 안내서 페이지 URL>
  topics:
    - id: sqs/<장이름>/<주제>
      title: { ko: "..." }
      exam_tags: [SAA-C03#2.1]          # data/exam-guides.yaml의 ID만. 근거 없으면 비운다
      exam_unknown: false               # 2025년 이후 추가된 기능이면 true, 이때 exam_tags는 비운다
      recommended:                      # AWS 공식 문서가 "권장/best practice"라고 쓴 것만
        - { claim: { ko: "..." }, source: <URL>, checked: 2026-11-01 }
      sources: [<이 절의 근거 URL 1~3개>]
```
- 시험 태그는 그 주제가 시험 가이드 과제 항목의 문장(또는 그 아래 Skill/Knowledge 문장)과 실제로 관련될 때만 붙인다. 과제 문장은 `../sources/exam-guides/*-domain*.md`에서 확인한다. 새 시험 항목이 필요하면 직접 추가하지 말고 최종 보고에 적는다.

## 5. 문항 `data/questions/sqs/<장이름>.yaml`
- 견본 `data/questions/sqs/visibility-timeout.yaml` 형식을 따른다.
- 퀴즈(`type: quiz`): 장마다 2~4문항. 보기 4개, 정답은 보기 ID(`answer: b`). 정답이 하나로만 읽혀야 한다. 해설에는 왜 다른 보기가 틀렸는지도 쓴다. `facts`에 근거 사실 ID를 넣는다.
- 설계 과제(`type: design`): 시나리오, 보기, `answer_set`(정답 보기 ID 목록), `rubric.ko`(정답 이유와 감점 이유 목록).
- 문항 ID: `sqs.q.<장>-<짧은 이름>`, `sqs.d.<장>-<짧은 이름>`.

## 6. 시뮬레이터 `assets/sim/<이름>.js`
- 견본 `assets/sim/visibility-lab.js`, `vt-calc.js` 형식. `window.SIMS['<이름>'] = function (root, F) {...}`.
- AWS 수치는 `F['<사실 ID>'].value / .display`로만 받는다. 화면 실험용으로 줄인 시간 같은 상수는 `// 화면 실험용. AWS 수치 아님` 주석을 단다.
- 외부 라이브러리를 쓰지 않는다. 휴대폰 폭(390px)에서 가로로 넘치지 않게 한다.

## 7. 점검
- 작업 중간과 끝에 `node build/build.mjs --check`를 실행해 오류가 0건인지 확인한다(출력 폴더는 건드리지 않는다).
- 자기 장의 파일만 만들고 고친다. 다른 장 파일, 공용 파일, `build/`, `assets/common.*`, `i18n/`은 고치지 않는다. 고쳐야 할 것이 있으면 최종 보고에 적는다.

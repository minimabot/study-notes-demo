# 학습 노트 (가칭) · 데모

AWS 학습용 비공식 한국어 노트의 데모입니다. Amazon Web Services와 관련이 없으며, 내용의 정확성과 최신성을 보증하지 않습니다. 수치는 각 출처(영어 원문)에서 직접 확인하세요.

## 구조

- `data/facts/` — 수치(사실 항목). 값·출처·확인 날짜의 단일 원본
- `data/exam-guides.yaml` — 시험 가이드 과제 항목 (시험 태그의 근거)
- `data/topics/` — 권 > 장 > 주제 구성과 태그
- `data/questions/` — 퀴즈와 설계 과제 (정답은 보기 ID)
- `content/<lang>/` — 본문 마크다운. 수치는 `{{fact:ID}}`로만 쓴다
- `assets/` — 공용 CSS/JS와 시뮬레이터
- `build/build.mjs` — 읽기 → 점검 → 치환 → 출력

## 빌드

```
npm ci
node build/build.mjs
```

출처 없는 수치, 본문에 직접 쓴 수치, 없는 ID 참조가 있으면 빌드가 실패합니다. main에 push하면 GitHub Pages로 배포됩니다.

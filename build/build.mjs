// 빌드 스크립트 (안 C). 하는 일은 네 단계로 고정한다: 읽기 → 점검 → 치환 → 출력.
// 사용: node build/build.mjs            (dist/ 와 단일 파일 데모 dist/artifact/ 생성)
//       node build/build.mjs --root DIR (다른 원본 폴더로 빌드. 점검 실패 데모용)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import MarkdownIt from 'markdown-it';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argRoot = process.argv.indexOf('--root');
const ROOT = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const LANGS_PUBLISHED = ['ko'];
const TODAY = new Date(process.env.BUILD_DATE || Date.now());
const STALE_DAYS = { volatile: 90, normal: 180 };

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ───────────────────────── 1. 읽기 ─────────────────────────
const readYaml = (p) => YAML.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const listFiles = (dir, ext) => {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
};

const facts = new Map();
for (const f of listFiles('data/facts', '.yaml')) {
  for (const x of readYaml(f) || []) {
    if (facts.has(x.id)) err(`[사실] ID 중복: ${x.id} (${f})`);
    facts.set(x.id, { ...x, _file: f });
  }
}
const guides = readYaml('data/exam-guides.yaml');
const exams = new Map(guides.exams.map((e) => [e.code, e]));
const examItems = new Map(guides.items.map((i) => [i.id, i]));

const volumes = [];
const chapters = new Map();
const topics = new Map();
for (const f of listFiles('data/topics', '.yaml')) {
  const v = readYaml(f);
  volumes.push(v);
  for (const ch of v.chapters) {
    ch._volume = v.volume;
    chapters.set(ch.id, ch);
    for (const t of ch.topics) { t._chapter = ch.id; topics.set(t.id, t); }
  }
}
const questions = [];
for (const f of listFiles('data/questions', '.yaml')) for (const q of readYaml(f) || []) questions.push({ ...q, _file: f });

const i18n = Object.fromEntries(LANGS_PUBLISHED.map((l) => [l, readYaml(`i18n/${l}.yaml`)]));

const pages = []; // {lang, chapterId, file, body}
for (const lang of LANGS_PUBLISHED) {
  for (const f of listFiles(`content/${lang}`, '.md')) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) { err(`[본문] 머리말(front matter) 없음: ${f}`); continue; }
    const meta = YAML.parse(m[1]);
    pages.push({ lang, chapterId: meta.chapter, file: f, body: m[2] });
  }
}

// ───────────────────────── 2. 점검 ─────────────────────────
const daysSince = (d) => Math.floor((TODAY - new Date(d)) / 86400000);
for (const [id, x] of facts) {
  if (x.value === undefined) err(`[사실] ${id}: value 없음`);
  if (!x.source_en) err(`[사실] ${id}: 영어 원문 출처(source_en) 없음`);
  if (!x.checked) err(`[사실] ${id}: 확인 날짜(checked) 없음`);
  for (const l of LANGS_PUBLISHED) {
    if (!x.display?.[l]) err(`[사실] ${id}: ${l} 표시 문장(display.${l}) 없음`);
    if (!x.label?.[l]) err(`[사실] ${id}: ${l} 설명(label.${l}) 없음`);
  }
  if (x.checked) {
    const limit = x.volatile ? STALE_DAYS.volatile : STALE_DAYS.normal;
    const age = daysSince(x.checked);
    if (age > limit) warn(`[재확인 필요] ${id}: 확인한 지 ${age}일 (기준 ${limit}일)`);
  }
}
for (const [id, it] of examItems) {
  if (!exams.has(it.exam)) err(`[시험] ${id}: 알 수 없는 시험 코드 ${it.exam}`);
  if (!it.source || !it.checked) err(`[시험] ${id}: 출처 또는 확인 날짜 없음`);
}
for (const [id, t] of topics) {
  for (const tag of t.exam_tags || []) if (!examItems.has(tag)) err(`[주제] ${id}: 없는 시험 항목 ${tag}`);
  for (const r of t.recommended || []) if (!r.source) err(`[주제] ${id}: AWS 권장 태그에 출처 없음`);
  if (!(t.sources || []).length) err(`[주제] ${id}: 절 출처(sources) 없음`);
}
const linked = new Set([...topics.values()].flatMap((t) => t.exam_tags || []));
for (const id of examItems.keys()) if (!linked.has(id)) warn(`[시험 범위] ${id}: 어느 주제에도 연결되지 않음`);

// 수치 직접 쓰기 검사: {{fact:..}}와 {{raw:..}}, 코드는 제외하고 "숫자+단위"가 남아 있으면 실패
const UNIT_RE = /\d[\d,.]*\s*(초|분|시간|일|배|개|건|KiB|MiB|GiB|KB|MB|GB|TPS|%)/g;
const REF_RE = /\{\{(fact|raw):([^}]+)\}\}/g;
function checkText(text, where) {
  for (const m of text.matchAll(REF_RE)) if (m[1] === 'fact' && !facts.has(m[2])) err(`[참조] ${where}: 없는 사실 ID ${m[2]}`);
  const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(REF_RE, '');
  for (const m of stripped.matchAll(UNIT_RE)) err(`[수치 직접 쓰기] ${where}: "${m[0]}" → 사실 항목으로 옮기고 {{fact:ID}}로 참조하세요 (의도한 예시 값이면 {{raw:..}})`);
}
const DIRECTIVES = new Set(['topic', 'sim', 'quiz', 'design']);
for (const p of pages) {
  if (!chapters.has(p.chapterId)) err(`[본문] ${p.file}: 없는 장 ID ${p.chapterId}`);
  checkText(p.body, p.file);
  for (const line of p.body.split('\n')) {
    const d = line.match(/^@(\w+)\s*(.*)$/);
    if (!d) continue;
    if (!DIRECTIVES.has(d[1])) err(`[본문] ${p.file}: 알 수 없는 지시어 @${d[1]}`);
    if (d[1] === 'topic' && !topics.has(d[2].trim())) err(`[본문] ${p.file}: 없는 주제 ID ${d[2]}`);
    if (d[1] === 'sim' && !fs.existsSync(path.join(ROOT, 'assets/sim', `${d[2].trim()}.js`))) err(`[본문] ${p.file}: 시뮬레이터 파일 없음 ${d[2]}`);
  }
}
for (const q of questions) {
  const where = `${q._file} ${q.id}`;
  if (!chapters.has(q.chapter)) err(`[문항] ${where}: 없는 장 ${q.chapter}`);
  if (!topics.has(q.topic)) err(`[문항] ${where}: 없는 주제 ${q.topic}`);
  const ids = new Set((q.choices || []).map((c) => c.id));
  if (q.type === 'quiz' && !ids.has(q.answer)) err(`[문항] ${where}: 정답 ${q.answer}이(가) 보기 ID에 없음`);
  if (q.type === 'design') for (const a of q.answer_set || []) if (!ids.has(a)) err(`[문항] ${where}: 정답 ${a}이(가) 보기 ID에 없음`);
  for (const f of q.facts || []) if (!facts.has(f)) err(`[문항] ${where}: 없는 근거 사실 ${f}`);
  for (const l of LANGS_PUBLISHED) {
    const texts = [q.question?.[l] ?? q.scenario?.[l], q.explanation?.[l] ?? (q.rubric?.[l] || []).join(' '), ...(q.choices || []).map((c) => c.text?.[l])];
    if (texts.some((t) => !t)) err(`[문항] ${where}: ${l} 문장 누락`);
    texts.filter(Boolean).forEach((t) => checkText(t, where));
  }
}

if (errors.length) {
  console.error(`\n빌드 실패: 점검 오류 ${errors.length}건`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  warnings.forEach((w) => console.error('  ! ' + w));
  process.exit(1);
}

// ───────────────────────── 3. 치환 ─────────────────────────
const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (id) => id.replace(/[^a-z0-9]+/gi, '-');

function makeFootnotes() {
  const order = [];
  const sub = (text, lang) => text.replace(REF_RE, (_, kind, id) => {
    if (kind === 'raw') return esc(id);
    const fct = facts.get(id);
    let n = order.indexOf(id) + 1;
    if (!n) { order.push(id); n = order.length; }
    return `<span class="fact" data-fact="${esc(id)}">${esc(fct.display[lang])}<sup><a href="#fn-${n}" aria-label="출처 ${n}">${n}</a></sup></span>`;
  });
  return { order, sub };
}

function tagHtml(t, lang, T) {
  const ex = (t.exam_tags || []).map((id) => {
    const it = examItems.get(id); const e = exams.get(it.exam);
    const off = e.korean_exam ? '' : ` <em>${esc(T.legend_ko_off)}</em>`;
    return `<a class="tag exam" href="${esc(it.source)}" target="_blank" rel="noopener" title="${esc(it.text_en)}">${esc(it.exam)} · Task ${esc(it.task)}${off}</a>`;
  });
  const rc = (t.recommended || []).map((r) => `<a class="tag rec" href="${esc(r.source)}" target="_blank" rel="noopener" title="${esc(r.claim[lang])}">${esc(T.rec)}</a>`);
  return ex.concat(rc).join('');
}

function renderChapter(page) {
  const { lang } = page; const T = i18n[lang];
  const ch = chapters.get(page.chapterId);
  const fn = makeFootnotes();
  const segs = []; let buf = []; const tocItems = []; const sims = new Set();
  let openTopic = null;
  const flush = () => { if (buf.length) { segs.push(md.render(fn.sub(buf.join('\n'), lang))); buf = []; } };
  const closeTopic = () => { if (openTopic) { flush(); const t = topics.get(openTopic); segs.push(`<p class="srcline">${esc(T.section_sources)}: ${t.sources.map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">[${i + 1}]</a>`).join(' ')}</p></section>`); openTopic = null; } };
  for (const line of page.body.split('\n')) {
    const d = line.match(/^@(\w+)\s*(.*)$/);
    if (!d) { buf.push(line); continue; }
    const [, kind, arg] = d;
    if (kind === 'topic') {
      closeTopic(); flush();
      const t = topics.get(arg.trim()); openTopic = t.id;
      tocItems.push({ id: slug(t.id), title: t.title[lang] });
      const recs = (t.recommended || []).map((r) => `<div class="recbox"><b>${esc(T.rec)}</b> ${esc(r.claim[lang])} <a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(T.sources)}</a> · ${esc(T.checked)} ${esc(r.checked)}</div>`).join('');
      segs.push(`<section class="topic" id="${slug(t.id)}"><h2>${esc(t.title[lang])}</h2><div class="tags">${tagHtml(t, lang, T)}</div>${recs}`);
    } else if (kind === 'sim') {
      flush(); sims.add(arg.trim());
      segs.push(`<div class="lab" data-sim="${esc(arg.trim())}"></div>`);
    } else if (kind === 'quiz' || kind === 'design') {
      closeTopic(); flush();
      const list = questions.filter((q) => q.chapter === ch.id && q.type === kind);
      const sid = kind === 'quiz' ? 'quiz' : 'design';
      tocItems.push({ id: sid, title: kind === 'quiz' ? T.quiz_title : T.design_title });
      segs.push(`<section class="topic" id="${sid}"><h2>${esc(kind === 'quiz' ? T.quiz_title : T.design_title)}</h2><div data-${kind}></div></section>`);
      page[`_${kind}`] = list.map((q) => ({
        id: q.id, topic: q.topic,
        q: fn.sub(esc(q.question?.[lang] ?? q.scenario[lang]).replace(/\{\{/g, '{{'), lang),
        choices: q.choices.map((c) => ({ id: c.id, html: fn.sub(esc(c.text[lang]), lang) })),
        answer: q.answer, answer_set: q.answer_set,
        explanation: q.explanation ? fn.sub(esc(q.explanation[lang]), lang) : null,
        rubric: q.rubric ? q.rubric[lang].map((r) => fn.sub(esc(r), lang)) : null,
        basis: (q.facts || []).map((f) => ({ label: facts.get(f).label[lang], url: facts.get(f).source_en })),
      }));
    }
  }
  closeTopic(); flush();

  const notes = fn.order.map((id, i) => {
    const x = facts.get(id);
    const ko = x.source_ko ? ` · <a href="${esc(x.source_ko)}" target="_blank" rel="noopener">${esc(T.ko_doc)}</a>` : '';
    return `<li id="fn-${i + 1}"><b>${esc(x.display[lang])}</b> — ${esc(x.label[lang])}<br><a href="${esc(x.source_en)}" target="_blank" rel="noopener">${esc(x.source_en.replace(/^https:\/\//, ''))}</a>${ko} · ${esc(T.checked)} ${esc(x.checked)}${x.volatile ? ' · <span class="volatile">자주 바뀜</span>' : ''}</li>`;
  }).join('');
  const chapterTags = { exam_tags: [...new Set(ch.topics.flatMap((t) => t.exam_tags || []))] };
  const factsJson = Object.fromEntries([...facts].map(([id, x]) => [id, { value: x.value, unit: x.unit, display: x.display[lang] }]));
  return { ch, T, segs: segs.join('\n'), notes, tocItems, sims: [...sims], chapterTags, factsJson, quiz: page._quiz || [], design: page._design || [] };
}

// ───────────────────────── 4. 출력 ─────────────────────────
const readAsset = (p) => fs.readFileSync(path.join(ROOT, 'assets', p), 'utf8');
function htmlPage({ lang, title, body, inline, depth, sims, data }) {
  const up = '../'.repeat(depth);
  const css = inline ? `<style>${readAsset('common.css')}</style>` : `<link rel="stylesheet" href="${up}assets/common.css">`;
  const dataTag = data ? `<script type="application/json" id="page-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '';
  const js = inline
    ? `<script>${readAsset('common.js')}</script>${sims.map((s) => `<script>${readAsset(`sim/${s}.js`)}</script>`).join('')}`
    : `<script src="${up}assets/common.js" defer></script>${sims.map((s) => `<script src="${up}assets/sim/${s}.js" defer></script>`).join('')}`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>${css}</head><body>${body}${dataTag}${js}</body></html>`;
}

function chapterBody(r, { inline, depth }) {
  const { ch, T } = r; const up = '../'.repeat(depth);
  const toc = r.tocItems.map((t) => `<li><a href="#${t.id}">${esc(t.title)}</a></li>`).join('');
  const homeLink = inline ? '' : `<a class="home" href="${up}ko/">${esc(ch._volume.title.ko)}</a>`;
  return `
<header class="topbar"><button class="tocbtn" aria-expanded="false" aria-controls="toc">☰ ${esc(T.toc)}</button><span class="brand">${esc(T.site_name)}</span></header>
<div class="shell">
<nav id="toc" class="toc" aria-label="${esc(T.toc)}"><div class="toc-in"><div class="series">${esc(T.site_tagline)}</div>${homeLink}<div class="vol">${esc(ch.title.ko)}</div><ol>${toc}<li><a href="#sources">${esc(T.sources)}</a></li></ol><button class="tocclose">${esc(T.close)}</button></div></nav>
<main>
<p class="crumb">${esc(ch._volume.title.ko)} · <span class="track">${esc(T['track_' + ch.track])}</span></p>
<h1>${esc(ch.title.ko)}</h1>
<div class="tags big">${tagHtml(r.chapterTags, 'ko', T)}</div>
<details class="legend"><summary>${esc(T.legend_title)}</summary><ul><li><span class="tag exam">SAA-C03 · Task 2.1</span> ${esc(T.legend_exam)}</li><li><span class="tag rec">${esc(T.rec)}</span> ${esc(T.legend_rec)}</li><li>${esc(T.legend_none)}</li></ul></details>
${r.segs}
<section class="topic" id="sources"><h2>${esc(T.sources)}</h2><p class="muted">${esc(T.sources_note)}</p><ol class="notes">${r.notes}</ol></section>
<footer><p>${esc(T.disclaimer)}</p><p><a href="#" aria-disabled="true">${esc(T.report)}</a> · ${esc(T.built)} ${TODAY.toISOString().slice(0, 10)}</p></footer>
</main></div>`;
}

fs.rmSync(DIST, { recursive: true, force: true });
const write = (rel, s) => { const p = path.join(DIST, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
write('index.html', `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=ko/"><link rel="canonical" href="ko/"><a href="ko/">ko</a>`);

const out = [];
for (const page of pages) {
  const r = renderChapter(page);
  const [vol, chap] = page.chapterId.split('/');
  const data = { facts: r.factsJson, quiz: r.quiz, design: r.design, t: r.T, storeKey: `${page.chapterId}:v1` };
  const title = `${r.ch.title.ko} · ${r.T.site_name}`;
  write(`${page.lang}/${vol}/${chap}/index.html`, htmlPage({ lang: page.lang, title, body: chapterBody(r, { inline: false, depth: 3 }), inline: false, depth: 3, sims: r.sims, data }));
  write(`artifact/${vol}-${chap}.html`, htmlPage({ lang: page.lang, title, body: chapterBody(r, { inline: true, depth: 0 }), inline: true, depth: 0, sims: r.sims, data }));
  out.push({ lang: page.lang, vol, chap, title: r.ch.title.ko, track: r.T['track_' + r.ch.track] });
}
for (const lang of LANGS_PUBLISHED) {
  const T = i18n[lang];
  const items = out.filter((o) => o.lang === lang).map((o) => `<li><a href="${o.vol}/${o.chap}/">${esc(o.title)}</a> <span class="track">${esc(o.track)}</span></li>`).join('');
  write(`${lang}/index.html`, htmlPage({ lang, title: T.site_name, inline: false, depth: 1, sims: [], body: `<main class="index"><h1>${esc(T.site_name)}</h1><p>${esc(T.site_tagline)}</p>${volumes.map((v) => `<h2>${esc(v.volume.title[lang])}</h2>`).join('')}<ol>${items}</ol><footer><p>${esc(T.disclaimer)}</p></footer></main>` }));
}

console.log(`빌드 성공: 페이지 ${out.length}개, 사실 ${facts.size}개, 문항 ${questions.length}개`);
warnings.forEach((w) => console.log('  ! ' + w));
console.log(`출력: ${DIST}`);

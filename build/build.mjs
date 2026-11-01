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

const volumes = new Map();
const chapters = new Map();
const topics = new Map();
const chapterFiles = [];
for (const f of listFiles('data/topics', '.yaml')) {
  const y = readYaml(f);
  if (y.volume) volumes.set(y.volume.id, { ...y.volume, order: y.order || [] });
  if (y.chapter) chapterFiles.push({ f, ch: y.chapter });
  for (const ch of y.chapters || []) chapterFiles.push({ f, ch });
}
for (const { f, ch } of chapterFiles) {
  const volId = ch.id.split('/')[0];
  if (!volumes.has(volId)) { err(`[장] ${f}: 권 ${volId}의 _volume.yaml 없음`); continue; }
  if (chapters.has(ch.id)) err(`[장] ID 중복: ${ch.id} (${f})`);
  ch._volume = volumes.get(volId);
  chapters.set(ch.id, ch);
  for (const t of ch.topics || []) {
    if (topics.has(t.id)) err(`[주제] ID 중복: ${t.id} (${f})`);
    t._chapter = ch.id; topics.set(t.id, t);
  }
}
for (const v of volumes.values()) for (const id of v.order) if (!chapters.has(id)) warn(`[권 목차] ${v.id}: ${id} 장 정의 없음 (준비 중으로 표시)`);
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
const REF_RE = /\{\{(fact|raw|ch):([^}]+)\}\}/g;
function checkText(text, where) {
  for (const m of text.matchAll(REF_RE)) {
    if (m[1] === 'fact' && !facts.has(m[2])) err(`[참조] ${where}: 없는 사실 ID ${m[2]}`);
    if (m[1] === 'ch' && !chapters.has(m[2])) {
      const planned = [...volumes.values()].some((v) => v.order.includes(m[2]));
      if (planned) warn(`[참조] ${where}: 아직 쓰지 않은 장 ${m[2]} (링크 없이 표시)`); else err(`[참조] ${where}: 없는 장 ID ${m[2]}`);
    }
  }
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

for (const [id, t] of topics) if (t.exam_unknown && (t.exam_tags || []).length) warn(`[주제] ${id}: 시험 반영 여부 불명(exam_unknown)인데 시험 태그가 붙어 있음`);
for (const p of pages) {
  if (!questions.some((q) => q.chapter === p.chapterId && q.type === 'quiz')) err(`[문항] ${p.chapterId}: 퀴즈가 1문항도 없음`);
  if (!/^@quiz\s*$/m.test(p.body)) err(`[본문] ${p.file}: @quiz 자리 없음`);
}
for (const ch of chapters.values()) if (!pages.some((p) => p.chapterId === ch.id)) warn(`[장] ${ch.id}: 본문 없음 (준비 중)`);

if (errors.length) {
  console.error(`\n빌드 실패: 점검 오류 ${errors.length}건`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  warnings.forEach((w) => console.error('  ! ' + w));
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log(`점검 통과 (출력 생략): 사실 ${facts.size}개, 문항 ${questions.length}개, 본문 ${pages.length}개`);
  warnings.filter((w) => !w.startsWith('[권 목차]') && !w.startsWith('[장]')).forEach((w) => console.log('  ! ' + w));
  process.exit(0);
}

// ───────────────────────── 3. 치환 ─────────────────────────
const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (id) => id.replace(/[^a-z0-9]+/gi, '-');

function makeFootnotes() {
  const order = [];
  const sub = (text, lang) => text.replace(REF_RE, (_, kind, id) => {
    if (kind === 'raw') return esc(id);
    if (kind === 'ch' && (!chapters.has(id) || !pages.some((p) => p.chapterId === id))) return `<span class="chlink todo">${esc(i18n[lang].coming_chapter)}</span>`;
    if (kind === 'ch') { const c = chapters.get(id); return `<a class="chlink" href="../../${esc(id)}/">${esc(c.title[lang])}</a>`; }
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
  const volId = ch._volume.id;
  const homeLink = inline ? '' : `<a class="home" href="${up}ko/${volId}/">← ${esc(ch._volume.title.ko)} ${esc(T.vol_toc)}</a>`;
  const ready = ch._volume.order.filter((id) => pages.some((p) => p.chapterId === id));
  const i = ready.indexOf(ch.id);
  const link = (id, label) => { const c = chapters.get(id); return `<a href="${up}ko/${id}/"><small>${label}</small>${esc(c.title.ko)}</a>`; };
  const pager = inline ? '' : `<nav class="pager">${i > 0 ? link(ready[i - 1], T.prev) : '<span></span>'}${i >= 0 && i < ready.length - 1 ? link(ready[i + 1], T.next) : '<span></span>'}</nav>`;
  return `
<header class="topbar"><button class="tocbtn" aria-expanded="false" aria-controls="toc">☰ ${esc(T.toc)}</button><span class="brand">${esc(T.site_name)}</span></header>
<div class="shell">
<nav id="toc" class="toc" aria-label="${esc(T.toc)}"><div class="toc-in"><div class="series">${esc(T.site_tagline)}</div>${homeLink}<div class="vol">${esc(ch.title.ko)}</div><ol>${toc}<li><a href="#sources">${esc(T.sources)}</a></li></ol>${inline ? '' : `<p class="tocsearch"><a href="${up}ko/search/">🔍 ${esc(T.search)}</a></p>`}<button class="tocclose">${esc(T.close)}</button></div></nav>
<main data-pagefind-body>
<p class="crumb">${esc(ch._volume.title.ko)} · <span class="track">${esc(T['track_' + ch.track])}</span></p>
<h1>${esc(ch.title.ko)}</h1>
<div class="tags big">${tagHtml(r.chapterTags, 'ko', T)}</div>
<details class="legend"><summary>${esc(T.legend_title)}</summary><ul><li><span class="tag exam">SAA-C03 · Task 2.1</span> ${esc(T.legend_exam)}</li><li><span class="tag rec">${esc(T.rec)}</span> ${esc(T.legend_rec)}</li><li>${esc(T.legend_none)}</li></ul></details>
${r.segs}
<section class="topic" id="sources"><h2>${esc(T.sources)}</h2><p class="muted">${esc(T.sources_note)}</p><ol class="notes">${r.notes}</ol></section>
${pager}
<footer><p>${esc(T.disclaimer)}</p><p><a href="${esc(T.report_url)}" target="_blank" rel="noopener">${esc(T.report)}</a> · ${esc(T.built)} ${TODAY.toISOString().slice(0, 10)}</p></footer>
</main></div>`;
}

function simplePage(lang, T, title, inner, depth, crumbs = '') {
  return htmlPage({ lang, title: `${title} · ${T.site_name}`, inline: false, depth, sims: [], body: `<main class="index">${crumbs}<h1>${esc(title)}</h1>${inner}<footer><p>${esc(T.disclaimer)}</p><p><a href="${esc(T.report_url)}" target="_blank" rel="noopener">${esc(T.report)}</a> · ${esc(T.built)} ${TODAY.toISOString().slice(0, 10)}</p></footer></main>` });
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
  const vols = [...volumes.values()];
  write(`${lang}/index.html`, simplePage(lang, T, T.site_name, `<p>${esc(T.site_tagline)}</p><ul class="vlist">${vols.map((v) => `<li><a href="${v.id}/">${esc(v.title[lang])}</a> <span class="muted">${out.filter((o) => o.vol === v.id).length} / ${v.order.length}</span></li>`).join('')}</ul>`, 1));
  write(`${lang}/search/index.html`, simplePage(lang, T, T.search, `<link rel="stylesheet" href="../../pagefind/pagefind-ui.css"><div id="search"></div><script src="../../pagefind/pagefind-ui.js"></script><script>window.addEventListener('DOMContentLoaded',()=>{new PagefindUI({element:'#search',showSubResults:true,translations:{placeholder:'${T.search_placeholder}',zero_results:'${T.search_none} [SEARCH_TERM]'}})})</script>`, 2, `<p class="crumb"><a href="../">${esc(T.site_name)}</a></p>`));
  for (const v of vols) {
    const crumbs = `<p class="crumb"><a href="../">${esc(T.site_name)}</a></p>`;
    const rows = v.order.map((id, n) => {
      const c = chapters.get(id); const done = out.some((o) => `${o.vol}/${o.chap}` === id);
      const title = c ? c.title[lang] : id;
      const tags = c ? [...new Set(c.topics.flatMap((t) => t.exam_tags || []).map((x) => examItems.get(x).exam))].map((e) => `<span class="tag exam">${esc(e)}</span>`).join('') : '';
      const track = c ? `<span class="track">${esc(T['track_' + c.track])}</span>` : '';
      return `<li class="${done ? '' : 'todo'}"><span class="n">${n + 1}</span><div>${done ? `<a href="../${id}/">${esc(title)}</a>` : `${esc(title)} <em>${esc(T.coming)}</em>`} ${track}<div class="tags">${tags}</div></div></li>`;
    }).join('');
    const extras = `<p class="extras"><a href="../search/">🔍 ${esc(T.search)}</a> · <a href="numbers/">${esc(T.numbers_title)}</a> · <a href="coverage/">${esc(T.coverage_title)}</a> · <a href="changes/">${esc(T.changes_title)}</a></p>`;
    write(`${lang}/${v.id}/index.html`, simplePage(lang, T, v.title[lang], `${extras}<details class="legend"><summary>${esc(T.legend_title)}</summary><ul><li>${esc(T.legend_exam)}</li><li>${esc(T.legend_rec)}</li><li>${esc(T.legend_none)}</li></ul></details><ol class="chlist">${rows}</ol>`, 2, crumbs));

    // 숫자 모음: 사실 항목 전체 (치트시트 대체)
    const volFacts = [...facts.values()].filter((x) => x.id.startsWith(v.id + '.') || (x.used_by || []).includes(v.id) || pages.some((p) => p.chapterId.startsWith(v.id + '/') && p.body.includes(`{{fact:${x.id}}}`)));
    const fRows = volFacts.map((x) => `<tr><td>${esc(x.label[lang])}</td><td><b>${esc(x.display[lang])}</b>${x.volatile ? ' <span class="volatile">자주 바뀜</span>' : ''}</td><td><a href="${esc(x.source_en)}" target="_blank" rel="noopener">${esc(T.sources)}</a> · ${esc(x.checked)}</td></tr>`).join('');
    const sub = `<p class="crumb"><a href="../">${esc(v.title[lang])}</a></p>`;
    write(`${lang}/${v.id}/numbers/index.html`, simplePage(lang, T, `${v.title[lang]} ${T.numbers_title}`, `<p class="muted">${esc(T.sources_note)}</p><div class="tablewrap"><table class="ftable"><thead><tr><th>${esc(T.col_item)}</th><th>${esc(T.col_value)}</th><th>${esc(T.sources)}</th></tr></thead><tbody>${fRows}</tbody></table></div>`, 3, sub));

    // 시험 범위 대응표
    const cov = [...exams.values()].map((e) => {
      const items = [...examItems.values()].filter((it) => it.exam === e.code).map((it) => {
        const ts = [...topics.values()].filter((t) => (t.exam_tags || []).includes(it.id) && t._chapter.startsWith(v.id + '/'));
        const list = ts.map((t) => `<a href="../../${t._chapter}/#${slug(t.id)}">${esc(t.title[lang])}</a>`).join(', ');
        return `<li><b>Task ${esc(it.task)}</b> <span class="muted">${esc(it.text_en)}</span><br>${list || `<span class="volatile">${esc(T.coverage_none)}</span>`}</li>`;
      }).join('');
      return `<h2>${esc(e.code)} ${esc(e.name[lang])}${e.korean_exam ? '' : ` <small class="volatile">${esc(e.korean_note?.[lang] || T.legend_ko_off)}</small>`}</h2><ul class="cov">${items}</ul>`;
    }).join('');
    write(`${lang}/${v.id}/coverage/index.html`, simplePage(lang, T, `${v.title[lang]} ${T.coverage_title}`, `<p class="muted">${esc(T.coverage_note)}</p>${cov}`, 3, sub));

    // 변경 이력: 사실 항목의 history
    const hist = volFacts.flatMap((x) => (x.history || []).map((h) => ({ ...h, x }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const hRows = hist.map((h) => `<li><b>${esc(h.date)}</b> ${esc(h.x.label[lang])}: ${esc(h.from)} → ${esc(h.to)} <a href="${esc(h.source || h.x.source_en)}" target="_blank" rel="noopener">${esc(T.sources)}</a></li>`).join('') || `<li class="muted">-</li>`;
    write(`${lang}/${v.id}/changes/index.html`, simplePage(lang, T, `${v.title[lang]} ${T.changes_title}`, `<p class="muted">${esc(T.changes_note)}</p><ul class="cov">${hRows}</ul>`, 3, sub));
  }
}

console.log(`빌드 성공: 페이지 ${out.length}개, 사실 ${facts.size}개, 문항 ${questions.length}개`);
warnings.forEach((w) => console.log('  ! ' + w));
console.log(`출력: ${DIST}`);

// 공용 동작: 목차(휴대폰 서랍), 현재 절 표시, 퀴즈·설계 과제 엔진, 시뮬레이터 연결.
// 수치는 직접 갖지 않는다. 빌드가 넣어 준 #page-data(JSON)만 읽는다.
(function () {
  window.SIMS = window.SIMS || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const dataEl = document.getElementById('page-data');
  const D = dataEl ? JSON.parse(dataEl.textContent) : null;

  function store(key, val) {
    try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
  }

  function initToc() {
    const toc = $('#toc'), btn = $('.tocbtn');
    if (!toc || !btn) return;
    const set = (open) => { toc.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => set(!toc.classList.contains('open')));
    $('.tocclose', toc)?.addEventListener('click', () => set(false));
    toc.addEventListener('click', (e) => { if (e.target === toc || e.target.closest('a')) set(false); });
    const links = $$('#toc li a');
    const secs = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (en.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
      }), { rootMargin: '-20% 0px -70% 0px' });
      secs.forEach((s) => io.observe(s));
    }
  }

  function basisHtml(b, T) {
    if (!b || !b.length) return '';
    return `<div class="basis">${T.quiz_basis}: ${b.map((x) => `<a href="${x.url}" target="_blank" rel="noopener">${x.label}</a>`).join(' · ')}</div>`;
  }

  function initQuiz() {
    const host = $('[data-quiz]'); if (!host || !D) return;
    const T = D.t, key = D.storeKey + ':quiz';
    const saved = store(key) || {};
    host.innerHTML = D.quiz.map((q, i) => `
      <div class="q" data-id="${q.id}"><p class="qt">Q${i + 1}. ${q.q}</p>
      ${q.choices.map((c) => `<label><input type="radio" name="${q.id}" value="${c.id}"><span>${c.html}</span></label>`).join('')}
      <button class="primary chk">${T.quiz_check}</button><div class="res" hidden></div></div>`).join('') + `<p class="score" aria-live="polite"></p>`;
    const score = () => { const s = store(key) || {}; const n = D.quiz.filter((q) => s[q.id] === q.answer).length; $('.score', host).textContent = Object.keys(s).length ? `${n} / ${D.quiz.length}` : ''; };
    $$('.q', host).forEach((el) => {
      const q = D.quiz.find((x) => x.id === el.dataset.id);
      const grade = (picked) => {
        $$('label', el).forEach((l) => { const v = $('input', l).value; l.classList.toggle('right', v === q.answer); l.classList.toggle('wrong', v === picked && v !== q.answer); });
        const ok = picked === q.answer, res = $('.res', el);
        res.hidden = false;
        res.innerHTML = `<b class="${ok ? 'ok' : 'ng'}">${ok ? '✓ ' + T.quiz_correct : '✗ ' + T.quiz_wrong}</b> ${q.explanation}${basisHtml(q.basis, T)}`;
      };
      $('.chk', el).addEventListener('click', () => {
        const p = $('input:checked', el); if (!p) return;
        const s = store(key) || {}; s[q.id] = p.value; store(key, s); grade(p.value); score();
      });
      if (saved[q.id]) { const inp = $(`input[value="${saved[q.id]}"]`, el); if (inp) inp.checked = true; grade(saved[q.id]); }
    });
    score();
  }

  function initDesign() {
    const host = $('[data-design]'); if (!host || !D) return;
    const T = D.t;
    host.innerHTML = D.design.map((q) => `
      <div class="q" data-id="${q.id}"><p class="qt">${q.q}</p><p class="muted">${T.design_hint}</p>
      ${q.choices.map((c) => `<label><input type="checkbox" value="${c.id}"><span>${c.html}</span></label>`).join('')}
      <button class="primary chk">${T.design_reveal}</button><div class="res" hidden></div></div>`).join('');
    $$('.q', host).forEach((el) => {
      const q = D.design.find((x) => x.id === el.dataset.id);
      $('.chk', el).addEventListener('click', () => {
        const picked = $$('input:checked', el).map((i) => i.value);
        const ans = new Set(q.answer_set);
        $$('label', el).forEach((l) => { const v = $('input', l).value; l.classList.toggle('right', ans.has(v)); l.classList.toggle('wrong', picked.includes(v) && !ans.has(v)); });
        const ok = picked.length === ans.size && picked.every((p) => ans.has(p));
        const res = $('.res', el); res.hidden = false;
        res.innerHTML = `<b class="${ok ? 'ok' : 'ng'}">${ok ? '✓ ' + T.quiz_correct : '✗ ' + T.quiz_wrong}</b><ul>${q.rubric.map((r) => `<li>${r}</li>`).join('')}</ul>${basisHtml(q.basis, T)}`;
      });
    });
  }

  function initSims() {
    $$('[data-sim]').forEach((el) => {
      const fn = window.SIMS[el.dataset.sim];
      if (fn) fn(el, D ? D.facts : {}, { $, $$ });
      else el.textContent = 'simulator not loaded: ' + el.dataset.sim;
    });
  }

  function boot() { initToc(); initQuiz(); initDesign(); initSims(); }
  // defer 스크립트(시뮬레이터)가 모두 등록된 뒤 시작하도록 DOMContentLoaded를 기다린다.
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();

(() => {
  // Порядок слайдов. Текст каждого — в content/*.md
  const SLIDES = [
    { id: 'likbez',      title: 'ликбез',                               file: 'content/01-likbez.md' },
    { id: 'where',       title: 'chat/chrome/design/code',              file: 'content/02-where.md' },
    { id: 'chrome',      title: 'Claude in Chrome',                     file: 'content/03-chrome.md' },
    { id: 'design',      title: 'Claude Design',                        file: 'content/04-design.md' },
    { id: 'code',        title: 'Claude Code',                          file: 'content/05-code.md' },
    { id: 'connectors',  title: 'Connectors',                           file: 'content/06-connectors.md' },
    { id: 'skills',      title: 'Skills',                               file: 'content/07-skills.md' },
    { id: 'limits',      title: 'Особенности, лимиты и промпт-гигиена', file: 'content/08-limits.md' },
    { id: 'task',        title: 'Ставим задачу эффективно',             file: 'content/09-task.md' },
    { id: 'inspiration', title: 'Инспирейшн',                           file: 'content/10-inspiration.md' },
    { id: 'personal',    title: 'От себя',                              file: 'content/11-personal.md' },
    { id: 'thanks',      title: 'Спасибо',                              file: 'content/12-thanks.md' },
  ];

  const body = document.body;
  const startBtn = document.querySelector('.start');
  const deck = document.querySelector('.deck');
  const main = document.querySelector('.slides');
  const roadmap = document.querySelector('.roadmap');
  const track = document.querySelector('.roadmap__track');
  const list = document.querySelector('.roadmap__list');
  const line = document.querySelector('.roadmap__line');
  const fill = document.querySelector('.roadmap__fill');
  const toggle = document.querySelector('.roadmap__toggle');
  const toggleNum = document.querySelector('.roadmap__toggle-num');
  const toggleTitle = document.querySelector('.roadmap__toggle-title');

  const pad = n => String(n).padStart(2, '0');
  const slug = (s, i) => 's' + i + '-' + s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  let current = -1;

  // ---------- Слайды ----------
  const slides = SLIDES.map(s => {
    const el = document.createElement('section');
    el.className = 'slide';
    el.id = s.id;
    el.tabIndex = -1;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="slide__inner"></div>';
    main.appendChild(el);
    return el;
  });

  function render(md, slide, index) {
    const inner = slide.querySelector('.slide__inner');
    inner.innerHTML = marked.parse(md);
    const h1 = inner.querySelector(':scope > h1');
    if (h1) {
      h1.classList.add('slide__title');
      const next = h1.nextElementSibling;
      if (next && next.tagName === 'H2') next.classList.add('slide__lead');
    }
    inner.querySelectorAll('table').forEach(t => {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
    inner.querySelectorAll('ol[start]').forEach(ol => { ol.style.counterReset = `n ${ol.start - 1}`; });
    inner.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    inner.querySelectorAll('h3').forEach((h, i) => { h.id = slug(h.textContent, i); });
    [...inner.children].forEach((el, j) => el.style.setProperty('--i', Math.min(j, 10)));
    buildSubsteps(index);
  }

  const loaded = Promise.all(SLIDES.map((s, i) =>
    fetch(s.file)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(md => render(md, slides[i], i))
      .catch(() => {
        slides[i].querySelector('.slide__inner').innerHTML =
          `<h1 class="slide__title">${s.title}</h1><p class="draft">Не удалось загрузить ${s.file}. Страницу нужно открывать через сервер, а не как файл.</p>`;
      })
  ));

  // ---------- Сайдбар ----------
  const steps = SLIDES.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'step';
    li.style.setProperty('--i', i);
    li.innerHTML = `
      <button class="step__btn" type="button">
        <span class="step__dot"></span>
        <span class="step__text">
          <span class="step__num">${pad(i + 1)}</span>
          <span class="step__title"></span>
        </span>
      </button>
      <div class="substeps"><ol class="substeps__list"></ol></div>`;
    li.querySelector('.step__title').textContent = s.title;
    li.querySelector('.step__btn').addEventListener('click', () => {
      if (i === current) slides[i].scrollTo({ top: 0, behavior: 'smooth' });
      go(i);
      closeMenu();
    });
    list.appendChild(li);
    return li;
  });

  // Подпункты текущего раздела — заголовки h3 слайда
  function buildSubsteps(i) {
    const ol = steps[i].querySelector('.substeps__list');
    ol.innerHTML = '';
    slides[i].querySelectorAll('.slide__inner > h3').forEach(h => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'substep';
      b.textContent = h.textContent.replace(/\s*🔥\s*/g, ' ').trim();
      b.dataset.target = h.id;
      b.addEventListener('click', () => {
        slides[i].scrollTo({ top: h.offsetTop - 40, behavior: 'smooth' });
        closeMenu();
      });
      li.appendChild(b);
      ol.appendChild(li);
    });
    steps[i].classList.toggle('has-substeps', ol.children.length > 0);
  }

  // ---------- Прогресс ----------
  // Линия доходит до точки текущего раздела и дальше растёт по мере прокрутки слайда
  function dotCenter(i) {
    const r = steps[i].querySelector('.step__dot').getBoundingClientRect();
    return r.top + r.height / 2 - line.getBoundingClientRect().top;
  }
  function updateProgress() {
    if (current < 0) return;
    const s = slides[current];
    const max = s.scrollHeight - s.clientHeight;
    const p = max > 4 ? Math.min(1, s.scrollTop / max) : 0;
    const from = dotCenter(current);
    const to = current < steps.length - 1 ? dotCenter(current + 1) - 12 : from;
    fill.style.setProperty('--fill', `${Math.max(0, from + (to - from) * p)}px`);

    // подсветка подпункта, до которого дочитали
    const subs = [...steps[current].querySelectorAll('.substep')];
    let active = -1;
    subs.forEach((b, k) => {
      const h = document.getElementById(b.dataset.target);
      if (h && h.offsetTop - s.scrollTop < s.clientHeight * 0.35) active = k;
    });
    if (max > 4 && s.scrollTop >= max - 2 && subs.length) active = subs.length - 1;
    subs.forEach((b, k) => {
      b.classList.toggle('is-read', k < active);
      b.classList.toggle('is-current', k === active);
    });
    if (active !== lastActiveSub) {
      lastActiveSub = active;
      if (subs[active] && !roadmap.classList.contains('is-open')) subs[active].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  let lastActiveSub = -1;
  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateProgress(); }); };
  slides.forEach(s => s.addEventListener('scroll', onScroll, { passive: true }));

  // ---------- Навигация ----------
  function go(index, { instant = false } = {}) {
    index = Math.max(0, Math.min(slides.length - 1, index));
    if (index === current) return;
    const dir = index > current ? 1 : -1;
    const prev = slides[current];
    const next = slides[index];

    if (prev) {
      prev.style.setProperty('--y', `${-dir * 24}px`);
      prev.classList.remove('is-active');
      prev.setAttribute('aria-hidden', 'true');
    }

    // новый слайд въезжает снизу при движении вперёд и сверху — назад
    next.classList.add('no-anim');
    next.style.setProperty('--y', `${dir * 24}px`);
    next.scrollTop = 0;
    void next.offsetWidth;
    if (!instant) next.classList.remove('no-anim');
    next.classList.add('is-active');
    next.removeAttribute('aria-hidden');
    next.focus({ preventScroll: true });
    if (instant) requestAnimationFrame(() => next.classList.remove('no-anim'));

    current = index;
    steps.forEach((s, i) => {
      s.classList.toggle('is-active', i === index);
      s.classList.toggle('is-done', i < index);
      s.querySelector('.step__btn').toggleAttribute('aria-current', i === index);
    });
    toggleNum.textContent = pad(index + 1);
    toggleTitle.textContent = SLIDES[index].title;

    // подпункты раскрываются анимированно — пересчитываем линию, пока идёт анимация
    const t0 = performance.now();
    (function follow() {
      updateProgress();
      if (performance.now() - t0 < 700) requestAnimationFrame(follow);
    })();
    setTimeout(() => steps[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);

    const hash = `#${next.id}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  let started = false;
  function start(initial = 0) {
    if (started) return;
    started = true;
    deck.hidden = false;
    void deck.offsetWidth;
    body.classList.add('is-main');
    body.classList.remove('is-start');
    // даём линии и шагам проявиться, затем открываем слайд
    const wait = new Promise(r => setTimeout(r, 700));
    Promise.all([loaded, wait]).then(() => go(initial));
    setTimeout(() => { startBtn.hidden = true; }, 1400);
  }

  function closeMenu() {
    roadmap.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  startBtn.addEventListener('click', () => start(0));

  document.addEventListener('keydown', e => {
    if (!started) {
      if (['Enter', ' ', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); start(0); }
      return;
    }
    if (e.target.closest('input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    // ← → листают слайды, ↑ ↓ и пробел прокручивают текущий слайд
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    if (e.key === 'Escape') closeMenu();
  });

  toggle.addEventListener('click', () => {
    const open = roadmap.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    requestAnimationFrame(updateProgress);
  });

  window.addEventListener('resize', updateProgress);
  track.addEventListener('transitionend', updateProgress);
  window.addEventListener('hashchange', () => {
    const i = SLIDES.findIndex(s => `#${s.id}` === location.hash);
    if (i >= 0) started ? go(i) : start(i);
  });

  // Прямая ссылка на слайд (#code и т. п.) — сразу в презентацию
  const fromHash = SLIDES.findIndex(s => `#${s.id}` === location.hash);
  if (fromHash >= 0) start(fromHash);
})();

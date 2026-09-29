(() => {
  const body = document.body;
  const intro = document.querySelector('.intro');
  const deck = document.querySelector('.deck');
  const slides = [...document.querySelectorAll('.slide')];
  const dotsNav = document.querySelector('.dots');
  const prevBtn = document.querySelector('.nav--prev');
  const nextBtn = document.querySelector('.nav--next');
  const nowEl = document.querySelector('.bar__now');
  const pad = n => String(n).padStart(2, '0');
  const store = {
    get(k) { try { return localStorage.getItem('v2:' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('v2:' + k, v); } catch {} },
  };
  let current = -1;
  let started = false;

  // ---------- Тема ----------
  const root = document.documentElement;
  const savedTheme = store.get('theme');
  if (savedTheme) root.dataset.theme = savedTheme;
  document.querySelector('.bar__theme').addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  // ---------- Старт: промпт печатается сам ----------
  const phrase = 'Сделай презентацию про Claude для дизайнеров. Без воды, по делу.';
  const textEl = intro.querySelector('.intro__text');
  let k = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function type() {
    if (started) return;
    if (reduce) { textEl.textContent = phrase; intro.classList.add('is-typed'); return; }
    textEl.textContent = phrase.slice(0, ++k);
    if (k < phrase.length) setTimeout(type, phrase[k - 1] === '.' ? 380 : 38 + Math.random() * 45);
    else intro.classList.add('is-typed');
  })();

  function start(index = 0) {
    if (started) return;
    started = true;
    textEl.textContent = phrase;
    body.classList.add('is-go');
    deck.hidden = false;
    setTimeout(() => {
      body.classList.remove('is-start');
      intro.hidden = true;
    }, 1150);
    setTimeout(() => go(index), 650);
  }
  intro.addEventListener('click', () => start(0));

  // ---------- Слайды ----------
  document.querySelector('.bar__all').textContent = pad(slides.length);
  slides.forEach(s => s.querySelectorAll('.r').forEach((el, i) => el.style.setProperty('--d', i)));

  const dots = slides.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dot';
    b.setAttribute('aria-label', `${pad(i + 1)} · ${s.dataset.title}`);
    b.innerHTML = `<span>${pad(i + 1)} · ${s.dataset.title}</span>`;
    b.addEventListener('click', () => go(i));
    dotsNav.appendChild(b);
    return b;
  });

  function go(index) {
    index = Math.max(0, Math.min(slides.length - 1, index));
    if (index === current) return;
    const prev = slides[current];
    if (prev) {
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      prev.setAttribute('aria-hidden', 'true');
      setTimeout(() => prev.classList.remove('is-leaving'), 320);
    }
    const next = slides[index];
    next.scrollTop = 0;
    // даём старому слайду уйти, потом собираем новый
    setTimeout(() => {
      next.classList.add('is-active');
      next.removeAttribute('aria-hidden');
      next.focus({ preventScroll: true });
    }, prev ? 220 : 0);

    current = index;
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
      d.classList.toggle('is-done', i < index);
      d.toggleAttribute('aria-current', i === index);
    });
    nowEl.textContent = pad(index + 1);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;
    const hash = '#' + next.id;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  slides.forEach(s => { s.tabIndex = -1; s.setAttribute('aria-hidden', 'true'); });

  prevBtn.addEventListener('click', () => go(current - 1));
  nextBtn.addEventListener('click', () => go(current + 1));
  document.querySelector('.bar__brand').addEventListener('click', e => { e.preventDefault(); go(0); });

  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!started) {
      if (['Enter', ' ', 'ArrowRight'].includes(e.key)) { e.preventDefault(); start(0); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(current + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
    if (e.key === 'Home') go(0);
    if (e.key === 'End') go(slides.length - 1);
  });

  // свайп на телефоне
  let tx = 0, ty = 0;
  deck.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  deck.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  window.addEventListener('hashchange', () => {
    const i = slides.findIndex(s => '#' + s.id === location.hash);
    if (i >= 0) started ? go(i) : start(i);
  });

  // ---------- 04: конструктор брифа ----------
  const PARTS = [
    { key: 'base', text: 'Сделай экран подписки.', fixed: true },
    { key: 'ctx', label: 'Контекст', text: 'Это фитнес-приложение для людей 25–40 лет. Сейчас 70% уходят на экране с ценами.' },
    { key: 'goal', label: 'Результат', text: 'Нужен кликабельный прототип: три тарифа и переключатель месяц / год.' },
    { key: 'rules', label: 'Рамки', text: 'Используй нашу дизайн-систему, навигацию не меняй, к пользователю — на «ты».' },
    { key: 'ref', label: 'Пример', text: 'Ориентир по ощущению — экран оплаты на скриншоте.' },
    { key: 'ask', label: 'Сначала спроси', text: 'Прежде чем начать, задай вопросы, если чего-то не хватает.' },
  ];
  const on = new Set();
  const txt = document.querySelector('.builder__text');
  const chips = document.querySelector('.builder__chips');
  const pct = document.querySelector('.builder__pct');
  const fillBar = document.querySelector('.builder__fill');
  let lastAdded = null;

  PARTS.filter(p => !p.fixed).forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const was = on.has(p.key);
      was ? on.delete(p.key) : on.add(p.key);
      lastAdded = was ? null : p.key;
      b.setAttribute('aria-pressed', String(!was));
      drawBrief();
    });
    chips.appendChild(b);
  });

  function drawBrief() {
    txt.innerHTML = '';
    PARTS.filter(p => p.fixed || on.has(p.key)).forEach(p => {
      const s = document.createElement('span');
      s.textContent = p.text + ' ';
      if (p.key === lastAdded) s.className = 'is-new';
      txt.appendChild(s);
    });
    const guess = [90, 62, 40, 24, 14, 6][on.size];
    pct.textContent = guess;
    fillBar.style.width = guess + '%';
  }
  drawBrief();

  // ---------- 09: чек-лист запоминается ----------
  document.querySelectorAll('.todo input').forEach(i => {
    i.checked = store.get(i.dataset.k) === '1';
    i.addEventListener('change', () => store.set(i.dataset.k, i.checked ? '1' : '0'));
  });

  // прямая ссылка на слайд — сразу в презентацию
  const fromHash = slides.findIndex(s => '#' + s.id === location.hash);
  if (fromHash >= 0) start(fromHash);
})();

(() => {
  // Те же слайды и те же тексты, что в основной версии
  const SLIDES = [
    { id: 'likbez',      title: 'ликбез',                               file: '../content/01-likbez.md' },
    { id: 'where',       title: 'chat/chrome/design/code',              file: '../content/02-where.md' },
    { id: 'chrome',      title: 'Claude in Chrome',                     file: '../content/03-chrome.md' },
    { id: 'design',      title: 'Claude Design',                        file: '../content/04-design.md' },
    { id: 'code',        title: 'Claude Code',                          file: '../content/05-code.md' },
    { id: 'connectors',  title: 'Connectors',                           file: '../content/06-connectors.md' },
    { id: 'skills',      title: 'Skills',                               file: '../content/07-skills.md' },
    { id: 'limits',      title: 'Особенности, лимиты и промпт-гигиена', file: '../content/08-limits.md' },
    { id: 'task',        title: 'Ставим задачу эффективно',             file: '../content/09-task.md' },
    { id: 'inspiration', title: 'Инспирейшн',                           file: '../content/10-inspiration.md' },
    { id: 'personal',    title: 'От себя',                              file: '../content/11-personal.md' },
    { id: 'thanks',      title: 'Спасибо',                              file: '../content/12-thanks.md' },
  ];

  const W = 1200, H = 780, GAP = 160, LABEL = 60, TITLE_H = 640;
  const $ = s => document.querySelector(s);
  const body = document.body;
  const canvas = $('.canvas');
  const board = $('.board');
  const view = $('.view');
  const frame = $('.frame');
  const layersList = $('.layers__list');
  const pageName = $('.top__page');
  const zoomEl = $('.top__zoom');
  const sizeEl = $('.frame-head__size');
  const nameEl = $('.frame-head__name');
  const prevBtn = $('.frame-nav__btn--prev');
  const nextBtn = $('.frame-nav__btn--next');
  const pad = n => String(n).padStart(2, '0');
  const store = {
    get(k) { try { return localStorage.getItem('v2:' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('v2:' + k, v); } catch {} },
  };

  let current = -1;        // открытый фрейм, -1 — обзор
  let selected = 0;        // выделенный фрейм в обзоре
  let fitT = { x: 0, y: 0, s: .2 };
  const pages = [];        // готовая разметка каждого фрейма
  const sections = [];     // названия разделов (h3) каждого фрейма

  // ---------- Тема ----------
  const root = document.documentElement;
  const savedTheme = store.get('theme');
  if (savedTheme) root.dataset.theme = savedTheme;
  $('.top__theme').addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  // ---------- Markdown → фрейм ----------
  function build(md) {
    const tpl = document.createElement('template');
    tpl.innerHTML = marked.parse(md);
    const src = tpl.content;
    const out = document.createElement('div');
    out.className = 'page';

    src.querySelectorAll('blockquote').forEach(q => {
      q.classList.add('prompt');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prompt__copy';
      b.textContent = 'Копировать';
      q.appendChild(b);
    });
    src.querySelectorAll('table').forEach(t => {
      const w = document.createElement('div');
      w.className = 'table-wrap';
      t.replaceWith(w);
      w.appendChild(t);
    });
    src.querySelectorAll('ol[start]').forEach(ol => { ol.style.counterReset = `n ${ol.start - 1}`; });
    src.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });

    // 🔥 — отдельной меткой, чтобы карточку можно было подсветить
    const walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT);
    const fire = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('🔥')) fire.push(walker.currentNode);
    fire.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split('🔥').forEach((part, i) => {
        if (i) { const s = document.createElement('span'); s.className = 'hot'; s.textContent = '🔥'; frag.appendChild(s); }
        if (part) frag.appendChild(document.createTextNode(part));
      });
      node.replaceWith(frag);
    });

    // заголовок, подзаголовок, вступление, разделы по h3, сценарии по h4
    const names = [];
    let box = null, items = null, item = null;
    const newIntro = () => { box = document.createElement('div'); box.className = 'intro'; out.appendChild(box); items = item = null; };
    [...src.childNodes].forEach(n => {
      if (n.nodeType === 3 && !n.nodeValue.trim()) return;
      const tag = n.nodeName;
      if (tag === 'H1' && !out.querySelector('h1')) { out.appendChild(n); return; }
      if (tag === 'H2' && out.lastElementChild && out.lastElementChild.tagName === 'H1') { n.className = 'lead'; out.appendChild(n); return; }
      if (tag === 'H3') {
        const name = n.textContent.replace(/🔥/g, '').trim();
        box = document.createElement('section');
        box.className = 'sec';
        box.dataset.name = name;
        box.id = 'sec-' + names.length;
        names.push(name);
        box.appendChild(n);
        out.appendChild(box);
        items = item = null;
        return;
      }
      if (!box) newIntro();
      if (tag === 'H4') {
        if (!items) { items = document.createElement('div'); items.className = 'items'; box.appendChild(items); }
        item = document.createElement('div');
        item.className = 'item';
        if (n.querySelector('.hot')) item.classList.add('item--hot');
        const bodyEl = document.createElement('div');
        bodyEl.className = 'item__body';
        item.append(n, bodyEl);
        items.appendChild(item);
        return;
      }
      if (item) item.lastChild.appendChild(n);
      else box.appendChild(n);
    });
    // пустые описания сценариев не нужны
    out.querySelectorAll('.item__body:empty').forEach(b => b.remove());
    return { html: out.outerHTML, names };
  }

  // ---------- Обзор ----------
  const thumbs = SLIDES.map((s, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.style.setProperty('--i', i);
    t.innerHTML = `<div class="thumb__label">${pad(i + 1)}&nbsp;&nbsp;${s.title}</div><div class="thumb__page"></div>`;
    t.addEventListener('click', () => open(i));
    board.appendChild(t);
    return t;
  });

  let cols = 4;
  function layout() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    cols = cw < 700 ? 2 : cw < 1100 ? 3 : 4;
    const rows = Math.ceil(SLIDES.length / cols);
    thumbs.forEach((t, i) => {
      t.style.left = (i % cols) * (W + GAP) + 'px';
      t.style.top = TITLE_H + Math.floor(i / cols) * (H + GAP + LABEL) + LABEL + 'px';
    });
    const bw = cols * W + (cols - 1) * GAP;
    const bh = TITLE_H + rows * (H + GAP + LABEL);
    const m = cw < 700 ? 20 : 56;
    const s = Math.min((cw - m * 2) / bw, (ch - m * 2 - 40) / bh);
    fitT = { s, x: (cw - bw * s) / 2, y: Math.max(m, (ch - bh * s) / 2 - 10) };
    board.style.setProperty('--inv', 1 / s);
    if (current < 0) setBoard(fitT);
  }
  function setBoard(t) {
    board.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.s})`;
    board.style.setProperty('--inv', 1 / t.s);
    if (current < 0) zoomEl.textContent = Math.round(t.s * 100) + '%';
  }
  // куда встанет фрейм i, когда мы в него «войдём»
  function focusT(i) {
    const cw = canvas.clientWidth;
    const fw = Math.min(W, cw - (cw <= 900 ? 24 : 96));
    const s = fw / W;
    const x = parseFloat(thumbs[i].style.left), y = parseFloat(thumbs[i].style.top);
    return { s, x: (cw - fw) / 2 - x * s, y: (cw <= 900 ? 16 : 40) + 28 - y * s };
  }
  function select(i) {
    selected = Math.max(0, Math.min(SLIDES.length - 1, i));
    thumbs.forEach((t, k) => t.classList.toggle('is-selected', k === selected));
  }

  // ---------- Слои ----------
  const layerItems = SLIDES.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'layers__item';
    li.innerHTML = `
      <button class="layer layer--frame" type="button">
        <span class="layer__icon">#</span><span class="layer__name"></span>
      </button>
      <div class="layers__subs"><div><ol class="layers__sublist"></ol></div></div>`;
    li.querySelector('.layer__name').textContent = `${pad(i + 1)}  ${s.title}`;
    li.querySelector('.layer--frame').addEventListener('click', () => { open(i); closeLayers(); });
    layersList.appendChild(li);
    return li;
  });
  function fillSubs(i) {
    const ol = layerItems[i].querySelector('.layers__sublist');
    ol.innerHTML = '';
    sections[i].forEach((name, k) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'layer layer--sub';
      b.innerHTML = '<span class="layer__icon">▢</span><span class="layer__name"></span>';
      b.querySelector('.layer__name').textContent = name;
      b.addEventListener('click', () => {
        if (current !== i) open(i, { then: () => jump(k) });
        else jump(k);
        closeLayers();
      });
      li.appendChild(b);
      ol.appendChild(li);
    });
  }
  function jump(k) {
    const sec = document.getElementById('sec-' + k);
    if (sec) view.scrollTo({ top: sec.offsetTop + frame.offsetTop - 40, behavior: 'smooth' });
  }

  // ---------- Открыть фрейм ----------
  let busy = false;
  function render(i, dir = 0) {
    frame.innerHTML = pages[i] || '';
    frame.classList.remove('is-in', 'is-in-back');
    if (dir) { void frame.offsetWidth; frame.classList.add(dir > 0 ? 'is-in' : 'is-in-back'); }
    nameEl.textContent = `#  ${pad(i + 1)}  ${SLIDES[i].title}`;
    const p = SLIDES[i - 1], n = SLIDES[i + 1];
    prevBtn.hidden = !p; nextBtn.hidden = !n;
    if (p) prevBtn.innerHTML = `<small>← ${pad(i)}</small>${p.title}`;
    if (n) nextBtn.innerHTML = `<small>${pad(i + 2)} →</small>${n.title}`;
    view.scrollTop = 0;
    requestAnimationFrame(updateSize);
  }
  function updateSize() {
    if (current < 0) return;
    const r = frame.getBoundingClientRect();
    sizeEl.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  }

  function setActive(i) {
    current = i;
    body.classList.toggle('is-overview', i < 0);
    layerItems.forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.querySelector('.layer--frame').toggleAttribute('aria-current', k === i);
    });
    pageName.textContent = i < 0 ? 'все фреймы' : SLIDES[i].title;
    zoomEl.textContent = i < 0 ? Math.round(fitT.s * 100) + '%' : '100%';
    const hash = i < 0 ? '' : '#' + SLIDES[i].id;
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
    lastSub = -2;
    spy();
  }

  function open(i, { then } = {}) {
    i = Math.max(0, Math.min(SLIDES.length - 1, i));
    if (busy || i === current) { then && then(); return; }

    if (current >= 0) {                       // из фрейма во фрейм
      const dir = i > current ? 1 : -1;
      setActive(i);
      render(i, dir);
      then && requestAnimationFrame(then);
      return;
    }

    // из обзора: приближаем фрейм, потом показываем его «вживую»
    busy = true;
    select(i);
    thumbs.forEach((t, k) => t.classList.toggle('is-target', k === i));
    board.classList.add('is-moving', 'is-zooming');
    setBoard(focusT(i));
    setActive(i);
    render(i);
    setTimeout(() => {
      view.hidden = false;
      void view.offsetWidth;
      view.classList.add('is-shown');
      frame.focus({ preventScroll: true });
      setTimeout(() => {
        board.hidden = true;
        board.classList.remove('is-moving', 'is-zooming');
        busy = false;
        updateSize();
        then && then();
      }, 250);
    }, 720);
  }

  function overview() {
    if (busy || current < 0) return;
    busy = true;
    const from = current;
    select(from);
    board.classList.remove('is-moving');
    thumbs.forEach((t, k) => t.classList.toggle('is-target', k === from));
    board.classList.add('is-zooming');
    setBoard(focusT(from));
    board.hidden = false;
    view.classList.remove('is-shown');
    setActive(-1);
    void board.offsetWidth;
    board.classList.add('is-moving');
    board.classList.remove('is-zooming');
    setBoard(fitT);
    setTimeout(() => {
      view.hidden = true;
      board.classList.remove('is-moving');
      busy = false;
    }, 820);
  }

  // ---------- Какой раздел читаем ----------
  let lastSub = -2;
  function spy() {
    if (current < 0) return;
    const secs = [...frame.querySelectorAll('.sec')];
    let k = -1;
    secs.forEach((s, j) => { if (s.getBoundingClientRect().top < view.clientHeight * .35 + 48) k = j; });
    if (k === lastSub) return;
    lastSub = k;
    const subs = [...layerItems[current].querySelectorAll('.layer--sub')];
    subs.forEach((b, j) => b.classList.toggle('is-current', j === k));
    if (subs[k] && !body.classList.contains('is-layers-open')) subs[k].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  let raf = 0;
  view.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); }); }, { passive: true });

  // ---------- Управление ----------
  $('.top__fit').addEventListener('click', overview);
  prevBtn.addEventListener('click', () => open(current - 1));
  nextBtn.addEventListener('click', () => open(current + 1));

  frame.addEventListener('click', e => {
    const b = e.target.closest('.prompt__copy');
    if (!b) return;
    const q = b.closest('.prompt').cloneNode(true);
    q.querySelector('.prompt__copy').remove();
    const text = q.textContent.trim();
    const done = () => { b.textContent = 'Скопировано'; setTimeout(() => { b.textContent = 'Копировать'; }, 1500); };
    try {
      navigator.clipboard.writeText(text).then(done, () => selectText(b.closest('.prompt')));
    } catch { selectText(b.closest('.prompt')); }
  });
  function selectText(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) { e.preventDefault(); overview(); return; }
    if (e.key === 'Escape') {
      if (body.classList.contains('is-layers-open')) closeLayers();
      else overview();
      return;
    }
    if (current < 0) {
      const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (moves[e.key]) { e.preventDefault(); select(selected + moves[e.key]); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(selected); }
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); open(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); open(current - 1); }
  });

  // слои на телефоне
  const layersBtn = $('.top__layers');
  layersBtn.addEventListener('click', () => {
    const openNow = body.classList.toggle('is-layers-open');
    layersBtn.setAttribute('aria-expanded', String(openNow));
  });
  function closeLayers() {
    body.classList.remove('is-layers-open');
    layersBtn.setAttribute('aria-expanded', 'false');
  }
  canvas.addEventListener('click', () => { if (body.classList.contains('is-layers-open')) closeLayers(); }, true);

  // свайп между фреймами
  let tx = 0, ty = 0;
  view.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  view.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) open(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  window.addEventListener('resize', () => { layout(); updateSize(); });
  window.addEventListener('hashchange', () => {
    const i = SLIDES.findIndex(s => '#' + s.id === location.hash);
    if (i >= 0) open(i); else if (!location.hash) overview();
  });

  // ---------- Старт ----------
  layout();
  select(0);
  setActive(-1);
  Promise.all(SLIDES.map((s, i) =>
    fetch(s.file)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(md => {
        const { html, names } = build(md);
        pages[i] = html;
        sections[i] = names;
      })
      .catch(() => {
        pages[i] = `<div class="page"><h1>${s.title}</h1><p class="draft">Не удалось загрузить ${s.file}. Страницу нужно открывать через сервер.</p></div>`;
        sections[i] = [];
      })
      .then(() => {
        thumbs[i].querySelector('.thumb__page').innerHTML = pages[i];
        fillSubs(i);
      })
  )).then(() => {
    requestAnimationFrame(() => body.classList.add('is-ready'));
    const i = SLIDES.findIndex(s => '#' + s.id === location.hash);
    if (i >= 0) {
      // прямая ссылка: сразу во фрейм, без облёта
      board.hidden = true;
      view.hidden = false;
      view.classList.add('is-shown');
      setActive(i);
      render(i);
    }
  });
})();

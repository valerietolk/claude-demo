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
    enhance(inner);
    inner.querySelectorAll(':scope > .sec > h3').forEach((h, i) => { h.id = slug(h.textContent, i); });
    [...inner.children].forEach((el, j) => el.style.setProperty('--i', Math.min(j, 10)));
    buildSubsteps(index);
  }

  // ---------- Подача содержимого: стеклянные плитки, схемы, промпты ----------
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  function enhance(inner) {
    // 🔥 — отдельной меткой
    const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
    const fire = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('🔥')) fire.push(walker.currentNode);
    fire.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split('🔥').forEach((part, i) => {
        if (i) frag.appendChild(el('span', 'hot', '🔥'));
        if (part) frag.appendChild(document.createTextNode(part));
      });
      node.replaceWith(frag);
    });

    // промпты: стеклянное «сообщение» с кнопкой копирования
    inner.querySelectorAll('blockquote').forEach(q => {
      q.classList.add('prompt', 'glass');
      q.prepend(el('span', 'prompt__label', 'промпт'));
      const b = el('button', 'prompt__copy', 'Скопировать');
      b.type = 'button';
      q.appendChild(b);
    });

    // шаблон: поля формы «название — значение»
    inner.querySelectorAll('.template').forEach(t => {
      t.classList.add('glass');
      [...t.children].forEach(row => {
        const b = row.querySelector(':scope > b:first-child');
        row.className = 'field';
        if (!b) { row.classList.add('field--sub'); return; }
        const label = el('span', 'field__label', b.textContent.replace(/:\s*$/, ''));
        b.remove();
        const value = el('span', 'field__value', row.innerHTML.trim() || '&nbsp;');
        if (!row.textContent.trim()) value.classList.add('is-empty');
        row.innerHTML = '';
        row.append(label, value);
      });
    });

    // группы коннекторов: плитка + капсулы сервисов
    inner.querySelectorAll('.groups > div').forEach(g => {
      const b = g.querySelector('b');
      const rest = g.innerHTML.replace(b.outerHTML, '');
      g.className = 'group glass';
      g.innerHTML = '';
      g.append(el('p', 'group__title', b.innerHTML),
        el('div', 'chips', rest.split('·').map(s => `<span class="chip">${s.trim()}</span>`).join('')));
    });

    // маршруты «задача → инструмент»
    inner.querySelectorAll('.routes > span').forEach(r => {
      const [what, where] = r.innerHTML.split('→');
      r.className = 'route';
      r.innerHTML = `<span class="route__what">${what.trim()}</span><span class="route__arrow" aria-hidden="true"></span><span class="route__where glass">${(where || '').trim()}</span>`;
    });

    inner.querySelectorAll('.compare > div, .card, .table-wrap, .fact, .warn, .note').forEach(n => n.classList.add('glass'));

    // списки «**Правило.** пояснение» — нумерованные плитки
    inner.querySelectorAll('ol, ul').forEach(ol => {
      const lis = [...ol.children];
      if (lis.length < 3 || ol.closest('.card, .item, .template, li')) return;
      const startsBold = li => {
        const head = li.firstElementChild && li.firstElementChild.tagName === 'P' ? li.firstElementChild : li;
        return head.firstElementChild && head.firstElementChild.tagName === 'STRONG' && head.firstChild === head.firstElementChild;
      };
      if (!lis.every(startsBold)) return;
      ol.classList.add('tiles');
      lis.forEach(li => li.classList.add('tile', 'glass'));
    });

    // разделы по h3, сценарии по h4
    const kids = [...inner.childNodes];
    let box = null, grid = null, item = null;
    kids.forEach(n => {
      if (n.nodeType === 3 && !n.nodeValue.trim()) return;
      const tag = n.nodeName;
      if (tag === 'H1' || (tag === 'H2' && n.classList.contains('slide__lead'))) return;
      if (tag === 'H3') {
        box = el('section', 'sec');
        n.after(box);
        box.appendChild(n);
        grid = item = null;
        return;
      }
      if (tag === 'H4') {
        if (!grid) {
          grid = el('div', 'items');
          if (box) box.appendChild(grid); else inner.insertBefore(grid, n);
        }
        const m = n.textContent.match(/^\s*(\d+)\.\s*/);
        if (m) {
          const first = n.firstChild;
          if (first && first.nodeType === 3) first.nodeValue = first.nodeValue.replace(/^\s*\d+\.\s*/, '');
          n.prepend(el('span', 'item__num', String(m[1]).padStart(2, '0')));
        }
        item = el('article', 'item glass');
        if (n.querySelector('.hot')) item.classList.add('item--hot');
        grid.appendChild(item);
        item.appendChild(n);
        return;
      }
      if (item) item.appendChild(n);
      else if (box) box.appendChild(n);
    });
  }

  // копирование промпта
  main.addEventListener('click', e => {
    const b = e.target.closest('.prompt__copy');
    if (!b) return;
    const q = b.closest('.prompt').cloneNode(true);
    q.querySelectorAll('.prompt__copy, .prompt__label').forEach(n => n.remove());
    const done = () => { b.textContent = 'Скопировано'; b.classList.add('is-done'); setTimeout(() => { b.textContent = 'Скопировать'; b.classList.remove('is-done'); }, 1600); };
    try { navigator.clipboard.writeText(q.textContent.trim()).then(done, () => {}); } catch {}
  });

  // блик на стекле следует за курсором
  main.addEventListener('pointermove', e => {
    const g = e.target.closest('.glass');
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', `${e.clientX - r.left}px`);
    g.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

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
    slides[i].querySelectorAll('.slide__inner > .sec > h3').forEach(h => {
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

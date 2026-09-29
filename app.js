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
  const list = document.querySelector('.roadmap__list');
  const toggle = document.querySelector('.roadmap__toggle');
  const toggleNum = document.querySelector('.roadmap__toggle-num');
  const toggleTitle = document.querySelector('.roadmap__toggle-title');

  const pad = n => String(n).padStart(2, '0');
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  let current = -1;

  // ---------- Слайды ----------
  const slides = SLIDES.map(s => {
    const sec = document.createElement('section');
    sec.className = 'slide';
    sec.id = s.id;
    sec.tabIndex = -1;
    sec.setAttribute('aria-hidden', 'true');
    sec.innerHTML = '<div class="slide__inner"></div>';
    main.appendChild(sec);
    return sec;
  });

  function render(md, slide) {
    const inner = slide.querySelector('.slide__inner');
    inner.innerHTML = marked.parse(md);
    const h1 = inner.querySelector(':scope > h1');
    if (h1) {
      h1.classList.add('slide__title');
      const next = h1.nextElementSibling;
      if (next && next.tagName === 'H2') next.classList.add('slide__lead');
    }
    inner.querySelectorAll('table').forEach(t => {
      const wrap = el('div', 'table-wrap');
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
    inner.querySelectorAll('ol[start]').forEach(ol => { ol.style.counterReset = `n ${ol.start - 1}`; });
    inner.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });

    // промпт: подпись и кнопка копирования
    inner.querySelectorAll('blockquote').forEach(q => {
      q.classList.add('prompt');
      const b = el('button', 'prompt__copy', 'Скопировать');
      b.type = 'button';
      q.appendChild(b);
    });

    // шаблон: строки «название — значение»
    inner.querySelectorAll('.template > div').forEach(row => {
      const b = row.querySelector(':scope > b:first-child');
      row.className = 'field';
      if (!b) { row.classList.add('field--sub'); return; }
      const label = el('span', 'field__label', b.textContent.replace(/:\s*$/, ''));
      b.remove();
      const value = el('span', 'field__value', row.innerHTML.trim());
      row.innerHTML = '';
      row.append(label, value);
    });

    // разделы по h3
    let box = null;
    [...inner.childNodes].forEach(n => {
      if (n.nodeType === 3 && !n.nodeValue.trim()) return;
      if (n.nodeName === 'H3') {
        box = el('section', 'sec');
        n.after(box);
        box.appendChild(n);
        return;
      }
      if (box) box.appendChild(n);
    });

    [...inner.children].forEach((c, j) => c.style.setProperty('--i', Math.min(j, 10)));
  }

  const loaded = Promise.all(SLIDES.map((s, i) =>
    fetch(s.file)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(md => render(md, slides[i]))
      .catch(() => {
        slides[i].querySelector('.slide__inner').innerHTML =
          `<h1 class="slide__title">${s.title}</h1><p class="draft">Не удалось загрузить ${s.file}. Страницу нужно открывать через сервер, а не как файл.</p>`;
      })
  ));

  // ---------- Степпер-«барабан» ----------
  const steps = SLIDES.map((s, i) => {
    const li = el('li', 'step');
    li.style.setProperty('--k', i / (SLIDES.length - 1));
    li.innerHTML = `
      <button class="step__btn" type="button">
        <span class="step__dot" aria-hidden="true"></span>
        <span class="step__title"></span>
      </button>`;
    li.querySelector('.step__title').textContent = s.title;
    li.querySelector('.step__btn').addEventListener('click', () => {
      if (i === current) slides[i].scrollTo({ top: 0, behavior: 'smooth' });
      go(i);
      closeMenu();
    });
    list.appendChild(li);
    return li;
  });

  // Текущий пункт держится на третьей строке; соседние видны целиком,
  // дальше каждый следующий на 20% прозрачнее — как барабан в iOS.
  function drum() {
    if (current < 0) return;
    const a = steps[current];
    const shift = Math.max(0, a.offsetTop - steps[Math.min(2, current)].offsetTop);
    list.style.transform = `translateY(${-shift}px)`;
    roadmap.classList.toggle('is-shifted', shift > 0);
    steps.forEach((s, i) => {
      const d = Math.abs(i - current);
      s.style.setProperty('--fade', Math.max(0, 1 - Math.max(0, d - 2) * 0.2).toFixed(2));
    });
  }

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
    drum();

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
    // даём степперу проявиться, затем открываем слайд
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
    requestAnimationFrame(drum);
  });

  // копирование промпта
  main.addEventListener('click', e => {
    const b = e.target.closest('.prompt__copy');
    if (!b) return;
    const q = b.closest('.prompt').cloneNode(true);
    q.querySelector('.prompt__copy').remove();
    const done = () => {
      b.textContent = 'Скопировано';
      b.classList.add('is-done');
      setTimeout(() => { b.textContent = 'Скопировать'; b.classList.remove('is-done'); }, 1600);
    };
    try { navigator.clipboard.writeText(q.textContent.trim()).then(done, () => {}); } catch {}
  });

  window.addEventListener('resize', drum);
  document.fonts && document.fonts.ready.then(drum);
  window.addEventListener('hashchange', () => {
    const i = SLIDES.findIndex(s => `#${s.id}` === location.hash);
    if (i >= 0) started ? go(i) : start(i);
  });

  // Прямая ссылка на слайд (#code и т. п.) — сразу в презентацию
  const fromHash = SLIDES.findIndex(s => `#${s.id}` === location.hash);
  if (fromHash >= 0) start(fromHash);
})();

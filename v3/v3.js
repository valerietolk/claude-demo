(function () {
  "use strict";

  // Главы — те же файлы, что и в основной версии. Текст не меняем.
  var SLIDES = [
    { id: "likbez",      title: "ликбез",                               file: "../content/01-likbez.md" },
    { id: "where",       title: "chat/chrome/design/code",              file: "../content/02-where.md" },
    { id: "chrome",      title: "Claude in Chrome",                     file: "../content/03-chrome.md" },
    { id: "design",      title: "Claude Design",                        file: "../content/04-design.md" },
    { id: "code",        title: "Claude Code",                          file: "../content/05-code.md" },
    { id: "connectors",  title: "Connectors",                           file: "../content/06-connectors.md" },
    { id: "skills",      title: "Skills",                               file: "../content/07-skills.md" },
    { id: "limits",      title: "Особенности, лимиты и промпт-гигиена", file: "../content/08-limits.md" },
    { id: "task",        title: "Ставим задачу эффективно",             file: "../content/09-task.md" },
    { id: "inspiration", title: "Инспирейшн",                           file: "../content/10-inspiration.md" },
    { id: "personal",    title: "От себя",                              file: "../content/11-personal.md" },
    { id: "thanks",      title: "Спасибо",                              file: "../content/12-thanks.md" }
  ];

  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;
  var boot = $("#boot"), bootBar = $("#bootBar"), bootPct = $("#bootPct");
  var canvas = $("#scene"), ctx = canvas.getContext("2d");
  var intro = $("#intro"), meter = $("#meter"), countEl = $("#count");
  var chaptersEl = $("#chapters");
  var menu = $("#menu"), menuList = $("#menuList"), menuBtn = $("#menuBtn"), preview = $("#preview");
  var cursor = $("#cursor");
  var panels = [].slice.call(document.querySelectorAll("[data-panel]"));
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var pad = function (n) { return String(n).padStart(2, "0"); };

  // ---------- helpers ----------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function ramp(p, a, b) { if (b <= a) return p >= b ? 1 : 0; return smooth(clamp((p - a) / (b - a), 0, 1)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ============================================================
  //  ИНТРО: сцена, которую скролл «прокручивает» кадр за кадром
  // ============================================================
  // Каждая панель владеет отрезком прокрутки [появилась, видна, начала уходить, ушла].
  // Между отрезками — пустые зоны, где видна только сцена: две панели не читаются одновременно.
  var CUES = [
    [0.00, 0.00, 0.15, 0.23],
    [0.35, 0.43, 0.57, 0.65],
    [0.77, 0.85, 1.10, 1.20]
  ];
  var DRIFT = 22;
  var progress = 0, seekTo = 0, seekAt = 0;
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };

  function readScroll() {
    var max = intro.scrollHeight - intro.clientHeight;
    progress = max > 0 ? clamp(intro.scrollTop / max, 0, 1) : 0;
    seekTo = progress;
  }

  function paintPanels() {
    if (mode !== "intro") return;
    meter.style.transform = "scaleX(" + progress + ")";
    panels.forEach(function (el, i) {
      var c = CUES[i];
      var enter = ramp(progress, c[0], c[1]);
      var leave = ramp(progress, c[2], c[3]);
      var o = enter * (1 - leave);
      var y = (1 - enter) * DRIFT - leave * DRIFT;
      el.style.opacity = o;
      el.style.transform = "translate3d(0," + y + "px,0)";
      el.style.pointerEvents = o > 0.6 ? "auto" : "none";
    });
  }

  // --- звезда Claude в 3D: 12 лучей, частицы, свечение ---
  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  var RAYS = [];
  (function () {
    var lens = [1, .82, .94, .78, .98, .86, .92, .8, 1, .84, .9, .76];
    for (var i = 0; i < 12; i++) {
      RAYS.push({ a: i / 12 * Math.PI * 2 + (i % 3 - 1) * 0.06, l: lens[i], w: 0.075 + (i % 4) * 0.008, d: i * 0.035 });
    }
  })();
  var DUST = [];
  for (var k = 0; k < 280; k++) {
    var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 0.55 + Math.pow(Math.random(), 0.6) * 1.6;
    DUST.push({ x: Math.sqrt(1 - u * u) * Math.cos(th) * rr, y: Math.sqrt(1 - u * u) * Math.sin(th) * rr, z: u * rr, s: 0.6 + Math.random() * 1.6 });
  }
  function rot(p, ax, ay, az) {
    var x = p[0], y = p[1], z = p[2], c, s, t;
    c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t;
    c = Math.cos(ax); s = Math.sin(ax); t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
    return [x, y, z];
  }

  function draw(t) {
    var p = seekAt, sec = t / 1000;
    var m = Math.min(W, H);
    // фазы: раскрытие → поворот в объёме → наезд камеры
    var bloom = ramp(p, 0, 0.3), turn = ramp(p, 0.28, 0.66), zoom = ramp(p, 0.62, 1);
    var R = m * lerp(0.22, 0.3, bloom) * lerp(1, 2.1, zoom);
    var cx = W / 2 + mouse.sx * W * 0.03, cy = H / 2 + mouse.sy * H * 0.03;
    var az = sec * 0.06 + p * Math.PI * 1.2;
    var ax = 0.18 * Math.sin(sec * 0.4) + turn * 0.9 + mouse.sy * 0.35;
    var ay = turn * 1.15 - zoom * 0.5 + mouse.sx * 0.45;
    var D = m * 1.8;

    ctx.clearRect(0, 0, W, H);
    // свечение
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
    g.addColorStop(0, "rgba(255,94,4," + (0.32 - zoom * 0.12) + ")");
    g.addColorStop(0.45, "rgba(255,94,4,0.08)");
    g.addColorStop(1, "rgba(255,94,4,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // частицы
    var dustRot = az * 0.35;
    for (var i = 0; i < DUST.length; i++) {
      var q = DUST[i];
      var v = rot([q.x * R, q.y * R, q.z * R], ax * 0.7, ay * 0.7 + sec * 0.02, dustRot);
      var sc = D / (D + v[2]);
      if (sc <= 0) continue;
      var a = clamp(0.15 + (1 - v[2] / (R * 2)) * 0.35, 0, 0.6) * (0.4 + bloom * 0.6);
      ctx.fillStyle = "rgba(255," + (140 + (i % 5) * 18) + ",80," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(cx + v[0] * sc, cy + v[1] * sc, q.s * sc, 0, 6.283); ctx.fill();
    }

    // лучи: от дальних к ближним
    var list = RAYS.map(function (r, i) {
      var grow = clamp(lerp(0.55, 1, bloom) + Math.sin(sec * 1.3 + i) * 0.015, 0, 1.1);
      var len = r.l * grow * R;
      var dir = rot([Math.cos(r.a), Math.sin(r.a), 0], ax, ay, az);
      var side = rot([-Math.sin(r.a), Math.cos(r.a), 0], ax, ay, az);
      return { r: r, len: len, dir: dir, side: side, z: dir[2] * len };
    }).sort(function (a, b) { return b.z - a.z; });

    var fade = 1 - zoom * 0.45;
    list.forEach(function (o) {
      var wb = o.r.w * R * 0.55, wt = o.r.w * R * 0.32;
      var tip = [o.dir[0] * o.len, o.dir[1] * o.len, o.dir[2] * o.len];
      var s0 = D / D, s1 = D / (D + tip[2]);
      var bx = cx, by = cy;
      var tx = cx + tip[0] * s1, ty = cy + tip[1] * s1;
      var nx = o.side[0], ny = o.side[1];
      var nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      var near = clamp(0.5 - tip[2] / (R * 2), 0, 1);
      var grad = ctx.createLinearGradient(bx, by, tx, ty);
      grad.addColorStop(0, "rgba(255,94,4," + fade + ")");
      grad.addColorStop(1, "rgba(" + Math.round(lerp(255, 255, near)) + "," + Math.round(lerp(120, 205, near)) + "," + Math.round(lerp(40, 125, near)) + "," + fade + ")");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx + nx * wb * s0, by + ny * wb * s0);
      ctx.lineTo(tx + nx * wt * s1, ty + ny * wt * s1);
      ctx.arc(tx, ty, wt * s1, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
      ctx.lineTo(bx - nx * wb * s0, by - ny * wb * s0);
      ctx.closePath();
      ctx.fill();
    });
    // сердцевина
    ctx.fillStyle = "rgba(255,94,4," + fade + ")";
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, 6.283); ctx.fill();
  }

  function frame(t) {
    // скролл задаёт цель, сцена догоняет её с замедлением — так прокрутка плавная, без рывков
    var gap = seekTo - seekAt;
    if (Math.abs(gap) > 0.0004) seekAt += gap * 0.115;
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
    if (mode === "intro" || chaptersEl.classList.contains("is-fading")) draw(t);
    paintPanels();
    moveCursor();
    requestAnimationFrame(frame);
  }

  // ============================================================
  //  ГЛАВЫ
  // ============================================================
  var md = [], mode = "intro", current = -1, curEl = null, busy = false;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // заголовок разбит на буквы для анимации; слова не рвутся, перенос возможен только после «/»
  function splitTitle(h) {
    var ci = 0;
    var esc = function (c) { return c.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    h.innerHTML = h.textContent.trim().split(/\s+/).map(function (word) {
      return word.split(/(?<=\/)/).map(function (part) {
        return '<span class="w">' + part.split("").map(function (c) {
          return '<span class="c" style="--ci:' + (ci++) + '">' + esc(c) + "</span>";
        }).join("") + "</span>";
      }).join("<wbr>");
    }).join(" ");
  }

  function buildBody(src) {
    var out = el("div", "ch__body ch__inner");
    // 🔥 — отдельной меткой
    var walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT), fire = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.indexOf("🔥") >= 0) fire.push(walker.currentNode);
    fire.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split("🔥").forEach(function (part, i) {
        if (i) frag.appendChild(el("span", "hot", "🔥"));
        if (part) frag.appendChild(document.createTextNode(part));
      });
      node.parentNode.replaceChild(frag, node);
    });
    src.querySelectorAll("blockquote").forEach(function (q) {
      q.classList.add("prompt");
      var b = el("button", "prompt__copy", "Скопировать"); b.type = "button"; q.appendChild(b);
    });
    src.querySelectorAll("table").forEach(function (t) { var w = el("div", "table-wrap"); t.parentNode.replaceChild(w, t); w.appendChild(t); });
    src.querySelectorAll("a[href^='http']").forEach(function (a) { a.target = "_blank"; a.rel = "noopener"; });
    src.querySelectorAll("ol[start]").forEach(function (ol) { ol.style.counterReset = "n " + (ol.start - 1); });
    src.querySelectorAll(".template > div").forEach(function (row) {
      var b = row.querySelector(":scope > b:first-child");
      row.className = "field";
      if (!b) { row.classList.add("field--sub"); return; }
      var label = el("span", "field__label", b.textContent.replace(/:\s*$/, ""));
      b.parentNode.removeChild(b);
      var value = el("span", "field__value", row.innerHTML.trim());
      row.innerHTML = ""; row.appendChild(label); row.appendChild(value);
    });

    var box = null, grid = null, item = null;
    [].slice.call(src.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && !n.nodeValue.trim()) return;
      var tag = n.nodeName;
      if (tag === "H3") {
        box = el("section", "sec"); out.appendChild(box); box.appendChild(n);
        n.classList.add("reveal"); grid = item = null; return;
      }
      var host = box || out;
      if (tag === "H4") {
        if (!grid) { grid = el("div", "items"); host.appendChild(grid); }
        var m = n.textContent.match(/^\s*(\d+)\.\s*/);
        item = el("article", "item reveal");
        if (m) {
          var first = n.firstChild;
          if (first && first.nodeType === 3) first.nodeValue = first.nodeValue.replace(/^\s*\d+\.\s*/, "");
          item.appendChild(el("span", "item__num", pad(m[1])));
        } else item.classList.add("item--plain");
        var ib = el("div", "item__body"); ib.appendChild(n); item.appendChild(ib);
        grid.appendChild(item); return;
      }
      if (item) { item.lastChild.appendChild(n); return; }
      if (n.nodeType === 1) n.classList.add("reveal");
      host.appendChild(n);
    });
    return out;
  }

  function buildChapter(i) {
    var s = SLIDES[i];
    var sec = el("section", "ch");
    sec.dataset.tone = i % 2 === 0 ? "orange" : "black";
    sec.tabIndex = -1;
    var tpl = document.createElement("template");
    tpl.innerHTML = marked.parse(md[i] || "");
    var src = tpl.content;
    var h1 = [].slice.call(src.children).filter(function (n) { return n.tagName === "H1"; })[0];
    if (h1) {
      var cover = el("header", "ch__cover ch__inner");
      cover.appendChild(el("span", "ch__num", pad(i + 1)));
      var t = el("h1", "ch__title"); t.textContent = h1.textContent; splitTitle(t); cover.appendChild(t);
      var h2 = h1.nextElementSibling;
      if (h2 && h2.tagName === "H2") { cover.appendChild(el("p", "ch__lead", h2.innerHTML)); h2.parentNode.removeChild(h2); }
      cover.appendChild(el("p", "ch__meta", "<span>Глава " + pad(i + 1) + " / " + pad(SLIDES.length) + "</span><span>листай ↓</span>"));
      h1.parentNode.removeChild(h1);
      sec.appendChild(cover);
    }
    sec.appendChild(buildBody(src));
    if (i < SLIDES.length - 1) {
      var nx = el("button", "ch__next ch__inner");
      nx.type = "button";
      nx.dataset.go = String(i + 1);
      nx.dataset.label = "→";
      nx.innerHTML = "<small>Дальше · " + pad(i + 2) + "</small><strong>" + SLIDES[i + 1].title + '</strong><span class="ch__pull"><i></i></span>';
      sec.appendChild(nx);
    }
    return sec;
  }

  function go(i, ox, oy) {
    if (busy) return;
    if (i === "intro") return toIntro();
    i = clamp(i, 0, SLIDES.length - 1);
    if (i === current && mode === "chapters") { curEl.scrollTo({ top: 0, behavior: "smooth" }); return; }
    busy = true;
    closeMenu();
    var next = buildChapter(i);
    next.style.setProperty("--ox", (ox != null ? ox : W / 2) + "px");
    next.style.setProperty("--oy", (oy != null ? oy : H / 2) + "px");
    chaptersEl.hidden = false;
    var prev = curEl;
    if (prev) prev.classList.add("is-leaving");
    if (!still) next.classList.add("is-entering");
    chaptersEl.appendChild(next);
    requestAnimationFrame(function () { next.classList.add("is-shown"); });
    setTimeout(function () { body.dataset.tone = next.dataset.tone; }, still ? 0 : 380);
    var done = function () {
      next.classList.remove("is-entering");
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      if (mode === "intro") { intro.hidden = true; $("#stage").hidden = true; }
      mode = "chapters";
      body.classList.add("in-chapters");
      busy = false;
      next.focus({ preventScroll: true });
    };
    if (still) done(); else setTimeout(done, 1060);
    current = i; curEl = next;
    pull = 0;
    countEl.textContent = pad(i + 1) + " / " + pad(SLIDES.length);
    meter.style.transform = "scaleX(0)";
    observe(next);
    next.addEventListener("scroll", onChapterScroll, { passive: true });
    next.addEventListener("wheel", onChapterWheel, { passive: true });
    var hash = "#" + SLIDES[i].id;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    markMenu();
  }

  function toIntro() {
    closeMenu();
    if (mode === "intro") { intro.scrollTo({ top: 0, behavior: "smooth" }); return; }
    $("#stage").hidden = false; intro.hidden = false;
    intro.scrollTop = 0; readScroll(); seekAt = 0;
    body.dataset.tone = "black";
    chaptersEl.classList.add("is-fading");
    chaptersEl.style.transition = "opacity .7s var(--ease)";
    chaptersEl.style.opacity = "0";
    mode = "intro";
    setTimeout(function () {
      chaptersEl.hidden = true; chaptersEl.innerHTML = "";
      chaptersEl.style.opacity = ""; chaptersEl.classList.remove("is-fading");
      curEl = null; current = -1;
    }, 720);
    countEl.textContent = "";
    body.classList.remove("in-chapters");
    history.replaceState(null, "", location.pathname);
    markMenu();
  }

  // появление блоков при прокрутке главы
  var io = null;
  function observe(sec) {
    if (io) io.disconnect();
    var items = sec.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || still) { items.forEach(function (n) { n.classList.add("in"); }); return; }
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { root: sec, rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    items.forEach(function (n) { io.observe(n); });
  }

  function onChapterScroll(e) {
    var s = e.currentTarget, max = s.scrollHeight - s.clientHeight;
    meter.style.transform = "scaleX(" + (max > 0 ? s.scrollTop / max : 0) + ")";
  }

  // в самом низу главы дальнейшая прокрутка «натягивает» переход к следующей
  var pull = 0, pullT = 0;
  function onChapterWheel(e) {
    var s = e.currentTarget;
    var atEnd = s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
    var bar = s.querySelector(".ch__pull");
    if (!bar) return;
    if (atEnd && e.deltaY > 0) pull += e.deltaY; else if (e.deltaY < 0) pull = 0;
    bar.style.setProperty("--pull", Math.min(1, pull / 700));
    clearTimeout(pullT);
    pullT = setTimeout(function () { pull = 0; bar.style.setProperty("--pull", 0); }, 900);
    if (pull >= 700) { pull = 0; go(current + 1, W / 2, H); }
  }

  // ============================================================
  //  МЕНЮ
  // ============================================================
  function buildMenu() {
    SLIDES.forEach(function (s, i) {
      var li = el("li", "menu__item");
      var b = el("button", "menu__link");
      b.type = "button";
      b.style.setProperty("--mi", i);
      b.dataset.label = "→";
      b.innerHTML = '<span class="menu__num">' + pad(i + 1) + '</span><span class="menu__title"></span>';
      b.querySelector(".menu__title").textContent = s.title;
      b.addEventListener("click", function (e) { go(i, e.clientX, e.clientY); });
      b.addEventListener("mouseenter", function () {
        preview.querySelector(".menu__preview-num").textContent = pad(i + 1);
        var lead = (md[i] || "").match(/^##\s+(.+)$/m);
        preview.querySelector(".menu__preview-lead").textContent = lead ? lead[1] : s.title;
        preview.classList.add("on");
      });
      b.addEventListener("mouseleave", function () { preview.classList.remove("on"); });
      li.appendChild(b);
      menuList.appendChild(li);
    });
  }
  function markMenu() {
    [].forEach.call(menuList.querySelectorAll(".menu__link"), function (b, i) { b.classList.toggle("is-current", i === current); });
  }
  function openMenu() {
    menu.hidden = false;
    void menu.offsetWidth;
    menu.classList.add("is-open");
    body.classList.add("menu-open");
    menuBtn.setAttribute("aria-expanded", "true");
    menuBtn.textContent = "Закрыть";
  }
  function closeMenu() {
    if (menu.hidden) return;
    menu.classList.remove("is-open");
    body.classList.remove("menu-open");
    preview.classList.remove("on");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.textContent = "Содержание";
    setTimeout(function () { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 900);
  }
  menuBtn.addEventListener("click", function () { menu.classList.contains("is-open") ? closeMenu() : openMenu(); });
  menu.addEventListener("mousemove", function (e) {
    preview.style.setProperty("--mx", (e.clientX + 28) + "px");
    preview.style.setProperty("--my", (e.clientY - 40) + "px");
  });

  // ============================================================
  //  КУРСОР, МАГНИТНЫЕ КНОПКИ, ПАРАЛЛАКС
  // ============================================================
  var cx0 = -100, cy0 = -100, rx = -100, ry = -100;
  function moveCursor() {
    if (!fine) return;
    rx += (cx0 - rx) * 0.18; ry += (cy0 - ry) * 0.18;
    cursor.style.setProperty("--dx", cx0 + "px"); cursor.style.setProperty("--dy", cy0 + "px");
    cursor.style.setProperty("--rx", rx + "px"); cursor.style.setProperty("--ry", ry + "px");
  }
  window.addEventListener("pointermove", function (e) {
    cx0 = e.clientX; cy0 = e.clientY;
    mouse.x = e.clientX / innerWidth * 2 - 1;
    mouse.y = e.clientY / innerHeight * 2 - 1;
    var t = e.target.closest ? e.target.closest("button, a") : null;
    cursor.classList.toggle("is-link", !!t);
    cursor.querySelector("span").textContent = t && t.dataset.label ? t.dataset.label : "";
    if (curEl) {
      var num = curEl.querySelector(".ch__num");
      if (num) { num.style.setProperty("--px", (-mouse.x * 30) + "px"); num.style.setProperty("--py", (-mouse.y * 20) + "px"); }
    }
  }, { passive: true });
  if (fine) body.classList.add("has-cursor");

  document.addEventListener("pointermove", function (e) {
    var b = e.target.closest && e.target.closest(".pill");
    document.querySelectorAll(".pill.is-mag").forEach(function (p) { if (p !== b) { p.classList.remove("is-mag"); p.style.transform = ""; } });
    if (!b || !fine) return;
    var r = b.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    b.classList.add("is-mag");
    b.style.transform = "translate(" + (dx * 0.25).toFixed(1) + "px," + (dy * 0.35).toFixed(1) + "px)";
  }, { passive: true });

  // ============================================================
  //  УПРАВЛЕНИЕ
  // ============================================================
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (g) { var v = g.dataset.go; go(v === "intro" ? "intro" : +v, e.clientX || W / 2, e.clientY || H / 2); return; }
    if (e.target.closest("[data-menu]")) { openMenu(); return; }
    var c = e.target.closest(".prompt__copy");
    if (c) {
      var q = c.closest(".prompt").cloneNode(true);
      q.querySelector(".prompt__copy").remove();
      try {
        navigator.clipboard.writeText(q.textContent.trim()).then(function () {
          c.textContent = "Скопировано";
          setTimeout(function () { c.textContent = "Скопировать"; }, 1500);
        }, function () {});
      } catch (err) {}
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") { closeMenu(); return; }
    if (!body.classList.contains("ready")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(mode === "intro" ? 0 : current + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); if (mode === "chapters") current === 0 ? toIntro() : go(current - 1); }
  });
  // в конце интро дальнейшая прокрутка открывает первую главу
  intro.addEventListener("wheel", function (e) {
    if (progress > 0.995 && e.deltaY > 30 && !busy) go(0, W / 2, H / 2);
  }, { passive: true });
  intro.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", function () { resize(); readScroll(); });
  window.addEventListener("hashchange", function () {
    var i = SLIDES.findIndex(function (s) { return "#" + s.id === location.hash; });
    if (i >= 0 && i !== current) go(i);
  });

  // ============================================================
  //  ЗАГРУЗКА
  // ============================================================
  function setProgress(f) {
    bootBar.style.transform = "scaleX(" + f + ")";
    bootPct.textContent = "ЗАГРУЗКА " + Math.round(f * 100) + "%";
  }
  var total = SLIDES.length + 1, got = 0;
  function tick() { got++; setProgress(got / total); }
  var fontReady = (document.fonts && document.fonts.load ? document.fonts.load('64px "LORE Cyrillic"') : Promise.resolve()).catch(function () {}).then(tick);
  var texts = SLIDES.map(function (s, i) {
    return fetch(s.file).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; })
      .then(function (t) { md[i] = t; tick(); });
  });
  var minWait = new Promise(function (r) { setTimeout(r, 700); });
  Promise.all(texts.concat([fontReady, minWait])).then(function () {
    buildMenu();
    setProgress(1);
    boot.classList.add("done");
    body.classList.add("ready");
    var i = SLIDES.findIndex(function (s) { return "#" + s.id === location.hash; });
    if (i >= 0) go(i);
  });

  resize();
  readScroll();
  paintPanels();
  requestAnimationFrame(frame);
})();

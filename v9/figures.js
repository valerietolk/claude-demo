/* Семь живых 3D-фигур, которые левитируют над полом и откликаются на курсор.
   Свет стоит в «комнате» неподвижно: софтбоксы, цветные контровые и тени. Когда фигура
   поворачивается — от прокрутки или от курсора — блики и тени по ней ходят.
   Форма каждой фигуры — набор шаров и «трубок», слитых мягко, как ртуть (metaballs).
   Поверхность у каждой своя: гранулы, панцирь из плиток, мех, цветные зоны, зерно.
   Снаружи: FIG.init(canvas), FIG.render(i, c, dt, zoom) — фигура i в точке своего отрезка прокрутки c (0…1),
   FIG.mouse(x, y), FIG.shift(доля ширины), FIG.place(x, y), FIG.bounce(цвет снизу), FIG.count. */
(function () {
  "use strict";
  var THREE = window.THREE;
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---------- формы ----------
  // s: шар [x, y, z, r]; c: капсула [a, b, ra, rb]; p: трубка через точки [[x,y,z,r], …]
  // mesh: "ray" — фигура «звёздная», поверхность ищем лучами из центра; "nets" — любая форма (кольца, петли)
  var SHAPES = [
    { // 1. «звезда»: оранжевая с кремовыми пятнами и золотыми искрами
      kind: "beads", mesh: "ray", k: 0.42,
      prims: [
        { s: [0, 0, 0, 0.82] },
        { c: [[0, 0, 0], [-1.25, 0.75, 0.1], 0.55, 0.62] },
        { c: [[0, 0, 0], [1.2, 0.95, -0.25], 0.5, 0.58] },
        { c: [[0, 0, 0], [-1.05, -1.05, 0.15], 0.55, 0.6] },
        { c: [[0, 0, 0], [1.05, -1.0, 0.3], 0.52, 0.58] },
        { c: [[0, 0.3, 0], [0.15, 1.45, 0.35], 0.42, 0.55] }
      ],
      colors: { a: "#F4561C", b: "#FFE6CC", c: "#C9340F", d: "#FFE3A0" }, spotFreq: 4.2, zone: 0.7, glint: 1
    },
    { // 2. «гантель с отростком»: голубая со светлыми пятнами и лаймом
      kind: "beads", mesh: "ray", k: 0.5,
      prims: [
        { s: [-0.85, -0.55, 0, 0.92] },
        { s: [0.75, 0.8, -0.1, 0.82] },
        { c: [[-0.85, -0.55, 0], [0.75, 0.8, -0.1], 0.42, 0.4] },
        { c: [[0.05, 0.1, 0], [1.15, -0.95, 0.35], 0.34, 0.5] }
      ],
      colors: { a: "#4A86FF", b: "#8DB4FF", c: "#B9E27A", d: "#FFFFFF" }, spotFreq: 5.2, zone: 1, glint: 0
    },
    { // 3. «пушистая»: розовый мех с жёлтыми зонами короткого ворса
      kind: "fur", mesh: "nets", k: 0.42, res: 84,
      prims: [
        { s: [0, 0, 0, 0.85] },
        { c: [[0, 0, 0], [-1.25, 0.55, 0.25], 0.55, 0.5] },
        { c: [[0, 0, 0], [1.3, 0.35, -0.2], 0.5, 0.48] },
        { c: [[0, 0, 0], [0.35, 1.2, 0.1], 0.5, 0.45] },
        { c: [[0, 0, 0], [-0.55, -1.2, -0.2], 0.55, 0.5] },
        { c: [[0, 0, 0], [0.9, -0.9, 0.45], 0.45, 0.42] }
      ],
      colors: { a: "#F08A7E", b: "#FFF0EA", c: "#FFD23C", d: "#FFFFFF" }, furLen: 0.22, layers: 28
    },
    { // 4. «петля в панцире»: изогнутая трубка из плиток с белыми швами, оранжевый → жёлтый
      kind: "cells", mesh: "nets", k: 0.3, res: 110,
      prims: [
        { p: [[-1.35, -0.75, 0.35, 0.5], [-0.55, -1.05, -0.15, 0.55], [0.45, -0.75, -0.35, 0.55], [1.0, 0.0, 0.15, 0.52],
              [0.45, 0.65, 0.55, 0.5], [-0.45, 0.85, 0.25, 0.52], [-1.0, 0.35, -0.35, 0.5], [-0.35, -0.15, -0.75, 0.46],
              [0.75, 0.35, -0.65, 0.5], [1.35, 1.05, -0.15, 0.55]] }
      ],
      colors: { a: "#E8621A", b: "#FFC83A", c: "#FFF6EA", d: "#E2483A" }
    },
    { // 5. «кольцо из шаров»: мягкие цветные зоны — сиреневый, оранжевый, белый, жёлтый
      kind: "zones", mesh: "nets", k: 0.32, res: 110,
      prims: (function () {
        var P = [], n = 6;
        for (var i = 0; i < n; i++) {
          var a = i / n * TAU, b = (i + 1) / n * TAU, z = 0.18 * Math.sin(i * 2.1);
          P.push({ s: [1.2 * Math.cos(a), 1.2 * Math.sin(a), z, 0.6 - 0.05 * (i % 2)] });
          P.push({ c: [[1.2 * Math.cos(a), 1.2 * Math.sin(a), z], [1.2 * Math.cos(b), 1.2 * Math.sin(b), 0.18 * Math.sin((i + 1) * 2.1)], 0.42, 0.42] });
        }
        return P;
      })(),
      pal: ["#8F7CF0", "#F28A5B", "#F4F1F6", "#F7E35A", "#F4F1F6", "#F7A87A"]
    },
    { // 6. «многолапая»: белая в мелком зерне, лаймовые кончики лап
      kind: "tips", mesh: "ray", k: 0.4,
      prims: [
        { s: [-0.35, 0, 0, 0.85] },
        { s: [0.55, 0.15, -0.1, 0.75] },
        { c: [[-0.35, 0, 0], [-1.45, 0.65, 0.2], 0.5, 0.42] },
        { c: [[-0.35, 0, 0], [-1.2, -0.95, 0.3], 0.5, 0.4] },
        { c: [[0.55, 0.15, 0], [0.75, 1.45, -0.1], 0.42, 0.36] },
        { c: [[0.55, 0.15, 0], [0.25, 1.35, 0.35], 0.36, 0.3] },
        { c: [[0.55, 0.15, 0], [1.6, 0.2, 0.3], 0.45, 0.36] },
        { c: [[0.4, -0.2, 0], [0.75, -1.3, 0.25], 0.42, 0.38] },
        { c: [[-0.2, 0.1, 0], [-0.15, 0.3, 1.15], 0.4, 0.36] }
      ],
      colors: { a: "#F6F4F7", b: "#D9EC4A", c: "#B9A6F2", d: "#FFFFFF" }, tip: 1.42
    },
    { // 7. «облако»: оранжевое со светлыми пятнами — финал
      kind: "beads", mesh: "ray", k: 0.45,
      prims: [
        { s: [0, 0.2, 0, 0.9] },
        { c: [[0, 0.1, 0], [-1.35, 0.3, 0.2], 0.55, 0.55] },
        { c: [[0, 0.2, 0], [1.2, 0.55, -0.45], 0.6, 0.58] },
        { c: [[0, 0, 0], [0.1, -1.45, 0.15], 0.6, 0.45] },
        { c: [[0, 0, 0], [1.05, -0.75, 0.5], 0.5, 0.42] },
        { s: [-0.35, 0.85, -0.3, 0.6] }
      ],
      colors: { a: "#FF7430", b: "#FFD6B8", c: "#FF9A3C", d: "#FFE3A0" }, spotFreq: 3.4, zone: 0.6, glint: 0.7
    }
  ];
  // трубки через точки раскладываем на капсулы
  SHAPES.forEach(function (sh) {
    var out = [];
    sh.prims.forEach(function (p) {
      if (!p.p) { out.push(p); return; }
      for (var i = 0; i < p.p.length - 1; i++) {
        var a = p.p[i], b = p.p[i + 1];
        out.push({ c: [[a[0], a[1], a[2]], [b[0], b[1], b[2]], a[3], b[3]] });
      }
    });
    sh.prims = out;
  });

  function smin(a, b, k) { var h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }
  function sdf(shape, x, y, z) {
    var d = 1e9, P = shape.prims;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], di;
      if (p.s) { var dx = x - p.s[0], dy = y - p.s[1], dz = z - p.s[2]; di = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.s[3]; }
      else {
        var a = p.c[0], b = p.c[1], bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
        var px = x - a[0], py = y - a[1], pz = z - a[2];
        var h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
        var qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
        di = Math.sqrt(qx * qx + qy * qy + qz * qz) - lerp(p.c[2], p.c[3], h);
      }
      d = i ? smin(d, di, shape.k) : di;
    }
    return d;
  }
  function gradient(shape, x, y, z, out) {
    var e = 0.002;
    out[0] = sdf(shape, x + e, y, z) - sdf(shape, x - e, y, z);
    out[1] = sdf(shape, x, y + e, z) - sdf(shape, x, y - e, z);
    out[2] = sdf(shape, x, y, z + e) - sdf(shape, x, y, z - e);
    var l = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }

  // «звёздная» фигура: из центра по каждому направлению ищем поверхность
  function buildRay(shape) {
    var geo = new THREE.SphereGeometry(1, 220, 140);
    var pos = geo.attributes.position, n = pos.count, nor = new Float32Array(n * 3), v = new THREE.Vector3(), g = [0, 0, 0];
    for (var i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      var t = 0, d = sdf(shape, 0, 0, 0), guard = 0;
      while (d < 0 && guard++ < 200) { t += Math.max(-d * 0.9, 0.004); d = sdf(shape, v.x * t, v.y * t, v.z * t); }
      var lo = Math.max(0, t - 0.05), hi = t;
      for (var k = 0; k < 14; k++) { var m = (lo + hi) / 2; if (sdf(shape, v.x * m, v.y * m, v.z * m) < 0) lo = m; else hi = m; }
      t = (lo + hi) / 2;
      pos.setXYZ(i, v.x * t, v.y * t, v.z * t);
      gradient(shape, v.x * t, v.y * t, v.z * t, g);
      nor[i * 3] = g[0]; nor[i * 3 + 1] = g[1]; nor[i * 3 + 2] = g[2];
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return geo;
  }

  // любая форма: «сетка поверхности» (surface nets) по объёмной решётке
  function buildNets(shape) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    shape.prims.forEach(function (p) {
      var pts = p.s ? [[p.s[0], p.s[1], p.s[2], p.s[3]]] : [[p.c[0][0], p.c[0][1], p.c[0][2], p.c[2]], [p.c[1][0], p.c[1][1], p.c[1][2], p.c[3]]];
      pts.forEach(function (q) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a] - q[3]); hi[a] = Math.max(hi[a], q[a] + q[3]); } });
    });
    var pad = shape.k + 0.15, size = 0;
    for (var a = 0; a < 3; a++) { lo[a] -= pad; hi[a] += pad; size = Math.max(size, hi[a] - lo[a]); }
    var h = size / (shape.res || 100);
    var nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
    var F = new Float32Array(nx * ny * nz);
    function I(i, j, k) { return i + nx * (j + ny * k); }
    for (var k = 0; k < nz; k++) for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++)
      F[I(i, j, k)] = sdf(shape, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
    // по точке в каждой клетке, где поверхность проходит через неё
    var cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    function C(i, j, k) { return i + (nx - 1) * (j + (ny - 1) * k); }
    var P = [], E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    var cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1], val = new Float32Array(8);
    for (k = 0; k < nz - 1; k++) for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var neg = 0;
      for (var c = 0; c < 8; c++) { val[c] = F[I(i + cx[c], j + cy[c], k + cz[c])]; if (val[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      var sx = 0, sy = 0, sz = 0, cnt = 0;
      for (var e = 0; e < 12; e++) {
        var a0 = E[e][0], a1 = E[e][1], v0 = val[a0], v1 = val[a1];
        if ((v0 < 0) === (v1 < 0)) continue;
        var t = v0 / (v0 - v1);
        sx += cx[a0] + (cx[a1] - cx[a0]) * t; sy += cy[a0] + (cy[a1] - cy[a0]) * t; sz += cz[a0] + (cz[a1] - cz[a0]) * t; cnt++;
      }
      cellV[C(i, j, k)] = P.length / 3;
      P.push(lo[0] + (i + sx / cnt) * h, lo[1] + (j + sy / cnt) * h, lo[2] + (k + sz / cnt) * h);
    }
    // грани: для каждого ребра решётки со сменой знака — четырёхугольник из соседних клеток
    var idx = [];
    function quad(a, b, c2, d, flip) {
      if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
      if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
    for (k = 1; k < nz - 1; k++) for (j = 1; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var f0 = F[I(i, j, k)], f1 = F[I(i + 1, j, k)];
      if ((f0 < 0) !== (f1 < 0)) quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], f0 < 0);
    }
    for (k = 1; k < nz - 1; k++) for (j = 0; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
      f0 = F[I(i, j, k)]; f1 = F[I(i, j + 1, k)];
      if ((f0 < 0) !== (f1 < 0)) quad(cellV[C(i - 1, j, k - 1)], cellV[C(i - 1, j, k)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], f0 < 0);
    }
    for (k = 0; k < nz - 1; k++) for (j = 1; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
      f0 = F[I(i, j, k)]; f1 = F[I(i, j, k + 1)];
      if ((f0 < 0) !== (f1 < 0)) quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i - 1, j, k)], cellV[C(i, j, k)], f0 < 0);
    }
    // точки — точно на поверхность, нормали — по направлению роста расстояния
    var nor = new Float32Array(P.length), g = [0, 0, 0];
    for (var q = 0; q < P.length; q += 3) {
      for (var it = 0; it < 3; it++) {
        var dd = sdf(shape, P[q], P[q + 1], P[q + 2]);
        gradient(shape, P[q], P[q + 1], P[q + 2], g);
        P[q] -= g[0] * dd; P[q + 1] -= g[1] * dd; P[q + 2] -= g[2] * dd;
      }
      gradient(shape, P[q], P[q + 1], P[q + 2], g);
      nor[q] = g[0]; nor[q + 1] = g[1]; nor[q + 2] = g[2];
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    // проверяем, что треугольники смотрят наружу; если нет — разворачиваем
    var pa = geo.attributes.position, ok = 0, bad = 0, A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), N = new THREE.Vector3();
    for (var t2 = 0; t2 < Math.min(idx.length, 3000); t2 += 3) {
      A.fromBufferAttribute(pa, idx[t2]); B.fromBufferAttribute(pa, idx[t2 + 1]); Cc.fromBufferAttribute(pa, idx[t2 + 2]);
      N.subVectors(B, A).cross(Cc.clone().sub(A));
      if (N.x * nor[idx[t2] * 3] + N.y * nor[idx[t2] * 3 + 1] + N.z * nor[idx[t2] * 3 + 2] > 0) ok++; else bad++;
    }
    if (bad > ok) { for (var r = 0; r < idx.length; r += 3) { var tmp = idx[r + 1]; idx[r + 1] = idx[r + 2]; idx[r + 2] = tmp; } geo.setIndex(idx); }
    return geo;
  }

  function buildGeometry(shape) {
    var geo = shape.mesh === "nets" ? buildNets(shape) : buildRay(shape);
    geo.computeBoundingBox();
    var c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);   // центр в ноль — фигура вращается вокруг себя
    geo.setAttribute("opos", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.array), 3));
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------- материалы ----------
  var NOISE = [
    "vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }",
    "float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
    "float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }",
    // ячейки Вороного: расстояния до двух ближайших центров и векторы к ним
    "void voro(vec3 p, float jit, out float f1, out float f2, out vec3 o1, out vec3 o2){",
    "  vec3 i = floor(p), f = fract(p); f1 = 8.0; f2 = 8.0; o1 = vec3(0.0); o2 = vec3(0.0);",
    "  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){",
    "    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = g + 0.5 + (h33(i + g) - 0.5) * jit - f; float d = dot(o, o);",
    "    if (d < f1){ f2 = f1; o2 = o1; f1 = d; o1 = o; } else if (d < f2){ f2 = d; o2 = o; } }",
    "  f1 = sqrt(f1); f2 = sqrt(f2); }",
    // гранула: купол в ячейке; возвращает градиент высоты (xyz) и саму высоту (w)
    "vec4 bead(vec3 p){ float f1, f2; vec3 o1, o2; voro(p, 0.8, f1, f2, o1, o2);",
    "  float s = sqrt(max(0.0, 1.0 - f1 * f1 * 2.2)); float edge = smoothstep(0.0, 0.16, f2 - f1);",
    "  return vec4(2.2 * o1 / max(s, 0.18) * step(0.001, s) * edge, s * edge); }"
  ].join("\n");
  var HEAD = [
    "varying vec3 vOpos; varying vec3 vNm0, vNm1, vNm2;",
    "uniform float uFreq, uAmp, uSpotFreq, uZone, uGlint, uTip, uLayerMax;",
    "uniform vec3 uColA, uColB, uColC, uColD;",
    "uniform vec3 uPal[6];"
  ].join("\n");

  // для каждого вида поверхности — свой кусок шейдера: цвет (col), затенение в щелях (ao),
  // наклон микрорельефа (gObj), блёстки (glint) и шероховатость (rough)
  var KINDS = {
    beads: [
      "vec3 gp = vOpos * uFreq;",
      "float zone = smoothstep(0.5, 0.58, vn(vOpos * 0.9 + 2.0) * 0.7 + vn(vOpos * 2.3 + 9.0) * 0.3) * uZone;",
      "float spot = smoothstep(0.52, 0.6, vn(vOpos * uSpotFreq) * 0.62 + vn(vOpos * uSpotFreq * 2.4 + 4.0) * 0.38) * (1.0 - zone * 0.85);",
      "vec4 bB = bead(gp), bF = bead(gp * 1.7 + 13.0);",
      "vec3 gObj = mix(bF.xyz * 0.45, bB.xyz * 1.25, spot) * uAmp * uFreq;",
      "float ao = mix(bF.w, bB.w, spot);",
      "vec3 col = mix(mix(uColA, uColC, zone), uColB, spot) * mix(0.62, 1.06, ao);",
      "float glint = smoothstep(0.86, 0.9, vn(vOpos * 60.0 + 31.0)) * uGlint;",
      "float rough = 0.5;"
    ],
    // панцирь: выпуклые плитки и приподнятые белые швы между ними; цвет плавно идёт от оранжевого к жёлтому
    cells: [
      "float f1, f2; vec3 o1, o2; voro(vOpos * uFreq, 0.9, f1, f2, o1, o2);",
      "float e = f2 - f1;",
      "float line = 1.0 - smoothstep(0.04, 0.09, e);",
      "float tt = clamp((e - 0.04) / 0.05, 0.0, 1.0); float dline = -6.0 * tt * (1.0 - tt) / 0.05;",
      "vec3 ge = o1 / max(f1, 1e-3) - o2 / max(f2, 1e-3);",
      "vec3 gObj = (-dline * ge * 0.18 + o1 * 0.7 * (1.0 - line)) * uAmp * uFreq;",
      "float g = smoothstep(-1.6, 1.6, vOpos.x * 0.6 + vOpos.y * 0.8 + (vn(vOpos * 0.9) - 0.5) * 0.5);",
      "vec3 col = mix(uColA, uColB, g * 0.85);",
      "col = mix(col, uColD, smoothstep(0.62, 0.8, vn(vOpos * 0.8 + 5.0)) * 0.55);",
      "float ao = 0.86 + 0.14 * smoothstep(0.1, 0.35, e);",
      "col = mix(col * ao, uColC, line * 0.92);",
      "float glint = 0.0;",
      "float rough = mix(0.42, 0.3, line);"
    ],
    // цветные зоны вокруг кольца, мелкие тёмные крапинки на сиреневом, мелкое зерно
    zones: [
      "float ang = atan(vOpos.y, vOpos.x) / 6.2831853 + 0.5 + (vn(vOpos * 1.3) - 0.5) * 0.14;",
      "float t6 = fract(ang) * 6.0; int i0 = int(floor(t6)); float fz = smoothstep(0.3, 0.7, fract(t6));",
      "vec3 c0 = uPal[0], c1 = uPal[1];",
      "for (int q = 0; q < 6; q++){ if (q == i0){ c0 = uPal[q]; c1 = uPal[q == 5 ? 0 : q + 1]; } }",
      "vec3 col = mix(c0, c1, fz);",
      "float lil = max(0.0, 1.0 - distance(col, uPal[0]) * 2.0);",
      "float speck = step(0.8, vn(vOpos * 150.0)) * lil;",
      "col = mix(col, uPal[0] * 0.45, speck * 0.8);",
      "vec4 bF = bead(vOpos * uFreq);",
      "vec3 gObj = bF.xyz * 0.35 * uAmp * uFreq;",
      "float ao = mix(0.86, 1.0, bF.w);",
      "col *= ao;",
      "float glint = 0.0;",
      "float rough = 0.62;"
    ],
    // белая в мелком зерне, лаймовые кончики лап, сиреневый отлив в тенях
    tips: [
      "float r = length(vOpos) + (vn(vOpos * 2.2) - 0.5) * 0.22;",
      "float tip = smoothstep(uTip, uTip + 0.14, r);",
      "vec4 bF = bead(vOpos * uFreq);",
      "vec3 gObj = bF.xyz * 0.7 * uAmp * uFreq;",
      "float ao = mix(0.8, 1.04, bF.w);",
      "vec3 col = mix(uColA, uColB, tip) * ao;",
      "float glint = smoothstep(0.88, 0.92, vn(vOpos * 90.0 + 7.0)) * 0.35;",
      "float rough = 0.55;"
    ],
    // основа меха: густой подшёрсток (сами волоски — слоями, см. buildFur)
    furbase: [
      "float zone = smoothstep(0.48, 0.53, vn(vOpos * 1.1 + 3.0));",
      "vec3 col = mix(uColA * 0.62, uColC * 0.8, zone);",
      "vec3 gObj = vec3(0.0); float ao = 1.0; float glint = 0.0; float rough = 0.9;"
    ]
  };

  function surfaceMaterial(sh, kind) {
    var c = sh.colors || {};
    function lin(x) { return new THREE.Color(x || "#ffffff").convertSRGBToLinear(); }
    var U = {
      uFreq: { value: kind === "cells" ? 9 : kind === "zones" ? 70 : kind === "tips" ? 60 : 34 },
      uAmp: { value: kind === "cells" ? 0.022 : kind === "tips" ? 0.008 : kind === "zones" ? 0.006 : 0.011 },
      uSpotFreq: { value: sh.spotFreq || 4 }, uZone: { value: sh.zone || 0 }, uGlint: { value: sh.glint || 0 }, uTip: { value: sh.tip || 1.2 }, uLayerMax: { value: 1 },
      uColA: { value: lin(c.a) }, uColB: { value: lin(c.b) }, uColC: { value: lin(c.c) }, uColD: { value: lin(c.d) },
      uPal: { value: (sh.pal || ["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]).map(lin) }
    };
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.85 });
    m.userData.u = U;
    // у каждого вида поверхности свой шейдер — иначе three.js переиспользует первый собранный
    m.customProgramCacheKey = function () { return "surface-" + kind; };
    m.onBeforeCompile = function (s) {
      for (var k in U) s.uniforms[k] = U[k];
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 opos;\nvarying vec3 vOpos; varying vec3 vNm0, vNm1, vNm2;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOpos = opos; vNm0 = normalMatrix[0]; vNm1 = normalMatrix[1]; vNm2 = normalMatrix[2];");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\n" + HEAD + "\n" + NOISE)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + KINDS[kind].join("\n") +
          "\ndiffuseColor.rgb *= col;\ndiffuseColor.rgb = mix(diffuseColor.rgb, uColD, glint);")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(rough, 0.22, glint);")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.35, glint);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uColD * glint * 0.35;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nvec3 gV = mat3(vNm0, vNm1, vNm2) * gObj; gV -= dot(gV, normal) * normal;\nnormal = normalize(normal - gV * (gl_FrontFacing ? 1.0 : -1.0));");
    };
    return m;
  }

  // мех: фигура повторяется слоями чуть выше над поверхностью; в каждом слое остаются только
  // «срезы» волосков — точки, которые к кончику становятся тоньше. Вместе — объёмный ворс.
  function buildFur(sh, geo) {
    var L = sh.layers || 24, c = sh.colors;
    function lin(x) { return new THREE.Color(x).convertSRGBToLinear(); }
    var U = { uLen: { value: sh.furLen || 0.15 }, uFreq: { value: 110 }, uColA: { value: lin(c.a) }, uColB: { value: lin(c.b) }, uColC: { value: lin(c.c) } };
    var g = geo.clone();
    var layer = new Float32Array(L);
    for (var i = 0; i < L; i++) layer[i] = (i + 1) / L;
    g.setAttribute("layer", new THREE.InstancedBufferAttribute(layer, 1));
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.7 });
    m.customProgramCacheKey = function () { return "fur-shells"; };
    m.onBeforeCompile = function (s) {
      for (var k in U) s.uniforms[k] = U[k];
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 opos; attribute float layer; varying vec3 vOpos; varying float vLayer; uniform float uLen;\n" + NOISE)
        .replace("#include <begin_vertex>", [
          "#include <begin_vertex>",
          "vOpos = opos; vLayer = layer;",
          // волоски растут по нормали и чуть «причёсаны» в разные стороны, к кончикам сильнее
          "vec3 comb = vec3(vn(opos * 1.7), vn(opos * 1.7 + 7.0), vn(opos * 1.7 + 13.0)) - 0.5;",
          "transformed += objectNormal * layer * uLen + comb * layer * layer * uLen * 1.1;"
        ].join("\n"));
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vOpos; varying float vLayer; uniform float uFreq; uniform vec3 uColA, uColB, uColC;\n" + NOISE)
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "float zone = smoothstep(0.48, 0.53, vn(vOpos * 1.1 + 3.0));",
          "float lenF = mix(1.0, 0.32, zone);",           // на жёлтых зонах ворс короткий, как бархат
          "if (vLayer > lenF) discard;",
          "float h = vLayer / lenF;",
          "float f1, f2; vec3 o1, o2; voro(vOpos * uFreq, 0.85, f1, f2, o1, o2);",
          "if (f1 > 0.42 * (1.0 - pow(h, 1.1))) discard;",
          "vec3 col = mix(mix(uColA, uColB, h * h), uColC * mix(0.8, 1.1, h), zone);",
          "diffuseColor.rgb *= col * mix(0.5, 1.05, h);"
        ].join("\n"));
    };
    var fur = new THREE.InstancedMesh(g, m, L);
    var id = new THREE.Matrix4();
    for (i = 0; i < L; i++) fur.setMatrixAt(i, id);
    fur.frustumCulled = false;
    return fur;
  }

  // ---------- «комната» со светом: окружение для бликов ----------
  function buildEnv(renderer) {
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0x2c2a2e, side: THREE.BackSide })));
    function box(w, h, x, y, z, c, k) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    box(8, 4, -3, 6, 3.5, 0xffffff, 5.5);
    box(3, 7, 6.5, 0.5, 1.5, 0xffd6ec, 2.6);
    box(3, 7, -6.5, -0.5, -1, 0xcfe6ff, 2.6);
    box(7, 2, 0, -6, 2, 0xffffff, 0.9);
    box(2.5, 2.5, 1.5, 2, -6.5, 0xfff4e0, 2.2);
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    return tex;
  }

  // мягкое пятно тени на «полу» под фигурой
  function shadowTexture() {
    var c = document.createElement("canvas"); c.width = c.height = 256;
    var x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.35, "rgba(0,0,0,.55)"); g.addColorStop(0.7, "rgba(0,0,0,.15)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  // ---------- сцена ----------
  var canvas, renderer, scene, camera, lights = {}, figs = [], shiftX = 0, extra = new THREE.Vector3(), floorShadow;
  var mouse = { x: 0, y: 0, sx: 0, sy: 0, px: null, py: null }, spin = { x: 0, y: 0, vx: 0, vy: 0 }, clock = 0;
  var FLOOR_Y = -2.15;

  function init(el) {
    canvas = el;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.environment = buildEnv(renderer);
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 9.4);

    lights.hemi = new THREE.HemisphereLight(0xffffff, 0xc8502a, 0.18);
    lights.key = new THREE.DirectionalLight(0xfff6ee, 2.4);
    lights.key.position.set(-3, 5, 4.5);
    lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(2048, 2048);
    lights.key.shadow.camera.left = -3.5; lights.key.shadow.camera.right = 3.5;
    lights.key.shadow.camera.top = 3.5; lights.key.shadow.camera.bottom = -3.5;
    lights.key.shadow.radius = 6; lights.key.shadow.bias = -0.0004; lights.key.shadow.normalBias = 0.03;
    lights.pink = new THREE.DirectionalLight(0xffb8dc, 0.9); lights.pink.position.set(4.5, 1, -2.5);
    lights.blue = new THREE.DirectionalLight(0xa8d4ff, 0.8); lights.blue.position.set(-4.5, -1.5, -2);
    scene.add(lights.hemi, lights.key, lights.pink, lights.blue, lights.key.target);

    floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x3a1a0c, transparent: true, opacity: 0.2, depthWrite: false }));
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.renderOrder = -1;
    scene.add(floorShadow);

    SHAPES.forEach(function (sh) { figs.push({ shape: sh, holder: null }); });
    build(0);
    // остальные фигуры строим по одной в свободное время, чтобы страница открылась быстро
    var next = 1;
    (function later() {
      if (next >= figs.length) return;
      setTimeout(function () { build(next++); later(); }, 30);
    })();

    resize();
    window.addEventListener("resize", resize);
  }

  function build(i) {
    var f = figs[i];
    if (f.holder) return f;
    var sh = f.shape, geo = buildGeometry(sh);
    var holder = new THREE.Group();
    var mesh = new THREE.Mesh(geo, surfaceMaterial(sh, sh.kind === "fur" ? "furbase" : sh.kind));
    mesh.castShadow = mesh.receiveShadow = true;
    holder.add(mesh);
    if (sh.kind === "fur") holder.add(buildFur(sh, geo));
    holder.visible = false;
    scene.add(holder);
    f.holder = holder; f.mesh = mesh;
    // размер пятна тени — по габаритам фигуры
    f.radius = geo.boundingSphere.radius;
    return f;
  }

  function resize() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.userData.k = w / h < 1 ? Math.min(1.8, 1.05 / (w / h)) : 1;
    applyShift();
  }
  function applyShift() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (Math.abs(shiftX) > 1e-4) camera.setViewOffset(w, h, -shiftX * w, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  var _e = new THREE.Euler();
  function render(i, c, dt, zoom) {
    dt = Math.min(0.1, dt || 0.016);
    clock += dt;
    var kc = camera.userData.k || 1;
    camera.position.set(0, 0, 9.4 * kc * (zoom || 1));
    camera.lookAt(0, 0, 0);

    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 4));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 4));
    spin.x += spin.vx * dt; spin.y += spin.vy * dt;
    var damp = Math.exp(-dt * 1.6); spin.vx *= damp; spin.vy *= damp;

    var f = build(i);
    for (var k = 0; k < figs.length; k++) if (figs[k].holder) figs[k].holder.visible = k === i;
    var h = f.holder, seed = i * 1.7;
    _e.set(0.35 * Math.sin(c * TAU + seed) + spin.x + mouse.sy * 0.45 + 0.06 * Math.sin(clock * 0.6),
           c * TAU * 0.7 + seed + spin.y + mouse.sx * 0.6 + 0.08 * Math.sin(clock * 0.45 + 1),
           0.15 * Math.sin(c * Math.PI * 2 + seed * 2) + 0.04 * Math.sin(clock * 0.5));
    h.quaternion.setFromEuler(_e);
    var bob = Math.sin(clock * 1.1 + seed);
    h.position.set(extra.x + mouse.sx * 0.12, extra.y + 0.1 * bob - mouse.sy * 0.08, extra.z);

    // тень на полу: чуть бледнеет и расплывается, когда фигура поднимается
    var s = f.radius * 1.9 * (1 + 0.06 * bob);
    floorShadow.position.set(h.position.x, FLOOR_Y + extra.y, h.position.z);
    floorShadow.scale.set(s, s * 0.8, 1);
    floorShadow.material.opacity = 0.2 - 0.04 * bob;

    lights.key.target.position.copy(h.position);
    lights.key.position.set(h.position.x - 3, h.position.y + 5, h.position.z + 4.5);
    renderer.render(scene, camera);
  }

  window.FIG = {
    init: init,
    render: render,
    resize: resize,
    count: SHAPES.length,
    mouse: function (x, y) {
      if (mouse.px !== null) {
        spin.vy += clamp((x - mouse.px) * 6, -0.8, 0.8);
        spin.vx += clamp((y - mouse.py) * 4, -0.6, 0.6);
      }
      mouse.px = x; mouse.py = y; mouse.x = x; mouse.y = y;
    },
    shift: function (fx) { if (Math.abs(fx - shiftX) > 1e-4) { shiftX = fx; applyShift(); } },
    place: function (x, y, z) { extra.set(x || 0, y || 0, z || 0); },
    bounce: function (c) { lights.hemi.groundColor.set(c); },
    get figures() { return figs; },
    get lights() { return lights; },
    shapes: SHAPES
  };
})();

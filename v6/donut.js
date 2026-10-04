/* Живой 3D-бублик — повтор ролика из промпта (10 секунд), но управляемый.
   Бублик собран из цельных кусков: в сборе они стыкуются без швов, поэтому он может
   трескаться, разлетаться, собираться в шар и снова становиться целым.
   Снаружи доступно: DONUT.render(t) — кадр в момент t (0…10 с), DONUT.mouse(x, y),
   а также DONUT.material / DONUT.lights / DONUT.group для будущих экспериментов
   (поворот, материал, свет, форма). */
(function () {
  "use strict";
  var THREE = window.THREE;
  var TAU = Math.PI * 2;

  // ---------- параметры формы ----------
  var R = 1.0;        // радиус кольца
  var r = 0.5;        // радиус «трубки» — бублик пухлый, как в ролике
  var KU = 14;        // кусков по кругу
  var KV = 3;         // кусков вокруг трубки
  var V0 = 0.45;      // поворот линий разлома вокруг трубки
  var N = 12;         // детализация куска

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function ramp(t, a, b) { return smooth(clamp((t - a) / (b - a), 0, 1)); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // складки по кругу, крупные бугры и лёгкая асимметрия
  function disp(u, v) {
    var outer = 0.5 + 0.5 * Math.cos(v);
    // частота складок плавает по кругу — так они неровные, как у мягкого теста
    var ph = 19 * u + 2.2 * Math.sin(2 * u + 0.7) + 1.1 * Math.sin(5 * u + 2.1) + 1.4 * Math.sin(3 * v + u);
    var folds = Math.sin(ph) * (0.024 + 0.014 * Math.sin(4 * u + 1.3)) * outer;
    var folds2 = Math.sin(31 * u - 2.5 * v + 1.7 + 0.8 * Math.sin(7 * u)) * 0.009 * outer;
    var lumps = 0.05 * Math.sin(3 * u + 1.1) * Math.sin(2 * v + 0.4) + 0.035 * Math.sin(5 * u + 2) * Math.cos(3 * v + 1)
              + 0.025 * Math.sin(7 * u + 0.3) * Math.sin(4 * v + 2.2);
    var flat = -0.05 * Math.pow(Math.max(0, Math.sin(v)), 3);   // верх слегка приплюснут
    return folds + folds2 + lumps + flat;
  }
  function surf(u, v, out) {
    var rr = r * (1 + disp(u, v));
    var w = R + rr * Math.cos(v);
    out.set(w * Math.cos(u), w * Math.sin(u), rr * Math.sin(v));
    return out;
  }
  function core(u, v, out) {   // точка ближе к центру трубки — внутренняя грань куска
    var w = R + r * 0.04 * Math.cos(v);
    out.set(w * Math.cos(u), w * Math.sin(u), r * 0.04 * Math.sin(v));
    return out;
  }
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
  function normalAt(u, v, out) {
    var h = 1e-3;
    surf(u + h, v, _a); surf(u - h, v, _b); _a.sub(_b);
    surf(u, v + h, _c); surf(u, v - h, _d); _c.sub(_d);
    out.crossVectors(_a, _c).normalize();
    // наружу от центра трубки
    surf(u, v, _e);
    _d.set(R * Math.cos(u), R * Math.sin(u), 0);
    if (out.dot(_e.sub(_d)) < 0) out.negate();
    return out;
  }

  // линии разлома: волнистые поперёк трубки и вдоль неё
  function bu(k, v) { var kk = ((k % KU) + KU) % KU; return TAU * k / KU + 0.11 * Math.sin(v + kk * 1.9) + 0.05 * Math.sin(2 * v + kk * 0.7); }
  function bv(j, u) { var jj = ((j % KV) + KV) % KV; return TAU * j / KV + V0 + 0.2 * Math.sin(4 * u + jj * 2.3) + 0.07 * Math.sin(9 * u + jj); }
  function corner(k, j) {
    var v = TAU * j / KV + V0, u = 0;
    for (var i = 0; i < 8; i++) { u = bu(k, v); v = bv(j, u); }
    return { u: u, v: v };
  }

  // ---------- зерно, как у гипса/песка: шум прямо в шейдере, привязан к поверхности ----------
  var NOISE = [
    "attribute vec3 opos;", "varying vec3 vOpos;"
  ];
  var NOISE_FN = [
    "varying vec3 vOpos;", "uniform float uGrain;",
    "float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
    "float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);",
    "  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }"
  ].join("\n");
  function sandy(m, amt) {
    m.userData.grain = { value: amt };
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uGrain = m.userData.grain;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + NOISE.join("\n"))
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOpos = opos;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + NOISE_FN)
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "float gA = vn(vOpos * 260.0), gB = vn(vOpos * 90.0 + 7.0), gC = vn(vOpos * 22.0 + 3.0);",
          "float speck = smoothstep(0.78, 0.97, vn(vOpos * 170.0 + 11.0));",
          "diffuseColor.rgb *= 1.0 - uGrain * (0.10 * gA + 0.07 * gB + 0.05 * gC + 0.16 * speck - 0.06);"
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "vec3 gp = vOpos * 120.0;",
          "vec3 gn = vec3(vn(gp) - 0.5, vn(gp + 31.0) - 0.5, vn(gp + 57.0) - 0.5) + 0.6 * vec3(vn(gp * 0.35 + 5.0) - 0.5, vn(gp * 0.35 + 9.0) - 0.5, vn(gp * 0.35 + 13.0) - 0.5);",
          "normal = normalize(normal + uGrain * 0.32 * gn);"
        ].join("\n"));
    };
    return m;
  }

  // ---------- сцена ----------
  var canvas, renderer, scene, camera, group, floor, dust, whole, chunks = [];

  // целый бублик одной сеткой: пока он не треснул, показываем его, а не куски
  function buildWhole() {
    var NU = 240, NV = 72, pos = [], nor = [], col = [], uv = [], idx = [];
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    for (var a = 0; a <= NU; a++) for (var b = 0; b <= NV; b++) {
      var u = a / NU * TAU, v = b / NV * TAU + V0;
      surf(u, v, p); normalAt(u, v, n);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      var sh = clamp(0.92 + disp(u, v) * 2.2, 0.7, 1); col.push(sh, sh, sh);
      uv.push(u / TAU * 3, v / TAU);
    }
    for (a = 0; a < NU; a++) for (b = 0; b < NV; b++) {
      var i0 = a * (NV + 1) + b, i1 = (a + 1) * (NV + 1) + b;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("opos", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    var m = new THREE.Mesh(geo, material);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  var material, fracture, lights = {};
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };

  function buildChunk(k, j) {
    var c00 = corner(k, j), c10 = corner(k + 1, j), c01 = corner(k, j + 1), c11 = corner(k + 1, j + 1);
    // границы куска в координатах (u, v) и патч Кунса между ними — у соседей общие края
    function B(s) { var u = lerp(c00.u, c10.u, s); return [u, bv(j, u)]; }
    function T(s) { var u = lerp(c01.u, c11.u, s); return [u, bv(j + 1, u)]; }
    function L(t) { var v = lerp(c00.v, c01.v, t); return [bu(k, v), v]; }
    function Rr(t) { var v = lerp(c10.v, c11.v, t); return [bu(k + 1, v), v]; }
    function P(s, t) {
      var b = B(s), tt = T(s), l = L(t), rr = Rr(t);
      var out = [0, 0];
      for (var i = 0; i < 2; i++) {
        var p00 = i ? c00.v : c00.u, p10 = i ? c10.v : c10.u, p01 = i ? c01.v : c01.u, p11 = i ? c11.v : c11.u;
        out[i] = (1 - t) * b[i] + t * tt[i] + (1 - s) * l[i] + s * rr[i]
          - ((1 - s) * (1 - t) * p00 + s * (1 - t) * p10 + (1 - s) * t * p01 + s * t * p11);
      }
      return out;
    }
    var pos = [], nor = [], col = [], uv = [], idx = [];
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    var grid = [];
    for (var a = 0; a <= N; a++) {
      grid[a] = [];
      for (var b = 0; b <= N; b++) {
        var q = P(a / N, b / N);
        grid[a][b] = q;
        surf(q[0], q[1], p); normalAt(q[0], q[1], n);
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
        var d = disp(q[0], q[1]);
        var sh = clamp(0.9 + d * 3.0, 0.62, 1);   // впадины складок чуть темнее
        col.push(sh, sh, sh);
        uv.push(q[0] / TAU * 3, q[1] / TAU);
      }
    }
    for (a = 0; a < N; a++) for (b = 0; b < N; b++) {
      var i0 = a * (N + 1) + b, i1 = (a + 1) * (N + 1) + b, i2 = i0 + 1, i3 = i1 + 1;
      idx.push(i0, i1, i2, i2, i1, i3);
    }
    var outer = new THREE.BufferGeometry();
    outer.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    outer.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    outer.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    outer.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    outer.setAttribute("opos", new THREE.Float32BufferAttribute(pos.slice(), 3));
    outer.setIndex(idx);

    // грани разлома: стенки по краям куска и внутренняя грань (гладкие, без полосок)
    var fp = [], fi = [];
    function strip(get) {
      var base = fp.length / 3;
      for (var i = 0; i <= N; i++) {
        var q = get(i);
        surf(q[0], q[1], _a); core(q[0], q[1], _b);
        fp.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
      }
      for (i = 0; i < N; i++) { var o = base + i * 2; fi.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
    strip(function (i) { return grid[i][0]; });
    strip(function (i) { return grid[N - i][N]; });
    strip(function (i) { return grid[0][N - i]; });
    strip(function (i) { return grid[N][i]; });
    var ib = fp.length / 3;
    for (a = 0; a <= N; a++) for (b = 0; b <= N; b++) { var gq = grid[a][b]; core(gq[0], gq[1], _a); fp.push(_a.x, _a.y, _a.z); }
    for (a = 0; a < N; a++) for (b = 0; b < N; b++) {
      var j0 = ib + a * (N + 1) + b, j1 = ib + (a + 1) * (N + 1) + b;
      fi.push(j0, j0 + 1, j1, j1, j0 + 1, j1 + 1);
    }
    var frac = new THREE.BufferGeometry();
    frac.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    frac.setAttribute("opos", new THREE.Float32BufferAttribute(fp.slice(), 3));
    frac.setIndex(fi);
    frac.computeVertexNormals();

    // центр куска — вокруг него он вращается, когда летит
    outer.computeBoundingBox();
    var center = new THREE.Vector3(); outer.boundingBox.getCenter(center);
    var mid = P(0.5, 0.5); core(mid[0], mid[1], _a); center.lerp(_a, 0.35);
    outer.translate(-center.x, -center.y, -center.z);
    frac.translate(-center.x, -center.y, -center.z);

    var g = new THREE.Group();
    var m1 = new THREE.Mesh(outer, material), m2 = new THREE.Mesh(frac, fracture);
    m1.castShadow = m2.castShadow = true; m1.receiveShadow = m2.receiveShadow = true;
    g.add(m1); g.add(m2);
    g.position.copy(center);

    // у каждого куска своя траектория — фиксированная, чтобы прокрутка назад давала тот же полёт
    var rnd = mulberry(k * 31 + j * 7 + 1);
    var radial = new THREE.Vector3(center.x, center.y, 0).normalize();
    var dir = radial.clone().multiplyScalar(0.45).add(new THREE.Vector3((rnd() - .5) * 2.0, (rnd() - .5) * 2.0, (rnd() - .4) * 2.0)).normalize();
    var cl = new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize().multiplyScalar(0.25 + rnd() * 0.45);
    cl.add(radial.clone().multiplyScalar(0.25));
    chunks.push({
      g: g, c0: center.clone(), dir: dir, sp: 0.35 + rnd() * 1.1, up: 0.2 + rnd() * 0.6,
      spin: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(2.6),
      cluster: cl, crot: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6),
      jit: new THREE.Vector3((rnd() - .5) * .16, (rnd() - .5) * .16, (rnd() - .2) * .3),
      jrot: new THREE.Vector3((rnd() - .5) * .8, (rnd() - .5) * .8, (rnd() - .5) * .8)
    });
    return g;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function init(el) {
    canvas = el;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);

    // мягкий студийный свет: небо сверху, основной слева сверху, заполняющий справа
    lights.hemi = new THREE.HemisphereLight(0xffffff, 0xaaa69f, 0.5);
    lights.key = new THREE.DirectionalLight(0xffffff, 1.3);
    lights.key.position.set(-3.5, 4.5, 4);
    lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(1024, 1024);
    lights.key.shadow.camera.left = -6; lights.key.shadow.camera.right = 6;
    lights.key.shadow.camera.top = 6; lights.key.shadow.camera.bottom = -6;
    lights.key.shadow.radius = 6; lights.key.shadow.bias = -0.0008;
    lights.fill = new THREE.DirectionalLight(0xfff8f0, 0.22);
    lights.fill.position.set(4, -1, 3);
    scene.add(lights.hemi, lights.key, lights.fill);

    material = sandy(new THREE.MeshStandardMaterial({ color: 0xd6d2cc, roughness: 0.97, metalness: 0, vertexColors: true }), 1);
    fracture = sandy(new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 1.4);

    group = new THREE.Group();
    for (var k = 0; k < KU; k++) for (var j = 0; j < KV; j++) group.add(buildChunk(k, j));
    whole = buildWhole();
    group.add(whole);
    scene.add(group);

    // пыль, которая летит при разломе
    var dn = 700, dp = new Float32Array(dn * 3), seeds = [];
    var rnd = mulberry(99);
    for (var i = 0; i < dn; i++) {
      var u = rnd() * TAU, v = rnd() * TAU;
      surf(u, v, _a);
      seeds.push({ p: _a.clone(), d: new THREE.Vector3(_a.x, _a.y, 0).normalize().add(new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(1.2)), s: 0.4 + rnd() * 1.6 });
    }
    var dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd6d2cc, size: 0.018, transparent: true, opacity: 0, depthWrite: false }));
    dust.userData.seeds = seeds;
    group.add(dust);

    // пол — только тень, проявляется в конце, когда бублик ложится
    floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.23;
    floor.receiveShadow = true;
    scene.add(floor);

    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // на узком экране отодвигаем камеру, чтобы бублик влезал по ширине
    camera.userData.k = w / h < 1 ? Math.min(1.9, 1.15 / (w / h)) : 1;
    camera.updateProjectionMatrix();
  }

  // ---------- ключевые кадры (по ролику, секунды) ----------
  // cam — положение камеры, look — куда смотрит; p, rot, s — положение, поворот (x,y,z) и масштаб бублика
  var KEYS = [
    { t: 0.0, cam: [0, 0.78, 1.95], look: [0, 0.42, -0.35], p: [0, 0, 0], rot: [-1.45, 0, 0], s: 1 },
    { t: 0.5, cam: [0, 0.3, 2.7], look: [0, 0.18, 0], p: [0, 0, 0], rot: [-0.85, 0, 0.05], s: 1 },
    { t: 1.0, cam: [0, 0, 3.45], look: [0, 0, 0], p: [0, 0, 0], rot: [-0.05, 0, 0], s: 1 },
    { t: 1.5, cam: [0, 0, 4.4], look: [0, 0, 0], p: [0, 0, 0], rot: [0.08, 0.14, 0], s: 1 },
    { t: 2.0, cam: [0, 0, 6.1], look: [0, 0, 0], p: [0.95, 0.2, 0], rot: [0.28, 0.9, -0.15], s: 1 },
    { t: 2.5, cam: [0, 0, 6.6], look: [0, 0, 0], p: [-0.55, 0.05, 0], rot: [0.22, 1.38, 0.25], s: 1 },
    { t: 3.0, cam: [0, 0, 6.2], look: [0, 0, 0], p: [0.12, 0, 0], rot: [0.12, 0.66, 0.06], s: 1 },
    { t: 3.5, cam: [0, 0, 5.7], look: [0, 0, 0], p: [0, 0, 0], rot: [0.04, 0.14, 0], s: 1 },
    { t: 4.6, cam: [0, 0, 5.7], look: [0, 0, 0], p: [0, 0, 0], rot: [0.02, 0.03, 0], s: 1 },
    { t: 7.4, cam: [0, 0, 6.3], look: [0, 0, 0], p: [0.25, 0.2, 0], rot: [0.0, 0.0, 0.08], s: 1 },
    { t: 8.4, cam: [0, 0, 6.3], look: [0, 0, 0], p: [0.55, -0.05, 0], rot: [0.0, 0.0, 0.0], s: 0.95 },
    { t: 9.0, cam: [0, 0.55, 5.8], look: [0.3, -0.35, 0], p: [0.95, -0.55, 0.2], rot: [-1.3, 0, 0.0], s: 0.88 },
    { t: 9.5, cam: [0, 0.55, 5.6], look: [0.4, -0.5, 0], p: [1.1, -0.8, 0.35], rot: [-1.5, 0, 0.0], s: 0.86 },
    { t: 10.05, cam: [0, 0.45, 5.4], look: [0.45, -0.55, 0], p: [1.15, -0.82, 0.4], rot: [-1.57, 0, 0.0], s: 0.85 }
  ];
  function key(t) {
    var i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    var a = KEYS[i], b = KEYS[i + 1], k = smooth(clamp((t - a.t) / (b.t - a.t), 0, 1));
    function L(name, n) { return lerp(a[name][n], b[name][n], k); }
    return {
      cam: [L("cam", 0), L("cam", 1), L("cam", 2)], look: [L("look", 0), L("look", 1), L("look", 2)],
      p: [L("p", 0), L("p", 1), L("p", 2)], rot: [L("rot", 0), L("rot", 1), L("rot", 2)], s: lerp(a.s, b.s, k)
    };
  }

  var CR_DARK = new THREE.Color(0x4a4640), CR_LIGHT = new THREE.Color(0xd2cec8);
  var _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(), _v = new THREE.Vector3();
  function render(t) {
    t = clamp(t, 0, 10.05);
    var f = key(t);
    var kc = camera.userData.k || 1;
    camera.position.set(f.cam[0] * kc, f.cam[1], f.cam[2] * kc);
    camera.lookAt(f.look[0], f.look[1], f.look[2]);
    // лёгкий отклик на курсор: бублик чуть поворачивается к нему
    mouse.sx += (mouse.x - mouse.sx) * 0.06; mouse.sy += (mouse.y - mouse.sy) * 0.06;
    group.position.set(f.p[0], f.p[1], f.p[2]);
    group.rotation.set(f.rot[0] + mouse.sy * 0.08, f.rot[1] + mouse.sx * 0.12, f.rot[2]);
    group.scale.setScalar(f.s);

    // фазы: трещины → разлёт → сборка в шар → укладка → снова целый
    var crack = ramp(t, 4.6, 5.0) * (1 - ramp(t, 9.15, 9.6));
    var ex = Math.pow(ramp(t, 5.0, 7.4), 1.5);
    var gather = ramp(t, 7.4, 8.4);
    var settle = ramp(t, 8.4, 9.0);
    var merge = ramp(t, 9.15, 9.6);

    fracture.color.copy(CR_DARK).lerp(CR_LIGHT, clamp(ex * 1.6, 0, 1));
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i], g = c.g;
      // разлёт
      _v.copy(c.dir).multiplyScalar(0.085 * crack + ex * 1.25 * c.sp);
      _v.y += ex * c.up * 0.6;
      g.position.copy(c.c0).add(_v);
      // в шар
      _a.copy(c.cluster);
      g.position.lerp(_a, gather * (1 - settle));
      // обратно в бублик, но с небольшим разбросом, который исчезает при слиянии
      _b.copy(c.c0).addScaledVector(c.jit, 1 - merge);
      g.position.lerp(_b, settle);
      // вращение кусков
      _eu.set(c.spin.x * ex, c.spin.y * ex, c.spin.z * ex); _q.setFromEuler(_eu);
      _eu.set(c.crot.x, c.crot.y, c.crot.z); _q2.setFromEuler(_eu);
      _q.slerp(_q2, gather);
      _eu.set(c.jrot.x * (1 - merge), c.jrot.y * (1 - merge), c.jrot.z * (1 - merge)); _q2.setFromEuler(_eu);
      _q.slerp(_q2, settle);
      g.quaternion.copy(_q);
      g.scale.setScalar(1 - 0.03 * crack);
    }

    // целый или куски
    var intact = crack < 0.001 && (ex < 0.0001 || merge >= 0.999);
    whole.visible = intact;
    for (i = 0; i < chunks.length; i++) chunks[i].g.visible = !intact;

    // пыль
    var dv = Math.sin(Math.PI * ramp(t, 4.85, 8.2));
    dust.material.opacity = 0.85 * dv;
    var arr = dust.geometry.attributes.position.array, seeds = dust.userData.seeds, e2 = ramp(t, 4.85, 8.2);
    for (var s = 0; s < seeds.length; s++) {
      var sd = seeds[s];
      arr[s * 3] = sd.p.x + sd.d.x * e2 * 1.3 * sd.s;
      arr[s * 3 + 1] = sd.p.y + sd.d.y * e2 * 1.3 * sd.s + e2 * 0.3;
      arr[s * 3 + 2] = sd.p.z + sd.d.z * e2 * 1.3 * sd.s;
    }
    dust.geometry.attributes.position.needsUpdate = true;

    floor.material.opacity = 0.22 * ramp(t, 8.6, 9.4);
    renderer.render(scene, camera);
  }

  window.DONUT = {
    init: init,
    render: render,
    resize: resize,
    mouse: function (x, y) { mouse.x = x; mouse.y = y; },
    get material() { return material; },
    get fracture() { return fracture; },
    get lights() { return lights; },
    get group() { return group; },
    keys: KEYS
  };
})();

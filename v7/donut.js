/* Живой 3D-бублик, версия 2.
   Пухлая форма, поверхность из мелких гранул с пятнами крупных гранул другого цвета,
   мягкий направленный свет и окружение для бликов. Бублик собран из кусков с рваными гранями:
   в сборе они стыкуются без швов, поэтому он может трескаться, разлетаться, собираться и снова
   становиться целым.
   Снаружи: DONUT.render(t) — кадр в момент t (0…10 с), DONUT.mouse(x, y), DONUT.shift(доля ширины),
   DONUT.colors({base, spots, inner, bounce}), DONUT.place(x, y, z) и DONUT.material / DONUT.lights / DONUT.group для экспериментов. */
(function () {
  "use strict";
  var THREE = window.THREE;
  var TAU = Math.PI * 2;

  // ---------- параметры формы ----------
  var R = 1.0;        // радиус кольца
  var r = 0.5;        // радиус «трубки»
  var KU = 16;        // кусков по кругу
  var KV = 4;         // кусков вокруг трубки
  var V0 = 0.45;      // поворот линий разлома вокруг трубки
  var N = 12;         // детализация внешней стороны куска
  var M = 6;          // детализация рваной грани разлома (от поверхности к центру)

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function ramp(t, a, b) { return smooth(clamp((t - a) / (b - a), 0, 1)); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // шум для рваных граней: зависит только от точки в пространстве, поэтому
  // у двух соседних кусков общая грань получается одинаковой и они стыкуются
  function hash(x, y, z) { var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    function c(a, b, d) { return hash(ix + a, iy + b, iz + d); }
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
                lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
  }
  function rough(p, out) {
    var x = p.x, y = p.y, z = p.z;
    out.set(
      (vnoise(x * 3.1, y * 3.1, z * 3.1) - .5) + 0.5 * (vnoise(x * 7.3 + 5, y * 7.3, z * 7.3) - .5) + 0.25 * (vnoise(x * 16 + 9, y * 16, z * 16) - .5),
      (vnoise(x * 3.1 + 17, y * 3.1, z * 3.1) - .5) + 0.5 * (vnoise(x * 7.3, y * 7.3 + 3, z * 7.3) - .5) + 0.25 * (vnoise(x * 16, y * 16 + 4, z * 16) - .5),
      (vnoise(x * 3.1, y * 3.1 + 33, z * 3.1) - .5) + 0.5 * (vnoise(x * 7.3, y * 7.3, z * 7.3 + 8) - .5) + 0.25 * (vnoise(x * 16, y * 16, z * 16 + 2) - .5)
    );
    return out;
  }

  // пухлые подушки по кругу, мягкие складки и асимметрия
  function disp(u, v) {
    var outer = 0.5 + 0.5 * Math.cos(v);
    var ph = 9 * u + 1.6 * Math.sin(2 * u + 0.7) + 0.9 * Math.sin(5 * u + 2.1) + 0.8 * Math.sin(2 * v + u);
    var puff = (0.5 + 0.5 * Math.cos(ph)); puff = puff * puff;              // округлые «подушки»
    var pillows = (puff - 0.45) * (0.075 + 0.025 * Math.sin(3 * u + 1.3)) * (0.35 + 0.65 * outer);
    var folds = Math.sin(23 * u + 1.7 * Math.sin(4 * u) + 1.1 * Math.sin(3 * v + u)) * 0.008 * outer;
    var lumps = 0.055 * Math.sin(3 * u + 1.1) * Math.sin(2 * v + 0.4) + 0.035 * Math.sin(5 * u + 2) * Math.cos(3 * v + 1)
              + 0.022 * Math.sin(7 * u + 0.3) * Math.sin(4 * v + 2.2);
    var flat = -0.05 * Math.pow(Math.max(0, Math.sin(v)), 3);
    return pillows + folds + lumps + flat;
  }
  function surf(u, v, out) {
    var rr = r * (1 + disp(u, v));
    var w = R + rr * Math.cos(v);
    out.set(w * Math.cos(u), w * Math.sin(u), rr * Math.sin(v));
    return out;
  }
  function core(u, v, out) {
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
    surf(u, v, _e);
    _d.set(R * Math.cos(u), R * Math.sin(u), 0);
    if (out.dot(_e.sub(_d)) < 0) out.negate();
    return out;
  }
  function shade(u, v) { return clamp(0.9 + disp(u, v) * 2.4, 0.66, 1); }   // впадины чуть темнее

  // линии разлома: неровные поперёк трубки и вдоль неё
  function bu(k, v) { var kk = ((k % KU) + KU) % KU; return TAU * k / KU + 0.1 * Math.sin(v + kk * 1.9) + 0.05 * Math.sin(2 * v + kk * 0.7) + 0.025 * Math.sin(6 * v + kk * 2.9); }
  function bv(j, u) { var jj = ((j % KV) + KV) % KV; return TAU * j / KV + V0 + 0.17 * Math.sin(4 * u + jj * 2.3) + 0.07 * Math.sin(9 * u + jj) + 0.035 * Math.sin(17 * u + jj * 1.3); }
  function corner(k, j) {
    var v = TAU * j / KV + V0, u = 0;
    for (var i = 0; i < 8; i++) { u = bu(k, v); v = bv(j, u); }
    return { u: u, v: v };
  }

  // ---------- материал: гранулы, пятна, мягкие тени в зазорах ----------
  var GLSL = [
    "varying vec3 vOpos; varying vec3 vNm0, vNm1, vNm2;",
    "uniform float uFreq, uAmp, uSpots;",
    "uniform vec3 uColA, uColB;",
    "vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }",
    "float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
    "float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }",
    // гранула: купол внутри ячейки Вороного, между гранулами — бороздка
    // возвращает высоту (w) и её градиент (xyz) — гладкие купола без «пикселей»
    "vec4 bead(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec3 o1 = vec3(0.0);",
    "  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){",
    "    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = g + h33(i + g) * 0.8 + 0.1 - f; float d = dot(o, o);",
    "    if (d < d1){ d2 = d1; d1 = d; o1 = o; } else if (d < d2){ d2 = d; } }",
    "  float s = sqrt(max(0.0, 1.0 - d1 * 2.2)); float edge = smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));",
    "  vec3 grad = 2.2 * o1 / max(s, 0.18) * step(0.001, s) * edge;",
    "  return vec4(grad, s * edge); }"
  ].join("\n");

  function granular(m, o) {
    var U = {
      uFreq: { value: o.freq }, uAmp: { value: o.amp }, uSpots: { value: o.spots },
      uColA: { value: new THREE.Color(o.a).convertSRGBToLinear() }, uColB: { value: new THREE.Color(o.b).convertSRGBToLinear() }
    };
    m.userData.u = U;
        m.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 opos;\nvarying vec3 vOpos; varying vec3 vNm0, vNm1, vNm2;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOpos = opos; vNm0 = normalMatrix[0]; vNm1 = normalMatrix[1]; vNm2 = normalMatrix[2];");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + GLSL)
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "vec3 gp = vOpos * uFreq;",
          "float spot = smoothstep(0.5, 0.6, vn(vOpos * 3.0) * 0.62 + vn(vOpos * 7.5 + 4.0) * 0.38) * uSpots;",
          "vec4 bB = bead(gp), bF = bead(gp * 1.7 + 13.0);",
          "vec3 gObj = mix(bF.xyz * 0.45, bB.xyz * 1.25, spot) * uAmp * uFreq;",
          "float ao = mix(bF.w, bB.w, spot);",
          "diffuseColor.rgb *= mix(uColA, uColB, spot) * mix(0.6, 1.06, ao);"
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "vec3 gV = mat3(vNm0, vNm1, vNm2) * gObj; gV -= dot(gV, normal) * normal;",
          "normal = normalize(normal - gV * (gl_FrontFacing ? 1.0 : -1.0));"
        ].join("\n"));
    };
    return m;
  }

  // ---------- сцена ----------
  var canvas, renderer, scene, camera, group, floor, dust, debris, whole, chunks = [], debrisData = [];
  var material, fracture, lights = {}, shiftX = 0, extra = new THREE.Vector3();
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };

  function buildWhole() {
    var NU = 260, NV = 80, pos = [], nor = [], col = [], idx = [];
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    for (var a = 0; a <= NU; a++) for (var b = 0; b <= NV; b++) {
      var u = a / NU * TAU, v = b / NV * TAU + V0;
      surf(u, v, p); normalAt(u, v, n);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      var sh = shade(u, v); col.push(sh, sh, sh);
    }
    for (a = 0; a < NU; a++) for (b = 0; b < NV; b++) {
      var i0 = a * (NV + 1) + b, i1 = (a + 1) * (NV + 1) + b;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("opos", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    var m = new THREE.Mesh(geo, material);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  function buildChunk(k, j) {
    var c00 = corner(k, j), c10 = corner(k + 1, j), c01 = corner(k, j + 1), c11 = corner(k + 1, j + 1);
    function B(s) { var u = lerp(c00.u, c10.u, s); return [u, bv(j, u)]; }
    function T(s) { var u = lerp(c01.u, c11.u, s); return [u, bv(j + 1, u)]; }
    function L(t) { var v = lerp(c00.v, c01.v, t); return [bu(k, v), v]; }
    function Rr(t) { var v = lerp(c10.v, c11.v, t); return [bu(k + 1, v), v]; }
    function P(s, t) {
      var b = B(s), tt = T(s), l = L(t), rr = Rr(t), out = [0, 0];
      for (var i = 0; i < 2; i++) {
        var p00 = i ? c00.v : c00.u, p10 = i ? c10.v : c10.u, p01 = i ? c01.v : c01.u, p11 = i ? c11.v : c11.u;
        out[i] = (1 - t) * b[i] + t * tt[i] + (1 - s) * l[i] + s * rr[i]
          - ((1 - s) * (1 - t) * p00 + s * (1 - t) * p10 + (1 - s) * t * p01 + s * t * p11);
      }
      return out;
    }
    // внешняя сторона
    var pos = [], nor = [], col = [], idx = [], grid = [];
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    for (var a = 0; a <= N; a++) {
      grid[a] = [];
      for (var b = 0; b <= N; b++) {
        var q = P(a / N, b / N);
        grid[a][b] = q;
        surf(q[0], q[1], p); normalAt(q[0], q[1], n);
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
        var sh = shade(q[0], q[1]); col.push(sh, sh, sh);
      }
    }
    for (a = 0; a < N; a++) for (b = 0; b < N; b++) {
      var i0 = a * (N + 1) + b, i1 = (a + 1) * (N + 1) + b;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
    var outer = new THREE.BufferGeometry();
    outer.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    outer.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    outer.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    outer.setAttribute("opos", new THREE.Float32BufferAttribute(pos.slice(), 3));
    outer.setIndex(idx);

    // рваные грани разлома: от края поверхности к центру трубки, с шумом посередине
    var fp = [], fi = [], jit = new THREE.Vector3();
    function wall(get) {
      var base = fp.length / 3;
      for (var i = 0; i <= N; i++) {
        var q = get(i);
        surf(q[0], q[1], _a); core(q[0], q[1], _b);
        for (var m = 0; m <= M; m++) {
          var s = m / M;
          _c.copy(_a).lerp(_b, s);
          rough(_c, jit);
          _c.addScaledVector(jit, 0.16 * Math.pow(Math.sin(Math.PI * s), 0.6));
          fp.push(_c.x, _c.y, _c.z);
        }
      }
      for (i = 0; i < N; i++) for (var mm = 0; mm < M; mm++) {
        var o = base + i * (M + 1) + mm, o2 = o + M + 1;
        fi.push(o, o + 1, o2, o2, o + 1, o2 + 1);
      }
    }
    wall(function (i) { return grid[i][0]; });
    wall(function (i) { return grid[N - i][N]; });
    wall(function (i) { return grid[0][N - i]; });
    wall(function (i) { return grid[N][i]; });
    var frac = new THREE.BufferGeometry();
    frac.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    frac.setAttribute("opos", new THREE.Float32BufferAttribute(fp.slice(), 3));
    frac.setIndex(fi);
    frac.computeVertexNormals();

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

    // своя траектория у каждого куска — фиксированная, чтобы прокрутка назад давала тот же полёт
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

  // мелкие обломки: камешки, которые разлетаются вместе с кусками
  function buildDebris() {
    var geo = new THREE.IcosahedronGeometry(1, 2), pa = geo.attributes.position, v = new THREE.Vector3(), jit = new THREE.Vector3();
    for (var i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      rough(v.clone().multiplyScalar(0.7), jit);
      v.multiplyScalar(1 + jit.x * 0.7).add(jit.multiplyScalar(0.35));
      pa.setXYZ(i, v.x, v.y * 0.8, v.z);
    }
    geo.computeVertexNormals();
    var op = new Float32Array(pa.count * 3);
    for (i = 0; i < pa.count; i++) { op[i * 3] = pa.getX(i) * 0.06; op[i * 3 + 1] = pa.getY(i) * 0.06; op[i * 3 + 2] = pa.getZ(i) * 0.06; }
    geo.setAttribute("opos", new THREE.BufferAttribute(op, 3));
    var COUNT = 110, rnd = mulberry(7);
    debris = new THREE.InstancedMesh(geo, fracture, COUNT);
    debris.castShadow = true;
    for (i = 0; i < COUNT; i++) {
      var u = rnd() * TAU, vv = rnd() * TAU, p0 = surf(u, vv, new THREE.Vector3());
      var radial = new THREE.Vector3(p0.x, p0.y, 0).normalize();
      debrisData.push({
        p0: p0, dir: radial.multiplyScalar(0.6).add(new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(2.2)),
        sp: 0.6 + rnd() * 1.6, s: 0.018 + Math.pow(rnd(), 2) * 0.07,
        spin: new THREE.Vector3(rnd() * 8, rnd() * 8, rnd() * 8), late: rnd() * 0.35
      });
    }
    return debris;
  }

  // окружение для мягких бликов: тёплая комната с несколькими «софтбоксами»
  function buildEnv() {
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x3a3634, side: THREE.BackSide })));
    function box(w, h, x, y, z, c, k) {
      var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    box(7, 4, -3, 5, 3, 0xffffff, 5);       // большой сверху слева
    box(3, 6, 5.5, 0.5, 1, 0xfff0e2, 2.4);   // мягкий справа
    box(6, 2, 0, -5, 2, 0xffffff, 1.0);      // отражённый снизу
    box(3, 3, -2, 1, -5.5, 0xfff1e0, 2);     // контровой
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    return tex;
  }

  var COLORS = { base: 0xff6a2c, spots: 0xffd3a1, inner: 0xffb88a };

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
    scene.environment = buildEnv();
    camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);

    // солнечный направленный свет даёт глубокие мягкие тени, как на референсах
    lights.hemi = new THREE.HemisphereLight(0xfff4ea, 0xc8502a, 0.18);
    lights.key = new THREE.DirectionalLight(0xfff3e6, 3.0);
    lights.key.position.set(-3.2, 4.8, 3.6);
    lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(2048, 2048);
    lights.key.shadow.camera.left = -4; lights.key.shadow.camera.right = 4;
    lights.key.shadow.camera.top = 4; lights.key.shadow.camera.bottom = -4;
    lights.key.shadow.radius = 5; lights.key.shadow.bias = -0.0005; lights.key.shadow.normalBias = 0.02;
    lights.rim = new THREE.DirectionalLight(0xffe0c0, 0.6);
    lights.rim.position.set(3.5, 1, -3);
    scene.add(lights.hemi, lights.key, lights.rim);

    material = granular(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, vertexColors: true, envMapIntensity: 0.45 }),
      { freq: 30, amp: 0.012, spots: 1, a: COLORS.base, b: COLORS.spots });
    fracture = granular(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      { freq: 46, amp: 0.008, spots: 0, a: COLORS.inner, b: COLORS.inner });

    group = new THREE.Group();
    for (var k = 0; k < KU; k++) for (var j = 0; j < KV; j++) group.add(buildChunk(k, j));
    whole = buildWhole();
    group.add(whole);
    group.add(buildDebris());
    scene.add(group);

    // пыль
    var dn = 900, dp = new Float32Array(dn * 3), seeds = [], rnd = mulberry(99);
    for (var i = 0; i < dn; i++) {
      var u = rnd() * TAU, v = rnd() * TAU;
      surf(u, v, _a);
      seeds.push({ p: _a.clone(), d: new THREE.Vector3(_a.x, _a.y, 0).normalize().add(new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(1.4)), s: 0.4 + rnd() * 1.6 });
    }
    var dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2c4, size: 0.02, transparent: true, opacity: 0, depthWrite: false }));
    dust.userData.seeds = seeds;
    group.add(dust);

    floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: 0x8a2c00, opacity: 0 }));
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
    camera.userData.k = w / h < 1 ? Math.min(1.9, 1.15 / (w / h)) : 1;
    applyShift();
  }
  // сдвиг картинки вбок (доля ширины экрана): бублик уходит вправо, освобождая место тексту
  function applyShift() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (Math.abs(shiftX) > 1e-4) camera.setViewOffset(w, h, -shiftX * w, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // ---------- ключевые кадры (по ролику, секунды) ----------
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

  var _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(), _v = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _sc = new THREE.Vector3();
  function render(t) {
    t = clamp(t, 0, 10.05);
    var f = key(t);
    var kc = camera.userData.k || 1;
    camera.position.set(f.cam[0] * kc, f.cam[1], f.cam[2] * kc);
    camera.lookAt(f.look[0], f.look[1], f.look[2]);
    mouse.sx += (mouse.x - mouse.sx) * 0.06; mouse.sy += (mouse.y - mouse.sy) * 0.06;
    group.position.set(f.p[0] + extra.x, f.p[1] + extra.y, f.p[2] + extra.z);
    group.rotation.set(f.rot[0] + mouse.sy * 0.08, f.rot[1] + mouse.sx * 0.12, f.rot[2]);
    group.scale.setScalar(f.s);

    // фазы: трещины → разлёт → сборка в шар → укладка → снова целый
    var crack = ramp(t, 4.6, 5.0) * (1 - ramp(t, 9.15, 9.6));
    var ex = Math.pow(ramp(t, 5.0, 7.4), 1.5);
    var gather = ramp(t, 7.4, 8.4);
    var settle = ramp(t, 8.4, 9.0);
    var merge = ramp(t, 9.15, 9.6);

    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i], g = c.g;
      _v.copy(c.dir).multiplyScalar(0.085 * crack + ex * 1.25 * c.sp);
      _v.y += ex * c.up * 0.6;
      g.position.copy(c.c0).add(_v);
      _a.copy(c.cluster);
      g.position.lerp(_a, gather * (1 - settle));
      _b.copy(c.c0).addScaledVector(c.jit, 1 - merge);
      g.position.lerp(_b, settle);
      _eu.set(c.spin.x * ex, c.spin.y * ex, c.spin.z * ex); _q.setFromEuler(_eu);
      _eu.set(c.crot.x, c.crot.y, c.crot.z); _q2.setFromEuler(_eu);
      _q.slerp(_q2, gather);
      _eu.set(c.jrot.x * (1 - merge), c.jrot.y * (1 - merge), c.jrot.z * (1 - merge)); _q2.setFromEuler(_eu);
      _q.slerp(_q2, settle);
      g.quaternion.copy(_q);
      g.scale.setScalar(1 - 0.03 * crack);
    }

    var intact = crack < 0.001 && (ex < 0.0001 || merge >= 0.999);
    whole.visible = intact;
    for (i = 0; i < chunks.length; i++) chunks[i].g.visible = !intact;

    // обломки
    var show = ramp(t, 4.85, 5.2) * (1 - ramp(t, 7.6, 8.4));
    debris.visible = show > 0.001;
    if (debris.visible) {
      for (i = 0; i < debrisData.length; i++) {
        var d = debrisData[i], e = clamp((ramp(t, 4.9, 7.6) - d.late * 0.3) / (1 - d.late * 0.3), 0, 1);
        e = Math.pow(e, 1.3);
        _v.copy(d.p0).addScaledVector(d.dir, e * 1.5 * d.sp);
        _v.y += e * 0.4 - e * e * 0.3;
        _eu.set(d.spin.x * e, d.spin.y * e, d.spin.z * e); _q.setFromEuler(_eu);
        _sc.setScalar(d.s * show);
        _m4.compose(_v, _q, _sc);
        debris.setMatrixAt(i, _m4);
      }
      debris.instanceMatrix.needsUpdate = true;
    }

    var dv = Math.sin(Math.PI * ramp(t, 4.85, 8.2));
    dust.material.opacity = 0.8 * dv;
    var arr = dust.geometry.attributes.position.array, seeds = dust.userData.seeds, e2 = ramp(t, 4.85, 8.2);
    for (var s = 0; s < seeds.length; s++) {
      var sd = seeds[s];
      arr[s * 3] = sd.p.x + sd.d.x * e2 * 1.3 * sd.s;
      arr[s * 3 + 1] = sd.p.y + sd.d.y * e2 * 1.3 * sd.s + e2 * 0.3;
      arr[s * 3 + 2] = sd.p.z + sd.d.z * e2 * 1.3 * sd.s;
    }
    dust.geometry.attributes.position.needsUpdate = true;

    floor.material.opacity = 0.16 * ramp(t, 8.6, 9.4);
    renderer.render(scene, camera);
  }

  function colors(o) {
    function lin(c, v) { c.set(v).convertSRGBToLinear(); }
    if (o.base != null) lin(material.userData.u.uColA.value, o.base);
    if (o.spots != null) lin(material.userData.u.uColB.value, o.spots);
    if (o.inner != null) { lin(fracture.userData.u.uColA.value, o.inner); lin(fracture.userData.u.uColB.value, o.inner); dust.material.color.set(o.inner); }
    if (o.bounce != null) lights.hemi.groundColor.set(o.bounce);   // отсвет от фона снизу
  }

  window.DONUT = {
    init: init,
    render: render,
    resize: resize,
    mouse: function (x, y) { mouse.x = x; mouse.y = y; },
    shift: function (fx) { if (Math.abs(fx - shiftX) > 1e-4) { shiftX = fx; applyShift(); } },
    colors: colors,
    // дополнительный сдвиг бублика в мире (x, y, z) — чтобы он въезжал с разных сторон
    place: function (x, y, z) { extra.set(x || 0, y || 0, z || 0); },
    get material() { return material; },
    get fracture() { return fracture; },
    get lights() { return lights; },
    get group() { return group; },
    keys: KEYS
  };
})();

/* Три живые 3D-фигуры («капли»), которые левитируют и откликаются на курсор.
   Свет стоит в «комнате» неподвижно: софтбоксы, цветные контровые и тени. Когда фигура
   поворачивается — от прокрутки или от курсора — блики и тени по ней ходят.
   Форма каждой фигуры задаётся набором шаров и «капсул», слитых мягко, как ртуть (metaballs).
   Снаружи: FIG.init(canvas), FIG.render(i, c, dt) — фигура i в точке своего отрезка прокрутки c (0…1),
   FIG.mouse(x, y), FIG.shift(доля ширины), FIG.place(x, y), FIG.bounce(цвет снизу). */
(function () {
  "use strict";
  var THREE = window.THREE;
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---------- формы ----------
  // s: шар [x, y, z, r]; c: капсула от a до b с радиусами ra → rb
  var SHAPES = [
    { // «звезда»: четыре лапы и шишка сверху (как сиреневая с жёлтым)
      k: 0.42,
      prims: [
        { s: [0, 0, 0, 0.82] },
        { c: [[0, 0, 0], [-1.25, 0.75, 0.1], 0.55, 0.62] },
        { c: [[0, 0, 0], [1.2, 0.95, -0.25], 0.5, 0.58] },
        { c: [[0, 0, 0], [-1.05, -1.05, 0.15], 0.55, 0.6] },
        { c: [[0, 0, 0], [1.05, -1.0, 0.3], 0.52, 0.58] },
        { c: [[0, 0.3, 0], [0.15, 1.45, 0.35], 0.42, 0.55] }
      ],
      colors: { base: "#F7F5EC", spots: "#7357F2", patch: "#F4E978" }, spotFreq: 4.2, patch: 0.8
    },
    { // «гантель с отростком» (как сине-белая с лаймом)
      k: 0.5,
      prims: [
        { s: [-0.85, -0.55, 0, 0.92] },
        { s: [0.75, 0.8, -0.1, 0.82] },
        { c: [[-0.85, -0.55, 0], [0.75, 0.8, -0.1], 0.42, 0.4] },
        { c: [[0.05, 0.1, 0], [1.15, -0.95, 0.35], 0.34, 0.5] }
      ],
      colors: { base: "#F1F2F8", spots: "#3A35EE", patch: "#B9E27A" }, spotFreq: 5.2, patch: 1
    },
    { // «облако» из нескольких лап (как сиреневая с узором)
      k: 0.45,
      prims: [
        { s: [0, 0.2, 0, 0.9] },
        { c: [[0, 0.1, 0], [-1.35, 0.3, 0.2], 0.55, 0.55] },
        { c: [[0, 0.2, 0], [1.2, 0.55, -0.45], 0.6, 0.58] },
        { c: [[0, 0, 0], [0.1, -1.45, 0.15], 0.6, 0.45] },
        { c: [[0, 0, 0], [1.05, -0.75, 0.5], 0.5, 0.42] },
        { s: [-0.35, 0.85, -0.3, 0.6] }
      ],
      colors: { base: "#6E66FF", spots: "#D9D5FF", patch: "#8C85FF" }, spotFreq: 3.4, patch: 0.5
    }
  ];

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

  // сетка: из центра по каждому направлению ищем поверхность
  function buildGeometry(shape) {
    var geo = new THREE.SphereGeometry(1, 200, 130);
    var pos = geo.attributes.position, n = pos.count;
    var nor = new Float32Array(n * 3), v = new THREE.Vector3();
    var cx = 0, cy = 0, cz = 0;
    for (var i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      var t = 0, d = sdf(shape, 0, 0, 0), guard = 0;
      while (d < 0 && guard++ < 200) { t += Math.max(-d * 0.9, 0.004); d = sdf(shape, v.x * t, v.y * t, v.z * t); }
      var lo = Math.max(0, t - Math.max(0.004, 0.05)), hi = t;
      for (var k = 0; k < 14; k++) { var m = (lo + hi) / 2; if (sdf(shape, v.x * m, v.y * m, v.z * m) < 0) lo = m; else hi = m; }
      t = (lo + hi) / 2;
      var x = v.x * t, y = v.y * t, z = v.z * t, e = 0.003;
      pos.setXYZ(i, x, y, z);
      var gx = sdf(shape, x + e, y, z) - sdf(shape, x - e, y, z);
      var gy = sdf(shape, x, y + e, z) - sdf(shape, x, y - e, z);
      var gz = sdf(shape, x, y, z + e) - sdf(shape, x, y, z - e);
      var gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      nor[i * 3] = gx / gl; nor[i * 3 + 1] = gy / gl; nor[i * 3 + 2] = gz / gl;
      cx += x; cy += y; cz += z;
    }
    // центр масс в ноль — тогда фигура вращается вокруг себя
    cx /= n; cy /= n; cz /= n;
    geo.translate(-cx, -cy, -cz);
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("opos", new THREE.BufferAttribute(new Float32Array(pos.array), 3));
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------- материал: гранулы, пятна крупных гранул и большие цветные зоны ----------
  var GLSL = [
    "varying vec3 vOpos; varying vec3 vNm0, vNm1, vNm2;",
    "uniform float uFreq, uAmp, uSpotFreq, uPatch;",
    "uniform vec3 uColA, uColB, uColC;",
    "vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }",
    "float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
    "float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }",
    "vec4 bead(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec3 o1 = vec3(0.0);",
    "  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){",
    "    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = g + h33(i + g) * 0.8 + 0.1 - f; float d = dot(o, o);",
    "    if (d < d1){ d2 = d1; d1 = d; o1 = o; } else if (d < d2){ d2 = d; } }",
    "  float s = sqrt(max(0.0, 1.0 - d1 * 2.2)); float edge = smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));",
    "  vec3 grad = 2.2 * o1 / max(s, 0.18) * step(0.001, s) * edge;",
    "  return vec4(grad, s * edge); }"
  ].join("\n");

  function granular(o) {
    var U = {
      uFreq: { value: 34 }, uAmp: { value: 0.011 }, uSpotFreq: { value: o.spotFreq }, uPatch: { value: o.patch },
      uColA: { value: new THREE.Color(o.colors.base).convertSRGBToLinear() },
      uColB: { value: new THREE.Color(o.colors.spots).convertSRGBToLinear() },
      uColC: { value: new THREE.Color(o.colors.patch).convertSRGBToLinear() }
    };
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.85 });
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
          // большие цветные зоны (как лайм на гантели) — мелкие гранулы, без пятен
          "float zone = smoothstep(0.5, 0.58, vn(vOpos * 0.9 + 2.0) * 0.7 + vn(vOpos * 2.3 + 9.0) * 0.3) * uPatch;",
          // пятна из крупных гранул
          "float spot = smoothstep(0.52, 0.6, vn(vOpos * uSpotFreq) * 0.62 + vn(vOpos * uSpotFreq * 2.4 + 4.0) * 0.38) * (1.0 - zone * 0.85);",
          "vec4 bB = bead(gp), bF = bead(gp * 1.7 + 13.0);",
          "vec3 gObj = mix(bF.xyz * 0.45, bB.xyz * 1.25, spot) * uAmp * uFreq;",
          "float ao = mix(bF.w, bB.w, spot);",
          "vec3 col = mix(mix(uColA, uColC, zone), uColB, spot);",
          "diffuseColor.rgb *= col * mix(0.62, 1.06, ao);"
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "vec3 gV = mat3(vNm0, vNm1, vNm2) * gObj; gV -= dot(gV, normal) * normal;",
          "normal = normalize(normal - gV * (gl_FrontFacing ? 1.0 : -1.0));"
        ].join("\n"));
    };
    return m;
  }

  // ---------- «комната» со светом: окружение для бликов ----------
  function buildEnv(renderer) {
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0x2c2a2e, side: THREE.BackSide })));
    function box(w, h, x, y, z, c, k) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    box(8, 4, -3, 6, 3.5, 0xffffff, 5.5);     // большой софтбокс сверху слева
    box(3, 7, 6.5, 0.5, 1.5, 0xffd6ec, 2.6);  // розоватый справа
    box(3, 7, -6.5, -0.5, -1, 0xcfe6ff, 2.6); // голубоватый слева сзади
    box(7, 2, 0, -6, 2, 0xffffff, 0.9);       // отражённый снизу
    box(2.5, 2.5, 1.5, 2, -6.5, 0xfff4e0, 2.2);// контровой
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    return tex;
  }

  // ---------- сцена ----------
  var canvas, renderer, scene, camera, lights = {}, figs = [], shiftX = 0, extra = new THREE.Vector3();
  var mouse = { x: 0, y: 0, sx: 0, sy: 0, px: null, py: null }, spin = { x: 0, y: 0, vx: 0, vy: 0 }, clock = 0;

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

    // свет закреплён в комнате, фигура поворачивается внутри него
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
    scene.add(lights.hemi, lights.key, lights.pink, lights.blue);
    // тень следует за фигурой: целимся светом в неё
    scene.add(lights.key.target);

    SHAPES.forEach(function (sh) {
      var mesh = new THREE.Mesh(buildGeometry(sh), granular(sh));
      mesh.castShadow = mesh.receiveShadow = true;
      var holder = new THREE.Group();
      holder.add(mesh);
      holder.visible = false;
      scene.add(holder);
      figs.push({ holder: holder, mesh: mesh, shape: sh });
    });

    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // на узком экране отодвигаем камеру, чтобы фигура влезала по ширине
    camera.userData.k = w / h < 1 ? Math.min(1.8, 1.05 / (w / h)) : 1;
    applyShift();
  }
  function applyShift() {
    var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (Math.abs(shiftX) > 1e-4) camera.setViewOffset(w, h, -shiftX * w, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  var _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
  // i — какая фигура, c — где мы в её отрезке прокрутки (0…1), dt — секунды с прошлого кадра
  function render(i, c, dt, zoom) {
    dt = Math.min(0.1, dt || 0.016);
    clock += dt;
    var kc = camera.userData.k || 1;
    camera.position.set(0, 0, 9.4 * kc * (zoom || 1));
    camera.lookAt(0, 0, 0);

    // курсор: плавный наклон к нему + «толчок» от быстрого движения, который затухает
    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 4));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 4));
    spin.x += spin.vx * dt; spin.y += spin.vy * dt;
    var damp = Math.exp(-dt * 1.6); spin.vx *= damp; spin.vy *= damp;

    for (var k = 0; k < figs.length; k++) figs[k].holder.visible = k === i;
    var f = figs[i], h = f.holder;
    // прокрутка поворачивает фигуру; поверх — левитация, наклон к курсору и инерция
    var seed = i * 1.7;
    _e.set(0.35 * Math.sin(c * TAU + seed) + spin.x + mouse.sy * 0.45 + 0.06 * Math.sin(clock * 0.6),
           c * TAU * 0.7 + seed + spin.y + mouse.sx * 0.6 + 0.08 * Math.sin(clock * 0.45 + 1),
           0.15 * Math.sin(c * Math.PI * 2 + seed * 2) + 0.04 * Math.sin(clock * 0.5));
    h.quaternion.setFromEuler(_e);
    h.position.set(extra.x + mouse.sx * 0.12, extra.y + 0.1 * Math.sin(clock * 1.1 + seed) - mouse.sy * 0.08, extra.z);
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
        // скорость курсора раскручивает фигуру — как будто её задели рукой
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

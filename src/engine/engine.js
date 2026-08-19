/**
 * Promptasy — 引擎層：renderer / scene / camera / 後製 / 主迴圈
 *
 * 美術方向（低成本、高感知質感）：**平靜的夜間探索**。
 *   · 一套統一的色本（天空漸層 → 霧 → 地面 → 各區主色 → UI 全部同源）
 *   · 打光是 key（月光）/ fill（半球環境光）/ rim（暖色邊緣光）三件套
 *   · 天空自帶星空、月暈與極光帶（全部程序生成，零外部資產）
 *   · 後製 = bloom ＋ 自寫的 filmic 色彩分級（抬陰影、輕微冷色偏、柔和暗角）
 *   · 跨區時整體霧色 / 色偏 / 光強會平滑地漂移過去 → 「換了一片土地」的事件感
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  createMoodState,
  starOpacity,
  starScale,
  moonDirection,
  moonLightDirection,
  moonLightElevation,
  moonShadowBias,
  moonPhaseLook,
  auroraOpacityMul,
  AURORA_TINT_PLUS,
  AURORA_TINT_MINUS,
  MOON_DIR_HOUR0,
  SKY_BASE_TOP,
  SKY_BASE_LOW,
  skyMultiplier,
} from './mood.js';
import { normalizeForcedHour } from './hours.js';

/** 全域配色（世界與 UI 共用同一套色，畫面才像同一個作品）。 */
export const PALETTE = Object.freeze({
  sky: 0x101a28,
  skyLow: 0x33465c,
  fog: 0x1e2c40,
  ground: 0x2a3947,
  groundHigh: 0x415a69,
  accent: 0xa9c9d8,
  warm: 0xf0c08a,
  /**
   * v1.2 · P06：邀請琥珀 —— 軟門檻「可以先行前往」的閘門／石座用它，**不是** warm：
   * 暖金只留給成就熱點（過關、精通、找到東西）；邀請是「路開著、你可以來」，比金子灰、比夜色暖一點。
   */
  invite: 0xa8865c,
  moon: 0xdcecf8,
  aurora: 0x6fd7c4,
  deep: 0x080d14,
});

/** 天空漸層的色階（由頂到底）—— 色本的源頭，其他顏色都往這裡靠。 */
const SKY_STOPS = [
  [0.0, '#070b12'],
  [0.34, '#101a28'],
  [0.6, '#22354b'],
  [0.82, '#3d5673'],
  [1.0, '#5b7186'],
];

/**
 * 天空漸層：canvas 貼圖（SKY_STOPS）貼在一顆倒過來的球上。
 * v1.2 · P06：材質換成兩色乘數的 ShaderMaterial —— 貼圖**不重畫**，色彩腳本的 `sky.top/low`
 * 換算成「目標 ÷ 全域基準（PALETTE.sky／skyLow）」的每通道乘數，天頂用 top、地平線用 low、中間 mix。
 * foundations 的 top/low 就是基準 → 乘數逐位元 ＝ 1 → 與 MeshBasicMaterial 時代的畫面完全相同
 * （同一張貼圖、同一個 sRGB 解碼、同一段 tonemapping／colorspace 收尾；e2e 開機校準）。
 */
function makeSkyDome() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of SKY_STOPS) grad.addColorStop(stop, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uMulTop: { value: new THREE.Color(1, 1, 1) },
      uMulLow: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uMulTop;
      uniform vec3 uMulLow;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(uMap, vUv);
        // 地平線（v .5）→ low、天頂（v 1）→ top；地平線以下（看不到）一律 low
        float t = clamp((vUv.y - 0.5) * 2.0, 0.0, 1.0);
        vec3 mul = mix(uMulLow, uMulTop, t);
        gl_FragColor = vec4(texel.rgb * mul, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), mat);
  dome.name = 'sky';
  dome.renderOrder = -10;
  return dome;
}

/** 圓形柔光貼圖（星星、月暈、螢火共用）。 */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(200,225,245,0)', mid = 0.32) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(mid, 'rgba(210,236,250,0.5)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 星空：半球上的 Points，帶輕微閃爍（用 shader 的 sin 做，不動 CPU）。 */
function makeStars(count = 900) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const warmStar = new THREE.Color(0xffe6c4);
  const coolStar = new THREE.Color(0xcfe4ff);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    // 只鋪在地平線以上，且靠近天頂的密度高一點
    const u = Math.random();
    const theta = Math.acos(Math.pow(u, 0.75)); // 0 = 天頂
    const phi = Math.random() * Math.PI * 2;
    const r = 560;
    positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = r * Math.cos(theta) + 20;
    positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
    sizes[i] = 1.1 + Math.pow(Math.random(), 3) * 5.2;
    phases[i] = Math.random() * Math.PI * 2;
    tmp.copy(Math.random() < 0.22 ? warmStar : coolStar).multiplyScalar(0.55 + Math.random() * 0.45);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: makeGlowTexture() },
      uOpacity: { value: 0.9 },
      uScale: { value: 900 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      uniform float uScale;
      void main() {
        vColor = aColor;
        vTwinkle = 0.62 + 0.38 * sin(uTime * 0.9 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * (uScale / max(1.0, -mv.z)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * vTwinkle, tex.a * uOpacity * vTwinkle);
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'stars';
  points.renderOrder = -9;
  points.frustumCulled = false;
  return points;
}

/** 月亮：一顆盤面 ＋ 一層外暈，掛在月光的方向上。 */
function makeMoon(direction) {
  const group = new THREE.Group();
  group.name = 'moon';
  const dir = direction.clone().normalize().multiplyScalar(520);

  const disc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,1)', 'rgba(226,240,255,0)', 0.72),
      color: 0xf2f8ff,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  disc.scale.set(34, 34, 1);
  disc.name = 'moonDisc';

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(190,220,250,0.55)', 'rgba(150,190,235,0)', 0.14),
      color: 0xa8c8ea,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.scale.set(170, 170, 1);
  halo.name = 'moonHalo';

  group.add(halo);
  group.add(disc);
  group.position.copy(dir);
  group.renderOrder = -8;
  return group;
}

/** 極光帶：兩片很淡的曲面，慢慢飄。便宜到幾乎免費，但畫面立刻「有東西」。 */
function makeAurora() {
  const group = new THREE.Group();
  group.name = 'aurora';

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(111,215,196,0)');
  g.addColorStop(0.45, 'rgba(111,215,196,0.55)');
  g.addColorStop(0.72, 'rgba(150,190,235,0.30)');
  g.addColorStop(1, 'rgba(120,160,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  // 縱向刷出不均勻的簾幕感
  ctx.globalCompositeOperation = 'destination-in';
  for (let x = 0; x < 64; x += 1) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.31) * Math.cos(x * 0.13 + 1.1));
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;

  for (const [i, cfg] of [
    { r: 430, y: 180, h: 150, rot: 0.4, opacity: 0.2, repeat: 2.2 },
    { r: 470, y: 230, h: 190, rot: 2.4, opacity: 0.13, repeat: 1.6 },
  ].entries()) {
    const geo = new THREE.CylinderGeometry(cfg.r, cfg.r * 1.06, cfg.h, 48, 1, true, 0, Math.PI * 0.85);
    const mat = new THREE.MeshBasicMaterial({
      map: tex.clone(),
      transparent: true,
      opacity: cfg.opacity,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    mat.map.wrapS = THREE.RepeatWrapping;
    mat.map.repeat.x = cfg.repeat;
    mat.map.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = cfg.y;
    mesh.rotation.y = cfg.rot;
    mesh.renderOrder = -7;
    mesh.userData.drift = 0.004 + i * 0.0026;
    // P05：時辰的極光強度是「基礎 opacity × 乘數」，基礎值留在這裡
    mesh.userData.baseOpacity = cfg.opacity;
    group.add(mesh);
  }
  return group;
}

/**
 * 色彩分級 ＋ 暗角。
 *   · uLift    抬陰影（讓夜景不會死黑，這是「電影感」最便宜的來源）
 *   · uTint    整體色偏（跨區時會平滑漂移到該區主色）
 *   · uSat     飽和度
 *   · uSwell   跨區 / 解鎖時的一瞬亮度湧升
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 1.06 },
    uVignetteDepth: { value: 0.55 },
    uLift: { value: new THREE.Color(0x09111a) },
    uTint: { value: new THREE.Color(0xbcd6e6) },
    uAmount: { value: 0.22 },
    uSat: { value: 1.06 },
    uContrast: { value: 1.05 },
    uSwell: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uVignetteDepth;
    uniform float uAmount;
    uniform float uSat;
    uniform float uContrast;
    uniform float uSwell;
    uniform vec3 uLift;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // 抬陰影：只作用在暗部，亮部保持乾淨
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = 1.0 - smoothstep(0.0, 0.42, luma);
      c.rgb += uLift * shadowMask * 0.75;

      // 色偏（跨區時會漂移到該區主色）
      c.rgb = mix(c.rgb, c.rgb * uTint, uAmount);

      // 柔和的 S 曲線 + 飽和度
      c.rgb = clamp((c.rgb - 0.5) * uContrast + 0.5, 0.0, 4.0);
      float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(g), c.rgb, uSat);

      // 跨區 / 解鎖的光湧：中央偏亮、往外淡出
      vec2 p = vUv - 0.5;
      float d = length(p);
      c.rgb += uTint * uSwell * (1.0 - smoothstep(0.0, 0.75, d)) * 0.55;

      // 暗角（比第一版淡，只是把視線收進畫面中央）
      float v = smoothstep(0.92, 0.28, d * uVignette);
      c.rgb *= mix(1.0 - uVignetteDepth, 1.0, v);

      gl_FragColor = c;
    }
  `,
};

export function createEngine({ container, quality = 'high' }) {
  const highStart = quality === 'high';

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  const width = () => container.clientWidth || window.innerWidth;
  const height = () => container.clientHeight || window.innerHeight;

  renderer.setSize(width(), height());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, highStart ? 2 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = highStart;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('game-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 62, 285);
  const skyDome = makeSkyDome();
  scene.add(skyDome);

  const stars = makeStars(highStart ? 950 : 420);
  scene.add(stars);

  const aurora = makeAurora();
  scene.add(aurora);

  const camera = new THREE.PerspectiveCamera(52, width() / height(), 0.1, 900);
  camera.position.set(0, 12, 22);

  /* --- 燈光：fill（半球）＋ key（月光）＋ rim（暖色邊緣） --- */
  const hemi = new THREE.HemisphereLight(0x8fb4d6, 0x1a2430, 0.52);
  scene.add(hemi);

  // 月亮的起點方向（時辰 0 ＝ 入夜）；P05 起沿同一條弧升降，方位不變（見 mood.js）
  const moonDir = new THREE.Vector3(...MOON_DIR_HOUR0);
  const moonLightDist = moonDir.length();
  const moon = new THREE.DirectionalLight(PALETTE.moon, 0.88);
  moon.position.copy(moonDir);
  if (highStart) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 220;
    const d = 90;
    moon.shadow.camera.left = -d;
    moon.shadow.camera.right = d;
    moon.shadow.camera.top = d;
    moon.shadow.camera.bottom = -d;
    moon.shadow.bias = -0.0012;
  }
  const moonShadowBiasBase = moon.shadow.bias;
  scene.add(moon);
  const moonGroup = makeMoon(moonDir);
  scene.add(moonGroup);
  const moonDisc = moonGroup.getObjectByName('moonDisc');
  const moonHalo = moonGroup.getObjectByName('moonHalo');

  // rim：從背面打過來的暖光，把剪影邊緣勾出來 —— 感知質感的關鍵一盞
  const rim = new THREE.DirectionalLight(PALETTE.warm, 0.42);
  rim.position.set(52, 16, -62);
  scene.add(rim);

  /* --- 後製（可即時開關，給低階機器用） --- */
  let composer = null;
  let bloomPass = null;
  let gradePass = null;
  let usePost = highStart;
  // 關掉後製 = 少了 bloom 與抬陰影，畫面會偏暗 → 用曝光補回來，兩種畫質亮度才一致
  const exposureBoost = () => (usePost ? 1 : 1.3);

  function buildComposer() {
    if (composer) return composer;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.58, 0.82, 0.55);
    composer.addPass(bloomPass);
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
    composer.setSize(width(), height());
    return composer;
  }
  if (usePost) buildComposer();

  function resize() {
    const w = width();
    const h = height();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  /* --- 氛圍狀態：跨區／時辰／色彩腳本全部寫進同一份 target，每幀 lerp 到 now（P05：單一入口） --- */
  const moodState = createMoodState({
    fog: PALETTE.fog,
    tint: 0xbcd6e6,
    hemi: 0.52,
    fogNear: 62,
    fogFar: 285,
    exposure: 1.02,
    skyTop: PALETTE.sky,
    skyLow: PALETTE.skyLow,
  });
  const moodNow = moodState.now;
  /* 天空套用用的暫存（模組層重複使用，每幀零配置） */
  const _moonDir = new THREE.Vector3();
  /* v1.2 · P06：穹頂兩色的基準（＝ mood.js 的 SKY_BASE_*；兩邊必須同值，乘數才會在 foundations 逐位元 ＝ 1） */
  if (PALETTE.sky !== SKY_BASE_TOP || PALETTE.skyLow !== SKY_BASE_LOW) {
    console.warn('[engine] PALETTE.sky/skyLow 與 mood.js SKY_BASE_* 不一致 —— 色彩腳本的天空乘數會偏');
  }
  const _skyBaseTop = new THREE.Color(SKY_BASE_TOP);
  const _skyBaseLow = new THREE.Color(SKY_BASE_LOW);
  const skyUniforms = skyDome.material.uniforms;
  const _phaseLook = { discScale: 34, discOpacity: 1, haloScale: 170, haloOpacity: 0.5 };
  const _auroraPlus = new THREE.Color(AURORA_TINT_PLUS);
  const _auroraMinus = new THREE.Color(AURORA_TINT_MINUS);
  const _white = new THREE.Color(0xffffff);
  /* 時辰覆寫（測試／截圖）：null ＝ 照進度算；設了就由 main.js 的 applyMood 用它 */
  let forcedHour = null;
  const hourListeners = [];
  let swell = 0;

  const clock = new THREE.Clock();
  const updaters = [];
  /**
   * 渲染前 / 渲染後的掛勾（Phase 19）。
   * 後製開啟時一幀會 render 好幾個 pass —— 想量「整幀的 GPU 耗時」就必須
   * 在**所有** pass 之外圍起來，所以這兩排掛勾緊貼著那一行 render 呼叫。
   */
  const preRenderers = [];
  const postRenderers = [];
  let running = false;
  let rafId = 0;

  /** 掛勾用的小工具：推進陣列並回傳解除掛勾的函式。 */
  function hook(list, fn) {
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  /** 把 moodNow 的天空值寫進 uniform／sprite／燈的方向。只在值有動時呼叫；不配置。 */
  function applySky() {
    // 穹頂兩色（P06）：目標 ÷ 基準 → 乘數 uniform（foundations ＝ 1、逐位元）
    skyMultiplier(moodNow.skyTop, _skyBaseTop, skyUniforms.uMulTop.value);
    skyMultiplier(moodNow.skyLow, _skyBaseLow, skyUniforms.uMulLow.value);
    // 星：density → uOpacity / uScale
    stars.material.uniforms.uOpacity.value = starOpacity(moodNow.starDensity);
    stars.material.uniforms.uScale.value = starScale(moodNow.starDensity);
    // 月：alt → sprite 群沿同一條弧一路降到近地平線（8°）
    moonDirection(moodNow.moonAlt, _moonDir);
    moonGroup.position.copy(_moonDir).multiplyScalar(520);
    // 月光（投影的 DirectionalLight）走同一條弧，但仰角下限 22°（見 mood.js）；bias 隨仰角溫和放大
    moonLightDirection(moodNow.moonAlt, _moonDir);
    moon.position.copy(_moonDir).multiplyScalar(moonLightDist);
    moon.shadow.bias = moonShadowBias(moonShadowBiasBase, moonLightElevation(moodNow.moonAlt));
    // 月相：disc / halo 的 scale 與 opacity 交叉（加色混合下「咬掉」做不出來，見 mood.js）
    moonPhaseLook(moodNow.moonPhase, _phaseLook);
    moonDisc.scale.set(_phaseLook.discScale, _phaseLook.discScale, 1);
    moonDisc.material.opacity = _phaseLook.discOpacity;
    moonHalo.scale.set(_phaseLook.haloScale, _phaseLook.haloScale, 1);
    moonHalo.material.opacity = _phaseLook.haloOpacity;
    // 極光：intensity → 各 band 基礎 opacity 的乘數；hue → 材質色白 ↔ 紫／綠
    const mul = auroraOpacityMul(moodNow.auroraIntensity);
    const hue = moodNow.auroraHue;
    for (let i = 0; i < aurora.children.length; i += 1) {
      const band = aurora.children[i];
      band.material.opacity = band.userData.baseOpacity * mul;
      band.material.color.copy(_white).lerp(hue >= 0 ? _auroraPlus : _auroraMinus, Math.abs(hue));
    }
  }

  function applyMood(dt) {
    const k = Math.min(1, dt * 1.6);
    const skyMoving = moodState.step(k);

    if (scene.fog) {
      scene.fog.color.copy(moodNow.fog);
      scene.fog.near = moodNow.fogNear;
      scene.fog.far = moodNow.fogFar;
    }
    scene.background.copy(moodNow.fog).multiplyScalar(0.55);
    hemi.intensity = moodNow.hemi * (1 + swell * 0.55);
    renderer.toneMappingExposure = moodNow.exposure * exposureBoost() * (1 + swell * 0.18);
    if (gradePass) {
      gradePass.uniforms.uTint.value.copy(moodNow.tint);
      gradePass.uniforms.uSwell.value = swell;
    }
    if (skyMoving) applySky();
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    for (const fn of updaters) fn(dt, t);

    stars.material.uniforms.uTime.value = t;
    for (const band of aurora.children) band.rotation.y += band.userData.drift * dt;
    swell = Math.max(0, swell - dt * 0.85);
    applyMood(dt);

    for (const fn of preRenderers) fn(dt, t);
    if (usePost && composer) composer.render(dt);
    else renderer.render(scene, camera);
    for (const fn of postRenderers) fn(dt, t);
  }

  return {
    THREE,
    renderer,
    scene,
    camera,
    lights: { hemi, moon, rim },
    stars,
    aurora,
    /** 月亮的 sprite 群（disc ＋ halo；P05 起會沿弧升降） */
    moonGroup,
    /** 天空穹頂（P06 起材質帶 uMulTop／uMulLow 兩個乘數 uniform） */
    skyDome,

    onUpdate(fn) {
      return hook(updaters, fn);
    },

    /** 這一幀開始畫「之前」（所有 update 都跑完了）。用來圍住整幀的 GPU 量測。 */
    onBeforeRender(fn) {
      return hook(preRenderers, fn);
    },

    /** 這一幀（含所有後製 pass）畫完之後。 */
    onAfterRender(fn) {
      return hook(postRenderers, fn);
    },

    /**
     * 設定當下的氛圍 —— **唯一入口**（跨區、時辰、P06 色彩腳本都走這裡；會平滑漂移過去，不會硬切）。
     * @param {{fog?:*, tint?:*, hemi?:number, fogNear?:number, fogFar?:number, exposure?:number,
     *   moon?:{alt?:number, phase?:number}, stars?:{density?:number}, aurora?:{intensity?:number, hue?:number}}} mood
     */
    setMood(next = {}) {
      moodState.set(next);
    },

    /** 氛圍的純讀快照 `{ target, now }`（測試／除錯用；會配置，別每幀呼叫）。 */
    mood() {
      return moodState.snapshot();
    },

    /**
     * v1.2 · P05：時辰覆寫（測試／截圖用）。`n` 0..3 或 null（回到照進度算）。
     * 引擎自己不算時辰 —— 只記著覆寫值並通知 main.js 的 `applyMood()` 重組一次。
     */
    forceHour(n) {
      // 只收 null／undefined（清掉）或整數 0..3（數字字串 '2' 也算）；其他一律忽略：不改狀態、不通知
      const next = normalizeForcedHour(n);
      if (next === undefined) return forcedHour;
      forcedHour = next;
      for (const fn of hourListeners) fn(forcedHour);
      return forcedHour;
    },
    /** 目前的時辰覆寫值（null ＝ 沒覆寫）。 */
    get forcedHour() {
      return forcedHour;
    },
    /** 訂閱 forceHour（main.js 用它接 applyMood）；回傳解除函式。 */
    onHourForced(fn) {
      return hook(hourListeners, fn);
    },

    /** 一瞬間的光湧（跨區、解鎖、精通時用）。 */
    pulse(amount = 0.6) {
      swell = Math.max(swell, Math.min(1.2, amount));
    },

    /** 目前的畫質。 */
    get quality() {
      return usePost ? 'high' : 'low';
    },

    /**
     * 即時切換畫質（不需重新整理）。
     * high = 後製 ＋ 陰影 ＋ 高 pixelRatio；low = 直接渲染。
     */
    setQuality(next) {
      const high = next !== 'low';
      usePost = high;
      if (high) buildComposer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1));
      if (renderer.shadowMap.enabled !== high) {
        renderer.shadowMap.enabled = high;
        // 切換 shadowMap 需要重編譯材質
        scene.traverse((obj) => {
          if (!obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.needsUpdate = true;
        });
      }
      resize();
      return usePost ? 'high' : 'low';
    },

    /** 給玩家控制器用：奔跑時輕微拉開 FOV。 */
    setFov(fov) {
      const next = THREE.MathUtils.clamp(fov, 40, 80);
      if (Math.abs(camera.fov - next) < 0.01) return;
      camera.fov = next;
      camera.updateProjectionMatrix();
    },

    start() {
      if (running) return;
      running = true;
      clock.start();
      frame();
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    resize,
    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}

export default createEngine;

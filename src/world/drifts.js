/**
 * 每一片土地專屬的空中粒子（v1.2 · P12）
 *
 * 在這之前，全世界只有一層螢火（`world.js` 的 `buildMotes()`）——12 片土地共用同一種東西，
 * 只有密度（`REGION_ATMOSPHERE.motes`）與顏色不同。這一層補的是「**空氣本身**也換了」：
 * 走進沉書檔案庫，飄的是紙屑；走進契約鍛冶場，飄的是爐火的餘燼；走進減法之庭，
 * 幾乎什麼都不飄。
 *
 * **為什麼不叫 `motes.js`**（P12 規格建議的檔名）：`motes` 這個名字已經是
 * `world.js` 那一層全域螢火的節點名（`scripts/collision-audit.mjs` 的例外表也認這個名字）。
 * 再開一個 `motes.js` 只會讓「哪一個 motes」變成每次接手都要重問一次的問題。
 *
 * 硬規則：
 *   · **一區一個 `THREE.Points`、一個 draw call**，12 區共用**同一個材質與同一張貼圖**。
 *   · **0 新光源**（加色混合的自發光點）。
 *   · **低畫質整層關**：`group.visible = false` ＋ 每幀零工作。畫質是**當下**問的
 *     （`qualityOf()`），玩家在設定裡切換不必重建世界 —— 同 `rubric-fx.js` 的作法。
 *   · **`reducedMotion` 只留靜態的點**：位置建構時就是終態，`update()` 一個位元組都不寫
 *     （WORLD §2.4：關掉的是「動」，不是「回應」—— 點還在、還會亮）。
 *   · **零每幀配置**：暫存都在模組層，tick 裡不 `new`、不 `map/filter`、不建閉包；
 *     離鏡頭 `CULL_M` 公尺以外的土地整層跳過。
 */
import * as THREE from 'three';

/**
 * 離鏡頭這麼遠的**土地中心**就整層不算（每幀迴圈的距離分級，WORLD §6.2）。
 *
 * 量的是到土地中心的距離，所以要含得住半徑最大的那一片（62 公尺）再加上鏡頭的視距 ——
 * 這個數字就是最後真的拿去比的那一個（P12 審查前是 `CULL_M + 60`，改 `CULL_M` 不會生效）。
 */
export const CULL_M = 180;
/** 高畫質時每一片土地的粒子數上限（再乘上該區的 `motes` 密度倍率）。 */
export const BASE_COUNT = 90;

/**
 * 每一片土地的空氣長什麼樣。
 *
 * `shape` 這些點撒在哪裡：
 *   `disc`    全區均勻（預設）
 *   `ring`    繞著地標的一圈
 *   `columns` 聚成幾根往上的柱
 *   `low`     貼著地面
 * `y`      離地的高度區間（公尺）
 * `rise`   每秒往上飄幾公尺（到頂就回到底 —— 餘燼、紙屑用）
 * `bob`    上下擺的振幅（公尺）
 * `swirl`  水平繞圈的半徑（公尺）
 * `speed`  擺動與繞圈的角速度
 * `tone`   顏色往「該區螢火色」以外再偏一點（0 ＝ 就用螢火色；正 ＝ 往暖、負 ＝ 往冷）
 *
 * 每一組都對得上那片土地的傳說鉤（WORLD §1.4），不是隨手調的數字。
 */
export const DRIFTS = Object.freeze({
  // 中央高原：把話說圓 —— 光屑繞著大圈慢慢轉
  foundations: { shape: 'ring', y: [1.4, 7], rise: 0, bob: 0.5, swirl: 2.2, speed: 0.26, tone: 0 },
  // 階梯迴廊：一階一階往上 —— 聚成幾根往上竄的柱
  reasoning: { shape: 'columns', y: [0.8, 14], rise: 1.1, bob: 0.2, swirl: 0.5, speed: 0.4, tone: -0.1 },
  // 沉書檔案庫：枯掉的那幾頁 —— 紙屑慢慢往下落
  grounding: { shape: 'disc', y: [0.6, 11], rise: -0.55, bob: 0.35, swirl: 1.1, speed: 0.22, tone: 0.25 },
  // 齒輪工坊：打鐵的火星 —— 短促、貼低、抖得快
  orchestration: { shape: 'low', y: [0.4, 3.6], rise: 0.35, bob: 0.6, swirl: 0.35, speed: 1.15, tone: 0.3 },
  // 面具劇場：舞台的粉塵 —— 橫著漂，幾乎不升不降
  config: { shape: 'disc', y: [1.2, 8], rise: 0, bob: 0.28, swirl: 2.8, speed: 0.2, tone: 0.15 },
  // 量器坊：熄了火 —— 塵埃緩緩沉降到刻度上
  forms: { shape: 'disc', y: [0.5, 9], rise: -0.28, bob: 0.16, swirl: 0.7, speed: 0.16, tone: -0.05 },
  // 契約鍛冶場：爐子還溫著 —— 餘燼往上竄，全場最多
  toolcraft: { shape: 'columns', y: [0.5, 12], rise: 1.4, bob: 0.3, swirl: 0.8, speed: 0.8, tone: 0.4 },
  // 護欄崗：最冷、螢火最少 —— 幾乎不動的冷塵
  wards: { shape: 'disc', y: [1.0, 6], rise: 0.05, bob: 0.12, swirl: 0.25, speed: 0.1, tone: -0.25 },
  // 校驗場：光被折過一次 —— 一半往上、一半往下的兩層
  refinery: { shape: 'ring', y: [0.8, 10], rise: 0.5, bob: 0.45, swirl: 1.2, speed: 0.34, tone: -0.1, mirror: true },
  // 減法之庭：東西都被搬走了 —— 最少、最慢、最低
  frugality: { shape: 'low', y: [0.4, 4], rise: 0.08, bob: 0.14, swirl: 0.3, speed: 0.12, tone: 0 },
  // 觀象臺：整片都朝東北仰起來 —— 斜斜往上升
  sight: { shape: 'disc', y: [1.2, 16], rise: 0.9, bob: 0.22, swirl: 0.9, speed: 0.3, tone: -0.2 },
  // 分歧之廳：兩份相反的守則並排 —— 分成左右兩束
  divergence: { shape: 'columns', y: [1.0, 9], rise: 0.3, bob: 0.3, swirl: 1.5, speed: 0.28, tone: 0.05 },
});

/** 圓形柔光貼圖（12 區共用一張）。 */
let sharedTexture = null;
function driftTexture() {
  if (sharedTexture) return sharedTexture;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  sharedTexture = new THREE.CanvasTexture(c);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedTexture;
}

/** 12 區共用的那一個材質。 */
let sharedMaterial = null;
function driftMaterial() {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.PointsMaterial({
    map: driftTexture(),
    size: 0.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: true,
  });
  return sharedMaterial;
}

/*
 * **這一層刻意沒有 dispose**（P09 的教訓：模組層的共用快取被任何一個實例釋放，
 * 其他還活著的世界就從畫面上消失）。材質與貼圖各一份、常駐，整個 process 只做一次；
 * 每一組粒子自己的 geometry 由 `createDrifts().dispose()` 釋放。
 */

const _warm = new THREE.Color(0xf0c08a);
const _cool = new THREE.Color(0xbfe4ff);
const _tint = new THREE.Color();

/** 可重現的亂數（同一片土地每次蓋出來的空氣一樣）。 */
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const seedOf = (id) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * 蓋出一整層「每區一種空氣」。
 *
 * @param {object} opts
 * @param {Array<{id:string,x:number,z:number,radius:number}>} opts.sites 土地表
 * @param {(x:number,z:number)=>number} opts.heightAt 地形高度
 * @param {(id:string)=>string|number} opts.particleOf 該區的螢火色
 * @param {(id:string)=>number} opts.densityOf 該區的密度倍率（`REGION_ATMOSPHERE.motes`）
 * @param {(id:string)=>number[]|null} [opts.landmarkOf] 該區地標的 [x, z]（`ring` 用；沒有就用中心）
 * @param {boolean} [opts.reducedMotion]
 * @param {()=>string} [opts.qualityOf] **當下**的畫質（低畫質整層關）
 * @returns {{group:THREE.Group, layers:Array, update:(dt:number,t:number,cam:object)=>void, dispose:()=>void}}
 */
export function createDrifts({
  sites,
  heightAt,
  particleOf,
  densityOf,
  landmarkOf = null,
  reducedMotion = false,
  qualityOf = null,
}) {
  const group = new THREE.Group();
  group.name = 'drifts';
  const material = driftMaterial();
  const layers = [];

  for (const site of sites) {
    const spec = DRIFTS[site.id];
    if (!spec) continue;
    const density = Math.max(0.2, Math.min(2, densityOf ? densityOf(site.id) : 1));
    const n = Math.max(12, Math.round(BASE_COUNT * density));
    const rand = makeRandom(seedOf(site.id));

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const baseX = new Float32Array(n);
    const baseY = new Float32Array(n);
    const baseZ = new Float32Array(n);
    const phase = new Float32Array(n);
    const riseAt = new Float32Array(n);
    const span = new Float32Array(n);

    _tint.set(particleOf ? particleOf(site.id) || '#cfe8f6' : '#cfe8f6');
    if (spec.tone > 0) _tint.lerp(_warm, Math.min(0.6, spec.tone));
    else if (spec.tone < 0) _tint.lerp(_cool, Math.min(0.6, -spec.tone));

    const lm = landmarkOf ? landmarkOf(site.id) : null;
    const cx = spec.shape === 'ring' && lm ? lm[0] : site.x;
    const cz = spec.shape === 'ring' && lm ? lm[1] : site.z;
    // `columns`：先抽幾根柱的位置，點再撒在柱的四周（一片土地看起來就有幾道往上的氣流）
    const colCount = spec.shape === 'columns' ? Math.max(3, Math.round(site.radius / 12)) : 0;
    const cols = [];
    for (let i = 0; i < colCount; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = (0.35 + rand() * 0.55) * site.radius;
      cols.push([site.x + Math.cos(a) * r, site.z + Math.sin(a) * r]);
    }

    for (let i = 0; i < n; i += 1) {
      let x;
      let z;
      if (spec.shape === 'ring') {
        const a = rand() * Math.PI * 2;
        const r = site.radius * (0.32 + rand() * 0.36);
        x = cx + Math.cos(a) * r;
        z = cz + Math.sin(a) * r;
      } else if (spec.shape === 'columns') {
        const c = cols[i % cols.length];
        const a = rand() * Math.PI * 2;
        const r = 2 + rand() * 5;
        x = c[0] + Math.cos(a) * r;
        z = c[1] + Math.sin(a) * r;
      } else {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * site.radius * 0.94;
        x = site.x + Math.cos(a) * r;
        z = site.z + Math.sin(a) * r;
      }
      /*
       * 一律夾回自己那一片土地（`ring` 以地標為圓心 —— 校驗場的鏡子與中央高原的斷環
       * 都不站在中心，不夾的話有些點會飄到隔壁土地上，那就不是「這片土地的空氣」了）。
       */
      const dx = x - site.x;
      const dz = z - site.z;
      const dd = Math.hypot(dx, dz);
      const rMax = site.radius * 0.94;
      if (dd > rMax) {
        x = site.x + (dx / dd) * rMax;
        z = site.z + (dz / dd) * rMax;
      }
      const lo = spec.y[0];
      const hi = spec.y[1];
      /*
       * 會往上飄的那幾層（`rise !== 0`），高度的變化交給 `update()` 的 `dy`（0…span）——
       * 這裡**只把起點散開，不再自己加一次高度**。P12 審查前兩邊各加一次，
       * 天花板變成 `hi + span`（齒輪工坊宣告 12m、實測飄到 25.9m）。
       * 不飄的那幾層（`rise === 0`）沒有 `dy`，起點就是它最後的高度，照舊散在 [lo, hi]。
       */
      const spread = Math.pow(rand(), spec.shape === 'low' ? 1.2 : 1.6) * (hi - lo);
      const y = heightAt(x, z) + lo + (spec.rise !== 0 ? 0 : spread);
      baseX[i] = x;
      baseY[i] = y;
      baseZ[i] = z;
      span[i] = hi - lo;
      phase[i] = rand() * Math.PI * 2;
      // 會飄的那幾層：起點的高低改由 `dy` 的初始相位表示（一樣散得開，但吃得到天花板）
      riseAt[i] = spec.rise !== 0 ? spread : 0;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const j = 0.78 + rand() * 0.36;
      colors[i * 3] = _tint.r * j;
      colors[i * 3 + 1] = _tint.g * j;
      colors[i * 3 + 2] = _tint.b * j;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geo, material);
    points.name = `drift:${site.id}`;
    points.frustumCulled = false;
    group.add(points);
    layers.push({ id: site.id, spec, points, n, baseX, baseY, baseZ, phase, riseAt, span, cx: site.x, cz: site.z });
  }

  /**
   * 每幀：只動中心離鏡頭 `CULL_M` 公尺內的那幾片土地。
   * `reducedMotion` 或低畫質時整支是一個 if 就回去了（零工作）。
   */
  function update(dt, t, camera) {
    const low = qualityOf ? qualityOf() === 'low' : false;
    if (group.visible === low) group.visible = !low;
    if (low || reducedMotion) return;
    const camX = camera && camera.position ? camera.position.x : 0;
    const camZ = camera && camera.position ? camera.position.z : 0;
    for (let li = 0; li < layers.length; li += 1) {
      const layer = layers[li];
      const dx = layer.cx - camX;
      const dz = layer.cz - camZ;
      if (dx * dx + dz * dz > CULL_M * CULL_M) continue;
      const spec = layer.spec;
      const arr = layer.points.geometry.attributes.position.array;
      for (let i = 0; i < layer.n; i += 1) {
        const ph = layer.phase[i];
        const s = layer.span[i];
        // 往上（或往下）飄，到頂就回到底 —— 用取餘數，不需要每個點自己記狀態
        let dy = 0;
        if (spec.rise !== 0) {
          const travel = (t * spec.rise + layer.riseAt[i]) % s;
          dy = travel < 0 ? travel + s : travel;
          if (spec.mirror && (i & 1) === 1) dy = s - dy; // 校驗場：一半往上、一半往下
        }
        arr[i * 3 + 1] = layer.baseY[i] + dy + Math.sin(t * spec.speed + ph) * spec.bob;
        if (spec.swirl > 0) {
          arr[i * 3] = layer.baseX[i] + Math.cos(t * spec.speed * 0.7 + ph) * spec.swirl;
          arr[i * 3 + 2] = layer.baseZ[i] + Math.sin(t * spec.speed * 0.7 + ph) * spec.swirl;
        }
      }
      layer.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    for (const layer of layers) layer.points.geometry.dispose();
    group.clear();
    layers.length = 0;
  }

  return { group, layers, update, dispose };
}

export default { createDrifts, DRIFTS, CULL_M, BASE_COUNT };

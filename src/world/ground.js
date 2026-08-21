/**
 * 地面的材質語言（v1.2 · P12）
 *
 * 站長的回饋是「區域顏色我看不出來」。P06c 已經證實一半的答案是**路上要有東西**
 * （沒有物件就沒有東西可以被那一盞主色補光打到），這一格補的是另一半：
 * **地面自己也要說出換了一片土地**。
 *
 * 三件事，全部是**頂點色**（不改高度場 → 不影響可行走判定與碰撞，也不下載任何貼圖）：
 *
 *   ① **每區兩色基底**：`color-script.json` 的 `groundLow`／`groundHigh`
 *      取代全域的 `PALETTE.ground`／`groundHigh`，低處一色、高處一色（沿用原本的高度階）。
 *   ② **低頻碎紋**：一層 value noise（週期 20 公尺 ＋ 8 公尺兩階），只改亮度 ±6%
 *      —— 遠看是「這片土地有紋理」，近看不會變成噪點。**低畫質整層關掉**（只留基底）。
 *   ③ **區界 6 公尺漸變**：兩片土地相接的地方（加建的院落與母土地）用
 *      `groundBlend()` 交叉淡入，不是一條硬邊。判準與 `regionAt()` 完全一樣
 *      （**正規化距離** `d / radius`），所以「顏色的界線」與「地界」是同一條線。
 *
 * 純函式 ＋ 一個 `THREE.Color` 的輸出參數，`world.js` 的 `buildTerrain()` 逐頂點呼叫；
 * 不 import `world.js`（會變成循環），土地表由呼叫端遞進來 —— 跟 `screens.js` 同一個模式。
 */
import * as THREE from 'three';

/** 區界漸變的帶寬（公尺）：兩片土地相接處，顏色在這麼寬的一條帶裡交出去。 */
export const GROUND_BLEND_M = 6;
/** 橋面漸變吃得到多寬（公尺，離橋中線）—— 比 `LANE_HALF`＋護欄再寬一點就夠。 */
export const SPAN_HALF_W = 14;
/** 碎紋的兩階週期（公尺）與振幅（相對亮度）。 */
export const GRAIN_PERIOD_A = 20;
export const GRAIN_PERIOD_B = 8;
export const GRAIN_AMOUNT = 0.06;

/** 一個 32 位元整數雜湊 → 0..1（可重現、不配置、不依賴 Math.random）。 */
function hash2(i, j) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** 一階 value noise（雙線性 ＋ smoothstep），回 0..1。 */
function valueNoise(x, z, period) {
  const fx = x / period;
  const fz = z / period;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fade(fx - ix);
  const tz = fade(fz - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/**
 * 低頻碎紋：兩階 value noise 疊起來，回 **-1..1**。
 * 週期刻意都大於玩家的視野尺度（20 / 8 公尺）—— 它是「這片土地的紋理」，不是雜訊。
 */
export function groundGrain(x, z) {
  return (valueNoise(x, z, GRAIN_PERIOD_A) - 0.5) * 1.3 + (valueNoise(x + 91.7, z - 53.3, GRAIN_PERIOD_B) - 0.5) * 0.7;
}

/**
 * 這一點的「土地歸屬權重」（加起來 ＝ 1）。
 *
 * 判準與 `regionAt()` 一樣是**正規化距離** `d / radius` —— 離自己中心越近（相對於自己的大小）
 * 的那一片贏。差別只在這裡不是「贏者全拿」：落後的那一片在 `blendM` 公尺內線性交出去，
 * 所以加建的院落與母土地之間是一條 6 公尺寬的漸變帶，不是一條硬邊。
 *
 * 換算成公尺是用**贏家的半徑**當尺（`(ratio - best) * radius`），一片土地內部的
 * 正規化距離差乘上自己的半徑就是實際的公尺數。
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<{id:string,x:number,z:number,radius:number}>} sites
 * @param {number} [blendM]
 * @returns {Array<{id:string, w:number}>} 沒有任何土地含得住這一點 → 空陣列（虛空）
 */
export function groundBlend(x, z, sites, blendM = GROUND_BLEND_M) {
  let best = Infinity;
  let bestRadius = 1;
  for (const s of sites) {
    const ratio = Math.hypot(x - s.x, z - s.z) / s.radius;
    if (ratio <= 1 && ratio < best) {
      best = ratio;
      bestRadius = s.radius;
    }
  }
  if (!Number.isFinite(best)) return [];
  const scale = bestRadius / blendM;
  const out = [];
  let sum = 0;
  for (const s of sites) {
    const ratio = Math.hypot(x - s.x, z - s.z) / s.radius;
    if (ratio > 1) continue;
    const w = 1 - (ratio - best) * scale;
    if (w <= 0) continue;
    out.push({ id: s.id, w });
    sum += w;
  }
  for (const o of out) o.w /= sum;
  return out;
}

/**
 * 橋面（兩片土地半徑之間的那一段）在這一點的漸變權重。
 *
 * `u` 是**沿橋**的位置：0 ＝ 這頭土地的邊界、1 ＝ 那頭土地的邊界 ——
 * 於是橋的兩端與各自的土地顏色**剛好接得上**，中間是一段連續的過渡。
 *
 * 為什麼要回一串而不是「最近的那一條」：橋是從中央高原**放射**出去的，
 * 靠近高原時好幾條的橫向距離都在 `SPAN_HALF_W` 之內 —— 挑最近的那一條會在
 * 兩條橋的分界上跳色（實測 0.038）。照橫向距離加權混起來就沒有那條線。
 * 離所有橋都太遠 ＝ 真的虛空，回空陣列。
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<{fromId:string,toId:string,ax:number,az:number,bx:number,bz:number,aR:number,bR:number}>} links
 * @returns {Array<{fromId:string,toId:string,u:number,w:number}>}
 */
export function spansAt(x, z, links) {
  const out = [];
  let sum = 0;
  for (const l of links) {
    const dx = l.bx - l.ax;
    const dz = l.bz - l.az;
    const len = Math.hypot(dx, dz) || 1;
    const t = ((x - l.ax) * dx + (z - l.az) * dz) / (len * len);
    const px = l.ax + dx * t;
    const pz = l.az + dz * t;
    const perp = Math.hypot(x - px, z - pz);
    if (perp >= SPAN_HALF_W) continue;
    const along = t * len;
    const inner = len - l.bR;
    if (along <= l.aR || along >= inner) continue; // 這一段已經是土地自己的事
    const w = 1 - perp / SPAN_HALF_W;
    out.push({ fromId: l.fromId, toId: l.toId, u: (along - l.aR) / Math.max(1e-3, inner - l.aR), w, near: w });
    sum += w;
  }
  for (const o of out) o.w /= sum;
  return out;
}

const _span = new THREE.Color();
const _low = new THREE.Color();
const _high = new THREE.Color();
const _mix = new THREE.Color();

/**
 * 地面的**基底色**（頂點色的第二層）：每區兩色 ＋ 區界漸變 ＋（可選）低頻碎紋。
 *
 * 這一支是 `buildTerrain()` 逐頂點呼叫的那一支，也是 `test:rubric` 量「兩區分不分得出來」
 * 與「漸變帶多寬」的那一支 —— 畫出來的顏色與量到的顏色是同一個函式算的。
 *
 * @param {THREE.Color} out 寫進這裡（不配置）
 * @param {number} x
 * @param {number} z
 * @param {number} y      這一點的地形高度（高度階用）
 * @param {object} opts
 * @param {(id:string)=>{low:string|number, high:string|number}} opts.toneOf 每區的兩色基底
 * @param {Array} opts.sites 土地表（`REGION_SITES`）
 * @param {Array} [opts.links] 橋／頸口（`bridgeSpans()` 的輸出）—— 沒給就退回舊行為
 * @param {boolean} [opts.grain] 要不要碎紋（低畫質 = false）
 * @returns {THREE.Color} out
 */
export function groundBaseColor(out, x, z, y, { toneOf, sites, links = null, grain = true }) {
  const t = Math.max(0, Math.min(1, (y + 2.5) / 7));
  const blend = groundBlend(x, z, sites);
  /*
   * 兩層疊起來：**土地的色** ＋ **橋面的色**，照離橋中線的距離互相讓位。
   *
   * 橋面（兩片土地的半徑之間那一段）不屬於任何一片土地，`groundBlend()` 回空陣列；
   * 直接拿中央高原那一組當底會在每一條橋的兩端各留一條看得見的硬邊（P12 審查實測 0.098）。
   * 而且有的橋會**穿過另一片土地的圓**（sight 那條穿過分歧之廳）—— 只挑一邊就會在
   * 圓的邊界上再跳一次色。所以兩邊都算，再用同一條橫向斜坡混：
   * 中線上是橋的色、`SPAN_HALF_W` 之外完全是土地的色，中間連續。
   */
  out.setRGB(0, 0, 0);
  if (blend.length) {
    for (const b of blend) {
      const tone = toneOf(b.id);
      _low.set(tone.low);
      _high.set(tone.high);
      _mix.copy(_low).lerp(_high, t);
      out.r += _mix.r * b.w;
      out.g += _mix.g * b.w;
      out.b += _mix.b * b.w;
    }
  } else {
    // 真的虛空（也是橋面斜坡的外側退路）：用中央高原那一組當底，外面還會往 edge 壓暗
    const tone = toneOf(sites.length ? sites[0].id : 'foundations');
    _low.set(tone.low);
    _high.set(tone.high);
    out.copy(_low).lerp(_high, t);
  }

  const spans = links ? spansAt(x, z, links) : [];
  if (spans.length) {
    let wSpan = 0;
    _span.setRGB(0, 0, 0);
    for (const sp of spans) {
      const a = toneOf(sp.fromId);
      const b = toneOf(sp.toId);
      _low.set(a.low).lerp(_high.set(b.low), sp.u);
      _high.set(a.high).lerp(_mix.set(b.high), sp.u);
      _mix.copy(_low).lerp(_high, t);
      _span.r += _mix.r * sp.w;
      _span.g += _mix.g * sp.w;
      _span.b += _mix.b * sp.w;
      if (sp.near > wSpan) wSpan = sp.near;
    }
    out.lerp(_span, wSpan);
  }

  if (grain) {
    const k = 1 + groundGrain(x, z) * GRAIN_AMOUNT;
    out.multiplyScalar(k);
  }
  return out;
}

export default { GROUND_BLEND_M, SPAN_HALF_W, spansAt, GRAIN_AMOUNT, GRAIN_PERIOD_A, GRAIN_PERIOD_B, groundGrain, groundBlend, groundBaseColor };

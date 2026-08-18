/**
 * Promptasy — 一夜的時辰（v1.2 · P05）
 *
 * 天空是進度的外顯：這一夜隨著你把話說清楚而推進 ——
 *   入夜 → 深夜 → 月落 → 星最亮之夜（終態）。
 * **永遠是夜。沒有黎明、沒有魚肚白、沒有東方發白**（roadmap 鐵則 3；WORLD.md §2.2）。
 *
 * 這一檔全是純函式、零 three.js、零 DOM：
 *   · `hourOf()`      進度 → 時辰（index 0..3 ＋ 連續的 p）
 *   · `hourFactor()`  時辰 → 一組「因子」（只乘、只加，不換任何區域色系）
 *   · `composeMood()` 區域色盤 × 時辰因子 → 交給 `engine.setMood()` 的那一包
 *
 * 時辰改變是低頻事件（進區／進程變化），不在每幀算；平滑交給引擎的 moodNow lerp。
 * P06 的區域色彩腳本要接在 `composeMood()` 的第一個參數上（同一個入口）。
 */

/** 四個時辰的 id（0..3）。終態是「星最亮之夜」，不是黎明。 */
export const HOUR_IDS = Object.freeze(['dusk', 'midnight', 'moonset', 'starlit']);

/** 進度權重：精通區 0.5、技能 0.3、濁靈 0.2 —— 三者全滿 p 才到 1。 */
export const HOUR_WEIGHTS = Object.freeze({ mastered: 0.5, skills: 0.3, murks: 0.2 });

/** 時辰門檻：p < 0.25 入夜、< 0.5 深夜、< 1 月落、= 1 星最亮之夜。 */
export const HOUR_THRESHOLDS = Object.freeze([0.25, 0.5, 1]);

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const numOr0 = (v) => (Number.isFinite(v) ? v : 0);

/**
 * 進度 → 時辰。
 * 三項各自是「已收／總數」的比值 × 權重；**總數為 0 的那一項跳過、權重重新正規化**
 * （例如某份資料檔沒有濁靈 → 只看精通與技能，星最亮之夜仍到得了）。全部總數都是 0 → p 0。
 * @param {{mastered?:number, masteredTotal?:number, skills?:number, skillsTotal?:number, murks?:number, murksTotal?:number}|null} s
 * @returns {{index:0|1|2|3, p:number}}
 */
export function hourOf(s = {}) {
  const src = s && typeof s === 'object' ? s : {};
  const terms = [
    [HOUR_WEIGHTS.mastered, numOr0(src.mastered), numOr0(src.masteredTotal ?? 12)],
    [HOUR_WEIGHTS.skills, numOr0(src.skills), numOr0(src.skillsTotal ?? 130)],
    [HOUR_WEIGHTS.murks, numOr0(src.murks), numOr0(src.murksTotal ?? 8)],
  ];
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < terms.length; i += 1) {
    const [w, n, total] = terms[i];
    if (!(total > 0)) continue;
    sum += w * clamp01(n / total);
    wsum += w;
  }
  const p = wsum > 0 ? clamp01(sum / wsum) : 0;
  // 浮點：三個比值各自 ≤ 1，權重和是 1 —— 全滿時 p 可能落在 1 − ε，用 1 − 1e-9 當「全部收齊」
  const full = p >= 1 - 1e-9;
  let index = 3;
  if (!full) {
    if (p < HOUR_THRESHOLDS[0]) index = 0;
    else if (p < HOUR_THRESHOLDS[1]) index = 1;
    else index = 2;
  }
  return { index, p: full ? 1 : p };
}

/**
 * 時辰因子表。**入夜（0）的因子必須讓畫面與沒有時辰之前逐值相同**
 * （fogMul 1、hemiAdd 0、exposureMul 1；moon/stars/aurora 的值就是引擎的預設校準點）。
 * 時辰只乘因子、不換色系；終態是星最亮之夜（霧略亮、hemi 略抬、星滿、極光偏紫），沒有黎明。
 */
const FACTORS = Object.freeze([
  Object.freeze({ id: 'dusk', fogMul: 1.0, hemiAdd: 0, exposureMul: 1.0, moon: Object.freeze({ alt: 0.75, phase: 0.3 }), stars: Object.freeze({ density: 0.7 }), aurora: Object.freeze({ intensity: 0.5, hue: 0 }) }),
  Object.freeze({ id: 'midnight', fogMul: 0.95, hemiAdd: -0.03, exposureMul: 0.98, moon: Object.freeze({ alt: 0.5, phase: 0.5 }), stars: Object.freeze({ density: 0.8 }), aurora: Object.freeze({ intensity: 0.7, hue: 0 }) }),
  Object.freeze({ id: 'moonset', fogMul: 0.9, hemiAdd: -0.06, exposureMul: 0.96, moon: Object.freeze({ alt: 0.2, phase: 0.75 }), stars: Object.freeze({ density: 0.9 }), aurora: Object.freeze({ intensity: 0.85, hue: 0 }) }),
  Object.freeze({ id: 'starlit', fogMul: 1.05, hemiAdd: 0.02, exposureMul: 1.03, moon: Object.freeze({ alt: 0.05, phase: 1.0 }), stars: Object.freeze({ density: 1.0 }), aurora: Object.freeze({ intensity: 1.0, hue: 0.4 }) }),
]);

/**
 * @param {number} index 0..3（超出範圍夾回去）
 */
export function hourFactor(index) {
  const i = Number.isFinite(index) ? Math.min(3, Math.max(0, Math.round(index))) : 0;
  return FACTORS[i];
}

/** 顏色（number / '#rrggbb' / 'rrggbb' / '#rgb'）→ 整數 0xRRGGBB；認不得的回 null（**絕不**變成黑）。 */
function toHex(c) {
  if (typeof c === 'number') return Number.isFinite(c) ? c & 0xffffff : null;
  if (typeof c === 'string') {
    const s = c.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
    if (/^[0-9a-f]{3}$/i.test(s)) return parseInt(s.split('').map((x) => x + x).join(''), 16);
  }
  return null;
}

/**
 * 顏色 × 亮度（每個通道等比乘、夾 0..255）—— 色相不變、只變亮度。
 * 只處理 number 與 `#rrggbb`／`#rgb` 字串；其他東西（THREE.Color、'rgb(...)'、undefined…）
 * **原樣回傳**，不會被變成黑（引擎的 `Color.set()` 自己認得那些）。mul 為 1 時可解析的顏色回整數原值。
 */
export function scaleColor(color, mul) {
  const hex = toHex(color);
  if (hex == null) return color;
  if (mul === 1) return hex;
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * mul)));
  return (ch(hex >> 16) << 16) | (ch((hex >> 8) & 0xff) << 8) | ch(hex & 0xff);
}

/**
 * 區域色盤 × 時辰因子 → `engine.setMood()` 的一整包。純函式。
 *   fog      乘亮度（色相不變）
 *   tint     原樣（時辰不換區域色系）
 *   hemi     加
 *   exposure 乘
 *   fogNear / fogFar 原樣
 *   moon / stars / aurora 直接帶（因子表的值）
 *
 * @param {{fog:*, tint:*, hemi:number, fogNear:number, fogFar:number, exposure:number}} atmo `atmosphereFor(regionId)`（P06 的色彩腳本會從這裡進來）
 * @param {ReturnType<typeof hourFactor>} factor
 */
export function composeMood(atmo, factor) {
  const a = atmo && typeof atmo === 'object' ? atmo : {};
  const f = factor || FACTORS[0];
  const out = {
    moon: { alt: f.moon.alt, phase: f.moon.phase },
    stars: { density: f.stars.density },
    aurora: { intensity: f.aurora.intensity, hue: f.aurora.hue },
  };
  // 顏色：沒給就不帶這個鍵（引擎的 target 保持原值）；認不得的原樣帶過去，絕不變黑
  if (a.fog != null) out.fog = scaleColor(a.fog, f.fogMul);
  if (a.tint != null) out.tint = a.tint;
  if (Number.isFinite(a.hemi)) out.hemi = a.hemi + f.hemiAdd;
  if (Number.isFinite(a.fogNear)) out.fogNear = a.fogNear;
  if (Number.isFinite(a.fogFar)) out.fogFar = a.fogFar;
  if (Number.isFinite(a.exposure)) out.exposure = a.exposure * f.exposureMul;
  return out;
}

/**
 * `engine.forceHour(n)` 的輸入正規化（純函式）：
 *   null / undefined → null（清掉覆寫）；整數 0..3（或數字字串 '2'）→ 該整數；
 *   其他（''、false、NaN、'3px'、{}、2.5、9、-2…）→ undefined ＝ **忽略**（不改狀態、不通知）。
 */
export function normalizeForcedHour(n) {
  if (n == null) return null;
  if (typeof n === 'number' || (typeof n === 'string' && n.trim() !== '')) {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 0 && v <= 3) return v;
  }
  return undefined;
}

/**
 * 「上一次真的送進 setMood 的 {region, hour}」備忘：同一對就略過（進程一變 applyMood 就會被叫一次，
 * 多半時辰沒動、區也沒換 —— 不必重送）。`force` 一律當作有變（開機、forceHour）。純狀態、零依賴。
 */
export function createMoodMemo() {
  let region = null;
  let hour = null;
  return {
    /** 有變（或 force）→ 記下並回 true；同一對 → false。 */
    changed(regionId, hourIndex, force = false) {
      if (!force && region === regionId && hour === hourIndex) return false;
      region = regionId;
      hour = hourIndex;
      return true;
    },
    /** 上一次記下的那一對（測試用）。 */
    last() {
      return { region, hour };
    },
  };
}

export default { hourOf, hourFactor, composeMood, scaleColor, createMoodMemo, normalizeForcedHour, HOUR_IDS, HOUR_WEIGHTS, HOUR_THRESHOLDS };

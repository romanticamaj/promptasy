/**
 * Promptasy — 區域色彩腳本（v1.2 · P06）
 *
 * 走進新的一片土地，「顏色變了」就是進度感。每區一組色：
 *   skyTop / skyLow  天空穹頂上緣／地平線的目標色（相對全域 PALETTE.sky／skyLow 的微偏；永遠是夜）
 *   fog / tint       就是 world.js 的 REGION_ATMOSPHERE 現值（那裡是真身；json 只是複本，這裡逐值驗）
 *   key              每區那一盞主色補光的顏色（預設區主色）
 *   rim              道具自發光補色（預設 kitFor().light）
 *   particle         螢火色（預設區主色往 #dff0fb 靠 0.45 —— 就是 P06 之前 buildMotes 的算法）
 *
 * 表寫在資料檔 `src/data/color-script.json`（`authored:"game"`、純視覺、無出處），由 main.js 開機時
 * `loadColorScript(json)` 交進來（node 測試也是這樣餵：這一檔不直接 import json，node 與 vite 兩邊都不必特判）。
 * 這一檔只讀＋驗＋退回：
 *   · `colorScriptFor(regionId)` 回 `composeMood()` 吃的那一包（fog/tint/hemi/fogNear/fogFar/exposure/motes
 *     ＋ 新鍵 `sky:{top,low}` ＋ key/rim/particle）。**氣氛七鍵永遠是 `atmosphereFor(regionId)` 自己的**
 *     （那裡才是真身；色彩腳本壞了也不會把 reasoning 的霧換成 foundations 的）；只有腳本那幾鍵
 *     （sky/key/rim/particle）**逐鍵**退回預設 —— sky → 全域基準、key/rim/particle → null（world.js 用舊預設）。
 *   · 時辰因子仍只乘不換色（P05）；`engine.setMood()` 仍是唯一入口 —— 這裡只是入口前面那一格。
 *
 * 零 three.js、零 DOM：色彩數學自己寫（sRGB hex ↔ HSL），node 裡直接可測。
 */
import { REGION_ATMOSPHERE, atmosphereFor } from './world.js';

/** 一個 `#rrggbb`。 */
export const HEX_RE = /^#[0-9a-f]{6}$/;

/** 全域天空基準（與 engine.js 的 PALETTE.sky／skyLow 同值；engine 端會 assert 一致）。 */
export const SKY_BASE = Object.freeze({ top: '#101a28', low: '#33465c' });

/** 微偏容差：色相 ±12°、亮度 ±0.08、飽和 ±0.2；天空／霧的 HSL 亮度上限 0.35（仍是夜）。 */
export const SKY_TOLERANCE = Object.freeze({ hueDeg: 12, lightness: 0.08, saturation: 0.2, maxLightness: 0.35 });

/** 每區必備的七個色鍵。 */
export const COLOR_KEYS = Object.freeze(['skyTop', 'skyLow', 'fog', 'tint', 'key', 'rim', 'particle']);

/** 數字色 → `#rrggbb`（小寫）。 */
export const hex6 = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** `#rrggbb` → HSL（在 sRGB 空間算；只拿來驗容差與夜色門檻，不進渲染）。 */
export function hexToHsl(hex) {
  const s = String(hex || '').trim().toLowerCase();
  if (!HEX_RE.test(s)) return null;
  const r = parseInt(s.slice(1, 3), 16) / 255;
  const g = parseInt(s.slice(3, 5), 16) / 255;
  const b = parseInt(s.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s: sat, l };
}

/** 兩個色相（0..1）之間的最短夾角，以度為單位。 */
export function hueDeltaDeg(h1, h2) {
  let d = Math.abs(h1 - h2) % 1;
  if (d > 0.5) d = 1 - d;
  return d * 360;
}

/**
 * 有號的色相偏移（度，-180..180）：`hex` 相對 `baseHex` 偏了幾度（色卡表與 rubric 共用；不各自再算一次）。
 * 任一邊不是 `#rrggbb` → 0。
 */
export function hueDelta(hex, baseHex) {
  const c = hexToHsl(hex);
  const b = hexToHsl(baseHex);
  if (!c || !b) return 0;
  let d = (c.h - b.h) * 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 從一段原始碼裡切出 `head(...) {` 之後那一對大括號的本體（含括號）；找不到 → ''。
 * 靜態掃描用（rubric 的「每幀迴圈零配置」、色卡表腳本）—— 一份實作，測試與腳本都 import 這一支。
 * @param {string} src
 * @param {string} head  函式名（不含括號）
 * @param {number} [from]  從哪個位移開始找
 */
export function bodyOf(src, head, from = 0) {
  const re = new RegExp(`\\b${head}\\s*\\([^)]*\\)\\s*\\{`, 'g');
  re.lastIndex = from;
  const hit = re.exec(String(src || ''));
  if (!hit) return '';
  const open = src.indexOf('{', hit.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

/**
 * 驗一份色彩腳本（純函式）。回傳問題清單（空陣列＝過）。
 * @param {object} data   color-script.json 的內容
 * @param {object} atmo   REGION_ATMOSPHERE（fog/tint 要逐值相等）
 */
export function validateColorScript(data, atmo = REGION_ATMOSPHERE) {
  const problems = [];
  if (!data || typeof data !== 'object') return ['not an object'];
  if (data.authored !== 'game') problems.push('authored must be "game"');
  const regions = data.regions && typeof data.regions === 'object' ? data.regions : null;
  if (!regions) return [...problems, 'regions missing'];
  const want = Object.keys(atmo);
  for (const id of want) if (!regions[id]) problems.push(`region missing: ${id}`);
  for (const id of Object.keys(regions)) if (!atmo[id]) problems.push(`unknown region: ${id}`);
  /*
   * 基準與容差**一律用模組常數**（SKY_BASE／SKY_TOLERANCE）：json 裡的 `base` 區塊只是給人讀的說明，
   * 不能拿來放寬自己的驗證 —— 它跟常數不一致就是一條警告，但驗證結果不因它而變。
   */
  const baseTop = hexToHsl(SKY_BASE.top);
  const baseLow = hexToHsl(SKY_BASE.low);
  const tol = SKY_TOLERANCE;
  if (data.base && typeof data.base === 'object') {
    if (data.base.skyTop !== undefined && data.base.skyTop !== SKY_BASE.top) problems.push(`base.skyTop ${data.base.skyTop} ≠ SKY_BASE.top ${SKY_BASE.top}（json 的 base 只是說明，驗證用模組常數）`);
    if (data.base.skyLow !== undefined && data.base.skyLow !== SKY_BASE.low) problems.push(`base.skyLow ${data.base.skyLow} ≠ SKY_BASE.low ${SKY_BASE.low}（json 的 base 只是說明，驗證用模組常數）`);
    const bt = data.base.tolerance;
    if (bt && typeof bt === 'object') {
      for (const k of Object.keys(SKY_TOLERANCE)) {
        if (bt[k] !== undefined && bt[k] !== SKY_TOLERANCE[k]) problems.push(`base.tolerance.${k} ${bt[k]} ≠ SKY_TOLERANCE.${k} ${SKY_TOLERANCE[k]}（json 的 base 只是說明，驗證用模組常數）`);
      }
    }
  }
  for (const id of Object.keys(regions)) {
    const row = regions[id];
    const a = atmo[id];
    if (!row || typeof row !== 'object') {
      problems.push(`${id}: row not an object`);
      continue;
    }
    for (const k of COLOR_KEYS) {
      if (!HEX_RE.test(String(row[k] || ''))) problems.push(`${id}.${k}: not #rrggbb (${row[k]})`);
    }
    if (!a) continue;
    if (HEX_RE.test(String(row.fog)) && row.fog !== hex6(a.fog)) problems.push(`${id}.fog ${row.fog} ≠ REGION_ATMOSPHERE ${hex6(a.fog)}`);
    if (HEX_RE.test(String(row.tint)) && row.tint !== hex6(a.tint)) problems.push(`${id}.tint ${row.tint} ≠ REGION_ATMOSPHERE ${hex6(a.tint)}`);
    for (const [k, base] of [
      ['skyTop', baseTop],
      ['skyLow', baseLow],
    ]) {
      const c = hexToHsl(row[k]);
      if (!c || !base) continue;
      if (hueDeltaDeg(c.h, base.h) > tol.hueDeg + 1e-9) problems.push(`${id}.${k}: hue off by ${hueDeltaDeg(c.h, base.h).toFixed(1)}° (> ${tol.hueDeg})`);
      if (Math.abs(c.l - base.l) > tol.lightness + 1e-9) problems.push(`${id}.${k}: lightness off by ${(c.l - base.l).toFixed(3)} (> ${tol.lightness})`);
      if (Math.abs(c.s - base.s) > tol.saturation + 1e-9) problems.push(`${id}.${k}: saturation off by ${(c.s - base.s).toFixed(3)} (> ${tol.saturation})`);
    }
    for (const k of ['skyTop', 'skyLow', 'fog']) {
      const c = hexToHsl(row[k]);
      if (c && c.l > tol.maxLightness) problems.push(`${id}.${k}: lightness ${c.l.toFixed(3)} > ${tol.maxLightness} (not night)`);
    }
  }
  return problems;
}

/* --- 模組狀態：載入的那一份表（沒載入前 = 空表 → 一律退回「只有 atmosphere ＋ 全域天空基準」） --- */
let script = null;
let problems = Object.freeze([]);
let badRegions = new Set();
/** 區 → 驗不過的鍵（`${id}.${key}: …` 那種問題）；colorScriptFor 逐鍵退回時看這裡。 */
let badKeys = new Map();

/**
 * 載入色彩腳本（開機一次；node 測試也走這裡）。回傳問題清單（空＝全過）。
 * 有問題就印警告、那些區退回 foundations —— 遊戲照跑（護欄 5）。
 */
export function loadColorScript(data) {
  script = data && typeof data === 'object' ? data : null;
  problems = Object.freeze(validateColorScript(script));
  // 只有「某一區」的問題才讓那一區退回預設（`base.*` 那種全表警告不算在任何一區頭上）
  const regional = problems.filter((p) => !/^base\./.test(p));
  badRegions = new Set(regional.map((p) => p.split(/[.:]/)[0]).filter((id) => script && script.regions && script.regions[id]));
  badKeys = new Map();
  for (const p of regional) {
    const m = /^([^.:\s]+)\.([A-Za-z]+)[:\s]/.exec(p);
    if (!m) continue;
    if (!badKeys.has(m[1])) badKeys.set(m[1], new Set());
    badKeys.get(m[1]).add(m[2]);
  }
  if (problems.length && typeof console !== 'undefined') {
    console.warn(`[color-script] ${problems.length} problem(s):`, problems.slice(0, 8));
  }
  return problems;
}

/** 目前載入那一份表的問題清單（空陣列＝全過；沒載入 → 空）。 */
export function colorScriptProblems() {
  return problems;
}

/** 這一區在腳本裡有一組驗得過的色嗎。 */
export function hasColorScript(regionId) {
  return Boolean(script && script.regions && script.regions[regionId]) && !badRegions.has(regionId);
}

/**
 * 只拿 json 那一列。驗不過／未知的區 → foundations 那一列；但 foundations 自己也驗不過（或沒載入）→ null
 * —— **絕不回一列壞的**（呼叫端拿到 null 就逐鍵用預設）。
 */
export function colorScriptRow(regionId) {
  if (!script || !script.regions) return null;
  if (hasColorScript(regionId)) return script.regions[regionId];
  return hasColorScript('foundations') ? script.regions.foundations : null;
}

/**
 * `composeMood()` 的第一個參數（同形：fog/tint/hemi/fogNear/fogFar/exposure/motes ＋ sky ＋ key/rim/particle）。
 * 氣氛七鍵**永遠**是 `atmosphereFor(regionId)`（REGION_ATMOSPHERE 的數字原值；未知區那裡自己退 foundations）——
 * 色彩腳本沒載入／這一區沒那一列／那一列驗不過，都**不會**把這一區的霧換成別區的。
 * 腳本那幾鍵**逐鍵**退回：sky → 全域基準 SKY_BASE、key/rim/particle → null（world.js 用舊預設：區主色／kit.light／舊算法）
 * —— 沒載入表、沒這一區那一列、或那一列的某一鍵驗不過，都只退那幾鍵，不借別區的列。
 * 每次呼叫都回新物件（低頻事件，不在每幀）。
 * @param {string} regionId
 */
export function colorScriptFor(regionId) {
  const atmo = atmosphereFor(regionId);
  // 只看**自己那一列**（沒載入／沒那一列 → 全部預設；列在但某鍵驗不過 → 只那一鍵預設）
  const own = script && script.regions && script.regions[regionId] && typeof script.regions[regionId] === 'object' ? script.regions[regionId] : null;
  const bad = badKeys.get(regionId);
  const pick = (k, dflt) => (own && !(bad && bad.has(k)) && HEX_RE.test(String(own[k])) ? own[k] : dflt);
  return {
    fog: atmo.fog,
    tint: atmo.tint,
    hemi: atmo.hemi,
    fogNear: atmo.fogNear,
    fogFar: atmo.fogFar,
    exposure: atmo.exposure,
    motes: atmo.motes,
    sky: { top: pick('skyTop', SKY_BASE.top), low: pick('skyLow', SKY_BASE.low) },
    key: pick('key', null),
    rim: pick('rim', null),
    particle: pick('particle', null),
  };
}

/** 全表（唯讀快照；測試與 WORLD.md 色卡表用；沒載入 → {}）。 */
export function colorScriptTable() {
  if (!script || !script.regions) return {};
  return Object.fromEntries(Object.keys(REGION_ATMOSPHERE).map((id) => [id, { ...(colorScriptRow(id) || {}) }]));
}

export default { loadColorScript, colorScriptFor, colorScriptRow, colorScriptTable, colorScriptProblems, hasColorScript, validateColorScript, hexToHsl, hueDeltaDeg, hueDelta, hex6, bodyOf };

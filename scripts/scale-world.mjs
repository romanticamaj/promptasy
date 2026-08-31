#!/usr/bin/env node
/**
 * Promptasy — 世界座標整體縮放（v1.2 · P22c 的一次性遷移工具）
 *
 * **為什麼是「把數字寫死」而不是「載入時乘一個常數」。**
 * 這個專案的每一支稽核（碰撞、可站立、節奏、視線、四支 `--verify`）都直接讀
 * `src/data/*.json` 與各模組的常數表，然後拿去跟蓋出來的場景圖比對 ——
 * 「**資料就是世界**」是這裡所有驗證的前提。如果改成載入時再乘，
 * 資料檔裡的座標就不再是世界座標，任何一支忘了乘的稽核都會安靜地量錯東西
 * （P20b 的教訓：搜尋器的基底世界不對，答案就會自我實現）。
 * 所以寧可 diff 大，也要讓檔案裡的數字**就是**世界裡的數字。
 *
 * **乘什麼、不乘什麼。**
 * 只乘**世界 XZ 座標**。物件尺寸、高度、互動半徑、淨空門檻、玩家半徑、跳躍常數、
 * 時間常數、角度、組內位移一律不乘 —— 這正是「攤開」的定義：
 * 東西一樣大、彼此離得更遠（面積 ×k²、密度 ÷k²）。
 *
 * 用法：
 *   node scripts/scale-world.mjs            # dry-run：只印會改幾個數字
 *   node scripts/scale-world.mjs --write    # 真的寫檔
 *   node scripts/scale-world.mjs --k 1.3    # 指定倍率（預設 1.3）
 *
 * **它不會做的事**：改註解裡的公尺數。那些數字是人量出來、寫給下一個人看的推論，
 * 機器改了只會製造看起來對、其實沒重量過的假話。跑完之後要人工逐段重量、改對。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** 小數第二位就夠（世界最小的間距門檻是 0.30 公尺）。 */
const round = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * 一、資料檔：逐欄位
 * ------------------------------------------------------------------ */

/**
 * 每個資料檔要乘的欄位。**沒列到的欄位一律不動**（白名單，不是黑名單 ——
 * 黑名單會在新增欄位時安靜地把不該乘的東西乘掉）。
 */
const JSON_FIELDS = Object.freeze({
  'src/data/challenges.json': ['position'],
  'src/data/murks.json': ['at'],
  'src/data/letters.json': ['at'],
  'src/data/echoes.json': ['at'],
  'src/data/inscriptions.json': ['at'],
  'src/data/archive.json': ['at'],
  'src/data/guardian.json': ['at'],
  'src/data/watchmen.json': ['at'],
  'src/data/handles.json': ['at'],
  'src/data/secrets.json': ['at'],
  'src/data/prologue.json': ['at'],
});

/** 這些欄位名長得像座標，但**絕對不能乘**（角度、互動半徑、組內位移）。 */
const NEVER = Object.freeze(['rot', 'radius', 'r', 'height', 'clear', 'y']);

/**
 * 走訪任意 JSON，把白名單欄位裡的 `[x, z]` 乘上 k。
 * @returns {number} 改了幾個座標
 */
function scaleJson(node, fields, k) {
  let n = 0;
  const walk = (o) => {
    if (Array.isArray(o)) {
      for (const v of o) walk(v);
      return;
    }
    if (!o || typeof o !== 'object') return;
    for (const [key, v] of Object.entries(o)) {
      if (fields.includes(key) && Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) {
        o[key] = [round(v[0] * k), round(v[1] * k)];
        n += 1;
      } else if (NEVER.includes(key)) {
        /* 明說一次：這裡什麼都不做，讀的人才不用回頭確認有沒有漏掉。 */
      } else {
        walk(v);
      }
    }
  };
  walk(node);
  return n;
}

/* ------------------------------------------------------------------ *
 * 二、程式裡的常數表：逐表、逐欄位
 * ------------------------------------------------------------------ */

/**
 * 每一張表：在哪個檔、表名、以及**這張表裡哪些寫法是世界座標**。
 *
 * 作用範圍限制在該表的文字區段內（從 `表名 = ` 到對應的收尾括號），
 * 所以同一個檔裡別的數字碰不到。
 *
 * **不在表上的，是因為它們是算出來的**：`CORRIDORS`／`ANNEX_LINKS`／`BRIDGE_SPANS`／
 * `SHORTCUTS` 全部從 `REGION_SITES`／`SHORTCUT_DATA` 推導，裡面沒有座標字面值 ——
 * 乘了上游，它們自己就跟著動。
 */
const JS_TABLES = Object.freeze([
  { file: 'src/world/world.js', table: 'REGION_SITES', keys: ['x', 'z', 'radius', 'flat'] },
  { file: 'src/world/world.js', table: 'SHORTCUT_DATA', keys: ['x', 'z'], pairs: ['from', 'to', 'at'] },
  /*
   * `BRIDGE_GAPS.at` 是**沿著橋的一維距離**（第 66 公尺處），橋會跟著變長，所以要乘。
   * 同一個物件裡的 `length`（缺口寬度）**不乘** —— 那是玩家要跳過去的距離，
   * 而跳躍常數（`JUMP_SPEED` / `GRAVITY`）不會因為地圖變大就變強。
   */
  { file: 'src/world/world.js', table: 'BRIDGE_GAPS', keys: [], scalars: ['at'] },
  { file: 'src/world/screens.js', table: 'SCREEN_BANDS', keys: ['x', 'z'], pairs: ['at', 'from', 'to'] },
  { file: 'src/world/screens.js', table: 'MOTIFS', keys: ['x', 'z'], pairs: ['at'] },
  { file: 'src/world/screens.js', table: 'PLATFORMS', keys: ['x', 'z'], pairs: ['at'] },
  { file: 'src/world/screens.js', table: 'PATH_BENDS', keys: [], bare: true },
  { file: 'src/world/props.js', table: 'STORY_VIGNETTES', keys: [], pairs: ['at'] },
  { file: 'src/world/props.js', table: 'LANDMARKS', keys: [], pairs: ['at'] },
  { file: 'src/world/props.js', table: 'LORE_TABLETS', keys: [], pairs: ['at'] },
  { file: 'src/world/reactive.js', table: 'REACTIVE_SPOTS', keys: [], pairs: ['at'] },
  { file: 'src/world/finale.js', table: 'SHRINE_AT', keys: [], bare: true },
  { file: 'src/world/finale.js', table: 'STELE_AT', keys: [], bare: true },
]);

/** 找出 `表名 = ` 之後那一段（括號配對，字串／註解裡的括號不算）。 */
function spanOf(src, table) {
  const decl = new RegExp(`(?:export\\s+)?const\\s+${table}\\s*=\\s*`);
  const m = decl.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  // 跳過 `Object.freeze(`
  const freeze = /^Object\.freeze\(\s*/.exec(src.slice(i));
  if (freeze) i += freeze[0].length;
  if (src[i] !== '[' && src[i] !== '{') return null;
  let depth = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;
  for (let j = i; j < src.length; j += 1) {
    const c = src[j];
    const next = src[j + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        j += 1;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\') j += 1;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      j += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      j += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '[' || c === '{' || c === '(') depth += 1;
    else if (c === ']' || c === '}' || c === ')') {
      depth -= 1;
      if (depth === 0) return { start: i, end: j + 1 };
    }
  }
  return null;
}

/** 註解（行註解與區塊註解）的字元範圍 —— 註解裡的數字一律不動。 */
function commentRanges(text) {
  const out = [];
  let inStr = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      out.push([i, end === -1 ? text.length : end]);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      out.push([i, end === -1 ? text.length : end + 2]);
      i = end === -1 ? text.length : end + 1;
    }
  }
  return out;
}

/** 一段文字裡，把座標寫法乘上 k（跳過註解）。 */
function scaleSpan(text, spec, k) {
  const comments = commentRanges(text);
  const inComment = (idx) => comments.some(([a, b]) => idx >= a && idx < b);
  let n = 0;

  const num = '-?\\d+(?:\\.\\d+)?';
  const edits = [];

  // `at: [x, z]` / `from: [x, z]` …
  for (const key of spec.pairs || []) {
    const re = new RegExp(`\\b${key}\\s*:\\s*\\[\\s*(${num})\\s*,\\s*(${num})\\s*\\]`, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (inComment(m.index)) continue;
      edits.push([m.index, m[0].length, `${key}: [${round(+m[1] * k)}, ${round(+m[2] * k)}]`]);
    }
  }
  // `x: 12, z: -3`（逐鍵）
  for (const key of spec.keys || []) {
    const re = new RegExp(`\\b${key}\\s*:\\s*(${num})`, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (inComment(m.index)) continue;
      edits.push([m.index, m[0].length, `${key}: ${round(+m[1] * k)}`]);
    }
  }
  // `at: 66` —— 沿著某條線的一維距離（不是一對座標）
  for (const key of spec.scalars || []) {
    const re = new RegExp(`\\b${key}\\s*:\\s*(${num})`, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (inComment(m.index)) continue;
      edits.push([m.index, m[0].length, `${key}: ${round(+m[1] * k)}`]);
    }
  }
  // `Object.freeze([22.25, -17.5])` 這種光禿禿的一對
  if (spec.bare) {
    const re = new RegExp(`\\[\\s*(${num})\\s*,\\s*(${num})\\s*\\]`, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (inComment(m.index)) continue;
      edits.push([m.index, m[0].length, `[${round(+m[1] * k)}, ${round(+m[2] * k)}]`]);
    }
  }

  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  let last = Infinity;
  for (const [idx, len, rep] of edits) {
    if (idx + len > last) continue; // 兩條規則撞到同一段就只採第一條
    out = out.slice(0, idx) + rep + out.slice(idx + len);
    last = idx;
    n += 1;
  }
  return { text: out, n };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const write = argv.includes('--write');
const kArg = argv.indexOf('--k');
const K = kArg >= 0 ? Number(argv[kArg + 1]) : 1.3;
if (!Number.isFinite(K) || K <= 0) {
  console.error('--k 要是一個正數');
  process.exit(1);
}

console.log(`世界座標 ×${K}${write ? '（寫檔）' : '（dry-run，加 --write 才會真的寫）'}\n`);
let total = 0;

for (const [rel, fields] of Object.entries(JSON_FIELDS)) {
  const p = resolve(root, rel);
  const raw = readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  const n = scaleJson(data, fields, K);
  total += n;
  console.log(`  ${rel.padEnd(30)} ${String(n).padStart(4)} 個座標（${fields.join('／')}）`);
  if (write && n) writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

console.log('');
for (const spec of JS_TABLES) {
  const p = resolve(root, spec.file);
  const src = readFileSync(p, 'utf8');
  const span = spanOf(src, spec.table);
  if (!span) {
    console.log(`  ⚠ ${spec.file} 的 ${spec.table} 找不到 —— 表名改了？`);
    continue;
  }
  const seg = src.slice(span.start, span.end);
  const { text, n } = scaleSpan(seg, spec, K);
  total += n;
  console.log(`  ${(spec.file.split('/').pop() + ' · ' + spec.table).padEnd(34)} ${String(n).padStart(4)} 個座標`);
  if (write && n) writeFileSync(p, src.slice(0, span.start) + text + src.slice(span.end));
}

console.log(`\n合計 ${total} 個座標。`);
console.log('註解裡的公尺數**沒有**動 —— 那些要人重新量過再改，機器改出來的是假話。');
if (!write) console.log('這是 dry-run。確認數字合理再加 --write。');

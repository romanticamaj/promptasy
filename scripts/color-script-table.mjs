#!/usr/bin/env node
/**
 * Promptasy — 把 `src/data/color-script.json` 印成 WORLD.md §2.2 的 12 區色卡表（markdown）。
 * 表由腳本產生、貼進 WORLD.md，不手抄（改 json → 重跑 → 貼上）。
 *   node scripts/color-script-table.mjs
 * 順便跑一次驗證（fog/tint 逐值等於 REGION_ATMOSPHERE、天空偏移在容差內、全部是夜色）；有問題就 exit 1。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const json = JSON.parse(readFileSync(resolve(root, 'src/data/color-script.json'), 'utf8'));
const { loadColorScript, colorScriptTable, hexToHsl, hueDelta, toneDistance, SKY_BASE } = await import('../src/world/color-script.js');
const World = await import('../src/world/world.js');

const problems = loadColorScript(json);
if (problems.length) {
  console.error('color-script.json 驗不過：');
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}

const REGION_ZH = {
  foundations: '中央高原', reasoning: '階梯迴廊', grounding: '沉書檔案庫', orchestration: '齒輪工坊',
  config: '面具劇場', forms: '量器坊', toolcraft: '契約鍛冶場', refinery: '校驗場',
  frugality: '減法之庭', sight: '觀象臺', divergence: '分歧之廳', wards: '護欄崗',
};
const baseTop = hexToHsl(SKY_BASE.top);
const baseLow = hexToHsl(SKY_BASE.low);
/** 帶號數字；四捨五入到 0 的一律印 `0`／`0.00`（不印 `-0`）。 */
const fmt = (n, digits = 0) => {
  const r = Number(n.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return (r > 0 ? '+' : '') + r.toFixed(digits);
};

const rows = [];
rows.push('| 區域 | skyTop | skyLow | 天空偏移（色相°／亮度） | fog | tint | key（補光） | rim（補色） | particle（螢火） | groundLow | groundHigh |');
rows.push('|---|---|---|---|---|---|---|---|---|---|---|');
const table = colorScriptTable();
for (const id of Object.keys(World.REGION_ATMOSPHERE)) {
  const r = table[id];
  const off = `${fmt(hueDelta(r.skyTop, SKY_BASE.top))}° ／ ${fmt(hexToHsl(r.skyTop).l - baseTop.l, 2)}·${fmt(hexToHsl(r.skyLow).l - baseLow.l, 2)}`;
  rows.push(
    `| ${REGION_ZH[id] || id} \`${id}\` | \`${r.skyTop}\` | \`${r.skyLow}\` | ${off} | \`${r.fog}\` | \`${r.tint}\` | ` +
      `\`${r.key}\` | \`${r.rim}\` | \`${r.particle}\` | \`${r.groundLow}\` | \`${r.groundHigh}\` |`
  );
}
console.log(rows.join('\n'));

/*
 * v1.2 · P12：順便印出「地面兩兩分不分得出來」的最小距離 —— 這一格是站長回饋
 * 「區域顏色我看不出來」的驗收數字，`test:rubric` 用同一支 `toneDistance()` 當硬斷言。
 */
const ids = Object.keys(World.REGION_ATMOSPHERE);
const pairs = [];
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    const a = table[ids[i]];
    const b = table[ids[j]];
    pairs.push([Math.max(toneDistance(a.groundLow, b.groundLow), toneDistance(a.groundHigh, b.groundHigh)), `${ids[i]}／${ids[j]}`]);
  }
}
pairs.sort((a, b) => a[0] - b[0]);
console.log(`\n地面基底色的可分辨距離（${pairs.length} 對）：最小 ${pairs[0][0].toFixed(3)}（${pairs[0][1]}）、` +
  `中位數 ${pairs[Math.floor(pairs.length / 2)][0].toFixed(3)}、最大 ${pairs[pairs.length - 1][0].toFixed(3)}`);

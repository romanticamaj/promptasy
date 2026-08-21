#!/usr/bin/env node
/**
 * Promptasy — 產生 `src/data/solution-stats.json`（v1.2 · P10b）
 *
 *   node scripts/build-solution-stats.mjs          # 產生並寫檔
 *   node scripts/build-solution-stats.mjs --check  # 只比對，不寫檔（CI／人工複查用）
 *
 * ## 這份檔案是什麼
 *
 * 每一關一組**內建分布**：一小把「參考解答」的**分數／字數／技法數**。
 * 結果面拿它來說一句「這一次在內建的範例解裡排第幾百分位」——
 * 它**不是其他玩家的成績**（我們沒有後端、也不打算收集玩家資料），
 * 畫面上必須明寫這件事，這支腳本的存在就是為了讓那句話站得住。
 *
 * ## 數字從哪裡來（誠實原則：一個位元組都不編）
 *
 * 1. **候選解答只由這一關自己的資料拆組**，不憑空寫任何一句話：
 *    · `sample`（示範解答）逐行、行內再依句號／驚嘆號／問號切成句；
 *    · `quickFills` 的每一片（畫面上真的按得到的那幾顆）；
 *    · `material.text`（委託附上的素材）逐行 —— 「把原文整段貼進去」是玩家真的會做的事。
 *    去重之後取所有**非空組合**（最多 12 塊 → 4,095 種），外加完整的 `sample` 本身。
 * 2. 每一種都送進**真的評分引擎**（`src/challenges/rubric.js` 的 `evaluate()`，
 *    用資料層的 rubric），**只留通過的**——分布講的是「解得開這一關的人怎麼寫」，
 *    所以沒過的寫法不算一份解答（隱藏徽章「最少技巧達成」也才有意義）。
 * 3. 以 `(分數, 字數, 技法數)` 三元組去重；超過 9 份就取樣到 9 份，
 *    **三軸的極大極小一定留著**（少一份會讓百分位說謊、也會讓徽章變好拿）。
 * 4. 三軸各輸出一個**由小到大排好的**數字陣列，長度相同、逐格對應同一份解答。
 *
 * ## 已知的誠實缺口
 *
 * 有的關卡本來就只有少少幾種寫法過得了（例如減法之庭「磨過的刀」：
 * 主檢查就是 `keepsPromptLean`，多貼一行就不精簡了）。這種關卡就誠實地
 * 給少於 5 份，**絕不為了湊數把沒通過的寫法混進來**。`SHORT_IDS` 記著它們。
 *
 * 重跑這支腳本要是數字變了，代表**檢查器或關卡資料變了** —— 那是要看的訊號，
 * 不是雜訊：先確認那個改動是有意的，再把新的 json commit 進去。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const { evaluate } = await import('../src/challenges/rubric.js');
const { countWords, techniqueCountOf } = await import('../src/challenges/solution-stats.js');

/** 一關最多列幾份解答（結果面只拿來算百分位，多了沒有意義、只是把檔案養大）。 */
const MAX_ROWS = 9;
/** 組合的塊數上限（2^12 − 1 ＝ 4,095 種；再多下去只是更慢，不會更誠實）。 */
const MAX_PARTS = 12;

/**
 * 把一段文字切成「一塊一塊」：先逐行，行內再依句號／驚嘆號／問號斷句。
 * 斷句時保留標點（那是玩家真的會寫出來的樣子）。
 * @param {string} text
 * @returns {string[]}
 */
function unitsOf(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const segs = line
      .split(/(?<=[。！？])/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (segs.length > 1) for (const seg of segs) out.push(seg);
    else out.push(line);
  }
  return out;
}

/** 這一關可以拆出哪幾塊（順序固定 → 產生的結果可重現）。 */
function partsOf(challenge) {
  const parts = [];
  const push = (s) => {
    if (typeof s === 'string' && s.trim() && !parts.includes(s)) parts.push(s);
  };
  for (const u of unitsOf(challenge.sample)) push(u);
  for (const q of challenge.quickFills || []) push(q.text);
  if (challenge.material && challenge.material.text) for (const u of unitsOf(challenge.material.text)) push(u);
  return parts;
}

/** 一關的所有候選解答（去重、順序固定）。 */
function candidatesOf(challenge) {
  const parts = partsOf(challenge).slice(0, MAX_PARTS);
  const set = new Set();
  set.add(challenge.sample);
  const n = parts.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let text = '';
    for (let i = 0; i < n; i += 1) {
      if (!(mask & (1 << i))) continue;
      text = text ? `${text}\n${parts[i]}` : parts[i];
    }
    set.add(text);
  }
  return set;
}

/**
 * 從一堆通過的解答裡挑最多 9 份，**三軸的極值一定在裡面**。
 * @param {Array<{score:number, words:number, techniques:number}>} rows
 */
function pickRows(rows) {
  if (rows.length <= MAX_ROWS) return rows.slice();
  const keep = new Set();
  for (const key of ['score', 'words', 'techniques']) {
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i][key] < rows[lo][key]) lo = i;
      if (rows[i][key] > rows[hi][key]) hi = i;
    }
    keep.add(lo);
    keep.add(hi);
  }
  // 剩下的名額用「等距取樣」補滿（rows 已經照三軸排序 → 取出來的是均勻的一把）
  for (let i = 0; i < MAX_ROWS && keep.size < MAX_ROWS; i += 1) {
    const at = Math.round((i * (rows.length - 1)) / (MAX_ROWS - 1));
    keep.add(at);
  }
  return [...keep].sort((a, b) => a - b).slice(0, MAX_ROWS).map((i) => rows[i]);
}

/** 一關的內建分布（回傳 null ＝ 這一關一份通過的參考解答都拆不出來）。 */
export function statsForChallenge(challenge) {
  const seen = new Map();
  for (const text of candidatesOf(challenge)) {
    const ev = evaluate(challenge, text);
    if (!ev.passed) continue;
    const row = { score: ev.earned, words: countWords(text), techniques: techniqueCountOf(ev) };
    const key = `${row.score}|${row.words}|${row.techniques}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  const rows = [...seen.values()].sort(
    (a, b) => a.score - b.score || a.words - b.words || a.techniques - b.techniques
  );
  if (!rows.length) return null;
  const picked = pickRows(rows);
  const total = (challenge.rubric || []).reduce((n, r) => n + (Number.isFinite(r.weight) ? r.weight : 1), 0);
  return {
    id: challenge.id,
    // 這一份分布是照「資料層的整份 rubric」跑的；試煉在 runtime 只挑你學過的那幾條，
    // 條數對不上就不能拿來比 —— 顯示層用 `total` 當守門（見 solution-stats.js）。
    total: Math.round(total * 100) / 100,
    n: picked.length,
    scores: picked.map((r) => r.score).sort((a, b) => a - b),
    words: picked.map((r) => r.words).sort((a, b) => a - b),
    techniques: picked.map((r) => r.techniques).sort((a, b) => a - b),
  };
}

/** 產生整份檔案的內容。 */
export function buildFile() {
  const challengeFile = JSON.parse(readFileSync(resolve(root, 'src/data/challenges.json'), 'utf8'));
  const challenges = (challengeFile.challenges || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const stats = [];
  const short = [];
  for (const c of challenges) {
    const row = statsForChallenge(c);
    if (!row) throw new Error(`[${c.id}] 一份通過的參考解答都拆不出來 —— 這一關的資料要先看一眼`);
    if (row.n < 5) short.push(`${c.id}(${row.n})`);
    stats.push(row);
  }
  return {
    file: {
      version: 1,
      authored: 'game',
      note: '內建的參考解答分布（純視覺統計，不是教學內容，所以沒有出處欄位）。每一關的三軸數字都是本機評分引擎跑「這一關自己的示範解答／快速填入／素材」拆組出來的**通過解**產生的，**不是其他玩家的成績**——畫面上必須照實說。重跑：node scripts/build-solution-stats.mjs',
      generatedBy: 'scripts/build-solution-stats.mjs',
      wordRule: '字數＝漢字一個算一個 ＋ 拉丁字母／數字一串算一個（跟結果面用的是同一支 countWords）',
      stats,
    },
    short,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const out = resolve(root, 'src/data/solution-stats.json');
  const { file, short } = buildFile();
  const text = `${JSON.stringify(file, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const now = readFileSync(out, 'utf8');
    if (now !== text) {
      console.error('✗ solution-stats.json 與現在的評分引擎／關卡資料對不上（重跑一次這支腳本）');
      process.exitCode = 1;
    } else {
      console.log(`✓ solution-stats.json 是最新的（${file.stats.length} 關）`);
    }
  } else {
    writeFileSync(out, text);
    console.log(`✓ 寫好 ${file.stats.length} 關的內建分布 → src/data/solution-stats.json`);
  }
  const sizes = file.stats.map((s) => s.n);
  console.log(`  每關份數：min ${Math.min(...sizes)} / max ${Math.max(...sizes)}`);
  if (short.length) console.log(`  誠實缺口（< 5 份，不湊數）：${short.join('、')}`);
}

export default { statsForChallenge, buildFile };

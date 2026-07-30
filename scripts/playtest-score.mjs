/**
 * Playtest 工具：模擬玩家在關卡面板看到的資訊與送出評分的結果。
 *
 * 用法：
 *   node scripts/playtest-score.mjs --list
 *   node scripts/playtest-score.mjs --info <challengeId>     # 只輸出玩家「看得到」的資訊（不含 sample 參考解）
 *   node scripts/playtest-score.mjs <challengeId> "<prompt>" # 送出評分，輸出玩家會看到的回饋
 *   node scripts/playtest-score.mjs <challengeId> --file p.txt
 */
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/challenges/rubric.js';
import { CHECKS } from '../src/challenges/checks.js';

const root = new URL('..', import.meta.url).pathname;
const load = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const raw = load('src/data/challenges.json');
const challenges = Array.isArray(raw) ? raw : raw.challenges;
let coach = {};
try {
  const c = load('src/data/coach.json');
  const entries = c.entries || c.checks || [];
  for (const e of Array.isArray(entries) ? entries : Object.entries(entries).map(([check, v]) => ({ check, ...v }))) {
    coach[e.check || e.id] = e;
  }
} catch {}

const args = process.argv.slice(2);

if (args[0] === '--list') {
  for (const c of challenges) console.log(`${c.id}\t[${c.region}]\t${c.title}`);
  process.exit(0);
}

const id = args[0];
const challenge = challenges.find((c) => c.id === id);
if (!challenge) {
  console.error(`找不到關卡 ${id}（用 --list 看全部）`);
  process.exit(1);
}

if (args[1] === '--info' || args[1] === undefined && args.includes('--info') || args[0] === '--info') {
  // 支援 --info <id> 或 <id> --info
}

const wantInfo = args.includes('--info');
if (wantInfo) {
  const visible = {
    id: challenge.id,
    region: challenge.region,
    title: challenge.title,
    npc: challenge.npc,
    scenario: challenge.scenario,
    mission: challenge.mission,
    material: challenge.material,
    clue: challenge.clue,
    starter: challenge.starter,
    placeholder: challenge.placeholder,
    quickFills: challenge.quickFills,
    pass: challenge.pass,
    rubricPreview: challenge.rubric.map((r) => ({
      check: r.check,
      weight: r.weight,
      hint: r.hint || CHECKS[r.check]?.hint,
      coach: coach[r.check] || null,
    })),
  };
  console.log(JSON.stringify(visible, null, 2));
  process.exit(0);
}

let prompt;
const fileIdx = args.indexOf('--file');
if (fileIdx !== -1) prompt = readFileSync(args[fileIdx + 1], 'utf8');
else prompt = args.slice(1).join(' ');

if (!prompt) {
  console.error('請提供 prompt（第二個參數或 --file）');
  process.exit(1);
}

const result = evaluate(challenge, prompt);
const rows = result.results || result.checks || [];
for (const r of rows) {
  const mark = r.score >= 1 ? '✅' : r.score > 0 ? '🟡' : '❌';
  const hint = r.score >= 1 ? '' : `\n    提示：${r.hint || ''}`;
  console.log(`${mark} ${r.check}（權重 ${r.weight}，得 ${r.earned ?? r.score * r.weight}）${r.evidence ? ` — ${r.evidence}` : ''}${hint}`);
}
console.log('---');
console.log(JSON.stringify({
  score: result.score,
  totalWeight: result.totalWeight ?? result.total,
  passThreshold: challenge.pass,
  passed: result.passed,
  grade: result.grade,
}, null, 2));

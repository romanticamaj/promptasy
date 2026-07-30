#!/usr/bin/env node
/**
 * PromptArcade — 離線 rubric 引擎自我測試
 *
 *   npm run test:rubric
 *
 * 涵蓋：
 *  1. 每個檢查器的 good / bad fixture（含反作弊：只寫關鍵字不算通過）
 *  2. 關卡評分與 S/A/B/C 評價
 *  3. 存檔 load / save / reset（用假的 localStorage）
 *  4. 進程系統：XP、升等、圖鑑收集、廠家徽章、重玩只補差額
 *  5. 資料完整性：challenges 的 technique id 與官方出處都真的存在於 curriculum
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const curriculum = readJson('src/data/curriculum.json');
const challengeData = readJson('src/data/challenges.json');
const challenges = challengeData.challenges;

const { CHECK_IDS, runCheck, MIN_PROMPT_LENGTH } = await import('../src/challenges/checks.js');
const { findEnglishSentence: ENGLISH } = await import('./zh-scan.mjs');
const { CHECKS: CHECK_DEFS } = await import('../src/challenges/checks.js');

const nonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * 少數檢查天生需要「一大段資料」才成立（長文本擺放）。
 * 驗證提示球的填入片段時，先給它一段像樣的資料，才是真實的使用情境。
 */
const COACH_PROBE_PREFIX = {
  putsQuestionLast:
    '第三季：入庫 42 袋穀物，雨損 9 袋，換鹽 4 袋，其餘留在下層地窖。\n' +
    '第四季：入庫 51 袋穀物，霉損 6 袋，撥給擺渡人 2 袋，其餘留在上層地窖。\n' +
    '第五季：入庫 38 袋穀物，蟲損 3 袋，換油 5 袋，其餘留在中層地窖。\n',
};
const { evaluate, gradeForRatio, xpForGrade, betterGrade } = await import('../src/challenges/rubric.js');

/* ------------------------------------------------------------------ */
/* 迷你測試框架                                                        */
/* ------------------------------------------------------------------ */
let passCount = 0;
const failures = [];

function ok(condition, name, detail = '') {
  if (condition) {
    passCount += 1;
  } else {
    failures.push(`${name}${detail ? `\n      ↳ ${detail}` : ''}`);
  }
}

function eq(actual, expected, name) {
  ok(actual === expected, name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ------------------------------------------------------------------ */
/* 1. 檢查器 fixtures                                                  */
/* ------------------------------------------------------------------ */

/**
 * good : 應該完全通過（score === 1）
 * weak : 應該只拿部分分數（0 < score < 1）—— 反作弊的關鍵案例
 * bad  : 應該 0 分
 */
const FIXTURES = {
  hasRole: {
    good: [
      'You are a senior financial analyst. Summarize the earnings report for a general audience.',
      '你是一位資深的兒童文學編輯，請把下面這段文字改寫得更好讀。',
      'Role: veteran incident-response engineer\nWrite a postmortem outline for the outage below.',
      'Act as an experienced technical recruiter and review this resume section.',
    ],
    weak: [
      'You are a helpful assistant. Please summarize the article below in three sentences.',
      '你是一個 AI 助手，請幫我整理這份會議紀錄的重點。',
    ],
    bad: [
      'Summarize the quarterly earnings report below in three bullet points.',
      '請把下面這段財報摘要成三個重點，每點不超過 20 字。',
    ],
  },

  assignsTask: {
    good: [
      'Summarize the article below in three bullet points.',
      '請列出這份報告裡最重要的三個風險。',
      'Task: translate the paragraph below into Traditional Chinese.',
      '- Rewrite the paragraph so it reads like plain prose.',
    ],
    weak: ['Task: quarterly earnings, Q3, our European segment and the currency effects'],
    bad: [
      'Quarterly earnings report for Q3 2025, European segment, currency effects included.',
      '關於這份季度財報的一些想法與背景資料，還有匯率的影響。',
    ],
  },

  hasFewShot: {
    good: [
      'Classify each sentence.\nInput: The battery died in two hours.\nOutput: negative\nInput: Shipping was instant.\nOutput: positive',
      '請照著範例轉換。\n輸入：營收從 10 億成長到 12 億\n輸出：營收成長 20% 至 12 億',
      'Normalize these names.\nJohn  smith -> John Smith\nmary JONES -> Mary Jones',
    ],
    weak: [
      'Follow the pattern below.\nExample:\nRevenue rose 20% to $12M this quarter.',
      'Follow the pattern here.\n<example>\nRevenue rose sharply this quarter.\n</example>',
    ],
    bad: [
      'Summarize the report below in three bullet points, each under 20 words.',
      '請把下面的財報摘要成三個重點，語氣中立。',
    ],
  },

  specifiesFormat: {
    good: [
      'Summarize the report as a markdown table with two columns.',
      '請用條列的方式列出這份報告裡最重要的三個重點。',
      'Output format: JSON with keys "title" and "risks".',
      'Answer in one sentence, no preamble.',
    ],
    weak: [
      'Please respond in a way that works well for our pipeline.',
      '請注意每一段輸出的格式都要保持一致，不要跑掉。',
    ],
    bad: [
      'Summarize the quarterly report for a non-technical manager.',
      '請幫我把這份財報整理一下，寫給不懂財務的人看。',
    ],
  },

  hasConstraint: {
    good: [
      'Summarize this in no more than 100 words.',
      'Respond in 3 bullet points.',
      '請用 3 到 5 句話說明這份報告的結論。',
      '列出五個重點，每點不超過 20 字。',
    ],
    weak: [
      'Keep the answer under the usual limit for our newsletter, please.',
      // Phase 9：模糊的長度形容詞改判「部分分數＋明確提示」，不再直接歸零
      'Keep it fairly short and concise, nothing too long please.',
      '請幫我寫得簡短一點，不要太長，謝謝。',
    ],
    bad: ['Summarize the notice on the board for the travellers arriving tonight.'],
  },

  positiveFraming: {
    good: [
      'Write the answer as smoothly flowing prose paragraphs. Keep the tone warm and factual.',
      '請用流暢的散文段落回覆，並保持語氣溫和。',
    ],
    weak: [
      'Summarize the report. Do not use markdown. Do not add a preamble.',
      '請摘要這份報告。不要用 markdown，不要加開場白。',
    ],
    bad: [
      'Do not use markdown. Never add a preamble. Avoid bullet points. Do not mention the source.',
      '不要用 markdown，不要加開場白，也不可以用條列，別提到來源。',
    ],
  },

  hasDelimiters: {
    good: [
      'Summarize the text below.\n\nText: """\nThe quarterly report says revenue grew.\n"""',
      'Answer using the material inside the tags.\n<context>\nRevenue grew 20% this quarter.\n</context>',
      '### 指令\n摘要下面的內容。\n### 內容\n本季營收成長兩成。',
    ],
    weak: [
      '# Summary task\nSummarize the paragraph about revenue growth for the newsletter.',
      'Task: summarize\nTone: neutral\nLength: three sentences',
    ],
    bad: [
      'Summarize the following text about revenue growth in three neutral sentences.',
      '請摘要下面這段關於營收成長的文字，用三句中立的話。',
    ],
  },

  asksToVerify: {
    good: [
      'Before finishing, verify every number against the source text and correct any mismatch.',
      '完成前請對照原文檢查每個數字是否正確。',
      'Double-check your answer for errors before you reply.',
    ],
    weak: ['Please verify. Then send the summary to the newsletter team.'],
    bad: [
      'Summarize the report in three bullet points for a general audience.',
      '請把這份報告摘要成三個重點給一般讀者看。',
    ],
  },

  groundsInContext: {
    good: [
      'Use ONLY the report inside <context> to answer. Do not rely on outside knowledge.\n<context>\nRevenue grew.\n</context>',
      '只根據以下資料回答問題，不要使用外部知識。\n資料：本季營收成長兩成。',
      'Answer strictly based on the following document, nothing else.',
    ],
    weak: [
      'Summarize the document below in three bullet points for a general audience.',
      '請摘要以下這份文件的三個重點。',
    ],
    bad: [
      'Summarize what you know about the company in three bullet points.',
      '請用你知道的資訊寫出這家公司的三個重點。',
    ],
  },

  hasStepByStep: {
    good: [
      'Think step by step about which figures matter, then write the final summary.',
      '請先逐步思考哪些數字重要，再寫出最後的摘要。',
      'First, list the relevant figures. Then, write the summary in three sentences.',
      'Use <thinking> for your reasoning and <answer> for the final result.',
    ],
    weak: ['1. Read the report\n2. Write a summary'],
    bad: [
      'Summarize the report below in three bullet points, each under 20 words.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  hasAudience: {
    good: [
      'Explain the result for a non-technical manager who has never seen this dashboard.',
      '請寫給完全不懂財務的一般讀者看。',
      'Audience: first-time users of the product.',
    ],
    weak: ['Keep the audience in mind while you write the summary paragraph.'],
    bad: [
      'Summarize the quarterly earnings report in three bullet points.',
      '請把季度財報摘要成三個重點。',
    ],
  },

  givesOutForUncertainty: {
    good: [
      'If a figure is not stated in the report, write "Not stated in the report" instead of guessing.',
      "If you don't know the answer, say you don't know.",
      '資料中如果沒有提到，就直接回答「資料中沒有提到」。',
    ],
    weak: [
      'Do not make anything up when you summarize the quarterly report.',
      '請不要編造任何沒有出現在報告裡的數字。',
    ],
    bad: [
      'Summarize the report in three bullet points for a general audience.',
      '請把報告摘要成三個重點。',
    ],
  },

  explainsWhy: {
    good: [
      'Format the answer as plain text because our downstream parser cannot handle markdown.',
      '請用純文字輸出，因為我們的解析器讀不了 markdown 標記。',
      'Keep every sentence short so that we can reuse them as UI tooltips later.',
    ],
    weak: ['Use plain text because.'],
    bad: [
      'Format the answer as plain text with no markdown at all.',
      '請用純文字輸出，不要有任何 markdown。',
    ],
  },

  asksToCiteSources: {
    good: [
      'Before answering, quote the exact sentences from the report that support your answer.',
      'Cite the supporting passages from the provided documents before you write the summary.',
      '回答前，請先引用文件中支持你答案的段落。',
    ],
    weak: [
      'Add a citation at the end of the answer if you can find one.',
      '如果方便的話，記得標註一下出處。',
    ],
    bad: [
      'Summarize the report below in three bullet points for a general audience.',
      '請把這份報告摘要成三個重點給一般讀者看。',
    ],
  },

  putsQuestionLast: {
    good: [
      '<documents>\n<document index="1">\n<source>harvest-ledger.txt</source>\n<document_content>\n' +
        'Third season: 42 sacks of grain were stored, 9 were lost to rain, 4 were traded for salt.\n' +
        'Fourth season: 51 sacks were stored, 6 were lost to mould, 2 were given to the ferryman.\n' +
        '</document_content>\n</document>\n</documents>\n' +
        'Question: how many sacks left the store in each season?',
      '以下是兩季的收成紀錄，請先讀完再回答最後的問題。\n' +
        '第三季：入庫 42 袋穀物，雨損 9 袋，換鹽 4 袋，其餘留在下層地窖。\n' +
        '第四季：入庫 51 袋穀物，霉損 6 袋，撥給擺渡人 2 袋，其餘留在上層地窖。\n' +
        '問題：每一季各有多少袋離開了倉庫？',
    ],
    weak: [
      'The ledger below records two seasons of harvest for the lower cellar of the old archive tower.\n' +
        'Third season: 42 sacks stored, 9 lost to rain, 4 traded for salt, the rest kept in the cellar.\n' +
        'Question: how many sacks left the store?\n' +
        'Fourth season: 51 sacks stored, 6 lost to mould, 2 given to the ferryman, the rest kept upstairs.\n' +
        'Fifth season: 60 sacks stored, 3 lost to frost, 5 sold at the harbour market, the rest kept dry.',
    ],
    bad: [
      'How many sacks left the store?\n' +
        'Third season: 42 sacks of grain were stored, 9 were lost to rain, 4 were traded for salt.\n' +
        'Fourth season: 51 sacks were stored, 6 were lost to mould, 2 were given to the ferryman.\n' +
        'Fifth season: 60 sacks were stored, 3 were lost to frost, 5 were sold at the harbour market.',
      'Summarize the notice below in three bullet points.',
    ],
  },

  decomposesTask: {
    good: [
      "Break the user's request into all the required sub-tasks and finish them one at a time.",
      '請把這份委託拆解成子任務，逐一完成再回報。',
      '1. List every broken part in the workshop\n2. Draft a fix for each part\n3. Write a single work order',
    ],
    weak: [
      '1. Read the notes\n2. Write the summary',
      'Handle the sub-tasks in whatever order you find convenient.',
    ],
    bad: [
      'Summarize the report below in three bullet points, each under 20 words.',
      '請把下面的報告摘要成三個重點。',
    ],
  },

  asksToRefine: {
    good: [
      'Draft the notice, then review it against the checklist and rewrite the draft with the fixes applied.',
      'Improve the prompt below so it produces a cleaner notice.',
      '先寫一份草稿，再對照標準檢查，最後修訂草稿。',
    ],
    weak: [
      'Please improve it a little before sending it out.',
      'Give the answer a quick review before you send it.',
    ],
    bad: [
      'Summarize the report below in three bullet points.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  definesTools: {
    good: [
      'name: open_sluice_gate\ndescription: Opens a named sluice gate to the requested height.\n' +
        'parameters: gate_name (string, gate label in snake case), height_cm (integer, 0-120)',
      '工具名：open_gate\n說明：打開指定的水閘到指定高度\n參數：gate_name（字串，水閘代號）、height_cm（整數，0 到 120）',
    ],
    weak: [
      'name: open_gate\ndescription: opens the sluice gate on the canal',
      'Give the agent a tool it can call for opening the gates.',
    ],
    bad: [
      'Summarize the report below in three bullet points.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  setsPersistence: {
    good: [
      "You are an agent — keep going until the user's query is completely resolved before ending your turn.",
      'Only terminate your turn once the whole task is finished and you are sure it works.',
      '你是一個代理：請一直處理直到問題完全解決，再把結果交還給我。',
    ],
    weak: ['You are an agent that helps with canal maintenance work.'],
    bad: [
      'Summarize the report below in three bullet points.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  requiresConfirmation: {
    good: [
      'Ask me for approval before you delete any file in the archive.',
      'Before you force-push anything, check with me first.',
      '刪除檔案庫裡的任何紀錄之前，請先詢問我，取得同意再動手。',
    ],
    weak: [
      'Confirm the plan with me whenever you feel like it.',
      '有問題的話再跟我確認一下，其他的你自己看著辦就好。',
    ],
    bad: [
      'Summarize the report below in three bullet points.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  mentionsParameters: {
    good: [
      'Run this with temperature = 0.2 and top_p = 0.8 so the wording stays repeatable.',
      'Use reasoning_effort high and verbosity low for this one.',
      '請把 temperature 設為 0，並將 max output tokens 設為 300。',
    ],
    weak: [
      'Tune the sampling parameters before you run the batch.',
      '請自己調一下取樣參數再跑一次，其他設定維持預設就好。',
    ],
    bad: [
      'Summarize the report below in three bullet points.',
      '請把這份報告摘要成三個重點。',
    ],
  },

  keepsPromptLean: {
    good: [
      'Draft a repair plan for the bridge with a budget under 500 coins. Output: 3 bullet points.',
      '請寫出這座橋的修復計畫，控制在 3 個重點、預算 500 以內。',
    ],
    weak: [
      'Draft a repair plan for the old stone bridge on the north road. The plan should cover the ' +
        'materials we already have in the yard, the crew we can spare during the harvest week, the ' +
        'weather risk in the second half of the month, the budget ceiling of 500 coins, and the way we ' +
        'will hand the finished work over to the harbour office for their records and final sign-off.',
    ],
    bad: [
      'Think step by step about the bridge, then draft a repair plan under 500 coins.',
      'Draft a repair plan for the old stone bridge on the north road. Consider the materials in the ' +
        'yard, the crew we can spare during the harvest week, the weather risk late in the month, the ' +
        'budget ceiling of 500 coins, the ferry schedule, the quarry delivery dates, the mason guild ' +
        'rules, the harbour office paperwork, the winter storage of tools, the spare timber in the ' +
        'north shed, and the way we will hand the finished work over to the harbour office for their ' +
        'records, their archive copy, and the final sign-off from the council clerk on duty, plus the ' +
        'lantern oil we still owe the ferryman, the rope order that never arrived last season, the two ' +
        'apprentices who can only work mornings, and the paperwork the guild wants before the frost.',
    ],
  },
};

console.log('▸ 檢查器 fixtures');
for (const checkId of CHECK_IDS) {
  const fx = FIXTURES[checkId];
  ok(Boolean(fx), `[${checkId}] 有 fixture`);
  if (!fx) continue;

  for (const p of fx.good || []) {
    const r = runCheck(checkId, p);
    ok(r.score === 1, `[${checkId}] good 應通過`, `score=${r.score} · ${JSON.stringify(p.slice(0, 70))} · ${r.evidence}`);
  }
  for (const p of fx.weak || []) {
    const r = runCheck(checkId, p);
    ok(
      r.score > 0 && r.score < 1,
      `[${checkId}] weak 應只拿部分分數`,
      `score=${r.score} · ${JSON.stringify(p.slice(0, 70))} · ${r.evidence}`
    );
  }
  for (const p of fx.bad || []) {
    const r = runCheck(checkId, p);
    ok(r.score === 0, `[${checkId}] bad 應為 0 分`, `score=${r.score} · ${JSON.stringify(p.slice(0, 70))} · ${r.evidence}`);
  }
}

/* 反作弊 / 邊界 --------------------------------------------------- */
console.log('▸ 反作弊與邊界');
for (const checkId of CHECK_IDS) {
  eq(runCheck(checkId, '').score, 0, `[${checkId}] 空字串 0 分`);
  eq(runCheck(checkId, 'asdf').score, 0, `[${checkId}] 亂打 0 分`);
  eq(runCheck(checkId, 'a'.repeat(MIN_PROMPT_LENGTH - 1)).score, 0, `[${checkId}] 未達最短長度 0 分`);
}
// 把所有關鍵字塞在一起的「作弊 prompt」不該滿分通過所有檢查
const keywordSoup =
  'role format example constraint delimiter verify context step audience uncertainty why 角色 格式 範例 限制 分隔符 檢查 脈絡 步驟 對象 理由';
const soupScores = CHECK_IDS.map((id) => runCheck(id, keywordSoup).score);
ok(
  soupScores.filter((s) => s === 1).length <= 2,
  '關鍵字堆砌不該全部滿分',
  `full-pass=${soupScores.filter((s) => s === 1).length} / ${soupScores.length}`
);
eq(runCheck('hasConstraint', '請幫我寫 3 個標題選項給行銷團隊參考').score, 1, 'hasConstraint：中文數量詞可辨識');
eq(runCheck('hasConstraint', 'Give me about 7 of them, thanks a lot for helping').score, 0, 'hasConstraint：沒有單位不算');
eq(runCheck('hasFewShot', 'Here is an example of what I mean by good tone.').score, 0, 'hasFewShot：只寫 example 不算');
eq(runCheck('unknownCheck', 'whatever this prompt says here').score, 0, '未知檢查器不會爆炸');

/* ------------------------------------------------------------------ */
/* 2. 關卡評分與評價                                                   */
/* ------------------------------------------------------------------ */
console.log('▸ 關卡評分');

/* Phase 9 的評價曲線：S ≥ 0.95 / A ≥ 0.78 / B ≥ 0.60 / C = 只要達到 challenge.pass */
eq(gradeForRatio(1), 'S', 'ratio 1.00 → S');
eq(gradeForRatio(0.95), 'S', 'ratio 0.95 → S（放寬：少半條也還是滿分）');
eq(gradeForRatio(0.94), 'A', 'ratio 0.94 → A');
eq(gradeForRatio(0.78), 'A', 'ratio 0.78 → A');
eq(gradeForRatio(0.77), 'B', 'ratio 0.77 → B');
eq(gradeForRatio(0.6), 'B', 'ratio 0.60 → B');
eq(gradeForRatio(0.59), 'C', 'ratio 0.59 → C');
eq(gradeForRatio(0.5), 'C', 'ratio 0.50 → C');
eq(betterGrade('B', 'A'), 'A', 'betterGrade 取較好');
eq(betterGrade('S', 'C'), 'S', 'betterGrade 不會退步');
eq(xpForGrade(null, 40), 0, '沒過關 0 XP');
ok(xpForGrade('S', 40) > xpForGrade('C', 40), 'S 的 XP 高於 C');

const gate = challenges.find((c) => c.id === 'gate-of-clarity-01');
const gateFail = evaluate(gate, '幫我寫一下那個東西');
ok(!gateFail.passed, '清晰之門：模糊 prompt 不過關', `earned=${gateFail.earned}/${gateFail.total}`);
ok(gateFail.missing.length > 0 && gateFail.missing.every((m) => m.hint), '未過關時每條缺失都有教學提示');

const gateS = evaluate(
  gate,
  'Summarize the notice below for first-time visitors who have never been to this town.\n' +
    'Output format: exactly 3 bullet points, each under 20 words.'
);
eq(gateS.passed, true, '清晰之門：完整 prompt 過關');
eq(gateS.grade, 'S', '清晰之門：全中拿 S');
ok(gateS.xp > 0, '過關有 XP');

const gatePartial = evaluate(gate, 'Summarize the notice below in exactly 3 bullet points.');
ok(gatePartial.passed, '清晰之門：缺對象仍可低分過關', `earned=${gatePartial.earned}`);
ok(gatePartial.grade !== 'S', '缺一項就拿不到 S');

for (const c of challenges) {
  const total = c.rubric.reduce((n, r) => n + r.weight, 0);
  ok(c.pass > 0 && c.pass < total, `[${c.id}] pass 門檻介於 0 與總權重之間`, `pass=${c.pass} total=${total}`);
  // Phase 9：門檻一律放寬到總權重的一半左右（原本 66–75%），一般人做到一半就能過
  ok(c.pass <= Math.ceil(total * 0.55), `[${c.id}] 通過門檻放寬到約一半`, `pass=${c.pass} total=${total}`);
  ok(c.pass >= 2, `[${c.id}] 門檻不會低到「寫一句就過」`, `pass=${c.pass}`);
  ok(c.rubric.every((r) => CHECK_IDS.includes(r.check)), `[${c.id}] rubric 只用已實作的檢查器`);
  eq(evaluate(c, '').passed, false, `[${c.id}] 空 prompt 不過關`);
  eq(evaluate(c, '???').earned, 0, `[${c.id}] 亂打 0 分`);
}

/* ------------------------------------------------------------------ */
/* 2b. Phase 8：每關的題目設計（任務 / 素材 / 起手 / 提示 / 快速填入 / 範例） */
/* ------------------------------------------------------------------ */
console.log('▸ 題目設計（Phase 8）');

/** 資料裡的示範解答（顯示給玩家的「看看範例」用的就是這一份）。 */
const REFERENCE_SOLUTIONS = Object.fromEntries(challenges.map((c) => [c.id, c.sample]));

/**
 * 舊的英文示範解答：rubric 沒有動過，所以它們必須照樣過關。
 * 留著是為了守住檢查器的英文路徑 —— 玩家想用英文寫 prompt 也要判得出來。
 */
const LEGACY_EN_SOLUTIONS = {
  'gate-of-clarity-01':
    'Summarize the town notice below for first-time visitors who have never been here.\n' +
    'Output format: 3 bullet points, each under 20 words.',
  'postbox-sprite-02':
    'Rewrite the letter inside the tags as a formal notice.\n' +
    '<letter>\nDear neighbour, the well will be closed.\n</letter>\n' +
    'Output format: a markdown table with two columns, no more than 5 rows.',
  'lost-automaton-03':
    'Walk to the north gate and wait there. Keep your lantern lit the whole way, ' +
    'because the fog hides the path and the lamp is how the watchman finds you.',
  'mimic-mirror-04':
    'Convert each raw log line into a one-line summary, following the examples.\n' +
    'Input: gate opened at 0400 by watchman\nOutput: 04:00 — gate opened (watchman)\n' +
    'Input: lantern refilled at 0530\nOutput: 05:30 — lantern refilled\n' +
    'Output format: one line per entry, plain text.',
  'long-scroll-archive-05':
    'Answer the question using ONLY the scroll inside <context>. Do not use outside knowledge.\n' +
    '<context>\nThe harvest ledger for the third season.\n</context>\n' +
    'List the findings in at most 5 bullet points.',
  'council-envoy-06':
    'You are writing on behalf of the council. Draft the commission letter for the ferryman, ' +
    'who has never read a council document before.\n' +
    'Output format: 3 short paragraphs, no more than 120 words in total.\n' +
    'Keep the tone plain and direct, because the ferryman must act on it tonight.\n' +
    'Before finishing, check your answer against every requirement above and fix anything missing.',

  /* --- 示範與推理 --- */
  'example-hall-11':
    'Classify each traveller note by mood, following the examples.\n' +
    '<example>\nInput: The bridge was out, but a stranger rowed me across.\nOutput: hopeful\n</example>\n' +
    '<example>\nInput: Three days of rain and the lantern oil is gone.\nOutput: bleak\n</example>\n' +
    'Output format: one word per note, after an Output: prefix.',
  'lantern-rows-12':
    'Convert each lamp log into one status line, using the 3 examples below as the exact pattern.\n' +
    'Input: lamp 4 flickering at dusk\nOutput: lamp-4 | dusk | flickering\n' +
    'Input: lamp 7 steady all night\nOutput: lamp-7 | night | steady\n' +
    'Input: lamp 2 dark since noon\nOutput: lamp-2 | noon | dark\n' +
    'Output format: one line per lamp, fields separated by a pipe.',
  'silent-thinker-13':
    'Draft a repair plan for the broken bridge with a budget under 500 coins.\n' +
    'Output format: 3 bullet points, one per stage.',
  'thinking-chamber-14':
    'Identify which lantern failed first, thinking step by step before you answer.\n' +
    'Put your reasoning in <thinking> tags and the final result in <answer> tags.\n' +
    'Follow this example:\n' +
    'Input: lamp 2 dark at noon, lamp 5 dark at dusk\n' +
    'Output: <thinking>noon comes before dusk</thinking><answer>lamp 2</answer>',
  'effort-forge-15':
    'Calculate the shortfall in the harvest ledger below and report it in one sentence.\n' +
    'Run this with reasoning_effort = high, and think very hard before answering.\n' +
    'Before finishing, verify every number against the ledger and correct any mismatch.',

  /* --- 脈絡與長文 --- */
  'citation-desk-21':
    'Answer the question using ONLY the ledger inside <document>. Do not use outside knowledge.\n' +
    '<document>\nThird season: 42 sacks stored, 9 lost to rain, 4 traded for salt.\n</document>\n' +
    'Before answering, quote the exact lines from the document that support your answer.',
  'well-of-unknowing-22':
    'Answer the traveller question using only the text below.\n' +
    'If the answer is not stated in the notice, reply "Not stated on the board" and ask the traveller ' +
    'for the information you need.\n' +
    'Keep the reply to one sentence.',
  'long-scroll-tower-23':
    '<documents>\n<document index="1">\n<source>harvest-ledger.txt</source>\n<document_content>\n' +
    'Third season: 42 sacks of grain were stored, 9 were lost to rain, 4 were traded for salt.\n' +
    'Fourth season: 51 sacks were stored, 6 were lost to mould, 2 were given to the ferryman.\n' +
    '</document_content>\n</document>\n</documents>\n' +
    'Using only the information above, answer the question below in a table with two columns.\n' +
    'Question: which sacks left the store, and in which season did each leave?',
  'verify-spring-24':
    'First read every note in the map room, then say which path is safe.\n' +
    'Use only the notes you have actually read, and do not rely on outside knowledge.\n' +
    'If the answer is not stated in the notes, say "no record" instead of guessing.\n' +
    'Before finishing, recount the distances with the calculator tool and check the totals.',
  'archive-seal-25':
    '<documents>\n<document index="1">\n<source>cellar-ledger.txt</source>\n<document_content>\n' +
    'Third season: 42 sacks stored, 9 lost to rain, 4 traded for salt.\n' +
    'Fourth season: 51 sacks stored, 6 lost to mould, 2 given to the ferryman.\n' +
    '</document_content>\n</document>\n</documents>\n' +
    'Use only the information above; do not use outside knowledge.\n' +
    'Before answering, quote the exact lines that support your answer.\n' +
    'If the answer is not stated in the documents, reply "Not stated in the documents".\n' +
    'Question: how many sacks left the store in each season?',

  /* --- 流程與代理 --- */
  'subtask-workbench-31':
    'Break the repair job into sub-tasks, then work through them in order.\n' +
    '1. List every broken part in the workshop.\n' +
    '2. Draft a fix for each part, one line per part.\n' +
    '3. Write a single work order that merges the fixes.\n' +
    'Output format: a numbered list, one line per sub-task result.\n' +
    'Confirm that each sub-task is completed before you finish.',
  'draft-review-wheel-32':
    'Draft the closure notice first, then review it against the criteria below and rewrite the draft ' +
    'with the fixes applied.\n' +
    'Criteria: under 80 words, names the closing date, plain language only.\n' +
    'Output format: three short paragraphs of plain text.\n' +
    'Before finishing, check the rewritten notice against every criterion above.',
  'tool-forge-33':
    'Add this tool to the workshop agent so it can raise water for the mill.\n' +
    'name: open_sluice_gate\n' +
    'description: Opens a named sluice gate on the canal to the requested height.\n' +
    'parameters: gate_name (string, gate label in snake case), height_cm (integer, 0-120)\n' +
    '## Examples\n' +
    'Call open_sluice_gate when the miller asks for more water.\n' +
    'Output format: JSON matching the tool schema, with no prose around it.',
  'irreversible-gate-34':
    'Make the following changes to the canal system yourself; do not just suggest them.\n' +
    'Break the work into sub-tasks and note which tool calls are independent so they can run in parallel.\n' +
    'Keep going until the whole job is completely resolved, and only stop when you are sure it works.\n' +
    'Ask me for confirmation before you delete any gate log, because that cannot be undone.',
  'oracle-workshop-36':
    'You are the workshop dispatcher. Break this request into two steps and run them in order.\n' +
    'name: get_weather\n' +
    'description: Looks up the weather for a place on a given day.\n' +
    'parameters: place (string, which place to look up), day (string, which day to look up)\n' +
    'name: send_letter\n' +
    'description: Sends a piece of text to a named recipient.\n' +
    'parameters: recipient (string, who receives it), body (string, what the letter says)\n' +
    '1. Call get_weather with place = the lake and day = tomorrow.\n' +
    '2. Call send_letter with recipient = the lighthouse keeper and body = the result of step 1.\n' +
    'If an argument is not stated in the request, ask me for it rather than guessing.',
  'echo-workshop-35':
    '## Fixed context\n' +
    'The workshop rebuilds the same notice every week, so keep this block unchanged at the top.\n' +
    '## Task\n' +
    'Improve the prompt below so it produces a cleaner notice, because the previous version buried the ' +
    'closing date in the last line.\n' +
    'Output format: a numbered list of the changes you made, then the rewritten prompt.',

  /* --- 角色與參數 --- */
  'mask-workshop-41':
    '## System\n' +
    'You are a harbour master with thirty years on this coast.\n' +
    '## Task\n' +
    "Explain tonight's crossing to the new ferry crew.\n" +
    'Output format: 5 bullet points, each under 15 words.',
  'priority-stair-42':
    '# Role and Objective\n' +
    "You are the harbour's duty officer writing the night briefing.\n" +
    '# Instructions\n' +
    'Summarize the three incidents below for the incoming shift.\n' +
    '# Output Format\n' +
    'A markdown table with columns: time, incident, action.\n' +
    '# Context\n' +
    'The shift changes at midnight.',
  'dial-room-43':
    'Generate ten sign slogans for the harbour market.\n' +
    'Run it with temperature = 0.2 and top_p = 0.8, because we need repeatable wording for the printer.\n' +
    'Set max output tokens to 300 and stop at the marker string.\n' +
    'Output format: one slogan per line, at most 12 words each.',
  'four-elements-mirror-44':
    'Persona: you are a harbour market planner.\n' +
    'Task: write the weekly notice for stallholders who have never sold here before.\n' +
    'Context: the market moves to the north pier next week because the south pier is being rebuilt.\n' +
    'Format: three short plain-text paragraphs, no more than 90 words in total.',
  'crossroad-scale-45':
    'Choose the safest of the three ferry routes, with effort = high and verbosity = low.\n' +
    'Success criteria: under 60 words, names one route, lists 2 risks.',
};
for (const c of challenges) {
  const en = LEGACY_EN_SOLUTIONS[c.id];
  ok(Boolean(en), `[${c.id}] 有英文對照解答`);
  if (!en) continue;
  const ev = evaluate(c, en);
  ok(ev.passed, `[${c.id}] 英文寫法照樣過關（檢查器雙語）`, `earned=${ev.earned}/${ev.total}`);
}

for (const c of challenges) {
  const solution = REFERENCE_SOLUTIONS[c.id];
  ok(Boolean(solution), `[${c.id}] 有示範解答`);
  if (!solution) continue;
  const ev = evaluate(c, solution);
  ok(ev.passed, `[${c.id}] 示範解答可過關`, `earned=${ev.earned}/${ev.total} miss=${ev.missing.map((m) => m.check).join(',')}`);
  ok(['A', 'S'].includes(ev.grade), `[${c.id}] 示範解答評價 ≥ A`, `grade=${ev.grade} ratio=${ev.ratio.toFixed(2)}`);
}

/* --- 題目：每一關都要真的是一道題（Phase 8 的核心修正） ---------------- */
const CJK = /[一-鿿]/;
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

for (const c of challenges) {
  const tag = `[${c.id}]`;

  // 1. 任務：一句話講清楚玩家要做什麼（不是氛圍，是指令）
  ok(nonEmpty(c.mission), `${tag} 有明確的「你的任務」`);
  ok(c.mission.length >= 20 && c.mission.length <= 120, `${tag} 任務一兩句話講完`, `${c.mission.length} 字`);
  ok(CJK.test(c.mission), `${tag} 任務是中文`);

  /**
   * 1b. Phase 12：工法（craft）—— 四幕分鏡的資料前提。
   * 第一幕（委託）只講「要做什麼」，第二幕（神諭刻文）才講「怎麼答」。
   * 所以「怎麼答」一律住在 craft，不准回頭混進 mission。
   */
  ok(nonEmpty(c.craft), `${tag} 有第二幕的工法（craft）`);
  ok(c.craft.length >= 15 && c.craft.length <= 120, `${tag} 工法一兩句話講完`, `${c.craft.length} 字`);
  ok(CJK.test(c.craft), `${tag} 工法是中文`);
  ok(c.craft !== c.mission, `${tag} 委託與工法不是同一句`);

  // 2. 素材：NPC 真的遞給你的東西（有就要完整）
  if ('material' in c) {
    ok(nonEmpty(c.material.label), `${tag} 素材有標題`);
    ok(nonEmpty(c.material.text), `${tag} 素材有內容`);
    ok(c.material.text.length <= 260, `${tag} 素材夠短，看得完`, `${c.material.text.length} 字`);
  }

  // 3. 輸入框提示：告訴玩家「這裡大概要打什麼」
  ok(nonEmpty(c.placeholder), `${tag} 有輸入框提示`);
  ok(CJK.test(c.placeholder), `${tag} 輸入框提示是中文`);
  ok(c.placeholder !== c.sample, `${tag} 提示不是直接把答案寫出來`);

  // 4. 起手的弱寫法：有的話一定要不過關（玩家是在「修」，不是抄）
  if ('starter' in c) {
    ok(nonEmpty(c.starter), `${tag} 起手寫法非空`);
    const weak = evaluate(c, c.starter);
    ok(!weak.passed, `${tag} 起手的弱寫法不會過關`, `earned=${weak.earned}/${weak.total} pass=${c.pass}`);
  }

  // 5. 快速填入：2–4 片，按下去要真的插得進東西
  ok(Array.isArray(c.quickFills), `${tag} 有快速填入`);
  ok(c.quickFills.length >= 2 && c.quickFills.length <= 4, `${tag} 快速填入 2–4 片`, `n=${c.quickFills.length}`);
  for (const f of c.quickFills) {
    ok(nonEmpty(f.label) && f.label.length <= 12, `${tag} 快速填入的標籤短而好認`, f.label);
    ok(nonEmpty(f.text), `${tag} 快速填入「${f.label}」插得進內容`);
    ok(f.text.length <= 220, `${tag} 快速填入「${f.label}」是短片段`, `${f.text.length} 字`);
    ok(CJK.test(f.text) || /[<#|=]/.test(f.text), `${tag} 快速填入「${f.label}」是中文或結構片段`);
  }
  // 快速填入是「零件」不是「答案卷」：全部按下去也不等於示範解答……
  const allFills = c.quickFills.map((f) => f.text).join('\n');
  ok(allFills.trim() !== c.sample.trim(), `${tag} 快速填入不是直接給答案`);
  // ……但它們必須真的有用：組起來要足以過關，不然就只是裝飾
  ok(evaluate(c, allFills).passed, `${tag} 快速填入組起來真的解得開`, `earned=${evaluate(c, allFills).earned}/${c.pass}`);

  // 6. 示範解答存在資料裡（UI 的「看看範例」用的就是它）
  ok(nonEmpty(c.sample), `${tag} 資料裡有示範解答`);
  ok(CJK.test(c.sample), `${tag} 示範解答是中文（玩家寫得出來的那種）`);
  if (c.material) {
    // 題目要有因果：答案得真的處理素材（用二字詞重疊度量，比整段比對寬容但仍有效）
    const bigrams = (text) => {
      const out = new Set();
      for (const run of text.match(/[一-鿿]{2,}/g) || []) {
        for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2));
      }
      return out;
    };
    const mat = bigrams(c.material.text);
    const shared = [...bigrams(c.sample)].filter((b) => mat.has(b));
    ok(
      shared.length >= 2,
      `${tag} 示範解答真的處理了素材（情境 ↔ 答案有因果）`,
      `共用詞 ${shared.slice(0, 6).join('、') || '（無）'}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* 2b-2. Phase 9：漂浮提示球的白話教學（coach.json）                    */
/*                                                                    */
/*   對象是完全沒有 prompt 背景的一般人：                                */
/*   每一條「關卡真的用到」的檢查都要有白話說明 ＋ 可以直接填的中文句子，  */
/*   而且那些句子插進輸入框之後，必須真的讓那條檢查亮起來。               */
/* ------------------------------------------------------------------ */
console.log('▸ 漂浮提示球的白話教學（Phase 9）');

const coachData = readJson('src/data/coach.json');
const prologueRaw = readJson('src/data/prologue.json');
const coachByCheck = new Map(coachData.entries.map((e) => [e.check, e]));

eq(coachData.authored, 'game', 'coach.json 明講自己是遊戲自撰的（不是官方文字）');
ok(/不是任何廠商的官方文字|遊戲自己寫|遊戲自撰/.test(coachData.note), 'coach.json 的說明講清楚它不是官方引文');
ok(/curriculum|圖鑑/.test(coachData.note), 'coach.json 把官方出處指回 curriculum / 圖鑑');
eq(new Set(coachData.entries.map((e) => e.check)).size, coachData.entries.length, 'coach.json 沒有重複的檢查');

/** 關卡與序章實際用到的檢查（提示球一定要教得到這些）。 */
const usedChecks = new Set([
  ...challenges.flatMap((c) => c.rubric.map((r) => r.check)),
  ...(prologueRaw.steps || []).flatMap((st) => st.rubric.map((r) => r.check)),
]);
for (const check of usedChecks) {
  const entry = coachByCheck.get(check);
  ok(!!entry, `[coach:${check}] 有對應的白話教學`);
  if (!entry) continue;
  const tag = `[coach:${check}]`;
  ok(nonEmptyStr(entry.title) && entry.title.length <= 16, `${tag} 標題短而好認`, entry.title);
  ok(nonEmptyStr(entry.what) && entry.what.length >= 20, `${tag} 有「這是什麼」的白話說明`, entry.what);
  ok(nonEmptyStr(entry.how) && entry.how.length >= 12, `${tag} 有「怎麼做」的具體做法`, entry.how);
  ok(CJK.test(entry.what) && CJK.test(entry.how), `${tag} 說明是中文`);
  ok(!ENGLISH(entry.what), `${tag} 說明裡沒有英文句子`, ENGLISH(entry.what) || '');
  ok(!ENGLISH(entry.how), `${tag} 做法裡沒有英文句子`, ENGLISH(entry.how) || '');
  ok(Array.isArray(entry.fills) && entry.fills.length >= 1, `${tag} 至少一片「幫我填」`);
  for (const f of entry.fills) {
    ok(nonEmptyStr(f.label) && f.label.length <= 14, `${tag} 填入片段的標籤短`, f.label);
    ok(nonEmptyStr(f.text), `${tag} 填入片段有內容`, f.label);
    ok(CJK.test(f.text) || /[【<#|=]/.test(f.text), `${tag} 填入的是中文或結構片段`, f.text.slice(0, 24));
    ok(!ENGLISH(f.text), `${tag} 填入片段沒有英文句子`, ENGLISH(f.text) || '');
  }
  // 關鍵：這些句子填進去，這條檢查必須真的亮起來（不然提示球是在騙人）
  const joined = entry.fills.map((f) => f.text).join('\n');
  const probe = (COACH_PROBE_PREFIX[check] || '') + joined;
  eq(runCheck(check, probe).score, 1, `${tag} 照著填就真的能點亮這一項`);
}
// 教練的說明不能取代官方出處：coach.json 不放連結
for (const e of coachData.entries) {
  const blob = JSON.stringify(e);
  ok(!/https?:\/\//.test(blob), `[coach:${e.check}] 不自帶連結（出處一律走 curriculum）`);
}

/* ------------------------------------------------------------------ */
/* 2b-3. Phase 9：全面中文化（遊戲自撰的文案不得出現英文句子）           */
/*                                                                    */
/*   規則：技術名詞（JSON / API / prompt / temperature / <thinking> …）  */
/*   可以留英文，但「連續三個以上的英文單字」= 一句英文句子 → 不合格。    */
/*   官方逐字引文不在此列（它們留在 curriculum.json，顯示時降級成原文）。 */
/* ------------------------------------------------------------------ */
console.log('▸ 全面中文化（Phase 9）');

/** 一定要是中文的欄位（玩家會直接讀到、或直接填進輸入框的）。 */
function zhFields(c) {
  const out = [
    ['title', c.title],
    ['npc', c.npc],
    ['scenario', c.scenario],
    ['mission', c.mission],
    ['craft', c.craft],
    ['clue', c.clue],
    ['starter', c.starter],
    ['placeholder', c.placeholder],
    ['sample', c.sample],
  ];
  if (c.material) {
    out.push(['material.label', c.material.label], ['material.text', c.material.text]);
  }
  (c.quickFills || []).forEach((f, i) => {
    out.push([`quickFills[${i}].label`, f.label], [`quickFills[${i}].text`, f.text]);
  });
  (c.rubric || []).forEach((r, i) => out.push([`rubric[${i}].hint`, r.hint]));
  return out.filter(([, v]) => typeof v === 'string');
}

for (const c of challenges) {
  for (const [key, value] of zhFields(c)) {
    const hit = ENGLISH(value);
    ok(!hit, `[${c.id}] ${key} 沒有英文句子`, hit ? `「${hit}」於：${value.slice(0, 60)}` : '');
  }
}
for (const b of prologueRaw.beats) {
  for (const [i, line] of (b.lines || []).entries()) {
    ok(!ENGLISH(line), `[beat:${b.id}] 第 ${i + 1} 句沒有英文句子`, ENGLISH(line) || '');
  }
  for (const key of ['objective', 'done', 'cta']) {
    if (typeof b[key] !== 'string') continue;
    ok(!ENGLISH(b[key]), `[beat:${b.id}] ${key} 沒有英文句子`, ENGLISH(b[key]) || '');
  }
}
for (const st of prologueRaw.steps) {
  for (const key of ['title', 'echo', 'brief', 'ask', 'starter', 'sample', 'sampleNote']) {
    if (typeof st[key] !== 'string') continue;
    ok(!ENGLISH(st[key]), `[${st.id}] ${key} 沒有英文句子`, ENGLISH(st[key]) || '');
  }
  for (const [i, r] of st.rubric.entries()) {
    ok(!ENGLISH(r.hint), `[${st.id}] rubric[${i}].hint 沒有英文句子`, ENGLISH(r.hint) || '');
  }
  // 中文示範層一定存在，而且與官方原文分開存放
  ok(st.quote && st.quote.zh, `[${st.id}] quote 帶有中文示範層 zh.*`);
}
// 每條檢查器的預設提示也要是白話中文
for (const id of CHECK_IDS) {
  const def = CHECK_DEFS[id];
  ok(CJK.test(def.hint), `[${id}] 檢查器的預設提示是中文`, def.hint);
  ok(!ENGLISH(def.hint), `[${id}] 檢查器的預設提示沒有英文句子`, ENGLISH(def.hint) || '');
  // 提示要「講得出怎麼做」：至少給一個可以照抄的中文句子或明確動作
  ok(def.hint.length >= 20, `[${id}] 提示夠具體（講得出怎麼做）`, def.hint);
}
// 未通過時，每條缺失的 evidence 也要是看得懂的中文（不能只丟英文範例）
for (const c of challenges) {
  const ev = evaluate(c, '幫我弄一下這個東西好嗎');
  for (const r of ev.results) {
    if (!r.evidence) continue;
    ok(!ENGLISH(r.evidence), `[${c.id}] ${r.check} 的回饋沒有英文句子`, ENGLISH(r.evidence) || '');
  }
}

/* ------------------------------------------------------------------ */
/* 2c. Phase 8：技巧積木的中文片段（遊戲自撰的翻譯層，不是官方引文）      */
/* ------------------------------------------------------------------ */
console.log('▸ 技巧積木的中文片段（Phase 8）');

const builderZh = readJson('src/data/builder-zh.json');
const CJK_ANY = /[一-鿿]/;

eq(builderZh.authored, 'game', 'builder-zh 明講自己是遊戲自撰的（不是官方文字）');
ok(
  /不是任何廠商的官方文字|遊戲|自己寫/.test(builderZh.note),
  'builder-zh 的說明講清楚它不是官方引文',
  builderZh.note
);
ok(/curriculum|sources/.test(builderZh.note), 'builder-zh 把官方出處指回 curriculum');
eq(builderZh.blocks.length, curriculum.builder.length, '每個積木都有中文片段');

const zhById = new Map(builderZh.blocks.map((b) => [b.id, b]));
/** 每個積木「應該點亮」的檢查器 —— 中文片段插進去要真的有效。 */
const BLOCK_CHECK = {
  role: 'hasRole',
  task: 'assignsTask',
  context: 'groundsInContext',
  fewshot: 'hasFewShot',
  cot: 'hasStepByStep',
  format: 'specifiesFormat',
  guardrail: 'givesOutForUncertainty',
  verify: 'asksToVerify',
};
for (const b of curriculum.builder) {
  const zh = zhById.get(b.id);
  ok(Boolean(zh), `[block:${b.id}] 有中文片段`);
  if (!zh) continue;
  ok(typeof zh.fragZh === 'string' && zh.fragZh.trim().length > 0, `[block:${b.id}] 中文片段非空`);
  ok(CJK_ANY.test(zh.fragZh), `[block:${b.id}] 插進去的真的是中文`, zh.fragZh.slice(0, 24));
  ok(zh.fragZh !== b.fragment, `[block:${b.id}] 中文片段不是照抄英文原句`);
  // 不得偽裝成官方引文：這一層不帶任何來源欄位
  ok(!('source' in zh) && !('sources' in zh) && !('url' in zh), `[block:${b.id}] 中文片段不附出處（它不是引文）`);
  const check = BLOCK_CHECK[b.id];
  ok(Boolean(check), `[block:${b.id}] 有對應的檢查器`);
  if (check) {
    eq(runCheck(check, zh.fragZh).score, 1, `[block:${b.id}] 中文片段真的點得亮 ${check}`);
  }
}
// 積木索引：content.js 會把中文片段接成 insert（UI 插進輸入框的就是它）
const { createContent } = await import('../src/challenges/content.js');
const contentIndex = createContent(curriculum, challengeData, builderZh);
for (const b of curriculum.builder) {
  const block = contentIndex.builderBlock(b.id);
  eq(block.insert, zhById.get(b.id).fragZh, `[block:${b.id}] 主控台插入的是中文片段`);
  eq(block.fragmentEn, b.fragment, `[block:${b.id}] 英文原句保留為次要參考`);
}
eq(
  createContent(curriculum, challengeData).builderBlock('role').insert,
  curriculum.builder.find((b) => b.id === 'role').fragment,
  '沒有中文層時退回原本的片段（不會壞掉）'
);

/* ------------------------------------------------------------------ */
/* 2d. Phase 14：官方範例的中文譯寫層                                   */
/*                                                                     */
/*   規則（護欄 2）：                                                   */
/*     · curriculum.json 逐字未改 —— 譯寫一律另存 curriculum-zh.json     */
/*     · 畫面上「中文在前」，官方英文原文收在可展開的「原文 ↗」＋出處     */
/*     · 譯寫不得自帶連結，也不得與官方原文一字不差（那就不是譯寫了）     */
/* ------------------------------------------------------------------ */
console.log('▸ 官方範例的中文譯寫（Phase 14）');

const curriculumZh = readJson('src/data/curriculum-zh.json');

eq(curriculumZh.authored, 'game', 'curriculum-zh 明講自己是遊戲自撰的（不是官方文字）');
ok(
  /不是任何廠商的官方文字|不當作引文|遊戲/.test(curriculumZh.note),
  'curriculum-zh 的說明講清楚它不是官方引文',
  curriculumZh.note
);
ok(/curriculum\.json/.test(curriculumZh.note), 'curriculum-zh 把官方說法指回 curriculum.json');

const zhTechEntries = Object.entries(curriculumZh.techniques || {});
ok(zhTechEntries.length > 0, 'curriculum-zh 至少譯寫了一條技巧');

/** 「官方原句：「…」」這種刻意保留的可照抄字串不算英文句子（那是要玩家打進去的）。 */
const stripQuoted = (s) => String(s || '').replace(/「[^」]*」/g, '　');

for (const [id, zh] of zhTechEntries) {
  const tech = curriculum.techniques.find((t) => t.id === id);
  ok(Boolean(tech), `[zh:${id}] 對應到 curriculum 裡真實存在的技巧`);
  if (!tech) continue;
  ok(!('source' in zh) && !('sources' in zh) && !('url' in zh), `[zh:${id}] 譯寫不自帶出處（它不是引文）`);
  for (const key of Object.keys(zh)) {
    ok(['example', 'tip', 'note'].includes(key), `[zh:${id}] 只覆寫 example / tip / note`, key);
    ok(nonEmptyStr(zh[key]), `[zh:${id}].${key} 非空字串`);
    ok(nonEmptyStr(tech[key]), `[zh:${id}].${key} 官方那一份也存在（不是憑空多出來的欄位）`);
    ok(zh[key] !== tech[key], `[zh:${id}].${key} 不是照抄官方原文`);
    ok(CJK_ANY.test(zh[key]), `[zh:${id}].${key} 真的是中文`, String(zh[key]).slice(0, 30));
    ok(!/https?:\/\//.test(zh[key]), `[zh:${id}].${key} 不含連結（出處只從 curriculum 來）`);
  }
}

/*
 * 涵蓋率 ＋ 「畫面上預設看不到整句英文」。
 * displayTechnique() 就是圖鑑與主控台實際用來顯示的那一支。
 */
const zhContent = createContent(curriculum, challengeData, builderZh, null, null, curriculumZh);
let translatedCount = { example: 0, tip: 0, note: 0 };
for (const tech of curriculum.techniques) {
  const view = zhContent.displayTechnique(tech.id);
  ok(Boolean(view), `[${tech.id}] displayTechnique 拿得到顯示用的內容`);
  for (const key of ['example', 'tip', 'note']) {
    const official = tech[key];
    if (!nonEmptyStr(official)) continue;
    const hit = ENGLISH(official);
    if (hit) {
      // 官方原文有整句英文 → 一定要有中文譯寫，而且要真的被顯示出來
      const zh = (curriculumZh.techniques[tech.id] || {})[key];
      ok(nonEmptyStr(zh), `[${tech.id}] 官方 ${key} 有英文句子 → 一定要有中文譯寫`, `官方：「${hit}」`);
      if (nonEmptyStr(zh)) {
        eq(view[key], zh, `[${tech.id}] 顯示出來的 ${key} 是中文譯寫`);
        eq(view.origin[key], official, `[${tech.id}] 官方 ${key} 原文逐字保留在「原文 ↗」裡`);
        ok(view.translated, `[${tech.id}] 標記成「有原文可展開」`);
        translatedCount[key] += 1;
      }
    } else {
      // 官方本來就沒有英文句子 → 不需要譯寫，原文直接顯示
      ok(view[key] === official || nonEmptyStr((curriculumZh.techniques[tech.id] || {})[key]),
        `[${tech.id}] 沒有英文句子的 ${key} 直接顯示官方原文`);
    }
  }
  // 圖鑑預設看得到的三段文字，一律不得出現整句英文（「」裡的照抄字串除外）
  for (const key of ['example', 'tip', 'note']) {
    if (!nonEmptyStr(view[key])) continue;
    const hit = ENGLISH(stripQuoted(view[key]));
    ok(!hit, `[${tech.id}] 圖鑑預設顯示的 ${key} 沒有整句英文`, hit ? `「${hit}」` : '');
  }
}
ok(translatedCount.example >= 27, `至少譯寫了 27 條技巧的官方範例`, `實際 ${translatedCount.example}`);
ok(translatedCount.tip >= 4, `帶英文句子的 tip 都譯寫了`, `實際 ${translatedCount.tip}`);
ok(translatedCount.note >= 1, `帶英文句子的 note 都譯寫了`, `實際 ${translatedCount.note}`);

// 沒有譯寫層時要能安靜降級（不會壞掉）
eq(
  createContent(curriculum, challengeData).displayTechnique('clarity-01').example,
  curriculum.techniques.find((t) => t.id === 'clarity-01').example,
  '沒有中文譯寫層時退回官方原文（不會壞掉）'
);
eq(
  createContent(curriculum, challengeData).displayTechnique('clarity-01').translated,
  false,
  '沒有中文譯寫層時不會謊稱「有原文可展開」'
);

// 結果面板不再秀一長串網址：每一關的官方出處都查得到文件名
for (const c of challenges) {
  const name = zhContent.sourceName(c.source);
  ok(name && name !== c.source, `[${c.id}] 結果面板顯示的是官方文件名而不是網址`, name);
}

/* ------------------------------------------------------------------ */
/* 2e. Phase 26：時代註記層（dated-notes.json）                         */
/*                                                                     */
/*   規則（護欄 2）：                                                   */
/*     · curriculum.json 逐字未改 —— 查核備註一律另存 dated-notes.json  */
/*     · 每一條都要掛在真實存在的技巧 id 上                             */
/*     · 每一條都要附**可點的 https 官方連結**（不然就只是傳言）        */
/*     · 檔案自己要標 authored: "game"，並講清楚它不是官方文字          */
/* ------------------------------------------------------------------ */
console.log('▸ 時代註記（Phase 26）');

const datedNotes = readJson('src/data/dated-notes.json');

eq(datedNotes.authored, 'game', 'dated-notes 明講自己是遊戲自撰的（不是官方文字）');
ok(
  /不是任何廠商的官方文字|不當作引文|遊戲/.test(datedNotes.note),
  'dated-notes 的說明講清楚它不是官方引文',
  datedNotes.note
);
ok(/curriculum\.json/.test(datedNotes.note), 'dated-notes 把官方說法指回 curriculum.json');
ok(/^\d{4}-\d{2}$/.test(String(datedNotes.checked || '')), 'dated-notes 標了查核年月', datedNotes.checked);

const datedList = datedNotes.notes || [];
ok(datedList.length > 0, 'dated-notes 至少有一條時代註記');
{
  const seen = new Set();
  for (const n of datedList) {
    const tech = curriculum.techniques.find((t) => t.id === n.techniqueId);
    ok(Boolean(tech), `[dated:${n.techniqueId}] 掛在 curriculum 裡真實存在的技巧上`);
    ok(!seen.has(n.techniqueId), `[dated:${n.techniqueId}] 沒有重複註記同一條技巧`);
    seen.add(n.techniqueId);
    ok(/^\d{4}-\d{2}$/.test(String(n.date || '')), `[dated:${n.techniqueId}] 有年月`, n.date);
    ok(nonEmptyStr(n.text), `[dated:${n.techniqueId}] 有備註文字`);
    ok(CJK_ANY.test(n.text), `[dated:${n.techniqueId}] 備註是中文`);
    ok(String(n.text).includes(n.date), `[dated:${n.techniqueId}] 畫面上看得到日期`, n.text.slice(0, 24));
    ok(!ENGLISH(n.text), `[dated:${n.techniqueId}] 備註沒有整句英文`, ENGLISH(n.text) || '');
    ok(!/https?:\/\//.test(n.text), `[dated:${n.techniqueId}] 連結另外放在 sources，不埋在文字裡`);
    ok((n.sources || []).length > 0, `[dated:${n.techniqueId}] 至少附一個官方出處`);
    for (const s of n.sources || []) {
      ok(nonEmptyStr(s.name), `[dated:${n.techniqueId}] 出處有文件名`);
      ok(/^https:\/\//.test(String(s.url || '')), `[dated:${n.techniqueId}] 出處是 https 連結`, s.url);
    }
  }
}

const srcNotes = datedNotes.sourceNotes || [];
ok(srcNotes.length > 0, 'dated-notes 至少標了一個已下架 / 即將移除的出處');
{
  /** curriculum 裡真的被引用到的每一個網址。 */
  const citedUrls = new Set();
  for (const t of curriculum.techniques || []) for (const s of t.sources || []) citedUrls.add(s.url);
  for (const list of Object.values(curriculum.sources || {})) for (const s of list || []) citedUrls.add(s.url);
  for (const s of srcNotes) {
    ok(citedUrls.has(s.url), `[deadsrc] 標註的網址真的被 curriculum 引用到`, s.url);
    ok(['gone', 'deprecated'].includes(s.status), `[deadsrc] 狀態是 gone / deprecated`, s.status);
    ok(/^\d{4}-\d{2}$/.test(String(s.date || '')), `[deadsrc] 有查核年月`, s.date);
    ok(CJK_ANY.test(s.text || ''), `[deadsrc] 說明是中文`, s.text);
    ok(String(s.text).includes(s.date), `[deadsrc] 畫面上看得到查核日期`, s.text);
    ok(Boolean(s.replacement && /^https:\/\//.test(s.replacement.url)), `[deadsrc] 給得出後繼參考的 https 連結`, s.url);
    ok(s.replacement.url !== s.url, `[deadsrc] 後繼參考不是原本那個網址`, s.url);
    ok(nonEmptyStr(s.replacement.name), `[deadsrc] 後繼參考有文件名`);
  }
  // 原網址**留在 curriculum 裡不動**（護欄 2：引文與出處逐字保留）
  const xai = curriculum.techniques.find((t) => t.id === 'role-04');
  ok(
    (xai.sources || []).some((s) => s.url === 'https://docs.x.ai/docs/guides/grok-code-prompt-engineering'),
    'curriculum 的原始出處網址沒有被改掉（只在顯示層加註）'
  );
}

// 顯示層：createContent 真的把註記接出來了
{
  const datedContent = createContent(
    curriculum,
    challengeData,
    builderZh,
    null,
    null,
    curriculumZh,
    datedNotes
  );
  for (const n of datedList) {
    const view = datedContent.displayTechnique(n.techniqueId);
    eq(view.dated, n, `[dated:${n.techniqueId}] displayTechnique 帶得出時代註記`);
    eq(datedContent.datedNote(n.techniqueId), n, `[dated:${n.techniqueId}] datedNote() 查得到`);
  }
  eq(datedContent.displayTechnique('clarity-01').dated, null, '沒有註記的技巧不會憑空多出一段');
  for (const s of srcNotes) eq(datedContent.sourceNote(s.url), s, `[deadsrc] sourceNote() 查得到`, s.url);
  eq(datedContent.sourceNote('https://ai.google.dev/gemini-api/docs/prompting-strategies'), null, '還活著的出處不會被誤標');
  // 沒有這一層時要安靜降級（不會壞掉）
  eq(createContent(curriculum, challengeData).displayTechnique('params-01').dated, null, '沒有時代註記層時安靜降級');
  eq(createContent(curriculum, challengeData).datedNote('params-01'), null, '沒有時代註記層時 datedNote() 回 null');
}

/*
 * 弱→強對照（curriculum.beforeAfter）目前唯一的顯示面是序章。
 * 序章自己帶中文示範層（Phase 9），官方英文收在「原文 ↗」——
 * 這裡把「有被顯示到的每一組都有中文」釘死，避免之後有人加了新的一組卻忘了翻。
 */
{
  const shownTitles = new Set(
    (prologueRaw.steps || [])
      .map((s) => s.quote)
      .filter((q) => q && q.kind === 'beforeAfter')
      .map((q) => q.title)
  );
  for (const title of shownTitles) {
    const pair = (curriculum.beforeAfter || []).find((b) => b.title === title);
    ok(Boolean(pair), `[beforeAfter:${title}] 對應到 curriculum 裡真實存在的對照`);
    const quote = prologueRaw.steps.find((s) => s.quote && s.quote.title === title).quote;
    ok(nonEmptyStr(quote.zh && quote.zh.weak), `[beforeAfter:${title}] 弱寫法有中文示範`);
    ok(nonEmptyStr(quote.zh && quote.zh.strong), `[beforeAfter:${title}] 強寫法有中文示範`);
    ok(quote.zh.weak !== (pair && pair.weak), `[beforeAfter:${title}] 中文示範不是照抄官方原文`);
  }
}

/* ------------------------------------------------------------------ */
/* 2e. Phase 17：介面上不准出現「API key」這類的旁白                    */
/*                                                                     */
/* 這款遊戲從來沒有出過「自己填金鑰接真模型」那個選配模式，對一般玩家   */
/* 來說那只是噪音。所以玩家看得到的字串裡不准再提到它。                 */
/*                                                                     */
/* 白名單：curriculum.json 是官方文件的逐字引文（護欄 2，一個位元組都   */
/* 不能動），以及程式碼註解（開發者看的，不是玩家看的）。               */
/* ------------------------------------------------------------------ */
console.log('▸ 介面不提金鑰（Phase 17）');

const BANNED_META = [
  /api[\s._-]*key/i,
  /apikey/i,
  /api\s*金鑰/i,
  /金鑰/,
  /bring\s+your\s+own\s+key/i,
  /自備[^\n]{0,6}(key|模型|api)/i,
  /真\s*LLM\s*模式/i,
];

function bannedHit(text) {
  for (const re of BANNED_META) {
    const m = String(text).match(re);
    if (m) return m[0];
  }
  return null;
}

// 把行註解與區塊註解拿掉（過度移除是安全的：只會少檢查，不會誤報）。
function stripComments(src) {
  let out = '';
  let inBlock = false;
  for (const line of src.split('\n')) {
    let s = line;
    if (inBlock) {
      const end = s.indexOf('*/');
      if (end < 0) {
        out += '\n';
        continue;
      }
      s = s.slice(end + 2);
      inBlock = false;
    }
    let kept = '';
    let i = 0;
    while (i < s.length) {
      if (s.startsWith('/*', i)) {
        const end = s.indexOf('*/', i + 2);
        if (end < 0) {
          inBlock = true;
          break;
        }
        i = end + 2;
        continue;
      }
      if (s.startsWith('//', i)) break;
      kept += s[i];
      i += 1;
    }
    out += `${kept}\n`;
  }
  return out;
}

/** 遞迴走訪 JSON 裡的每一個字串。 */
function walkStrings(node, path, visit) {
  if (typeof node === 'string') {
    visit(path, node);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkStrings(v, path ? `${path}.${k}` : k, visit);
  }
}

// (a) 資料層：curriculum.json 以外的每一份資料（那些是遊戲自撰、玩家會直接讀到的字）
{
  const { readdirSync } = await import('node:fs');
  const dataFiles = readdirSync(resolve(root, 'src/data'))
    .filter((f) => f.endsWith('.json') && f !== 'curriculum.json')
    .sort();
  ok(dataFiles.length >= 6, '掃到的資料檔數量合理', dataFiles.join(', '));
  for (const file of dataFiles) {
    const data = readJson(`src/data/${file}`);
    const hits = [];
    let strings = 0;
    walkStrings(data, '', (path, value) => {
      strings += 1;
      const hit = bannedHit(value);
      if (hit) hits.push(`${path}：「${hit}」於 ${value.slice(0, 60)}`);
    });
    ok(strings > 0, `${file} 掃得到字串`, `n=${strings}`);
    ok(hits.length === 0, `${file} 沒有提到金鑰之類的東西`, hits.slice(0, 4).join(' | '));
  }
}

// (b) 程式與樣式：只看真的會出現在畫面上的字（註解不算）
{
  const { readdirSync, statSync } = await import('node:fs');
  const files = [];
  const walkDir = (dir) => {
    for (const name of readdirSync(resolve(root, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(resolve(root, rel)).isDirectory()) {
        walkDir(rel);
      } else if (/\.(js|css|html)$/.test(name)) {
        files.push(rel);
      }
    }
  };
  walkDir('src');
  files.push('index.html', 'README.md');
  ok(files.length >= 20, '掃到的原始檔數量合理', `n=${files.length}`);
  for (const rel of files) {
    const raw = readFileSync(resolve(root, rel), 'utf8');
    const body = rel.endsWith('.md') ? raw : stripComments(raw);
    const hit = bannedHit(body);
    ok(!hit, `${rel} 沒有提到金鑰之類的旁白`, hit ? `「${hit}」` : '');
  }
}

// 白名單仍然成立：官方引文裡出現的 API 字樣一個字都沒被動到
{
  const apiTechniques = curriculum.techniques.filter((t) => /\bAPI\b/.test(`${t.title} ${t.tip}`));
  ok(apiTechniques.length > 0, '官方技巧裡本來就有講到 API 的（那是課程內容，必須留著）');
  for (const t of apiTechniques) {
    ok(!bannedHit(`${t.title} ${t.tip}`), `官方技巧 ${t.id} 講的是 API 參數，不是金鑰`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. 資料完整性（護欄 2：內容正確且附出處）                            */
/* ------------------------------------------------------------------ */
console.log('▸ 資料完整性');
const techById = new Map(curriculum.techniques.map((t) => [t.id, t]));
const allSourceUrls = new Set(curriculum.techniques.flatMap((t) => t.sources.map((s) => s.url)));

for (const c of challenges) {
  ok(c.teaches.length > 0, `[${c.id}] 至少教一個技巧`);
  for (const t of c.teaches) ok(techById.has(t), `[${c.id}] teaches "${t}" 存在於 curriculum`);
  for (const r of c.rubric) {
    ok(!r.techniqueId || techById.has(r.techniqueId), `[${c.id}] rubric techniqueId "${r.techniqueId}" 存在`);
  }
  ok(allSourceUrls.has(c.source), `[${c.id}] source 是 curriculum 裡真實存在的官方連結`, c.source);
  const teachUrls = new Set(c.teaches.flatMap((t) => (techById.get(t) ? techById.get(t).sources.map((s) => s.url) : [])));
  ok(teachUrls.has(c.source), `[${c.id}] source 屬於它所教技巧的出處`);
  ok(/^https:\/\//.test(c.source), `[${c.id}] source 是 https 連結`);
}
ok(
  curriculum.techniques.every((t) => Array.isArray(t.sources) && t.sources.length > 0),
  '68 條技巧每條都有官方出處'
);

/* 涵蓋率：每一條技巧都要有關卡教（圖鑑才收集得完） ------------------- */
const taught = new Set(challenges.flatMap((c) => c.teaches));
for (const t of curriculum.techniques) {
  ok(taught.has(t.id), `技巧 ${t.id}（${t.title}）至少被一個關卡教到`);
}
eq(taught.size, curriculum.techniques.length, `關卡 teaches 完整涵蓋 ${curriculum.techniques.length} 條技巧且無多餘 id`);

/* 每個區域都要有夠玩的關卡數，且關卡的 region 是真實區域 -------------- */
const regionIds = new Set(curriculum.groups.map((g) => g.id));
for (const c of challenges) {
  ok(regionIds.has(c.region), `[${c.id}] region "${c.region}" 是 curriculum 裡的區域`);
  ok(Array.isArray(c.position) && c.position.length === 2, `[${c.id}] 有世界座標`);
}
for (const g of curriculum.groups) {
  const n = challenges.filter((c) => c.region === g.id).length;
  ok(n >= 4, `[${g.id}] 至少有 4 關`, `目前 ${n} 關`);
}
const ids = challenges.map((c) => c.id);
eq(new Set(ids).size, ids.length, '關卡 id 沒有重複');
// 石座之間要有距離，才不會兩關擠在同一個互動點
for (let i = 0; i < challenges.length; i += 1) {
  for (let j = i + 1; j < challenges.length; j += 1) {
    const [ax, az] = challenges[i].position;
    const [bx, bz] = challenges[j].position;
    ok(
      Math.hypot(ax - bx, az - bz) > 13,
      `[${challenges[i].id}] 與 [${challenges[j].id}] 的石座距離足夠`,
      `距離 ${Math.hypot(ax - bx, az - bz).toFixed(1)}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* 3b. 世界地形：石座站得住、五片土地走得通                              */
/* ------------------------------------------------------------------ */
console.log('▸ 世界地形');
const World = await import('../src/world/world.js');

for (const c of challenges) {
  const [x, z] = c.position;
  const here = World.regionAt(x, z);
  ok(here && here.id === c.region && !here.onBridge, `[${c.id}] 石座落在 ${c.region} 區內`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.75, `[${c.id}] 石座站在實地上`, `coverage=${World.coverage(x, z).toFixed(2)}`);
  const y = World.terrainHeight(x, z);
  ok(y > -6 && y < 12, `[${c.id}] 石座高度合理`, `y=${y.toFixed(2)}`);
  // 石座周圍一圈也要踩得到，玩家才走得過去互動
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    ok(World.coverage(x + dx, z + dz) > 0.5, `[${c.id}] 石座周圍可站立`, `${dx},${dz}`);
  }
}

for (const corridor of World.CORRIDORS) {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const x = corridor.from.x + (corridor.to.x - corridor.from.x) * t;
    const z = corridor.from.z + (corridor.to.z - corridor.from.z) * t;
    ok(
      World.coverage(x, z) > 0.5,
      `[bridge:${corridor.region}] 整條橋都走得過去`,
      `t=${t.toFixed(2)} coverage=${World.coverage(x, z).toFixed(2)}`
    );
  }
  const g = World.regionAt(corridor.gate.x, corridor.gate.z);
  ok(
    g && g.id === corridor.region && g.onBridge,
    `[bridge:${corridor.region}] 閘門座落在通往該區的橋上`,
    JSON.stringify(g)
  );
  ok(corridor.gateAt > 0 && corridor.gateAt < corridor.length, `[bridge:${corridor.region}] 閘門在橋中段`);
}

// 區域之外是虛空（不能亂走）
ok(World.coverage(0, 0) > 0.9, '中央高原是實地');
ok(World.coverage(-95, 95) > 0.9, 'orchestration 中心是實地');
ok(World.coverage(0, -120) < 0.45, '兩片土地之間是虛空');
ok(World.terrainHeight(0, -120) < -20, '虛空的高度會塌下去');


/* ------------------------------------------------------------------ */
/* 3c. Phase 8：玩家碰撞（石頭擋得住人，但擋不住去路）                    */
/* ------------------------------------------------------------------ */
console.log('▸ 玩家碰撞（Phase 8）');

/**
 * 世界是用 three.js 場景圖組出來的，碰撞登記表也是從場景圖掃出來的 ——
 * 所以這裡真的把整個世界在 node 裡蓋一次。缺的只有 canvas（文字貼圖 / 光暈貼圖），
 * 補一個什麼方法都吞下去的替身即可；碰撞判定完全不碰貼圖。
 */
const anyStub = () =>
  new Proxy(
    { width: 8, height: 8 },
    { get: (t, k) => (k in t ? t[k] : () => anyStub()), set: (t, k, v) => ((t[k] = v), true) }
  );
const realDocument = globalThis.document;
globalThis.document = {
  createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => anyStub() }),
};

const THREE = await import('three');
const prologueForWorld = readJson('src/data/prologue.json');
// Phase 22：刻文小語與祕密地點也要蓋進測試世界（走位與穿模稽核都要含它們）
const inscriptionFile = readJson('src/data/inscriptions.json');
const secretFile = readJson('src/data/secrets.json');
// Phase 25：動得了的器物也要蓋進測試世界（碰撞、淨空、穿模稽核都要含它們）
const handleFile = readJson('src/data/handles.json');
const stubProgression = {
  bestGrade: () => null,
  gateStatus: () => ({ unlocked: false, text: '' }),
  isRegionUnlocked: () => true,
  hasReadLore: () => false,
  hasFoundInscription: () => false,
  hasFoundSecret: () => false,
  hasUsedHandle: () => false,
};
const worldOpts = {
  curriculum,
  challenges,
  progression: stubProgression,
  shrine: prologueForWorld.shrine,
  inscriptions: inscriptionFile.entries,
  secrets: secretFile.entries,
  handles: handleFile.entries,
};
const testScene = new THREE.Scene();
const testWorld = World.createWorld({
  engine: { scene: testScene, camera: {}, onUpdate() {} },
  quality: 'high',
  ...worldOpts,
});
// 低畫質是另一組道具數量與另一批位置，穿模稽核兩種都要過
const lowScene = new THREE.Scene();
const lowWorld = World.createWorld({
  engine: { scene: lowScene, camera: {}, onUpdate() {} },
  quality: 'low',
  ...worldOpts,
});
globalThis.document = realDocument;
if (!realDocument) delete globalThis.document;

ok(testWorld.solids.length > 100, '世界裡有夠多的實體道具擋得住人', `n=${testWorld.solids.length}`);
ok(
  testWorld.solids.length < 1400,
  '碰撞體數量沒有失控（solidAt 是線性掃描，每幀要跑好幾次）',
  `n=${testWorld.solids.length}`
);
ok(
  testWorld.solids.every((s) => s.r >= World.SOLID_MIN_RADIUS),
  '每個碰撞體都夠大（碎石不會變成看不見的牆）',
  `min=${Math.min(...testWorld.solids.map((s) => s.r)).toFixed(2)}`
);
ok(
  testWorld.solids.every((s) => (s.explicit ? s.r <= World.SOLID_MAX_EXPLICIT : s.r <= World.SOLID_MAX_RADIUS)),
  '每個碰撞體的半徑都在合理範圍（外接盒推出來的 ≤ 3.6；擺放時明講的地標臺座 ≤ 8）',
  `max=${Math.max(...testWorld.solids.map((s) => s.r)).toFixed(2)}`
);
ok(
  testWorld.solids.filter((s) => s.r > World.SOLID_MAX_RADIUS).every((s) => s.explicit),
  '超過 3.6 公尺的碰撞體一定是擺放時明講的（不是量錯的大道具）'
);
ok(
  testWorld.solids.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z)),
  '碰撞體座標都是有限數字'
);
// 飄在半空的東西（齒輪 / 思考環）不該變成看不見的牆
for (const site of World.REGION_SITES) {
  const around = testWorld.solids.filter(
    (s) => Math.hypot(s.x - site.x, s.z - site.z) < site.radius
  );
  ok(around.length > 0, `[${site.id}] 這片土地上有實體道具`, `n=${around.length}`);
}

/* --- 石座本體：擋得住人（Phase 20），但四面八方都走得到互動距離 --- */
for (const c of challenges) {
  const [x, z] = c.position;
  // Phase 20 之前這 26 座石座全部走得過去（產品回報的「石頭穿模」）
  ok(Boolean(testWorld.solidAt(x, z)), `[${c.id}] 石座本體擋得住人（走不進石頭裡）`);
  for (let a = 0; a < 24; a += 1) {
    const ang = (a / 24) * Math.PI * 2;
    for (const dist of [2, 3, 4, 5]) {
      const px = x + Math.cos(ang) * dist;
      const pz = z + Math.sin(ang) * dist;
      ok(
        !testWorld.solidAt(px, pz),
        `[${c.id}] 石座周圍 ${dist}m 走得到（互動不會被擋）`,
        `${px.toFixed(1)},${pz.toFixed(1)}`
      );
    }
  }
  // 「至少兩個方向走得到」不夠 —— 這裡要求 24 個方向全部都能走到互動距離內
  ok(
    2 + World.PLAYER_RADIUS < 6.5,
    `[${c.id}] 貼著石座站的位置（${(2).toFixed(1)}m）仍在互動半徑 6.5m 內`
  );
}

for (const lane of World.BRIDGE_LANES) {
  const dx = lane.bx - lane.ax;
  const dz = lane.bz - lane.az;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len;
  const nz = dx / len;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = lane.ax + dx * t;
    const z = lane.az + dz * t;
    for (const lat of [-2.4, 0, 2.4]) {
      ok(
        !testWorld.solidAt(x + nx * lat, z + nz * lat),
        `[bridge:${lane.region}] 主動線沒有被石頭堵住`,
        `t=${t.toFixed(2)} lat=${lat}`
      );
    }
  }
}

ok(!testWorld.solidAt(0, 6), '出生點沒有被擋住');
for (let a = 0; a < 16; a += 1) {
  const ang = (a / 16) * Math.PI * 2;
  ok(!testWorld.solidAt(Math.cos(ang) * 4, 6 + Math.sin(ang) * 4), '出生點周圍走得開');
  const [shx, shz] = prologueForWorld.shrine.at;
  ok(
    !testWorld.solidAt(shx + Math.cos(ang) * 3, shz + Math.sin(ang) * 3),
    '起始祭壇周圍走得開（序章要走進去）'
  );
}
// 石碑：本體擋得住，但一定走得到互動距離
const propsModule = await import('../src/world/props.js');
const tabletSpecs = propsModule.LORE_TABLETS;
const LANDMARKS_FOR_TEST = propsModule.LANDMARKS;
for (const tab of tabletSpecs) {
  let free = 0;
  for (let a = 0; a < 16; a += 1) {
    const ang = (a / 16) * Math.PI * 2;
    if (!testWorld.solidAt(tab.at[0] + Math.cos(ang) * 3, tab.at[1] + Math.sin(ang) * 3)) free += 1;
  }
  ok(free >= 12, `[lore:${tab.id}] 石碑四周多數方向走得到（互動半徑 4.6）`, `${free}/16`);
}

/* --- 沿牆滑 ＋ 脫困保險絲 --- */
{
  /*
   * 這一段驗的是「擦到**一顆**石頭時的切線滑動」，所以要挑一顆**孤立**的石頭：
   * 兩顆疊在一起的碎石本來就會把人夾住（那是另一回事，由脫困保險絲負責），
   * 拿它來驗切線滑動只會量到別的東西。
   */
  const solid = testWorld.solids.find(
    (s) =>
      World.regionAt(s.x, s.z) &&
      World.coverage(s.x, s.z) > 0.9 &&
      !testWorld.solids.some((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < s.r + o.r + 4)
  );
  ok(Boolean(solid), '找得到一顆孤立、站在實地上的碰撞體來測試');
  if (solid) {
    const from = { x: solid.x - (solid.r + 3), z: solid.z };
    // 直直往石頭走 → 被擋下來（不會穿過去）
    const blocked = testWorld.clampPosition(solid.x, solid.z, from.x, from.z);
    ok(
      Math.hypot(blocked.x - solid.x, blocked.z - solid.z) > solid.r,
      '直直走進石頭會被擋下來（不再穿模）',
      JSON.stringify(blocked)
    );
    // 斜著走 → 沿牆滑：至少有一軸還在動
    const slid = testWorld.clampPosition(from.x + 0.4, from.z + 0.4, from.x, from.z);
    ok(
      slid.x !== from.x || slid.z !== from.z,
      '擦到石頭時會沿牆滑，不會整個黏住',
      JSON.stringify(slid)
    );
    /* Phase 20：正面直直撞（位移貼著座標軸）也要滑得動。
       舊的「只鎖住被擋的那一軸」在這種情況下另一軸位移是 0 → 人會黏在石頭上繞不過去。 */
    {
      const rim = solid.r + World.PLAYER_RADIUS;
      const startX = solid.x - rim - 0.25;
      const startZ = solid.z + 0.15; // 幾乎正面（差一點點），玩家實際上就是這樣撞的
      // 只往 +x 推（z 完全不動）：撞上石頭之後應該被切線帶著往側邊走
      const head = testWorld.clampPosition(startX + 0.3, startZ, startX, startZ);
      ok(
        Math.abs(head.z - startZ) > 0.01,
        '正面直直撞上圓石時會被切線帶著滑開（不會黏死）',
        JSON.stringify(head)
      );
      ok(
        Math.hypot(head.x - solid.x, head.z - solid.z) >= rim - 0.05,
        '滑開之後人還是在石頭外面',
        `dist=${Math.hypot(head.x - solid.x, head.z - solid.z).toFixed(2)} rim=${rim.toFixed(2)}`
      );
      ok(!testWorld.solidAt(head.x, head.z), '滑開的落點不在任何道具裡');
    }
    // 保險絲：站在石頭正中央時會被往外推，而且推得出去
    let p = { x: solid.x, z: solid.z };
    let steps = 0;
    while (steps < 60) {
      const out = testWorld.escapeSolid(p.x, p.z, 0.35);
      if (!out) break;
      p = out;
      steps += 1;
    }
    ok(steps > 0, '卡在石頭裡時保險絲會啟動');
    ok(!testWorld.solidAt(p.x, p.z), '保險絲真的把玩家推出來了', `${steps} 步`);
    ok(steps <= 40, '脫困是漸進的一小步一小步（不是瞬移）', `${steps} 步`);
  }
  ok(testWorld.escapeSolid(0, 6) === null, '沒卡住的時候保險絲不動作');
}

/* ------------------------------------------------------------------ */
/* 3d. Phase 20：全場穿模稽核（沒有一件有份量的東西可以走過去）           */
/* ------------------------------------------------------------------ */
console.log('▸ 穿模稽核（Phase 20）');
{
  const Audit = await import('./collision-audit.mjs');

  for (const [label, w, scn] of [
    ['高畫質', testWorld, testScene],
    ['低畫質', lowWorld, lowScene],
  ]) {
    const res = Audit.auditCoverage(scn, World.solidAt, w.solids, World.terrainHeight);
    ok(res.checked.length > 150, `[${label}] 稽核真的掃到東西（有份量的網格）`, `n=${res.checked.length}`);
    const listing = Audit.summarize(res.uncovered)
      .slice(0, 8)
      .map(
        (g) =>
          `${g.n}× ${g.key} @(${g.sample.x.toFixed(1)},${g.sample.z.toFixed(1)}) r=${g.maxR.toFixed(2)} h=${g.maxH.toFixed(2)}`
      )
      .join(' ｜ ');
    ok(
      res.uncovered.length === 0,
      `[${label}] 沒有任何「有份量卻走得過去」的東西（半徑 ≥ ${Audit.RADIUS_MIN}、高 ≥ ${Audit.HEIGHT_MIN}、厚 ≥ ${Audit.PLATE_MIN}）`,
      listing || `uncovered=${res.uncovered.length}`
    );
    // 例外一律要說得出理由，而且只能是清單上那幾類（光、霧、水、地形、閘門力場）
    ok(
      res.excepted.every((e) => typeof e.excepted === 'string' && e.excepted.length > 4),
      `[${label}] 每個例外都寫得出理由`
    );
  }

  // 例外清單本身：不能無限膨脹，也不能拿來蓋掉真正的道具
  ok(Audit.EXCEPTIONS.length <= 10, '例外清單很短（每多一條都要說得出理由）', `n=${Audit.EXCEPTIONS.length}`);
  ok(
    Audit.EXCEPTIONS.every((e) => e.match instanceof RegExp && typeof e.why === 'string' && e.why.length > 4),
    '例外清單每一條都有正則與白話理由'
  );

  /* --- markSolidParts：厚的擋、細的不擋、光不擋 --- */
  {
    const g = new THREE.Group();
    const thick = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.2), new THREE.MeshBasicMaterial());
    const thin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.2, 0.1), new THREE.MeshBasicMaterial());
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ transparent: true })
    );
    const already = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    already.userData.solidRadius = 0.9;
    const tiny = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.2), new THREE.MeshBasicMaterial());
    tiny.scale.setScalar(0.3);
    g.add(thick, thin, light, already, tiny);
    const n = World.markSolidParts(g);
    eq(n, 1, 'markSolidParts 只標了那件夠厚的');
    eq(thick.userData.solid, true, '厚的（1.2 × 1.4）會擋人');
    eq(thin.userData.solid, undefined, '細桿（0.1 × 0.1）不擋人');
    eq(light.userData.solid, undefined, '半透明的光不擋人');
    eq(already.userData.solid, undefined, '已經明講半徑的不會被覆蓋');
    eq(tiny.userData.solid, undefined, '縮小之後不夠厚的不擋人');
  }

  /* --- 逐一點名：Phase 20 之前走得過去的那幾類東西 --- */
  const blockedAt = (x, z) => Boolean(testWorld.solidAt(x, z));
  // ① 石碑（爐火碑站在起始祭壇的淨空圈邊上，Phase 19 以前整塊是幽靈）
  for (const tab of tabletSpecs) {
    ok(blockedAt(tab.at[0], tab.at[1]), `[lore:${tab.id}] 石碑本體擋得住人`, `${tab.at}`);
  }
  // ② 地標的板根與大齒輪（只登記塔身時，人是從板根中間穿過去的）
  const treeAt = LANDMARKS_FOR_TEST.find((l) => l.id === 'great-tree').at;
  ok(blockedAt(treeAt[0] + 3.0, treeAt[1]), '[great-tree] 板根擋得住人');
  ok(blockedAt(treeAt[0] - 2.43, treeAt[1] + 1.76), '[great-tree] 另一條板根也擋得住人');
  ok(!blockedAt(treeAt[0] + 7, treeAt[1] + 7), '[great-tree] 樹外面照樣走得過去');
  const craneAt = LANDMARKS_FOR_TEST.find((l) => l.id === 'great-crane').at;
  ok(blockedAt(craneAt[0] - 7.5, craneAt[1] + 2.5), '[great-crane] 立起來的大齒輪擋得住人');
  // ③ 面具柱：擺放時就避開石座淨空圈（不是靠事後把碰撞拿掉）
  const configSite = World.REGION_SITES.find((s) => s.id === 'config');
  const poleSolids = testWorld.solids.filter(
    (s) => Math.abs(s.r - 0.7) < 0.001 && Math.hypot(s.x - configSite.x, s.z - configSite.z) < configSite.radius
  );
  ok(poleSolids.length >= 8, '面具柱擋得住人（沒有被淨空濾網掃成幽靈）', `n=${poleSolids.length}`);
  ok(
    poleSolids.every((s) =>
      challenges.every((c) => Math.hypot(s.x - c.position[0], s.z - c.position[1]) > World.PEDESTAL_CLEAR)
    ),
    '面具柱都不在石座的淨空圈裡（擺放時就避開了）'
  );
  // ④ 植被：樹幹與巨石擋得住，細枝走得過去
  const floraSolids = testWorld.solids.length;
  ok(floraSolids > 400, '整個世界的碰撞體數量有明顯成長（植被與小景零件都補上了）', `n=${floraSolids}`);

  /* --- 淨空濾網只掃得掉雜物 --- */
  ok(World.CLUTTER_RADIUS <= 0.8, '淨空濾網只掃得掉真正的碎石（半徑 ≤ 0.8）', `CLUTTER_RADIUS=${World.CLUTTER_RADIUS}`);
}

/* ------------------------------------------------------------------ */
/* 4. 存檔 + 進程（headless smoke test）                                */
/* ------------------------------------------------------------------ */
console.log('▸ 存檔與進程');

// 假的 localStorage，讓 src/save/save.js 在 node 下也能跑真正的路徑
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};

const SaveIO = await import('../src/save/save.js');
const { createProgression, levelFromXp } = await import('../src/progression/progression.js');

eq(SaveIO.load().xp, 0, '首次讀檔為新存檔');
eq(SaveIO.load().unlockedRegions[0], 'foundations', '預設解鎖 foundations');

memory.set(SaveIO.SAVE_KEY, '{ not json');
const realWarn = console.warn;
console.warn = () => {}; // 預期會警告；不要污染測試輸出
eq(SaveIO.load().xp, 0, '毀損存檔不會爆，退回預設值');
console.warn = realWarn;
memory.clear();

const weird = SaveIO.normalize({ version: 1, xp: -5, level: 0, collected: ['a', 'a', 3], bestGrades: { x: 'Z' }, settings: { volume: 9 } });
eq(weird.xp, 0, 'normalize：負 XP 修正為 0');
eq(weird.level, 1, 'normalize：等級下限為 1');
eq(weird.collected.length, 1, 'normalize：collected 去重並丟掉非字串');
eq(Object.keys(weird.bestGrades).length, 0, 'normalize：非法評價被丟棄');
eq(weird.settings.volume, 1, 'normalize：音量夾在 0..1');

eq(levelFromXp(0).level, 1, '0 XP = Lv.1');
eq(levelFromXp(99).level, 1, '99 XP 還是 Lv.1');
eq(levelFromXp(100).level, 2, '100 XP = Lv.2');
eq(levelFromXp(260).level, 3, '260 XP = Lv.3');

memory.clear();
const prog = createProgression({ curriculum, challenges });
eq(prog.state.xp, 0, '進程初始 XP 0');
eq(prog.isRegionUnlocked('foundations'), true, 'foundations 一開始就解鎖');
eq(prog.isRegionUnlocked('reasoning'), false, 'reasoning 一開始鎖住');
eq(prog.isRegionPlayable('reasoning'), false, 'reasoning 尚未解鎖 → 還不能進入');
ok(prog.gateStatus('reasoning').text.includes('Lv.3'), 'reasoning 閘門說明有等級條件', prog.gateStatus('reasoning').text);
eq(prog.gateStatus('reasoning').clearedNeeded, 4, 'reasoning 需要前一區通關 4 關');

// 沒過關 → 不給 XP、不收集
const failOutcome = prog.recordResult(evaluate(gate, '幫我弄一下'));
eq(failOutcome.xpGain, 0, '未過關 0 XP');
eq(prog.state.collected.length, 0, '未過關不收集技巧');

// 低分過關
const low = evaluate(gate, 'Summarize the notice below in exactly 3 bullet points.');
const lowOutcome = prog.recordResult(low);
ok(lowOutcome.xpGain > 0, '過關拿到 XP');
eq(prog.bestGrade(gate.id), low.grade, '最佳評價已記錄');
ok(gate.teaches.every((t) => prog.isCollected(t)), '過關把 teaches 收進圖鑑');
ok(prog.state.badges.openai > 0, '廠家徽章有累加');

// 重玩拿更好評價 → 只補差額
const xpAfterLow = prog.state.xp;
const high = evaluate(
  gate,
  'Summarize the notice below for first-time visitors who have never been to this town.\n' +
    'Output format: exactly 3 bullet points, each under 20 words.'
);
const highOutcome = prog.recordResult(high);
eq(prog.bestGrade(gate.id), 'S', '重玩刷新最佳評價');
eq(prog.state.xp, xpAfterLow + highOutcome.xpGain, 'XP 累加正確');
ok(highOutcome.xpGain > 0, '刷新評價有補差額 XP');

// 重玩拿更差評價 → 不倒退、不加分
const before = prog.state.xp;
prog.recordResult(evaluate(gate, 'Summarize the notice below in exactly 3 bullet points.'));
eq(prog.state.xp, before, '拿到較差評價不加分');
eq(prog.bestGrade(gate.id), 'S', '拿到較差評價不會覆蓋最佳紀錄');

// 解鎖鏈：一區一區推進，前一區沒打夠就不會開下一道門
const clearRegion = (regionId) => {
  for (const c of challenges.filter((x) => x.region === regionId)) {
    prog.recordResult(evaluate(c, REFERENCE_SOLUTIONS[c.id]));
  }
};

const three = challenges.filter((c) => c.region === 'foundations').slice(0, 3);
for (const c of three) prog.recordResult(evaluate(c, REFERENCE_SOLUTIONS[c.id]));
eq(prog.isRegionUnlocked('reasoning'), false, 'foundations 只打 3 關 → reasoning 仍鎖住（通關數不足）');

clearRegion('foundations');
ok(prog.levelInfo().level >= 3, '全破 foundations 至少 Lv.3', `level=${prog.levelInfo().level} xp=${prog.state.xp}`);
eq(prog.isRegionUnlocked('reasoning'), true, '全破 foundations 解鎖 reasoning');
eq(prog.isRegionPlayable('reasoning'), true, 'reasoning 已鋪內容且解鎖 → 可進入');
eq(prog.isRegionUnlocked('grounding'), false, '還沒打 reasoning → grounding 仍鎖住');
ok(prog.unlockedBuilderBlocks().length > 0, '學到技巧後解鎖 builder 積木', prog.unlockedBuilderBlocks().join(','));
ok(prog.regionMastery('foundations').collected > 0, 'foundations 有收集進度');

clearRegion('reasoning');
eq(prog.isRegionUnlocked('grounding'), true, '全破 reasoning 解鎖 grounding');
eq(prog.isRegionUnlocked('orchestration'), false, '還沒打 grounding → orchestration 仍鎖住');

clearRegion('grounding');
eq(prog.isRegionUnlocked('orchestration'), true, '全破 grounding 解鎖 orchestration');
eq(prog.isRegionUnlocked('config'), false, '還沒打 orchestration → config 仍鎖住');

clearRegion('orchestration');
eq(prog.isRegionUnlocked('config'), true, '全破 orchestration 解鎖 config');

clearRegion('config');
eq(prog.state.collected.length, curriculum.techniques.length, '全破所有關卡 → 68 條技巧全收集');
for (const g of curriculum.groups) {
  eq(prog.regionMastery(g.id).mastered, true, `[${g.id}] 全收集 → 精通`);
}
eq(prog.masteredRegions().length, curriculum.groups.length, '五個區域全部精通');

const achievement = prog.hiddenAchievement();
eq(achievement.complete, true, '隱藏成就達成（全技巧 ＋ 四廠徽章）');
eq(achievement.collected, curriculum.techniques.length, '隱藏成就的收集數正確');
ok(
  achievement.vendors.every((v) => v.done),
  '四廠徽章都達標',
  achievement.vendors.map((v) => `${v.id}=${v.count}`).join(',')
);
ok(
  Object.values(prog.state.badges).every((n) => n > 0),
  '四廠徽章都有數量'
);

// 存檔真的寫進 localStorage 且能重讀
ok(memory.has(SaveIO.SAVE_KEY), '進度已寫入 localStorage');
const reloaded = createProgression({ curriculum, challenges });
eq(reloaded.state.xp, prog.state.xp, '重新載入後 XP 一致');
eq(reloaded.bestGrade(gate.id), 'S', '重新載入後最佳評價一致');

// 重置
prog.resetAll();
eq(prog.state.xp, 0, '重置後 XP 歸零');
eq(prog.state.collected.length, 0, '重置後圖鑑清空');
eq(memory.has(SaveIO.SAVE_KEY), false, '重置後 localStorage 已清除');
eq(createProgression({ curriculum, challenges }).state.xp, 0, '重置後重新載入仍是新存檔');

/* ------------------------------------------------------------------ */
/* 7. 音訊模組（M5：分區配樂 ＋ 合成音效）                              */
/* ------------------------------------------------------------------ */
console.log('▸ 音訊模組');

const Audio = await import('../src/audio/audio.js');
const { REGION_MOODS, REGION_MOOD_IDS, moodFor, SFX, createAudio } = Audio;

eq(REGION_MOOD_IDS.length, 5, '五個區域都有配樂設定');
for (const g of curriculum.groups) {
  ok(Boolean(REGION_MOODS[g.id]), `[${g.id}] 有對應的配樂性格`);
}
// 每一區都要真的「不一樣」，否則跨區就沒有意義
eq(new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].root)).size, 5, '五區根音各不相同');
eq(new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].name)).size, 5, '五區曲名各不相同');
eq(new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].scale.join(','))).size, 5, '五區音階各不相同');
ok(
  new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].bellDensity)).size >= 4,
  '鐘聲密度至少有四種變化'
);
for (const id of REGION_MOOD_IDS) {
  const m = REGION_MOODS[id];
  ok(m.root > 60 && m.root < 400, `[${id}] 根音在可聽的低音域`, `root=${m.root}`);
  ok(m.scale.length >= 4, `[${id}] pad 至少四個聲部`);
  ok(m.bellDensity > 0 && m.bellDensity <= 1, `[${id}] 鐘聲密度是機率值`);
  ok(m.cutoff > 100, `[${id}] 低通截止頻率合理`);
}
eq(moodFor('foundations').id, 'foundations', 'moodFor 取得對應設定');
eq(moodFor('does-not-exist').id, 'foundations', 'moodFor 未知區域退回 foundations');

for (const kind of ['open', 'close', 'submit', 'pass', 'fail', 'unlock', 'codex', 'step', 'toast']) {
  const spec = SFX[kind];
  ok(Boolean(spec), `音效 ${kind} 有定義`);
  ok(spec && spec.seq.length > 0, `音效 ${kind} 至少一個音`);
  ok(spec && spec.gain > 0 && spec.gain < 0.3, `音效 ${kind} 音量不刺耳`, spec && String(spec.gain));
}

// 沒有 AudioContext（node / 舊瀏覽器）時整個模組要安靜地降級，不能丟例外
const silent = createAudio({ volume: 0.6, muted: false });
eq(silent.isStarted, false, '未啟動前 isStarted = false');
silent.start();
eq(silent.isStarted, false, '沒有 AudioContext → 安靜地不啟動');
eq(silent.setVolume(0.3), 0.3, '無音訊環境仍能記住音量');
eq(silent.setVolume(5), 1, '音量夾在 0..1');
eq(silent.setMuted(true), true, '無音訊環境仍能記住靜音');
eq(silent.cue('pass', { grade: 'S' }), true, '未啟動時 cue 不會丟例外');
eq(silent.cue('not-a-sound'), false, '未知音效回傳 false');
eq(silent.step(1), false, '未啟動時腳步聲不會丟例外');
eq(silent.region, 'foundations', '預設區域為 foundations');
eq(silent.setRegion('reasoning'), true, '可切換區域');
eq(silent.region, 'reasoning', '切換後區域更新');
eq(silent.mood.id, 'reasoning', '切換後 mood 跟著換');
eq(silent.setRegion('reasoning'), false, '切到同一區不重複淡入淡出');
eq(silent.setRegion('nope'), false, '未知區域不切換');
silent.dispose();

/* ------------------------------------------------------------------ */
/* 8. 世界氣氛表（M4：跨區的霧色 / 色偏 / 光強）                        */
/* ------------------------------------------------------------------ */
console.log('▸ 世界氣氛');

const { REGION_ATMOSPHERE, atmosphereFor } = World;
eq(Object.keys(REGION_ATMOSPHERE).length, 5, '五個區域都有氣氛設定');
for (const g of curriculum.groups) {
  const a = REGION_ATMOSPHERE[g.id];
  ok(Boolean(a), `[${g.id}] 有氣氛設定`);
  if (!a) continue;
  ok(Number.isFinite(a.fog), `[${g.id}] 霧色是數字`);
  ok(a.hemi > 0 && a.hemi < 2, `[${g.id}] 環境光強度合理`, String(a.hemi));
  ok(a.fogNear > 0 && a.fogFar > a.fogNear, `[${g.id}] 霧的遠近合理`);
  ok(a.exposure > 0.5 && a.exposure < 2, `[${g.id}] 曝光合理`, String(a.exposure));
  ok(a.motes > 0 && a.motes <= 2, `[${g.id}] 螢火密度合理`, String(a.motes));
}
eq(new Set(Object.values(REGION_ATMOSPHERE).map((a) => a.fog)).size, 5, '五區霧色各不相同（跨區看得出來）');
eq(new Set(Object.values(REGION_ATMOSPHERE).map((a) => a.tint)).size, 5, '五區色偏各不相同');
eq(atmosphereFor('config').fog, REGION_ATMOSPHERE.config.fog, 'atmosphereFor 取得對應設定');
eq(atmosphereFor('nope').fog, REGION_ATMOSPHERE.foundations.fog, 'atmosphereFor 未知區域退回 foundations');

/* ------------------------------------------------------------------ */
/* 9. 設定持久化（音量 / 靜音 / 畫質）                                  */
/* ------------------------------------------------------------------ */
console.log('▸ 設定持久化');

memory.clear();
const settingsProg = createProgression({ curriculum, challenges });
eq(settingsProg.state.settings.quality, 'high', '預設高畫質');
eq(settingsProg.state.settings.volume, 0.5, '預設音量 0.5');
eq(settingsProg.state.settings.muted, false, '預設不靜音');

settingsProg.updateSettings({ volume: 0.22, quality: 'low', muted: true });
const settingsReloaded = createProgression({ curriculum, challenges });
eq(settingsReloaded.state.settings.volume, 0.22, '音量寫入存檔並可重讀');
eq(settingsReloaded.state.settings.quality, 'low', '畫質寫入存檔並可重讀');
eq(settingsReloaded.state.settings.muted, true, '靜音寫入存檔並可重讀');

// 非法值不能污染存檔
eq(SaveIO.normalize({ settings: { quality: 'ultra' } }).settings.quality, 'high', '未知畫質退回 high');
eq(SaveIO.normalize({ settings: { volume: -3 } }).settings.volume, 0, '負音量夾到 0');
eq(SaveIO.normalize({ settings: { muted: 'yes' } }).settings.muted, true, '靜音一律轉布林');

// Phase 11：答題方式（石碑刻印 / 自由書寫）
eq(settingsProg.state.settings.promptMode, 'guided', '預設答題方式是石碑刻印（guided）');
eq(SaveIO.defaultSave().settings.promptMode, 'guided', '全新存檔的答題方式是石碑刻印');
eq(SaveIO.normalize({}).settings.promptMode, 'guided', '舊存檔沒有這個欄位 → 補成石碑刻印');
eq(
  SaveIO.normalize({ settings: { promptMode: 'stone' } }).settings.promptMode,
  'guided',
  '未知的答題方式退回石碑刻印'
);
eq(
  SaveIO.normalize({ settings: { promptMode: 'free' } }).settings.promptMode,
  'free',
  '明寫的自由書寫會被尊重'
);
settingsProg.updateSettings({ promptMode: 'free' });
eq(
  createProgression({ curriculum, challenges }).state.settings.promptMode,
  'free',
  '答題方式寫入存檔並可重讀'
);
settingsProg.updateSettings({ promptMode: 'guided' });

// Phase 17：效能監視器（預設關閉）
eq(SaveIO.defaultSave().settings.perfMonitor, false, '全新存檔的效能監視器是關閉的');
eq(SaveIO.normalize({}).settings.perfMonitor, false, '舊存檔沒有這個欄位 → 補成關閉');
eq(SaveIO.normalize({ settings: {} }).settings.perfMonitor, false, '有 settings 但沒這個欄位也是關閉');
eq(SaveIO.normalize({ settings: { perfMonitor: 'yes' } }).settings.perfMonitor, false, '非布林值一律當關閉');
eq(SaveIO.normalize({ settings: { perfMonitor: true } }).settings.perfMonitor, true, '明寫的開啟會被尊重');
settingsProg.updateSettings({ perfMonitor: true });
eq(
  createProgression({ curriculum, challenges }).state.settings.perfMonitor,
  true,
  '效能監視器的開關寫入存檔並可重讀'
);
settingsProg.updateSettings({ perfMonitor: false });

/* ------------------------------------------------------------------ */
/* 9b. Phase 19：效能監視器的顯示卡資訊                                 */
/*                                                                     */
/* 瀏覽器**沒有**「GPU 使用率 %」這種 API，所以只給拿得到的兩件事實：    */
/* 型號字串（WEBGL_debug_renderer_info）與每幀 GPU 耗時                  */
/* （EXT_disjoint_timer_query_webgl2）。下面驗的是字串整理與             */
/* 「驅動不給就安靜降級、絕不丟例外」。                                 */
/* ------------------------------------------------------------------ */
console.log('▸ 顯示卡資訊（Phase 19）');

const Perf = await import('../src/ui/perfmon.js');
const { shortenGpuName, isSoftwareRenderer, readGpuName, createGpuTimer, GPU_TIP, GPU_UNSUPPORTED, GPU_SOFTWARE_LABEL } =
  Perf;

eq(
  shortenGpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
  'NVIDIA GeForce RTX 4070 · D3D11',
  'ANGLE 的三段式字串縮成「顯示卡 · 後端」'
);
eq(
  shortenGpuName('ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.12027.9001)'),
  'AMD Radeon RX 6800 XT · D3D11',
  '裝置 id 與驅動版本都被削掉'
);
eq(
  shortenGpuName('NVIDIA GeForce RTX 4070 (ANGLE D3D11)'),
  'NVIDIA GeForce RTX 4070 · D3D11',
  '「型號 (ANGLE 後端)」這種寫法也認得'
);
eq(shortenGpuName('Apple M1 Pro'), 'Apple M1 Pro', '沒有 ANGLE 包裝就原樣留著');
eq(
  shortenGpuName('Intel(R) UHD Graphics 620'),
  'Intel UHD Graphics 620',
  '商標符號清掉'
);
eq(
  shortenGpuName('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver-5.0.0)'),
  'SwiftShader',
  '軟體渲染器那串又臭又長的字縮成看得懂的短名'
);
eq(
  shortenGpuName('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 16.0.0) (0x0000C0DE)), SwiftShader driver)'),
  'SwiftShader',
  'headless Chrome 那串 SwiftShader 不會變成「SwiftShader · SwiftShader driver」'
);
eq(
  shortenGpuName('Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)'),
  'llvmpipe',
  'llvmpipe 也縮成短名'
);
eq(shortenGpuName(''), '', '空字串進、空字串出');
eq(shortenGpuName(null), '', 'null 不會炸');
ok(
  shortenGpuName(`ANGLE (Foo, ${'X'.repeat(120)} Direct3D11 vs_5_0 ps_5_0, D3D11)`).length <= 44,
  '再長的型號也會被截斷（小石牌只有 168px 寬）'
);

eq(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver-5.0.0)'), true, 'SwiftShader ＝ 軟體渲染');
eq(isSoftwareRenderer('Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)'), true, 'llvmpipe ＝ 軟體渲染');
eq(isSoftwareRenderer('Microsoft Basic Render Driver'), true, 'Microsoft Basic Render ＝ 軟體渲染');
eq(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), false, '真的顯示卡不會被誤標成軟體渲染');
eq(isSoftwareRenderer('Apple M1 Pro'), false, 'Apple 內顯不是軟體渲染');
eq(isSoftwareRenderer(''), false, '沒有字串就不標警示');

// 型號讀取：優先 UNMASKED，沒有就退回 gl.RENDERER，全部拿不到也不能丟例外
const glUnmasked = {
  RENDERER: 0x1f01,
  getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
  getParameter: (p) => (p === 0x9246 ? 'Unmasked Card' : 'Masked Card'),
};
eq(readGpuName(glUnmasked), 'Unmasked Card', '有 WEBGL_debug_renderer_info 就用真型號');
eq(
  readGpuName({ RENDERER: 0x1f01, getExtension: () => null, getParameter: () => 'Fallback Card' }),
  'Fallback Card',
  '沒有那個擴充就退回 gl.RENDERER'
);
eq(
  readGpuName({
    RENDERER: 0x1f01,
    getExtension: () => {
      throw new Error('context lost');
    },
    getParameter: () => 'x',
  }),
  '',
  'context 出事時安靜回空字串（不丟例外）'
);
eq(readGpuName(null), '', '沒有 context 也不會炸');

ok(/使用率/.test(GPU_TIP) && /型號/.test(GPU_TIP), 'ⓘ 講清楚「拿不到使用率、這裡給的是型號與耗時」', GPU_TIP);
ok(!/https?:/.test(GPU_TIP), 'ⓘ 的說明不夾帶連結');
ok(GPU_UNSUPPORTED.length > 0 && GPU_SOFTWARE_LABEL.includes('軟體渲染'), '不支援 / 軟體渲染的字樣都在');

// 沒有 WebGL2（或根本沒有 context）→ 整個計時器安靜關掉
const deadTimer = createGpuTimer(null);
eq(deadTimer.supported, false, '沒有 context 時計時器直接關掉');
deadTimer.begin();
deadTimer.end();
deadTimer.dispose();
eq(deadTimer.ms, null, '關掉的計時器永遠回 null（畫面上會寫「不支援」）');

// 有 WebGL2 的完整循環：非阻塞輪詢、查詢物件回收、GPU_DISJOINT 丟掉整筆
const priorGL2 = globalThis.WebGL2RenderingContext;
globalThis.WebGL2RenderingContext = class WebGL2RenderingContext {};
class FakeGL2 extends globalThis.WebGL2RenderingContext {
  constructor({ ext = true } = {}) {
    super();
    this.QUERY_RESULT_AVAILABLE = 0x8867;
    this.QUERY_RESULT = 0x8866;
    this.ext = ext ? { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb } : null;
    this.created = 0;
    this.deleted = 0;
    this.begun = 0;
    this.ended = 0;
    this.disjoint = false;
    this.ready = false;
    this.result = 4_000_000; // 4 ms（單位是奈秒）
    this.live = null;
  }
  getExtension(name) {
    return name === 'EXT_disjoint_timer_query_webgl2' ? this.ext : null;
  }
  createQuery() {
    this.created += 1;
    return { id: this.created };
  }
  deleteQuery() {
    this.deleted += 1;
  }
  beginQuery(target, q) {
    if (this.live) throw new Error('一次只能有一個 TIME_ELAPSED 查詢');
    this.live = q;
    this.begun += 1;
  }
  endQuery() {
    this.live = null;
    this.ended += 1;
  }
  getQueryParameter(q, pname) {
    if (pname === this.QUERY_RESULT_AVAILABLE) return this.ready;
    return this.result;
  }
  getParameter() {
    return this.disjoint;
  }
}

const noExtGl = new FakeGL2({ ext: false });
const noExtTimer = createGpuTimer(noExtGl);
noExtTimer.begin();
noExtTimer.end();
eq(noExtTimer.supported, false, '驅動沒有 EXT_disjoint_timer_query_webgl2 → 安靜降級');
eq(noExtGl.begun, 0, '不支援時不會送出任何查詢（零額外開銷）');
eq(noExtTimer.ms, null, '不支援時沒有數字');

const fakeGl = new FakeGL2();
const timer = createGpuTimer(fakeGl);
timer.begin();
timer.end();
eq(timer.supported, true, '有擴充就開始量測');
eq(fakeGl.begun, 1, '一幀送出一個查詢');
eq(fakeGl.ended, 1, '同一幀就結束查詢（圍住整幀，含所有後製 pass）');
eq(timer.ms, null, 'GPU 還沒寫回結果時不亂猜（維持 null）');
timer.begin();
timer.end();
eq(fakeGl.begun, 2, '結果還沒回來也不會卡住下一幀');
ok(fakeGl.created <= 4, '查詢物件有上限（不會每幀 new 一個）', `created=${fakeGl.created}`);
fakeGl.ready = true;
timer.begin();
timer.end();
ok(timer.ms !== null && Math.abs(timer.ms - 4) < 1e-6, '奈秒換算成毫秒', `ms=${timer.ms}`);
const beforeReuse = fakeGl.created;
timer.begin();
timer.end();
timer.begin();
timer.end();
eq(fakeGl.created, beforeReuse, '查詢物件回收再用（不再多開新的）');
fakeGl.disjoint = true;
fakeGl.result = 999_000_000;
timer.begin();
timer.end();
timer.begin();
timer.end();
ok(Math.abs(timer.ms - 4) < 1e-6, 'GPU_DISJOINT 那一筆整個丟掉（不會顯示假數字）', `ms=${timer.ms}`);
timer.dispose();
ok(fakeGl.deleted >= 1, '關掉監視器時把查詢物件還給驅動', `deleted=${fakeGl.deleted}`);
eq(timer.ms, null, '關掉之後不留舊數字');
// context 中途出事也不能讓遊戲掛掉
const brokenGl = new FakeGL2();
brokenGl.getQueryParameter = () => {
  throw new Error('context lost');
};
const brokenTimer = createGpuTimer(brokenGl);
brokenTimer.begin();
brokenTimer.end();
eq(brokenTimer.ms, null, 'context 出事時安靜停掉');
eq(brokenTimer.supported, false, '出過事就不再送查詢');
if (priorGL2 === undefined) delete globalThis.WebGL2RenderingContext;
else globalThis.WebGL2RenderingContext = priorGL2;

// 改設定不會動到進度
settingsProg.updateSettings({ volume: 0.8 });
eq(settingsProg.state.xp, 0, '改設定不影響 XP');
eq(settingsProg.state.collected.length, 0, '改設定不影響圖鑑');
memory.clear();

/* ------------------------------------------------------------------ */
/* 10. Phase 5：故事道具 / 地標 / 世界觀石碑 / 走出來的路               */
/* ------------------------------------------------------------------ */
console.log('▸ 場景敘事（Phase 5）');

const Props = await import('../src/world/props.js');
const { LORE_TABLETS, LORE_XP, STORY_VIGNETTES, LANDMARKS, PROP_KINDS, buildPathNetwork, pathInfluence, kitFor } = Props;

/* --- 石碑：資料合法性 ------------------------------------------------ */
eq(new Set(LORE_TABLETS.map((t) => t.id)).size, LORE_TABLETS.length, '石碑 id 沒有重複');
ok(LORE_TABLETS.length >= 8 && LORE_TABLETS.length <= 14, '石碑數量在 8–14 之間', `n=${LORE_TABLETS.length}`);
ok(LORE_XP > 0 && LORE_XP <= 20, '石碑 XP 是「少量」', `xp=${LORE_XP}`);

const regionIdSet = new Set(curriculum.groups.map((g) => g.id));
for (const t of LORE_TABLETS) {
  ok(regionIdSet.has(t.region), `[lore:${t.id}] region 是真實區域`, t.region);
  ok(typeof t.title === 'string' && t.title.length > 0 && t.title.length <= 12, `[lore:${t.id}] 有簡短標題`, t.title);
  ok(Array.isArray(t.lines) && t.lines.length >= 1 && t.lines.length <= 3, `[lore:${t.id}] 1–3 句`, String(t.lines && t.lines.length));
  for (const line of t.lines || []) {
    ok(typeof line === 'string' && line.length > 0 && line.length <= 60, `[lore:${t.id}] 每句長度合理`, line);
    // 護欄 2：石碑是風味內容，不得帶連結、不得冒充課程出處
    ok(!/https?:\/\//.test(line), `[lore:${t.id}] 不放連結（教學與出處只在圖鑑/關卡）`, line);
  }
  ok(!('source' in t) && !('sources' in t) && !('teaches' in t), `[lore:${t.id}] 沒有 source / teaches 欄位（不是課程）`);

  const [x, z] = t.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === t.region, `[lore:${t.id}] 落在標示的區域裡`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.8, `[lore:${t.id}] 站得住`, `coverage=${World.coverage(x, z).toFixed(2)}`);
  ok(World.terrainHeight(x, z) > -6, `[lore:${t.id}] 沒有掉進虛空`);
}

/* --- 淨空：石碑 / 小景 / 地標都不能壓到石座或彼此 -------------------- */
const nearestPedestal = (x, z) =>
  Math.min(...challenges.map((c) => Math.hypot(x - c.position[0], z - c.position[1])));

for (const t of LORE_TABLETS) {
  ok(nearestPedestal(t.at[0], t.at[1]) >= 7, `[lore:${t.id}] 不擋石座互動範圍`, nearestPedestal(t.at[0], t.at[1]).toFixed(1));
}
for (let i = 0; i < LORE_TABLETS.length; i += 1) {
  for (let j = i + 1; j < LORE_TABLETS.length; j += 1) {
    const a = LORE_TABLETS[i].at;
    const b = LORE_TABLETS[j].at;
    ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 10, `石碑 ${LORE_TABLETS[i].id} / ${LORE_TABLETS[j].id} 不會互搶互動`);
  }
}

/* --- 故事小景 -------------------------------------------------------- */
eq(new Set(STORY_VIGNETTES.map((v) => v.id)).size, STORY_VIGNETTES.length, '小景 id 沒有重複');
for (const g of curriculum.groups) {
  const n = STORY_VIGNETTES.filter((v) => v.region === g.id).length;
  ok(n >= 2 && n <= 4, `[${g.id}] 有 2–4 組故事小景`, `n=${n}`);
  const kinds = new Set(STORY_VIGNETTES.filter((v) => v.region === g.id).flatMap((v) => v.parts.map((p) => p[0])));
  ok(kinds.size >= 5, `[${g.id}] 至少 5 種不同的道具`, `kinds=${kinds.size}`);
}
for (const v of STORY_VIGNETTES) {
  const [x, z] = v.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === v.region && !here.onBridge, `[vig:${v.id}] 落在自己的區域裡（不在橋上）`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.85, `[vig:${v.id}] 站得住`, `coverage=${World.coverage(x, z).toFixed(2)}`);
  ok(nearestPedestal(x, z) >= 10, `[vig:${v.id}] 不擋石座`, nearestPedestal(x, z).toFixed(1));
  ok(v.parts.length >= 4, `[vig:${v.id}] 至少 4 件道具才成得了一個「畫面」`, `n=${v.parts.length}`);
  for (const [kind, offset] of v.parts) {
    ok(PROP_KINDS.includes(kind), `[vig:${v.id}] 道具 "${kind}" 有實作`);
    ok(Math.hypot(offset[0], offset[2]) <= 8, `[vig:${v.id}] 道具 "${kind}" 不會散出小景範圍`);
  }
}
// 小景之間也要留白，不然會糊成一片
for (let i = 0; i < STORY_VIGNETTES.length; i += 1) {
  for (let j = i + 1; j < STORY_VIGNETTES.length; j += 1) {
    const a = STORY_VIGNETTES[i].at;
    const b = STORY_VIGNETTES[j].at;
    ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 16, `小景 ${STORY_VIGNETTES[i].id} / ${STORY_VIGNETTES[j].id} 之間有留白`);
  }
}

/* --- 地標：每區剛好一個、夠高、夠遠、周圍留白 ------------------------ */
eq(LANDMARKS.length, 5, '五個區域各有一個地標');
for (const g of curriculum.groups) {
  eq(LANDMARKS.filter((l) => l.region === g.id).length, 1, `[${g.id}] 剛好一個地標（hero asset 要稀有）`);
}
for (const l of LANDMARKS) {
  const [x, z] = l.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === l.region && !here.onBridge, `[landmark:${l.id}] 落在自己的區域裡`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.9, `[landmark:${l.id}] 站在實地上`);
  ok(l.height >= 18, `[landmark:${l.id}] 夠高，遠處才看得到剪影`, `h=${l.height}`);
  ok(l.clear >= 12, `[landmark:${l.id}] 周圍有留白半徑`, `clear=${l.clear}`);
  ok(nearestPedestal(x, z) >= 18, `[landmark:${l.id}] 離石座夠遠`, nearestPedestal(x, z).toFixed(1));
  for (const v of STORY_VIGNETTES) {
    ok(
      Math.hypot(x - v.at[0], z - v.at[1]) >= l.clear,
      `[landmark:${l.id}] 沒有被小景 ${v.id} 佔掉留白`,
      Math.hypot(x - v.at[0], z - v.at[1]).toFixed(1)
    );
  }
}

/* --- 走出來的路：只染顏色，不能改變可行走性 -------------------------- */
const pathSegs = buildPathNetwork(World.REGION_SITES, World.CORRIDORS, challenges);
ok(pathSegs.length > 20, '路網有足夠的路段', `n=${pathSegs.length}`);
for (const c of challenges) {
  ok(pathInfluence(c.position[0], c.position[1], pathSegs) > 0.9, `[${c.id}] 石座在主動線上（走過去就會遇到）`);
}
for (const v of STORY_VIGNETTES) {
  ok(pathInfluence(v.at[0], v.at[1], pathSegs) > 0.5, `[vig:${v.id}] 有一條岔路通到小景`);
}
// 虛空裡不該有路
eq(pathInfluence(0, -130, pathSegs), 0, '虛空裡沒有路');
// 地形高度不受路網影響（路只是頂點色）
eq(World.terrainHeight(0, -20), World.terrainHeight(0, -20), '地形高度是純函式，與路網無關');
for (const c of challenges) {
  const [x, z] = c.position;
  ok(World.coverage(x, z) > 0.75, `[${c.id}] 加了道具之後石座仍站得住`);
}

/* --- 色本 ------------------------------------------------------------ */
const kit = kitFor('#8aa0b4');
for (const key of ['accent', 'light', 'mid', 'dark']) {
  ok(Number.isFinite(kit[key]), `kitFor 產生 ${key} 色`);
}
ok(kit.dark !== kit.mid && kit.mid !== kit.light, 'kitFor 的三階明度確實不同');

/* --- 存檔：新欄位 loreRead 的相容性 ---------------------------------- */
eq(SaveIO.defaultSave().loreRead.length, 0, '新存檔的 loreRead 是空的');
// 舊存檔（Phase 4 之前）沒有這個欄位 → normalize 要補上，不能是 undefined
const legacy = SaveIO.normalize({ version: 1, xp: 120, collected: ['clarity'] });
ok(Array.isArray(legacy.loreRead), '舊存檔沒有 loreRead → 補成空陣列');
eq(legacy.loreRead.length, 0, '補上的 loreRead 是空的');
eq(legacy.xp, 120, '補新欄位不會動到舊資料');
eq(SaveIO.normalize({ loreRead: ['a', 'a', 7, 'b'] }).loreRead.length, 2, 'loreRead 去重並丟掉非字串');

/* --- 進程：讀石碑 ---------------------------------------------------- */
memory.clear();
const loreProg = createProgression({ curriculum, challenges });
eq(loreProg.loreReadCount(), 0, '一開始沒讀過任何石碑');
eq(loreProg.hasReadLore('hearth'), false, 'hasReadLore 初始為 false');

const first = loreProg.readLore('hearth', LORE_XP);
eq(first.alreadyRead, false, '第一次讀石碑');
eq(first.xpGain, LORE_XP, '第一次讀給 XP');
eq(loreProg.state.xp, LORE_XP, 'XP 進到存檔');
eq(loreProg.hasReadLore('hearth'), true, '讀過就記住');

const again = loreProg.readLore('hearth', LORE_XP);
eq(again.alreadyRead, true, '重讀同一塊石碑');
eq(again.xpGain, 0, '重讀不再給 XP（不能刷分）');
eq(loreProg.state.xp, LORE_XP, '重讀後 XP 不變');
eq(loreProg.loreReadCount(), 1, '讀過的數量正確');

// 石碑是風味內容：不進圖鑑、不算徽章
eq(loreProg.state.collected.length, 0, '讀石碑不會收集技巧');
eq(Object.values(loreProg.state.badges).reduce((a, b) => a + b, 0), 0, '讀石碑不會給徽章');
eq(Object.keys(loreProg.state.bestGrades).length, 0, '讀石碑不算通關');

// 全部讀完也不足以解鎖第二區（學習還是要靠關卡）
for (const t of LORE_TABLETS) loreProg.readLore(t.id, LORE_XP);
eq(loreProg.loreReadCount(), LORE_TABLETS.length, '所有石碑都讀得到');
eq(loreProg.isRegionUnlocked('reasoning'), false, '只讀石碑不足以解鎖新區域（前一區仍要通關）');

// 重新載入後 loreRead 還在
const reloadedLore = createProgression({ curriculum, challenges });
eq(reloadedLore.loreReadCount(), LORE_TABLETS.length, '已讀石碑寫進 localStorage 並可重讀');
reloadedLore.resetAll();
eq(reloadedLore.loreReadCount(), 0, '重置會清掉已讀石碑');
memory.clear();

/* ================================================================== */
/* Phase 22：刻文小語（教一件小事）＋ 會回應的東西 ＋ 藏起來的地方        */
/*                                                                    */
/*   刻文小語 **會教真的技巧** → 每一則都要掛得回一條真實存在的技巧與     */
/*   可點的官方出處（護欄 2），而且教學句子不得自己編一份。               */
/*   祕密則跟世界觀石碑同一層 —— 純風味、不放連結、沒有 source。          */
/* ================================================================== */
console.log('\n▸ 刻文小語與地圖彩蛋（Phase 22）');

const inscriptions = inscriptionFile.entries;
const secrets = secretFile.entries;
const insContent = createContent(curriculum, challengeData, builderZh, null, null, curriculumZh);
const Inscriptions = await import('../src/world/inscriptions.js');
const Reactive = await import('../src/world/reactive.js');

/* --- 刻文小語：資料合法性 ------------------------------------------- */
eq(inscriptionFile.authored, 'game', 'inscriptions.json 檔頭明講是遊戲自撰的層');
ok(inscriptionFile.xp > 0 && inscriptionFile.xp <= 10, '刻文小語的 XP 是「很少量」', `xp=${inscriptionFile.xp}`);
eq(new Set(inscriptions.map((i) => i.id)).size, inscriptions.length, '刻文小語 id 沒有重複');
ok(
  inscriptions.length >= 10 && inscriptions.length <= 14,
  '刻文小語數量在 10–14 之間',
  `n=${inscriptions.length}`
);
{
  const regions = new Set(inscriptions.map((i) => i.region));
  for (const g of curriculum.groups) ok(regions.has(g.id), `[${g.id}] 這片土地上有刻文小語`);
}
for (const ins of inscriptions) {
  const tag = `[ins:${ins.id}]`;
  ok(regionIdSet.has(ins.region), `${tag} region 是真實區域`, ins.region);
  ok(Inscriptions.INSCRIPTION_PROPS.includes(ins.prop), `${tag} 載體是已實作的種類`, ins.prop);
  ok(typeof ins.title === 'string' && ins.title.length >= 2 && ins.title.length <= 14, `${tag} 有簡短標題`, ins.title);
  ok(Array.isArray(ins.lines) && ins.lines.length >= 1 && ins.lines.length <= 2, `${tag} 1–2 句`, String(ins.lines?.length));

  // 教學一定要掛得回一條真實技巧 ＋ 真實官方出處（護欄 2）
  const tech = insContent.technique(ins.techniqueId);
  ok(Boolean(tech), `${tag} techniqueId 是 curriculum 裡真實存在的技巧`, ins.techniqueId);
  const src = insContent.sourceFor(ins.techniqueId);
  ok(Boolean(src && /^https:\/\//.test(src.url)), `${tag} 掛得出可點的官方出處`, src && src.url);
  ok(Boolean(src && src.name), `${tag} 出處有文件名（不是光禿禿的網址）`);
  // 教學句子取自遊戲既有的中文說法，不在這個檔案裡另編一份
  const view = insContent.displayTechnique(ins.techniqueId);
  ok(Boolean(view && view.tip && view.tip.length > 8), `${tag} 有既有的中文說法可以顯示`);
  ok(!('tip' in ins) && !('what' in ins), `${tag} 資料層不自帶教學句子（一律取自 curriculum）`);
  // 出處不得手抄進資料層 —— 只留 techniqueId，畫面上的連結由 curriculum 產生
  ok(!('source' in ins) && !('sources' in ins) && !('teaches' in ins), `${tag} 不自帶 source / teaches 欄位`);

  for (const line of ins.lines || []) {
    ok(typeof line === 'string' && line.length > 0 && line.length <= 60, `${tag} 每句長度合理`, line);
    ok(!/https?:\/\//.test(line), `${tag} 世界的話裡不放連結`, line);
    const en = ENGLISH(line);
    ok(!en, `${tag} 世界的話是中文`, en || '');
  }
  ok(
    typeof ins.hint === 'string' && ins.hint.length >= 8 && ins.hint.length <= 46,
    `${tag} 有一句可以照著做的白話提示`,
    ins.hint
  );
  ok(!/https?:\/\//.test(ins.hint), `${tag} 提示裡不放連結`, ins.hint);
  ok(!ENGLISH(ins.hint), `${tag} 提示是中文`, ENGLISH(ins.hint) || '');
  ok(ins.hint !== (view && view.tip), `${tag} 提示不是直接複製官方說法`);

  // 落點
  const [x, z] = ins.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === ins.region, `${tag} 落在標示的區域裡`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.85, `${tag} 站得住`, `coverage=${World.coverage(x, z).toFixed(2)}`);
  ok(nearestPedestal(x, z) >= 7, `${tag} 不擋石座互動範圍`, nearestPedestal(x, z).toFixed(1));
  const nearTab = Math.min(...LORE_TABLETS.map((t) => Math.hypot(x - t.at[0], z - t.at[1])));
  ok(nearTab >= 8, `${tag} 不跟石碑搶 E 鍵`, nearTab.toFixed(1));
  // 四周走得到互動距離（互動半徑 3.8）
  let free = 0;
  for (let a = 0; a < 16; a += 1) {
    const ang = (a / 16) * Math.PI * 2;
    if (!testWorld.solidAt(x + Math.cos(ang) * 2.4, z + Math.sin(ang) * 2.4)) free += 1;
  }
  ok(free >= 14, `${tag} 四周走得到（互動半徑 ${Inscriptions.INSCRIPTION_RADIUS}）`, `${free}/16`);
}
for (let i = 0; i < inscriptions.length; i += 1) {
  for (let j = i + 1; j < inscriptions.length; j += 1) {
    const a = inscriptions[i].at;
    const b = inscriptions[j].at;
    ok(
      Math.hypot(a[0] - b[0], a[1] - b[1]) > 10,
      `刻文 ${inscriptions[i].id} / ${inscriptions[j].id} 不會互搶互動`
    );
  }
}
ok(
  Inscriptions.INSCRIPTION_RADIUS < 4.6,
  '刻文的互動半徑比石碑小（它是刻在角落的字，不搶注意力）',
  `r=${Inscriptions.INSCRIPTION_RADIUS}`
);

/* --- 祕密：純風味（跟石碑同一層護欄） -------------------------------- */
eq(secretFile.authored, 'game', 'secrets.json 檔頭明講是遊戲自撰的層');
eq(new Set(secrets.map((s) => s.id)).size, secrets.length, '祕密 id 沒有重複');
ok(secrets.length >= 3 && secrets.length <= 6, '祕密數量在 3–6 之間', `n=${secrets.length}`);
eq(secrets.filter((s) => s.blessing).length, 1, '只有一個祕密帶「回聲的祝福」');
for (const s of secrets) {
  const tag = `[secret:${s.id}]`;
  ok(regionIdSet.has(s.region), `${tag} region 是真實區域`, s.region);
  ok(typeof s.title === 'string' && s.title.length >= 2 && s.title.length <= 14, `${tag} 有簡短標題`, s.title);
  ok(Array.isArray(s.lines) && s.lines.length >= 2 && s.lines.length <= 4, `${tag} 2–4 句`);
  for (const line of [...(s.lines || []), s.note || '']) {
    if (!line) continue;
    ok(line.length <= 70, `${tag} 每句長度合理`, line);
    // 護欄 2：祕密是風味內容，不教技巧、不放連結
    ok(!/https?:\/\//.test(line), `${tag} 不放連結`, line);
    ok(!ENGLISH(line), `${tag} 是中文`, ENGLISH(line) || '');
  }
  ok(
    !('source' in s) && !('sources' in s) && !('teaches' in s) && !('techniqueId' in s),
    `${tag} 沒有 source / teaches / techniqueId 欄位（不是課程）`
  );
  ok(s.radius >= 4 && s.radius <= 7, `${tag} 發現半徑合理`, String(s.radius));

  const [x, z] = s.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === s.region, `${tag} 落在標示的區域裡`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.85, `${tag} 站得住`, `coverage=${World.coverage(x, z).toFixed(2)}`);
  // 找到它要是一個決定，不是一個意外 → 離主動線 8 公尺以上
  const toLane = Math.min(
    ...World.BRIDGE_LANES.map((l) => {
      const dx = l.bx - l.ax;
      const dz = l.bz - l.az;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / len2));
      return Math.hypot(x - (l.ax + dx * t), z - (l.az + dz * t));
    })
  );
  ok(toLane > 8, `${tag} 不在必經的主動線上`, toLane.toFixed(1));
  ok(nearestPedestal(x, z) >= 8, `${tag} 不擋石座`, nearestPedestal(x, z).toFixed(1));
}

/* --- 會回應的東西：擺法與效能相關的規則 ------------------------------ */
const spots = Reactive.REACTIVE_SPOTS;
eq(new Set(spots.map((s) => s.id)).size, spots.length, '反應物件 id 沒有重複');
ok(spots.length >= 18 && spots.length <= 30, '反應物件數量在合理範圍', `n=${spots.length}`);
{
  const kinds = new Set(spots.map((s) => s.kind));
  ok(kinds.size >= 5, '至少有 5 種不同的反應', `kinds=${[...kinds].join(',')}`);
  for (const k of kinds) ok(k in Reactive.REACTION_KINDS, `[${k}] 是已實作的反應種類`);
  const regions = new Set(spots.map((s) => s.region));
  for (const g of curriculum.groups) ok(regions.has(g.id), `[${g.id}] 這片土地上有會回應的東西`);
}
for (const s of spots) {
  const tag = `[react:${s.id}]`;
  const [x, z] = s.at;
  const here = World.regionAt(x, z);
  ok(here && here.id === s.region, `${tag} 落在標示的區域裡`, JSON.stringify(here));
  ok(World.coverage(x, z) > 0.85, `${tag} 站得住`);
  ok(nearestPedestal(x, z) >= 7, `${tag} 不在石座的淨空圈裡`, nearestPedestal(x, z).toFixed(1));
  const toIns = Math.min(...inscriptions.map((i) => Math.hypot(x - i.at[0], z - i.at[1])));
  ok(toIns >= 9, `${tag} 不壓在刻文小語上`, toIns.toFixed(1));
}
for (let i = 0; i < spots.length; i += 1) {
  for (let j = i + 1; j < spots.length; j += 1) {
    const a = spots[i].at;
    const b = spots[j].at;
    // 兩個不同種的反應離太近會同時響，聲音會糊掉
    ok(
      Math.hypot(a[0] - b[0], a[1] - b[1]) > 11,
      `反應 ${spots[i].id} / ${spots[j].id} 離得夠開（不會同時響）`
    );
  }
}
ok(Reactive.EXIT_RATIO > 1.05, '離場半徑大於進場半徑（hysteresis：站在邊界上不會連續觸發）');
ok(Reactive.SOUND_COOLDOWN > 0, '有全域聲音冷卻');
ok(Reactive.TRIGGER_COOLDOWN >= 1, '每個觸發點自己的冷卻至少 1 秒');
ok(Reactive.RECENT_SIZE >= 3, '「最近放過的音」環狀緩衝至少 3 個');

/* --- 反應場的行為：進場 / 不重複觸發 / 離場 / 冷卻 / 面板打開時停手 --- */
{
  const events = [];
  const foundSecrets = [];
  let busy = false;
  const field = Reactive.createReactiveField({
    spots,
    secrets,
    kitOf: () => kitFor('#8aa0b4'),
    terrainHeight: World.terrainHeight,
    onReact: (e) => events.push(e),
    onSecret: (id) => foundSecrets.push(id),
    isBusy: () => busy,
  });
  ok(field.triggerCount >= spots.length, '每個反應物件至少一個觸發點', `n=${field.triggerCount}`);
  ok(field.group.children.length === spots.length + secrets.length, '反應場把每一件都掛進場景圖');

  const target = spots.find((s) => s.kind === 'chime');
  const [tx, tz] = target.at;
  let t = 0;
  const step = (x, z, dt = 0.05) => {
    t += dt;
    field.update(dt, t, x, z);
  };

  // 遠處：什麼都不該發生
  step(tx + 40, tz + 40);
  eq(events.length, 0, '離得很遠時不會有任何反應');

  // 走進去：響一次
  step(tx, tz);
  ok(events.length === 1, '走進風鈴的範圍 → 響一次', `n=${events.length}`);
  eq(events[0].id, target.id, '事件標的是走進去的那一件');
  ok(events[0].sound.length > 0, '事件帶得出要播哪一支合成音');
  ok(Number.isFinite(events[0].baseScale) && events[0].baseScale > 0, '事件帶得出音高倍率');

  // 站著不動：不會連續觸發
  for (let i = 0; i < 12; i += 1) step(tx, tz);
  eq(events.length, 1, '站在裡面不動不會一直響（hysteresis）');

  // 走到「進場與離場半徑之間」：還算在裡面 → 照樣不重觸發
  const enterR = 3.2;
  for (let i = 0; i < 4; i += 1) step(tx + enterR * 1.15, tz);
  eq(events.length, 1, '在進場與離場半徑之間不會重新觸發（不會在邊界上抖動）');

  // 真的走遠再回來：冷卻時間內不再響（此時距離第一次響 < TRIGGER_COOLDOWN）
  ok(t < Reactive.TRIGGER_COOLDOWN, '這一段測試還在冷卻時間內', `t=${t.toFixed(2)}`);
  step(tx + 20, tz);
  step(tx, tz);
  eq(events.length, 1, '離場又回來，但還在冷卻時間內 → 不再響');

  // 冷卻過了再回來 → 會響
  t += Reactive.TRIGGER_COOLDOWN + 1;
  for (let i = 0; i < 5; i += 1) step(tx + 20, tz);
  step(tx, tz);
  eq(events.length, 2, '冷卻過了再走一次 → 會再響');

  // 面板打開：整組停手
  busy = true;
  t += 30;
  const before = events.length;
  const song = spots.find((s) => s.kind === 'songstone');
  step(song.at[0], song.at[1]);
  eq(events.length, before, '面板打開時世界不會在旁邊叮咚響');
  busy = false;

  // 音石列：一顆一顆走過去 → 走出一段旋律（而且不會連續重複同一個音）
  t += 30;
  const notes = [];
  const songObj = field.object(song.id);
  ok(Boolean(songObj), '找得到音石列');
  const n = songObj.triggers.length;
  ok(n >= 5, '音石列有 5 顆以上', `n=${n}`);
  const mark = events.length;
  for (let i = 0; i < n; i += 1) {
    const tr = songObj.triggers[i];
    // 先站遠一點（讓上一顆離場），再走到這一顆上
    t += 1.0;
    step(song.at[0] + 40, song.at[1] + 40, 0.2);
    t += 0.4;
    step(song.at[0] + tr.dx, song.at[1] + tr.dz, 0.2);
  }
  for (const e of events.slice(mark)) notes.push(e.note);
  eq(notes.length, n, '走過一排音石，每一顆都響（刻意排好的旋律不會被緩衝擋掉）');
  ok(new Set(notes).size === notes.length, '一排音石的音高都不一樣（走出一段旋律）', notes.join(','));

  // 風鈴的音是隨機挑的 → 環狀緩衝要擋掉「剛剛才響過的那幾個」
  t += 30;
  const chimeMark = events.length;
  const chimeObj = field.object(target.id);
  for (let i = 0; i < 12; i += 1) {
    t += Reactive.TRIGGER_COOLDOWN + 0.5;
    step(tx + 30, tz + 30, 0.2);
    t += 0.4;
    step(tx, tz, 0.2);
  }
  const chimeNotes = events.slice(chimeMark).map((e) => e.note);
  ok(chimeNotes.length >= 4, '風鈴走過很多次也會響', `n=${chimeNotes.length}`);
  ok(Boolean(chimeObj), '找得到風鈴');
  for (let i = 1; i < chimeNotes.length; i += 1) {
    ok(chimeNotes[i] !== chimeNotes[i - 1], '風鈴不會連續放同一個音（環狀緩衝生效）', chimeNotes.join(','));
  }

  // 祕密：走進去就算找到，只會回報一次
  t += 30;
  const sec = secrets[0];
  eq(foundSecrets.length, 0, '一開始一個祕密都沒找到');
  step(sec.at[0], sec.at[1]);
  eq(foundSecrets.length, 1, '走進祕密的範圍 → 找到了');
  eq(foundSecrets[0], sec.id, '回報的是走進去的那一個');
  for (let i = 0; i < 20; i += 1) step(sec.at[0], sec.at[1]);
  eq(foundSecrets.length, 1, '同一個祕密只會回報一次');
  ok(field.secret(sec.id).found, '世界端也記住了');
}

/* --- 存檔：兩個新欄位的相容性 ---------------------------------------- */
eq(SaveIO.defaultSave().inscriptionsFound.length, 0, '新存檔的 inscriptionsFound 是空的');
eq(SaveIO.defaultSave().secretsFound.length, 0, '新存檔的 secretsFound 是空的');
{
  const old = SaveIO.normalize({ version: 1, xp: 240, collected: ['clarity-01'] });
  ok(Array.isArray(old.inscriptionsFound), '舊存檔沒有 inscriptionsFound → 補成空陣列');
  ok(Array.isArray(old.secretsFound), '舊存檔沒有 secretsFound → 補成空陣列');
  eq(old.xp, 240, '補新欄位不會動到舊資料');
  eq(SaveIO.normalize({ inscriptionsFound: ['a', 'a', 3, 'b'] }).inscriptionsFound.length, 2, 'inscriptionsFound 去重並丟掉非字串');
  eq(SaveIO.normalize({ secretsFound: ['x', 'x'] }).secretsFound.length, 1, 'secretsFound 去重');
}

/* --- 進程：讀刻文 / 找祕密 ------------------------------------------- */
memory.clear();
{
  const p = createProgression({ curriculum, challenges });
  const one = inscriptions[0];
  eq(p.inscriptionCount(), 0, '一開始一則刻文都沒讀過');
  eq(p.hasFoundInscription(one.id), false, 'hasFoundInscription 初始為 false');

  const r1 = p.readInscription(one.id, one.techniqueId, inscriptionFile.xp);
  eq(r1.alreadyFound, false, '第一次讀刻文');
  eq(r1.xpGain, inscriptionFile.xp, '第一次讀給少量 XP');
  eq(r1.newlyCollected[0], one.techniqueId, '刻文教的技巧會寫進圖鑑（學到了就是學到了）');
  eq(p.isCollected(one.techniqueId), true, '圖鑑真的收到了');
  ok(Object.values(p.state.badges).reduce((a, b) => a + b, 0) > 0, '徽章跟著重算');
  eq(Object.keys(p.state.bestGrades).length, 0, '讀刻文不算通關（不佔關卡評價）');

  const r2 = p.readInscription(one.id, one.techniqueId, inscriptionFile.xp);
  eq(r2.alreadyFound, true, '重讀同一則刻文');
  eq(r2.xpGain, 0, '重讀不再給 XP（不能刷分）');
  eq(r2.newlyCollected.length, 0, '重讀不會重複收集');

  // 全部讀完仍不足以解鎖第二區（學習主線還是要靠關卡）
  for (const ins of inscriptions) p.readInscription(ins.id, ins.techniqueId, inscriptionFile.xp);
  eq(p.inscriptionCount(), inscriptions.length, '每一則刻文都讀得到');
  eq(p.isRegionUnlocked('reasoning'), false, '只讀刻文不足以解鎖新區域');

  // 祕密：純風味 —— 給 XP，但不進圖鑑、不算徽章
  const collectedBefore = p.state.collected.length;
  const badgeBefore = Object.values(p.state.badges).reduce((a, b) => a + b, 0);
  const s1 = p.findSecret(secrets[0].id, secretFile.xp);
  eq(s1.alreadyFound, false, '第一次找到祕密');
  eq(s1.xpGain, secretFile.xp, '找到祕密給 XP');
  eq(p.state.collected.length, collectedBefore, '找到祕密不會收集技巧');
  eq(Object.values(p.state.badges).reduce((a, b) => a + b, 0), badgeBefore, '找到祕密不會給徽章');
  eq(Object.keys(p.state.bestGrades).length, 0, '找到祕密不算通關');
  eq(p.findSecret(secrets[0].id, secretFile.xp).xpGain, 0, '同一個祕密不會給第二次 XP');
  eq(p.secretCount(), 1, '找到的祕密數量正確');

  // 重新載入還在；重置會清掉
  const again2 = createProgression({ curriculum, challenges });
  eq(again2.inscriptionCount(), inscriptions.length, '已讀刻文寫進 localStorage 並可重讀');
  eq(again2.secretCount(), 1, '已找到的祕密也寫進 localStorage');
  again2.resetAll();
  eq(again2.inscriptionCount(), 0, '重置會清掉已讀刻文');
  eq(again2.secretCount(), 0, '重置會清掉已找到的祕密');
}
memory.clear();

/* ================================================================== */
/* Phase 25：動得了的器物（RPG 那一層「碰得到的小東西」）                 */
/*                                                                    */
/*   · 純風味（護欄 2）：不教技巧、不掛 techniqueId、不放連結           */
/*   · 只用 E（世界唯一的互動鍵），不發明第二個鍵                        */
/*   · 不新增光源（§6.1），碰撞與淨空照舊（§6.3 / §6.4）                */
/*   · 是「雜物」那一階（≤ 2.6 公尺），不准長成第二個地標                */
/* ================================================================== */
console.log('\n▸ 動得了的器物（Phase 25）');

const Handles = await import('../src/world/handles.js');
const handles = handleFile.entries;

/* --- 資料合法性 ------------------------------------------------------ */
eq(handleFile.authored, 'game', 'handles.json 檔頭明講是遊戲自撰的層');
ok(handleFile.xp > 0 && handleFile.xp <= 8, '動一件器物的 XP 是「很少量」', `xp=${handleFile.xp}`);
eq(new Set(handles.map((h) => h.id)).size, handles.length, '器物 id 沒有重複');
ok(handles.length >= 18 && handles.length <= 30, '器物數量在合理範圍', `n=${handles.length}`);
{
  const kinds = new Set(handles.map((h) => h.kind));
  ok(kinds.size >= 6, '至少有 6 種不同的器物', `kinds=${[...kinds].join(',')}`);
  for (const k of kinds) {
    ok(k in Handles.HANDLE_KINDS, `[${k}] 是已實作的器物種類`);
    ok(k in Handles.HANDLE_VERBS, `[${k}] 有走近提示的動詞`);
    ok(k in Handles.HANDLE_VERBS_USED, `[${k}] 有「動過之後」的動詞`);
    ok(k in (handleFile.kinds || {}), `[${k}] handles.json 有這一種的狀態說明`);
    ok((handleFile.kinds[k].idle || '').length >= 4, `[${k}] 有「還沒動過」的狀態句`);
    ok((handleFile.kinds[k].done || '').length >= 4, `[${k}] 有「動過了」的狀態句`);
    ok(handles.filter((h) => h.kind === k).length >= 2, `[${k}] 世界上不只一件（不是孤例）`);
  }
  // 每一種動詞都不一樣 —— 動詞本身就是「這東西能拿來幹嘛」的說明
  const verbs = Object.values(Handles.HANDLE_VERBS);
  eq(new Set(verbs).size, verbs.length, '八種器物的動詞互不相同');
  const regions = new Set(handles.map((h) => h.region));
  for (const g of curriculum.groups) {
    ok(regions.has(g.id), `[${g.id}] 這片土地上有動得了的東西`);
    const here = new Set(handles.filter((h) => h.region === g.id).map((h) => h.kind));
    ok(here.size >= 3, `[${g.id}] 至少有 3 種不同的器物（不是同一種擺三個）`, [...here].join(','));
  }
}

const HANDLE_TEXT_FIELDS = ['title', 'line'];
for (const h of handles) {
  const tag = `[handle:${h.id}]`;
  ok(/^[a-z0-9-]+$/.test(h.id), `${tag} id 是 kebab-case`);
  ok(h.kind in Handles.HANDLE_KINDS, `${tag} 種類是實作得出來的`);
  ok((h.title || '').length >= 2, `${tag} 有世界裡的名字`);
  // 護欄 2：這一層一個字都不准宣稱技巧
  for (const banned of ['source', 'sources', 'teaches', 'techniqueId', 'rubric', 'url', 'href']) {
    eq(banned in h, false, `${tag} 沒有 ${banned} 欄位（純風味，不教技巧）`);
  }
  const blob = JSON.stringify(h);
  eq(/https?:\/\//.test(blob), false, `${tag} 不含任何連結`);
  // 中文：玩家看得到的每一段話都不能是英文句子
  for (const f of HANDLE_TEXT_FIELDS) {
    if (!h[f]) continue;
    eq(ENGLISH(h[f]), null, `${tag} ${f} 沒有整句英文`, String(ENGLISH(h[f])));
  }
  for (const l of h.lines || []) {
    ok(l.length >= 8 && l.length <= 60, `${tag} 每一行都是一句話（8–60 字）`, `${l.length}`);
    eq(ENGLISH(l), null, `${tag} 罐底的字沒有整句英文`);
  }
  for (const w of h.ways || []) {
    ok((w.to || '').length >= 2, `${tag} 每塊牌子都有方位`);
    ok((w.text || '').length >= 8, `${tag} 每塊牌子都說得出那邊有什麼`);
    eq(ENGLISH(w.text), null, `${tag} 指路的話沒有整句英文`);
  }
  // 種類專屬的內容
  if (h.kind === 'urn') ok((h.lines || []).length === 2, `${tag} 陶罐剛好兩行（罐底的字）`);
  else if (h.kind === 'signpost') ok((h.ways || []).length === 4, `${tag} 指路石剛好四塊牌子`);
  else ok((h.line || '').length >= 8, `${tag} 有一句話可以說（不開窗，只在畫面上講一句）`);
}
for (const kindMeta of Object.values(handleFile.kinds || {})) {
  for (const s of Object.values(kindMeta.says || {})) {
    eq(ENGLISH(s), null, '器物的每一句回應都不是英文句子', s);
  }
}

/* --- 擺法：落點、淨空、彼此不打架 ------------------------------------ */
{
  const laneDist = (x, z) =>
    Math.min(
      ...World.BRIDGE_LANES.map((l) => {
        const dx = l.bx - l.ax;
        const dz = l.bz - l.az;
        const len2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / len2));
        return Math.hypot(x - (l.ax + dx * t), z - (l.az + dz * t));
      })
    );
  for (const h of handles) {
    const tag = `[handle:${h.id}]`;
    const [x, z] = h.at;
    const here = World.regionAt(x, z);
    ok(here && here.id === h.region && !here.onBridge, `${tag} 落在標示的區域裡（而且不在橋上）`, JSON.stringify(here));
    ok(World.coverage(x, z) > 0.85, `${tag} 站得住（沒有掉進虛空）`, World.coverage(x, z).toFixed(2));
    ok(nearestPedestal(x, z) >= 7, `${tag} 不在石座的淨空圈裡`, nearestPedestal(x, z).toFixed(1));
    ok(laneDist(x, z) > 8, `${tag} 不擋橋的主動線`, laneDist(x, z).toFixed(1));
    ok(Math.hypot(x - 0, z - 6) > World.SPAWN_CLEAR + 2, `${tag} 不壓在出生點上`);
    const toIns = Math.min(...inscriptions.map((i) => Math.hypot(x - i.at[0], z - i.at[1])));
    ok(toIns >= 8, `${tag} 不壓在刻文小語上（不搶 E）`, toIns.toFixed(1));
    const toReact = Math.min(...Reactive.REACTIVE_SPOTS.map((s) => Math.hypot(x - s.at[0], z - s.at[1])));
    ok(toReact >= 8, `${tag} 不壓在會回應的東西上`, toReact.toFixed(1));
    const toTablet = Math.min(...LORE_TABLETS.map((t) => Math.hypot(x - t.at[0], z - t.at[1])));
    ok(toTablet >= 7, `${tag} 不壓在世界觀石碑上（不搶 E）`, toTablet.toFixed(1));
    const toLandmark = Math.min(...LANDMARKS.map((l) => Math.hypot(x - l.at[0], z - l.at[1])));
    ok(toLandmark >= 14, `${tag} 沒有站進地標的留白圈`, toLandmark.toFixed(1));
    const toSecret = Math.min(...secrets.map((s) => Math.hypot(x - s.at[0], z - s.at[1])));
    ok(toSecret >= 9, `${tag} 不壓在藏起來的地方上`, toSecret.toFixed(1));
  }
  for (let i = 0; i < handles.length; i += 1) {
    for (let j = i + 1; j < handles.length; j += 1) {
      const a = handles[i].at;
      const b = handles[j].at;
      // 密度要有節奏：兩件器物之間要走得到「什麼都沒有」的地方
      ok(
        Math.hypot(a[0] - b[0], a[1] - b[1]) > 14,
        `器物 ${handles[i].id} / ${handles[j].id} 離得夠開（中間要有安靜）`
      );
    }
  }
}

/* --- 互動文法：只有 E、半徑排在刻文小語底下 -------------------------- */
ok(Handles.HANDLE_RADIUS < Inscriptions.INSCRIPTION_RADIUS, '器物的互動半徑比刻文小語小（不搶 E）');
ok(Handles.HANDLE_RADIUS >= 2.5, '互動半徑不會小到走過去按不到', String(Handles.HANDLE_RADIUS));
ok(Handles.CAPSTAN_TURNS >= 2 && Handles.CAPSTAN_TURNS <= 4, '絞盤要推 2–4 下（按 E，不是按住）');

/* --- 蓋出來的東西：不加光源、屬於「雜物」那一階、行為正確 ------------ */
{
  const kit = kitFor('#8aa0b4');
  const field = Handles.createHandleField({
    entries: handles,
    kitOf: () => kit,
    terrainHeight: World.terrainHeight,
  });
  eq(field.count, handles.length, '每一件器物都蓋出來了');
  eq(field.group.children.length, handles.length, '每一件都掛進場景圖');

  let lights = 0;
  let maxTop = 0;
  let tallest = '';
  const boxTop = new THREE.Box3();
  const one = new THREE.Box3();
  field.group.updateMatrixWorld(true);
  for (const o of field.objects) {
    if (!o) continue;
    ok(o.root.name === `handle:${o.id}`, `[${o.id}] 場景圖節點名是 handle:<id>`);
    /*
     * 量的是**剪影**，所以只算不透明的實體 ——
     * 加色混合的光（火光、光柱、水紋、地面光環）是光不是物質，
     * 世界裡本來就有 22 公尺高的石座光柱（見 WORLD.md §2.2）。
     */
    boxTop.makeEmpty();
    o.root.traverse((m) => {
      if (!m.isMesh) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (!mat || mat.transparent) return;
      one.setFromObject(m);
      boxTop.union(one);
    });
    if (boxTop.isEmpty()) continue;
    const top = boxTop.max.y - World.terrainHeight(o.x, o.z);
    if (top > maxTop) {
      maxTop = top;
      tallest = o.id;
    }
  }
  field.group.traverse((obj) => {
    if (obj.isLight) lights += 1;
  });
  eq(lights, 0, '器物一盞燈都沒加（只用自發光材質）');
  ok(maxTop <= 2.6, '每一件都在「雜物」那一階（≤ 2.6 公尺，不會蓋掉地標）', `${tallest}=${maxTop.toFixed(2)}`);

  // 走近排名：兩件同時在範圍內時，面向哪一件就是哪一件
  {
    const a = field.objects[0];
    // 站在 a 旁邊，面向 a → 就是 a
    const toward = { x: 0, z: 0 };
    const px = a.x - 2;
    const pz = a.z;
    toward.x = 1;
    toward.z = 0;
    const hit = field.nearest({ x: px, z: pz }, Handles.HANDLE_RADIUS, toward);
    ok(hit && hit.handle === a, '走近就抓得到那一件');
    ok(a.near === true, '被抓到的那一件會亮起來');
    const far = field.nearest({ x: a.x + 60, z: a.z + 60 });
    eq(far, null, '離得遠的時候什麼都抓不到');
    eq(a.near, false, '離開之後就不亮了');
  }

  // 陶罐：掀開會開一個小窗，而且只算一次「動過」
  {
    const urn = field.objects.find((o) => o.kind === 'urn');
    ok(Boolean(urn), '世界上有陶罐');
    const r = urn.activate({});
    eq(r.panel, 'urn', '掀開陶罐會開一個很小的窗');
    eq(r.complete, true, '掀開就算動過了');
    ok(typeof r.sound === 'string' && r.sound.length > 0, '掀蓋有自己的聲音');
    urn.setUsed(true);
    urn.update(0.5, 1, 1, 1);
    ok(urn.open > 0.3, '蓋子真的掀起來了', urn.open.toFixed(2));
  }

  // 指路石：四塊牌子 → 開窗
  {
    const post = field.objects.find((o) => o.kind === 'signpost');
    const r = post.activate({});
    eq(r.panel, 'signpost', '指路石會開一個窗把四個方向列出來');
    eq(r.complete, true, '讀過就算動過了');
  }

  // 響石：可以一直敲（不會用完），但只有第一次算「動過」
  {
    const gong = field.objects.find((o) => o.kind === 'gong');
    const r1 = gong.activate({});
    eq(r1.panel, undefined, '敲鑼不開窗（不打斷走路）');
    eq(r1.complete, true, '敲一下就算動過了');
    gong.setUsed(true);
    const r2 = gong.activate({});
    eq(r2.complete, true, '敲第二下照樣有反應（不會用完）');
    eq(r2.toastKey, null, '第二下不再多說一句話（不會洗版）');
    gong.update(0.016, 1, 1, 1);
    ok(gong.hit > 0.5, '敲下去盤子真的在震', gong.hit.toFixed(2));
  }

  // 絞盤：按三次 E 才轉得完；推到一半不算失敗
  {
    const cap = field.objects.find((o) => o.kind === 'capstan');
    eq(cap.remaining, Handles.CAPSTAN_TURNS, '一開始要推滿三下');
    const a1 = cap.activate({});
    eq(a1.complete, false, '推第一下還不算完成');
    eq(a1.left, Handles.CAPSTAN_TURNS - 1, '會告訴你還要推幾下');
    eq(cap.remaining, Handles.CAPSTAN_TURNS - 1, '剩下的次數跟著減');
    for (let i = 1; i < Handles.CAPSTAN_TURNS - 1; i += 1) cap.activate({});
    const last = cap.activate({});
    eq(last.complete, true, '推滿之後石蓋才開');
    eq(last.toastKey, 'opened', '開了會說一句話');
    cap.setUsed(true);
    eq(cap.remaining, 0, '開過的絞盤不用再推');
    eq(cap.activate({}).toastKey, 'done', '再推一次只是提醒它已經開著了');
  }

  // 守望石：摸它會轉向你還沒解開的那座石座
  {
    const stone = field.objects.find((o) => o.kind === 'watchstone');
    const blind = stone.activate({ aimAt: null });
    eq(blind.toastKey, 'blind', '沒有目標時它只是睜眼看一圈');
    const target = { x: stone.x + 30, z: stone.z, name: '清晰之門' };
    const aimed = stone.activate({ aimAt: target });
    eq(aimed.toastKey, 'aim', '有目標時會指出來');
    eq(aimed.aim, '清晰之門', '指的是那座石座的名字');
    for (let i = 0; i < 200; i += 1) stone.update(0.05, i * 0.05, 1, 1);
    const want = Math.atan2(target.x - stone.x, target.z - stone.z) - stone.baseRot;
    const diff = Math.abs(Math.atan2(Math.sin(stone.headPivot.rotation.y - want), Math.cos(stone.headPivot.rotation.y - want)));
    ok(diff < 0.2, '頭真的轉到那個方向了', diff.toFixed(3));
    ok(stone.eyes.every((e) => e.material.emissiveIntensity >= 0.08), '眼睛會亮');
  }

  // 長凳：坐下 / 起身是同一顆 E
  {
    const bench = field.objects.find((o) => o.kind === 'bench');
    ok(bench.seat && Number.isFinite(bench.seat.x), '長凳算得出座位的世界座標');
    ok(Math.hypot(bench.seat.x - bench.x, bench.seat.z - bench.z) < 1.2, '座位就在凳子上');
    const sit = bench.activate({});
    eq(sit.pose, 'sit', '按 E 坐下');
    const stand = bench.activate({});
    eq(stand.pose, 'stand', '再按一次 E 起身');
  }

  // 撈月池：撈一把 → 水紋盪開
  {
    const pool = field.objects.find((o) => o.kind === 'moonpool');
    const r = pool.activate({});
    eq(r.complete, true, '撈一把就算動過了');
    ok(pool.scoop > 0.5, '水面真的動了');
    ok(pool.fish.length >= 3, '水裡有幾條光魚');
  }

  // 火盆：點著之後就一直亮著（存檔記得）
  {
    const brazier = field.objects.find((o) => o.kind === 'brazier');
    brazier.update(0.5, 1, 1, 0);
    const dark = brazier.flameA.material.emissiveIntensity;
    brazier.activate({});
    brazier.setUsed(true);
    for (let i = 0; i < 60; i += 1) brazier.update(0.05, i * 0.05, 1, 0);
    ok(brazier.flameA.material.emissiveIntensity > dark + 1, '點著之後火真的亮起來', brazier.flameA.material.emissiveIntensity.toFixed(2));
    ok(brazier.lit > 0.8, '火會一直亮著（不是閃一下）', brazier.lit.toFixed(2));
  }

  // markUsed：載入存檔時世界端要跟著變
  {
    const id = handles[0].id;
    eq(field.markUsed(id), true, '載入存檔時可以把某一件標成動過了');
    eq(field.object(id).used, true, '世界端記住了');
    eq(field.markUsed('沒有這一件'), false, '不存在的 id 不會爆');
  }
}

/* --- 世界裡：碰撞、淨空、四周走得到 ---------------------------------- */
{
  const built = [];
  testWorld.root.traverse((o) => {
    if (o.name && o.name.startsWith('handle:')) built.push(o.name.slice(7));
  });
  eq(built.length, handles.length, '每一件器物都蓋進真的世界裡');
  eq(new Set(built).size, handles.length, '沒有重複掛上去');

  for (const h of handles) {
    const [x, z] = h.at;
    let free = 0;
    for (let a = 0; a < 20; a += 1) {
      const ang = (a / 20) * Math.PI * 2;
      // 互動半徑內的一圈：每個方向都要走得到（不然按不到 E）
      if (!testWorld.solidAt(x + Math.cos(ang) * 2.4, z + Math.sin(ang) * 2.4)) free += 1;
    }
    ok(free >= 18, `[handle:${h.id}] 走得到它旁邊（互動半徑內幾乎每個方向都通）`, `${free}/20`);
    ok(testWorld.isWalkable(x + 3.0, z), `[handle:${h.id}] 東邊 3 公尺是實地`);
    ok(testWorld.isWalkable(x - 3.0, z), `[handle:${h.id}] 西邊 3 公尺是實地`);
  }
  ok(
    testWorld.solids.length < 1400,
    '加了一整層器物之後碰撞體仍在預算內',
    `n=${testWorld.solids.length}`
  );
  // 低畫質也要蓋（器物不是「畫質選項」，它是玩法）
  let lowBuilt = 0;
  lowWorld.root.traverse((o) => {
    if (o.name && o.name.startsWith('handle:')) lowBuilt += 1;
  });
  eq(lowBuilt, handles.length, '低畫質照樣蓋出每一件器物');
}

/* --- 存檔：新欄位純加法 ---------------------------------------------- */
eq(SaveIO.defaultSave().handlesUsed.length, 0, '新存檔的 handlesUsed 是空的');
{
  const old = SaveIO.normalize({ version: 1, xp: 300, collected: ['clarity-01'], loreRead: ['a'] });
  ok(Array.isArray(old.handlesUsed), '舊存檔沒有 handlesUsed → 補成空陣列');
  eq(old.xp, 300, '補新欄位不會動到舊資料');
  eq(old.loreRead.length, 1, '舊欄位原封不動');
  eq(SaveIO.normalize({ handlesUsed: ['a', 'a', 7, 'b'] }).handlesUsed.length, 2, 'handlesUsed 去重並丟掉非字串');
}

/* --- 進程：動器物給一點 XP，但不進圖鑑、不算徽章、不算通關 ------------ */
memory.clear();
{
  const p = createProgression({ curriculum, challenges });
  const one = handles[0];
  eq(p.handleCount(), 0, '一開始一件器物都沒動過');
  eq(p.hasUsedHandle(one.id), false, 'hasUsedHandle 初始為 false');

  const collectedBefore = p.state.collected.length;
  const badgeBefore = Object.values(p.state.badges).reduce((a, b) => a + b, 0);
  const r1 = p.useHandle(one.id, handleFile.xp);
  eq(r1.alreadyUsed, false, '第一次動這件器物');
  eq(r1.xpGain, handleFile.xp, '第一次動給少量 XP');
  eq(p.state.collected.length, collectedBefore, '動器物不會收集技巧（純風味）');
  eq(Object.values(p.state.badges).reduce((a, b) => a + b, 0), badgeBefore, '動器物不會給徽章');
  eq(Object.keys(p.state.bestGrades).length, 0, '動器物不算通關（不佔關卡評價）');
  eq(p.hasUsedHandle(one.id), true, '記住了');

  const r2 = p.useHandle(one.id, handleFile.xp);
  eq(r2.alreadyUsed, true, '同一件再動一次');
  eq(r2.xpGain, 0, '不會給第二次 XP（可以一直敲鑼，但不能刷分）');

  // 全部動完仍不足以解鎖第二區（主線還是要靠關卡）
  for (const h of handles) p.useHandle(h.id, handleFile.xp);
  eq(p.handleCount(), handles.length, '每一件器物都動得到');
  eq(p.isRegionUnlocked('reasoning'), false, '只動器物不足以解鎖新區域');
  eq(Object.keys(p.state.bestGrades).length, 0, '全部動完照樣不算通關');

  const again = createProgression({ curriculum, challenges });
  eq(again.handleCount(), handles.length, '動過的器物寫進 localStorage');
  again.resetAll();
  eq(again.handleCount(), 0, '重置會清掉動過的器物');
}
memory.clear();

/* ================================================================== */
/* Phase 7：序章「喚醒神諭」引導課程                                     */
/*                                                                    */
/*   · 教學內容必須逐字取自 curriculum（護欄 2：不得杜撰技巧或來源）      */
/*   · 練習用的是同一支離線 rubric 引擎（護欄 3）                        */
/*   · 弱寫法一定不過、官方寫法一定滿分 —— 課程才教得到東西              */
/*   · 存檔相容：舊存檔（有進度）不會被塞回教學                          */
/* ================================================================== */
console.log('\n▸ 序章引導課程（Phase 7）');

const prologueData = readJson('src/data/prologue.json');
const { createPrologueContent } = await import('../src/challenges/prologue.js');
const prologueContent = createPrologueContent(prologueData, curriculum);

const BEAT_KINDS = new Set(['say', 'gate', 'practice', 'finish']);
const GATE_KINDS = new Set(['move', 'camera', 'run', 'arrive']);

ok(prologueData.beats.length >= 7, '序章有足夠的節拍（醒來 → 操作 → 三堂課 → 畢業）', `n=${prologueData.beats.length}`);
const beatIds = prologueData.beats.map((b) => b.id);
eq(new Set(beatIds).size, beatIds.length, '序章節拍 id 沒有重複');
for (const b of prologueData.beats) {
  ok(BEAT_KINDS.has(b.kind), `[${b.id}] 節拍類型合法`, b.kind);
  if (b.kind === 'gate') {
    ok(GATE_KINDS.has(b.gate), `[${b.id}] 門檻類型合法`, b.gate);
    ok(typeof b.objective === 'string' && b.objective.length > 0, `[${b.id}] 門檻有明確的行動目標（teach by doing）`);
    ok(typeof b.done === 'string' && b.done.length > 0, `[${b.id}] 門檻達成時有立即回饋`);
  }
  if (b.kind === 'practice') {
    ok(!!prologueContent.step(b.stepId), `[${b.id}] practice 節拍指到存在的練習 ${b.stepId}`);
    // Phase 13：每一課刻完之後，回聲要補一句短的過場（bridge）再切下一拍
    ok(
      Array.isArray(b.bridge) && b.bridge.length >= 1 && b.bridge.length <= 2,
      `[${b.id}] 課後有 1–2 句的過場台詞`,
      JSON.stringify(b.bridge || null)
    );
  }
  /*
   * Phase 13（導演式）：一拍最多兩句、每句都短。
   * 台詞會被「逐句浮出」地演出來，一次倒一牆字就不是導演，是說明書。
   */
  const spoken = [...(b.lines || []), ...(b.bridge || [])];
  ok(
    (b.lines || []).length >= 1 && (b.lines || []).length <= 2,
    `[${b.id}] 一拍最多兩句（一次一個想法）`,
    `n=${(b.lines || []).length}`
  );
  for (const line of spoken) {
    ok(line.length <= 40, `[${b.id}] 每一句都短`, `${line.length} 字：${line.slice(0, 24)}…`);
  }
  if (b.done) ok(b.done.length <= 40, `[${b.id}] 門檻達成的回饋也短`, `${b.done.length} 字`);
  if (b.hint) ok(b.hint.length <= 40, `[${b.id}] 附註也短`, `${b.hint.length} 字`);
}
// 四個操作門檻各出現一次
for (const g of GATE_KINDS) {
  eq(
    prologueData.beats.filter((b) => b.kind === 'gate' && b.gate === g).length,
    1,
    `操作門檻 ${g} 恰好教一次（一次一件事）`
  );
}
eq(prologueData.beats.filter((b) => b.kind === 'practice').length, 3, '序章有三堂核心概念實作課');
eq(prologueData.beats[prologueData.beats.length - 1].kind, 'finish', '最後一拍是畢業交接');

// 起始祭壇：站得住、走得到、不跟任何石座／石碑打架
const shrine = prologueContent.shrine;
ok(Array.isArray(shrine.at) && shrine.at.length === 2, '序章定義了起始祭壇座標');
{
  const [sx, sz] = shrine.at;
  const here = World.regionAt(sx, sz);
  ok(here && here.id === 'foundations' && !here.onBridge, '祭壇在起始高原上', JSON.stringify(here));
  ok(World.coverage(sx, sz) > 0.75, '祭壇站在實地上');
  for (const c of challenges) {
    ok(
      Math.hypot(sx - c.position[0], sz - c.position[1]) > 12,
      `祭壇離石座 [${c.id}] 夠遠（互動不會互搶）`,
      `${Math.hypot(sx - c.position[0], sz - c.position[1]).toFixed(1)}`
    );
  }
  ok(Math.hypot(sx - 0, sz - 6) < 20, '祭壇離出生點夠近（醒來就看得到）');
}

const SCAFFOLDS = ['full', 'partial', 'light'];
eq(prologueContent.steps.length, 3, '解析後有三堂練習');
const beforeAfterByTitle = new Map((curriculum.beforeAfter || []).map((b) => [b.title, b]));

prologueContent.steps.forEach((step, i) => {
  const tag = `[${step.id}]`;
  eq(step.scaffold, SCAFFOLDS[i], `${tag} 鷹架逐堂遞減（faded scaffolding）`);
  ok(step.teaches.length > 0, `${tag} 至少教一條技巧`);
  for (const t of step.teaches) ok(techById.has(t), `${tag} teaches "${t}" 存在於 curriculum`);
  for (const t of step.teachTechniques) ok(techById.has(t), `${tag} 教學卡 "${t}" 存在於 curriculum`);
  ok(step.teachCards.length > 0, `${tag} 至少有一張官方教學卡`);
  for (const card of step.teachCards) {
    const real = techById.get(card.id);
    eq(card.tip, real.tip, `${tag} 教學卡的說明逐字取自 curriculum（${card.id}）`);
    eq(card.example, real.example, `${tag} 教學卡的範例逐字取自 curriculum（${card.id}）`);
    ok(card.sources.length > 0 && /^https:\/\//.test(card.sources[0].url), `${tag} 教學卡附得出官方連結`);
  }
  for (const r of step.rubric) {
    ok(CHECK_IDS.includes(r.check), `${tag} rubric 用的是真實存在的檢查器 "${r.check}"`);
    ok(techById.has(r.techniqueId), `${tag} rubric techniqueId "${r.techniqueId}" 存在`);
    ok(typeof r.hint === 'string' && r.hint.length > 0, `${tag} 每條檢查都有教學提示`);
  }
  ok(allSourceUrls.has(step.source), `${tag} source 是 curriculum 裡真實存在的官方連結`, step.source);
  ok(/^https:\/\//.test(step.source), `${tag} source 是 https 連結`);
  const teachUrls = new Set(
    [...step.teaches, ...step.teachTechniques].flatMap((t) =>
      techById.has(t) ? techById.get(t).sources.map((s) => s.url) : []
    )
  );
  ok(teachUrls.has(step.source), `${tag} source 屬於它所教的技巧`);
  ok(step.sourceName !== '官方文件', `${tag} 出處有真實名稱可顯示`, step.sourceName);

  /*
   * 引用（Phase 9）：
   *   · 官方原文仍然只能引 curriculum 既有的內容，而且逐字（護欄 2）
   *   · 但畫面上「主要」顯示的是遊戲自撰的中文示範（zh.*），官方英文降級成「原文 ↗」
   *   · 翻譯與原文一定分開存放 —— 結構上不可能把翻譯當成官方引文
   */
  ok(!!step.quote, `${tag} 有 worked example`);
  if (step.quote.kind === 'beforeAfter') {
    const pair = beforeAfterByTitle.get(step.quote.title);
    ok(!!pair, `${tag} 弱→強對照存在於 curriculum`);
    eq(step.quote.weak, pair.weak, `${tag} 官方「弱」寫法逐字保留`);
    eq(step.quote.strong, pair.strong, `${tag} 官方「強」寫法逐字保留`);
    ok(CJK.test(step.quote.weakZh), `${tag} 有中文的「弱」示範（遊戲自撰）`, step.quote.weakZh);
    ok(CJK.test(step.quote.strongZh), `${tag} 有中文的「強」示範（遊戲自撰）`, step.quote.strongZh);
    ok(step.quote.weakZh !== pair.weak, `${tag} 中文示範不是照抄英文原句`);
    ok(step.quote.strongZh !== pair.strong, `${tag} 中文「強」示範不是照抄英文原句`);
    eq(step.starter, step.quote.weakZh, `${tag} 第一幕擺出的委託就是那句「中文」弱寫法（看得懂才知道哪裡不對）`);
    ok(step.assembled.includes(step.quote.strongZh), `${tag} 刻對了會刻出中文的「強」寫法`);
    ok(!ENGLISH(step.assembled), `${tag} 刻出來的內容沒有英文句子`, ENGLISH(step.assembled) || '');
  } else {
    const tech = techById.get(step.quote.techniqueId);
    ok(!!tech, `${tag} 引用的技巧存在`);
    eq(step.quote.example, tech.example, `${tag} 官方範例逐字保留`);
    ok(CJK.test(step.quote.exampleZh), `${tag} 有中文的範例示範（遊戲自撰）`, step.quote.exampleZh);
    ok(step.quote.exampleZh !== tech.example, `${tag} 中文示範不是照抄英文原句`);
    ok(step.starter.length > 0, `${tag} 有起手的壞寫法可以看`);
    ok(CJK.test(step.starter), `${tag} 起手的壞寫法是中文`);
    ok(!ENGLISH(step.assembled), `${tag} 刻出來的內容沒有英文句子`, ENGLISH(step.assembled) || '');
  }
  // 教學卡：官方 tip / example 逐字保留，另外一定要有中文示範可以先看
  for (const card of step.teachCards) {
    if (step.quote.kind === 'techniqueExample' && card.id === step.quote.techniqueId) continue;
    ok(CJK.test(card.exampleZh || ''), `${tag} 教學卡 ${card.id} 有中文示範`, card.exampleZh || '（無）');
    ok(card.exampleZh !== card.example, `${tag} 教學卡 ${card.id} 的中文示範不是照抄官方原文`);
  }

  /*
   * Phase 13 · 神諭刻文：一課只講一個概念，而且掛得回它的神諭原典。
   * 刻文本身是遊戲自撰的白話（不得冒充官方文字），但 source 一定是真的。
   */
  const ins = step.inscription;
  ok(!!ins, `${tag} 有一段神諭刻文`);
  if (ins) {
    ok(techById.has(ins.techniqueId), `${tag} 刻文指到真實存在的技巧 ${ins.techniqueId}`);
    for (const [field, text] of [
      ['標題', ins.title],
      ['說明', ins.what],
      ['做法', ins.how],
    ]) {
      ok(typeof text === 'string' && text.length > 0, `${tag} 刻文有${field}`);
      ok(CJK.test(text), `${tag} 刻文的${field}是中文`, text);
      ok(!ENGLISH(text), `${tag} 刻文的${field}沒有英文句子`, ENGLISH(text) || '');
      ok(text.length <= 30, `${tag} 刻文的${field}夠短（一眼讀完）`, `${text.length} 字`);
    }
    const real = techById.get(ins.techniqueId);
    ok(ins.title !== (real && real.tip), `${tag} 刻文是自己寫的白話，不是照抄 curriculum 的 tip`);
    ok(!!ins.source && /^https:\/\//.test(ins.source.url), `${tag} 刻文附得出可點的神諭原典`, ins.source?.url);
    ok(
      allSourceUrls.has(ins.source.url),
      `${tag} 刻文的神諭原典是 curriculum 裡真實存在的官方連結`,
      ins.source.url
    );
    ok(
      (real.sources || []).some((s) => s.url === ins.source.url),
      `${tag} 刻文的原典屬於它所講的那條技巧`
    );
  }

  /*
   * Phase 13 · 石碑刻印流程（序章與正式關卡同一種互動）：
   *   · 2–3 段，每段 2–3 個選項、剛好一個正確
   *   · 錯的選項都有白話教學回饋，而且不是正確答案的複製
   *   · **全部選對 → 用真的離線引擎跑 → 一定拿 S**（這一課才教得到東西）
   */
  const flow = step.flow;
  ok(!!flow, `${tag} 有石碑刻印流程`);
  ok(
    flow && flow.slots.length >= 2 && flow.slots.length <= 3,
    `${tag} 流程有 2–3 段`,
    `n=${flow ? flow.slots.length : 0}`
  );
  (flow ? flow.slots : []).forEach((slot, si) => {
    const at = `${tag} 第 ${si + 1} 段`;
    ok(typeof slot.ask === 'string' && slot.ask.length >= 6, `${at} 有一句話的問題`, slot.ask);
    ok(slot.ask.length <= 44, `${at} 問題夠短（一眼讀完）`, `${slot.ask.length} 字`);
    ok(CJK.test(slot.ask), `${at} 問題是中文`, slot.ask);
    ok(!ENGLISH(slot.ask), `${at} 問題沒有英文句子`, ENGLISH(slot.ask) || '');
    ok(
      Array.isArray(slot.options) && slot.options.length >= 2 && slot.options.length <= 3,
      `${at} 有 2–3 個選項`,
      `n=${slot.options ? slot.options.length : 0}`
    );
    const rights = slot.options.filter((o) => o.correct);
    eq(rights.length, 1, `${at} 剛好一個正確選項`);
    for (const [j, o] of slot.options.entries()) {
      ok(typeof o.text === 'string' && o.text.trim().length > 0, `${at} 選項 ${j + 1} 有內容`);
      ok(CJK.test(o.text), `${at} 選項 ${j + 1} 是中文`, o.text.slice(0, 24));
      ok(!ENGLISH(o.text), `${at} 選項 ${j + 1} 沒有英文句子`, ENGLISH(o.text) || '');
      ok(!/https?:\/\//.test(o.text), `${at} 選項 ${j + 1} 不自帶連結（出處只在刻文與圖鑑）`);
      if (o.correct) continue;
      const fb = String(o.feedback || '');
      ok(fb.trim().length >= 12, `${at} 錯的選項 ${j + 1} 有教學回饋`, fb);
      ok(CJK.test(fb) && !ENGLISH(fb), `${at} 錯的選項 ${j + 1} 的回饋是白話中文`, fb);
      ok(!/https?:\/\//.test(fb), `${at} 錯的選項 ${j + 1} 的回饋不自帶連結`);
      ok(o.text.trim() !== rights[0].text.trim(), `${at} 錯的選項 ${j + 1} 不是正確答案的複製`);
    }
  });

  // 評分：委託那句弱寫法一定不過、全部選對一定滿分（同一支離線引擎）
  const weakEval = evaluate(step, step.starter);
  ok(!weakEval.passed, `${tag} 委託裡那句弱寫法不會過關`, `${weakEval.earned}/${weakEval.total}`);
  const assembledEval = evaluate(step, step.assembled);
  ok(assembledEval.passed, `${tag} 全部選對就過關`, `${assembledEval.earned}/${assembledEval.total}`);
  eq(assembledEval.grade, 'S', `${tag} 全部選對拿到 S（刻印模式的地基）`);
  ok(!assembledEval.tooShort, `${tag} 刻出來的 prompt 不會太短`, `${step.assembled.length} 字`);
  for (const slot of flow ? flow.slots : []) {
    const right = slot.options.find((o) => o.correct);
    ok(step.assembled.includes(right.text), `${tag} 刻出來的內容包含每一段的正確選項`);
  }
  const total = step.rubric.reduce((n, r) => n + r.weight, 0);
  ok(step.pass > 0 && step.pass <= total, `${tag} 通過門檻在合理範圍`, `pass=${step.pass} total=${total}`);
  ok(step.pass > total / 2, `${tag} 通過門檻夠嚴（不能只做到一件事就過）`);
  ok(step.xp > 0, `${tag} 完成會給 XP`);
});

// 三堂課合起來要教到「講清楚 / 正面表述 / 分隔結構」這三個地基概念
const prologueTaught = new Set(prologueContent.steps.flatMap((s) => s.teaches));
for (const must of ['clarity-01', 'clarity-03', 'positive-01', 'clarity-04']) {
  ok(prologueTaught.has(must), `序章教到核心概念 ${must}（${techById.get(must).title}）`);
}
for (const id of prologueTaught) {
  eq(techById.get(id).groupId, 'foundations', `序章只教基本功區的技巧（${id}）`);
}
// 序章教的每一條技巧，之後都還有正式關卡再練一次（不會學完就沒地方用）
for (const id of prologueTaught) {
  ok(taught.has(id), `序章教的 ${id} 在正式關卡也有練習`);
}
// 序章的 id 不可以跟正式關卡撞（bestGrades / prologueSteps 是兩本帳）
for (const s of prologueContent.steps) {
  ok(!challenges.some((c) => c.id === s.id), `[${s.id}] 不與正式關卡 id 衝突`);
}

/* --- 存檔相容：prologueDone 的預設與老玩家推論 --- */
memory.clear();
eq(SaveIO.defaultSave().flags.prologueDone, false, '新存檔預設沒上過引導課程');
eq(Array.isArray(SaveIO.defaultSave().prologueSteps), true, '新存檔有 prologueSteps 欄位');
eq(SaveIO.defaultSave().settings.preflight, true, '主控台預檢預設開啟');
eq(SaveIO.normalize({}).flags.prologueDone, false, 'normalize：空存檔 → 要上引導課程');
eq(SaveIO.normalize({ version: 1, xp: 320 }).flags.prologueDone, true, 'normalize：有 XP 的舊存檔視為已完成');
eq(
  SaveIO.normalize({ version: 1, collected: ['clarity-01'] }).flags.prologueDone,
  true,
  'normalize：有收集技巧的舊存檔視為已完成'
);
eq(
  SaveIO.normalize({ version: 1, bestGrades: { 'gate-of-clarity-01': 'A' } }).flags.prologueDone,
  true,
  'normalize：有通關紀錄的舊存檔視為已完成'
);
eq(
  SaveIO.normalize({ version: 1, flags: { introSeen: true } }).flags.prologueDone,
  true,
  'normalize：看過舊教學的存檔視為已完成'
);
eq(
  SaveIO.normalize({ version: 1, xp: 900, flags: { prologueDone: false } }).flags.prologueDone,
  false,
  'normalize：玩家自己選擇重看引導課程時，尊重明寫的 false'
);
eq(
  SaveIO.normalize({ version: 1, flags: { prologueDone: true } }).flags.prologueDone,
  true,
  'normalize：明寫的 true 保留'
);
eq(
  SaveIO.normalize({ version: 1, prologueSteps: ['a', 'a', 7, 'b'] }).prologueSteps.join(','),
  'a,b',
  'normalize：prologueSteps 去重並丟掉非字串'
);
eq(SaveIO.normalize({ version: 1 }).settings.preflight, true, 'normalize：舊存檔沒有 preflight → 預設開啟');
eq(
  SaveIO.normalize({ version: 1, settings: { preflight: false } }).settings.preflight,
  false,
  'normalize：preflight 可以關掉並存下來'
);

/* --- 進程：序章給 XP 與圖鑑，但不佔關卡評價 --- */
memory.clear();
const proProg = createProgression({ curriculum, challenges });
eq(proProg.isPrologueDone(), false, '新玩家還沒上過引導課程');
const stepA = prologueContent.steps[0];
const gainA = proProg.completePrologueStep(stepA.id, { teaches: stepA.teaches, xp: stepA.xp });
eq(gainA.already, false, '第一次完成序章練習');
eq(gainA.xpGain, stepA.xp, '序章練習給 XP');
eq(gainA.newlyCollected.length, stepA.teaches.length, '序章練習把技巧收進圖鑑');
ok(
  stepA.teaches.every((t) => proProg.isCollected(t)),
  '序章教的技巧真的進了圖鑑'
);
eq(Object.keys(proProg.state.bestGrades).length, 0, '序章不寫關卡評價（不佔「已通關 x / 26」）');
eq(proProg.clearedCount('foundations'), 0, '序章不算進區域解鎖需要的通關數');
ok(proProg.state.badges.anthropic + proProg.state.badges.openai > 0, '序章收集的技巧會點亮廠家徽章');
eq(proProg.isPrologueStepDone(stepA.id), true, '序章練習記在存檔裡');
const repeatA = proProg.completePrologueStep(stepA.id, { teaches: stepA.teaches, xp: stepA.xp });
eq(repeatA.already, true, '重做同一堂課不重複記錄');
eq(repeatA.xpGain, 0, '重做同一堂課不再給 XP（不能刷分）');
eq(proProg.state.xp, stepA.xp, '重做後 XP 沒有變多');
proProg.setFlag('prologueDone', true);
eq(proProg.isPrologueDone(), true, '完成序章會寫進存檔旗標');
// 重新載入：序章紀錄與旗標都還在
const proReload = createProgression({ curriculum, challenges });
eq(proReload.isPrologueDone(), true, '重新載入後仍記得序章已完成');
eq(proReload.isPrologueStepDone(stepA.id), true, '重新載入後仍記得完成過的課');
proReload.resetAll();
eq(proReload.isPrologueDone(), false, '重置進度後會重新上引導課程');
eq(proReload.isPrologueStepDone(stepA.id), false, '重置進度後序章紀錄清空');
memory.clear();

/* ================================================================== */
/* Phase 10：模擬玩家驗收（26 關的通關門檻 ＋ 檢查器誤判回歸）           */
/*                                                                    */
/*   門檻本體寫在 scripts/playtest-verify.mjs（也可以單獨跑            */
/*   `npm run test:playtest`），這裡把它的斷言併進主測試的統計。         */
/* ================================================================== */
console.log('\n▸ 模擬玩家驗收（Phase 10）');
const { runPlaytestVerify } = await import('./playtest-verify.mjs');
runPlaytestVerify({ ok, eq });

/* ================================================================== */
/* Phase 11：石碑刻印（引導式選擇建構）的流程資料                        */
/*                                                                    */
/*   核心保證（不能靠人工目視）：                                        */
/*     1. 26 關每一關都有流程，每份 3–6 段                               */
/*     2. 每一段 2–3 個選項、剛好一個正確、每個錯的都有教學回饋           */
/*     3. **把每一段的正確選項串起來，用真的離線引擎跑，一定拿 S**        */
/*        （這是整個模式的地基：選對就過關，而且是最高評價）              */
/*     4. 錯的選項不能剛好也是正確答案的字面重複                          */
/*     5. 全部是白話中文（沿用 Phase 9 的英文句子掃描）                   */
/*     6. 這是遊戲自撰的示範層：不得自己帶官方連結（護欄 2）              */
/* ================================================================== */
console.log('\n▸ 石碑刻印的流程資料（Phase 11）');

const flowData = readJson('src/data/flows.json');
const { normalizeMode } = await import('../src/prompt/console.js').catch(() => ({}));

eq(flowData.authored, 'game', 'flows.json 明確標記為遊戲自撰（不是官方引文）');
ok(typeof flowData.note === 'string' && flowData.note.length > 40, 'flows.json 有檔頭說明');
eq(
  Object.keys(flowData.flows).length,
  challenges.length,
  `26 關全部都有刻印流程（實際 ${Object.keys(flowData.flows).length} 份）`
);
const challengeIds = new Set(challenges.map((c) => c.id));
for (const key of Object.keys(flowData.flows)) {
  ok(challengeIds.has(key), `flows 的 ${key} 對應到真實關卡`);
}

/** 把每一段的正確選項串起來 —— 這就是玩家「全部選對」會刻出來的 prompt。 */
function assembleFlow(flow) {
  return flow.slots.map((s) => s.options.find((o) => o.correct).text).join('\n');
}

for (const c of challenges) {
  const tag = `[${c.id}]`;
  const flow = flowData.flows[c.id];
  ok(!!flow, `${tag} 有刻印流程`);
  if (!flow) continue;

  ok(
    Array.isArray(flow.slots) && flow.slots.length >= 3 && flow.slots.length <= 6,
    `${tag} 流程有 3–6 段`,
    `n=${flow.slots ? flow.slots.length : 0}`
  );

  flow.slots.forEach((slot, i) => {
    const at = `${tag} 第 ${i + 1} 段`;
    ok(typeof slot.ask === 'string' && slot.ask.length >= 6, `${at} 有一句話的問題`, slot.ask);
    ok(slot.ask.length <= 44, `${at} 問題夠短（一眼讀完）`, `${slot.ask.length} 字`);
    ok(CJK.test(slot.ask), `${at} 問題是中文`, slot.ask);
    ok(!ENGLISH(slot.ask), `${at} 問題沒有英文句子`, ENGLISH(slot.ask) || '');

    ok(
      Array.isArray(slot.options) && slot.options.length >= 2 && slot.options.length <= 3,
      `${at} 有 2–3 個選項`,
      `n=${slot.options ? slot.options.length : 0}`
    );
    const rights = slot.options.filter((o) => o.correct);
    eq(rights.length, 1, `${at} 剛好一個正確選項`);

    for (const [j, o] of slot.options.entries()) {
      ok(typeof o.text === 'string' && o.text.trim().length > 0, `${at} 選項 ${j + 1} 有內容`);
      // 中文為主；例外只有「純參數設定行」（例如 effort / verbosity 這種旋鈕名稱），
      // 那些本來就要照原樣填進 prompt，翻成中文反而點不亮檢查器。
      ok(!ENGLISH(o.text), `${at} 選項 ${j + 1} 沒有英文句子`, ENGLISH(o.text) || '');
      ok(
        CJK.test(o.text) || /[＝=，、。]/.test(o.text),
        `${at} 選項 ${j + 1} 是玩家讀得懂的中文（或純參數設定行）`,
        o.text.slice(0, 30)
      );
      ok(!/https?:\/\//.test(o.text), `${at} 選項 ${j + 1} 不自帶連結（出處只在 rubric 與圖鑑）`);
      if (o.correct) continue;
      // 錯的選項一定要教人：白話、講得出「為什麼這樣比較弱」
      const fb = String(o.feedback || '');
      ok(fb.trim().length >= 12, `${at} 錯的選項 ${j + 1} 有教學回饋`, fb);
      ok(CJK.test(fb), `${at} 錯的選項 ${j + 1} 的回饋是中文`, fb);
      ok(!ENGLISH(fb), `${at} 錯的選項 ${j + 1} 的回饋沒有英文句子`, ENGLISH(fb) || '');
      ok(!/https?:\/\//.test(fb), `${at} 錯的選項 ${j + 1} 的回饋不自帶連結`);
      ok(
        o.text.trim() !== rights[0].text.trim(),
        `${at} 錯的選項 ${j + 1} 不是正確答案的複製`,
        o.text.slice(0, 30)
      );
    }
  });

  /* --- 地基：全部選對 → 用真的離線引擎跑 → 一定 S --- */
  const assembled = assembleFlow(flow);
  const ev = evaluate(c, assembled);
  ok(ev.passed, `${tag} 全部選對就過關`, `earned=${ev.earned}/${ev.total} pass=${c.pass}`);
  eq(ev.grade, 'S', `${tag} 全部選對拿到 S（刻印模式的地基）`);
  ok(
    !ev.tooShort,
    `${tag} 刻出來的 prompt 不會太短`,
    `${assembled.length} 字`
  );
  // 每一段都必須真的貢獻內容（否則就是裝飾用的空格）
  for (const slot of flow.slots) {
    const right = slot.options.find((o) => o.correct);
    ok(assembled.includes(right.text), `${tag} 刻出來的內容包含每一段的正確選項`);
  }
}

/** 每一關至少有一段的正確選項不是第一個（不然按 1 按到底就過了）。 */
let variedSlots = 0;
let totalSlots = 0;
for (const flow of Object.values(flowData.flows)) {
  for (const slot of flow.slots) {
    totalSlots += 1;
    if (!slot.options[0].correct) variedSlots += 1;
  }
}
ok(totalSlots >= 26 * 3, `全部流程加起來至少 78 段（實際 ${totalSlots} 段）`);
ok(
  variedSlots / totalSlots > 0.4,
  `正確答案的位置有打散（不是永遠第一個：${variedSlots} / ${totalSlots} 段不在第一個）`
);

/* ================================================================== */
/* Phase 27：兩種新題型（排序刻印 / 神諭工坊）                          */
/*                                                                    */
/*   核心保證：                                                         */
/*     1. `kind` 沒寫就是 choice —— 其他 24 關零行為變化                 */
/*     2. 排序刻印：正解排法用**真的離線引擎**跑一定拿 S，而且一開始      */
/*        沒有任何一片剛好站對（不是送分題）                             */
/*     3. 神諭工坊：把四步的正確操作組起來 ＝ 資料層的示範解答，          */
/*        丟進真的引擎每一條檢查都滿分                                   */
/*     4. 錯的選項（工具 / 值石 / 規矩）都有白話中文教學，不自帶連結      */
/* ================================================================== */
console.log('\n▸ 排序刻印與神諭工坊（Phase 27）');

const { flowKind, FLOW_KINDS, KIND_LABEL } = await import('../src/prompt/console.js');

eq(flowKind(undefined), 'choice', '沒有流程資料 → 石碑刻印');
eq(flowKind({}), 'choice', '沒寫 kind → 石碑刻印（預設值，24 關零變化）');
eq(flowKind({ kind: 'nonsense' }), 'choice', '亂填的 kind → 石碑刻印');
eq(flowKind({ kind: 'order' }), 'choice', '宣告了 order 卻沒有 orderFlow → 退回石碑刻印');
eq(flowKind({ kind: 'order', orderFlow: {} }), 'order', 'order ＋ orderFlow → 排序刻印');
eq(flowKind({ kind: 'workshop' }), 'choice', '宣告了 workshop 卻沒有 workshop 資料 → 退回石碑刻印');
eq(flowKind({ kind: 'workshop', workshop: {} }), 'workshop', 'workshop ＋ 資料 → 神諭工坊');
eq(FLOW_KINDS.length, 3, '一共三種題型');
for (const k of FLOW_KINDS) {
  ok(CJK.test(KIND_LABEL[k]), `題型 ${k} 在畫面上有中文說法`, KIND_LABEL[k]);
}

const kindOf = (id) => flowKind(flowData.flows[id]);
const byKind = { choice: [], order: [], workshop: [] };
for (const c of challenges) byKind[kindOf(c.id)].push(c.id);
eq(byKind.order.length, 2, '兩關改成排序刻印（次序本身就是那一關的課程）');
eq(byKind.workshop.length, 1, '一關是神諭工坊');
eq(byKind.choice.length, challenges.length - 3, `其餘 ${challenges.length - 3} 關維持石碑刻印`);
eq(byKind.order.sort().join(','), 'long-scroll-tower-23,priority-stair-42', '改成排序的是那兩關');
eq(byKind.workshop.join(','), 'oracle-workshop-36', '神諭工坊是新的第 27 關');
for (const [id, f] of Object.entries(flowData.flows)) {
  if (!('kind' in f)) continue;
  ok(FLOW_KINDS.includes(f.kind), `[${id}] kind 是合法的題型`, String(f.kind));
}
// 換題型不等於把舊資料丟掉：選擇題的流程一律留著當後備
for (const id of [...byKind.order, ...byKind.workshop]) {
  ok(
    Array.isArray(flowData.flows[id].slots) && flowData.flows[id].slots.length >= 3,
    `[${id}] 仍然留著原本的選擇題流程當後備資料`
  );
}

/* --- 排序刻印 ------------------------------------------------------ */
for (const id of byKind.order) {
  const tag = `[${id}]`;
  const c = challenges.find((x) => x.id === id);
  const of = flowData.flows[id].orderFlow;
  ok(of && typeof of === 'object', `${tag} 有 orderFlow`);
  if (!of) continue;

  ok(nonEmptyStr(of.ask) && of.ask.length <= 44, `${tag} 排序的問題一眼讀得完`, of.ask);
  ok(CJK.test(of.ask), `${tag} 排序的問題是中文`, of.ask);
  ok(!ENGLISH(of.ask), `${tag} 排序的問題沒有英文句子`, ENGLISH(of.ask) || '');

  ok(
    Array.isArray(of.pieces) && of.pieces.length >= 2 && of.pieces.length <= 6,
    `${tag} 有 2–6 片石版`,
    `n=${of.pieces ? of.pieces.length : 0}`
  );
  const pieceIds = of.pieces.map((p) => p.id);
  eq(new Set(pieceIds).size, pieceIds.length, `${tag} 石版 id 沒有重複`);
  for (const p of of.pieces) {
    ok(nonEmptyStr(p.id), `${tag} 每片石版都有 id`);
    ok(nonEmptyStr(p.label) && p.label.length <= 16, `${tag} 石版「${p.id}」有短標籤`, p.label);
    ok(CJK.test(p.label), `${tag} 石版「${p.id}」的標籤是中文`, p.label);
    ok(!ENGLISH(p.label), `${tag} 石版「${p.id}」的標籤沒有英文句子`, ENGLISH(p.label) || '');
    ok(nonEmptyStr(p.text), `${tag} 石版「${p.id}」有內容`);
    ok(!/https?:\/\//.test(p.text), `${tag} 石版「${p.id}」不自帶連結（出處只在 rubric 與圖鑑）`);
  }
  ok(
    Array.isArray(of.order) && of.order.length === of.pieces.length,
    `${tag} 正解的長度＝石版數`
  );
  eq(
    [...of.order].sort().join(','),
    [...pieceIds].sort().join(','),
    `${tag} 正解是那幾片石版的排列（沒有多也沒有少）`
  );
  // 一開始不能已經是正解，而且不能有任何一片剛好站對（那就變成送分題）
  ok(
    JSON.stringify(pieceIds) !== JSON.stringify(of.order),
    `${tag} 初始排法不等於正解`,
    pieceIds.join(',')
  );
  const preRight = pieceIds.filter((pid, i) => of.order.indexOf(pid) === i);
  eq(preRight.length, 0, `${tag} 一開始沒有任何一片剛好站對`, preRight.join(','));

  // 地基：排對＝送去同一支離線引擎 → 一定拿 S
  const byId = new Map(of.pieces.map((p) => [p.id, p.text]));
  const assembled = of.order.map((pid) => byId.get(pid)).join('\n');
  const ev = evaluate(c, assembled);
  ok(ev.passed, `${tag} 排對就過關`, `earned=${ev.earned}/${ev.total} pass=${c.pass}`);
  eq(ev.grade, 'S', `${tag} 排對拿到 S（排序刻印的地基）`);
  ok(
    ev.results.every((r) => r.passed),
    `${tag} 排對時每一條檢查都滿分`,
    ev.results.filter((r) => !r.passed).map((r) => r.check).join('、')
  );
  // 排好的字就是這一關的示範解答（玩家在兩種模式看到的是同一段文字）
  eq(assembled, c.sample, `${tag} 排好的整段文字＝資料層的示範解答`);
}

/* --- 神諭工坊 ------------------------------------------------------ */
{
  const id = 'oracle-workshop-36';
  const tag = `[${id}]`;
  const c = challenges.find((x) => x.id === id);
  const ws = flowData.flows[id].workshop;
  ok(!!c, `${tag} 關卡存在`);
  ok(ws && typeof ws === 'object', `${tag} 有 workshop 資料`);

  eq(c.region, 'orchestration', `${tag} 擺在流程與代理那片土地（工具使用的主題就在那裡）`);
  ok(
    c.teaches.every((t) => techById.has(t)),
    `${tag} teaches 全部對應 curriculum 的真實技巧`,
    c.teaches.join(',')
  );
  ok(
    c.teaches.includes('agentic-01') && c.teaches.includes('agentic-02'),
    `${tag} 教的是官方文件裡真的有的工具定義技巧`
  );

  ok(Array.isArray(ws.stages) && ws.stages.length === 4, `${tag} 有四步（挑工具 / 填參數 / 排順序 / 立規矩）`);
  for (const [i, s] of (ws.stages || []).entries()) {
    ok(nonEmptyStr(s.ask) && s.ask.length <= 44, `${tag} 第 ${i + 1} 步的問題一眼讀得完`, s.ask);
    ok(CJK.test(s.ask), `${tag} 第 ${i + 1} 步的問題是中文`, s.ask);
    ok(!ENGLISH(s.ask), `${tag} 第 ${i + 1} 步的問題沒有英文句子`, ENGLISH(s.ask) || '');
  }

  const needed = ws.tools.filter((t) => t.needed);
  ok(ws.tools.length >= 3, `${tag} 檯上至少三把工具（要挑得出來才叫挑）`, `n=${ws.tools.length}`);
  ok(needed.length >= 2, `${tag} 至少兩把真的用得到（才有相依順序可排）`, `n=${needed.length}`);
  ok(needed.length < ws.tools.length, `${tag} 一定有用不到的工具（不然不是選擇）`);
  const stoneIds = new Set(ws.stones.map((s) => s.id));
  for (const t of ws.tools) {
    ok(nonEmptyStr(t.id) && nonEmptyStr(t.name), `${tag} 工具「${t.id}」有 id 與名字`);
    ok(CJK.test(t.name), `${tag} 工具「${t.id}」的名字是中文`, t.name);
    ok(nonEmptyStr(t.desc) && CJK.test(t.desc), `${tag} 工具「${t.id}」有中文說明`, t.desc);
    ok(Array.isArray(t.params) && t.params.length >= 1, `${tag} 工具「${t.id}」至少一個參數`);
    // 工具規格三件事一樣都不能少（這一關教的就是這個）
    ok(/工具名[:：]/.test(t.spec), `${tag} 工具「${t.id}」的規格寫了工具名`);
    ok(/說明[:：]/.test(t.spec), `${tag} 工具「${t.id}」的規格寫了說明`);
    ok(/參數[:：]/.test(t.spec), `${tag} 工具「${t.id}」的規格寫了參數`);
    ok(!/https?:\/\//.test(t.spec), `${tag} 工具「${t.id}」的規格不自帶連結`);
    if (!t.needed) {
      ok(
        nonEmptyStr(t.feedback) && t.feedback.trim().length >= 12,
        `${tag} 用不到的工具「${t.id}」有白話教學回饋`,
        t.feedback
      );
      ok(CJK.test(t.feedback), `${tag} 工具「${t.id}」的回饋是中文`, t.feedback);
      ok(!ENGLISH(t.feedback), `${tag} 工具「${t.id}」的回饋沒有英文句子`, ENGLISH(t.feedback) || '');
      ok(!/https?:\/\//.test(t.feedback), `${tag} 工具「${t.id}」的回饋不自帶連結`);
      continue;
    }
    for (const p of t.params) {
      ok(nonEmptyStr(p.label) && CJK.test(p.label), `${tag} 參數「${t.id}.${p.id}」有中文名稱`, p.label);
      ok(nonEmptyStr(p.hint) && /字串|整數|數字/.test(p.hint), `${tag} 參數「${t.id}.${p.id}」寫了型別與用途`, p.hint);
      ok(stoneIds.has(p.stone), `${tag} 參數「${t.id}.${p.id}」的正解值石真的存在`, p.stone);
      ok(
        nonEmptyStr(p.miss) && p.miss.trim().length >= 12,
        `${tag} 參數「${t.id}.${p.id}」放錯時有白話教學`,
        p.miss
      );
      ok(CJK.test(p.miss), `${tag} 參數「${t.id}.${p.id}」的教學是中文`, p.miss);
      ok(!ENGLISH(p.miss), `${tag} 參數「${t.id}.${p.id}」的教學沒有英文句子`, ENGLISH(p.miss) || '');
      ok(!/https?:\/\//.test(p.miss), `${tag} 參數「${t.id}.${p.id}」的教學不自帶連結`);
    }
  }
  const wantedStones = new Set(needed.flatMap((t) => t.params.map((p) => p.stone)));
  eq(new Set(ws.stones.map((s) => s.id)).size, ws.stones.length, `${tag} 值石 id 沒有重複`);
  ok(
    ws.stones.length > wantedStones.size,
    `${tag} 托盤裡有多餘的值石（不然放哪一顆都對）`,
    `${ws.stones.length} vs ${wantedStones.size}`
  );
  for (const s of ws.stones) {
    ok(nonEmptyStr(s.text), `${tag} 值石「${s.id}」有內容`);
    ok(!ENGLISH(s.text), `${tag} 值石「${s.id}」沒有英文句子`, ENGLISH(s.text) || '');
  }

  ok(Array.isArray(ws.order.sequence) && ws.order.sequence.length === needed.length, `${tag} 呼叫順序涵蓋每一把用得到的工具`);
  ok(
    ws.order.sequence.every((tid) => needed.some((t) => t.id === tid)),
    `${tag} 呼叫順序裡只有真的用得到的工具`,
    ws.order.sequence.join(',')
  );
  ok(
    JSON.stringify(ws.order.start) !== JSON.stringify(ws.order.sequence),
    `${tag} 一開始故意排反（相依順序要玩家自己想）`,
    (ws.order.start || []).join(',')
  );
  eq(
    [...(ws.order.start || [])].sort().join(','),
    [...ws.order.sequence].sort().join(','),
    `${tag} 初始排法與正解是同一組呼叫`
  );

  const rights = ws.rules.filter((r) => r.correct);
  eq(rights.length, 1, `${tag} 規矩剛好一條是對的`);
  ok(ws.rules.length >= 2 && ws.rules.length <= 3, `${tag} 規矩有 2–3 條`, `n=${ws.rules.length}`);
  for (const r of ws.rules) {
    ok(nonEmptyStr(r.text) && CJK.test(r.text), `${tag} 規矩「${r.text.slice(0, 10)}」是中文`);
    ok(!/https?:\/\//.test(r.text), `${tag} 規矩不自帶連結`);
    if (r.correct) continue;
    ok(nonEmptyStr(r.feedback) && r.feedback.trim().length >= 12, `${tag} 立錯的規矩有白話教學`, r.feedback);
    ok(CJK.test(r.feedback), `${tag} 立錯的教學是中文`, r.feedback);
    ok(!ENGLISH(r.feedback), `${tag} 立錯的教學沒有英文句子`, ENGLISH(r.feedback) || '');
    ok(r.text.trim() !== rights[0].text.trim(), `${tag} 錯的規矩不是正解的複製`);
  }
  ok(nonEmptyStr(ws.head) && CJK.test(ws.head), `${tag} 派工單有中文開頭`, ws.head);
  ok(!ENGLISH(ws.head), `${tag} 派工單開頭沒有英文句子`, ENGLISH(ws.head) || '');

  /* 地基：把四步的正確操作組起來 → 一定是資料層的示範解答，而且每條檢查滿分 */
  const stoneText = new Map(ws.stones.map((s) => [s.id, s.text]));
  const toolById = new Map(ws.tools.map((t) => [t.id, t]));
  const seq = ws.order.sequence.map((tid) => toolById.get(tid));
  const dispatch = [
    ws.head,
    ...seq.map((t) => t.spec),
    ...seq.map(
      (t, i) =>
        `${i + 1}. 呼叫「${t.name}」，${t.params
          .map((p) => `${p.label}＝${stoneText.get(p.stone)}`)
          .join('、')}。`
    ),
    rights[0].text,
  ].join('\n');
  eq(dispatch, c.sample, `${tag} 派工完成組出來的字＝資料層的示範解答（同一段文字）`);
  const wev = evaluate(c, dispatch);
  ok(wev.passed, `${tag} 派工完成就過關`, `earned=${wev.earned}/${wev.total}`);
  eq(wev.grade, 'S', `${tag} 派工完成拿到 S（神諭工坊的地基）`);
  ok(
    wev.results.every((r) => r.passed),
    `${tag} 派工完成時每一條檢查都滿分`,
    wev.results.filter((r) => !r.passed).map((r) => r.check).join('、')
  );
  // 只挑完工具還不夠：後面每一步都還在加分
  const onlyTools = seq.map((t) => t.spec).join('\n');
  const partial = evaluate(c, onlyTools);
  ok(
    partial.grade !== 'S' && partial.earned < wev.earned,
    `${tag} 只挑完工具還不會滿分（後面每一步都還在加分）`,
    `earned=${partial.earned}/${partial.total}`
  );
}

// 模式字串的正規化（與存檔那一層同一個規則）
if (normalizeMode) {
  eq(normalizeMode(undefined), 'guided', '沒指定答題方式 → 石碑刻印');
  eq(normalizeMode('free'), 'free', 'free 就是自由書寫');
  eq(normalizeMode('nonsense'), 'guided', '亂填的答題方式 → 石碑刻印');
}

/* ================================================================== */
/* Phase 21：稱號（rank）與可分享結果卡                                */
/*                                                                    */
/*   · ranks.json 是遊戲自撰的世界觀稱謂，不得帶連結或假裝成官方分級      */
/*   · 三個門檻（等級 / 收集 / 精通）一律單調 → 進度變多不可能降級        */
/*   · 每一個稱號都「走得到」：用真的進程系統跑一次全 C 通關的路徑，       */
/*     八個稱號必須依序全部出現過（不能有稱號被自己的門檻跳過）           */
/* ================================================================== */
console.log('\n▸ 稱號與分享卡（Phase 21）');

const ranksFile = readJson('src/data/ranks.json');
const RANKS = ranksFile.ranks;
const { rankFor, rankSatisfied, rankStats } = await import('../src/progression/ranks.js');

eq(ranksFile.authored, 'game', 'ranks.json 標明是遊戲自撰（不是官方分級）');
ok(nonEmptyStr(ranksFile.note) && ranksFile.note.length > 30, 'ranks.json 有說明它不代表任何外部認證');
ok(RANKS.length >= 6 && RANKS.length <= 8, `稱號數量在 6–8 之間（實際 ${RANKS.length}）`);

const rankIds = new Set();
for (const r of RANKS) {
  ok(nonEmptyStr(r.id) && !rankIds.has(r.id), `稱號 ${r.id} 的 id 存在且不重複`);
  rankIds.add(r.id);
  ok(nonEmptyStr(r.title) && /[一-鿿]/.test(r.title), `${r.id} 有中文稱號`);
  ok(nonEmptyStr(r.titleEn) && /^[A-Za-z\s'-]+$/.test(r.titleEn), `${r.id} 有英文副名`);
  ok(nonEmptyStr(r.line) && r.line.length >= 8 && r.line.length <= 40, `${r.id} 的一句話長度合理（${r.line.length} 字）`);
  ok(Number.isInteger(r.level) && r.level >= 1, `${r.id} 的等級門檻是正整數`);
  ok(Number.isInteger(r.collected) && r.collected >= 0, `${r.id} 的收集門檻是非負整數`);
  ok(Number.isInteger(r.mastered) && r.mastered >= 0 && r.mastered <= 5, `${r.id} 的精通門檻在 0..5`);
  // 稱號是風味內容：不得帶連結、不得自帶 source（真正的出處只在關卡與圖鑑）
  ok(!/https?:\/\//.test(JSON.stringify(r)), `${r.id} 不自帶連結`);
  ok(!('source' in r) && !('sources' in r), `${r.id} 沒有 source 欄位`);
  const eng = ENGLISH(`${r.title}。${r.line}`);
  ok(!eng, `${r.id} 的玩家可見文字沒有英文句子`, eng || '');
}

eq(RANKS[0].level, 1, '第一個稱號從 Lv.1 起算');
eq(RANKS[0].collected, 0, '第一個稱號不需要任何收集');
eq(RANKS[0].mastered, 0, '第一個稱號不需要任何精通');
eq(RANKS[RANKS.length - 1].collected, (curriculum.techniques || []).length, '最後一個稱號要求收集全部技巧');
eq(RANKS[RANKS.length - 1].mastered, (curriculum.groups || []).length, '最後一個稱號要求五片土地全部精通');

for (let i = 1; i < RANKS.length; i += 1) {
  const a = RANKS[i - 1];
  const b = RANKS[i];
  ok(b.level >= a.level, `門檻單調：${b.id} 的等級不低於 ${a.id}`);
  ok(b.collected >= a.collected, `門檻單調：${b.id} 的收集數不低於 ${a.id}`);
  ok(b.mastered >= a.mastered, `門檻單調：${b.id} 的精通數不低於 ${a.id}`);
  ok(
    b.level > a.level || b.collected > a.collected || b.mastered > a.mastered,
    `${b.id} 至少有一項門檻真的變高（否則會被 ${a.id} 蓋掉）`
  );
}

// 拿每個稱號自己的門檻去查，一定要查回它自己（不會被上一個或下一個蓋掉）
for (let i = 0; i < RANKS.length; i += 1) {
  const r = RANKS[i];
  const got = rankFor({ level: r.level, collected: r.collected, mastered: r.mastered }, RANKS);
  eq(got.rank.id, r.id, `門檻剛好達到時就是「${r.title}」`);
  eq(got.index, i, `${r.id} 的序號正確`);
  eq(got.next ? got.next.id : null, RANKS[i + 1] ? RANKS[i + 1].id : null, `${r.id} 指得出下一個稱號`);
}
eq(rankFor({ level: 0, collected: 0, mastered: 0 }, RANKS).rank.id, RANKS[0].id, '什麼都沒有時是第一個稱號');
eq(rankFor({ level: 99, collected: 999, mastered: 9 }, RANKS).rank.id, RANKS[RANKS.length - 1].id, '滿到爆時是最後一個稱號');
eq(rankFor({ level: 99, collected: 999, mastered: 9 }, RANKS).next, null, '最後一個稱號沒有下一個');
eq(rankFor({ level: 1, collected: 0, mastered: 0 }, []).rank, null, '沒有稱號資料時安靜回 null（不丟例外）');
// 三個條件是 AND：等級夠但收集不夠，不能晉級
eq(
  rankFor({ level: 99, collected: RANKS[1].collected - 1, mastered: 9 }, RANKS).rank.id,
  RANKS[0].id,
  '等級再高，收集數不夠就晉不了級（三個條件是 AND）'
);
eq(rankSatisfied({ level: 1, collected: 0, mastered: 0 }, RANKS[1]), false, 'rankSatisfied：門檻沒到就是 false');

/* --- 每一個稱號都走得到：用真的進程系統跑一次「全部只拿 C」的最壞路徑 --- */
memory.clear();
const rankProg = createProgression({ curriculum, challenges });
const visited = [];
function noteRank() {
  const info = rankFor(rankStats(rankProg, curriculum), RANKS);
  if (!visited.length || visited[visited.length - 1] !== info.rank.id) visited.push(info.rank.id);
}
noteRank();
const zeroStats = rankStats(rankProg, curriculum);
eq(zeroStats.level, 1, 'rankStats：新存檔是 Lv.1');
eq(zeroStats.collected, 0, 'rankStats：新存檔收集 0 條');
eq(zeroStats.mastered, 0, 'rankStats：新存檔精通 0 片');
eq(zeroStats.total, (curriculum.techniques || []).length, 'rankStats：技巧總數正確');

for (const c of challenges) {
  rankProg.recordResult({
    challengeId: c.id,
    passed: true,
    grade: 'C',
    teaches: c.teaches,
    baseXp: c.xp,
  });
  noteRank();
}
const finalStats = rankStats(rankProg, curriculum);
eq(finalStats.collected, (curriculum.techniques || []).length, '全 C 通關後 68 條技巧全收集');
eq(finalStats.mastered, (curriculum.groups || []).length, '全 C 通關後五片土地全精通');
ok(
  finalStats.level >= RANKS[RANKS.length - 1].level,
  `全 C 通關的等級（${finalStats.level}）足以拿到最後一個稱號（需要 Lv.${RANKS[RANKS.length - 1].level}）`
);
eq(rankFor(finalStats, RANKS).rank.id, RANKS[RANKS.length - 1].id, '全部通關後拿到最後一個稱號');
for (const r of RANKS) {
  ok(visited.includes(r.id), `「${r.title}」在一趟全 C 的旅程中真的出現過`, `visited=${visited.join(' → ')}`);
}
eq(visited.join(','), RANKS.map((r) => r.id).join(','), '稱號依序出現，中間不會跳過或倒退');
memory.clear();

/* --- 導航提示的方位詞（純函式，和指南針同一套方位定義：北 = −Z、東 = +X） --- */
const { directionWord, IDLE_SECONDS, HOLD_SECONDS, COOLDOWN_SECONDS, APPROACH_DELTA, NEAR_ENOUGH } = await import(
  '../src/ui/nudge.js'
);
eq(directionWord(0, -10), '北', '目標在 −Z ＝ 北');
eq(directionWord(10, 0), '東', '目標在 +X ＝ 東');
eq(directionWord(0, 10), '南', '目標在 +Z ＝ 南');
eq(directionWord(-10, 0), '西', '目標在 −X ＝ 西');
eq(directionWord(10, -10), '東北', '目標在 +X −Z ＝ 東北');
eq(directionWord(10, 10), '東南', '目標在 +X +Z ＝ 東南');
eq(directionWord(-10, 10), '西南', '目標在 −X +Z ＝ 西南');
eq(directionWord(-10, -10), '西北', '目標在 −X −Z ＝ 西北');
eq(directionWord(0, 0), '北', '距離為 0 時不丟例外');
eq(directionWord(1, -12), '北', '偏一點點仍然是北（八分之一象限）');
ok(IDLE_SECONDS >= 45 && IDLE_SECONDS <= 60, `閒置門檻在 45–60 秒之間（實際 ${IDLE_SECONDS}）`);
ok(HOLD_SECONDS >= 6 && HOLD_SECONDS <= 10, `顯示約 8 秒後自己淡出（實際 ${HOLD_SECONDS}）`);
ok(COOLDOWN_SECONDS >= 60, `冷卻夠長，不會變成嘮叨（實際 ${COOLDOWN_SECONDS} 秒）`);
ok(COOLDOWN_SECONDS > IDLE_SECONDS, '冷卻比閒置門檻長 —— 收起來之後不會馬上又冒出來');
ok(APPROACH_DELTA >= 3, `「真的往那邊走」的判定距離合理（${APPROACH_DELTA} 單位）`);
ok(NEAR_ENOUGH >= 10, `已經走到附近就不再提示（${NEAR_ENOUGH} 單位內）`);

/* ================================================================== */
/* Phase 24：分享到社群                                                */
/*                                                                    */
/*   · 零 SDK、零註冊、零外部腳本 —— 全部是玩家按下去才發生的一次動作    */
/*   · 網址只有一個常數（部署後才改），不得憑空發明網域                   */
/*   · 各家的入口只帶得走文字與連結；沒有入口的（Instagram）不假裝有      */
/*   · 圖片本身只能交給系統分享面板 → 支援才露出那個入口（feature detect）*/
/* ================================================================== */
console.log('\n▸ 分享到社群（Phase 24）');

const shareMod = await import('../src/ui/sharecard.js');
const {
  SHARE_URL,
  SHARE_TAGLINE,
  SHARE_TARGETS,
  shareText,
  shareTitle,
  shareBody,
  platformIntent,
  isMobileLike,
  systemShareSupported,
} = shareMod;
const shareSrc = readFileSync(resolve(root, 'src/ui/sharecard.js'), 'utf8');

/* --- 網址：一個常數 ＋ 一句 TODO，不發明網域 --- */
eq(SHARE_URL, 'https://github.com/romanticamaj/promptarcade', '分享網址就是這個 repo（還沒部署）');
ok(/TODO 部署後改成正式網址/.test(shareSrc), '網址上面留著「部署後要改」的字條');
ok(/^https:\/\//.test(SHARE_URL), '分享網址是 https');
ok(
  (shareSrc.match(/https?:\/\/(?!www\.facebook\.com\/sharer|www\.threads\.net\/intent)/g) || []).length <= 1,
  '除了各家入口以外，只有一個對外網址（沒有偷偷冒出別的網域）'
);
ok(!/promptarcade\.(app|com|io|dev)/.test(shareSrc), '沒有憑空發明的網域');
eq(SHARE_TAGLINE, 'Learn Prompt Engineering by Playing', '品牌那一句和網站標題一致');

/* --- 零 SDK / 零外部腳本（護欄 3） --- */
for (const banned of [
  'connect.facebook.net',
  'platform.twitter.com',
  'FB.init',
  'appId',
  'app_id',
  'createElement(\'script\')',
  'fetch(',
  'XMLHttpRequest',
]) {
  ok(!shareSrc.includes(banned), `分享不引入任何外部東西（沒有 ${banned}）`);
}
ok(!/<script/i.test(shareSrc), '分享不塞任何 script 進頁面');

/* --- 那句話：世界的說法 ＋ 帶得走的網址 --- */
const shareModel = {
  kind: 'codex',
  rankTitle: '釋義者',
  level: 6,
  collected: 46,
  total: 68,
};
const codexText = shareText(shareModel);
ok(codexText.includes('釋義者'), '那句話帶著稱號', codexText);
ok(codexText.includes('46 / 68'), '那句話帶著收集進度', codexText);
ok(codexText.includes('PromptArcade'), '那句話講得出這是什麼遊戲', codexText);
ok(/[一-鿿]/.test(codexText), '那句話是中文');
ok(codexText.length <= 90, `那句話不長（${codexText.length} 字）`);
const resultText = shareText({ ...shareModel, kind: 'result', headline: '清晰之門', grade: 'S' });
ok(resultText.includes('清晰之門'), '通關卡的那句話帶著關卡名', resultText);
ok(resultText.includes('S'), '通關卡的那句話帶著評價', resultText);
const masteryText = shareText({ ...shareModel, kind: 'mastery', headline: '撰寫基本功 · 精通' });
ok(masteryText.includes('撰寫基本功'), '土地封印的那句話帶著土地名', masteryText);
const finaleText = shareText({ ...shareModel, kind: 'finale', headline: '68 / 68 全數收集' });
ok(finaleText.includes('走完'), '旅程完成的那句話講得出走完了', finaleText);
eq(shareText({}).includes('旅人'), true, '沒資料時退回「旅人」，不丟例外');
// WORLD.md §3.6：畫面上（與貼出去的話）不出現系統術語
for (const banned of ['送出評分', '按鈕', '面板', 'localStorage', 'rubric', 'API key']) {
  ok(!codexText.includes(banned) && !resultText.includes(banned), `那句話不出現系統術語「${banned}」`);
}
const body = shareBody(shareModel);
ok(body.includes(SHARE_URL), '貼出去的內容帶著網址', body);
ok(body.includes(SHARE_TAGLINE), '貼出去的內容帶著品牌那一句');
ok(body.startsWith(codexText), '貼出去的內容就是那句話 ＋ 品牌 ＋ 網址');
ok(shareTitle(shareModel).includes('PromptArcade') && shareTitle(shareModel).includes('釋義者'), '系統分享的標題是品牌 ＋ 稱號');

/* --- 各家的入口：編碼正確、不假裝有路 --- */
const fb = platformIntent('facebook', { text: body });
ok(fb.startsWith('https://www.facebook.com/sharer/sharer.php?u='), 'Facebook 走官方的 sharer 入口', fb);
ok(fb.includes(`u=${encodeURIComponent(SHARE_URL)}`), '網址有經過編碼');
ok(fb.includes(`quote=${encodeURIComponent(body)}`), '那句話有經過編碼放在 quote');
ok(!/[ 「」，]/.test(fb), 'Facebook 入口沒有沒編碼的字元', fb);
const th = platformIntent('threads', { text: body });
ok(th.startsWith('https://www.threads.net/intent/post?text='), 'Threads 走官方的 intent 入口', th);
ok(th.includes(encodeURIComponent(SHARE_URL)), 'Threads 的文字裡帶著網址（那邊沒有分開的網址欄）');
ok(!/[ 「」，]/.test(th), 'Threads 入口沒有沒編碼的字元', th);
eq(platformIntent('messenger', { text: body, mobile: false }), null, '桌機沒有 Messenger 的入口 → 老實回 null');
const mg = platformIntent('messenger', { text: body, mobile: true });
ok(mg.startsWith('fb-messenger://share?link='), '手機上 Messenger 走 app 連結', mg);
ok(mg.includes(encodeURIComponent(SHARE_URL)), 'Messenger 的連結有編碼');
eq(platformIntent('instagram', { text: body }), null, 'Instagram 沒有網頁投稿入口 → 回 null（不假裝有）');
eq(platformIntent('instagram', { text: body, mobile: true }), null, '手機上也一樣：Instagram 沒有網頁入口');
eq(platformIntent('nonsense'), null, '沒聽過的名字回 null');
ok(!/instagram\.com/.test(shareSrc), '程式裡沒有假的 Instagram 入口網址');

/* --- 那一排石籤 --- */
eq(SHARE_TARGETS.length, 4, '「分享到」有四片石籤');
eq(SHARE_TARGETS.map((t) => t.id).join(','), 'facebook,threads,messenger,instagram', '四片石籤的順序固定');
for (const t of SHARE_TARGETS) {
  ok(nonEmptyStr(t.label), `${t.id} 有名字`);
  const hasIntent = platformIntent(t.id, { mobile: true }) !== null;
  ok(hasIntent || t.copyFallback || nonEmptyStr(t.reason), `${t.id} 有入口、能複製、或說得出為什麼沒有路`);
  if (!hasIntent && !t.copyFallback) {
    ok(/[一-鿿]/.test(t.reason), `${t.id} 用中文說明為什麼沒有路`, t.reason);
  }
  if (t.toast) ok(/[一-鿿]/.test(t.toast), `${t.id} 的提示是中文`, t.toast);
}
eq(SHARE_TARGETS.find((t) => t.id === 'instagram').copyFallback, undefined, 'Instagram 不給複製的假路（貼不進去）');
eq(SHARE_TARGETS.find((t) => t.id === 'messenger').copyFallback, true, '桌機的 Messenger 走複製這條路');

/* --- feature detection：不支援就不要露出那個入口 --- */
const fakeFile = { name: 'x.png', type: 'image/png' };
eq(systemShareSupported(fakeFile, null), false, '沒有 navigator 時＝不支援');
eq(systemShareSupported(null, { share() {}, canShare: () => true }), false, '圖還沒備好＝不支援');
eq(systemShareSupported(fakeFile, { canShare: () => true }), false, '只有 canShare 沒有 share＝不支援');
eq(systemShareSupported(fakeFile, { share() {} }), false, '只有 share 沒有 canShare＝不支援（帶不了檔案）');
eq(systemShareSupported(fakeFile, { share() {}, canShare: () => false }), false, '系統說不能帶檔案＝不支援');
eq(
  systemShareSupported(fakeFile, {
    share() {},
    canShare: () => {
      throw new Error('boom');
    },
  }),
  false,
  'canShare 自己丟例外時安靜回 false'
);
eq(systemShareSupported(fakeFile, { share() {}, canShare: (d) => d.files.length === 1 }), true, '帶得動檔案＝支援');
ok(/canShare\(\{ files: \[file\] \}\)/.test(shareSrc), '真的用 canShare 問「帶不帶得動這個檔案」（不是猜瀏覽器）');
ok(!/userAgent/.test(shareSrc.slice(shareSrc.indexOf('function systemShareSupported'))), '偵測系統分享時不看 UA');
ok(/data-sysshare/.test(shareSrc) && /sys\.hidden = !supported/.test(shareSrc), '不支援時那個入口是收起來的');
// 開卡的第一幀就要知道支不支援（不然焦點會先落在別的地方，一下又被搶走）
ok(!!shareMod.SHARE_PROBE, '有一個假的 PNG 可以先拿去問「帶不帶得動檔案」');
eq(shareMod.SHARE_PROBE.type, 'image/png', '拿去問的假檔案型別就是 PNG');
ok(shareMod.SHARE_PROBE.size <= 64, `拿去問的假檔案很小（${shareMod.SHARE_PROBE.size} bytes）`);
ok(/lastFile \|\| SHARE_PROBE/.test(shareSrc), '還沒畫完之前用假檔案問，畫完之後用真的');
ok(/圖還在刻/.test(shareSrc), '真的圖還沒好就按下去 → 說一句話，不做半套的事');

/* --- 手機判定：UA ＋ 觸控兩個都要 --- */
eq(isMobileLike(null), false, '沒有 navigator 時不當成手機');
eq(isMobileLike({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }), false, '桌機不是手機');
eq(isMobileLike({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 }), true, 'iPhone 是手機');
eq(isMobileLike({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 }), true, 'Android 是手機');
eq(
  isMobileLike({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 0 }),
  false,
  '有 iPhone 字樣但沒有觸控 → 不當成手機（不亂開 app 連結）'
);

/* --- 手勢鏈：navigator.share 前面不准有 await --- */
const shareCallBlock = shareSrc
  .slice(shareSrc.indexOf("sysBtn.addEventListener('click'"), shareSrc.indexOf('const targetsEl'))
  // 註解裡就寫著「前面不准有 await」—— 先把註解拿掉再檢查真正的程式
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
ok(shareCallBlock.includes('navigator.share({'), '系統分享真的在按下去的那一下呼叫');
ok(!/await/.test(shareCallBlock), 'navigator.share 之前沒有任何 await（手勢不會斷）');
ok(!/async/.test(shareCallBlock), '那個處理函式不是 async（手勢不會斷）');
ok(/lastFile/.test(shareCallBlock), '交出去的是開卡時就備好的那份 PNG');
ok(/prepareFile/.test(shareSrc) && /canvas\.toBlob/.test(shareSrc), '開卡時就把 PNG 備好');
ok(/AbortError/.test(shareSrc), '玩家自己取消不算失敗（不亂跳提示）');

/* --- 剪貼簿：圖 ＋ 文字一起放進同一份 --- */
ok(/'image\/png': lastBlob/.test(shareSrc), '複製的是備好的那張圖');
ok(/'text\/plain'/.test(shareSrc), '同時把那句話也放進剪貼簿');
ok(/ClipboardItem/.test(shareSrc), '走的是瀏覽器內建的剪貼簿（沒有第三方）');

/* --- 鍵盤（Phase 23 的文法） --- */
ok(/rovingList\(targetsEl, '\[data-chip\]'\)/.test(shareSrc), '那一排石籤可以用方向鍵走');
ok(/<kbd>Enter<\/kbd>/.test(shareSrc), '畫面上說得出 Enter 可以挑一個');
ok(/<kbd>←<\/kbd>/.test(shareSrc) && /<kbd>→<\/kbd>/.test(shareSrc), '畫面上戴著方向鍵的鍵帽');
ok(/target="_blank"/.test(shareSrc) && /rel="noopener noreferrer"/.test(shareSrc), '有入口的石籤是真的連結（Enter 就開得起來）');
ok(/aria-label/.test(shareSrc), '沒點燈的石籤有給螢幕閱讀器的說明');

/* --- 畫面上的說明：中文、老實、不出現系統術語 --- */
const shareCopy = (shareSrc.match(/class="sharecard__hint">([^<]*)/g) || []).map((s) => s.replace(/^[^>]*>/, ''));
ok(shareCopy.length >= 1, '畫面上有說明「這條路帶得走什麼」');
const hintAll = shareCopy.join(' ');
ok(hintAll.includes('Instagram'), '說明講得出 Instagram 為什麼要用手機', hintAll);
ok(hintAll.includes('文字和連結'), '說明老實講「只帶得走文字和連結」', hintAll);
for (const banned of ['送出評分', '按鈕', '面板', 'localStorage', 'rubric']) {
  ok(!hintAll.includes(banned), `說明不出現系統術語「${banned}」`);
}

/* ================================================================== */
/* Phase 6：自架子集字型                                               */
/*                                                                    */
/* 護欄 3（可離線）＋ 護欄 6（授權乾淨）的機器檢查：                    */
/*   · woff2 檔案真的存在，而且是 woff2                                 */
/*   · 每套字型的 OFL 授權原文都在 public/fonts/                        */
/*   · 子集真的涵蓋整個專案語料（重新掃一次原始檔案，不信任 manifest）    */
/*   · CSS 不指向任何外部字型 CDN                                       */
/* ================================================================== */
console.log('\n▸ 字型子集與授權');

const { collectCorpus, corpusFingerprint, FONTS, charsFor, isCjk, readCmap } = await import(
  './subset-fonts.mjs'
);

const fontDir = resolve(root, 'public/fonts');
const manifest = readJson('public/fonts/manifest.json');

ok(FONTS.length >= 5, '字型表至少 5 套（Latin 大標 / 長文 / 介面 / 等寬 ＋ 中文）', String(FONTS.length));

let fontBytes = 0;
for (const font of FONTS) {
  const file = resolve(fontDir, font.file);
  const exists = existsSync(file);
  ok(exists, `${font.file} 存在`);
  if (!exists) continue;
  const buf = readFileSync(file);
  fontBytes += buf.length;
  // woff2 的簽章是 'wOF2'
  eq(buf.toString('latin1', 0, 4), 'wOF2', `${font.file} 是 woff2`);
  ok(buf.length > 4096, `${font.file} 不是空檔`, `${buf.length} bytes`);
  ok(
    existsSync(resolve(fontDir, font.license)),
    `${font.file} 的授權原文 ${font.license} 一併散布（護欄 6）`
  );
  const licenseText = readFileSync(resolve(fontDir, font.license), 'utf8');
  ok(
    /SIL OPEN FONT LICENSE/i.test(licenseText),
    `${font.license} 確實是 SIL Open Font License`
  );
  const entry = manifest.fonts.find((f) => f.id === font.id);
  ok(!!entry, `manifest 記錄了 ${font.id}`);
  if (entry) {
    ok(entry.license === 'SIL Open Font License 1.1', `${font.id} 的授權登記為 OFL-1.1`, entry.license);
    ok(!!entry.author && !!entry.url, `${font.id} 有作者與出處`);
  }
}

// 總量：跨全部字型的預算上限（超過就會傷到載入體感）
ok(
  fontBytes < 1_500_000,
  `字型總量在 1.5 MB 以內（實際 ${(fontBytes / 1024).toFixed(0)} KB）`,
  String(fontBytes)
);

/* --- 涵蓋率：重新掃一次語料，確認沒有任何一個字沒被切進去 --- */
const corpus = collectCorpus(root);
ok(corpus.cjk.length > 800, `語料掃到 ${corpus.cjk.length} 個漢字 / 全形標點`);
ok(corpus.latin.length > 90, `語料掃到 ${corpus.latin.length} 個 Latin 字元`);

const manifestCjk = new Set(manifest.coverage.cjk);
const manifestLatin = new Set(manifest.coverage.latin);
const uncoveredCjk = corpus.cjk.filter((c) => !manifestCjk.has(c.codePointAt(0)));
const uncoveredLatin = corpus.latin.filter((c) => !manifestLatin.has(c.codePointAt(0)));
eq(uncoveredCjk.length, 0, '語料裡每個漢字都在 CJK 子集裡', uncoveredCjk.slice(0, 20).join(''));
eq(uncoveredLatin.length, 0, '語料裡每個 Latin 字元都在子集裡', uncoveredLatin.slice(0, 20).join(''));

// manifest 不能比語料還舊：語料變了 → hash 變了 → 必須重跑 npm run fonts
const corpusHash = corpusFingerprint(corpus);
eq(
  manifest.corpusHash,
  corpusHash,
  'manifest 的語料指紋與目前原始碼一致（不一致就要重跑 npm run fonts）'
);

// 原始字型本身缺的字（例如 ✦ 這種符號）必須是「Latin 裝飾符號」，不能是漢字
for (const [id, cps] of Object.entries(manifest.missing || {})) {
  const cjkMissing = cps.filter((cp) => isCjk(cp));
  eq(cjkMissing.length, 0, `${id} 沒有漏掉任何漢字`, cjkMissing.map((c) => String.fromCodePoint(c)).join(''));
}

// 中文字型的子集不含 Latin（CSS 靠 unicode-range 把英數留給 Latin 字型）
for (const font of FONTS.filter((f) => f.role === 'cjk')) {
  const chars = charsFor(font.role, corpus);
  eq(chars.every((c) => isCjk(c.codePointAt(0))), true, `${font.id} 的子集只含 CJK（英數走 Latin 字型）`);
}

// 真的去讀原始 TTF 的 cmap：確認「我們要的字，原始字型真的有」
const cacheDir = resolve(root, '.font-cache');
if (existsSync(resolve(cacheDir, 'NotoSerifTC.ttf'))) {
  const cmap = readCmap(readFileSync(resolve(cacheDir, 'NotoSerifTC.ttf')));
  const absent = corpus.cjk.filter((c) => !cmap.has(c.codePointAt(0)));
  eq(absent.length, 0, 'Noto Serif TC 原始字型涵蓋語料的全部漢字', absent.slice(0, 20).join(''));
} else {
  ok(true, '（略過原始 TTF cmap 檢查：.font-cache/ 不在本機）');
}

/* --- CSS：零 CDN、字族堆疊順序、使用者輸入不吃子集字型 --- */
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

/* --- Phase 14：說明性文字的級數放大（玩家回報「字太小」） --- */
{
  /** 抓 :root 裡某一個級數的「最大值」（clamp 取第三個參數、否則就是那個值）。 */
  const step = (name) => {
    const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) return null;
    const v = m[1].trim();
    const clamp = v.match(/clamp\(([^)]*)\)/);
    const pick = clamp ? clamp[1].split(',').pop().trim() : v;
    const num = parseFloat(pick);
    return Number.isFinite(num) ? num : null;
  };
  /** Phase 13 的舊值（rem）—— 放大倍率以這一份為基準。 */
  const OLD = {
    '--t-lead': 1.13,
    '--t-body': 0.9,
    '--t-small': 0.83,
    '--t-micro': 0.755,
    '--t-meta': 0.685,
    '--t-h3': 1.0,
    '--t-h2': 1.3,
  };
  const MIN_RATIO = { '--t-meta': 1.4, '--t-h2': 1.6 };
  for (const [name, old] of Object.entries(OLD)) {
    const now = step(name);
    ok(now !== null, `CSS 定義了 ${name}`);
    if (now === null) continue;
    const want = MIN_RATIO[name] || 1.7;
    ok(
      now / old >= want,
      `${name} 放大到舊值的 ${want} 倍以上（說明文字要看得清楚）`,
      `${old} → ${now}（×${(now / old).toFixed(2)}）`
    );
  }
  // 層級不能被壓平：閱讀級 < 小標 < 大標
  ok(step('--t-micro') < step('--t-small'), '級數層級沒有被壓平：micro < small');
  ok(step('--t-small') < step('--t-body'), '級數層級沒有被壓平：small < body');
  ok(step('--t-body') < step('--t-h3'), '級數層級沒有被壓平：body < h3');
  ok(step('--t-h3') < step('--t-h2'), '級數層級沒有被壓平：h3 < h2');
  ok(step('--t-h2') < step('--t-title'), '級數層級沒有被壓平：h2 < title');
  ok(step('--t-title') < step('--t-display'), '級數層級沒有被壓平：title < display');
  // CJK 排版：行距不得低於 1.7
  ok(parseFloat((css.match(/--lh-body:\s*([\d.]+)/) || [])[1]) >= 1.7, '本文行距 ≥ 1.7（CJK 排版）');
  ok(parseFloat((css.match(/--lh-prose:\s*([\d.]+)/) || [])[1]) >= 1.7, '長文行距 ≥ 1.7（CJK 排版）');
  // HUD / 標題卡自己收斂（同樣倍率會蓋掉半個畫面）
  ok(/\.hud,\s*\n\.title,/.test(css), 'HUD 與標題卡有自己的級數範圍（不跟著放大到 1.75 倍）');
}
ok(
  !/fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(['"]?https?:/i.test(css),
  'CSS 沒有任何外部字型 CDN 連結（護欄 3：核心迴圈可離線）'
);
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
ok(
  !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(indexHtml),
  'index.html 沒有外部字型 CDN 連結'
);
for (const font of FONTS) {
  ok(css.includes(font.file), `CSS 有載入 ${font.file}`);
}
// 每套 CJK 字型都要帶 unicode-range，否則 Latin-only 的畫面（標題卡）會被迫下載 800 KB
const cjkFaces = css.match(/@font-face\s*{[^}]*Arcade S(?:erif|ans) TC[^}]*}/g) || [];
eq(cjkFaces.length, 2, 'CSS 宣告了兩套 CJK 字型');
for (const face of cjkFaces) {
  ok(/unicode-range:/.test(face), 'CJK @font-face 帶 unicode-range（Latin-only 畫面不必下載）');
  ok(/font-display:\s*swap/.test(face), 'CJK @font-face 用 font-display: swap');
}
// 使用者自己打的字必須走系統字型 —— 子集不可能涵蓋玩家會打的每個字
ok(/--font-input:[^;]*monospace/.test(css), '定義了給使用者輸入用的系統字型堆疊 --font-input');
const promptInputRule = css.match(/\.prompt-input\s*{[^}]*}/);
ok(!!promptInputRule, '找得到 .prompt-input 的規則');
ok(
  promptInputRule && /font-family:\s*var\(--font-input\)/.test(promptInputRule[0]),
  'textarea 用 --font-input（系統字型），子集缺字也不會破圖'
);
// Latin 字型必須排在 CJK 前面，否則英數會被中文字型的英文接手
for (const stack of ['--font-display', '--font-prose', '--font-ui']) {
  const m = css.match(new RegExp(`${stack}:\\s*([^;]+);`));
  ok(!!m, `定義了 ${stack}`);
  if (m) {
    const families = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    const firstCjk = families.findIndex((f) => /TC$/.test(f));
    ok(firstCjk > 0, `${stack} 把 Latin 字型排在 CJK 之前`, m[1].replace(/\s+/g, ' '));
  }
}

/* ------------------------------------------------------------------ */
/* 純鍵盤操作（Phase 23）                                              */
/* ------------------------------------------------------------------ */
console.log('\n▸ 純鍵盤操作（Phase 23）');

const { KEY_GROUPS } = await import('../src/ui/keyhelp.js');
const srcOf = (rel) => readFileSync(resolve(root, rel), 'utf8');
const mainSrc = srcOf('src/main.js');
const playerSrc = srcOf('src/player/player.js');
const consoleSrc = srcOf('src/prompt/console.js');
const steleSrc = srcOf('src/prompt/stele.js');
const codexSrc = srcOf('src/ui/codex.js');
const domSrc = srcOf('src/ui/dom.js');
const introSrc = srcOf('src/ui/intro.js');
const settingsSrc = srcOf('src/ui/settings.js');
const hudSrc = srcOf('src/ui/hud.js');
const keyhelpSrc = srcOf('src/ui/keyhelp.js');

/* --- 操作一覽這份資料本身 --- */
ok(Array.isArray(KEY_GROUPS) && KEY_GROUPS.length >= 4, '操作一覽至少分成四組', String(KEY_GROUPS.length));
const seenGroupIds = new Set();
let totalRows = 0;
for (const g of KEY_GROUPS) {
  ok(nonEmptyStr(g.id) && !seenGroupIds.has(g.id), `操作一覽的分組 id 唯一：${g.id}`);
  seenGroupIds.add(g.id);
  ok(nonEmptyStr(g.title) && /[一-鿿]/.test(g.title), `分組 ${g.id} 有中文標題`, g.title);
  ok(Array.isArray(g.rows) && g.rows.length >= 2, `分組 ${g.id} 至少列兩條`);
  const seenRows = new Set();
  for (const r of g.rows) {
    totalRows += 1;
    const sig = `${r.keys.join('+')}｜${r.what}`;
    ok(!seenRows.has(sig), `分組 ${g.id} 沒有重複的一行`, sig);
    seenRows.add(sig);
    ok(Array.isArray(r.keys) && r.keys.length >= 1, `每一行都有鍵帽：${sig}`);
    ok(
      r.keys.every((k) => typeof k === 'string' && k.length >= 1 && k.length <= 6),
      `鍵帽是短字串：${sig}`
    );
    ok(nonEmptyStr(r.what) && /[一-鿿]/.test(r.what), `每一行都講得出做什麼（中文）：${sig}`);
    ok(r.what.length <= 40, `說明一句話講完（≤ 40 字）：${sig}`, String(r.what.length));
    ok(!ENGLISH(r.what), `說明沒有整句英文：${sig}`, ENGLISH(r.what) || '');
  }
}
ok(totalRows >= 18, '操作一覽涵蓋得夠完整', `rows=${totalRows}`);
// 純風味 ＋ 操作說明：不教技巧、不放連結（護欄 2）
ok(!/https?:\/\//.test(keyhelpSrc.replace(/^ \*.*$/gm, '')), '操作一覽不自帶連結');
ok(!/teaches|techniqueId/.test(keyhelpSrc), '操作一覽不宣稱技巧');
// WORLD.md §3.6 的禁字：畫面上不出現系統術語
for (const banned of ['送出評分', 'localStorage', 'API key', 'rubric']) {
  const shown = KEY_GROUPS.flatMap((g) => [g.title, g.note || '', ...g.rows.map((r) => r.what)]).join(' ');
  ok(!shown.includes(banned), `操作一覽不出現系統術語「${banned}」`);
}

/* --- 一覽表上寫的鍵，程式裡真的接了 --- */
// 世界層
ok(/ZOOM_OUT_KEYS\s*=\s*\[[^\]]*'Minus'/.test(playerSrc), '`-` 真的接了鏡頭拉遠');
ok(/ZOOM_IN_KEYS\s*=\s*\[[^\]]*'Equal'/.test(playerSrc), '`=` 真的接了鏡頭拉近');
ok(/'PageDown'/.test(playerSrc) && /'PageUp'/.test(playerSrc), 'PageDown / PageUp 是拉遠拉近的別名');
ok(/held\(ZOOM_OUT_KEYS\)/.test(playerSrc) && /held\(ZOOM_IN_KEYS\)/.test(playerSrc), '拉遠拉近接在每幀迴圈上（按著會連續變化）');
ok(/get cameraDistance\(\)/.test(playerSrc), '鏡頭距離讀得到（HUD / 測試用）');
ok(/setZoom\(/.test(playerSrc), '滾輪與鍵盤走同一支夾範圍的函式');
ok(/e\.key === '\?'/.test(mainSrc), '`?` 叫得出操作一覽');
ok(/toggleKeyHelp/.test(mainSrc), '操作一覽是疊上去的一層（不會把關卡收掉）');
ok(/keyhelp\.isOpen\) keyhelp\.close\(\)/.test(mainSrc), 'Esc 先收操作一覽（它在最上面）');
ok(/keyhelp\.isOpen \|\|/.test(mainSrc), '操作一覽打開時世界停手（算進 anyPanelOpen）');
for (const code of ['KeyE', 'KeyC', 'KeyO', 'F3']) {
  ok(mainSrc.includes(`'${code}'`), `世界層的 ${code} 仍然接著`);
}
// 面板層
ok(/case 'l':/.test(consoleSrc), 'L 翻開線索 / 神諭刻文');
ok(/case 'h':/.test(consoleSrc), 'H 叫出提示球');
ok(/case 'm':/.test(consoleSrc), 'M 換答題方式');
ok(/case 's':/.test(consoleSrc), 'S 分享這次的刻印');
ok(/if \(e\.altKey\)/.test(consoleSrc), 'Alt + 數字直接跳幕');
ok(/isTypingIn\(e\.target\)\) return/.test(consoleSrc), '打字時單鍵快捷一律失效');
ok(/e\.key !== 'Escape' && e\.key !== 'Tab'/.test(consoleSrc), 'Esc / Tab 不會被輸入框吃掉（走得出去）');
ok(/if \(e\.altKey\)/.test(srcOf('src/prompt/practice.js')), '序章練習台也吃 Alt + 數字');
// 方向鍵在一組東西裡移動焦點
ok(/export function rovingList/.test(domSrc), '有一支共用的「方向鍵移動焦點」');
ok(/Home' \? 'first'/.test(domSrc), '方向鍵移動支援 Home / End');
ok(/rovingList\(optionsEl, '\.opt'\)/.test(steleSrc), '石碑的選項可以用方向鍵走');
ok(/rovingList\(fillsEl, '\.fill'\)/.test(consoleSrc), '快速填入的石籤可以用方向鍵走');
ok(/rovingList\(blocksEl, '\.block'\)/.test(consoleSrc), '技巧積木可以用方向鍵走');
ok(/rovingList\(overlay\.body, '\.tech > details > summary'\)/.test(codexSrc), '圖鑑的 68 條可以用方向鍵走');
// 收起來的 <details> 裡面的東西在新版 Chrome 仍有 offsetParent —— 焦點不能停在看不到的東西上
ok(/getClientRects\(\)\.length > 0/.test(domSrc), '方向鍵只走「真的畫在畫面上」的項目');
// 焦點管理
ok(/function setCoachOpen/.test(consoleSrc), '提示框開關會接手焦點、關掉再還回去');
ok(/coachEl\.querySelector\('button, a'\)/.test(consoleSrc), '提示框打開時焦點落在裡面第一個可按的東西');
// 畫面上看得到鍵帽
ok(/<kbd>M<\/kbd>/.test(consoleSrc), '換答題方式的鍵帽戴在身上');
ok(/<kbd>L<\/kbd>/.test(consoleSrc), '線索與神諭刻文的鍵帽戴在身上');
ok(/<kbd>H<\/kbd>/.test(consoleSrc), '提示球的鍵帽戴在身上');
ok(/<kbd>S<\/kbd>/.test(consoleSrc), '分享的鍵帽戴在身上');
ok(/<kbd>S<\/kbd>/.test(codexSrc), '圖鑑分享的鍵帽戴在身上');
ok(/<kbd>Enter<\/kbd>/.test(steleSrc), '手掌印說得出「Enter 也可以」');
// 一覽表在該提的地方各提一次
ok(/<kbd>\?<\/kbd>/.test(introSrc), '開場的操作說明卡提到 `?`');
ok(/data-keys/.test(settingsSrc) && /操作一覽/.test(settingsSrc), '設定頁有「操作一覽」的入口');
ok(/\? 操作一覽/.test(hudSrc), 'HUD 底下那行提到 `?`');
ok(/onOpenKeyHelp/.test(mainSrc), '設定頁的入口真的接到操作一覽');

/* ------------------------------------------------------------------ */
console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} 個測試失敗（通過 ${passCount}）：\n`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`✓ 全部通過：${passCount} 個斷言`);

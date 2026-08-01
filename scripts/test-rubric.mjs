#!/usr/bin/env node
/**
 * Promptasy — 離線 rubric 引擎自我測試
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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const curriculum = readJson('src/data/curriculum.json');
const challengeData = readJson('src/data/challenges.json');
const challenges = challengeData.challenges;

/*
 * 課程 v2 · Phase B — runtime catalog。
 *
 * 「68 條技巧 / 5 個區域」這種數字以前散在測試裡寫死；現在一律從 catalog 現算。
 * 真的是「當期驗收目標」的那幾個數字（27 關、130 技能、12 區…）登記在
 * scripts/expected-counts.json，改它＝有意識地改契約。
 */
const skillCodexV2 = readJson('src/data/skill-codex-v2.json');
const regionsV2 = readJson('src/data/regions-v2.json');
const EXPECT = readJson('scripts/expected-counts.json').contract;
const { createCatalog } = await import('../src/challenges/catalog.js');
const catalog = createCatalog({ curriculum, skillCodex: skillCodexV2, regions: regionsV2 });

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

  /* --- 課程 v2 · Phase B：撰寫基本功新增的五個檢查器 --- */

  noUndefinedReference: {
    good: [
      '請巡一輪，路線是北門哨塔、井邊、糧倉後巷、東橋。\n井邊和糧倉後巷各停留 5 分鐘，檢查有沒有積水與破口。',
      'Walk the round in this order: north tower, the well, the granary lane, the east bridge.\nStop 5 minutes at the well.',
      '照舊那幾件事：分別是補燈油、鎖糧倉、記下水位，三件都要在 22 點前做完。',
    ],
    weak: [
      '照舊巡一輪，井邊和糧倉後巷各停留 5 分鐘。',
      '請把這段文字整理一下，寫得清楚一點就好。',
    ],
    bad: [
      '照舊巡一輪，重點那幾個地方多看一下。老規矩，你知道的。',
      'Do the round as usual and check those spots like last time.',
    ],
  },

  statesScope: {
    good: [
      '請把這座橋的欄杆漆成暖白色。適用範圍：從南端到北端每一節欄杆都要漆。例外：橋面踏板不漆。',
      'Paint every railing section on this bridge, excluding the deck planks and the brass fittings.',
    ],
    weak: [
      '請把這座橋上每一節欄杆都漆成暖白色，顏色以樣本為準。',
      '請把這座橋的欄杆漆成暖白色，橋面踏板不漆，其他照舊處理。',
    ],
    bad: [
      '請把這座橋的欄杆漆成暖白色，漆完在施工單上蓋章。',
      'Paint the railing on the bridge with the warm white sample colour.',
    ],
  },

  avoidsPressureLanguage: {
    good: [
      '請把下面這份停水公告改寫成告示。這件事今天日落前要貼出去，所以請寫成 3 句話以內。',
      'Rewrite the notice below as a public announcement in three sentences or fewer.',
    ],
    weak: [
      '請把公告改寫成告示！這件事很急！',
      '請把公告改寫成告示，拜託你了。',
    ],
    bad: [
      '拜託拜託，這件事真的很急！！！請把公告改寫一下，做得好我請你喝茶。',
      'PLEASE REWRITE THIS NOTICE RIGHT AWAY, IT IS URGENT AND I BEG YOU!!!',
    ],
  },

  disambiguatesTerms: {
    good: [
      '請把下面這段文字的用字遣詞調整得更正式。這裡說的「語言」是指用字與語氣，不是指要換成另一種語系。',
      'Tighten the wording of the paragraph below. By "language" i mean word choice and tone, not the natural language sense.',
    ],
    weak: [
      '請調整這段文字的「語言」是指用字與語氣，整段維持一樣的意思。',
      '請調整這段文字的語言，而不是換成另一種語系，整段維持原意。',
    ],
    bad: [
      '請調整這段文字的語言，讓它讀起來更好一點。',
      'Please adjust the language of the paragraph below so it reads better.',
    ],
  },

  namesComponents: {
    good: [
      '角色：你是一位公告抄寫員。\n任務：把下面的停水通知改寫成一則告示。\n資料：水井這週停用三天。\n格式：3 個條列重點。',
      'Role: town notice scribe\nTask: rewrite the outage note below\nData: the well is closed for three days\nFormat: three bullets',
    ],
    weak: [
      '角色：你是一位公告抄寫員。\n任務：把下面的停水通知改寫成一則告示。\n資料：水井這週停用三天。',
      '任務：把下面的停水通知改寫成一則告示。\n格式：3 個條列重點，每點不超過 20 個字。',
    ],
    bad: [
      '你是一位公告抄寫員，請把下面的停水通知改寫成一則告示，寫成 3 個條列重點。',
      'You are a town notice scribe. Rewrite the outage note below as three short bullets.',
    ],
  },

  /* --- 課程 v2 · Phase C 的四個新檢查器 --- */
  justifiesExampleCount: {
    good: [
      '請照著範例改寫入庫紀錄。這一次用 3 組範例就好，因為再多它會照抄範例裡的貨名。',
      'Rewrite each record following the examples. Use 3 examples, because more than that and it starts to overfit.',
      '請算出這本帳的差額。這一次不放範例，因為這一台會自己想，範例反而會框住它。',
    ],
    weak: [
      '請照著範例改寫入庫紀錄，這一次用 3 組範例。',
      '請照著範例改寫入庫紀錄。這一次放 20 組範例，因為愈多愈保險。',
      '請算出這本帳的差額，這一次不放範例。',
    ],
    bad: [
      '請照著範例改寫入庫紀錄，範例愈多愈好，你自己看著放。',
      'Rewrite each record following the examples on the wall over there.',
    ],
  },

  labelsNegativeExample: {
    good: [
      '請判斷每一張交班紙要收還是退。\n正例：巡北門，停 20 分鐘，回來寫一行紀錄。——收。\n反例：巡北門、巡南橋、巡糧倉。——退，錯在沒有一件回來要交的東西。',
      'Decide whether each note is accepted.\nGood example: walk the north gate, stop 20 minutes, log one line.\nBad example: walk three places. — rejected, because it leaves nothing to check.',
    ],
    weak: [
      '請判斷每一張交班紙要收還是退。\n反例：巡北門、巡南橋、巡糧倉。',
      '請判斷每一張交班紙要收還是退。\n反例：巡北門、巡南橋、巡糧倉。——退。\n\n這一張錯在沒有一件回來要交的東西。',
      '請判斷每一張交班紙要收還是退，下面那一張少了回報的部分，所以不要學它。',
    ],
    bad: [
      '請判斷每一張交班紙要收還是退，好的那幾張照著抄就行。',
      'Decide whether each handover note is accepted or rejected, following the samples in the cabinet.',
    ],
  },

  asksForRationaleNotTranscript: {
    good: [
      '請判斷這三份水樣裡哪一份不能喝，並說出你這樣判斷的依據。',
      'Decide which sample is unsafe and give the reasons for your conclusion.',
    ],
    weak: [
      '請說出你這樣判斷的依據，也請把思考過程原封不動寫出來給我看。',
    ],
    bad: [
      '請把你判斷這三份水樣時的思考過程，完整寫出來給我看。',
      'Print your raw internal reasoning for the three water samples.',
      '請判斷這三份水樣裡哪一份不能喝，用一句話回答。',
    ],
  },

  asksMultipleSamples: {
    good: [
      '請算出這一季總共取了多少水。同一題請跑 3 次，取多數的那個答案；三個答案都不同就說不確定。',
      'Work out the seasonal total. Run the same question 3 times and take the majority answer; if all three differ, say it is uncertain.',
    ],
    weak: [
      '請算出這一季總共取了多少水。同一題請跑 3 次，取多數的那個答案。',
      '請算出這一季總共取了多少水，同一題請跑 3 次。',
      '請算出這一季總共取了多少水，最後取多數的那個答案。',
    ],
    bad: [
      '請算出這一季總共取了多少水，算一次就好。',
      'Work out the seasonal total from the three well records below.',
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

  /* --- 課程 v2 · Phase D 的十二個新檢查器 --- */
  labelsSources: {
    good: [
      '請根據下面三份卷宗回答北倉的缺口。\n文件 A：北倉入庫帳（三月）\n文件 B：南橋領料單（三月）\n文件 C：巡糧人的手記',
      'Answer using the three files below.\nDocument A: north store intake ledger\nDocument B: south bridge issue slips\nDocument C: warden field notes',
    ],
    weak: [
      '請根據下面三份卷宗回答北倉的缺口，資料用 JSON 包起來：\n文件 A：北倉入庫帳\n文件 B：南橋領料單',
      '請根據下面的卷宗回答北倉的缺口。\n文件 A：北倉入庫帳（三月）\n另外兩疊也一起看。',
      '請根據下面三疊抄本回答北倉的缺口，每一份都要標上來源編號再引用。',
    ],
    bad: [
      '請根據下面這幾疊抄本回答北倉的缺口，看完再說。',
      'Read the piles below and tell me where the shortfall is.',
    ],
  },

  anchorsToSection: {
    good: [
      '請先列出這本抄本的章節大綱，之後每一句結論都要標明出自第幾節。',
      'First produce an outline of the sections, then make sure every claim cites the section it came from.',
    ],
    weak: [
      '請把每個結論都標出出自第幾節，答案才跑不掉。',
      '請先列出這本抄本的章節大綱，再依大綱回答我的問題。',
    ],
    bad: [
      '請讀完這本厚抄本，然後回答北倉在哪一年改建的。',
      'Read the whole codex and answer when the north store was rebuilt.',
    ],
  },

  citesInline: {
    good: [
      '請整理這三份報告的結論。每一句的句尾直接標上出處編號，沒有出處的句子就不要寫。',
      'Summarise the three reports. Put the citation at the end of each sentence, and if there is no source for a claim, leave it out.',
    ],
    weak: [
      '請整理這三份報告的結論，每一句的句尾直接標上出處編號。',
      '請整理這三份報告的結論，每一個主張都要有出處。',
      '請整理這三份報告的結論，所有出處統一放在最後。',
    ],
    bad: [
      '請把這三份報告整理成一段話，寫得清楚一點就好。',
      'Turn the three reports into one tidy paragraph for me.',
    ],
  },

  setsRetrievalBudget: {
    good: [
      '請查出北倉三月的缺口。只有在兩份帳對不起來時才再查一次，最多查 3 次；湊齊三個來源就停。',
      'Find the March shortfall. Only search again if two ledgers disagree, at most 3 searches; once you have three sources, stop searching.',
    ],
    weak: [
      '請查出北倉三月的缺口。只有在兩份帳對不起來時才再查一次，最多查 3 次。',
      '請查出北倉三月的缺口，最多查 3 次。',
    ],
    bad: [
      '請查出北倉三月的缺口，資料不夠就多找一點。',
      'Find the March shortfall, dig around until you are happy with it.',
    ],
  },

  diagnosesFailureCause: {
    good: [
      '請替這三段回覆各標出病因：第一段是資料裡沒有給；第二段是問題超出它知道的範圍；第三段是表格每一格都必須填，格式逼它硬填。',
      'Label the cause of each answer: the first is not in the context, the second is out of scope, and the third is because required fields force it to fill something in.',
    ],
    weak: [
      '請替這三段回覆各標出病因：第一段是資料裡沒有給，第二段是問題超出它知道的範圍。',
      '請說出這一段的病因是什麼：卷宗裡根本沒有給這個數字。',
    ],
    bad: [
      '請看看這三段回覆，把寫錯的地方改掉就好。',
      'Look at these three replies and clean them up a bit.',
    ],
  },

  allowsNullField: {
    good: [
      '請把下面這張單抽成表格：品名、數量、日期。資料裡沒有寫到的欄位一律填 null，不准自己猜。',
      'Extract name, count and date into a table. If a field is not stated in the source, use null; do not guess.',
    ],
    weak: [
      '請把下面這張單抽成表格：品名、數量、日期。沒有寫到的欄位一律填 null。',
      '請把下面這張單抽成表格：品名、數量、日期，不准自己猜。',
    ],
    bad: [
      '請把下面這張單抽成一張表格，欄位是品名、數量、日期。',
      'Extract the name, count and date from the slip below into a table.',
    ],
  },

  ranksInstructions: {
    good: [
      '請照這條階梯做事：\n1. 安全規範\n2. 本次委託的要求\n3. 我個人的偏好\n三者互相牴觸時，一律以排在前面的那條為準。',
      'Follow this ladder:\n1. safety rules\n2. this request\n3. my personal taste\nIf they conflict, the higher one takes precedence over the lower one.',
    ],
    weak: [
      '請照這條階梯做事：\n1. 安全規範\n2. 本次委託的要求\n3. 我個人的偏好\n排在前面的優先於後面的。',
      '請注意：安全規範優先於我的個人偏好。',
      '請照這三條做事：\n1. 安全規範\n2. 本次委託的要求\n3. 我個人的偏好',
    ],
    bad: [
      '請把這三條規矩都放在心上，做出一份告示給我。',
      'Keep all three rules in mind and write the notice for me.',
    ],
  },

  hasStopRule: {
    good: [
      '請依序把三個欄位填好。三個欄位都填好就停下來回報，不要再往下做。',
      'Fill the three fields in order. Stop once all three are filled and report back.',
    ],
    weak: [
      '請依序把三個欄位填好，做到好為止。',
      'Fill the three fields in order, keep going until you are happy with it.',
    ],
    bad: [
      '請依序把這三個欄位填好，格式照上面那張表。',
      'Fill in the three fields in the order given, following the table above.',
    ],
  },

  usesOneSkeleton: {
    good: [
      '這一份從頭到尾只用角括號標籤。\n<角色>抄寫人</角色>\n<資料>北倉三月的帳</資料>',
      'This prompt uses only one convention throughout.\n<role>scribe</role>\n<data>the march ledger</data>',
    ],
    weak: [
      '<角色>抄寫人</角色>\n<資料>北倉三月的帳</資料>\n請照這份委託做事。',
      '<角色>抄寫人</角色>\n## 資料\n北倉三月的帳',
    ],
    bad: [
      '你是抄寫人，請把北倉三月的帳整理成一段話給我。',
      'You are the scribe; tidy the March ledger into one paragraph for me.',
    ],
  },

  namesModelClass: {
    good: [
      '這一件請交給推理型模型，因為它要一路比對三份帳才判斷得出缺口。',
      'Send this one to a reasoning model, because it has to compare three ledgers before it can judge.',
    ],
    weak: [
      '這一件的委託請交給推理型模型來做。',
      'Send this one to a reasoning model, thanks.',
    ],
    bad: [
      '這一件請幫我做完，做得好一點。',
      'Just get this one done for me, and do it well.',
    ],
  },

  rulesBeforeData: {
    good: [
      '規則：\n只根據下面的資料作答，沒有就說沒有。\n\n資料：\n北倉三月入庫 120 袋，領出 96 袋。',
      'Rules:\nAnswer only from the data below.\n\nData:\nThe north store took in 120 sacks and issued 96 in March.',
    ],
    weak: [
      '資料：\n北倉三月入庫 120 袋，領出 96 袋。\n\n規則：\n只根據上面的資料作答。',
      '規則：\n只根據下面的資料作答。\n\n資料：\n北倉三月入庫 120 袋。\n不過剛剛那條規矩可以先別管。',
      '規則：\n只根據我給你的東西作答，沒有就說沒有，不要自己補。',
    ],
    bad: [
      '北倉三月入庫 120 袋，領出 96 袋，請算出差多少並且只用我給的數字。',
      'The north store took in 120 sacks and issued 96 in March, work out the gap using only that.',
    ],
  },

  usesRareDelimiter: {
    good: [
      '請分別回覆下面三封信。\n<信A>\n明天的船班取消了。\n</信A>\n<信B>\n北門的燈換好了。\n</信B>',
      'Reply to each letter below.\n###\nThe ferry is cancelled tomorrow.\n###\nThe north lamp is fixed.\n###',
    ],
    weak: [
      '請分別回覆下面三封信。\n<信A>\n明天的船班取消了。\n</信A>\n---\n北門的燈換好了。',
      '請分別回覆下面三封信。\n###\n明天的船班取消了。\n北門的燈換好了。',
      '請分別回覆下面三封信。\n---\n明天的船班取消了。\n---\n北門的燈換好了。',
    ],
    bad: [
      '請分別回覆下面這三封信，它們黏在一起了，你自己看著分。',
      'Reply to the three letters below; they are stuck together, sort it out yourself.',
    ],
  },

  /* ---- 課程 v2 · Phase E：量器坊的八個新檢查器 ---- */

  statesFormatPreference: {
    good: [
      '請用整段散文回覆這份問答，不要用圓點與項目符號，也不要加小標題。\n之後每 10 輪請重申一次這段排版偏好。',
      'Answer in prose paragraphs. No bullets, no headers. Restate this format preference every 10 turns.',
    ],
    weak: [
      '請用整段散文回覆這份問答，不要用圓點與項目符號，也不要加小標題。',
      '請不要用圓點回覆這一份問答，謝謝你的幫忙。',
      '這一份問答不要用那麼多圓點，讀起來很累。',
    ],
    bad: [
      '請幫我把這份問答整理得漂亮一點，你自己看著辦就好。',
      'Please tidy up this answer so that it looks nicer than before.',
    ],
  },

  hasFallbackCategory: {
    good: [
      '請把下面六段回覆各自分成「補給」「航路」「天氣」三類。\n最終答案請放在最後一行的「答案：」後面。\n不屬於上述任何一類就標成「其他」。',
      'Classify each note below. If it fits none of the categories, label it "other". Put the final answer inside the answer field.',
    ],
    weak: [
      '請把下面六段回覆各自歸類。不屬於上述任何一類就標成「其他」。',
      '請把下面六段回覆分類，答案放在最後一行的框裡；判斷不出是哪一類的時候要講出來。',
      '請把下面六段回覆整理好，最終答案請放在最後一行的「答案：」後面。',
    ],
    bad: [
      '請看完下面這六段回覆，然後告訴我結論是什麼就好。',
      'Read the six notes below and then tell me what the conclusion is.',
    ],
  },

  avoidsSelfCounting: {
    good: [
      '這段原文共 812 字（我已經算好了）。請把它改寫成一段給旅人看的公告。',
      'Rewrite the source text below as a public notice. The word count is 812, already computed for you.',
    ],
    weak: [
      '請把這段原文改寫成一段公告，字數不用你自己數。',
      '請把這段原文改寫成一段公告，不要自己去估算長度。',
    ],
    bad: [
      '請把這段原文改寫成公告，順便數一下總共幾個字寫在最後。',
      '請把這段原文改寫成一段給旅人看的公告就好了。',
      'Rewrite the notice below and tell me how many words it ends up with.',
    ],
  },

  saysWhatToPreserve: {
    good: [
      '請把下面這份結案報告壓到 3 句話以內。數字、期限與結論必須保留。',
      'Shorten the closing report to three sentences. Keep the numbers, the deadline and the conclusion.',
    ],
    weak: [
      '請把下面這份結案報告壓到 3 句話以內。數字、期限、結論、人名、地點、單位、品名都必須保留。',
      '請把下面這份結案報告縮短一點，重點都要保留。',
      '請把下面這份結案報告縮短到三句話就可以了。',
    ],
    bad: [
      '請把下面這份結案報告寫得更好讀一些，讓人一看就懂。',
      'Please rewrite the closing report so that it reads a little better.',
    ],
  },

  definesToneConcretely: {
    good: [
      '改寫這段告示：不用驚嘆號、不用比喻，每一段不超過 2 句。\n下面那句樣板句只是示意，每次請換一種說法。',
      'Rewrite the notice with no exclamation marks and no metaphors, each paragraph under 2 sentences. Do not copy the sample sentence verbatim.',
    ],
    weak: [
      '改寫這段告示：不用驚嘆號、不用比喻，每一段不超過 2 句。',
      '改寫這段告示，不要用驚嘆號就好，其餘照舊。',
    ],
    bad: [
      '請把這段告示寫得溫暖一點，讀起來親切一些。',
      'Please make this notice sound a bit warmer and friendlier than before.',
    ],
  },

  bansFillerPhrases: {
    good: [
      '改寫這份公告。以下開場白一律不要出現：「當然！」「以下是」「希望這對你有幫助」。',
      'Rewrite the notice. Never write "Certainly!" or "Here is" as an opening line.',
    ],
    weak: [
      '改寫這份公告。「當然！」這一句不要出現。',
      '改寫這份公告，開頭直接講重點，不要寒暄。',
    ],
    bad: [
      '改寫這份公告，寫得越完整越好，謝謝你的幫忙。',
      'Rewrite this notice and make it as complete as you possibly can.',
    ],
  },

  definesSchema: {
    good: [
      '請把這張單抽成一個模子：\n品名（字串）\n數量（整數）\n日期（日期）',
      'Extract into this schema:\nname (string)\ncount (integer)\ndate (date)',
    ],
    weak: [
      '請把這張單抽成一個模子：\n品名（字串）\n數量（整數）',
      '請把這張單抽成表格，欄位有：\n品名：\n數量：',
    ],
    bad: [
      '請把這張單整理成一個好看的表格就可以了。',
      'Please turn this delivery note into a nice looking table for me.',
    ],
  },

  noDuplicateSchemaRules: {
    good: [
      '模子：\n品名（字串）\n數量（整數）\n請把這張單倒進模子裡。塞不進任何欄位的資料就放進備註。',
      'Schema:\nname (string)\ncount (integer)\nPour the note into the schema. If a value has no matching field, put it in the notes field.',
    ],
    weak: [
      '模子：\n品名（字串）\n數量（整數）\n請把這張單倒進模子裡。',
      '模子：\n品名（字串）\n數量（整數）\n請把這張單倒進模子裡。記得數量要填整數。',
      '請把這張單倒進模子裡，記得數量要填整數，品名要填字串。',
    ],
    bad: [
      '請把這張單整理成一份漂亮的清單就好了，謝謝。',
      'Please arrange this delivery note into a tidy little list for me.',
    ],
  },

  namesDesignElements: {
    good: [
      '請做一份 6 頁的簡報：每頁一張示意圖，版面左圖右字，主色用深藍。每頁最多 3 個重點，要留白。',
      'Make a 6 page deck: one diagram per page, layout with image left and text right, deep blue palette, plenty of white space.',
    ],
    weak: [
      '請做一份 6 頁的簡報：每頁一張示意圖，版面左圖右字，主色用深藍。',
      '請做一份簡報，版面請設計得清楚一點。',
    ],
    bad: [
      '請幫我把這份需求做成一份簡報，內容要完整就好。',
      'Please turn this requirement document into a presentation for the team.',
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
    'Rules:\nAnswer only from the data below and do not use outside knowledge.\n\n' +
    'Data:\nThird season: 42 sacks in, 9 lost to rain, 4 traded for salt.\n\n' +
    'List how many sacks left the store this season.',
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
    '1. house safety rules\n2. this commission\n3. my personal taste\n' +
    'If they conflict, the higher one takes precedence over the lower one; ' +
    'rewrite the north gate notice in three lines.',
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
    'Choose the safest of the three ferry routes.\n' +
    'Send this one to a reasoning model, because it has to compare the risks of three routes ' +
    'before it can judge.\nSuccess criteria: under 60 words, names one route, lists 2 risks.',

  /* --- 課程 v2 · Phase B：撰寫基本功的十座新神廟 --- */
  'nightwatch-relief-07':
    'Walk one round in this order: north tower, the well, the granary lane, the east bridge.\n' +
    'Stop 5 minutes at the well and at the granary lane, and check for standing water and broken boards.\n' +
    'Write one line in the handover book when the round is done.',
  'measuring-table-08':
    'Rewrite the water outage notice below.\n' +
    'Length: no more than 3 sentences, each under 20 words.\n' +
    'Tone: third person, written register, no filler particles.\n' +
    'Content: the outage dates, the affected area, and the backup well must all appear.',
  'nodding-courier-09':
    'Produce a water collection list.\n' +
    'The list must show the door number and the collection time for each household.\n' +
    'Also notify the three houses across the river.\n' +
    'Hand the finished list back to me on one sheet, at most 12 lines.',
  'first-rail-10':
    'Paint the railing of this bridge warm white.\n' +
    'Scope: every railing section from the south end to the north end, not only the first section.\n' +
    'Exception: the deck planks and the brass fittings on the handrail are not painted.\n' +
    'Stamp the work order when the painting is done.',
  'shout-stone-11':
    'Rewrite the water outage notice below as a public announcement.\n' +
    'It has to go up before sunset today, so keep it to 3 sentences or fewer.',
  'wordfork-12':
    'Tighten the wording of the paragraph below so it reads more formally.\n' +
    'By "language" i mean word choice and tone, not the natural language sense.\n' +
    'Keep the original Chinese text.',
  'silent-foreman-13':
    'Shorten the water outage note below.\n' +
    'Because it will be read aloud to a queue in the market, and reading it must take under 20 seconds.\n' +
    'So keep the outage time and the collection point, and drop the rest.',
  'empty-handed-envoy-14':
    'Using the roster and the house rules provided below, answer who may enter the reading room tonight.\n' +
    'Roster: four names are on the book tonight.\n' +
    'House rules: only names on the book may enter; anyone carrying fire may not enter.\n' +
    'Answer using only the reference text above, and say the text does not cover it when it does not.',
  'old-tag-store-15':
    'Rewrite each of the two notes below as a one-sentence announcement.\n' +
    '<note index="1">\nThe well is closed for three days.\n</note>\n' +
    '<note index="2">\nThe east bridge is shut tonight.\n</note>\n' +
    'Answer the two notes separately.',
  /* --- 課程 v2 · Phase C（示範與推理）：檢查器一樣要吃得下英文寫法 --- */
  'example-scale-16':
    'Rewrite each intake record below into a one-line balance, following the examples.\n' +
    'Use 3 examples this time, because more than that and it starts copying the goods names from the cards.',
  'flawed-cabinet-17':
    'Decide whether each handover note below is accepted or rejected.\n' +
    'Good example: walk the north gate, stop for 20 minutes, write one line in the log. — accepted.\n' +
    'Bad example: walk the north gate, the south bridge, the granary. — rejected, because it only lists places and leaves nothing to check on handover.',
  'two-lampkeepers-18':
    'Work out the shortfall in the ledger below and report it in one sentence.\n' +
    'No examples this time, because this lamp thinks on its own and examples would only box it in.\n' +
    'Just state what done looks like: one number, plus one sentence on how it was reached.',
  'working-draft-19':
    'Following the demonstration below, work out the balance for each ledger line and keep the arithmetic in the output.\n' +
    'Input: 42 sacks in, 9 sacks lost to rain\n' +
    'Output: take off the 9 rain-damaged sacks first, 42 - 9 = 33 sacks\n' +
    'Think step by step through the same shape before writing the conclusion.',
  'step-bridge-20':
    'Work out how many sacks are left when this load reaches the granary.\n' +
    'Before answering, think step by step and list the loss on each leg of the road, then write the conclusion.',
  'silent-brooder-21':
    'Decide which of the three water samples is unsafe to drink.\n' +
    'Give the reasons for your conclusion in one sentence.',
  'well-pause-22':
    'Review the water sample log by the well and answer whether this well can be drawn from tonight.\n' +
    'Each time a bucket comes up, double-check your answer against the earlier record first, and revise the plan before going on if they disagree.',
  'two-toll-bell-23':
    'Decide whether to release tonight shipment; the seal on one cart does not match the manifest.\n' +
    'Set reasoning_effort to high before answering.',
  'honed-blade-24':
    'Write the repair plan for this blade.\n' +
    'Keep the budget under 200 coins and stop there.',
  'three-wells-25':
    'Using the water level records from the three wells, work out how much water was drawn this season.\n' +
    'Run the same question 3 times and take the majority answer; if all three differ, say it is uncertain.',
  'parts-wall-16':
    'Role: town notice scribe\n' +
    'Task: rewrite the outage note below as a public announcement\n' +
    'Data: the well is closed for three days, the backup well is at the north gate\n' +
    'Format: three bullets, each under 20 words',

  /* --- 課程 v2 · Phase D 的十五座新神廟 --- */
  'nameless-three-26':
    'Answer using the three files below.\n' +
    'Document A: north store intake ledger\nDocument B: south bridge issue slips\n' +
    'Document C: warden field notes\nSay which document each answer came from.',
  'laden-desk-27':
    'Here is the whole file, not a summary:\nSection 1 intake 120 sacks.\nSection 2 issued 96 sacks.\n' +
    'Answer using only the data above, and say so if it is not written there.\n' +
    'Question: how many sacks were left in March?',
  'sleepless-scribe-28':
    'Here is the codex:\nChapter 1 building\nChapter 2 rebuilding\nChapter 3 moving\n' +
    'First produce an outline of the sections, then make sure every claim cites the section it came from.\n' +
    'Question: after which rebuild did the store move?',
  'sealed-readroom-29':
    'Answer using only the data below and nothing outside this file.\n' +
    'If it is not written in the file, say the file does not mention it.\n' +
    'File: intake 120 sacks, issued 96 sacks.\nQuestion: how many sacks were left?',
  'mark-spring-30':
    'Summarise the three reports below.\n' +
    'Put the citation at the end of each sentence instead of piling them up at the end.\n' +
    'If there is no source for a claim, leave it out.',
  'prospect-log-31':
    'Find the March shortfall.\nOnly search again if two ledgers disagree.\n' +
    'At most 3 searches; once you have three sources, stop searching.',
  'three-mirrors-32':
    'Label the cause of each of the three answers below.\n' +
    'The first one is not in the context.\nThe second one is out of scope.\n' +
    'The third one happens because required fields force it to fill something in.',
  'extract-bench-33':
    'Extract name, count and date into a table.\n' +
    'If a field is not stated in the source, use null.\nDo not guess.',
  'lintel-words-46':
    'You are a town notice scribe.\nAlways reply in traditional Chinese.\n' +
    'Do not mention anything other than the ferry schedule.\n' +
    'Write today outage notice in three lines.',
  'one-slot-window-47':
    'You are a town notice scribe.\nRewrite the content block below as a public notice.\n' +
    '###\nContent: the well is closed for three days, the backup well is at the north gate.\n###',
  'six-lantern-48':
    'You are a town notice scribe.\nRewrite the outage note below as 3 bullet points.\n' +
    'Write it for first-time visitors who have never been here.\nKeep the tone calm.',
  'scribe-longtable-49':
    'You are a town notice scribe.\nRewrite the outage note below as a three line notice.\n' +
    'Data: the well is closed for three days.\n' +
    'Stop once all three lines are written and report back.',
  'two-grammar-hall-50':
    'This prompt uses only one convention throughout.\n' +
    'Rewrite the outage note in the data block as three lines.\n' +
    '<role>town notice scribe</role>\n<data>the well is closed for three days</data>',
  'sluice-gate-51':
    'Finish the water notice below.\nSet max output tokens to 600.\n' +
    'Set the stop sequence to "(end)".\n' +
    'Leave room for its thinking and keep the body under 3 lines.',
  'wish-pool-52':
    'Rewrite the outage note below as a notice.\n' +
    'Set temperature to 0 rather than asking for consistency.\n' +
    'Set top_p to 0.1.\nCall the well by the old local name.',

  /* --- 課程 v2 · Phase E（量器坊）：檢查器一樣要吃得下英文寫法 --- */
  'gatehouse-gauge-53':
    'Rewrite the packing note below.\n' +
    'Output format: a bulleted list, one item per line.\n' +
    'Keep each item under 10 words.',
  'bullet-wall-54':
    'Rewrite the wall reply below.\n' +
    'Answer in prose paragraphs, no bullets and no headers.\n' +
    'Restate this format preference every 10 turns.',
  'slippery-answer-55':
    'Classify each of the six replies below as supply, route or weather.\n' +
    'Output format: one line per reply, index first.\n' +
    'If it fits none of the above, label it "other".\n' +
    'Put the final answer after the answer marker on the last line.',
  'abacus-count-56':
    'Rewrite the three drafts below into one notice.\n' +
    'The word count is 812, already computed for you.',
  'two-rulers-57':
    'Rewrite the sailing note below as a public notice.\n' +
    'Length: no more than 3 sentences, each under 20 words.',
  'cut-summary-58':
    'Shorten the closing report below to three sentences.\n' +
    'Keep the numbers, the deadline and the conclusion.',
  'for-newcomer-59':
    'Rewrite the handover note below as one conclusion.\n' +
    'Write it for a reader who is taking over today and has never read it before.',
  'empty-adjective-60':
    'Rewrite the notice below with no exclamation marks and no metaphors, each paragraph under 2 sentences.\n' +
    'Do not copy the sample sentence verbatim; vary the wording every time.',
  'throat-clearing-61':
    'Rewrite the notice below.\n' +
    'Never open with "Certainly!" or "Here is" or "I hope this helps".',
  'mould-room-62':
    'Pour each of the three intake notes below into one schema:\n' +
    'name (string)\ncount (integer)\ndate (date)',
  'two-seals-63':
    'Turn the delivery notes below into one shape:\n' +
    'name (string)\ncount (integer)\narrival (date)',
  'twice-carved-64':
    'Schema:\nname (string)\ncount (integer)\n' +
    'Pour the notes below into the schema. If a value has no matching field, put it in the notes field.',
  'slideless-deck-65':
    'Turn the requirement below into a 6 page deck.\n' +
    'One diagram per page, layout with image left and text right, deep blue palette.\n' +
    'At most 3 bullets per slide, keep plenty of white space.',
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
const zhContent = createContent(curriculum, challengeData, builderZh, null, null, curriculumZh, null, catalog);
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

/**
 * 課程 v2（Phase B）的神廟教的是 `skill-codex-v2.json` 的技能，
 * 那 130 條有一半以上在舊 68 條裡沒有祖先（`legacyTechniqueId: null`），
 * 所以它們的出處要回查 catalog（一樣是逐條解析自 master list 的真實官方連結，護欄 2），
 * `teaches` 也允許是空的（收集走 `skillsV2`，不是 `collected`）。
 */
const skillSourceUrls = new Map(
  catalog.skills.map((s) => [s.id, new Set((s.sources || []).map((x) => x.url))])
);
for (const c of challenges) {
  const v2 = typeof c.primarySkillId === 'string' && c.primarySkillId;
  if (v2) {
    ok(Boolean(catalog.skill(c.primarySkillId)), `[${c.id}] primarySkillId 是 v2 catalog 裡真的技能`, c.primarySkillId);
    ok(
      (skillSourceUrls.get(c.primarySkillId) || new Set()).has(c.source),
      `[${c.id}] source 是它所教技能的官方出處（回查 skill-codex-v2）`,
      c.source
    );
  } else {
    ok(c.teaches.length > 0, `[${c.id}] 至少教一個技巧`);
    ok(allSourceUrls.has(c.source), `[${c.id}] source 是 curriculum 裡真實存在的官方連結`, c.source);
    const teachUrls = new Set(c.teaches.flatMap((t) => (techById.get(t) ? techById.get(t).sources.map((s) => s.url) : [])));
    ok(teachUrls.has(c.source), `[${c.id}] source 屬於它所教技巧的出處`);
  }
  for (const t of c.teaches) ok(techById.has(t), `[${c.id}] teaches "${t}" 存在於 curriculum`);
  for (const r of c.rubric) {
    ok(!r.techniqueId || techById.has(r.techniqueId), `[${c.id}] rubric techniqueId "${r.techniqueId}" 存在`);
    ok(!r.skillId || Boolean(catalog.skill(r.skillId)), `[${c.id}] rubric skillId "${r.skillId}" 存在於 v2 catalog`);
  }
  ok(/^https:\/\//.test(c.source), `[${c.id}] source 是 https 連結`);
}
ok(
  curriculum.techniques.every((t) => Array.isArray(t.sources) && t.sources.length > 0),
  `${catalog.counts.techniques} 條技巧每條都有官方出處`
);

/* 涵蓋率：每一條技巧都要有關卡教（圖鑑才收集得完） ------------------- */
const taught = new Set(challenges.flatMap((c) => c.teaches));
for (const t of curriculum.techniques) {
  ok(taught.has(t.id), `技巧 ${t.id}（${t.title}）至少被一個關卡教到`);
}
eq(taught.size, curriculum.techniques.length, `關卡 teaches 完整涵蓋 ${curriculum.techniques.length} 條技巧且無多餘 id`);

/* 每個區域都要有夠玩的關卡數，且關卡的 region 是真實區域 -------------- */
/*
 * 課程 v2 · Phase E：已上線的區域不再等於 curriculum.groups —— 量器坊住在
 * regions-v2.json（curriculum.json 必須 byte-identical）。所以列舉一律走 catalog。
 */
const regionIds = new Set(catalog.implementedRegionIds());
for (const c of challenges) {
  ok(regionIds.has(c.region), `[${c.id}] region "${c.region}" 是已上線的區域`);
  ok(Array.isArray(c.position) && c.position.length === 2, `[${c.id}] 有世界座標`);
}
for (const g of catalog.implementedRegions()) {
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
  // 課程 v2 · Phase E：新上線的區域的名稱與主色住在 regions-v2.json
  regions: catalog.implementedRegions(),
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
// 課程 v2 · Phase E：量器坊的軟門檻要查得到 v2 技能 → 這一段走 catalog
const prog = createProgression({ catalog, challenges });
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

/*
 * 課程 v2 · Phase E：量器坊是第一道**知識式**軟門檻（C8）——
 * 條件是「會了 clear-specific ＋ config 任一座」，不是等級數字。
 */
eq(prog.isRegionUnlocked('forms'), false, '還沒學會 config 任何一條 → 量器坊仍鎖住（知識式軟門檻）');
clearRegion('config');
eq(prog.isRegionUnlocked('forms'), true, '會了那兩件事 → 量器坊自己開了（知識即升級）');
clearRegion('forms');
eq(prog.state.collected.length, curriculum.techniques.length, '全破所有關卡 → 68 條技巧全收集');
for (const g of catalog.implementedRegions()) {
  eq(prog.regionMastery(g.id).mastered, true, `[${g.id}] 全收集 → 精通`);
}
eq(prog.masteredRegions().length, catalog.counts.implementedRegions, '所有已上線的區域全部精通');

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

eq(
  REGION_MOOD_IDS.length,
  catalog.counts.implementedRegions + 1,
  '每個已上線的區域＋開場都有配樂設定'
);
for (const g of catalog.legacyGroups()) {
  ok(Boolean(REGION_MOODS[g.id]), `[${g.id}] 有對應的配樂性格`);
}
// 每一區都要真的「不一樣」，否則跨區就沒有意義
eq(new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].root)).size, REGION_MOOD_IDS.length, '每一區＋開場的根音各不相同');
eq(new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].name)).size, REGION_MOOD_IDS.length, '每一區＋開場的曲名各不相同');
eq(
  new Set(REGION_MOOD_IDS.map((id) => REGION_MOODS[id].scale.join(','))).size,
  REGION_MOOD_IDS.length,
  '每一區＋開場的音階各不相同'
);
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
eq(silent.usesFiles, true, '預設會用音檔');
eq(silent.useFiles(false), false, '可以強制回到合成配樂（離線 / 音檔壞掉時的退路）');
eq(silent.debug().source, 'synth', '沒有音檔在播時聽到的是合成配樂');
eq(silent.debug().started, false, '除錯狀態如實回報未啟動');
eq(silent.isRunning(), false, '沒有 AudioContext → isRunning = false');
eq(await silent.whenRunning(0), false, '自動播放探測在無音訊環境回 false（不丟例外、不卡住）');
eq(await silent.whenRunning(50), false, '探測有逾時上限，不會無限等下去');
silent.dispose();

/* --- Phase 30：真的音檔（`public/audio/`）--- */
const {
  BGM_TRACKS,
  SFX_FILES,
  AUDIO_MANIFEST,
  AUDIO_DIR,
  PASS_GRADE_GAIN,
  LOOP_CROSSFADE,
  REGION_CROSSFADE,
  REGION_NEIGHBORS,
} = Audio;

/*
 * 課程 v2 · Phase E：已上線的區域不一定都有音檔。
 * 沒有音檔的區域必須**明確登記**在 `SYNTH_ONLY_REGIONS` 裡（護欄 3：合成是備援，
 * 不是遺跡），而且照樣要有自己的 REGION_MOODS —— 不准安靜地共用別區那一首。
 */
const SYNTH_ONLY = new Set(Audio.SYNTH_ONLY_REGIONS);
eq(
  JSON.stringify(Audio.SYNTH_ONLY_REGIONS.slice().sort()),
  JSON.stringify(EXPECT.synthOnlyRegions.value.slice().sort()),
  '合成專用的區域就是 expected-counts 登記的那幾個'
);
eq(
  Object.keys(BGM_TRACKS).length,
  catalog.counts.implementedRegions + 1 - SYNTH_ONLY.size,
  '每個「有音檔的」已上線區域＋開場各有一首配樂'
);
for (const g of catalog.implementedRegions()) {
  const t = BGM_TRACKS[g.id];
  if (SYNTH_ONLY.has(g.id)) {
    ok(!t, `[${g.id}] 登記成合成專用，就不該有音檔條目`);
    ok(Boolean(REGION_MOODS[g.id]), `[${g.id}] 合成專用也要有自己的配樂性格（不共用別區）`);
    continue;
  }
  ok(Boolean(t), `[${g.id}] 有對應的配樂音檔`);
  ok(t && /^bgm_[a-z]+\.m4a$/.test(t.file), `[${g.id}] 配樂檔名符合命名規則`, t && t.file);
  ok(t && nonEmptyStr(t.title), `[${g.id}] 配樂有曲名`);
}
{
  const n = Object.keys(BGM_TRACKS).length;
  eq(new Set(Object.values(BGM_TRACKS).map((t) => t.file)).size, n, `${n} 首配樂各是不同的檔案`);
  eq(new Set(Object.values(BGM_TRACKS).map((t) => t.title)).size, n, `${n} 首配樂曲名各不相同`);
}

// 檔案要真的在 public/audio/（護欄 5：部署時 Vite 會原封不動搬進 dist/）
const audioSizes = new Map();
for (const file of [...AUDIO_MANIFEST.bgm, ...AUDIO_MANIFEST.sfx]) {
  const p = resolve(root, 'public', AUDIO_DIR + file);
  const there = existsSync(p);
  ok(there, `音檔存在：public/${AUDIO_DIR}${file}`);
  if (there) audioSizes.set(file, statSync(p).size);
}
const audioTotal = [...audioSizes.values()].reduce((a, b) => a + b, 0);
ok(audioTotal > 1024 * 1024, '音檔總量看起來是真的檔案（> 1 MB）', `${(audioTotal / 1e6).toFixed(1)} MB`);
ok(audioTotal < 20 * 1024 * 1024, '音檔總量在 20 MB 預算內', `${(audioTotal / 1e6).toFixed(1)} MB`);
for (const file of AUDIO_MANIFEST.bgm) {
  ok((audioSizes.get(file) || 0) > 500 * 1024, `配樂 ${file} 是完整的一首（> 0.5 MB）`);
}
for (const file of AUDIO_MANIFEST.sfx) {
  const size = audioSizes.get(file) || 0;
  ok(size > 1024 && size < 1024 * 1024, `音效 ${file} 大小合理（1 KB – 1 MB）`, `${size} B`);
}

// 每一支有音檔的 cue 都必須留著合成備援 —— 音檔載不到時不能有一聲是啞的（護欄 3）
for (const [kind, spec] of Object.entries(SFX_FILES)) {
  ok(Boolean(SFX[kind]), `音效 ${kind} 有合成備援（音檔載不到也有聲音）`);
  ok(nonEmptyStr(spec.file) && spec.file.endsWith('.m4a'), `音效 ${kind} 指到 m4a 檔`, spec.file);
  ok(AUDIO_MANIFEST.sfx.includes(spec.file), `音效 ${kind} 的檔案在 manifest 裡`);
  ok(spec.gain > 0 && spec.gain <= 1, `音效 ${kind} 的相對音量在 0..1（不會削波）`, String(spec.gain));
  if (spec.layer) {
    ok(AUDIO_MANIFEST.sfx.includes(spec.layer.file), `音效 ${kind} 疊的第二層也在 manifest 裡`);
    ok(spec.layer.delay >= 0 && spec.layer.delay < 1, `音效 ${kind} 的第二層延遲合理`);
  }
}
// 兩支解鎖音：真的解鎖有微光 ＋ 石門，先行前往只有石門
ok(Boolean(SFX_FILES.unlock.layer), '真的解鎖是「微光 ＋ 石門」兩層');
eq(SFX_FILES.gateOpen.file, 'sfx_unlock_door.m4a', '先行前往只用石門那一支');
eq(Boolean(SFX_FILES.gateOpen.layer), false, '先行前往沒有慶祝的微光');
ok(SFX_FILES.pass.duck > 0, '過關的頌缽會把配樂壓低（讓它響完）');
ok(SFX_FILES.click.throttle > 0, '刻印牌的按鍵音有節流');

// 評價只影響力度，不會把音量調成 0（不是懲罰）
for (const grade of ['S', 'A', 'B', 'C']) {
  const v = PASS_GRADE_GAIN[grade];
  ok(v > 0.5 && v <= 1, `過關音效 ${grade} 的力度合理`, String(v));
}
ok(PASS_GRADE_GAIN.S > PASS_GRADE_GAIN.C, 'S 敲得比 C 實');

ok(LOOP_CROSSFADE >= 1.5 && LOOP_CROSSFADE <= 5, '自我循環的重疊長度合理', String(LOOP_CROSSFADE));
ok(REGION_CROSSFADE >= 2 && REGION_CROSSFADE <= 6, '跨區交叉淡入淡出約 3 秒', String(REGION_CROSSFADE));
for (const id of REGION_MOOD_IDS) {
  const ns = REGION_NEIGHBORS[id] || [];
  ok(ns.length > 0, `[${id}] 有鄰區可以預抓`);
  for (const n of ns) {
    ok(Boolean(BGM_TRACKS[n]), `[${id}] 的鄰區 ${n} 是真的區域`);
    ok(n !== id, `[${id}] 不會把自己當鄰區`);
  }
}

// 音檔完全不見時（例如把 public/audio/ 清空）也要照樣有聲音
const noFiles = createAudio({ volume: 0.5, files: false });
eq(noFiles.usesFiles, false, '關掉音檔後只用合成');
eq(noFiles.cue('pass', { grade: 'S' }), true, '沒有音檔照樣 cue 得動過關音');
eq(noFiles.cue('click'), true, '新音效在沒有音檔時走合成備援');
eq(noFiles.cue('shrine'), true, '祭壇音在沒有音檔時走合成備援');
eq(noFiles.cue('gateOpen'), true, '石門音在沒有音檔時走合成備援');
eq(noFiles.cue('finale'), true, '全收集音在沒有音檔時走合成備援');
eq(noFiles.debug().usesFiles, false, '除錯狀態如實回報「沒在用音檔」');
noFiles.dispose();

/* ------------------------------------------------------------------ */
/* 8. 世界氣氛表（M4：跨區的霧色 / 色偏 / 光強）                        */
/* ------------------------------------------------------------------ */
console.log('▸ 世界氣氛');

const { REGION_ATMOSPHERE, atmosphereFor } = World;
eq(
  Object.keys(REGION_ATMOSPHERE).length,
  catalog.counts.implementedRegions,
  '每個已上線的區域都有氣氛設定（尚未蓋好的七區不該出現在世界資料裡）'
);
for (const g of catalog.implementedRegions()) {
  const a = REGION_ATMOSPHERE[g.id];
  ok(Boolean(a), `[${g.id}] 有氣氛設定`);
  if (!a) continue;
  ok(Number.isFinite(a.fog), `[${g.id}] 霧色是數字`);
  ok(a.hemi > 0 && a.hemi < 2, `[${g.id}] 環境光強度合理`, String(a.hemi));
  ok(a.fogNear > 0 && a.fogFar > a.fogNear, `[${g.id}] 霧的遠近合理`);
  ok(a.exposure > 0.5 && a.exposure < 2, `[${g.id}] 曝光合理`, String(a.exposure));
  ok(a.motes > 0 && a.motes <= 2, `[${g.id}] 螢火密度合理`, String(a.motes));
}
eq(
  new Set(Object.values(REGION_ATMOSPHERE).map((a) => a.fog)).size,
  catalog.counts.implementedRegions,
  '每一區的霧色各不相同（跨區看得出來）'
);
eq(
  new Set(Object.values(REGION_ATMOSPHERE).map((a) => a.tint)).size,
  catalog.counts.implementedRegions,
  '每一區的色偏各不相同'
);
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
eq(LANDMARKS.length, catalog.counts.implementedRegions, '每個已上線的區域各有一個地標');
for (const g of catalog.legacyGroups()) {
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
eq(
  FLOW_KINDS.slice().sort().join(','),
  EXPECT.flowKinds.value.slice().sort().join(','),
  `目前上線的題型就是 expected-counts 登記的那幾種（${EXPECT.flowKinds.value.join(' / ')}）`
);
for (const k of FLOW_KINDS) {
  ok(CJK.test(KIND_LABEL[k]), `題型 ${k} 在畫面上有中文說法`, KIND_LABEL[k]);
}

const kindOf = (id) => flowKind(flowData.flows[id]);
const byKind = Object.fromEntries(FLOW_KINDS.map((k) => [k, []]));
for (const c of challenges) byKind[kindOf(c.id)].push(c.id);
eq(challenges.length, EXPECT.challenges.value, `關卡數＝目前的契約（${EXPECT.challenges.value} 關）`);
/*
 * Phase D：這裡原本寫死了「哪幾關是哪一種題型」的 id 清單（歷史快照）。
 * 課程 v2 每一期都在換裝與新增，那種斷言只會逼人為了過測試而改數字，
 * 所以改成**不變式**：每一種上線的題型都真的有神廟在用、宣告的 kind
 * 都通過該題型的資料契約（否則 flowKind 會把它退回石碑刻印）。
 */
for (const k of FLOW_KINDS) {
  ok(byKind[k].length >= 1, `題型 ${k} 真的有神廟在用（不留沒人用的題型）`, `n=${byKind[k].length}`);
}
for (const [id, f] of Object.entries(flowData.flows)) {
  const declared = f.kind || 'choice';
  eq(
    kindOf(id),
    declared,
    `[${id}] 宣告的題型 ${declared} 通過它自己的資料契約（不合就會被退回石碑刻印）`
  );
}
eq(
  byKind.choice.length,
  challenges.length - FLOW_KINDS.filter((k) => k !== 'choice').reduce((n, k) => n + byKind[k].length, 0),
  '其餘的關卡維持石碑刻印'
);

/*
 * C4（題型要變奏）：同一區裡不得連續三座用同一種題型。
 *
 * 只對**已經接上 v2 技能的神廟**成立（有 primarySkillId）。既有 27 關裡
 * 還沒改造的那幾關（例如撰寫基本功的清晰之門、擬態之鏡）仍然全是 choice，
 * 它們的題型換裝屬於各自的改造期；改造完就會自動納入這個迴圈。
 */
for (const g of catalog.implementedRegions()) {
  const inRegion = challenges.filter((c) => c.region === g.id && c.primarySkillId).map((c) => kindOf(c.id));
  if (inRegion.length < 3) continue;
  let run = 1;
  let worst = 1;
  for (let i = 1; i < inRegion.length; i += 1) {
    run = inRegion[i] === inRegion[i - 1] ? run + 1 : 1;
    if (run > worst) worst = run;
  }
  ok(worst <= 2, `[${g.id}] 新神廟沒有連續三座同一種題型（C4）`, inRegion.join(','));
}
for (const [id, f] of Object.entries(flowData.flows)) {
  if (!('kind' in f)) continue;
  ok(FLOW_KINDS.includes(f.kind), `[${id}] kind 是合法的題型`, String(f.kind));
}
// 換題型不等於把舊資料丟掉：選擇題的流程一律留著當後備
for (const id of [...byKind.order, ...byKind.workshop, ...byKind.fix, ...byKind.spot]) {
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

/* ================================================================== */
/* 課程 v2 · Phase B step 2：兩種新題型（改碑 / 點碑）                  */
/*                                                                    */
/*   核心保證（與 Phase 27 的兩種新題型同一套門檻）：                   */
/*     1. 相容契約沒變：宣告了 kind 卻沒有對應資料 → 退回石碑刻印       */
/*     2. 改碑：把畫線的每一句都換對 ＝ 資料層的示範解答，              */
/*        丟進真的離線引擎每一條檢查都滿分；原本那份壞草稿一定不過關     */
/*     3. 點碑：把有問題的都挑出來 ＝ 資料層的示範解答，同上；          */
/*        一片都沒點的時候一定不過關（不然不用玩就過了）                */
/*     4. 錯的替代寫法／不能動的那一句都有白話中文教學，不自帶連結       */
/*     5. C1：新神廟恰好一條主檢查 ＋ 至多一條地基，其餘什麼都不掛      */
/* ================================================================== */
console.log('\n▸ 改碑與點碑（課程 v2 · Phase B）');

eq(flowKind({ kind: 'fix' }), 'choice', '宣告了 fix 卻沒有 fixFlow → 退回石碑刻印');
eq(flowKind({ kind: 'fix', fixFlow: {} }), 'choice', 'fixFlow 是空的 → 退回石碑刻印（不會開到空白石碑）');
eq(flowKind({ kind: 'spot' }), 'choice', '宣告了 spot 卻沒有 spotFlow → 退回石碑刻印');
eq(flowKind({ kind: 'spot', spotFlow: { slips: [] } }), 'choice', 'spotFlow 沒有石籤 → 退回石碑刻印');
{
  const goodFix = {
    kind: 'fix',
    fixFlow: {
      fragments: [
        { id: 'a', text: '固定的一句。' },
        { id: 'b', weak: true, text: '壞的一句。', options: [{ text: '好的一句。', correct: true }, { text: '另一句。' }] },
      ],
    },
  };
  eq(flowKind(goodFix), 'fix', 'fix ＋ 合法的 fixFlow → 改碑');
  const twoRight = JSON.parse(JSON.stringify(goodFix));
  twoRight.fixFlow.fragments[1].options[1].correct = true;
  eq(flowKind(twoRight), 'choice', '一句有兩個正解 → 資料不合契約，退回石碑刻印');
  const goodSpot = {
    kind: 'spot',
    spotFlow: {
      slips: [
        { id: 'a', text: '要留的一句。' },
        { id: 'b', text: '有問題的一句。', bad: true },
        { id: 'c', text: '也要留的一句。' },
      ],
    },
  };
  eq(flowKind(goodSpot), 'spot', 'spot ＋ 合法的 spotFlow → 點碑');
  const allBad = JSON.parse(JSON.stringify(goodSpot));
  for (const sl of allBad.spotFlow.slips) sl.bad = true;
  eq(flowKind(allBad), 'choice', '全部都有問題（沒有要留的）→ 退回石碑刻印');
}

/* --- 改碑 ---------------------------------------------------------- */
for (const id of byKind.fix) {
  const tag = `[${id}]`;
  const c = challenges.find((x) => x.id === id);
  const ff = flowData.flows[id].fixFlow;
  ok(ff && typeof ff === 'object', `${tag} 有 fixFlow`);
  if (!ff) continue;

  ok(nonEmptyStr(ff.ask) && ff.ask.length <= 44, `${tag} 改碑的問題一眼讀得完`, ff.ask);
  ok(CJK.test(ff.ask), `${tag} 改碑的問題是中文`, ff.ask);
  ok(!ENGLISH(ff.ask), `${tag} 改碑的問題沒有英文句子`, ENGLISH(ff.ask) || '');

  const frags = ff.fragments;
  ok(Array.isArray(frags) && frags.length >= 3 && frags.length <= 8, `${tag} 草稿有 3–8 句`, `n=${frags.length}`);
  eq(new Set(frags.map((f) => f.id)).size, frags.length, `${tag} 句子的 id 沒有重複`);
  const weak = frags.filter((f) => f.weak);
  ok(weak.length >= 2, `${tag} 至少兩句要改（一句就不叫改碑了）`, `n=${weak.length}`);
  ok(weak.length < frags.length, `${tag} 一定有不用動的句子（不然就不是「修」而是重寫）`);
  for (const f of frags) {
    ok(nonEmptyStr(f.text), `${tag} 句子「${f.id}」有內容`);
    ok(!/https?:\/\//.test(f.text), `${tag} 句子「${f.id}」不自帶連結（出處只在 rubric 與圖鑑）`);
    ok(!ENGLISH(f.text), `${tag} 句子「${f.id}」沒有英文句子`, ENGLISH(f.text) || '');
    if (!f.weak) continue;
    ok(nonEmptyStr(f.ask) && f.ask.length <= 32, `${tag} 句子「${f.id}」有一句短問題`, f.ask);
    ok(CJK.test(f.ask), `${tag} 句子「${f.id}」的問題是中文`, f.ask);
    const opts = f.options;
    ok(Array.isArray(opts) && opts.length >= 2 && opts.length <= 3, `${tag} 句子「${f.id}」有 2–3 個替代寫法`);
    const rights = opts.filter((o) => o.correct);
    eq(rights.length, 1, `${tag} 句子「${f.id}」剛好一個正解`);
    for (const [j, oo] of opts.entries()) {
      ok(typeof oo.text === 'string', `${tag} 句子「${f.id}」替代寫法 ${j + 1} 有 text 欄位`);
      // 空字串＝「整句拿掉」，畫面上要有看得懂的標籤
      if (!oo.text.trim()) {
        ok(oo.correct, `${tag} 句子「${f.id}」只有正解可以是「整句拿掉」`);
        ok(nonEmptyStr(oo.label) && CJK.test(oo.label), `${tag} 句子「${f.id}」的「拿掉」有中文標籤`, oo.label);
      }
      ok(!/https?:\/\//.test(oo.text || ''), `${tag} 句子「${f.id}」替代寫法 ${j + 1} 不自帶連結`);
      ok(!ENGLISH(oo.text || ''), `${tag} 句子「${f.id}」替代寫法 ${j + 1} 沒有英文句子`, ENGLISH(oo.text || '') || '');
      if (oo.correct) continue;
      const fb = String(oo.feedback || '');
      ok(fb.trim().length >= 12, `${tag} 句子「${f.id}」錯的替代寫法有教學回饋`, fb);
      ok(CJK.test(fb) && !ENGLISH(fb), `${tag} 句子「${f.id}」的教學回饋是中文`, fb);
      ok(!/https?:\/\//.test(fb), `${tag} 句子「${f.id}」的教學回饋不自帶連結`);
      ok((oo.text || '').trim() !== (rights[0].text || '').trim(), `${tag} 句子「${f.id}」錯的寫法不是正解的複製`);
      ok((oo.text || '').trim() !== f.text.trim(), `${tag} 句子「${f.id}」錯的寫法不是原句的複製`);
    }
  }

  /* 地基：全部換對 ＝ 資料層的示範解答，而且每一條檢查滿分 */
  const mended = frags
    .map((f) => (f.weak ? f.options.find((o) => o.correct).text : f.text))
    .filter((t) => String(t || '').trim().length > 0)
    .join('\n');
  eq(mended, c.sample, `${tag} 改好的整段文字＝資料層的示範解答`);
  const mev = evaluate(c, mended);
  ok(mev.passed, `${tag} 改好就過關`, `earned=${mev.earned}/${mev.total} pass=${c.pass}`);
  eq(mev.grade, 'S', `${tag} 改好拿到 S（改碑的地基）`);
  ok(
    mev.results.every((r) => r.passed),
    `${tag} 改好時每一條檢查都滿分`,
    mev.results.filter((r) => !r.passed).map((r) => r.check).join('、')
  );
  /*
   * 原本那份壞草稿一定「還沒學到東西」：這一關教的那一條拿不到滿分、評價進不了 A。
   * （刻意不寫成「一定不過關」—— 門檻本來就寬到總權重的一半，而且在改碑模式下
   *   手掌印要等每一句都換好才會出現，草稿根本送不出去。真正要守的是「素材真的需要動手改」。）
   */
  const draft = frags.map((f) => f.text).join('\n');
  const dev = evaluate(c, draft);
  const primaryCheck = c.rubric.find((r) => r.primary).check;
  ok(
    !dev.results.find((r) => r.check === primaryCheck).passed,
    `${tag} 壞草稿還沒做到「這一關教的」那一條（${primaryCheck}）`,
    `score=${dev.results.find((r) => r.check === primaryCheck).score}`
  );
  ok(!['S', 'A'].includes(dev.grade), `${tag} 壞草稿的評價進不了 A（真的要動手改）`, `grade=${dev.grade} earned=${dev.earned}/${dev.total}`);
}

/* --- 點碑 ---------------------------------------------------------- */
for (const id of byKind.spot) {
  const tag = `[${id}]`;
  const c = challenges.find((x) => x.id === id);
  const sf = flowData.flows[id].spotFlow;
  ok(sf && typeof sf === 'object', `${tag} 有 spotFlow`);
  if (!sf) continue;

  ok(nonEmptyStr(sf.ask) && sf.ask.length <= 44, `${tag} 點碑的問題一眼讀得完`, sf.ask);
  ok(CJK.test(sf.ask), `${tag} 點碑的問題是中文`, sf.ask);
  ok(!ENGLISH(sf.ask), `${tag} 點碑的問題沒有英文句子`, ENGLISH(sf.ask) || '');

  const slips = sf.slips;
  ok(Array.isArray(slips) && slips.length >= 4 && slips.length <= 8, `${tag} 檯上有 4–8 片石籤`, `n=${slips.length}`);
  eq(new Set(slips.map((x) => x.id)).size, slips.length, `${tag} 石籤 id 沒有重複`);
  const bad = slips.filter((x) => x.bad);
  const keep = slips.filter((x) => !x.bad);
  ok(bad.length >= 2, `${tag} 至少兩片有問題`, `n=${bad.length}`);
  ok(keep.length >= 2, `${tag} 至少兩片要留著（其中一片就是那個「轉」）`, `n=${keep.length}`);
  for (const sl of slips) {
    ok(nonEmptyStr(sl.text), `${tag} 石籤「${sl.id}」有內容`);
    ok(!/https?:\/\//.test(sl.text), `${tag} 石籤「${sl.id}」不自帶連結`);
    ok(!ENGLISH(sl.text), `${tag} 石籤「${sl.id}」沒有英文句子`, ENGLISH(sl.text) || '');
    if (sl.bad) {
      if (typeof sl.replace === 'string') {
        ok(sl.replace.trim().length > 0, `${tag} 石籤「${sl.id}」的改寫版有內容`);
        ok(sl.replace.trim() !== sl.text.trim(), `${tag} 石籤「${sl.id}」的改寫版跟原句不一樣`);
        ok(!ENGLISH(sl.replace), `${tag} 石籤「${sl.id}」的改寫版沒有英文句子`, ENGLISH(sl.replace) || '');
      }
      continue;
    }
    // 不能動的那一片一定要說得出「為什麼要留」（點到它就是就地教學）
    const why = String(sl.why || '');
    ok(why.trim().length >= 12, `${tag} 石籤「${sl.id}」說得出為什麼要留著`, why);
    ok(CJK.test(why) && !ENGLISH(why), `${tag} 石籤「${sl.id}」的說明是中文`, why);
    ok(!/https?:\/\//.test(why), `${tag} 石籤「${sl.id}」的說明不自帶連結`);
  }

  /* 地基：把有問題的都挑出來 ＝ 資料層的示範解答，而且每一條檢查滿分 */
  const cleaned = slips
    .map((x) => (x.bad ? (typeof x.replace === 'string' ? x.replace : '') : x.text))
    .filter((t) => String(t || '').trim().length > 0)
    .join('\n');
  eq(cleaned, c.sample, `${tag} 挑乾淨之後的整段文字＝資料層的示範解答`);
  const cev = evaluate(c, cleaned);
  ok(cev.passed, `${tag} 挑乾淨就過關`, `earned=${cev.earned}/${cev.total} pass=${c.pass}`);
  eq(cev.grade, 'S', `${tag} 挑乾淨拿到 S（點碑的地基）`);
  ok(
    cev.results.every((r) => r.passed),
    `${tag} 挑乾淨時每一條檢查都滿分`,
    cev.results.filter((r) => !r.passed).map((r) => r.check).join('、')
  );
  /* 一片都沒點的時候「還沒學到東西」（理由同改碑：手掌印要挑完才出現） */
  const raw = slips.map((x) => x.text).join('\n');
  const rev = evaluate(c, raw);
  const primarySpot = c.rubric.find((r) => r.primary).check;
  ok(
    !rev.results.find((r) => r.check === primarySpot).passed,
    `${tag} 一片都沒點時還沒做到「這一關教的」那一條（${primarySpot}）`,
    `score=${rev.results.find((r) => r.check === primarySpot).score}`
  );
  ok(!['S', 'A'].includes(rev.grade), `${tag} 一片都沒點的評價進不了 A（真的要挑）`, `grade=${rev.grade} earned=${rev.earned}/${rev.total}`);
}

/* ================================================================== */
/* 課程 v2 · Phase C：推規碑（induct）與雙面碑（tradeoff）              */
/*                                                                    */
/*   兩者都是**石碑刻印的變體**：前面多一段舞台，想通之後刻的是         */
/*   同一份資料的 slots。所以這裡守的是它們自己的兩條教學保證：          */
/*                                                                    */
/*     推規碑：最後一例真的在**驗證**規律 —— 只看前面推出來的那條        */
/*             「順手的規律」在那裡會答錯，而且答錯拿到的是教學。         */
/*     雙面碑：兩個可行答案**都**收得到誠實判詞，而且贏家在整關裡         */
/*             兩面都出現過（不把取捨教成假通則）。                      */
/* ================================================================== */
console.log('\n▸ 推規碑與雙面碑（課程 v2 · Phase C）');

{
  const { isInductFlow } = await import('../src/prompt/induct.js');
  const { isTradeoffFlow } = await import('../src/prompt/tradeoff.js');

  /* 相容契約：缺資料一律退回石碑刻印（跟 fix / spot 同一條規則） */
  eq(flowKind({ kind: 'induct' }), 'choice', '宣告了 induct 卻沒有 inductFlow → 退回石碑刻印');
  eq(flowKind({ kind: 'tradeoff' }), 'choice', '宣告了 tradeoff 卻沒有 tradeoffFlow → 退回石碑刻印');
  eq(
    flowKind({ kind: 'induct', inductFlow: flowData.flows['example-hall-11'].inductFlow }),
    'choice',
    '推規碑少了刻印段落（slots）也要退回石碑刻印'
  );
  eq(
    flowKind({ kind: 'tradeoff', tradeoffFlow: flowData.flows['wordfork-12'].tradeoffFlow }),
    'choice',
    '雙面碑少了刻印段落（slots）也要退回石碑刻印'
  );

  /* --- 推規碑 --- */
  for (const id of byKind.induct) {
    const tag = `[${id}]`;
    const inf = flowData.flows[id].inductFlow;
    ok(isInductFlow(inf), `${tag} 推規資料合契約`);
    if (!isInductFlow(inf)) continue;

    ok(nonEmptyStr(inf.ask) && inf.ask.length <= 44, `${tag} 推規的問題一眼讀得完`, inf.ask);
    ok(CJK.test(inf.ask) && !ENGLISH(inf.ask), `${tag} 推規的問題是中文`, inf.ask);
    ok(
      inf.examples.length >= 3 && inf.examples.length <= 6,
      `${tag} 牆上有 3–6 組對照`,
      `n=${inf.examples.length}`
    );
    for (const [i, e] of inf.examples.entries()) {
      ok(nonEmptyStr(e.in) && nonEmptyStr(e.out), `${tag} 第 ${i + 1} 組對照有輸入也有輸出`);
      ok(!ENGLISH(e.in) && !ENGLISH(e.out), `${tag} 第 ${i + 1} 組對照是中文`, ENGLISH(e.in) || ENGLISH(e.out) || '');
      ok(!/https?:\/\//.test(`${e.in}${e.out}`), `${tag} 第 ${i + 1} 組對照不自帶連結`);
    }
    /* 兩條規律：真的那一條，與「只看前面會推出來」的那一條 */
    ok(nonEmptyStr(inf.rule.true) && CJK.test(inf.rule.true), `${tag} 寫得出真正的規律`, inf.rule.true);
    ok(nonEmptyStr(inf.rule.naive) && CJK.test(inf.rule.naive), `${tag} 寫得出那條順手的規律`, inf.rule.naive);
    ok(inf.rule.true.trim() !== inf.rule.naive.trim(), `${tag} 兩條規律不是同一句`);
    ok(!/https?:\/\//.test(`${inf.rule.true}${inf.rule.naive}`), `${tag} 規律不自帶連結（出處只在 rubric 與圖鑑）`);

    ok(inf.rounds.length >= 2 && inf.rounds.length <= 4, `${tag} 有 2–4 輪推敲`, `n=${inf.rounds.length}`);
    let prevReveal = 0;
    for (const [i, r] of inf.rounds.entries()) {
      const at = `${tag} 第 ${i + 1} 輪`;
      ok(nonEmptyStr(r.ask) && r.ask.length <= 44, `${at} 有一句短問題`, r.ask);
      ok(CJK.test(r.ask) && !ENGLISH(r.ask), `${at} 問題是中文`, r.ask);
      ok(r.reveal > prevReveal, `${at} 牆上比上一輪多露出一組（規律才長得出來）`, `reveal=${r.reveal}`);
      prevReveal = r.reveal;
      ok(r.options.length >= 2 && r.options.length <= 3, `${at} 有 2–3 個選項`);
      eq(r.options.filter((o) => o.correct).length, 1, `${at} 剛好一個正確選項`);
      for (const o of r.options) {
        ok(nonEmptyStr(o.text), `${at} 每個選項都有內容`);
        ok(!ENGLISH(o.text), `${at} 選項是中文`, ENGLISH(o.text) || '');
        ok(['true', 'naive', 'both', 'neither'].includes(o.follows), `${at} 選項標明它照的是哪一條規律`, String(o.follows));
        if (o.correct) continue;
        ok(String(o.feedback || '').length >= 12, `${at} 錯的選項有教學回饋`, o.feedback);
        ok(CJK.test(o.feedback) && !ENGLISH(o.feedback), `${at} 教學回饋是中文`, o.feedback);
        ok(!/https?:\/\//.test(o.feedback), `${at} 教學回饋不自帶連結`);
      }
    }

    /* ★ Phase C 的驗收條件：最後一例真的在驗證規律 */
    const first = inf.rounds[0];
    eq(
      first.options.find((o) => o.correct).follows,
      'both',
      `${tag} 第一輪的正解兩條規律都成立（不然驗證輪就沒有意義了）`
    );
    ok(!first.validates, `${tag} 第一輪不是驗證輪`);
    const last = inf.rounds[inf.rounds.length - 1];
    ok(last.validates === true, `${tag} 最後一輪標成驗證輪`);
    eq(last.reveal, inf.examples.length - 1, `${tag} 驗證輪問的就是牆上最後一組（其餘都已經露出來了）`);
    eq(
      last.options.find((o) => o.correct).follows,
      'true',
      `${tag} 驗證輪的正解只有真正的規律答得出來`
    );
    const naive = last.options.filter((o) => o.follows === 'naive');
    ok(naive.length >= 1, `${tag} 驗證輪上放著「順手的規律」會給的那個答案`);
    for (const o of naive) {
      ok(!o.correct, `${tag} 照順手的規律答一定答錯（第四例真的驗證得到規則）`);
      ok(
        String(o.feedback || '').length >= 20,
        `${tag} 答錯的人拿到的是教學（講出那條規律為什麼被推翻），不是運氣`,
        o.feedback
      );
    }
    eq(inf.rounds.filter((r) => r.validates).length, 1, `${tag} 只有一輪是驗證輪`);
  }

  /* --- 雙面碑 --- */
  for (const id of byKind.tradeoff) {
    const tag = `[${id}]`;
    const tf = flowData.flows[id].tradeoffFlow;
    ok(isTradeoffFlow(tf), `${tag} 取捨資料合契約`);
    if (!isTradeoffFlow(tf)) continue;

    ok(nonEmptyStr(tf.ask) && tf.ask.length <= 44, `${tag} 取捨的問題一眼讀得完`, tf.ask);
    ok(CJK.test(tf.ask) && !ENGLISH(tf.ask), `${tag} 取捨的問題是中文`, tf.ask);
    eq(tf.sides.length, 2, `${tag} 剛好兩面（雙面碑）`);
    eq(new Set(tf.sides.map((x) => x.id)).size, 2, `${tag} 兩面的 id 不重複`);
    for (const side of tf.sides) {
      ok(nonEmptyStr(side.title) && side.title.length <= 16, `${tag} 「${side.id}」有短標題`, side.title);
      ok(CJK.test(side.title) && !ENGLISH(side.title), `${tag} 「${side.id}」的標題是中文`, side.title);
      ok(nonEmptyStr(side.gist), `${tag} 「${side.id}」有一句話說明它買到什麼`);
      ok(!ENGLISH(side.gist), `${tag} 「${side.id}」的說明是中文`, ENGLISH(side.gist) || '');
    }
    ok(tf.rounds.length >= 2 && tf.rounds.length <= 4, `${tag} 有 2–4 張卡`, `n=${tf.rounds.length}`);

    for (const [i, r] of tf.rounds.entries()) {
      const at = `${tag} 第 ${i + 1} 張卡`;
      ok(nonEmptyStr(r.ask) && r.ask.length <= 44, `${at} 有一句短問題`, r.ask);
      ok(CJK.test(r.ask) && !ENGLISH(r.ask), `${at} 問題是中文`, r.ask);
      ok(r.card && nonEmptyStr(r.card.label) && nonEmptyStr(r.card.text), `${at} 有一張看得到的卡`);
      ok(r.card.text.length <= 120, `${at} 卡上的字夠短`, `${r.card.text.length} 字`);
      ok(!ENGLISH(r.card.text), `${at} 卡是中文`, ENGLISH(r.card.text) || '');
      ok(tf.sides.some((x) => x.id === r.favours), `${at} 寫明這一張由哪一面勝出`, String(r.favours));
      /* ★ Phase C 的驗收條件：兩面都要收到誠實回饋 */
      for (const side of tf.sides) {
        const v = r.verdicts[side.id];
        ok(v && nonEmptyStr(v.text), `${at} 「${side.title}」也有判詞（倒向它一樣走得下去）`);
        ok(v && v.text.length >= 12, `${at} 「${side.title}」的判詞說得出理由`, v && v.text);
        ok(v && CJK.test(v.text) && !ENGLISH(v.text), `${at} 「${side.title}」的判詞是中文`, v && v.text);
        ok(v && !/https?:\/\//.test(v.text), `${at} 「${side.title}」的判詞不自帶連結`);
      }
      ok(
        r.verdicts[tf.sides[0].id].text.trim() !== r.verdicts[tf.sides[1].id].text.trim(),
        `${at} 兩面的判詞不是同一句（真的分得出差別）`
      );
      /* 輸的那一面不能被寫成「你錯了」—— 它只是這一張卡上比較貴 */
      const loser = tf.sides.find((x) => x.id !== r.favours);
      const lose = r.verdicts[loser.id].text;
      ok(
        !/你錯了|答錯|這是錯的|不可以用|不能用|絕對不(?:能|要|可)|一定不行/.test(lose),
        `${at} 沒被選中的那一面不會被說成「錯」（取捨不是對錯）`,
        lose
      );
    }
    /* ★ 不把取捨教成假通則：整關裡兩面都要贏過至少一次 */
    eq(
      new Set(tf.rounds.map((r) => r.favours)).size,
      2,
      `${tag} 兩面各贏過至少一張卡（換一張卡就翻面，不是通則）`,
      tf.rounds.map((r) => r.favours).join(',')
    );
  }

  /* --- 示範與推理：15 座教學神廟、整區沒有連續三座同型（C4） --- */
  const reasoning = challenges.filter((c) => c.region === 'reasoning');
  eq(reasoning.length, EXPECT.reasoningShrines.value, `示範與推理有 ${EXPECT.reasoningShrines.value} 座教學神廟`);
  ok(
    reasoning.every((c) => nonEmptyStr(c.primarySkillId)),
    '示範與推理每一關都接上了 v2 技能',
    reasoning.filter((c) => !c.primarySkillId).map((c) => c.id).join('、')
  );
  {
    const skills = reasoning.map((c) => c.primarySkillId);
    eq(new Set(skills).size, skills.length, '[reasoning] 每條技能只有一座神廟（C2）');
    const regionSkillIds = new Set(catalog.regionSkills('reasoning').map((s) => s.id));
    for (const id of skills) ok(regionSkillIds.has(id), `[reasoning] 神廟教的 ${id} 真的屬於這一區`);
    eq(
      regionSkillIds.size,
      skills.length,
      '[reasoning] 這一區的技能全部都有神廟了（15 / 15）',
      [...regionSkillIds].filter((x) => !skills.includes(x)).join('、')
    );
  }
  {
    /* C4：Phase C 之後這一區整區都是課程 v2 的神廟，所以整區都適用 */
    const kinds = reasoning.map((c) => kindOf(c.id));
    let run = 1;
    let worst = 1;
    for (let i = 1; i < kinds.length; i += 1) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      if (run > worst) worst = run;
    }
    ok(worst <= 2, '[reasoning] 整區沒有連續三座同一種題型（C4）', kinds.join(','));
    ok(new Set(kinds).size >= 4, '[reasoning] 這一區至少用了 4 種題型', [...new Set(kinds)].join(','));
  }

  /* 這一期新開的檢查器就是 expected-counts 登記的那幾個（不多開） */
  {
    const used = new Set(challenges.flatMap((c) => c.rubric.map((r) => r.check)));
    for (const id of EXPECT.v2CheckersLanded.value) {
      ok(CHECK_IDS.includes(id), `新檢查器 ${id} 真的實作了`);
      ok(used.has(id), `新檢查器 ${id} 真的被某一座神廟用到（不開沒人用的）`);
    }
  }
}

/* --- C1：新神廟只教一條（一條主檢查 ＋ 至多一條地基） --------------- */
/** 遷移 manifest 管的那 27 關（它們有真的祖先技巧，與新蓋的神廟規則不同）。 */
const migrationRows = readJson('docs/design/curriculum-v2-migration.json').challenges;
for (const c of challenges.filter((x) => x.primarySkillId)) {
  const tag = `[${c.id}]`;
  const primaries = c.rubric.filter((r) => r.primary);
  const foundations = c.rubric.filter((r) => r.foundation);
  eq(primaries.length, 1, `${tag} 恰好一條主檢查（C1）`, c.rubric.map((r) => r.check).join('、'));
  ok(foundations.length <= 1, `${tag} 地基至多一條（C1）`, foundations.map((r) => r.check).join('、'));
  eq(
    c.rubric.length,
    primaries.length + foundations.length,
    `${tag} rubric 上沒有既不是主檢查也不是地基的雜項（C1）`
  );
  for (const f of foundations) eq(f.weight, 0.5, `${tag} 地基 ${f.check} 權重 0.5`);
  ok(primaries[0].weight >= 1, `${tag} 主檢查權重不會比地基輕`, `weight=${primaries[0].weight}`);
  ok(!primaries[0].foundation, `${tag} 主檢查不會同時是地基`);
  eq(primaries[0].skillId, c.primarySkillId, `${tag} 主檢查那一列掛的是這一關的 v2 技能`);
  /*
   * 新蓋的神廟教的是 v2 技能，舊 68 條沒有祖先 → primaryTechniqueId 一律 null。
   * 但 Phase C 改造的既有五關**真的有祖先**（fewshot-01 / cot-02 …），
   * 收集不倒退（D2），所以它們照舊掛著 manifest 指定的那一條。
   */
  const migRow = migrationRows.find((r) => r.id === c.id);
  if (migRow) {
    eq(c.primaryTechniqueId, migRow.primaryTechniqueId, `${tag} 改造關仍掛 manifest 指定的舊主技巧`);
  } else {
    eq(c.primaryTechniqueId, null, `${tag} 新蓋的神廟不掛舊 68 條的主技巧（收集走 skillsV2）`);
  }
  // 第二幕的神諭原典接得出真實文件名 ＋ 可點連結（護欄 2）
  const src = zhContent.sourceForSkill(c.primarySkillId);
  ok(src && /^https:\/\//.test(src.url), `${tag} 主技能有可點的官方出處`, src ? src.url : '');
  ok(src && nonEmptyStr(src.name) && src.name !== src.url, `${tag} 神諭原典顯示的是文件名不是網址`, src ? src.name : '');
}
/* 撰寫基本功這一區已經長到 curriculum-v2 §3 的規模 */
eq(
  challenges.filter((c) => c.region === 'foundations').length,
  EXPECT.foundationsShrines.value,
  `撰寫基本功有 ${EXPECT.foundationsShrines.value} 關`
);
{
  const foundationSkills = challenges
    .filter((c) => c.region === 'foundations' && c.primarySkillId)
    .map((c) => c.primarySkillId);
  const regionSkillIds = new Set(catalog.regionSkills('foundations').map((s) => s.id));
  for (const id of foundationSkills) ok(regionSkillIds.has(id), `[foundations] 神廟教的 ${id} 真的屬於這一區`);
  eq(new Set(foundationSkills).size, foundationSkills.length, '[foundations] 每條技能只有一座神廟（C2）');
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
/* ================================================================== */
/* 課程 v2 · Phase D：合尺（constraint）                               */
/*                                                                    */
/*   這一種題型把「即時預檢」升格成舞台，所以它守的第一件事就是         */
/*   **沒有第二套評分邏輯**：尺上的燈是 checks.js 的 runCheck 跑出來的。 */
/*   另外三件：                                                        */
/*     · 完全資訊（P9）：每一把尺都用白話寫出它要量什麼                 */
/*     · 該挑的挑齊了 → 每一把尺都亮 ＝ 資料層的示範解答               */
/*     · 全部挑上去 → 一定有一把尺是暗的（不然「全選」就過關了）        */
/* ================================================================== */
console.log('\n▸ 合尺（課程 v2 · Phase D）');

{
  const { isConstraintFlow, composeConstraintText } = await import('../src/prompt/constraint.js');
  const constraintSrc = readFileSync(resolve(root, 'src/prompt/constraint.js'), 'utf8');

  /* 相容契約：缺資料一律退回石碑刻印（跟其他新題型同一條規則） */
  eq(flowKind({ kind: 'constraint' }), 'choice', '宣告了 constraint 卻沒有 constraintFlow → 退回石碑刻印');
  eq(
    flowKind({ kind: 'constraint', constraintFlow: flowData.flows['laden-desk-27'].constraintFlow }),
    'choice',
    '合尺少了刻印段落（slots）也要退回石碑刻印'
  );
  {
    const good = {
      kind: 'constraint',
      constraintFlow: JSON.parse(JSON.stringify(flowData.flows['laden-desk-27'].constraintFlow)),
      slots: flowData.flows['laden-desk-27'].slots,
    };
    eq(flowKind(good), 'constraint', 'constraint ＋ 合法資料 → 合尺');
    const noSpare = JSON.parse(JSON.stringify(good));
    for (const p of noSpare.constraintFlow.pieces) p.need = true;
    eq(flowKind(noSpare), 'choice', '每一片都是「該挑的」→ 資料不合契約，退回石碑刻印');
    const oneGauge = JSON.parse(JSON.stringify(good));
    oneGauge.constraintFlow.gauges = oneGauge.constraintFlow.gauges.slice(0, 1);
    eq(flowKind(oneGauge), 'choice', '只有一把尺 → 那不是合尺，退回石碑刻印');
  }

  /* 護欄 3：合尺沒有自己的判準，量尺用的就是 rubric 那一支引擎 */
  // 註解裡也會提到 runCheck，所以要先把註解剝掉再驗（不然改壞了測試也不會紅）
  const constraintCode = constraintSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(
    /from '\.\.\/challenges\/checks\.js'/.test(constraintCode) && /runCheck\(/.test(constraintCode),
    '合尺的尺是用 checks.js 的 runCheck 量的（沒有第二套評分邏輯）'
  );
  ok(!/score\s*[><=]/.test(constraintCode), '合尺自己不算分數（分數一律回 rubric 引擎）');

  for (const id of byKind.constraint) {
    const tag = `[${id}]`;
    const c = challenges.find((x) => x.id === id);
    const cf = flowData.flows[id].constraintFlow;
    ok(isConstraintFlow(cf), `${tag} 合尺資料合契約`);
    if (!isConstraintFlow(cf)) continue;

    ok(nonEmptyStr(cf.ask) && cf.ask.length <= 44, `${tag} 合尺的問題一眼讀得完`, cf.ask);
    ok(CJK.test(cf.ask) && !ENGLISH(cf.ask), `${tag} 合尺的問題是中文`, cf.ask);

    /* --- 尺：真的檢查器 ＋ 完全資訊 --- */
    ok(cf.gauges.length >= 2 && cf.gauges.length <= 5, `${tag} 檯上有 2–5 把尺`, `n=${cf.gauges.length}`);
    eq(new Set(cf.gauges.map((g) => g.check)).size, cf.gauges.length, `${tag} 同一把尺沒有量兩次`);
    for (const g of cf.gauges) {
      ok(CHECK_IDS.includes(g.check), `${tag} 尺「${g.check}」是真的離線檢查器`);
      ok(nonEmptyStr(g.want) && g.want.length >= 6 && g.want.length <= 40, `${tag} 尺「${g.check}」寫明它要量什麼（P9 完全資訊）`, g.want);
      ok(CJK.test(g.want) && !ENGLISH(g.want), `${tag} 尺「${g.check}」的說明是中文`, g.want);
      ok(!/https?:\/\//.test(g.want), `${tag} 尺「${g.check}」不自帶連結（出處只在刻文與圖鑑）`);
    }
    const primary = c.rubric.find((r) => r.primary);
    ok(
      cf.gauges.some((g) => g.check === primary.check),
      `${tag} 這一關教的那一條（${primary.check}）就在尺上（不會做完卻不知道學了什麼）`
    );

    /* --- 石片 --- */
    ok(cf.pieces.length >= 4 && cf.pieces.length <= 9, `${tag} 檯上有 4–9 片石片`, `n=${cf.pieces.length}`);
    eq(new Set(cf.pieces.map((p) => p.id)).size, cf.pieces.length, `${tag} 石片的 id 沒有重複`);
    const need = cf.pieces.filter((p) => p.need);
    const spare = cf.pieces.filter((p) => !p.need);
    ok(need.length >= 2, `${tag} 至少兩片是「該挑的」`, `n=${need.length}`);
    ok(spare.length >= 1, `${tag} 一定有不該挑的（不然全部挑起來就過關了）`, `n=${spare.length}`);
    for (const p of cf.pieces) {
      ok(nonEmptyStr(p.text), `${tag} 石片「${p.id}」有內容`);
      ok(!/https?:\/\//.test(p.text), `${tag} 石片「${p.id}」不自帶連結`);
      ok(!ENGLISH(p.text), `${tag} 石片「${p.id}」沒有英文句子`, ENGLISH(p.text) || '');
      if (p.need) continue;
      // 不該挑的那幾片：挑上去不會失敗，但一定要就地教人為什麼
      ok(String(p.why || '').trim().length >= 12, `${tag} 石片「${p.id}」挑上去有白話教學`, p.why);
      ok(CJK.test(p.why) && !ENGLISH(p.why), `${tag} 石片「${p.id}」的教學是中文`, p.why);
      ok(!/https?:\/\//.test(p.why), `${tag} 石片「${p.id}」的教學不自帶連結`);
    }

    /* --- 量尺：該挑的挑齊 → 全亮；全部挑上去 → 一定有一把暗的 --- */
    const needText = composeConstraintText(cf, need.map((p) => p.id));
    const dark = cf.gauges.filter((g) => !runCheck(g.check, needText).passed);
    eq(dark.length, 0, `${tag} 該挑的挑齊了，每一把尺都亮`, dark.map((g) => g.check).join('、'));
    eq(needText, c.sample, `${tag} 挑齊之後組出來的整段文字＝示範解答（兩種模式同一段字）`);
    const allText = composeConstraintText(cf, cf.pieces.map((p) => p.id));
    ok(
      cf.gauges.some((g) => !runCheck(g.check, allText).passed),
      `${tag} 全部挑上去一定有一把尺暗掉（合尺是取捨，不是「全選」）`
    );
    // 一片都沒挑的時候手掌印不會出現
    ok(
      cf.gauges.some((g) => !runCheck(g.check, '').passed),
      `${tag} 一片都沒挑的時候還沒合尺（手掌印不會出現）`
    );
  }
}


/* ================================================================== */
/* 課程 v2 · Phase E：量器坊（forms） —— 第六區、第一塊新地形            */
/*                                                                    */
/*   守四件事：                                                        */
/*     1. 14 座教學神廟一對一接上這一區的 14 條技能（C1／C2）           */
/*     2. 沿用既有題型、整區沒有連續三座同型（C4）                      */
/*     3. 世界真的長出來了：地形、地標、氣氛、路網、橋與閘門            */
/*     4. 軟門檻是**知識式**的（C8），而且規格與 regions-v2 逐字對得上   */
/* ================================================================== */
console.log('\n▸ 量器坊（課程 v2 · Phase E）');

{
  const forms = challenges.filter((c) => c.region === 'forms');
  eq(forms.length, EXPECT.formsShrines.value, `量器坊有 ${EXPECT.formsShrines.value} 座教學神廟`);
  ok(
    forms.every((c) => nonEmptyStr(c.primarySkillId)),
    '量器坊每一關都接上了 v2 技能',
    forms.filter((c) => !c.primarySkillId).map((c) => c.id).join('、')
  );
  {
    const skills = forms.map((c) => c.primarySkillId);
    eq(new Set(skills).size, skills.length, '[forms] 每條技能只有一座神廟（C2）');
    const regionSkillIds = catalog.regionSkills('forms').map((x) => x.id);
    eq(
      skills.slice().sort().join(','),
      regionSkillIds.slice().sort().join(','),
      '[forms] 這一區的 14 條技能全部有神廟了（一條不多、一條不少）'
    );
  }
  {
    /* C4：整區都是課程 v2 的神廟，所以整區都適用 */
    const kinds = forms.map((c) => kindOf(c.id));
    let run = 1;
    let worst = 1;
    for (let i = 1; i < kinds.length; i += 1) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      if (run > worst) worst = run;
    }
    ok(worst <= 2, '[forms] 整區沒有連續三座同一種題型（C4）', kinds.join(','));
    ok(new Set(kinds).size >= 4, '[forms] 至少用了四種題型', [...new Set(kinds)].join(','));
    for (const k of kinds) {
      ok(EXPECT.flowKinds.value.includes(k), `[forms] 題型 ${k} 是已經上線的那幾種（這一期不開新 kind）`);
    }
  }
  {
    /* 這一期開的九個新檢查器：真的實作了，而且真的被量器坊用到 */
    const PHASE_E_CHECKS = [
      'statesFormatPreference',
      'hasFallbackCategory',
      'avoidsSelfCounting',
      'saysWhatToPreserve',
      'definesToneConcretely',
      'bansFillerPhrases',
      'definesSchema',
      'noDuplicateSchemaRules',
      'namesDesignElements',
    ];
    const usedHere = new Set(
      forms.flatMap((c) => c.rubric.map((r) => r.check)).concat(
        forms.flatMap((c) => {
          const f = flowData.flows[c.id];
          return f && f.constraintFlow ? f.constraintFlow.gauges.map((g) => g.check) : [];
        })
      )
    );
    for (const id of PHASE_E_CHECKS) {
      ok(CHECK_IDS.includes(id), `新檢查器 ${id} 真的實作了`);
      ok(usedHere.has(id), `新檢查器 ${id} 真的被量器坊用到（不開沒人用的）`);
      ok(EXPECT.v2CheckersLanded.value.includes(id), `新檢查器 ${id} 登記進 expected-counts`);
    }
  }

  /* --- 世界：正南真的長出一片土地 --- */
  {
    const site = World.REGION_SITES.find((x) => x.id === 'forms');
    ok(Boolean(site), '世界資料裡有量器坊這片土地');
    ok(site.x === 0 && site.z > 0, '量器坊在正南（+Z）', `${site.x},${site.z}`);
    ok(site.radius > 30 && site.flat < site.radius, '量器坊的半徑與內圈合理', `${site.radius}/${site.flat}`);
    // 整片土地不能掉出地形網格（buildTerrain 的平面是 WORLD_RADIUS * 2 + 40）
    const half = World.WORLD_RADIUS + 20;
    for (const st of World.REGION_SITES) {
      ok(
        Math.abs(st.x) + st.radius <= half && Math.abs(st.z) + st.radius <= half,
        `[${st.id}] 整片土地都在地形網格裡`,
        `${Math.abs(st.z) + st.radius} / ${half}`
      );
    }
    // 與東南／西南兩片土地之間留得出虛空
    for (const other of World.REGION_SITES.filter((x) => x.id !== 'forms' && x.id !== 'foundations')) {
      const d = Math.hypot(site.x - other.x, site.z - other.z);
      ok(d > site.radius + other.radius, `量器坊與 ${other.id} 之間是虛空`, d.toFixed(1));
    }
    ok(World.coverage(site.x, site.z) > 0.9, '量器坊的中心是實地');
    const corridor = World.CORRIDORS.find((c) => c.region === 'forms');
    ok(Boolean(corridor), '有一條橋通往量器坊');
    ok(corridor.gateAt > 0 && corridor.gateAt < corridor.length, '量器坊的閘門在橋中段');
    // 地貌真的跟別區不一樣（一階一階的鑄場台階）
    const heights = [];
    for (let dz = -30; dz <= 30; dz += 6) heights.push(World.terrainHeight(site.x, site.z + dz));
    ok(Math.max(...heights) - Math.min(...heights) > 2, '量器坊的地貌有起伏（不是一塊平板）', heights.map((h) => h.toFixed(1)).join(','));
    ok(
      heights.every((h, i) => i === 0 || h <= heights[i - 1] + 0.4),
      '量器坊由北往南一階一階降下去（像一把躺著的尺）',
      heights.map((h) => h.toFixed(1)).join(',')
    );
  }
  {
    const lm = LANDMARKS_FOR_TEST.find((l) => l.region === 'forms');
    ok(Boolean(lm), '量器坊有自己的地標');
    eq(lm.id, 'gauge-column', '量器坊的地標是刻度之柱');
    ok(lm.height >= 21 && lm.height <= 27, '刻度之柱落在地標的高度階（21–27 公尺）', String(lm.height));
    ok(lm.clear >= 14, '刻度之柱周圍留白 ≥ 14 公尺', String(lm.clear));
  }
  {
    const a = World.REGION_ATMOSPHERE.forms;
    ok(Boolean(a), '量器坊有自己的氣氛設定');
    ok(a.motes < 1, '量器坊的螢火最少（沒有人在這裡走動很久了）', String(a.motes));
  }
  {
    const vign = Props.STORY_VIGNETTES.filter((v) => v.region === 'forms');
    ok(vign.length >= 2 && vign.length <= 4, '量器坊有 2–4 組故事小景', `n=${vign.length}`);
  }

  /* --- 軟門檻：知識式（C8），而且與 regions-v2 的規格逐字對得上 --- */
  {
    const { REGION_GATES } = await import('../src/progression/progression.js');
    const spec = (regionsV2.regions.find((r) => r.id === 'forms') || {}).gate || {};
    const gate = REGION_GATES.forms;
    ok(Boolean(gate), 'REGION_GATES 上有量器坊');
    ok(Boolean(gate.knowledge), '量器坊的門檻是知識式的（不是等級數字）');
    eq(
      (gate.knowledge.skills || []).join(','),
      (spec.skills || []).join(','),
      '量器坊的技能門檻＝regions-v2 的規格'
    );
    eq(
      (gate.knowledge.regionSkills || []).map((r) => `${r.regionId}:${r.count}`).join(','),
      (spec.regionSkills || []).map((r) => `${r.regionId}:${r.count}`).join(','),
      '量器坊的區域門檻＝regions-v2 的規格'
    );
    eq(gate.requires, null, '量器坊不看「前一區通關幾關」（知識即升級）');
    for (const id of gate.knowledge.skills) ok(Boolean(catalog.skill(id)), `門檻上的技能 ${id} 真的存在`);
    for (const r of gate.knowledge.regionSkills) {
      ok(catalog.isRegionImplemented(r.regionId), `門檻指到的區域 ${r.regionId} 已經上線`);
    }
    /* 門檻真的走得到：那條技能一定有某一關教得到（自己的神廟或 legacy teaches） */
    for (const id of gate.knowledge.skills) {
      const skill = catalog.skill(id);
      const reachable =
        challenges.some((c) => c.primarySkillId === id) ||
        (skill.legacyTechniqueId && challenges.some((c) => (c.teaches || []).includes(skill.legacyTechniqueId)));
      ok(reachable, `門檻上的技能 ${id} 真的有關卡教得到（門不會鎖死）`);
    }
    /* 先行前往仍然走得通（護欄：知識式門檻沒有把 skippedGates 拆掉） */
    memory.clear();
    const skipProg = createProgression({ catalog, challenges });
    eq(skipProg.isRegionUnlocked('forms'), false, '新存檔時量器坊是鎖著的');
    const st = skipProg.gateStatus('forms');
    ok(st.knowledgeGaps.length > 0, '閘門說得出還差哪幾條', JSON.stringify(st.knowledgeGaps));
    ok(/也可以先行前往/.test(st.text), '量器坊的閘門一樣會問「想先過去看看嗎」', st.text);
    ok(!/clear-specific|forms|config\b/.test(st.text), '閘門說的是中文技能名，不是資料層的 id', st.text);
    skipProg.skipGate('forms');
    eq(skipProg.isRegionUnlocked('forms'), true, '先行前往照樣開得了量器坊的門');
    eq(skipProg.state.xp, 0, '先行前往一分 XP 都不加');
    memory.clear();
  }

  /* --- 配樂：這一區沒有音檔，走合成 pad（護欄 3） --- */
  {
    const { REGION_MOODS: MOODS, BGM_TRACKS: TRACKS, SYNTH_ONLY_REGIONS } = await import('../src/audio/audio.js');
    ok(SYNTH_ONLY_REGIONS.includes('forms'), '量器坊誠實登記成「還沒有配樂音檔」');
    ok(!TRACKS.forms, '量器坊沒有音檔條目（不假裝有一首）');
    ok(Boolean(MOODS.forms), '量器坊有自己的合成配樂性格');
    for (const other of Object.keys(MOODS).filter((k) => k !== 'forms')) {
      ok(MOODS.forms.root !== MOODS[other].root, `量器坊的根音與 ${other} 不同（不是拿別區的來墊）`);
    }
  }
}

console.log('\n▸ 稱號與分享卡（Phase 21）');

const ranksFile = readJson('src/data/ranks.json');
const RANKS = ranksFile.ranks;
const { rankFor, rankSatisfied, rankStats, rankThreshold } = await import('../src/progression/ranks.js');

/*
 * 課程 v2 · Phase B：稱號門檻可以寫 "all"（＝目前的技巧總數 / 已上線區域數），
 * 由 catalog 現算。測試一律先解析成數字再比，所以課程長大時這一段不必再改。
 */
const RANK_WHOLE = { total: catalog.counts.techniques, regions: catalog.counts.implementedRegions };
const thrCollected = (r) => rankThreshold(r.collected, RANK_WHOLE.total);
const thrMastered = (r) => rankThreshold(r.mastered, RANK_WHOLE.regions);
/** 拿這個稱號自己的門檻當「剛好達到」的 stats（含 catalog 的總量，"all" 才解析得出來）。 */
const atRank = (r) => ({
  level: r.level,
  collected: thrCollected(r),
  mastered: thrMastered(r),
  ...RANK_WHOLE,
});

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
  ok(
    r.collected === 'all' || (Number.isInteger(r.collected) && r.collected >= 0),
    `${r.id} 的收集門檻是非負整數或 "all"`
  );
  ok(
    r.mastered === 'all' || (Number.isInteger(r.mastered) && r.mastered >= 0),
    `${r.id} 的精通門檻是非負整數或 "all"`
  );
  ok(thrCollected(r) <= RANK_WHOLE.total, `${r.id} 的收集門檻拿得到（不超過目前技巧總數）`, `${thrCollected(r)}`);
  ok(thrMastered(r) <= RANK_WHOLE.regions, `${r.id} 的精通門檻拿得到（不超過已上線區域數）`, `${thrMastered(r)}`);
  // 稱號是風味內容：不得帶連結、不得自帶 source（真正的出處只在關卡與圖鑑）
  ok(!/https?:\/\//.test(JSON.stringify(r)), `${r.id} 不自帶連結`);
  ok(!('source' in r) && !('sources' in r), `${r.id} 沒有 source 欄位`);
  const eng = ENGLISH(`${r.title}。${r.line}`);
  ok(!eng, `${r.id} 的玩家可見文字沒有英文句子`, eng || '');
}

eq(RANKS[0].level, 1, '第一個稱號從 Lv.1 起算');
eq(RANKS[0].collected, 0, '第一個稱號不需要任何收集');
eq(RANKS[0].mastered, 0, '第一個稱號不需要任何精通');
eq(thrCollected(RANKS[RANKS.length - 1]), catalog.counts.techniques, '最後一個稱號要求收集全部技巧（由 catalog 現算）');
eq(
  thrMastered(RANKS[RANKS.length - 1]),
  catalog.counts.implementedRegions,
  '最後一個稱號要求所有已上線的土地全部精通（由 catalog 現算）'
);
eq(RANKS[RANKS.length - 1].collected, 'all', '最後一個稱號的收集門檻寫成 "all"，不是寫死的數字');
eq(RANKS[RANKS.length - 1].mastered, 'all', '最後一個稱號的精通門檻寫成 "all"，不是寫死的數字');

for (let i = 1; i < RANKS.length; i += 1) {
  const a = RANKS[i - 1];
  const b = RANKS[i];
  ok(b.level >= a.level, `門檻單調：${b.id} 的等級不低於 ${a.id}`);
  ok(thrCollected(b) >= thrCollected(a), `門檻單調：${b.id} 的收集數不低於 ${a.id}`);
  ok(thrMastered(b) >= thrMastered(a), `門檻單調：${b.id} 的精通數不低於 ${a.id}`);
  ok(
    b.level > a.level || thrCollected(b) > thrCollected(a) || thrMastered(b) > thrMastered(a),
    `${b.id} 至少有一項門檻真的變高（否則會被 ${a.id} 蓋掉）`
  );
}

// 拿每個稱號自己的門檻去查，一定要查回它自己（不會被上一個或下一個蓋掉）
for (let i = 0; i < RANKS.length; i += 1) {
  const r = RANKS[i];
  const got = rankFor(atRank(r), RANKS);
  eq(got.rank.id, r.id, `門檻剛好達到時就是「${r.title}」`);
  eq(got.index, i, `${r.id} 的序號正確`);
  eq(got.next ? got.next.id : null, RANKS[i + 1] ? RANKS[i + 1].id : null, `${r.id} 指得出下一個稱號`);
}
const MAXED = { level: 99, collected: 999, mastered: 99, ...RANK_WHOLE };
eq(rankFor({ level: 0, collected: 0, mastered: 0, ...RANK_WHOLE }, RANKS).rank.id, RANKS[0].id, '什麼都沒有時是第一個稱號');
eq(rankFor(MAXED, RANKS).rank.id, RANKS[RANKS.length - 1].id, '滿到爆時是最後一個稱號');
eq(rankFor(MAXED, RANKS).next, null, '最後一個稱號沒有下一個');
eq(rankFor({ level: 1, collected: 0, mastered: 0 }, []).rank, null, '沒有稱號資料時安靜回 null（不丟例外）');
// 三個條件是 AND：等級夠但收集不夠，不能晉級
eq(
  rankFor({ ...MAXED, collected: thrCollected(RANKS[1]) - 1 }, RANKS).rank.id,
  RANKS[0].id,
  '等級再高，收集數不夠就晉不了級（三個條件是 AND）'
);
eq(rankSatisfied({ level: 1, collected: 0, mastered: 0, ...RANK_WHOLE }, RANKS[1]), false, 'rankSatisfied：門檻沒到就是 false');
// "all" 是「現算」不是「寫死」：技巧總數變多時，最高階稱號的門檻要跟著變高
eq(
  rankSatisfied({ level: 99, collected: catalog.counts.techniques, mastered: 99, total: catalog.counts.techniques + 10, regions: 99 }, RANKS[RANKS.length - 1]),
  false,
  '"all" 會跟著課程長大：技巧總數變多時，原本的收集數就不再算「全部」'
);

/* --- 每一個稱號都走得到：用真的進程系統跑一次「全部只拿 C」的最壞路徑 --- */
memory.clear();
const rankProg = createProgression({ catalog, challenges });
const visited = [];
function noteRank() {
  const info = rankFor(rankStats(rankProg, catalog), RANKS);
  if (!visited.length || visited[visited.length - 1] !== info.rank.id) visited.push(info.rank.id);
}
noteRank();
const zeroStats = rankStats(rankProg, catalog);
eq(zeroStats.level, 1, 'rankStats：新存檔是 Lv.1');
eq(zeroStats.collected, 0, 'rankStats：新存檔收集 0 條');
eq(zeroStats.mastered, 0, 'rankStats：新存檔精通 0 片');
eq(zeroStats.total, catalog.counts.techniques, 'rankStats：技巧總數正確');
eq(zeroStats.regions, catalog.counts.implementedRegions, 'rankStats：區域數只算已上線的（不含尚未蓋好的七區）');
// 舊呼叫端（直接丟 curriculum.json）行為必須完全一樣
/*
 * 課程 v2 · Phase E 之後這兩邊不再逐欄相同 —— catalog 真的多了量器坊。
 * 但**只准差在區域數**：舊呼叫端（直接丟 curriculum.json）看到的仍然是既有五區。
 */
{
  const legacyStats = rankStats(rankProg, curriculum);
  const catalogStats = rankStats(rankProg, catalog);
  eq(legacyStats.regions, curriculum.groups.length, 'rankStats：丟 curriculum 時只看得到既有五區');
  eq(catalogStats.regions, catalog.counts.implementedRegions, 'rankStats：丟 catalog 時看得到全部已上線的區域');
  eq(
    JSON.stringify({ ...legacyStats, regions: 0, mastered: 0, masteredRegions: [] }),
    JSON.stringify({ ...catalogStats, regions: 0, mastered: 0, masteredRegions: [] }),
    'rankStats：除了區域數以外每一欄都一樣（相容層沒有偷偷改行為）'
  );
}

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
const finalStats = rankStats(rankProg, catalog);
eq(finalStats.collected, catalog.counts.techniques, '全 C 通關後所有技巧全收集');
eq(finalStats.mastered, catalog.counts.implementedRegions, '全 C 通關後所有已上線的土地全精通');
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
/* Phase 28：分享 ＝ 圖 ＋ 一段話                                       */
/*                                                                    */
/*   · 分享出去的東西只有兩樣：那張卡的圖檔，加上玩家自己那段話          */
/*   · 玩家貼出去的話裡**不准有網址** —— 收到的人要看到圖，不是一個連結  */
/*   · Phase 24 那排「分享到 Facebook / Threads」的網頁入口已經拿掉      */
/*     （它們帶不走圖片，收到的人只看得到連結 —— 那正是要修的 bug）      */
/*   · 零 SDK、零註冊、零外部腳本 —— 全部是玩家按下去才發生的一次動作    */
/*   · 圖片本身只能交給系統分享面板 → 支援才露出那個入口（feature detect）*/
/* ================================================================== */
console.log('\n▸ 分享 ＝ 圖 ＋ 一段話（Phase 28）');

const shareMod = await import('../src/ui/sharecard.js');
const { SHARE_URL, SHARE_TAGLINE, shareText, shareCaption, systemShareSupported } = shareMod;
const shareSrc = readFileSync(resolve(root, 'src/ui/sharecard.js'), 'utf8');

/* --- 網址：留一個常數給部署用，但不進玩家看到的那段話 --- */
eq(SHARE_URL, 'https://github.com/romanticamaj/promptasy', '網址常數還在（部署後才會改）');
ok(/TODO 部署後改成正式網址/.test(shareSrc), '網址上面留著「部署後要改」的字條');
ok(/^https:\/\//.test(SHARE_URL), '網址常數是 https');
// 檔案裡出現的每一個網域都要在這張清單上（不准偷偷冒出第三方服務）
const shareHosts = [...new Set((shareSrc.match(/https?:\/\/[^\s'"`)]+/g) || []).map((u) => new URL(u).host))];
eq(
  shareHosts.sort().join(','),
  'github.com,www.facebook.com,www.instagram.com,www.threads.com',
  '整份檔案只出現這幾個網域（部署網址 ＋ 三個平台，沒有第三方服務）'
);
ok(!/promptasy\.(app|com|io|dev)/.test(shareSrc), '沒有憑空發明的網域');
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
ok(codexText.includes('Promptasy'), '那句話講得出這是什麼遊戲', codexText);
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
/* --- 那段話：世界的說法 ＋ 品牌落款，**沒有網址** --- */
const caption = shareCaption(shareModel);
ok(caption.startsWith(codexText), '那段話就是世界的說法 ＋ 品牌那一句');
ok(caption.includes(SHARE_TAGLINE), '那段話帶著品牌那一句當落款');
ok(!caption.includes(SHARE_URL), '那段話不帶網址（分享的是圖，不是連結）', caption);
for (const kind of ['codex', 'result', 'mastery', 'finale']) {
  const c = shareCaption({ ...shareModel, kind, headline: '清晰之門', grade: 'S' });
  ok(!/https?:\/\//.test(c), `${kind} 那段話裡沒有任何連結`, c);
  ok(!/github/i.test(c), `${kind} 那段話裡沒有程式碼倉庫的字眼`, c);
  ok(c.includes('Promptasy'), `${kind} 那段話講得出這是什麼遊戲`);
  ok(c.length <= 120, `${kind} 那段話不長（${c.length} 字）`);
}
eq(shareCaption({}).includes('旅人'), true, '沒資料時那段話也生得出來');

/* --- 舊的「只送一個連結」的入口仍然不准回來 --- */
eq(shareMod.platformIntent, undefined, '舊的「只帶文字與連結」的入口沒有回來');
eq(shareMod.isMobileLike, undefined, '不再需要猜是不是手機（Messenger 的特例已經走了）');
eq(shareMod.shareBody, undefined, '舊的「那句話 ＋ 網址」已經換成 shareCaption');
eq(shareMod.shareTitle, undefined, '系統分享只交出圖與那段話，不再另外塞標題');
for (const gone of ['facebook.com/sharer', 'fb-messenger://', 'https://www.threads.net']) {
  ok(!shareSrc.includes(gone), `分享卡上沒有「${gone}」這條只送得出連結的路`);
}

/* ------------------------------------------------------------------ *
 * Phase 31：那一排回來了，但每一顆都「先備好圖，再開那一頁」
 *
 * 規則變了（WORLD.md §3.5b）：
 *   平台入口**可以**存在，前提是它一定帶得走那張圖
 *   （剪貼簿或下載），而且不是把成果換成一個連結。
 * ------------------------------------------------------------------ */
const { SHARE_TARGETS, platformOpenUrl } = shareMod;
ok(Array.isArray(SHARE_TARGETS), '那一排是一份資料（不是散在程式裡的字串）');
eq(SHARE_TARGETS.length, 3, '一排三顆：Threads / Facebook / Instagram');
eq(SHARE_TARGETS.map((t) => t.id).join(','), 'threads,facebook,instagram', '順序：最順的那條路排前面');
for (const t of SHARE_TARGETS) {
  ok(['clipboard', 'download'].includes(t.carry), `${t.id} 講得出圖怎麼跟過去`, String(t.carry));
  ok(['url', 'manual'].includes(t.textVia), `${t.id} 講得出那段話怎麼跟過去`, String(t.textVia));
  ok(!!t.label && /^[A-Za-z]+$/.test(t.label), `${t.id} 的名字就是平台自己的名字`, t.label);
  ok(t.toast && t.toast.length >= 12, `${t.id} 的提示講得出接下來要做什麼`, t.toast);
  ok(/[一-鿿]/.test(t.toast), `${t.id} 的提示是中文`, t.toast);
  ok(!/https?:\/\//.test(t.toast), `${t.id} 的提示裡沒有網址`, t.toast);
  // 護欄：每一顆都一定帶得走圖（這就是 Phase 24 與 Phase 31 的差別）
  ok(t.carry === 'clipboard' || t.carry === 'download', `${t.id} 一定帶得走圖（不是只送一個連結）`);
}
// 貼上那條路：剪貼簿裡只放圖 → 那一次 Ctrl+V 不會變成貼出一段字
for (const t of SHARE_TARGETS.filter((x) => x.carry === 'clipboard')) {
  eq(t.clipboard, 'image', `${t.id} 按下去時剪貼簿裡只放圖（貼上不會變成貼文字）`);
  ok(t.toast.includes('Ctrl+V'), `${t.id} 的提示直接寫出要按的那組鍵`, t.toast);
}
// 帶不進文字的那幾顆，一定要告訴玩家文字怎麼補
for (const t of SHARE_TARGETS.filter((x) => x.textVia === 'manual')) {
  ok(t.toast.includes('複製文案'), `${t.id} 帶不進文字 → 提示指得出「複製文案」那一顆`, t.toast);
}
ok(SHARE_TARGETS.some((t) => t.textVia === 'url'), '至少有一顆連文字都帶得進去（Threads）');
ok(SHARE_TARGETS.some((t) => t.carry === 'download'), '選檔案的那一種也有人走（Instagram）');

/* --- 開出去的網址：官方入口、https、沒有第三方轉址 --- */
const threadsUrl = platformOpenUrl('threads', { text: '我在 Promptasy 刻好了一張卡' });
ok(threadsUrl.startsWith('https://www.threads.com/intent/post?text='), 'Threads 走官方的撰寫入口', threadsUrl);
ok(
  threadsUrl.includes(encodeURIComponent('我在 Promptasy 刻好了一張卡')),
  'Threads 的網址真的把那段話帶進去（撰寫框會先填好）',
  threadsUrl
);
// threads.net 會 301 轉到 threads.com —— 直接寫新的網域，少跳一次
ok(!threadsUrl.includes('threads.net'), 'Threads 用的是現在的網域（不靠轉址）');
eq(platformOpenUrl('facebook'), 'https://www.facebook.com/', 'Facebook 就開首頁（沒有帶得動內容的撰寫入口）');
// `/create/select/` 這種路徑伺服器不認（2026-07 實測會落回一般首頁殼）→ 老實開首頁
eq(platformOpenUrl('instagram'), 'https://www.instagram.com/', 'Instagram 開首頁（網頁版沒有直接開撰寫的網址）');
ok(!/instagram\.com\/create/.test(shareSrc), '不用那個伺服器根本不認的假深連結');
eq(platformOpenUrl('nope'), null, '沒有的平台就回 null（不假裝有路）');
eq(platformOpenUrl('facebook', { text: 'x' }).includes('x'), false, 'Facebook 那條路不假裝帶得進文字');
for (const id of ['threads', 'facebook', 'instagram']) {
  const url = platformOpenUrl(id, { text: 'hi' });
  ok(/^https:\/\//.test(url), `${id} 開的是 https`, url);
  ok(!url.includes(SHARE_URL), `${id} 的網址裡沒有夾帶我們自己的連結（分享的是圖，不是連結）`, url);
}
// 每一顆都要對得到一個真的開得出去的網址
for (const t of SHARE_TARGETS) ok(!!platformOpenUrl(t.id, { text: 'x' }), `${t.id} 有一個開得出去的網址`);

/* --- 按下去做的事：手勢裡同步開新頁 ＋ 同步開始備圖 --- */
ok(/function goToPlatform/.test(shareSrc), '那一排有自己的一支處理函式');
const goBlock = shareSrc
  .slice(shareSrc.indexOf('function goToPlatform'), shareSrc.indexOf('  function mount()'))
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/await/.test(goBlock), '開新頁之前沒有任何 await（手勢不會斷、不會被當成彈出視窗擋掉）');
ok(!/async function goToPlatform/.test(shareSrc), '那支函式不是 async（手勢不會斷）');
ok(/openTab\(url\)/.test(goBlock), '真的開一個新分頁到那個平台');
ok(/copyImageOnly\(\)/.test(goBlock), '貼上那條路是「只把圖放進剪貼簿」');
ok(/downloadImage\(\)/.test(goBlock), '選檔案那條路是「先把圖存下來」');
ok(/const text = captionNow\(\);/.test(goBlock), '帶過去的那段話是按下去當下框裡的字');
ok(/'_blank', 'noopener,noreferrer'/.test(shareSrc), '開出去的那一頁動不到這一頁（noopener）');
ok(/copyImageOnly/.test(shareSrc) && /'image\/png': lastBlob/.test(shareSrc), '「只複製圖」複製的是備好的那張圖');
const imgOnlyBlock = shareSrc.slice(shareSrc.indexOf('async function copyImageOnly'), shareSrc.indexOf('/** 只把那段話放進剪貼簿'));
ok(!/text\/plain/.test(imgOnlyBlock), '「只複製圖」真的只有圖（沒有偷塞文字進去）');
ok(/copyTextOnly/.test(shareSrc) && /writeText/.test(shareSrc), '另外有一顆只複製那段話');
// 複製不了圖的瀏覽器：改走「存下來再選檔案」，一樣帶得走圖（不留死路）
ok(/target\.carry === 'clipboard' && !canCopyImage\(\)/.test(shareSrc), '複製不了圖的時候改走下載那條路');
ok(/ClipboardItem\.supports\('image\/png'\)/.test(shareSrc), '先問瀏覽器收不收 PNG（Safari 會挑型別）');
ok(/data-chip="caption"/.test(shareSrc), '「複製文案」也在那一排上（帶不進文字的平台靠它補）');
ok(/rovingList\(targetsEl, '\[data-chip\]'\)/.test(shareSrc), '那一排用方向鍵走得完（鍵盤優先）');
ok(/chip\.classList\.add\('is-used'\)/.test(shareSrc), '按過的石籤會變樣子（知道自己按過哪一顆）');

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

/* --- 手勢鏈：navigator.share 前面不准有 await --- */
const shareCallBlock = shareSrc
  .slice(shareSrc.indexOf("sysBtn.addEventListener('click'"), shareSrc.indexOf('\n  const api = {'))
  // 註解裡就寫著「前面不准有 await」—— 先把註解拿掉再檢查真正的程式
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
ok(shareCallBlock.includes('navigator.share({ files: [lastFile], text })'), '系統分享交出去的就是圖 ＋ 那段話');
ok(!/await/.test(shareCallBlock), 'navigator.share 之前沒有任何 await（手勢不會斷）');
ok(!/async/.test(shareCallBlock), '那個處理函式不是 async（手勢不會斷）');
ok(/lastFile/.test(shareCallBlock), '交出去的是開卡時就備好的那份 PNG');
ok(/const text = captionNow\(\);/.test(shareCallBlock), '那段話是按下去的當下才從框裡讀出來（讀到玩家改過的版本）');
ok(!/url:/.test(shareCallBlock), '不塞 url 欄位（帶了它有些系統會丟掉檔案，收到的人就只剩連結）');
ok(!/title:/.test(shareCallBlock), '也不塞 title 欄位 —— 只有圖與那段話');
ok(/prepareFile/.test(shareSrc) && /canvas\.toBlob/.test(shareSrc), '開卡時就把 PNG 備好');
ok(/AbortError/.test(shareSrc), '玩家自己取消不算失敗（不亂跳提示）');

/* --- 剪貼簿（沒有系統分享時的那條路）：圖 ＋ 那段話一起放進同一份 --- */
ok(/'image\/png': lastBlob/.test(shareSrc), '複製的是備好的那張圖');
ok(/'text\/plain'/.test(shareSrc), '同時把那段話也放進剪貼簿');
ok(/copyBundle\(captionNow\(\)\)/.test(shareSrc), '複製出去的那段話也是玩家改過的版本');
ok(/ClipboardItem/.test(shareSrc), '走的是瀏覽器內建的剪貼簿（沒有第三方）');

/* --- 那段話是一個真的能改的框 --- */
ok(/<textarea[^>]*data-caption/.test(shareSrc), '那段話是一個可以改的輸入框');
ok(/captionEdited = true/.test(shareSrc), '玩家改過就記起來');
ok(/if \(cap && !captionEdited\)/.test(shareSrc), '重畫時不會蓋掉玩家自己寫的話');
ok(/captionEdited = false/.test(shareSrc), '換一張卡時那段話回到預設');
ok(/for="sharecard-say"/.test(shareSrc) && /id="sharecard-say"/.test(shareSrc), '那個框有自己的標籤（螢幕閱讀器唸得出來）');
ok(/aria-describedby="sharecard-sayhint"/.test(shareSrc), '框旁邊那句說明綁得回框本身');
const shareCss = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const sayBoxCss = shareCss.slice(shareCss.indexOf('.sharecard__saybox'), shareCss.indexOf('.sharecard__saybox') + 700);
ok(/--font-input/.test(sayBoxCss), '玩家自己打的字走系統字型（子集缺字也不會破圖）');
ok(/\.sharecard__chip/.test(shareCss), '那一排石籤有自己的樣式');
ok(/\.sharecard__chips/.test(shareCss) && /\.sharecard__sendlabel/.test(shareCss), '那一排有標題與容器的樣式');

/* --- 鍵盤（Phase 23 的文法） --- */
ok(/<kbd>Tab<\/kbd>/.test(shareSrc), '畫面上說得出 Tab 走到下一個');
ok(/<kbd>Enter<\/kbd>/.test(shareSrc), '畫面上說得出 Enter 可以按下去');
ok(/<kbd>←<\/kbd>/.test(shareSrc) && /<kbd>→<\/kbd>/.test(shareSrc), '那一排在畫面上教得出方向鍵怎麼走');
ok(/aria-label="把這張圖和這段話一起分享出去"/.test(shareSrc), '主入口有給螢幕閱讀器的說明');
ok(/overlay\.open\(\{ focus: heroAction\(\) \}\)/.test(shareSrc), '開卡時焦點落在這個畫面的主角上');

/* --- 畫面上的說明：中文、老實、不出現系統術語 --- */
const shareCopy = (shareSrc.match(/class="sharecard__hint"[^>]*>([^<]*)/g) || []).map((s) => s.replace(/^[^>]*>/, ''));
ok(shareCopy.length >= 2, '畫面上有說明「貼上之後會發生什麼」');
const hintAll = shareCopy.join(' ');
ok(hintAll.includes('Facebook') && hintAll.includes('Instagram') && hintAll.includes('Threads'), '說明點得出常見的那幾個地方', hintAll);
ok(hintAll.includes('貼上'), '說明講得出「直接貼上」這個動作', hintAll);
ok(hintAll.includes('圖和文字'), '說明講得出圖和文字會一起送出', hintAll);
ok(!/連結/.test(hintAll), '說明不再提「連結」（分享的是圖，不是連結）', hintAll);
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
/* ================================================================== */
/* 開場（入場門 Phase 33 ＋ 黑幕與標題卡 Phase 34）                    */
/*                                                                    */
/* 自動播放被擋的首次造訪，先出一道門把「必要的那一下手勢」變成一個     */
/* 有意義的動作；門推開之後，標題卡的揭示才和開場曲一起發生。           */
/* 自動播放放行的造訪（返客 / 測試環境）完全看不到這道門。             */
/*                                                                    */
/* Phase 34 再加一條硬規則：**按下開始之前，3D 世界一眼都不准被看到**   */
/* —— 由寫在 index.html 裡的黑幕 `#bootcover` 負責（行內樣式，第一幀    */
/* 就生效；styles.css 是 main.js import 進來的，那之前保護不到）。      */
/*                                                                    */
/* 這裡是原始碼層級的看門狗：DOM 行為由 e2e 兩種自動播放政策各跑一次。 */
/* ================================================================== */
console.log('\n▸ 開場（入場門 ＋ 黑幕 ＋ 標題卡）');

const gateSrc = readFileSync(resolve(root, 'src/ui/entrygate.js'), 'utf8');
const titleSrc = readFileSync(resolve(root, 'src/ui/title.js'), 'utf8');
const bootSrc = readFileSync(resolve(root, 'src/main.js'), 'utf8');
const gateCss = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

/* --- 文案：一盞燈 ＋ 一句話 ＋ 一行小小的提示（Phase 34：極簡化） --- */
ok(/推開夜色之門/.test(gateSrc), '門上寫著「推開夜色之門」');
// Phase 34.5（站長定稿）：門上只剩呼吸燈 ＋ 一句話 ＋ sr-only 的提示，
// 原本第三樣東西（`.entrygate__hint` 的「點擊進入⋯」）連同樣式整組撤掉。
ok(
  !/entrygate__hint/.test(gateSrc) && !/\.entrygate__hint/.test(gateCss),
  '「點擊進入⋯」那行提示已整組移除（原始碼與樣式都沒有殘留）'
);
ok(/entrygate__orb/.test(gateSrc), '門上有一盞呼吸燈（不再是印記＋外框的按鈕）');
ok(!/entrygate__seal|entrygate__glyph|>enter</.test(gateSrc), 'Phase 33 的印記／外框／enter 已整組移除');
// 看不到「點一下」的人也要知道按什麼 —— 用 sr-only 把兩種操作一起講完
ok(/sr-only">點擊或按任意鍵進入</.test(gateSrc), '螢幕閱讀器聽得到「點擊或按任意鍵進入」（視覺上收起來）');
// 護欄 2：入口不是課程，不准放官方出處或技巧宣稱
ok(!/https?:\/\//.test(gateSrc.replace(/^[\s\S]*?\*\//, '')), '入場門不放任何連結（它是世界的入口，不是課程）');

/* --- 鍵盤優先（WORLD.md §3） --- */
ok(/addEventListener\('keydown'/.test(gateSrc), '任意鍵都推得開（鍵盤優先）');
ok(/addEventListener\('pointerdown'/.test(gateSrc), '點一下 / 觸控也推得開');
ok(/e\.key === 'Tab'/.test(gateSrc), 'Tab 留給無障礙導覽');
ok(/e\.key === 'Escape'/.test(gateSrc), 'Esc 在入口什麼都不做（沒有東西可以關）');
ok(/e\.repeat/.test(gateSrc), '按著不放的自動重複不算新的一下（不會穿透到標題卡）');
ok(/aria-modal/.test(gateSrc) && /aria-label/.test(gateSrc), '門有 dialog 語意與 aria 標籤');
ok(/\[data-enter\]'\)\?\.focus/.test(gateSrc), '開門時焦點就落在門上');

/* --- 解鎖一定要待在手勢的呼叫堆疊裡 --- */
const unlockLine = gateSrc.slice(gateSrc.indexOf('function leave'), gateSrc.indexOf('function onKey'));
ok(/onUnlock\?\.\(\)/.test(unlockLine), '推開的那一刻同步呼叫 onUnlock');
ok(
  !/setTimeout\([^)]*onUnlock/.test(gateSrc) && !/requestAnimationFrame\([^)]*onUnlock/.test(gateSrc),
  'onUnlock 沒有被包進 setTimeout / rAF（晚一拍瀏覽器就不認這個手勢）'
);
ok(/onUnlock: \(\) => \{\s*\n\s*audio\.start\(\);/.test(bootSrc), 'main.js 把音訊解鎖接在門的手勢上');
ok(/onEnter: \(\) => title\.open\(\)/.test(bootSrc), '門淡出之後才輪到標題卡');
// Phase 34：推開的那一下要有聲音，而且是石門的聲音（不是介面的「叮」）
ok(/audio\.cue\('gateOpen'\)/.test(bootSrc), '推開入場門會放一聲石門滑開（gateOpen）');
ok(
  bootSrc.indexOf("audio.cue('gateOpen')") > bootSrc.indexOf('onUnlock: () => {'),
  '那一聲就掛在 onUnlock（手勢的同一拍）'
);

/* --- 開機的岔路：放行就跳過門，被擋才出門 --- */
ok(/audio\.titleIntro\(\);/.test(bootSrc), '開機仍然先試一次開場曲');
ok(/if \(audio\.isRunning\(\)\) \{\s*title\.open\(\);/.test(bootSrc), '自動播放放行 → 直接開標題卡（零摩擦）');
ok(/entryGate\.open\(\);/.test(bootSrc), '被擋住 → 先出入場門');
ok(/audio\.whenRunning\(\d+\)\.then/.test(bootSrc), '出門的同時再非同步探測一次');
ok(/if \(running\) entryGate\.skip\(\)/.test(bootSrc), '探到其實放行 → 在玩家看見門的內容之前撤掉');
ok(/entryGate,/.test(bootSrc), '入場門掛上除錯把手（e2e 用得到）');

/* --- Phase 32.5 的兩段式喚醒已經整段拿掉 --- */
ok(!/awaken/.test(titleSrc), '標題卡不再有 awaken 攔截器');
ok(!/夜色醒了/.test(titleSrc), '「夜色醒了 —— 再按一次」那句話已移除');
ok(!/is-awake/.test(titleSrc) && !/is-awake/.test(gateCss), 'is-awake 狀態整組移除（樣式也沒有殘留）');
ok(!/awaken/.test(bootSrc), 'main.js 不再接兩段式喚醒');
ok(/按任意鍵開始/.test(titleSrc), '標題卡仍然是「按任意鍵開始」（一下就進得去）');

/* --- 標題卡的揭示延到 open() 才起跑 --- */
ok(/root\.hidden = true;/.test(titleSrc.slice(0, titleSrc.indexOf('let done'))), '標題卡預設收起（CSS 動畫等 open() 才跑）');
ok(/e\.repeat/.test(titleSrc), '標題卡也擋自動重複（推門那一下不會穿透進來）');

/* --- 樣式：近乎全黑、內容延遲浮出、reduce 下靜態顯示 --- */
ok(/\.entrygate \{/.test(gateCss), '入場門有自己的樣式區塊');
ok(/z-index: 45;/.test(gateCss.slice(gateCss.indexOf('.entrygate {'))), '門疊在標題卡（40）之上');
const veilBlock = gateCss.slice(gateCss.indexOf('.entrygate__veil {'), gateCss.indexOf('.entrygate__veil::before'));
ok(
  /background: #0[0-9a-f]{5};/.test(veilBlock),
  '門完全不透光（底下的世界與 HUD 都不會漏出來）',
  veilBlock.trim().slice(0, 120)
);
/*
 * 門上的兩樣東西都延遲 ≥0.3s 才出現 —— 探測到「其實可以自動播放」時我們會在
 * 220ms 內撤掉這道門，那條路上不能有任何字閃過去。
 */
for (const [cls, next] of [
  ['.entrygate__orb', '@keyframes gate-fade'],
  ['.entrygate__line', '.entrygate__enter:hover'],
]) {
  const block = gateCss.slice(gateCss.indexOf(`${cls} {`), gateCss.indexOf(next));
  const delay = Number((block.match(/animation:[^;]*?var\(--e-out\) ([\d.]+)s forwards/) || [])[1]);
  ok(delay >= 0.3, `${cls} 延遲 ${delay}s 才浮出（撤掉這道門時不會閃過去）`, String(delay));
}
// 呼吸燈：慢呼吸，而且是無限循環（不是一次性的閃一下）
const orbBlock = gateCss.slice(gateCss.indexOf('.entrygate__orb {'), gateCss.indexOf('@keyframes gate-fade'));
const breathe = Number((orbBlock.match(/entrygate-breathe ([\d.]+)s/) || [])[1]);
ok(breathe >= 4, `呼吸燈慢慢呼吸（${breathe}s 一次，比心跳慢一半）`, String(breathe));
ok(/entrygate-breathe [\d.]+s ease-in-out [\d.]+s infinite/.test(orbBlock), '呼吸是持續的，不是閃一下就停');
// 整道門就是一顆按鈕：不畫 focus 框（站長定稿），鍵盤的人靠 sr-only 那句知道要按什麼
ok(
  /\.entrygate__enter:focus-visible \{\s*outline: none;/.test(gateCss),
  '門上那顆按鈕不畫 focus 框（畫面上只留那幾個字）'
);
const reduceBlock = gateCss.slice(gateCss.indexOf('@media (prefers-reduced-motion: reduce)'));
for (const cls of ['.entrygate__inner', '.entrygate__orb', '.entrygate__line']) {
  ok(reduceBlock.includes(cls), `prefers-reduced-motion 下 ${cls} 仍然看得見（不靠動畫收尾）`);
}
// 名字是「從模糊裡對焦」進來的：動畫被關掉時模糊也要一起解除，不然會停在糊的那一幀
ok(/\.title__name \{\s*filter: none;/.test(reduceBlock), 'reduce 下名字的模糊一起解除（不會停在糊掉的那一幀）');

/* ------------------------------------------------------------------ */
/* Phase 34 · 黑幕：按下開始之前，世界一眼都不准被看到                 */
/* ------------------------------------------------------------------ */
const bootHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
ok(/id="bootcover"/.test(bootHtml), '黑幕的節點寫在 index.html 裡（第一幀就在）');
const coverCss = bootHtml.slice(bootHtml.indexOf('#bootcover {'), bootHtml.indexOf('</style>'));
ok(/<style>/.test(bootHtml), '黑幕的樣式是行內的（不等 styles.css 載完）');
ok(/position: fixed;/.test(coverCss) && /inset: 0;/.test(coverCss), '黑幕蓋滿整個視窗');
ok(/background: #0[0-9a-f]{5};/.test(coverCss), '黑幕是不透光的實色（不是半透明的紗）');
const coverZ = Number((coverCss.match(/z-index: (\d+);/) || [])[1]);
ok(coverZ > 30 && coverZ < 40, `黑幕壓在世界／HUD 之上、標題卡之下（z-index ${coverZ}）`, String(coverZ));
const coverFade = Number((coverCss.match(/transition: opacity ([\d.]+)s/) || [])[1]);
ok(coverFade >= 1 && coverFade <= 2, `黑幕用 ${coverFade} 秒慢慢淡出（像劇場的燈亮起來）`, String(coverFade));
ok(/#bootcover\.is-lifting \{\s*opacity: 0;/.test(coverCss), '掛上 is-lifting 才淡出');
ok(/prefers-reduced-motion/.test(coverCss), 'reduce 下黑幕收得更快（但仍然會收）');
// 只有「按下開始」那一刻才掀開；入場門那一下不算（門後面還有標題卡）
ok(/function liftBootCover\(\)/.test(bootSrc), 'main.js 有掀黑幕的那一支');
const titleStartBlock = bootSrc.slice(bootSrc.indexOf('const title = createTitle('), bootSrc.indexOf('ui.appendChild(title.root)'));
ok(/liftBootCover\(\);/.test(titleStartBlock), '黑幕在標題卡按下開始時才掀開');
ok(
  !/liftBootCover/.test(bootSrc.slice(bootSrc.indexOf('createEntryGate('), bootSrc.indexOf('ui.appendChild(entryGate.root)'))),
  '推開入場門不會掀黑幕（門後面還有標題卡）'
);

/* ------------------------------------------------------------------ */
/* Phase 34.5（站長定稿）· 標題卡：名字整個從模糊裡對焦 ＋ 兩句話一行  */
/* 一行淡入。打字機（Phase 34）整組撤掉 —— 節奏改由 CSS 的延遲決定，   */
/* 所以任何時候按下去都是「直接進場」，不會有半句話被打斷。            */
/* ------------------------------------------------------------------ */
ok(!/title__ch|stageName/.test(titleSrc), '分字揭示（每個字彈一下）已整組移除');
ok(!/title__foot/.test(titleSrc) && !/title__foot/.test(gateCss), '底部那行統計數字已移除（連樣式一起）');
ok(!/68 條技巧/.test(titleSrc), '標題卡不再列統計數字');
ok(!/title__typed|title__caret/.test(titleSrc), '打字機（游標）已整組移除（Phase 34.5 改成一行一行淡入）');
ok(
  /title__tag">\$\{esc\(subtitle\)\}<\/p>/.test(titleSrc) && /title__zh">/.test(titleSrc),
  '兩句話各自是一個完整節點（定位句 ＋ 中文那句），不再逐字塞進去'
);
ok(
  /title__zh">\$\{esc\(ZH_LINE_A\)\}<br \/>\$\{esc\(ZH_LINE_B\)\}/.test(titleSrc),
  '中文那句的換行是寫死的 <br />（斷句由設計決定，不靠視窗寬度）'
);
ok(!/TYPE_CJK|TYPE_LATIN/.test(titleSrc), '中英打字速度的常數已移除（沒有打字機就不需要速度）');
// 揭示節奏改由 CSS 延遲決定：定位句 → 中文兩行 → 開始鍵，一路往後排
// `.title__start` 在檔案裡出現兩次（前面是石牌的共用階），這裡只看標題卡那一段
const titleCssFrom = gateCss.indexOf('.title__tag {');
const delayOf = (cls, next) => {
  const from = gateCss.indexOf(`${cls} {`, titleCssFrom);
  const block = gateCss.slice(from, gateCss.indexOf(next, from));
  return Number((block.match(/animation: gate-fade [\d.]+s var\(--e-out\) ([\d.]+)s forwards/) || [])[1]);
};
const tagDelay = delayOf('.title__tag', '.title__zh {');
const zhDelay = delayOf('.title__zh', '/* 開始鍵');
ok(tagDelay > 0 && zhDelay > tagDelay, `兩句話一行一行淡入（定位句 ${tagDelay}s → 中文 ${zhDelay}s）`);
ok(
  ['.title__tag', '.title__zh'].every((cls) => reduceBlock.includes(cls)),
  'reduce 下兩句話仍然看得見（不靠動畫收尾）'
);
ok(/finishTyping\(\) \{\}/.test(titleSrc), 'finishTyping 只剩相容用的空殼（沒有東西可以補完）');
ok(
  /get isTyping\(\) \{\s*\n\s*return false;/.test(titleSrc),
  '舊 API isTyping 永遠回 false（呼叫端不必知道打字機沒了）'
);
const startFn = titleSrc.slice(titleSrc.indexOf('function start()'), titleSrc.indexOf('function onKey'));
ok(!/finishTyping/.test(startFn), '按下開始就直接離場（不再需要先把半句話補完）');
const nameBlock = gateCss.slice(gateCss.indexOf('.title__name {'), gateCss.indexOf('.title__accent {'));
ok(/filter: blur\(\d+px\)/.test(nameBlock), '名字從模糊裡對焦（整個一起，不是一個字一個字）');
ok(!/@keyframes ch-in/.test(gateCss), 'ch-in 的關鍵影格也清掉了');
const startDelay = delayOf('.title__start', '/* 呼吸的光沿著石牌');
ok(startDelay > zhDelay, `開始鍵等兩句話淡完才浮出（純 CSS 延遲 ${startDelay}s > ${zhDelay}s）`);
ok(
  /\.title\.is-ready \.title__start::before \{\s*animation: title-breathe/.test(gateCss),
  'is-ready 現在只負責開始鍵的呼吸光（不再是「打完字才顯示」的開關）'
);

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


/* ================================================================== */
/* ================================================================== */
/* 課程 v2 · Phase B step 2：技能收集（skillsV2）                      */
/*                                                                    */
/*   為什麼另開一欄：`collected` 存的是舊 68 條技巧的 id，圖鑑／徽章／  */
/*   稱號／隱藏成就都依它算；v2 的 130 條技能有一半以上在舊 68 條裡     */
/*   沒有祖先，混進去會讓那些數字失真。所以純加法多一欄，兩邊各記各的。 */
/* ================================================================== */
console.log('\n▸ 技能收集（課程 v2 · Phase B）');

{
  eq(SaveIO.defaultSave().skillsV2.length, 0, '新存檔的 skillsV2 是空的');
  const old = SaveIO.normalize({ version: 1, xp: 420, collected: ['clarity-01'], badges: { openai: 2 } });
  ok(Array.isArray(old.skillsV2), '舊存檔沒有 skillsV2 → 補成空陣列（不是 undefined）');
  eq(old.skillsV2.length, 0, '補出來的是空陣列');
  eq(SaveIO.normalize({ skillsV2: ['a', 'a', 7, 'b'] }).skillsV2.length, 2, 'skillsV2 去重並丟掉非字串');
  eq(old.xp, 420, '新欄位不影響 XP');
  eq(old.collected.length, 1, '新欄位不影響圖鑑');
  eq(old.badges.openai, 2, '新欄位不影響徽章');

  memory.clear();
  const prog = createProgression({ curriculum, challenges });
  const shrine = challenges.find((c) => c.primarySkillId === 'clear-scope');
  ok(Boolean(shrine), '找得到「只漆了第一節的欄杆」那座神廟');
  const before = prog.state.collected.length;
  const out = prog.recordResult(evaluate(shrine, shrine.sample));
  ok(out.bestGrade === 'S', '示範解答通關拿 S', String(out.bestGrade));
  ok(prog.isSkillCollected('clear-scope'), '通關之後這條 v2 技能被收進 skillsV2');
  eq(out.newlySkills.join(','), 'clear-scope', '結算會報出新收集到的技能');
  eq(
    prog.state.collected.length,
    before,
    '這座神廟的 v2 技能在舊 68 條裡沒有祖先 → 舊圖鑑一條都沒有多（收集面不被灌水）'
  );
  // 重玩不會重複記
  prog.recordResult(evaluate(shrine, shrine.sample));
  eq(prog.state.skillsV2.filter((x) => x === 'clear-scope').length, 1, '重玩同一座神廟不會重複記技能');

  // 有祖先的神廟：兩邊都要記（D2 的語意）
  const withLegacy = challenges.find((c) => c.primarySkillId === 'clear-golden');
  const out2 = prog.recordResult(evaluate(withLegacy, withLegacy.sample));
  ok(prog.isSkillCollected('clear-golden'), '有祖先的神廟一樣把技能記進 skillsV2');
  ok(prog.state.collected.includes('clarity-01'), '同時把 legacy 技巧收進舊圖鑑（D2：收集不倒退）');
  ok(out2.newlyCollected.includes('clarity-01'), '結算也報出新收集到的 legacy 技巧');

  // 重置清得乾淨
  prog.resetAll();
  eq(prog.state.skillsV2.length, 0, '重置會清掉已收集的技能');
}

/* Phase 29a：橋上的門會問你（先行前往）                              */
/* ================================================================== */
console.log('\n▸ 先行前往（詢問式閘門）');

{
  // 全新存檔：欄位在、是空的
  eq(SaveIO.defaultSave().skippedGates.length, 0, '新存檔的 skippedGates 是空的');
  // 舊存檔（Phase 28 之前）沒有這個欄位 → normalize 要補成空陣列，不能是 undefined
  const old = SaveIO.normalize({ version: 1, xp: 300, collected: ['clarity-01'] });
  ok(Array.isArray(old.skippedGates), '舊存檔沒有 skippedGates → 補成空陣列');
  eq(old.skippedGates.length, 0, '補出來的是空陣列');
  eq(SaveIO.normalize({ skippedGates: ['a', 'a', 9, 'b'] }).skippedGates.length, 2, 'skippedGates 去重並丟掉非字串');
  // 純加法：不能動到任何既有欄位
  eq(old.xp, 300, '新增欄位不影響 XP');
  eq(old.collected.length, 1, '新增欄位不影響圖鑑');

  memory.clear();
  const prog = createProgression({ curriculum, challenges });

  // 一開始只有 foundations
  eq(prog.isRegionUnlocked('reasoning'), false, '一開始 reasoning 是鎖住的');
  const before = prog.gateStatus('reasoning');
  eq(before.unlocked, false, '門是關的');
  eq(before.skipped, false, '而且不是先行前往開的');
  ok(before.needs.length >= 1, '講得出還差什麼', before.needs.join(' / '));
  ok(before.text.includes('先行前往'), '門上的說明有講「也可以先行前往」', before.text);

  // 先行前往
  const res = prog.skipGate('reasoning');
  eq(res.opened, true, '「直接前往」真的把門打開了');
  eq(prog.isRegionUnlocked('reasoning'), true, '那一區變成走得進去');
  eq(prog.hasSkippedGate('reasoning'), true, '記下「這道門是被問開的」');
  eq(prog.skippedGateCount(), 1, '先行前往的門數對得上');
  eq(prog.gateStatus('reasoning').skipped, true, 'gateStatus 也照實說');

  // 記帳誠實：一分 XP、一條技巧、一個徽章、一關評價都不能多
  eq(prog.state.xp, 0, '先行前往不給 XP');
  eq(prog.state.collected.length, 0, '先行前往不收技巧');
  eq(Object.keys(prog.state.bestGrades).length, 0, '先行前往不寫任何一關的評價');
  eq(prog.clearedCount('foundations'), 0, '前一區的通關數沒有被灌水');
  eq(Object.values(prog.state.badges).reduce((a, b) => a + b, 0), 0, '徽章一個都沒多');
  eq(prog.levelInfo().level, 1, '等級沒有被推上去');

  // 重複按不會重複記
  const again = prog.skipGate('reasoning');
  eq(again.opened, false, '已經開了的門不會再開一次');
  eq(again.alreadyOpen, true, '而且說得出「本來就開著」');
  eq(prog.skippedGateCount(), 1, '不會重複記帳');

  // 不認得的區域 id 不能偷開門
  eq(prog.skipGate('atlantis').opened, false, '不存在的區域開不了');
  eq(prog.skipGate('').opened, false, '空字串開不了');
  eq(prog.skippedGateCount(), 1, '亂傳的參數不會污染記錄');

  // 存檔：寫得進去、重讀還在
  const reloaded = createProgression({ curriculum, challenges });
  eq(reloaded.hasSkippedGate('reasoning'), true, '先行前往跨重整還記得');
  eq(reloaded.isRegionUnlocked('reasoning'), true, '那一區重整後仍然走得進去');
  eq(reloaded.state.xp, 0, '重整後 XP 仍然是誠實的 0');

  // 之後真的把條件補滿 → 不會再慶祝一次（它已經在 unlockedRegions 裡）
  // 課程 v2 · Phase E：擬態之鏡已經搬去量器坊，這裡要挑四關**還在撰寫基本功**的
  const clears = ['gate-of-clarity-01', 'postbox-sprite-02', 'lost-automaton-03', 'long-scroll-archive-05'];
  let lastOutcome = null;
  for (const id of clears) {
    const c = challenges.find((x) => x.id === id);
    lastOutcome = reloaded.recordResult({
      challengeId: id,
      passed: true,
      grade: 'S',
      teaches: c.teaches || [],
      baseXp: c.xp,
    });
  }
  eq(reloaded.clearedCount('foundations'), 4, '真的把前一區打到 4 關');
  ok(reloaded.levelInfo().level >= 3, '等級也真的到了', `Lv.${reloaded.levelInfo().level}`);
  eq(
    (lastOutcome.newlyUnlocked || []).includes('reasoning'),
    false,
    '條件補滿時不會把已經先行前往的門算成「新解鎖」（不會慶祝兩次）'
  );
  eq(reloaded.hasSkippedGate('reasoning'), true, '記號留著 —— 它仍然是被問開的那道門');

  // 重置：先行前往的記錄要一起清掉
  reloaded.resetAll();
  eq(reloaded.skippedGateCount(), 0, '重置後先行前往的記錄清空');
  eq(reloaded.isRegionUnlocked('reasoning'), false, '重置後那道門重新關上');
  memory.clear();
}

// 世界與 UI 的接線（靜態掃描）
{
  const gateSrc = srcOf('src/ui/gate.js');
  const worldSrc = srcOf('src/world/world.js');
  ok(/直接前往/.test(gateSrc), '對話框有「直接前往」');
  ok(/先留下修行/.test(gateSrc), '對話框有「先留下修行」');
  ok(/前方的試煉不會因此變簡單/.test(gateSrc), '有把話講清楚：門開了不代表題目變簡單');
  ok(/還差：/.test(gateSrc), '對話框說得出還差什麼');
  ok(!/https?:\/\//.test(gateSrc), '這是世界的一句話，不放官方連結（護欄 2）');
  ok(/createOverlay/.test(gateSrc), '沿用共用的覆蓋層（焦點鎖 / Esc / aria 都在）');
  ok(/focus: article\.querySelector\('\[data-stay\]'\)/.test(gateSrc), '預設焦點在「先留下修行」，不會誤按越過一整區');
  ok(/gateAsk\.isOpen \|\|/.test(mainSrc), '對話框打開時世界停手（算進 anyPanelOpen）');
  ok(/gateAsk\.isOpen\) gateAsk\.close\(\)/.test(mainSrc), 'Esc 收得起來');
  ok(/function proceedThroughGate/.test(mainSrc), '「直接前往」接到真的開門');
  ok(/world\.openGate\(regionId, true\)/.test(mainSrc), '開門帶著屏障淡出 ＋ 擴散光環（和考過時一樣）');
  ok(/GATE_ASK_RADIUS/.test(mainSrc), '走到門前會自己問（不用先學一個鍵）');
  ok(/gateAskSnoozed/.test(mainSrc), '選了「先留下修行」就不會被連問');
  ok(/status\.skipped/.test(worldSrc), '門上的字說得出「你是先行前往的」');
  ok(/skippedGateCount\(\) > 0/.test(settingsSrc), '設定頁誠實列出先行前往過幾道門');
  ok(/問問這道門/.test(mainSrc), 'HUD 的互動提示改成「問問這道門」');
  ok(/橋上的門/.test(srcOf('src/ui/keyhelp.js')), '操作一覽提到橋上的門也按 E');
}

/* ================================================================== */
/* Phase 29b：改名（PromptArcade → Promptasy）與存檔搬家              */
/* ================================================================== */
console.log('\n▸ 改名與存檔搬家');

{
  eq(SaveIO.SAVE_KEY, 'promptasy.v1.save', '存檔 key 換成新的命名空間');
  ok(SaveIO.LEGACY_SAVE_KEYS.includes('promptarcade.v1.save'), '舊 key 記在遷移清單裡');

  // (1) 全新：兩個 key 都沒有 → 新存檔
  memory.clear();
  eq(SaveIO.load().xp, 0, '兩個 key 都沒有 → 全新存檔');

  // (2) 只有舊 key → 搬過來，一分不少
  memory.clear();
  const legacySave = {
    version: 1,
    xp: 640,
    level: 6,
    unlockedRegions: ['foundations', 'reasoning', 'grounding'],
    collected: ['clarity-01', 'clarity-03', 'positive-01'],
    bestGrades: { 'gate-of-clarity-01': 'S', 'postbox-sprite-02': 'A' },
    loreRead: ['t1', 't2'],
    prologueSteps: ['p-a'],
    guidanceSeen: ['gate-of-clarity-01'],
    inscriptionsFound: ['i1'],
    secretsFound: ['s1'],
    handlesUsed: ['h1'],
    badges: { openai: 2, anthropic: 3, google: 1, xai: 0 },
    settings: { music: 'ambient-01', volume: 0.33, quality: 'low', muted: true, promptMode: 'free' },
    flags: { introSeen: true, prologueDone: true },
  };
  memory.set('promptarcade.v1.save', JSON.stringify(legacySave));
  const moved = SaveIO.load();
  eq(moved.xp, 640, '舊存檔的 XP 搬過來了');
  eq(moved.level, 6, '等級搬過來了');
  eq(moved.collected.length, 3, '已收集技巧搬過來了');
  eq(Object.keys(moved.bestGrades).length, 2, '關卡評價搬過來了');
  eq(moved.bestGrades['gate-of-clarity-01'], 'S', '評價本身沒有被改掉');
  eq(moved.unlockedRegions.length, 3, '已解鎖區域搬過來了');
  eq(moved.loreRead.length, 2, '讀過的石碑搬過來了');
  eq(moved.prologueSteps.length, 1, '序章進度搬過來了');
  eq(moved.guidanceSeen.length, 1, '看過的神諭刻文搬過來了');
  eq(moved.inscriptionsFound.length, 1, '刻文小語搬過來了');
  eq(moved.secretsFound.length, 1, '找到的祕密搬過來了');
  eq(moved.handlesUsed.length, 1, '動過的器物搬過來了');
  eq(moved.badges.anthropic, 3, '徽章搬過來了');
  eq(moved.settings.volume, 0.33, '設定搬過來了');
  eq(moved.settings.promptMode, 'free', '答題方式搬過來了');
  eq(moved.flags.prologueDone, true, '旗標搬過來了（不會被塞回教學）');
  eq(moved.skippedGates.length, 0, '舊存檔沒有的新欄位補成空陣列');
  ok(memory.has('promptasy.v1.save'), '搬完立刻寫進新 key');
  ok(memory.has('promptarcade.v1.save'), '舊 key 原封不動留著（想退版還在）');
  eq(JSON.parse(memory.get('promptasy.v1.save')).xp, 640, '寫進新 key 的內容正確');

  // (3) 兩個都在 → 新的優先（不能被舊的蓋回去）
  memory.clear();
  memory.set('promptarcade.v1.save', JSON.stringify({ version: 1, xp: 10 }));
  memory.set('promptasy.v1.save', JSON.stringify({ version: 1, xp: 999 }));
  eq(SaveIO.load().xp, 999, '兩個 key 都在時，新的優先');

  // (4) 只有舊 key 而且壞掉 → 不會爆，退回新存檔
  memory.clear();
  memory.set('promptarcade.v1.save', '{ 壞掉的 json');
  const realWarn2 = console.warn;
  console.warn = () => {};
  eq(SaveIO.load().xp, 0, '舊 key 壞掉也不會讓遊戲開不起來');
  console.warn = realWarn2;

  // (5) 重置：兩個 key 都清掉（不然重整又會被搬回來）
  memory.clear();
  memory.set('promptarcade.v1.save', JSON.stringify({ version: 1, xp: 500 }));
  memory.set('promptasy.v1.save', JSON.stringify({ version: 1, xp: 500 }));
  SaveIO.reset();
  eq(memory.has('promptasy.v1.save'), false, '重置清掉新 key');
  eq(memory.has('promptarcade.v1.save'), false, '重置也清掉舊 key');
  eq(SaveIO.load().xp, 0, '重置後重整仍然是新存檔（沒有被搬回來）');
  memory.clear();
}

// 品牌字串掃描
{
  const titleSrc = srcOf('src/ui/title.js');
  const indexHtml = srcOf('index.html');
  const pkg = JSON.parse(srcOf('package.json'));
  eq([...'Promptasy'].length, 9, '品牌名是 9 個字元（標題卡的拆字數）');
  ok(/const NAME = 'Promptasy'/.test(titleSrc), '標題卡的品牌名已改');
  ok(!/PromptArcade/.test(titleSrc), '標題卡不再出現舊名');
  ok(indexHtml.includes('<title>Promptasy — Learn Prompt Engineering by Playing</title>'), 'index.html 的 title 已改');
  ok(indexHtml.includes('og:title" content="Promptasy'), 'og:title 已改');
  ok(!/PromptArcade/.test(indexHtml), 'index.html 不再出現舊名');
  eq(pkg.name, 'promptasy', 'package.json 的名字已改');
  ok(/Learn Prompt Engineering by Playing/.test(titleSrc), '定位句留著（沒有跟著改名一起被砍掉）');
  // 分享出去的那段話
  ok(/Promptasy/.test(shareSrc), '分享的那段話落款是新名字');
  ok(!/PromptArcade/.test(shareSrc), '分享的那段話沒有舊名字殘留');
  eq(SHARE_URL, 'https://github.com/romanticamaj/promptasy', '網址常數跟著改名');
  // 除錯把手：新名字要有，舊名字留成別名
  ok(/window\.__promptasy = \{/.test(mainSrc), '除錯把手改叫 __promptasy');
  ok(/window\.__promptarcade = window\.__promptasy/.test(mainSrc), '舊名字留成別名（外面的腳本不會壞）');
  // 遊戲裡看得到的字串一律不准再出現舊名
  for (const rel of [
    'src/ui/codex.js',
    'src/ui/settings.js',
    'src/ui/intro.js',
    'src/ui/achievement.js',
    'src/ui/hud.js',
    'src/data/ranks.json',
    'src/data/builder-zh.json',
    'src/data/curriculum-zh.json',
    'src/data/dated-notes.json',
  ]) {
    ok(!/PromptArcade/.test(srcOf(rel)), `${rel} 不再出現舊品牌名`);
  }
  // 存檔那一支是唯一還准提舊名的地方（遷移用）
  ok(/promptarcade\.v1\.save/.test(srcOf('src/save/save.js')), '存檔模組留著舊 key（遷移需要）');
}

/* ================================================================== */
/* 課程 v2 · Phase 0／A：curriculum.json 不可變 ＋ 27 關遷移 manifest    */
/* ================================================================== */
console.log('\n▸ 課程 v2 遷移契約（Phase 0／A）');

{
  /* ---------------------------------------------------------------- */
  /* (1) curriculum.json 必須 byte-identical（CLAUDE.md 護欄 2）        */
  /*                                                                  */
  /* 68 條技巧的文字與官方連結是一手引文，任何「補充／翻譯／新技能」    */
  /* 都必須走獨立的 authored 資料層（curriculum-zh.json、coach.json、   */
  /* dated-notes.json、之後的 skill-codex-v2.json…），不得回寫原檔。    */
  /* 這裡把它的 sha256 釘死，改一個位元組就會紅。                       */
  /* ---------------------------------------------------------------- */
  const { createHash } = await import('node:crypto');
  const CURRICULUM_SHA256 = '53b0ca60917f763e82aec256bc3dc07cb809e07607415a3907e9e8d408b39062';
  const actualSha = createHash('sha256')
    .update(readFileSync(resolve(root, 'src/data/curriculum.json')))
    .digest('hex');
  ok(
    actualSha === CURRICULUM_SHA256,
    'curriculum.json 必須 byte-identical——新內容走 authored 資料層（src/data/curriculum-zh.json、coach.json、skill-codex-v2.json…），不要回寫這一檔',
    `expected ${CURRICULUM_SHA256}\n        actual   ${actualSha}`
  );

  /* ---------------------------------------------------------------- */
  /* (2) 27 關遷移 manifest（docs/design/curriculum-v2-migration.json） */
  /* ---------------------------------------------------------------- */
  const migration = readJson('docs/design/curriculum-v2-migration.json');
  const rows = migration.challenges;

  /*
   * manifest 是「既有 27 關的遷移契約」，不是關卡總表 ——
   * 課程 v2 之後新蓋的神廟（有 primarySkillId）不在它管的範圍內。
   */
  /*
   * manifest 管的是「既有 27 關的遷移」——一律以 manifest 的 id 為準。
   * Phase C 之後這 27 關裡有 5 關（示範與推理）也拿到了 primarySkillId，
   * 所以不能再用「沒有 primarySkillId」當判準（那會讓它們安靜地掉出這個迴圈）。
   */
  const manifestIds = new Set(migration.challenges.map((r) => r.id));
  const legacyChallenges = challenges.filter((c) => manifestIds.has(c.id));
  eq(rows.length, EXPECT.legacyChallenges.value, `manifest 有 ${EXPECT.legacyChallenges.value} 關（既有關卡一關都不能少）`);
  eq(migration.authored, 'game', 'manifest 標成遊戲自撰（它是實作契約，不是官方引文）');

  // id 與現況資料逐一對得起來（順序也一樣）
  const liveIds = legacyChallenges.map((c) => c.id);
  eq(rows.map((r) => r.id).join(','), liveIds.join(','), 'manifest 的 id 與既有 27 關完全一致（含順序）');

  // D1：處置分佈 —— 逐關表算出來的真實數字是 5 保留／20 改造／2 應用關
  const tally = rows.reduce((acc, r) => ((acc[r.disposition] = (acc[r.disposition] || 0) + 1), acc), {});
  eq(tally.keep, 5, 'D1：保留 5 關（逐關表逐行點名，不是摘要數字）');
  eq(tally.rework, 20, 'D1：改造 20 關');
  eq(tally.application, 2, 'D1：轉為應用關 2 關');
  eq(
    tally.keep + tally.rework + tally.application,
    rows.length,
    `D1：三種處置加起來剛好 ${rows.length}，沒有漏關也沒有重複`
  );
  for (const r of rows) {
    ok(['keep', 'rework', 'application'].includes(r.disposition), `${r.id} 的處置是三種之一`, r.disposition);
  }

  // 護欄 7：一關都不准刪
  ok(
    rows.every((r) => liveIds.includes(r.id)),
    'manifest 沒有憑空多出來的關卡（零刪除、零新增）'
  );

  const techIds = new Set(curriculum.techniques.map((t) => t.id));
  const checkIds = new Set(CHECK_IDS);
  const seenPrimary = new Set();

  /* §7.4 的新檢查器清單直接從設計書解析出來（不手抄一份會漂掉的副本） */
  const v2doc = readFileSync(resolve(root, 'docs/design/curriculum-v2.md'), 'utf8');
  const specBlock = v2doc.slice(v2doc.indexOf('### 7.4 檢查器'), v2doc.indexOf('### 7.5'));
  const V2_NEW_CHECKERS = new Set(
    [...specBlock.matchAll(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/gm)].map((m) => m[1])
  );
  eq(V2_NEW_CHECKERS.size, 59, 'curriculum-v2 §7.4 列出 59 個新檢查器');
  /*
   * §7.4 的 59 個一開始一個都還沒實作；每一期只開當期神廟需要的那幾個
   * （Phase B 開了五個）。真正要守的是「清單跟 Phase A 之前的既有 22 個不重疊」——
   * 那 22 個是課程 v2 開工前就有的檢查器，逐字寫在 §7.4 的「沿用既有檢查器」那一行。
   */
  const REUSED_22 = new Set(
    (v2doc.match(/\*\*沿用既有檢查器\*\*：22 個 — (.+)/) || [, ''])[1]
      .split('、')
      .map((x) => x.replace(/`/g, '').trim())
      .filter(Boolean)
  );
  eq(REUSED_22.size, 22, '§7.4 的「沿用既有檢查器」剛好 22 個');
  ok(
    [...REUSED_22].every((id) => checkIds.has(id)),
    '那 22 個沿用的檢查器今天都還在'
  );
  ok(
    [...V2_NEW_CHECKERS].every((id) => !REUSED_22.has(id)),
    '§7.4 的新檢查器沒有一個是那 22 個（清單沒有重疊）'
  );
  const V2_LANDED = [...V2_NEW_CHECKERS].filter((id) => checkIds.has(id));
  eq(
    V2_LANDED.slice().sort().join(','),
    EXPECT.v2CheckersLanded.value.slice().sort().join(','),
    `已經實作的新檢查器就是 expected-counts 登記的那幾個（${EXPECT.v2CheckersLanded.value.join(' / ')}）`
  );

  for (const r of rows) {
    const live = challenges.find((c) => c.id === r.id);

    /* D2：primaryTechniqueId —— 每關恰好一條主技巧，且必須是真的技巧 id */
    if (r.disposition === 'application') {
      eq(r.primaryTechniqueId, null, `${r.id}（應用關）不教新技巧，主技巧為 null`);
      eq(r.mainCheck, null, `${r.id}（應用關）沒有單一主檢查（它本來就是綜合題）`);
      /* Phase A：應用關暫時維持現況（真正的應用關型式等 Phase J）——
         但它一樣不准在畫面上宣稱「這一關教某一條技巧」。 */
      eq(live.primaryTechniqueId, null, `${r.id}（應用關）資料層的 primaryTechniqueId 也是 null`);
      ok(
        !live.rubric.some((x) => x.primary),
        `${r.id}（應用關）沒有任何一條被標成主教學目標`
      );
    } else {
      ok(
        typeof r.primaryTechniqueId === 'string' && techIds.has(r.primaryTechniqueId),
        `${r.id} 的 primaryTechniqueId 對得到 curriculum 裡真的技巧`,
        String(r.primaryTechniqueId)
      );
      ok(!seenPrimary.has(r.primaryTechniqueId), `${r.id} 的主技巧沒有跟別關撞號（C2：一條技巧只教一次）`);
      seenPrimary.add(r.primaryTechniqueId);
      eq(
        r.primaryTechniqueTitle,
        curriculum.techniques.find((t) => t.id === r.primaryTechniqueId).title,
        `${r.id} 的主技巧標題與 curriculum 一字不差`
      );

      /* C1：恰好 1 條主檢查 ＋ 至多 1 條地基 */
      ok(nonEmptyStr(r.mainCheck), `${r.id} 有且只有一條主檢查`);
      ok(
        r.foundationCheck === null || nonEmptyStr(r.foundationCheck),
        `${r.id} 的地基檢查至多一條（沒有就是 null）`
      );
      ok(
        r.mainCheck !== r.foundationCheck,
        `${r.id} 的主檢查與地基不是同一條`
      );
      // assignsTask 是及格線不是技巧 —— 不准當主檢查（gap-analysis §3 建議 1）
      ok(r.mainCheck !== 'assignsTask', `${r.id} 沒有拿 assignsTask 當「這一關教什麼」`);

      /* 主檢查要嘛今天就在這一關的 rubric 裡，要嘛是 §7.4 有規格的新檢查器 */
      const liveChecks = new Set(live.rubric.map((x) => x.check));
      if (r.newChecker) {
        ok(
          V2_NEW_CHECKERS.has(r.mainCheck),
          `${r.id} 的新主檢查 ${r.mainCheck} 在 curriculum-v2 §7.4 的 59 個新檢查器清單裡`
        );
        if (r.phaseD) {
          /*
           * Phase D：這一關的改造做完了，新檢查器也一起實作了 ——
           * 過渡用的 interimMainCheck 就此交棒（它必須已經從 rubric 上退場）。
           */
          ok(checkIds.has(r.mainCheck), `${r.id} 的新主檢查 ${r.mainCheck} 已經在 Phase D 實作`);
          ok(
            !liveChecks.has(r.interimMainCheck),
            `${r.id} 過渡用的 ${r.interimMainCheck} 已經交棒下台`,
            String(r.interimMainCheck)
          );
        } else {
          ok(!checkIds.has(r.mainCheck), `${r.id} 的主檢查 ${r.mainCheck} 確實還不存在（標成 newChecker）`);
          ok(
            nonEmptyStr(r.interimMainCheck) && liveChecks.has(r.interimMainCheck),
            `${r.id} 在新檢查器實作之前，有一條現有的 interimMainCheck 頂著`,
            String(r.interimMainCheck)
          );
        }
      } else if (r.phaseD && r.phaseD.mainCheck !== r.mainCheck) {
        /*
         * Phase D 換過主檢查的那一關（郵箱精靈的分揀台）：manifest 原本記的
         * mainCheck 是歷史值，現況以 phaseD.mainCheck 為準，理由寫在 phaseD.note。
         */
        ok(checkIds.has(r.phaseD.mainCheck), `${r.id} 的 Phase D 主檢查 ${r.phaseD.mainCheck} 真的實作了`);
        ok(nonEmptyStr(r.phaseD.note) && r.phaseD.note.length >= 20, `${r.id} 換掉主檢查有寫下理由`);
      } else {
        ok(liveChecks.has(r.mainCheck), `${r.id} 的主檢查 ${r.mainCheck} 今天就在它的 rubric 裡`);
        eq(r.interimMainCheck, null, `${r.id} 的主檢查已經存在，不需要過渡用的 interim`);
      }
      if (r.foundationCheck && !r.foundationNewChecker) {
        /*
         * Phase C 收斂之後，地基一律只剩 assignsTask（C1：地基 ≤1、權重 0.5）——
         * manifest 早期寫的 foundationCheck（例如思考室的 hasStepByStep）在那一期
         * 已經被移到它自己的神廟，所以只對還沒進 Phase C 的關卡驗。
         */
        if (r.phaseC || r.phaseD) {
          ok(liveChecks.has('assignsTask'), `${r.id} 進 Phase ${r.phaseC ? 'C' : 'D'} 之後地基收斂成 assignsTask`);
        } else {
          ok(
            liveChecks.has(r.foundationCheck),
            `${r.id} 的地基 ${r.foundationCheck} 今天就在它的 rubric 裡`
          );
        }
      }
      if (r.foundationNewChecker) {
        ok(V2_NEW_CHECKERS.has(r.foundationCheck), `${r.id} 的新地基 ${r.foundationCheck} 也在 §7.4 清單裡`);
      }

      /* ------------------------------------------------------------ *
       * Phase A · C1：資料層上「這一關教的只有一條」
       *
       * primaryTechniqueId 是玩家面唯一的教學目標（第二幕的刻文與第三幕的
       * 對照都只放大它）；rubric 上剛好一列標 primary，就是 manifest 的
       * mainCheck（新檢查器還沒實作時＝interimMainCheck）。
       * ------------------------------------------------------------ */
      eq(live.primaryTechniqueId, r.primaryTechniqueId, `${r.id} 資料層的 primaryTechniqueId 與 manifest 一致`);
      const primaries = live.rubric.filter((x) => x.primary);
      eq(primaries.length, 1, `${r.id} 的 rubric 恰好一條主檢查（C1）`, primaries.map((x) => x.check).join('、'));
      const wantMain = r.phaseE
      ? r.phaseE.mainCheck
      : r.phaseD
        ? r.phaseD.mainCheck
        : r.newChecker
          ? r.interimMainCheck
          : r.mainCheck;
      eq(primaries[0] && primaries[0].check, wantMain, `${r.id} 的主檢查就是 manifest 指定的 ${wantMain}`);
      ok(primaries[0] && primaries[0].check !== 'assignsTask', `${r.id} 沒有拿 assignsTask 當主教學目標`);
      ok(!(primaries[0] && primaries[0].foundation), `${r.id} 的主檢查不會同時是地基`);
      ok(
        primaries[0] && primaries[0].weight >= 1,
        `${r.id} 的主檢查權重不會比地基還輕`,
        `weight=${primaries[0] && primaries[0].weight}`
      );
    }

    /* D2：teaches 原封不動保留為 legacy 收集清單 */
    eq(
      r.teachesLegacy.join(','),
      live.teaches.join(','),
      `${r.id} 的 teachesLegacy 與現況 teaches 逐字相同（收集不倒退）`
    );
    for (const t of r.teachesLegacy) ok(techIds.has(t), `${r.id} 的 legacy 技巧 ${t} 真的存在`);

    /* ----------------------------------------------------------------
     * Phase A 已落地：以下全部改成「現況必須等於 manifest 的 after 值」。
     *
     * Phase 0 時這裡比對的是 before（那時資料還沒動）；Phase A 之後
     * before 只剩下歷史紀錄的意義，真正要守的是「手術有沒有照 manifest 做完、
     * 而且沒有多做」—— 所以 post-A 的條目必須原封不動，一個都不准提前搬。
     * ---------------------------------------------------------------- */
    const totalLive = live.rubric.reduce((s, x) => s + x.weight, 0);
    eq(r.passAfter, Number((r.passBefore - 0.5).toFixed(2)), `${r.id} 的 passAfter = passBefore − 0.5（D3 literal）`);
    const wantPass = r.phaseE
      ? r.phaseE.passAfterE
      : r.phaseD
        ? r.phaseD.passAfterD
        : r.phaseC
          ? r.phaseC.passAfterC
          : r.passAfter;
    const wantTotal = r.phaseE
      ? r.phaseE.totalWeightAfterE
      : r.phaseD
        ? r.phaseD.totalWeightAfterD
        : r.phaseC
          ? r.phaseC.totalWeightAfterC
          : r.totalWeightAfter;
    eq(
      live.pass,
      wantPass,
      `${r.id} 的 pass 已經落到 ${
        r.phaseE
          ? 'passAfterE（Phase E）'
          : r.phaseD
            ? 'passAfterD（Phase D）'
            : r.phaseC
              ? 'passAfterC（Phase C）'
              : 'passAfter（D3）'
      }`
    );
    ok(r.totalWeightAfter > 0 && r.totalWeightAfter <= r.totalWeightBefore, `${r.id} 的 totalWeightAfter 只會持平或變小`);
    eq(totalLive, wantTotal, `${r.id} 現況的 rubric 總權重 = manifest 記的調整後總權重`);
    ok(wantPass > 0 && wantPass < wantTotal, `${r.id} 調整後仍然是「拿得到但要做對事」的門檻`);
    if (r.phaseC) {
      /* Phase C 的五關：收斂成與新神廟同一個形狀（C1），而且真的接上 v2 技能 */
      eq(live.primarySkillId, r.phaseC.skillId, `${r.id} 接上 v2 技能 ${r.phaseC.skillId}`);
      eq(live.primaryTechniqueId, r.primaryTechniqueId, `${r.id} 仍然掛著它真的有的舊主技巧（收集不倒退）`);
      const main = live.rubric.find((x) => x.primary);
      eq(main && main.check, r.phaseC.mainCheck, `${r.id} 的主檢查＝manifest 指定的 ${r.phaseC.mainCheck}`);
      eq(main && main.weight, r.phaseC.mainWeightAfterC, `${r.id} 的主檢查權重升到 ${r.phaseC.mainWeightAfterC}`);
      eq(main && main.skillId, r.phaseC.skillId, `${r.id} 的主檢查那一列掛著 v2 技能`);
      eq(live.rubric.length, 2, `${r.id} 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
    }
    if (r.phaseE) {
      /* Phase E 的一關（擬態之鏡）：收斂成新神廟的形狀、接上 v2 技能，並整座搬進量器坊 */
      eq(live.primarySkillId, r.phaseE.skillId, `${r.id} 接上 v2 技能 ${r.phaseE.skillId}`);
      eq(live.primaryTechniqueId, r.primaryTechniqueId, `${r.id} 仍然掛著它真的有的舊主技巧（收集不倒退）`);
      eq(live.region, r.phaseE.regionAfterE, `${r.id} 已經搬到 ${r.phaseE.regionAfterE} 區`);
      const mainE = live.rubric.find((x) => x.primary);
      eq(mainE && mainE.check, r.phaseE.mainCheck, `${r.id} 的主檢查＝manifest 指定的 ${r.phaseE.mainCheck}`);
      eq(mainE && mainE.weight, r.phaseE.mainWeightAfterE, `${r.id} 的主檢查權重升到 ${r.phaseE.mainWeightAfterE}`);
      eq(mainE && mainE.skillId, r.phaseE.skillId, `${r.id} 的主檢查那一列掛著 v2 技能`);
      eq(live.rubric.length, 2, `${r.id} 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
      eq(
        flowData.flows[r.id] && (flowData.flows[r.id].kind || 'choice'),
        r.phaseE.kindAfterE,
        `${r.id} 的第三幕題型＝manifest 記的 ${r.phaseE.kindAfterE}`
      );
      ok(nonEmptyStr(r.phaseE.note) && r.phaseE.note.length >= 20, `${r.id} 的 Phase E 條目有寫下理由`);
    }
    if (r.phaseD) {
      /* Phase D 的十一關：跟 Phase C 一樣收斂成新神廟的形狀，並接上 v2 技能 */
      eq(live.primarySkillId, r.phaseD.skillId, `${r.id} 接上 v2 技能 ${r.phaseD.skillId}`);
      eq(live.primaryTechniqueId, r.primaryTechniqueId, `${r.id} 仍然掛著它真的有的舊主技巧（收集不倒退）`);
      const mainRow = live.rubric.find((x) => x.primary);
      eq(mainRow && mainRow.check, r.phaseD.mainCheck, `${r.id} 的主檢查＝manifest 指定的 ${r.phaseD.mainCheck}`);
      eq(mainRow && mainRow.weight, r.phaseD.mainWeightAfterD, `${r.id} 的主檢查權重升到 ${r.phaseD.mainWeightAfterD}`);
      eq(mainRow && mainRow.skillId, r.phaseD.skillId, `${r.id} 的主檢查那一列掛著 v2 技能`);
      eq(live.rubric.length, 2, `${r.id} 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
      eq(
        flowData.flows[r.id] && (flowData.flows[r.id].kind || 'choice'),
        r.phaseD.kindAfterD,
        `${r.id} 的第三幕題型＝manifest 記的 ${r.phaseD.kindAfterD}`
      );
      ok(nonEmptyStr(r.phaseD.note) && r.phaseD.note.length >= 20, `${r.id} 的 Phase D 條目有寫下理由`);
    }

    /* 移除／降權清單：Phase A 的做完了，post-A 的一個都不准動 */
    const liveWeights = new Map(live.rubric.map((x) => [x.check, x.weight]));
    for (const e of r.checksToRemoveOrDownweight) {
      ok(['downweight', 'remove', 'replace', 'hold'].includes(e.action), `${r.id} 的 ${e.check} 動作合法`, e.action);
      ok(['A', 'C', 'D', 'E', 'post-A'].includes(e.phase), `${r.id} 的 ${e.check} 有指定期別`, e.phase);
      ok(nonEmptyStr(e.reason) && e.reason.length >= 10, `${r.id} 的 ${e.check} 有寫理由`);
      if (e.action === 'replace') ok(checkIds.has(e.replaceWith), `${r.id} 的 ${e.check} 換成真的存在的檢查器`);
      const w = liveWeights.get(e.check);
      if (e.phase === 'C' || e.phase === 'D' || e.phase === 'E') {
        /*
         * Phase C：主題在這一期搬到自己的神廟了，所以這一條**必須**已經執行完。
         * （manifest 的 phaseC 區塊逐關記著這件事，`addedIn: "C"` 標的是
         *   Phase 0 產生器沒掃到、由 Phase C 補上的兩條移除。）
         */
        const phaseBlock = e.phase === 'C' ? r.phaseC : e.phase === 'D' ? r.phaseD : r.phaseE;
        ok(phaseBlock, `${r.id} 標了 Phase ${e.phase} 條目就要有 phase${e.phase} 區塊`);
        if (e.action === 'remove') {
          ok(w === undefined, `${r.id} 的 ${e.check} 已經在 Phase ${e.phase} 移除`, `weight=${w}`);
        } else if (e.action === 'downweight') {
          eq(w, e.weightAfter, `${r.id} 的 ${e.check} 已經在 Phase ${e.phase} 降到 ${e.weightAfter} 分`);
        }
        continue;
      }
      if (e.phase !== 'A') {
        // post-A：主題還沒搬家，這一條必須原封不動（B–J 才動它）
        eq(w, e.weightBefore, `${r.id} 的 ${e.check} 是 post-A 項目，Phase A 不准提前動它`);
        continue;
      }
      // 同一條檢查如果之後又在 Phase C 被整條移除，Phase A 的降權目標就不再存在
      const removedLater = r.checksToRemoveOrDownweight.find(
        (x) => x.check === e.check && ['C', 'D', 'E'].includes(x.phase) && x.action === 'remove'
      );
      if (removedLater) {
        ok(
          w === undefined,
          `${r.id} 的 ${e.check} 在 Phase A 處理過、Phase ${removedLater.phase} 整條移除`,
          `weight=${w}`
        );
        continue;
      }
      if (e.action === 'downweight') {
        eq(w, e.weightAfter, `${r.id} 的 ${e.check} 已經降到 ${e.weightAfter} 分`);
      } else if (e.action === 'hold') {
        /*
         * 兩份設計文件衝突、manifest 已裁決不動它 —— 不准被「順手」降權。
         * 例外：那一關已經在 Phase C 收斂成「主檢查 3 分」的形狀時，
         * 這條 hold 的檢查如果正好就是它的主檢查，權重會跟著主檢查走（3 分）。
         */
        const isPhaseCMain = r.phaseC && r.phaseC.mainCheck === e.check;
        const isPhaseDMain = r.phaseD && r.phaseD.mainCheck === e.check;
        const isPhaseEMain = r.phaseE && r.phaseE.mainCheck === e.check;
        if (isPhaseEMain) {
          eq(
            w,
            r.phaseE.mainWeightAfterE,
            `${r.id} 的 ${e.check} 是 Phase E 的主檢查，權重升到 ${r.phaseE.mainWeightAfterE} 分`
          );
        } else if (isPhaseDMain) {
          eq(w, r.phaseD.mainWeightAfterD, `${r.id} 的 ${e.check} 是 Phase D 的主檢查，權重升到 ${r.phaseD.mainWeightAfterD} 分`);
        } else if (isPhaseCMain) {
          eq(
            w,
            r.phaseC.mainWeightAfterC,
            `${r.id} 的 ${e.check} 是 Phase C 的主檢查，權重升到 ${r.phaseC.mainWeightAfterC} 分`
          );
        } else {
          eq(w, e.weightBefore, `${r.id} 的 ${e.check} 依裁決保持 ${e.weightBefore} 分（hold）`);
        }
      } else if (e.action === 'remove') {
        ok(w === undefined, `${r.id} 的 ${e.check} 已經從 rubric 移除`, `weight=${w}`);
      } else if (e.action === 'replace') {
        ok(w === undefined, `${r.id} 的 ${e.check} 已經被換掉`, `weight=${w}`);
        const laterRemoved = r.checksToRemoveOrDownweight.some(
          (x) => x.check === e.replaceWith && ['C', 'D', 'E'].includes(x.phase) && x.action === 'remove'
        );
        if (laterRemoved) {
          // 接手那 1 分的檢查在後續期別把主題交給自己的神廟了（例如受眾 → 六面燈籠）
          ok(!liveWeights.has(e.replaceWith), `${r.id} 接手的 ${e.replaceWith} 後來也把主題交出去了`);
        } else {
          ok(
            liveWeights.has(e.replaceWith),
            `${r.id} 的 ${e.check} 權重轉給了 ${e.replaceWith}（權重中性的替換）`
          );
        }
      }
    }
    // assignsTask 全域降權：27 關一關都不能漏，而且一律標成地基
    const at = r.checksToRemoveOrDownweight.find((e) => e.check === 'assignsTask');
    ok(at && at.phase === 'A' && at.weightAfter === 0.5, `${r.id} 的 assignsTask 在 Phase A 降為 0.5（地基）`);
    const atLive = live.rubric.find((x) => x.check === 'assignsTask');
    ok(atLive, `${r.id} 的 assignsTask 還在（它是前提，不是刪掉）`);
    eq(atLive && atLive.weight, 0.5, `${r.id} 的 assignsTask 現況權重 0.5`);
    eq(atLive && atLive.foundation, true, `${r.id} 的 assignsTask 標成地基（不是「這一關教的東西」）`);
    ok(!(atLive && atLive.primary), `${r.id} 的 assignsTask 不是主教學目標`);

    /* C1：現況資料上「恰好 1 主檢查、地基 ≤1、地基一律 0.5」 */
    const foundations = live.rubric.filter((x) => x.foundation);
    eq(foundations.length, 1, `${r.id} 地基恰好一條（≤1，目前就是 assignsTask）`);
    for (const f of foundations) eq(f.weight, 0.5, `${r.id} 的地基 ${f.check} 權重 0.5`);
  }

  /*
   * Phase C 在既有 27 關身上移除的 rubric 列數（由 manifest 的 phase: 'C' remove 條目現算，
   * 不寫死）—— 這個數字對不上就代表有人偷偷加／刪了 rubric 列。
   */
  const PHASE_C_ROWS_REMOVED = migration.challenges.reduce(
    (n, r) => n + r.checksToRemoveOrDownweight.filter((e) => e.phase === 'C' && e.action === 'remove').length,
    0
  );
  /*
   * Phase D 又移除了一批（脈絡與長文／角色與參數十一關）；另外有三關的主檢查是新實作的檢查器，
   * 它們是「新增一列」而不是移除，所以要加回來。
   */
  const PHASE_D_ROWS_REMOVED = migration.challenges.reduce(
    (n, r) => n + r.checksToRemoveOrDownweight.filter((e) => e.phase === 'D' && e.action === 'remove').length,
    0
  );
  const PHASE_E_ROWS_REMOVED = migration.challenges.reduce(
    (n, r) => n + r.checksToRemoveOrDownweight.filter((e) => e.phase === 'E' && e.action === 'remove').length,
    0
  );
  const PHASE_D_ROWS_ADDED = migration.challenges.filter(
    (r) => r.phaseD && (r.newChecker || r.phaseD.mainCheck !== r.mainCheck)
  ).length;

  /* 全域統計：manifest 記的基線要跟現況資料對得上 */
  eq(migration.baseline.challenges, legacyChallenges.length, 'manifest 的關卡數基線正確（既有 27 關）');
  /*
   * baseline 是 Phase 0 的快照（118 條），Phase A 之後現況會少：
   *   −1  silent-thinker-13 的 specifiesFormat 直接移除
   *   −5  5 關的 specifiesFormat 被換成該關真正的主檢查
   *   +1  面具工坊新增 hasAudience 承接那 1 分（權重中性的替換）
   * ＝ 113 條。數字對不上就是有人偷偷加／刪了 rubric 列。
   */
  eq(migration.baseline.rubricRows, 118, 'manifest 記的是 Phase 0 的 rubric 條數基線（118，不是舊文件的 106）');
  eq(
    legacyChallenges.reduce((s, c) => s + c.rubric.length, 0),
    113 - PHASE_C_ROWS_REMOVED - PHASE_D_ROWS_REMOVED - PHASE_E_ROWS_REMOVED + PHASE_D_ROWS_ADDED,
    `Phase A 之後 113 條；Phase C 移除 ${PHASE_C_ROWS_REMOVED} 條、Phase D 移除 ${PHASE_D_ROWS_REMOVED} 條、Phase E 移除 ${PHASE_E_ROWS_REMOVED} 條並新增 ${PHASE_D_ROWS_ADDED} 條主檢查`
  );
  eq(migration.baseline.curriculumTechniques, curriculum.techniques.length, 'manifest 的技巧數基線正確');
  eq(migration.baseline.curriculumSha256, CURRICULUM_SHA256, 'manifest 記的 curriculum 指紋與實檔一致');

  /* D1–D3 的裁決要寫在檔案裡（讓後續期別讀得到，不必回頭翻對話） */
  for (const key of ['D1', 'D2', 'D3']) {
    ok(migration.decisions?.[key]?.ruling?.length > 20, `manifest 寫明 ${key} 的裁決`);
  }
  // 已知的文件矛盾要逐條留痕，不能默默吞掉
  ok(migration.conflicts.length >= 3, 'manifest 逐條記下比對時發現的文件矛盾與裁決');
  for (const c of migration.conflicts) {
    ok(nonEmptyStr(c.kind) && nonEmptyStr(c.resolution), `矛盾「${c.id}」有寫清楚是什麼、怎麼裁決`);
  }
  // 護欄 2：這份 manifest 是實作契約，不是課程內容 —— 不放官方連結（出處一律回 curriculum）
  ok(
    !/https?:\/\//.test(JSON.stringify(migration)),
    'manifest 不自帶官方連結（出處一律回 curriculum.json，避免二手抄寫）'
  );
}

/* ================================================================== */
/* Phase A：小數門檻的顯示 ＋ 「畫面上只教一條」                        */
/*                                                                    */
/*   assignsTask 降成 0.5 的地基之後，權重與門檻都會出現 0.5 這一階；   */
/*   數字一路要走 formatScore()，不能讓玩家看到 3.4000000000000004     */
/*   或是「3.0 分」這種東西。                                          */
/* ================================================================== */
console.log('\n▸ 小數門檻的顯示與「一關只教一條」（Phase A）');

{
  const { formatScore } = await import('../src/challenges/rubric.js');

  eq(formatScore(3), '3', '整數不拖小數尾巴');
  eq(formatScore(3.5), '3.5', '一半就寫一半');
  eq(formatScore(0.5), '0.5', '地基的 0.5 分寫得出來');
  eq(formatScore(2.0), '2', '2.0 顯示成 2');
  eq(formatScore(4.25), '4.25', '四分之一分也保留');
  eq(formatScore(3.4000000000000004), '3.4', '浮點加總的雜訊不會漏到畫面上');
  eq(formatScore(5.5 - 1.1), '4.4', '直接算出來的浮點也乾淨');
  eq(formatScore(0), '0', '0 分就是 0');
  eq(formatScore(NaN), '0', '算壞了也不會印出 NaN');

  // 真的跑一次評分：門檻與權重確實是小數，而且每個數字都印得出乾淨的字串
  const half = challenges.find((c) => c.pass === 2.5);
  ok(half, '至少有一關的門檻是 2.5 分（D3 literal −0.5）');
  const halfEval = evaluate(half, half.sample);
  eq(formatScore(halfEval.pass), '2.5', '結果面板上的通過門檻寫成 2.5');
  ok(
    halfEval.results.every((r) => !/e[+-]|\.\d{3,}/.test(formatScore(r.earned))),
    '每一條檢查的得分都印得出乾淨的數字'
  );
  ok(
    challenges.every((c) => /^\d+(\.\d{1,2})?$/.test(formatScore(c.pass))),
    '27 關的門檻都印得出乾淨的數字'
  );
  ok(
    challenges.some((c) => c.rubric.some((r) => r.weight === 0.5)),
    '地基的 0.5 分真的存在於資料裡'
  );

  // 顯示層：分數一律走 formatScore（改回裸值就會紅）
  for (const [rel, src] of [
    ['src/prompt/console.js', consoleSrc],
    ['src/prompt/practice.js', srcOf('src/prompt/practice.js')],
  ]) {
    ok(/formatScore/.test(src), `${rel} 用 formatScore 印分數`);
    ok(
      !/\$\{evaluation\.earned\}|\$\{evaluation\.pass\}|\$\{row\.weight\} 分/.test(src),
      `${rel} 沒有把原始浮點數直接塞進畫面`
    );
  }

  /* --- 一關只教一條：第二幕與第三幕的側頁籤只放大主教學目標 --- */
  ok(/glyph--primary/.test(consoleSrc), '第二幕有一段「這一關教的」主刻文');
  ok(/function guidancePrimary\(/.test(consoleSrc), '主刻文取自 rubric 上標了 primary 的那一列');
  ok(
    /challenge\.primaryTechniqueId/.test(consoleSrc),
    '主刻文掛的是這一關的 primaryTechniqueId（不是隨便一條 rubric 的技巧）'
  );
  ok(/EXTRA_LABEL/.test(consoleSrc), '其餘的檢查只用一行「順手會用到」帶過');
  const { EXTRA_LABEL } = await import('../src/prompt/console.js');
  ok(CJK.test(EXTRA_LABEL), '「順手會用到」是中文', EXTRA_LABEL);
  ok(
    /is-primary|is-foundation|is-minor/.test(consoleSrc) && /checklist__tag/.test(consoleSrc),
    '刻痕對照把主檢查與地基分成兩種位階'
  );
  const cssSrc = srcOf('src/styles.css');
  ok(/\.checklist li\.is-foundation/.test(cssSrc), '地基那一列在樣式上真的比較安靜');
  ok(/\.extras\b/.test(cssSrc), '「順手會用到」那一行有自己的（安靜的）樣式');

  /* --- D2：收集仍然由 legacy teaches 驅動（舊存檔的已收集技巧不減少） --- */
  ok(
    /teaches: Array\.isArray\(challenge\.teaches\)/.test(srcOf('src/challenges/rubric.js')),
    '評分結果帶出去的收集清單仍然是 legacy teaches（D2：收集不倒退）'
  );
  ok(
    /順手收進圖鑑/.test(consoleSrc),
    '結算面板把 legacy 收集放在「順手收進圖鑑」的次要位階（D2 的 uiRule）'
  );
  {
    // 27 關全破 → 68 條技巧一條都不少（收集面完全沒有退化）
    const collected = new Set(challenges.flatMap((c) => c.teaches));
    eq(collected.size, curriculum.techniques.length, 'Phase A 之後 27 關的 teaches 仍然收得滿 68 條');
    for (const c of challenges) {
      // 課程 v2 的神廟收集走 skillsV2；只有舊 27 關才必須有 legacy 收集清單
      if (!c.primarySkillId) ok(c.teaches.length > 0, `[${c.id}] 仍然有 legacy 收集清單`);
      if (c.primaryTechniqueId) {
        ok(
          techById.has(c.primaryTechniqueId),
          `[${c.id}] primaryTechniqueId 是 curriculum 裡真的技巧`,
          c.primaryTechniqueId
        );
        ok(
          (techById.get(c.primaryTechniqueId).sources || []).length > 0,
          `[${c.id}] 主技巧有官方出處（第二幕的神諭原典連得出去）`
        );
      }
    }
    // 主技巧彼此不重複（C2：一條技巧只教一次）
    const primaries = challenges.map((c) => c.primaryTechniqueId).filter(Boolean);
    eq(new Set(primaries).size, primaries.length, '主技巧互不重複（C2）');
    eq(primaries.length, 25, '既有 27 關裡 25 關有主技巧、2 關應用關沒有');
    // 課程 v2 的神廟：主技能也一樣一條只教一次
    const skillPrimaries = challenges.map((c) => c.primarySkillId).filter(Boolean);
    eq(new Set(skillPrimaries).size, skillPrimaries.length, 'v2 主技能互不重複（C2）');
  }
}

/* ================================================================== */
/* 課程 v2 · Phase B step 1 — runtime catalog bridge                   */
/*                                                                     */
/*   舊 68 條技巧（curriculum.json，官方引文、byte-identical）          */
/* ＋ 130 條 v2 技能（skill-codex-v2.json，authored: game）             */
/* ＋ 12 區（regions-v2.json，其中 7 區 implemented: false）            */
/* 合成同一份 runtime catalog。這一段守三件事：                        */
/*   (a) 資料契約（130 / 12 / 先修無環 / 出處是真的官方連結）           */
/*   (b) 護欄 2：每一條技能的 sources 都回查得到 master list 的條目     */
/*   (c) 行為中立：已上線那五區的列舉結果與舊的 curriculum.groups 一樣  */
/* ================================================================== */
console.log('\n▸ 課程 v2 runtime catalog（Phase B step 1）');
{
  /* --- 檔頭：這是 authored 層，不是官方引文 --- */
  eq(skillCodexV2.authored, 'game', 'skill-codex-v2.json 標明是遊戲自撰的技能總表');
  eq(regionsV2.authored, 'game', 'regions-v2.json 標明是遊戲自撰');
  ok(nonEmptyStr(skillCodexV2.note) && skillCodexV2.note.length > 40, 'skill-codex-v2.json 說清楚哪些是自撰、哪些是官方');
  ok(/curriculum\.json/.test(skillCodexV2.note), 'skill-codex-v2.json 明講舊 68 條的官方引文仍以 curriculum.json 為準');
  ok(Boolean(skillCodexV2.provenance && skillCodexV2.provenance.sources), 'skill-codex-v2.json 寫得出出處是從哪裡解析來的');

  /* --- 數量：這是當期的契約（scripts/expected-counts.json） --- */
  eq(catalog.counts.skills, EXPECT.v2Skills.value, `${EXPECT.v2Skills.value} 條技能（curriculum-v2 §一）`);
  eq(catalog.counts.regions, EXPECT.v2Regions.value, `${EXPECT.v2Regions.value} 個區域（curriculum-v2 §二）`);
  eq(
    catalog.counts.implementedRegions,
    EXPECT.v2ImplementedRegions.value,
    `其中 ${EXPECT.v2ImplementedRegions.value} 區已經在世界裡蓋好`
  );
  eq(catalog.counts.upcomingRegions, catalog.counts.regions - catalog.counts.implementedRegions, '其餘全部標成尚未上線');
  eq(catalog.counts.techniques, curriculum.techniques.length, 'catalog 的技巧數＝curriculum 的技巧數（沒有偷加東西）');

  /* --- id 唯一、區域加總＝技能總數 --- */
  const ids = catalog.skills.map((s) => s.id);
  eq(new Set(ids).size, ids.length, '技能 id 互不重複');
  const sum = catalog.regions.reduce((a, r) => a + r.skillIds.length, 0);
  eq(sum, catalog.counts.skills, '12 區的技能數加起來剛好等於技能總數（沒有孤兒、沒有重複認領）');
  for (const r of catalog.regions) {
    eq(catalog.regionSkills(r.id).length, r.skillIds.length, `[${r.id}] regionSkills() 查得回每一條技能`);
    ok(nonEmptyStr(r.nameZh) && CJK.test(r.nameZh), `[${r.id}] 有中文區名`, r.nameZh);
    ok(nonEmptyStr(r.theme) && r.theme.length >= 10, `[${r.id}] 有主題句`);
    ok(nonEmptyStr(r.landmark), `[${r.id}] 有地標概念`);
    ok(typeof r.implemented === 'boolean', `[${r.id}] implemented 是布林`);
    ok(nonEmptyStr(r.gate && r.gate.text), `[${r.id}] 有軟門檻的原句`);
  }

  /* --- 先修：解得開、而且無環 --- */
  const byId = new Map(catalog.skills.map((s) => [s.id, s]));
  for (const s of catalog.skills) {
    for (const p of s.prereqs) ok(byId.has(p), `[${s.id}] 先修 ${p} 是真的技能`);
    ok(!s.prereqs.includes(s.id), `[${s.id}] 不會把自己列成先修`);
  }
  {
    // 拓撲排序：排得完 ⇒ 無環
    const indeg = new Map(catalog.skills.map((s) => [s.id, s.prereqs.length]));
    const out = new Map(catalog.skills.map((s) => [s.id, []]));
    for (const s of catalog.skills) for (const p of s.prereqs) out.get(p).push(s.id);
    const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
    let done = 0;
    while (queue.length) {
      const id = queue.shift();
      done += 1;
      for (const nxt of out.get(id)) {
        indeg.set(nxt, indeg.get(nxt) - 1);
        if (indeg.get(nxt) === 0) queue.push(nxt);
      }
    }
    eq(done, catalog.counts.skills, '技能先修圖是有向無環圖（拓撲排得完）');
  }

  /* --- tier --- */
  const tierIds = new Set((skillCodexV2.tiers || []).map((t) => t.id));
  eq([...tierIds].sort().join(','), 'advanced,basic,master', '三個 tier 都有定義');
  for (const s of catalog.skills) ok(tierIds.has(s.tier), `[${s.id}] tier 合法`, s.tier);
  for (const t of tierIds) ok(catalog.skillsOfTier(t).length > 0, `tier ${t} 至少有一條技能`);

  /* --- 玩家可見的中文欄位（之後會上畫面） --- */
  for (const s of catalog.skills) {
    ok(CJK.test(s.nameZh), `[${s.id}] 中文名是中文`, s.nameZh);
    ok(s.oneLiner.length >= 8, `[${s.id}] 一句話夠長`, s.oneLiner);
    ok(/^[\x20-\x7E]+$/.test(s.nameEn), `[${s.id}] 英文短名是純 ASCII`, s.nameEn);
    ok(!/https?:\/\//.test(`${s.nameZh}${s.oneLiner}`), `[${s.id}] 自撰敘述本身不夾連結（出處只走 sources）`);
  }

  /* --- 出處：護欄 2 的核心 --------------------------------------- *
   * 每一條技能的每一個出處都必須真的出現在 master list 對應條目的
   * 「出處」欄裡。這一條讓「自撰摘要冒充官方引文」在結構上不可能。 */
  const masterMd = readFileSync(resolve(root, 'docs/prompt-engineering-master-list.md'), 'utf8');
  const masterEntries = new Map();
  {
    let cur = null;
    let inSources = false;
    for (const line of masterMd.split('\n')) {
      const h = /^### (\d+)\. (.+)$/.exec(line);
      if (h) {
        cur = { n: Number(h[1]), title: h[2], urls: new Set(), notFound: /找不到/.test(h[2]) };
        masterEntries.set(cur.n, cur);
        inSources = false;
        continue;
      }
      if (!cur) continue;
      if (/^- \*\*出處\*\*[:：]/.test(line)) {
        inSources = true;
      } else if (/^- \*\*/.test(line) || /^#{2,3} /.test(line)) {
        inSources = false;
      }
      if (!inSources) continue;
      for (const m of line.matchAll(/https:\/\/[^\s)*、，]+/g)) cur.urls.add(m[0]);
      if (/找不到/.test(line)) cur.notFound = true;
    }
  }
  ok(masterEntries.size >= 292, `master list 解析得出 ${masterEntries.size} 個條目`);

  let sourceRows = 0;
  for (const s of catalog.skills) {
    for (const n of s.masterRefs) ok(masterEntries.has(n), `[${s.id}] master #${n} 在總表裡真的存在`);
    for (const src of s.sources) {
      sourceRows += 1;
      ok(/^https:\/\//.test(src.url), `[${s.id}] 出處是 https`, src.url);
      ok(nonEmptyStr(src.vendor), `[${s.id}] 出處標得出廠商`, src.url);
      ok(s.masterRefs.includes(src.masterRef), `[${s.id}] 出處的 masterRef 在自己的 masterRefs 裡`, String(src.masterRef));
      const entry = masterEntries.get(src.masterRef);
      ok(
        Boolean(entry && entry.urls.has(src.url)),
        `[${s.id}] 出處逐字取自 master #${src.masterRef} 的「出處」欄（不是自己編的）`,
        src.url
      );
    }
    /* 護欄 2：沒有可驗證出處 → 一定要誠實寫明 */
    if (!s.sources.length) {
      ok(nonEmptyStr(s.sourceNote), `[${s.id}] 沒有出處時寫得出誠實說明`);
      ok(/找不到/.test(s.sourceNote), `[${s.id}] 的說明把「找不到」講出來`, s.sourceNote);
    }
  }
  ok(sourceRows >= catalog.counts.skills, `${sourceRows} 筆出處，平均每條技能至少一筆`);
  eq(
    catalog.counts.skillsWithoutSource,
    EXPECT.v2SkillsWithoutSource.value,
    `目前 ${EXPECT.v2SkillsWithoutSource.value} 條技能沒有可驗證出處`
  );
  ok(
    catalog.counts.skillsWithoutSource <= EXPECT.v2SkillsWithoutSource.max,
    `沒有出處的技能不超過 ${EXPECT.v2SkillsWithoutSource.max} 條（master list 的「找不到」集合上限）`
  );
  /* 蒸餾規則 3：總表標「找不到」的條目不得被任何技能引用 */
  for (const s of catalog.skills) {
    for (const n of s.masterRefs) {
      const entry = masterEntries.get(n);
      if (!entry) continue;
      ok(!(entry.notFound && entry.urls.size === 0), `[${s.id}] 沒有引用「出處找不到」的 master #${n}`, entry.title);
    }
  }

  /* --- 新舊對照（D2 的相容橋） --- */
  for (const s of catalog.skills) {
    if (!s.legacyTechniqueId) {
      eq(s.legacyTechniqueSource, null, `[${s.id}] 沒有祖先時來源欄也是 null`);
      continue;
    }
    ok(techById.has(s.legacyTechniqueId), `[${s.id}] legacyTechniqueId 是 curriculum 裡真的技巧`, s.legacyTechniqueId);
    ok(
      ['migration-manifest', 'appendix-c-subset', 'curated'].includes(s.legacyTechniqueSource),
      `[${s.id}] 說得出這個對照是怎麼來的`,
      String(s.legacyTechniqueSource)
    );
    const back = catalog.skillsForTechnique(s.legacyTechniqueId).map((x) => x.id);
    ok(back.includes(s.id), `[${s.id}] 反查 skillsForTechnique 找得回自己`);
    eq(catalog.techniqueForSkill(s.id).id, s.legacyTechniqueId, `[${s.id}] techniqueForSkill 對得起來`);
  }
  {
    /* 遷移 manifest 指定的 v2SkillId 必須真的存在（Phase 0 的 needsV2Catalog 在這裡收尾） */
    const migration = readJson('docs/design/curriculum-v2-migration.json');
    for (const row of migration.challenges) {
      if (!row.v2SkillId) continue;
      ok(Boolean(catalog.skill(row.v2SkillId)), `遷移 manifest 的 ${row.id} → 技能 ${row.v2SkillId} 真的存在`);
    }
    const needs = migration.challenges.filter((r) => r.needsV2Catalog);
    for (const row of needs) {
      const skill = catalog.skill(row.v2SkillId);
      ok(Boolean(skill), `${row.id} 標了 needsV2Catalog，v2 catalog 現在補上了 ${row.v2SkillId}`);
      ok(
        skill && (skill.sources || []).length > 0,
        `${row.v2SkillId} 在 v2 catalog 裡有自己的官方出處（不必再借 curriculum 的技巧）`
      );
      ok(
        skill && skill.legacyTechniqueId === null && nonEmptyStr(skill.legacyNote),
        `${row.v2SkillId} 誠實記下「舊 68 條裡沒有祖先」`,
        String(skill && skill.legacyTechniqueId)
      );
    }
    ok(needs.length > 0, '遷移 manifest 裡至少有一關本來就在等 v2 catalog');
  }

  /* ------------------------------------------------------------------
   * 行為中立（Phase E 修訂）：已上線的區域必須**以既有五區開頭、順序一樣**，
   * 後面才接課程 v2 新蓋好的區域。這條擋的是「有人把舊五區換順序／弄丟一個」，
   * 同時允許世界真的長大（量器坊起）。
   * ------------------------------------------------------------------ */
  const legacyRegionIds = curriculum.groups.map((g) => g.id);
  eq(
    catalog.implementedRegionIds().slice(0, legacyRegionIds.length).join(','),
    legacyRegionIds.join(','),
    '已上線的區域以 curriculum.groups 開頭（id 與順序都一樣）'
  );
  for (const r of catalog.implementedRegions().slice(legacyRegionIds.length)) {
    ok(!legacyRegionIds.includes(r.id), `新上線的 ${r.id} 不在 curriculum.groups 裡（新內容走 authored 層）`);
    ok(nonEmptyStr(r.color), `新上線的 ${r.id} 有自己的主色`, r.color);
    ok(r.skillOnly === true, `新上線的 ${r.id} 只教 v2 技能（舊 68 條裡沒有它的主題）`);
    ok(
      challenges.filter((c) => c.region === r.id).length > 0,
      `新上線的 ${r.id} 世界裡真的有關卡（不是只把旗標打開）`
    );
  }
  for (const r of catalog.upcomingRegions()) {
    ok(!curriculum.groups.some((g) => g.id === r.id), `尚未上線的 ${r.id} 不在 curriculum.groups 裡`);
    eq(
      challenges.filter((c) => c.region === r.id).length,
      0,
      `尚未上線的 ${r.id} 沒有任何關卡（這一期只加資料，不加世界）`
    );
  }
  {
    const { createContent } = await import('../src/challenges/content.js');
    const withCatalog = createContent(curriculum, challengeData, null, null, null, null, null, catalog);
    const legacyOnly = createContent(curriculum, challengeData);
    eq(
      JSON.stringify(withCatalog.groupsOrdered().slice(0, curriculum.groups.length)),
      JSON.stringify(curriculum.groups.slice().sort((a, b) => a.order - b.order)),
      'content.groupsOrdered() 的前五格與 curriculum.groups 逐欄相同（既有五區沒被改寫）'
    );
    eq(
      JSON.stringify(legacyOnly.groupsOrdered()),
      JSON.stringify(curriculum.groups.slice().sort((a, b) => a.order - b.order)),
      '沒傳 catalog 的舊呼叫端仍然只看得到既有五區（相容層）'
    );
    eq(
      withCatalog.groupsOrdered().length,
      catalog.counts.implementedRegions,
      'content.groupsOrdered() 把新上線的區域也列進來（圖鑑才看得到）'
    );
    {
      // 新上線的區域也要查得到顯示資料（HUD／toast 不准退回印出區域 id）
      const g = withCatalog.group('forms');
      ok(g && g.name === '量器坊' && /^#/.test(g.color), 'content.group() 查得到新上線區域的名稱與主色', JSON.stringify(g));
    }
    eq(withCatalog.regionsOrdered().length, catalog.counts.implementedRegions, 'content.regionsOrdered() 只列已上線的區域');
    eq(withCatalog.skill('clear-golden').regionId, 'foundations', 'content.skill() 查得到 v2 技能');
  }
  {
    /* progression：丟 catalog 與丟 curriculum 的列舉結果一致 */
    memory.clear();
    const a = createProgression({ catalog, challenges });
    const b = createProgression({ curriculum, challenges });
    eq(a.masteredRegions().join(','), b.masteredRegions().join(','), 'progression：兩種建法的精通列舉一致');
    eq(
      JSON.stringify(a.hiddenAchievement()),
      JSON.stringify(b.hiddenAchievement()),
      'progression：兩種建法的隱藏成就統計一致'
    );
    eq(a.hiddenAchievement().total, catalog.counts.techniques, 'progression：隱藏成就的總數來自 catalog');
    const { REGION_GATES: GATES } = await import('../src/progression/progression.js');
    eq(
      Object.keys(GATES).join(','),
      catalog.implementedRegionIds().join(','),
      'REGION_GATES 涵蓋且只涵蓋已上線的區域'
    );
    memory.clear();
  }

  /* --- fail fast：資料壞掉一定丟例外，不安靜降級 --- */
  const clone = () => JSON.parse(JSON.stringify(skillCodexV2));
  const throws = (mutate, label) => {
    const bad = clone();
    mutate(bad);
    let threw = false;
    try {
      createCatalog({ curriculum, skillCodex: bad, regions: JSON.parse(JSON.stringify(regionsV2)) });
    } catch {
      threw = true;
    }
    ok(threw, `壞資料會當場丟例外：${label}`);
  };
  throws((d) => {
    d.skills[1].id = d.skills[0].id;
  }, '重複的技能 id');
  throws((d) => {
    d.skills[0].prereqs = ['does-not-exist'];
  }, '先修指到不存在的技能');
  throws((d) => {
    d.skills[0].prereqs = [d.skills[0].id];
  }, '先修成環');
  throws((d) => {
    d.skills[0].tier = 'legendary';
  }, '不合法的 tier');
  throws((d) => {
    d.skills[0].sources[0].url = 'http://example.com';
  }, '出處不是 https');
  throws((d) => {
    d.skills[0].sources = [];
    delete d.skills[0].sourceNote;
  }, '既沒有出處也沒有誠實說明');
  throws((d) => {
    d.skills[0].legacyTechniqueId = 'not-a-technique';
  }, 'legacyTechniqueId 不在 curriculum 裡');
  {
    const badRegions = JSON.parse(JSON.stringify(regionsV2));
    // 挑一個「世界裡真的還沒蓋」的區域（Phase E 之後 forms 已經上線，所以往後找）
    const notBuilt = badRegions.regions.find((r) => !r.implemented);
    notBuilt.implemented = true;
    let threw = false;
    try {
      createCatalog({ curriculum, skillCodex: skillCodexV2, regions: badRegions });
    } catch {
      threw = true;
    }
    ok(threw, '壞資料會當場丟例外：把還沒蓋好的區域標成已上線');
  }
}

/* ------------------------------------------------------------------ */
console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} 個測試失敗（通過 ${passCount}）：\n`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`✓ 全部通過：${passCount} 個斷言`);

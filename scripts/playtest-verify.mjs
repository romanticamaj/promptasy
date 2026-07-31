#!/usr/bin/env node
/**
 * Promptasy — 模擬玩家驗收（Phase 10）
 *
 *   npm run test:playtest
 *
 * 這支腳本把「13 位模擬玩家只看畫面上的資訊就通關 26 關」那次 playtest 的結論
 * 固化成可重跑的門檻，避免以後改檢查器時偷偷把關卡改難、或把誤判改回來：
 *
 *   A. 每一關的示範解答（sample）至少 A 級。
 *   B. 每一關的「快速填入」全部按下去（依序、換行接起來）就一定過得了關 —— 零思考路徑。
 *   C. 有 starter（起手的壞寫法）的關卡，starter 一定不過關 —— 玩家是在「修」。
 *   D. playtest 找出來的檢查器誤判：該中的要中、不該中的一定不能中。
 *   E. Phase 11：石碑刻印是預設玩法 —— 每一關的「全部選對」必須讓**每一條檢查都滿分**
 *      （選對就是完美，不是勉強及格），而且只刻一段一定還不夠過關（不能空轉）。
 *
 * 可以單獨執行，也被 scripts/test-rubric.mjs 匯入（把斷言併進主測試的統計）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const { evaluate } = await import('../src/challenges/rubric.js');
const { runCheck } = await import('../src/challenges/checks.js');

const GRADE_RANK = { C: 0, B: 1, A: 2, S: 3 };

/**
 * playtest 抓到的檢查器回歸案例。
 *   want: 'pass'（score === 1）／'partial'（0 < score < 1）／'fail'（score === 0）／
 *        'not-pass'（只要求「拿不到滿分」—— 部分分數或 0 分都可以）
 *   evidenceNot / evidenceHas：回饋文字本身也是教學內容，錯的證據會教錯因果。
 */
export const CHECK_CASES = [
  /* --- A1 assignsTask：複合詞、資料區、範例列、引文都不能提供任務動詞 --- */
  {
    check: 'assignsTask',
    want: 'fail',
    name: '「輸出格式：」不是任務動詞（複合詞誤判）',
    text: '輸出格式：3 個條列重點。\n這份說明是寫給第一次來的旅人看的。',
  },
  {
    check: 'assignsTask',
    want: 'fail',
    name: '「輸出上限」不是任務動詞（複合詞誤判）',
    text: '輸出上限 300 tokens。\ntemperature 設為 0.2。',
  },
  {
    check: 'assignsTask',
    want: 'fail',
    name: '標籤區塊裡的信件內文不能提供任務動詞（postbox-sprite-02）',
    text: '<letter>\n親愛的鄰居：水井這週要停用三天，請大家先儲水。\n</letter>\n輸出格式：條列 3 點，每點一行。',
  },
  {
    check: 'assignsTask',
    want: 'fail',
    name: '範例列（輸入：／輸出：）不能提供任務動詞（mimic-mirror-04）',
    text: '輸入：四點 守夜人開門\n輸出：04:00 — 開門（守夜人）\n輸入：五點半 補燈油\n輸出：05:30 — 補燈油',
  },
  {
    check: 'assignsTask',
    want: 'fail',
    name: '<example> 區塊裡的範例不能提供任務動詞（example-hall-11）',
    text: '<example>\n輸入：橋斷了，但有個陌生人划船載我過河。\n輸出：帶著希望\n</example>\n輸出格式：每張留言一行。',
  },
  {
    check: 'assignsTask',
    want: 'fail',
    name: '### 資料 區塊裡的帳目不能提供任務動詞（citation-desk-21）',
    text: '### 資料\n第三季：入庫 42 袋，雨損 9 袋，換鹽 4 袋。請大家注意結餘。\n### 任務',
  },
  {
    check: 'assignsTask',
    want: 'pass',
    name: '「請＋狀語＋動詞」寫在同一行也要算（mask-workshop-41）',
    text: '你是一位在這片海岸待了三十年的港務長。請向新來的擺渡船員說明今晚的航次：夜航、逆流、南岸有霧。',
    evidenceHas: '說明',
  },
  {
    check: 'assignsTask',
    want: 'pass',
    name: '同一句換行寫也要算（跟上一句同分）',
    text: '你是一位在這片海岸待了三十年的港務長。\n請向新來的擺渡船員說明今晚的航次：夜航、逆流、南岸有霧。',
  },
  {
    check: 'assignsTask',
    want: 'partial',
    name: '只寫「回答問題」不給滿分',
    text: '### 資料\n渡口每日辰時開、酉時關。\n### 任務\n請回答問題。',
  },
  {
    check: 'assignsTask',
    want: 'pass',
    name: '證據是乾淨的動詞片語，不是半個詞、也不是整段',
    text: '請寫一份北路石橋的修復計畫。預算控制在 500 枚硬幣以內。',
    evidenceHas: '寫一份北路石橋的修復計畫',
    evidenceNot: '寫一」',
  },
  {
    check: 'assignsTask',
    want: 'pass',
    name: '證據不會把下一句的 token 吞進來（crossroad-scale-45）',
    text: '請從甲線、乙線、丙線中選出最安全的一條。effort = high，verbosity = low。',
    evidenceNot: 'effort',
  },

  /* --- A2 hasConstraint：序數／成語／量詞雜訊 --- */
  {
    check: 'hasConstraint',
    want: 'not-pass',
    name: '「第一次」是序數，不是限制',
    text: '這份說明是寫給第一次來到本鎮的旅人看的，語氣請親切一點。',
  },
  {
    check: 'hasConstraint',
    want: 'not-pass',
    name: '「檢查一次」不是限制',
    text: '請把這段公告改寫得更清楚，寫完之後自己再檢查一次。',
  },
  {
    check: 'hasConstraint',
    want: 'not-pass',
    name: '「每一個」不是限制',
    text: '請把工作拆開，每一個步驟都交代清楚再往下做。',
  },
  {
    check: 'hasConstraint',
    want: 'not-pass',
    name: '「一件一件」是疊詞，不是限制',
    text: '請把這張整修委託拆成子任務，然後一件一件完成它們。',
  },
  {
    check: 'hasConstraint',
    want: 'not-pass',
    name: '「一步一步」是疊詞，不是限制',
    text: '請一步一步想過再回答，把推理過程寫出來給我看。',
  },
  {
    check: 'hasConstraint',
    want: 'pass',
    name: '「3 組範例」才是規格，證據要挑它（lantern-rows-12）',
    text: '請照著下面 3 組範例的格式，把每一筆日誌轉成同一種狀態行。',
    evidenceHas: '3 組',
    evidenceNot: '一種',
  },
  {
    check: 'hasConstraint',
    want: 'pass',
    name: '「3 個條列重點」的弱量詞後面接規格名詞 → 算限制',
    text: '請整理成 3 個條列重點，一個階段一點。',
  },

  /* --- A3 specifiesFormat：「一行」要有格式脈絡 --- */
  {
    check: 'specifiesFormat',
    want: 'fail',
    name: '「埋在最後一行」是敘述，不是格式（echo-workshop-35）',
    text: '請把這段委託改寫得更好，因為上一版把停用日期埋在最後一行，沒有人看到。',
  },
  {
    check: 'specifiesFormat',
    want: 'pass',
    name: '「每張留言一行」是格式',
    text: '請替每張留言標上心情。輸出格式：每張留言一行。',
  },
  {
    check: 'specifiesFormat',
    want: 'pass',
    name: '「用一行回覆」是格式',
    text: '請把這筆紀錄整理好，用一行回覆我就好。',
  },

  /* --- A4 hasFewShot：同行成對、收尾 primer 不算一組 --- */
  {
    check: 'hasFewShot',
    want: 'pass',
    name: '同一行寫完一組範例也算（thinking-chamber-14）',
    text: '請判斷哪一盞燈先熄滅。輸入：2 號燈中午暗、5 號燈黃昏暗。輸出：<thinking>中午在黃昏之前</thinking><answer>2 號燈</answer>',
  },
  {
    check: 'hasFewShot',
    want: 'pass',
    name: '收尾的「輸出：」是接寫開頭，不計入組數（example-hall-11）',
    text:
      '請照著範例替每張留言標上心情。\n' +
      '輸入：橋斷了，但有個陌生人划船載我過河。\n輸出：帶著希望\n' +
      '輸入：連下三天雨，燈油也用完了。\n輸出：灰暗\n' +
      '輸入：山口的風很大，我還是走完了。\n輸出：',
    evidenceHas: '2 組',
    evidenceNot: '3 組',
  },

  /* --- A5 explainsWhy：說明上一版哪裡壞掉也算解釋 --- */
  {
    check: 'explainsWhy',
    want: 'pass',
    name: '「上一版…沒有人看到」是在說明理由（echo-workshop-35）',
    text: '請把這段 prompt 改寫得更好。上一版把停用日期埋在最後一行，沒有人看到。',
  },
  {
    check: 'explainsWhy',
    want: 'pass',
    name: '「問題是…」也算說明理由',
    text: '請把這張公告改寫一次。問題是舊版沒有寫出停用的日期，大家都跑空。',
  },
  {
    check: 'explainsWhy',
    want: 'pass',
    name: '「原因在於…」也算說明理由',
    text: '請把輸出改成純文字。原因在於後面的機器讀不了表格，會整批出錯。',
  },

  /* --- A6 hasStepByStep：熔爐關線索教的句子必須過 --- */
  {
    check: 'hasStepByStep',
    want: 'pass',
    name: '「請非常仔細地想過再回答」要算（effort-forge-15 的線索）',
    text: '請算出這本帳的差額，請非常仔細地想過再回答。',
  },
  {
    check: 'hasStepByStep',
    want: 'pass',
    name: '「仔細想過再回答」要算',
    text: '請算出這本帳的差額，仔細想過再回答我。',
  },

  /* --- A8 hasAudience：白話的對象寫法 --- */
  {
    check: 'hasAudience',
    want: 'pass',
    name: '「＿＿也看得懂」要算（gate-of-clarity-01）',
    text: '請把這張告示改寫成公告，讓外地來的旅人也看得懂。',
  },
  {
    check: 'hasAudience',
    want: 'pass',
    name: '「為＿＿而寫」要算',
    text: '請把這張告示改寫成公告，這是為第一次來的旅人而寫的。',
  },
  {
    check: 'hasAudience',
    want: 'pass',
    name: '「給＿＿看得懂」要算',
    text: '請把這張告示改寫成公告，要給完全沒讀過公文的擺渡人看得懂。',
  },

  /* --- A9 decomposesTask：頓號列舉給部分分數 --- */
  {
    check: 'decomposesTask',
    want: 'partial',
    name: '用頓號一次列三件事 → 部分分數（irreversible-gate-34 第一直覺）',
    text: '請直接動手：檢查三號閘的水位、調整二號閘到 60 公分、清掉上個月的閘門日誌。',
  },
  {
    check: 'decomposesTask',
    want: 'pass',
    name: '真的列成 1. 2. 3. → 滿分',
    text: '請把工作拆開後一件一件做：\n1. 檢查三號閘的水位。\n2. 把二號閘調到 60 公分。\n3. 清掉上個月的閘門日誌。',
  },

  /* --- A10 putsQuestionLast：證據要白話 --- */
  {
    check: 'putsQuestionLast',
    want: 'pass',
    name: '證據用白話，不要出現百分比',
    text:
      '第三季：入庫 42 袋穀物，雨損 9 袋，換鹽 4 袋，其餘留在下層地窖。\n' +
      '第四季：入庫 51 袋穀物，霉損 6 袋，撥給擺渡人 2 袋，其餘留在上層地窖。\n' +
      '第五季：入庫 38 袋穀物，蟲損 3 袋，換油 5 袋，其餘留在中層地窖。\n' +
      '問題：每一季各有多少袋離開了倉庫？',
    evidenceNot: '%',
  },

  /* --- A11 groundsInContext：部分分數要講出真正的規則 --- */
  {
    check: 'groundsInContext',
    want: 'partial',
    name: '只寫「只根據筆記」沒有指稱 → 提示要講出「上面／下面這份資料」',
    text: '請只用你讀到的東西作答，其他一律不要補。',
    evidenceHas: '上面',
  },
];

/** 執行全部斷言；ok/eq 由呼叫端提供，才能併進 test-rubric 的統計。 */
export function runPlaytestVerify({ ok, eq }) {
  const challengeData = readJson('src/data/challenges.json');
  const challenges = challengeData.challenges;
  const flowFile = readJson('src/data/flows.json');

  /* --- A/B/C：26 關的通關門檻 --- */
  for (const c of challenges) {
    const tag = `[${c.id}]`;

    const sample = evaluate(c, c.sample);
    ok(
      sample.passed && GRADE_RANK[sample.grade] >= GRADE_RANK.A,
      `${tag} playtest：示範解答至少 A`,
      `grade=${sample.grade} earned=${sample.earned}/${sample.total}`
    );

    // 零思考路徑：把所有快速填入依序按下去
    const chips = (c.quickFills || []).map((q) => q.text);
    ok(chips.length >= 2, `${tag} playtest：至少兩顆快速填入`, `n=${chips.length}`);
    const joined = chips.join('\n');
    const quick = evaluate(c, joined);
    ok(
      quick.passed,
      `${tag} playtest：快速填入全按下去就過關（零思考路徑）`,
      `earned=${quick.earned}/${quick.total} pass=${c.pass}｜缺：${quick.missing
        .map((m) => m.check)
        .join('、')}`
    );

    if ('starter' in c) {
      const weak = evaluate(c, c.starter);
      ok(!weak.passed, `${tag} playtest：起手的壞寫法仍然不過關`, `earned=${weak.earned}/${weak.total}`);
    }

    /* --- E：石碑刻印（預設玩法）的門檻 --- */
    const flow = flowFile.flows[c.id];
    ok(!!flow, `${tag} playtest：有石碑刻印流程（預設玩法）`);
    if (!flow) continue;
    const picks = flow.slots.map((s) => s.options.find((o) => o.correct).text);
    const carvedAll = evaluate(c, picks.join('\n'));
    ok(
      carvedAll.results.every((r) => r.passed),
      `${tag} playtest：全部選對時每一條檢查都滿分（選對就是完美）`,
      carvedAll.results
        .filter((r) => !r.passed)
        .map((r) => `${r.check}=${r.earned}/${r.weight}`)
        .join('、')
    );
    // 通過門檻本來就寬（總權重的一半，Phase 9 的放寬），所以這裡守的是
    // 「不能只刻一段就已經滿分」—— 後面的每一段都還在加分，玩家刻下去才有意義。
    const carvedOne = evaluate(c, picks[0]);
    ok(
      carvedOne.grade !== 'S' && carvedOne.earned < carvedAll.earned,
      `${tag} playtest：只刻第一段還不會滿分（後面每一段都還在加分）`,
      `earned=${carvedOne.earned}/${carvedOne.total} grade=${carvedOne.grade}`
    );
  }

  /* --- F：Phase 27 的兩種新題型也要「做對＝完美」 ---
   *
   * 排序刻印與神諭工坊送出的是同一段文字、走同一支離線引擎，所以門檻一樣：
   * 把它們「做對」組出來的那段字，每一條檢查都必須滿分（做對就是完美）。
   * 這一條守的是「新題型不能悄悄變成比石碑刻印容易或困難的另一套規則」。
   */
  const flowsByKind = { order: [], workshop: [] };
  for (const [id, f] of Object.entries(flowFile.flows)) {
    if (f.kind === 'order' && f.orderFlow) flowsByKind.order.push(id);
    if (f.kind === 'workshop' && f.workshop) flowsByKind.workshop.push(id);
  }
  ok(flowsByKind.order.length >= 1, 'playtest：至少有一關是排序刻印', flowsByKind.order.join(','));
  ok(flowsByKind.workshop.length >= 1, 'playtest：至少有一關是神諭工坊', flowsByKind.workshop.join(','));

  const byId = new Map(challenges.map((c) => [c.id, c]));
  for (const id of flowsByKind.order) {
    const tag = `[${id}]`;
    const c = byId.get(id);
    const of = flowFile.flows[id].orderFlow;
    const textOf = new Map(of.pieces.map((p) => [p.id, p.text]));
    const right = evaluate(c, of.order.map((pid) => textOf.get(pid)).join('\n'));
    ok(
      right.results.every((r) => r.passed),
      `${tag} playtest：排對時每一條檢查都滿分（排對就是完美）`,
      right.results.filter((r) => !r.passed).map((r) => `${r.check}=${r.earned}/${r.weight}`).join('、')
    );
    // 初始那個排法不能已經是正解（不然開場就過關了）
    ok(
      JSON.stringify(of.pieces.map((p) => p.id)) !== JSON.stringify(of.order),
      `${tag} playtest：一開始不是正解（真的要動手排）`
    );
  }
  for (const id of flowsByKind.workshop) {
    const tag = `[${id}]`;
    const c = byId.get(id);
    const ws = flowFile.flows[id].workshop;
    const stone = new Map(ws.stones.map((s) => [s.id, s.text]));
    const tool = new Map(ws.tools.map((t) => [t.id, t]));
    const seq = ws.order.sequence.map((tid) => tool.get(tid));
    const dispatch = [
      ws.head,
      ...seq.map((t) => t.spec),
      ...seq.map(
        (t, i) =>
          `${i + 1}. 呼叫「${t.name}」，${t.params.map((p) => `${p.label}＝${stone.get(p.stone)}`).join('、')}。`
      ),
      ws.rules.find((r) => r.correct).text,
    ].join('\n');
    const full = evaluate(c, dispatch);
    ok(
      full.results.every((r) => r.passed),
      `${tag} playtest：派工完成時每一條檢查都滿分（做對就是完美）`,
      full.results.filter((r) => !r.passed).map((r) => `${r.check}=${r.earned}/${r.weight}`).join('、')
    );
    const toolsOnly = evaluate(c, seq.map((t) => t.spec).join('\n'));
    ok(
      toolsOnly.grade !== 'S' && toolsOnly.earned < full.earned,
      `${tag} playtest：只挑完工具還不會滿分（後面三步都還在加分）`,
      `earned=${toolsOnly.earned}/${toolsOnly.total}`
    );
  }

  /* --- D：檢查器回歸案例 --- */
  for (const cse of CHECK_CASES) {
    const out = runCheck(cse.check, cse.text, cse.options || {});
    const got = out.score >= 1 ? 'pass' : out.score > 0 ? 'partial' : 'fail';
    if (cse.want === 'not-pass') {
      ok(got !== 'pass', `回歸 · ${cse.check}：${cse.name}`, `score=${out.score}｜${out.evidence}`);
    } else {
      eq(got, cse.want, `回歸 · ${cse.check}：${cse.name}`);
    }
    if (cse.evidenceHas) {
      ok(
        out.evidence.includes(cse.evidenceHas),
        `回歸 · ${cse.check}：回饋要提到「${cse.evidenceHas}」（${cse.name}）`,
        out.evidence
      );
    }
    if (cse.evidenceNot) {
      ok(
        !out.evidence.includes(cse.evidenceNot),
        `回歸 · ${cse.check}：回饋不該出現「${cse.evidenceNot}」（${cse.name}）`,
        out.evidence
      );
    }
  }
}

/* --- 單獨執行時自己印報告 --- */
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  let passCount = 0;
  const failures = [];
  const ok = (cond, name, detail = '') => {
    if (cond) passCount += 1;
    else failures.push(`${name}${detail ? `\n      ↳ ${detail}` : ''}`);
  };
  const eq = (actual, expected, name) =>
    ok(actual === expected, name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

  runPlaytestVerify({ ok, eq });

  if (failures.length) {
    console.error(`✗ ${failures.length} 個 playtest 門檻失敗（通過 ${passCount}）：\n`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log(`✓ playtest 門檻全部通過：${passCount} 個斷言`);
}

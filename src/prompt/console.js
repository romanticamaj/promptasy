/**
 * Promptasy — Prompt 主控台（四幕式）
 *
 * 玩家在這裡讀情境、看指引、把 prompt 刻出來、按下手印，然後拿到「會教人的回饋」：
 * 每條檢查過了沒、缺什麼、對應技巧的官方出處連結。
 *
 * Phase 12：面板不再一次把所有東西攤開，而是**像導演分鏡一樣一幕一幕帶**——
 *
 *   ①委託：只有 NPC、情境、任務、素材。看完按「聆聽指引 →」。
 *   ②指引：神諭刻文 —— 這一關要用上的工法，逐條白話說明。
 *           每一條都掛著它的**神諭原典**（＝廠商官方文件，可點）。
 *           刻文本身是遊戲自撰的白話，絕不冒充官方引文（護欄 2）。
 *   ③刻印：石碑（或自由書寫的書寫檯）成為舞台，右側「刻痕對照」即時亮燈，
 *           刻文縮成一個側頁籤隨時翻得回來。
 *   ④手印：石碑刻滿 → 焦點轉到手掌印儀式 → 按住 → 結果面板。
 *
 * 一次只有一幕擁有畫面；轉場像「鏡頭切換」（切掉舊的，新的分批揭示）。
 * 進度指示器 ①②③④ 可以往回走，但不能跳過還沒看過的幕
 * （看過指引的關卡重玩時可以直接跳到刻印 —— 記在存檔的 guidanceSeen）。
 *
 * Phase 11 的兩種答題方式都還在：石碑刻印（預設）與自由書寫。兩種送出的都是
 * **同一段文字**、走**同一支離線評分引擎**，評價 / XP / 圖鑑完全一致（護欄 3）。
 */
import {
  bindInfoTips,
  createOverlay,
  datedNoteHtml,
  esc,
  infoTip,
  on,
  rovingList,
  sourceBook,
  sourceNoteHtml,
} from '../ui/dom.js';
import { glossary } from '../ui/glossary.js';
import { evaluate, formatScore, nextGradeTarget } from '../challenges/rubric.js';
import { CHECKS } from '../challenges/checks.js';
import { createStele } from './stele.js';
import { createOrderBoard } from './order.js';
import { createWorkshop } from './workshop.js';
import { createFixBoard, isFixFlow } from './fix.js';
import { createSpotBoard, isSpotFlow } from './spot.js';
import { createInductBoard, isInductFlow } from './induct.js';
import { isSlotList } from './slots.js';
import { createTradeoffBoard, isTradeoffFlow } from './tradeoff.js';
import { createConstraintBoard, isConstraintFlow } from './constraint.js';
import { createMultiBoard, isMultiFlow } from './multi.js';
import { createSimBoard, isSimFlow, registerSimDials } from './sim.js';
import { createReverseBoard, isReverseFlow } from './reverse.js';
import { isApplicationTrial, effectiveChallenge } from '../challenges/trial.js';

export { registerSimDials };

const GRADE_LABEL = { S: '完美', A: '優秀', B: '良好', C: '通過' };

/** 四幕。名字是遊戲世界裡的說法，不是系統術語。 */
export const ACTS = Object.freeze([
  { n: 1, num: '①', zh: '委託', roman: 'ACT I', en: 'THE COMMISSION' },
  { n: 2, num: '②', zh: '指引', roman: 'ACT II', en: 'THE INSCRIPTION' },
  { n: 3, num: '③', zh: '刻印', roman: 'ACT III', en: 'THE CARVING' },
  { n: 4, num: '④', zh: '手印', roman: 'ACT IV', en: 'THE PALM' },
]);

/**
 * 幕名的統一寫法（Phase 35.1）：**ACT I 第一幕 · 委託**。
 *
 * 指示器與每一幕的小標從此長得一模一樣 —— 玩家在指示器上看到的那一塊，
 * 走進去之後標題上寫的是同一句話。
 *
 * `pos` 是**這一關實際上的第幾幕**，不是 `ACTS` 的索引：試煉沒有第二幕
 * （走的是 1 → 3 → 4），所以刻印在它眼裡就是「ACT II 第二幕」——
 * 畫面上不會出現「第一幕之後是第三幕」這種只有程式看得懂的編號。
 */
export const ACT_ROMAN = Object.freeze(['I', 'II', 'III', 'IV']);
export const ACT_ZH_NUM = Object.freeze(['一', '二', '三', '四']);

/**
 * @param {number} pos 這一關的第幾幕（1 起算）
 * @param {string} zh  這一幕的名字（委託 / 指引 / 刻印 / 手印 · 呈遞）
 */
export function actLabelText(pos, zh) {
  const i = Math.max(0, Math.min(ACT_ROMAN.length - 1, pos - 1));
  return { roman: `ACT ${ACT_ROMAN[i]}`, zh: `第${ACT_ZH_NUM[i]}幕 · ${zh}` };
}

/** 幕名的 HTML（羅馬數字 ＋ 中文，同一行）。 */
export function actLabelHtml(pos, zh) {
  const { roman, zh: zhText } = actLabelText(pos, zh);
  return `${roman} <span class="act__kickerzh">${esc(zhText)}</span>`;
}

/** 第二幕的世界觀名稱（遊戲自撰的白話刻文，出處另掛「神諭原典」）。 */
export const GUIDE_TITLE = '神諭刻文';
/** 官方出處在畫面上的說法 —— 換皮但不說謊：後面一定接真正的文件名。 */
export const SOURCE_LABEL = '神諭原典';
/**
 * Phase A：一關只教一條技巧。
 *
 * 石碑上仍然會驗到別的東西（每一關都要的地基「說清楚要做什麼」，加上還沒
 * 搬去自己神廟的舊項目），但它們**不是這一關教的**——所以只留一行名字，
 * 不給它們自己的刻文與原典，畫面上不會假裝一次教了好幾條。
 */
export const EXTRA_LABEL = '順手會用到';
/**
 * 「神諭原典到底是什麼」的解釋。
 *
 * Phase 13：這句話是必要的（換皮不能讓人搞不清楚出處是真的），但它不該
 * 一直站在故事前面 —— 收進第二幕開頭那顆 ⓘ 裡（hover / focus / 點擊都看得到）。
 * 真正可點的出處連結不受影響，永遠留在每一條刻文下面。
 */
export const SOURCE_NOTE = `每一段刻文都指得回它的${SOURCE_LABEL} —— 也就是 OpenAI、Anthropic、Google、xAI 的官方文件。`;
/** 第四幕在自由書寫模式下的說法（沒有石碑可以按手印，改成「呈遞」）。 */
const ACT4_FREE_ZH = '呈遞';
/** 自由書寫的送出鍵。世界裡沒有「送出評分」這種東西 —— 你是把字呈給神諭。 */
export const SUBMIT_LABEL = '呈給神諭';

/**
 * XP 數字從 0 跳到目標值（expo-out，約 900ms）。
 *
 * 刻意先把最終值寫進 DOM 再開始倒數回 0：這樣就算動畫被跳過、
 * 被 prefers-reduced-motion 關掉、或測試在下一幀就讀取，
 * 讀到的都會是正確的數字，不會是動畫中途的值。
 */
function tickUp(node, ms = 900) {
  if (!node) return;
  const to = Number(node.getAttribute('data-to')) || 0;
  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || to <= 0 || typeof requestAnimationFrame !== 'function') return;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 4); // quart-out：末段收得很慢，像計數器停下來
    node.textContent = `+${Math.round(to * eased)}`;
    if (p < 1) requestAnimationFrame(step);
    else node.textContent = `+${to}`;
  };
  node.textContent = '+0';
  requestAnimationFrame(step);
}

/** 連續幾次沒過之後解鎖「看看範例」（先自己試，試不出來才給答案）。 */
export const SAMPLE_AFTER_FAILS = 2;

/** 停手多久之後，漂浮提示球會自己「呼吸」一下提醒你它在那裡（毫秒）。 */
export const ORB_IDLE_MS = 20000;

/** 兩種答題方式。'guided' = 跟著石碑走（預設），'free' = 自由書寫。 */
export const PROMPT_MODES = Object.freeze(['guided', 'free']);

/**
 * 引導式作答的五種題型（Phase 27 三種＋課程 v2 Phase B 兩種）。
 *
 * 資料層（flows.json）用 `kind` 宣告，**沒寫就是 `choice`** —— 也就是 Phase 11
 * 就在跑的石碑刻印。這個相容契約永遠不變：新增題型不會動到任何一關舊資料。
 *
 *   choice    石碑刻印：一段一段從 2–3 個選項裡挑（教「這一段該寫什麼」）
 *   order     排序刻印：石版已經刻好了，要把它們排順（教「這幾段該照什麼次序」）
 *   workshop  神諭工坊：挑工具 → 填參數 → 排呼叫 → 立規矩（教工具使用 / function calling）
 *   fix       改碑：抄寫人留下一份壞草稿，你把畫線的那幾句換掉（教「這一句哪裡壞了」）
 *   spot      點碑：一疊石籤，你自己看出哪幾句有問題並點起來（教「自己找出毛病」）
 *   induct    推規碑：牆上的對照一組一組浮出來，你要先看出規律再刻（教「規律怎麼來的」）
 *   tradeoff  雙面碑：兩個都可行的做法，換一張卡就換一個贏家（教「什麼時候用哪一面」）
 *   constraint 合尺：委託人給你幾把尺，挑石片拼出同時合尺的委託（教「一次滿足好幾條規格」）
 *   multi     兩輪刻印：刻完第一輪先看一段自撰的回話，第二輪才動手修它（教「迭代」）
 *   sim       轉鈕：轉一格旋鈕，神諭的回話跟著換（教「這個旋鈕到底在調什麼」）
 *
 * 八種都住在第三幕，結尾都是同一隻手掌印，送出的都是同一段文字、
 * 走同一支離線評分引擎（護欄 3）。
 *
 * 合尺（Phase D）是唯一一種把**即時預檢升格成舞台**的題型：尺上的燈就是
 * 真的檢查器跑出來的結果，所以它沒有自己的判準，只是把同一支引擎搬到台前。
 *
 * 推規碑與雙面碑是**石碑刻印的變體**（課程 v2 Phase C）：前面多一段
 * 「先想通一件事」的舞台，想通之後回到同一組 `slots` 刻印 —— 所以它們
 * 用的是同一份資料的 `slots`，退回石碑刻印時玩家一格內容都不會少。
 */
export const FLOW_KINDS = Object.freeze([
  'choice',
  'order',
  'workshop',
  'fix',
  'spot',
  'induct',
  'tradeoff',
  'constraint',
  'multi',
  'sim',
  'reverse',
]);

/**
 * 一份流程資料是哪一種題型。
 *
 * **未知的 kind、或宣告了某個 kind 卻沒有對應資料，一律回到石碑刻印**——
 * 這是舊資料的相容契約（WORLD.md §3.3b），也是資料寫壞時的安全網：
 * 玩家永遠有一種玩得動的題型，不會開到一塊空白的石碑。
 */
export function flowKind(flow) {
  const k = flow && flow.kind;
  if (k === 'order' && flow.orderFlow) return 'order';
  if (k === 'workshop' && flow.workshop) return 'workshop';
  if (k === 'fix' && isFixFlow(flow.fixFlow)) return 'fix';
  if (k === 'spot' && isSpotFlow(flow.spotFlow)) return 'spot';
  // 推規碑 / 雙面碑還要求「刻印那一段」也在（它們共用同一份 slots）
  if (k === 'induct' && isInductFlow(flow.inductFlow) && isSlotList(flow.slots)) return 'induct';
  if (k === 'tradeoff' && isTradeoffFlow(flow.tradeoffFlow) && isSlotList(flow.slots)) return 'tradeoff';
  if (k === 'constraint' && isConstraintFlow(flow.constraintFlow) && isSlotList(flow.slots)) return 'constraint';
  // 兩輪刻印：輪次是同一份 slots 的切法，所以 slots 一定要在（見 multi.js 的契約）
  if (k === 'multi' && isMultiFlow(flow.multiFlow, flow.slots)) return 'multi';
  // 轉鈕：樣本住在 sim-samples.json，沒有註冊樣本時一律退回石碑刻印（見 sim.js 的契約）
  if (k === 'sim' && isSimFlow(flow.simFlow, flow.slots)) return 'sim';
  // 拆碑：先把一份寫好的委託拆開標名字，標完才回到同一份 slots 刻印（見 reverse.js 的契約）
  if (k === 'reverse' && isReverseFlow(flow.reverseFlow) && isSlotList(flow.slots)) return 'reverse';
  return 'choice';
}

/** 每一種題型在畫面上的說法（世界的語言，不是系統術語）。 */
export const KIND_LABEL = Object.freeze({
  choice: '石碑刻印',
  order: '排序刻印',
  workshop: '神諭工坊',
  fix: '改碑',
  spot: '點碑',
  induct: '推規碑',
  tradeoff: '雙面碑',
  constraint: '合尺',
  multi: '兩輪刻印',
  sim: '轉鈕',
  reverse: '拆碑',
});

/** 對應的 Latin meta label（版面上那一行小字）。 */
export const KIND_EN = Object.freeze({
  choice: 'Carve',
  order: 'Order',
  workshop: 'Dispatch',
  fix: 'Mend',
  spot: 'Spot',
  induct: 'Induce',
  tradeoff: 'Weigh',
  constraint: 'Fit',
  multi: 'Rounds',
  sim: 'Dial',
  reverse: 'Unbuild',
});

/** 正規化模式字串（未知值一律回到預設的石碑刻印）。 */
export function normalizeMode(value) {
  return value === 'free' ? 'free' : 'guided';
}

export function createPromptConsole({
  content,
  progression,
  onResult,
  onSubmit,
  onClose,
  onChime,
  onCarve,
  onReject,
  onSeal,
  onShare,
  onTap,
  onDial,
}) {
  let current = null;
  let currentFlow = null;
  /** 這一關實際使用的模式（沒有流程資料的關卡只能自由書寫）。 */
  let mode = normalizeMode(progression.state.settings.promptMode);
  let lastEvaluation = null;
  /** 這一關這次開啟以來，送出後沒過的次數。 */
  let fails = 0;
  let sampleShown = false;
  /*
   * 課程 v2 · Phase J2：大師層印記（無筆之印 / 默寫之印）的判定材料。
   * 全部是「這一次開啟關卡以來」的計數 —— 關掉重開就重來（判定寫在 progression）。
   */
  /** 這一次開啟以來呈遞了幾次（第 1 次就是 attempt === 1）。 */
  let attempts = 0;
  /** 這一次有沒有按過快速填入 / 技巧積木 / 提示球的「幫我填」。 */
  let usedQuickFill = false;
  /** 這一次有沒有開過提示球。 */
  let usedCoach = false;
  /** 這一次刻印被石碑退回幾次（引導式題型的「一次就對」）。 */
  let rejects = 0;
  /** 上一次預檢時「已經亮起來」的檢查 id —— 用來偵測「這一項剛剛才亮」。 */
  let litBefore = new Set();
  /** 漂浮提示球目前指著哪一條檢查（在還沒做到的項目之間循環）。 */
  let coachIndex = 0;
  let coachOpen = false;
  let idleTimer = null;
  /** 最近一次預檢的結果（提示球用它決定要教哪一項）。 */
  let lastPreflight = null;

  const overlay = createOverlay({
    id: 'prompt-console',
    title: 'Prompt 主控台',
    eyebrow: '練習室',
    wide: true,
    // 標頭壓成一條：關卡名 ＋ NPC 在左，進度小牌與 Esc 在右
    headBar: true,
    onClose: () => api.close(),
  });

  overlay.body.innerHTML = `
    <div class="console" data-act="1">
      <nav class="acts" data-acts aria-label="四幕進度">
        ${ACTS.map(
          (a) => `<button class="acts__item" type="button" data-act-go="${a.n}">
            <span class="acts__zh" data-act-zh="${a.n}">${a.zh}</span>
          </button>`
        ).join('<span class="acts__rule" aria-hidden="true"></span>')}
      </nav>

      <section class="act act--brief" data-in-acts="1" tabindex="-1" aria-label="第一幕 · 委託">
        <p class="console__scenario reveal d1" data-scenario></p>
        <div class="mission reveal d2">
          <div class="meta-rule"><h4><span class="zh">你的任務</span><span class="en">Mission</span></h4></div>
          <p class="mission__text" data-mission></p>
        </div>
        <figure class="artifact reveal d3" data-material-wrap hidden>
          <figcaption class="artifact__label" data-material-label></figcaption>
          <pre class="artifact__body" data-material></pre>
        </figure>
        <div class="act__foot reveal d4">
          <span class="spacer"></span>
          <button class="btn btn--primary" type="button" data-act-next="2">聆聽指引 →</button>
        </div>
      </section>

      <section class="act act--guide" data-in-acts="2" tabindex="-1" aria-label="第二幕 · 指引">
        <h3 class="act__head reveal d1">${GUIDE_TITLE}<span class="act__lead act__lead--inline" data-guide-lead></span></h3>
        <p class="craft reveal d2" data-craft hidden></p>
        <ol class="glyphs" data-guidance></ol>
        <p class="extras reveal" data-guidance-extra hidden></p>
        <details class="clue reveal">
          <summary>還想要一點線索 · Clue<kbd>L</kbd></summary>
          <p data-clue></p>
        </details>
        <div class="act__foot reveal">
          <button class="btn btn--ghost" type="button" data-act-go="1">← 回顧委託</button>
          <span class="spacer"></span>
          <button class="btn btn--primary" type="button" data-act-next="3">開始刻印 →</button>
        </div>
      </section>

      <section class="act act--carve" data-in-acts="3 4" aria-label="第三幕 · 刻印">
        <div class="carvehead">
          <span class="spacer"></span>
          <label class="console__label" for="prompt-input" data-free-label hidden><span class="zh">你的 prompt</span><span class="en">Your Prompt</span></label>
          <p class="console__label" data-guided-label><span class="zh">石碑刻印</span><span class="en">Carve</span></p>
          <button class="modeswitch" type="button" data-mode>自由書寫模式</button>
        </div>
        <div class="carvestage">
          <div class="carvestage__main">
            <div class="stele-slot" data-stele-slot></div>
            <div data-free hidden>
              <div class="desk">
                <textarea id="prompt-input" class="prompt-input" spellcheck="false"
                  aria-describedby="prompt-help"
                  placeholder="在這裡寫下你的 prompt…（Ctrl / ⌘ + Enter 呈上）"></textarea>
                <div class="desk__foot">
                  <span class="desk__count" data-count>0 字</span>
                  <span class="spacer"></span>
                  <span data-lines>1 行</span>
                </div>
              </div>
              <!-- 技巧積木：貼著書寫檯的工具列（Phase 18：從右欄搬過來，
                   壓成一行一片的小石籤 —— 看著輸入框就看得到它們） -->
              <div class="console__blocks" data-blocks-wrap hidden role="group" aria-label="技巧積木">
                <span class="blocks__label">技巧積木</span>
                <div class="blocks" data-blocks></div>
              </div>
              <div class="fills" data-fills-wrap hidden>
                <div class="meta-rule"><h4><span class="zh">快速填入</span><span class="en">Quick Fill</span></h4></div>
                <div class="fills__row" data-fills></div>
              </div>
              <div class="console__actions">
                <button class="btn btn--ghost" data-sample type="button" disabled>看看範例</button>
                <span class="spacer"></span>
                <button class="btn btn--ghost" data-clear type="button">清空</button>
                <button class="btn btn--primary" data-submit type="button">呈給神諭</button>
              </div>
              <p class="console__help" id="prompt-help">Ctrl / ⌘ + Enter 呈上 · Tab 移動焦點 · 方向鍵在石籤之間走 · Esc 收起</p>
            </div>
          </div>
          <aside class="rail" data-rail>
            <div class="meta-rule">
              <h4><span class="zh">刻痕對照</span><span class="en">Live Check</span></h4>
              <label class="toggle" title="打字時就先跑一次離線檢查，做到的項目會亮起來">
                <input type="checkbox" data-preflight /><span>即時預檢</span>
              </label>
            </div>
            <p class="lamp" data-lamp aria-live="polite"><span class="lamp__dot"></span><span data-lamp-text></span></p>
            <ul class="checklist" data-checklist></ul>
            <details class="guidetab" data-guidetab>
              <summary>${GUIDE_TITLE} · 翻回指引<kbd>L</kbd></summary>
              <div data-guidance-compact></div>
            </details>
          </aside>
        </div>
        <!-- 提示：一顆安靜的小燈泡，貼在第三幕的左下角。不寫字、不搶戲 ——
             它只是很慢地呼吸，告訴你「想不出來的時候這裡有光」。 -->
        <button class="orb" type="button" data-orb aria-expanded="false" aria-controls="coach-box"
          aria-label="提示" title="不知道怎麼寫？點我（或按 H）">
          <svg class="orb__bulb" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 2.6a6.6 6.6 0 0 0-3.8 12 3 3 0 0 1 1.1 1.8l.2 1h5l.2-1a3 3 0 0 1 1.1-1.8A6.6 6.6 0 0 0 12 2.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.7 19.1h4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.6 21.4h2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 8.2v4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/></svg>
        </button>
        <div class="coach" id="coach-box" data-coach hidden role="dialog" aria-label="教學提示"></div>
      </section>

      <section class="act act--verdict" data-in-acts="4" tabindex="-1" aria-label="第四幕 · 手印">
        <div class="result" data-result hidden tabindex="-1" role="status" aria-live="polite"></div>
      </section>
    </div>
  `;

  const scenarioEl = overlay.body.querySelector('[data-scenario]');
  const missionEl = overlay.body.querySelector('[data-mission]');
  const materialWrap = overlay.body.querySelector('[data-material-wrap]');
  const materialLabelEl = overlay.body.querySelector('[data-material-label]');
  const materialEl = overlay.body.querySelector('[data-material]');
  const fillsWrap = overlay.body.querySelector('[data-fills-wrap]');
  const fillsEl = overlay.body.querySelector('[data-fills]');
  const sampleBtn = overlay.body.querySelector('[data-sample]');
  const clueEl = overlay.body.querySelector('[data-clue]');
  const checklistEl = overlay.body.querySelector('[data-checklist]');
  const blocksWrap = overlay.body.querySelector('[data-blocks-wrap]');
  const blocksEl = overlay.body.querySelector('[data-blocks]');
  const textarea = overlay.body.querySelector('.prompt-input');
  const resultEl = overlay.body.querySelector('[data-result]');
  const countEl = overlay.body.querySelector('[data-count]');
  const linesEl = overlay.body.querySelector('[data-lines]');
  const submitBtn = overlay.body.querySelector('[data-submit]');
  const lampEl = overlay.body.querySelector('[data-lamp]');
  const lampTextEl = overlay.body.querySelector('[data-lamp-text]');
  const orbEl = overlay.body.querySelector('[data-orb]');
  const coachEl = overlay.body.querySelector('[data-coach]');
  const freeWrap = overlay.body.querySelector('[data-free]');
  const freeLabel = overlay.body.querySelector('[data-free-label]');
  const guidedLabel = overlay.body.querySelector('[data-guided-label]');
  const modeBtn = overlay.body.querySelector('[data-mode]');
  const steleSlot = overlay.body.querySelector('[data-stele-slot]');
  const preflightToggle = overlay.body.querySelector('.rail .toggle');
  const consoleEl = overlay.body.querySelector('.console');
  const actSections = Array.from(overlay.body.querySelectorAll('[data-in-acts]'));
  const actNavEl = overlay.body.querySelector('[data-acts]');
  const actBtns = Array.from(overlay.body.querySelectorAll('[data-act-go]'));
  const actRules = Array.from(overlay.body.querySelectorAll('.acts__rule'));
  const guideLeadEl = overlay.body.querySelector('[data-guide-lead]');
  const act1NextBtn = overlay.body.querySelector('.act--brief [data-act-next]');
  const act1El = overlay.body.querySelector('.act--brief');
  const act2El = overlay.body.querySelector('.act--guide');
  const craftEl = overlay.body.querySelector('[data-craft]');
  const guidanceEl = overlay.body.querySelector('[data-guidance]');
  const guidanceExtraEl = overlay.body.querySelector('[data-guidance-extra]');
  const guidanceCompactEl = overlay.body.querySelector('[data-guidance-compact]');
  const guideTabEl = overlay.body.querySelector('[data-guidetab]');

  // ⓘ 的 hover / focus / 點擊（事件委派，之後重繪的刻文也吃得到）
  bindInfoTips(overlay.body);

  /** 目前在第幾幕。 */
  let act = 1;
  /** 走過的幕（可以自由回頭；沒走過的不能往前跳）。 */
  let visited = new Set([1]);

  /* ---------------------------------------------------------------- *
   * 石碑刻印（Phase 11 的預設互動）
   *
   * 刻上一段 → 跑一次預檢（同一支引擎），左邊的檢查清單就跟著亮一盞燈；
   * 刻滿 → 手掌印出現 → 按住 → 呈給神諭（走的還是 submit()）。
   * ---------------------------------------------------------------- */
  /** 石碑退回一次（大師層印記要求「一次就對」，所以要數）。 */
  function noteReject(info) {
    rejects += 1;
    onReject?.({ feedback: info && info.feedback });
  }

  const stele = createStele({
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onComplete: () => {
      onSeal?.();
      // 刻滿了 → 鏡頭切到第四幕：整個畫面只剩下那隻手掌
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(stele.root);

  /* ---------------------------------------------------------------- *
   * 排序刻印（Phase 27）
   *
   * 石版已經刻好了，玩家要做的是把它們**排順**。排錯不會失敗、不會扣分 ——
   * 排到對了手掌印才浮出來，所以「送出後才發現排錯」這件事不存在。
   * ---------------------------------------------------------------- */
  const orderBoard = createOrderBoard({
    onLift: () => onChime?.(1),
    onSettle: ({ right, total }) => {
      runPreflight();
      onCarve?.({ index: right, total });
    },
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
  });
  steleSlot.appendChild(orderBoard.root);

  /* ---------------------------------------------------------------- *
   * 神諭工坊（Phase 27）
   *
   * 挑工具 → 填參數 → 排呼叫 → 立規矩。挑錯 / 放錯只會就地長出一句白話教學，
   * 不扣分、不前進（WORLD.md §3.5）。組出來的派工單就是要呈給神諭的那段字。
   * ---------------------------------------------------------------- */
  const workshop = createWorkshop({
    onTake: () => {
      runPreflight();
      onCarve?.({ index: 1, total: 1 });
    },
    onReject: (info) => noteReject(info),
    onStage: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
  });
  steleSlot.appendChild(workshop.root);

  /* ---------------------------------------------------------------- *
   * 改碑（課程 v2 · Phase B）
   *
   * 抄寫人留下一份寫壞的草稿，畫線的那幾句要換掉。挑錯的替代寫法只會
   * 「石碑不收 ＋ 就地教學」，`Esc` 把剛剛換掉的那一句還原（見 fix.js 的鍵位契約）。
   * ---------------------------------------------------------------- */
  const fixBoard = createFixBoard({
    onFix: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onRestore: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(fixBoard.root);

  /* ---------------------------------------------------------------- *
   * 點碑（課程 v2 · Phase B）
   *
   * 一疊石籤攤在檯上，玩家自己看出哪幾句有問題並點起來。點到不能動的那一句
   * 只會彈回來 ＋ 就地教學；還沒挑完手掌印根本不出現（不會失敗）。
   * ---------------------------------------------------------------- */
  const spotBoard = createSpotBoard({
    onSpot: ({ right, total }) => {
      runPreflight();
      onCarve?.({ index: right, total });
    },
    onReject: (info) => noteReject(info),
    onRestore: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(spotBoard.root);

  /* ---------------------------------------------------------------- *
   * 推規碑（課程 v2 · Phase C）
   *
   * 牆上的對照一組一組浮出來，你要先看出規律；最後一組是真的在**驗證**
   * 你的規律（只看前兩組推出來的那條順手規律在那裡會答錯）。猜錯只會
   * 「牆不回應 ＋ 就地教學」，想通之後才回到同一組 slots 刻印。
   * ---------------------------------------------------------------- */
  const inductBoard = createInductBoard({
    onGuess: ({ round: r, total }) => {
      onCarve?.({ index: r, total });
    },
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(inductBoard.root);

  /* ---------------------------------------------------------------- *
   * 雙面碑（課程 v2 · Phase C）
   *
   * 兩個都可行的做法。倒向哪一面都會前進，但兩面都會誠實說出這一張卡上
   * 買到什麼、付出什麼；換一張卡，贏的那一面會翻過來 —— 玩家學到的是
   * 「什麼時候用哪一面」，不是「哪一面比較好」。
   * ---------------------------------------------------------------- */
  const tradeoffBoard = createTradeoffBoard({
    onWeigh: ({ round: r, total }) => {
      onCarve?.({ index: r + 1, total });
    },
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(tradeoffBoard.root);

  /* ---------------------------------------------------------------- *
   * 合尺（課程 v2 · Phase D）
   *
   * 委託人的每一把尺都把要求寫在臉上（完全資訊）；檯上的石片挑上去，
   * 尺就當場亮或暗 —— 亮的依據是**真的離線檢查器**，不是另一套判準。
   * 放錯不扣分、不前進，只會在那一片旁邊寫出哪一把尺暗了。
   * ---------------------------------------------------------------- */
  const constraintBoard = createConstraintBoard({
    onPlace: ({ lit, total }) => {
      runPreflight();
      onCarve?.({ index: lit, total });
    },
    onReject: (info) => noteReject(info),
    onRestore: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(constraintBoard.root);

  /* ---------------------------------------------------------------- *
   * 兩輪刻印（課程 v2 · Phase G）
   *
   * 同一塊碑、同一組 slots、同一隻手掌印 —— 只是把段落切成兩輪，
   * 中間插一段**遊戲自撰**的「神諭第一次回話」（畫面上掛 ⓘ 明講）。
   * 迭代類技巧要的就是那一秒：看到第一輪長什麼樣，再決定第二輪修什麼。
   * ---------------------------------------------------------------- */
  const multiBoard = createMultiBoard({
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onRound: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(multiBoard.root);

  /* ---------------------------------------------------------------- *
   * 轉鈕（課程 v2 · Phase H）
   *
   * 旋鈕上有三檔，每一檔配一段**遊戲自撰**的離線回話（絕不呼叫任何服務）。
   * 三檔都轉過了才開放刻印 —— 觀察就是這一關的內容，不是可以跳過的過場。
   * ---------------------------------------------------------------- */
  const simBoard = createSimBoard({
    /*
     * 轉一格：放的是**旋鈕自己的卡榫聲**（issue #3 交付的三檔），
     * 不是刻印那一聲 —— 轉旋鈕跟刻字是兩件事，聽起來也該是兩件事。
     * 音高越高＝檔位越高，不看畫面也分得出剛剛轉到哪一檔。
     */
    onTurn: ({ index, total }) => {
      onDial?.({ index, total });
    },
    onObserved: () => runPreflight({ silent: true }),
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(simBoard.root);

  /* ---------------------------------------------------------------- *
   * 拆碑（課程 v2 · Phase J）
   *
   * 牆上釘著一份**已經寫得很好**的舊委託，被拆成幾塊；玩家要一塊一塊
   * 說出「它為什麼在這裡」。貼錯只會「碑不收這個名字 ＋ 就地教學」，
   * `Esc` 把剛剛貼好的那一塊拆回來（見 reverse.js 的鍵位契約）；
   * 整份拆完之後，才回到同一組 slots 刻印。
   * ---------------------------------------------------------------- */
  const reverseBoard = createReverseBoard({
    onLabel: ({ index, total }) => {
      onCarve?.({ index, total });
    },
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: (info) => noteReject(info),
    onRestore: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(reverseBoard.root);

  /** 這一關的引導式題型（choice / order / workshop / fix / spot / induct / tradeoff / constraint / multi）。 */
  function kind() {
    return flowKind(currentFlow);
  }

  /** 現在在台上的那一塊石碑（所有題型共用同一組介面）。 */
  function board() {
    const k = kind();
    if (k === 'order') return orderBoard;
    if (k === 'workshop') return workshop;
    if (k === 'fix') return fixBoard;
    if (k === 'spot') return spotBoard;
    if (k === 'induct') return inductBoard;
    if (k === 'tradeoff') return tradeoffBoard;
    if (k === 'constraint') return constraintBoard;
    if (k === 'multi') return multiBoard;
    if (k === 'sim') return simBoard;
    if (k === 'reverse') return reverseBoard;
    return stele;
  }

  /**
   * 現在是不是引導式作答（石碑刻印 / 排序刻印 / 神諭工坊）。
   * 沒有流程資料的關卡（未來新增關卡時）一律當成自由書寫 —— 只有一個判斷式，
   * 版面、評分取哪一段文字、預檢開不開全部看它，不會互相矛盾。
   */
  function isGuided() {
    return mode === 'guided' && Boolean(currentFlow);
  }

  /** 現在要被評分的那一段文字（引導式 → 石碑上的內容；自由書寫 → 輸入框）。 */
  function currentText() {
    return isGuided() ? board().text : textarea.value;
  }

  /** 石碑刻印一律開著預檢（刻一段亮一盞燈就是它的回饋節奏）。 */
  function preflightActive() {
    return isGuided() ? true : preflightOn;
  }

  /**
   * 切換兩種答題方式的版面。
   * 兩邊的 DOM 都留在頁面上（只是 hidden），所以切回來不會掉狀態。
   */
  function applyMode() {
    const guided = isGuided();
    const k = kind();
    root().classList.toggle('is-guided', guided);
    root().classList.toggle('is-free', !guided);
    root().setAttribute('data-kind', guided ? k : 'free');
    freeWrap.hidden = guided;
    freeLabel.hidden = guided;
    guidedLabel.hidden = !guided;
    // 所有題型共用一個舞台，一次只有一種在上面
    stele.root.hidden = !guided || k !== 'choice';
    orderBoard.root.hidden = !guided || k !== 'order';
    workshop.root.hidden = !guided || k !== 'workshop';
    fixBoard.root.hidden = !guided || k !== 'fix';
    spotBoard.root.hidden = !guided || k !== 'spot';
    inductBoard.root.hidden = !guided || k !== 'induct';
    tradeoffBoard.root.hidden = !guided || k !== 'tradeoff';
    constraintBoard.root.hidden = !guided || k !== 'constraint';
    multiBoard.root.hidden = !guided || k !== 'multi';
    simBoard.root.hidden = !guided || k !== 'sim';
    reverseBoard.root.hidden = !guided || k !== 'reverse';
    const zhLabel = guidedLabel.querySelector('.zh');
    if (zhLabel) zhLabel.textContent = KIND_LABEL[k];
    const enLabel = guidedLabel.querySelector('.en');
    if (enLabel) enLabel.textContent = KIND_EN[k];
    // 石碑刻印時：提示球用不到（回饋就在選項旁邊），積木與預檢開關也不需要
    orbEl.hidden = guided;
    if (guided) {
      coachOpen = false;
      coachEl.hidden = true;
    }
    if (preflightToggle) preflightToggle.hidden = guided;
    if (guided) blocksWrap.hidden = true;
    // 有快捷鍵的東西就把鍵帽戴在身上（不用去翻操作一覽才知道）
    modeBtn.innerHTML = `${guided ? '自由書寫模式' : `回到${KIND_LABEL[k]}`}<kbd>M</kbd>`;
    modeBtn.title = guided
      ? '改成自己打字：起手寫法、快速填入、技巧積木、提示球都在那邊'
      : `回到${KIND_LABEL[k]}`;
    modeBtn.hidden = !currentFlow;
    // 換模式會換掉「第四幕是什麼」（手印 / 呈遞），指示器要跟著改口
    if (current) renderActNav();
  }

  function root() {
    return overlay.root;
  }

  /* ---------------------------------------------------------------- *
   * 四幕的分鏡機（Phase 12）
   *
   * 一次只有一幕擁有畫面。轉場刻意做成「鏡頭切換」：舊的直接切掉，
   * 新的那一幕從 display:none 回來 —— CSS 動畫因此自己重播，
   * 幕內的每一行再照 .reveal .d1 .d2 .d3 依序浮出來（參考自 llm-agent-playground）。
   * ---------------------------------------------------------------- */

  /**
   * 這一關走哪幾幕。
   *
   * 課程 v2 · Phase J2：應用關（試煉）**不教任何新技巧**，所以第二幕
   * （神諭刻文）整幕不存在 —— 不是「被鎖住」，是這一關根本沒有那一幕
   * （curriculum-v2 §5.2）。指示器上因此不會畫出第二幕，`Alt + 2` 也不會有反應。
   */
  function actOrder() {
    return isApplicationTrial(current) ? [1, 3, 4] : [1, 2, 3, 4];
  }

  /** 第四幕在兩種模式下的名字：石碑刻印＝手印，自由書寫＝呈遞。 */
  function act4Zh() {
    return isGuided() ? ACTS[3].zh : ACT4_FREE_ZH;
  }

  /**
   * 這一幕現在走得過去嗎。
   * 規則：走過的幕永遠可以回頭；沒走過的只能往前推一幕（不能跳過指引）。
   * 第四幕還多一個條件 —— 沒有東西可以呈上就不會有第四幕。
   */
  function canGoAct(n) {
    if (!current) return false;
    if (!Number.isInteger(n) || n < 1 || n > ACTS.length) return false;
    const seq = actOrder();
    if (!seq.includes(n)) return false;
    if (n === 4) {
      if (isGuided() ? !board().done : resultEl.hidden) return false;
    }
    // 「往前推一幕」＝這一關真的走得到的下一幕（試煉是 1 → 3 → 4）
    return visited.has(n) || n === seq[seq.indexOf(act) + 1];
  }

  /** 進度指示器：目前這一幕標亮，走不到的幕按不下去。 */
  function renderActNav() {
    const guided = isGuided();
    actNavEl.hidden = !current;
    const seq = actOrder();
    // 試煉沒有第二幕：整塊封印石與它後面那一段軌道都不畫出來（誠實，不是鎖住）
    for (const btn of actBtns) btn.hidden = !seq.includes(Number(btn.getAttribute('data-act-go')));
    actRules.forEach((rule, i) => {
      rule.hidden = !(seq.includes(i + 1) && seq.includes(i + 2));
    });
    for (const btn of actBtns) {
      const n = Number(btn.getAttribute('data-act-go'));
      if (btn.hidden) continue;
      const isNow = n === act;
      btn.classList.toggle('is-now', isNow);
      btn.classList.toggle('is-done', visited.has(n) && !isNow);
      btn.disabled = !isNow && !canGoAct(n);
      btn.setAttribute('aria-current', isNow ? 'step' : 'false');
      const zh = n === 4 ? act4Zh() : ACTS[n - 1].zh;
      /*
       * 石頭上只刻名字（委託 / 指引 / 刻印 / 手印）。
       *
       * 「ACT I」與「第一幕」是同一件事講兩次，而且講的是**編號**不是內容 ——
       * 玩家要的是「我現在在哪一段」，不是它排第幾。編號留給讀螢幕的人
       * （aria-label 與 title 仍然完整），畫面上只留一個詞。
       */
      const { roman, zh: zhText } = actLabelText(seq.indexOf(n) + 1, zh);
      const label = btn.querySelector(`[data-act-zh="${n}"]`);
      if (label) label.textContent = zh;
      btn.setAttribute('aria-label', zhText);
      btn.title = isNow ? `${roman} ${zhText}（現在在這裡）` : `回到 ${roman} ${zhText}　按 Alt + ${n} 也可以`;
    }
    // 每一幕的 aria-label 仍然帶著編號（畫面上不再有重複的小標）
    for (const n of [1, 2]) {
      const pos = seq.indexOf(n) + 1;
      if (pos < 1) continue;
      const section = actSections.find((s) => s.getAttribute('data-in-acts').split(' ')[0] === String(n));
      if (section) section.setAttribute('aria-label', `${actLabelText(pos, ACTS[n - 1].zh).zh}`);
    }
    consoleEl.classList.toggle('is-palm', act === 4 && guided);
  }

  /** 這一幕結束後，焦點該落在哪裡（鍵盤玩家也要被導演帶著走）。 */
  function actFocusTarget(n) {
    if (n === 3) return isGuided() ? board().focusTarget : textarea;
    if (n === 4) {
      if (isGuided() && !board().fired) return board().palmTarget;
      if (!resultEl.hidden) return resultEl;
    }
    return actSections.find((s) => s.getAttribute('data-in-acts').split(' ').includes(String(n))) || null;
  }

  /**
   * 切到第 n 幕。
   * @param {number} n
   * @param {object} [opts]
   * @param {boolean} [opts.force] 內部推進（刻滿、送出）不受 canGoAct 限制
   * @param {boolean} [opts.focus] 要不要把焦點移過去（預設要）
   */
  function goAct(n, { force = false, focus = true } = {}) {
    if (!current) return act;
    if (!Number.isInteger(n) || n < 1 || n > ACTS.length) return act;
    // 試煉沒有第二幕：任何想去第二幕的請求（含 Enter 推進）一律落到刻印
    const seq = actOrder();
    if (!seq.includes(n)) n = seq[Math.min(seq.indexOf(act) + 1, seq.length - 1)];
    if (!force && !canGoAct(n)) return act;
    const changed = n !== act;
    act = n;
    visited.add(n);
    consoleEl.setAttribute('data-act', String(n));
    for (const sec of actSections) {
      const inActs = sec.getAttribute('data-in-acts').split(' ');
      sec.hidden = !inActs.includes(String(n));
    }
    // 看過指引就記下來：下次重玩這一關可以直接跳到刻印
    if (n === 2 && current) progression.markGuidanceSeen(current.id);
    renderActNav();
    if (changed) overlay.resetScroll();
    if (focus) {
      const target = actFocusTarget(n);
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus?.();
        }
      }
    }
    return act;
  }

  /* ---------------------------------------------------------------- *
   * 第二幕：神諭刻文
   *
   * 內容＝這一關每一條 rubric 檢查的白話教學（coach.json，遊戲自撰）
   * ＋ 該技巧的**真正官方出處**。標籤換成世界觀的說法（「神諭原典」），
   * 但後面一定接得出真實文件名與可點連結 —— 換皮，不說謊（護欄 2）。
   * ---------------------------------------------------------------- */
  function guidanceRow(row, { techniqueId = null, skillId = null } = {}) {
    const entry = content.coach(row.check);
    const def = CHECKS[row.check];
    /*
     * 課程 v2 · Phase J3（D2 相容層拆除）：
     * 「這一關教什麼」一律以 **v2 技能**（`skillId`）為正典 —— 130 座教學神廟
     * 每一座都掛得出自己的 `primarySkillId`，所以再也沒有「找不到就退回舊技巧」
     * 這條路。舊的 `techniqueId` 只剩兩個用途，都不是「教學語意」：
     *   · 收集誠實層：這一列對應的舊 68 條技巧（圖鑑／四廠徽章靠它，不倒退）；
     *   · Phase 26 的時代註記（`dated-notes.json` 是掛在舊技巧 id 上的）。
     */
    const techId = techniqueId || row.techniqueId;
    const tech = content.technique(techId);
    // 退回官方 tip 時也走中文譯寫層（Phase 14：畫面上不出現整句英文）
    const view = content.displayTechnique(techId);
    /**
     * 教學神廟的原典一律從 catalog 拿（v2 技能的官方文件，護欄 2）。
     * `content.sourceFor(techId)` 只留給**沒有主技能的那幾列**（地基、應用關的候選列）。
     */
    const skill = skillId ? content.skill(skillId) : null;
    const src = skillId ? content.sourceForSkill(skillId) : content.sourceFor(techId);
    return {
      check: row.check,
      title: (entry && entry.title) || (def && def.label) || row.check,
      tech: skill ? skill.nameZh : tech ? tech.title : '',
      what: (entry && entry.what) || (view && view.tip) || '',
      how: (entry && entry.how) || row.hint || (def && def.hint) || '',
      src,
      /** Phase 26：官方建議在新一代模型上變了 → 補一句有日期的查核備註。 */
      dated: (view && view.dated) || null,
      /** 這個出處本身的狀態（已下架 / 官方已標示即將移除）。 */
      srcNote: src && content.sourceNote ? content.sourceNote(src.url) : null,
    };
  }

  /**
   * 這一關的主教學目標（Phase A · C1：一關只教一條技巧）。
   *
   * rubric 上標了 `primary` 的那一列就是它；沒有標的（例如綜合型的應用關）
   * 回傳 null —— 那種關卡本來就不宣稱教某一條新技巧。
   */
  function primaryRow(challenge) {
    return (challenge.rubric || []).find((r) => r.primary) || null;
  }

  /**
   * 第二幕要放大的那一段刻文。
   * @returns {object|null}
   */
  function guidancePrimary(challenge) {
    const row = primaryRow(challenge);
    if (!row) return null;
    /*
     * D2 相容層拆除（Phase J3）：主教學目標＝這一關的 `primarySkillId`，沒有退路。
     * `primaryTechniqueId` 只是舊 68 條的祖先（收集與時代註記用），可以是 null。
     */
    return guidanceRow(row, {
      techniqueId: challenge.primaryTechniqueId,
      skillId: challenge.primarySkillId,
    });
  }

  /** 其餘的檢查：地基與還沒搬家的舊項目 —— 只留名字，不給它們自己的教學段落。 */
  function guidanceAside(challenge) {
    const primary = primaryRow(challenge);
    return challenge.rubric
      .filter((row) => row !== primary)
      .map((row) => {
        const entry = content.coach(row.check);
        const def = CHECKS[row.check];
        return {
          check: row.check,
          title: (entry && entry.title) || (def && def.label) || row.check,
          foundation: Boolean(row.foundation),
        };
      });
  }

  function renderGuidance(challenge) {
    const primary = guidancePrimary(challenge);
    const aside = guidanceAside(challenge);
    craftEl.hidden = !challenge.craft;
    craftEl.textContent = challenge.craft || '';
    /*
     * Phase 35.1：導言收成一句、貼在「神諭刻文」旁邊，小 0.8 倍。
     *
     * 它原本是自己一行、加一顆 ⓘ 講「神諭原典就是各家官方文件」。
     * 那顆 ⓘ 講的是**出處**，所以它的內容跟著那本書走了 ——
     * 現在把游標停在主刻文那枚書上，就會一起讀到這句解釋（見 sourceBook 的 extra）。
     * 沒有主出處的關卡（資料異常的降級路徑）才留下原本那顆 ⓘ。
     *
     * 這一版再把**那本典籍本身**搬上來，就接在這句話後面：原本它落在刻文
     * 底下、離「這一段是誰說的」很遠，小小一枚浮在段落之間。現在它跟導言
     * 同一行 —— 讀到「抄寫人用白話刻下這幾段」的下一眼就是那本原典。
     * （護欄 2：它仍然是一直看得見、一按就開官方文件的連結，只是換了位置。）
     */
    if (guideLeadEl) {
      guideLeadEl.innerHTML =
        primary && primary.src
          ? `抄寫人用白話刻下這幾段。${sourceBook(primary.src, {
              label: SOURCE_LABEL,
              extra: SOURCE_NOTE,
            })}`
          : `抄寫人用白話刻下這幾段。${infoTip(SOURCE_NOTE, { label: `什麼是${SOURCE_LABEL}` })}`;
    }
    guidanceEl.innerHTML = primary
      ? `<li class="glyph glyph--primary reveal" style="--i:3">
          <span class="glyph__mark" aria-hidden="true">✦</span>
          <div class="glyph__body">
            <h5 class="glyph__title">${esc(primary.title)}${
              primary.tech ? `<i>${esc(primary.tech)}</i>` : ''
            }</h5>
            ${primary.what ? `<p class="glyph__what">${esc(primary.what)}</p>` : ''}
            ${primary.how ? `<p class="glyph__how">${esc(primary.how)}</p>` : ''}
            ${datedNoteHtml(primary.dated)}
            ${
              /* 那本典籍搬到導言那一行去了；這裡只留「這份文件已下架」之類的狀態註記 */
              primary.src && primary.srcNote
                ? `<p class="srcrow">${sourceNoteHtml(primary.srcNote)}</p>`
                : ''
            }
          </div>
        </li>`
      : /*
         * 沒有主教學目標的關卡＝應用關（不教新技巧，只考已經學過的東西）。
         * Phase J2 之後它們**整個第二幕都不存在**（`actOrder()` 是 [1,3,4]、
         * 第三幕的側頁籤也是 hidden），所以這一段只在資料異常時才會被看到；
         * 留著是為了「資料壞掉也不會白畫面」的降級路徑。
         */
        challenge.rubric
          .map((row) => guidanceRow(row))
          .map(
            (r, i) => `<li class="glyph reveal" style="--i:${i + 3}">
              <span class="glyph__mark" aria-hidden="true">${i + 1}</span>
              <div class="glyph__body">
                <h5 class="glyph__title">${esc(r.title)}${r.tech ? `<i>${esc(r.tech)}</i>` : ''}</h5>
                ${r.what ? `<p class="glyph__what">${esc(r.what)}</p>` : ''}
                ${r.how ? `<p class="glyph__how">${esc(r.how)}</p>` : ''}
                ${datedNoteHtml(r.dated)}
                ${
                  r.src
                    ? `<p class="srcrow">${sourceBook(r.src, { label: SOURCE_LABEL })}${sourceNoteHtml(
                        r.srcNote
                      )}</p>`
                    : ''
                }
              </div>
            </li>`
          )
          .join('');
    // 順手會用到的舊工法：一行帶過，不假裝這一關同時在教它們（護欄：一關一技巧）
    guidanceExtraEl.hidden = !primary || aside.length === 0;
    guidanceExtraEl.innerHTML =
      primary && aside.length
        ? `<span class="extras__label">${esc(EXTRA_LABEL)}</span>${aside
            .map(
              (r) =>
                `<span class="extras__item${r.foundation ? ' is-foundation' : ''}">${esc(r.title)}</span>`
            )
            .join('')}`
        : '';
    // 第三幕的側頁籤：同一段刻文，壓成一行（其餘的只列名字）
    const compact = primary
      ? `<li>
          <b>${esc(primary.title)}</b>
          ${primary.how ? `<span>${esc(primary.how)}</span>` : ''}
          ${primary.src ? sourceBook(primary.src, { label: SOURCE_LABEL }) : ''}
        </li>${aside.map((r) => `<li class="is-quiet"><b>${esc(r.title)}</b></li>`).join('')}`
      : // 應用關：維持每一條各一行（含各自的原典）
        challenge.rubric
          .map((row) => guidanceRow(row))
          .map(
            (r) => `<li>
              <b>${esc(r.title)}</b>
              ${r.how ? `<span>${esc(r.how)}</span>` : ''}
              ${r.src ? sourceBook(r.src, { label: SOURCE_LABEL }) : ''}
            </li>`
          )
          .join('');
    guidanceCompactEl.innerHTML = `<ul class="guidetab__list">${compact}</ul>`;
    if (guideTabEl) guideTabEl.open = false;
  }

  on(overlay.body, '[data-act-go]', 'click', (e, target) => {
    goAct(Number(target.getAttribute('data-act-go')));
  });
  on(overlay.body, '[data-act-next]', 'click', (e, target) => {
    goAct(Number(target.getAttribute('data-act-next')), { force: true });
  });

  // 前兩幕：Enter 就往下一幕（焦點停在幕上時；按鈕與連結自己處理 Enter）
  overlay.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (act !== 1 && act !== 2) return;
    const t = e.target;
    if (t && t.closest && t.closest('a, button, summary, input, textarea, [contenteditable]')) return;
    e.preventDefault();
    const seq = actOrder();
    goAct(seq[seq.indexOf(act) + 1] || act, { force: true });
  });

  /* ---------------------------------------------------------------- *
   * 單鍵快捷（Phase 23：純鍵盤也走得順）
   *
   *   Alt + 1…4  直接回到某一幕（1 2 3 已經被石碑的選項用掉了）
   *   L          翻開線索（第二幕）／ 神諭刻文（第三幕）
   *   H          叫出提示球（只有自由書寫時才有）
   *   M          換一種答題方式
   *   S          分享這次的刻印（有結果之後）
   *
   * 玩家正在打字時一律不攔 —— 這幾個字母本來就會出現在 prompt 裡。
   * ---------------------------------------------------------------- */
  const clueFold = overlay.body.querySelector('.act--guide .clue');

  /** 這一幕旁邊那一頁（線索 / 神諭刻文）—— 翻開或收起。 */
  function toggleFold() {
    const fold = act === 2 ? clueFold : guideTabEl;
    if (!fold) return false;
    fold.open = !fold.open;
    const summary = fold.querySelector('summary');
    try {
      summary?.focus({ preventScroll: true });
    } catch {
      summary?.focus?.();
    }
    return fold.open;
  }

  function isTypingIn(node) {
    return Boolean(
      node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable)
    );
  }

  overlay.root.addEventListener('keydown', (e) => {
    if (!current || e.ctrlKey || e.metaKey) return;
    if (isTypingIn(e.target)) return;

    if (e.altKey) {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= ACTS.length) {
        e.preventDefault();
        goAct(n);
      }
      return;
    }

    switch (String(e.key).toLowerCase()) {
      case 'l':
        e.preventDefault();
        toggleFold();
        break;
      case 'h':
        if (orbEl.hidden) return;
        e.preventDefault();
        api.toggleCoach();
        break;
      case 'm':
        if (modeBtn.hidden) return;
        e.preventDefault();
        api.setMode(mode === 'guided' ? 'free' : 'guided');
        break;
      case 's': {
        const share = resultEl.querySelector('[data-share]');
        if (!share || resultEl.hidden) return;
        e.preventDefault();
        share.click();
        break;
      }
      default:
    }
  });

  // 方向鍵在同一組小東西之間移動焦點（Tab 仍然是「離開這一組」）
  rovingList(fillsEl, '.fill');
  rovingList(blocksEl, '.block');

  /** 書寫檯的即時計數：有字時字數會亮起來，是很輕的「你在寫東西」回饋。 */
  function updateCount() {
    const n = textarea.value.trim().length;
    countEl.textContent = `${n} 字`;
    countEl.classList.toggle('is-live', n > 0);
    if (linesEl) linesEl.textContent = `${textarea.value.split('\n').length} 行`;
  }

  const preflightBox = overlay.body.querySelector('[data-preflight]');
  let preflightOn = progression.state.settings.preflight !== false;
  preflightBox.checked = preflightOn;
  preflightBox.addEventListener('change', () => {
    preflightOn = preflightBox.checked;
    progression.updateSettings({ preflight: preflightOn });
    runPreflight();
  });

  let preflightTimer = null;
  textarea.addEventListener('input', () => {
    updateCount();
    if (!preflightOn) return;
    if (preflightTimer) clearTimeout(preflightTimer);
    preflightTimer = setTimeout(() => {
      preflightTimer = null;
      runPreflight();
    }, 200);
    armIdleNudge();
  });
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    /*
     * 打字不要驅動角色。
     * 但 Esc 與 Tab 一定要放行 —— 它們是「離開這裡」的路，
     * 攔下來的話鍵盤玩家會被關在輸入框裡（Phase 23 修）。
     */
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
  });

  overlay.body.querySelector('[data-submit]').addEventListener('click', () => submit());

  /** 安靜的模式切換（學習優先：想自己打字的人隨時可以離開輔助輪）。 */
  modeBtn.addEventListener('click', () => {
    api.setMode(mode === 'guided' ? 'free' : 'guided');
  });
  overlay.body.querySelector('[data-clear]').addEventListener('click', () => {
    textarea.value = '';
    updateCount();
    litBefore = new Set();
    runPreflight({ silent: true });
    textarea.focus();
  });

  on(overlay.body, '[data-fragment]', 'click', (e, target) => {
    const fragment = target.getAttribute('data-fragment');
    usedQuickFill = true;
    insertAtCursor(`${fragment}\n`);
    // 撿走過的石籤：和快速填入同一套「用過」的樣式（Phase 18）
    target.classList.add('is-used');
    runPreflight();
    armIdleNudge();
  });

  /** 快速填入：把這一關會用到的短句直接插到游標處，降低「不知道要打什麼」的成本。 */
  on(overlay.body, '[data-fill]', 'click', (e, target) => {
    const idx = Number(target.getAttribute('data-fill'));
    const fill = ((current && current.quickFills) || [])[idx];
    if (!fill) return;
    usedQuickFill = true;
    insertAtCursor(`${fill.text}\n`);
    target.classList.add('is-used');
    runPreflight();
    armIdleNudge();
  });

  sampleBtn.addEventListener('click', () => {
    if (sampleBtn.disabled || !current || !current.sample) return;
    sampleShown = true;
    // 大師層的防作弊面：範例翻開過就**永久**記著（關掉重開再拿 S 也不算「沒看範例」）
    progression.markSampleSeen?.(current.id);
    textarea.value = current.sample;
    updateCount();
    runPreflight();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    renderSampleButton();
  });

  /**
   * 「看看範例」的三段狀態：還沒解鎖（顯示還差幾次）→ 可看 → 已看過。
   * 先自己試，是為了讓範例真的被讀進去，而不是一開始就抄。
   */
  function renderSampleButton() {
    const has = Boolean(current && current.sample);
    sampleBtn.hidden = !has;
    if (!has) return;
    const left = SAMPLE_AFTER_FAILS - fails;
    const locked = left > 0 && !sampleShown;
    sampleBtn.disabled = locked;
    sampleBtn.textContent = locked ? `看看範例（再試 ${left} 次解鎖）` : '看看範例';
    sampleBtn.title = locked
      ? `先自己送出 ${SAMPLE_AFTER_FAILS} 次，範例就會解鎖`
      : '把一份可以拿到 A 以上的參考寫法填進輸入框';
  }

  /** 這一關的快速填入積木（每關客製，2–4 片）。 */
  function renderFills(challenge) {
    const fills = challenge.quickFills || [];
    fillsWrap.hidden = fills.length === 0;
    fillsEl.innerHTML = fills
      .map(
        (f, i) =>
          `<button class="fill" type="button" data-fill="${i}" title="${esc(f.text)}">
            <span class="fill__plus" aria-hidden="true">＋</span>${esc(f.label)}
          </button>`
      )
      .join('');
  }

  function insertAtCursor(text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const glue = before && !before.endsWith('\n') ? '\n' : '';
    textarea.value = `${before}${glue}${text}${after}`;
    const caret = (before + glue + text).length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    updateCount();
  }

  /**
   * @param {object} challenge
   * @param {object|null} [evaluation] 有給就是「預檢」模式：做到的項目會亮起來（同一支 rubric 引擎）
   */
  function renderChecklist(challenge, evaluation = null, fresh = []) {
    const freshSet = new Set(fresh);
    /** 試煉不教新技巧 —— 對照表上也不放官方連結（curriculum-v2 §5.2）。 */
    const trial = isApplicationTrial(challenge);
    /** 學過的候選列不到兩條時被補進來的那幾條（誠實標出來，不軟鎖）。 */
    const short = new Set(((challenge.__trial && challenge.__trial.shortfall) || []).map((r) => r.check));
    checklistEl.innerHTML = challenge.rubric
      .map((row, i) => {
        // 主檢查掛的是這一關真正教的那條技巧（Phase A），其餘掛自己的
        const techId = (row.primary && challenge.primaryTechniqueId) || row.techniqueId;
        /*
         * 課程 v2 · Phase J3：主檢查那一列的技能＝`primarySkillId`（沒有退路，
         * 130 座教學神廟每一座都有）；其餘的列（地基、應用關的候選列）掛自己的。
         */
        const skillId = row.primary ? challenge.primarySkillId || null : row.skillId || null;
        const skill = skillId ? content.skill(skillId) : null;
        const src = trial ? null : (skillId && content.sourceForSkill(skillId)) || content.sourceFor(techId);
        const def = CHECKS[row.check];
        const tech = skill ? { title: skill.nameZh } : content.technique(techId);
        const r = evaluation ? evaluation.results[i] : null;
        const state = r ? (r.passed ? 'pass' : r.partial ? 'part' : 'miss') : null;
        const icon = r ? (r.passed ? '✓' : r.partial ? '◐' : '·') : '';
        const justLit = r && freshSet.has(r.check) ? ' is-justlit' : '';
        /*
         * Phase A：主教學目標放大，地基與還沒搬家的舊項目降到次要位階
         * （還是看得到、還是算分，但不會跟主角搶「這一關在教什麼」）。
         */
        const tier = row.primary ? ' is-primary' : row.foundation ? ' is-foundation' : ' is-minor';
        return `<li class="${state ? `checklist__row is-${state}${justLit}` : ''}${tier}">
          <span class="checklist__dot">${icon}</span>
          <span class="checklist__text">
            <b>${esc(def ? def.label : row.check)}</b>
            ${row.primary ? '<em class="checklist__tag">這一關教的</em>' : ''}
            ${row.candidate && !short.has(row.check) ? '<em class="checklist__tag">你已經學過</em>' : ''}
            ${short.has(row.check) ? '<em class="checklist__tag">這一條你還沒學過</em>' : ''}
            ${trial && skill ? `<i>${esc(skill.nameZh)}</i>` : tech ? `<i>${esc(tech.title)}</i>` : ''}
          </span>
          <span class="checklist__w">${formatScore(row.weight)} 分</span>
          ${src ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">出處 ↗</a>` : ''}
        </li>`;
      })
      .join('');
    /*
     * 試煉的對照表上多一句話：這幾條是**你已經學過的**（沒學過的不列）。
     * 少於兩條時會照資料層的順序補到兩條，並且誠實說出來 —— 不軟鎖（P9）。
     */
    if (trial) {
      const li = document.createElement('li');
      li.className = 'checklist__note';
      li.textContent = short.size
        ? `這是試煉：只考你在這片土地上學過的。其中 ${short.size} 條你還沒學過，先看一眼再寫。`
        : '這是試煉：上面每一條，你都已經在這片土地上學過了。';
      checklistEl.appendChild(li);
    }
  }

  /**
   * 預檢：打字停下來 200ms 後跑一次評分，只更新清單（不寫進度、不給分）。
   *
   * Phase 9 的核心回饋迴圈：做到一項就亮一盞燈 ＋ 一聲輕響，
   * 上面的進度燈告訴你「再完成幾項就能過關」，夠了就讓送出鍵發光。
   */
  function runPreflight({ silent = false } = {}) {
    if (!current) return null;
    if (!preflightActive()) {
      renderChecklist(current);
      lampEl.hidden = true;
      submitBtn.classList.remove('is-ready');
      submitBtn.textContent = SUBMIT_LABEL;
      renderCoach();
      return null;
    }
    const evaluation = evaluate(current, currentText());
    const litNow = new Set(evaluation.results.filter((r) => r.passed).map((r) => r.check));
    const fresh = [...litNow].filter((id) => !litBefore.has(id));
    renderChecklist(current, evaluation, fresh);
    if (fresh.length && !silent) onChime?.(fresh.length);
    litBefore = litNow;
    renderLamp(evaluation);
    renderCoach(evaluation);
    return evaluation;
  }

  /** 進度燈：用「還差幾分」換算成「再完成幾項」，一般人看得懂的說法。 */
  function renderLamp(evaluation) {
    if (!evaluation) {
      lampEl.hidden = true;
      return;
    }
    lampEl.hidden = false;
    const need = Math.max(0, evaluation.pass - evaluation.earned);
    const undone = evaluation.results
      .filter((r) => !r.passed)
      .sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score));
    // 從最重的項目開始補，最少要補幾項才夠過關
    let left = need;
    let items = 0;
    for (const r of undone) {
      if (left <= 0) break;
      left -= r.weight * (1 - r.score);
      items += 1;
    }
    const ready = need <= 0;
    lampEl.classList.toggle('is-ready', ready);
    submitBtn.classList.toggle('is-ready', ready);
    submitBtn.textContent = ready ? `可以呈上了！${SUBMIT_LABEL}` : SUBMIT_LABEL;
    const done = evaluation.results.filter((r) => r.passed).length;
    if (isGuided()) {
      // 說法要對得上畫面：玩家看到的是石碑，不是按鈕；而且三種題型在做的事不一樣
      const k = kind();
      const todo =
        k === 'order'
          ? '把石版排順就好了'
          : k === 'workshop'
            ? '派工單再補幾樣就夠了'
            : '再刻幾段就夠了';
      lampTextEl.textContent = ready
        ? `已達通過門檻 —— 把手掌按上石碑就過關了（做到 ${done} / ${evaluation.results.length} 項）`
        : `${todo}（目前 ${formatScore(evaluation.earned)} / 需要 ${formatScore(evaluation.pass)} 分）`;
      return;
    }
    lampTextEl.textContent = ready
      ? `已達通過門檻 —— 按「${SUBMIT_LABEL}」就過關了（做到 ${done} / ${evaluation.results.length} 項）`
      : `再完成 ${items} 項就能過關（目前 ${formatScore(evaluation.earned)} / 需要 ${formatScore(
          evaluation.pass
        )} 分）`;
  }

  /* ---------------------------------------------------------------- *
   * 漂浮提示球（教練）
   *
   * 一顆會偶爾呼吸的小球。點開是一張黃色的教學框，用完全不假設背景知識的
   * 白話講「這一項到底在要什麼」，並附一顆「幫我填」——按下去就把可用的
   * 中文句子插到游標處。內容來自 src/data/coach.json（遊戲自撰）。
   *
   * 永遠不是 modal、不擋畫面、不打斷打字。
   * ---------------------------------------------------------------- */

  /** 這一關還沒做到的檢查（依權重排序）——提示球就在這些之間循環。 */
  function pendingChecks(evaluation) {
    if (!current) return [];
    if (!evaluation) return current.rubric.map((r) => r.check);
    return evaluation.results.filter((r) => !r.passed).map((r) => r.check);
  }

  /** 目前提示球指著的那條檢查。 */
  function coachTarget(evaluation) {
    const pending = pendingChecks(evaluation);
    if (!pending.length) return null;
    return pending[((coachIndex % pending.length) + pending.length) % pending.length];
  }

  function renderCoach(evaluation = lastPreflight) {
    lastPreflight = evaluation;
    const pending = pendingChecks(evaluation);
    // 石碑刻印模式不需要提示球：每個選項旁邊就有它自己的教學回饋
    if (isGuided()) {
      orbEl.hidden = true;
      coachEl.hidden = true;
      orbEl.setAttribute('aria-expanded', 'false');
      return;
    }
    orbEl.hidden = false;
    orbEl.classList.toggle('is-done', pending.length === 0);
    // 提示框打開時球先讓位（兩者都黏在左欄底部，不讓位會疊在一起）
    orbEl.classList.toggle('is-tucked', coachOpen);
    if (!coachOpen) {
      coachEl.hidden = true;
      orbEl.setAttribute('aria-expanded', 'false');
      return;
    }
    orbEl.setAttribute('aria-expanded', 'true');
    coachEl.hidden = false;
    orbEl.classList.remove('is-nudging');

    const meta = content.coachMeta || {};
    if (!pending.length) {
      coachEl.innerHTML = `<div class="coach__head">
          <b>${esc(meta.orbTitle || '提示')}</b>
          <button class="coach__x" type="button" data-coach-close aria-label="關閉提示">✕</button>
        </div>
        <p class="coach__what">${esc(meta.orbHintAll || '這一關的每一項你都做到了。')}</p>`;
      return;
    }

    const check = coachTarget(evaluation);
    const entry = content.coach(check);
    const def = CHECKS[check];
    const row = current.rubric.find((r) => r.check === check);
    const src = row ? content.sourceFor(row.techniqueId) : null;
    const title = entry ? entry.title : def ? def.label : check;
    const what = entry ? entry.what : '';
    const how = entry ? entry.how : (row && row.hint) || (def && def.hint) || '';
    const fills = (entry && entry.fills) || [];

    coachEl.innerHTML = `
      <div class="coach__head">
        <b>${esc(title)}</b>
        <span class="coach__of">${pending.indexOf(check) + 1} / ${pending.length}</span>
        <button class="coach__x" type="button" data-coach-close aria-label="關閉提示">✕</button>
      </div>
      ${what ? `<p class="coach__what">${esc(what)}</p>` : ''}
      ${how ? `<p class="coach__how">${esc(how)}</p>` : ''}
      ${
        fills.length
          ? `<div class="coach__fills">${fills
              .map(
                (f, i) =>
                  `<button class="coach__fill" type="button" data-coach-fill="${i}">
                     <span class="coach__fillhead">幫我填</span>
                     <span class="coach__filltext">${esc(f.text.split('\n')[0])}</span>
                   </button>`
              )
              .join('')}</div>`
          : ''
      }
      <div class="coach__foot">
        ${pending.length > 1 ? '<button class="coach__next" type="button" data-coach-next>下一個提示 →</button>' : ''}
        ${
          src
            ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">官方出處 ↗</a>`
            : ''
        }
      </div>
    `;
    // 提示框也吃術語小卡（它本來就是講給看不懂的人聽的）
    glossary.annotate(coachEl);
  }

  /** 停手太久 / 送出沒過 → 讓球輕輕發光一下（絕不擋畫面、絕不自動彈開）。 */
  function nudgeOrb() {
    if (coachOpen || !current) return;
    orbEl.classList.add('is-nudging');
  }

  function armIdleNudge() {
    if (idleTimer) clearTimeout(idleTimer);
    orbEl.classList.remove('is-nudging');
    idleTimer = setTimeout(() => {
      idleTimer = null;
      nudgeOrb();
    }, ORB_IDLE_MS);
  }

  /**
   * 開 / 關提示框，並把焦點帶進去、收回來。
   *
   * Phase 23：純鍵盤玩的時候，提示框如果不接手焦點，玩家得再 Tab 好幾下
   * 才碰得到「幫我填」；關掉之後也要把焦點還給球，不然會掉回頁首。
   */
  function setCoachOpen(next, { focus = true } = {}) {
    const before = coachOpen;
    coachOpen = typeof next === 'boolean' ? next : !coachOpen;
    if (coachOpen) usedCoach = true;
    orbEl.classList.remove('is-nudging');
    renderCoach();
    if (!focus || coachOpen === before) return coachOpen;
    const target = coachOpen ? coachEl.querySelector('button, a') || coachEl : orbEl;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus?.();
    }
    return coachOpen;
  }

  orbEl.addEventListener('click', () => setCoachOpen(!coachOpen, { focus: false }));
  on(overlay.body, '[data-coach-close]', 'click', () => setCoachOpen(false));
  on(overlay.body, '[data-coach-next]', 'click', () => {
    coachIndex += 1;
    renderCoach();
  });
  on(overlay.body, '[data-coach-fill]', 'click', (e, target) => {
    const check = coachTarget(lastPreflight);
    const entry = content.coach(check);
    const fill = entry && entry.fills[Number(target.getAttribute('data-coach-fill'))];
    if (!fill) return;
    insertAtCursor(`${fill.text}\n`);
    target.classList.add('is-used');
    runPreflight();
    armIdleNudge();
  });

  /** 積木上的預覽：只取第一行、太長就截斷。 */
  function peek(text, max = 34) {
    const line = String(text || '').split('\n').find((l) => l.trim()) || '';
    return line.length > max ? `${line.slice(0, max)}…` : line;
  }

  /**
   * 牌面上的短名（Phase 18）：把括號裡的英文注解拿掉，
   * 「角色設定（Role / System）」→「角色設定」——完整名稱仍在 title / aria-label。
   * 拿掉之後太短就退回原名。
   */
  function chipLabel(label) {
    const short = String(label || '')
      .replace(/（[^）]*）/g, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    return short.length >= 2 ? short : String(label || '');
  }

  /**
   * 技巧積木（Phase 18：貼著書寫檯的工具列）。
   *
   * 一片 ＝ 一行，牌面只留技巧名 —— 說明、會插進去的中文片段、英文寫法
   * 全部收進 title（hover / 長按看得到，不佔版面）。插進輸入框的是**中文**
   * 片段（玩家寫的是中文 prompt，插英文只會卡住）；英文只是次要參考，
   * 兩者都是遊戲自撰的示範，不是官方引文 —— 官方說法與出處在圖鑑與每條
   * rubric 的「出處 ↗」。
   */
  function renderBlocks() {
    const unlocked = progression.unlockedBuilderBlocks();
    if (!unlocked.length) {
      blocksWrap.hidden = true;
      return;
    }
    blocksWrap.hidden = false;
    blocksEl.innerHTML = unlocked
      .map((id) => {
        const b = content.builderBlock(id);
        if (!b) return '';
        const tip = [
          `${b.label}｜${b.desc}`,
          `插入：${peek(b.insert, 40)}`,
          b.fragmentEn ? `英文寫法：${peek(b.fragmentEn, 60)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return `<button class="block" type="button" data-fragment="${esc(b.insert)}"
          title="${esc(tip)}" aria-label="${esc(`${b.label}：${b.desc}。按下插入中文句子`)}">
          <span class="block__plus" aria-hidden="true">＋</span><b>${esc(chipLabel(b.label))}</b>
        </button>`;
      })
      .join('');
  }

  function renderResult(evaluation) {
    const challenge = current;
    /*
     * 課程 v2 · Phase J2：大師層印記的判定材料一起送進去。
     * 判定本身寫在 progression（`masterSealFor`），這裡只負責誠實回報
     * 「這一次到底用了什麼輔助」。
     */
    const outcome = progression.recordResult(evaluation, {
      mode: isGuided() ? 'guided' : 'free',
      attempt: attempts,
      usedQuickFill,
      usedCoach,
      rejects,
      sampleShown,
    });
    lastEvaluation = evaluation;
    /** 試煉不教新技巧 —— 畫面上不放官方連結（curriculum-v2 §5.2）。 */
    const trial = isApplicationTrial(challenge);

    const rows = evaluation.results
      .map((r, i) => {
        const state = r.passed ? 'pass' : r.partial ? 'part' : 'miss';
        const icon = r.passed ? '✓' : r.partial ? '◐' : '✕';
        // 課程 v2 的神廟：這一列教的是 v2 技能時，原典從 catalog 拿（一樣是官方連結）
        const rowSpec = (challenge && challenge.rubric && challenge.rubric[i]) || {};
        const skillId = rowSpec.primary
          ? (challenge && challenge.primarySkillId) || null
          : rowSpec.skillId || null;
        const skill = skillId ? content.skill(skillId) : null;
        const src = trial ? null : (skillId && content.sourceForSkill(skillId)) || content.sourceFor(r.techniqueId);
        const tech = skill ? { title: skill.nameZh } : content.technique(r.techniqueId);
        return `<li class="row row--${state}" style="--i:${i}">
          <span class="row__icon">${icon}</span>
          <div class="row__main">
            <div class="row__head">
              <b>${esc(r.label)}</b>
              <span class="row__score">${formatScore(r.earned)} / ${formatScore(r.weight)}</span>
            </div>
            ${r.evidence ? `<p class="row__evidence">${esc(r.evidence)}</p>` : ''}
            ${!r.passed && r.hint ? `<p class="row__hint">${esc(r.hint)}</p>` : ''}
            ${
              src
                ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(
                    tech ? tech.title : src.name
                  )} · 官方出處 ↗</a>`
                : ''
            }
          </div>
        </li>`;
      })
      .join('');

    const next = nextGradeTarget(evaluation);
    const collected = outcome.newlyCollected
      .map((id) => content.technique(id))
      .filter(Boolean)
      .map((t) => `<li><b>${esc(t.title)}</b> <span class="muted">${esc(t.id)}</span></li>`)
      .join('');

    // 揭示序列的節拍：評價印章 → 分數 → 一條條檢查 → 收穫 → 出處
    const tail = evaluation.results.length;
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <div class="result__top ${evaluation.passed ? 'is-pass' : 'is-fail'} reveal" style="--i:0">
        <div class="grade grade--${evaluation.passed ? esc(evaluation.grade).toLowerCase() : 'none'} is-stamp">
          <span class="grade__mark">${evaluation.passed ? evaluation.grade : '—'}</span>
          <span class="grade__label">${
            evaluation.passed ? GRADE_LABEL[evaluation.grade] : evaluation.tooShort ? '太短了' : '尚未通過'
          }</span>
        </div>
        <div class="result__meter">
          <p class="result__scoreline">
            <b>${formatScore(evaluation.earned)}</b> / ${formatScore(
              evaluation.total
            )} · 通過門檻 ${formatScore(evaluation.pass)}
          </p>
          <div class="meter"><i style="width:${Math.round((evaluation.earned / evaluation.total) * 100)}%"></i>
            <u style="left:${Math.round((evaluation.pass / evaluation.total) * 100)}%"></u></div>
          ${
            evaluation.passed
              ? `<p class="gain"><span class="xp-tick" data-xptick data-to="${outcome.xpGain}">+${outcome.xpGain}</span> XP${
                  outcome.leveledUp ? ` · 升到 Lv.${outcome.levelAfter}！` : ''
                }${
                  outcome.improved && outcome.previousGrade
                    ? ` · 評價 ${outcome.previousGrade} → ${outcome.bestGrade}`
                    : ''
                }${outcome.xpGain === 0 ? '（本關已拿過更高評價）' : ''}</p>`
              : `<p class="gain gain--none">再修一次就好——下面列出你缺了什麼。</p>`
          }
          ${next ? `<p class="muted">距離 ${next.grade} 還差 ${formatScore(next.need)} 分。</p>` : ''}
        </div>
      </div>
      <ul class="rows">${rows}</ul>
      ${
        collected
          ? `<div class="collected" style="--i:${tail}"><h4><span class="zh">✦ 順手收進圖鑑</span><span class="en">Collected</span></h4><ul>${collected}</ul></div>`
          : ''
      }
      ${
        outcome.newlyUnlocked.length
          ? `<div class="collected" style="--i:${tail + 1}"><h4><span class="zh">✦ 新解鎖區域</span><span class="en">Unlocked</span></h4><ul>${outcome.newlyUnlocked
              .map((id) => {
                const g = content.group(id);
                return `<li><b>${esc(g ? g.name : id)}</b> <span class="muted">${esc(
                  g ? g.nameEn : ''
                )}</span></li>`;
              })
              .join('')}</ul></div>`
          : ''
      }
      ${
        trial
          ? `<p class="result__source reveal" style="--i:${
              tail + 2
            }">這是試煉 —— 它不教新的技法，只把你在這片土地上學過的再用一次。</p>`
          : `<p class="result__source reveal" style="--i:${tail + 2}">本關技巧的官方出處
        <a class="src" href="${esc(challenge.source)}" target="_blank" rel="noopener">${esc(
          content.sourceName(challenge.source)
        )} ↗</a>
      </p>`
      }
      ${
        evaluation.passed
          ? `<div class="result__share reveal" style="--i:${tail + 3}">
              <button class="btn btn--ghost" type="button" data-share>分享這次的刻印<kbd>S</kbd></button>
            </div>`
          : ''
      }
    `;
    // 分享：把「剛剛學到的技法」標在卡上（結果面板每次重畫都要重新接一次）
    const shareBtn = resultEl.querySelector('[data-share]');
    if (shareBtn) {
      shareBtn.addEventListener('click', () =>
        onShare?.({
          kind: 'result',
          grade: evaluation.grade,
          headline: challenge.title,
          techniqueIds: (evaluation.teaches || []).slice(0, 3),
        })
      );
    }
    tickUp(resultEl.querySelector('[data-xptick]'));
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // 讓鍵盤 / 螢幕閱讀器直接落在結果上
    try {
      resultEl.focus({ preventScroll: true });
    } catch {
      resultEl.focus?.();
    }

    onResult?.({ challenge, evaluation, outcome });
  }

  /**
   * 呈給神諭（＝走離線評分引擎）。
   * @param {string} [textOverride] 石碑刻印送進來的是刻好的整段文字；自由書寫用輸入框。
   */
  function submit(textOverride) {
    if (!current) return;
    attempts += 1;
    onSubmit?.(current);
    const evaluation = evaluate(current, typeof textOverride === 'string' ? textOverride : currentText());
    if (!evaluation.passed) {
      fails += 1;
      // 一次沒過就讓提示球發光：這時候玩家最需要「有人告訴我下一步」
      nudgeOrb();
    }
    lastPreflight = evaluation;
    renderSampleButton();
    // 呈上去了 → 先把鏡頭切到第四幕，結果才有地方浮出來（並且拿得到焦點）
    goAct(4, { force: true, focus: false });
    renderResult(evaluation);
    renderCoach(evaluation);
  }

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    /** 目前這一關（測試與其他系統用）。 */
    get challenge() {
      return current;
    },
    get fails() {
      return fails;
    },
    /** 漂浮提示球目前的狀態（測試與除錯用）。 */
    get coach() {
      return {
        open: coachOpen,
        nudging: orbEl.classList.contains('is-nudging'),
        target: coachTarget(lastPreflight),
        pending: pendingChecks(lastPreflight),
      };
    },
    /** 直接觸發一次「發呆提醒」（測試用，避免真的等 20 秒）。 */
    nudge: nudgeOrb,
    /** 開 / 關提示框（測試與快捷鍵用）。 */
    toggleCoach(force) {
      return setCoachOpen(typeof force === 'boolean' ? force : !coachOpen);
    },
    /** 目前預檢的狀態（測試用）。 */
    get preflight() {
      return { on: preflightActive(), setting: preflightOn, evaluation: lastPreflight };
    },
    /** 目前的答題方式。 */
    get mode() {
      return mode;
    },
    /** 石碑的把手（測試與除錯用）。 */
    get stele() {
      return stele;
    },
    /** 排序刻印的把手（測試與除錯用）。 */
    get orderBoard() {
      return orderBoard;
    },
    /** 神諭工坊的把手（測試與除錯用）。 */
    get workshop() {
      return workshop;
    },
    /** 改碑的把手（測試與除錯用）。 */
    get fixBoard() {
      return fixBoard;
    },
    /** 點碑的把手（測試與除錯用）。 */
    get spotBoard() {
      return spotBoard;
    },
    /** 推規碑的把手（測試與除錯用）。 */
    get inductBoard() {
      return inductBoard;
    },
    /** 雙面碑的把手（測試與除錯用）。 */
    get constraintBoard() {
      return constraintBoard;
    },
    get multiBoard() {
      return multiBoard;
    },
    /** 轉鈕的把手（測試與除錯用）。 */
    get simBoard() {
      return simBoard;
    },
    /** 拆碑的把手（測試與除錯用）。 */
    get reverseBoard() {
      return reverseBoard;
    },
    get tradeoffBoard() {
      return tradeoffBoard;
    },
    /** 現在台上是哪一種題型（FLOW_KINDS 其一）。 */
    get kind() {
      return kind();
    },
    /** 任意一份流程資料是哪一種題型（測試用；缺 kind 一律回到石碑刻印）。 */
    flowKindOf: (flow) => flowKind(flow),
    /** 目前上線的題型清單（測試用；別在別處硬編碼這幾個字串）。 */
    get flowKinds() {
      return FLOW_KINDS;
    },
    /** 現在台上的那一塊石碑（所有題型共用同一組介面）。 */
    get board() {
      return board();
    },
    /** 目前在第幾幕（1 委託 / 2 指引 / 3 刻印 / 4 手印）。 */
    get act() {
      return act;
    },
    /** 走過哪幾幕（可以自由回頭的那幾幕）。 */
    get visitedActs() {
      return [...visited].sort((a, b) => a - b);
    },
    /** 這一幕現在按得下去嗎（進度指示器與測試用）。 */
    canGoAct,
    /** 切到第 n 幕（玩家點指示器走的是同一條路；force 只給內部推進用）。 */
    goAct,
    /**
     * 切換答題方式並存進設定。
     * @param {'guided'|'free'} next
     */
    setMode(next) {
      const wanted = normalizeMode(next);
      if (wanted !== progression.state.settings.promptMode) {
        progression.updateSettings({ promptMode: wanted });
      }
      mode = wanted;
      applyMode();
      // 換過來要立刻看到「這段文字被判成什麼」
      litBefore = new Set();
      runPreflight({ silent: true });
      renderCoach(lastPreflight);
      return mode;
    },
    open(challenge) {
      /*
       * 課程 v2 · Phase J2：應用關（試煉）的 rubric 是**在這一刻**組出來的 ——
       * 只列你已經學會的那幾條（`knowsSkill`），門檻用同一條公式重算
       * （見 src/challenges/trial.js）。其餘關卡原樣傳進來，零行為變化。
       */
      current = effectiveChallenge(challenge, (id) => progression.knowsSkill?.(id) ?? true);
      currentFlow = content.flow ? content.flow(challenge.id) : null;
      lastEvaluation = null;
      fails = 0;
      sampleShown = false;
      attempts = 0;
      usedQuickFill = false;
      usedCoach = false;
      rejects = 0;
      const best = progression.bestGrade(challenge.id);
      const group = content.group(challenge.region);
      const siblings = content.challengesOf(challenge.region);
      const index = siblings.findIndex((c) => c.id === challenge.id) + 1;
      overlay.setEyebrow(
        `${group ? group.name : challenge.region} · 第 ${String(Math.max(index, 1)).padStart(2, '0')} 關 / 共 ${String(
          siblings.length
        ).padStart(2, '0')} 關`
      );
      overlay.setTitle(challenge.title, `${challenge.npc}${best ? ` · 最佳評價 ${best}` : ''}`);
      scenarioEl.textContent = challenge.scenario;
      missionEl.textContent = challenge.mission || '';
      // 素材：NPC 真的遞給你的東西（模糊的原話、壞掉的指令、要依據的那一卷）
      const material = challenge.material;
      materialWrap.hidden = !material;
      if (material) {
        materialLabelEl.textContent = material.label || '';
        materialEl.textContent = material.text || '';
      }
      clueEl.textContent = challenge.clue;
      renderGuidance(challenge);
      /*
       * Phase 35：術語小卡。委託（第一幕）與指引（第二幕）各掃一次，
       * 每個名詞只標第一次出現的地方。輸入框 / 按鈕 / 鍵帽 / 出處連結
       * 一律不碰（規則寫在 src/ui/glossary.js）。
       */
      glossary.annotate(act1El);
      glossary.annotate(act2El);
      renderChecklist(challenge);
      renderBlocks();
      renderFills(challenge);
      renderSampleButton();
      resultEl.hidden = true;
      resultEl.innerHTML = '';
      // 每關客製的半透明提示：告訴玩家「這裡大概要打什麼」，不會被送出
      textarea.placeholder = challenge.placeholder || '在這裡寫下你的 prompt…（Ctrl / ⌘ + Enter 呈上）';
      // 有起手的弱寫法就預填 —— 玩家是在「修」，不是從零寫（序章那套，玩家很吃這個）
      textarea.value = challenge.starter || '';
      updateCount();
      litBefore = new Set();
      coachIndex = 0;
      coachOpen = false;
      lastPreflight = null;
      // 石碑：這一關的作答流程（沒有流程資料的關卡自動退回自由書寫）
      const k = flowKind(currentFlow);
      /*
       * 課程 v2 · Phase J2：自由書寫的試煉**沒有流程資料**（那就是鷹架撤除的
       * 最後一格）—— 所有石碑一律載入空的，`f` 這個安全取值讓這條路不會爆。
       */
      const f = currentFlow || {};
      stele.load(k === 'choice' ? currentFlow : null);
      orderBoard.load(k === 'order' ? f.orderFlow : null);
      workshop.load(k === 'workshop' ? f.workshop : null);
      fixBoard.load(k === 'fix' ? f.fixFlow : null);
      spotBoard.load(k === 'spot' ? f.spotFlow : null);
      inductBoard.load(k === 'induct' ? f.inductFlow : null, f.slots);
      tradeoffBoard.load(k === 'tradeoff' ? f.tradeoffFlow : null, f.slots);
      constraintBoard.load(k === 'constraint' ? f.constraintFlow : null);
      multiBoard.load(k === 'multi' ? f.multiFlow : null, f.slots);
      simBoard.load(k === 'sim' ? f.simFlow : null, f.slots);
      reverseBoard.load(k === 'reverse' ? f.reverseFlow : null, f.slots);
      mode = normalizeMode(progression.state.settings.promptMode);
      if (!currentFlow) mode = 'free';
      applyMode();
      /**
       * 導演的第一顆鏡頭永遠是第一幕：只有題目。
       * 已經看過這一關指引的人（重玩）可以直接跳到刻印 —— 但不會自動幫他跳過，
       * 選擇權在玩家手上（進度指示器上的 ③ 會是可按的）。
       */
      visited = new Set([1]);
      if (!isApplicationTrial(current) && progression.hasSeenGuidance?.(challenge.id)) {
        visited.add(2);
        visited.add(3);
      }
      // 試煉沒有指引可以翻回去：側頁籤整個收起來（那裡本來就沒有東西）
      const trialNow = isApplicationTrial(current);
      if (guideTabEl) guideTabEl.hidden = trialNow;
      // 第一幕的出口：一般關卡去聽指引，試煉直接進刻印（沒有第二幕）
      if (act1NextBtn) {
        act1NextBtn.setAttribute('data-act-next', trialNow ? '3' : '2');
        act1NextBtn.textContent = trialNow ? '接下試煉 →' : '聆聽指引 →';
      }
      act = 1;
      goAct(1, { force: true, focus: false });
      // 開場先靜靜地跑一次（不響鈴），讓起手寫法已經做到的項目直接亮著
      runPreflight({ silent: true });
      armIdleNudge();
      overlay.open({ focus: actFocusTarget(1) });
      // 展開新關卡一定要回到頂端，不然會停在上一關捲到的位置
      overlay.resetScroll();
    },
    close() {
      if (preflightTimer) {
        clearTimeout(preflightTimer);
        preflightTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      coachOpen = false;
      overlay.close();
      current = null;
      onClose?.(lastEvaluation);
    },
  };

  return api;
}

export default createPromptConsole;

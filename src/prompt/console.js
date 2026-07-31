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
  sourceNoteHtml,
} from '../ui/dom.js';
import { evaluate, nextGradeTarget } from '../challenges/rubric.js';
import { CHECKS } from '../challenges/checks.js';
import { createStele } from './stele.js';
import { createOrderBoard } from './order.js';
import { createWorkshop } from './workshop.js';

const GRADE_LABEL = { S: '完美', A: '優秀', B: '良好', C: '通過' };

/** 四幕。名字是遊戲世界裡的說法，不是系統術語。 */
export const ACTS = Object.freeze([
  { n: 1, num: '①', zh: '委託', roman: 'ACT I', en: 'THE COMMISSION' },
  { n: 2, num: '②', zh: '指引', roman: 'ACT II', en: 'THE INSCRIPTION' },
  { n: 3, num: '③', zh: '刻印', roman: 'ACT III', en: 'THE CARVING' },
  { n: 4, num: '④', zh: '手印', roman: 'ACT IV', en: 'THE PALM' },
]);

/** 第二幕的世界觀名稱（遊戲自撰的白話刻文，出處另掛「神諭原典」）。 */
export const GUIDE_TITLE = '神諭刻文';
/** 官方出處在畫面上的說法 —— 換皮但不說謊：後面一定接真正的文件名。 */
export const SOURCE_LABEL = '神諭原典';
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
 * 引導式作答的三種題型（Phase 27）。
 *
 * 資料層（flows.json）用 `kind` 宣告，沒寫就是 `choice` —— 也就是 Phase 11
 * 就在跑的石碑刻印，其他 24 關一個位元組都不會變。
 *
 *   choice    石碑刻印：一段一段從 2–3 個選項裡挑（教「這一段該寫什麼」）
 *   order     排序刻印：石版已經刻好了，要把它們排順（教「這幾段該照什麼次序」）
 *   workshop  神諭工坊：挑工具 → 填參數 → 排呼叫 → 立規矩（教工具使用 / function calling）
 *
 * 三種都住在第三幕，結尾都是同一隻手掌印，送出的都是同一段文字、
 * 走同一支離線評分引擎（護欄 3）。
 */
export const FLOW_KINDS = Object.freeze(['choice', 'order', 'workshop']);

/** 一份流程資料是哪一種題型（未知值一律回到石碑刻印）。 */
export function flowKind(flow) {
  const k = flow && flow.kind;
  if (k === 'order' && flow.orderFlow) return 'order';
  if (k === 'workshop' && flow.workshop) return 'workshop';
  return 'choice';
}

/** 每一種題型在畫面上的說法（世界的語言，不是系統術語）。 */
export const KIND_LABEL = Object.freeze({
  choice: '石碑刻印',
  order: '排序刻印',
  workshop: '神諭工坊',
});

/** 對應的 Latin meta label（版面上那一行小字）。 */
export const KIND_EN = Object.freeze({
  choice: 'Carve',
  order: 'Order',
  workshop: 'Dispatch',
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
}) {
  let current = null;
  let currentFlow = null;
  /** 這一關實際使用的模式（沒有流程資料的關卡只能自由書寫）。 */
  let mode = normalizeMode(progression.state.settings.promptMode);
  let lastEvaluation = null;
  /** 這一關這次開啟以來，送出後沒過的次數。 */
  let fails = 0;
  let sampleShown = false;
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
    onClose: () => api.close(),
  });

  overlay.body.innerHTML = `
    <div class="console" data-act="1">
      <nav class="acts" data-acts aria-label="四幕進度">
        ${ACTS.map(
          (a) => `<button class="acts__item" type="button" data-act-go="${a.n}">
            <span class="acts__num" aria-hidden="true">${a.num}</span>
            <span class="acts__zh" data-act-zh="${a.n}">${a.zh}</span>
          </button>`
        ).join('<span class="acts__rule" aria-hidden="true"></span>')}
      </nav>

      <section class="act act--brief" data-in-acts="1" tabindex="-1" aria-label="第一幕 · 委託">
        <p class="act__kicker reveal">${ACTS[0].roman} <span class="act__kickerzh">第一幕 · 委託</span></p>
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
          <span class="act__hint"><kbd>Enter</kbd></span>
          <button class="btn btn--primary" type="button" data-act-next="2">聆聽指引 →</button>
        </div>
      </section>

      <section class="act act--guide" data-in-acts="2" tabindex="-1" aria-label="第二幕 · 指引">
        <p class="act__kicker reveal">${ACTS[1].roman} <span class="act__kickerzh">第二幕 · 指引</span></p>
        <h3 class="act__head reveal d1">${GUIDE_TITLE}</h3>
        <p class="act__lead reveal d1">抄寫人用白話刻下這幾段。${infoTip(SOURCE_NOTE, {
          label: `什麼是${SOURCE_LABEL}`,
        })}</p>
        <p class="craft reveal d2" data-craft hidden></p>
        <ol class="glyphs" data-guidance></ol>
        <details class="clue reveal">
          <summary>還想要一點線索 · Clue<kbd>L</kbd></summary>
          <p data-clue></p>
        </details>
        <div class="act__foot reveal">
          <button class="btn btn--ghost" type="button" data-act-go="1">← 回顧委託</button>
          <span class="spacer"></span>
          <span class="act__hint"><kbd>Enter</kbd></span>
          <button class="btn btn--primary" type="button" data-act-next="3">開始刻印 →</button>
        </div>
      </section>

      <section class="act act--carve" data-in-acts="3 4" aria-label="第三幕 · 刻印">
        <div class="carvehead">
          <p class="act__kicker" data-carve-kicker>${ACTS[2].roman} <span class="act__kickerzh">第三幕 · 刻印</span></p>
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
        <button class="orb" type="button" data-orb aria-expanded="false" aria-controls="coach-box"
          title="不知道怎麼寫？點我（或按 H）">
          <span class="orb__core" aria-hidden="true"></span>
          <span class="orb__label">提示<kbd>H</kbd></span>
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
  const craftEl = overlay.body.querySelector('[data-craft]');
  const guidanceEl = overlay.body.querySelector('[data-guidance]');
  const guidanceCompactEl = overlay.body.querySelector('[data-guidance-compact]');
  const guideTabEl = overlay.body.querySelector('[data-guidetab]');
  const carveKickerEl = overlay.body.querySelector('[data-carve-kicker]');

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
  const stele = createStele({
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: ({ feedback }) => onReject?.({ feedback }),
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
    onReject: ({ feedback }) => onReject?.({ feedback }),
    onStage: () => runPreflight({ silent: true }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
  });
  steleSlot.appendChild(workshop.root);

  /** 這一關的引導式題型（choice / order / workshop）。 */
  function kind() {
    return flowKind(currentFlow);
  }

  /** 現在在台上的那一塊石碑（三種題型共用同一組介面）。 */
  function board() {
    const k = kind();
    if (k === 'order') return orderBoard;
    if (k === 'workshop') return workshop;
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
    // 三種題型共用一個舞台，一次只有一種在上面
    stele.root.hidden = !guided || k !== 'choice';
    orderBoard.root.hidden = !guided || k !== 'order';
    workshop.root.hidden = !guided || k !== 'workshop';
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
    if (n === 4) {
      if (isGuided() ? !board().done : resultEl.hidden) return false;
    }
    return visited.has(n) || n === act + 1;
  }

  /** 進度指示器：目前這一幕標亮，走不到的幕按不下去。 */
  function renderActNav() {
    const guided = isGuided();
    actNavEl.hidden = !current;
    for (const btn of actBtns) {
      const n = Number(btn.getAttribute('data-act-go'));
      const isNow = n === act;
      btn.classList.toggle('is-now', isNow);
      btn.classList.toggle('is-done', visited.has(n) && !isNow);
      btn.disabled = !isNow && !canGoAct(n);
      btn.setAttribute('aria-current', isNow ? 'step' : 'false');
      const zh = n === 4 ? act4Zh() : ACTS[n - 1].zh;
      const label = btn.querySelector(`[data-act-zh="${n}"]`);
      if (label) label.textContent = zh;
      btn.title = isNow
        ? `第 ${n} 幕 · ${zh}（現在在這裡）`
        : `回到第 ${n} 幕 · ${zh}　按 Alt + ${n} 也可以`;
    }
    // 第三幕的小標在第四幕改成「手印 / 呈遞」——畫面上寫的一定要跟玩家在做的事一致
    const meta = act === 4 ? ACTS[3] : ACTS[2];
    const zh = act === 4 ? act4Zh() : ACTS[2].zh;
    carveKickerEl.innerHTML = `${meta.roman} <span class="act__kickerzh">第${
      act === 4 ? '四' : '三'
    }幕 · ${esc(zh)}</span>`;
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
  function guidanceRows(challenge) {
    return challenge.rubric.map((row) => {
      const entry = content.coach(row.check);
      const def = CHECKS[row.check];
      const tech = content.technique(row.techniqueId);
      // 退回官方 tip 時也走中文譯寫層（Phase 14：畫面上不出現整句英文）
      const view = content.displayTechnique(row.techniqueId);
      const src = content.sourceFor(row.techniqueId);
      return {
        check: row.check,
        title: (entry && entry.title) || (def && def.label) || row.check,
        tech: tech ? tech.title : '',
        what: (entry && entry.what) || (view && view.tip) || '',
        how: (entry && entry.how) || row.hint || (def && def.hint) || '',
        src,
        /** Phase 26：官方建議在新一代模型上變了 → 補一句有日期的查核備註。 */
        dated: (view && view.dated) || null,
        /** 這個出處本身的狀態（已下架 / 官方已標示即將移除）。 */
        srcNote: src && content.sourceNote ? content.sourceNote(src.url) : null,
      };
    });
  }

  function renderGuidance(challenge) {
    const rows = guidanceRows(challenge);
    craftEl.hidden = !challenge.craft;
    craftEl.textContent = challenge.craft || '';
    guidanceEl.innerHTML = rows
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
                ? `<a class="src" href="${esc(r.src.url)}" target="_blank" rel="noopener">${esc(
                    SOURCE_LABEL
                  )}：${esc(r.src.name)} ↗</a>${sourceNoteHtml(r.srcNote)}`
                : ''
            }
          </div>
        </li>`
      )
      .join('');
    // 第三幕的側頁籤：同一份刻文，壓成一行一條（不是一牆文字）
    guidanceCompactEl.innerHTML = `<ul class="guidetab__list">${rows
      .map(
        (r) => `<li>
          <b>${esc(r.title)}</b>
          ${r.how ? `<span>${esc(r.how)}</span>` : ''}
          ${
            r.src
              ? `<a class="src" href="${esc(r.src.url)}" target="_blank" rel="noopener">${esc(
                  SOURCE_LABEL
                )} ↗</a>`
              : ''
          }
        </li>`
      )
      .join('')}</ul>`;
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
    goAct(act + 1, { force: true });
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
    insertAtCursor(`${fill.text}\n`);
    target.classList.add('is-used');
    runPreflight();
    armIdleNudge();
  });

  sampleBtn.addEventListener('click', () => {
    if (sampleBtn.disabled || !current || !current.sample) return;
    sampleShown = true;
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
    checklistEl.innerHTML = challenge.rubric
      .map((row, i) => {
        const src = content.sourceFor(row.techniqueId);
        const def = CHECKS[row.check];
        const tech = content.technique(row.techniqueId);
        const r = evaluation ? evaluation.results[i] : null;
        const state = r ? (r.passed ? 'pass' : r.partial ? 'part' : 'miss') : null;
        const icon = r ? (r.passed ? '✓' : r.partial ? '◐' : '·') : '';
        const justLit = r && freshSet.has(r.check) ? ' is-justlit' : '';
        return `<li class="${state ? `checklist__row is-${state}${justLit}` : ''}">
          <span class="checklist__dot">${icon}</span>
          <span class="checklist__text">
            <b>${esc(def ? def.label : row.check)}</b>
            ${tech ? `<i>${esc(tech.title)}</i>` : ''}
          </span>
          <span class="checklist__w">${row.weight} 分</span>
          ${src ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">出處 ↗</a>` : ''}
        </li>`;
      })
      .join('');
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
        : `${todo}（目前 ${evaluation.earned} / 需要 ${evaluation.pass} 分）`;
      return;
    }
    lampTextEl.textContent = ready
      ? `已達通過門檻 —— 按「${SUBMIT_LABEL}」就過關了（做到 ${done} / ${evaluation.results.length} 項）`
      : `再完成 ${items} 項就能過關（目前 ${evaluation.earned} / 需要 ${evaluation.pass} 分）`;
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
    const outcome = progression.recordResult(evaluation);
    lastEvaluation = evaluation;

    const rows = evaluation.results
      .map((r, i) => {
        const state = r.passed ? 'pass' : r.partial ? 'part' : 'miss';
        const icon = r.passed ? '✓' : r.partial ? '◐' : '✕';
        const src = content.sourceFor(r.techniqueId);
        const tech = content.technique(r.techniqueId);
        return `<li class="row row--${state}" style="--i:${i}">
          <span class="row__icon">${icon}</span>
          <div class="row__main">
            <div class="row__head">
              <b>${esc(r.label)}</b>
              <span class="row__score">${r.earned} / ${r.weight}</span>
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
            <b>${evaluation.earned}</b> / ${evaluation.total} · 通過門檻 ${evaluation.pass}
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
          ${next ? `<p class="muted">距離 ${next.grade} 還差 ${next.need} 分。</p>` : ''}
        </div>
      </div>
      <ul class="rows">${rows}</ul>
      ${
        collected
          ? `<div class="collected" style="--i:${tail}"><h4><span class="zh">✦ 收進圖鑑</span><span class="en">Collected</span></h4><ul>${collected}</ul></div>`
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
      <p class="result__source reveal" style="--i:${tail + 2}">本關技巧的官方出處
        <a class="src" href="${esc(challenge.source)}" target="_blank" rel="noopener">${esc(
          content.sourceName(challenge.source)
        )} ↗</a>
      </p>
      ${
        evaluation.passed
          ? `<div class="result__share reveal" style="--i:${tail + 3}">
              <button class="btn btn--ghost" type="button" data-share>分享這次的刻印<kbd>S</kbd></button>
              <span class="muted">做成一張圖，存下來或貼給別人看。</span>
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
    /** 現在台上是哪一種題型（choice / order / workshop）。 */
    get kind() {
      return kind();
    },
    /** 現在台上的那一塊石碑（三種題型共用同一組介面）。 */
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
      current = challenge;
      currentFlow = content.flow ? content.flow(challenge.id) : null;
      lastEvaluation = null;
      fails = 0;
      sampleShown = false;
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
      stele.load(k === 'choice' ? currentFlow : null);
      orderBoard.load(k === 'order' ? currentFlow.orderFlow : null);
      workshop.load(k === 'workshop' ? currentFlow.workshop : null);
      mode = normalizeMode(progression.state.settings.promptMode);
      if (!currentFlow) mode = 'free';
      applyMode();
      /**
       * 導演的第一顆鏡頭永遠是第一幕：只有題目。
       * 已經看過這一關指引的人（重玩）可以直接跳到刻印 —— 但不會自動幫他跳過，
       * 選擇權在玩家手上（進度指示器上的 ③ 會是可按的）。
       */
      visited = new Set([1]);
      if (progression.hasSeenGuidance?.(challenge.id)) {
        visited.add(2);
        visited.add(3);
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

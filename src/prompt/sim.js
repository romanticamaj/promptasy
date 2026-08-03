/**
 * Promptasy — 轉鈕（sim · 模擬—觀察—調整）
 *
 * 課程 v2 · Phase H 的新題型，還是**石碑刻印的變體**：同一塊碑、同一組
 * `slots`、同一隻手掌印、同一支離線評分引擎（護欄 3）。前面多的那一段舞台
 * 是一個**旋鈕**：轉一格，神諭的回話就換一段。
 *
 * 為什麼要做這一種：旋鈕類的技巧（思考火力、亂度、動作預算）在文字上永遠
 * 只是名詞解釋 —— 玩家背得出「low / medium / high」，卻沒有一秒真的看到
 * 「轉下去會發生什麼」。**那個差別本身就是這一課**（C3 的「轉」）。
 *
 * ## 三條不能違反的規則
 *
 * 1. **每一段回話都是遊戲自己寫的，不是模型跑出來的。**
 *    資料層強制 `authored: "game"`，畫面上永遠掛一顆 ⓘ 明講這件事。
 *    這個題型絕不呼叫任何 API —— 斷網照樣轉得動（護欄 3）。
 * 2. **旋鈕的行為不是普遍真理。** 每一個旋鈕都要寫得出 `condition`
 *    （在哪一台機器、哪一個時間點成立），而且那句話永遠跟樣本一起顯示。
 *    「Gemini 3.x 不讓你設 temperature」是那一台機器在那個版本的事實，
 *    不是「所有模型都不能設 temperature」。
 * 3. **轉過每一檔才刻得了字。** 觀察是這一關的內容，不是可以跳過的過場；
 *    三檔都看過，石碑才開放刻印（跟推規碑「想通才給刻」同一個文法）。
 *
 * ## 樣本住在哪裡
 *
 * 樣本在 `src/data/sim-samples.json`（獨立資料層，`authored: "game"`），
 * 由 `main.js` 在開機時 `registerSimDials()` 進來 —— 這個模組**不 import JSON**，
 * 所以 node 端的測試可以直接 import 它、自己餵一份樣本進來。
 * 沒有註冊樣本時 `isSimFlow()` 一律回 false → 退回石碑刻印（相容契約）。
 *
 * ## 鍵位
 *   `←` `→`（`↑` `↓` 同義）  在旋鈕的檔位之間走
 *   `Enter` / `1` `2` `3`     轉到那一檔（回話跟著換）
 *   `Esc`                     這一層沒有東西可以還原 → 冒泡出去收起面板
 *   按住 `Enter`（手掌上）     呈給神諭
 */
import { esc, on, rovingList, infoTip } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createSlotStage, isSlotList } from './slots.js';

export { PALM_HOLD_MS };

/** 一個旋鈕剛好幾檔（schema 硬性約束：太少看不出趨勢，太多變成翻頁）。 */
export const SIM_NOTCHES = 3;

/** 每一段樣本永遠要講的實話（畫面上那顆 ⓘ 的內容）。 */
export const AUTHORED_NOTE =
  '這些輸出是遊戲預先寫好的示範，不是真的模型跑出來的結果，也沒有連到任何服務。它存在的目的是讓你看得到「轉這個旋鈕會差在哪裡」。';

/** 已註冊的旋鈕樣本（id → dial）。 */
const DIALS = new Map();

/**
 * 註冊離線樣本（`src/data/sim-samples.json`）。
 * @param {object} file 樣本檔（要有 `authored: "game"` 與 `dials`）
 * @returns {number} 註冊成功的旋鈕數
 */
export function registerSimDials(file) {
  DIALS.clear();
  if (!file || file.authored !== 'game' || !Array.isArray(file.dials)) return 0;
  for (const dial of file.dials) {
    if (isSimDial(dial)) DIALS.set(dial.id, dial);
  }
  return DIALS.size;
}

/** 查一個旋鈕（沒註冊就是 null）。 */
export function simDial(id) {
  return DIALS.get(id) || null;
}

/**
 * 一個旋鈕的樣本合不合法。
 *
 * 硬性契約（也是 curriculum-v2 §6 Phase H 的驗收條件）：
 *   · 剛好 `SIM_NOTCHES` 檔，每一檔有 id／label／value／output／read
 *   · **每一檔的回話彼此不同** —— 轉了卻沒差別，這一課就不存在
 *   · 一定寫得出 `condition`（在哪一台機器、哪一個時間點成立）
 *   · 一定寫得出 `prompt`（每一檔送出去的是同一句話，變的只有旋鈕）
 */
export function isSimDial(dial) {
  if (!dial || typeof dial.id !== 'string' || !dial.id) return false;
  for (const key of ['label', 'prompt', 'condition', 'conclusion']) {
    if (typeof dial[key] !== 'string' || dial[key].trim().length === 0) return false;
  }
  if (!Array.isArray(dial.notches) || dial.notches.length !== SIM_NOTCHES) return false;
  const okNotch = (n) =>
    n &&
    typeof n.id === 'string' &&
    n.id.length > 0 &&
    ['label', 'value', 'output', 'read'].every(
      (k) => typeof n[k] === 'string' && n[k].trim().length > 0
    ) &&
    n.output.trim().length >= 8;
  if (!dial.notches.every(okNotch)) return false;
  const outputs = new Set(dial.notches.map((n) => n.output.trim()));
  if (outputs.size !== dial.notches.length) return false;
  const ids = new Set(dial.notches.map((n) => n.id));
  return ids.size === dial.notches.length;
}

/**
 * 這一份轉鈕資料合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。
 *
 *   · `authored === 'game'`（樣本是自撰的，資料層就要說清楚）
 *   · `dialId` 指得到一份已註冊、且合法的旋鈕樣本
 *   · 刻印那一段（`slots`）也在 —— 轉完之後還是要寫成一段真的委託
 */
export function isSimFlow(data, slots) {
  if (!data || data.authored !== 'game') return false;
  if (typeof data.ask !== 'string' || data.ask.trim().length === 0) return false;
  if (!isSlotList(slots)) return false;
  return isSimDial(simDial(data.dialId));
}

/**
 * @param {object} opts
 * @param {(info:{index:number,total:number,notch:object})=>void} [opts.onTurn]   轉到某一檔
 * @param {(info:{})=>void} [opts.onObserved]                                     三檔都看過了
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve]  刻上一段
 * @param {(info:{feedback:string,option:object})=>void} [opts.onReject]         石碑不收
 * @param {(info:{text:string})=>void} [opts.onComplete]                         全部刻完
 * @param {(info:{text:string})=>void} [opts.onPress]                            手掌按下去
 * @param {()=>void} [opts.onTap]                                                牌子被按下去那一下
 * @param {(msg:string)=>void} [opts.onAnnounce]                                 aria-live 講了什麼（測試用）
 */
export function createSimBoard({
  onTurn,
  onObserved,
  onCarve,
  onReject,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  let flow = null;
  let dial = null;
  /** 現在停在第幾檔。 */
  let at = 0;
  /** 已經轉過哪幾檔（觀察就是這一關的內容）。 */
  let seen = new Set();

  const root = document.createElement('div');
  root.className = 'simboard';
  root.innerHTML = `
    <section class="dial" data-dial>
      <p class="dial__eyebrow">
        <span data-dial-label></span>
        <span data-dial-tip></span>
      </p>
      <p class="dial__lead" data-dial-lead></p>
      <p class="dial__prompt" data-dial-prompt></p>
      <div class="dial__notches" data-notches role="group" aria-label="旋鈕的檔位"></div>
      <p class="dial__progress" data-dial-progress></p>
      <section class="dial__out" data-out aria-live="polite">
        <p class="dial__outhead"><span data-out-label></span><span class="dial__value" data-out-value></span></p>
        <pre class="dial__body" data-out-text></pre>
        <p class="dial__read" data-out-read></p>
      </section>
      <p class="dial__cond" data-dial-cond></p>
      <p class="dial__conclusion" data-dial-conclusion hidden></p>
      <p class="carve__tip">
        方向鍵在檔位之間走，<kbd>Enter</kbd> 或 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 轉到那一檔。
        轉錯不會失敗 —— 這一段就是拿來轉的。
      </p>
    </section>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const dialLabelEl = root.querySelector('[data-dial-label]');
  const dialTipEl = root.querySelector('[data-dial-tip]');
  const dialLeadEl = root.querySelector('[data-dial-lead]');
  const dialPromptEl = root.querySelector('[data-dial-prompt]');
  const notchesEl = root.querySelector('[data-notches]');
  const progressEl = root.querySelector('[data-dial-progress]');
  const outLabelEl = root.querySelector('[data-out-label]');
  const outValueEl = root.querySelector('[data-out-value]');
  const outTextEl = root.querySelector('[data-out-text]');
  const outReadEl = root.querySelector('[data-out-read]');
  const condEl = root.querySelector('[data-dial-cond]');
  const conclusionEl = root.querySelector('[data-dial-conclusion]');
  const liveEl = root.querySelector('[data-live]');

  const stage = createSlotStage({
    eyebrow: '刻印中的 prompt',
    onCarve: (info) => onCarve?.(info),
    onReject: (info) => onReject?.(info),
    onComplete: (info) => {
      palm.show(true);
      onComplete?.(info);
      focusEl(palm.button);
    },
    onTap: () => onTap?.(),
  });
  root.appendChild(stage.root);

  const palm = createPalm({
    lead: '旋鈕轉過了，也刻上去了。把手掌按上去，讓神諭聽見。',
    ready: () => stage.done,
    onFire: () => {
      stage.ignite();
      onPress?.({ text: stage.text });
    },
  });
  root.appendChild(palm.root);

  function say(msg) {
    liveEl.textContent = msg;
    onAnnounce?.(msg);
  }

  function focusEl(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus?.();
    }
  }

  const observedAll = () => Boolean(dial) && seen.size >= dial.notches.length;

  function renderNotches() {
    if (!dial) {
      notchesEl.innerHTML = '';
      return;
    }
    notchesEl.innerHTML = dial.notches
      .map((n, i) => {
        const now = i === at;
        const been = seen.has(n.id);
        return `<button class="notch${now ? ' is-now' : ''}${been ? ' is-seen' : ''}" type="button"
          data-notch="${i}" style="--i:${i}" aria-pressed="${now ? 'true' : 'false'}">
          <span class="notch__key" aria-hidden="true">${i + 1}</span>
          <span class="notch__label">${esc(n.label)}</span>
          <span class="notch__cost">${esc(n.cost || '')}</span>
        </button>`;
      })
      .join('');
  }

  function renderOut() {
    if (!dial) return;
    const n = dial.notches[at];
    if (!n) return;
    outLabelEl.textContent = `神諭的回話 · ${n.label}`;
    outValueEl.textContent = n.value;
    outTextEl.textContent = n.output;
    outReadEl.textContent = n.read;
    const left = dial.notches.length - seen.size;
    progressEl.textContent = observedAll()
      ? `三檔都轉過了 —— 現在把這件事寫成一段委託。`
      : `已經轉過 ${seen.size} / ${dial.notches.length} 檔，還有 ${left} 檔沒看過。`;
    conclusionEl.hidden = !observedAll();
    if (observedAll()) conclusionEl.textContent = dial.conclusion;
  }

  /** 轉到第 i 檔（不會失敗、可以來回轉；轉過的檔會被記下來）。 */
  function turn(i) {
    if (!dial || palm.fired) return null;
    const n = dial.notches[i];
    if (!n) return null;
    onTap?.();
    at = i;
    const first = !seen.has(n.id);
    seen.add(n.id);
    renderNotches();
    renderOut();
    say(`${n.label}：${n.read}`);
    onTurn?.({ index: i, total: dial.notches.length, notch: n, first });
    if (observedAll() && stage.locked) {
      stage.unlock();
      onObserved?.({ total: dial.notches.length });
      return { index: i, observedAll: true };
    }
    focusEl(notchesEl.querySelector(`[data-notch="${i}"]`));
    return { index: i, observedAll: observedAll() };
  }

  on(root, '[data-notch]', 'click', (e, target) => {
    turn(Number(target.getAttribute('data-notch')));
  });

  rovingList(notchesEl, '.notch');

  notchesEl.addEventListener('keydown', (e) => {
    /*
     * `Enter` / 空白鍵一律自己處理，不靠瀏覽器把它翻成 click ——
     * 純鍵盤（以及 CDP 送進來的原始按鍵）在按鈕上不一定會產生預設的 click
     * （改碑、點碑、推規碑當初都是為了同一個原因自己接的）。
     */
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const btn = e.target && e.target.closest ? e.target.closest('[data-notch]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      turn(Number(btn.getAttribute('data-notch')));
      return;
    }
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || !dial || n > dial.notches.length) return;
    e.preventDefault();
    e.stopPropagation();
    turn(n - 1);
  });

  const api = {
    root,
    get focusTarget() {
      return notchesEl.querySelector('.notch') || stage.focusTarget || palm.button;
    },
    get palmTarget() {
      return palm.button;
    },
    get text() {
      return stage.text;
    },
    get done() {
      return stage.done;
    },
    get fired() {
      return palm.fired;
    },
    /** 轉到第幾檔 / 看過幾檔 / 刻到第幾段（HUD 與測試用）。 */
    get progress() {
      return {
        at,
        notches: dial ? dial.notches.length : 0,
        seen: seen.size,
        observed: observedAll(),
        ...stage.progress,
      };
    },
    get ask() {
      if (!observedAll()) return flow ? flow.ask : '';
      return stage.ask;
    },
    /** 現在停在哪一檔（測試用）。 */
    get notch() {
      return dial ? dial.notches[at] : null;
    },
    /** 這一關用的那一個旋鈕（測試用）。 */
    get dial() {
      return dial;
    },
    get announcement() {
      return liveEl.textContent;
    },
    turn,
    /** 刻印那一段（測試用，與石碑刻印同名）。 */
    pick: (i) => stage.pick(i),
    press: () => palm.press(),
    /** 上一次載入的刻印段落（reopen 用）。 */
    slots: [],
    load(nextFlow, slots) {
      flow = isSimFlow(nextFlow, slots) ? nextFlow : null;
      dial = flow ? simDial(flow.dialId) : null;
      at = flow && Number.isInteger(dial.start) && dial.start >= 0 && dial.start < dial.notches.length
        ? dial.start
        : 0;
      seen = new Set();
      palm.reset();
      liveEl.textContent = '';
      api.slots = isSlotList(slots) ? slots : [];
      stage.load(api.slots);
      root.hidden = !flow;
      if (!flow) return false;
      // 一進來就停在其中一檔，而且那一檔的回話已經在畫面上 —— 它算看過了
      seen.add(dial.notches[at].id);
      dialLabelEl.textContent = dial.label;
      dialTipEl.innerHTML = infoTip(flow.note || AUTHORED_NOTE, { label: '這幾段回話是哪裡來的' });
      dialLeadEl.textContent = flow.ask || dial.lead || '';
      dialPromptEl.textContent = dial.prompt;
      condEl.textContent = `※ ${dial.condition}`;
      conclusionEl.hidden = true;
      renderNotches();
      renderOut();
      return true;
    },
    reopen() {
      return flow ? api.load(flow, api.slots) : false;
    },
  };

  return api;
}

export default createSimBoard;

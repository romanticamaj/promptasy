/**
 * Promptasy — 兩輪刻印（multi · 多輪修正）
 *
 * 課程 v2 · Phase G 的新題型，還是**石碑刻印的變體**：同一塊碑、同一組
 * `slots`、同一隻手掌印、同一支離線評分引擎（護欄 3）。差別只有一件事 ——
 * 它把那些 `slots` 切成**兩輪以上**，中間插一段「神諭第一次回話」。
 *
 * 為什麼要做這一種：迭代類的技巧（草稿→審查→改寫、換句話說再跑一次、
 * 把壞輸出連同 prompt 交回去）在單輪的碑上永遠只是**紙上談兵** ——
 * 玩家刻完就送出，從來沒有「看到第一輪長什麼樣，再決定第二輪要修什麼」
 * 的那一秒。第二輪的體感就是這個題型存在的理由（C3 的「轉」）。
 *
 * ## 兩條不能違反的規則
 *
 * 1. **中間那一段輸出是遊戲自己寫的，不是模型跑出來的。**
 *    資料層強制 `authored: "game"`，畫面上一定掛一顆 ⓘ 明講這件事。
 *    絕不允許把它做成「看起來像真的模型回話」——那是騙人（WORLD 的誠實慣例）。
 *
 * 2. **輪次是 `flow.slots` 的一個切法，不是另一份資料。**
 *    每一輪只宣告「我吃幾段」（`count`），段落本身仍然全部住在
 *    `flow.slots` 裡，而且 `sum(count) === slots.length`。這條契約買到三件事：
 *      · 退回石碑刻印（相容契約）時，玩家刻出來的字**一模一樣**
 *      · 不可能「串錯輪次」——輪次只是同一條序列上的兩個區間
 *      · 測試可以逐關驗「全部選對＝S」而不必知道題型
 *
 * ## 狀態（刻意不落地）
 *
 * 輪次狀態只活在記憶體裡（`round` / `prior[]`），跟其他七種題型完全一致：
 *   · 幕與幕之間切換（①②③④）→ DOM 留著，輪次原封不動
 *   · 引導式 ↔ 自由書寫切換     → DOM 留著，輪次原封不動
 *   · 重開這一關（`load()`）    → 一律回到第一輪、`prior` 清空
 *   · 重新整理頁面             → 這一關從第一輪重來（**不是丟失，是重新開始**）
 * 所以永遠不會出現「第二輪的答案接在別關的第一輪後面」這種串輪。
 *
 * ## 鍵位
 *   `1` `2` `3` / 方向鍵 / `Enter`  挑一段刻上去（與石碑刻印相同）
 *   `Enter`（回話卡的按鈕上）        收下這一份回話，開始下一輪
 *   `Esc`                            這一層沒有東西可以還原 → 冒泡出去收起面板
 *   按住 `Enter`（手掌上）           呈給神諭
 */
import { esc, infoTip } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createSlotStage, isSlotList } from './slots.js';

export { PALM_HOLD_MS };

/** 中間那一段輸出永遠要講的實話（畫面上那顆 ⓘ 的內容）。 */
export const AUTHORED_NOTE =
  '這一段回話是遊戲自己寫好的示範，不是真的模型跑出來的結果。它存在的目的是讓你看得到「第一輪之後會發生什麼」。';

/**
 * 這一份多輪資料合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。
 *
 * 硬性契約：
 *   · `authored === 'game'`（中間輸出是自撰的，資料層就要說清楚）
 *   · 至少兩輪，每一輪都有 id／label／count，且 count ≥ 1
 *   · **所有輪次的 count 加起來剛好等於 `slots` 的段數**（輪次＝同一條序列的切法）
 *   · 回話卡剛好比輪次少一張，每一張都有標題與 ≥12 字的內容
 *
 * @param {object} data  flow.multiFlow
 * @param {Array}  slots flow.slots（同一份資料，輪次只是它的切法）
 */
export function isMultiFlow(data, slots) {
  if (!data || data.authored !== 'game') return false;
  if (!Array.isArray(data.rounds) || data.rounds.length < 2) return false;
  const okRound = (r) =>
    r &&
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.label === 'string' &&
    r.label.trim().length > 0 &&
    Number.isInteger(r.count) &&
    r.count >= 1;
  if (!data.rounds.every(okRound)) return false;
  if (!isSlotList(slots)) return false;
  const sum = data.rounds.reduce((n, r) => n + r.count, 0);
  if (sum !== slots.length) return false;
  if (!Array.isArray(data.handoffs) || data.handoffs.length !== data.rounds.length - 1) return false;
  const okHandoff = (h) =>
    h &&
    typeof h.label === 'string' &&
    h.label.trim().length > 0 &&
    typeof h.text === 'string' &&
    h.text.trim().length >= 12 &&
    typeof h.ask === 'string' &&
    h.ask.trim().length > 0;
  return data.handoffs.every(okHandoff);
}

/**
 * @param {object} opts
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve]  刻上一段
 * @param {(info:{feedback:string,option:object})=>void} [opts.onReject]         石碑不收這一片
 * @param {(info:{round:number,rounds:number})=>void} [opts.onRound]             進到下一輪
 * @param {(info:{text:string})=>void} [opts.onComplete]                         全部輪次刻完
 * @param {(info:{text:string})=>void} [opts.onPress]                            手掌按下去
 * @param {()=>void} [opts.onTap]                                                牌子被按下去那一下
 * @param {(msg:string)=>void} [opts.onAnnounce]                                 aria-live 講了什麼（測試用）
 */
export function createMultiBoard({
  onCarve,
  onReject,
  onRound,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  let flow = null;
  let slots = [];
  /** 現在在第幾輪（0-based）。 */
  let round = 0;
  /** 前面幾輪已經刻好的字（每一輪一段）。 */
  let prior = [];

  const root = document.createElement('div');
  root.className = 'multiboard';
  root.innerHTML = `
    <p class="multi__eyebrow" data-round-label></p>
    <p class="multi__lead" data-round-lead></p>
    <ol class="multi__prior" data-prior></ol>
    <section class="handoff" data-handoff hidden>
      <p class="handoff__eyebrow">
        <span data-handoff-label></span>
        <span data-handoff-tip></span>
      </p>
      <pre class="handoff__body" data-handoff-text></pre>
      <p class="handoff__ask" data-handoff-ask></p>
      <button class="handoff__go" type="button" data-handoff-go>
        收下這一份回話，開始下一輪<kbd>Enter</kbd>
      </button>
    </section>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const roundLabelEl = root.querySelector('[data-round-label]');
  const roundLeadEl = root.querySelector('[data-round-lead]');
  const priorEl = root.querySelector('[data-prior]');
  const handoffEl = root.querySelector('[data-handoff]');
  const handoffLabelEl = root.querySelector('[data-handoff-label]');
  const handoffTipEl = root.querySelector('[data-handoff-tip]');
  const handoffTextEl = root.querySelector('[data-handoff-text]');
  const handoffAskEl = root.querySelector('[data-handoff-ask]');
  const handoffGoEl = root.querySelector('[data-handoff-go]');
  const liveEl = root.querySelector('[data-live]');

  const stage = createSlotStage({
    eyebrow: '這一輪刻印中的 prompt',
    onCarve: (info) => {
      onCarve?.({
        index: prior.length + info.index,
        total: slots.length,
        text: api.text,
      });
    },
    onReject: (info) => onReject?.(info),
    onComplete: () => finishRound(),
    onTap: () => onTap?.(),
  });
  root.insertBefore(stage.root, handoffEl);

  const palm = createPalm({
    lead: '兩輪都刻完了。把手掌按上去，讓神諭聽見。',
    ready: () => api.done,
    onFire: () => {
      stage.ignite();
      onPress?.({ text: api.text });
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

  /** 這一輪吃 `flow.slots` 的哪一段。 */
  function sliceFor(i) {
    let from = 0;
    for (let n = 0; n < i; n += 1) from += flow.rounds[n].count;
    return slots.slice(from, from + flow.rounds[i].count);
  }

  function renderPrior() {
    priorEl.innerHTML = prior
      .map(
        (p, i) =>
          `<li class="multi__priorlot" style="--i:${i}">
            <span class="multi__priorlabel">${esc(p.label)}</span>
            <span class="multi__priortext">${esc(p.text)}</span>
          </li>`
      )
      .join('');
    priorEl.hidden = prior.length === 0;
  }

  function renderRound() {
    const r = flow ? flow.rounds[round] : null;
    if (!r) return;
    roundLabelEl.textContent = `第 ${round + 1} / ${flow.rounds.length} 輪 · ${r.label}`;
    roundLeadEl.textContent = r.lead || '';
    roundLeadEl.hidden = !r.lead;
  }

  /**
   * 這一輪刻完了。
   *   · 還有下一輪 → 攤開那張**遊戲自撰**的回話卡（這一輪的字先留在碑上）
   *   · 沒有下一輪 → 手掌印浮出來
   *
   * 刻好的字要等**按下「收下這一份回話」**才收進 `prior` —— 在那之前它
   * 還在碑上給玩家看。所以 `api.text` 永遠是「prior ＋ 這一輪」，一段都不會重複。
   */
  function finishRound() {
    if (!flow) return;
    const handoff = flow.handoffs[round];
    if (handoff) {
      handoffLabelEl.textContent = handoff.label;
      handoffTipEl.innerHTML = infoTip(handoff.note || AUTHORED_NOTE, { label: '這一段回話是哪裡來的' });
      handoffTextEl.textContent = handoff.text;
      handoffAskEl.textContent = handoff.ask;
      handoffEl.hidden = false;
      say(`${handoff.label}：${handoff.ask}`);
      focusEl(handoffGoEl);
      return;
    }
    palm.show(true);
    say('兩輪都刻完了。把手掌按上去。');
    focusEl(palm.button);
    onComplete?.({ text: api.text });
  }

  /** 收下回話，開始下一輪。 */
  function advance() {
    if (!flow || handoffEl.hidden) return false;
    if (round + 1 >= flow.rounds.length) return false;
    onTap?.();
    handoffEl.hidden = true;
    const finished = flow.rounds[round];
    prior.push({ id: finished.id, label: finished.label, text: stage.text });
    renderPrior();
    round += 1;
    renderRound();
    stage.load(sliceFor(round));
    stage.unlock();
    onRound?.({ round, rounds: flow.rounds.length });
    say(`第 ${round + 1} 輪：${flow.rounds[round].label}`);
    focusEl(stage.focusTarget);
    return true;
  }

  handoffGoEl.addEventListener('click', () => advance());
  handoffGoEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    e.stopPropagation();
    advance();
  });

  const api = {
    root,
    get focusTarget() {
      if (!handoffEl.hidden) return handoffGoEl;
      return stage.focusTarget || palm.button;
    },
    get palmTarget() {
      return palm.button;
    },
    /** 被評分的那一段文字＝前面每一輪 ＋ 這一輪（順序永遠等於 flow.slots 的順序）。 */
    get text() {
      return [...prior.map((p) => p.text), stage.text].filter((t) => t.length > 0).join('\n');
    },
    get done() {
      return Boolean(flow) && round === flow.rounds.length - 1 && stage.done;
    },
    get fired() {
      return palm.fired;
    },
    get progress() {
      const carved = prior.reduce((n, p, i) => n + flow.rounds[i].count, 0) + stage.progress.carved;
      return {
        round,
        rounds: flow ? flow.rounds.length : 0,
        awaitingHandoff: !handoffEl.hidden,
        carved,
        total: slots.length,
      };
    },
    get ask() {
      if (!handoffEl.hidden) return handoffAskEl.textContent;
      return stage.ask;
    },
    get announcement() {
      return liveEl.textContent;
    },
    /** 中間那一段回話現在攤開了沒（測試用）。 */
    get handoffOpen() {
      return !handoffEl.hidden;
    },
    advance,
    pick: (i) => stage.pick(i),
    press: () => palm.press(),
    slots: [],
    load(nextFlow, nextSlots) {
      slots = isSlotList(nextSlots) ? nextSlots : [];
      flow = isMultiFlow(nextFlow, slots) ? nextFlow : null;
      round = 0;
      prior = [];
      palm.reset();
      liveEl.textContent = '';
      handoffEl.hidden = true;
      api.slots = slots;
      renderPrior();
      root.hidden = !flow;
      if (!flow) {
        stage.load([]);
        return false;
      }
      renderRound();
      stage.load(sliceFor(0));
      // 多輪刻印沒有「先想通一件事」那一段舞台 —— 開場就可以刻
      stage.unlock();
      return true;
    },
    reopen() {
      return flow ? api.load(flow, api.slots) : false;
    },
  };

  return api;
}

export default createMultiBoard;

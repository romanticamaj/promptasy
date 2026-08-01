/**
 * Promptasy — 雙面碑（trade-off · 取捨）
 *
 * 課程 v2 · Phase C 的第二種新題型，一樣是**石碑刻印的變體**：
 * 前面多一段「秤兩面」的舞台，秤過了才回到同一件事 —— 一段一段刻 prompt。
 *
 * 這一種題型有一條**不能違反的教學規則**（curriculum-v2 §6 Phase C 的驗收條件）：
 *
 *   **兩個可行答案都要收到誠實的回饋，而且不能把取捨教成假通則。**
 *
 * 所以雙面碑刻意不做成「有一個正確答案」：
 *   · 每一輪是一張**卡**（一份模型卡／一份素材），碑的兩面各是一種做法
 *   · 你倒向哪一面**都會前進** —— 但兩面都會就地說出「這一張卡上，這一面買到什麼、
 *     付出什麼」。倒向這張卡不利的那一面不會被說成「你錯了」，只會誠實說出代價。
 *   · 換一張卡，佔上風的那一面會**翻面**（資料層強制：整關至少有一輪由 A 勝、
 *     一輪由 B 勝），玩家學到的因此是「什麼時候用哪一面」，不是「哪一面比較好」。
 *   · 秤完兩張卡才開放刻印；刻的那一段要寫得出「這一次為什麼選這一面」。
 *
 * ## 鍵位
 *   `←` `→`（`↑` `↓` 同義） 在兩面之間走 · `Enter` / `1` `2` 倒向那一面
 *   `Esc`                    這一層沒有東西可以還原 → 冒泡出去收起面板
 *   按住 `Enter`（手掌上）   呈給神諭
 */
import { esc, on, rovingList } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createSlotStage, isSlotList } from './slots.js';

export { PALM_HOLD_MS };

/**
 * 這一份取捨資料合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。
 *
 * 硬性契約：
 *   · 剛好兩面、至少兩輪
 *   · 每一輪都要寫明這張卡**由哪一面勝出**，而且兩面的判詞都要在（各 ≥8 字）
 *   · 整關的勝方必須**兩面都出現過** —— 這一條就是「不把取捨教成假通則」
 */
export function isTradeoffFlow(data) {
  if (!data || !Array.isArray(data.sides) || data.sides.length !== 2) return false;
  if (!data.sides.every((s) => s && typeof s.id === 'string' && typeof s.title === 'string')) return false;
  if (!Array.isArray(data.rounds) || data.rounds.length < 2) return false;
  const ids = data.sides.map((s) => s.id);
  const okRound = (r) =>
    r &&
    typeof r.ask === 'string' &&
    ids.includes(r.favours) &&
    r.verdicts &&
    ids.every((id) => {
      const v = r.verdicts[id];
      return v && typeof v.text === 'string' && v.text.trim().length >= 8;
    });
  if (!data.rounds.every(okRound)) return false;
  const favoured = new Set(data.rounds.map((r) => r.favours));
  return favoured.size === 2;
}

/**
 * @param {object} opts
 * @param {(info:{round:number,total:number,side:string,wins:boolean})=>void} [opts.onWeigh] 倒向一面
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve] 刻上一段
 * @param {(info:{feedback:string})=>void} [opts.onReject] 刻印時挑錯（秤兩面不會有「錯」）
 * @param {(info:{text:string})=>void} [opts.onComplete] 全部刻完
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去
 * @param {()=>void} [opts.onTap]                        牌子被按下去那一下
 * @param {(msg:string)=>void} [opts.onAnnounce]         aria-live 講了什麼（測試用）
 */
export function createTradeoffBoard({
  onWeigh,
  onCarve,
  onReject,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  let flow = null;
  let round = 0;
  /** 每一輪玩家倒向哪一面（測試與回顧用）。 */
  let picks = [];

  const root = document.createElement('div');
  root.className = 'tradeboard';
  root.innerHTML = `
    <section class="twoface" data-twoface>
      <p class="twoface__eyebrow" data-card-label></p>
      <pre class="twoface__card" data-card></pre>
      <p class="carve__progress" data-weigh-progress></p>
      <p class="carve__ask" data-weigh-ask></p>
      <div class="twoface__sides" data-sides aria-live="polite"></div>
      <p class="carve__tip">
        方向鍵在兩面之間走，<kbd>Enter</kbd> 或 <kbd>1</kbd> <kbd>2</kbd> 倒向那一面。
        兩面都走得下去 —— 碑會告訴你這一張卡上，那一面各要付什麼代價。
      </p>
      <ol class="twoface__log" data-log></ol>
    </section>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const twofaceEl = root.querySelector('[data-twoface]');
  const cardLabelEl = root.querySelector('[data-card-label]');
  const cardEl = root.querySelector('[data-card]');
  const progressEl = root.querySelector('[data-weigh-progress]');
  const askEl = root.querySelector('[data-weigh-ask]');
  const sidesEl = root.querySelector('[data-sides]');
  const logEl = root.querySelector('[data-log]');
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
    lead: '兩面都秤過了，理由也刻上去了。把手掌按上去，讓神諭聽見。',
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

  const sideById = (id) => (flow ? flow.sides.find((s) => s.id === id) : null);

  function renderRound() {
    if (!flow) return;
    const r = flow.rounds[round];
    if (!r) {
      twofaceEl.classList.add('is-settled');
      cardLabelEl.textContent = flow.settledLabel || '兩面都秤過了';
      cardEl.hidden = true;
      progressEl.textContent = `第 ${flow.rounds.length} / ${flow.rounds.length} 張卡 —— 秤完了`;
      askEl.textContent = flow.settled || '同一件事，換一張卡就換一個答案 —— 所以要說得出「這一次為什麼」。';
      sidesEl.innerHTML = '';
      return;
    }
    twofaceEl.classList.remove('is-settled');
    cardEl.hidden = false;
    cardLabelEl.textContent = (r.card && r.card.label) || '這一張卡';
    cardEl.textContent = (r.card && r.card.text) || '';
    progressEl.textContent = `第 ${round + 1} / ${flow.rounds.length} 張卡`;
    askEl.textContent = r.ask;
    sidesEl.innerHTML = flow.sides
      .map(
        (s, i) => `<button class="face" type="button" data-face="${esc(s.id)}" style="--i:${i}">
          <span class="face__key" aria-hidden="true">${i + 1}</span>
          <span class="face__title">${esc(s.title)}</span>
          <span class="face__gist">${esc(s.gist || '')}</span>
          <span class="face__verdict" data-face-verdict="${esc(s.id)}" hidden></span>
        </button>`
      )
      .join('');
  }

  function renderLog() {
    if (!flow) {
      logEl.innerHTML = '';
      return;
    }
    logEl.innerHTML = picks
      .map((p, i) => {
        const r = flow.rounds[i];
        const s = sideById(p.side);
        return `<li class="tradelog${p.wins ? ' is-win' : ' is-cost'}" style="--i:${i}">
          <span class="tradelog__card">${esc((r.card && r.card.label) || `第 ${i + 1} 張卡`)}</span>
          <span class="tradelog__side">${esc(s ? s.title : p.side)}</span>
          <span class="tradelog__verdict">${esc(r.verdicts[p.side].text)}</span>
        </li>`;
      })
      .join('');
  }

  function focusFirstFace() {
    focusEl(sidesEl.querySelector('.face'));
  }

  /**
   * 倒向一面。**兩面都會前進** —— 差別只在碑說了什麼。
   * 這是這個題型的核心：取捨沒有標準答案，只有「這一張卡上誰划算」。
   */
  function weigh(id) {
    if (!flow || palm.fired) return null;
    const r = flow.rounds[round];
    if (!r) return null;
    const side = sideById(id);
    if (!side) return null;
    onTap?.();

    const verdict = r.verdicts[id];
    const wins = r.favours === id;
    const btn = sidesEl.querySelector(`[data-face="${CSS.escape(String(id))}"]`);
    if (btn) {
      btn.classList.add(wins ? 'is-win' : 'is-cost');
      const v = btn.querySelector(`[data-face-verdict="${CSS.escape(String(id))}"]`);
      if (v) {
        v.textContent = verdict.text;
        v.hidden = false;
      }
    }
    picks.push({ side: id, wins });
    renderLog();
    say(`${side.title}：${verdict.text}`);
    onWeigh?.({ round, total: flow.rounds.length, side: id, wins, verdict: verdict.text });

    round += 1;
    const settled = round >= flow.rounds.length;
    /*
     * 判詞不會跟著卡一起被換掉：它已經寫進下面那本「秤過的帳」（.twoface__log），
     * 兩張卡秤完之後兩條判詞並排留著 —— 玩家看得到的是「同一件事，換一張卡就翻面」。
     */
    renderRound();
    if (settled) {
      stage.unlock();
    } else {
      focusFirstFace();
    }
    return { side: id, wins, verdict: verdict.text, settled };
  }

  on(root, '[data-face]', 'click', (e, target) => {
    weigh(target.getAttribute('data-face'));
  });

  rovingList(sidesEl, '.face');

  twofaceEl.addEventListener('keydown', (e) => {
    // 理由同 induct.js：`Enter` / 空白鍵自己接，不靠瀏覽器的預設 click
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const btn = e.target && e.target.closest ? e.target.closest('[data-face]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      weigh(btn.getAttribute('data-face'));
      return;
    }
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 2) return;
    if (!flow || !flow.rounds[round] || n > flow.sides.length) return;
    e.preventDefault();
    e.stopPropagation();
    weigh(flow.sides[n - 1].id);
  });

  const api = {
    root,
    get focusTarget() {
      return sidesEl.querySelector('.face') || stage.focusTarget || palm.button;
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
    get progress() {
      return {
        round,
        rounds: flow ? flow.rounds.length : 0,
        settled: Boolean(flow) && round >= flow.rounds.length,
        ...stage.progress,
      };
    },
    get ask() {
      const r = flow && flow.rounds[round];
      return r ? r.ask : stage.ask;
    },
    /** 每一輪倒向了哪一面（測試用）。 */
    get picks() {
      return picks.map((p) => ({ ...p }));
    },
    get announcement() {
      return liveEl.textContent;
    },
    weigh,
    pick: (i) => stage.pick(i),
    press: () => palm.press(),
    slots: [],
    load(nextFlow, slots) {
      flow = isTradeoffFlow(nextFlow) ? nextFlow : null;
      round = 0;
      picks = [];
      palm.reset();
      liveEl.textContent = '';
      api.slots = isSlotList(slots) ? slots : [];
      stage.load(api.slots);
      root.hidden = !flow;
      logEl.innerHTML = '';
      if (!flow) return false;
      renderRound();
      return true;
    },
    reopen() {
      return flow ? api.load(flow, api.slots) : false;
    },
  };

  return api;
}

export default createTradeoffBoard;

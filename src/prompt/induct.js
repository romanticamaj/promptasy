/**
 * Promptasy — 推規碑（rule induction · 猜規則）
 *
 * 課程 v2 · Phase C 的第一種新題型，是**石碑刻印的變體**（不是另一套系統）：
 * 前面多一段「先自己看出規律」的舞台，看通了才回到同一件事 —— 一段一段刻 prompt。
 *
 *   起：牆上只露出兩組對照，你被問「第三組會輸出什麼？」
 *   承：猜對了，第三組刻出來，規律好像浮出來了
 *   轉：**第四組是真的在驗證你的規律** —— 只看前兩組推出來的那條「順手的規律」
 *       在這裡會答錯（那個選項就在眼前，而且答錯只會就地教學）
 *   合：規律確定了，把它寫成一段真正的 prompt 刻上石碑
 *
 * 三條規則跟其他題型同源（WORLD.md §3.3b）：
 *   1. **不會失敗**。猜錯只是「牆不回應」＋ 就地長出一句白話教學，再猜一次。
 *   2. **鍵盤走得完**。方向鍵在選項之間走、`Enter` 選、`1` `2` `3` 快捷。
 *   3. **送出的是同一段文字**，走同一支離線引擎（護欄 3）。
 *
 * ## 鍵位
 *   `↑` `↓`（`←` `→` 同義） 在選項之間走 · `Enter` / `1` `2` `3` 選一個
 *   `Esc`                   還沒猜完 → 冒泡出去收起面板（這一層沒有東西可以還原）
 *   按住 `Enter`（手掌上）  呈給神諭
 */
import { esc, on, rovingList } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createSlotStage, isSlotList } from './slots.js';

export { PALM_HOLD_MS };

/**
 * 這一份推規資料合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。
 *
 * 硬性契約（也是 curriculum-v2 §6 Phase C 的驗收條件）：
 *   · 至少 3 組對照、至少 2 輪猜測
 *   · **最後一輪必須標成「驗證輪」**，而且那時候牆上要剛好露出「除了它以外」的全部對照
 *     —— 「最後一例真的在驗證規則」不是文案宣稱，是資料結構上做得到才通得過
 *   · 每一輪剛好一個正確選項；錯的選項都要帶一句教學回饋
 */
export function isInductFlow(data) {
  if (!data || !Array.isArray(data.examples) || data.examples.length < 3) return false;
  if (!Array.isArray(data.rounds) || data.rounds.length < 2) return false;
  if (!data.rule || typeof data.rule.true !== 'string' || typeof data.rule.naive !== 'string') return false;
  const okRound = (r) =>
    r &&
    typeof r.ask === 'string' &&
    Number.isInteger(r.reveal) &&
    r.reveal >= 1 &&
    r.reveal <= data.examples.length &&
    Array.isArray(r.options) &&
    r.options.length >= 2 &&
    r.options.filter((o) => o && o.correct).length === 1 &&
    r.options.every((o) => o && typeof o.text === 'string' && (o.correct || String(o.feedback || '').length > 0));
  if (!data.rounds.every(okRound)) return false;
  const last = data.rounds[data.rounds.length - 1];
  if (!last.validates || last.reveal !== data.examples.length - 1) return false;
  return data.examples.every((e) => e && typeof e.in === 'string' && typeof e.out === 'string');
}

/**
 * @param {object} opts
 * @param {(info:{round:number,total:number})=>void} [opts.onGuess]  猜對一輪
 * @param {(info:{feedback:string})=>void} [opts.onReject]           猜錯（牆不回應）
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve] 刻上一段
 * @param {(info:{text:string})=>void} [opts.onComplete]             全部刻完
 * @param {(info:{text:string})=>void} [opts.onPress]                手掌按下去
 * @param {()=>void} [opts.onTap]                                    牌子被按下去那一下
 * @param {(msg:string)=>void} [opts.onAnnounce]                     aria-live 講了什麼（測試用）
 */
export function createInductBoard({
  onGuess,
  onReject,
  onCarve,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  let flow = null;
  /** 現在在第幾輪猜測（等於 rounds.length 就是猜完了）。 */
  let round = 0;

  const root = document.createElement('div');
  root.className = 'inductboard';
  root.innerHTML = `
    <section class="wall" data-wall>
      <p class="wall__eyebrow" data-wall-label>牆上刻著的對照</p>
      <ol class="wall__rows" data-rows></ol>
      <p class="wall__rule" data-rule hidden></p>
    </section>

    <div class="carve carve--guess" data-guess>
      <p class="carve__progress" data-guess-progress></p>
      <p class="carve__ask" data-guess-ask></p>
      <div class="carve__options" data-guess-options aria-live="polite"></div>
      <p class="carve__tip">
        方向鍵在選項之間走，<kbd>Enter</kbd> 或 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 選一個。
        猜錯不會失敗，牆只是不回應。
      </p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const wallLabelEl = root.querySelector('[data-wall-label]');
  const rowsEl = root.querySelector('[data-rows]');
  const ruleEl = root.querySelector('[data-rule]');
  const guessEl = root.querySelector('[data-guess]');
  const guessProgressEl = root.querySelector('[data-guess-progress]');
  const guessAskEl = root.querySelector('[data-guess-ask]');
  const guessOptionsEl = root.querySelector('[data-guess-options]');
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
    lead: '規律想通了，也刻上去了。把手掌按上去，讓神諭聽見。',
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

  /** 現在牆上露出幾組（猜完就是全部）。 */
  function revealed() {
    if (!flow) return 0;
    if (round >= flow.rounds.length) return flow.examples.length;
    return flow.rounds[round].reveal;
  }

  function renderWall() {
    if (!flow) {
      rowsEl.innerHTML = '';
      return;
    }
    const n = revealed();
    wallLabelEl.textContent = flow.wall || '牆上刻著的對照';
    rowsEl.innerHTML = flow.examples
      .map((e, i) => {
        const shown = i < n;
        const fresh = shown && i === n - 1;
        return `<li class="wallrow${shown ? '' : ' is-hidden'}${fresh ? ' is-fresh' : ''}" style="--i:${i}">
          <span class="wallrow__n" aria-hidden="true">${i + 1}</span>
          <span class="wallrow__body">
            <span class="wallrow__in">${shown ? esc(e.in) : '？'}</span>
            <span class="wallrow__arrow" aria-hidden="true">→</span>
            <span class="wallrow__out">${shown ? esc(e.out) : '？'}</span>
          </span>
        </li>`;
      })
      .join('');
    const guessedAll = round >= flow.rounds.length;
    ruleEl.hidden = !guessedAll;
    if (guessedAll) ruleEl.textContent = `規律：${flow.rule.true}`;
  }

  function renderGuess() {
    if (!flow) return;
    const r = flow.rounds[round];
    if (!r) {
      guessEl.hidden = true;
      guessOptionsEl.innerHTML = '';
      return;
    }
    guessEl.hidden = false;
    guessProgressEl.textContent = `第 ${round + 1} / ${flow.rounds.length} 次推敲${
      r.validates ? ' —— 這一組會驗證你的規律' : ''
    }`;
    guessAskEl.textContent = r.ask;
    guessOptionsEl.innerHTML = r.options
      .map((o, i) => {
        const body = String(o.text)
          .split('\n')
          .map((l) => `<span class="opt__line">${esc(l)}</span>`)
          .join('');
        return `<button class="opt" type="button" data-guess-opt="${i}" style="--i:${i}">
          <span class="opt__key" aria-hidden="true">${i + 1}</span>
          <span class="opt__text">${body}</span>
          <span class="opt__fb" data-opt-fb hidden></span>
        </button>`;
      })
      .join('');
  }

  function focusFirstGuess() {
    const first =
      guessOptionsEl.querySelector('.opt:not(.is-wrong)') || guessOptionsEl.querySelector('.opt');
    focusEl(first);
  }

  /** 猜一次。對 → 下一組刻出來；錯 → 牆不回應 ＋ 就地教學（不扣分、不前進）。 */
  function guess(i) {
    if (!flow || palm.fired) return null;
    const r = flow.rounds[round];
    if (!r) return null;
    const option = r.options[i];
    if (!option) return null;
    onTap?.();

    if (!option.correct) {
      const btn = guessOptionsEl.querySelector(`[data-guess-opt="${i}"]`);
      if (btn) {
        btn.classList.add('is-wrong');
        btn.setAttribute('aria-disabled', 'true');
        const fb = btn.querySelector('[data-opt-fb]');
        if (fb) {
          fb.textContent = option.feedback || '牆沒有回應。再看看其他選項。';
          fb.hidden = false;
        }
      }
      const li = rowsEl.querySelector('.wallrow:not(.is-hidden):last-child');
      if (li) {
        li.classList.remove('is-bounce');
        void li.offsetWidth;
        li.classList.add('is-bounce');
      }
      say(option.feedback || '牆沒有回應。');
      onReject?.({ feedback: option.feedback || '', option });
      return { correct: false, feedback: option.feedback || '' };
    }

    round += 1;
    renderWall();
    renderGuess();
    const guessedAll = round >= flow.rounds.length;
    say(
      guessedAll
        ? `規律想通了：${flow.rule.true}。現在把它寫成一段委託刻上石碑。`
        : `對了。牆上又刻出一組（${round + 1} / ${flow.rounds.length} 次推敲）。`
    );
    onGuess?.({ round, total: flow.rounds.length, done: guessedAll });
    if (guessedAll) {
      stage.unlock();
    } else {
      focusFirstGuess();
    }
    return { correct: true };
  }

  on(root, '[data-guess-opt]', 'click', (e, target) => {
    guess(Number(target.getAttribute('data-guess-opt')));
  });

  rovingList(guessOptionsEl, '.opt');

  guessEl.addEventListener('keydown', (e) => {
    /*
     * `Enter` / 空白鍵一律自己處理，不靠瀏覽器把它翻成 click ——
     * 純鍵盤（以及 CDP 送進來的原始按鍵）在按鈕上不一定會產生預設的 click，
     * 改碑與點碑當初就是為了同一個原因自己接的（見 fix.js / spot.js）。
     */
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const btn = e.target && e.target.closest ? e.target.closest('[data-guess-opt]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      guess(Number(btn.getAttribute('data-guess-opt')));
      return;
    }
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const r = flow && flow.rounds[round];
    if (!r || n > r.options.length) return;
    e.preventDefault();
    e.stopPropagation();
    guess(n - 1);
  });

  const api = {
    root,
    get focusTarget() {
      return guessOptionsEl.querySelector('.opt') || stage.focusTarget || palm.button;
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
    /** 猜到第幾輪 / 刻到第幾段（HUD 與測試用）。 */
    get progress() {
      return {
        round,
        rounds: flow ? flow.rounds.length : 0,
        guessed: Boolean(flow) && round >= flow.rounds.length,
        ...stage.progress,
      };
    },
    get ask() {
      const r = flow && flow.rounds[round];
      return r ? r.ask : stage.ask;
    },
    /** 牆上現在露出幾組（測試用）。 */
    get revealed() {
      return revealed();
    },
    get announcement() {
      return liveEl.textContent;
    },
    guess,
    /** 刻印那一段（測試用，與石碑刻印同名）。 */
    pick: (i) => stage.pick(i),
    press: () => palm.press(),
    /** 上一次載入的刻印段落（reopen 用）。 */
    slots: [],
    load(nextFlow, slots) {
      flow = isInductFlow(nextFlow) ? nextFlow : null;
      round = 0;
      palm.reset();
      liveEl.textContent = '';
      api.slots = isSlotList(slots) ? slots : [];
      stage.load(api.slots);
      root.hidden = !flow;
      if (!flow) return false;
      renderWall();
      renderGuess();
      return true;
    },
    reopen() {
      return flow ? api.load(flow, api.slots) : false;
    },
  };

  return api;
}

export default createInductBoard;

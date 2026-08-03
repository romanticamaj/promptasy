/**
 * Promptasy — 石碑刻印（引導式選擇建構）
 *
 * Phase 11：對非工程師的一般人來說，「自己打一段 prompt」還是太難。
 * 所以預設的互動不再是打字，而是**選擇建構題**：
 *
 *   石碑上有 3–6 道空格 → 遊戲一次只問一段「這一段要填什麼？」→
 *   玩家從 2–3 個選項裡挑 → 選對就「刻」上石碑（震動 ＋ 石屑 ＋ 一聲鑿響）→
 *   全部刻完，石碑亮起，出現手掌印 → 按住手掌 → 觸發 prompt。
 *
 * 兩條原則：
 *   1. **選錯不會失敗**。石碑只是「不收」這一片：抖一下、裂光一閃，
 *      旁邊出現一句白話的教學回饋，然後你再選一次。你不可能卡住。
 *   2. **評分還是同一支離線引擎**。刻好的整段文字就是送去 rubric 的 prompt
 *      （護欄 3：核心迴圈可離線；玩家拿到的評價與圖鑑完全沒有另一套規則）。
 *
 * 這個模組只管「刻碑」這件事：DOM、動畫、選項狀態、組出來的文字。
 * 評分、結果面板、XP 一律回到 src/prompt/console.js。
 */
import { esc, on, rovingList } from '../ui/dom.js';

/** 手掌要按住多久才會觸發（毫秒）。太短沒有儀式感，太長會煩。 */
export const PALM_HOLD_MS = 600;

/** 一次刻印噴出幾顆石屑。 */
const DUST_COUNT = 10;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} opts
 * @param {(info:{fragment:string,index:number,total:number,text:string})=>void} [opts.onCarve]  刻上一段
 * @param {(info:{feedback:string,option:object})=>void} [opts.onReject] 石碑不收這一片
 * @param {(info:{text:string})=>void} [opts.onComplete] 全部刻完（手掌印出現）
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去（要把刻好的字呈給神諭了）
 * @param {()=>void} [opts.onTap]                        刻印牌被按下去的那一下（純聲音回饋）
 */
export function createStele({ onCarve, onReject, onComplete, onPress, onTap } = {}) {
  /** 目前這一關的流程（flows.json 的一份）。 */
  let flow = null;
  /** 已經刻上去的片段（依序）。 */
  let carved = [];
  /** 現在在問第幾段。 */
  let index = 0;
  /** 這一關已經送出過了嗎（送出後就不再重複觸發）。 */
  let fired = false;
  /** 蓄力環的動畫影格（只是視覺）。 */
  let holdRaf = 0;
  /** 真正決定「按住夠久了」的計時器（不依賴畫面跑不跑得動）。 */
  let holdTimer = 0;
  let holdStart = 0;
  let holding = false;

  const root = document.createElement('div');
  root.className = 'stele-stage';
  root.innerHTML = `
    <div class="stele" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">刻印中的 prompt</p>
      <ol class="stele__lines" data-carved aria-live="polite"></ol>
      <p class="stele__empty" data-empty>石碑還是空的。從下面挑一段話，它就會刻上來。</p>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <div class="carve__options" data-options aria-live="polite"></div>
      <p class="carve__tip" data-tip>按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 也可以選，方向鍵在選項之間走。選錯不會失敗，石碑只是不收。</p>
    </div>

    <div class="palmwrap" data-palmwrap hidden>
      <p class="palmwrap__lead" data-palm-lead>石碑已刻滿。把手掌按上去，讓神諭聽見。</p>
      <button class="palm" type="button" data-palm>
        <span class="palm__ring" aria-hidden="true"></span>
        <span class="palm__hand" aria-hidden="true">
          <span class="palm__finger"></span><span class="palm__finger"></span>
          <span class="palm__finger"></span><span class="palm__finger"></span>
          <span class="palm__thumb"></span><span class="palm__pad"></span>
        </span>
        <span class="palm__label">把手掌按上石碑</span>
        <span class="palm__hint"><span class="palm__hintline">按住不放，或按住 <kbd>Enter</kbd></span></span>
      </button>
    </div>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const carvedEl = root.querySelector('[data-carved]');
  const emptyEl = root.querySelector('[data-empty]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const optionsEl = root.querySelector('[data-options]');
  const carveEl = root.querySelector('[data-carve]');
  const palmWrap = root.querySelector('[data-palmwrap]');
  const palmBtn = root.querySelector('[data-palm]');

  /** 目前這一段的問題（沒有就是刻完了）。 */
  function slot() {
    return flow && index < flow.slots.length ? flow.slots[index] : null;
  }

  /** 石碑上刻好的整段文字 —— 這就是要送去離線評分的 prompt。 */
  function text() {
    return carved.map((c) => c.text).join('\n');
  }

  /* ------------------------------------------------------------ 動畫 */

  /** 石屑 ＋ 微震：刻上去的那一下要有重量。 */
  function thud(kind = 'stamp') {
    const reduce = prefersReduced();
    steleEl.classList.remove('is-stamp', 'is-reject');
    // 重新觸發同一個動畫：先強制一次 reflow
    void steleEl.offsetWidth;
    steleEl.classList.add(kind === 'reject' ? 'is-reject' : 'is-stamp');
    if (reduce) return;
    if (kind === 'reject') return;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'dust';
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 60}px`);
      bit.style.setProperty('--y', `${-18 - Math.random() * 46}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 220}deg`);
      bit.style.setProperty('--d', `${420 + Math.random() * 380}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1.1}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  function renderCarved() {
    emptyEl.hidden = carved.length > 0;
    carvedEl.innerHTML = carved
      .map(
        (c, i) =>
          `<li class="carved${i === carved.length - 1 ? ' is-fresh' : ''}" style="--i:${i}">${esc(
            c.text
          )}</li>`
      )
      .join('');
  }

  function renderQuestion() {
    const s = slot();
    const total = flow ? flow.slots.length : 0;
    if (!s) {
      // 刻完了：問句區收起來，換成手掌印
      carveEl.hidden = true;
      progressEl.textContent = `第 ${total} / ${total} 段 —— 刻完了`;
      askEl.textContent = '';
      optionsEl.innerHTML = '';
      palmWrap.hidden = false;
      steleEl.classList.add('is-full');
      return;
    }
    carveEl.hidden = false;
    palmWrap.hidden = true;
    steleEl.classList.remove('is-full');
    progressEl.textContent = `第 ${index + 1} / ${total} 段`;
    askEl.textContent = s.ask;
    optionsEl.innerHTML = s.options
      .map((o, i) => {
        const lines = String(o.text).split('\n');
        const body = lines.map((l) => `<span class="opt__line">${esc(l)}</span>`).join('');
        return `<button class="opt" type="button" data-opt="${i}" style="--i:${i}">
          <span class="opt__key" aria-hidden="true">${i + 1}</span>
          <span class="opt__text">${body}</span>
          <span class="opt__fb" data-opt-fb hidden></span>
        </button>`;
      })
      .join('');
  }

  /** 選了一個選項。對 → 刻上去；錯 → 石碑不收，附一句教學。 */
  function pick(i) {
    const s = slot();
    if (!s || fired) return null;
    const option = s.options[i];
    if (!option) return null;
    const btn = optionsEl.querySelector(`[data-opt="${i}"]`);
    // 牌子被按下去的那一下（不管對錯都有；音訊那邊會節流）
    onTap?.();

    if (!option.correct) {
      // 選錯不扣分、不失敗 —— 石碑只是不收這一片
      if (btn) {
        btn.classList.add('is-wrong');
        btn.setAttribute('aria-disabled', 'true');
        const fb = btn.querySelector('[data-opt-fb]');
        if (fb) {
          fb.textContent = option.feedback || '這一片石碑不收。再看看其他選項。';
          fb.hidden = false;
        }
      }
      thud('reject');
      onReject?.({ feedback: option.feedback || '', option });
      return { correct: false, feedback: option.feedback || '' };
    }

    carved.push({ text: option.text, slot: index });
    index += 1;
    renderCarved();
    thud('stamp');
    renderQuestion();
    const done = index >= flow.slots.length;
    onCarve?.({ fragment: option.text, index, total: flow.slots.length, text: text() });
    // 焦點一律同步移動（DOM 已經在 renderQuestion() 裡換好了）——
    // 不包在 requestAnimationFrame 裡，慢裝置上下一個影格可能要好幾百毫秒，
    // 鍵盤玩家不該在那段空窗裡失去焦點。
    if (done) {
      onComplete?.({ text: text() });
      try {
        palmBtn.focus({ preventScroll: true });
      } catch {
        palmBtn.focus?.();
      }
    } else {
      focusFirstOption();
    }
    return { correct: true };
  }

  function focusFirstOption() {
    const first = optionsEl.querySelector('.opt:not(.is-wrong)') || optionsEl.querySelector('.opt');
    if (!first) return;
    try {
      first.focus({ preventScroll: true });
    } catch {
      first.focus?.();
    }
  }

  /* ------------------------------------------------------------ 手掌印 */

  function fire() {
    if (fired || index < (flow ? flow.slots.length : 1)) return false;
    fired = true;
    stopHold(false);
    palmBtn.classList.add('is-fired');
    steleEl.classList.add('is-ignited');
    onPress?.({ text: text() });
    return true;
  }

  /** 蓄力環（純視覺）：跟著動畫影格填滿。 */
  function tickHold() {
    if (!holding) return;
    const p = Math.min(1, (performance.now() - holdStart) / PALM_HOLD_MS);
    palmBtn.style.setProperty('--hold', String(p));
    if (p >= 1) return;
    holdRaf = requestAnimationFrame(tickHold);
  }

  function startHold() {
    if (fired || holding || index < (flow ? flow.slots.length : 1)) return;
    holding = true;
    holdStart = performance.now();
    palmBtn.classList.add('is-holding');
    palmBtn.classList.remove('is-slipped');
    /**
     * 「按住夠久了沒」一律用計時器判定，不用動畫影格。
     * 慢裝置（或軟體渲染）上一個影格可能要好幾百毫秒 —— 儀式的長度不該
     * 取決於畫面跑不跑得動，否則玩家會按到懷疑人生。影格只負責畫那圈環。
     */
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      fire();
    }, PALM_HOLD_MS);
    if (prefersReduced()) {
      palmBtn.style.setProperty('--hold', '1');
      return;
    }
    holdRaf = requestAnimationFrame(tickHold);
  }

  function stopHold(slipped = true) {
    if (!holding) return;
    holding = false;
    if (holdRaf) {
      cancelAnimationFrame(holdRaf);
      holdRaf = 0;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
    palmBtn.classList.remove('is-holding');
    palmBtn.style.setProperty('--hold', '0');
    if (slipped && !fired) palmBtn.classList.add('is-slipped');
  }

  palmBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startHold();
  });
  palmBtn.addEventListener('pointerup', () => stopHold(true));
  palmBtn.addEventListener('pointerleave', () => stopHold(true));
  palmBtn.addEventListener('pointercancel', () => stopHold(true));
  palmBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    startHold();
  });
  palmBtn.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    stopHold(true);
  });
  // click 只在「按一下就放」時進來（真正的觸發走 hold）——給它一句提示就好
  palmBtn.addEventListener('click', (e) => e.preventDefault());

  on(root, '[data-opt]', 'click', (e, target) => {
    pick(Number(target.getAttribute('data-opt')));
  });

  // 方向鍵在選項之間走（Phase 23：不想記數字也走得動）
  rovingList(optionsEl, '.opt');

  // 1 / 2 / 3 選項快捷（焦點在石碑區內就有效）
  root.addEventListener('keydown', (e) => {
    if (e.target === palmBtn) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const s = slot();
    if (!s || n > s.options.length) return;
    e.preventDefault();
    e.stopPropagation();
    pick(n - 1);
  });

  const api = {
    root,
    /** 這一關的第一個可 focus 元素（開啟面板時用）。 */
    get focusTarget() {
      return optionsEl.querySelector('.opt') || palmBtn;
    },
    /** 手掌印本體 —— 第四幕的鏡頭要落在它身上。 */
    get palmTarget() {
      return palmBtn;
    },
    /** 刻好的整段文字（要送去離線評分的 prompt）。 */
    get text() {
      return text();
    },
    get done() {
      return Boolean(flow) && index >= flow.slots.length;
    },
    get fired() {
      return fired;
    },
    /** 已經刻上幾段 / 總共幾段（HUD 與測試用）。 */
    get progress() {
      return { carved: carved.length, total: flow ? flow.slots.length : 0 };
    },
    /** 目前這一段的問題（測試用）。 */
    get ask() {
      const s = slot();
      return s ? s.ask : '';
    },
    /** 換一關（或重來一次）。 */
    load(nextFlow) {
      flow = nextFlow && Array.isArray(nextFlow.slots) && nextFlow.slots.length ? nextFlow : null;
      carved = [];
      index = 0;
      fired = false;
      stopHold(false);
      palmBtn.classList.remove('is-fired', 'is-slipped');
      steleEl.classList.remove('is-ignited', 'is-full', 'is-stamp', 'is-reject');
      dustEl.innerHTML = '';
      root.hidden = !flow;
      if (!flow) return false;
      renderCarved();
      renderQuestion();
      return true;
    },
    /** 送出之後允許再刻一次（重玩拿更高評價）。 */
    reopen() {
      if (!flow) return false;
      return api.load(flow);
    },
    /** 直接選某一個選項（測試 / 快捷用）。 */
    pick,
    /** 直接觸發手掌印（測試用，不必真的按住 600ms）。 */
    press: fire,
    focusFirstOption,
  };

  return api;
}

export default createStele;

/**
 * Promptasy — 開場標題卡
 *
 * 遊戲一開就是這一頁：品牌名、定位句、按任意鍵開始。
 * 它同時扮演一個實際功能：蓋住 three.js 第一幀的編譯與地形生成，開場不會看到閃爍。
 * （Phase 34 起，「不讓世界被看到」這件事改由 index.html 裡的黑幕 `#bootcover` 負責，
 * 一路蓋到玩家按下開始為止 —— 這一頁只要負責好看就好。）
 *
 * Phase 33：揭示改成**由 open() 觸發**（元素預設 hidden，CSS 動畫要到那時才起跑），
 * 因為自動播放被擋的首次造訪會先經過一道入場門（`entrygate.js`）——
 * 門推開、開場曲真的響起來之後才輪到這一頁，揭示與音樂同步發生。
 * 音訊解鎖那一下手勢由入場門負責，這裡不再兼差。
 *
 * Phase 34 的分鏡（一件一件來，不再是所有東西一起浮上來）：
 *
 *   0.15s  Promptasy 整個從模糊裡慢慢對焦（**不再**一個字一個字彈出來）
 *   1.00s  底下那條髮絲線展開
 *   1.35s  定位句開始**打字**（一個字元一個字元，帶一根游標）
 *   ＋0.32s 中文那一句接著打字（CJK 一個字看得比較久，所以慢一點）
 *   ＋0.26s 「按任意鍵開始」浮出來
 *
 * 打字是 JS 驅動的（CSS 的 steps() 對中英混排＋自動換行沒辦法），但它**永遠不擋輸入**：
 * 任何時候按下去都直接進場，打字會在同一拍被補完（`finishTyping`），
 * 玩家不會看到一句話被切一半就淡出去。`prefers-reduced-motion` 下整段不打字，直接顯示。
 */
import { el, esc } from './dom.js';

const NAME = 'Promptasy';
/** 'Prompt' 之後那三個字（asy）用主色。 */
const ACCENT = 'asy';
const HEAD = NAME.slice(0, NAME.length - ACCENT.length);
const ZH_LINE = '在一個夜色的世界裡探索，用你寫的 prompt 解開它。';

/** 打字速度（毫秒／字元）。中文一個字資訊量大，打慢一點才讀得完。 */
const TYPE_LATIN = 34;
const TYPE_CJK = 72;
/** 分鏡的節拍（毫秒）。 */
const BEAT_TAG = 1350;
const BEAT_GAP = 320;
const BEAT_START = 260;

/**
 * @param {object} opts
 * @param {() => void} [opts.onStart]
 * @param {string} [opts.subtitle]
 */
export function createTitle({ onStart, subtitle = 'Learn Prompt Engineering by Playing' } = {}) {
  const root = el('div', 'title');
  // 預設收起來：揭示的 CSS 動畫與打字都要等 open() 才起跑（見檔頭）
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Promptasy — 開始畫面');
  /*
   * 每一句話都放兩份：
   *   · `.sr-only` 的完整文字 —— 螢幕閱讀器讀得到，而且第一幀就在（不會念到打一半的字）
   *   · `.title__typed` 的打字結果 —— aria-hidden，純視覺
   * textContent 因此永遠包含完整句子（測試與複製貼上都不受打字影響）。
   */
  root.innerHTML = `
    <div class="title__veil"></div>
    <div class="title__inner">
      <p class="title__mark" aria-hidden="true">✦</p>
      <h1 class="title__name" aria-label="${esc(NAME)}">${esc(HEAD)}<span class="title__accent">${esc(
        ACCENT
      )}</span></h1>
      <div class="title__rule" aria-hidden="true"></div>
      <p class="title__tag">
        <span class="sr-only">${esc(subtitle)}</span>
        <span class="title__typed" data-typed="tag" aria-hidden="true"></span
        ><span class="title__caret" data-caret="tag" aria-hidden="true"></span>
      </p>
      <p class="title__zh">
        <span class="sr-only">${esc(ZH_LINE)}</span>
        <span class="title__typed" data-typed="zh" aria-hidden="true"></span
        ><span class="title__caret" data-caret="zh" aria-hidden="true"></span>
      </p>
      <button class="title__start" data-start type="button">按任意鍵開始 <kbd>Enter</kbd></button>
    </div>
  `;

  const typed = {
    tag: root.querySelector('[data-typed="tag"]'),
    zh: root.querySelector('[data-typed="zh"]'),
  };
  const carets = {
    tag: root.querySelector('[data-caret="tag"]'),
    zh: root.querySelector('[data-caret="zh"]'),
  };

  let done = false;
  let live = false;
  let typing = false;
  /** 所有排程中的計時器：任何時候都要能一次清乾淨（按下開始那一拍）。 */
  const timers = new Set();

  const reduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  /**
   * 一句話一個字元地打出來。用展開運算子切字元 —— 中文、標點、emoji 都算一個。
   * @param {'tag'|'zh'} key
   * @param {string} text
   * @param {number} per 每個字元幾毫秒
   * @param {() => void} [after]
   */
  function typeLine(key, text, per, after) {
    const chars = [...text];
    const target = typed[key];
    const caret = carets[key];
    let i = 0;
    caret.classList.add('is-on');
    const tick = () => {
      i += 1;
      target.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) {
        caret.classList.remove('is-on');
        after?.();
        return;
      }
      later(tick, per);
    };
    later(tick, per);
  }

  /** 把兩句話一次補完（按下開始、或 reduce-motion）。 */
  function finishTyping() {
    clearTimers();
    typing = false;
    typed.tag.textContent = subtitle;
    typed.zh.textContent = ZH_LINE;
    carets.tag.classList.remove('is-on');
    carets.zh.classList.remove('is-on');
    root.classList.add('is-ready');
  }

  function runSequence() {
    if (reduced()) {
      finishTyping();
      return;
    }
    typing = true;
    later(() => {
      typeLine('tag', subtitle, TYPE_LATIN, () => {
        later(() => {
          typeLine('zh', ZH_LINE, TYPE_CJK, () => {
            later(() => {
              typing = false;
              root.classList.add('is-ready');
            }, BEAT_START);
          });
        }, BEAT_GAP);
      });
    }, BEAT_TAG);
  }

  function start() {
    if (done || !live) return;
    done = true;
    live = false;
    // 打到一半就被按下去：把話補完，不要讓半句話淡出去
    finishTyping();
    root.classList.add('is-leaving');
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
    setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving');
    }, 900);
    onStart?.();
  }

  function onKey(e) {
    // Tab 留給無障礙導覽，其他任意鍵都算「開始」
    if (e.key === 'Tab') return;
    // 按著不放的自動重複不算新的一下（推開入場門那一下不該穿透到這裡）
    if (e.repeat) return;
    start();
  }
  function onPointer() {
    start();
  }

  return {
    root,
    get isOpen() {
      return live;
    },
    get dismissed() {
      return done;
    },
    /** 打字還在跑嗎（測試 / 除錯用）。 */
    get isTyping() {
      return typing;
    },
    open() {
      root.hidden = false;
      live = true;
      // 打字歸零：重看時要從頭來（面板從 display:none 回來，CSS 動畫也會整組重播）
      clearTimers();
      typed.tag.textContent = '';
      typed.zh.textContent = '';
      root.classList.remove('is-ready');
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        root.querySelector('[data-start]')?.focus({ preventScroll: true });
        runSequence();
      });
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPointer, true);
    },
    /** 給自動化測試 / 「跳過」用。 */
    dismiss: start,
    /** 把打字一次補完（測試用；玩家按下開始時會自動走這一支）。 */
    finishTyping,
    /**
     * 收起來，但**不**觸發 onStart（重播開場動畫的測試用）。
     * 和 start() 不同：這裡不會啟動遊戲、不會動到 done。
     */
    hide() {
      live = false;
      clearTimers();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      root.hidden = true;
      root.classList.remove('is-open', 'is-leaving');
    },
  };
}

export default createTitle;

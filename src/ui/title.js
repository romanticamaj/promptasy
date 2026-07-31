/**
 * Promptasy — 開場標題卡
 *
 * 遊戲一開就是這一頁：品牌名、定位句、按任意鍵開始。
 * 「不讓世界被看到」由 index.html 的黑幕 `#bootcover` 負責，一路蓋到玩家按下開始。
 *
 * Phase 33：揭示由 open() 觸發（元素預設 hidden，CSS 動畫到那時才起跑）——
 * 自動播放被擋的首次造訪會先經過入場門（entrygate.js），門推開、開場曲響起
 * 之後才輪到這一頁，揭示與音樂同步發生。
 *
 * Phase 34.5 的分鏡（站長定稿：不要打字機，一行一行淡入就好）：
 *
 *   0.15s  Promptasy 整個從模糊裡慢慢對焦
 *   1.00s  底下那條髮絲線展開
 *   1.35s  定位句淡入
 *   2.00s  中文兩行淡入（「在一個夜色的世界裡探索，」強制換行）
 *   2.70s  「按任意鍵開始」浮出來
 *
 * 全部是 CSS 動畫（.is-open 起跑），任何時候按下去都直接進場。
 */
import { el, esc } from './dom.js';

const NAME = 'Promptasy';
/** 'Prompt' 之後那三個字（asy）用主色。 */
const ACCENT = 'asy';
const HEAD = NAME.slice(0, NAME.length - ACCENT.length);
const ZH_LINE_A = '在一個夜色的世界裡探索，';
const ZH_LINE_B = '用你寫的 prompt 解開它。';

/**
 * @param {object} opts
 * @param {() => void} [opts.onStart]
 * @param {string} [opts.subtitle]
 */
export function createTitle({ onStart, subtitle = 'Learn Prompt Engineering by Playing' } = {}) {
  const root = el('div', 'title');
  // 預設收起來：揭示的 CSS 動畫要等 open() 才起跑（見檔頭）
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Promptasy — 開始畫面');
  root.innerHTML = `
    <div class="title__veil"></div>
    <div class="title__inner">
      <p class="title__mark" aria-hidden="true">✦</p>
      <h1 class="title__name" aria-label="${esc(NAME)}">${esc(HEAD)}<span class="title__accent">${esc(
        ACCENT
      )}</span></h1>
      <div class="title__rule" aria-hidden="true"></div>
      <p class="title__tag">${esc(subtitle)}</p>
      <p class="title__zh">${esc(ZH_LINE_A)}<br />${esc(ZH_LINE_B)}</p>
      <button class="title__start" data-start type="button">按任意鍵開始 <kbd>Enter</kbd></button>
    </div>
  `;

  let done = false;
  let live = false;

  function start() {
    if (done || !live) return;
    done = true;
    live = false;
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
    /** 舊 API 相容（打字機已移除，永遠 false / no-op）。 */
    get isTyping() {
      return false;
    },
    finishTyping() {},
    open() {
      root.hidden = false;
      live = true;
      requestAnimationFrame(() => {
        root.classList.add('is-open', 'is-ready');
        root.querySelector('[data-start]')?.focus({ preventScroll: true });
      });
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPointer, true);
    },
    /** 給自動化測試 / 「跳過」用。 */
    dismiss: start,
    /**
     * 收起來，但**不**觸發 onStart（重播開場動畫的測試用）。
     */
    hide() {
      live = false;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      root.hidden = true;
      root.classList.remove('is-open', 'is-leaving');
    },
  };
}

export default createTitle;

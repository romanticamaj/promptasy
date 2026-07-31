/**
 * Promptasy — 開場標題卡
 *
 * 遊戲一開就是這一頁：品牌名、定位句、按任意鍵開始。
 * 它同時扮演一個實際功能：蓋住 three.js 第一幀的編譯與地形生成，開場不會看到閃爍。
 *
 * Phase 33：分字揭示改成**由 open() 觸發**（元素預設 hidden，CSS 動畫要到那時才起跑），
 * 因為自動播放被擋的首次造訪會先經過一道入場門（`entrygate.js`）——
 * 門推開、開場曲真的響起來之後才輪到這一頁，揭示與音樂同步發生。
 * 音訊解鎖那一下手勢由入場門負責，這裡不再兼差。
 */
import { el, esc } from './dom.js';

const NAME = 'Promptasy';
/** 'Prompt' 之後那三個字（asy）用主色 —— 對應原本的 <span>。 */
const ACCENT_FROM = 'Prompt'.length;

/**
 * 把字名拆成一個個 <span>，讓每個字元照 --i 依序從遮罩後浮上來。
 * textContent 仍然是完整的 'Promptasy'（測試與螢幕閱讀器都不受影響）。
 */
function stageName(name) {
  return [...name]
    .map(
      (ch, i) =>
        `<span class="title__ch${i >= ACCENT_FROM ? ' title__ch--accent' : ''}" style="--i:${i}">${esc(ch)}</span>`
    )
    .join('');
}

/**
 * @param {object} opts
 * @param {() => void} [opts.onStart]
 * @param {string} [opts.subtitle]
 */
export function createTitle({ onStart, subtitle = 'Learn Prompt Engineering by Playing' } = {}) {
  const root = el('div', 'title');
  // 預設收起來：分字揭示的 CSS 動畫要等 open() 才起跑（見檔頭）
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Promptasy — 開始畫面');
  root.innerHTML = `
    <div class="title__veil"></div>
    <div class="title__inner">
      <p class="title__mark" aria-hidden="true">✦</p>
      <h1 class="title__name" aria-label="${esc(NAME)}">${stageName(NAME)}</h1>
      <div class="title__rule" aria-hidden="true"></div>
      <p class="title__tag">${esc(subtitle)}</p>
      <p class="title__zh">在一個夜色的世界裡探索，用你寫的 prompt 解開它。</p>
      <button class="title__start" data-start type="button">按任意鍵開始 <kbd>Enter</kbd></button>
      <p class="title__foot">68 條技巧 · 27 個關卡 · 每一條都附得出官方出處</p>
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
    open() {
      root.hidden = false;
      live = true;
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        root.querySelector('[data-start]')?.focus({ preventScroll: true });
      });
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPointer, true);
    },
    /** 給自動化測試 / 「跳過」用。 */
    dismiss: start,
  };
}

export default createTitle;

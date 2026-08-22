/**
 * Promptasy — 首次進入的教學提示（看過就記在存檔裡，不再打擾）
 */
import { el } from './dom.js';

export function createIntro({ onDismiss }) {
  const root = el('div', 'intro');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '操作說明');
  root.innerHTML = `
    <div class="intro__card">
      <p class="intro__eyebrow">Promptasy — Foundations</p>
      <h1 class="intro__title">高原上的第一課</h1>
      <p class="intro__lead">
        你是一名旅人。這座高原上的居民都在等一段「講得夠清楚的話」。
        走到發光的石座旁，按 <kbd>E</kbd> 打開 Prompt 主控台，寫下你的 prompt 去解決他們的問題。
        解開後會拿到經驗、把技巧收進圖鑑，世界也會對你打開更多。
      </p>
      <ul class="intro__keys">
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移動</span></li>
        <li><kbd>Shift</kbd><span>奔跑</span></li>
        <li><kbd>J</kbd><span>跳（有高台的土地）</span></li>
        <li><kbd>←</kbd><kbd>→</kbd> / 滑鼠拖曳<span>轉鏡頭</span></li>
        <li><kbd>↑</kbd><kbd>↓</kbd> / <kbd>空白鍵</kbd><span>抬頭看天空</span></li>
        <li><kbd>-</kbd><kbd>=</kbd><span>鏡頭拉遠 / 拉近</span></li>
        <li><kbd>E</kbd><span>互動</span></li>
        <li><kbd>C</kbd><span>技巧圖鑑</span></li>
        <li><kbd>O</kbd><span>設定 / 重置進度</span></li>
        <li><kbd>Esc</kbd><span>收起最上面那一層</span></li>
        <li><kbd>?</kbd><span>操作一覽（全部按鍵）</span></li>
      </ul>
      <p class="intro__note">
        你寫的每一段話都會當場評分，並告訴你缺了什麼、下一步怎麼改。
        每條技巧都附官方出處，可以直接點開查證。
        整趟旅程不用滑鼠也走得完 —— 忘記按什麼就按 <kbd>?</kbd>。
      </p>
      <button class="btn btn--primary" data-start type="button">開始探索</button>
    </div>
  `;

  root.querySelector('[data-start]').addEventListener('click', () => {
    root.classList.remove('is-open');
    root.hidden = true;
    onDismiss?.();
  });

  return {
    root,
    open() {
      root.hidden = false;
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        root.querySelector('[data-start]')?.focus({ preventScroll: true });
      });
    },
    get isOpen() {
      return !root.hidden;
    },
  };
}

export default createIntro;

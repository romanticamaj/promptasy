/**
 * Promptasy — 石碑閱讀面板（世界觀風味，不是課程）
 *
 * 刻意做得很輕：一塊石板、兩三行字、一句「按 Esc 收起」。
 * 這裡不放技巧宣稱、不放官方出處 —— 真正的教學一律在關卡與圖鑑（護欄 2）。
 */
import { el, esc, createOverlay } from './dom.js';

export function createTablet({ onClose }) {
  const overlay = createOverlay({
    id: 'lore-tablet',
    title: '石碑',
    subtitle: '這片土地留下的字',
    eyebrow: '世界石碑',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--lore');

  const body = overlay.body;
  const article = el('article', 'lore');
  body.appendChild(article);

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /**
     * @param {{id:string,title:string,lines:string[]}} tablet
     * @param {{firstRead:boolean, xpGain:number}} [meta]
     */
    open(tablet, meta = {}) {
      overlay.setTitle(tablet.title || '石碑', '這片土地留下的字');
      // 一行一行依序浮現（--i 控制延遲），碑文讀起來像被慢慢刻出來
      const lines = (tablet.lines || [])
        .map((l, i) => `<p class="lore__line" style="--i:${i}">${esc(l)}</p>`)
        .join('');
      const note = meta.firstRead
        ? `<p class="lore__note">✦ 新的碑文已記下　+${Number(meta.xpGain) || 0} XP</p>`
        : '<p class="lore__note lore__note--seen">這塊碑你讀過了。</p>';
      article.innerHTML = `
        <div class="lore__mark" aria-hidden="true"></div>
        ${lines}
        ${note}
        <p class="lore__hint"><kbd>Esc</kbd> 收起，繼續走</p>
      `;
      overlay.open();
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createTablet;

/**
 * Promptasy — 抄寫人殘頁的小窗（v1.2 · P07）
 *
 * 一頁掉在路邊的紙：一張工單、一封信、一頁筆記。撿起來讀完就收進圖鑑。
 *
 * 護欄 2：這一層**一半有教學、一半純風味**，兩種在畫面上長得不一樣：
 *   · 有教學的（`techniqueId`）→ 顯示技巧名稱、既有的中文說法、一句照著做的白話，
 *     後面一定接得出可點的官方出處（神諭原典），跟刻文小語同一個誠實模式。
 *   · 純風味的               → 只有那幾行字，**沒有技巧、沒有連結**（同世界觀石碑）。
 */
import { el, esc, createOverlay, bindInfoTips, datedNoteHtml, sourceBook, sourceNoteHtml } from './dom.js';

/** 官方出處在畫面上的說法（與主控台第二幕一致）。 */
export const SOURCE_LABEL = '神諭原典';

export function createLetter({ content, sourceIntro = '', onClose }) {
  const overlay = createOverlay({
    id: 'letter',
    title: '殘頁',
    subtitle: '抄寫人留下的一頁',
    eyebrow: '抄寫人的殘頁',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--letter');

  const article = el('article', 'letter');
  overlay.body.appendChild(article);
  bindInfoTips(overlay.body);

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /**
     * @param {object} spec letters.json 的一列
     * @param {{firstRead:boolean, xpGain:number, newlyCollected:string[]}} [meta]
     */
    open(spec, meta = {}) {
      overlay.setEyebrow('抄寫人的殘頁');
      overlay.setTitle(spec.title || '殘頁', '抄寫人留下的一頁');
      overlay.resetScroll?.();

      const lines = (spec.lines || [])
        .map((l, i) => `<p class="letter__line reveal d${i + 1}">${esc(l)}</p>`)
        .join('');

      const view = spec.techniqueId ? content.displayTechnique(spec.techniqueId) : null;
      const src = spec.techniqueId ? content.sourceFor(spec.techniqueId) : null;
      const teach =
        view && spec.techniqueId
          ? `<section class="letter__glyph reveal d4">
              <p class="meta-label meta-label--star">這一頁引的是</p>
              <h4 class="letter__tech">${esc(view.title)}</h4>
              <p class="letter__tip">${esc(view.tip)}</p>
              ${spec.hint ? `<p class="letter__how">${esc(spec.hint)}</p>` : ''}
              ${datedNoteHtml(view.dated)}
              ${
                src
                  ? `<p class="srcrow">${sourceBook(src, {
                      label: SOURCE_LABEL,
                      extra: sourceIntro || '',
                    })}${content.sourceNote ? sourceNoteHtml(content.sourceNote(src.url)) : ''}</p>`
                  : ''
              }
            </section>`
          : '';

      const collected = (meta.newlyCollected || []).length
        ? '<span class="letter__got">這一條已寫進圖鑑</span>'
        : '';
      const note = meta.firstRead
        ? `<p class="letter__note reveal d5">✦ 收進了殘頁　+${Number(meta.xpGain) || 0} XP ${collected}</p>`
        : '<p class="letter__note letter__note--seen reveal d5">這一頁你收過了。</p>';

      article.innerHTML = `<div class="letter__mark" aria-hidden="true"></div>${lines}${teach}${note}
        <p class="letter__hint reveal d5"><kbd>Esc</kbd> 收起，繼續走</p>`;
      overlay.open();
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createLetter;

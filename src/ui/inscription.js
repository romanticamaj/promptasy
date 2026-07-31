/**
 * Promptasy — 刻文小語的小對話窗（Phase 22）
 *
 * 刻意做得比主控台小非常多：**沒有四幕、沒有石碑、沒有評分**。
 * 走近角落那塊刻著字的東西，按 E，兩句話，一件小事，走人。
 *
 * 護欄 2：這一層跟世界觀石碑不同 —— 它**真的在教技巧**，所以：
 *   · 教學句子直接取自遊戲既有的中文說法（content.displayTechnique 的 tip），
 *     不在這裡另外編一套；
 *   · 一定顯示技巧名稱與**可點的官方出處**（神諭原典），跟第二幕同一個誠實模式；
 *   · 「lines」與「hint」是遊戲自撰的白話（同 coach.json 的性質），不冒充官方文字。
 */
import { el, esc, createOverlay, bindInfoTips, datedNoteHtml, infoTip, sourceNoteHtml } from './dom.js';

/** 官方出處在畫面上的說法（與主控台第二幕一致）。 */
export const SOURCE_LABEL = '神諭原典';

export function createInscription({ content, sourceIntro = '', onClose }) {
  const overlay = createOverlay({
    id: 'inscription',
    title: '刻文小語',
    subtitle: '刻在角落的一句話',
    eyebrow: '刻文小語',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--inscribe');

  const article = el('article', 'inscribe');
  overlay.body.appendChild(article);
  bindInfoTips(overlay.body);

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /**
     * @param {object} spec inscriptions.json 的一列
     * @param {{firstRead:boolean, xpGain:number, newlyCollected:string[]}} [meta]
     */
    open(spec, meta = {}) {
      overlay.setEyebrow('刻文小語');
      overlay.setTitle(spec.title || '刻文小語', '刻在角落的一句話');
      overlay.resetScroll?.();

      const view = content.displayTechnique(spec.techniqueId);
      const src = content.sourceFor(spec.techniqueId);
      const lines = (spec.lines || [])
        .map((l, i) => `<p class="inscribe__line reveal d${i + 1}">${esc(l)}</p>`)
        .join('');

      const teach = view
        ? `<section class="inscribe__glyph reveal d3">
            <p class="meta-label meta-label--star">這一段刻的是${
              sourceIntro ? infoTip(sourceIntro, { label: '這段刻文是從哪裡來的' }) : ''
            }</p>
            <h4 class="inscribe__tech">${esc(view.title)}</h4>
            <p class="inscribe__tip">${esc(view.tip)}</p>
            ${spec.hint ? `<p class="inscribe__how">${esc(spec.hint)}</p>` : ''}
            ${datedNoteHtml(view.dated)}
            ${
              src
                ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(
                    SOURCE_LABEL
                  )}：${esc(src.name)} ↗</a>${
                    content.sourceNote ? sourceNoteHtml(content.sourceNote(src.url)) : ''
                  }`
                : ''
            }
          </section>`
        : '';

      const collected = (meta.newlyCollected || []).length
        ? '<span class="inscribe__got">這一條已寫進圖鑑</span>'
        : '';
      const note = meta.firstRead
        ? `<p class="inscribe__note reveal d4">✦ 記下了　+${Number(meta.xpGain) || 0} XP ${collected}</p>`
        : '<p class="inscribe__note inscribe__note--seen reveal d4">這一則你讀過了。</p>';

      article.innerHTML = `${lines}${teach}${note}
        <p class="inscribe__hint reveal d4"><kbd>Esc</kbd> 收起，繼續走</p>`;
      overlay.open();
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createInscription;

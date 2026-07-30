/**
 * PromptArcade — 器物的小窗（Phase 25）
 *
 * 八種器物裡只有兩種需要開一個窗：**陶罐**（罐底寫了什麼）與**指路石**（四個方向）。
 * 其餘六種（火盆 / 響石 / 守望石 / 撈月池 / 絞盤 / 長凳）一律只在畫面上說一句話 ——
 * 「一次只有一件事擁有畫面」不代表每件事都要一個面板；
 * 走在路上的小互動不該把整個世界蓋掉。
 *
 * 護欄 2：這一層是**純風味**。這裡沒有技巧名、沒有出處連結、沒有評分 ——
 * 一個字都不宣稱官方說法。真正的教學在關卡、刻文小語與圖鑑。
 * 版面沿用刻文小語那一套（同樣是「路過看一眼」的東西），只是內容更輕。
 */
import { el, esc, createOverlay } from './dom.js';

export function createHandlePanel({ onClose }) {
  const overlay = createOverlay({
    id: 'handle',
    title: '器物',
    subtitle: '',
    eyebrow: '動得了的東西',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--inscribe');

  const article = el('article', 'inscribe');
  overlay.body.appendChild(article);

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /**
     * @param {object} spec handles.json 的一列
     * @param {{firstUse:boolean, xpGain:number}} [meta]
     */
    open(spec, meta = {}) {
      overlay.setEyebrow('動得了的東西');
      overlay.setTitle(spec.title || '器物', '');
      overlay.resetScroll?.();

      let bodyHtml = '';
      if (Array.isArray(spec.ways) && spec.ways.length) {
        // 指路石：四塊牌子，一塊一行，分段浮出
        bodyHtml = `<ul class="ways">${spec.ways
          .map(
            (w, i) =>
              `<li class="ways__row reveal d${Math.min(4, i + 1)}"><b>${esc(w.to)}</b><span>${esc(
                w.text
              )}</span></li>`
          )
          .join('')}</ul>`;
      } else {
        bodyHtml = (spec.lines || [])
          .map((l, i) => `<p class="inscribe__line reveal d${Math.min(4, i + 1)}">${esc(l)}</p>`)
          .join('');
      }

      const note = meta.firstUse
        ? `<p class="inscribe__note reveal d4">✦ 記下了　+${Number(meta.xpGain) || 0} XP</p>`
        : '<p class="inscribe__note inscribe__note--seen reveal d4">這件東西你已經動過了。</p>';

      article.innerHTML = `${bodyHtml}${note}
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

export default createHandlePanel;

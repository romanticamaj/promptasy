/**
 * Promptasy — 橋上的門會問你一句話（Phase 29）
 *
 * 四座橋中央的閘門本來是硬擋：條件沒到就是走不過去。
 * 但已經懂這些東西的人不該被擋在原地 —— 所以門改成**會問**：
 *
 *   「這道門的考驗還沒完成（還差…）。想先過去看看嗎？
 *     前方的試煉不會因此變簡單。」
 *
 * 兩個選擇：「直接前往」開門走人，「先留下修行」把門留著。
 * 這裡不放官方出處、不放技巧宣稱 —— 它是世界的一句話，不是課程（護欄 2）。
 * 焦點鎖、Esc、鍵盤操作都由 createOverlay 負責。
 *
 * ## 唯一的例外：硬門檻（課程 v2 · Phase J1）
 *
 * 分歧之廳是整個世界**唯一一道不能先行前往的門**（curriculum-v2 §5.4）。
 * `status.hard` 為真時這裡**不畫出「直接前往」** —— 提了卻按不下去比擋住更糟。
 * 換上去的是一句說得出理由的話（「這裡的每一關都建立在你已經知道通則之上」），
 * 而且**不寫成失敗**：門沒有拒絕你，只是還沒有輪到這裡。
 * 「先留下修行」與 `Esc` 照舊，鍵盤一樣走得完。
 */
import { el, esc, createOverlay } from './dom.js';

export function createGateAsk({ onProceed, onStay, onClose }) {
  const overlay = createOverlay({
    id: 'gate-ask',
    title: '橋上的門',
    subtitle: '還沒走完的路，也可以先走過去',
    eyebrow: '橋上的門',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--gateask');

  const article = el('article', 'gateask');
  overlay.body.appendChild(article);

  /** 目前問的是哪一道門（決定「直接前往」開哪一區）。 */
  let regionId = null;

  article.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    const stay = e.target.closest('[data-stay]');
    if (go) {
      const id = regionId;
      api.close({ silent: true });
      onProceed?.(id);
    } else if (stay) {
      const id = regionId;
      api.close({ silent: true });
      onStay?.(id);
    }
  });

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /** 目前問的是哪一道門（測試 / 除錯用）。 */
    get regionId() {
      return regionId;
    },

    /**
     * @param {{id:string, name:string, nameEn?:string}} region
     * @param {{needs?:string[], text?:string}} status progression.gateStatus() 的回傳值
     */
    open(region, status = {}) {
      regionId = region.id;
      const needs = Array.isArray(status.needs) ? status.needs : [];
      overlay.setTitle(
        `${region.name}的門`,
        status.hard ? '這一道要走過去才開' : '還沒走完的路，也可以先走過去'
      );
      overlay.setEyebrow('橋上的門');
      const hard = Boolean(status.hard);
      article.classList.toggle('gateask--hard', hard);
      article.innerHTML = hard
        ? `
        <div class="gateask__mark" aria-hidden="true"></div>
        <p class="gateask__line" style="--i:0">這一道門要走過去才開。</p>
        ${
          needs.length
            ? `<p class="gateask__need" style="--i:1">還差：${needs.map((n) => esc(n)).join(' ＋ ')}</p>`
            : ''
        }
        <p class="gateask__line" style="--i:2">這裡的每一關都從「你已經知道通則」開始。</p>
        <p class="gateask__warn" style="--i:3">先看兩面之詞，學到的只會是混亂。門一直在，回來就好。</p>
        <div class="gateask__acts">
          <button class="btn btn--primary" data-stay type="button">先留下修行</button>
        </div>
        <p class="gateask__hint"><kbd>Enter</kbd> 或 <kbd>Esc</kbd> 先留下</p>
      `
        : `
        <div class="gateask__mark" aria-hidden="true"></div>
        <p class="gateask__line" style="--i:0">這道門的考驗還沒完成。</p>
        ${
          needs.length
            ? `<p class="gateask__need" style="--i:1">還差：${needs.map((n) => esc(n)).join(' ＋ ')}</p>`
            : ''
        }
        <p class="gateask__line" style="--i:2">想先過去看看嗎？</p>
        <p class="gateask__warn" style="--i:3">前方的試煉不會因此變簡單。</p>
        <div class="gateask__acts">
          <button class="btn btn--primary" data-go type="button">直接前往</button>
          <button class="btn btn--ghost" data-stay type="button">先留下修行</button>
        </div>
        <p class="gateask__hint"><kbd>Tab</kbd> 換選項 · <kbd>Enter</kbd> 決定 · <kbd>Esc</kbd> 先留下</p>
      `;
      overlay.resetScroll();
      // 預設焦點落在「先留下修行」—— 不小心按 Enter 不會就這樣越過一整區
      overlay.open({ focus: article.querySelector('[data-stay]') });
    },

    /**
     * @param {{silent?:boolean}} [opts] silent = 由按鈕觸發，呼叫端自己會處理後續
     */
    close(opts = {}) {
      if (!overlay.isOpen) return;
      const closing = regionId;
      overlay.close();
      regionId = null;
      onClose?.({ ...opts, regionId: closing });
    },
  };
  return api;
}

export default createGateAsk;

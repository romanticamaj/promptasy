/** 極簡 DOM 工具（不上框架，見 CLAUDE.md 技術棧）。 */

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/** 使用者輸入一律經過這裡再進 innerHTML。 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** curriculum 的 note 欄位含官方允許的 <b> 標記，這裡只放行安全的少數標籤。 */
export function safeRich(value) {
  return esc(value)
    .replace(/&lt;(\/?)(b|i|em|strong|code|br)&gt;/gi, '<$1$2>');
}

export function on(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

/* ------------------------------------------------------------------ *
 * 資訊提示（ⓘ）
 *
 * Phase 13：畫面上那些「解釋這個世界的說法其實是指什麼」的旁白
 * （例如「神諭原典 —— 也就是各家的官方文件」）會一直佔著版面、
 * 把故事講散掉。改成收進一顆小小的 ⓘ 後面：
 *
 *   · 預設看不見（visibility:hidden，不是從 DOM 拿掉 —— 內容仍可被查證）
 *   · 滑鼠移上去看得到；鍵盤 focus 也看得到；手機點一下也看得到
 *   · aria-describedby 指到氣泡，螢幕閱讀器讀得到（無障礙不打折）
 *
 * **真正的出處連結永遠留在畫面上**，不會被收進 ⓘ（CLAUDE.md 護欄 2）。
 * ------------------------------------------------------------------ */

let tipSeq = 0;

/**
 * 產生一顆 ⓘ 的 HTML 字串（面板都是用 innerHTML 組的，所以回傳字串最好接）。
 * @param {string} text 要收起來的說明文字
 * @param {object} [opts]
 * @param {string} [opts.label] 給螢幕閱讀器的按鈕名稱
 */
export function infoTip(text, { label = '說明' } = {}) {
  tipSeq += 1;
  const id = `infotip-${tipSeq}`;
  return `<span class="infotip" data-infotip><button class="infotip__btn" type="button" data-infotip-btn aria-describedby="${id}" aria-label="${esc(
    label
  )}" aria-expanded="false">ⓘ</button><span class="infotip__bubble" id="${id}" role="tooltip" data-infotip-bubble>${esc(
    text
  )}</span></span>`;
}

/* ------------------------------------------------------------------ *
 * 神諭原典（Phase 35.1）—— 一本很小的書
 *
 * 出處原本是一整行字（「神諭原典：Anthropic · Prompting best practices ↗」）。
 * 一段刻文只有兩三句，那一行比刻文本身還長，讀起來像是註腳搶了正文。
 * 改成一枚 14px 的書：
 *
 *   · **它一直看得見**（護欄 2：出處不是藏在第二層點擊後面的東西）
 *   · 滑到 / Tab 到就說出是哪一份文件（沿用 ⓘ 的氣泡機制，不會自己彈出來）
 *   · 按下去就開那份官方文件（一次點擊，新分頁，`rel="noopener"`）
 *   · 一列有好幾份出處，就排好幾本書 —— 一本對一份，不合併
 * ------------------------------------------------------------------ */

/**
 * 典籍的剪影（行內 SVG，零外部資產）。
 *
 * 原本是一本很小的空白書，剪影跟「筆記本」分不出來。改成一本**合起來的厚典籍**：
 * 有書脊、有壓在封面上的束帶與扣環、書口露出一截書籤緞帶 —— 一眼就讀得出
 * 「這是一本被珍藏的原典」，而不是隨手一本冊子。20px，暖金（夜間檔案館色）。
 */
export const BOOK_ICON = `<svg class="bookicon__glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6.8 2.4h10.2a1.2 1.2 0 0 1 1.2 1.2v16.8a1.2 1.2 0 0 1-1.2 1.2H6.8a1.4 1.4 0 0 1-1.4-1.4V3.8a1.4 1.4 0 0 1 1.4-1.4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.1 2.4v19.2" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><path d="M13.3 6.2v11.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.9 10h4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M18.2 10.8h1.5a1.1 1.1 0 0 1 1.1 1.1v.4a1.1 1.1 0 0 1-1.1 1.1h-1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" opacity="0.9"/></svg>`;

/** 畫面上對「官方出處」的世界觀說法（和 console.js 的 SOURCE_LABEL 同一句）。 */
export const BOOK_LABEL = '神諭原典';

/**
 * 一枚指得回官方文件的書。
 *
 * @param {{url:string,name:string}|null} src
 * @param {object} [opts]
 * @param {string} [opts.label] 前綴（預設「神諭原典」）
 * @param {string} [opts.extra] 氣泡裡要多說的一句（例如「什麼是神諭原典」的解釋）
 * @returns {string} HTML（沒有出處就回空字串 —— 不畫一本空的書）
 */
export function sourceBook(src, { label = BOOK_LABEL, extra = '' } = {}) {
  if (!src || !src.url) return '';
  tipSeq += 1;
  const id = `bookicon-${tipSeq}`;
  const name = src.name || src.url;
  const tip = `${label}：${name}${extra ? `　${extra}` : ''}`;
  return `<span class="infotip infotip--book" data-infotip><a class="bookicon" href="${esc(
    src.url
  )}" target="_blank" rel="noopener" aria-describedby="${id}" aria-label="${esc(
    `${label}：${name}（開新分頁）`
  )}">${BOOK_ICON}</a><span class="infotip__bubble" id="${id}" role="tooltip" data-infotip-bubble>${esc(
    tip
  )}</span></span>`;
}

/**
 * 時代註記（dated-notes.json）的一小塊 HTML。
 *
 * 官方建議會隨模型世代改變，但 curriculum.json 的引文一個字都不動 ——
 * 改成在畫面上安靜地補一句**有日期**的查核備註 ＋ 可點的新官方連結。
 * 刻意做得小、灰、不搶戲：它是註腳，不是新的教學內容。
 *
 * @param {object|null} note dated-notes 的一條（content.datedNote(id) 的回傳值）
 */
export function datedNoteHtml(note) {
  if (!note || !note.text) return '';
  const links = (note.sources || [])
    .map(
      (s) =>
        `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`
    )
    .join('');
  return `<p class="datednote"><span class="datednote__mark" aria-hidden="true">※</span><span class="datednote__body">${esc(
    note.text
  )}${links ? `<span class="datednote__srcs">${links}</span>` : ''}</span></p>`;
}

/**
 * 出處狀態註記（已下架 / 官方已標示即將移除）。
 * 原網址永遠留在畫面上（護欄 2：引文與出處不改），只是旁邊多一句實話與後繼參考。
 */
export function sourceNoteHtml(note) {
  if (!note || !note.text) return '';
  const rep = note.replacement;
  return `<span class="srcnote">${esc(note.text)}${
    rep
      ? ` 後繼參考：<a class="src" href="${esc(rep.url)}" target="_blank" rel="noopener">${esc(
          rep.name
        )} ↗</a>`
      : ''
  }</span>`;
}

/**
 * 幫一個容器裡所有的 ⓘ 接上互動（事件委派，之後重繪的 ⓘ 也有效）。
 * 呼叫一次就好。
 */
export function bindInfoTips(root) {
  if (!root || root.__infoTipsBound) return;
  root.__infoTipsBound = true;

  const setOpen = (tip, open) => {
    if (!tip) return;
    tip.classList.toggle('is-open', open);
    tip.querySelector('[data-infotip-btn]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeAll = () => {
    for (const tip of root.querySelectorAll('[data-infotip].is-open')) setOpen(tip, false);
  };

  /*
   * 滑鼠：**游標真的動過**才算 hover。
   *
   * 為什麼不是 mouseover：瀏覽器在版面變動之後會重算「游標底下是誰」，
   * 並且對新出現的元素補送一次 mouseover。所以「面板換一幕、ⓘ 剛好長在
   * 停住不動的游標底下」會被當成 hover —— 玩家什麼都沒做，說明卡就自己
   * 彈出來（實測：把游標停在第二幕 ⓘ 會出現的位置，再從第一幕切過去，
   * 氣泡直接是開著的）。
   *
   * mousemove 只在游標**真的移動**時才發，所以拿它當開啟訊號；
   * 捲動時瀏覽器也會補送座標沒變的 mousemove，用座標比對擋掉。
   * CSS 那邊的 `:hover` 顯示規則一併撤掉了 —— hover 只由這裡決定。
   */
  let lastX = NaN;
  let lastY = NaN;
  root.addEventListener('mousemove', (e) => {
    const moved = e.clientX !== lastX || e.clientY !== lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!moved) return;
    const tip = e.target.closest?.('[data-infotip]');
    if (tip && !tip.classList.contains('is-open')) setOpen(tip, true);
  });
  root.addEventListener('mouseout', (e) => {
    const tip = e.target.closest?.('[data-infotip]');
    if (tip && !tip.contains(e.relatedTarget)) setOpen(tip, false);
  });
  // 鍵盤
  root.addEventListener('focusin', (e) => {
    const tip = e.target.closest?.('[data-infotip]');
    if (tip) setOpen(tip, true);
  });
  root.addEventListener('focusout', (e) => {
    const tip = e.target.closest?.('[data-infotip]');
    if (tip && !tip.contains(e.relatedTarget)) setOpen(tip, false);
  });
  // 觸控／點擊：點一下開，再點一下關
  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-infotip-btn]');
    if (!btn) {
      closeAll();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const tip = btn.closest('[data-infotip]');
    setOpen(tip, !tip.classList.contains('is-open'));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.querySelector('[data-infotip].is-open')) {
      e.stopPropagation();
      closeAll();
    }
  });
}

/* ------------------------------------------------------------------ *
 * 方向鍵在一組東西裡移動焦點（Phase 23）
 *
 * 純鍵盤玩的時候，一組並排的小東西（石碑的選項、快速填入的石籤、
 * 圖鑑裡 68 條技巧）如果只能一個一個 Tab 過去，手指會先放棄。
 * 這支把「一組」變成一站：↑ ↓ ← → 在裡面走，Home / End 直接跳頭尾，
 * Tab 仍然是「離開這一組、去下一個地方」（沿用瀏覽器原本的語意）。
 *
 * 只移動焦點，不改變任何狀態 —— 要選中還是得按 Enter / 空白鍵。
 * ------------------------------------------------------------------ */
export function rovingList(container, itemSelector) {
  if (!container || container.__rovingBound) return;
  container.__rovingBound = true;
  container.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    // 打字中的欄位有自己的游標移動，方向鍵一律讓給它
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dir = -1;
    const jump = e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
    if (!dir && !jump) return;
    /*
     * 只收「真的畫在畫面上」的項目。
     * 這裡不能只看 offsetParent —— 收起來的 <details> 裡面的東西在新版 Chrome
     * 走的是 content-visibility，offsetParent 還在但根本沒被畫出來，
     * focus() 對它是空包彈（焦點會卡在原地）。getClientRects() 才問得出真相。
     */
    const items = Array.from(container.querySelectorAll(itemSelector)).filter((node) => {
      if (node.disabled) return false;
      if (node === document.activeElement) return true;
      return node.offsetParent !== null && node.getClientRects().length > 0;
    });
    if (items.length < 2) return;
    const here = t && t.closest ? t.closest(itemSelector) : null;
    const at = here ? items.indexOf(here) : -1;
    let next;
    if (jump) next = jump === 'first' ? items[0] : items[items.length - 1];
    else if (at < 0) next = items[dir > 0 ? 0 : items.length - 1];
    else next = items[(at + dir + items.length) % items.length];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      next.focus({ preventScroll: false });
    } catch {
      next.focus?.();
    }
  });
}

/** 可被鍵盤 focus 的元素（焦點鎖用）。 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, details, [tabindex]:not([tabindex="-1"])';

/** 面板裡目前可 focus 的元素（看得見的才算）。 */
export function focusableIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((node) => {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    // offsetParent 為 null = 被隱藏（position:fixed 例外，但面板內不會有）
    return node.offsetParent !== null || node === document.activeElement;
  });
}

/**
 * 一層打開的時候，焦點該落在哪一顆上。
 *
 * 跟 `focusableIn` 差一件事：**ⓘ 不算**。焦點落上去等於把說明卡打開
 * （focus 本來就算「打開」），玩家什麼都還沒做就先被塞一張註腳。
 * ⓘ 仍然 Tab 走得到、走到了照樣打得開 —— 這裡只是不讓它當「第一顆」。
 */
export function initialFocusIn(root) {
  return focusableIn(root).filter((node) => !node.closest('[data-infotip]'));
}

/**
 * 建立一個覆蓋層面板（含關閉鈕、Esc 關閉、Tab 焦點鎖）。
 *
 * 無障礙（M6）：
 *   · 開啟時把焦點移進面板，關閉時還給原本的元素
 *   · Tab / Shift+Tab 在面板內循環，不會跑到後面的 3D 畫布
 *   · aria-labelledby 指到標題
 *
 * @param {object} opts
 * @param {boolean} [opts.headBar] 標頭壓成**一條**（關卡用）：
 *   左邊是關卡名 ＋ 緊接在後面、小一號的 NPC（同一條基線）；
 *   右邊是那顆安靜的進度小牌（「撰寫基本功 · 第 12 關 / 共 15 關」）與 Esc。
 *   不給就是原本的三層堆疊（圖鑑 / 設定 / 成就那些一次只講一件事的面板）。
 */
export function createOverlay({
  id,
  title,
  subtitle = '',
  eyebrow = '',
  onClose,
  wide = false,
  headBar = false,
}) {
  const overlay = el('div', `overlay${wide ? ' overlay--wide' : ''}`);
  overlay.id = id;
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${id}-title`);
  // 出口只留一個叉：Esc 那兩個字母是給程式看的，玩家看到 ✕ 就知道這是關閉
  const closeBtn = `<button class="btn btn--ghost panel__close" data-close type="button" aria-label="關閉面板（Esc）"><span aria-hidden="true">✕</span></button>`;
  const head = headBar
    ? `<header class="panel__head panel__head--bar">
        <div class="panel__headline">
          <h2 class="panel__title" id="${esc(id)}-title">${esc(title)}</h2>
          <p class="panel__sub">${esc(subtitle)}</p>
        </div>
        <p class="meta-label meta-label--star panel__eyebrow" data-eyebrow>${esc(eyebrow)}</p>
        ${closeBtn}
      </header>`
    : `<header class="panel__head">
        <div>
          <p class="meta-label meta-label--star panel__eyebrow" data-eyebrow>${esc(eyebrow)}</p>
          <h2 class="panel__title" id="${esc(id)}-title">${esc(title)}</h2>
          <p class="panel__sub">${esc(subtitle)}</p>
        </div>
        ${closeBtn}
      </header>`;
  overlay.innerHTML = `
    <div class="overlay__scrim" data-close></div>
    <section class="panel" tabindex="-1">
      ${head}
      <div class="panel__body"></div>
    </section>
  `;
  const body = overlay.querySelector('.panel__body');
  const panel = overlay.querySelector('.panel');
  const titleEl = overlay.querySelector('.panel__title');
  const subEl = overlay.querySelector('.panel__sub');
  const eyebrowEl = overlay.querySelector('[data-eyebrow]');
  if (!eyebrow) eyebrowEl.hidden = true;
  let restoreFocusTo = null;

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) onClose?.();
  });

  // 焦點鎖：Tab 只在面板內循環
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = focusableIn(panel);
    if (!items.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    root: overlay,
    body,
    panel,
    setTitle(t, s) {
      titleEl.textContent = t;
      if (subEl) subEl.textContent = s || '';
    },
    /**
     * 把捲軸拉回最上面。
     * 面板是重複使用的：不歸零的話，換一份內容進來會停在上一份捲到的位置。
     */
    resetScroll() {
      body.scrollTop = 0;
      panel.scrollTop = 0;
      for (const node of body.querySelectorAll('*')) {
        if (node.scrollTop) node.scrollTop = 0;
      }
    },
    /** 標題上方那行全大寫的小標籤（Awwwards 式的 meta label）。 */
    setEyebrow(text) {
      eyebrowEl.textContent = text || '';
      eyebrowEl.hidden = !text;
    },
    /**
     * @param {object} [opts]
     * @param {Element|null} [opts.focus] 開啟後要 focus 的元素（預設是面板內第一個可 focus 的）
     */
    open(opts = {}) {
      restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      // 強制一次 reflow：讓瀏覽器先算出「還沒開」的樣式（opacity 0 / 位移），
      // 下一幀加上 is-open 才會真的補間。少了這行，第二次之後開啟會直接跳到定位。
      void overlay.offsetWidth;
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        /*
         * 焦點落在「最有用的地方」：內容區的第一個可按的東西。
         * Phase 23 前是標頭那顆關閉鍵 —— 純鍵盤玩的人一開就站在出口上，
         * 每次都要先 Tab 過整個標頭才碰得到內容。內容區沒東西可按時
         * （石碑、刻文那種只有兩三行字的小窗）才退回關閉鍵。
         *
         * ⓘ 不算「第一顆」（見 initialFocusIn）—— 焦點落上去會讓說明卡
         * 自己彈出來，那是面板打開的副作用，不是玩家想看它。
         */
        const target =
          opts.focus || initialFocusIn(body)[0] || initialFocusIn(panel)[0] || panel;
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* 某些元素不支援 options */
          target.focus?.();
        }
      });
    },
    close() {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      if (restoreFocusTo && document.contains(restoreFocusTo)) {
        try {
          restoreFocusTo.focus({ preventScroll: true });
        } catch {
          restoreFocusTo.focus?.();
        }
      }
      restoreFocusTo = null;
    },
    get isOpen() {
      return !overlay.hidden;
    },
  };
}

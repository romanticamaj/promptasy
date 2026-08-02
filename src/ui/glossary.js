/**
 * Promptasy — 術語小卡（Phase 35）
 *
 * 畫面上難免會出現 `prompt` / `JSON` / `temperature` 這種英文字。它們在課程裡
 * 是有出處、有教學的（第二幕的神諭刻文與圖鑑）；但當它只是順口出現在情境或
 * 委託裡的時候，一般人會卡在那個字上，而我們又不想為了一個名詞把整段話撐開。
 *
 * 所以做成一個**彩蛋層**：那個字底下多一條很淡的虛線，滑上去（或點一下）
 * 就浮出一張小卡片 —— 白話一句話 ／ 用途 ／ 一個小到可以照抄的例子。
 *
 * 三條規則（護欄）：
 *   1. **這一層不教技巧、不放連結**（`glossary.json` 也不准有 URL）。
 *      它跟 `coach.json` 同性質，是扶手不是課本；真正的教學與官方出處
 *      仍然只在第二幕與圖鑑（CLAUDE.md 護欄 2）。
 *   2. **只標記玩家在「讀」的字**：輸入框、按鈕、鍵帽、標題、官方出處連結
 *      一律不碰（見 SKIP_TAGS / SKIP_SELECTOR）——標記進按鈕會把可按的東西
 *      弄髒，標記進 textarea 更是直接毀掉玩家打的字。
 *   3. **一個面板一個字只標第一次**。整段話裡每個 `prompt` 都畫線＝雜訊。
 *
 * 效能：一次 `annotate()` ＝ 對那一塊 DOM 走一次 TreeWalker，沒有
 * MutationObserver、沒有輪詢。面板重繪時由呼叫端再叫一次就好。
 *
 * 鍵盤（WORLD.md §3.1）：標記**刻意不進 Tab 順序**。理由寫在 WORLD.md §3.7 ——
 * 一段情境可能有五、六個標記，全部塞進焦點鏈會把「開一層 → 焦點落在內容區
 * 第一個可按的東西」（Phase 23）整個打亂，而這一層**沒有任何進度依賴它**：
 * 同一個名詞在圖鑑裡有完整的中文說明與官方出處，那條路純鍵盤走得到。
 */

/** 這些標籤裡面的字一律不標記（可按的、可打字的、鍵帽、程式碼、標題）。 */
const SKIP_TAGS = new Set([
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'BUTTON',
  'A',
  'KBD',
  'CODE',
  'SCRIPT',
  'STYLE',
  'SUMMARY',
  'LABEL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

/** 這些東西（含它們底下的一切）也不標記。 */
const SKIP_SELECTOR = '[data-no-gloss], .gloss, .meta-label, .src, .glosscard';

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 前後要不要加 \b：只有在該端點是「單字字元」時才有意義。 */
function boundedPattern(word) {
  const body = escapeRe(word);
  const head = /^[A-Za-z0-9_]/.test(word) ? '\\b' : '';
  const tail = /[A-Za-z0-9_]$/.test(word) ? '\\b' : '';
  return `${head}${body}${tail}`;
}

export function createGlossary(file) {
  const terms = Array.isArray(file?.terms) ? file.terms : [];
  /** 比對用的表：每個寫法 → 那一條術語。長的排前面（system prompt 要贏過 prompt）。 */
  const byId = new Map(terms.map((t) => [t.id, t]));
  const words = [];
  for (const t of terms) {
    for (const w of [t.term, ...(t.aliases || [])]) {
      if (w) words.push({ w, id: t.id });
    }
  }
  words.sort((a, b) => b.w.length - a.w.length);
  const lookupWord = new Map(words.map((x) => [x.w.toLowerCase(), x.id]));
  const matcher = words.length
    ? new RegExp(`(${words.map((x) => boundedPattern(x.w)).join('|')})`, 'gi')
    : null;

  /* ---------------------------------------------------------------- 卡片 */
  let card = null;
  let openFor = null;

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.className = 'glosscard';
    card.id = 'glosscard';
    card.setAttribute('role', 'tooltip');
    card.hidden = true;
    card.innerHTML = `
      <p class="glosscard__head"><b data-gc-term></b><i data-gc-zh></i></p>
      <p class="glosscard__plain" data-gc-plain></p>
      <p class="glosscard__row"><span class="glosscard__k">用途</span><span data-gc-use></span></p>
      <p class="glosscard__row glosscard__row--ex"><span class="glosscard__k">例</span><code data-gc-ex></code></p>
    `;
    document.body.appendChild(card);
    return card;
  }

  function place(marker) {
    const r = marker.getBoundingClientRect();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const pad = 8;
    let left = Math.round(r.left + r.width / 2 - cw / 2);
    left = Math.max(pad, Math.min(left, window.innerWidth - cw - pad));
    let top = Math.round(r.bottom + pad);
    // 下面塞不下就翻到上面（面板底部的字也看得到整張卡）
    if (top + ch > window.innerHeight - pad) {
      const above = Math.round(r.top - ch - pad);
      top = above >= pad ? above : window.innerHeight - ch - pad;
    }
    // 最後一道保險：不管那個字在哪裡，整張卡一定留在畫面內
    top = Math.max(pad, Math.min(top, window.innerHeight - ch - pad));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function open(marker) {
    const entry = byId.get(marker.getAttribute('data-gloss'));
    if (!entry) return;
    ensureCard();
    if (openFor && openFor !== marker) openFor.classList.remove('is-on');
    card.querySelector('[data-gc-term]').textContent = entry.term;
    card.querySelector('[data-gc-zh]').textContent = entry.zh || '';
    card.querySelector('[data-gc-plain]').textContent = entry.plain || '';
    card.querySelector('[data-gc-use]').textContent = entry.use || '';
    card.querySelector('[data-gc-ex]').textContent = entry.example || '';
    card.hidden = false;
    // 先量得到才排得準（hidden 的時候寬高都是 0）
    void card.offsetWidth;
    card.classList.add('is-on');
    place(marker);
    marker.classList.add('is-on');
    marker.setAttribute('aria-describedby', 'glosscard');
    openFor = marker;
  }

  function close() {
    if (!openFor) return;
    openFor.classList.remove('is-on');
    openFor.removeAttribute('aria-describedby');
    openFor = null;
    if (card) {
      card.classList.remove('is-on');
      card.hidden = true;
    }
  }

  /* ---------------------------------------------------------------- 事件 */
  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('mouseover', (e) => {
      const m = e.target?.closest?.('[data-gloss]');
      if (m) open(m);
    });
    document.addEventListener('mouseout', (e) => {
      const m = e.target?.closest?.('[data-gloss]');
      if (!m || m !== openFor) return;
      const to = e.relatedTarget;
      if (to && (m.contains(to) || card?.contains(to))) return;
      close();
    });
    // 觸控／點擊：點標記＝開關；點別的地方＝收起來
    document.addEventListener('click', (e) => {
      const m = e.target?.closest?.('[data-gloss]');
      if (!m) {
        if (!e.target?.closest?.('.glosscard')) close();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (openFor === m) close();
      else open(m);
    });
    // Esc 先收小卡（不要順手把整個面板關掉）
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && openFor) {
          e.stopPropagation();
          close();
        }
      },
      true
    );
    window.addEventListener('resize', close);
    // 面板捲動時卡片會脫離那個字 —— 直接收起來比追著跑誠實
    document.addEventListener('scroll', close, true);
  }

  /* -------------------------------------------------------------- 標記 */
  function shouldSkip(node) {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (SKIP_TAGS.has(p.tagName)) return true;
      if (p.matches?.(SKIP_SELECTOR)) return true;
    }
    return false;
  }

  /**
   * 把 root 底下的術語標記起來（同一次呼叫裡，一個術語只標第一次）。
   * @param {Element|null} root
   * @returns {number} 標了幾個
   */
  function annotate(root) {
    if (!root || !matcher) return 0;
    bind();
    const seen = new Set();
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n);

    let marked = 0;
    for (const node of targets) {
      const text = node.nodeValue;
      matcher.lastIndex = 0;
      let m;
      let cursor = 0;
      let frag = null;
      while ((m = matcher.exec(text))) {
        const id = lookupWord.get(m[0].toLowerCase());
        if (!id || seen.has(id)) continue;
        seen.add(id);
        frag = frag || document.createDocumentFragment();
        if (m.index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, m.index)));
        const mark = document.createElement('span');
        mark.className = 'gloss';
        mark.setAttribute('data-gloss', id);
        mark.textContent = m[0];
        frag.appendChild(mark);
        cursor = m.index + m[0].length;
        marked += 1;
      }
      if (frag) {
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        node.parentNode.replaceChild(frag, node);
      }
    }
    return marked;
  }

  /** 對每一個符合 selector 的區塊各標一次（例如圖鑑：一條技巧算一個面板）。 */
  function annotateEach(root, selector) {
    if (!root) return 0;
    let n = 0;
    for (const block of root.querySelectorAll(selector)) n += annotate(block);
    return n;
  }

  return {
    annotate,
    annotateEach,
    close,
    get card() {
      return card;
    },
    get openTerm() {
      return openFor ? openFor.getAttribute('data-gloss') : null;
    },
    lookup: (id) => byId.get(id) || null,
    get terms() {
      return terms;
    },
    get count() {
      return terms.length;
    },
  };
}

/**
 * 全域共用的那一份（卡片只需要一張）。
 *
 * 資料**不在這裡 import** —— 專案的慣例是所有 JSON 都由 `main.js` 帶進來
 * （這幾支模組同時會被 node 的測試直接 import，node 不吃直接的 JSON import）。
 * 所以開機時由 main.js 呼叫一次 `glossary.install(glossaryFile)`；
 * 沒裝資料的時候 `annotate()` 安靜地什麼都不做（離線降級，不丟例外）。
 */
let impl = createGlossary({ terms: [] });
export const glossary = {
  install(file) {
    impl.close();
    impl = createGlossary(file);
    return impl;
  },
  annotate: (root) => impl.annotate(root),
  annotateEach: (root, selector) => impl.annotateEach(root, selector),
  close: () => impl.close(),
  lookup: (id) => impl.lookup(id),
  get card() {
    return impl.card;
  },
  get openTerm() {
    return impl.openTerm;
  },
  get terms() {
    return impl.terms;
  },
  get count() {
    return impl.count;
  },
};

export default createGlossary;

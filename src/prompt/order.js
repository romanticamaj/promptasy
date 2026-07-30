/**
 * PromptArcade — 排序刻印（把石版排成正確的順序）
 *
 * Phase 27：石碑刻印（一段一段「選」）教得了「這一段該寫什麼」，
 * 但教不了「**這幾段該照什麼次序排**」——而次序本身就是官方文件講了很多次的技巧
 * （長輸入時資料在前、問題在後；規則區放最上面優先度最高）。
 * 所以多一種作答方式：石版已經刻好了，你要做的是把它們**排順**。
 *
 * 三條規則，跟石碑刻印同源：
 *   1. **不會失敗**（WORLD.md §3.5）。石版可以一直搬來搬去，沒有「送出後才發現排錯」
 *      這種事 —— 排到對了，手掌印才會浮出來。排錯不扣分、不跳失敗面板。
 *   2. **鍵盤走得完**（WORLD.md §3.1 鐵則）。焦點停在一片石版上：
 *      `Enter` 拿起來 → `↑` `↓` 搬 → `Enter` 放下；沒拿起來時 `↑` `↓` 只移動焦點。
 *      每一次動作都用 aria-live 講出來（「拿起：問題那一行。第 3 片，共 3 片。」）。
 *   3. **評分還是同一支離線引擎**。排好的整段文字就是要呈給神諭的 prompt
 *      （護欄 3：玩家拿到的評價與圖鑑完全沒有另一套規則）。
 *
 * 這個模組只管「排石版」：DOM、拖曳、鍵盤、位置對不對。
 * 評分、結果面板、XP 一律回到 src/prompt/console.js。
 */
import { esc } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';

export { PALM_HOLD_MS };

/** 排對一片時噴出幾顆石屑。 */
const DUST_COUNT = 8;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.embedded] 嵌在別的作答方式裡（神諭工坊的第三步）：不畫石碑、不畫手掌印
 * @param {(info:{piece:object})=>void} [opts.onLift]     拿起一片
 * @param {(info:{piece:object,index:number,right:number,total:number,text:string})=>void} [opts.onSettle] 放下一片
 * @param {(info:{text:string})=>void} [opts.onComplete]  全部排對了
 * @param {(info:{text:string})=>void} [opts.onPress]     手掌按下去
 * @param {(msg:string)=>void} [opts.onAnnounce]          給外面的人知道剛剛宣告了什麼（測試用）
 */
export function createOrderBoard({
  embedded = false,
  onLift,
  onSettle,
  onComplete,
  onPress,
  onAnnounce,
} = {}) {
  /** 這一關的排序資料（flows.json 的 orderFlow）。 */
  let flow = null;
  /** 目前的排法（一串 piece id）。 */
  let arrangement = [];
  /** 正在被「拿起來」的那一片（純鍵盤路徑）。 */
  let held = null;
  /** 正在被拖的那一片（指標路徑）。 */
  let dragging = null;
  let dragOffset = 0;
  /** 排對之後就鎖住（跟石碑刻上去就不能撤回是同一個道理）。 */
  let locked = false;
  /** id → 那一片石版的 <li>（只建一次，之後只搬不重建）。 */
  const nodes = new Map();

  const root = document.createElement('div');
  root.className = `orderboard${embedded ? ' orderboard--embedded' : ''}`;
  root.innerHTML = `
    ${
      embedded
        ? ''
        : `<div class="stele stele--slips" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">排序中的 prompt</p>
      <ol class="slips" data-slips></ol>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>`
    }
    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      ${embedded ? '<ol class="slips slips--bare" data-slips></ol>' : ''}
      <p class="carve__tip" data-tip>停在一片石版上按 <kbd>Enter</kbd> 拿起來，<kbd>↑</kbd> <kbd>↓</kbd> 搬到別的位置，再按 <kbd>Enter</kbd> 放下。也可以直接用滑鼠拖。排錯不會失敗，搬回來就好。</p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const slipsEl = root.querySelector('[data-slips]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const liveEl = root.querySelector('[data-live]');

  const palm = embedded
    ? null
    : createPalm({
        lead: '石版排順了。把手掌按上去，讓神諭聽見。',
        ready: () => isDone(),
        onFire: () => onPress?.({ text: text() }),
      });
  if (palm) root.appendChild(palm.root);

  /* ------------------------------------------------------------ 資料 */

  function pieceOf(id) {
    return (flow && flow.pieces.find((p) => p.id === id)) || null;
  }

  /** 排好的整段文字 —— 這就是要送去離線評分的 prompt。 */
  function text() {
    return arrangement
      .map((id) => (pieceOf(id) || {}).text || '')
      .filter(Boolean)
      .join('\n');
  }

  /** 這一片現在站對位置了嗎。 */
  function isRight(id) {
    return flow ? flow.order.indexOf(id) === arrangement.indexOf(id) : false;
  }

  function rightCount() {
    return arrangement.filter(isRight).length;
  }

  function isDone() {
    return Boolean(flow) && arrangement.length === flow.order.length && arrangement.every(isRight);
  }

  function announce(msg) {
    liveEl.textContent = msg;
    onAnnounce?.(msg);
  }

  /* ------------------------------------------------------------ 動畫 */

  function dust() {
    if (!dustEl || prefersReduced()) return;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'dust';
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 54}px`);
      bit.style.setProperty('--y', `${-14 - Math.random() * 38}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 200}deg`);
      bit.style.setProperty('--d', `${380 + Math.random() * 340}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1.0}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /**
   * 搬動的那一下要有重量：先記下每片的位置，重畫之後把它們「拉回原位」再放開
   * （FLIP）。`prefers-reduced-motion` 下整段跳過 —— 關掉的是「動」，不是「回應」。
   */
  function withSlide(mutate) {
    if (prefersReduced()) {
      mutate();
      return;
    }
    const before = new Map();
    for (const li of slipsEl.querySelectorAll('.slip')) {
      before.set(li.getAttribute('data-slip-id'), li.getBoundingClientRect().top);
    }
    mutate();
    for (const li of slipsEl.querySelectorAll('.slip')) {
      const id = li.getAttribute('data-slip-id');
      const was = before.get(id);
      if (was == null) continue;
      const dy = was - li.getBoundingClientRect().top;
      if (!dy) continue;
      li.style.transition = 'none';
      li.style.transform = `translate3d(0, ${dy}px, 0)`;
      requestAnimationFrame(() => {
        li.style.transition = '';
        li.style.transform = '';
      });
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  /**
   * 石版節點只在載入時建立一次，之後**只搬不重建**。
   *
   * 這不是效能考量，是無障礙的硬需求：拿在手上的那一片如果被 innerHTML 重建，
   * 鍵盤焦點會在拿起的瞬間掉回頁首，後面的方向鍵就全部落空
   * （WORLD.md §3.1「焦點只准停在真的畫得出來的東西上」的另一面）。
   */
  function buildList() {
    nodes.clear();
    slipsEl.innerHTML = '';
    if (!flow) return;
    for (const [i, p] of flow.pieces.entries()) {
      const li = document.createElement('li');
      li.className = 'slip';
      li.setAttribute('data-slip-id', p.id);
      li.style.setProperty('--i', String(i));
      const body = String(p.text)
        .split('\n')
        .map((l) => `<span class="slip__line">${esc(l)}</span>`)
        .join('');
      li.innerHTML = `<button class="slip__grip" type="button" data-slip="${esc(p.id)}" aria-pressed="false">
          <span class="slip__rank" aria-hidden="true"></span>
          <span class="slip__body">
            <b class="slip__label">${esc(p.label)}</b>
            <span class="slip__text">${body}</span>
          </span>
          <span class="slip__mark" aria-hidden="true">·</span>
        </button>`;
      nodes.set(p.id, li);
      slipsEl.appendChild(li);
    }
  }

  /** 把節點照目前的排法搬好，並更新位次、刻記、狀態與進度。 */
  function render() {
    if (!flow) {
      slipsEl.innerHTML = '';
      nodes.clear();
      return;
    }
    const total = arrangement.length;
    for (const [i, id] of arrangement.entries()) {
      const li = nodes.get(id);
      if (!li) continue;
      if (slipsEl.children[i] !== li) slipsEl.insertBefore(li, slipsEl.children[i] || null);
      const right = isRight(id);
      li.classList.toggle('is-right', right);
      li.classList.toggle('is-held', held === id);
      li.classList.toggle('is-dragging', dragging === id);
      const btn = li.querySelector('[data-slip]');
      const p = pieceOf(id);
      btn.setAttribute('aria-pressed', held === id ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        `${p.label}，第 ${i + 1} 片，共 ${total} 片${right ? '，位置對了' : ''}。按 Enter 拿起來搬動。`
      );
      li.querySelector('.slip__rank').textContent = String(i + 1);
      li.querySelector('.slip__mark').textContent = right ? '✓' : '·';
    }
    const want = flow.order.length;
    progressEl.textContent = isDone() ? `${want} 片全部排對了` : `位置對了 ${rightCount()} / ${want} 片`;
    askEl.textContent = flow.ask || '';
    if (steleEl) steleEl.classList.toggle('is-full', isDone());
    if (palm) palm.show(isDone());
  }

  function focusSlip(id) {
    const btn = slipsEl.querySelector(`[data-slip="${CSS.escape(id)}"]`);
    if (!btn) return;
    try {
      btn.focus({ preventScroll: true });
    } catch {
      btn.focus?.();
    }
  }

  /* ------------------------------------------------------------ 搬動 */

  /**
   * 把某一片搬到某個位置。
   * @returns {boolean} 真的動了嗎
   */
  function moveTo(id, index) {
    if (!flow || locked) return false;
    const from = arrangement.indexOf(id);
    const to = Math.max(0, Math.min(arrangement.length - 1, index));
    if (from < 0 || from === to) return false;
    withSlide(() => {
      arrangement.splice(from, 1);
      arrangement.splice(to, 0, id);
      render();
    });
    return true;
  }

  /** 放下一片：檢查位置、給回饋、看看是不是全排對了。 */
  function settle(id, { silent = false } = {}) {
    const p = pieceOf(id);
    if (!p) return;
    const at = arrangement.indexOf(id);
    const right = isRight(id);
    if (right && !silent) dust();
    if (!silent) {
      announce(
        `放下：${p.label}。第 ${at + 1} 片，共 ${arrangement.length} 片。${
          right ? '位置對了。' : '這個位置還不對，可以再搬。'
        }`
      );
      onSettle?.({ piece: p, index: at, right: rightCount(), total: arrangement.length, text: text() });
    }
    if (isDone() && !locked) {
      locked = true;
      render();
      onComplete?.({ text: text() });
      if (palm) {
        try {
          palm.button.focus({ preventScroll: true });
        } catch {
          palm.button.focus?.();
        }
      }
    }
  }

  function lift(id) {
    if (locked) return;
    const p = pieceOf(id);
    if (!p) return;
    held = id;
    render();
    focusSlip(id);
    announce(
      `拿起：${p.label}。第 ${arrangement.indexOf(id) + 1} 片，共 ${arrangement.length} 片。用上下鍵搬動，再按 Enter 放下。`
    );
    onLift?.({ piece: p });
  }

  function drop() {
    if (!held) return;
    const id = held;
    held = null;
    render();
    focusSlip(id);
    settle(id);
  }

  /* ------------------------------------------------------------ 鍵盤 */

  root.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const btn = e.target && e.target.closest ? e.target.closest('[data-slip]') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-slip');

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      if (held === id) drop();
      else if (!held) lift(id);
      return;
    }
    // 拿起來的時候 Esc 是「放回原地」，不是關掉整層面板（第二次按才會關）
    if (e.key === 'Escape' && held) {
      e.preventDefault();
      e.stopPropagation();
      const p = pieceOf(held);
      held = null;
      render();
      focusSlip(id);
      announce(`放回原地：${p ? p.label : ''}。`);
      return;
    }
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dir = -1;
    else if (e.key === 'Home') dir = 'first';
    else if (e.key === 'End') dir = 'last';
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();

    const at = arrangement.indexOf(id);
    if (held === id) {
      // 拿著的時候：方向鍵搬的是石版本身
      const to =
        dir === 'first' ? 0 : dir === 'last' ? arrangement.length - 1 : at + dir;
      if (to < 0 || to >= arrangement.length) return;
      if (moveTo(id, to)) {
        focusSlip(id);
        const p = pieceOf(id);
        announce(`${p ? p.label : ''} 移到第 ${to + 1} 片，共 ${arrangement.length} 片。`);
      }
      return;
    }
    // 沒拿的時候：方向鍵只是在石版之間走焦點
    const step = dir === 'first' ? -at : dir === 'last' ? arrangement.length - 1 - at : dir;
    const next = arrangement[(at + step + arrangement.length) % arrangement.length];
    if (next) focusSlip(next);
  });

  /* ------------------------------------------------------------ 拖曳 */

  function indexAtY(clientY) {
    const rows = Array.from(slipsEl.querySelectorAll('.slip'));
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return rows.length - 1;
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const to = indexAtY(e.clientY);
    if (to !== arrangement.indexOf(dragging)) moveTo(dragging, to);
    const li = slipsEl.querySelector(`[data-slip-id="${CSS.escape(dragging)}"]`);
    if (li && !prefersReduced()) {
      const r = li.getBoundingClientRect();
      li.style.setProperty('--lift', `${Math.round(e.clientY - r.top - dragOffset)}px`);
    }
  }

  function endDrag() {
    if (!dragging) return;
    const id = dragging;
    dragging = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    const li = slipsEl.querySelector(`[data-slip-id="${CSS.escape(id)}"]`);
    if (li) li.style.removeProperty('--lift');
    render();
    settle(id);
  }

  slipsEl.addEventListener('pointerdown', (e) => {
    if (locked) return;
    const btn = e.target && e.target.closest ? e.target.closest('[data-slip]') : null;
    if (!btn) return;
    // 滑鼠只認左鍵；觸控與筆一律放行
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragging = btn.getAttribute('data-slip');
    held = null;
    const li = btn.closest('.slip');
    dragOffset = li ? e.clientY - li.getBoundingClientRect().top : 0;
    render();
    focusSlip(dragging);
    const p = pieceOf(dragging);
    if (p) onLift?.({ piece: p });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });

  const api = {
    root,
    /** 開啟面板時焦點落在哪裡。 */
    get focusTarget() {
      return slipsEl.querySelector('[data-slip]') || (palm ? palm.button : null);
    },
    /** 第四幕的鏡頭要落在哪裡。 */
    get palmTarget() {
      return palm ? palm.button : null;
    },
    /** 排好的整段文字（要送去離線評分的 prompt）。 */
    get text() {
      return text();
    },
    get done() {
      return isDone();
    },
    get fired() {
      return palm ? palm.fired : false;
    },
    /** 目前的排法（測試用）。 */
    get arrangement() {
      return arrangement.slice();
    },
    /** 正確答案（測試與工坊內部用）。 */
    get correctOrder() {
      return flow ? flow.order.slice() : [];
    },
    /** 現在被拿在手上的那一片（測試用）。 */
    get held() {
      return held;
    },
    /** 排對幾片 / 總共幾片（HUD 與測試用）。 */
    get progress() {
      return { right: rightCount(), total: flow ? flow.order.length : 0 };
    },
    get ask() {
      return flow ? flow.ask || '' : '';
    },
    /** 最近一次宣告（aria-live 的內容，測試用）。 */
    get announcement() {
      return liveEl.textContent;
    },
    lift,
    drop,
    moveTo,
    /** 直接排成某個順序（測試用）。 */
    arrange(ids) {
      if (!flow) return false;
      const valid = ids.filter((id) => pieceOf(id));
      if (valid.length !== flow.order.length) return false;
      arrangement = valid.slice();
      render();
      settle(arrangement[0], { silent: true });
      return true;
    },
    /** 直接觸發手掌印（測試用，不必真的按住 600ms）。 */
    press: () => (palm ? palm.press() : false),
    /** 換一關（或重來一次）。 */
    load(nextFlow) {
      const okFlow =
        nextFlow &&
        Array.isArray(nextFlow.pieces) &&
        nextFlow.pieces.length >= 2 &&
        Array.isArray(nextFlow.order) &&
        nextFlow.order.length === nextFlow.pieces.length;
      flow = okFlow ? nextFlow : null;
      arrangement = flow ? flow.pieces.map((p) => p.id) : [];
      held = null;
      dragging = null;
      locked = false;
      if (palm) palm.reset();
      if (steleEl) steleEl.classList.remove('is-full', 'is-ignited');
      if (dustEl) dustEl.innerHTML = '';
      liveEl.textContent = '';
      root.hidden = !flow;
      buildList();
      render();
      return Boolean(flow);
    },
    reopen() {
      return flow ? api.load(flow) : false;
    },
  };

  return api;
}

export default createOrderBoard;

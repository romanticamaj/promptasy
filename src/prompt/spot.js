/**
 * Promptasy — 點碑（spot-the-flaw）
 *
 * 課程 v2 · Phase B 的第二種新題型。改碑（fix.js）已經先幫你畫好「這幾句要改」，
 * 但真正難的一步是**自己看出哪一句有問題**——這一區有兩座神廟教的就是這件事
 * （只會點頭的信差：哪幾句沒有動詞；喊破喉嚨的擴音石：哪幾句沒有資訊量）。
 *
 * 所以石碑上攤著一疊石籤，每一片是委託裡的一句話。你把有問題的那幾片**點起來**：
 *   · 點對了 → 那一片翻面，露出改寫後的版本（或直接被拿掉），石碑刻一下
 *   · 點到不能動的那一句 → 石籤自己彈回來，就地長出一句白話教學（**不扣分**）
 *   · 有問題的還沒點完 → 手掌印根本不會出現（「送出後才發現漏了」不存在）
 *
 * 三條規則跟另外三種題型同源（WORLD.md §3.3b）：不會失敗、鍵盤走得完、
 * 送出的是同一段文字走同一支離線引擎（護欄 3）。
 *
 * ## 鍵位
 *   `↑` `↓`（`←` `→` 同義） 在石籤之間走 · `Home` `End` 跳頭尾
 *   `Enter` / 空白鍵        點起來 · 再按一次放回去
 *   `Esc`                   點起來的還原成原句（沒有點起來的才收起這一層）
 *   按住 `Enter`（手掌上）  呈給神諭
 *
 * 這個模組只管「點石籤」：DOM、焦點、翻面狀態、組出來的文字。
 * 評分、結果面板、XP 一律回到 src/prompt/console.js。
 */
import { esc } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';

export { PALM_HOLD_MS };

const DUST_COUNT = 6;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 這一疊石籤合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。 */
export function isSpotFlow(data) {
  if (!data || !Array.isArray(data.slips) || data.slips.length < 3) return false;
  const bad = data.slips.filter((s) => s && s.bad);
  const good = data.slips.filter((s) => s && !s.bad);
  if (!bad.length || !good.length) return false;
  return data.slips.every((s) => s && typeof s.id === 'string' && typeof s.text === 'string');
}

/**
 * @param {object} opts
 * @param {(info:{slip:object,right:number,total:number,text:string})=>void} [opts.onSpot]  點對一片
 * @param {(info:{slip:object,feedback:string})=>void} [opts.onReject] 點到不能動的那一句
 * @param {(info:{slip:object})=>void} [opts.onRestore] 放回去
 * @param {(info:{text:string})=>void} [opts.onComplete] 全部點出來了
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去
 * @param {()=>void} [opts.onTap]                        石籤被按下去那一下（純聲音）
 * @param {(msg:string)=>void} [opts.onAnnounce]         aria-live 講了什麼（測試用）
 */
export function createSpotBoard({
  onSpot,
  onReject,
  onRestore,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  /** 這一關的石籤（flows.json 的 spotFlow）。 */
  let flow = null;
  /** 已經被點起來的石籤 id。 */
  const marked = new Set();

  const root = document.createElement('div');
  root.className = 'spotboard';
  root.innerHTML = `
    <div class="stele stele--slips" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">攤在檯上的石籤</p>
      <ol class="spots" data-spots></ol>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <p class="carve__tip">
        <kbd>↑</kbd> <kbd>↓</kbd> 在石籤之間走，<kbd>Enter</kbd> 把有問題的那一片點起來，
        <kbd>Esc</kbd> 放回去。點錯不會失敗，石籤只會自己彈回來。
      </p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const spotsEl = root.querySelector('[data-spots]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const liveEl = root.querySelector('[data-live]');

  const palm = createPalm({
    lead: '有問題的都挑出來了。把手掌按上去，讓神諭聽見。',
    ready: () => isDone(),
    onFire: () => {
      steleEl.classList.add('is-ignited');
      onPress?.({ text: text() });
    },
  });
  root.appendChild(palm.root);

  /* ------------------------------------------------------------ 資料 */

  const slips = () => (flow ? flow.slips : []);
  const badOnes = () => slips().filter((s) => s.bad);
  const isDone = () =>
    Boolean(flow) && badOnes().every((s) => marked.has(s.id)) && marked.size === badOnes().length;

  /** 這一片現在念出來是什麼（點起來的壞句子換成改寫版，沒有改寫版就是被拿掉）。 */
  function currentText(s) {
    if (!marked.has(s.id)) return s.text;
    return typeof s.replace === 'string' ? s.replace : '';
  }

  /** 石碑上現在的整段文字 —— 這就是要送去離線評分的 prompt。 */
  function text() {
    return slips()
      .map(currentText)
      .filter((t) => String(t || '').trim().length > 0)
      .join('\n');
  }

  function say(msg) {
    liveEl.textContent = msg;
    onAnnounce?.(msg);
  }

  /* ------------------------------------------------------------ 動畫 */

  function thud(kind = 'stamp') {
    steleEl.classList.remove('is-stamp', 'is-reject');
    void steleEl.offsetWidth;
    steleEl.classList.add(kind === 'reject' ? 'is-reject' : 'is-stamp');
    if (prefersReduced() || kind === 'reject') return;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'dust';
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 46}px`);
      bit.style.setProperty('--y', `${-14 - Math.random() * 36}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 180}deg`);
      bit.style.setProperty('--d', `${380 + Math.random() * 320}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  function renderSlip(s, i) {
    const on = marked.has(s.id);
    const replaced = on && typeof s.replace === 'string' && s.replace.trim().length > 0;
    const body = on
      ? replaced
        ? esc(s.replace)
        : '<i class="spot__gone">（這一句被拿掉了）</i>'
      : esc(s.text);
    return `<li class="spot${on ? ' is-marked' : ''}" style="--i:${i}">
      <button class="spot__grip" type="button" data-spot="${esc(s.id)}" aria-pressed="${on ? 'true' : 'false'}">
        <span class="spot__mark" aria-hidden="true">${on ? '✦' : '○'}</span>
        <span class="spot__body">
          ${on && replaced ? `<span class="spot__was">${esc(s.text)}</span>` : ''}
          <span class="spot__text">${body}</span>
        </span>
      </button>
      <span class="spot__fb" data-spot-fb="${esc(s.id)}" hidden></span>
    </li>`;
  }

  function render() {
    if (!flow) {
      spotsEl.innerHTML = '';
      return;
    }
    spotsEl.innerHTML = slips().map(renderSlip).join('');
    const total = badOnes().length;
    const right = badOnes().filter((s) => marked.has(s.id)).length;
    progressEl.textContent = `挑出 ${right} / ${total} 句`;
    askEl.textContent = isDone() ? '有問題的都挑出來了。' : flow.ask || '哪幾句有問題？';
    palm.show(isDone());
    steleEl.classList.toggle('is-full', isDone());
  }

  /* ------------------------------------------------------------ 焦點 */

  function gripOf(id) {
    return spotsEl.querySelector(`[data-spot="${CSS.escape(String(id))}"]`);
  }

  function focusEl(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus?.();
    }
  }

  /* ------------------------------------------------------------ 動作 */

  /** 點一片石籤。壞的 → 翻面；不能動的 → 彈回來 ＋ 就地教學（不扣分）。 */
  function toggle(id) {
    const s = slips().find((x) => x.id === id);
    if (!s || palm.fired) return null;
    onTap?.();

    if (marked.has(s.id)) {
      marked.delete(s.id);
      render();
      focusEl(gripOf(s.id));
      say('放回去了，這一句恢復原樣。');
      onRestore?.({ slip: s });
      return { restored: true };
    }

    if (!s.bad) {
      thud('reject');
      const fb = spotsEl.querySelector(`[data-spot-fb="${CSS.escape(String(s.id))}"]`);
      const msg = s.why || '這一句要留著 —— 它帶著真正的資訊。';
      if (fb) {
        fb.textContent = msg;
        fb.hidden = false;
      }
      const li = gripOf(s.id) && gripOf(s.id).closest('.spot');
      if (li) {
        li.classList.remove('is-bounce');
        void li.offsetWidth;
        li.classList.add('is-bounce');
      }
      say(msg);
      onReject?.({ slip: s, feedback: msg });
      return { correct: false, feedback: msg };
    }

    marked.add(s.id);
    render();
    thud('stamp');
    const total = badOnes().length;
    const right = badOnes().filter((x) => marked.has(x.id)).length;
    say(`挑出來了。${right} / ${total} 句。`);
    onSpot?.({ slip: s, right, total, text: text() });
    if (isDone()) {
      onComplete?.({ text: text() });
      focusEl(palm.button);
    } else {
      focusEl(gripOf(s.id));
    }
    return { correct: true };
  }

  /* ------------------------------------------------------------ 事件 */

  root.addEventListener('click', (e) => {
    const grip = e.target && e.target.closest ? e.target.closest('[data-spot]') : null;
    if (!grip) return;
    toggle(grip.getAttribute('data-spot'));
  });

  root.addEventListener('keydown', (e) => {
    if (!flow || palm.fired) return;
    if (e.target === palm.button) return;
    const grip = e.target && e.target.closest ? e.target.closest('[data-spot]') : null;

    if (e.key === 'Escape') {
      const id = grip && grip.getAttribute('data-spot');
      if (id && marked.has(id)) {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }
      return; // 沒有點起來的東西可以放回去 → 讓它冒泡出去收起這一層
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      if (!grip) return;
      e.preventDefault();
      toggle(grip.getAttribute('data-spot'));
      return;
    }

    const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!nav.includes(e.key)) return;
    const list = slips();
    if (!list.length) return;
    e.preventDefault();
    const currentId = grip ? grip.getAttribute('data-spot') : null;
    const at = Math.max(0, list.findIndex((s) => s.id === currentId));
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const to =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length;
    focusEl(gripOf(list[to].id));
  });

  const api = {
    root,
    get focusTarget() {
      return spotsEl.querySelector('[data-spot]') || palm.button;
    },
    get palmTarget() {
      return palm.button;
    },
    get text() {
      return text();
    },
    get done() {
      return isDone();
    },
    get fired() {
      return palm.fired;
    },
    /** 挑出幾片 / 總共幾片有問題（HUD 與測試用）。 */
    get progress() {
      return {
        right: badOnes().filter((s) => marked.has(s.id)).length,
        total: badOnes().length,
      };
    },
    get ask() {
      return flow ? flow.ask || '' : '';
    },
    /** 目前點起來的 id（測試用）。 */
    get marked() {
      return [...marked];
    },
    get announcement() {
      return liveEl.textContent;
    },
    toggle,
    press: () => palm.press(),
    load(nextFlow) {
      flow = isSpotFlow(nextFlow) ? nextFlow : null;
      marked.clear();
      palm.reset();
      steleEl.classList.remove('is-ignited', 'is-full', 'is-stamp', 'is-reject');
      dustEl.innerHTML = '';
      liveEl.textContent = '';
      root.hidden = !flow;
      render();
      return Boolean(flow);
    },
    reopen() {
      return flow ? api.load(flow) : false;
    },
  };

  return api;
}

export default createSpotBoard;

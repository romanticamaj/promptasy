/**
 * Promptasy — 合尺（constraint satisfaction）
 *
 * 課程 v2 · Phase D 的新題型，也是**唯一一種把「即時預檢」升格成舞台**的題型。
 *
 * 委託人不是要你「照順序刻」，而是遞給你一把一把的**尺**：每一把尺上明明白白
 * 寫著它要量什麼（P9 完全資訊）。檯上攤著一疊石片，你把要用的挑起來拼成委託，
 * 尺會**當場**亮或不亮 —— 亮不亮是**真的離線檢查器**跑出來的（護欄 3：
 * 這裡沒有第二套評分邏輯，`measure()` 呼叫的就是 rubric 在用的 `runCheck()`）。
 *
 *   · 挑一片上去 → 每一把尺立刻重量一次，合尺的亮起來
 *   · 挑錯（或挑太多）→ 某一把尺會**暗回去**，旁邊就地寫出它為什麼不合（不扣分）
 *   · 全部的尺都合了 → 手掌印才浮出來
 *
 * 所以這一關教的不是「哪一片是正解」，而是**同時滿足好幾條明講出來的規格**——
 * 這正是 `clear-constraint`／`long-all-upfront`／`skeleton-six-elements`／
 * `knob-limits`／`ground-read-first` 這幾座神廟的主題。
 *
 * ## 鍵位
 *   `↑` `↓`（`←` `→` 同義） 在石片之間走 · `Home` `End` 跳頭尾
 *   `Enter` / 空白鍵        放上去 · 再按一次拿下來
 *   `Esc`                   拿下最後放上去的那一片（檯上空的才收起這一層）
 *   按住 `Enter`（手掌上）  呈給神諭
 *
 * 這個模組只管「挑石片 ＋ 量尺」：DOM、焦點、選取狀態、組出來的文字。
 * 評分、結果面板、XP 一律回到 src/prompt/console.js。
 */
import { esc } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { runCheck } from '../challenges/checks.js';

export { PALM_HOLD_MS };

const DUST_COUNT = 5;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 這一份合尺資料合不合契約（不合就退回石碑刻印，見 console.js 的 flowKind）。 */
export function isConstraintFlow(data) {
  if (!data || !Array.isArray(data.gauges) || !Array.isArray(data.pieces)) return false;
  if (data.gauges.length < 2 || data.gauges.length > 5) return false;
  if (data.pieces.length < 4 || data.pieces.length > 9) return false;
  const gaugesOk = data.gauges.every(
    (g) => g && typeof g.check === 'string' && typeof g.want === 'string' && g.want.trim().length > 0
  );
  if (!gaugesOk) return false;
  const piecesOk = data.pieces.every(
    (p) => p && typeof p.id === 'string' && typeof p.text === 'string' && p.text.trim().length > 0
  );
  if (!piecesOk) return false;
  // 一定要有「該放的」也要有「不該放的」——不然挑全部就過關了
  const need = data.pieces.filter((p) => p.need);
  return need.length >= 2 && need.length < data.pieces.length;
}

/** 依宣告順序把挑起來的石片拼成一段文字（順序固定 → 這一關教的不是排序）。 */
export function composeConstraintText(flow, chosen) {
  if (!flow) return '';
  const on = chosen instanceof Set ? chosen : new Set(chosen || []);
  return flow.pieces
    .filter((p) => on.has(p.id))
    .map((p) => p.text)
    .join('\n');
}

/**
 * @param {object} opts
 * @param {(info:{piece:object,lit:number,total:number,text:string})=>void} [opts.onPlace]  放上去一片
 * @param {(info:{piece:object,gauge:object,feedback:string})=>void} [opts.onReject] 放上去之後某把尺暗了
 * @param {(info:{piece:object})=>void} [opts.onRestore] 拿下來
 * @param {(info:{text:string})=>void} [opts.onComplete] 每一把尺都合了
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去
 * @param {()=>void} [opts.onTap]                        石片被按下去那一下（純聲音）
 * @param {(msg:string)=>void} [opts.onAnnounce]         aria-live 講了什麼（測試用）
 */
export function createConstraintBoard({
  onPlace,
  onReject,
  onRestore,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  /** 這一關的合尺資料（flows.json 的 constraintFlow）。 */
  let flow = null;
  /** 已經放上檯面的石片 id（依放上去的先後記著，`Esc` 才拿得掉最後一片）。 */
  const chosen = [];

  const root = document.createElement('div');
  root.className = 'constraintboard';
  root.innerHTML = `
    <div class="gauges" data-gauges-wrap>
      <p class="gauges__eyebrow">委託人的尺</p>
      <ul class="gauges__list" data-gauges></ul>
    </div>

    <div class="stele stele--bench" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <p class="stele__eyebrow">攤在檯上的石片</p>
      <ol class="pieces" data-pieces></ol>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <p class="carve__tip">
        <kbd>↑</kbd> <kbd>↓</kbd> 在石片之間走，<kbd>Enter</kbd> 把它放上去或拿下來，
        <kbd>Esc</kbd> 拿下最後一片。放錯不會失敗，尺只會暗回去。
      </p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const gaugesEl = root.querySelector('[data-gauges]');
  const piecesEl = root.querySelector('[data-pieces]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const liveEl = root.querySelector('[data-live]');

  const palm = createPalm({
    lead: '每一把尺都合了。把手掌按上去，讓神諭聽見。',
    ready: () => isDone(),
    onFire: () => {
      steleEl.classList.add('is-ignited');
      onPress?.({ text: text() });
    },
  });
  root.appendChild(palm.root);

  /* ------------------------------------------------------------ 資料 */

  const pieces = () => (flow ? flow.pieces : []);
  const gauges = () => (flow ? flow.gauges : []);
  const on = () => new Set(chosen);

  function text() {
    return composeConstraintText(flow, on());
  }

  /**
   * 量一次尺。**這裡沒有第二套判準**：呼叫的就是 rubric 引擎在用的那支
   * `runCheck()`（護欄 3），所以石片上亮的燈與送出後的評分一定一致。
   */
  function measure() {
    const t = text();
    return gauges().map((g) => {
      const r = runCheck(g.check, t, g.checkOptions || {});
      return { gauge: g, passed: r.passed, partial: r.partial, evidence: r.evidence };
    });
  }

  const isDone = () => Boolean(flow) && chosen.length > 0 && measure().every((m) => m.passed);

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
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 40}px`);
      bit.style.setProperty('--y', `${-12 - Math.random() * 30}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 160}deg`);
      bit.style.setProperty('--d', `${360 + Math.random() * 300}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random()}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  function renderGauges(measured) {
    gaugesEl.innerHTML = measured
      .map(
        (m, i) => `<li class="gauge${m.passed ? ' is-lit' : m.partial ? ' is-half' : ''}" style="--i:${i}">
          <span class="gauge__mark" aria-hidden="true">${m.passed ? '✦' : m.partial ? '◐' : '○'}</span>
          <span class="gauge__body">
            <span class="gauge__want">${esc(m.gauge.want)}</span>
            <span class="gauge__note">${esc(m.evidence || '')}</span>
          </span>
          <span class="sr-only">${m.passed ? '已合尺' : '還沒合尺'}</span>
        </li>`
      )
      .join('');
  }

  function renderPieces() {
    const set = on();
    piecesEl.innerHTML = pieces()
      .map(
        (p, i) => `<li class="piece${set.has(p.id) ? ' is-on' : ''}" style="--i:${i}">
          <button class="piece__grip" type="button" data-piece="${esc(p.id)}" aria-pressed="${set.has(p.id) ? 'true' : 'false'}">
            <span class="piece__mark" aria-hidden="true">${set.has(p.id) ? '▣' : '▢'}</span>
            <span class="piece__text">${esc(p.text)}</span>
          </button>
          <span class="piece__fb" data-piece-fb="${esc(p.id)}" hidden></span>
        </li>`
      )
      .join('');
  }

  function render() {
    if (!flow) {
      gaugesEl.innerHTML = '';
      piecesEl.innerHTML = '';
      return;
    }
    const measured = measure();
    renderGauges(measured);
    renderPieces();
    const lit = measured.filter((m) => m.passed).length;
    progressEl.textContent = `合了 ${lit} / ${measured.length} 把尺`;
    askEl.textContent = isDone() ? '每一把尺都合了。' : flow.ask || '哪幾片湊得齊委託人的尺？';
    palm.show(isDone());
    steleEl.classList.toggle('is-full', isDone());
    return measured;
  }

  /* ------------------------------------------------------------ 焦點 */

  function gripOf(id) {
    return piecesEl.querySelector(`[data-piece="${CSS.escape(String(id))}"]`);
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

  /**
   * 放上去 / 拿下來。**兩種都不會失敗**：放錯只是某把尺暗回去，
   * 而且旁邊就地寫出那把尺為什麼不合（P9 完全資訊 ＋ WORLD.md §3.5 不失敗）。
   */
  function toggle(id) {
    const p = pieces().find((x) => x.id === id);
    if (!p || palm.fired) return null;
    onTap?.();

    const at = chosen.indexOf(id);
    if (at >= 0) {
      chosen.splice(at, 1);
      render();
      focusEl(gripOf(id));
      say('拿下來了。');
      onRestore?.({ piece: p });
      return { restored: true };
    }

    const before = measure();
    chosen.push(id);
    const after = render();
    // 剛剛還亮著、放上去之後暗掉的那一把尺 —— 那就是這一片的教學時刻
    const broke = after.find((m, i) => before[i] && before[i].passed && !m.passed);
    const fb = piecesEl.querySelector(`[data-piece-fb="${CSS.escape(String(id))}"]`);
    if (broke) {
      thud('reject');
      const msg = p.why || `這一片讓「${broke.gauge.want}」那把尺暗了下來。`;
      if (fb) {
        fb.textContent = msg;
        fb.hidden = false;
      }
      say(msg);
      onReject?.({ piece: p, gauge: broke.gauge, feedback: msg });
      focusEl(gripOf(id));
      return { correct: false, feedback: msg };
    }

    if (p.why && !p.need && fb) {
      // 沒有弄壞任何一把尺，但它也沒有幫上忙 —— 一樣就地講清楚（不扣分）
      fb.textContent = p.why;
      fb.hidden = false;
      say(p.why);
      onReject?.({ piece: p, gauge: null, feedback: p.why });
    }

    thud('stamp');
    const lit = after.filter((m) => m.passed).length;
    if (!p.why || p.need) say(`放上去了。合了 ${lit} / ${after.length} 把尺。`);
    onPlace?.({ piece: p, lit, total: after.length, text: text() });
    if (isDone()) {
      onComplete?.({ text: text() });
      focusEl(palm.button);
    } else {
      focusEl(gripOf(id));
    }
    return { correct: true };
  }

  /* ------------------------------------------------------------ 事件 */

  root.addEventListener('click', (e) => {
    const grip = e.target && e.target.closest ? e.target.closest('[data-piece]') : null;
    if (!grip) return;
    toggle(grip.getAttribute('data-piece'));
  });

  root.addEventListener('keydown', (e) => {
    if (!flow || palm.fired) return;
    if (e.target === palm.button) return;
    const grip = e.target && e.target.closest ? e.target.closest('[data-piece]') : null;

    if (e.key === 'Escape') {
      if (chosen.length) {
        e.preventDefault();
        e.stopPropagation();
        const last = chosen[chosen.length - 1];
        toggle(last);
        focusEl(gripOf(last));
      }
      return; // 檯上空的 → 讓它冒泡出去收起這一層
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      if (!grip) return;
      e.preventDefault();
      toggle(grip.getAttribute('data-piece'));
      return;
    }

    const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!nav.includes(e.key)) return;
    const list = pieces();
    if (!list.length) return;
    e.preventDefault();
    const currentId = grip ? grip.getAttribute('data-piece') : null;
    const idx = Math.max(0, list.findIndex((p) => p.id === currentId));
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const to =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (idx + step + list.length) % list.length;
    focusEl(gripOf(list[to].id));
  });

  const api = {
    root,
    get focusTarget() {
      return piecesEl.querySelector('[data-piece]') || palm.button;
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
    /** 亮了幾把尺 / 總共幾把（HUD 與測試用）。 */
    get progress() {
      const measured = measure();
      return { right: measured.filter((m) => m.passed).length, total: measured.length };
    },
    get ask() {
      return flow ? flow.ask || '' : '';
    },
    /** 現在放上去的石片 id（依放上去的先後，測試用）。 */
    get chosen() {
      return [...chosen];
    },
    /** 每一把尺現在的狀態（測試用）。 */
    get gauges() {
      return measure().map((m) => ({ check: m.gauge.check, want: m.gauge.want, passed: m.passed }));
    },
    get announcement() {
      return liveEl.textContent;
    },
    toggle,
    press: () => palm.press(),
    load(nextFlow) {
      flow = isConstraintFlow(nextFlow) ? nextFlow : null;
      chosen.length = 0;
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

export default createConstraintBoard;

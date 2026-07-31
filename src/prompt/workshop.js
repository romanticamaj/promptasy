/**
 * Promptasy — 神諭工坊（派工檯：工具使用 / function calling 的操作題）
 *
 * Phase 27。前面 26 關教的都是「怎麼把話寫清楚」，但**神諭會用工具**這件事，
 * 用選擇題講不清楚 —— 一般人聽完「function calling」四個字還是不知道那是什麼。
 * 所以做成一件可以動手的事：你當工坊的派工人。
 *
 *   ① 挑工具  旅人的委託擺在檯上，工具牌一字排開（每一張寫著 名字 / 說明 / 參數）。
 *              哪幾把真的用得到？挑錯了牌子不會被收走，旁邊長出一句白話解釋為什麼。
 *   ② 填參數  參數格是空的，值石在旁邊的托盤裡。把「湖邊」放進「地點」那一格。
 *              —— 這一步在教一件很具體的事：**參數不是用求的，是用填的**，
 *              而且值只能來自委託裡真的講過的東西。
 *   ③ 排順序  兩通呼叫誰先誰後？（先查天氣，才有東西可以寄）—— 直接沿用排序刻印。
 *   ④ 立規矩  最後補一條保險：找不到的參數要反問，不要自己編。
 *
 * 三條規則跟石碑刻印同源：
 *   1. **不會失敗**（WORLD.md §3.5）：挑錯 / 放錯只會就地長出一句教學，不扣分、不前進。
 *   2. **鍵盤走得完**（WORLD.md §3.1）：值石按 `Enter` 拿起 → 焦點自己跳到下一個空格 →
 *      `↑` `↓` 換格 → `Enter` 放下。每一步都用 aria-live 講出來。
 *   3. **評分還是同一支離線引擎**：派工單組出來的那一段字就是要呈給神諭的 prompt。
 *      玩家拿到的評價與圖鑑沒有第二套規則（護欄 3）。
 *
 * 這裡的文字全部是遊戲自撰的中文示範層（flows.json，`authored: "game"`）；
 * 教學內容對應的官方出處一律在第二幕的「神諭原典」與每條檢查的「出處 ↗」。
 */
import { esc, on } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createOrderBoard } from './order.js';

export { PALM_HOLD_MS };

/** 四個步驟的內部名字（畫面上顯示的是資料裡的中文問句）。 */
export const WORKSHOP_STAGES = Object.freeze(['tools', 'params', 'order', 'rule']);

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 一通呼叫在派工單上長什麼樣子。
 * 參數還沒填的用底線佔位 —— 玩家看得到「這裡還缺一塊」。
 */
function callLine(tool, values) {
  const args = tool.params
    .map((p) => `${p.label}＝${values[`${tool.id}.${p.id}`] || '＿＿'}`)
    .join('、');
  return `呼叫「${tool.name}」，${args}。`;
}

/**
 * @param {object} opts
 * @param {(info:{kind:string})=>void} [opts.onTake]     收下一件東西（挑對工具 / 放對值石 / 立好規矩）
 * @param {(info:{feedback:string})=>void} [opts.onReject] 工坊不收（挑錯 / 放錯）
 * @param {(info:{stage:string})=>void} [opts.onStage]   進到下一步
 * @param {(info:{text:string})=>void} [opts.onComplete] 派工單完成（手掌印浮出來）
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去
 */
export function createWorkshop({ onTake, onReject, onStage, onComplete, onPress } = {}) {
  /** 這一關的工坊資料（flows.json 的 workshop）。 */
  let ws = null;
  /** 現在在第幾步（WORKSHOP_STAGES 的索引）。 */
  let stage = 0;
  /** 已經挑起來的工具 id（依挑選順序）。 */
  let chosen = [];
  /** 參數格填了什麼：`${toolId}.${paramId}` → 值石的文字。 */
  let values = {};
  /** 現在手上拿著哪一顆值石。 */
  let heldStone = null;
  /** 已經被放進格子的值石 id。 */
  let usedStones = new Set();
  /** 立好的規矩（那一句話）。 */
  let rule = '';
  /** 排順序那一步排好了沒。 */
  let ordered = false;
  /** 拖曳中的值石（指標路徑）。 */
  let dragStone = null;
  let dragMoved = false;
  let dragFrom = { x: 0, y: 0 };
  let suppressClick = false;

  const root = document.createElement('div');
  root.className = 'workshop';
  root.innerHTML = `
    <div class="stele stele--slip" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">寫到一半的派工單</p>
      <ol class="stele__lines" data-dispatch aria-live="polite"></ol>
      <p class="stele__empty" data-empty>派工單還是空的。先看看檯上有哪幾把工具。</p>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <div data-stagebody></div>
      <p class="carve__tip" data-tip></p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const slipEl = root.querySelector('[data-dispatch]');
  const emptyEl = root.querySelector('[data-empty]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const bodyEl = root.querySelector('[data-stagebody]');
  const tipEl = root.querySelector('[data-tip]');
  const liveEl = root.querySelector('[data-live]');

  /* 第三步直接沿用排序刻印（同一套鍵盤文法、同一種石版） */
  const board = createOrderBoard({
    embedded: true,
    onSettle: ({ piece }) => onTake?.({ kind: 'slip', label: piece.label }),
    onComplete: () => {
      ordered = true;
      renderSlip();
      next();
    },
  });

  const palm = createPalm({
    lead: '派工單寫好了。把手掌按上去，讓神諭聽見。',
    ready: () => isDone(),
    onFire: () => onPress?.({ text: text() }),
  });
  root.appendChild(palm.root);

  /* ------------------------------------------------------------ 資料 */

  function toolOf(id) {
    return (ws && ws.tools.find((t) => t.id === id)) || null;
  }
  function stoneOf(id) {
    return (ws && ws.stones.find((s) => s.id === id)) || null;
  }
  function neededTools() {
    return ws ? ws.tools.filter((t) => t.needed) : [];
  }
  /** 挑好的工具，依「排順序」那一步的結果排（還沒排就照挑的順序）。 */
  function orderedTools() {
    if (!ws) return [];
    const ids = ordered ? board.arrangement : chosen;
    return ids.map(toolOf).filter(Boolean);
  }
  function allSlots() {
    if (!ws) return [];
    const out = [];
    for (const t of orderedTools()) for (const p of t.params) out.push({ tool: t, param: p });
    return out;
  }
  function slotsFilled() {
    return allSlots().every(({ tool, param }) => values[`${tool.id}.${param.id}`]);
  }

  /** 這一步做完了嗎。 */
  function stageDone(i = stage) {
    if (!ws) return false;
    if (i === 0) return chosen.length >= neededTools().length;
    if (i === 1) return slotsFilled();
    if (i === 2) return ordered;
    return Boolean(rule);
  }

  function isDone() {
    return Boolean(ws) && stageDone(0) && stageDone(1) && stageDone(2) && stageDone(3);
  }

  /** 派工單上的整段文字 —— 這就是要送去離線評分的 prompt。 */
  function text() {
    if (!ws) return '';
    const lines = [];
    if (ordered && ws.head) lines.push(ws.head);
    for (const t of orderedTools()) lines.push(t.spec);
    const calls = orderedTools().map((t) => callLine(t, values));
    if (ordered) calls.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    else calls.forEach((c) => lines.push(c));
    if (rule) lines.push(rule);
    return lines.join('\n');
  }

  function announce(msg) {
    liveEl.textContent = msg;
  }

  /* ------------------------------------------------------------ 動畫 */

  function thud(kind = 'stamp') {
    steleEl.classList.remove('is-stamp', 'is-reject');
    void steleEl.offsetWidth;
    steleEl.classList.add(kind === 'reject' ? 'is-reject' : 'is-stamp');
    if (prefersReduced() || kind === 'reject') return;
    for (let i = 0; i < 8; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'dust';
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 52}px`);
      bit.style.setProperty('--y', `${-14 - Math.random() * 40}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 200}deg`);
      bit.style.setProperty('--d', `${380 + Math.random() * 340}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1.0}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  function renderSlip() {
    const lines = text().split('\n').filter(Boolean);
    emptyEl.hidden = lines.length > 0;
    slipEl.innerHTML = lines
      .map(
        (l, i) =>
          `<li class="carved${i === lines.length - 1 ? ' is-fresh' : ''}" style="--i:${i}">${esc(
            l
          )}</li>`
      )
      .join('');
    steleEl.classList.toggle('is-full', isDone());
    palm.show(isDone());
  }

  function renderTools() {
    return `<div class="toolrack" data-toolrack>${ws.tools
      .map((t, i) => {
        const taken = chosen.includes(t.id);
        return `<button class="toolcard${taken ? ' is-taken' : ''}" type="button" data-tool="${esc(
          t.id
        )}" style="--i:${i}" aria-pressed="${taken ? 'true' : 'false'}">
          <span class="toolcard__name">${esc(t.name)}</span>
          <span class="toolcard__desc">${esc(t.desc)}</span>
          <span class="toolcard__params">參數：${esc(t.params.map((p) => p.label).join('、'))}</span>
          <span class="toolcard__fb" data-tool-fb hidden></span>
        </button>`;
      })
      .join('')}</div>`;
  }

  function renderParams() {
    const slots = allSlots()
      .map(({ tool, param }, i) => {
        const key = `${tool.id}.${param.id}`;
        const v = values[key];
        return `<li class="pslot${v ? ' is-filled' : ''}" style="--i:${i}">
          <button class="pslot__btn" type="button" data-pslot="${esc(key)}"
            aria-label="${esc(
              `${tool.name} 的參數「${param.label}」${v ? `，已經放了 ${v}` : '，還是空的'}`
            )}">
            <span class="pslot__tool">${esc(tool.name)}</span>
            <span class="pslot__label">${esc(param.label)}</span>
            <span class="pslot__hint">${esc(param.hint)}</span>
            <span class="pslot__value">${v ? esc(v) : '＿＿'}</span>
            <span class="pslot__fb" data-pslot-fb hidden></span>
          </button>
        </li>`;
      })
      .join('');
    const tray = ws.stones
      .map((s, i) => {
        const used = usedStones.has(s.id);
        return `<button class="stone${used ? ' is-used' : ''}${
          heldStone === s.id ? ' is-held' : ''
        }" type="button" data-stone="${esc(s.id)}" style="--i:${i}"
          aria-pressed="${heldStone === s.id ? 'true' : 'false'}"
          ${used ? 'disabled' : ''}>${esc(s.text)}</button>`;
      })
      .join('');
    return `<div class="paramwork">
      <ol class="pslots" data-pslots>${slots}</ol>
      <div class="stonetray" data-stonetray role="group" aria-label="值石托盤">
        <span class="stonetray__label">值石</span>
        <div class="stonetray__row" data-stones>${tray}</div>
      </div>
    </div>`;
  }

  function renderRules() {
    return `<div class="carve__options" data-rules>${ws.rules
      .map(
        (r, i) => `<button class="opt" type="button" data-rule="${i}" style="--i:${i}">
          <span class="opt__key" aria-hidden="true">${i + 1}</span>
          <span class="opt__text"><span class="opt__line">${esc(r.text)}</span></span>
          <span class="opt__fb" data-rule-fb hidden></span>
        </button>`
      )
      .join('')}</div>`;
  }

  const TIPS = [
    '挑錯不會失敗 —— 工坊只是不收，旁邊會告訴你為什麼。',
    '停在一顆值石上按 <kbd>Enter</kbd> 拿起來，<kbd>↑</kbd> <kbd>↓</kbd> 換格子，再按 <kbd>Enter</kbd> 放下。也可以直接用滑鼠拖。',
    '停在一片石版上按 <kbd>Enter</kbd> 拿起來，<kbd>↑</kbd> <kbd>↓</kbd> 搬位置，再按 <kbd>Enter</kbd> 放下。',
    '按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 也可以選。選錯不會失敗。',
  ];

  function render() {
    if (!ws) return;
    progressEl.textContent = isDone()
      ? `派工單寫好了（共 ${WORKSHOP_STAGES.length} 步）`
      : `第 ${stage + 1} / ${WORKSHOP_STAGES.length} 步`;
    askEl.textContent = isDone() ? '' : ws.stages[stage].ask;
    tipEl.innerHTML = isDone() ? '' : TIPS[stage];
    if (isDone()) {
      bodyEl.innerHTML = '';
      renderSlip();
      return;
    }
    if (stage === 2) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(board.root);
    } else {
      bodyEl.innerHTML = stage === 0 ? renderTools() : stage === 1 ? renderParams() : renderRules();
    }
    renderSlip();
  }

  function focusFirst() {
    const target = bodyEl.querySelector(
      '[data-tool]:not(.is-taken), [data-stone]:not([disabled]), [data-slip], [data-rule]'
    );
    if (!target) return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus?.();
    }
  }

  /** 進到下一步（做完了就把手掌印叫出來）。 */
  function next() {
    if (isDone()) {
      render();
      onComplete?.({ text: text() });
      try {
        palm.button.focus({ preventScroll: true });
      } catch {
        palm.button.focus?.();
      }
      return;
    }
    while (stage < WORKSHOP_STAGES.length - 1 && stageDone(stage)) stage += 1;
    if (stage === 2 && !ordered) {
      // 排順序那一步的石版＝剛剛填好參數的那幾通呼叫
      board.load({
        ask: ws.stages[2].ask,
        pieces: (ws.order.start || chosen)
          .map(toolOf)
          .filter(Boolean)
          .map((t) => ({ id: t.id, label: t.name, text: callLine(t, values) })),
        order: ws.order.sequence,
      });
    }
    render();
    onStage?.({ stage: WORKSHOP_STAGES[stage] });
    focusFirst();
  }

  /* ------------------------------------------------------------ 互動 */

  /** 工坊不收：就地長出一句白話教學，不扣分、不前進。 */
  function refuse(btn, selector, feedback) {
    if (btn) {
      btn.classList.add('is-wrong');
      btn.setAttribute('aria-disabled', 'true');
      const fb = btn.querySelector(selector);
      if (fb) {
        fb.textContent = feedback;
        fb.hidden = false;
      }
    }
    thud('reject');
    announce(feedback);
    onReject?.({ feedback });
  }

  function pickTool(id) {
    if (stage !== 0 || !ws) return null;
    const tool = toolOf(id);
    if (!tool || chosen.includes(id)) return null;
    const btn = bodyEl.querySelector(`[data-tool="${CSS.escape(id)}"]`);
    if (!tool.needed) {
      refuse(btn, '[data-tool-fb]', tool.feedback || '這一把用不到。');
      return { correct: false, feedback: tool.feedback || '' };
    }
    chosen.push(id);
    thud('stamp');
    onTake?.({ kind: 'tool' });
    announce(`收下工具：${tool.name}。`);
    if (stageDone(0)) {
      next();
    } else {
      render();
      focusFirst();
    }
    return { correct: true };
  }

  function liftStone(id) {
    if (stage !== 1 || usedStones.has(id)) return false;
    const s = stoneOf(id);
    if (!s) return false;
    heldStone = id;
    render();
    const stoneBtn = bodyEl.querySelector(`[data-stone="${CSS.escape(id)}"]`);
    const empty = bodyEl.querySelector('.pslot:not(.is-filled) [data-pslot]');
    const target = empty || stoneBtn;
    try {
      target?.focus({ preventScroll: true });
    } catch {
      target?.focus?.();
    }
    announce(`拿起值石：${s.text}。用上下鍵挑一格，再按 Enter 放下。`);
    return true;
  }

  /** 把手上的值石放進某一格。放錯只會就地教學，值石回到托盤。 */
  function dropStone(key) {
    if (stage !== 1 || !heldStone) return null;
    const entry = allSlots().find(({ tool, param }) => `${tool.id}.${param.id}` === key);
    if (!entry) return null;
    const stone = stoneOf(heldStone);
    if (values[key]) return null;
    if (entry.param.stone !== heldStone) {
      heldStone = null;
      render();
      refuse(
        bodyEl.querySelector(`[data-pslot="${CSS.escape(key)}"]`),
        '[data-pslot-fb]',
        entry.param.miss
      );
      return { correct: false, feedback: entry.param.miss };
    }
    values[key] = stone.text;
    usedStones.add(heldStone);
    heldStone = null;
    thud('stamp');
    onTake?.({ kind: 'value' });
    announce(`${entry.param.label} 放好了：${stone.text}。`);
    if (stageDone(1)) {
      next();
    } else {
      render();
      const empty = bodyEl.querySelector('.pslot:not(.is-filled) [data-pslot]');
      const back = empty || bodyEl.querySelector('[data-stone]:not([disabled])');
      try {
        back?.focus({ preventScroll: true });
      } catch {
        back?.focus?.();
      }
    }
    return { correct: true };
  }

  /** 把已經放進格子的值石拿回來（放錯地方也不會卡住）。 */
  function takeBack(key) {
    if (stage !== 1 || !values[key]) return false;
    const entry = allSlots().find(({ tool, param }) => `${tool.id}.${param.id}` === key);
    if (!entry) return false;
    usedStones.delete(entry.param.stone);
    delete values[key];
    render();
    announce(`把 ${entry.param.label} 那一格的值石收回托盤了。`);
    return true;
  }

  function pickRule(i) {
    if (stage !== 3 || !ws) return null;
    const r = ws.rules[i];
    if (!r) return null;
    const btn = bodyEl.querySelector(`[data-rule="${i}"]`);
    if (!r.correct) {
      refuse(btn, '[data-rule-fb]', r.feedback || '這一條立不住。');
      return { correct: false, feedback: r.feedback || '' };
    }
    rule = r.text;
    thud('stamp');
    onTake?.({ kind: 'rule' });
    announce('規矩立好了。');
    next();
    return { correct: true };
  }

  /* --- 事件 --- */

  on(root, '[data-tool]', 'click', (e, target) => {
    pickTool(target.getAttribute('data-tool'));
  });
  on(root, '[data-rule]', 'click', (e, target) => {
    pickRule(Number(target.getAttribute('data-rule')));
  });
  on(root, '[data-stone]', 'click', (e, target) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = target.getAttribute('data-stone');
    if (heldStone === id) {
      heldStone = null;
      render();
      announce('把值石放回托盤了。');
      return;
    }
    liftStone(id);
  });
  on(root, '[data-pslot]', 'click', (e, target) => {
    const key = target.getAttribute('data-pslot');
    if (heldStone) dropStone(key);
    else takeBack(key);
  });

  /* --- 拖曳值石（滑鼠 / 觸控；鍵盤走的是上面那條 click 路徑） --- */
  root.addEventListener('pointerdown', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-stone]') : null;
    if (!btn || btn.disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStone = btn.getAttribute('data-stone');
    dragMoved = false;
    dragFrom = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragStone) return;
    const dx = e.clientX - dragFrom.x;
    const dy = e.clientY - dragFrom.y;
    if (!dragMoved && Math.hypot(dx, dy) < 4) return;
    if (!dragMoved) {
      dragMoved = true;
      heldStone = dragStone;
      render();
    }
    const btn = bodyEl.querySelector(`[data-stone="${CSS.escape(dragStone)}"]`);
    if (btn && !prefersReduced()) {
      btn.classList.add('is-dragging');
      btn.style.setProperty('--dx', `${Math.round(dx)}px`);
      btn.style.setProperty('--dy', `${Math.round(dy)}px`);
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!dragStone) return;
    const id = dragStone;
    dragStone = null;
    const btn = bodyEl.querySelector(`[data-stone="${CSS.escape(id)}"]`);
    if (btn) {
      btn.classList.remove('is-dragging');
      btn.style.removeProperty('--dx');
      btn.style.removeProperty('--dy');
    }
    if (!dragMoved) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest ? under.closest('[data-pslot]') : null;
    if (slot) dropStone(slot.getAttribute('data-pslot'));
    else render();
  });

  /* --- 鍵盤：方向鍵在同一組東西之間走、1 2 3 選規矩、Esc 放下值石 --- */
  root.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape' && heldStone) {
      e.preventDefault();
      e.stopPropagation();
      heldStone = null;
      render();
      announce('把值石放回托盤了。');
      return;
    }
    if (stage === 3) {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && ws && n <= ws.rules.length) {
        e.preventDefault();
        e.stopPropagation();
        pickRule(n - 1);
        return;
      }
    }
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dir = -1;
    if (!dir) return;
    const t = e.target;
    const group = t && t.closest ? t.closest('[data-toolrack], [data-stones], [data-pslots], [data-rules]') : null;
    if (!group) return;
    const sel = group.hasAttribute('data-toolrack')
      ? '[data-tool]'
      : group.hasAttribute('data-stones')
        ? '[data-stone]:not([disabled])'
        : group.hasAttribute('data-pslots')
          ? '[data-pslot]'
          : '[data-rule]';
    const items = Array.from(group.querySelectorAll(sel)).filter(
      (n) => n.getClientRects().length > 0
    );
    if (items.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    const here = t.closest(sel);
    const at = items.indexOf(here);
    const nextEl = items[(at + dir + items.length) % items.length];
    try {
      nextEl?.focus({ preventScroll: true });
    } catch {
      nextEl?.focus?.();
    }
  });

  const api = {
    root,
    /** 開啟面板時焦點落在哪裡。 */
    get focusTarget() {
      return (
        bodyEl.querySelector('[data-tool], [data-stone]:not([disabled]), [data-slip], [data-rule]') ||
        palm.button
      );
    },
    get palmTarget() {
      return palm.button;
    },
    /** 派工單上的整段文字（要送去離線評分的 prompt）。 */
    get text() {
      return text();
    },
    get done() {
      return isDone();
    },
    get fired() {
      return palm.fired;
    },
    /** 現在在第幾步（測試用）。 */
    get stage() {
      return WORKSHOP_STAGES[stage];
    },
    get progress() {
      return { step: stage + 1, total: WORKSHOP_STAGES.length };
    },
    get ask() {
      return ws && !isDone() ? ws.stages[stage].ask : '';
    },
    /** 目前的派工狀態（測試用）。 */
    get dispatch() {
      return { chosen: chosen.slice(), values: { ...values }, ordered, rule };
    },
    get held() {
      return heldStone;
    },
    get announcement() {
      return liveEl.textContent;
    },
    /** 排順序那一步用的石版（測試用）。 */
    get board() {
      return board;
    },
    pickTool,
    liftStone,
    dropStone,
    takeBack,
    pickRule,
    /** 直接觸發手掌印（測試用，不必真的按住 600ms）。 */
    press: () => palm.press(),
    load(nextWs) {
      const okWs =
        nextWs &&
        Array.isArray(nextWs.tools) &&
        nextWs.tools.length >= 2 &&
        Array.isArray(nextWs.stones) &&
        Array.isArray(nextWs.rules) &&
        Array.isArray(nextWs.stages) &&
        nextWs.stages.length === WORKSHOP_STAGES.length &&
        nextWs.order &&
        Array.isArray(nextWs.order.sequence);
      ws = okWs ? nextWs : null;
      stage = 0;
      chosen = [];
      values = {};
      heldStone = null;
      usedStones = new Set();
      rule = '';
      ordered = false;
      dragStone = null;
      palm.reset();
      board.load(null);
      steleEl.classList.remove('is-full', 'is-ignited', 'is-stamp', 'is-reject');
      dustEl.innerHTML = '';
      liveEl.textContent = '';
      root.hidden = !ws;
      if (!ws) return false;
      render();
      return true;
    },
    reopen() {
      return ws ? api.load(ws) : false;
    },
  };

  return api;
}

export default createWorkshop;

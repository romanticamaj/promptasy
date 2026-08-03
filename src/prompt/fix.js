/**
 * Promptasy — 改碑（fix-the-broken）
 *
 * 課程 v2 · Phase B 的第一種新題型。石碑刻印教「這一段該寫什麼」，排序刻印教
 * 「這幾段該照什麼次序」——但撰寫基本功那一區真正要練的是**把壞的那一句改掉**：
 * 抄寫人留下一份寫壞的草稿，上面幾句話用不得（「照舊巡一輪」「請寫得簡短一點」），
 * 你要一句一句把它換成寫得出來的版本。
 *
 * 三條規則跟另外三種題型同源（WORLD.md §3.3b）：
 *   1. **不會失敗**。挑到弱的替代寫法，石碑只是「不收」：那一片留在原地、
 *      就地長出一句白話教學，你再挑一次。不扣分、不前進、不跳失敗面板。
 *   2. **鍵盤走得完**（§3.1 鐵則）。焦點在草稿上要改的那幾句之間走（`↑` `↓`），
 *      `Enter` 攤開替代寫法、`↑` `↓` 在替代寫法之間走、`Enter` 換上去。
 *      **`Esc` 在這裡是「還原」不是「關面板」**（見下方鍵位契約）。
 *   3. **評分還是同一支離線引擎**。改好的整份草稿就是要呈給神諭的那段文字，
 *      走同一支 rubric、同一隻手掌印（護欄 3）。
 *
 * ## `Esc` 的鍵位契約（三段式，由內往外）
 *
 *   ① 替代寫法攤開著   → 收起來，那一句維持原樣（沒有換掉任何東西）
 *   ② 焦點停在**已經改好**的那一句 → 還原成原本的壞寫法，並重新攤開替代寫法
 *   ③ 以上都不是       → 不攔截，讓事件往上冒泡 → 主控台收起這一層
 *
 * 換句話說：`Esc` 永遠先還原「你剛剛做的那一步」，直到沒有東西可以還原了，
 * 它才變回「走出去」的那把鑰匙。每一段都會用 `aria-live` 講出來。
 *
 * 這個模組只管「改草稿」：DOM、焦點、選項狀態、組出來的文字。
 * 評分、結果面板、XP 一律回到 src/prompt/console.js。
 */
import { esc } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';

export { PALM_HOLD_MS };

/** 換上一句時噴出幾顆石屑。 */
const DUST_COUNT = 8;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 這一份草稿合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。 */
export function isFixFlow(data) {
  if (!data || !Array.isArray(data.fragments) || data.fragments.length < 2) return false;
  const weak = data.fragments.filter((f) => f && f.weak);
  if (!weak.length) return false;
  return weak.every(
    (f) =>
      Array.isArray(f.options) &&
      f.options.length >= 2 &&
      f.options.filter((o) => o && o.correct).length === 1
  );
}

/**
 * @param {object} opts
 * @param {(info:{fragment:object,index:number,total:number,text:string})=>void} [opts.onFix]   換掉一句
 * @param {(info:{feedback:string,option:object})=>void} [opts.onReject]  石碑不收這個替代寫法
 * @param {(info:{fragment:object})=>void} [opts.onRestore] 還原一句（Esc）
 * @param {(info:{text:string})=>void} [opts.onComplete] 全部改完（手掌印出現）
 * @param {(info:{text:string})=>void} [opts.onPress]    手掌按下去
 * @param {()=>void} [opts.onTap]                        牌子被按下去那一下（純聲音）
 * @param {(msg:string)=>void} [opts.onAnnounce]         aria-live 講了什麼（測試用）
 */
export function createFixBoard({
  onFix,
  onReject,
  onRestore,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  /** 這一關的草稿（flows.json 的 fixFlow）。 */
  let flow = null;
  /** fragment id → 已經換上去的選項（沒換過就沒有這一筆）。 */
  const fixed = new Map();
  /** 現在攤開著替代寫法的那一句（沒有就是 null）。 */
  let openId = null;

  const root = document.createElement('div');
  root.className = 'fixboard';
  root.innerHTML = `
    <div class="stele stele--draft" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">抄寫人留下的草稿</p>
      <ol class="draft" data-draft></ol>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <p class="carve__tip">
        <kbd>↑</kbd> <kbd>↓</kbd> 在畫線的句子之間走，<kbd>Enter</kbd> 攤開替代寫法，
        <kbd>Esc</kbd> 還原剛剛換掉的那一句。挑錯不會失敗，石碑只是不收。
      </p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const draftEl = root.querySelector('[data-draft]');
  const dustEl = root.querySelector('[data-dust]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const liveEl = root.querySelector('[data-live]');

  const palm = createPalm({
    lead: '草稿已經改乾淨了。把手掌按上去，讓神諭聽見。',
    ready: () => isDone(),
    onFire: () => {
      steleEl.classList.add('is-ignited');
      onPress?.({ text: text() });
    },
  });
  root.appendChild(palm.root);

  /* ------------------------------------------------------------ 資料 */

  const fragments = () => (flow ? flow.fragments : []);
  const weakOnes = () => fragments().filter((f) => f.weak);
  const isDone = () => Boolean(flow) && weakOnes().every((f) => fixed.has(f.id));

  /** 這一句現在長什麼樣子（改過就是新的，沒改過就是原本那句壞寫法）。 */
  function currentText(f) {
    if (!f.weak) return f.text;
    const picked = fixed.get(f.id);
    return picked ? picked.text : f.text;
  }

  /** 草稿現在的整段文字 —— 這就是要送去離線評分的 prompt。 */
  function text() {
    return fragments()
      .map(currentText)
      .filter((s) => String(s || '').trim().length > 0)
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
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 54}px`);
      bit.style.setProperty('--y', `${-16 - Math.random() * 42}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 200}deg`);
      bit.style.setProperty('--d', `${400 + Math.random() * 360}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1.1}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  /* ------------------------------------------------------------ 繪製 */

  function optionLabel(o) {
    return o.label || (String(o.text || '').trim() ? o.text : '整句拿掉');
  }

  function renderFragment(f, i) {
    if (!f.weak) {
      return `<li class="frag frag--kept" style="--i:${i}"><span class="frag__text">${esc(
        f.text
      )}</span></li>`;
    }
    const picked = fixed.get(f.id);
    const open = openId === f.id;
    const body = picked
      ? String(picked.text || '').trim()
        ? esc(picked.text)
        : '<i class="frag__gone">（這一句被拿掉了）</i>'
      : esc(f.text);
    const options = open
      ? `<div class="frag__options" data-options="${esc(f.id)}">
          ${f.options
            .map(
              (o, oi) =>
                `<button class="opt" type="button" data-frag="${esc(f.id)}" data-opt="${oi}" style="--i:${oi}">
                  <span class="opt__key" aria-hidden="true">${oi + 1}</span>
                  <span class="opt__text">${String(optionLabel(o))
                    .split('\n')
                    .map((l) => `<span class="opt__line">${esc(l)}</span>`)
                    .join('')}</span>
                  <span class="opt__fb" data-opt-fb hidden></span>
                </button>`
            )
            .join('')}
        </div>`
      : '';
    return `<li class="frag frag--weak${picked ? ' is-fixed' : ''}${open ? ' is-open' : ''}" style="--i:${i}">
      <button class="frag__grip" type="button" data-frag-btn="${esc(f.id)}"
        aria-expanded="${open ? 'true' : 'false'}">
        <span class="frag__mark" aria-hidden="true">${picked ? '✦' : '✎'}</span>
        <span class="frag__text">${body}</span>
      </button>
      ${options}
    </li>`;
  }

  function render() {
    if (!flow) {
      draftEl.innerHTML = '';
      return;
    }
    draftEl.innerHTML = fragments().map(renderFragment).join('');
    const total = weakOnes().length;
    const done = weakOnes().filter((f) => fixed.has(f.id)).length;
    progressEl.textContent = `改好 ${done} / ${total} 句`;
    askEl.textContent = isDone() ? '草稿改乾淨了。' : flow.ask || '哪幾句要換掉？';
    palm.show(isDone());
    steleEl.classList.toggle('is-full', isDone());
  }

  /* ------------------------------------------------------------ 焦點 */

  function fragButton(id) {
    return draftEl.querySelector(`[data-frag-btn="${CSS.escape(String(id))}"]`);
  }

  function focusEl(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus?.();
    }
  }

  function focusFragment(id) {
    focusEl(fragButton(id));
  }

  function focusFirstOption(id) {
    const first = draftEl.querySelector(`[data-options="${CSS.escape(String(id))}"] .opt:not(.is-wrong)`);
    focusEl(first || fragButton(id));
  }

  /** 下一個還沒改的句子（沒有就回 null）。 */
  function nextUnfixed(afterId) {
    const list = weakOnes();
    const at = list.findIndex((f) => f.id === afterId);
    for (let k = 1; k <= list.length; k += 1) {
      const f = list[(at + k + list.length) % list.length];
      if (!fixed.has(f.id)) return f;
    }
    return null;
  }

  /* ------------------------------------------------------------ 動作 */

  function open(id) {
    const f = weakOnes().find((x) => x.id === id);
    if (!f || palm.fired) return false;
    openId = id;
    render();
    focusFirstOption(id);
    say(`攤開替代寫法：${f.ask || flow.ask || '這一句要換成什麼？'}`);
    return true;
  }

  function close(id = openId, { announce = true } = {}) {
    if (!openId) return false;
    const was = openId;
    openId = null;
    render();
    focusFragment(id || was);
    if (announce) say('收起替代寫法，這一句維持原樣。');
    return true;
  }

  /** 挑一個替代寫法。對 → 換上去；錯 → 石碑不收，就地教學。 */
  function pick(fragId, optIndex) {
    const f = weakOnes().find((x) => x.id === fragId);
    if (!f || palm.fired) return null;
    const option = f.options[optIndex];
    if (!option) return null;
    onTap?.();

    if (!option.correct) {
      const btn = draftEl.querySelector(
        `[data-frag="${CSS.escape(String(fragId))}"][data-opt="${optIndex}"]`
      );
      if (btn) {
        btn.classList.add('is-wrong');
        btn.setAttribute('aria-disabled', 'true');
        const fb = btn.querySelector('[data-opt-fb]');
        if (fb) {
          fb.textContent = option.feedback || '石碑不收這一句。再看看其他寫法。';
          fb.hidden = false;
        }
      }
      thud('reject');
      say(option.feedback || '石碑不收這一句。');
      onReject?.({ feedback: option.feedback || '', option });
      return { correct: false, feedback: option.feedback || '' };
    }

    fixed.set(f.id, option);
    openId = null;
    render();
    thud('stamp');
    const total = weakOnes().length;
    const index = weakOnes().filter((x) => fixed.has(x.id)).length;
    say(`換上去了。改好 ${index} / ${total} 句。`);
    onFix?.({ fragment: f, index, total, text: text() });
    if (isDone()) {
      onComplete?.({ text: text() });
      focusEl(palm.button);
    } else {
      const next = nextUnfixed(f.id);
      if (next) focusFragment(next.id);
      else focusFragment(f.id);
    }
    return { correct: true };
  }

  /**
   * 還原：把改好的那一句放回原本的壞寫法，並重新攤開替代寫法。
   * 這是 `Esc` 契約的第二段 —— 不會失敗、不扣分，只是把一步收回來。
   */
  function restore(fragId) {
    const f = weakOnes().find((x) => x.id === fragId);
    if (!f || !fixed.has(f.id) || palm.fired) return false;
    fixed.delete(f.id);
    openId = f.id;
    render();
    say('還原成原本那一句，替代寫法重新攤開。');
    focusFirstOption(f.id);
    onRestore?.({ fragment: f });
    return true;
  }

  /* ------------------------------------------------------------ 事件 */

  root.addEventListener('click', (e) => {
    const opt = e.target && e.target.closest ? e.target.closest('[data-opt]') : null;
    if (opt) {
      pick(opt.getAttribute('data-frag'), Number(opt.getAttribute('data-opt')));
      return;
    }
    const grip = e.target && e.target.closest ? e.target.closest('[data-frag-btn]') : null;
    if (!grip) return;
    const id = grip.getAttribute('data-frag-btn');
    if (openId === id) close(id);
    else if (fixed.has(id)) restore(id);
    else open(id);
  });

  root.addEventListener('keydown', (e) => {
    if (!flow || palm.fired) return;
    if (e.target === palm.button) return;

    const optBtn = e.target && e.target.closest ? e.target.closest('[data-opt]') : null;
    const gripBtn = e.target && e.target.closest ? e.target.closest('[data-frag-btn]') : null;

    /* --- Esc：三段式還原（見檔頭的鍵位契約） --- */
    if (e.key === 'Escape') {
      if (openId) {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      const id = gripBtn && gripBtn.getAttribute('data-frag-btn');
      if (id && fixed.has(id)) {
        e.preventDefault();
        e.stopPropagation();
        restore(id);
        return;
      }
      return; // 沒有東西可以還原 → 讓它冒泡出去收起這一層
    }

    /* --- 數字快捷：挑替代寫法 --- */
    if (openId && /^[1-9]$/.test(e.key)) {
      const f = weakOnes().find((x) => x.id === openId);
      const n = Number(e.key);
      if (f && n <= f.options.length) {
        e.preventDefault();
        e.stopPropagation();
        pick(openId, n - 1);
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      if (optBtn) {
        e.preventDefault();
        pick(optBtn.getAttribute('data-frag'), Number(optBtn.getAttribute('data-opt')));
        return;
      }
      if (gripBtn) {
        e.preventDefault();
        const id = gripBtn.getAttribute('data-frag-btn');
        if (openId === id) close(id);
        else if (fixed.has(id)) restore(id);
        else open(id);
      }
      return;
    }

    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') return;

    /* --- 方向鍵：攤開時在替代寫法之間走，否則在要改的句子之間走 --- */
    if (optBtn && openId) {
      const opts = Array.from(draftEl.querySelectorAll(`[data-options="${CSS.escape(String(openId))}"] .opt`));
      const at = opts.indexOf(optBtn);
      if (at < 0) return;
      e.preventDefault();
      const to =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? opts.length - 1
            : (at + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      focusEl(opts[to]);
      return;
    }

    const list = weakOnes();
    if (!list.length) return;
    const currentId = gripBtn ? gripBtn.getAttribute('data-frag-btn') : null;
    const at = list.findIndex((f) => f.id === currentId);
    e.preventDefault();
    const to =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? list.length - 1
          : (Math.max(0, at) + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    focusFragment(list[to].id);
  });

  const api = {
    root,
    /** 開啟面板時焦點落在哪裡：第一句還沒改的話。 */
    get focusTarget() {
      const next = weakOnes().find((f) => !fixed.has(f.id));
      return (next && fragButton(next.id)) || palm.button;
    },
    get palmTarget() {
      return palm.button;
    },
    /** 改好的整段文字（要送去離線評分的 prompt）。 */
    get text() {
      return text();
    },
    get done() {
      return isDone();
    },
    get fired() {
      return palm.fired;
    },
    /** 改好幾句 / 總共幾句（HUD 與測試用）。 */
    get progress() {
      return { fixed: weakOnes().filter((f) => fixed.has(f.id)).length, total: weakOnes().length };
    },
    get ask() {
      return flow ? flow.ask || '' : '';
    },
    /** 目前攤開著替代寫法的那一句（測試用）。 */
    get openId() {
      return openId;
    },
    get announcement() {
      return liveEl.textContent;
    },
    open,
    close,
    pick,
    restore,
    press: () => palm.press(),
    load(nextFlow) {
      flow = isFixFlow(nextFlow) ? nextFlow : null;
      fixed.clear();
      openId = null;
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

export default createFixBoard;

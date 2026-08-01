/**
 * Promptasy — 刻印段落（choice 變體共用的「合」）
 *
 * 課程 v2 · Phase C 的兩種新題型（推規碑 / 雙面碑）都是**石碑刻印的變體**：
 * 前面多一段「先想通一件事」的舞台（猜規律／秤兩面），想通之後
 * 還是回到同一件事 —— 一段一段把 prompt 刻上石碑。
 *
 * 「刻」這件事在兩邊一模一樣，所以抽成這個零件：DOM、選項狀態、
 * 石屑、焦點、組出來的文字。`src/prompt/stele.js`（Phase 11 就在跑的路徑）
 * **刻意不改**——它沒有理由為了少幾行程式碼冒回歸的險。
 *
 * 這個零件不管手掌印、不管評分、不管結果面板。那些一律回到
 * src/prompt/console.js（護欄 3：同一段文字、同一支離線引擎）。
 */
import { esc, on, rovingList } from '../ui/dom.js';

/** 一次刻印噴出幾顆石屑。 */
const DUST_COUNT = 10;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 這一組段落合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。 */
export function isSlotList(slots) {
  return (
    Array.isArray(slots) &&
    slots.length > 0 &&
    slots.every(
      (s) =>
        s &&
        typeof s.ask === 'string' &&
        Array.isArray(s.options) &&
        s.options.length >= 2 &&
        s.options.filter((o) => o && o.correct).length === 1
    )
  );
}

/**
 * @param {object} opts
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve] 刻上一段
 * @param {(info:{feedback:string,option:object})=>void} [opts.onReject] 石碑不收這一片
 * @param {(info:{text:string})=>void} [opts.onComplete] 全部刻完
 * @param {()=>void} [opts.onTap] 牌子被按下去那一下（純聲音）
 * @param {string} [opts.eyebrow] 石碑上緣那一行小字
 */
export function createSlotStage({ onCarve, onReject, onComplete, onTap, eyebrow = '刻印中的 prompt' } = {}) {
  let slots = [];
  let carved = [];
  let index = 0;
  /** 前面那一段舞台（猜規律／秤兩面）還沒走完時，刻印區先鎖著。 */
  let locked = true;

  const root = document.createElement('div');
  root.className = 'slotstage';
  root.innerHTML = `
    <div class="stele" data-stele>
      <span class="stele__grain" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--a" aria-hidden="true"></span>
      <span class="stele__vein stele__vein--b" aria-hidden="true"></span>
      <span class="stele__crack" aria-hidden="true"></span>
      <p class="stele__eyebrow">${esc(eyebrow)}</p>
      <ol class="stele__lines" data-carved aria-live="polite"></ol>
      <p class="stele__empty" data-empty>石碑還是空的。想通上面那件事，它就會讓你刻。</p>
      <span class="stele__dust" data-dust aria-hidden="true"></span>
    </div>

    <div class="carve" data-carve hidden>
      <p class="carve__progress" data-progress></p>
      <p class="carve__ask" data-ask></p>
      <div class="carve__options" data-options aria-live="polite"></div>
      <p class="carve__tip">按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 也可以選，方向鍵在選項之間走。選錯不會失敗，石碑只是不收。</p>
    </div>
  `;

  const steleEl = root.querySelector('[data-stele]');
  const carvedEl = root.querySelector('[data-carved]');
  const emptyEl = root.querySelector('[data-empty]');
  const dustEl = root.querySelector('[data-dust]');
  const carveEl = root.querySelector('[data-carve]');
  const progressEl = root.querySelector('[data-progress]');
  const askEl = root.querySelector('[data-ask]');
  const optionsEl = root.querySelector('[data-options]');

  const slot = () => (index < slots.length ? slots[index] : null);
  const text = () => carved.map((c) => c.text).join('\n');
  const done = () => slots.length > 0 && index >= slots.length;

  function thud(kind = 'stamp') {
    steleEl.classList.remove('is-stamp', 'is-reject');
    void steleEl.offsetWidth;
    steleEl.classList.add(kind === 'reject' ? 'is-reject' : 'is-stamp');
    if (prefersReduced() || kind === 'reject') return;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'dust';
      bit.style.setProperty('--x', `${(Math.random() * 2 - 1) * 60}px`);
      bit.style.setProperty('--y', `${-18 - Math.random() * 46}px`);
      bit.style.setProperty('--r', `${(Math.random() * 2 - 1) * 220}deg`);
      bit.style.setProperty('--d', `${420 + Math.random() * 380}ms`);
      bit.style.setProperty('--s', `${0.5 + Math.random() * 1.1}`);
      dustEl.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  }

  function renderCarved() {
    emptyEl.hidden = carved.length > 0;
    carvedEl.innerHTML = carved
      .map(
        (c, i) =>
          `<li class="carved${i === carved.length - 1 ? ' is-fresh' : ''}" style="--i:${i}">${esc(
            c.text
          )}</li>`
      )
      .join('');
  }

  function renderQuestion() {
    const s = slot();
    if (locked) {
      carveEl.hidden = true;
      return;
    }
    if (!s) {
      carveEl.hidden = true;
      progressEl.textContent = `第 ${slots.length} / ${slots.length} 段 —— 刻完了`;
      askEl.textContent = '';
      optionsEl.innerHTML = '';
      steleEl.classList.add('is-full');
      return;
    }
    carveEl.hidden = false;
    steleEl.classList.remove('is-full');
    progressEl.textContent = `第 ${index + 1} / ${slots.length} 段`;
    askEl.textContent = s.ask;
    optionsEl.innerHTML = s.options
      .map((o, i) => {
        const body = String(o.text)
          .split('\n')
          .map((l) => `<span class="opt__line">${esc(l)}</span>`)
          .join('');
        return `<button class="opt" type="button" data-slot-opt="${i}" style="--i:${i}">
          <span class="opt__key" aria-hidden="true">${i + 1}</span>
          <span class="opt__text">${body}</span>
          <span class="opt__fb" data-opt-fb hidden></span>
        </button>`;
      })
      .join('');
  }

  function focusFirstOption() {
    const first = optionsEl.querySelector('.opt:not(.is-wrong)') || optionsEl.querySelector('.opt');
    if (!first) return;
    try {
      first.focus({ preventScroll: true });
    } catch {
      first.focus?.();
    }
  }

  /** 選了一個選項。對 → 刻上去；錯 → 石碑不收，附一句教學（不扣分、不前進）。 */
  function pick(i) {
    const s = slot();
    if (!s || locked) return null;
    const option = s.options[i];
    if (!option) return null;
    onTap?.();

    if (!option.correct) {
      const btn = optionsEl.querySelector(`[data-slot-opt="${i}"]`);
      if (btn) {
        btn.classList.add('is-wrong');
        btn.setAttribute('aria-disabled', 'true');
        const fb = btn.querySelector('[data-opt-fb]');
        if (fb) {
          fb.textContent = option.feedback || '這一片石碑不收。再看看其他選項。';
          fb.hidden = false;
        }
      }
      thud('reject');
      onReject?.({ feedback: option.feedback || '', option });
      return { correct: false, feedback: option.feedback || '' };
    }

    carved.push({ text: option.text, slot: index });
    index += 1;
    renderCarved();
    thud('stamp');
    renderQuestion();
    onCarve?.({ index, total: slots.length, text: text() });
    if (done()) onComplete?.({ text: text() });
    else focusFirstOption();
    return { correct: true };
  }

  on(root, '[data-slot-opt]', 'click', (e, target) => {
    pick(Number(target.getAttribute('data-slot-opt')));
  });

  rovingList(optionsEl, '.opt');

  root.addEventListener('keydown', (e) => {
    // 理由同 induct.js：`Enter` / 空白鍵自己接，不靠瀏覽器的預設 click
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const btn = e.target && e.target.closest ? e.target.closest('[data-slot-opt]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      pick(Number(btn.getAttribute('data-slot-opt')));
      return;
    }
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const s = slot();
    if (!s || locked || n > s.options.length) return;
    e.preventDefault();
    e.stopPropagation();
    pick(n - 1);
  });

  return {
    root,
    get text() {
      return text();
    },
    get done() {
      return done();
    },
    get locked() {
      return locked;
    },
    get progress() {
      return { carved: carved.length, total: slots.length };
    },
    get ask() {
      const s = slot();
      return s ? s.ask : '';
    },
    get focusTarget() {
      return optionsEl.querySelector('.opt');
    },
    /** 前面那段舞台走完了 → 開放刻印。 */
    unlock() {
      if (!locked) return false;
      locked = false;
      emptyEl.textContent = '石碑還是空的。從下面挑一段話，它就會刻上來。';
      renderQuestion();
      focusFirstOption();
      return true;
    },
    pick,
    focusFirstOption,
    load(nextSlots) {
      slots = isSlotList(nextSlots) ? nextSlots : [];
      carved = [];
      index = 0;
      locked = true;
      steleEl.classList.remove('is-full', 'is-stamp', 'is-reject', 'is-ignited');
      dustEl.innerHTML = '';
      emptyEl.textContent = '石碑還是空的。想通上面那件事，它就會讓你刻。';
      renderCarved();
      renderQuestion();
      return slots.length > 0;
    },
    /** 送出之後的點火動畫（手掌印按下去時由外面呼叫）。 */
    ignite() {
      steleEl.classList.add('is-ignited');
    },
  };
}

export default createSlotStage;

/**
 * Promptasy — 手掌印儀式（第四幕的那隻手）
 *
 * Phase 27：石碑刻印之外多了兩種作答方式（排序刻印、神諭工坊），
 * 三者的結尾必須**一模一樣**——同一隻手掌、同樣按住 600ms、同樣的光爆，
 * 然後走同一支 submit()。所以把這件事抽成一個共用零件。
 *
 * 兩條不能動的規則：
 *   1. 「按住夠久了沒」一律用**計時器**判定，不用動畫影格。
 *      慢裝置（或軟體渲染）一個影格可能要好幾百毫秒 —— 儀式的長度不該
 *      取決於畫面跑不跑得動。影格只負責畫那圈蓄力環。
 *   2. 鍵盤一定走得完：Enter / 空白鍵按住也算按住（keydown → keyup）。
 *
 * DOM 與 src/prompt/stele.js 裡那一份逐字相同（同一套 CSS、同一組
 * data-palm / .palm__ring / .palm__hand 把手），石碑那一份刻意不動——
 * 它是 Phase 11 就在跑的路徑，沒有理由為了少幾行程式碼冒回歸的險。
 */

/** 手掌要按住多久才會觸發（毫秒）。太短沒有儀式感，太長會煩。 */
export const PALM_HOLD_MS = 600;

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} opts
 * @param {string} [opts.lead]  手掌上方那一句（世界的說法，不是系統術語）
 * @param {() => boolean} [opts.ready] 現在按得下去嗎（還沒完成就按不動）
 * @param {() => void} [opts.onFire] 真的按滿了
 */
export function createPalm({ lead = '石碑已刻滿。把手掌按上去，讓神諭聽見。', ready, onFire } = {}) {
  let fired = false;
  let holding = false;
  let holdRaf = 0;
  let holdTimer = 0;
  let holdStart = 0;

  const root = document.createElement('div');
  root.className = 'palmwrap';
  root.hidden = true;
  root.innerHTML = `
    <p class="palmwrap__lead" data-palm-lead></p>
    <button class="palm" type="button" data-palm>
      <span class="palm__ring" aria-hidden="true"></span>
      <span class="palm__hand" aria-hidden="true">
        <span class="palm__finger"></span><span class="palm__finger"></span>
        <span class="palm__finger"></span><span class="palm__finger"></span>
        <span class="palm__thumb"></span><span class="palm__pad"></span>
      </span>
      <span class="palm__label">把手掌按上石碑</span>
      <span class="palm__hint">
        <span class="palm__hintline">按住不放</span>
        <span class="palm__hintline">或按住 <kbd>Enter</kbd></span>
      </span>
    </button>
  `;
  const leadEl = root.querySelector('[data-palm-lead]');
  const button = root.querySelector('[data-palm]');
  leadEl.textContent = lead;

  function canFire() {
    return !fired && (typeof ready !== 'function' || ready());
  }

  function fire() {
    if (!canFire()) return false;
    fired = true;
    stopHold(false);
    button.classList.add('is-fired');
    onFire?.();
    return true;
  }

  /** 蓄力環（純視覺）：跟著動畫影格填滿。 */
  function tickHold() {
    if (!holding) return;
    const p = Math.min(1, (performance.now() - holdStart) / PALM_HOLD_MS);
    button.style.setProperty('--hold', String(p));
    if (p >= 1) return;
    holdRaf = requestAnimationFrame(tickHold);
  }

  function startHold() {
    if (holding || !canFire()) return;
    holding = true;
    holdStart = performance.now();
    button.classList.add('is-holding');
    button.classList.remove('is-slipped');
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      fire();
    }, PALM_HOLD_MS);
    if (prefersReduced()) {
      button.style.setProperty('--hold', '1');
      return;
    }
    holdRaf = requestAnimationFrame(tickHold);
  }

  function stopHold(slipped = true) {
    if (!holding) return;
    holding = false;
    if (holdRaf) {
      cancelAnimationFrame(holdRaf);
      holdRaf = 0;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
    button.classList.remove('is-holding');
    button.style.setProperty('--hold', '0');
    if (slipped && !fired) button.classList.add('is-slipped');
  }

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startHold();
  });
  button.addEventListener('pointerup', () => stopHold(true));
  button.addEventListener('pointerleave', () => stopHold(true));
  button.addEventListener('pointercancel', () => stopHold(true));
  button.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    startHold();
  });
  button.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    stopHold(true);
  });
  // click 只在「按一下就放」時進來（真正的觸發走 hold）—— 給它一句提示就好
  button.addEventListener('click', (e) => e.preventDefault());

  return {
    root,
    button,
    get fired() {
      return fired;
    },
    /** 手掌出不出來（第四幕的鏡頭要落在它身上時才顯示）。 */
    show(next = true) {
      root.hidden = !next;
    },
    setLead(text) {
      leadEl.textContent = text;
    },
    /** 直接觸發（測試用，不必真的按住 600ms）。 */
    press: fire,
    reset() {
      fired = false;
      stopHold(false);
      button.classList.remove('is-fired', 'is-slipped');
      button.style.setProperty('--hold', '0');
      root.hidden = true;
    },
  };
}

export default createPalm;

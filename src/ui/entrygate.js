/**
 * Promptasy — 入場門（Phase 33）
 *
 * 瀏覽器的自動播放政策：沒有使用者手勢之前，AudioContext 會被凍在 suspended。
 * 首次造訪因此拿不到開場曲 —— 而標題卡的分字揭示本來就該和音樂一起發生，
 * 那一刻才是開場。
 *
 * Phase 32.5 的作法是「標題卡按兩下」（第一下喚醒音樂、第二下進入），
 * 但玩家不知道第一下在做什麼，通常直接連按穿過去，等於什麼都沒得到。
 *
 * 這裡改成把那一下手勢**獨立成一道門**：一片近乎全黑的畫面、一盞呼吸燈、
 * 一句話。推開它 → 音訊解鎖 → 門淡出 → 標題卡的揭示與開場曲同時開始。
 *
 * Phase 34：門面重做成「一盞呼吸燈」。原本是一枚印記加一個框、再加兩行字（中文一行、
 * 英文 enter 一行）——資訊不少，但看起來像一顆普通的按鈕。現在整道門只剩三樣東西，
 * 而且是**一件一件**出現的：
 *
 *   0.35s  呼吸燈亮起（唯一的光源，5.6 秒一次的慢呼吸）
 *   1.50s  「推開夜色之門」在光底下慢慢浮出來
 *   2.90s  「點擊進入⋯」再更淡地出現
 *
 * 三樣東西全部延遲 ≥0.3s 才出現，所以「探到自動播放其實放行、220ms 內撤掉這道門」
 * 的那條路上，玩家看到的只有一瞬間的黑，不會有字閃過去。
 * 推開的那一下會放一聲石門滑開的音（`gateOpen`），由 main.js 接在 onUnlock 上。
 *
 * 自動播放**被允許**的造訪（返客、`--autoplay-policy=no-user-gesture-required`
 * 的測試環境）根本不會看到這道門 —— main.js 在開機時先探測一次，
 * 音訊已經在跑就直接跳到標題卡（零摩擦）。
 *
 * 這裡不放官方出處、不放技巧宣稱 —— 它是世界的入口，不是課程（護欄 2）。
 */
import { el } from './dom.js';

/**
 * @param {object} opts
 * @param {() => void} [opts.onUnlock] **同步**在使用者手勢裡呼叫 —— 解鎖 AudioContext
 *   一定要待在這個 trusted gesture 的呼叫堆疊裡，晚一拍瀏覽器就不認了。
 * @param {() => void} [opts.onEnter] 門淡出之後呼叫（開標題卡）。
 * @param {number} [opts.fade] 淡出毫秒數。
 */
export function createEntryGate({ onUnlock, onEnter, fade = 600 } = {}) {
  const root = el('div', 'entrygate');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '推開夜色之門，進入 Promptasy');
  root.innerHTML = `
    <div class="entrygate__veil"></div>
    <div class="entrygate__inner">
      <button class="entrygate__enter" data-enter type="button">
        <span class="entrygate__orb" aria-hidden="true"></span>
        <span class="entrygate__line">推開夜色之門</span>
        <span class="sr-only">點擊或按任意鍵進入</span>
      </button>
    </div>
  `;

  let live = false;
  let done = false;

  function detach() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
  }

  /**
   * 淡出 → 收起來。
   * @param {boolean} silent 沒有經過手勢（探測發現自動播放其實放行了）：
   *   不觸發 onUnlock，而且標題卡**立刻**開始淡入，和門的淡出交叉，
   *   玩家不會看到「門的內容閃一下」也不會看到底下的世界。
   *   有手勢的正常路徑相反：先讓門完全退場，再讓標題卡登場（那是開場的鏡頭）。
   */
  function leave(silent) {
    if (done || !live) return;
    done = true;
    live = false;
    detach();
    // 解鎖一定要待在手勢的呼叫堆疊裡（不能包進 setTimeout / rAF）
    if (!silent) onUnlock?.();
    root.classList.add('is-leaving');
    if (silent) onEnter?.();
    setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving', 'is-open');
      if (!silent) onEnter?.();
    }, fade);
  }

  function onKey(e) {
    // Tab 留給無障礙導覽；Esc 在這裡不做任何事（這是入口，沒有東西可以關）
    if (e.key === 'Tab' || e.key === 'Escape') return;
    // 按著不放的自動重複不算新的一下（避免同一下鍵穿透到標題卡）
    if (e.repeat) return;
    e.preventDefault();
    leave(false);
  }
  function onPointer() {
    leave(false);
  }

  return {
    root,
    get isOpen() {
      return live;
    },
    get dismissed() {
      return done;
    },
    open() {
      if (done) return;
      root.hidden = false;
      live = true;
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPointer, true);
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        root.querySelector('[data-enter]')?.focus({ preventScroll: true });
      });
    },
    /**
     * 探測發現自動播放其實放行了 —— 門還沒被玩家看見就先撤掉。
     * 走的是同一段淡出，所以和標題卡的淡入剛好交叉，不會閃過世界。
     */
    skip() {
      if (!live) {
        // 還沒開就先撤：直接進標題卡
        if (done) return;
        done = true;
        onEnter?.();
        return;
      }
      leave(true);
    },
    /** 給自動化測試 / 「跳過」用。 */
    dismiss: () => leave(false),
  };
}

export default createEntryGate;

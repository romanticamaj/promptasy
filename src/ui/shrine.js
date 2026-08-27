/**
 * Promptasy — 回聲的小祠 ＋ 母碑（v1.2 · P22）
 *
 * 整趟旅程的最後一個畫面。它刻意**不是主控台**：沒有評價印章、沒有分數條、
 * 沒有「通過門檻」、沒有一條條列出你缺了什麼。因為這一次不是考試 ——
 * 130 條技法你都收齊了，這一段是「你已經學會說話了」的證明（WORLD.md §3.5 的極端解）。
 *
 * 三拍，一拍一個畫面：
 *
 *   ① **小祠把你的第一句還給你**（`renderSay()`）
 *      回聲兌現牠在序章說過的那句「我記得每個人的第一句話」：
 *      把玩家在序章寫下的第一句原樣擺出來（**一定要 `esc()`** —— 那是玩家打的字），
 *      底下就是重寫的地方。舊存檔沒有那一欄的人走退路：「把你最好的一句留在這裡」。
 *
 *   ② **牠聽懂了**（`renderHeard()`）
 *      判定在 `src/challenges/finale.js`（純函式、離線、**交不出「沒過」這種形狀**）。
 *      這裡只把「回聲聽見了什麼」列出來 —— 一律是「你說了……」，
 *      **一個字都不會講你少了什麼**。
 *
 *   ③ **刻不刻**（同一拍的下半，`renderHeard()` 的那兩顆）
 *      「刻上去」／「先不刻」。**沒有預先選好的那一個**，也沒有「記住我的選擇」：
 *      玩家自己打的字要留在帶得走的東西上，每一次都要重新問過。
 *      選「先不刻」＝ 那句話**根本不寫進存檔**（不存就不可能外流）。
 *
 * 另外一半是**讀碑**（`open('stele', text)`）：走到斷環中央按 `E`，讀碑上刻的那一行。
 * 留白的碑照樣讀得到 —— 它只是還沒有字。
 *
 * 這一支：不連網（那條路上一個網路呼叫都沒有）、不碰 three.js、
 * 玩家的字經過的每一個出口都 `esc()`。
 *
 * 鍵盤：`createOverlay` 負責焦點鎖與 `Esc`；那兩顆用 `rovingList()`（↑↓ / Home / End）。
 * **不新增任何快捷鍵**（`E` 是唯一的互動鍵）。
 */
import { el, esc, createOverlay, rovingList } from './dom.js';
import { listen, hasSomethingToSay } from '../challenges/finale.js';

/** 小祠開口時說的那幾句（世界的說法；回聲的口吻，不解釋規則、不用系統術語）。 */
export const SHRINE_LINES = Object.freeze([
  '我記得每個人的第一句話。',
  '這一句，是你剛到的時候說的。',
]);

/** 那一團濁氣底下那一行（它是誰）。 */
export const SAY_CAPTION = '最後一團濁氣，就是它。';

/** 聽完之後那一句 —— 沒有評價、沒有分數、沒有「還差什麼」。 */
export const HEARD_LEAD = '牠聽懂了。這一句，你替自己說完了。';

/** 問「刻不刻」的那一段（刻上去之前一定要明確確認）。 */
export const CARVE_ASK = '斷環中央的母碑要立起來了。這一句，要刻上去嗎？';
/**
 * 那一段小字：講清楚刻上去之後這句話會出現在哪裡。
 *
 * 「刻印記錄」＝ 分享卡在世界裡的說法（既有用語）。
 * 這句話不准含糊：玩家要知道自己按的那一下會讓私人的字出現在帶得走的東西上。
 */
export const CARVE_NOTE =
  '刻上去之後，它會出現在你帶得走的那張刻印記錄上。不刻也一樣立得起來——碑面留白，你想好了再回來。';

/** 碑面留白時，讀碑讀到的那一句。 */
export const BLANK_STELE = '碑面留白。';
/** 留白的碑底下那一行（回去還說得成）。 */
export const BLANK_HINT = '回小祠再說一次，就刻得上去。';

/**
 * 「回聲聽見了什麼」那一段的 HTML（抽出來讓 `test:rubric` 直接問它
 * 「有沒有出現一句話在講你少了什麼」）。
 *
 * 一條都沒聽見時**整段不出現** —— 不是「你什麼都沒說對」，是那張清單是空的。
 *
 * @param {string[]} heard `finale.listen()` 的 `heard`
 */
export function heardHtml(heard) {
  const rows = (heard || []).map((t, i) => `<li style="--i:${i}">${esc(t)}</li>`).join('');
  if (!rows) return '';
  return `<section class="rite__heard" aria-label="回聲聽見的">
      <p class="meta-label meta-label--star">回聲聽見了</p>
      <ul class="rite__heardlist">${rows}</ul>
    </section>`;
}

/**
 * 「你說的那一句」原樣擺出來（**玩家的字，一定要 escape**）。
 * @param {string} text
 */
export function saidHtml(text) {
  return `<pre class="rite__said">${esc(text)}</pre>`;
}

/**
 * @param {object} opts
 * @param {(payload:{choice:'carve'|'blank', text:string})=>void} opts.onFinish
 *   儀式走完那一拍（`choice` ＝ 玩家真的按下去的那一顆）
 * @param {(payload:{kind:string})=>void} [opts.onShare] 讀碑那一頁的「分享」
 * @param {()=>void} [opts.onClose]
 */
export function createShrine({ onFinish, onShare = null, onClose } = {}) {
  const overlay = createOverlay({
    id: 'shrine-rite',
    title: '回聲的小祠',
    subtitle: '它一直留著你的第一句話',
    eyebrow: '回聲的小祠',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--rite');

  const article = el('article', 'rite');
  overlay.body.appendChild(article);

  /** 這一次要還給玩家的那一句（`turning.finalSayFor()` 交進來的）。 */
  let saying = null;
  /** 玩家重寫的那一句（**只活在這支模組裡，直到玩家說「刻上去」**）。 */
  let rewrote = '';
  /** 'say' | 'heard' | 'stele' */
  let beat = '';

  /** 第一拍：小祠把你的第一句還給你，底下就是重寫的地方。 */
  function renderSay() {
    beat = 'say';
    const lines = SHRINE_LINES.map((t, i) => `<p class="rite__line" style="--i:${i}">${esc(t)}</p>`).join('');
    article.innerHTML = `<div class="rite__mark" aria-hidden="true"></div>
      ${lines}
      ${saidHtml(saying.say)}
      <p class="rite__caption" style="--i:3">${esc(SAY_CAPTION)}</p>
      <p class="rite__ask" style="--i:4">${esc(saying.ask)}</p>
      <label class="rite__label" for="rite-input">你要說的那一句</label>
      <textarea id="rite-input" class="rite__input" rows="4" spellcheck="false"
        placeholder="把你要的樣子說出來……"></textarea>
      <div class="rite__acts">
        <button class="btn btn--primary" type="button" data-offer disabled>呈給神諭</button>
      </div>
      <p class="rite__hint"><kbd>Esc</kbd> 先走開，小祠不會關上</p>`;
    const input = article.querySelector('#rite-input');
    const offer = article.querySelector('[data-offer]');
    if (input && offer) {
      input.value = rewrote;
      offer.disabled = !hasSomethingToSay(rewrote);
      input.addEventListener('input', () => {
        rewrote = input.value;
        // 「什麼都還沒寫」不是沒通過，是還沒開口 —— 所以那一下按不下去，而不是被退回
        offer.disabled = !hasSomethingToSay(rewrote);
      });
    }
    return input;
  }

  /**
   * 第二拍：牠聽懂了 ＋ 刻不刻。
   *
   * **這裡沒有失敗的那一支路。** 不管 `heard` 是六條還是零條，
   * 上面那句話都一樣、下面那兩顆也一樣。
   */
  function renderHeard() {
    beat = 'heard';
    const res = listen(rewrote);
    article.innerHTML = `<div class="rite__mark" aria-hidden="true"></div>
      <p class="rite__lead" style="--i:0">${esc(HEARD_LEAD)}</p>
      ${saidHtml(res.said)}
      ${heardHtml(res.heard)}
      <p class="rite__ask rite__ask--carve" style="--i:2">${esc(CARVE_ASK)}</p>
      <p class="rite__note" style="--i:3">${esc(CARVE_NOTE)}</p>
      <div class="rite__choices" role="group" aria-label="要不要刻上去">
        <button class="btn btn--primary rite__choice" type="button" data-choice="carve">刻上去</button>
        <button class="btn btn--ghost rite__choice" type="button" data-choice="blank">先不刻</button>
      </div>
      <p class="rite__hint"><kbd>↑</kbd><kbd>↓</kbd> 挑一個 · <kbd>Enter</kbd> 決定</p>`;
    rovingList(article.querySelector('.rite__choices'), '.rite__choice');
    return article.querySelector('[data-choice="carve"]');
  }

  /** 讀碑：碑上刻的那一行（留白的碑照樣讀得到）。 */
  function renderStele(text) {
    beat = 'stele';
    const carved = typeof text === 'string' && text.trim().length > 0;
    article.innerHTML = `<div class="rite__mark" aria-hidden="true"></div>
      ${
        carved
          ? `<p class="rite__lead" style="--i:0">母碑又立起來了。上面刻的是你自己寫的那一句。</p>
             ${saidHtml(text)}`
          : `<p class="rite__lead" style="--i:0">${esc(BLANK_STELE)}</p>
             <p class="rite__caption" style="--i:1">${esc(BLANK_HINT)}</p>`
      }
      <div class="rite__acts">
        <button class="btn btn--ghost" type="button" data-share>分享這塊碑</button>
      </div>
      <p class="rite__hint"><kbd>Esc</kbd> 收起，繼續走</p>`;
    return article.querySelector('[data-share]');
  }

  article.addEventListener('click', (e) => {
    if (e.target.closest('[data-offer]')) {
      const focus = renderHeard();
      focus?.focus();
      return;
    }
    const choice = e.target.closest('[data-choice]');
    if (choice) {
      const pick = choice.getAttribute('data-choice') === 'carve' ? 'carve' : 'blank';
      /*
       * 玩家的字只在這一刻離開這支模組，而且**帶著他剛剛按的那一顆一起走**——
       * 「要不要留下來」不是這裡決定的，是 `inscriptionFor(choice, text)` 那道閘
       * （不是明確的 `'carve'` 一律回空字串）。兩邊都送，是為了讓那道閘只有一份。
       */
      const text = rewrote;
      api.close();
      onFinish?.({ choice: pick, text });
      return;
    }
    if (e.target.closest('[data-share]')) onShare?.({ kind: 'stele' });
  });

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /** 現在停在哪一拍（測試／除錯用）。 */
    get beat() {
      return beat;
    },
    /**
     * 開起來。這一層有兩種開法（同一扇窗、同一個 `Esc`）：
     *   · `'rite'`  —— 走進小祠的儀式（`payload` ＝ `turning.finalSayFor()` 的那一包）
     *   · `'stele'` —— 走到斷環中央讀碑（`payload` ＝ 碑上那一行，空字串＝留白）
     *
     * @param {'rite'|'stele'} kind
     * @param {object|string} payload
     */
    open(kind, payload) {
      if (kind === 'stele') {
        overlay.setEyebrow('母碑');
        overlay.setTitle('母碑', '斷環中央那塊碑');
        overlay.resetScroll?.();
        const focus = renderStele(typeof payload === 'string' ? payload : '');
        overlay.open({ focus: focus || undefined });
        return;
      }
      saying = payload && typeof payload === 'object' ? payload : { mode: 'best', say: '', ask: '' };
      rewrote = '';
      overlay.setEyebrow('回聲的小祠');
      overlay.setTitle('回聲的小祠', '它一直留著你的第一句話');
      overlay.resetScroll?.();
      const focus = renderSay();
      overlay.open({ focus: focus || undefined });
    },
    close() {
      overlay.close();
      saying = null;
      rewrote = '';
      beat = '';
      onClose?.();
    },
  };
  return api;
}

export default createShrine;

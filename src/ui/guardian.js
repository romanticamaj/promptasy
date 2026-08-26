/**
 * Promptasy — 守門者的小窗（v1.2 · P18）
 *
 * 跟守夜人同一個尺度（一張小窗、幾行字、底下幾個**用選的**選項），多的是最上面那一塊：
 * **他身上那份交辦** —— 一份玩家看得見的 system prompt。那份交辦就是教材本身
 * （指令階層、規矩排在資料前面、界定符、挑罕見的界定符、把會出事的那一步換個形狀、
 * 動作前確認、先替他試過假扮的委託），每一行對上了就亮起來。
 *
 * **沒有失敗態**：沒對上的那幾行寫的是「還在等什麼」，不是「你錯了」。
 * 對上的行**永不暗回去**（進度只累積，同大濁靈的規則疊加）。
 *
 * 判定全部在 `src/challenges/guardian.js`（純函式、離線、零相依），這裡只負責畫。
 * 護欄 2：出處那一格顯示的連結來自 `challenges.json` 裡那一關自己的官方網址
 * （由 `main.js` 在 `context.sourceFor()` 交進來），這個檔案不寫任何技巧宣稱、不編任何出處。
 *
 * 鍵盤：`createOverlay` 負責焦點鎖與 `Esc`；選項用 `rovingList()`（↑↓ / Home / End）。
 * **不新增任何快捷鍵**（`E` 是唯一的互動鍵）。
 */
import { el, esc, createOverlay, bindInfoTips, rovingList, sourceBook } from './dom.js';

/** 官方出處在畫面上的說法（與主控台第二幕、守夜人一致）。 */
export const SOURCE_LABEL = '神諭原典';

/**
 * 交辦那一塊的 HTML（抽出來讓 `test:rubric` 直接問它「亮了幾行、有沒有失敗態」）。
 * @param {object} charge guardian.json 的 `charge`
 * @param {Array} rows `latchStatus()` 的結果
 * @param {{open:number,need:number,total:number,convinced:boolean}} tally
 */
export function chargeHtml(charge, rows, tally) {
  const items = rows
    .map(
      (r, i) => `<li class="guard__clause${r.open ? ' is-open' : ''}" style="--i:${i}">
        <span class="guard__seal" aria-hidden="true"></span>
        <span class="guard__text">${esc(r.clause)}</span>
        <span class="guard__state">${esc(r.open ? '對上了' : r.waiting)}</span>
      </li>`
    )
    .join('');
  const line = tally.convinced
    ? `交辦上對得起來的都對上了（${tally.open} / ${tally.total} 行）。`
    : `對上了 ${tally.open} 行，還差 ${Math.max(0, tally.need - tally.open)} 行他就動得了（${tally.total} 行裡取 ${tally.need}）。`;
  return `<section class="guard__charge" aria-label="他身上那份交辦">
      <p class="meta-label meta-label--star">${esc(charge.title || '他身上那份交辦')}</p>
      <p class="guard__intro">${esc(charge.intro || '')}</p>
      <ol class="guard__clauses">${items}</ol>
      <p class="guard__closing">${esc(charge.closing || '')}</p>
      <p class="guard__tally">${esc(line)}</p>
    </section>`;
}

/**
 * 「你剛剛說的那一句」——真的送進評分引擎的那一段字，原樣擺出來給玩家看。
 * 這一格是教學的一半：他為什麼動，看得到是哪一句話讓他動的。
 */
export function saidHtml(text) {
  return `<pre class="guard__said" aria-label="你說的那一句">${esc(text)}</pre>`;
}

/**
 * @param {object} opts
 * @param {(payload:{guardianId:string, optionId:string, branchId:string|null, opened:string[], convinced:boolean})=>void} [opts.onSay]
 * @param {()=>void} [opts.onClose]
 */
export function createGuardian({ onSay, onClose } = {}) {
  const overlay = createOverlay({
    id: 'guardian',
    title: '守門者',
    subtitle: '帶著一份交辦站在門邊的人',
    eyebrow: '守門者',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--guardian');

  const article = el('article', 'guard');
  overlay.body.appendChild(article);
  bindInfoTips(overlay.body);

  let entry = null;
  let ctx = null;
  /** 換過幾批選項（不進存檔 —— 走開再回來從頭排）。 */
  let turn = 0;

  const line = (text, i) => `<p class="guard__line" style="--i:${i}">${esc(text)}</p>`;

  /** 交辦 ＋ 選項。 */
  function renderMenu(greetLines) {
    const rows = ctx.latches();
    const tally = ctx.tally();
    const greet = (greetLines || []).map((t, i) => line(t, i)).join('');
    const opts = ctx
      .options(turn)
      .map(
        (o, i) =>
          `<button class="guard__opt" type="button" data-option="${esc(o.id)}" style="--i:${i + 2}">${esc(o.label)}</button>`
      )
      .join('');
    article.innerHTML = `<div class="guard__rule" aria-hidden="true"></div>${greet}
      ${chargeHtml(ctx.charge, rows, tally)}
      <div class="guard__opts" role="group" aria-label="你可以說">${opts}</div>
      <div class="guard__acts"><button class="btn btn--ghost" type="button" data-more-opts>換一批話</button></div>
      <p class="guard__hint"><kbd>↑</kbd><kbd>↓</kbd> 挑一句 · <kbd>Enter</kbd> 說 · <kbd>Esc</kbd> 走開</p>`;
    rovingList(article.querySelector('.guard__opts'), '.guard__opt');
    return article.querySelector('.guard__opt');
  }

  /** 他的反應。 */
  function renderReply(res, said) {
    const body = (res.say || []).map((t, i) => line(t, i + 1)).join('');
    const src = res.source ? `<p class="srcrow">${sourceBook(res.source, { label: SOURCE_LABEL })}</p>` : '';
    const opened = res.opened && res.opened.length
      ? `<p class="guard__opened">${esc(res.openedLine)}</p>`
      : '';
    const tally = ctx.tally();
    const tail = res.convinced
      ? `<div class="guard__done">${(res.closing || []).map((t, i) => line(t, i + 3)).join('')}</div>`
      : '';
    article.innerHTML = `<div class="guard__rule" aria-hidden="true"></div>
      <p class="guard__eyebrow">${esc(res.eyebrow || '')}</p>
      ${saidHtml(said)}${body}${opened}${src}${tail}
      <p class="guard__tally">${esc(
        res.convinced
          ? `交辦上對得起來的都對上了（${tally.open} / ${tally.total} 行）。`
          : `對上了 ${tally.open} 行，還差 ${Math.max(0, tally.need - tally.open)} 行他就動得了。`
      )}</p>
      <div class="guard__acts">
        <button class="btn btn--primary" type="button" data-back>再說一句</button>
      </div>
      <p class="guard__hint"><kbd>Tab</kbd> 換選項 · <kbd>Enter</kbd> 決定 · <kbd>Esc</kbd> 走開</p>`;
    return article.querySelector('[data-back]');
  }

  article.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-option]');
    if (opt) {
      const id = opt.getAttribute('data-option');
      const res = ctx.say(id);
      if (!res) return;
      const focus = renderReply(res, res.said);
      onSay?.({
        guardianId: entry ? entry.id : '',
        optionId: id,
        branchId: res.branchId,
        opened: (res.opened || []).slice(),
        convinced: Boolean(res.convinced),
      });
      focus?.focus();
      return;
    }
    if (e.target.closest('[data-more-opts]')) {
      turn += 1;
      const focus = renderMenu(null);
      focus?.focus();
      return;
    }
    if (e.target.closest('[data-back]')) {
      const focus = renderMenu(null);
      focus?.focus();
    }
  });

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /** 現在開的是哪一位（測試／除錯用）。 */
    get guardianId() {
      return entry ? entry.id : null;
    },
    /**
     * @param {object} spec guardian.json
     * @param {object} context main.js 交進來的：`charge` / `latches()` / `tally()` /
     *   `options(turn)` / `say(optionId)`（回傳 `decide()` 裹好的反應）
     */
    open(spec, context) {
      entry = spec;
      ctx = context;
      turn = 0;
      overlay.setEyebrow('守門者');
      overlay.setTitle(spec.name || '守門者', spec.post || '帶著一份交辦站在門邊的人');
      overlay.resetScroll?.();
      const focus = renderMenu(ctx.greet());
      overlay.open({ focus: focus || undefined });
    },
    close() {
      overlay.close();
      entry = null;
      ctx = null;
      turn = 0;
      onClose?.();
    },
  };
  return api;
}

export default createGuardian;

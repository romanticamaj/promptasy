/**
 * Promptasy — 守夜人的小窗（v1.2 · P16c）
 *
 * 這是世界裡**第一場對話**。刻意做得跟石碑、殘頁同一個尺度：一張小窗、幾行字、
 * 底下幾個**用選的**選項（站長定調：用選的，不打字 —— 打字那件事留給主控台）。
 *
 * 四種情報（`src/progression/watchtalk.js` 算，這裡只負責畫）：
 *   卡關提示 ／ 指路 ／ 世界觀故事 ／ 技巧小知識。
 * **沒得講的那一項不出現** —— 不畫一個按不出東西的選項。
 *
 * 護欄 2：技巧那一項顯示的每一個字都來自 `skill-codex-v2.json`
 * （技能名、`oneLiner`、它自己的官方連結）；這裡不寫任何技巧宣稱、不編任何出處。
 * 其餘的話（招呼、舊事、指路、卡關）是世界的話，一律 `authored: "game"`，不掛連結。
 *
 * 鍵盤：`createOverlay` 負責焦點鎖與 `Esc`；選項用 `rovingList()`（↑↓ / Home / End）。
 * **不新增任何快捷鍵**（`E` 是唯一的互動鍵）。
 */
import { el, esc, createOverlay, bindInfoTips, rovingList, sourceBook } from './dom.js';

/** 官方出處在畫面上的說法（與主控台第二幕一致）。 */
export const SOURCE_LABEL = '神諭原典';

/**
 * @param {object} opts
 * @param {(payload:{watchmanId:string, topic:string})=>void} [opts.onTopic] 玩家問了一種情報（記進存檔）
 * @param {()=>void} [opts.onClose]
 */
export function createWatchman({ onTopic, onClose } = {}) {
  const overlay = createOverlay({
    id: 'watchman',
    title: '守夜人',
    subtitle: '提著燈站在那裡的人',
    eyebrow: '守夜人',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--watchman');

  const article = el('article', 'watch');
  overlay.body.appendChild(article);
  bindInfoTips(overlay.body);

  /** 現在開的是哪一位（`ctx` 由 main.js 在 open() 時交進來）。 */
  let entry = null;
  let ctx = null;
  /** 這一次對話裡，故事說到第幾拍（不進存檔 —— 走開再回來他從頭說起）。 */
  let step = 0;

  const line = (text, i) => `<p class="watch__line" style="--i:${i}">${esc(text)}</p>`;

  /** 選項清單（招呼 ＋ 幾個問句）。 */
  function renderMenu() {
    step = 0;
    const greet = (ctx.greet || []).map((t, i) => line(t, i)).join('');
    const opts = (ctx.topics || [])
      .map(
        (t, i) =>
          `<button class="watch__opt" type="button" data-topic="${esc(t.id)}" style="--i:${i + 2}">${esc(t.label)}</button>`
      )
      .join('');
    article.innerHTML = `<div class="watch__mark" aria-hidden="true"></div>${greet}
      <div class="watch__opts" role="group" aria-label="要問什麼">${opts}</div>
      <p class="watch__hint"><kbd>↑</kbd><kbd>↓</kbd> 挑一句 · <kbd>Enter</kbd> 問 · <kbd>Esc</kbd> 走開</p>`;
    rovingList(article.querySelector('.watch__opts'), '.watch__opt');
    return article.querySelector('.watch__opt');
  }

  /** 一個回答。 */
  function renderAnswer(topic) {
    const res = ctx.answer(topic, step) || { lines: [] };
    const body = (res.lines || []).map((t, i) => line(t, i)).join('');
    const note = res.html || '';
    const acts = [];
    if (res.more) acts.push('<button class="btn btn--primary" type="button" data-more>再說一點</button>');
    acts.push('<button class="btn btn--ghost" type="button" data-back>還想問別的</button>');
    article.innerHTML = `<div class="watch__mark" aria-hidden="true"></div>
      <p class="watch__eyebrow">${esc(res.eyebrow || '')}</p>${body}${note}
      <div class="watch__acts">${acts.join('')}</div>
      <p class="watch__hint"><kbd>Tab</kbd> 換選項 · <kbd>Enter</kbd> 決定 · <kbd>Esc</kbd> 走開</p>`;
    return article.querySelector('[data-more]') || article.querySelector('[data-back]');
  }

  article.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-topic]');
    if (opt) {
      const topic = opt.getAttribute('data-topic');
      step = 0;
      const focus = renderAnswer(topic);
      onTopic?.({ watchmanId: entry ? entry.id : '', topic });
      focus?.focus();
      return;
    }
    if (e.target.closest('[data-more]')) {
      step += 1;
      // 「再說一點」永遠是同一種情報的下一拍（目前只有舊事會多於一拍）
      const topic = 'lore';
      const focus = renderAnswer(topic);
      focus?.focus();
      return;
    }
    if (e.target.closest('[data-back]')) {
      const focus = renderMenu();
      focus?.focus();
    }
  });

  const api = {
    root: overlay.root,
    get isOpen() {
      return overlay.isOpen;
    },
    /** 現在開的是哪一位（測試／除錯用）。 */
    get watchmanId() {
      return entry ? entry.id : null;
    },
    /**
     * @param {object} spec watchmen.json 的一列
     * @param {{greet:string[], topics:Array<{id:string,label:string}>,
     *          answer:(topic:string, step:number)=>({eyebrow:string, lines:string[], html?:string, more?:boolean})}} context
     */
    open(spec, context) {
      entry = spec;
      ctx = context || { greet: [], topics: [], answer: () => ({ lines: [] }) };
      overlay.setEyebrow('守夜人');
      overlay.setTitle(spec.name || '守夜人', spec.post || '提著燈站在那裡的人');
      overlay.resetScroll?.();
      const focus = renderMenu();
      overlay.open({ focus: focus || undefined });
    },
    close() {
      overlay.close();
      entry = null;
      ctx = null;
      step = 0;
      onClose?.();
    },
  };
  return api;
}

/**
 * 技巧小知識那一段的 HTML（**引用**既有技能：名稱 ＋ oneLiner ＋ 可點的官方連結）。
 * 抽出來是為了讓 `test:rubric` 直接問它「連結有沒有畫出來」。
 * @param {{nameZh:string, oneLiner:string, source:{url:string,name:string,vendor?:string}|null}} note
 */
export function skillNoteHtml(note) {
  if (!note) return '';
  const src = note.source ? { url: note.source.url, name: note.source.name } : null;
  return `<section class="watch__glyph">
      <p class="meta-label meta-label--star">神諭原典裡寫過</p>
      <h4 class="watch__tech">${esc(note.nameZh)}</h4>
      <p class="watch__tip">${esc(note.oneLiner)}</p>
      ${src ? `<p class="srcrow">${sourceBook(src, { label: SOURCE_LABEL })}</p>` : ''}
    </section>`;
}

export default createWatchman;

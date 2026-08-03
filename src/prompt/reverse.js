/**
 * Promptasy — 拆碑（reverse-engineering · 逆向拆解）
 *
 * 課程 v2 · Phase J 的新題型，還是**石碑刻印的變體**（不是另一套系統）：
 * 前面多一段「先把一份寫好的委託拆開來讀」的舞台，讀通了才回到同一件事 ——
 * 一段一段刻 prompt（共用 `slots.js` 的刻寫台與 `palm.js` 的結尾）。
 *
 *   起：牆上釘著一份**已經寫得很好**的舊委託，被拆成幾塊
 *   承：一塊一塊替它貼上名字 —— 這一塊是為了什麼在這裡？
 *   轉：有一塊看起來像另一條技巧，其實不是（那個牌子就掛在眼前，貼錯只會就地教學）
 *   合：拆完之後，把「下次怎麼確認自己抄的還是現行版本」寫成一段委託刻上石碑
 *
 * 為什麼要做這一種：圖鑑是一本被動的收集冊。拆碑把它翻過來 ——
 * 你不是再讀一次說明，而是**主動回想**「這一段在做什麼」。這是複習的形狀。
 *
 * ## 三條規則跟其他題型同源（WORLD.md §3.3b）
 *   1. **不會失敗**。貼錯只是「碑不收這個名字」＋ 就地長出一句白話教學，
 *      不扣分、不前進、不跳失敗面板。
 *   2. **鍵盤走得完**（§3.1 鐵則）。方向鍵在名牌之間走、`Enter` 貼上去、
 *      `1` `2` `3` … 快捷；**`Esc` 是「拆回來」不是「關面板」**（見下方契約）。
 *   3. **送出的是同一段文字**，走同一支離線引擎（護欄 3）。
 *
 * ## `Esc` 的鍵位契約（分段還原，由內往外）
 *   ① 已經貼好至少一塊 → 把**最後貼上去的那一塊**拆回來，焦點回到它身上
 *   ② 一塊都還沒貼    → 不攔截，讓事件冒泡出去 → 主控台收起這一層
 *   每一段都會用 `aria-live` 講出來。
 *
 * ## 鍵位
 *   `↑` `↓`（`←` `→` 同義） 在名牌之間走 · `Enter` / `1` `2` `3` 貼上那一個名字
 *   `Esc`                   拆回最後貼上去的那一塊（沒有可拆的才收面板）
 *   按住 `Enter`（手掌上）  呈給神諭
 */
import { esc, on, rovingList } from '../ui/dom.js';
import { createPalm, PALM_HOLD_MS } from './palm.js';
import { createSlotStage, isSlotList } from './slots.js';

export { PALM_HOLD_MS };

/**
 * 這一份拆碑資料合不合法（不合法就退回石碑刻印，見 console.js 的 flowKind）。
 *
 * 硬性契約：
 *   · 至少 3 個名牌、至少 3 塊；每一塊的 `tagId` 都指得到一個真的名牌
 *   · **每個名牌都寫得出 `miss`** —— 貼錯的人一定拿得到一句教學，不是「再試一次」
 *   · 每一塊都寫得出 `why`（貼對之後就地說出「這一塊為什麼在這裡」）
 */
export function isReverseFlow(data) {
  if (!data || !Array.isArray(data.tags) || data.tags.length < 3) return false;
  if (!Array.isArray(data.parts) || data.parts.length < 3) return false;
  const okTag = (t) =>
    t &&
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    typeof t.name === 'string' &&
    t.name.trim().length > 0 &&
    typeof t.miss === 'string' &&
    t.miss.trim().length > 0;
  if (!data.tags.every(okTag)) return false;
  const ids = new Set(data.tags.map((t) => t.id));
  if (ids.size !== data.tags.length) return false;
  return data.parts.every(
    (p) =>
      p &&
      typeof p.text === 'string' &&
      p.text.trim().length > 0 &&
      ids.has(p.tagId) &&
      typeof p.why === 'string' &&
      p.why.trim().length > 0
  );
}

/**
 * @param {object} opts
 * @param {(info:{index:number,total:number,part:object})=>void} [opts.onLabel]  貼對一塊
 * @param {(info:{feedback:string})=>void} [opts.onReject]                       貼錯（碑不收這個名字）
 * @param {(info:{part:object})=>void} [opts.onRestore]                          拆回一塊（Esc）
 * @param {(info:{index:number,total:number,text:string})=>void} [opts.onCarve]  刻上一段
 * @param {(info:{text:string})=>void} [opts.onComplete]                         全部刻完
 * @param {(info:{text:string})=>void} [opts.onPress]                            手掌按下去
 * @param {()=>void} [opts.onTap]                                                牌子被按下去那一下
 * @param {(msg:string)=>void} [opts.onAnnounce]                                 aria-live 講了什麼（測試用）
 */
export function createReverseBoard({
  onLabel,
  onReject,
  onRestore,
  onCarve,
  onComplete,
  onPress,
  onTap,
  onAnnounce,
} = {}) {
  let flow = null;
  /** 拆到第幾塊（等於 parts.length 就是拆完了）。 */
  let at = 0;

  const root = document.createElement('div');
  root.className = 'reverseboard';
  root.innerHTML = `
    <section class="taken" data-taken>
      <p class="taken__eyebrow" data-taken-label>牆上釘著的那一份</p>
      <p class="taken__lead" data-taken-lead></p>
      <ol class="taken__parts" data-parts></ol>
      <p class="taken__rule" data-rule hidden></p>
    </section>

    <div class="carve carve--label" data-label>
      <p class="carve__progress" data-label-progress></p>
      <p class="carve__ask" data-label-ask></p>
      <div class="carve__options" data-tags aria-live="polite"></div>
      <p class="carve__tip">
        方向鍵在名牌之間走，<kbd>Enter</kbd> 或 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 貼上那一個名字。
        <kbd>Esc</kbd> 拆回剛剛貼好的那一塊。貼錯不會失敗，碑只是不收這個名字。
      </p>
    </div>
    <p class="sr-only" data-live aria-live="polite"></p>
  `;

  const takenLabelEl = root.querySelector('[data-taken-label]');
  const takenLeadEl = root.querySelector('[data-taken-lead]');
  const partsEl = root.querySelector('[data-parts]');
  const ruleEl = root.querySelector('[data-rule]');
  const labelEl = root.querySelector('[data-label]');
  const labelProgressEl = root.querySelector('[data-label-progress]');
  const labelAskEl = root.querySelector('[data-label-ask]');
  const tagsEl = root.querySelector('[data-tags]');
  const liveEl = root.querySelector('[data-live]');

  const stage = createSlotStage({
    eyebrow: '刻印中的 prompt',
    onCarve: (info) => onCarve?.(info),
    onReject: (info) => onReject?.(info),
    onComplete: (info) => {
      palm.show(true);
      onComplete?.(info);
      focusEl(palm.button);
    },
    onTap: () => onTap?.(),
  });
  root.appendChild(stage.root);

  const palm = createPalm({
    lead: '整份都拆開讀過了，也刻上去了。把手掌按上去，讓神諭聽見。',
    ready: () => stage.done,
    onFire: () => {
      stage.ignite();
      onPress?.({ text: stage.text });
    },
  });
  root.appendChild(palm.root);

  function say(msg) {
    liveEl.textContent = msg;
    onAnnounce?.(msg);
  }

  function focusEl(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus?.();
    }
  }

  const tagById = (id) => (flow ? flow.tags.find((t) => t.id === id) : null);
  const takenAll = () => Boolean(flow) && at >= flow.parts.length;

  function renderParts() {
    if (!flow) {
      partsEl.innerHTML = '';
      return;
    }
    takenLabelEl.textContent = flow.wall || '牆上釘著的那一份';
    takenLeadEl.textContent = flow.lead || '';
    partsEl.innerHTML = flow.parts
      .map((p, i) => {
        const done = i < at;
        const now = i === at;
        const tag = done ? tagById(p.tagId) : null;
        return `<li class="takenpart${done ? ' is-named' : ''}${now ? ' is-now' : ''}" style="--i:${i}" data-part="${i}">
          <span class="takenpart__n" aria-hidden="true">${i + 1}</span>
          <span class="takenpart__body">
            <span class="takenpart__text">${esc(p.text)}</span>
            ${
              done
                ? `<span class="takenpart__tag">${esc(tag ? tag.name : p.tagId)}</span>
                   <span class="takenpart__why">${esc(p.why)}</span>`
                : ''
            }
          </span>
        </li>`;
      })
      .join('');
    ruleEl.hidden = !takenAll();
    if (takenAll()) ruleEl.textContent = flow.settled || '整份拆開來看，每一塊都有它在這裡的理由。';
  }

  function renderTags() {
    if (!flow) return;
    if (takenAll()) {
      labelEl.hidden = true;
      tagsEl.innerHTML = '';
      return;
    }
    labelEl.hidden = false;
    const p = flow.parts[at];
    labelProgressEl.textContent = `第 ${at + 1} / ${flow.parts.length} 塊`;
    labelAskEl.textContent = p.ask || flow.ask || '這一塊是為了什麼在這裡？';
    tagsEl.innerHTML = flow.tags
      .map(
        (t, i) => `<button class="opt opt--tag" type="button" data-tag="${esc(t.id)}" style="--i:${i}">
          <span class="opt__key" aria-hidden="true">${i + 1}</span>
          <span class="opt__text">
            <span class="opt__line">${esc(t.name)}</span>
            ${t.gist ? `<span class="opt__gist">${esc(t.gist)}</span>` : ''}
          </span>
          <span class="opt__fb" data-opt-fb hidden></span>
        </button>`
      )
      .join('');
  }

  function focusFirstTag() {
    focusEl(tagsEl.querySelector('.opt:not(.is-wrong)') || tagsEl.querySelector('.opt'));
  }

  /**
   * 貼一個名字上去。
   * 對 → 這一塊被標好，就地寫出「它為什麼在這裡」，往下一塊走。
   * 錯 → 碑不收這個名字：那個牌子留在原地 ＋ 就地教學（不扣分、不前進）。
   */
  function label(tagId) {
    if (!flow || palm.fired || takenAll()) return null;
    const part = flow.parts[at];
    const tag = tagById(tagId);
    if (!tag) return null;
    onTap?.();

    if (tag.id !== part.tagId) {
      const feedback =
        (part.misses && part.misses[tag.id]) || tag.miss || '這一塊不是在做這件事。再看一次它寫了什麼。';
      const btn = tagsEl.querySelector(`[data-tag="${CSS.escape(String(tag.id))}"]`);
      if (btn) {
        btn.classList.add('is-wrong');
        btn.setAttribute('aria-disabled', 'true');
        const fb = btn.querySelector('[data-opt-fb]');
        if (fb) {
          fb.textContent = feedback;
          fb.hidden = false;
        }
      }
      const li = partsEl.querySelector(`[data-part="${at}"]`);
      if (li) {
        li.classList.remove('is-bounce');
        void li.offsetWidth;
        li.classList.add('is-bounce');
      }
      say(feedback);
      onReject?.({ feedback, tag });
      return { correct: false, feedback };
    }

    at += 1;
    renderParts();
    renderTags();
    const done = takenAll();
    say(
      done
        ? '整份都拆開讀過了。現在把「下次怎麼確認自己抄的還是現行版本」刻上石碑。'
        : `對了。這一塊是「${tag.name}」——${part.why}`
    );
    onLabel?.({ index: at, total: flow.parts.length, part, tag, done });
    if (done) stage.unlock();
    else focusFirstTag();
    return { correct: true };
  }

  /**
   * 拆回來：把最後貼上去的那一塊還原成沒有名字的樣子。
   * 這是 `Esc` 契約的第一段 —— 不會失敗、不扣分，只是把一步收回來。
   */
  function restore() {
    if (!flow || palm.fired || at <= 0 || stage.progress.carved > 0) return false;
    at -= 1;
    const part = flow.parts[at];
    renderParts();
    renderTags();
    say(`拆回第 ${at + 1} 塊，名字取下來了。`);
    focusFirstTag();
    onRestore?.({ part, index: at });
    return true;
  }

  on(root, '[data-tag]', 'click', (e, target) => {
    label(target.getAttribute('data-tag'));
  });

  rovingList(tagsEl, '.opt');

  labelEl.addEventListener('keydown', (e) => {
    /* --- Esc：分段還原（見檔頭的鍵位契約） --- */
    if (e.key === 'Escape') {
      if (at > 0 && !takenAll()) {
        e.preventDefault();
        e.stopPropagation();
        restore();
      }
      return; // 沒有東西可以拆回來 → 讓它冒泡出去收起這一層
    }
    /*
     * `Enter` / 空白鍵一律自己處理，不靠瀏覽器把它翻成 click ——
     * 純鍵盤（以及 CDP 送進來的原始按鍵）在按鈕上不一定會產生預設的 click
     * （改碑、點碑、推規碑、轉鈕當初都是為了同一個原因自己接的）。
     */
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const btn = e.target && e.target.closest ? e.target.closest('[data-tag]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      label(btn.getAttribute('data-tag'));
      return;
    }
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || !flow || n > flow.tags.length) return;
    e.preventDefault();
    e.stopPropagation();
    label(flow.tags[n - 1].id);
  });

  const api = {
    root,
    get focusTarget() {
      return tagsEl.querySelector('.opt') || stage.focusTarget || palm.button;
    },
    get palmTarget() {
      return palm.button;
    },
    get text() {
      return stage.text;
    },
    get done() {
      return stage.done;
    },
    get fired() {
      return palm.fired;
    },
    /** 拆到第幾塊 / 刻到第幾段（HUD 與測試用）。 */
    get progress() {
      return {
        at,
        parts: flow ? flow.parts.length : 0,
        taken: takenAll(),
        ...stage.progress,
      };
    },
    get ask() {
      if (!takenAll()) {
        const p = flow && flow.parts[at];
        return (p && (p.ask || flow.ask)) || '';
      }
      return stage.ask;
    },
    /** 已經貼好名字的那幾塊（測試用）。 */
    get named() {
      if (!flow) return [];
      return flow.parts.slice(0, at).map((p) => ({ text: p.text, tagId: p.tagId }));
    },
    get announcement() {
      return liveEl.textContent;
    },
    label,
    restore,
    /** 刻印那一段（測試用，與石碑刻印同名）。 */
    pick: (i) => stage.pick(i),
    press: () => palm.press(),
    /** 上一次載入的刻印段落（reopen 用）。 */
    slots: [],
    load(nextFlow, slots) {
      flow = isReverseFlow(nextFlow) ? nextFlow : null;
      at = 0;
      palm.reset();
      liveEl.textContent = '';
      api.slots = isSlotList(slots) ? slots : [];
      stage.load(api.slots);
      root.hidden = !flow;
      if (!flow) return false;
      renderParts();
      renderTags();
      return true;
    },
    reopen() {
      return flow ? api.load(flow, api.slots) : false;
    },
  };

  return api;
}

export default createReverseBoard;

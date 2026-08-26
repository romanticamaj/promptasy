/**
 * Promptasy — 傳聞（Rumors，v1.2 · P20a）
 *
 * 世界的線索散在六種東西上：**石碑**、**刻文小語**、**殘頁**、**祕密**、
 * **守夜人的舊事**、**濁靈的來歷**。它們彼此的關係以前只存在玩家腦子裡 ——
 * 這一頁只做一件事：把「講的是同一件事」的兩端接起來。
 *
 * 三條硬規則：
 *   1. **沒有存檔欄。** 一條線畫不畫得出來，完全由「兩端各自找到了沒」推導
 *      （`hasReadLore` / `hasFoundInscription` / `hasFoundLetter` /
 *       `hasFoundSecret` / `hasMetWatchman` / `murkState`）。
 *      這一支只吃一個 `found(ref)` 述詞，自己不記任何東西。
 *   2. **不劇透。** 還沒找到的那一端**連名字都不給**，只給一句佔位
 *      （`RUMOR_UNKNOWN`）；那條連線在說什麼（`say`）也要**兩端都找到**才顯示。
 *      名字是在 `endpointView()` 裡才去查的 —— 沒找到就根本不去碰資料，
 *      所以「渲染出來的字串裡不可能出現它」這件事是**結構上成立**，不是靠記得。
 *   3. **兩端都沒找到的那一條整條不畫。** 不然「這裡還有 N 條線」本身就是劇透。
 *
 * 護欄 2：這一頁一個字的教學都沒有、一個連結都不放 —— 技巧與官方出處永遠
 * 只掛在它們原本的那一層（`rumors.json` 連 `source` 欄位都不准有，`test:rubric` 在守）。
 *
 * 這支檔案裡沒有任何 DOM 操作，全部是純函式（吃資料、回字串），
 * 好讓 `npm run test:rubric` 直接把「不劇透」拿去**對渲染出來的字串**掃。
 */
import { esc } from './dom.js';

/** 一條線的兩端只認得這六種線索。 */
export const RUMOR_KINDS = Object.freeze(['tablet', 'ins', 'letter', 'secret', 'watchman', 'murk']);

/**
 * 還沒找到的那一端要說什麼。
 *
 * **只說它是哪一種東西，不說它是誰、也不說它寫了什麼**——這是收集的鉤子：
 * 你知道那頭還有一段，但要自己走過去才讀得到。
 */
export const RUMOR_UNKNOWN = Object.freeze({
  tablet: '還沒讀到的一塊碑',
  ins: '還沒看到的一句刻文',
  letter: '還沒撿到的一頁',
  secret: '還沒走進的一處',
  watchman: '還沒遇到的一個人',
  murk: '還沒說清楚的一句話',
});

/** 找到的那一端要標它是哪一層（給 chip 用）。 */
export const RUMOR_KIND_LABEL = Object.freeze({
  tablet: '碑',
  ins: '刻文',
  letter: '殘頁',
  secret: '祕境',
  watchman: '人',
  murk: '濁言',
});

/** 兩端沒有都找到時，那一句話用這一行代替（它不透露任何內容）。 */
export const RUMOR_HALF_SAY = '另一頭還沒找到 —— 找到就接得起來。';

/**
 * `"kind:id"` → `{ kind, id }`；形狀不對回 `null`（資料壞掉不該讓圖鑑開不起來）。
 * @param {string} ref
 */
export function parseClueRef(ref) {
  if (typeof ref !== 'string') return null;
  const i = ref.indexOf(':');
  if (i <= 0 || i === ref.length - 1) return null;
  const kind = ref.slice(0, i);
  const id = ref.slice(i + 1);
  if (!RUMOR_KINDS.includes(kind)) return null;
  return { kind, id };
}

/**
 * 把六個既有資料層讀成一張 `ref → { kind, id, name, region }` 的索引。
 *
 * **這裡是唯一會碰到「那一端叫什麼」的地方**，而且只有 `endpointView()`
 * 在確定「找到了」之後才會去查它。
 *
 * @param {object} sources
 * @param {Array} [sources.tablets]     `props.js` 的 `LORE_TABLETS`
 * @param {Array} [sources.inscriptions] `inscriptions.json` 的 entries
 * @param {Array} [sources.letters]     `letters.json` 的 entries
 * @param {Array} [sources.secrets]     `secrets.json` 的 entries
 * @param {Array} [sources.watchmen]    `watchmen.json` 的 entries
 * @param {Array} [sources.murks]       `murks.json` 的 entries
 * @returns {Map<string, {ref:string, kind:string, id:string, name:string, region:string}>}
 */
export function buildClueIndex({
  tablets = [],
  inscriptions = [],
  letters = [],
  secrets = [],
  watchmen = [],
  murks = [],
} = {}) {
  const index = new Map();
  const add = (kind, list, nameOf) => {
    for (const e of list || []) {
      if (!e || typeof e.id !== 'string') continue;
      index.set(`${kind}:${e.id}`, {
        ref: `${kind}:${e.id}`,
        kind,
        id: e.id,
        name: nameOf(e),
        region: typeof e.region === 'string' ? e.region : '',
      });
    }
  };
  add('tablet', tablets, (e) => e.title || e.id);
  add('ins', inscriptions, (e) => e.title || e.id);
  add('letter', letters, (e) => e.title || e.id);
  add('secret', secrets, (e) => e.title || e.id);
  // 守夜人那一層沒有 title，他有名字
  add('watchman', watchmen, (e) => e.name || e.id);
  add('murk', murks, (e) => e.title || e.id);
  return index;
}

/**
 * 「這一端找到了沒」—— **完全由既有的存檔欄推導，這一層一個欄位都沒有新增**。
 *
 * 六種線索各自問它原本那一支：
 *   `tablet` → `hasReadLore`、`ins` → `hasFoundInscription`、
 *   `letter` → `hasFoundLetter`、`secret` → `hasFoundSecret`、
 *   `watchman` → `hasMetWatchman`、`murk` → `murkState().grade`（安撫過才算）。
 *
 * @param {string} ref
 * @param {object} progression
 * @returns {boolean}
 */
export function clueFound(ref, progression) {
  const parsed = parseClueRef(ref);
  if (!parsed || !progression) return false;
  const { kind, id } = parsed;
  if (kind === 'tablet') return typeof progression.hasReadLore === 'function' && progression.hasReadLore(id);
  if (kind === 'ins') {
    return typeof progression.hasFoundInscription === 'function' && progression.hasFoundInscription(id);
  }
  if (kind === 'letter') return typeof progression.hasFoundLetter === 'function' && progression.hasFoundLetter(id);
  if (kind === 'secret') return typeof progression.hasFoundSecret === 'function' && progression.hasFoundSecret(id);
  if (kind === 'watchman') return typeof progression.hasMetWatchman === 'function' && progression.hasMetWatchman(id);
  if (kind === 'murk') {
    const st = typeof progression.murkState === 'function' ? progression.murkState(id) : null;
    return Boolean(st && st.grade);
  }
  return false;
}

/**
 * 一端的顯示狀態。**沒找到就不去查名字**（不劇透的結構性保證）。
 * @param {string} ref
 * @param {object} opts
 * @param {Map} opts.index  `buildClueIndex()`
 * @param {(ref:string)=>boolean} opts.found
 */
export function endpointView(ref, { index, found }) {
  const parsed = parseClueRef(ref);
  if (!parsed) return { ref, kind: '', id: '', found: false, label: '' };
  const got = Boolean(found && found(ref));
  if (!got) return { ref, kind: parsed.kind, id: parsed.id, found: false, label: RUMOR_UNKNOWN[parsed.kind] };
  const entry = index && index.get ? index.get(ref) : null;
  return {
    ref,
    kind: parsed.kind,
    id: parsed.id,
    found: true,
    label: entry && entry.name ? entry.name : parsed.id,
  };
}

/**
 * 一條線的狀態。
 *   `both`  兩端都找到 → 實線 ＋ 那一句話
 *   `half`  只找到一端 → 虛線 ＋ 佔位（另一端連名字都不給）
 *   兩端都沒找到 → `visible: false`（整條不畫）
 * @param {object} link `rumors.json` 的一筆
 * @param {object} opts 同 `endpointView()`
 */
export function rumorLinkState(link, { index, found }) {
  const a = endpointView(link && link.a, { index, found });
  const b = endpointView(link && link.b, { index, found });
  const both = a.found && b.found;
  return {
    id: (link && link.id) || '',
    region: (link && link.region) || '',
    a,
    b,
    both,
    visible: a.found || b.found,
    // **兩端都找到才說那一句**：只找到一端時說出來，等於替另一端劇透
    say: both ? (link && link.say) || '' : RUMOR_HALF_SAY,
  };
}

/**
 * 整頁的數字：接起來的、只有一端的、還完全沒碰到的。
 * @param {Array} links
 * @param {object} opts 同 `endpointView()`
 */
export function rumorStats(links, opts) {
  let linked = 0;
  let half = 0;
  for (const link of links || []) {
    const st = rumorLinkState(link, opts);
    if (st.both) linked += 1;
    else if (st.visible) half += 1;
  }
  const total = (links || []).length;
  return { total, linked, half, hidden: total - linked - half };
}

/** 一端的 chip。找到的那一端才有 `data-rumor-found`（e2e／rubric 靠它分辨）。 */
function endpointHtml(view, side) {
  const kindLabel = RUMOR_KIND_LABEL[view.kind] || '';
  return `<span class="rumor__end rumor__end--${esc(side)}${view.found ? '' : ' is-unknown'}"${
    view.found ? ` data-rumor-found="${esc(view.ref)}"` : ' data-rumor-unknown'
  }>
      <span class="rumor__kind">${esc(view.found ? kindLabel : '？')}</span>
      <b class="rumor__name">${esc(view.label)}</b>
    </span>`;
}

/** 一條線。 */
function rumorHtml(state) {
  return `<li class="rumor ${state.both ? 'is-linked' : 'is-half'}" data-rumor="${esc(state.id)}">
    <div class="rumor__wire">
      ${endpointHtml(state.a, 'a')}
      <span class="rumor__thread" aria-hidden="true"></span>
      ${endpointHtml(state.b, 'b')}
    </div>
    <p class="rumor__say">${esc(state.say)}</p>
  </li>`;
}

/**
 * 傳聞那一整章（圖鑑的一頁）。
 *
 * @param {object} opts
 * @param {Array}  opts.links       `rumors.json` 的 links
 * @param {Map}    opts.index       `buildClueIndex()`
 * @param {(ref:string)=>boolean} opts.found
 * @param {Map<string,string>} [opts.regionNames] 區域 id → 中文名（分段用）
 * @returns {string} HTML
 */
export function rumorBlock({ links = [], index, found, regionNames = new Map() }) {
  if (!links.length) return '';
  const stats = rumorStats(links, { index, found });
  const states = links.map((l) => rumorLinkState(l, { index, found })).filter((s) => s.visible);

  const body = states.length
    ? (() => {
        const order = [];
        const groups = new Map();
        for (const st of states) {
          if (!groups.has(st.region)) {
            groups.set(st.region, []);
            order.push(st.region);
          }
          groups.get(st.region).push(st);
        }
        return order
          .map((rid) => {
            const name = regionNames.get ? regionNames.get(rid) || rid : rid;
            return `<section class="rumors__group" data-rumor-region="${esc(rid)}">
              <h5 class="rumors__region">${esc(name)}</h5>
              <ul class="rumors__list">${groups.get(rid).map(rumorHtml).join('')}</ul>
            </section>`;
          })
          .join('');
      })()
    : `<p class="codex__hint" data-rumor-empty>還沒有任何一條接得起來 —— 世界上的每一段話都還躺在它自己的地方。</p>`;

  return `<div class="seals finds rumors">
    <div class="meta-rule"><h4><span class="zh">傳聞</span><span class="en">Rumors</span></h4></div>
    <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">同一件事常常被兩個地方各說了一半。找到兩端，這一條就接得起來（已接起 ${
      stats.linked
    } 條 · 還差一頭 ${stats.half} 條）。</p>
    ${body}
    <p class="codex__hint">虛線的那一頭還沒找到 —— 這一頁不會先告訴你它是誰。</p>
  </div>`;
}

export default rumorBlock;

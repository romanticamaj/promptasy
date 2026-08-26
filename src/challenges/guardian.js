/**
 * Promptasy — 守門者的判定（v1.2 · P18）
 *
 * 護欄崗那道門邊站著一個**帶著 system prompt 的人**。他身上那份「交辦」玩家看得見，
 * 因為那份交辦本身就是教材：指令階層、規矩排在資料前面、界定符、挑罕見的界定符、
 * 把會出事的那一步換個形狀、動作前確認、先替他試過假扮的委託。
 *
 * 這一支**全部是純函式**：不碰 DOM、不碰 three.js、不讀 localStorage、**不連網**——
 * 所以 `test:rubric` 可以直接餵它一份存檔、問它「他會說什麼」，
 * 而不必先蓋一個世界、開一個面板（先紅後綠才做得起來）。
 *
 * 三條不可動搖的：
 *
 *   ① **沒有失敗態。** 他只是「還沒被說服」。這裡不回傳任何 `failed`／`rejected`
 *      形狀的東西，資料層與畫面上也不准出現那一類字（`test:rubric` 禁字表逐句掃，
 *      同 WORLD.md §1.6 濁靈的用語鐵則）。
 *   ② **進度只累積。** 開過的門閂記在存檔的聯集裡，永不回頭；分兩次各說一半也說得完
 *      （同大濁靈的契約）。這一支從頭到尾只有 `[...new Set([...舊, ...新])]`，沒有一行減法。
 *   ③ **離線那條路是完整的、而且是預設的。** 判定走 `guard` 介面
 *      （`decide(state, prompt, evaluation)`），離線腳本是**已註冊的預設實作**；
 *      哪天要接真的 LLM，是新增一個實作 ＋ 一個設定，不必動守門者本身。
 *      P18 只做離線那一條（線上模式的裁決與理由寫在 `docs/history/task_plan.md` §P18）。
 */
import { runCheck } from './checks.js';

/** 預設（也是目前唯一）的判定實作 id。 */
export const OFFLINE_GUARD = 'offline';
export const DEFAULT_GUARD = OFFLINE_GUARD;

/** 一次對話最多同時擺幾個選項（用選的、不打字；一頁擺得下、讀得完）。 */
export const OPTIONS_PER_ROUND = 4;
/** 一輪裡最多擺幾個「開得了門閂」的選項（剩下的留給別的話，免得整頁都是同一種）。 */
export const LATCH_OPTIONS_PER_ROUND = 3;
/** 分支數的下限（P18 的契約：≥12 條，每一條綁一個既有的檢查器）。 */
export const MIN_BRANCHES = 12;

/**
 * 把一句話交給評分引擎（**既有的** `checks.js`，不新增檢查器）。
 *
 * 只跑「這位守門者聽得懂的那幾種」——分支表上出現過的檢查器，一次一支，
 * 零相依、零網路。回傳的形狀就是 `decide()` 吃的 `evaluation`。
 *
 * @param {string} text 玩家挑的那一句（選項的 `text`）
 * @param {object} data guardian.json
 * @returns {{prompt:string, hits:string[], results:Object<string,{passed:boolean,partial:boolean,score:number,evidence:string}>}}
 */
export function evaluateLine(text, data) {
  const prompt = typeof text === 'string' ? text : '';
  const results = {};
  const hits = [];
  for (const b of (data && data.branches) || []) {
    if (!b || !b.check || results[b.check]) continue;
    const out = runCheck(b.check, prompt);
    results[b.check] = {
      passed: Boolean(out.passed),
      partial: Boolean(out.partial),
      score: Number.isFinite(out.score) ? out.score : 0,
      evidence: out.evidence || '',
    };
    if (out.passed) hits.push(b.check);
  }
  return { prompt, hits, results };
}

/** 存檔那一欄的形狀（壞值一律落成乾淨的預設）。 */
export function normalizeState(state, data = null) {
  const known = new Set(((data && data.latches) || []).map((l) => l.id));
  const raw = Array.isArray(state && state.hits) ? state.hits : [];
  const hits = [...new Set(raw.filter((id) => typeof id === 'string' && (!known.size || known.has(id))))].sort();
  const turns = Number.isFinite(state && state.turns) ? Math.max(0, Math.round(state.turns)) : 0;
  return { hits, turns, convinced: Boolean(state && state.convinced) };
}

/** 總權重（門閂的權重和）。 */
export function totalWeight(data) {
  return ((data && data.latches) || []).reduce((n, l) => n + (Number.isFinite(l.weight) ? l.weight : 1), 0);
}

/** 已經開了多少權重。 */
export function openWeight(data, state) {
  const st = normalizeState(state, data);
  return ((data && data.latches) || [])
    .filter((l) => st.hits.includes(l.id))
    .reduce((n, l) => n + (Number.isFinite(l.weight) ? l.weight : 1), 0);
}

/** 門檻（資料沒寫就抓總權重的 75%，與大濁靈同一條線）。 */
export function passMark(data) {
  return Number.isFinite(data && data.pass) ? data.pass : Math.ceil(totalWeight(data) * 0.75);
}

/**
 * 交辦上每一行**現在**的樣子（畫面照這個畫，測試也問它）。
 * 「還沒開的」不是紅字，是一句「還在等什麼」——這就是沒有失敗態的樣子。
 */
export function latchStatus(data, state) {
  const st = normalizeState(state, data);
  return ((data && data.latches) || []).map((l, i) => ({
    id: l.id,
    index: i,
    check: l.check,
    clause: l.clause,
    waiting: l.waiting,
    from: l.from,
    weight: Number.isFinite(l.weight) ? l.weight : 1,
    open: st.hits.includes(l.id),
  }));
}

/** 說服了沒（**只看聯集**：分兩次各說一半也算數）。 */
export function isConvinced(data, state) {
  return openWeight(data, state) >= passMark(data);
}

/**
 * 這一輪擺哪幾個選項出來（純函式：同一份存檔 ＋ 同一個 turn ＝ 同一批）。
 *
 * 規則：**還開得了門閂的排前面**（那是他在等的），其餘的補滿一輪；
 * 兩池各自照 `turn` 輪替，所以多按幾次「換一批」，每一個選項都輪得到
 * （`test:rubric` 逐輪掃過去驗「每一個選項都出得來」）。
 *
 * @param {object} data guardian.json
 * @param {object} state 存檔那一欄
 * @param {number} [turn] 換過幾批
 */
export function pickOptions(data, state, turn = 0) {
  const st = normalizeState(state, data);
  const options = ((data && data.options) || []).slice();
  const byBranch = new Map(((data && data.branches) || []).map((b) => [b.id, b]));
  const opensClosedLatch = (o) => {
    const b = byBranch.get(o.expect);
    return Boolean(b && b.opens && !st.hits.includes(b.opens));
  };
  const wanted = options.filter(opensClosedLatch);
  const rest = options.filter((o) => !opensClosedLatch(o));
  const t = Math.max(0, Math.floor(turn) || 0);
  const take = (pool, n, offset) => {
    const out = [];
    if (!pool.length || n <= 0) return out;
    for (let i = 0; i < Math.min(n, pool.length); i += 1) out.push(pool[(offset * n + i) % pool.length]);
    return out;
  };
  const head = take(wanted, LATCH_OPTIONS_PER_ROUND, t);
  const tail = take(rest, OPTIONS_PER_ROUND - head.length, t);
  return [...head, ...tail];
}

/**
 * **離線腳本狀態機。**
 *
 * 判定只讀 `evaluation`（哪幾支檢查器過了），不看玩家挑的是哪一個選項——
 * 這樣同一個介面才接得住「以後真的送去 LLM 評分」那一種實作。
 *
 * 挑哪一條分支：**分支表的順序就是專一度**（愈前面愈專一）。
 * 一句話同時命中好幾支檢查器是常態（「先提計畫、由人執行」本來就含著「動作前確認」），
 * 這時候他說的是最專一的那一句；**開的門閂則是全部**——他聽見了什麼就記什麼，
 * 不會因為只回一句話就把別的當作沒聽見。
 *
 * @param {object} data guardian.json
 * @returns {{id:string, offline:boolean, decide:Function}}
 */
export function createOfflineGuard(data) {
  const branches = ((data && data.branches) || []).slice();
  const latchByCheck = new Map(((data && data.latches) || []).map((l) => [l.check, l]));

  /**
   * @param {object} state 存檔那一欄 `{ hits, turns, convinced }`
   * @param {string} prompt 玩家挑的那一句
   * @param {object} evaluation `evaluateLine()` 的結果
   */
  function decide(state, prompt, evaluation) {
    const before = normalizeState(state, data);
    const hits = Array.isArray(evaluation && evaluation.hits) ? evaluation.hits : [];
    const branch = branches.find((b) => hits.includes(b.check)) || null;

    // 進度只累積：這裡只有聯集，沒有任何一行拿得走已經開過的門閂
    const opened = [];
    for (const check of hits) {
      const latch = latchByCheck.get(check);
      if (latch && !before.hits.includes(latch.id)) opened.push(latch.id);
    }
    const after = normalizeState(
      { hits: [...before.hits, ...opened], turns: before.turns + 1, convinced: before.convinced },
      data
    );
    const convinced = isConvinced(data, after);
    after.convinced = before.convinced || convinced;

    const lines = (data && data.lines) || {};
    const say = branch ? branch.say.slice() : (lines.nothing || []).slice();
    return {
      branchId: branch ? branch.id : null,
      branch,
      check: branch ? branch.check : null,
      eyebrow: branch ? branch.eyebrow : '',
      say,
      /** 這一句開了哪幾道門閂（可能不只一道 —— 一句好話本來就講清楚了好幾件事）。 */
      opened,
      /** 這一句命中了哪幾支檢查器（他聽見的全部）。 */
      heard: hits.slice(),
      /** 出處：引用 `challenges.json` 裡那一關自己的官方連結（這裡不自己編網址）。 */
      from: branch ? branch.from : null,
      before,
      after,
      /** 說服了沒（看聯集） */
      convinced: after.convinced,
      /** 這一句才剛好說服他 */
      justConvinced: convinced && !before.convinced,
      /** 七行全開（比說服再多走一步，純榮譽） */
      full: after.hits.length === ((data && data.latches) || []).length,
      prompt: typeof prompt === 'string' ? prompt : '',
    };
  }

  return Object.freeze({ id: OFFLINE_GUARD, offline: true, decide });
}

/**
 * 判定實作的登記表（`guard` 介面：`decide(state, prompt, evaluation) → 反應`）。
 *
 * 之所以留這道縫：roadmap 原本寫的「線上 LLM 模式僅選配（既有 API key 設定）」，
 * 查證後那個設定**不存在**——要做就得從零長出金鑰輸入、把使用者的密鑰存進 localStorage、
 * 對外的網路呼叫、CSP 與錯誤處理，那是與這個遊戲其他部分性質完全不同的風險面，
 * 應該有自己的 phase 與自己的審查（裁決寫在 `docs/history/task_plan.md` §P18）。
 * 所以 P18 只做離線那一條，但把介面留成「換一個實作就好」的形狀。
 */
export function createGuardRegistry(entries = null) {
  const map = new Map();
  if (entries) for (const [id, make] of entries) map.set(id, make);
  return {
    register(id, make) {
      if (typeof id !== 'string' || !id || typeof make !== 'function') return false;
      map.set(id, make);
      return true;
    },
    has: (id) => map.has(id),
    get: (id) => map.get(id) || null,
    list: () => [...map.keys()],
    get size() {
      return map.size;
    },
  };
}

/** 出貨的那一份登記表：**離線腳本已經註冊，而且是預設的那一個**。 */
export const guards = createGuardRegistry();
guards.register(OFFLINE_GUARD, createOfflineGuard);

/**
 * 依登記表做一個判定者出來。
 * @param {object} data guardian.json
 * @param {string} [id] 要哪一個實作（預設離線腳本）
 * @param {object} [registry] 要查哪一份登記表（測試會餵一份空的當反例）
 * @returns {{id:string, offline:boolean, decide:Function}|null} 沒有這個實作 → null
 */
export function createGuard(data, id = DEFAULT_GUARD, registry = guards) {
  const make = registry && typeof registry.get === 'function' ? registry.get(id) : null;
  return typeof make === 'function' ? make(data) : null;
}

/**
 * 從頭把他說服一次（**測試與除錯用的整條離線路徑**）。
 *
 * 依序挑「開得了門閂」的選項餵給 `guard.decide()`，直到說服為止。
 * 拿不到判定者（例如登記表裡沒有離線實作）就回 `null` ——
 * 反例呼叫的是**同一支**，不是另一段長得像的程式。
 *
 * @param {object} data guardian.json
 * @param {object} [opts]
 * @param {object} [opts.state] 從哪一份存檔接著說（預設從零開始）
 * @param {string} [opts.guardId]
 * @param {object} [opts.registry]
 * @param {number} [opts.maxSteps]
 * @returns {{state:object, steps:Array, convinced:boolean}|null}
 */
export function walkOffline(data, { state = null, guardId = DEFAULT_GUARD, registry = guards, maxSteps = 24 } = {}) {
  const guard = createGuard(data, guardId, registry);
  if (!guard) return null;
  let st = normalizeState(state, data);
  const steps = [];
  const byBranch = new Map(((data && data.branches) || []).map((b) => [b.id, b]));
  for (let i = 0; i < maxSteps && !isConvinced(data, st); i += 1) {
    const next = ((data && data.options) || []).find((o) => {
      const b = byBranch.get(o.expect);
      return b && b.opens && !st.hits.includes(b.opens);
    });
    if (!next) break;
    const res = guard.decide(st, next.text, evaluateLine(next.text, data));
    steps.push({ optionId: next.id, branchId: res.branchId, opened: res.opened.slice() });
    st = res.after;
  }
  return { state: st, steps, convinced: isConvinced(data, st) };
}

export default {
  OFFLINE_GUARD,
  DEFAULT_GUARD,
  OPTIONS_PER_ROUND,
  LATCH_OPTIONS_PER_ROUND,
  MIN_BRANCHES,
  evaluateLine,
  normalizeState,
  totalWeight,
  openWeight,
  passMark,
  latchStatus,
  isConvinced,
  pickOptions,
  createOfflineGuard,
  createGuardRegistry,
  guards,
  createGuard,
  walkOffline,
};

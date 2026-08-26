/**
 * Promptasy — 守夜人給得出來的四種情報（v1.2 · P16c）
 *
 * 這一支**全部是純函式**：不碰 DOM、不碰 three.js、不讀 localStorage ——
 * 所以 `test:rubric` 可以直接餵它一份存檔、問它「你會說什麼」，
 * 而不必先蓋一個世界、開一個面板（先紅後綠才做得起來）。
 *
 * 四種情報，沒得講的那一項**不出現**（不畫一個按不出東西的選項）：
 *
 *   ① 卡關提示 `stuckReport()`
 *      讀存檔的 `struggles`（每一關試過幾次、命中過哪幾條檢查器），
 *      挑「**試了最多次、還沒過**」的那一關，指向它 rubric 裡**還沒命中**的第一條，
 *      用世界語言講（`watchmen.json` 的 `checkLines`）。
 *      **不給答案、不貼範例** —— 那是提示球與神諭刻文的事（護欄 1：學習優先，
 *      但學習不等於直接把答案端上來）。
 *
 *   ② 指路 `wayReport()`
 *      該片土地**最近一處還沒找到**的殘頁／祕密，用方位與距離講。
 *      祕密講的是它自己登記的 tell（odd／sound／high，`secrets.json` 既有欄位），
 *      不講它的名字 —— 找到的那一下才是它的名字。
 *
 *   ③ 世界觀故事 `loreBeats()`：`watchmen.json` 的 `lore`，一拍一拍地說，可以追問。
 *
 *   ④ 技巧小知識 `skillNote()`
 *      **只引用既有的、已經附了出處的資料**（`skill-codex-v2.json` 的一條技能：
 *      它的 `nameZh`、`oneLiner` 與它自己的官方連結）。這一層一個字都不是新寫的，
 *      也不新增技巧、不改課程資料（護欄 2）。
 */

/** 四種情報的順序（畫面上的排列順序就是它）。 */
export const WATCH_TOPICS = Object.freeze(['stuck', 'way', 'lore', 'skill']);

/** 要「卡了幾次」才算卡關 —— 一次沒過只是還沒寫完，不是卡住。 */
export const STUCK_MIN_TRIES = 2;

const DIRS = Object.freeze(['正北', '東北', '正東', '東南', '正南', '西南', '正西', '西北']);

/**
 * 從 (fromX, fromZ) 看 (toX, toZ) 是哪個方位（世界的座標軸：+x 東、+z 南）。
 * @returns {string} 八方位之一
 */
export function bearing(fromX, fromZ, toX, toZ) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (dx === 0 && dz === 0) return DIRS[0];
  const ang = Math.atan2(dx, -dz); // 正北 = -z
  const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS[idx];
}

/** 多遠 —— 守夜人不會報公尺，他報的是「要走多久」。 */
export function paceWord(distance) {
  if (!Number.isFinite(distance)) return '就在附近';
  if (distance < 14) return '幾步就到';
  if (distance < 32) return '走一小段';
  return '要走一段路';
}

/**
 * ① 卡關提示。
 *
 * @param {object} opts
 * @param {object} opts.struggles   `{ [challengeId]: { tries:number, hits:string[] } }`
 * @param {(id:string)=>boolean} opts.isCleared 這一關通關了沒（通關了就不是卡關）
 * @param {Array} opts.challenges   challenges.json 的 challenges（要 `id` / `title` / `rubric`）
 * @param {object} opts.checkLines  watchmen.json 的 `checkLines`
 * @param {number} [opts.minTries]
 * @returns {{challengeId:string,title:string,region:string,tries:number,check:string,line:string}|null}
 */
export function stuckReport({ struggles, isCleared, challenges, checkLines, minTries = STUCK_MIN_TRIES }) {
  if (!struggles || typeof struggles !== 'object') return null;
  const byId = new Map((challenges || []).map((c) => [c.id, c]));
  /*
   * 排序刻意寫成**全序**：先看試了幾次，同次數時照 challenges.json 的順序 ——
   * 「他每次都指同一關」比「他隨機指一關」有用得多，也才測得出來。
   */
  const order = new Map((challenges || []).map((c, i) => [c.id, i]));
  const rows = [];
  for (const [id, st] of Object.entries(struggles)) {
    if (!st || typeof st !== 'object') continue;
    const tries = Number(st.tries) || 0;
    if (tries < minTries) continue;
    if (typeof isCleared === 'function' && isCleared(id)) continue;
    const ch = byId.get(id);
    if (!ch || !Array.isArray(ch.rubric) || !ch.rubric.length) continue;
    const hits = Array.isArray(st.hits) ? st.hits : [];
    const missing = ch.rubric.find((row) => row && row.check && !hits.includes(row.check));
    if (!missing) continue;
    const line = (checkLines || {})[missing.check];
    if (!line) continue;
    rows.push({
      challengeId: id,
      title: ch.title || id,
      region: ch.region || '',
      tries,
      check: missing.check,
      line,
      _order: order.has(id) ? order.get(id) : Number.MAX_SAFE_INTEGER,
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.tries - a.tries || a._order - b._order);
  const best = rows[0];
  delete best._order;
  return best;
}

/**
 * ② 指路：這片土地**最近一處還沒找到**的殘頁／祕密。
 *
 * @param {object} opts
 * @param {number[]} opts.at          守夜人站的地方
 * @param {string} opts.region
 * @param {Array} [opts.letters]      letters.json 的 entries
 * @param {Array} [opts.secrets]      secrets.json 的 entries
 * @param {(id:string)=>boolean} opts.hasLetter
 * @param {(id:string)=>boolean} opts.hasSecret
 * @returns {{kind:'letter'|'secret', id:string, dir:string, pace:string, distance:number, tell:string|null}|null}
 */
export function wayReport({ at, region, letters = [], secrets = [], hasLetter, hasSecret }) {
  if (!Array.isArray(at) || at.length < 2) return null;
  const pool = [];
  for (const l of letters) {
    if (!l || l.region !== region || !Array.isArray(l.at)) continue;
    if (typeof hasLetter === 'function' && hasLetter(l.id)) continue;
    pool.push({ kind: 'letter', id: l.id, at: l.at, tell: null });
  }
  for (const s of secrets) {
    if (!s || s.region !== region || !Array.isArray(s.at)) continue;
    if (typeof hasSecret === 'function' && hasSecret(s.id)) continue;
    pool.push({ kind: 'secret', id: s.id, at: s.at, tell: s.tell || null });
  }
  if (!pool.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of pool) {
    const d = Math.hypot(p.at[0] - at[0], p.at[1] - at[1]);
    // 同距離時照 id 排，答案才是穩定的（測試問得出「他指的是哪一處」）
    if (d < bestD || (d === bestD && best && p.id < best.id)) {
      bestD = d;
      best = p;
    }
  }
  return {
    kind: best.kind,
    id: best.id,
    dir: bearing(at[0], at[1], best.at[0], best.at[1]),
    pace: paceWord(bestD),
    distance: bestD,
    tell: best.tell,
  };
}

/**
 * ③ 世界觀故事：一拍一拍地說。
 * @param {object} entry watchmen.json 的一筆
 * @param {number} step  說到第幾拍（0 起算）
 */
export function loreBeats(entry, step = 0) {
  const lines = Array.isArray(entry && entry.lore) ? entry.lore : [];
  const i = Math.max(0, Math.min(lines.length - 1, Math.floor(step) || 0));
  return { line: lines[i] || '', index: i, total: lines.length, more: i + 1 < lines.length };
}

/**
 * ④ 技巧小知識：**引用**該片土地既有的一條技能。
 *
 * 一句話（`oneLiner`）＋ 一個可點的官方連結（`sources[0]`）—— 兩樣都來自
 * `skill-codex-v2.json`，這裡一個字都沒有新寫。已經會了的優先（那是複習，
 * 不是劇透）；一條都還沒會就從這一區的第一條說起。
 *
 * @param {object} opts
 * @param {Array} opts.skills                 這一區的技能（catalog.regionSkills(regionId)）
 * @param {(id:string)=>boolean} [opts.knows] 這條技能會了沒
 * @param {number} [opts.turn]                問過第幾次（同一位守夜人講不同條）
 * @returns {{skillId:string,nameZh:string,oneLiner:string,source:{url:string,name:string}|null}|null}
 */
export function skillNote({ skills = [], knows = null, turn = 0 }) {
  const usable = skills.filter((s) => s && s.id && s.oneLiner);
  if (!usable.length) return null;
  const known = typeof knows === 'function' ? usable.filter((s) => knows(s.id)) : [];
  const pool = known.length ? known : usable;
  const s = pool[((Math.floor(turn) || 0) % pool.length + pool.length) % pool.length];
  const src = Array.isArray(s.sources) && s.sources.length ? s.sources[0] : null;
  return {
    skillId: s.id,
    nameZh: s.nameZh || s.id,
    oneLiner: s.oneLiner,
    source: src && src.url ? { url: src.url, name: src.docName || src.url, vendor: src.vendor || '' } : null,
  };
}

export default { WATCH_TOPICS, STUCK_MIN_TRIES, bearing, paceWord, stuckReport, wayReport, loreBeats, skillNote };

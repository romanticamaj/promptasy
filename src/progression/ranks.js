/**
 * Promptasy — 稱號（rank）
 *
 * Phase 21：可分享的結果卡需要一個「一句話講完你走到哪」的東西。
 * 稱號就是那個東西：由三個進度量共同決定 ——
 *
 *   level     等級（＝ XP 曲線）
 *   collected 已收進圖鑑的技巧數（0–68）
 *   mastered  已精通（該區技巧全收集）的區域數（0–5）
 *
 * 規則刻意簡單：**三個門檻同時滿足**才算晉級，取滿足條件的最後一個稱號。
 * 三個門檻在 ranks.json 裡都不遞減 → 順序一定單調，不會有「收集變多反而降級」。
 *
 * 這一層不碰 DOM、不 import JSON（資料由外部注入），所以 node 測試腳本可以直接跑。
 * 稱號是遊戲自撰的世界觀稱謂，不是任何官方文件的分級（見 ranks.json 的 note）。
 */

/** 稱號門檻是否被這組進度滿足。 */
export function rankSatisfied(stats, rank) {
  return (
    (stats.level || 0) >= (rank.level || 0) &&
    (stats.collected || 0) >= (rank.collected || 0) &&
    (stats.mastered || 0) >= (rank.mastered || 0)
  );
}

/**
 * 目前的稱號。
 * @param {{level:number, collected:number, mastered:number}} stats
 * @param {Array} ranks ranks.json 的 ranks 陣列
 * @returns {{rank:object, index:number, total:number, next:(object|null),
 *            needs:{level:number, collected:number, mastered:number}|null}}
 */
export function rankFor(stats, ranks) {
  const list = Array.isArray(ranks) ? ranks : [];
  if (!list.length) return { rank: null, index: -1, total: 0, next: null, needs: null };

  let index = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (rankSatisfied(stats, list[i])) index = i;
  }
  const rank = list[index];
  const next = list[index + 1] || null;
  const needs = next
    ? {
        level: Math.max(0, (next.level || 0) - (stats.level || 0)),
        collected: Math.max(0, (next.collected || 0) - (stats.collected || 0)),
        mastered: Math.max(0, (next.mastered || 0) - (stats.mastered || 0)),
      }
    : null;
  return { rank, index, total: list.length, next, needs };
}

/**
 * 從進程系統讀出稱號需要的三個數字（＋結果卡會用到的幾個附帶數字）。
 * @param {object} progression createProgression() 的回傳
 * @param {object} curriculum  curriculum.json
 */
export function rankStats(progression, curriculum) {
  const groups = (curriculum && curriculum.groups) || [];
  const techniques = (curriculum && curriculum.techniques) || [];
  const state = progression.state;
  const mastered = groups.map((g) => g.id).filter((id) => progression.regionMastery(id).mastered);
  return {
    level: progression.levelInfo().level,
    xp: state.xp,
    collected: state.collected.length,
    total: techniques.length,
    mastered: mastered.length,
    masteredRegions: mastered,
    regions: groups.length,
    cleared: Object.keys(state.bestGrades || {}).length,
  };
}

export default { rankFor, rankSatisfied, rankStats };

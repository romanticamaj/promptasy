/**
 * Promptasy — 轉折（v1.2 · P21）
 *
 * 世界觀鋪到 P20b 為止已經有很多層（12 座石碑、24 頁殘頁、24 條傳聞、12 位守夜人的
 * 舊事、20 隻濁靈的濁言、12 處回聲重演、24 則小知識），但**故事沒有轉折點**：
 * 玩家一路收集，中途沒有一刻「原來是這樣」。這一支就是那一刻。
 *
 * 兩段，都是**加法**——多一座碑、多一層字：
 *
 *   ① **中點揭示**（分歧之廳）
 *      走進分歧之廳，柱腳那塊碑上多一層字，回聲說一句。
 *      **觸發只看「人站在哪一片土地上」**（`regionAt`），與解了幾關、拿了幾個徽章、
 *      等級多少**完全無關** —— 跳著解門、一關都沒解的人也不會錯過這一刻。
 *      這件事在型別上就成立：`midpointTriggered()` 根本收不到進度。
 *
 *   ② **鏡碑第二層**（校驗場）
 *      稱號鏈走到第三階（`scribe` · 抄寫人）時，鏡碑上多一層字。
 *      **沒到門檻不是鎖住、不是消失**——碑還在原地、還讀得到，只是那一層還沒亮。
 *
 * 鐵則（P21 規格）：
 *   · 中點揭示記一個「說過了」的旗標，但那個旗標**不准出現在任何解鎖判定裡**
 *     （`progression.js` 的 `gateSatisfied()` / `refreshUnlocks()` 一個字都沒動；
 *     `test:rubric` 逐項比對「說過之後每一片土地的解鎖狀態逐值不變」）。
 *   · 這一層是**純風味**（`authored: "game"` 的同一條界線）：不掛任何出處、
 *     不宣稱任何技巧、不放連結。教學與官方文件永遠只在關卡與圖鑑。
 *   · 不新增互動層、不新增 UI：碑走既有的石碑那一層（`E`），回聲走既有的 toast 通道。
 *
 * 這一支**不 import 任何東西**（連 three.js 都沒有），所以測試腳本與 UI 都拿得到，
 * 而且每一支都回布林／小陣列，放進每幀迴圈也不配置物件。
 */

/**
 * 中點揭示的那一格。
 *
 * `gate` 是碑上那一層字的門（`props.js` 的 `lines[].when`）；
 * `flag` 是存檔 `flags` 裡的那一個布林；`echo` 是 `nudge.js` 的分支名。
 */
export const MIDPOINT = Object.freeze({
  /** 走進哪一片土地才算數。 */
  region: 'divergence',
  /** 碑上那一層字的門。 */
  gate: 'midpoint',
  /** 存檔旗標（只記「說過了」，不參與任何解鎖判定）。 */
  flag: 'midpointSeen',
  /** 回聲的分支名（`ECHO_LINES` 的一格）。 */
  echo: 'midpointRevealed',
});

/**
 * 鏡碑第二層的那一格。
 *
 * `rankStep` 是稱號鏈的**第幾階（1 起算）**——第三階是 `ranks.json` 的 `scribe`
 * （抄寫人）。這裡刻意存「第幾階」而不是 id 一份：`rankFor()` 交出來的是 index，
 * 兩邊要用同一把尺，`test:rubric` 逐值比對 `ranks[rankStep - 1].id === rankId`。
 */
export const SCRIBE = Object.freeze({
  /** 碑上那一層字的門。 */
  gate: 'scribe',
  /** 稱號鏈第三階（1 起算）。 */
  rankStep: 3,
  /** 那一階的 id（與 `ranks.json` 逐值比對）。 */
  rankId: 'scribe',
});

/** 碑上「那一層字」的門一共有哪幾種（`props.js` 的 `lines[].when` 只收這幾個）。 */
export const TABLET_GATES = Object.freeze([MIDPOINT.gate, SCRIBE.gate]);

/**
 * 走進分歧之廳了嗎。
 *
 * **這一支收不到進度，所以它不可能綁在關卡數上。** 橋上不算走進去
 * （`regionAt()` 的 `onBridge`）——橋面不屬於任何一片土地。
 *
 * @param {string} regionId `regionAt()` 給的那一片土地
 * @param {boolean} [onBridge] 人在橋上嗎
 * @returns {boolean}
 */
export function midpointTriggered(regionId, onBridge = false) {
  return regionId === MIDPOINT.region && !onBridge;
}

/**
 * 中點揭示說過了嗎（讀存檔旗標）。
 * @param {object} progression
 * @returns {boolean}
 */
export function midpointSeen(progression) {
  const flags = progression && progression.state ? progression.state.flags : null;
  return Boolean(flags && flags[MIDPOINT.flag]);
}

/**
 * 這一拍要不要說那一句。
 *
 * 回布林（不是物件）—— 它在每幀迴圈裡被呼叫，不准配置。
 *
 * @param {string} regionId `regionAt()` 給的那一片土地
 * @param {boolean} onBridge 人在橋上嗎
 * @param {object} progression
 * @returns {boolean}
 */
export function shouldRevealMidpoint(regionId, onBridge, progression) {
  if (!midpointTriggered(regionId, onBridge)) return false;
  return !midpointSeen(progression);
}

/**
 * 記下「說過了」。
 *
 * 只寫 `flags`，不給 XP、不寫 `bestGrades`、不動徽章、不碰 `unlockedRegions` ——
 * 這一格的鐵則是**旗標不影響任何解鎖**。
 *
 * @param {object} progression
 * @returns {boolean} 這一次真的是第一次嗎
 */
export function markMidpointSeen(progression) {
  if (!progression || typeof progression.setFlag !== 'function') return false;
  if (midpointSeen(progression)) return false;
  progression.setFlag(MIDPOINT.flag, true);
  return true;
}

/**
 * 稱號鏈走到第三階（含）以上了嗎。
 * @param {number} rankIndex `rankFor()` 交出來的 index（0 起算）
 * @returns {boolean}
 */
export function scribeReached(rankIndex) {
  return Number.isFinite(rankIndex) && rankIndex >= SCRIBE.rankStep - 1;
}

/**
 * 現在有哪幾層字是亮著的。
 *
 * 交給 `tabletLines(tablet, lit)`：**沒被交出來的那一層就是還沒亮**——
 * 碑照樣在原地、照樣讀得到，只是那一層還沒有字。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.midpointSeen] 中點揭示說過了嗎
 * @param {number} [opts.rankIndex] 目前稱號的 index（0 起算；沒有就給 −1）
 * @returns {string[]}
 */
export function litTabletGates({ midpointSeen: seen = false, rankIndex = -1 } = {}) {
  const lit = [];
  if (seen) lit.push(MIDPOINT.gate);
  if (scribeReached(rankIndex)) lit.push(SCRIBE.gate);
  return lit;
}

export default {
  MIDPOINT,
  SCRIBE,
  TABLET_GATES,
  midpointTriggered,
  midpointSeen,
  shouldRevealMidpoint,
  markMidpointSeen,
  scribeReached,
  litTabletGates,
};

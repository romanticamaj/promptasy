/**
 * Promptasy — 轉折與終局（v1.2 · P21 ＋ P22）
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
 * ---------------------------------------------------------------------------
 *
 * **③ 終局（v1.2 · P22）—— 回聲的小祠 ＋ 母碑重立**
 *
 * 130 條技法全收 ＋ 四宿全亮 → 斷環旁的**回聲的小祠**開口。走進去，回聲兌現
 * 牠在序章說過的那句「我記得每個人的第一句話」：把你自己**在序章寫下的第一句**
 * 還給你。那就是最後一團濁氣 —— **你當年沒說清楚的那一句**。你重寫它一次，
 * 母碑在斷環中央重新立起來。
 *
 * 這一段的鐵則比前兩段更硬（它的情感負載最重）：
 *   · **沒有失敗態。** 重寫走自由書寫，任何一句都收得下（判定在
 *     `src/challenges/finale.js`，那一支從頭到尾交不出「沒過」這種形狀）。
 *   · **私人內容要先問過才會出現在帶得走的東西上。** `firstPrompt` 與玩家重寫的
 *     那一句都是玩家自己打的字：**刻上去之前一定要明確確認**、**永遠可以選擇不刻**、
 *     顯示一律 HTML escape、**不上傳**（那條路上一個網路呼叫都沒有）。
 *     選了「不刻」＝那句話**根本不寫進存檔**（不存就不可能外流）。
 *   · **沒到門檻只是「還沒開口」**：小祠一直立在那裡，不是鎖、也不提示「還差幾條」——
 *     那會把終局變成一張待辦清單。
 *   · **舊存檔沒有第一句也走得完**：退路是「你最好的一句」（`finalSayFor()`）。
 *   · **reset 之後可以重走**：旗標與碑面的字都住在存檔裡，清掉就回到起點。
 *
 * 旗標的分工（P21 那條「說出口了才記旗標」在這裡有一個例外，要分清楚）：
 *   · `shrineSpoken` / `steleSpoken` ＝「**那一句回聲說出口了**」——
 *     一定要等 `nudge.lastEchoKind()` 認帳才記（不然撞上冷卻就永遠不會再有第二次）。
 *   · `steleRaised` ＝「**母碑站起來了**」，那是**世界狀態**，儀式一走完就要落盤：
 *     等回聲說完才記的話，中間重整一次母碑就會躺回去。
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

/* ================================================================== *
 * ③ 終局：回聲的小祠 ＋ 母碑重立（v1.2 · P22）
 * ================================================================== */

/**
 * 終局那兩件東西的名字與旗標。
 *
 * `shrine` 是斷環旁那座小祠，`stele` 是斷環中央那塊母碑 ——
 * 兩件走**同一層互動**（`world.nearestFinale()`），所以只有一組半徑要維護。
 */
export const FINALE = Object.freeze({
  /** 兩件東西都住在中央高原。 */
  region: 'foundations',
  /** 小祠的 id（場景圖節點 `finale:echo-shrine`）。 */
  shrineId: 'echo-shrine',
  /** 母碑的 id（場景圖節點 `finale:mother-stele-raised`；碑上那塊殘片是另一塊碑，不同 id）。 */
  steleId: 'mother-stele-raised',
  /** 「回聲說過『小祠開口了』那一句」的旗標。 */
  shrineFlag: 'shrineSpoken',
  /** 「母碑站起來了」的旗標 —— 這是**世界狀態**，儀式走完就落盤。 */
  raisedFlag: 'steleRaised',
  /** 「回聲說過『母碑立起來了』那一句」的旗標。 */
  steleFlag: 'steleSpoken',
  /** 存檔裡碑面那一行字的欄位名（空字串＝碑面留白）。 */
  inscriptionKey: 'motherStele',
  /** 回聲的分支名（`ECHO_LINES` 的三格）。 */
  echoShrine: 'shrineOpened',
  echoCarved: 'steleCarved',
  echoBlank: 'steleBlank',
});

/** 小祠的互動半徑。它排在仲裁的第一位，而擺位規則要求它的圈與每一層都不重疊。 */
export const SHRINE_RADIUS = 4.6;
/**
 * 母碑的互動半徑：**7.0，這是量出來的**。
 *
 * 母碑站在斷環的臺座正中央，而那塊臺座本身就是碰撞體（`LANDMARK_SOLIDS`
 * 的 `[0, 0, 5.4]`）—— 人最近只走得到離碑心 5.4 ＋ 玩家半徑 0.62 ＝ **6.02 公尺**。
 * 照石座那一階（6.5）寫的話，能按到的只剩 0.5 公尺寬的一圈，而實測那一圈
 * 有四個方向被兩根側柱與斜靠的方尖碑擋住。7.0 讓人站在臺邊就按得到
 * （實測 24 個方向裡 20 個走得到，落點在 6.2–6.6 公尺）。
 *
 * 半徑比石座（6.5）大不會蓋掉誰 —— 這是**量出來的**，不是靠地標留白推的：
 * 它的圈與每一層的圈都不重疊，最緊的一邊是東橋碑（`tablet:east-bridge`，
 * 站在斷環外那一圈上），還剩 0.32 公尺（`test:rubric` 逐層量、逐值比對契約）。
 */
export const STELE_RADIUS = 7;

/** 舊存檔沒有第一句時的退路（世界的說法：那就寫你最好的一句）。 */
export const BEST_SAY_FALLBACK = Object.freeze({
  /** 小祠擺出來的那一團濁氣長什麼樣（沒有第一句可以還給你的時候）。 */
  say: '（這一句沒有被留下來。）',
  /** 底下那一行：要玩家寫什麼。 */
  ask: '那就把你最好的一句留在這裡。',
});

/** 有第一句時，底下那一行要玩家做什麼。 */
export const FIRST_SAY_ASK = '代它把這句話再說一遍。';

/**
 * 小祠開口了嗎。
 *
 * 門檻只有兩件：**130 條技法全收** ＋ **四宿全亮**。
 * 沒到不是鎖、也不是待辦清單 —— 小祠一直立在那裡，只是還沒開口。
 *
 * 收得到的只有四個數字（收了幾條 / 一共幾條 / 亮了幾宿 / 一共幾宿）——
 * 它**看不到等級、看不到 XP、看不到解鎖清單**，所以不可能長成另一種門檻。
 *
 * @param {{skills?:number, skillsTotal?:number, mansionsLit?:number, mansionsTotal?:number}} [counts]
 * @returns {boolean}
 */
export function shrineOpen(counts = {}) {
  const c = counts && typeof counts === 'object' ? counts : {};
  const skills = Number.isFinite(c.skills) ? c.skills : -1;
  const skillsTotal = Number.isFinite(c.skillsTotal) ? c.skillsTotal : 0;
  const lit = Number.isFinite(c.mansionsLit) ? c.mansionsLit : -1;
  const litTotal = Number.isFinite(c.mansionsTotal) ? c.mansionsTotal : 0;
  if (!(skillsTotal > 0) || !(litTotal > 0)) return false;
  return skills >= skillsTotal && lit >= litTotal;
}

/** 讀存檔旗標：回聲說過「小祠開口了」那一句了嗎。 */
export function shrineSpoken(progression) {
  return readFlag(progression, FINALE.shrineFlag);
}

/** 讀存檔旗標：母碑站起來了嗎（世界狀態）。 */
export function steleRaised(progression) {
  return readFlag(progression, FINALE.raisedFlag);
}

/** 讀存檔旗標：回聲說過「母碑立起來了」那一句了嗎。 */
export function steleSpoken(progression) {
  return readFlag(progression, FINALE.steleFlag);
}

/** `state.flags` 上的一格（沒有進度物件、沒有 state 一律當成 false）。 */
function readFlag(progression, key) {
  const flags = progression && progression.state ? progression.state.flags : null;
  return Boolean(flags && flags[key]);
}

/**
 * 這一拍要不要說「小祠開口了」那一句。
 *
 * 回布林（不是物件）—— 它在每幀迴圈裡被呼叫，不准配置。
 *
 * @param {boolean} open 小祠開口了嗎（`shrineOpen()` 的結果）
 * @param {object} progression
 * @returns {boolean}
 */
export function shouldAnnounceShrine(open, progression) {
  if (!open) return false;
  return !shrineSpoken(progression);
}

/**
 * 記下「說過『小祠開口了』」。只寫 `flags`，不給 XP、不收技巧、不碰解鎖。
 * @param {object} progression
 * @returns {boolean} 這一次真的是第一次嗎
 */
export function markShrineSpoken(progression) {
  return markFlag(progression, FINALE.shrineFlag, shrineSpoken);
}

/** 記下「母碑站起來了」（世界狀態，儀式一走完就落盤）。 */
export function markSteleRaised(progression) {
  return markFlag(progression, FINALE.raisedFlag, steleRaised);
}

/** 記下「說過『母碑立起來了』」。 */
export function markSteleSpoken(progression) {
  return markFlag(progression, FINALE.steleFlag, steleSpoken);
}

/** 三個旗標共用的寫法：已經是真的就不算第一次；沒有 `setFlag` 的替身不會爆。 */
function markFlag(progression, key, read) {
  if (!progression || typeof progression.setFlag !== 'function') return false;
  if (read(progression)) return false;
  progression.setFlag(key, true);
  return true;
}

/**
 * 小祠要還給玩家的那一句 —— **最後一團濁氣身上的話**。
 *
 * 有序章那一句就用它（**玩家的原文，一個位元組都不動**；顯示的一方一定要自己
 * HTML escape）；舊存檔沒有那一欄的人走退路：碑面那一團擺的是一句世界的說法，
 * 要求改成「寫你最好的一句」。
 *
 * @param {string} firstPrompt `progression.firstPrompt()`
 * @returns {{mode:'first'|'best', say:string, ask:string}}
 */
export function finalSayFor(firstPrompt) {
  const text = typeof firstPrompt === 'string' ? firstPrompt.trim() : '';
  if (text) return { mode: 'first', say: text, ask: FIRST_SAY_ASK };
  return { mode: 'best', say: BEST_SAY_FALLBACK.say, ask: BEST_SAY_FALLBACK.ask };
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
  FINALE,
  SHRINE_RADIUS,
  STELE_RADIUS,
  BEST_SAY_FALLBACK,
  FIRST_SAY_ASK,
  shrineOpen,
  shrineSpoken,
  steleRaised,
  steleSpoken,
  shouldAnnounceShrine,
  markShrineSpoken,
  markSteleRaised,
  markSteleSpoken,
  finalSayFor,
};

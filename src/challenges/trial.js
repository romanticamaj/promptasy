/**
 * Promptasy — 應用關（試煉）的動態 rubric
 *
 * 課程 v2 · Phase J2。每一片土地的地標腳下站著一座**試煉**：
 * 它不教任何新技巧（第二幕整幕不存在），只要求你把這片土地上**已經學會的**
 * 那幾條組合起來用一次（curriculum-v2 §5.2）。
 *
 * 所以它的 rubric 是在開關卡的當下才組出來的：
 *
 *   · 資料層宣告一份**候選列**（`rubric` 裡標了 `candidate: true` 的那幾列，
 *     每一列掛一條真實的 v2 技能 `skillId`）。
 *   · 開關卡時用 `knowsSkill()` 過濾 —— **沒學過的不列**。
 *     沒學過的東西不該擋住你（P9 完全資訊：畫面上列出來的每一條，
 *     你都已經在這片土地上被教過了）。
 *   · 地基列（`foundation: true`，例如「說清楚要做什麼」）永遠都在 ——
 *     它不是這片土地的技巧，是每一份委託的地板。
 *
 * **門檻公式（寫進 WORLD.md §3.3c）**：
 *
 *   pass = max(2, round(入選權重總和 × 0.5 × 2) / 2)
 *
 *   也就是「入選權重總和的 50%，四捨五入到 0.5 分，下限 2 分」。
 *   資料層存的 `pass` 是把**全部**候選列都算進去時的值（檔案層的測試看它），
 *   runtime 一律以這支函式重算 —— 兩者用的是同一條公式。
 *
 * **絕不軟鎖**：如果玩家已經學會的候選列少於 2 條（例如先行前往、
 * 或跳著玩），就照資料層的順序補到 2 條並回報 `shortfall` ——
 * 畫面上會誠實說明「這兩條你還沒學過，先看一眼再寫」。
 * 「打得開卻永遠過不了」與「打不開」這兩種死路都不存在。
 */

/** 一份挑選出來的候選列至少要有幾條（少於這個數就補，不軟鎖）。 */
export const MIN_TRIAL_ROWS = 2;

/** 這一關是不是應用關（試煉）。 */
export function isApplicationTrial(challenge) {
  return Boolean(challenge && challenge.application === true);
}

/** 這一列是不是「要看你學過沒有」的候選列。 */
export function isCandidateRow(row) {
  return Boolean(row && row.candidate === true && typeof row.skillId === 'string' && row.skillId);
}

/**
 * 依「這條技能會了沒有」把候選列篩出來，並用同一條公式重算門檻。
 *
 * @param {object} challenge
 * @param {(skillId:string)=>boolean} knows 通常是 `progression.knowsSkill`
 * @returns {{
 *   rubric: Array, pass: number, total: number,
 *   selected: Array, dropped: Array, shortfall: Array, isTrial: boolean
 * }}
 */
export function resolveTrial(challenge, knows) {
  const rubric = Array.isArray(challenge && challenge.rubric) ? challenge.rubric : [];
  if (!isApplicationTrial(challenge)) {
    return {
      rubric,
      pass: challenge && Number.isFinite(challenge.pass) ? challenge.pass : trialPass(rubric),
      total: totalWeight(rubric),
      selected: [],
      dropped: [],
      shortfall: [],
      isTrial: false,
    };
  }

  const ask = typeof knows === 'function' ? knows : () => true;
  const candidates = rubric.filter(isCandidateRow);
  const fixed = rubric.filter((r) => !isCandidateRow(r));

  const selected = [];
  const dropped = [];
  for (const row of candidates) {
    let ok = false;
    try {
      ok = Boolean(ask(row.skillId));
    } catch {
      ok = false;
    }
    (ok ? selected : dropped).push(row);
  }

  /*
   * 誠實的退路：學過的不到兩條時，照資料層的順序補到兩條。
   * 補進來的那幾條會被標進 `shortfall`，畫面上直說「這一條你還沒學過」——
   * 不假裝它是你會的，也不把門鎖起來。
   */
  const shortfall = [];
  while (selected.length < MIN_TRIAL_ROWS && dropped.length) {
    const row = dropped.shift();
    selected.push(row);
    shortfall.push(row);
  }
  // 維持資料層宣告的順序（`selected` 可能因為補位而亂序）
  const chosen = candidates.filter((r) => selected.includes(r));
  const merged = rubric.filter((r) => !isCandidateRow(r) || chosen.includes(r));

  return {
    rubric: merged,
    pass: trialPass(merged),
    total: totalWeight(merged),
    selected: chosen,
    dropped,
    shortfall,
    isTrial: true,
    fixed,
  };
}

/** 一份 rubric 的權重總和。 */
export function totalWeight(rows) {
  return (rows || []).reduce((n, r) => n + (Number.isFinite(r.weight) ? r.weight : 1), 0);
}

/** 門檻公式：入選權重總和的 50%，四捨五入到 0.5 分，下限 2 分。 */
export function trialPass(rows) {
  const total = totalWeight(rows);
  return Math.max(2, Math.round(total * 0.5 * 2) / 2);
}

/**
 * 把 challenge 換成「這一次真的要被評分的那一份」。
 * 非應用關原樣回傳（同一個物件，零行為變化）。
 */
export function effectiveChallenge(challenge, knows) {
  if (!isApplicationTrial(challenge)) return challenge;
  const r = resolveTrial(challenge, knows);
  return { ...challenge, rubric: r.rubric, pass: r.pass, __trial: r };
}

export default { isApplicationTrial, isCandidateRow, resolveTrial, effectiveChallenge, trialPass, totalWeight };

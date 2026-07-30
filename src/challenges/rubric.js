/**
 * PromptArcade — 評分引擎（offline rubric engine）
 *
 * 輸入：challenge（資料定義） + 玩家寫的 prompt
 * 輸出：每條檢查的過/部分/未過 ＋ 教學提示 ＋ 總分 ＋ 評價（S/A/B/C）＋ XP
 *
 * 完全離線、零相依。CLAUDE.md 護欄 3：核心迴圈不依賴任何 API key。
 */
import { CHECKS, MIN_PROMPT_LENGTH, runCheck } from './checks.js';

/**
 * 評價門檻（以「得分 / 總權重」的比例判定）。
 *
 * Phase 9：對象改成「非工程師的一般人」，整條曲線往下放寬一階 ——
 * 努力有做到就看得到回報，滿分不再是「一分都不能少」。
 *   S ≥ 0.95（幾乎全中，允許一條只拿部分分數）
 *   A ≥ 0.78
 *   B ≥ 0.60
 *   C  只要達到 challenge.pass
 */
export const GRADE_THRESHOLDS = Object.freeze([
  { grade: 'S', ratio: 0.95 },
  { grade: 'A', ratio: 0.78 },
  { grade: 'B', ratio: 0.6 },
  { grade: 'C', ratio: 0 }, // 只要達到 challenge.pass 就至少是 C
]);

/** 評價 → XP 倍率。 */
export const GRADE_XP_MULTIPLIER = Object.freeze({ C: 1, B: 1.35, A: 1.7, S: 2.2 });

/** 評價排序（用來判斷「是不是刷新最佳紀錄」）。 */
export const GRADE_ORDER = Object.freeze(['C', 'B', 'A', 'S']);

/** 預設每關基礎 XP（challenge.xp 可覆寫）。 */
export const DEFAULT_BASE_XP = 40;

/**
 * @param {number} ratio 0..1
 * @returns {'S'|'A'|'B'|'C'}
 */
export function gradeForRatio(ratio) {
  // 浮點誤差容忍
  const r = Math.round(ratio * 1e6) / 1e6;
  for (const t of GRADE_THRESHOLDS) {
    if (r >= t.ratio) return t.grade;
  }
  return 'C';
}

/** 某評價值多少 XP（未過關 = 0）。 */
export function xpForGrade(grade, baseXp = DEFAULT_BASE_XP) {
  if (!grade || !GRADE_XP_MULTIPLIER[grade]) return 0;
  return Math.round(baseXp * GRADE_XP_MULTIPLIER[grade]);
}

/** 比較兩個評價，回傳較好的那個（null 視為最差）。 */
export function betterGrade(a, b) {
  const ia = GRADE_ORDER.indexOf(a);
  const ib = GRADE_ORDER.indexOf(b);
  return ib > ia ? b : a || b || null;
}

/**
 * 評分一個 challenge。
 *
 * @param {object} challenge 至少包含 { id, rubric:[{check,weight,hint}], pass }
 * @param {string} prompt    玩家輸入
 * @returns {{
 *   challengeId:string, prompt:string, tooShort:boolean,
 *   results:Array, earned:number, total:number, ratio:number,
 *   pass:number, passed:boolean, grade:(string|null),
 *   baseXp:number, xp:number, missing:Array, teaches:string[]
 * }}
 */
export function evaluate(challenge, prompt) {
  if (!challenge || !Array.isArray(challenge.rubric)) {
    throw new Error('evaluate(): challenge 缺少 rubric 陣列');
  }
  const text = typeof prompt === 'string' ? prompt : '';
  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_PROMPT_LENGTH;

  const results = challenge.rubric.map((row) => {
    const weight = Number.isFinite(row.weight) ? row.weight : 1;
    // challenge 可以替單一檢查提供「貼近本關情境」的示範句與同義詞
    const outcome = runCheck(row.check, trimmed, row.checkOptions || {});
    const def = CHECKS[row.check];
    return {
      check: row.check,
      label: outcome.label || row.check,
      weight,
      score: outcome.score,
      earned: Math.round(weight * outcome.score * 100) / 100,
      passed: outcome.passed,
      partial: outcome.partial,
      evidence: outcome.evidence,
      // challenge 可以覆寫提示；否則用檢查器的預設提示
      hint: row.hint || (def && def.hint) || '',
      // 這條檢查對應哪個技巧 → UI 拿去查官方出處
      techniqueId: row.techniqueId || outcome.techniqueId || null,
    };
  });

  const total = results.reduce((n, r) => n + r.weight, 0);
  const earned = Math.round(results.reduce((n, r) => n + r.earned, 0) * 100) / 100;
  // Phase 9：資料沒寫門檻時，預設抓總權重的一半（原本 0.66，對一般人太陡）
  const passMark = Number.isFinite(challenge.pass) ? challenge.pass : Math.ceil(total * 0.5);
  const ratio = total > 0 ? earned / total : 0;
  const passed = !tooShort && earned >= passMark;
  const grade = passed ? gradeForRatio(ratio) : null;
  const baseXp = Number.isFinite(challenge.xp) ? challenge.xp : DEFAULT_BASE_XP;

  return {
    challengeId: challenge.id,
    prompt: text,
    tooShort,
    results,
    earned,
    total,
    ratio,
    pass: passMark,
    passed,
    grade,
    baseXp,
    xp: xpForGrade(grade, baseXp),
    missing: results.filter((r) => !r.passed),
    teaches: Array.isArray(challenge.teaches) ? challenge.teaches.slice() : [],
  };
}

/** 下一個評價還差多少分（UI 用來鼓勵重寫）。 */
export function nextGradeTarget(evaluation) {
  if (!evaluation.passed || !evaluation.grade || evaluation.grade === 'S') return null;
  const idx = GRADE_ORDER.indexOf(evaluation.grade);
  const nextGrade = GRADE_ORDER[idx + 1];
  const threshold = GRADE_THRESHOLDS.find((t) => t.grade === nextGrade);
  if (!threshold) return null;
  const need = Math.max(0, threshold.ratio * evaluation.total - evaluation.earned);
  return { grade: nextGrade, need: Math.round(need * 100) / 100 };
}

export default evaluate;

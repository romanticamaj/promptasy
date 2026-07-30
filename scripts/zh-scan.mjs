/**
 * 遊戲自撰文案的「英文句子」掃描器（Phase 9 全面中文化）。
 *
 * 規則：允許技術名詞（JSON / API / prompt / temperature / <thinking> / snake_case 識別字…），
 * 但不允許「連續三個以上的英文單字」——那就是一句英文句子，一般人讀不懂。
 *
 * 匯出成模組，讓 scripts/test-rubric.mjs 直接拿去當測試用。
 */

/** 兩個字以上、確實需要以英文出現的技術詞組（大小寫不敏感）。 */
export const TECH_PHRASES = [
  'max output tokens',
  'stop sequence',
  'reasoning effort',
  'prompt caching',
  'function calling',
  'few shot',
  'chain of thought',
  'code execution',
  'search grounding',
  'structured outputs',
  'system prompt',
  'prompt improver',
  'output prefix',
  'adaptive thinking',
];

/** 把「不算英文句子」的東西先拿掉，剩下的才拿來判斷。 */
export function stripTechnical(text) {
  let t = String(text || '');
  t = t.replace(/https?:\/\/\S+/g, ' '); // 連結
  t = t.replace(/<\/?[A-Za-z][^>\n]*>/g, ' '); // XML / HTML 標籤
  t = t.replace(/`[^`]*`/g, ' '); // 反引號程式碼
  t = t.replace(/\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b/g, ' '); // snake_case 識別字
  t = t.replace(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g, ' '); // camelCase 識別字
  t = t.replace(/\b[A-Za-z]+\.(?:txt|json|md|csv|js)\b/gi, ' '); // 檔名
  t = t.replace(/(?:\b[A-Za-z]\b[ \t]*)+/g, ' '); // 單獨的字母＝按鍵名（W A S D）
  for (const phrase of TECH_PHRASES) {
    t = t.replace(new RegExp(phrase.replace(/\s+/g, '\\s+'), 'gi'), ' ');
  }
  return t;
}

/** 連續 3 個以上的英文單字 = 一句英文句子。回傳命中的片段（沒有就回傳 null）。 */
export function findEnglishSentence(text) {
  const stripped = stripTechnical(text);
  const m = stripped.match(/(?:[A-Za-z][A-Za-z'’.-]*[ \t]+){2,}[A-Za-z][A-Za-z'’.-]*/);
  return m ? m[0].trim() : null;
}

export default findEnglishSentence;

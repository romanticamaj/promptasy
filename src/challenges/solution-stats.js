/**
 * Promptasy — 解法百分位（內建分布）與「最少技巧達成」（v1.2 · P10b）
 *
 * 過關之後，結果面多說一句：**這一次的分數／字數／技法數，在這一關的內建範例解裡站在哪裡。**
 *
 * ## 誠實原則（這一層存在的理由）
 *
 * 我們**沒有後端、不收集玩家資料**，所以這裡的分布**不是其他玩家的成績**，
 * 而是離線評分引擎跑「這一關自己的示範解答／快速填入／素材」拆組出來的通過解
 * （見 `scripts/build-solution-stats.mjs`）。畫面上那一行**一定要寫明是內建的**——
 * 說成「贏過多少玩家」就是騙人，Zachtronics 式的長條圖之所以動人是因為它是真的。
 *
 * ## 為什麼是「最少技巧」不是「最少字」
 *
 * roadmap §0 鐵則明文否決了「最少字拿 S」：短 ≠ 好 prompt，把字數當成就會教壞人。
 * 隱藏徽章給的是**用最少的技法就把事情講清楚**——技法數 ≤ 內建分布的最小值。
 *
 * ## 這一層不碰的東西
 *
 * `bestGrades`、`refreshUnlocks()`、142 關的分母一格都不動：徽章只寫進存檔的
 * `leanSeals`（純加法），既不給 XP、也不是任何東西的解鎖條件。
 */

/**
 * 漢字（含常見擴充區、相容區與日文假名）——一個字算一個。
 *
 * 邊界刻意寫成 \uXXXX 而不是把那幾個字直接打進來：CJK 字型子集是掃描
 * `src` 底下的語料切出來的，正則裡的邊界字會被當成「畫面上會出現的字」
 * 拖進子集 —— 那幾個碼位連原始字型都沒有，指紋測試會立刻抓到。
 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g;
/** 拉丁字母／數字——一串算一個（`3 個重點` 的 `3`、`temperature` 各算一個）。 */
const LATIN_RE = /[A-Za-z0-9]+(?:[.'-][A-Za-z0-9]+)*/g;

/**
 * 畫面上說的「字數」。
 *
 * 中文沒有空白分詞，所以「字數」對玩家來說就是**看得見的字**：
 * 漢字一個算一個，拉丁字母／數字一串算一個。標點與空白不算。
 * 產生內建分布的腳本與結果面用的是**同一支函式**，兩邊才比得下去。
 *
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (typeof text !== 'string' || !text) return 0;
  const cjk = text.match(CJK_RE);
  const latin = text.match(LATIN_RE);
  return (cjk ? cjk.length : 0) + (latin ? latin.length : 0);
}

/**
 * 這一段話「用了幾種技法」＝ 評分引擎在裡面**找得到**的檢查條數（`score > 0`）。
 *
 * 為什麼連只拿到部分分數的也算：技法「用了」與「用滿了」是兩件事 ——
 * 用得不夠好，該條的分數與提示會在上面那一列講；這裡數的是**你動用了幾種手法**。
 * 而且有些關卡靠部分分數就過得了關，只數滿分會讓「用了 0 種技法卻通過了」
 * 這種說不通的句子出現在畫面上，隱藏徽章也會變成永遠拿不到的空頭。
 *
 * @param {{results?:Array<{score?:number, passed?:boolean}>}} evaluation
 * @returns {number}
 */
export function techniqueCountOf(evaluation) {
  const rows = evaluation && Array.isArray(evaluation.results) ? evaluation.results : null;
  if (!rows) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const score = Number.isFinite(row.score) ? row.score : row.passed === true ? 1 : 0;
    if (score > 0) n += 1;
  }
  return n;
}

/**
 * 百分位：分布裡有幾成**不比這個數字高**（0..100 的整數）。
 *
 * 規則刻意單純、三軸一致：數「小於等於它的有幾個」÷ 總數。
 *   · 比全部都小 → 0
 *   · 比全部都大 → 100
 *   · 跟其中幾個一樣 → **並列算贏**（拿到滿分卻被說成「第 11 百分位」是騙人的另一種形式：
 *     內建分布常常有一大票同分的解答，嚴格小於會把「沒有人贏過你」講成「你墊底」）
 *
 * @param {number} value
 * @param {number[]} sorted 由小到大排好的陣列
 * @returns {number|null} 陣列空的時候回 null（沒有分布就不要亂講）
 */
export function percentileOf(value, sorted) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  if (!Number.isFinite(value)) return null;
  let atOrBelow = 0;
  for (let i = 0; i < sorted.length; i += 1) if (sorted[i] <= value) atOrBelow += 1;
  return Math.round((atOrBelow / sorted.length) * 100);
}

/** 一組分布看起來合不合法（壞資料一律當成「沒有分布」）。 */
function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  for (const key of ['scores', 'words', 'techniques']) {
    const arr = entry[key];
    if (!Array.isArray(arr) || arr.length === 0) return false;
    for (let i = 0; i < arr.length; i += 1) {
      if (!Number.isFinite(arr[i])) return false;
      if (i > 0 && arr[i] < arr[i - 1]) return false; // 必須是排好的
    }
  }
  return entry.scores.length === entry.words.length && entry.scores.length === entry.techniques.length;
}

/**
 * 建立「解法分布」查詢層。
 *
 * @param {{stats?:Array<object>}|null} file `src/data/solution-stats.json`
 */
export function createSolutionStats(file) {
  const byId = new Map();
  const rows = file && Array.isArray(file.stats) ? file.stats : [];
  for (const row of rows) {
    if (row && typeof row.id === 'string' && row.id && validEntry(row)) byId.set(row.id, row);
  }

  return {
    /** 收了幾關的分布（測試用）。 */
    get size() {
      return byId.size;
    },
    /** 這一關的內建分布（沒有就 null）。 */
    statsFor(id) {
      return byId.get(id) || null;
    },

    /**
     * 這一次的成績站在內建分布的哪裡。
     *
     * **回 null 的三種情形**（寧可不說，也不說不準的話）：
     *   · 這一關沒有內建分布（濁靈、序章…）；
     *   · 這一次沒過關（分布講的是「解得開的人怎麼寫」）；
     *   · 這一次的**滿分總分**和分布的基準對不上 —— 試煉的 rubric 是開關卡當下
     *     依「你已經學會什麼」組出來的，條數不同就不能拿來比。
     *
     * @param {{id?:string}} challenge
     * @param {{passed?:boolean, earned?:number, total?:number, prompt?:string, results?:Array}} evaluation
     * @returns {null|{
     *   n:number, score:number, words:number, techniques:number,
     *   scorePct:number, wordsPct:number, techniquesPct:number,
     *   leanest:number, lean:boolean
     * }}
     */
    standingFor(challenge, evaluation) {
      if (!challenge || !evaluation || evaluation.passed !== true) return null;
      const entry = byId.get(challenge.id);
      if (!entry) return null;
      if (Number.isFinite(entry.total) && Number.isFinite(evaluation.total)) {
        if (Math.abs(entry.total - evaluation.total) > 1e-6) return null;
      }
      const score = Number.isFinite(evaluation.earned) ? evaluation.earned : 0;
      const words = countWords(evaluation.prompt);
      const techniques = techniqueCountOf(evaluation);
      const scorePct = percentileOf(score, entry.scores);
      const wordsPct = percentileOf(words, entry.words);
      const techniquesPct = percentileOf(techniques, entry.techniques);
      if (scorePct === null || wordsPct === null || techniquesPct === null) return null;
      const leanest = entry.techniques[0];
      return {
        n: entry.scores.length,
        score,
        words,
        techniques,
        scorePct,
        wordsPct,
        techniquesPct,
        leanest,
        // 隱藏徽章：用得比內建最精簡的那一份還少（或一樣少）就算達成
        lean: techniques > 0 && techniques <= leanest,
      };
    },
  };
}

export default { countWords, techniqueCountOf, percentileOf, createSolutionStats };

/**
 * Promptasy — 終局那一次重寫的判定（v1.2 · P22）
 *
 * 斷環旁的小祠開口之後，玩家要把**自己序章寫下的第一句**重說一遍。
 * 這一支就是那一次的判定，而它只有一條規矩：
 *
 *   ### 沒有失敗態。
 *
 * 它**交不出**「沒過」這種形狀 —— `accepted` 是一個永遠為 `true` 的常數，
 * 沒有分數、沒有評價、沒有門檻、沒有「還差什麼」。
 * 玩家寫什麼都收得下（`test:rubric` 餵一整排爛答案進來，每一句都得被收下）。
 * 這不是考試，是「你已經學會說話了」的證明 —— WORLD.md §3.5 的極端解。
 *
 * 那評分引擎在這裡做什麼？**只做加法**：它把這一句裡「回聲聽見了什麼」列出來。
 * 用的是**既有的** `checks.js`（不新增檢查器、不改任何門檻），一次一支，
 * 命中就多一行「你說了……」；一條都沒命中也只是那張清單是空的 ——
 * 畫面上不會出現一個字說你少了什麼。
 *
 * 這一支是**純函式**：不碰 DOM、不碰 three.js、不讀存檔、**不連網**
 * （那條路上一個 `fetch` 都沒有 —— 玩家自己打的字絕不離開這台裝置）。
 * 所以 `test:rubric` 可以直接餵它一段字問「它會怎麼回」，不必先開一個畫面。
 */
import { runCheck } from './checks.js';

/**
 * 回聲在這一句裡「聽得見」的那幾件事。
 *
 * 六條全部是**既有的**檢查器（`checks.js`），而且刻意挑中央高原教的那幾件
 * ——「把話說完整」本來就是整趟旅程的第一課，終局回到同一課。
 * `heard` 的寫法一律是「**你說了……**」：這張表裡不准出現一句話講「你少了什麼」。
 */
export const LISTEN_CHECKS = Object.freeze([
  Object.freeze({ check: 'assignsTask', heard: '你說了要它做的那件事。' }),
  Object.freeze({ check: 'specifiesFormat', heard: '你說了答案該長成什麼樣子。' }),
  Object.freeze({ check: 'hasConstraint', heard: '你給了一個數得出來的界線。' }),
  Object.freeze({ check: 'positiveFraming', heard: '你說的是要什麼，不是不要什麼。' }),
  Object.freeze({ check: 'groundsInContext', heard: '你把它該知道的事一起說了。' }),
  Object.freeze({ check: 'hasRole', heard: '你告訴它，這一次它是誰。' }),
]);

/**
 * **這一支的全部門檻**：一個永遠為真的常數。
 *
 * 寫成常數而不是算出來的值，是為了讓「沒有失敗態」在**型別上**就成立：
 * 沒有任何輸入走得到另一個分支。`test:rubric` 兩面守著它 ——
 * 靜態面掃這一整支交不出 `failed`／`rejected`／評價／分數這幾種形狀，
 * 行為面餵一整排爛答案進 `listen()`，每一句的 `accepted` 都得是 `true`。
 */
export const ALWAYS_ACCEPTED = true;

/**
 * 聽一次。
 *
 * @param {string} text 玩家重寫的那一句（**原文**，這裡一個位元組都不動；
 *   顯示的一方自己 HTML escape，帶得走的東西自己問過玩家）
 * @returns {{said:string, heard:string[], checks:string[], accepted:true}}
 */
export function listen(text) {
  const said = typeof text === 'string' ? text : '';
  const heard = [];
  const checks = [];
  for (const row of LISTEN_CHECKS) {
    let out = null;
    try {
      out = runCheck(row.check, said);
    } catch {
      // 某一支檢查器壞掉不准弄壞終局 —— 那一行不出現，儀式照樣走得完
      out = null;
    }
    if (out && out.passed) {
      heard.push(row.heard);
      checks.push(row.check);
    }
  }
  return { said, heard, checks, accepted: ALWAYS_ACCEPTED };
}

/**
 * 這一句站得上碑嗎 —— **不是判對錯，是「碑上不能刻空白」**。
 *
 * 唯一會回 `false` 的情況是「他什麼都沒寫」：那不是沒通過，那是還沒開口。
 * 畫面上對應的也不是一句評語，而是「呈給神諭」那一下按不下去。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasSomethingToSay(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

/**
 * 刻不刻，只有這兩種答案 —— 而且**預設是不刻**。
 *
 * `carve` 是玩家主動按下去的那一個；`blank` 是另一個。
 * 沒有第三種、沒有「記住我的選擇」、沒有預先勾好的那一格：
 * 私人的字要出現在帶得走的東西上，每一次都要重新問過。
 */
export const CARVE_CHOICES = Object.freeze(['carve', 'blank']);
/** 沒有明確按下「刻上去」＝ 不刻。 */
export const DEFAULT_CHOICE = 'blank';

/**
 * 把一個選擇正規化成「這一次要刻的字」。
 *
 * **只有 `'carve'` 這一個字串會讓玩家的句子留下來**；其他任何東西
 * （`'blank'`、`undefined`、`true`、`'yes'`、`'carve '`…）一律回空字串 ＝ 碑面留白。
 * 「不刻」的實作是**根本不寫進存檔** —— 不存就不可能外流。
 *
 * @param {string} choice
 * @param {string} text
 * @returns {string} 要寫進存檔的那一行（空字串＝留白）
 */
export function inscriptionFor(choice, text) {
  if (choice !== 'carve') return '';
  return typeof text === 'string' ? text : '';
}

export default {
  LISTEN_CHECKS,
  ALWAYS_ACCEPTED,
  listen,
  hasSomethingToSay,
  CARVE_CHOICES,
  DEFAULT_CHOICE,
  inscriptionFor,
};

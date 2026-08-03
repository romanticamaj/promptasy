/**
 * Promptasy — 出處深連結疊加層（顯示層）
 *
 * 為什麼有這一層：`curriculum.json` 是逐字保留的官方引文，**一個位元組都不能動**
 * （CLAUDE.md 護欄 2）。但它記的網址大多只到「那一份文件」而不是「被引用的那一節」，
 * 玩家點過去還要自己在長長的頁面裡找一次 —— 出處等於只完成了一半。
 *
 * 這一層只做一件事：**在原網址後面加上一個片段**（`#章節 id` 或 `#:~:text=` 文字片段），
 * 讓連結直接跳到被引用的那一段。規則：
 *   · 疊加後的網址與原網址**只能差在片段**（`src/data/source-anchors.json` 與測試都強制驗證）；
 *   · 每一個片段都在稽核當天實際抓取該頁面驗證過（標題 id 真的存在／文字片段唯一命中）；
 *   · 找不到唯一落點的一律不收 —— 畫面上仍然是原本的頁面層網址，不臆造 anchor。
 *
 * 課程 v2 的 130 條技能（`skill-codex-v2.json`）是遊戲自撰的資料層，不受此限，
 * 它們的網址直接就地升級，不走這一層。
 */

/** 網址去掉片段（`#anchor` / `#:~:text=`）之後的本體。 */
export function baseUrl(url) {
  const s = String(url || '');
  const i = s.indexOf('#');
  return i < 0 ? s : s.slice(0, i);
}

/**
 * @param {object|null} overlayFile src/data/source-anchors.json
 */
export function createSourceAnchors(overlayFile = null) {
  const entries = (overlayFile && Array.isArray(overlayFile.entries) && overlayFile.entries) || [];
  /** `技巧 id|頁面網址` → 帶片段的網址 */
  const byKey = new Map();
  for (const e of entries) {
    if (!e || !e.techniqueId || !e.url || !e.anchored) continue;
    // 防呆：只接受「只差一個片段」的疊加（多一層保險，測試另外還會擋一次）
    if (baseUrl(e.anchored) !== e.url) continue;
    byKey.set(`${e.techniqueId}|${e.url}`, e.anchored);
  }

  /** 這條技巧引用的這個網址，有沒有更精準的深連結（沒有就原樣回傳）。 */
  function anchor(techniqueId, url) {
    if (!techniqueId || !url) return url;
    return byKey.get(`${techniqueId}|${baseUrl(url)}`) || url;
  }

  /** 把一整排出處套上深連結（回傳新陣列，原物件不動）。 */
  function applyTo(techniqueId, sources) {
    const list = sources || [];
    if (!byKey.size) return list.slice();
    return list.map((s) => {
      if (!s || !s.url) return s;
      const next = anchor(techniqueId, s.url);
      return next === s.url ? s : { ...s, url: next };
    });
  }

  return {
    anchor,
    applyTo,
    baseUrl,
    /** 疊加了幾條（測試與稽核報告用）。 */
    size: byKey.size,
    entries,
    file: overlayFile || null,
  };
}

export default createSourceAnchors;

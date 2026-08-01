/**
 * Promptasy — 內容索引
 * 把 curriculum.json / challenges.json 包成好查的介面，避免各處重複寫 find()。
 *
 * 積木的中文片段（builder-zh.json）是**遊戲自撰的翻譯層**：
 * 玩家在主控台按下去插入的是中文，英文原句只當次要參考，兩者都不是官方引文。
 * 官方說法與出處一律以 curriculum.techniques[].sources 為準。
 *
 * Phase 14：官方範例的中文譯寫層（curriculum-zh.json）也是同一種東西 ——
 * 畫面上「中文在前、官方英文原文收在可展開的『原文 ↗』並附可點的出處」。
 * 兩者一定分開存放，結構上不可能把譯寫當成官方引文。
 *
 * Phase 26：時代註記層（dated-notes.json）—— 第三種同性質的東西。
 * 官方建議會隨模型世代改變（例如取樣參數在新模型上會直接報錯），
 * 但 curriculum.json 的引文在它們的年代是正確的引用，所以一個字都不動；
 * 改成在畫面上安靜地補一句**有日期**的查核備註 ＋ 可點的新官方連結。
 * 引用的文件被下架時同理：原網址留著，顯示層另外標一句「已下架」與後繼參考。
 *
 * 課程 v2 · Phase B：第四個同性質的層 —— runtime catalog（`catalog.js`）。
 * 區域與技巧的**數量與列舉**一律改走它（`content.catalog`），不再有人寫死 68 / 5。
 * catalog 沒傳進來時會就地用 curriculum 建一份 legacy-only 的（行為與以前完全相同），
 * 所以既有的測試呼叫端一個字都不必改。
 */
import { createCatalog } from './catalog.js';

export function createContent(
  curriculum,
  challengeFile,
  builderZh = null,
  coachFile = null,
  flowFile = null,
  curriculumZh = null,
  datedFile = null,
  catalogInput = null
) {
  /** 課程 v2 的合併層：舊 68 條 ＋ 新 130 技能 ＋ 12 區（只有 implemented 的會被列舉）。 */
  const catalog = catalogInput || createCatalog({ curriculum });
  const challenges = (challengeFile.challenges || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const techniques = new Map((curriculum.techniques || []).map((t) => [t.id, t]));
  const topics = new Map((curriculum.topics || []).map((t) => [t.id, t]));
  const groups = new Map((curriculum.groups || []).map((g) => [g.id, g]));
  const vendors = new Map((curriculum.vendors || []).map((v) => [v.id, v]));
  const zhFragments = new Map(((builderZh && builderZh.blocks) || []).map((b) => [b.id, b.fragZh]));
  const builder = new Map(
    (curriculum.builder || []).map((b) => [
      b.id,
      {
        ...b,
        /** 按下去真正插進輸入框的片段：有中文版就用中文版（見檔頭說明）。 */
        insert: zhFragments.get(b.id) || b.fragment,
        /** 中文片段（遊戲自撰）。 */
        fragmentZh: zhFragments.get(b.id) || '',
        /** 英文原句（次要參考，不是官方引文）。 */
        fragmentEn: b.fragment,
      },
    ])
  );
  const byChallengeId = new Map(challenges.map((c) => [c.id, c]));
  /**
   * 漂浮提示球的白話教學（coach.json）——遊戲自撰，假設玩家零背景知識。
   * 每條 rubric 檢查一份：這是什麼、怎麼做、以及可以直接填進輸入框的中文句子。
   */
  const coach = new Map(((coachFile && coachFile.entries) || []).map((e) => [e.check, e]));

  /**
   * 官方範例的中文譯寫（curriculum-zh.json，遊戲自撰）。
   * key = 技巧 id，值可含 example / tip / note 三個欄位（只譯有需要的那些）。
   */
  const zhTech = new Map(Object.entries((curriculumZh && curriculumZh.techniques) || {}));

  /**
   * 時代註記（dated-notes.json，遊戲自撰）。
   * key = 技巧 id → 一段有日期的查核備註 ＋ 新的官方連結。
   */
  const datedByTech = new Map(((datedFile && datedFile.notes) || []).map((n) => [n.techniqueId, n]));
  /** 出處狀態註記：網址 → 已下架 / 已標示即將移除 ＋ 後繼參考。 */
  const datedBySource = new Map(((datedFile && datedFile.sourceNotes) || []).map((s) => [s.url, s]));

  /**
   * 顯示用的一條技巧：中文在前，被中文取代掉的官方原文另外收在 `origin`
   * （UI 一律把 origin 放進可展開的「原文 ↗」並附出處連結）。
   */
  function displayTechnique(idOrTech) {
    const tech = typeof idOrTech === 'string' ? techniques.get(idOrTech) : idOrTech;
    if (!tech) return null;
    const zh = zhTech.get(tech.id) || {};
    const origin = {};
    if (zh.tip && zh.tip !== tech.tip) origin.tip = tech.tip;
    if (zh.example && zh.example !== tech.example) origin.example = tech.example;
    if (zh.note && zh.note !== tech.note) origin.note = tech.note;
    return {
      id: tech.id,
      title: tech.title,
      tip: zh.tip || tech.tip || '',
      example: zh.example || tech.example || '',
      note: zh.note || tech.note || '',
      /** 有沒有任何一段是譯寫過的（決定要不要出現「原文 ↗」）。 */
      translated: Object.keys(origin).length > 0,
      origin,
      vendors: tech.vendors || [],
      sources: tech.sources || [],
      /** 時代註記：官方建議在新一代模型上變了（沒有就是 null）。 */
      dated: datedByTech.get(tech.id) || null,
    };
  }

  /** 官方文件網址 → 文件名（結果面板不要秀一長串網址給玩家看）。 */
  const sourceNameByUrl = new Map();
  for (const t of curriculum.techniques || []) {
    for (const s of t.sources || []) if (s && s.url && !sourceNameByUrl.has(s.url)) sourceNameByUrl.set(s.url, s.name);
  }
  for (const list of Object.values(curriculum.sources || {})) {
    for (const s of list || []) if (s && s.url && !sourceNameByUrl.has(s.url)) sourceNameByUrl.set(s.url, s.name);
  }

  return {
    curriculum,
    /** 課程 v2 的 runtime catalog（區域／技巧／技能的唯一列舉來源）。 */
    catalog,
    challenges,
    technique: (id) => techniques.get(id) || null,
    /** 這條技巧的中文譯寫（沒有就是 null）。 */
    techniqueZh: (id) => zhTech.get(id) || null,
    /** 顯示用的一條技巧：中文在前、官方原文收在 origin。 */
    displayTechnique,
    curriculumZh: curriculumZh || null,
    /** 這條技巧的時代註記（沒有就是 null）。 */
    datedNote: (id) => datedByTech.get(id) || null,
    /** 這個官方網址的狀態註記：已下架 / 已標示即將移除（沒有就是 null）。 */
    sourceNote: (url) => datedBySource.get(url) || null,
    datedFile: datedFile || null,
    /** 官方文件網址 → 文件名（找不到就回傳網址本身）。 */
    sourceName: (url) => sourceNameByUrl.get(url) || url,
    topic: (id) => topics.get(id) || null,
    group: (id) => groups.get(id) || null,
    vendor: (id) => vendors.get(id) || null,
    builderBlock: (id) => builder.get(id) || null,
    challenge: (id) => byChallengeId.get(id) || null,
    /**
     * 圖鑑／結果卡列舉的區域。
     *
     * **一律只列 catalog 裡 `implemented: true` 的區域** —— 課程 v2 的另外七區
     * 此刻只存在於資料層（世界還沒蓋），玩家看到的仍然是既有五區。
     * 回傳的是 `curriculum.groups` 的原物件，欄位與以前一模一樣。
     */
    groupsOrdered: () => catalog.implementedRegions().map((r) => r.legacyGroup).filter(Boolean),
    /** 同一份列舉，但帶著 v2 的區域欄位（主題句、地標、軟門檻規格）。 */
    regionsOrdered: () => catalog.implementedRegions(),
    /** v2 技能（130 條）：目前只有資料層在用，畫面尚未列舉。 */
    skill: (id) => catalog.skill(id),
    regionSkills: (regionId) => catalog.regionSkills(regionId),
    topicsOf: (groupId) => (curriculum.topics || []).filter((t) => t.groupId === groupId),
    techniquesOf: (topicId) => (curriculum.techniques || []).filter((t) => t.topicId === topicId),
    challengesOf: (regionId) => challenges.filter((c) => c.region === regionId),
    /** 這條檢查的白話教學（漂浮提示球用）。 */
    coach: (check) => coach.get(check) || null,
    coachMeta: coachFile || null,
    /**
     * 這一關的石碑刻印流程（flows.json，遊戲自撰）。
     * 沒有流程的關卡會自動退回自由書寫模式。
     */
    flow: (challengeId) => (flowFile && flowFile.flows && flowFile.flows[challengeId]) || null,
    flowFile: flowFile || null,
    /** 這條檢查對應技巧的第一個官方出處（UI 用來給「可點的來源」）。 */
    sourceFor(techniqueId) {
      const t = techniques.get(techniqueId);
      if (!t || !t.sources || !t.sources.length) return null;
      return t.sources[0];
    },
  };
}

export default createContent;

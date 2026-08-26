/**
 * Promptasy — 存檔（localStorage）
 *
 * key: promptasy.v1.save（schema 見 CLAUDE.md）
 * 護欄 4：進度可存、可重置；載入必須容錯（壞掉的存檔不能讓遊戲開不起來）。
 */

export const SAVE_KEY = 'promptasy.v1.save';

/**
 * Phase 29：遊戲改名（PromptArcade → Promptasy），存檔的 key 命名空間跟著改。
 *
 * 已經玩到一半的人不該因為改名就從頭來過，所以讀檔時多看一眼舊 key：
 *   · 新 key 有東西 → 直接用新的（新的永遠優先，兩個都在也一樣）
 *   · 新 key 沒有、舊 key 有 → 搬過來（寫進新 key），**舊 key 原封不動留著**
 *
 * 刻意不刪舊 key：萬一玩家在同一個瀏覽器上開著舊版分頁（或想退版），
 * 舊存檔還在原地。它只有幾 KB，留著的代價遠低於刪錯的代價。
 * 重置（reset）時兩個 key 都清掉 —— 「重新學習」就該是真的乾淨。
 */
export const LEGACY_SAVE_KEYS = Object.freeze(['promptarcade.v1.save']);
export const SAVE_VERSION = 1;

/**
 * v1.2 · P16c：守夜人聊得出來的四種情報 id。
 * 存檔的 `watchmen[*].seen` 只認得這四個 —— 資料層的真相住在
 * `src/progression/watchtalk.js` 的 `WATCH_TOPICS`，這裡逐字相同（`test:rubric` 比對）。
 */
export const WATCH_TOPICS = Object.freeze(['stuck', 'way', 'lore', 'skill']);

/** 全新存檔。 */
export function defaultSave() {
  return {
    version: SAVE_VERSION,
    xp: 0,
    level: 1,
    unlockedRegions: ['foundations'],
    collected: [],
    bestGrades: {},
    // Phase 5：已閱讀的世界觀石碑 id（風味內容，與圖鑑的技巧收集分開）
    loreRead: [],
    // Phase 7：序章引導課程已完成的練習 id（不佔關卡評價，不影響區域解鎖）
    prologueSteps: [],
    // Phase 12：已經看過「神諭刻文」（第二幕指引）的關卡 id —— 重玩時第二幕可以跳過
    guidanceSeen: [],
    // Phase 22：已讀過的刻文小語 id（教真的技巧，但不佔關卡評價、不算區域解鎖的通關數）
    inscriptionsFound: [],
    // Phase 22：已找到的祕密地點 id（純風味的地圖彩蛋）
    secretsFound: [],
    // Phase 25：已經動過的器物 id（陶罐 / 火盆 / 響石…；純風味，不進圖鑑、不算徽章）
    handlesUsed: [],
    // v1.2 · P07：撿到的抄寫人殘頁 id（一半教一件小事、一半純風味；不佔關卡評價）
    lettersFound: [],
    // Phase 29：玩家選擇「先行前往」而提前開啟的閘門（區域 id）。
    // 純記帳用 —— 它只說明「這道門是被問開的，不是被考過的」，
    // 不影響 XP、圖鑑、徽章，也不會把任何一關算成已通關。
    skippedGates: [],
    /**
     * 課程 v2（Phase B）：已經收集到的 **v2 技能** id（`skill-codex-v2.json`）。
     *
     * 為什麼要另開一欄而不是塞進 `collected`：`collected` 存的是舊 68 條技巧的 id，
     * 圖鑑、廠家徽章、稱號、隱藏成就全部依它算；v2 的 130 條技能有一半以上
     * 在舊 68 條裡**沒有祖先**（`legacyTechniqueId: null`），混進去會讓那些數字失真。
     * 所以純加法多一欄：新神廟通關時同時寫兩邊 ——
     * 有祖先的照舊寫進 `collected`（D2：收集不倒退），技能本身寫進這裡。
     */
    skillsV2: [],
    /**
     * 課程 v2（Phase J2）：已經拿到的**土地印記**（區域 id，12 枚）。
     * 通過一片土地的應用關（試煉）就入袋，冪等、重玩不會重複給。
     * 純加法：它不影響 XP、圖鑑、徽章、解鎖，只是「這片土地你走完了」的憑證。
     */
    seals: [],
    /**
     * 課程 v2（Phase J2）· 大師層印記（P14：可選，永不擋路 —— C9）。
     *
     *   penlessSeals 無筆之印：一座**教學神廟**，沒用快速填入、沒開提示球、
     *                          沒看過範例、刻印時一次都沒被退，而且開關卡以來
     *                          的**第一次呈遞**就拿到 S。
     *   scribeSeals  默寫之印：一座**教學神廟**，用**自由書寫模式**拿到 S
     *                          （同樣要求從沒看過這一關的範例）。
     *   samplesSeen  看過範例的關卡 id —— 這一欄是**防作弊面**：
     *                看過就永久記下來，關掉重開再拿 S 也不算「沒看範例」。
     *
     * 三欄都是純加法，也都**不是任何東西的解鎖條件**。
     */
    penlessSeals: [],
    scribeSeals: [],
    samplesSeen: [],
    /**
     * v1.2 · P10b · 最少技巧達成（`leanSeals`）：用**不多於內建最精簡範例解**的技法數
     * 通過的關卡 id。純加法、冪等、不給 XP、不進 `bestGrades`、不是任何東西的解鎖條件。
     *
     * 刻意**沒有**「最少字」那一枚 —— 短 ≠ 好 prompt（roadmap §0 鐵則明文否決）。
     */
    leanSeals: [],
    /**
     * v1.2 · P02：濁靈（murks.json）的安撫進度 —— **單一物件欄** `{ [murkId]: { hits, grade } }`。
     *
     *   hits   已命中的 rubric 列 index（整數、去重、排序）—— 跨次**累積聯集，永不清零**
     *   grade  安撫後的最佳評價（'S'|'A'|'B'|'C'）；還沒安撫＝ null
     *
     * 為什麼不用 `bestGrades`：那是 142 關的分子（已通關數／稱號／區域解鎖／統計全靠它），
     * 濁靈不是關卡。這一欄純加法：不影響 `refreshUnlocks()`、圖鑑技巧數、徽章、印記；
     * `normalize()` 給 `{}`、逐鍵驗形；`reset()` 自然清空。
     */
    murks: {},
    /**
     * v1.2 · P16c：守夜人（watchmen.json）—— **單一物件欄** `{ [watchmanId]: { met, seen } }`。
     *
     *   met   聊過了沒（走近按 `E` 開過那扇小窗就算）
     *   seen  問過哪幾種情報（'stuck' | 'way' | 'lore' | 'skill'，去重）
     *
     * 純加法，而且**一格都不影響進度**：不給 XP、不寫 `bestGrades`、不進 142 關的分母、
     * 不收技巧、不算徽章、不是任何東西的解鎖條件（`refreshUnlocks()` 從頭到尾沒讀過它）。
     * 它只決定「腳下那一圈光要不要留一點餘溫」與「技巧小知識輪到第幾條」。
     */
    watchmen: {},
    /**
     * v1.2 · P16c：卡在哪一關（`struggles`）—— **單一物件欄**
     * `{ [challengeId]: { tries, hits } }`。
     *
     *   tries  這一關**沒過**的呈遞次數（過了就整筆刪掉 —— 過了就不是卡關）
     *   hits   跨次**累積**命中過的檢查器 id（同濁靈的聯集，永不清零）
     *
     * 守夜人的「卡關提示」讀的就是這一欄：試最多次、還沒過的那一關，
     * 指向它 rubric 裡還沒命中的那一條。同樣純加法、不影響任何既有欄位。
     */
    struggles: {},
    /**
     * v1.2 · P18：守門者（guardian.json）—— **單一物件欄**
     * `{ [guardianId]: { hits, turns, convinced } }`。
     *
     *   hits       交辦上已經對上的那幾行（門閂 id，去重排序）—— 跨次**累積聯集，永不清零**
     *   turns      跟他說過幾句（純記帳）
     *   convinced  說服過了沒（說服過就不會退回去）
     *
     * 純加法，而且**一格都不影響進度**：不給 XP、不寫 `bestGrades`、不進 142 關的分母、
     * 不收技巧、不算徽章、不是任何東西的解鎖條件（`refreshUnlocks()` 從頭到尾沒讀過它）。
     * 它只決定「他胸前那塊板亮了幾行」與「腳下那一圈要不要留餘溫」。
     */
    guardians: {},
    /**
     * v1.2 · P07：玩家在**序章**送出的第一段 prompt（原文，去頭尾空白、≤ 280 字）。
     *
     * 「第一句就是第一句」—— 寫進去之後永不覆寫（`captureFirstPrompt()` 只寫一次）。
     * 只存在這台裝置上，不上傳、不進分享卡；終局（P22）會把它還給玩家。
     * 舊存檔沒有這一欄 → `normalize()` 給空字串，終局改用「你最好的一句」。
     */
    firstPrompt: '',
    badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
    settings: {
      music: 'ambient-01',
      volume: 0.5,
      quality: 'high',
      muted: false,
      preflight: true,
      // Phase 11：答題方式。'guided' = 石碑刻印（預設）、'free' = 自由書寫
      promptMode: 'guided',
      // Phase 17：效能監視器（右上角的即時數字）。預設關閉 —— 它是給想看的人用的診斷面板
      perfMonitor: false,
    },
    flags: { introSeen: false, prologueDone: false },
  };
}

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Safari 私密瀏覽等情況：存取本身就可能丟例外
    const probe = '__promptasy_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
/** v1.2 · P07：`firstPrompt` 的上限（字元）。超過就截斷 —— 它是一句話，不是一篇文章。 */
export const FIRST_PROMPT_MAX = 280;
/**
 * v1.2 · P07：把任意值正規化成可以存的 `firstPrompt`。
 * 純文字：去頭尾空白、把控制字元換成空白（跨行照樣留著換行）、截到 280 字。
 * 顯示的一方永遠要自己跳脫（HTML escape）—— 這裡不動玩家寫的字。
 */
export function firstPrompt(v) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
  return clean.length > FIRST_PROMPT_MAX ? clean.slice(0, FIRST_PROMPT_MAX) : clean;
}
const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null);

/** 版本遷移。目前只有 v1；未來新增版本時在此往上補。 */
function migrate(raw) {
  const data = { ...raw };
  if (!Number.isFinite(data.version) || data.version < 1) data.version = SAVE_VERSION;
  // (未來) if (data.version === 1) { …轉成 v2…; data.version = 2; }
  return data;
}

/** 把任意物件正規化成合法存檔（缺欄位補預設值）。 */
export function normalize(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const d = migrate(raw);

  const badges = { ...base.badges };
  if (d.badges && typeof d.badges === 'object') {
    for (const k of Object.keys(badges)) badges[k] = Math.max(0, num(d.badges[k], 0));
  }

  const bestGrades = {};
  if (d.bestGrades && typeof d.bestGrades === 'object') {
    for (const [k, v] of Object.entries(d.bestGrades)) {
      if (typeof v === 'string' && ['S', 'A', 'B', 'C'].includes(v)) bestGrades[k] = v;
    }
  }

  /*
   * v1.2 · P02：濁靈進度。逐鍵驗形：`hits` 必須是陣列（不是就整筆丟）、裡面只留
   * 非負整數並去重排序；`grade` 只認 S/A/B/C，其餘（含 undefined）一律 null；
   * 存了 grade ＝ 安撫過，而安撫一定至少命中一列 —— 沒有 hits 的 grade 是壞值，落成 null。
   */
  const murks = {};
  if (d.murks && typeof d.murks === 'object' && !Array.isArray(d.murks)) {
    for (const [k, v] of Object.entries(d.murks)) {
      if (typeof k !== 'string' || !k || k.length > 64) continue;
      if (!v || typeof v !== 'object' || !Array.isArray(v.hits)) continue;
      const hits = [...new Set(v.hits.filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
      const grade = hits.length && typeof v.grade === 'string' && ['S', 'A', 'B', 'C'].includes(v.grade) ? v.grade : null;
      murks[k] = { hits, grade };
    }
  }

  /*
   * v1.2 · P16c：守夜人。逐鍵驗形 —— `met` 一律落成布林；`seen` 只留認得的四種情報 id、
   * 去重排序。整筆都不合形就丟掉（壞值不該讓遊戲開不起來，也不該被當成真的）。
   */
  const watchmen = {};
  if (d.watchmen && typeof d.watchmen === 'object' && !Array.isArray(d.watchmen)) {
    for (const [k, v] of Object.entries(d.watchmen)) {
      if (typeof k !== 'string' || !k || k.length > 64) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const seen = [...new Set((Array.isArray(v.seen) ? v.seen : []).filter((x) => WATCH_TOPICS.includes(x)))].sort();
      watchmen[k] = { met: Boolean(v.met) || seen.length > 0, seen };
    }
  }

  /*
   * v1.2 · P16c：卡在哪一關。`tries` 是非負整數（不是就整筆丟）、`hits` 只留字串並去重排序。
   * 沒有 `hits` 的 `tries` 是合法的（第一次就全掛）—— 那正是守夜人最該講的一種。
   */
  const struggles = {};
  if (d.struggles && typeof d.struggles === 'object' && !Array.isArray(d.struggles)) {
    for (const [k, v] of Object.entries(d.struggles)) {
      if (typeof k !== 'string' || !k || k.length > 64) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const tries = Number.isFinite(v.tries) ? Math.max(0, Math.round(v.tries)) : 0;
      if (tries <= 0) continue;
      const hits = [...new Set((Array.isArray(v.hits) ? v.hits : []).filter((x) => typeof x === 'string' && x))].sort();
      struggles[k] = { tries, hits };
    }
  }

  /*
   * v1.2 · P18：守門者。逐鍵驗形 —— `hits` 必須是陣列（不是就整筆丟）、裡面只留字串並去重排序；
   * `turns` 落成非負整數；`convinced` 落成布林。
   * **只往累積的方向落**：對上過的那幾行是聯集，這裡沒有任何一條路把它變短。
   */
  const guardians = {};
  if (d.guardians && typeof d.guardians === 'object' && !Array.isArray(d.guardians)) {
    for (const [k, v] of Object.entries(d.guardians)) {
      if (typeof k !== 'string' || !k || k.length > 64) continue;
      if (!v || typeof v !== 'object' || !Array.isArray(v.hits)) continue;
      const hits = [...new Set(v.hits.filter((x) => typeof x === 'string' && x && x.length <= 64))].sort();
      const turns = Number.isFinite(v.turns) ? Math.max(0, Math.round(v.turns)) : 0;
      guardians[k] = { hits, turns, convinced: Boolean(v.convinced) };
    }
  }

  const settings = { ...base.settings };
  if (d.settings && typeof d.settings === 'object') {
    if (typeof d.settings.music === 'string') settings.music = d.settings.music;
    if (Number.isFinite(d.settings.volume)) settings.volume = Math.min(1, Math.max(0, d.settings.volume));
    if (d.settings.quality === 'high' || d.settings.quality === 'low') settings.quality = d.settings.quality;
    settings.muted = Boolean(d.settings.muted);
    // Phase 7：主控台的「即時預檢」。舊存檔沒有這個欄位 → 用預設值（開）。
    if (typeof d.settings.preflight === 'boolean') settings.preflight = d.settings.preflight;
    // Phase 11：答題方式。只認得 'free'，其餘（含舊存檔的 undefined）一律回到石碑刻印。
    settings.promptMode = d.settings.promptMode === 'free' ? 'free' : 'guided';
    // Phase 17：效能監視器。舊存檔沒有這個欄位 → 預設關閉。
    settings.perfMonitor = d.settings.perfMonitor === true;
  }

  // flags 一律存布林值；未知的旗標也保留（例如 finaleSeen、各區精通提示）
  const flags = { ...base.flags };
  if (d.flags && typeof d.flags === 'object') {
    for (const [k, v] of Object.entries(d.flags)) {
      if (typeof k === 'string' && k.length <= 64) flags[k] = Boolean(v);
    }
  }

  /**
   * Phase 7 的向下相容：序章（引導課程）是新東西，舊存檔裡不會有 prologueDone。
   * 已經有進度的老玩家不該被塞回教學 —— 只要存檔看得出「玩過了」，就當成已完成。
   * 只在「這個旗標根本不存在」時推論；設定頁按下「重看引導課程」寫入的 false 會被尊重。
   */
  const declaredPrologue =
    d.flags && typeof d.flags === 'object' && Object.prototype.hasOwnProperty.call(d.flags, 'prologueDone');
  if (!declaredPrologue) {
    const veteran =
      num(d.xp, 0) > 0 ||
      (strArr(d.collected) || []).length > 0 ||
      Object.keys(bestGrades).length > 0 ||
      (strArr(d.loreRead) || []).length > 0 ||
      Boolean(d.flags && d.flags.introSeen);
    flags.prologueDone = veteran;
  }

  const unlocked = strArr(d.unlockedRegions);
  return {
    version: SAVE_VERSION,
    xp: Math.max(0, Math.round(num(d.xp, 0))),
    level: Math.max(1, Math.round(num(d.level, 1))),
    unlockedRegions: unlocked && unlocked.length ? [...new Set(['foundations', ...unlocked])] : base.unlockedRegions,
    collected: [...new Set(strArr(d.collected) || [])],
    // 舊存檔沒有 loreRead → 補成空陣列（新增欄位一律在這裡給預設值）
    loreRead: [...new Set(strArr(d.loreRead) || [])],
    prologueSteps: [...new Set(strArr(d.prologueSteps) || [])],
    // Phase 12：舊存檔沒有 guidanceSeen → 空陣列（第一次開關卡照樣會走完四幕）
    guidanceSeen: [...new Set(strArr(d.guidanceSeen) || [])],
    // Phase 22：舊存檔沒有這兩個 → 空陣列（純加法，不影響任何既有欄位）
    inscriptionsFound: [...new Set(strArr(d.inscriptionsFound) || [])],
    secretsFound: [...new Set(strArr(d.secretsFound) || [])],
    // Phase 25：舊存檔沒有 handlesUsed → 空陣列（純加法，不影響任何既有欄位）
    handlesUsed: [...new Set(strArr(d.handlesUsed) || [])],
    // v1.2 · P07：舊存檔沒有 lettersFound → 空陣列（純加法）
    lettersFound: [...new Set(strArr(d.lettersFound) || [])],
    // Phase 29：舊存檔沒有 skippedGates → 空陣列（純加法）
    skippedGates: [...new Set(strArr(d.skippedGates) || [])],
    // 課程 v2 Phase B：舊存檔沒有 skillsV2 → 空陣列（純加法，不影響任何既有欄位）
    skillsV2: [...new Set(strArr(d.skillsV2) || [])],
    // 課程 v2 Phase J2：土地印記與大師層印記 → 舊存檔一律補空陣列（純加法）
    seals: [...new Set(strArr(d.seals) || [])],
    penlessSeals: [...new Set(strArr(d.penlessSeals) || [])],
    scribeSeals: [...new Set(strArr(d.scribeSeals) || [])],
    samplesSeen: [...new Set(strArr(d.samplesSeen) || [])],
    // v1.2 · P10b：舊存檔沒有 leanSeals → 空陣列（純加法，不影響任何既有欄位）
    leanSeals: [...new Set(strArr(d.leanSeals) || [])],
    // v1.2 · P02：舊存檔沒有 murks → 空物件（純加法，不影響任何既有欄位）
    murks,
    watchmen,
    struggles,
    // v1.2 · P18：舊存檔沒有 guardians → 空物件（純加法，不影響任何既有欄位）
    guardians,
    // v1.2 · P07：舊存檔沒有 firstPrompt → 空字串（純加法）。壞值一律落成空字串。
    firstPrompt: firstPrompt(d.firstPrompt),
    bestGrades,
    badges,
    settings,
    flags,
  };
}

/**
 * 讀檔。壞掉 / 不存在 → 回傳全新存檔。
 * 新 key 沒有東西時，會把改名前的舊 key 搬過來（見 LEGACY_SAVE_KEYS）。
 */
export function load() {
  const ls = storage();
  if (!ls) return defaultSave();
  try {
    let raw = ls.getItem(SAVE_KEY);
    let migratedFrom = null;
    if (!raw) {
      for (const legacy of LEGACY_SAVE_KEYS) {
        const old = ls.getItem(legacy);
        if (old) {
          raw = old;
          migratedFrom = legacy;
          break;
        }
      }
    }
    if (!raw) return defaultSave();
    const data = normalize(JSON.parse(raw));
    if (migratedFrom) {
      // 搬家：立刻寫進新 key（之後就走新的那條路），舊的留在原地
      try {
        ls.setItem(SAVE_KEY, JSON.stringify(data));
      } catch {
        /* 寫不進去（配額 / 私密瀏覽）也不影響這一次的遊玩 */
      }
    }
    return data;
  } catch (err) {
    console.warn('[Promptasy] 存檔毀損，改用新存檔：', err);
    return defaultSave();
  }
}

/** 寫檔。回傳是否成功（無 localStorage 時不會爆，只是不持久化）。 */
export function save(data) {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(normalize(data)));
    return true;
  } catch (err) {
    console.warn('[Promptasy] 存檔失敗：', err);
    return false;
  }
}

/** 一鍵重置（設定頁的「重置進度、重新學習」）。 */
export function reset() {
  const ls = storage();
  if (ls) {
    try {
      ls.removeItem(SAVE_KEY);
      // 改名前的舊存檔一起清掉，不然「重置」之後重整又會被搬回來
      for (const legacy of LEGACY_SAVE_KEYS) ls.removeItem(legacy);
    } catch (err) {
      console.warn('[Promptasy] 清除存檔失敗：', err);
    }
  }
  return defaultSave();
}

export default {
  SAVE_KEY,
  LEGACY_SAVE_KEYS,
  SAVE_VERSION,
  FIRST_PROMPT_MAX,
  firstPrompt,
  defaultSave,
  normalize,
  load,
  save,
  reset,
};

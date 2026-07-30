/**
 * PromptArcade — 存檔（localStorage）
 *
 * key: promptarcade.v1.save（schema 見 CLAUDE.md）
 * 護欄 4：進度可存、可重置；載入必須容錯（壞掉的存檔不能讓遊戲開不起來）。
 */

export const SAVE_KEY = 'promptarcade.v1.save';
export const SAVE_VERSION = 1;

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
    const probe = '__promptarcade_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
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
    bestGrades,
    badges,
    settings,
    flags,
  };
}

/** 讀檔。壞掉 / 不存在 → 回傳全新存檔。 */
export function load() {
  const ls = storage();
  if (!ls) return defaultSave();
  try {
    const raw = ls.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn('[PromptArcade] 存檔毀損，改用新存檔：', err);
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
    console.warn('[PromptArcade] 存檔失敗：', err);
    return false;
  }
}

/** 一鍵重置（設定頁的「重置進度、重新學習」）。 */
export function reset() {
  const ls = storage();
  if (ls) {
    try {
      ls.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn('[PromptArcade] 清除存檔失敗：', err);
    }
  }
  return defaultSave();
}

export default { SAVE_KEY, SAVE_VERSION, defaultSave, normalize, load, save, reset };

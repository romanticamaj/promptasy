/**
 * Promptasy — runtime catalog（課程 v2 的合併層）
 *
 * 這是「舊 68 條技巧」與「新 130 條技能」之間唯一的橋。
 *
 * 為什麼需要它（findings.md · Phase B）：
 *   runtime 原本把 `curriculum.json` 直接傳進 content / progression / codex /
 *   ranks / settings / sharecard / e2e，區域與技巧的數量因此散在十幾個地方寫死
 *   （68 條技巧、5 個區域）。課程 v2 要長到 130 技能 / 12 區，而
 *   `curriculum.json` 必須 **byte-identical**（sha256 釘死，測試守著）——
 *   所以合併只能發生在一個新的邊界上，就是這個檔案。
 *
 * 三個資料來源，各自的身分寫死不混：
 *   1. `curriculum.json`        —— 舊 68 條技巧。**一手官方引文**，一個字都不改。
 *   2. `skill-codex-v2.json`    —— 130 條技能。`authored: "game"`；敘述是遊戲自撰，
 *                                  但每一條的 `sources` 是從 master list 逐條解析出來的真實官方連結。
 *   3. `regions-v2.json`        —— 12 區。既有五區沿用 curriculum 的 groups，新增七區 `implemented: false`。
 *
 * **這一層不決定玩家看到什麼**：`implemented: false` 的七區只是資料，
 * UI 一律走 `implementedRegions()`，所以在世界／關卡跟上來之前，
 * 玩家看到的仍然是 5 區與 68 條技巧 —— 行為完全不變（護欄 7 不倒退）。
 *
 * 驗證一律 fail fast：資料不合契約就在建構時丟例外，不做「安靜降級」——
 * 課程資料錯了要當場看得見，不是等玩家玩到那一關才發現。
 */

/** 合法的 tier。 */
export const TIERS = Object.freeze(['basic', 'advanced', 'master']);

function fail(msg) {
  throw new Error(`[catalog] ${msg}`);
}

/**
 * 依 `prereqs` 做拓撲檢查（同時抓出先修指到不存在的技能、以及環）。
 * @returns {string[]} 一條環的 id 序列（沒有環就回空陣列）
 */
function findCycle(skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const state = new Map(); // 0 未走 / 1 走訪中 / 2 完成
  const stack = [];
  let cycle = [];

  const visit = (id) => {
    if (cycle.length) return;
    const st = state.get(id) || 0;
    if (st === 2) return;
    if (st === 1) {
      const at = stack.indexOf(id);
      cycle = stack.slice(at).concat(id);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const p of byId.get(id).prereqs || []) {
      if (!byId.has(p)) continue; // 先修不存在另外報，不在這裡誤判成環
      visit(p);
      if (cycle.length) return;
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const s of skills) visit(s.id);
  return cycle;
}

/**
 * 建一份 runtime catalog。
 *
 * @param {object} opts
 * @param {object} opts.curriculum   curriculum.json（舊 68 條，官方引文）
 * @param {object} [opts.skillCodex] skill-codex-v2.json（130 條技能，authored: game）
 * @param {object} [opts.regions]    regions-v2.json（12 區）
 * @param {boolean} [opts.validate]  是否在建構時驗證（預設 true）
 */
export function createCatalog({ curriculum, skillCodex = null, regions = null, validate = true }) {
  if (!curriculum || !Array.isArray(curriculum.techniques)) fail('curriculum.techniques 不存在');

  /* ---------------- 舊 68 條（唯讀，原封不動） ---------------- */
  const techniques = curriculum.techniques.slice();
  const techniqueById = new Map(techniques.map((t) => [t.id, t]));
  const groups = (curriculum.groups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  /* ---------------- v2 技能 ---------------- */
  const skills = ((skillCodex && skillCodex.skills) || []).slice();
  const skillById = new Map(skills.map((s) => [s.id, s]));

  /* ---------------- v2 區域（舊五區合併 curriculum 的 group 欄位） ----------------
   *
   * 沒有給 regions-v2 時（legacy 模式，例如只丟 curriculum 的舊測試呼叫端）
   * 就用 curriculum.groups 就地合成一份「全部已上線」的區域表 ——
   * 這樣 `implementedRegions()` 在兩種模式下的列舉結果完全一樣。
   */
  const rawRegions = (
    (regions && regions.regions) ||
    groups.map((g, i) => ({
      id: g.id,
      nameZh: g.name,
      nameEn: g.nameEn,
      order: g.order || i + 1,
      implemented: true,
      skillIds: [],
      gate: { hard: false, text: '' },
      synthesizedFromCurriculum: true,
    }))
  )
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const regionList = rawRegions.map((r) => {
    const g = groupById.get(r.id) || null;
    /*
     * 課程 v2 · Phase E：量器坊起，新上線的區域在 `curriculum.json` 裡**沒有**
     * 對應的 group（那一檔必須 byte-identical，護欄 2）。所以替它就地合成一個
     * 形狀完全一樣的 group 物件 —— 圖鑑／結果卡／世界的 `colorOf()` 因此完全
     * 不必知道「這一區有沒有舊技巧」，只是 `topicIds` 是空的（它教的是 v2 技能）。
     */
    const synthesized = g || {
      id: r.id,
      legacyId: null,
      order: r.order || 0,
      name: r.nameZh,
      nameEn: r.nameEn,
      color: r.color || '#8aa0b4',
      topicIds: [],
      skillOnly: true,
    };
    return {
      ...r,
      /* 既有五區的顯示欄位一律以 curriculum.json 為準（名稱、顏色、topicIds 都不重寫） */
      name: synthesized.name,
      nameEn: synthesized.nameEn,
      color: synthesized.color,
      topicIds: synthesized.topicIds,
      /** 這一區只教 v2 技能（舊 68 條裡沒有它的主題）。 */
      skillOnly: !g,
      /** 資料層有沒有**自己宣告**主色（合成時的預設灰藍不算）。 */
      colorDeclared: Boolean(r.color),
      legacyGroup: synthesized,
    };
  });
  const regionById = new Map(regionList.map((r) => [r.id, r]));
  const implemented = regionList.filter((r) => r.implemented);

  /* ---------------- 反查索引 ---------------- */
  /** 舊技巧 id → 由它演化出來的 v2 技能（可能不只一條）。 */
  const skillsByLegacy = new Map();
  for (const s of skills) {
    if (!s.legacyTechniqueId) continue;
    if (!skillsByLegacy.has(s.legacyTechniqueId)) skillsByLegacy.set(s.legacyTechniqueId, []);
    skillsByLegacy.get(s.legacyTechniqueId).push(s);
  }

  const counts = {
    techniques: techniques.length,
    legacyGroups: groups.length,
    skills: skills.length,
    regions: regionList.length,
    implementedRegions: implemented.length,
    upcomingRegions: regionList.length - implemented.length,
    skillsWithoutSource: skills.filter((s) => !(s.sources || []).length).length,
    skillsMappedToLegacy: skills.filter((s) => s.legacyTechniqueId).length,
  };

  const api = {
    /* --- 舊 68 條（官方引文層） --- */
    curriculum,
    techniques,
    technique: (id) => techniqueById.get(id) || null,
    /** 既有五區的 group 物件（＝ curriculum.groups，依 order）。 */
    legacyGroups: () => groups.slice(),

    /* --- v2 技能層 --- */
    skillCodex,
    skills,
    skill: (id) => skillById.get(id) || null,
    skillsOfTier: (tier) => skills.filter((s) => s.tier === tier),
    /** 這一區的技能（依 skillIds 的順序，不是 skills 陣列的順序）。 */
    regionSkills(regionId) {
      const r = regionById.get(regionId);
      if (!r) return [];
      return (r.skillIds || []).map((id) => skillById.get(id)).filter(Boolean);
    },
    /** 這條技能的官方出處（來自 master list，逐條可回查 masterRef）。 */
    sourcesForSkill(id) {
      const s = skillById.get(id);
      return s ? (s.sources || []).slice() : [];
    },
    /** 這條技能沒有可驗證出處時的誠實說明（有出處就是 null）。 */
    sourceNoteForSkill(id) {
      const s = skillById.get(id);
      return s && !(s.sources || []).length ? s.sourceNote || '' : null;
    },

    /* --- 新舊對照（D2 的相容橋） --- */
    /** v2 技能 → 它演化自的舊技巧物件（沒有就是 null）。 */
    techniqueForSkill(skillId) {
      const s = skillById.get(skillId);
      return s && s.legacyTechniqueId ? techniqueById.get(s.legacyTechniqueId) || null : null;
    },
    /** 舊技巧 id → 由它演化出來的 v2 技能陣列。 */
    skillsForTechnique: (techniqueId) => (skillsByLegacy.get(techniqueId) || []).slice(),

    /* --- 區域 --- */
    regions: regionList,
    region: (id) => regionById.get(id) || null,
    /** 已經在世界裡蓋好的區域（UI 只准列舉這個）。 */
    implementedRegions: () => implemented.slice(),
    /** 已經在世界裡蓋好的區域 id。 */
    implementedRegionIds: () => implemented.map((r) => r.id),
    /** 只存在於資料層、世界還沒蓋的區域。 */
    upcomingRegions: () => regionList.filter((r) => !r.implemented),
    isRegionImplemented: (id) => Boolean(regionById.get(id) && regionById.get(id).implemented),

    /* --- 數字（所有「x / y」都從這裡拿，不要再寫死） --- */
    counts,

    /** 逐條驗證資料契約；不合就丟例外（測試與開發期的 fail fast）。 */
    validate: validateImpl,
  };

  if (validate) api.validate();
  return api;

  /* ------------------------------------------------------------------ *
   * 驗證（fail fast）
   * ------------------------------------------------------------------ */
  function validateImpl() {
    /* 舊 68 條：只確認索引沒壞，內容一個字都不碰 */
    if (techniques.length !== techniqueById.size) fail('curriculum.techniques 有重複 id');
    if (!groups.length) fail('curriculum.groups 是空的');

    /* legacy 模式（只給 curriculum）：區域表是就地合成的，沒有 v2 技能可驗 */
    if (!skills.length && regionList.every((r) => r.synthesizedFromCurriculum)) return api;

    /* --- 技能 --- */
    if (skills.length !== skillById.size) fail('skill-codex-v2 有重複的 skill id');
    for (const s of skills) {
      if (!s.id || typeof s.id !== 'string') fail(`技能缺少 id：${JSON.stringify(s).slice(0, 80)}`);
      if (!s.nameZh) fail(`技能 ${s.id} 缺少 nameZh`);
      if (!s.nameEn) fail(`技能 ${s.id} 缺少 nameEn`);
      if (!s.oneLiner) fail(`技能 ${s.id} 缺少 oneLiner`);
      if (!TIERS.includes(s.tier)) fail(`技能 ${s.id} 的 tier 不合法：${s.tier}`);
      if (!regionById.has(s.regionId)) fail(`技能 ${s.id} 指向不存在的區域 ${s.regionId}`);
      if (!Array.isArray(s.prereqs)) fail(`技能 ${s.id} 的 prereqs 不是陣列`);
      for (const p of s.prereqs) if (!skillById.has(p)) fail(`技能 ${s.id} 的先修 ${p} 不存在`);
      if (!Array.isArray(s.masterRefs) || !s.masterRefs.length) fail(`技能 ${s.id} 沒有 masterRefs`);
      for (const n of s.masterRefs) if (!Number.isInteger(n) || n <= 0) fail(`技能 ${s.id} 的 masterRef 不合法：${n}`);
      if (!Array.isArray(s.sources)) fail(`技能 ${s.id} 的 sources 不是陣列`);
      for (const src of s.sources) {
        if (!src || typeof src.url !== 'string' || !/^https:\/\//.test(src.url)) {
          fail(`技能 ${s.id} 的出處不是 https 連結：${src && src.url}`);
        }
        if (!src.vendor) fail(`技能 ${s.id} 的出處缺少 vendor：${src.url}`);
        if (!Number.isInteger(src.masterRef) || !s.masterRefs.includes(src.masterRef)) {
          fail(`技能 ${s.id} 的出處 masterRef ${src.masterRef} 不在自己的 masterRefs 裡`);
        }
      }
      /* 護欄 2：沒有可驗證出處時要誠實寫明，不准安靜留白 */
      if (!s.sources.length && !s.sourceNote) fail(`技能 ${s.id} 既沒有出處也沒有 sourceNote`);
      if (s.legacyTechniqueId && !techniqueById.has(s.legacyTechniqueId)) {
        fail(`技能 ${s.id} 的 legacyTechniqueId ${s.legacyTechniqueId} 不在 curriculum 裡`);
      }
    }
    const cycle = findCycle(skills);
    if (cycle.length) fail(`技能先修有環：${cycle.join(' → ')}`);

    /* --- 區域 --- */
    if (regionList.length !== regionById.size) fail('regions-v2 有重複的 region id');
    const claimed = new Set();
    for (const r of regionList) {
      if (!r.nameZh || !r.nameEn) fail(`區域 ${r.id} 缺少名稱`);
      if (typeof r.implemented !== 'boolean') fail(`區域 ${r.id} 的 implemented 不是布林`);
      if (!Array.isArray(r.skillIds) || !r.skillIds.length) fail(`區域 ${r.id} 沒有技能`);
      for (const id of r.skillIds) {
        if (!skillById.has(id)) fail(`區域 ${r.id} 列了不存在的技能 ${id}`);
        if (claimed.has(id)) fail(`技能 ${id} 被兩個區域同時認領`);
        claimed.add(id);
        if (skillById.get(id).regionId !== r.id) fail(`技能 ${id} 的 regionId 與所屬區域 ${r.id} 不一致`);
      }
      const gate = r.gate || {};
      for (const id of gate.skills || []) if (!skillById.has(id)) fail(`區域 ${r.id} 的軟門檻指向不存在的技能 ${id}`);
      for (const req of gate.regionSkills || []) {
        if (!regionById.has(req.regionId)) fail(`區域 ${r.id} 的軟門檻指向不存在的區域 ${req.regionId}`);
        const n = (regionById.get(req.regionId).skillIds || []).length;
        if (!(req.count > 0 && req.count <= n)) fail(`區域 ${r.id} 的軟門檻要求 ${req.regionId} ${req.count} 座，但該區只有 ${n} 座`);
      }
      for (const id of gate.masteredRegions || []) if (!regionById.has(id)) fail(`區域 ${r.id} 的軟門檻指向不存在的區域 ${id}`);
    }
    if (claimed.size !== skills.length) fail(`有 ${skills.length - claimed.size} 條技能沒有被任何區域認領`);

    /* ----------------------------------------------------------------
     * 相容性：已實作的區域必須「以舊的五區開頭、順序一樣」，
     * 後面才准接課程 v2 新蓋好的區域（Phase E 的量器坊起）。
     *
     * 這條擋的是「把還沒蓋好的區域偷偷標成已上線」——
     * 舊五區少一個、換順序，或新區插到舊五區中間，都會當場丟例外。
     * ---------------------------------------------------------------- */
    const implIds = implemented.map((r) => r.id);
    const groupIds = groups.map((g) => g.id);
    const head = implIds.slice(0, groupIds.length).join(',');
    if (head !== groupIds.join(',')) {
      fail(`已實作的區域沒有以 curriculum.groups 開頭：${head} ≠ ${groupIds.join(',')}`);
    }
    for (const r of implemented.slice(groupIds.length)) {
      if (groupById.has(r.id)) fail(`區域 ${r.id} 同時出現在 curriculum.groups 與新上線的區域裡`);
      if (!r.colorDeclared) fail(`新上線的區域 ${r.id} 沒有主色（curriculum.json 裡沒有它，色要寫在 regions-v2）`);
    }
    return api;
  }
}

export default createCatalog;

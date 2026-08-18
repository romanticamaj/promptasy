/**
 * Promptasy — 進程系統（XP / 等級 / 圖鑑收集 / 廠家徽章 / 區域解鎖）
 *
 * 這一層不碰 DOM、不 import JSON，資料由外部注入 → 可在 node 測試腳本直接跑。
 */
import { betterGrade, gradeForRatio, xpForGrade } from '../challenges/rubric.js';
import { createCatalog } from '../challenges/catalog.js';
import * as SaveIO from '../save/save.js';

/** 升到下一級所需 XP：100, 160, 220, 280 … */
export function xpToNextLevel(level) {
  return 100 + Math.max(0, level - 1) * 60;
}

/** 累積 XP → 等級 ＋ 該級進度。 */
export function levelFromXp(xp) {
  let level = 1;
  let remaining = Math.max(0, Math.round(xp));
  let need = xpToNextLevel(level);
  while (remaining >= need && level < 99) {
    remaining -= need;
    level += 1;
    need = xpToNextLevel(level);
  }
  return { level, into: remaining, need, ratio: need > 0 ? remaining / need : 0 };
}

/**
 * 區域解鎖條件（soft gating）。
 *
 * 解鎖鏈：foundations → reasoning → grounding → orchestration → config。
 * 每一關都要同時滿足「等級」與「前一區通關數」——等級是軟下限（可靠重刷評價補），
 * 前一區通關數才是真正的順序保證。
 * available=false 代表「這一期還沒鋪內容」，世界裡會顯示屏障與說明。
 */
export const REGION_GATES = Object.freeze({
  foundations: { level: 1, available: true, requires: null },
  reasoning: { level: 3, available: true, requires: { region: 'foundations', cleared: 4 } },
  grounding: { level: 4, available: true, requires: { region: 'reasoning', cleared: 4 } },
  orchestration: { level: 5, available: true, requires: { region: 'grounding', cleared: 4 } },
  config: { level: 7, available: true, requires: { region: 'orchestration', cleared: 4 } },
  /*
   * 課程 v2 · Phase E：量器坊是第一道**知識式**軟門檻（C8「知識即升級」）。
   * 條件寫的是「你已經會了哪幾條」而不是等級數字 —— 規格逐字取自
   * `regions-v2.json` 的 `gate`（軟門檻：foundations 的 clear-specific ＋ config 任一座）。
   *
   * 「會了」的判定走 `knowsSkill()`：技能本身進了 `skillsV2`，
   * 或者它的祖先技巧已經在 `collected` 裡（D2 的相容橋還在，Phase J 才拆）。
   * 等級門檻刻意留在 1 —— 這一區不看等級，看的是你手上有沒有那把尺。
   */
  forms: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      skills: ['clear-specific'],
      regionSkills: [{ regionId: 'config', count: 1 }],
    },
  },
  /*
   * 課程 v2 · Phase F：契約鍛冶場與護欄崗，同樣是知識式軟門檻（C8）。
   * 規格逐字取自 `regions-v2.json` 的 `gate`：
   *   · toolcraft —— 軟門檻：orchestration 三座（含 agent-approval-bounds）
   *   · wards     —— 軟門檻：grounding 三座 ＋ toolcraft 一座
   * 護欄崗是「工具的下一站」：先會宣告一把手，才談得上替它畫界線。
   */
  toolcraft: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      skills: ['agent-approval-bounds'],
      regionSkills: [{ regionId: 'orchestration', count: 3 }],
    },
  },
  wards: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      regionSkills: [
        { regionId: 'grounding', count: 3 },
        { regionId: 'toolcraft', count: 1 },
      ],
    },
  },
  /*
   * 課程 v2 · Phase G：校驗場。規格逐字取自 `regions-v2.json` 的 `gate`：
   *   軟門檻：orchestration 兩座 ＋ **任一區精通**。
   * `masteredAny` 是這一期新開的一種知識式條件 —— 它問的仍然是「你已經會了什麼」
   * （精通＝那一區的技巧／技能全收齊），不是等級數字（C8）。
   * 改 prompt 的 prompt 本來就該排在「你已經完整走過一片土地」之後。
   */
  refinery: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      regionSkills: [{ regionId: 'orchestration', count: 2 }],
      masteredAny: 1,
    },
  },
  /*
   * 課程 v2 · Phase H：減法之庭。規格逐字取自 `regions-v2.json` 的 `gate`：
   *   軟門檻：**任一區精通**。
   * 只有一個條件，而且是最純粹的知識式門檻（C8）—— 學會拿掉之前，
   * 你得先真的把某一片土地整個學完（不然「刪對地方」只會變成亂刪）。
   */
  frugality: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      masteredAny: 1,
    },
  },
  /*
   * 課程 v2 · Phase I：觀象臺。規格逐字取自 `regions-v2.json` 的 `gate`：
   *   軟門檻：**foundations 全區精通**。與其他區互不相依（可最早或最晚玩）。
   * `mastered` 是這一期新開的一種知識式條件 —— 它問的是「你已經把**哪一片**土地學完了」
   * （`masteredAny` 問的是「隨便哪一片」）。精通的定義完全沿用 `regionMastery()`，
   * 所以這一條不會有第二套判準。
   * 為什麼是撰寫基本功：看圖、生圖、寫給人聽的話，判準仍然是「你有沒有把話說清楚」——
   * 多模態不是另一套規矩，是同一套規矩換一種輸入。
   */
  sight: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      mastered: ['foundations'],
    },
  },
  /*
   * 課程 v2 · Phase J1：分歧之廳。規格逐字取自 `regions-v2.json` 的 `gate`：
   *   **硬門檻：四區精通**（等同既有 finale 的位階）。
   *
   * 這是整個世界**唯一一道不能先行前往的門**（curriculum-v2 §5.4：全部是 soft
   * requirement，唯一的 hard requirement 是 divergence）。理由寫在課程設計裡：
   * 這一區的每一關都建立在「你已經知道通則」之上 —— 條件仍是知識式的（C8）：
   * `masteredAny: 2` 用與校驗場、減法之庭完全同一支 `regionMastery()`。
   *
   * 2026-08-03 站長裁決：原本的 `hard: true`（全場唯一不能先行前往的門）取消，
   * 門檻也從 4 片降到 2 片 —— 比照其他區域，玩家自己決定要不要先進去看看。
   */
  divergence: {
    level: 1,
    available: true,
    requires: null,
    knowledge: {
      masteredAny: 2,
    },
  },
});

/**
 * @param {object} opts
 * @param {object} [opts.catalog]   課程 v2 的 runtime catalog（技巧／區域的唯一列舉來源）
 * @param {object} [opts.curriculum] curriculum.json（沒給 catalog 時就地建一份 legacy-only 的）
 * @param {Array}  opts.challenges  challenges.json 的 challenges 陣列
 * @param {object} [opts.io]        存檔 IO（測試時可注入假的）
 * @param {Function} [opts.onChange] 狀態變動回呼
 */
export function createProgression({
  catalog = null,
  curriculum = null,
  challenges,
  io = SaveIO,
  onChange = null,
}) {
  /*
   * 課程 v2 · Phase B：技巧與區域的列舉統一從 catalog 來。
   * 只傳 curriculum 的舊呼叫端（測試腳本）行為完全不變 —— catalog 會就地
   * 用同一份 curriculum 建 legacy-only 版本，列舉結果一模一樣。
   */
  const cat = catalog || createCatalog({ curriculum });
  const cur = cat.curriculum;
  const techniqueById = new Map(cat.techniques.map((t) => [t.id, t]));
  const challengeById = new Map((challenges || []).map((c) => [c.id, c]));
  const vendorIds = (cur.vendors || []).map((v) => v.id);
  /** 目前真的在世界裡的區域 id（catalog 的 implemented；legacy 模式下就是 curriculum.groups）。 */
  const regionIds = cat.implementedRegionIds();

  let state = io.load();

  /* ------------------------------------------------------------------ *
   * 課程 v2 · Phase J3：`skillsV2` 的純加法回填（D2 相容層拆除的一半）
   *
   * Phase A–I 期間玩到一半的存檔裡，有些關卡是在它還沒接上 v2 技能之前
   * 通過的 —— `bestGrades` 有它，`skillsV2` 卻沒有那條技能。
   * 開機時照「已通關 × 這一關的 primarySkillId」補回去：
   *   · 純加法：只加不刪，任何既有欄位一格都不動；
   *   · 冪等：補過就不會再補（`includes` 檢查）；
   *   · 只補「真的通關過」的，不會憑空給沒玩過的技能。
   * 補完之後圖鑑的技能數與知識式軟門檻才跟得上今天的資料，而且不倒退。
   * ------------------------------------------------------------------ */
  {
    if (!Array.isArray(state.skillsV2)) state.skillsV2 = [];
    let added = 0;
    for (const id of Object.keys(state.bestGrades || {})) {
      const c = challengeById.get(id);
      const skillId = c && c.primarySkillId;
      if (typeof skillId === 'string' && skillId && !state.skillsV2.includes(skillId)) {
        state.skillsV2.push(skillId);
        added += 1;
      }
    }
    if (added > 0) io.save(state);
  }

  const emit = () => {
    if (typeof onChange === 'function') onChange(state);
  };

  function persist() {
    io.save(state);
    emit();
  }

  /** 徽章 = 已收集技巧中，標記了該廠的數量（可從 collected 完整重算 → 冪等）。 */
  function recomputeBadges() {
    const badges = {};
    for (const v of vendorIds) badges[v] = 0;
    for (const id of state.collected) {
      const tech = techniqueById.get(id);
      if (!tech) continue;
      for (const v of tech.vendors || []) {
        if (v in badges) badges[v] += 1;
      }
    }
    state.badges = badges;
  }

  /** 某區已通關的關卡數。 */
  function clearedCount(regionId) {
    let n = 0;
    for (const id of Object.keys(state.bestGrades)) {
      const c = challengeById.get(id);
      if (c && c.region === regionId) n += 1;
    }
    return n;
  }

  /**
   * 課程 v2：這一條技能「會了嗎」（知識式軟門檻 C8 用的判定）。
   *
   * 兩條路都算：
   *   1. 技能本身收進了 `skillsV2`（通關該座神廟時寫入，並由上面那段回填補齊）；
   *   2. **收集誠實層**：它的祖先技巧已經在舊的 `collected` 裡。
   *
   * 第 2 條在 Phase J3 拆掉 D2 相容層之後**刻意留著**，但它的身分變了 ——
   * 它不再是「教學語意的退路」（教學一律以 `primarySkillId` 為正典），
   * 而是「舊存檔不倒退」的保證：舊的 68 條技巧可以由**多座**關卡的
   * legacy `teaches` 收集到，光靠「已通關 × primarySkillId」的回填補不齊。
   * 拿掉它會讓 Phase A–I 的老玩家閘門進度後退，違反護欄 7。
   */
  function knowsSkill(skillId) {
    if (state.skillsV2.includes(skillId)) return true;
    const s = cat.skill(skillId);
    return Boolean(s && s.legacyTechniqueId && state.collected.includes(s.legacyTechniqueId));
  }

  /** 這一區已經會了幾條技能（知識式軟門檻用）。 */
  function knownInRegion(regionId) {
    return cat.regionSkills(regionId).filter((s) => knowsSkill(s.id)).length;
  }

  /**
   * 知識式軟門檻還差什麼（滿足時回空陣列）。
   * @returns {Array<{kind:string, skillId?:string, regionId?:string, need?:number, have?:number}>}
   */
  function knowledgeGaps(regionId) {
    const gate = REGION_GATES[regionId];
    const k = gate && gate.knowledge;
    if (!k) return [];
    const gaps = [];
    for (const id of k.skills || []) {
      if (!knowsSkill(id)) gaps.push({ kind: 'skill', skillId: id });
    }
    for (const req of k.regionSkills || []) {
      const have = knownInRegion(req.regionId);
      if (have < req.count) gaps.push({ kind: 'regionSkills', regionId: req.regionId, need: req.count, have });
    }
    /*
     * 課程 v2 · Phase G：「任一區精通」。精通的定義完全沿用 `regionMastery()`
     * （舊五區看 68 條技巧、新區看 v2 技能），所以這一條不會有第二套判準。
     */
    if (k.masteredAny) {
      const have = regionIds.filter((id) => api.regionMastery(id).mastered).length;
      if (have < k.masteredAny) gaps.push({ kind: 'masteredAny', need: k.masteredAny, have });
    }
    /*
     * 課程 v2 · Phase I：「指定的那一片土地精通」。與 `masteredAny` 同一個判準
     * （`regionMastery()`），差別只在指名道姓。
     */
    for (const id of k.mastered || []) {
      if (!api.regionMastery(id).mastered) gaps.push({ kind: 'mastered', regionId: id });
    }
    return gaps;
  }

  /** 這個區域的解鎖條件目前滿足了嗎（等級 ＋ 前一區通關數 ＋ 知識式軟門檻）。 */
  function gateSatisfied(regionId, level) {
    const gate = REGION_GATES[regionId];
    if (!gate) return false;
    if (level < gate.level) return false;
    if (gate.requires && clearedCount(gate.requires.region) < gate.requires.cleared) return false;
    if (knowledgeGaps(regionId).length) return false;
    return true;
  }

  /**
   * 課程 v2 · Phase J2：這一次呈遞夠不夠格拿大師層印記。
   *
   * 判定刻意寫得**嚴而且說得出口**（作弊面在下面逐條標出來）：
   *
   *   無筆之印 penless
   *     · 只算教學神廟（應用關不算 —— 它本來就是「把學過的用出來」）
   *     · 這一次拿到 S
   *     · `attempt === 1`：**開關卡以來的第一次呈遞**（送壞了關掉重開也算重來，
   *       但重來的那一次仍然要一次到位，所以不會變成「按到過為止」）
   *     · 這一次沒有按過任何快速填入、沒有開過提示球
   *     · 刻印時一次都沒有被石碑退回（`rejects === 0`）——
   *       引導式題型的「一次」就是「一次就對」
   *     · **這一關的範例從來沒有被翻開過**（`samplesSeen`，永久記著）——
   *       先看範例再關掉重開一次不算「沒看範例」，這是這一層最主要的作弊面
   *
   *   默寫之印 scribe
   *     · 只算教學神廟
   *     · 用**自由書寫模式**（沒有石碑）拿到 S
   *     · 同樣要求這一關的範例從來沒有被翻開過
   *     · 不要求「第一次呈遞」—— 自由書寫本來就該讓人改到好
   *
   * `context` 沒給（例如舊呼叫端、測試腳本）時一律不發印記：寧可漏發，不可誤發。
   */
  function masterSealFor(challenge, evaluation, context) {
    const none = { penless: false, scribe: false };
    if (!context || typeof context !== 'object') return none;
    if (!challenge || challenge.application === true || !challenge.id) return none;
    if (!evaluation.passed || evaluation.grade !== 'S') return none;
    // 看過範例就永遠不算（本次剛翻開的也算，console 會先寫 samplesSeen 再送出）
    if (state.samplesSeen.includes(challenge.id) || context.sampleShown === true) return none;
    const clean = context.usedQuickFill !== true && context.usedCoach !== true;
    const penless = clean && context.attempt === 1 && (context.rejects || 0) === 0;
    const scribe = context.mode === 'free';
    return { penless, scribe };
  }

  /** 依目前等級與通關數更新已解鎖區域，回傳這次新解鎖的區域 id。 */
  function refreshUnlocks() {
    const { level } = levelFromXp(state.xp);
    const newly = [];
    for (const regionId of Object.keys(REGION_GATES)) {
      if (gateSatisfied(regionId, level) && !state.unlockedRegions.includes(regionId)) {
        state.unlockedRegions.push(regionId);
        newly.push(regionId);
      }
    }
    return newly;
  }

  const api = {
    get state() {
      return state;
    },

    /** 目前等級與該級進度。 */
    levelInfo() {
      return levelFromXp(state.xp);
    },

    isCollected: (techniqueId) => state.collected.includes(techniqueId),
    /** 課程 v2：這條技能收集到了嗎（130 條技能的收集面，與舊 68 條分開記）。 */
    isSkillCollected: (skillId) => state.skillsV2.includes(skillId),
    /** 課程 v2：已收集的技能 id（圖鑑之後要列它，現在先讓存檔與進度接得起來）。 */
    collectedSkills: () => state.skillsV2.slice(),
    bestGrade: (challengeId) => state.bestGrades[challengeId] || null,

    isRegionUnlocked(regionId) {
      return state.unlockedRegions.includes(regionId);
    },

    regionGate(regionId) {
      return REGION_GATES[regionId] || { level: 1, available: false };
    },

    /** 這個區域「可進入」= 已解鎖且已鋪內容。 */
    isRegionPlayable(regionId) {
      const gate = api.regionGate(regionId);
      return gate.available && api.isRegionUnlocked(regionId);
    },

    /** 某區已通關的關卡數。 */
    clearedCount,

    /**
     * 解鎖狀態（給世界的屏障與 HUD 用）。
     * @returns {{unlocked:boolean, level:number, levelOk:boolean, requires:(object|null),
     *            clearedNeeded:number, clearedHave:number, requiresOk:boolean, text:string}}
     */
    gateStatus(regionId) {
      const gate = api.regionGate(regionId);
      const level = levelFromXp(state.xp).level;
      const requires = gate.requires || null;
      const clearedHave = requires ? clearedCount(requires.region) : 0;
      const clearedNeeded = requires ? requires.cleared : 0;
      const levelOk = level >= gate.level;
      const requiresOk = !requires || clearedHave >= clearedNeeded;
      const unlocked = api.isRegionUnlocked(regionId);

      const skipped = api.hasSkippedGate(regionId);

      let text = '已開啟';
      const needs = [];
      const gaps = knowledgeGaps(regionId);
      if (!unlocked) {
        if (!levelOk) needs.push(`Lv.${gate.level}（目前 Lv.${level}）`);
        if (!requiresOk) {
          const prev = cat.legacyGroups().find((g) => g.id === requires.region);
          needs.push(`${prev ? prev.name : requires.region} 通關 ${clearedNeeded} 關（目前 ${clearedHave}）`);
        }
        /*
         * 知識式軟門檻（C8）：條件講的是「你已經會了哪一條」，不是等級數字。
         * 講法一律用玩家看得懂的技能中文名與區域名，不露出 id。
         */
        for (const g of gaps) {
          if (g.kind === 'skill') {
            const s = cat.skill(g.skillId);
            needs.push(`先學會「${s ? s.nameZh : g.skillId}」`);
          } else if (g.kind === 'masteredAny') {
            // need 可能不只 1（分歧之廳是 4）—— 數字一定要講出來，不然讀起來像只要一片
            needs.push(
              g.need > 1
                ? `任 ${g.need} 片土地精通（目前 ${g.have}）`
                : `任何一片土地精通（目前 ${g.have}）`
            );
          } else if (g.kind === 'mastered') {
            const r = cat.region(g.regionId);
            needs.push(`${r ? r.name : g.regionId} 整片精通`);
          } else {
            const r = cat.region(g.regionId);
            needs.push(`${r ? r.name : g.regionId} 學會 ${g.need} 條（目前 ${g.have}）`);
          }
        }
        /*
         * Phase 29：門檻沒到也走得過去 —— 條件照講，但要讓玩家知道他有得選。
         * 課程 v2 · Phase J1 的唯一例外：硬門檻的那一道門沒有「先行前往」這條路，
         * 所以連提都不提（提了卻按不下去比擋住更糟）。
         */
        if (gate.hard) {
          text = needs.length ? `需要 ${needs.join(' ＋ ')}　·　這一道門要走過去才開` : '條件已滿足，通過即可開啟';
        } else {
          text = needs.length ? `需要 ${needs.join(' ＋ ')}　·　也可以先行前往` : '條件已滿足，通過即可開啟';
        }
      } else if (skipped) {
        text = '已開啟 · 你是先行前往的';
      }
      return {
        unlocked,
        skipped,
        /** 這是一道硬門檻嗎（唯一一道不能先行前往的門，見 REGION_GATES.divergence）。 */
        hard: Boolean(gate.hard),
        level: gate.level,
        levelOk,
        requires,
        clearedNeeded,
        clearedHave,
        requiresOk,
        /** 知識式軟門檻還差哪幾條（滿足時是空陣列）。 */
        knowledgeGaps: gaps,
        knowledgeOk: gaps.length === 0,
        needs,
        text,
      };
    },

    /* ---------------------------------------------------------------- *
     * Phase 29：先行前往（詢問式閘門）
     *
     * 已經懂這些東西的人不該被門擋住。走到門前會被問一次；
     * 選「直接前往」就把那一區加進 unlockedRegions，並在 skippedGates 留下記號。
     *
     * **記帳一律誠實**：這裡不寫 bestGrades、不給 XP、不收技巧、不動徽章 ——
     * 門開了不代表你學會了。之後真的把條件補滿時，refreshUnlocks() 也不會
     * 再把它算成「新解鎖」（它已經在 unlockedRegions 裡），所以不會慶祝兩次。
     * ---------------------------------------------------------------- */

    /** 這道門是被「先行前往」開的嗎。 */
    hasSkippedGate(regionId) {
      return Array.isArray(state.skippedGates) && state.skippedGates.includes(regionId);
    },

    /** 先行前往過幾道門（誠實記帳用）。 */
    skippedGateCount() {
      return Array.isArray(state.skippedGates) ? state.skippedGates.length : 0;
    },

    /**
     * 先行前往：把這一區開起來。
     * @param {string} regionId
     * @returns {{opened:boolean, alreadyOpen:boolean, regionId:string}}
     */
    skipGate(regionId) {
      if (!Array.isArray(state.skippedGates)) state.skippedGates = [];
      if (!regionId || !REGION_GATES[regionId]) {
        return { opened: false, alreadyOpen: false, regionId };
      }
      /*
       * 課程 v2 · Phase J1：硬門檻不開。這一層是最後一道保險 ——
       * `gate.js` 那邊根本不會畫出「直接前往」，但任何路徑（外掛、舊存檔、
       * 測試腳本）呼叫進來也一樣擋下：分歧之廳不得被寫進 `skippedGates`。
       */
      if (REGION_GATES[regionId].hard) {
        return { opened: false, alreadyOpen: false, hard: true, regionId };
      }
      if (state.unlockedRegions.includes(regionId)) {
        return { opened: false, alreadyOpen: true, regionId };
      }
      state.unlockedRegions.push(regionId);
      if (!state.skippedGates.includes(regionId)) state.skippedGates.push(regionId);
      persist();
      return { opened: true, alreadyOpen: false, regionId };
    },

    /**
     * 隱藏成就：68 條技巧全收集 ＋ 四廠徽章都達標。
     * @param {number} [badgeTarget] 每廠需要的技巧標記數（與圖鑑顯示一致）
     */
    hiddenAchievement(badgeTarget = 5) {
      const all = cat.techniques;
      const collected = all.filter((t) => state.collected.includes(t.id)).length;
      const vendors = (cur.vendors || []).map((v) => ({
        id: v.id,
        name: v.name,
        count: state.badges[v.id] || 0,
        done: (state.badges[v.id] || 0) >= badgeTarget,
      }));
      const complete = collected === all.length && all.length > 0 && vendors.every((v) => v.done);
      return { complete, collected, total: all.length, vendors, badgeTarget };
    },

    /** 已精通（該區技巧全收集）的區域 id 清單。 */
    masteredRegions() {
      return regionIds.filter((id) => api.regionMastery(id).mastered);
    },

    /**
     * 區域完成度（已收集 / 該區技巧總數）。
     *
     * 課程 v2 · Phase E：量器坊起的新區域在舊 68 條裡**沒有**技巧，
     * 完成度改用該區的 v2 技能算（`skillsV2`）。既有五區一個位元都沒變 ——
     * 它們有 legacy 技巧，走的還是原本那條路（收集不倒退，D2）。
     */
    regionMastery(regionId) {
      const all = cat.techniques.filter((t) => t.groupId === regionId);
      if (all.length) {
        const got = all.filter((t) => state.collected.includes(t.id));
        return { total: all.length, collected: got.length, mastered: got.length === all.length, skillBased: false };
      }
      const skills = cat.regionSkills(regionId);
      const got = skills.filter((s) => state.skillsV2.includes(s.id));
      return {
        total: skills.length,
        collected: got.length,
        mastered: skills.length > 0 && got.length === skills.length,
        skillBased: true,
      };
    },

    /** 課程 v2：這一條技能會了嗎（技能本身或它的祖先技巧）。 */
    knowsSkill,
    /** 課程 v2：這一區已經會了幾條技能。 */
    knownInRegion,

    /** 該關是否已通關。 */
    isCleared: (challengeId) => Boolean(state.bestGrades[challengeId]),

    /**
     * 記錄一次評分結果。只有通過才給 XP／收集；重玩拿到更好評價只補差額。
     * @returns {{xpGain:number, levelBefore:number, levelAfter:number, leveledUp:boolean,
     *           newlyCollected:string[], newlyUnlocked:string[], previousGrade:(string|null),
     *           bestGrade:(string|null), improved:boolean}}
     */
    recordResult(evaluation, context = null) {
      const challenge = challengeById.get(evaluation.challengeId) || { xp: evaluation.baseXp };
      const previousGrade = state.bestGrades[evaluation.challengeId] || null;
      const levelBefore = levelFromXp(state.xp).level;

      const outcome = {
        xpGain: 0,
        levelBefore,
        levelAfter: levelBefore,
        leveledUp: false,
        newlyCollected: [],
        newlySkills: [],
        newlyUnlocked: [],
        previousGrade,
        bestGrade: previousGrade,
        improved: false,
        /** 課程 v2 · Phase J2：這一次拿到的土地印記（應用關）與大師層印記。 */
        newSeal: null,
        newPenless: false,
        newScribe: false,
      };

      if (!evaluation.passed) {
        emit();
        return outcome;
      }

      const baseXp = Number.isFinite(challenge.xp) ? challenge.xp : evaluation.baseXp;
      const best = betterGrade(previousGrade, evaluation.grade);
      outcome.bestGrade = best;
      outcome.improved = best !== previousGrade;

      // XP 只補差額 → 重刷同一關不能無限刷分
      const earnedNow = xpForGrade(best, baseXp);
      const earnedBefore = xpForGrade(previousGrade, baseXp);
      outcome.xpGain = Math.max(0, earnedNow - earnedBefore);

      state.bestGrades[evaluation.challengeId] = best;
      state.xp += outcome.xpGain;

      for (const techId of evaluation.teaches) {
        if (!techniqueById.has(techId)) continue;
        if (!state.collected.includes(techId)) {
          state.collected.push(techId);
          outcome.newlyCollected.push(techId);
        }
      }

      /*
       * 課程 v2（Phase B）：新蓋的神廟教的是一條 v2 技能。
       * 有祖先的技巧照舊由上面那個迴圈寫進 `collected`（D2：收集不倒退）；
       * 技能本身另外記在 `skillsV2` —— 純加法，既有的圖鑑／徽章／稱號一格都不動。
       */
      const skillId = challenge.primarySkillId;
      if (typeof skillId === 'string' && skillId && !state.skillsV2.includes(skillId)) {
        state.skillsV2.push(skillId);
        outcome.newlySkills.push(skillId);
      }

      /*
       * 課程 v2 · Phase J2：土地印記。
       * 通過一片土地的應用關（試煉）＝ 那一片土地的印記入袋，冪等（重玩不會再給）。
       * 它不給 XP、不進圖鑑、不算徽章、不是任何東西的解鎖條件 —— 只是憑證。
       */
      if (challenge.application === true && challenge.region) {
        if (!Array.isArray(state.seals)) state.seals = [];
        if (!state.seals.includes(challenge.region)) {
          state.seals.push(challenge.region);
          outcome.newSeal = challenge.region;
        }
      }

      /*
       * 大師層印記（C9：可選、永不擋路）。只算**教學神廟**——
       * 應用關本來就是「把學過的用出來」，不該再給一次無筆之印。
       */
      const master = masterSealFor(challenge, evaluation, context);
      if (master.penless && !state.penlessSeals.includes(challenge.id)) {
        state.penlessSeals.push(challenge.id);
        outcome.newPenless = true;
      }
      if (master.scribe && !state.scribeSeals.includes(challenge.id)) {
        state.scribeSeals.push(challenge.id);
        outcome.newScribe = true;
      }

      recomputeBadges();
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      outcome.levelAfter = lv.level;
      outcome.leveledUp = lv.level > levelBefore;
      outcome.newlyUnlocked = refreshUnlocks();

      persist();
      return outcome;
    },

    /* ---------------------------------------------------------------- *
     * v1.2 · P02：濁靈（murks.json）—— 安撫會被記住
     *
     * 濁靈走同一座主控台，但**不是關卡**：不進 `bestGrades`（142 關的分子）、
     * 不收技巧（`collected` / `skillsV2` 仍只由神廟給）、不寫印記／徽章。
     * 它有自己的一欄 `state.murks[id] = { hits, grade }`：
     *   · hits   命中（`results[i].passed === true`）的 rubric 列 index，跨次**累積聯集、永不清零**
     *            （威脅不懲罰、進度只累積）
     *   · 安撫   **這一次**評分引擎判過（`evaluation.passed`，部分分數也算）**或**累積命中的權重和 ≥ pass
     *            —— 單次沒過、累積過了也算
     *   · grade  gradeForRatio(max(這一次的 ratio（過了才算）, 累積 score / total))，只升不降；全剝 ＝ S。
     *            **存了 grade ＝ 安撫過**（`murkCount()` 就數它）
     *   · XP     只補差額（xpForGrade(新, base) − xpForGrade(舊, base)），升等照 levelFromXp，
     *            升等後照其他 XP 寫入者一樣跑 `refreshUnlocks()`（閘門不能因濁靈升等而過期）
     * ---------------------------------------------------------------- */

    /** 這一隻濁靈的存檔狀態（沒碰過 → null）。 */
    murkState(id) {
      const m = state.murks && typeof state.murks === 'object' ? state.murks[id] : null;
      if (!m || !Array.isArray(m.hits)) return null;
      return { hits: m.hits.slice(), grade: m.grade || null };
    },
    /** 這一隻濁靈已命中的 rubric 列 index（沒碰過 → []）。 */
    murkHits(id) {
      const m = state.murks && typeof state.murks === 'object' ? state.murks[id] : null;
      return m && Array.isArray(m.hits) ? m.hits.slice() : [];
    },
    /**
     * 安撫過（有評價）的濁靈數。
     * @param {string[]|null} [ids] 已知的濁靈 id（murks.json）；給了就只數這些，存檔裡的孤兒 id 不算
     */
    murkCount(ids = null) {
      const store = state.murks && typeof state.murks === 'object' && !Array.isArray(state.murks) ? state.murks : {};
      const keys = Array.isArray(ids) ? ids : Object.keys(store);
      return keys.filter((id) => {
        const m = store[id];
        return m && typeof m.grade === 'string' && m.grade;
      }).length;
    },

    /**
     * 記錄一次對濁靈的呈遞。**原子**：先寫聯集、算安撫與評價、補 XP 差額，
     * 再一次回傳「這一次多了什麼」——P03 的剝殼回呼吃的就是這個回傳值。
     *
     * @param {object} challenge   challenge 形物件（main.js `murkChallenge()`）：至少 { id, rubric, pass, xp?, kind:'murk' }
     * @param {object} evaluation  評分引擎的結果（讀 `results[i].passed`）
     * @param {object} [context]   主控台的作答脈絡（同 recordResult；濁靈目前不用）
     * @returns {{
     *   xpGain:number, levelBefore:number, levelAfter:number, leveledUp:boolean,
     *   newlyCollected:string[], newlySkills:string[], newlyUnlocked:string[],
     *   previousGrade:(string|null), bestGrade:(string|null), improved:boolean,
     *   newSeal:null, newPenless:false, newScribe:false,
     *   murk:{ newlyPassedIndices:number[], hits:number[], score:number, total:number, calmed:boolean, newlyCalmed:boolean }
     * }}
     */
    recordMurk(challenge, evaluation, context = null) {
      void context;
      if (!challenge || typeof challenge !== 'object' || !Array.isArray(challenge.rubric) || !challenge.id) {
        throw new Error('recordMurk(): 需要 challenge 形物件（{ id, rubric, pass }）');
      }
      const id = challenge.id;
      const rubric = challenge.rubric;
      const results = evaluation && Array.isArray(evaluation.results) ? evaluation.results : [];
      const weightOf = (i) => (rubric[i] && Number.isFinite(rubric[i].weight) ? rubric[i].weight : 1);
      const total = rubric.reduce((n, _r, i) => n + weightOf(i), 0);
      const passMark = Number.isFinite(challenge.pass) ? challenge.pass : Math.ceil(total * 0.5);
      // XP 來源與 recordResult 同一條：challenge.xp（main.js murkChallenge 帶 murks.json.xp）→ evaluation.baseXp
      const baseXp = Number.isFinite(challenge.xp) ? challenge.xp : evaluation && Number.isFinite(evaluation.baseXp) ? evaluation.baseXp : 0;

      if (!state.murks || typeof state.murks !== 'object' || Array.isArray(state.murks)) state.murks = {};
      const prev = state.murks[id];
      const oldHits = prev && Array.isArray(prev.hits) ? prev.hits.filter((n) => Number.isInteger(n) && n >= 0 && n < rubric.length) : [];
      const previousGrade = prev && typeof prev.grade === 'string' && prev.grade ? prev.grade : null;
      // 存了 grade ＝ 安撫過（grade 是安撫旗標本身）
      const wasCalmed = previousGrade !== null;

      const passedNow = [];
      results.forEach((r, i) => {
        if (r && r.passed === true && i < rubric.length) passedNow.push(i);
      });
      const oldSet = new Set(oldHits);
      const newlyPassedIndices = passedNow.filter((i) => !oldSet.has(i));
      const hits = [...new Set([...oldHits, ...passedNow])].sort((a, b) => a - b);
      const score = hits.reduce((n, i) => n + weightOf(i), 0);
      const attemptPassed = Boolean(evaluation && evaluation.passed === true);
      // 安撫：這一次評分引擎判過（部分分數也算）**或**累積聯集 ≥ pass
      const calmed = attemptPassed || score >= passMark;
      const newlyCalmed = calmed && !wasCalmed;

      const levelBefore = levelFromXp(state.xp).level;
      const attemptRatio =
        attemptPassed && evaluation && Number.isFinite(evaluation.total) && evaluation.total > 0 && Number.isFinite(evaluation.earned)
          ? evaluation.earned / evaluation.total
          : 0;
      const cumulativeRatio = total > 0 ? score / total : 0;
      const grade = calmed ? betterGrade(previousGrade, gradeForRatio(Math.max(attemptRatio, cumulativeRatio))) : previousGrade;
      const xpGain = Math.max(0, xpForGrade(grade, baseXp) - xpForGrade(previousGrade, baseXp));

      state.murks[id] = { hits, grade };
      state.xp += xpGain;
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      // 與其他 XP 寫入者一致：等級動了，閘門就要重算（否則濁靈升等後的門會過期）
      const newlyUnlocked = refreshUnlocks();
      persist();

      return {
        xpGain,
        levelBefore,
        levelAfter: lv.level,
        leveledUp: lv.level > levelBefore,
        newlyCollected: [],
        newlySkills: [],
        newlyUnlocked,
        previousGrade,
        bestGrade: grade,
        improved: grade !== previousGrade,
        newSeal: null,
        newPenless: false,
        newScribe: false,
        murk: { newlyPassedIndices, hits: hits.slice(), score, total, calmed, newlyCalmed },
      };
    },

    /* ---------------------------------------------------------------- *
     * 課程 v2 · Phase J2：土地印記與大師層印記
     * ---------------------------------------------------------------- */

    /** 這片土地的印記拿到了嗎（＝那一區的應用關通過了）。 */
    hasSeal(regionId) {
      return Array.isArray(state.seals) && state.seals.includes(regionId);
    },
    /** 已拿到的土地印記（區域 id）。 */
    seals: () => (Array.isArray(state.seals) ? state.seals.slice() : []),
    /** 這一座神廟拿到無筆之印了嗎。 */
    hasPenless: (challengeId) => state.penlessSeals.includes(challengeId),
    /** 這一座神廟拿到默寫之印了嗎。 */
    hasScribe: (challengeId) => state.scribeSeals.includes(challengeId),
    /** 這一關的範例被翻開過嗎（看過就永久記著 —— 大師層的防作弊面）。 */
    hasSeenSample: (challengeId) => state.samplesSeen.includes(challengeId),
    /** 記下「這一關的範例被翻開了」（純加法，不給 XP、不影響評價）。 */
    markSampleSeen(id) {
      if (!id) return false;
      if (!Array.isArray(state.samplesSeen)) state.samplesSeen = [];
      if (state.samplesSeen.includes(id)) return false;
      state.samplesSeen.push(id);
      persist();
      return true;
    },
    /**
     * 大師層的總表（圖鑑用）。
     * `pureRegions`＝那一區的**教學神廟**全部拿到無筆之印（一區純手，12 枚）。
     * `divergenceProof`＝分歧之廳 9 座全通 ＋ 終章試煉 S。
     */
    masterSeals() {
      const teaching = (challenges || []).filter((c) => c.application !== true);
      const pureRegions = regionIds.filter((rid) => {
        const here = teaching.filter((c) => c.region === rid);
        return here.length > 0 && here.every((c) => state.penlessSeals.includes(c.id));
      });
      const divShrines = teaching.filter((c) => c.region === 'divergence');
      const divTrial = (challenges || []).find((c) => c.region === 'divergence' && c.application === true);
      const divergenceProof =
        divShrines.length > 0 &&
        divShrines.every((c) => Boolean(state.bestGrades[c.id])) &&
        Boolean(divTrial) &&
        state.bestGrades[divTrial.id] === 'S';
      return {
        penless: state.penlessSeals.slice(),
        scribe: state.scribeSeals.slice(),
        pureRegions,
        divergenceProof,
        seals: Array.isArray(state.seals) ? state.seals.slice() : [],
      };
    },

    /* ---------------- Phase 7：序章引導課程 ---------------- */

    /** 序章走完了嗎（新存檔預設 false；有進度的舊存檔在 normalize 就被認定為已完成）。 */
    isPrologueDone() {
      return Boolean(state.flags.prologueDone);
    },

    /** 序章的某一步練習過了嗎（可續玩、可重看）。 */
    isPrologueStepDone(stepId) {
      return Array.isArray(state.prologueSteps) && state.prologueSteps.includes(stepId);
    },

    /**
     * 完成序章的一步練習：給少量 XP、把技巧收進圖鑑。
     *
     * 刻意**不**寫 bestGrades —— 序章不是關卡，不該佔「已通關 x / 26」，
     * 也不該被算進區域解鎖的通關數。重做同一步不再給 XP。
     *
     * @param {string} stepId
     * @param {{teaches?:string[], xp?:number}} opts
     */
    completePrologueStep(stepId, { teaches = [], xp = 25 } = {}) {
      if (!Array.isArray(state.prologueSteps)) state.prologueSteps = [];
      const levelBefore = levelFromXp(state.xp).level;
      const already = state.prologueSteps.includes(stepId);
      const outcome = {
        already,
        xpGain: 0,
        newlyCollected: [],
        levelBefore,
        levelAfter: levelBefore,
        leveledUp: false,
        newlyUnlocked: [],
      };

      if (!already && typeof stepId === 'string' && stepId) {
        state.prologueSteps.push(stepId);
        outcome.xpGain = Math.max(0, Math.round(xp));
        state.xp += outcome.xpGain;
      }

      for (const techId of teaches) {
        if (!techniqueById.has(techId)) continue;
        if (!state.collected.includes(techId)) {
          state.collected.push(techId);
          outcome.newlyCollected.push(techId);
        }
      }

      recomputeBadges();
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      outcome.levelAfter = lv.level;
      outcome.leveledUp = lv.level > levelBefore;
      outcome.newlyUnlocked = refreshUnlocks();
      persist();
      return outcome;
    },

    /**
     * 這一關的「神諭刻文」（第二幕指引）看過了嗎。
     * 看過了 → 重玩這一關時可以直接跳到刻印（第三幕），不必再被指引擋一次。
     */
    hasSeenGuidance(id) {
      return Array.isArray(state.guidanceSeen) && state.guidanceSeen.includes(id);
    },

    /** 記下「這一關的指引看過了」（純加法，不給 XP、不影響評價）。 */
    markGuidanceSeen(id) {
      if (!id) return false;
      if (!Array.isArray(state.guidanceSeen)) state.guidanceSeen = [];
      if (state.guidanceSeen.includes(id)) return false;
      state.guidanceSeen.push(id);
      persist();
      return true;
    },

    /* ---------------------------------------------------------------- *
     * Phase 22：刻文小語（教一件小事）與祕密地點（純風味）
     *
     * 兩者都跟石碑一樣「不佔關卡評價」——不寫 bestGrades、不算區域解鎖的通關數。
     * 差別是刻文小語掛在一條真實技巧上，所以它**會**把那條技巧收進圖鑑
     * （學到了就是學到了），祕密則完全不碰圖鑑與徽章。
     * ---------------------------------------------------------------- */

    /** 這則刻文小語讀過了嗎。 */
    hasFoundInscription(id) {
      return Array.isArray(state.inscriptionsFound) && state.inscriptionsFound.includes(id);
    },

    /** 讀過幾則刻文小語。 */
    inscriptionCount() {
      return Array.isArray(state.inscriptionsFound) ? state.inscriptionsFound.length : 0;
    },

    /**
     * 讀一則刻文小語。第一次讀給少量 XP，並把它教的那條技巧收進圖鑑（重讀不再給）。
     * @param {string} id
     * @param {string|null} techniqueId 這則刻文教的技巧（會被收進圖鑑）
     * @param {number} [xp]
     */
    readInscription(id, techniqueId = null, xp = 5) {
      if (!Array.isArray(state.inscriptionsFound)) state.inscriptionsFound = [];
      const levelBefore = levelFromXp(state.xp).level;
      if (!id || state.inscriptionsFound.includes(id)) {
        return {
          alreadyFound: true,
          xpGain: 0,
          newlyCollected: [],
          levelBefore,
          levelAfter: levelBefore,
          leveledUp: false,
          newlyUnlocked: [],
        };
      }
      state.inscriptionsFound.push(id);
      const newlyCollected = [];
      if (techniqueId && techniqueById.has(techniqueId) && !state.collected.includes(techniqueId)) {
        state.collected.push(techniqueId);
        newlyCollected.push(techniqueId);
        recomputeBadges();
      }
      const gain = Math.max(0, Math.round(xp));
      state.xp += gain;
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      const newlyUnlocked = refreshUnlocks();
      persist();
      return {
        alreadyFound: false,
        xpGain: gain,
        newlyCollected,
        levelBefore,
        levelAfter: lv.level,
        leveledUp: lv.level > levelBefore,
        newlyUnlocked,
      };
    },

    /** 這個祕密找到了嗎。 */
    hasFoundSecret(id) {
      return Array.isArray(state.secretsFound) && state.secretsFound.includes(id);
    },

    /** 找到幾個祕密。 */
    secretCount() {
      return Array.isArray(state.secretsFound) ? state.secretsFound.length : 0;
    },

    /**
     * 找到一個祕密（走進去就算，不用按 E）。純風味 —— 不進圖鑑、不算徽章。
     * @param {string} id
     * @param {number} [xp]
     */
    findSecret(id, xp = 12) {
      if (!Array.isArray(state.secretsFound)) state.secretsFound = [];
      const levelBefore = levelFromXp(state.xp).level;
      if (!id || state.secretsFound.includes(id)) {
        return { alreadyFound: true, xpGain: 0, levelBefore, levelAfter: levelBefore, leveledUp: false, newlyUnlocked: [] };
      }
      state.secretsFound.push(id);
      const gain = Math.max(0, Math.round(xp));
      state.xp += gain;
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      const newlyUnlocked = refreshUnlocks();
      persist();
      return {
        alreadyFound: false,
        xpGain: gain,
        levelBefore,
        levelAfter: lv.level,
        leveledUp: lv.level > levelBefore,
        newlyUnlocked,
      };
    },

    /* ---------------------------------------------------------------- *
     * Phase 25：動得了的器物（陶罐 / 火盆 / 響石 / 守望石 / 撈月池 /
     * 指路石 / 絞盤 / 長凳）
     *
     * 跟祕密同一層護欄：**純風味**。不進圖鑑、不算徽章、不寫 bestGrades、
     * 不算區域解鎖的通關數 —— 只是「你在這個世界上動過的東西」的計數，
     * 外加第一次動它的一點點 XP。
     * ---------------------------------------------------------------- */

    /** 這件器物動過了嗎。 */
    hasUsedHandle(id) {
      return Array.isArray(state.handlesUsed) && state.handlesUsed.includes(id);
    },

    /** 動過幾件器物。 */
    handleCount() {
      return Array.isArray(state.handlesUsed) ? state.handlesUsed.length : 0;
    },

    /**
     * 動一件器物。第一次給少量 XP，之後怎麼玩都不再給（可以一直敲鑼，但不能刷分）。
     * @param {string} id
     * @param {number} [xp]
     */
    useHandle(id, xp = 4) {
      if (!Array.isArray(state.handlesUsed)) state.handlesUsed = [];
      const levelBefore = levelFromXp(state.xp).level;
      if (!id || state.handlesUsed.includes(id)) {
        return {
          alreadyUsed: true,
          xpGain: 0,
          levelBefore,
          levelAfter: levelBefore,
          leveledUp: false,
          newlyUnlocked: [],
        };
      }
      state.handlesUsed.push(id);
      const gain = Math.max(0, Math.round(xp));
      state.xp += gain;
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      const newlyUnlocked = refreshUnlocks();
      persist();
      return {
        alreadyUsed: false,
        xpGain: gain,
        levelBefore,
        levelAfter: lv.level,
        leveledUp: lv.level > levelBefore,
        newlyUnlocked,
      };
    },

    /** 這塊世界觀石碑讀過了嗎。 */
    hasReadLore(id) {
      return Array.isArray(state.loreRead) && state.loreRead.includes(id);
    },

    /** 讀過的石碑數量。 */
    loreReadCount() {
      return Array.isArray(state.loreRead) ? state.loreRead.length : 0;
    },

    /**
     * 讀一塊石碑。第一次讀給少量 XP（可能因此升等 / 解鎖區域），重讀不再給。
     * 石碑是風味內容，不會進圖鑑、不算徽章 —— 學習內容一律走 challenge。
     *
     * @param {string} id
     * @param {number} [xp]
     * @returns {{alreadyRead:boolean, xpGain:number, levelBefore:number, levelAfter:number,
     *            leveledUp:boolean, newlyUnlocked:string[]}}
     */
    readLore(id, xp = 8) {
      if (!Array.isArray(state.loreRead)) state.loreRead = [];
      const levelBefore = levelFromXp(state.xp).level;
      if (!id || state.loreRead.includes(id)) {
        return {
          alreadyRead: true,
          xpGain: 0,
          levelBefore,
          levelAfter: levelBefore,
          leveledUp: false,
          newlyUnlocked: [],
        };
      }
      state.loreRead.push(id);
      const gain = Math.max(0, Math.round(xp));
      state.xp += gain;
      const lv = levelFromXp(state.xp);
      state.level = lv.level;
      const newlyUnlocked = refreshUnlocks();
      persist();
      return {
        alreadyRead: false,
        xpGain: gain,
        levelBefore,
        levelAfter: lv.level,
        leveledUp: lv.level > levelBefore,
        newlyUnlocked,
      };
    },

    /** 已解鎖的 builder 積木 id（學到的技巧立刻變成主控台的工具）。 */
    unlockedBuilderBlocks() {
      // builder 積木 ↔ 技巧主題的對應：收集到該主題任一技巧 → 解鎖該積木
      const map = {
        role: ['role'],
        task: ['clarity'],
        context: ['grounding', 'longcontext'],
        fewshot: ['fewshot', 'format'],
        cot: ['cot', 'reasoning'],
        format: ['format'],
        guardrail: ['grounding', 'positive'],
        verify: ['cot', 'iterate'],
      };
      const topics = new Set(
        state.collected.map((id) => techniqueById.get(id)).filter(Boolean).map((t) => t.topicId)
      );
      return (cur.builder || [])
        .filter((b) => (map[b.id] || []).some((topic) => topics.has(topic)))
        .map((b) => b.id);
    },

    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      persist();
    },

    setFlag(key, value) {
      state.flags = { ...state.flags, [key]: value };
      persist();
    },

    resetAll() {
      state = io.reset();
      emit();
      return state;
    },
  };

  return api;
}

export default createProgression;

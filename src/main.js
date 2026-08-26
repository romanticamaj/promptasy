/**
 * Promptasy — 進入點
 *
 * Phase 4（M4 美術與氛圍 ＋ M5 音樂與手感）：
 *   標題卡 → 3D 世界（星空 / 極光 / 貼地霧 / 光柱）→ 走到石座 → 按 E →
 *   Prompt 主控台 → 離線 rubric 評分 → 教學回饋（含官方出處）→
 *   XP / 等級 / 圖鑑 / 徽章 / S-A-B-C → localStorage 存檔。
 *   跨區時：配樂交叉淡入淡出 ＋ 霧色 / 色偏 / 光強平滑漂移。
 */
import curriculum from './data/curriculum.json';
import { esc } from './ui/dom.js';
import skillCodexV2 from './data/skill-codex-v2.json';
import regionsV2 from './data/regions-v2.json';
import challengeFile from './data/challenges.json';
import prologueFile from './data/prologue.json';
import builderZh from './data/builder-zh.json';
import curriculumZh from './data/curriculum-zh.json';
import coachFile from './data/coach.json';
import flowFile from './data/flows.json';
import ranksFile from './data/ranks.json';
import inscriptionFile from './data/inscriptions.json';
import secretFile from './data/secrets.json';
import handleFile from './data/handles.json';
import letterFile from './data/letters.json';
import watchmanFile from './data/watchmen.json';
import murkFile from './data/murks.json';
import datedFile from './data/dated-notes.json';
import sourceAnchorFile from './data/source-anchors.json';
import simSamples from './data/sim-samples.json';
import glossaryFile from './data/glossary.json';
import solutionStatsFile from './data/solution-stats.json';
import './styles.css';

import { createEngine } from './engine/engine.js';
import { hourOf, hourFactor, composeMood, createMoodMemo } from './engine/hours.js';
import { createWorld } from './world/world.js';
import { loadColorScript, colorScriptFor } from './world/color-script.js';
import { fxForCheck, fxEnabledIn } from './world/rubric-fx.js';
import colorScriptFile from './data/color-script.json';
import { createPlayer } from './player/player.js';
import { createContent } from './challenges/content.js';
import { createCatalog } from './challenges/catalog.js';
import { createPrologueContent } from './challenges/prologue.js';
import { createSolutionStats } from './challenges/solution-stats.js';
import { createProgression } from './progression/progression.js';
import { createPromptConsole, registerSimDials } from './prompt/console.js';
import { createPractice } from './prompt/practice.js';
import { createPrologue } from './ui/prologue.js';
import { createHud } from './ui/hud.js';
import { createCompass } from './ui/compass.js';
import { createNudge } from './ui/nudge.js';
import { createShareCard } from './ui/sharecard.js';
import { rankFor, rankStats } from './progression/ranks.js';
import { createPerfMonitor } from './ui/perfmon.js';
import { createCodex } from './ui/codex.js';
import { createSettings } from './ui/settings.js';
import { createIntro } from './ui/intro.js';
import { createTablet } from './ui/tablet.js';
import { createInscription } from './ui/inscription.js';
import { createLetter } from './ui/letter.js';
import { createWatchman, skillNoteHtml } from './ui/watchman.js';
import Watchtalk from './progression/watchtalk.js';
import { createGateAsk } from './ui/gate.js';
import { createHandlePanel } from './ui/handle.js';
import { HANDLE_VERBS, HANDLE_VERBS_USED, HANDLE_KINDS, CAPSTAN_TURNS } from './world/handles.js';

/** 鏡頭的水平前方向。提到模組層重複使用 —— 每幀迴圈裡不配置記憶體（WORLD.md §6.2）。 */
const camForward = { x: 0, z: 1 };
import { createTitle } from './ui/title.js';
import { createEntryGate } from './ui/entrygate.js';
import { createKeyHelp } from './ui/keyhelp.js';
import { glossary } from './ui/glossary.js';
import { createAchievement } from './ui/achievement.js';
import { createAudio, REGION_CARVE_CUES, REGION_SEAL_CUES } from './audio/audio.js';
import { isApplicationTrial } from './challenges/trial.js';

/** murks.json 裡真的有的那幾隻濁靈的 id（時辰進度、清燈計數、第一盞回聲共用同一份）。 */
const MURK_IDS = Object.freeze((murkFile.entries || []).map((m) => m.id));

function boot() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  app.innerHTML = '';

  /*
   * 課程 v2 · Phase B — runtime catalog。
   *
   * 舊 68 條技巧（curriculum.json，官方引文、byte-identical）
   *   ＋ 130 條 v2 技能（skill-codex-v2.json，authored: game ＋ 真實官方出處）
   *   ＋ 12 區（regions-v2.json，其中 7 區 implemented: false）
   * 合成同一份 runtime catalog。資料不合契約會在這裡當場丟例外（fail fast）。
   *
   * **玩家看到的東西這一期完全不變**：世界、圖鑑、結果卡一律只列舉
   * `implementedRegions()`（就是既有五區），所以仍然是 27 關 / 68 條 / 5 區。
   */
  const catalog = createCatalog({ curriculum, skillCodex: skillCodexV2, regions: regionsV2 });

  /*
   * 課程 v2 · Phase H：轉鈕（sim）的離線輸出樣本。
   * 樣本是**遊戲自撰**的示範（`authored: "game"`），不呼叫任何服務；
   * 註冊失敗（檔案壞掉／被清空）時那幾關會安靜退回石碑刻印，不會開到空白的碑。
   */
  registerSimDials(simSamples);

  /*
   * Phase 35：術語小卡（`glossary.json`，authored: game）。
   * 純扶手層：不教技巧、不放連結，真正的教學與官方出處仍然只在第二幕與圖鑑。
   * 檔案缺席時 annotate() 安靜地什麼都不做（離線降級）。
   */
  glossary.install(glossaryFile);

  const content = createContent(
    curriculum,
    challengeFile,
    builderZh,
    coachFile,
    flowFile,
    curriculumZh,
    datedFile,
    catalog,
    sourceAnchorFile
  );
  // 序章的教學內容：只引用 curriculum 既有的技巧與弱→強對照（逐字，附官方出處）
  const prologueContent = createPrologueContent(prologueFile, curriculum, curriculumZh, sourceAnchorFile);
  /*
   * v1.2 · P05：進程一變（過關／收技能／精通／安撫濁靈／重置）就重組一次氛圍 ——
   * 一夜的時辰是進度的外顯。applyMood 要等引擎建好才存在，所以先掛一個會查的殼。
   */
  let applyMood = null;
  const progression = createProgression({
    catalog,
    challenges: content.challenges,
    onChange: () => {
      if (applyMood) applyMood();
    },
  });
  const quality = progression.state.settings.quality === 'low' ? 'low' : 'high';

  /* --- 3D 場景 --- */
  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const engine = createEngine({ container: stage, quality });
  /*
   * v1.2 · P06：區域色彩腳本（純視覺資料層）。開機讀一次、驗一次；驗不過的區退回 foundations，遊戲照跑。
   * 建構世界前就要載好 —— 補光顏色／道具補色／螢火色是建構時就套的（不平滑）。
   */
  loadColorScript(colorScriptFile);
  /*
   * Phase 22：世界會回應你走過去（風鈴 / 音石 / 光菇 / 水紋 / 小獸 / 螢火）。
   * 節流與 hysteresis 都在 reactive.js 裡；這裡只負責「要放什麼聲音」。
   * reduce-motion 時關掉的是「動」，不是「回應」——光與聲音照舊。
   */
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = createWorld({
    engine,
    curriculum,
    // 課程 v2 · Phase E：新上線的區域（量器坊起）的名稱與主色住在 regions-v2.json
    regions: catalog.implementedRegions(),
    challenges: content.challenges,
    progression,
    quality,
    shrine: prologueContent.shrine,
    inscriptions: inscriptionFile.entries || [],
    // v1.2 · P07：抄寫人的殘頁（走近按 E 撿起來讀）
    letters: letterFile.entries || [],
    secrets: secretFile.entries || [],
    handles: handleFile.entries || [],
    // v1.2 · P01：濁靈（留在原地的東西；走近會轉頭，按 E 開主控台安撫）
    murks: murkFile.entries || [],
    // v1.2 · P03：開機依存檔還原殼數／清燈（不播動畫）
    murkStateOf: (id) => progression.murkState(id),
    // v1.2 · P16c：守夜人（站著不動的人；走近按 E 聊得起來）
    watchmen: watchmanFile.entries || [],
    watchmanMetOf: (id) => progression.hasMetWatchman(id),
    // v1.2 · P06：色彩腳本（key／rim／particle 建構時套；sky 走 applyMood 的單一入口）
    colorScript: colorScriptFor,
    reducedMotion,
    onReact: (evt) => audio.cue(evt.sound, { baseScale: evt.baseScale }),
    onSecret: (id) => findSecret(id),
    // 面板打開 / 序章進行中：整組停手（讀題的時候世界不該在旁邊叮咚響）
    isBusy: () => anyPanelOpen() || prologue.isActive,
  });

  /* --- 音訊 --- */
  const audio = createAudio({
    volume: progression.state.settings.volume,
    muted: progression.state.settings.muted,
    region: 'foundations',
  });

  const player = createPlayer({
    engine,
    quality,
    startPosition: [0, 6],
    world,
    onStep: () => audio.step(performance.now() / 1000),
    /*
     * v1.2 · P14：跳躍的兩聲。兩支都只有合成音（`SFX_FILES` 沒有對應檔案）——
     * 「檔案缺席時合成音自動後備」這條離線護欄在這裡是預設值，不是備案。
     */
    onJump: () => audio.cue('jump'),
    onLand: (impact) => audio.cue('land', { baseScale: 1 - Math.min(0.18, impact / 120) }),
    // reduce-motion 關掉的是擠壓與塵的飛散，不是跳躍本身（WORLD.md §2.4）
    reducedMotion,
  });

  /* --- 氛圍的單一入口（v1.2 · P05）：區域色盤 × 一夜的時辰 → 引擎的 setMood ---
   * 進區、進程變化、forceHour 都走這一個函式；引擎那邊只有一份 target 在管霧色／月亮／星星／極光。
   * 時辰只乘因子、不換區域色系；永遠是夜（終態＝星最亮之夜，沒有黎明）。
   * v1.2 · P06：第一個參數是色彩腳本 `colorScriptFor(region)`（＝ atmosphereFor 同形 ＋ sky:{top,low}）。 */
  let moodRegion = 'foundations';
  const hourNow = () => {
    const h = hourOf({
      mastered: progression.masteredRegions().length,
      masteredTotal: catalog.counts.implementedRegions,
      skills: progression.state.skillsV2.length,
      skillsTotal: catalog.counts.skills,
      murks: progression.murkCount(MURK_IDS),
      murksTotal: MURK_IDS.length,
    });
    const forced = engine.forcedHour;
    return { index: forced == null ? h.index : forced, p: h.p, forced };
  };
  // 上一次真的送進 setMood 的 {region, hour}；同一對就不重送（進程一變就會叫一次，多半時辰沒動）
  const moodApplied = createMoodMemo();
  applyMood = (regionId = moodRegion, { force = false } = {}) => {
    moodRegion = regionId;
    const hourIndex = hourNow().index;
    if (!moodApplied.changed(moodRegion, hourIndex, force)) return false;
    engine.setMood(composeMood(colorScriptFor(moodRegion), hourFactor(hourIndex)));
    return true;
  };
  engine.onHourForced(() => applyMood(moodRegion, { force: true }));
  // 開場先把氣氛設成起始區的樣子（不用等第一次跨區）
  applyMood('foundations', { force: true });

  /* --- UI --- */
  const ui = document.createElement('div');
  ui.className = 'ui';
  app.appendChild(ui);

  const hud = createHud({
    content,
    progression,
    getObjective: (regionId) => world.nextObjective(regionId),
    onOpenCodex: () => openPanel(codex),
    onOpenSettings: () => openPanel(settings),
  });
  ui.appendChild(hud.root);

  /* --- 指南針：錶盤跟著鏡頭轉、金針指向下一個目標（Phase 14） --- */
  const compass = createCompass({
    world,
    player,
    content,
    getRegion: () => hud.region,
  });
  hud.root.appendChild(compass.root);

  /* --- 導航閃爍提示：太久沒往目標走時，回聲會在畫面上方說一句（Phase 21） --- */
  const nudge = createNudge({
    world,
    player,
    content,
    getRegion: () => hud.region,
    isBusy: () => anyPanelOpen() || prologue.isActive,
  });
  hud.root.appendChild(nudge.root);

  /* --- 效能監視器（Phase 17）：預設關閉，設定頁或 F3 打開 --- */
  const perfmon = createPerfMonitor({
    engine,
    enabled: progression.state.settings.perfMonitor === true,
  });
  ui.appendChild(perfmon.root);

  /**
   * v1.2 · P08：這一趟已經走進過的土地（回聲的「第一次走進某一區」只說一次）。
   * 刻意不寫進存檔 —— 它不是進度，只是這一夜的記憶。
   */
  const regionsWalked = new Set();

  /** 已慶祝過的「區域精通」，避免每次刷新都跳一次。 */
  const masteredSeen = new Set(progression.masteredRegions());
  for (const id of masteredSeen) world.setRegionMastered(id);

  function checkPayoffs() {
    for (const regionId of progression.masteredRegions()) {
      if (masteredSeen.has(regionId)) continue;
      masteredSeen.add(regionId);
      world.setRegionMastered(regionId);
      const g = content.group(regionId);
      hud.toast(`✦ ${g ? g.name : regionId} 精通 —— 這片土地的技巧已全數收進圖鑑`, 'good');
      hud.celebrate(`${g ? g.name : regionId} · 精通`, 'mastery');
      engine.pulse(1.0);
      audio.cue('unlock');
      nudge.echo('regionMastered');
    }

    const achievement = progression.hiddenAchievement();
    if (achievement.complete && !progression.state.flags.finaleSeen) {
      progression.setFlag('finaleSeen', true);
      hud.toast(`✦ 隱藏成就：${achievement.total} 條技巧全數收集，四廠徽章全數點亮`, 'good');
      hud.celebrate(`${achievement.collected} / ${achievement.total} · 全數收集`, 'finale');
      audio.cue('finale');
      engine.pulse(1.2);
      setTimeout(() => openPanel(finale), 900);
    }
  }

  /*
   * issue #3：五片新土地各自有自己的「刻上一段」音（量測 / 鍛打 / 刪除 / 重跑 / 對焦）。
   * 沒列到的區域仍然是通用的那一聲 —— 換皮的是材質，不是文法。
   */
  let carveRegion = null;
  const carveCue = () => (carveRegion && REGION_CARVE_CUES[carveRegion]) || 'stamp';
  const sealCue = () => (carveRegion && REGION_SEAL_CUES[carveRegion]) || 'seal';

  /**
   * 一片土地開了的時候該響哪一聲。
   * 硬門檻（分歧之廳 —— 全場唯一沒有「先行前往」那條路的門）是**厚重閂鎖**：
   * 你是達成條件把它解開的，不是走過去它讓開的。其餘的門仍然是微光 ＋ 石門。
   */
  function unlockCue(regionId) {
    let hard = false;
    try {
      hard = Boolean(progression.gateStatus(regionId).hard);
    } catch {
      hard = false;
    }
    return hard ? 'hardGate' : 'unlock';
  }

  /** v1.2 · P03：最近一次 `onRubricHits` 的資料（測試／除錯用）。 */
  let lastRubricHits = null;
  /*
   * v1.2 · P10b：解法百分位。**內建分布**（solution-stats.json）由本機評分引擎跑
   * 每一關自己的示範解答／快速填入／素材拆組出來的通過解產生 —— 不是其他玩家的成績，
   * 結果面那一行會照實說。判定與百分位是純函式，資料在這裡注入（progression 不 import JSON）。
   */
  const solutionStats = createSolutionStats(solutionStatsFile);
  const promptConsole = createPromptConsole({
    content,
    progression,
    solutionStats,
    onSubmit: () => audio.cue('submit'),
    // 即時預檢又點亮一項時的輕響（Phase 9 的「方向是對的」回饋）
    onChime: () => audio.cue('spark'),
    // Phase 11 石碑刻印：刻上一段 / 石碑不收 / 刻滿了
    onCarve: () => {
      audio.cue(carveCue());
      engine.pulse(0.28);
    },
    onReject: () => audio.cue('reject'),
    onSeal: () => {
      audio.cue(sealCue());
      engine.pulse(0.45);
    },
    // 轉鈕轉到某一檔（issue #3：三檔各一顆卡榫聲，音高越高＝檔位越高）
    onDial: ({ index }) => {
      audio.cue('simDial', { notch: index });
      engine.pulse(0.18);
    },
    // 刻印牌被按下去的那一下（節流在音訊那邊）
    onTap: () => audio.cue('click'),
    onShare: (opts) => openShare(opts),
    /*
     * v1.2 · P03：命中的檢查看得見 —— recorder 回傳後、畫結果之前，主控台回呼一次。
     * 濁靈：每一條新命中剝一層殼（世界端演出）＋ 一下輕脈衝 ＋ 每殼一聲 murkHit
     * （最多 3 聲、隔 90ms 用 setTimeout 排開；音高層依累積命中數 1/2/3+）。
     * 關卡（kind 缺省）：v1.2 · P09／P10a 接石座 —— 新命中的 rubric index 換成**檢查器的名字**，
     * 交給 `world.rubricFx` 在石座旁演一段（腳下的圈掃亮／碎石排成一列／光柱收成一段／
     * 浮碑戴上輪廓光／小石板成對浮起／四道短牆圍成方框／小光點繞一圈／腳下的圈收成小盤）。
     * 演出時結果面還開著，所以脈衝比濁靈輕（0.18 < 0.28）、不加音效。
     */
    onRubricHits: (hits) => {
      lastRubricHits = hits;
      const ch = hits && hits.challenge;
      if (!ch) return;
      if (ch.kind !== 'murk') {
        // 石座（kind 缺省）：只演有對應演出的那 8 個檢查，且只在鋪到的區（P10a：12 區全開）
        const newlyIdx = Array.isArray(hits.newlyPassedIndices) ? hits.newlyPassedIndices : [];
        if (!newlyIdx.length) return;
        const marker = world.markers.find((m) => m.id === ch.id);
        if (!marker || !fxEnabledIn(marker.region)) return;
        const rubric = ch.rubric || [];
        const fxChecks = [];
        for (let k = 0; k < newlyIdx.length; k += 1) {
          const row = rubric[newlyIdx[k]];
          const name = row && row.check;
          if (name && fxForCheck(name) && !fxChecks.includes(name)) fxChecks.push(name);
        }
        if (!fxChecks.length) return;
        if (world.rubricFx?.play?.(marker, fxChecks) > 0) engine.pulse(0.18);
        return;
      }
      const newly = Array.isArray(hits.newlyPassedIndices) ? hits.newlyPassedIndices : [];
      const cumulative = Array.isArray(hits.passedIndices) ? hits.passedIndices.length : newly.length;
      // recorder 已經落盤：calmed／newlyCalmed 直接用它回傳的（hits.murk），不讓世界端猜
      const st = progression.murkState(ch.id);
      const mk = hits.murk || {};
      world.murks.strike(ch.id, {
        newlyPassedIndices: newly,
        hits: hits.passedIndices,
        total: hits.total,
        calmed: typeof mk.calmed === 'boolean' ? mk.calmed : Boolean(st && st.grade),
        newlyCalmed: typeof mk.newlyCalmed === 'boolean' ? mk.newlyCalmed : undefined,
      });
      if (!newly.length) return;
      engine.pulse(0.28);
      const n = Math.min(3, newly.length);
      for (let k = 0; k < n; k += 1) {
        // 第 k 殼的累積命中數 ＝（累積 − 這一次新增）＋ k ＋ 1 → 三層音高 0/1/2
        const layer = Math.min(2, Math.max(0, cumulative - newly.length + k));
        if (k === 0) audio.cue('murkHit', { layer });
        else setTimeout(() => audio.cue('murkHit', { layer }), 90 * k);
      }
    },
    onResult: ({ challenge, evaluation, outcome }) => {
      hud.refresh();
      /** 升等的共同收尾（關卡與濁靈都走這裡）：toast ＋ 一下脈衝。 */
      const celebrateLevelUp = (o) => {
        if (!o.leveledUp) return;
        hud.toast(`升級了！Lv.${o.levelAfter}`, 'good');
        engine.pulse(0.7);
        // v1.2 · P08：回聲用世界的說法回應一句（面板還開著 → 它會等到收起來才說）
        nudge.echo('levelUp');
      };
      /** 新解鎖區域的共同收尾：開閘門、toast、上方公告、音效、脈衝。 */
      const announceUnlocks = (o) => {
        for (const regionId of o.newlyUnlocked || []) {
          const g = content.group(regionId);
          world.openGate(regionId, true);
          hud.toast(`新區域解鎖：${g ? g.name : regionId} —— 橋上的閘門開了`, 'good');
          // 解鎖當下立刻在畫面上方說一次「○○ 已開啟，往前走吧」（不受冷卻限制）
          nudge.echo('regionUnlocked', { regionId });
          audio.cue(unlockCue(regionId));
          engine.pulse(1.0);
        }
      };
      /*
       * v1.2 · P02：濁靈的安撫走的是同一座主控台，但**不是關卡**——
       * 沒有石座可以點亮、不找 marker。音效跟結果面一樣看**這一次**（evaluation.passed）；
       * 「這一次才安撫」（outcome.murk.newlyCalmed，可能是累積聯集湊到的）→ 慶祝；
       * 升等／解鎖照其他 XP 寫入者的收尾（recordMurk 已跑 refreshUnlocks，閘門要跟著開）。
       * 剝殼／清燈演出留給 P03。
       */
      if (challenge && challenge.kind === 'murk') {
        const mk = outcome.murk || {};
        /*
         * P03：這一次才安撫 → 只播 murkCalm（暖和弦），不再播 pass；
         * 沒安撫時照 P02：這一次過了播 pass、沒過播 fail。
         * （「這一次沒過、但聯集湊到安撫」→ 只有 murkCalm —— 牠聽懂了就是好消息，不疊 fail。）
         */
        if (mk.newlyCalmed) audio.cue('murkCalm');
        else if (evaluation.passed) audio.cue('pass', { grade: evaluation.grade });
        else audio.cue('fail');
        if (mk.newlyCalmed) {
          player.celebrate?.();
          hud.celebrate(`${challenge.title} · 牠聽懂了`, 's');
          /*
           * v1.2 · P04／P08：清燈亮起時回聲說一句 —— 第一盞有它自己的那一句。
           * （P08 起走回聲自己的通道，不再借 toast 冒充回聲的口吻。）
           */
          const calmed = progression.murkCount(MURK_IDS);
          nudge.echo(calmed === 1 ? 'firstMurkCalmed' : 'murkCalmed');
          if (calmed >= MURK_IDS.length) nudge.echo('collectionFull', { what: '濁言與正言' });
        }
        celebrateLevelUp(outcome);
        announceUnlocks(outcome);
        if ((outcome.newlyUnlocked || []).length) {
          world.refreshGates();
          compass.refresh();
        }
        return;
      }
      if (evaluation.passed) {
        /*
         * 應用關（試煉）過關響的是**鑼**，不是頌缽 —— 同一件事變大了，
         * 不是換一套語言（issue #3 的音效交付就是照這個道理挑的）。
         */
        if (isApplicationTrial(challenge)) audio.cue('trialPass');
        else audio.cue('pass', { grade: evaluation.grade });
        /*
         * 大師層印記（無筆之印 / 默寫之印）：公證章 ＋ 微光。
         * 讓過關那一聲先站穩再進來 —— 兩個都是好消息，不該撞在一起。
         */
        if (outcome.newPenless || outcome.newScribe) setTimeout(() => audio.cue('masterSeal'), 700);
        player.celebrate?.(); // 旅人舉手歡呼一下（1.2 秒後自己收回去）
        const marker = world.markers.find((m) => m.id === challenge.id);
        if (marker) marker.setCleared(progression.bestGrade(challenge.id));
        if (evaluation.grade === 'S') {
          hud.celebrate('S · 完美', 's');
          nudge.echo('gradeS');
        }
        celebrateLevelUp(outcome);
        announceUnlocks(outcome);
        world.refreshGates();
        compass.refresh();
        checkPayoffs();
      } else {
        audio.cue('fail');
      }
    },
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(promptConsole.root);

  const codex = createCodex({
    content,
    progression,
    onClose: () => closePanel(),
    onShare: (opts) => openShare(opts),
    getRank: () => rankFor(rankStats(progression, catalog), ranksFile.ranks),
    inscriptionTotal: (inscriptionFile.entries || []).length,
    secretTotal: (secretFile.entries || []).length,
    // v1.2 · P15：圖鑑的「秘境」章節 —— 找到的收進來，沒找到的只留一行 tell
    secrets: secretFile.entries || [],
    secretTells: secretFile.tells || {},
    handleTotal: (handleFile.entries || []).length,
    // v1.2 · P07：圖鑑第五列「抄寫人的殘頁 n/24」＋可展開的清單
    letterTotal: (letterFile.entries || []).length,
    letters: letterFile.entries || [],
    // v1.2 · P02：圖鑑第四列「濁言與正言 n/8」＋ 可展開的條目
    murkTotal: (murkFile.entries || []).length,
    murks: murkFile.entries || [],
  });
  ui.appendChild(codex.root);

  const settings = createSettings({
    content,
    progression,
    audio,
    onClose: () => closePanel(),
    onReset: () => {
      hud.refresh();
      // v1.2 · P03：世界端的濁靈跟著存檔一起歸零（不重載也不會演出失聯）
      world.murks?.reset?.();
      // v1.2 · P09：石座演出也歸零（借走的光柱還回去、粒子池清空；WORLD §8 G24b）
      world.rubricFx?.reset?.();
      // v1.2 · P06：閘門標籤／三態與石座三態也跟著歸零（先行前往過的門回到琥珀、它的石座回到暗）
      world.refreshGates?.();
      world.refreshMarkerStates?.();
      hud.toast('進度已重置 —— 重新整理頁面即可從頭開始', 'warn');
    },
    onReplayPrologue: () => {
      settings.close();
      closePanel();
      progression.setFlag('prologueDone', false);
      player.teleport?.(0, 6);
      player.setInputEnabled(true);
      prologue.start();
      hud.toast('重看引導課程 —— 回聲又在祭壇那邊了。', 'info');
    },
    onPromptModeChange: (m) => {
      promptConsole.setMode(m);
      hud.toast(
        m === 'free' ? '已切到自由書寫：關卡裡自己打整段 prompt。' : '已切回石碑刻印：關卡會一段一段問你。',
        'info'
      );
    },
    onPerfMonitorChange: (on) => {
      perfmon.setEnabled(on);
    },
    // 操作一覽疊在設定上面開，收起來之後設定還在原地
    onOpenKeyHelp: () => {
      if (!keyhelp.isOpen) toggleKeyHelp();
    },
    onQualityChange: (q) => {
      // 即時生效（不用重新整理）：後製 / 陰影 / pixelRatio 一起切
      engine.setQuality(q);
      hud.toast(q === 'low' ? '已切到低畫質（關閉後製）' : '已切回高畫質（後製與陰影開啟）', 'info');
    },
  });
  ui.appendChild(settings.root);

  const finale = createAchievement({
    content,
    progression,
    onClose: () => closePanel(),
    onShare: (opts) => openShare(opts),
  });
  ui.appendChild(finale.root);

  /* --- 可分享的結果卡（Phase 21）：canvas 畫圖 → 下載 / 複製，全程離線 --- */
  const shareCard = createShareCard({
    content,
    progression,
    ranksFile,
    onToast: (message, kind) => hud.toast(message, kind),
    // 分享卡是疊在其他面板上的一層，關掉時不動底下那個面板的狀態
    onClose: () => audio.cue('close'),
  });
  ui.appendChild(shareCard.root);

  /* --- 操作一覽（Phase 23）：`?` 隨時叫得出來，疊在最上面那一層 --- */
  const keyhelp = createKeyHelp({
    onClose: () => {
      audio.cue('close');
      // 底下那一層原封不動 —— 只有「全部都收起來了」才把角色的操控權還回去
      player.setInputEnabled(!anyPanelOpen());
    },
  });
  ui.appendChild(keyhelp.root);

  const tabletPanel = createTablet({
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(tabletPanel.root);

  /* --- Phase 22：刻文小語（走近角落的刻字，按 E 看一件小事） --- */
  const inscriptionPanel = createInscription({
    content,
    sourceIntro: inscriptionFile.sourceIntro || '',
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(inscriptionPanel.root);

  /* --- v1.2 · P07：抄寫人的殘頁（撿起來讀的小窗） --- */
  const letterPanel = createLetter({
    content,
    sourceIntro: letterFile.sourceIntro || '',
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(letterPanel.root);

  /* --- v1.2 · P16c：守夜人的對話小窗（用選的，不打字） --- */
  const watchmanPanel = createWatchman({
    onTopic: ({ watchmanId, topic }) => {
      progression.seeWatchTopic(watchmanId, topic);
      audio.cue('open');
    },
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(watchmanPanel.root);

  /* --- Phase 29：橋上的門會問你一句（條件沒到也能先行前往） --- */
  const gateAsk = createGateAsk({
    onProceed: (regionId) => proceedThroughGate(regionId),
    onStay: (regionId) => {
      // 留下來修行：這道門暫時不再問（走遠一點再回來才會重新問一次）
      gateAskSnoozed = regionId;
      const g = content.group(regionId);
      hud.toast(`${g ? g.name : regionId}：門還在那裡，等你準備好。`, 'info');
    },
    onClose: (opts = {}) => {
      audio.cue('close');
      // Esc / 點背景關掉 = 先留下修行（不會偷偷幫你開門）
      if (opts.regionId) gateAskSnoozed = opts.regionId;
      closePanel();
    },
  });
  ui.appendChild(gateAsk.root);

  /* --- Phase 25：器物的小窗（只有陶罐與指路石會開它） --- */
  const handlePanel = createHandlePanel({
    onClose: () => {
      audio.cue('close');
      closePanel();
    },
  });
  ui.appendChild(handlePanel.root);

  const intro = createIntro({
    onDismiss: () => {
      progression.setFlag('introSeen', true);
      player.setInputEnabled(true);
      audio.start();
    },
  });
  ui.appendChild(intro.root);

  /* --- Phase 7：序章「喚醒神諭」= 引導課程（練習台 ＋ 回聲的節奏） --- */
  const practice = createPractice({
    content,
    progression,
    onSubmit: () => audio.cue('submit'),
    // Phase 13：序章的三堂課用的是正式關卡那支石碑 —— 手感與音效完全一致
    onCarve: () => {
      audio.cue('stamp');
      engine.pulse(0.28);
    },
    onReject: () => audio.cue('reject'),
    onSeal: () => {
      audio.cue('seal');
      engine.pulse(0.45);
    },
    onTap: () => audio.cue('click'),
    onPass: ({ evaluation }) => {
      hud.refresh();
      audio.cue('pass', { grade: evaluation.grade });
      player.celebrate?.();
      engine.pulse(0.5);
    },
    onDone: () => prologue.practiceDone(),
    onClose: () => {
      audio.cue('close');
      player.setInputEnabled(!title.isOpen && !intro.isOpen);
      prologue.practiceDismissed();
    },
  });
  ui.appendChild(practice.root);

  const prologue = createPrologue({
    prologue: prologueContent,
    progression,
    player,
    world,
    practice,
    hud,
    audio,
    engine,
    onPracticeOpen: () => {
      audio.cue('open');
      player.setInputEnabled(false);
    },
    onPracticeClose: () => player.setInputEnabled(!title.isOpen && !intro.isOpen),
    onFinish: () => {
      player.setInputEnabled(true);
      hud.refresh();
    },
    onSkip: () => {
      // 跳過的人至少要拿到一張操作說明，不然會不知道按什麼鍵
      player.setInputEnabled(false);
      intro.open();
    },
  });
  ui.appendChild(prologue.root);

  /*
   * Phase 34 · 開場的黑幕
   *
   * `#bootcover` 寫在 index.html 裡（行內樣式，第一幀就生效 —— 見那裡的註解）。
   * 從開機到玩家按下開始為止，3D 世界一眼都不准被看到；引擎照樣在底下暖機。
   * 按下開始 → 1.4 秒淡出，像劇場的燈慢慢亮起來 —— 這個「慢」是刻意的，
   * 世界第一次出現的那一下值得一個鏡頭。
   */
  const bootCover = document.getElementById('bootcover');
  let coverLifted = false;
  function liftBootCover() {
    if (coverLifted || !bootCover) return;
    coverLifted = true;
    bootCover.classList.add('is-lifting');
    // 淡完就從 DOM 拿掉（它是全螢幕的合成層，留著沒有意義）
    setTimeout(() => bootCover.remove(), 1800);
  }

  /* --- 開場標題卡 --- */
  const title = createTitle({
    onStart: () => {
      liftBootCover();
      audio.start();
      // 開場曲讓位給當區配樂（5 秒的等功率交叉淡接，像鏡頭從序幕搖進世界）
      const here = world.regionAt(player.position.x, player.position.z);
      audio.setRegion(here?.id || 'foundations', 5);
      audio.cue('open');
      engine.pulse(0.85);
      if (!progression.isPrologueDone()) {
        // 新玩家：先上引導課程（序章），角色要能動 —— 前幾拍就是靠「真的走一步」過關
        player.setInputEnabled(true);
        prologue.start();
      } else if (!progression.state.flags.introSeen) {
        player.setInputEnabled(false);
        intro.open();
      } else {
        player.setInputEnabled(true);
      }
    },
  });
  ui.appendChild(title.root);

  /* --- 入場門（Phase 33）：自動播放被擋時的那一下手勢 --- */
  const entryGate = createEntryGate({
    // 手勢的呼叫堆疊裡就要 resume，晚一拍瀏覽器不認
    onUnlock: () => {
      audio.start();
      /*
       * 推開那一下要有聲音 —— 而且要像一扇石門被推開、不是按到一個介面按鈕。
       * `gateOpen` 就是那一聲（有音檔時是 sfx_unlock_door.m4a，沒有就退回
       * 87 Hz 的低頻合成版）。這是玩家在這個世界裡聽到的第一個聲音，
       * 排在 resume 之後同一拍發出，開場曲的第一個音進來時它剛好散掉。
       */
      audio.cue('gateOpen');
    },
    onEnter: () => title.open(),
  });
  ui.appendChild(entryGate.root);

  /* --- 面板開關：打字時角色不能動 --- */
  let openedPanel = null;
  function openPanel(panel, ...args) {
    if (openedPanel && openedPanel !== panel) openedPanel.close();
    openedPanel = panel;
    /*
     * issue #3：記下這一關站在哪片土地上 —— 「刻上一段」與「刻滿了」要放
     * 那片土地自己的聲音（量測 / 鍛打 / 刪除 / 重跑 / 對焦）。
     */
    if (panel === promptConsole) carveRegion = (args[0] && args[0].region) || null;
    // 打開任何面板都代表「玩家沒有迷路」→ 導航提示的閒置計時歸零
    nudge.noteActivity();
    player.setInputEnabled(false);
    if (panel === codex) audio.cue('codex');
    // 器物的小窗與刻文小語自己會放那件東西的聲音（掀蓋 / 敲木牌 / 祭壇），
    // 不要再疊一聲通用的翻頁音
    else if (
      panel !== promptConsole &&
      panel !== handlePanel &&
      panel !== inscriptionPanel &&
      panel !== letterPanel &&
      panel !== watchmanPanel
    ) {
      audio.cue('open');
    }
    panel.open(...args);
  }
  function closePanel() {
    openedPanel = null;
    // 術語小卡是掛在 <body> 上的（面板有 overflow，掛裡面會被裁掉）——
    // 面板收起來的時候要記得順手把它也收掉，不然會有一張卡浮在世界上面
    glossary.close();
    player.setInputEnabled(!intro.isOpen && !title.isOpen && !practice.isOpen);
  }
  /**
   * 分享卡：疊在目前這個面板**上面**開，不走 openPanel（那會把結果面板關掉）。
   * 關掉分享卡時底下的面板原封不動還在。
   */
  function openShare(opts) {
    audio.cue('open');
    nudge.noteActivity();
    shareCard.open(opts);
  }
  /**
   * 操作一覽：和分享卡一樣疊在目前這一層**上面**開，不走 openPanel
   * （那會把底下的關卡收掉）。任何時候都叫得出來，包括正在讀題的時候。
   */
  function toggleKeyHelp() {
    if (keyhelp.isOpen) {
      keyhelp.close();
      return false;
    }
    audio.cue('open');
    nudge.noteActivity();
    player.setInputEnabled(false);
    keyhelp.open();
    return true;
  }

  const anyPanelOpen = () =>
    keyhelp.isOpen ||
    shareCard.isOpen ||
    promptConsole.isOpen ||
    codex.isOpen ||
    settings.isOpen ||
    intro.isOpen ||
    finale.isOpen ||
    tabletPanel.isOpen ||
    inscriptionPanel.isOpen ||
    letterPanel.isOpen ||
    watchmanPanel.isOpen ||
    gateAsk.isOpen ||
    handlePanel.isOpen ||
    practice.isOpen ||
    title.isOpen;

  /**
   * v1.2 · P01：把一隻濁靈的資料組成主控台看得懂的 challenge 形物件。
   * `scenario` 就是牠的濁言（那段寫壞的請求）；沒有 flow → 主控台自動走自由書寫；
   * `kind: 'murk'` 讓主控台與 onResult 知道這不是關卡（不落盤、不點石座、不慶祝解鎖）。
   */
  function murkChallenge(murk) {
    const e = murk.entry;
    return {
      id: e.id,
      region: e.region,
      title: e.title,
      npc: '濁靈',
      scenario: e.taint,
      taint: e.taint,
      mission: e.mission,
      clue: e.clue,
      teaches: Array.isArray(e.teaches) ? e.teaches.slice() : [],
      primarySkillId: e.primarySkillId,
      primaryTechniqueId: e.primaryTechniqueId ?? null,
      rubric: e.rubric,
      pass: e.pass,
      // v1.2 · P06b：濁靈自己帶著石碑刻印的流程（預設設定下用「選的」安撫）
      flow: e.flow,
      sample: e.sample,
      source: e.source,
      xp: murkFile.xp,
      kind: 'murk',
    };
  }

  /* --- 互動迴圈：偵測最近的石座 / 石碑 / 閘門，以及玩家目前在哪一區 --- */
  let nearMarker = null;
  let nearGate = null;
  let nearTablet = null;
  let nearInscription = null;
  let nearLetter = null;
  /** Phase 25：走近的器物（陶罐 / 火盆 / 響石 / 守望石 / 撈月池 / 指路石 / 絞盤 / 長凳）。 */
  let nearHandle = null;
  /** v1.2 · P01：走近的濁靈（第 ⑥ 層：石座 > 濁靈 > 石碑 > 刻文 > 器物 > 閘門）。 */
  let nearMurk = null;
  /** v1.2 · P16c：走近的守夜人（第 ⑧ 層：石座 > 濁靈 > **守夜人** > 石碑 > …）。 */
  let nearWatchman = null;
  /**
   * Phase 29：剛剛選了「先留下修行」的那道門。
   * 走遠一點（離開互動半徑）再回來才會重新問一次 —— 站在門口不會被連問。
   */
  let gateAskSnoozed = null;
  /** 走到門前自動問一次的距離（比互動半徑 14 近很多：真的走到門口才問）。 */
  const GATE_ASK_RADIUS = 7.5;
  /** 目前坐在哪一張長凳上（沒坐就是 null）。 */
  let seatedOn = null;
  /** 坐下之前的鏡頭距離 —— 起身要還回去。 */
  let seatCamera = 0;

  /** 解鎖 / 升等的共同收尾（讀碑、讀刻文、找到祕密都可能推進度）。 */
  function applyWorldGain(outcome) {
    hud.refresh();
    for (const regionId of outcome.newlyUnlocked || []) {
      const g = content.group(regionId);
      world.openGate(regionId, true);
      hud.toast(`新區域解鎖：${g ? g.name : regionId} —— 橋上的閘門開了`, 'good');
      nudge.echo('regionUnlocked', { regionId });
      audio.cue(unlockCue(regionId));
      engine.pulse(1.0);
    }
    if ((outcome.newlyUnlocked || []).length) {
      world.refreshGates();
      compass.refresh();
    }
    if (outcome.leveledUp) {
      hud.toast(`升級了！Lv.${outcome.levelAfter}`, 'good');
      nudge.echo('levelUp');
    }
  }

  /**
   * Phase 29：問一問這道門。
   * 已經開了的門不問（不管當初是考過的還是先行前往的）。
   */
  function askGate(gate) {
    if (!gate) return false;
    const status = progression.gateStatus(gate.meta.id);
    if (status.unlocked) return false;
    gateAskSnoozed = null;
    openPanel(gateAsk, gate.meta, status);
    return true;
  }

  /**
   * 先行前往：把門打開讓玩家過去。
   *
   * 開的是門，不是進度 —— 不給 XP、不收技巧、不寫任何一關的評價。
   * 所以「已通關 x / 27」「已收集 x / 68」「四廠徽章」一個數字都不會變。
   */
  function proceedThroughGate(regionId) {
    const res = progression.skipGate(regionId);
    if (!res.opened) return;
    const g = content.group(regionId);
    const name = g ? g.name : regionId;
    world.openGate(regionId, true); // 和考過時一樣的屏障淡出 ＋ 擴散光環
    world.refreshGates();
    compass.refresh();
    hud.refresh();
    // 只有石門滑開的那一聲，沒有慶祝的微光 —— 這不是你考過的門
    audio.cue('gateOpen');
    engine.pulse(1.0);
    // 刻意不說「解鎖」——你不是解開它，是它讓你先過去
    hud.toast(`${name}：門為你開了。前方的試煉不會因此變簡單。`, 'info');
    nudge.echo('regionUnlocked', { regionId });
  }

  /** 讀一則刻文小語：第一次讀給少量 XP，並把它教的那條技巧寫進圖鑑。 */
  function readInscription(ins) {
    const spec = ins.spec;
    const outcome = progression.readInscription(spec.id, spec.techniqueId, inscriptionFile.xp ?? 5);
    if (!outcome.alreadyFound) {
      world.markInscriptionFound(spec.id);
      applyWorldGain(outcome);
      checkPayoffs();
    }
    openPanel(inscriptionPanel, spec, {
      firstRead: !outcome.alreadyFound,
      xpGain: outcome.xpGain,
      newlyCollected: outcome.newlyCollected,
    });
  }

  /**
   * 撿起一頁殘頁（v1.2 · P07）。
   *
   * 第一次撿給少量 XP；有教學的那幾頁順便把技巧寫進圖鑑（純風味的什麼都不收）。
   */
  function readLetter(lt) {
    const spec = lt.spec;
    const outcome = progression.readLetter(spec.id, spec.techniqueId || null, letterFile.xp ?? 6);
    if (!outcome.alreadyFound) {
      world.markLetterFound(spec.id);
      applyWorldGain(outcome);
      checkPayoffs();
      const total = (letterFile.entries || []).length;
      const found = progression.letterCount();
      if (found >= total) {
        hud.toast(`✦ 抄寫人留下的每一頁，你都收齊了（${found} / ${total}）`, 'good');
        progression.setFlag('allLettersFound', true);
        nudge.echo('collectionFull', { what: '抄寫人的殘頁' });
      } else {
        nudge.echo('letterFound');
      }
    }
    openPanel(letterPanel, spec, {
      firstRead: !outcome.alreadyFound,
      xpGain: outcome.xpGain,
      newlyCollected: outcome.newlyCollected,
    });
  }

  /**
   * v1.2 · P16c：這一位守夜人**現在**說得出哪幾種情報，以及每一種怎麼講。
   *
   * 四種情報的算法全部在 `src/progression/watchtalk.js`（純函式，測試直接問它）；
   * 這裡只負責把答案裹成世界的話。**沒得講的那一項不會出現在選單上** ——
   * 不畫一個按不出東西的選項。
   */
  function watchmanContext(w) {
    const e = w.entry;
    const lines = watchmanFile.topics || {};
    const label = (id, fallback) => (lines[id] && lines[id].label) || fallback;
    const eyebrow = (id, fallback) => (lines[id] && lines[id].eyebrow) || fallback;

    const stuck = Watchtalk.stuckReport({
      struggles: progression.struggles(),
      isCleared: (id) => progression.isCleared(id),
      challenges: content.challenges,
      checkLines: watchmanFile.checkLines || {},
    });
    const way = Watchtalk.wayReport({
      at: e.at,
      region: e.region,
      letters: letterFile.entries || [],
      secrets: secretFile.entries || [],
      hasLetter: (id) => progression.hasFoundLetter(id),
      hasSecret: (id) => progression.hasFoundSecret(id),
    });
    const note = Watchtalk.skillNote({
      skills: catalog.regionSkills(e.region),
      knows: (id) => progression.isSkillCollected(id),
      turn: progression.watchTurn(e.id),
    });

    const topics = [];
    if (stuck) topics.push({ id: 'stuck', label: label('stuck', '我卡在一座碑前面') });
    if (way) topics.push({ id: 'way', label: label('way', '這附近還有什麼沒找到的') });
    if ((e.lore || []).length) topics.push({ id: 'lore', label: label('lore', '這片地以前是什麼樣子') });
    if (note) topics.push({ id: 'skill', label: label('skill', '說一件神諭的規矩給我聽') });

    /** 祕密的 tell（secrets.json 既有的欄位）翻成守夜人的一句話。 */
    const TELL_LINE = {
      odd: '那裡有一樣東西的顏色不對。看久一點就分得出來。',
      sound: '站定，聽一下。那裡的聲音會比眼睛先到。',
      high: '得先站到高處才搆得到。地上走過去是碰不到的。',
    };

    return {
      greet: (e.greet || []).slice(),
      topics,
      answer(topic, step) {
        if (topic === 'stuck' && stuck) {
          return {
            eyebrow: eyebrow('stuck', '卡住的地方'),
            lines: [
              `你在「${stuck.title}」那座碑前面站過 ${stuck.tries} 次了。`,
              stuck.line,
              '我不會替你寫。寫的那個人，得是你。',
            ],
          };
        }
        if (topic === 'way' && way) {
          return {
            eyebrow: eyebrow('way', '指路'),
            lines: [
              `往${way.dir}走，${way.pace}。`,
              way.kind === 'letter'
                ? '地上有一頁抄寫人留下的紙，還沒有人去撿。'
                : TELL_LINE[way.tell] || '那裡藏著一點東西。走到了你就知道。',
            ],
          };
        }
        if (topic === 'lore') {
          const beat = Watchtalk.loreBeats(e, step);
          return { eyebrow: eyebrow('lore', '舊事'), lines: [beat.line], more: beat.more };
        }
        if (topic === 'skill' && note) {
          return {
            eyebrow: eyebrow('skill', '神諭的規矩'),
            lines: ['神諭的規矩我記不了幾條。這一條我一直記著——'],
            html: skillNoteHtml(note),
          };
        }
        return { eyebrow: '', lines: ['……'] };
      },
    };
  }

  /**
   * 走近按 `E`：跟守夜人說話。
   *
   * 這一層**不給 XP、不寫任何一關的評價、不影響解鎖**（存檔只記「聊過了」與
   * 「問過哪幾種」）——他給的是情報，情報本身就是報酬。
   */
  function talkToWatchman(w) {
    audio.cue('open');
    progression.meetWatchman(w.id);
    world.markWatchmanMet(w.id);
    openPanel(watchmanPanel, w.entry, watchmanContext(w));
  }

  /**
   * 走進一個藏起來的地方（不用按 E —— 好奇心不該還要學一個鍵）。
   * 純風味：不進圖鑑、不算徽章，只給一點 XP 與一個很小的慶祝。
   */
  function findSecret(id) {
    const spec = (secretFile.entries || []).find((s) => s.id === id);
    if (!spec) return;
    const outcome = progression.findSecret(id, secretFile.xp ?? 12);
    if (outcome.alreadyFound) return;
    audio.cue(spec.blessing ? 'blessing' : 'secret');
    engine.pulse(spec.blessing ? 0.95 : 0.6);
    hud.toast(`✦ 你找到了：${spec.title}　+${outcome.xpGain} XP`, 'good');
    hud.celebrate(spec.title, 'mastery');
    applyWorldGain(outcome);
    if (spec.blessing) {
      progression.setFlag('echoBlessing', true);
      hud.toast('回聲的祝福 —— 這個標記只有走到這裡的人身上才有。', 'info');
    }
    const total = (secretFile.entries || []).length;
    const found = progression.secretCount();
    if (found >= total) {
      // 數量寫在資料裡，不要寫死在句子裡（P15 把 4 處變成 12 處，這句就自打嘴巴了）
      hud.toast(`✦ 藏起來的地方，你全都找到了（${found} / ${total}）`, 'good');
      progression.setFlag('allSecretsFound', true);
      nudge.echo('collectionFull', { what: '藏起來的地方' });
    } else {
      nudge.echo('secretFound');
    }
  }

  /**
   * 從長凳上起身。走一步也會走到這裡（不用再按一次 E）。
   * @param {boolean} [quiet] 不放起身的聲音（換一張凳子時用）
   */
  function standUp(quiet = false) {
    if (!seatedOn) return;
    seatedOn.seated = false;
    seatedOn = null;
    player.setResting(false);
    player.setCameraDistance(seatCamera || player.cameraDistance);
    if (!quiet) audio.cue('stand');
  }

  /**
   * 動一件器物（Phase 25）。
   *
   * 純風味（護欄 2）：不進圖鑑、不算徽章、不寫關卡評價 ——
   * 第一次動它給一點點 XP，之後怎麼玩都不再給（可以一直敲鑼，但不能刷分）。
   * 大部分器物只在畫面上說一句話；只有陶罐與指路石會開一個很小的窗。
   */
  function useHandle(h) {
    const spec = h.spec;
    const meta = (handleFile.kinds || {})[h.kind] || {};
    const says = meta.says || {};
    const first = !progression.hasUsedHandle(spec.id);

    // 守望石要知道「你還沒解開的那座石座在哪」—— 這是世界裡的實體指南針
    let aim = null;
    if (h.kind === 'watchstone') {
      const target = world.objectiveTarget(hud.region);
      if (target) aim = target;
    }
    const res = h.activate({ aimAt: aim }) || {};

    let outcome = null;
    if (res.complete) {
      outcome = progression.useHandle(spec.id, handleFile.xp ?? 4);
      if (!outcome.alreadyUsed) {
        world.markHandleUsed(spec.id);
        applyWorldGain(outcome);
        nudge.echo('handleUsed');
      }
    }

    audio.cue(res.sound || 'open');
    if (res.shake) engine.pulse(res.shake);

    // 坐下 / 起身：鏡頭往後退，讓畫面安靜一會兒
    if (res.pose === 'sit') {
      standUp(true);
      seatedOn = h;
      h.seated = true;
      seatCamera = player.cameraDistance;
      if (h.seat) player.teleport(h.seat.x, h.seat.z, h.seat.face);
      player.setResting(true);
      player.setCameraDistance(player.zoomRange.max);
    } else if (res.pose === 'stand') {
      seatedOn = null;
      player.setResting(false);
      player.setCameraDistance(seatCamera || player.cameraDistance);
    }

    if (res.panel) {
      openPanel(handlePanel, spec, {
        firstUse: first && Boolean(outcome) && !outcome.alreadyUsed,
        xpGain: outcome ? outcome.xpGain : 0,
      });
      return;
    }

    if (!res.toastKey) return;
    const tmpl = says[res.toastKey];
    let line;
    if (res.toastKey === 'aim') line = `${tmpl || ''}「${res.aim || ''}」。`;
    else if (res.toastKey === 'turn') line = `${tmpl || ''} ${res.left} 下。`;
    else line = tmpl || spec.line || '';
    if (!line) return;
    const gained = outcome && !outcome.alreadyUsed ? outcome.xpGain : 0;
    hud.toast(gained ? `${line}　+${gained} XP` : line, gained ? 'good' : 'info');
  }

  /** 讀一塊石碑：第一次讀給少量 XP（風味內容，不進圖鑑）。 */
  function readTablet(tablet) {
    const outcome = progression.readLore(tablet.id);
    if (!outcome.alreadyRead) {
      world.markTabletRead(tablet.id);
      hud.refresh();
      for (const regionId of outcome.newlyUnlocked) {
        const g = content.group(regionId);
        world.openGate(regionId, true);
        hud.toast(`新區域解鎖：${g ? g.name : regionId} —— 橋上的閘門開了`, 'good');
        nudge.echo('regionUnlocked', { regionId });
        audio.cue(unlockCue(regionId));
        engine.pulse(1.0);
      }
      if (outcome.newlyUnlocked.length) world.refreshGates();
      if (outcome.leveledUp) {
        hud.toast(`升級了！Lv.${outcome.levelAfter}`, 'good');
        nudge.echo('levelUp');
      } else {
        nudge.echo('tabletRead');
      }
    }
    openPanel(tabletPanel, tablet.tablet, {
      firstRead: !outcome.alreadyRead,
      xpGain: outcome.xpGain,
    });
  }

  engine.onUpdate((dt, t) => {
    // 序章進行中：先跑門檻判定（走一步 / 轉鏡頭 / 奔跑 / 走到祭壇）
    if (prologue.isActive) prologue.tick(dt);

    // 會回應的東西：走過去它就有反應（面板打開 / 序章進行中時 isBusy 自己會停手）
    // v1.2 · P15：多遞一個「腳現在在多高」—— 高處的祕密要站上高台才搆得到
    world.updateReactions(dt, t, player.position.x, player.position.z, player.position.y);

    // 區域切換：HUD、配樂、氣氛一起換（跨過一座橋要有「事件感」）
    const here = world.regionAt(player.position.x, player.position.z);
    if (here) {
      const entered = hud.setRegion(here.id, here.onBridge);
      if (entered) {
        applyMood(here.id);
        audio.setRegion(here.id);
        // v1.2 · P06：進區時刷新閘門／石座三態（低頻事件；只刷三態、不重做標籤）
        world.refreshVisualStates();
        if (!here.onBridge) {
          engine.pulse(0.55);
          const g = content.group(here.id);
          if (g) hud.toast(`進入 ${g.name} · ${g.nameEn}`, 'info');
          // v1.2 · P08：這一趟第一次走進這片土地 → 回聲說一句（之後再進來就安靜）
          if (!regionsWalked.has(here.id)) {
            regionsWalked.add(here.id);
            nudge.echo('regionEntered');
          }
        }
      }
    }

    // 指南針：每幀跟著鏡頭轉；面板打開時收起來（和 HUD 其他元素一致）
    compass.setVisible(!anyPanelOpen());
    compass.update(dt);
    // 導航提示：太久沒往目標靠近就在上方說一句（自己會處理面板／序章的例外）
    nudge.update(dt);

    // 引導課程進行中不接受世界互動 —— 一次只教一件事，不讓石座來搶注意力
    // 坐在長凳上又走了一步 → 自己站起來（不用再按一次 E）
    if (seatedOn && player.speed > 0.25) standUp();

    if (anyPanelOpen() || prologue.isActive) {
      hud.setInteract(null);
      nearMarker = null;
      nearTablet = null;
      nearInscription = null;
      nearLetter = null;
      nearHandle = null;
      nearMurk = null;
      nearWatchman = null;
      nearGate = null;
      return;
    }
    const hitMarker = world.nearestMarker(player.position);
    // 石碑與刻文一定要問（它們自己會維護「走近發光」的狀態），但石座優先搶 E 鍵
    const hitTablet = world.nearestTablet(player.position);
    const hitInscription = world.nearestInscription(player.position);
    // v1.2 · P07：殘頁（半徑 3.8）—— 排在刻文小語之後、器物之前
    const hitLetter = world.nearestLetter(player.position);
    /*
     * 器物擺得比其他層密，兩件同時進入 3.2 公尺是會發生的事。
     * 純比距離的話，「站在中間」就由零點幾公尺的差距決定按到哪一個 ——
     * 玩家看的是他**面向哪裡**。所以把鏡頭的水平前方向一起交出去排名。
     */
    camForward.x = Math.sin(player.cameraYaw);
    camForward.z = Math.cos(player.cameraYaw);
    const hitHandle = world.nearestHandle(player.position, undefined, camForward);
    // v1.2 · P01：濁靈（半徑 5.5）—— 石座讓它、它讓石碑以下的每一層
    const hitMurk = world.nearestMurk(player.position, undefined, camForward);
    /*
     * v1.2 · P16c：守夜人（半徑 4.6）—— **與石碑同一階**，由仲裁順序排在石碑之前
     * （同半徑靠仲裁分先後是既有的文法：刻文小語與殘頁也都是 3.8）。
     * 兩位同時在範圍內時照器物那一套用「面向」排名，不是純距離。
     */
    const hitWatchman = world.nearestWatchman(player.position, undefined, camForward);
    const blocked = Boolean(hitMarker || hitMurk || hitWatchman || hitTablet || hitInscription || hitLetter);
    const hitGate = blocked || hitHandle ? null : world.nearestGate(player.position);
    nearMarker = hitMarker ? hitMarker.marker : null;
    nearMurk = !hitMarker && hitMurk ? hitMurk.murk : null;
    nearWatchman = !hitMarker && !hitMurk && hitWatchman ? hitWatchman.watchman : null;
    nearTablet = !hitMarker && !hitMurk && !hitWatchman && hitTablet ? hitTablet.tablet : null;
    nearInscription =
      !hitMarker && !hitMurk && !hitWatchman && !hitTablet && hitInscription ? hitInscription.inscription : null;
    nearLetter =
      !hitMarker && !hitMurk && !hitWatchman && !hitTablet && !hitInscription && hitLetter ? hitLetter.letter : null;
    nearHandle = !blocked && hitHandle ? hitHandle.handle : null;
    nearGate = hitGate ? hitGate.gate : null;

    /*
     * Phase 29：走到門前，門自己會問。
     * 不用學一個鍵、不用猜條件 —— 撞上去就知道自己有得選。
     * 選了「先留下修行」之後要走遠一點（離開互動半徑）才會再問一次。
     */
    if (!nearGate || nearGate.id !== gateAskSnoozed) gateAskSnoozed = null;
    if (
      nearGate &&
      hitGate.distance <= GATE_ASK_RADIUS &&
      nearGate.id !== gateAskSnoozed &&
      !progression.gateStatus(nearGate.meta.id).unlocked
    ) {
      askGate(nearGate);
      return;
    }

    if (nearMarker) {
      const best = progression.bestGrade(nearMarker.challenge.id);
      hud.setInteract(
        `<b>${nearMarker.challenge.title}</b><span>${nearMarker.challenge.npc}${
          best ? ` · 最佳 ${best}` : ''
        }</span><kbd>E</kbd> 互動`
      );
    } else if (nearMurk) {
      // 標題 ＋ 一句狀態 ＋ E ＋ 動詞（WORLD.md §3.1）
      // 副標用牠自己的名字（含糊的請求／只說不要的請求…），不是寫死的一句
      hud.setInteract(`<b>濁靈</b><span>${esc(nearMurk.entry.title)}</span><kbd>E</kbd> 安撫`);
    } else if (nearWatchman) {
      // 標題 ＋ 一句狀態 ＋ E ＋ 動詞（WORLD.md §3.1）
      const met = progression.hasMetWatchman(nearWatchman.id);
      hud.setInteract(
        `<b>${esc(nearWatchman.entry.name)}</b><span>${
          met ? esc(nearWatchman.entry.post) : '一個提著燈站在那裡的人'
        }</span><kbd>E</kbd> 說話`
      );
    } else if (nearTablet) {
      const seen = progression.hasReadLore(nearTablet.id);
      hud.setInteract(
        `<b>${nearTablet.tablet.title}</b><span>${
          seen ? '讀過的碑文' : '一塊還沒讀過的碑'
        }</span><kbd>E</kbd> 閱讀`
      );
    } else if (nearInscription) {
      const seen = progression.hasFoundInscription(nearInscription.id);
      hud.setInteract(
        `<b>${nearInscription.spec.title}</b><span>${
          seen ? '讀過的刻文' : '有人在這裡刻了一句話'
        }</span><kbd>E</kbd> 看一眼`
      );
    } else if (nearLetter) {
      const seen = progression.hasFoundLetter(nearLetter.id);
      hud.setInteract(
        `<b>${esc(nearLetter.spec.title)}</b><span>${
          seen ? '收過的殘頁' : '抄寫人留下的一頁'
        }</span><kbd>E</kbd> 撿起來`
      );
    } else if (nearHandle) {
      const kindMeta = (handleFile.kinds || {})[nearHandle.kind] || {};
      const done = progression.hasUsedHandle(nearHandle.spec.id);
      const sitting = seatedOn === nearHandle;
      let status = done ? kindMeta.done : kindMeta.idle;
      // 絞盤：推到一半的時候直接告訴你還差幾下（不用猜）
      if (nearHandle.kind === 'capstan' && !done && nearHandle.remaining < CAPSTAN_TURNS) {
        status = `還要再推 ${nearHandle.remaining} 下`;
      }
      if (sitting) status = '坐著，看一會兒';
      const verb = sitting ? '起身' : done ? HANDLE_VERBS_USED[nearHandle.kind] : HANDLE_VERBS[nearHandle.kind];
      hud.setInteract(
        `<b>${nearHandle.spec.title}</b><span>${status || HANDLE_KINDS[nearHandle.kind] || ''}</span><kbd>E</kbd> ${verb}`
      );
    } else if (nearGate) {
      const status = progression.gateStatus(nearGate.meta.id);
      hud.setInteract(
        `<b>${nearGate.meta.name} · ${nearGate.meta.nameEn}</b><span>${
          status.unlocked ? '閘門已開啟 —— 沿著橋往前走' : status.text
        }</span>${status.unlocked ? '' : '<kbd>E</kbd> 問問這道門'}`
      );
    } else {
      hud.setInteract(null);
    }
  });

  /* --- 鍵盤快捷 --- */
  window.addEventListener('keydown', (e) => {
    const typing =
      e.target &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);

    if (e.key === 'Escape') {
      // 操作一覽與分享卡是疊在最上面那兩層，Escape 一定先關它們
      if (keyhelp.isOpen) keyhelp.close();
      else if (shareCard.isOpen) shareCard.close();
      else if (practice.isOpen) practice.close();
      else if (promptConsole.isOpen) promptConsole.close();
      else if (codex.isOpen) codex.close();
      else if (settings.isOpen) settings.close();
      else if (finale.isOpen) finale.close();
      else if (tabletPanel.isOpen) tabletPanel.close();
      else if (inscriptionPanel.isOpen) inscriptionPanel.close();
      else if (letterPanel.isOpen) letterPanel.close();
      else if (watchmanPanel.isOpen) watchmanPanel.close();
      else if (gateAsk.isOpen) gateAsk.close();
      else if (handlePanel.isOpen) handlePanel.close();
      return;
    }
    /*
     * `?`（Shift + /）：操作一覽。
     * 讀題讀到一半也叫得出來（疊在上面，不會把關卡收掉），
     * 但打字的時候絕不攔 —— 玩家可能正要打一個問號。
     */
    if (!typing && (e.key === '?' || (e.key === '/' && e.shiftKey))) {
      e.preventDefault();
      toggleKeyHelp();
      return;
    }
    // F3：效能監視器。它是診斷用的，所以面板打開時、打字時都照樣切得動。
    if (e.code === 'F3') {
      e.preventDefault();
      const on = perfmon.toggle();
      progression.updateSettings({ perfMonitor: on });
      settings.refresh();
      return;
    }

    if (typing || anyPanelOpen()) return;

    if (e.code === 'KeyE' && nearMarker) {
      e.preventDefault();
      audio.cue('open');
      openPanel(promptConsole, nearMarker.challenge);
    } else if (e.code === 'KeyE' && nearMurk) {
      e.preventDefault();
      audio.cue('open');
      openPanel(promptConsole, murkChallenge(nearMurk));
    } else if (e.code === 'KeyE' && nearWatchman) {
      e.preventDefault();
      talkToWatchman(nearWatchman);
    } else if (e.code === 'KeyE' && nearTablet) {
      e.preventDefault();
      readTablet(nearTablet);
    } else if (e.code === 'KeyE' && nearInscription) {
      e.preventDefault();
      // 刻文小語用祭壇的那一聲（和起始祭壇同一個聲音世界），不是翻頁
      audio.cue('shrine');
      readInscription(nearInscription);
    } else if (e.code === 'KeyE' && nearLetter) {
      e.preventDefault();
      // 撿起一頁紙：翻頁的那一聲（和刻文小語的祭壇聲分得開）
      audio.cue('open');
      readLetter(nearLetter);
    } else if (e.code === 'KeyE' && nearHandle) {
      e.preventDefault();
      useHandle(nearHandle);
    } else if (e.code === 'KeyE' && nearGate) {
      e.preventDefault();
      const status = progression.gateStatus(nearGate.meta.id);
      // 還沒開的門：問一次「要不要先行前往」。已經開了的門只回一句話。
      if (!status.unlocked) askGate(nearGate);
      else hud.toast(`${nearGate.meta.name}：閘門已開啟，沿著橋往前走。`, 'info');
    } else if (e.code === 'KeyC') {
      openPanel(codex);
    } else if (e.code === 'KeyO') {
      openPanel(settings);
    }
  });

  /* --- 啟動 --- */
  hud.refresh();
  engine.start();
  player.setInputEnabled(false);

  /*
   * Phase 33 · 開機的岔路：
   *
   *   audio.titleIntro() 試著讓開場曲直接響起來。
   *     ├─ 同步就 running（返客／--autoplay-policy 放行的測試環境）
   *     │    → 零摩擦：直接開標題卡，揭示與音樂本來就同時發生。
   *     └─ 被凍住（首次造訪的預設政策）
   *          → 先出一道入場門（近乎全黑，只有一枚印記與一句話）。
   *            同時再非同步探測一次（有些瀏覽器的 resume 慢一拍才成功）——
   *            探到 running 就在玩家看見門的內容之前把它撤掉（門的內容延遲 0.3s 才浮出）。
   *            真的被擋住 → 等玩家推開門，那一下手勢解鎖音訊，門淡出，標題卡接手。
   */
  audio.titleIntro();
  if (audio.isRunning()) {
    title.open();
  } else {
    entryGate.open();
    audio.whenRunning(220).then((running) => {
      if (running) entryGate.skip();
    });
  }

  // 除錯 / 自動化測試用的把手（純讀寫遊戲狀態，沒有任何外部連線）
  window.__promptasy = {
    content,
    progression,
    world,
    player,
    engine,
    audio,
    hud,
    compass,
    nudge,
    shareCard,
    ranks: ranksFile,
    rank: () => rankFor(rankStats(progression, catalog), ranksFile.ranks),
    perfmon,
    keyhelp,
    toggleKeyHelp,
    /** Phase 35：術語小卡（測試 / 除錯用）。 */
    glossary,
    title,
    entryGate,
    /** Phase 34：開場黑幕（測試 / 除錯用）。 */
    bootCover: () => document.getElementById('bootcover'),
    liftBootCover,
    intro,
    prologue,
    prologueContent,
    practice,
    promptConsole,
    codex,
    settings,
    finale,
    tabletPanel,
    inscriptionPanel,
    inscriptionData: inscriptionFile,
    /** v1.2 · P07：殘頁的小窗與資料（測試 / 除錯用）。 */
    letterPanel,
    letterData: letterFile,
    /** v1.2 · P16c：守夜人的小窗與資料（測試 / 除錯用）。 */
    watchmanPanel,
    watchmanData: watchmanFile,
    /** v1.2 · P16c：這一位守夜人現在說得出哪幾種情報（測試用：沒得講的不出現）。 */
    watchmanTopics: (id) => {
      const w = world.watchmen.byId(id);
      return w ? watchmanContext(w).topics.map((t) => t.id) : null;
    },
    /** v1.2 · P16c：他現在會指哪一關（測試用：卡關提示讀不讀得到失敗紀錄）。 */
    watchmanStuck: () =>
      Watchtalk.stuckReport({
        struggles: progression.struggles(),
        isCleared: (id) => progression.isCleared(id),
        challenges: content.challenges,
        checkLines: watchmanFile.checkLines || {},
      }),
    gateAsk,
    /** Phase 29：走到門前問一次（測試 / 除錯用）。 */
    askGate: (regionId) => askGate(world.gates.find((g) => g.id === regionId)),
    secretData: secretFile,
    handlePanel,
    handleData: handleFile,
    handleKinds: HANDLE_KINDS,
    /** v1.2 · P01：濁靈資料與「組成 challenge 形物件」的把手（測試 / 除錯用）。 */
    murks: murkFile,
    murkChallenge: (id) => {
      const m = world.murks.byId(id);
      return m ? murkChallenge(m) : null;
    },
    /** v1.2 · P03：最近一次 onRubricHits 回呼的資料（測試用：契約四鍵、murk／非 murk 差量）。 */
    rubricHits: () => lastRubricHits,
    /** v1.2 · P10b：解法的內建分布（測試／除錯用：查得到每一關的參考解答分布）。 */
    solutionStats,
    /** v1.2 · P02：目前稱號 id（測試用：驗濁靈不動稱號）。 */
    rankNow: () => rankFor(rankStats(progression, catalog), ranksFile.ranks).rank.id,
    /** v1.2 · P02：安撫過的濁靈數 —— 只數 murks.json 裡真的有的那幾隻（圖鑑第四列用的同一個數）。 */
    murkCount: () => progression.murkCount(MURK_IDS),
    /** 目前坐在哪一張長凳上（測試用）。 */
    seatedOn: () => (seatedOn ? seatedOn.id : null),
    /** 課程 v2 的 runtime catalog（測試用：所有「x / y」都該從這裡推導）。 */
    catalog,
    /** v1.2 · P05：目前的時辰 `{ index, p, forced }`（forced ＝ engine.forceHour 的覆寫值或 null）。 */
    hour: () => hourNow(),
    /** v1.2 · P05：重組一次氛圍（區域色盤 × 時辰；`{force:true}` 跳過同值略過）—— 測試用。 */
    applyMood: (opts) => applyMood(moodRegion, opts),
    /** v1.2 · P06：區域色彩腳本（測試用：sky/key/rim/particle 與 atmosphere 同形）。 */
    colorScriptFor,
  };
  /**
   * 改名前的舊名字（PromptArcade）。留成別名 —— 外面若有人寫了書籤小工具
   * 或自己的測試腳本，不會因為改名就整個壞掉。
   */
  window.__promptarcade = window.__promptasy;

  console.info(
    `[Promptasy] 世界就緒 — ${content.challenges.length} 個關卡 / ${
      catalog.counts.techniques
    } 條技巧 / ${world.gates.length} 道閘門 / Lv.${progression.levelInfo().level}`
  );
}

boot();

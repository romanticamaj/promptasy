/**
 * PromptArcade — 進入點
 *
 * Phase 4（M4 美術與氛圍 ＋ M5 音樂與手感）：
 *   標題卡 → 3D 世界（星空 / 極光 / 貼地霧 / 光柱）→ 走到石座 → 按 E →
 *   Prompt 主控台 → 離線 rubric 評分 → 教學回饋（含官方出處）→
 *   XP / 等級 / 圖鑑 / 徽章 / S-A-B-C → localStorage 存檔。
 *   跨區時：配樂交叉淡入淡出 ＋ 霧色 / 色偏 / 光強平滑漂移。
 */
import curriculum from './data/curriculum.json';
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
import datedFile from './data/dated-notes.json';
import './styles.css';

import { createEngine } from './engine/engine.js';
import { createWorld, atmosphereFor } from './world/world.js';
import { createPlayer } from './player/player.js';
import { createContent } from './challenges/content.js';
import { createPrologueContent } from './challenges/prologue.js';
import { createProgression } from './progression/progression.js';
import { createPromptConsole } from './prompt/console.js';
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
import { createHandlePanel } from './ui/handle.js';
import { HANDLE_VERBS, HANDLE_VERBS_USED, HANDLE_KINDS, CAPSTAN_TURNS } from './world/handles.js';

/** 鏡頭的水平前方向。提到模組層重複使用 —— 每幀迴圈裡不配置記憶體（WORLD.md §6.2）。 */
const camForward = { x: 0, z: 1 };
import { createTitle } from './ui/title.js';
import { createKeyHelp } from './ui/keyhelp.js';
import { createAchievement } from './ui/achievement.js';
import { createAudio } from './audio/audio.js';

function boot() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  app.innerHTML = '';

  const content = createContent(
    curriculum,
    challengeFile,
    builderZh,
    coachFile,
    flowFile,
    curriculumZh,
    datedFile
  );
  // 序章的教學內容：只引用 curriculum 既有的技巧與弱→強對照（逐字，附官方出處）
  const prologueContent = createPrologueContent(prologueFile, curriculum, curriculumZh);
  const progression = createProgression({ curriculum, challenges: content.challenges });
  const quality = progression.state.settings.quality === 'low' ? 'low' : 'high';

  /* --- 3D 場景 --- */
  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const engine = createEngine({ container: stage, quality });
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
    challenges: content.challenges,
    progression,
    quality,
    shrine: prologueContent.shrine,
    inscriptions: inscriptionFile.entries || [],
    secrets: secretFile.entries || [],
    handles: handleFile.entries || [],
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
  });

  // 開場先把氣氛設成起始區的樣子（不用等第一次跨區）
  engine.setMood(atmosphereFor('foundations'));

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
    }

    const achievement = progression.hiddenAchievement();
    if (achievement.complete && !progression.state.flags.finaleSeen) {
      progression.setFlag('finaleSeen', true);
      hud.toast('✦ 隱藏成就：68 條技巧全數收集，四廠徽章全數點亮', 'good');
      hud.celebrate('68 / 68 · 全數收集', 'finale');
      engine.pulse(1.2);
      setTimeout(() => openPanel(finale), 900);
    }
  }

  const promptConsole = createPromptConsole({
    content,
    progression,
    onSubmit: () => audio.cue('submit'),
    // 即時預檢又點亮一項時的輕響（Phase 9 的「方向是對的」回饋）
    onChime: () => audio.cue('spark'),
    // Phase 11 石碑刻印：刻上一段 / 石碑不收 / 刻滿了
    onCarve: () => {
      audio.cue('stamp');
      engine.pulse(0.28);
    },
    onReject: () => audio.cue('reject'),
    onSeal: () => {
      audio.cue('seal');
      engine.pulse(0.45);
    },
    onShare: (opts) => openShare(opts),
    onResult: ({ challenge, evaluation, outcome }) => {
      hud.refresh();
      if (evaluation.passed) {
        audio.cue('pass', { grade: evaluation.grade });
        player.celebrate?.(); // 旅人舉手歡呼一下（1.2 秒後自己收回去）
        const marker = world.markers.find((m) => m.id === challenge.id);
        if (marker) marker.setCleared(progression.bestGrade(challenge.id));
        if (evaluation.grade === 'S') hud.celebrate('S · 完美', 's');
        if (outcome.leveledUp) {
          hud.toast(`升級了！Lv.${outcome.levelAfter}`, 'good');
          engine.pulse(0.7);
        }
        for (const regionId of outcome.newlyUnlocked) {
          const g = content.group(regionId);
          world.openGate(regionId, true);
          hud.toast(`新區域解鎖：${g ? g.name : regionId} —— 橋上的閘門開了`, 'good');
          // 解鎖當下立刻在畫面上方說一次「○○ 已開啟，往前走吧」（不受冷卻限制）
          nudge.announceUnlock(regionId);
          audio.cue('unlock');
          engine.pulse(1.0);
        }
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
    getRank: () => rankFor(rankStats(progression, curriculum), ranksFile.ranks),
    inscriptionTotal: (inscriptionFile.entries || []).length,
    secretTotal: (secretFile.entries || []).length,
    handleTotal: (handleFile.entries || []).length,
  });
  ui.appendChild(codex.root);

  const settings = createSettings({
    content,
    progression,
    audio,
    onClose: () => closePanel(),
    onReset: () => {
      hud.refresh();
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

  /* --- 開場標題卡（同時是 AudioContext 需要的使用者手勢） --- */
  const title = createTitle({
    onStart: () => {
      audio.start();
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

  /* --- 面板開關：打字時角色不能動 --- */
  let openedPanel = null;
  function openPanel(panel, ...args) {
    if (openedPanel && openedPanel !== panel) openedPanel.close();
    openedPanel = panel;
    // 打開任何面板都代表「玩家沒有迷路」→ 導航提示的閒置計時歸零
    nudge.noteActivity();
    player.setInputEnabled(false);
    if (panel === codex) audio.cue('codex');
    // 器物的小窗自己會放那件東西的聲音（掀蓋 / 敲木牌），不要再疊一聲通用的開窗音
    else if (panel !== promptConsole && panel !== handlePanel) audio.cue('open');
    panel.open(...args);
  }
  function closePanel() {
    openedPanel = null;
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
    handlePanel.isOpen ||
    practice.isOpen ||
    title.isOpen;

  /* --- 互動迴圈：偵測最近的石座 / 石碑 / 閘門，以及玩家目前在哪一區 --- */
  let nearMarker = null;
  let nearGate = null;
  let nearTablet = null;
  let nearInscription = null;
  /** Phase 25：走近的器物（陶罐 / 火盆 / 響石 / 守望石 / 撈月池 / 指路石 / 絞盤 / 長凳）。 */
  let nearHandle = null;
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
      nudge.announceUnlock(regionId);
      audio.cue('unlock');
      engine.pulse(1.0);
    }
    if ((outcome.newlyUnlocked || []).length) {
      world.refreshGates();
      compass.refresh();
    }
    if (outcome.leveledUp) hud.toast(`升級了！Lv.${outcome.levelAfter}`, 'good');
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
      hud.toast(`✦ 四個藏起來的地方，你全都找到了（${found} / ${total}）`, 'good');
      progression.setFlag('allSecretsFound', true);
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
        nudge.announceUnlock(regionId);
        audio.cue('unlock');
        engine.pulse(1.0);
      }
      if (outcome.newlyUnlocked.length) world.refreshGates();
      if (outcome.leveledUp) hud.toast(`升級了！Lv.${outcome.levelAfter}`, 'good');
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
    world.updateReactions(dt, t, player.position.x, player.position.z);

    // 區域切換：HUD、配樂、氣氛一起換（跨過一座橋要有「事件感」）
    const here = world.regionAt(player.position.x, player.position.z);
    if (here) {
      const entered = hud.setRegion(here.id, here.onBridge);
      if (entered) {
        engine.setMood(atmosphereFor(here.id));
        audio.setRegion(here.id);
        if (!here.onBridge) {
          engine.pulse(0.55);
          const g = content.group(here.id);
          if (g) hud.toast(`進入 ${g.name} · ${g.nameEn}`, 'info');
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
      nearHandle = null;
      nearGate = null;
      return;
    }
    const hitMarker = world.nearestMarker(player.position);
    // 石碑與刻文一定要問（它們自己會維護「走近發光」的狀態），但石座優先搶 E 鍵
    const hitTablet = world.nearestTablet(player.position);
    const hitInscription = world.nearestInscription(player.position);
    /*
     * 器物擺得比其他層密，兩件同時進入 3.2 公尺是會發生的事。
     * 純比距離的話，「站在中間」就由零點幾公尺的差距決定按到哪一個 ——
     * 玩家看的是他**面向哪裡**。所以把鏡頭的水平前方向一起交出去排名。
     */
    camForward.x = Math.sin(player.cameraYaw);
    camForward.z = Math.cos(player.cameraYaw);
    const hitHandle = world.nearestHandle(player.position, undefined, camForward);
    const blocked = Boolean(hitMarker || hitTablet || hitInscription);
    const hitGate = blocked || hitHandle ? null : world.nearestGate(player.position);
    nearMarker = hitMarker ? hitMarker.marker : null;
    nearTablet = !hitMarker && hitTablet ? hitTablet.tablet : null;
    nearInscription = !hitMarker && !hitTablet && hitInscription ? hitInscription.inscription : null;
    nearHandle = !blocked && hitHandle ? hitHandle.handle : null;
    nearGate = hitGate ? hitGate.gate : null;

    if (nearMarker) {
      const best = progression.bestGrade(nearMarker.challenge.id);
      hud.setInteract(
        `<b>${nearMarker.challenge.title}</b><span>${nearMarker.challenge.npc}${
          best ? ` · 最佳 ${best}` : ''
        }</span><kbd>E</kbd> 互動`
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
        }</span>`
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
    } else if (e.code === 'KeyE' && nearTablet) {
      e.preventDefault();
      readTablet(nearTablet);
    } else if (e.code === 'KeyE' && nearInscription) {
      e.preventDefault();
      audio.cue('open');
      readInscription(nearInscription);
    } else if (e.code === 'KeyE' && nearHandle) {
      e.preventDefault();
      useHandle(nearHandle);
    } else if (e.code === 'KeyE' && nearGate) {
      const status = progression.gateStatus(nearGate.meta.id);
      hud.toast(
        status.unlocked
          ? `${nearGate.meta.name}：閘門已開啟，沿著橋往前走。`
          : `${nearGate.meta.name}：${status.text}。`,
        status.unlocked ? 'info' : 'warn'
      );
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
  title.open();

  // 除錯 / 自動化測試用的把手（純讀寫遊戲狀態，沒有任何外部連線）
  window.__promptarcade = {
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
    rank: () => rankFor(rankStats(progression, curriculum), ranksFile.ranks),
    perfmon,
    keyhelp,
    toggleKeyHelp,
    title,
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
    secretData: secretFile,
    handlePanel,
    handleData: handleFile,
    handleKinds: HANDLE_KINDS,
    /** 目前坐在哪一張長凳上（測試用）。 */
    seatedOn: () => (seatedOn ? seatedOn.id : null),
  };

  console.info(
    `[PromptArcade] 世界就緒 — ${content.challenges.length} 個關卡 / ${
      (curriculum.techniques || []).length
    } 條技巧 / ${world.gates.length} 道閘門 / Lv.${progression.levelInfo().level}`
  );
}

boot();

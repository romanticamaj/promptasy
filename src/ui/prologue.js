/**
 * PromptArcade — 序章「喚醒神諭」（引導課程）
 *
 * Phase 13：改用與正式關卡同一套「導演語言」（Phase 12 的四幕分鏡）。
 *
 *   · 一拍只有一個焦點：回聲說話 → 你做一件事 → 回聲回一句 → 切下一拍
 *   · 一拍最多兩句，逐句浮出來（.reveal .d1 / .d2），不是一次倒一牆字
 *   · 換拍像鏡頭切換：整張卡片切掉再重播進場動畫（跟第二幕→第三幕同一手）
 *   · 移動 / 鏡頭 / 奔跑 / 走到祭壇的門檻仍然要**真的做到**才過（teach by doing）
 *   · 三堂課用的是正式關卡的石碑刻印（見 ../prompt/practice.js）——
 *     序章教的互動，就是之後一路會用到的互動
 *   · 每一課結束後回聲補一句短的過場（bridge），再切到下一拍
 *   · 隨時可跳過、之後可從設定重看 —— 教學不該變成牢籠
 *
 * 這一層只管「節奏與門檻」；教學內容一律來自 curriculum.json（見 challenges/prologue.js），
 * 評分一律走離線 rubric 引擎（見 challenges/rubric.js）。
 */
import { el, esc } from './dom.js';

/** 各種門檻的判定參數。 */
const GATE = {
  moveDistance: 3.2, // 走這麼多公尺就算「會走了」
  cameraTurn: 0.55, // 鏡頭轉過這麼多弧度（約 31°）
  cameraPitch: 0.3, // 或者抬頭抬過這麼多弧度（約 17°）—— 抬頭看天空也算「轉過鏡頭」
  runSpeed: 13.0, // 走路上限 11.5、奔跑上限 20.1 → 超過就是真的在跑
};

export function createPrologue({
  prologue,
  progression,
  player,
  world,
  practice,
  hud = null,
  audio = null,
  engine = null,
  onFinish = null,
  onSkip = null,
  onPracticeOpen = null,
  onPracticeClose = null,
}) {
  const beats = prologue.beats;
  const root = el('div', 'echo');
  root.hidden = true;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', `${prologue.title}（引導課程）`);
  root.innerHTML = `
    <div class="echo__card" data-card>
      <p class="echo__eyebrow">
        <span class="echo__who">${esc(prologue.title)}</span>
        <span class="echo__step" data-step></span>
      </p>
      <div class="echo__lines" data-lines></div>
      <p class="echo__objective" data-objective hidden>
        <span class="echo__pip" aria-hidden="true"></span><span data-objtext></span>
      </p>
      <p class="echo__note" data-note hidden></p>
      <div class="echo__actions">
        <button class="echo__skip" data-skip type="button">跳過引導</button>
        <span class="spacer"></span>
        <span class="echo__key" data-key hidden><kbd>Enter</kbd></span>
        <button class="btn btn--primary echo__cta" data-cta type="button" hidden></button>
      </div>
      <div class="echo__confirm" data-confirm hidden>
        <p>要跳過引導課程嗎？之後可以在設定裡「重看引導課程」。</p>
        <div class="echo__confirm-actions">
          <button class="btn btn--ghost" data-confirm-no type="button">繼續學</button>
          <button class="btn btn--danger" data-confirm-yes type="button">確定跳過</button>
        </div>
      </div>
    </div>
  `;

  const cardEl = root.querySelector('[data-card]');
  const stepEl = root.querySelector('[data-step]');
  const linesEl = root.querySelector('[data-lines]');
  const objectiveEl = root.querySelector('[data-objective]');
  const objectiveTextEl = root.querySelector('[data-objtext]');
  const noteEl = root.querySelector('[data-note]');
  const ctaEl = root.querySelector('[data-cta]');
  const keyEl = root.querySelector('[data-key]');
  const confirmEl = root.querySelector('[data-confirm]');

  let active = false;
  let index = 0;
  let armed = false; // 門檻是否已開始判定
  let gateDone = false;
  let waitingResume = false; // 練習被 Esc 收起來了，等玩家按「繼續練習」
  /**
   * 開場那一下按鍵不算「繼續」。
   *
   * 標題卡是在 **capture** 階段接住任意鍵的，接住之後才把序章打開；
   * 同一顆 keydown 接著會冒泡到這裡 —— 少了這道閘，玩家「按 Enter 開始遊戲」
   * 會連第一拍一起跳掉（Phase 13 之後一顆 Enter ＝ 一整拍，跳掉就看不到了）。
   */
  let keysArmed = false;
  /** 練習拍的三個階段：lead（回聲宣布）→ carve（石碑開著）→ bridge（回聲的過場）。 */
  let phase = 'lead';

  // 門檻的量測狀態
  let travelled = 0;
  let lastPos = { x: 0, z: 0 };
  let yawRef = 0;
  let yawTurned = 0;

  const beat = () => beats[index] || null;
  const practiceBeats = beats.filter((b) => b.kind === 'practice');

  /* ---------------------------------------------------------------- 畫面 */

  /** 這一拍現在要說的那幾句話（練習拍在過場時換成 bridge）。 */
  function currentLines() {
    const b = beat();
    if (!b) return [];
    if (b.kind === 'practice' && phase === 'bridge') return b.bridge || [];
    return b.lines || [];
  }

  /**
   * 畫一拍。
   *
   * 每次重畫都把台詞整組換掉並重播進場動畫 —— 這就是「鏡頭切換」的那一下；
   * 每一句掛 .d1 / .d2，依序浮出來（跟主控台的四幕同一種節奏）。
   */
  function paint({ cut = true } = {}) {
    const b = beat();
    if (!b) return;
    stepEl.textContent = `${b.step} / ${String(beats.length).padStart(2, '0')}`;

    const lines = currentLines();
    linesEl.innerHTML = lines
      .map((line, i) => `<p class="echo__line reveal d${i + 1}">${esc(line)}</p>`)
      .join('');
    if (gateDone && b.done) {
      linesEl.innerHTML = `<p class="echo__line echo__line--done reveal d1">${esc(b.done)}</p>`;
    }
    if (cut) {
      // 重新觸發卡片的進場動畫（有人在對你說話的那一下）
      cardEl.classList.remove('is-cut');
      void cardEl.offsetWidth;
      cardEl.classList.add('is-cut');
    }

    const showObjective = b.kind === 'gate' && armed && !gateDone;
    objectiveEl.hidden = !showObjective;
    if (showObjective) objectiveTextEl.textContent = b.objective || '';
    objectiveEl.classList.toggle('is-done', gateDone);

    // 畢業拍的那條小提示（圖鑑在哪裡）—— 不佔台詞，但看得見
    const note = b.kind === 'finish' && b.hint ? b.hint : '';
    noteEl.hidden = !note;
    noteEl.textContent = note;

    let cta = null;
    if (b.kind === 'say') cta = b.cta || '繼續 ↵';
    else if (b.kind === 'gate') cta = gateDone ? '繼續 ↵' : null;
    else if (b.kind === 'finish') cta = b.cta || '開始探索';
    else if (b.kind === 'practice') {
      if (phase === 'lead') cta = b.cta || '走向石碑';
      else if (phase === 'bridge') cta = '繼續 ↵';
      else cta = waitingResume ? '繼續練習 ↵' : null;
    }

    ctaEl.hidden = !cta;
    keyEl.hidden = !cta;
    if (cta) ctaEl.textContent = cta;
  }

  /* ------------------------------------------------------------ 流程控制 */

  function enter(i) {
    index = Math.max(0, Math.min(i, beats.length - 1));
    gateDone = false;
    armed = false;
    waitingResume = false;
    phase = 'lead';
    const b = beat();
    if (!b) return;

    if (b.kind === 'gate') {
      travelled = 0;
      lastPos = { x: player.position.x, z: player.position.z };
      yawRef = player.cameraYaw;
      yawTurned = 0;
      // 台詞和門檻同時上：想動的人可以馬上動，不必等對白說完
      armed = true;
    }
    if (b.kind === 'finish') graduate();
    paint();
  }

  function advance() {
    const b = beat();
    if (!b) return;

    if (b.kind === 'gate' && !gateDone) return; // 門檻沒過，說完話也不能往前
    if (b.kind === 'practice') {
      if (phase === 'lead') {
        openPractice(b);
        return;
      }
      if (phase === 'carve') {
        if (waitingResume) {
          waitingResume = false;
          openPractice(b);
        }
        return;
      }
      // phase === 'bridge' → 往下一拍
    }
    if (b.kind === 'finish') {
      finish({ skipped: false });
      return;
    }
    if (index >= beats.length - 1) {
      finish({ skipped: false });
      return;
    }
    audio?.cue?.('close');
    enter(index + 1);
  }

  /** 門檻達成：換一句「做到了」，然後等玩家按繼續。 */
  function passGate() {
    const b = beat();
    if (!b || gateDone) return;
    gateDone = true;
    armed = false;
    objectiveEl.classList.add('is-done');
    audio?.cue?.('unlock');
    engine?.pulse?.(0.35);
    paint();
  }

  function openPractice(b) {
    const step = prologue.step(b.stepId);
    if (!step) {
      enter(index + 1);
      return;
    }
    phase = 'carve';
    waitingResume = false;
    const order = practiceBeats.findIndex((p) => p.id === b.id) + 1;
    // 練習台是 modal —— 字幕條先退場，畫面上一次只有一個焦點
    root.classList.add('is-veiled');
    onPracticeOpen?.();
    practice.open(step, { index: Math.max(1, order), total: practiceBeats.length });
    paint({ cut: false });
  }

  /**
   * 這一課刻完了 → 收起石碑，回聲補一句短的過場。
   * 沒有 bridge 的資料就直接切下一拍（不讓玩家多按一次沒有內容的按鈕）。
   */
  function practiceDone() {
    root.classList.remove('is-veiled');
    practice.close();
    onPracticeClose?.();
    const b = beat();
    const bridge = b && b.kind === 'practice' ? b.bridge || [] : [];
    if (bridge.length) {
      phase = 'bridge';
      paint();
      focusCta();
      return;
    }
    if (index >= beats.length - 1) {
      finish({ skipped: false });
      return;
    }
    enter(index + 1);
  }

  /** 練習被收起來（Esc / 關閉鈕）→ 留在同一拍，讓玩家自己按「繼續練習」。 */
  function practiceDismissed() {
    if (!active) return;
    const b = beat();
    if (!b || b.kind !== 'practice' || phase !== 'carve') return;
    waitingResume = true;
    root.classList.remove('is-veiled');
    onPracticeClose?.();
    paint({ cut: false });
  }

  function focusCta() {
    if (ctaEl.hidden) return;
    try {
      ctaEl.focus({ preventScroll: true });
    } catch {
      ctaEl.focus?.();
    }
  }

  function graduate() {
    progression.setFlag('prologueDone', true);
    const first = world.spotlightMarker?.('gate-of-clarity-01');
    world.shrine?.setActive(false);
    if (first) {
      hud?.toast?.('引導完成 —— 南邊的光柱是清晰之門，去把守門人的問題解開。', 'good');
    }
    engine?.pulse?.(0.9);
    audio?.cue?.('unlock');
    hud?.refresh?.();
  }

  function finish({ skipped }) {
    if (!active) return;
    active = false;
    progression.setFlag('prologueDone', true);
    world.shrine?.setActive(false);
    root.classList.remove('is-open');
    root.hidden = true;
    confirmEl.hidden = true;
    if (practice.isOpen) practice.close();
    hud?.refresh?.();
    if (skipped) onSkip?.();
    else onFinish?.();
  }

  /* ---------------------------------------------------------------- 事件 */

  ctaEl.addEventListener('click', advance);
  root.querySelector('[data-skip]').addEventListener('click', () => {
    confirmEl.hidden = false;
    root.querySelector('[data-confirm-no]')?.focus({ preventScroll: true });
  });
  root.querySelector('[data-confirm-no]').addEventListener('click', () => {
    confirmEl.hidden = true;
    ctaEl.focus?.({ preventScroll: true });
  });
  root.querySelector('[data-confirm-yes]').addEventListener('click', () => finish({ skipped: true }));

  function onKey(e) {
    if (!active || root.hidden) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable))
      return;
    if (!keysArmed) return;
    if (practice.isOpen || !confirmEl.hidden) return;
    if (e.key === 'Enter' || e.code === 'Space') {
      if (ctaEl.hidden) return;
      e.preventDefault();
      advance();
    }
  }
  window.addEventListener('keydown', onKey);

  /* ------------------------------------------------------- 每一幀的判定 */

  function tick(dt) {
    if (!active || !armed || gateDone) return;
    const b = beat();
    if (!b || b.kind !== 'gate') return;

    if (b.gate === 'move') {
      const d = Math.hypot(player.position.x - lastPos.x, player.position.z - lastPos.z);
      lastPos = { x: player.position.x, z: player.position.z };
      travelled += d;
      if (travelled >= GATE.moveDistance) passGate();
      return;
    }
    if (b.gate === 'camera') {
      const yaw = player.cameraYaw;
      let delta = yaw - yawRef;
      // 角度會繞圈，取最短差
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      yawRef = yaw;
      yawTurned += Math.abs(delta);
      // 抬頭看天空也算 —— 石碑叫你「抬頭看看四周」，那就要真的做得到
      const pitched = Math.abs(player.cameraPitch || 0) >= GATE.cameraPitch;
      if (yawTurned >= GATE.cameraTurn || pitched) passGate();
      return;
    }
    if (b.gate === 'run') {
      if (player.running && player.speed >= GATE.runSpeed) passGate();
      return;
    }
    if (b.gate === 'arrive') {
      const shrine = world.shrine;
      if (!shrine) {
        passGate();
        return;
      }
      const d = Math.hypot(player.position.x - shrine.position.x, player.position.z - shrine.position.z);
      if (d <= shrine.radius) passGate();
    }
  }

  const api = {
    root,
    get isActive() {
      return active;
    },
    /** 目前這一拍（測試 / HUD 用）。 */
    get beat() {
      return beat();
    },
    get beatIndex() {
      return index;
    },
    get beatCount() {
      return beats.length;
    },
    get gatePassed() {
      return gateDone;
    },
    /** 練習拍現在在哪一段（lead / carve / bridge）。 */
    get phase() {
      return phase;
    },
    get awaitingResume() {
      return waitingResume;
    },
    /** 開始（或重看）引導課程。 */
    start() {
      active = true;
      keysArmed = false;
      // 下一顆事件迴圈才開始收鍵盤：開場那一下按鍵屬於標題卡，不屬於序章
      setTimeout(() => {
        keysArmed = true;
      }, 0);
      confirmEl.hidden = true;
      root.classList.remove('is-veiled');
      root.hidden = false;
      world.shrine?.setActive(true);
      world.spotlightMarker?.(null);
      requestAnimationFrame(() => root.classList.add('is-open'));
      enter(0);
    },
    tick,
    advance,
    /** 練習台的回呼（由 main.js 接上）。 */
    practiceDone,
    practiceDismissed,
    /** 直接跳過（設定頁 / 測試用；不做二次確認）。 */
    skip() {
      finish({ skipped: true });
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
    },
  };

  return api;
}

export default createPrologue;

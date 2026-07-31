/**
 * Promptasy — 導航閃爍提示（Phase 21）
 *
 * 問題：指南針只在左下角，而且它只回答「哪個方向」。玩家如果在原地繞、
 * 或者走反方向走了一分鐘，畫面上沒有任何人會提醒他。
 *
 * 做法：畫面**上方中央**一行會輕輕呼吸的刻文。它不是箭頭、不綁 3D 座標，
 * 就是回聲用世界觀的語氣說一句「往北，前往思考室」。
 *
 * 什麼時候出現（三個條件同時成立）：
 *   1. 距離「下一個目標」超過 45–60 秒沒有**明顯靠近**（bestDistance 沒被刷新）
 *   2. 這段期間沒有打開任何面板、沒有完成任何事情（都會把計時歸零）
 *   3. 不在冷卻中（顯示過一次就冷卻 90 秒 —— 它是提示，不是嘮叨）
 * 另外：新區域解鎖時**立刻**說一次「○○ 已開啟，往前走吧」（不受冷卻限制）。
 *
 * 什麼時候消失：
 *   · 玩家真的往那邊靠近了（距離刷新最佳值）→ 立刻收
 *   · 打開目標（或任何面板）→ 立刻收
 *   · 顯示滿 8 秒 → 自己淡出
 *
 * 不擋點擊（pointer-events:none）、位置固定在 HUD 頂列下方、
 * 和左下角指南針與右上角效能監視器互不重疊。
 * prefers-reduced-motion：不閃爍，只留一次淡入（見 styles.css）。
 */
import { el, esc } from './dom.js';

/** 幾秒沒靠近就提示（owner 指定 45–60 秒）。 */
export const IDLE_SECONDS = 50;
/** 顯示多久自己淡出。 */
export const HOLD_SECONDS = 8;
/** 顯示過後多久才可能再出現。 */
export const COOLDOWN_SECONDS = 90;
/** 距離要縮短多少才算「真的往那邊走」（世界單位）。 */
export const APPROACH_DELTA = 6;
/** 已經走到這麼近就不用再催了。 */
export const NEAR_ENOUGH = 14;
/** 一「步」大約走多遠（和指南針同一個體感基準）。 */
const STEP = 0.9;

const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];

/**
 * 世界方位詞。北 = −Z、東 = +X（和指南針的定義一致）。
 * @param {number} dx 目標 − 玩家（x）
 * @param {number} dz 目標 − 玩家（z）
 */
export function directionWord(dx, dz) {
  if (!dx && !dz) return '北';
  const ang = Math.atan2(dx, -dz); // 0 = 北、+π/2 = 東
  const turns = ((ang / (Math.PI * 2)) % 1 + 1) % 1;
  return DIRS[Math.round(turns * 8) % 8];
}

/**
 * @param {object} opts
 * @param {object} opts.world
 * @param {object} opts.player
 * @param {Function} opts.getRegion 目前所在區域 id
 * @param {object} [opts.content]   用來把區域 id 換成中文名
 * @param {Function} [opts.isBusy]  回傳 true 時完全不提示（面板開著／序章／標題卡）
 */
export function createNudge({ world, player, getRegion = () => 'foundations', content = null, isBusy = () => false }) {
  const root = el('div', 'nudge');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <p class="nudge__eyebrow meta-label" data-eyebrow>回聲</p>
    <p class="nudge__line" data-line></p>
    <p class="nudge__sub" data-sub></p>
  `;
  const eyebrowEl = root.querySelector('[data-eyebrow]');
  const lineEl = root.querySelector('[data-line]');
  const subEl = root.querySelector('[data-sub]');

  let visible = false;
  let idle = 0;
  let cooldown = 0;
  let shownFor = 0;
  let bestDistance = Infinity;
  let targetKey = null;
  let lastKind = null;
  let lastText = '';
  let lastDirection = '';
  let lastTargetName = '';
  let enabled = true;

  /*
   * 顯示 / 收起只切一個 class。
   *
   * 刻意**不**用 hidden（display:none）來收 —— 那會讓「從 none 變回 block 的同一拍
   * 又加上 is-on」有機會被瀏覽器合併成一次樣式計算，淡入就整個被跳過（實測過）。
   * 改成永遠留在版面上、用 opacity ＋ visibility 收；它是 position:absolute
   * ＋ pointer-events:none，留著不影響任何東西，visibility:hidden 也讓它離開無障礙樹。
   */
  function show(kind, { eyebrow, line, sub, text }) {
    eyebrowEl.textContent = eyebrow;
    lineEl.innerHTML = line;
    subEl.textContent = sub || '';
    subEl.hidden = !sub;
    root.classList.add('is-on');
    visible = true;
    shownFor = 0;
    lastKind = kind;
    lastText = text;
  }

  function hide() {
    if (!visible) return;
    visible = false;
    root.classList.remove('is-on');
    cooldown = COOLDOWN_SECONDS;
    idle = 0;
    shownFor = 0;
  }

  /** 目標在世界上的位置 → 方位詞與步數。 */
  function aim(target) {
    const dx = target.x - player.position.x;
    const dz = target.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    return { dx, dz, distance, dir: directionWord(dx, dz), steps: Math.max(1, Math.round(distance / STEP)) };
  }

  const api = {
    root,

    /**
     * 每幀呼叫。
     * @param {number} dt 秒
     */
    update(dt = 0) {
      if (!enabled) return;
      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);

      // 面板開著／序章進行中／標題卡還在 → 一律收起來，而且計時歸零
      // （「打開任何面板」本來就代表玩家沒有迷路）
      if (isBusy()) {
        if (visible) hide();
        idle = 0;
        return;
      }

      const target = world.objectiveTarget ? world.objectiveTarget(getRegion()) : null;
      if (!target) {
        if (visible) hide();
        targetKey = null;
        return;
      }

      const key = `${target.kind}:${target.id}`;
      const { distance, dir, steps } = aim(target);
      lastDirection = dir;
      lastTargetName = target.name;

      // 換了目標（通關 / 解鎖 / 跨區）→ 重新開始量，並且先安靜一下
      if (key !== targetKey) {
        targetKey = key;
        bestDistance = distance;
        idle = 0;
        if (visible && lastKind === 'idle') hide();
        return;
      }

      if (distance < bestDistance - APPROACH_DELTA) {
        // 真的往那邊走了 —— 提示的任務完成，立刻收
        bestDistance = distance;
        idle = 0;
        if (visible && lastKind === 'idle') hide();
        return;
      }
      // 走遠了也要更新基準，否則「先走遠再走回來」永遠追不上舊的最佳值
      if (distance > bestDistance) bestDistance = distance;

      if (visible) {
        shownFor += dt;
        if (shownFor >= HOLD_SECONDS) hide();
        return;
      }

      idle += dt;
      if (idle < IDLE_SECONDS || cooldown > 0 || distance <= NEAR_ENOUGH) return;

      show('idle', {
        eyebrow: '回聲',
        line: `往<b>${esc(dir)}</b>，前往${esc(target.name)}`,
        sub: `約 ${steps} 步 · 走近後按 E`,
        text: `往${dir}，前往${target.name}`,
      });
    },

    /**
     * 新區域解鎖時立刻說一次（不受冷卻限制 —— 這是一則消息，不是催促）。
     * @param {string} regionId
     */
    announceUnlock(regionId) {
      if (!enabled) return false;
      const group = content && content.group ? content.group(regionId) : null;
      const name = group ? group.name : regionId;
      const target = world.objectiveTarget ? world.objectiveTarget(getRegion()) : null;
      let sub = '橋上的閘門開了';
      if (target) {
        const { dir, steps } = aim(target);
        sub = `往${dir} · 約 ${steps} 步`;
        lastDirection = dir;
        lastTargetName = target.name;
      }
      show('unlock', {
        eyebrow: '回聲',
        line: `<b>${esc(name)}</b> 已開啟，往前走吧`,
        sub,
        text: `${name} 已開啟，往前走吧`,
      });
      return true;
    },

    /** 玩家做了某件事（打開面板 / 通關 / 讀碑）→ 他沒有迷路，計時歸零。 */
    noteActivity() {
      idle = 0;
      if (visible && lastKind === 'idle') hide();
    },

    /** 整組關掉（例如序章期間）。 */
    setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled && visible) hide();
    },

    get isVisible() {
      return visible;
    },

    /** 除錯 / 自動化測試用（純讀）。 */
    state() {
      return {
        visible,
        kind: lastKind,
        text: lastText,
        direction: lastDirection,
        target: lastTargetName,
        idle: Math.round(idle * 100) / 100,
        cooldown: Math.round(cooldown * 100) / 100,
        shownFor: Math.round(shownFor * 100) / 100,
        bestDistance: Number.isFinite(bestDistance) ? Math.round(bestDistance * 100) / 100 : null,
      };
    },
  };

  return api;
}

export default createNudge;

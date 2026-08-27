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
 * v1.2 · P08 起這條刻文多了第二個用途：**反應式回聲**（`echo(kind, ctx)`）——
 * 你安撫了一隻濁靈、撿到一頁殘頁、讀了一塊碑、拿到 S、升等、走進新的一片土地…
 * 回聲就會換一句話回應你（分支表 `ECHO_LINES`，一樣 ≤2 句、每句 ≤31 字、
 * 不解釋規則、不用系統術語）。事情發生時面板通常還開著，所以它會先記著、
 * 等面板收起來那一拍再說；20 秒內只講最近的那一件事。**不新增任何 UI。**
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

/**
 * v1.2 · P08：反應式回聲多久才會再說一句。
 *
 * 比導航提示的 90 秒短很多 —— 那個是「你好像迷路了」的催促，這個是
 * 「我看到你做了什麼」的回應；但仍然要有冷卻，不然升等 ＋ 解鎖 ＋ 拿 S
 * 撞在一起時牠會連珠炮。一次只說最後發生的那一件事。
 */
export const ECHO_COOLDOWN_SECONDS = 20;

/**
 * v1.2 · P08：回聲依「你剛剛做了什麼」換的那一句。
 *
 * 規矩（WORLD §1.2）：**每句 ≤ 31 字、最多兩句、不解釋規則、不用系統術語**。
 * `{name}` / `{what}` 是唯二的填空位，值由呼叫端給（區域中文名、收集的名字）。
 * 這張表就是分支的唯一來源 —— `announceUnlock()` 也是讀這裡的 `regionUnlocked`。
 */
export const ECHO_LINES = Object.freeze({
  /** 安撫一隻濁靈 */
  murkCalmed: { line: '牠聽懂自己在問什麼了。', sub: '這裡多了一盞燈。' },
  /** 第一盞清燈（整趟旅程只會遇到一次） */
  firstMurkCalmed: { line: '沒說清楚的話，也能被說完。', sub: '你替牠說了。' },
  /** 撿到一頁殘頁 */
  letterFound: { line: '他們寫的字，你撿起來了。', sub: '路邊還留著別的。' },
  /** 讀了一塊碑 */
  tabletRead: { line: '這塊碑等很久才等到人讀。' },
  /** 找到一處祕密 */
  secretFound: { line: '不在路上的地方，你走到了。' },
  /** 動了一件器物 */
  handleUsed: { line: '東西動了一下。', sub: '這裡還記得有人在。' },
  /** 一關拿到 S */
  gradeS: { line: '這一句，抄寫人也寫不出來。' },
  /** 升等 */
  levelUp: { line: '你說話的樣子變了。', sub: '牠比昨天更聽得懂你。' },
  /** 解鎖新區（由 announceUnlock 渲染：名字會被標成金色重點，副標帶方向） */
  regionUnlocked: { line: '{name} 已開啟，往前走吧' },
  /** 第一次走進某一片土地 */
  regionEntered: { line: '這片土地也是他們留下的。', sub: '慢慢走。' },
  /** 一片土地精通 */
  regionMastered: { line: '這一片，你把話都說清楚了。' },
  /** 收滿一種收集（殘頁 / 祕密 / 濁靈…） */
  collectionFull: { line: '{what}，一件都不缺了。' },
  /**
   * v1.2 · P21 · 中點揭示：走進分歧之廳的那一刻（與解了幾關無關）。
   * 兩句都在講同一件事：那些被劃掉的句子不是後人劃的。
   */
  midpointRevealed: { line: '兩面不是兩個人刻的。', sub: '是同一雙手，隔了很久回來刻的。' },
  /** 久沒動作，而且這一片已經沒有下一個目標了 */
  idleLong: { line: '這一片安靜下來了。', sub: '歇一會兒也沒關係。' },
});

/** 分支名清單（測試與 main.js 的接線都對這份）。 */
export const ECHO_KINDS = Object.freeze(Object.keys(ECHO_LINES));

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
  /** 反應式回聲自己的冷卻（和導航提示的 90 秒分開算）。 */
  let echoCooldown = 0;
  /** 事情發生時面板多半還開著 —— 先記著，收起來那一拍再說（只留最新的一件）。 */
  let pending = null;
  /**
   * 一輩子只說一次的那幾句：撞上冷卻不能丟掉（丟了就沒有第二次）。
   * 解鎖走的是自己那一條（`announceUnlock`），所以不列在這裡。
   */
  const ONCE_IN_A_LIFETIME = ['midpointRevealed'];

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

  /**
   * v1.2 · P08：把一條分支填成真的兩句話。
   * `{name}` / `{what}` 之外不做任何字串處理 —— 表裡寫的就是玩家看到的。
   */
  function echoText(kind, ctx = {}) {
    const spec = ECHO_LINES[kind];
    if (!spec) return null;
    const fill = (s) =>
      String(s || '')
        .replace('{name}', String(ctx.name ?? ''))
        .replace('{what}', String(ctx.what ?? ''));
    return { line: fill(spec.line), sub: spec.sub ? fill(spec.sub) : '' };
  }

  /**
   * 真的說出口（冷卻與 isBusy 已經在外面判過了）。
   *
   * 說出口的那一句會由 `show()` 記在 `lastKind` 上（那本來就是它在做的事）：
   * 呼叫端要「說出口了才記旗標」時看 `lastEchoKind()`
   * —— 先記旗標再叫 echo 的話，那一句被冷卻丟掉就**永遠不會再出現**
   * （P21 審查 · 第 1 條：中點揭示整段轉折就是這樣會被默默吃掉的）。
   */
  function speakEcho(kind, ctx) {
    const parts = echoText(kind, ctx);
    if (!parts) return false;
    pending = null;
    echoCooldown = ECHO_COOLDOWN_SECONDS;
    show(kind, { eyebrow: '回聲', line: esc(parts.line), sub: parts.sub, text: parts.line });
    return true;
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
      if (echoCooldown > 0) echoCooldown = Math.max(0, echoCooldown - dt);

      // 面板開著／序章進行中／標題卡還在 → 一律收起來，而且計時歸零
      // （「打開任何面板」本來就代表玩家沒有迷路）
      if (isBusy()) {
        if (visible) hide();
        idle = 0;
        return;
      }

      /*
       * v1.2 · P08：面板收起來的那一拍，把剛剛沒說出口的那一句補上。
       * 冷卻中就直接丟掉 —— 回聲不排隊，它只講最近發生的那一件事。
       */
      if (pending) {
        const p = pending;
        pending = null;
        // 解鎖是一則消息（帶方向與步數），不受冷卻限制
        if (p.kind === 'regionUnlocked') {
          api.announceUnlock(p.ctx.regionId ?? p.ctx.name ?? '');
          return;
        }
        /*
         * **一輩子只會說一次的那幾句也是消息，不受冷卻限制**（P21 審查 · 第 1 條）。
         * 中點揭示那一句如果撞上前 20 秒剛說過的任何一句回聲，就會被默默丟掉，
         * 而它**再也不會有第二次機會** —— 那是整段轉折的情感負載。
         */
        if (ONCE_IN_A_LIFETIME.includes(p.kind)) {
          speakEcho(p.kind, p.ctx);
          return;
        }
        if (echoCooldown <= 0) {
          speakEcho(p.kind, p.ctx);
          return;
        }
      }

      const target = world.objectiveTarget ? world.objectiveTarget(getRegion()) : null;
      if (!target) {
        targetKey = null;
        /*
         * 這一片已經沒有下一個目標了。原本這裡就是安靜 —— 現在多一件事：
         * 站著不動夠久（兩倍的閒置門檻）才會說一句「歇一會兒也沒關係」。
         */
        if (visible) {
          if (lastKind === 'idle') hide();
          else {
            shownFor += dt;
            if (shownFor >= HOLD_SECONDS) hide();
          }
          return;
        }
        idle += dt;
        if (idle >= IDLE_SECONDS * 2 && echoCooldown <= 0 && cooldown <= 0) {
          idle = 0;
          speakEcho('idleLong', {});
        }
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
      // 句子本身讀 ECHO_LINES（單一來源），這裡只多做一件事：把區域名標成金色重點
      const tpl = ECHO_LINES.regionUnlocked.line;
      show('unlock', {
        eyebrow: '回聲',
        line: esc(tpl).replace('{name}', `<b>${esc(name)}</b>`),
        sub,
        text: tpl.replace('{name}', name),
      });
      // 解鎖是一則消息、不受冷卻限制，但它也算「回聲剛講過話」
      echoCooldown = ECHO_COOLDOWN_SECONDS;
      pending = null;
      return true;
    },

    /**
     * v1.2 · P08：反應式回聲 —— 依「你剛剛做了什麼」挑一句。
     *
     * 規矩：分支表在 `ECHO_LINES`（≤2 句、每句 ≤31 字、不用系統術語）；
     * 面板還開著就先記下來（多半就是剛做完那件事的那個面板），收起來再說；
     * 冷卻中一律不說，一次只留最新的那一件事。
     *
     * @param {string} kind ECHO_KINDS 之一
     * @param {object} [ctx] `{ name }`（區域名）／`{ what }`（收集的名字）／`{ regionId }`
     * @returns {boolean} 這一拍真的說出口了嗎
     */
    echo(kind, ctx = {}) {
      if (!enabled) return false;
      if (!ECHO_LINES[kind]) return false;
      /*
       * **一律先記著**，不當場說。
       *
       * 事情發生的那一拍，畫面上通常正要開一個面板 —— 撿到的殘頁、讀到的碑、
       * 剛評完的結果都是先叫 echo 再 openPanel。當場說的話那一句會被下一幀的
       * isBusy 收掉，玩家一個字都看不到。等面板收起來、畫面空出來，`update()`
       * 才把它說出口（見上面的 flush；連解鎖也一樣要等）。
       * 只留最新的一件事 —— 回聲不排隊。
       */
      pending = { kind, ctx };
      return true;
    },

    /**
     * 上一句**真的說出口**的回聲是哪一種（`null` ＝ 還沒說過）。
     *
     * 給「說出口了才記旗標」用：`echo()` 只是把它排進 `pending`，
     * 真正說出口是下一拍 `update()` 的事（而且可能被冷卻或面板擋掉）。
     */
    lastEchoKind() {
      return lastKind;
    },

    /** 玩家做了某件事（打開面板 / 通關 / 讀碑）→ 他沒有迷路，計時歸零。 */
    noteActivity() {
      idle = 0;
      if (visible && lastKind === 'idle') hide();
    },

    /** 整組關掉（例如序章期間）。 */
    setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled) {
        pending = null;
        if (visible) hide();
      }
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
        echoCooldown: Math.round(echoCooldown * 100) / 100,
        pending: pending ? pending.kind : null,
        shownFor: Math.round(shownFor * 100) / 100,
        bestDistance: Number.isFinite(bestDistance) ? Math.round(bestDistance * 100) / 100 : null,
      };
    },
  };

  return api;
}

export default createNudge;

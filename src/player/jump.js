/**
 * Promptasy — 跳躍：常數、彈道與那一小台狀態機（v1.2 · P14）
 *
 * 這一支**不 import three、不碰場景、不讀時間**，全部是純資料與純函式 ——
 * 於是「這組數字跳得上多高」「鬆手會不會少跳一截」「走出高台邊緣會不會掉下去」
 * 這些問題在 `npm run test:rubric` 裡就答得完，不必等 15 分鐘的無頭瀏覽器。
 *
 * ## 為什麼只有中央高原跳得起來
 * 跳躍會把「站得上去的頂面」變成真的能踩的地方（P13 把它量成了資料）。
 * 一次就把 12 片土地打開，等於一次押上 974 顆碰撞圓裡那 177 顆可站立體
 * ——每一顆都可能是一個「跳上去卡住」或「跳上去看到穿幫」的地方。
 * 所以 P14 只開中央高原（`JUMP_REGIONS`）：一片自己蓋的高台、一條走得完的路。
 * **v1.2 · P15 把它加到四片**（中央高原 ＋ 這一格蓋了高台的另外三片），
 * 並且第一次開了**一座橋**（`JUMP_BRIDGES`：橋上那道缺口要跳得過去）。
 * **v1.2 · P16a 先量再放**：12 片土地各掃過一次落點，蓋得出高台的長到 **8 片**，
 * 量出來蓋不出來的那 4 片（契約鍛冶場、觀象臺、分歧之廳、護欄崗）**仍然是 0**。
 * 那 4 片土地與 6 座橋的每一幀與 P14 之前完全相同。
 *
 * ## 手感的三個業界標配（WORLD.md §3.1）
 *   · **coyote time**（`COYOTE_TIME` 100ms）：走出邊緣之後還有 100 毫秒能起跳 ——
 *     人眼看到的「我明明還在上面」與程式判定的「你已經離開了」差的就是這一段。
 *   · **input buffer**（`JUMP_BUFFER` 150ms）：落地前 150 毫秒按的跳，落地那一刻補發 ——
 *     連續跳不會因為早按了兩幀就掉一次。
 *   · **鬆手提前下落**（`JUMP_CUT`）：上升途中放開跳躍鍵就把上升速度砍半 ——
 *     輕點一下是小跳、按到底才是滿跳，同一個鍵有兩種高度。
 *
 * ## 積分要分小步（這台機器真的會出現 200ms 的一幀）
 * 軟體渲染（SwiftShader）一幀可能 0.2 秒。用整幀去積分重力，同一次跳躍會在
 * 「升到 1.04 公尺就掉下來」與「衝到 3.12 公尺」之間跳來跳去 —— 前者跳不上高台、
 * 後者跳得上不該跳得上的東西，而且**兩種錯法都跟機器速度有關**。
 * 所以垂直方向一律切成 `MAX_STEP` 的小步累加（`stepJumper()` 內的迴圈），
 * 幀率再爛，彈道都是同一條。
 */

/** 重力加速度（m/s²）。比現實的 9.8 大很多 —— 遊戲的跳躍要「上去得快、下來得更快」。 */
export const GRAVITY = 26;

/**
 * 起跳速度（m/s）。這個數字唯一的契約是**跳得上 1.6、跳不上 3.0**：
 *   · 1.6 ＝ 這一格自己蓋的第一座高台（`screens.js` 的 `PLATFORMS`）
 *   · 3.0 ＝ `STAND_MAX_H`，「再高就不該跳得上去」的那條線（WORLD.md §6.3）
 * 10.4 m/s → 頂點 10.4² / (2 × 26) ＝ **2.08 公尺**：比 1.6 多出半公尺的餘裕，
 * 離 3.0 還差 0.92 公尺。改動這個數字時 `test:rubric` 會逐條驗這兩邊。
 */
export const JUMP_SPEED = 10.4;

/** 走出邊緣之後還能起跳的寬限（秒）。 */
export const COYOTE_TIME = 0.1;
/** 落地前先按下的跳，記住多久（秒）。 */
export const JUMP_BUFFER = 0.15;
/** 上升中放開跳躍鍵：把上升速度乘上這個值（＝砍半）。 */
export const JUMP_CUT = 0.5;
/** 垂直積分的最大步長（秒）。見檔頭「積分要分小步」。 */
export const MAX_STEP = 1 / 120;
/** 下墜的終端速度（m/s）—— 一幀 0.2 秒也不會一次穿過一整座高台。 */
export const MAX_FALL = 34;
/**
 * 跳得起來的土地。
 *
 * **P14 只開中央高原**（一片土地、一座高台，證明整條路成立）。
 * **v1.2 · P15 加開三片**：沉書檔案庫、面具劇場、量器坊 ——
 * 就是這一格真的蓋得起高台的那三片。理由很直接：
 * 高台上有只有站上去才搆得到的東西（`screens.js` 的 `reveals`），
 * 在跳不起來的土地上蓋高台等於蓋裝飾，而這一格的整個題目就是
 * 「**高台不是裝飾**」；反過來，沒有高台的土地也不該先開跳躍
 * （開了也沒有東西可以跳上去，只多出「跳一跳會怎樣」的風險面）。
 * **v1.2 · P16a 再加開四片**：示範與推理、齒輪工坊、減法之庭、校驗場 ——
 * 挑法一寸都沒變，仍然是「蓋得出高台的才開」。這一格的做法是**先量再放**：
 * `npm run screen-fit -- --kind platform` 對 12 片土地各掃過一次，
 * 量出來擺不下的是**契約鍛冶場、觀象臺、分歧之廳、護欄崗**（表在 WORLD.md §4.12），
 * 所以那四片**仍然是 0** —— 「按了 J 卻沒有任何東西跳得上去」比不能跳更糟。
 * 那四片的每一幀與 P14 之前完全相同。
 */
export const JUMP_REGIONS = Object.freeze([
  'foundations',
  'grounding',
  'config',
  'forms',
  'reasoning',
  'orchestration',
  'frugality',
  'refinery',
]);

/**
 * 跳得起來的**橋**（v1.2 · P15）。
 *
 * 橋在 P14 一律不准跳（`player.js` 問的是 `here.onBridge`）——
 * 橋是唯一的必經之路，在上面亂跳只會製造「跳一跳掉出去」的機會。
 * 這一格開了一道**缺口**（`world.js` 的 `BRIDGE_GAPS`），缺口要跳得過去，
 * 所以**開缺口的那一座橋**、也只有那一座，跳得起來。
 * 沒有缺口的橋一律 0 —— 這張表與 `BRIDGE_GAPS` 的 `region` 一一對應，`test:rubric` 逐條比對。
 */
export const JUMP_BRIDGES = Object.freeze(['grounding']);

/**
 * 這一片土地的起跳速度（m/s）。0 ＝ 這裡跳不起來。
 * @param {string|null|undefined} regionId
 * @returns {number}
 */
export function jumpSpeedFor(regionId) {
  return regionId && JUMP_REGIONS.includes(regionId) ? JUMP_SPEED : 0;
}

/**
 * **站在橋上**時的起跳速度（m/s）。0 ＝ 這座橋跳不起來。
 * @param {string|null|undefined} regionId 這座橋通往哪一片土地
 * @returns {number}
 */
export function jumpSpeedForBridge(regionId) {
  return regionId && JUMP_BRIDGES.includes(regionId) ? JUMP_SPEED : 0;
}

/**
 * 連續彈道的頂點高度（公尺）：v² / 2g。
 * @param {number} v 起跳速度
 * @param {number} [g]
 */
export function apexOf(v, g = GRAVITY) {
  return v > 0 ? (v * v) / (2 * g) : 0;
}

/** 這一片土地跳得多高（公尺）。其餘 11 片是 0。 */
export function jumpApexFor(regionId) {
  return apexOf(jumpSpeedFor(regionId));
}

/**
 * **離散**積分（遊戲迴圈真的在跑的那一種）能升到多高。
 *
 * 為什麼要有這一支：連續解 v²/2g 只是紙上的數字，玩家踩到的是 `stepJumper()`
 * 一小步一小步加出來的那一條。這支用同一個步長重跑一次，
 * 讓「跳得上 1.6／跳不上 3.0」這條契約驗的是**真的會發生的那條彈道**。
 *
 * @param {number} v 起跳速度
 * @param {number} [dt] 呼叫端的幀時間（會被切成 MAX_STEP 的小步）
 * @param {number} [g]
 * @returns {number} 相對起跳點的最高點（公尺）
 */
export function simulateApex(v, dt = 1 / 60, g = GRAVITY) {
  let y = 0;
  let vy = v;
  let best = 0;
  // 最多跑 20 秒；正常的一跳不到 1 秒就回到 0
  for (let t = 0; t < 20 / Math.max(dt, 1e-4); t += 1) {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, MAX_STEP);
      left -= h;
      vy = Math.max(-MAX_FALL, vy - g * h);
      y += vy * h;
      if (y > best) best = y;
    }
    if (y <= 0) break;
  }
  return best;
}

/**
 * 跳躍狀態機的一格狀態。**每個玩家一份，建好之後只被 `stepJumper()` 就地改**
 * —— tick 裡不 new。
 *
 * · `airborne` 離地中
 * · `supported` **站在某一顆可站立體的頂面上**（狀態；`false` ＝ 貼著地形）
 * · `standing`  站的是哪一顆（**只是標籤**，給 HUD／e2e 看；沒有登記 `standId` 的就是 null）
 *
 *   兩個一定要分開：全世界 180 顆可站立體裡只有登記過 `standId` 的那幾顆有名字，
 *   拿名字當狀態的話「跳上一顆沒名字的石頭」下一幀就會被判成沒站在東西上、
 *   整個人穿回地形高度再被 `escapeSolid()` 擠出來（P14 審查 · 第 1 條）。
 * · `vy`        垂直速度（m/s，正 = 往上）
 * · `coyote`    還剩多少寬限可以起跳（秒）
 * · `buffer`    還記著多久前按的那一次跳（秒）
 * · `cut`       這一跳已經因為鬆手被砍過速度了（只砍一次）
 * · `launchY`   這一跳離地時腳的高度（算頂點用）
 * · `apex`／`airT` 這一跳到目前為止的最高點與滯空時間
 * · `jumps`／`lastApex`／`lastAirTime`／`lastImpact` 遙測：給 HUD、e2e 與除錯看
 *   （e2e 在 200ms 一幀的機器上量不到「某一幀正好在空中」，只能問這幾個累計值）
 */
export function createJumper() {
  return {
    airborne: false,
    supported: false,
    standing: null,
    vy: 0,
    coyote: 0,
    buffer: 0,
    cut: false,
    launchY: 0,
    apex: 0,
    airT: 0,
    jumps: 0,
    blocked: 0,
    lastApex: 0,
    lastAirTime: 0,
    lastImpact: 0,
  };
}

/** 這一格狀態算不算「離開了地形」（＝要走跳躍那條路，而不是原本的貼地那一行）。 */
export function isAloft(st) {
  return st.airborne || st.supported;
}

/**
 * 一幀的垂直運動。**純函式**：只讀 `io`、只改 `st`，不碰場景、不配置記憶體。
 *
 * 呼叫端（`player.js`）每一幀把同一個 `io` 物件填一填再遞進來（零每幀配置）：
 *
 * @param {object} st `createJumper()` 的狀態
 * @param {number} dt 幀時間（秒）
 * @param {object} io
 * @param {number} io.y         目前腳的高度（世界座標）
 * @param {number} io.groundY   腳下**地形**的高度（跳躍完全沒發生時的答案）
 * @param {number} io.supportY  腳下**支撐面**的高度（地形或已經站上去的頂面）
 * @param {string|null} io.supportId 支撐面的 id（`null` ＝ 地形）
 * @param {number} io.supportIndex   支撐面在碰撞表裡的索引（< 0 ＝ 地形）
 * @param {boolean} io.wantJump 這一幀有沒有按下跳躍鍵（邊緣觸發）
 * @param {boolean} io.held     跳躍鍵還按著嗎
 * @param {number} io.jumpSpeed 這裡跳得起來嗎（0 ＝ 這片土地不准跳）
 * @param {boolean} io.canTakeOff 這一刻起跳安不安全（虛空／卡在石頭裡 → false）
 * @returns {number} 這一幀之後腳的高度
 *
 * **不按跳躍鍵的保證**：`wantJump` 永遠是 false → `airborne` 永遠是 false →
 * `supported` 永遠是 false → 這支一路走到最後回的就是 `io.groundY`，
 * 與 P14 之前那一行 `group.position.y = terrainHeight(...)` 逐位元組相同。
 */
export function stepJumper(st, dt, io) {
  const step = dt > 0 ? dt : 0;

  /* ① 記住這一次按鍵（input buffer）：落地前按的也算數。 */
  if (io.wantJump) st.buffer = JUMP_BUFFER;
  else st.buffer = st.buffer > step ? st.buffer - step : 0;

  /* ② 起跳。條件：手上有一次沒用掉的跳 ＋ 站得住（或還在 coyote 寬限內）＋ 這裡跳得起來 ＋ 腳下安全。 */
  if (st.buffer > 0 && st.vy <= 0 && (!st.airborne || st.coyote > 0)) {
    if (io.jumpSpeed > 0 && io.canTakeOff) {
      st.vy = io.jumpSpeed;
      st.airborne = true;
      st.supported = false;
      st.standing = null;
      st.coyote = 0;
      st.buffer = 0;
      st.cut = false;
      st.launchY = io.y;
      st.apex = 0;
      st.airT = 0;
      st.jumps += 1;
    } else {
      /*
       * 邊界護欄：**這裡跳不起來就當作沒按過**（不留在 buffer 裡等著，
       * 不然人從別的土地走回中央高原的那一瞬間會莫名其妙彈起來）。
       * `blocked` 是遙測 —— e2e 要問「在別的區按 J 到底有沒有被擋下來」。
       */
      st.buffer = 0;
      st.blocked += 1;
    }
  }

  /* ③ 站在頂面上：走出那一段平面就開始掉（這是唯一一條「不按跳也會離地」的路）。 */
  if (!st.airborne && st.supported) {
    if (io.supportIndex < 0) {
      st.airborne = true;
      st.supported = false;
      st.vy = 0;
      st.standing = null;
      st.launchY = io.y;
      st.apex = 0;
      st.airT = 0;
      st.coyote = COYOTE_TIME; // 走出邊緣的那一段寬限
    } else {
      // 走到另一顆頂面上時標籤要跟著換（不然 standingOn 會一直報第一顆的名字）
      st.standing = io.supportId;
      st.coyote = COYOTE_TIME;
      return io.supportY;
    }
  }

  /* ④ 貼著地形：一步都不進跳躍那條路。回的就是原本那一行的答案。 */
  if (!st.airborne) {
    st.coyote = COYOTE_TIME;
    st.vy = 0;
    return io.groundY;
  }

  /* ⑤ 空中：重力 ＋ 鬆手提前下落 ＋ 落地。切成小步積分（見檔頭）。 */
  if (!io.held && st.vy > 0 && !st.cut) {
    st.vy *= JUMP_CUT;
    st.cut = true;
  }
  st.coyote = st.coyote > step ? st.coyote - step : 0;
  st.airT += step;

  let y = io.y;
  let left = step;
  let landed = false;
  while (left > 1e-9) {
    const h = Math.min(left, MAX_STEP);
    left -= h;
    st.vy = Math.max(-MAX_FALL, st.vy - GRAVITY * h);
    y += st.vy * h;
    if (y - st.launchY > st.apex) st.apex = y - st.launchY;
    /*
     * 落地：支撐面由呼叫端**用這一幀的最高點**去問（見 `player.js` 的 `supportAt`）——
     * 所以下墜再快也不會從頂面中間穿過去。
     */
    if (st.vy <= 0 && y <= io.supportY) {
      y = io.supportY;
      landed = true;
      break;
    }
  }

  if (landed) {
    st.lastImpact = -st.vy;
    st.airborne = false;
    st.vy = 0;
    st.cut = false;
    st.supported = io.supportIndex >= 0;
    st.standing = st.supported ? io.supportId : null;
    st.coyote = COYOTE_TIME;
    st.lastApex = st.apex;
    st.lastAirTime = st.airT;
  }
  return y;
}

export default {
  GRAVITY,
  JUMP_SPEED,
  COYOTE_TIME,
  JUMP_BUFFER,
  JUMP_CUT,
  MAX_STEP,
  MAX_FALL,
  JUMP_REGIONS,
  JUMP_BRIDGES,
  jumpSpeedFor,
  jumpSpeedForBridge,
  apexOf,
  jumpApexFor,
  simulateApex,
  createJumper,
  isAloft,
  stepJumper,
};

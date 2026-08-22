/**
 * 中觀：遮擋帶與母題（v1.2 · P11；research-map 提案 M1 ＋ M8）
 *
 * 這個世界原本只有兩階：巨觀（每片土地一座 21–27 公尺的地標）與微觀（器物、反應物、
 * 殘頁、碎石）。從橋頭望進去一眼看到底 —— BotW 的「中三角」與 Sky 的 meso 層在這裡是空的。
 * 這一層補的就是中間那一階：
 *
 *   · **遮擋帶（SCREEN_BANDS）**：6–12 公尺高的石脊，刻意擋住「橋頭 → 地標」那一條直線，
 *     走進去、繞過它，塔才揭露。它有份量 → 進碰撞體、進 collision-audit。
 *   · **母題（MOTIFS）**：同一個形狀在一片土地上重複出現，遠看就認得出這是哪裡。
 *     階梯迴廊的母題是「示範了兩遍的階梯」——兩階實體、第三階只剩一圈光的輪廓
 *     （WORLD.md §1.4／研究 W §4 的傳說鉤：「塔沒有頂，因為師傅只示範兩遍，
 *     第三遍的階梯要你自己踏出來」）。**沒有文字**，形狀自己會說。
 *   · **走出來的路（PATH_BENDS）**：路是被走出來的，所以遇到石脊時它會**繞過去**，
 *     不會直直撞上一面牆。`buildPathNetwork()` 與 `scripts/sightline-audit.mjs`
 *     讀的是同一份 `corridorPolyline()` —— 畫在地上的路與稽核量的路是同一條。
 *
 * **為什麼自成一個模組而不是併進 `props.js`**（P11 規格要求寫明理由）：
 *   1. 它是**新的一階**（§4.7 的中景階為它開了 6–12 公尺的例外），資料契約、擺位規則、
 *      稽核腳本都自成一套；`props.js` 已經 2,300 行、管的是「一組一組手排的小景與道具」。
 *   2. `props.js` 需要讀這裡的 `PATH_BENDS`（路要繞過石脊）。反向相依會變成循環，
 *      所以這個模組**不 import props.js** —— 幾何與材質自己留一份很小的快取，
 *      建造時由 `world.js` 把該區的 kit 遞進來（跟地標／小景同一個模式）。
 *
 * 硬規則（WORLD.md §2.2／§4.7／§6）：0 新光源（全部自發光或吃既有的補光）、
 * 共用幾何與材質、零每幀工作（這一層完全靜態，不進 tick）。
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * 幾何 / 材質快取（同一個形狀只做一次）
 * ------------------------------------------------------------------ */
const GEO = new Map();
const MAT = new Map();

function g(key, make) {
  let v = GEO.get(key);
  if (!v) {
    v = make();
    GEO.set(key, v);
  }
  return v;
}

function m(key, make) {
  let v = MAT.get(key);
  if (!v) {
    v = make();
    MAT.set(key, v);
  }
  return v;
}

/** 測試用：把快取清掉（世界重建時不留舊材質）。 */
export function disposeScreenCache() {
  for (const v of GEO.values()) v.dispose?.();
  for (const v of MAT.values()) v.dispose?.();
  GEO.clear();
  MAT.clear();
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
/**
 * 圓柱（高台用）。`radialSegments` 24 —— 頂面的內接半徑是 r·cos(7.5°) ＝ 0.991 r，
 * 比 `STAND_RING_STEP`（0.15）小得多，所以 `standR` 追得到幾乎整個碰撞半徑。
 */
const cylinder = (r, h) => g(`cyl:${r},${h}`, () => new THREE.CylinderGeometry(r, r, h, 24, 1));
/** 躺平的環（高台頂面那一圈刻線）。與其他幾何一樣走模組層的快取。 */
const flatRing = (inner, outer) => g(`ring:${inner},${outer}`, () => new THREE.RingGeometry(inner, outer, 40));
const stone = (c) => m(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.94 }));
const glow = (c, i = 0.9) =>
  m(`glow:${c},${i}`, () =>
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: Math.min(1, 0.24 + i * 0.22), blending: THREE.AdditiveBlending, depthWrite: false })
  );

/* ------------------------------------------------------------------ *
 * 尺寸契約（測試會逐條驗）
 * ------------------------------------------------------------------ */
/** 遮擋帶的高度區間：WORLD.md §4.7 中景階（3–8）的**登記例外**，理由寫在 §4.7。 */
export const BAND_HEIGHT_MIN = 6;
export const BAND_HEIGHT_MAX = 12;
/** 遮擋帶的長度區間：短於這個擋不住、長於這個就變成一道牆（「放 2–3 道，不要放一道牆」）。 */
export const BAND_LENGTH_MIN = 7;
export const BAND_LENGTH_MAX = 20;
/**
 * 遮擋帶厚度的下限（v1.2 · P12）：碰撞用的圓串半徑 ＝ 半個厚度，
 * 薄的石脊要用更多、更小的圓才蓋得住同一段長度（P11 一道帶 12 個碰撞體就是這樣來的）。
 * 2 公尺起跳 → 一道帶 4–5 個碰撞體，12 片土地鋪完仍離 1,400 的硬上限很遠。
 */
export const BAND_DEPTH_MIN = 2;
export const BAND_DEPTH_MAX = 3;
/**
 * 朝橋頭那一面矮階露出地面的高度（公尺）。
 * **刻意低於 §6.3 的 0.9**：照那條規則它「跨得過去」，所以穿模稽核不列它、它也不必有碰撞體。
 */
export const APRON_HEIGHT = 0.8;
/**
 * `world.js` 的 `SOLID_MIN_RADIUS`（碰撞圓的下限）。
 * 這一檔刻意**不 import world.js**（world.js import 它，反過來會變成循環），
 * 所以留一份常數 —— `test:rubric` 逐值比對兩邊相等。
 */
export const SOLID_MIN_R = 0.5;
/** 母題是中景階（3–8 公尺），不准長成第二個地標。 */
export const MOTIF_HEIGHT_MIN = 3;
export const MOTIF_HEIGHT_MAX = 8;
/** 一片土地的母題數（研究 M8：重複出現才叫母題，太多就變雜物）。 */
export const MOTIF_PER_REGION_MIN = 3;
export const MOTIF_PER_REGION_MAX = 5;

/**
 * 遮擋帶。
 *
 * `at`     世界座標 [x, z]（石脊正中央）
 * `rot`    繞 Y 的旋轉（弧度，0–2π）：局部 +X 軸＝石脊的長邊方向
 * `kind`   造型（目前只有 `stairRidge`：一道由巨階疊起來的背脊）
 * `length` 長邊（公尺）—— 這一段是**擋得住視線的核心**，稽核只算這個矩形
 * `depth`  短邊（公尺）
 * `height` 核心的高度（公尺，離它自己腳下的地面）
 * `faceSign` 矮階在哪一面（局部 ±Z；1 ＝ 朝橋頭那一面）
 *
 * 核心之外還有兩樣東西，**都不算進遮蔽判定、也都沒有碰撞體**（稽核保守：量到的一定比看到的少）：
 * 朝橋頭那一面的一級矮階（露出地面只有 `APRON_HEIGHT` 0.8 公尺 —— §6.3 說它跨得過去），
 * 以及疊在核心頂上、一階比一階高的頂階（只往上長，不占地）。
 */
export const SCREEN_BANDS = Object.freeze([
  /*
   * 階梯迴廊 · 第一道：「第一遍的背脊」
   *
   * 站在橋頭（主動線的內端，離區界 8 公尺）往裡看，無盡階梯塔正好在正前方 38 公尺。
   * 這一道石脊橫在 14.5 公尺處、12 公尺高，把整座塔（連塔頂那顆光球）壓在背後。
   *
   * 為什麼是這個座標而不是「橋頭正前方」：階梯迴廊有 15 座石座 ＋ 小景 ＋ 器物 ＋ 殘頁，
   * 從橋頭到塔的那條直線上，**唯一**同時滿足「離石座淨空 5.6＋玩家 0.62＋自己的碰撞半徑」
   * 與「離主動線 ≥ LANE_HALF+4、離地標留白 ≥16」的空隙就在這裡（`scripts/screen-fit.mjs`
   * 逐點掃過，餘裕 0.35 公尺）。它刻意偏北：南端只到主動線南側 0.5 公尺
   * （再往南就踩進 thinking-chamber-14 的淨空圈），北端伸到 7 公尺 ——
   * 於是「走出來的路」自然往北繞，繞過北端塔才揭露。
   *
   * 厚度 1.4 → **2.4**（v1.2 · P12）：碰撞用的圓串半徑就是半個厚度，薄的石脊要用
   * 更多、更小的圓才蓋得住同一段長度（P11 那版一道帶 12 個碰撞體）。加厚之後一道帶 4 個，
   * 這片土地的中觀層從 36 個降到 20 個。座標一寸沒動 —— `scripts/screen-fit.mjs --verify`
   * 重建量過：加厚之後每一個碰撞圓仍然離每一件互動物夠遠。
   */
  {
    id: 'reasoning-first-spine',
    region: 'reasoning',
    at: [-75.97, -80.56],
    rot: 0.7354,
    kind: 'stairRidge',
    length: 7.5,
    depth: 2.4,
    height: 12,
    faceSign: 1,
  },
  /*
   * 階梯迴廊 · 第二道：「第二遍的背脊」
   *
   * 站在橋頭的另一側 —— 兩道石脊一北一南錯開，中間那道缺口就是你走進去的地方
   * （母題說的同一件事：師傅只示範兩遍，第三道要你自己走出來）。
   * 它擋住往西南斜切過去的那條捷徑，也給入口一層中景：走下橋的時候，
   * 左右各一道背脊從眼前掠過，這片土地就有了「厚度」。
   */
  {
    id: 'reasoning-second-spine',
    region: 'reasoning',
    at: [-79.62, -63.71],
    rot: -2.7978,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 面具劇場 · 第一道：「側幕」（v1.2 · P12）
   *
   * 走下東南那條橋，面具拱門原本從第一步就看得到底。這一道橫在 13 公尺處、12 公尺高，
   * 把整座拱門推到「翻過去才看到」——`npm run audit:sightline` 量到前 15 公尺看不到、第 15 公尺揭露。
   * 座標是 `scripts/screen-fit.mjs` 掃出來的（2,955 個格點 → 257 個合法擺法），
   * 選的是離橋頭 15 公尺左右、四周 22/24 個方向走得過去的那一個。
   */
  {
    id: 'config-first-wing',
    region: 'config',
    at: [80, 75],
    rot: 0.1745,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 12,
    faceSign: 1,
  },
  /*
   * 面具劇場 · 第二道：「另一側的側幕」
   *
   * 與第一道一南一北夾出入口的那道缺口（同階梯迴廊的作法）：它不負責擋視線，
   * 負責的是「走下橋時左右各有一道東西掠過」——這片土地因此有厚度。矮一階（8 公尺）。
   */
  {
    id: 'config-second-wing',
    region: 'config',
    at: [72, 81],
    rot: 0.2618,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 契約鍛冶場 · 第一道：「立起來的工作檯」（v1.2 · P12）
   *
   * **為什麼是這裡而不是規格點名的沉書檔案庫／齒輪工坊**：那兩片土地量出來擺不下
   * （理由與數字寫在下面 `MOTIFS` 的檔案庫段落，以及 `docs/history/findings.md`）。
   * 契約鍛冶場的橋頭到「未命名的工具」之間是全場最空的一段：`screen-fit` 掃出 102 種合法擺法。
   * 這一道橫在離橋頭 19 公尺處 —— 前 21 公尺看不到、第 21 公尺揭露。
   */
  {
    id: 'toolcraft-first-jig',
    region: 'toolcraft',
    at: [-107, 1],
    rot: 0.5236,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 12,
    faceSign: 1,
  },
  /*
   * 契約鍛冶場 · 第二道：「北邊那一道溝的邊」
   * 同樣不負責擋視線，負責入口的厚度；矮一階（8 公尺）。
   */
  {
    id: 'toolcraft-second-jig',
    region: 'toolcraft',
    at: [-94, 10],
    rot: 1.0472,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 量器坊 · 第一道：「立起來的那一階刻度」（v1.2 · P16a）
   *
   * 量器坊的地形本身就是一把躺著的尺（由北往南一階一階降下去），
   * 所以「刻度之柱」從橋頭第一步就看得到底 —— 一片沒有厚度的土地。
   * 這一道橫在離橋頭 15 公尺處：`screen-fit` 掃過 2,628 個格點，
   * **整片土地只有這一種合法擺法**（其餘不是踩進地標留白就是站在階地的落差上）。
   */
  {
    id: 'forms-first-tick',
    region: 'forms',
    at: [-3, 98],
    rot: 2.8798,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 12,
    faceSign: 1,
  },
  /*
   * 量器坊 · 第二道：「另一邊那一階」
   * 與第一道一西一東夾出入口的那道缺口（同階梯迴廊、面具劇場的作法）：
   * 它不負責擋視線，負責的是「走下橋時左右各有一階掠過」。矮一階（8 公尺）。
   */
  {
    id: 'forms-second-tick',
    region: 'forms',
    at: [8, 102],
    rot: 0,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 分歧之廳 · 「岔開的那一道」（v1.2 · P16b）
   *
   * 這片土地的傳說鉤是「把兩份相反的守則並排讀」——地標「兩面的柱」從橋頭第一步
   * 就看得到底。這一道橫在離橋頭 15 公尺處，把五根柱子推到「繞過去才看到」，
   * 而走出來的路自己就分成了「先往這邊、再折回去」的兩段（形狀說的是同一句話）。
   *
   * `screen-fit` 掃過 4,920 個格點 × 24 個角度：擋在視線上又離橋頭夠遠的擺法裡，
   * **7,877 種踩到別人的淨空、9 種活下來**；重建驗過的是這一個。
   */
  {
    id: 'divergence-first-fork',
    region: 'divergence',
    at: [66.5, 22],
    rot: 1.4399,
    kind: 'stairRidge',
    length: 8,
    depth: 2.4,
    height: 10,
    faceSign: 1,
  },
  /*
   * 分歧之廳 · 第二道：「另一邊那一道」
   * 它離橋頭 26 公尺 —— 給的不是入口的厚度，而是**走到廳中央時另一側的那一道**
   * （整片土地只搜得到這一種合法擺法：4,127 個格點 → 1 個候選）。
   */
  {
    id: 'divergence-second-fork',
    region: 'divergence',
    at: [84, 4.5],
    rot: 2.7489,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 觀象臺 · 「坡上的那一階」（v1.2 · P16b）
   *
   * 整片坡由西南（橋頭）往東北仰起來，所以「朝天的鏡」原本從橋頭就看得到 ——
   * 一片只有高度、沒有厚度的土地。這一道橫在離橋頭 12 公尺處。
   *
   * **它是全場最緊的一道**：`screen-fit` 用 0.3 公尺格點 × 36 個角度掃過 19,339 個格點，
   * 擋在視線上又離橋頭夠遠的擺法裡，**41,747 種踩到別人的淨空，只有 8 種活下來**
   * —— 而那 8 個全擠在 ±1 公尺內，等於整片土地只有這一塊空地。
   * 量到的揭露是**前 12 公尺看不到、第 12 公尺揭露**
   * —— 剛好等於 `HIDDEN_MIN`，而樣點每 3 公尺一個，所以再退一格就是 9（不過）。
   * 動這一區的路、石座或這一道之前先跑 `npm run audit:sightline`。
   */
  {
    id: 'sight-first-ledge',
    region: 'sight',
    at: [114, -21],
    rot: 2.2253,
    kind: 'stairRidge',
    length: 8,
    depth: 2.4,
    height: 10,
    faceSign: 1,
  },
  /*
   * 觀象臺 · 第二道：「坡頂北側的一階」
   *
   * 不負責擋視線，負責的是「往上走的時候左手邊有一階掠過」。矮一階（8 公尺）。
   * 912 種合法擺法裡挑的是**離那條折線最遠**的那一個：另外三個候選
   * （[109.5, -29.5]／[113, -31.5]／[122, -26.5]）看起來都過，
   * 但把它們塞進世界之後路就從石頭中間穿過去 —— 而且 [122, -26.5] 那一個
   * 還會把揭露從「第 12 公尺」推到「第 33 公尺」（超過 25 的門檻）。
   * **第二道帶也會改變揭露**：它不負責擋，不代表它不會擋。
   */
  {
    id: 'sight-second-ledge',
    region: 'sight',
    at: [123, -1],
    rot: 0.5236,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 護欄崗 · 「門邊那一道」（v1.2 · P16b）
   *
   * **這一道不擋地標，它只給入口厚度**（登記在下面的 `SIGHT_EXEMPT`）——
   * 護欄崗量到「擺不下會擋視線的那一道」：`screen-fit` 掃過 5,499 個格點 × 30 個角度，
   * 擋在「橋頭 → 不會關上的門」那條直線上的擺法有 6,079 種，**每一種都踩到石座的淨空**，
   * 最好的那一種離 `speaking-letter-75` 6.61 公尺、差 **0.61 公尺**（需要 7.22）。
   * 這一道站在哨所的西側：走進來的時候它從左手邊掠過，這片土地因此有了厚度。
   */
  {
    id: 'wards-first-jamb',
    region: 'wards',
    at: [91.5, -136.5],
    rot: 1.0472,
    kind: 'stairRidge',
    length: 7,
    depth: 2.4,
    height: 8,
    faceSign: 1,
  },
  /*
   * 護欄崗 · 第二道：「門的另一邊」
   *
   * **厚度 2.4 → 2.0**（整份資料裡唯一的一道）：厚 2.4 的碰撞圓半徑是 1.2，
   * 護欄崗擠到「最好的一種擺法離 `letters-in-disguise-131` 7.31 公尺、需要 7.42」——
   * 差 0.11 公尺。薄一階之後圓半徑 1.0、需要 7.22，同一塊空地就站得下了
   * （§4.10 的厚度區間本來就是 2–3 公尺，2.0 是下限不是例外）。
   * 它與第一道一西一南夾著入口：第一道離橋頭 14.2 公尺，這一道 10.3 公尺。
   */
  {
    id: 'wards-second-jamb',
    region: 'wards',
    at: [104.2, -143.2],
    rot: 2.3038,
    kind: 'stairRidge',
    length: 7,
    depth: 2,
    height: 8,
    faceSign: 1,
  },
]);

/**
 * **登記例外：這片土地擺不下「會擋住地標」的那一道帶。**
 *
 * `scripts/sightline-audit.mjs` 的硬門檻（前 12 公尺看不到、25 公尺內揭露）
 * 問的是「地標有沒有被擋住」。一片土地只要有帶就會被問到 —— 這在 P16b 之前
 * 永遠成立，因為每一片有帶的土地都有一道**負責擋**的第一道。
 * 護欄崗是第一個反例：它擺得下入口那一道，卻擺不下會擋視線的那一道
 * （數字寫在上面 `wards-first-jamb` 的註解裡，也寫在 WORLD.md §4.10）。
 *
 * 例外要**登記**、要寫理由、要說得出還差多少（同 §6.4 橋上缺口那一條的規矩）。
 * `test:rubric` 守著兩件事：① 登記的土地必須真的有帶（沒帶就不必例外）；
 * ② 它的每一道帶都**不能**擋在「橋頭 → 地標」那條直線上
 * —— 哪一天有人擺得下真的擋得住的那一道，這條例外就會紅，該拿掉。
 */
export const SIGHT_EXEMPT = Object.freeze({
  wards:
    '護欄崗：6,079 種擋得住視線的擺法全部踩到石座淨空，最好的一種離 speaking-letter-75 ' +
    '6.61 公尺、差 0.61 公尺（需要 7.22）。這裡的帶只負責入口的厚度。（v1.2 · P16b 量的）',
});

/**
 * 母題：同一個形狀重複出現，遠看就認得出這是哪一片土地（研究 M8 / Sky 的 repeated motif）。
 *
 * `at`     世界座標 [x, z]
 * `rot`    繞 Y 的旋轉（弧度）
 * `kind`   造型（一片土地只准一種）：
 *          `twiceShown`（階梯迴廊）示範了兩遍的階梯、`pageStack`（沉書檔案庫）讀過的那一疊、
 *          `oneSmallPiece`（齒輪工坊）一次只吊一小件、`emptyMask`（面具劇場）掛著的空面具、
 *          `unnamedTool`（契約鍛冶場）未命名的工具
 * `height` 整座的高度（公尺，中景階 3–8）
 *
 * 擺位規則（量得出來的三條，`scripts/screen-fit.mjs` 與 `test:rubric` 用同一份門檻）：
 *   ① 離走出來的那條路 **7–26 公尺**：看得到、走得過去、不擋路
 *      （也一定落在節奏稽核的 45 公尺中景圈內）。
 *   ② 每一塊腳下的地 `coverage ≥ 0.96` —— **不准踩在崩掉的邊緣上**，
 *      不然外側那塊會懸在虛空上方（P11 審查抓到的 01／03 就是這樣）。
 *   ③ 各塊之間的地形落差 ≤ 1.1 公尺：讀得出是同一組東西，不是一半埋在山坡裡。
 */
export const MOTIFS = Object.freeze([
  /*
   * 階梯迴廊：三座散在路旁，彼此 ≥40 公尺 —— 每一座都朝著不同方向，
   * 因為每一次示範都是給不同的人看的。
   *
   * P11 原本放了四座，但其中三座離「走出來的那條路」只有 2.6／5.1／5.8 公尺 ——
   * §4.10 白紙黑字寫著 7–26，那條規則當時只活在工具裡、沒有進測試（P12 補上了硬斷言，
   * 補上的當天就抓到這三座）。重搜之後這片土地只擺得下三座，那就三座。
   */
  { id: 'reasoning-twice-01', region: 'reasoning', at: [-88.46, -65.22], rot: 2.15, kind: 'twiceShown', height: 5.2 },
  { id: 'reasoning-twice-02', region: 'reasoning', at: [-112, -126], rot: 0.52, kind: 'twiceShown', height: 4.6 },
  { id: 'reasoning-twice-03', region: 'reasoning', at: [-60, -95], rot: 1.57, kind: 'twiceShown', height: 4.0 },
  /*
   * 沉書檔案庫：「讀過的那一疊」——矮台上立著一疊讀完的石板書，
   * 最上面那一頁翻開來懸在半空、只剩一圈光（枯掉的那幾頁）。
   *
   * **這一片土地沒有遮擋帶**，不是忘了放：`scripts/screen-fit.mjs` 沿橋頭到藏書之樹那 38 公尺
   * 逐點掃過，離軸線每一個側距上，`laden-desk-27`（t=10.6, s=-7.1）、`archive-seal-25`（t=14.7, s=7.8）
   * 與月井（t=18.2, s=-2.8）三個淨空圈把 6–22 公尺整段蓋滿 —— 合法的擺法只出現在離橋頭 7–11 公尺處，
   * 那個距離揭露得太早（實測前 9 公尺就看得到塔），過不了「前 12 公尺看不到」那條硬門檻。
   * 與其放一道過不了門檻的帶，不如誠實地留白，改用母題鋪中景（見 findings.md）。
   */
  { id: 'grounding-read-01', region: 'grounding', at: [128, -104], rot: 5.24, kind: 'pageStack', height: 5.2 },
  { id: 'grounding-read-02', region: 'grounding', at: [112, -90], rot: 4.71, kind: 'pageStack', height: 4.6 },
  { id: 'grounding-read-03', region: 'grounding', at: [76, -91], rot: 4.71, kind: 'pageStack', height: 5.0 },
  { id: 'grounding-read-04', region: 'grounding', at: [62, -107], rot: 4.19, kind: 'pageStack', height: 4.2 },
  /*
   * 齒輪工坊：「一次只吊一小件」——一截矮桁架撐著一段折下來的臂，
   * 末端吊著一小件，再往前那一節只剩懸在半空的光。
   *
   * **這一片土地也沒有遮擋帶**，理由同上而且更絕對：`screen-fit` 在整片土地上
   * **一個**合法的擺法都找不到（0 個候選）——`endpoint-stake-81`（t=7.2, s=-4.6）與
   * `nailed-rules-89`（t=18.8, s=1.7）兩個石座的淨空圈在軸線上首尾相接，
   * 從橋頭到巨臂吊車的 1–26 公尺沒有一寸放得下一道帶。
   */
  { id: 'orchestration-piece-01', region: 'orchestration', at: [-102, 119], rot: 0, kind: 'oneSmallPiece', height: 5.0 },
  { id: 'orchestration-piece-02', region: 'orchestration', at: [-84, 125], rot: 0.52, kind: 'oneSmallPiece', height: 4.4 },
  { id: 'orchestration-piece-03', region: 'orchestration', at: [-110, 86], rot: 1.05, kind: 'oneSmallPiece', height: 4.8 },
  { id: 'orchestration-piece-04', region: 'orchestration', at: [-115, 68], rot: 0, kind: 'oneSmallPiece', height: 4.0 },
  /*
   * 面具劇場：「掛著的空面具」——底座撐起一根柱，柱頂掛著一張沒有人戴的面具，
   * 背面刻的那一句只剩一圈光（「你不是它」）。
   */
  { id: 'config-mask-01', region: 'config', at: [117, 68], rot: 2.62, kind: 'emptyMask', height: 5.4 },
  { id: 'config-mask-02', region: 'config', at: [110, 86], rot: 0, kind: 'emptyMask', height: 4.6 },
  { id: 'config-mask-03', region: 'config', at: [115, 124], rot: 3.67, kind: 'emptyMask', height: 5.0 },
  { id: 'config-mask-04', region: 'config', at: [83, 128], rot: 2.62, kind: 'emptyMask', height: 4.2 },
  /*
   * 契約鍛冶場（v1.2 · P16a）：「未命名的工具」——矮鍛台上立著一把工具的柄，
   * 該刻名字的那一格是空的，刃只剩光。這片土地 P12 就有兩道遮擋帶，
   * 卻一直沒有母題（走進去只有入口有厚度、內圈是空的）；
   * `screen-fit` 掃出 75 個合法擺法，選的是四周 16/16、彼此都散得開的那四個。
   */
  { id: 'toolcraft-unnamed-01', region: 'toolcraft', at: [-122, -16], rot: 3.67, kind: 'unnamedTool', height: 5.2 },
  { id: 'toolcraft-unnamed-02', region: 'toolcraft', at: [-149, -22], rot: 1.05, kind: 'unnamedTool', height: 4.6 },
  { id: 'toolcraft-unnamed-03', region: 'toolcraft', at: [-135.5, 11.5], rot: 1.57, kind: 'unnamedTool', height: 4.8 },
  { id: 'toolcraft-unnamed-04', region: 'toolcraft', at: [-117, 15], rot: 1.05, kind: 'unnamedTool', height: 4.2 },
]);

/**
 * 高台（v1.2 · P14）：**站得上去的那一階**。
 *
 * 這是中觀層的第三種東西，也是第一種**為了跳躍而存在**的東西。
 * P13 把「頂面站不站得上去」量成了資料（`standable`／`standTop`／`standR`），
 * P14 把它接到玩家腳下 —— 這一格自己蓋第一座，證明「跳上去、站得住、走下來」整條路成立。
 *
 * `at`      世界座標 [x, z]（用 `npm run screen-fit --kind platform` 搜出來的，不是手挑的）
 * `rot`     繞 Y 的旋轉（弧度）—— 只影響刻線與裝飾的朝向，圓的頂面本來就沒有正面
 * `kind`    造型：頂面**一律是圓的**（理由見 `buildStepStone`），變的是裙與外圈的語彙 ——
 *           `stepStone`（中央高原）素石鼓、`pageStep`（沉書檔案庫）翻過的那一疊、
 *           `maskStep`（面具劇場）裙上一張很淺的面具、`gaugeStep`（量器坊）外圈一圈刻度、
 *           `twiceStep`（示範與推理）兩級小階＋第三級只剩光、`hoistStep`（齒輪工坊）吊著一小件、
 *           `takenStep`（減法之庭）只剩四個空托座、`mirrorStep`（校驗場）一圈磨過的鏡面
 * `height`  頂面離自己腳下的地多高（公尺）
 * `radius`  石鼓的半徑（公尺）＝ 登記的碰撞半徑
 * `reveals` （選配，v1.2 · P15）**站上來才搆得到的那一件東西**的 id（`src/data/secrets.json`
 *           裡 `tell: "high"` 的那一處）。有這個欄位的高台就不是裝飾：它是一句
 *           「上面有東西」的地圖語法，而且量得出來 —— 腳在地上搆不到、腳在頂面才搆得到。
 *
 * 三條它自己的規則（`test:rubric` 與 `screen-fit` 用同一份門檻）：
 *   ① 高度落在 `PLATFORM_HEIGHT_MIN`–`PLATFORM_HEIGHT_MAX`，而且**一定在 `STAND_MIN_H`–`STAND_MAX_H` 之內**
 *      —— 蓋一座跳不上去的高台等於蓋一面牆。**下限 1.2 → 1.6（v1.2 · P15）**：
 *      1.6 是 `EYE_HEIGHT`，比它矮的頂面站在地上就看得完，「上面有東西」這句話說不出口。
 *      上限那一邊真正在守的是**離散彈道的頂點**（`jump.js` 的 `simulateApex()`）——
 *      `test:rubric` 逐座驗「跳得上去還有 0.3 公尺餘裕」，所以 2.4 只是資料的天花板，
 *      現行出貨的每一座都在 1.7 以下。
 *   ② 半徑 ≥ `PLATFORM_RADIUS_MIN`：頂面量出來的 `standR` 要 ≥ `PLATFORM_STAND_R_MIN`（1.2），
 *      不然人站上去一動就掉下來。
 *   ③ 其餘擺位規則與母題**共用同一套**（離路網 7–26、離互動圈、離主動線、離閘門、
 *      腳下覆蓋率、四周繞得過去、逐塊貼地）—— 不另訂一份會分家的門檻。
 */
export const PLATFORM_HEIGHT_MIN = 1.6;
export const PLATFORM_HEIGHT_MAX = 2.4;
export const PLATFORM_RADIUS_MIN = 1.4;
export const PLATFORM_RADIUS_MAX = 3.2;
/** 頂面「證明過是平的」那一段至少要有多寬（公尺）—— 站得住一個人（玩家半徑 0.62）還有餘。 */
export const PLATFORM_STAND_R_MIN = 1.2;
/**
 * **從四周每一個起跳點都要跳得上去**時，要留多少餘裕（公尺，v1.2 · P15）。
 *
 * 這一條是 P15 的 e2e 逼出來的：`height` 量的是「頂面離**自己腳下**的地多高」，
 * 可是玩家是站在**旁邊**起跳的。地形一斜，同一座高台從高的那一側是 1.2 公尺、
 * 從低的那一側可能是 2.6 公尺 —— 於是它 `standable` 為真、`height` 合法、
 * 稽核全綠，**卻有一半的方向跳不上去**（P14 交接點名的「別做那個」，
 * 只是這一次不是資料寫太高，是地形替你寫高的）。
 *
 * 判準：起跳圈（碰撞半徑 ＋ 玩家半徑 ＋ 0.5）上每一個**站得住**的方向，
 * `standTop − 那一點的地形高度` 都要 ≤ 離散彈道頂點 − 這個餘裕。
 * 0.2 是實測訂的：P14 那座已經出貨、跑得動的第一階，最差的方向餘裕是 0.31。
 */
export const PLATFORM_JUMP_MARGIN = 0.2;
/** 起跳圈離碰撞圓外緣多遠（公尺）—— 玩家半徑 ＋ 一點點站得住的餘地。 */
export const PLATFORM_TAKEOFF_PAD = 0.5;

/**
 * 從四周量「這座高台從每一個方向跳不跳得上去」。
 * **搜尋工具（`screen-fit`）、`test:rubric` 與遊戲問的是同一支。**
 *
 * @param {{x:number, z:number, r:number, standTop:number}} disc 圓心、碰撞半徑、頂面世界高度
 * @param {(x:number,z:number)=>number} heightAt
 * @param {(x:number,z:number)=>boolean} walkableAt 那一點站不站得住（站不住的方向不算）
 * @param {number} [n] 取樣幾個方向
 * @returns {{worst:number, best:number, samples:number, at:number[]|null}}
 *   `worst` ＝ 最難的那一個方向要爬多高（公尺）；`at` ＝ 那一點的座標
 */
export function platformRise(disc, heightAt, walkableAt, n = 24) {
  const d = disc.r + 0.62 + PLATFORM_TAKEOFF_PAD;
  let worst = -Infinity;
  let best = Infinity;
  let samples = 0;
  let at = null;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const x = disc.x + Math.cos(t) * d;
    const z = disc.z + Math.sin(t) * d;
    if (walkableAt && !walkableAt(x, z)) continue;
    samples += 1;
    const rise = disc.standTop - heightAt(x, z);
    if (rise > worst) {
      worst = rise;
      at = [Number(x.toFixed(2)), Number(z.toFixed(2))];
    }
    if (rise < best) best = rise;
  }
  return { worst, best, samples, at };
}

export const PLATFORMS = Object.freeze([
  /*
   * 中央高原 · 第一階（v1.2 · P14）
   *
   * 高原是所有人出發的地方，可是它從頭到尾只有一個高度 —— 平的。
   * 第一階是這片土地上第一個「上面」：一塊被踩得發亮的圓石鼓，
   * 頂面刻著一圈細線（自發光，0 光源），從遠處看得出那一圈光是**平的**，
   * 不是又一顆石頭。形狀自己說「這個可以站上去」，一個字都不寫。
   */
  {
    id: 'foundations-first-step',
    region: 'foundations',
    at: [24, -12],
    rot: 0,
    kind: 'stepStone',
    height: 1.6,
    radius: 2.6,
  },
  /*
   * 中央高原 · 第二階（v1.2 · P15）—— **這一座頂上有東西**。
   *
   * 第一階教你「這個可以站上去」，第二階回答「站上去換得到什麼」：
   * 頂面上躺著一件只有站上來才搆得到的東西（`reveals` 指的那一處祕密）。
   * 從地上看不到它 —— 頂面離地 1.6 公尺（＝ `EYE_HEIGHT`），
   * 平躺在上面的東西從下面只看得到石鼓的側面。
   */
  {
    id: 'foundations-second-step',
    region: 'foundations',
    at: [-23, -37],
    rot: 0.4,
    kind: 'stepStone',
    height: 1.6,
    radius: 1.6,
    reveals: 'ledger-of-the-unsaid',
  },
  /*
   * 沉書檔案庫（v1.2 · P15）：**讀過的那一疊**——石鼓的裙是一疊翻過的石板書。
   * 造型語彙照這片土地的母題（`pageStack`，§4.10 ②）：同一個形狀在遠處重複出現，
   * 走近才發現這一疊是可以站上去的那一疊。
   */
  {
    id: 'grounding-read-step',
    region: 'grounding',
    at: [80, -117],
    rot: 0.9,
    kind: 'pageStep',
    height: 1.6,
    radius: 1.6,
    reveals: 'margin-of-the-unread',
  },
  /*
   * 面具劇場（v1.2 · P15）：**沒有人站的那一階**——石鼓的裙上浮著一張很淺的面具浮雕，
   * 頂面空著（這片土地的語彙：掛著的空面具、「你不是它」）。
   */
  {
    id: 'config-gallery-step',
    region: 'config',
    at: [115, 98],
    rot: 2.6,
    kind: 'maskStep',
    height: 1.6,
    radius: 1.6,
    reveals: 'understudy-mark',
  },
  /*
   * 量器坊（v1.2 · P15）：**一格一格的那一階**——鼓身外圈刻著一圈刻度，
   * 其中一格比別格長（這片土地的語彙：刻度之柱、量得準不準先看有沒有同一個零）。
   */
  {
    id: 'forms-gauge-step',
    region: 'forms',
    at: [13, 144],
    rot: 1.8,
    kind: 'gaugeStep',
    height: 1.6,
    radius: 1.6,
    reveals: 'zeroless-rule',
  },
  /*
   * 量器坊 · 第二階（v1.2 · P16a）：同一片土地的第二格刻度。
   * 母題「同一個形狀重複出現」那條規矩對高台一樣成立 —— 一片土地一種造型，
   * 所以它與第一階同為 `gaugeStep`：遠看認得出是同一把尺上的兩格。
   */
  {
    id: 'forms-second-gauge-step',
    region: 'forms',
    at: [-4, 140],
    rot: 0.62,
    kind: 'gaugeStep',
    height: 1.6,
    radius: 1.4,
  },
  /*
   * 示範與推理（v1.2 · P16a）：**示範了兩遍的那一階**——裙上貼著兩級很淺的小階，
   * 第三級抬起來、只剩一圈光（母題 `twiceShown` 的同一句話：
   * 「師傅只示範兩遍，第三遍要你自己踏出來」）。真的踏得上去的是石鼓本身。
   *
   * **整片土地只有這一個落點**：格點掃到 0.25 公尺才找得到它
   * （2 公尺的格點掃出 0 個，0.5 公尺掃出的那一個「四周繞不過去」）。
   * 這一片是全場最擠的 —— 三座母題 ＋ 兩道石脊 ＋ 石座的淨空圈幾乎鋪滿內圈。
   */
  {
    id: 'reasoning-third-step',
    region: 'reasoning',
    at: [-112.75, -107.25],
    rot: 2.15,
    kind: 'twiceStep',
    height: 1.6,
    radius: 1.4,
  },
  /*
   * 齒輪工坊（v1.2 · P16a）：**吊上來的那一階**——裙邊伸出一截短臂，
   * 臂端吊著一小件；再往前那一節只剩光（母題 `oneSmallPiece` 的同一句話）。
   */
  {
    id: 'orchestration-hoist-step',
    region: 'orchestration',
    at: [-74, 85],
    rot: 0.9,
    kind: 'hoistStep',
    height: 1.6,
    radius: 1.4,
  },
  /*
   * 減法之庭（v1.2 · P16a）：**被搬空的那一座**——鼓身外圈只留四個空托座，
   * 被拿走的那件東西只剩一圈懸在半空的光（地標「空的基座」的同一句話：學會拿掉）。
   * 這片土地的規矩與別區相反 —— 東西要少，所以裙上一個字、一件雜物都沒有。
   */
  {
    id: 'frugality-emptied-step',
    region: 'frugality',
    at: [9, -69.5],
    rot: 0.3,
    kind: 'takenStep',
    height: 1.6,
    radius: 1.4,
  },
  /*
   * 校驗場 · 兩面互相照著的那兩階（v1.2 · P16a）。
   * 這片土地的地貌就是「一條淺谷把院子分成幾乎一樣高的兩半」——
   * 所以它是第一片**刻意擺兩座**的加建：谷的兩邊各一座，
   * 裙上都嵌著一圈被磨過的鏡面，站在其中一座上看得到另一座（改自己寫過的字）。
   */
  {
    id: 'refinery-first-mirror-step',
    region: 'refinery',
    at: [-138, 156.5],
    rot: 1.2,
    kind: 'mirrorStep',
    height: 1.6,
    radius: 1.4,
  },
  {
    id: 'refinery-second-mirror-step',
    region: 'refinery',
    at: [-153.5, 109],
    rot: 4.3,
    kind: 'mirrorStep',
    height: 1.6,
    radius: 1.4,
  },
]);

/**
 * 走出來的路怎麼繞過石脊（世界座標的折點，由橋往區內排）。
 *
 * 只有「有遮擋帶的區」需要；沒有登記的區照舊是一條直線。
 * `buildPathNetwork()`（畫在地上的路）與 `scripts/sightline-audit.mjs`（量揭露的腳本）
 * 讀的是同一份 —— 路與稽核不會各走各的。
 */
export const PATH_BENDS = Object.freeze({
  // 面具劇場：繞過「側幕」的南端（v1.2 · P12，`scripts/screen-fit.mjs` 產生、重建驗過）
  config: Object.freeze([
    [68.13, 68.13], // 橋頭
    [79.34, 71.26], // 走到側幕正面前 —— 拱門還在它背後
    [85.35, 70.2], // 貼著那一面滑到南端
    [86.67, 77.68], // 繞過端點 —— 拱門在這裡揭露
    [89.17, 82.88],
  ]),
  // 契約鍛冶場：繞過「立起來的工作檯」的北端
  toolcraft: Object.freeze([
    [-88, 0], // 橋頭
    [-105.1, 4.29],
    [-110.38, 7.34],
    [-114.18, 0.76],
    [-117.13, 0.53],
  ]),
  // 量器坊：繞過「立起來的那一階刻度」的西端（v1.2 · P16a，`screen-fit` 產生、重建驗過）
  forms: Object.freeze([
    [0, 88], // 橋頭
    [-2.02, 94.33], // 走到那一道正面前 —— 刻度之柱還在它背後
    [-7.91, 92.75], // 貼著那一面滑到西端
    [-9.88, 100.09], // 繞過端點 —— 柱在這裡揭露
    [-6.91, 107.26],
  ]),
  // 觀象臺：繞過「坡上的那一階」的南端（v1.2 · P16b，`screen-fit` 產生、折點逐點重建驗過）
  sight: Object.freeze([
    [108.23, -14.54], // 橋頭
    [110.99, -18.69], // 走到那一階正面前 —— 朝天的鏡還在它背後
    [106.97, -23.92], // 貼著那一面滑到南端
    [110, -28.55], // 繞過端點 —— 鏡在這裡揭露（自動產生的 113 那一點被石頭堵住，往西挪 3 公尺）
    [113.8, -31.28], // 最後一段往南收 —— 自動產生的 123.8 那一段會從一顆石頭中間穿過去
  ]),
  // 分歧之廳：繞過「岔開的那一道」的東端（v1.2 · P16b）
  divergence: Object.freeze([
    [59.59, 13.33], // 橋頭
    [62.73, 21.5], // 走到那一道正面前 —— 兩面的柱還在它背後
    [63.59, 14.96], // 貼著那一面滑到端點
    [71.13, 15.95], // 繞過端點 —— 柱在這裡揭露
    [76.79, 20.47],
  ]),
  reasoning: Object.freeze([
    [-68.13, -68.13], // 橋頭：主動線的內端（區界再往裡 8 公尺）
    [-67.49, -75.13], // 繞過橋頭第一座石座，往北偏
    [-70.18, -79.51], // 貼著第一遍那道背脊的面走
    [-69.9, -84.04], // 繞過它的北端 —— 塔在這裡揭露
    [-71.67, -90.05],
    [-78.38, -93.23], // 從小景北側繞回塔的方向
  ]),
});

/**
 * 一條橋在「區內那一段」的折線（世界座標）：中央高原中心 → 折點… → 該區中心。
 *
 * @param {{from:{x:number,z:number}, to:{x:number,z:number}, region:string}} corridor
 * @param {Record<string, number[][]>} [bendTable] 折點表；預設就是上面那一份。
 *   只有 `scripts/screen-fit.mjs`（「改資料 → 重建世界 → 量」的搜尋迴圈）會換掉它 ——
 *   遊戲與稽核腳本一律走預設值，兩邊不會各走各的。
 * @returns {number[][]} [[x, z], …]，至少兩點
 */
export function corridorPolyline(corridor, bendTable = PATH_BENDS) {
  const bends = (bendTable && bendTable[corridor.region]) || [];
  return [[corridor.from.x, corridor.from.z], ...bends.map((p) => [p[0], p[1]]), [corridor.to.x, corridor.to.z]];
}

/* ------------------------------------------------------------------ *
 * 足跡（給碰撞、擺位規則與視線稽核用的純資料）
 * ------------------------------------------------------------------ */
/**
 * 一道遮擋帶的矩形足跡（2D）。
 * @param {object} band
 * @returns {{cx:number, cz:number, ux:number, uz:number, vx:number, vz:number, halfLen:number, halfDepth:number}}
 */
export function bandFootprint(band) {
  const c = Math.cos(band.rot);
  const s = Math.sin(band.rot);
  // three.js 的 rotation.y = θ 把局部 +X 送到世界 (cosθ, -sinθ)
  return {
    cx: band.at[0],
    cz: band.at[1],
    ux: c,
    uz: -s,
    vx: s,
    vz: c,
    halfLen: band.length / 2,
    halfDepth: band.depth / 2,
  };
}

/**
 * 一道遮擋帶**登記出來的碰撞圓**（純資料，與 `collectSolids()` 的 `solidSpan` 展開法同一套）。
 *
 * 為什麼要有這一支：`scripts/screen-fit.mjs` 的離線篩以前只看石脊的**中心**，
 * 於是「中心離石座夠遠、兩端卻踩進去」的候選會一路混到重建那一段才被打回票 ——
 * 一次 0.5 秒，白花的都是這種。這裡把圓算出來，離線就能用**真正的門檻**篩。
 * `test:rubric` 會逐圓比對它與蓋出來的世界一致（算錯了就等於篩子壞了）。
 *
 * @param {object} band
 * @returns {Array<{x:number, z:number, r:number}>}
 */
export function bandSolidCircles(band) {
  const f = bandFootprint(band);
  const r = Math.max(f.halfDepth, SOLID_MIN_R);
  const reach = Math.max(0, f.halfLen - r);
  const n = Math.max(1, Math.ceil(reach / (r * 0.8)) + 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : -reach + (i * (reach * 2)) / (n - 1);
    out.push({ x: f.cx + f.ux * t, z: f.cz + f.uz * t, r });
  }
  return out;
}

/**
 * 一個點離一道遮擋帶的**核心矩形**多遠（公尺，在矩形裡就是 0）。
 *
 * 為什麼要有這一支（v1.2 · P16a）：母題與高台的擺位規則一路只跟**彼此**比距離
 * （`MOTIF_GAP`／`PLATFORM_MOTIF_GAP`），跟**遮擋帶**之間一條都沒有 ——
 * 於是先擺帶、再搜高台，搜尋器會理直氣壯地把高台放在離石脊 0.45 公尺的地方
 * （P16a 實測：`reasoning-third-step` 第一版就是這樣被搜出來的），
 * 兩顆碰撞圓直接疊在一起。中心距不夠用（帶是長條，中心離得遠不代表端點離得遠），
 * 所以量的是離**核心矩形**的距離。搜尋器、`--verify` 與 `test:rubric` 共用這一支。
 *
 * @param {object} band
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function bandCoreDistance(band, x, z) {
  const f = bandFootprint(band);
  const dx = x - f.cx;
  const dz = z - f.cz;
  const a = Math.max(0, Math.abs(dx * f.ux + dz * f.uz) - f.halfLen);
  const b = Math.max(0, Math.abs(dx * f.vx + dz * f.vz) - f.halfDepth);
  return Math.hypot(a, b);
}

/** 這個點在不在某一道遮擋帶的足跡裡（可加外擴，例如玩家半徑）。 */
export function pointInBand(band, x, z, pad = 0) {
  const f = bandFootprint(band);
  const dx = x - f.cx;
  const dz = z - f.cz;
  const a = Math.abs(dx * f.ux + dz * f.uz);
  const b = Math.abs(dx * f.vx + dz * f.vz);
  return a <= f.halfLen + pad && b <= f.halfDepth + pad;
}

/**
 * 線段 (ax,az)→(bx,bz) 有沒有穿過這道遮擋帶的足跡（含起點就在裡面的情形）。
 * 用「投影到石脊的局部座標，再做矩形裁剪（Liang–Barsky）」，不開根號、不配置。
 * @returns {null|{tEnter:number, tExit:number}} 進 / 出的參數（0–1），沒穿過就是 null
 */
export function segmentCrossesBand(band, ax, az, bx, bz, pad = 0) {
  const f = bandFootprint(band);
  // 起點與方向在石脊局部座標（u = 長邊、v = 短邊）
  const p0u = (ax - f.cx) * f.ux + (az - f.cz) * f.uz;
  const p0v = (ax - f.cx) * f.vx + (az - f.cz) * f.vz;
  const du = (bx - ax) * f.ux + (bz - az) * f.uz;
  const dv = (bx - ax) * f.vx + (bz - az) * f.vz;
  const hu = f.halfLen + pad;
  const hv = f.halfDepth + pad;

  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    // p * t <= q
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-du, p0u + hu)) return null;
  if (!clip(du, hu - p0u)) return null;
  if (!clip(-dv, p0v + hv)) return null;
  if (!clip(dv, hv - p0v)) return null;
  return { tEnter: t0, tExit: t1 };
}

/** 眼睛離地（公尺）—— 視線判定與 `scripts/sightline-audit.mjs` 共用同一個值。 */
export const EYE_HEIGHT = 1.6;

/**
 * 站在 (x, z) 看得到那座地標嗎？—— **遊戲與稽核腳本共用的同一支判定**
 * （e2e 走進去問的是這一支，`scripts/sightline-audit.mjs` 沿路取樣問的也是這一支）。
 *
 * 兩層判定：
 *   `flat`  水平：樣點 → 地標中心的線段有沒有穿過某一道遮擋帶的**核心矩形**
 *           （扶壁與頂階不算 —— 量到的一定比看到的少）。這是 P11 規格的門檻。
 *   `hidden` 再加上垂直：擋住的那一道，它的頂緣仰角有沒有蓋過地標頂的仰角。
 *           一座 26 公尺的塔在 38 公尺外，光有「帶高 ≥ 6 公尺」是擋不住塔頂那顆光球的。
 *
 * @param {number} x
 * @param {number} z
 * @param {{at:number[], height:number}} landmark
 * @param {(x:number,z:number)=>number} heightAt
 * @param {object[]} bands 這一區的遮擋帶
 * @param {number|null} [eyeAt] **眼睛的世界高度**（不給就是「站在地上」＝ 腳下地形 ＋ `EYE_HEIGHT`）。
 *   v1.2 · P15 加的：高台的驗收是「**站上去**看得到別的東西」——
 *   同一個 (x, z)、只有眼睛高了 1.6–2.4 公尺，答案就要從「擋住」翻成「看得到」。
 *   幾何上一定成立的方向：眼睛抬高 h，地標的仰角只降 h/dLand，
 *   石脊頂的仰角卻降 h/dBand（dBand < dLand）—— 抬高只會讓遮蔽變少，不會變多。
 * @returns {{hidden:boolean, flat:boolean, by:string|null, need:number, have:number}}
 */
export function landmarkSight(x, z, landmark, heightAt, bands, eyeAt = null) {
  const eyeY = Number.isFinite(eyeAt) ? eyeAt : heightAt(x, z) + EYE_HEIGHT;
  const topY = heightAt(landmark.at[0], landmark.at[1]) + landmark.height;
  const dLand = Math.max(0.001, Math.hypot(landmark.at[0] - x, landmark.at[1] - z));
  const need = (topY - eyeY) / dLand;
  let flat = false;
  let by = null;
  let best = -Infinity;
  for (const band of bands) {
    const hit = segmentCrossesBand(band, x, z, landmark.at[0], landmark.at[1]);
    if (!hit) continue;
    const ex = x + (landmark.at[0] - x) * hit.tEnter;
    const ez = z + (landmark.at[1] - z) * hit.tEnter;
    const dBand = Math.max(0.001, Math.hypot(ex - x, ez - z));
    const have = (heightAt(ex, ez) + band.height - eyeY) / dBand;
    if (!flat) {
      flat = true;
      by = band.id;
    }
    if (have > best) {
      best = have;
      if (have >= need) by = band.id;
    }
  }
  return { hidden: flat && best >= need, flat, by, need, have: best };
}

/* ------------------------------------------------------------------ *
 * 幾何
 * ------------------------------------------------------------------ */
/**
 * 一道遮擋帶。
 *
 * 核心是沿著長邊排的幾塊石板，**每一塊各自貼自己腳下的地**（P10a 的教訓：
 * 一個舞台原點配上散在幾公尺外的零件，就會做出一排浮在半空的牆）；
 * 每一塊的頂都在「自己腳下的地 + height」，所以稽核量到的那個矩形一定是實心的。
 * 剪影靠兩樣東西讀成「一段被走上去的階梯」而不是一面牆：朝橋頭那一面的一級矮階，
 * 以及疊在核心頂上、一階比一階高的頂階（**只往上長，不占地**）。
 *
 * **碰撞（v1.2 · P12 收斂）**：整道石脊只登記**一個** `solidSpan` 節點 ——
 * 半徑 ＝ 半個厚度、沿長邊排一串圓，覆蓋每一塊核心石板的中心。
 * P11 的作法是「每塊石板自己一串 ＋ 扶壁再一串」＝ 一道帶 12 個碰撞體，
 * 12 片土地鋪完會逼近 1,400 的硬上限；現在一道帶 4–5 個。
 * 換來的條件是石脊要**夠厚**（`depth` 2–3 公尺）—— 圓串的半徑就是半個厚度，
 * 薄的石脊需要更多、更小的圓才蓋得住同一段長度。**不准**用「比石脊胖的圓」去省數量：
 * 那正是 `solidSpan` 當初要解掉的「離它兩公尺外就撞到看不見的牆」。
 * 朝橋頭那一面的矮階刻意壓在 `APRON_HEIGHT`（< 0.9 公尺）以下 ——
 * 照 §6.3 的第二條它「跨得過去」，所以不必也不該有自己的碰撞體。
 */
function buildStairRidge(band, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `screen:${band.id}`;
  const f = bandFootprint(band);
  const SEG = Math.max(3, Math.round(band.length / 2.6));
  const segLen = band.length / SEG;
  const face = band.faceSign || 1;

  const at = (u, v) => [f.cx + f.ux * u + f.vx * v, f.cz + f.uz * u + f.vz * v];

  for (let i = 0; i < SEG; i += 1) {
    const u = -band.length / 2 + segLen * (i + 0.5);
    const [x, z] = at(u, 0);
    const ground = heightAt(x, z);
    /*
     * 核心：**每一塊各自貼自己腳下的地**（P10a 的教訓），往下多埋 1.6 公尺咬進階地的落差，
     * 往上一律到 `band.height` —— 稽核量的那個矩形因此一定是實心到頂的。
     * 碰撞由整道帶那一個 `solidSpan` 節點統一負責（見上面的註解），所以石板自己不登記。
     */
    const h = band.height + 1.6;
    const slab = new THREE.Mesh(box(segLen * 0.995, h, band.depth), stone(kit.mid));
    slab.position.set(x, ground - 1.6 + h / 2, z);
    slab.rotation.y = band.rot;
    slab.userData.noCollide = true; // 碰撞由整道帶那一個 solidSpan 節點統一負責
    slab.userData.hugsGround = true; // 「這一塊站在地上」——測試逐塊量它有沒有真的貼住
    slab.userData.blocksCamera = true;
    grp.add(slab);
    /*
     * 頂上再疊一階（**只往上長，不占地**）：由南往北一階比一階高，
     * 剪影就從「一道牆」變成「一段還在往上走的階梯」。
     */
    const cap = new THREE.Mesh(box(segLen * 0.995, 0.5 + i * 0.34, band.depth * 0.86), stone(kit.dark));
    cap.position.set(x, ground + band.height + (0.5 + i * 0.34) / 2, z);
    cap.rotation.y = band.rot;
    cap.userData.noCollide = true; // 站不上去（沒有可站立表面），也走不到 —— 它在 12 公尺高
    grp.add(cap);
    // 頂緣一道自發光的刻線：夜裡看得到它的輪廓（0 光源）
    const line = new THREE.Mesh(box(segLen * 0.8, 0.16, band.depth * 0.5), glow(kit.accent, 0.5));
    line.position.set(x, ground + band.height - 0.1, z);
    line.rotation.y = band.rot;
    line.userData.noCollide = true;
    grp.add(line);
  }

  /*
   * 朝橋頭那一面的一級矮階（`faceSign` 指的就是這一面）：走近時腳下先遇到一階矮的，
   * 石脊才升上去 —— 有了這一階（再加上頂上一階比一階高的頂階），
   * 它讀起來是「被走上去的階梯」而不是一面牆。
   *
   * 它露出地面 `APRON_HEIGHT`（0.8）公尺 —— **低於 §6.3 的 0.9**，所以是「跨得過去」的矮件：
   * 穿模稽核不會把它列進來，它也不必有碰撞體（P12 把一道帶的碰撞體從 12 收到 4–5 就是靠這個）。
   * 它逐塊貼自己腳下的地（與核心同一條規則），往下埋 1.4 公尺咬住階地的落差。
   */
  {
    const APRON_SEG = Math.max(2, Math.round(band.length / 3.4));
    const aLen = (band.length * 0.92) / APRON_SEG;
    for (let i = 0; i < APRON_SEG; i += 1) {
      const u = -(band.length * 0.92) / 2 + aLen * (i + 0.5);
      const [ox, oz] = at(u, face * band.depth * 0.78);
      const oGround = heightAt(ox, oz);
      const h = APRON_HEIGHT + 1.4;
      const step = new THREE.Mesh(box(aLen * 0.98, h, band.depth * 0.7), stone(kit.dark));
      step.position.set(ox, oGround - 1.4 + h / 2, oz);
      step.rotation.y = band.rot;
      step.userData.noCollide = true;
      step.userData.hugsGround = true;
      grp.add(step);
    }
  }

  /*
   * 整道石脊的碰撞：**一個**節點、一串圓（`collectSolids()` 沿局部 +X 排開）。
   * 半徑 ＝ 半個厚度 → 擋住的形狀跟看到的一樣寬；圓心一路排到 ±(length/2 − r)，
   * 所以每一塊核心石板的中心都落在某個圓裡（穿模稽核逐塊驗）。
   */
  const hit = new THREE.Object3D();
  hit.name = `screen-solid:${band.id}`;
  hit.position.set(f.cx, heightAt(f.cx, f.cz), f.cz);
  hit.rotation.y = band.rot;
  hit.userData.solidSpan = [band.length / 2, band.depth / 2];
  hit.userData.keepSolid = true;
  grp.add(hit);

  return grp;
}

/**
 * 每一種母題「實體的那幾塊」的擺法（**造型與擺位規則的唯一真相**）。
 *
 * 造型（`buildXxx()`）照它排幾何，`scripts/screen-fit.mjs` 與 `test:rubric`
 * 照它去問「這幾塊腳下的地平不平、站不站得住」—— 兩邊問的是同一組點，
 * 不會出現「工具說可以、蓋出來卻有一塊懸在坡外」。
 *
 * 欄位：`off` 沿朝向的位移、`side` 側向位移、`w`/`d` 平面尺寸、
 * `top` 頂面（相對整座的基準地面）、`sink` 底面往下多埋幾公尺（預設 0.35）。
 *
 * @param {{kind:string, height:number}} motif
 * @returns {Array<{off:number, side?:number, w:number, d:number, top:number, sink?:number}>}
 */
export function motifBlocks(motif) {
  const h = motif.height;
  switch (motif.kind) {
    case 'pageStack': {
      const w = Math.max(2.2, h * 0.46);
      return [
        // 矮台（讀書的地方）與立著的那一疊 —— 兩塊實體，一組碰撞體
        { off: -w * 0.34, w: w * 1.15, d: w * 0.9, top: h * 0.28 },
        { off: w * 0.26, w: w * 0.78, d: w * 0.78, top: h * 0.82 },
      ];
    }
    case 'oneSmallPiece': {
      const w = Math.max(2.0, h * 0.42);
      return [
        // 桁架的墩座 ＋ 折下來的那一段臂（越往前越小 —— 一次只吊一小件）
        { off: -w * 0.42, w: w * 0.94, d: w * 0.94, top: h * 0.9 },
        { off: w * 0.52, w: w * 0.66, d: w * 0.66, top: h * 0.5 },
      ];
    }
    case 'emptyMask': {
      const w = Math.max(1.9, h * 0.38);
      return [
        { off: 0, w: w * 1.25, d: w * 1.05, top: h * 0.22 },
        { off: w * 0.06, w: w * 0.62, d: w * 0.62, top: h * 0.88 },
      ];
    }
    case 'unnamedTool': {
      const w = Math.max(2.0, h * 0.42);
      return [
        // 矮鍛台與立在台上的柄（刃只剩光 —— 沒有人寫得出「什麼時候該用我」）
        { off: -w * 0.3, w: w * 1.2, d: w * 1.0, top: h * 0.3 },
        { off: w * 0.32, w: w * 0.5, d: w * 0.5, top: h * 0.82 },
      ];
    }
    default: {
      // twiceShown：三階（第三階是空的）＋一點底座；幾何**以 at 為中心**排
      // （不然「往前長」的那兩階會偷偷伸進別人的淨空圈）
      const rise = h / 3.4;
      const run = rise * 1.35;
      const w = Math.max(2.0, rise * 1.5);
      const back = -run * 0.75;
      return [0, 1, 2].map((i) => ({
        off: back + (i === 0 ? 0 : run * (i - 0.5)),
        w: w - i * 0.28,
        d: w * 0.62,
        top: i === 0 ? rise * 1.1 : rise * 1.1 + rise * 1.15 * i,
      }));
    }
  }
}

/**
 * 這一座母題「腳踩在哪幾個點上」（世界座標）—— 擺位規則量覆蓋率與落差的就是這幾點。
 * @param {object} motif
 * @returns {number[][]}
 */
export function motifGroundPoints(motif) {
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const sideX = Math.sin(motif.rot);
  const sideZ = Math.cos(motif.rot);
  return motifBlocks(motif).map((b) => [
    motif.at[0] + dirX * b.off + sideX * (b.side || 0),
    motif.at[1] + dirZ * b.off + sideZ * (b.side || 0),
  ]);
}

/**
 * 母題的實體部分：幾塊沿著自己的朝向排開的石塊，用**一個** InstancedMesh 疊出來。
 *
 * **每一塊各自貼自己腳下的地**（§4.10 的硬規則）：頂面照「最高的那一塊地」排
 * （剪影才讀得出是同一組東西），底面各自往下追自己腳下的地、再多埋 `sink` 公尺咬住落差。
 * 只在中心取一次高度的話，散開幾公尺的塊不是浮在空中就是埋進土裡 ——
 * 而浮起來的那些會被 `listSubstantial()` 的 `FLOAT_MIN` 當成「從底下走過去」而豁免，
 * 穿模稽核**看不到它們**，所以貼地要有獨立於稽核的斷言（rubric 逐塊量）。
 *
 * @param {object} motif
 * @param {(x:number,z:number)=>number} heightAt
 * @param {THREE.Material} mat
 * @param {Array<{off:number, side?:number, w:number, d:number, top:number, sink?:number}>} blocks
 *        `off` 沿朝向的位移、`side` 側向位移、`w`/`d` 平面尺寸、`top` 頂面（相對基準地面）
 * @returns {THREE.InstancedMesh}
 */
function solidBlocks(motif, heightAt, mat, blocks) {
  // 落點由 `motifGroundPoints()` 算 —— 擺位規則量的是同一組點（不會各算各的）
  const at = motifGroundPoints(motif);
  const grounds = at.map(([bx, bz]) => heightAt(bx, bz));
  const base = Math.max(...grounds);

  const mesh = new THREE.InstancedMesh(box(1, 1, 1), mat, blocks.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, motif.rot, 0));
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const [bx, bz] = at[i];
    const top = base + b.top;
    const bottom = Math.min(grounds[i], base) - (b.sink === undefined ? 0.35 : b.sink);
    p.set(bx, (top + bottom) / 2, bz);
    s.set(b.w, top - bottom, b.d);
    mesh.setMatrixAt(i, mtx.compose(p, q, s));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.solid = true;
  mesh.userData.hugsGround = true;
  mesh.userData.blocksCamera = true;
  mesh.userData.motifBase = base;
  return mesh;
}

/** 一小片懸在半空的光（母題「還沒做完的那一段」）—— 不是物質：不擋人、不進碰撞。 */
function ghostPlate(grp, kit, x, y, z, rot, w, d, intensity = 1.1) {
  const plate = new THREE.Mesh(box(w, 0.14, d), glow(kit.accent, intensity));
  plate.position.set(x, y, z);
  plate.rotation.y = rot;
  plate.userData.noCollide = true;
  grp.add(plate);
  return plate;
}

/**
 * 階梯迴廊的母題：示範了兩遍的階梯。
 *
 * 兩階是實體的（走得到、擋得住），第三階只剩一圈懸在半空的光輪廓 ——
 * 「師傅只示範兩遍，第三遍的階梯要你自己踏出來」（WORLD.md §1.4 的傳說鉤）。
 */
function buildTwiceShown(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const rise = motif.height / 3.4; // 三階（第三階是空的）＋一點底座
  const run = rise * 1.35;
  const w = Math.max(2.0, rise * 1.5);
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const back = -run * 0.75;
  const blocks = motifBlocks(motif);
  const steps = solidBlocks(motif, heightAt, stone(kit.mid), blocks);
  grp.add(steps);

  // 第三階：只剩一圈光的輪廓（懸在半空、不是物質 → 不擋人、不進碰撞）
  const ghostH = steps.userData.motifBase + blocks[2].top + rise * 0.5;
  const gx = x + dirX * (back + run * 2.5);
  const gz = z + dirZ * (back + run * 2.5);
  ghostPlate(grp, kit, gx, ghostH, gz, motif.rot, w - 0.84, w * 0.62);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(box(0.12, 0.12, w * 0.62), glow(kit.accent, 0.8));
    edge.position.set(gx + dirX * side * (w - 0.9) * 0.5, ghostH, gz + dirZ * side * (w - 0.9) * 0.5);
    edge.rotation.y = motif.rot;
    edge.userData.noCollide = true;
    grp.add(edge);
  }

  return grp;
}

/**
 * 沉書檔案庫的母題：**讀過的那一疊**。
 *
 * 一塊矮台上立著一疊讀完的石板書（實體），最上面那一頁翻開來懸在半空、只剩一圈光 ——
 * 「先讀，再答；答完要說得出你讀的是哪一頁」，而「憑印象」的那幾頁後來都枯了
 * （WORLD.md §1.4 的傳說鉤／`letter-tree-withered`）。形狀自己說，一個字都不寫。
 */
function buildPageStack(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const h = motif.height;
  const w = Math.max(2.2, h * 0.46);
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const stack = solidBlocks(motif, heightAt, stone(kit.mid), motifBlocks(motif));
  grp.add(stack);
  const base = stack.userData.motifBase;

  // 疊在那一疊上的幾片書口：薄片（不到 0.9 公尺厚 → §6.3 不算有份量），只是剪影
  for (let i = 0; i < 3; i += 1) {
    const leaf = new THREE.Mesh(box(w * 0.72 - i * 0.08, 0.13, w * 0.7), stone(kit.dark));
    leaf.position.set(x + dirX * w * 0.26, base + h * 0.82 + 0.1 + i * 0.19, z + dirZ * w * 0.26);
    leaf.rotation.y = motif.rot + (i - 1) * 0.14;
    leaf.userData.noCollide = true;
    grp.add(leaf);
  }
  // 翻開的那一頁：懸在半空、只剩一圈光（枯掉的那幾頁）
  const gx = x + dirX * w * 0.95;
  const gz = z + dirZ * w * 0.95;
  ghostPlate(grp, kit, gx, base + h * 1.02, gz, motif.rot + 0.5, w * 0.66, w * 0.52, 1.2);
  ghostPlate(grp, kit, gx - dirX * w * 0.5, base + h * 0.92, gz - dirZ * w * 0.5, motif.rot - 0.35, w * 0.5, w * 0.44, 0.7);

  return grp;
}

/**
 * 齒輪工坊的母題：**一次只吊一小件**。
 *
 * 一截矮桁架撐著一段折下來的臂（兩塊實體），臂的末端吊著一小件；
 * 再往前那一節只剩懸在半空的光 —— 「上一次工單寫『把一整件事吊上去』，臂就斷了；
 * 從那天起，工單一次只寫一小件」（WORLD.md §1.4 的傳說鉤／`letter-crane-order`）。
 */
function buildOneSmallPiece(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const h = motif.height;
  const w = Math.max(2.0, h * 0.42);
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const rig = solidBlocks(motif, heightAt, stone(kit.mid), motifBlocks(motif));
  grp.add(rig);
  const base = rig.userData.motifBase;

  // 橫過去的臂：薄桿（不到 0.9 公尺 → 走得過去），把兩塊接起來讀成一具吊架
  const boom = new THREE.Mesh(box(w * 1.9, 0.34, 0.34), stone(kit.dark));
  boom.position.set(x + dirX * w * 0.1, base + h * 0.94, z + dirZ * w * 0.1);
  boom.rotation.y = motif.rot;
  boom.rotation.z = -0.18;
  boom.userData.noCollide = true;
  grp.add(boom);
  // 吊著的那一小件：一顆小方塊，離地夠高（§6.1 的 FLOAT_MIN）
  const load = new THREE.Mesh(box(w * 0.34, w * 0.34, w * 0.34), stone(kit.dark));
  load.position.set(x + dirX * w * 0.86, base + h * 0.6, z + dirZ * w * 0.86);
  load.rotation.y = motif.rot + 0.3;
  load.userData.noCollide = true;
  grp.add(load);
  // 斷掉的下一節：只剩光（「一整件事」那一次留下來的）
  ghostPlate(grp, kit, x + dirX * w * 1.55, base + h * 0.98, z + dirZ * w * 1.55, motif.rot, w * 0.8, 0.3, 1.15);

  return grp;
}

/**
 * 面具劇場的母題：**掛著的空面具**。
 *
 * 一座底座撐起一根柱（兩塊實體），柱頂掛著一張沒有人戴的面具；
 * 面具背面刻的那一句只剩一圈光 —— 「你不是它」
 * （WORLD.md §1.4 的傳說鉤／`letter-backstage-mask`）。
 */
function buildEmptyMask(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const h = motif.height;
  const w = Math.max(1.9, h * 0.38);
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const post = solidBlocks(motif, heightAt, stone(kit.mid), motifBlocks(motif));
  grp.add(post);
  const base = post.userData.motifBase;

  // 掛在柱頂的那張面具：薄片（走得過去），微微側著臉
  const mask = new THREE.Mesh(box(w * 0.8, w * 0.86, 0.22), stone(kit.dark));
  mask.position.set(x + dirX * w * 0.36, base + h * 0.78, z + dirZ * w * 0.36);
  mask.rotation.y = motif.rot + 0.42;
  mask.rotation.z = 0.12;
  mask.userData.noCollide = true;
  grp.add(mask);
  // 兩個眼孔與背面那一句：只剩光
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(box(0.2, 0.12, 0.12), glow(kit.accent, 1.0));
    eye.position.set(
      x + dirX * w * 0.36 + Math.sin(motif.rot + 0.42) * 0.14 * side,
      base + h * 0.86,
      z + dirZ * w * 0.36 + Math.cos(motif.rot + 0.42) * 0.14 * side
    );
    eye.rotation.y = motif.rot + 0.42;
    eye.userData.noCollide = true;
    grp.add(eye);
  }
  ghostPlate(grp, kit, x - dirX * w * 0.7, base + h * 0.62, z - dirZ * w * 0.7, motif.rot + 0.42, w * 0.7, 0.26, 0.8);

  return grp;
}


/**
 * 契約鍛冶場的母題：**未命名的工具**（v1.2 · P16a）。
 *
 * 一座矮鍛台上立著一把工具的柄（兩塊實體），刃只剩懸在半空的光；
 * 柄上該刻名字的那一格是空的 ——「每一把都沒有刻名字，沒有人寫得出
 * 『什麼時候該用我』」（WORLD.md §1.4 的傳說鉤）。
 */
function buildUnnamedTool(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const h = motif.height;
  const w = Math.max(2.0, h * 0.42);
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  const rig = solidBlocks(motif, heightAt, stone(kit.mid), motifBlocks(motif));
  grp.add(rig);
  const base = rig.userData.motifBase;

  // 該刻名字的那一格：柄腰上一圈很淺的凹槽，裡面什麼都沒有（暗，不發光）
  const collar = new THREE.Mesh(box(w * 0.62, 0.34, 0.14), stone(kit.dark));
  collar.position.set(x + dirX * w * 0.32, base + h * 0.56, z + dirZ * w * 0.32);
  collar.rotation.y = motif.rot + Math.PI / 2;
  collar.userData.noCollide = true;
  grp.add(collar);

  // 刃：只剩光，平躺在柄頂上（沒打完的那一把 —— `ghostPlate()` 只轉 Y，是平的）
  ghostPlate(grp, kit, x + dirX * w * 0.5, base + h * 1.04, z + dirZ * w * 0.5, motif.rot, w * 0.28, w * 0.9, 1.2);

  return grp;
}

/**
 * 高台：**一塊圓的石鼓**（v1.2 · P14）。
 *
 * 為什麼是圓的而不是方的：`standR`（頂面證明過是平的那一段）是**一圈一圈往外量**的，
 * 方的頂面在對角線方向上會先量到外面 —— 一塊 5.2 × 5.2 的方臺登記成半徑 2.6 的圓，
 * 可是半徑 2.6 的那一圈有一半落在石頭外面，`standR` 於是卡在 1.8 左右。
 * 圓的頂面「量到多遠都是平的」，`standR` 才追得上碰撞半徑，人站到邊緣才不會憑空掉下去。
 *
 * 三樣東西，兩樣不必擋人：
 *   · **石鼓本體**（實體）：頂面 `height` 公尺、往地下埋 `SINK` 咬住地形起伏。
 *     碰撞登記在**群組**上（`solidRadius`）—— 一顆圓、一個名字（`standId`）。
 *   · **底裙**（露出地面 0.55 公尺 → §6.3 說它跨得過去，不必有碰撞體、稽核也不列）：
 *     讓石鼓看起來是從地裡長出來的，不是擺上去的。
 *   · **頂面的一圈刻線**（自發光、半透明 → 不是可以站的面，量頂面時一律不算）：
 *     夜裡從遠處就看得出那一圈光是平的。**0 新光源。**
 */
function buildStepStone(spec, kit, heightAt, decorate = null) {
  const grp = new THREE.Group();
  grp.name = `platform:${spec.id}`;
  const [x, z] = spec.at;
  const ground = heightAt(x, z);
  const r = spec.radius;
  const h = spec.height;
  const SINK = 0.7; // 往地下埋多深（地形有起伏，埋淺了邊緣會浮起來）

  grp.position.set(x, ground, z);

  /*
   * 碰撞、頂面與名字**登記在石鼓本身**，不是群組上。
   * 為什麼：`collectTriangles()` 攤三角面時會跳過標了 `noCollide` 的網格 ——
   * 把圓登記在群組、把石鼓標成 `noCollide`（遮擋帶那一套寫法）會讓頂面一片都量不到，
   * 於是「站得上去」永遠是 false。登記在石鼓上，「擋人的那一顆圓」與
   * 「站得上去的那一面」講的就是同一件東西。
   */
  const drum = new THREE.Mesh(cylinder(r, h + SINK), stone(kit.mid));
  drum.name = `step:${spec.id}`;
  drum.position.y = (h - SINK) / 2;
  drum.rotation.y = spec.rot;
  drum.userData.solidRadius = r;
  drum.userData.keepSolid = true; // 它就是要擋人，別被淨空濾網當雜物掃掉
  drum.userData.standId = spec.id; // 站上去之後 `player.standingOn` 回的就是這個字串
  drum.userData.hugsGround = true; // 「這一塊站在地上」——測試逐塊量它有沒有真的貼住
  drum.userData.blocksCamera = true;
  grp.add(drum);

  // 底裙：矮一階的圓臺（露出地面 0.55 —— 跨得過去，不是牆）
  const skirt = new THREE.Mesh(cylinder(r + 0.55, 0.55 + SINK), stone(kit.dark));
  skirt.position.y = (0.55 - SINK) / 2;
  skirt.rotation.y = spec.rot + 0.26;
  skirt.userData.noCollide = true;
  grp.add(skirt);

  // 頂面的一圈刻線：光，不是物質（量頂面時被濾掉，稽核也算它是光）
  const ring = new THREE.Mesh(flatRing(r * 0.62, r * 0.78), glow(kit.accent, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = spec.rot;
  ring.position.y = h + 0.02;
  ring.userData.noCollide = true;
  grp.add(ring);

  /*
   * 該區的語彙（v1.2 · P15）：**只裝飾在裙與外圈，一個字都不寫、一塊都不站人**。
   * 頂面永遠是同一塊圓的石鼓 —— `standR` 一圈一圈往外量的那件事不因為換皮而改變
   * （P13 的教訓：頂面的形狀是判定，不是造型）。裝飾一律 `noCollide` ＋ 不標 `hugsGround`
   * （它們掛在石鼓上，不是自己站在地上）。
   */
  if (decorate) decorate(grp, { spec, kit, r, h, sink: SINK });

  return grp;
}

/** 沉書檔案庫：裙上疊著幾片翻過的石板書（母題 `pageStack` 的同一句話）。 */
function dressPageStep(grp, { spec, kit, r, h }) {
  const n = 4;
  for (let i = 0; i < n; i += 1) {
    const a = spec.rot + (i / n) * Math.PI * 2 + 0.3;
    const leaf = new THREE.Mesh(box(r * 0.9, 0.16, r * 0.62), stone(kit.dark));
    leaf.position.set(Math.cos(a) * (r + 0.18), 0.2 + i * 0.13, Math.sin(a) * (r + 0.18));
    leaf.rotation.set(0.16, -a, 0.1);
    leaf.userData.noCollide = true;
    grp.add(leaf);
  }
  // 翻開的那一頁：只剩一圈光（枯掉的那幾頁）
  const page = new THREE.Mesh(box(r * 0.8, 0.05, r * 0.5), glow(kit.light, 0.7));
  page.position.set(Math.cos(spec.rot) * (r + 0.5), h * 0.72, Math.sin(spec.rot) * (r + 0.5));
  page.rotation.set(0.5, -spec.rot, 0);
  page.userData.noCollide = true;
  grp.add(page);
}

/** 量器坊：鼓身外圈一圈刻度，其中一格比別格長（「先看有沒有同一個零」）。 */
function dressGaugeStep(grp, { spec, kit, r, h }) {
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    const a = spec.rot + (i / n) * Math.PI * 2;
    const long = i === 0;
    const tick = new THREE.Mesh(box(0.07, long ? 0.62 : 0.3, 0.07), glow(kit.accent, long ? 1.1 : 0.6));
    tick.position.set(Math.cos(a) * (r + 0.05), h - (long ? 0.42 : 0.26), Math.sin(a) * (r + 0.05));
    tick.rotation.y = -a;
    tick.userData.noCollide = true;
    grp.add(tick);
  }
  // 鼓身腰上一道很淺的環，把刻度串成一把尺
  const band = new THREE.Mesh(cylinder(r + 0.03, 0.08), stone(kit.light));
  band.position.y = h - 0.62;
  band.userData.noCollide = true;
  grp.add(band);
}

/** 面具劇場：裙上一張很淺的面具浮雕，眼孔只剩光（「你不是它」）。 */
function dressMaskStep(grp, { spec, kit, r, h }) {
  const dirX = Math.cos(spec.rot);
  const dirZ = -Math.sin(spec.rot);
  /*
   * 面具刻意壓在 0.8 公尺以下：§6.3 說「露出地面 < 0.9 公尺」跨得過去 ——
   * 它是貼在裙上的一片浮雕，不是一面牆，所以既不必有碰撞體、穿模稽核也不列它。
   * （P15 第一版做成 1.8 公尺高，稽核當場紅了兩塊「有份量卻走得過去」。）
   */
  /*
   * 轉向要**讓薄的那一邊朝外**：`rotation.y = θ` 把局部 +X 轉到 (cosθ, −sinθ)，
   * 也就是徑向 —— 直接用 `spec.rot` 會讓 1.12 公尺寬的那一邊**指向外面**，
   * 變成一片從石鼓側面伸出去 0.56 公尺的鰭（人還會直接穿過去），
   * 而不是貼在裙上的浮雕（P15 審查 · 第 4 條）。加 90° 之後寬邊沿著切線、
   * 0.12 的厚度朝外，才是「一片很淺的浮雕」。
   */
  const face = new THREE.Mesh(box(r * 0.7, 0.8, 0.12), stone(kit.dark));
  face.position.set(dirX * (r + 0.05), 0.62, dirZ * (r + 0.05));
  face.rotation.y = spec.rot + Math.PI / 2;
  face.userData.noCollide = true;
  grp.add(face);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(box(0.17, 0.1, 0.1), glow(kit.accent, 0.9));
    eye.position.set(
      dirX * (r + 0.14) + Math.sin(spec.rot) * 0.14 * side,
      0.74,
      dirZ * (r + 0.14) + Math.cos(spec.rot) * 0.14 * side
    );
    eye.rotation.y = spec.rot + Math.PI / 2;
    eye.userData.noCollide = true;
    grp.add(eye);
  }
}

/**
 * 示範與推理：裙上兩級很淺的小階，第三級抬起來、只剩一圈光（母題 `twiceShown` 的同一句話）。
 *
 * 兩級都壓在 0.62 公尺以下（§6.3：露出地面 < 0.9 公尺跨得過去 → 不必也不該有碰撞體），
 * 而且**厚的那一維只有 0.28** —— 穿模稽核的 `PLATE_MIN`（0.9）看它是薄片，不是牆。
 * 真的踏得上去的仍然只有石鼓本身：這兩級是一句話，不是路。
 */
function dressTwiceStep(grp, { spec, kit, r, h }) {
  const dirX = Math.cos(spec.rot);
  const dirZ = -Math.sin(spec.rot);
  /*
   * 兩級小階排在**底裙外面**：裙是一個半徑 `r + 0.55`、露出地面 0.55 公尺的實心圓臺，
   * 貼著它擺的話整塊會被裙吃掉 —— 三角形照付、畫面上一點都看不到
   * （P16a 第一版就是這樣寫的，`test:rubric` 的「裝飾看得見」那一條會紅）。
   */
  for (const s of [{ d: r + 1.35, top: 0.3 }, { d: r + 0.85, top: 0.6 }]) {
    const step = new THREE.Mesh(box(r * 0.9, s.top, 0.3), stone(kit.dark));
    step.position.set(dirX * s.d, s.top / 2, dirZ * s.d);
    // 寬邊要沿著切線（P15 審查 · 第 4 條：`rotation.y = θ` 轉的是局部 +X ＝ 徑向）
    step.rotation.y = spec.rot + Math.PI / 2;
    step.userData.noCollide = true;
    grp.add(step);
  }
  // 第三級：踏不到，只剩一圈光懸在第二級與頂面之間（「第三遍要你自己踏出來」）
  const ghost = new THREE.Mesh(box(r * 0.9, 0.09, 0.32), glow(kit.accent, 0.95));
  ghost.position.set(dirX * (r + 0.45), h * 0.66, dirZ * (r + 0.45));
  ghost.rotation.y = spec.rot + Math.PI / 2;
  ghost.userData.noCollide = true;
  grp.add(ghost);
}

/**
 * 齒輪工坊：裙邊伸出一截短臂，臂端吊著一小件；再往前那一節只剩光
 * （母題 `oneSmallPiece` 的同一句話：一次只吊一小件）。
 *
 * 臂是**沿著半徑**伸出去的 —— 這一次寬邊本來就該指著外面，所以不加 90°
 * （不是每一片裝飾都要轉，要問的是「這東西的長邊該朝哪」）。
 * 截面 0.24 × 0.24 → 稽核當它是細桿；吊著的那一小件邊長 0.42，也在 `PLATE_MIN` 之下。
 */
function dressHoistStep(grp, { spec, kit, r, h }) {
  const dirX = Math.cos(spec.rot);
  const dirZ = -Math.sin(spec.rot);
  const boom = new THREE.Mesh(box(r * 1.1, 0.24, 0.24), stone(kit.dark));
  boom.position.set(dirX * (r + 0.34), h - 0.22, dirZ * (r + 0.34));
  boom.rotation.y = spec.rot;
  boom.rotation.z = -0.14;
  boom.userData.noCollide = true;
  grp.add(boom);
  const load = new THREE.Mesh(box(0.42, 0.42, 0.42), stone(kit.dark));
  load.position.set(dirX * (r + 0.78), h - 0.72, dirZ * (r + 0.78));
  load.rotation.y = spec.rot + 0.35;
  load.userData.noCollide = true;
  grp.add(load);
  // 斷掉的下一節：只剩光（「一整件事」那一次留下來的）
  const ghost = new THREE.Mesh(box(r * 0.7, 0.1, 0.22), glow(kit.accent, 1.0));
  ghost.position.set(dirX * (r + 1.3), h - 0.16, dirZ * (r + 1.3));
  ghost.rotation.y = spec.rot;
  ghost.userData.noCollide = true;
  grp.add(ghost);
}

/**
 * 減法之庭：**被搬空的那一座**——外圈只剩四個空托座，被拿走的那件只剩一圈懸空的光。
 *
 * 這片土地的造景規則跟其他十一片相反（§1.4：東西要少），
 * 所以裙上一件雜物都沒有：四個矮托座 ＋ 一圈光，就這樣。
 */
function dressTakenStep(grp, { spec, kit, r, h }) {
  // 托座擺在**裙外面**（同 `dressTwiceStep` 的那一條：裙會把貼著它的東西整塊吃掉）
  for (let i = 0; i < 4; i += 1) {
    const a = spec.rot + (i / 4) * Math.PI * 2;
    const socket = new THREE.Mesh(box(0.46, 0.3, 0.46), stone(kit.dark));
    socket.position.set(Math.cos(a) * (r + 0.85), 0.15, Math.sin(a) * (r + 0.85));
    socket.rotation.y = -a;
    socket.userData.noCollide = true;
    grp.add(socket);
  }
  /*
   * 被拿走的那一件：頂面上一圈**平貼著**的光輪廓（地標「空的基座」的同一句話）。
   * 高度刻意只離頂面 3 公分：這一圈的半徑 0.42–0.50 比玩家的 0.62 還小，
   * 抬到膝蓋高度就會**從站在上面的人身上穿過去**（P16a 審查 · 第 2 條）。
   * 平貼在腳邊反而更像「這裡原本擺著一件東西」。
   */
  const outline = new THREE.Mesh(flatRing(r * 0.3, r * 0.36), glow(kit.light, 0.9));
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = h + 0.03;
  outline.userData.noCollide = true;
  grp.add(outline);
}

/**
 * 校驗場：裙上嵌著一圈被磨過的鏡面，鼓身腰上兩道刻線 ——
 * 一道是原本寫的、一道是改過的（地標「會回頭照自己的鏡」的同一句話）。
 */
function dressMirrorStep(grp, { spec, kit, r, h }) {
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const a = spec.rot + (i / n) * Math.PI * 2;
    // 半徑取 `r + 0.6`、高 0.68：一半嵌在裙裡、一半站在裙頂上面 —— 看得見的那一半才算數
    const pane = new THREE.Mesh(box(r * 0.62, 0.68, 0.1), glow(kit.light, i === 0 ? 0.9 : 0.45));
    pane.position.set(Math.cos(a) * (r + 0.6), 0.45, Math.sin(a) * (r + 0.6));
    // 鏡面要正對外面 → 寬邊沿切線（同 `dressMaskStep` 的那一條）
    pane.rotation.y = -a + Math.PI / 2;
    pane.userData.noCollide = true;
    grp.add(pane);
  }
  // 兩道刻線：下面那一道是原本寫的，上面那一道是改過的（後者亮、也短一截）
  for (const [y, len, lit] of [
    [h - 0.54, 0.55, 0.4],
    [h - 0.3, 0.38, 1.1],
  ]) {
    const mark = new THREE.Mesh(box(0.06, 0.06, r * len), glow(kit.accent, lit));
    mark.position.set(Math.cos(spec.rot) * (r + 0.03), y, Math.sin(spec.rot) * (r + 0.03));
    mark.rotation.y = -spec.rot;
    mark.userData.noCollide = true;
    grp.add(mark);
  }
}

const BAND_KINDS = { stairRidge: buildStairRidge };
const MOTIF_KINDS = {
  twiceShown: buildTwiceShown,
  pageStack: buildPageStack,
  oneSmallPiece: buildOneSmallPiece,
  emptyMask: buildEmptyMask,
  unnamedTool: buildUnnamedTool,
};

const PLATFORM_KINDS = {
  stepStone: buildStepStone,
  pageStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressPageStep),
  gaugeStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressGaugeStep),
  maskStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressMaskStep),
  twiceStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressTwiceStep),
  hoistStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressHoistStep),
  takenStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressTakenStep),
  mirrorStep: (spec, kit, heightAt) => buildStepStone(spec, kit, heightAt, dressMirrorStep),
};

/** 已實作的造型 id（測試會檢查資料只用得到這些）。 */
export const BAND_KIND_IDS = Object.freeze(Object.keys(BAND_KINDS));
export const MOTIF_KIND_IDS = Object.freeze(Object.keys(MOTIF_KINDS));
export const PLATFORM_KIND_IDS = Object.freeze(Object.keys(PLATFORM_KINDS));

/**
 * 蓋出一片土地的中觀層（遮擋帶 ＋ 母題）。沒有資料的區回傳 null。
 *
 * @param {string} regionId
 * @param {{accent:number, light:number, mid:number, dark:number}} kit
 * @param {(x:number,z:number)=>number} heightAt
 * @param {null|{bands?:object[], motifs?:object[]}} [data] 換掉出貨的那一份資料 ——
 *   只有 `scripts/screen-fit.mjs` 會用（見 `corridorPolyline` 的同一條註解）。
 * @returns {null|{group:THREE.Group, bands:object[], motifs:object[]}}
 */
export function buildScreens(regionId, kit, heightAt, data = null) {
  const bands = (data && data.bands ? data.bands : SCREEN_BANDS).filter((b) => b.region === regionId);
  const motifs = (data && data.motifs ? data.motifs : MOTIFS).filter((mo) => mo.region === regionId);
  const platforms = (data && data.platforms ? data.platforms : PLATFORMS).filter((p) => p.region === regionId);
  if (!bands.length && !motifs.length && !platforms.length) return null;
  const group = new THREE.Group();
  group.name = `screens:${regionId}`;
  for (const b of bands) group.add((BAND_KINDS[b.kind] || buildStairRidge)(b, kit, heightAt));
  for (const mo of motifs) group.add((MOTIF_KINDS[mo.kind] || buildTwiceShown)(mo, kit, heightAt));
  for (const pf of platforms) group.add((PLATFORM_KINDS[pf.kind] || buildStepStone)(pf, kit, heightAt));
  return { group, bands, motifs, platforms };
}

export default {
  SCREEN_BANDS,
  EYE_HEIGHT,
  PLATFORM_JUMP_MARGIN,
  platformRise,
  landmarkSight,
  MOTIFS,
  PLATFORMS,
  PATH_BENDS,
  corridorPolyline,
  bandFootprint,
  bandCoreDistance,
  pointInBand,
  segmentCrossesBand,
  buildScreens,
  disposeScreenCache,
};

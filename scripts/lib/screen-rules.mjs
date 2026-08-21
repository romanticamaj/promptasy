/**
 * Promptasy — 中觀層（遮擋帶／母題）的擺位規則（v1.2 · P12 抽出來的共用件）
 *
 * WORLD.md §4.10 那幾條「離什麼要多遠」以前只寫在 `scripts/test-rubric.mjs` 裡，
 * 於是 `scripts/screen-fit.mjs`（搜候選座標的那支）只能抄一份 —— 兩份數字總有一天會分家，
 * 而且分家的那一天，搜出來的座標會「在工具裡合法、在測試裡紅」。
 * 所以門檻與距離函式**只有這一份**，測試與搜尋工具都 import 它。
 *
 * 這裡只放**純資料與純函式**：不蓋場景、不 import three.js。
 */

/**
 * 每一層互動物的互動半徑（公尺）。
 * 遮擋帶與母題不是互動物（沒有 `E`），所以它們守的是**淨空**而不是「互動圈不重疊」：
 * 每一個碰撞圓都要離得夠遠，讓玩家還走得進那件東西的互動半徑內
 * —— `need = 該層互動半徑 + 玩家半徑 + 這個碰撞圓自己的半徑`。
 * 石座那一格是淨空半徑 `PEDESTAL_CLEAR`（5.6），不是互動半徑。
 */
export const LAYER_INTERACT_R = Object.freeze({
  marker: 5.6,
  murk: 5.5,
  secret: 5.5,
  tablet: 4.6,
  react: 4.4,
  ins: 3.8,
  letter: 3.8,
  handle: 3.2,
});

/** 離橋的主動線：`LANE_HALF + LANE_MARGIN`（再扣掉自己的半徑 —— 圓心在外面就夠了）。 */
export const LANE_MARGIN = 4;
/** 離閘門（公尺）。 */
export const GATE_MIN = 8;
/**
 * 母題離「走出來的那條路」的區間（公尺）：看得到、走得過去、不擋路。
 *
 * 下限 9 → **7**（v1.2 · P12，量出來的）：P11 只鋪了階梯迴廊一區，9 公尺看起來夠寬鬆；
 * 鋪到另外三片土地時 `scripts/screen-fit.mjs` 掃出來的事實是 ——
 * 一片土地的自由落點（扣掉所有互動圈、主動線、閘門、地標留白、崩落邊緣之後）
 * **幾乎全部落在離路 4–12 公尺**（沉書檔案庫 315 個自由點裡只有 3 個 ≥9 公尺、
 * 齒輪工坊 175 個裡只有 2 個、面具劇場 451 個裡只有 3 個）——
 * 9 公尺那條線會把「一片土地放 3–4 座」直接變成不可能。
 * 7 公尺仍然遠得下人：母題的碰撞半徑 ≈1.4 ＋ 玩家 0.62 ＝ 2.0，路邊還留得下 5 公尺。
 */
export const MOTIF_PATH_MIN = 7;
export const MOTIF_PATH_MAX = 26;
/** 母題彼此至少隔多遠（公尺）—— 重複才叫母題，擠在一起就是一堆雜物。 */
export const MOTIF_GAP = 16;
/** 兩道遮擋帶之間要留得下的缺口（公尺）。 */
export const BAND_GAP = 8;
/** 母題每一塊腳下的覆蓋率下限（不准踩在崩掉的區緣上）。 */
export const MOTIF_COVERAGE_MIN = 0.96;
/** 母題各塊之間的地形落差上限（公尺）—— 讀得出是同一組東西，不是一半埋在山坡裡。 */
export const MOTIF_STEP_DROP_MAX = 1.1;
/** 碰撞圓腳下的覆蓋率下限（不准掉進虛空）。 */
export const SOLID_COVERAGE_MIN = 0.9;
/** 逐塊貼地：底面離自己腳下的地最多浮這麼高（公尺）。 */
export const GROUND_HUG_MAX = 0.35;
/** 逐塊貼地：底面最多埋這麼深（公尺）—— 再深就是整塊沉進土裡。 */
export const GROUND_BURY_MAX = 2.2;
/** 中觀層每一片土地的碰撞體上限（v1.2 · P12：12 區鋪完要離 1,400 的硬上限夠遠）。 */
export const SOLIDS_PER_REGION_MAX = 20;

/**
 * 把所有「有互動圈、不准被擋住」的東西列成一張表。
 * @param {object} data `{ challenges, inscriptions, letters, handles, reactiveSpots, murks, tablets, secrets }`
 * @returns {Array<{k:string, id:string, at:number[]}>}
 */
export function interactionTargets(data) {
  const out = [];
  for (const c of data.challenges || []) if (c.position) out.push({ k: 'marker', id: c.id, at: c.position });
  for (const i of data.inscriptions || []) out.push({ k: 'ins', id: i.id, at: i.at });
  for (const l of data.letters || []) out.push({ k: 'letter', id: l.id, at: l.at });
  for (const h of data.handles || []) out.push({ k: 'handle', id: h.id, at: h.at });
  for (const s of data.reactiveSpots || []) out.push({ k: 'react', id: s.id, at: s.at });
  for (const m of data.murks || []) out.push({ k: 'murk', id: m.id, at: m.at });
  for (const t of data.tablets || []) out.push({ k: 'tablet', id: t.id, at: t.at });
  for (const s of data.secrets || []) out.push({ k: 'secret', id: s.id, at: s.at });
  return out;
}

const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

/** 離最近一條橋的主動線多遠（公尺）。 */
export function laneDistance(World, x, z) {
  let best = Infinity;
  for (const l of World.BRIDGE_LANES) {
    const d = segDist(x, z, l.ax, l.az, l.bx, l.bz);
    if (d < best) best = d;
  }
  return best;
}

/** 離最近一道閘門多遠（公尺）。 */
export function gateDistance(World, x, z) {
  let best = Infinity;
  for (const c of [...World.CORRIDORS, ...World.ANNEX_LINKS]) {
    const d = Math.hypot(x - c.gate.x, z - c.gate.z);
    if (d < best) best = d;
  }
  return best;
}

/** 離「走出來的路網」（`buildPathNetwork()` 的線段）多遠（公尺）。 */
export function pathDistance(segs, x, z) {
  let best = Infinity;
  for (const s of segs) {
    const d = segDist(x, z, s[0], s[1], s[2], s[3]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * 一個中觀層的碰撞圓有沒有踩到別人（回問題清單，空陣列＝過）。
 * 測試逐條 `ok()`、搜尋工具拿它當篩子 —— **同一份門檻**。
 *
 * @param {object} World  `src/world/world.js`
 * @param {{x:number,z:number,r:number}} sd 碰撞圓
 * @param {string} regionId 這一層屬於哪一片土地
 * @param {Array} targets `interactionTargets()` 的結果
 * @param {Array} landmarks `props.js` 的 `LANDMARKS`
 * @returns {string[]}
 */
export function solidProblems(World, sd, regionId, targets, landmarks) {
  const problems = [];
  for (const t of targets) {
    const need = LAYER_INTERACT_R[t.k] + World.PLAYER_RADIUS + sd.r;
    const d = Math.hypot(sd.x - t.at[0], sd.z - t.at[1]);
    if (d < need) problems.push(`太靠近 ${t.k}:${t.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  for (const lm of landmarks) {
    const d = Math.hypot(sd.x - lm.at[0], sd.z - lm.at[1]);
    if (d < lm.clear) problems.push(`踩進地標 ${lm.id} 的留白（${d.toFixed(2)} < ${lm.clear}）`);
  }
  const lane = laneDistance(World, sd.x, sd.z);
  if (lane < World.LANE_HALF + LANE_MARGIN - sd.r) problems.push(`離主動線太近（${lane.toFixed(2)}）`);
  const gate = gateDistance(World, sd.x, sd.z);
  if (gate < GATE_MIN) problems.push(`離閘門太近（${gate.toFixed(2)}）`);
  const here = World.regionAt(sd.x, sd.z);
  if (!here || here.id !== regionId || here.onBridge) problems.push(`不在 ${regionId} 上（${JSON.stringify(here)}）`);
  const cov = World.coverage(sd.x, sd.z);
  if (cov <= SOLID_COVERAGE_MIN) problems.push(`掉進虛空（coverage ${cov.toFixed(2)}）`);
  return problems;
}

export default {
  LAYER_INTERACT_R,
  LANE_MARGIN,
  GATE_MIN,
  MOTIF_PATH_MIN,
  MOTIF_PATH_MAX,
  MOTIF_GAP,
  BAND_GAP,
  MOTIF_COVERAGE_MIN,
  MOTIF_STEP_DROP_MAX,
  SOLID_COVERAGE_MIN,
  GROUND_HUG_MAX,
  GROUND_BURY_MAX,
  SOLIDS_PER_REGION_MAX,
  interactionTargets,
  laneDistance,
  gateDistance,
  pathDistance,
  solidProblems,
};

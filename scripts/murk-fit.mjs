#!/usr/bin/env node
/**
 * Promptasy — 大濁靈的落點搜尋器（v1.2 · P17）
 *
 * 與 `scripts/screen-fit.mjs` 同一套作法（P12 起的慣例）：**改資料 → 重建世界 → 量**。
 * 理由一樣 —— 濁靈會進 `keepClear`，移動牠一寸，整片土地的程序化道具就重擲一次，
 * 「牠四周走不走得到」離線算不出來（findings「P06c 的發現」）。
 *
 * 兩段式：
 *   ① **離線篩**（毫秒級）：格點掃過整片土地，用 `scripts/lib/screen-rules.mjs` 的
 *      **同一份門檻**濾掉一看就不行的點 —— 區域歸屬、覆蓋率、互動圈不重疊、
 *      離主動線／閘門／出生點／起始祭壇、離地標留白、離中觀層的石頭、離路網 6–26 公尺。
 *   ② **重建驗**（每個候選 ~0.5 秒）：把候選塞進 `createWorld({ murks })`，
 *      對真的蓋出來的世界量：底座擋不擋得住人、四周三圈 × 16 個方向走不走得到、
 *      中觀層有沒有被牠的互動圈壓掉（＝ `screen-fit --verify` 會不會因此變紅）。
 *
 * 用法：
 *   node scripts/murk-fit.mjs --region foundations            搜那一片土地
 *   node scripts/murk-fit.mjs --all                           12 片各搜一個最好的
 *   node scripts/murk-fit.mjs --verify                        驗 murks.json 現行的大濁靈
 *   node scripts/murk-fit.mjs --region wards --why            印「被哪一條擋掉」的統計
 *   node scripts/murk-fit.mjs --region wards --slack          印「只差一條」的那些點（找瓶頸）
 *
 * **這支腳本不寫檔**：它只印出座標，要不要放進 `src/data/murks.json` 由人決定
 * （放進去之後 `test:rubric` 會用同一份門檻再驗一次）。
 */
import { buildWorld, worldOptions, readJson } from './world-harness.mjs';
import Rules from './lib/screen-rules.mjs';

const {
  GREAT_MURK_R,
  GREAT_MURK_AUTO_MIN,
  GREAT_MURK_REACT_MIN,
  GREAT_MURK_GAP,
  GREAT_MURK_MARKER_MIN,
  GREAT_MURK_BODY_R,
  GREAT_MURK_CLEAR,
  GREAT_MURK_RING,
  GREAT_MURK_RING_DIRS,
  GREAT_MURK_WINNABLE_RADII,
  GREAT_MURK_WINNABLE_DIRS,
  GREAT_MURK_WINNABLE_MIN,
  GREAT_MURK_WINNABLE_EXCEPTIONS,
  GREAT_MURK_MARKER_EXCEPTIONS,
  MOTIF_COVERAGE_MIN,
  MOTIF_PATH_MAX,
  LANE_MARGIN,
  GATE_MIN,
  interactionTargets,
  targetRadius,
  laneDistance,
  gateDistance,
  pathDistance,
} = Rules;

/** 大濁靈離「走出來的那條路」的區間（公尺）：遇得到，但不站在路中間。 */
const MURK_PATH_MIN = 3.5;
/**
 * 大濁靈離地標多遠（公尺）。
 *
 * 小濁靈與守夜人對地標守的是 4（§4.14：「地標旁邊要矮」管的是**高的東西**）。
 * 大濁靈不是一個人：牠的殼撐到 4 公尺，站在地標腳邊會把地標的剪影吃掉一角，
 * 所以這一層拉到 8 —— 這個數字是量出來的（12 片土地照 8 掃都還有落點；
 * 拉到地標自己的 `clear`（13–16）會讓觀象臺與護欄崗直接歸零）。
 */
const MURK_LANDMARK_MIN = 6;
/** 探勘用：`--markerMin` 覆寫石座那一條（收尾時一定要回到 `screen-rules.mjs` 的那一份）。 */
const markerMin = (regionId) => num('markerMin', GREAT_MURK_MARKER_EXCEPTIONS[regionId] ?? GREAT_MURK_MARKER_MIN);
/** 離小景（story vignette）—— 小濁靈是 4，大濁靈按底座差額補到 6。 */
const MURK_VIGNETTE_MIN = 6;
/** 出生點與起始祭壇（沿用小濁靈那兩條）。 */
const SPAWN_MIN = 7;
const SHRINE_MIN = 9;

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const num = (name, dflt) => {
  const v = flag(name, null);
  return v === null || v === true ? dflt : Number(v);
};

const World = await import('../src/world/world.js');
const Props = await import('../src/world/props.js');
const Reactive = await import('../src/world/reactive.js');
const base = await worldOptions();
const murkFile = readJson('src/data/murks.json');
const prologue = readJson('src/data/prologue.json');

/** 所有互動層（大濁靈自己那一層由呼叫端決定要不要換掉）。 */
function targetsFor(murks) {
  return interactionTargets({
    challenges: base.challenges,
    inscriptions: base.inscriptions,
    letters: base.letters,
    handles: base.handles,
    reactiveSpots: Reactive.reactiveTargets(),
    murks,
    watchmen: base.watchmen,
    tablets: Props.LORE_TABLETS,
    secrets: base.secrets,
  });
}

/**
 * 「除了牠自己以外沒有別的東西擋著」（`test:rubric` 的 `clearExceptSelf` 是同一支）。
 * 不是問「牠來之前這裡清不清」—— 程序化道具本來就會因為 `keepClear` 讓開。
 */
const SELF_R = 2.2;
function clearExceptSelf(world, x, z) {
  return !world.solids.some((sd) => Math.hypot(sd.x - x, sd.z - z) >= SELF_R && Math.hypot(sd.x - x, sd.z - z) < sd.r + 0.62);
}

/** 中觀層每一片土地的碰撞圓（帶／母題／高台蓋出來的那些）。 */
async function screenSolids() {
  const { world } = await buildWorld({ base });
  const out = new Map();
  for (const layer of world.screens || []) {
    const list = [];
    for (const node of layer.group.children) {
      for (const sd of World.collectSolids(node, World.terrainHeight)) list.push({ x: sd.x, z: sd.z, r: sd.r, id: sd.id || node.name });
    }
    out.set(layer.id, list);
  }
  return out;
}

/**
 * 一個候選座標過不過離線篩。回問題清單（空陣列＝過）。
 * @param {number} x
 * @param {number} z
 * @param {string} regionId
 * @param {Array} targets  `interactionTargets()`（**不含**這一隻自己）
 * @param {Array} screens  這一片土地的中觀層碰撞圓
 * @param {Array} pathSegs 路網
 */
function problemsAt(x, z, regionId, targets, screens, pathSegs) {
  const problems = [];
  const site = World.REGION_SITES.find((s) => s.id === regionId);
  /*
   * 「在平地半徑內」是**平不平**的代理指標（§4.8 對小濁靈就是這樣寫的）。
   * 12 片土地填滿之後它會擋掉整片外圈，而外圈其實有平得下一隻大濁靈的地方 ——
   * 所以這裡問的是真正在意的那件事：自己與四周 4.6 公尺一圈的覆蓋率都夠高。
   */
  if (Math.hypot(x - site.x, z - site.z) > site.radius) problems.push('超出土地半徑');
  else if (Math.hypot(x - site.x, z - site.z) > site.flat) {
    // 平地半徑外也可以，但要自己證明「這裡真的平」：四周 4.6 公尺一圈的覆蓋率都夠高
    for (let a = 0; a < 8; a += 1) {
      const ang = (a / 8) * Math.PI * 2;
      if (World.coverage(x + Math.cos(ang) * 4.6, z + Math.sin(ang) * 4.6) <= MOTIF_COVERAGE_MIN) {
        problems.push('平地半徑外，而且四周有一圈踩在崩掉的區緣上');
        break;
      }
    }
  }
  const here = World.regionAt(x, z);
  if (!here || here.id !== regionId || here.onBridge) problems.push(`不在 ${regionId} 上`);
  if (World.coverage(x, z) <= MOTIF_COVERAGE_MIN) problems.push(`踩在崩掉的區緣上（coverage ${World.coverage(x, z).toFixed(2)}）`);

  for (const t of targets) {
    const d = Math.hypot(x - t.at[0], z - t.at[1]);
    // 搶 `E` 的每一層：互動圈不重疊；不搶 `E` 的（反應物／祕密）只守淨空
    const need =
      t.k === 'marker'
        ? markerMin(regionId)
        : t.k === 'murk' || t.k === 'greatmurk'
          ? GREAT_MURK_GAP
          : t.k === 'react'
            ? GREAT_MURK_REACT_MIN
            : t.k === 'secret'
              ? GREAT_MURK_AUTO_MIN
              : GREAT_MURK_R + targetRadius(t);
    if (d < need) problems.push(`太靠近 ${t.k}:${t.id}（${d.toFixed(2)} < ${need}）`);
  }
  for (const lm of Props.LANDMARKS) {
    const d = Math.hypot(x - lm.at[0], z - lm.at[1]);
    if (d < MURK_LANDMARK_MIN) problems.push(`太靠近地標 ${lm.id}（${d.toFixed(2)} < ${MURK_LANDMARK_MIN}）`);
  }
  for (const v of Props.STORY_VIGNETTES) {
    const d = Math.hypot(x - v.at[0], z - v.at[1]);
    if (d < MURK_VIGNETTE_MIN) problems.push(`太靠近小景 ${v.id}（${d.toFixed(2)}）`);
  }
  for (const sd of screens) {
    // 中觀層的石頭是**碰撞圓**：守的是「還走得進牠的互動圈」（與 solidProblems 同一條式子）
    const need = GREAT_MURK_CLEAR + World.PLAYER_RADIUS + sd.r;
    const d = Math.hypot(x - sd.x, z - sd.z);
    if (d < need) problems.push(`壓到中觀層 ${sd.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  if (laneDistance(World, x, z) < World.LANE_HALF + LANE_MARGIN) problems.push('離橋的主動線太近');
  if (gateDistance(World, x, z) < GATE_MIN) problems.push('離閘門太近');
  if (Math.hypot(x, z - 6) < SPAWN_MIN) problems.push('離出生點太近');
  if (Math.hypot(x - prologue.shrine.at[0], z - prologue.shrine.at[1]) < SHRINE_MIN) problems.push('離起始祭壇太近');
  const dPath = pathDistance(pathSegs, x, z);
  if (dPath < MURK_PATH_MIN || dPath > MOTIF_PATH_MAX) problems.push(`離路網 ${dPath.toFixed(1)}m（要 ${MURK_PATH_MIN}–${MOTIF_PATH_MAX}）`);
  return problems;
}


/**
 * 站在大濁靈的互動圈上，24 個方向裡有幾個「走得到、而且**是牠贏**」。
 * 「牠贏」＝ 那一點上沒有任何一座石座在 6.5 之內（石座永遠贏濁靈），
 * 也沒有另一隻濁靈離得比牠近（同一層由排名式分先後）。
 */
export function winnableAt(world, entry, murks) {
  const [x, z] = entry.at;
  let win = 0;
  for (let a = 0; a < GREAT_MURK_WINNABLE_DIRS; a += 1) {
    const ang = (a / GREAT_MURK_WINNABLE_DIRS) * Math.PI * 2;
    for (const rr of GREAT_MURK_WINNABLE_RADII) {
      const px = x + Math.cos(ang) * rr;
      const pz = z + Math.sin(ang) * rr;
      if (!world.isClear(px, pz)) continue;
      if (base.challenges.some((c) => Math.hypot(px - c.position[0], pz - c.position[1]) < 6.5)) continue;
      if (murks.some((m) => m.id !== entry.id && Math.hypot(px - m.at[0], pz - m.at[1]) < rr)) continue;
      win += 1;
      break;
    }
  }
  return win;
}

/**
 * 把候選塞進真的世界裡量。
 * @returns {Promise<{ok:boolean, problems:string[], free:number, dirs:number, solid:object|null}>}
 */
export async function verifyInWorld(entry, murks) {
  const list = murks.map((m) => (m.id === entry.id ? entry : m));
  if (!list.some((m) => m.id === entry.id)) list.push(entry);
  const { world } = await buildWorld({ base: { ...base, murks: list } });
  const problems = [];
  const [x, z] = entry.at;
  const solid = world.solids.find((s) => Math.abs(s.x - x) < 0.01 && Math.abs(s.z - z) < 0.01) || null;
  if (!clearExceptSelf(world, x, z)) problems.push('這一點除了牠自己以外還有別的東西擋著');
  if (!world.solidAt(x, z)) problems.push('底座擋不住人');
  if (!solid) problems.push('底座沒有登記成碰撞圓');
  else {
    if (Math.abs(solid.r - GREAT_MURK_BODY_R) > 0.01) problems.push(`底座半徑 ${solid.r.toFixed(2)} ≠ ${GREAT_MURK_BODY_R}`);
    if (!solid.keep) problems.push('底座沒有 keepSolid');
    if (solid.standable) problems.push('底座站得上去（可站立體稽核會紅）');
  }
  let free = 0;
  let dirs = 0;
  for (let a = 0; a < GREAT_MURK_RING_DIRS; a += 1) {
    const ang = (a / GREAT_MURK_RING_DIRS) * Math.PI * 2;
    dirs += 1;
    if (world.isClear(x + Math.cos(ang) * GREAT_MURK_RING, z + Math.sin(ang) * GREAT_MURK_RING)) free += 1;
    else problems.push(`貼身那一圈的第 ${a} 個方向繞不過去`);
  }
  const win = winnableAt(world, entry, list);
  const needWin = GREAT_MURK_WINNABLE_EXCEPTIONS[entry.region] ?? GREAT_MURK_WINNABLE_MIN;
  if (win < needWin) problems.push(`按得到牠的方向太少（${win}/${GREAT_MURK_WINNABLE_DIRS}，要 ≥${needWin}）`);
  // 中觀層有沒有因為這一隻而變紅（`screen-fit --verify` 問的是同一條式子）
  const layer = (world.screens || []).find((l) => l.id === entry.region);
  if (layer) {
    for (const node of layer.group.children) {
      for (const sd of World.collectSolids(node, World.terrainHeight)) {
        const need = GREAT_MURK_CLEAR + World.PLAYER_RADIUS + sd.r;
        const d = Math.hypot(sd.x - x, sd.z - z);
        if (d < need) problems.push(`中觀層 ${sd.id || node.name} 被壓到（${d.toFixed(2)} < ${need.toFixed(2)}）`);
      }
    }
  }
  return { ok: problems.length === 0, problems, free, dirs, win, solid };
}

async function main() {
  const screens = await screenSolids();
  const pathSegs = Props.buildPathNetwork(World.REGION_SITES, [...World.CORRIDORS, ...World.ANNEX_LINKS], base.challenges);
  const greats = murkFile.entries.filter((m) => m.kind === 'great');

  if (flag('verify')) {
    let bad = 0;
    for (const e of greats) {
      const targets = targetsFor(murkFile.entries.filter((m) => m.id !== e.id));
      const off = problemsAt(e.at[0], e.at[1], e.region, targets, screens.get(e.region) || [], pathSegs);
      const res = await verifyInWorld(e, murkFile.entries);
      const all = [...off, ...res.problems];
      console.log(`${all.length ? '✗' : '✓'} ${e.region.padEnd(14)} ${e.id.padEnd(24)} (${e.at[0]}, ${e.at[1]}) · 貼身 ${res.free}/${res.dirs} · 按得到 ${res.win}/${GREAT_MURK_WINNABLE_DIRS}`);
      for (const p of all) console.log(`    · ${p}`);
      if (all.length) bad += 1;
    }
    if (bad) process.exit(1);
    return;
  }

  /*
   * v1.2 · P17：離線篩之後**先用 baseline 世界排序**（不重建）——
   * 擋住四周的多半是**固定景物**（不是程序化雜物：那些會被 `keepClear` 讓開），
   * 而固定景物在 baseline 與加了濁靈之後是同一份。先排序再重建，
   * 一片土地只要重建兩三次就找得到「四周 48/48」的那一個。
   */
  const { world: baseWorld } = await buildWorld({ base });
  const ringFree = (x, z) => {
    let free = 0;
    for (let a = 0; a < GREAT_MURK_RING_DIRS; a += 1) {
      const ang = (a / GREAT_MURK_RING_DIRS) * Math.PI * 2;
      if (baseWorld.isClear(x + Math.cos(ang) * GREAT_MURK_RING, z + Math.sin(ang) * GREAT_MURK_RING)) free += 1;
    }
    return { free, win: winnableAt(baseWorld, { id: '', at: [x, z] }, []) };
  };
  const only = flag('region', null);
  const regions = World.REGION_SITES.map((s) => s.id).filter((r) => !only || r === only);
  const grid = num('grid', 1.5);
  const top = num('top', 8);
  for (const regionId of regions) {
    const site = World.REGION_SITES.find((s) => s.id === regionId);
    const mine = greats.find((m) => m.region === regionId);
    const others = murkFile.entries.filter((m) => !mine || m.id !== mine.id);
    const targets = targetsFor(others);
    const cands = [];
    const why = {};
    const slack = [];
    for (let x = site.x - site.flat; x <= site.x + site.flat; x += grid) {
      for (let z = site.z - site.flat; z <= site.z + site.flat; z += grid) {
        const probs = problemsAt(x, z, regionId, targets, screens.get(regionId) || [], pathSegs);
        if (probs.length) {
          if (flag('slack')) slack.push({ x, z, n: probs.length, probs });
          for (const pr of probs) {
            const key = pr.split('（')[0];
            why[key] = (why[key] || 0) + 1;
          }
          // 只差一條的點：那一條就是這片土地真正的瓶頸（leave-one-out）
          if (probs.length === 1) {
            const key = `只差這一條：${probs[0].split('（')[0]}`;
            why[key] = (why[key] || 0) + 1;
          }
          continue;
        }
        cands.push({ x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), d: pathDistance(pathSegs, x, z), ...ringFree(x, z) });
      }
    }
    // 先看四周空不空（真正難滿足的那一條），再看離路網近不近（遇得到）
    cands.sort((a, b) => (flag('bywin') ? b.win - a.win || b.free - a.free : b.free - a.free || b.win - a.win) || a.d - b.d);
    console.log(`\n### ${regionId}：離線篩剩 ${cands.length} 個格點`);
    if (flag('slack')) {
      slack.sort((a, b) => a.n - b.n);
      for (const c of slack.slice(0, 6)) console.log(`  (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) 差 ${c.n} 條：${c.probs.join(' | ')}`);
      continue;
    }
    if (flag('survey')) {
      const full = cands.filter((c) => c.free >= GREAT_MURK_RING_DIRS);
      console.log(
        `  貼身 ${GREAT_MURK_RING_DIRS}/${GREAT_MURK_RING_DIRS} 的點：${full.length} 個；` +
          `按得到的上限 ${full.length ? Math.max(...full.map((c) => c.win)) : 0}/${GREAT_MURK_WINNABLE_DIRS}`
      );
      continue;
    }
    if (!cands.length || flag('why')) {
      console.log(`  擋掉的原因：${Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, flag('why') === true ? 40 : 6).map(([k, v]) => `${k} ${v}`).join('、')}`);
    }
    if (!cands.length) continue;
    let shown = 0;
    for (const c of cands) {
      if (shown >= top) break;
      const entry = { ...(mine || { id: `murk-great-${regionId}`, region: regionId, kind: 'great', rubric: [{ check: 'assignsTask' }] }), at: [c.x, c.z] };
      const res = await verifyInWorld(entry, others);
      shown += 1;
      console.log(`  ${res.ok ? '✓' : '✗'} (${c.x}, ${c.z}) 離路網 ${c.d.toFixed(1)}m · 貼身 ${res.free}/${res.dirs} · 按得到 ${res.win}/${GREAT_MURK_WINNABLE_DIRS}`);
      for (const p of res.problems.slice(0, 3)) console.log(`      · ${p}`);
      if (res.ok && !flag('all-candidates')) break;
    }
  }
}

await main();

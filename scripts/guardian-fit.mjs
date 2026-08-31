#!/usr/bin/env node
/**
 * Promptasy — 守門者的落點搜尋器（v1.2 · P18）
 *
 * 與 `scripts/murk-fit.mjs`／`scripts/screen-fit.mjs` 同一套作法（P12 起的慣例）：
 * **改資料 → 重建世界 → 量**。理由一樣 —— 守門者會進 `keepClear`，移動他一寸，
 * 整片土地的程序化道具就重擲一次，「他四周走不走得到」離線算不出來。
 *
 * 兩段式：
 *   ① **離線篩**（毫秒級）：格點掃過整片土地，用 `scripts/lib/screen-rules.mjs` 的
 *      **同一份門檻**濾掉一看就不行的點 —— 區域歸屬、覆蓋率、**互動圈與每一層都不重疊**、
 *      離主動線／閘門／出生點／起始祭壇、離中觀層的石頭、離路網 3–12 公尺、
 *      以及這一格自己的前提：**站在那道「不會關上的門」旁邊**（≤ 12 公尺）。
 *   ② **重建驗**（每個候選 ~0.5 秒）：把候選塞進 `createWorld({ guardians })`，
 *      對真的蓋出來的世界量：底座擋不擋得住人、貼身三圈 × 8 個方向繞不繞得過去、
 *      互動圈上 24 個方向站不站得住、中觀層有沒有被他壓掉
 *      （＝ `screen-fit --verify` 會不會因此變紅）。
 *
 * 用法：
 *   node scripts/guardian-fit.mjs --verify              驗 guardian.json 現行的落點
 *   node scripts/guardian-fit.mjs --region wards        搜那一片土地
 *   node scripts/guardian-fit.mjs --region wards --why  印「被哪一條擋掉」的統計
 *   node scripts/guardian-fit.mjs --survey              印各種互動半徑下還剩幾個落點
 *                                                      （`GUARDIAN_RADIUS` 3.2 是這樣量出來的）
 *
 * **這支腳本不寫檔**：它只印出座標，要不要放進 `src/data/guardian.json` 由人決定
 * （放進去之後 `test:rubric` 會用同一份門檻再驗一次）。
 */
import { buildWorld, worldOptions, readJson } from './world-harness.mjs';
import Rules from './lib/screen-rules.mjs';

const {
  GUARDIAN_R,
  GUARDIAN_AUTO_MIN,
  GUARDIAN_LANDMARK_MAX,
  GUARDIAN_LANDMARK_ID,
  guardianNeedFrom,
  GUARDIAN_PATH_MIN,
  GUARDIAN_PATH_MAX,
  GUARDIAN_BODY_R,
  GUARDIAN_RING_RADII,
  GUARDIAN_RING_DIRS,
  GUARDIAN_WINNABLE_DIRS,
  GUARDIAN_WINNABLE_MIN,
  GREAT_MURK_SPAWN_MIN,
  GREAT_MURK_SHRINE_MIN,
  MOTIF_COVERAGE_MIN,
  LANE_MARGIN,
  GATE_MIN,
  interactionTargets,
  pathDistance,
} = Rules;

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
const guardianFile = readJson('src/data/guardian.json');
const prologue = readJson('src/data/prologue.json');

/** 所有互動層（守門者自己那一層拿掉 —— 他不跟自己比距離）。 */
function targetsExceptSelf() {
  return interactionTargets({
    challenges: base.challenges,
    inscriptions: base.inscriptions,
    letters: base.letters,
    handles: base.handles,
    reactiveSpots: Reactive.reactiveTargets(),
    murks: base.murks,
    watchmen: base.watchmen,
    echoes: base.echoes,
    // v1.2 · P20b：檔案廊（互動半徑 3.2）—— 守門者那一側量的是 3.2 ＋ 3.2 ＝ 6.4
    archives: base.archives,
    tablets: Props.LORE_TABLETS,
    secrets: base.secrets,
    guardians: [],
  });
}

/**
 * 一個候選座標過不過離線篩。回問題清單（空陣列＝過）。
 * @param {number} x
 * @param {number} z
 * @param {string} regionId
 * @param {Array} targets `interactionTargets()`（**不含**他自己）
 * @param {Array} screens 這一片土地的中觀層碰撞圓
 * @param {Array} pathSegs 路網
 * @param {number} [radius] 要用哪一個互動半徑量（`--survey` 會換掉它）
 */
function problemsAt(x, z, regionId, targets, screens, pathSegs, radius = GUARDIAN_R) {
  const problems = [];
  const site = World.REGION_SITES.find((s) => s.id === regionId);
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
    /*
     * ⚠️ 換半徑調查時**用那個半徑重新算一次**（`guardianNeedFrom(t, radius)`），
     * 不要拿 `GUARDIAN_R` 的輸出做線性平移 —— 反應物／祕密那一條是常數，
     * 平移它等於憑空造一個沒有人訂過的門檻（P18 審查 · 第 5 條）。
     */
    const need = guardianNeedFrom(t, radius);
    const d = Math.hypot(x - t.at[0], z - t.at[1]);
    if (d < need) problems.push(`太靠近 ${t.k}:${t.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  for (const lm of Props.LANDMARKS) {
    const d = Math.hypot(x - lm.at[0], z - lm.at[1]);
    if (d < GUARDIAN_AUTO_MIN) problems.push(`站在地標 ${lm.id} 上（${d.toFixed(2)}）`);
  }
  for (const v of Props.STORY_VIGNETTES) {
    if (Math.hypot(x - v.at[0], z - v.at[1]) < GUARDIAN_AUTO_MIN) problems.push(`站在小景 ${v.id} 上`);
  }
  for (const sd of screens) {
    // 中觀層的石頭是**碰撞圓**：守的是「還走得進他的互動圈」（與 solidProblems 同一條式子）
    const need = radius + World.PLAYER_RADIUS + sd.r;
    const d = Math.hypot(x - sd.x, z - sd.z);
    if (d < need) problems.push(`壓到中觀層 ${sd.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  if (Rules.laneDistance(World, x, z) < World.LANE_HALF + LANE_MARGIN) problems.push('離橋的主動線太近');
  if (Rules.gateDistance(World, x, z) < GATE_MIN) problems.push('離閘門太近');
  // 出生點查 World.SPAWN_AT（v1.2 · P22c：[0, 7.8]；寫死的 6 是舊的出生點 z）
  if (Math.hypot(x - World.SPAWN_AT[0], z - World.SPAWN_AT[1]) < GREAT_MURK_SPAWN_MIN) problems.push('離出生點太近');
  if (Math.hypot(x - prologue.shrine.at[0], z - prologue.shrine.at[1]) < GREAT_MURK_SHRINE_MIN) problems.push('離起始祭壇太近');
  const dPath = pathDistance(pathSegs, x, z);
  if (dPath < GUARDIAN_PATH_MIN || dPath > GUARDIAN_PATH_MAX) {
    problems.push(`離路網 ${dPath.toFixed(1)}m（要 ${GUARDIAN_PATH_MIN}–${GUARDIAN_PATH_MAX}）`);
  }
  // 這一格自己的前提：他是**站在那道門旁邊**的人
  // （`--doorMax` 是探勘用的覆寫：收尾時一定要回到 `screen-rules.mjs` 的那一份）
  const door = Props.LANDMARKS.find((l) => l.id === GUARDIAN_LANDMARK_ID);
  const doorMax = num('doorMax', GUARDIAN_LANDMARK_MAX);
  if (door) {
    const d = Math.hypot(x - door.at[0], z - door.at[1]);
    if (d > doorMax) problems.push(`離那道門 ${d.toFixed(1)}m（要 ≤ ${doorMax}）`);
  }
  return problems;
}

/** 中觀層每一片土地的碰撞圓（帶／母題／高台蓋出來的那些）。 */
async function screenSolids() {
  const { world } = await buildWorld({ base });
  const out = new Map();
  for (const layer of world.screens || []) {
    const list = [];
    for (const node of layer.group.children) {
      for (const sd of World.collectSolids(node, World.terrainHeight)) {
        list.push({ x: sd.x, z: sd.z, r: sd.r, id: sd.id || node.name });
      }
    }
    out.set(layer.id, list);
  }
  return out;
}

/** 「除了他自己以外沒有別的東西擋著」（`test:rubric` 用的是同一支）。 */
const SELF_R = 1.4;
function clearExceptSelf(world, x, z) {
  return !world.solids.some(
    (sd) => Math.hypot(sd.x - x, sd.z - z) >= SELF_R && Math.hypot(sd.x - x, sd.z - z) < sd.r + World.PLAYER_RADIUS
  );
}

/**
 * 站在他的互動圈上，24 個方向裡有幾個站得住（他的圈與每一層都不重疊，
 * 所以「是他贏」在幾何上本來就成立 —— 這一支真正在量的是站不站得住）。
 */
export function winnableAt(world, at, radius = GUARDIAN_R) {
  let free = 0;
  for (let a = 0; a < GUARDIAN_WINNABLE_DIRS; a += 1) {
    const ang = (a / GUARDIAN_WINNABLE_DIRS) * Math.PI * 2;
    const px = at[0] + Math.cos(ang) * (radius - 0.3);
    const pz = at[1] + Math.sin(ang) * (radius - 0.3);
    if (!world.isWalkable(px, pz) || world.solidAt(px, pz)) continue;
    free += 1;
  }
  return free;
}

/** 把候選塞進真的世界裡量。 */
export async function verifyInWorld(entry) {
  const { world } = await buildWorld({ base: { ...base, guardians: [entry] } });
  const problems = [];
  const [x, z] = entry.at;
  const solid = world.solids.find((s) => Math.abs(s.x - x) < 0.01 && Math.abs(s.z - z) < 0.01) || null;
  if (!clearExceptSelf(world, x, z)) problems.push('這一點除了他自己以外還有別的東西擋著');
  if (!world.solidAt(x, z)) problems.push('本體擋不住人');
  if (!solid) problems.push('底座沒有登記成碰撞圓');
  else {
    if (Math.abs(solid.r - GUARDIAN_BODY_R) > 0.01) problems.push(`底座半徑 ${solid.r.toFixed(2)} ≠ ${GUARDIAN_BODY_R}`);
    if (!solid.keep) problems.push('底座沒有 keepSolid');
    if (solid.standable) problems.push('底座站得上去（可站立體稽核會紅）');
  }
  let free = 0;
  let dirs = 0;
  for (let a = 0; a < GUARDIAN_RING_DIRS; a += 1) {
    const ang = (a / GUARDIAN_RING_DIRS) * Math.PI * 2;
    for (const rr of GUARDIAN_RING_RADII) {
      dirs += 1;
      if (world.isClear(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr)) free += 1;
      else problems.push(`貼身 ${rr}m 的第 ${a} 個方向繞不過去`);
    }
  }
  const win = winnableAt(world, entry.at);
  if (win < GUARDIAN_WINNABLE_MIN) problems.push(`互動圈上站得住的方向太少（${win}/${GUARDIAN_WINNABLE_DIRS}）`);
  // 中觀層有沒有因為他而變紅（`screen-fit --verify` 問的是同一條式子）
  const layer = (world.screens || []).find((l) => l.id === entry.region);
  if (layer) {
    for (const node of layer.group.children) {
      for (const sd of World.collectSolids(node, World.terrainHeight)) {
        const need = GUARDIAN_R + World.PLAYER_RADIUS + sd.r;
        const d = Math.hypot(sd.x - x, sd.z - z);
        if (d < need) problems.push(`中觀層 ${sd.id || node.name} 被壓到（${d.toFixed(2)} < ${need.toFixed(2)}）`);
      }
    }
  }
  return { ok: problems.length === 0, problems, free, dirs, win };
}

async function main() {
  const screens = await screenSolids();
  const pathSegs = Props.buildPathNetwork(
    World.REGION_SITES,
    [...World.CORRIDORS, ...World.ANNEX_LINKS],
    base.challenges,
    (await import('../src/world/screens.js')).PATH_BENDS
  );
  const targets = targetsExceptSelf();
  const door = Props.LANDMARKS.find((l) => l.id === GUARDIAN_LANDMARK_ID);

  if (flag('verify')) {
    const e = guardianFile;
    const off = problemsAt(e.at[0], e.at[1], e.region, targets, screens.get(e.region) || [], pathSegs);
    const res = await verifyInWorld(e);
    const all = [...off, ...res.problems];
    const dDoor = door ? Math.hypot(e.at[0] - door.at[0], e.at[1] - door.at[1]) : NaN;
    console.log(
      `${all.length ? '✗' : '✓'} ${e.region.padEnd(8)} ${e.id.padEnd(16)} (${e.at[0]}, ${e.at[1]}) · ` +
        `離門 ${dDoor.toFixed(1)}m · 貼身 ${res.free}/${res.dirs} · 站得住 ${res.win}/${GUARDIAN_WINNABLE_DIRS}`
    );
    for (const p of all) console.log(`    · ${p}`);
    if (all.length) process.exit(1);
    return;
  }

  const regionId = flag('region', guardianFile.region) || guardianFile.region;
  const site = World.REGION_SITES.find((s) => s.id === regionId);
  const grid = num('grid', 0.5);
  const scan = (radius) => {
    const cands = [];
    const why = {};
    for (let x = site.x - site.radius; x <= site.x + site.radius; x += grid) {
      for (let z = site.z - site.radius; z <= site.z + site.radius; z += grid) {
        const probs = problemsAt(x, z, regionId, targets, screens.get(regionId) || [], pathSegs, radius);
        if (probs.length) {
          for (const pr of probs) {
            const key = pr.split('（')[0];
            why[key] = (why[key] || 0) + 1;
          }
          if (probs.length === 1) {
            const key = `只差這一條：${probs[0].split('（')[0]}`;
            why[key] = (why[key] || 0) + 1;
          }
          continue;
        }
        cands.push({
          x: Number(x.toFixed(2)),
          z: Number(z.toFixed(2)),
          door: door ? Math.hypot(x - door.at[0], z - door.at[1]) : NaN,
          path: pathDistance(pathSegs, x, z),
        });
      }
    }
    return { cands, why };
  };

  /*
   * `--survey`：**互動半徑收到多少才擺得下**（`GUARDIAN_RADIUS` 3.2 就是這樣量出來的）。
   * 這一段印出來的數字直接對得上 `screen-rules.mjs` 與 WORLD.md 裡寫的理由。
   */
  if (flag('survey')) {
    for (const r of [4.6, 4.0, 3.8, 3.2, 2.8]) {
      const { cands } = scan(r);
      const near = cands.filter((c) => c.door <= GUARDIAN_LANDMARK_MAX);
      const nearest = cands.length ? Math.min(...cands.map((c) => c.door)) : NaN;
      const farthest = cands.length ? Math.max(...cands.map((c) => c.door)) : NaN;
      const span = cands.length ? `${nearest.toFixed(1)}–${farthest.toFixed(1)}m` : '—';
      console.log(
        `互動半徑 ${String(r).padEnd(4)} → 合格點 ${String(cands.length).padStart(3)} 個` +
          `（門邊 ≤${GUARDIAN_LANDMARK_MAX}m 的 ${near.length} 個；離門 ${span}）`
      );
    }
    return;
  }

  const { cands, why } = scan(GUARDIAN_R);
  console.log(`\n### ${regionId}：離線篩剩 ${cands.length} 個格點（互動半徑 ${GUARDIAN_R}）`);
  if (!cands.length || flag('why')) {
    console.log(
      `  擋掉的原因：${Object.entries(why)
        .sort((a, b) => b[1] - a[1])
        .slice(0, flag('why') === true ? 40 : 6)
        .map(([k, v]) => `${k} ${v}`)
        .join('、')}`
    );
  }
  cands.sort((a, b) => a.door - b.door);
  let shown = 0;
  for (const c of cands) {
    if (shown >= num('top', 6)) break;
    const res = await verifyInWorld({ ...guardianFile, at: [c.x, c.z] });
    shown += 1;
    console.log(
      `  ${res.ok ? '✓' : '✗'} (${c.x}, ${c.z}) 離門 ${c.door.toFixed(1)}m · 離路網 ${c.path.toFixed(1)}m · ` +
        `貼身 ${res.free}/${res.dirs} · 站得住 ${res.win}/${GUARDIAN_WINNABLE_DIRS}`
    );
    for (const p of res.problems.slice(0, 3)) console.log(`      · ${p}`);
    if (res.ok && !flag('all-candidates')) break;
  }
}

await main();

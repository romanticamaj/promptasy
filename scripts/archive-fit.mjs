#!/usr/bin/env node
/**
 * Promptasy — 檔案廊的落點搜尋器（v1.2 · P20b）
 *
 * 與 `scripts/guardian-fit.mjs`／`murk-fit.mjs`／`screen-fit.mjs` 同一套作法（P12 起的慣例）：
 * **改資料 → 重建世界 → 量**。檔案廊會進 `keepClear`（一座展館被草叢埋掉就等於沒蓋），
 * 移動它一寸，整片土地的程序化道具就重擲一次 —— 「它四周走不走得到」離線算不出來。
 *
 * 兩段式：
 *   ① **離線篩**（毫秒級）：格點掃過整片土地，用 `scripts/lib/screen-rules.mjs` 的
 *      **同一份門檻**濾掉一看就不行的點 —— 區域歸屬、覆蓋率、互動圈不重疊、
 *      離主動線／閘門／出生點／起始祭壇、離中觀層的石頭、離路網 3–26 公尺、
 *      以及這一層自己的前提：頂棚四個角腳下要夠平（`ARCHIVE_STEP_DROP_MAX`）。
 *   ② **重建驗**（每個候選 ~0.5 秒）：把候選塞進 `createWorld({ archives })`，
 *      對真的蓋出來的世界量：貼著頂棚那一圈繞不繞得過去、「走近浮出」的那一圈上
 *      24 個方向站不站得住、中觀層有沒有被它壓掉（＝ `screen-fit --verify` 會不會變紅）。
 *
 * 用法：
 *   node scripts/archive-fit.mjs --verify                  驗 archive.json 現行的落點
 *   node scripts/archive-fit.mjs --region wards            搜那一片土地
 *   node scripts/archive-fit.mjs --region wards --why      印「被哪一條擋掉」的統計
 *   node scripts/archive-fit.mjs --all                     12 片土地各挑一個落點（印成 JSON 片段）
 *   node scripts/archive-fit.mjs --ceiling --region wards  石座那一條的**上限**是多少
 *                                                         （把石座那一條拿掉、其餘照舊，
 *                                                          再看合格點裡離最近石座最遠到哪）
 *
 * **這支腳本不寫檔**：它只印出座標，要不要放進 `src/data/archive.json` 由人決定
 * （放進去之後 `test:rubric` 會用同一份門檻再驗一次）。
 */
import { buildWorld, worldOptions, readJson } from './world-harness.mjs';
import Rules from './lib/screen-rules.mjs';

const {
  ARCHIVE_R,
  ARCHIVE_BODY_R,
  ARCHIVE_AUTO_MIN,
  ARCHIVE_PATH_MIN,
  ARCHIVE_PATH_MAX,
  ARCHIVE_WINNABLE_DIRS,
  ARCHIVE_STAND_MIN,
  ARCHIVE_RING_DIRS,
  ARCHIVE_STEP_DROP_MAX,
  archiveNeedFrom,
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
const Archive = await import('../src/world/archives.js');
const base = await worldOptions();
const archiveFile = readJson('src/data/archive.json');
const prologue = readJson('src/data/prologue.json');

/** 所有互動層（檔案廊自己那一層拿掉 —— 它不跟自己比距離）。 */
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
    guardians: base.guardians,
    tablets: Props.LORE_TABLETS,
    secrets: base.secrets,
    archives: [],
  });
}

/**
 * 一個候選座標過不過離線篩。回問題清單（空陣列＝過）。
 *
 * @param {number} x
 * @param {number} z
 * @param {string} regionId
 * @param {Array} targets `interactionTargets()`（**不含**它自己）
 * @param {Array} screens 這一片土地的中觀層碰撞圓
 * @param {Array} pathSegs 路網
 * @param {boolean} [skipMarker] `--ceiling` 用：把石座那一條拿掉，其餘照舊
 * @param {object} [bare] 「還沒有檔案廊」的那個世界
 * @param {number|null} [rot] 出貨的 `rotation.y`；`null` ＝ 還沒定案，照 `facingToPath()` 推
 */
function problemsAt(x, z, regionId, targets, screens, pathSegs, skipMarker = false, bare = null, rot = null) {
  const problems = [];
  const site = World.REGION_SITES.find((s) => s.id === regionId);
  if (Math.hypot(x - site.x, z - site.z) > site.flat) problems.push('超出平地半徑');
  const here = World.regionAt(x, z);
  if (!here || here.id !== regionId || here.onBridge) problems.push(`不在 ${regionId} 上`);
  if (World.coverage(x, z) <= MOTIF_COVERAGE_MIN) {
    problems.push(`踩在崩掉的區緣上（coverage ${World.coverage(x, z).toFixed(2)}）`);
  }

  for (const t of targets) {
    if (skipMarker && t.k === 'marker') continue;
    const need = archiveNeedFrom(t, regionId);
    const d = Math.hypot(x - t.at[0], z - t.at[1]);
    if (d < need) problems.push(`太靠近 ${t.k}:${t.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  for (const lm of Props.LANDMARKS) {
    const d = Math.hypot(x - lm.at[0], z - lm.at[1]);
    if (d < ARCHIVE_AUTO_MIN) problems.push(`蓋在地標 ${lm.id} 上（${d.toFixed(2)}）`);
  }
  for (const v of Props.STORY_VIGNETTES) {
    if (Math.hypot(x - v.at[0], z - v.at[1]) < ARCHIVE_AUTO_MIN) problems.push(`蓋在小景 ${v.id} 上`);
  }
  for (const sd of screens) {
    // 中觀層的石頭是**碰撞圓**：守的是「還走得進它那一圈」（與 solidProblems 同一條式子）
    const need = ARCHIVE_R + World.PLAYER_RADIUS + sd.r;
    const d = Math.hypot(x - sd.x, z - sd.z);
    if (d < need) problems.push(`壓到中觀層 ${sd.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  if (Rules.laneDistance(World, x, z) < World.LANE_HALF + LANE_MARGIN) problems.push('離橋的主動線太近');
  if (Rules.gateDistance(World, x, z) < GATE_MIN) problems.push('離閘門太近');
  // 出生點查 World.SPAWN_AT（v1.2 · P22c：[0, 7.8]；寫死的 6 是舊的出生點 z）
  if (Math.hypot(x - World.SPAWN_AT[0], z - World.SPAWN_AT[1]) < GREAT_MURK_SPAWN_MIN) problems.push('離出生點太近');
  if (Math.hypot(x - prologue.shrine.at[0], z - prologue.shrine.at[1]) < GREAT_MURK_SHRINE_MIN) {
    problems.push('離起始祭壇太近');
  }
  const dPath = pathDistance(pathSegs, x, z);
  if (dPath < ARCHIVE_PATH_MIN || dPath > ARCHIVE_PATH_MAX) {
    problems.push(`離路網 ${dPath.toFixed(1)}m（要 ${ARCHIVE_PATH_MIN}–${ARCHIVE_PATH_MAX}）`);
  }
  /*
   * 離線的「走得到」前提：`ARCHIVE_R` 那一圈上 24 個方向的**覆蓋率**都要夠高。
   * 這不是重建驗那一條（那一條還要問石頭與坡度），而是先用地形把
   * 「四周有一半懸在虛空上」的點便宜地刷掉 —— 不然搜尋器會一路
   * 把候選餵給每個 0.5 秒的重建驗，然後全部紅在同一個理由上。
   */
  for (let a = 0; a < ARCHIVE_WINNABLE_DIRS; a += 1) {
    const ang = (a / ARCHIVE_WINNABLE_DIRS) * Math.PI * 2;
    const rx = x + Math.cos(ang) * (ARCHIVE_R - 0.3);
    const rz = z + Math.sin(ang) * (ARCHIVE_R - 0.3);
    if (World.coverage(rx, rz) <= MOTIF_COVERAGE_MIN) {
      problems.push('那一圈上有方向踩在崩掉的區緣外');
      break;
    }
  }
  // 「現在那裡有沒有東西壓著」——見 `baseWorldAndScreens()` 的檔頭（保守關）
  if (bare && bare.solidAt(x, z)) problems.push('那一點現在有東西壓著（建物／道具）');
  /*
   * 這一層自己的前提：頂棚四個角腳下要夠平（一半埋在山坡裡就不叫展館了）。
   *
   * 量的要是**真的會蓋出來的那四根腳** —— 整組轉過 `rot`，取沒轉過的四角
   * 等於在保證另一座展館的事（一道裝飾用的門）。搜尋時 `rot` 還沒定案，
   * 但它是 `facingToPath()` 推出來的、這裡拿得到路網，所以照同一支現推一次；
   * `--verify` 則直接餵出貨的那個值。四點的世界座標走 `archives.js` 的同一支。
   */
  const theta = rot === null ? facingToPath(pathSegs, x, z) : rot;
  const hs = Archive.archiveFootprint([x, z], theta).map(([fx, fz]) => World.terrainHeight(fx, fz));
  const drop = Math.max(...hs) - Math.min(...hs);
  if (drop > ARCHIVE_STEP_DROP_MAX) problems.push(`頂棚四角落差 ${drop.toFixed(2)}m（要 ≤ ${ARCHIVE_STEP_DROP_MAX}）`);
  return problems;
}

/**
 * 蓋一次「還沒有檔案廊」的世界，把兩樣東西一起帶出來：
 *   · 中觀層每一片土地的碰撞圓（帶／母題／高台蓋出來的那些）
 *   · 那個世界本身（離線篩要用它問「這一點現在有沒有東西壓著」）
 *
 * 為什麼離線篩也要問一次世界：分歧之廳那座**建物本身**是量體
 * （不是中觀層、也不吃 `keepClear`），純靠距離規則的離線篩看不見它 ——
 * 第一版就是這樣把 207 個「合格」候選一個一個餵進 0.5 秒的重建驗，
 * 然後全部紅在同一句「站不進去」上。
 * 這一關是**保守**的：檔案廊自己會把 5.2 公尺內的程序化道具擠開，
 * 所以少數被道具擋住、其實擺得下的點會被這一關誤殺 —— 寧可漏掉，不要空轉。
 *
 * **`archives: []` 不能省**：`worldOptions()` 現在把出貨的 12 座也讀了進來
 * （`test:rubric` 要量真的出貨的那個世界），於是這裡蓋出來的會是「已經有檔案廊」
 * 的世界 —— 它們 5.2 公尺的 `keepClear` 早就把各自周圍的程序化道具清掉了，
 * 重搜某一片土地時就會看到一片「因為那座展館已經在那裡」才空出來的空地，
 * 然後提出一個只有在它存在時才成立的落點。
 */
async function baseWorldAndScreens() {
  const { world } = await buildWorld({ base: { ...base, archives: [] } });
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
  return { world, screens: out };
}

/**
 * 站在「走近浮出」的那一圈上，24 個方向裡有幾個站得住。
 * 它不搶 `E`，所以這一支量的是**走不走得到**，不是「是不是它贏」。
 */
export function standableAt(world, at) {
  let free = 0;
  for (let a = 0; a < ARCHIVE_WINNABLE_DIRS; a += 1) {
    const ang = (a / ARCHIVE_WINNABLE_DIRS) * Math.PI * 2;
    const px = at[0] + Math.cos(ang) * (ARCHIVE_R - 0.3);
    const pz = at[1] + Math.sin(ang) * (ARCHIVE_R - 0.3);
    if (!world.isWalkable(px, pz) || world.solidAt(px, pz)) continue;
    free += 1;
  }
  return free;
}

/** 把候選塞進真的世界裡量。 */
export async function verifyInWorld(entry) {
  const { world } = await buildWorld({ base: { ...base, archives: [entry] } });
  const problems = [];
  const [x, z] = entry.at;
  /*
   * 它**零碰撞體**（細桿與飄在頭上的展品都不擋人，同 §4.16 那道門的柱子）——
   * 所以這裡先證「真的沒有登記任何碰撞圓」，再證「人走得進去」。
   */
  if (world.solidAt(x, z)) problems.push('展館中心站不進去（有東西擋著）');
  let free = 0;
  let dirs = 0;
  const ring = ARCHIVE_BODY_R + World.PLAYER_RADIUS;
  for (let a = 0; a < ARCHIVE_RING_DIRS; a += 1) {
    const ang = (a / ARCHIVE_RING_DIRS) * Math.PI * 2;
    dirs += 1;
    if (world.isClear(x + Math.cos(ang) * ring, z + Math.sin(ang) * ring)) free += 1;
    else problems.push(`貼著頂棚那一圈的第 ${a} 個方向繞不過去`);
  }
  const stand = standableAt(world, entry.at);
  if (stand < ARCHIVE_STAND_MIN) problems.push(`那一圈上站得住的方向太少（${stand}/${ARCHIVE_WINNABLE_DIRS}）`);
  // 中觀層有沒有因為它而變紅（`screen-fit --verify` 問的是同一條式子）
  const layer = (world.screens || []).find((l) => l.id === entry.region);
  if (layer) {
    for (const node of layer.group.children) {
      for (const sd of World.collectSolids(node, World.terrainHeight)) {
        const need = ARCHIVE_R + World.PLAYER_RADIUS + sd.r;
        const d = Math.hypot(sd.x - x, sd.z - z);
        if (d < need) problems.push(`中觀層 ${sd.id || node.name} 被壓到（${d.toFixed(2)} < ${need.toFixed(2)}）`);
      }
    }
  }
  return { ok: problems.length === 0, problems, free, dirs, stand };
}

/**
 * 展館朝哪裡：**面向最近的那條路**（`rotation.y` 的慣例是「局部 +Z 轉到這個方向」）。
 * 兩座檔案龕擺在局部 ±X，所以人從路那一側走進來時，兩則小知識一左一右。
 */
export function facingToPath(pathSegs, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const s of pathSegs) {
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / len2)) : 0;
    const px = s[0] + dx * t;
    const pz = s[1] + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  if (!best) return 0;
  return Number(Math.atan2(best[0] - x, best[1] - z).toFixed(3));
}

async function main() {
  const { world: bare, screens } = await baseWorldAndScreens();
  const pathSegs = Props.buildPathNetwork(
    World.REGION_SITES,
    [...World.CORRIDORS, ...World.ANNEX_LINKS],
    base.challenges,
    (await import('../src/world/screens.js')).PATH_BENDS
  );
  const targets = targetsExceptSelf();

  if (flag('verify')) {
    let bad = 0;
    for (const h of archiveFile.halls) {
      const off = problemsAt(h.at[0], h.at[1], h.region, targets, screens.get(h.region) || [], pathSegs, false, null, h.rot);
      const res = await verifyInWorld(h);
      const all = [...off, ...res.problems];
      if (all.length) bad += 1;
      console.log(
        `${all.length ? '✗' : '✓'} ${h.region.padEnd(14)} ${h.id.padEnd(20)} (${h.at[0]}, ${h.at[1]}) · ` +
          `離路網 ${pathDistance(pathSegs, h.at[0], h.at[1]).toFixed(1)}m · 貼身 ${res.free}/${res.dirs} · ` +
          `站得住 ${res.stand}/${ARCHIVE_WINNABLE_DIRS}`
      );
      for (const p of all.slice(0, 4)) console.log(`    · ${p}`);
    }
    if (bad) process.exit(1);
    return;
  }

  const grid = num('grid', 0.5);
  const regions = flag('all')
    ? World.REGION_SITES.map((s) => s.id)
    : [flag('region', 'foundations')];

  const picked = [];
  for (const regionId of regions) {
    const site = World.REGION_SITES.find((s) => s.id === regionId);
    const cands = [];
    const why = {};
    for (let x = site.x - site.flat; x <= site.x + site.flat; x += grid) {
      for (let z = site.z - site.flat; z <= site.z + site.flat; z += grid) {
        const probs = problemsAt(x, z, regionId, targets, screens.get(regionId) || [], pathSegs, Boolean(flag('ceiling')), bare);
        if (probs.length) {
          for (const pr of probs) {
            const key = pr.split('（')[0];
            why[key] = (why[key] || 0) + 1;
          }
          continue;
        }
        cands.push({
          x: Number(x.toFixed(2)),
          z: Number(z.toFixed(2)),
          path: pathDistance(pathSegs, x, z),
          marker: Math.min(
            ...targets.filter((t) => t.k === 'marker').map((t) => Math.hypot(x - t.at[0], z - t.at[1]))
          ),
        });
      }
    }
    console.log(`\n### ${regionId}：離線篩剩 ${cands.length} 個格點`);
    if (!cands.length || flag('why')) {
      console.log(
        `  擋掉的原因：${Object.entries(why)
          .sort((a, b) => b[1] - a[1])
          .slice(0, flag('why') === true ? 40 : 6)
          .map(([k, v]) => `${k} ${v}`)
          .join('、')}`
      );
    }
    if (flag('ceiling')) {
      const ceil = cands.length ? Math.max(...cands.map((c) => c.marker)) : NaN;
      console.log(`  石座那一條的上限：${ceil.toFixed(2)}（${cands.length} 個合格點）`);
      continue;
    }
    /*
     * 挑哪一個：**離路網最近**的那一個（展館要被走到，不是被找到）；
     * 同距離時取 x、z 較小的那一個 —— 排序完全確定，換一台機器跑出同一個答案。
     */
    cands.sort((a, b) => a.path - b.path || a.x - b.x || a.z - b.z);
    /*
     * **試的順序要鋪開**：純照「離路網最近」排的話，前一百個候選全部擠在同一段路邊，
     * 於是一整輪重建驗都紅在同一個理由上（量器坊與分歧之廳第一版就是這樣搜不到落點的）。
     * 貪婪地挑「彼此至少隔 `PROBE_GAP` 公尺」的一批先試，其餘照原順序接在後面 ——
     * 排序完全確定，換一台機器跑出同一個答案。
     */
    const PROBE_GAP = 6;
    const probes = [];
    const rest = [];
    for (const c of cands) {
      if (probes.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= PROBE_GAP)) probes.push(c);
      else rest.push(c);
    }
    let shown = 0;
    for (const c of [...probes, ...rest]) {
      if (shown >= num('top', 8)) break;
      const entry = { id: `hall-${regionId}`, region: regionId, at: [c.x, c.z], rot: facingToPath(pathSegs, c.x, c.z) };
      const res = await verifyInWorld(entry);
      shown += 1;
      console.log(
        `  ${res.ok ? '✓' : '✗'} (${c.x}, ${c.z}) rot ${entry.rot} · 離路網 ${c.path.toFixed(1)}m · ` +
          `離最近石座 ${c.marker.toFixed(1)}m · 貼身 ${res.free}/${res.dirs} · 站得住 ${res.stand}/${ARCHIVE_WINNABLE_DIRS}`
      );
      for (const p of res.problems.slice(0, 2)) console.log(`      · ${p}`);
      if (res.ok) {
        picked.push(entry);
        break;
      }
    }
  }
  if (picked.length) console.log(`\n${JSON.stringify(picked, null, 2)}`);
}

await main();

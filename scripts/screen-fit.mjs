#!/usr/bin/env node
/**
 * Promptasy — 中觀層的落點搜尋器（v1.2 · P12；P11 交接的第一項建議）
 *
 * P11 是拿離線幾何猜座標猜出來的，繞了很多冤枉路。原因寫在 `findings.md`：
 * **母題與遮擋帶都會進 `keepClear`**，移動它一寸，整片土地的程序化道具就重擲一次 ——
 * 「它四周走不走得到」這種問題**離線算不出來**，只有真的把世界蓋起來才量得到。
 * 所以這支腳本走的是「**改資料 → 重建世界 → 量**」的迴圈（世界蓋一次約 0.5 秒）。
 *
 * 兩段式，因為重建很貴：
 *   ① **離線篩**（毫秒級）：格點掃過整片土地，用 `scripts/lib/screen-rules.mjs` 的
 *      同一份門檻濾掉「一看就不行」的點 —— 區域歸屬、覆蓋率、離各層互動圈、離主動線、
 *      離閘門、離地標留白、母題離路網 9–26 公尺、母題彼此 ≥16 公尺、腳下夠平。
 *   ② **重建驗**（每個候選 0.5 秒）：把候選塞進 `createWorld({ screens })`，
 *      對**真的蓋出來的那個世界**量：每個碰撞圓的擺位、`solidAt` 擋不擋得住人、
 *      四周 16 個方向走不走得到、每一塊有沒有貼自己腳下的地；
 *      遮擋帶再多量一次視線稽核（前 12 公尺看不到、25 公尺內揭露）。
 *
 * 用法：
 *   node scripts/screen-fit.mjs --verify                          驗現行資料（自我驗證）
 *   node scripts/screen-fit.mjs --region grounding --kind motif --shape pageStack --height 5
 *   node scripts/screen-fit.mjs --region grounding --kind band --length 8 --depth 2.4 --height 12
 *   node scripts/screen-fit.mjs --region foundations --kind platform --height 1.6 --radius 2.6
 *
 * 常用旗標：`--top N`（重建幾個候選，預設 12）、`--grid N`（離線格點，預設 2 公尺）、
 * `--rot N`（遮擋帶試幾個角度，預設 12）、`--json`。
 *
 * **這支腳本不寫檔**：它只印出候選座標，要不要放進 `src/world/screens.js` 由人決定
 * （放進去之後 `test:rubric` 會用同一份門檻再驗一次）。
 */
import { fileURLToPath } from 'node:url';
import { buildWorld, worldOptions, readJson } from './world-harness.mjs';
import Rules from './lib/screen-rules.mjs';

const {
  MOTIF_PATH_MIN,
  MOTIF_PATH_MAX,
  MOTIF_GAP,
  BAND_GAP,
  MOTIF_COVERAGE_MIN,
  MOTIF_STEP_DROP_MAX,
  GROUND_HUG_MAX,
  GROUND_BURY_MAX,
  interactionTargets,
  laneDistance,
  gateDistance,
  pathDistance,
  solidProblems,
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

/**
 * 把所有互動層讀成 `interactionTargets()` 吃的形狀（與 `test:rubric` 同一份資料檔）。
 */
async function loadTargets() {
  const Props = await import('../src/world/props.js');
  const Reactive = await import('../src/world/reactive.js');
  return interactionTargets({
    challenges: readJson('src/data/challenges.json').challenges,
    inscriptions: readJson('src/data/inscriptions.json').entries,
    letters: readJson('src/data/letters.json').entries,
    handles: readJson('src/data/handles.json').entries,
    reactiveSpots: Reactive.REACTIVE_SPOTS,
    murks: readJson('src/data/murks.json').entries,
    tablets: Props.LORE_TABLETS,
    secrets: readJson('src/data/secrets.json').entries,
  });
}

/**
 * 一個候選（母題或遮擋帶）在**真的蓋出來的世界**裡過不過。
 * @returns {Promise<{ok:boolean, problems:string[], solids:number, free:number, hug:number[], sight:object|null}>}
 */
async function verifyInWorld({ regionId, bands, motifs, platforms = [], bends, focusIds, landmarks, base, wantSight }) {
  const World = await import('../src/world/world.js');
  const Screens = await import('../src/world/screens.js');
  const { world, THREE } = await buildWorld({ screens: { bands, motifs, platforms, bends }, base });
  const layer = world.screens.find((l) => l.id === regionId) || null;
  const problems = [];
  if (!layer) return { ok: false, problems: ['這一區沒有蓋出中觀層'], solids: 0, free: 0, hug: [], sight: null };

  const targets = await loadTargets();
  // 只看這一次要驗的那幾個節點（別人早就驗過了，不必重算）
  const nodes = layer.group.children.filter((c) => focusIds.some((id) => c.name.endsWith(`:${id}`)));
  if (!nodes.length) problems.push('場景圖裡找不到這個候選的節點');
  let solids = 0;
  for (const node of nodes) {
    for (const sd of World.collectSolids(node, World.terrainHeight)) {
      solids += 1;
      for (const p of solidProblems(World, sd, regionId, targets, landmarks)) problems.push(p);
    }
  }

  /*
   * v1.2 · P14：高台自己那三條（其餘擺位規則與母題共用上面那一套）。
   * 量的是**真的蓋出來的世界**登記出來的那一顆圓 —— 頂面站不站得上去、
   * 平到多遠、有沒有被別的東西擋到它自己的頂面，離線幾何一條都算不出來。
   */
  for (const pf of platforms) {
    if (!focusIds.includes(pf.id)) continue;
    const sd = world.solids.find((c) => c.id === pf.id);
    if (!sd) {
      problems.push(`${pf.id} 沒有登記成碰撞圓（頂面就無從量起）`);
      continue;
    }
    const h = sd.standTop - World.terrainHeight(sd.x, sd.z);
    if (!sd.standable) problems.push(`${pf.id} 站不上去（standable=false）`);
    if (sd.standR < Screens.PLATFORM_STAND_R_MIN) {
      problems.push(`${pf.id} 頂面平的那一段只有 ${sd.standR.toFixed(2)}m（要 ≥${Screens.PLATFORM_STAND_R_MIN}）`);
    }
    if (h < World.STAND_MIN_H || h > World.STAND_MAX_H) {
      problems.push(`${pf.id} 頂面離地 ${h.toFixed(2)}m 不在 ${World.STAND_MIN_H}–${World.STAND_MAX_H} 之間`);
    }
    if (h < Screens.PLATFORM_HEIGHT_MIN - 0.2 || h > Screens.PLATFORM_HEIGHT_MAX + 0.2) {
      problems.push(`${pf.id} 頂面離地 ${h.toFixed(2)}m 離設計高度 ${pf.height}m 太遠（地形沒吃平）`);
    }
  }

  // 逐塊貼地（獨立於穿模稽核 —— 浮起來的塊會被 FLOAT_MIN 豁免，稽核看不到）
  const bb = new THREE.Box3();
  const m4 = new THREE.Matrix4();
  const hug = [];
  layer.group.updateMatrixWorld(true);
  for (const node of nodes) {
    node.traverse((o) => {
      // `hugsGround` ＝「這一塊宣告自己站在地上」（`screens.js` 標的）。
      // 頂階與只剩光的那一段不標 —— 它們本來就疊在別人頭上／懸在半空。
      if (!o.isMesh || !o.geometry || !o.userData.hugsGround) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const each = (mtx) => {
        bb.copy(o.geometry.boundingBox).applyMatrix4(mtx);
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const bottom = bb.min.y - World.terrainHeight(cx, cz);
        hug.push(Number(bottom.toFixed(2)));
        if (bottom > GROUND_HUG_MAX) problems.push(`有一塊浮在空中（底面 +${bottom.toFixed(2)}m）`);
        if (bottom < -GROUND_BURY_MAX) problems.push(`有一塊埋進土裡（底面 ${bottom.toFixed(2)}m）`);
      };
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i += 1) {
          o.getMatrixAt(i, m4);
          m4.premultiply(o.matrixWorld);
          each(m4);
        }
      } else each(m4.copy(o.matrixWorld));
    });
  }

  // 母題離「走出來的那條路」：7–26 公尺（看得到、走得過去、不擋路）
  {
    const Props = await import('../src/world/props.js');
    const segs = Props.buildPathNetwork(
      World.REGION_SITES,
      [...World.CORRIDORS, ...World.ANNEX_LINKS],
      (base || (await worldOptions())).challenges,
      bends
    );
    // 母題與高台共用同一段「離走出來的那條路 7–26 公尺」（看得到、走得過去、不擋路）
    for (const mo of [...motifs, ...platforms]) {
      if (!focusIds.includes(mo.id)) continue;
      const d = pathDistance(segs, mo.at[0], mo.at[1]);
      if (d < MOTIF_PATH_MIN || d > MOTIF_PATH_MAX) problems.push(`${mo.id} 離路網 ${d.toFixed(1)}m（要 ${MOTIF_PATH_MIN}–${MOTIF_PATH_MAX}）`);
    }
  }

  // 擋得住人 ＋ 四周走得到（這一段就是離線算不出來的那一段）
  let free = 0;
  let dirs = 0;
  for (const id of focusIds) {
    const item = [...motifs, ...bands, ...platforms].find((x) => x.id === id);
    if (!item) continue;
    if (!world.solidAt(item.at[0], item.at[1])) problems.push(`${id} 擋不住人（走得進石頭裡）`);
    const rr = item.length ? item.length / 2 + 4 : 5;
    const n = item.length ? 24 : 16;
    const need = item.length ? 16 : 14;
    let f = 0;
    for (let a = 0; a < n; a += 1) {
      const ang = (a / n) * Math.PI * 2;
      if (!world.solidAt(item.at[0] + Math.cos(ang) * rr, item.at[1] + Math.sin(ang) * rr)) f += 1;
    }
    free += f;
    dirs += n;
    if (f < need) problems.push(`${id} 四周繞不過去（${f}/${n}，要 ${need}）`);
  }

  let sight = null;
  if (wantSight) {
    const { sightlineAudit, HIDDEN_MIN, REVEAL_MAX } = await import('./sightline-audit.mjs');
    const audit = await sightlineAudit({ bands, bends });
    const r = audit.regions[regionId];
    sight = r ? { hiddenFor: r.hiddenFor, revealAt: r.revealAt, pass: r.pass, entry: r.entry } : null;
    if (!r || r.pass !== true) {
      problems.push(`視線沒過（前 ${r ? r.hiddenFor : '?'}m 看不到、第 ${r ? r.revealAt : '?'}m 揭露；要 ≥${HIDDEN_MIN} / ≤${REVEAL_MAX}）`);
    }
    // 折點本身要站得住、不能撞進任何一道帶、也不能被石頭堵住
    for (const p of bends[regionId] || []) {
      if (World.coverage(p[0], p[1]) <= 0.9) problems.push(`折點 ${p} 站不住`);
      if (world.solidAt(p[0], p[1])) problems.push(`折點 ${p} 被石頭堵住`);
    }
  }

  return { ok: problems.length === 0, problems, solids, free, dirs, hug, sight };
}

/**
 * 「路要繞過石脊」的折點：從橋頭出發，繞過擋在視線上那一道的**某一端**，再回到地標的方向。
 * 只產生一條建議 —— 過不過由 `verifyInWorld()` 說了算。
 * @param {number[]} entry 橋頭
 * @param {number[]} target 地標
 * @param {object} band 擋在視線上的那一道
 * @param {number} side +1 / -1：繞哪一端
 * @param {object} Screens
 */
export function autoBends(entry, target, band, side, Screens) {
  const f = Screens.bandFootprint(band);
  const clear = 2.6; // 玩家半徑 0.62 ＋ 走得順的餘裕
  // 面向橋頭的是石脊的哪一面
  const sign = (entry[0] - f.cx) * f.vx + (entry[1] - f.cz) * f.vz >= 0 ? 1 : -1;
  const outX = f.vx * sign;
  const outZ = f.vz * sign;
  const off = f.halfDepth + clear;
  const endU = side * (f.halfLen + clear);
  /*
   * 走出來的路是「被石脊逼著轉彎」的形狀，不是一條斜著切過去的捷徑：
   *   ① 先走到石脊**正面**前（塔還在它背後）
   *   ② 貼著那一面滑到端點（這一段還是看不到塔 —— 揭露才會晚到 12 公尺以後）
   *   ③ 繞過端點到背面，塔在這裡揭露
   * P11 手排的那一條就是這個形狀；斜著切過去的話，第 3 公尺就看得到塔了。
   */
  const p1 = [f.cx + outX * off, f.cz + outZ * off];
  const p2 = [p1[0] + f.ux * endU, p1[1] + f.uz * endU];
  const p3 = [p2[0] - outX * off * 2, p2[1] - outZ * off * 2];
  const p4 = [p3[0] + (target[0] - p3[0]) * 0.3, p3[1] + (target[1] - p3[1]) * 0.3];
  return [entry, p1, p2, p3, p4].map((p) => [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))]);
}

async function main() {
  const World = await import('../src/world/world.js');
  const Props = await import('../src/world/props.js');
  const Screens = await import('../src/world/screens.js');
  const base = await worldOptions();
  const targets = await loadTargets();
  const landmarks = Props.LANDMARKS;

  if (flag('verify')) {
    /*
     * 自我驗證：**現行出貨的那一份資料**每一座、每一道都要回「可行」。
     * 這一段同時是這支腳本的迴歸測試 —— 篩子改壞了，reasoning 會先紅。
     */
    const only = flag('region', null);
    const ALL = [...Screens.SCREEN_BANDS, ...Screens.MOTIFS, ...Screens.PLATFORMS];
    const regions = [...new Set(ALL.map((x) => x.region))].filter((r) => !only || r === only);
    let bad = 0;
    for (const regionId of regions) {
      const focusIds = ALL.filter((x) => x.region === regionId).map((x) => x.id);
      const res = await verifyInWorld({
        regionId,
        bands: Screens.SCREEN_BANDS,
        motifs: Screens.MOTIFS,
        platforms: Screens.PLATFORMS,
        bends: Screens.PATH_BENDS,
        focusIds,
        landmarks,
        base,
        wantSight: Screens.SCREEN_BANDS.some((b) => b.region === regionId),
      });
      const tag = res.ok ? '✓' : '✗';
      console.log(
        `${tag} ${regionId.padEnd(14)} ${focusIds.length} 件 · 碰撞體 ${res.solids} · 四周 ${res.free}/${res.dirs} · ` +
          `貼地 ${Math.min(...res.hug).toFixed(2)}…${Math.max(...res.hug).toFixed(2)}m` +
          (res.sight ? ` · 前 ${res.sight.hiddenFor}m 看不到、第 ${res.sight.revealAt}m 揭露` : '')
      );
      for (const p of res.problems) console.log(`    · ${p}`);
      if (!res.ok) bad += 1;
    }
    if (bad) process.exit(1);
    return;
  }

  const regionId = flag('region', null);
  const kind = flag('kind', 'motif');
  if (!regionId) {
    console.error('要指定 --region（或用 --verify）');
    process.exit(2);
  }
  const site = World.REGION_SITES.find((s) => s.id === regionId);
  if (!site) {
    console.error(`沒有這一片土地：${regionId}`);
    process.exit(2);
  }
  const grid = num('grid', 2);
  const top = num('top', 12);
  const height = num('height', kind === 'band' ? 12 : kind === 'platform' ? 1.6 : 5);
  const radius = num('radius', 2.6);
  const shape = flag('shape', kind === 'band' ? 'stairRidge' : kind === 'platform' ? 'stepStone' : 'twiceShown');
  const length = num('length', 8);
  const depth = num('depth', 2.4);
  const rots = num('rot', 12);

  const pathSegs = Props.buildPathNetwork(World.REGION_SITES, [...World.CORRIDORS, ...World.ANNEX_LINKS], base.challenges);
  const existingMotifs = Screens.MOTIFS.filter((m) => m.region === regionId);
  const existingBands = Screens.SCREEN_BANDS.filter((b) => b.region === regionId);
  const landmark = landmarks.find((l) => l.region === regionId) || null;

  // --- ① 離線篩 ---------------------------------------------------
  const estR = kind === 'band' ? depth / 2 : kind === 'platform' ? radius : Math.max(1.0, (height / 3.4) * 0.78);
  const existingPlatforms = Screens.PLATFORMS.filter((p) => p.region === regionId);
  const pathMin = num('pathMin', MOTIF_PATH_MIN);
  const pathMax = num('pathMax', MOTIF_PATH_MAX);
  /*
   * 被哪一條規則擋掉的統計 —— 一片土地擠到只剩兩個格點時，這一欄才說得出「擠在哪裡」
   * （orchestration 有 13 座石座，光是石座的淨空就吃掉整片內圈）。
   */
  const why = { 區域: 0, 覆蓋: 0, 主動線: 0, 閘門: 0, 地標留白: 0, 互動圈: 0, 離路網: 0, 太靠近同伴: 0 };
  const cands = [];
  for (let x = site.x - site.radius; x <= site.x + site.radius; x += grid) {
    for (let z = site.z - site.radius; z <= site.z + site.radius; z += grid) {
      const here = World.regionAt(x, z);
      if (!here || here.id !== regionId || here.onBridge) {
        why['區域'] += 1;
        continue;
      }
      if (World.coverage(x, z) <= MOTIF_COVERAGE_MIN) {
        why['覆蓋'] += 1;
        continue;
      }
      if (laneDistance(World, x, z) < World.LANE_HALF + Rules.LANE_MARGIN + estR) {
        why['主動線'] += 1;
        continue;
      }
      if (gateDistance(World, x, z) < Rules.GATE_MIN + estR) {
        why['閘門'] += 1;
        continue;
      }
      if (landmarks.some((l) => Math.hypot(x - l.at[0], z - l.at[1]) < l.clear + estR)) {
        why['地標留白'] += 1;
        continue;
      }
      /*
       * 母題用中心點粗篩（餘裕 0.3，真正的門檻仍由重建那一段用真的碰撞圓算）；
       * **遮擋帶不在這裡篩** —— 它是一條長條，中心合不合法說明不了兩端
       * （下面用 `bandSolidCircles()` 逐圓篩，那才是真的門檻）。
       */
      if (kind === 'motif' || kind === 'platform') {
        const near = targets.some(
          (t) => Math.hypot(x - t.at[0], z - t.at[1]) < Rules.LAYER_INTERACT_R[t.k] + World.PLAYER_RADIUS + estR + 0.3
        );
        if (near) {
          why['互動圈'] += 1;
          continue;
        }
      }
      const dPath = pathDistance(pathSegs, x, z);
      if (kind === 'motif' || kind === 'platform') {
        if (dPath < pathMin || dPath > pathMax) {
          why['離路網'] += 1;
          continue;
        }
        const mates = kind === 'platform' ? [...existingPlatforms, ...existingMotifs] : existingMotifs;
        if (mates.some((m) => Math.hypot(x - m.at[0], z - m.at[1]) < MOTIF_GAP)) {
          why['太靠近同伴'] += 1;
          continue;
        }
      } else if (existingBands.some((b) => Math.hypot(x - b.at[0], z - b.at[1]) < BAND_GAP)) {
        why['太靠近同伴'] += 1;
        continue;
      }
      cands.push({ x, z, dPath });
    }
  }
  console.log(`擋掉的原因：${Object.entries(why).map(([k, v]) => `${k} ${v}`).join('、')}`);

  const scored = [];
  if (kind === 'platform') {
    /*
     * 高台是圓的（沒有正面），所以不用試角度；要挑的是**腳下最平的那一塊地**——
     * 圓周上八個點與圓心的高差越小，石鼓的底裙才不會一邊浮起來、一邊埋進土裡。
     */
    for (const c of cands) {
      let drop = 0;
      let cover = 1;
      const h0 = World.terrainHeight(c.x, c.z);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const px = c.x + Math.cos(a) * radius;
        const pz = c.z + Math.sin(a) * radius;
        drop = Math.max(drop, Math.abs(World.terrainHeight(px, pz) - h0));
        cover = Math.min(cover, World.coverage(px, pz));
      }
      if (cover < MOTIF_COVERAGE_MIN) continue;
      if (drop > MOTIF_STEP_DROP_MAX) continue;
      // 想要它剛好在路邊看得到（離路網 12 公尺左右），而且腳下越平越好
      const score = -Math.abs(c.dPath - 12) * 0.6 - drop * 8;
      scored.push({ ...c, rot: 0, drop, score });
    }
  } else if (kind === 'motif') {
    for (const c of cands) {
      let bestRot = null;
      let bestDrop = Infinity;
      for (let i = 0; i < rots; i += 1) {
        const rot = (i / rots) * Math.PI * 2;
        const pts = Screens.motifGroundPoints({ at: [c.x, c.z], rot, kind: shape, height });
        if (pts.some((p) => World.coverage(p[0], p[1]) < MOTIF_COVERAGE_MIN)) continue;
        const hs = pts.map((p) => World.terrainHeight(p[0], p[1]));
        const drop = Math.max(...hs) - Math.min(...hs);
        if (drop > MOTIF_STEP_DROP_MAX) continue;
        if (drop < bestDrop) {
          bestDrop = drop;
          bestRot = Number(rot.toFixed(2));
        }
      }
      if (bestRot === null) continue;
      const spread = existingMotifs.length
        ? Math.min(...existingMotifs.map((m) => Math.hypot(c.x - m.at[0], c.z - m.at[1])))
        : 40;
      const score = -Math.abs(c.dPath - 15) * 0.6 - bestDrop * 4 + Math.min(spread, 40) * 0.12;
      scored.push({ ...c, rot: bestRot, drop: bestDrop, spread, score });
    }
  } else {
    if (!landmark) {
      console.error(`${regionId} 沒有地標，遮擋帶無從量起`);
      process.exit(2);
    }
    const corridor = World.CORRIDORS.find((c) => c.region === regionId) || World.ANNEX_LINKS.find((a) => a.region === regionId);
    const { BRIDGE_HEAD_INSET } = await import('./sightline-audit.mjs');
    const along = World.CORRIDORS.includes(corridor)
      ? corridor.length - site.radius + BRIDGE_HEAD_INSET
      : corridor.gateAt + BRIDGE_HEAD_INSET;
    const entry = [corridor.from.x + corridor.dir.x * along, corridor.from.z + corridor.dir.z * along];
    /*
     * 遮擋帶的離線篩看的是**它登記出來的每一個碰撞圓**（`bandSolidCircles()`），
     * 不是中心點 —— 「中心離石座夠遠、兩端卻踩進去」的候選以前要等重建才被打回票。
     */
    for (const c of cands) {
      for (let i = 0; i < rots; i += 1) {
        const rot = (i / rots) * Math.PI;
        const band = { id: '__fit', region: regionId, at: [c.x, c.z], rot, kind: shape, length, depth, height, faceSign: 1 };
        // 這一道要真的擋在「橋頭 → 地標」那條直線上（橋頭那一刻看不到，是硬門檻的第一條）
        const hit = Screens.segmentCrossesBand(band, entry[0], entry[1], landmark.at[0], landmark.at[1]);
        // `--noSight`：找**第二道**（給入口厚度、不負責擋視線）時不要求它擋在那條直線上
        if (!hit && !flag('noSight')) continue;
        const dEntry = Math.hypot(c.x - entry[0], c.z - entry[1]);
        if (dEntry < num('entryMin', 8) || dEntry > num('entryMax', 24)) continue;
        // 石脊自己每一塊腳下都要站得住
        const f = Screens.bandFootprint(band);
        let ok = true;
        for (let t = -1; t <= 1; t += 0.25) {
          const px = f.cx + f.ux * f.halfLen * t;
          const pz = f.cz + f.uz * f.halfLen * t;
          if (World.coverage(px, pz) <= 0.9) ok = false;
        }
        if (!ok) continue;
        for (const sd of Screens.bandSolidCircles(band)) {
          if (solidProblems(World, sd, regionId, targets, landmarks).length) ok = false;
        }
        if (!ok) continue;
        const score = -Math.abs(dEntry - num('entryWant', 15));
        scored.push({ ...c, rot: Number(rot.toFixed(4)), dEntry, entry, score, band });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  console.log(`離線篩：${cands.length} 個格點 → ${scored.length} 個候選；重建驗前 ${Math.min(top, scored.length)} 個\n`);

  // --- ② 重建驗 ---------------------------------------------------
  const good = [];
  const seen = [];
  for (const c of scored) {
    if (good.length >= top) break;
    /*
     * 同一批候選之間也要散得開，不然前 N 名全擠在同一塊空地。
     * 母題用真的門檻（≥16 公尺，反正兩座真的要那麼開）；
     * 遮擋帶用**探索用**的小間距（`--spread`，預設 3 公尺）——
     * 一道帶只會擺一、兩道，我們要的是「同一段路上的幾種擺法」而不是「散在全區」。
     */
    const spreadMin = kind === 'motif' || kind === 'platform' ? MOTIF_GAP : num('spread', 3);
    if (seen.some((p) => Math.hypot(p[0] - c.x, p[1] - c.z) < spreadMin)) continue;
    seen.push([c.x, c.z]);
    const id = `${regionId}-fit-${seen.length}`;
    let res;
    if (kind === 'platform') {
      const cand = {
        id,
        region: regionId,
        at: [Number(c.x.toFixed(2)), Number(c.z.toFixed(2))],
        rot: 0,
        kind: shape,
        height,
        radius,
      };
      cand.__dPath = Number(c.dPath.toFixed(1));
      res = await verifyInWorld({
        regionId,
        bands: Screens.SCREEN_BANDS,
        motifs: Screens.MOTIFS,
        platforms: [...Screens.PLATFORMS.filter((p) => p.region !== regionId), cand],
        bends: Screens.PATH_BENDS,
        focusIds: [id],
        landmarks,
        base,
        wantSight: false,
      });
      res.cand = cand;
    } else if (kind === 'motif') {
      const cand = { id, region: regionId, at: [Number(c.x.toFixed(2)), Number(c.z.toFixed(2))], rot: c.rot, kind: shape, height };
      cand.__dPath = Number(c.dPath.toFixed(1));
      res = await verifyInWorld({
        regionId,
        bands: Screens.SCREEN_BANDS,
        motifs: [...Screens.MOTIFS, cand],
        platforms: Screens.PLATFORMS,
        bends: Screens.PATH_BENDS,
        focusIds: [id],
        landmarks,
        base,
        wantSight: false,
      });
      res.cand = cand;
    } else {
      const cand = { ...c.band, id, at: [Number(c.x.toFixed(2)), Number(c.z.toFixed(2))] };
      let best = null;
      for (const side of [1, -1]) {
        const bends = { ...Screens.PATH_BENDS, [regionId]: autoBends(c.entry, landmark.at, cand, side, Screens) };
        const r = await verifyInWorld({
          regionId,
          bands: [...Screens.SCREEN_BANDS.filter((b) => b.region !== regionId || existingBands.includes(b)), cand],
          motifs: Screens.MOTIFS,
          platforms: Screens.PLATFORMS,
          bends,
          focusIds: [id],
          landmarks,
          base,
          wantSight: !flag('noSight'),
        });
        r.bends = bends[regionId];
        if (!best || r.problems.length < best.problems.length) best = r;
        if (r.ok) break;
      }
      res = best;
      res.cand = cand;
    }
    const tag = res.ok ? '✓' : '·';
    console.log(
      `${tag} ${JSON.stringify(res.cand)}\n    碰撞體 ${res.solids} · 四周 ${res.free}/${res.dirs}` +
        (res.cand.__dPath !== undefined ? ` · 離路網 ${res.cand.__dPath}m` : '') +
        (res.sight ? ` · 前 ${res.sight.hiddenFor}m 看不到、第 ${res.sight.revealAt}m 揭露` : '') +
        (res.bends ? `\n    折點 ${JSON.stringify(res.bends)}` : '')
    );
    for (const p of res.problems.slice(0, 4)) console.log(`      · ${p}`);
    if (res.ok) good.push(res);
  }

  console.log(`\n可行的候選：${good.length}／${seen.length}`);
  if (flag('json')) console.log(JSON.stringify(good.map((g) => ({ cand: g.cand, bends: g.bends })), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

export default { autoBends };

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

/**
 * 離散彈道**最差的那一種幀時間**能升到多高（公尺）——「跳得上去」的那一條線就是它。
 * 與 `test:rubric` 問的是同一支（`jump.js` 的 `simulateApex()`），不會各說各話。
 */
const JumpMod = await import('../src/player/jump.js');
const JUMP_APEX = Math.min(
  ...[1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.2].map((dt) => JumpMod.simulateApex(JumpMod.JUMP_SPEED, dt))
);

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
    // 每一個各自帶自己的觸發半徑（風鈴 3.2、螢蛾 3.0…）——見 `screen-rules.mjs` 的 `targetRadius`
    reactiveSpots: Reactive.reactiveTargets(),
    murks: readJson('src/data/murks.json').entries,
    watchmen: readJson('src/data/watchmen.json').entries,
    // v1.2 · P20a：回聲重演（坐在小景旁邊的一團光）也是一層互動點
    echoes: readJson('src/data/echoes.json').entries,
    // v1.2 · P20b：檔案廊 —— 少了這一列，中觀層會照一個沒有展館的世界去搜座標
    archives: readJson('src/data/archive.json').halls,
    tablets: Props.LORE_TABLETS,
    secrets: readJson('src/data/secrets.json').entries,
  });
}

/**
 * 一個候選（母題或遮擋帶）在**真的蓋出來的世界**裡過不過。
 *
 * **匯出是刻意的**（v1.2 · P16b）：折點（`PATH_BENDS`）沒有搜尋器 —— `autoBends()` 只產生
 * 一條建議，被石頭堵住時要靠一支臨時腳本繞著它試。那支腳本必須問**同一支**判定，
 * 不然又會出現「工具說可行、測試說不行」。
 * @returns {Promise<{ok:boolean, problems:string[], solids:number, free:number, hug:number[], sight:object|null}>}
 */
export async function verifyInWorld({ regionId, bands, motifs, platforms = [], bends, focusIds, landmarks, base, wantSight }) {
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
    /*
     * v1.2 · P15：**從四周每一個站得住的方向都要跳得上去。**
     * `height` 量的是「離自己腳下的地多高」，可是人是站在旁邊起跳的 ——
     * 地形一斜，同一座高台從低的那一側可能要爬 2.6 公尺（跳不上去），
     * 而 `standable`／`height`／穿模稽核全部照樣綠。
     */
    const rise = Screens.platformRise(sd, World.terrainHeight, (x, z) => world.isWalkable(x, z));
    const need = JUMP_APEX - Screens.PLATFORM_JUMP_MARGIN;
    if (!(rise.samples >= 6)) problems.push(`${pf.id} 四周站得住的起跳點太少（${rise.samples}）`);
    if (rise.worst > need) {
      problems.push(
        `${pf.id} 有方向跳不上去：最難的那一側要爬 ${rise.worst.toFixed(2)}m（頂點 ${JUMP_APEX.toFixed(2)} − 餘裕 ${Screens.PLATFORM_JUMP_MARGIN} ＝ ${need.toFixed(2)}）@${JSON.stringify(rise.at)}`
      );
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
      /*
       * v1.2 · P16a：也要離**遮擋帶**夠遠。這一條放在重建這一段是有意的 ——
       * `--verify` 會因此把**現行出貨的每一座**再驗一次（先紅的來源）。
       */
      const own = mo.radius || Math.max(1.0, (mo.height / 3.4) * 0.78);
      for (const b of bands) {
        if (b.region !== mo.region) continue;
        const d2 = Screens.bandCoreDistance(b, mo.at[0], mo.at[1]);
        if (d2 < Rules.BAND_CLEAR + own) {
          problems.push(`${mo.id} 貼著石脊 ${b.id}（離核心矩形 ${d2.toFixed(2)} < ${(Rules.BAND_CLEAR + own).toFixed(2)}）`);
        }
      }
    }
  }

  // 擋得住人 ＋ 四周走得到（這一段就是離線算不出來的那一段）
  let free = 0;
  let dirs = 0;
  for (const id of focusIds) {
    const item = [...motifs, ...bands, ...platforms].find((x) => x.id === id);
    if (!item) continue;
    if (!world.solidAt(item.at[0], item.at[1])) problems.push(`${id} 擋不住人（走得進石頭裡）`);
    const rr = item.length ? item.length / 2 + 4 : Rules.AROUND_RING;
    const n = item.length ? 24 : Rules.AROUND_DIRS;
    const need = item.length ? 16 : Rules.AROUND_FREE_MIN;
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
    sight = r ? { hiddenFor: r.hiddenFor, revealAt: r.revealAt, pass: r.pass, exempt: r.exempt, entry: r.entry } : null;
    // 登記過例外的土地不被問「地標擋不擋得住」（`screens.js` 的 `SIGHT_EXEMPT`）——
    // 其餘每一條擺位規則照吃，一條都沒有放鬆。
    if (!r || (r.pass !== true && !r.exempt)) {
      problems.push(`視線沒過（前 ${r ? r.hiddenFor : '?'}m 看不到、第 ${r ? r.revealAt : '?'}m 揭露；要 ≥${HIDDEN_MIN} / ≤${REVEAL_MAX}）`);
    }
    /*
     * 折線要站得住、也不能被石頭堵住 —— **量的是整條線，不是那幾個折點**。
     *
     * v1.2 · P16b：以前只量折點。兩個折點各自乾淨、中間那一段卻穿過一顆石頭
     * 是完全可能的（觀象臺那一條實測就是：折點都過，第 112.5–114.5 公尺那一段被堵）。
     * `test:rubric` 一直是逐 0.5 公尺掃整條折線的 —— 於是又出現一次
     * 「工具說可行、測試說不行」（P15 的 `AROUND_*` 是同一個病）。現在兩邊同一種量法。
     */
    const linkHere = World.CORRIDORS.find((c) => c.region === regionId) || World.ANNEX_LINKS.find((a) => a.region === regionId);
    // 只量**登記過折點**的區（與 `test:rubric` 同一個範圍）：沒有折點的區走的是自古以來那條直線，
    // 那條線上原本就有的東西不是這一層的事。
    const poly = bends[regionId] && linkHere ? Screens.corridorPolyline(linkHere, bends) : [];
    const lmHere = landmarks.find((l) => l.region === regionId) || null;
    /*
     * 起點要裁在**這一條走道自己的起點**（`linkHere.from`）那一片土地的邊緣，
     * 不是「離世界原點多遠」——附屬區的折線是從**母土地的中心**出發的，
     * 拿高原的半徑去裁的話，母土地不是中央高原的那幾片（護欄崗→沉書檔案庫、
     * 校驗場→演武場）會把整片母土地的道具都掃成「路被堵住」（P16b 審查 · 第 6 條）。
     */
    const fromSite = linkHere ? World.REGION_SITES.find((r) => r.x === linkHere.from.x && r.z === linkHere.from.z) : null;
    const fromR = fromSite ? fromSite.radius : World.REGION_SITES[0].radius;
    let blockedOnce = false;
    for (let i = 0; i + 1 < poly.length; i += 1) {
      const [ax, az] = poly[i];
      const [bx2, bz2] = poly[i + 1];
      const len = Math.hypot(bx2 - ax, bz2 - az);
      if (len < 1e-6) continue; // 兩個重疊的折點：不是一段，別拿它當除數（會算出 NaN）
      for (let t = 0; t <= len; t += 0.5) {
        const px = ax + ((bx2 - ax) * t) / len;
        const pz = az + ((bz2 - az) * t) / len;
        if (lmHere && Math.hypot(px - lmHere.at[0], pz - lmHere.at[1]) < 12) continue;
        if (Math.hypot(px - linkHere.from.x, pz - linkHere.from.z) < fromR) continue; // 出發的那一片土地不是這次的事
        if (world.solidAt(px, pz) && !blockedOnce) {
          blockedOnce = true; // 一段路堵住只講一次（不然會刷出幾百行一樣的話）
          problems.push(`走出來的路被石頭堵住 @(${px.toFixed(1)}, ${pz.toFixed(1)})`);
        }
      }
    }
    for (const p of bends[regionId] || []) {
      if (World.coverage(p[0], p[1]) <= 0.9) problems.push(`折點 ${p} 站不住`);
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
          (res.sight
            ? res.sight.exempt
              ? ' · 視線登記例外'
              : ` · 前 ${res.sight.hiddenFor}m 看不到、第 ${res.sight.revealAt}m 揭露`
            : '')
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
  const why = { 區域: 0, 覆蓋: 0, 主動線: 0, 閘門: 0, 地標留白: 0, 互動圈: 0, 離路網: 0, 太靠近同伴: 0, 貼著石脊: 0 };
  /*
   * v1.2 · P16b：**離線篩不准比真的門檻還嚴。**
   *
   * 「離閘門」「地標留白」「離主動線」三條，`solidProblems()`（真的門檻）量的是
   * **碰撞圓的圓心**：`gate < 8`、`d < lm.clear`、`lane < LANE_HALF + 4 − r`。
   * 離線篩卻一律把 `estR` 加上去 —— 對母題與遮擋帶那是刻意的保守（圓心與圓的落點不同），
   * 但**高台只有一顆圓、圓心就在 `at`**，加 `estR` 等於憑空嚴了 1.4 公尺，
   * 主動線那一條更是嚴了 2.8（規則是減半徑，篩子是加半徑）。
   * 後果：P16a 對護欄崗量到「連一個格點都活不到」，寫進了 §4.12 的表 ——
   * 那個 0 其實是**篩子的 0**，不是土地的 0（P16a 自己記過「量到 0 與用粗格點量到 0
   * 是兩件事」，這是同一條教訓的第三種形態：**用錯門檻量到的 0**）。
   * 現在高台走精確門檻，母題／遮擋帶維持保守（它們的圓真的散在 `at` 之外）。
   */
  const exact = kind === 'platform';
  const laneNeed = exact ? World.LANE_HALF + Rules.LANE_MARGIN - radius : World.LANE_HALF + Rules.LANE_MARGIN + estR;
  const gateNeed = exact ? Rules.GATE_MIN : Rules.GATE_MIN + estR;
  const lmPad = exact ? 0 : estR;
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
      if (laneDistance(World, x, z) < laneNeed) {
        why['主動線'] += 1;
        continue;
      }
      if (gateDistance(World, x, z) < gateNeed) {
        why['閘門'] += 1;
        continue;
      }
      if (landmarks.some((l) => Math.hypot(x - l.at[0], z - l.at[1]) < l.clear + lmPad)) {
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
          (t) => Math.hypot(x - t.at[0], z - t.at[1]) < Rules.targetRadius(t) + World.PLAYER_RADIUS + estR + 0.3
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
        /*
         * 高台與**母題**之間守的是另一條（`PLATFORM_MOTIF_GAP` 12）——
         * 兩種不同的東西不會糊成一團，只會擋路。同類之間（台對台、母題對母題）仍然是 16。
         *
         * v1.2 · P16a：**這一條要兩邊都寫。** 原本只有「找高台時避開母題」那半邊，
         * 找母題時完全看不到高台 —— 於是先放高台、再搜母題，就會把母題搜到高台旁邊
         * 12 公尺以內（同一條規矩，兩個答案）。這一格正好是那個順序。
         */
        const tooClose =
          kind === 'platform'
            ? existingPlatforms.some((m) => Math.hypot(x - m.at[0], z - m.at[1]) < MOTIF_GAP) ||
              existingMotifs.some((m) => Math.hypot(x - m.at[0], z - m.at[1]) < Rules.PLATFORM_MOTIF_GAP)
            : existingMotifs.some((m) => Math.hypot(x - m.at[0], z - m.at[1]) < MOTIF_GAP) ||
              existingPlatforms.some((m) => Math.hypot(x - m.at[0], z - m.at[1]) < Rules.PLATFORM_MOTIF_GAP);
        if (tooClose) {
          why['太靠近同伴'] += 1;
          continue;
        }
        /*
         * v1.2 · P16a：離**遮擋帶**也要留得下人走過去（`BAND_CLEAR`）。
         * 中心距不管用 —— 帶是長條，量的是離核心矩形的距離。
         */
        if (existingBands.some((b) => Screens.bandCoreDistance(b, x, z) < Rules.BAND_CLEAR + estR)) {
          why['貼著石脊'] += 1;
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
    /*
     * v1.2 · P15 · `--reveal landmark`：**站上去要看得到別的東西**。
     * 同一個 (x, z)、只有眼睛高了 `height` 公尺，`landmarkSight()` 的答案就要
     * 從「擋住」翻成「看得到」—— 把高台從裝飾變成一句看得懂的地圖語法。
     * 這一段與 `test:rubric` 的硬斷言問的是**同一支**判定。
     */
    const wantReveal = flag('reveal', null) === 'landmark';
    const revealBands = Screens.SCREEN_BANDS.filter((b) => b.region === regionId);
    if (wantReveal && (!landmark || !revealBands.length)) {
      console.error(`${regionId} 沒有地標或沒有遮擋帶，--reveal landmark 無從量起`);
      process.exit(2);
    }
    /*
     * v1.2 · P16a：**「0 個候選」要說得出是被哪一條擋掉的。**
     * 上面那份 `why` 只統計得到與母題共用的那幾條；高台自己的三條（腳下覆蓋、
     * 腳下落差、四周跳不跳得上去）以前一律沉默 —— 於是「這片土地擺不下高台」
     * 這句結論說不出理由，也就無從判斷「換小一點的半徑會不會就擺得下」。
     * `riseWorst` 記的是**被跳躍門檻擋掉的那些點裡最好的那一個**：
     * 它離 `need` 差多少，就是「這片土地離擺得下還差多遠」。
     */
    const whyP = { 腳下覆蓋: 0, 腳下落差: 0, 起跳點太少: 0, 跳不上去: 0 };
    let riseBest = Infinity;
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
      if (cover < MOTIF_COVERAGE_MIN) {
        whyP['腳下覆蓋'] += 1;
        continue;
      }
      if (drop > MOTIF_STEP_DROP_MAX) {
        whyP['腳下落差'] += 1;
        continue;
      }
      /*
       * **四周每一個方向都要跳得上去**（離線用「腳下地形 ＋ 設計高度」近似頂面高度；
       * 真正的門檻仍由重建那一段拿真的 `standTop` 再驗一次）。
       * 這一條是 P15 的 e2e 逼出來的 —— 少了它，搜出來的座標有一半是
       * 「standable 為真、卻有一半方向跳不上去」的高台。
       */
      const riseOff = Screens.platformRise(
        { x: c.x, z: c.z, r: radius, standTop: h0 + height },
        World.terrainHeight,
        (x, z) => World.coverage(x, z) >= 0.45
      );
      if (!(riseOff.samples >= 6)) {
        whyP['起跳點太少'] += 1;
        continue;
      }
      if (riseOff.worst > JUMP_APEX - Screens.PLATFORM_JUMP_MARGIN) {
        whyP['跳不上去'] += 1;
        if (riseOff.worst < riseBest) riseBest = riseOff.worst;
        continue;
      }
      let margin = 0;
      if (wantReveal) {
        const foot = Screens.landmarkSight(c.x, c.z, landmark, World.terrainHeight, revealBands);
        if (!foot.hidden) continue;
        const top = Screens.landmarkSight(
          c.x,
          c.z,
          landmark,
          World.terrainHeight,
          revealBands,
          h0 + height + Screens.EYE_HEIGHT
        );
        if (top.hidden) continue;
        // 餘裕越大越穩（腳下這一刻擋得越死、站上去揭露得越乾脆）
        margin = foot.have - foot.need + (top.need - top.have);
      }
      // 想要它剛好在路邊看得到（離路網 12 公尺左右），而且腳下越平越好
      const score = -Math.abs(c.dPath - 12) * 0.6 - drop * 8 + margin * 6 - riseOff.worst * 3;
      scored.push({ ...c, rot: 0, drop, margin, rise: Number(riseOff.worst.toFixed(2)), score });
    }
    console.log(
      `高台自己那三條擋掉的：${Object.entries(whyP).map(([k, v]) => `${k} ${v}`).join('、')}` +
        (Number.isFinite(riseBest)
          ? `；被跳躍門檻擋掉的那些點裡最好的要爬 ${riseBest.toFixed(2)}m（門檻 ${(JUMP_APEX - Screens.PLATFORM_JUMP_MARGIN).toFixed(2)}）`
          : '')
    );
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
    /*
     * v1.2 · P16b：**遮擋帶也要說得出「被哪一條擋掉幾個」。**
     * 母題與高台那兩支早就有 `why`／`whyP`，只有帶這一支從頭到尾沉默 ——
     * 於是「這片土地 866 個格點 → 0 個候選」這句話講不出理由，
     * 也就無從判斷「換短一點、換薄一點會不會就擺得下」（P16b 要量的正是這件事）。
     * `nearBest` 記的是**被某一條擋掉的那些擺法裡最好的那一個還差多少公尺** ——
     * 那個數字就是「這片土地離擺得下還差多遠」。
     */
    const whyB = { 沒擋在視線上: 0, 離橋頭太近或太遠: 0, 腳下站不住: 0, 碰撞圓踩到別人: 0 };
    let nearBest = Infinity; // 「碰撞圓踩到別人」那一條最小的缺口（公尺）
    let nearWho = '';
    for (const c of cands) {
      for (let i = 0; i < rots; i += 1) {
        const rot = (i / rots) * Math.PI;
        const band = { id: '__fit', region: regionId, at: [c.x, c.z], rot, kind: shape, length, depth, height, faceSign: 1 };
        // 這一道要真的擋在「橋頭 → 地標」那條直線上（橋頭那一刻看不到，是硬門檻的第一條）
        const hit = Screens.segmentCrossesBand(band, entry[0], entry[1], landmark.at[0], landmark.at[1]);
        // `--noSight`：找**第二道**（給入口厚度、不負責擋視線）時不要求它擋在那條直線上
        if (!hit && !flag('noSight')) {
          whyB['沒擋在視線上'] += 1;
          continue;
        }
        const dEntry = Math.hypot(c.x - entry[0], c.z - entry[1]);
        if (dEntry < num('entryMin', 8) || dEntry > num('entryMax', 24)) {
          whyB['離橋頭太近或太遠'] += 1;
          continue;
        }
        // 石脊自己每一塊腳下都要站得住
        const f = Screens.bandFootprint(band);
        let ok = true;
        for (let t = -1; t <= 1; t += 0.25) {
          const px = f.cx + f.ux * f.halfLen * t;
          const pz = f.cz + f.uz * f.halfLen * t;
          if (World.coverage(px, pz) <= 0.9) ok = false;
        }
        if (!ok) {
          whyB['腳下站不住'] += 1;
          continue;
        }
        /*
         * 「還差多少」量的是**這一種擺法最差的那一條**（不是所有擺法所有違規裡最小的那一個 ——
         * 那個數字永遠是 0，因為擺法是連續的，邊界上一定有人差 0.001）。
         * 一種擺法要能出貨，它每一條都得過 → 它的缺口就是最差那一條；
         * 全部擺法裡最小的那個缺口，才是「這片土地離擺得下還差多遠」。
         */
        let worstGap = -Infinity;
        let worstWho = '';
        for (const sd of Screens.bandSolidCircles(band)) {
          const probs = solidProblems(World, sd, regionId, targets, landmarks);
          if (!probs.length) continue;
          ok = false;
          // 只有「離某個東西太近」那幾條說得出距離，其餘（掉出區、虛空）沒有公尺數 → 記成無限大
          for (const p of probs) {
            const m = /（(-?[\d.]+) < ([\d.]+)）/.exec(p);
            const gap = m ? Number(m[2]) - Number(m[1]) : Infinity;
            if (gap > worstGap) {
              worstGap = gap;
              worstWho = p;
            }
          }
        }
        if (!ok) {
          if (worstWho && worstGap < nearBest) {
            nearBest = worstGap;
            nearWho = worstWho;
          }
          whyB['碰撞圓踩到別人'] += 1;
          continue;
        }
        const score = -Math.abs(dEntry - num('entryWant', 15));
        scored.push({ ...c, rot: Number(rot.toFixed(4)), dEntry, entry, score, band });
      }
    }
    console.log(
      `遮擋帶自己那幾條擋掉的：${Object.entries(whyB).map(([k, v]) => `${k} ${v}`).join('、')}` +
        (Number.isFinite(nearBest) ? `；被淨空擋掉的那些擺法裡最好的還差 ${nearBest.toFixed(2)}m（${nearWho}）` : '')
    );
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
    // `--spread` 讓探索時看得到「同一塊空地上的幾種擺法」（出貨的門檻仍由重建那一段守）
    const spreadMin = kind === 'motif' || kind === 'platform' ? num('spread', MOTIF_GAP) : num('spread', 3);
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

export default { autoBends, verifyInWorld };

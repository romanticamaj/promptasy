/**
 * Promptasy — 檔案廊（Archive gallery，v1.2 · P20b）
 *
 * 每片土地一座小展館：四根細桿撐起一片頂棚，棚下吊著一排**展品**
 * （這片土地的每一條技法各一片；收集到的那幾片亮起來），
 * 棚的兩側各立著一座**檔案龕**，上面躺著一則小知識。
 *
 * 它在教學上補的是第四層：術語小卡講「**是什麼**」、130 條技能講「**怎麼做**」、
 * 守夜人**引用**既有的那一句，而這一層講「**為什麼**」——背後的機制。
 * 24 則的文字與出處住在 `src/data/archive.json`（`authored: "game"`，
 * 出處只准用 repo 裡已經驗證過的那 365 個網址）。
 *
 * 五條硬規則（都在 `test:rubric` 裡逐條量）：
 *   1. **不搶 `E`、不彈窗**（WORLD §3.1／§3.3）。走近就浮出來，走開就淡掉；
 *      比它高階的任何一層一旦在範圍內，這一層**自己讓開**（`clearNear()`）。
 *   2. **零光源**（護欄：光源固定 37 盞）。石材吃該區那一盞主色補光，
 *      展品與龕上那一片字是自發光／加色混合的薄片，照不亮任何東西。
 *   3. **零碰撞體**。細桿（0.18 見方）與吊在頭上的展品都不擋人——同 §4.16 那道門的柱子；
 *      檔案龕只有 0.72 公尺高（碰撞稽核的「跨得過去」是 0.9）。整層一顆碰撞圓都沒有，
 *      **可站立體也是 0**。
 *   4. **零每幀配置**：tick 裡不 new、不 map/filter、不建閉包。
 *      45 公尺外**整組連畫都不畫**（P20a 的教訓：加色混合的透明片「畫」比「算」貴）。
 *   5. **`prefers-reduced-motion` 只留終態**：展品不飄，亮度照樣跟著「走近」變化
 *      （關掉的是動，不是回應）。
 *
 * 場景圖命名 `archive:<id>`；子件：
 *   · `frame` 四根細桿 ＋ 兩道橫樑 ＋ 地面那一圈
 *   · `exhibits` 吊著的展品（每條技法一片）
 *   · `niche:0` / `niche:1` 兩座檔案龕（各對應一則小知識）
 */
import * as THREE from 'three';

/**
 * 「走近浮出」的那一圈（公尺）。
 *
 * **3.2 —— 與回聲、守門者同一階**，而且理由與回聲那一條同源：
 * 它連 `E` 都不搶，所以圈不該比誰都大。`scripts/lib/screen-rules.mjs` 的
 * `ARCHIVE_R` 重寫一份給不 import three.js 的擺位規則用，`test:rubric` 逐值比對。
 */
export const ARCHIVE_RADIUS = 3.2;
/** 頂棚的半徑（四根細桿的座標；`screen-rules.mjs` 的 `ARCHIVE_BODY_R` 逐值比對）。 */
export const ARCHIVE_SPAN = 1.9;
/** 兩座檔案龕擺在局部 ±X 的這個距離上（公尺）。 */
export const ARCHIVE_NICHE_X = 1.55;
/** 一座展館最多吊幾片展品（技法最多的那片土地是 15 條）。 */
export const ARCHIVE_EXHIBIT_MAX = 16;

/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
const NEAR_R_SQ = ARCHIVE_RADIUS * ARCHIVE_RADIUS;

/* ------------------------------------------------------------------ *
 * 幾何體快取（材質逐座各自一份 —— 亮度是每一座自己的狀態）
 * ------------------------------------------------------------------ */
const GEO = new Map();
const g = (k, make) => {
  let v = GEO.get(k);
  if (!v) {
    v = make();
    GEO.set(k, v);
  }
  return v;
};

/** 釋放快取（重建世界時呼叫；材質逐座掛在自己的 group 上，隨場景一起釋放）。 */
export function disposeArchiveCache() {
  for (const v of GEO.values()) v.dispose();
  GEO.clear();
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const ring = (ri, ro, s) => g(`ring:${ri},${ro},${s}`, () => new THREE.RingGeometry(ri, ro, s));
const plane = (w, h) => g(`plane:${w},${h}`, () => new THREE.PlaneGeometry(w, h));

/**
 * 加色混合的自發光片（照不亮任何東西 ＝ 零光源）。
 *
 * `side` 預設 `DoubleSide`：這一層的薄片是**吊著的**（展品）與**躺著的**（龕上那一片字），
 * 兩種都會從背面被看到 —— 單面材質會讓一半的展品在某些角度整片消失
 * （findings「`rotation.y = θ` 轉的是局部 +X」的同一種錯：薄的東西要先問一次
 * 「從背面看得到嗎」）。躺著的那一片仍然只從上面看，所以 `single` 給它用。
 */
function lightMat(color, opacity, single = false) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: single ? THREE.FrontSide : THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * 蓋出一座檔案廊。
 *
 * 三角形預算：地面那一圈 32 ＋ 四根細桿 48 ＋ 兩道橫樑 24
 * ＋ 兩座龕 24 ＋ 龕上兩片字 4 ＝ **132**，再加每片展品 2。
 * 12 座 ＋ 130 片展品 ＝ **1,844**。
 *
 * @param {object} hall   archive.json 的一筆 `halls`
 * @param {object} kit    區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 * @param {number} exhibits 這片土地有幾條技法（＝吊幾片展品）
 */
export function buildArchive(hall, kit, terrainHeight, exhibits) {
  const [x, z] = hall.at;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `archive:${hall.id}`;
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(hall.rot) ? hall.rot : 0;

  const stoneMat = new THREE.MeshStandardMaterial({ color: kit.mid, flatShading: true, roughness: 0.94 });

  /* --- 骨架：地面那一圈 ＋ 四根細桿 ＋ 兩道橫樑 --- */
  const frame = new THREE.Group();
  frame.name = 'frame';
  const hemMat = lightMat(kit.light, 0.14, true);
  const hem = new THREE.Mesh(ring(ARCHIVE_SPAN + 0.5, ARCHIVE_SPAN + 0.78, 16), hemMat);
  hem.name = 'hem';
  hem.rotation.x = -Math.PI / 2;
  hem.position.y = 0.04;
  hem.userData.noCollide = true;
  frame.add(hem);

  for (let i = 0; i < 4; i += 1) {
    const sx = i % 2 ? ARCHIVE_SPAN : -ARCHIVE_SPAN;
    const sz = i < 2 ? -ARCHIVE_SPAN : ARCHIVE_SPAN;
    const post = new THREE.Mesh(box(0.18, 3, 0.18), stoneMat);
    post.name = `post${i}`;
    post.position.set(sx, terrainHeight(x + sx, z + sz) - y + 1.5, sz);
    post.userData.noCollide = true;
    frame.add(post);
  }
  for (let i = 0; i < 2; i += 1) {
    const sz = i ? ARCHIVE_SPAN : -ARCHIVE_SPAN;
    const beam = new THREE.Mesh(box(ARCHIVE_SPAN * 2 + 0.18, 0.14, 0.14), stoneMat);
    beam.name = `beam${i}`;
    beam.position.set(0, 3.02, sz);
    beam.userData.noCollide = true;
    frame.add(beam);
  }
  grp.add(frame);

  /* --- 展品：這片土地的每一條技法各一片，吊在兩道橫樑下 --- */
  const exhibitGrp = new THREE.Group();
  exhibitGrp.name = 'exhibits';
  const n = Math.max(0, Math.min(ARCHIVE_EXHIBIT_MAX, exhibits | 0));
  const slats = [];
  for (let i = 0; i < n; i += 1) {
    const row = i % 2;
    const idxInRow = (i - row) / 2;
    const perRow = Math.ceil(n / 2);
    const span = ARCHIVE_SPAN * 1.7;
    const t = perRow > 1 ? idxInRow / (perRow - 1) : 0.5;
    const mat = lightMat(kit.light, 0.1);
    const slat = new THREE.Mesh(plane(0.3, 0.44), mat);
    slat.name = `slat:${i}`;
    slat.position.set(-span / 2 + span * t, 2.44, row ? ARCHIVE_SPAN : -ARCHIVE_SPAN);
    slat.userData.noCollide = true;
    exhibitGrp.add(slat);
    slats.push({ mesh: slat, mat, baseY: slat.position.y, lit: false, phase: i * 0.7 });
  }
  grp.add(exhibitGrp);

  /* --- 兩座檔案龕：各躺著一則小知識 --- */
  const niches = [];
  for (let i = 0; i < 2; i += 1) {
    const nx = i ? ARCHIVE_NICHE_X : -ARCHIVE_NICHE_X;
    const holder = new THREE.Group();
    holder.name = `niche:${i}`;
    holder.position.set(nx, terrainHeight(x + nx, z) - y, 0);
    const stand = new THREE.Mesh(box(0.9, 0.72, 0.5), stoneMat);
    stand.name = 'stand';
    stand.position.y = 0.36;
    stand.userData.noCollide = true;
    holder.add(stand);
    const leafMat = lightMat(kit.light, 0.16, true);
    const leaf = new THREE.Mesh(plane(0.8, 0.42), leafMat);
    leaf.name = 'leaf';
    leaf.rotation.x = -Math.PI / 2.35;
    leaf.position.set(0, 0.745, 0.03);
    leaf.userData.noCollide = true;
    holder.add(leaf);
    grp.add(holder);
    niches.push({ group: holder, leaf, leafMat, x: x + nx * Math.cos(grp.rotation.y), z: z - nx * Math.sin(grp.rotation.y) });
  }

  return {
    id: hall.id,
    region: hall.region,
    hall,
    group: grp,
    frame,
    exhibits: exhibitGrp,
    slats,
    niches,
    hemMat,
    stoneMat,
    x,
    z,
    y,
    /** 玩家在不在「走近浮出」的那一圈裡。 */
    near: false,
    /** 現在浮出來的是哪一則（0／1，−1 ＝ 沒有）。 */
    side: -1,
    nearAmt: 0,
  };
}

/**
 * 建立整個檔案廊場。
 *
 * @param {object} opts
 * @param {Array} opts.halls                        archive.json 的 halls
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {(id:string)=>boolean} [opts.collectedOf]    某一片展品收集到了沒（吃技法 id）
 * @param {(regionId:string)=>string[]} [opts.skillIdsOf] 這片土地的技法 id（照順序）
 * @param {()=>boolean} [opts.isBusy]               面板打開時整層停手
 * @param {boolean} [opts.reducedMotion]            只留終態
 */
export function createArchiveField({
  halls = [],
  kitOf,
  terrainHeight,
  collectedOf = null,
  skillIdsOf = null,
  isBusy = null,
  reducedMotion = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'archives';
  const archives = [];
  for (const hall of halls) {
    if (!hall || !Array.isArray(hall.at)) continue;
    const ids = skillIdsOf ? skillIdsOf(hall.region) || [] : [];
    const built = buildArchive(hall, kitOf(hall.region), terrainHeight, ids.length);
    built.skillIds = ids;
    group.add(built.group);
    archives.push(built);
  }
  const byId = new Map(archives.map((a) => [a.id, a]));
  /** `prefers-reduced-motion`：位移整個關掉（只留終態）。 */
  const kinetic = reducedMotion ? 0 : 1;
  let frame = 0;

  /** 把「收集到的技法 ＝ 亮起來的展品」重新對一次（過關、重置進度時呼叫）。 */
  function refresh() {
    if (!collectedOf) return false;
    for (let i = 0; i < archives.length; i += 1) {
      const a = archives[i];
      for (let s = 0; s < a.slats.length; s += 1) {
        const id = a.skillIds[s];
        a.slats[s].lit = Boolean(id && collectedOf(id));
      }
    }
    return true;
  }
  refresh();

  const api = {
    group,
    archives,
    get count() {
      return archives.length;
    },
    byId(id) {
      return byId.get(id) || null;
    },
    refresh,
    /** 收乾淨（重置進度走這一支：展品全部暗回去、浮出來的那一則收掉）。 */
    reset() {
      refresh();
      api.clearNear();
      return true;
    },

    /**
     * 玩家附近那一座（順便決定浮出來的是左邊還是右邊那一則）。
     *
     * **它不搶 `E`**，所以這裡沒有「排名式」那一套（那是同一層兩件東西
     * 搶同一個鍵時才需要的）——每片土地只有一座，比距離就夠了。
     * @param {{x:number,z:number}} position
     * @returns {{archive:object, side:number, distance:number}|null}
     */
    nearest(position, maxDistance = ARCHIVE_RADIUS) {
      let best = null;
      let bestDist = maxDistance;
      let bestSide = -1;
      for (let i = 0; i < archives.length; i += 1) {
        const a = archives[i];
        const dx = a.x - position.x;
        const dz = a.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= bestDist) continue;
        // 哪一則：站得比較近的那一座檔案龕（兩座在局部 ±X 上，世界座標已經轉好）
        let side = 0;
        let sideD = Infinity;
        for (let s = 0; s < a.niches.length; s += 1) {
          const nd = Math.hypot(a.niches[s].x - position.x, a.niches[s].z - position.z);
          if (nd < sideD) {
            sideD = nd;
            side = s;
          }
        }
        bestDist = d;
        bestSide = side;
        best = a;
      }
      for (let i = 0; i < archives.length; i += 1) {
        const a = archives[i];
        a.near = a === best;
        a.side = a === best ? bestSide : -1;
      }
      return best ? { archive: best, side: bestSide, distance: bestDist } : null;
    },

    /**
     * 把「走近」的狀態全部熄掉。
     *
     * `nearest()` 是唯一會清掉那個旗標的地方，而互動迴圈在**比它高階的層贏了**
     * 的時候就早退、不會呼叫它 —— 於是那一則會一直掛在畫面上
     * （P20a 審查 · 第 4 條記過同一件事）。呼叫端在早退之前呼叫這一支。
     */
    clearNear() {
      for (let i = 0; i < archives.length; i += 1) {
        archives[i].near = false;
        archives[i].side = -1;
      }
    },

    /**
     * 每幀更新。**零每幀配置**：這裡不 new、不 map/filter、不建閉包。
     */
    update(dt, t, px, pz) {
      frame += 1;
      const busy = isBusy ? isBusy() : false;
      const k = Math.min(1, dt * 3);
      for (let i = 0; i < archives.length; i += 1) {
        const a = archives[i];
        const dx = px - a.x;
        const dz = pz - a.z;
        const d2 = dx * dx + dz * dz;
        /*
         * 45 公尺外**整組連畫都不畫**（不只是不更新）——展品與龕上那一片字
         * 都是加色混合的透明片，「畫」比「算」貴（P20a 的教訓）。
         * 三角形與碰撞體的數字一格都不動（稽核走的是場景圖，不看 visible）。
         */
        const far = d2 > FAR_SQ;
        a.group.visible = !far;
        if (far) continue;
        if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;
        const aware = !busy && d2 < NEAR_R_SQ;
        a.nearAmt += ((aware ? 1 : 0) - a.nearAmt) * k;
        a.hemMat.opacity = 0.1 + a.nearAmt * 0.16;
        for (let s = 0; s < a.slats.length; s += 1) {
          const sl = a.slats[s];
          // 收集到的那幾片亮著；沒收集到的只留一點輪廓（剪影，不劇透）
          sl.mat.opacity = (sl.lit ? 0.34 : 0.07) + (sl.lit ? a.nearAmt * 0.2 : 0);
          // 飄：只有亮著的那幾片很輕地起伏（reducedMotion → kinetic 0，整個停掉）
          sl.mesh.position.y = sl.baseY + (sl.lit ? Math.sin(t * 0.9 + sl.phase) * 0.05 * kinetic : 0);
        }
        for (let s = 0; s < a.niches.length; s += 1) {
          const on = a.near && a.side === s;
          a.niches[s].leafMat.opacity = 0.12 + a.nearAmt * 0.1 + (on ? 0.24 : 0);
        }
      }
    },
  };
  return api;
}

export default {
  ARCHIVE_RADIUS,
  ARCHIVE_SPAN,
  ARCHIVE_NICHE_X,
  ARCHIVE_EXHIBIT_MAX,
  buildArchive,
  createArchiveField,
  disposeArchiveCache,
};

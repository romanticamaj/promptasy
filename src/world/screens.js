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
 * `faceSign` 扶壁在哪一面（局部 ±Z；1 ＝ 朝橋頭那一面）
 *
 * 核心之外還有兩樣東西，**都不算進遮蔽判定**（稽核保守：量到的一定比看到的少）：
 * 朝橋頭那一面的兩級矮扶壁（只往那一面外擴 0.95 公尺，擺位規則逐點掃過），
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
   * 與「離主動線 ≥ LANE_HALF+4、離地標留白 ≥16」的空隙就在這裡（`scripts/sightline-audit.mjs`
   * 與 rubric 的擺位斷言逐點掃過，餘裕 0.35 公尺）。它刻意偏北：南端只到主動線南側 0.5 公尺
   * （再往南就踩進 thinking-chamber-14 的淨空圈），北端伸到 7 公尺 ——
   * 於是「走出來的路」自然往北繞，繞過北端塔才揭露。
   */
  {
    id: 'reasoning-first-spine',
    region: 'reasoning',
    at: [-75.97, -80.56],
    rot: 0.7354,
    kind: 'stairRidge',
    length: 7.5,
    depth: 1.4,
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
    depth: 1.4,
    height: 8,
    faceSign: 1,
  },
]);

/**
 * 母題：同一個形狀重複出現，遠看就認得出這是哪一片土地（研究 M8 / Sky 的 repeated motif）。
 *
 * `at`     世界座標 [x, z]
 * `rot`    繞 Y 的旋轉（弧度）
 * `kind`   目前只有 `twiceShown`：示範了兩遍的階梯 —— 兩階實體、第三階只剩一圈光
 * `height` 整座的高度（公尺，中景階 3–8）
 */
export const MOTIFS = Object.freeze([
  // 四座散在路旁（離路網 5–11 公尺：看得到、走得過去、不擋路），彼此 ≥17 公尺 ——
  // 重複四次才叫母題；每一座都朝著不同方向，因為每一次示範都是給不同的人看的。
  { id: 'reasoning-twice-01', region: 'reasoning', at: [-110.73, -62.3], rot: 2.15, kind: 'twiceShown', height: 5.2 },
  { id: 'reasoning-twice-02', region: 'reasoning', at: [-112.32, -126.47], rot: 0.75, kind: 'twiceShown', height: 4.6 },
  { id: 'reasoning-twice-03', region: 'reasoning', at: [-58.76, -94.12], rot: 3.55, kind: 'twiceShown', height: 4.0 },
  { id: 'reasoning-twice-04', region: 'reasoning', at: [-85.81, -119.04], rot: 5.05, kind: 'twiceShown', height: 3.6 },
]);

/**
 * 走出來的路怎麼繞過石脊（世界座標的折點，由橋往區內排）。
 *
 * 只有「有遮擋帶的區」需要；沒有登記的區照舊是一條直線。
 * `buildPathNetwork()`（畫在地上的路）與 `scripts/sightline-audit.mjs`（量揭露的腳本）
 * 讀的是同一份 —— 路與稽核不會各走各的。
 */
export const PATH_BENDS = Object.freeze({
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
 * @returns {number[][]} [[x, z], …]，至少兩點
 */
export function corridorPolyline(corridor) {
  const bends = PATH_BENDS[corridor.region] || [];
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
 * @returns {{hidden:boolean, flat:boolean, by:string|null, need:number, have:number}}
 */
export function landmarkSight(x, z, landmark, heightAt, bands) {
  const eyeY = heightAt(x, z) + EYE_HEIGHT;
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
 * 兩端再往外疊兩階往下收的石階（在 length 之外），剪影才讀得出「這是一段被走上去的階梯」，
 * 不是一面牆。
 */
function buildStairRidge(band, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `screen:${band.id}`;
  const f = bandFootprint(band);
  const SEG = Math.max(3, Math.round(band.length / 2.6));
  const segLen = band.length / SEG;
  const half = segLen / 2;
  const face = band.faceSign || 1;

  const at = (u, v) => [f.cx + f.ux * u + f.vx * v, f.cz + f.uz * u + f.vz * v];

  for (let i = 0; i < SEG; i += 1) {
    const u = -band.length / 2 + segLen * (i + 0.5);
    const [x, z] = at(u, 0);
    const ground = heightAt(x, z);
    /*
     * 核心：**每一塊各自貼自己腳下的地**（P10a 的教訓），往下多埋 1.6 公尺咬進階地的落差，
     * 往上一律到 `band.height` —— 稽核量的那個矩形因此一定是實心到頂的。
     */
    const h = band.height + 1.6;
    const slab = new THREE.Mesh(box(segLen * 0.995, h, band.depth), stone(kit.mid));
    slab.position.set(x, ground - 1.6 + h / 2, z);
    slab.rotation.y = band.rot;
    slab.userData.solidSpan = [half, band.depth / 2];
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
   * 朝橋頭那一面的一級扶壁（`faceSign` 指的就是這一面）：走近時腳下先遇到一階矮的，
   * 石脊才升上去 —— 有了這一階（再加上頂上一階比一階高的頂階），
   * 它讀起來是「被走上去的階梯」而不是一面牆。
   *
   * 它只往那一面外擴 1.4 公尺（擺位規則逐點掃過的就是這個外框），
   * 自己登記一串半徑 0.7 的碰撞圓 —— 加上核心那一串，一道石脊共 12 個碰撞體。
   */
  {
    const outer = new THREE.Mesh(box(band.length * 0.92, band.height * 0.3 + 1.4, band.depth), stone(kit.dark));
    const [ox, oz] = at(0, face * band.depth);
    const oGround = heightAt(ox, oz);
    outer.position.set(ox, oGround - 1.4 + (band.height * 0.3 + 1.4) / 2, oz);
    outer.rotation.y = band.rot;
    outer.userData.solidSpan = [(band.length * 0.92) / 2, band.depth / 2];
    grp.add(outer);

  }

  return grp;
}

/**
 * 母題：示範了兩遍的階梯。
 *
 * 兩階是實體的（走得到、擋得住），第三階只剩一圈懸在半空的光輪廓 ——
 * 「師傅只示範兩遍，第三遍的階梯要你自己踏出來」。整座用一個 InstancedMesh 疊出來。
 */
function buildTwiceShown(motif, kit, heightAt) {
  const grp = new THREE.Group();
  grp.name = `motif:${motif.id}`;
  const [x, z] = motif.at;
  const ground = heightAt(x, z);
  const rise = motif.height / 3.4; // 三階（第三階是空的）＋一點底座
  const run = rise * 1.35;
  const w = Math.max(2.0, rise * 1.5);

  const steps = new THREE.InstancedMesh(box(1, 1, 1), stone(kit.mid), 3);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, motif.rot, 0));
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const dirX = Math.cos(motif.rot);
  const dirZ = -Math.sin(motif.rot);
  // 幾何**以 at 為中心**排（不然「往前長」的那兩階會偷偷伸進別人的淨空圈）
  const back = -run * 0.75;
  for (let i = 0; i < 3; i += 1) {
    // 第 0 階是底座（矮而寬），第 1、2 階是「示範的兩遍」
    const h = i === 0 ? rise * 1.1 : rise * 1.15;
    const y = ground + (i === 0 ? h / 2 : rise * 1.1 + rise * 1.15 * (i - 0.5));
    const off = back + (i === 0 ? 0 : run * (i - 0.5));
    p.set(x + dirX * off, y, z + dirZ * off);
    s.set(w - i * 0.28, h, w * 0.62);
    steps.setMatrixAt(i, mtx.compose(p, q, s));
  }
  steps.instanceMatrix.needsUpdate = true;
  steps.userData.solid = true;
  steps.userData.blocksCamera = true;
  grp.add(steps);

  // 第三階：只剩一圈光的輪廓（懸在半空、不是物質 → 不擋人、不進碰撞）
  const ghostH = ground + rise * 1.1 + rise * 1.15 * 2 + rise * 0.5;
  const ghost = new THREE.Mesh(box(w - 0.84, 0.14, w * 0.62), glow(kit.accent, 1.1));
  ghost.position.set(x + dirX * (back + run * 2.5), ghostH, z + dirZ * (back + run * 2.5));
  ghost.rotation.y = motif.rot;
  ghost.userData.noCollide = true;
  grp.add(ghost);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(box(0.12, 0.12, w * 0.62), glow(kit.accent, 0.8));
    edge.position.set(
      x + dirX * (back + run * 2.5) + dirX * side * (w - 0.9) * 0.5,
      ghostH,
      z + dirZ * (back + run * 2.5) + dirZ * side * (w - 0.9) * 0.5
    );
    edge.rotation.y = motif.rot;
    edge.userData.noCollide = true;
    grp.add(edge);
  }

  return grp;
}

const BAND_KINDS = { stairRidge: buildStairRidge };
const MOTIF_KINDS = { twiceShown: buildTwiceShown };

/** 已實作的造型 id（測試會檢查資料只用得到這些）。 */
export const BAND_KIND_IDS = Object.freeze(Object.keys(BAND_KINDS));
export const MOTIF_KIND_IDS = Object.freeze(Object.keys(MOTIF_KINDS));

/**
 * 蓋出一片土地的中觀層（遮擋帶 ＋ 母題）。沒有資料的區回傳 null。
 *
 * @param {string} regionId
 * @param {{accent:number, light:number, mid:number, dark:number}} kit
 * @param {(x:number,z:number)=>number} heightAt
 * @returns {null|{group:THREE.Group, bands:object[], motifs:object[]}}
 */
export function buildScreens(regionId, kit, heightAt) {
  const bands = SCREEN_BANDS.filter((b) => b.region === regionId);
  const motifs = MOTIFS.filter((mo) => mo.region === regionId);
  if (!bands.length && !motifs.length) return null;
  const group = new THREE.Group();
  group.name = `screens:${regionId}`;
  for (const b of bands) group.add((BAND_KINDS[b.kind] || buildStairRidge)(b, kit, heightAt));
  for (const mo of motifs) group.add((MOTIF_KINDS[mo.kind] || buildTwiceShown)(mo, kit, heightAt));
  return { group, bands, motifs };
}

export default {
  SCREEN_BANDS,
  landmarkSight,
  MOTIFS,
  PATH_BENDS,
  corridorPolyline,
  bandFootprint,
  pointInBand,
  segmentCrossesBand,
  buildScreens,
  disposeScreenCache,
};

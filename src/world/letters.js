/**
 * Promptasy — 抄寫人的殘頁（letters, v1.2 · P07）
 *
 * 世界裡的第七層互動，夾在刻文小語與器物之間：
 *
 *   世界觀石碑（lore tablet）  純風味，一塊碑、兩三行字
 *   刻文小語（inscription）    走近按 E → 一件很小的事（掛在一條真實技巧上）
 *   **殘頁（這一層）**          抄寫人留下的工單／信／筆記；撿到就進圖鑑
 *   器物（handle）             動得了的東西（純風味）
 *
 * 護欄 2 的處理方式跟既有兩層一樣，而且**分成兩種**：
 *   · 有教學句的殘頁 → 一定掛在一條真實技巧上（`techniqueId`）、一定附得出
 *     可點的官方出處（神諭原典），教學句子取自遊戲既有的中文說法。
 *   · 純風味的殘頁   → 沒有 `techniqueId`、沒有 `hint`、沒有連結（同 secrets.json）。
 *
 * 造型刻意做得很低（< 0.9 公尺）：它是「掉在路邊的一頁紙」，不是新的地標 ——
 * 所以碰撞稽核判定它「跨得過去」，不加碰撞體、不加光源（只有自發光的一點微光）。
 */
import * as THREE from 'three';
import { PALETTE } from '../engine/engine.js';

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

/** 釋放快取（重建世界時呼叫）。 */
export function disposeLetterCache() {
  for (const v of GEO.values()) v.dispose();
  for (const v of MAT.values()) v.dispose();
  GEO.clear();
  MAT.clear();
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 6) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d = 0) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ring = (r, t) => g(`ring:${r},${t}`, () => new THREE.TorusGeometry(r, t, 4, 16));

const stone = (c) => m(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92 }));
const wood = () => m('wood', () => new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true, roughness: 0.95 }));
/** 紙：抄寫人手上那種泛黃的厚紙（微微自發光，才在夜裡看得見） */
const paper = () =>
  m('paper', () =>
    new THREE.MeshStandardMaterial({
      color: 0xd8cdb4,
      emissive: 0x2a2418,
      flatShading: true,
      roughness: 0.98,
      side: THREE.DoubleSide,
    })
  );

/** 紙邊的一點微光：走近亮起來，撿過之後轉成安靜的暖金。 */
function markMaterial() {
  return new THREE.MeshBasicMaterial({
    color: PALETTE.warm,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function put(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (Array.isArray(scale)) mesh.scale.set(scale[0], scale[1], scale[2]);
  else mesh.scale.setScalar(scale);
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ *
 * 三種載體（都很矮：紙不會站起來）
 * ------------------------------------------------------------------ */

/** 被一顆石頭壓在地上的一頁（風吹不走，所以還在）。 */
function propPage(kit) {
  const grp = new THREE.Group();
  put(grp, box(0.62, 0.02, 0.46), paper(), [0, 0.05, 0], [0, 0.18, 0]);
  put(grp, box(0.5, 0.02, 0.36), paper(), [0.14, 0.09, 0.1], [0, -0.42, 0.03]);
  const weight = put(grp, ico(0.19, 0), stone(kit.mid), [-0.12, 0.12, -0.06], [0.3, 0.7, 0.2], [1, 0.72, 1]);
  return { group: grp, face: weight, faceY: 0.3 };
}

/** 釘在矮木樁上的工單（工地那種，釘子還在）。 */
function propWorkOrder(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.06, 0.08, 0.72, 5), wood(), [0, 0.36, 0]);
  const sheet = put(grp, box(0.46, 0.34, 0.015), paper(), [0, 0.62, 0.05], [-0.22, 0.1, 0.05]);
  put(grp, box(0.3, 0.06, 0.2), stone(kit.dark), [0, 0.03, 0]);
  return { group: grp, face: sheet, faceY: 0.86 };
}

/** 用繩子綁著、靠在石頭邊的一疊（沒人回來拆開它）。 */
function propBundle(kit) {
  const grp = new THREE.Group();
  put(grp, ico(0.26, 0), stone(kit.dark), [0.24, 0.13, 0.02], [0.2, 0.4, 0.1], [1, 0.66, 1]);
  const stack = new THREE.Group();
  stack.position.set(-0.08, 0.1, 0);
  stack.rotation.set(-0.34, 0.5, 0.06);
  grp.add(stack);
  for (let i = 0; i < 3; i += 1) put(stack, box(0.44, 0.016, 0.32), paper(), [i * 0.012, i * 0.026, i * 0.01], [0, i * 0.05, 0]);
  put(stack, box(0.05, 0.11, 0.34), wood(), [0.02, 0.04, 0]);
  return { group: grp, face: stack, faceY: 0.34 };
}

const BUILDERS = {
  page: propPage,
  workorder: propWorkOrder,
  bundle: propBundle,
};

/** 可用的載體種類（測試會拿去驗證資料）。 */
export const LETTER_PROPS = Object.freeze(Object.keys(BUILDERS));

/**
 * 走近才撿得到的互動半徑。
 * 與刻文小語同一個值（3.8）—— 它們是同一種尺度的東西；搶 `E` 的順序由
 * `main.js` 的仲裁決定（石座 > 濁靈 > 石碑 > 刻文 > **殘頁** > 器物 > 閘門）。
 */
export const LETTER_RADIUS = 3.8;

/**
 * 蓋出一頁殘頁。
 * @param {object} spec letters.json 的一列
 * @param {object} kit  kitFor(regionColor)
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildLetter(spec, kit, terrainHeight) {
  const make = BUILDERS[spec.prop] || propPage;
  const built = make(kit);
  const grp = new THREE.Group();
  const [x, z] = spec.at;
  const y = terrainHeight(x, z);
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(spec.rot) ? spec.rot : (x * 0.23 + z * 0.31) % Math.PI;
  grp.name = `letter:${spec.id}`;
  grp.add(built.group);

  // tell：紙邊的一點微光（走近亮起）＋ 地上一圈很淡的光輪廓
  const mark = markMaterial();
  const edge = new THREE.Mesh(ring(0.3, 0.028), mark);
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = built.faceY;
  grp.add(edge);

  const halo = new THREE.Mesh(ring(0.66, 0.035), mark);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  grp.add(halo);

  return {
    id: spec.id,
    spec,
    group: grp,
    position: new THREE.Vector3(x, y, z),
    material: mark,
    near: false,
    found: false,
    setNear(v) {
      this.near = Boolean(v);
    },
    setFound(v) {
      this.found = Boolean(v);
      if (this.found) mark.color.set(PALETTE.warm);
    },
    update(dt, t) {
      const base = this.near ? 0.46 : this.found ? 0.08 : 0.18;
      mark.opacity = base + Math.sin(t * 1.6 + x * 0.21 + z * 0.13) * 0.04;
      edge.rotation.z = t * (this.near ? 0.42 : 0.11);
    },
  };
}

export default { buildLetter, LETTER_PROPS, LETTER_RADIUS, disposeLetterCache };

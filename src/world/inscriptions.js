/**
 * Promptasy — 刻文小語（inscribed props）
 *
 * 世界裡的第三層互動，夾在既有的兩層之間：
 *
 *   世界觀石碑（lore tablet）  純風味，不教任何技巧、不附出處
 *   **刻文小語（這一層）**      走近按 E → 一個很小的對話窗，一次教一件很小的事
 *   關卡石座（challenge）      四幕分鏡、完整 rubric 評分
 *
 * 護欄 2 的處理方式和主控台第二幕一樣：**換皮但不說謊**。
 * 每一則刻文都掛在一條真實存在的技巧上（`techniqueId`），畫面上顯示的教學句子
 * 直接取自遊戲既有的中文說法（curriculum-zh → curriculum 的 tip），
 * 後面一定接得出可點的官方出處（神諭原典）。`lines` / `hint` 是遊戲自撰的白話。
 *
 * 造型刻意做得小：這些是「刻在既有場景物件上的字」，不是新的地標。
 * 每一件的外接盒都刻意讓碰撞稽核判定為「跨得過去／繞得過去」——
 * 不加碰撞體、不加光源（只有自發光材質），所以走位與效能預算都不受影響。
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
export function disposeInscriptionCache() {
  for (const v of GEO.values()) v.dispose();
  for (const v of MAT.values()) v.dispose();
  GEO.clear();
  MAT.clear();
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 6) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d = 0) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ring = (r, t) => g(`ring:${r},${t}`, () => new THREE.TorusGeometry(r, t, 4, 18));

const stone = (c) => m(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92 }));
const wood = () => m('wood', () => new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true, roughness: 0.95 }));
const metal = () =>
  m('metal', () => new THREE.MeshStandardMaterial({ color: 0x7d8d99, flatShading: true, roughness: 0.45, metalness: 0.5 }));

/** 刻痕：一層很淡的暖光，走近會亮起來（每一則各自一份，才能各自變亮）。 */
function carveMaterial() {
  return new THREE.MeshBasicMaterial({
    color: PALETTE.warm,
    transparent: true,
    opacity: 0.16,
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
 * 五種載體（都很小：不是地標，是「刻在旁邊那塊石頭上的字」）
 * ------------------------------------------------------------------ */

/** 斜插在地上的小刻石。 */
function propPlaque(kit) {
  const grp = new THREE.Group();
  put(grp, box(0.88, 0.2, 0.58), stone(kit.dark), [0, 0.1, 0]);
  const slab = put(grp, box(0.72, 0.86, 0.14), stone(kit.mid), [0, 0.56, 0], [-0.26, 0.1, 0.04]);
  return { group: grp, face: slab, faceY: 0.98 };
}

/** 釘在細木柱上的木牌。 */
function propBoard(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.07, 0.09, 1.5, 5), wood(), [0, 0.75, 0]);
  const board = put(grp, box(0.98, 0.56, 0.08), wood(), [0, 1.28, 0.02], [0, 0, -0.05]);
  put(board, box(0.86, 0.44, 0.02), stone(kit.light), [0, 0, 0.06]);
  return { group: grp, face: board, faceY: 1.62 };
}

/** 矮矮的刻柱（膝蓋高，跨得過去）。 */
function propPostStone(kit) {
  const grp = new THREE.Group();
  const post = put(grp, cyl(0.3, 0.36, 1.24, 7), stone(kit.mid), [0, 0.62, 0]);
  put(grp, cyl(0.34, 0.34, 0.1, 7), stone(kit.dark), [0, 1.26, 0]);
  return { group: grp, face: post, faceY: 1.4 };
}

/** 水邊那顆被磨圓的石頭。 */
function propPoolStone(kit) {
  const grp = new THREE.Group();
  put(grp, ico(0.6, 0), stone(kit.mid), [0, 0.3, 0], [0.2, 0.5, 0.1], [1, 0.62, 1]);
  const chip = put(grp, ico(0.3, 0), stone(kit.dark), [0.52, 0.14, -0.3], [0.6, 1.1, 0.2], [1, 0.7, 1]);
  return { group: grp, face: chip, faceY: 0.78 };
}

/** 掛在工具架橫桿上的吊牌。 */
function propToolPlate(kit) {
  const grp = new THREE.Group();
  for (const side of [-1, 1]) put(grp, cyl(0.06, 0.07, 1.32, 5), metal(), [side * 0.44, 0.66, 0]);
  put(grp, cyl(0.05, 0.05, 1.0, 5), metal(), [0, 1.3, 0], [0, 0, Math.PI / 2]);
  const plate = put(grp, box(0.6, 0.42, 0.06), metal(), [0, 1.02, 0.02], [0.06, 0, 0.08]);
  put(plate, box(0.5, 0.32, 0.02), stone(kit.light), [0, 0, 0.05]);
  return { group: grp, face: plate, faceY: 1.36 };
}

const BUILDERS = {
  plaque: propPlaque,
  board: propBoard,
  poststone: propPostStone,
  poolstone: propPoolStone,
  toolplate: propToolPlate,
};

/** 可用的載體種類（測試會拿去驗證資料）。 */
export const INSCRIPTION_PROPS = Object.freeze(Object.keys(BUILDERS));

/** 走近才看得到刻文的互動半徑（比石碑再小 —— 這是「刻在角落的字」）。 */
export const INSCRIPTION_RADIUS = 3.8;

/**
 * 蓋出一則刻文小語。
 * @param {object} spec inscriptions.json 的一列
 * @param {object} kit  kitFor(regionColor)
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildInscription(spec, kit, terrainHeight) {
  const make = BUILDERS[spec.prop] || propPlaque;
  const built = make(kit);
  const grp = new THREE.Group();
  const [x, z] = spec.at;
  const y = terrainHeight(x, z);
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(spec.rot) ? spec.rot : (x * 0.37 + z * 0.11) % Math.PI;
  grp.name = `inscription:${spec.id}`;
  grp.add(built.group);

  // 刻痕的光：走近亮起，讀過之後轉成安靜的暖金
  const carve = carveMaterial();
  const mark = new THREE.Mesh(ring(0.34, 0.035), carve);
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = built.faceY;
  grp.add(mark);

  const halo = new THREE.Mesh(ring(0.78, 0.04), carve);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  grp.add(halo);

  return {
    id: spec.id,
    spec,
    group: grp,
    position: new THREE.Vector3(x, y, z),
    material: carve,
    near: false,
    found: false,
    setNear(v) {
      this.near = Boolean(v);
    },
    setFound(v) {
      this.found = Boolean(v);
      if (this.found) carve.color.set(PALETTE.warm);
    },
    update(dt, t) {
      const base = this.near ? 0.5 : this.found ? 0.09 : 0.2;
      carve.opacity = base + Math.sin(t * 1.9 + x * 0.3 + z * 0.17) * 0.045;
      mark.rotation.z = t * (this.near ? 0.5 : 0.14);
    },
  };
}

export default { buildInscription, INSCRIPTION_PROPS, INSCRIPTION_RADIUS, disposeInscriptionCache };

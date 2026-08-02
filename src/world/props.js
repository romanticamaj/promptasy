/**
 * Promptasy — 場景敘事：道具、故事小景（vignette）、地標、石碑（lore）
 *
 * Phase 5 的世界觀：這片土地上曾有一群人學會了跟「神諭」說話。
 * 他們留下的東西還在——刻到一半的碑、走不到盡頭的階梯、翻開的書、拆到一半的機器、
 * 掛在架上的面具。玩家是後來的旅人，沿著他們走出來的路把這件事重新學一遍。
 *
 * 手法（參考環境敘事的通用作法）：
 *   · **vignette / tableau**：把幾件道具**成組**擺出一個「這裡發生過什麼」的畫面，
 *     而不是均勻地灑裝飾品（兩張對坐的椅子 ＋ 沒收的茶具 > 二十顆隨機石頭）。
 *   · **每件道具都要能回答 who / what / why**：誰用的、做什麼、為什麼留在這。
 *   · **地標（landmark / weenie）**：每區一個從中央高原就看得到的大剪影，
 *     周圍刻意留白、留矮 —— 高的東西要旁邊都是矮的才顯得高。
 *   · **靠對比與光引導，不靠「引導線」**：玩家看的是亮度 / 顏色 / 動態的對比。
 *   · **可以錯過**：石碑與小景都不在必經路線上，找到才有意義。
 *
 * 效能：幾何體與材質全部快取共用，重複元素（浮階、書葉、螺旋階梯、刻痕）用 InstancedMesh。
 */
import * as THREE from 'three';
import { PALETTE } from '../engine/engine.js';

/* ------------------------------------------------------------------ *
 * 幾何體 / 材質快取
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

/** 釋放所有快取（重建世界時呼叫）。 */
export function disposePropCache() {
  for (const v of GEO.values()) v.dispose();
  for (const v of MAT.values()) v.dispose();
  GEO.clear();
  MAT.clear();
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 6) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 6) => g(`cone:${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const ico = (r, d = 0) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const torus = (r, t, s = 5, ts = 14, arc = Math.PI * 2) =>
  g(`tor:${r},${t},${s},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, s, ts, arc));
const plane = (w, h) => g(`pl:${w},${h}`, () => new THREE.PlaneGeometry(w, h));
const disc = (r, s = 24) => g(`disc:${r},${s}`, () => new THREE.CircleGeometry(r, s));

/** 世界共用的材質色本（低彩度 ＋ 每區一個主色，符合「有限色盤」原則）。 */
const stone = (c) => m(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92 }));
const wood = () => m('wood', () => new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true, roughness: 0.95 }));
const metal = () =>
  m('metal', () => new THREE.MeshStandardMaterial({ color: 0x7d8d99, flatShading: true, roughness: 0.42, metalness: 0.55 }));
const cloth = (c) => m(`cloth:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.96 }));
const paper = () =>
  m('paper', () => new THREE.MeshStandardMaterial({ color: 0xd9d3c2, flatShading: true, roughness: 0.85, side: THREE.DoubleSide }));
const glow = (c, i = 0.9) =>
  m(`glow:${c}:${i}`, () =>
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: new THREE.Color(c),
      emissiveIntensity: i,
      flatShading: true,
      roughness: 0.4,
    })
  );
/**
 * 靜水面。場景沒有 environment map，純金屬材質會直接變成一個黑洞，
 * 所以改成「深藍底 ＋ 低粗糙的高光 ＋ 一點天光自發光」，夜裡才像水。
 */
const water = (c) =>
  m(`water:${c}`, () =>
    new THREE.MeshStandardMaterial({
      color: 0x16293b,
      roughness: 0.18,
      metalness: 0.4,
      emissive: new THREE.Color(c).multiplyScalar(0.16),
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.9,
    })
  );
/** 水面上那層很淡的天光倒影（加色混合，最便宜的「會反光」）。 */
const sheen = () =>
  m('sheen', () =>
    new THREE.MeshBasicMaterial({
      color: PALETTE.skyLow,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );

/** 銘刻用的貼圖：程序生成的「像文字但不是文字」的刻痕。 */
function glyphTexture(seed = 1) {
  const key = `glyph:${seed}`;
  let tex = MAT.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 256);
  let s = seed * 2654435761;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  ctx.strokeStyle = 'rgba(226,238,248,0.5)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let row = 0; row < 9; row += 1) {
    const y = 26 + row * 25;
    let x = 20 + rnd() * 10;
    const glyphs = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < glyphs; i += 1) {
      const w = 12 + rnd() * 12;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + w, y - 7);
      if (rnd() > 0.4) {
        ctx.moveTo(x + w * 0.5, y - 7);
        ctx.lineTo(x + w * 0.5, y + 6);
      }
      if (rnd() > 0.5) {
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x + w, y + 6);
      }
      ctx.stroke();
      x += w + 6;
      if (x > 100) break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  MAT.set(key, t);
  return t;
}

const glyphMat = (seed) =>
  m(`glyphmat:${seed}`, () =>
    new THREE.MeshStandardMaterial({
      map: glyphTexture(seed),
      transparent: true,
      emissive: new THREE.Color(PALETTE.accent),
      emissiveIntensity: 0.18,
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
  );

/* ------------------------------------------------------------------ *
 * 擺放小工具
 * ------------------------------------------------------------------ */
function put(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (Array.isArray(scale)) mesh.scale.set(scale[0], scale[1], scale[2]);
  else mesh.scale.setScalar(scale);
  parent.add(mesh);
  return mesh;
}

/** 讓某個物件參與鏡頭避障（大型道具才需要）。 */
function bulky(obj) {
  obj.userData.blocksCamera = true;
  return obj;
}

/* ------------------------------------------------------------------ *
 * 道具（每個 builder 回傳一個以 y=0 為地面的 Group）
 * ------------------------------------------------------------------ */

/* --- foundations：學會把話說清楚的地方 ------------------------------ */

/** 石碑：刻著一半的字，有人想把話說完整。 */
function propStele(kit, { h = 3.2, seed = 1, tilt = 0 } = {}) {
  const grp = new THREE.Group();
  put(grp, box(1.4, 0.4, 0.9), stone(kit.dark), [0, 0.2, 0]);
  const slab = put(grp, box(1.15, h, 0.3), stone(kit.mid), [0, h / 2 + 0.36, 0], [tilt, 0, tilt * 0.4]);
  put(slab, plane(0.95, h * 0.78), glyphMat(seed), [0, 0, 0.17]);
  return grp;
}

/** 倒掉的方尖碑碎片：有人試著把它們排回去，排到一半就走了。 */
function propObeliskShard(kit, { len = 3.4, seed = 1 } = {}) {
  const grp = new THREE.Group();
  put(grp, cone(0.62, len, 4), stone(kit.mid), [0, 0.5, 0], [Math.PI / 2, seed * 0.7, 0.12]);
  put(grp, box(0.9, 0.7, 0.9), stone(kit.dark), [len * 0.55, 0.35, 0.5], [0.2, seed, 0.1]);
  return grp;
}

/** 疊石堆：路標，最古老的一種「說清楚」。 */
function propCairn(kit) {
  const grp = new THREE.Group();
  let y = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = 0.5 - i * 0.075;
    put(grp, ico(r, 0), stone(i % 2 ? kit.mid : kit.dark), [Math.sin(i * 2.1) * 0.06, y + r * 0.7, Math.cos(i * 1.7) * 0.06], [
      i * 0.4,
      i * 1.1,
      i * 0.2,
    ]);
    y += r * 1.25;
  }
  return grp;
}

/** 冷掉的火塘：石圈、燒黑的柴、一顆還沒滅的餘燼。 */
function propFirePit(kit, { ember = true, light = true } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    put(grp, ico(0.26, 0), stone(kit.dark), [Math.cos(a) * 1.0, 0.14, Math.sin(a) * 1.0], [a, a * 2, 0]);
  }
  for (let i = 0; i < 3; i += 1) {
    put(grp, cyl(0.1, 0.12, 1.5, 5), wood(), [0, 0.28, 0], [0.35, (i / 3) * Math.PI, Math.PI / 2 - 0.25]);
  }
  if (ember) put(grp, ico(0.2, 0), glow(PALETTE.warm, 1.6), [0, 0.2, 0]);
  if (ember && light) {
    const lamp = new THREE.PointLight(PALETTE.warm, 2.2, 9, 2);
    lamp.position.set(0, 0.6, 0);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  return grp;
}

/** 石凳。兩張對坐的石凳就是一場沒說完的對話。 */
function propStoneSeat(kit) {
  const grp = new THREE.Group();
  put(grp, box(1.3, 0.42, 0.7), stone(kit.mid), [0, 0.21, 0]);
  put(grp, box(1.3, 0.9, 0.18), stone(kit.dark), [0, 0.66, -0.32], [-0.14, 0, 0]);
  return grp;
}

/** 沒收的茶具：一張矮桌、一只壺、兩個杯 —— 「這裡有兩個人談過話」。 */
function propTeaSet(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.62, 0.56, 0.14, 8), stone(kit.mid), [0, 0.5, 0]);
  put(grp, cyl(0.16, 0.22, 0.5, 6), stone(kit.dark), [0, 0.25, 0]);
  put(grp, cyl(0.2, 0.24, 0.26, 7), glow(kit.accent, 0.3), [0, 0.7, 0]);
  put(grp, cyl(0.05, 0.05, 0.2, 5), metal(), [0.24, 0.68, 0.06], [0, 0, 1.3]);
  put(grp, cyl(0.1, 0.09, 0.13, 6), stone(kit.light), [-0.28, 0.63, 0.2]);
  put(grp, cyl(0.1, 0.09, 0.13, 6), stone(kit.light), [0.22, 0.63, -0.26], [0.3, 0, 0.2]);
  return grp;
}

/** 反射水池：石緣 ＋ 一面靜水。夜裡會把星空與提燈映起來。 */
function propPool(kit, { r = 3.2 } = {}) {
  const grp = new THREE.Group();
  const lip = put(grp, torus(r, 0.34, 5, 20), stone(kit.mid), [0, 0.16, 0], [Math.PI / 2, 0, 0]);
  lip.receiveShadow = false;
  const surface = put(grp, disc(r + 0.06, 26), water(kit.accent), [0, 0.14, 0], [-Math.PI / 2, 0, 0]);
  const gleam = put(grp, disc(r - 0.4, 22), sheen(), [0, 0.16, 0], [-Math.PI / 2, 0, 0]);
  gleam.renderOrder = 2;
  grp.userData.water = surface;
  return grp;
}

/** 木頭路牌：兩隻指向不同方向的臂。 */
function propSignpost(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.12, 0.16, 3.1, 6), wood(), [0, 1.55, 0]);
  put(grp, box(1.5, 0.28, 0.1), wood(), [0.6, 2.5, 0], [0, 0.4, 0.04]);
  put(grp, box(1.2, 0.24, 0.1), wood(), [-0.5, 2.0, 0], [0, -0.9, -0.05]);
  put(grp, ico(0.16, 0), glow(kit.accent, 0.8), [0, 3.2, 0]);
  return grp;
}

/* --- reasoning：一步一步想的地方 ------------------------------------ */

/** 通往空中的石階：他們試著推導，推到一半發現路是斷的。 */
function propStairFlight(kit, { steps = 7, rise = 0.42, run = 0.72 } = {}) {
  const grp = new THREE.Group();
  const geoStep = box(2.2, rise, run);
  const im = new THREE.InstancedMesh(geoStep, stone(kit.mid), steps);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < steps; i += 1) {
    mtx.makeTranslation(0, rise * (i + 0.5), run * (i + 0.5));
    im.setMatrixAt(i, mtx);
  }
  im.instanceMatrix.needsUpdate = true;
  grp.add(bulky(im));
  return grp;
}

/** 一串懸在空中的小階：思路的中間步驟，看得見但踩不到。 */
function propFloatSteps(kit, { n = 8 } = {}) {
  const grp = new THREE.Group();
  const im = new THREE.InstancedMesh(box(0.9, 0.16, 0.9), glow(kit.accent, 0.5), n);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i += 1) {
    p.set(Math.sin(i * 1.15) * 1.5, 1.6 + i * 0.85, i * 1.05);
    q.setFromEuler(new THREE.Euler(0.05 * i, i * 0.5, 0.04 * i));
    im.setMatrixAt(i, mtx.compose(p, q, s));
  }
  im.instanceMatrix.needsUpdate = true;
  grp.add(im);
  grp.userData.floaters = im;
  return grp;
}

/** 沒刻完的「思考者」：頭與手臂成形了，腿還是一塊粗胚。 */
function propThinker(kit) {
  const grp = new THREE.Group();
  put(grp, box(2.0, 0.5, 1.8), stone(kit.dark), [0, 0.25, 0]);
  put(grp, box(1.5, 1.1, 1.4), stone(kit.dark), [0, 1.0, -0.1]); // 還沒鑿開的下半身
  const torso = put(grp, box(0.9, 1.3, 0.7), stone(kit.mid), [0, 2.15, 0.05], [0.22, 0, 0]);
  put(torso, ico(0.36, 1), stone(kit.light), [0, 0.85, 0.06]);
  put(torso, cyl(0.13, 0.13, 0.85, 5), stone(kit.mid), [0.34, 0.28, 0.3], [-0.9, 0, -0.5]);
  put(torso, cyl(0.13, 0.13, 0.7, 5), stone(kit.mid), [-0.36, 0.1, 0.15], [-0.4, 0, 0.5]);
  bulky(grp.children[2]);
  return grp;
}

/** 靠牆的石板：上面是一道一道的計數刻痕（有人在這裡反覆試）。 */
function propTallySlate(kit, { marks = 11 } = {}) {
  const grp = new THREE.Group();
  const slab = put(grp, box(1.8, 2.4, 0.18), stone(kit.dark), [0, 1.2, 0], [0.16, 0.2, 0.04]);
  const im = new THREE.InstancedMesh(box(0.06, 0.42, 0.03), glow(kit.accent, 0.4), marks);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < marks; i += 1) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    mtx.makeTranslation(-0.55 + col * 0.22, 0.5 - row * 0.6, 0.1);
    im.setMatrixAt(i, mtx);
  }
  im.instanceMatrix.needsUpdate = true;
  slab.add(im);
  return grp;
}

/** 鑿到一半的柱子。 */
function propColumnStub(kit, { h = 2.6 } = {}) {
  const grp = new THREE.Group();
  put(grp, cyl(0.55, 0.7, h, 8), stone(kit.mid), [0, h / 2, 0]);
  put(grp, ico(0.6, 0), stone(kit.dark), [0.1, h + 0.15, 0.05], [0.4, 0.7, 0.2]);
  return grp;
}

/** 木架（工程還沒收尾）。 */
function propScaffold(kit, { w = 2.4, h = 4.2 } = {}) {
  const grp = new THREE.Group();
  for (const [x, z] of [
    [-w / 2, -0.7],
    [w / 2, -0.7],
    [-w / 2, 0.7],
    [w / 2, 0.7],
  ]) {
    put(grp, cyl(0.09, 0.11, h, 5), wood(), [x, h / 2, z]);
  }
  for (const y of [h * 0.35, h * 0.75]) {
    put(grp, box(w + 0.2, 0.12, 0.12), wood(), [0, y, -0.7]);
    put(grp, box(w + 0.2, 0.12, 0.12), wood(), [0, y, 0.7]);
    put(grp, box(w, 0.1, 1.5), wood(), [0, y + 0.1, 0]);
  }
  bulky(grp);
  return grp;
}

/** 成對的示範牌：左邊寫「像這樣」，右邊寫「照著做」。 */
function propExamplePair(kit) {
  const grp = new THREE.Group();
  for (const x of [-1.1, 1.1]) {
    put(grp, cyl(0.09, 0.11, 1.5, 5), wood(), [x, 0.75, 0]);
    const card = put(grp, box(1.5, 1.0, 0.08), stone(kit.light), [x, 1.7, 0], [0, x > 0 ? -0.18 : 0.18, 0]);
    put(card, plane(1.2, 0.8), glyphMat(x > 0 ? 4 : 3), [0, 0, 0.05]);
  }
  put(grp, ico(0.14, 0), glow(kit.accent, 1.0), [0, 2.5, 0]);
  return grp;
}

/** 路燈：夜裡最便宜的「往這裡走」。 */
function propLampPost(kit, { h = 3.4, intensity = 2.6, light = true } = {}) {
  const grp = new THREE.Group();
  put(grp, cyl(0.1, 0.16, h, 6), metal(), [0, h / 2, 0]);
  put(grp, cone(0.32, 0.3, 6), metal(), [0, h + 0.12, 0]);
  put(grp, ico(0.24, 0), glow(PALETTE.warm, 2.1), [0, h - 0.12, 0]);
  if (light) {
    const lamp = new THREE.PointLight(PALETTE.warm, intensity, 14, 2);
    lamp.position.set(0, h - 0.12, 0);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  return grp;
}

/* --- grounding：先讀再答的地方 -------------------------------------- */

/** 一疊書。角度都歪一點，才像真的被人翻過。 */
function propBookPile(kit, { n = 6 } = {}) {
  const grp = new THREE.Group();
  const covers = [kit.mid, kit.dark, kit.accent, 0x6b4a35];
  let y = 0;
  for (let i = 0; i < n; i += 1) {
    const w = 0.62 - (i % 3) * 0.05;
    put(grp, box(w, 0.12, w * 0.72), stone(covers[i % covers.length]), [Math.sin(i * 2.3) * 0.07, y + 0.06, Math.cos(i * 1.9) * 0.07], [
      0,
      i * 0.42,
      0,
    ]);
    y += 0.13;
  }
  return grp;
}

/** 閱讀桌：攤開的書、一盞暖燈 —— 有人剛剛還坐在這。 */
function propReadingDesk(kit, { light = true } = {}) {
  const grp = new THREE.Group();
  put(grp, box(2.2, 0.12, 1.2), wood(), [0, 0.92, 0]);
  for (const [x, z] of [
    [-0.95, -0.45],
    [0.95, -0.45],
    [-0.95, 0.45],
    [0.95, 0.45],
  ]) {
    put(grp, box(0.12, 0.9, 0.12), wood(), [x, 0.45, z]);
  }
  put(grp, plane(0.75, 0.6), paper(), [-0.2, 1.0, 0], [-1.35, 0, 0.12]);
  put(grp, plane(0.75, 0.6), paper(), [0.55, 1.0, 0], [-1.35, 0, -0.12]);
  put(grp, ico(0.16, 0), glow(PALETTE.warm, 1.9), [0.85, 1.14, -0.35]);
  if (light) {
    const lamp = new THREE.PointLight(PALETTE.warm, 2.0, 8, 2);
    lamp.position.set(0.85, 1.3, -0.35);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  return grp;
}

/** 壁龕：一個拱、一盞燈、一疊沒收的書。 */
function propAlcove(kit, { light = true } = {}) {
  const grp = new THREE.Group();
  put(grp, box(3.0, 4.4, 0.5), stone(kit.dark), [0, 2.2, -0.7]);
  put(grp, torus(1.2, 0.28, 5, 16, Math.PI), stone(kit.mid), [0, 2.6, -0.4]);
  for (const x of [-1.35, 1.35]) put(grp, box(0.4, 2.6, 0.5), stone(kit.mid), [x, 1.3, -0.4]);
  put(grp, box(2.4, 0.16, 0.8), stone(kit.mid), [0, 1.15, -0.35]);
  put(grp, ico(0.2, 0), glow(PALETTE.warm, 2.0), [0, 2.1, -0.35]);
  if (light) {
    const lamp = new THREE.PointLight(PALETTE.warm, 2.6, 10, 2);
    lamp.position.set(0, 2.1, -0.2);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  bulky(grp.children[0]);
  return grp;
}

/** 卷軸架。 */
function propScrollRack(kit) {
  const grp = new THREE.Group();
  put(grp, box(2.2, 0.14, 0.7), wood(), [0, 1.5, 0]);
  put(grp, box(2.2, 0.14, 0.7), wood(), [0, 0.85, 0]);
  for (const x of [-1.0, 1.0]) put(grp, box(0.14, 1.7, 0.7), wood(), [x, 0.85, 0]);
  const im = new THREE.InstancedMesh(cyl(0.11, 0.11, 0.62, 6), paper(), 10);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 10; i += 1) {
    const row = i < 5 ? 1.62 : 0.97;
    mtx.makeTranslation(-0.72 + (i % 5) * 0.36, row, 0);
    im.setMatrixAt(i, mtx);
  }
  im.instanceMatrix.needsUpdate = true;
  grp.add(im);
  return grp;
}

/** 靠著書架的梯子。 */
function propLadder(kit) {
  const grp = new THREE.Group();
  const lean = new THREE.Group();
  lean.rotation.x = 0.34;
  grp.add(lean);
  for (const x of [-0.35, 0.35]) put(lean, box(0.1, 4.2, 0.1), wood(), [x, 2.1, 0]);
  const im = new THREE.InstancedMesh(box(0.8, 0.08, 0.08), wood(), 7);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 7; i += 1) {
    mtx.makeTranslation(0, 0.5 + i * 0.5, 0);
    im.setMatrixAt(i, mtx);
  }
  im.instanceMatrix.needsUpdate = true;
  lean.add(im);
  return grp;
}

/** 墨水台：一張矮桌、墨瓶、羽毛筆。 */
function propInkStand(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.55, 0.5, 0.12, 8), wood(), [0, 0.86, 0]);
  put(grp, cyl(0.14, 0.2, 0.86, 6), wood(), [0, 0.43, 0]);
  put(grp, cyl(0.13, 0.15, 0.2, 6), stone(kit.dark), [0.16, 1.02, 0.04]);
  put(grp, cone(0.05, 0.6, 4), paper(), [-0.1, 1.2, -0.05], [0.4, 0, 0.5]);
  return grp;
}

/* --- orchestration：把大事拆小的地方 -------------------------------- */

/** 拆到一半的機器：外框、兩顆齒輪、一根活塞。 */
function propMachineFrame(kit) {
  const grp = new THREE.Group();
  for (const [x, z] of [
    [-1.3, -0.8],
    [1.3, -0.8],
    [-1.3, 0.8],
    [1.3, 0.8],
  ]) {
    put(grp, box(0.18, 3.0, 0.18), metal(), [x, 1.5, z]);
  }
  put(grp, box(2.9, 0.18, 1.9), metal(), [0, 3.0, 0]);
  put(grp, box(2.9, 0.18, 1.9), metal(), [0, 0.12, 0]);
  put(grp, cyl(0.9, 0.9, 0.28, 9), stone(kit.mid), [-0.5, 1.7, 0], [Math.PI / 2, 0, 0]);
  put(grp, cyl(0.55, 0.55, 0.26, 8), stone(kit.dark), [0.75, 1.15, 0.1], [Math.PI / 2, 0, 0.3]);
  put(grp, cyl(0.14, 0.14, 1.6, 6), metal(), [0.9, 2.2, -0.4], [0.4, 0, 0.2]);
  bulky(grp);
  return grp;
}

/** 吊車：桅杆、吊臂、垂下來的鉤子。 */
function propCrane(kit, { h = 7.5, reach = 5 } = {}) {
  const grp = new THREE.Group();
  put(grp, box(1.6, 0.4, 1.6), stone(kit.dark), [0, 0.2, 0]);
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    put(grp, box(0.14, h, 0.14), metal(), [x, h / 2, z]);
  }
  const rungs = new THREE.InstancedMesh(box(1.1, 0.08, 0.08), metal(), 12);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 12; i += 1) {
    mtx.makeTranslation(0, 0.8 + i * 0.55, i % 2 ? 0.5 : -0.5);
    rungs.setMatrixAt(i, mtx);
  }
  rungs.instanceMatrix.needsUpdate = true;
  grp.add(rungs);
  const jib = put(grp, box(reach, 0.22, 0.3), metal(), [reach * 0.36, h, 0]);
  put(grp, box(1.0, 0.7, 0.7), stone(kit.dark), [-1.0, h, 0]);
  put(grp, cyl(0.03, 0.03, 2.6, 4), metal(), [reach * 0.72, h - 1.3, 0]);
  put(grp, torus(0.24, 0.07, 4, 10, Math.PI * 1.4), metal(), [reach * 0.72, h - 2.6, 0], [Math.PI / 2, 0, 0]);
  bulky(jib);
  bulky(grp);
  return grp;
}

/** 齒輪推車。 */
function propCogCart(kit) {
  const grp = new THREE.Group();
  put(grp, box(2.0, 0.7, 1.1), wood(), [0, 0.85, 0]);
  put(grp, box(1.9, 0.1, 1.0), stone(kit.dark), [0, 1.2, 0]);
  for (const [x, z] of [
    [-0.7, -0.6],
    [0.7, -0.6],
    [-0.7, 0.6],
    [0.7, 0.6],
  ]) {
    put(grp, cyl(0.45, 0.45, 0.16, 9), metal(), [x, 0.45, z], [0, 0, Math.PI / 2]);
  }
  put(grp, cyl(0.42, 0.42, 0.14, 9), stone(kit.mid), [0.2, 1.55, 0], [Math.PI / 2, 0, 0.3]);
  put(grp, cyl(0.3, 0.3, 0.14, 8), stone(kit.mid), [-0.45, 1.42, 0.2], [Math.PI / 2, 0, 0]);
  put(grp, cyl(0.07, 0.07, 1.4, 5), wood(), [1.2, 1.3, 0], [0, 0, 0.9]);
  return grp;
}

/** 工具架。 */
function propToolRack(kit) {
  const grp = new THREE.Group();
  put(grp, box(2.6, 2.2, 0.16), wood(), [0, 1.4, 0]);
  for (const x of [-1.2, 1.2]) put(grp, box(0.14, 2.6, 0.14), wood(), [x, 1.3, 0]);
  const tools = [
    [box(0.1, 0.9, 0.1), metal(), -0.85, 0.1],
    [cone(0.16, 0.5, 5), metal(), -0.3, -0.2],
    [box(0.35, 0.16, 0.16), metal(), 0.25, 0.15],
    [cyl(0.06, 0.06, 1.0, 5), wood(), 0.8, -0.1],
  ];
  for (const [geometry, material, x, r] of tools) {
    put(grp, geometry, material, [x, 1.5, 0.16], [0, 0, r]);
  }
  return grp;
}

/** 疊起來的箱子。 */
function propCrates(kit) {
  const grp = new THREE.Group();
  const sizes = [1.1, 0.9, 0.8];
  let y = 0;
  for (let i = 0; i < 3; i += 1) {
    const s = sizes[i];
    put(grp, box(s, s, s), wood(), [Math.sin(i * 2.2) * 0.16, y + s / 2, Math.cos(i * 1.6) * 0.16], [0, i * 0.5, 0]);
    y += s;
  }
  return grp;
}

/** 管線與閥門。 */
function propPipeRun(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.22, 0.22, 4.4, 8), metal(), [0, 0.9, 0], [0, 0, Math.PI / 2]);
  put(grp, cyl(0.22, 0.22, 2.0, 8), metal(), [2.2, 1.8, 0]);
  put(grp, torus(0.42, 0.09, 4, 12), metal(), [-1.4, 0.9, 0], [0, Math.PI / 2, 0]);
  put(grp, cyl(0.3, 0.3, 0.4, 8), stone(kit.dark), [0.4, 0.9, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1.9, 1.9]) put(grp, box(0.3, 0.9, 0.3), stone(kit.dark), [x, 0.45, 0]);
  return grp;
}

/** 鐵砧與槌子。 */
function propAnvil(kit) {
  const grp = new THREE.Group();
  put(grp, box(0.9, 0.5, 0.7), wood(), [0, 0.25, 0]);
  put(grp, box(0.85, 0.35, 0.55), metal(), [0, 0.67, 0]);
  put(grp, cone(0.2, 0.6, 5), metal(), [0.62, 0.72, 0], [0, 0, -Math.PI / 2]);
  put(grp, cyl(0.05, 0.05, 0.8, 5), wood(), [-0.25, 1.05, 0.2], [0.3, 0, 0.9]);
  put(grp, box(0.28, 0.16, 0.16), metal(), [-0.55, 1.24, 0.28], [0.3, 0, 0.9]);
  return grp;
}

/** 圖桌：斜面桌板 ＋ 一張攤開的圖 ＋ 一盞燈。 */
function propDraftTable(kit, { light = true } = {}) {
  const grp = new THREE.Group();
  put(grp, box(2.2, 0.1, 1.4), wood(), [0, 1.0, 0], [-0.32, 0, 0]);
  for (const [x, z] of [
    [-0.9, -0.5],
    [0.9, -0.5],
    [-0.9, 0.5],
    [0.9, 0.5],
  ]) {
    put(grp, box(0.1, 1.0, 0.1), wood(), [x, 0.5, z]);
  }
  put(grp, plane(1.7, 1.05), paper(), [0, 1.08, 0.02], [-1.89, 0, 0]);
  put(grp, ico(0.14, 0), glow(kit.accent, 1.7), [0.9, 1.5, -0.5]);
  if (light) {
    const lamp = new THREE.PointLight(kit.accent, 1.8, 8, 2);
    lamp.position.set(0.9, 1.6, -0.5);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  return grp;
}

/* --- config：換面具的地方 ------------------------------------------- */

/** 面具架。 */
function propMaskStand(kit, { h = 2.2 } = {}) {
  const grp = new THREE.Group();
  put(grp, cyl(0.45, 0.55, 0.2, 8), stone(kit.dark), [0, 0.1, 0]);
  put(grp, cyl(0.09, 0.12, h, 6), wood(), [0, h / 2, 0]);
  const mask = put(grp, ico(0.42, 0), glow(kit.accent, 0.6), [0, h + 0.2, 0.06], [0.2, 0, 0], [1, 1.25, 0.5]);
  put(mask, ico(0.06, 0), stone(0x0e1620), [-0.16, 0.06, 0.34]);
  put(mask, ico(0.06, 0), stone(0x0e1620), [0.16, 0.06, 0.34]);
  return grp;
}

/** 戲服架：一根橫桿 ＋ 幾件掛著的衣服。 */
function propCostumeRack(kit) {
  const grp = new THREE.Group();
  for (const x of [-1.3, 1.3]) put(grp, cyl(0.07, 0.09, 2.2, 5), metal(), [x, 1.1, 0]);
  put(grp, cyl(0.06, 0.06, 2.9, 5), metal(), [0, 2.15, 0], [0, 0, Math.PI / 2]);
  const colors = [kit.accent, kit.mid, 0xb0705c, kit.dark];
  for (let i = 0; i < 4; i += 1) {
    put(grp, cone(0.34, 1.5, 6), cloth(colors[i % colors.length]), [-0.95 + i * 0.63, 1.35, 0], [0, i * 0.6, 0]);
  }
  return grp;
}

/** 小舞台：台面 ＋ 兩根柱 ＋ 布幔框。 */
function propStageFrame(kit, { w = 5 } = {}) {
  const grp = new THREE.Group();
  put(grp, box(w, 0.4, 3.2), wood(), [0, 0.2, 0]);
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
    put(grp, box(0.3, 4.2, 0.3), wood(), [x, 2.3, -1.3]);
    put(grp, cone(0.7, 3.4, 5), cloth(kit.accent), [x > 0 ? x - 0.55 : x + 0.55, 2.5, -1.2], [0, 0, x > 0 ? -0.06 : 0.06]);
  }
  const beam = put(grp, box(w, 0.34, 0.34), wood(), [0, 4.3, -1.3]);
  bulky(beam);
  return grp;
}

/** 刻度碑：一只鼓 ＋ 一圈刻度 ＋ 一根指針。 */
function propDialMonument(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(1.1, 1.3, 1.6, 10), stone(kit.dark), [0, 0.8, 0]);
  put(grp, cyl(1.0, 1.0, 0.24, 12), stone(kit.mid), [0, 1.72, 0]);
  put(grp, torus(0.85, 0.09, 4, 18), glow(kit.accent, 0.7), [0, 1.86, 0], [Math.PI / 2, 0, 0]);
  const pointer = put(grp, box(0.1, 0.06, 0.9), glow(PALETTE.warm, 1.2), [0, 1.94, 0.35]);
  grp.userData.pointer = pointer;
  const im = new THREE.InstancedMesh(box(0.05, 0.05, 0.16), stone(kit.light), 12);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    p.set(Math.sin(a) * 0.72, 1.88, Math.cos(a) * 0.72);
    q.setFromEuler(new THREE.Euler(0, a, 0));
    im.setMatrixAt(i, mtx.compose(p, q, s));
  }
  im.instanceMatrix.needsUpdate = true;
  grp.add(im);
  return grp;
}

/** 立鏡：金屬面板，會把周圍的光糊糊地映出來。 */
function propMirrorPanel(kit, { h = 3.2 } = {}) {
  const grp = new THREE.Group();
  put(grp, box(1.7, 0.24, 0.7), stone(kit.dark), [0, 0.12, 0]);
  put(grp, box(1.6, h, 0.16), stone(kit.mid), [0, h / 2 + 0.2, 0], [0, 0, 0]);
  put(grp, plane(1.3, h - 0.5), water(kit.accent), [0, h / 2 + 0.2, 0.1]);
  return grp;
}

/** 道具箱：蓋子開著，東西掉出來一半。 */
function propPropTrunk(kit) {
  const grp = new THREE.Group();
  put(grp, box(1.8, 0.9, 1.0), wood(), [0, 0.45, 0]);
  put(grp, box(1.8, 0.14, 1.0), wood(), [0, 1.16, -0.5], [-1.1, 0, 0]);
  put(grp, ico(0.3, 0), glow(kit.accent, 0.4), [0.75, 0.25, 0.65], [0.4, 0.9, 0.2], [1, 1.2, 0.5]);
  put(grp, cone(0.24, 0.7, 5), cloth(kit.mid), [-0.7, 0.2, 0.6], [1.5, 0, 0.3]);
  return grp;
}

/** 譜架 / 台詞架。 */
function propScriptStand(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.06, 0.1, 1.5, 5), metal(), [0, 0.75, 0]);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    put(grp, cyl(0.04, 0.04, 0.5, 4), metal(), [Math.sin(a) * 0.18, 0.16, Math.cos(a) * 0.18], [0.5, a, 0]);
  }
  put(grp, box(0.9, 0.06, 0.6), metal(), [0, 1.55, 0], [-0.5, 0, 0]);
  put(grp, plane(0.7, 0.5), paper(), [0, 1.62, 0.04], [-0.5, 0, 0]);
  return grp;
}

/** 舞台燈：三腳架 ＋ 燈罩 ＋ 一道暖光。 */
function propSpotLamp(kit, { h = 2.6, light = true } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    put(grp, cyl(0.05, 0.05, h, 4), metal(), [Math.sin(a) * h * 0.16, h / 2, Math.cos(a) * h * 0.16], [
      Math.cos(a) * 0.32,
      0,
      -Math.sin(a) * 0.32,
    ]);
  }
  put(grp, cyl(0.36, 0.46, 0.7, 8), metal(), [0, h + 0.2, 0.1], [0.5, 0, 0]);
  put(grp, disc(0.34, 10), glow(PALETTE.warm, 2.3), [0, h - 0.05, 0.42], [0.5 - Math.PI / 2, 0, 0]);
  if (light) {
    const lamp = new THREE.PointLight(PALETTE.warm, 2.4, 12, 2);
    lamp.position.set(0, h + 0.1, 0.5);
    grp.add(lamp);
    grp.userData.flicker = lamp;
  }
  return grp;
}

/** 道具索引：vignette 用字串指定要放什麼。 */
const PROPS = {
  stele: propStele,
  shard: propObeliskShard,
  cairn: propCairn,
  firepit: propFirePit,
  seat: propStoneSeat,
  tea: propTeaSet,
  pool: propPool,
  signpost: propSignpost,
  stair: propStairFlight,
  floatsteps: propFloatSteps,
  thinker: propThinker,
  slate: propTallySlate,
  column: propColumnStub,
  scaffold: propScaffold,
  examples: propExamplePair,
  lamp: propLampPost,
  books: propBookPile,
  desk: propReadingDesk,
  alcove: propAlcove,
  scrolls: propScrollRack,
  ladder: propLadder,
  ink: propInkStand,
  machine: propMachineFrame,
  crane: propCrane,
  cart: propCogCart,
  tools: propToolRack,
  crates: propCrates,
  pipes: propPipeRun,
  anvil: propAnvil,
  drafttable: propDraftTable,
  mask: propMaskStand,
  costumes: propCostumeRack,
  stage: propStageFrame,
  dial: propDialMonument,
  mirror: propMirrorPanel,
  trunk: propPropTrunk,
  script: propScriptStand,
  spot: propSpotLamp,
};

/** 目前實作的道具種類 id（測試會檢查每區都有足夠的種類）。 */
export const PROP_KINDS = Object.freeze(Object.keys(PROPS));

/**
 * 走不過去的道具 → 碰撞半徑（公尺）。
 *
 * 只列「站在地上、真的擋得住人」的東西：書架、桌子、機具、立石…。
 * 沒列到的（水塘、地上的茶具、飄浮的階梯、低矮管線）刻意讓玩家走得過去 ——
 * 碰撞是為了讓世界有實體感，不是為了讓人被卡住。
 */
export const PROP_SOLID_RADIUS = Object.freeze({
  stele: 0.85,
  shard: 1.0,
  cairn: 0.62,
  firepit: 0.9,
  seat: 0.7,
  signpost: 0.65,
  thinker: 0.75,
  slate: 0.8,
  column: 0.85,
  scaffold: 1.3,
  examples: 0.8,
  lamp: 0.62,
  books: 0.75,
  desk: 1.1,
  alcove: 1.4,
  scrolls: 1.1,
  ladder: 0.7,
  ink: 0.62,
  machine: 1.5,
  crane: 1.4,
  cart: 0.95,
  tools: 1.0,
  crates: 1.0,
  anvil: 0.7,
  drafttable: 1.1,
  mask: 0.62,
  costumes: 1.0,
  stage: 1.6,
  dial: 1.2,
  mirror: 0.85,
  trunk: 0.9,
  script: 0.65,
  spot: 0.62,
});

/**
 * 地標腳下的碰撞體：[dx, dz, r]（相對地標中心）。走得到底下、繞得過柱子。
 *
 * Phase 20 補上臺座：三座地標腳下都有一圈一公尺多高的石臺，
 * 原本只登記了柱子，玩家整個人是**陷在石臺裡**走過去的。
 * 半徑取「腰部高度的實際外框」（臺座上窄下寬，取上緣），
 * 這樣站在臺邊時腳尖剛好抵著石頭，不會憑空停在半空中。
 */
export const LANDMARK_SOLIDS = Object.freeze({
  'broken-ring': [
    [0, 0, 5.4], // 臺座 cyl(5.2, 6.4, 1.4)
    [-4.6, 0, 1.3],
    [4.6, 0, 1.3],
    [-6.6, 2.6, 0.9], // 斜靠著的那根方尖碑
  ],
  'endless-stair': [
    [0, 0, 4.6], // 臺座 cyl(4.4, 5.4, 1.2)（同時蓋住最低的幾階）
    [0, 0, 2.4],
  ],
  'great-tree': [
    [0, 0, 2.6],
    // 五條板根 cyl(0.6, 1.4, 3.2)：站在離樹心 3 公尺的地方，一人多高。
    // Phase 20 之前只登記了樹幹，玩家是從板根中間穿過去的。
    [3.0, 0, 1.4],
    [0.93, 2.85, 1.4],
    [-2.43, 1.76, 1.4],
    [-2.43, -1.76, 1.4],
    [0.93, -2.85, 1.4],
  ],
  'great-crane': [
    [0, 0, 5.2], // 臺座 cyl(5.0, 6.0, 1.4)
    [0, 0, 2.4],
    // 立起來的大齒輪 cyl(4.2, 4.2, 0.8) 轉了 90°：一片 8.4 公尺高的輪盤靠在臺座旁邊。
    // 它薄（0.8）但很高，用三個小圓沿著輪面排，形狀才跟看到的一樣。
    [-7.5, 0.1, 1.3],
    [-7.5, 2.5, 1.3],
    [-7.5, 4.9, 1.3],
  ],
  'mask-arch': [
    [-5.6, 0, 1.6],
    [5.6, 0, 1.6],
  ],
  // 刻度之柱：臺座 cyl(4.6, 5.6, 1.3) ＋ 方柱 box(3.2, 15.4, 3.2)。
  // 柱頂那把尺懸在 20.8 公尺高，走得過去（也走不到），不登記。
  'gauge-column': [
    [0, 0, 4.8],
    [0, 0, 2.3],
  ],
});

/* ------------------------------------------------------------------ *
 * 故事小景（vignette）：位置與組成都是手工排的，因為「成組」才有敘事
 * ------------------------------------------------------------------ */
/**
 * 每個 vignette：
 *   at    世界座標 [x, z]（已驗證：不壓石座、不擋路、站得住）
 *   rot   整組的朝向
 *   parts 道具清單 [kind, [dx, dy, dz], rotY, options]
 */
export const STORY_VIGNETTES = Object.freeze([
  /* --- foundations：學會把話說清楚 --- */
  {
    id: 'carve-yard',
    region: 'foundations',
    name: '刻到一半的碑林',
    at: [-16, -38],
    rot: 0.4,
    parts: [
      ['stele', [-2.6, 0, 0.4], 0.1, { h: 3.4, seed: 1 }],
      ['stele', [0, 0, -0.4], -0.05, { h: 3.0, seed: 2 }],
      ['stele', [2.7, 0, 0.6], 0.22, { h: 2.6, seed: 3, tilt: 0.13 }],
      ['shard', [5.4, 0, -1.6], 0.6, { len: 3.2, seed: 2 }],
      ['cairn', [-4.6, 0, -2.4], 0, {}],
      ['lamp', [4.2, 0, 2.8], 0, { h: 3.2, intensity: 2.2 }],
    ],
  },
  {
    id: 'tea-circle',
    region: 'foundations',
    name: '沒說完的那場話',
    at: [22, 44],
    rot: -0.7,
    parts: [
      ['seat', [0, 0, 1.9], Math.PI, {}],
      ['seat', [0, 0, -1.9], 0, {}],
      ['tea', [0, 0, 0], 0.3, {}],
      ['firepit', [3.4, 0, 0.6], 0, {}],
      ['cairn', [-3.2, 0, -1.4], 0, {}],
    ],
  },
  {
    id: 'first-words-pool',
    region: 'foundations',
    name: '初語之池',
    at: [-40, 12],
    rot: 0.9,
    parts: [
      ['pool', [0, 0, 0], 0, { r: 3.4 }],
      ['stele', [-6.0, 0, 1.6], 0.9, { h: 3.6, seed: 5 }],
      ['stele', [5.9, 0, -1.9], -1.1, { h: 3.0, seed: 6, tilt: 0.1 }],
      ['cairn', [1.2, 0, 4.6], 0, {}],
      ['lamp', [-3.4, 0, -3.8], 0, { h: 3.6, light: false }],
    ],
  },
  {
    id: 'watch-camp',
    region: 'foundations',
    name: '守望者的營地',
    at: [44, 8],
    rot: 2.1,
    parts: [
      ['firepit', [0, 0, 0], 0, {}],
      ['seat', [2.3, 0, 0.8], -1.9, {}],
      ['signpost', [-3.0, 0, -1.6], 0.4, {}],
      ['crates', [3.0, 0, -2.4], 0.5, {}],
      ['shard', [-4.6, 0, 2.6], 1.2, { len: 2.6, seed: 4 }],
    ],
  },

  /* --- reasoning：一步一步想 --- */
  {
    id: 'unfinished-thinker',
    region: 'reasoning',
    name: '沒刻完的思考者',
    at: [-108, -113],
    rot: 0.8,
    parts: [
      ['thinker', [0, 0, 0], 0, {}],
      ['scaffold', [3.4, 0, 0.6], 0.2, { w: 2.6, h: 4.6 }],
      ['column', [-3.6, 0, 1.4], 0, { h: 2.2 }],
      ['slate', [-2.2, 0, -3.0], 0.7, { marks: 13 }],
      ['lamp', [4.0, 0, -3.2], 0, { h: 3.4, intensity: 2.2 }],
    ],
  },
  {
    id: 'stair-to-nowhere',
    region: 'reasoning',
    name: '走不到盡頭的階梯',
    at: [-78, -88],
    rot: -0.5,
    parts: [
      ['stair', [0, 0, -2.4], 0, { steps: 8 }],
      ['floatsteps', [0.4, 3.4, 3.4], 0.1, { n: 9 }],
      ['column', [-3.4, 0, -0.6], 0, { h: 3.0 }],
      ['slate', [3.6, 0, -1.8], -0.5, { marks: 9 }],
      ['cairn', [-2.4, 0, 3.2], 0, {}],
    ],
  },
  {
    id: 'example-pair',
    region: 'reasoning',
    name: '示範的兩張牌',
    at: [-112, -88],
    rot: 1.4,
    parts: [
      ['examples', [0, 0, 0], 0, {}],
      ['slate', [-3.4, 0, 1.6], 0.4, { marks: 6 }],
      ['floatsteps', [3.2, 1.2, -1.0], -0.8, { n: 6 }],
      ['lamp', [-3.0, 0, -2.8], 0, { h: 3.0, light: false }],
      ['column', [3.8, 0, 2.4], 0, { h: 2.4 }],
    ],
  },

  /* --- grounding：先讀再答 --- */
  {
    id: 'reading-nook',
    region: 'grounding',
    name: '沒收的閱讀角',
    at: [105, -110],
    rot: -0.9,
    parts: [
      ['desk', [0, 0, 0], 0, {}],
      ['books', [-1.6, 0, 1.2], 0.4, { n: 7 }],
      ['books', [1.9, 0, 1.0], -0.3, { n: 4 }],
      ['ladder', [-3.4, 0, -1.6], 0.6, {}],
      ['scrolls', [3.4, 0, -1.4], -0.6, {}],
    ],
  },
  {
    id: 'well-of-questions',
    region: 'grounding',
    name: '問題之井旁',
    at: [84, -110],
    rot: 0.6,
    parts: [
      ['pool', [0, 0, 0], 0, { r: 2.6 }],
      ['alcove', [0, 0, -4.6], 0, {}],
      ['books', [2.6, 0, 1.6], 0.2, { n: 5 }],
      ['ink', [-2.8, 0, 1.4], -0.4, {}],
      ['cairn', [3.4, 0, -2.2], 0, {}],
    ],
  },
  {
    id: 'ink-desk',
    region: 'grounding',
    name: '抄書人的桌子',
    at: [95, -77],
    rot: 2.4,
    parts: [
      ['desk', [0, 0, 0], 0.2, {}],
      ['ink', [1.9, 0, 0.6], 0, {}],
      ['scrolls', [-3.2, 0, -0.4], 0.5, {}],
      ['books', [0.4, 0, 2.2], -0.5, { n: 6 }],
      ['ladder', [3.6, 0, -2.4], -0.9, {}],
    ],
  },

  /* --- orchestration：把大事拆小 --- */
  {
    id: 'half-built-engine',
    region: 'orchestration',
    name: '拆到一半的機器',
    at: [-110, 105],
    rot: 0.5,
    parts: [
      ['machine', [0, 0, 0], 0, {}],
      ['tools', [-3.8, 0, 0.6], 1.4, {}],
      ['crates', [3.4, 0, 1.6], 0.3, {}],
      ['anvil', [2.6, 0, -2.4], -0.5, {}],
      ['pipes', [-1.4, 0, 4.0], 0.2, {}],
      ['lamp', [-4.4, 0, -3.4], 0, { h: 3.6, intensity: 2.4 }],
    ],
  },
  {
    id: 'tool-yard',
    region: 'orchestration',
    name: '交接到一半的工地',
    at: [-80, 105],
    rot: -1.1,
    parts: [
      ['crane', [0, 0, 0], 0, { h: 7.0, reach: 4.6 }],
      ['cart', [3.6, 0, 2.0], 0.7, {}],
      ['crates', [-3.2, 0, 2.4], -0.4, {}],
      ['tools', [-3.6, 0, -1.6], 0.9, {}],
      ['lamp', [3.2, 0, -2.8], 0, { h: 3.4, intensity: 2.2 }],
    ],
  },
  {
    id: 'draft-yard',
    region: 'orchestration',
    name: '不可逆的那扇門前',
    at: [-95, 128],
    rot: Math.PI,
    parts: [
      ['drafttable', [0, 0, 0], 0, {}],
      ['pipes', [4.2, 0, -1.0], 1.5, {}],
      ['cart', [-3.8, 0, 1.2], -0.6, {}],
      ['anvil', [-2.0, 0, -2.6], 0.4, {}],
      ['crates', [3.0, 0, 2.6], 0.2, {}],
    ],
  },

  /* --- config：換面具 --- */
  {
    id: 'dressing-corner',
    region: 'config',
    name: '後台的更衣角',
    at: [80, 106],
    rot: 1.2,
    parts: [
      ['costumes', [0, 0, 0], 0, {}],
      ['mask', [2.6, 0, 1.2], -0.4, { h: 2.0 }],
      ['mask', [3.6, 0, -0.6], 0.5, { h: 2.4 }],
      ['trunk', [-2.8, 0, 1.4], 0.3, {}],
      ['script', [-2.2, 0, -2.2], -0.6, {}],
      ['lamp', [3.0, 0, -3.6], 0, { h: 3.2, intensity: 2.2 }],
    ],
  },
  {
    id: 'mirror-walk',
    region: 'config',
    name: '照見自己的一排鏡',
    at: [110, 105],
    rot: -0.6,
    parts: [
      ['mirror', [-2.4, 0, 0], 0.3, { h: 3.2 }],
      ['mirror', [0.2, 0, -0.6], 0, { h: 3.6 }],
      ['mirror', [2.8, 0, 0.2], -0.3, { h: 2.8 }],
      ['dial', [0, 0, 3.8], 0, {}],
      ['spot', [-3.8, 0, 2.8], 0, { h: 2.8 }],
    ],
  },
  /* --- forms：把話倒進模子裡（課程 v2 · Phase E） --- */
  {
    id: 'half-poured-mould',
    region: 'forms',
    name: '倒到一半的那一模',
    at: [-24, 112],
    rot: 0.5,
    parts: [
      ['anvil', [0, 0, 0], 0, {}],
      ['crates', [3.4, 0, 1.8], 0.3, {}],
      ['tools', [-3.0, 0, 1.4], -0.5, {}],
      ['slate', [2.2, 0, -2.6], 0.2, { marks: 7 }],
      ['cairn', [-3.8, 0, -2.2], 0, {}],
    ],
  },
  {
    id: 'measure-bench',
    region: 'forms',
    name: '量過就沒再量的桌',
    at: [26, 116],
    rot: -0.9,
    parts: [
      ['desk', [0, 0, 0], 0, { light: false }],
      ['ink', [1.6, 0.4, 0.8], 0.4, {}],
      ['dial', [-4.2, 0, 1.6], 0.6, {}],
      ['column', [4.4, 0, -1.8], 0, { h: 2.4 }],
      ['lamp', [-2.4, 0, -3.4], 0, { h: 3.2, light: false }],
    ],
  },
  {
    id: 'overflow-trough',
    region: 'forms',
    name: '溢出來的那一槽',
    at: [4, 152],
    rot: 1.4,
    parts: [
      ['pool', [0, 0, 0], 0, { r: 3.0 }],
      ['column', [-5.2, 0, 1.4], 0.2, { h: 2.8 }],
      ['slate', [4.6, 0, -1.2], -0.4, { marks: 13 }],
      ['shard', [3.0, 0, 3.4], 0.8, { len: 3.0, seed: 4 }],
      ['cairn', [-2.6, 0, -3.8], 0, {}],
    ],
  },

  /* --- toolcraft：替神諭打造它的手（課程 v2 · Phase F） --- */
  {
    id: 'nameless-tools',
    region: 'toolcraft',
    name: '沒有人替它取名字的那一把',
    at: [-108, -22],
    rot: 0.6,
    parts: [
      ['anvil', [0, 0, 0], 0, {}],
      ['tools', [3.2, 0, 1.6], -0.4, {}],
      ['slate', [-2.8, 0, 2.2], 0.3, { marks: 5 }],
      ['crates', [-3.6, 0, -2.4], 0.2, {}],
      ['cairn', [3.0, 0, -3.2], 0, {}],
    ],
  },
  {
    id: 'crowded-bench',
    region: 'toolcraft',
    name: '擺到放不下的那張檯',
    at: [-140, 20],
    rot: -1.1,
    parts: [
      ['drafttable', [0, 0, 0], 0, {}],
      ['tools', [-3.4, 0, 1.2], 0.5, {}],
      ['crates', [3.6, 0, 0.8], -0.2, {}],
      ['cart', [1.4, 0, -4.0], 0.7, {}],
      ['lamp', [-4.2, 0, -2.6], 0, { h: 3.4, light: false }],
    ],
  },
  {
    id: 'untouched-machine',
    region: 'toolcraft',
    name: '沒有人敢動的那一台',
    at: [-124, 32],
    rot: 2.3,
    parts: [
      ['machine', [0, 0, 0], 0, {}],
      ['pipes', [3.8, 0, 1.4], 0.4, {}],
      ['signpost', [-4.0, 0, 1.8], -0.5, {}],
      ['firepit', [-2.2, 0, -3.6], 0, { light: false }],
      ['column', [4.2, 0, -2.8], 0, { h: 2.6 }],
    ],
  },
  /* --- wards：外面來的字也是指令（課程 v2 · Phase F） --- */
  {
    id: 'opened-letters',
    region: 'wards',
    name: '被拆開讀過的那幾封',
    at: [106.9, -129.3],
    rot: 0.8,
    parts: [
      ['desk', [0, 0, 0], 0, { light: false }],
      ['scrolls', [3.0, 0, 1.2], -0.3, {}],
      ['ink', [1.2, 0.4, 0.6], 0.5, {}],
      ['seat', [-2.6, 0, 1.8], 0.2, {}],
      ['lamp', [-3.4, 0, -2.4], 0, { h: 3.0, light: false }],
    ],
  },
  {
    id: 'unwatched-post',
    region: 'wards',
    name: '沒有人在的那個崗',
    at: [90.3, -133],
    rot: -0.7,
    parts: [
      ['signpost', [0, 0, 0], 0, {}],
      ['cairn', [3.2, 0, 1.6], 0, {}],
      ['stele', [-3.0, 0, 1.4], 0.2, { h: 2.8, seed: 9, tilt: 0.08 }],
      ['firepit', [0.6, 0, -3.4], 0, { light: false }],
      ['column', [-3.8, 0, -2.6], 0, { h: 2.2 }],
    ],
  },

  /* --- refinery：改 prompt 的 prompt（課程 v2 · Phase G） --- */
  {
    id: 'ten-drafts',
    region: 'refinery',
    name: '改到第十版的那一疊',
    at: [-121.2, 142.4],
    rot: 0.5,
    parts: [
      ['desk', [0, 0, 0], 0, { light: false }],
      ['scrolls', [3.0, 0, 1.4], -0.3, {}],
      ['ink', [1.1, 0.4, 0.5], 0.4, {}],
      ['crates', [-3.4, 0, -2.2], 0.2, {}],
      ['seat', [-2.6, 0, 1.8], 0.2, {}],
    ],
  },
  {
    id: 'facing-mirrors',
    region: 'refinery',
    name: '照著照著就沒有人看的兩面',
    at: [-144.4, 127.6],
    rot: -0.9,
    parts: [
      ['mirror', [-2.4, 0, 0], 0.25, { h: 3.2 }],
      ['mirror', [2.4, 0, 0], Math.PI - 0.25, { h: 3.2 }],
      ['stele', [0, 0, -3.4], 0.1, { h: 2.4, seed: 11, tilt: 0.06 }],
      ['cairn', [4.2, 0, 2.4], 0, {}],
    ],
  },
  {
    id: 'unread-checklist',
    region: 'refinery',
    name: '只蓋了章的那張檢查表',
    at: [-142.6, 103.3],
    rot: 1.8,
    parts: [
      ['drafttable', [0, 0, 0], 0, {}],
      ['slate', [-3.2, 0, 1.6], 0.4, { marks: 6 }],
      ['signpost', [3.6, 0, 1.2], -0.4, {}],
      ['column', [-4.0, 0, -2.8], 0, { h: 2.4 }],
    ],
  },

  /* --- frugality：學會拿掉（課程 v2 · Phase H） --- */
  {
    id: 'moved-out',
    region: 'frugality',
    name: '搬走之後留下的那一格',
    at: [-12.8, -77.3],
    rot: 0.6,
    parts: [
      ['crates', [0, 0, 0], 0, {}],
      ['slate', [3.2, 0, 1.4], -0.3, { marks: 3 }],
      ['column', [-3.6, 0, -2.4], 0, { h: 2.0 }],
      ['cairn', [3.8, 0, -2.6], 0, {}],
    ],
  },
  {
    id: 'said-three-times',
    region: 'frugality',
    name: '同一句話寫了三遍的那一卷',
    at: [-4.7, -94.8],
    rot: -0.8,
    parts: [
      ['desk', [0, 0, 0], 0, { light: false }],
      ['scrolls', [2.9, 0, 1.3], 0.4, {}],
      ['scrolls', [-2.9, 0, 1.1], -0.4, {}],
      ['ink', [1.0, 0.4, 0.4], 0.2, {}],
    ],
  },
  {
    id: 'stale-tray',
    region: 'frugality',
    name: '沒有人再看的那一疊托盤',
    at: [12.8, -86.7],
    rot: 2.1,
    parts: [
      ['drafttable', [0, 0, 0], 0, {}],
      ['crates', [-3.4, 0, 1.8], 0.3, {}],
      ['signpost', [3.6, 0, 1.0], -0.5, {}],
      ['slate', [2.4, 0, -2.8], 0.6, { marks: 4 }],
    ],
  },

  {
    id: 'little-stage',
    region: 'config',
    name: '只演給自己看的小舞台',
    at: [95, 128],
    rot: Math.PI,
    parts: [
      ['stage', [0, 0, 0], 0, { w: 5.4 }],
      ['spot', [-4.0, 0, 2.6], 0, { h: 3.0 }],
      ['spot', [4.0, 0, 2.6], 0, { h: 3.0, light: false }],
      ['script', [0, 0.4, 0.6], 0, {}],
      ['mask', [3.4, 0, -1.6], -0.5, { h: 2.2 }],
    ],
  },
]);

/* ------------------------------------------------------------------ *
 * 地標（landmark / weenie）：每區一個從中央高原就看得到的大剪影
 * ------------------------------------------------------------------ */
export const LANDMARKS = Object.freeze([
  { id: 'broken-ring', region: 'foundations', name: '斷環', at: [34, -30], height: 21, clear: 15 },
  { id: 'endless-stair', region: 'reasoning', name: '無盡階梯塔', at: [-95, -95], height: 26, clear: 16 },
  { id: 'great-tree', region: 'grounding', name: '藏書之樹', at: [95, -95], height: 25, clear: 16 },
  { id: 'great-crane', region: 'orchestration', name: '巨臂吊車', at: [-95, 95], height: 27, clear: 16 },
  { id: 'mask-arch', region: 'config', name: '面具拱門', at: [95, 95], height: 22, clear: 16 },
  // 課程 v2 · Phase E：量器坊的地標（curriculum-v2 §二：「一根被刻滿量度的斷柱，柱頂懸著一把不動的尺」）
  { id: 'gauge-column', region: 'forms', name: '刻度之柱', at: [0, 124], height: 24, clear: 15 },
  // 課程 v2 · Phase F：契約鍛冶場（§二：「半空中一圈懸浮的鑰匙，每一把都沒有刻名字」）
  { id: 'nameless-keys', region: 'toolcraft', name: '未命名的工具', at: [-124, 0], height: 23, clear: 15 },
  // 課程 v2 · Phase F：護欄崗（§二：「一道永遠留一條縫的雙層門」）
  { id: 'ajar-doors', region: 'wards', name: '不會關上的門', at: [101, -142], height: 19, clear: 13 },
  // 課程 v2 · Phase G：校驗場（§二：「兩面互相對照的鏡」）
  { id: 'facing-glass', region: 'refinery', name: '會回頭照自己的鏡', at: [-129, 129], height: 20, clear: 14 },
  // 課程 v2 · Phase H：減法之庭（§二：「一座什麼都沒放的基座，銘文寫著被拿走的東西」）
  { id: 'empty-plinth', region: 'frugality', name: '空的基座', at: [0, -82], height: 18, clear: 13 },
]);

/** 斷環：一圈立起來的巨石環，缺了一角 —— 「有人試著把話說圓，還差一塊」。 */
function landmarkBrokenRing(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(5.2, 6.4, 1.4, 10), stone(kit.dark), [0, 0.7, 0]);
  const ring = put(
    grp,
    torus(7.4, 0.85, 6, 26, Math.PI * 1.55),
    stone(kit.mid),
    [0, 9.4, 0],
    [0, 0, Math.PI * 0.28]
  );
  bulky(ring);
  put(grp, torus(7.4, 0.5, 5, 10, Math.PI * 0.22), glow(kit.accent, 1.5), [0, 9.4, 0], [0, 0, -Math.PI * 0.36]);
  for (const side of [-1, 1]) {
    bulky(put(grp, cyl(0.9, 1.3, 8.0, 6), stone(kit.mid), [side * 4.6, 4.4, 0], [0, 0, side * -0.05]));
  }
  bulky(put(grp, cone(1.1, 9.0, 4), stone(kit.dark), [-7.0, 3.6, 3.4], [0.28, 0.6, 0.22]));
  return grp;
}

/** 無盡階梯塔：繞著一根柱子往上盤旋的石階，最後一階什麼也沒接到。 */
function landmarkEndlessStair(kit) {
  const grp = new THREE.Group();
  bulky(put(grp, cyl(1.5, 2.4, 24, 8), stone(kit.dark), [0, 12, 0]));
  put(grp, cyl(4.4, 5.4, 1.2, 10), stone(kit.dark), [0, 0.6, 0]);
  const n = 34;
  const steps = new THREE.InstancedMesh(box(3.4, 0.34, 1.5), stone(kit.mid), n);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i += 1) {
    const a = i * 0.52;
    const r = 3.4;
    p.set(Math.cos(a) * r, 1.4 + i * 0.66, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler(0, -a, 0));
    steps.setMatrixAt(i, mtx.compose(p, q, s));
  }
  steps.instanceMatrix.needsUpdate = true;
  grp.add(bulky(steps));
  put(grp, ico(0.9, 0), glow(kit.accent, 2.4), [0, 25.2, 0]);
  put(grp, torus(1.7, 0.16, 4, 16), glow(kit.accent, 1.6), [0, 24.4, 0], [Math.PI / 2, 0, 0]);
  return grp;
}

/** 藏書之樹：長滿書頁的巨樹。夜裡書頁會慢慢閃。 */
function landmarkGreatTree(kit) {
  const grp = new THREE.Group();
  bulky(put(grp, cyl(1.3, 3.4, 13, 8), wood(), [0, 6.5, 0]));
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    put(grp, cyl(0.35, 0.7, 5.5, 5), wood(), [Math.cos(a) * 2.2, 10.5, Math.sin(a) * 2.2], [
      Math.sin(a) * 0.55,
      0,
      -Math.cos(a) * 0.55,
    ]);
    put(grp, cyl(0.6, 1.4, 3.2, 5), wood(), [Math.cos(a) * 3.0, 1.2, Math.sin(a) * 3.0], [
      Math.sin(a) * 0.9,
      0,
      -Math.cos(a) * 0.9,
    ]);
  }
  const canopy = stone(kit.mid);
  put(grp, ico(5.4, 1), canopy, [0, 17.5, 0], [0, 0.4, 0], [1, 0.8, 1]);
  put(grp, ico(3.8, 1), canopy, [-4.2, 15.2, 1.4], [0.3, 1.1, 0]);
  put(grp, ico(3.4, 1), canopy, [4.0, 15.8, -1.6], [0, 0.6, 0.2]);
  // 書頁：在樹冠裡飄的小平面（instanced）
  const n = 46;
  const leaves = new THREE.InstancedMesh(plane(0.85, 1.15), paper(), n);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i += 1) {
    const a = i * 2.399;
    const r = 3.6 + ((i * 7) % 5) * 0.9;
    p.set(Math.cos(a) * r, 13.5 + ((i * 3) % 8) * 0.85, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler(i * 0.7, a, i * 0.4));
    leaves.setMatrixAt(i, mtx.compose(p, q, s));
  }
  leaves.instanceMatrix.needsUpdate = true;
  grp.add(leaves);
  grp.userData.leaves = leaves;
  put(grp, ico(0.8, 0), glow(PALETTE.warm, 2.2), [0, 12.6, 3.2]);
  put(grp, cyl(0.04, 0.04, 3.0, 4), wood(), [0, 14.3, 3.2]);
  return grp;
}

/** 巨臂吊車：吊了一半的東西還掛在鉤上。 */
function landmarkGreatCrane(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(5.0, 6.0, 1.4, 10), stone(kit.dark), [0, 0.7, 0]);
  const h = 22;
  for (const [x, z] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ]) {
    bulky(put(grp, box(0.45, h, 0.45), metal(), [x, h / 2 + 1, z]));
  }
  const rungs = new THREE.InstancedMesh(box(3.6, 0.2, 0.2), metal(), 24);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 24; i += 1) {
    const y = 2.5 + Math.floor(i / 2) * 1.7;
    p.set(0, y, i % 2 ? 1.6 : -1.6);
    q.setFromEuler(new THREE.Euler(0, 0, 0));
    rungs.setMatrixAt(i, mtx.compose(p, q, s));
  }
  rungs.instanceMatrix.needsUpdate = true;
  grp.add(rungs);
  const jib = put(grp, box(17, 0.7, 0.9), metal(), [5.5, h + 1.6, 0], [0, 0, 0.04]);
  bulky(jib);
  put(grp, box(3.0, 2.2, 2.2), stone(kit.dark), [-4.0, h + 1.6, 0]);
  put(grp, cyl(0.08, 0.08, 7.0, 4), metal(), [11.6, h - 2.2, 0]);
  const load = put(grp, box(2.4, 2.0, 2.0), stone(kit.mid), [11.6, h - 6.4, 0], [0, 0.4, 0]);
  grp.userData.load = load;
  put(grp, ico(0.7, 0), glow(PALETTE.warm, 2.4), [11.6, h + 0.9, 0]);
  put(grp, torus(1.2, 0.14, 4, 14), glow(kit.accent, 1.4), [-4.0, h + 1.6, 1.3], [Math.PI / 2, 0, 0]);
  const gear = put(grp, cyl(4.2, 4.2, 0.8, 12), stone(kit.mid), [-7.5, 4.2, 2.5], [0, 0, Math.PI / 2]);
  grp.userData.gear = gear;
  return grp;
}

/** 面具拱門：兩根柱撐著一張巨大的面具，底下是入口。 */
function landmarkMaskArch(kit) {
  const grp = new THREE.Group();
  for (const side of [-1, 1]) {
    bulky(put(grp, box(2.6, 15, 2.6), stone(kit.mid), [side * 5.6, 7.5, 0]));
    put(grp, box(3.2, 0.8, 3.2), stone(kit.dark), [side * 5.6, 0.4, 0]);
    put(grp, cone(1.0, 2.6, 6), cloth(kit.accent), [side * 4.0, 11.5, 0], [0, 0, side * -0.05]);
  }
  const lintel = put(grp, box(15, 1.8, 3.0), stone(kit.dark), [0, 15.6, 0]);
  bulky(lintel);
  const mask = put(grp, ico(3.6, 1), glow(kit.accent, 1.05), [0, 18.6, 0.4], [0.16, 0, 0], [1, 1.25, 0.6]);
  put(mask, ico(0.5, 0), stone(0x0d1520), [-1.35, 0.5, 2.6]);
  put(mask, ico(0.5, 0), stone(0x0d1520), [1.35, 0.5, 2.6]);
  put(grp, torus(2.4, 0.3, 5, 18), glow(PALETTE.warm, 1.5), [0, 18.6, -1.2], [Math.PI / 2, 0, 0]);
  return grp;
}

/**
 * 刻度之柱：一根被刻滿量度的斷柱，柱頂懸著一把不動的尺。
 *
 * 抄寫人量過所有東西，最後量到自己頭上 —— 柱子斷在還沒刻完的那一格，
 * 那把尺卻還停在半空，指著一個沒有人再讀得到的刻度。
 * 只有臺座與柱身擋人；尺是懸空的（下緣離地 17 公尺，遠高於 FLOAT_MIN）。
 */
function landmarkGaugeColumn(kit) {
  const grp = new THREE.Group();
  // 臺座
  put(grp, cyl(4.6, 5.6, 1.3, 8), stone(kit.dark), [0, 0.65, 0]);
  put(grp, cyl(3.4, 4.0, 0.5, 8), stone(kit.mid), [0, 1.55, 0]);

  // 斷柱：方柱，上緣削掉一角 —— 剪影看得出「斷在半路」
  const shaft = put(grp, box(3.2, 15.4, 3.2), stone(kit.mid), [0, 9.5, 0]);
  bulky(shaft);
  put(grp, box(3.3, 1.4, 1.6), stone(kit.dark), [0, 17.0, 0.85], [0.34, 0, 0]);

  // 柱身上的刻度：一格一格往上，越高越短（instanced —— 重複元素不各自建 mesh）
  const marks = 15;
  const tick = new THREE.InstancedMesh(box(3.44, 0.16, 0.18), glow(kit.accent, 1.15), marks * 2);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let i = 0; i < marks; i += 1) {
    const t = (i + 1) / (marks + 1);
    const y = 2.4 + t * 14.0;
    const w = 1 - t * 0.5;
    for (const face of [0, Math.PI / 2]) {
      p.set(0, y, 0);
      q.setFromEuler(new THREE.Euler(0, face, 0));
      s.set(w, 1, 1);
      tick.setMatrixAt(n, mtx.compose(p, q, s));
      n += 1;
    }
  }
  tick.count = n;
  tick.instanceMatrix.needsUpdate = true;
  grp.add(tick);

  // 柱頂懸著的那把尺：不動、發著微光、比柱子寬很多（所以遠遠就認得出這是量器坊）
  put(grp, box(14.5, 0.55, 1.1), stone(kit.light), [0, 20.8, 0], [0, 0, 0.035]);
  put(grp, box(14.6, 0.14, 0.16), glow(kit.accent, 1.5), [0, 20.5, 0.6], [0, 0, 0.035]);
  for (const side of [-1, 1]) {
    put(grp, box(0.5, 1.5, 0.5), stone(kit.dark), [side * 6.6, 21.6, 0]);
  }
  // 尺尖上的一點暖光 —— 全區唯一的暖金熱點（成就色留給它）
  put(grp, ico(0.55, 0), glow(PALETTE.warm, 2.0), [0, 22.9, 0]);
  put(grp, torus(1.9, 0.16, 4, 16), glow(kit.accent, 1.2), [0, 20.8, 0], [Math.PI / 2, 0, 0]);
  return grp;
}

/**
 * 未命名的工具：半空中一圈懸浮的鑰匙，每一把都沒有刻名字。
 *
 * 抄寫人替神諭打了一整圈的手，卻沒有一把寫得出「什麼時候該用我」——
 * 所以它們就一直懸在那裡，誰也不知道該伸手拿哪一把。
 * 只有臺座與中央的柱擋人；鑰匙全部懸空（下緣離地 11 公尺以上）。
 * **零實體光源**：刻痕與鑰匙齒都是自發光（WORLD.md §6.1）。
 */
function landmarkNamelessKeys(kit) {
  const grp = new THREE.Group();
  // 臺座 ＋ 中央那根沒有刻字的短柱
  put(grp, cyl(5.0, 6.2, 1.3, 8), stone(kit.dark), [0, 0.65, 0]);
  put(grp, cyl(3.6, 4.2, 0.5, 8), stone(kit.mid), [0, 1.55, 0]);
  const pillar = put(grp, cyl(1.5, 1.9, 9.4, 8), stone(kit.mid), [0, 6.5, 0]);
  bulky(pillar);
  // 柱頂那一圈空的名牌（每一片都留白）
  put(grp, torus(4.6, 0.22, 5, 22), glow(kit.accent, 1.15), [0, 11.6, 0], [Math.PI / 2, 0, 0]);

  // 懸浮的鑰匙：一圈 9 把，每一把＝一根桿 ＋ 一個環 ＋ 兩顆齒（instanced）
  const KEYS = 9;
  const shafts = new THREE.InstancedMesh(box(0.26, 3.4, 0.26), stone(kit.light), KEYS);
  const bows = new THREE.InstancedMesh(torus(0.62, 0.16, 4, 12), glow(kit.accent, 1.0), KEYS);
  const teeth = new THREE.InstancedMesh(box(0.9, 0.24, 0.24), stone(kit.light), KEYS * 2);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let t = 0;
  for (let i = 0; i < KEYS; i += 1) {
    const a = (i / KEYS) * Math.PI * 2;
    const r = 7.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 13.4 + Math.sin(a * 2) * 1.6;
    const tilt = Math.sin(a * 3) * 0.35;
    q.setFromEuler(new THREE.Euler(tilt, -a, 0.12));
    shafts.setMatrixAt(i, mtx.compose(p.set(x, y, z), q, one));
    bows.setMatrixAt(i, mtx.compose(p.set(x, y + 2.0, z), q, one));
    for (const k of [0, 1]) {
      const off = -1.0 - k * 0.6;
      teeth.setMatrixAt(t, mtx.compose(p.set(x + Math.sin(-a) * 0.42, y + off, z + Math.cos(-a) * 0.42), q, one));
      t += 1;
    }
  }
  shafts.instanceMatrix.needsUpdate = true;
  bows.instanceMatrix.needsUpdate = true;
  teeth.count = t;
  teeth.instanceMatrix.needsUpdate = true;
  grp.add(shafts);
  grp.add(bows);
  grp.add(teeth);

  // 那一圈鑰匙下面的一點暖光 —— 全區唯一的暖金熱點
  put(grp, ico(0.5, 0), glow(PALETTE.warm, 2.0), [0, 12.3, 0]);
  put(grp, torus(7.6, 0.12, 4, 26), glow(kit.accent, 1.25), [0, 14.6, 0], [Math.PI / 2, 0, 0]);
  return grp;
}

/**
 * 不會關上的門：一道永遠留一條縫的雙層門。
 *
 * 哨所的門是兩層的：外面那一層擋得住莽撞的人，裡面那一層只擋得住自己人。
 * 兩層都關不上 —— 中間那條縫是刻意留的，人要進得來、話要傳得出去。
 * 門框與門扇擋人；縫裡那道光是自發光的。**零實體光源**。
 */
function landmarkAjarDoors(kit) {
  const grp = new THREE.Group();
  put(grp, box(13.5, 0.9, 7.0), stone(kit.dark), [0, 0.45, 0]);

  // 兩層門：外層高、內層矮一點，各自留一條縫
  const layers = [
    { z: 2.0, h: 16.5, w: 4.6, gap: 1.05, mat: kit.mid },
    { z: -2.0, h: 12.5, w: 3.9, gap: 0.7, mat: kit.dark },
  ];
  for (const L of layers) {
    for (const side of [-1, 1]) {
      bulky(put(grp, box(1.5, L.h, 1.5), stone(L.mat), [side * (L.w + L.gap + 0.75), L.h / 2 + 0.9, L.z]));
      // 門扇：向外開了一點點，所以永遠合不起來
      const leaf = put(
        grp,
        box(L.w, L.h - 1.6, 0.55),
        stone(L.mat),
        [side * (L.gap + L.w / 2 + 0.1), (L.h - 1.6) / 2 + 0.9, L.z + side * 0.5],
        [0, side * -0.16, 0]
      );
      bulky(leaf);
      // 門扇上的橫閂（合不起來的那一根）
      put(grp, box(L.w * 0.86, 0.3, 0.2), glow(kit.accent, 0.9), [
        side * (L.gap + L.w / 2 + 0.1),
        L.h * 0.52,
        L.z + side * 0.5 + 0.35,
      ]);
    }
    put(grp, box(L.w * 2 + L.gap * 2 + 3.0, 1.4, 1.8), stone(L.mat), [0, L.h + 0.9, L.z]);
  }

  // 兩道縫裡透出來的光（自發光的薄片，不是燈）
  put(grp, box(0.55, 14.0, 0.5), glow(kit.accent, 1.5), [0, 8.0, 2.0]);
  put(grp, box(0.4, 10.5, 0.4), glow(kit.accent, 1.2), [0, 6.4, -2.0]);
  // 門楣上那一點暖光 —— 有人還在守著
  put(grp, ico(0.46, 0), glow(PALETTE.warm, 2.0), [0, 18.4, 2.0]);
  put(grp, torus(1.5, 0.14, 4, 16), glow(kit.accent, 1.1), [0, 18.4, 2.0], [0, 0, 0]);
  return grp;
}

/**
 * 會回頭照自己的鏡（校驗場 · 課程 v2 · Phase G）：兩面高大的鏡互相對著，
 * 中間那條窄縫裡是一層層越縮越小的自己 —— 這一區教的就是「拿自己的東西照自己」。
 * 零實體光源：所有的光都是自發光薄片與加色反光層。
 */
function landmarkFacingGlass(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(7.6, 8.8, 1.2, 12), stone(kit.dark), [0, 0.6, 0]);

  // 兩面鏡：面對面，各自往內傾一點，所以中間那條縫會一直反下去
  for (const side of [-1, 1]) {
    const frame = put(
      grp,
      box(1.1, 17.5, 7.4),
      stone(kit.mid),
      [side * 4.3, 17.5 / 2 + 1.2, 0],
      [0, 0, side * -0.05]
    );
    bulky(frame);
    // 鏡面本身（自發光的薄片，不是燈）
    put(
      grp,
      box(0.22, 15.4, 6.2),
      glow(kit.accent, 0.8),
      [side * (4.3 - 0.62), 15.4 / 2 + 1.9, 0],
      [0, 0, side * -0.05]
    );
    // 磨損：鏡框上一道一道被改過的刻痕
    for (let i = 0; i < 5; i += 1) {
      put(grp, box(1.16, 0.16, 0.5), glow(kit.accent, 0.5), [side * 4.3, 3.6 + i * 2.9, 3.4]);
    }
  }

  // 中間那條縫裡越縮越小的「自己」：六層一層比一層小的薄片
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    put(
      grp,
      box(0.16, 12.0 * (1 - t * 0.72), 0.9 * (1 - t * 0.6)),
      glow(kit.accent, 1.4 - t * 1.05),
      [0, 7.4 - t * 1.6, -1.4 + t * 2.6]
    );
  }

  // 頂上橫過去的那一根（把兩面接起來 —— 它們照的是同一件事）
  put(grp, box(10.6, 1.3, 1.9), stone(kit.mid), [0, 19.4, 0]);
  put(grp, ico(0.42, 0), glow(PALETTE.warm, 2.0), [0, 20.3, 0]);
  put(grp, torus(1.35, 0.13, 4, 16), glow(kit.accent, 1.0), [0, 20.3, 0], [Math.PI / 2, 0, 0]);
  return grp;
}

/**
 * 空的基座（減法之庭）：一座什麼都沒放的基座。
 *
 * 這是整張地圖上唯一一座「地標本身不是東西」的地標 —— 被拿走的那件東西
 * 只剩下一圈懸在半空的光輪廓，銘文刻在基座正面，寫的是被拿掉的清單。
 * **零實體光源**（輪廓與銘文全部是自發光材質 ＋ 加色混合）。
 */
function landmarkEmptyPlinth(kit) {
  const grp = new THREE.Group();
  // 三階往上收的基座（唯一被留下來的東西）
  put(grp, cyl(6.6, 7.8, 1.3, 12), stone(kit.dark), [0, 0.65, 0]);
  bulky(put(grp, box(8.4, 3.2, 8.4), stone(kit.mid), [0, 1.3 + 1.6, 0]));
  bulky(put(grp, box(6.2, 2.8, 6.2), stone(kit.mid), [0, 4.5 + 1.4, 0]));
  bulky(put(grp, box(4.4, 2.4, 4.4), stone(kit.dark), [0, 7.3 + 1.2, 0]));

  // 銘文：基座正面一行一行被刻上去的「拿掉了什麼」
  for (let i = 0; i < 7; i += 1) {
    put(grp, box(5.2 - i * 0.18, 0.14, 0.12), glow(kit.accent, 0.42), [0, 2.1 + i * 0.62, 4.24]);
  }

  // 頂面：一圈光印子（東西原本站的位置）
  put(grp, torus(1.9, 0.1, 4, 22), glow(PALETTE.warm, 0.9), [0, 9.76, 0], [Math.PI / 2, 0, 0]);

  // 被拿走的那件東西：只剩八條垂直的光線畫出它的輪廓，裡面什麼都沒有
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const r = 1.9 - (i % 2) * 0.35;
    put(grp, box(0.1, 7.2, 0.1), glow(kit.accent, 1.15 - (i % 2) * 0.35), [
      Math.cos(a) * r,
      9.8 + 3.6,
      Math.sin(a) * r,
    ]);
  }
  // 輪廓的頂：一圈更小的環（越往上越收，剪影才讀得出「那裡曾經有東西」）
  put(grp, torus(1.15, 0.08, 4, 18), glow(kit.accent, 0.85), [0, 17.0, 0], [Math.PI / 2, 0, 0]);
  put(grp, ico(0.3, 0), glow(PALETTE.warm, 1.6), [0, 17.6, 0]);
  return grp;
}

const LANDMARK_BUILDERS = {
  'broken-ring': landmarkBrokenRing,
  'endless-stair': landmarkEndlessStair,
  'great-tree': landmarkGreatTree,
  'great-crane': landmarkGreatCrane,
  'mask-arch': landmarkMaskArch,
  'gauge-column': landmarkGaugeColumn,
  'nameless-keys': landmarkNamelessKeys,
  'ajar-doors': landmarkAjarDoors,
  'facing-glass': landmarkFacingGlass,
  'empty-plinth': landmarkEmptyPlinth,
};

/* ------------------------------------------------------------------ *
 * 石碑（lore）：世界觀的碎片，不是課程內容
 * ------------------------------------------------------------------ *
 *
 * 護欄 2 的界線：這些石碑是**風味文字**，刻意不宣稱任何技巧、不附出處。
 * 真正的教學與官方連結一律留在 challenges / 圖鑑裡。
 */
export const LORE_XP = 8;

export const LORE_TABLETS = Object.freeze([
  {
    id: 'hearth',
    region: 'foundations',
    at: [7, 14],
    title: '旅人的火塘',
    lines: ['我們在這裡生火，練習把話說完整。', '神諭不會猜；牠只回答你真的問出口的那件事。'],
  },
  {
    id: 'clarity-gate',
    region: 'foundations',
    at: [-7, -13],
    title: '門前的舊牌',
    lines: ['門口曾經立過一塊牌：「說得清楚的人請進。」', '後來牌子被搬走了——走到這裡的人都已經懂了。'],
  },
  {
    id: 'stone-circle',
    region: 'foundations',
    at: [-42, -22],
    title: '立石環',
    lines: ['這圈石頭是最早的人立的。', '他們還不會發問，只把想到的全刻上去——所以你看，字又長又亂。'],
  },
  {
    id: 'mother-stele',
    region: 'foundations',
    at: [18, -46],
    title: '母碑殘片',
    lines: ['母碑倒下那年，有人抄下最後一行：', '「把你要的樣子先說出來，牠就照著做。」'],
  },
  {
    id: 'west-bridge',
    region: 'foundations',
    at: [-32.9, -40.7],
    title: '西橋碑',
    lines: ['往西的路要走得慢。', '他們說，凡是想一步跨過去的，都掉進霧裡了。'],
  },
  {
    id: 'east-bridge',
    region: 'foundations',
    // Phase 20：原本站在「斷環」臺座的邊上（相距 7.3 公尺，臺座本身就有 6.4 公尺寬）。
    // 臺座補上碰撞體之後那半邊就繞不過去了 —— 沿著同一條半徑挪開，離地標 11.9 公尺，
    // 與另外三塊橋碑一樣落在半徑 52.3 的圈上。
    at: [45.3, -26.2],
    title: '東橋碑',
    lines: ['東邊的人不背誦。', '他們攤開手上的卷宗再開口；沒有卷宗的那天，就老實說「我不知道」。'],
  },
  {
    id: 'southwest-bridge',
    region: 'foundations',
    at: [-32.9, 40.7],
    title: '西南橋碑',
    lines: ['工坊的規矩：大的活兒要拆成小的活兒，一件一件交出去。', '想一次做完的人，機器從來沒轉起來過。'],
  },
  {
    id: 'southeast-bridge',
    region: 'foundations',
    at: [40.7, 32.9],
    title: '東南橋碑',
    lines: ['戲班的第一課是換上面具。', '第二課是記得自己不是面具。'],
  },
  {
    id: 'demonstration',
    region: 'reasoning',
    at: [-95, -108],
    title: '示範碑',
    lines: ['老師傅不解釋。', '他做兩遍給你看，第三遍就換你了。'],
  },
  {
    id: 'archive-door',
    region: 'grounding',
    at: [95, -108],
    title: '檔案庫門碑',
    lines: ['這裡的規矩：先讀，再答。', '答完，要說得出你讀的是哪一頁。'],
  },
  {
    id: 'workshop-yard',
    region: 'orchestration',
    at: [-95, 108],
    title: '工坊庭碑',
    lines: ['有些門推開就關不上。', '工匠們在那種門上都刻了同一句：「先問過人。」'],
  },
  {
    id: 'backstage',
    region: 'config',
    at: [95, 108],
    title: '後台碑',
    lines: ['旋鈕轉緊一點，戲每晚都一樣。', '轉鬆一點，偶爾會冒出連編劇都沒想過的台詞。'],
  },
]);

/** 石碑本體：一塊斜插在地上的刻字石板 ＋ 一圈很淡的光。 */
export function buildTablet(tablet, kit, terrainHeight) {
  const grp = new THREE.Group();
  const [x, z] = tablet.at;
  const y = terrainHeight(x, z);
  grp.position.set(x, y, z);
  grp.name = `tablet:${tablet.id}`;

  put(grp, box(1.5, 0.34, 1.0), stone(kit.dark), [0, 0.17, 0]);
  const slab = put(grp, box(1.05, 1.7, 0.22), stone(kit.mid), [0, 1.0, 0], [-0.22, 0, 0.04]);
  // 石碑擋得住人（互動半徑 4.6，還是走得到）。
  // keepSolid：它是手工擺的一塊實心石頭，不是碎石 —— 就算剛好站在祭壇 / 石座的
  // 淨空圈邊上，也不准被淨空濾網掃成幽靈（Phase 20：爐火碑就是這樣穿模的）。
  slab.userData.solidRadius = 0.75;
  slab.userData.keepSolid = true;
  put(slab, plane(0.85, 1.35), glyphMat(7), [0, 0, 0.13]);

  const halo = new THREE.Mesh(
    torus(1.25, 0.06, 4, 22),
    new THREE.MeshBasicMaterial({
      color: PALETTE.warm,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  grp.add(halo);

  const spark = new THREE.Mesh(ico(0.11, 0), glow(PALETTE.warm, 1.6));
  spark.position.set(0, 2.05, 0.1);
  grp.add(spark);

  return {
    id: tablet.id,
    tablet,
    group: grp,
    position: new THREE.Vector3(x, y, z),
    halo,
    spark,
    near: false,
    read: false,
    setNear(v) {
      this.near = Boolean(v);
    },
    setRead(v) {
      this.read = Boolean(v);
      if (this.read) spark.material = glow(PALETTE.accent, 0.7);
    },
    update(dt, t) {
      const wanted = (this.near ? 0.36 : this.read ? 0.06 : 0.14) + Math.sin(t * 1.6 + x * 0.2) * 0.03;
      halo.material.opacity += (wanted - halo.material.opacity) * Math.min(1, dt * 5);
      halo.rotation.z += dt * (this.near ? 0.5 : 0.1);
      spark.position.y = 2.05 + Math.sin(t * 1.3 + z * 0.2) * 0.08;
    },
  };
}

/* ------------------------------------------------------------------ *
 * 走出來的路（worn paths）
 * ------------------------------------------------------------------ */
/**
 * 主要動線：中央 ↔ 各區（橋），以及各區中心 ↔ 該區每一座石座。
 * 只用來染地面顏色，不動高度場 —— 不會影響可行走性判定。
 */
export function buildPathNetwork(sites, corridors, challenges) {
  const segs = [];
  // 1. 橋：中央 ↔ 各區
  for (const c of corridors) segs.push([c.from.x, c.from.z, c.to.x, c.to.z]);

  for (const site of sites) {
    const pins = (challenges || [])
      .filter((c) => c.region === site.id && c.position)
      .map((c) => ({ x: c.position[0], z: c.position[1], a: Math.atan2(c.position[1] - site.z, c.position[0] - site.x) }))
      .sort((p, q) => p.a - q.a);
    if (!pins.length) continue;

    // 2. 環路：石座依角度串成一圈（放射狀會在中心糊成一團，環路才看得出「路」）
    for (let i = 0; i < pins.length; i += 1) {
      const a = pins[i];
      const b = pins[(i + 1) % pins.length];
      segs.push([a.x, a.z, b.x, b.z]);
    }

    // 3. 支線：中心（橋的落點）接到離它最近的那座石座
    let nearest = pins[0];
    let best = Infinity;
    for (const p of pins) {
      const d = Math.hypot(p.x - site.x, p.z - site.z);
      if (d < best) {
        best = d;
        nearest = p;
      }
    }
    segs.push([site.x, site.z, nearest.x, nearest.z]);

    // 4. 岔路：從最近的石座通往每個故事小景（找得到才有意義，所以是岔路不是主路）
    for (const v of STORY_VIGNETTES) {
      if (v.region !== site.id) continue;
      let from = pins[0];
      let bd = Infinity;
      for (const p of pins) {
        const d = Math.hypot(p.x - v.at[0], p.z - v.at[1]);
        if (d < bd) {
          bd = d;
          from = p;
        }
      }
      segs.push([from.x, from.z, v.at[0], v.at[1]]);
    }
  }
  return segs;
}

/** 點到線段的距離（與 world.js 同一套算法，這裡自己留一份避免循環相依）。 */
function segDistance(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** 這個點被踩得多熟（0 = 沒人走過、1 = 路中央）。 */
export function pathInfluence(x, z, segs, core = 2.0, edge = 5.4) {
  let best = 0;
  for (const s of segs) {
    const d = segDistance(x, z, s[0], s[1], s[2], s[3]);
    if (d >= edge) continue;
    const t = Math.max(0, Math.min(1, (edge - d) / (edge - core)));
    const w = t * t * (3 - 2 * t);
    if (w > best) best = w;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 組裝
 * ------------------------------------------------------------------ */
/** 每區的色本：主色 → 深 / 中 / 淺 三階 ＋ 一個強調色。 */
export function kitFor(colorHex) {
  const c = new THREE.Color(colorHex);
  return {
    accent: c.getHex(),
    light: c.clone().lerp(new THREE.Color(0xffffff), 0.42).multiplyScalar(0.72).getHex(),
    mid: c.clone().multiplyScalar(0.46).getHex(),
    dark: c.clone().multiplyScalar(0.26).getHex(),
  };
}

/**
 * 蓋出某一區的所有故事小景。
 * @returns {{group: THREE.Group, anchors: Array<{x:number,z:number,r:number}>, animated: Array}}
 */
export function buildVignettes(regionId, kit, terrainHeight, quality) {
  const group = new THREE.Group();
  group.name = `vignettes:${regionId}`;
  const anchors = [];
  const animated = [];

  for (const v of STORY_VIGNETTES) {
    if (v.region !== regionId) continue;
    const holder = new THREE.Group();
    holder.name = `vignette:${v.id}`;
    holder.position.set(v.at[0], terrainHeight(v.at[0], v.at[1]), v.at[1]);
    holder.rotation.y = v.rot || 0;

    for (const [kind, offset, rotY, opts] of v.parts) {
      const make = PROPS[kind];
      if (!make) continue;
      // 低畫質：道具一律不帶實體光源（發光材質仍在，只是不參與著色）
      const prop = make(kit, quality === 'high' ? opts || {} : { ...(opts || {}), light: false });
      prop.position.set(offset[0], offset[1] || 0, offset[2]);
      prop.rotation.y = rotY || 0;
      if (quality === 'high') {
        prop.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
      }
      if (prop.userData.flicker) animated.push({ kind: 'flicker', light: prop.userData.flicker, seed: anchors.length + animated.length });
      if (prop.userData.floaters) animated.push({ kind: 'floaters', mesh: prop.userData.floaters, seed: animated.length });
      if (prop.userData.pointer) animated.push({ kind: 'pointer', mesh: prop.userData.pointer });
      // 擺放時就決定「這件道具擋不擋人」——碰撞登記表之後從場景圖掃出來
      if (PROP_SOLID_RADIUS[kind]) prop.userData.solidRadius = PROP_SOLID_RADIUS[kind];
      holder.add(prop);
    }

    group.add(holder);
    anchors.push({ x: v.at[0], z: v.at[1], r: 8, id: v.id });
  }

  return { group, anchors, animated };
}

/** 蓋出某一區的地標。 */
export function buildLandmark(regionId, kit, terrainHeight, quality) {
  const spec = LANDMARKS.find((l) => l.region === regionId);
  if (!spec) return null;
  const make = LANDMARK_BUILDERS[spec.id];
  if (!make) return null;
  const grp = make(kit);
  grp.name = `landmark:${spec.id}`;
  grp.position.set(spec.at[0], terrainHeight(spec.at[0], spec.at[1]), spec.at[1]);
  // 地標腳下的碰撞體：只擋柱子與塔身，拱門底下 / 環的中央仍走得過去
  for (const [dx, dz, r] of LANDMARK_SOLIDS[spec.id] || []) {
    const node = new THREE.Object3D();
    node.position.set(dx, 0, dz);
    node.userData.solidRadius = r;
    grp.add(node);
  }
  if (quality === 'high') {
    grp.traverse((o) => {
      if (o.isMesh && o.userData.blocksCamera) o.castShadow = true;
    });
  }
  return { spec, group: grp, animated: grp.userData };
}

export default {
  LORE_TABLETS,
  LORE_XP,
  STORY_VIGNETTES,
  LANDMARKS,
  PROP_KINDS,
  kitFor,
  buildVignettes,
  buildLandmark,
  buildTablet,
  buildPathNetwork,
  pathInfluence,
  disposePropCache,
};

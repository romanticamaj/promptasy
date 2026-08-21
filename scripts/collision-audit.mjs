/**
 * Promptasy — 碰撞稽核（Phase 20；v1.2 · P13 加上「頂面」那一維）
 *
 * 「玩家不可以穿過任何有份量的東西」這件事，用一條**可執行**的規則守住：
 * 把整棵場景圖攤開，逐一量每個網格（含 InstancedMesh 的每個實例）在世界座標下的
 * 外接盒，凡是符合下面四個條件的都算「有份量」，就一定要有碰撞體蓋住它。
 *
 *   1. 佔地半徑 ≥ RADIUS_MIN（0.5 公尺，也就是直徑一公尺以上）
 *   2. 露出地面的高度 ≥ HEIGHT_MIN（0.9 公尺，跨不過去）
 *   3. 底緣離地 < FLOAT_MIN（1.6 公尺）**而且頂面站不上去**
 *   4. 最薄的兩軸都 ≥ PLATE_MIN（0.9 公尺，細桿與電線不算）
 *
 * 第 3 條在 v1.2 · P13 之前只有前半句，那句話預設了「玩家不會站到東西上面」——
 * 一旦有跳躍（P14）就是漏洞：飄在半空、卻有一片平頂面的東西會**兩頭落空**，
 * 既不用擋人、也沒人稽核（P11 的浮空母題就是這樣整座漏掉的）。
 * 現在的語意是「從底下走得過去 **而且** 頂面不可站立」才豁免。
 *
 * 可站立體另有一條規則（`auditStandables()`）：頂面高度要量得到、要落在允許區間、
 * 不准懸在虛空上方、圓要站得下人、量過是平的那一段（`standR`）不得超過碰撞圓。
 * 判準本身住在 `src/world/world.js`
 * （`measureSurface()` / `STAND_*`）—— 稽核與資料層共用同一份，不會有第二套判準。
 *
 * 這支模組同時被 `npm run test:rubric` 與臨時的稽核腳本使用。
 */
import * as THREE from 'three';
import {
  measureSurface,
  coverage as worldCoverage,
  STAND_MIN_H,
  STAND_MAX_H,
  STAND_MIN_R,
  STAND_COVER_MIN,
} from '../src/world/world.js';

export const RADIUS_MIN = 0.5;
export const HEIGHT_MIN = 0.9;
export const FLOAT_MIN = 1.6;
export const PLATE_MIN = 0.9;

/**
 * 有理由不擋人的東西。每一條都要說得出「為什麼它不是物質」。
 * 比對的是「從場景根節點到這個網格」的名字路徑。
 */
export const EXCEPTIONS = Object.freeze([
  { match: /(^|\/)terrain$/, why: '地形本身（走在它上面，不是撞它）' },
  { match: /(^|\/)mist$/, why: '貼地霧氣：光，不是物質' },
  { match: /(^|\/)motes$/, why: '螢火粒子：飄在空中的光點，不是物質' },
  { match: /(^|\/)gate:/, why: '閘門力場：由解鎖邏輯擋（isWalkable），解鎖後要走得過去' },
  { match: /(^|\/)beacon$/, why: '出生點光柱：光，不是物質' },
  { match: /(^|\/)sky|aurora|moon|stars/, why: '天空 / 極光 / 月亮 / 星空' },
  { match: /(^|\/)marker:/, why: '石座的光柱與地面光環（石座本體另有碰撞體）' },
  { match: /(^|\/)shrine/, why: '起始祭壇的光圈：序章要走進去站在中間' },
]);

const _box = new THREE.Box3();
const _mtx = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();

function pathOf(obj) {
  const parts = [];
  let o = obj;
  while (o) {
    if (o.name) parts.unshift(o.name);
    o = o.parent;
  }
  return parts.join('/') || '(unnamed)';
}

function geoSignature(mesh) {
  const g = mesh.geometry;
  const p = (g && g.parameters) || {};
  return `${g ? g.type : '?'}(${Object.entries(p)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;
}

/**
 * 把場景裡「有份量」的網格列出來。
 * @param {THREE.Object3D} root
 * @param {(x:number,z:number)=>number} heightAt
 * @param {(x:number,z:number)=>number} [coverAt] 地面覆蓋（頂面是不是懸在虛空上方）
 * @returns {Array<{name:string,geo:string,x:number,z:number,r:number,height:number,bottom:number,plate:number,top:number,standable:boolean,standR:number,excepted:string|null}>}
 */
export function listSubstantial(root, heightAt, coverAt = worldCoverage) {
  const out = [];
  root.updateMatrixWorld(true);

  const consider = (mesh, matrix) => {
    const geo = mesh.geometry;
    if (!geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    matrix.decompose(_pos, _quat, _scl);
    const dims = [
      (bb.max.x - bb.min.x) * Math.abs(_scl.x),
      (bb.max.y - bb.min.y) * Math.abs(_scl.y),
      (bb.max.z - bb.min.z) * Math.abs(_scl.z),
    ].sort((a, b) => a - b);
    const plate = dims[1];
    if (plate < PLATE_MIN) return; // 細桿 / 電線 / 薄片

    _box.copy(bb).applyMatrix4(matrix);
    const x = (_box.min.x + _box.max.x) / 2;
    const z = (_box.min.z + _box.max.z) / 2;
    const r = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2;
    if (r < RADIUS_MIN) return;
    const ground = heightAt(x, z);
    const bottom = _box.min.y - ground;
    const top = _box.max.y - ground;
    const height = top - Math.max(bottom, 0);
    if (height < HEIGHT_MIN) return; // 跨得過去

    const name = pathOf(mesh);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    let excepted = null;
    if (mat && mat.transparent) excepted = '半透明：光 / 水 / 霧，不是物質';
    if (!excepted) {
      const hit = EXCEPTIONS.find((e) => e.match.test(name));
      if (hit) excepted = hit.why;
    }

    /*
     * v1.2 · P13：豁免「飄在半空」之前先問一句「那它的頂面站得上去嗎」。
     * 站得上去的東西就算人從底下走得過去，也一樣要有碰撞體蓋住它 ——
     * 不然 P14 的跳躍會把它變成一塊沒人管的浮島。
     *
     * **例外（光／霧／水／地形／閘門力場）不量頂面**：它們本來就不是可以站的東西，
     * 量了只會替光和水貼上「可站立」的標籤，順便讓地形那種量體白算一次
     * （審查 · 第 2 條）。它們的 `top` 用外接盒的頂 —— 仍然是個數字。
     */
    const surf = excepted
      ? { top: _box.max.y, topFace: false, standable: false, standR: 0 }
      : measureSurface(mesh, matrix, x, z, ground, coverAt(x, z), r, _box.max.y);
    if (bottom >= FLOAT_MIN && !surf.standable) return; // 飄在半空、頂面也站不上去

    out.push({
      name,
      geo: geoSignature(mesh),
      x,
      z,
      r,
      height,
      bottom,
      plate,
      top: surf.top,
      topFace: surf.topFace,
      standable: surf.standable,
      standR: surf.standR,
      excepted,
    });
  };

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.isInstancedMesh) {
      for (let i = 0; i < obj.count; i += 1) {
        obj.getMatrixAt(i, _mtx);
        _mtx.premultiply(obj.matrixWorld);
        consider(obj, _mtx);
      }
    } else {
      consider(obj, _mtx.copy(obj.matrixWorld));
    }
  });

  return out;
}

/**
 * 稽核：有份量卻沒有碰撞體蓋住的東西（＝走得過去的穿模點）。
 * @param {THREE.Object3D} root
 * @param {(x:number,z:number,solids:any[],pad?:number)=>any} solidAt
 * @param {Array<{x:number,z:number,r:number}>} solids
 * @param {(x:number,z:number)=>number} heightAt
 * @param {(x:number,z:number)=>number} [coverAt]
 */
export function auditCoverage(root, solidAt, solids, heightAt, coverAt = worldCoverage) {
  const all = listSubstantial(root, heightAt, coverAt);
  const checked = all.filter((s) => !s.excepted);
  const uncovered = checked.filter((s) => !solidAt(s.x, s.z, solids, 0));
  return { all, checked, uncovered, excepted: all.filter((s) => s.excepted) };
}

/**
 * 可站立體的稽核（v1.2 · P13）。
 *
 * `collectSolids()` 標成 `standable` 的圓，每一顆都要通得過這幾條 ——
 * 這是一道**單向的守門**：判準改鬆、資料改壞、或有人手動塞一顆 `standable`
 * 進碰撞表，這裡就會紅。反過來，這裡永遠不會把「不可站」改成「可站」。
 *
 * @param {Array<{x:number,z:number,r:number,standR:number,top:number,topFace:boolean,standable:boolean}>} solids
 * @param {(x:number,z:number)=>number} heightAt
 * @param {(x:number,z:number)=>number} [coverAt]
 * @returns {{stand:Array, bad:Array<{x:number,z:number,why:string}>}}
 */
export function auditStandables(solids, heightAt, coverAt = worldCoverage) {
  const stand = solids.filter((s) => s.standable);
  const bad = [];
  for (const s of stand) {
    const why = [];
    if (!Number.isFinite(s.top)) why.push('頂面高度量不出來');
    if (!s.topFace) why.push('頂面不是量自真的上向面');
    const h = s.top - heightAt(s.x, s.z);
    if (!(h >= STAND_MIN_H - 1e-6 && h <= STAND_MAX_H + 1e-6)) {
      why.push(`離地 ${Number.isFinite(h) ? h.toFixed(2) : h} 不在 ${STAND_MIN_H}–${STAND_MAX_H} 之間`);
    }
    if (coverAt(s.x, s.z) < STAND_COVER_MIN) why.push('頂面懸在虛空上方');
    if (!(s.r >= STAND_MIN_R)) why.push(`碰撞圓 ${s.r} 站不下人`);
    if (!(s.standR >= STAND_MIN_R)) why.push(`量過是平的只有 ${s.standR}，站不下人`);
    if (s.standR > s.r + 1e-6) why.push(`可站半徑 ${s.standR} 比碰撞圓 ${s.r} 還大`);
    if (why.length) bad.push({ x: s.x, z: s.z, r: s.r, top: s.top, why: why.join('；') });
  }
  return { stand, bad };
}

/** 把稽核結果整理成一份人看得懂的清單（同型的合併成一列）。 */
export function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.name.replace(/#\d+/g, '')} ${r.geo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      n: list.length,
      maxR: Math.max(...list.map((l) => l.r)),
      maxH: Math.max(...list.map((l) => l.height)),
      sample: list[0],
    }))
    .sort((a, b) => b.n - a.n);
}

export default {
  listSubstantial,
  auditCoverage,
  auditStandables,
  summarize,
  EXCEPTIONS,
  RADIUS_MIN,
  HEIGHT_MIN,
  FLOAT_MIN,
  PLATE_MIN,
};

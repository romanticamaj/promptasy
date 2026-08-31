/**
 * Promptasy — 靜態合批（v1.2 · P22b）
 *
 * 為什麼會有這一支：這個世界從 v1 起守的是三角形／光源／碰撞體，
 * 三項都在框內，可是 draw call 一路長到 4,144、加色混合的透明片長到 1,164。
 * 23 萬個三角形對 GPU 是小事；四千次「換材質、綁 shader、上傳 uniform」不是。
 *
 * 這一支把**同一份幾何 ＋ 同一份材質 ＋ 同一組 userData** 的靜態網格
 * 收成一個 `InstancedMesh`。畫面**逐位元組相同**：同一份幾何、同一份材質、
 * 同一組世界矩陣，只是改成一次送出去。
 *
 * ## 為什麼合批不會讓稽核鬆掉
 *
 * `collectSolids()`（碰撞登記）與 `scripts/collision-audit.mjs`（穿模稽核、可站立稽核）
 * **本來就逐一走 InstancedMesh 的每一個實例**（`getMatrixAt` → `premultiply(matrixWorld)`），
 * 所以合批之後每一顆圓、每一次量測都還在，數字一個都不會少。
 * 這是刻意選 InstancedMesh 而不是「把幾何 merge 成一大塊」的原因：
 * merge 會把 N 件小東西變成一件大東西，稽核就會突然說「這裡有一塊沒人擋」。
 *
 * ## 不合批的東西（每一條都是「合了就會壞」）
 *
 * 1. **被別人拿在手上的**（`protectReferenced()`）：只要有任何節點的 `userData` 指著它，
 *    它就可能被每幀動畫、被測試讀取。地標的載重／齒輪／葉子、道具的指針都是這樣。
 *    合批會把它從場景圖拿掉，動畫就在轉一個沒人看得到的殼。
 * 2. **底下還有網格的**：`collectTriangles()` 對非 instanced 的網格會**走整棵子樹**
 *    去量頂面。把子網格搬走，父網格的「站不站得上去」就變了。
 * 3. **頭上還有網格的**：同一條的另一面 —— 它自己就是別人的那一棵子樹。
 * 4. **userData 帶著物件的**：合批後整批共用一份 userData，帶物件就代表帶著身分，
 *    共用會張冠李戴。
 *
 * @module world/batching
 */
import * as THREE from 'three';

const _mtx = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * 把「被 userData 指著的」節點（連同它整棵子樹）標成不可合批。
 *
 * 這是一道**通用**的保險：不必逐個 layer 去記「哪一件是活的」，
 * 只要它被誰拿在手上（`grp.userData.gear`、`prop.userData.pointer`…），
 * 它就留在原地當一個獨立的網格。
 *
 * @param {THREE.Object3D} node
 * @returns {number} 被保護起來的節點數
 */
export function protectReferenced(node) {
  let n = 0;
  const mark = (o) => {
    if (!o || !o.isObject3D || o.userData.noBatch) return;
    o.traverse((c) => {
      c.userData.noBatch = true;
    });
    n += 1;
  };
  node.traverse((o) => {
    const ud = o.userData;
    if (!ud) return;
    for (const k of Object.keys(ud)) {
      const v = ud[k];
      if (v && typeof v === 'object' && v.isObject3D) mark(v);
    }
  });
  return n;
}

/**
 * 把「形狀本身被斷言看著的」子樹標成不可合批。
 *
 * 有幾處測試是逐一走某個節點的 `children` 在量的（例：高台的每一塊裝飾
 * 「看得見、而且不會從站在上面的人身上穿過去」）。合批會把那些子節點搬到
 * 上一層去，那一段斷言就會安靜地量到 0 塊 —— 空泛通過。
 * 這一支保留那幾棵子樹的形狀：**測試量的是什麼，畫面就照什麼擺**。
 *
 * @param {THREE.Object3D} node
 * @param {RegExp} re 名字對得上就整棵保留
 * @returns {number}
 */
export function protectByName(node, re) {
  const hits = [];
  node.traverse((o) => {
    if (o.name && re.test(o.name)) hits.push(o);
  });
  for (const o of hits) {
    o.traverse((c) => {
      c.userData.noBatch = true;
    });
  }
  return hits.length;
}

/** 這個網格的 userData 能不能被一整批共用（全部是純值才行）。 */
function udSignature(obj) {
  const ud = obj.userData;
  if (!ud) return '';
  const keys = Object.keys(ud).sort();
  const parts = [];
  for (const k of keys) {
    const v = ud[k];
    const t = typeof v;
    if (v !== null && t !== 'string' && t !== 'number' && t !== 'boolean' && t !== 'undefined') return null;
    parts.push(`${k}=${v}`);
  }
  return parts.join(',');
}

/**
 * 一棵子樹裡的靜態網格收成 InstancedMesh。
 *
 * @param {THREE.Object3D} node 這一層的根（合出來的批就掛在它底下，路徑前綴不變）
 * @param {object} [opts]
 * @param {number} [opts.min] 幾個以上才值得合（預設 2）
 * @returns {{batches:number, merged:number, saved:number}}
 */
export function instanceStatics(node, { min = 2 } = {}) {
  node.updateMatrixWorld(true);
  _inv.copy(node.matrixWorld).invert();

  const buckets = new Map();
  const meshAncestor = (o) => {
    for (let p = o.parent; p && p !== node.parent; p = p.parent) if (p.isMesh) return true;
    return false;
  };
  const meshDescendant = (o) => {
    let found = false;
    o.traverse((c) => {
      if (c !== o && c.isMesh) found = true;
    });
    return found;
  };

  node.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (o.userData && o.userData.noBatch) return;
    if (!o.geometry || !o.material || Array.isArray(o.material)) return;
    if (o.morphTargetInfluences) return;
    if (meshAncestor(o) || meshDescendant(o)) return;
    const sig = udSignature(o);
    if (sig === null) return;
    const key = [
      o.geometry.uuid,
      o.material.uuid,
      sig,
      o.castShadow ? 1 : 0,
      o.receiveShadow ? 1 : 0,
      o.renderOrder,
      o.visible ? 1 : 0,
      o.frustumCulled ? 1 : 0,
      o.layers.mask,
    ].join('|');
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(o);
  });

  let batches = 0;
  let merged = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < min) continue;
    const src = bucket[0];
    const inst = new THREE.InstancedMesh(src.geometry, src.material, bucket.length);
    inst.name = `batch:${src.name || src.geometry.type}`;
    inst.castShadow = src.castShadow;
    inst.receiveShadow = src.receiveShadow;
    inst.renderOrder = src.renderOrder;
    inst.visible = src.visible;
    inst.frustumCulled = src.frustumCulled;
    inst.layers.mask = src.layers.mask;
    inst.userData = { ...src.userData };
    for (let i = 0; i < bucket.length; i += 1) {
      const o = bucket[i];
      _mtx.copy(_inv).multiply(o.matrixWorld);
      inst.setMatrixAt(i, _mtx);
      if (o.parent) o.parent.remove(o);
    }
    inst.instanceMatrix.needsUpdate = true;
    node.add(inst);
    batches += 1;
    merged += bucket.length;
  }
  return { batches, merged, saved: merged - batches };
}

/**
 * 低畫質：把**細到看不見**的裝飾網格拿掉。
 *
 * 判準是「它最寬的一軸有多寬」——寬度 < `maxSpan` 的東西一定過不了穿模稽核的
 * 第一關（`RADIUS_MIN` 0.5 ＝ 直徑一公尺），也一定過不了 `markSolidParts()` 的
 * 「最薄兩軸 ≥ 0.9」，所以**拿掉它不可能動到任何一顆碰撞圓**。
 *
 * 只拿頭上沒有網格、底下也沒有網格的那些（同 `instanceStatics()` 的第 2、3 條）——
 * 它們不是任何一片頂面的一部分。
 *
 * @param {THREE.Object3D} node
 * @param {number} maxSpan 世界座標下最寬的一軸小於這個數字就拿掉
 * @returns {number} 拿掉幾個
 */
export function pruneFineDetail(node, maxSpan) {
  node.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const doomed = [];
  node.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.userData && (o.userData.noBatch || o.userData.solid || o.userData.solidSpan)) return;
    if (o.userData && typeof o.userData.solidRadius === 'number') return;
    if (!o.geometry) return;
    for (let p = o.parent; p && p !== node.parent; p = p.parent) if (p.isMesh) return;
    let hasMesh = false;
    o.traverse((c) => {
      if (c !== o && c.isMesh) hasMesh = true;
    });
    if (hasMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    if (span < maxSpan) doomed.push(o);
  });
  for (const o of doomed) if (o.parent) o.parent.remove(o);
  return doomed.length;
}


/* ------------------------------------------------------------------ *
 * 細節分帶（v1.2 · P22b）
 * ------------------------------------------------------------------ */

/**
 * 螢幕像素換算的參考視窗：1080p、垂直視角 55 度。
 * 一個世界半徑 r、離鏡頭 d 的東西，在螢幕上大約占 `2r/d × PX_K` 個像素。
 * 這個常數只是**一把固定的尺**（不隨玩家的視窗大小變），
 * 契約要逐值守，尺就不能會動。
 */
export const PX_K = 1080 / (2 * Math.tan((55 / 2) * (Math.PI / 180)));

/**
 * 小到看不見的裝飾片，離遠了就不畫。
 *
 * 判準是**它在螢幕上占幾個像素**，不是「離多遠」——同一條規則下，
 * 一顆 0.1 公尺的鉚釘在 50 公尺外就退場，一座 12 公尺高的石脊永遠不會。
 * 進 / 出用不同門檻（滯後 0.75 倍），站在邊界上走不會閃。
 *
 * **只碰自己登記過的那些**：登記時要求「當下是看得見的」，
 * 所以像 `handles.js` 的火苗、`finale.js` 的核心那種「蓋出來就是關著、
 * 由自己那一層每幀開關」的網格不會被收進來；就算收進來了，
 * 那一層每一幀都會把自己的答案寫回去 —— 誰每幀寫誰贏，不會有東西被誤開。
 *
 * @param {THREE.Object3D} root
 * @param {object} opts
 * @param {number} opts.px 少於幾個像素就不畫
 * @param {RegExp} [opts.skip] 這些層不收（自己管可見性的層）
 * @param {number} [opts.slices] 分幾幀輪一輪（每幀只算 1/slices）
 */
export function createDetailCull(root, { px = 2, skip = null, slices = 8 } = {}) {
  root.updateMatrixWorld(true);
  const nodes = [];
  const cx = [];
  const cy = [];
  const cz = [];
  const rr = [];
  const box = new THREE.Box3();
  /** 這一片屬於哪一層（root 底下最外面那個有名字的祖先）。 */
  const layerName = (o) => {
    let name = '';
    for (let n = o; n && n !== root; n = n.parent) if (n.name) name = n.name;
    return name;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!o.visible || !o.geometry) return;
    const ud = o.userData || {};
    if (ud.solid || ud.solidSpan || typeof ud.solidRadius === 'number' || ud.blocksCamera) return;
    if (skip && skip.test(layerName(o))) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    const r = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2;
    // 半徑大到「在整個世界的任何一點都超過門檻」的就不必登記（永遠不會退場）
    if (r * 2 * PX_K > px * 420) return;
    nodes.push(o);
    cx.push((box.min.x + box.max.x) / 2);
    cy.push((box.min.y + box.max.y) / 2);
    cz.push((box.min.z + box.max.z) / 2);
    rr.push(r);
  });

  const n = nodes.length;
  const px2 = px * px;
  const off2 = px * 0.75 * (px * 0.75);
  const step = Math.max(1, Math.ceil(n / slices));
  let cursor = 0;

  return {
    /** 登記了幾片（測試會看：0 就是這一支根本沒在做事）。 */
    count: n,
    /**
     * 每幀處理一段。**零每幀配置**：不 new、不 map/filter、不建閉包。
     * @param {{position:{x:number,y:number,z:number}}} camera
     */
    update(camera) {
      if (!n || !camera || !camera.position) return;
      const ex = camera.position.x;
      const ey = camera.position.y;
      const ez = camera.position.z;
      const end = Math.min(n, cursor + step);
      for (let i = cursor; i < end; i += 1) {
        const dx = cx[i] - ex;
        const dy = cy[i] - ey;
        const dz = cz[i] - ez;
        const d2 = dx * dx + dy * dy + dz * dz;
        // (2r/d × K) ≷ px  ⇔  (2rK)² ≷ px² d²（不開根號，§6.2）
        const a = 2 * rr[i] * PX_K;
        const lhs = a * a;
        const node = nodes[i];
        if (node.visible) {
          if (lhs < off2 * d2) node.visible = false;
        } else if (lhs >= px2 * d2) node.visible = true;
      }
      cursor = end >= n ? 0 : end;
    },
    /** 全部量一次（稽核與測試用：不必等輪完八幀）。 */
    updateAll(camera) {
      const saved = cursor;
      cursor = 0;
      for (let k = 0; k < slices + 1; k += 1) this.update(camera);
      cursor = saved;
    },
  };
}

export default { instanceStatics, protectReferenced, protectByName, pruneFineDetail, createDetailCull, PX_K };

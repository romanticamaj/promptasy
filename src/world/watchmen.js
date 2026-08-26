/**
 * Promptasy — 守夜人（Watchman）：這個世界第一個**會回答你的人**（v1.2 · P16c）
 *
 * WORLD.md §1.5 的鐵則沒有被改掉：**這裡沒有會走動的 NPC。**
 * 守夜人本來就不走 —— 他站在自己的崗位上，提著一盞燈，等人走過來。
 * 他會動的只有**頭、光、呼吸**（同濁靈的規矩 §1.6）：不移動、不靠近、不跟隨、
 * 不離開崗位；`prefers-reduced-motion` 之下連呼吸都停掉，只留終態
 * （關掉的是「動」，不是「回應」—— 燈照樣隨著你走近亮起來，頭照樣轉過來）。
 *
 * **0 光源**（護欄：光源固定 37 盞）：燈是自發光材質 ＋ 一片加色混合的光暈 sprite，
 * 不是 `THREE.*Light`。腳下那一圈也是自發光的薄環，不投影、不照亮任何東西。
 *
 * 場景圖命名 `watchman:<id>`（碰撞稽核與 e2e 靠它）；子件：
 *   · `body`  斗篷下襬 —— `userData.solidRadius = 0.55`、`userData.keepSolid = true`
 *             （半徑 < `STAND_MIN_R` 0.8 → 稽核那一邊天生 `standable = false`：
 *             站不上一個人的頭，這件事不必靠旗標宣告，靠尺寸就成立）
 *   · `head`  會轉頭的那一組（兜帽 ＋ 臉）
 *   · `lamp`  提著的那盞燈（`core` 自發光 ＋ `glow` sprite），三種提法（look）
 *   · `ring`  腳下一圈很淡的光（走近亮起來 —— 這是「這裡有人」的 tell）
 *
 * 每幀迴圈照 `murks.js` 那一套：平方距離、45 公尺外整組跳過、15 公尺外每 3 幀一次
 * （index 錯開）、**零每幀配置**（tick 裡不 new、不 map/filter、不建閉包）。
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';

/**
 * 守夜人的互動半徑。
 *
 * **與世界觀石碑同一階（4.6）**，仲裁順序排在石碑**之前**
 * （石座 > 濁靈 > 守夜人 > 石碑 > 刻文小語 > 殘頁 > 器物 > 閘門）——
 * 同半徑、由仲裁順序分先後是既有的文法（刻文小語與殘頁都是 3.8，見 WORLD.md §3.2）。
 *
 * 為什麼不是 5.0：那是**量出來**的。142 座石座（互動半徑 6.5）已經把 12 片土地填得很滿，
 * 「守夜人的互動圈不准與石座的重疊」（d ≥ 11.1）在護欄崗與分歧之廳**全區 0 個落點**
 * （實測全區最好只到 9.10／9.75）。所以對**比他高階**的兩層（石座、濁靈）改守另一條
 * 更貼近實情的規矩：**他不准站進人家的地盤裡**（見 `scripts/lib/screen-rules.mjs`
 * 的 `WATCHMAN_ABOVE_MIN`），再用「量出來的 24 個方向」補上真正要守的東西。
 */
export const WATCHMAN_RADIUS = 4.6;
/** 走到這麼近，他會轉頭看你、燈會亮起來（idle → aware）。 */
export const WATCHMAN_AWARE_RADIUS = 9;
/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
const AWARE_SQ = WATCHMAN_AWARE_RADIUS * WATCHMAN_AWARE_RADIUS;

/** 三種提燈的方式（資料層的 `look` 只認得這三個）。 */
export const WATCHMAN_LOOKS = Object.freeze(['lantern', 'censer', 'wick']);

/** 燈心的暖白 —— 全世界只有成就熱點與人手上的燈是暖的（WORLD.md §2.2）。 */
const LAMP_WARM = 0xffe9c0;

/* ------------------------------------------------------------------ *
 * 幾何體 / 材質快取（重複的東西一律共用）
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
const MAT = new Map();
const mat = (k, make) => {
  let v = MAT.get(k);
  if (!v) {
    v = make();
    MAT.set(k, v);
  }
  return v;
};
let glowTex = null;
function glowTexture() {
  if (!glowTex) glowTex = makeGlowTexture('rgba(255,244,220,1)', 'rgba(180,150,100,0)', 0.3);
  return glowTex;
}

/** 釋放快取（重建世界時呼叫）。 */
export function disposeWatchmanCache() {
  for (const v of GEO.values()) v.dispose();
  GEO.clear();
  for (const v of MAT.values()) v.dispose();
  MAT.clear();
  if (glowTex) {
    glowTex.dispose();
    glowTex = null;
  }
}

const cyl = (rt, rb, h, s) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const ico = (r, d) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ring = (ri, ro, s) => g(`ring:${ri},${ro},${s}`, () => new THREE.RingGeometry(ri, ro, s));

const cloth = (c) => mat(`cloth:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95 }));
const skin = (c, e) =>
  mat(
    `skin:${c}:${e}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: new THREE.Color(e),
        emissiveIntensity: 0.35,
        flatShading: true,
        roughness: 0.88,
      })
  );
const iron = () => mat('iron', () => new THREE.MeshStandardMaterial({ color: 0x2c2f36, flatShading: true, roughness: 0.9 }));

function put(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (Array.isArray(scale)) mesh.scale.set(scale[0], scale[1], scale[2]);
  else mesh.scale.setScalar(scale);
  mesh.userData.noCollide = true;
  parent.add(mesh);
  return mesh;
}

/**
 * 蓋出一位守夜人。
 *
 * 三角形預算：斗篷 28 ＋ 肩 12 ＋ 兜帽 14 ＋ 臉 20 ＋ 提桿 12 ＋ 燈罩 24
 * ＋ 燈心 20 ＋ 光暈 2 ＋ 腳下的環 24 ＝ **156**（12 位 < 1,900）。
 *
 * @param {object} entry watchmen.json 的一筆
 * @param {object} kit   區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildWatchman(entry, kit, terrainHeight) {
  const [x, z] = entry.at;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `watchman:${entry.id}`;
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(entry.rot) ? entry.rot : 0;

  /*
   * 斗篷下襬：唯一的碰撞體。半徑 0.55 —— 一個人擋得住路，但**站不上去**：
   * 0.55 < `STAND_MIN_R`（0.8），所以 `collectSolids()` 量出來的 `standable`
   * 一定是 false，不必也不該手動宣告（可站立體稽核只會往嚴的方向走）。
   */
  const body = new THREE.Mesh(cyl(0.26, 0.44, 1.15, 7), cloth(kit.dark));
  body.name = 'body';
  body.position.y = 0.575;
  body.userData.solidRadius = 0.55;
  body.userData.keepSolid = true;
  grp.add(body);

  // 肩：一塊橫過去的布，讓剪影一眼看得出是人不是石頭
  put(grp, box(0.5, 0.17, 0.27), cloth(kit.mid), [0, 1.2, 0]);

  // 會轉頭的那一組（只轉 Y 軸）
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.34;
  put(head, cyl(0, 0.22, 0.3, 7), cloth(kit.mid), [0, 0.14, 0]);
  put(head, ico(0.13, 0), skin(kit.light, kit.dark), [0, 0.06, 0.04], [0, 0, 0], [1, 1.1, 0.95]);
  grp.add(head);

  /*
   * 提燈的三種樣子（`look`）。差別只在**提法與高度**，零件一樣多 ——
   * 一片土地一種性格，但不必為此多花三角形。
   */
  const look = WATCHMAN_LOOKS.includes(entry.look) ? entry.look : 'lantern';
  const lamp = new THREE.Group();
  lamp.name = 'lamp';
  if (look === 'lantern') {
    // 提在身側、桿子斜出去的燈籠
    put(grp, box(0.045, 0.86, 0.045), iron(), [0.34, 1.02, 0.06], [0.14, 0, -0.16]);
    lamp.position.set(0.46, 0.72, 0.12);
  } else if (look === 'censer') {
    // 吊在鏈子上、垂在身前的爐
    put(grp, box(0.04, 0.66, 0.04), iron(), [0.2, 1.02, 0.24], [0.36, 0, -0.1]);
    lamp.position.set(0.3, 0.78, 0.44);
  } else {
    // 捧在胸前的一截燈芯（最矮、最近）
    put(grp, box(0.05, 0.3, 0.05), iron(), [0.16, 1.02, 0.26], [0.5, 0, 0]);
    lamp.position.set(0.19, 0.95, 0.36);
  }
  put(lamp, cyl(0.085, 0.115, 0.18, 6), iron());
  const coreMat = new THREE.MeshStandardMaterial({
    color: LAMP_WARM,
    emissive: new THREE.Color(LAMP_WARM),
    emissiveIntensity: 1.5,
    flatShading: true,
    roughness: 0.4,
  });
  const core = new THREE.Mesh(ico(0.062, 0), coreMat);
  core.name = 'core';
  core.userData.noCollide = true;
  lamp.add(core);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: LAMP_WARM,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  glow.name = 'glow';
  glow.scale.set(2.4, 2.4, 1);
  glow.userData.noCollide = true;
  lamp.add(glow);
  grp.add(lamp);

  // 腳下一圈很淡的光：走近亮起來、聊過之後留一點餘溫（這是「這裡有人」的 tell）
  const markMat = new THREE.MeshBasicMaterial({
    color: kit.light,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mark = new THREE.Mesh(ring(0.62, 0.76, 12), markMat);
  mark.name = 'ring';
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.05;
  mark.userData.noCollide = true;
  grp.add(mark);

  return {
    id: entry.id,
    entry,
    group: grp,
    body,
    head,
    lamp,
    core,
    coreMat,
    glow,
    mark,
    markMat,
    x,
    z,
    y,
    look,
    /** 崗位的朝向（他永遠回到這個方向 —— 不離開崗位）。 */
    home: Number.isFinite(entry.rot) ? entry.rot : 0,
    position: new THREE.Vector3(x, y, z),
    /** 'idle' | 'aware'。 */
    state: 'idle',
    /** 是不是「玩家附近可互動的那一位」（nearest 更新）。 */
    near: false,
    /** 聊過了沒（存檔）。 */
    met: false,
    facing: 0,
    awareAmt: 0,
    setNear(v) {
      this.near = Boolean(v);
    },
    setMet(v) {
      this.met = Boolean(v);
    },
  };
}

/**
 * 建立整個守夜人場。
 *
 * @param {object} opts
 * @param {Array} opts.entries                    watchmen.json 的 entries
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {()=>boolean} [opts.isBusy]             面板打開時不轉頭
 * @param {boolean} [opts.reducedMotion]          只留終態（不呼吸、不搖）
 * @param {(id:string)=>boolean} [opts.metOf]     建構時還原（存檔）
 */
export function createWatchmanField({
  entries = [],
  kitOf,
  terrainHeight,
  isBusy = null,
  reducedMotion = false,
  metOf = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'watchmen';
  const men = [];
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.at)) continue;
    const built = buildWatchman(entry, kitOf(entry.region), terrainHeight);
    if (typeof metOf === 'function') built.setMet(metOf(entry.id));
    group.add(built.group);
    men.push(built);
  }
  const byId = new Map(men.map((m) => [m.id, m]));
  /** `prefers-reduced-motion`：呼吸與搖擺整個關掉（只留終態）。 */
  const kinetic = reducedMotion ? 0 : 1;
  let frame = 0;

  const api = {
    group,
    watchmen: men,
    get count() {
      return men.length;
    },
    byId(id) {
      return byId.get(id) || null;
    },
    /** 聊過的那幾位（重置進度時整批拉回沒聊過）。 */
    reset() {
      for (let i = 0; i < men.length; i += 1) men[i].setMet(false);
      return true;
    },
    setMet(id, v = true) {
      const m = byId.get(id);
      if (!m) return false;
      m.setMet(v);
      return true;
    },

    /**
     * 玩家附近可互動的那一位（順便更新「走近」的視覺狀態）。
     * 排名式與器物／濁靈同一套：`分數 = 距離 × (1 − 0.35 × 面向點積)`。
     */
    nearest(position, maxDistance = WATCHMAN_RADIUS, forward = null) {
      let best = null;
      let bestDist = maxDistance;
      let bestScore = Infinity;
      for (let i = 0; i < men.length; i += 1) {
        const m = men[i];
        const dx = m.x - position.x;
        const dz = m.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= maxDistance) continue;
        let score = d;
        if (forward && d > 0.05) {
          const dot = (dx / d) * forward.x + (dz / d) * forward.z;
          score = d * (1 - 0.35 * dot);
        }
        if (score < bestScore) {
          bestScore = score;
          bestDist = d;
          best = m;
        }
      }
      for (let i = 0; i < men.length; i += 1) men[i].setNear(men[i] === best);
      return best ? { watchman: best, distance: bestDist } : null;
    },

    /**
     * 每幀更新（玩家座標）。面板打開時他不轉頭，燈照樣呼吸。
     * **零每幀配置**：這裡不 new、不 map/filter、不建閉包。
     */
    update(dt, t, px, pz) {
      frame += 1;
      const busy = isBusy ? isBusy() : false;
      const k = Math.min(1, dt * 3);
      for (let i = 0; i < men.length; i += 1) {
        const m = men[i];
        const dx = px - m.x;
        const dz = pz - m.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FAR_SQ) continue;
        if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;

        const aware = !busy && d2 < AWARE_SQ;
        m.state = aware ? 'aware' : 'idle';
        m.awareAmt += ((aware ? 1 : 0) - m.awareAmt) * k;

        /*
         * 轉頭看你 —— **只轉頭，人不動**。沒人看的時候頭慢慢轉回崗位的朝向
         * （`home`）：他不會因為看過誰而換一個方向站著。
         */
        if (aware && (dx !== 0 || dz !== 0)) {
          // 群組本身已經轉了 `rot`，所以頭的角度要扣掉崗位的朝向
          const want = Math.atan2(dx, dz) - m.group.rotation.y;
          let diff = want - m.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          // 頭只轉得動 ±70 度（再多就要整個人轉過去，而他不轉）
          m.facing = Math.max(-1.22, Math.min(1.22, m.facing + diff * Math.min(1, dt * 2.2)));
        } else {
          m.facing += (0 - m.facing) * Math.min(1, dt * 0.8);
        }
        m.head.rotation.y = m.facing;

        // 呼吸：只有斗篷與頭很輕地起伏（reducedMotion → kinetic 0，整個停掉）
        const breathe = Math.sin(t * 0.9 + i * 1.7) * 0.012 * kinetic;
        m.body.scale.set(1, 1 + breathe, 1);
        m.head.position.y = 1.34 + breathe * 0.9;

        // 燈：走近亮起來（光是回應，不是動 —— reducedMotion 一樣亮）
        m.coreMat.emissiveIntensity = 1.35 + m.awareAmt * 0.9 + Math.sin(t * 1.4 + i) * 0.1 * kinetic;
        m.glow.material.opacity = 0.2 + m.awareAmt * 0.16 + (m.near ? 0.1 : 0);
        m.markMat.opacity = (m.met ? 0.16 : 0.1) + m.awareAmt * 0.16 + (m.near ? 0.12 : 0);
      }
    },
  };
  return api;
}

export default {
  WATCHMAN_RADIUS,
  WATCHMAN_AWARE_RADIUS,
  WATCHMAN_LOOKS,
  buildWatchman,
  createWatchmanField,
  disposeWatchmanCache,
};

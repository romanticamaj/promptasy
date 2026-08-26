/**
 * Promptasy — 守門者（Guardian）：一個**帶著 system prompt 站在門邊的人**（v1.2 · P18）
 *
 * WORLD.md §1.5 的鐵則沒有被改掉：**這裡沒有會走動的 NPC。**
 * 守門者本來就不走——他站在護欄崗那道「不會關上的門」旁邊，胸前掛著一塊寫滿字的板
 * （那塊板就是他的交辦，玩家走近按 `E` 就讀得到整份）。
 * 他會動的只有**頭、板上的字、呼吸**（同守夜人與濁靈的規矩 §1.6）：
 * 不移動、不靠近、不跟隨、不離開崗位；`prefers-reduced-motion` 之下連呼吸都停掉，
 * 只留終態（關掉的是「動」，不是「回應」——板上已經對上的那幾行照樣亮著）。
 *
 * **0 光源**（護欄：光源固定 37 盞）：板上的字是自發光材質 ＋ 加色混合的薄片，
 * 不是 `THREE.*Light`。腳下那一圈也是自發光的薄環，不投影、不照亮任何東西。
 *
 * 場景圖命名 `guardian:<id>`（碰撞稽核與 e2e 靠它）；子件：
 *   · `body`  斗篷下襬 —— `userData.solidRadius = 0.55`、`userData.keepSolid = true`
 *             （半徑 < `STAND_MIN_R` 0.8 → 稽核那一邊天生 `standable = false`：
 *             站不上一個人的頭，這件事不必靠旗標宣告，靠尺寸就成立）
 *   · `head`  會轉頭的那一組（兜帽 ＋ 臉）
 *   · `charge` 胸前那塊板（`marks` ＝ 交辦上的七行，對上一行亮一行）
 *   · `bar`   手上那根門閂
 *   · `ring`  腳下一圈很淡的光（走近亮起來；說服之後留下餘溫）
 *
 * 每幀迴圈照 `watchmen.js` 那一套：平方距離、45 公尺外整組跳過、15 公尺外每 3 幀一次、
 * **零每幀配置**（tick 裡不 new、不 map/filter、不建閉包）。
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';

/**
 * 守門者的互動半徑。
 *
 * **3.2 —— 這是量出來的，不是挑出來的。** 護欄崗是 12 片土地裡最擠的一片
 * （半徑 27 的哨所裡 6 座石座 ＋ 1 隻大濁靈 ＋ 1 位守夜人 ＋ 2 頁殘頁 ＋ 2 件器物
 * ＋ 3 處反應物 ＋ 2 個小景 ＋ 9 顆中觀層的碰撞圓）。
 * `npm run guardian-fit -- --survey` 逐點掃過整片土地（0.5 公尺一格）：
 * 照守夜人那一階（4.6）**一個落點都不剩**，4.0 與 3.8 也是；
 * 收到 3.2 才有 6 個，而且 6 個全部在門邊（離那道門 8.6–10.0 公尺）。
 * 現行出貨的落點離門 10.26 公尺（格點收細之後找到的）。
 *
 * 半徑小於仲裁順序在他後面的層（器物 3.2 同階），**不會**讓他被蓋掉：
 * 他的擺位規則要求**互動圈與每一層都不重疊**（`test:rubric` 逐層量），
 * 所以他的圈裡不會有第二件東西——「半徑跟著仲裁順序遞減」那條慣例
 * （WORLD.md §3.2）本來就是為了避免互相蓋掉，而他根本不與任何人重疊。
 */
export const GUARDIAN_RADIUS = 3.2;
/** 走到這麼近，他會轉頭看你、板上的字會亮起來（idle → aware）。 */
export const GUARDIAN_AWARE_RADIUS = 9;
/** 底座碰撞半徑（同守夜人：擋得住人，但站不上去）。 */
export const GUARDIAN_BODY_RADIUS = 0.55;
/** 交辦上有幾行（畫幾條字）—— 資料多於這個數就只畫得下這麼多。 */
export const GUARDIAN_MARKS = 7;

const FAR_SQ = 45 * 45;
const NEAR_SQ = 15 * 15;
const AWARE_SQ = GUARDIAN_AWARE_RADIUS * GUARDIAN_AWARE_RADIUS;

/** 交辦上的字：冷白（他不是提燈的人，板上那幾行是刻上去的，不是燒出來的）。 */
const CHARGE_INK = 0xdfe8f2;

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
  if (!glowTex) glowTex = makeGlowTexture('rgba(222,234,246,1)', 'rgba(120,140,170,0)', 0.32);
  return glowTex;
}

/** 釋放快取（重建世界時呼叫）。 */
export function disposeGuardianCache() {
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
const plane = (w, h) => g(`plane:${w},${h}`, () => new THREE.PlaneGeometry(w, h));

const cloth = (c) => mat(`cloth:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95 }));
const skin = (c, e) =>
  mat(
    `skin:${c}:${e}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: new THREE.Color(e),
        emissiveIntensity: 0.3,
        flatShading: true,
        roughness: 0.9,
      })
  );
const iron = () => mat('iron', () => new THREE.MeshStandardMaterial({ color: 0x2b2f36, flatShading: true, roughness: 0.9 }));

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
 * 蓋出守門者。
 *
 * 三角形預算：斗篷 28 ＋ 肩 12 ＋ 兜帽 14 ＋ 臉 20 ＋ 板 12 ＋ 板框 12 ＋ 門閂 12
 * ＋ 七行字 14 ＋ 光暈 2 ＋ 腳下的環 24 ＝ **150**（一位）。
 *
 * @param {object} entry guardian.json（`id` / `at` / `rot` / `region`）
 * @param {object} kit   區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildGuardian(entry, kit, terrainHeight) {
  const [x, z] = entry.at;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `guardian:${entry.id}`;
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(entry.rot) ? entry.rot : 0;

  /*
   * 斗篷下襬：唯一的碰撞體。半徑 0.55 —— 一個人擋得住路，但**站不上去**：
   * 0.55 < `STAND_MIN_R`（0.8），所以 `collectSolids()` 量出來的 `standable`
   * 一定是 false，不必也不該手動宣告（可站立體稽核只會往嚴的方向走）。
   */
  const body = new THREE.Mesh(cyl(0.28, 0.46, 1.18, 7), cloth(kit.dark));
  body.name = 'body';
  body.position.y = 0.59;
  body.userData.solidRadius = GUARDIAN_BODY_RADIUS;
  body.userData.keepSolid = true;
  grp.add(body);

  // 肩：一塊橫過去的布，讓剪影一眼看得出是人不是石頭
  put(grp, box(0.54, 0.18, 0.28), cloth(kit.mid), [0, 1.22, 0]);

  // 會轉頭的那一組（只轉 Y 軸）
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.36;
  put(head, cyl(0, 0.23, 0.3, 7), cloth(kit.mid), [0, 0.14, 0]);
  put(head, ico(0.13, 0), skin(kit.light, kit.dark), [0, 0.06, 0.05], [0, 0, 0], [1, 1.1, 0.95]);
  grp.add(head);

  /*
   * 胸前那塊板 ＝ 他的交辦。板上七行字，**對上一行亮一行** ——
   * 「進度只累積」在畫面上的樣子（同大濁靈的規則疊加：亮過的不會再暗回去）。
   */
  const charge = new THREE.Group();
  charge.name = 'charge';
  charge.position.set(0, 0.98, 0.24);
  charge.rotation.x = -0.12;
  put(charge, box(0.36, 0.46, 0.035), iron());
  const marks = [];
  for (let i = 0; i < GUARDIAN_MARKS; i += 1) {
    const m = new THREE.MeshBasicMaterial({
      color: CHARGE_INK,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Mesh(plane(0.24, 0.022), m);
    line.name = `mark${i}`;
    line.position.set(0, 0.18 - i * 0.058, 0.021);
    line.userData.noCollide = true;
    charge.add(line);
    marks.push({ mesh: line, material: m, open: false, amt: 0 });
  }
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: CHARGE_INK,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  halo.name = 'halo';
  halo.scale.set(1.5, 1.5, 1);
  halo.position.z = 0.06;
  halo.userData.noCollide = true;
  charge.add(halo);
  grp.add(charge);

  // 手上那根門閂：豎著、斜靠在身側（他沒有燈 —— 這片土地的光在門那一頭）
  put(grp, box(0.05, 1.05, 0.05), iron(), [0.34, 0.72, 0.02], [0.1, 0, -0.12]);

  // 腳下一圈很淡的光：走近亮起來；說服之後留一點餘溫
  const markMat = new THREE.MeshBasicMaterial({
    color: kit.light,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const foot = new THREE.Mesh(ring(0.64, 0.78, 12), markMat);
  foot.name = 'ring';
  foot.rotation.x = -Math.PI / 2;
  foot.position.y = 0.05;
  foot.userData.noCollide = true;
  grp.add(foot);

  return {
    id: entry.id,
    entry,
    group: grp,
    body,
    head,
    charge,
    marks,
    halo,
    ring: foot,
    markMat,
    x,
    z,
    y,
    /** 崗位的朝向（他永遠回到這個方向 —— 不離開崗位）。 */
    home: Number.isFinite(entry.rot) ? entry.rot : 0,
    position: new THREE.Vector3(x, y, z),
    /** 'idle' | 'aware'。 */
    state: 'idle',
    /** 是不是「玩家附近可互動的那一位」（nearest 更新）。 */
    near: false,
    /** 說服了沒（存檔）。 */
    convinced: false,
    /** 交辦上開了幾行（存檔）。 */
    open: 0,
    facing: 0,
    awareAmt: 0,
    setNear(v) {
      this.near = Boolean(v);
    },
    /**
     * 交辦上哪幾行對上了（索引集合）。**只加不減**：
     * 已經亮起來的那幾行不會因為傳進來的清單變短而暗掉。
     * @param {number[]} indices
     */
    setOpen(indices) {
      const list = Array.isArray(indices) ? indices : [];
      for (let i = 0; i < this.marks.length; i += 1) {
        if (list.includes(i)) this.marks[i].open = true;
      }
      this.open = this.marks.filter((m) => m.open).length;
      return this.open;
    },
    setConvinced(v) {
      this.convinced = Boolean(v);
    },
    /** 重置進度：板上的字全暗回去（存檔清了，世界要跟著清）。 */
    clear() {
      for (let i = 0; i < this.marks.length; i += 1) {
        this.marks[i].open = false;
        this.marks[i].amt = 0;
        this.marks[i].material.opacity = 0.14;
      }
      this.open = 0;
      this.convinced = false;
    },
  };
}

/**
 * 建立守門者場。
 *
 * @param {object} opts
 * @param {Array} opts.entries                    guardian.json（一位就是一筆）
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {()=>boolean} [opts.isBusy]             面板打開時不轉頭
 * @param {boolean} [opts.reducedMotion]          只留終態（不呼吸）
 * @param {(id:string)=>{open:number[], convinced:boolean}|null} [opts.stateOf] 建構時還原（存檔）
 */
export function createGuardianField({
  entries = [],
  kitOf,
  terrainHeight,
  isBusy = null,
  reducedMotion = false,
  stateOf = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'guardians';
  const men = [];
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.at)) continue;
    const built = buildGuardian(entry, kitOf(entry.region), terrainHeight);
    if (typeof stateOf === 'function') {
      const st = stateOf(entry.id);
      if (st) {
        built.setOpen(st.open || []);
        built.setConvinced(st.convinced);
        // 建構時還原不播動畫（同濁靈：重訪時該亮的就已經亮著）
        for (const m of built.marks) if (m.open) m.amt = 1;
      }
    }
    group.add(built.group);
    men.push(built);
  }
  const byId = new Map(men.map((m) => [m.id, m]));
  /** `prefers-reduced-motion`：呼吸整個關掉（只留終態）。 */
  const kinetic = reducedMotion ? 0 : 1;
  let frame = 0;

  const api = {
    group,
    guardians: men,
    get count() {
      return men.length;
    },
    byId(id) {
      return byId.get(id) || null;
    },
    /** 重置進度時整批拉回「還沒說服、板上全暗」。 */
    reset() {
      for (let i = 0; i < men.length; i += 1) men[i].clear();
      return true;
    },
    /** 交辦上哪幾行對上了（只加不減）。 */
    setOpen(id, indices) {
      const m = byId.get(id);
      if (!m) return false;
      m.setOpen(indices);
      return true;
    },
    setConvinced(id, v = true) {
      const m = byId.get(id);
      if (!m) return false;
      m.setConvinced(v);
      return true;
    },

    /**
     * 玩家附近可互動的那一位（順便更新「走近」的視覺狀態）。
     * 排名式與器物／濁靈／守夜人同一套：`分數 = 距離 × (1 − 0.35 × 面向點積)`。
     */
    nearest(position, maxDistance = GUARDIAN_RADIUS, forward = null) {
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
      return best ? { guardian: best, distance: bestDist } : null;
    },

    /**
     * 每幀更新（玩家座標）。面板打開時他不轉頭，板上的字照樣亮。
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
        const breathe = Math.sin(t * 0.85 + i * 1.3) * 0.011 * kinetic;
        m.body.scale.set(1, 1 + breathe, 1);
        m.head.position.y = 1.36 + breathe * 0.9;

        // 交辦上對上的那幾行亮起來（亮過的不會暗回去 —— 進度只累積）
        for (let j = 0; j < m.marks.length; j += 1) {
          const mk = m.marks[j];
          const want = mk.open ? 1 : 0;
          mk.amt += (want - mk.amt) * k;
          mk.material.opacity = 0.14 + mk.amt * (0.62 + m.awareAmt * 0.2);
        }
        m.halo.material.opacity = 0.08 + m.awareAmt * 0.1 + (m.convinced ? 0.12 : 0);
        m.markMat.opacity = (m.convinced ? 0.18 : 0.1) + m.awareAmt * 0.16 + (m.near ? 0.12 : 0);
      }
    },
  };
  return api;
}

export default {
  GUARDIAN_RADIUS,
  GUARDIAN_AWARE_RADIUS,
  GUARDIAN_BODY_RADIUS,
  GUARDIAN_MARKS,
  buildGuardian,
  createGuardianField,
  disposeGuardianCache,
};

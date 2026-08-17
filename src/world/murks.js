/**
 * Promptasy — 濁靈（Murk）：一段「寫壞的請求」具象化的小生物（v1.2 · P01）
 *
 * 牠是**留在原地的東西**（WORLD.md：世界裡沒有會走動的 NPC）：
 * 一團低矮的暗色濁氣在原地翻湧，中央一顆微弱的眼光。玩家走近（≤ 8 公尺）
 * 牠只會轉頭看你；按 `E` 開既有的主控台，用一段好 prompt 去「安撫」牠。
 *
 * 這一個 phase（P01）只有 idle → aware 兩個狀態；剝殼／安撫／清燈的演出留給 P03，
 * 存檔與圖鑑留給 P02 —— 所以這裡刻意**沒有**任何跟評分結果有關的方法。
 *
 * 樣板照 `reactive.js`：
 *   · 平方距離、45 公尺外整組跳過、15 公尺外每 3 幀一次（index 錯開）
 *   · **零每幀配置**：暫存變數提到模組層，tick 裡不 new、不 map/filter、不建閉包
 *   · **0 光源**：眼光與濁氣全部是自發光／半透明材質
 *   · 每隻 ≤ 600 三角形（8 隻 < 5k）
 *
 * 場景圖命名 `murk:<id>`（碰撞稽核與 e2e 靠它）；子件：
 *   · `body`  實心底座 —— `userData.solidRadius = 0.9`、`userData.keepSolid = true`
 *             （靠石座 < 9.9 公尺時，`noCollideZones` 不會把牠當雜物掃掉）
 *   · `head`  會轉頭的那一團（含 `core` 眼光）
 *   · `shells[]` 濁氣殼，數量＝rubric 條數，**半透明材質**（穿模稽核自動免除）
 *   · `glow`  一片加色混合的光暈 sprite
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';

/** 濁靈的互動半徑：介於石座（6.5）與石碑（4.6）之間（WORLD.md §3.2 的遞減規則）。 */
export const MURK_RADIUS = 5.5;
/** 走到這麼近，牠會轉頭看你（idle → aware）。 */
export const MURK_AWARE_RADIUS = 8;
/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
const AWARE_SQ = MURK_AWARE_RADIUS * MURK_AWARE_RADIUS;

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
/** 材質快取（WORLD.md 檢查表 E16：同色盤的濁靈共用材質；P03 要逐隻動的殼再另外 clone）。 */
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
  if (!glowTex) glowTex = makeGlowTexture('rgba(255,255,255,1)', 'rgba(120,140,170,0)', 0.28);
  return glowTex;
}

/** 釋放快取（重建世界時呼叫）。 */
export function disposeMurkCache() {
  for (const v of GEO.values()) v.dispose();
  GEO.clear();
  for (const v of MAT.values()) v.dispose();
  MAT.clear();
  if (glowTex) {
    glowTex.dispose();
    glowTex = null;
  }
}

/* 三角形預算（IcosahedronGeometry：detail 0 = 20 面、detail 1 = 80 面）
 *   body 80 ＋ head 80 ＋ core 20 ＋ shells 3 × 80 ＝ 420；sprite 2 → 每隻 ≤ 600。 */
const bodyGeo = () => g('body', () => new THREE.IcosahedronGeometry(0.9, 1));
const headGeo = () => g('head', () => new THREE.IcosahedronGeometry(0.4, 1));
const coreGeo = () => g('core', () => new THREE.IcosahedronGeometry(0.11, 0));
const shellGeo = (r) => g(`shell:${r}`, () => new THREE.IcosahedronGeometry(r, 1));

/**
 * 蓋出一隻濁靈。
 * @param {object} entry   murks.json 的一筆
 * @param {object} kit     區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildMurk(entry, kit, terrainHeight) {
  const [x, z] = entry.at;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `murk:${entry.id}`;
  grp.position.set(x, y, z);

  // 底座：實心、擋人。低矮的一團「被弄髒的地面」。
  const body = new THREE.Mesh(
    bodyGeo(),
    mat(`body:${kit.dark}`, () => new THREE.MeshStandardMaterial({ color: kit.dark, flatShading: true, roughness: 0.96 }))
  );
  body.name = 'body';
  // 只壓扁 Y：碰撞半徑＝幾何半徑 × 水平縮放，這樣登記表上就是 0.9 整
  body.scale.set(1, 0.42, 1);
  body.position.y = 0.3;
  body.userData.solidRadius = 0.9;
  // keepSolid：與石座本體同待遇——淨空區掃雜物時不准把牠掃掉。
  // （半徑 0.9 > CLUTTER_RADIUS，`inNoCollideZone` 本來就不會把牠當雜物；這面旗是「宣告牠是主體」的保險，不是必要條件。）
  body.userData.keepSolid = true;
  grp.add(body);

  // 會轉頭的那一團 ＋ 眼光
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.05;
  const headMat = mat(
    `head:${kit.mid}:${kit.dark}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: kit.mid,
        emissive: new THREE.Color(kit.dark),
        emissiveIntensity: 0.6,
        flatShading: true,
        roughness: 0.85,
      })
  );
  const headMesh = new THREE.Mesh(headGeo(), headMat);
  headMesh.scale.set(1.15, 0.9, 1.15);
  head.add(headMesh);
  const coreMat = new THREE.MeshStandardMaterial({
    color: kit.light,
    emissive: new THREE.Color(kit.light),
    emissiveIntensity: 1.4,
    flatShading: true,
    roughness: 0.4,
  });
  const core = new THREE.Mesh(coreGeo(), coreMat);
  core.name = 'core';
  core.position.set(0, 0.04, 0.42);
  head.add(core);
  grp.add(head);

  // 濁氣殼：一條 rubric 一層，半透明、不擋人（稽核自動免除）
  const shells = [];
  const n = Math.max(1, (entry.rubric || []).length);
  for (let i = 0; i < n; i += 1) {
    const r = 0.95 + i * 0.28;
    // 同色盤同一層的殼共用一份材質；只畫正面（半透明的背面 overdraw 沒有必要）
    const shellMat = mat(
      `shell:${kit.mid}:${i}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: kit.mid,
          transparent: true,
          opacity: 0.2 - i * 0.04,
          depthWrite: false,
          side: THREE.FrontSide,
        })
    );
    const shell = new THREE.Mesh(shellGeo(Math.round(r * 100) / 100), shellMat);
    shell.name = `shell:${i}`;
    shell.position.y = 0.95;
    shell.scale.set(1, 0.78, 1);
    shell.rotation.set(i * 0.7, i * 1.3, 0);
    grp.add(shell);
    shells.push(shell);
  }

  // 光暈：一片加色混合的 sprite（不是光源）
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: kit.light,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  glow.name = 'glow';
  glow.position.y = 1.05;
  glow.scale.set(3.2, 3.2, 1);
  glow.userData.noCollide = true;
  grp.add(glow);

  return {
    id: entry.id,
    entry,
    group: grp,
    body,
    head,
    core,
    coreMat,
    shells,
    glow,
    x,
    z,
    position: new THREE.Vector3(x, y, z),
    /** 目前狀態：'idle' | 'aware'（P03 再加 struck / calming / settled）。 */
    state: 'idle',
    /** 是不是「玩家附近可互動的那一隻」（nearest 更新）。 */
    near: false,
    facing: 0,
    awareAmt: 0,
    setNear(v) {
      this.near = Boolean(v);
    },
  };
}

/**
 * 建立整個濁靈場：蓋出所有濁靈、每幀更新離玩家近的那幾隻。
 *
 * @param {object} opts
 * @param {Array} opts.entries                    murks.json 的 entries
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {()=>boolean} [opts.isBusy]             面板打開時整組停手（不轉頭）
 * @param {boolean} [opts.reducedMotion]
 */
export function createMurkField({ entries = [], kitOf, terrainHeight, isBusy = null, reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'murks';
  const murks = [];
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.at)) continue;
    const built = buildMurk(entry, kitOf(entry.region), terrainHeight);
    group.add(built.group);
    murks.push(built);
  }
  const byId = new Map(murks.map((m) => [m.id, m]));
  const kinetic = reducedMotion ? 0.12 : 1;
  let frame = 0;

  return {
    group,
    murks,
    get count() {
      return murks.length;
    },
    /** 這隻濁靈（測試與其他系統用）。 */
    byId(id) {
      return byId.get(id) || null;
    },
    /**
     * 玩家附近可互動的那一隻（順便更新「走近」的視覺狀態）。
     * 排名式與器物同一套：`分數 = 距離 × (1 − 0.35 × 面向點積)`；沒有給面向時退回純距離。
     * @param {{x:number,z:number}} position
     * @param {number} [maxDistance]
     * @param {{x:number,z:number}|null} [forward] 鏡頭的水平前方向（單位向量）
     */
    nearest(position, maxDistance = MURK_RADIUS, forward = null) {
      let best = null;
      let bestDist = maxDistance;
      let bestScore = Infinity;
      for (let i = 0; i < murks.length; i += 1) {
        const m = murks[i];
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
      for (let i = 0; i < murks.length; i += 1) murks[i].setNear(murks[i] === best);
      return best ? { murk: best, distance: bestDist } : null;
    },
    /**
     * 每幀更新（玩家座標）。面板打開時牠不轉頭、但濁氣照樣慢慢翻湧。
     * @param {number} dt
     * @param {number} t
     * @param {number} px
     * @param {number} pz
     */
    update(dt, t, px, pz) {
      frame += 1;
      const busy = isBusy ? isBusy() : false;
      const k = Math.min(1, dt * 3);
      for (let i = 0; i < murks.length; i += 1) {
        const m = murks[i];
        const dx = px - m.x;
        const dz = pz - m.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FAR_SQ) continue;
        if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;

        // idle → aware：走到 8 公尺內牠會注意到你（面板打開時停手）
        const aware = !busy && d2 < AWARE_SQ;
        m.state = aware ? 'aware' : 'idle';
        m.awareAmt += ((aware ? 1 : 0) - m.awareAmt) * k;

        // 轉頭看你（只轉 Y 軸；不移動、不靠近）
        if (aware && (dx !== 0 || dz !== 0)) {
          const want = Math.atan2(dx, dz);
          let diff = want - m.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          m.facing += diff * Math.min(1, dt * 2.4);
        } else if (!aware) {
          // 沒人看的時候慢慢左右張望
          m.facing += (Math.sin(t * 0.35 + i) * 0.6 - m.facing) * Math.min(1, dt * 0.6);
        }
        m.head.rotation.y = m.facing;

        // 濁氣翻湧：殼慢慢轉、輕微呼吸；眼光隨著注意力變亮
        const breathe = 1 + Math.sin(t * 1.3 + i * 0.9) * 0.04 * kinetic;
        for (let s = 0; s < m.shells.length; s += 1) {
          const shell = m.shells[s];
          const dir = s % 2 === 0 ? 1 : -1;
          shell.rotation.y = t * (0.18 + s * 0.06) * dir * kinetic;
          shell.rotation.x = s * 0.7 + Math.sin(t * 0.7 + s) * 0.08 * kinetic;
          const sc = breathe + s * 0.01;
          shell.scale.set(sc, 0.78 * sc, sc);
        }
        m.head.position.y = 1.05 + Math.sin(t * 1.6 + i) * 0.05 * kinetic;
        m.coreMat.emissiveIntensity = 1.1 + m.awareAmt * 1.2 + Math.sin(t * 5.1 + i) * 0.1;
        m.glow.material.opacity = 0.16 + m.awareAmt * 0.16 + (m.near ? 0.1 : 0);
      }
    },
  };
}

export default { MURK_RADIUS, MURK_AWARE_RADIUS, buildMurk, createMurkField, disposeMurkCache };

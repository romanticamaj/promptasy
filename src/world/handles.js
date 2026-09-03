/**
 * Promptasy — 動得了的器物（handled props）
 *
 * 世界裡的第五層互動。前四層是：
 *
 *   ① 反應      走過去它就有反應（風鈴 / 音石 / 光菇 / 水紋 / 小獸 / 螢火）
 *   ② 風味      世界觀石碑、藏起來的地方
 *   ③ 小語      刻文小語（教一件很小的事）
 *   ④ 關卡      石座（四幕分鏡、完整評分）
 *   **⑤ 器物（這一層）** 抄寫人留在原地、你真的動得了的東西
 *
 * 這一層要解決的是一個很具體的問題：**這片土地上的東西你只能看，不能碰。**
 * 常見的探索型 RPG 會在路邊放一堆「動得了的小東西」——罐子、火盆、鑼、絞盤、
 * 長凳——它們不推進主線，但每一件都會回你一下。密度比獎勵重要：
 * 走過去、按一下、它有反應，這件事本身就是回饋。
 *
 * 護欄（WORLD.md §3.2 / 檢查表 8）：
 *   · 這一層跟世界觀石碑同一種東西 —— **純風味**。
 *     不教技巧、不掛 techniqueId、不放連結、資料層不准有 source / teaches。
 *     真正的教學一律留在關卡、刻文小語與圖鑑。
 *   · **只用 `E`**（世界唯一的互動鍵）。絞盤要推三下也是按三次 E，
 *     不發明「按住」或第二個鍵。
 *   · 互動半徑 3.2 —— 比刻文小語（3.8）再小一階，
 *     所以它永遠不會從石座 / 石碑 / 刻文手上把 E 搶走。
 *   · **不新增任何光源**（§6.1）：火、眼睛、光魚、光柱全部走自發光材質與加色光暈片。
 *   · 幾何體與材質走模組層快取；每幀迴圈用平方距離、零配置。
 *   · `prefers-reduced-motion` 關掉的是「動」，不是「回應」——
 *     光還是會亮、聲音還是會響，只是不再甩動 / 噴散。
 */
import * as THREE from 'three';
import { PALETTE } from '../engine/engine.js';

/* ------------------------------------------------------------------ *
 * 幾何體 / 材質快取
 * ------------------------------------------------------------------ */
const GEO = new Map();
const MAT = new Map();
const g = (k, make) => {
  let v = GEO.get(k);
  if (!v) {
    v = make();
    GEO.set(k, v);
  }
  return v;
};
const mt = (k, make) => {
  let v = MAT.get(k);
  if (!v) {
    v = make();
    MAT.set(k, v);
  }
  return v;
};

/** 釋放快取（重建世界時呼叫）。 */
export function disposeHandleCache() {
  for (const v of GEO.values()) v.dispose();
  for (const v of MAT.values()) v.dispose();
  GEO.clear();
  MAT.clear();
}

const cyl = (rt, rb, h, s = 8) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d = 0) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const cone = (r, h, s = 6) => g(`cone:${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t, s = 4, ts = 20) => g(`tor:${r},${t},${s},${ts}`, () => new THREE.TorusGeometry(r, t, s, ts));
const disc = (r, s = 22) => g(`disc:${r},${s}`, () => new THREE.CircleGeometry(r, s));
const boxg = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));

const stone = (c) => mt(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.93 }));
const clay = () => mt('clay', () => new THREE.MeshStandardMaterial({ color: 0x6b4c3a, flatShading: true, roughness: 0.88 }));
const wood = () => mt('wood', () => new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true, roughness: 0.95 }));
const metal = () =>
  mt('metal', () => new THREE.MeshStandardMaterial({ color: 0x8b9aa6, flatShading: true, roughness: 0.34, metalness: 0.62 }));
const ash = () => mt('ash', () => new THREE.MeshStandardMaterial({ color: 0x241d1a, flatShading: true, roughness: 1 }));

/** 自發光材質（每個實例各自一份 —— 它們要各自亮起來）。 */
function emissive(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    flatShading: true,
    roughness: 0.5,
  });
}

/** 加色混合的光暈片（火光、水紋、光柱、指向）。 */
function aura(color, opacity = 0.3) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
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
 * 全層共用的常數
 * ------------------------------------------------------------------ */

/**
 * 互動半徑。刻意比刻文小語（3.8）再小一階 ——
 * 搶 E 的優先序是「石座 > 石碑 > 刻文小語 > 器物 > 閘門」，半徑依序遞減。
 */
export const HANDLE_RADIUS = 3.2;

/** 第一次動它給的 XP（比刻文小語再少一點：這一層不教東西）。 */
export const HANDLE_XP = 4;

/** 絞盤要推幾下才轉得動（按三次 E，不發明「按住」）。 */
export const CAPSTAN_TURNS = 3;

/* ------------------------------------------------------------------ *
 * 八種器物
 * ------------------------------------------------------------------ *
 *
 * 每一種都回傳同一個介面：
 *   { group, parts…, near, used, setNear(v), setUsed(v),
 *     activate(ctx) → { sound, toast, panel, complete, pose },
 *     update(dt, t, kinetic, near) }
 *
 * `activate` 是「按下 E 的那一瞬間」，只回報要發生什麼；
 * 給 XP、寫存檔、開小窗都由 main.js 決定（同刻文小語與祕密的作法）。
 */

/**
 * ① 陶罐（urn）：抄寫人裝碎刻痕的罐子。掀開蓋子，裡面剩下一句沒刻完的話。
 * 一次性 —— 開過就空了，但你隨時可以再看一眼罐底寫什麼。
 */
function buildUrn(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.34, 0.26, 0.14, 9), stone(kit.dark), [0, 0.07, 0]);
  put(grp, cyl(0.24, 0.33, 0.62, 9), clay(), [0, 0.44, 0]);
  put(grp, cyl(0.19, 0.24, 0.2, 9), clay(), [0, 0.84, 0]);
  // 罐口的一圈刻痕（走近會亮）
  const rim = put(grp, torus(0.2, 0.028, 4, 16), aura(kit.light, 0.18), [0, 0.94, 0], [-Math.PI / 2, 0, 0]);
  // 蓋子掛在一個 pivot 上：掀開時整個往後仰、往上抬
  const lidPivot = new THREE.Object3D();
  lidPivot.position.set(0, 0.94, -0.18);
  grp.add(lidPivot);
  put(lidPivot, cyl(0.16, 0.22, 0.09, 9), clay(), [0, 0.02, 0.18]);
  put(lidPivot, ico(0.06, 0), clay(), [0, 0.09, 0.18]);
  // 罐裡飄出來的那一縷光
  const wisp = put(grp, ico(0.09, 0), emissive(PALETTE.warm, 0), [0, 0.95, 0]);
  wisp.visible = false;

  return {
    group: grp,
    solidRadius: 0.52,
    lidPivot,
    rim,
    wisp,
    open: 0, // 0 = 蓋著、1 = 全開
    puff: 0,
    activate() {
      const first = !this.used;
      if (first) this.puff = 1;
      return {
        sound: first ? 'lid' : 'openSoft',
        panel: 'urn',
        complete: true,
      };
    },
    setUsed(v) {
      this.used = Boolean(v);
      if (this.used) this.open = 1;
    },
    update(dt, t, kinetic, near) {
      const want = this.used ? 1 : 0;
      this.open += (want - this.open) * Math.min(1, dt * 3.2);
      this.lidPivot.rotation.x = -this.open * 1.15 * (0.25 + kinetic * 0.75);
      this.lidPivot.position.y = 0.94 + this.open * 0.06;
      this.puff = Math.max(0, this.puff - dt * 0.6);
      this.wisp.visible = this.puff > 0.02;
      if (this.wisp.visible) {
        this.wisp.position.y = 0.95 + (1 - this.puff) * 1.15 * kinetic;
        this.wisp.material.emissiveIntensity = this.puff * 3.4;
        this.wisp.scale.setScalar(0.4 + this.puff * 0.8);
      }
      this.rim.material.opacity = (near > 0.35 ? 0.42 : 0.14) + Math.sin(t * 1.8) * 0.04;
    },
  };
}

/**
 * ② 火盆（brazier）：抄寫人夜裡烤手的地方，火早就熄了。
 * 點起來之後就一直亮著（存檔記得），這是這片土地上少數「你留下的痕跡」。
 */
function buildBrazier(kit) {
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    put(grp, cyl(0.07, 0.1, 0.72, 5), metal(), [Math.cos(a) * 0.34, 0.36, Math.sin(a) * 0.34], [Math.cos(a) * 0.16, 0, -Math.sin(a) * 0.16]);
  }
  put(grp, cyl(0.56, 0.34, 0.34, 9), metal(), [0, 0.86, 0]);
  // 灰燼是一片零厚度的圓 —— 盆身已經擋住人了，不用再多一個碰撞體
  put(grp, disc(0.5, 14), ash(), [0, 0.99, 0], [-Math.PI / 2, 0, 0]).userData.noCollide = true;
  // 火：兩層反向轉的錐體 ＋ 一片地面暖光（全部自發光，不加光源）
  const flameA = put(grp, cone(0.3, 0.62, 6), emissive(PALETTE.warm, 0), [0, 1.28, 0]);
  const flameB = put(grp, cone(0.19, 0.94, 5), emissive(0xffd9a0, 0), [0, 1.42, 0]);
  const glow = put(grp, disc(1.9, 20), aura(PALETTE.warm, 0), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
  const halo = put(grp, disc(0.9, 16), aura(PALETTE.warm, 0), [0, 1.3, 0]);
  halo.material.side = THREE.DoubleSide;

  return {
    group: grp,
    flameA,
    flameB,
    glow,
    halo,
    lit: 0,
    poke: 0,
    activate() {
      const first = !this.used;
      if (!first) this.poke = 1;
      return {
        sound: first ? 'ignite' : 'ember',
        complete: true,
        // 一句話就好 —— 不開窗、不打斷走路
        toastKey: first ? 'lit' : 'poke',
      };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic, near) {
      const want = this.used ? 1 : 0;
      this.lit += (want - this.lit) * Math.min(1, dt * 2.4);
      this.poke = Math.max(0, this.poke - dt * 1.4);
      const flick = 1 + Math.sin(t * 8.3) * 0.16 * kinetic + Math.sin(t * 3.1) * 0.09 * kinetic + this.poke * 0.7;
      this.flameA.material.emissiveIntensity = this.lit * 3.1 * flick;
      this.flameB.material.emissiveIntensity = this.lit * 4.4 * flick;
      this.flameA.scale.set(1, 0.8 + this.lit * (0.4 + this.poke * 0.3) * flick, 1);
      this.flameB.scale.set(1, 0.7 + this.lit * 0.5 * flick, 1);
      this.flameA.visible = this.lit > 0.02;
      this.flameB.visible = this.lit > 0.02;
      this.glow.material.opacity = this.lit * 0.16 * flick;
      this.halo.material.opacity = this.lit * 0.12 * flick;
      // 沒點著的時候：走近，灰燼底下透出一點餘溫
      if (this.lit < 0.2) this.glow.material.opacity = near > 0.4 ? 0.05 : 0.015;
    },
  };
}

/**
 * ③ 響石（gong）：吊在木架上的一面石盤。敲一下，餘音很久。
 * 可以一直敲 —— 這是整層裡最「沒有用」也最像 RPG 的一件東西。
 */
function buildGong(kit) {
  const grp = new THREE.Group();
  for (const side of [-1, 1]) {
    put(grp, cyl(0.1, 0.13, 2.2, 5), wood(), [side * 0.86, 1.1, 0], [0, 0, -side * 0.11]);
  }
  put(grp, cyl(0.08, 0.08, 1.9, 5), wood(), [0, 2.14, 0], [0, 0, Math.PI / 2]);
  // 盤子掛在一個 pivot 上：敲下去會前後晃
  const swingPivot = new THREE.Object3D();
  swingPivot.position.set(0, 2.1, 0);
  grp.add(swingPivot);
  for (const side of [-1, 1]) put(swingPivot, cyl(0.02, 0.02, 0.42, 4), metal(), [side * 0.3, -0.21, 0]);
  const face = put(swingPivot, cyl(0.66, 0.66, 0.11, 14), stone(kit.mid), [0, -0.86, 0], [Math.PI / 2, 0, 0]);
  const vein = put(swingPivot, torus(0.44, 0.035, 4, 18), emissive(kit.light, 0.2), [0, -0.86, 0.07]);
  // 敲下去擴散的光環
  const ringMat = aura(kit.light, 0);
  const ring = put(swingPivot, torus(0.7, 0.04, 4, 22), ringMat, [0, -0.86, 0.09]);
  ring.visible = false;
  // 掛在旁邊的木槌
  put(grp, cyl(0.045, 0.045, 0.72, 5), wood(), [0.78, 0.9, 0.22], [0.3, 0, 0.24]);
  put(grp, cyl(0.12, 0.12, 0.16, 7), wood(), [0.66, 1.24, 0.32], [0.3, 0, 0.24]);

  return {
    group: grp,
    swingPivot,
    face,
    vein,
    ring,
    ringMat,
    hit: 0,
    activate() {
      this.hit = 1;
      this.ring.visible = true;
      return { sound: 'gong', complete: true, toastKey: this.used ? null : 'struck', shake: 0.3 };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic) {
      this.hit = Math.max(0, this.hit - dt * 0.42);
      const amp = this.hit * 0.3 * kinetic;
      this.swingPivot.rotation.x = Math.sin(t * 4.6) * amp;
      this.swingPivot.rotation.z = Math.sin(t * 3.3 + 1.1) * amp * 0.4;
      this.vein.material.emissiveIntensity = 0.18 + this.hit * 2.6;
      if (this.hit > 0.02) {
        const k = 1 - this.hit;
        this.ring.scale.setScalar(0.5 + k * 2.2 * (0.35 + kinetic * 0.65));
        this.ringMat.opacity = this.hit * 0.45;
      } else if (this.ring.visible) {
        this.ring.visible = false;
        this.ringMat.opacity = 0;
      }
    },
  };
}

/**
 * ④ 守望石（watchstone）：一頭蹲著的石獸，眼睛閉著。
 * 摸它一下，它會睜眼，然後把頭轉向**你還沒解開的那座石座**。
 * 這是世界裡唯一一件「會指路」的器物 —— 指南針的實體版本。
 */
function buildWatchstone(kit) {
  const grp = new THREE.Group();
  put(grp, boxg(1.16, 0.44, 1.34), stone(kit.dark), [0, 0.22, 0]);
  put(grp, ico(0.56, 0), stone(kit.mid), [0, 0.72, -0.06], [0.1, 0.4, 0], [1.05, 0.86, 1.2]);
  // 頭在自己的 pivot 上（轉向目標）
  const headPivot = new THREE.Object3D();
  headPivot.position.set(0, 1.1, 0.16);
  grp.add(headPivot);
  put(headPivot, ico(0.32, 0), stone(kit.mid), [0, 0, 0.1], [0, 0, 0], [1, 0.94, 1.15]);
  for (const side of [-1, 1]) put(headPivot, cone(0.1, 0.24, 4), stone(kit.mid), [side * 0.16, 0.28, 0.02]);
  const eyes = [];
  for (const side of [-1, 1]) {
    eyes.push(put(headPivot, ico(0.062, 0), emissive(kit.light, 0.1), [side * 0.13, 0.02, 0.36]));
  }
  // 前爪
  for (const side of [-1, 1]) put(grp, cyl(0.12, 0.15, 0.4, 6), stone(kit.dark), [side * 0.34, 0.2, 0.62]);
  // 指向：一片很扁的加色扇形，睜眼時朝著目標亮一下
  const beamMat = aura(kit.light, 0);
  const beam = put(grp, cone(0.85, 4.6, 5), beamMat, [0, 0.28, 2.3], [Math.PI / 2, 0, 0], [1, 1, 0.06]);
  beam.visible = false;

  return {
    group: grp,
    headPivot,
    eyes,
    beam,
    beamMat,
    wake: 0,
    facing: 0,
    target: null,
    activate(ctx) {
      this.wake = 1;
      this.target = ctx && ctx.aimAt ? { x: ctx.aimAt.x, z: ctx.aimAt.z, name: ctx.aimAt.name } : null;
      this.beam.visible = Boolean(this.target);
      return {
        sound: 'touchstone',
        complete: true,
        toastKey: this.target ? 'aim' : 'blind',
        aim: this.target ? this.target.name : null,
      };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic) {
      this.wake = Math.max(0, this.wake - dt * 0.16);
      // 睜眼之後慢慢閉回去（約 6 秒）
      const open = this.wake;
      for (const e of this.eyes) e.material.emissiveIntensity = 0.08 + open * 3.6;
      // 頭轉向目標；沒有目標就慢慢轉回正面
      let want = 0;
      if (this.target) {
        want = Math.atan2(this.target.x - this.worldX, this.target.z - this.worldZ) - this.baseRot;
      }
      let diff = want - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * (1.4 + kinetic));
      this.headPivot.rotation.y = this.facing;
      this.headPivot.position.y = 1.1 + Math.sin(t * 0.7) * 0.012 * kinetic;
      if (this.beam.visible) {
        this.beam.rotation.z = -this.facing;
        this.beam.position.set(Math.sin(this.facing) * 2.3, 0.28, Math.cos(this.facing) * 2.3);
        this.beamMat.opacity = open * 0.14;
        if (open <= 0.01) this.beam.visible = false;
      }
    },
  };
}

/**
 * ⑤ 撈月池（moonpool）：一圈矮石圍出的淺水，水裡有幾條光。
 * 撈一把，其中一條會跟著你的手浮起來，然後散掉。一次性。
 */
function buildMoonpool(kit) {
  const grp = new THREE.Group();
  const r = 1.55;
  // 矮到「跨得過去」的石緣（頂緣 < 0.4 → 碰撞稽核判定為貼地矮件，不擋路）
  put(grp, torus(r, 0.17, 4, 20), stone(kit.dark), [0, 0.17, 0], [-Math.PI / 2, 0, 0]);
  put(
    grp,
    disc(r, 22),
    mt(`water:${kit.accent}`, () =>
      new THREE.MeshStandardMaterial({
        color: 0x16293b,
        roughness: 0.16,
        metalness: 0.42,
        emissive: new THREE.Color(kit.accent).multiplyScalar(0.18),
        transparent: true,
        opacity: 0.93,
      })
    ),
    [0, 0.12, 0],
    [-Math.PI / 2, 0, 0]
  );
  // 靠在池邊的長柄杓
  put(grp, cyl(0.04, 0.045, 1.9, 5), wood(), [r * 0.76, 0.82, -r * 0.5], [0.42, 0.7, 0.3]);
  put(grp, cyl(0.16, 0.13, 0.13, 8), wood(), [r * 1.05, 1.62, -r * 0.86]);
  // 光魚：三條在水面下慢慢繞
  const fish = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = emissive(PALETTE.moon, 1.5);
    const body = put(grp, ico(0.11, 0), mat, [0, 0.14, 0], [0, 0, 0], [1.7, 0.4, 0.75]);
    fish.push({ body, mat, phase: i * 2.1, rad: 0.45 + i * 0.32 });
  }
  const ringMat = aura(PALETTE.moon, 0);
  const ring = put(grp, torus(0.5, 0.03, 4, 20), ringMat, [0, 0.15, 0], [-Math.PI / 2, 0, 0]);
  ring.visible = false;

  return {
    group: grp,
    fish,
    ring,
    ringMat,
    scoop: 0,
    activate() {
      this.scoop = 1;
      this.ring.visible = true;
      return { sound: 'scoop', complete: true, toastKey: this.used ? 'again' : 'caught' };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic, near) {
      this.scoop = Math.max(0, this.scoop - dt * 0.55);
      const calm = this.used ? 0.35 : 1;
      for (let i = 0; i < this.fish.length; i += 1) {
        const f = this.fish[i];
        const a = t * (0.32 + i * 0.09) * (0.3 + kinetic * 0.7) + f.phase;
        f.body.position.set(Math.cos(a) * f.rad, 0.14 + Math.sin(a * 1.7) * 0.02, Math.sin(a) * f.rad);
        f.body.rotation.y = -a;
        // 撈起來的那一下：一條浮出水面再散掉
        const lift = i === 0 ? this.scoop : 0;
        f.body.position.y += lift * 0.9 * kinetic;
        f.mat.emissiveIntensity = (0.6 + near * 0.9) * calm + lift * 3.2;
        f.body.visible = !this.used || i > 0 || this.scoop > 0.02;
      }
      if (this.scoop > 0.02) {
        const k = 1 - this.scoop;
        this.ring.scale.setScalar(0.4 + k * 2.4 * (0.35 + kinetic * 0.65));
        this.ringMat.opacity = this.scoop * 0.4;
      } else if (this.ring.visible) {
        this.ring.visible = false;
        this.ringMat.opacity = 0;
      }
    },
  };
}

/**
 * ⑥ 指路石（signpost）：岔路口那根柱子，四塊牌子指四個方向。
 * 讀它會告訴你「往那邊走有什麼」—— 世界裡的實體指路，跟指南針互補。
 */
function buildSignpost(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.34, 0.42, 0.22, 8), stone(kit.dark), [0, 0.11, 0]);
  put(grp, cyl(0.16, 0.21, 2.05, 7), stone(kit.mid), [0, 1.05, 0]);
  const boards = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.32;
    const arm = new THREE.Object3D();
    arm.position.set(0, 1.94 - i * 0.28, 0);
    arm.rotation.y = a;
    grp.add(arm);
    const board = put(arm, boxg(0.94, 0.24, 0.07), wood(), [0.52, 0, 0]);
    const glyph = put(board, boxg(0.78, 0.13, 0.02), aura(kit.light, 0.16), [0, 0, 0.05]);
    boards.push({ arm, board, glyph });
  }
  put(grp, ico(0.13, 0), emissive(kit.light, 0.5), [0, 2.16, 0]);

  return {
    group: grp,
    boards,
    read: 0,
    activate() {
      this.read = 1;
      return { sound: 'plank', panel: 'signpost', complete: true };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic, near) {
      this.read = Math.max(0, this.read - dt * 0.8);
      for (let i = 0; i < this.boards.length; i += 1) {
        const b = this.boards[i];
        const lit = (near > 0.3 ? 0.4 : 0.14) + this.read * 0.7;
        b.glyph.material.opacity = lit + Math.sin(t * 2.1 + i) * 0.03;
        b.arm.rotation.x = Math.sin(t * 0.8 + i * 1.4) * 0.014 * kinetic + this.read * 0.05;
      }
    },
  };
}

/**
 * ⑦ 絞盤（capstan）：轉不動的機關輪。要推三下（按三次 E）才轉得完一圈，
 * 轉完之後腳邊那塊石蓋會滑開，底下有一道很安靜的光。
 * **推到一半離開不會失敗**，只是回到原地重來（護欄：這裡不會有「失敗」）。
 */
function buildCapstan(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.82, 0.9, 0.22, 10), stone(kit.dark), [0, 0.11, 0]);
  const drum = new THREE.Object3D();
  drum.position.y = 0.22;
  grp.add(drum);
  put(drum, cyl(0.52, 0.58, 0.86, 9), wood(), [0, 0.43, 0]);
  put(drum, torus(0.56, 0.06, 4, 16), metal(), [0, 0.24, 0], [-Math.PI / 2, 0, 0]);
  put(drum, torus(0.52, 0.06, 4, 16), metal(), [0, 0.72, 0], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    put(drum, cyl(0.06, 0.07, 1.35, 5), wood(), [Math.cos(a) * 0.72, 0.66, Math.sin(a) * 0.72], [0, -a, Math.PI / 2]);
  }
  // 腳邊的石蓋 ＋ 底下的光
  const lidPivot = new THREE.Object3D();
  lidPivot.position.set(1.55, 0.06, 0);
  grp.add(lidPivot);
  // 石蓋是一塊跟地面齊平的板子 —— 跨得過去，不擋人
  // （不標的話，斜坡上「板子自己那一格的地面」比絞盤低，會被誤判成有份量的東西）
  const lid = put(lidPivot, boxg(1.15, 0.16, 1.15), stone(kit.mid), [0, 0, 0]);
  lid.userData.noCollide = true;
  const shaftMat = aura(kit.light, 0);
  const shaft = put(grp, cyl(0.42, 0.5, 4.6, 10), shaftMat, [1.55, 2.3, 0]);
  shaft.material.side = THREE.DoubleSide;
  shaft.visible = false;

  return {
    group: grp,
    drum,
    lidPivot,
    lid,
    shaft,
    shaftMat,
    turns: 0, // 已經推了幾下（不寫存檔：走開就從頭來，不會失敗）
    spin: 0,
    jolt: 0,
    opened: 0,
    activate() {
      if (this.used) {
        this.jolt = 0.5;
        return { sound: 'ratchet', complete: true, toastKey: 'done' };
      }
      this.turns += 1;
      this.jolt = 1;
      this.spin += (Math.PI * 2) / CAPSTAN_TURNS;
      const full = this.turns >= CAPSTAN_TURNS;
      if (full) this.shaft.visible = true;
      return {
        sound: full ? 'unseal' : 'ratchet',
        complete: full,
        toastKey: full ? 'opened' : 'turn',
        left: Math.max(0, CAPSTAN_TURNS - this.turns),
        shake: full ? 0.42 : 0.18,
      };
    },
    /** 還要推幾下（HUD 的走近提示會用）。 */
    get remaining() {
      return this.used ? 0 : Math.max(0, CAPSTAN_TURNS - this.turns);
    },
    setUsed(v) {
      this.used = Boolean(v);
      if (this.used) {
        this.turns = CAPSTAN_TURNS;
        this.opened = 1;
        this.spin = Math.PI * 2;
        this.shaft.visible = true;
      }
    },
    update(dt, t, kinetic) {
      this.jolt = Math.max(0, this.jolt - dt * 1.6);
      this.drum.rotation.y += (this.spin - this.drum.rotation.y) * Math.min(1, dt * 3.6);
      this.drum.position.y = 0.22 - this.jolt * 0.03 * kinetic;
      const want = this.used ? 1 : 0;
      this.opened += (want - this.opened) * Math.min(1, dt * 2.2);
      this.lidPivot.rotation.z = -this.opened * 0.14;
      this.lidPivot.position.x = 1.55 + this.opened * 0.95 * (0.3 + kinetic * 0.7);
      this.shaftMat.opacity = this.opened * (0.055 + Math.sin(t * 0.9) * 0.012);
      this.shaft.visible = this.opened > 0.02;
    },
  };
}

/**
 * ⑧ 長凳（bench）：抄寫人坐著看天的地方。
 * 坐下來，鏡頭會往後退，世界安靜一會兒。再按一次 E（或走一步）就起身。
 * 完全沒有獎勵機制在後面 —— 這是整個遊戲唯一一件「什麼都不會發生」的互動。
 */
function buildBench(kit) {
  const grp = new THREE.Group();
  for (const side of [-1, 1]) {
    put(grp, boxg(0.46, 0.5, 0.66), stone(kit.dark), [side * 0.98, 0.25, 0]);
  }
  const slab = put(grp, boxg(2.72, 0.19, 0.7), stone(kit.mid), [0, 0.59, 0], [0, 0, 0.008]);
  // 凳面上的一道磨痕（坐久了的地方）
  const wear = put(grp, boxg(1.0, 0.02, 0.42), aura(kit.light, 0.1), [0.2, 0.7, 0]);
  // 凳腳邊擱著的一盞小燈（沒點著，只是造型）
  put(grp, cyl(0.1, 0.13, 0.26, 6), metal(), [-1.5, 0.13, 0.42]);
  put(grp, ico(0.09, 0), emissive(kit.light, 0.25), [-1.5, 0.32, 0.42]);

  return {
    group: grp,
    slab,
    wear,
    /*
     * 坐下時人要真的坐到凳面上。
     *
     * `dx: 0.2` 對齊凳面上那道磨痕（`wear` 也在 x=0.2）—— 坐在被坐出痕跡的那一格。
     * `dz: 0.02` ≈ 凳面中線：人落在凳面上，大腿往前伸 0.4 公尺跨過前緣（凳面深 ±0.35）。
     *
     * `face: 0` ＝ 面向局部 +z，也就是凳子的**短邊**（跨出去那一面）。
     * v1.2 · P22f 之前寫的是 `Math.PI / 2`，而那個角度正好就是凳子的**長軸** ——
     * 人於是沿著凳子跨坐（每一張凳子的朝向·長軸內積都實測到 1.000）。
     */
    seatLocal: { dx: 0.2, dz: 0.02, face: 0 },
    /**
     * 凳面比「坐姿的髖」高多少（公尺）—— 坐下時要把角色抬起來的量。
     *
     * 角色的坐姿本來就調得很準：髖 0.88 − `SEAT_DROP` 0.42 ＝ **0.44**，
     * 小腿 0.4 ＋ 腳 0.06 剛好落到地面。可是 `player.teleport(x, z, face)` **不吃 y**，
     * 所以在 P22f 之前沒有任何人把「這張凳子的座面有多高」告訴角色 ——
     * 人留在地面高度，凳面（地面上方 0.685）就從他腰的位置穿過去。
     *
     * 0.685 ＝ 凳面板的頂（`slab` 中心 0.59 ＋ 半厚 0.095）。
     */
    seatRise: 0.685 - 0.44,
    seated: false,
    activate() {
      this.seated = !this.seated;
      return {
        sound: this.seated ? 'sit' : 'stand',
        complete: true,
        toastKey: this.seated ? 'sit' : null,
        pose: this.seated ? 'sit' : 'stand',
      };
    },
    setUsed(v) {
      this.used = Boolean(v);
    },
    update(dt, t, kinetic, near) {
      this.wear.material.opacity =
        (this.seated ? 0.34 : near > 0.35 ? 0.2 : 0.08) + Math.sin(t * 1.3) * 0.02 * kinetic;
    },
  };
}

const BUILDERS = {
  urn: buildUrn,
  brazier: buildBrazier,
  gong: buildGong,
  watchstone: buildWatchstone,
  moonpool: buildMoonpool,
  signpost: buildSignpost,
  capstan: buildCapstan,
  bench: buildBench,
};

/** 八種器物在世界裡的名字（HUD 與測試會用）。 */
export const HANDLE_KINDS = Object.freeze({
  urn: '陶罐',
  brazier: '火盆',
  gong: '響石',
  watchstone: '守望石',
  moonpool: '撈月池',
  signpost: '指路石',
  capstan: '絞盤',
  bench: '長凳',
});

/**
 * 走近提示上的動詞（§3.1：標題 ＋ 一句狀態 ＋ `E` ＋ 一個動詞）。
 * 每一種都不一樣 —— 動詞本身就是「這件東西能拿來幹嘛」的說明。
 */
export const HANDLE_VERBS = Object.freeze({
  urn: '掀開',
  brazier: '點火',
  gong: '敲響',
  watchstone: '觸碰',
  moonpool: '撈一把',
  signpost: '閱讀',
  capstan: '推動',
  bench: '坐下',
});

/** 已經動過之後的動詞（一次性的東西不會消失，只是換一句話）。 */
export const HANDLE_VERBS_USED = Object.freeze({
  urn: '再看一眼',
  brazier: '撥一下火',
  gong: '再敲一次',
  watchstone: '再摸一次',
  moonpool: '看一眼',
  signpost: '再讀一次',
  capstan: '看一眼',
  bench: '坐下',
});

/**
 * 蓋出一件器物。
 *
 * @param {object} spec handles.json 的一列
 * @param {object} kit  kitFor(regionColor)
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildHandle(spec, kit, terrainHeight) {
  const make = BUILDERS[spec.kind];
  if (!make) return null;
  const built = make(kit, spec.opts || {});
  const [x, z] = spec.at;
  const y = terrainHeight(x, z);
  const rot = Number.isFinite(spec.rot) ? spec.rot : (x * 0.29 + z * 0.13) % Math.PI;

  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  grp.name = `handle:${spec.id}`;
  grp.add(built.group);
  if (typeof built.solidRadius === 'number') {
    grp.userData.solidRadius = built.solidRadius;
    grp.userData.keepSolid = true;
  }

  // 走近會亮的地面光環（所有種類共用的一個「這裡可以按 E」的訊號）
  const haloMat = aura(kit.light, 0.06);
  const halo = new THREE.Mesh(torus(1.05, 0.035, 4, 22), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  grp.add(halo);

  built.id = spec.id;
  built.kind = spec.kind;
  built.spec = spec;
  built.root = grp;
  built.x = x;
  built.z = z;
  built.baseRot = rot;
  built.worldX = x;
  built.worldZ = z;
  built.position = new THREE.Vector3(x, y, z);
  if (built.seatLocal) {
    // 局部 → 世界（只轉 Y 軸，地面上的東西不需要完整矩陣）
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    built.seat = {
      x: x + built.seatLocal.dx * cos + built.seatLocal.dz * sin,
      z: z - built.seatLocal.dx * sin + built.seatLocal.dz * cos,
      face: rot + built.seatLocal.face,
      /** 坐下時角色要抬多高（公尺）——「座面」與「坐姿的髖」的差。 */
      rise: built.seatRise || 0,
    };
  }
  built.near = false;
  built.used = false;
  built.nearAmt = 0;
  built.halo = halo;
  built.haloMat = haloMat;

  const innerUpdate = built.update.bind(built);
  const innerSetUsed = built.setUsed ? built.setUsed.bind(built) : null;

  built.setNear = function setNear(v) {
    this.near = Boolean(v);
  };
  built.setUsed = function setUsed(v) {
    if (innerSetUsed) innerSetUsed(v);
    else this.used = Boolean(v);
  };
  built.update = function update(dt, t, kinetic, near) {
    this.nearAmt += (near - this.nearAmt) * Math.min(1, dt * 5);
    innerUpdate(dt, t, kinetic, this.nearAmt);
    const base = this.near ? 0.4 : this.used ? 0.05 : 0.11;
    this.haloMat.opacity = base + Math.sin(t * 1.7 + x * 0.2 + z * 0.11) * 0.025;
    this.halo.rotation.z = t * (this.near ? 0.34 : 0.08);
  };

  return built;
}

/**
 * 一個很小的管理器：蓋出所有器物、每幀更新離玩家近的那幾件。
 *
 * 更新策略跟反應場同一套（§6.2）：平方距離、45 公尺外整組跳過、
 * 15 公尺外每 3 幀才算一次（用 index 錯開），tick 裡零配置。
 */
const FAR_SQ = 45 * 45;
const NEAR_SQ = 15 * 15;

export function createHandleField({ entries = [], kitOf, terrainHeight, reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'handles';
  const objects = [];
  for (const spec of entries) {
    const built = buildHandle(spec, kitOf(spec.region), terrainHeight);
    if (!built) continue;
    group.add(built.root);
    objects.push(built);
  }
  const byId = new Map(objects.map((o) => [o.id, o]));
  const kinetic = reducedMotion ? 0.12 : 1;
  let frame = 0;

  return {
    group,
    objects,
    get count() {
      return objects.length;
    },
    object(id) {
      return byId.get(id) || null;
    },
    markUsed(id) {
      const o = byId.get(id);
      if (o) o.setUsed(true);
      return Boolean(o);
    },
    /**
     * 玩家附近可互動的那一件（順便更新「走近」的視覺狀態）。
     *
     * 器物擺得比其他層密，兩件同時進入 3.2 公尺是會發生的事。
     * 純比距離的話，「站在中間」就會由零點幾公尺的差距決定要按到哪一個 ——
     * 玩家看的是**他面向哪裡**，不是他離哪一個近。
     * 所以同時在範圍內時改用「距離 ÷ 面向」排名（面向它 → 分數變好）。
     * 沒有給面向（測試、序章）時退回純距離，行為與其他層一致。
     *
     * @param {{x:number,z:number}} position
     * @param {number} [maxDistance]
     * @param {{x:number,z:number}|null} [forward] 鏡頭的水平前方向（單位向量）
     */
    nearest(position, maxDistance = HANDLE_RADIUS, forward = null) {
      let best = null;
      let bestDist = maxDistance;
      let bestScore = Infinity;
      for (let i = 0; i < objects.length; i += 1) {
        const o = objects[i];
        const dx = o.x - position.x;
        const dz = o.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= maxDistance) continue;
        let score = d;
        if (forward && d > 0.05) {
          // dot = 1 → 正對著它；dot = -1 → 背對它。最多讓分數變好 / 變差 35%
          const dot = (dx / d) * forward.x + (dz / d) * forward.z;
          score = d * (1 - 0.35 * dot);
        }
        if (score < bestScore) {
          bestScore = score;
          bestDist = d;
          best = o;
        }
      }
      for (let i = 0; i < objects.length; i += 1) objects[i].setNear(objects[i] === best);
      return best ? { handle: best, distance: bestDist } : null;
    },
    update(dt, t, px, pz) {
      frame += 1;
      for (let i = 0; i < objects.length; i += 1) {
        const o = objects[i];
        const dx = px - o.x;
        const dz = pz - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FAR_SQ) continue;
        if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;
        const near = Math.max(0, 1 - Math.sqrt(d2) / (HANDLE_RADIUS * 2.4));
        o.update(dt, t, kinetic, near);
      }
    },
  };
}

export default {
  HANDLE_RADIUS,
  HANDLE_XP,
  HANDLE_KINDS,
  HANDLE_VERBS,
  HANDLE_VERBS_USED,
  CAPSTAN_TURNS,
  buildHandle,
  createHandleField,
  disposeHandleCache,
};

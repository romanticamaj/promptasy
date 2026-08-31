/**
 * Promptasy — 會回應你的東西（proximity reactions）＋ 藏起來的地方（secrets）
 *
 * 這一層的目的只有一個：**讓世界注意到你走過去了**。
 * 不是新玩法、不是新關卡、不擋路、不搶 E 鍵 —— 走過去，它就有反應。
 *
 * 作法依照探索型 WebGL 作品的通用經驗（見 WORLD.md 的參考清單）：
 *
 *   · **兩個半徑**（hysteresis）：進場半徑 rEnter、離場半徑約 1.3 × rEnter。
 *     只用一個半徑的話，人站在邊界上不動、鏡頭抖一下就會連續觸發。
 *   · **平方距離**：一律比較 dx²+dz²，不開根號、不做 raycast、不算 Y
 *     （地面上的東西用圓柱體判定就夠，和既有的 solids 登記表同一套）。
 *   · **距離分級**：45 公尺外整組跳過；15 公尺外每 3 幀才算一次
 *     （用 index 錯開，工作量平均分散，不會每 3 幀尖峰一次）。
 *   · **零每幀配置**：所有暫存向量 / 矩陣提到模組層重複使用，
 *     tick 裡不 new、不 map/filter、不建閉包。
 *   · **聲音要節流**：全域冷卻（任兩聲之間至少 90ms）＋ 每個觸發點自己的冷卻，
 *     再加一個「最近放過的 4 個音」的環狀緩衝，不准連續重複同一個音。
 *   · **prefers-reduced-motion**：關掉的是「動」，不是「回應」——
 *     光還是會亮、聲音還是會響，只是不再甩動 / 噴散。
 *
 * 全部程序生成、共用幾何體與材質、**不新增任何光源**（只用自發光材質），
 * 所以三角形與燈光預算幾乎不動。
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
export function disposeReactiveCache() {
  for (const v of GEO.values()) v.dispose();
  for (const v of MAT.values()) v.dispose();
  GEO.clear();
  MAT.clear();
}

const cyl = (rt, rb, h, s = 6) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d = 0) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const cone = (r, h, s = 5) => g(`cone:${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t, s = 4, ts = 20) => g(`tor:${r},${t},${s},${ts}`, () => new THREE.TorusGeometry(r, t, s, ts));
const disc = (r, s = 20) => g(`disc:${r},${s}`, () => new THREE.CircleGeometry(r, s));
const boxg = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));

const stone = (c) => mt(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92 }));
const metal = () =>
  mt('metal', () => new THREE.MeshStandardMaterial({ color: 0x8b9aa6, flatShading: true, roughness: 0.36, metalness: 0.6 }));

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

/** 加色混合的光暈片（水波、光環）。 */
function auraMaterial(color, opacity = 0.3) {
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
 * 音階：五聲音階 —— 不管玩家用什麼順序走過去，聽起來都不會不和諧
 * ------------------------------------------------------------------ */
export const PENTATONIC = Object.freeze([0, 2, 4, 7, 9, 12, 14, 16]);
const semitone = (n) => Math.pow(2, n / 12);

/**
 * 每一種反應物**自己**的觸發半徑（公尺）。WORLD.md §3.2 那一列寫的「1.75–4.4（自動）」
 * 就是這六個數字的區間 —— 它們**本來就不一樣**：風鈴要走到手邊才晃得起來，
 * 光菇圈是一整圈依序亮起來的連續回應，音石列的每一顆各自是一個觸發點。
 *
 * v1.2 · P16b 把它抽出來的理由：中觀層的淨空規則（`scripts/lib/screen-rules.mjs`）
 * 以前對整個反應層套用**最大的那一個（4.4）**，等於拿光菇圈的尺寸去量風鈴 ——
 * 這正是 P06c 記下的那條教訓（「淨空半徑要跟著**那一層自己的互動半徑**走，
 * 把別層的保守值整批套過來會把小東西擠出地圖」）在同一層裡又犯了一次。
 * 建造器與淨空規則從此讀**同一份**。
 *
 * 靜水盤（ripple）是唯一跟著參數走的：它的觸發半徑是「水盤半徑 ＋ 1.5」，
 * 所以放在 `reactiveTriggerR()` 裡算，不是常數。
 */
export const REACT_TRIGGER_R = Object.freeze({
  chime: 3.2,
  glowcap: 4.4,
  songstone: 1.75,
  ripple: 3.2, // ＝ 預設水盤半徑 1.7 ＋ 1.5（有 `opts.radius` 時以那個為準）
  spirit: 4.2,
  moths: 3.0,
});

/** 靜水盤的水盤半徑（公尺）—— 觸發半徑是它 ＋1.5。 */
const RIPPLE_R = 1.7;

/**
 * 一個反應物的觸發半徑（公尺）。`opts` 會影響的只有靜水盤。
 * @param {string} kind
 * @param {object} [opts]
 */
export function reactiveTriggerR(kind, opts = {}) {
  if (kind === 'ripple') return (opts.radius || RIPPLE_R) + 1.5;
  return REACT_TRIGGER_R[kind];
}

/**
 * 音石列每一顆石頭相對於落點的位移（公尺）—— 一排 5 顆、間距 2.3，散開 ±4.6 公尺。
 *
 * 抽出來是因為「一個 id 對應一排東西」這件事會被**別人**問到（P06c 的教訓：
 * 中心合法不代表整排合法）。目前的呼叫者是建造器與 `test:rubric` 的逐顆斷言；
 * 中觀層的淨空刻意不逐顆問（理由在 `SONGSTONE_ROW_CLEAR`）。
 * @param {object} [opts] `{ stones, gap, dir }`
 * @returns {number[][]} `[[dx, dz], …]`
 */
export function songStoneOffsets(opts = {}) {
  const n = opts.stones || 5;
  const gap = opts.gap || 2.3;
  const dir = Number.isFinite(opts.dir) ? opts.dir : 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const off = (i - (n - 1) / 2) * gap;
    out.push([Math.cos(dir) * off, Math.sin(dir) * off]);
  }
  return out;
}

/**
 * 音石列在**中觀層淨空**這件事上算幾公尺（公尺）——**不是** `REACT_TRIGGER_R.songstone`。
 *
 * 1.75 是每一顆石頭自己的觸發半徑；一排 5 顆散開 ±4.6 公尺，
 * 照理該攤成 5 個各自 1.75 的目標。v1.2 · P16b 真的攤過一次，量到的是：
 * **那條規則問錯了問題**。音石列是「沿著走」的東西 —— 它的保證是「整排走得完、
 * 每一顆都踩得到」（P06c 已經有逐顆 `isWalkable` 的硬斷言在守），
 * 而不是「每一顆四周整圈都走得到」。整圈那條線攤下去的後果實測是：
 * `frugality-emptied-step` 離 `frg-song-eastedge` 最東那一顆 3.30 公尺、差 0.47 公尺不合格，
 * 而減法之庭**再也找不到第二個落點**（0.25 公尺格點掃過 66,049 格，合法候選 0）——
 * 被擋掉的那一側玩家本來就還是從其餘 15 個方向走得進 1.75 的觸發圈，那一顆照響。
 *
 * **上面那三個數字是 P16b 當時、v1.2 · P22c 把地圖 ×1.3 之前量的**（院子那時候半徑 32，
 * 現在 41.6；格點數與「合法候選 0」都會跟著變）。留著它們是因為**結論不靠絕對值成立**：
 * 音石列的保證是「整排走得完」，不是「每一顆四周整圈都走得到」——
 * 那是問錯問題，地圖再大一倍也還是問錯。要重新開這個題目就得重量一次，不要引用這三個數字。
 *
 * 所以這一層維持「整排一個目標、半徑 4.4」（＝反應層的預設值，涵蓋到路過的人一定踩得到），
 * 並且把量到的數字留在這裡：要動那座高台或這一排音石之前，先讀這一段。
 */
export const SONGSTONE_ROW_CLEAR = 4.4;

/**
 * 把 `REACTIVE_SPOTS` 攤成中觀層擺位規則吃的淨空目標：**每一個各自帶自己的半徑**。
 * 除了音石列（見 `SONGSTONE_ROW_CLEAR`）之外，一個落點就是一個目標。
 * @param {Array} [spots]
 * @returns {Array<{id:string, region:string, at:number[], r:number}>}
 */
export function reactiveTargets(spots = REACTIVE_SPOTS) {
  const out = [];
  for (const s of spots) {
    const opts = s.opts || {};
    const r = s.kind === 'songstone' ? SONGSTONE_ROW_CLEAR : reactiveTriggerR(s.kind, opts);
    out.push({ id: s.id, region: s.region, at: s.at, r });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 六種反應
 * ------------------------------------------------------------------ */

/**
 * ① 風鈴（chime）：走過去它會晃，晃就會響。
 * 細桿與細管 —— 碰撞稽核判定為「繞得過去的細物」，不需要碰撞體。
 */
function buildChime(kit, opts = {}) {
  const grp = new THREE.Group();
  const n = opts.tubes || 4;
  put(grp, cyl(0.07, 0.1, 2.3, 5), metal(), [0, 1.15, 0]);
  put(grp, cyl(0.05, 0.05, 1.15, 5), metal(), [0, 2.24, 0], [0, 0, Math.PI / 2]);
  const tubes = [];
  for (let i = 0; i < n; i += 1) {
    const pivot = new THREE.Object3D();
    pivot.position.set(-0.48 + (i * 0.96) / (n - 1), 2.2, 0);
    const len = 0.62 - i * 0.07;
    put(pivot, cyl(0.045, 0.045, len, 5), metal(), [0, -len / 2 - 0.06, 0]);
    grp.add(pivot);
    tubes.push({ pivot, phase: i * 0.7, len });
  }
  const spark = put(grp, ico(0.07, 0), emissive(kit.accent, 1.6), [0, 2.42, 0]);
  return {
    group: grp,
    tubes,
    spark,
    swing: 0,
    triggers: [{ dx: 0, dz: 0, enter: REACT_TRIGGER_R.chime, note: 0 }],
    onEnter() {
      this.swing = 1;
      // varied：這個音是隨機挑的 → 交給環狀緩衝把「剛剛才響過的那幾個」擋掉，
      // 不然同一支合成音聽起來就會像壞掉的錄音。
      return { sound: 'chimeSoft', note: PENTATONIC[Math.floor(Math.random() * 5)], varied: true };
    },
    update(dt, t, kinetic) {
      this.swing = Math.max(0, this.swing - dt * 0.55);
      const amp = this.swing * 0.42 * kinetic;
      for (const tube of this.tubes) {
        tube.pivot.rotation.z = Math.sin(t * 5.2 + tube.phase) * amp;
        tube.pivot.rotation.x = Math.cos(t * 4.1 + tube.phase) * amp * 0.6;
      }
      this.spark.material.emissiveIntensity = 1.2 + this.swing * 1.6;
    },
  };
}

/**
 * ② 光菇圈（glowcap）：走近時一朵一朵依序亮起來，離開又一朵一朵暗回去。
 * 這一種是「連續回應」，不是事件 —— 全程沒有聲音，只有光。
 */
function buildGlowCaps(kit, opts = {}) {
  const grp = new THREE.Group();
  const n = opts.caps || 7;
  const r = opts.radius || 1.9;
  const caps = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const holder = new THREE.Object3D();
    holder.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    put(holder, cyl(0.05, 0.075, 0.22, 5), stone(kit.dark), [0, 0.11, 0]);
    const mat = emissive(kit.light, 0.25);
    const cap = put(holder, ico(0.17, 0), mat, [0, 0.28, 0], [0, i * 0.6, 0], [1, 0.62, 1]);
    grp.add(holder);
    caps.push({ cap, mat, lit: 0 });
  }
  return {
    group: grp,
    caps,
    triggers: [{ dx: 0, dz: 0, enter: REACT_TRIGGER_R.glowcap, note: 0 }],
    onEnter() {
      return { sound: 'bloom', note: 7 };
    },
    update(dt, t, kinetic, near) {
      // near = 0（很遠）… 1（就站在中間）→ 依序點亮
      const n2 = this.caps.length;
      for (let i = 0; i < n2; i += 1) {
        const c = this.caps[i];
        const want = near > (i + 0.35) / n2 ? 1 : 0;
        c.lit += (want - c.lit) * Math.min(1, dt * 4.5);
        c.mat.emissiveIntensity = 0.22 + c.lit * (1.5 + Math.sin(t * 2.2 + i) * 0.18);
        c.cap.position.y = 0.28 + c.lit * 0.06 * kinetic;
      }
    },
  };
}

/**
 * ③ 音石列（songstone）：一排矮石，每顆是自己的觸發點。
 * 沿著走 → 一顆一顆響 → 走出一小段旋律（五聲音階，怎麼走都好聽）。
 */
function buildSongStones(kit, opts = {}) {
  const grp = new THREE.Group();
  // 位移與淨空規則共用同一支（`songStoneOffsets`）——一排 5 顆的兩端不會再被漏掉
  const offsets = songStoneOffsets(opts);
  const n = offsets.length;
  const stones = [];
  const triggers = [];
  for (let i = 0; i < n; i += 1) {
    const x = offsets[i][0];
    const z = offsets[i][1];
    const holder = new THREE.Object3D();
    holder.position.set(x, 0, z);
    const mat = emissive(kit.light, 0.16);
    const body = put(holder, ico(0.42, 0), stone(kit.mid), [0, 0.28, 0], [0.2, i * 0.9, 0.1], [1, 0.78, 1]);
    const vein = put(holder, torus(0.3, 0.03, 4, 14), mat, [0, 0.46, 0], [-Math.PI / 2, 0, 0]);
    grp.add(holder);
    stones.push({ holder, body, vein, mat, ring: 0 });
    triggers.push({ dx: x, dz: z, enter: REACT_TRIGGER_R.songstone, note: PENTATONIC[i % PENTATONIC.length] });
  }
  return {
    group: grp,
    stones,
    triggers,
    onEnter(i) {
      this.stones[i].ring = 1;
      return { sound: 'songnote', note: this.triggers[i].note };
    },
    update(dt, t, kinetic) {
      for (let i = 0; i < this.stones.length; i += 1) {
        const s = this.stones[i];
        s.ring = Math.max(0, s.ring - dt * 0.9);
        s.mat.emissiveIntensity = 0.14 + s.ring * 2.4;
        s.vein.scale.setScalar(1 + s.ring * 0.35 * kinetic);
        s.body.position.y = 0.28 + s.ring * 0.05 * kinetic;
      }
    },
  };
}

/** ④ 靜水盤（ripple）：踏近水邊 → 一圈水紋盪開。 */
function buildRipplePool(kit, opts = {}) {
  const grp = new THREE.Group();
  const r = opts.radius || RIPPLE_R;
  put(grp, torus(r, 0.16, 4, 18), stone(kit.dark), [0, 0.14, 0], [-Math.PI / 2, 0, 0]);
  put(
    grp,
    disc(r, 20),
    mt(`pond:${kit.accent}`, () =>
      new THREE.MeshStandardMaterial({
        color: 0x16293b,
        roughness: 0.18,
        metalness: 0.4,
        emissive: new THREE.Color(kit.accent).multiplyScalar(0.16),
        transparent: true,
        opacity: 0.92,
      })
    ),
    [0, 0.1, 0],
    [-Math.PI / 2, 0, 0]
  );
  const rings = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = auraMaterial(PALETTE.accent, 0);
    const mesh = put(grp, torus(r * 0.32, 0.035, 4, 22), mat, [0, 0.13, 0], [-Math.PI / 2, 0, 0]);
    mesh.visible = false;
    rings.push({ mesh, mat, life: 0 });
  }
  return {
    group: grp,
    rings,
    r,
    triggers: [{ dx: 0, dz: 0, enter: reactiveTriggerR('ripple', opts), note: 0 }],
    onEnter() {
      const slot = this.rings.find((x) => x.life <= 0) || this.rings[0];
      slot.life = 1;
      slot.mesh.visible = true;
      return { sound: 'ripple', note: 12 };
    },
    update(dt, t, kinetic) {
      for (const s of this.rings) {
        if (s.life <= 0) {
          if (s.mesh.visible) s.mesh.visible = false;
          continue;
        }
        s.life = Math.max(0, s.life - dt * 0.6);
        const k = 1 - s.life;
        s.mesh.scale.setScalar(0.5 + k * 2.6 * (0.4 + kinetic * 0.6));
        s.mat.opacity = s.life * 0.4;
      }
    },
  };
}

/**
 * ⑤ 守望的小獸（spirit）：遠遠看著你；太靠近就竄開，過一陣子再回來。
 * 沒有臉、沒有敘事，就只是一隻在那裡的東西 —— 世界有人住的感覺全靠這個。
 */
function buildSpirit(kit) {
  const grp = new THREE.Group();
  const body = new THREE.Group();
  const mat = emissive(kit.light, 0.5);
  put(body, ico(0.3, 0), mat, [0, 0.32, 0], [0, 0, 0], [1.3, 0.85, 1]);
  put(body, ico(0.18, 0), mat, [0, 0.62, 0.2]);
  for (const side of [-1, 1]) put(body, cone(0.07, 0.16, 4), mat, [side * 0.09, 0.76, 0.2]);
  const tail = put(body, cyl(0.03, 0.055, 0.5, 4), mat, [0, 0.42, -0.34], [0.9, 0, 0]);
  for (const side of [-1, 1]) {
    put(body, ico(0.045, 0), emissive(PALETTE.warm, 2.4), [side * 0.07, 0.66, 0.35]);
  }
  grp.add(body);
  return {
    group: grp,
    body,
    tail,
    away: 0, // 0 = 在原地，1 = 竄開了
    hop: 0,
    facing: 0,
    triggers: [{ dx: 0, dz: 0, enter: REACT_TRIGGER_R.spirit, note: 0 }],
    onEnter() {
      if (this.away > 0.2) return null;
      this.away = 1;
      this.hop = 1;
      return { sound: 'scurry', note: 16 };
    },
    update(dt, t, kinetic, near, toPlayerX, toPlayerZ) {
      // 回來得很慢：跑掉之後要 ~9 秒才會再出現（回來的時候不會有聲音）
      if (this.away > 0) this.away = Math.max(0, this.away - dt * 0.11);
      this.hop = Math.max(0, this.hop - dt * 1.8);
      const hidden = this.away > 0.25;
      const targetScale = hidden ? 0.001 : 1;
      const s = this.body.scale.x + (targetScale - this.body.scale.x) * Math.min(1, dt * 3.4);
      this.body.scale.setScalar(Math.max(0.001, s));
      this.body.visible = s > 0.02;
      // 看著你（遠遠地），太近就已經不在了
      if (!hidden && (toPlayerX !== 0 || toPlayerZ !== 0)) {
        const want = Math.atan2(toPlayerX, toPlayerZ);
        let diff = want - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, dt * 2.2);
        this.body.rotation.y = this.facing;
      }
      this.body.position.y = this.hop * 0.5 * kinetic;
      this.tail.rotation.x = 0.9 + Math.sin(t * 1.7) * 0.22 * kinetic;
    },
  };
}

/* ------------------------------------------------------------------ *
 * 外交式導向（v1.2 · P19）
 * ------------------------------------------------------------------ *
 *
 * 世界一直有一個「下一個建議去處」（指南針的針、守望石的光、HUD 的那一行），
 * 可是**站在世界裡的東西**從來沒有指過路。這一格讓已經到處都是的螢火群
 * 整體偏向那個方向 —— 不是箭頭，是一群東西剛好都往那邊飄。
 *
 * 兩段疊起來，而且**分得開**：
 *   · `MOTH_GUIDE_LEAN`  **靜態的那一段**：整團的家往目標側挪這麼多公尺。
 *     `prefers-reduced-motion` 留的就是它 —— 拿掉的是動，不是資訊（§2.4）。
 *   · `MOTH_GUIDE_SPAN`  **會動的那一段**：一批螢火沿著同一個方向前後流，
 *     平均值是 0（所以它改變的是「看起來在流」，不是重心），而且乘上 `kinetic`。
 *
 * 關掉導向（設定頁）→ 偏向量是 0 → 每一幀與 P19 之前**逐值相同**。
 */
/** 整團往目標側挪幾公尺（螢火群的散佈半徑是 2.2，所以這是看得出來的一段）。 */
export const MOTH_GUIDE_LEAN = 0.9;
/** 沿著同一個方向前後流的幅度（公尺）。 */
export const MOTH_GUIDE_SPAN = 1.5;
/** 流一圈要幾秒的倒數（每秒走完幾圈）。 */
export const MOTH_GUIDE_RATE = 0.22;

/** ⑥ 螢火群（moths）：走進去 → 往外散開，站著不動 → 慢慢又聚回來。 */
function buildMoths(kit, opts = {}) {
  const n = opts.count || 16;
  const spread = opts.spread || 2.2;
  const pos = new Float32Array(n * 3);
  const home = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 * 1.618;
    const rad = spread * (0.35 + (i % 5) / 6);
    home[i * 3] = Math.cos(a) * rad;
    home[i * 3 + 1] = 0.6 + ((i * 7) % 11) * 0.11;
    home[i * 3 + 2] = Math.sin(a) * rad;
    pos[i * 3] = home[i * 3];
    pos[i * 3 + 1] = home[i * 3 + 1];
    pos[i * 3 + 2] = home[i * 3 + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: kit.light,
    size: 0.17,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  const grp = new THREE.Group();
  grp.add(points);
  return {
    group: grp,
    points,
    n,
    home,
    vel,
    scatter: 0,
    triggers: [{ dx: 0, dz: 0, enter: REACT_TRIGGER_R.moths, note: 0 }],
    onEnter() {
      this.scatter = 1;
      return { sound: 'flutter', note: 19 };
    },
    /**
     * @param {number} [gx] 導向的單位向量（v1.2 · P19；`0, 0` ＝ 沒有導向，
     *   走的就是 P19 之前那一條路）
     * @param {number} [gz]
     */
    update(dt, t, kinetic, near, toPlayerX, toPlayerZ, gx = 0, gz = 0) {
      this.scatter = Math.max(0, this.scatter - dt * 0.5);
      const arr = this.points.geometry.attributes.position.array;
      const push = this.scatter * 2.6 * kinetic;
      const len = Math.hypot(toPlayerX, toPlayerZ) || 1;
      const ax = -toPlayerX / len;
      const az = -toPlayerZ / len;
      const guided = gx !== 0 || gz !== 0;
      for (let i = 0; i < this.n; i += 1) {
        /*
         * 導向：靜態的一段（`LEAN`）＋ 平均值為 0 的一段（`SPAN`，吃 `kinetic`）。
         * 沒有導向時 `lean` 是 0，下面三行與 P19 之前逐值相同。
         */
        let lean = 0;
        if (guided) {
          const phase = (t * MOTH_GUIDE_RATE + i / this.n) % 1;
          lean = MOTH_GUIDE_LEAN + kinetic * (phase - 0.5) * MOTH_GUIDE_SPAN;
        }
        const hx = this.home[i * 3] + gx * lean + ax * push * (0.5 + (i % 4) * 0.2);
        const hy = this.home[i * 3 + 1] + this.scatter * 0.7 * kinetic;
        const hz = this.home[i * 3 + 2] + gz * lean + az * push * (0.5 + (i % 4) * 0.2);
        const k = Math.min(1, dt * 2.4);
        arr[i * 3] += (hx - arr[i * 3]) * k;
        arr[i * 3 + 1] += (hy + Math.sin(t * 0.9 + i * 1.3) * 0.14 * kinetic - arr[i * 3 + 1]) * k;
        arr[i * 3 + 2] += (hz - arr[i * 3 + 2]) * k;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.material.opacity = 0.62 + this.scatter * 0.3;
    },
  };
}

const REACTION_BUILDERS = {
  chime: buildChime,
  glowcap: buildGlowCaps,
  songstone: buildSongStones,
  ripple: buildRipplePool,
  spirit: buildSpirit,
  moths: buildMoths,
};

/** 六種反應的名字（世界裡的說法）。 */
export const REACTION_KINDS = Object.freeze({
  chime: '風鈴架',
  glowcap: '光菇圈',
  songstone: '音石列',
  ripple: '靜水盤',
  spirit: '守望的小獸',
  moths: '螢火群',
});

/**
 * 會回應的東西擺在哪。
 *
 * 原則（見 WORLD.md）：**成組、靠近路與小景，不要均勻灑**。
 * 每一片土地都有全部或大部分的種類，但同一種不會兩個擠在一起 ——
 * 兩個不同種的反應離太近會同時響，聲音會糊掉。
 */
export const REACTIVE_SPOTS = Object.freeze([
  /* --- foundations：路旁的第一批「它注意到你了」 --- */
  { id: 'hub-chime-pool', kind: 'chime', region: 'foundations', at: [-50.7, 20.8] },
  { id: 'hub-caps-carve', kind: 'glowcap', region: 'foundations', at: [-19.5, -44.2] },
  { id: 'hub-song-tea', kind: 'songstone', region: 'foundations', at: [35.1, 57.2], opts: { dir: 0.8 } },
  { id: 'hub-spirit-camp', kind: 'spirit', region: 'foundations', at: [52, 14.3] },
  { id: 'hub-moths-west', kind: 'moths', region: 'foundations', at: [-40.3, 6.5] },
  { id: 'hub-ripple-south', kind: 'ripple', region: 'foundations', at: [-7.8, -57.2] },

  /* --- reasoning：階梯迴廊 --- */
  { id: 'rsn-song-stair', kind: 'songstone', region: 'reasoning', at: [-101.1, -119.6], opts: { dir: 1.2, stones: 6 } },
  { id: 'rsn-caps-thinker', kind: 'glowcap', region: 'reasoning', at: [-136.5, -143] },
  { id: 'rsn-chime-examples', kind: 'chime', region: 'reasoning', at: [-140.4, -106.6] },
  { id: 'rsn-moths-north', kind: 'moths', region: 'reasoning', at: [-135.2, -159.9] },

  /* --- grounding：沉書檔案庫 --- */
  { id: 'gnd-ripple-desk', kind: 'ripple', region: 'grounding', at: [119.6, -96.2] },
  { id: 'gnd-chime-nook', kind: 'chime', region: 'grounding', at: [135.2, -152.1] },
  { id: 'gnd-caps-well', kind: 'glowcap', region: 'grounding', at: [113.1, -152.1] },
  { id: 'gnd-spirit-east', kind: 'spirit', region: 'grounding', at: [139.1, -105.3] },

  /* --- orchestration：齒輪工坊 --- */
  { id: 'orc-chime-draft', kind: 'chime', region: 'orchestration', at: [-121.55, 104.65] },
  { id: 'orc-song-engine', kind: 'songstone', region: 'orchestration', at: [-140.4, 141.7], opts: { dir: -0.6 } },
  { id: 'orc-caps-west', kind: 'glowcap', region: 'orchestration', at: [-146.9, 126.1] },
  { id: 'orc-moths-yard', kind: 'moths', region: 'orchestration', at: [-98.8, 149.5] },

  /* --- config：面具劇場 --- */
  { id: 'cfg-caps-stage', kind: 'glowcap', region: 'config', at: [123.5, 159.9] },
  { id: 'cfg-ripple-mirror', kind: 'ripple', region: 'config', at: [133.9, 145.6] },
  { id: 'cfg-spirit-dressing', kind: 'spirit', region: 'config', at: [98.8, 124.8] },
  { id: 'cfg-song-east', kind: 'songstone', region: 'config', at: [160.5, 142.75], opts: { dir: 1.9 } },

  /*
   * v1.2 · P06c：課程 v2 之後才蓋起來的七片土地本來一件都沒有 ——
   * 「區域顏色看不出來」與「路上沒東西」其實是同一件事（區域色是靠物件顯的）。
   * 這一批的落點全部先用 `scripts/pacing-audit.mjs` 量過（先量再放，WORLD §4.4），
   * 種類挑的是那一片土地的調性（WORLD §1.4），不新增種類、不新增光源。
   */

  /* --- forms：量器坊（熄了火、冷錫色、最安靜 —— 只有一列音石與一架風鈴） --- */
  { id: 'frm-song-westterrace', kind: 'songstone', region: 'forms', at: [-24.7, 198.25], opts: { dir: 0.4 } },
  { id: 'frm-chime-measurebench', kind: 'chime', region: 'forms', at: [34.45, 140.4] },
  { id: 'frm-caps-northstep', kind: 'glowcap', region: 'forms', at: [-9.1, 118.3] },
  { id: 'frm-spirit-halfmould', kind: 'spirit', region: 'forms', at: [-42.9, 149.5] },

  /* --- toolcraft：契約鍛冶場（爐子還溫著、火星最多） --- */
  { id: 'tlc-chime-westgroove', kind: 'chime', region: 'toolcraft', at: [-185.25, 13.65] },
  { id: 'tlc-caps-southgroove', kind: 'glowcap', region: 'toolcraft', at: [-165.75, -27.95] },
  { id: 'tlc-moths-toolditch', kind: 'moths', region: 'toolcraft', at: [-127.4, -28.6] },
  { id: 'tlc-song-anvil', kind: 'songstone', region: 'toolcraft', at: [-138.45, -18.85], opts: { dir: 0.4 } },

  /* --- sight：觀象臺（不只讀字：看與聽 —— 水面、光、翅膀） --- */
  { id: 'sgt-ripple-eastrim', kind: 'ripple', region: 'sight', at: [192.4, -17.55] },
  { id: 'sgt-caps-northridge', kind: 'glowcap', region: 'sight', at: [181.35, 12.35] },
  { id: 'sgt-moths-upperslope', kind: 'moths', region: 'sight', at: [168.35, -7.15] },
  { id: 'sgt-chime-bridgehead', kind: 'chime', region: 'sight', at: [137.8, -28.6] },

  /* --- refinery：校驗場（光被折過一次 —— 水紋、回音、一朵一朵亮） --- */
  { id: 'rfn-ripple-northyard', kind: 'ripple', region: 'refinery', at: [-187.85, 206.05] },
  { id: 'rfn-song-valley', kind: 'songstone', region: 'refinery', at: [-146.9, 184.6], opts: { dir: -0.7 } },
  { id: 'rfn-caps-southrim', kind: 'glowcap', region: 'refinery', at: [-192.4, 135.85] },

  /* --- divergence：分歧之廳（兩面刻著相反神諭的柱） --- */
  { id: 'dvg-song-eastpillar', kind: 'songstone', region: 'divergence', at: [125.45, 7.15], opts: { dir: 1.3 } },
  { id: 'dvg-chime-westmouth', kind: 'chime', region: 'divergence', at: [87.1, 0.65] },
  { id: 'dvg-caps-middle', kind: 'glowcap', region: 'divergence', at: [100.1, 9.75] },

  /* --- wards：護欄崗（最冷、螢火最少 —— 只有一架風鈴與一隻小獸） --- */
  { id: 'wrd-chime-post', kind: 'chime', region: 'wards', at: [155.35, -192.4] },
  { id: 'wrd-spirit-outerrim', kind: 'spirit', region: 'wards', at: [152.1, -209.95] },

  /* --- frugality：減法之庭（最空最平、螢火最少 —— 全場最稀，這是設計不是遺漏） --- */
  { id: 'frg-caps-plinth', kind: 'glowcap', region: 'frugality', at: [7.8, -128.7] },
  { id: 'frg-song-eastedge', kind: 'songstone', region: 'frugality', at: [20.15, -92.95], opts: { dir: 2.4 } },
]);

/* ------------------------------------------------------------------ *
 * 藏起來的地方（secrets）
 * ------------------------------------------------------------------ *
 *
 * 護欄 2：這些跟世界觀石碑同一層 —— **純風味**。
 * 它們不教技巧、不附出處、不宣稱任何官方說法（文字在 src/data/secrets.json，
 * 測試會強制驗證不含連結、不含 source / teaches 欄位）。
 *
 * 擺法：一律在地標「背面」或地圖角落 —— 從中央高原看不到的那一側，
 * 離主動線 8 公尺以上：找到它要是一個決定，不是一個意外。
 */

/** 找到一個祕密給的 XP（比石碑多一點點，因為真的要走過去）。 */
export const SECRET_XP = 12;

/** 祕密的發現半徑（走進去就算，不用按 E —— 好奇心不該還要學一個鍵）。 */
export const SECRET_RADIUS = 5.0;

/** 星圖林：一圈細柱撐著一張看不懂的星圖（抽象幾何，不影射任何真實標誌）。 */
function secretStarGrove(kit) {
  const grp = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    put(grp, cyl(0.11, 0.15, 3.4 + (i % 3) * 0.5, 5), stone(kit.dark), [Math.cos(a) * 3.2, 1.8, Math.sin(a) * 3.2]);
  }
  // 星圖：一面浮在半空的薄盤 ＋ 一批亮點與連線（抽象的四座星座）
  const chart = put(grp, disc(2.7, 24), auraMaterial(kit.light, 0.12), [0, 3.9, 0], [-Math.PI / 2, 0, 0]);
  const starMat = new THREE.PointsMaterial({
    color: PALETTE.moon,
    size: 0.2,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new Float32Array(28 * 3);
  for (let i = 0; i < 28; i += 1) {
    const a = i * 2.399;
    const r = 0.5 + (i % 7) * 0.33;
    pts[i * 3] = Math.cos(a) * r;
    pts[i * 3 + 1] = 3.95 + ((i * 3) % 5) * 0.06;
    pts[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const stars = new THREE.Points(geo, starMat);
  grp.add(stars);
  return { group: grp, spin: chart, stars };
}

/** 第七十三條：一塊被推倒、埋了一半的碑（一個玩笑，而且它自己知道）。 */
function secretJokeStele(kit) {
  const grp = new THREE.Group();
  put(grp, ico(1.5, 0), stone(kit.dark), [0, -0.5, 0], [0.2, 0.4, 0.1], [1.6, 0.5, 1.4]);
  const slab = put(grp, boxg(1.0, 2.2, 0.24), stone(kit.mid), [0, 0.62, 0], [-1.05, 0.5, 0.15]);
  // 這塊碑是真的一塊石頭（推倒了但還在），所以擋得住人 —— 發現半徑 5 公尺，照樣走得到
  slab.userData.solidRadius = 0.95;
  slab.userData.keepSolid = true;
  put(slab, boxg(0.8, 1.7, 0.02), auraMaterial(PALETTE.warm, 0.14), [0, 0, 0.14]);
  put(grp, ico(0.4, 0), stone(kit.dark), [1.3, 0.16, -0.9], [0.3, 0.9, 0], [1, 0.6, 1]);
  return { group: grp, spin: null, stars: null };
}

/** 回聲的小祠：三塊靠在一起的石頭圍出一個很小的空間，裡面有一點光。 */
function secretEchoShrine(kit) {
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    put(
      grp,
      boxg(0.5, 2.1, 0.5),
      stone(kit.mid),
      [Math.cos(a) * 1.05, 1.0, Math.sin(a) * 1.05],
      [Math.sin(a) * 0.16, -a, Math.cos(a) * 0.16]
    );
  }
  put(grp, cyl(0.7, 0.9, 0.3, 8), stone(kit.dark), [0, 0.15, 0]);
  const flame = put(grp, ico(0.24, 0), emissive(PALETTE.warm, 2.6), [0, 0.62, 0]);
  const halo = put(grp, torus(0.95, 0.05, 4, 20), auraMaterial(PALETTE.warm, 0.28), [0, 0.34, 0], [-Math.PI / 2, 0, 0]);
  return { group: grp, spin: halo, stars: flame };
}

/** 靜語窪地：一圈朝內傾斜的石片。站進去，世界會安靜一點。 */
function secretHush(kit) {
  const grp = new THREE.Group();
  const n = 7;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    put(
      grp,
      boxg(0.7, 1.7, 0.18),
      stone(kit.mid),
      [Math.cos(a) * 2.3, 0.75, Math.sin(a) * 2.3],
      [Math.cos(a) * 0.3, -a, Math.sin(a) * 0.3]
    );
  }
  const pool = put(grp, disc(1.7, 20), auraMaterial(kit.light, 0.16), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
  return { group: grp, spin: pool, stars: null };
}

/**
 * 高處的記號（v1.2 · P15）：**躺在高台頂面上的那一件東西**。
 *
 * 它刻意是**平的**：一片很淺的刻板、幾顆小石籤、一圈光。
 * 從地上看不到（頂面比 `EYE_HEIGHT` 1.6 公尺還高 —— 平躺的東西從下面只看得到石鼓的側面），
 * 也搆不到（`SECRET_HIGH_REACH`）。**跳上去才換得到。**
 */
function secretTopMark(kit) {
  const grp = new THREE.Group();
  // 刻板：躺平的一小塊，邊緣一圈光
  put(grp, boxg(1.25, 0.06, 0.9), stone(kit.mid), [0, 0.04, 0]);
  const halo = put(grp, disc(0.78, 18), auraMaterial(kit.light, 0.2), [0, 0.09, 0], [-Math.PI / 2, 0, 0]);
  // 三枚小石籤：站上去才看得到它們排成一列
  for (let i = 0; i < 3; i += 1) {
    put(grp, boxg(0.16, 0.2, 0.16), stone(kit.dark), [-0.36 + i * 0.36, 0.14, 0.52], [0, 0.2 * i, 0]);
  }
  const mark = put(grp, ico(0.13, 0), emissive(kit.accent, 2.2), [0, 0.2, -0.34]);
  return { group: grp, spin: halo, stars: mark };
}

/** 顏色不對的那一小塊（v1.2 · P15 · tell「odd」的專用造型）：一排刻度石裡混進來的那一片。 */
function secretOddShard(kit) {
  const grp = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    put(grp, boxg(0.42, 1.1 + (i % 3) * 0.24, 0.34), stone(kit.mid), [-1.6 + i * 0.8, 0.6, 0], [0, 0.12 * i, 0.04 * (i - 2)]);
  }
  put(grp, cyl(0.9, 1.1, 0.34, 7), stone(kit.dark), [0, 0.17, 0.9]);
  const lifted = put(grp, boxg(0.46, 1.0, 0.3), stone(kit.light), [0.4, 0.62, 0.95], [0.1, 0.5, -0.18]);
  return { group: grp, spin: null, stars: lifted };
}

/** 走近才聽得到的那幾片薄石（v1.2 · P15 · tell「sound」的專用造型）。 */
function secretWhisper(kit) {
  const grp = new THREE.Group();
  put(grp, cyl(0.34, 0.42, 2.3, 6), stone(kit.dark), [0, 1.15, 0], [0.14, 0.3, 0.24]);
  const chimes = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    put(chimes, boxg(0.2, 0.72, 0.05), stone(kit.light), [Math.cos(a) * 0.34, -0.42, Math.sin(a) * 0.34], [0, -a, 0.06]);
  }
  chimes.position.set(0.32, 1.9, 0.42);
  grp.add(chimes);
  const halo = put(grp, torus(0.66, 0.035, 4, 18), auraMaterial(kit.light, 0.18), [0.32, 1.5, 0.42], [-Math.PI / 2, 0, 0]);
  return { group: grp, spin: halo, stars: chimes };
}

const SECRET_BUILDERS = {
  stargrove: secretStarGrove,
  jokestele: secretJokeStele,
  echoshrine: secretEchoShrine,
  hush: secretHush,
  topmark: secretTopMark,
  oddshard: secretOddShard,
  whisper: secretWhisper,
};

/**
 * 三種 tell（v1.2 · P15）：找到它之前，世界先給的那一點提示。
 *
 * 這三種**不是三套程式**，是同一件事的三個入口：
 *   · `odd`   **不對的東西**：一小塊顏色與這片土地格格不入的碎片（`oddAccent`）。
 *             眼角先看到它 —— 純視覺，不吃任何每幀工作。
 *   · `sound` **聲音先到**：外圈再套一個半徑（`SECRET_TELL_RATIO` 倍），
 *             走進去先響一聲很細的音，看到它之前就先聽到。
 *   · `high`  **高處**：它躺在高台的頂面上；腳離地不到 `SECRET_HIGH_REACH` 就搆不到
 *             （站在地上、蹲在旁邊都一樣）——**跳上去才換得到**。
 */
export const SECRET_TELLS = Object.freeze(['odd', 'sound', 'high']);
/** 「聲音先到」的外圈是發現半徑的幾倍。 */
export const SECRET_TELL_RATIO = 1.8;
/**
 * 「聲音先到」放的是哪一支音（風鈴那一支很細的合成音）。
 *
 * **一定要是 `audio.js` 的音效表裡真的有的名字。** `audio.cue()` 對不認得的名字是
 * 「靜靜地回 false」——不報錯、不丟例外，所以打錯字的後果是「這個 tell 永遠沒有聲音」，
 * 而其他每一條斷言都照樣綠（P15 第一版寫成 `chime`，世界上根本沒有這一支）。
 * `test:rubric` 因此逐處比對這個名字真的在音效表裡。
 */
export const SECRET_TELL_SOUND = 'chimeSoft';
/**
 * 「高處」搆得到的門檻：腳離自己腳下的地至少這麼高（公尺）。
 *
 * **刻意是一個固定的常數，不是「那座高台的頂面」**：門檻若跟著高台走，
 * 把高台壓矮之後「站上去搆得到」照樣成立 —— 那條斷言就永遠不會紅（findings：
 * 「寫得出來的斷言不等於抓得到東西」）。1.4 公尺低於現行每一座高台（1.6／1.7），
 * 高於任何一階地形起伏與 `STAND_MIN_H`（0.6）—— 走路的人永遠搆不到。
 */
export const SECRET_HIGH_REACH = 1.4;

/**
 * 蓋出一個祕密。
 *
 * @param {object} spec `secrets.json` 的一筆
 * @param {object} kit 這一區的四階色
 * @param {(x:number,z:number)=>number} terrainHeight
 * @param {number} [lift] **頂面加高**（公尺）—— `tell: "high"` 的祕密躺在高台的頂面上，
 *   所以它的整組幾何要往上搬那一座高台的高度（`screens.js` 的 `PLATFORMS`）。
 *   0 ＝ 站在地上（其餘每一處都是 0，行為與 P15 之前逐值相同）。
 */
export function buildSecret(spec, kit, terrainHeight, lift = 0) {
  const make = SECRET_BUILDERS[spec.prop] || secretJokeStele;
  const built = make(kit);
  const grp = new THREE.Group();
  const [x, z] = spec.at;
  const y = terrainHeight(x, z) + (lift > 0 ? lift : 0);
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(spec.rot) ? spec.rot : 0;
  grp.name = `secret:${spec.id}`;
  grp.add(built.group);
  // 記下「起伏之前」的高度：每一種造型的那一件東西各自被擺在不同的地方
  if (built.stars && !built.stars.isPoints) built.stars.userData.baseY = built.stars.position.y;
  /*
   * tell「不對的東西」：一小塊顏色與這片土地格格不入的碎片（`oddAccent`）。
   * 它是**加在造型之外**的一件東西 —— 三種 tell 於是可以套在任何一種造型上，
   * 不必為了換 tell 重寫一個 prop（`test:rubric` 逐處驗它真的存在、而且顏色真的不對）。
   */
  if (spec.tell === 'odd' && spec.oddAccent) {
    const shard = put(grp, ico(0.34, 0), emissive(spec.oddAccent, 2.4), [1.15, 0.42, -0.9], [0.4, 0.7, 0.2], [1, 1.5, 0.7]);
    shard.name = `secret-odd:${spec.id}`;
    shard.userData.noCollide = true;
  }
  return {
    id: spec.id,
    spec,
    group: grp,
    /** 這一處的 tell（`null` ＝ 沒登記；資料層一律要有，測試在守）。 */
    tell: spec.tell || null,
    /** 腳要離地多高才搆得到（`tell: "high"` 才 > 0）。 */
    reach: spec.tell === 'high' ? SECRET_HIGH_REACH : 0,
    /** 「聲音先到」的外圈半徑（0 ＝ 這一處沒有聲音 tell）。 */
    tellRadius: spec.tell === 'sound' ? (spec.radius || SECRET_RADIUS) * SECRET_TELL_RATIO : 0,
    /** 腳下地形的高度（`reach` 是**離地**多高，不是世界高度）。 */
    groundY: terrainHeight(x, z),
    told: false,
    position: new THREE.Vector3(x, y, z),
    found: false,
    setFound(v) {
      this.found = Boolean(v);
    },
    update(dt, t, kinetic) {
      if (built.spin) built.spin.rotation.z = t * 0.08;
      if (built.stars) {
        if (built.stars.isPoints) built.stars.rotation.y = t * 0.045;
        /*
         * 起伏要繞著**它自己被擺在哪裡**擺，不是繞著一個寫死的 0.62 ——
         * 那會把掛在柱子頂端的風片（y=1.9）整組拉到柱腳、
         * 把刻意平躺在石鼓面上的記號抬到 2.27 公尺（高處的 tell 就從地上看得到了）。
         * 基準在蓋出來的那一刻就記在 `userData.baseY` 上（P15 審查 · 第 2／3 條）。
         */
        else built.stars.position.y = built.stars.userData.baseY + Math.sin(t * 1.4) * 0.05 * kinetic;
      }
    },
  };
}

/** 蓋出一個會回應的東西。 */
export function buildReaction(spot, kit, terrainHeight) {
  const make = REACTION_BUILDERS[spot.kind];
  if (!make) return null;
  const built = make(kit, spot.opts || {});
  const [x, z] = spot.at;
  const y = terrainHeight(x, z);
  built.group.position.set(x, y, z);
  built.group.name = `reactive:${spot.id}`;
  built.id = spot.id;
  built.kind = spot.kind;
  built.spot = spot;
  built.x = x;
  built.z = z;
  return built;
}

/* ------------------------------------------------------------------ *
 * 反應場：每幀掃一次玩家附近的觸發點
 * ------------------------------------------------------------------ */

/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
/** 離場半徑 ÷ 進場半徑（hysteresis：站在邊界上不會連續觸發）。 */
export const EXIT_RATIO = 1.3;
/** 任兩聲之間的全域冷卻（秒）。 */
export const SOUND_COOLDOWN = 0.09;
/** 同一個觸發點自己的冷卻（秒）。 */
export const TRIGGER_COOLDOWN = 2.2;
/** 「最近放過的音」環狀緩衝長度 —— 不准連續重複同一個音。 */
export const RECENT_SIZE = 4;

/**
 * 建立整個反應場。
 *
 * @param {object} opts
 * @param {Array} opts.spots        REACTIVE_SPOTS（或子集）
 * @param {Array} opts.secrets      secrets.json 的 entries
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {(evt:object)=>void} [opts.onReact]   要放聲音時呼叫
 * @param {(id:string)=>void} [opts.onSecret]   第一次走進某個祕密時呼叫
 * @param {()=>boolean} [opts.isBusy]           面板打開時整組停手（不要在讀題時響）
 * @param {boolean} [opts.reducedMotion]
 */
export function createReactiveField({
  spots = REACTIVE_SPOTS,
  secrets = [],
  /**
   * v1.2 · P15：高台（`screens.js` 的 `PLATFORMS`）—— `tell: "high"` 的祕密
   * 躺在 `onPlatform` 指的那一座的頂面上，所以這裡要查得到它有多高。
   * 沒給就當作沒有高台（那幾處會退回站在地上，測試會抓到「搆得到卻不必跳」）。
   */
  platforms = [],
  kitOf,
  terrainHeight,
  onReact = null,
  onSecret = null,
  isBusy = null,
  reducedMotion = false,
  /**
   * v1.2 · P19：外交式導向的單位向量 `{ on, x, z }`。
   * **同一個物件**每幀被讀（不重建 → 零配置）；`on` 為假就整層當作沒有導向，
   * 螢火群走的是 P19 之前那一條路。沒給就等於「這個世界沒有導向」。
   */
  guide = null,
  /**
   * 現在是什麼畫質（**當下**問的，玩家在設定裡切畫質不必重建世界）。
   * 低畫質整層關掉導向 —— 同石座演出（`rubric-fx.js`）的作法。
   */
  qualityOf = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'reactive';

  const objects = [];
  for (const spot of spots) {
    const built = buildReaction(spot, kitOf(spot.region), terrainHeight);
    if (!built) continue;
    group.add(built.group);
    objects.push(built);
  }

  const platformById = new Map((platforms || []).map((pf) => [pf.id, pf]));
  const secretObjs = [];
  for (const spec of secrets) {
    const pf = spec.onPlatform ? platformById.get(spec.onPlatform) : null;
    const built = buildSecret(spec, kitOf(spec.region), terrainHeight, pf ? pf.height : 0);
    group.add(built.group);
    secretObjs.push(built);
  }

  /*
   * 觸發點登記表：扁平的數字陣列，tick 裡完全不配置記憶體。
   * 每個觸發點 6 個欄位：ownerIndex, localIndex, worldX, worldZ, enterR², exitR²
   */
  const T_STRIDE = 6;
  const tData = [];
  const tState = []; // 0 = 在外面、1 = 在裡面
  const tCool = []; // 冷卻到什麼時候（秒）
  for (let oi = 0; oi < objects.length; oi += 1) {
    const o = objects[oi];
    for (let li = 0; li < o.triggers.length; li += 1) {
      const tr = o.triggers[li];
      const wx = o.x + (tr.dx || 0);
      const wz = o.z + (tr.dz || 0);
      const enter = tr.enter || 3;
      const exit = enter * EXIT_RATIO;
      tData.push(oi, li, wx, wz, enter * enter, exit * exit);
      tState.push(0);
      tCool.push(0);
    }
  }
  const triggers = new Float64Array(tData);
  const triggerCount = tState.length;

  const recent = new Int32Array(RECENT_SIZE).fill(-999);
  let recentAt = 0;
  let lastSoundAt = -10;
  let clock = 0;
  let frame = 0;
  const kinetic = reducedMotion ? 0.12 : 1;

  /** 這個音最近放過嗎（環狀緩衝，避免「隨機」聽起來一直重複）。 */
  function recentlyPlayed(note) {
    for (let i = 0; i < RECENT_SIZE; i += 1) if (recent[i] === note) return true;
    return false;
  }

  /**
   * 隨機挑的音如果剛剛才響過，就**換一個**，而不是整聲不放。
   *
   * 「不准重複」的目的是讓同一支合成音聽起來不像壞掉的錄音，
   * 不是讓玩家走過去卻什麼都沒聽到 —— 沉默不是回應。
   * 整個音階都在緩衝裡（走得非常快）時就照原本的音放，至少有聲音。
   */
  function pickFresh(note) {
    if (!recentlyPlayed(note)) return note;
    const start = PENTATONIC.indexOf(note);
    for (let k = 1; k <= PENTATONIC.length; k += 1) {
      const cand = PENTATONIC[(Math.max(0, start) + k) % PENTATONIC.length];
      if (!recentlyPlayed(cand)) return cand;
    }
    return note;
  }

  const api = {
    group,
    objects,
    secrets: secretObjs,
    /** 觸發點總數（測試與除錯用）。 */
    get triggerCount() {
      return triggerCount;
    },
    /** 目前有幾個觸發點是「玩家在裡面」的狀態。 */
    get insideCount() {
      let n = 0;
      for (let i = 0; i < triggerCount; i += 1) if (tState[i]) n += 1;
      return n;
    },
    /** 這個祕密已經找到了（載入存檔時呼叫）。 */
    markSecretFound(id) {
      for (const s of secretObjs) if (s.id === id) s.setFound(true);
    },
    /** 這個祕密現在的狀態（測試用）。 */
    secret(id) {
      return secretObjs.find((s) => s.id === id) || null;
    },
    /** 這個反應物件現在的狀態（測試用）。 */
    object(id) {
      return objects.find((o) => o.id === id) || null;
    },

    /**
     * @param {number} dt
     * @param {number} t
     * @param {number} px 玩家 x
     * @param {number} pz 玩家 z
     * @param {number} [py] **玩家腳的世界高度**（v1.2 · P15：`tell: "high"` 的祕密要問它）。
     *   沒給就當作站在地上 —— 那幾處於是永遠搆不到（保守：寧可拿不到，不要白給）。
     */
    update(dt, t, px, pz, py = -Infinity) {
      clock = t;
      frame += 1;
      const busy = isBusy ? isBusy() : false;

      /* --- 事件層：CPU 距離判定 ＋ hysteresis --- */
      if (!busy) {
        for (let i = 0; i < triggerCount; i += 1) {
          const base = i * T_STRIDE;
          const dx = px - triggers[base + 2];
          const dz = pz - triggers[base + 3];
          const d2 = dx * dx + dz * dz;
          if (d2 > FAR_SQ) {
            if (tState[i]) tState[i] = 0;
            continue;
          }
          // 遠一點的每 3 幀才算一次（用 index 錯開，工作量平均分散）
          if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;

          if (tState[i]) {
            if (d2 > triggers[base + 5]) tState[i] = 0;
            continue;
          }
          if (d2 > triggers[base + 4]) continue;
          tState[i] = 1;
          if (clock < tCool[i]) continue;
          tCool[i] = clock + TRIGGER_COOLDOWN;
          const owner = objects[triggers[base]];
          const evt = owner.onEnter(triggers[base + 1]);
          if (!evt || !onReact) continue;
          if (clock - lastSoundAt < SOUND_COOLDOWN) continue;
          /*
           * 環狀緩衝只作用在「隨機挑的音」（風鈴）上，而且是**換一個**、不是不放。
           * 音石列的音高是刻意排好的旋律 —— 那些原封不動，
           * 不然走過一排石頭會莫名其妙缺幾個音。
           */
          let note = evt.note;
          if (evt.varied) {
            note = pickFresh(note);
            recent[recentAt] = note;
            recentAt = (recentAt + 1) % RECENT_SIZE;
          }
          lastSoundAt = clock;
          onReact({
            id: owner.id,
            kind: owner.kind,
            sound: evt.sound,
            note,
            // 半音 → 播放速率（同一支合成音當成很多支用）
            baseScale: semitone(note),
          });
        }
      }

      /*
       * v1.2 · P19：這一幀的導向向量。**一幀只問一次**（不是每一團問一次），
       * 而且是兩個純量 —— tick 裡不配置任何東西。
       * 低畫質整層關掉；`guide.on` 為假時是 0，螢火群走 P19 之前那一條路。
       */
      let gx = 0;
      let gz = 0;
      if (guide && guide.on && (!qualityOf || qualityOf() !== 'low')) {
        gx = guide.x;
        gz = guide.z;
      }

      /* --- 動畫層：只更新玩家附近的（遠的東西動不動沒人看得到） --- */
      for (let i = 0; i < objects.length; i += 1) {
        const o = objects[i];
        const dx = px - o.x;
        const dz = pz - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FAR_SQ) continue;
        if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;
        const reach = o.triggers[0].enter * 2.2;
        const near = Math.max(0, 1 - Math.sqrt(d2) / reach);
        o.update(dt, t, kinetic, near, dx, dz, gx, gz);
      }

      /* --- 祕密：走進去就算找到（不用按 E） --- */
      for (let i = 0; i < secretObjs.length; i += 1) {
        const s = secretObjs[i];
        const dx = px - s.position.x;
        const dz = pz - s.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FAR_SQ) continue;
        s.update(dt, t, kinetic);
        if (busy || s.found) continue;
        /*
         * tell「聲音先到」（v1.2 · P15）：外圈先響一聲很細的音 ——
         * **看到它之前就先聽到**。一處只響一次（`told`），而且與所有反應物共用
         * 同一條全域聲音冷卻，不會跟旁邊的風鈴糊在一起。
         */
        if (s.tellRadius > 0 && !s.told && d2 <= s.tellRadius * s.tellRadius) {
          /*
           * **響了才算說過**（P15 審查 · 第 5 條）：`told` 原本在冷卻判斷之前就記上，
           * 所以只要進圈的那一刻剛好撞上別的反應音的 90 毫秒冷卻，這一聲就被丟掉、
           * 而且這一處**整場再也不會響**。冷卻中就先不記，下一幀還在圈裡會再試一次。
           */
          if (onReact && clock - lastSoundAt >= SOUND_COOLDOWN) {
            s.told = true;
            lastSoundAt = clock;
            onReact({ id: s.id, kind: 'secret-tell', sound: SECRET_TELL_SOUND, note: PENTATONIC[0], baseScale: semitone(19) });
          } else if (!onReact) {
            s.told = true; // 沒有接聲音的呼叫端（測試替身）：照舊只算一次
          }
        }
        const r = (s.spec.radius || SECRET_RADIUS) ** 2;
        if (d2 > r) continue;
        /*
         * tell「高處」：腳離地不到 `SECRET_HIGH_REACH` 就搆不到。
         * 走路的人腳永遠在地形高度上（`py === s.groundY`）—— 只有站上高台才過得了這一關。
         */
        if (s.reach > 0 && !(py >= s.groundY + s.reach)) continue;
        s.setFound(true);
        onSecret?.(s.id);
      }
    },
  };
  return api;
}

export default {
  REACTIVE_SPOTS,
  REACT_TRIGGER_R,
  SONGSTONE_ROW_CLEAR,
  reactiveTriggerR,
  songStoneOffsets,
  reactiveTargets,
  REACTION_KINDS,
  SECRET_XP,
  SECRET_RADIUS,
  SECRET_TELLS,
  SECRET_TELL_RATIO,
  SECRET_TELL_SOUND,
  SECRET_HIGH_REACH,
  buildReaction,
  buildSecret,
  createReactiveField,
  disposeReactiveCache,
};

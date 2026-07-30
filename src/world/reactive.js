/**
 * PromptArcade — 會回應你的東西（proximity reactions）＋ 藏起來的地方（secrets）
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
    triggers: [{ dx: 0, dz: 0, enter: 3.2, note: 0 }],
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
    triggers: [{ dx: 0, dz: 0, enter: 4.4, note: 0 }],
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
  const n = opts.stones || 5;
  const gap = opts.gap || 2.3;
  const dir = Number.isFinite(opts.dir) ? opts.dir : 0;
  const stones = [];
  const triggers = [];
  for (let i = 0; i < n; i += 1) {
    const off = (i - (n - 1) / 2) * gap;
    const x = Math.cos(dir) * off;
    const z = Math.sin(dir) * off;
    const holder = new THREE.Object3D();
    holder.position.set(x, 0, z);
    const mat = emissive(kit.light, 0.16);
    const body = put(holder, ico(0.42, 0), stone(kit.mid), [0, 0.28, 0], [0.2, i * 0.9, 0.1], [1, 0.78, 1]);
    const vein = put(holder, torus(0.3, 0.03, 4, 14), mat, [0, 0.46, 0], [-Math.PI / 2, 0, 0]);
    grp.add(holder);
    stones.push({ holder, body, vein, mat, ring: 0 });
    triggers.push({ dx: x, dz: z, enter: 1.75, note: PENTATONIC[i % PENTATONIC.length] });
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
  const r = opts.radius || 1.7;
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
    triggers: [{ dx: 0, dz: 0, enter: r + 1.5, note: 0 }],
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
    triggers: [{ dx: 0, dz: 0, enter: 4.2, note: 0 }],
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
    triggers: [{ dx: 0, dz: 0, enter: 3.0, note: 0 }],
    onEnter() {
      this.scatter = 1;
      return { sound: 'flutter', note: 19 };
    },
    update(dt, t, kinetic, near, toPlayerX, toPlayerZ) {
      this.scatter = Math.max(0, this.scatter - dt * 0.5);
      const arr = this.points.geometry.attributes.position.array;
      const push = this.scatter * 2.6 * kinetic;
      const len = Math.hypot(toPlayerX, toPlayerZ) || 1;
      const ax = -toPlayerX / len;
      const az = -toPlayerZ / len;
      for (let i = 0; i < this.n; i += 1) {
        const hx = this.home[i * 3] + ax * push * (0.5 + (i % 4) * 0.2);
        const hy = this.home[i * 3 + 1] + this.scatter * 0.7 * kinetic;
        const hz = this.home[i * 3 + 2] + az * push * (0.5 + (i % 4) * 0.2);
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
  { id: 'hub-chime-pool', kind: 'chime', region: 'foundations', at: [-39, 16] },
  { id: 'hub-caps-carve', kind: 'glowcap', region: 'foundations', at: [-15, -34] },
  { id: 'hub-song-tea', kind: 'songstone', region: 'foundations', at: [27, 44], opts: { dir: 0.8 } },
  { id: 'hub-spirit-camp', kind: 'spirit', region: 'foundations', at: [40, 11] },
  { id: 'hub-moths-west', kind: 'moths', region: 'foundations', at: [-31, 5] },
  { id: 'hub-ripple-south', kind: 'ripple', region: 'foundations', at: [-6, -44] },

  /* --- reasoning：階梯迴廊 --- */
  { id: 'rsn-song-stair', kind: 'songstone', region: 'reasoning', at: [-77, -92], opts: { dir: 1.2, stones: 6 } },
  { id: 'rsn-caps-thinker', kind: 'glowcap', region: 'reasoning', at: [-105, -110] },
  { id: 'rsn-chime-examples', kind: 'chime', region: 'reasoning', at: [-108, -82] },
  { id: 'rsn-moths-north', kind: 'moths', region: 'reasoning', at: [-104, -123] },

  /* --- grounding：沉書檔案庫 --- */
  { id: 'gnd-ripple-desk', kind: 'ripple', region: 'grounding', at: [92, -74] },
  { id: 'gnd-chime-nook', kind: 'chime', region: 'grounding', at: [104, -117] },
  { id: 'gnd-caps-well', kind: 'glowcap', region: 'grounding', at: [87, -117] },
  { id: 'gnd-spirit-east', kind: 'spirit', region: 'grounding', at: [107, -81] },

  /* --- orchestration：齒輪工坊 --- */
  { id: 'orc-chime-draft', kind: 'chime', region: 'orchestration', at: [-98, 131] },
  { id: 'orc-song-engine', kind: 'songstone', region: 'orchestration', at: [-108, 109], opts: { dir: -0.6 } },
  { id: 'orc-caps-west', kind: 'glowcap', region: 'orchestration', at: [-113, 97] },
  { id: 'orc-moths-yard', kind: 'moths', region: 'orchestration', at: [-76, 115] },

  /* --- config：面具劇場 --- */
  { id: 'cfg-caps-stage', kind: 'glowcap', region: 'config', at: [95, 123] },
  { id: 'cfg-ripple-mirror', kind: 'ripple', region: 'config', at: [103, 112] },
  { id: 'cfg-spirit-dressing', kind: 'spirit', region: 'config', at: [76, 96] },
  { id: 'cfg-song-east', kind: 'songstone', region: 'config', at: [123, 113], opts: { dir: 1.9 } },
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

const SECRET_BUILDERS = {
  stargrove: secretStarGrove,
  jokestele: secretJokeStele,
  echoshrine: secretEchoShrine,
  hush: secretHush,
};

/** 蓋出一個祕密。 */
export function buildSecret(spec, kit, terrainHeight) {
  const make = SECRET_BUILDERS[spec.prop] || secretJokeStele;
  const built = make(kit);
  const grp = new THREE.Group();
  const [x, z] = spec.at;
  const y = terrainHeight(x, z);
  grp.position.set(x, y, z);
  grp.rotation.y = Number.isFinite(spec.rot) ? spec.rot : 0;
  grp.name = `secret:${spec.id}`;
  grp.add(built.group);
  return {
    id: spec.id,
    spec,
    group: grp,
    position: new THREE.Vector3(x, y, z),
    found: false,
    setFound(v) {
      this.found = Boolean(v);
    },
    update(dt, t, kinetic) {
      if (built.spin) built.spin.rotation.z = t * 0.08;
      if (built.stars) {
        if (built.stars.isPoints) built.stars.rotation.y = t * 0.045;
        else built.stars.position.y = 0.62 + Math.sin(t * 1.4) * 0.05 * kinetic;
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
  kitOf,
  terrainHeight,
  onReact = null,
  onSecret = null,
  isBusy = null,
  reducedMotion = false,
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

  const secretObjs = [];
  for (const spec of secrets) {
    const built = buildSecret(spec, kitOf(spec.region), terrainHeight);
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

    update(dt, t, px, pz) {
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
        o.update(dt, t, kinetic, near, dx, dz);
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
        const r = (s.spec.radius || SECRET_RADIUS) ** 2;
        if (d2 > r) continue;
        s.setFound(true);
        onSecret?.(s.id);
      }
    },
  };
  return api;
}

export default {
  REACTIVE_SPOTS,
  REACTION_KINDS,
  SECRET_XP,
  SECRET_RADIUS,
  buildReaction,
  buildSecret,
  createReactiveField,
  disposeReactiveCache,
};

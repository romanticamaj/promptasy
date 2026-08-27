/**
 * Promptasy — 終局的兩件東西（v1.2 · P22）
 *
 * ① **回聲的小祠**（`finale:echo-shrine`）—— 斷環旁一座及腰的三面石龕。
 *    龕裡的燈座上停著**最後一團濁氣**：那就是玩家自己序章寫的那一句
 *    （牠身上那句話由 `turning.js` 的 `finalSayFor()` 交出來，不在 3D 裡排版）。
 *    **沒到門檻的時候整座龕是暗的**：龕在那裡、走得過去、也看得到，
 *    只是那一團看不清、龕也不接 `E`。這不是一道鎖，是「還沒開口」——
 *    畫面上不會有一個字說你還差幾條（那會把終局變成一張待辦清單）。
 *    130 條技法全收 ＋ 四宿全亮 → 龕口亮起一道冷星光，那一團才看得清楚。
 *    儀式走完 → **殼散掉，燈座上留下一盞暖白的清燈**（世界的光語言一格沒變：
 *    §1.6「安撫後叫清燈，留在原位」；暖金只給成就熱點，所以那盞燈**只在儀式之後**亮）。
 *
 * ② **母碑**（`finale:mother-stele-raised`）—— 斷環正中央那塊倒了很久的碑。
 *    儀式走完之前**整組不畫**（`visible = false`）：斷環中央是空的，那正是
 *    「母碑倒下的那一年，環也斷成了兩半」在畫面上的樣子。儀式走完，它站起來。
 *    碑面上的字**不在 3D 裡排版**（世界裡從來沒有真的字，只有刻痕）——
 *    刻上去的那一句要走近按 `E` 才讀得到，讀的是既有的刻印牌那一層。
 *
 * 兩件走**同一層互動**（`world.nearestFinale()`），所以只有一組仲裁要維護，
 * 而它排在**仲裁的第一位**：這是整條故事線的終點，沒有任何一層該蓋掉它。
 * 兩者的圈**與每一層都不重疊**（量出來的：小祠最緊的一邊還剩 4.45 公尺、
 * 母碑最緊的一邊還剩 0.32 公尺 —— 東橋碑就站在斷環外那一圈上），
 * 所以「排第一」在實務上根本不會與誰相爭。
 *
 * **0 光源**（護欄：光源固定 37 盞）：燈是自發光材質 ＋ 一片加色混合的光暈 sprite。
 * 每幀迴圈照 `watchmen.js` 那一套：平方距離、45 公尺外整組跳過、
 * 15 公尺外每 3 幀一次、**零每幀配置**（tick 裡不 new、不 map/filter、不建閉包）。
 * `prefers-reduced-motion`：呼吸與轉動整個停掉，只留終態（光照樣亮 —— 關掉的是「動」）。
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';
import { FINALE, SHRINE_RADIUS, STELE_RADIUS } from './turning.js';

/** 小祠站在哪裡（量出來的，理由與數字寫在 WORLD.md §4.20）。 */
export const SHRINE_AT = Object.freeze([22.25, -17.5]);
/** 母碑站在哪裡 —— 斷環的正中央（`LANDMARKS` 的 `broken-ring`）。 */
export const STELE_AT = Object.freeze([34, -30]);
/**
 * 母碑腳下墊高多少（公尺）＝ 斷環那塊臺座的高度。
 *
 * 臺座是 `landmarkBrokenRing()` 的 `cyl(5.2, 6.4, 1.4)`，擺在 `[0, 0.7, 0]` ——
 * 上緣正好是 1.4。母碑要站在臺面上，不是陷在臺座裡。
 */
export const STELE_LIFT = 1.4;

/** 燈心的暖白（同守夜人手上那盞：全世界只有成就熱點與人點的燈是暖的）。 */
const WARM = 0xffe9c0;
/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
/** 走到這麼近，龕裡的光會亮一階（idle → aware）。 */
export const FINALE_AWARE_RADIUS = 12;
const AWARE_SQ = FINALE_AWARE_RADIUS * FINALE_AWARE_RADIUS;
/** 母碑站起來要多久（秒）—— 只是演出，`raised` 一設定就已經算立起來了。 */
export const RAISE_SECONDS = 2.2;

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
export function disposeFinaleCache() {
  for (const v of GEO.values()) v.dispose();
  GEO.clear();
  for (const v of MAT.values()) v.dispose();
  MAT.clear();
  if (glowTex) {
    glowTex.dispose();
    glowTex = null;
  }
}

const box = (w, h, d) => g(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s) => g(`cyl:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ring = (ri, ro, s) => g(`ring:${ri},${ro},${s}`, () => new THREE.RingGeometry(ri, ro, s));
const plane = (w, h) => g(`plane:${w},${h}`, () => new THREE.PlaneGeometry(w, h));

const stone = (c) => mat(`stone:${c}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.94 }));

/** 一塊什麼都不擋的裝飾（碰撞由那一件自己那顆 `solidRadius` 負責）。 */
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
 * 蓋出回聲的小祠。
 *
 * 三角形：底座 12 ＋ 後牆 12 ＋ 兩片側牆 24 ＋ 楣 12 ＋ 燈座 28 ＋ 燈心 20
 * ＋ 濁氣的殼 20 ＋ 那一點眼光 20 ＋ 光暈 2 ＋ 龕口那道光 2 ＋ 腳下的環 40 ＝ **192**。
 *
 * 碰撞：後牆一顆 `solidRadius = 0.78`（< `STAND_MIN_R` 0.8 → 稽核那邊天生
 * `standable = false`：一座及腰的石龕站不上人，這件事靠尺寸成立，不靠旗標宣告）。
 *
 * @param {object} kit 區域色盤（`kitFor('foundations')`）
 * @param {(x:number,z:number)=>number} terrainHeight
 * @param {number} rot 龕口朝哪（弧度）
 */
function buildShrine(kit, terrainHeight, rot) {
  const [x, z] = SHRINE_AT;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `finale:${FINALE.shrineId}`;
  grp.position.set(x, y, z);
  grp.rotation.y = rot;

  put(grp, box(2.6, 0.34, 2.0), stone(kit.dark), [0, 0.17, 0]);
  const back = new THREE.Mesh(box(2.4, 2.0, 0.3), stone(kit.mid));
  back.name = 'back';
  back.position.set(0, 1.3, -0.8);
  // 唯一的碰撞體：一座石龕擋得住人，但站不上去（0.78 < STAND_MIN_R 0.8）
  back.userData.solidRadius = 0.78;
  back.userData.keepSolid = true;
  grp.add(back);
  /*
   * 兩片側牆。它們**各自登記自己那顆碰撞體** —— 一片 1.8 公尺高、0.3 公尺厚的
   * 石板是「有份量」的東西，靠後牆那一顆罩不到它們的中心
   * （後牆的圓在 (0, −0.8)，側牆的中心在 (±1.05, 0.05)，距離 1.35 > 0.78），
   * 而碰撞稽核問的正是「這一塊的外接盒中心有沒有被哪個圓蓋住」。
   * 半徑一律 0.78（< `STAND_MIN_R` 0.8）：一座及腰的石龕站不上人，
   * 這件事靠尺寸成立，不靠旗標宣告（同守夜人與守門者那一條）。
   */
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(box(0.3, 1.8, 1.7), stone(kit.mid));
    wall.name = side < 0 ? 'wall-l' : 'wall-r';
    wall.position.set(side * 1.05, 1.2, 0.05);
    wall.rotation.z = side * 0.02;
    wall.userData.solidRadius = 0.78;
    wall.userData.keepSolid = true;
    grp.add(wall);
  }
  put(grp, box(2.9, 0.26, 2.3), stone(kit.dark), [0, 2.32, 0], [-0.05, 0, 0]);

  // 龕裡那個燈座 —— 空了很久，直到你把 130 條技法收齊
  put(grp, cyl(0.26, 0.36, 0.28, 7), stone(kit.dark), [0, 0.62, 0.1]);

  /*
   * **最後一團濁氣**（`murk`）。牠是一句還沒說完的請求 —— 而這一次那句話是玩家自己的。
   * 造型與 §1.6 的濁靈同一套語言：一層半透明的暗殼 ＋ 中央一點眼光，
   * 會動的只有翻湧與那一點光（不移動、不靠近、不跟隨）。
   * 儀式走完，殼散掉、燈座上留下一盞清燈 —— 那正是「安撫」在畫面上的樣子。
   */
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x2a3444,
    emissive: new THREE.Color(0x121a26),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    roughness: 0.95,
  });
  const shell = new THREE.Mesh(ico(0.34, 0), shellMat);
  shell.name = 'murk';
  shell.position.set(0, 0.96, 0.1);
  shell.userData.noCollide = true;
  grp.add(shell);
  const eyeMat = new THREE.MeshBasicMaterial({
    color: kit.light,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const eye = new THREE.Mesh(ico(0.075, 0), eyeMat);
  eye.name = 'eye';
  eye.position.set(0, 0.96, 0.14);
  eye.userData.noCollide = true;
  grp.add(eye);

  const coreMat = new THREE.MeshStandardMaterial({
    color: WARM,
    emissive: new THREE.Color(WARM),
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.4,
  });
  const core = new THREE.Mesh(ico(0.16, 0), coreMat);
  core.name = 'core';
  core.position.set(0, 0.94, 0.1);
  core.visible = false;
  core.userData.noCollide = true;
  grp.add(core);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: WARM,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  glow.name = 'glow';
  glow.position.set(0, 0.98, 0.1);
  glow.scale.set(3.2, 3.2, 1);
  glow.userData.noCollide = true;
  grp.add(glow);

  // 龕口那道光：開口之後才看得見（暗著的時候透明度 0）
  const slitMat = new THREE.MeshBasicMaterial({
    color: kit.light,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const slit = new THREE.Mesh(plane(1.7, 1.5), slitMat);
  slit.name = 'slit';
  slit.position.set(0, 1.24, 0.9);
  slit.userData.noCollide = true;
  grp.add(slit);

  const markMat = new THREE.MeshBasicMaterial({
    color: kit.light,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mark = new THREE.Mesh(ring(1.5, 1.74, 20), markMat);
  mark.name = 'ring';
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.06;
  mark.userData.noCollide = true;
  grp.add(mark);

  return { group: grp, core, coreMat, shell, shellMat, eye, eyeMat, glow, slitMat, markMat, x, z, y };
}

/**
 * 蓋出母碑。
 *
 * 三角形：座 12 ＋ 碑身 12 ＋ 碑頂 12 ＋ 刻面 2 ＋ 光暈 2 ＋ 腳下的環 40 ＝ **80**。
 *
 * 碰撞：碑身一顆 `solidRadius = 0.75`（同石碑那一階，< `STAND_MIN_R` 0.8）。
 * 它其實一寸路都沒有擋到 —— 它站在斷環臺座（`LANDMARK_SOLIDS` 的 `[0, 0, 5.4]`）
 * 的正中央，人最近只走得到離它 6.02 公尺。登記它是因為**看得見的石頭就要有碰撞體**
 * （碰撞稽核守的正是這一條），不是因為它需要擋誰。
 *
 * @param {object} kit
 * @param {(x:number,z:number)=>number} terrainHeight
 */
function buildStele(kit, terrainHeight) {
  const [x, z] = STELE_AT;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `finale:${FINALE.steleId}`;
  grp.position.set(x, y + STELE_LIFT, z);
  // 立起來之前整組不畫：斷環中央是空的
  grp.visible = false;

  put(grp, box(2.0, 0.44, 1.1), stone(kit.dark), [0, 0.22, 0]);
  const slab = new THREE.Mesh(box(1.5, 5.0, 0.44), stone(kit.mid));
  slab.name = 'slab';
  slab.position.y = 2.94;
  slab.userData.solidRadius = 0.75;
  slab.userData.keepSolid = true;
  grp.add(slab);
  put(grp, box(1.66, 0.3, 0.6), stone(kit.dark), [0, 5.58, 0], [-0.06, 0, 0]);

  /*
   * 碑面那一片刻痕。**世界裡從來沒有真的字** —— 玩家寫的那一句要走近按 `E` 才讀得到
   * （既有的刻印牌那一層，那裡才有真正的排版與 HTML escape）。
   * 這一片只負責「碑上有東西被刻上去了」這件事：留白時它幾乎看不見，刻了就亮起來。
   */
  const inkMat = new THREE.MeshStandardMaterial({
    color: kit.light,
    emissive: new THREE.Color(WARM),
    emissiveIntensity: 0.1,
    transparent: true,
    opacity: 0.14,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const ink = new THREE.Mesh(plane(1.2, 3.6), inkMat);
  ink.name = 'ink';
  ink.position.set(0, 2.94, 0.24);
  ink.userData.noCollide = true;
  grp.add(ink);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: WARM,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  glow.name = 'glow';
  glow.position.set(0, 3.2, 0.3);
  glow.scale.set(5.4, 5.4, 1);
  glow.userData.noCollide = true;
  grp.add(glow);

  const markMat = new THREE.MeshBasicMaterial({
    color: kit.accent,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mark = new THREE.Mesh(ring(1.5, 1.78, 20), markMat);
  mark.name = 'ring';
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.07;
  mark.userData.noCollide = true;
  grp.add(mark);

  return { group: grp, slab, inkMat, glow, markMat, x, z, y: y + STELE_LIFT };
}

/**
 * 建立終局那一層。
 *
 * @param {object} opts
 * @param {object} opts.kit                         `kitFor('foundations')`
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {boolean} [opts.open]                     開機時小祠開口了嗎
 * @param {boolean} [opts.raised]                   開機時母碑立著嗎
 * @param {boolean} [opts.carved]                   開機時碑上有字嗎
 * @param {boolean} [opts.reducedMotion]            只留終態
 */
export function createFinaleField({
  kit,
  terrainHeight,
  open = false,
  raised = false,
  carved = false,
  reducedMotion = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'finale';
  // 龕口朝著母碑（走過來的人先看到龕口，抬頭就是斷環）
  const rot = Math.atan2(STELE_AT[0] - SHRINE_AT[0], STELE_AT[1] - SHRINE_AT[1]);
  const shrine = buildShrine(kit, terrainHeight, rot);
  const stele = buildStele(kit, terrainHeight);
  group.add(shrine.group);
  group.add(stele.group);

  const kinetic = reducedMotion ? 0 : 1;
  let frame = 0;
  let openNow = Boolean(open);
  let raisedNow = Boolean(raised);
  let carvedNow = Boolean(carved);
  /** 站起來那一段演出還剩幾秒（0 ＝ 已經站定；開機還原時直接 0）。 */
  let rising = 0;
  let awareShrine = 0;
  let awareStele = 0;
  let nearWhich = '';

  stele.group.visible = raisedNow;
  applyStatic();

  /** `nearest()` 的共用回傳（每幀被呼叫，不准配置）。 */
  const hit = { kind: '', id: '', distance: 0 };

  /**
   * 靜態的那幾格（開關一變就套一次；`reducedMotion` 之下這就是全部）。
   *
   * 三態，照 §1.6 的光語言排：
   *   · 還沒開口 —— 整座龕是暗的，那一團看不清（殼幾乎透明、眼光沒亮）。
   *   · 開口了   —— 龕口一道**冷星光**，那一團濁氣看得清楚了、眼光盯著你。
   *   · 儀式走完 —— **殼散掉**，燈座上留下一盞**暖白的清燈**
   *     （暖金只給成就熱點，所以那盞燈只在這一刻之後才亮）。
   */
  function applyStatic() {
    // 那一團濁氣：只有「開口了、儀式還沒走完」的時候看得清楚
    const murkOn = openNow && !raisedNow;
    shrine.shellMat.opacity = murkOn ? 0.62 : openNow ? 0 : 0.08;
    shrine.eyeMat.opacity = murkOn ? 0.85 : 0;
    shrine.shell.visible = shrine.shellMat.opacity > 0.001;
    shrine.eye.visible = murkOn;
    // 清燈：儀式走完才亮（在那之前燈座是空的）
    shrine.core.visible = raisedNow;
    shrine.coreMat.emissiveIntensity = raisedNow ? 1.5 : 0;
    shrine.glow.material.opacity = raisedNow ? 0.24 : 0;
    shrine.slitMat.opacity = openNow ? 0.16 : 0;
    shrine.markMat.opacity = openNow ? 0.14 : 0.05;
    stele.inkMat.opacity = carvedNow ? 0.5 : 0.14;
    stele.inkMat.emissiveIntensity = carvedNow ? 0.9 : 0.1;
    stele.glow.material.opacity = carvedNow ? 0.26 : 0.1;
  }

  const api = {
    group,
    /** 小祠那一格（測試與 e2e 靠它問「它亮了嗎」）。 */
    shrine,
    stele,
    get open() {
      return openNow;
    },
    get raised() {
      return raisedNow;
    },
    get carved() {
      return carvedNow;
    },
    /** 站起來那一段演出還在演嗎（e2e 用來等它站定）。 */
    get rising() {
      return rising > 0;
    },

    /** 小祠開不開口（門檻由 `turning.js` 的 `shrineOpen()` 算，這裡只負責看得見）。 */
    setOpen(v) {
      const next = Boolean(v);
      if (next === openNow) return false;
      openNow = next;
      applyStatic();
      return true;
    },

    /**
     * 母碑站起來。
     * @param {boolean} v
     * @param {boolean} [animate] 播那一段站起來的演出（開機還原時給 false）
     */
    setRaised(v, animate = false) {
      const next = Boolean(v);
      if (next === raisedNow) return false;
      raisedNow = next;
      stele.group.visible = raisedNow;
      rising = raisedNow && animate && !reducedMotion ? RAISE_SECONDS : 0;
      if (!raisedNow) rising = 0;
      // 演出中途的姿態由 update() 補；沒有演出就直接站定
      stele.group.rotation.x = rising > 0 ? -Math.PI * 0.42 : 0;
      applyStatic();
      return true;
    },

    /** 碑上有沒有字（有＝那一片刻痕亮起來）。 */
    setCarved(v) {
      const next = Boolean(v);
      if (next === carvedNow) return false;
      carvedNow = next;
      applyStatic();
      return true;
    },

    /** 重置進度：兩件都回到起點。 */
    reset() {
      openNow = false;
      carvedNow = false;
      raisedNow = false;
      rising = 0;
      stele.group.visible = false;
      stele.group.rotation.x = 0;
      applyStatic();
      return true;
    },

    /**
     * 玩家附近可互動的那一件（順便更新「走近」的視覺狀態）。
     *
     * 小祠沒開口就不交出來（**不是鎖住，是還沒開口**：走得過去、看得到，
     * 只是這一層沒有東西可以按）；母碑沒立起來就更不用說了。
     *
     * 回的是**同一個共用物件**（每幀被呼叫，不准配置）。
     *
     * @param {{x:number,z:number}} position
     * @returns {{kind:'shrine'|'stele', id:string, distance:number}|null}
     */
    nearest(position) {
      let kind = '';
      let dist = Infinity;
      if (openNow) {
        const d = Math.hypot(shrine.x - position.x, shrine.z - position.z);
        if (d < SHRINE_RADIUS) {
          kind = 'shrine';
          dist = d;
        }
      }
      if (raisedNow && rising <= 0) {
        const d = Math.hypot(stele.x - position.x, stele.z - position.z);
        if (d < STELE_RADIUS && d < dist) {
          kind = 'stele';
          dist = d;
        }
      }
      nearWhich = kind;
      if (!kind) return null;
      hit.kind = kind;
      hit.id = kind === 'shrine' ? FINALE.shrineId : FINALE.steleId;
      hit.distance = dist;
      return hit;
    },

    /** 讓給比它高階的那幾層時要順手熄掉亮度（同回聲那一條）。 */
    clearNear() {
      nearWhich = '';
    },

    /**
     * 每幀更新。**零每幀配置**：這裡不 new、不 map/filter、不建閉包。
     * @param {number} dt 秒
     * @param {number} t  世界時間（秒）
     * @param {number} px 玩家 x
     * @param {number} pz 玩家 z
     */
    update(dt, t, px, pz) {
      frame += 1;
      // 站起來那一段：從躺著轉到站定（reducedMotion 之下 rising 永遠是 0）
      if (rising > 0) {
        rising = Math.max(0, rising - dt);
        const p = 1 - rising / RAISE_SECONDS;
        // 招牌曲線的手感：後段慢下來（1 − (1−p)^3）
        const eased = 1 - (1 - p) * (1 - p) * (1 - p);
        stele.group.rotation.x = -Math.PI * 0.42 * (1 - eased);
      }

      const sdx = px - shrine.x;
      const sdz = pz - shrine.z;
      const sd2 = sdx * sdx + sdz * sdz;
      const tdx = px - stele.x;
      const tdz = pz - stele.z;
      const td2 = tdx * tdx + tdz * tdz;
      if (sd2 > FAR_SQ && td2 > FAR_SQ) return;
      if (sd2 > NEAR_SQ && td2 > NEAR_SQ && frame % 3 !== 0) return;

      const k = Math.min(1, dt * 3);
      awareShrine += ((openNow && sd2 < AWARE_SQ ? 1 : 0) - awareShrine) * k;
      awareStele += ((raisedNow && td2 < AWARE_SQ ? 1 : 0) - awareStele) * k;

      if (openNow) {
        const breathe = Math.sin(t * 0.9) * 0.12 * kinetic;
        shrine.slitMat.opacity = 0.14 + awareShrine * 0.12;
        shrine.markMat.opacity = 0.12 + awareShrine * 0.12 + (nearWhich === 'shrine' ? 0.08 : 0);
        if (raisedNow) {
          // 清燈：安靜地呼吸（同 §1.6「清燈是安靜的」）
          shrine.coreMat.emissiveIntensity = 1.4 + awareShrine * 0.9 + breathe;
          shrine.glow.material.opacity = 0.22 + awareShrine * 0.16 + (nearWhich === 'shrine' ? 0.1 : 0);
        } else {
          /*
           * 那一團濁氣：會動的只有翻湧與那一點眼光（不移動、不靠近、不跟隨）。
           * `reducedMotion` 之下 kinetic 是 0 —— 翻湧停掉，殼與眼光照樣看得見。
           */
          shrine.shell.rotation.y += dt * 0.35 * kinetic;
          shrine.shell.rotation.x += dt * 0.12 * kinetic;
          shrine.shellMat.opacity = 0.6 + awareShrine * 0.08 + breathe * 0.1;
          shrine.eyeMat.opacity = 0.8 + awareShrine * 0.15 + breathe * 0.2;
        }
      }
      if (raisedNow) {
        const shimmer = Math.sin(t * 0.7 + 1.3) * 0.05 * kinetic;
        stele.inkMat.emissiveIntensity = (carvedNow ? 0.85 : 0.1) + awareStele * 0.35 + shimmer;
        stele.glow.material.opacity = (carvedNow ? 0.24 : 0.1) + awareStele * 0.14;
        stele.markMat.opacity = 0.08 + awareStele * 0.14 + (nearWhich === 'stele' ? 0.08 : 0);
      }
    },
  };

  return api;
}

export default {
  SHRINE_AT,
  STELE_AT,
  STELE_LIFT,
  FINALE_AWARE_RADIUS,
  RAISE_SECONDS,
  createFinaleField,
  disposeFinaleCache,
};

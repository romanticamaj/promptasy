/**
 * Promptasy — 濁靈（Murk）：一段「寫壞的請求」具象化的小生物（v1.2 · P01–P03）
 *
 * 牠是**留在原地的東西**（WORLD.md：世界裡沒有會走動的 NPC）：
 * 一團低矮的暗色濁氣在原地翻湧，中央一顆微弱的眼光。玩家走近（≤ 8 公尺）
 * 牠只會轉頭看你；按 `E` 開既有的主控台，用一段好 prompt 去「安撫」牠。
 *
 * P03 的演出（全部由主控台的 `onRubricHits` 回呼驅動，世界端只負責看得見）：
 *   · `strike(id, murkOutcome)`：每命中一條 rubric → 對應那一層殼**剝落**（0.6s 縮小＋淡出→隱藏）、
 *     眼光閃白一下、噴 8–12 顆加法粒子；`newlyCalmed` → 剩下的殼變**餘殼**（半透明、停轉）、
 *     眼光轉暖白、頭縮成一盞**清燈**（原位、常駐）；過關演出＝一撮光屑從濁靈飛出、
 *     繞玩家一圈（≤ 3 秒）回到清燈位 —— **粒子而已，沒有任何實體跟隨玩家**。
 *   · `restore(id, { hits, calmed })`：開機依存檔還原（直接套終態、不播動畫、不噴粒子）。
 *   · `settled` 的濁靈不再 aware 轉頭（清燈是安靜的），光暈暖色微弱呼吸。
 *   · `reducedMotion`：跳過剝落動畫與光屑，直接套終態（關掉的是「動」，不是「回應」）。
 *
 * 樣板照 `reactive.js`：
 *   · 平方距離、45 公尺外整組跳過、15 公尺外每 3 幀一次（index 錯開）；正在演出的那一隻不跳
 *   · **零每幀配置**：暫存變數提到模組層，tick 裡不 new、不 map/filter、不建閉包；
 *     粒子池是**一組**共用的 `THREE.Points`（≤ 12 顆，buffer 一次配好，只改位置／生命值）；
 *     剝落／閃白／安撫都是 field 內的計時器（秒），不綁幀數
 *   · **0 光源**：眼光與濁氣全部是自發光／半透明材質
 *   · 每隻 ≤ 600 三角形（8 隻 < 5k）
 *
 * 場景圖命名 `murk:<id>`（碰撞稽核與 e2e 靠它）；子件：
 *   · `body`  實心底座 —— `userData.solidRadius = 0.9`、`userData.keepSolid = true`
 *             （靠石座 < 9.9 公尺時，`noCollideZones` 不會把牠當雜物掃掉）
 *   · `head`  會轉頭的那一團（含 `core` 眼光）
 *   · `shells[]` 濁氣殼，數量＝rubric 條數（殼 index ＝ rubric index），**半透明材質**（穿模稽核自動免除）
 *   · `glow`  一片加色混合的光暈 sprite
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';

/** 濁靈的互動半徑：介於石座（6.5）與石碑（4.6）之間（WORLD.md §3.2 的遞減規則）。 */
export const MURK_RADIUS = 5.5;
/**
 * 大濁靈的互動半徑（v1.2 · P17）：6.0。
 *
 * 為什麼比小濁靈大 0.5 而不是照抄 5.5：牠最外層的殼半徑到 3.99 公尺，
 * 5.5 的互動圈幾乎貼著殼面（玩家半徑 0.62 一站進去就已經在殼裡了）。
 * 6.0 讓人站在殼外一步就按得到，而且仍然**小於石座的 6.5** ——
 * 搶 `E` 的順序（石座 > 濁靈 > 守夜人 > 石碑…）一格都沒有動。
 */
export const GREAT_MURK_RADIUS = 6;
/** 這一筆資料是不是大濁靈（`kind: "great"`）。 */
export const isGreatMurk = (entry) => Boolean(entry && entry.kind === 'great');
/** 這一隻濁靈的互動半徑。 */
export const murkRadiusOf = (entry) => (isGreatMurk(entry) ? GREAT_MURK_RADIUS : MURK_RADIUS);
/** 大濁靈底座的碰撞半徑（小濁靈是 0.9）。 */
export const GREAT_BODY_RADIUS = 1.5;
/** 走到這麼近，牠會轉頭看你（idle → aware）。 */
export const MURK_AWARE_RADIUS = 8;
/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
const AWARE_SQ = MURK_AWARE_RADIUS * MURK_AWARE_RADIUS;

/* ------------------------------------------------------------------ *
 * 演出參數（秒；全部是計時器，不是幀數）
 * ------------------------------------------------------------------ */
/** 一層殼剝落的時間（縮小＋淡出）。 */
export const PEEL_SECONDS = 0.6;
/** 眼光閃白的時間（「2 幀」在軟體渲染下可能是 0.4 秒，所以用秒）。 */
const FLASH_SECONDS = 0.12;
/** 安撫：頭縮成清燈、眼光轉暖的過渡。 */
const SETTLE_SECONDS = 1.2;
/** 光屑繞玩家一圈的總長（≤ 3 秒）。 */
export const SCRAP_LOOP_SECONDS = 2.6;
/** 走近同一隻濁靈，murkStir 最少隔多久才再吼一次（每隻各自算）。 */
export const STIR_COOLDOWN = 4;
/** 粒子池大小（≤ 12）。 */
export const PARTICLE_CAPACITY = 12;
/** 光屑用幾顆。 */
const SCRAP_COUNT = 6;
/** 餘殼的透明度倍率。 */
const RESIDUAL_OPACITY = 0.35;
/** 清燈的頭縮到多大。 */
const LAMP_HEAD_SCALE = 0.55;
/** 殼的三種狀態碼。 */
const SHELL_INTACT = 0;
const SHELL_PEELING = 1;
const SHELL_HIDDEN = 2;
const SHELL_NAMES = ['intact', 'peeling', 'hidden'];
/** 粒子模式。 */
const P_DEAD = 0;
const P_BURST = 1;
const P_SCRAP = 2;
/** 清燈的暖白（眼光／光暈的目標色）。 */
const WARM = new THREE.Color('#fff2d6');
/** 暫存（模組層，tick 裡不 new）。 */
const _c = new THREE.Color();

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
/** 材質快取（WORLD.md 檢查表 E16：同色盤的濁靈共用材質；要逐隻動的殼在第一次動它時才 clone 成自己的）。 */
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
 *   小濁靈：body 80 ＋ head 80 ＋ core 20 ＋ shells 3 × 80 ＝ 420；sprite 2 → 每隻 ≤ 600。
 *   大濁靈（P17）：殼有 6–8 層，若照小濁靈用 detail 1（80 面）一隻就 800+ ——
 *   所以大濁靈的殼一律 **detail 0（20 面）**：半徑大、面就大，稜角本來就是這個世界的低多邊形語言。
 *   body 80 ＋ head 80 ＋ core 20 ＋ shells 8 × 20 ＝ 340；sprite 2 → 每隻 ≤ 400。 */
const bodyGeo = () => g('body', () => new THREE.IcosahedronGeometry(0.9, 1));
const headGeo = () => g('head', () => new THREE.IcosahedronGeometry(0.4, 1));
const coreGeo = () => g('core', () => new THREE.IcosahedronGeometry(0.11, 0));
const shellGeo = (r) => g(`shell:${r}`, () => new THREE.IcosahedronGeometry(r, 1));
const greatBodyGeo = () => g('great:body', () => new THREE.IcosahedronGeometry(GREAT_BODY_RADIUS, 1));
const greatHeadGeo = () => g('great:head', () => new THREE.IcosahedronGeometry(0.62, 1));
const greatCoreGeo = () => g('great:core', () => new THREE.IcosahedronGeometry(0.16, 0));
const greatShellGeo = (r) => g(`great:shell:${r}`, () => new THREE.IcosahedronGeometry(r, 0));

/** 平滑步進（0..1）。 */
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * 蓋出一隻濁靈。
 * @param {object} entry   murks.json 的一筆
 * @param {object} kit     區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 */
export function buildMurk(entry, kit, terrainHeight) {
  const [x, z] = entry.at;
  const y = terrainHeight(x, z);
  const great = isGreatMurk(entry);
  /*
   * 大濁靈與小濁靈是**同一種東西的兩個尺寸**（同一份演出、同一份契約），
   * 差別全部收在這一張表裡：底座半徑與壓扁、頭的高度、殼的起點與間距、光暈大小。
   * 底座**壓得比小濁靈更扁**（0.34 而不是 0.42）是為了「站不上去」這件事靠尺寸成立：
   * 半徑 0.8（`STAND_MIN_R`）那一圈上的高低差 0.079 > `STAND_FLAT_EPS` 0.06，
   * 頂面永遠量不成「夠平」——不靠任何旗標宣告（同 P16c 守夜人底座 0.55 的作法）。
   */
  const S = great
    ? { bodyR: GREAT_BODY_RADIUS, bodyFlat: 0.34, bodyY: 0.3, headY: 1.9, coreZ: 0.62, coreY: 0.06, shell0: 1.75, shellStep: 0.32, shellY: 1.55, glow: 5.2 }
    : { bodyR: 0.9, bodyFlat: 0.42, bodyY: 0.3, headY: 1.05, coreZ: 0.42, coreY: 0.04, shell0: 0.95, shellStep: 0.28, shellY: 0.95, glow: 3.2 };
  const grp = new THREE.Group();
  grp.name = `murk:${entry.id}`;
  grp.position.set(x, y, z);

  // 底座：實心、擋人。低矮的一團「被弄髒的地面」。
  const body = new THREE.Mesh(
    great ? greatBodyGeo() : bodyGeo(),
    mat(`body:${kit.dark}`, () => new THREE.MeshStandardMaterial({ color: kit.dark, flatShading: true, roughness: 0.96 }))
  );
  body.name = 'body';
  // 只壓扁 Y：碰撞半徑＝幾何半徑 × 水平縮放，這樣登記表上就是 0.9 / 1.5 整
  body.scale.set(1, S.bodyFlat, 1);
  body.position.y = S.bodyY;
  body.userData.solidRadius = S.bodyR;
  // keepSolid：與石座本體同待遇——淨空區掃雜物時不准把牠掃掉。
  // （半徑 0.9 > CLUTTER_RADIUS，`inNoCollideZone` 本來就不會把牠當雜物；這面旗是「宣告牠是主體」的保險，不是必要條件。）
  body.userData.keepSolid = true;
  grp.add(body);

  // 會轉頭的那一團 ＋ 眼光
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = S.headY;
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
  const headMesh = new THREE.Mesh(great ? greatHeadGeo() : headGeo(), headMat);
  headMesh.scale.set(1.15, 0.9, 1.15);
  head.add(headMesh);
  const coreMat = new THREE.MeshStandardMaterial({
    color: kit.light,
    emissive: new THREE.Color(kit.light),
    emissiveIntensity: 1.4,
    flatShading: true,
    roughness: 0.4,
  });
  const core = new THREE.Mesh(great ? greatCoreGeo() : coreGeo(), coreMat);
  core.name = 'core';
  core.position.set(0, S.coreY, S.coreZ);
  head.add(core);
  grp.add(head);

  // 濁氣殼：一條 rubric 一層，半透明、不擋人（稽核自動免除）
  const shells = [];
  const n = Math.max(1, (entry.rubric || []).length);
  for (let i = 0; i < n; i += 1) {
    const r = S.shell0 + i * S.shellStep;
    /*
     * 每一層的透明度：小濁靈 3 層一路 0.2 → 0.12；大濁靈最多 8 層，
     * 照同一個斜率減到第 8 層會變成負的（材質會整層消失、殼數就對不上），
     * 所以大濁靈用比較緩的斜率並夾在 0.06 以上 —— 最外層仍然看得見。
     */
    const op = great ? Math.max(0.06, 0.18 - i * 0.014) : 0.2 - i * 0.04;
    // 同色盤同一層的殼共用一份材質；只畫正面（半透明的背面 overdraw 沒有必要）
    const shellMat = mat(
      `${great ? 'great:' : ''}shell:${kit.mid}:${i}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: kit.mid,
          transparent: true,
          opacity: op,
          depthWrite: false,
          side: THREE.FrontSide,
        })
    );
    const rr = Math.round(r * 100) / 100;
    const shell = new THREE.Mesh(great ? greatShellGeo(rr) : shellGeo(rr), shellMat);
    shell.name = `shell:${i}`;
    shell.position.y = S.shellY;
    shell.scale.set(1, 0.78, 1);
    shell.rotation.set(i * 0.7, i * 1.3, 0);
    // 這一層原本的透明度（剝落／餘殼都從它算）；`own` ＝ 材質已經 clone 成自己的
    shell.userData.baseOpacity = op;
    shell.userData.own = false;
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
  glow.position.y = S.headY;
  glow.scale.set(S.glow, S.glow, 1);
  glow.userData.noCollide = true;
  grp.add(glow);

  const kitLight = new THREE.Color(kit.light);

  return {
    id: entry.id,
    entry,
    /** 'great' ＝ 大濁靈（P17）；其餘為 undefined（小濁靈）。 */
    kind: entry.kind || null,
    /** 這一隻的互動半徑（大 6.0 / 小 5.5）—— `nearest()` 逐隻用它，不是整組一個數字。 */
    radius: great ? GREAT_MURK_RADIUS : MURK_RADIUS,
    /** 頭的靜止高度（呼吸與清燈的終態都繞著它擺，不是寫死的 1.05）。 */
    headY: S.headY,
    group: grp,
    body,
    head,
    core,
    coreMat,
    shells,
    glow,
    x,
    z,
    y,
    kitLight,
    position: new THREE.Vector3(x, y, z),
    /** 目前狀態：'idle' | 'aware' | 'calming' | 'settled'。 */
    state: 'idle',
    /** 是不是「玩家附近可互動的那一隻」（nearest 更新）。 */
    near: false,
    facing: 0,
    awareAmt: 0,
    /* --- P03：演出狀態（全部是計時器） --- */
    /** 每一層殼的狀態碼（SHELL_INTACT / SHELL_PEELING / SHELL_HIDDEN）。 */
    shellCode: new Uint8Array(n),
    /** 剝落中的殼走到哪（0..1）。 */
    peelT: new Float32Array(n),
    /** 剝落開始時那一層殼的 opacity（從它當時的樣子淡出，不跳變）。 */
    peelFrom: new Float32Array(n),
    /** 剩下的殼是不是餘殼（安撫過）。 */
    residual: false,
    /** 眼光閃白剩幾秒。 */
    flash: 0,
    /** 安撫過（＝存了 grade）。settled 或 calming 都算。 */
    settled: false,
    /** 安撫過渡走到哪（0..1）：頭縮成清燈、眼光轉暖。 */
    settleT: 0,
    /** 光屑演出剩幾秒（> 0 ＝ 還在繞）。 */
    scrapT: 0,
    /** 有沒有演出在跑（剝落／閃白／安撫／光屑）→ 距離分帶不跳過牠。 */
    active: false,
    /** 上一次 murkStir 的時間（秒；-Infinity ＝ 還沒吼過）。 */
    stirAt: -Infinity,
    /** 上一幀是不是 aware（偵測「第一次 aware」）。 */
    wasAware: false,
    setNear(v) {
      this.near = Boolean(v);
    },
    /** 還在的殼（intact ＋ 餘殼；剝落中／隱藏的不算）。 */
    visibleShellCount() {
      let c = 0;
      for (let i = 0; i < this.shellCode.length; i += 1) if (this.shellCode[i] === SHELL_INTACT) c += 1;
      return c;
    },
    /** 這一層殼的狀態：'intact' | 'peeling' | 'hidden' | 'residual'（安撫後還在的殼）。 */
    shellState(i) {
      const code = this.shellCode[i];
      if (code === undefined) return null;
      if (code === SHELL_INTACT && this.residual) return 'residual';
      return SHELL_NAMES[code];
    },
  };
}

/** 讓這一層殼的材質變成自己的（只 clone 一次；共用快取不動）。 */
function ownShellMaterial(shell) {
  if (!shell.userData.own) {
    shell.material = shell.material.clone();
    shell.userData.own = true;
  }
  return shell.material;
}

/**
 * 建立整個濁靈場：蓋出所有濁靈、每幀更新離玩家近的那幾隻。
 *
 * @param {object} opts
 * @param {Array} opts.entries                    murks.json 的 entries
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {()=>boolean} [opts.isBusy]             面板打開時不轉頭（演出照播）
 * @param {boolean} [opts.reducedMotion]
 * @param {(id:string)=>({hits:number[],grade:string|null}|null)} [opts.stateOf] 建構時還原（存檔）
 * @param {(murk:object)=>void} [opts.onStir]     走近 8m 內第一次 aware（每隻 ≥ 4s 一次）
 */
export function createMurkField({
  entries = [],
  kitOf,
  terrainHeight,
  isBusy = null,
  reducedMotion = false,
  stateOf = null,
  onStir = null,
} = {}) {
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

  /* ---------------- 粒子池：一組共用的 Points，buffer 一次配好 ---------------- */
  const N = PARTICLE_CAPACITY;
  const pPos = new Float32Array(N * 3);
  const pVel = new Float32Array(N * 3);
  /** 光屑的起點（清燈位；世界座標）。 */
  const pHome = new Float32Array(N * 3);
  const pLife = new Float32Array(N);
  const pMax = new Float32Array(N);
  const pPhase = new Float32Array(N);
  const pMode = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) pPos[i * 3 + 1] = -999; // 沒在用的粒子藏在地底
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xfff2d6,
    size: 0.22,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.name = 'murk-particles';
  particles.frustumCulled = false; // 粒子會飛離初始包圍球（繞著玩家）
  particles.userData.noCollide = true;
  group.add(particles);
  let particlesSpawned = 0;
  let particlesActive = 0;

  /** 找一顆沒在用的粒子（沒有就回收最老的一顆）。 */
  function claimParticle() {
    let best = -1;
    let oldest = Infinity;
    for (let i = 0; i < N; i += 1) {
      if (pMode[i] === P_DEAD) return i;
      if (pLife[i] < oldest) {
        oldest = pLife[i];
        best = i;
      }
    }
    return best;
  }

  /** 從 (x,y,z) 噴一顆碎光。 */
  function spawnBurst(x, y, z, seed) {
    const i = claimParticle();
    if (i < 0) return;
    if (pMode[i] === P_DEAD) particlesActive += 1;
    const a = seed * 2.399963 + Math.random() * 0.6; // 黃金角錯開 ＋ 一點亂數
    const sp = 1.4 + Math.random() * 1.2;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pVel[i * 3] = Math.cos(a) * sp;
    pVel[i * 3 + 1] = 1.2 + Math.random() * 1.4;
    pVel[i * 3 + 2] = Math.sin(a) * sp;
    pMax[i] = 0.5 + Math.random() * 0.35;
    pLife[i] = pMax[i];
    pMode[i] = P_BURST;
    particlesSpawned += 1;
  }

  /** 從清燈位放一顆光屑（繞玩家一圈再回來）。 */
  function spawnScrap(x, y, z, k) {
    const i = claimParticle();
    if (i < 0) return;
    if (pMode[i] === P_DEAD) particlesActive += 1;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pHome[i * 3] = x;
    pHome[i * 3 + 1] = y;
    pHome[i * 3 + 2] = z;
    pPhase[i] = (k / SCRAP_COUNT) * Math.PI * 2;
    pMax[i] = SCRAP_LOOP_SECONDS;
    pLife[i] = SCRAP_LOOP_SECONDS;
    pMode[i] = P_SCRAP;
    particlesSpawned += 1;
  }

  /** 每幀更新粒子（零配置）。光屑繞的是**玩家現在的位置**，回的是清燈位。 */
  function updateParticles(dt, px, pz) {
    if (particlesActive === 0) return;
    let py = 0;
    let needPy = true;
    for (let i = 0; i < N; i += 1) {
      const mode = pMode[i];
      if (mode === P_DEAD) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pMode[i] = P_DEAD;
        particlesActive -= 1;
        pPos[i * 3 + 1] = -999;
        continue;
      }
      if (mode === P_BURST) {
        pVel[i * 3 + 1] -= 3.2 * dt; // 一點重力
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      } else {
        // 光屑：三段 —— 飛向玩家（0–0.3）→ 繞一圈（0.3–0.75）→ 回清燈位（0.75–1）
        if (needPy) {
          py = terrainHeight(px, pz) + 1.0;
          needPy = false;
        }
        const u = 1 - pLife[i] / pMax[i];
        const hx = pHome[i * 3];
        const hy = pHome[i * 3 + 1];
        const hz = pHome[i * 3 + 2];
        const rad = 1.4;
        let theta;
        let w; // 0 ＝ 在清燈位、1 ＝ 在玩家身邊
        if (u < 0.3) {
          theta = pPhase[i];
          w = smooth(u / 0.3);
        } else if (u < 0.75) {
          theta = pPhase[i] + ((u - 0.3) / 0.45) * Math.PI * 2;
          w = 1;
        } else {
          theta = pPhase[i] + Math.PI * 2;
          w = 1 - smooth((u - 0.75) / 0.25);
        }
        const ox = px + Math.cos(theta) * rad;
        const oy = py + Math.sin(theta * 2) * 0.18;
        const oz = pz + Math.sin(theta) * rad;
        pPos[i * 3] = hx + (ox - hx) * w;
        pPos[i * 3 + 1] = hy + (oy - hy) * w;
        pPos[i * 3 + 2] = hz + (oz - hz) * w;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- 單隻的狀態變化（不播動畫的「套終態」） ---------------- */

  /** 這一層殼直接隱藏（restore／reducedMotion）。 */
  function hideShellNow(m, i) {
    const shell = m.shells[i];
    if (!shell) return;
    m.shellCode[i] = SHELL_HIDDEN;
    m.peelT[i] = 1;
    shell.visible = false;
  }

  /** 剩下的殼變餘殼（半透明、停轉）。 */
  function makeResidual(m) {
    if (m.residual) return;
    m.residual = true;
    for (let i = 0; i < m.shells.length; i += 1) {
      if (m.shellCode[i] !== SHELL_INTACT) continue;
      const shell = m.shells[i];
      const sm = ownShellMaterial(shell);
      sm.opacity = shell.userData.baseOpacity * RESIDUAL_OPACITY;
      shell.scale.set(1, 0.78, 1);
    }
  }

  /** 安撫過渡的一格（settleT 0..1 → 眼光轉暖、頭縮成清燈）。 */
  function applySettle(m, u) {
    m.settleT = u;
    const s = 1 + (LAMP_HEAD_SCALE - 1) * u;
    m.head.scale.set(s, s, s);
    m.coreMat.color.copy(m.kitLight).lerp(WARM, u);
    m.coreMat.emissive.copy(m.kitLight).lerp(WARM, u);
    _c.copy(m.kitLight).lerp(WARM, u);
    m.glow.material.color.copy(_c);
  }

  /** 直接落成清燈（restore／reducedMotion）。 */
  function settleNow(m) {
    m.settled = true;
    m.state = 'settled';
    m.awareAmt = 0;
    m.wasAware = false;
    m.scrapT = 0;
    makeResidual(m);
    applySettle(m, 1);
    m.head.position.y = m.headY;
    m.glow.material.opacity = 0.2;
  }

  const api = {
    group,
    murks,
    /** 共用的粒子池（測試／除錯用）。 */
    particles,
    particleCapacity: N,
    /** 累計噴過幾顆（測試用：strike 有沒有真的噴；restore 不噴）。 */
    get particlesSpawned() {
      return particlesSpawned;
    },
    /** 現在還活著的粒子數。 */
    activeParticles() {
      return particlesActive;
    },
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
    nearest(position, maxDistance = null, forward = null) {
      let best = null;
      let bestDist = Infinity;
      let bestScore = Infinity;
      for (let i = 0; i < murks.length; i += 1) {
        const m = murks[i];
        const dx = m.x - position.x;
        const dz = m.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        /*
         * v1.2 · P17：**互動半徑逐隻算**（大濁靈 6.0、小濁靈 5.5）。
         * 呼叫端明講 maxDistance 時仍以它為準（測試與其他系統會這樣問）；
         * 不給就用這一隻自己的半徑 —— 一個數字套整組會讓大濁靈按不到自己的殼外那一步。
         */
        const lim = Number.isFinite(maxDistance) ? maxDistance : m.radius;
        if (d >= lim) continue;
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
     * 主控台判完這一次、畫結果之前（`onRubricHits`）：對新命中的殼剝落；安撫就落成清燈。
     * 面板開著（isBusy）也照播 —— 玩家正看著結果面，世界在背景。
     * @param {string} id
     * @param {{newlyPassedIndices:number[], hits?:number[], total?:number, calmed?:boolean, newlyCalmed?:boolean}} outcome
     * @returns {boolean} 有沒有這一隻
     */
    strike(id, outcome) {
      const m = byId.get(id);
      if (!m || !outcome || typeof outcome !== 'object') return false;
      const newly = outcome.newlyPassedIndices;
      const list = Array.isArray(newly) ? newly : [];
      let peeled = 0;
      for (let k = 0; k < list.length; k += 1) {
        const i = list[k];
        if (!Number.isInteger(i) || i < 0 || i >= m.shells.length) continue;
        if (m.shellCode[i] !== SHELL_INTACT) continue;
        peeled += 1;
        if (reducedMotion) {
          hideShellNow(m, i);
          continue;
        }
        // 剝落：先把材質變成自己的（共用快取不能動），再開計時器
        const own = ownShellMaterial(m.shells[i]);
        m.shellCode[i] = SHELL_PEELING;
        m.peelT[i] = 0;
        m.peelFrom[i] = own.opacity;
      }
      if (peeled > 0) {
        // 眼光閃白（reduced-motion 也閃：光是回應，不是動）
        m.flash = FLASH_SECONDS;
        m.active = true;
        if (!reducedMotion) {
          // 8–12 顆碎光從殼的位置噴出（一殼 8、兩殼以上 12）
          // 這一次同時安撫的話，留 SCRAP_COUNT 顆給光屑（同一個池，別搶）
          const willCalm = Boolean(outcome.calmed || outcome.newlyCalmed) && !m.settled;
          const count = Math.min(willCalm ? N - SCRAP_COUNT : N, 8 + (peeled - 1) * 4);
          const sy = m.y + m.headY - 0.1;
          for (let k = 0; k < count; k += 1) spawnBurst(m.x, sy, m.z, k);
        }
      }
      /*
       * 安撫（存了 grade）而世界端還沒落成清燈 ＝ **這一次才安撫**（世界的 settled 與存檔同步：
       * 開機 restore、之後每次 strike）→ 餘殼、暖眼光、縮成清燈；光屑繞玩家一圈（粒子而已）。
       * 呼叫端若明講 `newlyCalmed: false`（早就安撫、只是世界端沒同步）→ 直接套終態、不播。
       */
      const calmed = Boolean(outcome.calmed || outcome.newlyCalmed);
      if (calmed && !m.settled) {
        m.settled = true;
        m.awareAmt = 0;
        m.wasAware = false;
        m.active = true;
        makeResidual(m);
        if (reducedMotion || outcome.newlyCalmed === false) {
          settleNow(m);
        } else {
          m.state = 'calming';
          m.settleT = 0;
          m.scrapT = SCRAP_LOOP_SECONDS;
          const sy = m.y + m.headY;
          for (let k = 0; k < SCRAP_COUNT; k += 1) spawnScrap(m.x, sy, m.z, k);
        }
      }
      return true;
    },

    /**
     * 進度重置（不重載頁面）時把世界端拉回「一隻都沒碰過」：殼全部長回來、清燈變回濁靈。
     * 不播動畫、不噴粒子；正在跑的計時器全部清掉。
     */
    reset() {
      for (let i = 0; i < murks.length; i += 1) {
        const m = murks[i];
        for (let sIdx = 0; sIdx < m.shells.length; sIdx += 1) {
          const shell = m.shells[sIdx];
          m.shellCode[sIdx] = SHELL_INTACT;
          m.peelT[sIdx] = 0;
          m.peelFrom[sIdx] = shell.userData.baseOpacity;
          shell.visible = true;
          shell.material.opacity = shell.userData.baseOpacity;
          shell.scale.set(1, 0.78, 1);
        }
        m.residual = false;
        m.settled = false;
        m.settleT = 0;
        m.scrapT = 0;
        m.flash = 0;
        m.active = false;
        m.state = 'idle';
        m.awareAmt = 0;
        m.wasAware = false;
        m.stirAt = -Infinity;
        m.head.scale.set(1, 1, 1);
        applySettle(m, 0);
        m.glow.material.opacity = 0.16;
      }
      // 池裡還在飛的粒子全部收掉
      for (let i = 0; i < N; i += 1) {
        if (pMode[i] !== P_DEAD) {
          pMode[i] = P_DEAD;
          pLife[i] = 0;
        }
      }
      particlesActive = 0;
      return true;
    },

    /**
     * 開機／載入存檔時還原（不播動畫、不噴粒子）：`hits` 的殼直接隱藏；`calmed` 直接 settled。
     * @param {string} id
     * @param {{hits?:number[], calmed?:boolean}} st
     * @returns {boolean} 有沒有這一隻
     */
    restore(id, st) {
      const m = byId.get(id);
      if (!m || !st || typeof st !== 'object') return false;
      const hits = Array.isArray(st.hits) ? st.hits : [];
      for (let k = 0; k < hits.length; k += 1) {
        const i = hits[k];
        if (!Number.isInteger(i) || i < 0 || i >= m.shells.length) continue;
        hideShellNow(m, i);
      }
      if (st.calmed) settleNow(m);
      return true;
    },

    /**
     * 每幀更新（玩家座標）。面板打開時牠不轉頭、但濁氣照樣慢慢翻湧；演出照播。
     * @param {number} dt
     * @param {number} t
     * @param {number} px
     * @param {number} pz
     */
    update(dt, t, px, pz) {
      frame += 1;
      const busy = isBusy ? isBusy() : false;
      const k = Math.min(1, dt * 3);
      // 演出計時器用夾過的 dt：分頁被切走／軟體渲染一幀 0.3s 時，剝落與光屑不會一格就結束
      const adt = Math.min(dt, 0.1);
      for (let i = 0; i < murks.length; i += 1) {
        const m = murks[i];
        const dx = px - m.x;
        const dz = pz - m.z;
        const d2 = dx * dx + dz * dz;
        // 正在演出的那一隻不跳（計時器要走完）；其餘照距離分帶
        if (!m.active) {
          if (d2 > FAR_SQ) continue;
          if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;
        }

        /* --- 演出計時器（剝落／閃白／安撫過渡／光屑） --- */
        let anim = false;
        for (let s = 0; s < m.shells.length; s += 1) {
          if (m.shellCode[s] !== SHELL_PEELING) continue;
          m.peelT[s] += adt / PEEL_SECONDS;
          if (m.peelT[s] >= 1) {
            hideShellNow(m, s);
          } else {
            anim = true;
            const shell = m.shells[s];
            const p = smooth(m.peelT[s]);
            const sc = 1 - p * 0.8;
            shell.scale.set(sc, 0.78 * sc, sc);
            shell.material.opacity = m.peelFrom[s] * (1 - p);
          }
        }
        if (m.flash > 0) {
          m.flash = Math.max(0, m.flash - adt);
          anim = true;
        }
        if (m.settled && m.settleT < 1) {
          applySettle(m, Math.min(1, m.settleT + adt / SETTLE_SECONDS));
          anim = true;
        }
        if (m.scrapT > 0) {
          m.scrapT = Math.max(0, m.scrapT - adt);
          anim = true;
          if (m.scrapT === 0) m.state = 'settled';
        }
        m.active = anim;

        if (m.settled) {
          /* --- 清燈是安靜的：不 aware、不轉頭；餘殼不轉；光暈暖色微弱呼吸 --- */
          if (m.state !== 'calming') m.state = 'settled';
          m.head.position.y = m.headY + Math.sin(t * 0.9 + i) * 0.02 * kinetic;
          m.coreMat.emissiveIntensity = 1.3 + Math.sin(t * 1.1 + i) * 0.12 + (m.flash > 0 ? 2.4 : 0);
          m.glow.material.opacity = 0.18 + Math.sin(t * 0.9 + i) * 0.04 + (m.near ? 0.06 : 0) + (m.flash > 0 ? 0.2 : 0);
          continue;
        }

        // idle → aware：走到 8 公尺內牠會注意到你（面板打開時停手）
        const inRange = d2 < AWARE_SQ;
        const aware = !busy && inRange;
        m.state = aware ? 'aware' : 'idle';
        m.awareAmt += ((aware ? 1 : 0) - m.awareAmt) * k;
        // 第一次走進 8m → 短促雜訊（每隻 ≥ 4 秒一次；面板開著不吼）。
        // 「第一次」看的是**距離**，不是 aware —— 開關面板不算重新走近。
        if (inRange && !m.wasAware && !busy && onStir && t - m.stirAt >= STIR_COOLDOWN) {
          m.stirAt = t;
          onStir(m);
        }
        m.wasAware = inRange;

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

        // 濁氣翻湧：還在的殼慢慢轉、輕微呼吸；眼光隨著注意力變亮
        const breathe = 1 + Math.sin(t * 1.3 + i * 0.9) * 0.04 * kinetic;
        for (let s = 0; s < m.shells.length; s += 1) {
          if (m.shellCode[s] !== SHELL_INTACT) continue;
          const shell = m.shells[s];
          const dir = s % 2 === 0 ? 1 : -1;
          shell.rotation.y = t * (0.18 + s * 0.06) * dir * kinetic;
          shell.rotation.x = s * 0.7 + Math.sin(t * 0.7 + s) * 0.08 * kinetic;
          const sc = breathe + s * 0.01;
          shell.scale.set(sc, 0.78 * sc, sc);
        }
        m.head.position.y = m.headY + Math.sin(t * 1.6 + i) * 0.05 * kinetic;
        m.coreMat.emissiveIntensity = 1.1 + m.awareAmt * 1.2 + Math.sin(t * 5.1 + i) * 0.1 + (m.flash > 0 ? 2.4 : 0);
        m.glow.material.opacity = 0.16 + m.awareAmt * 0.16 + (m.near ? 0.1 : 0) + (m.flash > 0 ? 0.25 : 0);
      }
      updateParticles(dt, px, pz);
    },
  };

  /* 建構時依存檔還原（`stateOf(id)` → `{ hits, grade }`；有 grade ＝ 安撫過）—— 不播動畫 */
  if (typeof stateOf === 'function') {
    for (let i = 0; i < murks.length; i += 1) {
      const st = stateOf(murks[i].id);
      if (st && typeof st === 'object') api.restore(murks[i].id, { hits: st.hits, calmed: Boolean(st.grade) });
    }
  }
  return api;
}

export default { MURK_RADIUS, GREAT_MURK_RADIUS, MURK_AWARE_RADIUS, buildMurk, createMurkField, disposeMurkCache };

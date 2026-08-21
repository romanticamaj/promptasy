/**
 * Promptasy — 石座演出（Rubric FX）：把「命中哪一條檢查」變成石座旁看得見的因果（v1.2 · P09／P10a）
 *
 * 離線評分引擎判完之後，主控台的 `onRubricHits` 回呼會帶著**這一次新命中的 rubric index**
 * 過來（見 `console.js rubricHitsFor`）。`main.js` 把 index 換成**檢查器的名字**，交給這一層
 * 在石座旁邊演一段——寫得越對，石座周圍越亮起對應的東西。
 *
 * **演出由 check 名對應**（`RUBRIC_FX`），一個位元組都不寫進 `challenges.json`：
 *   · `assignsTask`     → 石座腳下的圈**沿順時針掃亮一圈**（像有人把任務講完一輪）
 *   · `specifiesFormat` → 幾片碎石從地面浮起、**排成整齊的一列**，然後落回（格式對上了）
 *   · `hasConstraint`   → 光柱從「無限高」**收成有刻度的一段**（量得出來的長度）
 *   · `hasRole`         → 浮碑短暫**戴上一層面具般的輪廓光**（換了身分再開口）
 *   · `hasFewShot`      → 兩塊小石板在浮碑兩側**成對浮起**（給它看兩組樣子）
 *   · `hasDelimiters`   → 石座周圍**四道短牆升起圍成方框**（把料跟話隔開）
 *   · `asksToVerify`    → 浮碑上方一顆小光點**繞一圈回到原位**（回頭再看一遍）
 *   · `groundsInContext`→ 腳下的圈**往內收成一個實心的小盤**（站在有依據的地方）
 *
 * 硬規則（WORLD.md §2.2／§2.4／§6）：
 *   · **安靜、讀得懂**：演出時結果面還開著，它只能在背景發生，不准搶走寫字的回饋
 *   · **0 新光源**：全部是自發光／加色混合的片與線
 *   · **不用暖金**：暖金只留給成就熱點（過關、精通）——這裡一律用該區色盤（`kitFor()`）
 *   · **0 碰撞體**：所有節點 `userData.noCollide`，不進 `collectSolids()`
 *   · **零每幀配置**：暫存提到模組層，`update()`／`play()` 裡不 new、不 map/filter
 *   · 計時器夾 `min(dt, 0.1)`：軟體渲染一幀 0.3 秒時，2 秒的演出不會一格跑完
 *   · `reducedMotion` → **只做終態的一次亮起、不做位移**（關掉的是「動」，不是「回應」）
 *   · 低畫質（`quality === 'low'`）→ 整層不播
 *
 * 一個世界只有**一組**演出道具（`stage`），播的時候搬到那一座石座腳下 ——
 * 主控台一次只開一關，所以永遠只有一座石座在演；八段可以同時播，同一段不疊加。
 *
 * **借用石座自己的零件**（光柱、腳下的圈）只有一個歸還入口 `releaseBorrowed()` ——
 * 收段、換石座、reset、切低畫質全部走它，借了就一定一寸不差地還回去（P09 審查 ①②④）。
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * check 名 → 演出（純資料；P10a 會把其餘 4 個檢查加進來）
 * ------------------------------------------------------------------ */

/** 支援演出的八個檢查器：`check 名 → 演出 id`（P09 四個 ＋ P10a 四個）。 */
export const RUBRIC_FX = Object.freeze({
  assignsTask: 'ring-sweep',
  specifiesFormat: 'chip-row',
  hasConstraint: 'measured-column',
  hasRole: 'mask-rim',
  hasFewShot: 'pair-slabs',
  hasDelimiters: 'frame-walls',
  asksToVerify: 'return-light',
  groundsInContext: 'ground-disc',
});

/**
 * 鋪到哪幾片土地（P10a：12 區全開）。
 *
 * 整層只有**一組**道具（`stage` 搬到正在演的那一座），所以鋪滿 12 區加 0 個三角形、
 * 0 盞燈、0 個碰撞體 —— 它就是一行常數。
 */
export const FX_REGIONS = Object.freeze([
  'foundations',
  'reasoning',
  'grounding',
  'orchestration',
  'config',
  'forms',
  'toolcraft',
  'wards',
  'refinery',
  'frugality',
  'sight',
  'divergence',
]);

/**
 * 這一條檢查有沒有對應的演出（純函式）。認不得的一律回 null ——
 * 沒有演出的檢查**不演出**（未命中不演、不支援也不演）。
 * @param {string} check
 * @returns {string|null}
 */
export function fxForCheck(check) {
  if (typeof check !== 'string' || !check) return null;
  return Object.prototype.hasOwnProperty.call(RUBRIC_FX, check) ? RUBRIC_FX[check] : null;
}

/** 這一片土地現在演不演（P10a：12 片全開；不是土地的一律 false）。 */
export function fxEnabledIn(regionId) {
  if (typeof regionId !== 'string' || !regionId) return false;
  return FX_REGIONS.indexOf(regionId) >= 0;
}

/* ------------------------------------------------------------------ *
 * 演出參數（秒；全部是計時器，不是幀數）
 * ------------------------------------------------------------------ */

/** 八段演出的順序（陣列 index ＝ 內部的 show id）。 */
const SHOW_CHECKS = Object.freeze([
  'assignsTask',
  'specifiesFormat',
  'hasConstraint',
  'hasRole',
  'hasFewShot',
  'hasDelimiters',
  'asksToVerify',
  'groundsInContext',
]);
const SHOW_SWEEP = 0;
const SHOW_CHIPS = 1;
const SHOW_COLUMN = 2;
const SHOW_RIM = 3;
const SHOW_SLABS = 4;
const SHOW_WALLS = 5;
const SHOW_MOTE = 6;
const SHOW_DISC = 7;
const SHOW_COUNT = 8;
/** 每一段的長度（秒）。全部 ≤ 2.5 —— 玩家還在讀結果面，演出不准拖。 */
const SHOW_SECONDS = Object.freeze([2.0, 2.4, 2.4, 1.8, 2.2, 2.0, 2.4, 2.2]);

/** 粒子池（≤ 24 顆，一次配好）。八段同時播時 8×4 顆會回收最老的，池子大一點就少一點瞬滅。 */
export const PARTICLE_CAPACITY = 24;
/** 一段演出附帶幾顆碎光（安靜就好）。 */
const BURST_PER_SHOW = 4;

/** 碎石幾片、排成一列的間距與高度。 */
const CHIP_COUNT = 5;
const CHIP_GAP = 0.42;
const CHIP_ROW_Y = 1.35;
/** 碎石躺在地上時的散落位置（固定值 —— 演出要可重現，不用亂數）。 */
const CHIP_REST = Object.freeze([
  [-1.65, 0.06, 1.35, 0.9],
  [1.9, 0.06, 0.7, -1.25],
  [-0.85, 0.06, -1.85, 2.1],
  [1.35, 0.06, -1.5, -0.6],
  [-2.0, 0.06, -0.35, 1.6],
]);

/** 光柱收成「一段」之後有多高（公尺）；原本是 34 公尺的無限柱。 */
const COLUMN_SEGMENT = 6.4;
/** 光柱原本的高度（`buildMarker` 的 CylinderGeometry 高度）——只用來算縮放比例。 */
const COLUMN_FULL = 34;
/** 刻度環的高度（等距四道：量得出來的長度）。 */
const TICK_Y = Object.freeze([1.6, 3.2, 4.8, 6.4]);

/** 兩塊小石板：躺在地上的位置 → 浮碑兩側的終位（成對，永遠同高）。 */
const SLAB_X = 1.18;
const SLAB_REST_Y = 0.08;
const SLAB_UP_Y = 2.32;
const SLAB_TILT = 0.22;

/** 四道短牆：離石座中心多遠、多高（升起來的是 scale.y，底一直踩在地上）。 */
const WALL_R = 3.05;
const WALL_H = 1.05;

/** 繞一圈的小光點：繞多大一圈、繞在浮碑的哪個高度。 */
const MOTE_R = 1.42;
const MOTE_Y = 2.5;

/** 腳下的圈往內收到剩幾成（1 ＝ 原樣）。 */
const DISC_SHRINK = 0.42;

/** 沒有色盤時的退路（灰藍；絕不用暖金）。 */
const FALLBACK_ACCENT = 0x8aa0b4;
const FALLBACK_LIGHT = 0xb6c6d4;

/** 平滑步進（0..1）。 */
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** 夾在 0..1。 */
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
/** 演出的淡入淡出包絡（前 `inS` 淡入、後 `outS` 淡出）。 */
function envelope(t, dur, inS, outS) {
  if (t <= 0 || t >= dur) return 0;
  if (t < inS) return smooth(t / inS);
  if (t > dur - outS) return smooth((dur - t) / outS);
  return 1;
}

/* ------------------------------------------------------------------ *
 * 幾何體快取（重複的形狀共用；材質是逐一個場自己的，因為要動 opacity）
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

/*
 * 這裡**刻意沒有** `disposeCache()`：`GEO` 是模組層、被每一個 `createRubricFx()`
 * 共用（測試一次會蓋好幾個世界），任何一個實例把它 dispose 掉，其他實例的碎石與刻度
 * 就會從畫面上消失。而且掃亮圈的幾何體是逐實例的（`drawRange` 是可變狀態）、
 * 材質也沒有納管——一支「只清一半」的函式比沒有更危險。世界目前沒有重建路徑。
 */

/*
 * 三角形預算：掃亮圈 128 ＋ 碎石 5×12 ＝ 60 ＋ 刻度 4×40 ＝ 160 ＋ 面具輪廓 8 ＝ 356（P09）
 * ＋ 石板 2×12 ＝ 24 ＋ 短牆 4×12 ＝ 48 ＋ 小光點 8 ＋ 實心小盤 36 ＝ 116（P10a）＝ 472。
 */
const chipGeo = () => g('chip', () => new THREE.BoxGeometry(0.26, 0.05, 0.17));
const tickGeo = () => g('tick', () => new THREE.RingGeometry(0.42, 0.62, 20, 1));
const rimGeo = () => g('rim', () => new THREE.OctahedronGeometry(0.95, 0));
const slabGeo = () => g('slab', () => new THREE.BoxGeometry(0.52, 0.07, 0.34));
const wallGeo = () => g('wall', () => new THREE.BoxGeometry(2.4, WALL_H, 0.14));
const moteGeo = () => g('mote', () => new THREE.OctahedronGeometry(0.15, 0));
const discGeo = () => g('disc', () => new THREE.CircleGeometry(1.06, 36));

/**
 * 建立石座演出層。
 *
 * @param {object} opts
 * @param {(regionId:string)=>{accent:number,light:number,mid:number,dark:number}} [opts.kitOf] 區域色盤
 * @param {boolean} [opts.reducedMotion]  只做終態的一次亮起、不做位移
 * @param {()=>string} [opts.qualityOf]   目前畫質（'low' → 整層不播）
 * @returns {{group:THREE.Group, play:Function, update:Function, reset:Function, state:Function}}
 */
export function createRubricFx({ kitOf = null, reducedMotion = false, qualityOf = null } = {}) {
  const group = new THREE.Group();
  group.name = 'rubric-fx';
  group.userData.noCollide = true;

  /** 演出道具：一整組，播的時候搬到那一座石座腳下。 */
  const stage = new THREE.Group();
  stage.name = 'rubric-fx:stage';
  stage.userData.noCollide = true;
  stage.visible = false;
  group.add(stage);

  /* --- ① 腳下的圈：沿順時針掃亮一圈 ---
   * 掃亮＝`setDrawRange` 逐段揭露（零配置，不重建幾何體）。
   * `drawRange` 是**幾何體自己的狀態**，所以這一份不進模組層的共用快取
   * —— 兩個世界（測試常常同時蓋好幾個）共用同一份會互相蓋掉揭露進度。 */
  const sweepGeo = new THREE.RingGeometry(2.62, 3.02, 64, 1);
  const sweepMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_ACCENT,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sweep = new THREE.Mesh(sweepGeo, sweepMat);
  sweep.name = 'ring-sweep';
  sweep.rotation.x = -Math.PI / 2;
  // 鏡射一次（y → −y）讓 drawRange 的揭露方向從「上面看是逆時針」翻成**順時針**。
  sweep.scale.y = -1;
  sweep.position.y = 0.07;
  sweep.visible = false;
  sweep.userData.noCollide = true;
  const SWEEP_INDEX_COUNT = sweepGeo.index ? sweepGeo.index.count : 0;
  stage.add(sweep);

  /* --- ② 碎石排成一列 --- */
  const chipMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_LIGHT,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const chips = [];
  for (let i = 0; i < CHIP_COUNT; i += 1) {
    const chip = new THREE.Mesh(chipGeo(), chipMat);
    chip.name = `chip:${i}`;
    chip.visible = false;
    chip.userData.noCollide = true;
    stage.add(chip);
    chips.push(chip);
  }

  /* --- ③ 光柱收成有刻度的一段 --- */
  const tickMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_ACCENT,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ticks = [];
  for (let i = 0; i < TICK_Y.length; i += 1) {
    const tick = new THREE.Mesh(tickGeo(), tickMat);
    tick.name = `tick:${i}`;
    tick.rotation.x = -Math.PI / 2;
    tick.position.y = TICK_Y[i];
    tick.visible = false;
    tick.userData.noCollide = true;
    stage.add(tick);
    ticks.push(tick);
  }

  /* --- ④ 浮碑的面具輪廓光 --- */
  const rimMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_LIGHT,
    transparent: true,
    opacity: 0,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rim = new THREE.Mesh(rimGeo(), rimMat);
  rim.name = 'mask-rim';
  rim.position.y = 2.5;
  rim.visible = false;
  rim.userData.noCollide = true;
  stage.add(rim);

  /* --- ⑤ 兩塊小石板：在浮碑兩側成對浮起（給它看兩組樣子） --- */
  const slabMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_LIGHT,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const slabs = [];
  for (let i = 0; i < 2; i += 1) {
    const slab = new THREE.Mesh(slabGeo(), slabMat);
    slab.name = `slab:${i}`;
    // 一左一右，各自朝內側斜一點點（像兩張攤開給人看的樣張）
    slab.rotation.z = i === 0 ? SLAB_TILT : -SLAB_TILT;
    slab.visible = false;
    slab.userData.noCollide = true;
    stage.add(slab);
    slabs.push(slab);
  }

  /* --- ⑥ 四道短牆：升起來圍成一個方框（把料跟話隔開） --- */
  const wallMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_ACCENT,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const walls = [];
  for (let i = 0; i < 4; i += 1) {
    const wall = new THREE.Mesh(wallGeo(), wallMat);
    wall.name = `wall:${i}`;
    // 0/1 前後、2/3 左右 —— 四道對稱，圍出來的是方框
    if (i < 2) wall.position.set(0, 0, i === 0 ? WALL_R : -WALL_R);
    else {
      wall.position.set(i === 2 ? WALL_R : -WALL_R, 0, 0);
      wall.rotation.y = Math.PI / 2;
    }
    wall.visible = false;
    wall.userData.noCollide = true;
    stage.add(wall);
    walls.push(wall);
  }

  /* --- ⑦ 繞一圈回到原位的小光點（回頭再看一遍） --- */
  const moteMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_LIGHT,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mote = new THREE.Mesh(moteGeo(), moteMat);
  mote.name = 'return-light';
  mote.position.set(MOTE_R, MOTE_Y, 0);
  mote.visible = false;
  mote.userData.noCollide = true;
  stage.add(mote);

  /* --- ⑧ 腳下的圈收成一個實心的小盤（站在有依據的地方） --- */
  const discMat = new THREE.MeshBasicMaterial({
    color: FALLBACK_ACCENT,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disc = new THREE.Mesh(discGeo(), discMat);
  disc.name = 'ground-disc';
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  disc.visible = false;
  disc.userData.noCollide = true;
  stage.add(disc);

  /* --- 粒子池：一組共用的 Points，buffer 一次配好（零每幀配置） --- */
  const N = PARTICLE_CAPACITY;
  const pPos = new Float32Array(N * 3);
  const pVel = new Float32Array(N * 3);
  const pLife = new Float32Array(N);
  const pMax = new Float32Array(N);
  const pOn = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) pPos[i * 3 + 1] = -999; // 沒在用的粒子藏在地底
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: FALLBACK_LIGHT,
    size: 0.15,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.name = 'rubric-fx-particles';
  particles.frustumCulled = false;
  particles.userData.noCollide = true;
  stage.add(particles);
  let particlesSpawned = 0;
  let particlesActive = 0;

  /* --- 演出狀態（全部是預先配好的定長陣列） --- */
  /** 這一段在不在播。 */
  const showOn = new Uint8Array(SHOW_COUNT);
  /** 這一段走到第幾秒。 */
  const showT = new Float32Array(SHOW_COUNT);
  /** 現在演的是哪一座石座（同一時間只會有一座——主控台一次只開一關）。 */
  let current = null;
  /** 光柱借用前的原樣（演完要一寸不差地還回去）。 */
  let beaconScale0 = 1;
  let beaconY0 = 0;
  let beaconBorrowed = false;
  /** 腳下那個圈借用前的原樣（同上；它的縮放沒有別人在動，透明度才是石座自己的）。 */
  let ringScaleX0 = 1;
  let ringScaleY0 = 1;
  let ringBorrowed = false;
  let activeShows = 0;

  /** 找一顆沒在用的粒子（沒有就回收最老的一顆）。 */
  function claimParticle() {
    let best = -1;
    let oldest = Infinity;
    for (let i = 0; i < N; i += 1) {
      if (pOn[i] === 0) return i;
      if (pLife[i] < oldest) {
        oldest = pLife[i];
        best = i;
      }
    }
    return best;
  }

  /** 從（石座本地座標）(x,y,z) 噴一顆碎光。 */
  function spawnBurst(x, y, z, seed) {
    const i = claimParticle();
    if (i < 0) return;
    if (pOn[i] === 0) particlesActive += 1;
    const a = seed * 2.399963; // 黃金角錯開
    const sp = 0.5 + (seed % 3) * 0.18;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pVel[i * 3] = Math.cos(a) * sp;
    pVel[i * 3 + 1] = 0.7 + (seed % 2) * 0.3;
    pVel[i * 3 + 2] = Math.sin(a) * sp;
    pMax[i] = 0.9;
    pLife[i] = 0.9;
    pOn[i] = 1;
    particlesSpawned += 1;
  }

  /** 每幀更新粒子（零配置）。碎光是「往上飄一下就散」，不繞人、不跟人。 */
  function updateParticles(adt) {
    if (particlesActive === 0) return;
    for (let i = 0; i < N; i += 1) {
      if (pOn[i] === 0) continue;
      pLife[i] -= adt;
      if (pLife[i] <= 0) {
        pOn[i] = 0;
        particlesActive -= 1;
        pPos[i * 3 + 1] = -999;
        continue;
      }
      pVel[i * 3 + 1] -= 0.7 * adt;
      pPos[i * 3] += pVel[i * 3] * adt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * adt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * adt;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  /* 借用石座零件的旗標（單一歸還入口 `releaseBorrowed()` 用）。 */
  const BORROW_BEACON = 1;
  const BORROW_RING = 2;
  const BORROW_ALL = 3;

  /**
   * 把借來的石座零件還回去（一寸不差）。
   *
   * **唯一的歸還入口**：收段（`endShow`）、換石座、`reset()`、演到一半切低畫質
   * 全部走這裡，所以不會有「借了沒還」或「還了兩次」的路徑（P09 審查 ①②④）。
   * @param {number} what BORROW_BEACON / BORROW_RING / BORROW_ALL
   */
  function releaseBorrowed(what) {
    if (what & BORROW_BEACON && beaconBorrowed) {
      if (current && current.beacon) {
        current.beacon.scale.y = beaconScale0;
        current.beacon.position.y = beaconY0;
      }
      beaconBorrowed = false;
    }
    if (what & BORROW_RING && ringBorrowed) {
      if (current && current.ring) {
        current.ring.scale.x = ringScaleX0;
        current.ring.scale.y = ringScaleY0;
      }
      ringBorrowed = false;
    }
  }

  /** 收掉某一段（把它的道具藏起來）。 */
  function endShow(k) {
    if (showOn[k] === 0) return;
    showOn[k] = 0;
    showT[k] = 0;
    activeShows -= 1;
    if (k === SHOW_SWEEP) {
      sweep.visible = false;
      sweepMat.opacity = 0;
      sweepGeo.setDrawRange(0, 0);
    } else if (k === SHOW_CHIPS) {
      chipMat.opacity = 0;
      for (let i = 0; i < chips.length; i += 1) chips[i].visible = false;
    } else if (k === SHOW_COLUMN) {
      tickMat.opacity = 0;
      for (let i = 0; i < ticks.length; i += 1) ticks[i].visible = false;
      releaseBorrowed(BORROW_BEACON);
    } else if (k === SHOW_RIM) {
      rim.visible = false;
      rimMat.opacity = 0;
    } else if (k === SHOW_SLABS) {
      slabMat.opacity = 0;
      for (let i = 0; i < slabs.length; i += 1) slabs[i].visible = false;
    } else if (k === SHOW_WALLS) {
      wallMat.opacity = 0;
      for (let i = 0; i < walls.length; i += 1) walls[i].visible = false;
    } else if (k === SHOW_MOTE) {
      mote.visible = false;
      moteMat.opacity = 0;
    } else {
      disc.visible = false;
      discMat.opacity = 0;
      releaseBorrowed(BORROW_RING);
    }
  }

  /**
   * 池子裡還在飛的碎光全部收掉。
   * 粒子是 `stage` 的區域座標 —— 換石座時 stage 會整組搬過去，
   * 沒收乾淨的話上一座的碎光會**瞬移**到新的那一座旁邊繼續飛。
   */
  function killParticles() {
    for (let i = 0; i < N; i += 1) {
      if (pOn[i] === 0) continue;
      pOn[i] = 0;
      pLife[i] = 0;
      pPos[i * 3 + 1] = -999;
    }
    particlesActive = 0;
    pGeo.attributes.position.needsUpdate = true;
  }

  /** 全部收掉（換石座／reset／低畫質）。 */
  function endAll() {
    for (let k = 0; k < SHOW_COUNT; k += 1) endShow(k);
    // 保險：即使某一段從沒開演過，借出去的東西也一定還回去（單一歸還入口）
    releaseBorrowed(BORROW_ALL);
    killParticles();
    stage.visible = false;
  }

  /** 這一段的起手式（把道具擺到起點）。 */
  function beginShow(k) {
    showOn[k] = 1;
    showT[k] = 0;
    activeShows += 1;
    stage.visible = true;
    if (k === SHOW_SWEEP) {
      sweep.visible = true;
      sweepMat.opacity = 0;
      sweepGeo.setDrawRange(0, reducedMotion ? SWEEP_INDEX_COUNT : 0);
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(2.8, 0.2, 0, i);
    } else if (k === SHOW_CHIPS) {
      chipMat.opacity = 0;
      for (let i = 0; i < chips.length; i += 1) {
        const chip = chips[i];
        chip.visible = true;
        if (reducedMotion) {
          // 終態：已經排好的那一列（不做位移）
          chip.position.set((i - (CHIP_COUNT - 1) / 2) * CHIP_GAP, CHIP_ROW_Y, 0);
          chip.rotation.set(0, 0, 0);
        } else {
          chip.position.set(CHIP_REST[i][0], CHIP_REST[i][1], CHIP_REST[i][2]);
          chip.rotation.set(0, CHIP_REST[i][3], 0);
        }
      }
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(CHIP_REST[i % CHIP_COUNT][0], 0.1, CHIP_REST[i % CHIP_COUNT][2], i + 1);
    } else if (k === SHOW_COLUMN) {
      tickMat.opacity = 0;
      for (let i = 0; i < ticks.length; i += 1) ticks[i].visible = true;
      // 借光柱：把它從「無限高」收成一段（reducedMotion 不借 —— 那是位移，不是亮起）
      if (!reducedMotion && current && current.beacon) {
        beaconScale0 = current.beacon.scale.y;
        beaconY0 = current.beacon.position.y;
        beaconBorrowed = true;
      }
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(0.35, TICK_Y[i % TICK_Y.length], 0.35, i + 2);
    } else if (k === SHOW_RIM) {
      rim.visible = true;
      rimMat.opacity = 0;
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(0, 2.5, 0, i + 3);
    } else if (k === SHOW_SLABS) {
      slabMat.opacity = 0;
      for (let i = 0; i < slabs.length; i += 1) {
        const slab = slabs[i];
        slab.visible = true;
        const sx = i === 0 ? -SLAB_X : SLAB_X;
        // reducedMotion 終態：已經浮到浮碑兩側（不做位移）
        slab.position.set(sx, reducedMotion ? SLAB_UP_Y : SLAB_REST_Y, 0);
      }
      if (!reducedMotion) {
        for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(i % 2 === 0 ? -SLAB_X : SLAB_X, 0.12, 0, i + 4);
      }
    } else if (k === SHOW_WALLS) {
      wallMat.opacity = 0;
      for (let i = 0; i < walls.length; i += 1) {
        const wall = walls[i];
        wall.visible = true;
        // 升起來的是 scale.y，位置跟著半高走 —— 牆底永遠踩在地上
        const sy = reducedMotion ? 1 : 0.02;
        wall.scale.y = sy;
        wall.position.y = WALL_H * 0.5 * sy;
      }
      if (!reducedMotion) {
        for (let i = 0; i < BURST_PER_SHOW; i += 1) {
          spawnBurst(i < 2 ? 0 : i === 2 ? WALL_R : -WALL_R, 0.1, i < 2 ? (i === 0 ? WALL_R : -WALL_R) : 0, i + 5);
        }
      }
    } else if (k === SHOW_MOTE) {
      mote.visible = true;
      moteMat.opacity = 0;
      // 起點＝終點：繞一圈回到原位（reducedMotion 就停在這裡，只亮起來）
      mote.position.set(MOTE_R, MOTE_Y, 0);
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(MOTE_R, MOTE_Y, 0, i + 6);
    } else {
      disc.visible = true;
      discMat.opacity = 0;
      // 借腳下那個圈：把它往內收（reducedMotion 不借 —— 那是位移，不是亮起）
      if (!reducedMotion && current && current.ring) {
        ringScaleX0 = current.ring.scale.x;
        ringScaleY0 = current.ring.scale.y;
        ringBorrowed = true;
      }
      if (!reducedMotion) for (let i = 0; i < BURST_PER_SHOW; i += 1) spawnBurst(0, 0.12, 0, i + 7);
    }
  }

  /** 把該區色盤套到四段演出上（play 時做一次；不在每幀裡）。 */
  function applyKit(regionId) {
    const kit = typeof kitOf === 'function' ? kitOf(regionId) : null;
    const accent = kit && Number.isFinite(kit.accent) ? kit.accent : FALLBACK_ACCENT;
    const light = kit && Number.isFinite(kit.light) ? kit.light : FALLBACK_LIGHT;
    sweepMat.color.setHex(accent);
    tickMat.color.setHex(accent);
    wallMat.color.setHex(accent);
    discMat.color.setHex(accent);
    chipMat.color.setHex(light);
    rimMat.color.setHex(light);
    slabMat.color.setHex(light);
    moteMat.color.setHex(light);
    pMat.color.setHex(light);
  }

  const api = {
    group,
    /** 共用的粒子池（測試／除錯用）。 */
    particles,
    particleCapacity: N,
    /** 累計噴過幾顆（測試用）。 */
    get particlesSpawned() {
      return particlesSpawned;
    },
    /** 現在還活著的粒子數。 */
    activeParticles() {
      return particlesActive;
    },
    /** 現在演的是哪一座石座（沒有就 null）。 */
    get markerId() {
      return current ? current.id : null;
    },
    /** 這一層現在演不演（低畫質整層關掉）。 */
    get enabled() {
      return (typeof qualityOf === 'function' ? qualityOf() : 'high') !== 'low';
    },

    /**
     * 演一段：把新命中的檢查變成石座旁看得見的因果。
     *
     * 同一段正在播 → **不疊加、不重來**（同一次 session 送同一句不會重播，
     * 因為 `newlyPassedIndices` 本來就是差量；這裡是第二道保險）。
     * 換一座石座 → 前一座的演出先收乾淨（含把借走的光柱還回去）。
     *
     * @param {object} marker  `world.markers` 的一座（要有 position／beacon／shard）
     * @param {string[]} checks  這一次新命中的檢查名
     * @returns {number} 這一次真的開演了幾段
     */
    play(marker, checks) {
      if (!marker || !Array.isArray(checks) || checks.length === 0) return 0;
      if (!this.enabled) return 0;
      /*
       * **先確認這一次真的有東西可以演**，才動前一座。
       * 不然 `play(別座, ['沒支援的檢查'])` 會回 0、卻已經把正在演的那一段拆掉、
       * 把借走的光柱還回去、把舞台搬走 —— 玩家看到的是演到一半被抽掉。
       */
      let playable = 0;
      for (let i = 0; i < checks.length; i += 1) if (fxForCheck(checks[i])) playable += 1;
      if (playable === 0) return 0;
      if (current !== marker) {
        endAll();
        current = marker;
        if (marker.position) stage.position.copy(marker.position);
        applyKit(marker.region);
      }
      let started = 0;
      for (let i = 0; i < checks.length; i += 1) {
        const id = fxForCheck(checks[i]);
        if (!id) continue;
        const k = SHOW_CHECKS.indexOf(checks[i]);
        if (k < 0 || showOn[k] === 1) continue;
        beginShow(k);
        started += 1;
      }
      return started;
    },

    /**
     * 每幀更新。計時器夾 `min(dt, 0.1)` —— 軟體渲染一幀 0.3 秒時演出不會一格跑完。
     * 沒有演出、也沒有活粒子時整組零工作。
     * @param {number} dt
     * @param {number} t
     */
    update(dt, t) {
      /*
       * 演到一半被切到低畫質（設定頁）→ 立刻收乾淨並把借走的光柱還回去。
       * 契約是「低畫質整層不播」，不能只在 `play()` 那一刻檢查。
       */
      if (!this.enabled) {
        if (activeShows > 0 || particlesActive > 0) endAll();
        return;
      }
      if (activeShows === 0 && particlesActive === 0) return;
      const adt = dt < 0.1 ? dt : 0.1;

      /* --- ① 腳下的圈沿順時針掃亮一圈 --- */
      if (showOn[SHOW_SWEEP] === 1) {
        const dur = SHOW_SECONDS[SHOW_SWEEP];
        showT[SHOW_SWEEP] += adt;
        const st = showT[SHOW_SWEEP];
        if (st >= dur) endShow(SHOW_SWEEP);
        else {
          const u = reducedMotion ? 1 : smooth(clamp01(st / (dur * 0.62)));
          const shown = Math.round((SWEEP_INDEX_COUNT / 6) * u) * 6;
          sweepGeo.setDrawRange(0, shown);
          sweepMat.opacity = 0.42 * envelope(st, dur, 0.18, 0.45);
        }
      }

      /* --- ② 碎石浮起、排成整齊的一列，再落回 --- */
      if (showOn[SHOW_CHIPS] === 1) {
        const dur = SHOW_SECONDS[SHOW_CHIPS];
        showT[SHOW_CHIPS] += adt;
        const st = showT[SHOW_CHIPS];
        if (st >= dur) endShow(SHOW_CHIPS);
        else {
          chipMat.opacity = 0.72 * envelope(st, dur, 0.2, 0.4);
          if (!reducedMotion) {
            const u = st / dur;
            // 0–0.42 浮起排隊；0.42–0.72 停在那一列；0.72–1 落回
            const w = u < 0.42 ? smooth(u / 0.42) : u < 0.72 ? 1 : 1 - smooth((u - 0.72) / 0.28);
            for (let i = 0; i < chips.length; i += 1) {
              const chip = chips[i];
              const rx = CHIP_REST[i][0];
              const rz = CHIP_REST[i][2];
              const ry = CHIP_REST[i][1];
              const tx = (i - (CHIP_COUNT - 1) / 2) * CHIP_GAP;
              chip.position.x = rx + (tx - rx) * w;
              chip.position.y = ry + (CHIP_ROW_Y - ry) * w;
              chip.position.z = rz + (0 - rz) * w;
              chip.rotation.y = CHIP_REST[i][3] * (1 - w);
            }
          }
        }
      }

      /* --- ③ 光柱從無限高收成有刻度的一段 --- */
      if (showOn[SHOW_COLUMN] === 1) {
        const dur = SHOW_SECONDS[SHOW_COLUMN];
        showT[SHOW_COLUMN] += adt;
        const st = showT[SHOW_COLUMN];
        if (st >= dur) endShow(SHOW_COLUMN);
        else {
          const u = st / dur;
          // 0–0.32 收短；0.32–0.74 停在那一段；0.74–0.98 放回去
          const w = u < 0.32 ? smooth(u / 0.32) : u < 0.74 ? 1 : 1 - smooth(clamp01((u - 0.74) / 0.24));
          if (beaconBorrowed && current && current.beacon) {
            const s = 1 + (COLUMN_SEGMENT / COLUMN_FULL - 1) * w;
            current.beacon.scale.y = beaconScale0 * s;
            current.beacon.position.y = beaconY0 * s;
          }
          /*
           * 刻度一道一道張開（分幕揭示：由低到高，量得出來的長度）；共用一份材質、整組同進同出。
           * `reducedMotion` 下**不做這一段位移**——關掉的是「動」不是「回應」（WORLD §2.4）：
           * 刻度直接就位、只靠透明度亮起來（光柱本來就沒被借走，所以也不會有「刻度浮在沒收短的柱子旁」）。
           */
          for (let i = 0; i < ticks.length; i += 1) {
            const stagger = reducedMotion ? 1 : clamp01((w - i * 0.12) / 0.3);
            ticks[i].scale.setScalar(0.55 + 0.45 * stagger);
          }
          tickMat.opacity = 0.5 * envelope(st, dur, 0.24, 0.42);
        }
      }

      /* --- ④ 浮碑戴上一層面具般的輪廓光 --- */
      if (showOn[SHOW_RIM] === 1) {
        const dur = SHOW_SECONDS[SHOW_RIM];
        showT[SHOW_RIM] += adt;
        const st = showT[SHOW_RIM];
        if (st >= dur) endShow(SHOW_RIM);
        else {
          rimMat.opacity = 0.38 * envelope(st, dur, 0.3, 0.55);
          // 輪廓光貼著浮碑（它自己會轉、會上下浮）—— 只複製，不配置
          const shard = current ? current.shard : null;
          if (shard) {
            rim.position.y = shard.position.y;
            rim.rotation.x = shard.rotation.x;
            rim.rotation.y = shard.rotation.y;
            rim.rotation.z = shard.rotation.z;
          }
        }
      }

      /* --- ⑤ 兩塊小石板成對浮起，再落回 --- */
      if (showOn[SHOW_SLABS] === 1) {
        const dur = SHOW_SECONDS[SHOW_SLABS];
        showT[SHOW_SLABS] += adt;
        const st = showT[SHOW_SLABS];
        if (st >= dur) endShow(SHOW_SLABS);
        else {
          slabMat.opacity = 0.7 * envelope(st, dur, 0.22, 0.42);
          if (!reducedMotion) {
            const u = st / dur;
            // 0–0.4 浮起；0.4–0.74 停在浮碑兩側；0.74–1 落回
            const w = u < 0.4 ? smooth(u / 0.4) : u < 0.74 ? 1 : 1 - smooth((u - 0.74) / 0.26);
            const y = SLAB_REST_Y + (SLAB_UP_Y - SLAB_REST_Y) * w;
            // 兩塊**成對**：同一個 w、同一個高度，一起上一起下
            for (let i = 0; i < slabs.length; i += 1) slabs[i].position.y = y;
          }
        }
      }

      /* --- ⑥ 四道短牆升起圍成方框 --- */
      if (showOn[SHOW_WALLS] === 1) {
        const dur = SHOW_SECONDS[SHOW_WALLS];
        showT[SHOW_WALLS] += adt;
        const st = showT[SHOW_WALLS];
        if (st >= dur) endShow(SHOW_WALLS);
        else {
          wallMat.opacity = 0.34 * envelope(st, dur, 0.2, 0.44);
          if (!reducedMotion) {
            const u = st / dur;
            // 0–0.36 升起；之後就站在那裡（收尾靠透明度淡出，不用再降下去）
            const w = 0.02 + 0.98 * smooth(clamp01(u / 0.36));
            for (let i = 0; i < walls.length; i += 1) {
              walls[i].scale.y = w;
              walls[i].position.y = WALL_H * 0.5 * w;
            }
          }
        }
      }

      /* --- ⑦ 小光點繞浮碑一圈、回到原位 --- */
      if (showOn[SHOW_MOTE] === 1) {
        const dur = SHOW_SECONDS[SHOW_MOTE];
        showT[SHOW_MOTE] += adt;
        const st = showT[SHOW_MOTE];
        if (st >= dur) endShow(SHOW_MOTE);
        else {
          moteMat.opacity = 0.62 * envelope(st, dur, 0.2, 0.4);
          const shardM = current ? current.shard : null;
          const baseY = shardM ? shardM.position.y : MOTE_Y;
          if (reducedMotion) mote.position.y = baseY;
          else {
            // 0–0.86 繞完一整圈（回到出發的角度），之後停在原位
            const a = smooth(clamp01(st / (dur * 0.86))) * Math.PI * 2;
            mote.position.x = Math.cos(a) * MOTE_R;
            mote.position.z = Math.sin(a) * MOTE_R;
            mote.position.y = baseY;
          }
        }
      }

      /* --- ⑧ 腳下的圈往內收成一個實心的小盤 --- */
      if (showOn[SHOW_DISC] === 1) {
        const dur = SHOW_SECONDS[SHOW_DISC];
        showT[SHOW_DISC] += adt;
        const st = showT[SHOW_DISC];
        if (st >= dur) endShow(SHOW_DISC);
        else {
          const u = st / dur;
          // 0–0.34 往內收；0.34–0.76 停成一個小盤；0.76–1 放回去
          const w = u < 0.34 ? smooth(u / 0.34) : u < 0.76 ? 1 : 1 - smooth(clamp01((u - 0.76) / 0.24));
          if (ringBorrowed && current && current.ring) {
            const s = 1 + (DISC_SHRINK - 1) * w;
            current.ring.scale.x = ringScaleX0 * s;
            current.ring.scale.y = ringScaleY0 * s;
          }
          discMat.opacity = 0.34 * envelope(st, dur, 0.26, 0.44) * (reducedMotion ? 1 : w);
        }
      }

      updateParticles(adt);
      if (activeShows === 0 && particlesActive === 0) stage.visible = false;
    },

    /**
     * 進度重置（不重載頁面）／換世界時把演出層拉回「什麼都沒演過」（WORLD.md §8 G24b）。
     * 借走的光柱還回去、粒子池清空、計時器歸零。
     */
    reset() {
      endAll();
      current = null;
      return true;
    },

    /**
     * e2e／除錯把手：現在有哪幾段在演。
     * @returns {{playing:Array<{markerId:string|null, check:string, fx:string, t:number}>, particlesActive:number, enabled:boolean}}
     */
    state() {
      const playing = [];
      for (let k = 0; k < SHOW_COUNT; k += 1) {
        if (showOn[k] !== 1) continue;
        playing.push({
          markerId: current ? current.id : null,
          check: SHOW_CHECKS[k],
          fx: RUBRIC_FX[SHOW_CHECKS[k]],
          t: showT[k],
        });
      }
      return { playing, particlesActive, enabled: this.enabled };
    },
  };

  return api;
}

export default { RUBRIC_FX, FX_REGIONS, fxForCheck, fxEnabledIn, createRubricFx };

/**
 * Promptasy — 第三人稱角色控制器 ＋ 跟隨鏡頭
 *
 * 角色是有骨節的人形旅人（見 `character.js`）——全部由 three.js 基本幾何體組成，成本近乎零。
 * 手感（M5）全部靠這一支檔案：
 *   · 移動有加速 / 減速，不是瞬間開關
 *   · 鏡頭有延遲與前瞻（lookahead）—— 跑起來會「被拉著走」
 *   · 鏡頭用 raycast 避開書架 / 齒輪等擋住視線的道具（Phase 3 的已知問題）
 *   · 奔跑時 FOV 微微拉開，速度感不用加特效就有
 *   · 走路的擺動 / 傾斜、站著時的呼吸起伏
 */
import * as THREE from 'three';
import { terrainHeight as defaultTerrain } from '../world/world.js';
import { createCharacter } from './character.js';
import { createJumper, isAloft, jumpSpeedFor, jumpSpeedForBridge, stepJumper } from './jump.js';

const MOVE_SPEED = 11.5;
const RUN_MULTIPLIER = 1.75;
const ACCEL = 10; // 起步的收斂速率（越大越跟手）
const DECEL = 8; // 放開按鍵後的收斂速率（越小越滑）
const TURN_LERP = 12;
const BASE_FOV = 52;
const RUN_FOV = 58.5;

/* --- 抬頭看天空（Phase 9） ---------------------------------------------
 * 石碑上寫著「抬頭看看四周」，但原本的鏡頭根本抬不起來 —— 那句話是騙人的。
 * 現在：滑鼠上下拖曳、方向鍵 ↑ ↓，都能真的把視線抬到星空 / 月亮 / 極光。
 * 一開始移動就會平滑地收回跟隨鏡頭，玩家不會「卡在天上」。
 */

/* --- 操作分工（Phase 16） ----------------------------------------------
 * 一句話：**WASD 只管走路，方向鍵只管視角。**
 *   · W A S D        移動（方向鍵不再驅動角色）
 *   · ← →            鏡頭左右轉（原本的 Q / R）
 *   · ↑ ↓            抬頭 / 低頭（和滑鼠上下拖曳走同一個仰角）
 *   · 滑鼠拖曳 / Shift 一律不變
 * Q / R 保留成**不寫在任何說明裡的舊版別名**：老玩家的手指不會突然失靈，
 * 但畫面上（HUD / 教學卡 / 序章 / README）只講方向鍵這一套。
 */
/** 方向鍵轉鏡頭的角速度（弧度／秒）—— 與原本 Q / R 相同，手感不變。 */
const YAW_RATE = 1.8;
/** 方向鍵抬頭 / 低頭的角速度（弧度／秒）：整個仰角範圍約 1.4 秒走完。 */
const PITCH_RATE = 1.2;
/** 視線俯仰的上下限（弧度）：正 = 抬頭。上限約 68°，看得到月亮與極光。 */
const PITCH_MAX = 1.2;
const PITCH_MIN = -0.45;

/** 抬頭時鏡頭同時往下沉一點，角色才不會擋在畫面正中間。 */
const PITCH_DROP = 2.6;

/* --- 鏡頭拉遠 / 拉近（Phase 23） --------------------------------------
 * 以前只有滾輪能調鏡頭距離 —— 純鍵盤玩的人根本碰不到這件事。
 * 現在 `-` 拉遠、`=` 拉近（數字鍵盤的 −/＋ 與 PageDown / PageUp 是同一件事）。
 * 按著不放會連續變化，手感與滾輪一致。
 */
const ZOOM_MIN = 7;
const ZOOM_MAX = 26;
/** 按住一秒改變幾公尺（整個範圍約 1.4 秒走完，和抬頭同一個節奏）。 */
const ZOOM_RATE = 14;
/** 拉遠（往外）與拉近（往內）的按鍵。 */
const ZOOM_OUT_KEYS = ['Minus', 'NumpadSubtract', 'PageDown'];
const ZOOM_IN_KEYS = ['Equal', 'NumpadAdd', 'PageUp'];

/* --- 跳躍（v1.2 · P14） --------------------------------------------------
 * 常數、彈道與狀態機全部在 `jump.js`（純函式、不 import three）——
 * 「跳得上 1.6、跳不上 3.0」「鬆手會不會少跳一截」這些問題在 rubric 裡就答得完。
 *
 * 這一支只負責把它接上世界：
 *   · 起跳前問一句「這片土地跳得起來嗎」（只有中央高原非 0）與「腳下安不安全」
 *   · 空中的每一步水平位移照樣走 `clampPosition()` —— **邊界護欄一寸都不放寬**
 *   · 腳下的高度改問 `world.supportAt(x, z, 腳的高度)`：
 *     只有「腳已經站到它頂面以上」的可站立體才撐得住人
 *
 * **不按 `J` 的那條路一個位元組都沒有變**：`isAloft()` 是 false 時，
 * 下面那一段 `updateVertical()` 直接回 `groundY` ——
 * 也就是 P14 之前那一行 `group.position.y = terrainHeight(...)`。
 */
/** 落地擠壓 / 起跳拉長的視覺幅度（0 = 關掉）。 */
const SQUASH_Y = 0.3;
const SQUASH_XZ = 0.2;
/** 擠壓收回去的速率（越大收得越快）。 */
const SQUASH_DAMP = 9;
/** 起跳那一下拉長多少（負 = 拉長）。 */
const STRETCH_ON_JUMP = -0.7;
/** 落地塵：幾顆、活多久（秒）、散多開。 */
const DUST_COUNT = 26;
const DUST_LIFE = 0.55;
const DUST_SPREAD = 1.9;
/** 掉到多快才值得噴塵與出聲（m/s）—— 從高台上走下來也算得上一次落地。 */
const LAND_IMPACT_MIN = 3.2;

/**
 * @param {object} opts
 * @param {object} [opts.world] createWorld() 的回傳值：提供 terrainHeight / clampPosition / colliders
 * @param {Function} [opts.onStep] 走路踏地時的回呼（拿來播腳步聲）
 * @param {Function} [opts.onJump] 離地那一刻的回呼（播起跳聲）
 * @param {Function} [opts.onLand] 落地那一刻的回呼，參數是落地速度（m/s）
 * @param {boolean} [opts.reducedMotion] `prefers-reduced-motion`：
 *   **關掉的是「動」，不是「回應」**（WORLD.md §2.4）——跳躍照跳、位移一寸不減，
 *   拿掉的只有擠壓變形與塵埃往外飛的那一段。
 */
export function createPlayer({
  engine,
  quality = 'high',
  startPosition = [0, 0],
  world = null,
  onStep = null,
  onJump = null,
  onLand = null,
  reducedMotion = false,
}) {
  const { scene, camera } = engine;
  const terrainHeight = world && world.terrainHeight ? world.terrainHeight : defaultTerrain;
  const clampPosition =
    world && world.clampPosition ? world.clampPosition.bind(world) : (nx, nz) => ({ x: nx, z: nz });
  const colliders = (world && world.colliders) || [];
  // 保險絲：站在實體道具裡時每幀往外推一小步（見 world.escapeSolid）
  const escapeSolid = world && world.escapeSolid ? world.escapeSolid.bind(world) : () => null;
  /*
   * v1.2 · P14：腳下真的撐得住你的那一面。回的是**共用物件**（零每幀配置），
   * 用完就讀。沒有世界時退回「永遠是地形高度」——單獨測角色控制器也跑得動。
   */
  const supportAt =
    world && world.supportAt ? world.supportAt.bind(world) : (x, z) => ({ y: terrainHeight(x, z), index: -1, id: null });
  /** 起跳前要問的兩件事：這裡是哪一片土地、腳下站不站得穩。 */
  const regionAt = world && world.regionAt ? world.regionAt : () => null;
  const isClear = world && world.isClear ? world.isClear : () => true;

  /* --- 角色模型 --- */
  const group = new THREE.Group();
  group.name = 'player';

  // 旅人本體：有骨節的人形角色（見 character.js）。走路 / 呼吸 / 慶祝都在那一層算。
  const character = createCharacter({ quality });
  group.add(character.root);

  // 腳下的軟陰影（沒開 shadow map 時也有落地感）
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  group.add(blob);

  const [sx, sz] = startPosition;
  group.position.set(sx, terrainHeight(sx, sz), sz);
  scene.add(group);

  /* --- 落地塵（v1.2 · P14） -------------------------------------------
   * 一組固定 26 顆的點，建好一次就一直留著（**tick 裡不 new**）。
   * 落地時整組搬到腳下、放大再淡出 —— 沒有新光源、沒有新材質快取。
   * `reducedMotion` 下只淡出、不往外散（WORLD.md §2.4：關掉的是動、不是回應）。
   */
  const dustGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const a = (i / DUST_COUNT) * Math.PI * 2 + (i % 3) * 0.4;
      const rad = 0.35 + ((i * 37) % 100) / 100 * 0.65;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = 0.08 + ((i * 53) % 100) / 100 * 0.32;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const dustMat = new THREE.PointsMaterial({
    color: 0xb9c6d4,
    size: 0.17,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'jump-dust';
  dust.visible = false;
  dust.frustumCulled = false;
  scene.add(dust);
  let dustT = 0;

  /* --- 跳躍狀態 ---
   * `jumper` 是 `jump.js` 的那一小台狀態機；`jumpIO` 是遞給它的**同一個**物件
   * （每幀填一填就好，不 new）。`squash` 是程序化的擠壓 / 拉長，正 = 壓扁。
   */
  const jumper = createJumper();
  const jumpIO = {
    y: 0,
    groundY: 0,
    supportY: 0,
    supportId: null,
    supportIndex: -1,
    wantJump: false,
    held: false,
    jumpSpeed: 0,
    canTakeOff: false,
  };
  let squash = 0;

  /* --- 輸入 --- */
  const keys = new Set();
  let inputEnabled = true;
  /** 跳躍鍵（WORLD.md §3.1）。P13 先定 `J`，站長實玩後改成**空白鍵**（跳躍的通用鍵位）。 */
  const JUMP_KEY = 'Space';
  /** 這一幀有沒有「按下」跳躍鍵（邊緣觸發，讀完就清）。 */
  let jumpPressed = false;
  /** 這一幀有沒有按著 Shift（序章的「學會奔跑」用得到）。 */
  let running = false;
  let cameraYaw = Math.PI; // 一開始面向 -Z（世界深處）
  /** 玩家自己抬/低頭的角度（0 = 預設的跟隨視角）。 */
  let cameraPitch = 0;
  let pitchSmooth = 0;
  let cameraDistance = 13;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  /*
   * 焦點在會吃鍵盤的元件上時，世界層一律不收。
   * 空白鍵當上跳躍鍵之後這件事更要緊：焦點停在一顆按鈕／勾勾上時，
   * 空白鍵的意思是「按下它」，不是「跳」（設定頁的靜音勾勾就是這樣切的）。
   */
  const isTypingTarget = (el) =>
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'BUTTON' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      el.getAttribute?.('role') === 'button' ||
      el.hasAttribute?.('tabindex'));

  function onKeyDown(e) {
    if (!inputEnabled || isTypingTarget(e.target)) return;
    // 跳躍是**邊緣觸發**：按著不放不會連跳（keydown 會一直重送）。
    if (e.code === JUMP_KEY && !keys.has(JUMP_KEY)) jumpPressed = true;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code))
      e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onBlur() {
    keys.clear();
    jumpPressed = false;
  }

  function onPointerDown(e) {
    if (e.target !== engine.renderer.domElement) return;
    dragging = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    cameraYaw -= (e.clientX - lastPointerX) * 0.006;
    // 往上拖 = 抬頭（clientY 變小）
    setPitch(cameraPitch + (lastPointerY - e.clientY) * 0.005);
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }
  /** 設定仰角並夾在合理範圍內（不會翻過頭、也不會鑽到地底）。 */
  function setPitch(v) {
    cameraPitch = THREE.MathUtils.clamp(v, PITCH_MIN, PITCH_MAX);
    return cameraPitch;
  }
  function onPointerUp() {
    dragging = false;
  }
  function onWheel(e) {
    if (!inputEnabled) return;
    setZoom(cameraDistance + e.deltaY * 0.012);
  }
  /** 設定鏡頭距離並夾在合理範圍內（滾輪與鍵盤走的是同一支）。 */
  function setZoom(v) {
    cameraDistance = THREE.MathUtils.clamp(Number(v) || 0, ZOOM_MIN, ZOOM_MAX);
    return cameraDistance;
  }
  /** 這一幀有沒有按著某一組鍵。 */
  function held(codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  engine.renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

  /* --- 更新 --- */
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3(); // 想去的方向（單位向量）
  const velocity = new THREE.Vector3(); // 目前的速度（世界座標，m/s）
  const desiredCam = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookNow = new THREE.Vector3();
  const camAnchor = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const lookahead = new THREE.Vector3();
  const lookDir = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const pitchedTarget = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 40;

  let walkPhase = 0;
  let facing = Math.PI;
  let speedSmooth = 0;
  let lean = 0;
  let stepFlag = 0;
  let camDistSmooth = cameraDistance;
  /** 跳躍的視覺（擠壓 / 影子 / 塵）這一幀還需不需要收尾。 */
  let jumpVisualOn = false;

  camera.position.set(sx, terrainHeight(sx, sz) + 8, sz + cameraDistance);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  lookNow.set(sx, terrainHeight(sx, sz) + 2.2, sz);

  /**
   * 鏡頭避障：從角色頭頂往鏡頭想去的位置打一條射線，
   * 打到書架 / 齒輪之類的實體就把鏡頭拉到障礙物前面 —— 不會再穿模。
   */
  function pullInCamera(anchor, wanted) {
    if (!colliders.length) return wanted;
    rayDir.copy(wanted).sub(anchor);
    const dist = rayDir.length();
    if (dist < 0.05) return wanted;
    rayDir.multiplyScalar(1 / dist);
    raycaster.set(anchor, rayDir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(colliders, false);
    if (!hits.length) return wanted;
    const d = Math.max(2.2, hits[0].distance - 0.9);
    return wanted.copy(anchor).addScaledVector(rayDir, d);
  }

  /**
   * v1.2 · P14：這一幀腳要放在多高。
   *
   * **貼著地形走的時候（沒有離地、也沒有站在任何東西上），這一支直接回 `groundY`**
   * —— 也就是 P14 之前那一行 `group.position.y = terrainHeight(...)`。
   * 所以「不按 `J` 行為零改變」不是統計出來的，是結構上成立的：
   * `stepJumper()` 的第 ④ 段就是那一行。
   *
   * 零每幀配置：`jumpIO` 是同一個物件、`supportAt()` 回的也是同一個物件。
   *
   * @param {number} dt
   * @param {number} groundY 腳下地形的高度
   * @returns {number} 腳的高度
   */
  function updateVertical(dt, groundY) {
    const px = group.position.x;
    const pz = group.position.z;
    const aloft = isAloft(jumper);
    const wantJump = jumpPressed;
    jumpPressed = false;

    /*
     * 支撐面：**用這一幀開始時腳的高度去問**。下墜時那是這一幀的最高點，
     * 所以一幀 0.2 秒也不會從頂面正中間穿過去（findings：軟體渲染一幀真的有 0.2 秒）。
     */
    const sup = aloft ? supportAt(px, pz, group.position.y) : null;

    /*
     * 起跳前的兩道護欄（只有真的按了跳才問，不是每幀）：
     *   ① 這片土地跳得起來嗎 —— 四片土地非 0（`JUMP_REGIONS`），
     *      橋上只有開了缺口的那一座非 0（`JUMP_BRIDGES`）
     *   ② 腳下站不站得穩 —— `isClear()` ＝ 覆蓋率 ＋ 閘門 ＋ 沒有卡在石頭裡。
     *      卡在石頭裡（脫困中）或站在虛空邊緣時**起跳那一刻就被夾住**：不准離地。
     */
    let jumpSpeed = 0;
    let canTakeOff = false;
    if (wantJump || jumper.buffer > 0) {
      const here = regionAt(px, pz);
      /*
       * v1.2 · P15：橋上不再一律是 0 —— **開了缺口的那一座橋**跳得起來
       * （`JUMP_BRIDGES`），其餘六座仍然是 0，每一幀與 P14 之前完全相同。
       */
      jumpSpeed = here ? (here.onBridge ? jumpSpeedForBridge(here.id) : jumpSpeedFor(here.id)) : 0;
      canTakeOff = jumpSpeed > 0 && isClear(px, pz, aloft ? group.position.y : null);
    }

    jumpIO.y = group.position.y;
    jumpIO.groundY = groundY;
    jumpIO.supportY = sup ? sup.y : groundY;
    jumpIO.supportId = sup ? sup.id : null;
    jumpIO.supportIndex = sup ? sup.index : -1;
    jumpIO.wantJump = wantJump;
    jumpIO.held = inputEnabled && keys.has(JUMP_KEY);
    jumpIO.jumpSpeed = jumpSpeed;
    jumpIO.canTakeOff = canTakeOff;

    const jumpsBefore = jumper.jumps;
    const wasAirborne = jumper.airborne;
    const y = stepJumper(jumper, dt, jumpIO);

    if (jumper.jumps !== jumpsBefore) {
      squash = STRETCH_ON_JUMP; // 起跳：拉長
      onJump?.();
    } else if (wasAirborne && !jumper.airborne) {
      // 落地：擠壓 ＋ 塵 ＋ 一聲悶響（掉得夠快才值得，走下一階不會叮咚響）
      const impact = jumper.lastImpact;
      if (impact >= LAND_IMPACT_MIN) {
        squash = Math.min(1, impact / 14);
        dustT = DUST_LIFE;
        dust.position.set(px, y + 0.05, pz);
        dust.visible = true;
        onLand?.(impact);
      }
    }
    return y;
  }

  engine.onUpdate((dt, t) => {
    let ix = 0;
    let iz = 0;
    if (inputEnabled) {
      // 移動：只有 W A S D（方向鍵從 Phase 16 起專心當視角鍵）
      if (keys.has('KeyW')) iz += 1;
      if (keys.has('KeyS')) iz -= 1;
      if (keys.has('KeyA')) ix -= 1;
      if (keys.has('KeyD')) ix += 1;
      // 鏡頭左右轉：← →（KeyQ / KeyR 是不寫在說明裡的舊版別名），或按住滑鼠拖曳
      if (keys.has('ArrowLeft') || keys.has('KeyQ')) cameraYaw += dt * YAW_RATE;
      if (keys.has('ArrowRight') || keys.has('KeyR')) cameraYaw -= dt * YAW_RATE;
      /*
       * 抬頭 / 低頭：↑ ↓，或滑鼠上下拖曳。
       * **空白鍵從這裡拿掉了**——它現在是跳躍鍵。原本那個「一口氣抬到看得見星空」
       * 只是 ↑ 的捷徑（序章本來就同時教 ↑），一個鍵不能同時是跳躍與抬頭。
       */
      if (keys.has('ArrowUp')) setPitch(cameraPitch + dt * PITCH_RATE);
      if (keys.has('ArrowDown')) setPitch(cameraPitch - dt * PITCH_RATE);
      // 鏡頭拉遠 / 拉近：- 與 =（滾輪之外的那條路，純鍵盤也調得動）
      if (held(ZOOM_OUT_KEYS)) setZoom(cameraDistance + dt * ZOOM_RATE);
      if (held(ZOOM_IN_KEYS)) setZoom(cameraDistance - dt * ZOOM_RATE);
    }

    running = inputEnabled && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const topSpeed = MOVE_SPEED * (running ? RUN_MULTIPLIER : 1);

    // forward = 鏡頭看出去的方向；right = forward × up
    forward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    wish.set(0, 0, 0).addScaledVector(forward, iz).addScaledVector(right, ix);
    const wants = wish.lengthSq() > 0.0001;
    if (wants) wish.normalize();

    // 加速 / 減速：velocity 追向 wish * topSpeed
    const rate = wants ? ACCEL : DECEL;
    velocity.x = THREE.MathUtils.damp(velocity.x, wants ? wish.x * topSpeed : 0, rate, dt);
    velocity.z = THREE.MathUtils.damp(velocity.z, wants ? wish.z * topSpeed : 0, rate, dt);
    if (!wants && velocity.lengthSq() < 0.02) velocity.set(0, 0, 0);

    /*
     * v1.2 · P14：腳的高度。**貼著地形走的時候是 `null`** ——
     * `clampPosition()` 與 `escapeSolid()` 於是走 P13 之前那一支，一個位元組沒動。
     * 只有離地中／站在高台上時才給數字，讓「腳已經在它頂面以上」的那一顆不擋人。
     */
    const feetY = isAloft(jumper) ? group.position.y : null;

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.01) {
      // 世界邊界 / 未開啟的閘門：走不過去就沿牆滑
      const next = clampPosition(
        group.position.x + velocity.x * dt,
        group.position.z + velocity.z * dt,
        group.position.x,
        group.position.z,
        feetY
      );
      // 真的被擋住 → 把該軸的速度歸零，才不會貼著牆繼續加速
      if (Math.abs(next.x - group.position.x) < 1e-6 && Math.abs(velocity.x) > 0.01) velocity.x *= 0.2;
      if (Math.abs(next.z - group.position.z) < 1e-6 && Math.abs(velocity.z) > 0.01) velocity.z *= 0.2;
      group.position.x = next.x;
      group.position.z = next.z;

      facing = Math.atan2(velocity.x, velocity.z);
      walkPhase += dt * (running ? 12.5 : 8.5) * Math.min(1, speed / MOVE_SPEED + 0.25);
    }

    const speedRatio = speed / (MOVE_SPEED * RUN_MULTIPLIER);
    speedSmooth = THREE.MathUtils.damp(speedSmooth, speed / MOVE_SPEED, 8, dt);

    // 腳步：走路週期每半圈踏一次
    const stepPhase = Math.floor(walkPhase / Math.PI);
    if (stepPhase !== stepFlag) {
      stepFlag = stepPhase;
      if (speed > 2 && typeof onStep === 'function') onStep(speed);
    }

    // 卡在道具裡就慢慢推出來（傳送、資料改動都可能發生；絕不能把玩家關住）
    const escape = escapeSolid(group.position.x, group.position.z, dt * 6 + 0.05, feetY);
    if (escape) {
      group.position.x = escape.x;
      group.position.z = escape.z;
    }

    // 貼地（走路的上下起伏交給角色的軀幹那一層，腳下的軟陰影才不會跟著飄）
    const groundY = terrainHeight(group.position.x, group.position.z);
    group.position.y = updateVertical(dt, groundY);

    // 轉向平滑
    let delta = facing - group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const turnStep = delta * Math.min(1, TURN_LERP * dt);
    group.rotation.y += turnStep;

    // 角色動畫：走 / 跑 / 站的擺幅由 speedRatio 與 runRatio 連續混出來，沒有狀態機
    lean = THREE.MathUtils.damp(lean, THREE.MathUtils.clamp(turnStep * 9, -0.28, 0.28), 6, dt);
    character.update({
      dt,
      t,
      walkPhase,
      speedRatio: Math.min(1, speedSmooth),
      runRatio: THREE.MathUtils.clamp((speed - MOVE_SPEED * 0.92) / (MOVE_SPEED * (RUN_MULTIPLIER - 0.92)), 0, 1),
      lean,
    });

    /* --- v1.2 · P14：起跳拉長 / 落地擠壓、影子留在地上、落地塵 ---
     * 整段只有在「離地中 / 還在收擠壓 / 塵還沒散」時才跑；三件事都結束之後
     * 再跑最後一幀把角色、影子、塵都還原（`jumpVisualOn`），之後就完全不進來。
     * `reducedMotion`：**位移拿掉、回應留著** —— 不擠壓、塵不往外飛，但塵照樣亮一下再淡掉。
     */
    const jumpVisual = squash !== 0 || dustT > 0 || isAloft(jumper);
    if (jumpVisual || jumpVisualOn) {
      jumpVisualOn = jumpVisual;
      if (reducedMotion) {
        squash = 0;
        character.root.scale.set(1, 1, 1);
      } else {
        squash = THREE.MathUtils.damp(squash, 0, SQUASH_DAMP, dt);
        if (Math.abs(squash) < 0.004) squash = 0;
        character.root.scale.set(1 + squash * SQUASH_XZ, 1 - squash * SQUASH_Y, 1 + squash * SQUASH_XZ);
      }
      // 腳下的軟陰影留在地上（離地越高越小、越淡）—— 貼著地走的時候 drop 是 0，回到原值
      const drop = Math.max(0, group.position.y - jumpIO.supportY);
      const shade = Math.max(0.34, 1 - drop * 0.24);
      blob.position.y = 0.03 - drop;
      blob.scale.setScalar(shade);
      blob.material.opacity = 0.28 * shade;
    }
    if (dustT > 0) {
      dustT = Math.max(0, dustT - dt);
      const p = 1 - dustT / DUST_LIFE;
      dustMat.opacity = 0.5 * (1 - p) * (1 - p);
      dust.scale.setScalar(reducedMotion ? DUST_SPREAD * 0.7 : 0.6 + p * DUST_SPREAD);
      if (dustT === 0) {
        dust.visible = false;
        dustMat.opacity = 0;
      }
    }

    // 奔跑時 FOV 微微拉開 —— 最便宜的速度感
    engine.setFov?.(THREE.MathUtils.damp(camera.fov, BASE_FOV + (RUN_FOV - BASE_FOV) * speedRatio, 4, dt));

    /* --- 跟隨鏡頭：延遲 ＋ 前瞻 ＋ 避障 --- */
    // 前瞻：往移動方向推一點點，跑起來像被拉著走
    lookahead.set(velocity.x, 0, velocity.z).multiplyScalar(0.22);

    // 抬頭：站著不動時停在你拉到的角度，一開始移動就平滑地收回跟隨鏡頭。
    // 但只要玩家還按著視角鍵（↑ ↓），就以他為準 —— 邊走邊看天空是合法的。
    const holdingLook = keys.has('ArrowUp') || keys.has('ArrowDown');
    if (wants && !holdingLook) setPitch(THREE.MathUtils.damp(cameraPitch, 0, 2.6, dt));
    pitchSmooth = THREE.MathUtils.damp(pitchSmooth, cameraPitch, 8, dt);

    camDistSmooth = THREE.MathUtils.damp(camDistSmooth, cameraDistance, 6, dt);
    camAnchor.set(group.position.x, group.position.y + 2.3, group.position.z);
    desiredCam.set(
      group.position.x + lookahead.x - Math.sin(cameraYaw) * camDistSmooth,
      0,
      group.position.z + lookahead.z - Math.cos(cameraYaw) * camDistSmooth
    );
    desiredCam.y = Math.max(terrainHeight(desiredCam.x, desiredCam.z) + 3.4, groundY + camDistSmooth * 0.52);
    // 抬頭時鏡頭往下沉一點：角色留在畫面下緣，上半屏全是天空
    if (pitchSmooth > 0) {
      desiredCam.y = Math.max(
        terrainHeight(desiredCam.x, desiredCam.z) + 1.6,
        desiredCam.y - pitchSmooth * PITCH_DROP
      );
    }
    pullInCamera(camAnchor, desiredCam);

    // 移動時鏡頭跟得慢一點（有重量），停下來時收得快一點
    const follow = 3.2 + speedSmooth * 2.4;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCam.x, follow, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCam.y, follow * 1.25, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCam.z, follow, dt);

    lookTarget.set(
      group.position.x + lookahead.x * 0.6,
      group.position.y + 2.2,
      group.position.z + lookahead.z * 0.6
    );
    lookNow.x = THREE.MathUtils.damp(lookNow.x, lookTarget.x, 7, dt);
    lookNow.y = THREE.MathUtils.damp(lookNow.y, lookTarget.y, 7, dt);
    lookNow.z = THREE.MathUtils.damp(lookNow.z, lookTarget.z, 7, dt);

    if (Math.abs(pitchSmooth) < 0.002) {
      camera.lookAt(lookNow);
    } else {
      // 以「看向角色」為基準，再繞著鏡頭自己的右軸轉一個仰角 —— 真的看得到星空 / 月亮 / 極光
      lookDir.copy(lookNow).sub(camera.position);
      const reach = lookDir.length() || 1;
      lookDir.multiplyScalar(1 / reach);
      camRight.crossVectors(lookDir, WORLD_UP).normalize();
      if (camRight.lengthSq() > 0.0001) lookDir.applyAxisAngle(camRight, pitchSmooth);
      pitchedTarget.copy(camera.position).addScaledVector(lookDir, reach);
      camera.lookAt(pitchedTarget);
    }
  });

  return {
    group,
    /** 人形角色（關節、提燈光源、慶祝動作）—— 測試與其他系統可直接取用。 */
    character,
    get position() {
      return group.position;
    },
    /** 過關時的小慶祝（雙手舉起）。 */
    celebrate() {
      return character.celebrate();
    },
    /** 目前的水平速度（m/s）—— 給 HUD / 音效判斷用。 */
    get speed() {
      return Math.hypot(velocity.x, velocity.z);
    },
    /**
     * v1.2 · P14：跳躍狀態（唯讀，測試 / 除錯用）。
     *
     * 為什麼要有 `jumps` / `lastApex` / `lastAirTime` 這幾個**累計值**：
     * 這台機器一幀可能 0.2 秒（軟體渲染），整趟 0.8 秒的跳躍只會被輪詢看到三四次
     * —— 「某一幀正好抓到他在空中」是會隨機器速度變動的斷言（findings · P12）。
     * 累計值不會，所以 e2e 問的是這幾個。
     */
    get jump() {
      return jumper;
    },
    /** 站在哪一座高台上（`null` ＝ 貼著地形）。 */
    get standingOn() {
      return jumper.standing;
    },
    /** 現在離地了嗎。 */
    get airborne() {
      return jumper.airborne;
    },
    /** 目前的鏡頭方位角（弧度）—— 序章用它判斷「玩家真的轉過鏡頭了」。 */
    get cameraYaw() {
      return cameraYaw;
    },
    /** 目前的視線仰角（弧度，正 = 抬頭）。序章與測試用它判斷「真的看到天空了」。 */
    get cameraPitch() {
      return cameraPitch;
    },
    /** 這一幀實際套用到鏡頭上的仰角（平滑後的值）。 */
    get cameraPitchSmooth() {
      return pitchSmooth;
    },
    /** 仰角上下限（UI / 測試用）。 */
    get pitchRange() {
      return { min: PITCH_MIN, max: PITCH_MAX };
    },
    /** 直接設定仰角（測試、以及未來的「重置視角」按鈕用）。 */
    setCameraPitch(v) {
      return setPitch(Number(v) || 0);
    },
    /** 目前的鏡頭距離（公尺）。滾輪與 - / = 調的是同一個值。 */
    get cameraDistance() {
      return cameraDistance;
    },
    /** 鏡頭距離的上下限（UI / 測試用）。 */
    get zoomRange() {
      return { min: ZOOM_MIN, max: ZOOM_MAX };
    },
    /** 直接設定鏡頭距離（測試用）。 */
    setCameraDistance: setZoom,
    /** 這一幀是否按著 Shift。 */
    get running() {
      return running;
    },
    /** 現在接不接受操控（面板打開時為 false）。 */
    get inputEnabled() {
      return inputEnabled;
    },
    setInputEnabled(v) {
      inputEnabled = v;
      if (!v) {
        keys.clear();
        jumpPressed = false;
        velocity.set(0, 0, 0);
      }
    },
    /**
     * 直接把人放到某個座標。
     * @param {number} x
     * @param {number} z
     * @param {number} [face] 面向（弧度）。坐長凳時要正對著凳子擺的方向。
     */
    teleport(x, z, face) {
      group.position.set(x, terrainHeight(x, z), z);
      velocity.set(0, 0, 0);
      // 傳送＝重新落地：跳躍狀態整組歸零，不然人會帶著上一處的垂直速度出現
      jumper.airborne = false;
      jumper.supported = false;
      jumper.standing = null;
      jumper.vy = 0;
      jumper.buffer = 0;
      jumper.cut = false;
      jumpPressed = false;
      lookNow.set(x, terrainHeight(x, z) + 2.2, z);
      if (Number.isFinite(face)) {
        facing = face;
        group.rotation.y = face;
      }
    },
    /** 坐下 / 站起來（長凳）。走一步就會自己站起來。 */
    setResting(v) {
      return character.rest(v);
    },
    /** 目前的坐姿權重（0 = 站著、1 = 坐滿）。 */
    get restAmount() {
      return character.restAmount;
    },
    dispose() {
      scene.remove(dust);
      dustGeo.dispose();
      dustMat.dispose();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      character.dispose();
    },
  };
}

export default createPlayer;

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

const MOVE_SPEED = 11.5;
const RUN_MULTIPLIER = 1.75;
const ACCEL = 10; // 起步的收斂速率（越大越跟手）
const DECEL = 8; // 放開按鍵後的收斂速率（越小越滑）
const TURN_LERP = 12;
const BASE_FOV = 52;
const RUN_FOV = 58.5;

/* --- 抬頭看天空（Phase 9） ---------------------------------------------
 * 石碑上寫著「抬頭看看四周」，但原本的鏡頭根本抬不起來 —— 那句話是騙人的。
 * 現在：滑鼠上下拖曳、方向鍵 ↑ ↓、或按住空白鍵，都能真的把視線抬到星空 / 月亮 / 極光。
 * 一開始移動就會平滑地收回跟隨鏡頭，玩家不會「卡在天上」。
 */

/* --- 操作分工（Phase 16） ----------------------------------------------
 * 一句話：**WASD 只管走路，方向鍵只管視角。**
 *   · W A S D        移動（方向鍵不再驅動角色）
 *   · ← →            鏡頭左右轉（原本的 Q / R）
 *   · ↑ ↓            抬頭 / 低頭（和滑鼠上下拖曳、空白鍵走同一個仰角）
 *   · 滑鼠拖曳 / 空白鍵 / Shift 一律不變
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
/**
 * 按住空白鍵時的目標仰角。
 * 刻意不抬到最高：留一線地平線在畫面下緣，星空 ／ 極光 ／ 月亮 才有對照，
 * 整片只有黑天空反而看不出「這片夜色比你以為的還大」。
 */
const PITCH_SKY = 0.62;
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

/**
 * @param {object} opts
 * @param {object} [opts.world] createWorld() 的回傳值：提供 terrainHeight / clampPosition / colliders
 * @param {Function} [opts.onStep] 走路踏地時的回呼（拿來播腳步聲）
 */
export function createPlayer({ engine, quality = 'high', startPosition = [0, 0], world = null, onStep = null }) {
  const { scene, camera } = engine;
  const terrainHeight = world && world.terrainHeight ? world.terrainHeight : defaultTerrain;
  const clampPosition =
    world && world.clampPosition ? world.clampPosition.bind(world) : (nx, nz) => ({ x: nx, z: nz });
  const colliders = (world && world.colliders) || [];
  // 保險絲：站在實體道具裡時每幀往外推一小步（見 world.escapeSolid）
  const escapeSolid = world && world.escapeSolid ? world.escapeSolid.bind(world) : () => null;

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

  /* --- 輸入 --- */
  const keys = new Set();
  let inputEnabled = true;
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

  const isTypingTarget = (el) =>
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

  function onKeyDown(e) {
    if (!inputEnabled || isTypingTarget(e.target)) return;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code))
      e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onBlur() {
    keys.clear();
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
      // 抬頭 / 低頭：↑ ↓，或滑鼠上下拖曳；按住空白鍵直接抬到看得見星空的角度
      if (keys.has('ArrowUp')) setPitch(cameraPitch + dt * PITCH_RATE);
      if (keys.has('ArrowDown')) setPitch(cameraPitch - dt * PITCH_RATE);
      if (keys.has('Space')) setPitch(THREE.MathUtils.damp(cameraPitch, PITCH_SKY, 4, dt));
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

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.01) {
      // 世界邊界 / 未開啟的閘門：走不過去就沿牆滑
      const next = clampPosition(
        group.position.x + velocity.x * dt,
        group.position.z + velocity.z * dt,
        group.position.x,
        group.position.z
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
    const escape = escapeSolid(group.position.x, group.position.z, dt * 6 + 0.05);
    if (escape) {
      group.position.x = escape.x;
      group.position.z = escape.z;
    }

    // 貼地（走路的上下起伏交給角色的軀幹那一層，腳下的軟陰影才不會跟著飄）
    const groundY = terrainHeight(group.position.x, group.position.z);
    group.position.y = groundY;

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

    // 奔跑時 FOV 微微拉開 —— 最便宜的速度感
    engine.setFov?.(THREE.MathUtils.damp(camera.fov, BASE_FOV + (RUN_FOV - BASE_FOV) * speedRatio, 4, dt));

    /* --- 跟隨鏡頭：延遲 ＋ 前瞻 ＋ 避障 --- */
    // 前瞻：往移動方向推一點點，跑起來像被拉著走
    lookahead.set(velocity.x, 0, velocity.z).multiplyScalar(0.22);

    // 抬頭：站著不動時停在你拉到的角度，一開始移動就平滑地收回跟隨鏡頭。
    // 但只要玩家還按著視角鍵（↑ ↓ / 空白鍵），就以他為準 —— 邊走邊看天空是合法的。
    const holdingLook = keys.has('Space') || keys.has('ArrowUp') || keys.has('ArrowDown');
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

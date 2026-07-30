/**
 * PromptArcade — 旅人（程序化低多邊形人形角色）
 *
 * Phase 5：主角從「膠囊 ＋ 提燈」換成真正有骨節的人物。
 * 沒有骨架、沒有外部模型、沒有動畫檔 —— 整隻角色由 three.js 基本幾何體組成，
 * 動作全部靠「巢狀 Group 的關節旋轉 ＋ 正弦波」即時算出來（rigless procedural animation）。
 *
 * 關節階層（每一層都是一個 Object3D，旋轉會往下傳遞）：
 *
 *   root ─ body ─ hips ─┬─ torso ─┬─ neck ─ head ─ hood / 眼睛
 *                       │         ├─ shoulderL ─ armL ─ elbowL ─ foreArmL ─ handL ─ lantern
 *                       │         └─ shoulderR ─ armR ─ elbowR ─ foreArmR ─ handR
 *                       ├─ hipL ─ thighL ─ kneeL ─ shinL ─ footL
 *                       └─ hipR ─ thighR ─ kneeR ─ shinR ─ footR
 *
 * 座標約定：角色的**本地 +Z 是正前方**（player.js 用 `rotation.y = atan2(vx, vz)` 轉向），
 * 因此「往前擺腿 / 擺手」= `rotation.x` 為**負**，「向前傾」= `rotation.x` 為正。
 *
 * 動作（全部是 phase 的函式，不需要 keyframe）：
 *   · 走路：手腳反相（相差 π）、膝蓋只往後彎（max(0, cos) 夾住）、
 *           軀幹以兩倍步頻上下起伏、肩與髖反向扭轉、頭部反向穩定
 *   · 奔跑：擺幅加大、前傾加深、步頻加快（由 player.js 給 runRatio）
 *   · 站立：呼吸（胸口縮放 ＋ 肩膀起伏）、提燈慢慢晃、重心微微移動
 *   · 過關慶祝：雙手舉起 ＋ 一個小跳，1.2 秒後自己收回去
 */
import * as THREE from 'three';
import { PALETTE } from '../engine/engine.js';

/** 角色配色：夜色裡看得清楚的低彩度布料 ＋ 一條暖色圍巾當視覺重點。 */
export const CHARACTER_PALETTE = Object.freeze({
  cloak: 0x37596d, // 外袍（主色，與世界的冷藍同源，但比地面亮一階才不會糊掉）
  cloakDark: 0x243c4f, // 兜帽 / 內裡
  tunic: 0x49717f, // 上衣
  skin: 0xdcc9ad,
  scarf: 0xc4705a, // 圍巾：整隻角色唯一的暖色塊
  leather: 0x76543c, // 背包 / 腰帶
  boots: 0x22323f,
  metal: 0x9db2bf,
});

/**
 * 走路 / 奔跑的擺幅（弧度）。[走, 跑] 兩個端點之間用 runRatio 插值。
 *
 * 數值取自正常步態的關節活動度（hip 屈 30° / 伸 10°、knee 0–60°、ankle ±25°、
 * 肩約 30–40°、骨盆軸向轉動 12° 對肩帶反向 7°、質心垂直位移約身高的 2.5–3%），
 * 再換算成弧度；奔跑端點約為走路的 1.5–1.9 倍。
 */
const GAIT = Object.freeze({
  thigh: [0.36, 0.66], // 髖：±0.36 再加一個往前的偏置（屈 > 伸）
  thighBias: [0.1, 0.16],
  knee: [1.0, 1.5], // 膝：單向鉸鏈，只在擺盪期彎
  arm: [0.3, 0.56],
  elbow: [0.34, 0.5],
  elbowBase: [0.16, 0.24],
  ankle: [0.22, 0.3],
  bob: [0.05, 0.085], // 質心垂直位移（角色高約 1.9 → 2.6%）
  sway: [0.02, 0.03], // 骨盆左右平移 ≈ 0.4 × bob
  pelvisTwist: [0.1, 0.15], // 骨盆軸向 12°
  chestTwist: [0.06, 0.09], // 肩帶反向 7°
  lean: [0.07, 0.24],
});

/** 膝蓋最大屈曲落在擺盪中期（步態週期約 70%），換算成相位偏移。 */
const KNEE_PHASE = 0.3;
/** 靜息呼吸 12–20 次/分 → 約 0.25 Hz。 */
const BREATH_OMEGA = Math.PI * 2 * 0.25;
/** 站立時的重心緩慢移動（0.08 Hz），避免像節拍器。 */
const IDLE_SHIFT_OMEGA = Math.PI * 2 * 0.08;

const mix = (pair, k) => pair[0] + (pair[1] - pair[0]) * k;

/**
 * 建立旅人。
 *
 * @param {object} opts
 * @param {'high'|'low'} [opts.quality] high 時開陰影
 * @returns {{root: THREE.Group, joints: object, lanternLight: THREE.PointLight,
 *            update: Function, celebrate: Function, dispose: Function}}
 */
export function createCharacter({ quality = 'high' } = {}) {
  const shadow = quality === 'high';
  const P = CHARACTER_PALETTE;

  const materials = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
    materials.push(m);
    return m;
  };
  const geometries = [];
  const geo = (g) => {
    geometries.push(g);
    return g;
  };

  const clothMat = mat(P.cloak, { roughness: 0.92 });
  const darkMat = mat(P.cloakDark, { roughness: 0.95 });
  // 開口的錐面 / 圓柱（外袍、披肩、兜帽）需要雙面，另外開一份材質才不會污染其他零件
  const clothShellMat = mat(P.cloak, { roughness: 0.92, side: THREE.DoubleSide });
  const darkShellMat = mat(P.cloakDark, { roughness: 0.95, side: THREE.DoubleSide });
  const tunicMat = mat(P.tunic, { roughness: 0.88 });
  const skinMat = mat(P.skin, { roughness: 0.7 });
  const scarfMat = mat(P.scarf, { roughness: 0.9 });
  const leatherMat = mat(P.leather, { roughness: 0.85 });
  const bootMat = mat(P.boots, { roughness: 0.95 });
  const metalMat = mat(P.metal, { roughness: 0.4, metalness: 0.5 });
  const eyeMat = mat(0x101820, {
    emissive: new THREE.Color(PALETTE.warm),
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  const lanternMat = mat(PALETTE.warm, {
    emissive: new THREE.Color(PALETTE.warm),
    emissiveIntensity: 2.2,
    roughness: 0.35,
  });

  const add = (parent, mesh, cast = true) => {
    if (cast && shadow) mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /* ---------------------------------------------------------------- *
   * 骨架（Group = 關節；旋轉這一層，底下所有零件跟著動）
   * ---------------------------------------------------------------- */
  const root = new THREE.Group();
  root.name = 'traveler';

  const body = new THREE.Group(); // 整體前傾 / 側傾 / 上下起伏都掛在這一層
  body.name = 'traveler:body';
  root.add(body);

  const hips = new THREE.Group();
  hips.name = 'traveler:hips';
  hips.position.y = 0.88;
  body.add(hips);

  const torso = new THREE.Group();
  torso.name = 'traveler:torso';
  hips.add(torso);

  /* --- 軀幹 --- */
  const chest = add(
    torso,
    new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.27, 0.36, 4, 8)), tunicMat)
  );
  chest.position.y = 0.3;

  // 外袍下襬：開口的錐面 —— 夜色裡最重要的一塊剪影（只到大腿中段，膝蓋與靴子要看得見）
  const skirt = add(
    torso,
    new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.5, 0.5, 8, 1, true)), clothShellMat)
  );
  skirt.position.y = -0.1;

  // 披肩：讓肩線變寬、上半身更有份量
  const cape = add(
    torso,
    new THREE.Mesh(geo(new THREE.ConeGeometry(0.44, 0.5, 8, 1, true)), darkShellMat)
  );
  cape.position.y = 0.42;

  const belt = add(torso, new THREE.Mesh(geo(new THREE.TorusGeometry(0.25, 0.055, 4, 10)), leatherMat));
  belt.position.y = 0.04;
  belt.rotation.x = Math.PI / 2;

  // 背包：掛在背後（-Z），走路時會跟著晃
  const satchel = new THREE.Group();
  satchel.position.set(0.02, 0.22, -0.3);
  torso.add(satchel);
  const satchelBox = add(satchel, new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, 0.26, 0.16)), leatherMat));
  satchelBox.rotation.x = 0.12;
  const strap = add(torso, new THREE.Mesh(geo(new THREE.TorusGeometry(0.27, 0.03, 3, 10)), leatherMat));
  strap.position.y = 0.3;
  strap.rotation.set(Math.PI / 2, 0, 0.5);

  /* --- 脖子與頭 --- */
  const neck = new THREE.Group();
  neck.name = 'traveler:neck';
  neck.position.y = 0.56;
  torso.add(neck);

  const scarf = add(neck, new THREE.Mesh(geo(new THREE.TorusGeometry(0.15, 0.07, 4, 10)), scarfMat));
  scarf.rotation.x = Math.PI / 2;

  // 圍巾尾巴：獨立的一節，走路 / 有風時會飄
  const scarfTail = new THREE.Group();
  scarfTail.position.set(-0.02, -0.02, -0.13);
  neck.add(scarfTail);
  const scarfTailMesh = add(
    scarfTail,
    new THREE.Mesh(geo(new THREE.BoxGeometry(0.19, 0.62, 0.05)), scarfMat)
  );
  scarfTailMesh.position.y = -0.29;

  const head = new THREE.Group();
  head.name = 'traveler:head';
  head.position.y = 0.16;
  neck.add(head);

  const skull = add(head, new THREE.Mesh(geo(new THREE.IcosahedronGeometry(0.2, 1)), skinMat));
  skull.position.y = 0.06;

  // 兜帽：後仰一點點，臉在陰影裡但看得到 —— 便宜又有個性的臉部處理
  const hood = add(head, new THREE.Mesh(geo(new THREE.ConeGeometry(0.28, 0.4, 7, 1, true)), darkShellMat));
  hood.position.set(0, 0.14, -0.04);
  hood.rotation.x = 0.13;

  const hoodBack = add(head, new THREE.Mesh(geo(new THREE.SphereGeometry(0.215, 8, 6)), darkMat));
  hoodBack.position.set(0, 0.08, -0.06);
  hoodBack.scale.set(1, 0.95, 1.05);

  // 兩顆會發微光的眼睛：夜裡一眼看得出「那是一個人」
  for (const side of [-1, 1]) {
    const eye = add(head, new THREE.Mesh(geo(new THREE.SphereGeometry(0.032, 6, 5)), eyeMat), false);
    eye.position.set(side * 0.073, 0.05, 0.19);
  }

  /* --- 手臂 --- */
  const armGeo = geo(new THREE.CapsuleGeometry(0.075, 0.22, 3, 6));
  const foreGeo = geo(new THREE.CapsuleGeometry(0.065, 0.2, 3, 6));
  const handGeo = geo(new THREE.IcosahedronGeometry(0.075, 0));
  const shoulderGeo = geo(new THREE.SphereGeometry(0.1, 6, 5));

  /** 建一條手臂，回傳肩 / 肘兩個關節。 */
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.name = `traveler:shoulder${side < 0 ? 'L' : 'R'}`;
    shoulder.position.set(side * 0.28, 0.46, 0);
    torso.add(shoulder);

    add(shoulder, new THREE.Mesh(shoulderGeo, clothMat));
    const upper = add(shoulder, new THREE.Mesh(armGeo, tunicMat));
    upper.position.y = -0.19;

    const elbow = new THREE.Group();
    elbow.name = `traveler:elbow${side < 0 ? 'L' : 'R'}`;
    elbow.position.y = -0.34;
    shoulder.add(elbow);

    const fore = add(elbow, new THREE.Mesh(foreGeo, tunicMat));
    fore.position.y = -0.17;

    const hand = new THREE.Group();
    hand.position.y = -0.33;
    elbow.add(hand);
    add(hand, new THREE.Mesh(handGeo, skinMat));

    return { shoulder, elbow, hand };
  }

  const armL = buildArm(-1);
  const armR = buildArm(1);

  /* --- 提燈：掛在右手上，燈光跟著手一起走 --- */
  const lanternPivot = new THREE.Group();
  lanternPivot.name = 'traveler:lantern';
  lanternPivot.position.y = 0.02;
  armR.hand.add(lanternPivot);

  const lanternBail = add(lanternPivot, new THREE.Mesh(geo(new THREE.TorusGeometry(0.06, 0.014, 3, 8)), metalMat), false);
  lanternBail.position.y = -0.03;
  lanternBail.rotation.y = Math.PI / 2;

  const lanternBody = add(lanternPivot, new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.13, 0)), lanternMat), false);
  lanternBody.position.y = -0.16;

  const lanternCap = add(lanternPivot, new THREE.Mesh(geo(new THREE.ConeGeometry(0.09, 0.07, 5)), metalMat), false);
  lanternCap.position.y = -0.07;

  // 燈光刻意擺在燈體「上方」：光源低到膝蓋高度時整個人會變成剪影，
  // 抬到腰以上才照得到披風與臉（物理上不精確，但夜裡好看得多）。
  const lanternLight = new THREE.PointLight(PALETTE.warm, 6.4, 14, 2);
  lanternLight.position.y = 0.42;
  lanternPivot.add(lanternLight);

  /* --- 腿 --- */
  const thighGeo = geo(new THREE.CapsuleGeometry(0.095, 0.24, 3, 6));
  const shinGeo = geo(new THREE.CapsuleGeometry(0.082, 0.24, 3, 6));
  const footGeo = geo(new THREE.BoxGeometry(0.15, 0.09, 0.26));

  function buildLeg(side) {
    const hip = new THREE.Group();
    hip.name = `traveler:hip${side < 0 ? 'L' : 'R'}`;
    hip.position.set(side * 0.135, -0.02, 0);
    hips.add(hip);

    const thigh = add(hip, new THREE.Mesh(thighGeo, clothMat));
    thigh.position.y = -0.2;

    const knee = new THREE.Group();
    knee.name = `traveler:knee${side < 0 ? 'L' : 'R'}`;
    knee.position.y = -0.4;
    hip.add(knee);

    const shin = add(knee, new THREE.Mesh(shinGeo, bootMat));
    shin.position.y = -0.2;

    const ankle = new THREE.Group();
    ankle.position.y = -0.4;
    knee.add(ankle);
    const foot = add(ankle, new THREE.Mesh(footGeo, bootMat));
    foot.position.set(0, -0.04, 0.055);

    return { hip, knee, ankle };
  }

  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  /* ---------------------------------------------------------------- *
   * 動畫狀態
   * ---------------------------------------------------------------- */
  let celebrateT = 0; // 過關慶祝的剩餘時間
  const CELEBRATE_TIME = 1.25;

  /*
   * 坐下（Phase 25）：長凳唯一的用途。
   *
   * 一樣是 rigless —— 沒有新的動畫檔，只是把既有的關節往「坐姿」推：
   * 髖屈約 85°、膝屈約 90°、骨盆下沉約 0.42（＝小腿長），軀幹微微往後靠、
   * 手垂在膝上。走起來的時候權重強制回 0，所以「站起來走」不需要狀態機。
   * 角度取自一般座椅的坐姿量測（髖 80–90°、膝 85–95°）。
   */
  let restTarget = 0;
  let restAmt = 0;
  const SEAT_HIP = 1.48; // 85°
  const SEAT_KNEE = 1.55; // 89°
  const SEAT_DROP = 0.42;

  const joints = {
    body,
    hips,
    torso,
    neck,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    ankleL: legL.ankle,
    ankleR: legR.ankle,
    lantern: lanternPivot,
    scarfTail,
    satchel,
  };

  /**
   * 每一幀更新一次。所有數值都是 phase 的函式，不需要任何 keyframe / mixer。
   *
   * @param {object} s
   * @param {number} s.dt        幀時間（秒）
   * @param {number} s.t         總經過時間（秒）
   * @param {number} s.walkPhase 步態相位（弧度；每 π 一步）
   * @param {number} s.speedRatio 0 = 站著、1 = 走路全速
   * @param {number} s.runRatio  0 = 走、1 = 奔跑（決定擺幅與前傾）
   * @param {number} s.lean      轉彎側傾（弧度，正 = 往左）
   */
  function update({ dt = 0.016, t = 0, walkPhase = 0, speedRatio = 0, runRatio = 0, lean = 0 } = {}) {
    const move = THREE.MathUtils.clamp(speedRatio, 0, 1);
    const run = THREE.MathUtils.clamp(runRatio, 0, 1);
    const idle = 1 - Math.min(1, move * 1.9);
    const p = walkPhase;

    if (celebrateT > 0) celebrateT = Math.max(0, celebrateT - dt);
    // 0 → 1 → 0 的鐘形曲線，慶祝動作自己進場又自己收回去
    const cheer = celebrateT > 0 ? Math.sin((1 - celebrateT / CELEBRATE_TIME) * Math.PI) : 0;

    // 坐姿權重：一走起來就自動歸零（＝「走一步就站起來」不需要狀態機）
    const restWant = restTarget * (1 - Math.min(1, move * 3));
    restAmt += (restWant - restAmt) * (1 - Math.exp(-5 * dt));

    const thighA = mix(GAIT.thigh, run) * move;
    const thighBias = mix(GAIT.thighBias, run) * move;
    const kneeA = mix(GAIT.knee, run) * move;
    const armA = mix(GAIT.arm, run) * move;
    const elbowA = mix(GAIT.elbow, run) * move;
    const elbowBase = mix(GAIT.elbowBase, run);
    const ankleA = mix(GAIT.ankle, run) * move;

    /* --- 腿：左右相差 π；膝蓋是單向鉸鏈，只在擺盪期彎 --- */
    const legPhase = [p, p + Math.PI];
    const legs = [legL, legR];
    for (let i = 0; i < 2; i += 1) {
      const q = legPhase[i];
      // 本地 +Z 是前方 → 負的 rotation.x 才是往前跨；bias 讓「屈 > 伸」符合真實步態
      legs[i].hip.rotation.x = -(Math.sin(q) * thighA + thighBias);
      // max(0, cos) → 只有腿往前擺的那半圈收膝；KNEE_PHASE 把最大屈曲挪到擺盪中期
      legs[i].knee.rotation.x = Math.max(0, Math.cos(q + KNEE_PHASE)) * kneeA + 0.05 + idle * 0.02;
      legs[i].ankle.rotation.x = Math.sin(q + 0.6) * ankleA - idle * 0.03;
    }

    /* --- 手：對側同步（左手跟右腿同相），手肘永遠帶一點彎，不會變殭屍 --- */
    const armPhase = [p + Math.PI, p];
    const arms = [armL, armR];
    for (let i = 0; i < 2; i += 1) {
      const q = armPhase[i];
      const swing = -Math.sin(q);
      const raise = cheer * (2.05 + i * 0.05); // 慶祝：雙手往上舉
      arms[i].shoulder.rotation.x = swing * armA - raise;
      // 手臂略微外張（左手往 -X、右手往 +X）
      arms[i].shoulder.rotation.z = (i === 0 ? -1 : 1) * (0.09 + move * 0.05 + cheer * 0.3);
      arms[i].elbow.rotation.x =
        -(elbowBase + Math.max(0, swing) * elbowA + idle * 0.03) * (1 - cheer * 0.7);
    }

    /* --- 軀幹：兩倍步頻的上下起伏 ＋ 一倍步頻的左右平移 ＋ 骨盆與肩帶反向扭轉 --- */
    const bob = Math.abs(Math.sin(p)) * mix(GAIT.bob, run) * move;
    // 吸氣比吐氣慢 → 把正弦丟進 pow 做不對稱化
    const raw = Math.sin(t * BREATH_OMEGA) * 0.5 + 0.5;
    const breath = (Math.pow(raw, 1.3) * 2 - 1) * idle;
    const shift = Math.sin(t * IDLE_SHIFT_OMEGA) * idle;

    body.position.y = bob + breath * 0.02;
    body.rotation.x = mix(GAIT.lean, run) * move;
    body.rotation.z = -lean + shift * 0.02;

    hips.position.x = Math.sin(p) * mix(GAIT.sway, run) * move + shift * 0.012;
    hips.rotation.y = Math.sin(p) * mix(GAIT.pelvisTwist, run) * move;
    torso.rotation.y = -Math.sin(p) * mix(GAIT.chestTwist, run) * move;
    torso.rotation.x = -cheer * 0.16;
    // 呼吸的階梯延遲：胸口 → 肩膀 → 頭，各慢 0.15 秒
    const breathLag = (Math.pow(Math.sin((t - 0.15) * BREATH_OMEGA) * 0.5 + 0.5, 1.3) * 2 - 1) * idle;
    chest.scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1 + breath * 0.02);
    armL.shoulder.position.y = 0.46 + breathLag * 0.008;
    armR.shoulder.position.y = 0.46 + breathLag * 0.008;

    /* --- 頭：反向抵銷軀幹扭轉、俯仰再用指數平滑低通（走路時視線是穩的） --- */
    neck.rotation.y = -torso.rotation.y * 0.6;
    const pitchTarget = -body.rotation.x * 0.55 + breathLag * 0.015 + cheer * 0.22;
    neck.rotation.x += (pitchTarget - neck.rotation.x) * (1 - Math.exp(-12 * dt));
    head.rotation.z = lean * 0.35;

    /* --- 布料：圍巾尾巴與背包跟著慣性甩 --- */
    scarfTail.rotation.x = -0.12 - move * 0.5 - Math.sin(p * 2 + 0.7) * 0.14 * move - breath * 0.04;
    scarfTail.rotation.z = Math.sin(t * 1.3 + p * 0.5) * (0.08 + move * 0.12);
    satchel.rotation.x = Math.sin(p + 0.9) * 0.13 * move;

    /* --- 提燈：走路時晃、站著時慢慢擺；燈光呼吸 --- */
    lanternPivot.rotation.x = -arms[1].shoulder.rotation.x * 0.75 + Math.sin(p + 0.4) * 0.12 * move;
    lanternPivot.rotation.z = Math.sin(t * 1.1 + p * 0.5) * (0.1 + move * 0.16);
    lanternLight.intensity = 4.8 + Math.sin(t * 3.1) * 0.6 + move * 1.1 + cheer * 2.4;

    /* --- 坐姿：疊在最上面，把既有的姿勢往「坐在凳子上」推 --- */
    if (restAmt > 0.001) {
      const k = restAmt;
      const to = (cur, want) => cur + (want - cur) * k;
      for (const leg of legs) {
        leg.hip.rotation.x = to(leg.hip.rotation.x, -SEAT_HIP);
        leg.hip.rotation.z = to(leg.hip.rotation.z || 0, 0);
        leg.knee.rotation.x = to(leg.knee.rotation.x, SEAT_KNEE);
        leg.ankle.rotation.x = to(leg.ankle.rotation.x, 0.06);
      }
      for (let i = 0; i < 2; i += 1) {
        arms[i].shoulder.rotation.x = to(arms[i].shoulder.rotation.x, -0.32);
        arms[i].elbow.rotation.x = to(arms[i].elbow.rotation.x, -0.86);
      }
      body.position.y = to(body.position.y, body.position.y - SEAT_DROP);
      body.rotation.x = to(body.rotation.x, -0.09);
      hips.rotation.y = to(hips.rotation.y, 0);
      torso.rotation.y = to(torso.rotation.y, 0);
      // 坐著的時候頭抬一點（凳子擺在那裡就是為了看天）
      neck.rotation.x = to(neck.rotation.x, 0.16);
    }

    return cheer;
  }

  return {
    root,
    joints,
    lanternLight,
    lanternPivot,
    /** 過關時的小慶祝（雙手舉起）。重複觸發會重新計時。 */
    celebrate() {
      celebrateT = CELEBRATE_TIME;
      return true;
    },
    get celebrating() {
      return celebrateT > 0;
    },
    /** 坐下 / 站起來（長凳用）。走起來的時候會自動歸零。 */
    rest(v) {
      restTarget = v ? 1 : 0;
      return restTarget === 1;
    },
    /** 目前的坐姿權重（0 = 站著、1 = 坐滿）。測試會看。 */
    get restAmount() {
      return restAmt;
    },
    update,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export default createCharacter;

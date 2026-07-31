/**
 * Promptasy — 指南針（Phase 14）
 *
 * 問題：世界有五片土地、四條橋，玩家常常轉一轉就不知道自己面向哪裡、下一站在哪邊。
 *
 * 做法：HUD 左下角一個圓形羅盤（純 DOM ＋ CSS，沒有任何外部素材）。
 *   · 錶盤跟著鏡頭轉：北／東／南／西 四個刻度隨 cameraYaw 反向旋轉
 *   · 金色指針指向「下一個目標」（＝ HUD 那一行的同一個目標），下面寫還有幾步
 *   · 五個地標各一根很淡的短針（用該區的顏色），走到哪都認得出五片土地在哪邊
 *   · 面板打開時整個收起來（和 HUD 其他元素一致）
 *
 * 方位定義（和世界座標的對應）：
 *   北 = −Z、東 = +X、南 = +Z、西 = −X。
 *   玩家一開場面向 −Z（cameraYaw = π），也就是「面向北方」。
 *
 * 螢幕上的角度數學（順時針、0 度在正上方）：
 *   鏡頭前方 f = (sin yaw, cos yaw)、螢幕右方 r = (−cos yaw, sin yaw)
 *   → 目標方向 d 的螢幕方位角 = atan2(d·r, d·f) = yaw − atan2(dx, dz)
 *   錶盤本身的旋轉量 = yaw − π（讓「北」在 yaw = π 時剛好朝上）。
 */
import { el } from './dom.js';

const DEG = 180 / Math.PI;
/** 一「步」大約走多遠（世界單位）—— 只是給玩家一個體感距離，不是精確值。 */
const STEP = 0.9;

/** 螢幕方位角（度，順時針、0 = 正上方）。 */
export function bearingDeg(yaw, dx, dz) {
  let deg = (yaw - Math.atan2(dx, dz)) * DEG;
  deg %= 360;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return deg;
}

export function createCompass({ world, player, getRegion = () => 'foundations', content = null }) {
  const root = el('div', 'compass');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', '指南針');

  const minors = [45, 135, 225, 315]
    .map((a) => `<i class="compass__minor" style="--a:${a}deg"></i>`)
    .join('');
  // 四個方位：字要一直是正的（跟著錶盤倒過來就沒人看得懂），
  // 所以外框繞著圓心轉、裡面那個字再反轉同樣的角度轉回來。
  const cardinals = [
    ['北', 0],
    ['東', 90],
    ['南', 180],
    ['西', 270],
  ]
    .map(([name, a]) => `<span class="compass__card" data-card="${a}"><i>${name}</i></span>`)
    .join('');

  root.innerHTML = `
    <div class="compass__ring">
      <span class="compass__index" aria-hidden="true"></span>
      <div class="compass__dial" data-dial>${minors}</div>
      <div class="compass__cards" data-cards>${cardinals}</div>
      <div class="compass__marks" data-marks></div>
      <b class="compass__needle" data-needle hidden><span></span></b>
      <span class="compass__hub" aria-hidden="true"></span>
    </div>
    <p class="compass__label"><b data-target></b><span data-dist></span></p>
  `;

  const dialEl = root.querySelector('[data-dial]');
  const marksEl = root.querySelector('[data-marks]');
  const cardEls = Array.from(root.querySelectorAll('[data-card]')).map((node) => ({
    base: Number(node.getAttribute('data-card')),
    node,
    text: node.firstElementChild,
  }));
  const needleEl = root.querySelector('[data-needle]');
  const targetEl = root.querySelector('[data-target]');
  const distEl = root.querySelector('[data-dist]');

  /* 五個地標的淡針：位置是固定的，只有角度每幀在變 */
  const landmarks = (world.landmarks || []).map((l) => {
    const group = content && content.group ? content.group(l.region) : null;
    const node = el('i', 'compass__mark');
    node.style.setProperty('--c', (group && group.color) || 'rgba(169,201,216,0.5)');
    node.title = l.name;
    marksEl.appendChild(node);
    return { spec: l, node };
  });

  let objective = null;
  let sinceScan = 999;
  let visible = true;
  let last = { dialDeg: 0, objectiveDeg: null, distance: 0 };

  function rescan() {
    const next = world.objectiveTarget ? world.objectiveTarget(getRegion()) : null;
    objective = next;
  }

  function update(dt = 0) {
    if (!visible) return;
    sinceScan += dt;
    // 目標很少變（通關 / 跨區才會），每 0.4 秒重算一次就夠
    if (sinceScan > 0.4) {
      sinceScan = 0;
      rescan();
    }

    const yaw = player.cameraYaw;
    const px = player.position.x;
    const pz = player.position.z;

    const dialDeg = (yaw - Math.PI) * DEG;
    dialEl.style.transform = `rotate(${dialDeg.toFixed(2)}deg)`;
    for (const c of cardEls) {
      const deg = dialDeg + c.base;
      c.node.style.transform = `rotate(${deg.toFixed(2)}deg)`;
      c.text.style.transform = `rotate(${(-deg).toFixed(2)}deg)`;
    }

    for (const lm of landmarks) {
      const dx = lm.spec.at[0] - px;
      const dz = lm.spec.at[1] - pz;
      lm.node.style.transform = `rotate(${bearingDeg(yaw, dx, dz).toFixed(2)}deg)`;
    }

    if (objective) {
      const dx = objective.x - px;
      const dz = objective.z - pz;
      const deg = bearingDeg(yaw, dx, dz);
      const distance = Math.hypot(dx, dz);
      needleEl.hidden = false;
      needleEl.style.transform = `rotate(${deg.toFixed(2)}deg)`;
      const steps = Math.max(1, Math.round(distance / STEP));
      targetEl.textContent = objective.name;
      distEl.textContent = `約 ${steps} 步`;
      last = { dialDeg, objectiveDeg: deg, distance };
    } else {
      needleEl.hidden = true;
      targetEl.textContent = '這片世界的事情';
      distEl.textContent = '都做完了';
      last = { dialDeg, objectiveDeg: null, distance: 0 };
    }
  }

  return {
    root,
    update,
    /** 面板打開時收起來（和 HUD 其他元素一致）。 */
    setVisible(v) {
      const next = Boolean(v);
      if (next === visible) return;
      visible = next;
      root.hidden = !next;
    },
    get isVisible() {
      return visible;
    },
    /** 除錯 / 自動化測試用：目前的角度與目標（純讀）。 */
    state() {
      return {
        visible,
        yaw: player.cameraYaw,
        dialDeg: last.dialDeg,
        objective: objective
          ? {
              kind: objective.kind,
              id: objective.id,
              name: objective.name,
              x: objective.x,
              z: objective.z,
              deg: last.objectiveDeg,
              distance: last.distance,
            }
          : null,
        landmarks: landmarks.map((l) => ({ id: l.spec.id, name: l.spec.name })),
      };
    },
    /** 通關 / 解鎖之後強制重算目標（不用等下一次輪詢）。 */
    refresh() {
      sinceScan = 999;
      update(0);
    },
  };
}

export default createCompass;

/**
 * Promptasy — 氛圍狀態（v1.2 · P05）
 *
 * `engine.setMood()` 的單一入口背後那一份狀態：`target` 是要去的地方、`now` 是每幀
 * lerp 過去的當下值。跨區、時辰、（P06）色彩腳本全部寫進同一個 target，
 * 所以永遠只有一套值在管霧色、月亮、星星與極光 —— 不會有兩套在搶。
 *
 * 這一檔不碰 DOM、不碰 renderer：只有 THREE.Color 與數字，node 裡直接可測。
 * 天空的映射函式（density → uniform、alt → 仰角…）也放這裡，校準點寫死在常數裡：
 * **時辰 0（入夜）的因子必須逐值等於沒有時辰之前的畫面**（uOpacity 0.9、uScale 900、
 * 月亮在 (-40,60,30) 那條方向上、disc 34／halo 170 & 0.5、極光乘數 1）。
 */
import * as THREE from 'three';

/** 入夜（hour 0）的天空值 —— 引擎開機的預設，也是所有映射的校準點。 */
export const SKY_HOUR0 = Object.freeze({
  moonAlt: 0.75,
  moonPhase: 0.3,
  starDensity: 0.7,
  auroraIntensity: 0.5,
  auroraHue: 0,
});

/**
 * v1.2 · P06：天空穹頂的全域基準色（＝ engine.js 的 PALETTE.sky／skyLow）。
 * 色彩腳本給的 `sky.top/low` 是**目標色**；穹頂 shader 用「目標 ÷ 基準」當乘數套在原本的
 * SKY_STOPS 漸層貼圖上 —— foundations（top/low ＝ 基準）乘數逐位元 ＝ 1，畫面與 P06 之前完全相同。
 */
export const SKY_BASE_TOP = 0x101a28;
export const SKY_BASE_LOW = 0x33465c;

/** 目標色 ÷ 基準色 → 每通道乘數，寫進 out（不配置）。基準為 0 的通道乘數 1。 */
export function skyMultiplier(target, base, out) {
  out.r = base.r > 0 ? target.r / base.r : 1;
  out.g = base.g > 0 ? target.g / base.g : 1;
  out.b = base.b > 0 ? target.b / base.b : 1;
  return out;
}

/** 兩段線性：[0,knot]→[lo,mid]、[knot,1]→[mid,hi]；t 落在 knot 時**逐位元**回 mid。 */
export function knotLerp(t, knot, lo, mid, hi) {
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : knot;
  if (x === knot) return mid;
  if (x < knot) {
    const u = x / knot;
    return lo * (1 - u) + mid * u;
  }
  const u = (x - knot) / (1 - knot);
  return mid * (1 - u) + hi * u;
}

/* --- 星星：density → uOpacity / uScale（0.7 ↔ 現值 0.9 / 900） --- */
export function starOpacity(density) {
  return knotLerp(density, SKY_HOUR0.starDensity, 0.55, 0.9, 1.0);
}
export function starScale(density) {
  return knotLerp(density, SKY_HOUR0.starDensity, 0.85, 1.0, 1.1) * 900;
}

/* --- 月亮：alt → 仰角（弧度）。0 ≈ 8°（仍在地平線上，陰影相機照顧得到）、0.75 ↔ 現在的方向、1 → 60°。 --- */
export const MOON_DIR_HOUR0 = Object.freeze([-40, 60, 30]);
const MOON_LEN = Math.hypot(...MOON_DIR_HOUR0);
/** 現在那條方向的仰角（弧度）——校準點，alt 0.75 就回它。 */
export const MOON_ELEV_HOUR0 = Math.asin(MOON_DIR_HOUR0[1] / MOON_LEN);
export const MOON_ELEV_LOW = (8 * Math.PI) / 180;
export const MOON_ELEV_HIGH = (60 * Math.PI) / 180;
/** 方位角（xz 平面）固定：月亮只沿同一條弧升降。 */
export const MOON_AZIMUTH = Object.freeze([
  MOON_DIR_HOUR0[0] / Math.hypot(MOON_DIR_HOUR0[0], MOON_DIR_HOUR0[2]),
  MOON_DIR_HOUR0[2] / Math.hypot(MOON_DIR_HOUR0[0], MOON_DIR_HOUR0[2]),
]);
export function moonElevation(alt) {
  return knotLerp(alt, SKY_HOUR0.moonAlt, MOON_ELEV_LOW, MOON_ELEV_HOUR0, MOON_ELEV_HIGH);
}
/** 把 alt 對應的單位方向寫進 out（不配置）。 */
export function moonDirection(alt, out) {
  return elevationDirection(moonElevation(alt), out);
}
/** 給定仰角（弧度）→ 沿同一條弧（方位固定）的單位方向，寫進 out（不配置）。 */
export function elevationDirection(el, out) {
  const c = Math.cos(el);
  out.set(MOON_AZIMUTH[0] * c, Math.sin(el), MOON_AZIMUTH[1] * c);
  return out;
}

/* --- 月光（投影的 DirectionalLight）：sprite 群一路跟著 alt 落到 8°，但打光／投影的仰角**下限 22°**
 *     （太貼地的平行光會把長影子拉出陰影相機、地形自遮蔽變成一片 acne）。alt .75 的 50.2° 高於下限 → hour 0 逐位元不變。 --- */
export const MOON_LIGHT_ELEV_FLOOR = (22 * Math.PI) / 180;
/** 月光的仰角：max(月亮仰角, 22°)。 */
export function moonLightElevation(alt) {
  return Math.max(moonElevation(alt), MOON_LIGHT_ELEV_FLOOR);
}
/** 月光的單位方向（仰角有下限），寫進 out（不配置）。 */
export function moonLightDirection(alt, out) {
  return elevationDirection(moonLightElevation(alt), out);
}
/**
 * shadow.bias 隨月光仰角溫和放大：bias = base × min(3, sin(仰角0) / sin(仰角))
 * （仰角0 ＝ hour 0 的 50.2°；仰角越低、投影越斜、需要的 bias 越大；夾在 3 倍內）。仰角0 時逐位元回 base。
 */
export const MOON_SHADOW_BIAS_MAX_MUL = 3;
export function moonShadowBias(base, elev) {
  const mul = Math.min(MOON_SHADOW_BIAS_MAX_MUL, Math.sin(MOON_ELEV_HOUR0) / Math.sin(Math.max(elev, 1e-3)));
  return mul === 1 ? base : base * mul;
}

/* --- 月相：phase → disc / halo 的 scale 與 opacity 交叉（0.3 ↔ 現值 disc 34・1.0、halo 170・0.5）。 --- */
export function moonPhaseLook(phase, out) {
  out.discScale = knotLerp(phase, SKY_HOUR0.moonPhase, 26, 34, 40);
  out.discOpacity = knotLerp(phase, SKY_HOUR0.moonPhase, 0.62, 1.0, 1.0);
  out.haloScale = knotLerp(phase, SKY_HOUR0.moonPhase, 130, 170, 205);
  out.haloOpacity = knotLerp(phase, SKY_HOUR0.moonPhase, 0.3, 0.5, 0.72);
  return out;
}

/* --- 極光：intensity → 各 band 基礎 opacity 的乘數（0.5 ↔ 1.0）；hue → 材質色從白往紫（+）／綠（−）lerp。 --- */
export function auroraOpacityMul(intensity) {
  return knotLerp(intensity, SKY_HOUR0.auroraIntensity, 0.35, 1.0, 1.5);
}
export const AURORA_TINT_PLUS = 0xd2b8ff; // 偏紫（星最亮之夜）
export const AURORA_TINT_MINUS = 0xb8ffc8; // 偏綠

/** 建立一份氛圍狀態（target / now ＋ set / step）。 */
export function createMoodState({ fog, tint, hemi, fogNear, fogFar, exposure, skyTop, skyLow } = {}) {
  const target = {
    fog: new THREE.Color(fog ?? 0x1e2c40),
    tint: new THREE.Color(tint ?? 0xbcd6e6),
    skyTop: new THREE.Color(skyTop ?? SKY_BASE_TOP),
    skyLow: new THREE.Color(skyLow ?? SKY_BASE_LOW),
    hemi: hemi ?? 0.52,
    fogNear: fogNear ?? 62,
    fogFar: fogFar ?? 285,
    exposure: exposure ?? 1.02,
    moonAlt: SKY_HOUR0.moonAlt,
    moonPhase: SKY_HOUR0.moonPhase,
    starDensity: SKY_HOUR0.starDensity,
    auroraIntensity: SKY_HOUR0.auroraIntensity,
    auroraHue: SKY_HOUR0.auroraHue,
  };
  const now = {
    fog: target.fog.clone(),
    tint: target.tint.clone(),
    skyTop: target.skyTop.clone(),
    skyLow: target.skyLow.clone(),
    hemi: target.hemi,
    fogNear: target.fogNear,
    fogFar: target.fogFar,
    exposure: target.exposure,
    moonAlt: target.moonAlt,
    moonPhase: target.moonPhase,
    starDensity: target.starDensity,
    auroraIntensity: target.auroraIntensity,
    auroraHue: target.auroraHue,
  };
  const SKY_KEYS = ['moonAlt', 'moonPhase', 'starDensity', 'auroraIntensity', 'auroraHue'];
  const SKY_COLOR_KEYS = ['skyTop', 'skyLow'];
  const num = (v) => (Number.isFinite(v) ? v : null);
  const unit = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

  return {
    target,
    now,
    /**
     * @param {{fog?:*, tint?:*, hemi?:number, fogNear?:number, fogFar?:number, exposure?:number,
     *   moon?:{alt?:number, phase?:number}, stars?:{density?:number}, aurora?:{intensity?:number, hue?:number},
     *   sky?:{top?:*, low?:*}}} mood
     */
    set(mood = {}) {
      if (mood.fog != null) target.fog.set(mood.fog);
      if (mood.tint != null) target.tint.set(mood.tint);
      if (mood.sky) {
        if (mood.sky.top != null) target.skyTop.set(mood.sky.top);
        if (mood.sky.low != null) target.skyLow.set(mood.sky.low);
      }
      if (num(mood.hemi) != null) target.hemi = mood.hemi;
      if (num(mood.fogNear) != null) target.fogNear = mood.fogNear;
      if (num(mood.fogFar) != null) target.fogFar = mood.fogFar;
      if (num(mood.exposure) != null) target.exposure = mood.exposure;
      if (mood.moon) {
        const alt = unit(mood.moon.alt);
        const phase = unit(mood.moon.phase);
        if (alt != null) target.moonAlt = alt;
        if (phase != null) target.moonPhase = phase;
      }
      if (mood.stars) {
        const d = unit(mood.stars.density);
        if (d != null) target.starDensity = d;
      }
      if (mood.aurora) {
        const i = unit(mood.aurora.intensity);
        if (i != null) target.auroraIntensity = i;
        if (Number.isFinite(mood.aurora.hue)) target.auroraHue = Math.min(1, Math.max(-1, mood.aurora.hue));
      }
    },
    /**
     * 每幀：now 往 target lerp 一步（k 已由呼叫端算好、夾在 0..1）。
     * 回傳「天空那幾個值這一幀有沒有在動」，讓引擎在靜止時不必重寫 uniform／sprite。
     */
    step(k) {
      now.fog.lerp(target.fog, k);
      now.tint.lerp(target.tint, k);
      now.hemi += (target.hemi - now.hemi) * k;
      now.fogNear += (target.fogNear - now.fogNear) * k;
      now.fogFar += (target.fogFar - now.fogFar) * k;
      now.exposure += (target.exposure - now.exposure) * k;
      let skyMoving = false;
      // 穹頂兩色（P06）：不相等就 lerp；靠得夠近就貼上去（避免永遠差 1e-17 而每幀重寫 uniform）
      for (let i = 0; i < SKY_COLOR_KEYS.length; i += 1) {
        const key = SKY_COLOR_KEYS[i];
        const a = now[key];
        const b = target[key];
        if (a.r !== b.r || a.g !== b.g || a.b !== b.b) {
          skyMoving = true;
          if (Math.abs(a.r - b.r) < 1e-4 && Math.abs(a.g - b.g) < 1e-4 && Math.abs(a.b - b.b) < 1e-4) a.copy(b);
          else a.lerp(b, k);
        }
      }
      for (let i = 0; i < SKY_KEYS.length; i += 1) {
        const key = SKY_KEYS[i];
        const d = target[key] - now[key];
        if (d !== 0) {
          skyMoving = true;
          // 靠得夠近就貼上去（避免永遠差 1e-17 而每幀重寫）
          now[key] = Math.abs(d) < 1e-5 ? target[key] : now[key] + d * k;
        }
      }
      return skyMoving;
    },
    /** 純讀的快照（測試／除錯用；會配置，別在每幀呼叫）。 */
    snapshot() {
      return {
        target: {
          fog: target.fog.getHex(),
          tint: target.tint.getHex(),
          hemi: target.hemi,
          fogNear: target.fogNear,
          fogFar: target.fogFar,
          exposure: target.exposure,
          moon: { alt: target.moonAlt, phase: target.moonPhase },
          stars: { density: target.starDensity },
          aurora: { intensity: target.auroraIntensity, hue: target.auroraHue },
          sky: { top: target.skyTop.getHex(), low: target.skyLow.getHex() },
        },
        now: {
          fog: now.fog.getHex(),
          tint: now.tint.getHex(),
          hemi: now.hemi,
          fogNear: now.fogNear,
          fogFar: now.fogFar,
          exposure: now.exposure,
          moon: { alt: now.moonAlt, phase: now.moonPhase },
          stars: { density: now.starDensity },
          aurora: { intensity: now.auroraIntensity, hue: now.auroraHue },
          sky: { top: now.skyTop.getHex(), low: now.skyLow.getHex() },
        },
      };
    },
  };
}

export default createMoodState;

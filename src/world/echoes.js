/**
 * Promptasy — 回聲重演（Echo replay，v1.2 · P20a）
 *
 * 每片土地一處：一團**坐著的光**，坐在一處小景旁邊。走過去按 `E`，
 * 4–6 秒的 rigless 殘影會在**那一處小景的範圍內**把當年發生的事重演一次，
 * 演完就散掉，那團光留在原地。
 *
 * 世界觀上它是誰：**回聲**（WORLD §1.2）——神諭留在世界上的一點餘響。
 * 它記得每個人的第一句話，所以它也記得這裡發生過什麼。
 * 它不解釋、不催促，只把那一幕再放一次。
 *
 * 四條硬規則（都在 `test:rubric` 裡逐條量）：
 *   1. **零光源**（護欄：光源固定 37 盞）。這一層一顆 `THREE.*Light` 都沒有：
 *      光是自發光／加色混合的材質與一片 sprite，照不亮任何東西。
 *   2. **零碰撞**。每一塊都 `userData.noCollide = true`，不登記 `solidRadius`、
 *      不 `keepSolid` —— 一團光與一群殘影本來就擋不住人（也因此不必進碰撞稽核）。
 *   3. **殘影不准離開小景 `ECHO_STAGE_R` 公尺**。`path` 的座標是**相對於小景中心**
 *      的偏移，而兩個航點之間走的是直線 —— 直線是凸組合，所以只要每一個航點都在
 *      圈內，整段路就在圈內（資料層驗航點、`test:rubric` 再逐幀量一次真的走出來的位置）。
 *   4. **`prefers-reduced-motion` 直接給結果**：殘影一出現就站在最後一個航點上，
 *      不走、不搖、不蹲 —— 關掉的是「動」，不是「回應」（透明度照樣淡入淡出）。
 *      低畫質整層不蓋（`world.js` 那一邊直接不建這個場）。
 *
 * 場景圖命名 `echo:<id>`；子件：
 *   · `seat` 坐著的那一團光（`core` 自發光球 ＋ `glow` sprite ＋ `mark` 腳下的環）
 *   · `cast` 殘影那一組（掛在**小景中心**上，不是掛在光上 —— 兩者可以隔幾公尺）
 *
 * 每幀迴圈照 `watchmen.js` 那一套：平方距離、45 公尺外整組跳過、
 * 15 公尺外每 3 幀一次（index 錯開）、**零每幀配置**（tick 裡不 new、不 map/filter、不建閉包）。
 */
import * as THREE from 'three';
import { makeGlowTexture } from '../engine/engine.js';

/**
 * 回聲的互動半徑（公尺）。
 *
 * **3.2 —— 與器物、捷徑絞盤同一階**，而且它排在仲裁的**最後面**
 * （石座 > 濁靈 > 守夜人 > 守門者 > 石碑 > 刻文小語 > 殘頁 > 器物 > 機關 > **回聲** > 閘門）。
 * 理由與守門者那一條相反但同源（WORLD §3.2「半徑跟著仲裁順序遞減」）：
 * 它排在最後，所以半徑必須是最小的那一階 —— 它永遠不該蓋掉別的東西。
 * 真正要守的東西另外量：站在它的互動圈上，24 個方向裡要有夠多個
 * 「站得住、而且是它贏」（`ECHO_WINNABLE_MIN`，`test:rubric` 逐點掃）。
 */
export const ECHO_RADIUS = 3.2;
/** 走到這麼近，那團光會亮起來（idle → aware）。 */
export const ECHO_AWARE_RADIUS = 8;
/** 殘影不准離開小景中心這麼遠（公尺）。 */
export const ECHO_STAGE_R = 6;
/** 一場重演幾秒（資料層的 `seconds` 只准落在這中間）。 */
export const ECHO_SECONDS_MIN = 4;
export const ECHO_SECONDS_MAX = 6;
/** 殘影淡入／淡出各多久（秒）—— 透明度是「回應」，`reducedMotion` 之下照樣有。 */
const FADE_IN = 0.5;
const FADE_OUT = 0.8;
/** 殘影最亮的時候有多亮。 */
const CAST_OPACITY = 0.5;
/** 資料層的 `act` 只認得這四種。 */
export const ECHO_ACTS = Object.freeze(['walk', 'kneel', 'stand', 'sway']);

/** 45 公尺外整組跳過（平方比較）。 */
const FAR_SQ = 45 * 45;
/** 15 公尺外降頻更新（每 3 幀一次，用 index 錯開）。 */
const NEAR_SQ = 15 * 15;
const AWARE_SQ = ECHO_AWARE_RADIUS * ECHO_AWARE_RADIUS;

/* ------------------------------------------------------------------ *
 * 幾何體快取（材質逐處各自一份 —— 透明度是每一處自己的狀態）
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
let glowTex = null;
function glowTexture() {
  if (!glowTex) glowTex = makeGlowTexture('rgba(214,236,255,1)', 'rgba(120,170,220,0)', 0.34);
  return glowTex;
}

/** 釋放快取（重建世界時呼叫；材質逐處掛在自己的 group 上，隨場景一起釋放）。 */
export function disposeEchoCache() {
  for (const v of GEO.values()) v.dispose();
  GEO.clear();
  if (glowTex) {
    glowTex.dispose();
    glowTex = null;
  }
}

const ico = (r, d) => g(`ico:${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ring = (ri, ro, s) => g(`ring:${ri},${ro},${s}`, () => new THREE.RingGeometry(ri, ro, s));
const cone = (r, h, s) => g(`cone:${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

/** 加色混合的自發光片：這一層唯一的材質種類（照不亮任何東西 ＝ 零光源）。 */
function lightMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** 平滑（0→1）。 */
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * 蓋出一處回聲。
 *
 * 三角形預算：那團光（核 20 ＋ 環 24 ＋ sprite 2 ＝ 46）
 * ＋ 每個殘影（身 12 ＋ 頭 20 ＋ 腳下的痕 20 ＝ 52）。
 * 12 處 × (46 ＋ 2 個殘影 × 52) ＝ **1,800**。
 *
 * @param {object} entry echoes.json 的一筆
 * @param {object} kit   區域色盤（kitFor()）
 * @param {(x:number,z:number)=>number} terrainHeight
 * @param {{at:number[], rot:number}} stage 那一處小景（中心與朝向）
 */
export function buildEcho(entry, kit, terrainHeight, stage) {
  const [x, z] = entry.at;
  const y = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.name = `echo:${entry.id}`;
  grp.position.set(x, y, z);

  /* --- 坐著的那一團光 --- */
  const seat = new THREE.Group();
  seat.name = 'seat';
  const coreMat = lightMat(kit.light, 0.42);
  const core = new THREE.Mesh(ico(0.24, 0), coreMat);
  core.name = 'core';
  core.position.y = 0.52;
  core.scale.set(1, 1.25, 1);
  core.userData.noCollide = true;
  seat.add(core);

  const markMat = lightMat(kit.light, 0.12);
  const mark = new THREE.Mesh(ring(0.58, 0.74, 12), markMat);
  mark.name = 'mark';
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.05;
  mark.userData.noCollide = true;
  seat.add(mark);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: kit.light,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.name = 'glow';
  glow.position.y = 0.56;
  glow.scale.set(2.6, 2.6, 1);
  glow.userData.noCollide = true;
  seat.add(glow);
  grp.add(seat);

  /* --- 殘影那一組：掛在**小景中心**上（可以離那團光好幾公尺） --- */
  const stageAt = (stage && stage.at) || entry.at;
  const rot = stage && Number.isFinite(stage.rot) ? stage.rot : 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const cast = new THREE.Group();
  cast.name = 'cast';
  cast.position.set(stageAt[0] - x, 0, stageAt[1] - z);
  cast.visible = false;
  grp.add(cast);

  const castMat = lightMat(kit.light, 0);
  const figures = [];
  for (const spec of entry.figures || []) {
    const fig = new THREE.Group();
    fig.name = 'figure';
    const body = new THREE.Mesh(cone(0.3, 1.05, 6), castMat);
    body.name = 'body';
    body.position.y = 0.56;
    body.userData.noCollide = true;
    fig.add(body);
    const head = new THREE.Mesh(ico(0.16, 0), castMat);
    head.name = 'head';
    head.position.y = 1.24;
    head.userData.noCollide = true;
    fig.add(head);
    const trace = new THREE.Mesh(ring(0.3, 0.46, 10), castMat);
    trace.name = 'trace';
    trace.rotation.x = -Math.PI / 2;
    trace.position.y = 0.04;
    trace.userData.noCollide = true;
    fig.add(trace);
    cast.add(fig);

    /*
     * 航點先在這裡轉好（跟著小景自己的 `rot`），之後每幀只做線性內插 ——
     * `cast` 本身不轉，殘影的世界座標就是「小景中心 ＋ 這一組偏移」，
     * 「不准離開小景 N 公尺」量起來只有一個減法。
     */
    const xs = [];
    const zs = [];
    for (const p of spec.path || []) {
      xs.push(p[0] * cosR + p[1] * sinR);
      zs.push(-p[0] * sinR + p[1] * cosR);
    }
    if (!xs.length) {
      xs.push(0);
      zs.push(0);
    }
    figures.push({
      group: fig,
      body,
      act: ECHO_ACTS.includes(spec.act) ? spec.act : 'stand',
      xs,
      zs,
      segments: xs.length - 1,
    });
  }

  return {
    id: entry.id,
    entry,
    group: grp,
    seat,
    core,
    coreMat,
    mark,
    markMat,
    glow,
    glowMat,
    cast,
    castMat,
    figures,
    x,
    z,
    y,
    /** 小景中心的世界座標（重演的舞台）。 */
    stageX: stageAt[0],
    stageZ: stageAt[1],
    seconds: Number.isFinite(entry.seconds) ? entry.seconds : ECHO_SECONDS_MIN,
    /** 是不是「玩家附近可互動的那一處」（nearest 更新）。 */
    near: false,
    awareAmt: 0,
    setNear(v) {
      this.near = Boolean(v);
    },
  };
}

/**
 * 建立整個回聲場。
 *
 * @param {object} opts
 * @param {Array} opts.entries                    echoes.json 的 entries
 * @param {(regionId:string)=>object} opts.kitOf
 * @param {(x:number,z:number)=>number} opts.terrainHeight
 * @param {(entry:object)=>({at:number[],rot:number}|null)} opts.stageOf 那一處小景在哪、朝哪
 * @param {()=>boolean} [opts.isBusy]             面板打開時那團光不呼吸
 * @param {boolean} [opts.reducedMotion]          直接給結果（不播過程）
 * @param {(entry:object)=>void} [opts.onFinish]  演完那一拍（主程式用來說最後一句）
 */
export function createEchoField({
  entries = [],
  kitOf,
  terrainHeight,
  stageOf = null,
  isBusy = null,
  reducedMotion = false,
  onFinish = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'echoes';
  const echoes = [];
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.at)) continue;
    const stage = (stageOf && stageOf(entry)) || { at: entry.at, rot: 0 };
    const built = buildEcho(entry, kitOf(entry.region), terrainHeight, stage);
    group.add(built.group);
    echoes.push(built);
  }
  const byId = new Map(echoes.map((e) => [e.id, e]));
  /** `prefers-reduced-motion`：位移整個關掉（只留終態）。 */
  const kinetic = reducedMotion ? 0 : 1;
  let frame = 0;
  /** 同一時間只演一場。 */
  let active = null;
  let elapsed = 0;
  /** 這一場離小景中心最遠的那一刻（公尺）—— 診斷與測試都讀它。 */
  let worstReach = 0;

  function placeFigures(e, progress, t) {
    for (let i = 0; i < e.figures.length; i += 1) {
      const f = e.figures[i];
      let rx;
      let rz;
      let dirX = 0;
      let dirZ = 0;
      if (kinetic === 0 || f.segments <= 0) {
        // reducedMotion：直接站在最後一個航點上（＝ 結果本身）
        const last = kinetic === 0 ? f.segments : 0;
        rx = f.xs[last];
        rz = f.zs[last];
      } else {
        const u = smooth(progress) * f.segments;
        const seg = Math.min(f.segments - 1, Math.floor(u));
        const frac = u - seg;
        const ax = f.xs[seg];
        const az = f.zs[seg];
        const bx = f.xs[seg + 1];
        const bz = f.zs[seg + 1];
        rx = ax + (bx - ax) * frac;
        rz = az + (bz - az) * frac;
        dirX = bx - ax;
        dirZ = bz - az;
      }
      const wx = e.stageX + rx;
      const wz = e.stageZ + rz;
      // 逐個殘影取**自己腳下**的地面高度（散開超過 2 公尺就不能只在中心量一次）
      const foot = terrainHeight(wx, wz) - e.y;
      let bob = 0;
      let lean = 0;
      let squat = 1;
      if (kinetic !== 0) {
        if (f.act === 'walk') bob = Math.sin(elapsed * 7.4 + i) * 0.045;
        else if (f.act === 'stand') bob = Math.sin(t * 0.9 + i) * 0.022;
        else if (f.act === 'sway') lean = Math.sin(elapsed * 2.2 + i * 1.3) * 0.1;
        else if (f.act === 'kneel') squat = 1 - 0.38 * smooth((progress - 0.6) / 0.4);
      }
      f.group.position.set(rx, foot + bob, rz);
      f.group.rotation.z = lean;
      f.group.scale.set(1, squat, 1);
      // 朝向：走的時候面向前進方向，站著的時候面向那團光（＝ 面向看的人）
      if (dirX !== 0 || dirZ !== 0) f.group.rotation.y = Math.atan2(dirX, dirZ);
      else f.group.rotation.y = Math.atan2(e.x - wx, e.z - wz);
      const reach = Math.hypot(rx, rz);
      if (reach > worstReach) worstReach = reach;
    }
  }

  const api = {
    group,
    echoes,
    get count() {
      return echoes.length;
    },
    /** 現在正在演的是哪一處（沒有就 null）。 */
    get playing() {
      return active ? active.id : null;
    },
    /** 這一場（或上一場）殘影離小景中心最遠走到幾公尺。 */
    get reach() {
      return worstReach;
    },
    byId(id) {
      return byId.get(id) || null;
    },

    /**
     * 開演。已經在演、或那一處沒有殘影可演 → 回 `null`（**先確認新目標真的有東西可做**，
     * 再去動任何狀態 —— P09 的教訓）。
     * @param {string} id
     */
    play(id) {
      const e = byId.get(id);
      if (!e || !e.figures.length || active) return null;
      active = e;
      elapsed = 0;
      worstReach = 0;
      e.cast.visible = true;
      e.castMat.opacity = 0;
      placeFigures(e, 0, 0);
      return e.entry;
    },

    /** 收乾淨（重置進度／切畫質／演完都走這一支）。 */
    stop() {
      if (!active) return false;
      active.cast.visible = false;
      active.castMat.opacity = 0;
      active = null;
      elapsed = 0;
      return true;
    },
    reset() {
      return api.stop();
    },

    /**
     * 玩家附近可互動的那一處（順便更新「走近」的視覺狀態）。
     * 排名式與器物／濁靈／守夜人同一套：`分數 = 距離 × (1 − 0.35 × 面向點積)`。
     */
    nearest(position, maxDistance = ECHO_RADIUS, forward = null) {
      let best = null;
      let bestDist = maxDistance;
      let bestScore = Infinity;
      for (let i = 0; i < echoes.length; i += 1) {
        const e = echoes[i];
        const dx = e.x - position.x;
        const dz = e.z - position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= maxDistance) continue;
        let score = d;
        if (forward && d > 0.05) {
          const dot = (dx / d) * forward.x + (dz / d) * forward.z;
          score = d * (1 - 0.35 * dot);
        }
        if (score < bestScore) {
          bestScore = score;
          bestDist = d;
          best = e;
        }
      }
      for (let i = 0; i < echoes.length; i += 1) echoes[i].setNear(echoes[i] === best);
      return best ? { echo: best, distance: bestDist } : null;
    },

    /**
     * 每幀更新。**零每幀配置**：這裡不 new、不 map/filter、不建閉包。
     */
    update(dt, t, px, pz) {
      frame += 1;
      const busy = isBusy ? isBusy() : false;
      const k = Math.min(1, dt * 3);
      for (let i = 0; i < echoes.length; i += 1) {
        const e = echoes[i];
        const dx = px - e.x;
        const dz = pz - e.z;
        const d2 = dx * dx + dz * dz;
        if (e !== active) {
          /*
           * 45 公尺外**整組連畫都不畫**（不只是不更新）。
           *
           * 這一層每一塊都是加色混合的透明片 ——「畫」比「算」貴得多，
           * 而軟體渲染下更是如此。12 團光散在整張地圖上，任何一個時間點
           * 玩家看得到的最多一兩團；其餘的留在場景圖裡但 `visible = false`，
           * 三角形與碰撞體的數字一格都不動（稽核走的是場景圖，不看 visible）。
           */
          const far = d2 > FAR_SQ;
          e.group.visible = !far;
          if (far) continue;
          if (d2 > NEAR_SQ && (i + frame) % 3 !== 0) continue;
        } else if (!e.group.visible) {
          // 正在演的那一處永遠畫（玩家可能一邊看一邊走遠）
          e.group.visible = true;
        }
        const aware = !busy && d2 < AWARE_SQ;
        e.awareAmt += ((aware ? 1 : 0) - e.awareAmt) * k;
        // 呼吸：只有那一團光很輕地起伏（reducedMotion → kinetic 0，整個停掉）
        const breathe = Math.sin(t * 0.8 + i * 1.9) * 0.05 * kinetic;
        e.core.scale.set(1 + breathe, 1.25 + breathe, 1 + breathe);
        // 亮起來是「回應」，不是「動」—— reducedMotion 一樣亮
        e.coreMat.opacity = 0.34 + e.awareAmt * 0.24 + (e.near ? 0.1 : 0);
        e.glowMat.opacity = 0.16 + e.awareAmt * 0.14 + (e.near ? 0.08 : 0);
        e.markMat.opacity = 0.1 + e.awareAmt * 0.14 + (e.near ? 0.1 : 0);
      }

      if (!active) return;
      elapsed += dt;
      const total = active.seconds;
      const progress = Math.min(1, elapsed / total);
      placeFigures(active, progress, t);
      /*
       * 透明度：淡入 → 亮著 → 淡出。三段都是「回應」，`reducedMotion` 照樣走
       * （關掉的是位移）。演完之後把那一組收起來，並且把最後一句交給主程式。
       */
      let alpha = CAST_OPACITY;
      if (elapsed < FADE_IN) alpha = CAST_OPACITY * (elapsed / FADE_IN);
      else if (elapsed > total - FADE_OUT) alpha = CAST_OPACITY * Math.max(0, (total - elapsed) / FADE_OUT);
      active.castMat.opacity = alpha;
      if (elapsed >= total) {
        const done = active.entry;
        api.stop();
        if (onFinish) onFinish(done);
      }
    },
  };
  return api;
}

export default {
  ECHO_RADIUS,
  ECHO_AWARE_RADIUS,
  ECHO_STAGE_R,
  ECHO_SECONDS_MIN,
  ECHO_SECONDS_MAX,
  ECHO_ACTS,
  buildEcho,
  createEchoField,
  disposeEchoCache,
};

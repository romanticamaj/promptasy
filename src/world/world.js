/**
 * Promptasy — 世界：五片土地、連接橋、關卡石座、區域閘門、氛圍粒子
 *
 * 全部用 three.js 幾何體程序化生成（本期不下載任何外部模型），
 * 靠打光 / 霧 / 配色 / 後製做出「看起來很貴」的畫面。
 *
 * 地圖：中央「撰寫基本功」高原，四條橋往外接到四片各有調性的土地。
 *   reasoning（示範與推理）  西北 · 階梯迴廊
 *   grounding（脈絡與長文）  東北 · 沉書檔案庫
 *   orchestration（流程與代理）西南 · 齒輪工坊
 *   config（角色與參數）     東南 · 面具劇場
 */
import * as THREE from 'three';
import { PALETTE } from '../engine/engine.js';
import {
  LORE_TABLETS,
  STORY_VIGNETTES,
  LANDMARKS,
  kitFor,
  buildVignettes,
  buildLandmark,
  buildTablet,
  buildPathNetwork,
  pathInfluence,
} from './props.js';
import { buildInscription, INSCRIPTION_RADIUS } from './inscriptions.js';
import { createReactiveField, REACTIVE_SPOTS } from './reactive.js';
import { createHandleField, HANDLE_RADIUS } from './handles.js';

/** 每片土地：中心、半徑、內圈（完全平坦的核心）。 */
export const REGION_SITES = Object.freeze([
  { id: 'foundations', x: 0, z: 0, radius: 62, flat: 50 },
  { id: 'reasoning', x: -95, z: -95, radius: 46, flat: 34 },
  { id: 'grounding', x: 95, z: -95, radius: 46, flat: 34 },
  { id: 'orchestration', x: -95, z: 95, radius: 46, flat: 34 },
  { id: 'config', x: 95, z: 95, radius: 46, flat: 34 },
]);

const SITE_BY_ID = new Map(REGION_SITES.map((s) => [s.id, s]));
const HUB = REGION_SITES[0];

/** 連接橋：從中央高原通往每片土地，中段有一道閘門。 */
export const CORRIDORS = Object.freeze(
  REGION_SITES.slice(1).map((site) => {
    const dx = site.x - HUB.x;
    const dz = site.z - HUB.z;
    const len = Math.hypot(dx, dz);
    const dir = { x: dx / len, z: dz / len };
    const gateAt = (HUB.radius + (len - site.radius)) / 2; // 橋的正中央
    return {
      region: site.id,
      from: { x: HUB.x, z: HUB.z },
      to: { x: site.x, z: site.z },
      dir,
      length: len,
      half: 9,
      flat: 5,
      gateAt,
      gate: { x: HUB.x + dir.x * gateAt, z: HUB.z + dir.z * gateAt },
    };
  })
);

/** 地圖最外緣（給地形平面與相機用）。 */
export const WORLD_RADIUS = 150;

/**
 * 橋面的「主動線」：從中央高原的邊緣到各片土地的邊緣。
 * 這一段的中央走廊永遠不放碰撞體 —— 過橋是唯一的必經之路，不能被石頭堵住。
 */
export const BRIDGE_LANES = Object.freeze(
  CORRIDORS.map((c) => {
    const site = REGION_SITES.find((s) => s.id === c.region);
    const a = HUB.radius - 8;
    const b = c.length - site.radius + 8;
    return Object.freeze({
      region: c.region,
      ax: c.from.x + c.dir.x * a,
      az: c.from.z + c.dir.z * a,
      bx: c.from.x + c.dir.x * b,
      bz: c.from.z + c.dir.z * b,
    });
  })
);

/** 主動線的淨空半寬（公尺）。 */
export const LANE_HALF = 3.2;
/** 石座周圍的淨空半徑：走得到、繞得過去、按得到 E。 */
export const PEDESTAL_CLEAR = 5.6;
/** 出生點的淨空半徑。 */
export const SPAWN_CLEAR = 7;

/**
 * 每片土地的「氣氛設定」——跨區時引擎會把霧色 / 色偏 / 環境光平滑漂移過去，
 * 讓「走過一座橋」變成一件有感覺的事，而不只是換座標。
 *
 * fog   霧色（也決定天空底色）
 * tint  後製的整體色偏
 * hemi  半球環境光強度（越低越沉、越高越開闊）
 * motes 螢火密度倍率
 */
export const REGION_ATMOSPHERE = Object.freeze({
  foundations: Object.freeze({
    fog: 0x1e2c40,
    tint: 0xbcd6e6,
    hemi: 0.52,
    fogNear: 62,
    fogFar: 285,
    exposure: 1.02,
    motes: 1.0,
  }),
  // 階梯迴廊：空氣稀薄、看得遠、偏冷紫
  reasoning: Object.freeze({
    fog: 0x232a48,
    tint: 0xc6c2ee,
    hemi: 0.6,
    fogNear: 74,
    fogFar: 320,
    exposure: 1.08,
    motes: 0.95,
  }),
  // 沉書檔案庫：霧最濃、最暗、暖褐調的紙塵
  grounding: Object.freeze({
    fog: 0x2a2b33,
    tint: 0xe4d3b8,
    hemi: 0.42,
    fogNear: 40,
    fogFar: 210,
    exposure: 0.96,
    motes: 1.35,
  }),
  // 齒輪工坊：低沉的鐵青，光被機械擋住
  orchestration: Object.freeze({
    fog: 0x1a2b2e,
    tint: 0xa7d2cd,
    hemi: 0.46,
    fogNear: 52,
    fogFar: 250,
    exposure: 1.0,
    motes: 0.7,
  }),
  // 面具劇場：最暖、最開闊，像舞台燈亮著
  config: Object.freeze({
    fog: 0x33253a,
    tint: 0xf0c8c0,
    hemi: 0.66,
    fogNear: 70,
    fogFar: 300,
    exposure: 1.12,
    motes: 1.1,
  }),
});

/** 取得某區的氣氛設定（未知區域退回 foundations）。 */
export function atmosphereFor(regionId) {
  return REGION_ATMOSPHERE[regionId] || REGION_ATMOSPHERE.foundations;
}

/* ------------------------------------------------------------------ *
 * 地形
 * ------------------------------------------------------------------ */

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 柔化的階梯函式：大部分是平台，只有踏面之間有斜坡。 */
function stair(u) {
  const f = Math.floor(u);
  return f + smoothstep(0.62, 1, u - f);
}

/** 點到線段的距離（連接橋用）。 */
function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * 這個點在不在「過橋的主動線」上（擺放時就要避開）。
 *
 * Phase 8 是等東西擺好之後、再在碰撞階段把橋上的石頭變成幽靈 ——
 * 結果就是「看得到、走得過去」。正確的順序是**一開始就不要擺在動線上**，
 * 這樣石頭留在原地也擋得住人，而橋照樣走得通。
 */
export function inCorridor(x, z, pad = 0) {
  return BRIDGE_LANES.some(
    (l) => distToSegment(x, z, l.ax, l.az, l.bx, l.bz) < LANE_HALF + pad
  );
}

/** 中央高原：原本的 sin/cos 起伏（第一期的地貌原樣保留）。 */
function detailFoundations(x, z) {
  const base =
    1.7 * Math.sin(x * 0.055) * Math.cos(z * 0.048) +
    1.15 * Math.sin(x * 0.11 + 1.7) * Math.sin(z * 0.09 - 0.4) +
    0.55 * Math.sin((x + z) * 0.16 + 0.9) +
    0.3 * Math.cos((x - z) * 0.23);
  const r = Math.hypot(x, z);
  const flatten = 1 - Math.exp(-(r * r) / 900) * 0.75;
  return base * flatten;
}

/** 各區地貌。lx / lz 是相對該區中心的座標。 */
function detailFor(site, x, z) {
  const lx = x - site.x;
  const lz = z - site.z;
  const d = Math.hypot(lx, lz);

  switch (site.id) {
    case 'reasoning':
      // 階梯迴廊：一層層往中心疊高的環形平台
      return 5.2 - stair(d / 9) * 1.15 + Math.sin(lx * 0.2) * 0.12;
    case 'grounding':
      // 沉書檔案庫：平整台地，中間切出一排排書架走道
      return 2.3 - Math.pow(Math.abs(Math.cos(lx * 0.135)), 8) * 1.0 - smoothstep(40, 12, d) * 0.4;
    case 'orchestration':
      // 齒輪工坊：起伏的地面 ＋ 中央抬高的作業平台
      return 1.1 * Math.sin(lx * 0.08) * Math.cos(lz * 0.075) + smoothstep(24, 11, d) * 3.4;
    case 'config':
      // 面具劇場：往外升高的碗形觀眾席
      return stair(d / 8.5) * 0.9 - 2.2;
    default:
      return detailFoundations(x, z);
  }
}

/** 連接橋的高度（中段微微拱起）。 */
function corridorHeight(corridor, x, z) {
  const t = Math.max(
    0,
    Math.min(1, ((x - corridor.from.x) * corridor.dir.x + (z - corridor.from.z) * corridor.dir.z) / corridor.length)
  );
  return 1.1 + Math.sin(Math.PI * t) * 0.7;
}

/**
 * 地形高度場 —— 玩家貼地與物件擺放共用同一個函式，才不會浮空或陷地。
 * 五片土地與四條橋各自算高度，再依覆蓋權重混出來；沒有覆蓋的地方塌成虛空。
 */
export function terrainHeight(x, z) {
  let wsum = 0;
  let hsum = 0;
  let cover = 0;

  for (const site of REGION_SITES) {
    const d = Math.hypot(x - site.x, z - site.z);
    if (d > site.radius) continue;
    const m = smoothstep(site.radius, site.flat, d);
    if (m <= 0) continue;
    hsum += m * detailFor(site, x, z);
    wsum += m;
    if (m > cover) cover = m;
  }

  for (const c of CORRIDORS) {
    const d = distToSegment(x, z, c.from.x, c.from.z, c.to.x, c.to.z);
    if (d > c.half) continue;
    const m = smoothstep(c.half, c.flat, d);
    if (m <= 0) continue;
    hsum += m * corridorHeight(c, x, z);
    wsum += m;
    if (m > cover) cover = m;
  }

  const h = wsum > 0 ? hsum / wsum : 0;
  return h - (1 - cover) * 34;
}

/** 這個點被土地／橋覆蓋的程度（0 = 虛空、1 = 完全在陸地上）。 */
export function coverage(x, z) {
  let cover = 0;
  for (const site of REGION_SITES) {
    const d = Math.hypot(x - site.x, z - site.z);
    if (d <= site.radius) cover = Math.max(cover, smoothstep(site.radius, site.flat, d));
  }
  for (const c of CORRIDORS) {
    const d = distToSegment(x, z, c.from.x, c.from.z, c.to.x, c.to.z);
    if (d <= c.half) cover = Math.max(cover, smoothstep(c.half, c.flat, d));
  }
  return cover;
}

/**
 * 這個點在哪一區。
 * @returns {{id:string, onBridge:boolean}|null}
 */
export function regionAt(x, z) {
  for (const site of REGION_SITES) {
    if (Math.hypot(x - site.x, z - site.z) <= site.radius) return { id: site.id, onBridge: false };
  }
  let best = null;
  let bestD = Infinity;
  for (const c of CORRIDORS) {
    const d = distToSegment(x, z, c.from.x, c.from.z, c.to.x, c.to.z);
    if (d <= c.half && d < bestD) {
      bestD = d;
      best = { id: c.region, onBridge: true };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 玩家碰撞：把「實體道具」壓成一組圓柱體
 * ------------------------------------------------------------------ *
 *
 * 原則（便宜、不會把玩家關起來）：
 *   · 只收「站在地上、真的擋得住人」的東西 —— 飄在半空的齒輪 / 光環不算，
 *     膝蓋以下的矮物件也不算（不然到處都是看不見的牆）。
 *   · 每個碰撞體只是 { x, z, r } 一個圓柱，判定是純距離運算。
 *   · 石座、橋面、出生點的淨空由資料層保證（有測試在守），碰撞體不進去那些地方。
 */

/** 小於這個半徑的東西不擋路（碎石、草叢）。 */
export const SOLID_MIN_RADIUS = 0.5;
/**
 * 「用外接盒推出來」的碰撞半徑上限 —— 避免一顆量錯的大道具吃掉一整片空地。
 * 擺放時**明講**的 `solidRadius` 不吃這個上限（見 SOLID_MAX_EXPLICIT）：
 * 地標的臺座本來就有五、六公尺寬，硬夾到 3.6 只會讓人半個身體陷進石頭裡。
 */
export const SOLID_MAX_RADIUS = 3.6;
/** 明講的 `solidRadius` 的上限（地標臺座這種真的很大的東西）。 */
export const SOLID_MAX_EXPLICIT = 8;
/** 玩家身體的半徑。 */
export const PLAYER_RADIUS = 0.62;

/**
 * 「雜物」的半徑上限。
 *
 * 石座 / 橋 / 出生點 / 祭壇周圍的淨空區只負責掃掉**雜物**（碎石、草叢），
 * 不會把大東西變成幽靈 —— 一顆一人高的巨石站在石座旁邊，它就該擋得住人。
 * 大東西一開始就不會被擺進動線裡（擺放時就避開了，見 `inCorridor`）。
 *
 * Phase 20 從 1.2 收到 0.62：1.2 會連「面具柱」（0.7）與「石碑」（0.75）
 * 這種一人高、明明看得到的東西都掃成幽靈 —— 產品回報的「走得過去」有一半出在這。
 * 真正該擋不該擋的界線是「這是不是碎石」，不是「它離石座多近」。
 */
export const CLUTTER_RADIUS = 0.62;

/**
 * 「有份量」的門檻：一件東西**最薄的兩軸**都要有這麼寬，才算擋得住人。
 *
 * 細桿（梯子的邊柱 0.1、招牌的桿子 0.05、細枝 0.16）就算很高也讓玩家走得過去 ——
 * 為了一根手指粗的桿子放一道看不見的牆，比穿模更難受。
 * `markSolidParts()` 與碰撞稽核（`scripts/collision-audit.mjs`）用的是同一個門檻。
 */
export const SOLID_PLATE_MIN = 0.9;

const _solidMtx = new THREE.Matrix4();
const _solidPos = new THREE.Vector3();
const _solidQuat = new THREE.Quaternion();
const _solidScale = new THREE.Vector3();
const _solidAxis = new THREE.Vector3();
const _solidBox = new THREE.Box3();

/**
 * 幾何體的外接盒（只算一次，之後由 three.js 快取在 geometry 上）。
 *
 * Phase 20：外接盒要**連著世界矩陣一起算**（`Box3.applyMatrix4`），不能只拿
 * 局部尺寸乘縮放 —— 躺下來的環、斜插的巨石、轉了 90° 的大齒輪，
 * 「局部的 y」在世界裡其實是水平的。舊寫法把它們的高度與佔地都算錯，
 * 於是有些一人高的東西被當成「貼地矮件」或「飄在半空」直接跳過（＝穿模）。
 */
function footprintOf(geometry) {
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox || null;
}

/**
 * 掃過整棵場景圖，收出玩家碰撞用的圓柱體清單。
 *
 * 三種標記（都是擺放時明講的，不從「擋鏡頭」推論 —— 鏡頭會被擋的東西不一定擋得住腳）：
 *   · `userData.solidRadius`（數字）—— 直接指定半徑（道具、石碑、閘門柱、地標臺座）
 *   · `userData.solidSpan` = `[halfLong, halfShort]` —— 長條形（石凳、書架）：
 *     沿著局部 X 軸排一串小圓，而不是用一個把短邊撐胖三倍的大圓。
 *     長 4.2 深 1.6 的石凳如果只給一個半徑 2.1 的圓，玩家會在離它兩公尺外
 *     就撞到看不見的牆；排成一串之後，擋住的形狀才跟看到的一樣。
 *   · `userData.solid` —— 由幾何體外接盒推半徑（成堆的 instanced 碎石、巨石）
 *
 * 另外 `userData.keepSolid` 代表「這個碰撞體不是雜物，淨空區不准把它掃掉」
 * （石座本體就是這種：它站在自己的淨空區正中央，但它本來就該擋得住人）。
 *
 * @param {THREE.Object3D} root
 * @param {(x:number,z:number)=>number} [heightAt] 地形高度（判斷道具是不是飄在半空）
 * @returns {Array<{x:number,z:number,r:number,keep:boolean}>}
 */
export function collectSolids(root, heightAt = terrainHeight) {
  const out = [];
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    const ud = obj.userData || {};
    if (ud.noCollide) return;
    const explicit = typeof ud.solidRadius === 'number' ? ud.solidRadius : null;
    const span = Array.isArray(ud.solidSpan) ? ud.solidSpan : null;
    if (explicit === null && !span && !ud.solid) return;
    const fp = obj.isMesh ? footprintOf(obj.geometry) : null;
    if (explicit === null && !span && !fp) return;
    const keep = ud.keepSolid === true;

    const push = (mtx) => {
      mtx.decompose(_solidPos, _solidQuat, _solidScale);
      const sxz = Math.max(Math.abs(_solidScale.x), Math.abs(_solidScale.z));
      let boxR = 0;
      let boxX = _solidPos.x;
      let boxZ = _solidPos.z;
      if (fp) {
        _solidBox.copy(fp).applyMatrix4(mtx);
        boxX = (_solidBox.min.x + _solidBox.max.x) / 2;
        boxZ = (_solidBox.min.z + _solidBox.max.z) / 2;
        boxR = Math.max(_solidBox.max.x - _solidBox.min.x, _solidBox.max.z - _solidBox.min.z) / 2;
        const ground = heightAt(boxX, boxZ);
        if (_solidBox.min.y > ground + 2.0) return; // 飄在半空 → 從下面走過去
        if (_solidBox.max.y < ground + 0.5) return; // 貼地的矮件 → 跨過去
      }

      if (span) {
        // 長條形：沿著局部 X 軸排一串半徑 = 短邊的小圓
        const half = span[0] * sxz;
        const r = Math.max(span[1] * sxz, SOLID_MIN_RADIUS);
        const reach = Math.max(0, half - r);
        const n = Math.max(1, Math.ceil(reach / (r * 0.8)) + 1);
        _solidAxis.set(1, 0, 0).applyQuaternion(_solidQuat);
        _solidAxis.y = 0;
        if (_solidAxis.lengthSq() < 1e-6) _solidAxis.set(1, 0, 0);
        _solidAxis.normalize();
        for (let i = 0; i < n; i += 1) {
          const t = n === 1 ? 0 : -reach + (i * (reach * 2)) / (n - 1);
          out.push({
            x: _solidPos.x + _solidAxis.x * t,
            z: _solidPos.z + _solidAxis.z * t,
            r,
            keep,
            explicit: true,
          });
        }
        return;
      }

      const raw = explicit !== null ? explicit * sxz : boxR;
      if (raw < SOLID_MIN_RADIUS) return;
      const cap = explicit !== null ? SOLID_MAX_EXPLICIT : SOLID_MAX_RADIUS;
      out.push({
        x: explicit !== null ? _solidPos.x : boxX,
        z: explicit !== null ? _solidPos.z : boxZ,
        r: Math.min(raw, cap),
        keep,
        explicit: explicit !== null,
      });
    };

    if (obj.isInstancedMesh) {
      for (let i = 0; i < obj.count; i += 1) {
        obj.getMatrixAt(i, _solidMtx);
        _solidMtx.premultiply(obj.matrixWorld);
        push(_solidMtx);
      }
    } else {
      push(_solidMtx.copy(obj.matrixWorld));
    }
  });

  return out;
}

const _markScale = new THREE.Vector3();

/**
 * 幫一整組道具「自動標上實體」。
 *
 * Phase 20 之前，一組小景只有**根節點**登記了一個碰撞半徑，
 * 於是同一組裡離根節點遠一點的零件（舞台兩側的布幔、樹的板根、吊車的大輪盤）
 * 看得到卻走得過去。與其一件一件補，不如訂一條**看得懂也守得住**的規則：
 *
 *   一件東西「最薄的兩軸」都 ≥ SOLID_PLATE_MIN（0.9 公尺）就算有份量 → 擋人。
 *
 * 所以：布幔、板根、輪盤、鏡面、面具 → 擋；
 * 梯子的邊柱（0.1）、招牌的桿子（0.05）、樹枝、電線 → 不擋（走得過去）。
 * 半透明的東西（水面、光暈、霧）一律不擋 —— 它們是光，不是物質。
 * 高度與「飄不飄在半空」交給 `collectSolids()` 判斷，這裡只管「夠不夠厚」。
 *
 * @param {THREE.Object3D} root
 * @returns {number} 這次標上的網格數（測試會看）
 */
export function markSolidParts(root) {
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const ud = obj.userData || {};
    if (ud.noCollide || ud.solid || ud.solidSpan || typeof ud.solidRadius === 'number') return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || mat.transparent) return; // 光與水不是物質
    const geo = obj.geometry;
    if (!geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    obj.matrixWorld.decompose(_solidPos, _solidQuat, _markScale);
    const dims = [
      (bb.max.x - bb.min.x) * Math.abs(_markScale.x),
      (bb.max.y - bb.min.y) * Math.abs(_markScale.y),
      (bb.max.z - bb.min.z) * Math.abs(_markScale.z),
    ].sort((a, b) => a - b);
    if (dims[1] < SOLID_PLATE_MIN) return; // 細桿 / 薄片 → 走得過去
    obj.userData.solid = true;
    n += 1;
  });
  return n;
}

/** 這個點有沒有踩進某個實體道具裡（回傳擋住它的那一個）。 */
export function solidAt(x, z, solids, pad = PLAYER_RADIUS) {
  for (let i = 0; i < solids.length; i += 1) {
    const s = solids[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const rr = s.r + pad;
    if (dx * dx + dz * dz < rr * rr) return s;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 文字貼圖
 * ------------------------------------------------------------------ */
/** 產生文字貼圖 sprite（NPC 名牌 / 閘門說明）。 */
function makeLabel(text, { color = '#dbe9f3', sub = '', width = 512 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.font = '600 52px "Noto Sans TC", "PingFang TC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, sub ? 58 : 80);

  if (sub) {
    ctx.font = '400 32px "Noto Sans TC", "PingFang TC", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(210,226,238,0.72)';
    ctx.fillText(sub, canvas.width / 2, 116);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
  );
  sprite.scale.set(9, 2.8, 1);
  sprite.userData.dispose = () => {
    tex.dispose();
    sprite.material.dispose();
  };
  return sprite;
}

/* ------------------------------------------------------------------ *
 * 地形網格
 * ------------------------------------------------------------------ */
function buildTerrain(quality, colorOf, pathSegs = []) {
  const seg = quality === 'high' ? 200 : 110;
  const size = WORLD_RADIUS * 2 + 40;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(PALETTE.ground);
  const high = new THREE.Color(PALETTE.groundHigh);
  const edge = new THREE.Color(0x0f151b);
  // 被踩出來的路：比周圍亮一階、帶一點暖 —— 玩家看的是「對比」，不是箭頭
  const worn = new THREE.Color(0x8d8f88);
  const tmp = new THREE.Color();
  const accent = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    const cov = coverage(x, z);
    const t = THREE.MathUtils.clamp((y + 2.5) / 7, 0, 1);
    tmp.copy(low).lerp(high, t);

    // 各區用自己的主色輕輕染一下地面 —— 只取色相、壓低亮度，夜色才不會被洗白
    const here = regionAt(x, z);
    if (here) {
      accent.set(colorOf(here.id) || '#8aa0b4').multiplyScalar(0.42);
      tmp.lerp(accent, here.onBridge ? 0.22 : 0.38);
    }
    // 走出來的路：踩得越熟越亮（純頂點色，不改高度場 → 不影響可行走判定）
    if (pathSegs.length) {
      const w = pathInfluence(x, z, pathSegs);
      if (w > 0) tmp.lerp(worn, w * 0.46 * cov);
    }
    if (cov < 0.6) tmp.lerp(edge, (0.6 - cov) / 0.6);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = quality === 'high';
  mesh.name = 'terrain';
  return mesh;
}

/* ------------------------------------------------------------------ *
 * 亂數（可重現）
 * ------------------------------------------------------------------ */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * 中央高原的散景：石柱、碎石
 * ------------------------------------------------------------------ */
function buildScatter(quality, keepClear = []) {
  const group = new THREE.Group();
  group.name = 'scatter';

  // keepClear 的每一筆可以自帶淨空半徑（石座 / 小景 / 地標要的空間都不一樣）
  // 橋的主動線也算「不要擺東西的地方」—— 擺了就得靠碰撞階段補救，那才是穿模的來源
  const blocked = (x, z, extra = 0) =>
    keepClear.some(([cx, cz, pad]) => Math.hypot(x - cx, z - cz) < (pad || 7) + extra) ||
    Math.hypot(x - 0, z - 6) < 8 ||
    inCorridor(x, z, 2.6 + extra);

  const rand = makeRandom(20260726);

  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a4a56, flatShading: true, roughness: 1 });
  const pillarGeo = new THREE.CylinderGeometry(0.8, 1.1, 7, 6);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x33434e, flatShading: true, roughness: 0.9 });

  const rockCount = quality === 'high' ? 150 : 70;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = quality === 'high';
  rocks.receiveShadow = quality === 'high';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const limit = HUB.radius - 6;

  for (let i = 0; i < rockCount; i += 1) {
    let a = rand() * Math.PI * 2;
    let r = 10 + rand() * limit;
    let x = Math.cos(a) * r;
    let z = Math.sin(a) * r;
    for (let tries = 0; tries < 6 && blocked(x, z); tries += 1) {
      a = rand() * Math.PI * 2;
      r = 10 + rand() * limit;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const scale = blocked(x, z) ? 0.3 : 0.4 + rand() * 1.25;
    p.set(x, terrainHeight(x, z) + scale * 0.32, z);
    q.setFromEuler(new THREE.Euler(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6));
    s.set(scale, scale * (0.6 + rand() * 0.6), scale);
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  rocks.instanceMatrix.needsUpdate = true;
  // 大顆的碎石擋得住人（小石子會被 SOLID_MIN_RADIUS 過濾掉）
  rocks.userData.solid = true;
  group.add(rocks);

  // 立石環，做出「有人來過」的遺跡感。撞到石座 / 小景 / 地標的就整根跳過，
  // 不然一根 7 公尺高的柱子會把一整個故事小景擋住。
  const pillarCount = 14;
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCount);
  pillars.castShadow = quality === 'high';
  let pn = 0;
  for (let i = 0; i < pillarCount; i += 1) {
    const a = (i / pillarCount) * Math.PI * 2 + 0.2;
    const r = HUB.radius - 12 - rand() * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const scale = 0.7 + rand() * 0.6;
    if (blocked(x, z, 5)) continue;
    p.set(x, terrainHeight(x, z) + 3.4 * scale, z);
    q.setFromEuler(new THREE.Euler(0, rand() * Math.PI, (rand() - 0.5) * 0.12));
    s.set(scale, scale, scale);
    pillars.setMatrixAt(pn, m.compose(p, q, s));
    pn += 1;
  }
  pillars.count = pn;
  pillars.instanceMatrix.needsUpdate = true;
  pillars.userData.blocksCamera = true;
  pillars.userData.solid = true;
  group.add(pillars);

  return group;
}

/* ------------------------------------------------------------------ *
 * 植被與岩石：每片土地 3 種不同剪影的原型
 * ------------------------------------------------------------------ *
 *
 * 兩個原則：
 *   · **剪影要能分辨**：同一區的三種原型形狀刻意差很多（圓 / 尖 / 橫），
 *     壓成黑色也認得出來。
 *   · **成叢，不要均勻灑**：先挑幾個叢心，再在叢心周圍抖動放置，
 *     叢與叢之間留白 —— 均勻分布看起來反而假，而且會吃掉地標的呼吸空間。
 *
 * `solid`：Phase 20 起，凡是「最薄的兩軸都 ≥ SOLID_PLATE_MIN」的原型一律擋人
 * （樹幹、巨石、圓環、方塊）；細枝與尖刺（0.16 / 0.24 / 0.56 / 0.68 公尺寬）
 * 仍然走得過去 —— 為一根細桿放一道看不見的牆比穿模更難受。
 */
const FLORA = Object.freeze({
  foundations: [
    // 錐形矮樹 1.1 寬 → 擋
    { geo: () => new THREE.ConeGeometry(0.55, 2.2, 4), tint: 0.34, scale: [0.5, 1.5], lift: 1.0, tilt: 0.18, solid: true },
    { geo: () => new THREE.IcosahedronGeometry(0.9, 0), tint: 0.28, scale: [0.4, 1.1], lift: 0.32, tilt: 0.5, solid: true },
    // 細枝 0.32 寬 → 走得過去
    { geo: () => new THREE.CylinderGeometry(0.06, 0.16, 2.6, 5), tint: 0.2, scale: [0.5, 1.2], lift: 1.3, tilt: 0.12 },
  ],
  reasoning: [
    { geo: () => new THREE.BoxGeometry(1.6, 0.5, 1.2), tint: 0.3, scale: [0.5, 1.4], lift: 0.25, tilt: 0.1, solid: true },
    // 尖刺 0.68 寬 → 走得過去（高但薄）
    { geo: () => new THREE.ConeGeometry(0.34, 4.4, 5), tint: 0.42, scale: [0.5, 1.2], lift: 2.2, tilt: 0.06 },
    { geo: () => new THREE.OctahedronGeometry(0.6, 0), tint: 0.5, scale: [0.4, 0.9], lift: 0.5, tilt: 0.6, solid: true },
  ],
  grounding: [
    { geo: () => new THREE.IcosahedronGeometry(1.3, 0), tint: 0.26, scale: [0.5, 1.3], lift: 0.5, tilt: 0.5, solid: true },
    { geo: () => new THREE.CylinderGeometry(0.3, 0.5, 3.6, 6), tint: 0.22, scale: [0.6, 1.3], lift: 1.8, tilt: 0.08, solid: true },
    { geo: () => new THREE.DodecahedronGeometry(0.9, 0), tint: 0.4, scale: [0.4, 0.9], lift: 0.6, tilt: 0.4, solid: true },
  ],
  orchestration: [
    { geo: () => new THREE.BoxGeometry(0.9, 0.9, 0.9), tint: 0.24, scale: [0.5, 1.3], lift: 0.45, tilt: 0.35, solid: true },
    // 細柱 0.56 寬 → 走得過去
    { geo: () => new THREE.CylinderGeometry(0.28, 0.28, 2.4, 6), tint: 0.36, scale: [0.5, 1.2], lift: 1.2, tilt: 0.5 },
    { geo: () => new THREE.TorusGeometry(0.7, 0.16, 4, 10), tint: 0.44, scale: [0.5, 1.1], lift: 0.75, tilt: 0.3, solid: true },
  ],
  config: [
    { geo: () => new THREE.ConeGeometry(0.7, 1.6, 6), tint: 0.32, scale: [0.5, 1.2], lift: 0.8, tilt: 0.1, solid: true },
    { geo: () => new THREE.IcosahedronGeometry(0.7, 0), tint: 0.26, scale: [0.4, 1.0], lift: 0.3, tilt: 0.5, solid: true },
    // 細桿 0.24 寬 → 走得過去
    { geo: () => new THREE.CylinderGeometry(0.1, 0.12, 3.2, 5), tint: 0.46, scale: [0.5, 1.1], lift: 1.6, tilt: 0.05 },
  ],
});

/**
 * 幫一片土地鋪上植被 / 岩石（成叢分布、三種剪影、全部 instanced）。
 */
function buildFlora(site, color, quality, keepClear) {
  const specs = FLORA[site.id] || FLORA.foundations;
  const group = new THREE.Group();
  group.name = `flora:${site.id}`;
  const rand = makeRandom(site.id.length * 104729 + 4242);
  const c = new THREE.Color(color);
  const perType = quality === 'high' ? 30 : 14;
  const clusters = 7;

  // Phase 20：植被現在會擋人，所以「不要種在動線上」比以前更重要 ——
  // 橋的主動線淨空是 LANE_HALF(3.2)，這裡再往外留 1.6 公尺的餘裕。
  const blocked = (x, z) =>
    keepClear.some(([cx, cz, pad]) => Math.hypot(x - cx, z - cz) < (pad || 8)) ||
    inCorridor(x, z, 4.2);

  // 先決定叢心：環繞在土地的中外圈，中央留給地標與石座
  const centers = [];
  for (let i = 0; i < clusters; i += 1) {
    const a = (i / clusters) * Math.PI * 2 + rand() * 0.7;
    const r = site.radius * (0.42 + rand() * 0.42);
    centers.push([site.x + Math.cos(a) * r, site.z + Math.sin(a) * r]);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  specs.forEach((spec, si) => {
    const mat = new THREE.MeshStandardMaterial({
      color: c.clone().multiplyScalar(spec.tint),
      flatShading: true,
      roughness: 0.95,
    });
    const mesh = new THREE.InstancedMesh(spec.geo(), mat, perType);
    mesh.castShadow = quality === 'high';
    mesh.receiveShadow = quality === 'high';
    let n = 0;
    for (let i = 0; i < perType * 4 && n < perType; i += 1) {
      const [cx, cz] = centers[(i + si) % centers.length];
      const spread = 4 + rand() * 9;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.hypot(x - site.x, z - site.z) > site.radius - 5) continue;
      if (coverage(x, z) < 0.85 || blocked(x, z)) continue;
      const scale = spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]);
      p.set(x, terrainHeight(x, z) + spec.lift * scale, z);
      q.setFromEuler(
        new THREE.Euler((rand() - 0.5) * spec.tilt, rand() * Math.PI * 2, (rand() - 0.5) * spec.tilt)
      );
      s.set(scale, scale * (0.75 + rand() * 0.6), scale);
      mesh.setMatrixAt(n, m.compose(p, q, s));
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    // 只有「巨石」型的原型會擋路；草叢與細枝走得過去
    if (spec.solid) mesh.userData.solid = true;
    if (n > 0) group.add(mesh);
  });

  return group;
}

/* ------------------------------------------------------------------ *
 * 各區的造景（低多邊形 ＋ instancing，維持效能）
 * ------------------------------------------------------------------ */
function buildRegionProps(site, color, quality, keepClear, pedestals = []) {
  const group = new THREE.Group();
  group.name = `props:${site.id}`;
  const rand = makeRandom(site.id.length * 7919 + 1337);
  const shadow = quality === 'high';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color(color);

  // pad 參數是「這個道具至少要離多遠」，keepClear 每一筆自帶的半徑取兩者較大值
  const clear = (x, z, pad = 6) =>
    keepClear.some(([cx, cz, own]) => Math.hypot(x - cx, z - cz) < Math.max(pad, own || 0)) ||
    inCorridor(x, z, 2.6);
  const place = (radiusMin, radiusMax) => {
    for (let i = 0; i < 8; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = radiusMin + rand() * (radiusMax - radiusMin);
      const x = site.x + Math.cos(a) * r;
      const z = site.z + Math.sin(a) * r;
      if (!clear(x, z)) return { x, z };
    }
    return { x: site.x, z: site.z + radiusMax };
  };

  const stoneMat = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.42),
    flatShading: true,
    roughness: 0.9,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.7),
    emissive: c.clone().multiplyScalar(0.5),
    emissiveIntensity: 0.35,
    flatShading: true,
    roughness: 0.5,
  });

  if (site.id === 'reasoning') {
    // 懸浮的思考環 ＋ 細長方尖碑
    const ringGeo = new THREE.TorusGeometry(2.6, 0.16, 5, 22);
    const RING_OUTER = 2.76; // 2.6 + 0.16
    const rings = new THREE.InstancedMesh(ringGeo, glowMat, 22);
    for (let i = 0; i < 22; i += 1) {
      const { x, z } = place(19, site.radius - 8);
      const scale = 0.6 + rand() * 1.1;
      // 思考環是**飄著**的：底緣至少離地 2.2 公尺，玩家才走得過去。
      // Phase 20 之前高度沒有把環自己的半徑算進去，最低的幾個直接插進地裡
      // （看起來是實心的大環，人卻穿得過去）。
      p.set(x, terrainHeight(x, z) + 3.2 + RING_OUTER * scale + rand() * 6, z);
      q.setFromEuler(new THREE.Euler(Math.PI / 2 + (rand() - 0.5) * 0.6, rand() * Math.PI, 0));
      s.set(scale, scale, scale);
      rings.setMatrixAt(i, m.compose(p, q, s));
    }
    rings.instanceMatrix.needsUpdate = true;
    group.add(rings);

    const obGeo = new THREE.ConeGeometry(1.1, 9, 4);
    const obelisks = new THREE.InstancedMesh(obGeo, stoneMat, 18);
    obelisks.castShadow = shadow;
    for (let i = 0; i < 18; i += 1) {
      const { x, z } = place(14, site.radius - 6);
      const scale = 0.6 + rand() * 0.8;
      p.set(x, terrainHeight(x, z) + 4.5 * scale, z);
      q.setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0));
      s.set(scale, scale, scale);
      obelisks.setMatrixAt(i, m.compose(p, q, s));
    }
    obelisks.instanceMatrix.needsUpdate = true;
    obelisks.userData.blocksCamera = true;
    obelisks.userData.solid = true;
    group.add(obelisks);
  } else if (site.id === 'grounding') {
    // 兩側的書架走道（中央留空，鏡頭才不會鑽進書架裡） ＋ 飄浮的書頁
    const shelfGeo = new THREE.BoxGeometry(3.4, 6.4, 1.2);
    const shelves = new THREE.InstancedMesh(shelfGeo, stoneMat, 44);
    shelves.castShadow = shadow;
    shelves.receiveShadow = shadow;
    let n = 0;
    for (const row of [-2.4, -1.4, 1.4, 2.4]) {
      for (let i = -4; i <= 4 && n < 44; i += 1) {
        const x = site.x + row * 11.5;
        const z = site.z + i * 8 + (row < 0 ? 3 : 0);
        if (Math.hypot(x - site.x, z - site.z) > site.radius - 8 || clear(x, z, 10)) continue;
        const scale = 0.75 + rand() * 0.5;
        p.set(x, terrainHeight(x, z) + 3.2 * scale, z);
        q.setFromEuler(new THREE.Euler(0, (rand() - 0.5) * 0.12, 0));
        s.set(scale, scale, scale);
        shelves.setMatrixAt(n, m.compose(p, q, s));
        n += 1;
      }
    }
    shelves.count = n;
    shelves.instanceMatrix.needsUpdate = true;
    shelves.userData.blocksCamera = true;
    // 書架是 3.4 × 1.2 的長條：一個半徑 1.7 的圓會把它撐成三倍厚
    // （Phase 8 就記著的已知落差），改成沿長軸排一串小圓。
    shelves.userData.solidSpan = [1.7, 0.62];
    group.add(shelves);

    const pageGeo = new THREE.PlaneGeometry(1.1, 1.5);
    const pageMat = new THREE.MeshStandardMaterial({
      color: c.clone().lerp(new THREE.Color(0xffffff), 0.55),
      emissive: c.clone().multiplyScalar(0.5),
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
    const pages = new THREE.InstancedMesh(pageGeo, pageMat, 60);
    for (let i = 0; i < 60; i += 1) {
      const { x, z } = place(6, site.radius - 8);
      p.set(x, terrainHeight(x, z) + 4 + rand() * 8, z);
      q.setFromEuler(new THREE.Euler(rand() * 0.8, rand() * Math.PI * 2, rand() * 0.8));
      s.set(1, 1, 1);
      pages.setMatrixAt(i, m.compose(p, q, s));
    }
    pages.instanceMatrix.needsUpdate = true;
    group.add(pages);
  } else if (site.id === 'orchestration') {
    // 齒輪、支架與管線
    const gearGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.7, 9);
    const GEAR_N = 12;
    const gears = new THREE.InstancedMesh(gearGeo, stoneMat, GEAR_N);
    gears.castShadow = shadow;
    const gearData = [];
    for (let i = 0; i < GEAR_N; i += 1) {
      const { x, z } = place(26, site.radius - 7);
      const scale = 0.7 + rand() * 1.3;
      /*
       * 飄在半空的東西要**真的**飄在半空。
       *
       * 齒輪是躺下來的大圓盤（半徑 3.2 × scale），高度只給「圓心離地 5–11 公尺」
       * 的話，最大的那幾片在斜坡上的下緣會垂到離地不到 1.6 公尺 ——
       * 碰撞稽核就會判定它「有份量卻走得過去」（＝一個看得到的穿模點）。
       * 所以下緣一律再往上推到離地 2.4 公尺以上（> FLOAT_MIN 1.6，留一點餘裕）。
       */
      const clearance = 3.2 * scale + 2.4;
      const y = terrainHeight(x, z) + Math.max(5 + rand() * 6, clearance);
      gearData.push({ x, y, z, scale, spin: (rand() - 0.5) * 0.6, tilt: rand() * Math.PI });
      p.set(x, y, z);
      q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, gearData[i].tilt));
      s.set(scale, scale, scale);
      gears.setMatrixAt(i, m.compose(p, q, s));
    }
    gears.instanceMatrix.needsUpdate = true;
    gears.userData.blocksCamera = true;
    group.add(gears);

    const beamGeo = new THREE.BoxGeometry(0.7, 0.7, 14);
    const BEAM_N = 8;
    const beams = new THREE.InstancedMesh(beamGeo, glowMat, BEAM_N);
    for (let i = 0; i < BEAM_N; i += 1) {
      const { x, z } = place(24, site.radius - 7);
      p.set(x, terrainHeight(x, z) + 12 + rand() * 5, z);
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.4));
      s.set(1, 1, 0.6 + rand());
      beams.setMatrixAt(i, m.compose(p, q, s));
    }
    beams.instanceMatrix.needsUpdate = true;
    group.add(beams);
    group.userData.gears = { mesh: gears, data: gearData };
  } else if (site.id === 'config') {
    // 觀眾席、面具柱、旋鈕方碑
    const seatGeo = new THREE.BoxGeometry(4.2, 0.9, 1.6);
    const seats = new THREE.InstancedMesh(seatGeo, stoneMat, 72);
    seats.receiveShadow = shadow;
    let n = 0;
    for (let ring = 0; ring < 4 && n < 72; ring += 1) {
      const r = 20 + ring * 7;
      const count = 14 + ring * 2;
      for (let i = 0; i < count && n < 72; i += 1) {
        const a = (i / count) * Math.PI * 2;
        const x = site.x + Math.cos(a) * r;
        const z = site.z + Math.sin(a) * r;
        if (clear(x, z, 9)) continue;
        p.set(x, terrainHeight(x, z) + 0.45, z);
        q.setFromEuler(new THREE.Euler(0, -a, 0));
        s.set(1, 1, 1);
        seats.setMatrixAt(n, m.compose(p, q, s));
        n += 1;
      }
    }
    seats.count = n;
    seats.instanceMatrix.needsUpdate = true;
    // 觀眾席是 4.2 公尺長、0.9 公尺高的石凳 —— 跨不過去，就該擋得住人。
    // 用「沿長軸排一串小圓」而不是一個大圓，擋住的形狀才跟看到的一樣。
    seats.userData.solidSpan = [2.1, 0.82];
    group.add(seats);

    const maskGeo = new THREE.OctahedronGeometry(1.15, 0);
    const masks = new THREE.InstancedMesh(maskGeo, glowMat, 16);
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 6, 5);
    const poles = new THREE.InstancedMesh(poleGeo, stoneMat, 16);
    poles.castShadow = shadow;
    let pn = 0;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const r = 12 + (i % 3) * 4;
      const x = site.x + Math.cos(a) * r;
      const z = site.z + Math.sin(a) * r;
      // 面具柱擋得住人，所以不能長在石座的淨空圈或橋的主動線上（Phase 20：
      // 之前是「擺了再由淨空濾網把碰撞拿掉」，結果柱子看得到卻走得過去）。
      // 這裡只避開石座與動線 —— 地標與小景旁邊本來就該有柱子圍著。
      if (pedestals.some(([px, pz]) => Math.hypot(x - px, z - pz) < PEDESTAL_CLEAR + 2)) continue;
      if (inCorridor(x, z, 1.2)) continue;
      const gy = terrainHeight(x, z);
      p.set(x, gy + 3, z);
      q.identity();
      s.set(1, 1, 1);
      poles.setMatrixAt(pn, m.compose(p, q, s));
      p.set(x, gy + 6.6, z);
      q.setFromEuler(new THREE.Euler(0.2, a, 0));
      masks.setMatrixAt(pn, m.compose(p, q, s));
      pn += 1;
    }
    poles.count = pn;
    masks.count = pn;
    poles.instanceMatrix.needsUpdate = true;
    masks.instanceMatrix.needsUpdate = true;
    poles.userData.blocksCamera = true;
    poles.userData.solidRadius = 0.7;
    group.add(poles);
    group.add(masks);
  }

  // 每區一盞主色補光：便宜又有效的「氣氛」
  const fill = new THREE.PointLight(color, 5.5, 80, 2);
  fill.position.set(site.x, terrainHeight(site.x, site.z) + 24, site.z);
  group.add(fill);
  group.userData.fill = fill;

  return group;
}

/* ------------------------------------------------------------------ *
 * 氛圍粒子（螢火）
 * ------------------------------------------------------------------ */
function makeMoteTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(210,236,250,0.55)');
  g.addColorStop(1, 'rgba(210,236,250,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 螢火／飄塵：每區密度與顏色不同（依 REGION_ATMOSPHERE.motes 與該區主色），
 * 走進不同的土地時空氣本身就長得不一樣。
 */
function buildMotes(quality, colorOf, clusters = []) {
  const base = quality === 'high' ? 120 : 50;
  const perCluster = quality === 'high' ? 16 : 7;
  const plan = REGION_SITES.map((site) => ({
    site,
    n: Math.round(base * atmosphereFor(site.id).motes),
  }));
  const count = plan.reduce((a, b) => a + b.n, 0) + clusters.length * perCluster;

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const drift = new Float32Array(count);
  const baseY = new Float32Array(count);
  const tint = new THREE.Color();
  const pale = new THREE.Color(0xdff0fb);

  let i = 0;
  for (const { site, n } of plan) {
    tint.set(colorOf(site.id) || '#cfe8f6').lerp(pale, 0.45);
    for (let k = 0; k < n; k += 1, i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * site.radius;
      const x = site.x + Math.cos(a) * r;
      const z = site.z + Math.sin(a) * r;
      const y = terrainHeight(x, z) + 0.5 + Math.pow(Math.random(), 1.6) * 10;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      baseY[i] = y;
      phases[i] = Math.random() * Math.PI * 2;
      drift[i] = 0.35 + Math.random() * 0.85;
      const j = 0.82 + Math.random() * 0.3;
      colors[i * 3] = tint.r * j;
      colors[i * 3 + 1] = tint.g * j;
      colors[i * 3 + 2] = tint.b * j;
    }
  }

  // 故事小景旁邊聚一小群螢火：玩家看的是「動態的對比」，這是最便宜的「這裡有東西」
  for (const cl of clusters) {
    tint.set(colorOf(cl.region) || '#cfe8f6').lerp(new THREE.Color(PALETTE.warm), 0.5);
    for (let k = 0; k < perCluster; k += 1, i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (cl.r || 7);
      const x = cl.x + Math.cos(a) * r;
      const z = cl.z + Math.sin(a) * r;
      const y = terrainHeight(x, z) + 0.4 + Math.pow(Math.random(), 1.4) * 3.4;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      baseY[i] = y;
      phases[i] = Math.random() * Math.PI * 2;
      drift[i] = 0.5 + Math.random() * 1.1;
      const j = 0.9 + Math.random() * 0.35;
      colors[i * 3] = tint.r * j;
      colors[i * 3 + 1] = tint.g * j;
      colors[i * 3 + 2] = tint.b * j;
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    map: makeMoteTexture(),
    size: 0.62,
    vertexColors: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: true,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'motes';
  points.userData.phases = phases;
  points.userData.drift = drift;
  points.userData.baseY = baseY;
  return points;
}

/** 貼地霧氣：橋頭與各區邊緣鋪幾片很淡的平面，鏡頭壓低時最有效。 */
function buildGroundMist(quality) {
  const group = new THREE.Group();
  group.name = 'mist';

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(200,224,244,0.42)');
  g.addColorStop(0.45, 'rgba(180,208,234,0.2)');
  g.addColorStop(1, 'rgba(160,195,226,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  const spots = [];
  // 每座橋的兩端與中央（走上橋時腳邊會飄）
  for (const c of CORRIDORS) {
    for (const t of [0.16, 0.5, 0.84]) {
      spots.push({
        x: c.from.x + c.dir.x * c.length * t,
        z: c.from.z + c.dir.z * c.length * t,
        r: 20,
      });
    }
  }
  // 每片土地的邊緣（往虛空掉下去的那一圈）
  for (const site of REGION_SITES) {
    const n = site.id === 'foundations' ? 8 : 6;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + 0.35;
      spots.push({
        x: site.x + Math.cos(a) * (site.radius - 6),
        z: site.z + Math.sin(a) * (site.radius - 6),
        r: 26,
      });
    }
  }

  const step = quality === 'high' ? 1 : 2;
  for (let i = 0; i < spots.length; i += step) {
    const spot = spots[i];
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(spot.r * 2, spot.r * 2), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(spot.x, terrainHeight(spot.x, spot.z) + 0.85 + Math.random() * 0.9, spot.z);
    plane.userData.spin = (Math.random() - 0.5) * 0.05;
    plane.userData.baseY = plane.position.y;
    plane.userData.phase = Math.random() * Math.PI * 2;
    plane.renderOrder = 2;
    group.add(plane);
  }
  return group;
}

/* ------------------------------------------------------------------ *
 * 關卡標記
 * ------------------------------------------------------------------ */
/**
 * 起始祭壇（Phase 7 序章）：出生點北邊一圈立石 ＋ 中央的低矮供臺。
 *
 * 刻意做得很小、很矮、不擋路 —— 它的工作只有兩件：
 *   1. 給序章一個「有地方感」的舞台（醒來 → 走過去 → 學三件事）
 *   2. 用一圈光告訴玩家「往這裡走」，不需要箭頭 UI
 */
function buildShrine(spec, quality) {
  const [x, z] = (spec && spec.at) || [0, 18];
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.name = 'shrine:prologue';
  group.position.set(x, y, z);

  const color = new THREE.Color(PALETTE.warm);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.5, 0.42, 14),
    new THREE.MeshStandardMaterial({ color: 0x2b3744, flatShading: true, roughness: 0.9 })
  );
  dais.position.y = 0.21;
  dais.receiveShadow = quality === 'high';
  group.add(dais);

  const altar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.86, 1.0, 6),
    new THREE.MeshStandardMaterial({ color: 0x35434f, flatShading: true, roughness: 0.8 })
  );
  altar.position.y = 0.92;
  altar.castShadow = quality === 'high';
  // 供臺是一座及腰的石臺，走不進去。半徑 0.8 加上玩家半徑也才 1.42 公尺，
  // 序章「走進祭壇光圈」判定的是 6.5 公尺，完全不受影響。
  altar.userData.solidRadius = 0.8;
  altar.userData.keepSolid = true;
  group.add(altar);

  // 供臺上懸著的一顆小光 —— 神諭本體，序章活著的時候會亮
  const emberMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone(),
    emissiveIntensity: 1.4,
    roughness: 0.3,
    flatShading: true,
  });
  const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), emberMat);
  ember.position.y = 1.95;
  group.add(ember);

  const light = new THREE.PointLight(color, 3.4, 18, 2);
  light.position.y = 2.0;
  group.add(light);

  // 一圈立石：8 根，高矮交錯，用一個 InstancedMesh 就好
  const count = 8;
  const stones = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.34, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x2a3541, flatShading: true, roughness: 0.95 }),
    count
  );
  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const r = 4.6;
    const h = 1.7 + (i % 3) * 0.55;
    pos.set(Math.cos(a) * r, terrainHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) - y + h / 2, Math.sin(a) * r);
    quat.setFromEuler(new THREE.Euler(0, a + 0.3, Math.sin(i * 2.1) * 0.05));
    scale.set(1, h, 1);
    stones.setMatrixAt(i, mtx.compose(pos, quat, scale));
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.castShadow = quality === 'high';
  group.add(stones);

  // 地上的光圈：序章進行中會呼吸，結束後轉為很淡的一圈痕跡
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.9, 6.3, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 2.4, 24, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
  );
  column.position.y = 12;
  group.add(column);

  let active = false;
  return {
    id: 'prologue-shrine',
    group,
    position: new THREE.Vector3(x, y, z),
    radius: (spec && spec.radius) || 6.5,
    ember,
    ring,
    light,
    get active() {
      return active;
    },
    /** 序章進行中 → 祭壇亮起來；結束 → 沉回背景。 */
    setActive(v) {
      active = Boolean(v);
    },
    update(dt, t) {
      const breathe = 1 + Math.sin(t * 1.1) * (active ? 0.28 : 0.08);
      emberMat.emissiveIntensity = (active ? 1.9 : 0.9) * breathe;
      light.intensity = (active ? 5.2 : 1.8) * breathe;
      ember.position.y = 1.95 + Math.sin(t * 0.9) * 0.12;
      ember.rotation.y += dt * (active ? 0.9 : 0.25);
      const wantRing = active ? 0.15 + Math.sin(t * 1.5) * 0.05 : 0.045;
      ring.material.opacity += (wantRing - ring.material.opacity) * Math.min(1, dt * 3);
      ring.rotation.z += dt * 0.06;
      const wantCol = active ? 0.05 : 0.016;
      column.material.opacity += (wantCol - column.material.opacity) * Math.min(1, dt * 2);
      column.rotation.y += dt * 0.05;
    },
  };
}

function buildMarker(challenge, quality, accent) {
  const group = new THREE.Group();
  const [x, z] = challenge.position || [0, 0];
  const y = terrainHeight(x, z);
  group.position.set(x, y, z);
  group.name = `marker:${challenge.id}`;
  const color = new THREE.Color(accent || PALETTE.accent);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.55, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f3f4a, flatShading: true, roughness: 0.85 })
  );
  pedestal.position.y = 0.55;
  pedestal.castShadow = quality === 'high';
  pedestal.receiveShadow = quality === 'high';
  // 石座本體擋得住人（Phase 20 之前 26 座石座全部走得過去）。
  // 半徑取腰部高度的實際外框 1.25 —— 加上玩家半徑 0.62 也只有 1.87 公尺，
  // 互動距離是 6.5 公尺，所以「走到石座前面按 E」一點都沒變難。
  // keepSolid：它站在自己的淨空區正中央，淨空區不准把它掃掉。
  pedestal.userData.solidRadius = 1.25;
  pedestal.userData.keepSolid = true;
  group.add(pedestal);

  const shardMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone(),
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.1,
    flatShading: true,
  });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 0), shardMat);
  shard.position.y = 2.5;
  group.add(shard);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.55, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  /*
   * 石座的暖光不再是「每座一盞 PointLight」。
   *
   * 為什麼（課程 v2 · Phase B）：石座會從 27 座長到 142 座，一座一盞會在
   * Phase C 就撞破 WORLD.md §6.1 的 56 盞預算（前向渲染每一盞都要在片段著色器裡算）。
   * 這盞燈的 distance 是 16 公尺、石座之間至少隔 13 公尺 —— 也就是說**同一時間
   * 最多只有兩三座的光照得到玩家**，其餘 130 幾盞是純浪費。
   *
   * 所以改成：每座石座留一個**光的意圖**（顏色 / 亮度 / 高度），
   * 真正的 PointLight 由世界層的一小池（MARKER_LIGHT_POOL 盞）每幀指派給最近的幾座。
   * 畫面完全一樣（照得到玩家的那幾座本來就只有那幾座），
   * 但燈數從「石座數」變成「常數」。
   */
  const glow = {
    color: color.clone(),
    intensity: 4.2,
    position: { y: 2.5 },
    /** 這一格光的世界座標（燈池指派時用）。 */
    worldY: y + 2.5,
  };

  // 光柱：從很遠就看得到「那邊有事情可以做」，等於一個不需要小地圖的導航
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 1.5, 34, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
  );
  beacon.position.y = 17;
  beacon.renderOrder = 1;
  group.add(beacon);

  // 走近時腳下亮起的一圈（互動可及範圍的視覺回饋）
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 6.4, 44),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  group.add(halo);

  const label = makeLabel(challenge.title, { sub: challenge.npc, color: `#${color.getHexString()}` });
  label.position.y = 4.4;
  group.add(label);

  const fitLabel = (sprite, camera, worldPos) => {
    if (!camera) return;
    const d = camera.position.distanceTo(worldPos);
    const s = THREE.MathUtils.clamp(d * 0.1, 1.3, 3.4);
    sprite.scale.set(s * 3.2, s, 1);
  };

  return {
    id: challenge.id,
    challenge,
    region: challenge.region,
    group,
    position: new THREE.Vector3(x, y, z),
    shard,
    shardMat,
    ring,
    glow,
    beacon,
    halo,
    label,
    cleared: false,
    grade: null,
    near: false,
    /** 序章畢業時被「指路」的那一座：光柱會加亮、腳下的圈會慢慢呼吸。 */
    spotlight: false,
    /** 玩家是否站在互動範圍內（走近 → 腳下的圈亮起、光柱變亮）。 */
    setNear(v) {
      this.near = Boolean(v);
    },
    setSpotlight(v) {
      this.spotlight = Boolean(v);
    },
    setCleared(grade) {
      this.cleared = true;
      this.grade = grade || null;
      const done = new THREE.Color(PALETTE.warm);
      shardMat.color.copy(done);
      shardMat.emissive.copy(done);
      shardMat.emissiveIntensity = 1.1;
      ring.material.color.copy(done);
      ring.material.opacity = 0.2;
      glow.color.copy(done);
      glow.intensity = 3.4;
      // 通關後光柱轉為安靜的暖金 —— 一眼看得出哪裡做完了
      beacon.material.color.copy(done);
      beacon.material.opacity = 0.03;
      halo.material.color.copy(done);
      group.remove(this.label);
      this.label.userData.dispose?.();
      const newLabel = makeLabel(`${challenge.title}  ✦${grade || ''}`, { sub: challenge.npc, color: '#f3ddba' });
      newLabel.position.y = 4.4;
      newLabel.scale.copy(this.label.scale);
      group.add(newLabel);
      this.label = newLabel;
    },
    update(dt, t, camera) {
      fitLabel(this.label, camera, this.position);
      shard.rotation.y += dt * (this.near ? 1.5 : 0.7);
      shard.rotation.x = Math.sin(t * 0.6) * 0.18;
      const bob = Math.sin(t * 1.4 + x * 0.3) * 0.22;
      shard.position.y = 2.5 + bob;
      glow.position.y = 2.5 + bob;
      glow.worldY = y + 2.5 + bob;
      ring.rotation.z += dt * 0.15;

      // 三種狀態讀得出來：未解 = 呼吸式脈動、走近 = 亮起、已解 = 安靜的暖金
      const pulse = this.cleared ? 0.16 : 0.26 + Math.sin(t * 1.8 + z * 0.2) * 0.1;
      ring.material.opacity = pulse + (this.near ? 0.22 : 0);
      shardMat.emissiveIntensity =
        (this.cleared ? 1.1 : 1.6 + Math.sin(t * 1.8 + z * 0.2) * 0.35) + (this.near ? 0.7 : 0);
      glow.intensity = (this.cleared ? 2.6 : 4.2) + (this.near ? 2.6 : 0);

      const beaconBase = this.cleared ? 0.03 : 0.055;
      const wanted =
        beaconBase *
        (this.near ? 2.1 : 1) *
        (this.spotlight ? 2.6 : 1) *
        (1 + Math.sin(t * 0.9 + x * 0.11) * 0.16);
      beacon.material.opacity += (wanted - beacon.material.opacity) * Math.min(1, dt * 4);
      beacon.rotation.y += dt * 0.08;

      const haloWanted = this.near
        ? 0.16 + Math.sin(t * 3.4) * 0.05
        : this.spotlight
          ? 0.09 + Math.sin(t * 1.6) * 0.045
          : 0;
      halo.material.opacity += (haloWanted - halo.material.opacity) * Math.min(1, dt * 6);
      halo.rotation.z += dt * (this.near ? 0.5 : 0.12);
    },
  };
}

/* ------------------------------------------------------------------ *
 * 區域閘門（橋中央）
 * ------------------------------------------------------------------ */
function buildGate(corridor, region, color, unlocked, infoText) {
  const group = new THREE.Group();
  group.name = `gate:${region.id}`;
  const c = new THREE.Color(color);
  const gx = corridor.gate.x;
  const gz = corridor.gate.z;
  const gy = terrainHeight(gx, gz);
  const facing = Math.atan2(corridor.dir.x, corridor.dir.z);

  const pillarGeo = new THREE.CylinderGeometry(0.7, 1.0, 10, 6);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.45),
    emissive: c.clone().multiplyScalar(0.25),
    roughness: 0.7,
    flatShading: true,
  });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(gx + Math.cos(facing) * side * 5.4, gy + 5, gz - Math.sin(facing) * side * 5.4);
    pillar.userData.blocksCamera = true;
    pillar.userData.solidRadius = 1.05;
    group.add(pillar);
  }

  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(5.4, 0.32, 6, 26, Math.PI),
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c.clone().multiplyScalar(0.7),
      emissiveIntensity: 0.7,
      roughness: 0.5,
      flatShading: true,
    })
  );
  arch.position.set(gx, gy + 9.2, gz);
  arch.rotation.y = facing;
  group.add(arch);

  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(10.8, 9.4, 1, 1),
    new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: unlocked ? 0 : 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  veil.position.set(gx, gy + 4.7, gz);
  veil.rotation.y = facing + Math.PI / 2;
  veil.visible = !unlocked;
  group.add(veil);

  const burst = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.1, 36),
    new THREE.MeshBasicMaterial({
      color: PALETTE.warm,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  burst.position.set(gx, gy + 4.7, gz);
  burst.rotation.y = facing + Math.PI / 2;
  group.add(burst);

  let label = makeLabel(`${region.name} · ${region.nameEn}`, {
    sub: infoText,
    color: `#${c.getHexString()}`,
    width: 700,
  });
  label.scale.set(13, 3.8, 1);
  label.position.set(gx, gy + 12.4, gz);
  group.add(label);

  let opening = 0;
  let isOpen = unlocked;

  return {
    id: region.id,
    group,
    position: new THREE.Vector3(gx, gy, gz),
    get isOpen() {
      return isOpen;
    },
    setLabel(text) {
      group.remove(label);
      label.userData.dispose?.();
      const next = makeLabel(`${region.name} · ${region.nameEn}`, {
        sub: text,
        color: isOpen ? '#f3ddba' : `#${c.getHexString()}`,
        width: 700,
      });
      next.scale.copy(label.scale);
      next.position.copy(label.position);
      group.add(next);
      label = next;
    },
    /** 開門：屏障淡出 ＋ 一圈擴散的光環當作慶祝。 */
    open(celebrate = true) {
      if (isOpen) return;
      isOpen = true;
      opening = celebrate ? 1 : 0;
      if (!celebrate) veil.visible = false;
      arch.material.emissiveIntensity = 1.3;
      this.setLabel('已開啟 · 往前走吧');
    },
    update(dt, t) {
      arch.rotation.z = Math.sin(t * 0.3) * 0.03;
      if (!isOpen) {
        veil.material.opacity = 0.18 + Math.sin(t * 0.9) * 0.06;
        return;
      }
      if (opening > 0) {
        opening = Math.max(0, opening - dt * 0.55);
        const k = 1 - opening;
        veil.material.opacity = 0.24 * opening;
        veil.visible = opening > 0.02;
        burst.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.8;
        const scale = 1 + k * 4.5;
        burst.scale.set(scale, scale, 1);
      } else {
        burst.material.opacity = 0;
        veil.visible = false;
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * 組裝
 * ------------------------------------------------------------------ */
export function createWorld({
  engine,
  curriculum,
  challenges,
  progression,
  quality = 'high',
  shrine = null,
  /** Phase 22：刻文小語（inscriptions.json 的 entries）。沒給就不蓋，世界照樣成立。 */
  inscriptions = [],
  /** Phase 22：藏起來的地方（secrets.json 的 entries）。 */
  secrets = [],
  /** Phase 25：動得了的器物（handles.json 的 entries）。沒給就不蓋，世界照樣成立。 */
  handles = [],
  /** Phase 22：走近會有反應的東西要不要放聲音（面板打開時整組停手）。 */
  onReact = null,
  onSecret = null,
  isBusy = null,
  reducedMotion = false,
}) {
  const { scene } = engine;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const groups = new Map((curriculum.groups || []).map((g) => [g.id, g]));
  const colorOf = (regionId) => (groups.get(regionId) || {}).color || '#8aa0b4';
  const positions = challenges.map((c) => c.position || [0, 0]);

  // 走出來的路（只染地面顏色，不動高度場）
  const pathSegs = buildPathNetwork(REGION_SITES, CORRIDORS, challenges);
  root.add(buildTerrain(quality, colorOf, pathSegs));

  /**
   * 「留白清單」：石座、小景、地標周圍不放隨機裝飾。
   * 地標旁邊要刻意留矮、留空 —— 高的東西只有在旁邊都很矮時才顯得高。
   */
  const shrineSpec = shrine && Array.isArray(shrine.at) ? shrine : null;

  const keepClear = [
    ...positions.map(([x, z]) => [x, z, 9]),
    ...STORY_VIGNETTES.map((v) => [v.at[0], v.at[1], 11]),
    ...LANDMARKS.map((l) => [l.at[0], l.at[1], l.clear]),
    ...LORE_TABLETS.map((t) => [t.at[0], t.at[1], 6]),
    // Phase 22：刻文小語 / 會回應的東西 / 藏起來的地方 —— 旁邊也要留白，
    // 不然被隨機碎石與草叢埋掉，「刻在角落的字」就變成「找不到的字」。
    ...inscriptions.map((i) => [i.at[0], i.at[1], 5]),
    ...REACTIVE_SPOTS.map((s) => [s.at[0], s.at[1], 6]),
    ...secrets.map((s) => [s.at[0], s.at[1], 9]),
    // Phase 25：動得了的器物 —— 走近才看得到細節，旁邊被草叢埋掉就等於沒放
    ...handles.map((h) => [h.at[0], h.at[1], 5.5]),
    ...(shrineSpec ? [[shrineSpec.at[0], shrineSpec.at[1], 10]] : []),
  ];

  root.add(
    buildScatter(
      quality,
      keepClear.filter(([x, z]) => Math.hypot(x - HUB.x, z - HUB.z) < HUB.radius + 8)
    )
  );

  const regionProps = [];
  for (const site of REGION_SITES) {
    if (site.id === 'foundations') continue;
    const props = buildRegionProps(site, colorOf(site.id), quality, keepClear, positions);
    root.add(props);
    regionProps.push({ id: site.id, group: props });
  }

  /* --- Phase 5：植被原型、故事小景、地標、石碑 --- */
  const kits = new Map(REGION_SITES.map((s) => [s.id, kitFor(colorOf(s.id))]));
  const propAnimations = [];
  const vignetteAnchors = [];

  for (const site of REGION_SITES) {
    root.add(buildFlora(site, colorOf(site.id), quality, keepClear));

    const kit = kits.get(site.id);
    const vig = buildVignettes(site.id, kit, terrainHeight, quality);
    if (vig.group.children.length) {
      root.add(vig.group);
      // 小景是「成組」擺的：根節點的一個圓圈不到離得遠的零件（布幔、板根、輪盤），
      // 所以照「夠不夠厚」的規則把有份量的零件也標成實體（Phase 20）。
      markSolidParts(vig.group);
    }
    for (const a of vig.anchors) vignetteAnchors.push({ ...a, region: site.id });
    propAnimations.push(...vig.animated);

    const landmark = buildLandmark(site.id, kit, terrainHeight, quality);
    if (landmark) {
      root.add(landmark.group);
      markSolidParts(landmark.group);
      propAnimations.push({ kind: 'landmark', id: landmark.spec.id, data: landmark.group.userData });
    }
  }

  const tablets = LORE_TABLETS.map((t) => {
    const tab = buildTablet(t, kits.get(t.region) || kits.get('foundations'), terrainHeight);
    root.add(tab.group);
    markSolidParts(tab.group);
    if (progression.hasReadLore && progression.hasReadLore(t.id)) tab.setRead(true);
    return tab;
  });
  const tabletById = new Map(tablets.map((t) => [t.id, t]));

  /* --- Phase 22：刻文小語（走近按 E → 一個很小的對話窗） --- */
  const inscriptionObjs = inscriptions.map((spec) => {
    const ins = buildInscription(spec, kits.get(spec.region) || kits.get('foundations'), terrainHeight);
    root.add(ins.group);
    if (progression.hasFoundInscription && progression.hasFoundInscription(spec.id)) ins.setFound(true);
    return ins;
  });
  const inscriptionById = new Map(inscriptionObjs.map((i) => [i.id, i]));

  /* --- Phase 22：會回應的東西 ＋ 藏起來的地方 --- */
  const reactive = createReactiveField({
    spots: REACTIVE_SPOTS,
    secrets,
    kitOf: (regionId) => kits.get(regionId) || kits.get('foundations'),
    terrainHeight,
    onReact,
    onSecret,
    isBusy,
    reducedMotion,
  });
  root.add(reactive.group);
  for (const spec of secrets) {
    if (progression.hasFoundSecret && progression.hasFoundSecret(spec.id)) reactive.markSecretFound(spec.id);
  }

  /* --- Phase 25：動得了的器物（走近按 E 就有反應的小東西） --- */
  const handleField = createHandleField({
    entries: handles,
    kitOf: (regionId) => kits.get(regionId) || kits.get('foundations'),
    terrainHeight,
    reducedMotion,
  });
  root.add(handleField.group);
  // 「夠厚就擋人」的規則由 markSolidParts 統一判定（陶罐另外在 handles.js 明講半徑）
  markSolidParts(handleField.group);
  for (const spec of handles) {
    if (progression.hasUsedHandle && progression.hasUsedHandle(spec.id)) handleField.markUsed(spec.id);
  }

  const motes = buildMotes(quality, colorOf, vignetteAnchors);
  root.add(motes);

  const mist = buildGroundMist(quality);
  root.add(mist);

  // 起點光柱（讓玩家一眼看到自己在哪、往哪走）
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.1, 22, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  beacon.position.set(0, terrainHeight(0, 6) + 11, 6);
  root.add(beacon);

  // 起始祭壇（序章的舞台）—— 沒給 spec 就不蓋，世界照樣成立
  const shrineObj = shrineSpec ? buildShrine(shrineSpec, quality) : null;
  if (shrineObj) root.add(shrineObj.group);

  const markers = challenges.map((c) => {
    const marker = buildMarker(c, quality, colorOf(c.region));
    root.add(marker.group);
    const grade = progression.bestGrade(c.id);
    if (grade) marker.setCleared(grade);
    return marker;
  });

  const gates = CORRIDORS.map((corridor) => {
    const region = groups.get(corridor.region) || { id: corridor.region, name: corridor.region, nameEn: '' };
    const status = progression.gateStatus(corridor.region);
    const gate = buildGate(corridor, region, colorOf(corridor.region), status.unlocked, status.text);
    root.add(gate.group);
    return Object.assign(gate, { corridor, meta: region });
  });
  const gateById = new Map(gates.map((g) => [g.id, g]));

  const isUnlocked = (regionId) => progression.isRegionUnlocked(regionId);

  /** 這個點現在走得到嗎（含虛空與尚未開啟的閘門）。 */
  function isWalkable(x, z) {
    if (coverage(x, z) < 0.45) return false;
    for (const c of CORRIDORS) {
      if (isUnlocked(c.region)) continue;
      const site = SITE_BY_ID.get(c.region);
      if (site && Math.hypot(x - site.x, z - site.z) < site.radius + 4) return false;
      const along = (x - c.from.x) * c.dir.x + (z - c.from.z) * c.dir.z;
      const lateral = distToSegment(x, z, c.from.x, c.from.z, c.to.x, c.to.z);
      if (along > c.gateAt - 1.4 && lateral < c.half + 4) return false;
    }
    return true;
  }

  /**
   * 鏡頭避障用的碰撞體：只收「會擋住視線的實體」（書架、齒輪、立石、閘門柱），
   * 不含地形（地形已用高度場處理）也不含粒子 / 光暈。
   */
  const colliders = [];
  root.traverse((obj) => {
    if (obj.userData && obj.userData.blocksCamera) colliders.push(obj);
  });

  /**
   * 玩家碰撞登記表：擺放時標好的實體道具 → 一組圓柱體。
   * 石座、橋面、出生點的淨空由資料層保證（`npm run test:rubric` 有守）。
   *
   * 淨空區只掃得掉**雜物**（半徑 ≤ CLUTTER_RADIUS 的碎石草叢）：
   * Phase 8 是不分大小一律變成幽靈，於是「石座旁邊的一顆巨石」「橋頭的一塊大石」
   * 看得到卻走得過去。真正該做的是**擺放時就不要放進動線**（見 `inCorridor`），
   * 剩下的雜物才交給這道濾網；標了 keepSolid 的（石座本體、祭壇供臺）一律留著。
   */
  const noCollideZones = [
    ...positions.map(([x, z]) => ({ x, z, r: PEDESTAL_CLEAR })),
    { x: 0, z: 6, r: SPAWN_CLEAR },
    ...(shrineSpec ? [{ x: shrineSpec.at[0], z: shrineSpec.at[1], r: (shrineSpec.radius || 6.5) + 1.5 }] : []),
  ];
  const inNoCollideZone = (s) => {
    if (s.keep) return false;
    if (s.r > CLUTTER_RADIUS) return false;
    return (
      noCollideZones.some((z) => Math.hypot(s.x - z.x, s.z - z.z) < z.r + s.r) ||
      BRIDGE_LANES.some((l) => distToSegment(s.x, s.z, l.ax, l.az, l.bx, l.bz) < LANE_HALF + s.r)
    );
  };

  const solids = collectSolids(root, terrainHeight).filter((s) => !inNoCollideZone(s));

  /** 這個點是不是踩進實體道具裡。 */
  const hitSolid = (x, z) => solidAt(x, z, solids);
  /** 走得到嗎：地形 ＋ 閘門 ＋ 實體道具都要過。 */
  const isClear = (x, z) => isWalkable(x, z) && !hitSolid(x, z);

  const motePhases = motes.userData.phases;
  const moteBaseY = motes.userData.baseY;
  const moteDrift = motes.userData.drift;
  const gearRigs = regionProps.filter((r) => r.group.userData.gears).map((r) => r.group.userData.gears);
  const gearMatrix = new THREE.Matrix4();
  const gearQuat = new THREE.Quaternion();
  const gearScale = new THREE.Vector3();
  const gearPos = new THREE.Vector3();

  /* ------------------------------------------------------------------ *
   * 石座的燈池（課程 v2 · Phase B）
   *
   * WORLD.md §6.1：新增場景內容不新增光源。石座會從 27 座長到 142 座，
   * 一座一盞的作法在 Phase C 就會撞破 56 盞的預算。
   *
   * 這一池是**常數盞**（8 盞），每幀指派給離鏡頭最近的幾座石座。
   * 石座的燈 distance = 16 公尺、彼此至少隔 13 公尺，所以同一時間照得到
   * 玩家的本來就只有兩三座 —— 畫面看不出差別，燈數卻不再跟著關卡數長。
   *
   * 每幀零配置：距離用平方比、暫存物件提到這一層、不 map/filter/sort 整個陣列
   * （只做一次 8 格的插入排序，8 是常數）。
   * ------------------------------------------------------------------ */
  const MARKER_LIGHT_POOL = 8;
  const markerLights = [];
  for (let i = 0; i < MARKER_LIGHT_POOL; i += 1) {
    const l = new THREE.PointLight(0xffffff, 0, 16, 2);
    l.position.set(0, -50, 0);
    root.add(l);
    markerLights.push(l);
  }
  /** 這一幀選中的石座（index 0 最近）與它們的平方距離。 */
  const litMarkers = new Array(MARKER_LIGHT_POOL).fill(null);
  const litDist = new Array(MARKER_LIGHT_POOL).fill(Infinity);

  function updateMarkerLights() {
    const cam = engine.camera;
    if (!cam || !cam.position) return;
    const cx = cam.position.x;
    const cz = cam.position.z;
    for (let i = 0; i < MARKER_LIGHT_POOL; i += 1) {
      litMarkers[i] = null;
      litDist[i] = Infinity;
    }
    for (let m = 0; m < markers.length; m += 1) {
      const marker = markers[m];
      const dx = marker.position.x - cx;
      const dz = marker.position.z - cz;
      const d2 = dx * dx + dz * dz;
      // 45 公尺外整組跳過（§6.2 距離分級）；燈的作用半徑只有 16
      if (d2 > 2025) continue;
      for (let i = 0; i < MARKER_LIGHT_POOL; i += 1) {
        if (d2 >= litDist[i]) continue;
        for (let j = MARKER_LIGHT_POOL - 1; j > i; j -= 1) {
          litDist[j] = litDist[j - 1];
          litMarkers[j] = litMarkers[j - 1];
        }
        litDist[i] = d2;
        litMarkers[i] = marker;
        break;
      }
    }
    for (let i = 0; i < MARKER_LIGHT_POOL; i += 1) {
      const light = markerLights[i];
      const marker = litMarkers[i];
      if (!marker) {
        light.intensity = 0;
        continue;
      }
      const g = marker.glow;
      light.color.copy(g.color);
      light.intensity = g.intensity;
      light.position.set(marker.position.x, g.worldY, marker.position.z);
    }
  }

  const floatMtx = new THREE.Matrix4();
  const floatQuat = new THREE.Quaternion();
  const floatPos = new THREE.Vector3();
  const floatScale = new THREE.Vector3(1, 1, 1);

  engine.onUpdate((dt, t) => {
    for (const m of markers) m.update(dt, t, engine.camera);
    updateMarkerLights();
    for (const g of gates) g.update(dt, t);
    for (const tab of tablets) tab.update(dt, t);
    for (const ins of inscriptionObjs) ins.update(dt, t);
    if (shrineObj) shrineObj.update(dt, t);

    // 故事小景裡「還在動的東西」：燈火搖曳、懸浮的階梯、刻度盤的指針、吊車的載重
    for (const a of propAnimations) {
      if (a.kind === 'flicker') {
        if (a.base === undefined) a.base = a.light.intensity;
        a.light.intensity =
          a.base * (0.88 + Math.sin(t * 2.3 + (a.seed || 0)) * 0.08 + Math.sin(t * 7.1 + (a.seed || 0)) * 0.04);
      } else if (a.kind === 'floaters') {
        const mesh = a.mesh;
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, floatMtx);
          floatMtx.decompose(floatPos, floatQuat, floatScale);
          if (mesh.userData.baseY === undefined) mesh.userData.baseY = [];
          if (mesh.userData.baseY[i] === undefined) mesh.userData.baseY[i] = floatPos.y;
          floatPos.y = mesh.userData.baseY[i] + Math.sin(t * 0.7 + i * 0.8 + (a.seed || 0)) * 0.22;
          mesh.setMatrixAt(i, floatMtx.compose(floatPos, floatQuat, floatScale));
        }
        mesh.instanceMatrix.needsUpdate = true;
      } else if (a.kind === 'pointer') {
        // 刻度盤的指針繞著盤面慢慢走（旋鈕會自己動 —— 參數是活的）
        const ang = Math.sin(t * 0.22) * 2.4;
        a.mesh.position.set(Math.sin(ang) * 0.35, a.mesh.position.y, Math.cos(ang) * 0.35);
        a.mesh.rotation.y = ang;
      } else if (a.kind === 'landmark') {
        if (a.data.load) a.data.load.rotation.y = Math.sin(t * 0.18) * 0.25;
        if (a.data.gear) a.data.gear.rotation.y += dt * 0.18;
        if (a.data.leaves) a.data.leaves.rotation.y = Math.sin(t * 0.09) * 0.06;
      }
    }

    const arr = motes.geometry.attributes.position;
    for (let i = 0; i < motePhases.length; i += 1) {
      arr.array[i * 3 + 1] = moteBaseY[i] + Math.sin(t * 0.5 * moteDrift[i] + motePhases[i]) * 1.1;
    }
    arr.needsUpdate = true;
    beacon.rotation.y = t * 0.06;

    // 貼地霧氣：慢慢轉、慢慢起伏
    for (const plane of mist.children) {
      plane.rotation.z += plane.userData.spin * dt;
      plane.position.y = plane.userData.baseY + Math.sin(t * 0.22 + plane.userData.phase) * 0.35;
    }

    // 工坊的齒輪會轉
    for (const rig of gearRigs) {
      rig.data.forEach((g, i) => {
        gearPos.set(g.x, g.y, g.z);
        gearQuat.setFromEuler(new THREE.Euler(Math.PI / 2, 0, g.tilt + t * g.spin));
        gearScale.set(g.scale, g.scale, g.scale);
        rig.mesh.setMatrixAt(i, gearMatrix.compose(gearPos, gearQuat, gearScale));
      });
      rig.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return {
    root,
    markers,
    gates,
    colliders,
    mist,
    motes,
    tablets,
    /** Phase 22：刻文小語（走近按 E）。 */
    inscriptions: inscriptionObjs,
    /** Phase 22：反應場（會回應的東西 ＋ 藏起來的地方）。 */
    reactive,
    /** Phase 25：動得了的器物。 */
    handles: handleField,
    vignetteAnchors,
    landmarks: LANDMARKS,
    /** 起始祭壇（序章）。世界沒有序章資料時為 null。 */
    shrine: shrineObj,

    /** 序章畢業：指向第一座石座（光柱加亮）。傳 null 取消全部指路。 */
    spotlightMarker(challengeId) {
      let hit = null;
      for (const m of markers) {
        const on = Boolean(challengeId) && m.id === challengeId;
        m.setSpotlight(on);
        if (on) hit = m;
      }
      return hit;
    },
    terrainHeight,
    coverage,
    regionAt,
    isWalkable,
    atmosphereFor,

    /** 玩家移動用：走不過去就沿牆滑，不會被卡死。 */
    clampPosition(nextX, nextZ, prevX, prevZ) {
      if (isClear(nextX, nextZ)) return { x: nextX, z: nextZ };

      /*
       * ① 沿著石頭的**切線**滑。
       *
       * Phase 20：原本只有「鎖住被擋的那一軸」，正面直直撞上一顆圓石時
       * 前進方向如果剛好貼著座標軸（鏡頭沒轉過就是這樣），另一軸的位移是 0 ——
       * 於是人整個黏在石頭上，繞不過去。把位移拆成「指向圓心」與「切線」兩份，
       * 丟掉前者、留下後者，擦到樹的時候才會順著它滑開。
       */
      const hit = hitSolid(nextX, nextZ);
      if (hit) {
        const ox = nextX - hit.x;
        const oz = nextZ - hit.z;
        const d = Math.hypot(ox, oz);
        if (d > 1e-4) {
          const nx = ox / d;
          const nz = oz / d;
          const dx = nextX - prevX;
          const dz = nextZ - prevZ;
          const into = dx * nx + dz * nz;
          const tx = dx - nx * into;
          const tz = dz - nz * into;
          if (tx * tx + tz * tz > 1e-8) {
            // 貼著石頭的外緣滑（把人推到剛好擦邊的距離，再往切線走一步）
            const rim = hit.r + PLAYER_RADIUS + 0.02;
            const sx = hit.x + nx * Math.max(d, rim) + tx;
            const sz = hit.z + nz * Math.max(d, rim) + tz;
            if (isClear(sx, sz)) return { x: sx, z: sz };
            if (isClear(prevX + tx, prevZ + tz)) return { x: prevX + tx, z: prevZ + tz };
          }
        }
      }

      // ② 退一步：只鎖住被擋的那一軸，另一軸照走（地形邊緣與閘門也走這條）
      if (isClear(nextX, prevZ)) return { x: nextX, z: prevZ };
      if (isClear(prevX, nextZ)) return { x: prevX, z: nextZ };
      return { x: prevX, z: prevZ };
    },

    /** 玩家碰撞登記表（測試與除錯用）。 */
    solids,
    solidAt: hitSolid,
    isClear,

    /**
     * 保險絲：萬一玩家站在實體道具裡（傳送、資料改動、地形變化），
     * 每幀往外推一小步把他請出來 —— 不會瞬移，也絕不會被關在裡面。
     * @returns {{x:number,z:number}|null} 不需要脫困時回傳 null
     */
    escapeSolid(x, z, step = 0.35) {
      const hit = hitSolid(x, z);
      if (!hit) return null;
      const dx = x - hit.x;
      const dz = z - hit.z;
      const d = Math.hypot(dx, dz);
      const ux = d > 1e-4 ? dx / d : 1;
      const uz = d > 1e-4 ? dz / d : 0;
      const move = Math.min(step, hit.r + PLAYER_RADIUS + 0.05 - d);
      const nx = x + ux * move;
      const nz = z + uz * move;
      if (!isWalkable(nx, nz)) return null;
      return { x: nx, z: nz };
    },

    /** 開啟某區的閘門（帶慶祝光環）。 */
    openGate(regionId, celebrate = true) {
      const gate = gateById.get(regionId);
      if (gate) gate.open(celebrate);
    },

    /** 重新整理閘門說明文字（等級／通關數變動時呼叫）。 */
    refreshGates() {
      for (const gate of gates) {
        const status = progression.gateStatus(gate.id);
        if (status.unlocked) {
          gate.open(false);
          // Phase 29：先行前往的門照實說 —— 它是被問開的，不是被考過的
          if (status.skipped) gate.setLabel('已開啟 · 你先行前往');
        } else gate.setLabel(status.text);
      }
    },

    /** 某區精通了 —— 把該區的石座與補光染成暖金。 */
    setRegionMastered(regionId) {
      const props = regionProps.find((r) => r.id === regionId);
      if (props && props.group.userData.fill) {
        props.group.userData.fill.color.set(PALETTE.warm);
        props.group.userData.fill.intensity = 14;
      }
      for (const marker of markers) {
        if (marker.region !== regionId) continue;
        marker.glow.intensity = 5.2;
        marker.ring.material.color.set(PALETTE.warm);
        marker.beacon.material.color.set(PALETTE.warm);
        marker.halo.material.color.set(PALETTE.warm);
      }
    },

    /** 找出玩家附近可互動的標記（順便更新「走近」的視覺狀態）。 */
    nearestMarker(position, maxDistance = 6.5) {
      let best = null;
      let bestDist = maxDistance;
      for (const m of markers) {
        const d = m.position.distanceTo(position);
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      // 只有最近的那一座會亮起，避免兩座石座同時搶注意力
      for (const m of markers) m.setNear(m === best);
      return best ? { marker: best, distance: bestDist } : null;
    },

    /**
     * 找出玩家附近可閱讀的石碑（順便更新「走近」的視覺狀態）。
     * 互動半徑比石座小 —— 石碑是「找到才有意義」的東西，不該搶石座的注意力。
     */
    nearestTablet(position, maxDistance = 4.6) {
      let best = null;
      let bestDist = maxDistance;
      for (const tab of tablets) {
        const d = tab.position.distanceTo(position);
        if (d < bestDist) {
          bestDist = d;
          best = tab;
        }
      }
      for (const tab of tablets) tab.setNear(tab === best);
      return best ? { tablet: best, distance: bestDist } : null;
    },

    /**
     * 走近的刻文小語（Phase 22）。半徑比石碑再小 ——
     * 它是「刻在角落的字」，不該跟石碑或石座搶 E 鍵。
     */
    nearestInscription(position, maxDistance = INSCRIPTION_RADIUS) {
      let best = null;
      let bestDist = maxDistance;
      for (const ins of inscriptionObjs) {
        const d = ins.position.distanceTo(position);
        if (d < bestDist) {
          bestDist = d;
          best = ins;
        }
      }
      for (const ins of inscriptionObjs) ins.setNear(ins === best);
      return best ? { inscription: best, distance: bestDist } : null;
    },

    /** 標記某則刻文小語已讀（世界端的視覺變化）。 */
    markInscriptionFound(id) {
      const ins = inscriptionById.get(id);
      if (ins) ins.setFound(true);
      return Boolean(ins);
    },

    /** 每幀更新反應場（玩家座標）。面板打開時由 isBusy 自己停手。 */
    updateReactions(dt, t, x, z) {
      reactive.update(dt, t, x, z);
      handleField.update(dt, t, x, z);
    },

    /**
     * 走近的器物（Phase 25）。半徑 3.2，比刻文小語（3.8）再小一階 ——
     * 搶 E 的順序是「石座 > 石碑 > 刻文小語 > 器物 > 閘門」。
     * @param {THREE.Vector3} position
     * @param {number} [maxDistance]
     * @param {{x:number,z:number}|null} [forward] 鏡頭的水平前方向（兩件同時在範圍內時用來排名）
     */
    nearestHandle(position, maxDistance = HANDLE_RADIUS, forward = null) {
      return handleField.nearest(position, maxDistance, forward);
    },

    /** 標記某件器物已經動過（世界端的視覺變化）。 */
    markHandleUsed(id) {
      return handleField.markUsed(id);
    },

    /** 標記某塊石碑已讀（世界端的視覺變化）。 */
    markTabletRead(id) {
      const tab = tabletById.get(id);
      if (tab) tab.setRead(true);
      return Boolean(tab);
    },

    /** 找出玩家附近的閘門。 */
    nearestGate(position, maxDistance = 14) {
      let best = null;
      let bestDist = maxDistance;
      for (const g of gates) {
        const d = g.position.distanceTo(position);
        if (d < bestDist) {
          bestDist = d;
          best = g;
        }
      }
      return best ? { gate: best, distance: bestDist } : null;
    },

    /**
     * 下一個目標：目前所在區域尚未通關的第一關；該區全破就往下一個已解鎖區域找。
     */
    nextObjective(regionId) {
      const order = REGION_SITES.map((s) => s.id);
      const start = Math.max(0, order.indexOf(regionId));
      for (let i = 0; i < order.length; i += 1) {
        const id = order[(start + i) % order.length];
        if (!progression.isRegionUnlocked(id)) continue;
        const next = markers.find((m) => m.region === id && !progression.isCleared(m.challenge.id));
        if (next) return { regionId: id, challenge: next.challenge };
      }
      return null;
    },

    /**
     * 指南針用：下一個目標「在世界上的哪個座標」。
     * 和 HUD 的「下一個目標」同一套邏輯（本區未通關的第一關 → 下一個已解鎖區域），
     * 已解鎖的關全破時改指向還沒開的那道閘門 —— 永遠指得出一個方向。
     */
    objectiveTarget(regionId) {
      const order = REGION_SITES.map((s) => s.id);
      const start = Math.max(0, order.indexOf(regionId));
      for (let i = 0; i < order.length; i += 1) {
        const id = order[(start + i) % order.length];
        if (!progression.isRegionUnlocked(id)) continue;
        const m = markers.find((mk) => mk.region === id && !progression.isCleared(mk.challenge.id));
        if (m) {
          return {
            kind: 'marker',
            id: m.id,
            region: id,
            name: m.challenge.title,
            x: m.position.x,
            z: m.position.z,
          };
        }
      }
      for (const g of gates) {
        if (progression.isRegionUnlocked(g.corridor.region)) continue;
        return {
          kind: 'gate',
          id: g.id,
          region: g.corridor.region,
          name: `${g.meta.name}的閘門`,
          x: g.position.x,
          z: g.position.z,
        };
      }
      return null;
    },
  };
}

export default createWorld;

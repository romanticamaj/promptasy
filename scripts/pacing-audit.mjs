#!/usr/bin/env node
/**
 * Promptasy — POI 節奏稽核（v1.2 · P06；research-map M9）
 *
 * WORLD.md §4.4：「每走 20–30 公尺遇到一次（反應物），中間要有真正的安靜。」
 * 這支腳本**先量再放**：沿路網（`buildPathNetwork()` 的線段 —— 與 world.js 蓋地面時同一份）
 * 每 5 m 取一個樣點，對每個樣點算四種距離：
 *   微觸  distMicro  距最近的反應物（REACTIVE_SPOTS）／器物（handles.json）
 *   中景  distMid    距最近的故事小景（STORY_VIGNETTES）／石碑（LORE_TABLETS）／刻文（inscriptions.json）／濁靈（murks.json）
 *   石座  distMarker 距最近的石座（challenges.json 的 position）
 *   地標  distLand   距最近的地標（LANDMARKS）
 * 樣點以 0.5 m 格點去重（路網的線段在石座／岔口共用端點，同一位置只算一次）；死區沿去重後的樣點圖找連通分量
 * （跨段接縫不會把一段死路切成兩截）。每區輸出四種距離的直方圖（0–15／15–30／30–45／>45 m）與 **>45 m 死區清單**，三種口徑：
 *   encounter  微觸**與**中景都 > 45 m（走 45 m 沒有任何小東西回應你、也沒有中景可看 —— 最嚴格的「空」）
 *   micro      微觸 > 45 m（WORLD §4.4 那條「每 20–30 m 一次反應」的反面）
 *   mid        中景 > 45 m（P11–P16 鋪中景要先看這一欄；石座與地標不算 —— 一根 20 m 高的地標 45 m 外看得到，但那不是「遇到」）
 *
 * 只讀資料、不蓋 three.js 場景（路網與座標都是資料層的常數；跟 world.js 用同一份）。
 *   node scripts/pacing-audit.mjs            印表
 *   node scripts/pacing-audit.mjs --json     印 JSON
 * `test:rubric` 接進來當**軟警告**（印每區死區數，不 fail；但要能跑、回 12 區）。
 * P11（中觀遮擋帶）起每一次鋪中景，先跑這一支，死區數只准變少。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

/** 取樣間距（公尺）。 */
export const SAMPLE_STEP = 5;
/** 直方圖的分界（公尺）：0–15／15–30／30–45／>45。 */
export const BINS = Object.freeze([15, 30, 45]);
export const BIN_LABELS = Object.freeze(['0-15', '15-30', '30-45', '>45']);
/** 死區門檻（公尺）。 */
export const DEAD_ZONE_M = 45;
/** 四種 POI 類別。 */
export const KINDS = Object.freeze(['micro', 'mid', 'marker', 'landmark']);
/** 三種死區口徑。 */
export const DEAD_KINDS = Object.freeze(['encounter', 'micro', 'mid']);
const DEAD_TEST = Object.freeze({
  encounter: (d) => d.micro > DEAD_ZONE_M && d.mid > DEAD_ZONE_M,
  micro: (d) => d.micro > DEAD_ZONE_M,
  mid: (d) => d.mid > DEAD_ZONE_M,
});
export const KIND_ZH = Object.freeze({ micro: '微觸', mid: '中景', marker: '石座', landmark: '地標' });

const binOf = (d) => (d < BINS[0] ? 0 : d < BINS[1] ? 1 : d < BINS[2] ? 2 : 3);

/**
 * 跑一次稽核（純資料）。
 * @param {object} [opts]
 * @param {number} [opts.step]  取樣間距
 * @returns {Promise<{step:number, samples:number, rawSamples:number, segments:number, pois:Record<string,number>,
 *   regions:Record<string,{samples:number, hist:Record<string,number[]>, deadZones:Record<string,Array<{region:string|null, from:number[], to:number[], length:number, samples:number, onBridge:boolean}>>, deadSamples:Record<string,number>, worst:{kind:string, count:number}}>,
 *   deadZones:Record<string,Array>}>}
 */
export async function pacingAudit({ step = SAMPLE_STEP } = {}) {
  const World = await import('../src/world/world.js');
  const Props = await import('../src/world/props.js');
  const Reactive = await import('../src/world/reactive.js');
  const challenges = readJson('src/data/challenges.json').challenges || [];
  const handles = readJson('src/data/handles.json').entries || [];
  const inscriptions = readJson('src/data/inscriptions.json').entries || [];
  const murks = readJson('src/data/murks.json').entries || [];
  // v1.2 · P07：殘頁也是「路上讀得到的東西」，擺位規則要求離路網 ≤12m → 算進中景那一層
  const letters = readJson('src/data/letters.json').entries || [];

  const pois = {
    micro: [
      ...Reactive.REACTIVE_SPOTS.map((s) => ({ id: s.id, x: s.at[0], z: s.at[1] })),
      ...handles.map((h) => ({ id: h.id, x: h.at[0], z: h.at[1] })),
    ],
    mid: [
      ...Props.STORY_VIGNETTES.map((v) => ({ id: v.id, x: v.at[0], z: v.at[1] })),
      ...Props.LORE_TABLETS.map((t) => ({ id: t.id, x: t.at[0], z: t.at[1] })),
      ...inscriptions.map((i) => ({ id: i.id, x: i.at[0], z: i.at[1] })),
      ...murks.map((m) => ({ id: m.id, x: m.at[0], z: m.at[1] })),
      ...letters.map((l) => ({ id: l.id, x: l.at[0], z: l.at[1] })),
    ],
    marker: challenges.filter((c) => c.position).map((c) => ({ id: c.id, x: c.position[0], z: c.position[1] })),
    landmark: Props.LANDMARKS.map((l) => ({ id: l.id, x: l.at[0], z: l.at[1] })),
  };

  const nearest = (list, x, z) => {
    let best = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best) best = d;
    }
    return best;
  };

  // 路網：與 world.js 蓋地面時同一個呼叫
  const segs = Props.buildPathNetwork(World.REGION_SITES, [...World.CORRIDORS, ...World.ANNEX_LINKS], challenges);

  const regions = {};
  for (const site of World.REGION_SITES) {
    regions[site.id] = {
      samples: 0,
      hist: Object.fromEntries(KINDS.map((k) => [k, [0, 0, 0, 0]])),
      deadZones: Object.fromEntries(DEAD_KINDS.map((k) => [k, []])),
      deadSamples: Object.fromEntries(DEAD_KINDS.map((k) => [k, 0])),
    };
  }

  /*
   * 樣點圖：沿每一段路每 step 取樣，但**同一個位置只算一次**（0.5 m 格點去重）——
   * 路網的線段在石座／岔口共用端點，不去重會把同一個點數兩次、死區也會在段與段的接縫被切成兩截。
   * 節點 = 去重後的樣點；邊 = 同一段路上相鄰的兩個樣點（跨段共用端點時自然接起來）。
   */
  const GRID = 0.5;
  const keyOf = (x, z) => `${Math.round(x / GRID)},${Math.round(z / GRID)}`;
  const nodes = new Map(); // key → node
  const edges = new Map(); // key → Set<key>
  let rawSamples = 0;
  const link = (a, b) => {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a).add(b);
    edges.get(b).add(a);
  };
  for (const [ax, az, bx, bz] of segs) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    let prevKey = null;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      rawSamples += 1;
      const key = keyOf(x, z);
      if (!nodes.has(key)) {
        const here = World.regionAt(x, z);
        nodes.set(key, {
          key,
          x,
          z,
          region: here ? here.id : null,
          onBridge: Boolean(here && here.onBridge),
          d: {
            micro: nearest(pois.micro, x, z),
            mid: nearest(pois.mid, x, z),
            marker: nearest(pois.marker, x, z),
            landmark: nearest(pois.landmark, x, z),
          },
        });
      }
      if (prevKey) link(prevKey, key);
      prevKey = key;
    }
  }

  // 直方圖：每個唯一樣點算一次
  for (const node of nodes.values()) {
    const r = node.region ? regions[node.region] : null;
    if (!r) continue;
    r.samples += 1;
    for (const k of KINDS) r.hist[k][binOf(node.d[k])] += 1;
    for (const kind of DEAD_KINDS) if (DEAD_TEST[kind](node.d)) r.deadSamples[kind] += 1;
  }

  /*
   * 死區：在「死的樣點」子圖上找連通分量（同一段路相鄰、或跨段共用端點都算相連）——
   * 一段死路跨過石座／岔口不會被切成兩截。每個分量記：區（分量裡最多樣點的那一區）、
   * 兩端（分量裡距離最遠的兩點）、長度（那兩點的直線距離）、樣點數、是否在橋上。
   */
  const deadZones = Object.fromEntries(DEAD_KINDS.map((k) => [k, []]));
  for (const kind of DEAD_KINDS) {
    const seen = new Set();
    for (const start of nodes.values()) {
      if (seen.has(start.key) || !DEAD_TEST[kind](start.d)) continue;
      const comp = [];
      const stack = [start];
      seen.add(start.key);
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        for (const nk of edges.get(cur.key) || []) {
          if (seen.has(nk)) continue;
          const nb = nodes.get(nk);
          if (!nb || !DEAD_TEST[kind](nb.d)) continue;
          seen.add(nk);
          stack.push(nb);
        }
      }
      // 兩端：分量裡相距最遠的兩點（樣點數小，O(n²) 沒關係）
      let from = comp[0];
      let to = comp[0];
      let best = -1;
      for (let i = 0; i < comp.length; i += 1) {
        for (let j = i; j < comp.length; j += 1) {
          const d = Math.hypot(comp[i].x - comp[j].x, comp[i].z - comp[j].z);
          if (d > best) {
            best = d;
            from = comp[i];
            to = comp[j];
          }
        }
      }
      const byRegion = new Map();
      for (const c of comp) if (c.region) byRegion.set(c.region, (byRegion.get(c.region) || 0) + 1);
      let region = null;
      let rc = -1;
      for (const [id, c] of byRegion) if (c > rc) { rc = c; region = id; }
      const run = {
        region,
        from: [from.x, from.z],
        to: [to.x, to.z],
        length: best,
        samples: comp.length,
        onBridge: comp.every((c) => c.onBridge),
        regions: [...byRegion.keys()],
      };
      deadZones[kind].push(run);
      if (region && regions[region]) regions[region].deadZones[kind].push(run);
    }
    deadZones[kind].sort((a, b) => b.length - a.length);
  }
  const total = nodes.size;

  for (const id of Object.keys(regions)) {
    const r = regions[id];
    // 這一區最缺的那一類（>45 m 的樣點最多）
    let worst = { kind: 'micro', count: -1 };
    for (const k of KINDS) if (r.hist[k][3] > worst.count) worst = { kind: k, count: r.hist[k][3] };
    r.worst = worst;
  }

  return {
    step,
    /** 唯一樣點數（0.5 m 格點去重後）。 */
    samples: total,
    /** 去重前沿段取樣的原始數（同一位置在段與段的接縫會被數兩次）。 */
    rawSamples,
    segments: segs.length,
    pois: Object.fromEntries(KINDS.map((k) => [k, pois[k].length])),
    regions,
    deadZones,
  };
}

/** 一行一區的表（CLI）。 */
export function formatTable(result) {
  const lines = [];
  lines.push(`POI 節奏稽核 · 每 ${result.step} m 取樣 · ${result.segments} 段路 · ${result.samples} 個唯一樣點（去重前 ${result.rawSamples}）· POI 微觸 ${result.pois.micro}／中景 ${result.pois.mid}／石座 ${result.pois.marker}／地標 ${result.pois.landmark}`);
  lines.push('區域            樣點  微觸(0-15/15-30/30-45/>45)  中景(…)            石座(…)            地標(…)         死區段 enc/micro/mid');
  for (const [id, r] of Object.entries(result.regions)) {
    const h = (k) => r.hist[k].map((v) => String(v).padStart(3)).join('/');
    const dz = DEAD_KINDS.map((k) => String(r.deadZones[k].length).padStart(2)).join('/');
    lines.push(`${id.padEnd(15)} ${String(r.samples).padStart(4)}  ${h('micro')}   ${h('mid')}   ${h('marker')}   ${h('landmark')}   ${dz}`);
  }
  for (const kind of DEAD_KINDS) {
    const dz = result.deadZones[kind].slice().sort((a, b) => b.length - a.length);
    lines.push(`死區［${kind}］（${kind === 'encounter' ? '微觸與中景都' : kind === 'micro' ? '微觸' : '中景'} > ${DEAD_ZONE_M} m 的連續樣點）：${dz.length} 段`);
    for (const z of dz.slice(0, 12)) {
      lines.push(
        `  ${String(z.region || '(橋/虛空)').padEnd(14)} ${z.length.toFixed(0).padStart(4)} m · ${String(z.samples).padStart(3)} 點  (${z.from[0].toFixed(0)},${z.from[1].toFixed(0)}) → (${z.to[0].toFixed(0)},${z.to[1].toFixed(0)})${z.onBridge ? '  橋' : ''}`
      );
    }
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await pacingAudit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(formatTable(result));
}

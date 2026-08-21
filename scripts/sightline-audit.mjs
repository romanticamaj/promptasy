#!/usr/bin/env node
/**
 * Promptasy — 視線稽核（v1.2 · P11；research-map 提案 M1 的驗收工具）
 *
 * 「從橋頭進去看不到地標，繞過一道石脊才揭露」這件事不能靠感覺，要量得出來。
 * 這支腳本沿著**真的畫在地上的那條路**（`screens.js` 的 `corridorPolyline()` ——
 * `buildPathNetwork()` 用的是同一份）從橋頭往區內每 3 公尺取一個樣點，
 * 對每個樣點問一句：**站在這裡看得到那座地標嗎？**
 *
 * 判定分兩層（兩層都由 `src/world/screens.js` 的 `landmarkSight()` 算 —— 遊戲與稽核共用一支）：
 *   ① **水平**（＝ P11 規格的門檻，本腳本的 `hidden`）：樣點 → 地標中心的線段，有沒有穿過
 *      某一道遮擋帶的**核心矩形**（`length × depth`；扶壁與頂階不算，量到的一定比看到的少）。
 *   ② **連塔頂也遮住**（本腳本的 `hiddenTip`，額外報告、不當門檻）：擋住的那道帶，
 *      它的頂緣仰角有沒有蓋過地標頂的仰角。一座 26 公尺的塔在 38 公尺外，
 *      要連塔頂那顆光球都壓下去，帶高得有 11 公尺以上 —— 所以規格只用水平那一條當門檻，
 *      這一欄則誠實地告訴你「走到第幾公尺連塔頂都不見了」。
 *
 * 「橋頭」＝**主動線的內端**（`BRIDGE_LANES` 的 b 點，也就是區界再往裡 8 公尺）：
 * 那是橋的淨空結束、土地開始的地方，也是所有擺位規則的基準。
 * 站在更外面（區界、閘門）還看得到塔頂 —— 那是地標當北極星的本分，
 * 腳本會另外把那兩點的結果印出來（`beyond`），不列入硬門檻。
 *
 * 輸出：每一區「從入口起前 N 公尺看不到、第 M 公尺揭露」。
 * `test:rubric` 拿它當**硬斷言**：有遮擋帶的區 → 前 12 公尺看不到、25 公尺內一定看得到。
 *
 *   node scripts/sightline-audit.mjs           印表
 *   node scripts/sightline-audit.mjs --json    印 JSON
 *
 * 純資料、不蓋 three.js 場景（座標、地形高度、遮擋帶都是資料層）。P12 鋪其他 11 區時
 * 這支腳本一個字都不用改：資料進 `SCREEN_BANDS`，這裡自動多量一區。
 */
import { fileURLToPath } from 'node:url';

/** 取樣間距（公尺）。 */
export const SAMPLE_STEP = 3;
/** 橋頭：區界再往區內幾公尺（＝ BRIDGE_LANES 的內端）。 */
export const BRIDGE_HEAD_INSET = 8;
/*
 * 眼睛離地寫在 `src/world/screens.js`（`landmarkSight()` 真的在用的那一個）——
 * 這裡不再複製一份常數：兩份數字只有一份有效，改錯的那一份會「看起來有動、其實沒動」。
 */
/** 硬門檻：入口起至少這麼多公尺看不到地標。 */
export const HIDDEN_MIN = 12;
/** 硬門檻：走到這麼多公尺內一定看得到（擋住但不迷路）。 */
export const REVEAL_MAX = 25;

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** 把折線切成等距樣點（含起點）。 */
function sampleAlong(points, step, stopBefore) {
  const out = [];
  let arc = 0;
  let carry = 0;
  out.push({ arc: 0, at: points[0] });
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const len = dist2(a, b);
    if (len < 1e-6) continue;
    let t = (step - carry) / len;
    while (t <= 1) {
      const p = lerp2(a, b, t);
      const nextArc = arc + len * t;
      if (stopBefore && stopBefore(p)) return out;
      out.push({ arc: nextArc, at: p });
      t += step / len;
    }
    const used = out.length ? out[out.length - 1].arc : 0;
    arc += len;
    carry = arc - used;
  }
  return out;
}

/**
 * 跑一次視線稽核。
 * @param {object} [opts]
 * @param {number} [opts.step] 取樣間距
 * @param {object[]} [opts.bands] 換掉出貨的遮擋帶（`scripts/screen-fit.mjs` 的搜尋迴圈用）
 * @param {Record<string, number[][]>} [opts.bends] 換掉出貨的折點表（同上）
 * @returns {Promise<{step:number, regions:Record<string, object>}>}
 */
export async function sightlineAudit({ step = SAMPLE_STEP, bands: bandsIn = null, bends = undefined } = {}) {
  const World = await import('../src/world/world.js');
  const Props = await import('../src/world/props.js');
  const Screens = await import('../src/world/screens.js');

  const allBands = bandsIn || Screens.SCREEN_BANDS;
  const landmarkOf = (regionId) => Props.LANDMARKS.find((l) => l.region === regionId) || null;
  const bandsOf = (regionId) => allBands.filter((b) => b.region === regionId);

  const regions = {};
  for (const site of World.REGION_SITES) {
    const landmark = landmarkOf(site.id);
    if (!landmark) continue;
    const bands = bandsOf(site.id);
    const corridor = World.CORRIDORS.find((c) => c.region === site.id);
    const link = World.ANNEX_LINKS.find((a) => a.region === site.id);
    if (!corridor && !link) continue;

    // 橋頭：主動線的內端（區界再往裡 8 公尺）。加建的院落沒有橋 → 從頸口的閘門往裡量。
    const dir = (corridor || link).dir;
    const from = (corridor || link).from;
    const along = corridor
      ? corridor.length - site.radius + BRIDGE_HEAD_INSET
      : link.gateAt + BRIDGE_HEAD_INSET;
    const entry = [from.x + dir.x * along, from.z + dir.z * along];
    // 參考點（不列入硬門檻）：區界、閘門
    const edge = corridor
      ? [from.x + dir.x * (corridor.length - site.radius), from.z + dir.z * (corridor.length - site.radius)]
      : [link.gate.x, link.gate.z];
    const gate = [(corridor || link).gate.x, (corridor || link).gate.z];

    // 走出來的那條路（與 buildPathNetwork 同一份），從橋頭開始
    const poly = Screens.corridorPolyline(corridor || { from, to: { x: site.x, z: site.z }, region: site.id }, bends);
    /*
     * 裁掉橋頭以前的那一段：**照折線的弧長算**，不是照「離中央高原多遠」。
     * 用半徑裁的話，只要有一個折點是往回彎的（把遮擋帶擺在側邊就會這樣），
     * 它就會被默默丟掉 —— 稽核量到的路與地上畫的路從此各走各的（P11 審查抓到的）。
     */
    const entryD = dist2([from.x, from.z], entry);
    const route = [entry];
    {
      let arc = 0;
      for (let i = 1; i < poly.length; i += 1) {
        arc += dist2(poly[i - 1], poly[i]);
        if (arc > entryD + 0.5) route.push(poly[i]);
      }
    }
    if (dist2(route[route.length - 1], landmark.at) > 0.5) route.push([landmark.at[0], landmark.at[1]]);

    /*
     * 判定走的是 `src/world/screens.js` 的 `landmarkSight()` —— **遊戲裡的 e2e 問的是同一支**，
     * 稽核腳本不另外寫一份（不然兩邊會各說各話）。
     * 這裡回傳兩個欄位，名字與 `landmarkSight()` 的**剛好對調**，讀的時候要小心：
     *   `hidden`    ＝ `landmarkSight().flat` ＝ **只看水平**有沒有被帶身擋住（＝ P11 規格的硬門檻）。
     *   `hiddenTip` ＝ `landmarkSight().hidden` ＝ 水平擋住**且**帶頂還蓋過塔頂（更嚴，只當參考）。
     * 硬門檻一律讀 `hidden`；想要更嚴的版本才讀 `hiddenTip`。
     */
    const look = (p) => {
      const r = Screens.landmarkSight(p[0], p[1], landmark, World.terrainHeight, bands);
      return { hidden: r.flat, hiddenTip: r.hidden, by: r.by };
    };

    // 走進地標的留白圈就不用問了（站在塔腳下當然看得到）
    const samples = sampleAlong(route, step, (p) => dist2(p, landmark.at) < landmark.clear).map((s) => ({
      arc: Number(s.arc.toFixed(2)),
      at: [Number(s.at[0].toFixed(2)), Number(s.at[1].toFixed(2))],
      ...look(s.at),
    }));

    const firstVisible = samples.find((s) => !s.hidden);
    const firstTip = samples.find((s) => !s.hiddenTip);
    const hiddenFor = firstVisible ? firstVisible.arc : Infinity;
    // 揭露 ＝ 從這一點之後就一直看得到（不會再被擋回去）
    let revealAt = Infinity;
    for (let i = 0; i < samples.length; i += 1) {
      if (samples.slice(i).every((s) => !s.hidden)) {
        revealAt = samples[i].arc;
        break;
      }
    }

    regions[site.id] = {
      landmark: { id: landmark.id, at: landmark.at, height: landmark.height, clear: landmark.clear },
      bands: bands.map((b) => b.id),
      entry: [Number(entry[0].toFixed(2)), Number(entry[1].toFixed(2))],
      routePoints: route.length,
      routeLength: Number(route.reduce((a, p, i) => (i ? a + dist2(route[i - 1], p) : 0), 0).toFixed(2)),
      samples,
      hiddenFor,
      revealAt,
      hiddenForTip: firstTip ? firstTip.arc : Infinity,
      beyond: {
        edge: look(edge),
        gate: look(gate),
      },
      pass: bands.length === 0 ? null : hiddenFor >= HIDDEN_MIN && revealAt <= REVEAL_MAX,
    };
  }

  return { step, hiddenMin: HIDDEN_MIN, revealMax: REVEAL_MAX, regions };
}

const say = (o) => (o.hidden ? (o.hiddenTip ? '看不到' : '只剩塔頂') : '看得到');

function print(audit) {
  const rows = Object.entries(audit.regions);
  console.log(`視線稽核 · 每 ${audit.step} 公尺一個樣點 · 門檻：前 ${audit.hiddenMin}m 看不到、${audit.revealMax}m 內揭露\n`);
  for (const [id, r] of rows) {
    const tag = r.bands.length ? (r.pass ? '✓' : '✗') : '·';
    const hid = Number.isFinite(r.hiddenFor) ? `${r.hiddenFor}m` : '整條路都看不到';
    const rev = Number.isFinite(r.revealAt) ? `${r.revealAt}m` : '沒有揭露';
    console.log(
      `${tag} ${id.padEnd(14)} 遮擋帶 ${String(r.bands.length).padStart(2)} 道 · ` +
        `前 ${hid} 看不到、第 ${rev} 揭露 · 路長 ${r.routeLength}m`
    );
    if (r.bands.length) {
      console.log(
        `    橋頭 ${r.entry.join(', ')} → ${r.landmark.id}（高 ${r.landmark.height}m）｜` +
          `區界 ${say(r.beyond.edge)}、閘門 ${say(r.beyond.gate)}`
      );
      const tip = Number.isFinite(r.hiddenForTip) ? `${r.hiddenForTip}m` : '整條路都看不到';
      console.log(`    連塔頂也遮住：前 ${tip}（× 擋住 / ○ 看得到 / ▲ 只剩塔頂）`);
      const line = r.samples.map((s) => `${s.arc}${s.hidden ? (s.hiddenTip ? '×' : '▲') : '○'}`).join(' ');
      console.log(`    ${line}`);
    }
  }
  const measured = rows.filter(([, r]) => r.bands.length);
  console.log(`\n有遮擋帶的區：${measured.length}／${rows.length}；通過：${measured.filter(([, r]) => r.pass).length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const audit = await sightlineAudit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(audit, null, 2));
  else print(audit);
  const bad = Object.entries(audit.regions).filter(([, r]) => r.pass === false);
  if (bad.length) {
    console.error(`\n✗ ${bad.map(([id]) => id).join('、')} 沒有通過門檻`);
    process.exit(1);
  }
}

export default { sightlineAudit, SAMPLE_STEP, HIDDEN_MIN, REVEAL_MAX };

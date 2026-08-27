/**
 * Promptasy — 在 node 裡把整個世界真的蓋起來（v1.2 · P12 抽出來的共用件）
 *
 * `test:rubric` 的碰撞區段從 Phase 8 起就是這樣做的：世界是用 three.js 場景圖組出來的，
 * 碰撞登記表也是從場景圖掃出來的 —— 所以要驗擺位就得**真的蓋一次**。
 * P12 的 `scripts/screen-fit.mjs`（「改資料 → 重建世界 → 量」的搜尋迴圈）需要同一件事，
 * 於是把「補 canvas 替身 ＋ 讀資料檔 ＋ createWorld 的那一包參數」抽到這裡，
 * 兩邊蓋出來的世界**逐位元組相同**（不然搜出來的座標在測試裡會是另一個世界的座標）。
 *
 * 缺的只有 canvas（文字貼圖 / 光暈貼圖），補一個什麼方法都吞下去的替身即可；
 * 碰撞判定與擺位完全不碰貼圖。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');

/** 讀一份 repo 內的 json。 */
export const readJson = (p) => JSON.parse(readFileSync(resolve(repoRoot, p), 'utf8'));

const anyStub = () =>
  new Proxy(
    { width: 8, height: 8 },
    { get: (t, k) => (k in t ? t[k] : () => anyStub()), set: (t, k, v) => ((t[k] = v), true) }
  );

/**
 * 裝上 canvas 替身。回傳一支還原函式（測試在蓋完世界之後要立刻還原，
 * 不然後面驗 DOM 的段落會拿到替身）。
 */
export function installCanvasStub() {
  const real = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => anyStub() }),
  };
  return () => {
    globalThis.document = real;
    if (!real) delete globalThis.document;
  };
}

/** 進度替身：全部解鎖、什麼都沒做過（擺位與碰撞不看進度）。 */
export const stubProgression = Object.freeze({
  bestGrade: () => null,
  gateStatus: () => ({ unlocked: false, text: '' }),
  isRegionUnlocked: () => true,
  hasReadLore: () => false,
  hasFoundInscription: () => false,
  hasFoundSecret: () => false,
  hasUsedHandle: () => false,
  hasFoundLetter: () => false,
});

/**
 * `createWorld()` 的那一包參數（資料檔全部讀進來 —— 每一層都會影響 `keepClear`，
 * 少一層就是在驗一個永遠不會出貨的佈局，見 findings「P06c 的發現」）。
 * @returns {Promise<object>}
 */
export async function worldOptions() {
  const curriculum = readJson('src/data/curriculum.json');
  const { createCatalog } = await import('../src/challenges/catalog.js');
  const catalog = createCatalog({
    curriculum,
    skillCodex: readJson('src/data/skill-codex-v2.json'),
    regions: readJson('src/data/regions-v2.json'),
  });
  return {
    curriculum,
    regions: catalog.implementedRegions(),
    challenges: readJson('src/data/challenges.json').challenges,
    progression: stubProgression,
    shrine: readJson('src/data/prologue.json').shrine,
    inscriptions: readJson('src/data/inscriptions.json').entries,
    letters: readJson('src/data/letters.json').entries,
    secrets: readJson('src/data/secrets.json').entries,
    handles: readJson('src/data/handles.json').entries,
    murks: readJson('src/data/murks.json').entries,
    watchmen: readJson('src/data/watchmen.json').entries,
    // v1.2 · P20a：回聲重演（坐在小景旁邊的一團光）—— 它也進 keepClear 之外的每一條擺位規則
    echoes: readJson('src/data/echoes.json').entries,
    // v1.2 · P18：守門者（一位就是一筆 —— 那份資料本身就是他）
    guardians: [readJson('src/data/guardian.json')],
    /*
     * v1.2 · P20b：檔案廊。它也進 `keepClear`，所以少了這一層就是在驗一個
     * 永遠不會出貨的佈局（findings「P06c 的發現」）。展品一片一條技法 ——
     * 這裡把技法 id 也餵進去，`test:rubric` 量到的三角形才是真的出貨的那個數字。
     */
    archives: readJson('src/data/archive.json').halls,
    archiveSkillIdsOf: (regionId) => catalog.regionSkills(regionId).map((s) => s.id),
  };
}

/**
 * 蓋一次世界（約 0.5 秒）。
 * @param {object} [opts]
 * @param {'high'|'low'} [opts.quality]
 * @param {object} [opts.screens] 中觀層的替代資料 `{ bands, motifs, bends }`（搜尋迴圈用）
 * @param {object} [opts.base] 已經讀好的 `worldOptions()`（連續蓋很多次時省掉重讀 json）
 * @returns {Promise<{scene:object, world:object, THREE:object}>}
 */
export async function buildWorld({ quality = 'high', screens = null, base = null } = {}) {
  const restore = installCanvasStub();
  try {
    const THREE = await import('three');
    const World = await import('../src/world/world.js');
    const opts = base || (await worldOptions());
    const scene = new THREE.Scene();
    const world = World.createWorld({
      engine: { scene, camera: {}, onUpdate() {} },
      quality,
      screens,
      ...opts,
    });
    return { scene, world, THREE };
  } finally {
    restore();
  }
}

export default { buildWorld, worldOptions, stubProgression, installCanvasStub, readJson, repoRoot };

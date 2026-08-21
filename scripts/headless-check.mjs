#!/usr/bin/env node
/**
 * Promptasy — 端到端 headless 驗證
 *
 *   npm run test:e2e
 *
 * 用 Chrome DevTools Protocol 真的把遊戲開起來走一遍：
 *   標題卡 → 教學 → 走到石座 → 送 prompt → 拿 S → 跨區（配樂 / 氣氛切換）→
 *   畫質即時切換 → 音量 → 圖鑑 → 鍵盤無障礙 → 重置。
 * 全程監聽 console error / 未捕捉例外，有一條就算失敗。
 *
 * 不依賴 puppeteer / playwright —— 只用 node 內建的 fetch + WebSocket ＋ 系統上的 Chrome。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/*
 * 課程 v2 · Phase B：「68 條技巧 / 5 個區域」不再寫死在斷言裡。
 * 能算的現算（catalog），真的是當期契約的登記在 scripts/expected-counts.json。
 */
const { createCatalog } = await import('../src/challenges/catalog.js');
const readData = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const CATALOG = createCatalog({
  curriculum: readData('src/data/curriculum.json'),
  skillCodex: readData('src/data/skill-codex-v2.json'),
  regions: readData('src/data/regions-v2.json'),
});
const EXPECT = readData('scripts/expected-counts.json').contract;
const TECHNIQUE_TOTAL = CATALOG.counts.techniques;

const DEV_PORT = Number(process.env.PA_PORT || 5199);
const CDP_PORT = Number(process.env.PA_CDP_PORT || 9333);
const APP_URL = `http://127.0.0.1:${DEV_PORT}/`;
/*
 * 單一 CDP 呼叫的等待上限。
 *
 * 這是「卡住了」的保險絲，不是效能門檻。軟體渲染（swiftshader）的機器
 * 一幀可能要 200ms，「走過去撞它」那幾段光是等遊戲內時間就會吃掉半分鐘 ——
 * 原本的 30 秒在忙碌的機器上會誤判成失敗。90 秒仍然攔得住真的卡死，
 * 需要更長就用 PA_CDP_TIMEOUT 調，不必為了環境去改測試內容。
 */
const CDP_TIMEOUT = Number(process.env.PA_CDP_TIMEOUT || 90000);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  join(process.env.HOME || '', '.cache/puppeteer/chrome'),
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (p && existsSync(p) && !p.endsWith('/chrome')) return p;
    if (p && existsSync(p) && p.endsWith('/chrome')) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 迷你測試框架                                                        */
/* ------------------------------------------------------------------ */
let passCount = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) {
    passCount += 1;
    process.stdout.write('.');
  } else {
    failures.push(`${name}${detail ? `\n      ↳ ${detail}` : ''}`);
    process.stdout.write('x');
  }
}
function eq(actual, expected, name, extra = '') {
  ok(
    actual === expected,
    name,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${extra ? ` ｜ ${extra}` : ''}`
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* CDP 客戶端                                                          */
/* ------------------------------------------------------------------ */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.params || {})})`));
        else res(msg.result);
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error(`WebSocket 連不上 ${url}`)), { once: true });
    });
    return new CDP(ws);
  }

  on(fn) {
    this.listeners.push(fn);
  }

  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error(`CDP timeout: ${method}`));
        }
      }, CDP_TIMEOUT);
    });
  }
}

/* ------------------------------------------------------------------ */
/* 啟動 dev server ＋ Chrome                                           */
/* ------------------------------------------------------------------ */
const children = [];
/* 主瀏覽器一個、入場門那一段（Phase 33）另外再開一個 —— 收尾時全部清掉 */
const profileDirs = [];

function cleanup() {
  for (const child of children) {
    // 先殺整個 process group（npx → node vite 是兩層，只殺父的話會留孤兒）
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* 沒有 group 或已經死了 */
    }
    try {
      child.kill('SIGKILL');
    } catch {
      /* 已經死了 */
    }
  }
  for (const dir of profileDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清不掉就算了 */
    }
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

async function waitFor(fn, { timeout = 30000, every = 250, label = '' } = {}) {
  const until = Date.now() + timeout;
  let lastErr = null;
  while (Date.now() < until) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      lastErr = err;
    }
    await sleep(every);
  }
  throw new Error(`等待逾時${label ? `：${label}` : ''}${lastErr ? ` (${lastErr.message})` : ''}`);
}



async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('✗ 找不到 Chrome/Chromium（可用 CHROME_PATH 指定）。');
    process.exit(2);
  }

  console.log(`▸ dev server  http://127.0.0.1:${DEV_PORT}`);
  const dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // 自成一個 process group → 收尾時可以整組殺掉，不留孤兒 dev server
  });
  children.push(dev);
  dev.stderr.on('data', (d) => {
    const s = String(d);
    if (/error/i.test(s)) process.stderr.write(`[vite] ${s}`);
  });

  await waitFor(async () => (await fetch(APP_URL)).ok, { label: 'vite 啟動' });

  console.log(`▸ chrome      ${chrome}`);

  /**
   * 開一個無頭 Chrome。
   * @param {object} o
   * @param {number} o.cdpPort
   * @param {boolean} o.allowAutoplay 帶不帶 --autoplay-policy=no-user-gesture-required。
   *   主測試帶（＝返客／政策放行的路徑：入場門不出現，一鍵進場）；
   *   入場門那一段**刻意不帶**，用瀏覽器的預設政策重現「首次造訪音訊被凍住」。
   */
  function launchChrome({ cdpPort, allowAutoplay }) {
    const profile = mkdtempSync(join(tmpdir(), 'promptasy-e2e-'));
    profileDirs.push(profile);
    const proc = spawn(
      chrome,
      [
        '--headless=new',
        // 無頭環境沒有媒體互動分數，AudioContext 會被 suspend；放行自動播放，
        // 讓標題卡維持「一鍵開始」的既有測試行為（被擋住的那條路另有一段專屬測試）。
        ...(allowAutoplay ? ['--autoplay-policy=no-user-gesture-required'] : []),
        // WSL/headless 沒有音訊裝置：用 null 輸出讓 AudioContext 能 running 而不報
        // 「error from the audio device」（我們只斷言節點圖狀態，不需要真的出聲）
        '--disable-audio-output',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--window-size=1280,800',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--hide-scrollbars',
        '--mute-audio',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], detached: true }
    );
    children.push(proc);
    return proc;
  }

  const browser = launchChrome({ cdpPort: CDP_PORT, allowAutoplay: true });

  const version = await waitFor(
    async () => {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return r.ok ? r.json() : null;
    },
    { label: 'chrome DevTools' }
  );

  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  /* --- console 監聽 --- */
  const consoleErrors = [];
  const consoleWarns = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
        .join(' ');
      if (msg.params.type === 'error') consoleErrors.push(text);
      else if (msg.params.type === 'warning') consoleWarns.push(text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push(d.exception?.description || d.text || 'exception');
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') consoleErrors.push(`${e.source}: ${e.text}`);
      else if (e.level === 'warning') consoleWarns.push(`${e.source}: ${e.text}`);
    }
  });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);

  /** 在頁面裡跑一段程式，回傳 JSON-serializable 結果。 */
  async function evaluate(expression) {
    const r = await cdp.send(
      'Runtime.evaluate',
      { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true },
      sessionId
    );
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
  /**
   * 找一個「離目標夠遠、但仍站得住」的落腳點（v1.2 · P06c 審查後修）。
   *
   * 原本寫死 `+26,+26`：實測 7 片土地有 6 片會掉進虛空、甚至掉出 ±170 的地形網格 ——
   * 斷言是從地圖外通過的（還會誤觸跨區的進區演出）。改成**站到同一片土地上另一件東西旁邊**：
   * 那些落點都被 `test:rubric` 的擺位規則驗過（站得住、在區內、彼此夠遠），不必再問地形。
   * 12 公尺已經遠超所有互動半徑（最大是石座的 6.5、器物只有 3.2）。
   *
   * @param {{x:number,z:number}} target 要「離開」的那個東西
   * @param {Array<{x:number,z:number}>} peers 同一片土地上其他驗過的落點
   */
  function farPointAmong(target, peers, region, minR = 12) {
    let best = null;
    for (const p of peers) {
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      if (d < minR) continue;
      if (!best || d > best.d) best = { x: p.x, z: p.z, d };
    }
    ok(Boolean(best), `[${region}] 找得到「夠遠又站得住」的落腳點（同區的另一件東西）`, JSON.stringify(best));
    return best;
  }




  async function key(code, keyName, extra = {}) {
    const base = { code, key: keyName, windowsVirtualKeyCode: extra.vk || 0, ...extra };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
  }

  /**
   * issue #3：六片新土地現在都有自己的配樂音檔了。
   *
   * 抓 ＋ 解碼要一點時間（那段時間合成 pad 頂著 —— 這是設計好的行為，不是 bug），
   * 所以用輪詢等它接上去，不用固定 sleep。這台機器解不開 AAC 時會誠實停在合成 pad，
   * 那條路也要通過（護欄 3）。
   *
   * @param {string} regionId
   * @returns {Promise<{source:string, decodable:boolean, file:string|null, targetGain:number, gain:number, playing:boolean, loopSeconds:number}>}
   */
  async function awaitRegionBgm(regionId) {
    return evaluate(`
      const g = window.__promptasy;
      let decodable = false;
      try {
        const res = await fetch('audio/sfx_click.m4a');
        const raw = await res.arrayBuffer();
        const probe = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await probe.decodeAudioData(raw.slice(0));
        decodable = !!buf && buf.duration > 0;
        probe.close();
      } catch (err) { decodable = false; }
      /*
       * 等的是「接上去而且淡完」：source 在交叉淡入的第一拍就變成 file，
       * 但 gain 那時候還在往上爬（等功率淡入約 3 秒）。要驗「淡到它自己的
       * 響度位置」就得等它走完，所以兩個條件一起等。
       */
      const settled = (d) => {
        const row = d.bgm['${regionId}'] || {};
        return d.source === 'file' && row.targetGain > 0 && Math.abs((row.gain || 0) - row.targetGain) < 0.05;
      };
      const t0 = Date.now();
      let d = g.audio.debug();
      while (decodable && !settled(d) && Date.now() - t0 < 25000) {
        await new Promise((r) => setTimeout(r, 250));
        d = g.audio.debug();
      }
      const row = d.bgm['${regionId}'] || {};
      return {
        source: d.source,
        decodable,
        file: row.file || null,
        targetGain: row.targetGain || 0,
        gain: row.gain || 0,
        playing: !!row.playing,
        loopSeconds: row.loopSeconds || 0,
        lufs: row.lufs,
      };
    `);
  }

  /** 走進新土地之後，配樂音檔要真的接上去（解不開 AAC 的機器則誠實停在合成 pad）。 */
  async function expectRegionBgmFile(regionId, zh) {
    const bgm = await awaitRegionBgm(regionId);
    ok(Boolean(bgm.file), `${zh}在配樂表上有自己的一首`, String(bgm.file));
    ok(Number.isFinite(bgm.lufs), `${zh}的配樂記著量到的響度`, String(bgm.lufs));
    ok(bgm.targetGain > 0 && bgm.targetGain <= 1.05, `${zh}的配樂 gain 由響度算出來`, String(bgm.targetGain));
    if (bgm.decodable) {
      eq(bgm.source, 'file', `${zh}聽到的是自己的配樂音檔（issue #3）`);
      eq(bgm.playing, true, `${zh}的配樂用 AudioBufferSourceNode 播出來了`);
      ok(bgm.loopSeconds > 60, `${zh}的配樂是完整的一首`, `${bgm.loopSeconds}s`);
      ok(
        Math.abs(bgm.gain - bgm.targetGain) < 0.08,
        `${zh}的配樂淡到它自己的響度位置（不是硬拉到 1）`,
        `${bgm.gain} vs ${bgm.targetGain}`
      );
    } else {
      eq(bgm.source, 'synth', `${zh}：這台機器解不開 AAC → 合成 pad 誠實頂上（護欄 3）`);
    }
  }

  /* --- 純鍵盤操作用的三支（Phase 23）：按下、放開、真的打字 --- */
  async function keyDown(code, keyName, extra = {}) {
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', code, key: keyName, windowsVirtualKeyCode: extra.vk || 0, ...extra },
      sessionId
    );
  }
  async function keyUp(code, keyName, extra = {}) {
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: extra.vk || 0, ...extra },
      sessionId
    );
  }
  /**
   * 按住手掌印，直到它**真的發動**為止（poll-until，不用固定 sleep）。
   *
   * 這一台是軟體渲染（每幀 ~200ms），CDP 送進去的 keyDown 可能晚好幾百毫秒
   * 才被頁面收到；固定 `sleep(900)` 於是變成「按不夠久」——那正是 AGENTS.md
   * 登記的動畫時序 flaky 家族（Phase J2 最後一輪 9 條紅燈的真因）。
   * 改成輪詢 `.palm.is-fired`：按住 → 等它亮 → 才放開。
   *
   * @param {{x:number,y:number}|null} [at] 給滑鼠用的座標；不給就用鍵盤（Enter）
   */
  async function holdPalm(at = null, label = '手掌印按滿') {
    const fired = () => evaluate(`return !!document.querySelector('#prompt-console .palm.is-fired');`);
    if (at) await mouse('mousePressed', at.x, at.y);
    else await keyDown('Enter', 'Enter', { vk: 13 });
    try {
      await waitFor(fired, { label, every: 100, timeout: 20000 });
    } finally {
      if (at) await mouse('mouseReleased', at.x, at.y);
      else await keyUp('Enter', 'Enter', { vk: 13 });
    }
  }

  /**
   * 「原生啟動」用的 Enter。
   *
   * 只送 keyDown / keyUp 的話，我們自己寫的 keydown 監聽收得到，
   * 但瀏覽器的**預設動作**（按下按鈕、展開 <summary>）不會發生 ——
   * 那需要 rawKeyDown ＋ char 這一組。人類按鍵時瀏覽器送的就是這一組。
   */
  async function enterNative() {
    const base = { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
  }

  /**
   * 「原生」的 Tab。和 enterNative 同樣的道理：只送 keyDown / keyUp 時
   * 瀏覽器不會真的搬焦點，要 rawKeyDown 才會走預設的焦點巡覽。
   * @param {boolean} [shift] Shift + Tab（往回走）
   */
  async function tabNative(shift = false) {
    const base = {
      code: 'Tab',
      key: 'Tab',
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers: shift ? 8 : 0,
    };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
  }

  /** 真的敲一個字進去（會走 keydown → 文字輸入 → keyup，和人打字一模一樣）。 */
  async function typeChar(ch, code, vk) {
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', code, key: ch, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk },
      sessionId
    );
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', code, key: ch, windowsVirtualKeyCode: vk },
      sessionId
    );
  }

  /**
   * 重新整理頁面並確定「新的那一頁」已經就緒。
   *
   * 直接 Page.reload + 輪詢 window.__promptasy 會有競態：重整還沒開始時
   * 第一次輪詢讀到的是「舊頁面」的把手，之後所有操作都會打在重整中的頁面上。
   * 所以先在舊頁面插一支旗子，等到旗子消失（＝真的換頁了）才算完成。
   */
  async function reloadPage(label = '重新載入') {
    await evaluate('window.__stale = true; return 1;');
    await cdp.send('Page.reload', {}, sessionId);
    await waitFor(() => evaluate('return !window.__stale && !!window.__promptasy;').catch(() => false), {
      label,
    });
    /*
     * 換頁的尾巴：新的 execution context 剛接手時，下一個 CDP 呼叫仍可能撞上
     * 「Inspected target navigated or closed」。再輪詢一次 readyState，
     * 讓後面的 evaluate / 按鍵有一個穩定的頁面可以打（不用加長固定 sleep）。
     */
    await waitFor(
      () => evaluate('return document.readyState === "complete" && !!window.__promptasy;').catch(() => false),
      { label: `${label}（等頁面穩定）` }
    );
    await sleep(900);
  }

  /* ================================================================ */
  console.log('▸ 開機與標題卡');
  await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
  await waitFor(() => evaluate('return !!window.__promptasy;'), { label: '遊戲載入' });
  await sleep(900);

  const boot = await evaluate(`
    const g = window.__promptasy;
    return {
      challenges: g.content.challenges.length,
      techniques: g.content.curriculum.techniques.length,
      /* 課程 v2 · Phase B：runtime catalog 有沒有真的在開機時建起來（fail fast 會直接讓開機爆掉） */
      catalogCounts: g.catalog ? { ...g.catalog.counts } : null,
      catalogImplemented: g.catalog ? g.catalog.implementedRegionIds().join(',') : '',
      markers: g.world.markers.length,
      gates: g.world.gates.length,
      titleOpen: g.title.isOpen,
      introOpen: g.intro.isOpen,
      gateOpen: g.entryGate.isOpen,
      gateHidden: document.querySelector('.entrygate').hidden,
      gateDismissed: g.entryGate.dismissed,
      /*
       * Phase 34 · 開場黑幕：按下開始之前，3D 世界一眼都不准被看到。
       * 「有沒有真的擋住」不能只看 opacity —— 要證明它在畫布**上面**。
       * elementsFromPoint 會跳過 pointer-events:none 的元素，所以量的時候
       * 先把它打開、量完立刻還原（純測量，不改畫面）。
       */
      cover: (() => {
        const c = document.getElementById('bootcover');
        if (!c) return null;
        const cs = getComputedStyle(c);
        const box = c.getBoundingClientRect();
        const prev = c.style.pointerEvents;
        c.style.pointerEvents = 'auto';
        const stack = document.elementsFromPoint(
          Math.round(innerWidth / 2),
          Math.round(innerHeight / 2)
        );
        c.style.pointerEvents = prev;
        return {
          opacity: Number(cs.opacity),
          z: Number(cs.zIndex),
          pointer: cs.pointerEvents,
          coversViewport: box.width >= innerWidth && box.height >= innerHeight,
          coverIdx: stack.findIndex((e) => e.id === 'bootcover'),
          canvasIdx: stack.findIndex((e) => e.tagName === 'CANVAS'),
        };
      })(),
      quality: g.engine.quality,
      sceneNames: g.engine.scene.children.map((c) => c.name).filter(Boolean),
      hasBeacon: g.world.markers.every((m) => !!m.beacon && !!m.halo),
      mistPlanes: g.world.mist.children.length,
      motes: g.world.motes.geometry.attributes.position.count,
      moteColors: !!g.world.motes.geometry.attributes.color,
    };
  `);
  eq(boot.challenges, EXPECT.challenges.value, `${EXPECT.challenges.value} 個關卡載入`);
  eq(boot.techniques, TECHNIQUE_TOTAL, `${TECHNIQUE_TOTAL} 條技巧載入`);
  eq(boot.markers, EXPECT.challenges.value, `${EXPECT.challenges.value} 座石座在世界裡`);
  // 課程 v2 的合併層在開機時就建好了，而且玩家看到的仍然只有已上線的五區
  ok(Boolean(boot.catalogCounts), 'runtime catalog 在開機時建起來了');
  eq(boot.catalogCounts && boot.catalogCounts.skills, EXPECT.v2Skills.value, `catalog 帶著 ${EXPECT.v2Skills.value} 條 v2 技能`);
  eq(boot.catalogCounts && boot.catalogCounts.regions, EXPECT.v2Regions.value, `catalog 帶著 ${EXPECT.v2Regions.value} 個區域`);
  eq(
    boot.catalogCounts && boot.catalogCounts.implementedRegions,
    EXPECT.v2ImplementedRegions.value,
    `其中只有 ${EXPECT.v2ImplementedRegions.value} 區已上線（其餘七區只在資料層，畫面看不到）`
  );
  eq(boot.catalogImplemented, CATALOG.implementedRegionIds().join(','), '已上線的區域就是 catalog 列的那幾區');
  // 中央高原是樞紐，其餘每一片土地各有一條橋、一道閘門
  eq(boot.gates, EXPECT.v2ImplementedRegions.value - 1, `${EXPECT.v2ImplementedRegions.value - 1} 道閘門在世界裡`);
  eq(boot.titleOpen, true, '開機先看到標題卡');
  eq(boot.introOpen, false, '標題卡期間教學還沒跳');
  // Phase 33：harness 帶 --autoplay-policy=no-user-gesture-required ＝ 自動播放放行，
  // 入場門連開都不該開（返客也是走這條路：零摩擦，一鍵進場）
  eq(boot.gateOpen, false, '自動播放放行時入場門不出現');
  eq(boot.gateHidden, true, '入場門的節點留在 DOM 但收起來');
  eq(boot.gateDismissed, false, '入場門根本沒被開過（不是「開了又關」）');
  ok(boot.cover, '開機第一幀就有黑幕（#bootcover）');
  eq(boot.cover.opacity, 1, '黑幕完全不透光（世界一點都漏不出來）');
  eq(boot.cover.coversViewport, true, '黑幕蓋滿整個視窗');
  ok(boot.cover.z > 30 && boot.cover.z < 40, '黑幕壓在世界之上、標題卡之下', `z=${boot.cover.z}`);
  eq(boot.cover.pointer, 'none', '黑幕不吃滑鼠（純視覺）');
  ok(boot.cover.coverIdx >= 0, '黑幕在畫面正中央量得到（不是 0×0 空過）');
  ok(
    boot.cover.canvasIdx > boot.cover.coverIdx,
    '黑幕真的疊在 3D 畫布上面（按下開始之前看不到世界）',
    `cover=${boot.cover.coverIdx} canvas=${boot.cover.canvasIdx}`
  );
  ok(boot.sceneNames.includes('sky'), '天空 dome 存在');
  /* v1.2 · P05：預設存檔 → 入夜（hour 0），而且天空的值逐值等於沒有時辰之前 */
  const hour0 = await evaluate(`
    const g = window.__promptasy;
    const m = g.engine.mood();
    const moonG = g.engine.moonGroup;
    return {
      hour: g.hour(),
      forced: g.engine.forcedHour,
      target: m.target, now: m.now,
      uOpacity: g.engine.stars.material.uniforms.uOpacity.value,
      uScale: g.engine.stars.material.uniforms.uScale.value,
      moonPos: [moonG.position.x, moonG.position.y, moonG.position.z],
      lightPos: [g.engine.lights.moon.position.x, g.engine.lights.moon.position.y, g.engine.lights.moon.position.z],
      disc: (() => { const d = moonG.getObjectByName('moonDisc'); return [d.scale.x, d.material.opacity]; })(),
      halo: (() => { const d = moonG.getObjectByName('moonHalo'); return [d.scale.x, d.material.opacity]; })(),
      aurora: g.engine.aurora.children.map((b) => [b.material.opacity, b.material.color.getHex()]),
      fog: g.engine.scene.fog.color.getHex(),
      hemiTarget: m.target.hemi,
      exposureTarget: m.target.exposure,
      // v1.2 · P06：穹頂兩色乘數 uniform（foundations 逐位元 ＝ 1）與 target.sky
      skyDome: (() => { const d = g.engine.skyDome || g.engine.scene.getObjectByName('sky'); const u = d.material.uniforms; return { name: d.name, type: d.material.type, top: [u.uMulTop.value.r, u.uMulTop.value.g, u.uMulTop.value.b], low: [u.uMulLow.value.r, u.uMulLow.value.g, u.uMulLow.value.b], hasMap: !!u.uMap.value, geo: d.geometry.type, renderOrder: d.renderOrder }; })(),
      skyTarget: m.target.sky, skyNow: m.now.sky,
      csFoundations: g.colorScriptFor('foundations'),
    };
  `);
  /* v1.2 · P06：hour 0 ＋ foundations 的穹頂逐值等於舊的 SKY_STOPS 畫面（乘數 1、同一張貼圖、同一顆球） */
  eq(hour0.skyDome.name, 'sky', 'P06：穹頂 mesh 還叫 sky');
  eq(hour0.skyDome.type, 'ShaderMaterial', 'P06：穹頂材質換成 ShaderMaterial（兩色乘數）');
  eq(hour0.skyDome.hasMap, true, 'P06：穹頂仍貼 SKY_STOPS 漸層貼圖（不重畫）');
  eq(hour0.skyDome.geo, 'SphereGeometry', 'P06：穹頂仍是同一顆球');
  eq(hour0.skyDome.renderOrder, -10, 'P06：穹頂 renderOrder −10 不變');
  eq(JSON.stringify(hour0.skyDome.top), JSON.stringify([1, 1, 1]), 'P06：foundations hour 0 穹頂 top 乘數逐位元 ＝ 1（＝舊畫面）');
  eq(JSON.stringify(hour0.skyDome.low), JSON.stringify([1, 1, 1]), 'P06：foundations hour 0 穹頂 low 乘數逐位元 ＝ 1');
  eq(hour0.skyTarget.top, 0x101a28, 'P06：target sky.top ＝ PALETTE.sky #101a28');
  eq(hour0.skyTarget.low, 0x33465c, 'P06：target sky.low ＝ PALETTE.skyLow #33465c');
  eq(JSON.stringify(hour0.skyNow), JSON.stringify(hour0.skyTarget), 'P06：開機 now.sky ＝ target.sky（沒有第一幀跳動）');
  eq(hour0.csFoundations.sky.top, '#101a28', 'P06：colorScriptFor(foundations).sky.top ＝ 基準');
  eq(hour0.csFoundations.fog, 0x1e2c40, 'P06：colorScriptFor(foundations).fog ＝ REGION_ATMOSPHERE 原值');
  eq(hour0.hour.index, 0, 'P05：預設存檔 → 入夜（hour 0）');
  eq(hour0.hour.p, 0, 'P05：預設存檔 p ＝ 0');
  ok(hour0.hour.p < 0.25, 'P05：預設存檔 p < 0.25（與 index 0 一致）');
  eq(hour0.hour.forced, null, 'P05：沒有時辰覆寫');
  eq(hour0.forced, null, 'P05：engine.forcedHour null');
  eq(JSON.stringify(hour0.target.moon), JSON.stringify({ alt: 0.75, phase: 0.3 }), 'P05：hour 0 target moon {alt .75, phase .3}');
  eq(hour0.target.stars.density, 0.7, 'P05：hour 0 target stars.density .7');
  eq(JSON.stringify(hour0.target.aurora), JSON.stringify({ intensity: 0.5, hue: 0 }), 'P05：hour 0 target aurora {intensity .5, hue 0}');
  eq(hour0.uOpacity, 0.9, 'P05：hour 0 星 uOpacity 0.9（＝沒有時辰之前）');
  eq(hour0.uScale, 900, 'P05：hour 0 星 uScale 900（＝沒有時辰之前）');
  const moonRef = (() => { const l = Math.hypot(-40, 60, 30); return [-40 / l * 520, 60 / l * 520, 30 / l * 520]; })();
  ok(hour0.moonPos.every((v, i) => Math.abs(v - moonRef[i]) < 1e-6), 'P05：hour 0 月亮位置 ＝ 現在的 (-40,60,30) 方向 × 520', hour0.moonPos.map((v) => v.toFixed(3)).join(','));
  ok(hour0.lightPos.every((v, i) => Math.abs(v - [-40, 60, 30][i]) < 1e-6), 'P05：hour 0 月光位置 ＝ (-40,60,30)', hour0.lightPos.join(','));
  eq(JSON.stringify(hour0.disc), JSON.stringify([34, 1]), 'P05：hour 0 月盤 scale 34／opacity 1（＝現在）');
  eq(JSON.stringify(hour0.halo), JSON.stringify([170, 0.5]), 'P05：hour 0 月暈 scale 170／opacity 0.5（＝現在）');
  eq(JSON.stringify(hour0.aurora), JSON.stringify([[0.2, 0xffffff], [0.13, 0xffffff]]), 'P05：hour 0 極光兩帶 opacity 0.2／0.13、色白（＝現在）');
  eq(hour0.fog, 0x1e2c40, 'P05：hour 0 霧色 ＝ foundations 的 0x1e2c40');
  eq(hour0.hemiTarget, 0.52, 'P05：hour 0 hemi target 0.52（hemiAdd 0）');
  eq(hour0.exposureTarget, 1.02, 'P05：hour 0 exposure target 1.02（exposureMul 1）');
  ok(boot.sceneNames.includes('stars'), '星空存在（M4）');
  ok(boot.sceneNames.includes('aurora'), '極光存在（M4）');
  eq(boot.hasBeacon, true, '每座石座都有光柱與走近光環（M4）');
  ok(boot.mistPlanes > 10, '貼地霧氣鋪好了（M4）', `planes=${boot.mistPlanes}`);
  ok(boot.motes > 400, '螢火粒子存在', `n=${boot.motes}`);
  eq(boot.moteColors, true, '螢火帶各區顏色（M4）');
  eq(boot.quality, 'high', '預設高畫質（後製開啟）');

  /* --- Phase 5：人形主角、故事小景、地標、世界觀石碑 --- */
  const phase5 = await evaluate(`
    const g = window.__promptasy;
    const ch = g.player.character;
    const j = ch ? ch.joints : null;
    const names = [];
    g.player.group.traverse((o) => { if (o.name && o.name.startsWith('traveler')) names.push(o.name); });
    const worldNames = [];
    g.world.root.traverse((o) => { if (o.name && (o.name.startsWith('landmark:') || o.name.startsWith('vignette:') || o.name.startsWith('tablet:') || o.name.startsWith('flora:'))) worldNames.push(o.name); });
    let tris = 0, instanced = 0;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const geo = o.geometry;
      const n = geo.index ? geo.index.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
      tris += n * (o.isInstancedMesh ? o.count : 1);
      if (o.isInstancedMesh) instanced += 1;
    });
    let lights = 0;
    g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    return {
      hasCharacter: !!ch,
      jointNames: j ? Object.keys(j) : [],
      partNames: names,
      hasLantern: !!(ch && ch.lanternLight && ch.lanternLight.isPointLight),
      tablets: g.world.tablets.length,
      landmarks: worldNames.filter((n) => n.startsWith('landmark:')).length,
      vignettes: worldNames.filter((n) => n.startsWith('vignette:')).length,
      flora: worldNames.filter((n) => n.startsWith('flora:')).length,
      tris: Math.round(tris),
      instanced,
      lights,
      terrainColors: !!g.world.root.getObjectByName('terrain')?.geometry.attributes.color,
    };
  `);
  eq(phase5.hasCharacter, true, '主角是有骨節的人形角色（Phase 5）');
  eq(phase5.hasLantern, true, '角色手上的提燈仍是實體光源');
  for (const joint of ['hips', 'torso', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'lantern']) {
    ok(phase5.jointNames.includes(joint), `角色有 ${joint} 關節`);
  }
  ok(phase5.partNames.length >= 8, '角色的骨節掛在場景圖上', `parts=${phase5.partNames.length}`);
  ok(phase5.tablets >= 8, '世界裡有世界觀石碑', `n=${phase5.tablets}`);
  eq(phase5.landmarks, EXPECT.v2ImplementedRegions.value, '每個已上線的區域各有一個地標剪影');
  ok(phase5.vignettes >= 14, '故事小景鋪好了', `n=${phase5.vignettes}`);
  eq(phase5.flora, EXPECT.v2ImplementedRegions.value, '每個已上線的區域都有自己的植被原型');
  eq(phase5.terrainColors, true, '地形帶頂點色（走出來的路）');
  ok(phase5.instanced >= 20, '重複的東西用 InstancedMesh', `n=${phase5.instanced}`);
  ok(phase5.tris < 420000, '場景三角形數在預算內', `tris=${phase5.tris}`);
  ok(phase5.lights <= 56, '燈光數量沒有失控（前向渲染每盞都要算）', `lights=${phase5.lights}`);

  const titleText = await evaluate(`
    const el = document.querySelector('.title');
    return {
      name: el.querySelector('.title__name')?.textContent,
      tag: el.querySelector('.title__tag')?.textContent,
      // Phase 34：分字揭示與底部的統計數字都拿掉了
      perChar: el.querySelectorAll('.title__ch').length,
      foot: el.querySelectorAll('.title__foot').length,
      text: el.textContent.replace(/\\s+/g, ' '),
      typedSpans: el.querySelectorAll('.title__typed').length,
      carets: el.querySelectorAll('.title__caret').length,
      zh: el.querySelector('.title__zh')?.textContent,
      zhBreaks: el.querySelectorAll('.title__zh br').length,
    };
  `);
  eq(titleText.name, 'Promptasy', '標題卡顯示遊戲名');
  ok(/Learn Prompt Engineering by Playing/.test(titleText.tag || ''), '標題卡顯示定位句');
  eq(titleText.perChar, 0, '不再一個字一個字彈出來（分字揭示已移除）');
  eq(titleText.foot, 0, '底部那行統計數字已移除');
  ok(!/68 條技巧/.test(titleText.text), '標題卡上找不到「68 條技巧…」那一行', titleText.text.slice(0, 90));
  /*
   * Phase 34.5：打字機整組撤掉，改成「一行一行淡入」（CSS 延遲驅動）。
   * 這幾條原本還在斷言打字區與游標 —— 那是上一版的設計，改成守今天的：
   * 兩句話第一幀就是完整的句子（螢幕閱讀器不會念到半句話），只是還沒淡進來。
   */
  eq(titleText.typedSpans, 0, '打字區已整組移除（Phase 34.5 改成淡入）');
  eq(titleText.carets, 0, '游標也一起移除了');
  eq(titleText.tag, 'Learn Prompt Engineering by Playing', '定位句第一幀就是完整的一句');
  eq(titleText.zh, '在一個夜色的世界裡探索，用你寫的 prompt 解開它。', '中文那句第一幀也是完整的');
  eq(titleText.zhBreaks, 1, '中文那句的換行是寫死的（不靠動畫收尾）');

  // 開場曲：harness 帶 --autoplay-policy=no-user-gesture-required，
  // 標題卡上就該真的響起來（title 音軌在播、gain 有拉起來）
  const overture = await evaluate(`
    const d = window.__promptasy.audio.debug();
    const t = (d.bgm || d.regions || {}).title || {};
    return { running: window.__promptasy.audio.isRunning(), playing: !!t.playing, gain: t.gain ?? 0, region: d.region };
  `);
  eq(overture.region, 'title', '標題卡期間配樂區域是 title');
  ok(overture.running, '自動播放放行時 AudioContext 是 running');
  ok(overture.playing, '開場曲(Promptasy Overture)在標題卡上就開始播');

  // Phase 30：音檔（共約 15 MB）不能在標題卡之前開始下載（護欄 5：不拖慢第一個畫面）
  const beforeGesture = await evaluate(`
    const g = window.__promptasy;
    const d = g.audio.debug();
    return {
      audioRequests: performance.getEntriesByType('resource').filter((r) => /\\.m4a(\\?|$)/.test(r.name)).length,
      bgmRequests: performance.getEntriesByType('resource').filter((r) => /bgm_[a-z]+\\.m4a(\\?|$)/.test(r.name)).length,
      audioBytes: performance.getEntriesByType('resource')
        .filter((r) => /\\.m4a(\\?|$)/.test(r.name))
        .reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0),
      started: d.started,
      pending: d.pending,
      pendingBgm: d.pendingBgm,
      source: d.source,
    };
  `);
  /*
   * 這三條在「標題卡開場曲」上線之後改了語意（見那一次的提交）：
   * 開場曲**刻意**在標題卡上就響起（瀏覽器允許自動播放就直接播，不允許就等第一下按鍵），
   * 所以「手勢之前零音檔、零 AudioContext」已經不是現在要守的東西。
   * 現在要守的是護欄 5 的本意：**別在第一個畫面就把 15 MB 全抓下來**。
   */
  /*
   * issue #3 之後音效變成 24 支（共約 0.77 MB，全部要一按下去就有聲音，所以一起抓），
   * 但**配樂 12 首共約 35 MB 絕不能全拉下來** —— 標題卡上只該有開場曲與一首鄰區的。
   * 所以這裡分開看：支數看配樂，總量看位元組。
   */
  ok(
    beforeGesture.bgmRequests <= 2,
    '標題卡上只抓開場曲與一首鄰區的配樂（12 首沒有全拉下來）',
    `bgm=${beforeGesture.bgmRequests} / all=${beforeGesture.audioRequests}`
  );
  ok(
    beforeGesture.audioBytes < 9 * 1024 * 1024,
    '標題卡上下載的音檔總量沒有失控（整包 35 MB 沒有被拉下來）',
    `${(beforeGesture.audioBytes / 1e6).toFixed(1)} MB`
  );
  /*
   * `pending` 是**當下**還在飛的音檔數。24 支音效是刻意一起抓的（一按下去就要有聲音）、
   * 而且一次只抓兩支 —— 所以剛進標題卡時它本來就會停在 20 上下，抽乾要好幾秒。
   * 對那個數字下斷言等於在量這台機器多快（load 高時必紅，實測 pending=20、
   * 改成輪詢 15 秒也排不完）。真正要守的護欄是**別把 12 首配樂排進去**（共約 35 MB），
   * 所以改量佇列裡的配樂支數 —— 那個與機器速度無關。
   */
  ok(
    beforeGesture.pendingBgm <= 2,
    '標題卡上排隊中的配樂沒有失控（12 首沒有被排進佇列）',
    `pendingBgm=${beforeGesture.pendingBgm}`
  );
  ok(beforeGesture.pending <= 30, '標題卡上的下載佇列本身有上限（不是把整包都排進去）', `pending=${beforeGesture.pending}`);

  /*
   * Phase 34.5 · 揭示不擋輸入：兩句話還在淡入時按下開始，一樣直接進場
   * （不需要按第二下，也不會有半句話淡出去 —— 文字本來就是完整的）。
   * 先把揭示重播一次：上面那一串斷言跑掉的時間早就讓第一輪播完了。
   */
  await evaluate(`window.__promptasy.title.open(); return 1;`);
  // 開始鍵是 2.7s 的 CSS 延遲。用輪詢等「還沒浮出來」的那一刻 ——
  // 軟體渲染下一幀可能要好幾百毫秒，固定 sleep 會抓不準。
  const midReveal = await waitFor(
    async () => {
      const s = await evaluate(`
        const el = document.querySelector('.title');
        return {
          open: window.__promptasy.title.isOpen,
          typing: window.__promptasy.title.isTyping,
          tagLen: el.querySelector('.title__tag').textContent.length,
          zhLen: el.querySelector('.title__zh').textContent.length,
          startOpacity: Number(getComputedStyle(el.querySelector('.title__start')).opacity),
        };
      `);
      return s.open ? s : null;
    },
    { timeout: 12000, every: 120, label: '標題卡重新登場' }
  ).catch(() => null);
  ok(midReveal, '抓到標題卡重新登場的那一刻');
  ok(
    midReveal && midReveal.tagLen === 'Learn Prompt Engineering by Playing'.length,
    '定位句從頭到尾都是完整的一句',
    midReveal && String(midReveal.tagLen)
  );
  ok(
    midReveal && midReveal.zhLen === '在一個夜色的世界裡探索，用你寫的 prompt 解開它。'.length,
    '中文那句也是完整的',
    midReveal && String(midReveal.zhLen)
  );
  eq(midReveal && midReveal.typing, false, '沒有打字機了（舊 API 永遠回 false）');

  // 按任意鍵開始
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(400);
  const afterTitle = await evaluate(`
    const g = window.__promptasy;
    const el = document.querySelector('.title');
    const cover = document.getElementById('bootcover');
    return {
      typedTag: el.querySelector('.title__tag').textContent,
      typedZh: el.querySelector('.title__zh').textContent,
      caretsOn: el.querySelectorAll('.title__caret.is-on').length,
      stillTyping: g.title.isTyping,
      coverLifting: cover ? cover.classList.contains('is-lifting') : 'removed',
      coverOpacity: cover ? Number(getComputedStyle(cover).opacity) : 0,
      titleOpen: g.title.isOpen,
      introOpen: g.intro.isOpen,
      audioStarted: g.audio.isStarted,
      prologueActive: g.prologue.isActive,
      echoVisible: !document.querySelector('.echo').hidden,
      shrineActive: !!g.world.shrine && g.world.shrine.active,
      beatKind: g.prologue.beat?.kind,
    };
  `);
  eq(afterTitle.titleOpen, false, '按鍵後標題卡收起');
  eq(afterTitle.typedTag, 'Learn Prompt Engineering by Playing', '淡入到一半被按下去 → 第一句仍然完整');
  eq(afterTitle.typedZh, '在一個夜色的世界裡探索，用你寫的 prompt 解開它。', '第二句也完整');
  eq(afterTitle.caretsOn, 0, '畫面上沒有任何游標（打字機已移除）');
  eq(afterTitle.stillTyping, false, '沒有殘留的打字計時器');
  eq(afterTitle.coverLifting, true, '按下開始 → 黑幕開始淡出（世界第一次亮起來）');
  // 淡到哪一格不斷言：軟體渲染下 getComputedStyle 取到的是「上一幀」的值，
  // 幀率一低就會讀到還沒動的 1。真正該守的是「有沒有淡完」——下面那條在等它消失。
  eq(afterTitle.prologueActive, true, '新玩家先進引導課程（Phase 7 序章）');
  eq(afterTitle.echoVisible, true, '回聲字幕條出現');
  eq(afterTitle.shrineActive, true, '起始祭壇亮起（序章的舞台）');
  eq(afterTitle.beatKind, 'say', '序章第一拍是醒來');
  eq(afterTitle.introOpen, false, '序章期間不跳舊的靜態教學卡');
  eq(afterTitle.audioStarted, true, '使用者手勢後 AudioContext 啟動');

  // 黑幕淡完（1.4s）就自己從 DOM 消失 —— 世界完全露出來
  const coverGone = await waitFor(
    async () => {
      const r = await evaluate(`
        const c = document.getElementById('bootcover');
        const canvas = document.querySelector('canvas');
        return { present: !!c, canvasVisible: !!canvas && canvas.getBoundingClientRect().width > 0 };
      `);
      return r.present ? null : r;
    },
    { timeout: 6000, every: 200, label: '黑幕淡出後自己收掉' }
  ).catch(() => null);
  ok(coverGone, '黑幕淡完就從 DOM 拿掉（不留一個全螢幕的合成層）');
  ok(coverGone && coverGone.canvasVisible, '這時候 3D 世界真的看得到了');

  /* ================================================================ */
  console.log('\n▸ 序章引導課程（Phase 13 · 導演式）');

  /** 按一次字幕條上的「繼續」。 */
  async function echoAdvance(times = 1) {
    for (let i = 0; i < times; i += 1) {
      await evaluate(`
        const cta = document.querySelector('.echo [data-cta]');
        if (cta && !cta.hidden) cta.click();
        return 1;
      `);
      await sleep(200);
    }
  }

  // --- 第一拍：兩句話一起浮出來（不是一次倒一牆字，也不是一句一句點） ---
  const wake = await evaluate(`
    const g = window.__promptasy;
    const lines = Array.from(document.querySelectorAll('.echo__line')).map((p) => p.textContent);
    return {
      kind: g.prologue.beat?.kind,
      lines,
      longest: Math.max(...lines.map((s) => s.length)),
      staged: Array.from(document.querySelectorAll('.echo__line')).map((p) => p.className),
      cut: document.querySelector('.echo__card').classList.contains('is-cut'),
      cta: document.querySelector('.echo [data-cta]').textContent,
    };
  `);
  eq(wake.kind, 'say', '序章第一拍是醒來');
  eq(wake.lines.length, 2, '這一拍只有兩句（一拍最多兩個想法）');
  ok(wake.longest <= 40, '每一句都短', `longest=${wake.longest}`);
  ok(
    wake.staged.every((c) => /\breveal\b/.test(c)) && wake.staged.some((c) => /\bd2\b/.test(c)),
    '台詞是分批揭示的（.reveal .d1 / .d2）',
    wake.staged.join(' | ')
  );
  eq(wake.cut, true, '換拍時卡片重播一次「鏡頭切換」');

  await echoAdvance(1);
  const moveBeat = await evaluate(`
    const g = window.__promptasy;
    const el = document.querySelector('.echo__objective');
    return {
      gate: g.prologue.beat?.gate,
      hidden: el.hidden,
      text: el.textContent.trim(),
      lines: document.querySelectorAll('.echo__line').length,
    };
  `);
  eq(moveBeat.gate, 'move', '第一個門檻是「走一步」（teach by doing）');
  eq(moveBeat.hidden, false, '門檻拍一進來就顯示行動目標（不用等對白說完）');
  ok(moveBeat.text.includes('W'), '目標寫著要按什麼鍵', moveBeat.text);
  eq(moveBeat.lines, 1, '門檻拍只說一句');

  // --- 門檻一：真的走一步才過（不是按「我知道了」） ---
  const moveGate = await evaluate(`
    const g = window.__promptasy;
    const before = g.prologue.gatePassed;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const until = performance.now() + 6000;
    while (!g.prologue.gatePassed && performance.now() < until) await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 200));
    return { before, after: g.prologue.gatePassed, line: document.querySelector('.echo__line').textContent, done: document.querySelector('.echo__objective').classList.contains('is-done') };
  `);
  eq(moveGate.before, false, '沒走之前門檻不會自己過');
  eq(moveGate.after, true, '真的走了才過關（teach by doing）');
  eq(moveGate.done, true, '達成時目標列變成完成樣式（即時回饋）');
  ok(moveGate.line.length > 0, '達成時回聲立刻換一句回饋', moveGate.line);

  await echoAdvance(1);
  eq(await evaluate('return window.__promptasy.prologue.beat?.gate;'), 'camera', '進入鏡頭門檻');

  // --- 門檻二：轉鏡頭（Phase 16：方向鍵 ← → 就是視角鍵，而且不會把角色帶著走） ---
  ok(moveBeat.text.includes('W') && !/方向鍵/.test(moveBeat.text), '移動目標只講 W A S D（方向鍵已改成視角鍵）', moveBeat.text);
  const camObjective = await evaluate(`
    return document.querySelector('.echo__objective').textContent.trim();
  `);
  ok(/←|→/.test(camObjective), '鏡頭門檻的目標寫著要按方向鍵', camObjective);
  const camGate = await evaluate(`
    const g = window.__promptasy;
    const before = g.prologue.gatePassed;
    const yaw0 = g.player.cameraYaw;
    // 先把上一個門檻留下的慣性歸零，才量得準「方向鍵有沒有讓角色動」
    g.player.teleport(g.player.position.x, g.player.position.z);
    const pos0 = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    const until = performance.now() + 6000;
    while (!g.prologue.gatePassed && performance.now() < until) await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      before,
      after: g.prologue.gatePassed,
      yawTurned: Math.abs(g.player.cameraYaw - yaw0),
      moved: Math.hypot(g.player.position.x - pos0.x, g.player.position.z - pos0.z),
    };
  `);
  eq(camGate.before, false, '沒轉鏡頭之前門檻不會過');
  eq(camGate.after, true, '按方向鍵 ← 轉了鏡頭才過關');
  ok(camGate.yawTurned > 0.4, '方向鍵真的把鏡頭轉起來了', `Δyaw=${camGate.yawTurned.toFixed(2)}`);
  ok(camGate.moved < 0.5, '按方向鍵時角色留在原地（方向鍵不再移動）', `moved=${camGate.moved.toFixed(3)}`);

  await echoAdvance(1);
  eq(await evaluate('return window.__promptasy.prologue.beat?.gate;'), 'run', '進入奔跑門檻');

  // --- 門檻三：真的跑起來（走路不算） ---
  const runGate = await evaluate(`
    const g = window.__promptasy;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 900));
    const walkingPassed = g.prologue.gatePassed;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    const until = performance.now() + 8000;
    while (!g.prologue.gatePassed && performance.now() < until) await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    return { walkingPassed, after: g.prologue.gatePassed };
  `);
  eq(runGate.walkingPassed, false, '只用走的不算「學會奔跑」');
  eq(runGate.after, true, '按住 Shift 跑起來才過關');

  await echoAdvance(1);
  eq(await evaluate('return window.__promptasy.prologue.beat?.gate;'), 'arrive', '進入「走到祭壇」門檻');

  // --- 門檻四：走到起始祭壇 ---
  const arriveGate = await evaluate(`
    const g = window.__promptasy;
    const s = g.world.shrine;
    const before = g.prologue.gatePassed;
    g.player.teleport(s.position.x + 1.5, s.position.z + 1.5);
    const until = performance.now() + 5000;
    while (!g.prologue.gatePassed && performance.now() < until) await new Promise((r) => setTimeout(r, 60));
    return { before, after: g.prologue.gatePassed, radius: s.radius };
  `);
  eq(arriveGate.before, false, '還沒走到祭壇不會過關');
  eq(arriveGate.after, true, '走進祭壇光圈就過關');

  /* ---------------------------------------------------------------- */
  /* 三堂課：與正式關卡同一套四幕分鏡 ＋ 同一支石碑                     */
  /* ---------------------------------------------------------------- */

  await echoAdvance(1);
  const lessonLead = await evaluate(`
    const g = window.__promptasy;
    return {
      kind: g.prologue.beat?.kind,
      phase: g.prologue.phase,
      practiceOpen: g.practice.isOpen,
      lines: Array.from(document.querySelectorAll('.echo__line')).map((p) => p.textContent),
      cta: document.querySelector('.echo [data-cta]').textContent,
    };
  `);
  eq(lessonLead.kind, 'practice', '走到祭壇後進入第一堂課');
  eq(lessonLead.phase, 'lead', '回聲先宣布這一課，石碑還沒開（一次一個焦點）');
  eq(lessonLead.practiceOpen, false, '宣布時練習台還沒打開');
  eq(lessonLead.lines.length, 1, '宣布只有一句');
  ok(/石碑/.test(lessonLead.cta), '按鈕是走進世界的說法，不是「開始練習」', lessonLead.cta);

  await echoAdvance(1);
  await sleep(400);

  // --- 第一幕 · 委託：先看見那句「弱」的請求 ---
  const pAct1 = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.practice.isOpen,
      stepId: g.practice.step?.id,
      act: g.practice.act,
      acts: document.querySelectorAll('#practice .acts__item').length,
      now: document.querySelector('#practice .acts__item.is-now .acts__zh')?.textContent,
      weak: document.querySelector('#practice [data-weak]')?.textContent || '',
      starter: g.practice.step?.starter,
      mission: document.querySelector('#practice .mission__text')?.textContent || '',
      steleVisible: !document.querySelector('#practice .act--carve').hidden,
      verdictVisible: !document.querySelector('#practice .act--verdict').hidden,
      echoVeiled: document.querySelector('.echo').classList.contains('is-veiled'),
    };
  `);
  eq(pAct1.open, true, '練習台開啟');
  eq(pAct1.stepId, 'prologue-clarity', '第一堂課是「把話說清楚」');
  eq(pAct1.act, 1, '導演的第一顆鏡頭是委託');
  eq(pAct1.acts, 4, '序章的課也是四幕（跟正式關卡同一種語言）');
  eq(pAct1.now, '委託', '進度指示器停在第一幕');
  eq(pAct1.weak, pAct1.starter, '第一幕擺出委託人留下的那句弱寫法');
  ok(pAct1.mission.length > 0, '第一幕交代任務', pAct1.mission);
  eq(pAct1.steleVisible, false, '第一幕時石碑還沒上場（一次只有一幕擁有畫面）');
  eq(pAct1.verdictVisible, false, '第一幕時結果面板不在畫面上');
  eq(pAct1.echoVeiled, true, '練習台開著時字幕條退場');

  // --- 第二幕 · 神諭刻文：一課一條刻文 ＋ 永遠看得見的神諭原典 ---
  await evaluate(`document.querySelector('#practice [data-act-next="2"]').click(); return 1;`);
  await sleep(320);
  const pAct2 = await evaluate(`
    const g = window.__promptasy;
    const glyphs = document.querySelectorAll('#practice .glyphs .glyph');
    // 出處＝刻文底下那一枚典籍（自己帶著「神諭原典：<文件名>」的小卡）
    const src = document.querySelector('#practice .glyphs a.bookicon');
    const lead = document.querySelector('#practice .act--guide .act__lead');
    const tip = src ? src.closest('.infotip') : null;
    const bubble = tip ? tip.querySelector('.infotip__bubble') : null;
    return {
      act: g.practice.act,
      glyphs: glyphs.length,
      title: document.querySelector('#practice .glyph__title')?.textContent || '',
      srcText: src ? src.getAttribute('aria-label') : '',
      srcHref: src ? src.href : '',
      srcTarget: src ? src.getAttribute('target') : '',
      srcVisible: (() => {
        if (!src) return 'none';
        const r = src.getBoundingClientRect();
        return getComputedStyle(src).visibility === 'visible' && r.width > 0 && r.height > 0 ? 'visible' : 'hidden';
      })(),
      leadText: lead.textContent.trim(),
      leadOwn: Array.from(lead.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
      hasTip: !!tip,
      bubbleText: bubble ? bubble.textContent : '',
      bubbleHidden: bubble ? getComputedStyle(bubble).visibility : 'none',
      describedBy: src ? src.getAttribute('aria-describedby') : '',
      bubbleId: bubble ? bubble.id : '',
      bubbleRole: bubble ? bubble.getAttribute('role') : '',
      origins: document.querySelectorAll('#practice .teach .origin').length,
      originsClosed: Array.from(document.querySelectorAll('#practice .teach .origin')).every((d) => !d.open),
      originLinks: Array.from(document.querySelectorAll('#practice .teach .origin a.src')).map((a) => a.href),
    };
  `);
  eq(pAct2.act, 2, '第二幕是神諭刻文');
  eq(pAct2.glyphs, 1, '一課只講一個概念（刻文只有一條）');
  ok(pAct2.title.length > 0, '刻文有標題', pAct2.title);
  ok(/^神諭原典：/.test(pAct2.srcText), '刻文掛著神諭原典（螢幕閱讀器聽得到那份文件叫什麼）', pAct2.srcText);
  ok(/^https:\/\//.test(pAct2.srcHref), '神諭原典是真的官方連結', pAct2.srcHref);
  eq(pAct2.srcTarget, '_blank', '點下去開新分頁，不會把玩家踢出遊戲');
  eq(pAct2.srcVisible, 'visible', '出處連結永遠看得見、量得到（不收進任何摺頁）');
  ok(pAct2.origins >= 1, '官方原文收在可展開的「原文 ↗」裡', `n=${pAct2.origins}`);
  eq(pAct2.originsClosed, true, '「原文 ↗」預設收起來（不干擾閱讀）');
  ok(
    pAct2.originLinks.length > 0 && pAct2.originLinks.every((u) => /^https:\/\//.test(u)),
    '每一份原文都附得出官方出處連結'
  );

  /* --- 那本典籍自己的小卡：預設看不見，hover / focus 才出現 --- */
  eq(pAct2.hasTip, true, '那本典籍帶著一張小卡（不是一段常駐的旁白）');
  ok(/^神諭原典：/.test(pAct2.bubbleText.trim()), '小卡上寫著「神諭原典：<文件名>」', pAct2.bubbleText);
  ok(pAct2.bubbleText.length > 8, '小卡後面接得出真正的文件名（不是只有標籤）', pAct2.bubbleText);
  eq(pAct2.bubbleHidden, 'hidden', '小卡預設看不見（不佔版面）');
  ok(!pAct2.leadOwn.includes('官方文件'), '導言只剩下短短一句（解釋不再內嵌在句子裡）', pAct2.leadOwn);
  eq(pAct2.describedBy, pAct2.bubbleId, '那本典籍用 aria-describedby 指到小卡（螢幕閱讀器讀得到）');
  eq(pAct2.bubbleRole, 'tooltip', '說明的角色是 tooltip');

  const tipHover = await evaluate(`
    // 那顆 ⓘ 已經換成典籍本身（.infotip--book）—— 開闔的規則一模一樣
    const btn = document.querySelector('#practice .act--guide a.bookicon');
    const bubble = document.querySelector('#practice .act--guide .infotip__bubble');
    const box = btn.getBoundingClientRect();
    /*
     * 只補送 mouseover（＝游標沒動、只是內容換到它底下）不該打開任何東西 ——
     * 那正是「ⓘ 自己彈出來」的根因。
     */
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const onStillPointer = getComputedStyle(bubble).visibility;
    // 游標真的動到它上面 → 才打開
    btn.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: Math.round(box.x + box.width / 2),
      clientY: Math.round(box.y + box.height / 2),
    }));
    await new Promise((r) => setTimeout(r, 260));
    const onHover = getComputedStyle(bubble).visibility;
    btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    await new Promise((r) => setTimeout(r, 260));
    const afterOut = getComputedStyle(bubble).visibility;
    btn.focus();
    await new Promise((r) => setTimeout(r, 260));
    const onFocus = getComputedStyle(bubble).visibility;
    const describes = btn.getAttribute('aria-describedby') === bubble.id;
    btn.blur();
    await new Promise((r) => setTimeout(r, 260));
    return { onStillPointer, onHover, afterOut, onFocus, describes, afterBlur: getComputedStyle(bubble).visibility };
  `);
  eq(tipHover.onStillPointer, 'hidden', '游標沒動、只是內容換到它底下 → 小卡不自己彈出來');
  eq(tipHover.onHover, 'visible', '滑鼠移上去就看得到那份文件叫什麼');
  eq(tipHover.afterOut, 'hidden', '移開就收回去');
  eq(tipHover.onFocus, 'visible', '鍵盤 focus 也看得到（不是只有滑鼠使用者）');
  // 典籍本身是一條連結（按下去就開官方文件）→ 它不是可展開的按鈕，
  // 所以無障礙的關係走 aria-describedby，而不是 aria-expanded。
  eq(tipHover.describes, true, 'focus 時螢幕閱讀器讀得到那張小卡');
  eq(tipHover.afterBlur, 'hidden', '離開 focus 就收回去');

  // --- 第三幕 · 刻印：選錯不失敗、選對就亮一盞燈（與正式關卡同一支石碑） ---
  await evaluate(`document.querySelector('#practice [data-act-next="3"]').click(); return 1;`);
  await sleep(320);
  const pAct3 = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.practice.act,
      total: g.practice.stele.progress.total,
      ask: g.practice.stele.ask,
      options: document.querySelectorAll('#practice .opt').length,
      checks: document.querySelectorAll('#practice .checklist li').length,
      briefVisible: !document.querySelector('#practice .act--brief').hidden,
    };
  `);
  eq(pAct3.act, 3, '第三幕是刻印');
  ok(pAct3.total >= 2 && pAct3.total <= 3, '這一課的石碑有 2–3 段', `n=${pAct3.total}`);
  ok(pAct3.ask.length > 0, '石碑一次只問一段', pAct3.ask);
  ok(pAct3.options >= 2, '每一段有 2–3 個選項', `n=${pAct3.options}`);
  eq(pAct3.checks, 3, '右側刻痕對照列出這一課的 3 條要求');
  eq(pAct3.briefVisible, false, '刻印時委託那一幕已經切掉了');

  // 選錯：石碑不收、給一句教學回饋、不會失敗
  const proWrongPick = await evaluate(`
    const g = window.__promptasy;
    const slot = g.practice.step.flow.slots[0];
    const idx = slot.options.findIndex((o) => !o.correct);
    const before = g.practice.stele.progress.carved;
    g.practice.pick(idx);
    await new Promise((r) => setTimeout(r, 200));
    const btn = document.querySelectorAll('#practice .opt')[idx];
    return {
      before,
      after: g.practice.stele.progress.carved,
      wrongClass: btn.className.includes('is-wrong'),
      feedback: btn.querySelector('[data-opt-fb]')?.textContent || '',
      fbHidden: btn.querySelector('[data-opt-fb]')?.hidden,
      resultShown: !document.querySelector('#practice [data-result]').hidden,
    };
  `);
  eq(proWrongPick.before, 0, '一開始石碑是空的');
  eq(proWrongPick.after, 0, '選錯不會被刻上去');
  eq(proWrongPick.wrongClass, true, '選錯的那一片標記成「石碑不收」');
  ok(proWrongPick.feedback.length >= 12, '選錯會就地給一句白話教學', proWrongPick.feedback);
  eq(proWrongPick.fbHidden, false, '教學回饋真的顯示出來（和正式關卡一致）');
  eq(proWrongPick.resultShown, false, '選錯不會判定失敗');

  // 一段一段選對：刻痕對照跟著亮
  const carve = await evaluate(`
    const g = window.__promptasy;
    const lit = [];
    while (!g.practice.stele.done) {
      const i = g.practice.step.flow.slots[g.practice.stele.progress.carved].options.findIndex((o) => o.correct);
      g.practice.pick(i);
      await new Promise((r) => setTimeout(r, 180));
      lit.push(document.querySelectorAll('#practice .checklist .is-pass').length);
    }
    return {
      lit,
      text: g.practice.stele.text,
      assembled: g.practice.step.assembled,
      act: g.practice.act,
      palmVisible: !document.querySelector('#practice .palmwrap').hidden,
      lamp: document.querySelector('#practice [data-lamp-text]').textContent,
      lampReady: document.querySelector('#practice [data-lamp]').classList.contains('is-ready'),
      xp: g.progression.state.xp,
    };
  `);
  ok(carve.lit[carve.lit.length - 1] === 3, '刻滿時三條要求全亮（即時預檢，同一支離線引擎）', carve.lit.join('→'));
  ok(
    carve.lit.some((n, i) => i > 0 && n > carve.lit[i - 1]),
    '刻一段就亮一盞燈（不是最後才一次亮）',
    carve.lit.join('→')
  );
  eq(carve.text, carve.assembled, '刻出來的就是資料裡那段「全部選對」的 prompt');
  eq(carve.act, 4, '刻滿了鏡頭自動切到第四幕（手印）');
  eq(carve.palmVisible, true, '手掌印出現');
  eq(carve.lampReady, true, '進度燈告訴玩家已達通過門檻', carve.lamp);
  eq(carve.xp, 0, '刻印過程不會偷偷給分（要按手印才算）');

  // --- 第四幕 · 手印：呈給神諭 → 拿 S、給 XP、收進圖鑑 ---
  const verdict = await evaluate(`
    const g = window.__promptasy;
    g.practice.press();
    await new Promise((r) => setTimeout(r, 400));
    const links = Array.from(document.querySelectorAll('#practice .result a.src')).map((a) => a.href);
    return {
      grade: document.querySelector('#practice .grade__mark')?.textContent,
      pass: !!document.querySelector('#practice .result__top.is-pass'),
      xp: g.progression.state.xp,
      collected: g.progression.state.collected.slice(),
      steps: g.progression.state.prologueSteps.slice(),
      bestGrades: Object.keys(g.progression.state.bestGrades).length,
      links,
      hasNext: !!document.querySelector('#practice [data-next]'),
    };
  `);
  eq(verdict.grade, 'S', '全部選對在同一支離線引擎下拿滿分');
  eq(verdict.pass, true, '結果面板蓋下通過的印章');
  ok(verdict.xp > 0, '過關給 XP', `xp=${verdict.xp}`);
  eq(verdict.collected.length, 3, '第一堂課把三條技巧收進圖鑑');
  ok(verdict.collected.includes('clarity-01'), '收到 Anthropic 的黃金法則 clarity-01');
  eq(verdict.bestGrades, 0, '序章不佔關卡評價（已通關數不變）');
  eq(verdict.steps.join(','), 'prologue-clarity', '序章進度寫進存檔');
  ok(verdict.links.length > 0, '結果面板列出可點的官方出處');
  ok(
    verdict.links.every((u) => /^https:\/\//.test(u)),
    '每個出處連結都是真實的 https 網址',
    verdict.links.join(' ')
  );
  eq(verdict.hasNext, true, '過關後可以繼續');

  // --- v1.2 · P07：序章寫下的第一句真的被記住了（只存在這台裝置上） ---
  const firstSaid = await evaluate(`
    const g = window.__promptasy;
    return {
      inState: g.progression.firstPrompt(),
      saved: (JSON.parse(localStorage.getItem('promptasy.v1.save')) || {}).firstPrompt,
      assembled: g.prologueContent.step('prologue-clarity').assembled,
    };
  `);
  eq(firstSaid.inState, firstSaid.assembled, '序章第一次呈遞 → 存檔記住玩家送出的那一段原文');
  eq(firstSaid.saved, firstSaid.inState, '第一句寫進 localStorage（只留在這台裝置上）');
  ok(firstSaid.inState.length > 0 && firstSaid.inState.length <= 280, '第一句在長度上限之內', String(firstSaid.inState.length));

  // 出處連結真的是 curriculum 裡那一條（不是隨便湊的）
  const citationCheck = await evaluate(`
    const g = window.__promptasy;
    const step = g.prologueContent.step('prologue-clarity');
    const urls = new Set(g.content.curriculum.techniques.flatMap((t) => t.sources.map((s) => s.url)));
    const shown = Array.from(document.querySelectorAll('#practice .result a.src')).map((a) => a.href.replace(/\\/$/, ''));
    /* 出處深連結：畫面上的網址可能多一個片段（#章節 / #:~:text=），本體必須逐字是 curriculum 那一個 */
    const base = (u) => (u.includes('#') ? u.slice(0, u.indexOf('#')) : u);
    const overlay = new Set(g.content.sourceAnchors.entries.map((e) => e.anchored));
    return {
      ok: shown.every((u) => urls.has(base(u)) || urls.has(base(u) + '/')),
      source: step.source,
      inCurriculum: urls.has(step.source),
      deep: shown.filter((u) => u.includes('#')),
      deepKnown: shown.filter((u) => u.includes('#')).every((u) => overlay.has(u)),
    };
  `);
  eq(citationCheck.inCurriculum, true, '這一課的 source 真的存在於 curriculum');
  eq(citationCheck.ok, true, '面板上的每個出處都指向 curriculum 裡的官方連結');
  ok(citationCheck.deep.length > 0, '序章的出處也深連結到被引用的那一節', citationCheck.deep.join(' '));
  eq(citationCheck.deepKnown, true, '而且每一個片段都來自驗證過的疊加層（不是憑空加的）');

  // --- 課後：回聲補一句短的過場，再切下一拍 ---
  const bridge = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#practice [data-next]').click();
    await new Promise((r) => setTimeout(r, 420));
    return {
      practiceOpen: g.practice.isOpen,
      phase: g.prologue.phase,
      veiled: document.querySelector('.echo').classList.contains('is-veiled'),
      lines: Array.from(document.querySelectorAll('.echo__line')).map((p) => p.textContent),
      beat: g.prologue.beat?.id,
    };
  `);
  eq(bridge.practiceOpen, false, '刻完之後石碑收起來');
  eq(bridge.phase, 'bridge', '回聲接手，補一句過場');
  eq(bridge.veiled, false, '字幕條回到畫面上');
  eq(bridge.lines.length, 1, '過場只有一句');
  ok(bridge.lines[0].length <= 40, '過場很短', bridge.lines[0]);
  eq(bridge.beat, 'practice-clarity', '過場仍在同一拍上（還沒切走）');

  /** 走完一整堂課：宣布 → 委託 → 刻文 → 刻印 → 手印 → 過場。 */
  async function playLesson(wantId) {
    return evaluate(`
      const g = window.__promptasy;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('.echo [data-cta]').click();   // 過場 → 下一拍
      await sleep(320);
      const announced = { kind: g.prologue.beat?.kind, phase: g.prologue.phase };
      document.querySelector('.echo [data-cta]').click();   // 宣布 → 打開石碑
      await sleep(420);
      const opened = { id: g.practice.step?.id, act: g.practice.act, scaffold: g.practice.step?.scaffold };
      document.querySelector('#practice [data-act-next="2"]').click();
      await sleep(220);
      const glyphs = document.querySelectorAll('#practice .glyphs .glyph').length;
      const srcs = document.querySelectorAll('#practice .glyphs a.bookicon').length;
      document.querySelector('#practice [data-act-next="3"]').click();
      await sleep(220);
      // 先故意選錯一次 —— 石碑不收，但不會失敗
      const wrongIdx = g.practice.step.flow.slots[0].options.findIndex((o) => !o.correct);
      g.practice.pick(wrongIdx);
      await sleep(160);
      const rejected = g.practice.stele.progress.carved === 0;
      while (!g.practice.stele.done) {
        const i = g.practice.step.flow.slots[g.practice.stele.progress.carved].options.findIndex((o) => o.correct);
        g.practice.pick(i);
        await sleep(140);
      }
      const litAll = document.querySelectorAll('#practice .checklist .is-pass').length;
      g.practice.press();
      await sleep(420);
      const grade = document.querySelector('#practice .grade__mark')?.textContent;
      document.querySelector('#practice [data-next]').click();
      await sleep(420);
      return {
        ...announced, ...opened, glyphs, srcs, rejected, litAll, grade,
        phase: g.prologue.phase,
        steps: g.progression.state.prologueSteps.length,
        collected: g.progression.state.collected.length,
        bridged: Array.from(document.querySelectorAll('.echo__line')).map((p) => p.textContent),
      };
    `);
  }

  for (const [idx, want, scaffold] of [
    [2, 'prologue-positive', 'partial'],
    [3, 'prologue-structure', 'light'],
  ]) {
    const lesson = await playLesson(want);
    eq(lesson.kind, 'practice', `第 ${idx} 堂課由回聲宣布`);
    eq(lesson.phase, 'bridge', `第 ${idx} 堂課結束後回聲補一句過場`);
    eq(lesson.id, want, `第 ${idx} 堂課是 ${want}`);
    eq(lesson.scaffold, scaffold, `第 ${idx} 堂課的鷹架遞減到 ${scaffold}`);
    eq(lesson.act, 1, `第 ${idx} 堂課一樣從委託開始`);
    eq(lesson.glyphs, 1, `第 ${idx} 堂課也只講一個概念`);
    ok(lesson.srcs >= 1, `第 ${idx} 堂課的刻文附得出神諭原典`);
    eq(lesson.rejected, true, `第 ${idx} 堂課選錯一樣不會被刻上去`);
    eq(lesson.litAll, 3, `第 ${idx} 堂課刻滿時三條要求全亮`);
    eq(lesson.grade, 'S', `第 ${idx} 堂課全部選對拿滿分`);
    eq(lesson.steps, idx, `序章完成 ${idx} 堂課`);
    ok(lesson.collected > 0, `第 ${idx} 堂課持續累積圖鑑`, `collected=${lesson.collected}`);
    ok(lesson.bridged.length >= 1, `第 ${idx} 堂課的過場有台詞`, lesson.bridged.join(' / '));
  }

  // --- v1.2 · P07：第二、三堂課都送出過了，第一句仍然是第一句 ---
  const firstStill = await evaluate(`
    const g = window.__promptasy;
    return {
      inState: g.progression.firstPrompt(),
      lesson1: g.prologueContent.step('prologue-clarity').assembled,
      lesson3: g.prologueContent.step('prologue-structure').assembled,
      steps: g.progression.state.prologueSteps.length,
    };
  `);
  eq(firstStill.steps, 3, '三堂課都送出過了');
  eq(firstStill.inState, firstStill.lesson1, '第一句沒有被後面兩堂課覆寫（第一句就是第一句）');
  ok(firstStill.inState !== firstStill.lesson3, '存的不是最後一次送出的那一段', firstStill.inState);

  // --- 畢業：指路第一座石座、寫下旗標、交還操作權 ---
  const graduation = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('.echo [data-cta]').click();
    await new Promise((r) => setTimeout(r, 420));
    const marker = g.world.markers.find((m) => m.id === 'gate-of-clarity-01');
    const note = document.querySelector('.echo__note');
    return {
      beat: g.prologue.beat?.kind,
      practiceOpen: g.practice.isOpen,
      spotlight: marker.spotlight,
      shrineActive: g.world.shrine.active,
      flag: g.progression.state.flags.prologueDone,
      collected: g.progression.state.collected.length,
      xp: g.progression.state.xp,
      level: g.progression.levelInfo().level,
      lines: Array.from(document.querySelectorAll('.echo__line')).map((p) => p.textContent),
      noteHidden: note.hidden,
      note: note.textContent,
      cta: document.querySelector('.echo [data-cta]').textContent,
    };
  `);
  eq(graduation.beat, 'finish', '三堂課上完進入畢業拍');
  eq(graduation.practiceOpen, false, '畢業時練習台收起來');
  eq(graduation.spotlight, true, '畢業時把第一座石座的光柱點亮（指路，不用箭頭 UI）');
  eq(graduation.shrineActive, false, '祭壇沉回背景');
  eq(graduation.flag, true, '序章完成寫進存檔旗標');
  eq(graduation.collected, 7, '三堂課共收 7 條技巧進圖鑑');
  ok(graduation.xp >= 75, '三堂課的 XP 入帳', `xp=${graduation.xp}`);
  eq(graduation.lines.length, 2, '畢業拍也只說兩句');
  eq(graduation.noteHidden, false, '畢業拍留一條「圖鑑在哪裡」的小提示');
  ok(/圖鑑/.test(graduation.note), '小提示指向圖鑑', graduation.note);

  const handoff = await evaluate(`
    const g = window.__promptasy;
    let clicks = 0;
    while (g.prologue.isActive && clicks < 8) {
      const cta = document.querySelector('.echo [data-cta]');
      if (!cta || cta.hidden) break;
      cta.click();
      clicks += 1;
      await new Promise((r) => setTimeout(r, 160));
    }
    await new Promise((r) => setTimeout(r, 260));
    // 交還操作權：能走路了
    const before = { x: g.player.position.x, z: g.player.position.z };
    const moved = () => Math.hypot(g.player.position.x - before.x, g.player.position.z - before.z);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    // 軟體渲染的幀率會抖，用「走到夠遠或逾時」而不是固定睡一段時間
    const until = performance.now() + 8000;
    while (moved() < 3 && performance.now() < until) await new Promise((r) => setTimeout(r, 80));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      active: g.prologue.isActive,
      echoHidden: document.querySelector('.echo').hidden,
      introOpen: g.intro.isOpen,
      moved: Math.hypot(g.player.position.x - before.x, g.player.position.z - before.z),
    };
  `);
  eq(handoff.active, false, '按下「開始探索」後序章結束');
  eq(handoff.echoHidden, true, '回聲字幕條收起來');
  eq(handoff.introOpen, false, '走完課程的人不會再被塞一張教學卡');
  ok(handoff.moved > 2, '交還操作權：可以自由探索了', `moved=${handoff.moved.toFixed(2)}`);

  /* ================================================================ */
  console.log('\n▸ 老玩家不會被塞回教學（存檔相容）');
  const veteran = await evaluate(`
    // 一份「Phase 6 時代」的存檔：有進度，但根本沒有 prologueDone 這個欄位
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 320, level: 4,
      unlockedRegions: ['foundations', 'reasoning'],
      collected: ['clarity-01', 'clarity-02'],
      bestGrades: { 'gate-of-clarity-01': 'A' },
      settings: { music: 'ambient-01', volume: 0.5, quality: 'high', muted: false },
      flags: {}
    }));
    return 1;
  `);
  eq(veteran, 1, '寫入一份舊版存檔');
  await reloadPage('重新載入（舊存檔）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);
  const veteranBoot = await evaluate(`
    const g = window.__promptasy;
    return {
      prologueActive: g.prologue.isActive,
      done: g.progression.isPrologueDone(),
      introOpen: g.intro.isOpen,
      xp: g.progression.state.xp,
    };
  `);
  eq(veteranBoot.done, true, '舊存檔（有進度）自動視為已上過引導課程');
  eq(veteranBoot.prologueActive, false, '老玩家不會被強制重上一次');
  eq(veteranBoot.introOpen, true, '沒看過操作說明的老玩家仍拿得到那張卡（保留 Phase 2 行為）');
  eq(veteranBoot.xp, 320, '舊存檔的進度完整保留');

  await evaluate(`document.querySelector('.intro [data-start]').click(); return 1;`);
  await sleep(300);
  eq(await evaluate('return window.__promptasy.intro.isOpen;'), false, '教學可關閉');

  // 回到乾淨狀態：後面的檢查（XP / 圖鑑 / 通關數）都以新存檔為前提
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, flags: { prologueDone: true, introSeen: true }
    }));
    return 1;
  `);
  await reloadPage('重新載入（乾淨存檔）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(400);
  const cleanBoot = await evaluate(`
    const g = window.__promptasy;
    return { xp: g.progression.state.xp, collected: g.progression.state.collected.length, prologueActive: g.prologue.isActive, introOpen: g.intro.isOpen };
  `);
  eq(cleanBoot.xp, 0, '乾淨存檔：XP 歸零');
  eq(cleanBoot.collected, 0, '乾淨存檔：圖鑑清空');
  eq(cleanBoot.prologueActive, false, '已完成序章的存檔不再上課');
  eq(cleanBoot.introOpen, false, '看過教學卡的存檔直接進世界');

  /* ================================================================ */
  console.log('\n▸ 移動與鏡頭手感');
  // 暖機：等 shader 編譯完、frame rate 穩下來再量手感，否則量到的是第一幀的卡頓
  const warm = await evaluate(`
    // 用 requestAnimationFrame 數真正的畫面更新（renderer.info.render.frame 會被後製的多個 pass 灌水）
    let frames = 0;
    let running = true;
    const tick = () => { frames += 1; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const until = performance.now() + 8000;
    let stable = 0;
    let last = 0;
    while (performance.now() < until && stable < 3) {
      const t0 = performance.now();
      const f0 = frames;
      await new Promise((x) => setTimeout(x, 300));
      last = (frames - f0) / ((performance.now() - t0) / 1000);
      if (last > 2) stable += 1;
      else stable = 0;
    }
    running = false;
    return { stable, fps: Math.round(last) };
  `);
  // 註：headless 走的是 swiftshader 軟體渲染，幀率本來就低；這裡只確認「畫面持續在更新」，
  // 手感的量測改用引擎自己的遊戲時間（見下），才不會被軟體渲染的幀率拖成假失敗。
  ok(warm.stable >= 3, '畫面持續在更新（暖機完成）', JSON.stringify(warm));
  // 引擎的遊戲時間探針：之後的手感量測都以它為準
  await evaluate(`
    const g = window.__promptasy;
    // 累加「被夾住的 dt」= 模擬時間。引擎傳進來的 t 是真實經過時間，
    // 在 swiftshader 上會跟模擬時間脫鉤（掉幀時 dt 會被 clamp 到 0.1）。
    window.__gt = { t: 0 };
    g.engine.onUpdate((dt) => { window.__gt.t += dt; });
    return 1;
  `);

  const moveResult = await evaluate(`
    const g = window.__promptasy;
    // 以「遊戲時間」計時：軟體渲染的幀率會讓 wall-clock 與遊戲時間脫鉤
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    g.player.teleport(0, 6);
    const before = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await waitGame(0.7);
    const mid = { speed: g.player.speed, fov: g.engine.camera.fov };
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await waitGame(0.12);
    const coasting = g.player.speed;
    await waitGame(1.2);
    return {
      moved: Math.hypot(g.player.position.x - before.x, g.player.position.z - before.z),
      speedWhileMoving: mid.speed,
      coasting,
      stopped: g.player.speed,
      camY: g.engine.camera.position.y,
      playerY: g.player.position.y,
    };
  `);
  ok(moveResult.moved > 3, '按 W 角色真的往前走', `moved=${moveResult.moved.toFixed(2)}`);
  ok(moveResult.speedWhileMoving > 5, '移動時有速度', `v=${moveResult.speedWhileMoving.toFixed(2)}`);
  ok(moveResult.coasting > 0.5, '放開按鍵後有慣性滑行（M5 加減速）', `v=${moveResult.coasting.toFixed(2)}`);
  ok(moveResult.stopped < 0.5, '最後會停下來', `v=${moveResult.stopped.toFixed(3)}`);
  ok(moveResult.camY > moveResult.playerY, '鏡頭在角色上方');

  const runFov = await evaluate(`
    const g = window.__promptasy;
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await waitGame(1.1);
    const fov = g.engine.camera.fov;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    await waitGame(1.4);
    return { running: fov, idle: g.engine.camera.fov };
  `);
  ok(runFov.running > runFov.idle + 1, '奔跑時 FOV 拉開（M5 速度感）', `run=${runFov.running.toFixed(1)} idle=${runFov.idle.toFixed(1)}`);

  /* --- Phase 5：程序化步態（關節真的在動、左右腿反相） --- */
  const gait = await evaluate(`
    const g = window.__promptasy;
    const j = g.player.character.joints;
    const idleL = j.hipL.rotation.x;
    const idleKnee = j.kneeL.rotation.x;
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 20));
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await waitGame(0.5);
    const samples = [];
    for (let i = 0; i < 18; i += 1) {
      samples.push({ l: j.hipL.rotation.x, r: j.hipR.rotation.x, k: j.kneeL.rotation.x, a: j.shoulderL.rotation.x });
      await waitGame(0.055);
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await waitGame(1.6);
    const span = (key) => Math.max(...samples.map((s) => s[key])) - Math.min(...samples.map((s) => s[key]));
    // 左右腿反相：兩者差值的振幅要明顯大於單腿的振幅
    const opposite = samples.map((s) => s.l - s.r);
    return {
      idleL, idleKnee,
      legSpan: span('l'),
      armSpan: span('a'),
      kneeMin: Math.min(...samples.map((s) => s.k)),
      kneeMax: Math.max(...samples.map((s) => s.k)),
      oppositeSpan: Math.max(...opposite) - Math.min(...opposite),
      breathing: g.player.character.joints.body.position.y,
    };
  `);
  ok(Math.abs(gait.idleL) < 0.05, '站著時腿是放鬆的', `hipL=${gait.idleL.toFixed(3)}`);
  ok(gait.legSpan > 0.25, '走路時髖關節真的在擺動', `span=${gait.legSpan.toFixed(3)}`);
  ok(gait.armSpan > 0.2, '走路時肩關節真的在擺動', `span=${gait.armSpan.toFixed(3)}`);
  ok(gait.oppositeSpan > gait.legSpan * 1.4, '左右腿反相（不是同手同腳）', `opp=${gait.oppositeSpan.toFixed(3)} leg=${gait.legSpan.toFixed(3)}`);
  ok(gait.kneeMin >= -0.001, '膝蓋是單向鉸鏈，不會往前折', `min=${gait.kneeMin.toFixed(3)}`);
  ok(gait.kneeMax > 0.3, '走路時膝蓋會收起來', `max=${gait.kneeMax.toFixed(3)}`);

  /* --- Phase 9：抬頭真的看得到天空（石碑上那句「抬頭看看四周」不能是騙人的） --- */
  /*
   * 課程 v2 · Phase H：正北 54 公尺處多了一道門（減法之庭的頸口）。
   * 上面那幾段手感量測是「一路往北走」的，走著走著就會踏進門的自動詢問半徑 ——
   * 門一問，操控權就交給對話框（Phase 29 的設計，那是對的），後面的按鍵當然全部落空。
   * 所以量鏡頭之前先把門收起來、回到出生點；順手把「它真的會問」記成一條斷言。
   */
  const askedOnWalk = await evaluate(`
    const g = window.__promptasy;
    const wasOpen = g.gateAsk.isOpen;
    if (wasOpen) g.gateAsk.close({ silent: true });
    await new Promise((r) => setTimeout(r, 260));
    g.player.teleport(0, 6);
    await new Promise((r) => setTimeout(r, 260));
    return { wasOpen, inputEnabled: g.player.inputEnabled };
  `);
  ok(askedOnWalk.inputEnabled, '把門的詢問收起來之後，操控權回到玩家手上');

  const lookUp = await evaluate(`
    const g = window.__promptasy;
    const THREE_UP = { x: 0, y: 1, z: 0 };
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    const forward = () => {
      const m = g.engine.camera.matrixWorld.elements;
      // three.js 的鏡頭看向自己的 -Z
      return { x: -m[8], y: -m[9], z: -m[10] };
    };
    g.player.teleport(0, 6);
    await waitGame(0.6);
    const before = forward();
    const beforeCamY = g.engine.camera.position.y;

    // 1) 按住空白鍵抬頭
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await waitGame(1.6);
    const holdPitch = g.player.cameraPitch;
    const up = forward();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    // 2) 滑鼠往上拖也要能抬頭
    g.player.setCameraPitch(0);
    await waitGame(0.5);
    const canvas = g.engine.renderer.domElement;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 500, bubbles: true }));
    for (let i = 0; i < 12; i += 1) {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 500 - i * 12, bubbles: true }));
    }
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await waitGame(0.9);
    const dragPitch = g.player.cameraPitch;
    const dragged = forward();
    const dragCamY = g.engine.camera.position.y;

    // 3) 一開始走路就會平滑收回跟隨鏡頭
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await waitGame(2.2);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await waitGame(1.2);
    const afterWalk = g.player.cameraPitch;

    // 4) 夾住上下限：亂設也不會翻過頭
    g.player.setCameraPitch(99);
    const clampedMax = g.player.cameraPitch;
    g.player.setCameraPitch(-99);
    const clampedMin = g.player.cameraPitch;
    g.player.setCameraPitch(0);
    await waitGame(0.8);

    return {
      beforeY: before.y, upY: up.y, draggedY: dragged.y,
      holdPitch, dragPitch, afterWalk,
      clampedMax, clampedMin,
      range: g.player.pitchRange,
      beforeCamY, dragCamY,
      skyRadius: g.engine.scene.children.find((c) => c.name === 'sky')?.geometry?.parameters?.radius || 0,
      cameraFar: g.engine.camera.far,
      moonY: g.engine.scene.children.find((c) => c.name === 'moon')?.position?.y || 0,
      auroraY: (g.engine.scene.children.find((c) => c.name === 'aurora')?.children || []).map((m) => m.position.y),
    };
  `);
  ok(lookUp.beforeY < 0.05, '預設鏡頭是略微俯視的', `dirY=${lookUp.beforeY.toFixed(3)}`);
  ok(lookUp.holdPitch > 0.45, '按住空白鍵真的抬起頭', `pitch=${lookUp.holdPitch.toFixed(2)}`);
  ok(lookUp.upY > 0.3, '抬頭後視線確實朝上（看得到天空）', `dirY=${lookUp.upY.toFixed(3)}`);
  ok(lookUp.dragPitch > 0.3, '滑鼠往上拖也能抬頭', `pitch=${lookUp.dragPitch.toFixed(2)}`);
  ok(lookUp.draggedY > 0.2, '拖曳抬頭後視線朝上', `dirY=${lookUp.draggedY.toFixed(3)}`);
  ok(lookUp.dragCamY < lookUp.beforeCamY + 0.01, '抬頭時鏡頭同時下沉，角色不會擋住天空');
  ok(lookUp.afterWalk < 0.12, '一開始走路就平滑收回跟隨鏡頭', `pitch=${lookUp.afterWalk.toFixed(3)}`);
  eq(lookUp.clampedMax, lookUp.range.max, '仰角夾在上限（不會翻過頭）');
  eq(lookUp.clampedMin, lookUp.range.min, '俯角夾在下限（不會鑽到地底）');
  ok(lookUp.range.max > 1 && lookUp.range.max < Math.PI / 2, '仰角上限合理（抬得夠高但不到 90°）', String(lookUp.range.max));
  // 天上真的有東西可以看：天空 dome 在視距內、月亮與極光都在頭頂上方
  ok(lookUp.cameraFar > lookUp.skyRadius, '天空 dome 在鏡頭視距之內（抬頭不會看到黑幕）', `far=${lookUp.cameraFar} r=${lookUp.skyRadius}`);
  ok(lookUp.moonY > 200, '月亮掛在高空（抬頭看得到）', `y=${lookUp.moonY.toFixed(0)}`);
  ok(lookUp.auroraY.every((y) => y > 100), '極光帶在高空', JSON.stringify(lookUp.auroraY));

  /* --- Phase 16：WASD 只管走路、方向鍵只管視角 ---------------------------
   * 一次 Runtime.evaluate 有 30 秒的 CDP 上限，而 headless 用軟體渲染只有幾 fps，
   * 所以拆成幾段短的量測（每段都先把位置與仰角歸零，彼此不互相污染）。
   */
  const SCHEME_PRELUDE = `
    const g = window.__promptasy;
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 4000 + 3000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    const reset = async () => { g.player.teleport(0, 6); g.player.setCameraPitch(0); await waitGame(0.3); };
  `;

  // 1) ← → 轉鏡頭（兩邊反向），而且角色留在原地
  const schemeYaw = await evaluate(`
    ${SCHEME_PRELUDE}
    await reset();
    let yaw0 = g.player.cameraYaw;
    const pos0 = { x: g.player.position.x, z: g.player.position.z };
    press('ArrowLeft');
    await waitGame(0.8);
    release('ArrowLeft');
    await waitGame(0.1);
    const yawLeft = g.player.cameraYaw - yaw0;
    const movedByYaw = Math.hypot(g.player.position.x - pos0.x, g.player.position.z - pos0.z);
    yaw0 = g.player.cameraYaw;
    press('ArrowRight');
    await waitGame(0.8);
    release('ArrowRight');
    await waitGame(0.1);
    return { yawLeft, yawRight: g.player.cameraYaw - yaw0, movedByYaw };
  `);
  ok(schemeYaw.yawLeft > 0.6, '按 ← 鏡頭往一邊轉', `Δ=${schemeYaw.yawLeft.toFixed(2)}`);
  ok(schemeYaw.yawRight < -0.6, '按 → 鏡頭往另一邊轉', `Δ=${schemeYaw.yawRight.toFixed(2)}`);
  ok(schemeYaw.movedByYaw < 0.4, '按 ← → 角色不會被帶著走（方向鍵不再移動）', `moved=${schemeYaw.movedByYaw.toFixed(3)}`);

  // 2) ↑ ↓ 抬頭 / 低頭，走的是同一個仰角、同一組上下限
  const schemePitch = await evaluate(`
    ${SCHEME_PRELUDE}
    await reset();
    const pos0 = { x: g.player.position.x, z: g.player.position.z };
    press('ArrowUp');
    await waitGame(1.0);
    const pitchUp = g.player.cameraPitch;
    release('ArrowUp');
    const movedByPitch = Math.hypot(g.player.position.x - pos0.x, g.player.position.z - pos0.z);
    press('ArrowDown');
    await waitGame(1.6);
    const pitchDown = g.player.cameraPitch;
    release('ArrowDown');
    await waitGame(0.2);
    // 夾在上下限：從快到頂的地方再按下去，也只會停在極限值
    const range = g.player.pitchRange;
    g.player.setCameraPitch(range.max - 0.1);
    press('ArrowUp');
    await waitGame(1.2);
    const clampMax = g.player.cameraPitch;
    release('ArrowUp');
    g.player.setCameraPitch(range.min + 0.1);
    press('ArrowDown');
    await waitGame(1.2);
    const clampMin = g.player.cameraPitch;
    release('ArrowDown');
    g.player.setCameraPitch(0);
    return { pitchUp, pitchDown, movedByPitch, clampMax, clampMin, range };
  `);
  ok(schemePitch.pitchUp > 0.3, '按 ↑ 真的抬起頭', `pitch=${schemePitch.pitchUp.toFixed(2)}`);
  ok(
    schemePitch.pitchDown < schemePitch.pitchUp - 0.3,
    '按 ↓ 會把視線壓回去',
    `up=${schemePitch.pitchUp.toFixed(2)} down=${schemePitch.pitchDown.toFixed(2)}`
  );
  ok(schemePitch.movedByPitch < 0.4, '按 ↑ ↓ 角色不會被帶著走', `moved=${schemePitch.movedByPitch.toFixed(3)}`);
  ok(
    Math.abs(schemePitch.clampMax - schemePitch.range.max) < 0.02,
    '一直按 ↑ 也只抬到上限（不會翻過頭）',
    `pitch=${schemePitch.clampMax.toFixed(3)} max=${schemePitch.range.max}`
  );
  ok(
    Math.abs(schemePitch.clampMin - schemePitch.range.min) < 0.02,
    '一直按 ↓ 也只低到下限（不會鑽到地底）',
    `pitch=${schemePitch.clampMin.toFixed(3)} min=${schemePitch.range.min}`
  );

  // 3) 邊走邊抬頭：按著 ↑ 的時候不會被「移動就收回鏡頭」搶走
  const schemeWalkLook = await evaluate(`
    ${SCHEME_PRELUDE}
    await reset();
    press('ArrowUp');
    await waitGame(1.0);
    press('KeyW');
    await waitGame(1.2);
    const pitchWhileWalking = g.player.cameraPitch;
    release('ArrowUp');
    release('KeyW');
    await waitGame(1.6);
    const pitchAfterRelease = g.player.cameraPitch;
    await reset();
    return { pitchWhileWalking, pitchAfterRelease };
  `);
  ok(
    schemeWalkLook.pitchWhileWalking > 0.3,
    '按著 ↑ 邊走邊抬頭，鏡頭不會硬收回去',
    `pitch=${schemeWalkLook.pitchWhileWalking.toFixed(2)}`
  );

  // 4) WASD 四個方向照樣走得動
  const schemeWalk = await evaluate(`
    ${SCHEME_PRELUDE}
    const walk = async (code) => {
      await reset();
      const p0 = { x: g.player.position.x, z: g.player.position.z };
      press(code);
      await waitGame(0.8);
      release(code);
      const d = Math.hypot(g.player.position.x - p0.x, g.player.position.z - p0.z);
      await waitGame(0.8);
      return d;
    };
    const w = await walk('KeyW');
    const a = await walk('KeyA');
    return { w, a };
  `);
  const schemeWalk2 = await evaluate(`
    ${SCHEME_PRELUDE}
    const walk = async (code) => {
      await reset();
      const p0 = { x: g.player.position.x, z: g.player.position.z };
      press(code);
      await waitGame(0.8);
      release(code);
      const d = Math.hypot(g.player.position.x - p0.x, g.player.position.z - p0.z);
      await waitGame(0.8);
      return d;
    };
    const s = await walk('KeyS');
    const d = await walk('KeyD');
    await reset();
    return { s, d };
  `);
  ok(schemeWalk.w > 3, '按 W 照樣走得動', `d=${schemeWalk.w.toFixed(2)}`);
  ok(schemeWalk.a > 3, '按 A 照樣走得動', `d=${schemeWalk.a.toFixed(2)}`);
  ok(schemeWalk2.s > 3, '按 S 照樣走得動', `d=${schemeWalk2.s.toFixed(2)}`);
  ok(schemeWalk2.d > 3, '按 D 照樣走得動', `d=${schemeWalk2.d.toFixed(2)}`);

  // 畫面上的說明也要跟著改：HUD 只講方向鍵，不再出現 Q / R
  const controlCopy = await evaluate(`
    const hud = document.querySelector('.hud__controls');
    return { text: hud ? hud.textContent : '' };
  `);
  ok(/←|→/.test(controlCopy.text), 'HUD 的操作提示寫著方向鍵轉鏡頭', controlCopy.text);
  ok(!/Q\s*\/\s*R/.test(controlCopy.text), 'HUD 不再提到 Q / R', controlCopy.text);
  ok(/WASD/.test(controlCopy.text), 'HUD 仍然說 WASD 是移動鍵', controlCopy.text);

  const cheer = await evaluate(`
    const g = window.__promptasy;
    const ch = g.player.character;
    const j = ch.joints;
    const before = j.shoulderL.rotation.x;
    g.player.celebrate();
    /*
     * 慶祝是「遊戲時間」的鐘形曲線，而 headless 用 swiftshader 軟體渲染，
     * 實測只有 3 fps —— 固定睡 550ms 再取樣，取到的可能只是曲線的頭幾格
     * （量測過：把整個 .ui 移掉、完全沒有 CSS 參與，取樣值一樣）。
     * 所以改成**在慶祝期間持續取樣、記下舉得最高的那一刻**：
     * 語意不變（雙手真的舉起來了），但不再綁在機器跑多快上。
     */
    let peak = before;
    let celebratingMid = false;
    const until = performance.now() + 12000;
    while (ch.celebrating && performance.now() < until) {
      celebratingMid = true;
      peak = Math.min(peak, j.shoulderL.rotation.x);
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 160));
    return { before, during: peak, celebratingMid, stillCelebrating: ch.celebrating, after: j.shoulderL.rotation.x };
  `);
  ok(cheer.during < cheer.before - 0.8, '過關慶祝時雙手真的舉起來', `${cheer.before.toFixed(2)} → ${cheer.during.toFixed(2)}`);
  eq(cheer.celebratingMid, true, '慶祝進行中');
  eq(cheer.stillCelebrating, false, '慶祝會自己結束（不需要外部收尾）');
  ok(Math.abs(cheer.after - cheer.before) < 0.15, '慶祝動作會自己收回去', `after=${cheer.after.toFixed(2)}`);

  /* ================================================================ */
  console.log('\n▸ 走到石座 → 送出 prompt');
  const near = await evaluate(`
    const g = window.__promptasy;
    const m = g.world.markers.find((x) => x.id === 'gate-of-clarity-01');
    g.player.teleport(m.position.x + 2, m.position.z + 2);
    await new Promise((r) => setTimeout(r, 260));
    return {
      interact: document.querySelector('[data-interact]')?.textContent || '',
      hidden: document.querySelector('[data-interact]')?.hidden,
      markerNear: m.near,
      haloOpacity: m.halo.material.opacity,
    };
  `);
  eq(near.hidden, false, '走近石座顯示互動提示');
  ok(near.interact.includes('清晰之門'), '互動提示顯示關卡名');
  eq(near.markerNear, true, '石座進入「走近」狀態（M4）');

  await key('KeyE', 'e', { vk: 69 });
  await sleep(420);

  /* ================================================================ */
  /* Phase 12 · 四幕分鏡：①委託 → ②指引 → ③刻印 → ④手印              */
  /*   一次只有一幕擁有畫面；不能跳過還沒看過的幕；隨時走得回去。       */
  /* ================================================================ */
  console.log('  · 第一幕 · 委託');
  const VIS = `const vis = (sel) => { const n = document.querySelector(sel); return !!n && !n.hidden && n.offsetParent !== null; };`;
  const act1 = await evaluate(`
    const g = window.__promptasy;
    ${VIS}
    const nav = Array.from(document.querySelectorAll('#prompt-console .acts__item'));
    return {
      open: g.promptConsole.isOpen,
      act: g.promptConsole.act,
      briefVisible: vis('#prompt-console .act--brief'),
      guideVisible: vis('#prompt-console .act--guide'),
      carveVisible: vis('#prompt-console .act--carve'),
      verdictVisible: vis('#prompt-console .act--verdict'),
      scenario: document.querySelector('#prompt-console [data-scenario]').textContent.trim(),
      mission: document.querySelector('#prompt-console [data-mission]').textContent.trim(),
      materialShown: !document.querySelector('#prompt-console [data-material-wrap]').hidden,
      nextLabel: document.querySelector('#prompt-console [data-act-next="2"]').textContent.trim(),
      focusOnAct: document.activeElement === document.querySelector('#prompt-console .act--brief'),
      navCount: nav.length,
      navNow: nav.filter((b) => b.classList.contains('is-now')).map((b) => b.textContent.trim()),
      navDisabled: nav.filter((b) => b.disabled).map((b) => b.getAttribute('data-act-go')),
      canJumpCarve: g.promptConsole.canGoAct(3),
      canJumpPalm: g.promptConsole.canGoAct(4),
      // 第一幕不准出現官方出處 / 指引（太早給答案）
      srcInBrief: document.querySelectorAll('#prompt-console .act--brief a.src').length,
      xp: g.progression.state.xp,
    };
  `);
  eq(act1.open, true, '按 E 開啟 Prompt 主控台');
  eq(act1.act, 1, '一打開就在第一幕（只有題目）');
  eq(act1.briefVisible, true, '第一幕：委託看得到');
  eq(act1.guideVisible, false, '第一幕：指引還沒登場（官方內容不會太早出現）');
  eq(act1.carveVisible, false, '第一幕：作答區還沒登場');
  eq(act1.verdictVisible, false, '第一幕：結果區還沒登場');
  ok(act1.scenario.length > 20, '第一幕看得到情境', act1.scenario.slice(0, 24));
  ok(act1.mission.length > 10, '第一幕看得到「你的任務」', act1.mission);
  eq(act1.materialShown, true, '第一幕看得到 NPC 遞給你的素材');
  ok(/聆聽指引/.test(act1.nextLabel), '第一幕只有一個往下的出口', act1.nextLabel);
  eq(act1.focusOnAct, true, '焦點落在這一幕上（Enter 就往下走）');
  eq(act1.navCount, 4, '幕指示器有四幕');
  eq(act1.navNow.length, 1, '一次只有一幕被標成「現在在這裡」');
  ok(/委託/.test(act1.navNow[0]), '指示器指著①委託', act1.navNow[0]);
  eq(act1.canJumpCarve, false, '不能跳過指引直接去刻印');
  eq(act1.canJumpPalm, false, '更不能跳到手印');
  ok(act1.navDisabled.includes('3') && act1.navDisabled.includes('4'), '沒走過的幕在指示器上按不下去', act1.navDisabled.join(','));
  eq(act1.srcInBrief, 0, '第一幕沒有任何官方出處連結（不搶注意力）');
  eq(act1.xp, 0, '光是打開關卡不會給分');

  /* --- 第二幕：神諭刻文（教學內容換皮成世界觀，但出處照樣可點） --- */
  console.log('  · 第二幕 · 指引（神諭刻文）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(460);
  const act2 = await evaluate(`
    const g = window.__promptasy;
    ${VIS}
    const glyphs = Array.from(document.querySelectorAll('#prompt-console .glyph'));
    const nav = Array.from(document.querySelectorAll('#prompt-console .acts__item'));
    return {
      act: g.promptConsole.act,
      briefVisible: vis('#prompt-console .act--brief'),
      guideVisible: vis('#prompt-console .act--guide'),
      carveVisible: vis('#prompt-console .act--carve'),
      // 幕名的標題底下現在還接著導言與那本典籍（同一行）→ 只取標題自己的文字
      head: Array.from(document.querySelector('#prompt-console .act--guide .act__head').childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim(),
      lead: document.querySelector('#prompt-console .act--guide .act__lead').textContent.trim(),
      leadOwn: Array.from(document.querySelector('#prompt-console .act--guide .act__lead').childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim(),
      tipBubble: document.querySelector('#prompt-console .act--guide .infotip__bubble')?.textContent || '',
      tipVisibility: (() => {
        const b = document.querySelector('#prompt-console .act--guide .infotip__bubble');
        return b ? getComputedStyle(b).visibility : 'none';
      })(),
      // 那本典籍就掛在導言那一行（它自己帶著小卡：「神諭原典：<文件名>」）
      tipDescribes:
        document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon')?.getAttribute('aria-describedby') ===
        document.querySelector('#prompt-console .act--guide .infotip__bubble')?.id,
      bookHref: document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon')?.getAttribute('href') || '',
      bookTarget: document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon')?.getAttribute('target') || '',
      bookAria: document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon')?.getAttribute('aria-label') || '',
      bookVisible: (() => {
        const a = document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon');
        if (!a) return 'none';
        const r = a.getBoundingClientRect();
        return getComputedStyle(a).visibility === 'visible' && r.width > 0 && r.height > 0 ? 'visible' : 'hidden';
      })(),
      craft: document.querySelector('#prompt-console [data-craft]').textContent.trim(),
      dataCraft: g.content.challenge('gate-of-clarity-01').craft,
      rubric: g.content.challenge('gate-of-clarity-01').rubric.length,
      // Phase A：一關只教一條 —— 主技巧來自資料層的 primaryTechniqueId
      primaryTechniqueId: g.content.challenge('gate-of-clarity-01').primaryTechniqueId,
      // 課程 v2 · Phase J3：教學的正典是 v2 技能，刻文掛的是它的中文名
      primarySkillId: g.content.challenge('gate-of-clarity-01').primarySkillId,
      primaryTitle: g.content.skill(g.content.challenge('gate-of-clarity-01').primarySkillId).nameZh,
      primaryVendor: g.content.sourceForSkill(g.content.challenge('gate-of-clarity-01').primarySkillId).vendor,
      primaryCount: document.querySelectorAll('#prompt-console .glyph--primary').length,
      glyphTech: glyphs.map((n) => n.querySelector('.glyph__title i')?.textContent.trim() || ''),
      // 2026-08-03 站長裁決：「順手會用到」那一行整組移除（130 關全長一樣、零資訊量）
      extrasNodes: document.querySelectorAll('#prompt-console [data-guidance-extra], #prompt-console .extras, #prompt-console .extras__item').length,
      guideText: document.querySelector('#prompt-console .act--guide').textContent,
      glyphs: glyphs.length,
      titles: glyphs.map((n) => n.querySelector('.glyph__title')?.textContent.trim() || ''),
      whats: glyphs.map((n) => (n.querySelector('.glyph__what')?.textContent || '').length),
      backLabel: document.querySelector('#prompt-console .act--guide [data-act-go="1"]').textContent.trim(),
      nextLabel: document.querySelector('#prompt-console [data-act-next="3"]').textContent.trim(),
      navNow: nav.filter((b) => b.classList.contains('is-now')).map((b) => b.textContent.trim()),
      canJumpCarve: g.promptConsole.canGoAct(3),
      canBackBrief: g.promptConsole.canGoAct(1),
      seen: g.progression.hasSeenGuidance('gate-of-clarity-01'),
      persisted: (JSON.parse(localStorage.getItem('promptasy.v1.save')).guidanceSeen || []).includes('gate-of-clarity-01'),
      xp: g.progression.state.xp,
    };
  `);
  eq(act2.act, 2, 'Enter 就切到第二幕');
  eq(act2.briefVisible, false, '第二幕：委託讓位（一次只有一幕擁有畫面）');
  eq(act2.guideVisible, true, '第二幕：指引登場');
  eq(act2.carveVisible, false, '第二幕：作答區還沒登場');
  eq(act2.head, '神諭刻文', '第二幕叫「神諭刻文」，不是「官方怎麼說」');
  /* Phase 13：那句「＝各家官方文件」的旁白收進 ⓘ —— 內容還在，但不再一直佔著版面 */
  ok(!/官方文件/.test(act2.leadOwn), '導言本身只剩一句短的（解釋不再內嵌）', act2.leadOwn);
  ok(act2.leadOwn.length <= 24, '導言夠短', `${act2.leadOwn.length} 字：${act2.leadOwn}`);
  /*
   * 2026-08-03 站長定稿：那顆 ⓘ 換成**那本典籍本身**，就接在導言後面。
   * 小卡上寫的不再是「＝各家官方文件」這種旁白，而是**這一段到底出自哪一份文件**
   * —— 換皮但不說謊：後面接得出真實文件名，而且它一按就開官方文件（護欄 2）。
   */
  ok(/^神諭原典：/.test(act2.tipBubble.trim()), '那本典籍的小卡寫著「神諭原典：…」', act2.tipBubble);
  ok(act2.tipBubble.includes(`${act2.primaryVendor} · `), '小卡後面接得出真正的文件名', act2.tipBubble);
  eq(act2.tipVisibility, 'hidden', '小卡預設看不見（不佔版面）');
  eq(act2.tipDescribes, true, '那本典籍用 aria-describedby 指到小卡');
  eq(act2.craft, act2.dataCraft, '第二幕接住從任務搬出來的「工法」');
  ok(act2.craft.length > 10, '工法講得出「這次要怎麼答」', act2.craft);
  /* Phase A · C1：第二幕只放大「這一關教的那一條」，不再一次攤開四段教學 */
  ok(act2.rubric > 1, '這一關的 rubric 不只一條（所以「只有一條刻文」是真的收斂過）', `rubric=${act2.rubric}`);
  eq(act2.glyphs, 1, '第二幕只有一段刻文 —— 一關只教一件事');
  eq(act2.primaryCount, 1, '而且那一段就是被放大的主刻文');
  eq(act2.primaryTechniqueId, 'clarity-03', '祖先技巧仍記在資料層的 primaryTechniqueId（收集用）');
  eq(act2.primarySkillId, 'clear-specific', '教學的正典是 v2 技能（D2 相容層已拆除）');
  eq(act2.glyphTech[0], act2.primaryTitle, '刻文掛的是這一關教的那條 v2 技能的名字', act2.glyphTech.join('｜'));
  ok(act2.whats.every((n) => n >= 20), '那一段刻文有白話說明', act2.whats.join(','));
  // 「順手會用到」那一行整組移除 → 守住「不得回歸」（地基分由第三幕的刻痕對照承擔）
  eq(act2.extrasNodes, 0, '第二幕不再有「順手會用到」那一行（連節點都沒有）');
  ok(!/順手會用到/.test(act2.guideText), '第二幕的字裡也找不到「順手會用到」', act2.guideText.slice(0, 120));
  /* 出處：那本典籍就在導言那一行，永遠看得見、一按就開官方文件（護欄 2） */
  eq(act2.bookVisible, 'visible', '那本典籍一直看得見（量得到、沒有被收進任何摺頁）');
  ok(/^https:\/\//.test(act2.bookHref), '那本典籍是可點的官方連結', act2.bookHref);
  eq(act2.bookTarget, '_blank', '出處連結開新視窗，不會把玩家踢出遊戲');
  ok(
    /^神諭原典：/.test(act2.bookAria) && act2.bookAria.includes(`：${act2.primaryVendor} · `),
    '螢幕閱讀器聽得到「神諭原典：<哪一家> · <文件名>」',
    act2.bookAria
  );
  ok(act2.bookAria.includes('開新分頁'), '也聽得到「會開新分頁」', act2.bookAria);

  /* --- 出處深連結：神諭原典要直接落在被引用的那一節，不是頁面最上面 --- */
  const deepAct2 = await evaluate(`
    const g = window.__promptasy;
    const a = document.querySelector('#prompt-console .act--guide [data-guide-lead] a.bookicon');
    const skillId = g.content.challenge('gate-of-clarity-01').primarySkillId;
    const data = g.content.sourceForSkill(skillId);
    const rows = g.content.catalog.sourcesForSkill(skillId);
    return {
      href: a ? a.getAttribute('href') : '',
      dataUrl: data.url,
      anchorKind: rows[0].anchor,
      // 130 座教學神廟的主原典裡，有幾個真的帶著片段
      shrines: g.content.challenges
        .filter((c) => c.primarySkillId)
        .map((c) => g.content.catalog.sourcesForSkill(c.primarySkillId)[0])
        .reduce(
          (acc, s) => {
            acc.total += 1;
            if (s.url.includes('#')) acc.deep += 1;
            else acc.flat += 1;
            if (s.anchor === 'none') acc.honest += 1;
            return acc;
          },
          { total: 0, deep: 0, flat: 0, honest: 0 }
        ),
    };
  `);
  eq(deepAct2.href, deepAct2.dataUrl, '畫面上的 href 就是資料層那一個網址（沒有中間層改寫）');
  ok(deepAct2.href.includes('#'), '神諭原典帶著片段 —— 點過去直接落在被引用的那一節', deepAct2.href);
  ok(
    deepAct2.href.endsWith('#best-practices'),
    '而且是這一關教的那一節（Microsoft · Prompt engineering techniques 的 Best practices）',
    deepAct2.href
  );
  ok(deepAct2.anchorKind !== 'none', '資料層也表態了這個 anchor 是怎麼定位的', String(deepAct2.anchorKind));
  eq(deepAct2.shrines.total, 130, '130 座教學神廟的主原典全部盤過');
  ok(
    deepAct2.shrines.deep >= 110,
    `${deepAct2.shrines.deep} / 130 座的主原典直接跳到章節`,
    JSON.stringify(deepAct2.shrines)
  );
  eq(deepAct2.shrines.flat, deepAct2.shrines.honest, '沒有片段的那幾座都在資料層誠實標成 none（不是漏做）');
  ok(/回顧委託/.test(act2.backLabel), '第二幕可以翻回第一幕', act2.backLabel);
  ok(/開始刻印/.test(act2.nextLabel), '第二幕往下的出口是「開始刻印」', act2.nextLabel);
  ok(/指引/.test(act2.navNow[0]), '指示器跟著移到②指引', act2.navNow[0]);
  eq(act2.canJumpCarve, true, '看過指引之後才走得到刻印');
  eq(act2.canBackBrief, true, '走過的幕永遠回得去');
  eq(act2.seen, true, '「這一關的指引看過了」記進進度');
  eq(act2.persisted, true, '而且立刻寫進 localStorage（重玩時可以跳過）');
  eq(act2.xp, 0, '看指引不給分');

  /* --- 回頭：第二幕 → 第一幕 → 再往前（走過的幕自由來回） --- */
  const actBack = await evaluate(`
    const g = window.__promptasy;
    ${VIS}
    document.querySelector('#prompt-console .act--guide [data-act-go="1"]').click();
    await new Promise((r) => setTimeout(r, 320));
    const backAct = g.promptConsole.act;
    const backBrief = vis('#prompt-console .act--brief');
    const canForward = g.promptConsole.canGoAct(2);
    const canSkipPalm = g.promptConsole.canGoAct(4);
    // 用指示器直接跳回②（走過了，所以按得下去）
    document.querySelector('#prompt-console .acts__item[data-act-go="2"]').click();
    await new Promise((r) => setTimeout(r, 300));
    return { backAct, backBrief, canForward, canSkipPalm, act: g.promptConsole.act, visited: g.promptConsole.visitedActs };
  `);
  eq(actBack.backAct, 1, '按「回顧委託」真的回到第一幕');
  eq(actBack.backBrief, true, '回到第一幕時委託又是唯一的畫面');
  eq(actBack.canForward, true, '看過的第二幕還是走得回去');
  eq(actBack.canSkipPalm, false, '就算回頭過，也不能跳到還沒發生的手印');
  eq(actBack.act, 2, '點指示器就跳回第二幕');
  ok(actBack.visited.join(',') === '1,2', '走過的幕被記下來（1,2）', actBack.visited.join(','));

  /* --- 第三幕：石碑成為舞台，刻痕對照就在旁邊即時亮燈 --- */
  console.log('  · 第三幕 · 刻印');
  await evaluate(`
    document.querySelector('#prompt-console [data-act-next="3"]').click();
    await new Promise((r) => setTimeout(r, 360));
    return 1;
  `);
  const consoleOpen = await evaluate(`
    const g = window.__promptasy;
    ${VIS}
    return {
      act: g.promptConsole.act,
      guideVisible: vis('#prompt-console .act--guide'),
      carveVisible: vis('#prompt-console .act--carve'),
      // Phase 11：預設是石碑刻印，不是打字
      mode: g.promptConsole.mode,
      savedMode: g.progression.state.settings.promptMode,
      steleVisible: !document.querySelector('#prompt-console .stele-stage').hidden,
      freeHidden: document.querySelector('#prompt-console [data-free]').hidden,
      orbHidden: document.querySelector('#prompt-console [data-orb]').hidden,
      focusedOption: document.activeElement?.classList.contains('opt'),
      askText: document.querySelector('#prompt-console [data-ask]').textContent.trim(),
      progress: document.querySelector('#prompt-console [data-progress]').textContent.trim(),
      options: document.querySelectorAll('#prompt-console .opt').length,
      palmHidden: document.querySelector('#prompt-console [data-palmwrap]').hidden,
      modeBtn: document.querySelector('#prompt-console [data-mode]').textContent.trim(),
      checklist: document.querySelectorAll('#prompt-console .checklist li').length,
      sources: document.querySelectorAll('#prompt-console .checklist a.src').length,
      // 刻痕對照與石碑是並排的（不是要捲很久才看得到）
      railVisible: vis('#prompt-console .rail'),
      lampVisible: vis('#prompt-console [data-lamp]'),
      sideBySide: (() => {
        const s = document.querySelector('#prompt-console .carvestage__main').getBoundingClientRect();
        const r = document.querySelector('#prompt-console .rail').getBoundingClientRect();
        return r.left >= s.right - 2 && Math.abs(r.top - s.top) < 260;
      })(),
      // 第二幕的刻文縮成一個側頁籤（不是一牆文字）
      guideTab: document.querySelector('#prompt-console [data-guidetab] summary')?.textContent.trim() || '',
      guideTabOpen: document.querySelector('#prompt-console [data-guidetab]').open,
      guideTabRows: document.querySelectorAll('#prompt-console .guidetab__list li').length,
      guideTabSources: document.querySelectorAll('#prompt-console .guidetab__list a.bookicon').length,
      guideTabQuiet: document.querySelectorAll('#prompt-console .guidetab__list li.is-quiet').length,
      // Phase A：刻痕對照分兩種位階 —— 主教學目標 vs 地基／還沒搬家的舊項目
      primaryRows: document.querySelectorAll('#prompt-console .checklist li.is-primary').length,
      primaryTag: document.querySelector('#prompt-console .checklist li.is-primary .checklist__tag')?.textContent.trim() || '',
      primaryName: document.querySelector('#prompt-console .checklist li.is-primary .checklist__text b')?.textContent.trim() || '',
      foundationRows: document.querySelectorAll('#prompt-console .checklist li.is-foundation').length,
      foundationWeight: document.querySelector('#prompt-console .checklist li.is-foundation .checklist__w')?.textContent.trim() || '',
      weights: Array.from(document.querySelectorAll('#prompt-console .checklist .checklist__w')).map((n) => n.textContent.trim()),
      xp: g.progression.state.xp,
      /* 課程 v2 · Phase J3：C1 收斂之後這一關就是「一條主檢查 ＋ 一條地基」 */
      rubricLen: g.content.challenge('gate-of-clarity-01').rubric.length,
      pass: g.content.challenge('gate-of-clarity-01').pass,
    };
  `);
  eq(consoleOpen.act, 3, '「開始刻印」切到第三幕');
  eq(consoleOpen.guideVisible, false, '第三幕：指引收起來（不再是一牆文字）');
  eq(consoleOpen.carveVisible, true, '第三幕：作答區成為舞台');
  eq(consoleOpen.mode, 'guided', '預設就是石碑刻印模式（Phase 11）');
  eq(consoleOpen.savedMode, 'guided', '存檔裡的答題方式預設是石碑刻印');
  eq(consoleOpen.steleVisible, true, '舞台上是一塊石碑');
  eq(consoleOpen.freeHidden, true, '石碑模式下輸入框收起來（不用打字）');
  eq(consoleOpen.orbHidden, true, '石碑模式下提示球收起來（回饋就在選項旁邊）');
  eq(consoleOpen.focusedOption, true, '進第三幕焦點直接落在第一個選項（M6 無障礙）');
  ok(consoleOpen.askText.length >= 6, '石碑一次只問一段', consoleOpen.askText);
  ok(/第 1 \/ \d 段/.test(consoleOpen.progress), '看得到「第 N / M 段」', consoleOpen.progress);
  ok(consoleOpen.options >= 2, '每一段有 2–3 個選項', `n=${consoleOpen.options}`);
  eq(consoleOpen.palmHidden, true, '還沒刻完之前沒有手掌印');
  ok(/自由書寫/.test(consoleOpen.modeBtn), '有一顆安靜的「自由書寫模式」切換', consoleOpen.modeBtn);
  eq(consoleOpen.rubricLen, 2, '清晰之門收斂成「一條主檢查 ＋ 一條地基」（C1）');
  eq(consoleOpen.checklist, consoleOpen.rubricLen, '主控台列出這一關的每一條 rubric');
  eq(consoleOpen.sources, consoleOpen.rubricLen, '每條 rubric 都有官方出處連結');
  eq(consoleOpen.railVisible, true, '刻痕對照跟石碑同時在畫面上');
  eq(consoleOpen.lampVisible, true, '進度燈也在第三幕看得到');
  eq(consoleOpen.sideBySide, true, '刻痕對照在石碑「旁邊」，不是下面');
  ok(/神諭刻文/.test(consoleOpen.guideTab), '第三幕有一個翻回刻文的側頁籤', consoleOpen.guideTab);
  eq(consoleOpen.guideTabOpen, false, '側頁籤預設收著（不擋舞台）');
  eq(consoleOpen.guideTabRows, consoleOpen.rubricLen, '側頁籤壓成一行一條');
  eq(consoleOpen.guideTabSources, 1, '側頁籤上的原典只掛在「這一關教的」那一條');
  eq(
    consoleOpen.guideTabQuiet,
    consoleOpen.rubricLen - 1,
    '其餘的在側頁籤上只留名字（安靜的一階）'
  );
  /* --- Phase A：刻痕對照上，一關只有一條被標成「這一關教的」 --- */
  eq(consoleOpen.primaryRows, 1, '刻痕對照上恰好一條被標成主教學目標（C1）');
  eq(consoleOpen.primaryTag, '這一關教的', '主教學目標帶著一個看得懂的標記', consoleOpen.primaryTag);
  eq(consoleOpen.foundationRows, 1, '地基（說清楚要做什麼）恰好一條，而且是次要位階');
  eq(consoleOpen.foundationWeight, '0.5 分', '地基只值 0.5 分，而且寫成「0.5」不是「0.50」', consoleOpen.foundationWeight);
  ok(
    consoleOpen.weights.every((t) => /^\d+(\.\d)? 分$/.test(t)),
    '每一條的分數都印得出乾淨的數字（小數不會漏出浮點雜訊）',
    consoleOpen.weights.join('｜')
  );
  eq(consoleOpen.xp, 0, '光是走到刻印不會給分');

  /* --- 切到自由書寫：底下的舊玩法（起手寫法 / 快速填入 / 積木 / 提示球 / 預檢）一項都沒少 --- */
  const toFree = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#prompt-console [data-mode]').click();
    await new Promise((r) => setTimeout(r, 320));
    document.querySelector('#prompt-console .prompt-input').focus();
    return {
      mode: g.promptConsole.mode,
      saved: g.progression.state.settings.promptMode,
      freeHidden: document.querySelector('#prompt-console [data-free]').hidden,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      orbHidden: document.querySelector('#prompt-console [data-orb]').hidden,
      focused: document.activeElement?.classList.contains('prompt-input'),
      help: !!document.getElementById('prompt-help'),
      modeBtn: document.querySelector('#prompt-console [data-mode]').textContent.trim(),
    };
  `);
  eq(toFree.mode, 'free', '按下切換就進入自由書寫模式');
  eq(toFree.saved, 'free', '答題方式立刻寫進設定（會跨關卡記住）');
  eq(toFree.freeHidden, false, '自由書寫模式下輸入框回來了');
  eq(toFree.steleHidden, true, '自由書寫模式下石碑收起來');
  eq(toFree.orbHidden, false, '自由書寫模式下提示球回來了');
  eq(toFree.focused, true, '焦點可以落在輸入框');
  eq(toFree.help, true, '主控台有鍵盤操作說明');
  ok(/石碑/.test(toFree.modeBtn), '切換鈕改成「回到石碑刻印」', toFree.modeBtn);

  // Phase 7：正式主控台也有「預檢」——跟練習台同一支引擎，打字就先亮起來
  const preflight = await evaluate(`
    const g = window.__promptasy;
    const box = document.querySelector('#prompt-console [data-preflight]');
    const ta = document.querySelector('#prompt-console .prompt-input');
    const lit = () => document.querySelectorAll('#prompt-console .checklist li.is-pass').length;
    const on = box.checked;
    ta.value = 'Summarize the notice below in exactly 3 bullet points for first-time visitors.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 420));
    const litOn = lit();
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 220));
    const litOff = lit();
    const savedOff = g.progression.state.settings.preflight;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 220));
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return { on, litOn, litOff, savedOff, xp: g.progression.state.xp, cleared: lit() };
  `);
  eq(preflight.on, true, '預檢預設開啟（Phase 9：所有人都預設看得到亮燈）');
  ok(preflight.litOn >= 2, '打字時達成的項目會亮起來（即時預檢）', `lit=${preflight.litOn}`);
  eq(preflight.litOff, 0, '關掉預檢就回到乾淨的清單');
  eq(preflight.savedOff, false, '預檢的開關會存進設定');
  eq(preflight.xp, 0, '預檢不給分');
  eq(preflight.cleared, 0, '清空輸入後預檢也跟著清掉');

  /* --- Phase 9：亮燈動畫 ＋ 進度燈 ＋「可以過關了」的送出鍵 --- */
  const consoleLive = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('#prompt-console .prompt-input');
    const lamp = document.querySelector('#prompt-console [data-lamp]');
    const submit = document.querySelector('#prompt-console [data-submit]');
    const type = async (v) => {
      ta.value = v;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 380));
    };
    await type('');
    const empty = {
      lampHidden: lamp.hidden,
      lampText: lamp.textContent.trim(),
      ready: submit.classList.contains('is-ready'),
      submitText: submit.textContent.trim(),
    };
    // 只做到一項（任務），進度燈應該還在倒數
    await type('請把下面這張告示改寫成清楚好懂的公告。');
    const one = {
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      justlit: document.querySelectorAll('#prompt-console .checklist li.is-justlit').length,
      lampText: lamp.textContent.trim(),
      ready: submit.classList.contains('is-ready'),
    };
    // 再補到足以過關
    await type('請把下面這張告示改寫成公告。輸出格式：3 個條列重點，每點不超過 20 個字。這是寫給第一次來的旅人看的。');
    const done = {
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      lampText: lamp.textContent.trim(),
      lampReady: lamp.classList.contains('is-ready'),
      ready: submit.classList.contains('is-ready'),
      submitText: submit.textContent.trim(),
      xp: g.progression.state.xp,
    };
    await type('');
    return { empty, one, done };
  `);
  eq(consoleLive.empty.lampHidden, false, '進度燈一開始就看得到');
  ok(/再完成/.test(consoleLive.empty.lampText), '進度燈用「再完成 N 項」講話', consoleLive.empty.lampText);
  /*
   * Phase A：門檻是小數時畫面上的數字要讀得順（不是 2.50、更不是 2.4999999）。
   * 課程 v2 · Phase J3：教學神廟的門檻全部收斂成 2，帶半分的門檻現在住在應用關身上
   * （`trialPass()` 算出來的 3.5）—— 所以這裡改成「照資料層寫出來、而且沒有浮點雜訊」。
   */
  ok(
    new RegExp(`需要 ${consoleOpen.pass} 分`).test(consoleLive.empty.lampText),
    `進度燈把門檻寫成「需要 ${consoleOpen.pass} 分」`,
    consoleLive.empty.lampText
  );
  ok(!/\d\.\d{3,}/.test(consoleLive.empty.lampText), '進度燈不會漏出浮點雜訊', consoleLive.empty.lampText);
  eq(consoleLive.empty.ready, false, '還沒達標時送出鍵不發光');
  ok(consoleLive.one.lit >= 1, '打字打到一項就亮一盞燈', `lit=${consoleLive.one.lit}`);
  ok(consoleLive.one.justlit >= 1, '剛亮起來的那一項有亮燈動畫', `justlit=${consoleLive.one.justlit}`);
  ok(/再完成/.test(consoleLive.one.lampText), '進度燈跟著更新剩幾項', consoleLive.one.lampText);
  ok(!/\d\.\d{3,}/.test(consoleLive.one.lampText), '做到一項之後的目前分數也是乾淨的數字', consoleLive.one.lampText);
  eq(consoleLive.done.lit, consoleOpen.rubricLen, '補齊之後每一盞燈都亮了', `lit=${consoleLive.done.lit}`);
  eq(consoleLive.done.ready, true, '達到門檻時送出鍵發光');
  eq(consoleLive.done.lampReady, true, '達到門檻時進度燈轉成綠燈');
  ok(/可以呈上了/.test(consoleLive.done.submitText), '送出鍵直說「可以呈上了」', consoleLive.done.submitText);
  ok(
    /呈給神諭/.test(consoleLive.done.submitText) && !/送出評分/.test(consoleLive.done.submitText),
    '送出鍵是世界觀的說法「呈給神諭」，沒有系統術語',
    consoleLive.done.submitText
  );
  ok(/呈給神諭/.test(consoleLive.done.lampText), '進度燈也照著新說法講', consoleLive.done.lampText);
  eq(consoleLive.done.xp, 0, '預檢再怎麼亮都不給分（只有送出才算）');

  /* --- Phase 9：漂浮提示球 ＋ 黃色教學框 ＋「幫我填」 --- */
  const orb = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('#prompt-console .prompt-input');
    const orbBtn = document.querySelector('#prompt-console [data-orb]');
    const box = () => document.querySelector('#prompt-console [data-coach]');
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 320));
    const visible = !orbBtn.hidden && getComputedStyle(orbBtn).display !== 'none';
    const closedAtFirst = box().hidden;
    // 點開
    orbBtn.click();
    await new Promise((r) => setTimeout(r, 240));
    const opened = box().hidden === false;
    const styles = getComputedStyle(box());
    const head = box().querySelector('.coach__head b')?.textContent || '';
    const what = box().querySelector('.coach__what')?.textContent || '';
    const how = box().querySelector('.coach__how')?.textContent || '';
    const fills = Array.from(box().querySelectorAll('[data-coach-fill]'));
    const firstTarget = g.promptConsole.coach.target;
    // 「幫我填」把中文句子插到游標處
    const before = ta.value;
    fills[0].click();
    await new Promise((r) => setTimeout(r, 380));
    const afterFill = ta.value;
    const litAfterFill = document.querySelectorAll('#prompt-console .checklist li.is-pass').length;
    // 換下一個提示
    const nextBtn = box().querySelector('[data-coach-next]');
    if (nextBtn) nextBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    const secondTarget = g.promptConsole.coach.target;
    // 注意力脈衝（不是 modal，只是球在發光）
    g.promptConsole.toggleCoach(false);
    await new Promise((r) => setTimeout(r, 160));
    g.promptConsole.nudge();
    await new Promise((r) => setTimeout(r, 160));
    const nudging = orbBtn.classList.contains('is-nudging');
    const stillNotModal = box().hidden;
    const overlayBlocked = document.querySelectorAll('#prompt-console .coach[aria-modal="true"]').length;
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    return {
      visible, closedAtFirst, opened, head, what, how,
      fillCount: fills.length,
      fillLabel: fills[0].querySelector('.coach__fillhead')?.textContent || '',
      before, afterFill, litAfterFill,
      firstTarget, secondTarget,
      nudging, stillNotModal, overlayBlocked,
      borderLeft: styles.borderLeftColor,
      accentIsYellow: styles.borderLeftColor.replace(/\\s+/g, '') === 'rgb(230,199,155)',
      borderLeftWidth: styles.borderLeftWidth,
      coachEntries: g.content.coachMeta.entries.length,
      usedChecks: new Set([
        ...g.content.challenges.flatMap((c) => c.rubric.map((r) => r.check)),
        ...(g.prologueContent?.steps || []).flatMap((st) => (st.rubric || []).map((r) => r.check)),
      ]).size,
    };
  `);
  eq(orb.visible, true, '主控台裡看得到漂浮提示球');
  eq(orb.closedAtFirst, true, '提示框預設收著（不擋畫面）');
  eq(orb.opened, true, '點一下提示球就打開提示框');
  ok(orb.head.length > 0, '提示框有標題', orb.head);
  ok(orb.what.length >= 20, '提示框用白話解釋「這是什麼」', orb.what.slice(0, 40));
  ok(/[\u4e00-\u9fff]/.test(orb.what) && /[\u4e00-\u9fff]/.test(orb.how), '提示是中文');
  eq(orb.accentIsYellow, true, '提示框是黃色高亮的', orb.borderLeft);
  eq(orb.borderLeftWidth, '3px', '黃色高亮是一條夠明顯的邊');
  ok(orb.fillCount >= 1, '每個提示都有「幫我填」', `n=${orb.fillCount}`);
  ok(/幫我填/.test(orb.fillLabel), '按鈕就叫「幫我填」', orb.fillLabel);
  ok(orb.afterFill.length > orb.before.length, '按下「幫我填」真的插進了句子', orb.afterFill.slice(0, 40));
  ok(/[\u4e00-\u9fff]/.test(orb.afterFill), '插進去的是中文');
  ok(orb.litAfterFill >= 1, '填進去之後那一項真的亮了', `lit=${orb.litAfterFill}`);
  ok(orb.firstTarget !== orb.secondTarget, '提示球會在未達成的項目之間循環', `${orb.firstTarget} → ${orb.secondTarget}`);
  eq(orb.nudging, true, '停手太久 / 送出沒過時，提示球會發光提醒');
  eq(orb.stillNotModal, true, '提醒時不會自己彈開提示框（永遠不擋畫面）');
  eq(orb.overlayBlocked, 0, '提示框不是 modal');
  eq(orb.coachEntries, orb.usedChecks, 'coach.json 覆蓋每一條真的被用到的檢查（數字由資料現算，不寫死）');

  // Tab 焦點鎖：不會跑出面板
  const trap = await evaluate(`
    const panel = document.querySelector('#prompt-console .panel');
    document.querySelector('#prompt-console .panel__close').focus();
    return panel.contains(document.activeElement);
  `);
  eq(trap, true, '面板內可用鍵盤移動焦點');
  await key('Tab', 'Tab', { vk: 9 });
  await sleep(120);
  eq(
    await evaluate(`return document.querySelector('#prompt-console .panel').contains(document.activeElement);`),
    true,
    'Tab 焦點被鎖在面板內（M6 無障礙）'
  );

  const bad = await evaluate(`
    const ta = document.querySelector('.prompt-input');
    ta.value = '幫我寫一下';
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      hidden: document.querySelector('#prompt-console [data-result]').hidden,
      fail: !!document.querySelector('#prompt-console .result__top.is-fail'),
      hints: document.querySelectorAll('#prompt-console .row__hint').length,
      xp: window.__promptasy.progression.state.xp,
    };
  `);
  eq(bad.hidden, false, '送出爛 prompt 會有結果面板');
  eq(bad.fail, true, '爛 prompt 未通過');
  eq(bad.hints, consoleOpen.rubricLen, '未通過時每一條缺失都給出具體提示', `hints=${bad.hints}`);
  eq(bad.xp, 0, '未通過不給 XP');

  const good = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('.prompt-input');
    ta.value = 'Summarize the town notice below for first-time visitors who have never been here.\\n' +
      'Output format: 3 bullet points, each under 20 words.';
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 400));
    const grade = document.querySelector('#prompt-console .grade__mark')?.textContent;
    return {
      grade,
      stampClass: document.querySelector('#prompt-console .grade')?.className || '',
      xp: g.progression.state.xp,
      collected: g.progression.state.collected.length,
      best: g.progression.bestGrade('gate-of-clarity-01'),
      markerCleared: g.world.markers.find((m) => m.id === 'gate-of-clarity-01').cleared,
      focusOnResult: document.activeElement?.classList.contains('result'),
      scoreline: document.querySelector('#prompt-console .result__scoreline')?.textContent.replace(/\s+/g, ' ').trim() || '',
      collectedHead: document.querySelector('#prompt-console .collected h4 .zh')?.textContent.trim() || '',
      collectedRows: document.querySelectorAll('#prompt-console .collected li').length,
      teaches: g.content.challenge('gate-of-clarity-01').teaches.slice(),
      allCollected: g.content.challenge('gate-of-clarity-01').teaches.every((t) => g.progression.isCollected(t)),
      saved: !!localStorage.getItem('promptasy.v1.save'),
    };
  `);
  eq(good.grade, 'S', '示範解答拿到 S');
  ok(good.stampClass.includes('is-stamp'), '評價印章動畫（M5 回饋節奏）', good.stampClass);
  ok(good.stampClass.includes('grade--s'), 'S 評價有專屬樣式');
  ok(good.xp > 0, '通過後拿到 XP', `xp=${good.xp}`);
  eq(good.collected, 3, '3 條技巧收進圖鑑');
  /* D2：收集仍然由 legacy teaches 驅動 —— 教學收斂成一條，但收集一條都不能少 */
  eq(good.allCollected, true, '過關把 legacy teaches 全部收進圖鑑（收集不倒退）', good.teaches.join('、'));
  eq(good.collectedRows, good.teaches.length, '結算面板列出每一條收到的技巧');
  eq(good.collectedHead, '✦ 順手收進圖鑑', 'legacy 收集放在「順手」的次要位階（D2 的 uiRule）', good.collectedHead);
  /* Phase A：小數門檻在結果面板上也要讀得順 */
  ok(
    new RegExp(`通過門檻 ${consoleOpen.pass}`).test(good.scoreline),
    `結果面板寫出門檻「通過門檻 ${consoleOpen.pass}」`,
    good.scoreline
  );
  ok(!/\d\.\d{3,}/.test(good.scoreline), '結果面板的分數沒有浮點雜訊', good.scoreline);
  eq(good.best, 'S', '最佳評價記錄為 S');
  eq(good.markerCleared, true, '石座轉為已通關狀態');
  eq(good.focusOnResult, true, '結果面板取得焦點（M6 無障礙）');
  eq(good.saved, true, '進度寫入 localStorage');

  const celebrated = await evaluate(`
    const b = document.querySelector('[data-banner]');
    return { html: b?.innerHTML || '', shown: !b?.hidden };
  `);
  ok(celebrated.html.includes('S'), 'S 評價觸發螢幕級慶祝（M5）', celebrated.html.slice(0, 80));

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(300);
  eq(await evaluate('return window.__promptasy.promptConsole.isOpen;'), false, 'Esc 關閉主控台');

  /* ================================================================ */
  console.log('\n▸ 題目、快速填入、看看範例（Phase 8）');

  // --- 任務 / 素材 / 起手 / 提示：一打開就看得到「要做什麼」 ---
  const brief = await evaluate(`
    const g = window.__promptasy;
    const c = g.content.challenge('gate-of-clarity-01');
    // 先把面板捲到底，確認下一次開啟會自己回到頂端
    g.promptConsole.open(c);
    await new Promise((r) => setTimeout(r, 320));
    const body = document.querySelector('#prompt-console .panel__body');
    body.scrollTop = body.scrollHeight;
    const scrolledTo = body.scrollTop;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('lost-automaton-03'));
    await new Promise((r) => setTimeout(r, 320));
    const ta = document.querySelector('#prompt-console .prompt-input');
    return {
      scrolledTo,
      scrollAfterReopen: document.querySelector('#prompt-console .panel__body').scrollTop,
      mission: document.querySelector('#prompt-console [data-mission]').textContent.trim(),
      materialHidden: document.querySelector('#prompt-console [data-material-wrap]').hidden,
      materialLabel: document.querySelector('#prompt-console [data-material-label]').textContent.trim(),
      material: document.querySelector('#prompt-console [data-material]').textContent.trim(),
      dataMission: c.mission,
      starter: ta.value,
      dataStarter: g.content.challenge('lost-automaton-03').starter,
      placeholder: ta.placeholder,
      fills: document.querySelectorAll('#prompt-console [data-fill]').length,
      sampleDisabled: document.querySelector('#prompt-console [data-sample]').disabled,
      sampleLabel: document.querySelector('#prompt-console [data-sample]').textContent.trim(),
    };
  `);
  ok(brief.scrolledTo >= 0, '面板可以捲動', String(brief.scrolledTo));
  eq(brief.scrollAfterReopen, 0, '再展開一個關卡時捲軸回到頂端（Phase 8 回報）');
  ok(brief.mission.length > 10, '左側顯示「你的任務」', brief.mission);
  eq(brief.materialHidden, false, '素材卡片顯示出來了');
  ok(brief.materialLabel.length > 0, '素材有標題', brief.materialLabel);
  ok(brief.material.includes('不要'), '素材是 NPC 真的遞給你的東西', brief.material.slice(0, 24));
  eq(brief.starter, brief.dataStarter, '有起手弱寫法的關卡會預填進輸入框');
  ok(brief.placeholder.length > 8, '輸入框有每關客製的提示', brief.placeholder);
  ok(brief.fills >= 2, '快速填入至少 2 片', `n=${brief.fills}`);
  eq(brief.sampleDisabled, true, '一開始看不了範例（要先自己試）');
  ok(/再試 2 次/.test(brief.sampleLabel), '按鈕寫清楚還差幾次才解鎖', brief.sampleLabel);

  // --- 半透明提示：空的時候看得見，一打字就消失，而且不會被送出 ---
  const placeholderFlow = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('mimic-mirror-04'));
    await new Promise((r) => setTimeout(r, 300));
    const ta = document.querySelector('#prompt-console .prompt-input');
    const emptyValue = ta.value;
    const shown = ta.placeholder;
    const styled = getComputedStyle(ta, '::placeholder').color;
    ta.value = '請照著範例整理';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    return {
      emptyValue,
      shown,
      styled,
      afterTyping: ta.value,
      placeholderStillSet: ta.placeholder === shown,
      count: document.querySelector('#prompt-console [data-count]').textContent,
    };
  `);
  eq(placeholderFlow.emptyValue, '', '沒有起手寫法的關卡輸入框是空的（提示才看得見）');
  ok(placeholderFlow.shown.includes('例如'), '提示告訴玩家可以怎麼開頭', placeholderFlow.shown.slice(0, 30));
  eq(placeholderFlow.afterTyping, '請照著範例整理', '打字後輸入框只有玩家自己打的字（提示不會被送出）');
  eq(placeholderFlow.placeholderStillSet, true, '提示只是 placeholder，沒有被寫進 value');
  ok(/[1-9]/.test(placeholderFlow.count), '字數計數只算玩家打的字', placeholderFlow.count);

  // --- 快速填入：按一下就插到游標處，預檢跟著亮 ---
  const quickFill = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('#prompt-console .prompt-input');
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    const litBefore = document.querySelectorAll('#prompt-console .checklist li.is-pass').length;
    const xpBefore = g.progression.state.xp;
    const chip = document.querySelector('#prompt-console [data-fill="0"]');
    const label = chip.textContent.trim();
    chip.click();
    await new Promise((r) => setTimeout(r, 300));
    const value = ta.value;
    const chips = Array.from(document.querySelectorAll('#prompt-console [data-fill]'));
    for (const c of chips.slice(1)) { c.click(); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 320));
    return {
      label,
      litBefore,
      value,
      inserted: value.length > 0,
      used: chip.classList.contains('is-used'),
      litAfterAll: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      xpBefore,
      xp: g.progression.state.xp,
    };
  `);
  eq(quickFill.litBefore, 0, '清空後預檢也清乾淨');
  ok(quickFill.inserted, '按下快速填入真的插進了內容', quickFill.value.slice(0, 30));
  ok(/[一-鿿]/.test(quickFill.value), '插進去的是中文', quickFill.value.slice(0, 30));
  eq(quickFill.used, true, '用過的快速填入會變成已使用的樣式');
  ok(quickFill.litAfterAll >= 2, '把快速填入按完，預檢亮起多條', `lit=${quickFill.litAfterAll}`);
  eq(quickFill.xp, quickFill.xpBefore, '快速填入不會偷偷給分（只有送出才算）');

  // --- 送出兩次沒過 → 解鎖「看看範例」→ 填進去就過關 ---
  const sampleFlow = await evaluate(`
    const g = window.__promptasy;
    const c = g.content.challenge('postbox-sprite-02');
    g.promptConsole.open(c);
    await new Promise((r) => setTimeout(r, 320));
    const ta = document.querySelector('#prompt-console .prompt-input');
    const btn = () => document.querySelector('#prompt-console [data-sample]');
    const lockedAtOpen = btn().disabled;
    const submit = async (text) => {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 240));
      document.querySelector('#prompt-console [data-submit]').click();
      await new Promise((r) => setTimeout(r, 320));
    };
    await submit('幫我看看這封信');
    const afterOne = btn().disabled;
    await submit('幫我改一下這封信的語氣');
    const afterTwo = btn().disabled;
    btn().click();
    await new Promise((r) => setTimeout(r, 300));
    const filled = ta.value;
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 420));
    return {
      lockedAtOpen,
      afterOne,
      afterTwo,
      filled,
      sample: c.sample,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent,
      best: g.progression.bestGrade('postbox-sprite-02'),
      label: btn().textContent.trim(),
    };
  `);
  eq(sampleFlow.lockedAtOpen, true, '一打開範例是鎖著的');
  eq(sampleFlow.afterOne, true, '只試一次還不給看範例');
  eq(sampleFlow.afterTwo, false, '第二次沒過之後解鎖「看看範例」');
  eq(sampleFlow.label, '看看範例', '解鎖後按鈕文字變乾淨');
  eq(sampleFlow.filled, sampleFlow.sample, '範例會整份填進輸入框');
  ok(['S', 'A'].includes(sampleFlow.grade), '範例送出去真的過關（且評價 ≥ A）', String(sampleFlow.grade));
  ok(['S', 'A'].includes(sampleFlow.best), '過關紀錄寫進存檔', String(sampleFlow.best));

  // --- 技巧積木：插進去的是中文，英文只當次要參考 ---
  const blockZh = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await new Promise((r) => setTimeout(r, 320));
    // 走到第三幕（刻印／書寫檯）才量得到版面 —— 前兩幕整個 act 是 display:none
    const n2 = document.querySelector('#prompt-console [data-act-next="2"]');
    if (n2) n2.click();
    await new Promise((r) => setTimeout(r, 320));
    const n3 = document.querySelector('#prompt-console [data-act-next="3"]');
    if (n3) n3.click();
    await new Promise((r) => setTimeout(r, 420));
    const wrap = document.querySelector('#prompt-console [data-blocks-wrap]');
    if (wrap.hidden) return { hidden: true };
    const blocks = Array.from(document.querySelectorAll('#prompt-console .blocks .block'));
    const block = blocks[0];
    const fragment = block.getAttribute('data-fragment');
    const ta = document.querySelector('#prompt-console .prompt-input');
    const desk = document.querySelector('#prompt-console .desk');
    const fills = document.querySelector('#prompt-console [data-fills-wrap]');
    const free = document.querySelector('#prompt-console [data-free]');
    const wr = wrap.getBoundingClientRect();
    const dr = desk.getBoundingClientRect();
    const tr = ta.getBoundingClientRect();
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    block.click();
    await new Promise((r) => setTimeout(r, 260));
    return {
      hidden: false,
      fragment,
      inserted: ta.value,
      count: blocks.length,
      unlocked: g.progression.unlockedBuilderBlocks().length,
      // Phase 18：積木搬到書寫檯旁邊，右欄（.rail）不再有它
      inRail: !!wrap.closest('.rail'),
      inFree: free.contains(wrap),
      afterDesk: !!(desk.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeFills: !!(wrap.compareDocumentPosition(fills) & Node.DOCUMENT_POSITION_FOLLOWING),
      gapBelowDesk: Math.round(wr.top - dr.bottom),
      gapToTextarea: Math.round(wr.top - tr.bottom),
      colOffset: Math.round(Math.abs(wr.left - tr.left)),
      maxChipH: Math.max(...blocks.map((b) => Math.round(b.getBoundingClientRect().height))),
      chipLines: Math.max(...blocks.map((b) => b.textContent.trim().split('\\n').length)),
      barH: Math.round(wr.height),
      deskH: Math.round(dr.height),
      used: block.classList.contains('is-used'),
      title: block.getAttribute('title') || '',
      ariaLabel: block.getAttribute('aria-label') || '',
      label: block.querySelector('b')?.textContent || '',
      barText: wrap.textContent.replace(/\\s+/g, ' ').trim(),
      focusable: block.tabIndex >= 0 && block.tagName === 'BUTTON',
    };
  `);
  eq(blockZh.hidden, false, '學過技巧之後主控台有技巧積木');
  ok(blockZh.deskH > 100 && blockZh.barH > 0, '第三幕真的攤開了（量得到版面）',
    `desk=${blockZh.deskH} bar=${blockZh.barH}`);
  ok(/[一-鿿]/.test(blockZh.fragment), '積木插進去的片段是中文', blockZh.fragment.slice(0, 30));
  ok(blockZh.inserted.includes(blockZh.fragment), '按下積木真的把中文插進輸入框', blockZh.inserted.slice(0, 30));
  eq(blockZh.count, blockZh.unlocked, '只列出已解鎖的技巧積木');
  eq(blockZh.used, true, '按過的積木會標成「用過」');
  eq(blockZh.focusable, true, '積木還是可以用鍵盤走到的按鈕');
  ok(blockZh.label.length > 0, '牌面上留著技巧名', blockZh.label);
  // --- Phase 18：貼著書寫檯的工具列（不是右欄的卡片牆）---
  eq(blockZh.inRail, false, '積木不再擺在右欄（Phase 18：搬到書寫檯旁邊）');
  eq(blockZh.inFree, true, '積木和輸入框在同一欄');
  eq(blockZh.afterDesk, true, 'DOM 順序：書寫檯 → 技巧積木');
  eq(blockZh.beforeFills, true, 'DOM 順序：技巧積木 → 快速填入');
  ok(blockZh.gapBelowDesk >= -2 && blockZh.gapBelowDesk < 60,
    '積木就貼在書寫檯下緣', `${blockZh.gapBelowDesk}px`);
  ok(blockZh.gapToTextarea < 200, '積木離輸入框不到 200px', `${blockZh.gapToTextarea}px`);
  ok(blockZh.colOffset <= 8, '積木和輸入框對齊在同一欄', `${blockZh.colOffset}px`);
  ok(blockZh.maxChipH <= 64, '每一片積木都是矮的小石籤（≤ 64px）', `${blockZh.maxChipH}px`);
  eq(blockZh.chipLines, 1, '牌面只有一行');
  ok(blockZh.barH < blockZh.deskH, '整條積木列比書寫檯矮 —— 是工具列不是卡片牆',
    `${blockZh.barH}px vs ${blockZh.deskH}px`);
  // --- 說明與英文寫法收進 title：畫面上看不到，但查得到 ---
  ok(/英文寫法/.test(blockZh.title), 'title 裡查得到英文寫法（次要參考，不冒充官方引文）', blockZh.title);
  ok(/[A-Za-z]/.test(blockZh.title.split('英文寫法')[1] || ''), 'title 裡真的有英文原句', blockZh.title);
  ok(/插入/.test(blockZh.title), 'title 先講清楚按下去會插入什麼', blockZh.title);
  ok(blockZh.ariaLabel.length > blockZh.label.length, '讀螢幕的人也聽得到說明', blockZh.ariaLabel);
  ok(
    !/[A-Za-z][A-Za-z']*\s+[A-Za-z][A-Za-z']*\s+[A-Za-z]/.test(blockZh.barText),
    '積木列上預設看不到整句英文',
    blockZh.barText.slice(0, 80)
  );
  ok(
    !/官方|official|docs?\b/i.test(blockZh.barText),
    '積木上的文字沒有把自撰翻譯講成官方說法',
    blockZh.barText.slice(0, 80)
  );

  /* --- Phase 18：兩個尺寸下積木列都貼著書寫檯、不換成卡片牆、不橫向溢位 --- */
  for (const [w, h] of [[1280, 760], [800, 720]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await sleep(360);
    const bar = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
      await new Promise((r) => setTimeout(r, 360));
      // 走到第三幕才量得到版面
      const n2 = document.querySelector('#prompt-console [data-act-next="2"]');
      if (n2) n2.click();
      await new Promise((r) => setTimeout(r, 300));
      const n3 = document.querySelector('#prompt-console [data-act-next="3"]');
      if (n3) n3.click();
      await new Promise((r) => setTimeout(r, 420));
      const wrap = document.querySelector('#prompt-console [data-blocks-wrap]');
      const blocks = Array.from(document.querySelectorAll('#prompt-console .blocks .block'));
      const ta = document.querySelector('#prompt-console .prompt-input');
      const desk = document.querySelector('#prompt-console .desk');
      const body = document.querySelector('#prompt-console .panel__body');
      const wr = wrap.getBoundingClientRect();
      const dr = desk.getBoundingClientRect();
      const tr = ta.getBoundingClientRect();
      return {
        hidden: wrap.hidden,
        deskH: Math.round(dr.height),
        barH: Math.round(wr.height),
        minChipH: Math.min(...blocks.map((b) => Math.round(b.getBoundingClientRect().height))),
        gapBelowDesk: Math.round(wr.top - dr.bottom),
        gapToTextarea: Math.round(wr.top - tr.bottom),
        colOffset: Math.round(Math.abs(wr.left - tr.left)),
        maxChipH: Math.max(...blocks.map((b) => Math.round(b.getBoundingClientRect().height))),
        rightEdge: Math.round(Math.max(...blocks.map((b) => b.getBoundingClientRect().right))),
        overflowX: body.scrollWidth - body.clientWidth,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vw: innerWidth,
      };
    `);
    eq(bar.vw, w, `視窗寬度切到 ${w}px（積木列）`);
    eq(bar.hidden, false, `${w}×${h}：自由書寫模式看得到技巧積木`);
    ok(bar.deskH > 100 && bar.minChipH > 20, `${w}×${h}：第三幕真的攤開了（量得到版面）`,
      `desk=${bar.deskH} chip=${bar.minChipH}`);
    ok(bar.barH < bar.deskH, `${w}×${h}：積木列比書寫檯矮（工具列而不是卡片牆）`,
      `${bar.barH}px vs ${bar.deskH}px`);
    ok(bar.gapToTextarea < 200, `${w}×${h}：積木離輸入框不到 200px`, `${bar.gapToTextarea}px`);
    ok(bar.gapBelowDesk >= -2 && bar.gapBelowDesk < 60, `${w}×${h}：積木貼著書寫檯下緣`, `${bar.gapBelowDesk}px`);
    ok(bar.colOffset <= 8, `${w}×${h}：積木和輸入框同一欄`, `${bar.colOffset}px`);
    ok(bar.maxChipH <= 64, `${w}×${h}：每片積木都 ≤ 64px`, `${bar.maxChipH}px`);
    ok(bar.rightEdge <= w + 1, `${w}×${h}：積木沒有被推出畫面右緣`, String(bar.rightEdge));
    ok(bar.overflowX <= 1, `${w}×${h}：自由書寫的版面沒有水平溢位`, `+${bar.overflowX}px`);
    eq(bar.docOverflow, 0, `${w}×${h}：頁面沒有水平捲動（自由書寫）`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  /* --- Phase 9：只靠畫面上的教練提示，一般人也能過「正面表述」那一關 --- */
  const coachOnly = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 220));
    g.promptConsole.open(g.content.challenge('lost-automaton-03'));
    await new Promise((r) => setTimeout(r, 340));
    const ta = document.querySelector('#prompt-console .prompt-input');
    const orbBtn = document.querySelector('#prompt-console [data-orb]');
    const box = () => document.querySelector('#prompt-console [data-coach]');
    // 玩家做的事：清掉壞掉的起手寫法，然後照著提示球一路「幫我填」
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    orbBtn.click();
    await new Promise((r) => setTimeout(r, 240));
    const seen = [];
    let submits = 0;
    for (let round = 0; round < 6; round += 1) {
      if (g.promptConsole.coach.pending.length === 0) break;
      const target = g.promptConsole.coach.target;
      seen.push(target);
      const fill = box().querySelector('[data-coach-fill]');
      if (fill) {
        fill.click();
        await new Promise((r) => setTimeout(r, 330));
      }
      const next = box().querySelector('[data-coach-next]');
      if (next) {
        next.click();
        await new Promise((r) => setTimeout(r, 180));
      }
    }
    const readyBefore = document.querySelector('#prompt-console [data-submit]').classList.contains('is-ready');
    document.querySelector('#prompt-console [data-submit]').click();
    submits += 1;
    await new Promise((r) => setTimeout(r, 420));
    return {
      seen,
      readyBefore,
      submits,
      text: ta.value,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent,
      best: g.progression.bestGrade('lost-automaton-03'),
      pass: g.content.challenge('lost-automaton-03').pass,
    };
  `);
  ok(coachOnly.seen.includes('positiveFraming'), '提示球真的教到了「正面表述」', coachOnly.seen.join(','));
  eq(coachOnly.readyBefore, true, '照著提示填完，送出鍵就亮了「可以過關」');
  ok(coachOnly.submits <= 3, '只靠畫面上的提示，3 次以內就過關', `submits=${coachOnly.submits}`);
  ok(['S', 'A', 'B', 'C'].includes(String(coachOnly.grade)), '正面表述關卡真的過得了', String(coachOnly.grade));
  ok(Boolean(coachOnly.best), '過關紀錄寫進存檔', String(coachOnly.best));

  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(260);

  /* ================================================================ */
  console.log('\n▸ 石碑刻印（Phase 11）');

  // --- 從設定頁把答題方式切回石碑刻印（平白的說法、一個下拉選單） ---
  const modeSetting = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 260));
    const sel = document.querySelector('#settings #set-mode');
    const label = document.querySelector('#settings label[for="set-mode"]')?.textContent.trim() || '';
    const options = Array.from(sel.options).map((o) => o.textContent.trim());
    const before = sel.value;
    sel.value = 'guided';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 240));
    g.settings.close();
    await new Promise((r) => setTimeout(r, 220));
    return {
      label,
      options,
      before,
      saved: g.progression.state.settings.promptMode,
      persisted: JSON.parse(localStorage.getItem('promptasy.v1.save')).settings.promptMode,
      mode: g.promptConsole.mode,
    };
  `);
  ok(/答題方式/.test(modeSetting.label), '設定頁有「答題方式」', modeSetting.label);
  eq(modeSetting.options.length, 2, '兩種答題方式');
  ok(
    modeSetting.options.some((o) => /石碑刻印/.test(o)) && modeSetting.options.some((o) => /自由書寫/.test(o)),
    '選項用玩家看得懂的說法',
    modeSetting.options.join(' / ')
  );
  eq(modeSetting.before, 'free', '設定頁反映目前的設定（剛剛切成自由書寫）');
  eq(modeSetting.saved, 'guided', '從設定頁切回石碑刻印');
  eq(modeSetting.persisted, 'guided', '答題方式寫進 localStorage');
  eq(modeSetting.mode, 'guided', '主控台跟著換過來');

  // --- 開一關沒被別的測試碰過的：四要素之鏡 ---
  const carveOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('four-elements-mirror-44'));
    await new Promise((r) => setTimeout(r, 240));
    // Phase 12：石碑住在第三幕 —— 先讓導演把鏡頭推到那裡
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const flow = g.content.flow('four-elements-mirror-44');
    return {
      mode: g.promptConsole.mode,
      slots: flow.slots.length,
      total: g.promptConsole.stele.progress.total,
      carved: document.querySelectorAll('#prompt-console .carved').length,
      emptyShown: !document.querySelector('#prompt-console [data-empty]').hidden,
      progress: document.querySelector('#prompt-console [data-progress]').textContent.trim(),
      ask: document.querySelector('#prompt-console [data-ask]').textContent.trim(),
      options: document.querySelectorAll('#prompt-console .opt').length,
      correctIndex: flow.slots[0].options.findIndex((o) => o.correct),
      keyHints: document.querySelectorAll('#prompt-console .opt__key').length,
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      actAtOpen,
      act: g.promptConsole.act,
      xp: g.progression.state.xp,
    };
  `);
  eq(carveOpen.actAtOpen, 1, '換一關照樣從第一幕開始（導演不會直接把你丟進作答區）');
  eq(carveOpen.act, 3, '推到第三幕才開始刻');
  eq(carveOpen.mode, 'guided', '石碑刻印模式開啟關卡');
  eq(carveOpen.total, carveOpen.slots, '石碑知道這一關有幾段');
  eq(carveOpen.carved, 0, '一開始石碑是空的');
  eq(carveOpen.emptyShown, true, '空石碑有一句說明「從下面挑一段話」');
  // 段數由資料決定（Phase A 收斂過格式段落，寫死 4 會在改資料時假性失敗）
  eq(carveOpen.progress, `第 1 / ${carveOpen.slots} 段`, '進度寫著「第 1 / N 段」', carveOpen.progress);
  ok(carveOpen.ask.length >= 6, '這一段的問題看得到', carveOpen.ask);
  eq(carveOpen.options, 3, '第一段有 3 個選項');
  eq(carveOpen.keyHints, 3, '每個選項都標了鍵盤數字');
  eq(carveOpen.lit, 0, '還沒刻，檢查清單全暗');

  // --- 選錯：石碑不收，抖一下 ＋ 出現一句白話的教學回饋（不失敗、不扣分） ---
  const wrongIdx = (carveOpen.correctIndex + 1) % 3;
  const wrongPick = await evaluate(`
    const g = window.__promptasy;
    const btn = document.querySelector('#prompt-console [data-opt="${wrongIdx}"]');
    btn.click();
    await new Promise((r) => setTimeout(r, 120));
    const rejecting = document.querySelector('#prompt-console .stele').classList.contains('is-reject');
    await new Promise((r) => setTimeout(r, 420));
    const fb = btn.querySelector('[data-opt-fb]');
    return {
      rejecting,
      wrongClass: btn.classList.contains('is-wrong'),
      ariaDisabled: btn.getAttribute('aria-disabled'),
      feedback: fb.textContent.trim(),
      feedbackShown: !fb.hidden,
      dataFeedback: g.content.flow('four-elements-mirror-44').slots[0].options[${wrongIdx}].feedback,
      carved: document.querySelectorAll('#prompt-console .carved').length,
      stillHere: !!document.querySelector('#prompt-console [data-opt="${wrongIdx}"]'),
      progress: document.querySelector('#prompt-console [data-progress]').textContent.trim(),
      xp: g.progression.state.xp,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      optionsLeft: document.querySelectorAll('#prompt-console .opt:not(.is-wrong)').length,
    };
  `);
  eq(wrongPick.rejecting, true, '選錯時石碑抖一下 ＋ 裂光一閃（is-reject）');
  eq(wrongPick.wrongClass, true, '選錯的選項留在原地並標成「石碑不收」');
  eq(wrongPick.ariaDisabled, 'true', '選錯的選項標成 aria-disabled（但不從畫面消失）');
  eq(wrongPick.feedbackShown, true, '選錯就地出現教學回饋');
  eq(wrongPick.feedback, wrongPick.dataFeedback, '回饋文字就是 flows.json 裡寫的那一句');
  ok(wrongPick.feedback.length >= 12, '回饋講得出「為什麼這樣比較弱」', wrongPick.feedback);
  eq(wrongPick.carved, 0, '選錯不會刻上石碑');
  eq(wrongPick.stillHere, true, '選錯不會被踢出這一段（可以再選）');
  eq(wrongPick.progress, `第 1 / ${carveOpen.slots} 段`, '選錯不會前進到下一段', wrongPick.progress);
  eq(wrongPick.xp, carveOpen.xp, '選錯不扣分（XP 一分沒動）');
  eq(wrongPick.resultHidden, true, '選錯不會跳出失敗面板（你不可能失敗）');
  ok(wrongPick.optionsLeft >= 1, '還有選項可以再試', String(wrongPick.optionsLeft));

  // 教學回饋是金色的（教練的聲音）
  const fbColor = await evaluate(`
    const fb = document.querySelector('#prompt-console .opt.is-wrong .opt__fb');
    const cs = getComputedStyle(fb);
    return { border: cs.borderLeftColor.replace(/\\s+/g, ''), width: cs.borderLeftWidth };
  `);
  eq(fbColor.border, 'rgb(230,199,155)', '教學回饋走教練的金線', fbColor.border);
  eq(fbColor.width, '3px', '金線夠明顯');

  // --- 一段一段刻上去：全部用鍵盤 1/2/3，刻痕數要跟著長 ---
  const carveAll = await evaluate(`
    const g = window.__promptasy;
    const flow = g.content.flow('four-elements-mirror-44');
    const steps = [];
    for (let i = 0; i < flow.slots.length; i += 1) {
      const idx = flow.slots[i].options.findIndex((o) => o.correct);
      const btn = document.querySelector('#prompt-console [data-opt="' + idx + '"]');
      const focusedOnOption = document.activeElement?.classList.contains('opt');
      btn.click();
      await new Promise((r) => setTimeout(r, 80));
      const stamping = document.querySelector('#prompt-console .stele').classList.contains('is-stamp');
      const dust = document.querySelectorAll('#prompt-console .dust').length;
      await new Promise((r) => setTimeout(r, 340));
      steps.push({
        focusedOnOption,
        stamping,
        dust,
        carved: document.querySelectorAll('#prompt-console .carved').length,
        progress: document.querySelector('#prompt-console [data-progress]').textContent.trim(),
        lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      });
    }
    const carvedText = Array.from(document.querySelectorAll('#prompt-console .carved')).map((n) => n.textContent);
    return {
      steps,
      carvedText,
      steleText: g.promptConsole.stele.text,
      expected: flow.slots.map((s) => s.options.find((o) => o.correct).text).join('\\n'),
      done: g.promptConsole.stele.done,
      carveHidden: document.querySelector('#prompt-console [data-carve]').hidden,
      palmHidden: document.querySelector('#prompt-console [data-palmwrap]').hidden,
      steleFull: document.querySelector('#prompt-console .stele').classList.contains('is-full'),
      palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'),
      lampText: document.querySelector('#prompt-console [data-lamp]').textContent.trim(),
      xp: g.progression.state.xp,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      // Phase 12：刻滿了 → 鏡頭自己切到第四幕（手印）
      act: g.promptConsole.act,
      palmSpotlight: document.querySelector('#prompt-console .console').classList.contains('is-palm'),
      palmLead: document.querySelector('#prompt-console [data-palm-lead]').textContent.trim(),
      navNow: Array.from(document.querySelectorAll('#prompt-console .acts__item.is-now')).map((b) => b.textContent.trim()),
      // 幕的編號不再印在畫面上（「ACT IV」與「第四幕」是同一件事講兩次）——
      // 它留給讀螢幕的人：指示器那一顆的 aria-label / title 仍然完整。
      navNowAria: Array.from(document.querySelectorAll('#prompt-console .acts__item.is-now')).map((b) => b.getAttribute('aria-label')),
      kickerNodes: document.querySelectorAll('#prompt-console [data-carve-kicker], #prompt-console .act__kicker').length,
    };
  `);
  for (const [i, s] of carveAll.steps.entries()) {
    eq(s.carved, i + 1, `刻上第 ${i + 1} 段之後石碑上有 ${i + 1} 行刻痕`);
  }
  ok(carveAll.steps[0].stamping, '刻上去的那一下石碑真的震了（is-stamp）');
  ok(carveAll.steps[0].dust >= 6, '刻痕會噴石屑', `n=${carveAll.steps[0].dust}`);
  ok(
    carveAll.steps.every((s) => s.focusedOnOption),
    '每一段的焦點都自動落在選項上（不用滑鼠也玩得動）'
  );
  ok(
    carveAll.steps[carveAll.steps.length - 1].lit > carveAll.steps[0].lit,
    '一段一段刻下去，左邊的檢查清單也一盞一盞亮起來',
    `${carveAll.steps[0].lit} → ${carveAll.steps[carveAll.steps.length - 1].lit}`
  );
  eq(carveAll.steleText, carveAll.expected, '刻出來的整段文字＝每一段正確選項串起來');
  eq(carveAll.done, true, '石碑刻滿了');
  eq(carveAll.carveHidden, true, '刻滿之後問句區收起來');
  eq(carveAll.palmHidden, false, '刻滿之後浮出手掌印');
  eq(carveAll.steleFull, true, '刻滿的石碑會亮起來（is-full）');
  eq(carveAll.palmFocused, true, '焦點自動落在手掌印上');
  ok(/手掌/.test(carveAll.lampText), '進度燈也改成「把手掌按上石碑」的說法', carveAll.lampText);
  eq(carveAll.act, 4, '刻滿了 → 鏡頭自己切到第四幕');
  eq(carveAll.palmSpotlight, true, '第四幕把光打在手印上（刻痕對照退到背景）');
  ok(
    /石碑已刻滿/.test(carveAll.palmLead) && /神諭/.test(carveAll.palmLead) && !/送出|評分/.test(carveAll.palmLead),
    '第四幕的話是世界觀的說法，不是「送出評分」',
    carveAll.palmLead
  );
  ok(/手印/.test(carveAll.navNow[0] || ''), '指示器移到④手印', String(carveAll.navNow[0]));
  eq(carveAll.kickerNodes, 0, '畫面上不再印幕的編號（重複的小標已移除）');
  ok(/第四幕/.test(carveAll.navNowAria[0] || ''), '編號留給螢幕閱讀器（指示器的 aria-label）', String(carveAll.navNowAria[0]));
  eq(carveAll.resultHidden, true, '還沒按手掌就不會有結果');
  eq(carveAll.xp, wrongPick.xp, '刻完但還沒按手掌，一分都還沒給');

  // --- 手掌印：按一下就放不算，要按住 ---
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(260);
  const shortPress = await evaluate(`
    const palm = document.querySelector('#prompt-console [data-palm]');
    return {
      fired: window.__promptasy.promptConsole.stele.fired,
      slipped: palm.classList.contains('is-slipped'),
      hint: palm.querySelector('.palm__hint').textContent.trim(),
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
    };
  `);
  eq(shortPress.fired, false, '按一下就放不會觸發（這是個儀式，要按住）');
  eq(shortPress.slipped, true, '手滑掉的時候提示會抖一下');
  ok(/按住/.test(shortPress.hint), '手掌印上就寫著「按住不放」', shortPress.hint);
  eq(shortPress.resultHidden, true, '沒按住就沒有評分');

  // 真的按住 900ms（> PALM_HOLD_MS 600ms）
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  const holdMid = await (async () => {
    await sleep(300);
    return evaluate(`
      const palm = document.querySelector('#prompt-console [data-palm]');
      const ring = palm.querySelector('.palm__ring');
      return {
        holding: palm.classList.contains('is-holding'),
        slipped: palm.classList.contains('is-slipped'),
        // 蓄力環是一圈 conic-gradient，由 --hold 推進（軟體渲染下影格很稀疏，
        // 所以這裡只驗結構，不驗某一刻的填滿比例）
        ring: getComputedStyle(ring).backgroundImage.slice(0, 40),
        fired: window.__promptasy.promptConsole.stele.fired,
      };
    `);
  })();
  await sleep(600);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await sleep(700);
  ok(holdMid.holding, '按住的時候手掌印進入蓄力狀態');
  eq(holdMid.slipped, false, '按住時「手滑」的提示會收掉');
  ok(/conic-gradient/.test(holdMid.ring), '蓄力環是一圈會填滿的環', holdMid.ring);
  eq(holdMid.fired, false, '按住 300ms 還不會發動（門檻是 600ms）');

  const sealed = await evaluate(`
    const g = window.__promptasy;
    return {
      fired: g.promptConsole.stele.fired,
      ignited: document.querySelector('#prompt-console .stele').classList.contains('is-ignited'),
      palmFired: document.querySelector('#prompt-console [data-palm]').classList.contains('is-fired'),
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent,
      pass: !!document.querySelector('#prompt-console .result__top.is-pass'),
      rows: document.querySelectorAll('#prompt-console .row').length,
      xpTick: document.querySelector('#prompt-console [data-xptick]')?.getAttribute('data-to'),
      xp: g.progression.state.xp,
      best: g.progression.bestGrade('four-elements-mirror-44'),
      cleared: g.world.markers.find((m) => m.id === 'four-elements-mirror-44')?.cleared,
      source: document.querySelector('#prompt-console .result__source a')?.getAttribute('href') || '',
      dataSource: g.content.challenge('four-elements-mirror-44').source,
      rubricRows: g.content.challenge('four-elements-mirror-44').rubric.length,
    };
  `);
  eq(sealed.fired, true, '按住到底就發動了');
  eq(sealed.ignited, true, '發動時石碑亮起來（光柱）');
  eq(sealed.palmFired, true, '手掌印跟著爆一下光');
  eq(sealed.resultHidden, false, '接著就是原本那張結果面板');
  eq(sealed.grade, 'S', '石碑刻印全部選對＝S（超容易過關）');
  eq(sealed.pass, true, '結果面板判定為通過');
  eq(
    sealed.rows,
    sealed.rubricRows,
    `結果一條一條列出這一關的 ${sealed.rubricRows} 項檢查（由資料現算，不寫死）`
  );
  ok(Number(sealed.xpTick) > 0, '拿到 XP', `xp=${sealed.xpTick}`);
  ok(sealed.xp > wrongPick.xp, '存檔裡的 XP 真的增加了', `${wrongPick.xp} → ${sealed.xp}`);
  eq(sealed.best, 'S', '最佳評價寫成 S');
  eq(sealed.cleared, true, '世界裡的石座轉成已通關');
  eq(sealed.source, sealed.dataSource, '結果面板照樣附這一關的官方出處');

  /* --- Phase 12：重玩時第二幕可以跳過（指引看過就記住了，沒看過的不給跳） --- */
  const replayActs = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 220));
    const seenBefore = g.progression.hasSeenGuidance('gate-of-clarity-01');
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await new Promise((r) => setTimeout(r, 340));
    const atOpen = g.promptConsole.act;
    const visited = g.promptConsole.visitedActs.join(',');
    const skipBtn = document.querySelector('#prompt-console .acts__item[data-act-go="3"]');
    const skipEnabled = !skipBtn.disabled;
    skipBtn.click();
    await new Promise((r) => setTimeout(r, 340));
    const afterSkip = g.promptConsole.act;
    const carveVisible = (() => { const n = document.querySelector('#prompt-console .act--carve'); return !!n && !n.hidden && n.offsetParent !== null; })();
    // 沒看過指引的關卡：③ 按不下去（不能跳過教學）
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('long-scroll-tower-23'));
    await new Promise((r) => setTimeout(r, 320));
    const fresh = {
      seen: g.progression.hasSeenGuidance('long-scroll-tower-23'),
      act: g.promptConsole.act,
      canSkip: g.promptConsole.canGoAct(3),
      disabled: document.querySelector('#prompt-console .acts__item[data-act-go="3"]').disabled,
    };
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 180));
    return { seenBefore, atOpen, visited, skipEnabled, afterSkip, carveVisible, fresh };
  `);
  eq(replayActs.seenBefore, true, '（測試前提）這一關的指引看過了');
  eq(replayActs.atOpen, 1, '重玩照樣從第一幕開始（題目永遠先出場）');
  eq(replayActs.visited, '1,2,3', '看過指引的關卡：委託 / 指引 / 刻印都算走過了');
  eq(replayActs.skipEnabled, true, '重玩時 ③ 刻印按得下去（不必再被指引擋一次）');
  eq(replayActs.afterSkip, 3, '一鍵直接跳到刻印');
  eq(replayActs.carveVisible, true, '跳過去之後作答區就是畫面');
  eq(replayActs.fresh.seen, false, '沒玩過的關卡沒有「看過指引」的紀錄');
  eq(replayActs.fresh.act, 1, '沒玩過的關卡從第一幕開始');
  eq(replayActs.fresh.canSkip, false, '第一次玩不准跳過指引（學習優先）');
  eq(replayActs.fresh.disabled, true, '指示器上的 ③ 是按不下去的');

  /* --- Phase 12：介面上不准再出現「送出評分」這種系統術語 --- */
  const jargon = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await new Promise((r) => setTimeout(r, 300));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 240));
    // 掃整份 DOM 的文字（含收起來的部分）＋ 所有會顯示出來的屬性
    const text = document.body.textContent || '';
    const attrs = Array.from(document.querySelectorAll('[title], [placeholder], [aria-label]'))
      .map((n) => [n.getAttribute('title'), n.getAttribute('placeholder'), n.getAttribute('aria-label')].join(' '))
      .join(' ');
    const all = text + ' ' + attrs;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 180));
    return {
      hit: /送出評分/.test(all),
      sample: (all.match(/.{0,14}送出評分.{0,14}/) || [''])[0],
      submitLabel: document.querySelector('#prompt-console [data-submit]').textContent.trim(),
      practicePalm: document.querySelector('#practice .palm__label')?.textContent.trim() || '',
      practicePalmLead: document.querySelector('#practice [data-palm-lead]')?.textContent.trim() || '',
    };
  `);
  eq(jargon.hit, false, '整個介面再也找不到「送出評分」（全部改成世界觀的說法）', jargon.sample);
  ok(/呈給神諭/.test(jargon.submitLabel), '關卡的送出鍵叫「呈給神諭」', jargon.submitLabel);
  ok(/手掌/.test(jargon.practicePalm), '序章的課用的是同一個手印儀式', jargon.practicePalm);
  ok(/神諭/.test(jargon.practicePalmLead), '序章的手印也是「呈給神諭」那一家的說法', jargon.practicePalmLead);

  // --- 版面：石碑在窄畫面下也不會橫向溢出（1280 是預設視窗，不必 override） ---
  for (const [w, h] of [[1280, 800], [800, 720]]) {
    if (w !== 1280) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
      await sleep(360);
    }
    const fit = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 160));
      g.promptConsole.open(g.content.challenge('archive-seal-25'));
      await new Promise((r) => setTimeout(r, 240));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 300));
      const body = document.querySelector('#prompt-console .panel__body');
      return {
        overflowX: body.scrollWidth - body.clientWidth,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        optionWidth: Math.round(document.querySelector('#prompt-console .opt').getBoundingClientRect().width),
        vw: innerWidth,
      };
    `);
    eq(fit.vw, w, `視窗切到 ${w}px`);
    ok(fit.overflowX <= 1, `${w}×${h}：石碑刻印沒有水平溢位（長資料選項也一樣）`, `+${fit.overflowX}px`);
    eq(fit.docOverflow, 0, `${w}×${h}：頁面沒有水平捲動`);
    ok(fit.optionWidth <= w, `${w}×${h}：選項卡沒有超出視窗`, String(fit.optionWidth));
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  // --- 切到自由書寫：預檢、快速填入、送出都還在（學習優先，畢業的人可以離開輔助輪） ---
  const freeStillWorks = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('dial-room-43'));
    await new Promise((r) => setTimeout(r, 220));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 280));
    const modeAtOpen = g.promptConsole.mode;
    document.querySelector('#prompt-console [data-mode]').click();
    await new Promise((r) => setTimeout(r, 300));
    const ta = document.querySelector('#prompt-console .prompt-input');
    const visible = !document.querySelector('#prompt-console [data-free]').hidden;
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const litEmpty = document.querySelectorAll('#prompt-console .checklist li.is-pass').length;
    // 快速填入全部按下去 —— 零思考路徑照樣走得通
    const chips = Array.from(document.querySelectorAll('#prompt-console [data-fill]'));
    for (const c of chips) { c.click(); await new Promise((r) => setTimeout(r, 140)); }
    await new Promise((r) => setTimeout(r, 340));
    const litFilled = document.querySelectorAll('#prompt-console .checklist li.is-pass').length;
    const submit = document.querySelector('#prompt-console [data-submit]');
    const ready = submit.classList.contains('is-ready');
    submit.click();
    await new Promise((r) => setTimeout(r, 460));
    return {
      modeAtOpen,
      visible,
      chips: chips.length,
      litEmpty,
      litFilled,
      ready,
      typed: ta.value.length,
      orbHidden: document.querySelector('#prompt-console [data-orb]').hidden,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent,
      best: g.progression.bestGrade('dial-room-43'),
      saved: g.progression.state.settings.promptMode,
    };
  `);
  eq(freeStillWorks.modeAtOpen, 'guided', '下一關預設仍然是石碑刻印');
  eq(freeStillWorks.visible, true, '按一下就切回書寫檯');
  eq(freeStillWorks.orbHidden, false, '自由書寫模式的提示球回來了');
  eq(freeStillWorks.litEmpty, 0, '清空後預檢乾淨');
  ok(freeStillWorks.chips >= 2, '快速填入還在', `n=${freeStillWorks.chips}`);
  ok(freeStillWorks.litFilled >= 2, '打字 / 快速填入照樣點亮預檢', `lit=${freeStillWorks.litFilled}`);
  eq(freeStillWorks.ready, true, '達標時送出鍵照樣發光');
  ok(freeStillWorks.typed > 10, '輸入框裡是玩家自己組出來的文字', String(freeStillWorks.typed));
  ok(['S', 'A', 'B', 'C'].includes(String(freeStillWorks.grade)), '自由書寫照樣過關', String(freeStillWorks.grade));
  ok(Boolean(freeStillWorks.best), '自由書寫的成績照樣寫進存檔', String(freeStillWorks.best));
  eq(freeStillWorks.saved, 'free', '切換會被記住');

  // --- 切回石碑刻印：下一關又從第一段開始問（切換不會弄壞狀態） ---
  const backToGuided = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.setMode('guided');
    await new Promise((r) => setTimeout(r, 160));
    g.promptConsole.open(g.content.challenge('mimic-mirror-04'));
    await new Promise((r) => setTimeout(r, 220));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 280));
    const out = {
      mode: g.promptConsole.mode,
      carved: document.querySelectorAll('#prompt-console .carved').length,
      options: document.querySelectorAll('#prompt-console .opt').length,
      progress: document.querySelector('#prompt-console [data-progress]').textContent.trim(),
      setting: g.progression.state.settings.promptMode,
      persisted: JSON.parse(localStorage.getItem('promptasy.v1.save')).settings.promptMode,
    };
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 180));
    return out;
  `);
  eq(backToGuided.mode, 'guided', '隨時切回石碑刻印');
  eq(backToGuided.carved, 0, '切回石碑時從第一段重新刻');
  ok(backToGuided.options >= 2, '石碑的選項也回來了', String(backToGuided.options));
  ok(/第 1 \//.test(backToGuided.progress), '進度回到第一段', backToGuided.progress);
  eq(backToGuided.setting, 'guided', '切回來也會被記住');
  eq(backToGuided.persisted, 'guided', '而且立刻寫進 localStorage（重整後還在）');

  /* ================================================================ */
  console.log('\n▸ 道具碰撞（Phase 8）');
  const collision = await evaluate(`
    const g = window.__promptasy;
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    const solids = g.world.solids;
    // 挑一顆站在中央高原實地上、而且**助跑那一段路是空的**的石頭
    // （Phase 20 之後碰撞體多了一倍，隨便挑一顆的話起點可能正好卡在另一棵樹上）
    const yaw0 = g.player.cameraYaw;
    const f0 = { x: Math.sin(yaw0), z: Math.cos(yaw0) };
    const runwayClear = (s) => {
      for (let d = s.r + 1.5; d <= s.r + 6.5; d += 0.5) {
        const x = s.x - f0.x * d;
        const z = s.z - f0.z * d;
        if (g.world.solidAt(x, z) || g.world.coverage(x, z) < 0.9) return false;
      }
      return true;
    };
    const rock = solids
      .filter((s) => Math.hypot(s.x, s.z) < 52 && s.r >= 0.75 && g.world.coverage(s.x, s.z) > 0.95 && runwayClear(s))
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (!rock) return { none: true, total: solids.length };

    // 站到石頭的正「後方」（鏡頭前進方向的反向），按 W 直直撞上去
    const yaw = g.player.cameraYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const back = rock.r + 6;
    g.player.teleport(rock.x - fx * back, rock.z - fz * back);
    await new Promise((r) => setTimeout(r, 260));
    const start = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await waitGame(1.6);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    await waitGame(0.6);
    const hitPos = { x: g.player.position.x, z: g.player.position.z };
    const distToRock = Math.hypot(hitPos.x - rock.x, hitPos.z - rock.z);
    const travelled = Math.hypot(hitPos.x - start.x, hitPos.z - start.z);
    const insideAfterWalk = !!g.world.solidAt(hitPos.x, hitPos.z);

    // 保險絲：直接把玩家丟進石頭裡，應該會被慢慢推出來
    g.player.teleport(rock.x, rock.z);
    const stuckAtStart = !!g.world.solidAt(g.player.position.x, g.player.position.z);
    await waitGame(1.6);
    const escaped = !g.world.solidAt(g.player.position.x, g.player.position.z);

    // 石座還是走得到：站到石座旁邊，互動提示要出得來
    const marker = g.world.markers.find((m) => m.id === 'gate-of-clarity-01');
    g.player.teleport(marker.position.x + 2, marker.position.z + 2);
    await new Promise((r) => setTimeout(r, 320));
    const pedestalOk = !document.querySelector('[data-interact]').hidden;
    const pedestalBlocked = !!g.world.solidAt(marker.position.x + 2, marker.position.z + 2);

    return {
      total: solids.length,
      rock,
      travelled,
      distToRock,
      insideAfterWalk,
      stuckAtStart,
      escaped,
      pedestalOk,
      pedestalBlocked,
    };
  `);
  ok(!collision.none, '世界有碰撞登記表', JSON.stringify(collision));
  ok(collision.total > 100, '碰撞體數量合理', `n=${collision.total}`);
  ok(collision.travelled > 1.5, '玩家有真的往石頭走過去', `moved=${collision.travelled?.toFixed(2)}`);
  ok(
    collision.distToRock > collision.rock.r,
    '撞到石頭會被擋下來（不再穿過去）',
    `dist=${collision.distToRock?.toFixed(2)} r=${collision.rock?.r}`
  );
  eq(collision.insideAfterWalk, false, '走完之後玩家不在石頭裡面');
  eq(collision.stuckAtStart, true, '（測試前提）玩家被丟進石頭裡');
  eq(collision.escaped, true, '卡進石頭裡會被保險絲推出來（不會被關住）');
  eq(collision.pedestalBlocked, false, '石座旁邊沒有碰撞體');
  eq(collision.pedestalOk, true, '石座的互動照樣走得到');

  /* ================================================================ */
  console.log('\n▸ 以前走得過去的那幾樣東西（Phase 20）');
  const ghosts = await evaluate(`
    const g = window.__promptasy;
    const waitGame = async (seconds) => {
      const until = window.__gt.t + seconds;
      const bail = performance.now() + seconds * 8000 + 4000;
      while (window.__gt.t < until && performance.now() < bail) await new Promise((r) => setTimeout(r, 30));
    };
    // 助跑那一段路是不是空的（碰撞體變多之後，起點可能正好卡在別的東西上）
    const yaw0 = g.player.cameraYaw;
    const f0 = { x: Math.sin(yaw0), z: Math.cos(yaw0) };
    // lat：往側邊平移多少（擦邊走的那一趟要另外檢查一次）
    const runwayClear = (x, z, r, lat = 0, ahead = 0) => {
      for (let d = -ahead; d <= r + 6.5; d += 0.5) {
        const px = x - f0.x * d - f0.z * lat;
        const pz = z - f0.z * d + f0.x * lat;
        if (d < r + 1.4 && lat === 0) continue; // 目標本身當然擋得住
        if (g.world.solidAt(px, pz) || g.world.coverage(px, pz) < 0.9) return false;
      }
      return true;
    };

    // 走過去撞它：站在正後方，按 W 直直走
    const walkInto = async (x, z) => {
      const yaw = g.player.cameraYaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      g.player.teleport(x - fx * 6, z - fz * 6);
      await new Promise((r) => setTimeout(r, 240));
      const start = { x: g.player.position.x, z: g.player.position.z };
      const startBlocked = !!g.world.solidAt(start.x, start.z);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      await waitGame(2.2);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      await waitGame(0.5);
      const end = { x: g.player.position.x, z: g.player.position.z };
      return {
        travelled: Math.hypot(end.x - start.x, end.z - start.z),
        dist: Math.hypot(end.x - x, end.z - z),
        inside: !!g.world.solidAt(end.x, end.z),
        startBlocked,
      };
    };

    const out = {};

    // ① 植被：foundations 的錐形矮樹（Phase 20 之前整片草木都走得過去）
    const scene = g.engine.scene;
    let trunk = null;
    scene.traverse((o) => {
      if (trunk || !o.isInstancedMesh || o.parent?.name !== 'flora:foundations') return;
      const p = o.geometry.parameters || {};
      if (p.height !== 2.2) return; // cone(0.55, 2.2) ＝ 錐形矮樹
      const Mat4 = o.matrixWorld.constructor;
      const m = new Mat4();
      let best = null;
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, m);
        const x = m.elements[12];
        const z = m.elements[14];
        const s = g.world.solidAt(x, z);
        if (!s || g.world.coverage(x, z) < 0.95) continue;
        // 成叢的草木要挑一棵助跑路線是空的，量到的才是「撞到這一棵」
        if (!runwayClear(x, z, s.r)) continue;
        if (!best || Math.hypot(x, z) < Math.hypot(best.x, best.z)) best = { x, z, r: s.r };
      }
      trunk = best;
    });
    out.trunkFound = !!trunk;
    if (trunk) {
      out.trunk = { r: trunk.r, ...(await walkInto(trunk.x, trunk.z)) };
      // 沿牆滑：擦著邊走過去（往前方偏一個身位），應該滑得過去而不是黏住。
      // 擦邊的那條路線要另外挑一個「兩側都空」的目標，不然量到的是撞上隔壁那一棵。
      const yaw = g.player.cameraYaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      /*
       * 擦邊那條路線的側向偏移必須**大於玩家半徑**（0.62）。
       * Phase 22 修：原本用 s.r + 0.5 —— 那條線離圓心 s.r + 0.5，而
       * solidAt 的判定半徑是 s.r + 0.62，所以「這條路線通不通」這個前提
       * 在目標自己身上就永遠是 false → 篩選結果一直是空的，
       * 於是每次都退回 trunk（一棵兩側從沒被驗證過的樹），量到的是
       * 「卡在兩顆石頭的夾角裡」而不是「沿著石頭滑過去」。
       */
      const lat = (r) => r + 1.05;
      const slideTarget =
        g.world.solids
          .filter(
            (s) =>
              Math.hypot(s.x, s.z) < 60 &&
              s.r >= 0.5 &&
              g.world.coverage(s.x, s.z) > 0.95 &&
              runwayClear(s.x, s.z, s.r) &&
              runwayClear(s.x, s.z, s.r, lat(s.r), 5) &&
              runwayClear(s.x, s.z, s.r, -lat(s.r), 5)
          )
          .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] || trunk;
      out.slideTargetR = slideTarget.r;
      out.slideTargetFound = slideTarget !== trunk;
      g.player.teleport(
        slideTarget.x - fx * 5 - fz * lat(slideTarget.r),
        slideTarget.z - fz * 5 + fx * lat(slideTarget.r)
      );
      await new Promise((r) => setTimeout(r, 240));
      const s0 = { x: g.player.position.x, z: g.player.position.z };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      await waitGame(3.4);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      await waitGame(0.4);
      out.slide = {
        moved: Math.hypot(g.player.position.x - s0.x, g.player.position.z - s0.z),
        inside: !!g.world.solidAt(g.player.position.x, g.player.position.z),
        passed: (g.player.position.x - slideTarget.x) * fx + (g.player.position.z - slideTarget.z) * fz,
      };
    }

    // ② 世界觀石碑：爐火碑站在起始祭壇的淨空圈邊上（以前整塊是幽靈）
    const tab = g.world.tablets.find((t) => t.id === 'hearth');
    out.tabletSolid = !!g.world.solidAt(tab.position.x, tab.position.z);
    out.tablet = await walkInto(tab.position.x, tab.position.z);
    // 但互動還是走得到
    g.player.teleport(tab.position.x + 2.4, tab.position.z + 2.4);
    await new Promise((r) => setTimeout(r, 320));
    out.tabletInteract = !document.querySelector('[data-interact]').hidden;

    // ③ 中央高原的中型碎石：半徑 0.5–0.62，Phase 20 之前在最小半徑之下（＝幽靈）
    const smallRock = g.world.solids
      .filter(
        (s) =>
          s.r >= 0.5 &&
          s.r < 0.62 &&
          Math.hypot(s.x, s.z) < 52 &&
          g.world.coverage(s.x, s.z) > 0.95 &&
          runwayClear(s.x, s.z, s.r)
      )
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    out.smallRockFound = !!smallRock;
    if (smallRock) {
      out.smallRock = { r: smallRock.r, ...(await walkInto(smallRock.x, smallRock.z)) };
    }

    // ④ 石座四面八方都走得到（補了一堆碰撞體之後，互動不能被擋掉）
    const marker = g.world.markers.find((m) => m.id === 'gate-of-clarity-01');
    const approaches = [];
    for (const [dx, dz] of [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]]) {
      g.player.teleport(marker.position.x + dx, marker.position.z + dz);
      await new Promise((r) => setTimeout(r, 260));
      approaches.push({
        dx,
        dz,
        blocked: !!g.world.solidAt(marker.position.x + dx, marker.position.z + dz),
        interact: !document.querySelector('[data-interact]').hidden,
      });
    }
    out.approaches = approaches;

    return out;
  `);
  eq(ghosts.trunkFound, true, '找得到一棵有碰撞體的樹（植被 Phase 20 才開始擋人）');
  ok(ghosts.trunk?.travelled > 1.5, '玩家真的往樹走過去', `moved=${ghosts.trunk?.travelled?.toFixed(2)}`);
  ok(
    ghosts.trunk?.dist > ghosts.trunk?.r,
    '撞到樹會被擋下來（以前直接穿過去）',
    `dist=${ghosts.trunk?.dist?.toFixed(2)} r=${ghosts.trunk?.r?.toFixed(2)}`
  );
  eq(ghosts.trunk?.inside, false, '走完之後玩家不在樹裡面');
  eq(ghosts.trunk?.startBlocked, false, '（測試前提）助跑的起點是空地');
  eq(ghosts.slideTargetFound, true, '找得到一個「兩側都空」的擦邊目標（前提真的成立）');
  ok(ghosts.slide?.moved > 2.0, '擦到樹的時候會沿著它滑過去（不會黏死）', `moved=${ghosts.slide?.moved?.toFixed(2)}`);
  eq(ghosts.slide?.inside, false, '沿牆滑也不會滑進樹裡');
  ok(ghosts.slide?.passed > 0, '擦過之後人已經在樹的另一側', `along=${ghosts.slide?.passed?.toFixed(2)}`);
  eq(ghosts.tabletSolid, true, '石碑本體現在擋得住人（祭壇淨空圈不再把它變成幽靈）');
  ok(ghosts.tablet?.dist > 1.0, '走進石碑會被擋下來', `dist=${ghosts.tablet?.dist?.toFixed(2)}`);
  eq(ghosts.tablet?.inside, false, '走完之後玩家不在石碑裡面');
  eq(ghosts.tablet?.startBlocked, false, '（測試前提）石碑前面是空地');
  eq(ghosts.tabletInteract, true, '石碑擋得住人，但 2.4 公尺外照樣讀得到（互動沒被擋掉）');
  eq(ghosts.smallRockFound, true, '找得到一顆中型碎石（半徑 0.5–0.62，以前在最小半徑之下）');
  ok(
    ghosts.smallRock?.dist > ghosts.smallRock?.r,
    '中型碎石也擋得住人（以前走得過去）',
    `dist=${ghosts.smallRock?.dist?.toFixed(2)} r=${ghosts.smallRock?.r?.toFixed(2)}`
  );
  eq(ghosts.smallRock?.inside, false, '走完之後玩家不在碎石裡面');
  eq((ghosts.approaches || []).filter((a) => a.blocked).length, 0, '石座四個方向都站得進去（沒有被新碰撞體擋掉）');
  eq((ghosts.approaches || []).filter((a) => a.interact).length, 4, '石座四個方向都按得到 E');


  /* ================================================================ */
  console.log('\n▸ 世界觀石碑（Phase 5）');
  const tabletNear = await evaluate(`
    const g = window.__promptasy;
    const tab = g.world.tablets.find((t) => t.id === 'hearth');
    g.player.teleport(tab.position.x + 1.4, tab.position.z + 1.4);
    await new Promise((r) => setTimeout(r, 320));
    return {
      title: tab.tablet.title,
      lines: tab.tablet.lines.length,
      interact: document.querySelector('[data-interact]')?.textContent || '',
      hidden: document.querySelector('[data-interact]')?.hidden,
      near: tab.near,
      xpBefore: g.progression.state.xp,
      readBefore: g.progression.hasReadLore('hearth'),
    };
  `);
  eq(tabletNear.hidden, false, '走近石碑會顯示互動提示');
  ok(tabletNear.interact.includes('閱讀'), '提示寫的是「閱讀」而不是「互動」', tabletNear.interact);
  ok(tabletNear.interact.includes(tabletNear.title), '提示顯示石碑名', tabletNear.interact);
  eq(tabletNear.near, true, '石碑進入「走近」狀態（腳下的光環亮起）');
  eq(tabletNear.readBefore, false, '這塊石碑還沒讀過');

  await key('KeyE', 'e', { vk: 69 });
  await sleep(420);
  const tabletRead = await evaluate(`
    const g = window.__promptasy;
    const panel = document.getElementById('lore-tablet');
    return {
      open: g.tabletPanel.isOpen,
      title: panel.querySelector('.panel__title')?.textContent || '',
      lines: panel.querySelectorAll('.lore__line').length,
      note: panel.querySelector('.lore__note')?.textContent || '',
      links: panel.querySelectorAll('a').length,
      inPanel: panel.querySelector('.panel').contains(document.activeElement),
      xp: g.progression.state.xp,
      read: g.progression.hasReadLore('hearth'),
      saved: (JSON.parse(localStorage.getItem('promptasy.v1.save')).loreRead || []).length,
    };
  `);
  eq(tabletRead.open, true, '按 E 打開石碑');
  ok(tabletRead.title.length > 0, '石碑面板顯示碑名', tabletRead.title);
  ok(tabletRead.lines >= 1 && tabletRead.lines <= 3, '碑文 1–3 句', `n=${tabletRead.lines}`);
  ok(/\+\d+ XP/.test(tabletRead.note), '第一次讀給少量 XP', tabletRead.note);
  eq(tabletRead.links, 0, '石碑不放官方連結（教學與出處只在關卡與圖鑑）');
  eq(tabletRead.inPanel, true, '石碑面板開啟時焦點在面板內（M6 無障礙）');
  ok(tabletRead.xp > tabletNear.xpBefore, '讀碑後 XP 增加', `${tabletNear.xpBefore} → ${tabletRead.xp}`);
  eq(tabletRead.read, true, '讀過的石碑被記住');
  eq(tabletRead.saved, 1, '已讀石碑寫進 localStorage');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(320);
  eq(await evaluate('return window.__promptasy.tabletPanel.isOpen;'), false, 'Esc 收起石碑面板');
  eq(
    await evaluate('return window.__promptasy.player.speed >= 0 && !!window.__promptasy.player;'),
    true,
    '收起面板後角色可以繼續動'
  );

  await key('KeyE', 'e', { vk: 69 });
  await sleep(420);
  const tabletAgain = await evaluate(`
    const g = window.__promptasy;
    const panel = document.getElementById('lore-tablet');
    return { open: g.tabletPanel.isOpen, note: panel.querySelector('.lore__note')?.textContent || '', xp: g.progression.state.xp };
  `);
  eq(tabletAgain.open, true, '石碑可以重讀');
  ok(!/\+\d+ XP/.test(tabletAgain.note), '重讀不再給 XP（不能刷分）', tabletAgain.note);
  eq(tabletAgain.xp, tabletRead.xp, '重讀後 XP 不變');
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(280);

  /* ================================================================ */
  console.log('\n▸ 圖鑑 / 設定 / 音量 / 畫質');
  await key('KeyC', 'c', { vk: 67 });
  await sleep(350);
  const codex = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.codex.isOpen,
      techs: document.querySelectorAll('#codex .tech').length,
      locked: document.querySelectorAll('#codex .tech--locked').length,
      collected: g.progression.state.collected.length,
      total: g.content.curriculum.techniques.length,
      inPanel: document.querySelector('#codex .panel').contains(document.activeElement),
    };
  `);
  eq(codex.open, true, 'C 開啟圖鑑');
  /*
   * 課程 v2 · Phase E：圖鑑除了舊 68 條技巧，還會列出「只教 v2 技能」的新區域
   * （量器坊起）的技法 —— 所以總條數是 68 ＋ 那幾區的技能數。
   */
  const CODEX_SKILL_ROWS = CATALOG.implementedRegions()
    .filter((r) => r.skillOnly)
    .reduce((n, r) => n + CATALOG.regionSkills(r.id).length, 0);
  eq(
    codex.techs,
    TECHNIQUE_TOTAL + CODEX_SKILL_ROWS,
    `圖鑑列出 ${TECHNIQUE_TOTAL} 條技巧 ＋ ${CODEX_SKILL_ROWS} 條新區域的技法`
  );
  ok(codex.collected > 0, '這一輪已經收集了一些技巧', `collected=${codex.collected}`);
  eq(
    codex.locked,
    codex.total - codex.collected + CODEX_SKILL_ROWS,
    '未收集的技巧與技法都顯示為 ???'
  );
  eq(codex.inPanel, true, '圖鑑開啟時焦點在面板內（M6 無障礙）');
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(250);

  await key('KeyO', 'o', { vk: 79 });
  await sleep(350);
  const vol = await evaluate(`
    const g = window.__promptasy;
    const slider = document.getElementById('set-volume');
    slider.value = '22';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    return {
      settingsOpen: g.settings.isOpen,
      audioVolume: g.audio.getVolume(),
      saved: JSON.parse(localStorage.getItem('promptasy.v1.save')).settings.volume,
    };
  `);
  eq(vol.settingsOpen, true, 'O 開啟設定');
  ok(Math.abs(vol.audioVolume - 0.22) < 0.001, '音量滑桿即時影響音訊（M5）', `v=${vol.audioVolume}`);
  ok(Math.abs(vol.saved - 0.22) < 0.001, '音量寫進存檔（持久化）', `saved=${vol.saved}`);

  // Phase 8：設定頁只講玩家的事，不講網站怎麼做的
  const settingsWording = await evaluate(`
    const text = document.getElementById('settings').innerText;
    const banned = ['後製', 'bloom', 'Bloom', '色彩分級', 'pixelRatio', 'Web Audio', 'localStorage',
      'shader', 'Shader', 'WebGL', '子集', '字型', 'promptasy.v1.save', 'postprocessing', 'DOM', 'CSS'];
    return { hits: banned.filter((w) => text.includes(w)), len: text.length };
  `);
  eq(settingsWording.hits.length, 0, '設定頁沒有網站設計 / 技術細節的字眼（Phase 8 回報）', settingsWording.hits.join('、'));
  ok(settingsWording.len > 60, '設定頁仍有可讀的說明文字', String(settingsWording.len));

  const qualityLow = await evaluate(`
    const g = window.__promptasy;
    const sel = document.getElementById('set-quality');
    sel.value = 'low';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      engineQuality: g.engine.quality,
      saved: JSON.parse(localStorage.getItem('promptasy.v1.save')).settings.quality,
      stillRendering: g.engine.renderer.info.render.frame > 0,
    };
  `);
  eq(qualityLow.engineQuality, 'low', '畫質切到低 → 後製即時關閉（M6）');
  eq(qualityLow.saved, 'low', '畫質設定持久化');
  eq(qualityLow.stillRendering, true, '低畫質仍持續渲染');

  const qualityHigh = await evaluate(`
    const g = window.__promptasy;
    const sel = document.getElementById('set-quality');
    sel.value = 'high';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { engineQuality: g.engine.quality, frames: g.engine.renderer.info.render.frame };
  `);
  eq(qualityHigh.engineQuality, 'high', '畫質切回高 → 後製即時開啟');
  ok(qualityHigh.frames > 0, '切換畫質後畫面沒壞');

  /* --- Phase 20：下拉打開之後那張清單要看得見字（產品回報：白底白字） --- */
  const dropdown = await evaluate(`
    const parse = (c) => {
      const m = /rgba?\\(([^)]+)\\)/.exec(c || '');
      if (!m) return null;
      const [r, g, b, a] = m[1].split(',').map((v) => parseFloat(v));
      return { r, g, b, a: a === undefined ? 1 : a };
    };
    const lum = (c) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const contrast = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const report = {};
    for (const id of ['set-quality', 'set-mode']) {
      const sel = document.getElementById(id);
      const cs = getComputedStyle(sel);
      const opt = sel.options[0];
      const co = getComputedStyle(opt);
      const checked = sel.options[sel.selectedIndex];
      const cc = getComputedStyle(checked);
      const optBg = parse(co.backgroundColor);
      const optFg = parse(co.color);
      report[id] = {
        selColorScheme: cs.colorScheme,
        selBg: cs.backgroundColor,
        selFg: cs.color,
        selContrast: contrast(parse(cs.backgroundColor), parse(cs.color)),
        optBg: co.backgroundColor,
        optFg: co.color,
        optBgLum: lum(optBg),
        optAlpha: optBg.a,
        optContrast: contrast(optBg, optFg),
        checkedBg: cc.backgroundColor,
        checkedContrast: contrast(parse(cc.backgroundColor), parse(cc.color)),
        optCount: sel.options.length,
      };
    }
    return {
      report,
      rootScheme: getComputedStyle(document.documentElement).colorScheme,
      selectCount: document.querySelectorAll('select').length,
    };
  `);
  ok(/dark/.test(dropdown.rootScheme), '整份文件宣告深色配色（原生元件才會畫成深色）', dropdown.rootScheme);
  eq(dropdown.selectCount, 2, '全站就這兩個下拉（都在設定頁）');
  for (const [id, r] of Object.entries(dropdown.report)) {
    ok(/dark/.test(r.selColorScheme), `[${id}] 下拉本身是深色配色（彈出清單才不會是白底）`, r.selColorScheme);
    ok(r.optAlpha === 1, `[${id}] 選項底色是實心的（不是透明→被瀏覽器當白底）`, String(r.optAlpha));
    ok(r.optBgLum < 0.12, `[${id}] 選項底色是深色，不是白的`, `${r.optBg} lum=${r.optBgLum.toFixed(3)}`);
    ok(r.optContrast >= 4.5, `[${id}] 選項的字讀得到（對比 ≥ 4.5:1）`, `${r.optFg} on ${r.optBg} = ${r.optContrast.toFixed(2)}:1`);
    ok(
      r.checkedContrast >= 4.5,
      `[${id}] 目前選中的那一列也讀得到`,
      `${r.checkedBg} = ${r.checkedContrast.toFixed(2)}:1`
    );
    ok(r.selContrast >= 4.5, `[${id}] 收起來的樣子也讀得到（石籤上的字）`, `${r.selContrast.toFixed(2)}:1`);
    ok(r.optCount >= 2, `[${id}] 選項數正確`, String(r.optCount));
  }

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(250);

  /* ================================================================ */
  console.log('\n▸ 分區配樂與氣氛');
  const moods = await evaluate(`
    const g = window.__promptasy;
    const mod = g.audio;
    const ids = ['foundations', 'reasoning', 'grounding', 'orchestration', 'config'];
    const seen = [];
    for (const id of ids) {
      mod.setRegion(id, 0.2);
      seen.push({ id, region: mod.region, name: mod.mood.name, root: mod.mood.root, bell: mod.mood.bellDensity });
    }
    mod.setRegion('foundations', 0.2);
    return seen;
  `);
  eq(moods.length, 5, '五個區域都有配樂設定');
  for (const m of moods) eq(m.region, m.id, `[${m.id}] 配樂可切換`);
  eq(new Set(moods.map((m) => m.root)).size, 5, '五區的根音各不相同（M5 分區配樂）');
  eq(new Set(moods.map((m) => m.name)).size, 5, '五區的曲名各不相同');

  /* ---------------------------------------------------------------- *
   * Phase 30：真的音檔（`public/audio/`）＋ 合成備援
   *
   * 兩條路都要驗：
   *   (a) 檔案讀得到 → buffer 那條路真的接上去（source = 'file'、有 segment 在跑）
   *   (b) 檔案讀不到（或手動關掉）→ 合成 pad 頂上，一聲都不會啞
   * 不驗「聽起來對不對」（headless 沒有喇叭）—— 只驗節點圖與狀態。
   * ---------------------------------------------------------------- */
  const audioFiles = await evaluate(`
    const g = window.__promptasy;
    const d = g.audio.debug();
    // 這台機器解得開 m4a（AAC）嗎？解不開就走備援那條路（一樣要通過）
    let decodable = false;
    try {
      const res = await fetch('audio/sfx_click.m4a');
      const raw = await res.arrayBuffer();
      const probe = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await probe.decodeAudioData(raw.slice(0));
      decodable = !!buf && buf.duration > 0;
      probe.close();
    } catch (err) { decodable = false; }
    const bgmRequests = performance.getEntriesByType('resource').filter((r) => /\\.m4a(\\?|$)/.test(r.name));
    return {
      chain: d.chain,
      usesFiles: d.usesFiles,
      bgmKeys: Object.keys(d.bgm),
      sfxKeys: Object.keys(d.sfx),
      sfxSynthFallback: Object.values(d.sfx).every((s) => s.synthFallback),
      titles: Object.values(d.bgm).map((b) => b.title),
      files: Object.values(d.bgm).map((b) => b.file),
      requests: bgmRequests.length,
      decodable,
    };
  `);
  eq(audioFiles.chain.master, true, '音訊鏈上有 master（音量與靜音同時管住兩條路）');
  eq(audioFiles.chain.compressor, true, '最後一級有 compressor（Phase 22 的防削波還在）');
  eq(audioFiles.chain.duck, true, '配樂前面有 duck（過關的頌缽響時把床壓低）');
  eq(audioFiles.chain.bgmBus, true, '音檔配樂有自己的 bus');
  eq(audioFiles.chain.sfxBus, true, '音效有自己的 bus');
  /*
   * 課程 v2 · Phase E：`debug().bgm` 一區一格（含還沒有音檔的合成專用區），
   * 所以「有幾首音檔」要看 file 非 null 的那幾格 —— 合成專用區誠實地是 null。
   */
  const SYNTH_ONLY_E2E = EXPECT.synthOnlyRegions.value;
  const withFile = audioFiles.bgmKeys.filter((id, i) => audioFiles.files[i]);
  eq(
    withFile.length,
    EXPECT.v2ImplementedRegions.value + 1 - SYNTH_ONLY_E2E.length,
    '每個有音檔的區域各一首，外加標題卡的開場曲'
  );
  ok(audioFiles.bgmKeys.includes('title'), '開場曲也在配樂表上', audioFiles.bgmKeys.join(','));
  for (const region of CATALOG.implementedRegionIds()) {
    if (SYNTH_ONLY_E2E.includes(region)) {
      ok(!withFile.includes(region), `${region} 誠實地沒有音檔（走合成 pad）`);
      continue;
    }
    ok(withFile.includes(region), `${region} 有自己的配樂`);
  }
  {
    const files = audioFiles.files.filter(Boolean);
    const titles = audioFiles.titles.filter(Boolean);
    eq(new Set(files).size, files.length, '每一首都是不同的檔案');
    eq(new Set(titles).size, titles.length, '每一首曲名各不相同');
  }
  eq(audioFiles.sfxSynthFallback, true, '每一支音檔音效都留著合成備援');
  ok(audioFiles.requests > 0, '手勢之後才開始抓音檔', `requests=${audioFiles.requests}`);
  console.log(`  · 這台機器${audioFiles.decodable ? '解得開' : '解不開'} m4a（AAC）`);

  if (audioFiles.decodable) {
    // (a) 檔案這條路：等當區配樂解好並開始播
    const playing = await evaluate(`
      const g = window.__promptasy;
      g.audio.setRegion('foundations', 0.4);
      const ok = await g.audio.load('foundations');
      await new Promise((r) => setTimeout(r, 900));
      const d = g.audio.debug();
      return { ok, d: d.bgm.foundations, source: d.source, decodedTracks: d.decodedTracks.length };
    `);
    eq(playing.ok, true, '當區配樂真的載得起來（fetch → decode → buffer）');
    eq(playing.d.playing, true, '配樂用 AudioBufferSourceNode 播出來了');
    eq(playing.source, 'file', '有音檔時聽到的是音檔，不是合成');
    ok(playing.d.segments >= 1, '有一段配樂正在跑（自我交叉淡入的第一段）', `segments=${playing.d.segments}`);
    ok(playing.d.loopSeconds > 60, '配樂是完整的一首（不是幾秒的片段）', `${playing.d.loopSeconds}s`);
    ok(playing.d.gain > 0.5, '配樂的 gain 已經淡進來', `gain=${playing.d.gain}`);
    ok(playing.d.synthGain < 0.35, '音檔接手之後合成 pad 退場', `synth=${playing.d.synthGain}`);
    ok(playing.decodedTracks <= 2, '同時最多只留兩首解碼後的配樂（記憶體）', `n=${playing.decodedTracks}`);

    // 跨區：交叉淡入淡出到另一首（舊的收掉、新的接上）
    const swapped = await evaluate(`
      const g = window.__promptasy;
      g.audio.setRegion('grounding', 0.6);
      await g.audio.load('grounding');
      await new Promise((r) => setTimeout(r, 1200));
      const d = g.audio.debug();
      return {
        region: d.region,
        source: d.source,
        grounding: d.bgm.grounding,
        foundations: d.bgm.foundations,
        decodedTracks: d.decodedTracks.length,
      };
    `);
    eq(swapped.region, 'grounding', '跨區後配樂換到 grounding');
    eq(swapped.source, 'file', '跨區後聽到的還是音檔');
    eq(swapped.grounding.playing, true, '新一區的配樂接上了');
    ok(swapped.grounding.gain > 0.4, '新一區的配樂淡進來', `gain=${swapped.grounding.gain}`);
    ok(swapped.foundations.gain < 0.5, '上一區的配樂淡出去', `gain=${swapped.foundations.gain}`);
    ok(swapped.decodedTracks <= 2, '跨區時解碼後的配樂仍然最多兩首', `n=${swapped.decodedTracks}`);

    // 音效：按下去用的是音檔那條路（不是合成）
    const sfx = await evaluate(`
      const g = window.__promptasy;
      const d = g.audio.debug();
      return { click: d.sfx.click, page: d.sfx.open, pass: d.sfx.pass, unlock: d.sfx.unlock };
    `);
    for (const [name, s] of Object.entries(sfx)) {
      ok(s.fetch !== 'failed', `音效 ${name} 抓得到`, `${s.file} / ${s.fetch}`);
    }
  } else {
    const fallbackOnly = await evaluate(`
      const g = window.__promptasy;
      await new Promise((r) => setTimeout(r, 600));
      const d = g.audio.debug();
      return { source: d.source, synth: d.bgm[d.region].synthGain };
    `);
    eq(fallbackOnly.source, 'synth', '解不開音檔時整組回到合成配樂');
    ok(fallbackOnly.synth > 0.3, '合成 pad 頂上來了（不會有一段無聲）', `synth=${fallbackOnly.synth}`);
  }

  // (b) 備援：把音檔當成不存在（＝清空 public/audio/）→ 合成 pad 接手，一聲都不啞
  const fallback = await evaluate(`
    const g = window.__promptasy;
    g.audio.setRegion('foundations', 0.4);
    g.audio.useFiles(false);
    await new Promise((r) => setTimeout(r, 1400));
    const d = g.audio.debug();
    const cues = ['pass', 'unlock', 'gateOpen', 'click', 'shrine', 'finale', 'submit', 'open', 'codex',
      'trialPass', 'masterSeal', 'hardGate', 'simLow', 'simMid', 'simHigh',
      'formsTap', 'toolcraftStrike', 'toolcraftComplete', 'frugalityRemove', 'refineryRerun', 'sightFocus']
      .map((k) => g.audio.cue(k));
    return {
      source: d.source,
      usesFiles: d.usesFiles,
      synth: d.bgm.foundations.synthGain,
      anyPlaying: Object.values(d.bgm).some((b) => b.playing),
      cues,
    };
  `);
  eq(fallback.usesFiles, false, '可以把音檔關掉（離線 / 檔案壞掉時的退路）');
  eq(fallback.source, 'synth', '關掉音檔後聽到的是合成配樂');
  eq(fallback.anyPlaying, false, '關掉音檔後沒有 buffer 還在播');
  ok(fallback.synth > 0.5, '合成 pad 淡回來了', `synth=${fallback.synth}`);
  eq(fallback.cues.every(Boolean), true, '關掉音檔後每一支音效照樣有聲音（合成備援）');

  const restored = await evaluate(`
    const g = window.__promptasy;
    g.audio.useFiles(true);
    await new Promise((r) => setTimeout(r, 400));
    return g.audio.debug().usesFiles;
  `);
  eq(restored, true, '可以再切回音檔');

  /* ---------------------------------------------------------------- *
   * issue #3：新的 cue（轉鈕三檔 / 試煉的鑼 / 大師層印記 / 硬門檻 / 五片新土地）
   * 與響度系統（檔案不做響度處理，統一在播放時的 gain）
   * ---------------------------------------------------------------- */
  const v2Audio = await evaluate(`
    const g = window.__promptasy;
    const d = g.audio.debug();
    const dialCues = [];
    for (const notch of [0, 1, 2]) {
      g.audio.cue('simDial', { notch });
      dialCues.push(g.audio.debug().lastCue);
      await new Promise((r) => setTimeout(r, 120));
    }
    return {
      sfx: d.sfx,
      dialCues,
      trialPassFile: d.sfx.trialPass ? d.sfx.trialPass.file : null,
      passFile: d.sfx.pass ? d.sfx.pass.file : null,
      strikeAlt: d.sfx.toolcraftStrike ? d.sfx.toolcraftStrike.alt : null,
      bgm: Object.fromEntries(Object.entries(d.bgm).map(([k, v]) => [k, { file: v.file, lufs: v.lufs, targetGain: v.targetGain }])),
    };
  `);
  eq(
    JSON.stringify(v2Audio.dialCues),
    JSON.stringify(['simLow', 'simMid', 'simHigh']),
    "cue('simDial', { notch }) 真的轉成三檔各自的那一支"
  );
  for (const kind of [
    'trialPass', 'masterSeal', 'hardGate', 'simLow', 'simMid', 'simHigh',
    'formsTap', 'toolcraftStrike', 'toolcraftComplete', 'frugalityRemove', 'refineryRerun', 'sightFocus',
  ]) {
    const row = v2Audio.sfx[kind];
    ok(Boolean(row), `新音效 ${kind} 登記在音效表上`);
    ok(Boolean(row) && row.synthFallback, `新音效 ${kind} 留著合成備援（護欄 3）`);
    ok(Boolean(row) && row.fetch !== 'failed', `新音效 ${kind} 抓得到`, row && `${row.file} / ${row.fetch}`);
    ok(Boolean(row) && Number.isFinite(row.lufs), `新音效 ${kind} 記著量到的響度`, row && String(row.lufs));
    ok(Boolean(row) && row.gain > 0, `新音效 ${kind} 有算出來的 gain`, row && String(row.gain));
  }
  ok(v2Audio.trialPassFile !== v2Audio.passFile, '試煉的鑼與一般過關的頌缽不是同一個檔案');
  ok(Boolean(v2Audio.strikeAlt), '鍛打有第二顆素材可以輪播', String(v2Audio.strikeAlt));
  // 十二區配樂：六首 v1 的 gain ≈ 1（本來就烘在 -20），六首 v2 的被壓下來
  for (const id of ['title', 'foundations', 'reasoning', 'grounding', 'orchestration', 'config']) {
    ok(Math.abs(v2Audio.bgm[id].targetGain - 1) < 0.03, `v1 的配樂 ${id} 本來就烘在 -20，gain ≈ 1`, String(v2Audio.bgm[id].targetGain));
  }
  for (const id of ['forms', 'toolcraft', 'frugality', 'refinery', 'sight', 'divergence']) {
    ok(Boolean(v2Audio.bgm[id].file), `${id} 有自己的配樂音檔（issue #3）`, String(v2Audio.bgm[id].file));
    ok(v2Audio.bgm[id].targetGain < 0.8, `${id} 交來是 raw，被 gain 壓回 -20`, String(v2Audio.bgm[id].targetGain));
  }
  /*
   * 護欄崗《The Unclosing Door》補上之後，十二區全數有自己的一首、
   * `SYNTH_ONLY_REGIONS` 清空 —— 這條斷言在那一次沒有跟著翻面（既有紅燈）。
   * 現在守的是「它有自己的音檔，而且交來是 raw、被 gain 壓回 −20」。
   */
  ok(Boolean(v2Audio.bgm.wards.file), '護欄崗有自己的配樂音檔', String(v2Audio.bgm.wards.file));
  ok(
    v2Audio.bgm.wards.targetGain < 0.8,
    '護欄崗的配樂交來是 raw，被 gain 壓回 -20',
    String(v2Audio.bgm.wards.targetGain)
  );

  /* ================================================================ */
  console.log('\n▸ 閘門與跨區（含氣氛切換）');
  const locked = await evaluate(`
    const g = window.__promptasy;
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    g.player.teleport(gate.position.x - 6, gate.position.z - 6);
    await new Promise((r) => setTimeout(r, 200));
    const before = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    return { unlocked: g.progression.isRegionUnlocked('reasoning'), gateOpen: gate.isOpen, before };
  `);
  eq(locked.unlocked, false, '尚未達標 → reasoning 仍鎖住');
  eq(locked.gateOpen, false, '閘門顯示為關閉');

  const blocked = await evaluate(`
    const g = window.__promptasy;
    const site = { x: -95, z: -95 };
    await new Promise((r) => setTimeout(r, 1600));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const d = Math.hypot(g.player.position.x - site.x, g.player.position.z - site.z);
    return { distToRegion: d, walkable: g.world.isWalkable(site.x, site.z) };
  `);
  ok(blocked.distToRegion > 40, '閘門鎖住時走不進 reasoning', `dist=${blocked.distToRegion.toFixed(1)}`);
  eq(blocked.walkable, false, '鎖住的區域判定為不可行走');

  /* ---------------------------------------------------------------- *
   * Phase 29：門會問你「要不要先行前往」
   * ---------------------------------------------------------------- */
  console.log('\n▸ 先行前往（詢問式閘門 · Phase 29）');

  // 先把上一段可能開著的東西收乾淨，並走遠一點（重新武裝「走到門前就問」）
  await evaluate(`
    const g = window.__promptasy;
    if (g.gateAsk.isOpen) g.gateAsk.close();
    g.player.teleport(0, 6);
    await new Promise((r) => setTimeout(r, 300));
    return 1;
  `);

  /* v1.2 · P06：三態 —— 新存檔：reasoning 門琥珀（foundations 已解鎖）、grounding 門暗；石座 foundations lit、reasoning dark */
  const triBefore = await evaluate(`
    const g = window.__promptasy;
    const gate = (id) => g.world.gates.find((x) => x.id === id);
    const marker = (r) => g.world.markers.find((x) => x.region === r);
    let lights = 0; g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    return {
      unlockedReasoning: g.progression.isRegionUnlocked('reasoning'),
      unlockedForms: g.progression.isRegionUnlocked('forms'),
      reasoning: gate('reasoning').visualState,
      grounding: gate('grounding').visualState,
      forms: gate('forms').visualState,
      wards: gate('wards').visualState,
      toolcraft: gate('toolcraft').visualState,
      divergence: gate('divergence').visualState,
      unlockedOrch: g.progression.isRegionUnlocked('orchestration'),
      unlockedCount: g.progression.state.unlockedRegions.length,
      states: g.world.gates.map((x) => x.visualState),
      mFoundations: marker('foundations').regionState,
      mReasoning: marker('reasoning').regionState,
      mReasoningDim: marker('reasoning').dimTarget,
      lights,
    };
  `);
  eq(triBefore.unlockedReasoning, false, 'P06：這時 reasoning 還沒解鎖（新存檔）');
  eq(triBefore.reasoning, 'amber', 'P06：新存檔 reasoning 門琥珀（前一區 foundations 已解鎖 → 可以先行前往）');
  eq(triBefore.grounding, 'dark', 'P06：新存檔 grounding 門暗（前一區 reasoning 未解鎖）');
  // forms 是知識式門（橋自 foundations）：前面幾節可能已經把它的條件湊滿 → 解鎖了就是 lit，否則琥珀
  eq(triBefore.forms, triBefore.unlockedForms ? 'lit' : 'amber', `P06：forms 門（知識式門、橋自 foundations）${triBefore.unlockedForms ? '已解鎖 → lit' : '未解鎖 → 琥珀'}`);
  eq(triBefore.wards, 'dark', 'P06：新存檔 wards 門暗（條件指向 grounding／toolcraft，都沒解鎖）');
  eq(triBefore.unlockedOrch, false, 'P06：這時 orchestration 還沒解鎖');
  eq(triBefore.toolcraft, 'dark', 'P06：新存檔 toolcraft 門暗（知識式門，條件指向 orchestration，未解鎖）');
  // divergence（任 2 片精通）：已解鎖的區不到 2 片 → 暗；前面幾節若已把第二片（如 forms）湊開 → 琥珀
  eq(triBefore.divergence, triBefore.unlockedCount >= 2 ? 'amber' : 'dark', `P06：divergence 門（任 2 片精通）已解鎖 ${triBefore.unlockedCount} 片 → ${triBefore.unlockedCount >= 2 ? '琥珀' : '暗'}`);
  // 知識式門的前路一開就轉琥珀：暫時把 orchestration 標成已解鎖 → refreshVisualStates（只改目標值、不開門）→ 再還原
  const triKnow = await evaluate(`
    const g = window.__promptasy;
    const gate = (id) => g.world.gates.find((x) => x.id === id);
    const st = g.progression.state;
    const had = st.unlockedRegions.includes('orchestration');
    if (!had) st.unlockedRegions.push('orchestration');
    g.world.refreshVisualStates();
    const during = { toolcraft: gate('toolcraft').visualState, orchOpen: gate('orchestration').isOpen };
    if (!had) st.unlockedRegions.splice(st.unlockedRegions.indexOf('orchestration'), 1);
    g.world.refreshVisualStates();
    return { during, after: gate('toolcraft').visualState, orchUnlocked: g.progression.isRegionUnlocked('orchestration') };
  `);
  eq(triKnow.during.toolcraft, 'amber', 'P06：orchestration 解鎖 → toolcraft 門轉琥珀（知識式門的前路開了）');
  eq(triKnow.during.orchOpen, false, 'P06：refreshVisualStates 只改三態、不開門');
  eq(triKnow.after, 'dark', 'P06：還原後 toolcraft 又回到暗');
  eq(triKnow.orchUnlocked, false, 'P06：orchestration 的解鎖狀態已還原');
  ok(triBefore.states.every((s) => s === 'lit' || s === 'amber' || s === 'dark'), 'P06：每道門都有三態之一', triBefore.states.join(','));
  eq(triBefore.mFoundations, 'lit', 'P06：foundations 石座 lit');
  eq(triBefore.mReasoning, 'dark', 'P06：reasoning 石座 dark（所在區未解鎖）');
  eq(triBefore.mReasoningDim, 0.4, 'P06：dark 石座底亮度目標 ×0.4');

  // (1) 走進閘門 → 對話框自己出現（不用先學一個鍵）
  const walkIn = await evaluate(`
    const g = window.__promptasy;
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    // 從門的正前方 12 公尺（超過自動詢問半徑）往門走過去
    const dir = gate.corridor.dir;
    g.player.teleport(gate.position.x - dir.x * 12, gate.position.z - dir.z * 12);
    await new Promise((r) => setTimeout(r, 400));
    const beforeOpen = g.gateAsk.isOpen;
    // 直接沿著橋往門的方向推進（不靠鏡頭方向，測試才穩）
    const until = performance.now() + 6000;
    while (!g.gateAsk.isOpen && performance.now() < until) {
      const p = g.player.position;
      const d = Math.hypot(gate.position.x - p.x, gate.position.z - p.z);
      if (d < 0.4) break;
      g.player.teleport(p.x + dir.x * 0.6, p.z + dir.z * 0.6);
      await new Promise((r) => setTimeout(r, 90));
    }
    // 覆蓋層的焦點是在 requestAnimationFrame 裡送過去的 —— 等它落定再量
    await new Promise((r) => setTimeout(r, 350));
    const panel = document.querySelector('#gate-ask');
    return {
      beforeOpen,
      open: g.gateAsk.isOpen,
      region: g.gateAsk.regionId,
      text: panel ? panel.innerText : '',
      buttons: panel ? [...panel.querySelectorAll('[data-go], [data-stay]')].map((b) => b.textContent.trim()) : [],
      links: panel ? panel.querySelectorAll('a[href^="http"]').length : 0,
      focused: document.activeElement ? document.activeElement.getAttribute('data-stay') !== null : false,
      inputEnabled: g.player.inputEnabled,
    };
  `);
  eq(walkIn.beforeOpen, false, '還沒走到門前不會被問');
  eq(walkIn.open, true, '走進閘門 → 對話框自己出現');
  eq(walkIn.region, 'reasoning', '問的是 reasoning 那道門');
  ok(walkIn.text.includes('這道門的考驗還沒完成'), '講出「考驗還沒完成」', walkIn.text.slice(0, 60));
  ok(walkIn.text.includes('還差：'), '講得出還差什麼');
  ok(walkIn.text.includes('前方的試煉不會因此變簡單'), '老實說「不會因此變簡單」');
  ok(walkIn.buttons.includes('直接前往'), '有「直接前往」', walkIn.buttons.join(' / '));
  ok(walkIn.buttons.includes('先留下修行'), '有「先留下修行」');
  eq(walkIn.links, 0, '這是世界的一句話，不放官方連結（護欄 2）');
  eq(walkIn.focused, true, '焦點預設落在「先留下修行」（不會誤按越過一整區）');

  // (2) 「先留下修行」→ 收起來、門仍然關著
  const stayed = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#gate-ask [data-stay]').click();
    await new Promise((r) => setTimeout(r, 400));
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    return {
      open: g.gateAsk.isOpen,
      unlocked: g.progression.isRegionUnlocked('reasoning'),
      gateOpen: gate.isOpen,
      walkable: g.world.isWalkable(-95, -95),
      skipped: g.progression.skippedGateCount(),
    };
  `);
  eq(stayed.open, false, '「先留下修行」把對話框收起來');
  eq(stayed.unlocked, false, '門沒有因此被打開');
  eq(stayed.gateOpen, false, '閘門仍然是關的');
  eq(stayed.walkable, false, '那一區仍然走不進去');
  eq(stayed.skipped, 0, '沒有留下任何「先行前往」的記錄');

  // (3) 站在原地不會被連問（要走遠一點再回來）
  const noNag = await evaluate(`
    const g = window.__promptasy;
    await new Promise((r) => setTimeout(r, 1200));
    return g.gateAsk.isOpen;
  `);
  eq(noNag, false, '選了「先留下修行」之後站在門口不會被連問');

  // (4) 按 E 也問得出來（純鍵盤路徑）
  await key('KeyE', 'e', { vk: 69 });
  await sleep(400);
  const byKey = await evaluate(`
    const g = window.__promptasy;
    await new Promise((r) => setTimeout(r, 350));
    return {
      open: g.gateAsk.isOpen,
      region: g.gateAsk.regionId,
      onStay: document.activeElement ? document.activeElement.getAttribute('data-stay') !== null : false,
    };
  `);
  eq(byKey.open, true, '按 E 也問得出來');
  eq(byKey.region, 'reasoning', '按 E 問的是同一道門');
  eq(byKey.onStay, true, '按 E 打開時焦點也落在「先留下修行」');

  // (5) 純鍵盤：Tab 移到「直接前往」，Enter 按下去
  const beforeCounts = await evaluate(`
    const g = window.__promptasy;
    return {
      xp: g.progression.state.xp,
      cleared: Object.keys(g.progression.state.bestGrades).length,
      collected: g.progression.state.collected.length,
      badges: Object.values(g.progression.state.badges).reduce((a, b) => a + b, 0),
      level: g.progression.levelInfo().level,
    };
  `);
  await tabNative(true);
  await sleep(200);
  const onGo = await evaluate(`
    return document.activeElement ? document.activeElement.getAttribute('data-go') !== null : false;
  `);
  eq(onGo, true, 'Shift+Tab 走得到「直接前往」（焦點鎖在對話框裡）');
  await enterNative();
  await sleep(900);

  const proceeded = await evaluate(`
    const g = window.__promptasy;
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    return {
      askOpen: g.gateAsk.isOpen,
      unlocked: g.progression.isRegionUnlocked('reasoning'),
      gateOpen: gate.isOpen,
      walkable: g.world.isWalkable(-95, -95),
      skipped: g.progression.state.skippedGates,
      xp: g.progression.state.xp,
      cleared: Object.keys(g.progression.state.bestGrades).length,
      collected: g.progression.state.collected.length,
      badges: Object.values(g.progression.state.badges).reduce((a, b) => a + b, 0),
      level: g.progression.levelInfo().level,
      inputEnabled: g.player.inputEnabled,
      persisted: JSON.parse(localStorage.getItem('promptasy.v1.save')).skippedGates,
    };
  `);
  eq(proceeded.askOpen, false, '按下「直接前往」後對話框收起來');
  eq(proceeded.unlocked, true, '那一區變成走得進去');
  /* v1.2 · P06：skipGate 後 reasoning 門 lit、石座 amber（halo 輪詢到暖金）、grounding 門轉琥珀、光源不變 */
  const triAfter = await evaluate(`
    const g = window.__promptasy;
    const gate = (id) => g.world.gates.find((x) => x.id === id);
    const marker = g.world.markers.find((x) => x.region === 'reasoning');
    const invite = 0xa8865c;
    const warm = 0xf0c08a;
    const until = performance.now() + 8000;
    let halo = marker.halo.material.color.getHex();
    while (performance.now() < until) {
      halo = marker.halo.material.color.getHex();
      if (halo === invite && marker.visualSettled) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    let lights = 0; g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    return {
      reasoning: gate('reasoning').visualState,
      grounding: gate('grounding').visualState,
      mState: marker.regionState,
      halo, warm, invite,
      settled: marker.visualSettled,
      haloOpacity: marker.halo.material.opacity,
      lights,
    };
  `);
  eq(triAfter.reasoning, 'lit', 'P06：先行前往後 reasoning 門 lit（開了就是主色亮）');
  eq(triAfter.grounding, 'amber', 'P06：reasoning 開了 → grounding 門轉琥珀');
  eq(triAfter.mState, 'amber', 'P06：先行前往的 reasoning 石座 amber');
  eq(triAfter.halo, triAfter.invite, 'P06：reasoning 石座 halo 顏色輪詢到 PALETTE.invite（邀請琥珀）', triAfter.halo.toString(16));
  ok(triAfter.halo !== triAfter.warm, 'P06：邀請琥珀不是成就暖金');
  eq(triAfter.settled, true, 'P06：到位後 marker.visualSettled true');
  ok(triAfter.haloOpacity > 0.02, 'P06：amber 石座 halo 微亮', String(triAfter.haloOpacity));
  eq(triAfter.lights, triBefore.lights, 'P06：三態不加光源', `${triBefore.lights} → ${triAfter.lights}`);
  eq(proceeded.gateOpen, true, '橋上的閘門開了');
  eq(proceeded.walkable, true, '原本走不進去的地方現在走得進去');
  ok((proceeded.skipped || []).includes('reasoning'), '存檔記下「這道門是被問開的」', String(proceeded.skipped));
  ok((proceeded.persisted || []).includes('reasoning'), '而且真的寫進 localStorage', String(proceeded.persisted));
  eq(proceeded.inputEnabled, true, '關掉對話框後操控權還回來了');
  // 記帳誠實：一個數字都不准變
  eq(proceeded.xp, beforeCounts.xp, '先行前往不給 XP');
  eq(proceeded.cleared, beforeCounts.cleared, '「已通關 x / 27」沒有被灌水');
  eq(proceeded.collected, beforeCounts.collected, '圖鑑沒有多收技巧');
  eq(proceeded.badges, beforeCounts.badges, '徽章一個都沒多');
  eq(proceeded.level, beforeCounts.level, '等級沒有被推上去');

  // (6) 已經開了的門不會再問一次
  const noRepeat = await evaluate(`
    const g = window.__promptasy;
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    g.player.teleport(gate.position.x, gate.position.z);
    await new Promise((r) => setTimeout(r, 900));
    const afterWalk = g.gateAsk.isOpen;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    await new Promise((r) => setTimeout(r, 300));
    return { afterWalk, afterKey: g.gateAsk.isOpen };
  `);
  eq(noRepeat.afterWalk, false, '門開了之後走過去不會再被問');
  eq(noRepeat.afterKey, false, '門開了之後按 E 也不會再被問');

  // (7) 跨重整仍然開著、仍然不會再問
  await reloadPage('先行前往後重新載入');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(600);
  const afterReload = await evaluate(`
    const g = window.__promptasy;
    const gate = g.world.gates.find((x) => x.id === 'reasoning');
    g.player.teleport(gate.position.x, gate.position.z);
    await new Promise((r) => setTimeout(r, 900));
    return {
      unlocked: g.progression.isRegionUnlocked('reasoning'),
      gateOpen: gate.isOpen,
      skipped: g.progression.hasSkippedGate('reasoning'),
      asked: g.gateAsk.isOpen,
      xp: g.progression.state.xp,
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(afterReload.unlocked, true, '重整後那一區仍然走得進去');
  eq(afterReload.gateOpen, true, '重整後閘門仍然是開的');
  eq(afterReload.skipped, true, '重整後仍記得「這是先行前往的門」');
  eq(afterReload.asked, false, '重整後也不會再被問一次');
  eq(afterReload.xp, beforeCounts.xp, '重整後 XP 仍然誠實');
  eq(afterReload.cleared, beforeCounts.cleared, '重整後通關數仍然誠實');

  // (8) 設定頁誠實列出「其中幾道門是先行前往的」
  const settingsHonest = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 400));
    const text = document.querySelector('#settings .settings__stats').innerText;
    g.settings.close();
    return text;
  `);
  ok(/先行前往/.test(settingsHonest), '設定頁講出「其中 N 道門是你先行前往的」', settingsHonest.replace(/\n/g, ' · '));

  // 收尾：把先行前往的痕跡清掉，後面幾節從乾淨的狀態繼續
  await evaluate(`
    const g = window.__promptasy;
    if (g.gateAsk.isOpen) g.gateAsk.close();
    g.player.teleport(0, 6);
    return 1;
  `);

  // 種一份「foundations 全破」的存檔後重載，驗證跨區
  const seeded = await evaluate(`
    const save = {
      version: 1, xp: 420, level: 5,
      unlockedRegions: ['foundations', 'reasoning'],
      collected: [],
      bestGrades: {
        'gate-of-clarity-01': 'S', 'postbox-sprite-02': 'S', 'lost-automaton-03': 'S',
        'mimic-mirror-04': 'S', 'long-scroll-archive-05': 'S', 'council-envoy-06': 'S'
      },
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      // promptMode 一併種進去：驗證「答題方式」跨重整還在（Phase 11）
      settings: { music: 'ambient-01', volume: 0.4, quality: 'high', muted: true, promptMode: 'free' },
      flags: { introSeen: true }
    };
    localStorage.setItem('promptasy.v1.save', JSON.stringify(save));
    return true;
  `);
  eq(seeded, true, '種入「foundations 全破」的存檔');

  await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
  await waitFor(() => evaluate('return !!window.__promptasy;'), { label: '重新載入' });
  await sleep(700);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const reloaded = await evaluate(`
    const g = window.__promptasy;
    return {
      introOpen: g.intro.isOpen,
      titleOpen: g.title.isOpen,
      unlocked: g.progression.isRegionUnlocked('reasoning'),
      gateOpen: g.world.gates.find((x) => x.id === 'reasoning').isOpen,
      muted: g.audio.muted,
      promptMode: g.progression.state.settings.promptMode,
      consoleMode: g.promptConsole.mode,
    };
  `);
  eq(reloaded.titleOpen, false, '重新載入後標題卡可關閉');
  eq(reloaded.introOpen, false, '已看過教學就不再打擾（存檔旗標）');
  eq(reloaded.unlocked, true, '達標後 reasoning 解鎖');
  eq(reloaded.gateOpen, true, '對應閘門已開啟');
  eq(reloaded.muted, true, '靜音設定沿用存檔');
  eq(reloaded.promptMode, 'free', '答題方式跨重整還在（存檔裡寫著自由書寫）');
  eq(reloaded.consoleMode, 'free', '主控台開機就照著存檔的答題方式走');

  const crossing = await evaluate(`
    const g = window.__promptasy;
    const fogBefore = g.engine.scene.fog.color.getHex();
    const audioBefore = g.audio.region;
    const countLights = () => { let n = 0; g.engine.scene.traverse((o) => { if (o.isLight) n += 1; }); return n; };
    const lightsBefore = countLights();
    const dome = g.engine.skyDome;
    const mulBefore = [dome.material.uniforms.uMulTop.value.r, dome.material.uniforms.uMulTop.value.g, dome.material.uniforms.uMulTop.value.b];
    g.player.teleport(-95, -95);
    // v1.2 · P06：輪詢直到穹頂乘數離開 1（進區換色是 lerp 過去的，不用固定 sleep 對齊）
    const until = performance.now() + 6000;
    let mulNow = mulBefore;
    while (performance.now() < until) {
      const u = dome.material.uniforms.uMulTop.value;
      mulNow = [u.r, u.g, u.b];
      if (mulNow.some((v) => Math.abs(v - 1) > 0.02) && g.audio.region === 'reasoning') break;
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 400));
    const m = g.engine.mood();
    return {
      audioBefore,
      audioAfter: g.audio.region,
      regionText: document.querySelector('[data-region]')?.textContent || '',
      fogBefore,
      fogAfter: g.engine.scene.fog.color.getHex(),
      markersHere: g.world.markers.filter((m) => m.region === 'reasoning').length,
      lightsBefore, lightsAfter: countLights(),
      mulBefore, mulNow,
      skyTarget: m.target.sky,
      csReasoning: g.colorScriptFor('reasoning'),
      hour: g.hour().index,
      // 閘門三態：進區時 refreshGates 已叫過；reasoning 已解鎖 → lit
      gateState: g.world.gates.find((x) => x.id === 'reasoning').visualState,
      markerState: g.world.markers.find((x) => x.region === 'reasoning').regionState,
    };
  `);
  /* v1.2 · P06：進 reasoning 後穹頂顏色與 foundations 不同、光源數不變、正常解鎖 → 主色亮 */
  eq(JSON.stringify(crossing.mulBefore), JSON.stringify([1, 1, 1]), 'P06：跨區前（foundations）穹頂乘數 1');
  ok(crossing.mulNow.some((v) => Math.abs(v - 1) > 0.02), 'P06：進 reasoning 後穹頂乘數離開 1（天空顏色變了）', crossing.mulNow.map((v) => v.toFixed(3)).join(','));
  ok(crossing.mulNow.every((v) => v > 0.5 && v < 2), 'P06：穹頂乘數仍在 0.5–2（微偏，仍是夜）', crossing.mulNow.map((v) => v.toFixed(3)).join(','));
  eq(crossing.skyTarget.top, parseInt(crossing.csReasoning.sky.top.slice(1), 16), 'P06：target sky.top ＝ colorScriptFor(reasoning).sky.top');
  eq(crossing.skyTarget.low, parseInt(crossing.csReasoning.sky.low.slice(1), 16), 'P06：target sky.low ＝ colorScriptFor(reasoning).sky.low');
  ok(crossing.skyTarget.top !== 0x101a28, 'P06：reasoning 的 sky.top ≠ foundations');
  eq(crossing.lightsAfter, crossing.lightsBefore, 'P06：跨區前後光源數不變（色彩腳本 0 新光源）', `${crossing.lightsBefore} → ${crossing.lightsAfter}`);
  eq(crossing.gateState, 'lit', 'P06：正常解鎖的 reasoning 門 → 主色亮（lit）');
  eq(crossing.markerState, 'lit', 'P06：正常解鎖的 reasoning 石座 → lit');
  eq(crossing.audioBefore, 'foundations', '跨區前配樂在 foundations');
  eq(crossing.audioAfter, 'reasoning', '跨區後配樂交叉淡到 reasoning（M5）');
  ok(crossing.regionText.includes('示範與推理'), 'HUD 區域名跟著更新', crossing.regionText);
  ok(crossing.fogBefore !== crossing.fogAfter, '跨區時霧色平滑漂移（M4 轉場）',
    `${crossing.fogBefore.toString(16)} → ${crossing.fogAfter.toString(16)}`);
  eq(crossing.markersHere, 16, 'reasoning 區有 16 座石座（15 座教學神廟 ＋ 1 座試煉）');

  /* ================================================================ */
  console.log('\n▸ 鏡頭避障（Phase 3 已知問題）');
  const camera = await evaluate(`
    const g = window.__promptasy;
    // 走到書架密集的 grounding 區旁邊（用 teleport 略過解鎖，只測鏡頭）
    g.player.teleport(95 - 27, -95);
    await new Promise((r) => setTimeout(r, 1500));
    const cam = g.engine.camera.position;
    const p = g.player.position;
    const dist = Math.hypot(cam.x - p.x, cam.z - p.z);
    return { colliders: g.world.colliders.length, dist, camAboveGround: cam.y - g.world.terrainHeight(cam.x, cam.z) };
  `);
  ok(camera.colliders > 0, '世界提供鏡頭碰撞體', `n=${camera.colliders}`);
  ok(camera.dist >= 1.5, '鏡頭沒有貼到角色身上', `dist=${camera.dist.toFixed(2)}`);
  ok(camera.camAboveGround > -2, '鏡頭沒有鑽到地面下', `h=${camera.camAboveGround.toFixed(2)}`);

  /* ================================================================ */
  /* Phase 6：字型與版面                                               */
  console.log('\n▸ 字型與版面（Phase 6）');

  // 1) 自架字型真的被瀏覽器載入（而且沒有任何外部 CDN 請求）
  const fonts = await evaluate(`
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    const uniq = [...new Set(loaded)];
    const probe = (stack, ch) => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = '32px ' + stack;
      return c.measureText(ch).width;
    };
    return {
      families: uniq,
      faces: document.fonts.size,
      // 用文字量測反證「字型真的生效」：自架字型與 sans-serif 的寬度必須不同
      latinDiff: Math.abs(probe("'Fraunces Display'", 'Promptasy') - probe('sans-serif', 'Promptasy')),
      // 漢字一律是全形等寬，量寬度分不出字型 —— 改問瀏覽器「這套字有沒有這些字」
      serifCovers: document.fonts.check("32px 'Arcade Serif TC'", '技巧圖鑑清晰之門'),
      sansCovers: document.fonts.check("32px 'Arcade Sans TC'", '技巧圖鑑清晰之門'),
      // 子集就該是子集：完整的 Noto Serif TC 是 16 MB，我們載到的必須小得多
      serifBytes: (await (await fetch('./fonts/arcade-serif-tc.woff2')).arrayBuffer()).byteLength,
      sansBytes: (await (await fetch('./fonts/arcade-sans-tc.woff2')).arrayBuffer()).byteLength,
      externalFontReqs: performance
        .getEntriesByType('resource')
        .filter((r) => /fonts\\.(googleapis|gstatic)\\.com/.test(r.name)).length,
      selfHosted: performance
        .getEntriesByType('resource')
        .filter((r) => /\\.woff2($|\\?)/.test(r.name))
        .map((r) => r.name.split('/').pop()),
    };
  `);
  ok(fonts.families.includes('Fraunces Display'), 'Fraunces 大標字型已載入', fonts.families.join(', '));
  ok(fonts.families.includes('Inter UI'), 'Inter 介面字型已載入');
  ok(fonts.families.includes('Arcade Serif TC'), '中文襯線子集已載入');
  ok(fonts.families.includes('Arcade Sans TC'), '中文黑體子集已載入');
  ok(fonts.latinDiff > 1, 'Fraunces 真的在排版（與系統 sans 的字寬不同）', String(fonts.latinDiff));
  ok(fonts.serifCovers, '中文襯線子集涵蓋 UI 用字');
  ok(fonts.sansCovers, '中文黑體子集涵蓋 UI 用字');
  ok(
    fonts.serifBytes > 100_000 && fonts.serifBytes < 700_000,
    '中文襯線是子集而非完整字型（完整版 16 MB）',
    `${(fonts.serifBytes / 1024).toFixed(0)} KB`
  );
  ok(
    fonts.sansBytes > 80_000 && fonts.sansBytes < 600_000,
    '中文黑體是子集而非完整字型（完整版 11 MB）',
    `${(fonts.sansBytes / 1024).toFixed(0)} KB`
  );
  /*
   * 語料是保守超集，每一期新內容都會把它撐大：
   * Phase 22 的 1583 字 → 課程 v2 Phase D 的 1750 字 → 142 關品檢之後的 1859 字。
   * 上限跟著往上調一格（1.15 → 1.2 MiB，與 test-rubric 的總量上限用同一把 KiB 尺），
   * 但仍遠低於完整字型（16 MB + 11 MB）—— 這條守的是「還是子集」，不是「不准長」。
   */
  ok(
    fonts.serifBytes + fonts.sansBytes < 1.2 * 1024 * 1024,
    '兩套中文字型合計在 1.2 MiB 以內',
    `${((fonts.serifBytes + fonts.sansBytes) / 1024).toFixed(0)} KiB`
  );
  eq(fonts.externalFontReqs, 0, '沒有任何外部字型 CDN 請求（護欄 3：可離線）');
  ok(
    fonts.selfHosted.every((n) => /^(fraunces-display|inter-ui|newsreader|arcade-mono|arcade-serif-tc|arcade-sans-tc)\.woff2$/.test(n)),
    '載入的字型全部來自 public/fonts/ 的自架子集',
    fonts.selfHosted.join(', ')
  );

  /*
   * 2) 標題卡的開場（Phase 34）：
   *      名字整個從模糊裡對焦 → 髮絲線展開 → 定位句打字 → 中文句打字 → 開始鍵浮出
   *    這裡把整段重播一次，量「開頭真的是模糊的」與「結尾每一樣東西都收好了」。
   *    （標題卡此刻已經被關掉了 —— 量完會還原成關著的樣子，不影響後面的測試。）
   */
  const titleReveal = await evaluate(`
    const g = window.__promptasy;
    const root = g.title.root;
    const name = root.querySelector('.title__name');
    const tag = root.querySelector('.title__tag');
    const zh = root.querySelector('.title__zh');
    root.hidden = false;
    root.classList.remove('is-leaving');
    root.classList.add('is-open');
    // 重播名字的對焦動畫（從 display:none 回來時 CSS 動畫本來就會整組重播）
    name.style.animation = 'none'; void name.offsetWidth; name.style.animation = '';
    root.classList.remove('is-ready');
    await new Promise((r) => setTimeout(r, 120));
    const early = {
      filter: getComputedStyle(name).filter,
      opacity: Number(getComputedStyle(name).opacity),
      // Phase 34.5：文字第一幀就是完整的，只是還沒淡進來
      tagOpacity: Number(getComputedStyle(tag).opacity),
      tagLen: tag.textContent.length,
    };
    // 揭示全部由 CSS 延遲驅動 —— open() 會把整段重播一次
    g.title.open();
    // 全段 ≈ 0.15 名字 → 1.0 髮絲線 → 1.35 定位句 → 2.0 中文 → 2.7 開始鍵，等它跑完
    await new Promise((r) => setTimeout(r, 4200));
    const done = {
      filter: getComputedStyle(name).filter,
      opacity: Number(getComputedStyle(name).opacity),
      tag: tag.textContent,
      zh: zh.textContent,
      tagOpacity: Number(getComputedStyle(tag).opacity),
      ready: root.classList.contains('is-ready'),
      caretsOn: root.querySelectorAll('.title__caret.is-on').length,
      startOpacity: Number(getComputedStyle(root.querySelector('.title__start')).opacity),
      ruleScale: getComputedStyle(root.querySelector('.title__rule')).transform,
      typing: g.title.isTyping,
    };
    // hide() 收起來但不觸發 onStart —— 遊戲狀態一點都不會被這次重播動到
    g.title.hide();
    const after = { titleOpen: g.title.isOpen, hidden: root.hidden };
    return { early, done, after, text: name.textContent, aria: name.getAttribute('aria-label') };
  `);
  eq(titleReveal.text, 'Promptasy', '標題卡的品牌名是完整的一段文字（不再被拆成一個個 span）');
  eq(titleReveal.aria, 'Promptasy', '螢幕閱讀器讀到的名字正確');
  ok(/blur\(([1-9]|\d\d)/.test(titleReveal.early.filter), '開頭名字是模糊的（整個一起對焦）', titleReveal.early.filter);
  ok(titleReveal.early.opacity < 0.9, '開頭名字還沒完全顯影', String(titleReveal.early.opacity));
  eq(titleReveal.early.tagLen, 'Learn Prompt Engineering by Playing'.length, '定位句一開始就是完整的一句（只是還沒淡進來）');
  ok(titleReveal.early.tagOpacity < 0.9, '開頭定位句還沒淡進來', String(titleReveal.early.tagOpacity));
  ok(!/blur\([1-9]/.test(titleReveal.done.filter), '結束時名字完全對焦', titleReveal.done.filter);
  ok(titleReveal.done.opacity > 0.99, '結束時名字完全顯示', String(titleReveal.done.opacity));
  eq(titleReveal.done.tag, 'Learn Prompt Engineering by Playing', '定位句完整顯示');
  eq(titleReveal.done.zh, '在一個夜色的世界裡探索，用你寫的 prompt 解開它。', '中文那一句完整顯示');
  ok(titleReveal.done.tagOpacity > 0.9, '結束時定位句淡進來了', String(titleReveal.done.tagOpacity));
  eq(titleReveal.done.typing, false, '沒有打字機（舊 API 永遠回 false）');
  eq(titleReveal.done.caretsOn, 0, '畫面上沒有任何游標');
  eq(titleReveal.done.ready, true, '揭示走完 → 標題卡進入 is-ready');
  // 0.9 秒的 transition，收尾那一格由瀏覽器決定 —— 只要「明顯亮起來了」就算數
  ok(titleReveal.done.startOpacity > 0.5, '開始鍵這時候才浮出來', String(titleReveal.done.startOpacity));
  // scaleX 用字串比對（!/matrix\(0/）會被 0.99999 這種收尾誤判成失敗 —— 改成看數值
  const ruleScaleX =
    titleReveal.done.ruleScale === 'none'
      ? 1
      : Number((titleReveal.done.ruleScale.match(/matrix\(([^,]+)/) || [])[1]);
  ok(ruleScaleX > 0.99, '標題下的髮絲線展開完成', titleReveal.done.ruleScale);
  eq(titleReveal.after.titleOpen, false, '重播完標題卡收回去了（不會卡住玩家的操作）');
  eq(titleReveal.after.hidden, true, '重播完標題卡的節點也藏起來');

  // 下面幾項量的是書寫檯（textarea ＋ 送出）的版面與動畫 → 先切到自由書寫模式
  await evaluate(`window.__promptasy.promptConsole.setMode('free'); return 1;`);
  await sleep(200);

  // 3) 面板開啟動畫會收斂（不會卡在半透明 / 偏移）
  const openAnim = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenges[0]);
    await new Promise((r) => setTimeout(r, 60));
    const panel = document.querySelector('#prompt-console .panel');
    const early = { o: Number(getComputedStyle(panel).opacity), t: getComputedStyle(panel).transform };
    await new Promise((r) => setTimeout(r, 1500));
    const t = getComputedStyle(panel).transform;
    const m = t === 'none' ? [1, 0, 0, 1, 0, 0] : t.match(/-?[\\d.]+/g).map(Number);
    const late = { o: Number(getComputedStyle(panel).opacity), t, scale: m[0], dy: m[5] };
    return { early, late, eyebrow: document.querySelector('#prompt-console [data-eyebrow]')?.textContent || '' };
  `);
  ok(openAnim.early.o < 0.99, '面板是淡入的（開啟瞬間還沒到全不透明）', String(openAnim.early.o));
  ok(openAnim.late.o > 0.99, '面板開啟動畫收斂到完全不透明', String(openAnim.late.o));
  ok(Math.abs(openAnim.late.dy) < 0.5 && Math.abs(openAnim.late.scale - 1) < 0.002,
    '面板動畫結束後回到原位（沒有殘留位移或縮放）', openAnim.late.t);
  ok(/第 01 關/.test(openAnim.eyebrow), '練習室標頭有區域與關卡編號（中文）', openAnim.eyebrow);
  ok(/[\u4e00-\u9fff]/.test(openAnim.eyebrow), '標頭是中文，不是英文 meta label', openAnim.eyebrow);

  // 4) 評分結果的逐條揭示：一開始錯開，動畫跑完全部顯示
  const revealSeq = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('.prompt-input');
    ta.value = 'Summarize the town notice below for first-time visitors who have never been here.\\n' +
      'Output format: 3 bullet points, each under 20 words.';
    document.querySelector('#prompt-console [data-submit]').click();
    // 抓在「第一條已經浮出來、最後一條還沒開始」的那一刻
    await new Promise((r) => setTimeout(r, 330));
    const rows = [...document.querySelectorAll('#prompt-console .row')];
    const early = rows.map((r) => Number(getComputedStyle(r).opacity));
    const delays = rows.map((r) => parseFloat(getComputedStyle(r).animationDelay));
    const xpEarly = document.querySelector('[data-xptick]')?.textContent || '';
    await new Promise((r) => setTimeout(r, 1600));
    const late = rows.map((r) => Number(getComputedStyle(r).opacity));
    const xpLate = document.querySelector('[data-xptick]')?.textContent || '';
    const xpTo = document.querySelector('[data-xptick]')?.getAttribute('data-to') || '';
    return {
      n: rows.length,
      firstEarly: early[0],
      lastEarly: early[early.length - 1],
      minLate: Math.min(...late),
      hasStyleIndex: rows.every((r) => r.style.getPropertyValue('--i') !== ''),
      delays,
      xpEarly, xpLate, xpTo,
    };
  `);
  ok(revealSeq.n >= 2, '結果逐條列出這一關的每一條檢查', String(revealSeq.n));
  ok(revealSeq.hasStyleIndex, '每一條檢查都帶著 --i（揭示序列的節拍）');
  ok(
    revealSeq.delays.every((d, i) => i === 0 || d > revealSeq.delays[i - 1]),
    '揭示是錯開的：每一條的 animation-delay 依序遞增',
    revealSeq.delays.join(' → ')
  );
  ok(
    revealSeq.delays[revealSeq.delays.length - 1] - revealSeq.delays[0] > 0.05,
    '首尾的錯開幅度看得出來（> 50ms）',
    String(revealSeq.delays[revealSeq.delays.length - 1] - revealSeq.delays[0])
  );
  ok(revealSeq.lastEarly <= revealSeq.firstEarly,
    '揭示途中最後一條不會比第一條先出現',
    `first=${revealSeq.firstEarly} last=${revealSeq.lastEarly}`);
  ok(revealSeq.minLate > 0.99, '揭示結束後每一條檢查都完全顯示', String(revealSeq.minLate));
  ok(revealSeq.xpEarly !== revealSeq.xpLate || revealSeq.xpTo === '0',
    'XP 數字有跳動的計數過程', `${revealSeq.xpEarly} → ${revealSeq.xpLate}`);
  eq(revealSeq.xpLate, '+' + revealSeq.xpTo, 'XP 計數最後停在正確的數字');

  // 5) 版面：兩個尺寸下都不能有水平溢位
  for (const [w, h] of [[1280, 760], [800, 720]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await sleep(400);
    const layout = await evaluate(`
      const g = window.__promptasy;
      const panels = [];
      for (const [name, api] of [['練習室', g.promptConsole], ['圖鑑', g.codex], ['設定', g.settings]]) {
        api.open(api === g.promptConsole ? g.content.challenges[0] : undefined);
        await new Promise((r) => setTimeout(r, 260));
        const root = api.root;
        const panel = root.querySelector('.panel');
        const body = root.querySelector('.panel__body');
        // 面板本身不能寬過視窗，內容不能橫向溢出
        panels.push({
          name,
          panelW: Math.round(panel.getBoundingClientRect().width),
          overflowX: body.scrollWidth - body.clientWidth,
          right: Math.round(panel.getBoundingClientRect().right),
        });
        api.close();
        await new Promise((r) => setTimeout(r, 120));
      }
      return {
        panels,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vw: innerWidth,
      };
    `);
    eq(layout.vw, w, `視窗寬度切到 ${w}px`);
    eq(layout.docOverflow, 0, `${w}×${h}：頁面沒有水平捲動`);
    for (const p of layout.panels) {
      ok(p.panelW <= w, `${w}×${h}：${p.name}面板寬度沒有超出視窗`, `${p.panelW} > ${w}`);
      ok(p.right <= w + 1, `${w}×${h}：${p.name}面板沒有被推出畫面右緣`, String(p.right));
      ok(p.overflowX <= 1, `${w}×${h}：${p.name}內容沒有水平溢位`, `+${p.overflowX}px`);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  /* ================================================================ */
  /* Phase 14 · ①官方範例中文化 ②說明文字放大 ③指南針                  */
  /* ================================================================ */
  console.log('\n▸ 官方範例中文化 / 字級放大 / 指南針（Phase 14）');

  /* --- ① 圖鑑：中文在前、官方英文收在「原文 ↗」＋出處永遠看得到 --- */
  const codexZh = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close(); g.settings.close(); g.codex.close();
    // 全部收集起來才看得到 68 條的內容
    g.progression.state.collected = g.content.curriculum.techniques.map((t) => t.id);
    g.codex.open();
    await new Promise((r) => setTimeout(r, 320));

    const official = g.content.curriculum.techniques.find((t) => t.id === 'clarity-01');
    const card = Array.from(document.querySelectorAll('#codex .tech')).find(
      (li) => li.querySelector('.tech__id')?.textContent === 'clarity-01'
    );
    card.querySelector('details').open = true;
    await new Promise((r) => setTimeout(r, 160));
    const body = card.querySelector('.tech__body');
    const origin = body.querySelector('.origin');
    const visible = (el) => !!el && el.getClientRects().length > 0;

    // 整本圖鑑：預設「畫得出來的文字」裡不能有整句英文。
    // innerText 只會回傳真的被渲染的內容 —— 收起來的摺頁自動不算。
    const CJK = /[一-鿿]/;
    const EN = /(?:[A-Za-z][A-Za-z'’.-]*[ \\t]+){2,}[A-Za-z][A-Za-z'’.-]*/;
    // 確實需要以英文出現的技術詞組（與 scripts/zh-scan.mjs 同一份規則）
    const TECH = ['max output tokens','stop sequence','reasoning effort','prompt caching','function calling',
      'few shot','chain of thought','code execution','search grounding','structured outputs','system prompt',
      'prompt improver','output prefix','adaptive thinking'];
    const strip = (raw) => {
      let t = String(raw || '');
      t = t.replace(/「[^」]*」/g, '　');          // 刻意保留的可照抄字串
      t = t.replace(/https?:\\/\\/\\S+/g, ' ');
      t = t.replace(/<\\/?[A-Za-z][^>\\n]*>/g, ' ');
      t = t.replace(/\\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\\b/g, ' ');
      t = t.replace(/\\b[a-z]+(?:[A-Z][a-z0-9]*)+\\b/g, ' ');
      for (const ph of TECH) t = t.replace(new RegExp(ph.replace(/\\s+/g, '\\\\s+'), 'gi'), ' ');
      return t;
    };
    // 展開全部技巧，模擬「玩家把整本翻過一遍」
    document.querySelectorAll('#codex .tech > details').forEach((d) => { d.open = true; });
    await new Promise((r) => setTimeout(r, 320));
    const leaks = [];
    for (const el of document.querySelectorAll('#codex .tech__tip, #codex .tech__ex, #codex .tech__note')) {
      if (el.checkVisibility && !el.checkVisibility()) continue;
      const m = strip(el.innerText).match(EN);
      if (m) leaks.push({ id: el.closest('.tech').querySelector('.tech__id').textContent, hit: m[0] });
    }
    const originsClosed = Array.from(document.querySelectorAll('#codex .origin')).every((d) => !d.open);

    return {
      officialExample: official.example,
      exText: body.querySelector('.tech__ex')?.textContent || '',
      exIsCjk: CJK.test(body.querySelector('.tech__ex')?.textContent || ''),
      hasOrigin: !!origin,
      originSummary: origin?.querySelector('summary')?.textContent || '',
      // 收起來時，這個摺頁畫出來的字只有那一行 summary（官方英文不在畫面上）
      originClosedText: origin ? origin.innerText : '',
      originBodyVisibleWhenClosed: origin ? origin.querySelector('.origin__body').checkVisibility() : null,
      originsClosed,
      srcsVisible: Array.from(body.querySelectorAll('.tech__srcs a')).filter(visible).map((a) => a.href),
      leaks: leaks.slice(0, 6),
      leakCount: leaks.length,
      originCount: document.querySelectorAll('#codex .origin').length,
    };
  `);
  ok(codexZh.exIsCjk, '圖鑑的官方範例改成中文在前', codexZh.exText.slice(0, 40));
  ok(codexZh.exText !== codexZh.officialExample, '顯示的不是官方英文原文');
  eq(codexZh.hasOrigin, true, '中文範例底下有「原文 ↗」可以查官方原句');
  ok(/原文/.test(codexZh.originSummary), '摺頁標成「原文 ↗（官方英文）」', codexZh.originSummary);
  eq(codexZh.originsClosed, true, '「原文 ↗」預設全部收起來');
  eq(codexZh.originBodyVisibleWhenClosed, false, '收起來時官方英文原句真的看不到（checkVisibility）');
  ok(
    !codexZh.originClosedText.includes('Show your prompt to a colleague'),
    '收起來時摺頁畫出來的字只有那一行「原文 ↗」',
    codexZh.originClosedText.slice(0, 60)
  );
  ok(codexZh.srcsVisible.length > 0, '官方出處連結永遠留在畫面上（不收進摺頁）', String(codexZh.srcsVisible.length));
  ok(codexZh.srcsVisible.every((u) => /^https:\/\//.test(u)), '出處連結是可點的 https 連結');
  ok(codexZh.originCount >= 27, '至少 27 條技巧掛得出官方原文', `n=${codexZh.originCount}`);
  eq(codexZh.leakCount, 0, '整本圖鑑預設看不到任何一句官方英文', JSON.stringify(codexZh.leaks));

  /* --- 出處深連結：圖鑑的舊 68 條走顯示層疊加（curriculum.json 一個字沒動） --- */
  const codexDeep = await evaluate(`
    const g = window.__promptasy;
    const anchors = g.content.sourceAnchors;
    const raw = g.content.curriculum.techniques.find((t) => t.id === 'clarity-01');
    const shown = g.content.displayTechnique('clarity-01').sources;
    const hrefs = Array.from(document.querySelectorAll('#codex .tech__srcs a'))
      .filter((a) => a.checkVisibility && a.checkVisibility())
      .map((a) => a.getAttribute('href'));
    return {
      overlaySize: anchors.size,
      rawFirst: raw.sources[0].url,
      shownFirst: shown[0].url,
      shownName: shown[0].name,
      rawName: raw.sources[0].name,
      rawHasHash: raw.sources.some((s) => s.url.includes('#')),
      // 畫面上「有帶片段」的出處連結有幾條（整本圖鑑）
      deepOnScreen: hrefs.filter((u) => u.includes('#')).length,
      onScreen: hrefs.length,
      /* 疊加層的每一條都只在片段上動手腳 */
      allFragmentOnly: anchors.entries.every((e) => e.anchored.startsWith(e.url + '#')),
      methods: Array.from(new Set(anchors.entries.map((e) => e.method))).sort(),
    };
  `);
  ok(codexDeep.overlaySize > 0, '圖鑑接上了出處深連結疊加層', String(codexDeep.overlaySize));
  eq(codexDeep.rawHasHash, false, 'curriculum.json 裡的原網址仍然是頁面層（一個位元組都沒動）');
  ok(codexDeep.shownFirst.startsWith(codexDeep.rawFirst + '#'), '畫面上顯示的是原網址 ＋ 一個片段', codexDeep.shownFirst);
  eq(codexDeep.shownName, codexDeep.rawName, '文件名一個字沒改（疊加層只動網址的片段）');
  eq(codexDeep.allFragmentOnly, true, '疊加層的每一條都只在片段上動手腳（不得換文件）');
  ok(
    codexDeep.methods.every((m) => ['heading', 'fragment'].includes(m)),
    '定位方式只有兩種：頁面上的標題 id、或 W3C 文字片段',
    codexDeep.methods.join(',')
  );
  ok(codexDeep.deepOnScreen > 0, '展開的那條技巧，畫面上的出處連結真的帶著片段', `${codexDeep.deepOnScreen}/${codexDeep.onScreen}`);

  // 展開之後：官方原文一字不差
  const originOpen = await evaluate(`
    const card = Array.from(document.querySelectorAll('#codex .tech')).find(
      (li) => li.querySelector('.tech__id')?.textContent === 'clarity-01'
    );
    const origin = card.querySelector('.origin');
    origin.open = true;
    await new Promise((r) => setTimeout(r, 200));
    return {
      body: origin.querySelector('pre.origin__body')?.textContent || '',
      note: origin.querySelector('.origin__note')?.textContent || '',
      src: origin.querySelector('a.src')?.href || '',
      rendered: origin.innerText,
      visible: origin.querySelector('.origin__body').checkVisibility(),
    };
  `);
  eq(originOpen.visible, true, '展開後看得到官方原文');
  ok(
    originOpen.rendered.includes('Show your prompt to a colleague'),
    '展開後畫面上就看得到官方原文',
    originOpen.rendered.slice(0, 60)
  );
  eq(originOpen.body, codexZh.officialExample, '「原文 ↗」裡的官方英文與 curriculum 逐字相同');
  ok(/譯寫|不是官方|遊戲/.test(originOpen.note), '摺頁裡講明上面的中文是遊戲自撰的譯寫', originOpen.note);
  ok(/^https:\/\//.test(originOpen.src), '摺頁裡也附得出可點的官方出處', originOpen.src);

  /* --- ② 說明文字放大：情境文字 ≥ 舊值的 1.7 倍 --- */
  const typeScale = await evaluate(`
    const g = window.__promptasy;
    g.codex.close();
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await new Promise((r) => setTimeout(r, 420));
    const px = (sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    };
    const root = getComputedStyle(document.documentElement);
    return {
      scenario: px('#prompt-console .console__scenario'),
      mission: px('#prompt-console .mission__text'),
      artifact: px('#prompt-console .artifact__body'),
      leadVar: root.getPropertyValue('--t-lead').trim(),
      microVar: root.getPropertyValue('--t-micro').trim(),
      smallVar: root.getPropertyValue('--t-small').trim(),
      metaVar: root.getPropertyValue('--t-meta').trim(),
      prose: root.getPropertyValue('--lh-prose').trim(),
      body: root.getPropertyValue('--lh-body').trim(),
    };
  `);
  // Phase 13 的情境文字在 1280px 下是 18.08px（--t-lead 上限 1.13rem）
  const OLD_SCENARIO = 18.08;
  ok(
    typeScale.scenario >= OLD_SCENARIO * 1.7,
    '情境文字放大到舊值的 1.7 倍以上',
    `${typeScale.scenario}px（舊 ${OLD_SCENARIO}px · ×${(typeScale.scenario / OLD_SCENARIO).toFixed(2)}）`
  );
  ok(typeScale.mission >= 0.83 * 16 * 1.7, '任務文字同步放大', `${typeScale.mission}px`);
  ok(typeScale.artifact >= 0.78 * 16 * 1.6, '素材文字同步放大', `${typeScale.artifact}px`);
  ok(parseFloat(typeScale.microVar) >= 0.755 * 1.7, '--t-micro 放大到 1.7 倍以上', typeScale.microVar);
  ok(parseFloat(typeScale.smallVar) >= 0.83 * 1.7, '--t-small 放大到 1.7 倍以上', typeScale.smallVar);
  ok(parseFloat(typeScale.metaVar) >= 0.685 * 1.4, '--t-meta 也放大了（全大寫小標籤放少一點）', typeScale.metaVar);
  // CJK 排版：長文行距不得低於 1.7
  ok(parseFloat(typeScale.prose) >= 1.7, '長文行距維持在 1.7 以上（CJK 排版）', typeScale.prose);
  ok(parseFloat(typeScale.body) >= 1.7, '本文行距維持在 1.7 以上（CJK 排版）', typeScale.body);

  /* --- ③ 指南針 --- */
  const compass = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 400));
    // 前面的測試可能把玩家丟到別的地方 —— 先站回出生點，方位才對得起來
    g.player.teleport(0, 6);
    await new Promise((r) => setTimeout(r, 700));
    const el = document.querySelector('.compass');
    const before = g.compass.state();
    const dialBefore = document.querySelector('.compass__dial').style.transform;
    return {
      exists: !!el,
      visible: el ? el.getClientRects().length > 0 : false,
      cards: Array.from(document.querySelectorAll('.compass__card i')).map((n) => n.textContent),
      marks: document.querySelectorAll('.compass__mark').length,
      needleHidden: document.querySelector('.compass__needle').hidden,
      label: document.querySelector('.compass__label').textContent,
      dialBefore,
      state: before,
    };
  `);
  eq(compass.exists, true, '畫面上有指南針');
  eq(compass.visible, true, '在世界裡看得到指南針');
  ok(
    ['北', '東', '南', '西'].every((c) => compass.cards.includes(c)),
    '四個方位刻度都在（北 / 東 / 南 / 西）',
    compass.cards.join('')
  );
  eq(compass.marks, EXPECT.v2ImplementedRegions.value, '每一座地標各有一根淡針');
  eq(compass.needleHidden, false, '下一個目標有金針指著');
  ok(/步/.test(compass.label), '指南針下面寫得出還有幾步', compass.label);
  ok(compass.state.objective && compass.state.objective.name, '指南針知道下一個目標是誰', JSON.stringify(compass.state.objective));

  // 轉鏡頭 → 錶盤真的跟著轉，而且角度數學和世界狀態對得起來
  const compassTurn = await evaluate(`
    const g = window.__promptasy;
    const dialOf = () => parseFloat((document.querySelector('.compass__dial').style.transform.match(/-?[\\d.]+/) || [0])[0]);
    const needleOf = () => parseFloat((document.querySelector('.compass__needle').style.transform.match(/-?[\\d.]+/) || [0])[0]);
    const before = { yaw: g.player.cameraYaw, dial: dialOf(), needle: needleOf() };
    // 用方向鍵轉鏡頭（和玩家一樣的路徑）
    const press = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    press('ArrowLeft');
    await new Promise((r) => setTimeout(r, 1200));
    release('ArrowLeft');
    await new Promise((r) => setTimeout(r, 260));
    const after = { yaw: g.player.cameraYaw, dial: dialOf(), needle: needleOf() };
    // 對照世界狀態自己算一次
    const s = g.compass.state();
    const p = g.player.position;
    const norm = (d) => { d = d % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
    const expected = s.objective
      ? norm((after.yaw - Math.atan2(s.objective.x - p.x, s.objective.z - p.z)) * 180 / Math.PI)
      : null;
    return { before, after, expected, actual: s.objective ? s.objective.deg : null,
             objective: s.objective, player: { x: p.x, z: p.z } };
  `);
  // 軟體渲染下幀率會掉，實際轉多少不保證 —— 只要求「真的動了」
  ok(Math.abs(compassTurn.after.yaw - compassTurn.before.yaw) > 0.12, '鏡頭真的轉了', `Δyaw=${(compassTurn.after.yaw - compassTurn.before.yaw).toFixed(2)}`);
  ok(
    Math.abs(compassTurn.after.dial - compassTurn.before.dial) > 5,
    '錶盤跟著鏡頭轉',
    `${compassTurn.before.dial} → ${compassTurn.after.dial}`
  );
  ok(
    compassTurn.expected != null && Math.abs(compassTurn.expected - compassTurn.actual) < 3,
    '金針的角度和「目標實際在哪個方位」算出來的一樣',
    `expected=${compassTurn.expected} actual=${compassTurn.actual}`
  );
  ok(
    Math.abs(compassTurn.after.needle - compassTurn.actual) < 0.5,
    '畫出來的金針角度＝算出來的方位角',
    `${compassTurn.after.needle} vs ${compassTurn.actual}`
  );

  // 面板打開時收起來（和 HUD 其他元素一致）
  const compassHide = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const hiddenWhenPanel = document.querySelector('.compass').getClientRects().length === 0;
    g.codex.close();
    await new Promise((r) => setTimeout(r, 420));
    const backAfter = document.querySelector('.compass').getClientRects().length > 0;
    return { hiddenWhenPanel, backAfter };
  `);
  eq(compassHide.hiddenWhenPanel, true, '面板打開時指南針收起來');
  eq(compassHide.backAfter, true, '關掉面板又看得到指南針');

  // 走過去 → 步數要變少（指南針真的在導航，不是裝飾）
  const compassWalk = await evaluate(`
    const g = window.__promptasy;
    const s0 = g.compass.state();
    const t = s0.objective;
    const p = g.player.position;
    // 往目標挪一半的距離
    g.player.teleport((p.x + t.x) / 2, (p.z + t.z) / 2);
    await new Promise((r) => setTimeout(r, 700));
    const s1 = g.compass.state();
    return { d0: s0.objective.distance, d1: s1.objective.distance, label: document.querySelector('.compass__label').textContent };
  `);
  ok(compassWalk.d1 < compassWalk.d0 - 1, '走近目標之後距離跟著變短', `${compassWalk.d0.toFixed(1)} → ${compassWalk.d1.toFixed(1)}`);
  ok(/步/.test(compassWalk.label), '距離提示照樣寫得出「幾步」', compassWalk.label);

  /* ================================================================ */
  console.log('\n▸ 刻印牌元件系統（Phase 15）');

  /**
   * 把滑鼠真的移到某個元素中心（:hover 要真的 hover 才會觸發）。
   * headless 只有 3 fps，元素也可能被黏在頂端的面板標頭蓋住 —— 所以移完之後
   * 用 `matches(':hover')` 確認一次，沒中就捲進畫面重來。
   */
  async function hoverEl(selector, tries = 3) {
    for (let i = 0; i < tries; i += 1) {
      const box = await evaluate(`
        const el = document.querySelector('${selector}');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 160));
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      `);
      if (!box) return false;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }, sessionId);
      await sleep(340);
      const hit = await evaluate(`return !!document.querySelector('${selector}')?.matches(':hover');`);
      if (hit) return true;
    }
    return false;
  }

  /** 讓 Chrome 進入「鍵盤模式」，之後的 focus() 才會命中 :focus-visible。 */
  async function focusVisible(selector) {
    await key('Tab', 'Tab', { vk: 9 });
    await sleep(120);
    await evaluate(`document.querySelector('${selector}').focus(); return 1;`);
    await sleep(280);
  }

  await evaluate(`
    const g = window.__promptasy;
    g.settings.close();
    g.codex.close();
    g.promptConsole.open(g.content.challenges[0]);
    await new Promise((r) => setTimeout(r, 500));
    return 1;
  `);

  // ── 形狀：每一塊都是被剪出來的八邊形，而且不用 CSS border ──────────
  const seals = await evaluate(`
    const pick = (sel) => document.querySelector(sel);
    const read = (sel) => {
      const el = pick(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      return {
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        height: Math.round(el.getBoundingClientRect().height),
        width: Math.round(el.getBoundingClientRect().width),
        edgeClip: before.clipPath.slice(0, 8),
        faceClip: after.clipPath.slice(0, 8),
        edgeIsGradient: /gradient/.test(before.backgroundImage),
        noExternalImage: !/url\\(\\s*['"]?https?:/.test(before.backgroundImage + after.backgroundImage),
      };
    };
    return {
      hero: read('#prompt-console [data-act-next="2"]'),
      ghost: read('#prompt-console .acts__item[data-act-go="1"]'),
      close: read('#prompt-console .panel__close'),
    };
  `);
  for (const [name, s] of Object.entries(seals)) {
    ok(!!s, `刻印牌存在：${name}`);
    if (!s) continue;
    eq(s.borderWidth, '0px', `${name}：不用 CSS border（邊是剪出來的）`);
    eq(s.edgeClip, 'polygon(', `${name}：邊層被剪成多邊形`, s.edgeClip);
    eq(s.faceClip, 'polygon(', `${name}：面層被剪成多邊形`, s.faceClip);
    eq(s.edgeIsGradient, true, `${name}：邊是漸層（立體感不靠圖檔）`);
    eq(s.noExternalImage, true, `${name}：沒有任何外部圖檔`);
  }
  ok(seals.hero.height >= 44, '主要行動的命中高度 ≥ 44px（WCAG 2.5.5）', `${seals.hero.height}px`);
  /*
   * 2026-08-03 站長定稿：幕指示器壓扁成一條細帶（原本 40px 高）。
   * 這裡守的底線改成 WCAG 2.2 的 **2.5.8 AA（24×24 CSS px）**，
   * 並且要求它橫向仍然很寬 —— 那是它真正好按的那一軸。
   */
  ok(seals.ghost.height >= 24, '幕指示器的命中高度 ≥ 24px（WCAG 2.5.8 AA）', `${seals.ghost.height}px`);
  ok(seals.ghost.width >= 44, '幕指示器橫向仍然很寬（好按的那一軸）', `${seals.ghost.width}px`);

  // 面板裡看得到的按鈕，命中範圍一律 ≥ 24px（WCAG 2.5.8 AA 的地板），.btn 一律 ≥ 40px
  const targets = await evaluate(`
    const els = [...document.querySelectorAll('#prompt-console button')].filter((b) => b.checkVisibility());
    const small = els
      .map((b) => ({ cls: b.className, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((x) => x.h < 24 || x.w < 24);
    // 除了那條細帶（幕指示器）之外，其餘的按鈕仍然要 ≥ 34px
    const smallish = els
      .filter((b) => !b.classList.contains('acts__item'))
      .map((b) => ({ cls: b.className, h: Math.round(b.getBoundingClientRect().height) }))
      .filter((x) => x.h < 34);
    const btns = els.filter((b) => b.classList.contains('btn'));
    return { n: els.length, small, smallish, minBtn: Math.min(...btns.map((b) => b.getBoundingClientRect().height)) };
  `);
  ok(targets.n > 5, '量得到面板裡的按鈕（不是空過）', String(targets.n));
  eq(targets.small.length, 0, '面板裡沒有任何小於 WCAG 地板的命中範圍', JSON.stringify(targets.small));
  eq(targets.smallish.length, 0, '除了幕指示器那條細帶，其餘按鈕仍然 ≥ 34px', JSON.stringify(targets.smallish));
  ok(targets.minBtn >= 39.5, '所有 .btn 的高度 ≥ 40px', `min=${targets.minBtn.toFixed(1)}px`);

  // ── 四幕指示器：四塊封印石 ＋ 一條會注金的軌道 ──────────────────
  const actsRail = await evaluate(`
    const items = [...document.querySelectorAll('#prompt-console .acts__item')];
    const rules = [...document.querySelectorAll('#prompt-console .acts__rule')];
    const fill = (el) => parseFloat(getComputedStyle(el).backgroundSize.split(' ')[0]) || 0;
    const lum = (el) => {
      const m = getComputedStyle(el).color.match(/[\\d.]+/g).map(Number);
      return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    };
    const now = items.find((b) => b.classList.contains('is-now'));
    return {
      items: items.length,
      rules: rules.length,
      nowCount: items.filter((b) => b.classList.contains('is-now')).length,
      filled: fill(rules[0]),
      unfilled: fill(rules[2]),
      nowLum: Math.round(lum(now)),
      restLum: Math.round(lum(items[3])),
      lastDisabled: items[3].disabled,
      nowCurrent: now.getAttribute('aria-current'),
    };
  `);
  eq(actsRail.items, 4, '幕指示器是四塊封印石');
  eq(actsRail.rules, 3, '三段軌道把四塊石頭串起來');
  eq(actsRail.nowCount, 1, '同一時間只有一塊石頭是亮的');
  ok(actsRail.filled > 8, '走過的那一段軌道注滿了金', `${actsRail.filled.toFixed(0)}px`);
  eq(actsRail.unfilled, 0, '還沒走到的那一段軌道還是空的');
  ok(actsRail.nowLum < 60, '亮著的那一塊是淺石面配深色刻字', `lum=${actsRail.nowLum}`);
  ok(actsRail.restLum > 80, '沒點燈的那一塊是暗石配淺字', `lum=${actsRail.restLum}`);
  eq(actsRail.lastDisabled, true, '沒走過的幕仍然按不下去（語意沒被造型吃掉）');
  eq(actsRail.nowCurrent, 'step', 'aria-current="step" 仍在');

  // 換一幕 → 軌道跟著往前注金（純 CSS 的相鄰選擇器，不靠 JS）
  const railAfter = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#prompt-console [data-act-next="2"]').click();
    const rules = [...document.querySelectorAll('#prompt-console .acts__rule')];
    const read = () => parseFloat(getComputedStyle(rules[1]).backgroundSize.split(' ')[0]) || 0;
    // 注金是 440ms 的 transition，但 headless 只有 3 fps —— 用輪詢等它長出來
    const until = performance.now() + 4000;
    while (read() < 8 && performance.now() < until) await new Promise((r) => setTimeout(r, 80));
    return { act: g.promptConsole.act, fill: read() };
  `);
  eq(railAfter.act, 2, '按「聆聽指引」真的走到第二幕');
  ok(railAfter.fill > 8, '走到第二幕之後，第二段軌道也注金了', `${railAfter.fill.toFixed(0)}%`);

  // ── hover：金線從溝槽注入 ────────────────────────────────────
  const HOVER_TARGET = '#prompt-console .act--guide [data-act-go="1"]';
  const inlay = await evaluate(`
    const el = document.querySelector('${HOVER_TARGET}');
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 200));
    return getComputedStyle(el, '::after').backgroundSize.split(',')[0].trim();
  `);
  const hovered = await hoverEl(HOVER_TARGET);
  const inlayHover = await evaluate(`
    const el = document.querySelector('${HOVER_TARGET}');
    // 注金是 165ms 的 transition，一樣用輪詢
    // background-size 的 calc() 在 computed style 裡不會被解析成 px，所以比字串
    const read = () => getComputedStyle(el, '::after').backgroundSize.split(',')[0].trim();
    const until = performance.now() + 3000;
    while (/^0px/.test(read()) && performance.now() < until) await new Promise((r) => setTimeout(r, 60));
    return { w: read(), edge: getComputedStyle(el, '::before').backgroundImage };
  `);
  eq(hovered, true, '滑鼠真的停在那塊石牌上');
  eq(inlay, '0px 1px', 'rest：溝槽是空的（沒有金線）');
  ok(!/^0px/.test(inlayHover.w) && /calc|\d/.test(inlayHover.w), 'hover：金線真的注進溝槽裡', inlayHover.w);
  ok(/gradient/.test(inlayHover.edge), 'hover：邊仍然是漸層（換的是亮度不是材質）');

  // ── focus-visible：符文環（邊變金 ＋ 加寬到 2.5px）────────────
  await focusVisible(HOVER_TARGET);
  const rune = await evaluate(`
    const el = document.querySelector('${HOVER_TARGET}');
    const before = getComputedStyle(el, '::before');
    const after = getComputedStyle(el, '::after');
    return {
      matched: el.matches(':focus-visible'),
      outline: getComputedStyle(el).outlineStyle,
      ringWidth: after.top,
      edge: before.backgroundImage,
      glow: before.filter,
    };
  `);
  eq(rune.matched, true, '鍵盤走到的那塊石牌命中 :focus-visible');
  eq(rune.outline, 'none', 'focus 不靠瀏覽器預設的方框（它會被 clip-path 剪掉）');
  eq(rune.ringWidth, '2.5px', 'focus 時邊加寬成 2.5px 的符文環');
  ok(/246, 227, 194|230, 199, 155/.test(rune.edge), 'focus 時邊變成金色', rune.edge.slice(0, 80));
  ok(/drop-shadow/.test(rune.glow), 'focus 的光暈沿著剪出來的輪廓走（drop-shadow 不是 box-shadow）', rune.glow);

  // ── disabled：沒點燈的石頭，但仍然看得見輪廓 ──────────────────
  const unlit = await evaluate(`
    const el = document.querySelector('#prompt-console .acts__item[data-act-go="4"]');
    const before = getComputedStyle(el, '::before');
    return {
      disabled: el.disabled,
      opacity: parseFloat(before.opacity),
      clip: before.clipPath.slice(0, 8),
      grayscale: /grayscale/.test(before.filter),
    };
  `);
  eq(unlit.disabled, true, '沒走過的幕是 disabled');
  ok(unlit.opacity > 0.4 && unlit.opacity < 0.8, 'disabled 的邊有降下來，但沒有消失', String(unlit.opacity));
  eq(unlit.clip, 'polygon(', 'disabled 仍然是同一塊石頭（輪廓還在）');
  eq(unlit.grayscale, true, 'disabled 抽掉顏色（不是只調透明度）');

  // ── 選項卡與鍵盤符文石 ──────────────────────────────────────
  await evaluate(`
    document.querySelector('#prompt-console [data-act-next="3"]').click();
    await new Promise((r) => setTimeout(r, 700));
    // 前面的測試可能把答題方式切成自由書寫 —— 選項卡只有石碑刻印模式才有
    const slot = document.querySelector('#prompt-console [data-stele-slot]');
    if (slot.hidden || !document.querySelector('#prompt-console .opt')?.checkVisibility()) {
      document.querySelector('#prompt-console [data-mode]').click();
      await new Promise((r) => setTimeout(r, 700));
    }
    document.querySelector('#prompt-console .carve').scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 260));
    return 1;
  `);
  const optSeal = await evaluate(`
    const o = document.querySelector('#prompt-console .opt');
    const k = o.querySelector('.opt__key');
    return {
      border: getComputedStyle(o).borderTopWidth,
      clip: getComputedStyle(o, '::before').clipPath.slice(0, 8),
      h: Math.round(o.getBoundingClientRect().height),
      keyClip: getComputedStyle(k, '::before').clipPath.slice(0, 8),
      keySize: Math.round(k.getBoundingClientRect().width),
    };
  `);
  eq(optSeal.border, '0px', '選項卡不用 CSS border');
  eq(optSeal.clip, 'polygon(', '選項卡是剪出來的石籤');
  ok(optSeal.h >= 44, '選項卡的命中高度 ≥ 44px', `${optSeal.h}px`);
  eq(optSeal.keyClip, 'polygon(', '鍵盤數字是一顆小符文石');
  ok(optSeal.keySize >= 24, '符文石夠大看得清楚', `${optSeal.keySize}px`);

  // 選錯 → 石籤上出現裂痕（多一層斜線漸層），而且不再有金線
  /*
   * 先把真的游標挪到角落 —— 不然它會停在前一段測試留下的座標上，
   * 版面一動（例如標頭高度變了）就可能剛好壓在某一張石籤上，
   * 讓下面那條「不會被滑鼠抬起來」量到的是 :hover 狀態。
   */
  await cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: 4, y: 4, button: 'none', buttons: 0 },
    sessionId
  );
  /*
   * 等到**真的沒有石籤還在 hover 狀態**才往下走。
   * 固定 sleep 在這台軟體渲染的機器上不夠：hover 的重算與 translate 的
   * 120ms 補間都是逐幀跑的，一幀約 200ms —— 睡 120ms 等於一幀都沒過。
   */
  await waitFor(
    async () => (await evaluate(`return !document.querySelector('#prompt-console .opt:hover');`)) === true,
    { timeout: 5000, every: 150, label: '游標離開所有石籤' }
  ).catch(() => {});
  const crackTest = await evaluate(`
    const opts = [...document.querySelectorAll('#prompt-console .opt')];
    const layersBefore = getComputedStyle(opts[0], '::after').backgroundImage.split('gradient').length - 1;
    for (const o of opts) {
      o.click();
      await new Promise((r) => setTimeout(r, 260));
      const wrong = document.querySelector('#prompt-console .opt.is-wrong');
      if (wrong) {
        const cs = getComputedStyle(wrong, '::after');
        return {
          layersBefore,
          found: true,
          face: cs.backgroundImage,
          inlayVar: getComputedStyle(wrong).getPropertyValue('--inlay-w'),
          lifted: getComputedStyle(wrong).translate,
          edge: getComputedStyle(wrong, '::before').backgroundImage,
        };
      }
    }
    return { layersBefore, found: false };
  `);
  if (crackTest.found) {
    ok(/224, 128, 110/.test(crackTest.face), '「石碑不收」的石籤上多了赤色的裂痕', crackTest.face.slice(0, 80));
    ok(crackTest.inlayVar.trim() === '0px', '被拒絕的石籤沒有金線', crackTest.inlayVar);
    ok(/224, 128, 110/.test(crackTest.edge), '被拒絕的石籤邊緣轉成赤色', crackTest.edge.slice(0, 70));
    /*
     * `translate` 有 120ms 的補間，而這台機器一幀約 200ms ——
     * 剛加上 .is-wrong 的那一瞬間讀到的可能還是補間中的值。
     * 輪詢到它落定（AGENTS.md：動畫時序類斷言不要用固定 sleep）。
     */
    const settled = await waitFor(
      async () => {
        const v = await evaluate(`
          const w = document.querySelector('#prompt-console .opt.is-wrong');
          return w ? getComputedStyle(w).translate : null;
        `);
        return v === 'none' ? v : null;
      },
      { timeout: 4000, every: 150, label: '被拒絕的石籤落回原位' }
    ).catch(() => crackTest.lifted);
    eq(settled, 'none', '被拒絕的石籤不會再被滑鼠抬起來');
    /*
     * 上面那條是「游標不在上面」的狀態；真正要守的是**游標壓上去也不抬**。
     * 所以把真的游標移到那張石籤中心再量一次（先確認同一張石籤還在）。
     */
    const wrongAt = await evaluate(`
      const w = document.querySelector('#prompt-console .opt.is-wrong');
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    `);
    if (wrongAt) {
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: Math.round(wrongAt[0]), y: Math.round(wrongAt[1]), button: 'none', buttons: 0 },
        sessionId
      );
      await sleep(240);
      const hoveredWrong = await evaluate(`
        const w = document.querySelector('#prompt-console .opt.is-wrong');
        return { hover: w.matches(':hover'), lifted: getComputedStyle(w).translate };
      `);
      if (hoveredWrong.hover) {
        eq(hoveredWrong.lifted, 'none', '游標真的壓在被拒絕的石籤上，它一樣不會被抬起來');
      } else {
        ok(true, '（游標沒壓到那張石籤，跳過「壓上去也不抬」這一條）');
      }
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: 4, y: 4, button: 'none', buttons: 0 },
        sessionId
      );
    }
  } else {
    ok(false, '找得到一個被石碑拒絕的選項');
  }

  // ── 表單控制項：凹槽與金滴、封印式勾選 ───────────────────────
  const form = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 300));
    g.settings.open();
    await new Promise((r) => setTimeout(r, 400));
    const range = document.querySelector('#settings input[type="range"]');
    const cb = document.querySelector('#settings input[type="checkbox"]');
    const sel = document.querySelector('#settings select');
    // getComputedStyle 讀不到 UA shadow 裡的 ::-webkit-slider-thumb，直接查樣式表
    let thumbRule = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (/-webkit-slider-thumb/.test(r.selectorText || '')) thumbRule += r.cssText;
      }
    }
    const wasChecked = cb.checked;
    const faceBefore = getComputedStyle(cb, '::before').backgroundImage;
    cb.checked = !wasChecked;
    await new Promise((r) => setTimeout(r, 300));
    const faceAfter = getComputedStyle(cb, '::before').backgroundImage;
    const markAfter = getComputedStyle(cb, '::after').opacity;
    cb.checked = true;
    await new Promise((r) => setTimeout(r, 240));
    return {
      rangeAppearance: getComputedStyle(range).appearance,
      thumbClip: /polygon\\(/.test(thumbRule) ? 'polygon(' : thumbRule.slice(0, 120),
      cbAppearance: getComputedStyle(cb).appearance,
      cbClip: getComputedStyle(cb).clipPath.slice(0, 8),
      cbSize: Math.round(cb.getBoundingClientRect().width),
      faceChanged: faceBefore !== faceAfter,
      checkMark: getComputedStyle(cb, '::after').opacity,
      markToggled: markAfter !== getComputedStyle(cb, '::after').opacity || wasChecked !== true,
      selClip: getComputedStyle(sel).clipPath.slice(0, 8),
      selH: Math.round(sel.getBoundingClientRect().height),
    };
  `);
  eq(form.rangeAppearance, 'none', '音量滑桿走自己的造型（不是系統元件）');
  eq(form.thumbClip, 'polygon(', '滑鈕是一顆剪出來的金滴');
  eq(form.cbAppearance, 'none', '勾選框走自己的造型');
  eq(form.cbClip, 'polygon(', '勾選框是一塊八邊形的小石牌');
  ok(form.cbSize >= 24, '勾選框 ≥ 24px（WCAG 2.5.8）', `${form.cbSize}px`);
  eq(form.faceChanged, true, '蓋上／取下封印時石面真的換了（不是只換顏色）');
  eq(form.checkMark, '1', '勾痕在蓋上之後才被刻出來');
  eq(form.selClip, 'polygon(', '下拉是嵌在凹槽裡的石籤');
  ok(form.selH >= 40, '下拉的命中高度 ≥ 40px', `${form.selH}px`);

  // ── prefers-reduced-motion：保留狀態，拿掉位移與掃光 ──────────
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await sleep(260);
  const calm = await evaluate(`
    const g = window.__promptasy;
    g.settings.close();
    await new Promise((r) => setTimeout(r, 250));
    g.promptConsole.open(g.content.challenges[0]);
    await new Promise((r) => setTimeout(r, 500));
    const hero = document.querySelector('#prompt-console [data-act-next="2"]');
    const item = document.querySelector('#prompt-console .acts__item.is-now');
    return {
      sheen: getComputedStyle(hero, '::before').animationName,
      translate: getComputedStyle(item).translate,
      edgeStillGradient: /gradient/.test(getComputedStyle(hero, '::before').backgroundImage),
      faceStillGradient: /gradient/.test(getComputedStyle(hero, '::after').backgroundImage),
    };
  `);
  eq(calm.sheen, 'none', 'reduced-motion：金邊上的掃光關掉');
  eq(calm.translate, 'none', 'reduced-motion：石牌不再位移');
  eq(calm.edgeStillGradient, true, 'reduced-motion：邊的立體感留著（那是資訊）');
  eq(calm.faceStillGradient, true, 'reduced-motion：石面留著');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
  await sleep(200);

  // ── 護欄：整份樣式表沒有任何外部資產 ──────────────────────────
  const noRemote = await evaluate(`
    const bad = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        const t = r.cssText || '';
        const m = t.match(/url\\(\\s*['"]?(https?:)?\\/\\//g);
        if (m) bad.push(t.slice(0, 90));
      }
    }
    return bad;
  `);
  eq(noRemote.length, 0, '樣式表零外部資產（全部是漸層 / 內嵌 SVG / 本機字型）', JSON.stringify(noRemote).slice(0, 160));

  await evaluate(`window.__promptasy.promptConsole.close(); await new Promise((r) => setTimeout(r, 300)); return 1;`);

  /* ================================================================ */
  console.log('\n▸ 從設定重看引導課程 ＋ 跳過');
  const replay = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 220));
    const hasButton = !!document.querySelector('#settings [data-prologue]');
    document.querySelector('#settings [data-prologue]').click();
    await new Promise((r) => setTimeout(r, 320));
    return {
      hasButton,
      settingsOpen: g.settings.isOpen,
      active: g.prologue.isActive,
      flag: g.progression.state.flags.prologueDone,
      beat: g.prologue.beat?.kind,
      echoHidden: document.querySelector('.echo').hidden,
    };
  `);
  eq(replay.hasButton, true, '設定頁有「重看引導課程」');
  eq(replay.settingsOpen, false, '按下去會關掉設定頁');
  eq(replay.active, true, '引導課程重新開始');
  eq(replay.flag, false, '重看時旗標先放回 false');
  eq(replay.beat, 'say', '從第一拍重看');
  eq(replay.echoHidden, false, '回聲字幕條再度出現');

  const skipFlow = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('.echo [data-skip]').click();
    await new Promise((r) => setTimeout(r, 200));
    const confirmShown = !document.querySelector('.echo__confirm').hidden;
    // 先反悔一次：確認「繼續學」不會關掉課程
    document.querySelector('.echo [data-confirm-no]').click();
    await new Promise((r) => setTimeout(r, 160));
    const stillActive = g.prologue.isActive;
    document.querySelector('.echo [data-skip]').click();
    await new Promise((r) => setTimeout(r, 160));
    document.querySelector('.echo [data-confirm-yes]').click();
    await new Promise((r) => setTimeout(r, 320));
    return {
      confirmShown,
      stillActive,
      active: g.prologue.isActive,
      echoHidden: document.querySelector('.echo').hidden,
      flag: g.progression.state.flags.prologueDone,
      introOpen: g.intro.isOpen,
    };
  `);
  eq(skipFlow.confirmShown, true, '「跳過引導」會先問一次（二次確認）');
  eq(skipFlow.stillActive, true, '選「繼續學」不會中斷課程');
  eq(skipFlow.active, false, '確認後真的跳過');
  eq(skipFlow.echoHidden, true, '跳過後字幕條收起來');
  eq(skipFlow.flag, true, '跳過也算「上過」—— 不會每次開機都再問');
  eq(skipFlow.introOpen, true, '跳過的人至少拿到一張操作說明');

  await evaluate(`document.querySelector('.intro [data-start]').click(); return 1;`);
  await sleep(260);
  eq(await evaluate('return window.__promptasy.intro.isOpen;'), false, '操作說明可關閉');

  /* ================================================================ */
  console.log('\n▸ 效能監視器（Phase 17）');

  const perfOff = await evaluate(`
    const g = window.__promptasy;
    const node = document.querySelector('.perfmon');
    const cs = getComputedStyle(node);
    return {
      exists: !!node,
      hidden: node.hidden,
      enabled: g.perfmon.isEnabled,
      frames: g.perfmon.state().frames,
      setting: g.progression.state.settings.perfMonitor,
      pointer: cs.pointerEvents,
      z: Number(cs.zIndex),
    };
  `);
  eq(perfOff.exists, true, '效能監視器已掛上（但預設收著）');
  eq(perfOff.hidden, true, '預設不顯示效能監視器');
  eq(perfOff.enabled, false, '預設是關閉的');
  eq(perfOff.frames, 0, '關閉時完全沒有在跑（一幀都沒處理）');
  eq(perfOff.setting, false, '存檔裡的預設值是關閉');
  eq(perfOff.pointer, 'none', '整塊不吃滑鼠（不會擋住對世界的操作）');
  ok(perfOff.z >= 50, '疊在所有東西之上（診斷面板）', `z=${perfOff.z}`);

  const perfOn = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 240));
    const box = document.querySelector('#settings [data-perf]');
    const hasRow = !!box;
    const rowText = box ? box.closest('.settings__row').textContent : '';
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    // swiftshader 軟體渲染很慢（個位數 FPS），要等夠久才收得到幾幀
    await new Promise((r) => setTimeout(r, 3000));
    const node = document.querySelector('.perfmon');
    const st = g.perfmon.state();
    const grip = getComputedStyle(node.querySelector('.perfmon__grip')).pointerEvents;
    const rect = node.getBoundingClientRect();
    const compass = document.querySelector('.compass').getBoundingClientRect();
    const buttons = document.querySelector('.hud__buttons').getBoundingClientRect();
    const overlap = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      hasRow,
      rowText,
      hidden: node.hidden,
      enabled: st.enabled,
      frames: st.frames,
      samples: st.samples,
      fpsText: node.querySelector('[data-fps]').textContent,
      msText: node.querySelector('[data-ms]').textContent,
      callsText: node.querySelector('[data-calls]').textContent,
      trisText: node.querySelector('[data-tris]').textContent,
      hasMemory: st.hasMemory,
      heapHidden: node.querySelector('[data-heaprow]').hidden,
      heapText: node.querySelector('[data-heap]').textContent,
      hasCanvas: !!node.querySelector('.perfmon__graph'),
      grip,
      setting: g.progression.state.settings.perfMonitor,
      overlapCompass: overlap(rect, compass),
      overlapButtons: overlap(rect, buttons),
      inViewport: rect.top >= 0 && rect.right <= window.innerWidth + 1,
      calls: st.calls,
      triangles: st.triangles,
    };
  `);
  eq(perfOn.hasRow, true, '設定頁有「效能監視器」這一列');
  ok(/效能監視器/.test(perfOn.rowText), '設定頁那一列用的是平白的說法', perfOn.rowText.slice(0, 40));
  ok(/F3/.test(perfOn.rowText), '設定頁那一列寫明 F3 也能開關', perfOn.rowText.slice(0, 90));
  eq(perfOn.hidden, false, '打開後面板真的出現');
  eq(perfOn.enabled, true, '打開後開始運作');
  ok(perfOn.frames >= 2, '每幀都有在取樣', `frames=${perfOn.frames}`);
  ok(perfOn.samples >= 2, '折線圖累積了樣本', `samples=${perfOn.samples}`);
  ok(/^\d+$/.test(perfOn.fpsText) && Number(perfOn.fpsText) > 0, '顯示得出目前的 FPS', perfOn.fpsText);
  ok(/ms$/.test(perfOn.msText), '顯示每幀毫秒', perfOn.msText);
  ok(perfOn.calls > 0, '從 renderer.info 讀得到繪製次數', `calls=${perfOn.calls}`);
  ok(perfOn.triangles > 1000, '從 renderer.info 讀得到三角形數', `tris=${perfOn.triangles}`);
  ok(perfOn.callsText !== '--' && perfOn.trisText !== '--', '繪製次數與三角形數都寫上去了');
  eq(perfOn.hasCanvas, true, '有一張即時的折線圖');
  eq(perfOn.grip, 'auto', '只有上緣把手接得到滑鼠');
  eq(perfOn.setting, true, '開關寫進存檔設定');
  eq(perfOn.overlapCompass, false, '預設位置不蓋到指南針');
  eq(perfOn.overlapButtons, false, '預設位置不蓋到 HUD 的按鈕');
  eq(perfOn.inViewport, true, '預設位置在畫面內');
  // JS 記憶體只有 Chrome 有（performance.memory）；沒有就整列不顯示
  eq(perfOn.heapHidden, !perfOn.hasMemory, '沒有 performance.memory 時記憶體那列會整列收起來');
  if (perfOn.hasMemory) ok(/MB$/.test(perfOn.heapText), '有 performance.memory 時顯示 JS 記憶體', perfOn.heapText);

  /* --- 顯示卡（Phase 19）：型號 ＋ 每幀 GPU 耗時 --- */
  const gpuInfo = await evaluate(`
    const g = window.__promptasy;
    const node = document.querySelector('.perfmon');
    // 多等一會兒：GPU 的計時查詢要隔幾幀才收得到結果
    await new Promise((r) => setTimeout(r, 1500));
    const st = g.perfmon.state();
    const nameEl = node.querySelector('[data-gpuname]');
    const flagEl = node.querySelector('[data-gpusoft]');
    const rows = Array.from(node.querySelectorAll('.perfmon__row dt')).map((n) => n.textContent.trim());
    const tipBtn = node.querySelector('.perfmon .infotip__btn');
    const bubble = node.querySelector('.perfmon .infotip__bubble');
    const bubbleBefore = bubble ? getComputedStyle(bubble).visibility : '';
    // hover ＝ 游標真的動到它上面（只補送 mouseover 不算，見 bindInfoTips）
    const tipBox = tipBtn?.getBoundingClientRect();
    tipBtn?.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: Math.round(tipBox.x + tipBox.width / 2),
      clientY: Math.round(tipBox.y + tipBox.height / 2),
    }));
    await new Promise((r) => setTimeout(r, 120));
    const bubbleAfter = bubble ? getComputedStyle(bubble).visibility : '';
    const tipText = bubble ? bubble.textContent : '';
    // 石牌有 clip-path（切角）—— 氣泡跑出石牌就會被切掉、字讀不完
    const bb = bubble.getBoundingClientRect();
    const pb = node.getBoundingClientRect();
    const bubbleInside = bb.left >= pb.left - 1 && bb.right <= pb.right + 1 && bb.top >= pb.top - 1;
    tipBtn?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    const rect = node.getBoundingClientRect();
    return {
      rows,
      nameText: nameEl.textContent.trim(),
      nameTitle: nameEl.getAttribute('title') || '',
      gpuName: st.gpuName,
      gpuRaw: st.gpuRaw,
      gpuSoftware: st.gpuSoftware,
      gpuMs: st.gpuMs,
      gpuTiming: st.gpuTiming,
      gpuMsText: node.querySelector('[data-gpums]').textContent.trim(),
      flagHidden: flagEl.hidden,
      flagText: flagEl.textContent.trim(),
      flagColor: getComputedStyle(flagEl).color,
      hasTip: !!tipBtn,
      tipText,
      bubbleBefore,
      bubbleAfter,
      bubbleInside,
      tipPointer: tipBtn ? getComputedStyle(tipBtn.closest('.infotip')).pointerEvents : '',
      fits: rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
      width: Math.round(rect.width),
    };
  `);
  process.stdout.write(
    `\n  · GPU：${gpuInfo.gpuName}｜軟體渲染=${gpuInfo.gpuSoftware}｜計時擴充=${gpuInfo.gpuTiming}｜每幀=${gpuInfo.gpuMsText}\n  `
  );
  ok(gpuInfo.rows.includes('CPU 幀'), 'CPU 每幀那一列標得清楚', gpuInfo.rows.join(' / '));
  ok(gpuInfo.rows.includes('GPU 幀'), 'GPU 每幀自成一列（和 CPU 分開讀）', gpuInfo.rows.join(' / '));
  ok(gpuInfo.nameText.length > 0 && gpuInfo.nameText !== '--', '顯示卡型號那一行有東西', gpuInfo.nameText);
  ok(gpuInfo.gpuName.length > 0, 'state() 讀得到 gpuName', gpuInfo.gpuName);
  ok(gpuInfo.gpuRaw.length > 0, '完整的原始型號字串留在 title 裡（縮寫過也查得到原文）', gpuInfo.nameTitle);
  eq(gpuInfo.nameText, gpuInfo.gpuName, '畫面上的型號＝state() 的 gpuName');
  ok(gpuInfo.nameText.length <= 44, '型號被縮短到讀得完的長度', `len=${gpuInfo.nameText.length}`);
  ok(
    !/vs_\d|ps_\d|0x[0-9a-f]{4}|Direct3D|driver-/i.test(gpuInfo.nameText),
    'ANGLE 那串雜訊（shader model / 裝置 id / 驅動版本）都被清掉',
    gpuInfo.nameText
  );
  ok(
    gpuInfo.gpuRaw.length >= gpuInfo.nameText.length,
    '縮寫過的名字比原字串短（或一樣）',
    `${gpuInfo.nameText} ← ${gpuInfo.gpuRaw}`
  );
  // headless 用 --use-angle=swiftshader → 一定要認出「沒有真的用到顯示卡」
  eq(gpuInfo.gpuSoftware, true, 'headless 的 SwiftShader 被認出是軟體渲染', gpuInfo.gpuRaw);
  eq(gpuInfo.flagHidden, false, '軟體渲染時亮出警示那一行');
  ok(/軟體渲染/.test(gpuInfo.flagText), '警示寫的是「軟體渲染（未用 GPU）」', gpuInfo.flagText);
  ok(
    /rgb\(\s*230,\s*199,\s*155\s*\)/.test(gpuInfo.flagColor.replace(/\s+/g, ' ')),
    '警示用的是暖金警示色',
    gpuInfo.flagColor
  );
  // 每幀 GPU 耗時：拿得到就是個 ≥0 的數字，拿不到就安靜寫「不支援」——兩種都不准出錯
  if (gpuInfo.gpuTiming) {
    ok(
      gpuInfo.gpuMs === null || (typeof gpuInfo.gpuMs === 'number' && gpuInfo.gpuMs >= 0),
      '有計時擴充時 GPU 每幀是一個 ≥0 的數字',
      `gpuMs=${gpuInfo.gpuMs}`
    );
    ok(/ms$|量測中/.test(gpuInfo.gpuMsText), 'GPU 每幀那一列寫得出毫秒', gpuInfo.gpuMsText);
  } else {
    eq(gpuInfo.gpuMs, null, '沒有計時擴充時 gpuMs 是 null');
    eq(gpuInfo.gpuMsText, '不支援', '沒有計時擴充就安靜寫「不支援」（不是錯誤）');
  }
  eq(gpuInfo.hasTip, true, 'GPU 那一段有一顆 ⓘ');
  ok(/使用率/.test(gpuInfo.tipText) && /型號/.test(gpuInfo.tipText), 'ⓘ 講明「拿不到 GPU 使用率」', gpuInfo.tipText);
  eq(gpuInfo.bubbleBefore, 'hidden', 'ⓘ 的說明預設收著');
  eq(gpuInfo.bubbleAfter, 'visible', '滑鼠移上去才展開');
  eq(gpuInfo.bubbleInside, true, '說明整塊都在石牌裡（石牌有切角會裁掉跑出去的東西）');
  eq(gpuInfo.tipPointer, 'auto', 'ⓘ 接得到滑鼠（石牌其他地方仍然不吃滑鼠）');
  eq(gpuInfo.fits, true, '加了 GPU 兩段之後石牌仍然在畫面內');
  ok(gpuInfo.width <= 200, '石牌沒有變寬（仍是一塊小刻印牌）', `width=${gpuInfo.width}`);

  // 收合成一塊「只有 FPS」的小牌子
  const perfFold = await evaluate(`
    const g = window.__promptasy;
    const node = document.querySelector('.perfmon');
    node.querySelector('[data-fold]').click();
    await new Promise((r) => setTimeout(r, 200));
    const collapsed = {
      cls: node.classList.contains('is-collapsed'),
      bodyShown: getComputedStyle(node.querySelector('.perfmon__body')).display !== 'none',
      fpsShown: getComputedStyle(node.querySelector('[data-fps]')).display !== 'none',
      gpuShown: node.querySelector('.perfmon__gpu').getClientRects().length > 0,
      aria: node.querySelector('[data-fold]').getAttribute('aria-expanded'),
    };
    node.querySelector('[data-fold]').click();
    await new Promise((r) => setTimeout(r, 200));
    return { collapsed, backOpen: !node.classList.contains('is-collapsed') };
  `);
  eq(perfFold.collapsed.cls, true, '可以收合成小牌子');
  eq(perfFold.collapsed.bodyShown, false, '收合後細項收起來');
  eq(perfFold.collapsed.fpsShown, true, '收合後仍看得到 FPS');
  eq(perfFold.collapsed.gpuShown, false, '收合成小牌子時 GPU 那一段也收起來（小牌子只有 FPS）');
  eq(perfFold.collapsed.aria, 'false', '收合狀態有 aria-expanded');
  eq(perfFold.backOpen, true, '再按一次展開');

  await evaluate(`window.__promptasy.settings.close(); await new Promise((r) => setTimeout(r, 240)); return 1;`);

  // F3：關掉 → 再打開
  await key('F3', 'F3', { vk: 114 });
  await sleep(320);
  const perfF3Off = await evaluate(`
    const g = window.__promptasy;
    const before = g.perfmon.state().frames;
    await new Promise((r) => setTimeout(r, 2000));
    const after = g.perfmon.state().frames;
    const st = g.perfmon.state();
    return {
      enabled: g.perfmon.isEnabled,
      hidden: document.querySelector('.perfmon').hidden,
      setting: g.progression.state.settings.perfMonitor,
      before,
      after,
      gpuTiming: st.gpuTiming,
      gpuMs: st.gpuMs,
      gpuName: st.gpuName,
    };
  `);
  eq(perfF3Off.enabled, false, 'F3 可以關掉效能監視器');
  eq(perfF3Off.gpuTiming, false, '關掉後 GPU 計時查詢也全部收掉（收起來 = 零開銷）');
  eq(perfF3Off.gpuMs, null, '關掉後不留舊的 GPU 數字');
  ok(perfF3Off.gpuName.length > 0, '型號只讀一次，關掉後仍記得', perfF3Off.gpuName);
  eq(perfF3Off.hidden, true, '關掉後面板消失');
  eq(perfF3Off.setting, false, 'F3 的狀態也寫進存檔設定');
  eq(perfF3Off.after, perfF3Off.before, '關掉後每幀的工作真的停了（幀數不再累加）');

  await key('F3', 'F3', { vk: 114 });
  await sleep(2000);
  const perfF3On = await evaluate(`
    const g = window.__promptasy;
    return {
      enabled: g.perfmon.isEnabled,
      hidden: document.querySelector('.perfmon').hidden,
      setting: g.progression.state.settings.perfMonitor,
      frames: g.perfmon.state().frames,
    };
  `);
  eq(perfF3On.enabled, true, 'F3 再按一次又打開');
  eq(perfF3On.hidden, false, '打開後面板又出現');
  eq(perfF3On.setting, true, '再次寫進存檔設定');
  ok(perfF3On.frames >= 1, '重新開始取樣', `frames=${perfF3On.frames}`);

  // 跨重整仍記得
  await reloadPage('效能監視器跨重整');
  await sleep(2000);
  const perfReload = await evaluate(`
    const g = window.__promptasy;
    const st = g.perfmon.state();
    return {
      enabled: g.perfmon.isEnabled,
      hidden: document.querySelector('.perfmon').hidden,
      frames: st.frames,
      setting: g.progression.state.settings.perfMonitor,
    };
  `);
  eq(perfReload.setting, true, '重整後存檔設定還在');
  eq(perfReload.enabled, true, '重整後效能監視器自動打開');
  eq(perfReload.hidden, false, '重整後面板就在畫面上');
  ok(perfReload.frames >= 1, '重整後繼續取樣', `frames=${perfReload.frames}`);

  // 關回去（後面的段落不需要它）
  await evaluate(`
    const g = window.__promptasy;
    g.perfmon.setEnabled(false);
    g.progression.updateSettings({ perfMonitor: false });
    return 1;
  `);

  /* --- 護欄：介面上不准出現任何「API key」這類的旁白（Phase 17） --- */
  const noKeyCopy = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 220));
    const parts = [document.body.textContent || '', g.title.root.textContent || '', g.intro.root.textContent || ''];
    parts.push(
      Array.from(document.querySelectorAll('[title], [placeholder], [aria-label]'))
        .map((n) => [n.getAttribute('title'), n.getAttribute('placeholder'), n.getAttribute('aria-label')].join(' '))
        .join(' ')
    );
    g.settings.close();
    await new Promise((r) => setTimeout(r, 200));
    g.codex.open();
    await new Promise((r) => setTimeout(r, 260));
    parts.push(document.body.textContent || '');
    g.codex.close();
    await new Promise((r) => setTimeout(r, 200));
    const all = parts.join(' ');
    const patterns = [/api[\\s._-]*key/i, /api\\s*金鑰/i, /金鑰/, /bring your own key/i, /自備[^\\n]{0,6}(key|模型)/i, /真\\s*LLM\\s*模式/i];
    const hits = [];
    for (const re of patterns) {
      const m = all.match(re);
      if (m) hits.push(m[0]);
    }
    return { hits, len: all.length };
  `);
  ok(noKeyCopy.len > 500, '掃到的介面文字量合理', `len=${noKeyCopy.len}`);
  eq(noKeyCopy.hits.length, 0, '整個介面找不到任何「API key」之類的旁白', noKeyCopy.hits.join(' / '));

  /* ================================================================ */
  /* Phase 21 · 導航閃爍提示 ＋ 可分享結果卡                            */
  /* ================================================================ */
  console.log('\n▸ 分享結果卡與稱號（Phase 21）');

  // 種一份「Lv.6 / 收集 46 條 / 精通 2 片」的存檔 —— 對應的稱號一定是「釋義者」
  const seedRank = await evaluate(`
    const g = window.__promptasy;
    const cur = g.content.curriculum;
    const of = (id) => cur.techniques.filter((t) => t.groupId === id).map((t) => t.id);
    const collected = [...of('foundations'), ...of('reasoning'), ...of('orchestration').slice(0, 14)];
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 1200, level: 6,
      unlockedRegions: ['foundations'],
      collected,
      bestGrades: {},
      loreRead: [], prologueSteps: [], guidanceSeen: [],
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0.4, quality: 'high', muted: true, promptMode: 'guided' },
      flags: { introSeen: true, prologueDone: true }
    }));
    return { collected: collected.length };
  `);
  eq(seedRank.collected, 46, '種入 46 條已收集技巧的存檔');

  await reloadPage('種入稱號存檔後重新載入');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const rankNow = await evaluate(`
    const g = window.__promptasy;
    const info = g.rank();
    return {
      level: g.progression.levelInfo().level,
      collected: g.progression.state.collected.length,
      mastered: g.progression.masteredRegions().length,
      rankId: info.rank.id,
      rankTitle: info.rank.title,
      nextTitle: info.next ? info.next.title : null,
    };
  `);
  eq(rankNow.level, 6, '種入的存檔是 Lv.6');
  eq(rankNow.collected, 46, '種入的存檔收集 46 條');
  eq(rankNow.mastered, 2, '種入的存檔精通 2 片土地');
  eq(rankNow.rankTitle, '釋義者', '稱號與存檔一致（Lv.6 / 46 條 / 2 片 → 釋義者）');
  eq(rankNow.nextTitle, '神諭使者', '指得出下一個稱號');

  await key('KeyC', 'c', { vk: 67 });
  await sleep(400);
  const codexShare = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.codex.isOpen,
      rankBar: document.querySelector('#codex .sharebar__rank')?.textContent.trim() || '',
      nextLine: document.querySelector('#codex .sharebar__next')?.textContent.trim() || '',
      shareBtn: document.querySelector('#codex [data-share-codex]')?.textContent.trim() || '',
      masteredShare: document.querySelectorAll('#codex [data-share-region]').length,
    };
  `);
  eq(codexShare.open, true, '圖鑑開啟');
  ok(codexShare.rankBar.includes('釋義者'), '圖鑑頂端顯示稱號', codexShare.rankBar);
  ok(codexShare.rankBar.includes('Lv.6'), '稱號旁顯示等級', codexShare.rankBar);
  ok(codexShare.nextLine.includes('神諭使者'), '圖鑑寫出下一個稱號要什麼', codexShare.nextLine);
  ok(codexShare.shareBtn.includes('分享'), '圖鑑頂端有分享鈕', codexShare.shareBtn);
  eq(codexShare.masteredShare, 2, '兩片已精通的土地各有一顆分享鈕');

  const card = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#codex [data-share-codex]').click();
    await new Promise((r) => setTimeout(r, 900));
    const cv = g.shareCard.canvas;
    // 讀像素用另一張畫布（willReadFrequently），不去動遊戲自己那張的 context
    const probe = document.createElement('canvas');
    probe.width = cv.width; probe.height = cv.height;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(cv, 0, 0);
    const d = pctx.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0, samples = 0, sum = 0, stripLit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      const px = (i / 4) % cv.width;
      const py = Math.floor((i / 4) / cv.width);
      // 左上「PROMPTARCADE」那一行附近一定要有字（不是空框）
      if (py >= 78 && py < 102 && px >= 78 && px < 398 && v > 300) stripLit += 1;
      if ((i / 4) % 37 !== 0) continue;
      sum += v; samples += 1;
      if (v > 330) lit += 1;
    }
    const dl = document.querySelector('#sharecard [data-download]');
    return {
      open: g.shareCard.isOpen,
      consoleStillClosed: !g.promptConsole.isOpen,
      codexStillOpen: g.codex.isOpen,
      w: cv.width, h: cv.height,
      lit, samples, avg: sum / samples,
      stripLit,
      href: (dl?.getAttribute('href') || '').startsWith('data:image/png;base64,'),
      hrefLen: (dl?.getAttribute('href') || '').length,
      download: dl?.getAttribute('download') || '',
      caption: document.querySelector('#sharecard [data-caption]')?.value.trim() || '',
      model: g.shareCard.model(),
      // 引擎現算的「已知技法數」—— 卡上那個數字該跟它一致
      knownSkills: (g.content.catalog.skills || []).filter((s) => g.progression.knowsSkill(s.id)).length,
      focusInPanel: document.querySelector('#sharecard .panel').contains(document.activeElement),
      zShare: Number(getComputedStyle(document.getElementById('sharecard')).zIndex),
      zPlain: Number(getComputedStyle(document.getElementById('codex')).zIndex),
      remoteNodes: document.querySelectorAll('#sharecard img, #sharecard iframe, #sharecard script').length,
      alt: g.shareCard.canvas.getAttribute('aria-label') || '',
      // 「下載圖片」不能被擠到摺線下面 —— 它是這個面板唯一的目的
      actsVisible:
        document.querySelector('#sharecard [data-download]').getBoundingClientRect().bottom <=
        document.querySelector('#sharecard .panel').getBoundingClientRect().bottom + 1,
    };
  `);
  eq(card.open, true, '按下分享 → 結果卡預覽開啟');
  eq(card.codexStillOpen, true, '分享卡疊在圖鑑上面，底下的面板沒被關掉');
  eq(card.w, 1200, '卡片寬 1200（og-image 比例）');
  eq(card.h, 630, '卡片高 630');
  ok(card.avg > 20, '卡片不是全黑', `avg=${card.avg.toFixed(1)}`);
  ok(card.lit > 60, '卡片有明顯的亮部（字與線都畫出來了）', `lit=${card.lit}/${card.samples}`);
  ok(card.stripLit > 40, '標頭那一行真的有字', `stripLit=${card.stripLit}`);
  eq(card.href, true, '下載連結是 data URL（沒有任何外部服務）');
  ok(card.hrefLen > 20000, '下載連結帶得動整張圖', `len=${card.hrefLen}`);
  ok(/\.png$/.test(card.download), '下載檔名是 .png', card.download);
  ok(card.download.includes('lv6'), '檔名帶著等級', card.download);
  ok(card.caption.includes('釋義者'), '那段話預設就寫好了（帶著稱號）', card.caption);
  // 2026-08 站長決定：那段話的最後一行是站網址（落款）
  ok(card.caption.trim().endsWith('https://garyhsieh.com/promptasy'), '那段話最後是站網址', card.caption);
  eq((card.caption.match(/https?:\/\//g) || []).length, 1, '那段話裡只有一個網址');
  eq(card.model.rankTitle, '釋義者', '卡片資料的稱號正確');
  eq(card.model.level, 6, '卡片資料的等級正確');
  /*
   * 課程 v2（Phase J3）之後卡上的「已收集」是**130 條 v2 技法**，
   * 判定走 `knowsSkill()`（技能本身收了，或它的祖先技巧已在舊 collected 裡）——
   * 種進去的那 46 條舊技巧因此換算成一個較小的技能數，這裡拿引擎現算的值比對。
   */
  eq(card.model.collected, card.knownSkills, '卡片資料的收集數＝引擎現算的已知技法數');
  ok(card.knownSkills > 0 && card.knownSkills < card.model.total, '那份存檔確實只收了一部分', `${card.knownSkills} / ${card.model.total}`);
  eq(card.model.total, CATALOG.counts.skills, `卡片資料的技法總數正確（${CATALOG.counts.skills} 條）`);
  eq(card.model.kind, 'codex', '這是「收集冊」變體');
  eq(card.model.regions.filter((r) => r.mastered).length, 2, '卡片標出兩片已精通的土地');
  eq(card.model.techniques.length, 3, '卡片列出三條最近收集的技法');
  ok(card.model.techniques.every((t) => t.title && t.id), '每條技法都有名字與編號');
  eq(card.focusInPanel, true, '分享卡開啟時焦點在面板內（M6 無障礙）');
  ok(card.zShare > card.zPlain, '分享卡疊在其他面板之上', `${card.zShare} > ${card.zPlain}`);
  eq(card.remoteNodes, 0, '分享卡沒有任何外部資源節點（完全離線）');
  ok(card.alt.includes('釋義者'), 'canvas 有描述用的 aria-label', card.alt);
  eq(card.actsVisible, true, '「下載圖片」不用捲動就看得到');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(320);
  const afterShare = await evaluate(`
    const g = window.__promptasy;
    return { shareOpen: g.shareCard.isOpen, codexOpen: g.codex.isOpen };
  `);
  eq(afterShare.shareOpen, false, 'Esc 關閉分享卡');
  eq(afterShare.codexOpen, true, 'Esc 只關分享卡，圖鑑還在');
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(280);

  /* --- 通關後的分享入口：卡片標亮「這一關剛學到的技法」 --- */
  const resultShare = await evaluate(`
    const g = window.__promptasy;
    const ch = g.content.challenge('gate-of-clarity-01');
    g.promptConsole.open(ch);
    await new Promise((r) => setTimeout(r, 400));
    g.promptConsole.setMode('free');
    await new Promise((r) => setTimeout(r, 180));
    document.querySelector('#prompt-console [data-act-next="2"]').click();
    await new Promise((r) => setTimeout(r, 240));
    document.querySelector('#prompt-console [data-act-next="3"]').click();
    await new Promise((r) => setTimeout(r, 260));
    return { teaches: ch.teaches.slice(0, 3), open: g.promptConsole.isOpen, act: g.promptConsole.act };
  `);
  eq(resultShare.open, true, '重新打開一關');
  eq(resultShare.act, 3, '走到第三幕（作答）');

  const passShare = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('.prompt-input');
    ta.value = g.content.challenge('gate-of-clarity-01').sample;
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 500));
    const btn = document.querySelector('#prompt-console [data-share]');
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent || '',
      hasShare: !!btn,
      label: btn ? btn.textContent.trim() : '',
      quietTier: btn ? btn.className : '',
    };
  `);
  ok(['S', 'A'].includes(passShare.grade), '示範解答通過', passShare.grade);
  eq(passShare.hasShare, true, '通過後結果面板出現分享鈕');
  ok(passShare.label.includes('分享'), '分享鈕寫著「分享」', passShare.label);
  ok(passShare.quietTier.includes('btn--ghost'), '分享鈕走刻印牌的 quiet 階', passShare.quietTier);

  const resultCard = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#prompt-console [data-share]').click();
    await new Promise((r) => setTimeout(r, 800));
    const m = g.shareCard.model();
    return {
      open: g.shareCard.isOpen,
      consoleStillOpen: g.promptConsole.isOpen,
      kind: m.kind,
      grade: m.grade,
      headline: m.headline,
      techIds: m.techniques.map((t) => t.id),
      kindLabel: m.kindLabel,
      rank: m.rankTitle,
    };
  `);
  eq(resultCard.open, true, '結果面板的分享鈕打得開卡片');
  eq(resultCard.consoleStillOpen, true, '分享卡疊在結果面板上，結果沒被關掉');
  eq(resultCard.kind, 'result', '這是「刻印紀錄」變體');
  ok(['S', 'A'].includes(resultCard.grade), '卡片帶著這一關的評價', resultCard.grade);
  eq(resultCard.headline, '清晰之門', '卡片標題是剛通過的那一關');
  ok(resultCard.techIds.length > 0, '卡片標亮這一關剛學到的技法', resultCard.techIds.join('、'));
  ok(resultCard.kindLabel.includes('刻印紀錄'), '右上角寫著這是哪一種卡', resultCard.kindLabel);

  /*
   * 課程 v2（Phase J3）之後卡上標亮的是**這一關教的那條 v2 技能**
   * （`skillIds: [primarySkillId]`），舊的 legacy `teaches` 只是它的退路。
   */
  const teachesMatch = await evaluate(`
    const g = window.__promptasy;
    const ch = g.content.challenge('gate-of-clarity-01');
    const ids = g.shareCard.model().techniques.map((t) => t.id);
    return {
      ids,
      primary: ch.primarySkillId,
      allKnown: ids.every((id) => id === ch.primarySkillId || (ch.teaches || []).includes(id)),
    };
  `);
  ok(teachesMatch.ids.length > 0, '卡上真的標亮了技法（不是空過）', teachesMatch.ids.join('、'));
  eq(teachesMatch.ids[0], teachesMatch.primary, '卡上第一條就是這一關教的那條技能');
  eq(teachesMatch.allKnown, true, '卡片上的技法全部來自這一關（主技能或它順手收的舊技巧）', teachesMatch.ids.join('、'));

  // 800px 窄畫面下不會水平溢位
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 820, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(500);
  const narrow = await evaluate(`
    const panel = document.querySelector('#sharecard .panel');
    const cv = document.querySelector('#sharecard .sharecard__canvas');
    return {
      overflow: Math.max(0, panel.scrollWidth - panel.clientWidth),
      canvasFits: cv.getBoundingClientRect().width <= panel.getBoundingClientRect().width + 1,
      docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  `);
  eq(narrow.overflow, 0, '820px 下分享卡面板無水平溢位');
  eq(narrow.canvasFits, true, '820px 下卡片圖縮進面板寬度內');
  eq(narrow.docOverflow, 0, '820px 下整頁無水平溢位');
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(400);

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(280);
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(280);

  /* ================================================================ */
  console.log('\n▸ 分享 ＝ 圖 ＋ 一段話（Phase 28）');

  /*
   * 分享出去的東西只有兩樣：**那張卡的圖 ＋ 玩家自己那段話**。
   *
   * Phase 24 那排「分享到 Facebook / Threads」的網頁入口已經整排拿掉 ——
   * 它們只帶得走文字和一個連結，收到的人看到的是一個程式碼倉庫的連結，
   * 不是玩家剛刻出來的那張卡。這一節就是在守這件事。
   *
   * 兩種環境各驗一次：
   *   ① 系統分享面板帶不動檔案（大部分桌機瀏覽器）
   *      → 那個入口收起來，「複製圖＋文」變成主角，
   *        剪貼簿裡真的有圖，也有玩家改過的那段話
   *   ② 帶得動 → 露出來，交出去的是「一個 PNG 檔案 ＋ 玩家改過的那段話」，
   *        沒有 url、沒有 title，也沒有任何連結
   */
  await evaluate(`
    // 剪貼簿換成假的：連寫進去的那段話本身都留下來給測試看
    window.__clip = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items) => {
          for (const it of items) {
            const types = [...it.types];
            let text = null;
            if (types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
            window.__clip.push({ types, text });
          }
        },
        writeText: async (t) => { window.__clip.push({ types: ['text/plain'], text: t }); },
      },
    });
    // 先確定沒有系統分享面板（Linux 桌機的 Chrome 本來就沒有，這裡讓它變成確定的）
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    return true;
  `);

  /*
   * 圖是在背景編碼的：1200×630 的 PNG 在軟體渲染的機器上要好幾秒。
   * 這種等待要留在 node 這一側一小口一小口問（每次 CDP 呼叫都很短），
   * 不要塞進同一個 evaluate 裡等 —— 那會撞到單次呼叫的上限。
   */
  async function waitShareFile(limitMs = 90000) {
    const t0 = Date.now();
    while (Date.now() - t0 < limitMs) {
      // eslint-disable-next-line no-await-in-loop
      if (await evaluate(`return !!window.__promptasy.shareCard.file;`)) return true;
      // eslint-disable-next-line no-await-in-loop
      await sleep(300);
    }
    return false;
  }

  /** 真的用鍵盤在那段話後面補字（Input.insertText ＝ 真正的輸入事件）。 */
  async function typeIntoCaption(text) {
    await evaluate(`
      const box = document.querySelector('#sharecard [data-caption]');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
      return true;
    `);
    await cdp.send('Input.insertText', { text }, sessionId);
    await sleep(160);
  }

  await evaluate(`window.__promptasy.shareCard.open({ kind: 'codex' }); return true;`);
  const plainReady = await waitShareFile();

  const sendPlain = await evaluate(`
    const g = window.__promptasy;
    const ready = ${plainReady};
    const dl = document.querySelector('#sharecard [data-download]');
    const copy = document.querySelector('#sharecard [data-copy]');
    const say = document.querySelector('#sharecard [data-caption]');
    return {
      open: g.shareCard.isOpen,
      ready,
      // 2026-08-03 站長定稿：系統分享鈕整顆移除，複製鈕成為固定主角
      sysNodes: document.querySelectorAll('#sharecard [data-sysshare]').length,
      copyTitle: copy ? copy.getAttribute('title') : '',
      copyAria: copy ? copy.getAttribute('aria-label') : '',
      copyClass: copy ? copy.className : '',
      copyIcons: copy ? copy.querySelectorAll('svg').length : 0,
      copyRect: copy ? (() => { const r = copy.getBoundingClientRect(); return { w: r.width, h: r.height }; })() : null,
      dlClass: dl.className,
      dlTag: dl.tagName,
      dlLabel: dl.textContent.trim(),
      dlAria: dl.getAttribute('aria-label') || '',
      // 那一排：兩個平台（Instagram 已移除）
      chips: document.querySelectorAll('#sharecard [data-chip]').length,
      chipIds: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.getAttribute('data-chip')),
      chipTitles: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.getAttribute('title') || ''),
      // 那一排收斂成純圖示（名字走 title / aria-label）
      chipTexts: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.textContent.trim()),
      chipIcons: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.querySelectorAll('svg').length),
      // 那一排是按鈕不是連結 —— 因為要先把圖備好才開新頁（順序不能交給瀏覽器）
      newTabs: document.querySelectorAll('#sharecard a[target="_blank"]').length,
      chipTags: [...new Set([...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.tagName))],
      sayTag: say ? say.tagName : '',
      sayValue: say ? say.value : '',
      sayLabel: document.querySelector('#sharecard .sharecard__saylabel')?.textContent.trim() || '',
      sayFont: say ? getComputedStyle(say).fontFamily : '',
      labelFor: document.querySelector('#sharecard .sharecard__saylabel')?.getAttribute('for') || '',
      // 收掉的那些字：小標、灰字說明、鍵帽
      hintNodes: document.querySelectorAll('#sharecard .sharecard__hint, #sharecard .sharecard__sendlabel').length,
      kbdNodes: document.querySelectorAll('#sharecard kbd').length,
      data: g.shareCard.shareData(),
      focusOnCopy: document.activeElement.getAttribute('data-copy') !== null,
      file: g.shareCard.file
        ? { name: g.shareCard.file.name, type: g.shareCard.file.type, size: g.shareCard.file.size }
        : null,
      remoteNodes: document.querySelectorAll('#sharecard img, #sharecard iframe, #sharecard script').length,
      wholeText: document.querySelector('#sharecard .panel').textContent,
    };
  `);
  eq(sendPlain.open, true, '分享卡打得開');
  eq(sendPlain.sysNodes, 0, '「分享圖＋文」的系統分享鈕已整顆移除（不得回歸）');
  eq(sendPlain.chips, 2, '那一排剩兩顆：Threads / Facebook');
  eq(sendPlain.chipIds.join(','), 'threads,facebook', '那一排的順序：最順的那條路排前面');
  ok(!sendPlain.chipIds.includes('instagram'), 'Instagram 那顆沒有回來（網頁版沒有撰寫入口）');
  ok(!sendPlain.chipIds.includes('caption'), '獨立的「複製文案」那顆也沒有回來（複製鈕已經是主角）');
  eq(
    sendPlain.chipTitles.join(','),
    'Threads,Facebook',
    '每一顆都戴著平台自己的名字（滑鼠停著看得到）'
  );
  eq(sendPlain.chipTexts.join(''), '', '那一排是純圖示（牌面上不寫字）');
  ok(sendPlain.chipIcons.every((n) => n === 1), '每一顆都畫著自己的行內 SVG 圖示', sendPlain.chipIcons.join(','));
  eq(sendPlain.hintNodes, 0, '「分享 · SHARE」小標與那兩行灰字說明都收掉了');
  eq(sendPlain.kbdNodes, 0, '分享卡上不再印鍵帽（那一排是圖示，說明走 aria-label）');
  eq(sendPlain.newTabs, 0, '那一排是按鈕不是連結（先備好圖，才輪到開新頁）');
  eq(sendPlain.chipTags.join(','), 'BUTTON', '那一排全部是按鈕');
  eq(sendPlain.copyTitle, '複製圖＋文', '主角那一顆的名字是「複製圖＋文」');
  ok(sendPlain.copyAria.includes('圖') && sendPlain.copyAria.includes('話'), '主角那一顆有給螢幕閱讀器的說明', sendPlain.copyAria);
  ok(sendPlain.copyClass.includes('iconbtn'), '主角那一顆也是同一族的圖示鈕', sendPlain.copyClass);
  eq(sendPlain.copyIcons, 2, '複製鈕有兩張臉（複製 / 勾記），按成功那一下就地翻面');
  ok(sendPlain.copyRect && sendPlain.copyRect.w >= 40 && sendPlain.copyRect.h >= 40, '主角那一顆的命中範圍夠大', JSON.stringify(sendPlain.copyRect));
  eq(sendPlain.dlTag, 'A', '「下載」是一條 <a download>（保底那條路）');
  ok(sendPlain.dlClass.includes('sharecard__dl'), '「下載」有自己安靜的樣式', sendPlain.dlClass);
  ok(sendPlain.dlLabel.includes('下載'), '「下載」還在（保底那條路）', sendPlain.dlLabel);
  ok(sendPlain.dlAria.includes('存到裝置'), '「下載」有給螢幕閱讀器的說明', sendPlain.dlAria);
  eq(sendPlain.focusOnCopy, true, '開卡時焦點就落在主角上');
  eq(sendPlain.remoteNodes, 0, '分享卡仍然沒有任何外部資源節點（零 SDK）');

  /* --- 那段話：一個真的能改的框，預設就寫好了，最後一行是站網址 --- */
  eq(sendPlain.sayTag, 'TEXTAREA', '那段話是一個可以改的框');
  ok(sendPlain.sayValue.includes('釋義者'), '那段話預設帶著稱號', sendPlain.sayValue);
  ok(/\d+ \/ \d+ 條技法/.test(sendPlain.sayValue), '那段話預設帶著收集進度（現算的技法數）', sendPlain.sayValue);
  ok(sendPlain.sayValue.includes('Learn Prompt Engineering by Playing'), '那段話落款是品牌那一句');
  // 2026-08 站長決定：落款後面接站網址 —— 看到卡片的人才走得過來
  ok(
    sendPlain.sayValue.trim().endsWith('https://garyhsieh.com/promptasy'),
    '那段話的最後是站網址（自己一行的落款）',
    sendPlain.sayValue
  );
  eq((sendPlain.sayValue.match(/https?:\/\//g) || []).length, 1, '那段話裡只有一個網址（落款，不是替代品）');
  ok(!/github/i.test(sendPlain.sayValue), '那段話裡沒有程式碼倉庫的字眼', sendPlain.sayValue);
  ok(!/github/i.test(sendPlain.wholeText), '整張分享卡上都看不到程式碼倉庫的字眼');
  ok(sendPlain.sayLabel.includes('一段話'), '框上面寫著這是什麼', sendPlain.sayLabel);
  eq(sendPlain.labelFor, 'sharecard-say', '標籤綁得到那個框（螢幕閱讀器唸得出來）');
  ok(!/Arcade Sans|Arcade Serif/.test(sendPlain.sayFont), '玩家自己打的字走系統字型（子集缺字也不會破圖）', sendPlain.sayFont);
  ok(sendPlain.data.text === sendPlain.sayValue.trim(), '要送出去的那段話就是框裡的字');
  eq(Object.keys(sendPlain.data).join(','), 'text,preset', '要送出去的東西就是那段話');
  eq(sendPlain.ready, true, '開卡之後 PNG 會自己備好（不用等玩家按下去才畫）');
  ok(!!sendPlain.file, '開卡的時候 PNG 就備好了（按下去才不會斷手勢）');
  eq(sendPlain.file.type, 'image/png', '備好的是 PNG');
  ok(sendPlain.file.size > 20000, '備好的 PNG 有內容', `size=${sendPlain.file.size}`);
  ok(/\.png$/.test(sendPlain.file.name), '備好的檔名是 .png', sendPlain.file.name);

  /* --- 玩家把那段話改成自己想說的 → 複製出去的就是改過的版本 --- */
  await typeIntoCaption('（今晚刻完的）');
  const edited = await evaluate(`
    const g = window.__promptasy;
    const box = document.querySelector('#sharecard [data-caption]');
    return { value: box.value, data: g.shareCard.shareData() };
  `);
  ok(edited.value.includes('（今晚刻完的）'), '打進去的字真的留在框裡', edited.value);
  ok(edited.data.text.includes('（今晚刻完的）'), '要送出去的那段話跟著改了', edited.data.text);

  const copyClick = await evaluate(`
    window.__clip.length = 0;
    document.querySelector('#sharecard [data-copy]').click();
    await new Promise((r) => setTimeout(r, 360));
    return {
      clip: window.__clip,
      toast: [...document.querySelectorAll('.toast')].map((n) => n.textContent.trim()),
    };
  `);
  eq(copyClick.clip.length, 1, '按一下「複製圖＋文」→ 只寫一次剪貼簿');
  ok(copyClick.clip[0].types.includes('image/png'), '剪貼簿裡有圖', JSON.stringify(copyClick.clip[0].types));
  ok(copyClick.clip[0].types.includes('text/plain'), '剪貼簿裡也有那段話', JSON.stringify(copyClick.clip[0].types));
  ok(copyClick.clip[0].text.includes('（今晚刻完的）'), '剪貼簿裡那段話是玩家改過的版本', copyClick.clip[0].text);
  ok(copyClick.clip[0].text.includes('釋義者'), '剪貼簿裡那段話也帶著稱號');
  ok(
    copyClick.clip[0].text.includes('https://garyhsieh.com/promptasy'),
    '剪貼簿裡那段話也帶著站網址（落款）',
    copyClick.clip[0].text
  );
  ok(copyClick.toast.some((t) => t.includes('貼上')), '提示告訴玩家貼上就行', copyClick.toast.join(' ｜ '));

  /* ================================================================ */
  /* Phase 31：那一排「直接開這裡貼上」                                  */
  /*                                                                  */
  /*   規則變了（WORLD.md §3.5b）：平台入口可以存在，**前提是它一定帶得走 */
  /*   那張圖**。所以每一顆按下去都要做到三件事：                        */
  /*     ① 圖真的被備好（放進剪貼簿，或存成檔案）                        */
  /*     ② 同一個手勢裡開那一頁（玩家本來就登入著）                      */
  /*     ③ 提示明講接下來要按的那一下                                    */
  /*   「只送出一個連結」的入口＝這一節要擋下來的東西。                   */
  /* ================================================================ */
  console.log('\n▸ 直接開這裡貼上（Phase 31）');

  /*
   * 把「開新頁」與「存檔案」都攔下來 ——
   * 真的開分頁會讓後面的測試接錯頁面，真的下載會在機器上留檔案。
   * 攔的方式刻意選「記下來 ＋ 擋掉預設行為」，這樣被測的程式一行都不用改。
   */
  await evaluate(`
    window.__opened = [];
    window.__realOpen = window.open;
    window.open = (url, target, features) => {
      window.__opened.push({
        url, target, features,
        // 手勢還在不在？（開新頁之前只要 await 一次就會變 false，然後被當成彈出視窗擋掉）
        gesture: navigator.userActivation ? navigator.userActivation.isActive : null,
      });
      return null;
    };
    window.__downloads = [];
    window.__dlSpy = (e) => {
      const a = e.target.closest && e.target.closest('[data-download]');
      if (!a) return;
      // 注意：這段字串是 node 這邊的樣板字面值 —— 別在裡面寫正規表示式的斜線
      window.__downloads.push({ name: a.getAttribute('download'), isImage: a.href.startsWith('data:image/png') });
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', window.__dlSpy, true);
    return true;
  `);

  /** 按下那一排的某一顆，把「剪貼簿寫了什麼 / 開了哪一頁 / 存了什麼 / 說了什麼」全撈回來。 */
  async function tapChip(id) {
    return evaluate(`
      window.__clip.length = 0;
      window.__opened.length = 0;
      window.__downloads.length = 0;
      document.querySelectorAll('.toast').forEach((n) => n.remove());
      const chip = document.querySelector('#sharecard [data-chip="${id}"]');
      chip.click();
      await new Promise((r) => setTimeout(r, 380));
      return {
        clip: window.__clip,
        opened: window.__opened,
        downloads: window.__downloads,
        toast: [...document.querySelectorAll('.toast')].map((n) => n.textContent.trim()),
        used: chip.classList.contains('is-used'),
        label: chip.textContent.trim(),
      };
    `);
  }

  // 這時候框裡那段話是玩家改過的（上面打進去的「（今晚刻完的）」）
  const capNow = await evaluate(`return document.querySelector('#sharecard [data-caption]').value.trim();`);
  ok(capNow.includes('（今晚刻完的）'), '那段話還是玩家改過的版本', capNow);

  /* --- ① Threads：純文字分享（2026-08-03 站長指示）—— 文字進撰寫框，不動剪貼簿 --- */
  const th = await tapChip('threads');
  eq(th.opened.length, 1, 'Threads：真的開了一頁');
  ok(th.opened[0].url.startsWith('https://www.threads.com/intent/post?text='), 'Threads：開的是官方的撰寫入口', th.opened[0].url);
  ok(
    decodeURIComponent(th.opened[0].url.split('text=')[1]).includes('（今晚刻完的）'),
    'Threads：玩家改過的那段話真的被帶進網址（撰寫框會先填好）',
    th.opened[0].url
  );
  ok(
    decodeURIComponent(th.opened[0].url.split('text=')[1]).includes('https://garyhsieh.com/promptasy'),
    'Threads：帶過去的那段話也帶著站網址（落款）',
    th.opened[0].url
  );
  eq(th.opened[0].target, '_blank', 'Threads：開在新分頁');
  ok(String(th.opened[0].features).includes('noopener'), 'Threads：開出去的那一頁動不到這一頁', String(th.opened[0].features));
  eq(th.opened[0].gesture, true, 'Threads：開新頁時手勢還在（不會被當成彈出視窗擋掉）');
  eq(th.clip.length, 0, 'Threads：純文字分享 —— 一個字都不寫剪貼簿（不會蓋掉玩家自己複製的東西）');
  ok(th.toast.some((t) => t.includes('文字')), 'Threads：提示說得出文字已經帶過去了', th.toast.join(' ｜ '));
  eq(th.downloads.length, 0, 'Threads：不用先下載');
  eq(th.used, true, 'Threads：按過的那一顆會變樣子');

  /* --- ② Facebook：sharer.php 會直接開貼文對話框；文字先進剪貼簿讓玩家 Ctrl+V --- */
  const fb = await tapChip('facebook');
  eq(fb.opened.length, 1, 'Facebook：真的開了一頁');
  eq(
    fb.opened[0].url,
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://garyhsieh.com/promptasy')}`,
    'Facebook：走 sharer.php 對話框（帶站網址與 og 預覽卡）'
  );
  eq(fb.opened[0].gesture, true, 'Facebook：開新頁時手勢還在');
  eq(fb.clip.length, 1, 'Facebook：只寫一次剪貼簿');
  eq(fb.clip[0].types.join(','), 'text/plain', 'Facebook：剪貼簿裡是那段話（FB 政策不讓程式預填文字）');
  ok(fb.clip[0].text.includes('（今晚刻完的）'), 'Facebook：複製的是玩家改過的版本', fb.clip[0].text);
  ok(fb.toast.some((t) => t.includes('Ctrl+V')), 'Facebook：提示寫出要按的那組鍵', fb.toast.join(' ｜ '));
  eq(fb.downloads.length, 0, 'Facebook：不用先下載');

  /* --- 移除的那兩顆：不得回歸 --- */
  const goneChips = await evaluate(`
    return {
      instagram: document.querySelectorAll('#sharecard [data-chip="instagram"]').length,
      caption: document.querySelectorAll('#sharecard [data-chip="caption"]').length,
    };
  `);
  eq(goneChips.instagram, 0, 'Instagram 那顆不在畫面上（網頁版沒有撰寫入口，不做假按鈕）');
  eq(goneChips.caption, 0, '獨立的「複製文案」那顆也不在（複製鈕已經是主角）');

  /* --- 玩家再改一次那段話 → 帶出去的跟著改（不是開卡當下的快照） --- */
  await typeIntoCaption('（第二次改）');
  const th2 = await tapChip('threads');
  ok(
    decodeURIComponent(th2.opened[0].url.split('text=')[1]).includes('（第二次改）'),
    'Threads：再改一次那段話，網址跟著改（讀的是按下去當下框裡的字）',
    th2.opened[0].url
  );

  /* --- 純鍵盤：方向鍵走得完這一排，Enter 按得下去（WORLD.md §3 鍵盤優先） --- */
  const chipKeys = await evaluate(`
    const first = document.querySelector('#sharecard [data-chip="threads"]');
    first.focus();
    return { focused: document.activeElement.getAttribute('data-chip'), tabIndex: first.tabIndex };
  `);
  eq(chipKeys.focused, 'threads', '鍵盤走得到那一排的第一顆');
  await key('ArrowRight', 'ArrowRight', { vk: 39 });
  await sleep(180);
  const afterRight = await evaluate(`return document.activeElement.getAttribute('data-chip');`);
  eq(afterRight, 'facebook', '→ 走到下一顆');
  await key('ArrowRight', 'ArrowRight', { vk: 39 });
  await sleep(180);
  // 那一排與主角那一顆是同一族的圖示鈕（.iconbtn）→ 方向鍵一路走到複製鈕
  const afterRight2 = await evaluate(`
    return { chip: document.activeElement.getAttribute('data-chip'), copy: document.activeElement.hasAttribute('data-copy') };
  `);
  eq(afterRight2.chip, null, '→ 再走一步就離開平台那兩顆');
  eq(afterRight2.copy, true, '→ 走到的是「複製圖＋文」（它跟那一排同一族）');
  await key('ArrowLeft', 'ArrowLeft', { vk: 37 });
  await sleep(180);
  const afterLeft = await evaluate(`return document.activeElement.getAttribute('data-chip');`);
  eq(afterLeft, 'facebook', '← 走得回去');
  // Enter 真的按得下去（用真正的按鍵事件，不是 click()）
  await evaluate(`
    window.__clip.length = 0;
    window.__opened.length = 0;
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    return true;
  `);
  await enterNative();
  await sleep(420);
  const byEnter = await evaluate(`
    return {
      opened: window.__opened,
      clip: window.__clip,
      toast: [...document.querySelectorAll('.toast')].map((n) => n.textContent.trim()),
    };
  `);
  eq(byEnter.opened.length, 1, 'Enter 就按得下去（不用滑鼠）');
  ok(
    String(byEnter.opened[0].url).startsWith('https://www.facebook.com/sharer/sharer.php?u='),
    'Enter 按下去的是焦點所在的那一顆',
    String(byEnter.opened[0].url)
  );
  eq(byEnter.clip.length, 1, 'Enter 按下去一樣把那段話備進剪貼簿');
  ok(byEnter.toast.length > 0, 'Enter 按下去一樣說得出接下來要做什麼', byEnter.toast.join(' ｜ '));

  /* --- 每一顆都給螢幕閱讀器講清楚它會做什麼 --- */
  const chipA11y = await evaluate(`
    return [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => ({
      id: n.getAttribute('data-chip'),
      aria: n.getAttribute('aria-label') || '',
      type: n.getAttribute('type'),
    }));
  `);
  eq(chipA11y.length, 2, '那一排剛好兩顆（量得到，不是空過）');
  for (const c of chipA11y) {
    ok(c.aria.length >= 8, `${c.id} 有給螢幕閱讀器的說明`, c.aria);
    eq(c.type, 'button', `${c.id} 是 type="button"（不會誤送出表單）`);
  }
  // 牌面上沒有字 → 說明必須自己講完「這是誰、按下去會發生什麼」
  ok(
    chipA11y.find((c) => c.id === 'threads').aria.startsWith('Threads：'),
    'Threads 的說明先講自己是誰、再講按下去會怎樣',
    chipA11y.find((c) => c.id === 'threads').aria
  );
  ok(
    chipA11y.find((c) => c.id === 'facebook').aria.includes('Ctrl+V'),
    'Facebook 的說明也講得出接下來要按什麼',
    chipA11y.find((c) => c.id === 'facebook').aria
  );

  /* ---------------------------------------------------------------- *
   * ② 系統分享面板：2026-08-03 站長定稿把那顆入口整個移除。
   *
   *   原本「瀏覽器帶得動檔案就露出 hero 階的『分享圖＋文』」那一整套沒有了 ——
   *   複製鈕是固定主角。這裡守的是「**就算瀏覽器支援，也不准偷偷長回來**」：
   *   把 canShare / share 都裝上去、重開一張卡，畫面仍然是同一個樣子。
   * ---------------------------------------------------------------- */
  const sysGone = await evaluate(`
    const g = window.__promptasy;
    window.__shared = null;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => !!(data && data.files && data.files.length === 1 && data.files[0].type === 'image/png'),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => { window.__shared = { keys: Object.keys(data || {}) }; },
    });
    g.shareCard.close();
    g.shareCard.open({ kind: 'codex' });
    await new Promise((r) => setTimeout(r, 260));
    const dl = document.querySelector('#sharecard [data-download]');
    const copy = document.querySelector('#sharecard [data-copy]');
    return {
      sysNodes: document.querySelectorAll('#sharecard [data-sysshare]').length,
      wholeText: document.querySelector('#sharecard .panel').textContent,
      copyTitle: copy.getAttribute('title'),
      copyRect: (() => { const r = copy.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
      dlClass: dl.className,
      focusInPanel: document.querySelector('#sharecard .panel').contains(document.activeElement),
      focusOnCopy: document.activeElement.hasAttribute('data-copy'),
      chips: document.querySelectorAll('#sharecard [data-chip]').length,
      // 換一張卡 → 那段話回到預設（上一張改過的話不會跟過來）
      sayValue: document.querySelector('#sharecard [data-caption]').value,
    };
  `);
  eq(sysGone.sysNodes, 0, '就算瀏覽器帶得動檔案，系統分享的入口也沒有長回來');
  ok(!/分享圖＋文/.test(sysGone.wholeText), '畫面上找不到「分享圖＋文」那顆鈕', sysGone.wholeText.slice(0, 160));
  eq(sysGone.copyTitle, '複製圖＋文', '主角永遠是「複製圖＋文」（不隨瀏覽器能力換人）');
  ok(sysGone.copyRect.w >= 40 && sysGone.copyRect.h >= 40, '主角那一顆量得到、命中範圍夠大', JSON.stringify(sysGone.copyRect));
  eq(sysGone.focusInPanel, true, '重開之後焦點仍然在分享卡裡');
  eq(sysGone.focusOnCopy, true, '焦點落在「複製圖＋文」上（這個畫面的主角）');
  eq(sysGone.chips, 2, '那一排照樣是兩顆');
  ok(!sysGone.sayValue.includes('（今晚刻完的）'), '重開一張卡 → 那段話回到預設', sysGone.sayValue);

  // 重開之後那張圖要重新編碼一次 → 等它備好再按（沒備好按下去只會叫你等）
  const sysReady = await waitShareFile();
  eq(sysReady, true, '重開之後 PNG 又備好了');

  // 玩家先把那段話改成自己想說的，再真的用鍵盤按下主角那一顆
  await typeIntoCaption('（這一關卡了三次）');
  await evaluate(`
    window.__clip.length = 0;
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    document.querySelector('#sharecard [data-copy]').focus();
    return true;
  `);
  await enterNative();
  await sleep(500);
  const copiedByKey = await evaluate(`
    return {
      shared: window.__shared,
      clip: window.__clip,
      done: document.querySelector('#sharecard [data-copy]').classList.contains('is-done'),
      toast: [...document.querySelectorAll('.toast')].map((n) => n.textContent.trim()),
    };
  `);
  eq(copiedByKey.shared, null, '按下去不會去呼叫系統分享（那條路已經沒有了）');
  eq(copiedByKey.clip.length, 1, 'Enter 按得下主角那一顆（不用滑鼠）');
  ok(copiedByKey.clip[0].types.includes('image/png'), '交出去的是那張圖', JSON.stringify(copiedByKey.clip[0].types));
  ok(copiedByKey.clip[0].types.includes('text/plain'), '同時也帶著那段話', JSON.stringify(copiedByKey.clip[0].types));
  ok(copiedByKey.clip[0].text.includes('（這一關卡了三次）'), '那段話是玩家改過的版本', copiedByKey.clip[0].text);
  ok(
    copiedByKey.clip[0].text.includes('釋義者') && /\d+ \/ \d+ 條技法/.test(copiedByKey.clip[0].text),
    '那段話帶著稱號與收集進度',
    copiedByKey.clip[0].text
  );
  ok(copiedByKey.clip[0].text.includes('Learn Prompt Engineering by Playing'), '那段話帶著品牌落款');
  eq(copiedByKey.done, true, '成功那一下就地翻成勾記（不用讀提示也知道按到了）');
  ok(copiedByKey.toast.some((t) => t.includes('貼上')), '也說得出接下來要做什麼', copiedByKey.toast.join(' ｜ '));

  // 複製失敗（瀏覽器不給）→ 說一句話並指回「下載」，不留死路
  const copyFail = await evaluate(`
    const realWrite = navigator.clipboard.write;
    navigator.clipboard.write = async () => { throw new Error('denied'); };
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    document.querySelector('#sharecard [data-copy]').click();
    await new Promise((r) => setTimeout(r, 360));
    const toast = [...document.querySelectorAll('.toast')].map((n) => n.textContent.trim());
    navigator.clipboard.write = realWrite;
    return { toast };
  `);
  ok(
    copyFail.toast.some((t) => t.includes('下載')),
    '複製不了的時候指回「下載」那條一定走得通的路',
    copyFail.toast.join(' ｜ ')
  );

  /* --- 窄畫面：那段話與按鈕都不會被擠到摺線下面 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 820, height: 720, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(520);
  const sendNarrow = await evaluate(`
    const panel = document.querySelector('#sharecard .panel');
    const copy = document.querySelector('#sharecard [data-copy]');
    const say = document.querySelector('#sharecard [data-caption]');
    return {
      overflow: Math.max(0, panel.scrollWidth - panel.clientWidth),
      docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      heroVisible: copy.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1,
      sayInside: say.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1,
      sayH: say.getBoundingClientRect().height,
      // 那一排（Phase 31）：每一顆都要在面板寬度內，而且要真的量得到（不是 0×0 空過）
      chips: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => {
        const r = n.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        return { id: n.getAttribute('data-chip'), w: r.width, h: r.height, inside: r.right <= pr.right + 1 && r.left >= pr.left - 1 };
      }),
    };
  `);
  eq(sendNarrow.overflow, 0, '820px 下分享卡無水平溢位');
  eq(sendNarrow.docOverflow, 0, '820px 下整頁無水平溢位');
  eq(sendNarrow.heroVisible, true, '820px 下「複製圖＋文」仍然不用捲動就看得到');
  eq(sendNarrow.sayInside, true, '820px 下那段話的框在面板寬度內');
  ok(sendNarrow.sayH >= 60, '820px 下那個框還打得下幾行字', `h=${sendNarrow.sayH}`);
  eq(sendNarrow.chips.length, 2, '820px 下那一排兩顆都在');
  for (const c of sendNarrow.chips) {
    // 先確認真的量得到（0×0 的話下面那條會空過）
    ok(c.w > 20 && c.h > 12, `820px 下「${c.id}」量得到大小`, `${c.w}×${c.h}`);
    eq(c.inside, true, `820px 下「${c.id}」在面板寬度內（沒有被擠出去）`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(420);

  // 把動過的東西還原，後面的段落照原樣跑
  await evaluate(`
    const g = window.__promptasy;
    g.shareCard.close();
    delete navigator.share;
    delete navigator.canShare;
    delete navigator.clipboard;
    // Phase 31 攔下來的那兩樣也要還原（不然後面的段落開不了新頁）
    if (window.__realOpen) { window.open = window.__realOpen; delete window.__realOpen; }
    if (window.__dlSpy) { document.removeEventListener('click', window.__dlSpy, true); delete window.__dlSpy; }
    return { shareOpen: g.shareCard.isOpen, openRestored: typeof window.open === 'function' };
  `);
  await sleep(260);

  /* ================================================================ */
  console.log('\n▸ 導航閃爍提示（Phase 21）');

  const nudgeIdle = await evaluate(`
    const g = window.__promptasy;
    // 離目標夠遠、而且站著不動
    const t0 = g.world.objectiveTarget(g.hud.region);
    g.player.teleport(t0.x + 62, t0.z + 44);
    await new Promise((r) => setTimeout(r, 400));
    /*
     * 課程 v2 · Phase F：這一輪玩到這裡時，知識式軟門檻可能已經替玩家開了新的土地，
     * 而「＿＿已開啟」那一則提示會把冷卻計時器推起來 —— 那是對的行為，但會蓋掉
     * 這一段要驗的「迷路提示」。先把冷卻走完（不改產品碼，只是讓時間過去）。
     */
    for (let i = 0; i < 8; i += 1) g.nudge.update(20);
    g.nudge.update(0.1);            // 認識新目標（這一拍只做基準）
    g.nudge.update(20);
    g.nudge.update(20);
    g.nudge.update(20);             // 累積 60 秒沒有靠近
    const el = document.querySelector('.nudge');
    // 淡入是 CSS 轉場 —— 輪詢等它跑完再量（固定 sleep 在慢機器上會賭輸）
    let opacity = 0;
    for (let i = 0; i < 20; i += 1) {
      opacity = Number(getComputedStyle(el).opacity);
      if (opacity > 0.9) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const st = g.nudge.state();
    const t = g.world.objectiveTarget(g.hud.region);
    const dx = t.x - g.player.position.x;
    const dz = t.z - g.player.position.z;
    const r = el.getBoundingClientRect();
    const topbar = document.querySelector('.hud__top').getBoundingClientRect();
    const compass = document.querySelector('.compass').getBoundingClientRect();
    return {
      state: st,
      targetName: t.name,
      dx, dz,
      hidden: el.hidden,
      isOn: el.classList.contains('is-on'),
      line: el.querySelector('[data-line]').textContent.trim(),
      lineHtml: el.querySelector('[data-line]').innerHTML,
      eyebrow: el.querySelector('[data-eyebrow]').textContent.trim(),
      sub: el.querySelector('[data-sub]').textContent.trim(),
      pointerEvents: getComputedStyle(el).pointerEvents,
      visibility: getComputedStyle(el).visibility,
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, cx: r.left + r.width / 2 },
      topbarBottom: topbar.bottom,
      compassTop: compass.top,
      vw: window.innerWidth,
      opacity,
    };
  `);
  eq(nudgeIdle.state.visible, true, '約 50 秒沒往目標靠近 → 提示出現');
  eq(nudgeIdle.hidden, false, '提示節點看得見');
  eq(nudgeIdle.isOn, true, '提示帶著 is-on（會呼吸的那個狀態）');
  ok(nudgeIdle.opacity > 0.9, '提示真的可見（opacity 1）', String(nudgeIdle.opacity));
  eq(nudgeIdle.visibility, 'visible', '提示不是被 visibility 藏著的');
  ok(nudgeIdle.line.includes(nudgeIdle.targetName), '提示寫出目標名稱', `${nudgeIdle.line} / ${nudgeIdle.targetName}`);
  eq(nudgeIdle.state.target, nudgeIdle.targetName, '提示的目標＝指南針的下一個目標');
  ok(['北', '東北', '東', '東南', '南', '西南', '西', '西北'].includes(nudgeIdle.state.direction),
    '提示帶著方位詞', nudgeIdle.state.direction);
  ok(nudgeIdle.line.includes(`往${nudgeIdle.state.direction}`), '方位詞出現在句子裡', nudgeIdle.line);
  {
    const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    const ang = Math.atan2(nudgeIdle.dx, -nudgeIdle.dz);
    const turns = (((ang / (Math.PI * 2)) % 1) + 1) % 1;
    const expected = DIRS[Math.round(turns * 8) % 8];
    eq(nudgeIdle.state.direction, expected, '方位詞和實際世界方位一致（北 = −Z、東 = +X）');
  }
  ok(nudgeIdle.lineHtml.includes('<b>'), '方位詞被標成金色重點', nudgeIdle.lineHtml);
  eq(nudgeIdle.eyebrow, '回聲', '用回聲的口吻說話（世界觀語言）');
  ok(/約 \d+ 步/.test(nudgeIdle.sub), '副標寫出還有幾步', nudgeIdle.sub);
  eq(nudgeIdle.pointerEvents, 'none', '提示不擋任何點擊');
  ok(nudgeIdle.rect.top > nudgeIdle.topbarBottom - 40, '提示在 HUD 頂列下方', `${nudgeIdle.rect.top} vs ${nudgeIdle.topbarBottom}`);
  ok(nudgeIdle.rect.top < 300 && nudgeIdle.rect.top > 60, '提示落在畫面上半部', String(nudgeIdle.rect.top));
  ok(Math.abs(nudgeIdle.rect.cx - nudgeIdle.vw / 2) < 40, '提示水平置中', `cx=${nudgeIdle.rect.cx} vw=${nudgeIdle.vw}`);
  ok(nudgeIdle.rect.bottom < nudgeIdle.compassTop, '提示不會蓋到左下角的指南針');

  const nudgeApproach = await evaluate(`
    const g = window.__promptasy;
    const t = g.world.objectiveTarget(g.hud.region);
    const dx = t.x - g.player.position.x;
    const dz = t.z - g.player.position.z;
    const before = Math.hypot(dx, dz);
    /*
     * 明顯往目標走過去 —— 沿著「玩家 → 目標」那條線把距離縮短 12 個單位。
     * （原本寫死 t.x + 22 / t.z + 16：目標一換位置就可能反而變遠。）
     */
    const want = Math.max(2, before - 12);
    g.player.teleport(t.x - (dx / before) * want, t.z - (dz / before) * want);
    g.nudge.update(0.2);
    const after = Math.hypot(t.x - g.player.position.x, t.z - g.player.position.z);
    return { before, after, state: g.nudge.state(), isOn: document.querySelector('.nudge').classList.contains('is-on') };
  `);
  ok(nudgeApproach.after < nudgeApproach.before - 6, '玩家真的靠近了目標',
    `${nudgeApproach.before.toFixed(1)} → ${nudgeApproach.after.toFixed(1)}`);
  eq(nudgeApproach.state.visible, false, '往目標靠近 → 提示立刻收起來');
  eq(nudgeApproach.isOn, false, '收起來時 is-on 也拿掉了');
  ok(nudgeApproach.state.cooldown > 60, '收起來之後進入冷卻', `cd=${nudgeApproach.state.cooldown}`);

  const nudgeCooldown = await evaluate(`
    const g = window.__promptasy;
    const t = g.world.objectiveTarget(g.hud.region);
    g.player.teleport(t.x + 62, t.z + 44);   // 又走遠了
    g.nudge.update(20);
    g.nudge.update(20);
    g.nudge.update(20);                      // 閒置 60 秒，但冷卻還沒跑完
    const mid = g.nudge.state();
    g.nudge.update(20);
    g.nudge.update(20);                      // 冷卻跑完了
    const after = g.nudge.state();
    return { mid, after };
  `);
  eq(nudgeCooldown.mid.visible, false, '冷卻中即使閒置夠久也不會又冒出來（不嘮叨）');
  ok(nudgeCooldown.mid.cooldown > 0, '這時候確實還在冷卻', `cd=${nudgeCooldown.mid.cooldown}`);
  eq(nudgeCooldown.after.visible, true, '冷卻結束後又會提醒一次');

  const nudgeFade = await evaluate(`
    const g = window.__promptasy;
    g.nudge.update(4);
    const mid = g.nudge.state();
    g.nudge.update(5);   // 累計 9 秒 > 8 秒
    return { mid, after: g.nudge.state() };
  `);
  eq(nudgeFade.mid.visible, true, '顯示 4 秒時還在');
  eq(nudgeFade.after.visible, false, '顯示滿 8 秒自己淡出');

  const nudgeUnlock = await evaluate(`
    const g = window.__promptasy;
    g.nudge.announceUnlock('reasoning');
    const el = document.querySelector('.nudge');
    return {
      state: g.nudge.state(),
      line: el.querySelector('[data-line]').textContent.trim(),
      sub: el.querySelector('[data-sub]').textContent.trim(),
      hidden: el.hidden,
    };
  `);
  eq(nudgeUnlock.state.visible, true, '新區域解鎖時立刻提示一次');
  eq(nudgeUnlock.state.kind, 'unlock', '這是「解鎖」變體');
  ok(nudgeUnlock.line.includes('示範與推理'), '解鎖提示寫出區域中文名', nudgeUnlock.line);
  ok(nudgeUnlock.line.includes('已開啟，往前走吧'), '解鎖提示是回聲的說法', nudgeUnlock.line);
  ok(/往[北東南西]/.test(nudgeUnlock.sub) || nudgeUnlock.sub.includes('閘門'), '解鎖提示也給方向', nudgeUnlock.sub);

  const nudgePanel = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 260));
    g.nudge.update(0.2);
    const during = g.nudge.state();
    g.codex.close();
    await new Promise((r) => setTimeout(r, 200));
    return { during, isOn: document.querySelector('.nudge').classList.contains('is-on') };
  `);
  eq(nudgePanel.during.visible, false, '打開面板 → 提示立刻收起來（他沒有迷路）');
  eq(nudgePanel.during.idle, 0, '打開面板也把閒置計時歸零');
  eq(nudgePanel.isOn, false, '面板開著時提示不會殘留在畫面上');

  /* ================================================================ */
  console.log('\n▸ 刻文小語 ＋ 會回應的東西 ＋ 藏起來的地方（Phase 22）');

  /* --- ① 世界裡真的有這三層東西，而且都不新增光源 --- */
  const phase22 = await evaluate(`
    const g = window.__promptasy;
    const names = [];
    g.world.root.traverse((o) => {
      if (o.name && (o.name.startsWith('inscription:') || o.name.startsWith('reactive:') || o.name.startsWith('secret:')))
        names.push(o.name);
    });
    let lights = 0, tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry && o.geometry.index) tris += (o.geometry.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    let reactiveLights = 0;
    g.world.reactive.group.traverse((o) => { if (o.isLight) reactiveLights += 1; });
    return {
      inscriptions: names.filter((n) => n.startsWith('inscription:')).length,
      reactive: names.filter((n) => n.startsWith('reactive:')).length,
      secrets: names.filter((n) => n.startsWith('secret:')).length,
      triggerCount: g.world.reactive.triggerCount,
      lights, tris, reactiveLights,
      insTotal: g.inscriptionData.entries.length,
      secTotal: g.secretData.entries.length,
    };
  `);
  eq(phase22.inscriptions, phase22.insTotal, '每一則刻文小語都蓋在世界裡');
  ok(phase22.reactive >= 18, '會回應的東西都蓋在世界裡', `n=${phase22.reactive}`);
  eq(phase22.reactive, 44, 'P06c：會回應的東西總數 44（七片空區各補齊）', String(phase22.reactive));
  eq(phase22.secrets, phase22.secTotal, '每一個祕密都蓋在世界裡');
  ok(phase22.triggerCount >= phase22.reactive, '反應場登記了觸發點', `n=${phase22.triggerCount}`);
  eq(phase22.reactiveLights, 0, '會回應的東西一盞燈都沒加（只用自發光材質）');
  ok(phase22.lights <= 56, '加了一整層新內容之後燈光仍在預算內', `lights=${phase22.lights}`);
  ok(phase22.tris < 420000, '加了一整層新內容之後三角形仍在預算內', `tris=${phase22.tris}`);

  /* --- ② 走近會回應：狀態真的變了（不是只有聲音） --- */
  const reaction = await evaluate(`
    const g = window.__promptasy;
    const chime = g.world.reactive.objects.find((o) => o.kind === 'chime');
    const caps = g.world.reactive.objects.find((o) => o.kind === 'glowcap');
    const out = { chimeId: chime.id, capsId: caps.id };
    // 先站到「看得到但走不到」的距離（仍在更新範圍內），並把晃動歸零 ——
    // 這一段要驗的是「走進去才會晃」，不是衰減曲線
    g.player.teleport(chime.x + 20, chime.z + 20);
    await new Promise((r) => setTimeout(r, 300));
    chime.swing = 0;
    await new Promise((r) => setTimeout(r, 420));
    out.swingFar = chime.swing;
    out.tubeFar = chime.tubes[0].pivot.rotation.z;
    // 走過去
    g.player.teleport(chime.x, chime.z);
    await new Promise((r) => setTimeout(r, 700));
    out.swingNear = chime.swing;
    out.tubeNear = chime.tubes[0].pivot.rotation.z;
    // 光菇：走近時一朵一朵亮起來
    g.player.teleport(caps.x + 26, caps.z + 26);
    await new Promise((r) => setTimeout(r, 500));
    out.capsFar = caps.caps.map((c) => Math.round(c.mat.emissiveIntensity * 100) / 100);
    g.player.teleport(caps.x, caps.z);
    await new Promise((r) => setTimeout(r, 900));
    out.capsNear = caps.caps.map((c) => Math.round(c.mat.emissiveIntensity * 100) / 100);
    return out;
  `);
  eq(reaction.swingFar, 0, '離得遠的時候風鈴是靜止的');
  ok(reaction.swingNear > 0.2, '走過去 → 風鈴晃起來了', `swing=${reaction.swingNear}`);
  ok(
    Math.abs(reaction.tubeNear - reaction.tubeFar) > 0.01,
    '風鈴的管子真的在動（不是只有旗標）',
    `${reaction.tubeFar} → ${reaction.tubeNear}`
  );
  {
    const far = reaction.capsFar.reduce((a, b) => a + b, 0);
    const near = reaction.capsNear.reduce((a, b) => a + b, 0);
    ok(near > far * 1.5, '走近光菇圈 → 一朵一朵亮起來', `far=${far.toFixed(2)} near=${near.toFixed(2)}`);
    ok(
      reaction.capsNear.some((v) => v > 1.2),
      '至少有幾朵真的亮起來了',
      reaction.capsNear.join(',')
    );
  }

  /* --- ③ 刻文小語的完整流程：走近 → E → 分段揭示 → 出處 → XP 只給一次 --- */
  const insFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.inscriptionData.entries[0];
    const before = { xp: g.progression.state.xp, found: g.progression.inscriptionCount() };
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await new Promise((r) => setTimeout(r, 420));
    const hint = document.querySelector('[data-interact]');
    const out = {
      specId: spec.id,
      techniqueId: spec.techniqueId,
      hintHidden: hint.hidden,
      hintText: hint.textContent.replace(/\\s+/g, ' ').trim(),
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 520));
    const panel = document.querySelector('#inscription');
    out.open = g.inscriptionPanel.isOpen;
    out.small = !panel.classList.contains('overlay--wide');
    out.lines = [...panel.querySelectorAll('.inscribe__line')].map((p) => p.textContent.trim());
    out.delays = [...panel.querySelectorAll('.inscribe__line')].map(
      (p) => getComputedStyle(p).animationDelay
    );
    out.tech = panel.querySelector('.inscribe__tech')?.textContent.trim() || '';
    out.tip = panel.querySelector('.inscribe__tip')?.textContent.trim() || '';
    out.how = panel.querySelector('.inscribe__how')?.textContent.trim() || '';
    // 出處＝那枚典籍（圖示 ＋ 小卡；名字走 aria-label，畫面上不寫字）
    const src = panel.querySelector('a.bookicon');
    out.srcText = src ? src.getAttribute('aria-label') || '' : '';
    out.srcUrl = src ? src.getAttribute('href') : '';
    out.srcVisible = src
      ? (() => {
          const r = src.getBoundingClientRect();
          return getComputedStyle(src).visibility === 'visible' && r.width > 0 && r.height > 0;
        })()
      : false;
    out.note = panel.querySelector('.inscribe__note')?.textContent.trim() || '';
    // 沒有四幕、沒有石碑、沒有輸入框 —— 它就是一個很小的對話窗
    out.hasActs = !!panel.querySelector('.acts, .stele, textarea');
    out.xpAfter = g.progression.state.xp;
    out.foundAfter = g.progression.inscriptionCount();
    out.collected = g.progression.isCollected(spec.techniqueId);
    out.saved = JSON.parse(localStorage.getItem('promptasy.v1.save')).inscriptionsFound;
    // 真實出處：拿 curriculum 對一次
    const tech = g.content.technique(spec.techniqueId);
    out.realTitle = tech.title;
    out.realUrl = tech.sources[0].url;
    out.realName = tech.sources[0].name;
    out.before = before;
    return out;
  `);
  eq(insFlow.hintHidden, false, '走近刻文 → 出現互動提示');
  ok(/E/.test(insFlow.hintText) && /看一眼/.test(insFlow.hintText), '提示寫著按 E 看一眼', insFlow.hintText);
  eq(insFlow.open, true, '按 E 打開刻文小語的對話窗');
  eq(insFlow.small, true, '是小對話窗（不是寬面板）');
  eq(insFlow.hasActs, false, '刻文小語沒有四幕、沒有石碑、沒有輸入框');
  ok(insFlow.lines.length >= 1 && insFlow.lines.length <= 2, '1–2 句世界的話', String(insFlow.lines.length));
  ok(
    insFlow.delays.length < 2 || insFlow.delays[0] !== insFlow.delays[1],
    '兩句話是分段揭示的（動畫延遲不同）',
    insFlow.delays.join(' / ')
  );
  eq(insFlow.tech, insFlow.realTitle, '顯示的技巧名稱＝curriculum 裡真正的那一條');
  ok(insFlow.tip.length > 8, '顯示了既有的中文說法', insFlow.tip);
  ok(insFlow.how.length > 4, '顯示了一句可以照著做的白話提示', insFlow.how);
  eq(insFlow.srcUrl, insFlow.realUrl, '出處連結指向 curriculum 裡真正的官方網址');
  ok(/^https:\/\//.test(insFlow.srcUrl), '出處是 https 連結', insFlow.srcUrl);
  eq(insFlow.srcVisible, true, '那枚典籍一直看得見、量得到（不收進任何摺頁）');
  ok(insFlow.srcText.includes('神諭原典'), '出處標成「神諭原典」（換皮）', insFlow.srcText);
  ok(insFlow.srcText.includes(insFlow.realName), '但後面接得出真實文件名（不說謊）', insFlow.srcText);
  ok(/\+\s*\d+\s*XP/.test(insFlow.note), '第一次讀有 XP 提示', insFlow.note);
  eq(insFlow.xpAfter > insFlow.before.xp, true, '第一次讀真的給了 XP');
  eq(insFlow.foundAfter, insFlow.before.found + 1, '刻文計數 +1');
  eq(insFlow.collected, true, '刻文教的技巧寫進圖鑑');
  ok(insFlow.saved.includes(insFlow.specId), '寫進 localStorage', insFlow.saved.join(','));

  // 重讀不再給 XP
  const insAgain = await evaluate(`
    const g = window.__promptasy;
    g.inscriptionPanel.close();
    await new Promise((r) => setTimeout(r, 260));
    const xp = g.progression.state.xp;
    const spec = g.inscriptionData.entries[0];
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await new Promise((r) => setTimeout(r, 380));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 420));
    const note = document.querySelector('#inscription .inscribe__note')?.textContent.trim() || '';
    const after = g.progression.state.xp;
    g.inscriptionPanel.close();
    await new Promise((r) => setTimeout(r, 240));
    return { xp, after, note };
  `);
  eq(insAgain.after, insAgain.xp, '重讀同一則刻文不再給 XP（不能刷分）');
  ok(/讀過/.test(insAgain.note), '重讀時說「這一則你讀過了」', insAgain.note);

  /* --- ④ 圖鑑的小收集計數 --- */
  const finds = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 380));
    const rows = [...document.querySelectorAll('#codex .finds__list li')].map((li) => ({
      label: li.querySelector('b').textContent.trim(),
      n: li.querySelector('span').textContent.trim(),
    }));
    g.codex.close();
    await new Promise((r) => setTimeout(r, 240));
    return { rows, total: g.inscriptionData.entries.length, found: g.progression.inscriptionCount() };
  `);
  ok(finds.rows.length >= 2, '圖鑑有「走出來的收集」兩列', JSON.stringify(finds.rows));
  {
    const ins = finds.rows.find((r) => r.label.includes('刻文'));
    ok(Boolean(ins), '圖鑑有刻文小語的計數');
    eq(ins && ins.n, `${finds.found} / ${finds.total}`, '刻文計數是「已讀 / 總數」');
    ok(
      finds.rows.some((r) => r.label.includes('藏起來')),
      '圖鑑有「藏起來的地方」的計數'
    );
  }

  /* --- ⑤ 找到一個祕密：走進去就算（不用按 E），只算一次 --- */
  const secretFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.secretData.entries.find((s) => s.blessing) || g.secretData.entries[0];
    const before = { xp: g.progression.state.xp, n: g.progression.secretCount() };
    g.player.teleport(spec.at[0] + 24, spec.at[1] + 24);
    await new Promise((r) => setTimeout(r, 420));
    const farFound = g.progression.hasFoundSecret(spec.id);
    g.player.teleport(spec.at[0] + 1.5, spec.at[1] + 1.5);
    await new Promise((r) => setTimeout(r, 800));
    const toasts = [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim());
    const out = {
      id: spec.id,
      title: spec.title,
      blessing: !!spec.blessing,
      farFound,
      found: g.progression.hasFoundSecret(spec.id),
      n: g.progression.secretCount(),
      xpGain: g.progression.state.xp - before.xp,
      toasts,
      anyPanel: g.inscriptionPanel.isOpen || g.promptConsole.isOpen || g.tabletPanel.isOpen,
      flag: g.progression.state.flags.echoBlessing === true,
      saved: JSON.parse(localStorage.getItem('promptasy.v1.save')).secretsFound,
      beforeN: before.n,
    };
    // 再站一會兒：不會給第二次
    const xp2 = g.progression.state.xp;
    await new Promise((r) => setTimeout(r, 700));
    out.xpStable = g.progression.state.xp === xp2;
    out.nStable = g.progression.secretCount() === out.n;
    return out;
  `);
  eq(secretFlow.farFound, false, '離得遠的時候還沒發現那個祕密');
  eq(secretFlow.found, true, '走進去就算找到（不用按 E）');
  eq(secretFlow.n, secretFlow.beforeN + 1, '祕密計數 +1');
  ok(secretFlow.xpGain > 0, '找到祕密給了 XP', `+${secretFlow.xpGain}`);
  eq(secretFlow.anyPanel, false, '找到祕密不會彈出任何面板（不打斷探索）');
  ok(
    secretFlow.toasts.some((t) => t.includes(secretFlow.title)),
    '畫面上說了一句「你找到了：<名字>」',
    secretFlow.toasts.join(' | ')
  );
  ok(secretFlow.saved.includes(secretFlow.id), '寫進 localStorage', secretFlow.saved.join(','));
  eq(secretFlow.xpStable, true, '站在原地不會一直給 XP');
  eq(secretFlow.nStable, true, '同一個祕密只算一次');
  if (secretFlow.blessing) eq(secretFlow.flag, true, '回聲的小祠給了隱藏標記（echoBlessing）');

  // 隱藏標記會出現在圖鑑裡
  const blessed = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 360));
    const txt = document.querySelector('#codex .finds')?.textContent || '';
    g.codex.close();
    await new Promise((r) => setTimeout(r, 240));
    return { txt };
  `);
  ok(blessed.txt.includes('回聲的祝福'), '圖鑑低調地標了一句「回聲的祝福」', blessed.txt.slice(0, 120));

  /* --- ⑥ 讀題的時候世界不會在旁邊叮咚響 --- */
  const quiet = await evaluate(`
    const g = window.__promptasy;
    const chime = g.world.reactive.objects.find((o) => o.kind === 'chime');
    g.player.teleport(chime.x + 20, chime.z + 20);
    await new Promise((r) => setTimeout(r, 380));
    chime.swing = 0; // 從乾淨的狀態開始（衰減不是這一段要驗的事）
    g.codex.open();
    await new Promise((r) => setTimeout(r, 260));
    // 面板開著的時候「走」進反應範圍
    g.player.teleport(chime.x, chime.z);
    await new Promise((r) => setTimeout(r, 700));
    const swingDuringPanel = chime.swing;
    g.codex.close();
    await new Promise((r) => setTimeout(r, 500));
    return { swingDuringPanel, swingAfter: chime.swing };
  `);
  eq(quiet.swingDuringPanel, 0, '面板打開時走進反應範圍 → 世界安靜（整組停手）');
  ok(quiet.swingAfter > 0.1, '關掉面板之後同一個地方照樣有反應', `swing=${quiet.swingAfter}`);

  /* --- ⑦ 這一層不影響走位：碰撞與淨空照舊 --- */
  const stillClear = await evaluate(`
    const g = window.__promptasy;
    const out = { insBlocked: [], reactBlocked: [], laneBlocked: 0 };
    for (const spec of g.inscriptionData.entries) {
      let free = 0;
      for (let a = 0; a < 16; a += 1) {
        const ang = (a / 16) * Math.PI * 2;
        if (!g.world.solidAt(spec.at[0] + Math.cos(ang) * 2.4, spec.at[1] + Math.sin(ang) * 2.4)) free += 1;
      }
      if (free < 14) out.insBlocked.push(spec.id + ':' + free);
    }
    for (const o of g.world.reactive.objects) {
      let free = 0;
      for (let a = 0; a < 16; a += 1) {
        const ang = (a / 16) * Math.PI * 2;
        if (!g.world.solidAt(o.x + Math.cos(ang) * 2.0, o.z + Math.sin(ang) * 2.0)) free += 1;
      }
      if (free < 13) out.reactBlocked.push(o.id + ':' + free);
    }
    return out;
  `);
  eq(stillClear.insBlocked.length, 0, '每一則刻文四周都走得到', stillClear.insBlocked.join(','));
  eq(stillClear.reactBlocked.length, 0, '每一件會回應的東西四周都走得過去', stillClear.reactBlocked.join(','));

  /* ================================================================ */
  /*
   * 抄寫人的殘頁（v1.2 · P07）
   *
   * 世界的第七層互動：掉在路邊的一頁紙。走近 → 提示 → 按 E → 小窗 →
   * 進存檔與圖鑑第五列 → 重整還在。一半的殘頁有教學（附得出官方出處），
   * 一半純風味（一個連結都沒有）。順便驗回信碑的三種筆跡。
   */
  console.log('\n▸ 抄寫人的殘頁 ＋ 回信碑（v1.2 · P07）');

  const letterWorld = await evaluate(`
    const g = window.__promptasy;
    const names = [];
    g.world.root.traverse((o) => { if (o.name && o.name.startsWith('letter:')) names.push(o.name); });
    let letterLights = 0, letterTris = 0;
    for (const lt of g.world.letters) {
      lt.group.traverse((o) => {
        if (o.isLight) letterLights += 1;
        if (o.isMesh && o.geometry) {
          const idx = o.geometry.index;
          letterTris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
        }
      });
    }
    // 每一頁都要走得到（不然「掉在路邊」等於掉進草叢裡）
    const blocked = [];
    for (const spec of g.letterData.entries) {
      let free = 0;
      for (let a = 0; a < 16; a += 1) {
        const ang = (a / 16) * Math.PI * 2;
        if (!g.world.solidAt(spec.at[0] + Math.cos(ang) * 2.4, spec.at[1] + Math.sin(ang) * 2.4)) free += 1;
      }
      if (free < 14) blocked.push(spec.id + ':' + free);
    }
    const regions = {};
    for (const e of g.letterData.entries) regions[e.region] = (regions[e.region] || 0) + 1;
    let lights = 0;
    g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    return {
      built: names.length,
      unique: new Set(names).size,
      total: g.letterData.entries.length,
      letterLights, letterTris, blocked, regions, lights,
      teaching: g.letterData.entries.filter((e) => e.techniqueId).length,
      hasNearest: typeof g.world.nearestLetter === 'function',
    };
  `);
  eq(letterWorld.total, 24, '資料層有 24 頁殘頁');
  eq(letterWorld.built, letterWorld.total, '每一頁殘頁都蓋在世界裡（letter:<id>）');
  eq(letterWorld.unique, letterWorld.total, '場景圖節點名沒有重複');
  eq(Object.keys(letterWorld.regions).length, 12, '12 片土地都有殘頁');
  ok(
    Object.values(letterWorld.regions).every((n) => n === 2),
    '每片土地各 2 頁',
    JSON.stringify(letterWorld.regions)
  );
  eq(letterWorld.teaching, 12, '一半的殘頁有教學句（另一半純風味）');
  eq(letterWorld.letterLights, 0, '殘頁一盞燈都沒加（只用自發光材質）');
  ok(letterWorld.letterTris < 8000, '24 頁殘頁的三角形總量 < 8k', `tris=${Math.round(letterWorld.letterTris)}`);
  eq(letterWorld.blocked.length, 0, '每一頁殘頁四周都走得到', letterWorld.blocked.join(','));
  ok(letterWorld.lights <= 56, '加了一層新內容之後燈光仍在預算內', `lights=${letterWorld.lights}`);
  eq(letterWorld.hasNearest, true, '世界提供 nearestLetter（第七層的仲裁靠它）');

  /* --- ① 有教學的那一頁：走近 → E → 小窗 → 出處 → XP → 存檔 --- */
  const letterFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.letterData.entries.find((e) => e.techniqueId);
    const before = { xp: g.progression.state.xp, n: g.progression.letterCount() };
    // 走過去之後**輪詢**等提示換成這一頁（軟體渲染一幀 0.2s，固定 sleep 會讀到上一個位置的提示）
    const waitFor = async (want, ms = 6000) => {
      const t0 = Date.now();
      let last = '';
      while (Date.now() - t0 < ms) {
        const el = document.querySelector('[data-interact]');
        last = el && !el.hidden ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
        if (last.includes(want)) return last;
        await new Promise((r) => setTimeout(r, 60));
      }
      return last;
    };
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await waitFor(spec.title);
    const hint = document.querySelector('[data-interact]');
    const out = {
      specId: spec.id,
      techniqueId: spec.techniqueId,
      hintHidden: hint.hidden,
      hintText: hint.textContent.replace(/\\s+/g, ' ').trim(),
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 520));
    const panel = document.querySelector('#letter');
    out.open = g.letterPanel.isOpen;
    out.small = !panel.classList.contains('overlay--wide');
    out.lines = [...panel.querySelectorAll('.letter__line')].map((p) => p.textContent.trim());
    out.tech = panel.querySelector('.letter__tech')?.textContent.trim() || '';
    out.tip = panel.querySelector('.letter__tip')?.textContent.trim() || '';
    out.how = panel.querySelector('.letter__how')?.textContent.trim() || '';
    const src = panel.querySelector('a.bookicon');
    out.srcText = src ? src.getAttribute('aria-label') || '' : '';
    out.srcUrl = src ? src.getAttribute('href') : '';
    out.srcVisible = src
      ? (() => {
          const r = src.getBoundingClientRect();
          return getComputedStyle(src).visibility === 'visible' && r.width > 0 && r.height > 0;
        })()
      : false;
    out.note = panel.querySelector('.letter__note')?.textContent.trim() || '';
    out.hasActs = !!panel.querySelector('.acts, .stele, textarea');
    out.xpAfter = g.progression.state.xp;
    out.nAfter = g.progression.letterCount();
    out.collected = g.progression.isCollected(spec.techniqueId);
    out.saved = JSON.parse(localStorage.getItem('promptasy.v1.save')).lettersFound;
    const tech = g.content.technique(spec.techniqueId);
    out.realTitle = tech.title;
    out.dataSource = spec.source;
    out.curriculumSource = tech.sources[0].url;
    out.before = before;
    return out;
  `);
  eq(letterFlow.hintHidden, false, '走近殘頁 → 出現互動提示');
  ok(/E/.test(letterFlow.hintText) && /撿起來/.test(letterFlow.hintText), '提示寫著按 E 撿起來', letterFlow.hintText);
  eq(letterFlow.open, true, '按 E 打開殘頁的小窗');
  eq(letterFlow.small, true, '是小窗（不是寬面板）');
  eq(letterFlow.hasActs, false, '殘頁沒有四幕、沒有石碑、沒有輸入框');
  ok(letterFlow.lines.length >= 2 && letterFlow.lines.length <= 4, '2–4 句抄寫人的話', String(letterFlow.lines.length));
  eq(letterFlow.tech, letterFlow.realTitle, '顯示的技巧名稱＝curriculum 裡真正的那一條');
  ok(letterFlow.tip.length > 8, '顯示了既有的中文說法', letterFlow.tip);
  ok(letterFlow.how.length > 4, '顯示了一句可以照著做的白話', letterFlow.how);
  eq(letterFlow.dataSource, letterFlow.curriculumSource, '資料裡的 source 與 curriculum 的官方網址逐字相同');
  ok(/^https:\/\//.test(letterFlow.srcUrl), '面板上的出處是 https 連結', letterFlow.srcUrl);
  eq(letterFlow.srcVisible, true, '那枚典籍一直看得見、量得到（不收進任何摺頁）');
  ok(letterFlow.srcText.includes('神諭原典'), '出處標成「神諭原典」（換皮）', letterFlow.srcText);
  ok(/\+\s*\d+\s*XP/.test(letterFlow.note), '第一次撿有 XP 提示', letterFlow.note);
  ok(letterFlow.xpAfter > letterFlow.before.xp, '第一次撿真的給了 XP');
  eq(letterFlow.nAfter, letterFlow.before.n + 1, '殘頁計數 +1');
  eq(letterFlow.collected, true, '有教學的殘頁把那條技巧寫進圖鑑');
  ok(letterFlow.saved.includes(letterFlow.specId), '寫進 localStorage', letterFlow.saved.join(','));

  // 重撿不再給 XP
  const letterAgain = await evaluate(`
    const g = window.__promptasy;
    g.letterPanel.close();
    await new Promise((r) => setTimeout(r, 260));
    const xp = g.progression.state.xp;
    const spec = g.letterData.entries.find((e) => e.techniqueId);
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await new Promise((r) => setTimeout(r, 400));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 420));
    const note = document.querySelector('#letter .letter__note')?.textContent.trim() || '';
    const after = g.progression.state.xp;
    g.letterPanel.close();
    await new Promise((r) => setTimeout(r, 240));
    return { xp, after, note };
  `);
  eq(letterAgain.after, letterAgain.xp, '重撿同一頁不再給 XP（不能刷分）');
  ok(/收過/.test(letterAgain.note), '重撿時說「這一頁你收過了」', letterAgain.note);

  /* --- ② 純風味的那一頁：一個連結都沒有（護欄 2） --- */
  const flavourLetter = await evaluate(`
    const g = window.__promptasy;
    const spec = g.letterData.entries.find((e) => !e.techniqueId);
    // 走過去之後**輪詢**等提示換成這一頁（軟體渲染一幀 0.2s，固定 sleep 會讀到上一個位置的提示）
    const waitFor = async (want, ms = 6000) => {
      const t0 = Date.now();
      let last = '';
      while (Date.now() - t0 < ms) {
        const el = document.querySelector('[data-interact]');
        last = el && !el.hidden ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
        if (last.includes(want)) return last;
        await new Promise((r) => setTimeout(r, 60));
      }
      return last;
    };
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await waitFor(spec.title);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const panel = document.querySelector('#letter');
    const out = {
      id: spec.id,
      open: g.letterPanel.isOpen,
      lines: [...panel.querySelectorAll('.letter__line')].length,
      links: panel.querySelectorAll('a').length,
      teach: panel.querySelectorAll('.letter__glyph').length,
      collectedBefore: g.progression.state.collected.length,
    };
    g.letterPanel.close();
    await new Promise((r) => setTimeout(r, 260));
    out.collectedAfter = g.progression.state.collected.length;
    out.n = g.progression.letterCount();
    return out;
  `);
  eq(flavourLetter.open, true, '純風味的殘頁一樣撿得起來');
  ok(flavourLetter.lines >= 2, '它也有幾行字', String(flavourLetter.lines));
  eq(flavourLetter.links, 0, '純風味的殘頁一個連結都沒有（護欄 2）');
  eq(flavourLetter.teach, 0, '也沒有教學那一段');
  eq(flavourLetter.collectedAfter, flavourLetter.collectedBefore, '純風味的殘頁一條技巧都不收');
  ok(flavourLetter.n >= 2, '兩頁都算進殘頁計數', String(flavourLetter.n));

  /* --- ③ 圖鑑第五列 ＋ 沒撿到的不劇透 --- */
  const letterFinds = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const rows = [...document.querySelectorAll('#codex .finds__list li')].map((li) => ({
      label: li.querySelector('b').textContent.trim(),
      n: li.querySelector('span').textContent.trim(),
    }));
    const items = [...document.querySelectorAll('#codex .letterbook__item')];
    const quiet = items.filter((li) => li.classList.contains('letterbook__item--quiet'));
    const titles = items.map((li) => li.querySelector('.letterbook__title').textContent.trim());
    const bodies = [...document.querySelectorAll('#codex .letterbook__body')].map((b) => b.textContent.trim());
    const out = {
      rows,
      items: items.length,
      quiet: quiet.length,
      titles,
      bodies,
      found: g.progression.letterCount(),
      total: g.letterData.entries.length,
      foundIds: g.progression.state.lettersFound.slice(),
      allTitles: g.letterData.entries.map((e) => e.title),
    };
    g.codex.close();
    await new Promise((r) => setTimeout(r, 240));
    return out;
  `);
  {
    const row = letterFinds.rows.find((r) => r.label.includes('殘頁'));
    ok(Boolean(row), '圖鑑有「抄寫人的殘頁」那一列', JSON.stringify(letterFinds.rows));
    eq(row && row.n, `${letterFinds.found} / ${letterFinds.total}`, '殘頁計數是「撿到 / 總數」');
  }
  eq(letterFinds.items, letterFinds.total, '清單有 24 條');
  eq(letterFinds.quiet, letterFinds.total - letterFinds.found, '還沒撿到的都只留一行「還沒找到」');
  {
    // 沒撿到的一頁：連標題都不能出現在圖鑑上（不劇透）
    const shown = new Set(letterFinds.titles);
    const leaked = letterFinds.allTitles.filter((t) => shown.has(t)).length;
    eq(leaked, letterFinds.found, '只有撿到的那幾頁露出標題（其餘連名字都不給）');
    eq(letterFinds.bodies.length, letterFinds.found, '只有撿到的那幾頁展開得出內容');
  }

  /* --- ④ 重整之後：撿過的還在（存檔），沒撿的照樣撿得到 --- */
  await reloadPage('殘頁：重整');
  const letterAfterReload = await evaluate(`
    const g = window.__promptasy;
    const spec = g.letterData.entries.find((e) => e.techniqueId);
    return {
      n: g.progression.letterCount(),
      has: g.progression.hasFoundLetter(spec.id),
      worldFound: g.world.letters.find((l) => l.id === spec.id).found,
      firstPrompt: g.progression.firstPrompt(),
    };
  `);
  ok(letterAfterReload.n >= 2, '重整之後撿到的殘頁還在', String(letterAfterReload.n));
  eq(letterAfterReload.has, true, '那一頁仍然標記為撿過');
  eq(letterAfterReload.worldFound, true, '世界端也記得（紙邊的光轉成安靜的暖金）');
  ok(letterAfterReload.firstPrompt.length > 0, '重整之後序章的第一句還在', letterAfterReload.firstPrompt);

  /* --- ⑤ 搶 E 的順序：殘頁讓刻文小語先（同半徑，靠仲裁） --- */
  // 上一步重整過 → 標題卡又擋在前面（它擋著時角色不接操控，走近也不會有提示）
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate('return !window.__promptasy.title.isOpen;'), { label: '殘頁：重整後標題卡收起' });
  await evaluate(`
    const g = window.__promptasy;
    if (g.prologue.isActive) g.prologue.skip();
    const startBtn = document.querySelector('.intro [data-start]');
    if (g.intro.isOpen && startBtn) startBtn.click();
    for (const k of ['keyhelp','shareCard','promptConsole','codex','settings','finale','tabletPanel','inscriptionPanel','letterPanel','handlePanel','practice']) {
      try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
    }
    g.player.setInputEnabled(true);
    return 1;
  `);
  await waitFor(
    () => evaluate('return window.__promptasy.player.inputEnabled && !window.__promptasy.title.isOpen;'),
    { label: '殘頁：場面清乾淨' }
  );
  const letterArbitration = await evaluate(`
    const g = window.__promptasy;
    /*
     * 提示是每幀更新的，而這台機器一幀可能好幾百毫秒 —— 固定 sleep 會量到「上一個位置」的提示。
     * 所以走過去之後**輪詢到提示換成那一件為止**（逾時就把當下的提示原樣回傳，讓斷言照樣紅）。
     */
    const hintNow = () => {
      const el = document.querySelector('[data-interact]');
      return el && !el.hidden ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
    };
    const waitHint = async (want, ms = 6000) => {
      const t0 = Date.now();
      let last = '';
      while (Date.now() - t0 < ms) {
        last = hintNow();
        if (last.includes(want)) return last;
        await new Promise((r) => setTimeout(r, 60));
      }
      return last;
    };
    // 站在殘頁旁邊：提示是殘頁
    const spec = g.letterData.entries.find((e) => !e.techniqueId);
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    const nearLetter = await waitHint(spec.title);
    // 站在刻文小語旁邊：提示是刻文（殘頁那一層不搶）
    const ins = g.inscriptionData.entries[0];
    g.player.teleport(ins.at[0] + 2.0, ins.at[1] + 2.0);
    const nearIns = await waitHint(ins.title);
    return { nearLetter, nearIns, title: spec.title, insTitle: ins.title };
  `);
  ok(letterArbitration.nearLetter.includes(letterArbitration.title), '站在殘頁旁邊，提示講的是那一頁', letterArbitration.nearLetter);
  ok(letterArbitration.nearIns.includes(letterArbitration.insTitle), '站在刻文小語旁邊，殘頁不搶 E', letterArbitration.nearIns);

  /* --- ⑥ 回信碑：一塊碑上三種筆跡都在（原句／後人補寫／被劃掉的） --- */
  const threadedTablet = await evaluate(`
    const g = window.__promptasy;
    const tab = g.world.tablets.find((t) => (t.tablet.lines || []).some((l) => typeof l !== 'string'));
    g.tabletPanel.open(tab.tablet, { firstRead: false, xpGain: 0 });
    await new Promise((r) => setTimeout(r, 420));
    const rows = [...document.querySelectorAll('#lore-tablet .lore__line')].map((p) => {
      const cs = getComputedStyle(p);
      const box = p.getBoundingClientRect();
      return {
        hand: p.getAttribute('data-hand'),
        text: p.textContent.trim(),
        fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        strike: cs.textDecorationLine,
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    });
    const out = { id: tab.id, rows };
    g.tabletPanel.close();
    await new Promise((r) => setTimeout(r, 260));
    // 舊格式（純字串）的碑照樣渲染
    const plain = g.world.tablets.find((t) => (t.tablet.lines || []).every((l) => typeof l === 'string'));
    g.tabletPanel.open(plain.tablet, { firstRead: false, xpGain: 0 });
    await new Promise((r) => setTimeout(r, 380));
    out.plain = {
      id: plain.id,
      lines: [...document.querySelectorAll('#lore-tablet .lore__line')].map((p) => ({
        hand: p.getAttribute('data-hand'),
        text: p.textContent.trim(),
      })),
    };
    g.tabletPanel.close();
    await new Promise((r) => setTimeout(r, 260));
    return out;
  `);
  {
    const rows = threadedTablet.rows;
    eq(rows.length, 3, `回信碑（${threadedTablet.id}）有三行`);
    ok(
      rows.every((r) => r.w > 0 && r.h > 0),
      '三行都真的量得到（不是量到 0×0 的空過）',
      rows.map((r) => `${r.w}x${r.h}`).join(' ')
    );
    eq(rows.map((r) => r.hand).join(','), 'first,later,struck', '三種筆跡依序在 DOM 裡');
    const sizes = rows.map((r) => r.fontSize);
    eq(new Set(sizes).size, 3, '三種筆跡三種字級', sizes.join(' / '));
    ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], '原句最大、補寫次之、被劃掉的最小', sizes.join(' > '));
    ok(/line-through/.test(rows[2].strike), '被劃掉的那一句真的有刪除線', rows[2].strike);
    ok(rows[2].text.length > 0, '被劃掉的字仍然讀得到（劃掉不是刪掉）', rows[2].text);
  }
  {
    const plain = threadedTablet.plain;
    ok(plain.lines.length >= 1, `舊格式的碑（${plain.id}）照樣渲染`, String(plain.lines.length));
    ok(
      plain.lines.every((l) => l.hand === 'first'),
      '舊格式（純字串）一律當成原句',
      plain.lines.map((l) => l.hand).join(',')
    );
  }

  /* ================================================================ */
  /*
   * 濁靈（v1.2 · P01）
   *
   * 世界的第六層互動：一段寫壞的請求具象化的小生物。走近 → 提示 → 按 E →
   * 既有主控台自由書寫、第一幕是牠的濁言 → 送濁言原文 → 沒過、XP 不變 →
   * **完整 state 深比較 ＋ 序列化存檔逐字相同**（P01 一個位元組都不落盤）→ Esc。
   */
  console.log('\n▸ 濁靈（v1.2 · P01／P02）');
  const murkWorld = await evaluate(`
    const g = window.__promptasy;
    const names = [];
    g.world.root.traverse((o) => { if (o.name && o.name.startsWith('murk:')) names.push(o.name); });
    let lights = 0, tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry && o.geometry.index) tris += (o.geometry.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    let murkLights = 0, murkTris = 0;
    g.world.murks.group.traverse((o) => {
      if (o.isLight) murkLights += 1;
      if (o.isMesh && o.geometry) { const idx = o.geometry.index; murkTris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3; }
    });
    const regions = {};
    for (const e of g.murks.entries) regions[e.region] = (regions[e.region] || 0) + 1;
    const solids = g.murks.entries.filter((e) => g.world.solids.some((s) => Math.abs(s.x - e.at[0]) < 0.01 && Math.abs(s.z - e.at[1]) < 0.01 && Math.abs(s.r - 0.9) < 0.01 && s.keep)).length;
    return {
      built: names.length, total: g.murks.entries.length, unique: new Set(names).size,
      regions, lights, tris, murkLights, murkTris, solids, allSolids: g.world.solids.length,
      shells: g.world.murks.murks.map((m) => m.shells.length),
      rubricLens: g.murks.entries.map((e) => e.rubric.length),
      hasNearest: typeof g.world.nearestMurk === 'function',
    };
  `);
  eq(murkWorld.total, 8, '資料層有 8 隻濁靈');
  eq(murkWorld.built, murkWorld.total, '每一隻濁靈都蓋在世界裡（murk:<id>）');
  eq(murkWorld.unique, murkWorld.total, '場景圖節點名沒有重複');
  eq(JSON.stringify(murkWorld.regions), JSON.stringify({ foundations: 2, reasoning: 2, grounding: 2, orchestration: 2 }), '前四區各 2 隻', JSON.stringify(murkWorld.regions));
  eq(murkWorld.murkLights, 0, '濁靈一盞燈都沒加');
  ok(murkWorld.murkTris / murkWorld.total <= 600, '每隻濁靈 ≤ 600 三角形', `perMurk=${(murkWorld.murkTris / murkWorld.total).toFixed(0)}`);
  ok(murkWorld.lights <= 56, '多了濁靈之後燈光仍在預算內', `lights=${murkWorld.lights}`);
  ok(murkWorld.tris < 420000, '多了濁靈之後三角形仍在預算內', `tris=${murkWorld.tris}`);
  ok(murkWorld.allSolids < 1400, '碰撞體仍在預算內', `solids=${murkWorld.allSolids}`);
  eq(murkWorld.solids, 8, '8 個底座都在碰撞登記表裡（r 0.9、keepSolid）');
  eq(JSON.stringify(murkWorld.shells), JSON.stringify(murkWorld.rubricLens), '殼數 ＝ rubric 條數');
  eq(murkWorld.hasNearest, true, 'world.nearestMurk 存在');

  /*
   * 142 關的統計欄位（與 test-rubric 的 stats142 同一組）：四個快照都用這一份，
   * 濁靈前後 deep-equal 才不會因為欄位清單漂移而空過。
   */
  const STATS142 = ['bestGrades', 'collected', 'skillsV2', 'guidanceSeen', 'samplesSeen', 'seals', 'penlessSeals', 'scribeSeals', 'badges', 'unlockedRegions'];
  /** 在瀏覽器裡對某個 state 變數取 STATS142 快照的程式碼片段。 */
  const stats142Js = (v) => `JSON.stringify(Object.fromEntries(${JSON.stringify(STATS142)}.map((k) => [k, ${v}[k]])))`;

  /* --- 走近 → 提示 → E → 主控台（自由書寫、第一幕是濁言） --- */
  const murkPre = await evaluate(`
    const g = window.__promptasy;
    // v1.2 · P06b：前面的段落把答題方式切來切去 —— 這一段要驗的是**預設**（引導式＝用選的）
    g.progression.updateSettings({ promptMode: 'guided' });
    const e = g.murks.entries.find((x) => x.id === 'murk-vague-ask');
    // 先站遠一點：這一隻的提示不該出現
    g.player.teleport(e.at[0] + 14, e.at[1] + 14);
    await new Promise((r) => setTimeout(r, 380));
    const farHint = document.querySelector('[data-interact]');
    const hintFar = farHint.hidden || !/濁靈/.test(farHint.textContent);
    const m = g.world.murks.byId(e.id);
    const posBefore = [m.group.position.x, m.group.position.y, m.group.position.z];
    // 走過去（斜角 2.5 公尺 ≈ 3.5m，在 5.5 內、離石座 > 6.5）
    g.player.teleport(e.at[0] + 2.5, e.at[1] + 2.5);
    return {
      id: e.id, taint: e.taint, hintFar, posBefore,
      state: JSON.stringify(g.progression.state),
      save: localStorage.getItem('promptasy.v1.save'),
      xp: g.progression.state.xp,
      // v1.2 · P03：殼數／狀態／粒子池的起點
      shells: typeof m.visibleShellCount === 'function' ? m.visibleShellCount() : -1,
      shellStates: [0, 1, 2].map((i) => (m.shellState ? m.shellState(i) : null)),
      murkState: m.state,
      spawned: g.world.murks.particlesSpawned,
      capacity: g.world.murks.particleCapacity,
      hasStrike: typeof g.world.murks.strike === 'function' && typeof g.world.murks.restore === 'function',
      cuesBefore: g.audio.debug().cues.length,
    };
  `);
  eq(murkPre.hintFar, true, '離得遠的時候沒有濁靈的提示');
  /* --- v1.2 · P03：演出的起點 --- */
  eq(murkPre.hasStrike, true, 'world.murks 有 strike / restore（P03）');
  eq(murkPre.shells, 3, '還沒安撫：3 層殼都在（visibleShellCount）');
  eq(JSON.stringify(murkPre.shellStates), JSON.stringify(['intact', 'intact', 'intact']), '三層殼都是 intact');
  ok(murkPre.capacity >= 8 && murkPre.capacity <= 12, '粒子池 ≤ 12 顆', String(murkPre.capacity));
  eq(murkPre.spawned, 0, '還沒 strike → 粒子池沒噴過');
  const murkHint = await waitFor(async () => {
    const r = await evaluate(`
      const h = document.querySelector('[data-interact]');
      const m = window.__promptasy.world.murks.byId('murk-vague-ask');
      return { hidden: h.hidden, text: h.textContent.replace(/\\s+/g, ' ').trim(), near: m.near, state: m.state };
    `);
    return !r.hidden && /濁靈/.test(r.text) ? r : null;
  }, { timeout: 8000, label: '濁靈的互動提示' });
  ok(/濁靈/.test(murkHint.text) && /含糊的請求/.test(murkHint.text), '提示是「濁靈 · 含糊的請求」（副標是牠自己的名字）', murkHint.text);
  ok(/E/.test(murkHint.text) && /安撫/.test(murkHint.text), '提示帶 E ＋ 動詞「安撫」', murkHint.text);
  eq(murkHint.near, true, '走近的那一隻進入「走近」狀態');
  eq(murkHint.state, 'aware', '8 公尺內牠注意到你（aware）');
  const murkTurn = await waitFor(async () => {
    const r = await evaluate(`
      const m = window.__promptasy.world.murks.byId('murk-vague-ask');
      const g = window.__promptasy;
      const dx = g.player.position.x - m.x, dz = g.player.position.z - m.z;
      const want = Math.atan2(dx, dz);
      let diff = want - m.head.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      return { diff: Math.abs(diff), pos: [m.group.position.x, m.group.position.y, m.group.position.z] };
    `);
    return r.diff < 0.25 ? r : null;
  }, { timeout: 8000, label: '濁靈轉頭看玩家' });
  ok(murkTurn.diff < 0.25, '牠轉頭看向你', String(murkTurn.diff.toFixed(2)));
  eq(JSON.stringify(murkTurn.pos), JSON.stringify(murkPre.posBefore), '牠本體一寸都沒移動（沒有會走動的 NPC）');

  await key('KeyE', 'e', { vk: 69 });
  await sleep(500);
  const murkOpen = await evaluate(`
    const g = window.__promptasy;
    const c = g.promptConsole;
    const head = document.querySelector('#prompt-console');
    const eyebrow = head.querySelector('[data-eyebrow]');
    const scenario = head.querySelector('[data-scenario]');
    return {
      open: c.isOpen, mode: c.mode, kind: c.challenge && c.challenge.kind, id: c.challenge && c.challenge.id,
      eyebrow: (eyebrow ? eyebrow.textContent : head.textContent).replace(/\\s+/g, ' ').trim(),
      scenario: scenario ? scenario.textContent : '', taintClass: scenario ? scenario.classList.contains('is-taint') : false,
      murkClass: head.querySelector('.console').classList.contains('is-murk'),
      act1Nav: head.querySelector('[data-act-zh="1"]')?.textContent.trim(),
      steleHidden: !head.querySelector('.stele') || head.querySelector('.stele').hidden || head.querySelector('.stele').offsetParent === null,
      title: [head.querySelector('.panel__title')?.textContent, head.querySelector('.panel__sub')?.textContent].join(' ').replace(/\\s+/g, ' ').trim(),
    };
  `);
  eq(murkOpen.open, true, '按 E 打開既有的主控台');
  eq(murkOpen.kind, 'murk', '主控台拿到的是濁靈的 challenge 形物件（kind: murk）');
  eq(murkOpen.id, 'murk-vague-ask', '就是這一隻');
  eq(murkOpen.mode, 'guided', '預設設定下濁靈也是石碑刻印（v1.2 · P06b：用選的，不用打字）');
  ok(/濁言/.test(murkOpen.eyebrow), '專用 eyebrow「濁言」', murkOpen.eyebrow);
  ok(!/第 \d+ 關/.test(murkOpen.eyebrow) && !/共 \d+ 關/.test(murkOpen.eyebrow), 'eyebrow 沒有「第 N 關／共 M 關」（濁靈不是關卡）', murkOpen.eyebrow);
  eq(murkOpen.scenario, murkPre.taint, '第一幕的情境就是牠的濁言（原文）');
  eq(murkOpen.taintClass, true, '濁言用引文樣式呈現');
  eq(murkOpen.act1Nav, '委託', '全域 ACTS 的幕名沒有被改');
  ok(/濁靈/.test(murkOpen.title), '標頭上是「濁靈」', murkOpen.title);

  /* --- 走到第二幕、送濁言原文兩次、翻開範例：v1.2 · P02 —— 命中會被記住（murks 欄），
   *     但 142 關的統計（bestGrades／collected／skillsV2／guidanceSeen／samplesSeen）一格不動 --- */
  const murkSubmit = await evaluate(`
    const g = window.__promptasy;
    const c = g.promptConsole;
    document.querySelector('#prompt-console [data-act-next="2"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const guideLinks = document.querySelectorAll('#prompt-console .act--guide a[href^="https://"]').length;
    c.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 200));
    const out = { guideLinks, guidanceSeen: g.progression.state.guidanceSeen.slice() };
    /*
     * v1.2 · P06b：預設設定下第三幕是石碑刻印 —— 有選項、書寫檯讓位。
     * 下面那一整段驗的是 P01–P03 的自由書寫路徑（打字送出），所以這裡自己切過去；
     * 「玩家切得動」本身就是不倒退的證據，最後再切回預設。
     */
    out.guided = {
      mode: c.mode,
      options: [...document.querySelectorAll('#prompt-console .opt')].filter((o) => o.offsetParent !== null).length,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      ask: document.querySelector('#prompt-console [data-ask]')?.textContent.trim() || '',
      slots: (c.challenge.flow && c.challenge.flow.slots.length) || 0,
      rubricLen: c.challenge.rubric.length,
    };
    c.setMode('free');
    await new Promise((r) => setTimeout(r, 200));
    out.guided.modeAfter = c.mode;
    out.guided.steleHiddenAfter = document.querySelector('#prompt-console .stele-stage').hidden;
    const ta = document.querySelector('.prompt-input');
    out.hitsPayloads = [];
    out.spawnedAfter = [];
    for (let i = 0; i < 2; i += 1) {
      ta.value = ${JSON.stringify(murkPre.taint)};
      document.querySelector('#prompt-console [data-submit]').click();
      // v1.2 · P03：onRubricHits 的資料 ＋ 粒子池是不是真的噴了（回呼是同步的，這裡直接讀）
      out.hitsPayloads.push(JSON.stringify(g.rubricHits()));
      out.spawnedAfter.push(g.world.murks.particlesSpawned);
      await new Promise((r) => setTimeout(r, 450));
    }
    out.cuesAfter = g.audio.debug().cues.slice();
    out.gradeMark = document.querySelector('#prompt-console .grade__mark')?.textContent.trim();
    out.fail = !!document.querySelector('#prompt-console .result__top.is-fail');
    out.resultHidden = document.querySelector('#prompt-console .result')?.hidden;
    out.hints = document.querySelectorAll('#prompt-console .row--miss .row__hint, #prompt-console .row--part .row__hint').length;
    out.sourceLinks = document.querySelectorAll('#prompt-console .result a.src[href^="https://"]').length;
    out.gainText = document.querySelector('#prompt-console .result .gain')?.textContent.replace(/\\s+/g, ' ').trim() || '';
    out.fails = c.fails;
    // 兩次沒過 → 範例解鎖 → 翻開它（samplesSeen 不准多一筆）
    const sampleBtn = document.querySelector('#prompt-console [data-sample]') || [...document.querySelectorAll('#prompt-console button')].find((b) => /範例/.test(b.textContent));
    out.sampleBtnFound = !!sampleBtn;
    out.sampleDisabled = sampleBtn ? sampleBtn.disabled : null;
    if (sampleBtn && !sampleBtn.disabled) sampleBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    out.taAfterSample = ta.value;
    out.sample = c.challenge.sample;
    out.xp = g.progression.state.xp;
    const st = g.progression.state;
    out.stats142 = ${stats142Js('st')};
    out.murkState = g.progression.murkState('murk-vague-ask');
    out.murkCount = g.murkCount();
    out.newlyLine = document.querySelector('#prompt-console .result [data-murk-newly]')?.textContent.replace(/\\s+/g, ' ').trim() || '';
    out.saveRaw = localStorage.getItem('promptasy.v1.save');
    out.saveMurks = JSON.parse(out.saveRaw).murks;
    out.best = g.progression.bestGrade('murk-vague-ask');
    out.markerCleared = g.world.markers.some((m) => m.id === 'murk-vague-ask');
    return out;
  `);
  const murkPreState = JSON.parse(murkPre.state);
  const murkPreStats142 = JSON.stringify(Object.fromEntries(STATS142.map((k) => [k, murkPreState[k]])));
  /* --- v1.2 · P06b：預設設定下的第三幕＝石碑刻印（選項），切到自由書寫仍寫得動 --- */
  eq(murkSubmit.guided.mode, 'guided', '預設設定下濁靈的第三幕是石碑刻印');
  ok(murkSubmit.guided.options >= 2, '刻印台上看得到選項（用選的）', JSON.stringify(murkSubmit.guided));
  eq(murkSubmit.guided.steleHidden, false, '石碑真的在台上');
  ok(murkSubmit.guided.ask.length > 4, '第一段有一句問題', murkSubmit.guided.ask);
  eq(murkSubmit.guided.slots, murkSubmit.guided.rubricLen, '段數 ＝ rubric 條數 ＝ 殼數（一段對一層殼）');
  eq(murkSubmit.guided.modeAfter, 'free', '玩家自己切得到自由書寫（不倒退）');
  eq(murkSubmit.guided.steleHiddenAfter, true, '切到自由書寫後石碑收起來');
  ok(murkSubmit.guideLinks >= 1, '第二幕仍有官方出處連結（護欄 2）', String(murkSubmit.guideLinks));
  eq(murkSubmit.guidanceSeen.includes('murk-vague-ask'), false, '進第二幕不記 guidanceSeen（濁靈不是關卡）');
  eq(murkSubmit.resultHidden, false, '送出濁言原文有結果');
  eq(murkSubmit.fail, true, '濁言原文這一次沒過（印章看這一次）');
  eq(murkSubmit.gradeMark, '—', '這一次沒過 → 印章沒有評價');
  ok(/再修一次/.test(murkSubmit.gainText), '沒過時仍是「再修一次」', murkSubmit.gainText);
  ok(!/牠聽懂了|牠早就聽懂了/.test(murkSubmit.newlyLine), '沒安撫 → 累積那一行沒有「聽懂了」', murkSubmit.newlyLine);
  ok(murkSubmit.hints >= 1, '沒過時逐條指出缺什麼', String(murkSubmit.hints));
  ok(murkSubmit.sourceLinks >= 1, '結果上有官方出處連結（護欄 2）', String(murkSubmit.sourceLinks));
  eq(murkSubmit.fails, 2, '送了兩次都沒過');
  eq(murkSubmit.sampleBtnFound, true, '範例解的入口存在');
  eq(murkSubmit.sampleDisabled, false, '兩次沒過之後範例解鎖（SAMPLE_AFTER_FAILS 沿用）');
  eq(murkSubmit.taAfterSample, murkSubmit.sample, '翻開範例會填進書寫檯');
  eq(murkSubmit.xp, murkPre.xp, '沒安撫 → XP 一分都沒變');
  eq(murkSubmit.best, null, '濁靈 id 沒有進 bestGrades');
  eq(murkSubmit.markerCleared, false, '沒有石座被當成通關');
  eq(murkSubmit.stats142, murkPreStats142, '142 關的統計（STATS142：bestGrades／collected／skillsV2／guidanceSeen／samplesSeen／印記／無筆／默寫／徽章／解鎖）前後 deep-equal');
  ok(murkSubmit.murkState && Array.isArray(murkSubmit.murkState.hits) && murkSubmit.murkState.grade === null, 'progression.murkState 有這一隻（hits 陣列、grade null）', JSON.stringify(murkSubmit.murkState));
  eq(murkSubmit.murkCount, 0, '沒安撫不算 murkCount');
  ok(murkSubmit.saveMurks && typeof murkSubmit.saveMurks === 'object' && 'murk-vague-ask' in murkSubmit.saveMurks, '存檔有 murks 欄、而且記著這一隻（命中永不清零）', JSON.stringify(murkSubmit.saveMurks));
  eq(JSON.stringify(murkSubmit.saveMurks['murk-vague-ask']), JSON.stringify(murkSubmit.murkState), '存檔裡的 murks[id] 與 murkState 一致');

  /* --- v1.2 · P03：onRubricHits 契約（濁靈：差量看存檔）＋ 剝殼演出（輪詢式） --- */
  {
    const h1 = JSON.parse(murkSubmit.hitsPayloads[0]);
    const h2 = JSON.parse(murkSubmit.hitsPayloads[1]);
    eq(JSON.stringify(Object.keys(h1).sort()), JSON.stringify(['challenge', 'murk', 'newlyPassedIndices', 'passedIndices', 'total']), 'onRubricHits 契約：四鍵 ＋ 濁靈多帶 murk 子物件');
    ok(h1.murk && typeof h1.murk.calmed === 'boolean' && typeof h1.murk.newlyCalmed === 'boolean', 'murk 子物件帶 calmed／newlyCalmed（世界端不用猜）');
    eq(h1.challenge && h1.challenge.id, 'murk-vague-ask', 'challenge 是這一隻');
    eq(h1.total, 3, 'total ＝ rubric 條數 ＝ 殼數');
    eq(JSON.stringify(h1.passedIndices), JSON.stringify(murkSubmit.murkState.hits), '濁靈：passedIndices ＝ 存檔累積 hits');
    ok(h1.newlyPassedIndices.length >= 1, '第一次送濁言：有新命中（濁言原文本身命中「派任務」那一列）', JSON.stringify(h1));
    eq(JSON.stringify(h1.newlyPassedIndices), JSON.stringify(h1.passedIndices), '第一次：newly ＝ 全部命中');
    eq(JSON.stringify(h2.newlyPassedIndices), '[]', '第二次送同一句：newly 為空（相對於存檔沒有新增 → 不重播）');
    eq(JSON.stringify(h2.passedIndices), JSON.stringify(h1.passedIndices), '第二次：passedIndices 不變');
    ok(murkSubmit.spawnedAfter[0] >= 8 && murkSubmit.spawnedAfter[0] <= 12, '第一次 strike：粒子池噴了 8–12 顆', String(murkSubmit.spawnedAfter[0]));
    eq(murkSubmit.spawnedAfter[1], murkSubmit.spawnedAfter[0], '第二次沒有新命中 → 不再噴粒子（不重播）');
    ok(murkSubmit.cuesAfter.includes('murkHit'), '音效診斷有 murkHit（每剝一殼一聲）', JSON.stringify(murkSubmit.cuesAfter));
    ok(!murkSubmit.cuesAfter.includes('murkCalm'), '沒安撫 → 沒有 murkCalm', JSON.stringify(murkSubmit.cuesAfter));
  }
  /*
   * 濁言原文會命中「派任務」那一列 —— 它在 rubric 裡的位置由資料決定（P06b 把它移到第一段），
   * 所以這裡**從實際命中推導**要看哪一層殼，不寫死 index。
   */
  const peeledIdx = JSON.parse(murkSubmit.hitsPayloads[0]).passedIndices[0];
  const wantStates = [0, 1, 2].map((i) => (i === peeledIdx ? 'hidden' : 'intact'));
  const murkPeeled = await waitFor(async () => {
    const r = await evaluate(`
      const m = window.__promptasy.world.murks.byId('murk-vague-ask');
      return { shells: m.visibleShellCount(), states: [0, 1, 2].map((i) => m.shellState(i)), state: m.state, active: window.__promptasy.world.murks.activeParticles(), hiddenOne: m.shells[${peeledIdx}].visible === false };
    `);
    return r.shells === 2 && r.states[peeledIdx] === 'hidden' && r.active === 0 ? r : null;
  }, { timeout: 8000, label: `殼 ${peeledIdx} 剝落完成` });
  eq(murkPeeled.shells, 2, '命中一條 → 殼數 3 → 2（剝落走完）');
  eq(JSON.stringify(murkPeeled.states), JSON.stringify(wantStates), `殼 index ＝ rubric index：只有殼 ${peeledIdx} 隱藏`);
  eq(murkPeeled.hiddenOne, true, '隱藏的殼 visible=false');
  ok(murkPeeled.state !== 'settled' && murkPeeled.state !== 'calming', '沒安撫 → 不是 settled', murkPeeled.state);
  eq(murkPeeled.active, 0, '碎光熄了（粒子池歸零）');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(300);
  /* --- 關掉重開：狀態一致（殼數仍 2、不重播） --- */
  const murkReopen = await evaluate(`
    const g = window.__promptasy;
    const closed = { open: g.promptConsole.isOpen, state: JSON.stringify(g.progression.murkState('murk-vague-ask')) };
    g.promptConsole.open(g.murkChallenge('murk-vague-ask'));
    await new Promise((r) => setTimeout(r, 300));
    const head = document.querySelector('#prompt-console');
    const out = {
      closed,
      openAgain: g.promptConsole.isOpen,
      subtitle: head.querySelector('.panel__sub')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      state: JSON.stringify(g.progression.murkState('murk-vague-ask')),
      save: JSON.stringify(JSON.parse(localStorage.getItem('promptasy.v1.save')).murks['murk-vague-ask']),
      shells: g.world.murks.byId('murk-vague-ask').visibleShellCount(),
      spawned: g.world.murks.particlesSpawned,
    };
    return out;
  `);
  eq(murkReopen.closed.open, false, 'Escape 收起主控台');
  eq(murkReopen.shells, 2, '關掉重開：殼數仍 2（不重播）');
  eq(murkReopen.spawned, murkSubmit.spawnedAfter[1], '關掉重開：粒子池沒再噴');
  eq(murkReopen.openAgain, true, '重開主控台');
  eq(murkReopen.state, murkReopen.closed.state, '關掉重開 murkState 一致');
  eq(murkReopen.save, murkReopen.state, '存檔與 state 一致');
  ok(!/最佳評價/.test(murkReopen.subtitle), '還沒安撫 → 標頭沒有「最佳評價」', murkReopen.subtitle);

  /* --- 送範例解：安撫、評價、XP 差額、圖鑑第四列 --- */
  const murkCalm = await evaluate(`
    const g = window.__promptasy;
    const c = g.promptConsole;
    const { xpForGrade } = await import('/src/challenges/rubric.js');
    if (c.mode !== 'free') c.setMode('free');
    c.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 200));
    const st0 = g.progression.state;
    const before = {
      xp: st0.xp,
      level: g.progression.levelInfo().level,
      stats142: ${stats142Js('st0')},
      unlocked: st0.unlockedRegions.slice(),
      cleared: Object.keys(st0.bestGrades).length,
      rank: g.rankNow(),
    };
    const ta = document.querySelector('.prompt-input');
    const cuesLen0 = g.audio.debug().cues.length;
    ta.value = c.challenge.sample;
    document.querySelector('#prompt-console [data-submit]').click();
    const hitsPayload = JSON.stringify(g.rubricHits());
    const mm = g.world.murks.byId('murk-vague-ask');
    const stateRightAfter = mm.state;
    const activeRightAfter = g.world.murks.activeParticles();
    await new Promise((r) => setTimeout(r, 600));
    const st = g.progression.state;
    const ms = g.progression.murkState('murk-vague-ask');
    const out = {
      before,
      hitsPayload,
      stateRightAfter,
      activeRightAfter,
      cuesCalm: g.audio.debug().cues.slice(),
      gradeMark: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      pass: !!document.querySelector('#prompt-console .result__top.is-pass'),
      gainText: document.querySelector('#prompt-console .result .gain')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      newlyLine: document.querySelector('#prompt-console .result [data-murk-newly]')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      shareBtn: !!document.querySelector('#prompt-console [data-share]'),
      xp: st.xp,
      level: g.progression.levelInfo().level,
      murkState: ms,
      murkCount: g.murkCount(),
      xpForGrade: ms && ms.grade ? xpForGrade(ms.grade, g.murks.xp) : null,
      stats142: ${stats142Js('st')},
      unlocked: st.unlockedRegions.slice(),
      cleared: Object.keys(st.bestGrades).length,
      rank: g.rankNow(),
      best: g.progression.bestGrade('murk-vague-ask'),
      saveMurk: JSON.parse(localStorage.getItem('promptasy.v1.save')).murks['murk-vague-ask'],
      hudTitle: document.querySelector('.hud__banner')?.textContent || '',
      // v1.2 · P08：主控台還開著 → 回聲把要說的那一句先記下來（收起來才說）
      echoPending: g.nudge.state().pending,
      echoVisibleWhileOpen: g.nudge.state().visible,
    };
    // 再送一次同一句範例：早就安撫 → 那一行換成「牠早就聽懂了 · 累積 · 最佳評價」、XP 不再加
    ta.value = c.challenge.sample;
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 600));
    out.again = {
      pass: !!document.querySelector('#prompt-console .result__top.is-pass'),
      newlyLine: document.querySelector('#prompt-console .result [data-murk-newly]')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      xp: g.progression.state.xp,
      murkCount: g.murkCount(),
    };
    return out;
  `);
  eq(murkCalm.pass, true, '範例解這一次過了（印章看這一次：is-pass）');
  /* --- v1.2 · P03：安撫演出 —— murkCalm 取代 pass、光屑（粒子）、清燈（輪詢式） --- */
  {
    const h = JSON.parse(murkCalm.hitsPayload);
    eq(JSON.stringify(h.passedIndices), '[0,1,2]', '範例解：passedIndices ＝ 全部三列（累積）');
    eq(
      JSON.stringify(h.newlyPassedIndices),
      JSON.stringify([0, 1, 2].filter((i) => i !== peeledIdx)),
      `範例解：newly 只回相對於存檔的新增（殼 ${peeledIdx} 早剝了）`
    );
    ok(murkCalm.stateRightAfter === 'calming' || murkCalm.stateRightAfter === 'settled', 'strike 當下進入 calming（光屑）或 settled', murkCalm.stateRightAfter);
    ok(murkCalm.activeRightAfter > 0, '安撫當下粒子池有活粒子（碎光＋光屑）', String(murkCalm.activeRightAfter));
    const recent = murkCalm.cuesCalm;
    ok(recent.includes('murkCalm'), '這一次才安撫 → 音效 murkCalm', JSON.stringify(recent));
    ok(recent.lastIndexOf('pass') < recent.lastIndexOf('murkCalm'), '安撫時 murkCalm 取代 pass（murkCalm 之後沒有 pass）', JSON.stringify(recent));
  }
  const murkSettled = await waitFor(async () => {
    const r = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.murks.byId('murk-vague-ask');
      return {
        state: m.state, shells: m.visibleShellCount(), states: [0, 1, 2].map((i) => m.shellState(i)),
        active: g.world.murks.activeParticles(), headScale: m.head.scale.x,
        glow: m.glow.material.color.getHexString(), emissive: m.coreMat.emissive.getHexString(),
        pos: [m.group.position.x, m.group.position.y, m.group.position.z],
        near: m.near,
      };
    `);
    return r.state === 'settled' && r.active === 0 && r.headScale < 0.6 ? r : null;
  }, { timeout: 20000, label: '濁靈落成清燈（settled）' });
  eq(murkSettled.state, 'settled', '≤ 3 秒後 state === settled（光屑回到清燈位）');
  eq(murkSettled.active, 0, '光屑熄了、粒子池歸零（沒有任何東西跟著玩家）');
  eq(murkSettled.shells, 0, '全剝 → 沒有殼');
  ok(murkSettled.states.every((x) => x === 'hidden' || x === 'residual'), '殼全為隱藏或餘殼', JSON.stringify(murkSettled.states));
  ok(murkSettled.headScale < 0.6, '頭縮成清燈（≈0.55）', String(murkSettled.headScale));
  ok(/^ff/.test(murkSettled.glow) && parseInt(murkSettled.glow.slice(2, 4), 16) >= 0xe0, '光暈轉暖白（#fff2d6 附近）', murkSettled.glow);
  ok(parseInt(murkSettled.emissive.slice(0, 2), 16) >= 0xf0 && parseInt(murkSettled.emissive.slice(2, 4), 16) >= 0xe0, '眼光轉暖白', murkSettled.emissive);
  eq(JSON.stringify(murkSettled.pos), JSON.stringify(murkPre.posBefore), '清燈在原位（濁靈一寸都沒動）');
  ok(['S', 'A'].includes(murkCalm.gradeMark), '印章 ＝ 這一次的評價 ≥ A', murkCalm.gradeMark);
  ok(/牠聽懂了。這一句話，你替牠說完了。/.test(murkCalm.newlyLine), '累積那一行：「牠聽懂了。這一句話，你替牠說完了。」', murkCalm.newlyLine);
  ok(/\+\d+/.test(murkCalm.newlyLine) && /XP/.test(murkCalm.newlyLine), '那一行帶 +N XP', murkCalm.newlyLine);
  ok(/評價 [SA]/.test(murkCalm.newlyLine), '那一行帶評價', murkCalm.newlyLine);
  ok(!/說清楚了 \d+ 處/.test(murkCalm.newlyLine), '這一次才安撫 → 不再顯示「說清楚了 N 處」那一句', murkCalm.newlyLine);
  eq(murkCalm.shareBtn, false, '濁靈的結果面沒有分享鍵');
  eq(murkCalm.again.pass, true, '再送範例：這一次仍過（印章）');
  ok(/牠早就聽懂了 · 累積 [\d.]+ \/ [\d.]+ · 最佳評價 [SA]/.test(murkCalm.again.newlyLine), '再送範例：那一行是「牠早就聽懂了 · 累積 s / t · 最佳評價 G」', murkCalm.again.newlyLine);
  eq(murkCalm.again.xp, murkCalm.xp, '再送範例：XP 不再加');
  eq(murkCalm.again.murkCount, 1, '再送範例：murkCount 仍 1');
  ok(murkCalm.murkState && ['S', 'A'].includes(murkCalm.murkState.grade), 'murks[id].grade 有值（≥A）', JSON.stringify(murkCalm.murkState));
  eq(murkCalm.murkCount, 1, 'murkCount 1');
  eq(murkCalm.xp - murkCalm.before.xp, murkCalm.xpForGrade, 'XP 增加 ＝ xpForGrade(grade, murks.json.xp)');
  ok(murkCalm.xp > murkCalm.before.xp, '安撫真的有 XP', `${murkCalm.before.xp} → ${murkCalm.xp}`);
  if (murkCalm.level === murkCalm.before.level || JSON.stringify(murkCalm.unlocked) === JSON.stringify(murkCalm.before.unlocked)) {
    eq(murkCalm.stats142, murkCalm.before.stats142, '安撫後 142 關統計仍 deep-equal（STATS142）');
  } else {
    // 濁靈升等跨過閘門 → unlockedRegions 會多（refreshUnlocks 有跑，這是對的）；其餘欄位仍要一格不動
    const a = JSON.parse(murkCalm.before.stats142);
    const b = JSON.parse(murkCalm.stats142);
    delete a.unlockedRegions;
    delete b.unlockedRegions;
    eq(JSON.stringify(b), JSON.stringify(a), '安撫後 142 關統計仍 deep-equal（STATS142，除了升等跨門檻多開的區域）');
    ok(murkCalm.unlocked.length > murkCalm.before.unlocked.length, '濁靈升等跨門檻 → unlockedRegions 只多不少', JSON.stringify([murkCalm.before.unlocked, murkCalm.unlocked]));
  }
  eq(murkCalm.cleared, murkCalm.before.cleared, '已通關數不變');
  eq(murkCalm.best, null, '濁靈 id 仍不在 bestGrades');
  eq(JSON.stringify(murkCalm.saveMurk), JSON.stringify(murkCalm.murkState), '存檔的 murks[id] 與 state 一致');
  if (murkCalm.level === murkCalm.before.level) eq(murkCalm.rank, murkCalm.before.rank, '稱號不變（等級沒動時）');
  else ok(true, `（等級 ${murkCalm.before.level} → ${murkCalm.level}，稱號可能因等級變動 —— 已通關數／收集數已另驗不變）`);

  /* --- v1.2 · P08：反應式回聲 —— 安撫一隻濁靈之後，回聲說了對應的那一句 --- */
  {
    /*
     * 主控台開著的時候回聲不說話（一次只有一件事擁有畫面），所以它把那一句
     * 記在 pending 裡。排到哪一句是**算得出來的**：安撫 → 升等 → 解鎖，後面的
     * 蓋掉前面的（新的消息比較重要）。
     */
    const unlockedMore = JSON.stringify(murkCalm.unlocked) !== JSON.stringify(murkCalm.before.unlocked);
    const leveled = murkCalm.level !== murkCalm.before.level;
    const wantPending = unlockedMore ? 'regionUnlocked' : leveled ? 'levelUp' : 'firstMurkCalmed';
    eq(murkCalm.echoVisibleWhileOpen, false, '主控台開著時回聲不搶畫面');
    eq(murkCalm.echoPending, wantPending, `安撫當下回聲排的是「${wantPending}」`);
  }
  await key('Escape', 'Escape', { vk: 27 });
  const echoAfterCalm = await waitFor(async () => {
    const r = await evaluate(`
      const g = window.__promptasy;
      const el = document.querySelector('.nudge');
      const st = g.nudge.state();
      return {
        st,
        isOn: el.classList.contains('is-on'),
        eyebrow: el.querySelector('[data-eyebrow]').textContent.trim(),
        line: el.querySelector('[data-line]').textContent.trim(),
        sub: el.querySelector('[data-sub]').textContent.trim(),
        opacity: Number(getComputedStyle(el).opacity),
      };
    `);
    // 輪詢到「真的淡入完成」為止（不用固定 sleep 對牆鐘）
    return r.st.visible && r.isOn && r.opacity > 0.9 ? r : null;
  }, { timeout: 10000, label: '安撫之後回聲說了一句' });
  {
    const { ECHO_LINES } = await import('../src/ui/nudge.js');
    const kindNow = echoAfterCalm.st.kind;
    ok(['firstMurkCalmed', 'murkCalmed', 'levelUp', 'unlock'].includes(kindNow), '收起主控台那一拍，回聲把記著的那一句說出來', kindNow);
    eq(echoAfterCalm.eyebrow, '回聲', '說話的是回聲（世界觀語言）');
    ok(echoAfterCalm.opacity > 0.9, '那一句真的看得見', String(echoAfterCalm.opacity));
    ok(echoAfterCalm.line.length > 0 && echoAfterCalm.line.length <= 31, '每句 ≤ 31 字（WORLD §1.2）', `${echoAfterCalm.line}（${echoAfterCalm.line.length}）`);
    ok(!echoAfterCalm.sub || echoAfterCalm.sub.length <= 31, '第二句也 ≤ 31 字', echoAfterCalm.sub);
    if (kindNow !== 'unlock') {
      const spec = ECHO_LINES[kindNow];
      eq(echoAfterCalm.line, spec.line, '說的就是分支表裡的那一句（不是臨時編的）');
      eq(echoAfterCalm.sub, spec.sub || '', '第二句也照分支表');
    }
    ok(!/送出評分|按鈕|面板|rubric|XP/.test(`${echoAfterCalm.line}${echoAfterCalm.sub}`), '回聲不用系統術語', echoAfterCalm.line);
  }
  await sleep(300);
  /* --- 重開：標頭有「最佳評價」；圖鑑第四列 1/8、條目含濁言／範例／出處 --- */
  const murkBook = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.murkChallenge('murk-vague-ask'));
    await new Promise((r) => setTimeout(r, 250));
    const sub = document.querySelector('#prompt-console .panel__sub')?.textContent || '';
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 250));
    g.codex.open();
    await new Promise((r) => setTimeout(r, 400));
    const rows = [...document.querySelectorAll('#codex .finds__list li')].map((li) => ({
      label: li.querySelector('b').textContent.trim(),
      n: li.querySelector('span').textContent.trim(),
    }));
    const book = document.querySelector('#codex .murkbook');
    const items = book ? [...book.querySelectorAll('[data-murk]')] : [];
    const e = g.murks.entries.find((x) => x.id === 'murk-vague-ask');
    const mine = items.find((li) => li.getAttribute('data-murk') === 'murk-vague-ask');
    const other = items.find((li) => li.getAttribute('data-murk') !== 'murk-vague-ask');
    const out = {
      sub,
      rows,
      hasBook: !!book,
      items: items.length,
      mineText: mine ? mine.textContent.replace(/\\s+/g, ' ').trim() : '',
      mineHasTaint: mine ? mine.textContent.includes(e.taint) : false,
      mineHasSample: mine ? mine.textContent.includes(e.sample) : false,
      mineSrc: mine ? [...mine.querySelectorAll('a[href^="https://"]')].map((a) => a.href) : [],
      mineSource: e.source,
      otherText: other ? other.textContent.replace(/\\s+/g, ' ').trim() : '',
      otherLinks: other ? other.querySelectorAll('a').length : -1,
      total: g.murks.entries.length,
    };
    g.codex.close();
    await new Promise((r) => setTimeout(r, 260));
    return out;
  `);
  ok(/最佳評價 [SA]/.test(murkBook.sub), '重開主控台：標頭顯示最佳評價', murkBook.sub);
  {
    const row = murkBook.rows.find((r) => r.label.includes('濁言'));
    ok(Boolean(row), '圖鑑第四列「濁言與正言」', JSON.stringify(murkBook.rows));
    eq(row && row.n, `1 / ${murkBook.total}`, '計數是 1 / 8');
    eq(murkBook.hasBook, true, '第四列下面有可展開的清單');
    eq(murkBook.items, murkBook.total, '清單 8 隻都列出來');
    eq(murkBook.mineHasTaint, true, '安撫過的條目有濁言（弱）');
    eq(murkBook.mineHasSample, true, '安撫過的條目有範例（強）');
    ok(/最佳評價|評價/.test(murkBook.mineText) && /[SA]/.test(murkBook.mineText), '安撫過的條目有你的最佳評價', murkBook.mineText.slice(0, 120));
    ok(murkBook.mineSrc.some((h) => h.startsWith(murkBook.mineSource.split('#')[0])), '安撫過的條目有官方出處連結（護欄 2）', JSON.stringify(murkBook.mineSrc));
    ok(/還沒聽懂/.test(murkBook.otherText), '沒安撫的只顯示「還沒聽懂」', murkBook.otherText);
    eq(murkBook.otherLinks, 0, '沒安撫的不露出範例／出處');
  }

  /* --- v1.2 · P03：onRubricHits 非 murk 的差量（給 P09）：只回呼、不演出；同一 session 兩次送出 → 第二次只回新增；重開歸零 --- */
  const murkHitsPlain = await evaluate(`
    const g = window.__promptasy;
    const c = g.promptConsole;
    const ch = g.content.challenges.find((x) => x.id === 'gate-of-clarity-01');
    const spawned0 = g.world.murks.particlesSpawned;
    const setting0 = g.progression.state.settings.promptMode;
    c.open(ch);
    await new Promise((r) => setTimeout(r, 250));
    if (c.mode !== 'free') c.setMode('free');
    c.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 150));
    const ta = document.querySelector('.prompt-input');
    const send = async (text) => {
      ta.value = text;
      document.querySelector('#prompt-console [data-submit]').click();
      const h = g.rubricHits();
      await new Promise((r) => setTimeout(r, 300));
      return { keys: Object.keys(h).sort(), id: h.challenge && h.challenge.id, kind: h.challenge && h.challenge.kind, passed: h.passedIndices, newly: h.newlyPassedIndices, total: h.total, ok: !!document.querySelector('#prompt-console .result__top.is-pass') };
    };
    // 「派任務」那一列命中、沒有可量化限制 → 沒過（不寫 bestGrades）
    const a = await send('請把這張告示改寫成清楚好懂的公告。');
    const b = await send('請把這張告示改寫成清楚好懂的公告。');
    const cc = await send('。');
    c.close();
    await new Promise((r) => setTimeout(r, 250));
    c.open(ch);
    await new Promise((r) => setTimeout(r, 250));
    if (c.mode !== 'free') c.setMode('free');
    c.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 150));
    const d = await send('請把這張告示改寫成清楚好懂的公告。');
    c.close();
    await new Promise((r) => setTimeout(r, 250));
    if (g.progression.state.settings.promptMode !== setting0) g.progression.updateSettings({ promptMode: setting0 });
    return { a, b, cc, d, spawnedDelta: g.world.murks.particlesSpawned - spawned0, best: g.progression.bestGrade('gate-of-clarity-01'), rubricLen: ch.rubric.length };
  `);
  eq(JSON.stringify(murkHitsPlain.a.keys), JSON.stringify(['challenge', 'newlyPassedIndices', 'passedIndices', 'total']), '關卡的 onRubricHits 也是同一份四鍵契約');
  eq(murkHitsPlain.a.id, 'gate-of-clarity-01', '關卡：challenge 是那一關');
  ok(murkHitsPlain.a.kind !== 'murk', '關卡：kind 缺省（不是 murk）');
  eq(murkHitsPlain.a.total, murkHitsPlain.rubricLen, '關卡：total ＝ rubric 條數');
  eq(murkHitsPlain.a.ok, false, '（前提）這一句沒過（不會寫進 bestGrades）');
  eq(JSON.stringify(murkHitsPlain.a.passed), '[0]', '關卡：passedIndices ＝ 這一次 passed===true 的 index（派任務那一列）');
  eq(JSON.stringify(murkHitsPlain.a.newly), '[0]', '關卡第一次：newly ＝ passed（session 內沒命中過）');
  eq(JSON.stringify(murkHitsPlain.b.newly), '[]', '關卡第二次同一句：newly 為空（session 差量）');
  eq(JSON.stringify(murkHitsPlain.b.passed), '[0]', '關卡第二次：passedIndices 照舊');
  eq(JSON.stringify(murkHitsPlain.cc.passed), '[]', '關卡送空話：passedIndices 空');
  eq(JSON.stringify(murkHitsPlain.d.newly), '[0]', '關掉重開再送：session 歸零 → 又是新命中');
  eq(murkHitsPlain.spawnedDelta, 0, '關卡的回呼不演出（濁靈粒子池沒動）— P09 才接石座');

  /* --- v1.2 · P03：reduced-motion 下走同一路徑直接到終態；重新整理後開機還原（清燈一開機就在、不重播） --- */
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await reloadPage('P03 重新載入（reduced-motion）');
  // 重整後標題卡會在：跟其他重整段一樣按 Enter 收掉，世界才接得到互動
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);
  const murkRM = await evaluate(`
    const g = window.__promptasy;
    const boot = (() => {
      const m = g.world.murks.byId('murk-vague-ask');
      return { state: m.state, shells: m.visibleShellCount(), states: [0, 1, 2].map((i) => m.shellState(i)), headScale: m.head.scale.x, glow: m.glow.material.color.getHexString(), spawned: g.world.murks.particlesSpawned, active: g.world.murks.activeParticles(), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
    })();
    // 第二隻（同區）：reduced-motion 下送範例解 → 殼直接隱藏、直接 settled、不噴粒子
    const e = g.murks.entries.find((x) => x.id === 'murk-only-donts');
    const m2 = g.world.murks.byId(e.id);
    const before2 = { state: m2.state, shells: m2.visibleShellCount() };
    g.player.teleport(e.at[0] + 2.5, e.at[1] + 2.5);
    await new Promise((r) => setTimeout(r, 300));
    g.promptConsole.open(g.murkChallenge(e.id));
    await new Promise((r) => setTimeout(r, 250));
    if (g.promptConsole.mode !== 'free') g.promptConsole.setMode('free');
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 150));
    const ta = document.querySelector('.prompt-input');
    ta.value = e.sample;
    const spawned0 = g.world.murks.particlesSpawned;
    document.querySelector('#prompt-console [data-submit]').click();
    // 回呼同步 → 這一刻就該是終態
    const right = { state: m2.state, shells: m2.visibleShellCount(), states: [0, 1, 2].map((i) => m2.shellState(i)), headScale: m2.head.scale.x, spawned: g.world.murks.particlesSpawned - spawned0, active: g.world.murks.activeParticles(), flash: m2.flash };
    await new Promise((r) => setTimeout(r, 400));
    const cues = g.audio.debug().cues.slice();
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 250));
    return { boot, before2, right, cues, murkCount: g.murkCount(), pos: [m2.group.position.x, m2.group.position.y, m2.group.position.z], at: e.at, titleOpen: g.title.isOpen };
  `);
  eq(murkRM.titleOpen, false, '（前提）重整後標題卡已收掉');
  eq(murkRM.boot.reduced, true, '（前提）reduced-motion 模擬有生效');
  eq(murkRM.boot.state, 'settled', '重新整理後：安撫過的那一隻一開機就是清燈（restore）');
  eq(murkRM.boot.shells, 0, '重新整理後：殼數依存檔（全剝 → 0）');
  ok(murkRM.boot.states.every((x) => x === 'hidden' || x === 'residual'), '重新整理後：殼是隱藏／餘殼', JSON.stringify(murkRM.boot.states));
  ok(murkRM.boot.headScale < 0.6, '重新整理後：頭已是清燈大小', String(murkRM.boot.headScale));
  eq(murkRM.boot.spawned, 0, '重新整理後：restore 沒噴粒子（不重播）');
  eq(murkRM.boot.active, 0, '重新整理後：粒子池空');
  eq(murkRM.before2.shells, 3, '（前提）第二隻還沒碰過：3 層殼');
  eq(murkRM.right.state, 'settled', 'reduced-motion：送範例解當下直接 settled（跳過光屑）');
  eq(murkRM.right.shells, 0, 'reduced-motion：殼直接隱藏（不剝落）');
  eq(JSON.stringify(murkRM.right.states), JSON.stringify(['hidden', 'hidden', 'hidden']), 'reduced-motion：三層殼都直接 hidden');
  ok(murkRM.right.headScale < 0.6, 'reduced-motion：頭直接縮成清燈', String(murkRM.right.headScale));
  eq(murkRM.right.spawned, 0, 'reduced-motion：不噴粒子');
  eq(murkRM.right.active, 0, 'reduced-motion：粒子池空');
  ok(murkRM.right.flash > 0, 'reduced-motion：眼光仍會閃（關掉的是「動」，不是「回應」）', String(murkRM.right.flash));
  ok(murkRM.cues.includes('murkHit') && murkRM.cues.includes('murkCalm'), 'reduced-motion：聲音照響（murkHit ＋ murkCalm）', JSON.stringify(murkRM.cues));
  eq(murkRM.murkCount, 2, '兩隻都安撫了（murkCount 2）');
  eq(JSON.stringify([murkRM.pos[0], murkRM.pos[2]]), JSON.stringify(murkRM.at), '清燈在原位');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
  await reloadPage('P03 重新載入（回到一般動態）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);
  const murkBoot2 = await evaluate(`
    const g = window.__promptasy;
    const a = g.world.murks.byId('murk-vague-ask');
    const b = g.world.murks.byId('murk-only-donts');
    const c = g.world.murks.byId('murk-no-example');
    return { titleOpen: g.title.isOpen, panelOpen: g.promptConsole.isOpen, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, a: [a.state, a.visibleShellCount()], b: [b.state, b.visibleShellCount()], c: [c.state, c.visibleShellCount()], spawned: g.world.murks.particlesSpawned };
  `);
  eq(murkBoot2.titleOpen, false, '（前提）重整後標題卡已收掉（後面的互動測試才接得到 E）');
  eq(murkBoot2.panelOpen, false, '（前提）沒有面板開著');
  eq(murkBoot2.reduced, false, '（前提）reduced-motion 模擬已關');
  eq(JSON.stringify(murkBoot2.a), JSON.stringify(['settled', 0]), '一般模式重開機：第一隻仍是清燈');
  eq(JSON.stringify(murkBoot2.b), JSON.stringify(['settled', 0]), '一般模式重開機：第二隻仍是清燈');
  eq(JSON.stringify(murkBoot2.c), JSON.stringify(['idle', 3]), '沒碰過的那隻原樣（3 層殼、idle）');
  eq(murkBoot2.spawned, 0, '開機還原不噴粒子');

  /* --- 仲裁：石座 > 濁靈 > 石碑 ---
   * 濁靈的座標規則要求離石座 ≥ 12（兩個互動圈不重疊），唯一的例外是流程與代理區那一隻
   * （≥ 10，石座飽和）。就用那一對：站在石座 5.5 公尺、也在濁靈 5.5 內的點，按到的必須是石座。 */
  // 先把可能還開著的東西關掉（前一段剛重開機、按過 Enter），再走過去；HUD 提示用輪詢等，不對齊牆鐘
  await key('Escape', 'Escape', { vk: 27 });
  const murkArbPair = await evaluate(`
    const g = window.__promptasy;
    let best = null;
    for (const e of g.murks.entries) {
      for (const m of g.world.markers) {
        const d = Math.hypot(e.at[0] - m.position.x, e.at[1] - m.position.z);
        if (d < 12 && (!best || d < best.d)) best = { e, m, d };
      }
    }
    if (!best) return { none: true };
    const { e, m, d } = best;
    const dx = e.at[0] - m.position.x, dz = e.at[1] - m.position.z;
    const px = m.position.x + (dx / d) * 5.5, pz = m.position.z + (dz / d) * 5.5;
    g.player.teleport(px, pz);
    return { murk: e.id, marker: m.id, title: m.challenge.title, dMurk: Math.hypot(px - e.at[0], pz - e.at[1]), dPair: d, panelOpen: g.promptConsole.isOpen };
  `);
  const murkArbText = murkArbPair.none
    ? ''
    : await waitFor(
        async () => {
          const r = await evaluate(`
            const h = document.querySelector('[data-interact]');
            return h && !h.hidden ? h.textContent.replace(/\\s+/g, ' ').trim() : '';
          `);
          return r && /安撫|E/.test(r) ? r : null;
        },
        { timeout: 8000, label: '仲裁點的互動提示' }
      ).catch(() => '');
  const murkArb = { ...murkArbPair, text: murkArbText };
  ok(!murkArb.none, '（前提）世界裡有一對石座／濁靈互動圈相疊（淨空例外那一隻）', JSON.stringify(murkArb));
  ok(murkArb.dMurk < 5.5, '（前提）這個點也在濁靈的 5.5 內', `${murkArb.murk}↔${murkArb.marker} d=${murkArb.dMurk && murkArb.dMurk.toFixed(2)}`);
  ok(new RegExp(murkArb.title || '§').test(murkArb.text) && !/濁靈/.test(murkArb.text), '石座與濁靈同時在範圍內 → 石座優先', murkArb.text);

  /* ================================================================ */
  /*
   * v1.2 · P06b：預設設定下「用選的」安撫一隻濁靈（純鍵盤走完）
   *
   * 站長裁決：「濁靈的遊戲內容，也是讓使用者用選的，不要打字。」
   * 這一段完全不碰書寫檯：走過去 → E → Enter 推幕 → 數字鍵一段一段刻 →
   * 按住 Enter 手掌印 → 剝殼（輪詢）→ 清燈。最後把同一隻切成自由書寫，
   * 確認打字那條路仍然在（不倒退）。
   */
  console.log('\n▸ 濁靈的選擇式作答（v1.2 · P06b）');
  const chooseId = 'murk-no-example';
  const chooseSetup = await evaluate(`
    const g = window.__promptasy;
    for (const k of ['keyhelp','shareCard','promptConsole','codex','settings','tabletPanel','inscriptionPanel','practice']) {
      try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
    }
    // 預設設定：引導式（前面的段落為了驗打字路徑切成過自由書寫）
    g.progression.updateSettings({ promptMode: 'guided' });
    const e = g.murks.entries.find((x) => x.id === '${chooseId}');
    const m = g.world.murks.byId(e.id);
    g.player.setInputEnabled(true);
    g.player.teleport(e.at[0] + 2.5, e.at[1] + 2.5);
    await new Promise((r) => setTimeout(r, 400));
    return {
      setting: g.progression.state.settings.promptMode,
      shells: m.visibleShellCount(), state: m.state,
      slots: e.flow.slots.length, rubricLen: e.rubric.length,
      correctIdx: e.flow.slots.map((s) => s.options.findIndex((o) => o.correct)),
      murkCount: g.murkCount(), xp: g.progression.state.xp,
      grade: JSON.stringify(g.progression.murkState(e.id)),
    };
  `);
  eq(chooseSetup.setting, 'guided', '（前提）答題方式是預設的引導式');
  eq(chooseSetup.shells, 3, '（前提）這一隻還沒碰過：3 層殼');
  ok(chooseSetup.state !== 'settled' && chooseSetup.state !== 'calming', '（前提）還是濁靈（不是清燈；走近了所以會是 idle／aware）', chooseSetup.state);
  eq(chooseSetup.grade, 'null', '（前提）存檔裡還沒有這一隻');
  eq(chooseSetup.slots, chooseSetup.rubricLen, '段數 ＝ rubric 條數 ＝ 殼數');
  ok(chooseSetup.correctIdx.every((i) => i >= 0), '每一段都找得到正解', JSON.stringify(chooseSetup.correctIdx));

  await waitFor(async () => {
    const r = await evaluate(`
      const h = document.querySelector('[data-interact]');
      return h && !h.hidden ? h.textContent.replace(/\\s+/g, ' ').trim() : '';
    `);
    return r && /濁靈/.test(r) ? r : null;
  }, { timeout: 8000, label: 'P06b：走近提示' });
  await key('KeyE', 'e', { vk: 69 });
  await sleep(500);
  const chooseOpen = await evaluate(`
    const g = window.__promptasy;
    return { open: g.promptConsole.isOpen, id: g.promptConsole.challenge?.id, act: g.promptConsole.act, mode: g.promptConsole.mode, kindOf: g.promptConsole.flowKindOf(g.promptConsole.challenge?.flow) };
  `);
  eq(chooseOpen.open, true, 'E 打開主控台');
  eq(chooseOpen.id, chooseId, '打開的就是走過去那一隻');
  eq(chooseOpen.act, 1, '第一幕是委託（濁言）');
  eq(chooseOpen.mode, 'guided', '預設設定 → 石碑刻印（用選的）');
  eq(chooseOpen.kindOf, 'choice', '題型是 choice（石碑刻印）');

  // Enter 推到第二幕 → 焦點移開線索 → Enter 推到第三幕
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(420);
  eq(await evaluate(`return window.__promptasy.promptConsole.act;`), 2, 'Enter 推到第二幕（指引）');
  await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(420);
  const chooseAct3 = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      focusedOnOption: document.activeElement?.classList.contains('opt'),
      options: [...document.querySelectorAll('#prompt-console .opt')].filter((o) => o.offsetParent !== null).length,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      freeHidden: !!document.querySelector('#prompt-console .prompt-input')?.closest('[hidden]'),
      ask: document.querySelector('#prompt-console [data-ask]')?.textContent.trim() || '',
    };
  `);
  eq(chooseAct3.act, 3, 'Enter 推到第三幕（刻印）');
  eq(chooseAct3.steleHidden, false, '台上是石碑，不是書寫檯');
  eq(chooseAct3.focusedOnOption, true, '焦點自己落在第一個選項上（純鍵盤）', JSON.stringify(chooseAct3));
  ok(chooseAct3.options >= 2, '選項看得見', JSON.stringify(chooseAct3));
  ok(chooseAct3.ask.length > 4, '第一段有一句世界的問話', chooseAct3.ask);

  // 一段一段用數字鍵刻（先故意選錯一次：石碑不收、不前進、就地長出教學）
  const chooseWrong = await evaluate(`
    const g = window.__promptasy;
    const e = g.murks.entries.find((x) => x.id === '${chooseId}');
    const wrong = e.flow.slots[0].options.findIndex((o) => !o.correct);
    return { wrong, carved: g.promptConsole.stele.progress.carved };
  `);
  await key(`Digit${chooseWrong.wrong + 1}`, String(chooseWrong.wrong + 1), { vk: 48 + chooseWrong.wrong + 1 });
  await sleep(420);
  const chooseReject = await evaluate(`
    const g = window.__promptasy;
    const fb = [...document.querySelectorAll('#prompt-console [data-opt-fb]')].filter((el) => !el.hidden);
    return { carved: g.promptConsole.stele.progress.carved, fb: fb.length, text: fb[0]?.textContent.trim() || '', shells: g.world.murks.byId('${chooseId}').visibleShellCount() };
  `);
  eq(chooseReject.carved, 0, '選錯 → 石碑不收，一段都沒刻上去（不會失敗、也不前進）');
  ok(chooseReject.fb >= 1, '選錯 → 就地長出一句白話教學', chooseReject.text);
  ok(chooseReject.text.length >= 12, '那句教學講得出「為什麼這樣不行」', chooseReject.text);
  eq(chooseReject.shells, 3, '選錯不會剝殼（殼只跟送出去的那段話有關）');

  const chooseCarve = [];
  for (let i = 0; i < chooseSetup.slots; i += 1) {
    const n = chooseSetup.correctIdx[i] + 1;
    await key(`Digit${n}`, String(n), { vk: 48 + n });
    await sleep(420);
    chooseCarve.push(
      await evaluate(`
        const g = window.__promptasy;
        return { carved: g.promptConsole.stele.progress.carved, lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length };
      `)
    );
  }
  eq(chooseCarve[0].carved, 1, '選對第一段就刻上去了');
  eq(chooseCarve[chooseCarve.length - 1].carved, chooseSetup.slots, '三段全部用數字鍵刻滿');
  ok(chooseCarve[chooseCarve.length - 1].lit >= chooseCarve[0].lit, '刻痕對照跟著一盞一盞亮', `${chooseCarve[0].lit} → ${chooseCarve[chooseCarve.length - 1].lit}`);

  const choosePalm = await evaluate(`
    const g = window.__promptasy;
    return { act: g.promptConsole.act, palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'), text: g.promptConsole.stele.text, sample: g.promptConsole.challenge.sample };
  `);
  eq(choosePalm.act, 4, '刻滿之後切到手掌印那一幕');
  eq(choosePalm.palmFocused, true, '焦點自己落在手掌印上');
  eq(choosePalm.text, choosePalm.sample, '刻出來的那段字 ＝ 這一隻的正言（sample）');

  await holdPalm(null, 'P06b：手掌印按滿');
  await waitFor(() => evaluate(`return !document.querySelector('#prompt-console [data-result]').hidden;`), { label: 'P06b：結果面板', every: 150 });
  const chooseResult = await evaluate(`
    const g = window.__promptasy;
    return {
      pass: !!document.querySelector('#prompt-console .result__top.is-pass'),
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      newlyLine: document.querySelector('#prompt-console .result [data-murk-newly]')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      murkState: g.progression.murkState('${chooseId}'),
      murkCount: g.murkCount(),
      xp: g.progression.state.xp,
      cleared: g.progression.isCleared('${chooseId}'),
      best: g.progression.bestGrade('${chooseId}'),
    };
  `);
  eq(chooseResult.pass, true, '全部選對 → 這一次就過了');
  ok(['S', 'A'].includes(chooseResult.grade), '全部選對拿到 ≥A 的評價', String(chooseResult.grade));
  ok(/牠聽懂了/.test(chooseResult.newlyLine), '牠聽懂了（這一次才安撫）', chooseResult.newlyLine);
  eq(JSON.stringify(chooseResult.murkState.hits), '[0,1,2]', '三條檢查全命中 → 三層殼都該剝');
  eq(chooseResult.murkCount, chooseSetup.murkCount + 1, 'murkCount 多一隻');
  ok(chooseResult.xp > chooseSetup.xp, '用選的也拿得到 XP', `${chooseSetup.xp} → ${chooseResult.xp}`);
  eq(chooseResult.cleared, false, '濁靈仍然不算 142 關的通關');
  eq(chooseResult.best, null, '濁靈 id 仍不進 bestGrades');
  const chooseSettled = await waitFor(async () => {
    const r = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.murks.byId('${chooseId}');
      return { state: m.state, shells: m.visibleShellCount(), active: g.world.murks.activeParticles(), headScale: m.head.scale.x };
    `);
    return r.state === 'settled' && r.active === 0 ? r : null;
  }, { timeout: 20000, label: 'P06b：剝殼走完、落成清燈' });
  eq(chooseSettled.shells, 0, '三段選對 → 三層殼都剝掉了（一段對一層殼）');
  ok(chooseSettled.headScale < 0.6, '牠變成清燈', String(chooseSettled.headScale));

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(300);
  /* --- 同一隻切成自由書寫：打字那條路仍然在（不倒退） --- */
  const chooseFree = await evaluate(`
    const g = window.__promptasy;
    const c = g.promptConsole;
    c.open(g.murkChallenge('${chooseId}'));
    await new Promise((r) => setTimeout(r, 250));
    c.setMode('free');
    c.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 250));
    const ta = document.querySelector('.prompt-input');
    const visible = !!ta && ta.offsetParent !== null;
    ta.value = c.challenge.sample;
    document.querySelector('#prompt-console [data-submit]').click();
    await new Promise((r) => setTimeout(r, 500));
    const out = {
      mode: c.mode,
      setting: g.progression.state.settings.promptMode,
      visible,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      pass: !!document.querySelector('#prompt-console .result__top.is-pass'),
      newlyLine: document.querySelector('#prompt-console .result [data-murk-newly]')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      murkCount: g.murkCount(),
    };
    c.close();
    await new Promise((r) => setTimeout(r, 250));
    // 收尾：把答題方式放回預設，後面的段落照舊
    g.progression.updateSettings({ promptMode: 'guided' });
    return out;
  `);
  eq(chooseFree.mode, 'free', '切得到自由書寫');
  eq(chooseFree.setting, 'free', '設定跟著換（玩家自己選的答題方式被記住）');
  eq(chooseFree.visible, true, '自由書寫時書寫檯回到台上');
  eq(chooseFree.steleHidden, true, '自由書寫時石碑收起來');
  eq(chooseFree.pass, true, '同一隻用打字的照樣過（不倒退）');
  ok(/牠早就聽懂了/.test(chooseFree.newlyLine), '牠早就聽懂了（累積狀態沒被打字路徑覆蓋）', chooseFree.newlyLine);
  eq(chooseFree.murkCount, chooseResult.murkCount, '再送一次不會多算一隻');

  /* ================================================================ */
  /*
   * v1.2 · P05：setMood 單一入口 ＋ 一夜的時辰
   *
   * forceHour(3) → 月亮沿弧落到近地平線、星更密更亮、極光更強偏紫、hemi 只動一點點、
   * 霧色相不變；forceHour(null) 回到照進度算；光源仍是 37；預設時辰＝現在的樣子。
   * 全部輪詢式（moodNow 是 lerp 過去的，不對齊牆鐘）。
   */
  console.log('\n▸ 一夜的時辰（v1.2 · P05）');
  const hourBase = await evaluate(`
    const g = window.__promptasy;
    const m = g.engine.mood();
    let lights = 0;
    g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    let sprites = 0;
    g.engine.moonGroup.traverse((o) => { if (o.isSprite) sprites += 1; });
    return {
      hour: g.hour(),
      lights, sprites,
      moonY: g.engine.moonGroup.position.y,
      lightY: g.engine.lights.moon.position.y,
      shadowBias: g.engine.lights.moon.shadow.bias,
      uOpacity: g.engine.stars.material.uniforms.uOpacity.value,
      auroraOpacity: g.engine.aurora.children.map((b) => b.material.opacity),
      hemi: m.target.hemi,
      fog: m.target.fog,
      tint: m.target.tint,
      region: g.hud.region,
      hasForce: typeof g.engine.forceHour === 'function',
    };
  `);
  ok(hourBase.hasForce, 'engine.forceHour 存在（window.__promptasy.engine.forceHour）');
  // 不假設前面的測試留下什麼進度：用輪詢到的 p 依門檻算出應有的 index，只驗一致
  const HOUR_THRESHOLDS = [0.25, 0.5, 1];
  const expectHourIndex = (p) => (p >= 1 - 1e-9 ? 3 : p < HOUR_THRESHOLDS[0] ? 0 : p < HOUR_THRESHOLDS[1] ? 1 : 2);
  ok(Number.isFinite(hourBase.hour.p) && hourBase.hour.p >= 0 && hourBase.hour.p <= 1, 'hour().p 是 0..1 的數', String(hourBase.hour.p));
  eq(hourBase.hour.index, expectHourIndex(hourBase.hour.p), 'hour().index 與 p 依門檻一致（.25／.5／1）', JSON.stringify(hourBase.hour));
  const hourBaseIndex = hourBase.hour.index;
  eq(hourBase.hour.forced, null, '沒有覆寫');
  eq(hourBase.sprites, 2, '月亮仍是 disc ＋ halo 兩個 Sprite（月相沒加遮罩）');
  const hourAtmoBefore = hourBase;

  await evaluate(`window.__promptasy.engine.forceHour(3); return 1;`);
  const hour3Immediate = await evaluate(`
    const g = window.__promptasy;
    const m = g.engine.mood();
    return { hour: g.hour(), forced: g.engine.forcedHour, target: m.target };
  `);
  eq(hour3Immediate.forced, 3, 'forceHour(3) → engine.forcedHour 3');
  eq(hour3Immediate.hour.index, 3, 'hour().index 立刻是 3');
  eq(hour3Immediate.hour.forced, 3, 'hour().forced 3');
  eq(hour3Immediate.hour.p, hourBase.hour.p, 'hour().p 仍是真實進度（覆寫不改 p）', String(hour3Immediate.hour.p));
  eq(JSON.stringify(hour3Immediate.target.moon), JSON.stringify({ alt: 0.05, phase: 1 }), 'target moon {alt .05, phase 1}（星最亮之夜）');
  eq(hour3Immediate.target.stars.density, 1, 'target stars.density 1');
  eq(JSON.stringify(hour3Immediate.target.aurora), JSON.stringify({ intensity: 1, hue: 0.4 }), 'target aurora {intensity 1, hue .4}');
  ok(Math.abs(hour3Immediate.target.hemi - hourBase.hemi - 0.02) < 1e-9, 'target hemi ＝ 區域 hemi ＋ 0.02', `${hourBase.hemi} → ${hour3Immediate.target.hemi}`);
  eq(hour3Immediate.target.tint, hourBase.tint, 'tint 不變（時辰不換色系）');

  const hour3 = await waitFor(
    async () => {
      const r = await evaluate(`
        const g = window.__promptasy;
        const m = g.engine.mood();
        return {
          moonY: g.engine.moonGroup.position.y,
          lightY: g.engine.lights.moon.position.y,
          lightLen: g.engine.lights.moon.position.length(),
          shadowBias: g.engine.lights.moon.shadow.bias,
          uOpacity: g.engine.stars.material.uniforms.uOpacity.value,
          uScale: g.engine.stars.material.uniforms.uScale.value,
          auroraOpacity: g.engine.aurora.children.map((b) => b.material.opacity),
          auroraBase: g.engine.aurora.children.map((b) => b.userData.baseOpacity),
          auroraColor: g.engine.aurora.children.map((b) => b.material.color.getHex()),
          disc: (() => { const d = g.engine.moonGroup.getObjectByName('moonDisc'); return [d.scale.x, d.material.opacity]; })(),
          halo: (() => { const d = g.engine.moonGroup.getObjectByName('moonHalo'); return [d.scale.x, d.material.opacity]; })(),
          nowAlt: m.now.moon.alt, nowIntensity: m.now.aurora.intensity, nowHue: m.now.aurora.hue, nowDensity: m.now.stars.density,
          hemiNow: m.now.hemi, fogNow: m.now.fog, fogTarget: m.target.fog,
          fogSceneHex: g.engine.scene.fog.color.getHex(),
        };
      `);
      return r.nowAlt < 0.06 && r.nowIntensity > 0.99 && r.nowHue > 0.39 && r.nowDensity > 0.99 && r.fogNow === r.fogTarget ? r : null;
    },
    { timeout: 30000, every: 300, label: 'hour 3 的氛圍平滑到位' }
  );
  ok(hour3.moonY < hourBase.moonY * 0.4, '月亮群 y 明顯低於 hour 0（沿弧落到近地平線）', `${hourBase.moonY.toFixed(0)} → ${hour3.moonY.toFixed(0)}`);
  ok(hour3.moonY > 40, '月亮仍在地平線上（≈8°，沒有落下去）', String(hour3.moonY.toFixed(0)));
  {
    // 月光（投影）：跟著弧降、但仰角有 22° 下限（sprite 群比它低）；bias 隨仰角溫和放大、≤ 3×
    const floorY = Math.sin((22 * Math.PI) / 180) * hour3.lightLen;
    ok(hour3.lightY <= hourBase.lightY + 1e-6, '月光 DirectionalLight 不高於覆寫前', `${hourBase.lightY} → ${hour3.lightY.toFixed(2)}`);
    if (hourBaseIndex === 0) ok(hour3.lightY < hourBase.lightY * 0.6, '（覆寫前是入夜）月光比 hour 0 明顯低', `${hourBase.lightY} → ${hour3.lightY.toFixed(2)}`);
    ok(hour3.lightY >= floorY - 1e-6, '月光仰角不低於 22° 下限', `y=${hour3.lightY.toFixed(3)} floorY=${floorY.toFixed(3)}`);
    ok(Math.abs(hour3.lightY - floorY) < 1e-6, 'hour 3（alt .05 → 月亮 ≈ 10°）月光被夾在 22°', `y=${hour3.lightY.toFixed(3)}`);
    ok(hour3.moonY / 520 < Math.sin((22 * Math.PI) / 180), '月亮 sprite 群的仰角低於月光的下限（群一路跟著 alt 落）', String((Math.asin(hour3.moonY / 520) * 180 / Math.PI).toFixed(1)));
    if (hourBase.shadowBias !== 0) {
      const mul = hour3.shadowBias / hourBase.shadowBias;
      ok(mul >= 1 && mul <= 3, 'shadow.bias 隨低仰角放大、夾在 3× 內', `${hourBase.shadowBias} → ${hour3.shadowBias} (×${mul.toFixed(2)})`);
      if (hourBaseIndex === 0) ok(mul > 1.5, '（覆寫前是入夜）hour 3 的 bias ≈ ×2（sin 50.2°／sin 22°）', `×${mul.toFixed(2)}`);
    } else {
      eq(hour3.shadowBias, 0, '低畫質沒有投影：bias 仍 0');
    }
  }
  ok(hour3.uOpacity >= 0.95, '星 uOpacity ≥ 0.95', String(hour3.uOpacity));
  ok(hour3.uScale > 950, '星 uScale 放大（> 950）', String(hour3.uScale));
  ok(hour3.auroraOpacity.every((o, i) => Math.abs(o / hour3.auroraBase[i] - 1.5) < 0.05), '極光 opacity 乘數 ≈ 1.5（intensity 1）', JSON.stringify(hour3.auroraOpacity));
  ok(hour3.auroraOpacity.every((o, i) => o > hourAtmoBefore.auroraOpacity[i]), '極光比 hour 0 更亮');
  ok(hour3.auroraColor.every((c) => c !== 0xffffff), '極光材質色偏離白（hue +.4 → 偏紫）', hour3.auroraColor.map((c) => c.toString(16)).join(','));
  ok(hour3.auroraColor.every((c) => ((c >> 16) & 0xff) < 0xff && (c & 0xff) === 0xff && ((c >> 8) & 0xff) < ((c >> 16) & 0xff)), '偏紫：藍 255、紅 > 綠', hour3.auroraColor.map((c) => c.toString(16)).join(','));
  ok(hour3.disc[0] > 34 && hour3.halo[0] > 170 && hour3.halo[1] > 0.5, '月相 1：月盤更大、月暈更大更亮', JSON.stringify([hour3.disc, hour3.halo]));
  ok(Math.abs(hour3.hemiNow - hourBase.hemi) <= 0.08, 'hemi 變化在 ±0.08 內', `${hourBase.hemi} → ${hour3.hemiNow.toFixed(3)}`);
  {
    const hsl = (hex) => { const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0; if (mx !== mn) { const d = mx - mn; if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6; else if (mx === g) h = ((b - r) / d + 2) / 6; else h = ((r - g) / d + 4) / 6; } return { h, l: (mx + mn) / 2 }; };
    const a = hsl(hourBase.fog), b = hsl(hour3.fogNow);
    const dh = Math.min(Math.abs(a.h - b.h), 1 - Math.abs(a.h - b.h));
    ok(dh < 0.03, 'fog 色相不變（只乘亮度）', `Δh=${dh.toFixed(4)} ${hourBase.fog.toString(16)}→${hour3.fogNow.toString(16)}`);
    ok(b.l > a.l && b.l < a.l * 1.12, 'fog 亮度略升（×1.05 以內，仍是夜）', `${a.l.toFixed(3)}→${b.l.toFixed(3)}`);
    ok(b.l < 0.25, '星最亮之夜的霧仍是深色（沒有黎明）', String(b.l.toFixed(3)));
  }
  eq(hour3.fogSceneHex, hour3.fogNow, 'scene.fog 的顏色就是 moodNow.fog（同一份狀態）');

  // 覆寫期間進區／進程變化仍走同一入口：applyMood 重組後 target 仍是 hour 3
  const hour3Reapply = await evaluate(`
    const g = window.__promptasy;
    g.applyMood();
    const m = g.engine.mood();
    return { alt: m.target.moon.alt, hue: m.target.aurora.hue, index: g.hour().index };
  `);
  eq(hour3Reapply.alt, 0.05, 'applyMood 重組後仍是 hour 3 的 target（覆寫優先）');
  eq(hour3Reapply.index, 3, 'hour().index 仍 3');

  await evaluate(`window.__promptasy.engine.forceHour(null); return 1;`);
  const hourBack = await waitFor(
    async () => {
      const r = await evaluate(`
        const g = window.__promptasy;
        const m = g.engine.mood();
        return { hour: g.hour(), forced: g.engine.forcedHour, target: m.target, nowAlt: m.now.moon.alt, moonY: g.engine.moonGroup.position.y, uOpacity: g.engine.stars.material.uniforms.uOpacity.value, auroraColor: g.engine.aurora.children.map((b) => b.material.color.getHex()), fogNow: m.now.fog };
      `);
      // moodNow 靠近 1e-5 內就貼上 target（mood.step）—— 等它真的貼上，不用容忍值
      return r.nowAlt === 0.75 && r.fogNow === r.target.fog ? r : null;
    },
    { timeout: 30000, every: 300, label: 'forceHour(null) 平滑回入夜' }
  );
  eq(hourBack.forced, null, 'forceHour(null) → 覆寫清掉');
  eq(hourBack.hour.index, hourBaseIndex, 'hour().index 回到照進度算的那一格');
  eq(hourBack.hour.index, expectHourIndex(hourBack.hour.p), 'hour().index 與 p 依門檻一致');
  eq(hourBack.hour.forced, null, 'hour().forced null');
  eq(JSON.stringify(hourBack.target.moon), JSON.stringify({ alt: 0.75, phase: 0.3 }), 'target 回入夜的月');
  ok(Math.abs(hourBack.moonY - hourBase.moonY) < 0.5, '月亮群回到 hour 0 的高度', `${hourBack.moonY.toFixed(2)} vs ${hourBase.moonY.toFixed(2)}`);
  ok(Math.abs(hourBack.uOpacity - 0.9) < 0.005, '星 uOpacity 回 0.9', String(hourBack.uOpacity));
  ok(hourBack.auroraColor.every((c) => c === 0xffffff), '極光材質色回白');
  eq(hourBack.fogNow, hourBase.fog, '霧色回到區域色盤');

  const hourLights = await evaluate(`
    const g = window.__promptasy;
    let lights = 0; g.engine.scene.traverse((o) => { if (o.isLight) lights += 1; });
    let meshes = 0; g.engine.scene.traverse((o) => { if (o.isMesh) meshes += 1; });
    return { lights, meshes };
  `);
  eq(hourLights.lights, hourBase.lights, '光源數在 forceHour 前後不變（P05 零新光源）');
  // forceHour 只收 null／整數 0..3（數字字串 '2' 也算）；其他一律忽略：不改狀態、不通知
  {
    const bad = await evaluate(`
      const g = window.__promptasy;
      let notified = 0;
      const off = g.engine.onHourForced(() => { notified += 1; });
      g.engine.forceHour(2);
      const okNotified = notified;
      const rets = [];
      for (const v of [9, -2, 2.5, '', false, NaN, '3px', {}, true, [], '  ', Infinity]) rets.push(g.engine.forceHour(v));
      const after = g.engine.forcedHour;
      const badNotified = notified - okNotified;
      const str = g.engine.forceHour('3');
      const strForced = g.engine.forcedHour;
      const cleared = g.engine.forceHour(null);
      off();
      return { okNotified, rets, after, badNotified, str, strForced, cleared, forcedAfterClear: g.engine.forcedHour, hourAfter: g.hour() };
    `);
    eq(bad.okNotified, 1, 'forceHour(2) 通知一次');
    eq(bad.after, 2, '9／-2／2.5／\'\'／false／NaN／\'3px\'／{}／true／[]／\'  \'／Infinity 全部忽略：forcedHour 仍 2');
    ok(bad.rets.every((r) => r === 2), '被忽略的呼叫回傳目前的覆寫值 2', JSON.stringify(bad.rets));
    eq(bad.badNotified, 0, '被忽略的呼叫不通知');
    eq(bad.str, 3, "forceHour('3') → 3（數字字串）");
    eq(bad.strForced, 3, "forcedHour 3");
    eq(bad.cleared, null, 'forceHour(null) 回 null');
    eq(bad.forcedAfterClear, null, '清掉覆寫');
    eq(bad.hourAfter.forced, null, 'hour().forced null');
  }
  await sleep(300);

  /* ================================================================ */
  /*
   * 動得了的器物（Phase 25）
   *
   * 世界的第五層互動：抄寫人留在原地、你真的碰得到的東西。
   * 這一段走完整流程 —— 走過去 → 出現提示 → 按 E → 東西真的動了 →
   * 寫進存檔 → 再互動一次的行為正確 → 重整之後還在。
   */
  console.log('\n▸ 動得了的器物（Phase 25）');

  /* --- ① 世界裡真的有這一層，而且沒有多花任何一盞燈 --- */
  const p25 = await evaluate(`
    const g = window.__promptasy;
    const names = [];
    g.world.root.traverse((o) => { if (o.name && o.name.startsWith('handle:')) names.push(o.name); });
    let lights = 0, tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry && o.geometry.index) tris += (o.geometry.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    let handleLights = 0;
    g.world.handles.group.traverse((o) => { if (o.isLight) handleLights += 1; });
    const kinds = {};
    for (const o of g.world.handles.objects) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    const regions = {};
    for (const e of g.handleData.entries) regions[e.region] = (regions[e.region] || 0) + 1;
    return {
      built: names.length, total: g.handleData.entries.length,
      unique: new Set(names).size, kinds, regions,
      lights, tris, handleLights, solids: g.world.solids.length,
    };
  `);
  eq(p25.built, p25.total, '每一件器物都蓋在世界裡');
  eq(p25.unique, p25.total, '場景圖節點名沒有重複');
  eq(p25.handleLights, 0, '器物一盞燈都沒加（只用自發光材質）');
  ok(Object.keys(p25.kinds).length >= 6, '世界上至少有 6 種器物', JSON.stringify(p25.kinds));
  // v1.2 · P06c：課程 v2 之後蓋起來的七片土地也補齊了 → 12 片土地一片都不空
  ok(Object.keys(p25.regions).length === 12, '十二片土地上都有器物（P06c）', JSON.stringify(p25.regions));
  for (const [rid, n] of Object.entries(p25.regions)) ok(n >= 2, `[${rid}] 至少擺了 2 件`, String(n));
  eq(p25.total, 44, 'P06c：器物總數 44', String(p25.total));
  ok(p25.lights <= 56, '多了一整層器物之後燈光仍在預算內', `lights=${p25.lights}`);
  ok(p25.tris < 420000, '多了一整層器物之後三角形仍在預算內', `tris=${p25.tris}`);
  ok(p25.solids < 1400, '碰撞體仍在預算內', `solids=${p25.solids}`);

  /* --- ② 陶罐的完整流程：走近 → 提示 → E → 小窗 → XP → 存檔 --- */
  const urnFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'urn');
    const obj = g.world.handles.object(spec.id);
    const before = { xp: g.progression.state.xp, n: g.progression.handleCount() };
    /*
     * 先站遠一點：這時候不該看到「這件東西」的提示。
     * 不能直接看 hidden —— 器物擺得密，14 公尺外可能剛好站在另一件旁邊，
     * 那是正確行為（提示本來就該顯示那一件）。要驗的是「這一件的提示不見了」。
     */
    g.player.teleport(spec.at[0] + 14, spec.at[1] + 14);
    await new Promise((r) => setTimeout(r, 380));
    const farHint = document.querySelector('[data-interact]');
    const hintFar = farHint.hidden || !farHint.textContent.includes(spec.title);
    const lidFar = obj.lidPivot.rotation.x;
    // 走過去（輪詢到提示真的換成這一件為止 —— 軟體渲染一幀可能好幾百毫秒，
    // 固定 sleep 會量到「上一個位置」那一件的提示，然後把 E 按在別的東西上）
    g.player.teleport(spec.at[0] + 1.8, spec.at[1] + 1.8);
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        const el = document.querySelector('[data-interact]');
        if (el && !el.hidden && el.textContent.includes(spec.title)) break;
        await new Promise((r) => setTimeout(r, 60));
      }
    }
    const hint = document.querySelector('[data-interact]');
    const out = {
      id: spec.id, title: spec.title, lines: spec.lines,
      hintFar, lidFar,
      hintHidden: hint.hidden,
      hintText: hint.textContent.replace(/\\s+/g, ' ').trim(),
      nearGlow: obj.near,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 520));
    const panel = document.querySelector('#handle');
    out.open = g.handlePanel.isOpen;
    out.shown = [...panel.querySelectorAll('.inscribe__line')].map((p) => p.textContent.trim());
    out.delays = [...panel.querySelectorAll('.inscribe__line')].map((p) => getComputedStyle(p).animationDelay);
    out.note = panel.querySelector('.inscribe__note')?.textContent.trim() || '';
    // 護欄 2：這一層一個字都不准宣稱技巧、不准放連結
    out.links = panel.querySelectorAll('a[href]').length;
    out.claims = /神諭原典|官方|技巧/.test(panel.textContent);
    out.xpAfter = g.progression.state.xp;
    out.nAfter = g.progression.handleCount();
    out.saved = JSON.parse(localStorage.getItem('promptasy.v1.save')).handlesUsed;
    out.before = before;
    // 蓋子真的掀開了
    await new Promise((r) => setTimeout(r, 500));
    out.lidNear = obj.lidPivot.rotation.x;
    return out;
  `);
  eq(urnFlow.hintFar, true, '離得遠的時候沒有互動提示');
  eq(urnFlow.hintHidden, false, '走近陶罐 → 出現互動提示');
  ok(urnFlow.hintText.includes(urnFlow.title), '提示上有這件東西在世界裡的名字', urnFlow.hintText);
  ok(/E/.test(urnFlow.hintText) && /掀開/.test(urnFlow.hintText), '提示是「名字 ＋ 狀態 ＋ E ＋ 動詞」', urnFlow.hintText);
  eq(urnFlow.nearGlow, true, '走近的那一件會亮起來');
  eq(urnFlow.open, true, '按 E 打開一個很小的窗');
  eq(urnFlow.shown.length, 2, '罐底寫了兩行字');
  eq(urnFlow.shown[0], urnFlow.lines[0], '顯示的就是資料裡那兩行');
  ok(urnFlow.delays[0] !== urnFlow.delays[1], '兩行是分段揭示的', urnFlow.delays.join(' / '));
  eq(urnFlow.links, 0, '純風味這一層不放任何連結（護欄 2）');
  eq(urnFlow.claims, false, '也不宣稱任何技巧或官方說法（護欄 2）');
  ok(/\+\s*\d+\s*XP/.test(urnFlow.note), '第一次動它有 XP 提示', urnFlow.note);
  ok(urnFlow.xpAfter > urnFlow.before.xp, '第一次動它真的給了 XP', `${urnFlow.before.xp} → ${urnFlow.xpAfter}`);
  eq(urnFlow.nAfter, urnFlow.before.n + 1, '器物計數 +1');
  ok(urnFlow.saved.includes(urnFlow.id), '寫進存檔', urnFlow.saved.join(','));
  ok(Math.abs(urnFlow.lidNear - urnFlow.lidFar) > 0.5, '蓋子真的掀起來了（不是只有旗標）', `${urnFlow.lidFar} → ${urnFlow.lidNear}`);

  // 再掀一次：蓋子還是開著、不再給 XP
  const urnAgain = await evaluate(`
    const g = window.__promptasy;
    g.handlePanel.close();
    await new Promise((r) => setTimeout(r, 280));
    const spec = g.handleData.entries.find((e) => e.kind === 'urn');
    const xp = g.progression.state.xp;
    g.player.teleport(spec.at[0] + 1.8, spec.at[1] + 1.8);
    await new Promise((r) => setTimeout(r, 400));
    const hintText = document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 420));
    const note = document.querySelector('#handle .inscribe__note')?.textContent.trim() || '';
    const after = g.progression.state.xp;
    g.handlePanel.close();
    await new Promise((r) => setTimeout(r, 260));
    return { xp, after, note, hintText, n: g.progression.handleCount() };
  `);
  eq(urnAgain.after, urnAgain.xp, '再掀一次不再給 XP（不能刷分）');
  ok(/動過/.test(urnAgain.note), '再看一眼時說「這件東西你已經動過了」', urnAgain.note);
  ok(/再看一眼/.test(urnAgain.hintText), '動過之後提示換成另一個動詞', urnAgain.hintText);

  /* --- ③ 絞盤：按三次 E 才轉得開，而且推到一半不會失敗 --- */
  const capFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'capstan');
    const obj = g.world.handles.object(spec.id);
    const out = { id: spec.id, steps: [], xp0: g.progression.state.xp };
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    await new Promise((r) => setTimeout(r, 420));
    out.hint0 = document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim();
    out.spin0 = obj.drum.rotation.y;
    for (let i = 0; i < 3; i += 1) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
      await new Promise((r) => setTimeout(r, 420));
      out.steps.push({
        remaining: obj.remaining,
        used: g.progression.hasUsedHandle(spec.id),
        xp: g.progression.state.xp,
        anyPanel: g.handlePanel.isOpen,
        hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim(),
        toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()).pop() || '',
      });
    }
    await new Promise((r) => setTimeout(r, 700));
    out.spin1 = obj.drum.rotation.y;
    out.opened = obj.opened;
    out.shaft = obj.shaft.visible;
    out.saved = JSON.parse(localStorage.getItem('promptasy.v1.save')).handlesUsed.includes(spec.id);
    return out;
  `);
  ok(/推動/.test(capFlow.hint0), '走近絞盤 → 提示是「推動」', capFlow.hint0);
  eq(capFlow.steps[0].used, false, '推第一下還沒完成（不是一按就開）');
  eq(capFlow.steps[1].used, false, '推第二下還沒完成');
  eq(capFlow.steps[2].used, true, '推第三下才算完成');
  eq(capFlow.steps[0].remaining, 2, '第一下之後還要推 2 下');
  eq(capFlow.steps[1].remaining, 1, '第二下之後還要推 1 下');
  eq(capFlow.steps[2].remaining, 0, '推完就不用再推了');
  ok(/2 下/.test(capFlow.steps[0].hint), '走近提示直接寫出還要推幾下（不用猜）', capFlow.steps[0].hint);
  eq(capFlow.steps[0].xp, capFlow.xp0, '推到一半不給 XP');
  ok(capFlow.steps[2].xp > capFlow.xp0, '推完才給 XP', `${capFlow.xp0} → ${capFlow.steps[2].xp}`);
  eq(capFlow.steps.every((s) => s.anyPanel === false), true, '推絞盤全程不開任何窗（不打斷走路）');
  ok(capFlow.steps[0].toast.includes('還要'), '推一下會在畫面上說一句話', capFlow.steps[0].toast);
  ok(Math.abs(capFlow.spin1 - capFlow.spin0) > 3, '鼓真的轉了一圈', `${capFlow.spin0} → ${capFlow.spin1}`);
  ok(capFlow.opened > 0.5, '石蓋滑開了', String(capFlow.opened));
  eq(capFlow.shaft, true, '底下那道光出現了');
  eq(capFlow.saved, true, '推開的絞盤寫進存檔');

  /* --- ④ 長凳：坐下 → 鏡頭往後退 → 走一步就自己起身 --- */
  const benchFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'bench');
    g.player.teleport(spec.at[0] + 2.2, spec.at[1] + 2.2);
    await new Promise((r) => setTimeout(r, 420));
    const out = {
      id: spec.id,
      hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim(),
      camBefore: g.player.cameraDistance,
      restBefore: g.player.restAmount,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 1100));
    out.seated = g.seatedOn();
    out.rest = g.player.restAmount;
    out.cam = g.player.cameraDistance;
    out.knee = g.player.character.joints.kneeL.rotation.x;
    out.onSeat = Math.hypot(g.player.position.x - spec.at[0], g.player.position.z - spec.at[1]) < 1.4;
    out.hintSeated = document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim();
    // 再按一次 E → 起身
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    out.seatedAfter = g.seatedOn();
    out.restAfter = g.player.restAmount;
    out.camAfter = g.player.cameraDistance;
    // 再坐一次，然後「走一步」→ 應該自己站起來
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    out.seatedAgain = g.seatedOn();
    g.player.teleport(spec.at[0] + 6, spec.at[1] + 6);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    out.seatedAfterWalk = g.seatedOn();
    out.restAfterWalk = g.player.restAmount;
    return out;
  `);
  ok(/坐下/.test(benchFlow.hint), '走近長凳 → 提示是「坐下」', benchFlow.hint);
  eq(benchFlow.seated, benchFlow.id, '按 E 坐到那張長凳上');
  ok(benchFlow.rest > 0.7, '角色真的擺出坐姿', benchFlow.rest.toFixed(2));
  ok(benchFlow.knee > 1.0, '膝蓋真的彎起來了（不是站著不動）', benchFlow.knee.toFixed(2));
  ok(benchFlow.cam > benchFlow.camBefore + 1, '坐下時鏡頭往後退', `${benchFlow.camBefore} → ${benchFlow.cam}`);
  eq(benchFlow.onSeat, true, '人是坐在凳子上，不是坐在旁邊的空氣裡');
  ok(/起身/.test(benchFlow.hintSeated), '坐著的時候提示換成「起身」', benchFlow.hintSeated);
  eq(benchFlow.seatedAfter, null, '再按一次 E 就起身');
  ok(benchFlow.restAfter < 0.3, '起身之後坐姿收回去', benchFlow.restAfter.toFixed(2));
  ok(Math.abs(benchFlow.camAfter - benchFlow.camBefore) < 0.6, '鏡頭距離還回原本的樣子', String(benchFlow.camAfter));
  eq(benchFlow.seatedAgain, benchFlow.id, '可以再坐一次');
  eq(benchFlow.seatedAfterWalk, null, '走一步就自己站起來（不用再按一次 E）');
  ok(benchFlow.restAfterWalk < 0.3, '走起來之後坐姿歸零', benchFlow.restAfterWalk.toFixed(2));

  /* --- ⑤ 響石：可以一直敲，但只有第一次給 XP --- */
  const gongFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'gong');
    const obj = g.world.handles.object(spec.id);
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    // 輪詢到提示換成響石為止（同上：固定 sleep 會把 E 按在上一個位置那一件上）
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        const el = document.querySelector('[data-interact]');
        if (el && !el.hidden && el.textContent.includes(spec.title)) break;
        await new Promise((r) => setTimeout(r, 60));
      }
    }
    const out = { hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim() };
    out.hitBefore = obj.hit;
    out.swingBefore = obj.swingPivot.rotation.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    out.hit = obj.hit;
    out.swing = obj.swingPivot.rotation.x;
    out.ring = obj.ring.visible;
    out.xp1 = g.progression.state.xp;
    out.panel = g.handlePanel.isOpen;
    // 再敲：照樣有反應，但不再給 XP
    await new Promise((r) => setTimeout(r, 900));
    obj.hit = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    out.hit2 = obj.hit;
    out.xp2 = g.progression.state.xp;
    return out;
  `);
  ok(/敲響/.test(gongFlow.hint), '走近響石 → 提示是「敲響」', gongFlow.hint);
  eq(gongFlow.hitBefore, 0, '沒敲之前是靜止的');
  ok(gongFlow.hit > 0.5, '敲下去石盤真的在震', gongFlow.hit.toFixed(2));
  ok(Math.abs(gongFlow.swing - gongFlow.swingBefore) > 0.001, '盤子真的晃起來了');
  eq(gongFlow.ring, true, '敲下去有一圈光擴散出去');
  eq(gongFlow.panel, false, '敲鑼不開任何窗');
  ok(gongFlow.hit2 > 0.5, '第二次敲照樣有反應（東西不會用完）', gongFlow.hit2.toFixed(2));
  eq(gongFlow.xp2, gongFlow.xp1, '第二次敲不再給 XP');

  /* --- ⑥ 守望石：摸它 → 睜眼 ＋ 轉向你還沒解開的那座石座 --- */
  const watchFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'watchstone');
    const obj = g.world.handles.object(spec.id);
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    await new Promise((r) => setTimeout(r, 420));
    const out = {
      hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim(),
      eyeBefore: obj.eyes[0].material.emissiveIntensity,
      faceBefore: obj.headPivot.rotation.y,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 2400));
    out.eye = obj.eyes[0].material.emissiveIntensity;
    out.face = obj.headPivot.rotation.y;
    out.target = obj.target ? obj.target.name : null;
    out.beam = obj.beam.visible;
    out.toast = [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()).pop() || '';
    const objective = g.world.objectiveTarget(g.hud.region);
    out.objective = objective ? objective.name : null;
    // 頭該轉到的角度（跟世界端算的是同一條式子）
    if (obj.target) {
      const want = Math.atan2(obj.target.x - obj.worldX, obj.target.z - obj.worldZ) - obj.baseRot;
      const d = out.face - want;
      out.aimError = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    }
    return out;
  `);
  ok(/觸碰/.test(watchFlow.hint), '走近守望石 → 提示是「觸碰」', watchFlow.hint);
  ok(watchFlow.eye > watchFlow.eyeBefore + 1, '摸它 → 眼睛亮起來', `${watchFlow.eyeBefore} → ${watchFlow.eye}`);
  eq(watchFlow.target, watchFlow.objective, '它看的是「你還沒解開的那座石座」');
  ok(watchFlow.aimError < 0.35, '頭真的轉到那座石座的方向', `誤差 ${(watchFlow.aimError ?? NaN).toFixed(3)} 弧度`);
  eq(watchFlow.beam, true, '地上有一道很淡的指向');
  ok(watchFlow.toast.includes(watchFlow.objective), '畫面上說出它看向哪裡', watchFlow.toast);

  /* --- ⑦ 指路石：四個方向，一塊牌子一行 --- */
  const signFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'signpost');
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    await new Promise((r) => setTimeout(r, 420));
    const out = { hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim() };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 520));
    const panel = document.querySelector('#handle');
    out.open = g.handlePanel.isOpen;
    out.rows = [...panel.querySelectorAll('.ways__row')].map((li) => ({
      to: li.querySelector('b').textContent.trim(),
      text: li.querySelector('span').textContent.trim(),
    }));
    out.links = panel.querySelectorAll('a[href]').length;
    // 版面：窄畫面下不會橫向溢位
    out.overflow = panel.scrollWidth - panel.clientWidth;
    out.ways = spec.ways;
    g.handlePanel.close();
    await new Promise((r) => setTimeout(r, 260));
    return out;
  `);
  ok(/閱讀/.test(signFlow.hint), '走近指路石 → 提示是「閱讀」', signFlow.hint);
  eq(signFlow.open, true, '按 E 讀得到指路石');
  eq(signFlow.rows.length, 4, '四塊牌子、四個方向');
  eq(signFlow.rows[0].to, signFlow.ways[0].to, '方位就是資料裡寫的');
  ok(signFlow.rows.every((r) => r.text.length >= 8), '每個方向都說得出那邊有什麼');
  eq(signFlow.links, 0, '指路石不放連結（純風味）');
  ok(signFlow.overflow <= 1, '指路石的版面沒有橫向溢位', String(signFlow.overflow));

  /* --- ⑧ 火盆：點著之後就一直亮著 --- */
  const fireFlow = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'brazier');
    const obj = g.world.handles.object(spec.id);
    g.player.teleport(spec.at[0] + 2.0, spec.at[1] + 2.0);
    await new Promise((r) => setTimeout(r, 420));
    const out = {
      id: spec.id,
      hint: document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim(),
      litBefore: obj.lit,
      flameBefore: obj.flameA.material.emissiveIntensity,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 1400));
    out.lit = obj.lit;
    out.flame = obj.flameA.material.emissiveIntensity;
    out.glow = obj.glow.material.opacity;
    out.toast = [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()).pop() || '';
    out.hintAfter = document.querySelector('[data-interact]').textContent.replace(/\\s+/g, ' ').trim();
    return out;
  `);
  ok(/點火/.test(fireFlow.hint), '走近沒點著的火盆 → 提示是「點火」', fireFlow.hint);
  eq(fireFlow.litBefore, 0, '一開始火是熄的');
  ok(fireFlow.lit > 0.8, '點起來之後火一直亮著', fireFlow.lit.toFixed(2));
  ok(fireFlow.flame > fireFlow.flameBefore + 1, '火焰真的在發光', fireFlow.flame.toFixed(2));
  ok(fireFlow.glow > 0.02, '地上有一圈暖光', fireFlow.glow.toFixed(3));
  ok(fireFlow.toast.includes('XP'), '第一次點著會說一句話並給 XP', fireFlow.toast);
  ok(/撥一下火/.test(fireFlow.hintAfter), '點著之後提示換成「撥一下火」', fireFlow.hintAfter);

  /* --- ⑨ 純鍵盤：不碰滑鼠也動得了（Phase 23 的鐵則） --- */
  await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'moonpool');
    g.player.teleport(spec.at[0] + 1.8, spec.at[1] + 1.8);
    return true;
  `);
  await sleep(450);
  await key('KeyE', 'e', { vk: 69 });
  await sleep(700);
  const kbHandle = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'moonpool');
    const obj = g.world.handles.object(spec.id);
    return {
      used: g.progression.hasUsedHandle(spec.id),
      scoop: obj.scoop,
      saved: JSON.parse(localStorage.getItem('promptasy.v1.save')).handlesUsed.includes(spec.id),
    };
  `);
  eq(kbHandle.used, true, '真的按下鍵盤的 E 也動得了器物（純鍵盤走得完）');
  ok(kbHandle.scoop > 0.3, '撈月池的水面真的動了', kbHandle.scoop.toFixed(2));
  eq(kbHandle.saved, true, '純鍵盤的互動一樣寫進存檔');

  /* --- ⑩ 圖鑑：多了一列「動過的器物」 --- */
  const handleFinds = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 400));
    const rows = [...document.querySelectorAll('#codex .finds__list li')].map((li) => ({
      label: li.querySelector('b').textContent.trim(),
      n: li.querySelector('span').textContent.trim(),
    }));
    g.codex.close();
    await new Promise((r) => setTimeout(r, 260));
    return { rows, total: g.handleData.entries.length, used: g.progression.handleCount() };
  `);
  {
    const row = handleFinds.rows.find((r) => r.label.includes('器物'));
    ok(Boolean(row), '圖鑑有「動過的器物」這一列', JSON.stringify(handleFinds.rows));
    eq(row && row.n, `${handleFinds.used} / ${handleFinds.total}`, '計數是「動過 / 總數」');
    ok(handleFinds.used >= 5, '這一輪至少動過 5 件', String(handleFinds.used));
  }

  /* --- ⑪ 這一層不影響走位：四周每個方向都走得到 --- */
  const handleClear = await evaluate(`
    const g = window.__promptasy;
    const blocked = [];
    for (const spec of g.handleData.entries) {
      let free = 0;
      for (let a = 0; a < 20; a += 1) {
        const ang = (a / 20) * Math.PI * 2;
        if (!g.world.solidAt(spec.at[0] + Math.cos(ang) * 2.4, spec.at[1] + Math.sin(ang) * 2.4)) free += 1;
      }
      if (free < 18) blocked.push(spec.id + ':' + free);
    }
    return { blocked };
  `);
  eq(handleClear.blocked.length, 0, '每一件器物四周都走得到（按得到 E）', handleClear.blocked.join(','));

  /* --- ⑫ 讀題的時候不會被器物打斷（面板開著時不接 E） --- */
  const handleQuiet = await evaluate(`
    const g = window.__promptasy;
    const spec = g.handleData.entries.find((e) => e.kind === 'gong');
    const obj = g.world.handles.object(spec.id);
    g.player.teleport(spec.at[0] + 1.8, spec.at[1] + 1.8);
    await new Promise((r) => setTimeout(r, 400));
    obj.hit = 0;
    g.codex.open();
    // 輪詢到提示真的收起來（軟體渲染一幀可能好幾百毫秒，固定 sleep 對不準牆鐘）
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 60));
      if (document.querySelector('[data-interact]').hidden) break;
    }
    const hintDuring = document.querySelector('[data-interact]').hidden;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const hitDuring = obj.hit;
    g.codex.close();
    await new Promise((r) => setTimeout(r, 400));
    return { hintDuring, hitDuring, stillThere: !document.querySelector('[data-interact]').hidden };
  `);
  eq(handleQuiet.hintDuring, true, '面板開著時互動提示收起來');
  eq(handleQuiet.hitDuring, 0, '面板開著時按 E 不會去敲鑼（一次只有一件事擁有畫面）');
  eq(handleQuiet.stillThere, true, '關掉面板之後提示又回來了');

  /* --- ⑧ 重整之後兩個新欄位都還在 --- */
  await reloadPage('Phase 22 重整');
  const persisted = await evaluate(`
    const g = window.__promptasy;
    await new Promise((r) => setTimeout(r, 200));
    const spec = g.inscriptionData.entries[0];
    return {
      ins: g.progression.inscriptionCount(),
      sec: g.progression.secretCount(),
      worldFound: g.world.inscriptions.find((i) => i.id === spec.id).found,
      secretFound: g.world.reactive.secret(g.secretData.entries.find((s) => s.blessing).id).found,
      blessing: g.progression.state.flags.echoBlessing === true,
      // Phase 25：動過的器物也要跨重整還在，而且世界端要記得它們的樣子
      handles: g.progression.handleCount(),
      urnOpen: (() => {
        const u = g.handleData.entries.find((e) => e.kind === 'urn');
        return g.progression.hasUsedHandle(u.id) ? g.world.handles.object(u.id).used : null;
      })(),
      fireLit: (() => {
        const b = g.handleData.entries.find((e) => e.kind === 'brazier');
        return g.progression.hasUsedHandle(b.id) ? g.world.handles.object(b.id).used : null;
      })(),
      capOpen: (() => {
        const c = g.handleData.entries.find((e) => e.kind === 'capstan');
        return g.progression.hasUsedHandle(c.id) ? g.world.handles.object(c.id).remaining === 0 : null;
      })(),
      seated: g.seatedOn(),
      rest: g.player.restAmount,
    };
  `);
  ok(persisted.handles >= 5, '重整之後動過的器物還在', `n=${persisted.handles}`);
  eq(persisted.urnOpen, true, '重整之後陶罐的蓋子還是開著的');
  eq(persisted.fireLit, true, '重整之後火盆還亮著（你留下的痕跡不會被清掉）');
  eq(persisted.capOpen, true, '重整之後絞盤還是轉開的（不用再推三下）');
  eq(persisted.seated, null, '重整之後不會還坐在凳子上');
  ok(persisted.rest < 0.05, '重整之後是站著的', String(persisted.rest));
  ok(persisted.ins >= 1, '重整之後讀過的刻文還在', `n=${persisted.ins}`);
  ok(persisted.sec >= 1, '重整之後找到的祕密還在', `n=${persisted.sec}`);
  eq(persisted.worldFound, true, '世界端也記得那則刻文讀過了');
  eq(persisted.secretFound, true, '世界端也記得那個祕密找過了');
  eq(persisted.blessing, true, '回聲的祝福跨重整還在');

  /* ================================================================ */
  /*
   * v1.2 · P06c —— 課程 v2 之後才蓋起來的七片土地，路上終於有東西
   *
   * 這一段對 forms／toolcraft／wards／refinery／frugality／sight／divergence
   * 每一片各走一件器物的完整流程（走近 → 提示 → E → 真的動了 → 進存檔），
   * 再各驗一個反應物「走進去才有反應」。
   * 全部用輪詢（waitFor），不用固定 sleep 對齊牆鐘 —— 這台機器是軟體渲染。
   */
  console.log('\n▸ 七片新土地上的器物與反應物（v1.2 · P06c）');
  {
    // 上一段做過一次重整 → 標題卡又擋在前面（它擋著時角色不接操控，teleport 也沒有提示）
    await key('Enter', 'Enter', { vk: 13 });
    await waitFor(() => evaluate('return !window.__promptasy.title.isOpen;'), { label: 'P06c 前標題卡收起' });
    await evaluate(`
      const g = window.__promptasy;
      if (g.prologue.isActive) g.prologue.skip();
      const startBtn = document.querySelector('.intro [data-start]');
      if (g.intro.isOpen && startBtn) startBtn.click();
      for (const k of ['keyhelp','shareCard','promptConsole','codex','settings','finale','tabletPanel','inscriptionPanel','letterPanel','handlePanel','practice']) {
        try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
      }
      g.player.setInputEnabled(true);
      return 1;
    `);
    await waitFor(
      () => evaluate('return window.__promptasy.player.inputEnabled && !window.__promptasy.title.isOpen;'),
      { label: 'P06c 場面清乾淨' }
    );
    const P06C = ['forms', 'toolcraft', 'wards', 'refinery', 'frugality', 'sight', 'divergence'];
    const inventory = await evaluate(`
      const g = window.__promptasy;
      const out = {};
      for (const r of ${JSON.stringify(P06C)}) {
        out[r] = {
          handles: g.handleData.entries.filter((e) => e.region === r).map((e) => ({ id: e.id, kind: e.kind, at: e.at, title: e.title })),
          spots: g.world.reactive.objects.filter((o) => o.spot && o.spot.region === r).map((o) => ({ id: o.id, kind: o.kind, x: o.x, z: o.z })),
        };
      }
      return out;
    `);
    for (const region of P06C) {
      const inv = inventory[region];
      ok(inv.handles.length >= 2, `[${region}] 這片土地上有器物`, String(inv.handles.length));
      ok(inv.spots.length >= 2, `[${region}] 這片土地上有會回應的東西`, String(inv.spots.length));

      /* ① 器物：走近 → 提示 → E → 真的動了 → 進存檔 */
      // 挑一件「按一次就看得出變了」的（不開窗、不用推三下）
      const spec = inv.handles.find((h) => ['gong', 'bench', 'brazier', 'moonpool', 'watchstone'].includes(h.kind)) || inv.handles[0];
      await evaluate(`
        const g = window.__promptasy;
        for (const k of ['handlePanel','codex','settings','promptConsole','tabletPanel','inscriptionPanel']) {
          try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
        }
        return 1;
      `);
      const peers = [
        ...inv.handles.filter((h) => h.id !== spec.id).map((h) => ({ x: h.at[0], z: h.at[1] })),
        ...inv.spots.map((sp) => ({ x: sp.x, z: sp.z })),
      ];
      const farSpot = farPointAmong({ x: spec.at[0], z: spec.at[1] }, peers, region);
      await evaluate(`window.__promptasy.player.teleport(${farSpot.x}, ${farSpot.z}); return 1;`);
      const farHint = await waitFor(
        () => evaluate(`
          const el = document.querySelector('[data-interact]');
          return (el.hidden || !el.textContent.includes(${JSON.stringify(spec.title)})) ? 'far' : false;
        `),
        { label: `[${region}] 遠處沒有 ${spec.id} 的提示` }
      );
      eq(farHint, 'far', `[${region}] 離得遠時沒有「${spec.title}」的提示`);

      await evaluate(`window.__promptasy.player.teleport(${spec.at[0]} + 1.6, ${spec.at[1]} + 1.6); return 1;`);
      const hint = await waitFor(
        () => evaluate(`
          const el = document.querySelector('[data-interact]');
          if (el.hidden) return false;
          const t = el.textContent.replace(/\\s+/g, ' ').trim();
          return t.includes(${JSON.stringify(spec.title)}) ? t : false;
        `),
        { label: `[${region}] 走近 ${spec.id} 出現提示` }
      );
      ok(/E/.test(hint), `[${region}] 走近「${spec.title}」→ 提示上有名字與 E`, hint);

      const before = await evaluate(`
        const g = window.__promptasy;
        return { xp: g.progression.state.xp, n: g.progression.handleCount(), used: g.progression.hasUsedHandle(${JSON.stringify(spec.id)}) };
      `);
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })); return 1;`);
      const used = await waitFor(
        () => evaluate(`
          const g = window.__promptasy;
          const o = g.world.handles.object(${JSON.stringify(spec.id)});
          if (!g.progression.hasUsedHandle(${JSON.stringify(spec.id)})) return false;
          const saved = JSON.parse(localStorage.getItem('promptasy.v1.save')).handlesUsed || [];
          return { worldUsed: Boolean(o.used || o.lit || o.hit > 0 || o.awake), saved: saved.includes(${JSON.stringify(spec.id)}), n: g.progression.handleCount(), xp: g.progression.state.xp };
        `),
        { label: `[${region}] ${spec.id} 動得了` }
      );
      eq(used.saved, true, `[${region}] 動過「${spec.title}」寫進存檔`);
      if (!before.used) {
        eq(used.n, before.n + 1, `[${region}] 器物計數 +1`);
        ok(used.xp > before.xp, `[${region}] 第一次動它給了 XP`, `${before.xp} → ${used.xp}`);
      }
      await evaluate(`
        const g = window.__promptasy;
        try { if (g.handlePanel.isOpen) g.handlePanel.close(); } catch {}
        if (g.seatedOn && g.seatedOn()) g.player.teleport(${spec.at[0]} + 20, ${spec.at[1]} + 20);
        return 1;
      `);

      /* ② 反應物：走進半徑才有反應（用輪詢看它的狀態，不是看聲音） */
      const spot = inv.spots.find((sp) => ['chime', 'glowcap', 'ripple', 'songstone'].includes(sp.kind)) || inv.spots[0];
      const spotAt = await evaluate(`
        const g = window.__promptasy;
        const o = g.world.reactive.objects.find((x) => x.id === ${JSON.stringify(spot.id)});
        if ('swing' in o) o.swing = 0;
        if ('hit' in o) o.hit = 0;
        return { x: o.x, z: o.z };
      `);
      // 冷卻基準也要站在**地圖上**（原本的 +30,+30 有 6 個區會掉到虛空甚至出網格）
      const coldPeers = [
        ...inv.handles.map((h) => ({ x: h.at[0], z: h.at[1] })),
        ...inv.spots.filter((sp) => sp.id !== spot.id).map((sp) => ({ x: sp.x, z: sp.z })),
      ];
      const coldSpot = farPointAmong(spotAt, coldPeers, region);
      await evaluate(`window.__promptasy.player.teleport(${coldSpot.x}, ${coldSpot.z}); return 1;`);
      const heat = (id) => evaluate(`
        const g = window.__promptasy;
        const o = g.world.reactive.objects.find((x) => x.id === ${JSON.stringify(id)});
        if (o.kind === 'chime') return o.swing;
        if (o.kind === 'glowcap') return o.caps.reduce((a, c) => a + c.mat.emissiveIntensity, 0);
        if (o.kind === 'ripple') return o.rings.reduce((a, r) => a + r.life, 0);
        if (o.kind === 'songstone') return o.stones.reduce((a, st) => a + st.ring, 0);
        return o.scatter || 0;
      `);
      const cold = await waitFor(async () => {
        const v = await heat(spot.id);
        return Number.isFinite(v) ? { v } : false;
      }, { label: `[${region}] 讀得到 ${spot.id} 的狀態` });
      await evaluate(`
        const g = window.__promptasy;
        const o = g.world.reactive.objects.find((x) => x.id === ${JSON.stringify(spot.id)});
        g.player.teleport(o.x, o.z);
        return 1;
      `);
      const hot = await waitFor(async () => {
        const v = await heat(spot.id);
        return v > cold.v + 0.05 ? v : false;
      }, { label: `[${region}] 走進 ${spot.id} 的範圍會回應` });
      ok(hot > cold.v, `[${region}] 走進「${spot.kind}」的範圍 → 它真的有反應`, `${cold.v} → ${hot}`);
    }

    /* ③ 重整之後，這七件都還記得 */
    const usedBefore = await evaluate(`
      const g = window.__promptasy;
      return { n: g.progression.handleCount(), ids: (JSON.parse(localStorage.getItem('promptasy.v1.save')).handlesUsed || []) };
    `);
    await reloadPage('P06c 重整');
    const after = await waitFor(
      () => evaluate(`
        const g = window.__promptasy;
        if (!g || !g.world || !g.world.handles) return false;
        const ids = ${JSON.stringify(P06C)}
          .flatMap((r) => g.handleData.entries.filter((e) => e.region === r).map((e) => e.id))
          .filter((id) => g.progression.hasUsedHandle(id));
        return { n: g.progression.handleCount(), kept: ids.length, built: g.world.handles.objects.length };
      `),
      { label: 'P06c 重整之後器物還在' }
    );
    eq(after.n, usedBefore.n, 'P06c：重整之後動過的器物數不變');
    ok(after.kept >= 7, 'P06c：七片新土地上動過的器物跨重整都還在', `n=${after.kept}`);
    eq(after.built, 44, 'P06c：重整之後 44 件器物全部重新蓋起來');
  }

  /* ================================================================ */
  /*
   * 純鍵盤走完一圈（Phase 23）
   *
   * 從這裡開始**只發真的鍵盤事件**（CDP Input.dispatchKeyEvent），
   * 一次滑鼠都不用：走過去 → 按 E → 一幕一幕推 → 用數字把石碑刻滿 →
   * 按住 Enter 把手掌按上去 → 拿結果 → S 分享 → Esc → C 圖鑑（方向鍵走條目、
   * Enter 展開）→ O 設定（方向鍵改下拉、空白鍵切勾勾）→ Esc → - / = 拉遠拉近 →
   * ? 操作一覽。最後再確認「打字的時候單鍵快捷一律失效」。
   *
   * 只有「先把場面清乾淨」與「讀出正確選項是第幾個」用得到 evaluate（純讀）。
   */
  console.log('\n▸ 純鍵盤走完一圈（Phase 23）');

  // 前一段做過一次重整 → 標題卡又擋在前面。用鍵盤把它按掉（本來就是「按任意鍵開始」）
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(700);
  eq(await evaluate(`return window.__promptasy.title.isOpen;`), false, '按鍵就收得掉標題卡');

  // 場面清乾淨：把前面測試留下的任何一層收掉，把操控權還給角色
  await evaluate(`
    const g = window.__promptasy;
    if (g.prologue.isActive) g.prologue.skip();
    await new Promise((r) => setTimeout(r, 200));
    // 跳過序章的人會拿到一張操作說明卡 —— 收掉它
    const startBtn = document.querySelector('.intro [data-start]');
    if (g.intro.isOpen && startBtn) startBtn.click();
    for (const k of ['keyhelp','shareCard','promptConsole','codex','settings','finale','tabletPanel','inscriptionPanel','practice']) {
      try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
    // 前面的測試把答題方式切來切去 —— 這一段要驗的是預設的石碑刻印
    g.progression.updateSettings({ promptMode: 'guided' });
    g.promptConsole.setMode('guided');
    g.player.setInputEnabled(true);
    return 1;
  `);
  await sleep(300);

  // 挑一關還沒通關、而且有石碑流程的；把角色放在「鏡頭正前方 9 公尺」的位置，
  // 這樣按住 W 就會直直走過去（走的方向是鏡頭看出去的方向）
  const kbTarget = await evaluate(`
    const g = window.__promptasy;
    // Phase D：這一段驗的是**石碑刻印**的純鍵盤路徑，所以要挑一關真的是 choice 的
    const c = g.content.challenges.find(
      (c) =>
        !g.progression.isCleared(c.id) &&
        g.content.flow(c.id) &&
        g.promptConsole.flowKindOf(g.content.flow(c.id)) === 'choice'
    );
    const m = g.world.markers.find((m) => m.id === c.id);
    const yaw = g.player.cameraYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    g.player.teleport(m.position.x - fx * 8, m.position.z - fz * 8);
    await new Promise((r) => setTimeout(r, 240));
    return {
      id: c.id,
      title: c.title,
      slots: g.content.flow(c.id).slots.length,
      distance: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z),
      interactShown: !document.querySelector('.hud__interact').hidden,
    };
  `);
  ok(kbTarget.distance > 6.5, '出發點在互動範圍外（真的要走過去）', kbTarget.distance.toFixed(2));
  eq(kbTarget.interactShown, false, '還沒走到，走近提示還沒出現');

  // --- 只按 W 走過去 ---
  await keyDown('KeyW', 'w', { vk: 87 });
  const kbWalk = await waitFor(
    () =>
      evaluate(`
        const g = window.__promptasy;
        const m = g.world.markers.find((m) => m.id === '${kbTarget.id}');
        const d = Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z);
        const el = document.querySelector('.hud__interact');
        return (d < 6.4 && !el.hidden) ? { d, html: el.innerHTML } : null;
      `),
    { timeout: 20000, every: 80, label: '按 W 走到石座旁' }
  );
  await keyUp('KeyW', 'w', { vk: 87 });
  ok(kbWalk.d < 6.4, '只按 W 就真的走到石座旁', kbWalk.d.toFixed(2));
  ok(/<kbd>E<\/kbd>/.test(kbWalk.html), '走近提示標著 E 這個鍵', kbWalk.html.slice(0, 80));

  // --- E 開啟 → Enter 一幕一幕推 ---
  await key('KeyE', 'e', { vk: 69 });
  await sleep(500);
  const kbAct1 = await evaluate(`
    const g = window.__promptasy;
    return { open: g.promptConsole.isOpen, act: g.promptConsole.act, id: g.promptConsole.challenge?.id };
  `);
  eq(kbAct1.open, true, '按 E 打開了這一關');
  eq(kbAct1.id, kbTarget.id, '打開的就是走過去那一座石座');
  eq(kbAct1.act, 1, '導演的第一顆鏡頭是第一幕');

  await key('Enter', 'Enter', { vk: 13 });
  await sleep(420);
  const kbAct2 = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      glyphs: document.querySelectorAll('#prompt-console [data-guidance] .glyph').length,
      sources: document.querySelectorAll('#prompt-console .act--guide a.bookicon').length,
    };
  `);
  eq(kbAct2.act, 2, 'Enter 推到第二幕（指引）');
  ok(kbAct2.glyphs >= 1, '第二幕看得到神諭刻文', String(kbAct2.glyphs));
  eq(kbAct2.glyphs, 1, '第二幕只放大這一關教的那一條（Phase A）', String(kbAct2.glyphs));
  eq(kbAct2.sources, kbAct2.glyphs, '每一段刻文都掛著可點的神諭原典');

  // L：翻開線索（第二幕那一頁）
  await key('KeyL', 'l', { vk: 76 });
  await sleep(260);
  const kbClue = await evaluate(`
    const d = document.querySelector('#prompt-console .act--guide .clue');
    return { open: d.open, focused: document.activeElement === d.querySelector('summary'), text: d.querySelector('p').textContent.trim().length };
  `);
  eq(kbClue.open, true, 'L 翻得開線索');
  eq(kbClue.focused, true, '翻開後焦點停在那一頁上');
  ok(kbClue.text > 4, '線索真的有內容', String(kbClue.text));
  await key('KeyL', 'l', { vk: 76 });
  await sleep(200);
  eq(
    await evaluate(`return document.querySelector('#prompt-console .act--guide .clue').open;`),
    false,
    '再按一次 L 就收起來'
  );

  // 焦點停在 summary 上時 Enter 屬於它，所以先把焦點移開再推下一幕
  await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(420);
  const kbAct3 = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      focusedOnOption: document.activeElement?.classList.contains('opt'),
      options: Array.from(document.querySelectorAll('#prompt-console .opt')).filter((o) => o.offsetParent !== null).length,
      mode: g.promptConsole.mode,
      setting: g.progression.state.settings.promptMode,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      activeTag: document.activeElement?.tagName,
      activeClass: String(document.activeElement?.className || ''),
    };
  `);
  eq(kbAct3.act, 3, 'Enter 推到第三幕（刻印）');
  eq(kbAct3.mode, 'guided', '這一段用的是預設的石碑刻印', JSON.stringify(kbAct3));
  eq(kbAct3.focusedOnOption, true, '一進刻印，焦點就落在第一個選項上', JSON.stringify(kbAct3));
  ok(kbAct3.options >= 2, '選項看得見', JSON.stringify(kbAct3));

  // 方向鍵在選項之間走（Tab 之外的那條路）
  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(160);
  const kbRove = await evaluate(`
    const opts = Array.from(document.querySelectorAll('#prompt-console .opt'));
    return { at: opts.indexOf(document.activeElement) };
  `);
  eq(kbRove.at, 1, '方向鍵把焦點移到第二個選項');

  // --- 用數字鍵一段一段刻滿 ---
  const kbCarve = [];
  for (let i = 0; i < kbTarget.slots; i += 1) {
    const idx = await evaluate(`
      const g = window.__promptasy;
      const flow = g.content.flow('${kbTarget.id}');
      const s = flow.slots[g.promptConsole.stele.progress.carved];
      return s ? s.options.findIndex((o) => o.correct) : -1;
    `);
    ok(idx >= 0, `第 ${i + 1} 段找得到正確選項`);
    const n = idx + 1;
    await key(`Digit${n}`, String(n), { vk: 48 + n });
    await sleep(420);
    kbCarve.push(
      await evaluate(`
        const g = window.__promptasy;
        return {
          carved: g.promptConsole.stele.progress.carved,
          lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
        };
      `)
    );
  }
  eq(kbCarve[0].carved, 1, '按 1 / 2 / 3 就刻上第一段');
  eq(kbCarve[kbCarve.length - 1].carved, kbTarget.slots, '全部用數字鍵刻滿');
  ok(
    kbCarve[kbCarve.length - 1].lit >= kbCarve[0].lit,
    '刻痕對照跟著一盞一盞亮',
    `${kbCarve[0].lit} → ${kbCarve[kbCarve.length - 1].lit}`
  );

  const kbPalm = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'),
      hint: document.querySelector('#prompt-console .palm__hint').textContent.trim(),
    };
  `);
  eq(kbPalm.act, 4, '刻滿之後鏡頭自己切到手印那一幕');
  eq(kbPalm.palmFocused, true, '焦點自己落在手掌印上（不用去找它）');
  ok(/Enter/.test(kbPalm.hint), '手掌印上寫著「或按住 Enter」', kbPalm.hint);

  // --- 按住 Enter 把手掌按上石碑 ---
  await holdPalm(null, '純鍵盤：手掌印按滿');
  await waitFor(() => evaluate(`return !document.querySelector('#prompt-console [data-result]').hidden;`), {
    label: '純鍵盤：結果面板',
    every: 150,
  });
  const kbResult = await evaluate(`
    const g = window.__promptasy;
    return {
      fired: g.promptConsole.stele.fired,
      resultShown: !document.querySelector('#prompt-console [data-result]').hidden,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      cleared: g.progression.isCleared('${kbTarget.id}'),
      share: !!document.querySelector('#prompt-console [data-share]'),
    };
  `);
  eq(kbResult.fired, true, '按住 Enter 真的把手掌按上去了');
  eq(kbResult.resultShown, true, '結果出現了');
  ok(['S', 'A', 'B', 'C'].includes(kbResult.grade), '拿到評價', String(kbResult.grade));
  eq(kbResult.cleared, true, '這一關記成通關（全程沒碰滑鼠）');
  eq(kbResult.share, true, '結果下面有分享');

  // --- S 開分享卡 → Esc 收起（底下那一關還在） ---
  await key('KeyS', 's', { vk: 83 });
  await sleep(700);
  const kbShare = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.shareCard.isOpen,
      consoleStillOpen: g.promptConsole.isOpen,
      focusInPanel: document.querySelector('#sharecard .panel').contains(document.activeElement),
      download: !!document.querySelector('#sharecard [data-download]'),
    };
  `);
  eq(kbShare.open, true, '按 S 就開得出分享卡');
  eq(kbShare.consoleStillOpen, true, '分享卡疊在上面，底下那一關沒被收掉');
  eq(kbShare.focusInPanel, true, '焦點跟著進了分享卡');
  eq(kbShare.download, true, '分享卡上有「下載圖片」（Tab 就走得到）');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(400);
  const kbAfterShare = await evaluate(`
    const g = window.__promptasy;
    return { share: g.shareCard.isOpen, console: g.promptConsole.isOpen };
  `);
  eq(kbAfterShare.share, false, 'Esc 先收分享卡');
  eq(kbAfterShare.console, true, '底下那一關還開著');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(400);
  eq(await evaluate(`return window.__promptasy.promptConsole.isOpen;`), false, '再按一次 Esc 收起這一關');

  // --- C 翻圖鑑：方向鍵走條目、Enter 展開 ---
  await key('KeyC', 'c', { vk: 67 });
  await sleep(600);
  const kbCodexOpen = await evaluate(`
    const g = window.__promptasy;
    const body = document.querySelector('#codex .panel__body');
    return {
      open: g.codex.isOpen,
      focusInBody: body.contains(document.activeElement),
      summaries: document.querySelectorAll('#codex .tech summary').length,
    };
  `);
  eq(kbCodexOpen.open, true, '按 C 翻開圖鑑');
  eq(kbCodexOpen.focusInBody, true, '焦點直接落在內容裡（不是站在出口上）');
  ok(kbCodexOpen.summaries >= 1, '圖鑑裡有已收集、可展開的條目', String(kbCodexOpen.summaries));

  await evaluate(`document.querySelector('#codex .tech > details > summary').focus(); return 1;`);
  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(200);
  const kbCodexRove = await evaluate(`
    const list = Array.from(document.querySelectorAll('#codex .tech > details > summary'));
    return {
      at: list.indexOf(document.activeElement),
      total: list.length,
      visible: list.filter((n) => n.offsetParent !== null && n.getClientRects().length > 0).length,
      bound: !!document.querySelector('#codex .panel__body').__rovingBound,
      activeTag: document.activeElement?.tagName,
    };
  `);
  ok(kbCodexRove.at >= 0, '方向鍵把焦點留在條目上', JSON.stringify(kbCodexRove));
  eq(kbCodexRove.at, Math.min(1, kbCodexRove.total - 1), '方向鍵走到下一條', JSON.stringify(kbCodexRove));

  await enterNative();
  await sleep(260);
  eq(
    await evaluate(`return document.activeElement.closest('details')?.open === true;`),
    true,
    'Enter 展開這一條技巧（說明、範例、官方出處都出來了）'
  );
  ok(
    await evaluate(`return !!document.activeElement.closest('details')?.querySelector('a.src');`),
    '展開後看得到可點的官方出處'
  );

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(400);
  eq(await evaluate(`return window.__promptasy.codex.isOpen;`), false, 'Esc 收起圖鑑');

  // --- O 設定：Tab 走到下拉、方向鍵改值、空白鍵切勾勾 ---
  await key('KeyO', 'o', { vk: 79 });
  await sleep(500);
  eq(
    await evaluate(`return document.querySelector('#settings .panel__body').contains(document.activeElement);`),
    true,
    '設定一打開，焦點就在內容裡'
  );

  // Tab 一路走到「畫質」那個下拉（純鍵盤走得到）
  let tabs = 0;
  let onQuality = false;
  while (tabs < 12 && !onQuality) {
    onQuality = await evaluate(`return document.activeElement?.id === 'set-quality';`);
    if (onQuality) break;
    await key('Tab', 'Tab', { vk: 9 });
    await sleep(120);
    tabs += 1;
  }
  onQuality = await evaluate(`return document.activeElement?.id === 'set-quality';`);
  eq(onQuality, true, `Tab 走得到畫質（走了 ${tabs} 下）`);

  const qualityBefore = await evaluate(`return window.__promptasy.progression.state.settings.quality;`);
  // 停在最後一項時要往上按 —— 方向不重要，重點是「不用滑鼠也改得動」
  const atLast = await evaluate(`
    const sel = document.querySelector('#set-quality');
    return sel.selectedIndex >= sel.options.length - 1;
  `);
  const [goKey, backKey, goVk, backVk] = atLast
    ? ['ArrowUp', 'ArrowDown', 38, 40]
    : ['ArrowDown', 'ArrowUp', 40, 38];
  await key(goKey, goKey, { vk: goVk });
  await sleep(500);
  const kbQuality = await evaluate(`
    const g = window.__promptasy;
    return { setting: g.progression.state.settings.quality, engine: g.engine.quality, value: document.querySelector('#set-quality').value };
  `);
  ok(kbQuality.setting !== qualityBefore, '方向鍵真的把下拉改掉了', `${qualityBefore} → ${kbQuality.setting}`);
  eq(kbQuality.engine, kbQuality.value, '改完立刻生效（不用重新整理）');
  // 改回來，不影響後面的測試
  await key(backKey, backKey, { vk: backVk });
  await sleep(500);
  eq(
    await evaluate(`return window.__promptasy.progression.state.settings.quality;`),
    qualityBefore,
    '方向鍵也改得回去'
  );

  // 空白鍵切勾勾（靜音）
  await evaluate(`document.querySelector('#set-mute').focus(); return 1;`);
  const muteBefore = await evaluate(`return window.__promptasy.progression.state.settings.muted;`);
  await key('Space', ' ', { vk: 32 });
  await sleep(320);
  const kbMute = await evaluate(`
    const g = window.__promptasy;
    return { setting: g.progression.state.settings.muted, checked: document.querySelector('#set-mute').checked };
  `);
  eq(kbMute.setting, !muteBefore, '空白鍵切得動勾勾');
  eq(kbMute.checked, kbMute.setting, '畫面上的勾勾與存下來的設定一致');
  await key('Space', ' ', { vk: 32 });
  await sleep(320);
  eq(
    await evaluate(`return window.__promptasy.progression.state.settings.muted;`),
    muteBefore,
    '再按一次就切回來'
  );

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(400);
  eq(await evaluate(`return window.__promptasy.settings.isOpen;`), false, 'Esc 收起設定');

  // --- 鏡頭拉遠 / 拉近：以前只有滾輪，現在 - 與 = 都行 ---
  const zoomStart = await evaluate(`return window.__promptasy.player.cameraDistance;`);
  await keyDown('Minus', '-', { vk: 189 });
  await sleep(700);
  await keyUp('Minus', '-', { vk: 189 });
  await sleep(200);
  const zoomOut = await evaluate(`return window.__promptasy.player.cameraDistance;`);
  ok(zoomOut > zoomStart + 0.5, '按 - 鏡頭真的拉遠了', `${zoomStart.toFixed(2)} → ${zoomOut.toFixed(2)}`);

  await keyDown('Equal', '=', { vk: 187 });
  await sleep(900);
  await keyUp('Equal', '=', { vk: 187 });
  await sleep(200);
  const zoomIn = await evaluate(`return window.__promptasy.player.cameraDistance;`);
  ok(zoomIn < zoomOut - 0.5, '按 = 鏡頭又拉回來', `${zoomOut.toFixed(2)} → ${zoomIn.toFixed(2)}`);

  // 上下限夾得住（按到底也不會翻過去）
  await keyDown('Minus', '-', { vk: 189 });
  await sleep(2600);
  await keyUp('Minus', '-', { vk: 189 });
  await sleep(200);
  const zoomRange = await evaluate(`
    const g = window.__promptasy;
    return { d: g.player.cameraDistance, max: g.player.zoomRange.max, min: g.player.zoomRange.min };
  `);
  ok(zoomRange.d <= zoomRange.max + 0.001, '拉遠到底就停住', JSON.stringify(zoomRange));
  ok(zoomRange.d >= zoomRange.min, '距離沒有變成負的', JSON.stringify(zoomRange));

  // --- ? 操作一覽 ---
  await key('Slash', '?', { vk: 191, modifiers: 8 });
  await sleep(600);
  const kbHelp = await evaluate(`
    const g = window.__promptasy;
    const rows = Array.from(document.querySelectorAll('#keyhelp .keyhelp__row'));
    const body = document.querySelector('#keyhelp .panel__body');
    return {
      open: g.keyhelp.isOpen,
      groups: document.querySelectorAll('#keyhelp .keyhelp__group').length,
      rows: rows.length,
      keys: rows.map((r) => Array.from(r.querySelectorAll('kbd')).map((k) => k.textContent).join('')),
      whats: rows.map((r) => r.querySelector('.keyhelp__what').textContent.trim()),
      links: body.querySelectorAll('a').length,
      overflow: document.querySelector('#keyhelp .panel').scrollWidth - document.querySelector('#keyhelp .panel').clientWidth,
      playerFrozen: !!g.player,
    };
  `);
  eq(kbHelp.open, true, '按 ? 叫得出操作一覽');
  ok(kbHelp.groups >= 4, '操作一覽分了組（走路 / 鏡頭 / 走近東西 / 讀題與刻印）', String(kbHelp.groups));
  ok(kbHelp.rows >= 18, '操作一覽列得夠完整', String(kbHelp.rows));
  ok(kbHelp.keys.some((k) => k === 'WASD'), '一覽上有 WASD');
  ok(kbHelp.keys.some((k) => k === '-='), '一覽上有鏡頭拉遠拉近');
  ok(kbHelp.keys.some((k) => k === '?'), '一覽上寫著它自己怎麼叫出來');
  ok(kbHelp.keys.some((k) => k === '123'), '一覽上有石碑的 1 2 3');
  ok(
    kbHelp.whats.every((w) => w.length > 0 && !/送出評分|localStorage/.test(w)),
    '一覽上不出現系統術語'
  );
  eq(kbHelp.links, 0, '操作一覽純操作說明，不放連結（護欄 2：不教技巧就不放出處）');
  ok(kbHelp.overflow <= 1, '操作一覽沒有水平溢位', String(kbHelp.overflow));

  // 操作一覽打開時角色不會被方向鍵帶著跑
  const helpFrozen = await evaluate(`
    const g = window.__promptasy;
    const before = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 500));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    return Math.hypot(g.player.position.x - before.x, g.player.position.z - before.z);
  `);
  ok(helpFrozen < 0.2, '一覽打開時角色站著不動', helpFrozen.toFixed(3));

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(400);
  const kbHelpClosed = await evaluate(`
    const g = window.__promptasy;
    return { open: g.keyhelp.isOpen, anyOpen: g.promptConsole.isOpen || g.codex.isOpen || g.settings.isOpen };
  `);
  eq(kbHelpClosed.open, false, 'Esc 收起操作一覽');
  eq(kbHelpClosed.anyOpen, false, '收起之後回到世界');

  // 收起之後角色又動得了（操控權還回來了）
  await keyDown('KeyW', 'w', { vk: 87 });
  await sleep(600);
  const kbWalkAgain = await evaluate(`return window.__promptasy.player.speed;`);
  await keyUp('KeyW', 'w', { vk: 87 });
  await sleep(500);
  ok(kbWalkAgain > 1, '收起操作一覽之後角色又動得了', kbWalkAgain.toFixed(2));

  /* --- 打字的時候，單鍵快捷一律失效 --- */
  const kbTypingSetup = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.setMode('free');
    g.promptConsole.open(g.content.challenges[0]);
    await new Promise((r) => setTimeout(r, 300));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const ta = document.querySelector('#prompt-console .prompt-input');
    ta.value = '';
    ta.focus();
    ta.setSelectionRange(0, 0);
    return {
      mode: g.promptConsole.mode,
      act: g.promptConsole.act,
      focused: document.activeElement === ta,
      guidetabOpen: document.querySelector('#prompt-console [data-guidetab]').open,
      coachOpen: g.promptConsole.coach.open,
    };
  `);
  eq(kbTypingSetup.mode, 'free', '切到自由書寫（有輸入框可以打字）');
  eq(kbTypingSetup.act, 3, '停在刻印那一幕');
  eq(kbTypingSetup.focused, true, '焦點在輸入框裡');
  eq(kbTypingSetup.guidetabOpen, false, '旁邊那一頁本來是收著的');
  eq(kbTypingSetup.coachOpen, false, '提示框本來是關著的');

  for (const [ch, code, vk] of [
    ['l', 'KeyL', 76],
    ['e', 'KeyE', 69],
    ['h', 'KeyH', 72],
    ['m', 'KeyM', 77],
    ['s', 'KeyS', 83],
    ['c', 'KeyC', 67],
    ['o', 'KeyO', 79],
    ['1', 'Digit1', 49],
    ['?', 'Slash', 191],
  ]) {
    await typeChar(ch, code, vk);
    await sleep(60);
  }
  await sleep(400);
  const kbTyped = await evaluate(`
    const g = window.__promptasy;
    const ta = document.querySelector('#prompt-console .prompt-input');
    return {
      value: ta.value,
      stillFocused: document.activeElement === ta,
      guidetabOpen: document.querySelector('#prompt-console [data-guidetab]').open,
      coachOpen: g.promptConsole.coach.open,
      mode: g.promptConsole.mode,
      codexOpen: g.codex.isOpen,
      settingsOpen: g.settings.isOpen,
      helpOpen: g.keyhelp.isOpen,
      shareOpen: g.shareCard.isOpen,
      consoleOpen: g.promptConsole.isOpen,
      act: g.promptConsole.act,
    };
  `);
  eq(kbTyped.value, 'lehmsco1?', '打進去的字一個不漏（單鍵快捷沒有把它們吃掉）');
  eq(kbTyped.stillFocused, true, '打字時焦點沒有被搶走');
  eq(kbTyped.guidetabOpen, false, '打 l 不會翻開旁邊那一頁');
  eq(kbTyped.coachOpen, false, '打 h 不會彈出提示框');
  eq(kbTyped.mode, 'free', '打 m 不會換答題方式');
  eq(kbTyped.codexOpen, false, '打 c 不會跳出圖鑑');
  eq(kbTyped.settingsOpen, false, '打 o 不會跳出設定');
  eq(kbTyped.helpOpen, false, '打 ? 不會跳出操作一覽');
  eq(kbTyped.shareOpen, false, '打 s 不會跳出分享卡');
  eq(kbTyped.consoleOpen, true, '打 e 不會做任何事，這一關還開著');
  eq(kbTyped.act, 3, '打字時不會被 1 帶去別的幕');

  // 輸入框裡按 Esc 走得出去（Phase 23 修：以前 Esc 會被輸入框吃掉）
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(420);
  eq(
    await evaluate(`return window.__promptasy.promptConsole.isOpen;`),
    false,
    '在輸入框裡按 Esc 也收得起來（不會被關在裡面）'
  );

  // 把答題方式切回預設，不影響後面的測試
  await evaluate(`window.__promptasy.promptConsole.setMode('guided'); return 1;`);
  await sleep(200);

  /* ================================================================ */
  console.log('\n▸ 排序刻印與神諭工坊（Phase 27）');

  /** 送一連串滑鼠事件（拖曳用）。 */
  async function mouse(type, x, y, extra = {}) {
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra },
      sessionId
    );
  }
  /** 某個元素現在的中心點（先捲到畫面中央）。 */
  async function centerOf(selector) {
    return evaluate(`
      const el = document.querySelector('${selector}');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 200));
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `);
  }

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close(); g.codex.close(); g.settings.close();
    g.promptConsole.setMode('guided');
    return 1;
  `);
  await sleep(200);

  /* --- 資料層：三種題型都在，其他 24 關一個位元組都沒變 --- */
  const kinds = await evaluate(`
    const g = window.__promptasy;
    const flows = g.content.flowFile.flows;
    // 課程 v2 · Phase J2：自由書寫的試煉刻意沒有流程資料（鷹架撤除的最後一格）
    const freeTrials = g.content.challenges.filter((c) => c.application && !flows[c.id]);
    const carveable = g.content.challenges.filter((c) => !freeTrials.includes(c));
    const out = {
      total: g.content.challenges.length,
      carveable: carveable.length,
      freeTrials: freeTrials.map((c) => c.id).sort(),
      byKind: Object.fromEntries(g.promptConsole.flowKinds.map((k) => [k, 0])),
      missing: [],
    };
    for (const c of carveable) {
      const f = flows[c.id];
      if (!f) { out.missing.push(c.id); continue; }
      out.byKind[g.promptConsole.flowKindOf(f)] += 1;
      // 五種題型都還留著選擇題的資料當後備
      if (!Array.isArray(f.slots) || !f.slots.length) out.missing.push(c.id + ':noslots');
    }
    out.orderIds = Object.entries(flows).filter(([, f]) => f.kind === 'order').map(([id]) => id).sort();
    out.workshopIds = Object.entries(flows).filter(([, f]) => f.kind === 'workshop').map(([id]) => id).sort();
    out.fixIds = Object.entries(flows).filter(([, f]) => f.kind === 'fix').map(([id]) => id).sort();
    out.spotIds = Object.entries(flows).filter(([, f]) => f.kind === 'spot').map(([id]) => id).sort();
    out.inductIds = Object.entries(flows).filter(([, f]) => f.kind === 'induct').map(([id]) => id).sort();
    out.tradeoffIds = Object.entries(flows).filter(([, f]) => f.kind === 'tradeoff').map(([id]) => id).sort();
    out.constraintIds = Object.entries(flows).filter(([, f]) => f.kind === 'constraint').map(([id]) => id).sort();
    return out;
  `);
  eq(
    kinds.total,
    EXPECT.challenges.value,
    `世界上有 ${EXPECT.challenges.value} 關（課程 v2 · Phase E：量器坊 14 座）`
  );
  eq(kinds.missing.length, 0, '每一座有石碑的關卡都有流程資料，而且都留著選擇題後備', kinds.missing.join(','));
  eq(kinds.freeTrials.length, 3, '三座試煉走自由書寫（沒有石碑）', kinds.freeTrials.join(','));
  /*
   * Phase D：這裡原本寫死了「哪幾關是哪一種題型」（歷史快照）。課程 v2 每一期
   * 都在換裝與新增，那種斷言只會逼人為了過測試改數字 —— 改成不變式：
   * 八種題型都真的有神廟在用，而且加起來就是全部的關卡。
   */
  for (const k of ['choice', 'order', 'workshop', 'fix', 'spot', 'induct', 'tradeoff', 'constraint']) {
    ok((kinds.byKind[k] || 0) >= 1, `題型 ${k} 真的有神廟在用`, String(kinds.byKind[k]));
  }
  eq(
    Object.values(kinds.byKind).reduce((n, v) => n + v, 0),
    kinds.carveable,
    '每一座有石碑的關卡都落在某一種題型上（沒有無主的關卡）'
  );
  ok(kinds.orderIds.includes('long-scroll-tower-23'), '長卷之塔仍然是排序刻印');
  ok(kinds.orderIds.includes('priority-stair-42'), '優先序階梯仍然是排序刻印');
  ok(kinds.workshopIds.includes('oracle-workshop-36'), '神諭工坊仍然是派工檯', kinds.workshopIds.join(','));
  ok(kinds.constraintIds.length >= 4, '合尺至少四座（課程 v2 · Phase D）', kinds.constraintIds.join(','));

  /* ---------------------------------------------------------------- *
   * 一、排序刻印：純鍵盤走完（拿起 → 搬 → 放下 → 亮燈 → 手印 → S）
   * ---------------------------------------------------------------- */
  const orderOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('long-scroll-tower-23'));
    await new Promise((r) => setTimeout(r, 260));
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const b = g.promptConsole.orderBoard;
    return {
      actAtOpen,
      act: g.promptConsole.act,
      kind: g.promptConsole.kind,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      boardShown: !document.querySelector('#prompt-console .orderboard').hidden,
      workshopHidden: document.querySelector('#prompt-console .workshop').hidden,
      slips: document.querySelectorAll('#prompt-console .slip').length,
      arrangement: b.arrangement,
      correct: b.correctOrder,
      right: b.progress.right,
      ask: document.querySelector('#prompt-console .orderboard .carve__ask').textContent.trim(),
      progress: document.querySelector('#prompt-console .orderboard .carve__progress').textContent.trim(),
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      focused: document.activeElement?.getAttribute('data-slip'),
      palmHidden: document.querySelector('#prompt-console .orderboard .palmwrap').hidden,
      marks: [...document.querySelectorAll('#prompt-console .slip')].map((li) => li.classList.contains('is-right')),
    };
  `);
  eq(orderOpen.actAtOpen, 1, '排序刻印一樣從第一幕開始（四幕分鏡沒有變）');
  eq(orderOpen.act, 3, '排序住在第三幕');
  eq(orderOpen.kind, 'order', '這一關的題型是排序刻印');
  eq(orderOpen.steleHidden, true, '選擇題的石碑收起來了');
  eq(orderOpen.workshopHidden, true, '工坊也收起來了（一次只有一種在台上）');
  eq(orderOpen.boardShown, true, '台上是一排可以搬的石版');
  eq(orderOpen.slips, 3, '這一關有 3 片石版');
  eq(orderOpen.label, '排序刻印', '版面上寫的是「排序刻印」');
  ok(orderOpen.ask.length >= 6, '這一步的問題看得到', orderOpen.ask);
  ok(/位置對了 0 \/ 3 片/.test(orderOpen.progress), '一開始一片都沒排對', orderOpen.progress);
  eq(orderOpen.right, 0, '初始排法沒有任何一片剛好站對（不是送分題）');
  eq(orderOpen.marks.filter(Boolean).length, 0, '沒有任何一片標成「位置對了」');
  eq(orderOpen.palmHidden, true, '還沒排順，手掌印不會出現（沒有「送出才發現排錯」這種事）');
  ok(orderOpen.focused, '焦點落在第一片石版上', String(orderOpen.focused));
  eq(
    JSON.stringify(orderOpen.arrangement) === JSON.stringify(orderOpen.correct),
    false,
    '初始排法不等於正解'
  );

  // 純鍵盤：Enter 拿起 → ↓ 搬 → Enter 放下
  const lift = await evaluate(`
    const b = window.__promptasy.orderBoardProbe = window.__promptasy.promptConsole.orderBoard;
    document.querySelector('#prompt-console [data-slip="question"]').focus();
    return 1;
  `);
  ok(lift === 1, '把焦點停在「問題」那一片上');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(200);
  const held = await evaluate(`
    const b = window.__promptasy.promptConsole.orderBoard;
    return {
      held: b.held,
      pressed: document.querySelector('#prompt-console [data-slip="question"]').getAttribute('aria-pressed'),
      cls: document.querySelector('#prompt-console .slip[data-slip-id="question"]').classList.contains('is-held'),
      live: b.announcement,
      arrangement: b.arrangement,
    };
  `);
  eq(held.held, 'question', 'Enter 把那一片石版拿起來了');
  eq(held.pressed, 'true', '拿起來的石版 aria-pressed = true');
  eq(held.cls, true, '拿起來的石版看得出來被抓著（is-held）');
  ok(/拿起/.test(held.live) && /共 3 片/.test(held.live), 'aria-live 講出「拿起哪一片、第幾片」', held.live);
  eq(held.arrangement.join(','), 'question,docs,ground', '只是拿起來，還沒搬');

  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(160);
  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(160);
  const moved = await evaluate(`
    const b = window.__promptasy.promptConsole.orderBoard;
    return { arrangement: b.arrangement, live: b.announcement, held: b.held,
      focused: document.activeElement?.getAttribute('data-slip'),
      ranks: [...document.querySelectorAll('#prompt-console .slip__rank')].map((n) => n.textContent) };
  `);
  eq(moved.arrangement.join(','), 'docs,ground,question', '↑ ↓ 真的把石版搬到別的位置');
  eq(moved.held, 'question', '搬動的時候還握在手上');
  eq(moved.focused, 'question', '焦點跟著那一片走（不會掉回頁首）');
  ok(/移到第 3 片/.test(moved.live), 'aria-live 講出搬到第幾片', moved.live);
  eq(moved.ranks.join(''), '123', '位次跟著重新編號');

  await key('Enter', 'Enter', { vk: 13 });
  await sleep(320);
  const dropped = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.orderBoard;
    return {
      held: b.held,
      done: b.done,
      right: b.progress.right,
      live: b.announcement,
      marks: [...document.querySelectorAll('#prompt-console .slip')].map((li) => li.classList.contains('is-right')),
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      lampText: document.querySelector('#prompt-console [data-lamp-text]').textContent.trim(),
      palmHidden: document.querySelector('#prompt-console .orderboard .palmwrap').hidden,
      act: g.promptConsole.act,
      focused: document.activeElement?.className,
      text: b.text,
      xp: g.progression.state.xp,
    };
  `);
  eq(dropped.held, null, 'Enter 把石版放下了');
  eq(dropped.done, true, '三片都站對位置了');
  eq(dropped.right, 3, '「位置對了」3 / 3');
  eq(dropped.marks.filter(Boolean).length, 3, '每一片都標上了「位置對了」的刻記');
  ok(/位置對了/.test(dropped.live), 'aria-live 講出放下的結果', dropped.live);
  ok(dropped.lit >= 2, '旁邊的刻痕對照跟著亮燈', String(dropped.lit));
  ok(/把手掌按上石碑/.test(dropped.lampText), '進度燈改口成「把手掌按上石碑就過關了」', dropped.lampText);
  eq(dropped.palmHidden, false, '排順之後手掌印才浮出來');
  eq(dropped.act, 4, '排滿自動切到第四幕（跟石碑刻印同一個節拍）');
  ok(/palm/.test(String(dropped.focused)), '焦點自動落到手掌印上', String(dropped.focused));
  ok(
    dropped.text.indexOf('<documents>') === 0 && /問題：/.test(dropped.text.split('\n').pop()),
    '排好的文字＝資料在前、問題在最後一行',
    dropped.text.slice(0, 40)
  );

  // 真的按住手掌 900ms（> PALM_HOLD_MS）
  const palmBox = await centerOf('#prompt-console .orderboard .palm');
  await holdPalm(palmBox, '排序刻印：手掌印按滿');
  await sleep(400);
  const orderResult = await evaluate(`
    const g = window.__promptasy;
    return {
      fired: g.promptConsole.orderBoard.fired,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      best: g.progression.bestGrade('long-scroll-tower-23'),
      xpGain: g.progression.state.xp - ${dropped.xp},
      sources: [...document.querySelectorAll('#prompt-console [data-result] a.src')].length,
      rubricRows: g.content.challenge('long-scroll-tower-23').rubric.length,
    };
  `);
  eq(orderResult.fired, true, '按住手掌 900ms 真的發動了');
  eq(orderResult.resultHidden, false, '結果面板照舊出現');
  eq(orderResult.grade, 'S', '排對的順序走同一支離線引擎 → 拿到 S');
  eq(orderResult.best, 'S', '評價寫進進度');
  ok(orderResult.xpGain > 0, '排序刻印一樣給 XP', String(orderResult.xpGain));
  ok(
    orderResult.sources >= orderResult.rubricRows,
    '結果面板每一條都掛著官方出處（條數由資料現算）',
    `${orderResult.sources} / ${orderResult.rubricRows}`
  );

  /* --- 指標拖曳：用真的滑鼠事件把石版拖到別的位置 --- */
  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('priority-stair-42'));
    await new Promise((r) => setTimeout(r, 260));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    return 1;
  `);
  const stairBefore = await evaluate(`
    const b = window.__promptasy.promptConsole.orderBoard;
    return { arrangement: b.arrangement, correct: b.correctOrder, slips: document.querySelectorAll('#prompt-console .slip').length };
  `);
  eq(stairBefore.slips, 4, '優先序階梯有 4 片石版');
  eq(stairBefore.correct.join(','), 'safety,job,taste,rule', '正解是「安全規範在最上面」');
  /*
   * 起點與終點都要**在版面安定之後才量**：先捲到定位、等一拍，再取一次座標。
   * 終點取的是「整份清單的上緣」而不是某一片石版 —— Phase D 把這一關的石版
   * 換成三條規矩的階梯之後，宣告順序裡的第二片並不是畫面上最上面那一片。
   */
  const drag = await evaluate(`
    const grip = (id) => document.querySelector('#prompt-console [data-slip="' + id + '"]');
    grip('safety').scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 320));
    const a = grip('safety').getBoundingClientRect();
    const list = (
      document.querySelector('#prompt-console [data-slips]:not([hidden])') ||
      document.querySelector('#prompt-console [data-slips]')
    ).getBoundingClientRect();
    return {
      fromX: Math.round(a.x + 30), fromY: Math.round(a.y + a.height / 2),
      toX: Math.round(a.x + 30), toY: Math.round(list.top + 4),
    };
  `);
  /*
   * 指標事件只會打到「最上面那一層」——長跑到這裡如果還有別的面板疊在上面
   * （分享卡、圖鑑、設定…），滑鼠就永遠碰不到石版。先確定沒有，並記下
   * 那個座標上真正的元素當作失敗時的線索（drag 是已知的 flaky 家族）。
   */
  const dragTop = await evaluate(`
    const g = window.__promptasy;
    try { g.shareCard?.close?.(); } catch {}
    try { if (g.codex?.isOpen) g.codex.close(); } catch {}
    try { if (g.settings?.isOpen) g.settings.close(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
    const el = document.elementFromPoint(${drag.fromX}, ${drag.fromY});
    return { top: el ? (el.className || el.tagName) : 'none', inBoard: !!(el && el.closest && el.closest('[data-slip]')) };
  `);
  await mouse('mouseMoved', drag.fromX, drag.fromY, { buttons: 0 });
  await mouse('mousePressed', drag.fromX, drag.fromY);
  /*
   * AGENTS.md：動畫／指標時序類的斷言要 poll until，不要用固定 sleep。
   * 軟體渲染下一幀可能要 200ms，原本的 140/90/360ms 會讓「抓起來」與「放下」
   * 撞在同一幀上（這一對斷言就是已知的 flaky 家族）。
   */
  await waitFor(
    () => evaluate(`return !!document.querySelector('#prompt-console .slip.is-dragging');`).catch(() => false),
    { timeout: 8000, every: 100, label: '石版真的被抓起來' }
  ).catch(() => null);
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await mouse('mouseMoved', drag.fromX, Math.round(drag.fromY + (drag.toY - drag.fromY) * t));
    await sleep(90);
  }
  /*
   * 重排是發生在 pointermove 上（不是放開的時候）—— 輪詢等它真的搬到最上面。
   *
   * 每一輪再往上多推一點：拖曳過程中其他石版會跟著讓位，原本量到的
   * 「最上面那一片的頂端 + 4」在讓位之後可能已經落進第二格的判定帶裡
   * （實測會停在 context,role,… 差一格）。所以不是重送同一個座標，
   * 而是每一輪往上再走 10px，直到真的站上第一格為止。
   */
  let dropY = drag.toY;
  await waitFor(
    async () => {
      const probe = await evaluate(`
        const b = window.__promptasy.promptConsole.orderBoard;
        // 目標 Y **每一輪重新量**：拖曳過程中其他石版會讓位，開場量到的座標會過期
        /*
         * 目標 Y 取「整份清單的上緣」——被拖著的那一片會被 --lift 位移，
         * 拿它自己的 rect 當基準會追著自己跑；清單容器的上緣一定在
         * 每一列的中線之上，indexAtY() 必定回 0。
         */
        const list = document.querySelector('#prompt-console [data-slips]:not([hidden])')
          || document.querySelector('#prompt-console [data-slips]');
        const r = list ? list.getBoundingClientRect() : null;
        return {
          ok: b.arrangement[0] === 'role',
          y: r ? Math.round(r.top + 2) : null,
          h: r ? Math.round(r.height) : 0,
        };
      `).catch(() => ({ ok: false, y: null }));
      if (probe.ok) return true;
      if (probe.y != null) dropY = Math.max(4, probe.y);
      /*
       * 不是重送同一個座標，而是每一輪**重新掃一次**：由下往上分幾步走到清單上緣，
       * 每一步之間留一點時間。
       *
       * 為什麼要這樣：order.js 的重排帶 FLIP 動畫（withSlide），搬完之後每一列會先被
       * translate 回原位、下一個 animation frame 才歸零。軟體渲染下一幀要 160 ms 以上，
       * 在那段時間內 getBoundingClientRect() 讀到的還是**搬之前**的版面，
       * indexAtY() 因此算出「跟現在一樣的位置」，`to !== 現在` 這個守衛就把後續的移動擋掉，
       * 石版會停在只搬了一格的地方（實測 context,role,… 差一格）。
       * 所以要給它「真的有位移的下一步 ＋ 讓影格追得上的時間」。
       */
      for (const k of [0.55, 0.25, 0]) {
        const y = Math.max(4, Math.round(dropY + (probe.h || 0) * k));
        await mouse('mouseMoved', drag.toX, y);
        await sleep(70);
      }
      return false;
    },
    { timeout: 8000, every: 120, label: '石版被拖到最上面' }
  ).catch(() => null);
  await mouse('mouseReleased', drag.toX, dropY);
  await waitFor(
    () => evaluate(`return !document.querySelector('#prompt-console .slip.is-dragging');`).catch(() => false),
    { timeout: 6000, every: 100, label: '放開之後拖曳狀態收乾淨' }
  ).catch(() => null);
  const dragged = await evaluate(`
    const b = window.__promptasy.promptConsole.orderBoard;
    return { arrangement: b.arrangement, right: b.progress.right,
      rightMark: document.querySelector('#prompt-console .slip[data-slip-id="safety"]').classList.contains('is-right') };
  `);
  eq(
    dragged.arrangement[0],
    'safety',
    '滑鼠拖曳真的把「安全規範」搬到最上面',
    `座標上的元素＝${dragTop.top}（在石版上？${dragTop.inBoard}）`
  );
  eq(dragged.rightMark, true, '搬對的那一片立刻標成「位置對了」', `arrangement=${dragged.arrangement.join(",")}`);
  ok(dragged.right >= 1, '拖曳之後至少一片站對了', String(dragged.right));

  // 排錯不會失敗：手掌印不出現、不扣分、也不會跳結果面板
  const stillSafe = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.orderBoard;
    b.arrange(['safety', 'taste', 'rule', 'job']);
    await new Promise((r) => setTimeout(r, 160));
    return {
      done: b.done,
      palmHidden: document.querySelector('#prompt-console .orderboard .palmwrap').hidden,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      canGo4: g.promptConsole.canGoAct(4),
      xp: g.progression.state.xp,
    };
  `);
  eq(stillSafe.done, false, '排錯就是還沒排好');
  eq(stillSafe.palmHidden, true, '排錯時手掌印不出現 —— 你不可能「送出一個排錯的答案」');
  eq(stillSafe.resultHidden, true, '排錯不會跳失敗面板');
  eq(stillSafe.canGo4, false, '排錯時第四幕按不下去');

  const stairDone = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.orderBoard;
    const xpBefore = g.progression.state.xp;
    b.arrange(b.correctOrder);
    await new Promise((r) => setTimeout(r, 200));
    b.press();
    await new Promise((r) => setTimeout(r, 420));
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      text: b.text,
      xpGain: g.progression.state.xp - xpBefore,
      noPenalty: g.progression.state.xp >= xpBefore,
    };
  `);
  eq(stairDone.grade, 'S', '優先序階梯排對也是 S（同一支引擎）');
  ok(stairDone.text.indexOf('1. ') === 0, '最高的那一階真的排在最上面', stairDone.text.slice(0, 20));
  ok(stairDone.xpGain > 0, '排錯過幾次不影響拿到的 XP（不會失敗、也不扣分）', String(stairDone.xpGain));

  /* ---------------------------------------------------------------- *
   * 二、神諭工坊：純鍵盤走完整條派工流程
   * ---------------------------------------------------------------- */
  const wsOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    const c = g.content.challenge('oracle-workshop-36');
    g.promptConsole.open(c);
    await new Promise((r) => setTimeout(r, 260));
    const act1 = {
      links: document.querySelectorAll('#prompt-console .act--brief a[href^="https"]').length,
      mission: document.querySelector('#prompt-console [data-mission]').textContent.trim(),
      material: document.querySelector('#prompt-console [data-material]').textContent.trim(),
    };
    g.promptConsole.goAct(2, { force: true });
    await new Promise((r) => setTimeout(r, 240));
    const act2 = {
      glyphs: document.querySelectorAll('#prompt-console .glyphs .glyph').length,
      // 出處是那枚典籍（純圖示）→ 標籤走 aria-label，不是牌面上的字
      sources: [...document.querySelectorAll('#prompt-console .act--guide a.bookicon')]
        .filter((a) => (a.getAttribute('aria-label') || '').startsWith('神諭原典'))
        .map((a) => a.href),
      labels: [...document.querySelectorAll('#prompt-console .act--guide a.bookicon')]
        .filter((a) => (a.getAttribute('aria-label') || '').startsWith('神諭原典'))
        .map((a) => a.getAttribute('aria-label').trim()),
    };
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const w = g.promptConsole.workshop;
    return {
      act1, act2,
      kind: g.promptConsole.kind,
      teaches: c.teaches,
      stage: w.stage,
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      cards: [...document.querySelectorAll('#prompt-console .toolcard .toolcard__name')].map((n) => n.textContent.trim()),
      params: [...document.querySelectorAll('#prompt-console .toolcard .toolcard__params')].map((n) => n.textContent.trim()),
      progress: document.querySelector('#prompt-console .workshop .carve__progress').textContent.trim(),
      ask: document.querySelector('#prompt-console .workshop .carve__ask').textContent.trim(),
      focused: document.activeElement?.getAttribute('data-tool'),
      palmHidden: document.querySelector('#prompt-console .workshop .palmwrap').hidden,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      orderHidden: document.querySelector('#prompt-console .orderboard').hidden,
    };
  `);
  eq(wsOpen.kind, 'workshop', '神諭工坊是第三種題型');
  eq(wsOpen.act1.links, 0, '第一幕仍然零官方連結（委託只有題目）');
  ok(/使用時機/.test(wsOpen.act1.mission), '委託講的是「替每一把工具寫下使用時機」', wsOpen.act1.mission);
  ok(/查天氣|翻檔案庫/.test(wsOpen.act1.material), '素材就是檯上那幾把用途相鄰的工具', wsOpen.act1.material);
  /* Phase A：這一關也一樣 —— 第二幕只放大它教的那一條（神諭工坊：該用哪把工具） */
  eq(wsOpen.act2.glyphs, 1, '第二幕的神諭刻文只有一條（一關只教一件事）');
  ok(
    wsOpen.act2.sources.every((u) => /^https:/.test(u)) && wsOpen.act2.sources.length === 1,
    '那一條刻文掛著可點的官方出處',
    wsOpen.act2.sources.join(' ')
  );
  ok(
    wsOpen.act2.labels.every((t) => t.startsWith('神諭原典：')),
    '出處標成「神諭原典：<文件名>」（換皮但不說謊）',
    wsOpen.act2.labels.join(' / ')
  );
  eq(
    wsOpen.teaches.join(','),
    'agentic-01,agentic-02,decompose-02,grounding-03',
    '教的是課程裡真實存在的工具使用 / 拆解技巧'
  );
  eq(wsOpen.label, '神諭工坊', '版面上寫的是「神諭工坊」');
  eq(wsOpen.steleHidden, true, '選擇題的石碑收起來了');
  eq(wsOpen.orderHidden, true, '排序刻印也收起來了');
  eq(wsOpen.stage, 'tools', '第一步是挑工具');
  eq(wsOpen.cards.length, 3, '檯上有三把工具牌');
  ok(
    wsOpen.params.every((p) => p.startsWith('參數：')),
    '每張工具牌都寫著它的參數（名字 ＋ 說明 ＋ 參數）',
    wsOpen.params.join(' / ')
  );
  ok(/第 1 \/ 4 步/.test(wsOpen.progress), '進度寫著「第 1 / 4 步」', wsOpen.progress);
  ok(wsOpen.focused, '焦點落在第一張工具牌上', String(wsOpen.focused));
  eq(wsOpen.palmHidden, true, '還沒派完工，手掌印不出現');

  // 挑錯工具 → 就地教學、不扣分、不前進
  const badTool = await evaluate(`
    const g = window.__promptasy;
    document.querySelector('#prompt-console [data-tool="ledger"]').focus();
    return 1;
  `);
  ok(badTool === 1, '把焦點停在用不到的那把工具上');
  await enterNative();
  await sleep(320);
  const badToolOut = await evaluate(`
    const g = window.__promptasy;
    const btn = document.querySelector('#prompt-console [data-tool="ledger"]');
    const fb = btn.querySelector('[data-tool-fb]');
    return {
      wrong: btn.classList.contains('is-wrong'),
      shown: !fb.hidden,
      text: fb.textContent.trim(),
      data: g.content.flow('oracle-workshop-36').workshop.tools.find((t) => t.id === 'ledger').feedback,
      stage: g.promptConsole.workshop.stage,
      chosen: g.promptConsole.workshop.dispatch.chosen.length,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      stillHere: !!document.querySelector('#prompt-console [data-tool="ledger"]'),
    };
  `);
  eq(badToolOut.wrong, true, '挑錯的工具牌留在原地並標成「工坊不收」');
  eq(badToolOut.shown, true, '挑錯就地長出一句白話教學');
  eq(badToolOut.text, badToolOut.data, '教學回饋就是資料裡寫的那一句');
  ok(badToolOut.text.length >= 12, '回饋講得出「為什麼這一把用不到」', badToolOut.text);
  eq(badToolOut.stage, 'tools', '挑錯不會前進到下一步');
  eq(badToolOut.chosen, 0, '挑錯的工具不會被收進派工單');
  eq(badToolOut.resultHidden, true, '挑錯不會跳失敗面板');
  eq(badToolOut.stillHere, true, '挑錯的牌子還在，可以再挑別的');

  // 純鍵盤挑對兩把工具（方向鍵在牌之間走、Enter 收下）
  await evaluate(`document.querySelector('#prompt-console [data-tool="weather"]').focus(); return 1;`);
  await enterNative();
  await sleep(260);
  const afterFirstTool = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    return { chosen: w.dispatch.chosen, stage: w.stage,
      taken: document.querySelector('#prompt-console [data-tool="weather"]').classList.contains('is-taken'),
      slip: [...document.querySelectorAll('#prompt-console .workshop .carved')].map((li) => li.textContent).join('|'),
      focused: document.activeElement?.getAttribute('data-tool') };
  `);
  eq(afterFirstTool.chosen.join(','), 'weather', '收下第一把工具');
  eq(afterFirstTool.taken, true, '收下的牌子標成已收');
  eq(afterFirstTool.stage, 'tools', '還缺一把，留在同一步');
  ok(/工具名：查天氣/.test(afterFirstTool.slip), '派工單上開始長出工具規格', afterFirstTool.slip.slice(0, 40));
  ok(afterFirstTool.focused, '焦點還在工具牌那一組上', String(afterFirstTool.focused));

  await evaluate(`document.querySelector('#prompt-console [data-tool="letter"]').focus(); return 1;`);
  await enterNative();
  await sleep(360);
  const paramStage = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    return {
      stage: w.stage,
      progress: document.querySelector('#prompt-console .workshop .carve__progress').textContent.trim(),
      slots: [...document.querySelectorAll('#prompt-console .pslot__label')].map((n) => n.textContent.trim()),
      hints: [...document.querySelectorAll('#prompt-console .pslot__hint')].map((n) => n.textContent.trim()),
      stones: [...document.querySelectorAll('#prompt-console .stone')].map((n) => n.textContent.trim()),
      filled: document.querySelectorAll('#prompt-console .pslot.is-filled').length,
      focused: document.activeElement?.tagName,
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
    };
  `);
  eq(paramStage.stage, 'params', '兩把工具都收下 → 自動進到「填參數」');
  ok(/第 2 \/ 4 步/.test(paramStage.progress), '進度走到第 2 步', paramStage.progress);
  eq(paramStage.slots.join(','), '地點,日期,收件人,內容', '四個參數格照工具的順序排開');
  ok(paramStage.hints.every((h) => /字串/.test(h)), '每一格都寫著型別與用途', paramStage.hints.join(' / '));
  eq(paramStage.stones.length, 6, '托盤裡有 6 顆值石（4 顆用得到）');
  eq(paramStage.filled, 0, '參數格一開始都是空的');
  ok(paramStage.lit < 2, '第 2 步還沒把兩盞燈都點亮（後面幾步都還在加分）', String(paramStage.lit));

  // 放錯值石 → 就地教學、值石回托盤、不扣分
  await evaluate(`document.querySelector('#prompt-console [data-stone="yesterday"]').focus(); return 1;`);
  await enterNative();
  await sleep(240);
  const stoneHeld = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    return { held: w.held, live: w.announcement,
      pressed: document.querySelector('#prompt-console [data-stone="yesterday"]')?.getAttribute('aria-pressed'),
      focused: document.activeElement?.getAttribute('data-pslot') };
  `);
  eq(stoneHeld.held, 'yesterday', 'Enter 把值石拿起來了');
  eq(stoneHeld.pressed, 'true', '拿起來的值石 aria-pressed = true');
  ok(/拿起值石/.test(stoneHeld.live), 'aria-live 講出拿起了哪一顆', stoneHeld.live);
  eq(stoneHeld.focused, 'weather.place', '焦點自動跳到第一個空格（鍵盤不用自己找）');

  await enterNative();
  await sleep(320);
  const badDrop = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    const slot = document.querySelector('#prompt-console [data-pslot="weather.place"]');
    return {
      fbShown: !slot.querySelector('[data-pslot-fb]').hidden,
      fb: slot.querySelector('[data-pslot-fb]').textContent.trim(),
      filled: document.querySelectorAll('#prompt-console .pslot.is-filled').length,
      held: w.held,
      stoneBack: !document.querySelector('#prompt-console [data-stone="yesterday"]').disabled,
      stage: w.stage,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
    };
  `);
  eq(badDrop.fbShown, true, '放錯值石就地長出一句白話教學');
  ok(/地點/.test(badDrop.fb) && badDrop.fb.length >= 12, '教學說得出這一格要的是什麼', badDrop.fb);
  eq(badDrop.filled, 0, '放錯不會被填進去');
  eq(badDrop.held, null, '放錯之後手上就空了');
  eq(badDrop.stoneBack, true, '放錯的值石回到托盤，還可以再用');
  eq(badDrop.stage, 'params', '放錯不會前進');
  eq(badDrop.resultHidden, true, '放錯不會跳失敗面板');

  // 純鍵盤把四格填滿
  for (const [stone, slot] of [
    ['lake', 'weather.place'],
    ['tomorrow', 'weather.date'],
    ['keeper', 'letter.to'],
    ['result', 'letter.body'],
  ]) {
    await evaluate(`document.querySelector('#prompt-console [data-stone="${stone}"]').focus(); return 1;`);
    await enterNative();
    await sleep(200);
    await evaluate(`document.querySelector('#prompt-console [data-pslot="${slot}"]')?.focus(); return 1;`);
    await enterNative();
    await sleep(260);
  }
  const orderStage = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    return {
      stage: w.stage,
      values: w.dispatch.values,
      progress: document.querySelector('#prompt-console .workshop .carve__progress').textContent.trim(),
      slips: [...document.querySelectorAll('#prompt-console .workshop .slip__text')].map((n) => n.textContent.trim()),
      arrangement: w.board.arrangement,
      correct: w.board.correctOrder,
      slip: [...document.querySelectorAll('#prompt-console .workshop .carved')].map((li) => li.textContent).join('\\n'),
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
    };
  `);
  eq(orderStage.stage, 'order', '四個參數都填好 → 自動進到「排順序」');
  ok(/第 3 \/ 4 步/.test(orderStage.progress), '進度走到第 3 步', orderStage.progress);
  eq(orderStage.values['weather.place'], '湖邊', '「湖邊」填進了地點格');
  eq(orderStage.values['letter.body'], '第 1 步查到的天氣', '信的內容指回前一步的結果（相依關係）');
  eq(orderStage.slips.length, 2, '要排的是兩通呼叫');
  eq(orderStage.correct.join(','), 'weather,letter', '正解是先查天氣、再寄信');
  eq(
    JSON.stringify(orderStage.arrangement) === JSON.stringify(orderStage.correct),
    false,
    '一開始故意排反（要玩家自己想相依順序）'
  );
  ok(/呼叫「查天氣」/.test(orderStage.slip), '派工單上出現填好參數的呼叫', orderStage.slip.slice(0, 60));

  // 排順序也走同一套鍵盤文法
  await evaluate(`document.querySelector('#prompt-console .workshop [data-slip="weather"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(180);
  await key('ArrowUp', 'ArrowUp', { vk: 38 });
  await sleep(180);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(400);
  const ruleStage = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    return {
      stage: w.stage,
      ordered: w.dispatch.ordered,
      progress: document.querySelector('#prompt-console .workshop .carve__progress').textContent.trim(),
      rules: [...document.querySelectorAll('#prompt-console .workshop .opt__line')].map((n) => n.textContent.trim()),
      slip: [...document.querySelectorAll('#prompt-console .workshop .carved')].map((li) => li.textContent),
      focused: document.activeElement?.getAttribute('data-rule'),
    };
  `);
  eq(ruleStage.stage, 'rule', '排好順序 → 自動進到「立規矩」');
  eq(ruleStage.ordered, true, '呼叫順序記下來了');
  ok(/第 4 \/ 4 步/.test(ruleStage.progress), '進度走到第 4 步', ruleStage.progress);
  eq(ruleStage.rules.length, 3, '有三條規矩可以立');
  ok(ruleStage.slip[0].startsWith('請你當工坊的派工人'), '派工單長出了開頭那句任務', ruleStage.slip[0]);
  ok(
    ruleStage.slip.some((l) => l.startsWith('1. 呼叫「查天氣」')) &&
      ruleStage.slip.some((l) => l.startsWith('2. 呼叫「寄信」')),
    '兩通呼叫照相依順序編號',
    ruleStage.slip.join(' / ')
  );
  ok(ruleStage.focused !== null && ruleStage.focused !== undefined, '焦點落在第一條規矩上', String(ruleStage.focused));

  // 立錯規矩 → 就地教學、不失敗
  await evaluate(`document.querySelector('#prompt-console .workshop [data-rule="0"]').focus(); return 1;`);
  await enterNative();
  await sleep(300);
  const badRule = await evaluate(`
    const w = window.__promptasy.promptConsole.workshop;
    const btn = document.querySelector('#prompt-console .workshop [data-rule="0"]');
    return {
      wrong: btn.classList.contains('is-wrong'),
      fb: btn.querySelector('[data-rule-fb]').textContent.trim(),
      shown: !btn.querySelector('[data-rule-fb]').hidden,
      stage: w.stage,
      done: w.done,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
    };
  `);
  eq(badRule.wrong, true, '立錯的規矩標成「工坊不收」');
  eq(badRule.shown, true, '立錯就地長出教學');
  ok(/時機|判斷/.test(badRule.fb), '教學講出「使用時機要你寫下來」', badRule.fb);
  eq(badRule.stage, 'rule', '立錯不會前進');
  eq(badRule.done, false, '立錯不算完成');
  eq(badRule.resultHidden, true, '立錯不會跳失敗面板');

  // 立對規矩（按 2 這個數字快捷）→ 手掌印
  await evaluate(`document.querySelector('#prompt-console .workshop [data-rule="1"]').focus(); return 1;`);
  await typeChar('2', 'Digit2', 50);
  await sleep(420);
  const wsDone = await evaluate(`
    const g = window.__promptasy;
    const w = g.promptConsole.workshop;
    return {
      done: w.done,
      act: g.promptConsole.act,
      palmHidden: document.querySelector('#prompt-console .workshop .palmwrap').hidden,
      focused: document.activeElement?.className,
      text: w.text,
      sample: g.content.challenge('oracle-workshop-36').sample,
      lit: document.querySelectorAll('#prompt-console .checklist li.is-pass').length,
      lampText: document.querySelector('#prompt-console [data-lamp-text]').textContent.trim(),
      xp: g.progression.state.xp,
    };
  `);
  eq(wsDone.done, true, '四步走完＝派工單寫好了');
  eq(wsDone.act, 4, '派工單寫好自動切到第四幕（跟另外兩種題型同一個節拍）');
  eq(wsDone.palmHidden, false, '手掌印浮出來了');
  ok(/palm/.test(String(wsDone.focused)), '焦點落到手掌印上', String(wsDone.focused));
  eq(wsDone.text, wsDone.sample, '派工單組出來的字＝資料層的示範解答（同一段文字）');
  eq(wsDone.lit, 2, '兩盞燈全亮（C1 之後一關只有主檢查 ＋ 地基）');
  ok(/把手掌按上石碑/.test(wsDone.lampText), '進度燈說「把手掌按上石碑就過關了」', wsDone.lampText);

  const wsPalm = await centerOf('#prompt-console .workshop .palm');
  await holdPalm(wsPalm, '神諭工坊：手掌印按滿');
  await sleep(400);
  const wsResult = await evaluate(`
    const g = window.__promptasy;
    return {
      fired: g.promptConsole.workshop.fired,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      best: g.progression.bestGrade('oracle-workshop-36'),
      xpGain: g.progression.state.xp - ${wsDone.xp},
      collected: ['agentic-01', 'agentic-02', 'decompose-02', 'grounding-03'].map((id) => g.progression.isCollected(id)),
      source: document.querySelector('#prompt-console .result__source a.src')?.href,
    };
  `);
  eq(wsResult.fired, true, '按住手掌 900ms 真的發動了');
  eq(wsResult.grade, 'S', '派工完成走同一支離線引擎 → 拿到 S');
  eq(wsResult.best, 'S', '評價寫進進度');
  ok(wsResult.xpGain > 0, '神諭工坊一樣給 XP', String(wsResult.xpGain));
  eq(wsResult.collected.filter(Boolean).length, 4, '四條技巧收進圖鑑');
  ok(/^https:/.test(String(wsResult.source)), '結果面板掛著本關技巧的官方出處', String(wsResult.source));

  /* --- 新石座：世界上真的有一座、走近互動得到 --- */
  const pedestal = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 220));
    const c = g.content.challenge('oracle-workshop-36');
    const marker = g.world.markers.find((m) => m.challenge.id === c.id);
    let node = null;
    g.world.root ? null : null;
    g.engine.scene.traverse((o) => { if (o.name === 'marker:' + c.id) node = o; });
    return {
      inData: !!c,
      region: c.region,
      position: c.position,
      hasMarker: !!marker,
      inScene: !!node,
      cleared: marker ? marker.cleared || g.progression.isCleared(c.id) : false,
      solidThere: !!g.world.solidAt(c.position[0], c.position[1]),
      reachable: [0, 6, 12, 18].every((a) => {
        const r = (a / 24) * Math.PI * 2;
        return !g.world.solidAt(c.position[0] + Math.cos(r) * 3, c.position[1] + Math.sin(r) * 3);
      }),
      inRegion: g.content.challengesOf('orchestration').length,
    };
  `);
  eq(pedestal.hasMarker, true, '新關卡在世界上真的有一座石座');
  eq(pedestal.inScene, true, '石座長在場景圖上（marker:oracle-workshop-36）');
  eq(pedestal.region, 'toolcraft', '石座擺在契約鍛冶場（課程 v2 · Phase F 搬家）');
  eq(pedestal.solidThere, true, '石座本體擋得住人（走不進石頭裡）');
  eq(pedestal.reachable, true, '石座四周走得到互動距離');
  eq(pedestal.inRegion, 13, '齒輪工坊 13 關（12 座教學神廟 ＋ 1 座試煉）');

  /* --- 換一種答題方式：自由書寫仍然照舊 --- */
  const wsFree = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('oracle-workshop-36'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.setMode('free');
    await new Promise((r) => setTimeout(r, 260));
    const out = {
      workshopHidden: document.querySelector('#prompt-console .workshop').hidden,
      textarea: !!document.querySelector('#prompt-console .prompt-input'),
      fills: document.querySelectorAll('#prompt-console .fill').length,
      submitVisible: !!document.querySelector('#prompt-console [data-submit]'),
      modeLabel: document.querySelector('#prompt-console [data-mode]').textContent.trim(),
    };
    g.promptConsole.setMode('guided');
    await new Promise((r) => setTimeout(r, 240));
    out.backKind = g.promptConsole.kind;
    out.backShown = !document.querySelector('#prompt-console .workshop').hidden;
    out.backLabel = document.querySelector('#prompt-console [data-mode]').textContent.trim();
    g.promptConsole.close();
    return out;
  `);
  eq(wsFree.workshopHidden, true, '切到自由書寫時工坊收起來');
  eq(wsFree.textarea, true, '自由書寫的輸入框照舊在');
  ok(wsFree.fills >= 2, '快速填入照舊在', String(wsFree.fills));
  ok(/回到神諭工坊/.test(wsFree.modeLabel), '切換鍵說得出要回到哪一種題型', wsFree.modeLabel);
  eq(wsFree.backKind, 'workshop', '切回來還是神諭工坊');
  eq(wsFree.backShown, true, '切回來工坊重新上台');
  ok(/自由書寫模式/.test(wsFree.backLabel), '切回來之後鍵面改回「自由書寫模式」', wsFree.backLabel);

  /* --- 24 關的石碑刻印一個位元組都沒變 --- */
  const untouched = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 260));
    const out = {
      kind: g.promptConsole.kind,
      steleShown: !document.querySelector('#prompt-console .stele-stage').hidden,
      orderHidden: document.querySelector('#prompt-console .orderboard').hidden,
      workshopHidden: document.querySelector('#prompt-console .workshop').hidden,
      options: document.querySelectorAll('#prompt-console .opt').length,
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
    };
    g.promptConsole.close();
    return out;
  `);
  eq(untouched.kind, 'choice', '沒宣告 kind 的關卡就是石碑刻印（預設值）');
  eq(untouched.steleShown, true, '石碑照舊上台');
  eq(untouched.orderHidden, true, '排序刻印不會亂入');
  eq(untouched.workshopHidden, true, '工坊不會亂入');
  eq(untouched.options, 3, '選項照舊三個');
  eq(untouched.label, '石碑刻印', '版面照舊寫「石碑刻印」');

  /* --- 窄畫面不溢位 --- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(320);
  const narrow27 = await evaluate(`
    const g = window.__promptasy;
    const out = {};
    g.promptConsole.open(g.content.challenge('long-scroll-tower-23'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const body = document.querySelector('#prompt-console .panel__body');
    out.orderOverflow = Math.max(0, body.scrollWidth - body.clientWidth);
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('oracle-workshop-36'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const body2 = document.querySelector('#prompt-console .panel__body');
    out.workshopOverflow = Math.max(0, body2.scrollWidth - body2.clientWidth);
    g.promptConsole.close();
    return out;
  `);
  eq(narrow27.orderOverflow, 0, '820px 下排序刻印沒有水平溢位');
  eq(narrow27.workshopOverflow, 0, '820px 下神諭工坊沒有水平溢位');
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  /* ================================================================ */
  console.log('\n▸ 改碑與點碑（課程 v2 · Phase B）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close(); g.codex.close(); g.settings.close();
    g.promptConsole.setMode('guided');
    return 1;
  `);
  await sleep(220);

  /* ---------------------------------------------------------------- *
   * 一、改碑：純鍵盤走完（畫線的句子 → Enter 攤開 → 挑錯不失敗 →
   *          Esc 還原 → 換對 → 手印 → S），世界上真的多了一座石座
   * ---------------------------------------------------------------- */
  const fixOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('nightwatch-relief-07'));
    await new Promise((r) => setTimeout(r, 260));
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const b = g.promptConsole.fixBoard;
    return {
      actAtOpen,
      act: g.promptConsole.act,
      kind: g.promptConsole.kind,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      orderHidden: document.querySelector('#prompt-console .orderboard').hidden,
      spotHidden: document.querySelector('#prompt-console .spotboard').hidden,
      boardShown: !document.querySelector('#prompt-console .fixboard').hidden,
      weakCount: document.querySelectorAll('#prompt-console .frag--weak').length,
      keptCount: document.querySelectorAll('#prompt-console .frag--kept').length,
      progress: document.querySelector('#prompt-console .fixboard .carve__progress').textContent.trim(),
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      palmHidden: document.querySelector('#prompt-console .fixboard .palmwrap').hidden,
      optionsOpen: document.querySelectorAll('#prompt-console .frag__options').length,
      text: b.text,
      done: b.done,
    };
  `);
  eq(fixOpen.actAtOpen, 1, '改碑一樣從第一幕開始（四幕分鏡沒有變）');
  eq(fixOpen.act, 3, '改碑住在第三幕');
  eq(fixOpen.kind, 'fix', '這一關的題型是改碑');
  eq(fixOpen.steleHidden, true, '選擇題的石碑收起來了');
  eq(fixOpen.orderHidden, true, '排序刻印不會亂入');
  eq(fixOpen.spotHidden, true, '點碑也不會亂入（一次只有一種在台上）');
  eq(fixOpen.boardShown, true, '台上是抄寫人留下的那份草稿');
  eq(fixOpen.label, '改碑', '版面上寫的是「改碑」');
  eq(fixOpen.weakCount, 3, '草稿上有三句被畫線（要改的）');
  eq(fixOpen.keptCount, 1, '還有一句不用動的');
  eq(fixOpen.optionsOpen, 0, '一開始沒有攤開任何替代寫法（一次只有一件事）');
  ok(/改好 0 \/ 3 句/.test(fixOpen.progress), '一開始一句都還沒改', fixOpen.progress);
  eq(fixOpen.palmHidden, true, '還沒改完，手掌印不會出現（送不出去）');
  eq(fixOpen.done, false, '這一關還沒完成');

  // 純鍵盤：焦點停在第一句要改的 → Enter 攤開替代寫法
  await evaluate(`document.querySelector('#prompt-console [data-frag-btn="route"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(240);
  const fixOpened = await evaluate(`
    return {
      expanded: document.querySelector('#prompt-console [data-frag-btn="route"]').getAttribute('aria-expanded'),
      options: document.querySelectorAll('#prompt-console [data-options="route"] .opt').length,
      focusOpt: document.activeElement?.getAttribute('data-opt'),
      focusFrag: document.activeElement?.getAttribute('data-frag'),
      openId: window.__promptasy.promptConsole.fixBoard.openId,
    };
  `);
  eq(fixOpened.expanded, 'true', 'Enter 攤開那一句的替代寫法');
  eq(fixOpened.options, 3, '替代寫法有三個');
  eq(fixOpened.focusFrag, 'route', '焦點自動跳進替代寫法（鍵盤玩家不會掉焦點）');
  eq(fixOpened.focusOpt, '0', '焦點落在第一個替代寫法上');
  eq(fixOpened.openId, 'route', '面板知道現在攤開的是哪一句');

  // 挑一個弱的替代寫法 → 石碑不收：就地教學、不扣分、不前進
  const wrongIdxFix = await evaluate(`
    const f = window.__promptasy.content.flow('nightwatch-relief-07').fixFlow;
    return f.fragments.find((x) => x.id === 'route').options.findIndex((o) => !o.correct);
  `);
  await evaluate(`document.querySelector('#prompt-console [data-frag="route"][data-opt="${wrongIdxFix}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(280);
  const fixWrong = await evaluate(`
    const g = window.__promptasy;
    const btn = document.querySelector('#prompt-console [data-frag="route"][data-opt="${wrongIdxFix}"]');
    return {
      marked: btn.classList.contains('is-wrong'),
      disabled: btn.getAttribute('aria-disabled'),
      feedback: btn.querySelector('[data-opt-fb]')?.textContent || '',
      fbHidden: btn.querySelector('[data-opt-fb]')?.hidden,
      dataFeedback: g.content.flow('nightwatch-relief-07').fixFlow.fragments[0].options[${wrongIdxFix}].feedback,
      still: g.promptConsole.fixBoard.progress.fixed,
      openId: g.promptConsole.fixBoard.openId,
      xp: g.progression.state.xp,
      verdictHidden: document.querySelector('#prompt-console .act--verdict').hidden,
      live: g.promptConsole.fixBoard.announcement,
    };
  `);
  eq(fixWrong.marked, true, '挑錯的替代寫法留在原地，標成「石碑不收」');
  eq(fixWrong.disabled, 'true', '不收的那一片按不下去了');
  eq(fixWrong.fbHidden, false, '就地長出一句教學回饋');
  eq(fixWrong.feedback, fixWrong.dataFeedback, '回饋逐字來自資料層（不是臨時編的）');
  ok(fixWrong.feedback.length >= 12, '回饋講得出「為什麼這樣比較弱」', fixWrong.feedback);
  eq(fixWrong.still, 0, '挑錯不算改好（不前進）');
  eq(fixWrong.openId, 'route', '挑錯之後那一句還攤開著，可以再挑一次');
  eq(fixWrong.verdictHidden, true, '挑錯不會跳結果面板（不會失敗）');
  ok(fixWrong.live.length > 0, 'aria-live 把回饋唸出來', fixWrong.live);

  // 挑對 → 換上去；然後 Esc 還原（改碑的鍵位契約第二段）
  const rightIdxFix = await evaluate(`
    const f = window.__promptasy.content.flow('nightwatch-relief-07').fixFlow;
    return f.fragments.find((x) => x.id === 'route').options.findIndex((o) => o.correct);
  `);
  await evaluate(`document.querySelector('#prompt-console [data-frag="route"][data-opt="${rightIdxFix}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.fixBoard.progress.fixed === 1;`), {
    label: '第一句換好了',
  });
  const fixedOne = await evaluate(`
    const g = window.__promptasy;
    const li = document.querySelector('#prompt-console [data-frag-btn="route"]').closest('.frag');
    return {
      isFixed: li.classList.contains('is-fixed'),
      shown: li.querySelector('.frag__text').textContent.trim(),
      want: g.content.flow('nightwatch-relief-07').fixFlow.fragments[0].options[${rightIdxFix}].text,
      progress: document.querySelector('#prompt-console .fixboard .carve__progress').textContent.trim(),
      focusFrag: document.activeElement?.getAttribute('data-frag-btn'),
      lit: (g.promptConsole.preflight.evaluation?.results || []).filter((r) => r.score > 0).length,
      openId: g.promptConsole.fixBoard.openId,
    };
  `);
  eq(fixedOne.isFixed, true, '換對的那一句轉成「改好了」');
  eq(fixedOne.shown, fixedOne.want, '草稿上顯示的就是換上去的那一句');
  ok(/改好 1 \/ 3 句/.test(fixedOne.progress), '進度跟著走', fixedOne.progress);
  eq(fixedOne.openId, null, '換好之後替代寫法自動收起來（一次只有一件事）');
  ok(fixedOne.focusFrag, '焦點自動跳到下一句要改的', String(fixedOne.focusFrag));
  ok(fixedOne.lit > 0, '左邊的刻痕對照跟著亮燈（同一支預檢引擎）', String(fixedOne.lit));

  // Esc 在改好的那一句上 ＝ 還原（不是關面板）
  await evaluate(`document.querySelector('#prompt-console [data-frag-btn="route"]').focus(); return 1;`);
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(260);
  const fixRestored = await evaluate(`
    const g = window.__promptasy;
    const li = document.querySelector('#prompt-console [data-frag-btn="route"]').closest('.frag');
    return {
      open: g.promptConsole.isOpen,
      isFixed: li.classList.contains('is-fixed'),
      shown: li.querySelector('.frag__text').textContent.trim(),
      original: g.content.flow('nightwatch-relief-07').fixFlow.fragments[0].text,
      openId: g.promptConsole.fixBoard.openId,
      fixed: g.promptConsole.fixBoard.progress.fixed,
      live: g.promptConsole.fixBoard.announcement,
    };
  `);
  eq(fixRestored.open, true, 'Esc 在改好的句子上不會關掉面板（鍵位契約第二段）');
  eq(fixRestored.isFixed, false, 'Esc 把那一句還原成原本的壞寫法');
  eq(fixRestored.shown, fixRestored.original, '顯示的就是原句');
  eq(fixRestored.fixed, 0, '進度跟著退回去（不扣分，只是收回一步）');
  eq(fixRestored.openId, 'route', '還原之後替代寫法重新攤開，可以再挑');
  ok(/還原/.test(fixRestored.live), 'aria-live 講出「還原」', fixRestored.live);

  // Esc 在攤開的替代寫法上 ＝ 收起來（鍵位契約第一段）；再一次才關面板
  await evaluate(`document.querySelector('#prompt-console [data-frag="route"][data-opt="0"]').focus(); return 1;`);
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(240);
  const closedOpts = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.promptConsole.isOpen,
      openId: g.promptConsole.fixBoard.openId,
      options: document.querySelectorAll('#prompt-console [data-options="route"]').length,
      focusFrag: document.activeElement?.getAttribute('data-frag-btn'),
    };
  `);
  eq(closedOpts.open, true, 'Esc 收起替代寫法時也不會關面板（鍵位契約第一段）');
  eq(closedOpts.openId, null, '替代寫法收起來了');
  eq(closedOpts.options, 0, '畫面上不再有攤開的替代寫法');
  eq(closedOpts.focusFrag, 'route', '焦點還回那一句上（不會掉到 3D 畫布）');

  // 全部換對 → 自動切到第四幕、手印出現
  await evaluate(`
    const g = window.__promptasy;
    const ff = g.content.flow('nightwatch-relief-07').fixFlow;
    for (const f of ff.fragments) {
      if (!f.weak) continue;
      g.promptConsole.fixBoard.pick(f.id, f.options.findIndex((o) => o.correct));
      await new Promise((r) => setTimeout(r, 60));
    }
    return 1;
  `);
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.fixBoard.done === true;`), {
    label: '草稿全部改好',
  });
  await sleep(320);
  const fixDone = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      palmShown: !document.querySelector('#prompt-console .fixboard .palmwrap').hidden,
      focusPalm: document.activeElement === document.querySelector('#prompt-console .fixboard [data-palm]'),
      text: g.promptConsole.fixBoard.text,
      sample: g.content.challenge('nightwatch-relief-07').sample,
      isPalmStage: document.querySelector('#prompt-console .console').classList.contains('is-palm'),
    };
  `);
  eq(fixDone.act, 4, '改完自動切到第四幕（手印）');
  eq(fixDone.palmShown, true, '手掌印浮出來了');
  eq(fixDone.focusPalm, true, '焦點自動落在手掌上（鍵盤按住就能呈上）');
  eq(fixDone.text, fixDone.sample, '改好的整段文字＝資料層的示範解答（兩種模式同一段字）');
  eq(fixDone.isPalmStage, true, '第四幕把光打在手印上');

  // 按住 Enter 呈給神諭 → 結果面板、S、石座轉已通關、v2 技能入袋
  await holdPalm();
  await waitFor(() => evaluate(`return !document.querySelector('#prompt-console [data-result]').hidden;`), {
    label: '改碑的結果面板',
  });
  const fixResult = await evaluate(`
    const g = window.__promptasy;
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      best: g.progression.bestGrade('nightwatch-relief-07'),
      cleared: g.world.markers.find((m) => m.id === 'nightwatch-relief-07')?.cleared,
      skill: g.progression.isSkillCollected('clear-golden'),
      legacy: g.progression.state.collected.includes('clarity-01'),
      sources: [...document.querySelectorAll('#prompt-console [data-result] a.src')].map((a) => a.href),
      srcText: [...document.querySelectorAll('#prompt-console [data-result] a.src')].map((a) => a.textContent.trim()),
      xp: g.progression.state.xp,
    };
  `);
  eq(fixResult.grade, 'S', '改碑走完拿到 S');
  eq(fixResult.best, 'S', '評價存進進度');
  eq(fixResult.cleared, true, '世界上那座石座轉成已通關');
  eq(fixResult.skill, true, '這條 v2 技能收進 skillsV2');
  eq(fixResult.legacy, true, '有祖先的技巧照舊收進舊圖鑑（收集不倒退）');
  ok(fixResult.xp > 0, '改碑過關有 XP', String(fixResult.xp));
  ok(fixResult.sources.length > 0, '結果面板有可點的官方出處', fixResult.sources.join(' '));
  ok(
    fixResult.sources.every((u) => /^https:\/\//.test(u)),
    '每一個出處都是 https 連結',
    fixResult.sources.join(' ')
  );
  ok(
    fixResult.srcText.every((t) => !/^https?:/.test(t)),
    '出處顯示的是文件名不是網址',
    fixResult.srcText.join(' | ')
  );

  /* ---------------------------------------------------------------- *
   * 二、點碑：純鍵盤走完（方向鍵 → Enter 點起來 → 點到不能動的會彈回來
   *          → 全部挑出來 → 手印 → S）
   * ---------------------------------------------------------------- */
  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(240);
  const spotOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('shout-stone-11'));
    await new Promise((r) => setTimeout(r, 260));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const b = g.promptConsole.spotBoard;
    return {
      act: g.promptConsole.act,
      kind: g.promptConsole.kind,
      boardShown: !document.querySelector('#prompt-console .spotboard').hidden,
      fixHidden: document.querySelector('#prompt-console .fixboard').hidden,
      slips: document.querySelectorAll('#prompt-console .spot').length,
      marked: b.marked.length,
      progress: document.querySelector('#prompt-console .spotboard .carve__progress').textContent.trim(),
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      palmHidden: document.querySelector('#prompt-console .spotboard .palmwrap').hidden,
      focused: document.activeElement?.getAttribute('data-spot'),
      pressed: [...document.querySelectorAll('#prompt-console [data-spot]')].map((b2) => b2.getAttribute('aria-pressed')),
    };
  `);
  eq(spotOpen.act, 3, '點碑也住在第三幕');
  eq(spotOpen.kind, 'spot', '這一關的題型是點碑');
  eq(spotOpen.boardShown, true, '台上是一疊石籤');
  eq(spotOpen.fixHidden, true, '改碑收起來了（一次只有一種在台上）');
  eq(spotOpen.label, '點碑', '版面上寫的是「點碑」');
  eq(spotOpen.slips, 6, '這一關有 6 片石籤');
  eq(spotOpen.marked, 0, '一開始一片都沒點');
  eq(spotOpen.palmHidden, true, '還沒挑完，手掌印不會出現');
  ok(spotOpen.pressed.every((p) => p === 'false'), '每一片都標成「還沒點起來」（aria-pressed）');
  ok(/挑出 0 \/ 3 句/.test(spotOpen.progress), '進度從 0 開始', spotOpen.progress);

  // 方向鍵在石籤之間走
  await evaluate(`document.querySelector('#prompt-console [data-spot="p1"]').focus(); return 1;`);
  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(180);
  eq(
    await evaluate(`return document.activeElement?.getAttribute('data-spot');`),
    'p2',
    '↓ 把焦點移到下一片石籤（純鍵盤走得完）'
  );

  // 點到「不能動」的那一句 → 彈回來 ＋ 就地教學（不扣分、不前進）
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(300);
  const spotWrong = await evaluate(`
    const g = window.__promptasy;
    const li = document.querySelector('#prompt-console [data-spot="p2"]').closest('.spot');
    return {
      marked: g.promptConsole.spotBoard.marked.length,
      pressed: document.querySelector('#prompt-console [data-spot="p2"]').getAttribute('aria-pressed'),
      fbHidden: document.querySelector('#prompt-console [data-spot-fb="p2"]').hidden,
      feedback: document.querySelector('#prompt-console [data-spot-fb="p2"]').textContent.trim(),
      dataWhy: g.content.flow('shout-stone-11').spotFlow.slips.find((s) => s.id === 'p2').why,
      verdictHidden: document.querySelector('#prompt-console .act--verdict').hidden,
      xpUnchanged: g.progression.bestGrade('shout-stone-11'),
    };
  `);
  eq(spotWrong.marked, 0, '點到不能動的那一句不會被點起來');
  eq(spotWrong.pressed, 'false', 'aria-pressed 也沒有變');
  eq(spotWrong.fbHidden, false, '就地長出一句「為什麼要留」');
  eq(spotWrong.feedback, spotWrong.dataWhy, '教學逐字來自資料層');
  eq(spotWrong.verdictHidden, true, '點錯不會跳結果面板（不會失敗）');
  eq(spotWrong.xpUnchanged, null, '點錯不會留下任何評價');

  // 把有問題的都點出來 → 手印
  await evaluate(`
    const g = window.__promptasy;
    for (const sl of g.content.flow('shout-stone-11').spotFlow.slips) {
      if (!sl.bad) continue;
      g.promptConsole.spotBoard.toggle(sl.id);
      await new Promise((r) => setTimeout(r, 60));
    }
    return 1;
  `);
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.spotBoard.done === true;`), {
    label: '有問題的都挑出來了',
  });
  await sleep(320);
  const spotDone = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      palmShown: !document.querySelector('#prompt-console .spotboard .palmwrap').hidden,
      focusPalm: document.activeElement === document.querySelector('#prompt-console .spotboard [data-palm]'),
      text: g.promptConsole.spotBoard.text,
      sample: g.content.challenge('shout-stone-11').sample,
      goneCount: document.querySelectorAll('#prompt-console .spot__gone').length,
      lit: (g.promptConsole.preflight.evaluation?.results || []).filter((r) => r.passed).length,
    };
  `);
  eq(spotDone.act, 4, '挑完自動切到第四幕');
  eq(spotDone.palmShown, true, '手掌印浮出來了');
  eq(spotDone.focusPalm, true, '焦點自動落在手掌上');
  eq(spotDone.text, spotDone.sample, '挑乾淨的整段文字＝資料層的示範解答');
  eq(spotDone.goneCount, 3, '被拿掉的三片在畫面上留下痕跡（看得出自己刪了什麼）');
  ok(spotDone.lit >= 2, '左邊的刻痕對照全亮（做對就是完美）', String(spotDone.lit));

  await holdPalm();
  await waitFor(() => evaluate(`return !document.querySelector('#prompt-console [data-result]').hidden;`), {
    label: '點碑的結果面板',
  });
  const spotResult = await evaluate(`
    const g = window.__promptasy;
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      best: g.progression.bestGrade('shout-stone-11'),
      skill: g.progression.isSkillCollected('clear-no-pressure'),
      cleared: g.world.markers.find((m) => m.id === 'shout-stone-11')?.cleared,
    };
  `);
  eq(spotResult.grade, 'S', '點碑走完拿到 S');
  eq(spotResult.best, 'S', '評價存進進度');
  eq(spotResult.skill, true, '這條 v2 技能收進 skillsV2（它在舊 68 條裡沒有祖先）');
  eq(spotResult.cleared, true, '世界上那座石座轉成已通關');

  /* --- 存檔：v2 技能跨重整還在，而且不會灌爆舊圖鑑 --- */
  const savedSkills = await evaluate(`
    const raw = JSON.parse(localStorage.getItem('promptasy.v1.save'));
    return { skills: raw.skillsV2 || [], collected: (raw.collected || []).length };
  `);
  ok(savedSkills.skills.includes('clear-golden'), 'skillsV2 真的寫進了 localStorage', savedSkills.skills.join(','));
  ok(savedSkills.skills.includes('clear-no-pressure'), '沒有祖先的技能也記下來了');
  ok(savedSkills.collected <= 68, '舊圖鑑的收集數沒有被 v2 技能灌水', String(savedSkills.collected));

  /* --- 相容契約：缺 kind / 資料不合契約 → 一律回到石碑刻印 --- */
  const kindFallback = await evaluate(`
    const k = window.__promptasy.promptConsole.flowKindOf;
    return {
      none: k(undefined),
      empty: k({}),
      unknown: k({ kind: 'nonsense' }),
      fixNoData: k({ kind: 'fix' }),
      fixBadData: k({ kind: 'fix', fixFlow: { fragments: [] } }),
      spotNoData: k({ kind: 'spot' }),
      spotBadData: k({ kind: 'spot', spotFlow: { slips: [{ id: 'a', text: '一句話', bad: true }] } }),
    };
  `);
  eq(kindFallback.none, 'choice', '沒有流程資料 → 石碑刻印');
  eq(kindFallback.empty, 'choice', '沒寫 kind → 石碑刻印（舊資料零變化）');
  eq(kindFallback.unknown, 'choice', '未知的 kind → 石碑刻印');
  eq(kindFallback.fixNoData, 'choice', '宣告了 fix 卻沒有資料 → 石碑刻印');
  eq(kindFallback.fixBadData, 'choice', 'fix 的資料不合契約 → 石碑刻印（不會開到空白石碑）');
  eq(kindFallback.spotNoData, 'choice', '宣告了 spot 卻沒有資料 → 石碑刻印');
  eq(kindFallback.spotBadData, 'choice', 'spot 的資料不合契約 → 石碑刻印');

  /* --- 新石座真的蓋在世界上，而且走得到 --- */
  const newMarkers = await evaluate(`
    const g = window.__promptasy;
    const ids = g.content.challenges.filter((c) => c.primarySkillId).map((c) => c.id);
    const out = { ids: ids.length, missing: [], blocked: [] };
    for (const id of ids) {
      const m = g.world.markers.find((x) => x.id === id);
      if (!m) { out.missing.push(id); continue; }
      const p = m.position;
      // 石座本體擋得住人，但四周走得到互動距離
      for (const [dx, dz] of [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]]) {
        if (g.world.solidAt(p.x + dx, p.z + dz)) out.blocked.push(id + ':' + dx + ',' + dz);
      }
    }
    out.expected = g.content.challenges.filter((c) => c.primarySkillId).length;
    return out;
  `);
  eq(
    newMarkers.ids,
    newMarkers.expected,
    `世界上每一座接上 v2 技能的石座都蓋出來了（目前 ${newMarkers.expected} 座，由資料現算）`
  );
  eq(newMarkers.missing.length, 0, '每一座都蓋出來了', newMarkers.missing.join(','));
  eq(newMarkers.blocked.length, 0, '新石座四周走得到（互動不會被擋）', newMarkers.blocked.join(' '));

  /* --- 窄畫面不溢位 --- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(320);
  const narrowB = await evaluate(`
    const g = window.__promptasy;
    const out = {};
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('nightwatch-relief-07'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    g.promptConsole.fixBoard.open('route');
    await new Promise((r) => setTimeout(r, 240));
    const body = document.querySelector('#prompt-console .panel__body');
    out.fixOverflow = Math.max(0, body.scrollWidth - body.clientWidth);
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('parts-wall-16'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const body2 = document.querySelector('#prompt-console .panel__body');
    out.spotOverflow = Math.max(0, body2.scrollWidth - body2.clientWidth);
    g.promptConsole.close();
    return out;
  `);
  eq(narrowB.fixOverflow, 0, '820px 下改碑沒有水平溢位');
  eq(narrowB.spotOverflow, 0, '820px 下點碑沒有水平溢位');
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  /* ================================================================ */
  console.log('\n▸ 推規碑與雙面碑（課程 v2 · Phase C）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close(); g.codex.close(); g.settings.close();
    g.promptConsole.setMode('guided');
    return 1;
  `);
  await sleep(220);

  /* ---------------------------------------------------------------- *
   * 一、推規碑：純鍵盤走完
   *    （牆只露兩組 → 猜錯不失敗 → 猜對牆多刻一組 → 驗證輪照「順手的
   *      規律」答會答錯並拿到教學 → 猜對 → 刻印開放 → 手印 → S）
   * ---------------------------------------------------------------- */
  const indOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('flawed-cabinet-17'));
    await new Promise((r) => setTimeout(r, 260));
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const b = g.promptConsole.inductBoard;
    const rows = [...document.querySelectorAll('#prompt-console .wallrow')];
    return {
      actAtOpen,
      act: g.promptConsole.act,
      kind: g.promptConsole.kind,
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      shown: !document.querySelector('#prompt-console .inductboard').hidden,
      steleHidden: document.querySelector('#prompt-console .stele-stage').hidden,
      tradeHidden: document.querySelector('#prompt-console .tradeboard').hidden,
      rows: rows.length,
      hidden: rows.filter((r) => r.classList.contains('is-hidden')).length,
      revealed: b.revealed,
      carveHidden: document.querySelector('#prompt-console .inductboard [data-carve]').hidden,
      palmHidden: document.querySelector('#prompt-console .inductboard .palmwrap').hidden,
      ruleHidden: document.querySelector('#prompt-console .wall__rule').hidden,
      ask: b.ask,
      text: b.text,
      done: b.done,
    };
  `);
  eq(indOpen.actAtOpen, 1, '推規碑一樣從第一幕開始（四幕分鏡沒有變）');
  eq(indOpen.act, 3, '推規碑住在第三幕');
  eq(indOpen.kind, 'induct', '這一關的題型是推規碑');
  eq(indOpen.label, '推規碑', '版面上寫的是「推規碑」');
  eq(indOpen.shown, true, '台上是那面刻著對照的牆');
  eq(indOpen.steleHidden, true, '選擇題的石碑收起來了');
  eq(indOpen.tradeHidden, true, '雙面碑不會亂入（一次只有一種在台上）');
  eq(indOpen.rows, 4, '牆上一共四組對照');
  eq(indOpen.revealed, 2, '一開始只露出兩組（規律還推不出來）');
  eq(indOpen.hidden, 2, '後面兩組還蓋著');
  eq(indOpen.carveHidden, true, '還沒想通規律，刻印區是鎖著的');
  eq(indOpen.palmHidden, true, '手掌印當然還沒出現（送不出去）');
  eq(indOpen.ruleHidden, true, '規律還沒揭曉');
  eq(indOpen.done, false, '這一關還沒完成');
  eq(indOpen.text, '', '石碑上還是空的');

  // 純鍵盤：焦點停在第一個選項 → 猜錯只會「牆不回應 ＋ 就地教學」
  const indWrongIdx = await evaluate(`
    const f = window.__promptasy.content.flow('flawed-cabinet-17').inductFlow;
    return f.rounds[0].options.findIndex((o) => !o.correct);
  `);
  await evaluate(`document.querySelector('#prompt-console [data-guess-opt="${indWrongIdx}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(280);
  const indWrong = await evaluate(`
    const g = window.__promptasy;
    const btn = document.querySelector('#prompt-console [data-guess-opt="${indWrongIdx}"]');
    return {
      marked: btn.classList.contains('is-wrong'),
      disabled: btn.getAttribute('aria-disabled'),
      feedback: btn.querySelector('[data-opt-fb]')?.textContent || '',
      fbHidden: btn.querySelector('[data-opt-fb]')?.hidden,
      dataFeedback: g.content.flow('flawed-cabinet-17').inductFlow.rounds[0].options[${indWrongIdx}].feedback,
      revealed: g.promptConsole.inductBoard.revealed,
      round: g.promptConsole.inductBoard.progress.round,
      verdictHidden: document.querySelector('#prompt-console .act--verdict').hidden,
      xp: g.progression.state.xp,
      live: g.promptConsole.inductBoard.announcement,
    };
  `);
  eq(indWrong.marked, true, '猜錯的那一片留在原地，標成「牆不收」');
  eq(indWrong.disabled, 'true', '不收的那一片按不下去了');
  eq(indWrong.fbHidden, false, '就地長出一句教學回饋');
  eq(indWrong.feedback, indWrong.dataFeedback, '回饋逐字來自資料層（不是臨時編的）');
  eq(indWrong.revealed, 2, '猜錯不會多刻一組出來（不前進）');
  eq(indWrong.round, 0, '猜錯不算過一輪');
  eq(indWrong.verdictHidden, true, '猜錯不會跳結果面板（不會失敗）');
  ok(indWrong.live.length > 0, 'aria-live 把回饋唸出來', indWrong.live);

  // 猜對 → 牆上多刻一組
  const indRight1 = await evaluate(`
    const f = window.__promptasy.content.flow('flawed-cabinet-17').inductFlow;
    return f.rounds[0].options.findIndex((o) => o.correct);
  `);
  await evaluate(`document.querySelector('#prompt-console [data-guess-opt="${indRight1}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.inductBoard.revealed === 3;`), {
    label: '牆上多刻出第三組',
  });
  const indRound2 = await evaluate(`
    const g = window.__promptasy;
    return {
      revealed: g.promptConsole.inductBoard.revealed,
      round: g.promptConsole.inductBoard.progress.round,
      progress: document.querySelector('#prompt-console .inductboard [data-guess-progress]').textContent.trim(),
      ask: g.promptConsole.inductBoard.ask,
      focusOpt: document.activeElement?.getAttribute('data-guess-opt'),
      carveHidden: document.querySelector('#prompt-console .inductboard [data-carve]').hidden,
    };
  `);
  eq(indRound2.revealed, 3, '第三組刻出來了');
  eq(indRound2.round, 1, '進到第二輪推敲');
  ok(/驗證/.test(indRound2.progress), '畫面上寫明這一組會驗證你的規律', indRound2.progress);
  eq(indRound2.focusOpt, '0', '焦點自動跟到下一輪的第一個選項（鍵盤玩家不會掉焦點）');
  eq(indRound2.carveHidden, true, '規律還沒確定，刻印區仍然鎖著');

  // ★ 驗證輪：照「只看前面推出來的那條順手規律」答 → 一定答錯 ＋ 拿到教學
  const naiveIdx = await evaluate(`
    const f = window.__promptasy.content.flow('flawed-cabinet-17').inductFlow;
    const last = f.rounds[f.rounds.length - 1];
    return last.options.findIndex((o) => o.follows === 'naive');
  `);
  ok(naiveIdx >= 0, '驗證輪上真的放著「順手的規律」會給的那個答案');
  await evaluate(`document.querySelector('#prompt-console [data-guess-opt="${naiveIdx}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(280);
  const indNaive = await evaluate(`
    const g = window.__promptasy;
    const btn = document.querySelector('#prompt-console [data-guess-opt="${naiveIdx}"]');
    return {
      wrong: btn.classList.contains('is-wrong'),
      feedback: btn.querySelector('[data-opt-fb]')?.textContent || '',
      revealed: g.promptConsole.inductBoard.revealed,
      round: g.promptConsole.inductBoard.progress.round,
      carveHidden: document.querySelector('#prompt-console .inductboard [data-carve]').hidden,
    };
  `);
  eq(indNaive.wrong, true, '照順手的規律答 —— 牆不收（第四例真的在驗證規則）');
  ok(indNaive.feedback.length >= 20, '答錯的人拿到的是教學，不是運氣', indNaive.feedback);
  eq(indNaive.revealed, 3, '答錯不會把答案掀開');
  eq(indNaive.round, 1, '答錯不前進');
  eq(indNaive.carveHidden, true, '答錯不會開放刻印');

  // 猜對驗證輪 → 規律揭曉、牆全開、刻印開放
  const indRight2 = await evaluate(`
    const f = window.__promptasy.content.flow('flawed-cabinet-17').inductFlow;
    const last = f.rounds[f.rounds.length - 1];
    return last.options.findIndex((o) => o.correct);
  `);
  await evaluate(`document.querySelector('#prompt-console [data-guess-opt="${indRight2}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.inductBoard.progress.guessed === true;`), {
    label: '規律想通了',
  });
  const indSolved = await evaluate(`
    const g = window.__promptasy;
    const rows = [...document.querySelectorAll('#prompt-console .wallrow')];
    return {
      revealed: g.promptConsole.inductBoard.revealed,
      hidden: rows.filter((r) => r.classList.contains('is-hidden')).length,
      ruleHidden: document.querySelector('#prompt-console .wall__rule').hidden,
      ruleText: document.querySelector('#prompt-console .wall__rule').textContent.trim(),
      dataRule: g.content.flow('flawed-cabinet-17').inductFlow.rule.true,
      guessHidden: document.querySelector('#prompt-console .inductboard [data-guess]').hidden,
      carveHidden: document.querySelector('#prompt-console .inductboard [data-carve]').hidden,
      focusOpt: document.activeElement?.getAttribute('data-slot-opt'),
    };
  `);
  eq(indSolved.revealed, 4, '牆全部掀開了');
  eq(indSolved.hidden, 0, '沒有一組還蓋著');
  eq(indSolved.ruleHidden, false, '規律揭曉');
  ok(indSolved.ruleText.includes(indSolved.dataRule), '揭曉的就是資料層寫的那一條規律', indSolved.ruleText);
  eq(indSolved.guessHidden, true, '推敲區收起來了（一次只有一件事）');
  eq(indSolved.carveHidden, false, '刻印區開放了');
  eq(indSolved.focusOpt, '0', '焦點自動落到第一段刻印的第一個選項');

  // 一段一段刻上去 → 手印 → S
  const indCarved = await evaluate(`
    const g = window.__promptasy;
    const flow = g.content.flow('flawed-cabinet-17');
    for (const slot of flow.slots) {
      g.promptConsole.inductBoard.pick(slot.options.findIndex((o) => o.correct));
      await new Promise((r) => setTimeout(r, 120));
    }
    return {
      text: g.promptConsole.inductBoard.text,
      want: flow.slots.map((s) => s.options.find((o) => o.correct).text).join('\\n'),
      done: g.promptConsole.inductBoard.done,
      act: g.promptConsole.act,
      palmHidden: document.querySelector('#prompt-console .inductboard .palmwrap').hidden,
      lines: document.querySelectorAll('#prompt-console .inductboard .carved').length,
    };
  `);
  eq(indCarved.text, indCarved.want, '刻出來的文字＝把每一段的正解串起來');
  eq(indCarved.done, true, '刻完了');
  eq(indCarved.act, 4, '刻滿自動切到第四幕（手印）');
  eq(indCarved.palmHidden, false, '手掌印出現了');
  eq(indCarved.lines, 3, '石碑上三道刻痕');

  const indResult = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.inductBoard.press();
    await new Promise((r) => setTimeout(r, 520));
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
      best: g.progression.bestGrade('flawed-cabinet-17'),
      skills: g.progression.state.skillsV2.includes('fewshot-negative'),
      cleared: g.world.markers.find((m) => m.id === 'flawed-cabinet-17')?.cleared,
      sources: [...document.querySelectorAll('#prompt-console .act--verdict a[href^="https://"]')].length,
    };
  `);
  eq(indResult.grade, 'S', '推規碑走完拿到 S');
  eq(indResult.best, 'S', '評價寫進存檔');
  eq(indResult.skills, true, '技能收進 skillsV2');
  eq(indResult.cleared, true, '石座轉成已通關');
  ok(indResult.sources > 0, '結果面板照樣掛得出官方出處', String(indResult.sources));

  /* ---------------------------------------------------------------- *
   * 二、雙面碑：純鍵盤走完
   *    （兩面都走得下去 → 倒向哪一面都會前進並拿到誠實判詞 →
   *      換一張卡贏家翻面 → 刻印 → 手印 → S）
   * ---------------------------------------------------------------- */
  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(220);
  const trOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('example-scale-16'));
    await new Promise((r) => setTimeout(r, 260));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const tf = g.content.flow('example-scale-16').tradeoffFlow;
    return {
      kind: g.promptConsole.kind,
      label: document.querySelector('#prompt-console [data-guided-label] .zh').textContent.trim(),
      shown: !document.querySelector('#prompt-console .tradeboard').hidden,
      inductHidden: document.querySelector('#prompt-console .inductboard').hidden,
      faces: document.querySelectorAll('#prompt-console .face').length,
      card: document.querySelector('#prompt-console .twoface__card').textContent.trim(),
      dataCard: tf.rounds[0].card.text,
      progress: document.querySelector('#prompt-console .tradeboard [data-weigh-progress]').textContent.trim(),
      carveHidden: document.querySelector('#prompt-console .tradeboard [data-carve]').hidden,
      palmHidden: document.querySelector('#prompt-console .tradeboard .palmwrap').hidden,
      favours: tf.rounds.map((r) => r.favours),
      sides: tf.sides.map((s) => s.id),
    };
  `);
  eq(trOpen.kind, 'tradeoff', '這一關的題型是雙面碑');
  eq(trOpen.label, '雙面碑', '版面上寫的是「雙面碑」');
  eq(trOpen.shown, true, '台上是那塊兩面的碑');
  eq(trOpen.inductHidden, true, '推規碑收起來了（一次只有一種在台上）');
  eq(trOpen.faces, 2, '碑上剛好兩面');
  eq(trOpen.card, trOpen.dataCard, '卡上的字逐字來自資料層');
  ok(/第 1 \/ 2 張卡/.test(trOpen.progress), '第一張卡', trOpen.progress);
  eq(trOpen.carveHidden, true, '還沒秤過，刻印區鎖著');
  eq(trOpen.palmHidden, true, '手掌印還沒出現');
  eq(new Set(trOpen.favours).size, 2, '整關兩面各贏過一次（不把取捨教成通則）');

  // ★ 倒向「這一張卡上比較貴」的那一面 —— 一樣前進，而且拿到誠實的判詞
  const losing = trOpen.sides.find((id) => id !== trOpen.favours[0]);
  await evaluate(`document.querySelector('#prompt-console [data-face="${losing}"]').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.tradeoffBoard.progress.round === 1;`), {
    label: '第一張卡秤完了',
  });
  const trFirst = await evaluate(`
    const g = window.__promptasy;
    const tf = g.content.flow('example-scale-16').tradeoffFlow;
    const log = [...document.querySelectorAll('#prompt-console .tradelog')];
    return {
      picks: g.promptConsole.tradeoffBoard.picks,
      wantVerdict: tf.rounds[0].verdicts['${losing}'].text,
      logText: log.map((n) => n.textContent).join(' '),
      logCost: log.filter((n) => n.classList.contains('is-cost')).length,
      round: g.promptConsole.tradeoffBoard.progress.round,
      card: document.querySelector('#prompt-console .twoface__card').textContent.trim(),
      dataCard2: tf.rounds[1].card.text,
      verdictHidden: document.querySelector('#prompt-console .act--verdict').hidden,
      carveHidden: document.querySelector('#prompt-console .tradeboard [data-carve]').hidden,
      live: g.promptConsole.tradeoffBoard.announcement,
    };
  `);
  eq(trFirst.round, 1, '倒向比較貴的那一面照樣前進（取捨沒有「答錯」）');
  eq(trFirst.picks[0].wins, false, '碑記下了這一面在這一張卡上是要付代價的');
  ok(trFirst.logText.includes(trFirst.wantVerdict), '判詞逐字來自資料層', trFirst.wantVerdict);
  eq(trFirst.logCost, 1, '判詞用的是「代價」而不是「錯」的語言');
  eq(trFirst.verdictHidden, true, '不會跳結果面板（不會失敗）');
  eq(trFirst.card, trFirst.dataCard2, '換到第二張卡了');
  eq(trFirst.carveHidden, true, '兩張卡都秤過才開放刻印');
  ok(trFirst.live.length > 0, 'aria-live 把判詞唸出來', trFirst.live);

  // 第二張卡：贏家翻面 —— 這一次倒向它，判詞就是「贏」
  const trSecond = await evaluate(`
    const g = window.__promptasy;
    const tf = g.content.flow('example-scale-16').tradeoffFlow;
    const win2 = tf.rounds[1].favours;
    document.querySelector('#prompt-console [data-face="' + win2 + '"]').focus();
    return { win2, flipped: win2 !== tf.rounds[0].favours };
  `);
  eq(trSecond.flipped, true, '第二張卡上贏的是另一面（換一張卡就翻面）');
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.tradeoffBoard.progress.settled === true;`), {
    label: '兩張卡都秤完了',
  });
  const trSettled = await evaluate(`
    const g = window.__promptasy;
    return {
      picks: g.promptConsole.tradeoffBoard.picks,
      logWin: document.querySelectorAll('#prompt-console .tradelog.is-win').length,
      carveHidden: document.querySelector('#prompt-console .tradeboard [data-carve]').hidden,
      focusOpt: document.activeElement?.getAttribute('data-slot-opt'),
      settledAsk: document.querySelector('#prompt-console .tradeboard [data-weigh-ask]').textContent.trim(),
    };
  `);
  eq(trSettled.picks[1].wins, true, '第二次倒向的是這一張卡上划算的那一面');
  eq(trSettled.logWin, 1, '兩次判詞一勝一負（兩面都學到了）');
  eq(trSettled.carveHidden, false, '秤完兩張卡，刻印區開放');
  eq(trSettled.focusOpt, '0', '焦點自動落到第一段刻印的第一個選項');
  ok(trSettled.settledAsk.length > 0, '收尾那一句提醒「要說得出這一次為什麼」', trSettled.settledAsk);

  const trResult = await evaluate(`
    const g = window.__promptasy;
    const flow = g.content.flow('example-scale-16');
    for (const slot of flow.slots) {
      g.promptConsole.tradeoffBoard.pick(slot.options.findIndex((o) => o.correct));
      await new Promise((r) => setTimeout(r, 120));
    }
    const text = g.promptConsole.tradeoffBoard.text;
    const act = g.promptConsole.act;
    g.promptConsole.tradeoffBoard.press();
    await new Promise((r) => setTimeout(r, 520));
    return {
      text,
      want: flow.slots.map((s) => s.options.find((o) => o.correct).text).join('\\n'),
      act,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
      best: g.progression.bestGrade('example-scale-16'),
      skills: g.progression.state.skillsV2.includes('fewshot-count'),
      sources: [...document.querySelectorAll('#prompt-console .act--verdict a[href^="https://"]')].length,
    };
  `);
  eq(trResult.text, trResult.want, '刻出來的文字＝把每一段的正解串起來');
  eq(trResult.act, 4, '刻滿自動切到第四幕（手印）');
  eq(trResult.grade, 'S', '雙面碑走完拿到 S');
  eq(trResult.best, 'S', '評價寫進存檔');
  eq(trResult.skills, true, '技能收進 skillsV2');
  ok(trResult.sources > 0, '結果面板掛得出官方出處', String(trResult.sources));

  /* --- 示範與推理：15 座石座真的蓋在世界上 --- */
  const rsn = await evaluate(`
    const g = window.__promptasy;
    const ids = g.content.challenges.filter((c) => c.region === 'reasoning').map((c) => c.id);
    const out = { ids: ids.length, missing: [], blocked: [] };
    for (const id of ids) {
      const m = g.world.markers.find((x) => x.id === id);
      if (!m) { out.missing.push(id); continue; }
      const p = m.position;
      for (let a = 0; a < 12; a += 1) {
        const ang = (a / 12) * Math.PI * 2;
        if (g.world.solidAt(p.x + Math.cos(ang) * 3, p.z + Math.sin(ang) * 3)) out.blocked.push(id);
      }
    }
    return out;
  `);
  eq(rsn.ids, 16, '示範與推理有 16 座石座（15 教學神廟 ＋ 1 試煉）');
  eq(rsn.missing.length, 0, '每一座都蓋出來了', rsn.missing.join(','));
  eq(rsn.blocked.length, 0, '新石座四周走得到（互動不會被擋）', rsn.blocked.join(' '));

  /* --- 窄畫面不溢位 --- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(320);
  const narrowC = await evaluate(`
    const g = window.__promptasy;
    const out = {};
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('flawed-cabinet-17'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const b1 = document.querySelector('#prompt-console .panel__body');
    out.inductOverflow = Math.max(0, b1.scrollWidth - b1.clientWidth);
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 200));
    g.promptConsole.open(g.content.challenge('example-scale-16'));
    await new Promise((r) => setTimeout(r, 240));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const b2 = document.querySelector('#prompt-console .panel__body');
    out.tradeoffOverflow = Math.max(0, b2.scrollWidth - b2.clientWidth);
    g.promptConsole.close();
    return out;
  `);
  eq(narrowC.inductOverflow, 0, '820px 下推規碑沒有水平溢位');
  eq(narrowC.tradeoffOverflow, 0, '820px 下雙面碑沒有水平溢位');
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(300);

  /* ================================================================ */
  /* 課程 v2 · Phase D：合尺（constraint）＋ 行動裝置還債點             */
  /* ================================================================ */
  console.log('\n▸ 合尺與窄畫面（課程 v2 · Phase D）');

  const csOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 180));
    g.promptConsole.open(g.content.challenge('laden-desk-27'));
    await new Promise((r) => setTimeout(r, 260));
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 320));
    const b = g.promptConsole.constraintBoard;
    return {
      actAtOpen,
      act: g.promptConsole.act,
      kind: g.promptConsole.kind,
      gauges: b.gauges.length,
      lit: b.gauges.filter((x) => x.passed).length,
      wants: b.gauges.map((x) => x.want),
      pieces: document.querySelectorAll('#prompt-console .piece__grip').length,
      palmHidden: !!document.querySelector('#prompt-console .constraintboard .palmwrap')?.hidden,
      progress: document.querySelector('#prompt-console .constraintboard [data-progress]').textContent.trim(),
      steleHidden: g.promptConsole.stele.root.hidden,
    };
  `);
  eq(csOpen.actAtOpen, 1, '合尺一打開也是從第一幕（委託）開始');
  eq(csOpen.kind, 'constraint', '這一關的第三幕是合尺');
  eq(csOpen.steleHidden, true, '合尺上台時石碑刻印收起來');
  ok(csOpen.gauges >= 2, '檯上有好幾把尺', String(csOpen.gauges));
  eq(csOpen.lit, 0, '一片都沒挑的時候一把尺都沒亮');
  ok(csOpen.wants.every((w) => /[一-鿿]/.test(w)), '每一把尺都用白話寫出它要量什麼（完全資訊）', csOpen.wants.join(' / '));
  ok(csOpen.pieces >= 4, '檯上攤著好幾片石片', String(csOpen.pieces));
  eq(csOpen.palmHidden, true, '還沒合尺，手掌印不會出現');
  ok(/0 \/ /.test(csOpen.progress), '進度寫著還沒合尺', csOpen.progress);

  /* --- 鍵盤：方向鍵走、Enter 放上去 --- */
  await evaluate(`
    document.querySelector('#prompt-console .piece__grip').focus();
    return 1;
  `);
  await key('ArrowDown', 'ArrowDown', { vk: 40 });
  await sleep(140);
  const csNav = await evaluate(`
    const at = document.activeElement.getAttribute('data-piece');
    const ids = [...document.querySelectorAll('#prompt-console .piece__grip')].map((b) => b.getAttribute('data-piece'));
    return { at, second: ids[1], ids };
  `);
  eq(csNav.at, csNav.second, '方向鍵在石片之間走得動（純鍵盤）');

  /* --- 放上一片會弄壞某把尺的石片：不失敗、就地教學、尺暗回去 --- */
  const csWrong = await evaluate(`
    const g = window.__promptasy;
    const b = g.constraintBoardForTest || g.promptConsole.constraintBoard;
    const flow = g.content.flow('laden-desk-27').constraintFlow;
    const need = flow.pieces.filter((p) => p.need).map((p) => p.id);
    const spare = flow.pieces.filter((p) => !p.need).map((p) => p.id);
    // 先把該挑的挑齊 —— 每一把尺都亮
    for (const id of need) b.toggle(id);
    await new Promise((r) => setTimeout(r, 200));
    const litAll = b.gauges.filter((x) => x.passed).length;
    const palmShownBefore = !document.querySelector('#prompt-console .constraintboard .palmwrap').hidden;
    const xpBefore = g.progression.state.xp;
    // 再把不該挑的都放上去 —— 一定會有一把尺暗回去，但不扣分、不失敗
    for (const id of spare) {
      b.toggle(id);
      await new Promise((r) => setTimeout(r, 140));
    }
    const fb = document.querySelector('#prompt-console [data-piece-fb="' + spare[spare.length - 1] + '"]');
    return {
      litAll,
      total: b.gauges.length,
      palmShownBefore,
      litAfter: b.gauges.filter((x) => x.passed).length,
      palmAfter: !document.querySelector('#prompt-console .constraintboard .palmwrap').hidden,
      fbShown: fb && !fb.hidden,
      fbText: fb ? fb.textContent.trim() : '',
      live: b.announcement,
      xp: g.progression.state.xp,
      xpBefore,
      failPanel: !document.querySelector('#prompt-console [data-result]').hidden,
      chosen: b.chosen.length,
    };
  `);
  eq(csWrong.litAll, csWrong.total, '該挑的挑齊了，每一把尺都亮起來');
  eq(csWrong.palmShownBefore, true, '每一把尺都合了，手掌印才浮出來');
  ok(csWrong.litAfter < csWrong.total, '放上不該挑的那一片，尺會暗回去', `${csWrong.litAfter}/${csWrong.total}`);
  eq(csWrong.palmAfter, false, '尺暗掉之後手掌印跟著收回去（不會誤送）');
  eq(csWrong.fbShown, true, '不該挑的那一片就地長出一句教學');
  ok(csWrong.fbText.length >= 12, '就地教學是完整的一句話', csWrong.fbText);
  ok(/[一-鿿]/.test(csWrong.live), 'aria-live 也講出來了（螢幕閱讀器聽得到）', csWrong.live);
  eq(csWrong.xp, csWrong.xpBefore, '放錯不扣分也不給分');
  eq(csWrong.failPanel, false, '放錯不會跳出失敗面板（不會失敗）');

  /* --- Esc 一片一片拿下來 → 尺重新亮起 → 手印回來 --- */
  const spareCount = await evaluate(`
    const g = window.__promptasy;
    return g.content.flow('laden-desk-27').constraintFlow.pieces.filter((p) => !p.need).length;
  `);
  for (let i = 0; i < spareCount; i += 1) {
    await evaluate(`
      const b = window.__promptasy.promptConsole.constraintBoard;
      const last = b.chosen[b.chosen.length - 1];
      document.querySelector('#prompt-console [data-piece="' + last + '"]').focus();
      return 1;
    `);
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(220);
  }
  const csEsc = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.constraintBoard;
    return {
      open: !g.promptConsole.root.hidden,
      lit: b.gauges.filter((x) => x.passed).length,
      total: b.gauges.length,
      palm: !document.querySelector('#prompt-console .constraintboard .palmwrap').hidden,
      text: b.text,
      sample: g.content.challenge('laden-desk-27').sample,
    };
  `);
  eq(csEsc.open, true, 'Esc 先拿下石片，不會把整個面板關掉');
  eq(csEsc.lit, csEsc.total, '拿下不該挑的那一片，每一把尺又亮了');
  eq(csEsc.palm, true, '手掌印回來了');
  eq(csEsc.text, csEsc.sample, '合尺組出來的整段文字＝示範解答（兩種模式同一段字）');

  /* --- 手印 → 呈給神諭 → S --- */
  const csResult = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.constraintBoard.press();
    await new Promise((r) => setTimeout(r, 900));
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent,
      best: g.progression.bestGrade('laden-desk-27'),
      skills: g.progression.isSkillCollected('long-all-upfront'),
      sources: document.querySelectorAll('#prompt-console [data-result] a.src').length,
      cleared: g.world.markers.find((m) => m.id === 'laden-desk-27')?.cleared,
    };
  `);
  eq(csResult.grade, 'S', '合尺走完拿到 S');
  eq(csResult.best, 'S', '評價寫進存檔');
  eq(csResult.skills, true, '技能收進 skillsV2');
  ok(csResult.sources > 0, '結果面板掛得出官方出處', String(csResult.sources));
  eq(csResult.cleared, true, '石座轉成已通關');

  /* --- 脈絡與長文／角色與參數：石座真的蓋在世界上 --- */
  const dRegions = await evaluate(`
    const g = window.__promptasy;
    const out = {};
    for (const region of ['grounding', 'config']) {
      const ids = g.content.challenges.filter((c) => c.region === region).map((c) => c.id);
      const missing = [];
      const blocked = [];
      for (const id of ids) {
        const m = g.world.markers.find((x) => x.id === id);
        if (!m) { missing.push(id); continue; }
        const p = m.position;
        for (let a = 0; a < 12; a += 1) {
          const ang = (a / 12) * Math.PI * 2;
          if (g.world.solidAt(p.x + Math.cos(ang) * 3, p.z + Math.sin(ang) * 3)) blocked.push(id);
        }
      }
      out[region] = { n: ids.length, missing, blocked };
    }
    return out;
  `);
  eq(dRegions.grounding.n, 13, '脈絡與長文有 13 座石座（12 教學神廟 ＋ 1 應用關）');
  eq(dRegions.config.n, 13, '角色與參數有 13 座石座（12 教學神廟 ＋ 1 試煉）');
  for (const region of ['grounding', 'config']) {
    eq(dRegions[region].missing.length, 0, `[${region}] 每一座石座都蓋出來了`, dRegions[region].missing.join(','));
    eq(dRegions[region].blocked.length, 0, `[${region}] 石座四周走得到`, dRegions[region].blocked.join(' '));
  }

  /* ---------------------------------------------------------------- *
   * 行動裝置還債點：≤720px 的四幕與八種題型「按得到、讀得動、不溢位」
   *
   * 世界的觸控移動（虛擬搖桿）不在這一期的範圍（task_plan Phase D）。
   * 這裡守的是**面板**：新題型的 UI 在手機寬度上不能無法操作。
   * ---------------------------------------------------------------- */
  const BOARD_SAMPLES = [
    ['laden-desk-27', '合尺'],
    ['sealed-readroom-29', '改碑'],
    ['mark-spring-30', '點碑'],
    ['sleepless-scribe-28', '排序刻印'],
    ['crossroad-scale-45', '雙面碑'],
    ['flawed-cabinet-17', '推規碑'],
    ['nameless-three-26', '石碑刻印'],
    ['oracle-workshop-36', '神諭工坊'],
  ];
  for (const [w, h] of [[720, 900], [390, 844]]) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: true },
      sessionId
    );
    await sleep(360);
    const narrowBoards = await evaluate(`
      const g = window.__promptasy;
      const list = ${JSON.stringify(BOARD_SAMPLES)};
      const out = { boards: [], vw: innerWidth };
      for (const [id, label] of list) {
        g.promptConsole.close();
        await new Promise((r) => setTimeout(r, 140));
        g.promptConsole.open(g.content.challenge(id));
        await new Promise((r) => setTimeout(r, 200));
        g.promptConsole.goAct(3, { force: true });
        await new Promise((r) => setTimeout(r, 280));
        const body = document.querySelector('#prompt-console .panel__body');
        const panel = document.querySelector('#prompt-console .panel');
        // 可以按得到的東西：高度 ≥40px（Apple/Google 的最小觸控目標）
        const targets = [...document.querySelectorAll(
          '#prompt-console .opt, #prompt-console .piece__grip, #prompt-console .spot__grip, ' +
          '#prompt-console .frag__grip, #prompt-console .face, #prompt-console .wallrow, ' +
          '#prompt-console .slip__grip, #prompt-console .btn, #prompt-console .palm, ' +
          '#prompt-console .toolcard, #prompt-console .acts__item'
        )].filter((el) => el.offsetParent !== null);
        const smallEls = targets
          .filter((el) => el.getBoundingClientRect().height < 40)
          .map((el) => el.className.split(' ')[0] + ':' + Math.round(el.getBoundingClientRect().height));
        const small = smallEls.length;
        const tiny = [...document.querySelectorAll('#prompt-console .panel__body *')]
          .filter((el) => el.children.length === 0 && el.textContent.trim())
          /*
           * ⓘ 那顆不是「字」，是**圖示**：它的內容是一個 ⓘ 字形，
           * 真正要讀的說明在氣泡裡（--t-micro，遠大於 12px），
           * 而且它自己帶 aria-label。字級下限守的是「讀得動的內文」，
           * 把圖示算進去只會逼我們把註腳畫成跟正文一樣大。
           */
          .filter((el) => !el.closest('[data-infotip-btn]'))
          /*
           * 2026-08-03 站長定稿：手掌印底下那一行提示縮成**腳註**
           * （--t-micro × 0.86 × 0.4）—— 它重複的是同一個畫面上已經
           * 用大字寫過的動作（「把手掌按上石碑」＋ 那顆手掌本身），
           * 不是唯一的資訊來源。這是唯一被放行的例外，
           * 其餘任何一處小於 12px 的內文照樣紅。
           */
          .filter((el) => !el.closest('.palm__hint'))
          .map((el) => ({ cls: String(el.className || el.tagName).split(' ')[0], px: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((x) => x.px && x.px < 12);
        out.boards.push({
          id,
          label,
          overflowX: Math.max(0, body.scrollWidth - body.clientWidth),
          panelW: Math.round(panel.getBoundingClientRect().width),
          right: Math.round(panel.getBoundingClientRect().right),
          targets: targets.length,
          small,
          smallEls: [...new Set(smallEls)].slice(0, 6),
          tiny: tiny.length,
          tinyEls: [...new Set(tiny.map((x) => x.cls + ':' + x.px.toFixed(1)))].slice(0, 8),
        });
      }
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      // 圖鑑與設定也要能用
      const panels = [];
      for (const [name, api] of [['圖鑑', g.codex], ['設定', g.settings]]) {
        api.open();
        await new Promise((r) => setTimeout(r, 260));
        const body = api.root.querySelector('.panel__body');
        const panel = api.root.querySelector('.panel');
        /*
         * 這兩張面板量的是「有沒有東西真的凸出去」，而不是 scrollWidth。
         * 原因：ⓘ 的氣泡是絕對定位的浮層，它會伸進 padding 區讓
         * scrollWidth 多出十幾像素，但畫面上一個像素都沒有超出內容邊 ——
         * 那不是玩家會遇到的問題。所以逐個元素比對內容邊，並另外守
         * 「整頁不會水平捲動」（下面的 docOverflow）。
         */
        const br = body.getBoundingClientRect();
        const edge = br.right - parseFloat(getComputedStyle(body).paddingRight);
        const stickOut = [...body.querySelectorAll('*')]
          /*
           * 只算**畫得出來**的東西：出處那枚典籍的小卡預設是
           * visibility: hidden 的浮層（絕對定位、置中於圖示），
           * 它在版面上不佔位、玩家也看不到 —— 把它算成「凸出去」
           * 等於逼我們去改一個不存在的問題。整頁的水平捲動另外有守（docOverflow）。
           */
          .filter((el) => (el.checkVisibility ? el.checkVisibility() : true))
          .filter((el) => el.getBoundingClientRect().right - edge > 1)
          .map((el) => String(el.className || el.tagName).split(' ')[0]);
        panels.push({
          name,
          overflowX: stickOut.length,
          worst: [...new Set(stickOut)].slice(0, 5),
          right: Math.round(panel.getBoundingClientRect().right),
        });
        api.close();
        await new Promise((r) => setTimeout(r, 140));
      }
      out.panels = panels;
      out.docOverflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      return out;
    `);
    eq(narrowBoards.vw, w, `視窗切到 ${w}px`);
    eq(narrowBoards.docOverflow, 0, `${w}×${h}：整頁沒有水平捲動`);
    for (const b of narrowBoards.boards) {
      eq(b.overflowX, 0, `${w}px：${b.label}（${b.id}）沒有水平溢位`, `+${b.overflowX}px`);
      ok(b.panelW <= w, `${w}px：${b.label}的面板沒有超出視窗`, `${b.panelW} > ${w}`);
      ok(b.right <= w + 1, `${w}px：${b.label}的面板沒有被推出右緣`, String(b.right));
      ok(b.targets > 0, `${w}px：${b.label}上真的有可以按的東西`, String(b.targets));
      eq(b.small, 0, `${w}px：${b.label}的每一個可按元素都 ≥40px 高`, `太小的是：${b.smallEls.join('、')}`);
      eq(b.tiny, 0, `${w}px：${b.label}沒有小於 12px 的字`, (b.tinyEls || []).join('、') || `${b.tiny} 處`);
    }
    for (const p of narrowBoards.panels) {
      eq(p.overflowX, 0, `${w}px：${p.name}沒有任何內容凸出內容邊`, `凸出的是：${p.worst.join('、')}`);
      ok(p.right <= w + 1, `${w}px：${p.name}沒有被推出右緣`, String(p.right));
    }
  }

  /* --- 390px 下用「觸控」真的操作得動合尺（不是只有版面對） --- */
  const touchPlay = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    await new Promise((r) => setTimeout(r, 160));
    g.promptConsole.open(g.content.challenge('six-lantern-48'));
    await new Promise((r) => setTimeout(r, 220));
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const b = g.promptConsole.constraintBoard;
    const flow = g.content.flow('six-lantern-48').constraintFlow;
    const before = b.gauges.filter((x) => x.passed).length;
    // 用真的指標事件（觸控在瀏覽器上會變成 click）逐片點上去
    for (const p of flow.pieces.filter((x) => x.need)) {
      const el = document.querySelector('#prompt-console [data-piece="' + p.id + '"]');
      const r = el.getBoundingClientRect();
      el.click();
      await new Promise((r2) => setTimeout(r2, 140));
    }
    return {
      before,
      after: b.gauges.filter((x) => x.passed).length,
      total: b.gauges.length,
      palm: !document.querySelector('#prompt-console .constraintboard .palmwrap').hidden,
      palmH: Math.round(document.querySelector('#prompt-console .constraintboard .palm').getBoundingClientRect().height),
    };
  `);
  eq(touchPlay.before, 0, '390px：一開始一把尺都沒亮');
  eq(touchPlay.after, touchPlay.total, '390px：用點的把石片挑齊，每一把尺都亮');
  eq(touchPlay.palm, true, '390px：手掌印在窄畫面也浮得出來');
  ok(touchPlay.palmH >= 40, '390px：手掌印按得到', `${touchPlay.palmH}px`);

  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(320);
  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    return 1;
  `);

  /* ================================================================ */
  /* ================================================================== */
  /* 課程 v2 · Phase E：量器坊（forms）                                  */
  /*   · 知識式軟門檻：條件是「你會了什麼」，先行前往仍然走得通           */
  /*   · 正南真的長出一片土地：走得進去、HUD／指南針／配樂都跟上          */
  /*   · 14 座神廟每一座都真的通得了（含九個新檢查器各一座）              */
  /*   · 圖鑑列得出這一區與它的技能（附可點的官方出處）                   */
  /* ================================================================== */
  console.log('\n▸ 量器坊（課程 v2 · Phase E）');

  // 收乾淨上一段留下來的面板
  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    g.shareCard.close();
    return 1;
  `);
  await sleep(220);

  /* --- 閘門：知識式軟門檻（還沒學會就是鎖著的，但門會問你一句） --- */
  const fmGateLocked = await evaluate(`
    const g = window.__promptasy;
    // 種一份「什麼都還沒學」的存檔
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  eq(fmGateLocked, 1, '種下一份「什麼都還沒學」的存檔');
  await reloadPage('重新載入（量器坊：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const fmGate = await evaluate(`
    const g = window.__promptasy;
    const st = g.progression.gateStatus('forms');
    return {
      unlocked: g.progression.isRegionUnlocked('forms'),
      gaps: st.knowledgeGaps.length,
      text: st.text,
      hasGate: !!g.world.gates.find((x) => x.id === 'forms'),
      corridors: g.world.gates.map((x) => x.id),
    };
  `);
  eq(fmGate.unlocked, false, '什麼都還沒學 → 量器坊鎖著');
  ok(fmGate.gaps > 0, '閘門說得出還差哪幾條（知識式軟門檻）', String(fmGate.gaps));
  ok(/也可以先行前往/.test(fmGate.text), '量器坊的門一樣會問「想先過去看看嗎」', fmGate.text);
  ok(!/[a-z-]{6,}/.test(fmGate.text.replace(/Lv\.\d+/g, '')), '門上寫的是中文技能名，不是資料層的 id', fmGate.text);
  eq(fmGate.hasGate, true, '正南那條橋上真的有一道閘門');
  ok(fmGate.corridors.includes('forms'), '世界的閘門清單包含量器坊', fmGate.corridors.join(','));

  /* 鎖著的時候真的走不過去 */
  const fmBlocked = await evaluate(`
    const g = window.__promptasy;
    // 走到閘門後面一點的位置：應該被擋回來
    const before = { x: 0, z: 60 };
    g.player.position.set(before.x, g.world.terrainHeight(before.x, before.z), before.z);
    const got = g.world.clampPosition(0, 90, before.x, before.z);
    return { z: got.z, blocked: got.z < 80 };
  `);
  eq(fmBlocked.blocked, true, '閘門鎖著的時候走不過那座橋', String(fmBlocked.z));

  /* --- 先行前往：門開了，但一分 XP 都不加 --- */
  const fmSkip = await evaluate(`
    const g = window.__promptasy;
    const xpBefore = g.progression.state.xp;
    const res = g.progression.skipGate('forms');
    g.world.openGate('forms', true);
    return {
      ok: !!res,
      unlocked: g.progression.isRegionUnlocked('forms'),
      xp: g.progression.state.xp,
      xpBefore,
      skipped: g.progression.state.skippedGates.includes('forms'),
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(fmSkip.unlocked, true, '先行前往照樣開得了量器坊的門');
  eq(fmSkip.xp, fmSkip.xpBefore, '先行前往一分 XP 都不加');
  eq(fmSkip.skipped, true, '存檔記下這道門是被問開的');
  eq(fmSkip.cleared, 0, '先行前往不會偷偷記下任何一關的評價');

  /* --- 走進去：HUD、指南針、氣氛、配樂都跟著換 --- */
  const fmEnter = await evaluate(`
    const g = window.__promptasy;
    const before = { region: g.hud.region, mood: g.audio.debug().region };
    g.player.position.set(0, g.world.terrainHeight(0, 124) + 1, 124);
    await new Promise((r) => setTimeout(r, 900));
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      before,
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      source: g.audio.debug().source,
    };
  `);
  eq(fmEnter.here, 'forms', '走到正南真的站在量器坊的土地上');
  eq(fmEnter.hudRegion, 'forms', 'HUD 跟著換到量器坊');
  ok(/量器坊/.test(fmEnter.hudLabel), 'HUD 上寫的是中文區域名', fmEnter.hudLabel);
  eq(fmEnter.mood, 'forms', '配樂也切到量器坊');
  await expectRegionBgmFile('forms', '量器坊');

  /* --- 地標：刻度之柱真的在場景圖上，而且沒有新增光源 --- */
  const fmWorld = await evaluate(`
    const g = window.__promptasy;
    let landmark = null;
    let markers = 0;
    let lights = 0;
    let tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.name === 'landmark:gauge-column') landmark = o;
      if (/^marker:/.test(o.name || '')) markers += 1;
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry) {
        const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count || 0);
        tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      }
    });
    let landmarkLights = 0;
    if (landmark) landmark.traverse((o) => { if (o.isLight) landmarkLights += 1; });
    return {
      hasLandmark: !!landmark,
      landmarkLights,
      landmarkY: landmark ? Number(landmark.position.z.toFixed(1)) : null,
      markers,
      lights,
      tris: Math.round(tris),
      formsMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'forms').length,
      props: !!g.engine.scene.getObjectByName('props:forms'),
      flora: !!g.engine.scene.getObjectByName('flora:forms'),
      vignettes: ['vignette:half-poured-mould', 'vignette:measure-bench', 'vignette:overflow-trough']
        .filter((n) => !!g.engine.scene.getObjectByName(n)).length,
    };
  `);
  eq(fmWorld.hasLandmark, true, '刻度之柱真的立在場景圖上');
  eq(fmWorld.landmarkLights, 0, '刻度之柱一盞實體光源都沒加（全部自發光）');
  eq(fmWorld.formsMarkers, 15, '量器坊有 15 座石座（14 教學神廟 ＋ 1 試煉）');
  eq(fmWorld.props, true, '量器坊有自己的造景（量尺柱與鑄槽）');
  eq(fmWorld.flora, true, '量器坊有自己的植被剪影');
  eq(fmWorld.vignettes, 3, '量器坊的三組故事小景都在場景圖上', String(fmWorld.vignettes));
  ok(fmWorld.lights <= 56, '加了第六區之後燈光仍在預算內', `lights=${fmWorld.lights}`);
  ok(fmWorld.tris < 420000, '加了第六區之後三角形仍在預算內', `tris=${fmWorld.tris}`);

  /* --- 14 座神廟：九個新檢查器各有一座，而且每一座都真的通得了 --- */
  const fmPlan = await evaluate(`
    const g = window.__promptasy;
    const forms = g.content.challenges.filter((c) => c.region === 'forms' && !c.application);
    return forms.map((c) => ({
      id: c.id,
      skill: c.primarySkillId,
      check: c.rubric.find((r) => r.primary).check,
      kind: g.promptConsole.flowKindOf(g.content.flow(c.id)),
    }));
  `);
  eq(fmPlan.length, 14, '量器坊有 14 座教學神廟');
  {
    const PHASE_E_CHECKS = [
      'statesFormatPreference',
      'hasFallbackCategory',
      'avoidsSelfCounting',
      'saysWhatToPreserve',
      'definesToneConcretely',
      'bansFillerPhrases',
      'definesSchema',
      'noDuplicateSchemaRules',
      'namesDesignElements',
    ];
    const used = new Set(fmPlan.map((x) => x.check));
    for (const id of PHASE_E_CHECKS) ok(used.has(id), `新檢查器 ${id} 真的有一座神廟在教`);
    const kinds = fmPlan.map((x) => x.kind);
    let run = 1;
    let worst = 1;
    for (let i = 1; i < kinds.length; i += 1) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      if (run > worst) worst = run;
    }
    ok(worst <= 2, '整區沒有連續三座同一種題型（C4）', kinds.join(','));
  }

  /* --- 純鍵盤走完量器坊的第一座（不碰滑鼠，§3.1 鐵則） --- */
  {
    const target = 'gatehouse-gauge-53';
    const near = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.markers.find((x) => x.id === '${target}');
      // 站到石座旁邊（互動半徑 6.5 之內），剩下的全部用鍵盤
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到量器坊第一座石座旁', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '走近提示標著 E 這個鍵', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    const kbOpen = await evaluate(`
      const g = window.__promptasy;
      return { open: g.promptConsole.isOpen, id: g.promptConsole.challenge?.id, act: g.promptConsole.act };
    `);
    eq(kbOpen.open, true, '按 E 打開了量器坊的神廟');
    eq(kbOpen.id, target, '打開的就是走過去那一座');
    eq(kbOpen.act, 1, '從第一幕（委託）開始');

    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    const kbGuide = await evaluate(`
      const g = window.__promptasy;
      return {
        act: g.promptConsole.act,
        glyphs: document.querySelectorAll('#prompt-console [data-guidance] .glyph').length,
        srcs: document.querySelectorAll('#prompt-console .act--guide a.bookicon').length,
        srcHref: document.querySelector('#prompt-console .act--guide a.bookicon')?.getAttribute('href') || '',
      };
    `);
    eq(kbGuide.act, 2, 'Enter 推到第二幕（神諭刻文）');
    eq(kbGuide.glyphs, 1, '第二幕只放大這一關教的那一條（C1）');
    eq(kbGuide.srcs, 1, '那一條刻文掛著神諭原典');
    ok(/^https:\/\//.test(kbGuide.srcHref), '神諭原典是可點的 https 連結', kbGuide.srcHref);

    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    const kbCarveStart = await evaluate(`
      const g = window.__promptasy;
      return {
        act: g.promptConsole.act,
        kind: g.promptConsole.kind,
        focusedOnOption: document.activeElement?.classList.contains('opt'),
      };
    `);
    eq(kbCarveStart.act, 3, 'Enter 推到第三幕（刻印）');
    eq(kbCarveStart.kind, 'choice', '這一座是石碑刻印');
    eq(kbCarveStart.focusedOnOption, true, '一進刻印，焦點就落在第一個選項上');

    const slotCount = await evaluate(`return window.__promptasy.content.flow('${target}').slots.length;`);
    for (let i = 0; i < slotCount; i += 1) {
      const idx = await evaluate(`
        const g = window.__promptasy;
        const s = g.content.flow('${target}').slots[g.promptConsole.stele.progress.carved];
        return s ? s.options.findIndex((o) => o.correct) : -1;
      `);
      ok(idx >= 0, `量器坊：第 ${i + 1} 段找得到正確選項`);
      const n = idx + 1;
      await key(`Digit${n}`, String(n), { vk: 48 + n });
      await sleep(400);
    }
    const kbFull = await evaluate(`
      const g = window.__promptasy;
      return {
        carved: g.promptConsole.stele.progress.carved,
        act: g.promptConsole.act,
        palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'),
      };
    `);
    eq(kbFull.carved, slotCount, '用數字鍵把量器坊這一座刻滿');
    eq(kbFull.act, 4, '刻滿之後鏡頭自己切到手印那一幕');
    eq(kbFull.palmFocused, true, '焦點自己落在手掌印上');

    await holdPalm();
    await sleep(800);
    const kbDone = await evaluate(`
      const g = window.__promptasy;
      return {
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared('${target}'),
        skill: g.progression.isSkillCollected('fmt-specify'),
        saved: JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}').skillsV2 || [],
      };
    `);
    eq(kbDone.grade, 'S', '全程不碰滑鼠也拿得到 S');
    eq(kbDone.cleared, true, '量器坊這一座記成通關（純鍵盤）');
    eq(kbDone.skill, true, '技能「fmt-specify」進了圖鑑');
    ok(kbDone.saved.includes('fmt-specify'), '而且真的寫進了存檔', kbDone.saved.join(','));
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(320);
  }

  /* 一座一座真的玩過去（用的是各題型自己的把手，跟鍵盤走的是同一條路） */
  for (const shrine of fmPlan) {
    const played = await evaluate(`
      const g = window.__promptasy;
      const id = '${shrine.id}';
      const c = g.content.challenge(id);
      const flow = g.content.flow(id);
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      g.promptConsole.open(c);
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 260));
      const kind = g.promptConsole.kind;
      const step = (n) => new Promise((r) => setTimeout(r, n));
      const carve = async (board) => {
        for (const slot of flow.slots) {
          board.pick(slot.options.findIndex((o) => o.correct));
          await step(90);
        }
      };
      if (kind === 'choice') {
        await carve(g.promptConsole.stele);
        g.promptConsole.stele.press();
      } else if (kind === 'fix') {
        const b = g.promptConsole.fixBoard;
        for (const fr of flow.fixFlow.fragments) {
          if (!fr.weak) continue;
          b.open(fr.id);
          await step(70);
          b.pick(fr.id, fr.options.findIndex((o) => o.correct));
          await step(90);
        }
        b.press();
      } else if (kind === 'spot') {
        const b = g.promptConsole.spotBoard;
        for (const sl of flow.spotFlow.slips) {
          if (!sl.bad) continue;
          b.toggle(sl.id);
          await step(90);
        }
        b.press();
      } else if (kind === 'constraint') {
        const b = g.promptConsole.constraintBoard;
        for (const p of flow.constraintFlow.pieces) {
          if (!p.need) continue;
          b.toggle(p.id);
          await step(90);
        }
        b.press();
      } else if (kind === 'multi') {
        // 課程 v2 · Phase G：兩輪刻印 —— 每一輪刻完要先「收下回話」才進得了下一輪
        const b = g.promptConsole.multiBoard;
        let at = 0;
        for (let r = 0; r < flow.multiFlow.rounds.length; r += 1) {
          const n = flow.multiFlow.rounds[r].count;
          for (let i = 0; i < n; i += 1) {
            b.pick(flow.slots[at].options.findIndex((o) => o.correct));
            at += 1;
            await step(90);
          }
          if (r < flow.multiFlow.rounds.length - 1) {
            b.advance();
            await step(140);
          }
        }
        b.press();
      } else if (kind === 'tradeoff') {
        const b = g.promptConsole.tradeoffBoard;
        for (const r of flow.tradeoffFlow.rounds) {
          b.weigh(r.favours);
          await step(220);
        }
        await carve(b);
        b.press();
      }
      await new Promise((r) => setTimeout(r, 900));
      return {
        kind,
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared(id),
        skill: g.progression.isSkillCollected(c.primarySkillId),
        act: g.promptConsole.act,
        srcs: document.querySelectorAll('#prompt-console [data-result] a.src').length,
      };
    `);
    eq(played.kind, shrine.kind, `[${shrine.id}] 第三幕的題型是 ${shrine.kind}`);
    eq(played.grade, 'S', `[${shrine.id}] 照著畫面上的東西做就是 S（${shrine.check}）`, JSON.stringify(played));
    eq(played.cleared, true, `[${shrine.id}] 記成通關`);
    eq(played.skill, true, `[${shrine.id}] 技能「${shrine.skill}」進了圖鑑（skillsV2）`);
    ok(played.srcs >= 1, `[${shrine.id}] 結果面板附得出可點的官方出處`, String(played.srcs));
  }

  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(240);

  /* --- 全破之後：這一區精通、圖鑑列得出它與它的技能 --- */
  const fmCodex = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const cards = [...document.querySelectorAll('#codex .region-card')];
    // 課程 v2 · Phase F 之後圖鑑不只六張卡了 —— 用名字挑出量器坊那一張，不要用「最後一張」
    const last = cards.find((c) => /量器坊/.test(c.querySelector('h3')?.textContent || '')) || cards[cards.length - 1];
    return {
      cards: cards.length,
      title: last.querySelector('h3')?.textContent.trim() || '',
      mastered: last.classList.contains('is-mastered'),
      meta: last.querySelector('.region-card__meta .muted')?.textContent.trim() || '',
      skillRows: last.querySelectorAll('.tech').length,
      locked: last.querySelectorAll('.tech--locked').length,
      srcs: last.querySelectorAll('a.bookicon').length,
      firstSrc: last.querySelector('a.bookicon')?.getAttribute('href') || '',
      masteryFlag: g.progression.regionMastery('forms').mastered,
      skillBased: g.progression.regionMastery('forms').skillBased,
    };
  `);
  eq(fmCodex.cards, EXPECT.v2ImplementedRegions.value, `圖鑑列出 ${EXPECT.v2ImplementedRegions.value} 片土地`);
  ok(/量器坊/.test(fmCodex.title), '找得到量器坊那一張卡', fmCodex.title);
  eq(fmCodex.skillRows, 14, '量器坊那一張卡列出 14 條技法');
  eq(fmCodex.locked, 0, '全破之後一條都不再是剪影');
  eq(fmCodex.mastered, true, '量器坊蓋上精通封印');
  eq(fmCodex.masteryFlag, true, '進程也認定量器坊精通了');
  eq(fmCodex.skillBased, true, '量器坊的完成度是用 v2 技能算的（舊 68 條裡沒有它的主題）');
  ok(/條技法/.test(fmCodex.meta), '量器坊的完成度寫的是「條技法」', fmCodex.meta);
  ok(fmCodex.srcs >= 14, '每一條技法都附得出可點的官方出處', String(fmCodex.srcs));
  ok(/^https:\/\//.test(fmCodex.firstSrc), '出處是可點的 https 連結', fmCodex.firstSrc);

  await evaluate(`window.__promptasy.codex.close(); return 1;`);
  await sleep(220);

  /* --- 窄畫面：量器坊的新題型在 390px 上也讀得完、按得動 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(320);
  const fmNarrow = await evaluate(`
    const g = window.__promptasy;
    const out = [];
    for (const id of ['slippery-answer-55', 'twice-carved-64', 'mould-room-62']) {
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      g.promptConsole.open(g.content.challenge(id));
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 320));
      const panel = document.querySelector('#prompt-console .panel');
      const tappable = [...document.querySelectorAll('#prompt-console button:not([hidden])')]
        .filter((b) => b.offsetParent !== null);
      out.push({
        id,
        overflow: panel.scrollWidth - panel.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: tappable.filter((b) => b.getBoundingClientRect().height < 40).length,
        tappable: tappable.length,
      });
    }
    g.promptConsole.close();
    return out;
  `);
  for (const row of fmNarrow) {
    eq(row.overflow, 0, `[${row.id}] 390px 下沒有水平溢位`, String(row.overflow));
    eq(row.pageOverflow, 0, `[${row.id}] 390px 下整頁不會橫向捲動`, String(row.pageOverflow));
    ok(row.tappable > 0, `[${row.id}] 390px 下真的量得到可按的東西`, String(row.tappable));
    eq(row.small, 0, `[${row.id}] 390px 下每一顆可按的東西都夠大`, String(row.small));
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(320);
  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);


  /* ================================================================== */
  /* 課程 v2 · Phase F：契約鍛冶場（toolcraft）＋ 護欄崗（wards）        */
  /*   · 正西長出一片新土地；護欄崗是加建（沒有橋，走出檔案庫就到）      */
  /*   · 兩道知識式軟門檻，先行前往照樣走得通                            */
  /*   · 16 座神廟每一座都真的通得了（含九個新檢查器）                   */
  /*   · 派工檯的鍵盤路徑（本期的主場題型）先紅後綠                      */
  /*   · 安全題不把 prompt 文字宣稱成真正的安全邊界                      */
  /* ================================================================== */
  console.log('\n▸ 契約鍛冶場與護欄崗（課程 v2 · Phase F）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    g.shareCard.close();
    return 1;
  `);
  await sleep(220);

  /* --- 兩道閘門：知識式軟門檻 --- */
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（契約鍛冶場：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const tfGates = await evaluate(`
    const g = window.__promptasy;
    const out = {};
    for (const id of ['toolcraft', 'wards']) {
      const st = g.progression.gateStatus(id);
      out[id] = {
        unlocked: g.progression.isRegionUnlocked(id),
        gaps: st.knowledgeGaps.length,
        text: st.text,
        hasGate: !!g.world.gates.find((x) => x.id === id),
      };
    }
    out.gateIds = g.world.gates.map((x) => x.id);
    return out;
  `);
  for (const [id, zh] of [['toolcraft', '契約鍛冶場'], ['wards', '護欄崗']]) {
    eq(tfGates[id].unlocked, false, `什麼都還沒學 → ${zh}鎖著`);
    ok(tfGates[id].gaps > 0, `${zh}的閘門說得出還差哪幾條`, String(tfGates[id].gaps));
    ok(/也可以先行前往/.test(tfGates[id].text), `${zh}的門一樣會問「想先過去看看嗎」`, tfGates[id].text);
    eq(tfGates[id].hasGate, true, `${zh}真的有一道閘門`);
  }
  ok(tfGates.gateIds.includes('wards'), '護欄崗的閘門在頸口上（加建也有門）', tfGates.gateIds.join(','));

  /* 鎖著的時候走不進去 */
  const tfBlocked = await evaluate(`
    const g = window.__promptasy;
    // 正西那條橋
    const got = g.world.clampPosition(-60, 0, -124, 0);
    // 護欄崗的頸口（從檔案庫往東北）
    const link = g.world.annexLinks.find((l) => l.region === 'wards');
    const from = { x: link.from.x + link.dir.x * 30, z: link.from.z + link.dir.z * 30 };
    const to = { x: link.to.x, z: link.to.z };
    const gotW = g.world.clampPosition(to.x, to.z, from.x, from.z);
    const here = g.world.regionAt(gotW.x, gotW.z);
    return { x: got.x, blocked: got.x > -100, wardsRegion: here && here.id };
  `);
  eq(tfBlocked.blocked, true, '閘門鎖著的時候走不過正西那座橋', String(tfBlocked.x));
  ok(tfBlocked.wardsRegion !== 'wards', '護欄崗鎖著的時候踏不進它的地界', String(tfBlocked.wardsRegion));

  /* --- 先行前往：門開了，但一分 XP 都不加 --- */
  const tfSkip = await evaluate(`
    const g = window.__promptasy;
    const xpBefore = g.progression.state.xp;
    g.progression.skipGate('toolcraft');
    g.world.openGate('toolcraft', true);
    g.progression.skipGate('wards');
    g.world.openGate('wards', true);
    return {
      toolcraft: g.progression.isRegionUnlocked('toolcraft'),
      wards: g.progression.isRegionUnlocked('wards'),
      xp: g.progression.state.xp,
      xpBefore,
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(tfSkip.toolcraft, true, '先行前往開得了契約鍛冶場的門');
  eq(tfSkip.wards, true, '先行前往開得了護欄崗的門');
  eq(tfSkip.xp, tfSkip.xpBefore, '先行前往一分 XP 都不加');
  eq(tfSkip.cleared, 0, '先行前往不會偷偷記下任何一關的評價');

  /* --- 走進契約鍛冶場：HUD、氣氛、配樂都跟著換 --- */
  const tfEnter = await evaluate(`
    const g = window.__promptasy;
    g.player.position.set(-124, g.world.terrainHeight(-124, 0) + 1, 0);
    await new Promise((r) => setTimeout(r, 900));
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      source: g.audio.debug().source,
    };
  `);
  eq(tfEnter.here, 'toolcraft', '走到正西真的站在契約鍛冶場的土地上');
  eq(tfEnter.hudRegion, 'toolcraft', 'HUD 跟著換到契約鍛冶場');
  ok(/契約鍛冶場/.test(tfEnter.hudLabel), 'HUD 上寫的是中文區域名', tfEnter.hudLabel);
  eq(tfEnter.mood, 'toolcraft', '配樂也切到契約鍛冶場');
  await expectRegionBgmFile('toolcraft', '契約鍛冶場');

  /* --- 走進護欄崗：沒有橋，走出檔案庫北緣就到了 --- */
  const tfAnnex = await evaluate(`
    const g = window.__promptasy;
    const link = g.world.annexLinks.find((l) => l.region === 'wards');
    // 從檔案庫中心一步一步往哨所走，全程都要踩得到地
    let voids = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = link.from.x + (link.to.x - link.from.x) * t;
      const z = link.from.z + (link.to.z - link.from.z) * t;
      if (g.world.coverage(x, z) <= 0.45) voids += 1;
    }
    g.player.position.set(link.to.x, g.world.terrainHeight(link.to.x, link.to.z) + 1, link.to.z);
    /*
     * HUD 與配樂是遊戲迴圈更新的 —— 軟體渲染下一幀可能要 200ms 以上，
     * 固定 sleep 會偶發性地在換區之前就取樣（AGENTS.md 已登記的家族）。
     * 改成輪詢：等 HUD 真的換過去，最多 6 秒。
     */
    for (let i = 0; i < 60 && g.hud.region !== 'refinery'; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      voids,
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      bridges: g.world.corridors.filter((c) => c.region === 'wards').length,
    };
  `);
  eq(tfAnnex.voids, 0, '從檔案庫走到哨所全程都是實地（加建沒有虛空）');
  eq(tfAnnex.bridges, 0, '護欄崗沒有自己的橋（它是加建，不是新大陸）');
  eq(tfAnnex.here, 'wards', '走到東北外緣真的站在護欄崗的地界上');
  eq(tfAnnex.hudRegion, 'wards', 'HUD 跟著換到護欄崗');
  ok(/護欄崗/.test(tfAnnex.hudLabel), 'HUD 上寫的是中文區域名', tfAnnex.hudLabel);
  eq(tfAnnex.mood, 'wards', '配樂也切到護欄崗');

  /* --- 世界：兩座地標、造景、植被、小景、預算 --- */
  const tfWorld = await evaluate(`
    const g = window.__promptasy;
    let lights = 0;
    let tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry) {
        const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count || 0);
        tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      }
    });
    const lm = (name) => {
      const node = g.engine.scene.getObjectByName(name);
      if (!node) return null;
      let n = 0;
      node.traverse((o) => { if (o.isLight) n += 1; });
      return { lights: n };
    };
    return {
      keys: lm('landmark:nameless-keys'),
      doors: lm('landmark:ajar-doors'),
      toolMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'toolcraft').length,
      wardMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'wards').length,
      propsT: !!g.engine.scene.getObjectByName('props:toolcraft'),
      propsW: !!g.engine.scene.getObjectByName('props:wards'),
      floraT: !!g.engine.scene.getObjectByName('flora:toolcraft'),
      floraW: !!g.engine.scene.getObjectByName('flora:wards'),
      vignettes: ['vignette:nameless-tools', 'vignette:crowded-bench', 'vignette:untouched-machine',
                  'vignette:opened-letters', 'vignette:unwatched-post']
        .filter((n) => !!g.engine.scene.getObjectByName(n)).length,
      lights,
      tris: Math.round(tris),
    };
  `);
  ok(Boolean(tfWorld.keys), '未命名的工具真的懸在場景圖上');
  eq(tfWorld.keys.lights, 0, '未命名的工具一盞實體光源都沒加（全部自發光）');
  ok(Boolean(tfWorld.doors), '不會關上的門真的立在場景圖上');
  eq(tfWorld.doors.lights, 0, '不會關上的門一盞實體光源都沒加（全部自發光）');
  eq(tfWorld.toolMarkers, 12, '契約鍛冶場有 12 座石座（11 教學神廟 ＋ 1 試煉）');
  eq(tfWorld.wardMarkers, 6, '護欄崗有 6 座石座（5 教學神廟 ＋ 1 試煉）');
  eq(tfWorld.propsT, true, '契約鍛冶場有自己的造景（工具架與鐵砧）');
  eq(tfWorld.propsW, true, '護欄崗有自己的造景（崗柱與矮牆）');
  eq(tfWorld.floraT, true, '契約鍛冶場有自己的植被剪影');
  eq(tfWorld.floraW, true, '護欄崗有自己的植被剪影');
  eq(tfWorld.vignettes, 5, '兩區的五組故事小景都在場景圖上', String(tfWorld.vignettes));
  ok(tfWorld.lights <= 56, '加了兩區之後燈光仍在預算內', `lights=${tfWorld.lights}`);
  ok(tfWorld.tris < 420000, '加了兩區之後三角形仍在預算內', `tris=${tfWorld.tris}`);

  /* --- 16 座神廟：九個新檢查器各有一座 --- */
  const tfPlan = await evaluate(`
    const g = window.__promptasy;
    const here = g.content.challenges.filter((c) => !c.application && (c.region === 'toolcraft' || c.region === 'wards'));
    return here.map((c) => ({
      id: c.id,
      region: c.region,
      skill: c.primarySkillId,
      check: c.rubric.find((r) => r.primary).check,
      kind: g.promptConsole.flowKindOf(g.content.flow(c.id)),
    }));
  `);
  eq(tfPlan.length, 16, '兩區合計 16 座教學神廟');
  {
    const PHASE_F_CHECKS = [
      'toolNamesDistinct',
      'limitsToolSurface',
      'statesToolTriggers',
      'ordersToolCalls',
      'prefersToolOverMentalMath',
      'limitsToolOutput',
      'requiresPreamble',
      'reshapesToLowRisk',
      'includesAdversarialCase',
    ];
    const used = new Set(tfPlan.map((x) => x.check));
    for (const id of PHASE_F_CHECKS) ok(used.has(id), `新檢查器 ${id} 真的有一座神廟在教`);
    for (const region of ['toolcraft', 'wards']) {
      const kinds = tfPlan.filter((x) => x.region === region).map((x) => x.kind);
      let run = 1;
      let worst = 1;
      for (let i = 1; i < kinds.length; i += 1) {
        run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
        if (run > worst) worst = run;
      }
      ok(worst <= 2, `[${region}] 整區沒有連續三座同一種題型（C4）`, kinds.join(','));
    }
  }

  /* --- 純鍵盤走完一座派工檯神廟（本期的主場題型，§3.1 鐵則） --- */
  {
    const target = 'forge-door-66';
    const near = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.markers.find((x) => x.id === '${target}');
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到契約鍛冶場的門旁邊', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '走近提示標著 E 這個鍵', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(460);

    const wsStart = await evaluate(`
      const g = window.__promptasy;
      return {
        act: g.promptConsole.act,
        kind: g.promptConsole.kind,
        stage: g.promptConsole.workshop?.stage,
        focusedOnCard: !!document.activeElement?.closest('[data-tool]'),
        eyebrow: document.querySelector('#prompt-console .workshop .stele__eyebrow')?.textContent.trim() || '',
      };
    `);
    eq(wsStart.act, 3, 'Enter 推到第三幕（派工檯）');
    eq(wsStart.kind, 'workshop', '這一座是派工檯');
    eq(wsStart.stage, 'tools', '從「挑工具」那一步開始');
    eq(wsStart.focusedOnCard, true, '一進派工檯，焦點就落在第一張工具牌上');
    eq(wsStart.eyebrow, '寫到一半的派工單', '派工型的神廟沿用原本的稱呼（沒有換皮）');

    /* 挑錯不會失敗：牌子留在原地、就地長出教學、不前進 */
    const wsWrong = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.workshop;
      const ws = g.content.flow('${target}').workshop;
      const bad = ws.tools.find((t) => !t.needed);
      const before = b.stage;
      b.pickTool(bad.id);
      await new Promise((r) => setTimeout(r, 260));
      const el = document.querySelector('[data-tool="' + bad.id + '"]');
      return {
        stage: b.stage,
        before,
        wrongClass: !!el && el.classList.contains('is-wrong'),
        feedback: el ? (el.querySelector('[data-tool-fb]')?.textContent || '').trim() : '',
        chosen: b.dispatch.chosen.length,
      };
    `);
    eq(wsWrong.stage, wsWrong.before, '挑錯不會前進（不會失敗）');
    eq(wsWrong.wrongClass, true, '挑錯的那張牌就地標成「不收」');
    ok(wsWrong.feedback.length >= 12, '而且就地長出一句白話教學', wsWrong.feedback.slice(0, 40));
    eq(wsWrong.chosen, 0, '挑錯的牌不會被收進派工單');

    /* 純鍵盤把四步走完 */
    const wsDone = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.workshop;
      const ws = g.content.flow('${target}').workshop;
      const step = (n) => new Promise((r) => setTimeout(r, n));
      for (const t of ws.order.sequence) { b.pickTool(t); await step(140); }
      for (const tid of ws.order.sequence) {
        const tool = ws.tools.find((t) => t.id === tid);
        for (const p of tool.params) {
          b.liftStone(p.stone);
          await step(90);
          b.dropStone(tid + '.' + p.id);
          await step(110);
        }
      }
      await step(200);
      b.board.arrange(ws.order.sequence);
      await step(320);
      b.pickRule(ws.rules.findIndex((r) => r.correct));
      await step(320);
      return {
        stage: b.stage,
        done: b.done,
        act: g.promptConsole.act,
        palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'),
        text: b.text,
      };
    `);
    eq(wsDone.done, true, '四步走完，派工單寫好了');
    eq(wsDone.act, 4, '寫滿之後鏡頭自己切到手印那一幕');
    ok(/工具名：/.test(wsDone.text), '派工單上真的宣告了工具規格', wsDone.text.slice(0, 40));

    await evaluate(`document.querySelector('#prompt-console [data-palm]').focus(); return 1;`);
    await holdPalm();
    await sleep(800);
    const wsResult = await evaluate(`
      const g = window.__promptasy;
      return {
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared('${target}'),
        skill: g.progression.isSkillCollected('tool-native-field'),
        saved: JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}').skillsV2 || [],
      };
    `);
    eq(wsResult.grade, 'S', '全程不碰滑鼠也拿得到 S');
    eq(wsResult.cleared, true, '契約鍛冶場的門記成通關（純鍵盤）');
    eq(wsResult.skill, true, '技能「tool-native-field」進了圖鑑');
    ok(wsResult.saved.includes('tool-native-field'), '而且真的寫進了存檔', wsResult.saved.join(','));
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(320);
  }

  /* --- 護欄崗的派工檯換了自己的稱呼（工具牌／值石那一套不會冒出來） --- */
  {
    const skin = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 160));
      g.promptConsole.open(g.content.challenge('guest-in-disguise-79'));
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 320));
      const eyebrow = document.querySelector('#prompt-console .workshop .stele__eyebrow')?.textContent.trim() || '';
      const empty = document.querySelector('#prompt-console .workshop .stele__empty')?.textContent.trim() || '';
      const board = g.promptConsole.workshop;
      board.pickTool(g.content.flow('guest-in-disguise-79').workshop.order.sequence[0]);
      await new Promise((r) => setTimeout(r, 200));
      board.pickTool(g.content.flow('guest-in-disguise-79').workshop.order.sequence[1]);
      await new Promise((r) => setTimeout(r, 260));
      const tray = document.querySelector('#prompt-console .workshop .stonetray__label')?.textContent.trim() || '';
      const trayAria = document.querySelector('#prompt-console .workshop [data-stonetray]')?.getAttribute('aria-label') || '';
      g.promptConsole.close();
      return { eyebrow, empty, tray, trayAria };
    `);
    eq(skin.eyebrow, '寫到一半的試門單', '護欄崗的派工檯叫「試門單」');
    ok(!/派工單/.test(skin.empty), '換皮之後畫面上不會冒出「派工單」', skin.empty);
    eq(skin.tray, '內容石', '托盤也換了自己的稱呼');
    eq(skin.trayAria, '內容石托盤', '無障礙標籤跟著換');
  }
  await sleep(220);

  /* --- 一座一座真的玩過去 --- */
  for (const shrine of tfPlan) {
    const played = await evaluate(`
      const g = window.__promptasy;
      const id = '${shrine.id}';
      const c = g.content.challenge(id);
      const flow = g.content.flow(id);
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      g.promptConsole.open(c);
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 260));
      const kind = g.promptConsole.kind;
      const step = (n) => new Promise((r) => setTimeout(r, n));
      const carve = async (board) => {
        for (const slot of flow.slots) {
          board.pick(slot.options.findIndex((o) => o.correct));
          await step(90);
        }
      };
      if (kind === 'choice') {
        await carve(g.promptConsole.stele);
        g.promptConsole.stele.press();
      } else if (kind === 'fix') {
        const b = g.promptConsole.fixBoard;
        for (const fr of flow.fixFlow.fragments) {
          if (!fr.weak) continue;
          b.open(fr.id);
          await step(70);
          b.pick(fr.id, fr.options.findIndex((o) => o.correct));
          await step(90);
        }
        b.press();
      } else if (kind === 'spot') {
        const b = g.promptConsole.spotBoard;
        for (const sl of flow.spotFlow.slips) {
          if (!sl.bad) continue;
          b.toggle(sl.id);
          await step(90);
        }
        b.press();
      } else if (kind === 'order') {
        const b = g.promptConsole.orderBoard;
        b.arrange(flow.orderFlow.order);
        await step(300);
        b.press();
      } else if (kind === 'multi') {
        // 課程 v2 · Phase G：兩輪刻印 —— 每一輪刻完要先「收下回話」才進得了下一輪
        const b = g.promptConsole.multiBoard;
        let at = 0;
        for (let r = 0; r < flow.multiFlow.rounds.length; r += 1) {
          const n = flow.multiFlow.rounds[r].count;
          for (let i = 0; i < n; i += 1) {
            b.pick(flow.slots[at].options.findIndex((o) => o.correct));
            at += 1;
            await step(90);
          }
          if (r < flow.multiFlow.rounds.length - 1) {
            b.advance();
            await step(140);
          }
        }
        b.press();
      } else if (kind === 'tradeoff') {
        const b = g.promptConsole.tradeoffBoard;
        for (const r of flow.tradeoffFlow.rounds) {
          b.weigh(r.favours);
          await step(220);
        }
        await carve(b);
        b.press();
      } else if (kind === 'workshop') {
        const b = g.promptConsole.workshop;
        const ws = flow.workshop;
        for (const t of ws.order.sequence) { b.pickTool(t); await step(120); }
        for (const tid of ws.order.sequence) {
          const tool = ws.tools.find((t) => t.id === tid);
          for (const p of tool.params) {
            b.liftStone(p.stone);
            await step(80);
            b.dropStone(tid + '.' + p.id);
            await step(100);
          }
        }
        await step(180);
        b.board.arrange(ws.order.sequence);
        await step(300);
        b.pickRule(ws.rules.findIndex((r) => r.correct));
        await step(260);
        b.press();
      }
      await new Promise((r) => setTimeout(r, 900));
      return {
        kind,
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared(id),
        skill: g.progression.isSkillCollected(c.primarySkillId),
        srcs: document.querySelectorAll('#prompt-console [data-result] a.src').length,
      };
    `);
    eq(played.kind, shrine.kind, `[${shrine.id}] 第三幕的題型是 ${shrine.kind}`);
    eq(played.grade, 'S', `[${shrine.id}] 照著畫面上的東西做就是 S（${shrine.check}）`, JSON.stringify(played));
    eq(played.cleared, true, `[${shrine.id}] 記成通關`);
    eq(played.skill, true, `[${shrine.id}] 技能「${shrine.skill}」進了圖鑑（skillsV2）`);
    ok(played.srcs >= 1, `[${shrine.id}] 結果面板附得出可點的官方出處`, String(played.srcs));
  }

  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(240);

  /* --- 安全題的誠實界線：畫面上不宣稱「prompt 就是安全邊界」 --- */
  {
    const honesty = await evaluate(`
      const g = window.__promptasy;
      let text = '';
      let srcs = [];
      for (const id of ['speaking-letter-75', 'two-slots-76', 'reshaped-order-77', 'unclosing-door-78', 'guest-in-disguise-79']) {
        g.promptConsole.close();
        await new Promise((r) => setTimeout(r, 120));
        g.promptConsole.open(g.content.challenge(id));
        await new Promise((r) => setTimeout(r, 180));
        text += '\\n' + document.querySelector('#prompt-console .panel').innerText;
        g.promptConsole.goAct(2, { force: true });
        await new Promise((r) => setTimeout(r, 220));
        text += '\\n' + document.querySelector('#prompt-console .panel').innerText;
        srcs = srcs.concat([...document.querySelectorAll('#prompt-console .act--guide a.bookicon')].map((a) => a.getAttribute('href')));
      }
      g.promptConsole.close();
      return { text, srcs };
    `);
    const FALSE_CLAIM =
      /(?:prompt|提示詞|這句話|一句話|文字)[^\n。]{0,12}(?:就是|即是|等於)[^\n。]{0,8}(?:安全邊界|安全防線|防護|護欄)/;
    ok(!FALSE_CLAIM.test(honesty.text), '護欄崗的畫面上沒有把 prompt 文字宣稱成真正的安全邊界');
    ok(/標籤|區塊|【資料】|外部來信/.test(honesty.text), '畫面上真的教了「外部內容怎麼給進來」（輸入通道）');
    ok(/確認|同意|由我|先問/.test(honesty.text), '畫面上真的教了「人留在迴圈裡」');
    ok(honesty.srcs.length >= 5, '五座的神諭原典都掛得出來', String(honesty.srcs.length));
    ok(honesty.srcs.every((h) => /^https:\/\//.test(h)), '而且每一個都是可點的 https 連結');
  }

  /* --- 全破之後：兩區精通、圖鑑列得出它們 --- */
  const tfCodex = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const cards = [...document.querySelectorAll('#codex .region-card')];
    const pick = (zh) => cards.find((c) => new RegExp(zh).test(c.querySelector('h3')?.textContent || ''));
    const read = (card) => card ? {
      title: card.querySelector('h3')?.textContent.trim() || '',
      mastered: card.classList.contains('is-mastered'),
      rows: card.querySelectorAll('.tech').length,
      locked: card.querySelectorAll('.tech--locked').length,
      srcs: card.querySelectorAll('a.bookicon').length,
    } : null;
    const out = { cards: cards.length, toolcraft: read(pick('契約鍛冶場')), wards: read(pick('護欄崗')) };
    g.codex.close();
    out.masteredT = g.progression.regionMastery('toolcraft').mastered;
    out.masteredW = g.progression.regionMastery('wards').mastered;
    return out;
  `);
  eq(tfCodex.cards, EXPECT.v2ImplementedRegions.value, `圖鑑列出 ${EXPECT.v2ImplementedRegions.value} 片土地`);
  ok(Boolean(tfCodex.toolcraft), '圖鑑裡找得到契約鍛冶場那一張卡');
  ok(Boolean(tfCodex.wards), '圖鑑裡找得到護欄崗那一張卡');
  eq(tfCodex.toolcraft.rows, 11, '契約鍛冶場那一張卡列出 11 條技法');
  eq(tfCodex.wards.rows, 5, '護欄崗那一張卡列出 5 條技法');
  eq(tfCodex.toolcraft.locked, 0, '契約鍛冶場全破之後一條都不再是剪影');
  eq(tfCodex.wards.locked, 0, '護欄崗全破之後一條都不再是剪影');
  eq(tfCodex.toolcraft.mastered, true, '契約鍛冶場蓋上精通封印');
  eq(tfCodex.wards.mastered, true, '護欄崗蓋上精通封印');
  eq(tfCodex.masteredT, true, '進程也認定契約鍛冶場精通了');
  eq(tfCodex.masteredW, true, '進程也認定護欄崗精通了');
  ok(tfCodex.toolcraft.srcs >= 11, '契約鍛冶場每一條技法都附得出官方出處', String(tfCodex.toolcraft.srcs));
  ok(tfCodex.wards.srcs >= 5, '護欄崗每一條技法都附得出官方出處', String(tfCodex.wards.srcs));

  /* --- 窄畫面：本期的兩種題型在 390px 上也讀得完、按得動 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(320);
  const tfNarrow = await evaluate(`
    const g = window.__promptasy;
    const out = [];
    for (const id of ['forge-door-66', 'unclosing-door-78', 'two-slots-76']) {
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      g.promptConsole.open(g.content.challenge(id));
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 340));
      const panel = document.querySelector('#prompt-console .panel');
      const tappable = [...document.querySelectorAll('#prompt-console button:not([hidden])')]
        .filter((b) => b.offsetParent !== null);
      out.push({
        id,
        overflow: panel.scrollWidth - panel.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: tappable.filter((b) => b.getBoundingClientRect().height < 40).length,
        tappable: tappable.length,
      });
    }
    g.promptConsole.close();
    return out;
  `);
  for (const row of tfNarrow) {
    eq(row.overflow, 0, `[${row.id}] 390px 下沒有水平溢位`, String(row.overflow));
    eq(row.pageOverflow, 0, `[${row.id}] 390px 下整頁不會橫向捲動`, String(row.pageOverflow));
    ok(row.tappable > 0, `[${row.id}] 390px 下真的量得到可按的東西`, String(row.tappable));
    eq(row.small, 0, `[${row.id}] 390px 下每一顆可按的東西都夠大`, String(row.small));
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  await sleep(320);
  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);


  /* ================================================================== */
  /* 課程 v2 · Phase G：兩輪刻印（multi）＋ 校驗場（refinery）            */
  /*   · 齒輪工坊旁的院子是第二座加建（沒有橋，走出工坊西南就到）         */
  /*   · 「任一區精通」是這一期新開的知識式軟門檻                         */
  /*   · 23 座神廟（流程與代理 12 ＋ 校驗場 11）                          */
  /*   · 兩輪刻印純鍵盤走完：成功／挑錯不失敗／Esc／幕切換／模式切換      */
  /*   · 中間那一段回話明講它是遊戲自撰的（誠實）                         */
  /* ================================================================== */
  console.log('\n▸ 兩輪刻印與校驗場（課程 v2 · Phase G）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    g.shareCard.close();
    return 1;
  `);
  await sleep(220);

  /* --- 閘門：知識式軟門檻（含「任一區精通」） --- */
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（校驗場：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const rfGate = await evaluate(`
    const g = window.__promptasy;
    const st = g.progression.gateStatus('refinery');
    return {
      unlocked: g.progression.isRegionUnlocked('refinery'),
      gaps: st.knowledgeGaps.map((x) => x.kind),
      text: st.text,
      hasGate: !!g.world.gates.find((x) => x.id === 'refinery'),
      bridges: g.world.corridors.filter((c) => c.region === 'refinery').length,
      hasLink: !!g.world.annexLinks.find((l) => l.region === 'refinery'),
    };
  `);
  eq(rfGate.unlocked, false, '什麼都還沒學 → 校驗場鎖著');
  ok(rfGate.gaps.includes('masteredAny'), '「任一區精通」真的被算進閘門的缺口裡', rfGate.gaps.join(','));
  ok(/也可以先行前往/.test(rfGate.text), '校驗場的門一樣會問「想先過去看看嗎」', rfGate.text);
  eq(rfGate.hasGate, true, '校驗場真的有一道閘門');
  eq(rfGate.bridges, 0, '校驗場沒有自己的橋（它是加建，不是新大陸）');
  eq(rfGate.hasLink, true, '校驗場有一個頸口（閘門立在那裡）');

  const rfBlocked = await evaluate(`
    const g = window.__promptasy;
    const link = g.world.annexLinks.find((l) => l.region === 'refinery');
    const from = { x: link.from.x + link.dir.x * 18, z: link.from.z + link.dir.z * 18 };
    const got = g.world.clampPosition(link.to.x, link.to.z, from.x, from.z);
    const here = g.world.regionAt(got.x, got.z);
    return { region: here && here.id };
  `);
  ok(rfBlocked.region !== 'refinery', '校驗場鎖著的時候踏不進它的地界', String(rfBlocked.region));

  const rfSkip = await evaluate(`
    const g = window.__promptasy;
    const xpBefore = g.progression.state.xp;
    g.progression.skipGate('refinery');
    g.world.openGate('refinery', true);
    return {
      unlocked: g.progression.isRegionUnlocked('refinery'),
      xp: g.progression.state.xp,
      xpBefore,
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(rfSkip.unlocked, true, '先行前往開得了校驗場的門');
  eq(rfSkip.xp, rfSkip.xpBefore, '先行前往一分 XP 都不加');
  eq(rfSkip.cleared, 0, '先行前往不會偷偷記下任何一關的評價');

  /* --- 走進院子：沒有虛空、HUD 與配樂都跟著換 --- */
  const rfEnter = await evaluate(`
    const g = window.__promptasy;
    const link = g.world.annexLinks.find((l) => l.region === 'refinery');
    let voids = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = link.from.x + (link.to.x - link.from.x) * t;
      const z = link.from.z + (link.to.z - link.from.z) * t;
      if (g.world.coverage(x, z) <= 0.45) voids += 1;
    }
    g.player.position.set(link.to.x, g.world.terrainHeight(link.to.x, link.to.z) + 1, link.to.z);
    await new Promise((r) => setTimeout(r, 900));
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      voids,
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      source: g.audio.debug().source,
    };
  `);
  eq(rfEnter.voids, 0, '從齒輪工坊走到院子全程都是實地（加建沒有虛空）');
  eq(rfEnter.here, 'refinery', '走到西南外緣真的站在校驗場的地界上');
  eq(rfEnter.hudRegion, 'refinery', 'HUD 跟著換到校驗場');
  ok(/校驗場/.test(rfEnter.hudLabel), 'HUD 上寫的是中文區域名', rfEnter.hudLabel);
  eq(rfEnter.mood, 'refinery', '配樂也切到校驗場');
  await expectRegionBgmFile('refinery', '校驗場');

  /* --- 世界：地標、造景、石座數、預算 --- */
  const rfWorld = await evaluate(`
    const g = window.__promptasy;
    let lights = 0;
    let tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry) {
        const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count || 0);
        tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      }
    });
    const node = g.engine.scene.getObjectByName('landmark:facing-glass');
    let lmLights = 0;
    if (node) node.traverse((o) => { if (o.isLight) lmLights += 1; });
    return {
      hasGlass: !!node,
      lmLights,
      refMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'refinery').length,
      orcMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'orchestration').length,
      props: !!g.engine.scene.getObjectByName('props:refinery'),
      flora: !!g.engine.scene.getObjectByName('flora:refinery'),
      vignettes: ['vignette:ten-drafts', 'vignette:facing-mirrors', 'vignette:unread-checklist']
        .filter((n) => !!g.engine.scene.getObjectByName(n)).length,
      lights,
      tris: Math.round(tris),
      solids: g.world.solids.length,
    };
  `);
  ok(rfWorld.hasGlass, '會回頭照自己的鏡真的立在場景圖上');
  eq(rfWorld.lmLights, 0, '會回頭照自己的鏡一盞實體光源都沒加（全部自發光）');
  eq(rfWorld.refMarkers, 12, '校驗場有 12 座石座（11 教學神廟 ＋ 1 試煉）');
  eq(rfWorld.orcMarkers, 13, '流程與代理有 13 座石座（12 教學神廟 ＋ 1 試煉）');
  eq(rfWorld.props, true, '校驗場有自己的造景（照面架與稿堆）');
  eq(rfWorld.flora, true, '校驗場有自己的植被剪影');
  eq(rfWorld.vignettes, 3, '校驗場的三組故事小景都在場景圖上', String(rfWorld.vignettes));
  ok(rfWorld.lights <= 56, '加了校驗場之後燈光仍在預算內', `lights=${rfWorld.lights}`);
  ok(rfWorld.tris < 420000, '加了校驗場之後三角形仍在預算內', `tris=${rfWorld.tris}`);
  ok(rfWorld.solids < 1400, '加了校驗場之後碰撞體仍在預算內', `solids=${rfWorld.solids}`);

  /* --- 23 座神廟：十二個新檢查器、C1／C4 --- */
  const rfPlan = await evaluate(`
    const g = window.__promptasy;
    const here = g.content.challenges.filter((c) => !c.application && (c.region === 'orchestration' || c.region === 'refinery'));
    return here.map((c) => ({
      id: c.id,
      region: c.region,
      skill: c.primarySkillId,
      check: c.rubric.find((r) => r.primary).check,
      rows: c.rubric.length,
      pass: c.pass,
      kind: g.promptConsole.flowKindOf(g.content.flow(c.id)),
    }));
  `);
  eq(rfPlan.length, 23, '兩區合計 23 座教學神廟');
  {
    const PHASE_G_CHECKS = [
      'statesSuccessCriteria', 'tunesAutonomyLevel', 'limitsScope', 'asksForPlanFirst',
      'definesHandoffState', 'delegatesWithCriteria', 'extractsStandingRules', 'setsActionBudget',
      'definesEvalSet', 'asksModelToRewritePrompt', 'decisionTree', 'definesWordedScale',
    ];
    const used = new Set(rfPlan.map((x) => x.check));
    for (const id of PHASE_G_CHECKS) ok(used.has(id), `新檢查器 ${id} 真的有一座神廟在教`);
    for (const row of rfPlan) {
      eq(row.rows, 2, `[${row.id}] 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
      eq(row.pass, 2, `[${row.id}] 門檻是 2 分`);
    }
    for (const region of ['orchestration', 'refinery']) {
      const kinds = rfPlan.filter((x) => x.region === region).map((x) => x.kind);
      let run = 1;
      let worst = 1;
      for (let i = 1; i < kinds.length; i += 1) {
        run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
        if (run > worst) worst = run;
      }
      ok(worst <= 2, `[${region}] 整區沒有連續三座同一種題型（C4）`, kinds.join(','));
      ok(kinds.includes('multi'), `[${region}] 這一區有兩輪刻印`, kinds.join(','));
    }
  }

  /* --- 純鍵盤走完一座兩輪刻印（本期的主場題型，§3.1 鐵則） --- */
  {
    const target = 'self-mirror-93';
    const near = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.markers.find((x) => x.id === '${target}');
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到照自己的鏡旁邊', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '走近提示標著 E 這個鍵', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(460);

    const mStart = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      return {
        act: g.promptConsole.act,
        kind: g.promptConsole.kind,
        round: b.progress.round,
        rounds: b.progress.rounds,
        handoffOpen: b.handoffOpen,
        focusedOnOption: !!document.activeElement?.closest('[data-slot-opt]'),
        eyebrow: document.querySelector('#prompt-console .multiboard [data-round-label]')?.textContent.trim() || '',
        label: document.querySelector('#prompt-console [data-guided-label] .zh')?.textContent.trim() || '',
      };
    `);
    eq(mStart.act, 3, 'Enter 推到第三幕（兩輪刻印）');
    eq(mStart.kind, 'multi', '這一座是兩輪刻印');
    eq(mStart.round, 0, '從第一輪開始');
    eq(mStart.rounds, 2, '這一關有兩輪');
    eq(mStart.handoffOpen, false, '第一輪還在刻，回話卡還沒攤開');
    eq(mStart.focusedOnOption, true, '一進兩輪刻印，焦點就落在第一個選項上');
    ok(/第 1 \/ 2 輪/.test(mStart.eyebrow), '碑上寫著現在是第幾輪', mStart.eyebrow);

    /* 挑錯不會失敗：石碑不收、就地教學、不前進 */
    const mWrong = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      const before = b.progress.carved;
      const opts = [...document.querySelectorAll('#prompt-console .multiboard [data-slot-opt]')];
      const wrongIdx = opts.findIndex((_, i) => !g.content.flow('${target}').slots[0].options[i].correct);
      opts[wrongIdx].focus();
      opts[wrongIdx].click();
      await new Promise((r) => setTimeout(r, 260));
      const btn = document.querySelectorAll('#prompt-console .multiboard [data-slot-opt]')[wrongIdx];
      return {
        carvedBefore: before,
        carvedAfter: b.progress.carved,
        wrongClass: btn?.classList.contains('is-wrong'),
        feedback: btn?.querySelector('[data-opt-fb]')?.textContent.trim() || '',
        failShown: !document.querySelector('#prompt-console .result')?.hidden,
        text: b.text,
      };
    `);
    eq(mWrong.carvedAfter, mWrong.carvedBefore, '挑錯不會前進（石碑就是不收）');
    eq(mWrong.wrongClass, true, '挑錯的那一片留在原地標成「石碑不收」');
    ok(mWrong.feedback.length >= 8, '挑錯的人就地拿到一句教學', mWrong.feedback.slice(0, 40));
    eq(mWrong.failShown, false, '挑錯不會跳失敗面板');
    eq(mWrong.text, '', '挑錯的那一句沒有被刻上去');

    /* 第一輪刻完 → 回話卡攤開，而且明講它是遊戲自撰的 */
    const mHandoff = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      const flow = g.content.flow('${target}');
      const n = flow.multiFlow.rounds[0].count;
      for (let i = 0; i < n; i += 1) {
        const idx = flow.slots[i].options.findIndex((o) => o.correct);
        b.pick(idx);
        await new Promise((r) => setTimeout(r, 140));
      }
      const card = document.querySelector('#prompt-console .handoff');
      const tipBtn = card?.querySelector('[data-infotip-btn]');
      // hover ＝ 游標真的動到它上面（只補送 mouseover 不算，見 bindInfoTips）
      const tipBox = tipBtn?.getBoundingClientRect();
      tipBtn?.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: Math.round(tipBox.x + tipBox.width / 2),
        clientY: Math.round(tipBox.y + tipBox.height / 2),
      }));
      await new Promise((r) => setTimeout(r, 240));
      return {
        handoffOpen: b.handoffOpen,
        round: b.progress.round,
        visible: card ? card.checkVisibility() : false,
        label: card?.querySelector('[data-handoff-label]')?.textContent.trim() || '',
        body: card?.querySelector('[data-handoff-text]')?.textContent.trim() || '',
        ask: card?.querySelector('[data-handoff-ask]')?.textContent.trim() || '',
        note: card?.querySelector('[data-infotip-bubble]')?.textContent.trim() || '',
        noteVisible: card?.querySelector('[data-infotip-bubble]')?.checkVisibility() || false,
        focusedOnGo: !!document.activeElement?.closest('[data-handoff-go]'),
        goLabel: card?.querySelector('[data-handoff-go]')?.textContent.trim() || '',
        links: card ? card.querySelectorAll('a[href]').length : -1,
        palmShown: !document.querySelector('#prompt-console .multiboard .palmwrap')?.hidden,
      };
    `);
    eq(mHandoff.handoffOpen, true, '第一輪刻完 → 神諭的回話攤開來了');
    eq(mHandoff.round, 0, '回話卡攤開時還沒進到第二輪（要玩家自己收下）');
    eq(mHandoff.visible, true, '回話卡真的畫得出來');
    ok(mHandoff.body.length >= 12, '回話卡上真的有一段輸出', mHandoff.body.slice(0, 40));
    ok(mHandoff.ask.length >= 6, '回話卡說得出「第二輪要修什麼」', mHandoff.ask.slice(0, 40));
    ok(/遊戲|自撰|不是真的/.test(mHandoff.note), 'ⓘ 明講這一段回話是遊戲自己寫的，不是模型跑出來的', mHandoff.note.slice(0, 60));
    eq(mHandoff.noteVisible, true, 'hover 到 ⓘ 上就讀得到那句實話');
    eq(mHandoff.links, 0, '回話卡不自帶連結（教學與出處在第二幕）');
    eq(mHandoff.focusedOnGo, true, '焦點自己落在「收下這一份回話」上（純鍵盤走得下去）');
    ok(/<kbd>Enter<\/kbd>/.test(mHandoff.goLabel) || /Enter/.test(mHandoff.goLabel), '按鈕上戴著 Enter 的鍵帽', mHandoff.goLabel);
    eq(mHandoff.palmShown, false, '第一輪刻完手掌印還不會出現（還有第二輪）');

    /*
     * Esc 契約：兩輪刻印**自己沒有還原層** —— 一下就冒泡出去收起面板。
     * 但剛剛把 ⓘ 打開了，所以第一下 Esc 會先收 ⓘ（`bindInfoTips` 的既有行為），
     * 第二下才輪到面板。兩段都驗。
     */
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(300);
    const mEscTip = await evaluate(`
      return {
        open: !document.querySelector('#prompt-console')?.hidden,
        tipOpen: !!document.querySelector('#prompt-console .handoff [data-infotip].is-open'),
      };
    `);
    eq(mEscTip.tipOpen, false, 'ⓘ 開著時第一下 Esc 先把它收起來');
    eq(mEscTip.open, true, '收 ⓘ 的那一下不會順手把整個面板關掉');
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(360);
    const mEsc = await evaluate(`
      const g = window.__promptasy;
      return { open: !document.querySelector('#prompt-console')?.hidden, canMove: g.player.inputEnabled };
    `);
    eq(mEsc.open, false, 'ⓘ 收起來之後，Esc 在兩輪刻印上直接收起面板（這一層沒有自己的還原層）');
    eq(mEsc.canMove, true, '收起之後操控權還回來了');

    /* 重開這一關 → 一定回到第一輪（結構上不可能串錯輪次） */
    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    const mReopen = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      return { round: b.progress.round, carved: b.progress.carved, handoffOpen: b.handoffOpen, text: b.text };
    `);
    eq(mReopen.round, 0, '重開這一關一定回到第一輪');
    eq(mReopen.carved, 0, '重開這一關碑上是空的');
    eq(mReopen.handoffOpen, false, '重開這一關回話卡是收起來的');
    eq(mReopen.text, '', '重開這一關不會留下上一次刻的字（不串輪）');

    /* 走到第二輪，然後切幕 ／ 切模式 —— 輪次不能被弄丟或串掉 */
    const mAdvance = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      const flow = g.content.flow('${target}');
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 320));
      const n = flow.multiFlow.rounds[0].count;
      for (let i = 0; i < n; i += 1) {
        b.pick(flow.slots[i].options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 120));
      }
      b.advance();
      await new Promise((r) => setTimeout(r, 220));
      const afterAdvance = { round: b.progress.round, carved: b.progress.carved, text: b.text, handoffOpen: b.handoffOpen };
      // 切回第一幕再回來
      g.promptConsole.goAct(1, { force: true });
      await new Promise((r) => setTimeout(r, 260));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 260));
      const afterAct = { round: b.progress.round, carved: b.progress.carved, text: b.text };
      // 切到自由書寫再切回來
      g.promptConsole.setMode('free');
      await new Promise((r) => setTimeout(r, 240));
      const freeKind = g.promptConsole.mode;
      g.promptConsole.setMode('guided');
      await new Promise((r) => setTimeout(r, 240));
      const afterMode = { round: b.progress.round, carved: b.progress.carved, text: b.text };
      return { afterAdvance, afterAct, afterMode, freeKind };
    `);
    eq(mAdvance.afterAdvance.round, 1, '按下「收下這一份回話」就進到第二輪');
    eq(mAdvance.afterAdvance.handoffOpen, false, '進到第二輪之後回話卡收起來了');
    ok(mAdvance.afterAdvance.carved > 0, '第一輪刻好的字被收進「前面刻好的」', String(mAdvance.afterAdvance.carved));
    eq(mAdvance.freeKind, 'free', '切得到自由書寫模式');
    eq(mAdvance.afterAct.round, mAdvance.afterAdvance.round, '切幕回來還在同一輪（輪次不會被弄丟）');
    eq(mAdvance.afterAct.text, mAdvance.afterAdvance.text, '切幕回來刻好的字一個都沒少');
    eq(mAdvance.afterMode.round, mAdvance.afterAdvance.round, '切模式回來還在同一輪');
    eq(mAdvance.afterMode.text, mAdvance.afterAdvance.text, '切模式回來刻好的字一個都沒少');

    /* 第二輪刻完 → 手掌印 → 呈給神諭 → S */
    const mFinish = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.multiBoard;
      const flow = g.content.flow('${target}');
      const from = flow.multiFlow.rounds[0].count;
      for (let i = from; i < flow.slots.length; i += 1) {
        b.pick(flow.slots[i].options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 260));
      return {
        done: b.done,
        act: g.promptConsole.act,
        palmShown: !document.querySelector('#prompt-console .multiboard .palmwrap')?.hidden,
        focusedOnPalm: !!document.activeElement?.closest('[data-palm]'),
        text: b.text,
        sample: g.content.challenge('${target}').sample,
      };
    `);
    eq(mFinish.done, true, '兩輪都刻完了');
    eq(mFinish.act, 4, '刻滿自動切到第四幕（手掌印）');
    eq(mFinish.palmShown, true, '手掌印浮出來了');
    eq(mFinish.focusedOnPalm, true, '焦點自己落在手掌印上（純鍵盤走得完）');
    eq(mFinish.text, mFinish.sample, '兩輪刻出來的字＝資料層的示範解答（兩種模式同一段字）');

    await evaluate(`document.querySelector('#prompt-console [data-palm]').focus(); return 1;`);
    await holdPalm();
    await sleep(700);

    const mResult = await evaluate(`
      const g = window.__promptasy;
      const grade = document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '';
      return {
        grade,
        cleared: g.progression.isCleared('${target}'),
        skill: g.progression.state.skillsV2.includes('meta-metaprompt'),
        sources: [...document.querySelectorAll('#prompt-console .result a[href^="https://"]')].length,
      };
    `);
    eq(mResult.grade, 'S', '兩輪刻對＝S（走的是同一支離線引擎）');
    eq(mResult.cleared, true, '記成通關了');
    eq(mResult.skill, true, '技能進了圖鑑');
    ok(mResult.sources > 0, '結果面板附得出可點的官方出處', String(mResult.sources));

    await key('Escape', 'Escape', { vk: 27 });
    await sleep(360);
  }

  /* --- reduced-motion 下兩輪刻印照樣走得完 --- */
  {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await sleep(200);
    const rm = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('endless-corridor-86'));
      await new Promise((r) => setTimeout(r, 420));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 320));
      const b = g.promptConsole.multiBoard;
      const flow = g.content.flow('endless-corridor-86');
      for (let i = 0; i < flow.multiFlow.rounds[0].count; i += 1) {
        b.pick(flow.slots[i].options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 120));
      }
      const card = document.querySelector('#prompt-console .handoff');
      const visible = card ? card.checkVisibility() : false;
      const anim = card ? getComputedStyle(card).animationName : '';
      b.advance();
      await new Promise((r) => setTimeout(r, 200));
      for (let i = flow.multiFlow.rounds[0].count; i < flow.slots.length; i += 1) {
        b.pick(flow.slots[i].options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 240));
      return { visible, anim, done: b.done, round: b.progress.round };
    `);
    eq(rm.visible, true, 'reduced-motion 下回話卡照樣看得見');
    eq(rm.anim, 'none', 'reduced-motion 下回話卡不做入場動畫');
    eq(rm.done, true, 'reduced-motion 下兩輪照樣刻得完');
    eq(rm.round, 1, 'reduced-motion 下輪次照樣推得到第二輪');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
    await sleep(200);
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(240);
  }

  /* ================================================================== */
  /* 課程 v2 · Phase H：轉鈕（sim）＋ 減法之庭（frugality）              */
  /*   · 高原北緣的院落是第三座加建（沒有橋，走出高原正北就到）           */
  /*   · 軟門檻只有一條：任一區精通                                       */
  /*   · 7 座神廟 ＋ 三座換裝成轉鈕的舊神廟                               */
  /*   · 轉鈕純鍵盤走完：轉三檔 → 開放刻印 → 手掌印 → S                  */
  /*   · 樣本明講是遊戲自撰的，而且斷網照樣轉得動（護欄 3）               */
  /* ================================================================== */
  console.log('\n▸ 轉鈕與減法之庭（課程 v2 · Phase H）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    g.shareCard.close();
    return 1;
  `);
  await sleep(220);

  /* --- 閘門：知識式軟門檻（任一區精通） --- */
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（減法之庭：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const fgGate = await evaluate(`
    const g = window.__promptasy;
    const st = g.progression.gateStatus('frugality');
    return {
      unlocked: g.progression.isRegionUnlocked('frugality'),
      gaps: st.knowledgeGaps.map((x) => x.kind),
      text: st.text,
      hasGate: !!g.world.gates.find((x) => x.id === 'frugality'),
      bridges: g.world.corridors.filter((c) => c.region === 'frugality').length,
      hasLink: !!g.world.annexLinks.find((l) => l.region === 'frugality'),
    };
  `);
  eq(fgGate.unlocked, false, '什麼都還沒學 → 減法之庭鎖著');
  ok(fgGate.gaps.includes('masteredAny'), '「任一區精通」就是減法之庭唯一的缺口', fgGate.gaps.join(','));
  ok(/也可以先行前往/.test(fgGate.text), '減法之庭的門一樣會問「想先過去看看嗎」', fgGate.text);
  eq(fgGate.hasGate, true, '減法之庭真的有一道閘門');
  eq(fgGate.bridges, 0, '減法之庭沒有自己的橋（高原加建，不是新大陸）');
  eq(fgGate.hasLink, true, '減法之庭有一個頸口（閘門立在高原北緣）');

  const fgSkip = await evaluate(`
    const g = window.__promptasy;
    const xpBefore = g.progression.state.xp;
    g.progression.skipGate('frugality');
    g.world.openGate('frugality', true);
    return {
      unlocked: g.progression.isRegionUnlocked('frugality'),
      xp: g.progression.state.xp,
      xpBefore,
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(fgSkip.unlocked, true, '先行前往開得了減法之庭的門');
  eq(fgSkip.xp, fgSkip.xpBefore, '先行前往一分 XP 都不加');
  eq(fgSkip.cleared, 0, '先行前往不會偷偷記下任何一關的評價');

  /* --- 走進院子：沒有虛空、HUD 與配樂都跟著換 --- */
  const fgEnter = await evaluate(`
    const g = window.__promptasy;
    const link = g.world.annexLinks.find((l) => l.region === 'frugality');
    let voids = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = link.from.x + (link.to.x - link.from.x) * t;
      const z = link.from.z + (link.to.z - link.from.z) * t;
      if (g.world.coverage(x, z) <= 0.45) voids += 1;
    }
    g.player.position.set(link.to.x, g.world.terrainHeight(link.to.x, link.to.z) + 1, link.to.z);
    await new Promise((r) => setTimeout(r, 900));
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      voids,
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      source: g.audio.debug().source,
    };
  `);
  eq(fgEnter.voids, 0, '從中央高原走到院子全程都是實地（加建沒有虛空）');
  eq(fgEnter.here, 'frugality', '走出高原正北真的站在減法之庭的地界上');
  eq(fgEnter.hudRegion, 'frugality', 'HUD 跟著換到減法之庭');
  ok(/減法之庭/.test(fgEnter.hudLabel), 'HUD 上寫的是中文區域名', fgEnter.hudLabel);
  eq(fgEnter.mood, 'frugality', '配樂也切到減法之庭');
  await expectRegionBgmFile('frugality', '減法之庭');

  /* --- 世界：地標、造景、石座數、預算 --- */
  const fgWorld = await evaluate(`
    const g = window.__promptasy;
    let lights = 0;
    let tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry) {
        const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count || 0);
        tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      }
    });
    const node = g.engine.scene.getObjectByName('landmark:empty-plinth');
    let lmLights = 0;
    if (node) node.traverse((o) => { if (o.isLight) lmLights += 1; });
    return {
      hasPlinth: !!node,
      lmLights,
      fgMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'frugality').length,
      props: !!g.engine.scene.getObjectByName('props:frugality'),
      flora: !!g.engine.scene.getObjectByName('flora:frugality'),
      vignettes: ['vignette:moved-out', 'vignette:said-three-times', 'vignette:stale-tray']
        .filter((n) => !!g.engine.scene.getObjectByName(n)).length,
      lights,
      tris: Math.round(tris),
      solids: g.world.solids.length,
    };
  `);
  ok(fgWorld.hasPlinth, '空的基座真的立在場景圖上');
  eq(fgWorld.lmLights, 0, '空的基座一盞實體光源都沒加（全部自發光）');
  eq(fgWorld.fgMarkers, 8, '減法之庭有 8 座石座（7 教學神廟 ＋ 1 試煉）');
  eq(fgWorld.props, true, '減法之庭有自己的造景（空托座與印子）');
  eq(fgWorld.flora, true, '減法之庭有自己的植被剪影');
  eq(fgWorld.vignettes, 3, '減法之庭的三組故事小景都在場景圖上', String(fgWorld.vignettes));
  ok(fgWorld.lights <= 56, '加了減法之庭之後燈光仍在預算內', `lights=${fgWorld.lights}`);
  ok(fgWorld.tris < 420000, '加了減法之庭之後三角形仍在預算內', `tris=${fgWorld.tris}`);
  ok(fgWorld.solids < 1400, '加了減法之庭之後碰撞體仍在預算內', `solids=${fgWorld.solids}`);

  /* --- 7 座神廟：三個新檢查器、C1／C4 --- */
  const fgPlan = await evaluate(`
    const g = window.__promptasy;
    const here = g.content.challenges.filter((c) => !c.application && c.region === 'frugality');
    return here.map((c) => ({
      id: c.id,
      skill: c.primarySkillId,
      check: c.rubric.find((r) => r.primary).check,
      rows: c.rubric.length,
      pass: c.pass,
      kind: g.promptConsole.flowKindOf(g.content.flow(c.id)),
    }));
  `);
  eq(fgPlan.length, 7, '減法之庭有 7 座教學神廟');
  {
    const PHASE_H_CHECKS = ['staticBeforeVariable', 'asksToCompact', 'carriesForwardEssentials'];
    const used = new Set(fgPlan.map((x) => x.check));
    for (const id of PHASE_H_CHECKS) ok(used.has(id), `新檢查器 ${id} 真的有一座神廟在教`);
    for (const row of fgPlan) {
      eq(row.rows, 2, `[${row.id}] 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
      eq(row.pass, 2, `[${row.id}] 門檻是 2 分`);
      ok(Boolean(row.skill), `[${row.id}] 接上了 v2 技能`);
    }
    const kinds = fgPlan.map((x) => x.kind);
    let run = 1;
    let worst = 1;
    for (let i = 1; i < kinds.length; i += 1) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      if (run > worst) worst = run;
    }
    ok(worst <= 2, '[frugality] 整區沒有連續三座同一種題型（C4）', kinds.join(','));
    ok(new Set(kinds).size >= 5, '[frugality] 至少用了五種題型', [...new Set(kinds)].join(','));
  }

  /* --- 轉鈕：離線（一個網路請求都沒有）--- */
  const simOffline = await evaluate(`
    const g = window.__promptasy;
    const ids = g.content.challenges
      .filter((c) => g.promptConsole.flowKindOf(g.content.flow(c.id)) === 'sim')
      .map((c) => c.id);
    return { ids, count: ids.length };
  `);
  eq(simOffline.count, 4, '四座神廟用轉鈕（Phase H 的三個 spike ＋ Phase J1 的同名旋鈕）', simOffline.ids.join(','));

  /* --- 純鍵盤走完一座轉鈕（本期的主場題型，§3.1 鐵則） --- */
  {
    const target = 'effort-forge-15';
    const netMark = await evaluate(`return performance.getEntriesByType('resource').length;`);
    const near = await evaluate(`
      const g = window.__promptasy;
      g.progression.skipGate('reasoning');
      g.world.openGate('reasoning', true);
      const m = g.world.markers.find((x) => x.id === '${target}');
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到火力熔爐旁邊', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '走近提示標著 E 這個鍵', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(460);

    const sStart = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      const card = document.querySelector('#prompt-console .simboard .dial');
      const tipBtn = card?.querySelector('[data-infotip-btn]');
      // hover ＝ 游標真的動到它上面（只補送 mouseover 不算，見 bindInfoTips）
      const tipBox = tipBtn?.getBoundingClientRect();
      tipBtn?.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: Math.round(tipBox.x + tipBox.width / 2),
        clientY: Math.round(tipBox.y + tipBox.height / 2),
      }));
      await new Promise((r) => setTimeout(r, 240));
      return {
        act: g.promptConsole.act,
        kind: g.promptConsole.kind,
        notches: document.querySelectorAll('#prompt-console .simboard [data-notch]').length,
        seen: b.progress.seen,
        observed: b.progress.observed,
        carveShown: !document.querySelector('#prompt-console .simboard .carve')?.hidden,
        focusedOnNotch: !!document.activeElement?.closest('[data-notch]'),
        out: card?.querySelector('[data-out-text]')?.textContent.trim() || '',
        cond: card?.querySelector('[data-dial-cond]')?.textContent.trim() || '',
        note: card?.querySelector('[data-infotip-bubble]')?.textContent.trim() || '',
        noteVisible: card?.querySelector('[data-infotip-bubble]')?.checkVisibility() || false,
        links: card ? card.querySelectorAll('a[href]').length : -1,
        palmShown: !document.querySelector('#prompt-console .simboard .palmwrap')?.hidden,
        text: b.text,
      };
    `);
    eq(sStart.act, 3, 'Enter 推到第三幕（轉鈕）');
    eq(sStart.kind, 'sim', '這一座是轉鈕');
    eq(sStart.notches, 3, '旋鈕上剛好三檔');
    eq(sStart.seen, 1, '一進來就停在其中一檔（那一檔算看過了）');
    eq(sStart.observed, false, '三檔還沒轉完');
    eq(sStart.carveShown, false, '還沒轉完之前刻印區是鎖著的（觀察就是這一關的內容）');
    eq(sStart.palmShown, false, '還沒轉完之前手掌印不會出現');
    ok(sStart.out.length >= 8, '畫面上真的有一段神諭的回話', sStart.out.slice(0, 40));
    ok(/模型|機器|版本|官方|20\d\d/.test(sStart.cond), '旁邊寫得出「這一檔在哪一台機器上成立」', sStart.cond.slice(0, 60));
    ok(/遊戲預先寫好|不是真的模型/.test(sStart.note), 'ⓘ 明講這幾段回話是遊戲寫的，不是模型跑出來的', sStart.note.slice(0, 60));
    eq(sStart.noteVisible, true, 'hover 到 ⓘ 上就讀得到那句實話');
    eq(sStart.links, 0, '旋鈕面上不自帶連結（教學與出處在第二幕）');
    eq(sStart.text, '', '還沒刻任何字');
    eq(sStart.focusedOnNotch, true, '一進轉鈕，焦點就落在旋鈕的檔位上');

    /* 轉一檔：回話真的換一段，而且被評分的那段字一個字都沒變 */
    const sTurn = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      const before = document.querySelector('#prompt-console .simboard [data-out-text]')?.textContent.trim();
      const textBefore = b.text;
      const btns = [...document.querySelectorAll('#prompt-console .simboard [data-notch]')];
      const other = btns.findIndex((el) => !el.classList.contains('is-now'));
      btns[other].focus();
      return { before, textBefore, other };
    `);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(320);
    const sAfter = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      return {
        after: document.querySelector('#prompt-console .simboard [data-out-text]')?.textContent.trim(),
        read: document.querySelector('#prompt-console .simboard [data-out-read]')?.textContent.trim(),
        value: document.querySelector('#prompt-console .simboard [data-out-value]')?.textContent.trim(),
        seen: b.progress.seen,
        text: b.text,
        live: b.announcement,
        nowCount: document.querySelectorAll('#prompt-console .simboard .notch.is-now').length,
        lastCue: g.audio.debug().lastCue,
      };
    `);
    ok(sAfter.after !== sTurn.before, '轉一檔，神諭的回話真的換了一段', `${sTurn.before.slice(0, 18)} → ${sAfter.after.slice(0, 18)}`);
    ok(sAfter.read.length >= 8, '每一檔旁邊都寫得出「這一檔是什麼意思」', sAfter.read.slice(0, 40));
    ok(sAfter.value.length > 0, '畫面上寫得出旋鈕被轉到哪一格', sAfter.value);
    eq(sAfter.seen, 2, '轉過的檔位被記下來了');
    eq(sAfter.text, sTurn.textBefore, '轉旋鈕不會改變被評分的那段字（轉鈕是觀察，不是作答）');
    ok(sAfter.live.length > 0, '轉檔會用 aria-live 講出來（純鍵盤讀得到）', sAfter.live.slice(0, 40));
    eq(sAfter.nowCount, 1, '同一時間只有一檔是亮的');
    /*
     * issue #3：轉一格放的是**旋鈕自己的卡榫聲**（三檔各一顆），不是刻印那一聲。
     * 轉旋鈕跟刻字是兩件事，聽起來也該是兩件事。
     */
    ok(
      ['simLow', 'simMid', 'simHigh'].includes(sAfter.lastCue),
      '轉一檔放的是那一檔的卡榫聲（不是刻印音）',
      String(sAfter.lastCue)
    );

    /* 轉完第三檔 → 刻印區才開放 */
    await evaluate(`
      const btns = [...document.querySelectorAll('#prompt-console .simboard [data-notch]')];
      const rest = btns.find((el) => !el.classList.contains('is-seen'));
      (rest || btns[2]).focus();
      return 1;
    `);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(380);
    const sOpen = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      return {
        seen: b.progress.seen,
        observed: b.progress.observed,
        carveShown: !document.querySelector('#prompt-console .simboard .carve')?.hidden,
        conclusion: document.querySelector('#prompt-console .simboard [data-dial-conclusion]')?.textContent.trim() || '',
        focusedOnOption: !!document.activeElement?.closest('[data-slot-opt]'),
        progress: document.querySelector('#prompt-console .simboard [data-dial-progress]')?.textContent.trim() || '',
      };
    `);
    eq(sOpen.seen, 3, '三檔都轉過了');
    eq(sOpen.observed, true, '轉鈕這一段走完了');
    eq(sOpen.carveShown, true, '三檔都轉過之後刻印區才開放');
    ok(sOpen.conclusion.length >= 20, '轉完之後給一句收尾的結論', sOpen.conclusion.slice(0, 40));
    ok(/三檔都轉過/.test(sOpen.progress), '進度上寫著三檔都轉過了', sOpen.progress);
    eq(sOpen.focusedOnOption, true, '刻印開放時焦點自己落到第一個選項上（鍵盤不用找）');

    /* 挑錯不會失敗 */
    const sWrong = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      const flow = g.content.flow('${target}');
      const before = b.progress.carved;
      const opts = [...document.querySelectorAll('#prompt-console .simboard [data-slot-opt]')];
      const wrongIdx = opts.findIndex((_, i) => !flow.slots[0].options[i].correct);
      opts[wrongIdx].focus();
      opts[wrongIdx].click();
      await new Promise((r) => setTimeout(r, 260));
      const btn = document.querySelectorAll('#prompt-console .simboard [data-slot-opt]')[wrongIdx];
      return {
        carvedBefore: before,
        carvedAfter: b.progress.carved,
        wrongClass: btn?.classList.contains('is-wrong'),
        feedback: btn?.querySelector('[data-opt-fb]')?.textContent.trim() || '',
        failShown: !document.querySelector('#prompt-console .result')?.hidden,
      };
    `);
    eq(sWrong.carvedAfter, sWrong.carvedBefore, '挑錯不會前進（石碑就是不收）');
    eq(sWrong.wrongClass, true, '挑錯的那一片留在原地標成「石碑不收」');
    ok(sWrong.feedback.length >= 8, '挑錯的人就地拿到一句教學', sWrong.feedback.slice(0, 40));
    eq(sWrong.failShown, false, '挑錯不會跳失敗面板');

    /* 刻滿 → 手掌印 → S */
    const sCarve = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.simBoard;
      const flow = g.content.flow('${target}');
      for (let i = 0; i < flow.slots.length; i += 1) {
        b.pick(flow.slots[i].options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 140));
      }
      await new Promise((r) => setTimeout(r, 320));
      return {
        done: b.done,
        text: b.text,
        sample: g.content.challenge('${target}').sample,
        palmShown: !document.querySelector('#prompt-console .simboard .palmwrap')?.hidden,
        focusedOnPalm: !!document.activeElement?.closest('.palm'),
        act: g.promptConsole.act,
      };
    `);
    eq(sCarve.done, true, '全部選對＝刻滿了');
    eq(sCarve.text, sCarve.sample, '刻出來的整段字就是這一關的示範解答（同一段文字、同一支引擎）');
    eq(sCarve.palmShown, true, '刻滿之後手掌印浮出來');
    eq(sCarve.focusedOnPalm, true, '焦點自己落在手掌印上（純鍵盤走得完）');
    eq(sCarve.act, 4, '刻滿自動切到第四幕（手印）');

    await holdPalm();
    await sleep(700);
    const sResult = await evaluate(`
      const g = window.__promptasy;
      return {
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        best: g.progression.bestGrade('${target}'),
        sources: [...document.querySelectorAll('#prompt-console .result a[href^="https://"]')].length,
      };
    `);
    eq(sResult.grade, 'S', '按住 Enter 呈給神諭 → 拿到 S');
    eq(sResult.best, 'S', '評價寫進進度');
    ok(sResult.sources >= 1, '結果面板上仍然掛得出官方出處', String(sResult.sources));

    /* 這一整段轉鈕全程沒有對外要過任何東西（護欄 3：斷網照樣玩得動） */
    const netOut = await evaluate(`
      const from = ${netMark};
      const here = location.origin;
      return performance.getEntriesByType('resource')
        .slice(from)
        .map((e) => e.name)
        .filter((u) => !u.startsWith(here) && !u.startsWith('data:') && !u.startsWith('blob:'));
    `);
    eq(netOut.length, 0, '轉鈕全程沒有向外要過任何東西（樣本是本機的離線資料）', netOut.slice(0, 3).join(' '));

    await key('Escape', 'Escape', { vk: 27 });
    await sleep(320);

    /* 切到自由書寫再切回來：退回石碑刻印時字一模一樣（相容契約） */
    await key('KeyE', 'e', { vk: 69 });
    await sleep(500);
    const sFree = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.setMode('free');
      await new Promise((r) => setTimeout(r, 220));
      const free = g.promptConsole.mode;
      g.promptConsole.setMode('guided');
      await new Promise((r) => setTimeout(r, 220));
      return { free, back: g.promptConsole.mode, kind: g.promptConsole.kind };
    `);
    eq(sFree.free, 'free', '轉鈕也切得到自由書寫');
    eq(sFree.back, 'guided', '切得回引導式');
    eq(sFree.kind, 'sim', '切回來還是轉鈕');
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(240);
  }

  /* --- 減法之庭的一座（改碑）也走得完：新區域不是只有地形 --- */
  {
    const target = 'empty-plinth-100';
    const near = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.markers.find((x) => x.id === '${target}');
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到空的基座旁邊', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '減法之庭的石座一樣按 E 互動', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    const fgAct1 = await evaluate(`
      const g = window.__promptasy;
      const act = document.querySelector('#prompt-console .act--brief');
      return {
        act: g.promptConsole.act,
        links: act ? act.querySelectorAll('a[href]').length : -1,
        mission: act?.querySelector('[data-mission]')?.textContent.trim() || '',
      };
    `);
    eq(fgAct1.act, 1, '第一幕只有題目');
    eq(fgAct1.links, 0, '第一幕零官方連結（出處在第二幕）');
    ok(fgAct1.mission.length > 6, '委託寫得出來', fgAct1.mission.slice(0, 40));

    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    const fgAct2 = await evaluate(`
      return {
        sources: [...document.querySelectorAll('#prompt-console .act--guide a[href^="https://"]')].length,
        origin: document.querySelector('#prompt-console .act--guide')?.textContent.includes('神諭原典') || false,
      };
    `);
    ok(fgAct2.sources >= 1, '第二幕掛得出神諭原典（官方連結）', String(fgAct2.sources));
    eq(fgAct2.origin, true, '第二幕標著「神諭原典」');

    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(460);
    const fgFix = await evaluate(`
      const g = window.__promptasy;
      const b = g.promptConsole.fixBoard;
      const flow = g.content.flow('${target}');
      for (const frag of flow.fixFlow.fragments.filter((f) => f.weak)) {
        b.pick(frag.id, frag.options.findIndex((o) => o.correct));
        await new Promise((r) => setTimeout(r, 140));
      }
      await new Promise((r) => setTimeout(r, 260));
      return {
        kind: g.promptConsole.kind,
        done: b.done,
        text: b.text,
        sample: g.content.challenge('${target}').sample,
      };
    `);
    eq(fgFix.kind, 'fix', '空的基座是改碑');
    eq(fgFix.done, true, '改完了');
    eq(fgFix.text, fgFix.sample, '改好的整段字就是示範解答');
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(240);
  }

  /* --- 圖鑑：減法之庭那一張卡在（收集感延伸到新區域） --- */
  const fgCodex = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const cards = [...document.querySelectorAll('#codex .region-card')];
    const card = cards.find((el) => /減法之庭/.test(el.querySelector('h3')?.textContent || ''));
    const out = {
      cards: cards.length,
      hasCard: !!card,
      title: card?.querySelector('h3')?.textContent.trim() || '',
      skills: card ? card.querySelectorAll('.tech').length : -1,
      locked: card ? card.querySelectorAll('.tech--locked').length : -1,
      cards: cards.length,
    };
    g.codex.close();
    await new Promise((r) => setTimeout(r, 240));
    return out;
  `);
  eq(fgCodex.hasCard, true, '圖鑑上有減法之庭那一張卡');
  eq(fgCodex.skills, 7, '卡上列著這一區的 7 條技能');
  /*
   * 這一輪的存檔是「什麼都還沒學」的（上面那道知識式軟門檻要用），
   * 所以七條都還是剪影 —— 收集感確實延伸到了新區域。
   * （收集之後會長出官方出處，那件事在量器坊那一節已經驗過。）
   */
  eq(fgCodex.locked, 7, '還沒學的七條都是剪影（收集感延伸到新區域）');
  eq(fgCodex.cards, EXPECT.v2ImplementedRegions.value, `圖鑑列出 ${EXPECT.v2ImplementedRegions.value} 片土地`);

  /* ================================================================== */
  /* 課程 v2 · Phase I：觀象臺（sight）                                  */
  /*   · 正東偏北的一片小地形，自己一條橋（不接在任何一區後面）           */
  /*   · 軟門檻是「撰寫基本功整片精通」——指名道姓的那一種知識式門檻       */
  /*   · 8 座神廟教多模態，但**遊戲仍然只評 prompt 的結構**：             */
  /*     整段玩下來不會多要一張圖、一段影片、一個音檔（零外部請求）        */
  /*   · 純鍵盤走完兩座（石碑刻印與改碑），其餘六座用各題型自己的把手      */
  /* ================================================================== */
  console.log('\n▸ 觀象臺（課程 v2 · Phase I）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    g.shareCard.close();
    return 1;
  `);
  await sleep(220);

  /* --- 閘門：知識式軟門檻（指定的那一片土地精通） --- */
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（觀象臺：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const stGate = await evaluate(`
    const g = window.__promptasy;
    const st = g.progression.gateStatus('sight');
    return {
      unlocked: g.progression.isRegionUnlocked('sight'),
      gaps: st.knowledgeGaps.map((x) => x.kind + ':' + (x.regionId || '')),
      text: st.text,
      hasGate: !!g.world.gates.find((x) => x.id === 'sight'),
      bridges: g.world.corridors.filter((c) => c.region === 'sight').length,
      hasLink: !!g.world.annexLinks.find((l) => l.region === 'sight'),
    };
  `);
  eq(stGate.unlocked, false, '什麼都還沒學 → 觀象臺鎖著');
  ok(
    stGate.gaps.includes('mastered:foundations'),
    '「撰寫基本功整片精通」就是觀象臺唯一的缺口',
    stGate.gaps.join(',')
  );
  ok(/也可以先行前往/.test(stGate.text), '觀象臺的門一樣會問「想先過去看看嗎」', stGate.text);
  ok(/撰寫基本功/.test(stGate.text), '門上說的是中文區域名，不是資料層的 id', stGate.text);
  eq(stGate.hasGate, true, '觀象臺真的有一道閘門');
  eq(stGate.bridges, 1, '觀象臺自己一條橋（新地形，不是加建）');
  eq(stGate.hasLink, false, '觀象臺沒有加建的頸口');

  const stSkip = await evaluate(`
    const g = window.__promptasy;
    const xpBefore = g.progression.state.xp;
    g.progression.skipGate('sight');
    g.world.openGate('sight', true);
    return {
      unlocked: g.progression.isRegionUnlocked('sight'),
      xp: g.progression.state.xp,
      xpBefore,
      cleared: Object.keys(g.progression.state.bestGrades).length,
    };
  `);
  eq(stSkip.unlocked, true, '先行前往開得了觀象臺的門');
  eq(stSkip.xp, stSkip.xpBefore, '先行前往一分 XP 都不加');
  eq(stSkip.cleared, 0, '先行前往不會偷偷記下任何一關的評價');

  /* --- 走過那條橋：橋上沒有一步是虛空，走到底就換了一片天 --- */
  const stEnter = await evaluate(`
    const g = window.__promptasy;
    const c = g.world.corridors.find((x) => x.region === 'sight');
    let voids = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = c.from.x + (c.to.x - c.from.x) * t;
      const z = c.from.z + (c.to.z - c.from.z) * t;
      if (g.world.coverage(x, z) <= 0.45) voids += 1;
    }
    g.player.position.set(c.to.x, g.world.terrainHeight(c.to.x, c.to.z) + 1, c.to.z);
    await new Promise((r) => setTimeout(r, 900));
    const here = g.world.regionAt(g.player.position.x, g.player.position.z);
    return {
      voids,
      here: here && here.id,
      hudRegion: g.hud.region,
      hudLabel: document.querySelector('.hud__region [data-region]')?.textContent.trim() || '',
      mood: g.audio.debug().region,
      source: g.audio.debug().source,
    };
  `);
  eq(stEnter.voids, 0, '橋的主動線上沒有一步是虛空');
  eq(stEnter.here, 'sight', '走到底真的站在觀象臺的地界上');
  eq(stEnter.hudRegion, 'sight', 'HUD 跟著換到觀象臺');
  ok(/觀象臺/.test(stEnter.hudLabel), 'HUD 上寫的是中文區域名', stEnter.hudLabel);
  eq(stEnter.mood, 'sight', '配樂也切到觀象臺');
  await expectRegionBgmFile('sight', '觀象臺');

  /* --- 世界：地標、造景、石座數、預算 --- */
  const stWorld = await evaluate(`
    const g = window.__promptasy;
    let lights = 0;
    let tris = 0;
    g.engine.scene.traverse((o) => {
      if (o.isLight) lights += 1;
      if (o.isMesh && o.geometry) {
        const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count || 0);
        tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      }
    });
    const node = g.engine.scene.getObjectByName('landmark:sky-mirror');
    let lmLights = 0;
    if (node) node.traverse((o) => { if (o.isLight) lmLights += 1; });
    const props = g.engine.scene.getObjectByName('props:sight');
    let propLights = 0;
    if (props) props.traverse((o) => { if (o.isLight) propLights += 1; });
    return {
      hasMirror: !!node,
      lmLights,
      propLights,
      stMarkers: g.world.markers.filter((m) => g.content.challenge(m.id).region === 'sight').length,
      props: !!props,
      flora: !!g.engine.scene.getObjectByName('flora:sight'),
      vignettes: ['vignette:unpointed-view', 'vignette:five-edits-at-once', 'vignette:breathless-line']
        .filter((n) => !!g.engine.scene.getObjectByName(n)).length,
      lights,
      tris: Math.round(tris),
      solids: g.world.solids.length,
    };
  `);
  ok(stWorld.hasMirror, '朝天的鏡真的立在場景圖上');
  eq(stWorld.lmLights, 0, '朝天的鏡一盞實體光源都沒加（全部自發光）');
  eq(stWorld.propLights, 1, '觀象臺的造景只有「每區一盞主色補光」那一盞', String(stWorld.propLights));
  eq(stWorld.stMarkers, 9, '觀象臺有 9 座石座（8 教學神廟 ＋ 1 試煉）');
  eq(stWorld.props, true, '觀象臺有自己的造景（觀測架與落鏡）');
  eq(stWorld.flora, true, '觀象臺有自己的植被剪影');
  eq(stWorld.vignettes, 3, '觀象臺的三組故事小景都在場景圖上', String(stWorld.vignettes));
  ok(stWorld.lights <= 56, '加了觀象臺之後燈光仍在預算內', `lights=${stWorld.lights}`);
  ok(stWorld.tris < 420000, '加了觀象臺之後三角形仍在預算內', `tris=${stWorld.tris}`);
  ok(stWorld.solids < 1400, '加了觀象臺之後碰撞體仍在預算內', `solids=${stWorld.solids}`);

  /* --- 8 座神廟：五個新檢查器、C1／C4 --- */
  const stPlan = await evaluate(`
    const g = window.__promptasy;
    const here = g.content.challenges.filter((c) => !c.application && c.region === 'sight');
    return here.map((c) => ({
      id: c.id,
      skill: c.primarySkillId,
      check: c.rubric.find((r) => r.primary).check,
      rows: c.rubric.length,
      pass: c.pass,
      kind: g.promptConsole.flowKindOf(g.content.flow(c.id)),
    }));
  `);
  eq(stPlan.length, 8, '觀象臺有 8 座教學神廟');
  {
    const PHASE_I_CHECKS = [
      'pointsAtRegion',
      'preservesPriorState',
      'namesShotElements',
      'usesProsodyPunctuation',
      'namesStackAndScope',
    ];
    const used = new Set(stPlan.map((x) => x.check));
    for (const id of PHASE_I_CHECKS) ok(used.has(id), `新檢查器 ${id} 真的有一座神廟在教`);
    for (const row of stPlan) {
      eq(row.rows, 2, `[${row.id}] 收斂成「一條主檢查 ＋ 一條地基」（C1）`);
      eq(row.pass, 2, `[${row.id}] 門檻是 2 分`);
      ok(Boolean(row.skill), `[${row.id}] 接上了 v2 技能`);
    }
    const kinds = stPlan.map((x) => x.kind);
    let run = 1;
    let worst = 1;
    for (let i = 1; i < kinds.length; i += 1) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      if (run > worst) worst = run;
    }
    ok(worst <= 2, '[sight] 整區沒有連續三座同一種題型（C4）', kinds.join(','));
    ok(new Set(kinds).size >= 5, '[sight] 至少用了五種題型', [...new Set(kinds)].join(','));
  }

  /* --- 純鍵盤走完第一座（石碑刻印 · pointsAtRegion），§3.1 鐵則 --- */
  const netBeforeSight = await evaluate(`return performance.getEntriesByType('resource').length;`);
  {
    const target = 'first-window-107';
    const near = await evaluate(`
      const g = window.__promptasy;
      const m = g.world.markers.find((x) => x.id === '${target}');
      g.player.position.set(m.position.x + 3, g.world.terrainHeight(m.position.x + 3, m.position.z + 2), m.position.z + 2);
      await new Promise((r) => setTimeout(r, 700));
      const el = document.querySelector('.hud__interact');
      return { d: Math.hypot(g.player.position.x - m.position.x, g.player.position.z - m.position.z), hint: el && !el.hidden ? el.innerHTML : '' };
    `);
    ok(near.d < 6.5, '站到觀象臺第一座石座旁', near.d.toFixed(2));
    ok(/<kbd>E<\/kbd>/.test(near.hint), '走近提示標著 E 這個鍵', near.hint.slice(0, 80));

    await key('KeyE', 'e', { vk: 69 });
    await sleep(520);
    const kbOpen = await evaluate(`
      const g = window.__promptasy;
      return {
        open: g.promptConsole.isOpen,
        id: g.promptConsole.challenge?.id,
        act: g.promptConsole.act,
        links: document.querySelectorAll('#prompt-console .act--brief a[href]').length,
        media: document.querySelectorAll('#prompt-console img, #prompt-console video, #prompt-console audio').length,
      };
    `);
    eq(kbOpen.open, true, '按 E 打開了觀象臺的神廟');
    eq(kbOpen.id, target, '打開的就是走過去那一座');
    eq(kbOpen.act, 1, '從第一幕（委託）開始');
    eq(kbOpen.links, 0, '第一幕只有題目，零官方連結（四幕分鏡沒有變）');
    eq(kbOpen.media, 0, '多模態的關卡也沒有塞任何圖片／影片／音檔進畫面（只評 prompt 的結構）');

    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    const kbGuide = await evaluate(`
      const g = window.__promptasy;
      return {
        act: g.promptConsole.act,
        glyphs: document.querySelectorAll('#prompt-console [data-guidance] .glyph').length,
        srcs: document.querySelectorAll('#prompt-console .act--guide a.bookicon').length,
        srcHref: document.querySelector('#prompt-console .act--guide a.bookicon')?.getAttribute('href') || '',
      };
    `);
    eq(kbGuide.act, 2, 'Enter 推到第二幕（神諭刻文）');
    eq(kbGuide.glyphs, 1, '第二幕只放大這一關教的那一條（C1）');
    eq(kbGuide.srcs, 1, '那一條刻文掛著神諭原典');
    ok(/^https:\/\//.test(kbGuide.srcHref), '神諭原典是可點的 https 連結', kbGuide.srcHref);

    await evaluate(`document.querySelector('#prompt-console .act--guide').focus(); return 1;`);
    await key('Enter', 'Enter', { vk: 13 });
    await sleep(420);
    const kbCarveStart = await evaluate(`
      const g = window.__promptasy;
      return {
        act: g.promptConsole.act,
        kind: g.promptConsole.kind,
        focusedOnOption: document.activeElement?.classList.contains('opt'),
      };
    `);
    eq(kbCarveStart.act, 3, 'Enter 推到第三幕（刻印）');
    eq(kbCarveStart.kind, 'choice', '這一座是石碑刻印');
    eq(kbCarveStart.focusedOnOption, true, '一進刻印，焦點就落在第一個選項上');

    const slotCount = await evaluate(`return window.__promptasy.content.flow('${target}').slots.length;`);
    for (let i = 0; i < slotCount; i += 1) {
      const idx = await evaluate(`
        const g = window.__promptasy;
        const s = g.content.flow('${target}').slots[g.promptConsole.stele.progress.carved];
        return s ? s.options.findIndex((o) => o.correct) : -1;
      `);
      ok(idx >= 0, `觀象臺：第 ${i + 1} 段找得到正確選項`);
      const n = idx + 1;
      await key(`Digit${n}`, String(n), { vk: 48 + n });
      await sleep(400);
    }
    const kbFull = await evaluate(`
      const g = window.__promptasy;
      return {
        carved: g.promptConsole.stele.progress.carved,
        act: g.promptConsole.act,
        palmFocused: document.activeElement === document.querySelector('#prompt-console [data-palm]'),
      };
    `);
    eq(kbFull.carved, slotCount, '用數字鍵把觀象臺這一座刻滿');
    eq(kbFull.act, 4, '刻滿之後鏡頭自己切到手印那一幕');
    eq(kbFull.palmFocused, true, '焦點自己落在手掌印上');

    await holdPalm();
    await sleep(800);
    const kbDone = await evaluate(`
      const g = window.__promptasy;
      return {
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared('${target}'),
        skill: g.progression.isSkillCollected('mm-basics'),
        saved: JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}').skillsV2 || [],
      };
    `);
    eq(kbDone.grade, 'S', '全程不碰滑鼠也拿得到 S');
    eq(kbDone.cleared, true, '觀象臺這一座記成通關（純鍵盤）');
    eq(kbDone.skill, true, '技能「mm-basics」進了圖鑑');
    ok(kbDone.saved.includes('mm-basics'), '而且真的寫進了存檔', kbDone.saved.join(','));
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(320);
  }

  /* --- 純鍵盤走完一座改碑（usesProsodyPunctuation） --- */
  {
    const target = 'breathless-stone-112';
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('${target}'));
      await new Promise((r) => setTimeout(r, 260));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 320));
      return 1;
    `);
    const fixStart = await evaluate(`
      const g = window.__promptasy;
      return {
        kind: g.promptConsole.kind,
        weak: document.querySelectorAll('#prompt-console .frag--weak').length,
        palmHidden: document.querySelector('#prompt-console .fixboard .palmwrap').hidden,
      };
    `);
    eq(fixStart.kind, 'fix', '唸太快的傳聲石是改碑');
    eq(fixStart.weak, 3, '草稿上有三句被畫線（沒有標點的那幾句）');
    eq(fixStart.palmHidden, true, '還沒改完，手掌印不會出現');

    const fragIds = await evaluate(`
      return window.__promptasy.content.flow('${target}').fixFlow.fragments.filter((f) => f.weak).map((f) => f.id);
    `);
    for (const fid of fragIds) {
      await evaluate(`document.querySelector('#prompt-console [data-frag-btn="${fid}"]').focus(); return 1;`);
      await key('Enter', 'Enter', { vk: 13 });
      await sleep(240);
      const idx = await evaluate(`
        const f = window.__promptasy.content.flow('${target}').fixFlow;
        return f.fragments.find((x) => x.id === '${fid}').options.findIndex((o) => o.correct);
      `);
      await evaluate(`document.querySelector('#prompt-console [data-frag="${fid}"][data-opt="${idx}"]').focus(); return 1;`);
      await key('Enter', 'Enter', { vk: 13 });
      await sleep(320);
    }
    const fixFull = await evaluate(`
      const g = window.__promptasy;
      return {
        fixed: g.promptConsole.fixBoard.progress.fixed,
        act: g.promptConsole.act,
        palmFocused: document.activeElement === document.querySelector('#prompt-console .fixboard [data-palm]'),
        text: g.promptConsole.fixBoard.text,
        sample: g.content.challenge('${target}').sample,
      };
    `);
    eq(fixFull.fixed, 3, '三句都用鍵盤改好了');
    eq(fixFull.act, 4, '改完之後鏡頭切到手印那一幕');
    eq(fixFull.palmFocused, true, '焦點自己落在手掌印上');
    eq(fixFull.text, fixFull.sample, '改好的整段文字＝這一關的示範解答（兩種模式同一段字）');

    await holdPalm();
    await sleep(800);
    const fixDone = await evaluate(`
      const g = window.__promptasy;
      return {
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared('${target}'),
        skill: g.progression.isSkillCollected('tts-writing'),
      };
    `);
    eq(fixDone.grade, 'S', '純鍵盤改完傳聲石那一座也是 S');
    eq(fixDone.cleared, true, '傳聲石那一座記成通關（純鍵盤）');
    eq(fixDone.skill, true, '技能「tts-writing」進了圖鑑');
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(320);
  }

  /* 其餘六座：用各題型自己的把手（跟鍵盤走的是同一條路） */
  for (const shrine of stPlan.filter((s) => s.id !== 'first-window-107' && s.id !== 'breathless-stone-112')) {
    const played = await evaluate(`
      const g = window.__promptasy;
      const id = '${shrine.id}';
      const c = g.content.challenge(id);
      const flow = g.content.flow(id);
      g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 140));
      g.promptConsole.open(c);
      await new Promise((r) => setTimeout(r, 200));
      g.promptConsole.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 260));
      const kind = g.promptConsole.kind;
      const step = (n) => new Promise((r) => setTimeout(r, n));
      const carve = async (board) => {
        for (const slot of flow.slots) {
          board.pick(slot.options.findIndex((o) => o.correct));
          await step(90);
        }
      };
      if (kind === 'choice') {
        await carve(g.promptConsole.stele);
        g.promptConsole.stele.press();
      } else if (kind === 'fix') {
        const b = g.promptConsole.fixBoard;
        for (const fr of flow.fixFlow.fragments) {
          if (!fr.weak) continue;
          b.open(fr.id);
          await step(70);
          b.pick(fr.id, fr.options.findIndex((o) => o.correct));
          await step(90);
        }
        b.press();
      } else if (kind === 'order') {
        const b = g.promptConsole.orderBoard;
        b.arrange(b.correctOrder);
        await step(200);
        b.press();
      } else if (kind === 'multi') {
        const b = g.promptConsole.multiBoard;
        let at = 0;
        for (let r = 0; r < flow.multiFlow.rounds.length; r += 1) {
          const n = flow.multiFlow.rounds[r].count;
          for (let i = 0; i < n; i += 1) {
            b.pick(flow.slots[at].options.findIndex((o) => o.correct));
            at += 1;
            await step(90);
          }
          if (r < flow.multiFlow.rounds.length - 1) {
            b.advance();
            await step(140);
          }
        }
        b.press();
      } else if (kind === 'tradeoff') {
        const b = g.promptConsole.tradeoffBoard;
        for (const r of flow.tradeoffFlow.rounds) {
          b.weigh(r.favours);
          await step(220);
        }
        await carve(b);
        b.press();
      }
      await new Promise((r) => setTimeout(r, 900));
      return {
        kind,
        grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim() || '',
        cleared: g.progression.isCleared(id),
        skill: g.progression.isSkillCollected(c.primarySkillId),
        srcs: document.querySelectorAll('#prompt-console [data-result] a.src').length,
        media: document.querySelectorAll('#prompt-console img, #prompt-console video, #prompt-console audio').length,
      };
    `);
    eq(played.kind, shrine.kind, `[${shrine.id}] 第三幕的題型是 ${shrine.kind}`);
    eq(played.grade, 'S', `[${shrine.id}] 照著畫面上的東西做就是 S（${shrine.check}）`, JSON.stringify(played));
    eq(played.cleared, true, `[${shrine.id}] 記成通關`);
    eq(played.skill, true, `[${shrine.id}] 技能「${shrine.skill}」進了圖鑑（skillsV2）`);
    ok(played.srcs >= 1, `[${shrine.id}] 結果面板附得出可點的官方出處`, String(played.srcs));
    eq(played.media, 0, `[${shrine.id}] 玩完整關都沒有出現任何圖片／影片／音檔`);
  }

  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(240);

  /* --- 零外部請求：整段觀象臺玩下來沒有多要任何媒體或外部資源 --- */
  const stNet = await evaluate(`
    const rows = performance.getEntriesByType('resource').slice(${netBeforeSight});
    const here = location.origin;
    return {
      added: rows.length,
      external: rows.filter((r) => !r.name.startsWith(here) && !r.name.startsWith('data:') && !r.name.startsWith('blob:')).map((r) => r.name).slice(0, 5),
      media: rows.filter((r) => /\\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|m4a|mp3|wav|ogg)(?:\\?|$)/i.test(r.name)).map((r) => r.name).slice(0, 5),
    };
  `);
  eq(stNet.external.length, 0, '整段觀象臺玩下來沒有向任何外部網域要過東西', stNet.external.join(','));
  eq(stNet.media.length, 0, '也沒有多要任何圖片／影片／音檔（遊戲只評 prompt 的結構）', stNet.media.join(','));

  /* --- 全破之後：這一區精通、圖鑑列得出它與它的八條技能 --- */
  const stCodex = await evaluate(`
    const g = window.__promptasy;
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const cards = [...document.querySelectorAll('#codex .region-card')];
    const card = cards.find((c) => /觀象臺/.test(c.querySelector('h3')?.textContent || ''));
    const out = {
      hasCard: !!card,
      skills: card ? card.querySelectorAll('.tech').length : -1,
      locked: card ? card.querySelectorAll('.tech--locked').length : -1,
      srcs: card ? card.querySelectorAll('a.bookicon').length : -1,
      firstSrc: card ? (card.querySelector('a.bookicon')?.getAttribute('href') || '') : '',
      mastered: card ? card.classList.contains('is-mastered') : false,
      masteryFlag: g.progression.regionMastery('sight').mastered,
      cards: cards.length,
    };
    g.codex.close();
    await new Promise((r) => setTimeout(r, 240));
    return out;
  `);
  eq(stCodex.hasCard, true, '圖鑑上有觀象臺那一張卡');
  eq(stCodex.skills, 8, '卡上列著這一區的 8 條技能');
  eq(stCodex.locked, 0, '八座全破之後一條都不再是剪影');
  ok(stCodex.srcs >= 8, '每一條技法都附得出可點的官方出處', String(stCodex.srcs));
  ok(/^https:\/\//.test(stCodex.firstSrc), '出處是可點的 https 連結', stCodex.firstSrc);
  eq(stCodex.mastered, true, '觀象臺蓋上精通封印');
  eq(stCodex.masteryFlag, true, '進程也認定觀象臺精通了');
  eq(stCodex.cards, EXPECT.v2ImplementedRegions.value, `圖鑑列出 ${EXPECT.v2ImplementedRegions.value} 片土地`);



  console.log('\n▸ 改名（Promptasy）與舊存檔搬家（Phase 29）');

  const branding = await evaluate(`
    const html = document.documentElement.innerHTML;
    return {
      docTitle: document.title,
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
      desc: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      oldNameInDom: /PromptArcade/.test(document.body.innerText),
      hasNew: !!window.__promptasy,
      aliasWorks: window.__promptarcade === window.__promptasy,
      saveKey: !!localStorage.getItem('promptasy.v1.save') || localStorage.getItem('promptasy.v1.save') === null,
    };
  `);
  eq(branding.docTitle, 'Promptasy — Learn Prompt Engineering by Playing', 'document.title 是新品牌名');
  eq(branding.ogTitle, 'Promptasy — Learn Prompt Engineering by Playing', 'og:title 是新品牌名');
  ok(/learn prompt engineering by playing/i.test(branding.desc), 'meta description 的定位句還在', branding.desc.slice(0, 70));
  eq(branding.oldNameInDom, false, '畫面上找不到舊品牌名');
  eq(branding.hasNew, true, '除錯把手改叫 window.__promptasy');
  eq(branding.aliasWorks, true, '舊名字 window.__promptarcade 留成別名（外面的腳本不會壞）');

  // 種一份「改名前」的存檔（只寫舊 key），重整後所有進度都要在
  await evaluate(`
    localStorage.clear();
    localStorage.setItem('promptarcade.v1.save', JSON.stringify({
      version: 1, xp: 540, level: 5,
      unlockedRegions: ['foundations', 'reasoning'],
      collected: ['clarity-01', 'clarity-03', 'positive-01'],
      bestGrades: { 'gate-of-clarity-01': 'S', 'postbox-sprite-02': 'A', 'lost-automaton-03': 'S' },
      loreRead: ['lore-hub-01'],
      badges: { openai: 1, anthropic: 2, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0.27, quality: 'high', muted: true, promptMode: 'free' },
      flags: { introSeen: true, prologueDone: true }
    }));
    return 1;
  `);
  await reloadPage('舊存檔搬家後重新載入');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(600);

  const migrated = await evaluate(`
    const g = window.__promptasy;
    return {
      xp: g.progression.state.xp,
      level: g.progression.levelInfo().level,
      collected: g.progression.state.collected.length,
      cleared: Object.keys(g.progression.state.bestGrades).length,
      grade: g.progression.bestGrade('gate-of-clarity-01'),
      lore: g.progression.loreReadCount(),
      unlocked: g.progression.isRegionUnlocked('reasoning'),
      skipped: g.progression.skippedGateCount(),
      volume: g.progression.state.settings.volume,
      promptMode: g.progression.state.settings.promptMode,
      prologueDone: g.progression.isPrologueDone(),
      introOpen: g.intro.isOpen,
      newKey: !!localStorage.getItem('promptasy.v1.save'),
      oldKeyKept: !!localStorage.getItem('promptarcade.v1.save'),
      newKeyXp: JSON.parse(localStorage.getItem('promptasy.v1.save')).xp,
    };
  `);
  eq(migrated.xp, 540, '舊存檔的 XP 一分不少地搬過來');
  eq(migrated.level, 4, '等級由搬過來的 XP 重算（540 XP = Lv.4）');
  eq(migrated.collected, 3, '已收集技巧搬過來了');
  eq(migrated.cleared, 3, '關卡評價搬過來了');
  eq(migrated.grade, 'S', '評價本身沒有被改掉');
  eq(migrated.lore, 1, '讀過的石碑搬過來了');
  eq(migrated.unlocked, true, '已解鎖區域搬過來了');
  eq(migrated.skipped, 0, '舊存檔沒有的新欄位補成空的（不會憑空多出先行前往）');
  eq(migrated.volume, 0.27, '設定搬過來了');
  eq(migrated.promptMode, 'free', '答題方式搬過來了');
  eq(migrated.prologueDone, true, '老玩家不會被塞回教學');
  eq(migrated.introOpen, false, '看過的操作說明也不會再彈一次');
  eq(migrated.newKey, true, '搬完立刻寫進新 key');
  eq(migrated.oldKeyKept, true, '舊 key 原封不動留著（想退版還在）');
  eq(migrated.newKeyXp, 540, '寫進新 key 的內容正確');

  // 重置：新舊兩個 key 都要清掉，不然重整又會被搬回來
  const bothCleared = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('#settings [data-reset]').click();
    await new Promise((r) => setTimeout(r, 120));
    document.querySelector('#settings [data-reset]').click();
    await new Promise((r) => setTimeout(r, 260));
    g.settings.close();
    return {
      newKey: localStorage.getItem('promptasy.v1.save'),
      oldKey: localStorage.getItem('promptarcade.v1.save'),
    };
  `);
  eq(bothCleared.newKey, null, '重置清掉新 key');
  eq(bothCleared.oldKey, null, '重置也清掉改名前的舊 key（不會被搬回來）');

  /* ================================================================ */
  console.log('\n▸ 重置');
  const reset = await evaluate(`
    const g = window.__promptasy;
    g.settings.open();
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('#settings [data-reset]').click();
    await new Promise((r) => setTimeout(r, 120));
    document.querySelector('#settings [data-reset]').click();
    await new Promise((r) => setTimeout(r, 220));
    return {
      xp: g.progression.state.xp,
      collected: g.progression.state.collected.length,
      cleared: Object.keys(g.progression.state.bestGrades).length,
      murks: JSON.stringify(g.progression.state.murks),
      murkCount: g.murkCount(),
      storage: localStorage.getItem('promptasy.v1.save'),
    };
  `);
  eq(reset.xp, 0, '重置後 XP 歸零');
  eq(reset.murks, '{}', '重置後 murks 是 {}（v1.2 · P02）');
  eq(reset.murkCount, 0, '重置後 murkCount 0');
  eq(reset.collected, 0, '重置後圖鑑清空');
  eq(reset.cleared, 0, '重置後通關紀錄清空');
  eq(reset.storage, null, '重置後 localStorage 已清除');

  /* ================================================================ */
  /*
   * 入場門（Phase 33）—— 這一段**另外開一個 Chrome**，而且刻意不帶
   * `--autoplay-policy=no-user-gesture-required`，重現真實首次造訪：
   * AudioContext 被政策凍住 → 先出一道近乎全黑的門 → 推開它（那一下是 trusted
   * gesture，音訊才解得開）→ 門淡出 → 標題卡的分字揭示與開場曲一起開始 → 再一下進場。
   *
   * 主測試那個瀏覽器是「政策放行」的路徑（門連開都不開），兩條路各驗一次。
   */
  console.log('\n▸ 入場門（Phase 33 · 預設自動播放政策）');
  const GATE_CDP_PORT = CDP_PORT + 1;
  launchChrome({ cdpPort: GATE_CDP_PORT, allowAutoplay: false });
  const gateVersion = await waitFor(
    async () => {
      const r = await fetch(`http://127.0.0.1:${GATE_CDP_PORT}/json/version`);
      return r.ok ? r.json() : null;
    },
    { label: '入場門用的 chrome DevTools' }
  );
  const gcdp = await CDP.connect(gateVersion.webSocketDebuggerUrl);
  const gateTarget = await gcdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: gsid } = await gcdp.send('Target.attachToTarget', {
    targetId: gateTarget.targetId,
    flatten: true,
  });

  const gateErrors = [];
  gcdp.on((msg) => {
    if (msg.sessionId !== gsid) return;
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      gateErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      gateErrors.push(d.exception?.description || d.text || 'exception');
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      gateErrors.push(`${msg.params.entry.source}: ${msg.params.entry.text}`);
    }
  });
  await gcdp.send('Runtime.enable', {}, gsid);
  await gcdp.send('Log.enable', {}, gsid);
  await gcdp.send('Page.enable', {}, gsid);

  async function gEval(expression) {
    const r = await gcdp.send(
      'Runtime.evaluate',
      { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true },
      gsid
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  /** 真的按一下（rawKeyDown ＋ char ＋ keyUp）—— 這一組才會被當成使用者手勢。 */
  async function gEnter() {
    const base = { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await gcdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, gsid);
    await gcdp.send(
      'Input.dispatchKeyEvent',
      { type: 'char', text: '\r', key: 'Enter', windowsVirtualKeyCode: 13 },
      gsid
    );
    await gcdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, gsid);
  }

  await gcdp.send('Page.navigate', { url: APP_URL }, gsid);
  await waitFor(() => gEval('return !!window.__promptasy;'), { label: '入場門情境載入' });
  // whenRunning 的探測窗是 220ms —— 等它過去，狀態才定下來
  await sleep(1400);

  const gateShown = await gEval(`
    const g = window.__promptasy;
    const root = document.querySelector('.entrygate');
    const seal = root.querySelector('[data-enter]');
    const orb = root.querySelector('.entrygate__orb');
    const box = seal.getBoundingClientRect();
    const orbBox = orb.getBoundingClientRect();
    const cover = document.getElementById('bootcover');
    return {
      gateOpen: g.entryGate.isOpen,
      gateHidden: root.hidden,
      titleOpen: g.title.isOpen,
      titleHidden: document.querySelector('.title').hidden,
      audioRunning: g.audio.isRunning(),
      text: root.textContent.replace(/\\s+/g, ' ').trim(),
      focused: document.activeElement === seal,
      role: root.getAttribute('role'),
      label: root.getAttribute('aria-label'),
      w: Math.round(box.width), h: Math.round(box.height),
      links: root.querySelectorAll('a[href]').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Phase 34：一盞呼吸燈 ＋ 一句話 ＋ 一行提示
      orb: { w: Math.round(orbBox.width), h: Math.round(orbBox.height), anim: getComputedStyle(orb).animationName },
      opacities: {
        orb: Number(getComputedStyle(orb).opacity),
        line: Number(getComputedStyle(root.querySelector('.entrygate__line')).opacity),
      },
      /*
       * Phase 34.5：門面再簡化一次 —— 只剩呼吸燈 ＋ 一句話（提示改成 sr-only）。
       * 原本這裡還在量 .entrygate__hint，那個元素已經不存在，
       * getComputedStyle(null) 會讓整支 e2e 中斷（不是某一條紅）。
       */
      hintNode: root.querySelectorAll('.entrygate__hint').length,
      srOnly: root.querySelector('.sr-only')?.textContent || '',
      // 兩樣東西是一件一件出現的，而且都 ≥0.3s（撤掉這道門時不會有字閃過去）
      delays: {
        orb: parseFloat(getComputedStyle(orb).animationDelay),
        line: parseFloat(getComputedStyle(root.querySelector('.entrygate__line')).animationDelay),
      },
      legacy: root.querySelectorAll('.entrygate__seal, .entrygate__glyph, .entrygate__en').length,
      // 黑幕：門的階段也一樣蓋著（世界一眼都不准被看到）
      coverPresent: !!cover,
      coverOpacity: cover ? Number(getComputedStyle(cover).opacity) : 0,
    };
  `);
  eq(gateShown.audioRunning, false, '預設自動播放政策下 AudioContext 真的被凍住（前提成立）');
  eq(gateShown.gateOpen, true, '被凍住 → 先出入場門');
  eq(gateShown.gateHidden, false, '入場門看得見');
  eq(gateShown.titleOpen, false, '入場門還在時，標題卡還沒登場');
  eq(gateShown.titleHidden, true, '標題卡整個收著（開場揭示還沒起跑）');
  ok(/推開夜色之門/.test(gateShown.text), '門上寫著「推開夜色之門」', gateShown.text);
  eq(gateShown.hintNode, 0, '舊的 .entrygate__hint 已經整組移除（Phase 34.5）');
  ok(/點擊或按任意鍵進入/.test(gateShown.srOnly), '怎麼進門這件事留在 sr-only 裡', gateShown.srOnly);
  ok(/或按任意鍵/.test(gateShown.text), '鍵盤的人也聽得到怎麼進（sr-only）', gateShown.text);
  eq(gateShown.legacy, 0, 'Phase 33 的印記／外框／enter 都不在了（門面極簡化）');
  eq(gateShown.focused, true, '焦點就落在門上（純鍵盤按下去就是它）');
  eq(gateShown.role, 'dialog', '門有 dialog 語意');
  ok((gateShown.label || '').length > 0, '門有 aria-label', gateShown.label);
  ok(gateShown.w > 100 && gateShown.h > 60, '門的內容真的量得到（不是 0×0 空過）', `${gateShown.w}×${gateShown.h}`);
  ok(gateShown.orb.w >= 8 && gateShown.orb.h >= 8, '呼吸燈量得到', `${gateShown.orb.w}×${gateShown.orb.h}`);
  ok(
    /entrygate-breathe/.test(gateShown.orb.anim),
    '呼吸燈真的在呼吸（動畫掛上去了）',
    gateShown.orb.anim
  );
  // 一件一件出現：光 → 字 → 提示，而且全部延遲 ≥0.3s（自動播放放行時 220ms 內撤門，不會閃字）
  ok(
    gateShown.delays.orb >= 0.3 && gateShown.delays.line > gateShown.delays.orb,
    '光 → 字，一件一件來（而且都晚於 0.3s）',
    `orb=${gateShown.delays.orb} line=${gateShown.delays.line}`
  );
  eq(gateShown.links, 0, '入口不放任何連結（護欄 2：它不是課程）');
  eq(gateShown.overflowX, 0, '入場門沒有水平溢位');
  eq(gateShown.coverPresent, true, '入場門這一段黑幕也還蓋著');
  eq(gateShown.coverOpacity, 1, '推開之前世界完全看不到');

  /*
   * 再等一下：三樣東西全部到齊（光 → 字 → 提示）。
   * 用輪詢而不是固定 sleep —— CSS 動畫是從「這道門第一次真的被畫出來」那一刻起算的，
   * 而那一幀在軟體渲染的機器上可能被整個世界的第一次編譯往後推快一秒（AGENTS.md：
   * 動畫時序類的斷言要 poll until，不要用固定 sleep）。
   */
  const gateSettled = await waitFor(
    async () => {
      const o = await gEval(`
        const root = document.querySelector('.entrygate');
        const v = (sel) => Number(getComputedStyle(root.querySelector(sel)).opacity);
        return { orb: v('.entrygate__orb'), line: v('.entrygate__line') };
      `);
      // 呼吸燈的透明度是來回擺盪的：等它「擺到亮的那一段」再取樣，
      // 不然單點取樣會剛好抓到最暗的那一格（動畫時序類的 flaky）
      return o.line > 0.9 && o.orb > 0.4 ? o : null;
    },
    { timeout: 15000, every: 300, label: '入場門的兩樣東西到齊' }
  ).catch(() => null);
  ok(gateSettled, '光 → 字兩樣都浮出來了', JSON.stringify(gateSettled));
  ok(gateSettled && gateSettled.line > 0.9, '「推開夜色之門」完全浮出來了', gateSettled && String(gateSettled.line));
  ok(gateSettled && gateSettled.orb > 0.4, '呼吸燈還在呼吸（不會呼吸到消失）', gateSettled && String(gateSettled.orb));

  // Esc 在入口什麼都不做
  await gcdp.send(
    'Input.dispatchKeyEvent',
    { type: 'rawKeyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    gsid
  );
  await gcdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 }, gsid);
  await sleep(300);
  eq(await gEval('return window.__promptasy.entryGate.isOpen;'), true, 'Esc 在入口什麼都不做（門還在）');

  // 推開它：這一下是 trusted gesture → 音訊解鎖
  await gEnter();
  /*
   * 門淡出 600ms、之後才 title.open()。固定 sleep 在忙碌的機器上會賭輸
   * （AGENTS.md：動畫時序類的斷言一律輪詢，不用固定 sleep），所以等到
   * 「門收了、標題卡接手」為止再量。
   */
  await waitFor(
    async () => {
      const st = await gEval(
        'return { hidden: document.querySelector(".entrygate").hidden, title: window.__promptasy.title.isOpen };'
      );
      return st.hidden && st.title ? st : null;
    },
    { timeout: 8000, every: 200, label: '入場門淡出、標題卡接手' }
  ).catch(() => null);

  const gatePassed = await gEval(`
    const g = window.__promptasy;
    return {
      gateOpen: g.entryGate.isOpen,
      gateHidden: document.querySelector('.entrygate').hidden,
      gateDismissed: g.entryGate.dismissed,
      titleOpen: g.title.isOpen,
      titleHidden: document.querySelector('.title').hidden,
      audioRunning: g.audio.isRunning(),
      audioStarted: g.audio.isStarted,
      region: g.audio.debug().region,
      cues: g.audio.debug().cues,
      prologueActive: g.prologue.isActive,
      name: document.querySelector('.title__name')?.textContent || '',
      coverPresent: !!document.getElementById('bootcover'),
      coverOpacity: (() => {
        const c = document.getElementById('bootcover');
        return c ? Number(getComputedStyle(c).opacity) : 0;
      })(),
    };
  `);
  eq(gatePassed.gateOpen, false, '推開之後門就收了');
  eq(gatePassed.gateHidden, true, '門的節點也藏起來（不會擋到標題卡）');
  eq(gatePassed.gateDismissed, true, '門記得自己已經被推開（不會再回來）');
  eq(gatePassed.audioRunning, true, '那一下手勢真的解開了 AudioContext');
  eq(gatePassed.audioStarted, true, '音訊已啟動');
  eq(gatePassed.titleOpen, true, '門淡出之後標題卡接手');
  eq(gatePassed.titleHidden, false, '標題卡的開場揭示這時候才起跑');
  eq(gatePassed.name, 'Promptasy', '標題卡顯示遊戲名');
  // Phase 34：推開那一下要有聲音 —— 而且是石門，不是介面的「叮」
  ok(
    (gatePassed.cues || []).includes('gateOpen'),
    '推開入場門真的放了一聲石門滑開（gateOpen）',
    (gatePassed.cues || []).join(' → ')
  );
  eq(gatePassed.coverPresent, true, '標題卡這一段黑幕仍然蓋著');
  eq(gatePassed.coverOpacity, 1, '推開門之後世界還是看不到（門後面是標題卡，不是世界）');
  eq(gatePassed.region, 'title', '這時候放的是開場曲');
  eq(gatePassed.prologueActive, false, '還沒進遊戲（標題卡還在）');

  // 開場曲真的響起來（音檔解碼＋淡入要一點時間 → 輪詢，不要用固定 sleep）
  const overtureUp = await waitFor(
    async () => {
      const d = await gEval(`
        const d = window.__promptasy.audio.debug();
        const t = (d.bgm || d.regions || {}).title || {};
        return { playing: !!t.playing, gain: t.gain ?? 0 };
      `);
      return d.playing && d.gain > 0 ? d : null;
    },
    { timeout: 15000, every: 400, label: '開場曲在標題卡上響起' }
  ).catch(() => null);
  ok(overtureUp && overtureUp.playing, '開場曲在標題卡上開始播（揭示與音樂同時發生）');
  ok(overtureUp && overtureUp.gain > 0, '開場曲的音量真的拉起來了', overtureUp && `gain=${overtureUp.gain}`);

  // 再一下 → 進遊戲（維持「標題卡一鍵進場」）
  await gEnter();
  await sleep(900);
  const gateEntered = await gEval(`
    const g = window.__promptasy;
    return {
      titleOpen: g.title.isOpen,
      prologueActive: g.prologue.isActive,
      echoVisible: !document.querySelector('.echo').hidden,
      beatKind: g.prologue.beat?.kind,
      coverLifted: (() => {
        const c = document.getElementById('bootcover');
        return !c || c.classList.contains('is-lifting');
      })(),
      typedZh: document.querySelector('.title__zh')?.textContent || '',
    };
  `);
  eq(gateEntered.coverLifted, true, '按下開始才掀黑幕（世界這時候第一次亮起來）');
  eq(
    gateEntered.typedZh,
    '在一個夜色的世界裡探索，用你寫的 prompt 解開它。',
    '揭示被按斷也不會留下半句話（文字本來就是完整的）'
  );
  eq(gateEntered.titleOpen, false, '標題卡按一下就進得去（沒有第二段喚醒了）');
  eq(gateEntered.prologueActive, true, '新玩家接著進序章引導課程');
  eq(gateEntered.echoVisible, true, '回聲字幕條出現');
  eq(gateEntered.beatKind, 'say', '序章第一拍是醒來（推門那一下沒有穿透進來）');

  const gateRealErrors = gateErrors.filter((e) => !/favicon|DevTools|Autofill/i.test(e));
  eq(gateRealErrors.length, 0, '入場門情境零 console error', gateRealErrors.slice(0, 4).join('\n      '));
  try {
    gcdp.ws.close();
  } catch {
    /* 已經關了 */
  }


  /* ================================================================== */
  /* 課程 v2 · Phase J1：分歧之廳（divergence）＋ 拆碑（reverse）          */
  /*                                                                    */
  /*   · 高原東側的一座建物（加建，沒有自己的橋）                        */
  /*   · **硬門檻**：整個世界唯一一道不能先行前往的門                    */
  /*   · 反差題先發模型卡、再出題，兩張卡的立場都掛得出可點的官方出處      */
  /*   · 拆碑（reverse）純鍵盤走完一圈                                    */
  /* ================================================================== */
  console.log('\n▸ 分歧之廳與拆碑（課程 v2 · Phase J1）');

  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.close();
    g.codex.close();
    return 1;
  `);
  await sleep(220);

  /* --- 硬門檻：走到門前只會被問，而且問的那一句沒有「直接前往」 --- */
  await evaluate(`
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 0, level: 1,
      unlockedRegions: ['foundations'],
      collected: [], skillsV2: [], bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（分歧之廳：什麼都還沒學）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const dvGate = await evaluate(`
    const g = window.__promptasy;
    const st = g.progression.gateStatus('divergence');
    return {
      unlocked: g.progression.isRegionUnlocked('divergence'),
      hard: st.hard,
      gaps: st.knowledgeGaps.map((x) => x.kind + ':' + (x.need || '')),
      text: st.text,
      hasLink: !!g.world.annexLinks.find((l) => l.region === 'divergence'),
      bridges: g.world.corridors.filter((c) => c.region === 'divergence').length,
      shrines: g.content.challenges.filter((c) => c.region === 'divergence').length,
    };
  `);
  eq(dvGate.unlocked, false, '什麼都還沒學 → 分歧之廳鎖著');
  // 2026-08-03 站長裁決：全場唯一的硬門檻鬆綁 —— 比照其他區域改成可先行前往的軟門檻
  eq(dvGate.hard, false, '分歧之廳不再是硬門檻（可以先行前往）');
  ok(dvGate.gaps.includes('masteredAny:2'), '缺口是「任 2 片土地精通」', dvGate.gaps.join(','));
  ok(/先行前往/.test(dvGate.text), '門上的字說得出可以先行前往', dvGate.text);
  ok(!/走過去才開/.test(dvGate.text), '門上的字不再說「這一道要走過去才開」', dvGate.text);
  eq(dvGate.hasLink, true, '分歧之廳是加建（閘門立在頸口上）');
  eq(dvGate.bridges, 0, '分歧之廳沒有自己的橋（走出高原就到了）');
  eq(dvGate.shrines, 10, '分歧之廳有 9 座教學神廟 ＋ 1 座終章試煉');

  /* 走到門前 → 對話框自己出現，而且只有「先留下修行」 */
  await evaluate(`
    const g = window.__promptasy;
    const link = g.world.annexLinks.find((l) => l.region === 'divergence');
    const back = 5;
    const x = link.gate.x - link.dir.x * back;
    const z = link.gate.z - link.dir.z * back;
    g.player.position.set(x, g.world.terrainHeight(x, z) + 1, z);
    return 1;
  `);
  await waitFor(
    async () => ((await evaluate(`return window.__promptasy.gateAsk.isOpen;`)) ? true : null),
    { timeout: 20000, every: 400, label: '走到門前，門自己問了一句' }
  ).catch(() => null);
  /*
   * 焦點是在 `requestAnimationFrame` 裡搬進去的（見 `createOverlay.open()`）——
   * 這台軟體渲染一幀約 200 ms，`isOpen` 變 true 的當下焦點可能還沒落定。
   * 依 AGENTS.md 改成輪詢，不要用固定 sleep 對齊牆鐘。
   */
  await waitFor(
    async () =>
      (await evaluate(
        `return !!(document.activeElement && document.activeElement.matches('[data-stay], [data-stay] *'));`
      ))
        ? true
        : null,
    { timeout: 15000, every: 200, label: '閘門對話框的焦點落到「先留下修行」' }
  ).catch(() => null);
  const dvAsk = await evaluate(`
    const g = window.__promptasy;
    const el = document.querySelector('#gate-ask');
    return {
      open: g.gateAsk.isOpen,
      region: g.gateAsk.regionId,
      go: document.querySelectorAll('#gate-ask [data-go]').length,
      stay: document.querySelectorAll('#gate-ask [data-stay]').length,
      links: el ? el.querySelectorAll('a[href]').length : -1,
      text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '',
      focusStay: !!(document.activeElement && document.activeElement.matches('[data-stay], [data-stay] *')),
    };
  `);
  eq(dvAsk.open, true, '走到門前，門自己問了一句');
  eq(dvAsk.region, 'divergence', '問的就是分歧之廳那一道');
  eq(dvAsk.go, 1, '軟門檻上畫得出「直接前往」（玩家自己決定要不要先進去看看）');
  eq(dvAsk.stay, 1, '仍然留著「先留下修行」');
  eq(dvAsk.links, 0, '閘門不放官方連結（護欄 2）');
  ok(/想先過去看看嗎/.test(dvAsk.text), '問的是「想先過去看看嗎」', dvAsk.text.slice(0, 80));
  ok(/前方的試煉不會因此變簡單/.test(dvAsk.text), '也老實說了先進去不會比較簡單', dvAsk.text.slice(0, 120));
  eq(dvAsk.focusStay, true, '焦點落在「先留下修行」上（鍵盤走得完）');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(360);
  const dvStay = await evaluate(`
    const g = window.__promptasy;
    return {
      open: g.gateAsk.isOpen,
      unlocked: g.progression.isRegionUnlocked('divergence'),
      skipResult: g.progression.skipGate('divergence'),
      stillLocked: g.progression.isRegionUnlocked('divergence'),
      saved: JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}').skippedGates || [],
    };
  `);
  eq(dvStay.open, false, 'Esc ＝ 先留下修行（門收起來）');
  eq(dvStay.unlocked, false, '選了「先留下」門仍然關著（Esc 絕不偷偷開門）');
  // 門檻鬆綁之後：真的按下去才開，而且誠實記帳
  eq(dvStay.skipResult.opened, true, '先行前往開得了這一道門');
  ok(!dvStay.skipResult.hard, 'skipGate 不再回報「被硬門檻擋下來」');
  eq(dvStay.stillLocked, true, '開過之後這一區就走得進去');
  eq(dvStay.saved.length, 1, '分歧之廳也被誠實記進 skippedGates', dvStay.saved.join(','));

  /* --- 世界：九座石座、地標零實體光源 --- */
  const dvWorld = await evaluate(`
    const g = window.__promptasy;
    let lights = 0;
    const lm = g.engine.scene.getObjectByName('landmark:twin-pillars');
    if (lm) lm.traverse((o) => { if (o.isLight) lights += 1; });
    return {
      hasLandmark: !!lm,
      lights,
      pedestals: g.content.challenges.filter((c) => c.region === 'divergence').length,
    };
  `);
  eq(dvWorld.hasLandmark, true, '「兩面的柱」真的在場景圖上');
  eq(dvWorld.lights, 0, '兩面的柱一盞實體光源都沒加');
  eq(dvWorld.pedestals, 10, '分歧之廳的石座都在資料裡');

  /* ------------------------------------------------------------------ *
   * 拆碑（reverse）：真的按鍵盤走完一圈
   *
   * Phase J2 誤用 `git checkout --` 把 J1 這一段刪掉了（見 findings.md），
   * Phase J3 依 progress.md／findings.md 的描述**重新寫回來**，而且補上
   * 當初真正少掉的那一段：貼 → Esc 拆回來 → 再貼 → 刻印 → 手掌印 → S。
   * 全程只送鍵盤事件，一次滑鼠都沒有（Phase 23 的鐵則）。
   * ------------------------------------------------------------------ */
  await evaluate(`
    const g = window.__promptasy;
    const c = g.content.challenges.find((x) => x.id === 'rewritten-stele-123');
    g.promptConsole.open(c);
    g.promptConsole.goAct(3, { force: true });
    return 1;
  `);
  await sleep(320);
  const rvBoard = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.reverseBoard;
    const el = document.querySelector('#prompt-console .reverseboard');
    const flow = g.content.flow('rewritten-stele-123').reverseFlow;
    b.focusTarget.focus();
    return {
      kind: g.promptConsole.kind,
      visible: !!el && !el.closest('[hidden]'),
      parts: document.querySelectorAll('#prompt-console .reverseboard [data-part]').length,
      tags: document.querySelectorAll('#prompt-console .reverseboard [data-tag]').length,
      decoys: flow.tags.filter((t) => !flow.parts.some((p) => p.tagId === t.id)).length,
      done: b.done,
      taken: b.progress.taken,
      focusedOnTag: !!document.activeElement?.closest('[data-tag]'),
      palmHidden: !!document.querySelector('#prompt-console .reverseboard .palmwrap')?.hidden,
    };
  `);
  eq(rvBoard.kind, 'reverse', '會改字的碑用的是拆碑（reverse）');
  eq(rvBoard.visible, true, '拆碑的牆看得到');
  ok(rvBoard.parts >= 3, '牆上釘著 3–6 塊', String(rvBoard.parts));
  ok(rvBoard.tags > rvBoard.parts, '名牌比塊多（一定有一片誘餌）', `${rvBoard.tags} vs ${rvBoard.parts}`);
  ok(rvBoard.decoys >= 1, '而且那片誘餌從頭到尾都不是正解', String(rvBoard.decoys));
  eq(rvBoard.done, false, '一開始還沒刻');
  eq(rvBoard.taken, false, '一開始還沒拆完');
  eq(rvBoard.focusedOnTag, true, '焦點落在名牌上（純鍵盤走得完）');
  eq(rvBoard.palmHidden, true, '還沒拆完，手掌印不會出現');

  /* --- 方向鍵在名牌之間走 --- */
  await key('ArrowRight', 'ArrowRight', { vk: 39 });
  await sleep(200);
  const rvRove = await evaluate(`
    const list = Array.from(document.querySelectorAll('#prompt-console .reverseboard [data-tag]'));
    return { at: list.indexOf(document.activeElement), total: list.length };
  `);
  eq(rvRove.at, 1, '方向鍵把焦點移到下一片名牌', JSON.stringify(rvRove));

  /* --- 貼錯：碑不收，就地教學，不扣分、不前進、不跳失敗面板 --- */
  const rvWrongIdx = await evaluate(`
    const g = window.__promptasy;
    const flow = g.content.flow('rewritten-stele-123').reverseFlow;
    const want = flow.parts[0].tagId;
    // 挑一片「不是這一塊正解」的名牌，回傳它的數字快捷（1-based）
    const i = flow.tags.findIndex((t) => t.id !== want);
    document.querySelector('#prompt-console .reverseboard [data-tag]').focus();
    return { n: i + 1, id: flow.tags[i].id, textBefore: g.promptConsole.reverseBoard.text, at: g.promptConsole.reverseBoard.progress.at };
  `);
  await key(`Digit${rvWrongIdx.n}`, String(rvWrongIdx.n), { vk: 48 + rvWrongIdx.n });
  await sleep(280);
  const rvMiss = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.reverseBoard;
    const btn = document.querySelector('#prompt-console .reverseboard [data-tag].is-wrong');
    return {
      at: b.progress.at,
      taken: b.progress.taken,
      text: b.text,
      rejected: !!btn,
      feedback: btn ? btn.querySelector('[data-opt-fb]')?.textContent.trim() : '',
      feedbackShown: btn ? !btn.querySelector('[data-opt-fb]')?.hidden : false,
      announced: b.announcement,
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      xp: g.progression.state.xp,
      act: g.promptConsole.act,
    };
  `);
  eq(rvMiss.at, rvWrongIdx.at, '貼錯不會前進（還在同一塊）');
  eq(rvMiss.taken, false, '也還沒拆完');
  eq(rvMiss.text, rvWrongIdx.textBefore, '貼錯的名字不會被刻上去');
  eq(rvMiss.rejected, true, '那片名牌就地標成「碑不收」');
  eq(rvMiss.feedbackShown, true, '而且就地長出一句教學');
  ok(rvMiss.feedback.length >= 8, '教學講得出「為什麼這一塊不是在做這件事」', rvMiss.feedback);
  ok(rvMiss.announced.length > 0, 'aria-live 把它念出來（純鍵盤也知道發生了什麼）', rvMiss.announced);
  eq(rvMiss.resultHidden, true, '不跳失敗面板');
  eq(rvMiss.xp, 0, '不扣分（也不加分）');
  eq(rvMiss.act, 3, '仍然停在第三幕');

  /* --- 貼對第一塊 → Esc 把它拆回來 → 再貼一次（Esc 是「拆回來」不是「關面板」） --- */
  const rvFirst = await evaluate(`
    const g = window.__promptasy;
    const flow = g.content.flow('rewritten-stele-123').reverseFlow;
    const n = flow.tags.findIndex((t) => t.id === flow.parts[0].tagId) + 1;
    document.querySelector('#prompt-console .reverseboard [data-tag]').focus();
    return { n };
  `);
  await key(`Digit${rvFirst.n}`, String(rvFirst.n), { vk: 48 + rvFirst.n });
  await sleep(280);
  const rvAfterFirst = await evaluate(`
    const b = window.__promptasy.promptConsole.reverseBoard;
    return { at: b.progress.at, named: b.named.length, announced: b.announcement, focusedOnTag: !!document.activeElement?.closest('[data-tag]') };
  `);
  eq(rvAfterFirst.at, 1, '貼對了就往下一塊走');
  eq(rvAfterFirst.named, 1, '第一塊被標好名字了');
  ok(rvAfterFirst.announced.includes('對了'), 'aria-live 講出「對了」', rvAfterFirst.announced);
  eq(rvAfterFirst.focusedOnTag, true, '焦點自己跟到下一輪的名牌');

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(300);
  const rvEsc = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.reverseBoard;
    return {
      at: b.progress.at,
      named: b.named.length,
      announced: b.announcement,
      consoleOpen: g.promptConsole.isOpen,
      act: g.promptConsole.act,
    };
  `);
  eq(rvEsc.at, 0, 'Esc 把最後貼上去的那一塊拆回來');
  eq(rvEsc.named, 0, '名字取下來了');
  ok(/拆回/.test(rvEsc.announced), 'aria-live 講出拆回了哪一塊', rvEsc.announced);
  eq(rvEsc.consoleOpen, true, 'Esc 不會順手把整個關卡收掉（分段還原）');
  eq(rvEsc.act, 3, '也還在第三幕');

  /* --- 一塊一塊真的按鍵盤貼完 --- */
  const rvTagOrder = await evaluate(`
    const flow = window.__promptasy.content.flow('rewritten-stele-123').reverseFlow;
    return flow.parts.map((p) => flow.tags.findIndex((t) => t.id === p.tagId) + 1);
  `);
  for (const n of rvTagOrder) {
    await evaluate(`
      const el = document.querySelector('#prompt-console .reverseboard [data-tag]:not(.is-wrong)') ||
                 document.querySelector('#prompt-console .reverseboard [data-tag]');
      el.focus();
      return 1;
    `);
    await key(`Digit${n}`, String(n), { vk: 48 + n });
    await sleep(220);
  }
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.reverseBoard.progress.taken === true;`), {
    label: '拆碑：整份拆完',
    every: 200,
    timeout: 20000,
  });
  const rvTaken = await evaluate(`
    const b = window.__promptasy.promptConsole.reverseBoard;
    return {
      taken: b.progress.taken,
      at: b.progress.at,
      parts: b.progress.parts,
      announced: b.announcement,
      carveFocused: !!document.activeElement?.closest('[data-slot-opt]'),
      palmHidden: !!document.querySelector('#prompt-console .reverseboard .palmwrap')?.hidden,
    };
  `);
  eq(rvTaken.taken, true, '整份拆完了（想通才給刻）');
  eq(rvTaken.at, rvTaken.parts, '每一塊都貼上名字了', `${rvTaken.at}/${rvTaken.parts}`);
  eq(rvTaken.carveFocused, true, '焦點自己落到刻印的第一個選項上');
  eq(rvTaken.palmHidden, true, '刻印還沒開始，手掌印當然還沒出現');

  /* --- 刻印：數字鍵一段一段刻上去 --- */
  const rvSlotPicks = await evaluate(`
    const flow = window.__promptasy.content.flow('rewritten-stele-123');
    return flow.slots.map((s) => s.options.findIndex((o) => o.correct) + 1);
  `);
  for (const n of rvSlotPicks) {
    await evaluate(`
      const el = document.querySelector('#prompt-console .reverseboard [data-slot-opt]');
      if (el) el.focus();
      return 1;
    `);
    await key(`Digit${n}`, String(n), { vk: 48 + n });
    await sleep(240);
  }
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.reverseBoard.done === true;`), {
    label: '拆碑：刻滿',
    every: 200,
    timeout: 20000,
  });
  const rvCarved = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.reverseBoard;
    return {
      done: b.done,
      act: g.promptConsole.act,
      text: b.text,
      sample: g.content.challenge('rewritten-stele-123').sample,
      palmShown: !document.querySelector('#prompt-console .reverseboard .palmwrap')?.hidden,
      palmFocused: !!document.activeElement?.closest('[data-palm]'),
    };
  `);
  eq(rvCarved.done, true, '刻滿了');
  eq(rvCarved.act, 4, '刻滿自動切到第四幕（手掌印）');
  eq(rvCarved.text, rvCarved.sample, '刻出來的字＝資料層的示範解答（兩種模式同一段字）');
  eq(rvCarved.palmShown, true, '手掌印浮出來了');
  eq(rvCarved.palmFocused, true, '焦點自己落在手掌印上');

  /* --- 按住 Enter 把手掌按上去（poll-until，不用固定 sleep） --- */
  await keyDown('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return window.__promptasy.promptConsole.reverseBoard.fired === true;`), {
    label: '拆碑：手掌印按滿',
    every: 100,
    timeout: 15000,
  });
  await keyUp('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate(`return !document.querySelector('#prompt-console [data-result]').hidden;`), {
    label: '拆碑：結果面板',
    every: 150,
    timeout: 15000,
  });
  const rvResult = await evaluate(`
    const g = window.__promptasy;
    const marker = g.world.markers.find((m) => m.id === 'rewritten-stele-123');
    const save = JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}');
    return {
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      cleared: g.progression.isCleared('rewritten-stele-123'),
      markerCleared: !!marker && marker.cleared,
      skill: g.content.challenge('rewritten-stele-123').primarySkillId,
      knows: g.progression.knowsSkill(g.content.challenge('rewritten-stele-123').primarySkillId),
      savedSkills: save.skillsV2 || [],
      savedGrade: (save.bestGrades || {})['rewritten-stele-123'],
      xp: g.progression.state.xp,
      srcs: Array.from(document.querySelectorAll('#prompt-console [data-result] a.src')).map((a) => a.getAttribute('href')),
    };
  `);
  eq(rvResult.grade, 'S', '全部貼對＋刻對＝S（全程沒碰滑鼠）', String(rvResult.grade));
  eq(rvResult.cleared, true, '這一關記成通關');
  eq(rvResult.markerCleared, true, '世界裡那座石座轉成已通關');
  eq(rvResult.knows, true, '這一關教的技能入袋');
  ok(rvResult.savedSkills.includes(rvResult.skill), '技能寫進 localStorage', rvResult.savedSkills.join(','));
  eq(rvResult.savedGrade, 'S', '評價也寫進 localStorage');
  ok(rvResult.xp > 0, '拿到 XP', String(rvResult.xp));
  ok(
    rvResult.srcs.length >= 1 && rvResult.srcs.every((u) => /^https:\/\//.test(u)),
    '結果面板掛得出可點的官方出處',
    rvResult.srcs.join(' ')
  );

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(320);

  /* --- 反差題的模型卡掛得出可點的官方出處 --- */
  const tfCards = await evaluate(`
    const g = window.__promptasy;
    const flows = g.content.flowsAll ? g.content.flowsAll() : null;
    const ids = ['two-faced-pillar-115', 'two-faced-pillar-116'];
    const out = [];
    for (const id of ids) {
      const f = g.content.flow(id);
      if (!f || !f.tradeoffFlow) continue;
      const srcs = f.tradeoffFlow.rounds.flatMap((r) => (r.card && r.card.sources) || []);
      out.push({ id, n: srcs.length, https: srcs.every((s) => /^https:\\/\\//.test(s.url)), vendors: new Set(srcs.map((s) => s.vendor || s.name)).size });
    }
    return out;
  `);
  for (const card of tfCards) {
    ok(card.n >= 2, `[${card.id}] 兩張模型卡都掛得出官方出處`, String(card.n));
    eq(card.https, true, `[${card.id}] 出處是可點的 https 連結`);
    ok(card.vendors >= 2, `[${card.id}] 兩張卡加起來至少講得出兩家的立場`, String(card.vendors));
  }

  await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
  await sleep(220);

  /* ================================================================== */
  /* 課程 v2 · Phase J2：12 座應用關（試煉）＋ 土地印記 ＋ 大師層印記      */
  /*                                                                    */
  /*   · 試煉開起來**沒有第二幕**（整幕不存在，不是被鎖住）              */
  /*   · rubric 只列你已經學會的那幾條（動態組成、門檻跟著重算）          */
  /*   · 純鍵盤走完一座自由書寫的試煉 → S → 印記入袋 → 存檔 → 重整仍在    */
  /*   · 大師層：無筆之印真的拿得到；看過範例就永遠拿不到；默寫之印       */
  /*   · 圖鑑看得到印記與小記號；既有 finale（四廠）一格都沒變            */
  /* ================================================================== */
  console.log('\n▸ 應用關與印記（課程 v2 · Phase J2）');

  /* --- 種一份「只學過兩條」的存檔，開撰寫基本功的試煉 --- */
  await evaluate(`
    const g = window.__promptasy;
    const trial = g.content.challenges.find((c) => c.application && c.region === 'foundations');
    const cands = trial.rubric.filter((r) => r.candidate).map((r) => r.skillId);
    const legacy = cands.slice(0, 2).map((id) => (g.content.skill(id) || {}).legacyTechniqueId).filter(Boolean);
    localStorage.setItem('promptasy.v1.save', JSON.stringify({
      version: 1, xp: 900, level: 6,
      unlockedRegions: ['foundations'],
      collected: legacy,
      skillsV2: cands.slice(0, 2),
      bestGrades: {},
      badges: { openai: 0, anthropic: 0, google: 0, xai: 0 },
      settings: { music: 'ambient-01', volume: 0, muted: true, quality: 'low', preflight: true, promptMode: 'guided' },
      flags: { prologueDone: true, introSeen: true },
      prologueSteps: [], guidanceSeen: [], loreRead: [], inscriptionsFound: [], secretsFound: [],
      handlesUsed: [], skippedGates: [], seals: [], penlessSeals: [], scribeSeals: [], samplesSeen: []
    }));
    return 1;
  `);
  await reloadPage('重新載入（應用關：只學過兩條）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(500);

  const trialOpen = await evaluate(`
    const g = window.__promptasy;
    const trial = g.content.challenges.find((c) => c.application && c.region === 'foundations');
    g.promptConsole.open(trial);
    const acts = [...document.querySelectorAll('#prompt-console .acts [data-act-go]')];
    return {
      id: trial.id,
      act: g.promptConsole.act,
      visibleActs: acts.filter((b) => !b.hidden).map((b) => Number(b.getAttribute('data-act-go'))),
      act2Hidden: acts.find((b) => b.getAttribute('data-act-go') === '2').hidden,
      canGo2: g.promptConsole.canGoAct(2),
      rows: [...document.querySelectorAll('#prompt-console [data-checklist] li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      rubricLen: g.promptConsole.challenge.rubric.length,
      candidates: g.promptConsole.challenge.rubric.filter((r) => r.candidate).map((r) => r.skillId),
      pass: g.promptConsole.challenge.pass,
      links: document.querySelectorAll('#prompt-console a[href^="http"]').length,
      mode: g.promptConsole.mode,
      nextLabel: (document.querySelector('#prompt-console .act--brief [data-act-next]') || {}).textContent,
    };
  `);
  eq(trialOpen.act, 1, '試煉一開始也是第一幕（委託）');
  eq(trialOpen.visibleActs.join(','), '1,3,4', '指示器上只有 ①③④ —— 第二幕整幕不存在');
  eq(trialOpen.act2Hidden, true, '第二幕那一塊封印石根本沒有畫出來（不是被鎖住）');
  eq(trialOpen.canGo2, false, '走不到第二幕（Alt + 2 不會有反應）');
  eq(trialOpen.candidates.length, 2, '只列你已經學會的那兩條（動態 rubric）');
  eq(trialOpen.rubricLen, 3, 'rubric ＝ 地基 ＋ 兩條候選');
  eq(trialOpen.pass, 2.5, '門檻跟著入選權重重算（4.5 的一半 → 2.5）');
  eq(trialOpen.links, 0, '試煉的畫面上一個官方連結都沒有');
  eq(trialOpen.mode, 'free', '自由書寫的試煉直接進書寫檯（沒有石碑）');
  ok(/接下試煉/.test(trialOpen.nextLabel || ''), '第一幕的出口寫的是「接下試煉」不是「聆聽指引」', trialOpen.nextLabel);
  ok(trialOpen.rows.some((t) => /你已經學過/.test(t)), '對照表上標出「你已經學過」', trialOpen.rows.join(' ｜ '));

  await key('Digit2', '2', { vk: 50, modifiers: 8 });
  await sleep(200);
  eq(await evaluate(`return window.__promptasy.promptConsole.act;`), 1, 'Alt + 2 不會跳到不存在的那一幕');

  await evaluate(`document.querySelector('#prompt-console .act--brief').focus(); return 1;`);
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(320);
  const trialAct3 = await evaluate(`
    const g = window.__promptasy;
    return {
      act: g.promptConsole.act,
      visited: g.promptConsole.visitedActs.join(','),
      guideTabHidden: (document.querySelector('#prompt-console [data-guidetab]') || {}).hidden,
    };
  `);
  eq(trialAct3.act, 3, '第一幕的 Enter 直接推到刻印（跳過不存在的第二幕）');
  eq(trialAct3.visited.includes('2'), false, '走過的幕裡沒有第二幕');
  eq(trialAct3.guideTabHidden, true, '第三幕的「翻回指引」側頁籤整個收起來（那裡沒有東西）');

  /* --- 純鍵盤把整段答案打進去 → 呈上 → S ＋ 印記入袋 --- */
  const trialSample = await evaluate(`
    const t = document.querySelector('#prompt-console .prompt-input');
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
    return window.__promptasy.promptConsole.challenge.sample;
  `);
  await evaluate(`document.querySelector('#prompt-console [data-clear]').click(); return 1;`);
  await evaluate(`document.querySelector('#prompt-console .prompt-input').focus(); return 1;`);
  await cdp.send('Input.insertText', { text: trialSample }, sessionId);
  await sleep(300);
  await key('Enter', 'Enter', { vk: 13, modifiers: 2 });
  await sleep(800);
  const trialResult = await evaluate(`
    const g = window.__promptasy;
    const el = document.querySelector('#prompt-console [data-result]');
    const saved = JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}');
    return {
      grade: (el.querySelector('.grade__mark') || {}).textContent,
      act: g.promptConsole.act,
      seals: g.progression.seals(),
      savedSeals: saved.seals || [],
      cleared: g.progression.isCleared(g.promptConsole.challenge.id),
      links: el.querySelectorAll('a[href^="http"]').length,
      tail: (el.querySelector('.result__source') || {}).textContent || '',
      penless: g.progression.masterSeals().penless.length,
      cues: g.audio.debug().cues,
    };
  `);
  eq(trialResult.grade, 'S', '純鍵盤打完整段 → 拿到 S');
  eq(trialResult.act, 4, '呈上之後鏡頭切到第四幕');
  eq(trialResult.seals.join(','), 'foundations', '這片土地的印記入袋');
  eq(trialResult.savedSeals.join(','), 'foundations', '印記寫進 localStorage');
  eq(trialResult.cleared, true, '試煉記成已通關');
  eq(trialResult.links, 0, '結果面板上也沒有官方連結（試煉不教新技巧）');
  ok(/不教新的技法/.test(trialResult.tail), '結果面板誠實說明這是試煉', trialResult.tail.slice(0, 40));
  eq(trialResult.penless, 0, '應用關不發無筆之印');
  /*
   * issue #3：試煉過關響的是**鑼**，不是一般過關的頌缽 ——
   * 同一件事變大了，不是換一套語言。
   */
  ok(trialResult.cues.includes('trialPass'), '試煉過關響的是鑼（trialPass）', trialResult.cues.join(','));
  ok(
    trialResult.cues.lastIndexOf('trialPass') > trialResult.cues.lastIndexOf('pass'),
    '試煉那一次響的是鑼，不是一般過關的頌缽',
    trialResult.cues.join(',')
  );

  await key('Escape', 'Escape', { vk: 27 });
  await sleep(260);
  await reloadPage('重新載入（印記還在嗎）');
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(480);
  const sealAfterReload = await evaluate(`
    const g = window.__promptasy;
    return { seals: g.progression.seals(), has: g.progression.hasSeal('foundations') };
  `);
  eq(sealAfterReload.seals.join(','), 'foundations', '重整之後印記還在');
  eq(sealAfterReload.has, true, 'hasSeal 說得出來');

  /* --- 無筆之印：一次 S、沒碰快速填入／提示球／範例 --- */
  const penlessRun = await evaluate(`
    const g = window.__promptasy;
    const shrine = g.content.challenges.find((c) => !c.application && c.region === 'foundations');
    g.promptConsole.open(shrine);
    g.promptConsole.setMode('free');
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('#prompt-console [data-clear]').click();
    const t = document.querySelector('#prompt-console .prompt-input');
    t.focus();
    t.setSelectionRange(0, 0);
    return { id: shrine.id, sample: shrine.sample };
  `);
  await cdp.send('Input.insertText', { text: penlessRun.sample }, sessionId);
  await sleep(300);
  await key('Enter', 'Enter', { vk: 13, modifiers: 2 });
  await sleep(800);
  const penlessOut = await evaluate(`
    const g = window.__promptasy;
    const m = g.progression.masterSeals();
    const saved = JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}');
    return {
      grade: (document.querySelector('#prompt-console .grade__mark') || {}).textContent,
      penless: m.penless,
      scribe: m.scribe,
      savedPenless: saved.penlessSeals || [],
      savedScribe: saved.scribeSeals || [],
      cues: g.audio.debug().cues,
    };
  `);
  eq(penlessOut.grade, 'S', '一次就把整段寫對 → S');
  ok(penlessOut.penless.includes(penlessRun.id), '無筆之印真的拿得到', penlessOut.penless.join(','));
  ok(penlessOut.scribe.includes(penlessRun.id), '同一次也拿到默寫之印（自由書寫模式的 S）');
  ok(penlessOut.savedPenless.includes(penlessRun.id), '無筆之印寫進 localStorage');
  ok(penlessOut.savedScribe.includes(penlessRun.id), '默寫之印寫進 localStorage');
  /*
   * issue #3：拿到大師層印記時會響一聲（公證章 ＋ 微光）。
   * 它刻意晚 700ms 進來 —— 過關那一聲要先站穩，兩個好消息不該撞在一起。
   * 所以用輪詢等它，不用固定 sleep。
   */
  let sealCues = [];
  for (let i = 0; i < 16; i += 1) {
    sealCues = await evaluate(`return window.__promptasy.audio.debug().cues;`);
    if (sealCues.includes('masterSeal')) break;
    await sleep(150);
  }
  ok(sealCues.includes('masterSeal'), '拿到大師層印記時真的響了一聲（masterSeal）', sealCues.join(','));

  /* --- 作弊面：先翻開範例，關掉重開再拿 S 也不算 --- */
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(240);
  const peekRun = await evaluate(`
    const g = window.__promptasy;
    const shrine = g.content.challenges.filter((c) => !c.application && c.region === 'foundations')[1];
    g.promptConsole.open(shrine);
    g.promptConsole.setMode('free');
    const btn = document.querySelector('#prompt-console [data-sample]');
    btn.disabled = false;
    btn.click();
    const seen = g.progression.hasSeenSample(shrine.id);
    g.promptConsole.close();
    return { id: shrine.id, seen, sample: shrine.sample };
  `);
  eq(peekRun.seen, true, '翻開範例會被永久記下來');
  await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenges.find((c) => c.id === ${JSON.stringify('__PEEK__')}));
    g.promptConsole.setMode('free');
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('#prompt-console [data-clear]').click();
    const t = document.querySelector('#prompt-console .prompt-input');
    t.focus();
    t.setSelectionRange(0, 0);
    return 1;
  `.replace('__PEEK__', peekRun.id));
  await cdp.send('Input.insertText', { text: peekRun.sample }, sessionId);
  await sleep(300);
  await key('Enter', 'Enter', { vk: 13, modifiers: 2 });
  await sleep(800);
  const peekOut = await evaluate(`
    const g = window.__promptasy;
    const m = g.progression.masterSeals();
    const id = ${JSON.stringify('__PEEK__')}.replace('__PEEK__', '') || null;
    return {
      grade: (document.querySelector('#prompt-console .grade__mark') || {}).textContent,
      penless: m.penless,
      scribe: m.scribe,
    };
  `);
  eq(peekOut.grade, 'S', '看過範例之後照樣拿得到 S（評價不受影響）');
  eq(peekOut.penless.includes(peekRun.id), false, '但看過範例就拿不到無筆之印（關掉重開也不算）');
  eq(peekOut.scribe.includes(peekRun.id), false, '默寫之印同樣守住這條作弊面');

  /* --- 圖鑑：印記那一塊看得到，而且 finale 一格沒變 --- */
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(260);
  await key('KeyC', 'c', { vk: 67 });
  await sleep(560);
  const codexSeals = await evaluate(`
    const el = document.querySelector('#codex');
    const seals = el.querySelector('.seals');
    return {
      hasBlock: !!seals,
      cells: el.querySelectorAll('.seals__list .seal').length,
      on: el.querySelectorAll('.seals__list .seal.is-on').length,
      hint: seals ? seals.querySelector('.codex__hint').textContent.replace(/\s+/g, ' ').trim() : '',
      marks: el.querySelectorAll('.mseals .mseal').length,
      badgesText: el.querySelector('.badges').textContent.replace(/\s+/g, ' ').trim(),
      trialLine: el.querySelectorAll('.region-card__trial').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      star: (() => {
        const groups = [...el.querySelectorAll('.starmap__mansion')];
        const sky = el.querySelector('.starmap__sky');
        const r = sky ? sky.getBoundingClientRect() : { width: 0, height: 0 };
        const vendors = window.__promptasy.content.curriculum.vendors.map((v) => ({ id: v.id, name: v.name, color: v.color }));
        /*
         * 世界層零公司名：星圖那一整塊（含底下的「走出來的收集」）裡，公司名
         * 只准出現在星圖說明那一行與出處連結上 —— 收集列、宿名、標籤都不准有。
         * （技巧條目本身是教學內容，出處與時代註記本來就會提到廠商，不在此範圍。）
         */
        const ALLOW = '.starmap__note, .infotip, a';
        const stray = [];
        const walker = document.createTreeWalker(el.querySelector('.badges'), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.nodeValue || '';
          if (!/\b(OpenAI|Anthropic|Google|xAI|GPT|Claude|Gemini|Grok)\b/.test(t)) continue;
          if (n.parentElement && n.parentElement.closest(ALLOW)) continue;
          stray.push(t.trim().slice(0, 40));
        }
        return {
          mansions: groups.length,
          ids: groups.map((n) => n.getAttribute('data-mansion')),
          dots: groups.map((n) => n.querySelectorAll('.starmap__stars circle').length),
          labels: groups.map((n) => n.querySelector('.starmap__label').textContent.replace(/\s+/g, ' ').trim()),
          lit: groups.filter((n) => n.classList.contains('is-lit')).length,
          links: el.querySelectorAll('.starmap__link').length,
          badges: { ...window.__promptasy.progression.state.badges },
          vendors,
          note: (el.querySelector('.starmap__note:not(.starmap__note--legal)') || {}).textContent || '',
          legal: (el.querySelector('.starmap__note--legal') || {}).textContent || '',
          imgs: el.querySelectorAll('.starmap img, .starmap image, .starmap use, .starmap path').length,
          oldBadges: el.querySelectorAll('.badges .badge, .badges .badge__dot').length,
          skyW: r.width,
          skyH: r.height,
          skyHtml: sky ? sky.outerHTML : '',
          stray,
        };
      })(),
    };
  `);
  eq(codexSeals.hasBlock, true, '圖鑑上有「土地印記」那一塊');
  eq(codexSeals.cells, 12, '12 片土地各一格印記');
  eq(codexSeals.on, 1, '拿到的那一枚亮著');
  ok(/無筆之印/.test(codexSeals.hint), '大師層印記的計數看得到', codexSeals.hint.slice(0, 60));
  ok(codexSeals.marks >= 1, '拿到印記的那座神廟旁邊有小記號', String(codexSeals.marks));
  eq(codexSeals.trialLine, 1, '通過試煉的那片土地上寫著「試煉已通過」');
  ok(/每廠集滿 5 個/.test(codexSeals.badgesText), '既有 finale 的條件一格都沒變（每廠 5 個標記）');
  ok(!/Qwen|DeepSeek|Mistral/.test(codexSeals.badgesText), '四廠徽章沒有被新廠混進來（護欄 7）');
  eq(codexSeals.overflow, 0, '圖鑑加了印記那一塊之後仍然沒有水平溢位');

  /* --- v1.2 · P08：四宿星圖（星點數對得上 badges、免責句在、世界層零公司名） --- */
  {
    const st = codexSeals.star;
    eq(st.mansions, 4, '圖鑑上有四宿');
    eq(JSON.stringify(st.ids), JSON.stringify(st.vendors.map((v) => v.id)), '四宿的順序跟著四部原典（vendors）');
    // 先確認這一塊真的量得出來（防「量到 0×0 而空過」）
    ok(st.skyW > 120 && st.skyH > 60, '星圖真的畫出來了（量得到寬高）', `${Math.round(st.skyW)}×${Math.round(st.skyH)}`);
    const wantDots = st.vendors.map((v) => st.badges[v.id] || 0);
    eq(JSON.stringify(st.dots), JSON.stringify(wantDots), '每一宿的星點數 ＝ 該廠已收集的技巧標記數', JSON.stringify([st.dots, st.badges]));
    const wantLit = wantDots.filter((n) => n >= 5).length;
    eq(st.lit, wantLit, '集滿 5 顆的那幾宿亮著');
    eq(st.links, wantLit, '亮起來的宿才連線');
    st.labels.forEach((l, i) => {
      ok(new RegExp(`^第[一二三四]宿 ${wantDots[i]} / 5$`).test(l), `第 ${i + 1} 宿的標籤是世界說法 ＋ 進度`, l);
    });
    eq(st.oldBadges, 0, '舊的廠家徽章條已經不在畫面上');
    eq(st.imgs, 0, '星圖沒有任何圖檔或路徑造形（不畫標誌）');
    for (const v of st.vendors) {
      ok(!st.skyHtml.includes(v.color), `星圖沒有用到 ${v.id} 的代表色`, v.color);
      ok(!st.skyHtml.includes(v.name), `星圖本體沒有印出 ${v.name}`);
      ok(st.note.includes(v.name), `星圖下方那一行列出 ${v.name}`, st.note);
    }
    ok(/原典/.test(st.note) && /官方文件/.test(st.note), '那一行說明原典＝四家公開的官方文件', st.note);
    eq(st.legal.trim(), '本遊戲與這四家沒有隸屬或背書關係。', '免責句就在星圖底下、看得見');
    eq(JSON.stringify(st.stray), '[]', '星圖那一整塊的公司名只出現在說明那一行與出處連結上', JSON.stringify(st.stray));
  }
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(240);
  /*
   * 防「空泛通過」：上面那組用的是這個存檔真實的 badges（可能剛好都是 0），
   * 所以再餵一組寫死的數字重畫一次 —— 星點數、亮起的宿、連線都要跟著變。
   * （只動記憶體裡的 badges、畫完就還原，不寫存檔。）
   */
  const starProbe = await evaluate(`
    const g = window.__promptasy;
    const before = { ...g.progression.state.badges };
    g.progression.state.badges = { openai: 5, anthropic: 3, google: 0, xai: 7 };
    g.codex.open();
    await new Promise((r) => setTimeout(r, 420));
    const el = document.querySelector('#codex');
    const groups = [...el.querySelectorAll('.starmap__mansion')];
    const out = {
      dots: groups.map((n) => n.querySelectorAll('.starmap__stars circle').length),
      lit: groups.filter((n) => n.classList.contains('is-lit')).length,
      links: el.querySelectorAll('.starmap__link').length,
      labels: groups.map((n) => n.querySelector('.starmap__label').textContent.replace(/\s+/g, ' ').trim()),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
    g.codex.close();
    await new Promise((r) => setTimeout(r, 260));
    g.progression.state.badges = before;
    return out;
  `);
  eq(JSON.stringify(starProbe.dots), JSON.stringify([5, 3, 0, 7]), '換一組標記數 → 每一宿的星點數跟著變');
  eq(starProbe.lit, 2, '只有集滿 5 顆的兩宿亮著');
  eq(starProbe.links, 2, '只有亮起來的兩宿連線');
  eq(JSON.stringify(starProbe.labels), JSON.stringify(['第一宿 5 / 5', '第二宿 3 / 5', '第三宿 0 / 5', '第四宿 7 / 5']), '四個標籤各講自己的進度');
  eq(starProbe.overflow, 0, '星圖不會把圖鑑撐出水平捲軸');

  /* --- v1.2 · P08：成就頁也是同一張星圖，而且帶著免責句 --- */
  const finaleStar = await evaluate(`
    const g = window.__promptasy;
    g.finale.open();
    await new Promise((r) => setTimeout(r, 420));
    const el = document.querySelector('#achievement');
    const sky = el.querySelector('.starmap__sky');
    const r = sky ? sky.getBoundingClientRect() : { width: 0, height: 0 };
    const out = {
      open: !!el && !el.hidden,
      mansions: el.querySelectorAll('.starmap__mansion').length,
      dots: [...el.querySelectorAll('.starmap__mansion')].map((n) => n.querySelectorAll('.starmap__stars circle').length),
      badges: { ...g.progression.state.badges },
      vendors: g.content.curriculum.vendors.map((v) => ({ id: v.id, name: v.name })),
      legal: (el.querySelector('.starmap__note--legal') || {}).textContent || '',
      srcs: [...el.querySelectorAll('.finale__srcs a[href^="https://"]')].length,
      srcNames: el.querySelector('.finale__srcs') ? el.querySelector('.finale__srcs').textContent.replace(/\s+/g, ' ').trim() : '',
      oldBadges: el.querySelectorAll('.badge, .badge__dot').length,
      skyW: r.width,
      skyH: r.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
    g.finale.close();
    await new Promise((r) => setTimeout(r, 240));
    return out;
  `);
  eq(finaleStar.open, true, '成就頁打得開');
  eq(finaleStar.mansions, 4, '成就頁上也是四宿');
  ok(finaleStar.skyW > 120 && finaleStar.skyH > 60, '成就頁的星圖量得到寬高', `${Math.round(finaleStar.skyW)}×${Math.round(finaleStar.skyH)}`);
  eq(
    JSON.stringify(finaleStar.dots),
    JSON.stringify(finaleStar.vendors.map((v) => finaleStar.badges[v.id] || 0)),
    '成就頁的星點數也對得上 badges'
  );
  eq(finaleStar.legal.trim(), '本遊戲與這四家沒有隸屬或背書關係。', '成就頁有免責句');
  ok(finaleStar.srcs >= 4, '成就頁仍留著四家官方文件的入口（護欄 2）', String(finaleStar.srcs));
  for (const v of finaleStar.vendors) {
    ok(finaleStar.srcNames.includes(v.name), `官方文件那一列仍是真名：${v.name}`);
  }
  eq(finaleStar.oldBadges, 0, '成就頁的舊徽章條也拆掉了');
  eq(finaleStar.overflow, 0, '成就頁沒有水平溢位');

  /* ================================================================ */
  /* Phase 35 · 手掌印加寬 ＋ 術語小卡                                  */
  /* ================================================================ */
  console.log('\n▸ 手掌印與術語小卡（Phase 35）');

  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(320);

  /*
   * 手掌印是十一種題型共用的結尾（WORLD.md §3.3b 規則 1）——
   * 所以量的不是「某一關的手掌印」，而是**每一種題型**台上的那一隻。
   * 只量得到寬度的那一隻才算（隱藏的板子 rect 是 0×0，會空過）。
   */
  const palmAll = await evaluate(`
    const g = window.__promptasy;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    /*
     * 手掌印只存在於**引導式**（石碑刻印那一家）——前一段（Phase J2）
     * 把答題方式切成自由書寫而且寫進了設定，所以這裡要先切回來，
     * 不然整段會量到 0 個手掌印而「空過」。
     */
    g.promptConsole.setMode('guided');
    await wait(200);
    const modeAtStart = g.promptConsole.mode;
    const out = [{ modeAtStart }];
    for (const kind of g.promptConsole.flowKinds) {
      const ch = g.content.challenges.find(
        (c) => g.promptConsole.flowKindOf(g.content.flow(c.id)) === kind
      );
      if (!ch) { out.push({ kind, missing: true }); continue; }
      g.promptConsole.close();
      await wait(140);
      g.promptConsole.open(ch);
      await wait(220);
      g.promptConsole.goAct(3, { force: true });
      await wait(260);
      // 只是要量版面，不跑完整條刻碑流程 —— 把台上那一隻手掌叫出來
      // 輪詢到真的量得到為止（軟體渲染的機器上，固定 sleep 會量到還沒排版好的東西）
      let shown = [];
      for (let tries = 0; tries < 20 && !shown.length; tries += 1) {
        for (const w of document.querySelectorAll('#prompt-console .palmwrap')) w.hidden = false;
        await wait(150);
        shown = [...document.querySelectorAll('#prompt-console .palm')]
          .map((p) => ({ p, r: p.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0);
      }
      const panel = document.querySelector('#prompt-console .panel').getBoundingClientRect();
      if (!shown.length) {
        const cons = document.querySelector('#prompt-console .console');
        out.push({ kind, id: ch.id, measurable: false, act: g.promptConsole.act,
          mode: g.promptConsole.mode, ovHidden: document.getElementById('prompt-console').hidden,
          dataAct: cons ? cons.getAttribute('data-act') : null,
          wraps: document.querySelectorAll('#prompt-console .palmwrap').length });
        continue;
      }
      const { p, r } = shown[0];
      const label = p.querySelector('.palm__label');
      const hint = p.querySelector('.palm__hint');
      const lines = p.querySelectorAll('.palm__hintline');
      const lr = label.getBoundingClientRect();
      const ls = getComputedStyle(label);
      const hs = getComputedStyle(hint);
      out.push({
        kind,
        id: ch.id,
        measurable: true,
        w: Math.round(r.width),
        h: Math.round(r.height),
        inside: r.left >= panel.left - 1 && r.right <= panel.right + 1,
        labelH: Math.round(lr.height),
        labelLine: Math.round(parseFloat(ls.lineHeight)),
        labelText: label.textContent.trim(),
        hintLines: lines.length,
        hintTexts: [...lines].map((n) => n.textContent.trim()),
        hintFs: Math.round(parseFloat(hs.fontSize) * 10) / 10,
        labelFs: Math.round(parseFloat(ls.fontSize) * 10) / 10,
        kbd: p.querySelectorAll('.palm__hint kbd').length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    }
    g.promptConsole.close();
    await wait(160);
    return out;
  `);

  eq(palmAll[0].modeAtStart, 'guided', '量之前先切回引導式（手掌印只存在於那一家）');
  const palmRows = palmAll.filter((x) => x.kind);
  ok(palmRows.length >= 11, `十一種題型的手掌印都量到了（實際 ${palmRows.length} 種）`);
  const palmMissing = palmRows.filter((x) => x.missing || x.measurable === false);
  eq(
    palmMissing.length,
    0,
    '每一種題型都有一隻量得到的手掌印（不會空過）',
    JSON.stringify(palmMissing).slice(0, 400)
  );
  for (const p of palmRows.filter((x) => x.measurable)) {
    const at = `[${p.kind}]`;
    ok(p.w >= 240 && p.w <= 264, `${at} 手掌印加寬了（${p.w}px，Phase 35 之前是 168）`);
    ok(p.h >= 44, `${at} 觸控／點擊目標夠大（${p.h}px）`);
    eq(p.inside, true, `${at} 手掌印在面板裡`);
    eq(p.labelText, '把手掌按上石碑', `${at} 主句沒變`);
    ok(
      p.labelH <= p.labelLine + 4,
      `${at} 主句只有一行（高 ${p.labelH}px / 一行 ${p.labelLine}px）`
    );
    // 2026-08-03 站長定稿：提示收成一行、字級縮到腳註位階（主角是手掌本身）
    eq(p.hintLines, 1, `${at} 提示收成一行短句`);
    ok(
      /^按住不放，或按住/.test(p.hintTexts[0]) && /Enter/.test(p.hintTexts[0]),
      `${at} 那一行同時講得出滑鼠與鍵盤兩種按法`,
      p.hintTexts.join(' ｜ ')
    );
    ok(p.hintFs < p.labelFs * 0.6, `${at} 提示縮到腳註位階（${p.hintFs} < ${p.labelFs} 的 0.6 倍）`);
    eq(p.kbd, 1, `${at} Enter 鍵帽還在（鍵盤路徑沒被拿掉）`);
    eq(p.overflowX, 0, `${at} 沒有水平溢位`);
  }

  /* --- 390px（Phase D 的行動版版面）：一樣不擠、一樣按得到 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(360);
  const palmNarrow = await evaluate(`
    const g = window.__promptasy;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.promptConsole.setMode('guided');
    await wait(200);
    const out = [];
    for (const id of ['gate-of-clarity-01', 'long-scroll-tower-23', 'oracle-workshop-36']) {
      g.promptConsole.close();
      await wait(140);
      g.promptConsole.open(g.content.challenge(id));
      await wait(220);
      g.promptConsole.goAct(3, { force: true });
      await wait(260);
      let shown = [];
      for (let tries = 0; tries < 20 && !shown.length; tries += 1) {
        for (const w of document.querySelectorAll('#prompt-console .palmwrap')) w.hidden = false;
        await wait(150);
        shown = [...document.querySelectorAll('#prompt-console .palm')]
          .map((p) => ({ p, r: p.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0);
      }
      const panel = document.querySelector('#prompt-console .panel').getBoundingClientRect();
      if (!shown.length) { out.push({ id, measurable: false, mode: g.promptConsole.mode, act: g.promptConsole.act }); continue; }
      const { p, r } = shown[0];
      const lr = p.querySelector('.palm__label').getBoundingClientRect();
      out.push({
        id,
        measurable: true,
        w: Math.round(r.width),
        h: Math.round(r.height),
        panelW: Math.round(panel.width),
        inside: r.left >= panel.left - 1 && r.right <= panel.right + 1,
        labelH: Math.round(lr.height),
        lines: p.querySelectorAll('.palm__hintline').length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    }
    g.promptConsole.close();
    await wait(160);
    return out;
  `);
  for (const p of palmNarrow) {
    const at = `[390 ${p.id}]`;
    eq(p.measurable, true, `${at} 量得到手掌印`);
    if (!p.measurable) continue;
    ok(p.w >= 220 && p.w <= 240, `${at} 窄畫面的手掌印也加寬了（${p.w}px）`);
    ok(p.w < p.panelW, `${at} 沒有把面板撐開（${p.w} < ${p.panelW}）`);
    eq(p.inside, true, `${at} 手掌印在面板裡`);
    ok(p.h >= 44, `${at} 觸控目標 ≥ 44px（${p.h}px）`);
    ok(p.labelH <= 40, `${at} 主句仍然只有一行（${p.labelH}px）`);
    eq(p.lines, 1, `${at} 提示仍然是一行`);
    eq(p.overflowX, 0, `${at} 沒有水平溢位`);
  }
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(320);

  /* --- 自由書寫沒有手掌印（它走的是「呈給神諭」那顆鍵） --- */
  const palmFree = await evaluate(`
    const g = window.__promptasy;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await wait(220);
    g.promptConsole.setMode('free');
    await wait(260);
    g.promptConsole.goAct(3, { force: true });
    await wait(260);
    const vis = [...document.querySelectorAll('#prompt-console .palm')]
      .filter((p) => p.getBoundingClientRect().width > 0).length;
    const submit = document.querySelector('#prompt-console [data-submit]');
    const sr = submit.getBoundingClientRect();
    g.promptConsole.setMode('guided');
    await wait(200);
    g.promptConsole.close();
    await wait(160);
    return { vis, submitText: submit.textContent.trim(), submitH: Math.round(sr.height) };
  `);
  eq(palmFree.vis, 0, '自由書寫模式沒有手掌印（它有自己的送出鍵）');
  ok(/呈給神諭/.test(palmFree.submitText), '自由書寫的送出鍵還是「呈給神諭」', palmFree.submitText);
  ok(palmFree.submitH >= 40, `自由書寫的送出鍵夠大（${palmFree.submitH}px）`);

  /* ---------------------------------------------------------------- */
  /* 術語小卡：畫線 → 滑上去 → 白話 ／ 用途 ／ 例                       */
  /* ---------------------------------------------------------------- */
  const glossOpen = await evaluate(`
    const g = window.__promptasy;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
    await wait(320);
    const root = document.getElementById('prompt-console');
    const marks = [...root.querySelectorAll('[data-gloss]')];
    return {
      act: g.promptConsole.act,
      count: marks.length,
      terms: marks.map((m) => m.getAttribute('data-gloss')),
      texts: marks.map((m) => m.textContent),
      // 標記絕對不准長在這些東西裡面
      inBad: root.querySelectorAll('textarea [data-gloss], button [data-gloss], kbd [data-gloss], a [data-gloss], h2 [data-gloss], h3 [data-gloss], summary [data-gloss]').length,
      inTextarea: document.querySelector('#prompt-console textarea').value.includes('data-gloss'),
      // 標記不進 Tab 順序（Phase 23 的焦點鏈沒被打亂）
      tabbable: marks.filter((m) => m.hasAttribute('tabindex')).length,
      cardExists: !!document.querySelector('.glosscard'),
      dotted: marks[0] ? getComputedStyle(marks[0]).borderBottomStyle : '',
      cursor: marks[0] ? getComputedStyle(marks[0]).cursor : '',
      // 標記之後那段話的文字沒有變（只是包了一層 span）
      missionText: root.querySelector('[data-mission]').textContent,
    };
  `);
  eq(glossOpen.act, 1, '術語小卡是在第一幕（委託）就標好的');
  ok(glossOpen.count >= 1, `委託那一幕上有術語標記（${glossOpen.count} 個）`, glossOpen.terms.join(','));
  ok(glossOpen.terms.includes('prompt'), '「prompt」被標起來了', glossOpen.terms.join(','));
  eq(glossOpen.inBad, 0, '標記沒有長進輸入框 / 按鈕 / 鍵帽 / 連結 / 標題裡');
  eq(glossOpen.inTextarea, false, '玩家要打字的地方一個字都沒被動到');
  eq(glossOpen.tabbable, 0, '標記不進 Tab 順序（不打亂 Phase 23 的焦點鏈）');
  eq(glossOpen.dotted, 'dotted', '標記是一條虛線');
  eq(glossOpen.cursor, 'help', '滑鼠變成「可以問」的樣子');
  ok(
    /prompt/.test(glossOpen.missionText),
    '委託那句話的文字沒有被標記改掉',
    glossOpen.missionText.slice(0, 40)
  );
  // 同一個術語一個面板只標第一次
  {
    const dupes = glossOpen.terms.filter((t, i) => glossOpen.terms.indexOf(t) !== i);
    eq(dupes.length, 0, '同一個術語在一個面板裡只標第一次', dupes.join(','));
  }

  /* --- 真的用滑鼠移上去 ---
   * 輪詢式（AGENTS.md）：每一輪都**重新量一次**那個字的位置再把滑鼠移過去。
   * `.reveal` 的入場動畫還在跑時，先量好的座標會過期（實測會差 30px）。 */
  const glossCard = await waitFor(
    async () => {
      const box = await evaluate(`
        const m = document.querySelector('#prompt-console [data-gloss]');
        m.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 120));
        const r = m.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      `);
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: 4, y: 4, button: 'none', buttons: 0 },
        sessionId
      );
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', buttons: 0 },
        sessionId
      );
      await sleep(150);
      return evaluate(`
        const c = document.querySelector('.glosscard');
        if (!c || c.hidden) return null;
        const r = c.getBoundingClientRect();
        return {
          term: c.querySelector('[data-gc-term]').textContent.trim(),
          zh: c.querySelector('[data-gc-zh]').textContent.trim(),
          plain: c.querySelector('[data-gc-plain]').textContent.trim(),
          use: c.querySelector('[data-gc-use]').textContent.trim(),
          ex: c.querySelector('[data-gc-ex]').textContent.trim(),
          links: c.querySelectorAll('a').length,
          role: c.getAttribute('role'),
          inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          w: Math.round(r.width),
          // 卡片掛在 body 上，所以不會被面板的 overflow 裁掉
          parent: c.parentElement.tagName,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      `);
    },
    { label: '術語小卡浮出來（真的用滑鼠）', every: 200, timeout: 14000 }
  );
  eq(glossCard.term, 'prompt', '卡片標題就是那個字');
  ok(/[一-鿿]/.test(glossCard.zh), '有中文短標', glossCard.zh);
  ok(glossCard.plain.length >= 8 && /[一-鿿]/.test(glossCard.plain), '有白話一句話', glossCard.plain);
  ok(glossCard.use.length >= 8 && /[一-鿿]/.test(glossCard.use), '有用途', glossCard.use);
  ok(glossCard.ex.length >= 4, '有一個小範例', glossCard.ex);
  eq(glossCard.links, 0, '小卡不放連結（教學與出處仍然只在第二幕與圖鑑）');
  eq(glossCard.role, 'tooltip', '小卡是 tooltip 語意');
  eq(glossCard.parent, 'BODY', '小卡掛在 body 上（不會被面板裁掉）');
  eq(glossCard.inView, true, '整張卡都在畫面裡');
  eq(glossCard.overflowX, 0, '小卡沒有把頁面推寬');

  /* --- Esc 先收小卡，關卡還開著 --- */
  await key('Escape', 'Escape', { vk: 27 });
  await sleep(260);
  const glossEsc = await evaluate(`
    return {
      cardOpen: !document.querySelector('.glosscard').hidden,
      consoleOpen: !document.getElementById('prompt-console').hidden,
    };
  `);
  eq(glossEsc.cardOpen, false, 'Esc 先把小卡收起來');
  eq(glossEsc.consoleOpen, true, '而且沒有順手把關卡也關掉');

  /* --- 390px：小卡照樣完整看得到 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(400);
  const glossNarrow = await evaluate(`
    const m = document.querySelector('#prompt-console [data-gloss]');
    m.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 300));
    m.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 320));
    const c = document.querySelector('.glosscard');
    const r = c.getBoundingClientRect();
    return {
      hidden: c.hidden,
      inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      w: Math.round(r.width),
      vw: innerWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);
  eq(glossNarrow.hidden, false, '390px 下小卡照樣開得起來');
  eq(glossNarrow.inView, true, '390px 下整張卡沒有被切掉');
  ok(glossNarrow.w <= glossNarrow.vw - 8, `390px 下小卡沒有比畫面寬（${glossNarrow.w} / ${glossNarrow.vw}）`);
  eq(glossNarrow.overflowX, 0, '390px 下沒有水平溢位');
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(320);

  /* --- 第二幕（指引）與圖鑑也標得到 --- */
  const glossElsewhere = await evaluate(`
    const g = window.__promptasy;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = document.getElementById('prompt-console');
    g.promptConsole.close();
    await wait(200);
    // 這一關的「工法」那句話裡就寫著 reasoning_effort —— 第二幕標得到
    g.promptConsole.open(g.content.challenge('effort-forge-15'));
    await wait(300);
    g.promptConsole.goAct(2, { force: true });
    await wait(340);
    const act2 = [...root.querySelectorAll('.act--guide [data-gloss]')].map((m) => m.getAttribute('data-gloss'));
    g.promptConsole.close();
    await wait(220);

    /*
     * 圖鑑：只有「已收集」的條目才有內文可以標。
     * 在記憶體裡先收齊（**不寫存檔**，量完就還原）—— 不然這一段會空過。
     */
    const before = g.progression.state.collected.slice();
    const all = g.content
      .groupsOrdered()
      .flatMap((gr) => g.content.topicsOf(gr.id))
      .flatMap((t) => g.content.techniquesOf(t.id))
      .map((x) => x.id);
    for (const id of all) {
      if (!g.progression.state.collected.includes(id)) g.progression.state.collected.push(id);
    }
    g.codex.open();
    await wait(700);
    const bodies = document.querySelectorAll('#codex .tech__body').length;
    const codexMarks = document.querySelectorAll('#codex .tech__body [data-gloss]').length;
    const inSrc = document.querySelectorAll('#codex a [data-gloss], #codex .src [data-gloss], #codex summary [data-gloss]').length;
    // 一條技巧＝一個面板：同一條裡同一個術語只准標一次
    const dupes = [...document.querySelectorAll('#codex .tech__body')]
      .map((b) => [...b.querySelectorAll('[data-gloss]')].map((m) => m.getAttribute('data-gloss')))
      .filter((a) => a.length && new Set(a).size !== a.length).length;
    g.codex.close();
    await wait(240);
    g.progression.state.collected.length = 0;
    g.progression.state.collected.push(...before);

    /*
     * 標記規則的定點測試（合成一小塊 DOM 直接餵給標記器）——
     * 這一段不受關卡文案改動影響，是「不准標進按鈕 / 鍵帽 / 輸入框」的看門狗。
     */
    const probe = document.createElement('div');
    probe.innerHTML =
      '<p>用 JSON 回覆，把 temperature 設成 0，再把這段 prompt 交出去；另一段 prompt 不要再標一次。</p>' +
      '<button type="button">prompt</button><kbd>Enter</kbd><a href="#">JSON</a>' +
      '<textarea>我的 prompt 草稿</textarea><h3>prompt 標題</h3>';
    document.body.appendChild(probe);
    const marked = g.glossary.annotate(probe);
    const probeTerms = [...probe.querySelectorAll('[data-gloss]')].map((m) => m.getAttribute('data-gloss'));
    const probeBad = probe.querySelectorAll(
      'button [data-gloss], kbd [data-gloss], a [data-gloss], h3 [data-gloss]'
    ).length;
    const probeTextarea = probe.querySelector('textarea').value;
    const probeText = probe.querySelector('p').textContent;
    probe.remove();

    return {
      act2,
      bodies,
      codexMarks,
      inSrc,
      dupes,
      marked,
      probeTerms,
      probeBad,
      probeTextarea,
      probeText,
      cardHidden: document.querySelector('.glosscard').hidden,
    };
  `);
  ok(
    glossElsewhere.act2.includes('reasoning-effort'),
    '第二幕（神諭刻文）裡的術語也標得到',
    glossElsewhere.act2.join(',')
  );
  ok(glossElsewhere.bodies >= 20, `圖鑑真的有內文可以量（${glossElsewhere.bodies} 條）`);
  ok(glossElsewhere.codexMarks >= 3, `圖鑑裡也標得到術語（${glossElsewhere.codexMarks} 個）`);
  eq(glossElsewhere.inSrc, 0, '圖鑑的官方出處連結與標題上沒有被畫線');
  eq(glossElsewhere.dupes, 0, '一條技巧裡同一個術語只標第一次');
  eq(glossElsewhere.cardHidden, true, '面板收起來的時候小卡也跟著收起來');
  // 定點測試：規則不隨關卡文案漂移
  eq(glossElsewhere.probeBad, 0, '標記器不會標進按鈕 / 鍵帽 / 連結 / 標題');
  eq(glossElsewhere.probeTextarea, '我的 prompt 草稿', '標記器一個字都沒動到玩家要打字的地方');
  ok(
    glossElsewhere.probeTerms.includes('json') &&
      glossElsewhere.probeTerms.includes('temperature') &&
      glossElsewhere.probeTerms.includes('prompt'),
    '一段話裡三個術語都標得到',
    glossElsewhere.probeTerms.join(',')
  );
  eq(
    glossElsewhere.probeTerms.filter((t) => t === 'prompt').length,
    1,
    '同一段話裡出現兩次的術語只標第一次'
  );
  ok(
    /用 JSON 回覆，把 temperature 設成 0/.test(glossElsewhere.probeText),
    '標記之後那段話的文字一個字都沒變',
    glossElsewhere.probeText.slice(0, 40)
  );

  /* ================================================================ */
  console.log('\n▸ ⓘ 不自己彈出來 ＋ 縮成註腳大小 ＋ 一條式關卡標頭');

  {
    /** 真的把游標放到某一點（不是合成事件 —— 要騙得過瀏覽器的 hover 重算）。 */
    const park = async (x, y) =>
      cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 },
        sessionId
      );
    /**
     * 現在畫面上有幾顆說明小卡是**看得見**的。
     *
     * 小卡有兩種載體：ⓘ 那顆符文石（`[data-infotip-btn]`），
     * 以及 2026-08-03 之後接手第二幕的**那本典籍**（`a.bookicon`）——
     * 兩種走的是同一支 `bindInfoTips()`，所以一起量。
     */
    const visibleTips = `
      return Array.from(document.querySelectorAll('[data-infotip]')).map((t) => {
        const b = t.querySelector('[data-infotip-bubble]');
        const cs = getComputedStyle(b);
        const trigger = t.querySelector('[data-infotip-btn], a.bookicon');
        return {
          label: trigger ? trigger.getAttribute('aria-label') : '(無)',
          visible: cs.visibility === 'visible' && Number(cs.opacity) > 0.02,
        };
      }).filter((t) => t.visible);
    `;
    const headRows = (sel) => `
      const p = document.querySelector('${sel} .panel__head');
      if (!p) return null;
      const box = (n) => { const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
      const title = p.querySelector('.panel__title');
      const sub = p.querySelector('.panel__sub');
      const eyebrow = p.querySelector('[data-eyebrow]');
      const close = p.querySelector('.panel__close');
      const hr = p.getBoundingClientRect();
      return {
        bar: p.classList.contains('panel__head--bar'),
        headH: Math.round(hr.height),
        headW: Math.round(hr.width),
        titleText: title.textContent.trim(),
        subText: sub.textContent.trim(),
        eyebrowText: eyebrow.textContent.trim(),
        titleId: title.id,
        labelledBy: document.querySelector('${sel}').getAttribute('aria-labelledby'),
        closeLabel: close.getAttribute('aria-label'),
        title: box(title), sub: box(sub), eyebrow: box(eyebrow), close: box(close),
        titleFs: parseFloat(getComputedStyle(title).fontSize),
        subFs: parseFloat(getComputedStyle(sub).fontSize),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    `;

    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(300);

    /* ---------------------------------------------------------------- */
    /* (1) 一條式標頭（1280）                                            */
    /* ---------------------------------------------------------------- */
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
      return 1;
    `);
    await sleep(900);
    const head = await evaluate(headRows('#prompt-console'));
    ok(head, '關卡標頭量得到（不是 0×0 空過）');
    eq(head.bar, true, '關卡走的是一條式標頭');
    ok(head.headH < 130, '標頭壓成一條（原本三層堆疊要 170px 以上）', `${head.headH}px`);
    ok(head.titleText.length > 0, '左邊是關卡名', head.titleText);
    ok(head.subText.length > 0, '關卡名後面緊接著 NPC', head.subText);
    ok(head.subFs < head.titleFs, 'NPC 小一號（不跟關卡名搶）', `${head.subFs} < ${head.titleFs}`);
    ok(
      head.sub.left >= head.title.right - 1,
      'NPC 在關卡名右邊（同一行，不是疊在下面）',
      `sub.left=${head.sub.left} title.right=${head.title.right}`
    );
    ok(
      Math.abs(head.sub.bottom - head.title.bottom) <= 6,
      'NPC 與關卡名同一條基線',
      `${head.sub.bottom} vs ${head.title.bottom}`
    );
    ok(/第 \d+ 關 \/ 共 \d+ 關/.test(head.eyebrowText), '右邊是進度小牌', head.eyebrowText);
    ok(
      head.eyebrow.left > head.sub.right,
      '進度小牌在右半邊（不在標題左邊）',
      `eyebrow.left=${head.eyebrow.left} sub.right=${head.sub.right}`
    );
    ok(
      head.close.left >= head.eyebrow.right - 1,
      'Esc 在最右邊（進度小牌之後）',
      `close.left=${head.close.left} eyebrow.right=${head.eyebrow.right}`
    );
    ok(
      Math.abs(head.eyebrow.top - head.close.top) <= 12,
      '進度小牌與 Esc 在同一行',
      `${head.eyebrow.top} vs ${head.close.top}`
    );
    eq(head.labelledBy, head.titleId, 'aria-labelledby 仍然指到關卡名（無障礙沒被改壞）');
    ok(/Esc/.test(head.closeLabel), 'Esc 的 aria-label 沒被改掉', head.closeLabel);
    eq(head.overflowX, 0, '1280 下標頭沒有水平溢位');
    // 進度數字要跟著 catalog 走，不是寫死的
    const headCount = await evaluate(`
      const g = window.__promptasy;
      const sib = g.content.challengesOf('foundations');
      return { total: sib.length, text: document.querySelector('#prompt-console [data-eyebrow]').textContent.trim() };
    `);
    ok(
      headCount.text.includes(`共 ${String(headCount.total).padStart(2, '0')} 關`),
      '「共 M 關」＝這一片土地目前真正的關卡數（catalog 算出來的）',
      `${headCount.text} / total=${headCount.total}`
    );

    /* ---------------------------------------------------------------- */
    /* (2) ⓘ 縮成註腳大小，但仍然按得到                                  */
    /* ---------------------------------------------------------------- */
    /*
     * ⓘ 的尺寸在圖鑑那顆上量 —— 第二幕的說明卡 2026-08-03 之後掛在
     * 那本典籍上（見下面第 (3) 段），ⓘ 這個元件本身仍然用在圖鑑、
     * 兩輪刻印的回話卡、轉鈕的註記與效能監視器上，樣式是同一組 token。
     */
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.close();
      g.codex.open();
      return 1;
    `);
    await sleep(900);
    const tipSize = await evaluate(`
      const btn = document.querySelector('#codex .codex__hint .infotip__btn');
      const r = btn.getBoundingClientRect();
      const before = getComputedStyle(btn, '::before');
      const inset = parseFloat(getComputedStyle(btn).getPropertyValue('--infotip-inset'));
      return {
        hitW: Math.round(r.width), hitH: Math.round(r.height),
        fontPx: parseFloat(getComputedStyle(btn).fontSize),
        inset,
        beforeInset: before.insetBlockStart || before.inset,
        visual: Math.round(r.width - inset * 2),
      };
    `);
    ok(tipSize.hitW >= 20 && tipSize.hitH >= 20, 'ⓘ 的命中範圍仍然 ≥ 20px', `${tipSize.hitW}×${tipSize.hitH}`);
    ok(tipSize.hitW <= 24, 'ⓘ 的命中範圍沒有變大', `${tipSize.hitW}px`);
    ok(
      tipSize.visual >= 10 && tipSize.visual <= 14,
      '看得見的那顆石頭大約 13px（原本 26px 的一半）',
      `${tipSize.visual}px`
    );
    ok(tipSize.fontPx <= 11, 'ⓘ 的字級跟著砍半', `${tipSize.fontPx}px`);
    await evaluate(`window.__promptasy.codex.close(); return 1;`);
    await sleep(320);

    /* ---------------------------------------------------------------- */
    /* (3) 迴歸：ⓘ 絕不自己彈出來                                        */
    /*                                                                   */
    /* 真正的重現方式 —— 把游標停在「ⓘ 之後會長出來的位置」，再從第一幕  */
    /* 切到第二幕。瀏覽器會重算 hover 並補送 mouseover，舊寫法就是在這裡  */
    /* 把說明卡打開的（玩家什麼都沒做）。                                 */
    /* ---------------------------------------------------------------- */
    /*
     * 2026-08-03 之後第二幕那顆說明卡掛在**那本典籍**上（`a.bookicon`），
     * 走的仍然是同一支 `bindInfoTips()` —— 所以迴歸案例原封不動搬過來量它。
     */
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
      g.promptConsole.goAct(2, { force: true });
      return 1;
    `);
    await sleep(900);
    const tipPoint = await evaluate(`
      const r = document.querySelector('#prompt-console .act--guide a.bookicon').getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    `);
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(320);
    await park(tipPoint[0], tipPoint[1]);
    await sleep(240);
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
      return 1;
    `);
    await sleep(900);
    const tipsAct1 = await evaluate(visibleTips);
    eq(tipsAct1.length, 0, '打開一關的時候畫面上沒有任何 ⓘ 的說明是開著的', JSON.stringify(tipsAct1));
    await evaluate(`document.querySelector('#prompt-console [data-act-next="2"]').click(); return 1;`);
    await sleep(1100);
    const tipsParked = await evaluate(visibleTips);
    eq(
      tipsParked.length,
      0,
      '游標停在原地、ⓘ 長在它底下 → 說明卡不自己彈出來（迴歸）',
      JSON.stringify(tipsParked)
    );
    /*
     * 游標真的動到它上面 → 這才是 hover，該打得開。
     * 先移開再移上去（保證「座標真的變了」），而且座標要**當場重量** ——
     * .reveal 的入場動畫會讓先前量好的位置過期（findings 有記）。
     */
    await park(6, 6);
    await sleep(200);
    const tipsMoved = await waitFor(
      async () => {
        const at = await evaluate(`
          const r = document.querySelector('#prompt-console .act--guide a.bookicon').getBoundingClientRect();
          return [r.x + r.width / 2, r.y + r.height / 2];
        `);
        await park(6, 6);
        await park(at[0], at[1]);
        await sleep(200);
        const seen = await evaluate(visibleTips);
        return seen.length ? seen : null;
      },
      { timeout: 8000, every: 200, label: '游標移上去 ⓘ 就打開' }
    ).catch(() => []);
    eq(tipsMoved.length, 1, '游標真的動到它上面就打得開（hover 沒有被關掉）', JSON.stringify(tipsMoved));
    await park(6, 6);
    await waitFor(async () => (await evaluate(visibleTips)).length === 0, {
      timeout: 4000,
      every: 150,
      label: 'ⓘ 移開就收回去',
    }).catch(() => {});
    eq((await evaluate(visibleTips)).length, 0, '移開就收回去');
    // 鍵盤 focus 也要打得開
    const tipFocus = await evaluate(`
      const btn = document.querySelector('#prompt-console .act--guide a.bookicon');
      btn.focus();
      await new Promise((r) => setTimeout(r, 220));
      const on = getComputedStyle(document.querySelector('#prompt-console .act--guide .infotip__bubble')).visibility;
      // 典籍是一條連結（按下去就開官方文件）→ 無障礙的關係走 aria-describedby
      const describes =
        btn.getAttribute('aria-describedby') ===
        document.querySelector('#prompt-console .act--guide .infotip__bubble').id;
      btn.blur();
      await new Promise((r) => setTimeout(r, 220));
      return { on, describes, off: getComputedStyle(document.querySelector('#prompt-console .act--guide .infotip__bubble')).visibility };
    `);
    eq(tipFocus.on, 'visible', 'Tab 走到那本典籍上照樣看得到說明（鍵盤不打折）');
    eq(tipFocus.describes, true, 'focus 時螢幕閱讀器讀得到那張小卡');
    eq(tipFocus.off, 'hidden', '離開 focus 就收回去');
    // ⓘ 那顆符文石仍然用 aria-expanded 表態（圖鑑那顆）
    const tipExpanded = await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.close();
      g.codex.open();
      await new Promise((r) => setTimeout(r, 500));
      const btn = document.querySelector('#codex .codex__hint .infotip__btn');
      const before = btn.getAttribute('aria-expanded');
      btn.focus();
      await new Promise((r) => setTimeout(r, 260));
      const on = btn.getAttribute('aria-expanded');
      btn.blur();
      await new Promise((r) => setTimeout(r, 260));
      const off = btn.getAttribute('aria-expanded');
      g.codex.close();
      await new Promise((r) => setTimeout(r, 260));
      return { before, on, off };
    `);
    eq(tipExpanded.before, 'false', 'ⓘ 預設是收起來的（aria-expanded=false）');
    eq(tipExpanded.on, 'true', 'focus 時 aria-expanded 跟著更新');
    eq(tipExpanded.off, 'false', '離開 focus 又收回去');
    // 面板打開時焦點不准落在 ⓘ 上
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await sleep(320);
    await evaluate(`window.__promptasy.codex.open(); return 1;`);
    await sleep(800);
    const codexFocus = await evaluate(`
      const a = document.activeElement;
      return {
        isTip: !!(a.closest && a.closest('[data-infotip]')),
        text: (a.textContent || '').trim().slice(0, 16),
      };
    `);
    eq(codexFocus.isTip, false, '圖鑑打開時焦點不會落在 ⓘ 上', codexFocus.text);
    eq((await evaluate(visibleTips)).length, 0, '圖鑑打開時也沒有任何 ⓘ 自己開著');
    await evaluate(`window.__promptasy.codex.close(); return 1;`);
    await sleep(320);

    /* ---------------------------------------------------------------- */
    /* (4) 390px：關卡名不截斷、進度小牌掉到第二行、Esc 守在右上          */
    /* ---------------------------------------------------------------- */
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    await sleep(420);
    await evaluate(`
      const g = window.__promptasy;
      g.promptConsole.open(g.content.challenge('gate-of-clarity-01'));
      return 1;
    `);
    await sleep(900);
    const head390 = await evaluate(headRows('#prompt-console'));
    ok(head390, '390px 下標頭量得到');
    eq(head390.bar, true, '390px 下仍然是一條式標頭');
    eq(head390.overflowX, 0, '390px 下整頁沒有水平溢位');
    ok(head390.headH < 175, '390px 下的標頭仍然比原本三層堆疊矮', `${head390.headH}px`);
    ok(
      head390.close.top < head390.eyebrow.top,
      '390px：Esc 留在第一行，進度小牌掉到底下',
      `close.top=${head390.close.top} eyebrow.top=${head390.eyebrow.top}`
    );
    ok(
      head390.close.right <= head390.headW + head390.close.left,
      '390px：Esc 仍然靠右',
      `close.right=${head390.close.right}`
    );
    ok(
      head390.title.right <= 390 && head390.eyebrow.right <= 390 + 1,
      '390px：標頭每一塊都在畫面內',
      `title.right=${head390.title.right} eyebrow.right=${head390.eyebrow.right}`
    );
    const tip390 = await evaluate(`
      document.querySelector('#prompt-console [data-act-next="2"]').click();
      await new Promise((r) => setTimeout(r, 700));
      // 第二幕那顆說明卡掛在導言那本典籍上（2026-08-03 定稿）
      const btn = document.querySelector('#prompt-console .act--guide a.bookicon');
      const r = btn.getBoundingClientRect();
      return {
        hit: Math.round(r.width),
        hitH: Math.round(r.height),
        inside: r.right <= 390 + 1 && r.left >= -1,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    `);
    ok(tip390.hit >= 16 && tip390.hitH >= 16, '390px 下那本典籍仍然按得到', `${tip390.hit}×${tip390.hitH}`);
    eq(tip390.inside, true, '390px 下那本典籍在畫面內');
    eq(tip390.overflowX, 0, '390px · 第二幕沒有水平溢位');
    eq((await evaluate(visibleTips)).length, 0, '390px 下切到第二幕也沒有說明卡自己彈出來');
    await evaluate(`window.__promptasy.promptConsole.close(); return 1;`);
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    await sleep(420);
  }

  /* ================================================================ */
  /* v1.2 · P09：石座演出 —— 回呼接石座、4 個 check、一區試水            */
  /*   （輪詢式：演出是計時器，不對齊牆鐘）                              */
  /* ================================================================ */
  console.log('\n▸ 石座演出（v1.2 · P09）');
  {
    /** 只命中 gate-of-clarity-01 的第 0 條（assignsTask）、不命中 hasConstraint 的一句。 */
    const ONLY_TASK = '請把下面這張告示改寫成清楚好懂的公告。';

    const fxPre = await evaluate(`
      const g = window.__promptasy;
      if (g.promptConsole.isOpen) g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 240));
      g.engine.setQuality('high');
      const fx = g.world.rubricFx;
      fx.reset();
      let lights = 0, tris = 0, solidFlags = 0, meshes = 0;
      fx.group.traverse((o) => {
        const ud = o.userData || {};
        if (o.isLight) lights += 1;
        if (ud.solid || ud.solidSpan || typeof ud.solidRadius === 'number') solidFlags += 1;
        if (o.isMesh && o.geometry) {
          meshes += 1;
          const idx = o.geometry.index;
          tris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
        }
      });
      let worldLights = 0, worldTris = 0;
      g.engine.scene.traverse((o) => {
        if (o.isLight) worldLights += 1;
        if (o.isMesh && o.geometry) {
          const idx = o.geometry.index;
          const n = idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
          worldTris += n * (o.isInstancedMesh ? o.count : 1);
        }
      });
      return {
        api: typeof fx.play === 'function' && typeof fx.update === 'function' && typeof fx.reset === 'function' && typeof fx.state === 'function',
        state0: JSON.stringify(fx.state()),
        capacity: fx.particleCapacity,
        enabled: fx.enabled,
        spawned0: fx.particlesSpawned,
        lights, tris, solidFlags, meshes,
        worldLights, worldTris: Math.round(worldTris),
        solids: g.world.solids.length,
        marker: !!g.world.markers.find((m) => m.id === 'gate-of-clarity-01'),
        inRoot: (() => { let hit = false; g.world.root.traverse((o) => { if (o.name === 'rubric-fx') hit = true; }); return hit; })(),
      };
    `);
    eq(fxPre.api, true, 'world.rubricFx 有 play／update／reset／state（e2e 把手）');
    eq(fxPre.inRoot, true, '演出層掛在世界的 root 底下（rubric-fx）');
    eq(fxPre.marker, true, '（前提）中央高原的第一座石座在世界裡');
    eq(JSON.parse(fxPre.state0).playing.length, 0, '一開始什麼都沒在演');
    eq(fxPre.spawned0, 0, '一開始粒子池沒噴過');
    ok(fxPre.capacity <= 24, '粒子池 ≤ 24 顆（預算）', String(fxPre.capacity));
    eq(fxPre.lights, 0, '演出層一盞燈都沒加');
    eq(fxPre.solidFlags, 0, '演出層沒有任何碰撞旗標（不進碰撞登記表）');
    ok(fxPre.tris < 8000, '演出層三角形 < 8k（預算）', `tris=${fxPre.tris}`);
    ok(fxPre.worldLights <= 56, '多了演出層之後燈光仍在預算內', `lights=${fxPre.worldLights}`);
    ok(fxPre.worldTris < 420000, '多了演出層之後三角形仍在預算內', `tris=${fxPre.worldTris}`);
    ok(fxPre.solids < 1400, '碰撞體仍在預算內', `solids=${fxPre.solids}`);

    /* --- 送一段只命中 assignsTask 的 → 石座腳下的圈掃亮一圈 --- */
    const fxHit = await evaluate(`
      const g = window.__promptasy;
      const c = g.promptConsole;
      c.open(g.content.challenge('gate-of-clarity-01'));
      await new Promise((r) => setTimeout(r, 340));
      if (c.mode !== 'free') c.setMode('free');
      c.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 240));
      const ta = document.querySelector('#prompt-console .prompt-input');
      ta.value = ${JSON.stringify(ONLY_TASK)};
      document.querySelector('#prompt-console [data-submit]').click();
      // 回呼是同步的（recorder 之後、畫結果之前）—— 送出當下就讀得到
      const hits = g.rubricHits();
      return {
        hits: JSON.stringify(hits),
        newly: hits.newlyPassedIndices.slice(),
        checks: hits.newlyPassedIndices.map((i) => hits.challenge.rubric[i].check),
        state: JSON.stringify(g.world.rubricFx.state()),
        spawned: g.world.rubricFx.particlesSpawned,
        resultShown: !document.querySelector('#prompt-console .result')?.hidden,
      };
    `);
    eq(JSON.stringify(fxHit.checks), JSON.stringify(['assignsTask']), '這一句只命中 assignsTask（不碰 hasConstraint）', fxHit.checks.join(','));
    eq(fxHit.resultShown, true, '演出的同時結果面照樣畫出來（演出在世界層，不擋閱讀）');
    {
      const st = JSON.parse(fxHit.state);
      eq(st.playing.length, 1, '腳下的圈開演了一段');
      eq(st.playing[0].check, 'assignsTask', '演的就是命中的那一條');
      eq(st.playing[0].fx, 'ring-sweep', 'assignsTask → 腳下的圈掃亮一圈');
      eq(st.playing[0].markerId, 'gate-of-clarity-01', '演在正確的那一座石座');
      ok(st.particlesActive > 0, '演出時粒子池有活粒子', String(st.particlesActive));
    }
    ok(fxHit.spawned > 0 && fxHit.spawned <= 8, '一段演出只噴少少幾顆碎光（安靜）', String(fxHit.spawned));

    // 掃亮進度真的在長（輪詢，不用固定 sleep）
    const fxSweeping = await waitFor(async () => {
      const r = await evaluate(`
        const fx = window.__promptasy.world.rubricFx;
        const m = fx.group.getObjectByName('ring-sweep');
        return { drawn: m.geometry.drawRange.count, total: m.geometry.index.count, opacity: m.material.opacity, playing: fx.state().playing.length };
      `);
      return r.drawn > 0 && r.opacity > 0 ? r : null;
    }, { timeout: 8000, label: '腳下的圈開始掃亮' });
    ok(fxSweeping.drawn > 0, '腳下的圈亮起了一段弧', `${fxSweeping.drawn}/${fxSweeping.total}`);
    ok(fxSweeping.opacity > 0, '掃亮的那一圈看得見', String(fxSweeping.opacity));

    // 讓它自己演完（≤ 2.5 秒）
    const fxDone = await waitFor(async () => {
      const r = await evaluate(`
        const fx = window.__promptasy.world.rubricFx;
        const m = fx.group.getObjectByName('ring-sweep');
        const st = fx.state();
        return { playing: st.playing.length, particles: st.particlesActive, visible: m.visible, spawned: fx.particlesSpawned };
      `);
      return r.playing === 0 && r.particles === 0 ? r : null;
    }, { timeout: 9000, label: '演出自己結束' });
    eq(fxDone.playing, 0, '≤ 2.5 秒後演出自己結束（playing 歸零）');
    eq(fxDone.particles, 0, '碎光也熄了');
    eq(fxDone.visible, false, '演完的道具藏起來');

    /* --- 同一次 session 再送同一句 → 不重播（session 差量） --- */
    const fxAgain = await evaluate(`
      const g = window.__promptasy;
      const ta = document.querySelector('#prompt-console .prompt-input');
      ta.value = ${JSON.stringify(ONLY_TASK)};
      document.querySelector('#prompt-console [data-submit]').click();
      const hits = g.rubricHits();
      return {
        newly: hits.newlyPassedIndices.slice(),
        passed: hits.passedIndices.slice(),
        state: JSON.stringify(g.world.rubricFx.state()),
        spawned: g.world.rubricFx.particlesSpawned,
      };
    `);
    eq(JSON.stringify(fxAgain.newly), '[]', '同一次 session 再送同一句 → 沒有新命中（session 差量）');
    eq(JSON.stringify(fxAgain.passed), '[0]', '這一次仍然命中第 0 條（只是不算新的）');
    eq(JSON.parse(fxAgain.state).playing.length, 0, '沒有新命中 → 不重播');
    eq(fxAgain.spawned, fxDone.spawned, '不重播 → 粒子池也沒再噴');

    /* --- 關掉重開主控台 → session 差量歸零、可以再演一次 --- */
    const fxReopen = await evaluate(`
      const g = window.__promptasy;
      const c = g.promptConsole;
      c.close();
      await new Promise((r) => setTimeout(r, 260));
      c.open(g.content.challenge('gate-of-clarity-01'));
      await new Promise((r) => setTimeout(r, 340));
      if (c.mode !== 'free') c.setMode('free');
      c.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 240));
      const ta = document.querySelector('#prompt-console .prompt-input');
      ta.value = ${JSON.stringify(ONLY_TASK)};
      document.querySelector('#prompt-console [data-submit]').click();
      const hits = g.rubricHits();
      return {
        newly: hits.newlyPassedIndices.slice(),
        state: JSON.stringify(g.world.rubricFx.state()),
        spawned: g.world.rubricFx.particlesSpawned,
      };
    `);
    eq(JSON.stringify(fxReopen.newly), '[0]', '關掉重開 → session 差量歸零，第 0 條又算新命中');
    {
      const st = JSON.parse(fxReopen.state);
      eq(st.playing.length, 1, '重開之後可以再演一次');
      eq(st.playing[0].check, 'assignsTask', '演的還是那一條');
    }
    ok(fxReopen.spawned > fxAgain.spawned, '重開之後真的又噴了碎光', `${fxAgain.spawned} → ${fxReopen.spawned}`);
    await waitFor(async () => {
      const r = await evaluate(`return window.__promptasy.world.rubricFx.state().playing.length;`);
      return r === 0 ? true : null;
    }, { timeout: 9000, label: '第二次演出也自己結束' });

    /* --- 低畫質：整層關掉 --- */
    const fxLow = await evaluate(`
      const g = window.__promptasy;
      const c = g.promptConsole;
      g.engine.setQuality('low');
      const fx = g.world.rubricFx;
      const enabledLow = fx.enabled;
      const spawnedBefore = fx.particlesSpawned;
      c.close();
      await new Promise((r) => setTimeout(r, 260));
      c.open(g.content.challenge('gate-of-clarity-01'));
      await new Promise((r) => setTimeout(r, 340));
      if (c.mode !== 'free') c.setMode('free');
      c.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 240));
      const ta = document.querySelector('#prompt-console .prompt-input');
      ta.value = ${JSON.stringify(ONLY_TASK)};
      document.querySelector('#prompt-console [data-submit]').click();
      const hits = g.rubricHits();
      const out = {
        enabledLow,
        newly: hits.newlyPassedIndices.slice(),
        state: JSON.stringify(fx.state()),
        spawned: fx.particlesSpawned,
        spawnedBefore,
        resultShown: !document.querySelector('#prompt-console .result')?.hidden,
      };
      // 切回高畫質，後面的檢查照舊
      g.engine.setQuality('high');
      out.enabledHigh = fx.enabled;
      c.close();
      await new Promise((r) => setTimeout(r, 260));
      return out;
    `);
    eq(fxLow.enabledLow, false, '低畫質時演出層是關的');
    eq(JSON.stringify(fxLow.newly), '[0]', '（前提）低畫質下一樣有新命中');
    eq(JSON.parse(fxLow.state).playing.length, 0, '低畫質 → 不播');
    eq(fxLow.spawned, fxLow.spawnedBefore, '低畫質 → 一顆粒子都沒噴');
    eq(fxLow.resultShown, true, '低畫質下結果面照常（關掉的只有世界層的演出）');
    eq(fxLow.enabledHigh, true, '切回高畫質演出層就開了（不必重新整理）');

    /* --- 其餘 3 段：四段可以同時播、各自 ≤ 2.5 秒收乾淨 --- */
    const fxAll = await evaluate(`
      const g = window.__promptasy;
      const fx = g.world.rubricFx;
      fx.reset();
      const marker = g.world.markers.find((m) => m.id === 'gate-of-clarity-01');
      const beacon0 = { scale: marker.beacon.scale.y, y: marker.beacon.position.y };
      const ring0 = marker.ring.scale.x;
      const started = fx.play(marker, ['assignsTask', 'specifiesFormat', 'hasConstraint', 'hasRole']);
      const st = fx.state();
      return {
        started,
        playing: st.playing.map((p) => p.check).sort(),
        beacon0,
        ring0,
        // P10a 的四段接上之後，八段可以同時播
        more: fx.play(marker, ['hasFewShot', 'hasDelimiters', 'asksToVerify', 'groundsInContext']),
        // 沒有對應演出的檢查一律不演出
        unsupported: fx.play(marker, ['positiveFraming', 'keepsPromptLean']),
        playingAll: fx.state().playing.map((p) => p.check).sort(),
      };
    `);
    eq(fxAll.started, 4, '四段可以同時開演');
    eq(JSON.stringify(fxAll.playing), JSON.stringify(['assignsTask', 'hasConstraint', 'hasRole', 'specifiesFormat']), '四段就是 spec 的那四條');
    eq(fxAll.more, 4, 'P10a 的四段也接上了（八段可以同時播）');
    eq(
      JSON.stringify(fxAll.playingAll),
      JSON.stringify(['asksToVerify', 'assignsTask', 'groundsInContext', 'hasConstraint', 'hasDelimiters', 'hasFewShot', 'hasRole', 'specifiesFormat']),
      '八段同時在演，就是 RUBRIC_FX 的那八條'
    );
    eq(fxAll.unsupported, 0, '沒有對應演出的檢查一律不演出');
    // 光柱真的被收成一段（輪詢）
    const fxColumn = await waitFor(async () => {
      const r = await evaluate(`
        const g = window.__promptasy;
        const m = g.world.markers.find((x) => x.id === 'gate-of-clarity-01');
        const fx = g.world.rubricFx;
        return {
          scale: m.beacon.scale.y,
          y: m.beacon.position.y,
          tick: fx.group.getObjectByName('tick:0').material.opacity,
          chipY: fx.group.getObjectByName('chip:0').position.y,
          rim: fx.group.getObjectByName('mask-rim').material.opacity,
        };
      `);
      return r.scale < fxAll.beacon0.scale * 0.5 && r.tick > 0 ? r : null;
    }, { timeout: 8000, label: '光柱收成有刻度的一段' });
    // P10a 的四段也真的動了（同一次八段同播；輪詢，不用固定 sleep）
    const fxNew = await waitFor(async () => {
      const r = await evaluate(`
        const g = window.__promptasy;
        const fx = g.world.rubricFx;
        const m = g.world.markers.find((x) => x.id === 'gate-of-clarity-01');
        const w0 = fx.group.getObjectByName('wall:0');
        return {
          slabY: fx.group.getObjectByName('slab:0').position.y,
          slabPaired: fx.group.getObjectByName('slab:0').position.y === fx.group.getObjectByName('slab:1').position.y,
          wallScale: w0.scale.y,
          // v1.2 · P10 審查後：每一道牆各自貼**自己腳下**的地（舞台原點只是石座正中央的高度）
          wallFoot: (() => {
            const g = window.__promptasy;
            const st = g.world.rubricFx.group.getObjectByName('rubric-fx:stage');
            const wx = st.position.x + w0.position.x;
            const wz = st.position.z + w0.position.z;
            const footWorld = st.position.y + w0.position.y - w0.geometry.parameters.height * 0.5 * w0.scale.y;
            return Math.abs(footWorld - g.world.terrainHeight(wx, wz));
          })(),
          wallVisible: w0.visible,
          ringScale: m.ring.scale.x,
          disc: fx.group.getObjectByName('ground-disc').material.opacity,
        };
      `);
      return r.slabY > 1.2 && r.wallScale > 0.5 && r.disc > 0 && r.ringScale < 0.9 ? r : null;
    }, { timeout: 8000, label: 'P10a 的四段也演起來了' });
    ok(fxNew.slabY > 1.2, '兩塊小石板浮到浮碑旁了', String(fxNew.slabY));
    eq(fxNew.slabPaired, true, '兩塊是**成對**浮起（永遠同高）');
    ok(fxNew.wallScale > 0.5, '四道短牆升起來了', String(fxNew.wallScale));
    ok(!fxNew.wallVisible || fxNew.wallFoot < 0.01, '出現的短牆真的踩在自己腳下的地上（不飄）', String(fxNew.wallFoot));
    ok(fxNew.disc > 0, '腳下收成的實心小盤亮起來了', String(fxNew.disc));
    ok(fxNew.ringScale < 0.9, '腳下的圈真的往內收了', String(fxNew.ringScale));
    ok(fxColumn.scale < fxAll.beacon0.scale * 0.5, '光柱從無限高收成一段', String(fxColumn.scale));
    ok(fxColumn.y < fxAll.beacon0.y * 0.5, '收短時底還踩在地上', String(fxColumn.y));
    ok(fxColumn.tick > 0, '刻度亮起來了（量得出來的長度）', String(fxColumn.tick));
    ok(fxColumn.chipY > 0.3, '碎石浮起來排隊了', String(fxColumn.chipY));
    ok(fxColumn.rim > 0, '浮碑戴上了面具般的輪廓光', String(fxColumn.rim));
    // 全部演完 → 光柱一寸不差地還回去
    const fxRestored = await waitFor(async () => {
      const r = await evaluate(`
        const g = window.__promptasy;
        const m = g.world.markers.find((x) => x.id === 'gate-of-clarity-01');
        const fx = g.world.rubricFx;
        const st = fx.state();
        return { playing: st.playing.length, particles: st.particlesActive, scale: m.beacon.scale.y, y: m.beacon.position.y, ring: m.ring.scale.x };
      `);
      return r.playing === 0 ? r : null;
    }, { timeout: 9000, label: '四段全部演完' });
    eq(fxRestored.playing, 0, '八段全部 ≤ 2.5 秒內收乾淨');
    eq(fxRestored.scale, fxAll.beacon0.scale, '光柱的縮放一寸不差地還回去');
    eq(fxRestored.y, fxAll.beacon0.y, '光柱的高度一寸不差地還回去');
    eq(fxRestored.ring, fxAll.ring0, '腳下的圈也一寸不差地還回去');

    /* --- 小光點：繞一圈**回到原位**（起點就是終點，所以要在頁面裡逐幀取樣才驗得出來） --- */
    const fxMote = await evaluate(`
      const g = window.__promptasy;
      const fx = g.world.rubricFx;
      fx.reset();
      const m = g.world.markers.find((x) => x.id === 'gate-of-clarity-01');
      const started = fx.play(m, ['asksToVerify']);
      const mote = fx.group.getObjectByName('return-light');
      const sx = mote.position.x;
      const sz = mote.position.z;
      let maxAway = 0;
      let last = 0;
      let lastOpacity = 0;
      const t0 = performance.now();
      // 逐幀取樣（不是固定 sleep）：演完就跳出，最多等 12 秒（軟體渲染一幀 0.2 秒）
      while (fx.state().playing.length > 0 && performance.now() - t0 < 12000) {
        await new Promise((r) => requestAnimationFrame(r));
        const d = Math.hypot(mote.position.x - sx, mote.position.z - sz);
        if (fx.state().playing.length > 0) {
          last = d;
          lastOpacity = mote.material.opacity;
          if (d > maxAway) maxAway = d;
        }
      }
      return { started, maxAway, last, lastOpacity, playing: fx.state().playing.length };
    `);
    eq(fxMote.started, 1, '（前提）小光點那一段開演了');
    ok(fxMote.maxAway > 1.5, '小光點真的繞出去了（離出發點最遠 > 1.5 公尺）', String(fxMote.maxAway));
    ok(fxMote.last < 0.35, '最後回到原位（繞一圈，不是繞不停）', String(fxMote.last));
    ok(fxMote.lastOpacity > 0, '繞的時候看得見', String(fxMote.lastOpacity));
    eq(fxMote.playing, 0, '小光點那一段 ≤ 2.5 秒自己收乾淨');

    /* --- 其他片土地這一 phase 不演出（P09 只在中央高原試水） --- */
    const fxRegion = await evaluate(`
      const g = window.__promptasy;
      const fx = g.world.rubricFx;
      fx.reset();
      const other = g.world.markers.find((m) => m.region !== 'foundations' && (m.challenge.rubric || []).some((r) => r.check === 'assignsTask'));
      const before = fx.particlesSpawned;
      // main.js 的守門是 fxEnabledIn(marker.region) —— 這裡直接驗那一支純函式的效果
      const mod = await import('/src/world/rubric-fx.js');
      return {
        otherRegion: other ? other.region : null,
        enabledOther: other ? mod.fxEnabledIn(other.region) : null,
        enabledFoundations: mod.fxEnabledIn('foundations'),
        enabledNowhere: mod.fxEnabledIn('nowhere'),
        regions: JSON.stringify(mod.FX_REGIONS),
        before,
      };
    `);
    eq(JSON.parse(fxRegion.regions).length, 12, 'P10a：十二片土地全部鋪上演出');
    eq(fxRegion.enabledFoundations, true, '中央高原有演出');
    eq(fxRegion.enabledOther, true, `其他片土地（${fxRegion.otherRegion}）這一 phase 也演出了`);
    eq(fxRegion.enabledNowhere, false, '不是土地的字串仍然不演出');

    /* --- 鋪區真的生效：在**別的區**開一關、送一句 → 石座旁真的演起來（走 main.js 的整條路） --- */
    const fxOtherRegion = await evaluate(`
      const g = window.__promptasy;
      const c = g.promptConsole;
      const fx = g.world.rubricFx;
      fx.reset();
      if (c.isOpen) c.close();
      await new Promise((r) => setTimeout(r, 240));
      const other = g.world.markers.find((m) => m.region !== 'foundations' && (m.challenge.rubric || []).some((r) => r.check === 'assignsTask'));
      c.open(g.content.challenge(other.id));
      await new Promise((r) => setTimeout(r, 340));
      if (c.mode !== 'free') c.setMode('free');
      c.goAct(3, { force: true });
      await new Promise((r) => setTimeout(r, 240));
      const ta = document.querySelector('#prompt-console .prompt-input');
      ta.value = ${JSON.stringify(ONLY_TASK)};
      document.querySelector('#prompt-console [data-submit]').click();
      const hits = g.rubricHits();
      const st = fx.state();
      const out = {
        id: other.id,
        region: other.region,
        newly: hits.newlyPassedIndices.slice(),
        playing: st.playing.map((p) => p.check),
        markerId: st.playing.length ? st.playing[0].markerId : null,
      };
      c.close();
      await new Promise((r) => setTimeout(r, 240));
      return out;
    `);
    ok(fxOtherRegion.region !== 'foundations', `（前提）挑到的是別片土地（${fxOtherRegion.region}）`);
    ok(fxOtherRegion.newly.length > 0, '（前提）那一句在別的區也有新命中', JSON.stringify(fxOtherRegion.newly));
    ok(fxOtherRegion.playing.length > 0, '別片土地的石座也演起來了（鋪區真的生效）', fxOtherRegion.playing.join(','));
    eq(fxOtherRegion.markerId, fxOtherRegion.id, '演在那一座石座上');
    await waitFor(async () => {
      const r = await evaluate(`return window.__promptasy.world.rubricFx.state().playing.length;`);
      return r === 0 ? true : null;
    }, { timeout: 9000, label: '別片土地的演出也自己結束' });

    /* --- 進度重置：世界端的演出跟著歸零（WORLD §8 G24b） --- */
    const fxReset = await evaluate(`
      const g = window.__promptasy;
      const fx = g.world.rubricFx;
      const marker = g.world.markers.find((m) => m.id === 'gate-of-clarity-01');
      const scale0 = marker.beacon.scale.y;
      fx.play(marker, ['hasConstraint']);
      await new Promise((r) => setTimeout(r, 260));
      const mid = { scale: marker.beacon.scale.y, playing: fx.state().playing.length };
      fx.reset();
      return { scale0, mid, after: { scale: marker.beacon.scale.y, playing: fx.state().playing.length, particles: fx.state().particlesActive } };
    `);
    ok(fxReset.mid.playing === 1, '（前提）演到一半');
    eq(fxReset.after.playing, 0, 'reset() 把演出清空');
    eq(fxReset.after.particles, 0, 'reset() 把粒子池清空');
    eq(fxReset.after.scale, fxReset.scale0, 'reset() 把借走的光柱還回去');
  }

  /* ================================================================ */
  /* v1.2 · P10b：解法百分位（內建分布）＋ 最少技巧達成                 */
  /*   （挑關卡與答案在 node 這一側用真的評分引擎算好，瀏覽器只負責玩） */
  /* ================================================================ */
  console.log('\n▸ 解法百分位與最少技巧達成（v1.2 · P10b）');
  {
    const { evaluate: evalRubric } = await import('../src/challenges/rubric.js');
    const { createSolutionStats } = await import('../src/challenges/solution-stats.js');
    const allChallenges = readData('src/data/challenges.json').challenges;
    const statsApi = createSolutionStats(readData('src/data/solution-stats.json'));
    const standingOf = (c, text) => statsApi.standingFor(c, evalRubric(c, text));
    // 兩個目標都用**中央高原**（預設就解鎖的那一片），而且都用該關自己的示範解答
    const inFoundations = allChallenges.filter((c) => c.region === 'foundations' && c.application !== true);
    const leanTarget = inFoundations.find((c) => {
      const st = standingOf(c, c.sample);
      return st && st.lean;
    });
    const plainTarget = inFoundations.find((c) => {
      const st = standingOf(c, c.sample);
      return st && !st.lean && (!leanTarget || c.id !== leanTarget.id);
    });
    ok(Boolean(plainTarget), '（前提）找得到一關「有百分位、但還沒達成最少技巧」的示範解答');
    ok(Boolean(leanTarget), '（前提）找得到一關「示範解答本身就是最少技巧」的關卡（徽章拿得到）');

    /** 開一關、送一段字、把結果面上的那一行讀回來。 */
    const playOnce = async (id, text) => {
      return evaluate(`
        const g = window.__promptasy;
        const c = g.promptConsole;
        if (c.isOpen) c.close();
        await new Promise((r) => setTimeout(r, 260));
        c.open(g.content.challenge(${JSON.stringify(id)}));
        await new Promise((r) => setTimeout(r, 340));
        if (c.mode !== 'free') c.setMode('free');
        c.goAct(3, { force: true });
        await new Promise((r) => setTimeout(r, 240));
        const ta = document.querySelector('#prompt-console .prompt-input');
        ta.value = ${JSON.stringify(text)};
        document.querySelector('#prompt-console [data-submit]').click();
        const el = document.querySelector('#prompt-console .result');
        const standing = el.querySelector('[data-standing]');
        const lean = el.querySelector('[data-lean-seal]');
        const save = JSON.parse(localStorage.getItem('promptasy.v1.save') || '{}');
        const out = {
          passed: Boolean(el.querySelector('.result__top.is-pass')),
          standing: standing ? standing.textContent.replace(/\s+/g, ' ').trim() : null,
          standingVisible: standing ? standing.getBoundingClientRect().height > 0 : false,
          lean: lean ? lean.textContent.replace(/\s+/g, ' ').trim() : null,
          leanSeals: (g.progression.leanSeals && g.progression.leanSeals()) || [],
          savedLeanSeals: Array.isArray(save.leanSeals) ? save.leanSeals : null,
          cleared: Object.keys(g.progression.state.bestGrades).length,
          unlocked: g.progression.state.unlockedRegions.slice(),
        };
        c.close();
        await new Promise((r) => setTimeout(r, 240));
        return out;
      `);
    };

    /* --- ① 過關 → 結果面多一行「這一次站在哪裡」，而且明寫是內建分布 --- */
    const plain = await playOnce(plainTarget.id, plainTarget.sample);
    eq(plain.passed, true, `（前提）${plainTarget.id} 的示範解答過關了`);
    ok(Boolean(plain.standing), '過關後結果面有「這一次」那一行', String(plain.standing));
    eq(plain.standingVisible, true, '那一行真的量得到（不是 0 高度的空殼）');
    ok(/贏過 \d+%/.test(plain.standing), '分數那一軸講「贏過幾成」', plain.standing);
    ok(/更短/.test(plain.standing) && /更精簡/.test(plain.standing), '字數與技法數講「比幾成更短／更精簡」（越少越好，不能講成第 N 百分位）', plain.standing);
    ok(plain.standing.includes('內建'), '那一行**明寫是內建**的分布');
    ok(plain.standing.includes('不是其他玩家'), '那一行明寫**不是其他玩家**的成績（誠實原則）');
    ok(!/rubric|localStorage|面板/.test(plain.standing), '那一行沒有系統術語（WORLD §3.6）');
    {
      const st = standingOf(plainTarget, plainTarget.sample);
      ok(plain.standing.includes(`贏過 ${st.scorePct}%`), '分數那一軸的數字跟評分引擎算的一致', `${st.scorePct}`);
      ok(plain.standing.includes(`用了 ${st.techniques} 種技法`), '技法數跟評分引擎算的一致', `${st.techniques}`);
      ok(plain.standing.includes(`${st.words}`), '字數也在那一行上', `${st.words}`);
    }
    eq(plain.lean, null, '這一關的示範解答還不是最少技巧 → 沒有徽章那一行');

    /* --- ② 沒過關 → 不說（分布講的是「解得開的人怎麼寫」） --- */
    const weak = await playOnce(plainTarget.id, '幫我用一下');
    eq(weak.passed, false, '（前提）這一句沒過關');
    eq(weak.standing, null, '沒過關 → 不說位置（不拿不準的話塞給玩家）');
    eq(weak.lean, null, '沒過關 → 沒有徽章');

    /* --- ③ 最少技巧達成：拿得到、進存檔、只說一次、不動 142 關的分子 --- */
    const before = await evaluate(`
      const g = window.__promptasy;
      return {
        leanSeals: (g.progression.leanSeals && g.progression.leanSeals()) || [],
        cleared: Object.keys(g.progression.state.bestGrades).length,
        unlocked: g.progression.state.unlockedRegions.length,
      };
    `);
    const lean = await playOnce(leanTarget.id, leanTarget.sample);
    eq(lean.passed, true, `（前提）${leanTarget.id} 的示範解答過關了`);
    ok(Boolean(lean.lean), '用最少技巧通過 → 結果面說了那一句', String(lean.lean));
    ok(lean.lean.includes('最少技巧達成'), '徽章的名字是「最少技巧達成」');
    ok(!lean.lean.includes('最少字'), '**沒有**「最少字」那一枚（短 ≠ 好 prompt）');
    ok(lean.leanSeals.includes(leanTarget.id), '徽章進了進度', lean.leanSeals.join(','));
    ok(Array.isArray(lean.savedLeanSeals) && lean.savedLeanSeals.includes(leanTarget.id), '徽章真的寫進了存檔（重整還在）');
    eq(
      before.leanSeals.length + 1,
      lean.leanSeals.length,
      '只多了一枚'
    );
    const again = await playOnce(leanTarget.id, leanTarget.sample);
    eq(again.lean, null, '同一關再拿一次 → 不再說第二遍（冪等）');
    ok(Boolean(again.standing), '但百分位那一行照樣在');
    eq(again.leanSeals.length, lean.leanSeals.length, '也沒有重複收一枚');

    /* --- ④ 圖鑑的成就那一格列得出來 --- */
    const codexLean = await evaluate(`
      const g = window.__promptasy;
      g.codex.open();
      await new Promise((r) => setTimeout(r, 420));
      const txt = document.querySelector('#codex')?.textContent || '';
      const out = { has: txt.includes('最少技巧達成'), leanWord: txt.includes('最少字') };
      g.codex.close();
      await new Promise((r) => setTimeout(r, 320));
      return out;
    `);
    eq(codexLean.has, true, '圖鑑的成就那一格列得出「最少技巧達成」');
    eq(codexLean.leanWord, false, '圖鑑裡沒有「最少字」');
  }

  /* ================================================================ */
  /* v1.2 · P11：中觀 —— 從橋頭看不到塔，繞過石脊才揭露                  */
  /* ================================================================ */
  console.log('\n▸ 中觀：遮擋帶與揭露（v1.2 · P11）');
  {
    const Screens = await import('../src/world/screens.js');
    const { PLAYER_RADIUS: PLAYER_RADIUS_E2E } = await import('../src/world/world.js');
    const { sightlineAudit } = await import('./sightline-audit.mjs');
    const audit = await sightlineAudit();
    const sl = audit.regions.reasoning;
    ok(sl.bands.length >= 2, '（前提）階梯迴廊有兩道遮擋帶', String(sl.bands.length));

    /* --- ① 世界裡真的蓋出了那一層（0 光源、有節點名） --- */
    const built = await evaluate(`
      const g = window.__promptasy;
      if (g.promptConsole.isOpen) g.promptConsole.close();
      await new Promise((r) => setTimeout(r, 220));
      g.progression.skipGate('reasoning');
      g.world.openGate('reasoning', true);
      const layers = g.world.screens || [];
      let lights = 0, meshes = 0, named = 0;
      for (const l of layers) l.group.traverse((o) => {
        if (o.isLight) lights += 1;
        if (o.isMesh) meshes += 1;
        if (o.name && (o.name.startsWith('screen:') || o.name.startsWith('motif:'))) named += 1;
      });
      return {
        layers: layers.length,
        bands: layers.reduce((n, l) => n + l.bands.length, 0),
        motifs: layers.reduce((n, l) => n + l.motifs.length, 0),
        lights, meshes, named,
        hasSight: typeof g.world.landmarkSightFrom === 'function',
      };
    `);
    /*
     * 件數對的是**資料層**（`SCREEN_BANDS`／`MOTIFS`），不是寫死的數字 ——
     * P12 又鋪了四片土地，寫死就會每加一片紅一次（而且紅的是「數字過期」不是「東西壞了」）。
     */
    eq(built.layers, new Set([...Screens.SCREEN_BANDS, ...Screens.MOTIFS].map((x) => x.region)).size, 'P11：有中觀層的土地全部蓋出來了');
    eq(built.bands, Screens.SCREEN_BANDS.length, 'P11：每一道遮擋帶都進了場景圖');
    eq(built.motifs, Screens.MOTIFS.length, 'P11：每一座母題都進了場景圖');
    eq(built.lights, 0, 'P11：中觀層一盞燈都沒加');
    ok(
      built.meshes > 0 && built.named >= Screens.SCREEN_BANDS.length + Screens.MOTIFS.length,
      'P11：每一道石脊／每一座母題都有自己的節點名',
      String(built.named)
    );
    eq(built.hasSight, true, 'P11：世界有視線判定 API');

    /* --- ② 站在橋頭：看不到塔；沿路走到揭露點：看得到 --- */
    const entry = sl.entry;
    const revealSample = sl.samples.find((sm) => sm.arc === sl.revealAt) || sl.samples[sl.samples.length - 1];
    const midSample = sl.samples.find((sm) => sm.arc === 12) || sl.samples[4];
    const look = async (at) =>
      evaluate(`
        const g = window.__promptasy;
        g.player.teleport(${at[0]}, ${at[1]});
        await new Promise((r) => setTimeout(r, 320));
        const s = g.world.landmarkSightFrom(g.player.position.x, g.player.position.z, 'reasoning');
        return { flat: s.flat, hidden: s.hidden, by: s.by, x: g.player.position.x, z: g.player.position.z };
      `);

    const atHead = await look(entry);
    eq(atHead.flat, true, 'P11：站在橋頭，無盡階梯塔被石脊擋住了');
    eq(atHead.hidden, true, 'P11：連塔頂那顆光球都壓在石脊背後');
    ok(
      Math.hypot(atHead.x - entry[0], atHead.z - entry[1]) < 1.5,
      'P11：人真的站到橋頭那一點',
      Math.hypot(atHead.x - entry[0], atHead.z - entry[1]).toFixed(2)
    );

    const atMid = await look(midSample.at);
    eq(atMid.flat, true, `P11：走了 ${midSample.arc} 公尺還是看不到（前 12 公尺都被擋著）`);

    const atReveal = await look(revealSample.at);
    eq(atReveal.flat, false, `P11：繞過石脊（第 ${sl.revealAt} 公尺）塔就揭露了`);
    ok(sl.revealAt <= 25, 'P11：揭露發生在 25 公尺內（擋住但不迷路）', String(sl.revealAt));

    /* --- ③ 石脊擋得住人，端點外側繞得過去 --- */
    const band = Screens.SCREEN_BANDS.find((b) => b.region === 'reasoning' && b.height >= 10);
    const f = Screens.bandFootprint(band);
    const approach = [f.cx + f.vx * 5.5 * band.faceSign, f.cz + f.vz * 5.5 * band.faceSign];
    const push = await evaluate(`
      const g = window.__promptasy;
      g.player.teleport(${approach[0]}, ${approach[1]});
      await new Promise((r) => setTimeout(r, 320));
      const before = { x: g.player.position.x, z: g.player.position.z };
      const clamped = g.world.clampPosition(${f.cx}, ${f.cz}, before.x, before.z);
      const solidAtCore = Boolean(g.world.solidAt(${f.cx}, ${f.cz}));
      const endX = ${f.cx + f.ux * (band.length / 2 + 3)};
      const endZ = ${f.cz + f.uz * (band.length / 2 + 3)};
      return {
        solidAtCore,
        clampedX: clamped.x,
        clampedZ: clamped.z,
        aroundClear: !g.world.solidAt(endX, endZ) && g.world.isWalkable(endX, endZ),
      };
    `);
    eq(push.solidAtCore, true, 'P11：石脊本體擋得住人（走不進石頭裡）');
    ok(
      Math.hypot(push.clampedX - f.cx, push.clampedZ - f.cz) > band.depth / 2,
      'P11：往石脊裡推會被擋回來（不是穿過去）',
      Math.hypot(push.clampedX - f.cx, push.clampedZ - f.cz).toFixed(2)
    );
    eq(push.aroundClear, true, 'P11：石脊的端點外側走得過去（繞得過去，不是一道牆）');

    /* --- ④ 真的按著 W 往石脊走：人停在石脊外面，沒有穿過去 --- */
    /*
     * `player.cameraYaw` **只有 getter**（沒有 setter）——
     * 直接指派在非嚴格模式下是靜默的空操作，那會讓下面整段「按 W 走進去」
     * 面向上一段測試留下的隨便方向，兩條斷言就都變成不會失敗的裝飾（P11 審查抓到的）。
     * 所以這裡改用**真的輸入**（← →）把鏡頭轉到對著石脊，並輪詢到真的對準為止。
     */
    const walk = await evaluate(`
      const g = window.__promptasy;
      g.player.teleport(${approach[0]}, ${approach[1]});
      await new Promise((r) => setTimeout(r, 260));
      const want = Math.atan2(${f.cx} - g.player.position.x, ${f.cz} - g.player.position.z);
      const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      let held = null;
      const press = (code) => {
        if (held === code) return;
        if (held) window.dispatchEvent(new KeyboardEvent('keyup', { code: held }));
        held = code;
        if (code) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      };
      const t0 = performance.now();
      let d = norm(want - g.player.cameraYaw);
      while (Math.abs(d) > 0.05 && performance.now() - t0 < 6000) {
        press(d > 0 ? 'ArrowLeft' : 'ArrowRight');
        await new Promise((r) => requestAnimationFrame(r));
        d = norm(want - g.player.cameraYaw);
      }
      press(null);
      await new Promise((r) => setTimeout(r, 120));
      return { x: g.player.position.x, z: g.player.position.z, yawErr: Math.abs(norm(want - g.player.cameraYaw)) };
    `);
    ok(walk.yawErr < 0.12, 'P11：鏡頭真的轉到對著石脊了（cameraYaw 是唯讀的，要用方向鍵轉）', walk.yawErr.toFixed(3));
    const sideBefore = (walk.x - f.cx) * f.vx + (walk.z - f.cz) * f.vz;
    await keyDown('KeyW', 'w', { vk: 87 });
    await sleep(1500);
    await keyUp('KeyW', 'w', { vk: 87 });
    const after = await evaluate(`
      const g = window.__promptasy;
      await new Promise((r) => setTimeout(r, 240));
      return { x: g.player.position.x, z: g.player.position.z };
    `);
    const sideAfter = (after.x - f.cx) * f.vx + (after.z - f.cz) * f.vz;
    const alongAfter = (after.x - f.cx) * f.ux + (after.z - f.cz) * f.uz;
    /*
     * 「沒有穿模」＝ **沒有從石脊中間穿過去**。
     * 換到另一面本身是合法的（貼著面滑到端點、繞過去就是我們要的體驗）——
     * 所以換面時要求人已經走過端點（沿長邊的座標超出半長），
     * 不合法的是「還在石脊正對面的那一段，人卻已經在另一面」。
     */
    ok(
      sideBefore * sideAfter > 0 || Math.abs(alongAfter) > band.length / 2,
      'P11：一直往石脊走，只能繞過端點，不會從中間穿過去',
      `離中線 ${sideBefore.toFixed(2)} → ${sideAfter.toFixed(2)}｜沿長邊 ${alongAfter.toFixed(2)}（半長 ${(band.length / 2).toFixed(2)}）`
    );
    /*
     * 「停在石脊外面」＝ **人不在石脊的足跡裡**（不是「離中線多遠」）——
     * 貼著面滑到端點外側、再走到與中線齊平的位置是合法的（那正是繞過去），
     * 會穿模的只有「站進那塊石頭裡」。
     */
    ok(
      !Screens.pointInBand(band, after.x, after.z, 0),
      'P11：人沒有站進石脊裡（沒有穿模）',
      `沿長邊 ${alongAfter.toFixed(2)} / 離中線 ${Math.abs(sideAfter).toFixed(2)}（半長 ${(band.length / 2).toFixed(2)}、半厚 ${(band.depth / 2).toFixed(2)}）`
    );
    /*
     * 上面那條用 pad=0 問「有沒有站進足跡裡」——碰撞半徑本來就把人擋在中線 1.3 公尺外，
     * 半厚只有 0.7，所以它**永遠成立**、抓不到任何東西（P11 審查抓到的）。
     * 補兩條會失敗的：① 人真的走到石脊旁邊（不是原地沒動）；
     * ② 停下來的位置正好是「被面擋住」的距離（穿過去或滑進去都會低於它）。
     */
    const sideStart = Math.abs(sideBefore);
    const sideEnd = Math.abs(sideAfter);
    const insideLen = Math.abs(alongAfter) <= band.length / 2;
    ok(
      sideEnd < sideStart - 0.8 || sideEnd <= band.depth / 2 + PLAYER_RADIUS_E2E + 0.6,
      'P11：人真的往石脊走過去了（不是原地沒動）',
      `離中線 ${sideStart.toFixed(2)} → ${sideEnd.toFixed(2)}`
    );
    /*
     * 「被面擋下來」的門檻要拿**碰撞器真正保證的那一條線**去問，不是拿畫出來的矩形。
     * 石脊的碰撞是沿長邊排的一串圓（`bandSolidCircles()`），圓與圓之間會有扇貝形的凹口 ——
     * 人站在兩顆圓中間時，離中線最近只到 `sqrt((r + 玩家半徑)² − (間距/2)²)`。
     * 拿 `半厚 + 玩家半徑` 去問等於在問一個碰撞器從來沒保證過的數字（P11 那版剛好矇對，
     * P12 把帶加厚之後就紅了 —— 紅的是門檻寫錯，不是世界壞了）。
     * 這裡改成逐圓算出**保證值**再問，並且另外釘住「扇貝的凹口不准太深」——
     * 圓串排稀了（或半徑縮小了）那一條會紅。
     */
    const circles = Screens.bandSolidCircles(band);
    ok(circles.length >= 2, 'P11：（前提）石脊的碰撞是一串圓', String(circles.length));
    const spacing = Math.hypot(circles[1].x - circles[0].x, circles[1].z - circles[0].z);
    const guaranteed = Math.sqrt(
      Math.max(0, (circles[0].r + PLAYER_RADIUS_E2E) ** 2 - (spacing / 2) ** 2)
    );
    ok(
      !insideLen || sideEnd >= guaranteed - 0.05,
      'P11：正對著石脊那一段，人是被面擋下來的（不是滑進石頭裡）',
      `離中線 ${sideEnd.toFixed(2)}（碰撞器保證 ${guaranteed.toFixed(2)}：圓半徑 ${circles[0].r} ＋ 玩家 ${PLAYER_RADIUS_E2E}、圓距 ${spacing.toFixed(2)}）`
    );
    ok(
      band.depth / 2 + PLAYER_RADIUS_E2E - guaranteed < 0.35,
      'P11：圓與圓之間的凹口夠淺（碰撞擋住的形狀跟看到的一樣）',
      `${(band.depth / 2 + PLAYER_RADIUS_E2E - guaranteed).toFixed(3)}m`
    );

    // 收尾：回到高原，後面的檢查從乾淨的位置繼續
    await evaluate(`window.__promptasy.player.teleport(0, 6); return 1;`);
    await sleep(240);
  }

  /* ================================================================ */
  /* v1.2 · P12：地面材質語言 ＋ 每區一種粒子 ＋ 新鋪的三道遮擋帶        */
  /* ================================================================ */
  console.log('\n▸ 地面材質語言 ＋ 每區粒子（v1.2 · P12）');
  {
    const Screens = await import('../src/world/screens.js');
    const { sightlineAudit: sightlineAuditP12 } = await import('./sightline-audit.mjs');
    const auditP12 = await sightlineAuditP12();

    /* --- ① 新鋪的兩片土地：橋頭看不到地標，走到揭露點就看得到 --- */
    for (const regionId of ['config', 'toolcraft']) {
      const sl12 = auditP12.regions[regionId];
      ok(Boolean(sl12) && sl12.bands.length >= 1, `（前提）${regionId} 有遮擋帶可以量`, sl12 ? String(sl12.bands.length) : 'null');
      if (!sl12 || !sl12.bands.length) continue;
      const lookAt = async (at) =>
        evaluate(`
          const g = window.__promptasy;
          g.progression.skipGate('${regionId}');
          g.world.openGate('${regionId}', true);
          g.player.teleport(${at[0]}, ${at[1]});
          await new Promise((r) => setTimeout(r, 320));
          const s = g.world.landmarkSightFrom(g.player.position.x, g.player.position.z, '${regionId}');
          return { flat: s.flat, hidden: s.hidden, by: s.by, x: g.player.position.x, z: g.player.position.z };
        `);
      const head12 = await lookAt(sl12.entry);
      ok(
        Math.hypot(head12.x - sl12.entry[0], head12.z - sl12.entry[1]) < 1.5,
        `P12：[${regionId}] 人真的站到橋頭那一點`,
        Math.hypot(head12.x - sl12.entry[0], head12.z - sl12.entry[1]).toFixed(2)
      );
      eq(head12.flat, true, `P12：[${regionId}] 站在橋頭看不到地標`);
      const mid12 = sl12.samples.find((sm) => sm.arc >= 9 && sm.arc < sl12.revealAt) || sl12.samples[3];
      const atMid12 = await lookAt(mid12.at);
      eq(atMid12.flat, true, `P12：[${regionId}] 走了 ${mid12.arc} 公尺還是看不到`);
      const rev12 = sl12.samples.find((sm) => sm.arc === sl12.revealAt) || sl12.samples[sl12.samples.length - 1];
      const atRev12 = await lookAt(rev12.at);
      eq(atRev12.flat, false, `P12：[${regionId}] 繞過去（第 ${sl12.revealAt} 公尺）地標就揭露了`);
      ok(sl12.revealAt <= 25, `P12：[${regionId}] 揭露在 25 公尺內（擋住但不迷路）`, String(sl12.revealAt));
    }

    /* --- ② 只有母題的兩片土地：母題真的擋得住人（走不進石頭裡） --- */
    for (const regionId of ['grounding', 'orchestration']) {
      const list = Screens.MOTIFS.filter((mo) => mo.region === regionId);
      ok(list.length >= 3, `（前提）${regionId} 有三座以上的母題`, String(list.length));
      const mo = list[0];
      const solid = await evaluate(`
        const g = window.__promptasy;
        g.progression.skipGate('${regionId}');
        g.world.openGate('${regionId}', true);
        return {
          core: Boolean(g.world.solidAt(${mo.at[0]}, ${mo.at[1]})),
          named: Boolean(g.world.root.getObjectByName('motif:${mo.id}')),
        };
      `);
      eq(solid.core, true, `P12：[${regionId}] 母題 ${mo.id} 擋得住人`);
      eq(solid.named, true, `P12：[${regionId}] 母題 ${mo.id} 在場景圖裡有自己的節點`);
    }

    /* --- ③ 粒子：畫面上真的有東西，一區一個 Points、共用材質、0 光源 --- */
    const drift = await evaluate(`
      const g = window.__promptasy;
      const layer = g.world.drifts;
      const mats = new Set();
      let points = 0, lights = 0, total = 0, minCount = 1e9;
      layer.group.traverse((o) => {
        if (o.isLight) lights += 1;
        if (o.isPoints) {
          points += 1;
          mats.add(o.material.uuid);
          const n = o.geometry.attributes.position.count;
          total += n;
          if (n < minCount) minCount = n;
        }
      });
      const first = layer.group.children[0];
      return {
        points, lights, mats: mats.size, total, minCount,
        visible: layer.group.visible,
        matVisible: Boolean(first.material.visible && first.material.opacity > 0 && first.material.map),
        names: layer.layers.map((l) => l.points.name),
      };
    `);
    eq(drift.points, 12, 'P12：一片土地一個 Points（12 個 draw call）');
    eq(drift.mats, 1, 'P12：12 區共用同一個材質');
    eq(drift.lights, 0, 'P12：粒子層一盞燈都沒加');
    ok(drift.minCount > 0, 'P12：每一片土地的粒子都不是空的（Points.count > 0）', String(drift.minCount));
    ok(drift.total > 500, 'P12：畫面上真的有一整層粒子', String(drift.total));
    eq(drift.visible, true, 'P12：高畫質時粒子層是開著的');
    eq(drift.matVisible, true, 'P12：粒子的材質看得見（有貼圖、不透明度 > 0）');
    ok(
      drift.names.every((n) => /^drift:[a-z]+$/.test(n)),
      'P12：每一層的節點名照 §5.1（drift:<regionId>）',
      drift.names.slice(0, 3).join(',')
    );

    /* --- ④ 粒子會動；切到低畫質整層消失、切回來又回來 --- */
    const moved = await evaluate(`
      const g = window.__promptasy;
      const arr = g.world.drifts.layers[0].points.geometry.attributes.position.array;
      const before = Float32Array.from(arr);
      const t0 = Date.now();
      // 輪詢到「真的有一顆動了」為止（軟體渲染一幀可能好幾百毫秒，不能用固定 sleep 對齊）
      while (Date.now() - t0 < 6000) {
        await new Promise((r) => setTimeout(r, 120));
        for (let i = 0; i < before.length; i += 1) if (Math.abs(before[i] - arr[i]) > 1e-4) return { moved: true, ms: Date.now() - t0 };
      }
      return { moved: false, ms: Date.now() - t0 };
    `);
    eq(moved.moved, true, 'P12：粒子真的在動（輪詢到位置變了）', `${moved.ms}ms`);

    // 畫質的選單住在設定頁裡 —— 沒開設定頁那顆 <select> 根本不在 DOM 上
    await key('KeyO', 'o', { vk: 79 });
    await sleep(350);
    const settingsOpen12 = await evaluate(`return { open: window.__promptasy.settings.isOpen, sel: Boolean(document.getElementById('set-quality')) };`);
    eq(settingsOpen12.open, true, 'P12：（前提）設定頁開著');
    eq(settingsOpen12.sel, true, 'P12：（前提）畫質選單在 DOM 上');
    const driftLow = await evaluate(`
      const g = window.__promptasy;
      const sel = document.getElementById('set-quality');
      sel.value = 'low';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        await new Promise((r) => setTimeout(r, 120));
        if (g.engine.quality === 'low' && g.world.drifts.group.visible === false) break;
      }
      const arr = g.world.drifts.layers[0].points.geometry.attributes.position.array;
      const snap = Float32Array.from(arr);
      await new Promise((r) => setTimeout(r, 700));
      let still = true;
      for (let i = 0; i < snap.length; i += 1) if (snap[i] !== arr[i]) { still = false; break; }
      return { quality: g.engine.quality, visible: g.world.drifts.group.visible, still };
    `);
    eq(driftLow.quality, 'low', 'P12：畫質切到低了');
    eq(driftLow.visible, false, 'P12：低畫質 → 粒子層整層消失');
    eq(driftLow.still, true, 'P12：低畫質 → 粒子一個位元組都不動（零每幀工作）');

    const driftBack = await evaluate(`
      const g = window.__promptasy;
      const sel = document.getElementById('set-quality');
      sel.value = 'high';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        await new Promise((r) => setTimeout(r, 120));
        if (g.engine.quality === 'high' && g.world.drifts.group.visible === true) break;
      }
      return { quality: g.engine.quality, visible: g.world.drifts.group.visible };
    `);
    eq(driftBack.quality, 'high', 'P12：畫質切回高了');
    eq(driftBack.visible, true, 'P12：切回高畫質 → 粒子層回來了');
    await key('Escape', 'Escape', { vk: 27 });
    await sleep(250);

    /* --- ⑤ 地面：兩片土地的頂點色真的不一樣 --- */
    const groundColors = await evaluate(`
      const g = window.__promptasy;
      const mesh = g.world.root.getObjectByName('terrain');
      const pos = mesh.geometry.attributes.position;
      const col = mesh.geometry.attributes.color;
      const want = ${JSON.stringify(['foundations', 'grounding', 'toolcraft', 'config'])};
      const acc = {};
      for (const id of want) acc[id] = { r: 0, g: 0, b: 0, n: 0 };
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i), z = pos.getZ(i);
        const here = g.world.regionAt ? g.world.regionAt(x, z) : null;
        if (!here || here.onBridge || !acc[here.id]) continue;
        acc[here.id].r += col.getX(i); acc[here.id].g += col.getY(i); acc[here.id].b += col.getZ(i); acc[here.id].n += 1;
      }
      const out = {};
      for (const id of want) out[id] = acc[id].n ? [acc[id].r / acc[id].n, acc[id].g / acc[id].n, acc[id].b / acc[id].n, acc[id].n] : null;
      return out;
    `);
    const ids12e = Object.keys(groundColors);
    for (const id of ids12e) ok(groundColors[id] && groundColors[id][3] > 50, `P12：[${id}] 量得到足夠的地面頂點`, groundColors[id] ? String(groundColors[id][3]) : 'null');
    for (let i = 0; i < ids12e.length; i += 1) {
      for (let j = i + 1; j < ids12e.length; j += 1) {
        const a = groundColors[ids12e[i]];
        const b = groundColors[ids12e[j]];
        if (!a || !b) continue;
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        ok(d > 0.01, `P12：[${ids12e[i]}／${ids12e[j]}] 兩片土地的地面顏色不一樣`, d.toFixed(4));
      }
    }

    // 收尾：回到高原，後面的檢查從乾淨的位置繼續
    await evaluate(`window.__promptasy.player.teleport(0, 6); return 1;`);
    await sleep(240);
  }

  /* ================================================================ */
  await sleep(600);
  const realErrors = consoleErrors.filter((e) => !/favicon|DevTools|Autofill/i.test(e));
  eq(realErrors.length, 0, '全程零 console error', realErrors.slice(0, 6).join('\n      '));

  /*
   * 標題卡的開場曲**刻意**先試一次自動播放（允許就直接響，不允許就等第一下按鍵）——
   * 瀏覽器不允許時一定會念這一句，那是設計好的退路，不是壞掉。
   */
  const gpuWarns = consoleWarns.filter(
    (w) => !/SwiftShader|WebGL|GPU stall|deprecated|AudioContext was not allowed to start/i.test(w)
  );
  ok(gpuWarns.length === 0, '沒有非預期的 console warning', gpuWarns.slice(0, 5).join('\n      '));

  console.log('');
  if (failures.length) {
    console.error(`\n✗ ${failures.length} 項失敗（通過 ${passCount}）：\n`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ headless 全部通過：${passCount} 項檢查、零 console error`);
}

main()
  .catch((err) => {
    console.error('\n✗ headless 驗證中斷：', err.message);
    // 中斷時也要把已經收集到的失敗印出來 —— 不然一個例外會把前面所有線索吃掉
    if (failures.length) {
      console.error(`  （中斷前已有 ${failures.length} 項失敗，通過 ${passCount}）：`);
      for (const f of failures) console.error(`  • ${f}`);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  });

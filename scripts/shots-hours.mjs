#!/usr/bin/env node
/**
 * Promptasy — 一夜的時辰：四張截圖（v1.2 · P05）
 *
 *   node scripts/shots-hours.mjs
 *   （或 npm run shots:hours）
 *
 * 用 headless-check 同一套 CDP 啟動方式（自己的 dev server port ＋ CDP port），
 * 站在 foundations 中心、鏡頭朝月亮那條弧抬頭，對四個時辰各截一張 1280×720 PNG：
 *   docs/design/shots/hour-0.png … hour-3.png
 * 這是手動指令，不進 e2e 常態流程；收尾時殺掉整個 process group（不留孤兒 Chrome / vite）。
 *
 * 環境變數：PA_SHOT_PORT（預設 5197）、PA_SHOT_CDP_PORT（預設 9337）、CHROME_PATH。
 */
import { spawn } from 'node:child_process';
import { connect as netConnect } from 'node:net';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT_DIR = resolve(root, 'docs/design/shots');

const DEV_PORT = Number(process.env.PA_SHOT_PORT || 5197);
const CDP_PORT = Number(process.env.PA_SHOT_CDP_PORT || 9337);
const APP_URL = `http://127.0.0.1:${DEV_PORT}/`;
const CDP_TIMEOUT = Number(process.env.PA_CDP_TIMEOUT || 90000);
const WIDTH = 1280;
const HEIGHT = 720;

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
    if (existsSync(p)) return p;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* CDP 客戶端（與 headless-check.mjs 同一份最小實作）                    */
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
/* 啟動與收尾                                                          */
/* ------------------------------------------------------------------ */
const children = [];
const profileDirs = [];

function cleanup() {
  for (const child of children) {
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

/** 埠衛生：連得上就表示有別人在聽（例如使用者的 dev server 或殘留的無頭 Chrome）→ 直接放棄。 */
function portInUse(port, host = '127.0.0.1') {
  return new Promise((res) => {
    const sock = netConnect({ port, host });
    const done = (v) => {
      sock.destroy();
      res(v);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}
async function assertPortFree(port, what) {
  if (await portInUse(port)) {
    throw new Error(`埠 ${port}（${what}）已經有人在聽 —— 不是我們開的。換一個 port（PA_SHOT_PORT／PA_SHOT_CDP_PORT）或先清掉殘留的 process。`);
  }
}
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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
  mkdirSync(OUT_DIR, { recursive: true });

  // 埠衛生：兩個埠都得是空的（絕不接到別人的 vite／Chrome）
  await assertPortFree(DEV_PORT, 'vite');
  await assertPortFree(CDP_PORT, 'chrome CDP');

  console.log(`▸ dev server  ${APP_URL}`);
  const dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  children.push(dev);
  dev.stderr.on('data', (d) => {
    const s = String(d);
    if (/error/i.test(s)) process.stderr.write(`[vite] ${s}`);
  });
  await waitFor(async () => (await fetch(APP_URL)).ok, { label: 'vite 啟動' });

  console.log(`▸ chrome      ${chrome}`);
  const profile = mkdtempSync(join(tmpdir(), 'promptasy-shots-'));
  profileDirs.push(profile);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-audio-output',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      `--window-size=${WIDTH},${HEIGHT}`,
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

  const version = await waitFor(
    async () => {
      if (!pidAlive(proc.pid) || proc.exitCode != null) throw new Error(`chrome（pid ${proc.pid}）已經退出`);
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return r.ok ? r.json() : null;
    },
    { label: 'chrome DevTools' }
  );
  // 確認 /json/version 是我們剛 spawn 的那一個 Chrome 在回：埠一致、且該 pid 還活著
  {
    const wsUrl = new URL(version.webSocketDebuggerUrl);
    if (Number(wsUrl.port) !== CDP_PORT) {
      throw new Error(`CDP 的 webSocketDebuggerUrl 埠是 ${wsUrl.port}，不是我們要的 ${CDP_PORT} —— 接錯瀏覽器，放棄。`);
    }
    if (!pidAlive(proc.pid) || proc.exitCode != null) {
      throw new Error(`回 /json/version 的不是我們 spawn 的 Chrome（pid ${proc.pid} 已死）—— 放棄。`);
    }
    console.log(`▸ CDP         ${version.Browser || ''} pid=${proc.pid} port=${wsUrl.port}`);
  }
  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const consoleErrors = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push(d.exception?.description || d.text || 'exception');
    }
  });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId
  );

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
  async function key(code, keyName, extra = {}) {
    const base = { code, key: keyName, windowsVirtualKeyCode: extra.vk || 0, ...extra };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
  }

  console.log('▸ 載入遊戲');
  await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
  await waitFor(() => evaluate('return !!window.__promptasy;'), { label: '遊戲載入' });
  await sleep(900);
  // 標題卡：按任意鍵開始
  await key('Enter', 'Enter', { vk: 13 });
  await waitFor(() => evaluate('return !window.__promptasy.title.isOpen;'), { label: '標題卡收起' });
  // 黑幕淡完
  await waitFor(() => evaluate('return !document.getElementById("bootcover");'), { label: '黑幕淡完', timeout: 20000 });
  // 場面清乾淨：跳過序章、收掉教學卡、藏 HUD（只看世界），站到 foundations 中心
  await evaluate(`
    const g = window.__promptasy;
    if (g.prologue.isActive) g.prologue.skip();
    await new Promise((r) => setTimeout(r, 300));
    const startBtn = document.querySelector('.intro [data-start]');
    if (g.intro.isOpen && startBtn) startBtn.click();
    for (const k of ['keyhelp','shareCard','promptConsole','codex','settings','finale','tabletPanel','inscriptionPanel','practice']) {
      try { if (g[k] && g[k].isOpen) g[k].close(); } catch {}
    }
    document.querySelectorAll('.ui, .echo').forEach((el) => { el.style.visibility = 'hidden'; });
    g.player.setInputEnabled(true);
    g.player.teleport(0, 6);
    g.player.setCameraPitch(0.62);
    return 1;
  `);
  // 鏡頭轉向月亮那條弧（方位固定在 (-40, ·, 30)）：用方向鍵轉，輪詢到位（±0.2 rad）**當下**就在頁內放開按鍵
  //（軟體渲染一幀 ~200ms、dt 夾 0.1s → 每幀最多轉 0.18 rad，窗要比它寬；放開鍵在同一段 evaluate 裡做，不多等一趟 CDP 往返）
  const targetYaw = Math.atan2(-40, 30); // forward = (sin yaw, cos yaw)
  const YAW_WINDOW = 0.2;
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true })); return 1;`);
  try {
    await waitFor(
      async () =>
        evaluate(`
          const yaw = window.__promptasy.player.cameraYaw;
          const t = ${targetYaw};
          const d = Math.atan2(Math.sin(yaw - t), Math.cos(yaw - t));
          if (Math.abs(d) < ${YAW_WINDOW}) {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }));
            return true;
          }
          return false;
        `),
      { timeout: 40000, every: 40, label: '鏡頭轉向月亮' }
    );
  } finally {
    // 不管成不成，鍵一定放開
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true })); return 1;`);
  }
  await sleep(300);
  {
    const yaw = await evaluate('return window.__promptasy.player.cameraYaw;');
    const d = Math.atan2(Math.sin(yaw - targetYaw), Math.cos(yaw - targetYaw));
    console.log(`▸ 鏡頭 yaw ${yaw.toFixed(3)}（目標 ${targetYaw.toFixed(3)}，差 ${d.toFixed(3)}）`);
  }

  const results = [];
  for (let hour = 0; hour < 4; hour += 1) {
    await evaluate(`window.__promptasy.engine.forceHour(${hour}); return 1;`);
    // 等 moodNow 貼到 target（天空與霧都平滑完）
    await waitFor(
      async () => {
        const m = await evaluate('return window.__promptasy.engine.mood();');
        const close = (a, b) => Math.abs(a - b) < 1e-3;
        return (
          m.now.fog === m.target.fog &&
          close(m.now.moon.alt, m.target.moon.alt) &&
          close(m.now.moon.phase, m.target.moon.phase) &&
          close(m.now.stars.density, m.target.stars.density) &&
          close(m.now.aurora.intensity, m.target.aurora.intensity) &&
          close(m.now.aurora.hue, m.target.aurora.hue) &&
          close(m.now.hemi, m.target.hemi)
        );
      },
      { timeout: 60000, every: 300, label: `hour ${hour} 氛圍平滑完` }
    );
    await sleep(600);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    const file = resolve(OUT_DIR, `hour-${hour}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const bytes = statSync(file).size;
    const info = await evaluate(`
      const g = window.__promptasy;
      const h = g.hour();
      return { hour: h, moonY: g.engine.moonGroup.position.y, uOpacity: g.engine.stars.material.uniforms.uOpacity.value, fog: g.engine.scene.fog.color.getHexString() };
    `);
    results.push({ hour, file, bytes, info });
    console.log(`  ✓ hour-${hour}.png  ${(bytes / 1024).toFixed(0)} KB  moonY=${info.moonY.toFixed(0)} uOpacity=${info.uOpacity.toFixed(2)} fog=#${info.fog}`);
  }
  await evaluate('window.__promptasy.engine.forceHour(null); return 1;');

  if (consoleErrors.length) {
    console.error(`✗ console error ${consoleErrors.length} 條：`);
    for (const e of consoleErrors) console.error(`  · ${e}`);
    process.exitCode = 1;
  }
  const small = results.filter((r) => r.bytes < 20 * 1024);
  if (small.length) {
    console.error(`✗ 有截圖太小（< 20 KB）：${small.map((r) => r.file).join(', ')}`);
    process.exitCode = 1;
  }
  console.log(`▸ 完成：${results.length} 張 → ${OUT_DIR}`);
}

main()
  .catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode || 0);
  });

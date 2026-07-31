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
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

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
let profileDir = null;

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
  if (profileDir) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
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
  profileDir = mkdtempSync(join(tmpdir(), 'promptasy-e2e-'));
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
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
  children.push(browser);

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

  async function key(code, keyName, extra = {}) {
    const base = { code, key: keyName, windowsVirtualKeyCode: extra.vk || 0, ...extra };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
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
    await waitFor(() => evaluate('return !window.__stale && !!window.__promptasy;'), { label });
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
      markers: g.world.markers.length,
      gates: g.world.gates.length,
      titleOpen: g.title.isOpen,
      introOpen: g.intro.isOpen,
      quality: g.engine.quality,
      sceneNames: g.engine.scene.children.map((c) => c.name).filter(Boolean),
      hasBeacon: g.world.markers.every((m) => !!m.beacon && !!m.halo),
      mistPlanes: g.world.mist.children.length,
      motes: g.world.motes.geometry.attributes.position.count,
      moteColors: !!g.world.motes.geometry.attributes.color,
    };
  `);
  eq(boot.challenges, 27, '27 個關卡載入');
  eq(boot.techniques, 68, '68 條技巧載入');
  eq(boot.markers, 27, '27 座石座在世界裡');
  eq(boot.gates, 4, '4 道閘門在世界裡');
  eq(boot.titleOpen, true, '開機先看到標題卡');
  eq(boot.introOpen, false, '標題卡期間教學還沒跳');
  ok(boot.sceneNames.includes('sky'), '天空 dome 存在');
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
  eq(phase5.landmarks, 5, '五個區域各有一個地標剪影');
  ok(phase5.vignettes >= 14, '故事小景鋪好了', `n=${phase5.vignettes}`);
  eq(phase5.flora, 5, '五個區域都有自己的植被原型');
  eq(phase5.terrainColors, true, '地形帶頂點色（走出來的路）');
  ok(phase5.instanced >= 20, '重複的東西用 InstancedMesh', `n=${phase5.instanced}`);
  ok(phase5.tris < 420000, '場景三角形數在預算內', `tris=${phase5.tris}`);
  ok(phase5.lights <= 56, '燈光數量沒有失控（前向渲染每盞都要算）', `lights=${phase5.lights}`);

  const titleText = await evaluate(`
    const el = document.querySelector('.title');
    return { name: el.querySelector('.title__name')?.textContent, tag: el.querySelector('.title__tag')?.textContent };
  `);
  eq(titleText.name, 'Promptasy', '標題卡顯示遊戲名');
  ok(/Learn Prompt Engineering by Playing/.test(titleText.tag || ''), '標題卡顯示定位句');

  // Phase 30：音檔（共約 15 MB）不能在標題卡之前開始下載（護欄 5：不拖慢第一個畫面）
  const beforeGesture = await evaluate(`
    const g = window.__promptasy;
    const d = g.audio.debug();
    return {
      audioRequests: performance.getEntriesByType('resource').filter((r) => /\\.m4a(\\?|$)/.test(r.name)).length,
      started: d.started,
      pending: d.pending,
      source: d.source,
    };
  `);
  /*
   * 這三條在「標題卡開場曲」上線之後改了語意（見那一次的提交）：
   * 開場曲**刻意**在標題卡上就響起（瀏覽器允許自動播放就直接播，不允許就等第一下按鍵），
   * 所以「手勢之前零音檔、零 AudioContext」已經不是現在要守的東西。
   * 現在要守的是護欄 5 的本意：**別在第一個畫面就把 15 MB 全抓下來**。
   */
  ok(
    beforeGesture.audioRequests <= 14,
    '標題卡上只抓該抓的那幾支（沒有把整包音檔全拉下來）',
    `requests=${beforeGesture.audioRequests}`
  );
  ok(beforeGesture.pending <= 4, '標題卡上排隊中的音檔沒有失控', `pending=${beforeGesture.pending}`);

  // 按任意鍵開始
  await key('Enter', 'Enter', { vk: 13 });
  await sleep(400);
  const afterTitle = await evaluate(`
    const g = window.__promptasy;
    return {
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
  eq(afterTitle.prologueActive, true, '新玩家先進引導課程（Phase 7 序章）');
  eq(afterTitle.echoVisible, true, '回聲字幕條出現');
  eq(afterTitle.shrineActive, true, '起始祭壇亮起（序章的舞台）');
  eq(afterTitle.beatKind, 'say', '序章第一拍是醒來');
  eq(afterTitle.introOpen, false, '序章期間不跳舊的靜態教學卡');
  eq(afterTitle.audioStarted, true, '使用者手勢後 AudioContext 啟動');

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
    const src = document.querySelector('#practice .glyphs a.src');
    const lead = document.querySelector('#practice .act--guide .act__lead');
    const tip = lead.querySelector('.infotip');
    const bubble = lead.querySelector('.infotip__bubble');
    return {
      act: g.practice.act,
      glyphs: glyphs.length,
      title: document.querySelector('#practice .glyph__title')?.textContent || '',
      srcText: src ? src.textContent : '',
      srcHref: src ? src.href : '',
      srcVisible: src ? getComputedStyle(src).visibility : 'none',
      leadText: lead.textContent.trim(),
      leadOwn: Array.from(lead.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
      hasTip: !!tip,
      bubbleText: bubble ? bubble.textContent : '',
      bubbleHidden: bubble ? getComputedStyle(bubble).visibility : 'none',
      describedBy: tip?.querySelector('.infotip__btn')?.getAttribute('aria-describedby'),
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
  ok(/神諭原典/.test(pAct2.srcText), '刻文掛著神諭原典', pAct2.srcText);
  ok(/^https:\/\//.test(pAct2.srcHref), '神諭原典是真的官方連結', pAct2.srcHref);
  eq(pAct2.srcVisible, 'visible', '出處連結永遠看得見（不收進 ⓘ）');
  ok(pAct2.origins >= 1, '官方原文收在可展開的「原文 ↗」裡', `n=${pAct2.origins}`);
  eq(pAct2.originsClosed, true, '「原文 ↗」預設收起來（不干擾閱讀）');
  ok(
    pAct2.originLinks.length > 0 && pAct2.originLinks.every((u) => /^https:\/\//.test(u)),
    '每一份原文都附得出官方出處連結'
  );

  /* --- Phase 13 · ⓘ 資訊提示：預設看不見，hover / focus 才出現 --- */
  eq(pAct2.hasTip, true, '「神諭原典是什麼」收進了一顆 ⓘ');
  ok(pAct2.bubbleText.includes('官方文件'), 'ⓘ 裡確實留著那句解釋（內容沒有被刪掉）', pAct2.bubbleText);
  eq(pAct2.bubbleHidden, 'hidden', 'ⓘ 的說明預設看不見（不再一直佔著版面）');
  ok(!pAct2.leadOwn.includes('官方文件'), '導言只剩下短短一句（解釋不再內嵌在句子裡）', pAct2.leadOwn);
  eq(pAct2.describedBy, pAct2.bubbleId, 'ⓘ 用 aria-describedby 指到說明（螢幕閱讀器讀得到）');
  eq(pAct2.bubbleRole, 'tooltip', '說明的角色是 tooltip');

  const tipHover = await evaluate(`
    const btn = document.querySelector('#practice .act--guide .infotip__btn');
    const bubble = document.querySelector('#practice .act--guide .infotip__bubble');
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    const onHover = getComputedStyle(bubble).visibility;
    btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    await new Promise((r) => setTimeout(r, 260));
    const afterOut = getComputedStyle(bubble).visibility;
    btn.focus();
    await new Promise((r) => setTimeout(r, 260));
    const onFocus = getComputedStyle(bubble).visibility;
    const expanded = btn.getAttribute('aria-expanded');
    btn.blur();
    await new Promise((r) => setTimeout(r, 260));
    return { onHover, afterOut, onFocus, expanded, afterBlur: getComputedStyle(bubble).visibility };
  `);
  eq(tipHover.onHover, 'visible', '滑鼠移上去 ⓘ 就看得到說明');
  eq(tipHover.afterOut, 'hidden', '移開就收回去');
  eq(tipHover.onFocus, 'visible', '鍵盤 focus 也看得到（不是只有滑鼠使用者）');
  eq(tipHover.expanded, 'true', 'focus 時 aria-expanded 跟著更新');
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

  // 出處連結真的是 curriculum 裡那一條（不是隨便湊的）
  const citationCheck = await evaluate(`
    const g = window.__promptasy;
    const step = g.prologueContent.step('prologue-clarity');
    const urls = new Set(g.content.curriculum.techniques.flatMap((t) => t.sources.map((s) => s.url)));
    const shown = Array.from(document.querySelectorAll('#practice .result a.src')).map((a) => a.href.replace(/\\/$/, ''));
    return { ok: shown.every((u) => urls.has(u) || urls.has(u + '/')), source: step.source, inCurriculum: urls.has(step.source) };
  `);
  eq(citationCheck.inCurriculum, true, '這一課的 source 真的存在於 curriculum');
  eq(citationCheck.ok, true, '面板上的每個出處都指向 curriculum 裡的官方連結');

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
      const srcs = document.querySelectorAll('#practice .glyphs a.src').length;
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
      head: document.querySelector('#prompt-console .act--guide .act__head').textContent.trim(),
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
      tipDescribes:
        document.querySelector('#prompt-console .act--guide .infotip__btn')?.getAttribute('aria-describedby') ===
        document.querySelector('#prompt-console .act--guide .infotip__bubble')?.id,
      craft: document.querySelector('#prompt-console [data-craft]').textContent.trim(),
      dataCraft: g.content.challenge('gate-of-clarity-01').craft,
      rubric: g.content.challenge('gate-of-clarity-01').rubric.length,
      glyphs: glyphs.length,
      titles: glyphs.map((n) => n.querySelector('.glyph__title')?.textContent.trim() || ''),
      whats: glyphs.map((n) => (n.querySelector('.glyph__what')?.textContent || '').length),
      srcLabels: glyphs.map((n) => n.querySelector('a.src')?.textContent.trim() || ''),
      srcHrefs: glyphs.map((n) => n.querySelector('a.src')?.getAttribute('href') || ''),
      srcTargets: glyphs.map((n) => n.querySelector('a.src')?.getAttribute('target') || ''),
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
  ok(/官方文件/.test(act2.tipBubble), 'ⓘ 裡確實留著「神諭原典＝官方文件」的解釋', act2.tipBubble);
  eq(act2.tipVisibility, 'hidden', 'ⓘ 的說明預設看不見');
  eq(act2.tipDescribes, true, 'ⓘ 用 aria-describedby 指到說明');
  eq(act2.craft, act2.dataCraft, '第二幕接住從任務搬出來的「工法」');
  ok(act2.craft.length > 10, '工法講得出「這次要怎麼答」', act2.craft);
  eq(act2.glyphs, act2.rubric, '這一關每一條檢查都有一段刻文');
  ok(act2.whats.every((n) => n >= 20), '每一段刻文都有白話說明', act2.whats.join(','));
  ok(
    act2.srcLabels.every((t) => /^神諭原典：.+↗$/.test(t)),
    '出處的標籤換成世界觀說法，但後面接得出真正的文件名',
    act2.srcLabels.join(' ｜ ')
  );
  ok(
    act2.srcLabels.every((t) => /OpenAI|Anthropic|Google|xAI/.test(t)),
    '刻文不冒充官方引文：標籤上就寫出是哪一家的文件',
    act2.srcLabels.join(' ｜ ')
  );
  ok(
    act2.srcHrefs.length > 0 && act2.srcHrefs.every((u) => /^https:\/\//.test(u)),
    '每一段刻文的出處都是可點的官方連結（護欄 2）',
    act2.srcHrefs.join(' ')
  );
  ok(act2.srcTargets.every((t) => t === '_blank'), '出處連結開新視窗，不會把玩家踢出遊戲');
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
      guideTabSources: document.querySelectorAll('#prompt-console .guidetab__list a.src').length,
      xp: g.progression.state.xp,
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
  eq(consoleOpen.checklist, 4, '主控台列出 4 條 rubric');
  eq(consoleOpen.sources, 4, '每條 rubric 都有官方出處連結');
  eq(consoleOpen.railVisible, true, '刻痕對照跟石碑同時在畫面上');
  eq(consoleOpen.lampVisible, true, '進度燈也在第三幕看得到');
  eq(consoleOpen.sideBySide, true, '刻痕對照在石碑「旁邊」，不是下面');
  ok(/神諭刻文/.test(consoleOpen.guideTab), '第三幕有一個翻回刻文的側頁籤', consoleOpen.guideTab);
  eq(consoleOpen.guideTabOpen, false, '側頁籤預設收著（不擋舞台）');
  eq(consoleOpen.guideTabRows, 4, '側頁籤壓成一行一條');
  eq(consoleOpen.guideTabSources, 4, '側頁籤裡每一條照樣點得到官方出處');
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
  eq(consoleLive.empty.ready, false, '還沒達標時送出鍵不發光');
  ok(consoleLive.one.lit >= 1, '打字打到一項就亮一盞燈', `lit=${consoleLive.one.lit}`);
  ok(consoleLive.one.justlit >= 1, '剛亮起來的那一項有亮燈動畫', `justlit=${consoleLive.one.justlit}`);
  ok(/再完成/.test(consoleLive.one.lampText), '進度燈跟著更新剩幾項', consoleLive.one.lampText);
  ok(consoleLive.done.lit >= 3, '補齊之後亮起多盞燈', `lit=${consoleLive.done.lit}`);
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
  eq(orb.coachEntries, 22, 'coach.json 覆蓋全部 22 條檢查');

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
  ok(bad.hints >= 3, '未通過時給出具體缺失提示', `hints=${bad.hints}`);
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
      saved: !!localStorage.getItem('promptasy.v1.save'),
    };
  `);
  eq(good.grade, 'S', '示範解答拿到 S');
  ok(good.stampClass.includes('is-stamp'), '評價印章動畫（M5 回饋節奏）', good.stampClass);
  ok(good.stampClass.includes('grade--s'), 'S 評價有專屬樣式');
  ok(good.xp > 0, '通過後拿到 XP', `xp=${good.xp}`);
  eq(good.collected, 3, '3 條技巧收進圖鑑');
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

  // --- 開一關沒被別的測試碰過的：面具工坊 ---
  const carveOpen = await evaluate(`
    const g = window.__promptasy;
    g.promptConsole.open(g.content.challenge('mask-workshop-41'));
    await new Promise((r) => setTimeout(r, 240));
    // Phase 12：石碑住在第三幕 —— 先讓導演把鏡頭推到那裡
    const actAtOpen = g.promptConsole.act;
    g.promptConsole.goAct(3, { force: true });
    await new Promise((r) => setTimeout(r, 300));
    const flow = g.content.flow('mask-workshop-41');
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
  ok(/第 1 \/ 4 段/.test(carveOpen.progress), '進度寫著「第 1 / 4 段」', carveOpen.progress);
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
      dataFeedback: g.content.flow('mask-workshop-41').slots[0].options[${wrongIdx}].feedback,
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
  ok(/第 1 \/ 4 段/.test(wrongPick.progress), '選錯不會前進到下一段', wrongPick.progress);
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
    const flow = g.content.flow('mask-workshop-41');
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
      kicker: document.querySelector('#prompt-console [data-carve-kicker]').textContent.trim(),
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
  ok(/第四幕/.test(carveAll.kicker), '幕標也跟著改口', carveAll.kicker);
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
      best: g.progression.bestGrade('mask-workshop-41'),
      cleared: g.world.markers.find((m) => m.id === 'mask-workshop-41')?.cleared,
      source: document.querySelector('#prompt-console .result__source a')?.getAttribute('href') || '',
      dataSource: g.content.challenge('mask-workshop-41').source,
    };
  `);
  eq(sealed.fired, true, '按住到底就發動了');
  eq(sealed.ignited, true, '發動時石碑亮起來（光柱）');
  eq(sealed.palmFired, true, '手掌印跟著爆一下光');
  eq(sealed.resultHidden, false, '接著就是原本那張結果面板');
  eq(sealed.grade, 'S', '石碑刻印全部選對＝S（超容易過關）');
  eq(sealed.pass, true, '結果面板判定為通過');
  eq(sealed.rows, 5, '結果一條一條列出這一關的 5 項檢查');
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
  eq(codex.techs, 68, '圖鑑列出 68 條技巧');
  ok(codex.collected > 0, '這一輪已經收集了一些技巧', `collected=${codex.collected}`);
  eq(codex.locked, codex.total - codex.collected, '未收集的技巧顯示為 ???');
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
  // 五片土地各一首 ＋ 標題卡的開場曲
  eq(audioFiles.bgmKeys.length, 6, '五區各有一首配樂音檔，外加標題卡的開場曲');
  ok(audioFiles.bgmKeys.includes('title'), '開場曲也在配樂表上', audioFiles.bgmKeys.join(','));
  for (const region of ['foundations', 'reasoning', 'grounding', 'orchestration', 'config']) {
    ok(audioFiles.bgmKeys.includes(region), `${region} 有自己的配樂`);
  }
  eq(new Set(audioFiles.files).size, 6, '每一首都是不同的檔案');
  eq(new Set(audioFiles.titles).size, 6, '每一首曲名各不相同');
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
    const cues = ['pass', 'unlock', 'gateOpen', 'click', 'shrine', 'finale', 'submit', 'open', 'codex']
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
    g.player.teleport(-95, -95);
    await new Promise((r) => setTimeout(r, 1800));
    return {
      audioBefore,
      audioAfter: g.audio.region,
      regionText: document.querySelector('[data-region]')?.textContent || '',
      fogBefore,
      fogAfter: g.engine.scene.fog.color.getHex(),
      markersHere: g.world.markers.filter((m) => m.region === 'reasoning').length,
    };
  `);
  eq(crossing.audioBefore, 'foundations', '跨區前配樂在 foundations');
  eq(crossing.audioAfter, 'reasoning', '跨區後配樂交叉淡到 reasoning（M5）');
  ok(crossing.regionText.includes('示範與推理'), 'HUD 區域名跟著更新', crossing.regionText);
  ok(crossing.fogBefore !== crossing.fogAfter, '跨區時霧色平滑漂移（M4 轉場）',
    `${crossing.fogBefore.toString(16)} → ${crossing.fogAfter.toString(16)}`);
  eq(crossing.markersHere, 5, 'reasoning 區有 5 座石座');

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
  // Phase 22 多了一整層互動（刻文小語 / 反應 / 祕密）＋ WORLD.md 的世界觀用語，
  // 語料從 1472 → 1583 字。上限往上調一格，但仍遠低於完整字型（16 MB + 11 MB）。
  ok(
    fonts.serifBytes + fonts.sansBytes < 1_060_000,
    '兩套中文字型合計在 1.01 MB 以內',
    `${((fonts.serifBytes + fonts.sansBytes) / 1024).toFixed(0)} KB`
  );
  eq(fonts.externalFontReqs, 0, '沒有任何外部字型 CDN 請求（護欄 3：可離線）');
  ok(
    fonts.selfHosted.every((n) => /^(fraunces-display|inter-ui|newsreader|arcade-mono|arcade-serif-tc|arcade-sans-tc)\.woff2$/.test(n)),
    '載入的字型全部來自 public/fonts/ 的自架子集',
    fonts.selfHosted.join(', ')
  );

  // 2) 標題卡的分字揭示會跑完（每個字最後都回到 opacity 1）
  const titleReveal = await evaluate(`
    const g = window.__promptasy;
    const root = g.title.root;
    root.hidden = false;
    root.classList.remove('is-leaving');
    root.classList.add('is-open');
    // 重播一次分字動畫
    const chars = [...root.querySelectorAll('.title__ch')];
    for (const c of chars) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
    const midway = getComputedStyle(chars[chars.length - 1]).opacity;
    // 從 display:none 回來時 CSS 動畫會整組重播：最後一個字 0.36+11×0.045+0.9 ≈ 1.76s，
    // 底線 0.95+1.1 = 2.05s —— 等 2.6s 確保兩者都收尾
    await new Promise((r) => setTimeout(r, 2600));
    const done = chars.map((c) => Number(getComputedStyle(c).opacity));
    const name = root.querySelector('.title__name');
    const ruleScale = getComputedStyle(root.querySelector('.title__rule')).transform;
    root.hidden = true;
    root.classList.remove('is-open');
    return {
      count: chars.length,
      text: name.textContent,
      aria: name.getAttribute('aria-label'),
      midway: Number(midway),
      minOpacity: Math.min(...done),
      ruleScale,
    };
  `);
  eq(titleReveal.count, 9, '標題被拆成 9 個字元各自進場（Promptasy）');
  eq(titleReveal.text, 'Promptasy', '拆字後 textContent 仍然是完整品牌名');
  eq(titleReveal.aria, 'Promptasy', '拆字後給螢幕閱讀器的 aria-label 正確');
  ok(titleReveal.midway < 0.5, '揭示開始時最後一個字還沒出現（真的有 stagger）', String(titleReveal.midway));
  ok(titleReveal.minOpacity > 0.99, '揭示結束後每個字都完全顯示', String(titleReveal.minOpacity));
  // scaleX 用字串比對（!/matrix\(0/）會被 0.99999 這種收尾誤判成失敗 —— 改成看數值
  const ruleScaleX =
    titleReveal.ruleScale === 'none' ? 1 : Number((titleReveal.ruleScale.match(/matrix\(([^,]+)/) || [])[1]);
  ok(ruleScaleX > 0.99, '標題下的髮絲線展開完成', titleReveal.ruleScale);

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
  ok(revealSeq.n >= 3, '結果列出多條檢查', String(revealSeq.n));
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
  eq(compass.marks, 5, '五座地標各有一根淡針');
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
  ok(seals.ghost.height >= 40, '幕指示器的命中高度 ≥ 40px', `${seals.ghost.height}px`);

  // 面板裡看得到的按鈕，命中範圍一律 ≥ 34px（次要碎件），.btn 一律 ≥ 40px
  const targets = await evaluate(`
    const els = [...document.querySelectorAll('#prompt-console button')].filter((b) => b.checkVisibility());
    const small = els
      .map((b) => ({ cls: b.className, h: Math.round(b.getBoundingClientRect().height) }))
      .filter((x) => x.h < 34);
    const btns = els.filter((b) => b.classList.contains('btn'));
    return { n: els.length, small, minBtn: Math.min(...btns.map((b) => b.getBoundingClientRect().height)) };
  `);
  eq(targets.small.length, 0, '面板裡沒有任何過小的命中範圍', JSON.stringify(targets.small));
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
    eq(crackTest.lifted, 'none', '被拒絕的石籤不會再被滑鼠抬起來');
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
    tipBtn?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
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
  ok(!/https?:\/\//.test(card.caption), '那段話裡沒有任何連結', card.caption);
  eq(card.model.rankTitle, '釋義者', '卡片資料的稱號正確');
  eq(card.model.level, 6, '卡片資料的等級正確');
  eq(card.model.collected, 46, '卡片資料的收集數正確');
  eq(card.model.total, 68, '卡片資料的技巧總數正確');
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

  const teachesMatch = await evaluate(`
    const g = window.__promptasy;
    const ch = g.content.challenge('gate-of-clarity-01');
    const ids = g.shareCard.model().techniques.map((t) => t.id);
    return ids.every((id) => ch.teaches.includes(id));
  `);
  eq(teachesMatch, true, '卡片上的技法就是這一關教的那幾條');

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
    const sys = document.querySelector('#sharecard [data-sysshare]');
    const dl = document.querySelector('#sharecard [data-download]');
    const copy = document.querySelector('#sharecard [data-copy]');
    const say = document.querySelector('#sharecard [data-caption]');
    return {
      open: g.shareCard.isOpen,
      ready,
      sysHidden: sys.hidden,
      sysDrawn: sys.getClientRects().length > 0,
      copyLabel: copy ? copy.textContent.trim() : '',
      copyClass: copy ? copy.className : '',
      dlClass: dl.className,
      dlLabel: dl.textContent.trim(),
      // 那一排（Phase 31）：三個平台 ＋ 一顆「複製文案」
      chips: document.querySelectorAll('#sharecard [data-chip]').length,
      chipIds: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.getAttribute('data-chip')),
      chipLabels: [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.textContent.trim()),
      sendLabel: document.querySelectorAll('#sharecard .sharecard__sendlabel').length,
      // 那一排是按鈕不是連結 —— 因為要先把圖備好才開新頁（順序不能交給瀏覽器）
      newTabs: document.querySelectorAll('#sharecard a[target="_blank"]').length,
      chipTags: [...new Set([...document.querySelectorAll('#sharecard [data-chip]')].map((n) => n.tagName))],
      sayTag: say ? say.tagName : '',
      sayValue: say ? say.value : '',
      sayLabel: document.querySelector('#sharecard .sharecard__saylabel')?.textContent.trim() || '',
      sayFont: say ? getComputedStyle(say).fontFamily : '',
      sayDescribed: say ? say.getAttribute('aria-describedby') : '',
      labelFor: document.querySelector('#sharecard .sharecard__saylabel')?.getAttribute('for') || '',
      hints: [...document.querySelectorAll('#sharecard .sharecard__hint')].map((n) => n.textContent.trim()),
      kbd: [...document.querySelectorAll('#sharecard .sharecard__hint kbd')].map((n) => n.textContent.trim()),
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
  eq(sendPlain.sysHidden, true, '這個瀏覽器帶不動檔案 → 系統分享的入口收起來（不給死路）');
  eq(sendPlain.sysDrawn, false, '收起來的入口真的沒畫出來（鍵盤也走不到）');
  eq(sendPlain.chips, 4, '那一排有四顆：三個平台 ＋ 一顆「複製文案」（Phase 31）');
  eq(sendPlain.chipIds.join(','), 'threads,facebook,instagram,caption', '那一排的順序：最順的那條路排前面');
  ok(
    sendPlain.chipLabels.join(' ').includes('Threads') &&
      sendPlain.chipLabels.join(' ').includes('Facebook') &&
      sendPlain.chipLabels.join(' ').includes('Instagram') &&
      sendPlain.chipLabels.join(' ').includes('複製文案'),
    '那一排每一顆都寫著自己是什麼',
    sendPlain.chipLabels.join(' ｜ ')
  );
  eq(sendPlain.sendLabel, 1, '那一排有自己的標題');
  eq(sendPlain.newTabs, 0, '那一排是按鈕不是連結（先備好圖，才輪到開新頁）');
  eq(sendPlain.chipTags.join(','), 'BUTTON', '那一排全部是按鈕');
  ok(sendPlain.copyLabel.includes('複製圖＋文'), '沒有系統分享時，那顆鈕寫著「複製圖＋文」', sendPlain.copyLabel);
  ok(sendPlain.copyClass.includes('btn--primary'), '沒有系統分享時，「複製圖＋文」就是主角', sendPlain.copyClass);
  ok(sendPlain.dlClass.includes('btn--ghost'), '「下載圖片」退成安靜的那一階（一個畫面只有一個主角）', sendPlain.dlClass);
  ok(sendPlain.dlLabel.includes('下載圖片'), '「下載圖片」還在（保底那條路）', sendPlain.dlLabel);
  eq(sendPlain.focusOnCopy, true, '開卡時焦點就落在主角上');
  eq(sendPlain.remoteNodes, 0, '分享卡仍然沒有任何外部資源節點（零 SDK）');

  /* --- 那段話：一個真的能改的框，預設就寫好了，而且不帶連結 --- */
  eq(sendPlain.sayTag, 'TEXTAREA', '那段話是一個可以改的框');
  ok(sendPlain.sayValue.includes('釋義者'), '那段話預設帶著稱號', sendPlain.sayValue);
  ok(sendPlain.sayValue.includes('46 / 68'), '那段話預設帶著收集進度', sendPlain.sayValue);
  ok(sendPlain.sayValue.includes('Learn Prompt Engineering by Playing'), '那段話落款是品牌那一句');
  ok(!/https?:\/\//.test(sendPlain.sayValue), '那段話裡沒有任何連結', sendPlain.sayValue);
  ok(!/github/i.test(sendPlain.sayValue), '那段話裡沒有程式碼倉庫的字眼', sendPlain.sayValue);
  ok(!/https?:\/\//.test(sendPlain.wholeText), '整張分享卡上都看不到網址', sendPlain.wholeText.slice(0, 120));
  ok(!/github/i.test(sendPlain.wholeText), '整張分享卡上都看不到程式碼倉庫的字眼');
  ok(sendPlain.sayLabel.includes('一段話'), '框上面寫著這是什麼', sendPlain.sayLabel);
  eq(sendPlain.labelFor, 'sharecard-say', '標籤綁得到那個框（螢幕閱讀器唸得出來）');
  eq(sendPlain.sayDescribed, 'sharecard-sayhint', '框旁邊那句說明也綁得回框本身');
  ok(!/Arcade Sans|Arcade Serif/.test(sendPlain.sayFont), '玩家自己打的字走系統字型（子集缺字也不會破圖）', sendPlain.sayFont);
  ok(sendPlain.data.text === sendPlain.sayValue.trim(), '要送出去的那段話就是框裡的字');
  eq(Object.keys(sendPlain.data).join(','), 'text,preset', '要送出去的東西只有那段話（沒有網址）');

  /* --- 畫面上的說明：貼上之後會發生什麼 --- */
  const plainHints = sendPlain.hints.join(' ');
  ok(plainHints.includes('Facebook') && plainHints.includes('Instagram') && plainHints.includes('Threads'),
    '說明點得出常見的那幾個地方', plainHints);
  ok(plainHints.includes('貼上'), '說明講得出「直接貼上」這個動作', plainHints);
  ok(plainHints.includes('圖和文字'), '說明講得出圖和文字會一起送出', plainHints);
  ok(!plainHints.includes('連結'), '說明不再提「連結」（分享的是圖）', plainHints);
  ok(sendPlain.kbd.includes('Tab') && sendPlain.kbd.includes('Enter'), '畫面上戴著 Tab / Enter 的鍵帽', sendPlain.kbd.join(' '));
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
  ok(!/https?:\/\//.test(copyClick.clip[0].text), '剪貼簿裡那段話沒有連結', copyClick.clip[0].text);
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

  /* --- ① Threads：文字用網址帶進去，剪貼簿只放圖 --- */
  const th = await tapChip('threads');
  eq(th.opened.length, 1, 'Threads：真的開了一頁');
  ok(th.opened[0].url.startsWith('https://www.threads.com/intent/post?text='), 'Threads：開的是官方的撰寫入口', th.opened[0].url);
  ok(
    decodeURIComponent(th.opened[0].url.split('text=')[1]).includes('（今晚刻完的）'),
    'Threads：玩家改過的那段話真的被帶進網址（撰寫框會先填好）',
    th.opened[0].url
  );
  ok(!/https?:\/\//.test(decodeURIComponent(th.opened[0].url.split('text=')[1])), 'Threads：帶過去的那段話裡沒有網址');
  eq(th.opened[0].target, '_blank', 'Threads：開在新分頁');
  ok(String(th.opened[0].features).includes('noopener'), 'Threads：開出去的那一頁動不到這一頁', String(th.opened[0].features));
  eq(th.opened[0].gesture, true, 'Threads：開新頁時手勢還在（不會被當成彈出視窗擋掉）');
  eq(th.clip.length, 1, 'Threads：只寫一次剪貼簿');
  eq(th.clip[0].types.join(','), 'image/png', 'Threads：剪貼簿裡**只有圖**（那一下 Ctrl+V 不會變成貼出一段字）');
  ok(th.toast.some((t) => t.includes('Ctrl+V')), 'Threads：提示直接寫出要按的那組鍵', th.toast.join(' ｜ '));
  ok(th.toast.some((t) => t.includes('文字')), 'Threads：提示說得出文字已經帶過去了', th.toast.join(' ｜ '));
  eq(th.downloads.length, 0, 'Threads：走貼上，不用先下載');
  eq(th.used, true, 'Threads：按過的石籤會變樣子');

  /* --- ② Facebook：沒有帶得動內容的撰寫入口 → 開首頁，圖走剪貼簿 --- */
  const fb = await tapChip('facebook');
  eq(fb.opened.length, 1, 'Facebook：真的開了一頁');
  eq(fb.opened[0].url, 'https://www.facebook.com/', 'Facebook：開的是首頁（玩家自己登入著的那個帳號）');
  ok(!fb.opened[0].url.includes('sharer'), 'Facebook：不走那個只送得出連結的舊入口', fb.opened[0].url);
  eq(fb.opened[0].gesture, true, 'Facebook：開新頁時手勢還在');
  eq(fb.clip.length, 1, 'Facebook：只寫一次剪貼簿');
  eq(fb.clip[0].types.join(','), 'image/png', 'Facebook：剪貼簿裡只有圖（貼上就是貼圖）');
  ok(fb.toast.some((t) => t.includes('Ctrl+V')), 'Facebook：提示寫出要按的那組鍵', fb.toast.join(' ｜ '));
  ok(fb.toast.some((t) => t.includes('複製文案')), 'Facebook：帶不進文字 → 提示指得出補文字的那一顆', fb.toast.join(' ｜ '));
  eq(fb.downloads.length, 0, 'Facebook：走貼上，不用先下載');

  /* --- ③ Instagram：網頁版只選得了檔案 → 先下載，不假裝貼得上 --- */
  const ig = await tapChip('instagram');
  eq(ig.opened.length, 1, 'Instagram：真的開了一頁');
  eq(ig.opened[0].url, 'https://www.instagram.com/', 'Instagram：開首頁（沒有直接開撰寫的網址，也不編一個假的）');
  ok(!ig.opened[0].url.includes('/create'), 'Instagram：不用那個伺服器根本不認的假深連結', ig.opened[0].url);
  eq(ig.downloads.length, 1, 'Instagram：圖真的存到裝置上了（那邊只選得了檔案）');
  eq(ig.downloads[0].isImage, true, 'Instagram：存下去的是那張 PNG');
  ok(/^promptasy-.*\.png$/.test(ig.downloads[0].name), 'Instagram：檔名看得出是這個遊戲的卡', String(ig.downloads[0].name));
  eq(ig.clip.length, 0, 'Instagram：不寫剪貼簿（那邊貼不上，寫了也是騙人）');
  ok(ig.toast.some((t) => t.includes('建立')), 'Instagram：提示講得出要按那邊的「建立」', ig.toast.join(' ｜ '));
  ok(ig.toast.some((t) => t.includes('下載')), 'Instagram：提示講得出圖已經存下來了', ig.toast.join(' ｜ '));

  /* --- ④ 複製文案：帶不進文字的那兩顆靠它補 --- */
  const capChip = await tapChip('caption');
  eq(capChip.opened.length, 0, '複製文案：不開新頁（它只做一件事）');
  eq(capChip.clip.length, 1, '複製文案：只寫一次剪貼簿');
  eq(capChip.clip[0].types.join(','), 'text/plain', '複製文案：剪貼簿裡只有那段話');
  ok(capChip.clip[0].text.includes('（今晚刻完的）'), '複製文案：複製的是玩家改過的版本', capChip.clip[0].text);
  ok(!/https?:\/\//.test(capChip.clip[0].text), '複製文案：那段話裡沒有網址', capChip.clip[0].text);
  eq(capChip.downloads.length, 0, '複製文案：不下載');

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
  const afterRight2 = await evaluate(`return document.activeElement.getAttribute('data-chip');`);
  eq(afterRight2, 'instagram', '→ 再走到下一顆');
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
  eq(byEnter.opened[0].url, 'https://www.facebook.com/', 'Enter 按下去的是焦點所在的那一顆', String(byEnter.opened[0].url));
  eq(byEnter.clip.length, 1, 'Enter 按下去一樣會把圖備好');
  ok(byEnter.toast.length > 0, 'Enter 按下去一樣說得出接下來要做什麼', byEnter.toast.join(' ｜ '));

  /* --- 每一顆都給螢幕閱讀器講清楚它會做什麼 --- */
  const chipA11y = await evaluate(`
    return [...document.querySelectorAll('#sharecard [data-chip]')].map((n) => ({
      id: n.getAttribute('data-chip'),
      aria: n.getAttribute('aria-label') || '',
      type: n.getAttribute('type'),
    }));
  `);
  for (const c of chipA11y) {
    ok(c.aria.length >= 8, `${c.id} 有給螢幕閱讀器的說明`, c.aria);
    eq(c.type, 'button', `${c.id} 是 type="button"（不會誤送出表單）`);
  }
  ok(
    chipA11y.find((c) => c.id === 'instagram').aria.includes('建立'),
    'Instagram 的說明也講得出接下來要按什麼',
    chipA11y.find((c) => c.id === 'instagram').aria
  );

  /* --- ② 有系統分享面板：把「一個 PNG 檔案 ＋ 那段話」真的交出去 --- */
  const sysShare = await evaluate(`
    const g = window.__promptasy;
    window.__shared = null;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => !!(data && data.files && data.files.length === 1 && data.files[0].type === 'image/png'),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__shared = {
          text: data.text,
          keys: Object.keys(data),
          files: (data.files || []).map((f) => ({
            name: f.name, type: f.type, size: f.size, isFile: f instanceof File, isBlob: f instanceof Blob,
          })),
          // 手勢還在不在？（share() 前面只要 await 一次就會變 false）
          gesture: navigator.userActivation ? navigator.userActivation.isActive : null,
        };
      },
    });
    g.shareCard.close();
    g.shareCard.open({ kind: 'codex' });
    await new Promise((r) => setTimeout(r, 260));
    const sys = document.querySelector('#sharecard [data-sysshare]');
    const dl = document.querySelector('#sharecard [data-download]');
    const copy = document.querySelector('#sharecard [data-copy]');
    return {
      sysHidden: sys.hidden,
      label: sys.textContent.trim(),
      aria: sys.getAttribute('aria-label') || '',
      hero: sys.className,
      copyClass: copy.className,
      dlClass: dl.className,
      focusInPanel: document.querySelector('#sharecard .panel').contains(document.activeElement),
      focusOn: document.activeElement.getAttribute('data-sysshare') !== null,
      chips: document.querySelectorAll('#sharecard [data-chip]').length,
      // 換一張卡 → 那段話回到預設（上一張改過的話不會跟過來）
      sayValue: document.querySelector('#sharecard [data-caption]').value,
    };
  `);
  eq(sysShare.sysHidden, false, '瀏覽器帶得動檔案 → 系統分享的入口出現');
  ok(sysShare.label.includes('分享圖＋文'), '那個入口寫著「分享圖＋文」', sysShare.label);
  ok(sysShare.aria.includes('圖') && sysShare.aria.includes('話'), '那個入口有給螢幕閱讀器的說明', sysShare.aria);
  ok(sysShare.hero.includes('btn--primary'), '系統分享是主角（hero 階）', sysShare.hero);
  ok(sysShare.copyClass.includes('btn--ghost'), '這時「複製圖＋文」退成次要階', sysShare.copyClass);
  ok(sysShare.dlClass.includes('btn--ghost'), '這時「下載圖片」也是次要階（畫面只有一個主角）', sysShare.dlClass);
  eq(sysShare.focusInPanel, true, '重開之後焦點仍然在分享卡裡');
  eq(sysShare.focusOn, true, '焦點落在「分享圖＋文」上（這個畫面的主角）');
  eq(sysShare.chips, 4, '有系統分享時那一排照樣在（它們帶得走圖，不是死路）');
  ok(!sysShare.sayValue.includes('（今晚刻完的）'), '重開一張卡 → 那段話回到預設', sysShare.sayValue);

  // 重開之後那張圖要重新編碼一次 → 等它備好再按（沒備好按下去只會叫你等）
  const sysReady = await waitShareFile();
  eq(sysReady, true, '重開之後 PNG 又備好了');

  // 玩家先把那段話改成自己想說的，再真的按下去（Input 事件 → 真正的使用者手勢）
  await typeIntoCaption('（這一關卡了三次）');
  await evaluate(`
    document.querySelector('#sharecard [data-sysshare]').focus();
    return true;
  `);
  await enterNative();
  await sleep(400);
  const shared = await evaluate(`return window.__shared;`);
  ok(!!shared, '按下去真的呼叫了系統分享');
  eq(shared.files.length, 1, '交出去的是一個檔案');
  eq(shared.files[0].type, 'image/png', '交出去的是 PNG');
  eq(shared.files[0].isFile, true, '交出去的真的是 File');
  ok(shared.files[0].size > 20000, '交出去的圖有內容', `size=${shared.files[0].size}`);
  ok(/^promptasy-.*\.png$/.test(shared.files[0].name), '檔名看得出是這個遊戲的卡', shared.files[0].name);
  ok(shared.text.includes('（這一關卡了三次）'), '交出去的那段話是玩家改過的版本', shared.text);
  ok(shared.text.includes('釋義者') && shared.text.includes('46 / 68'), '那段話帶著稱號與收集進度', shared.text);
  ok(shared.text.includes('Learn Prompt Engineering by Playing'), '那段話帶著品牌落款');
  ok(!/https?:\/\//.test(shared.text), '那段話裡沒有任何連結（收到的人看到的是圖，不是連結）', shared.text);
  eq(shared.keys.sort().join(','), 'files,text', '交出去的只有圖與那段話（沒有 url、沒有 title）');
  eq(shared.gesture, true, '呼叫時使用者手勢還在（share 之前沒有 await）');

  // 玩家自己取消不該變成錯誤
  const abort = await evaluate(`
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; },
    });
    const before = document.querySelectorAll('.toast').length;
    document.querySelector('#sharecard [data-sysshare]').click();
    await new Promise((r) => setTimeout(r, 340));
    return { before, after: document.querySelectorAll('.toast').length };
  `);
  eq(abort.after, abort.before, '玩家自己取消分享時什麼都不說（不是失敗）');

  /* --- 窄畫面：那段話與按鈕都不會被擠到摺線下面 --- */
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 820, height: 720, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await sleep(520);
  const sendNarrow = await evaluate(`
    const panel = document.querySelector('#sharecard .panel');
    const sys = document.querySelector('#sharecard [data-sysshare]');
    const say = document.querySelector('#sharecard [data-caption]');
    return {
      overflow: Math.max(0, panel.scrollWidth - panel.clientWidth),
      docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      sysVisible: sys.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1,
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
  eq(sendNarrow.sysVisible, true, '820px 下「分享圖＋文」仍然不用捲動就看得到');
  eq(sendNarrow.sayInside, true, '820px 下那段話的框在面板寬度內');
  ok(sendNarrow.sayH >= 60, '820px 下那個框還打得下幾行字', `h=${sendNarrow.sayH}`);
  eq(sendNarrow.chips.length, 4, '820px 下那一排四顆都在');
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
    const before = Math.hypot(t.x - g.player.position.x, t.z - g.player.position.z);
    // 明顯往目標走過去
    g.player.teleport(t.x + 22, t.z + 16);
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
    const src = panel.querySelector('a.src');
    out.srcText = src ? src.textContent.trim() : '';
    out.srcUrl = src ? src.getAttribute('href') : '';
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
  ok(Object.keys(p25.regions).length === 5, '五片土地上都有器物', JSON.stringify(p25.regions));
  for (const [rid, n] of Object.entries(p25.regions)) ok(n >= 3, `[${rid}] 至少擺了 3 件`, String(n));
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
    // 走過去
    g.player.teleport(spec.at[0] + 1.8, spec.at[1] + 1.8);
    await new Promise((r) => setTimeout(r, 420));
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
    await new Promise((r) => setTimeout(r, 420));
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
    await new Promise((r) => setTimeout(r, 300));
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
    const c = g.content.challenges.find((c) => !g.progression.isCleared(c.id) && g.content.flow(c.id));
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
      sources: document.querySelectorAll('#prompt-console [data-guidance] a.src').length,
    };
  `);
  eq(kbAct2.act, 2, 'Enter 推到第二幕（指引）');
  ok(kbAct2.glyphs >= 1, '第二幕看得到神諭刻文', String(kbAct2.glyphs));
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
  ok(/Enter/.test(kbPalm.hint), '手掌印上寫著「Enter 也可以」', kbPalm.hint);

  // --- 按住 Enter 把手掌按上石碑 ---
  await keyDown('Enter', 'Enter', { vk: 13 });
  await sleep(900);
  await keyUp('Enter', 'Enter', { vk: 13 });
  await sleep(700);
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
    const out = { total: g.content.challenges.length, byKind: { choice: 0, order: 0, workshop: 0 }, missing: [] };
    for (const c of g.content.challenges) {
      const f = flows[c.id];
      if (!f) { out.missing.push(c.id); continue; }
      const k = f.kind === 'order' && f.orderFlow ? 'order' : f.kind === 'workshop' && f.workshop ? 'workshop' : 'choice';
      out.byKind[k] += 1;
      // 三種題型都還留著選擇題的資料當後備
      if (!Array.isArray(f.slots) || !f.slots.length) out.missing.push(c.id + ':noslots');
    }
    out.orderIds = Object.entries(flows).filter(([, f]) => f.kind === 'order').map(([id]) => id).sort();
    out.workshopIds = Object.entries(flows).filter(([, f]) => f.kind === 'workshop').map(([id]) => id).sort();
    return out;
  `);
  eq(kinds.total, 27, '世界上有 27 關（新增了神諭工坊）');
  eq(kinds.missing.length, 0, '每一關都有流程資料，而且都留著選擇題後備', kinds.missing.join(','));
  eq(kinds.byKind.choice, 24, '24 關維持原本的石碑刻印（零行為變化）');
  eq(kinds.byKind.order, 2, '2 關改成排序刻印');
  eq(kinds.byKind.workshop, 1, '1 關是神諭工坊');
  eq(kinds.orderIds.join(','), 'long-scroll-tower-23,priority-stair-42', '改成排序的就是那兩關（次序本身就是課程）');
  eq(kinds.workshopIds.join(','), 'oracle-workshop-36', '神諭工坊是新的第 27 關');

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
  ok(dropped.lit >= 3, '旁邊的刻痕對照跟著亮燈', String(dropped.lit));
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
  await mouse('mousePressed', palmBox.x, palmBox.y);
  await sleep(900);
  await mouse('mouseReleased', palmBox.x, palmBox.y);
  await sleep(700);
  const orderResult = await evaluate(`
    const g = window.__promptasy;
    return {
      fired: g.promptConsole.orderBoard.fired,
      grade: document.querySelector('#prompt-console .grade__mark')?.textContent.trim(),
      resultHidden: document.querySelector('#prompt-console [data-result]').hidden,
      best: g.progression.bestGrade('long-scroll-tower-23'),
      xpGain: g.progression.state.xp - ${dropped.xp},
      sources: [...document.querySelectorAll('#prompt-console [data-result] a.src')].length,
    };
  `);
  eq(orderResult.fired, true, '按住手掌 900ms 真的發動了');
  eq(orderResult.resultHidden, false, '結果面板照舊出現');
  eq(orderResult.grade, 'S', '排對的順序走同一支離線引擎 → 拿到 S');
  eq(orderResult.best, 'S', '評價寫進進度');
  ok(orderResult.xpGain > 0, '排序刻印一樣給 XP', String(orderResult.xpGain));
  ok(orderResult.sources >= 4, '結果面板每一條都掛著官方出處', String(orderResult.sources));

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
  eq(stairBefore.correct.join(','), 'role,task,format,context', '正解是「規則區在最上面」');
  const drag = await evaluate(`
    const grip = (id) => document.querySelector('#prompt-console [data-slip="' + id + '"]');
    grip('role').scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 240));
    const a = grip('role').getBoundingClientRect();
    const b = grip('context').getBoundingClientRect();
    return {
      fromX: Math.round(a.x + 30), fromY: Math.round(a.y + a.height / 2),
      toX: Math.round(b.x + 30), toY: Math.round(b.y + 4),
    };
  `);
  await mouse('mouseMoved', drag.fromX, drag.fromY, { buttons: 0 });
  await mouse('mousePressed', drag.fromX, drag.fromY);
  await sleep(140);
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await mouse('mouseMoved', drag.fromX, Math.round(drag.fromY + (drag.toY - drag.fromY) * t));
    await sleep(90);
  }
  await mouse('mouseReleased', drag.toX, drag.toY);
  await sleep(360);
  const dragged = await evaluate(`
    const b = window.__promptasy.promptConsole.orderBoard;
    return { arrangement: b.arrangement, right: b.progress.right,
      rightMark: document.querySelector('#prompt-console .slip[data-slip-id="role"]').classList.contains('is-right') };
  `);
  eq(dragged.arrangement[0], 'role', '滑鼠拖曳真的把「角色與目標」搬到最上面');
  eq(dragged.rightMark, true, '搬對的那一片立刻標成「位置對了」');
  ok(dragged.right >= 1, '拖曳之後至少一片站對了', String(dragged.right));

  // 排錯不會失敗：手掌印不出現、不扣分、也不會跳結果面板
  const stillSafe = await evaluate(`
    const g = window.__promptasy;
    const b = g.promptConsole.orderBoard;
    b.arrange(['role', 'context', 'format', 'task']);
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
  ok(stairDone.text.indexOf('# 角色與目標') === 0, '規則區真的排在最上面', stairDone.text.slice(0, 20));
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
      sources: [...document.querySelectorAll('#prompt-console .glyphs a.src')]
        .filter((a) => a.textContent.trim().startsWith('神諭原典'))
        .map((a) => a.href),
      labels: [...document.querySelectorAll('#prompt-console .glyphs a.src')]
        .filter((a) => a.textContent.trim().startsWith('神諭原典'))
        .map((a) => a.textContent.trim()),
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
  ok(/派工單/.test(wsOpen.act1.mission), '委託講的是「把委託變成一張派工單」', wsOpen.act1.mission);
  ok(/燈塔守/.test(wsOpen.act1.material), '素材就是旅人那句話', wsOpen.act1.material);
  eq(wsOpen.act2.glyphs, 4, '第二幕的神諭刻文＝這一關的四條檢查');
  ok(
    wsOpen.act2.sources.every((u) => /^https:/.test(u)) && wsOpen.act2.sources.length === 4,
    '每一條刻文都掛著可點的官方出處',
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
  ok(paramStage.lit >= 1, '第一步就把「工具規格」那一盞燈點亮了', String(paramStage.lit));

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
  ok(/亂編|猜/.test(badRule.fb), '教學講出「參數不是用猜的」', badRule.fb);
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
  eq(wsDone.lit, 4, '四盞燈全亮');
  ok(/把手掌按上石碑/.test(wsDone.lampText), '進度燈說「把手掌按上石碑就過關了」', wsDone.lampText);

  const wsPalm = await centerOf('#prompt-console .workshop .palm');
  await mouse('mousePressed', wsPalm.x, wsPalm.y);
  await sleep(900);
  await mouse('mouseReleased', wsPalm.x, wsPalm.y);
  await sleep(700);
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
  eq(pedestal.region, 'orchestration', '石座擺在齒輪工坊（流程與代理）');
  eq(pedestal.solidThere, true, '石座本體擋得住人（走不進石頭裡）');
  eq(pedestal.reachable, true, '石座四周走得到互動距離');
  eq(pedestal.inRegion, 6, '齒輪工坊現在有 6 關');

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
      storage: localStorage.getItem('promptasy.v1.save'),
    };
  `);
  eq(reset.xp, 0, '重置後 XP 歸零');
  eq(reset.collected, 0, '重置後圖鑑清空');
  eq(reset.cleared, 0, '重置後通關紀錄清空');
  eq(reset.storage, null, '重置後 localStorage 已清除');

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

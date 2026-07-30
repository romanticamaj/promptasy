/**
 * PromptArcade — 效能監視器（Phase 17）
 *
 * 這個世界是用 three.js／WebGL 畫出來的（真的有在用顯示卡）。想知道自己的機器
 * 跑不跑得動、或是切了畫質到底有沒有差，需要一個看得到數字的地方。
 *
 * 做法（和「夜間檔案館 / 刻印牌」同一套語言，純 DOM ＋ CSS ＋ 一張小 canvas）：
 *   · 右上角一塊切角的小石牌，浮在所有東西之上（診斷面板，面板打開時也看得到）
 *   · 數字每 0.25 秒更新一次（每幀刷字會自己變成效能問題）；折線圖每幀畫一格
 *   · 指標：FPS（現值 ＋ 最近 60 幀的柱狀圖）、CPU 每幀毫秒、繪製次數、三角形數，
 *     以及 JS 記憶體（只有 Chrome 有 performance.memory，沒有就整列不顯示）
 *   · 顯示卡（Phase 19）：型號 ＋ GPU 每幀耗時。**瀏覽器拿不到「GPU 使用率 %」**
 *     （沒有這種 Web API），所以這裡給的是拿得到的兩件事實，並且講清楚是什麼
 *   · 可以收合成一塊「只有 FPS」的小牌子；抓著上緣可以拖到別的角落
 *   · 關掉時**整個停掉**（把 engine 的 update 掛勾解掉），不是只 display:none
 *   · prefers-reduced-motion：不畫會動的圖，只留數字
 *
 * 它不吃滑鼠：整塊 pointer-events: none，只有上緣把手與收合鈕接得到點擊，
 * 所以永遠不會擋住玩家對世界的操作。
 */
import { el, infoTip, bindInfoTips } from './dom.js';

/** 折線圖保留幾幀。 */
export const GRAPH_SAMPLES = 60;
/** 數字多久更新一次（秒）—— 約每秒 4 次，人眼讀得動又不閃。 */
export const READOUT_INTERVAL = 0.25;

const GRAPH_W = 120;
const GRAPH_H = 30;
/** 柱狀圖的滿格值（FPS）。超過就頂到天花板。 */
const GRAPH_MAX = 70;

/** GPU 那一段的說明（收在一顆 ⓘ 後面，不佔版面）。 */
export const GPU_TIP =
  '瀏覽器拿不到 GPU 使用率；這裡顯示的是 GPU 型號與每幀渲染耗時';
/** 驅動不給計時查詢時，那一列就安靜地寫這個（不是錯誤）。 */
export const GPU_UNSUPPORTED = '不支援';
/** 沒有真的用到顯示卡時的警示字樣。 */
export const GPU_SOFTWARE_LABEL = '軟體渲染（未用 GPU）';
/** 名稱太長就截斷（小石牌只有 168px 寬）。 */
const GPU_NAME_MAX = 44;

const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/* ================================================================ 顯示卡
   瀏覽器只給得起兩件事實：**型號字串**（WEBGL_debug_renderer_info）與
   **每幀 GPU 耗時**（EXT_disjoint_timer_query_webgl2）。使用率 % 沒有 API。
   下面兩個函式是純字串處理，方便離線測試（見 npm run test:rubric）。       */

/** 軟體渲染（沒有真的用到顯示卡）的特徵字。 */
const SOFTWARE_RE =
  /swiftshader|llvmpipe|softpipe|swrast|mesa offscreen|microsoft basic render|software rasterizer|\bsoftware\b/i;

/**
 * 這串型號是不是軟體渲染器？（headless / 沒驅動 / 遠端桌面很常見）
 * @param {string} raw UNMASKED_RENDERER_WEBGL 的原字串
 */
export function isSoftwareRenderer(raw) {
  return SOFTWARE_RE.test(String(raw || ''));
}

/** 以最外層的逗號切開（括號裡的逗號不算）。 */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** 把型號裡的雜訊（shader model、裝置 id、商標符號）清掉。 */
function cleanCard(text) {
  let s = String(text || '')
    .replace(/\(0x[0-9a-f]+\)/gi, '')
    .replace(/\bDirect3D\d*\b/gi, '')
    .replace(/\b[vp]s_\d+_\d+\b/gi, '')
    .replace(/\/(PCIe|SSE2|3D now!?)/gi, '')
    .replace(/\((?:R|TM)\)|®|™/g, '')
    .replace(/\bDevice\b/gi, '')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,]+$/, '')
    .trim();
  // 軟體渲染器的字串通常又臭又長（Vulkan 1.3.0 (SwiftShader (Subzero))），
  // 認得出來就直接用大家看得懂的短名。
  if (/swiftshader/i.test(s)) s = 'SwiftShader';
  else if (/llvmpipe/i.test(s)) s = 'llvmpipe';
  else if (/microsoft basic render/i.test(s)) s = 'Microsoft Basic Render';
  return s;
}

/** 後端（D3D11 / Vulkan / OpenGL ES / Metal）—— 把版本號與 driver 尾巴削掉。 */
function cleanBackend(text) {
  return String(text || '')
    .replace(/\bdriver(-[\d.]+)?\b/gi, '')
    .replace(/\s*\d+(\.\d+)+.*$/, '')
    .replace(/\s*\(.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-–—_,\s]+$/, '')
    .trim();
}

/**
 * 把 ANGLE 那一大串雜訊縮成「顯示卡 · 後端」。
 *
 *   ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)
 *     → NVIDIA GeForce RTX 4070 · D3D11
 *   NVIDIA GeForce RTX 4070 (ANGLE D3D11) → NVIDIA GeForce RTX 4070 · D3D11
 *   Apple M1 Pro → Apple M1 Pro（沒有 ANGLE 就原樣留著）
 *
 * @param {string} raw
 * @returns {string}
 */
export function shortenGpuName(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  let card = text;
  let backend = '';

  const wrapped = text.match(/^ANGLE\s*\((.*)\)$/is);
  if (wrapped) {
    const parts = splitTopLevel(wrapped[1]);
    if (parts.length >= 3) {
      card = parts[1];
      backend = parts[parts.length - 1];
    } else if (parts.length === 2) {
      card = parts[1];
    } else {
      card = parts[0] || text;
    }
  } else {
    const suffix = text.match(/^(.*?)\s*\(\s*ANGLE\s+([^)]*)\)\s*$/i);
    if (suffix) {
      card = suffix[1];
      backend = suffix[2];
    }
  }

  card = cleanCard(card);
  backend = cleanBackend(backend);
  if (!card) card = cleanCard(text) || text;
  // 後端已經寫在型號裡就不重複（例如 SwiftShader · SwiftShader）
  if (backend) {
    const a = card.toLowerCase();
    const b = backend.toLowerCase();
    if (a.includes(b) || b.includes(a)) backend = '';
  }

  let out = backend ? `${card} · ${backend}` : card;
  if (out.length > GPU_NAME_MAX) out = `${out.slice(0, GPU_NAME_MAX - 1).trim()}…`;
  return out;
}

/** 從 WebGL context 問出型號字串（拿不到就回空字串，絕不丟例外）。 */
export function readGpuName(gl) {
  if (!gl) return '';
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const unmasked = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      if (unmasked) return String(unmasked);
    }
    return String(gl.getParameter(gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/**
 * GPU 每幀耗時的量測器（EXT_disjoint_timer_query_webgl2）。
 *
 * 重點：
 *   · **不會 stall** —— 送出查詢之後隔幾幀再回來問結果，絕不 getQueryParameter 到卡住
 *   · 一次只有一個 TIME_ELAPSED 查詢在跑（規格只允許一個），查詢物件循環使用
 *   · GPU_DISJOINT 時整批丟掉（那批數字不可信）
 *   · 驅動沒有這個擴充就整個關掉（很多驅動真的沒有），畫面上寫「不支援」
 *   · 關掉監視器時把查詢物件全部刪乾淨 —— 收起來就真的零開銷
 */
export function createGpuTimer(gl) {
  const supported =
    !!gl &&
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext;
  let ext = null;
  let broken = false;
  /** 目前正在跑的查詢（同時只能有一個）。 */
  let active = null;
  /** 已經 endQuery、等著拿結果的佇列。 */
  const pending = [];
  /** 回收再用的查詢物件。 */
  const pool = [];
  const MAX_QUERIES = 4;
  let created = 0;
  let lastMs = null;

  function acquire() {
    if (pool.length) return pool.pop();
    if (created >= MAX_QUERIES) return null;
    const q = gl.createQuery();
    if (q) created += 1;
    return q;
  }

  return {
    get supported() {
      return supported && !broken && !!ext;
    },
    /** 開始量測（在引擎真正 render 之前呼叫）。 */
    begin() {
      if (!supported || broken) return;
      if (!ext) {
        ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) {
          broken = true;
          return;
        }
      }
      if (active) return;
      const q = acquire();
      if (!q) return;
      try {
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        active = q;
      } catch {
        broken = true;
      }
    },
    /** 結束量測（在所有後製 pass 都畫完之後呼叫），順便收上幾幀的結果。 */
    end() {
      if (!supported || broken || !ext) return;
      if (active) {
        try {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(active);
        } catch {
          broken = true;
        }
        active = null;
      }
      // 收結果：GPU 還沒寫回來就下一幀再說（永遠不等）
      while (pending.length) {
        const q = pending[0];
        let done = false;
        try {
          done = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
        } catch {
          broken = true;
          return;
        }
        if (!done) break;
        pending.shift();
        try {
          // 讀 GPU_DISJOINT 同時會把旗標清掉 —— 有中斷就整筆丟掉
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
          if (!disjoint && Number.isFinite(ns)) lastMs = ns / 1e6;
        } catch {
          broken = true;
        }
        pool.push(q);
      }
    },
    /** 最近一次量到的 GPU 每幀耗時（毫秒）；還沒有結果就是 null。 */
    get ms() {
      return lastMs;
    },
    /** 收起監視器時把查詢物件全部還給驅動。 */
    dispose() {
      if (!gl) return;
      try {
        if (active && ext) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(active);
        }
      } catch {
        /* 忽略：context 可能已經沒了 */
      }
      active = null;
      for (const q of pending.splice(0)) {
        try {
          gl.deleteQuery(q);
        } catch {
          /* 同上 */
        }
      }
      for (const q of pool.splice(0)) {
        try {
          gl.deleteQuery(q);
        } catch {
          /* 同上 */
        }
      }
      created = 0;
      lastMs = null;
    },
  };
}

/**
 * @param {object} opts
 * @param {*} opts.engine  engine.onUpdate(fn) → 回傳解除掛勾的函式；engine.renderer.info 提供繪製統計
 * @param {boolean} [opts.enabled] 初始是否開啟（來自存檔）
 */
export function createPerfMonitor({ engine, enabled = false }) {
  const root = el('div', 'perfmon');
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'off');
  root.setAttribute('aria-label', '效能監視器');

  const hasMemory = typeof performance !== 'undefined' && !!performance.memory;
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.innerHTML = `
    <span class="perfmon__grain" aria-hidden="true"></span>
    <div class="perfmon__grip" data-grip>
      <span class="perfmon__chip"><b data-fps>--</b><i>FPS</i></span>
      <button class="perfmon__fold" data-fold type="button" aria-expanded="true" title="收合／展開（F3 可整個關掉）">
        <span aria-hidden="true">—</span>
        <span class="sr-only">收合效能監視器</span>
      </button>
    </div>
    <div class="perfmon__body" data-body>
      <canvas class="perfmon__graph" data-graph width="${GRAPH_W}" height="${GRAPH_H}" aria-hidden="true"></canvas>
      <dl class="perfmon__rows">
        <div class="perfmon__row"><dt>CPU 幀</dt><dd data-ms>--</dd></div>
        <div class="perfmon__row"><dt>GPU 幀</dt><dd data-gpums>--</dd></div>
        <div class="perfmon__row"><dt>繪製</dt><dd data-calls>--</dd></div>
        <div class="perfmon__row"><dt>三角形</dt><dd data-tris>--</dd></div>
        <div class="perfmon__row" data-heaprow${hasMemory ? '' : ' hidden'}><dt>記憶體</dt><dd data-heap>--</dd></div>
      </dl>
      <div class="perfmon__gpu">
        <p class="perfmon__gpuhead">顯示卡${infoTip(GPU_TIP, { label: 'GPU 資訊說明' })}</p>
        <p class="perfmon__gpuname" data-gpuname title="">--</p>
        <p class="perfmon__gpuflag" data-gpusoft hidden>${GPU_SOFTWARE_LABEL}</p>
      </div>
      <p class="perfmon__foot">F3 開關 · 設定頁也有</p>
    </div>
  `;

  const fpsEl = root.querySelector('[data-fps]');
  const msEl = root.querySelector('[data-ms]');
  const callsEl = root.querySelector('[data-calls]');
  const trisEl = root.querySelector('[data-tris]');
  const heapEl = root.querySelector('[data-heap]');
  const gpuMsEl = root.querySelector('[data-gpums]');
  const gpuNameEl = root.querySelector('[data-gpuname]');
  const gpuSoftEl = root.querySelector('[data-gpusoft]');
  const foldBtn = root.querySelector('[data-fold]');
  const gripEl = root.querySelector('[data-grip]');
  const canvas = root.querySelector('[data-graph]');
  const ctx = reduced ? null : canvas.getContext('2d');
  if (reduced) canvas.hidden = true;
  bindInfoTips(root);

  /* --- 取樣狀態 --- */
  const samples = new Float32Array(GRAPH_SAMPLES);
  let head = 0;
  let filled = 0;
  let acc = 0;
  let accFrames = 0;
  /** 累計處理過的幀數 —— 自動化測試靠它確認「關掉之後真的沒有在跑」。 */
  let frames = 0;
  let last = { fps: 0, ms: 0, calls: 0, triangles: 0, heapMB: 0 };

  let unhook = null;
  let unhookBefore = null;
  let unhookAfter = null;
  let live = false;
  let collapsed = false;
  let lastStamp = 0;
  let firstTick = true;
  let prevAutoReset = true;
  /** 上一整幀的繪製統計（見下方 tick 對 renderer.info 的處理）。 */
  let frameCalls = 0;
  let frameTris = 0;

  /* --- 顯示卡（Phase 19）：型號讀一次就好；耗時只在打開時量 --- */
  const glOf = () => {
    try {
      return engine.renderer && engine.renderer.getContext ? engine.renderer.getContext() : null;
    } catch {
      return null;
    }
  };
  let gpuName = '';
  let gpuRaw = '';
  let gpuSoftware = false;
  let gpuNameRead = false;
  /** @type {ReturnType<typeof createGpuTimer>|null} */
  let gpuTimer = null;
  let gpuMs = null;

  function ensureGpuName() {
    if (gpuNameRead) return;
    gpuNameRead = true;
    gpuRaw = readGpuName(glOf());
    gpuName = shortenGpuName(gpuRaw);
    gpuSoftware = isSoftwareRenderer(gpuRaw);
    gpuNameEl.textContent = gpuName || '未知';
    // 完整原字串留在 title 裡（縮寫過的名字仍然查得到原文）
    gpuNameEl.setAttribute('title', gpuRaw || '');
    gpuSoftEl.hidden = !gpuSoftware;
    root.classList.toggle('is-software', gpuSoftware);
  }

  function resetSamples() {
    samples.fill(0);
    head = 0;
    filled = 0;
    acc = 0;
    accFrames = 0;
    lastStamp = 0;
    firstTick = true;
    frameCalls = 0;
    frameTris = 0;
  }

  function drawGraph() {
    if (!ctx) return;
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    // 60 FPS 的參考線（很淡的一條髮絲線）
    const refY = GRAPH_H - (60 / GRAPH_MAX) * GRAPH_H;
    ctx.fillStyle = 'rgba(196, 220, 236, 0.14)';
    ctx.fillRect(0, refY, GRAPH_W, 1);

    const barW = GRAPH_W / GRAPH_SAMPLES;
    for (let i = 0; i < filled; i += 1) {
      // 由舊到新，最新的一格畫在最右邊
      const idx = (head - filled + i + GRAPH_SAMPLES * 2) % GRAPH_SAMPLES;
      const v = Math.min(GRAPH_MAX, samples[idx]);
      const h = Math.max(1, (v / GRAPH_MAX) * GRAPH_H);
      const x = GRAPH_W - (filled - i) * barW;
      // 順／卡：60 以上冷星光、30 以上暖金、再低就偏紅
      ctx.fillStyle = v >= 50 ? 'rgba(169,201,216,0.72)' : v >= 26 ? 'rgba(230,199,155,0.78)' : 'rgba(224,128,110,0.8)';
      ctx.fillRect(x, GRAPH_H - h, Math.max(1, barW - 0.6), h);
    }
  }

  function readout() {
    last = {
      fps: accFrames / acc,
      ms: (acc * 1000) / accFrames,
      calls: frameCalls,
      triangles: frameTris,
      heapMB: hasMemory ? performance.memory.usedJSHeapSize / 1048576 : 0,
    };
    fpsEl.textContent = String(Math.round(last.fps));
    msEl.textContent = `${last.ms.toFixed(1)} ms`;
    callsEl.textContent = fmt(last.calls);
    trisEl.textContent = fmt(last.triangles);
    if (hasMemory) heapEl.textContent = `${last.heapMB.toFixed(0)} MB`;
    // GPU 每幀：驅動沒給計時擴充就安靜地寫「不支援」，不是錯誤也不吵人
    if (!gpuTimer || !gpuTimer.supported) {
      gpuMs = null;
      gpuMsEl.textContent = GPU_UNSUPPORTED;
      gpuMsEl.classList.add('is-muted');
    } else {
      gpuMs = gpuTimer.ms;
      gpuMsEl.classList.remove('is-muted');
      gpuMsEl.textContent = gpuMs == null ? '量測中' : `${gpuMs.toFixed(1)} ms`;
    }
    // 一眼看得出順不順（不是只靠顏色：數字本身就在旁邊）
    root.classList.toggle('is-low', last.fps < 26);
    acc = 0;
    accFrames = 0;
  }

  /**
   * 每幀的量測。engine 的 update 掛勾在「這一幀開始渲染之前」被呼叫，所以：
   *   · 時間用自己的時戳算（engine 的 dt 為了物理穩定會被夾在 0.1 秒，
   *     直接拿來算 FPS 會永遠看不到低於 10 的數字）
   *   · renderer.info 在這裡讀到的是「上一整幀」的累計值。後製開啟時一幀會
   *     render 好幾次，autoReset 會讓 info 只剩最後一個 pass —— 所以改成
   *     自己控制：讀完就 reset，下一次讀到的就是完整一幀的總和。
   */
  function tick() {
    frames += 1;
    const now = performance.now();
    const info = engine.renderer && engine.renderer.info ? engine.renderer.info : null;
    if (info) {
      // 第一次進來的時候「上一幀」還沒有在我們的計數之下跑過，跳過不採計
      if (!firstTick && info.render.calls > 0) {
        frameCalls = info.render.calls;
        frameTris = info.render.triangles;
      }
      info.reset();
    }
    const d = lastStamp ? Math.max(0.0005, (now - lastStamp) / 1000) : 1 / 60;
    lastStamp = now;
    firstTick = false;
    samples[head] = 1 / d;
    head = (head + 1) % GRAPH_SAMPLES;
    if (filled < GRAPH_SAMPLES) filled += 1;
    acc += d;
    accFrames += 1;
    if (!collapsed && !reduced) drawGraph();
    if (acc >= READOUT_INTERVAL) readout();
  }

  /* --- 拖曳：只有上緣那條把手接得到指標 --- */
  let drag = null;
  gripEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-fold]')) return;
    const box = root.getBoundingClientRect();
    drag = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    gripEl.setPointerCapture?.(e.pointerId);
    root.classList.add('is-dragging');
  });
  gripEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const box = root.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - box.width - 4, e.clientX - drag.dx));
    const y = Math.max(4, Math.min(window.innerHeight - box.height - 4, e.clientY - drag.dy));
    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
    root.style.right = 'auto';
  });
  const endDrag = () => {
    drag = null;
    root.classList.remove('is-dragging');
  };
  gripEl.addEventListener('pointerup', endDrag);
  gripEl.addEventListener('pointercancel', endDrag);

  function setCollapsed(v) {
    collapsed = Boolean(v);
    root.classList.toggle('is-collapsed', collapsed);
    foldBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  foldBtn.addEventListener('click', () => setCollapsed(!collapsed));

  function setEnabled(next) {
    const on = Boolean(next);
    if (on === live) return live;
    live = on;
    const info = engine.renderer && engine.renderer.info ? engine.renderer.info : null;
    if (on) {
      resetSamples();
      root.hidden = false;
      if (info) {
        prevAutoReset = info.autoReset;
        info.autoReset = false;
        info.reset();
      }
      // 掛到引擎既有的主迴圈上（不另外開一支 rAF）
      unhook = engine.onUpdate(tick);
      // 顯示卡：型號讀一次；耗時的查詢只在打開時存在（收起來 = 零開銷）
      ensureGpuName();
      gpuTimer = createGpuTimer(glOf());
      gpuMs = null;
      gpuMsEl.textContent = '--';
      // 整幀（含所有後製 pass）圍起來量，不是單一個 pass
      unhookBefore = engine.onBeforeRender?.(() => gpuTimer && gpuTimer.begin()) ?? null;
      unhookAfter = engine.onAfterRender?.(() => gpuTimer && gpuTimer.end()) ?? null;
    } else {
      unhook?.();
      unhook = null;
      unhookBefore?.();
      unhookBefore = null;
      unhookAfter?.();
      unhookAfter = null;
      gpuTimer?.dispose();
      gpuTimer = null;
      gpuMs = null;
      root.hidden = true;
      // 還原 renderer.info 的自動歸零，關掉之後引擎回到原本的樣子
      if (info) {
        info.autoReset = prevAutoReset;
        info.reset();
      }
      if (ctx) ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    }
    return live;
  }

  if (enabled) setEnabled(true);

  return {
    root,
    setEnabled,
    toggle: () => setEnabled(!live),
    setCollapsed,
    get isEnabled() {
      return live;
    },
    get isCollapsed() {
      return collapsed;
    },
    /** 除錯 / 自動化測試用（純讀）。frames 會在關掉之後停住。 */
    state() {
      return {
        enabled: live,
        collapsed,
        frames,
        hasMemory,
        reduced,
        samples: filled,
        fps: last.fps,
        ms: last.ms,
        calls: last.calls,
        triangles: last.triangles,
        heapMB: last.heapMB,
        /* --- 顯示卡（Phase 19）--- */
        gpuName,
        gpuRaw,
        gpuSoftware,
        /** GPU 每幀耗時（毫秒）；驅動不支援計時查詢就是 null。 */
        gpuMs,
        gpuTiming: !!(gpuTimer && gpuTimer.supported),
      };
    },
  };
}

export default createPerfMonitor;

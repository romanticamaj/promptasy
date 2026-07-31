/**
 * Promptasy — 音訊：分區生成式配樂 ＋ 合成音效
 *
 * 全部用 Web Audio 即時合成，**沒有任何外部音檔**（護欄：離線可玩、資產零成本）。
 *
 * 結構：
 *   destination ← master ← [reverb(convolver) + dry] ← bus
 *   bus ← 每個區域一組 layer（pad 和聲 ＋ 低音 ＋ 濾波 LFO），用 gain 交叉淡入淡出
 *   bus ← 隨機鐘聲（依當區音階 / 密度排程）
 *   master ← SFX（不經 reverb 的部分直接進 master，反應才夠即時）
 *
 * 瀏覽器政策：AudioContext 必須在使用者手勢後才能啟動（title card 的「按任意鍵」就是那個手勢）。
 */

/** 半音 → 頻率倍率。 */
const semitone = (n) => Math.pow(2, n / 12);

/**
 * 五個區域的音樂性格。
 * root 是低音的根音（Hz）；scale 是相對根音的半音級數（決定調式的顏色）；
 * voicing 決定 pad 用哪些泛音層；bell 是鐘聲密度（每次排程觸發的機率）。
 *
 * 匯出成純資料 → 可以在 node 測試裡直接驗證，不需要 AudioContext。
 */
export const REGION_MOODS = Object.freeze({
  // 撰寫基本功：A 小調自然音，開放五度，最平靜
  foundations: Object.freeze({
    id: 'foundations',
    name: '高原的呼吸',
    root: 110.0,
    scale: Object.freeze([0, 7, 12, 19, 24]),
    bellScale: Object.freeze([0, 3, 7, 10, 12, 15]),
    voicing: Object.freeze(['sine', 'triangle', 'sine']),
    cutoff: 620,
    lfoRate: 0.045,
    bellDensity: 0.5,
    bellEvery: 11,
    detune: 6,
  }),
  // 示範與推理：Lydian 的明亮 #4，音高稍高，鐘聲較密（像在思考時的閃念）
  reasoning: Object.freeze({
    id: 'reasoning',
    name: '階梯上的思緒',
    root: 130.81,
    scale: Object.freeze([0, 7, 14, 18, 23]),
    bellScale: Object.freeze([0, 2, 6, 7, 11, 14]),
    voicing: Object.freeze(['triangle', 'sine', 'triangle']),
    cutoff: 780,
    lfoRate: 0.062,
    bellDensity: 0.66,
    bellEvery: 8,
    detune: 4,
  }),
  // 脈絡與長文：低沉的 Dorian，長音、鐘聲稀疏（像很深的檔案庫）
  grounding: Object.freeze({
    id: 'grounding',
    name: '沉書的低鳴',
    root: 98.0,
    scale: Object.freeze([0, 5, 12, 15, 22]),
    bellScale: Object.freeze([0, 3, 5, 10, 12, 17]),
    voicing: Object.freeze(['sine', 'sine', 'triangle']),
    cutoff: 480,
    lfoRate: 0.033,
    bellDensity: 0.38,
    bellEvery: 14,
    detune: 8,
  }),
  // 流程與代理：帶點機械感的四度堆疊，sawtooth 被濾得很暗，脈動較規律
  orchestration: Object.freeze({
    id: 'orchestration',
    name: '齒輪的節拍',
    root: 116.54,
    scale: Object.freeze([0, 5, 10, 17, 22]),
    bellScale: Object.freeze([0, 5, 7, 12, 17, 19]),
    voicing: Object.freeze(['sawtooth', 'triangle', 'sine']),
    cutoff: 430,
    lfoRate: 0.085,
    bellDensity: 0.58,
    bellEvery: 9,
    detune: 10,
  }),
  // 角色與參數：Mixolydian 的暖色，pad 較厚，鐘聲中等
  config: Object.freeze({
    id: 'config',
    name: '面具的合唱',
    root: 146.83,
    scale: Object.freeze([0, 4, 7, 10, 16]),
    bellScale: Object.freeze([0, 4, 7, 10, 12, 16]),
    voicing: Object.freeze(['triangle', 'triangle', 'sine']),
    cutoff: 700,
    lfoRate: 0.05,
    bellDensity: 0.52,
    bellEvery: 10,
    detune: 5,
  }),
});

export const REGION_MOOD_IDS = Object.freeze(Object.keys(REGION_MOODS));

/** 取得某區的音樂性格（未知區域退回 foundations）。 */
export function moodFor(regionId) {
  return REGION_MOODS[regionId] || REGION_MOODS.foundations;
}

/**
 * 音效表：全部合成，不需音檔。
 * seq 的每一項是 [相對根音的半音, 起始秒, 長度秒, 音量]。
 */
export const SFX = Object.freeze({
  open: { type: 'triangle', base: 523.25, gain: 0.05, seq: [[0, 0, 0.22, 1], [7, 0.05, 0.3, 0.6]] },
  close: { type: 'sine', base: 392.0, gain: 0.04, seq: [[0, 0, 0.2, 1], [-5, 0.05, 0.26, 0.6]] },
  submit: { type: 'sine', base: 659.25, gain: 0.045, seq: [[0, 0, 0.12, 1], [4, 0.07, 0.2, 0.7]] },
  pass: { type: 'triangle', base: 523.25, gain: 0.07, seq: [[0, 0, 0.5, 1], [4, 0.11, 0.6, 0.9], [7, 0.22, 0.9, 0.8]] },
  fail: { type: 'sine', base: 329.63, gain: 0.045, seq: [[0, 0, 0.32, 1], [-2, 0.13, 0.45, 0.7]] },
  unlock: {
    type: 'triangle',
    base: 392.0,
    gain: 0.075,
    seq: [[0, 0, 0.7, 0.8], [7, 0.12, 0.8, 0.9], [12, 0.26, 1.0, 1], [19, 0.42, 1.4, 0.7]],
  },
  codex: { type: 'sine', base: 587.33, gain: 0.042, seq: [[0, 0, 0.18, 1], [12, 0.06, 0.3, 0.45]] },
  step: { type: 'sine', base: 150.0, gain: 0.018, seq: [[0, 0, 0.07, 1]] },
  toast: { type: 'sine', base: 880.0, gain: 0.028, seq: [[0, 0, 0.14, 1]] },
  // Phase 9：即時預檢「又亮一盞燈」的輕響 —— 要很短、很小聲，連按十次也不煩
  spark: { type: 'sine', base: 1046.5, gain: 0.022, seq: [[0, 0, 0.09, 1], [7, 0.04, 0.14, 0.45]] },
  // Phase 11 石碑刻印：一段字刻上石碑 —— 低頻的一記悶響 ＋ 上面一聲石屑的脆音
  stamp: {
    type: 'triangle',
    base: 92.5,
    gain: 0.075,
    seq: [[0, 0, 0.16, 1], [12, 0.01, 0.1, 0.5], [36, 0.02, 0.06, 0.28]],
  },
  // 石碑不收這一片：更悶、更短、往下走 —— 是「不對喔」，不是懲罰
  reject: { type: 'sine', base: 78.0, gain: 0.055, seq: [[0, 0, 0.2, 1], [-3, 0.06, 0.24, 0.5]] },
  /* --- Phase 22：走過去它會回應你（全部很輕、很短，走一整圈也不吵） --- */
  // 風鈴：兩顆金屬泛音，尾巴長一點
  chimeSoft: { type: 'sine', base: 1174.66, gain: 0.02, seq: [[0, 0, 0.9, 1], [7, 0.06, 1.1, 0.4], [16, 0.12, 0.7, 0.2]] },
  // 音石：一顆乾淨的音（baseScale 決定音高 → 一排石頭就是一段旋律）
  songnote: { type: 'triangle', base: 392.0, gain: 0.03, seq: [[0, 0, 0.55, 1], [12, 0.02, 0.35, 0.28]] },
  // 水紋：很低的一聲「咚」，沒有泛音
  ripple: { type: 'sine', base: 196.0, gain: 0.026, seq: [[0, 0, 0.42, 1], [-5, 0.08, 0.5, 0.4]] },
  // 小獸竄開：兩個很短的上行音
  scurry: { type: 'triangle', base: 880.0, gain: 0.016, seq: [[0, 0, 0.06, 1], [5, 0.04, 0.07, 0.7], [9, 0.08, 0.06, 0.4]] },
  // 螢火散開：氣音一樣的高音，幾乎聽不見
  flutter: { type: 'sine', base: 1567.98, gain: 0.012, seq: [[0, 0, 0.14, 1], [4, 0.05, 0.2, 0.35]] },
  // 光菇亮起：一組向上的柔和三音
  bloom: { type: 'sine', base: 523.25, gain: 0.018, seq: [[0, 0, 0.5, 0.8], [4, 0.08, 0.55, 0.7], [7, 0.16, 0.7, 0.5]] },
  // 找到一個藏起來的地方
  secret: {
    type: 'triangle',
    base: 349.23,
    gain: 0.062,
    seq: [[0, 0, 0.6, 0.85], [5, 0.11, 0.7, 0.85], [12, 0.24, 0.95, 0.7], [17, 0.4, 1.3, 0.45]],
  },
  // 回聲的小祠：只有這裡聽得到的一串音（獨一無二，聽過就記得）
  blessing: {
    type: 'sine',
    base: 261.63,
    gain: 0.07,
    seq: [
      [0, 0, 1.0, 0.7],
      [7, 0.18, 1.1, 0.75],
      [12, 0.36, 1.2, 0.8],
      [16, 0.54, 1.3, 0.7],
      [19, 0.72, 1.6, 0.55],
      [24, 0.95, 2.0, 0.35],
    ],
  },
  /* --- Phase 25：動得了的器物（每一種一個聲音，聽聲音就知道剛剛碰到什麼） --- */
  // 陶罐掀蓋：陶器互相摩擦的一記鈍音
  lid: { type: 'triangle', base: 233.08, gain: 0.042, seq: [[0, 0, 0.14, 1], [5, 0.03, 0.1, 0.5], [24, 0.05, 0.05, 0.22]] },
  // 已經開過的罐子再看一眼：更輕、更短
  openSoft: { type: 'sine', base: 349.23, gain: 0.026, seq: [[0, 0, 0.12, 1], [7, 0.04, 0.16, 0.4]] },
  // 點火：一聲很低的「轟」加上一層氣音般的高頻
  ignite: {
    type: 'triangle',
    base: 87.31,
    gain: 0.07,
    seq: [[0, 0, 0.42, 1], [12, 0.03, 0.3, 0.5], [31, 0.06, 0.5, 0.22], [36, 0.14, 0.7, 0.12]],
  },
  // 撥火：火星散開的一小把碎音
  ember: { type: 'triangle', base: 523.25, gain: 0.02, seq: [[0, 0, 0.08, 1], [7, 0.05, 0.09, 0.6], [14, 0.1, 0.12, 0.3]] },
  // 響石：尾巴最長的一支 —— 敲一下要響很久（低音基底 ＋ 兩層不整數泛音）
  gong: {
    type: 'sine',
    base: 116.54,
    gain: 0.085,
    seq: [[0, 0, 2.6, 1], [7, 0.01, 2.2, 0.6], [15, 0.02, 1.8, 0.4], [22, 0.05, 1.4, 0.22], [27, 0.09, 1.1, 0.12]],
  },
  // 守望石睜眼：兩個很純的長音（石頭醒過來，不是機械聲）
  touchstone: { type: 'sine', base: 293.66, gain: 0.045, seq: [[0, 0, 0.9, 0.9], [12, 0.14, 1.1, 0.55], [19, 0.3, 1.3, 0.3]] },
  // 撈月：水面被舀起來的一聲，很短、很濕
  scoop: { type: 'sine', base: 440.0, gain: 0.03, seq: [[0, 0, 0.16, 1], [12, 0.03, 0.22, 0.5], [-12, 0.08, 0.3, 0.35]] },
  // 讀木牌：木頭被敲了一下
  plank: { type: 'triangle', base: 174.61, gain: 0.038, seq: [[0, 0, 0.1, 1], [19, 0.02, 0.07, 0.4]] },
  // 絞盤咬進一格：金屬棘輪
  ratchet: { type: 'triangle', base: 130.81, gain: 0.055, seq: [[0, 0, 0.09, 1], [7, 0.015, 0.07, 0.6], [24, 0.03, 0.05, 0.35]] },
  // 石蓋滑開：低頻的摩擦 ＋ 底下透上來的那一聲
  unseal: {
    type: 'sine',
    base: 98.0,
    gain: 0.07,
    seq: [[0, 0, 0.7, 0.9], [5, 0.16, 0.8, 0.7], [12, 0.34, 1.0, 0.55], [19, 0.52, 1.3, 0.3]],
  },
  // 坐下 / 起身：布料與石頭，幾乎聽不見
  sit: { type: 'sine', base: 146.83, gain: 0.026, seq: [[0, 0, 0.3, 1], [-5, 0.08, 0.36, 0.45]] },
  stand: { type: 'sine', base: 174.61, gain: 0.024, seq: [[0, 0, 0.22, 1], [7, 0.06, 0.26, 0.4]] },
  // 刻滿了、石碑亮起來：手掌印出現的那一聲
  seal: {
    type: 'triangle',
    base: 261.63,
    gain: 0.06,
    seq: [[0, 0, 0.5, 0.8], [7, 0.1, 0.6, 0.8], [12, 0.2, 0.9, 0.6]],
  },
});

/** 過關音效依評價加碼（S 多兩個泛音、C 只有基本三音）。 */
const GRADE_EXTRA = { S: [[12, 0.34, 1.3, 0.85], [19, 0.46, 1.6, 0.5]], A: [[12, 0.34, 1.1, 0.6]], B: [], C: [] };

/** 產生一段衰減噪音當作 impulse response —— 免費的空間感。 */
function makeImpulse(ctx, seconds = 2.6, decay = 2.4) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/**
 * @param {object} opts
 * @param {number} [opts.volume]  0–1
 * @param {boolean} [opts.muted]
 * @param {string} [opts.region]  起始區域
 */
export function createAudio({ volume = 0.5, muted = false, region = 'foundations' } = {}) {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let started = false;
  let bellTimer = 0;
  let currentVolume = Math.max(0, Math.min(1, volume));
  let isMuted = Boolean(muted);
  let currentRegion = REGION_MOODS[region] ? region : 'foundations';
  const layers = new Map(); // regionId → { gain, oscs }
  let lastStepAt = 0;

  const MASTER_SCALE = 0.34;
  const targetMaster = () => (isMuted ? 0 : currentVolume * MASTER_SCALE);

  /** 建一組區域 layer（pad 三聲部 ＋ 低音 ＋ 濾波 LFO）。 */
  function buildLayer(mood) {
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mood.cutoff;
    filter.Q.value = 0.85;
    filter.connect(gain);
    gain.connect(musicBus);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = mood.lfoRate;
    lfoGain.gain.value = mood.cutoff * 0.42;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const nodes = [lfo];

    mood.scale.forEach((step, i) => {
      const osc = ctx.createOscillator();
      osc.type = mood.voicing[i % mood.voicing.length];
      osc.frequency.value = mood.root * semitone(step);
      osc.detune.value = (i - (mood.scale.length - 1) / 2) * mood.detune;

      const voice = ctx.createGain();
      // 高音聲部音量壓低，聽起來才不會刺
      voice.gain.value = 0.062 / (1 + i * 0.35);
      osc.connect(voice);
      voice.connect(filter);
      osc.start();

      // 每個聲部用不同速率的緩慢起伏 → 不會變成單調的嗡嗡聲
      const swell = ctx.createOscillator();
      const swellGain = ctx.createGain();
      swell.frequency.value = 0.018 + i * 0.0115;
      swellGain.gain.value = voice.gain.value * 0.8;
      swell.connect(swellGain);
      swellGain.connect(voice.gain);
      swell.start();

      nodes.push(osc, swell);
    });

    return { gain, nodes, mood };
  }

  function buildGraph() {
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return false;
    ctx = new AudioCtx();

    master = ctx.createGain();
    master.gain.value = targetMaster();
    /*
     * Phase 22：master 之後掛一顆 compressor 再進喇叭。
     * 走過一排音石時可能一秒內連響好幾聲，沒有它就會削波。
     * （Web Audio 的通用作法：最後一級放 DynamicsCompressorNode。）
     */
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch {
      master.connect(ctx.destination);
    }

    // 音樂：一半乾聲、一半進 reverb
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    const dry = ctx.createGain();
    dry.gain.value = 0.72;
    musicBus.connect(dry);
    dry.connect(master);

    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      musicBus.connect(conv);
      conv.connect(wet);
      wet.connect(master);
    } catch {
      /* 沒有 convolver 也不影響核心體驗 */
    }

    // 音效走另一條路（不加太多 reverb，回饋才夠即時）
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);

    for (const id of REGION_MOOD_IDS) layers.set(id, buildLayer(REGION_MOODS[id]));
    const here = layers.get(currentRegion);
    if (here) here.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    return true;
  }

  /** 依當區音階敲一顆鐘。 */
  function scheduleBell() {
    if (!ctx || isMuted) return;
    const mood = moodFor(currentRegion);
    const now = ctx.currentTime;
    const step = mood.bellScale[Math.floor(Math.random() * mood.bellScale.length)];
    const freq = mood.root * 4 * semitone(step);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(now);
    osc.stop(now + 6);

    // 疊一個五度的泛音，鐘聲比較有厚度
    const over = ctx.createOscillator();
    over.type = 'sine';
    over.frequency.value = freq * 1.5;
    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(0.0001, now);
    overGain.gain.linearRampToValueAtTime(0.016, now + 0.28);
    overGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    over.connect(overGain);
    overGain.connect(musicBus);
    over.start(now);
    over.stop(now + 3.6);
  }

  /** 鐘聲排程：每區密度不同，用 setTimeout 鏈而不是固定 interval。 */
  function armBell() {
    if (bellTimer) window.clearTimeout(bellTimer);
    const mood = moodFor(currentRegion);
    const wait = (mood.bellEvery * 0.7 + Math.random() * mood.bellEvery * 0.6) * 1000;
    bellTimer = window.setTimeout(() => {
      if (Math.random() < mood.bellDensity) scheduleBell();
      armBell();
    }, wait);
  }

  /** 播一組合成音（SFX 表的一列）。 */
  function playSeq(spec, { gainScale = 1, extra = [], baseScale = 1 } = {}) {
    if (!ctx || isMuted || !sfxBus) return;
    const now = ctx.currentTime;
    const rows = extra.length ? spec.seq.concat(extra) : spec.seq;
    for (const [step, at, len, vol] of rows) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = spec.base * baseScale * semitone(step);
      const g = ctx.createGain();
      const t0 = now + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(spec.gain * vol * gainScale, t0 + Math.min(0.04, len * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      osc.connect(g);
      g.connect(sfxBus);
      osc.start(t0);
      osc.stop(t0 + len + 0.05);
    }
  }

  const api = {
    /** 目前的區域 id（音樂用）。 */
    get region() {
      return currentRegion;
    },
    get isStarted() {
      return started;
    },
    /** 目前區域的音樂性格（給 UI 顯示 / 測試用）。 */
    get mood() {
      return moodFor(currentRegion);
    },

    /** 必須由使用者手勢呼叫（點擊 / 按鍵）。 */
    start() {
      if (started) {
        ctx?.resume?.();
        return;
      }
      try {
        if (!buildGraph()) return;
        started = true;
        armBell();
      } catch (err) {
        console.warn('[Promptasy] 環境音無法啟動：', err);
      }
    },

    /**
     * 跨區時交叉淡入淡出到另一段配樂。
     * @param {string} regionId
     * @param {number} [seconds] 淡出淡入的時間常數
     */
    setRegion(regionId, seconds = 2.2) {
      if (!regionId || !REGION_MOODS[regionId] || regionId === currentRegion) return false;
      currentRegion = regionId;
      if (ctx && layers.size) {
        const tau = Math.max(0.2, seconds) / 3; // setTargetAtTime 的時間常數
        for (const [id, layer] of layers) {
          layer.gain.gain.setTargetAtTime(id === regionId ? 1 : 0, ctx.currentTime, tau);
        }
        armBell();
      }
      return true;
    },

    setVolume(v) {
      currentVolume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master && ctx) master.gain.setTargetAtTime(targetMaster(), ctx.currentTime, 0.15);
      return currentVolume;
    },
    getVolume() {
      return currentVolume;
    },
    setMuted(m) {
      isMuted = Boolean(m);
      if (master && ctx) master.gain.setTargetAtTime(targetMaster(), ctx.currentTime, 0.15);
      return isMuted;
    },
    get muted() {
      return isMuted;
    },

    /**
     * 音效。`cue('pass', { grade: 'S' })` 會依評價加碼。
     * @param {keyof SFX} kind
     */
    cue(kind = 'pass', opts = {}) {
      const spec = SFX[kind];
      if (!spec) return false;
      if (kind === 'pass') {
        const extra = GRADE_EXTRA[opts.grade] || [];
        playSeq(spec, { extra, gainScale: opts.grade === 'S' ? 1.15 : 1 });
        return true;
      }
      playSeq(spec, { gainScale: opts.gain ?? 1, baseScale: opts.baseScale ?? 1 });
      return true;
    },

    /** 走路的軟腳步聲（節流，避免一秒踩十下）。 */
    step(now = 0) {
      if (!ctx || isMuted) return false;
      if (now - lastStepAt < 0.26) return false;
      lastStepAt = now;
      playSeq(SFX.step, { baseScale: 0.94 + Math.random() * 0.12 });
      return true;
    },

    dispose() {
      if (bellTimer) window.clearTimeout(bellTimer);
      bellTimer = 0;
      layers.clear();
      started = false;
      ctx?.close?.();
      ctx = null;
    },
  };

  return api;
}

export default createAudio;

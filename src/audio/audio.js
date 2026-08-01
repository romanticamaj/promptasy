/**
 * Promptasy — 音訊：分區配樂（真的音檔）＋ 音效（音檔 ＋ 合成備援）
 *
 * Phase 30 起，`public/audio/` 放了站長自己做的五首分區配樂與十支音效。
 * 但**合成引擎一條沒拆** —— 它現在是離線 / 載入中 / 檔案缺席時的備援：
 * 把 `public/audio/` 清空，遊戲照樣有聲音、照樣能玩（護欄 3、7）。
 *
 * 結構：
 *   destination ← compressor ← master ← musicDuck ← [ 音檔配樂 bus
 *                                                    ＋ 合成 pad（dry ＋ convolver reverb） ]
 *                              master ← sfxBus ← [ 音檔音效 ＋ 合成音效 ]
 *
 *   - master：音量滑桿與靜音**同時管住兩條路**（音檔與合成共用同一顆 gain）。
 *   - musicDuck：過關的頌缽響 9 秒，期間把配樂壓 3 dB，缽聲才浮得出來。
 *   - compressor：最後一級（Phase 22 就有），一秒內連響好幾聲也不會削波。
 *
 * 配樂的無縫循環：音檔是修過頭尾但**沒有做成完美 loop** 的素材，所以不用
 * `AudioBufferSourceNode.loop`（那會有接縫），改成**兩個 source 交替、等功率交叉淡入**：
 * 每一段在 `duration - 2.5s` 的位置排下一段，前後各做 2.5 秒的 sin/cos 淡入淡出。
 *
 * 載入策略（護欄 5：不能拖慢第一個畫面）：
 *   - 一律等到 `start()`（＝標題卡按下去的那個使用者手勢）才開始 fetch。
 *   - 音效（共約 0.4 MB）先載、當區配樂次之，鄰區配樂最後排隊（只抓壓縮檔）。
 *   - 解碼很吃記憶體（3 分鐘立體聲 ≈ 69 MB），所以**解碼只在要播的時候做**，
 *     並且最多同時留兩首（正在播的 ＋ 正在淡出的），其餘只留壓縮位元組。
 *   - 檔案還沒到 / fetch 失敗 / 解碼失敗 → 該區直接用合成 pad，不會有空白。
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
  // 開場標題卡：還沒進入世界之前的夜 —— 音檔沒到之前用最安靜的墊音頂著
  title: Object.freeze({
    id: 'title',
    name: '開場的夜',
    root: 92.5,
    scale: Object.freeze([0, 7, 12, 19]),
    bellScale: Object.freeze([0, 7, 12]),
    voicing: Object.freeze(['sine', 'sine', 'triangle']),
    cutoff: 520,
    lfoRate: 0.035,
    bellDensity: 0.2,
    bellEvery: 17,
    detune: 5,
  }),
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
  /*
   * 量器坊（課程 v2 · Phase E）：熄了火的鑄場。
   * 大二度堆疊的空心和聲 ＋ 最低的鐘聲密度 —— 像一個量完了、沒有人再說話的地方。
   * **這一區沒有配樂音檔**（見 SYNTH_ONLY_REGIONS），聽到的就是這段合成 pad。
   */
  forms: Object.freeze({
    id: 'forms',
    name: '量器的餘響',
    root: 103.83,
    scale: Object.freeze([0, 2, 9, 14, 21]),
    bellScale: Object.freeze([0, 2, 7, 9, 14, 16]),
    voicing: Object.freeze(['triangle', 'sine', 'sine']),
    cutoff: 560,
    lfoRate: 0.028,
    bellDensity: 0.3,
    bellEvery: 16,
    detune: 3,
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
  /* --- Phase 30：有音檔的那幾支，這裡放的是「檔案不在時」的備援合成版 --- */
  // 刻印牌被按下去的那一下（很短、很小聲，連按也不吵）
  click: { type: 'sine', base: 1318.51, gain: 0.016, seq: [[0, 0, 0.045, 1]] },
  // 祭壇 / 刻文：一串很輕的泛音（比 blessing 短很多）
  shrine: {
    type: 'sine',
    base: 349.23,
    gain: 0.05,
    seq: [[0, 0, 0.8, 0.7], [7, 0.14, 0.9, 0.7], [12, 0.3, 1.1, 0.5], [19, 0.48, 1.3, 0.3]],
  },
  // 石門滑開（先行前往：只有門，沒有慶祝的閃光）
  gateOpen: {
    type: 'sine',
    base: 87.31,
    gain: 0.08,
    seq: [[0, 0, 0.9, 1], [5, 0.18, 1.0, 0.6], [12, 0.4, 1.2, 0.35]],
  },
  // 全數收集：最長、最厚的一支
  finale: {
    type: 'triangle',
    base: 261.63,
    gain: 0.08,
    seq: [
      [0, 0, 1.2, 0.8],
      [4, 0.16, 1.3, 0.8],
      [7, 0.32, 1.5, 0.85],
      [12, 0.5, 1.8, 0.8],
      [16, 0.72, 2.0, 0.6],
      [19, 0.96, 2.4, 0.5],
      [24, 1.24, 2.8, 0.35],
    ],
  },
});

/** 音檔目錄（相對於網站根目錄；`base: './'` 的部署也算得出來）。 */
export const AUDIO_DIR = 'audio/';

/**
 * 五區配樂（站長以 Suno 創作，見 `public/LICENSE.md`）。
 * `mood` 指到合成備援的性格 —— 檔案沒到的時候放的就是它。
 */
export const BGM_TRACKS = Object.freeze({
  title: Object.freeze({ region: 'title', file: 'bgm_title.m4a', title: 'Promptasy Overture' }),
  foundations: Object.freeze({ region: 'foundations', file: 'bgm_foundations.m4a', title: 'Night Plateau Pad' }),
  reasoning: Object.freeze({ region: 'reasoning', file: 'bgm_reasoning.m4a', title: 'Thinking Corridor Float' }),
  grounding: Object.freeze({ region: 'grounding', file: 'bgm_grounding.m4a', title: 'Sunken Archive Bowed' }),
  orchestration: Object.freeze({
    region: 'orchestration',
    file: 'bgm_orchestration.m4a',
    title: 'Gear Workshop Pulse',
  }),
  config: Object.freeze({ region: 'config', file: 'bgm_config.m4a', title: 'Mask Theatre Veil' }),
});

/**
 * 目前**還沒有配樂音檔**的區域（課程 v2 · Phase E 起）。
 *
 * 護欄 3 早就規定「合成引擎是備援，不是遺跡」——把 `public/audio/` 清空，
 * 遊戲照樣有聲音。量器坊就是第一個真的走這條路的區域：它有自己的
 * `REGION_MOODS.forms`（根音、音階、鐘聲密度都跟其他五區不同），
 * 沒有 `BGM_TRACKS` 條目，所以 `requestBgm()` 直接回 false，合成 pad 接手。
 *
 * **刻意不共用別區的音檔**：拿面具劇場那一首來墊，跨橋時聽起來像沒換地方，
 * 那比誠實地播一段自己的合成 pad 更糟。站長之後補上 `bgm_forms.m4a` 時，
 * 只要在 `BGM_TRACKS` 加一行、把 id 從這裡移走即可（其餘程式碼一個字都不必動）。
 */
export const SYNTH_ONLY_REGIONS = Object.freeze(['forms']);

/**
 * 鄰區：走過一座橋就到得了的地方（中央高原是樞紐，四片土地各自接一條橋）。
 * 只用來決定「先偷偷抓哪一首」的順序，抓的是壓縮檔、不解碼。
 */
export const REGION_NEIGHBORS = Object.freeze({
  // 標題卡上先偷偷抓中央高原的配樂 —— 按下開始鍵之後的第一次交叉淡接才不會等
  title: Object.freeze(['foundations']),
  foundations: Object.freeze(['reasoning', 'grounding', 'orchestration', 'config']),
  reasoning: Object.freeze(['foundations', 'grounding']),
  grounding: Object.freeze(['foundations', 'orchestration']),
  orchestration: Object.freeze(['foundations', 'config']),
  config: Object.freeze(['foundations', 'orchestration']),
  // 量器坊只有一條橋接回中央高原；它自己沒有音檔，所以只預抓回程那一首
  forms: Object.freeze(['foundations']),
});

/**
 * 音效檔對照表：key 是既有的 cue 名稱 —— 有檔案就用檔案，沒有（或還沒載到）就用上面的合成版。
 * `gain` 是相對音量（音檔本身峰值 −6 dBFS，這裡再壓到與 −20 LUFS 的配樂床平衡）。
 * `layer` 是疊在同一次 cue 上的第二個檔案（解鎖＝微光 ＋ 稍慢一點的石門）。
 * `duck` 是這一聲期間把配樂壓低幾秒（讓 9 秒的頌缽有地方響）。
 */
export const SFX_FILES = Object.freeze({
  // 過關：9 秒頌缽 —— 讓它響完，期間配樂壓 3 dB
  pass: Object.freeze({ file: 'sfx_pass.m4a', gain: 0.95, duck: 5.5 }),
  // 呈給神諭（手掌按下去）：一陣風
  submit: Object.freeze({ file: 'sfx_submit.m4a', gain: 0.8 }),
  // 石碑收下一段（選對了）：確認的漲聲
  stamp: Object.freeze({ file: 'sfx_select.m4a', gain: 0.5 }),
  // 面板打開：翻頁（整座檔案館的味道）
  open: Object.freeze({ file: 'sfx_page.m4a', gain: 0.5 }),
  codex: Object.freeze({ file: 'sfx_page.m4a', gain: 0.6 }),
  // 真的解鎖：微光 ＋ 石門（門稍微慢一點進來）
  unlock: Object.freeze({
    file: 'sfx_unlock_shimmer.m4a',
    gain: 0.85,
    layer: Object.freeze({ file: 'sfx_unlock_door.m4a', gain: 0.72, delay: 0.28 }),
  }),
  // 先行前往：只有石門，沒有慶祝的微光（比較重、比較沉）
  gateOpen: Object.freeze({ file: 'sfx_unlock_door.m4a', gain: 0.9 }),
  // 刻印牌被按下去
  click: Object.freeze({ file: 'sfx_click.m4a', gain: 0.5, throttle: 0.07 }),
  // 絞盤咬進一格 / 齒輪工坊的器物
  ratchet: Object.freeze({ file: 'sfx_gear.m4a', gain: 0.6 }),
  // 起始祭壇的門檻 ＋ 刻文小語
  shrine: Object.freeze({ file: 'sfx_shrine.m4a', gain: 0.7 }),
  // 隱藏成就：68 條全收集
  finale: Object.freeze({ file: 'sfx_finale.m4a', gain: 0.9, duck: 4.5 }),
});

/** 全部會被載入的檔名（測試用：驗證 `public/audio/` 真的有這些檔）。 */
export const AUDIO_MANIFEST = Object.freeze({
  bgm: Object.freeze(Object.values(BGM_TRACKS).map((t) => t.file)),
  sfx: Object.freeze(
    Array.from(
      new Set(
        Object.values(SFX_FILES).flatMap((s) => (s.layer ? [s.file, s.layer.file] : [s.file]))
      )
    )
  ),
});

/** 音效檔的集合（抓到就直接解碼常駐 —— 它們很小，但要按下去就有聲音）。 */
const SFX_FILE_SET = new Set(AUDIO_MANIFEST.sfx);

/** 把檔名接成可以 fetch 的網址（子路徑部署也算得對）。 */
export function audioUrl(file) {
  // Vite 在建置時把 BASE_URL 固定成 base（例如 '/promptasy/' 或 './'）——
  // 用它當基準，網址有沒有結尾斜線（/promptasy vs /promptasy/）都解析得對。
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
  const rel = base.endsWith('/') ? base + AUDIO_DIR : `${base}/${AUDIO_DIR}`;
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      return new URL(rel + file, document.baseURI).href;
    } catch {
      /* 退回相對路徑 */
    }
  }
  return rel + file;
}

/** 過關音效依評價加碼（S 多兩個泛音、C 只有基本三音）—— 合成版。 */
const GRADE_EXTRA = { S: [[12, 0.34, 1.3, 0.85], [19, 0.46, 1.6, 0.5]], A: [[12, 0.34, 1.1, 0.6]], B: [], C: [] };

/** 過關頌缽的音量（音檔版）：S 敲得最實，C 收一點 —— 只是力度差別，不是懲罰。 */
export const PASS_GRADE_GAIN = Object.freeze({ S: 1, A: 0.92, B: 0.84, C: 0.78 });

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

/** 配樂自我交叉淡入的重疊長度（秒）—— 尾巴疊回頭，接縫聽不出來。 */
export const LOOP_CROSSFADE = 2.5;
/** 跨區交叉淡入淡出的長度（秒）。 */
export const REGION_CROSSFADE = 3.0;
/** 同時解碼的配樂上限（3 分鐘立體聲 ≈ 69 MB，只留「正在播 ＋ 正在淡出」兩首）。 */
export const MAX_DECODED_TRACKS = 2;

/**
 * 用一串 linear ramp 疊出等功率（sin / cos）曲線。
 *
 * 不用 `setValueCurveAtTime` 是因為它禁止與其他自動化重疊 ——
 * 跨區時很容易「淡出還沒跑完就又要淡入」，那會直接丟例外。
 *
 * @param {AudioParam} param
 * @param {number} t0    開始時間（AudioContext 時間）
 * @param {number} dur   長度（秒）
 * @param {number} from  起點音量
 * @param {number} to    終點音量
 */
function equalPowerRamp(param, t0, dur, from, to) {
  const STEPS = 24;
  const lo = Math.max(0.0001, Math.min(from, to));
  param.setValueAtTime(Math.max(0.0001, from), t0);
  for (let i = 1; i <= STEPS; i += 1) {
    const x = i / STEPS;
    // 淡入用 sin、淡出用 cos —— 兩段相加的功率是常數，中間不會凹一個洞
    const shape = to >= from ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
    const v = to >= from ? from + (to - from) * shape : to + (from - to) * shape;
    param.linearRampToValueAtTime(Math.max(lo, v), t0 + dur * x);
  }
  param.setValueAtTime(Math.max(0.0001, to), t0 + dur);
}

/** 把一顆 gain 的自動化清乾淨並停在目前的值（跨區時反覆改目標也不會打架）。 */
function holdParam(param, now) {
  const value = param.value;
  try {
    param.cancelScheduledValues(now);
  } catch {
    /* 舊瀏覽器 */
  }
  try {
    param.setValueAtTime(value, now);
  } catch {
    /* 忽略 */
  }
  return value;
}

/**
 * @param {object} opts
 * @param {number} [opts.volume]  0–1
 * @param {boolean} [opts.muted]
 * @param {string} [opts.region]  起始區域
 * @param {boolean} [opts.files]  是否使用 `public/audio/` 的音檔（false = 只用合成備援）
 */
export function createAudio({ volume = 0.5, muted = false, region = 'foundations', files = true } = {}) {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let musicDuck = null;
  let bgmBus = null;
  let sfxBus = null;
  let compressor = null;
  let started = false;
  let bellTimer = 0;
  let currentVolume = Math.max(0, Math.min(1, volume));
  let isMuted = Boolean(muted);
  let currentRegion = REGION_MOODS[region] ? region : 'foundations';
  const layers = new Map(); // regionId → { gain, oscs }
  let lastStepAt = 0;
  let lastClickAt = 0;
  /*
   * 最近放過的幾聲（除錯 / 自動化測試用）。純記帳，不影響播放 ——
   * 「推開入場門有沒有真的響一聲」這種事，從外面看不到 AudioContext 裡面，
   * 只能靠這裡留下的紀錄。環狀保留最後 12 筆就夠了。
   */
  const cueLog = [];

  /* ---------------- 音檔：載入 / 解碼 / 播放 ---------------- */

  /** 是否使用音檔（false → 整組回到 Phase 4 的合成配樂）。 */
  let filesEnabled = files !== false;
  /** file → 'idle' | 'loading' | 'bytes' | 'failed'（壓縮位元組的狀態） */
  const fetchState = new Map();
  /** file → ArrayBuffer（壓縮檔，五首共約 15 MB） */
  const bytes = new Map();
  /** file → AudioBuffer（解碼後；音效常駐，配樂最多兩首） */
  const decoded = new Map();
  /** 解碼後配樂的使用順序（最近用到的排最後） */
  const decodedOrder = [];
  /** file → Promise（避免同一個檔案被抓兩次） */
  const inflightFetch = new Map();
  /** file → Promise（避免同一個檔案被解兩次） */
  const inflightDecode = new Map();
  /** 等著抓的佇列：{ file, priority }（數字小的先） */
  const queue = [];
  let running = 0;
  const MAX_PARALLEL = 2;
  /** 配樂播放器：regionId → { gain, buffer, segments, timer, playing } */
  const players = new Map();
  let duckUntil = 0;
  let duckTimer = 0;

  const MASTER_SCALE = 0.34;
  const targetMaster = () => (isMuted ? 0 : currentVolume * MASTER_SCALE);

  const canFetch = () => typeof fetch === 'function';

  function pump() {
    if (!filesEnabled || !canFetch()) return;
    while (running < MAX_PARALLEL && queue.length) {
      queue.sort((a, b) => a.priority - b.priority);
      const job = queue.shift();
      if (fetchState.get(job.file) === 'bytes' || fetchState.get(job.file) === 'loading') continue;
      running += 1;
      fetchBytes(job.file)
        .then((buf) => {
          // 音效很小（十支共約 0.4 MB）：抓到就直接解碼並常駐，按下去才不會慢一拍
          if (buf && SFX_FILE_SET.has(job.file)) return decode(job.file, true);
          return null;
        })
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  }

  /** 抓一個檔案的壓縮位元組（不解碼）。失敗就標記起來，之後一律走合成備援。 */
  function fetchBytes(file) {
    if (bytes.has(file)) return Promise.resolve(bytes.get(file));
    if (inflightFetch.has(file)) return inflightFetch.get(file);
    if (!filesEnabled || !canFetch()) return Promise.resolve(null);
    fetchState.set(file, 'loading');
    const p = fetch(audioUrl(file))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        bytes.set(file, buf);
        fetchState.set(file, 'bytes');
        return buf;
      })
      .catch(() => {
        // 沒有音檔也要能玩 —— 標記失敗、回到合成備援，不丟例外、不寫 console.error
        fetchState.set(file, 'failed');
        return null;
      })
      .finally(() => inflightFetch.delete(file));
    inflightFetch.set(file, p);
    return p;
  }

  /** 排隊抓一個檔案（priority 小的先）。 */
  function want(file, priority = 5) {
    if (!filesEnabled || !file) return;
    const st = fetchState.get(file);
    if (st === 'bytes' || st === 'loading' || st === 'failed') return;
    fetchState.set(file, 'idle');
    queue.push({ file, priority });
    pump();
  }

  /** 解碼並快取（音效 permanent = true；配樂會被 LRU 淘汰）。 */
  function decode(file, permanent = false) {
    if (decoded.has(file)) {
      if (!permanent) touchDecoded(file);
      return Promise.resolve(decoded.get(file));
    }
    if (inflightDecode.has(file)) return inflightDecode.get(file);
    const p = fetchBytes(file)
      .then((buf) => {
        if (!buf || !ctx) return null;
        // decodeAudioData 會把傳進去的 ArrayBuffer 抽走 → 一定要給副本
        return ctx.decodeAudioData(buf.slice(0));
      })
      .then((audioBuffer) => {
        if (!audioBuffer) return null;
        decoded.set(file, audioBuffer);
        if (!permanent) {
          decodedOrder.push(file);
          evictDecoded();
        }
        return audioBuffer;
      })
      .catch(() => {
        // 解不開（瀏覽器不支援這個編碼）→ 當成沒有這個檔案
        fetchState.set(file, 'failed');
        return null;
      })
      .finally(() => inflightDecode.delete(file));
    inflightDecode.set(file, p);
    return p;
  }

  function touchDecoded(file) {
    const i = decodedOrder.indexOf(file);
    if (i >= 0) decodedOrder.splice(i, 1);
    decodedOrder.push(file);
  }

  /** 只留最近用到的兩首配樂，其餘釋放（壓縮位元組留著，要用再解一次）。 */
  function evictDecoded() {
    while (decodedOrder.length > MAX_DECODED_TRACKS) {
      const victim = decodedOrder.find((f) => !isPlayingFile(f));
      if (!victim) return;
      decodedOrder.splice(decodedOrder.indexOf(victim), 1);
      decoded.delete(victim);
      for (const p of players.values()) if (p.file === victim && !p.playing) p.buffer = null;
    }
  }

  function isPlayingFile(file) {
    for (const p of players.values()) if (p.playing && p.file === file) return true;
    return false;
  }

  function playerFor(regionId) {
    let p = players.get(regionId);
    if (p) return p;
    const track = BGM_TRACKS[regionId];
    if (!track || !ctx || !bgmBus) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bgmBus);
    p = { region: regionId, file: track.file, gain, buffer: null, segments: [], timer: 0, playing: false };
    players.set(regionId, p);
    return p;
  }

  /**
   * 排一段配樂。每一段都是完整的一遍，前後各 2.5 秒等功率淡入淡出；
   * 下一段排在 `duration - 2.5s`，兩段重疊的那 2.5 秒就是無縫接點。
   */
  function startSegment(p, when) {
    if (!ctx || !p.buffer) return;
    const duration = p.buffer.duration;
    const xf = Math.max(0.4, Math.min(LOOP_CROSSFADE, duration * 0.25));
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(p.gain);
    equalPowerRamp(g.gain, when, xf, 0.0001, 1);
    equalPowerRamp(g.gain, when + duration - xf, xf, 1, 0.0001);
    try {
      src.start(when);
      src.stop(when + duration + 0.05);
    } catch {
      return;
    }
    const seg = { src, g };
    p.segments.push(seg);
    src.onended = () => {
      const i = p.segments.indexOf(seg);
      if (i >= 0) p.segments.splice(i, 1);
      try {
        g.disconnect();
      } catch {
        /* 已經斷開 */
      }
    };
    // 提前 1 秒排下一段（timer 不準也沒關係 —— 真正的時間點是用 AudioContext 的時鐘算的）
    const nextAt = when + duration - xf;
    p.nextAt = nextAt;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      p.timer = 0;
      if (p.playing) startSegment(p, Math.max(ctx.currentTime + 0.05, nextAt));
    }, Math.max(50, (nextAt - ctx.currentTime - 1) * 1000));
  }

  /** 開始播某一區的配樂（buffer 必須已經解好）。 */
  function startBgm(regionId, seconds = REGION_CROSSFADE) {
    if (!filesEnabled) return false;
    const p = playerFor(regionId);
    if (!p || !p.buffer || !ctx) return false;
    const now = ctx.currentTime;
    const from = holdParam(p.gain.gain, now);
    equalPowerRamp(p.gain.gain, now, Math.max(0.2, seconds), from, 1);
    if (!p.playing) {
      p.playing = true;
      startSegment(p, now + 0.02);
    }
    touchDecoded(p.file);
    return true;
  }

  /** 淡出並停掉某一區的配樂。 */
  function stopBgm(regionId, seconds = REGION_CROSSFADE) {
    const p = players.get(regionId);
    if (!p || !p.playing || !ctx) return;
    const now = ctx.currentTime;
    const fade = Math.max(0.2, seconds);
    const from = holdParam(p.gain.gain, now);
    equalPowerRamp(p.gain.gain, now, fade, from, 0.0001);
    if (p.timer) clearTimeout(p.timer);
    p.timer = 0;
    p.playing = false;
    const segments = p.segments.slice();
    setTimeout(() => {
      for (const s of segments) {
        try {
          s.src.stop();
        } catch {
          /* 已經停了 */
        }
      }
      p.segments = p.segments.filter((s) => !segments.includes(s));
      evictDecoded();
    }, fade * 1000 + 120);
  }

  /** 這一區現在聽到的是音檔還是合成？ */
  function sourceFor(regionId) {
    const p = players.get(regionId);
    return p && p.playing ? 'file' : 'synth';
  }

  /**
   * 把「現在該聽到什麼」套用到音檔與合成兩條路：
   * 當區有音檔在播 → 合成 pad 收掉；音檔還沒到 → 合成 pad 頂著（不會有空白）。
   */
  function applyMix(seconds = REGION_CROSSFADE) {
    if (!ctx) return;
    const target = currentRegion;
    for (const id of REGION_MOOD_IDS) if (id !== target) stopBgm(id, seconds);
    const usingFile = sourceFor(target) === 'file';
    for (const [id, layer] of layers) {
      const now = ctx.currentTime;
      const on = id === target && !usingFile ? 1 : 0;
      layer.gain.gain.setTargetAtTime(on, now, Math.max(0.2, seconds) / 3);
    }
  }

  /** 要某一區的配樂：抓 → 解碼 → 播（已經在播就只是重新淡入）。 */
  function requestBgm(regionId, seconds = REGION_CROSSFADE) {
    if (!filesEnabled || !ctx || !BGM_TRACKS[regionId]) return Promise.resolve(false);
    const track = BGM_TRACKS[regionId];
    want(track.file, 0);
    return fetchBytes(track.file)
      .then((raw) => {
        // 抓到的時候玩家可能已經走到別區了 —— 那就不要解碼（解碼很吃記憶體）
        if (!raw || currentRegion !== regionId) return null;
        return decode(track.file);
      })
      .then((buffer) => {
        // 解碼是非同步的：這期間玩家可能已經把音檔關掉了（護欄 3 的退路）
        if (!buffer || !filesEnabled) {
          applyMix(seconds); // 沒抓到 → 確保合成 pad 頂上
          return false;
        }
        const p = playerFor(regionId);
        if (!p) return false;
        p.buffer = buffer;
        // 解碼完成時玩家可能已經走到別區了 —— 那就不要硬播
        if (currentRegion !== regionId) return false;
        startBgm(regionId, seconds);
        applyMix(seconds);
        return true;
      });
  }

  /** 偷偷把鄰區的壓縮檔先抓下來（不解碼，記憶體便宜）。 */
  function prefetchNeighbors() {
    const list = REGION_NEIGHBORS[currentRegion] || [];
    list.forEach((id, i) => {
      const t = BGM_TRACKS[id];
      if (t) want(t.file, 10 + i);
    });
  }

  /** 播一個音檔音效。 */
  function playFile(file, { gain = 1, delay = 0, rate = 1 } = {}) {
    const buffer = decoded.get(file);
    if (!buffer || !ctx || !sfxBus) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, gain);
    src.connect(g);
    g.connect(sfxBus);
    const when = ctx.currentTime + Math.max(0, delay);
    try {
      src.start(when);
    } catch {
      return false;
    }
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* 已經斷開 */
      }
    };
    return true;
  }

  /** 過關的頌缽響很久 —— 期間把配樂壓 3 dB，缽聲才浮得出來。 */
  function duckMusic(seconds = 4) {
    if (!ctx || !musicDuck) return;
    const now = ctx.currentTime;
    duckUntil = Math.max(duckUntil, now + seconds);
    holdParam(musicDuck.gain, now);
    musicDuck.gain.setTargetAtTime(0.7, now, 0.12);
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = setTimeout(() => {
      duckTimer = 0;
      if (!ctx || !musicDuck) return;
      const t = ctx.currentTime;
      holdParam(musicDuck.gain, t);
      musicDuck.gain.setTargetAtTime(1, t, 0.6);
    }, Math.max(200, (duckUntil - now) * 1000));
  }

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
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;
      master.connect(compressor);
      compressor.connect(ctx.destination);
    } catch {
      compressor = null;
      master.connect(ctx.destination);
    }

    // 配樂（音檔與合成都走這裡）→ 過關的頌缽會暫時把它壓 3 dB
    musicDuck = ctx.createGain();
    musicDuck.gain.value = 1;
    musicDuck.connect(master);

    // 音檔配樂：不再進合成用的 convolver（音檔自己已經有空間感了）
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 1;
    bgmBus.connect(musicDuck);

    // 合成配樂：一半乾聲、一半進 reverb
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    const dry = ctx.createGain();
    dry.gain.value = 0.72;
    musicBus.connect(dry);
    dry.connect(musicDuck);

    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      musicBus.connect(conv);
      conv.connect(wet);
      wet.connect(musicDuck);
    } catch {
      /* 沒有 convolver 也不影響核心體驗 */
    }

    // 音效走另一條路（不加太多 reverb、也不被 duck 壓到，回饋才夠即時）
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);

    for (const id of REGION_MOOD_IDS) layers.set(id, buildLayer(REGION_MOODS[id]));
    // 開機這一刻先讓合成 pad 頂著 —— 音檔還在路上，不能有一段空白
    const here = layers.get(currentRegion);
    if (here) here.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    return true;
  }

  /** 使用者手勢之後才開始抓檔案：當區配樂與音效先，鄰區配樂排在後面慢慢抓。 */
  function beginLoading() {
    if (!filesEnabled || !canFetch()) return;
    for (const file of AUDIO_MANIFEST.sfx) want(file, 1);
    requestBgm(currentRegion, 4.5);
    prefetchNeighbors();
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

  /**
   * 鐘聲排程：每區密度不同，用 setTimeout 鏈而不是固定 interval。
   * 音檔配樂在播的時候不敲鐘 —— 那是合成 pad 的裝飾，疊在真的曲子上會打架。
   */
  function armBell() {
    if (bellTimer) clearTimeout(bellTimer);
    const mood = moodFor(currentRegion);
    const wait = (mood.bellEvery * 0.7 + Math.random() * mood.bellEvery * 0.6) * 1000;
    bellTimer = setTimeout(() => {
      if (sourceFor(currentRegion) !== 'file' && Math.random() < mood.bellDensity) scheduleBell();
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

  /**
   * 放一支音檔音效（沒有檔案 / 還沒載到 → 回 false，呼叫端會退回合成版）。
   * @returns {boolean} 有沒有真的用音檔放出去
   */
  function playFileCue(kind, gainScale = 1) {
    if (!filesEnabled || isMuted || !ctx) return false;
    const spec = SFX_FILES[kind];
    if (!spec || !decoded.has(spec.file)) return false;
    const ok = playFile(spec.file, { gain: (spec.gain ?? 1) * gainScale, rate: spec.rate ?? 1 });
    if (!ok) return false;
    // 疊在同一次 cue 上的第二層（解鎖＝微光 ＋ 稍慢一點進來的石門）
    if (spec.layer && decoded.has(spec.layer.file)) {
      playFile(spec.layer.file, {
        gain: (spec.layer.gain ?? 1) * gainScale,
        delay: spec.layer.delay || 0,
      });
    }
    if (spec.duck) duckMusic(spec.duck);
    return true;
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
    /** AudioContext 是否真的在出聲（自動播放政策放行、或已有使用者手勢）。 */
    isRunning() {
      return Boolean(ctx && ctx.state === 'running');
    },

    /**
     * 自動播放探測（Phase 33）：resume 之後等一小段時間，看 AudioContext 有沒有真的
     * 變成 running。用來決定開機要不要先出一道入場門。
     *
     * - true  → 政策放行（返客、或測試環境帶了 --autoplay-policy 旗標）：直接進標題卡。
     * - false → 被凍住：先出入場門，讓玩家那一下手勢去解鎖。
     *
     * 只是「探測」，不會失敗 —— 沒有 AudioContext 也只是回 false。
     * @param {number} [timeoutMs] 最多等多久（開機路徑上，別讓玩家等）
     * @returns {Promise<boolean>}
     */
    whenRunning(timeoutMs = 220) {
      if (!ctx) return Promise.resolve(false);
      if (ctx.state === 'running') return Promise.resolve(true);
      try {
        ctx.resume?.()?.catch?.(() => {});
      } catch {
        /* 被政策擋下就是擋下，不是錯誤 */
      }
      return new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => {
          if (!ctx || ctx.state === 'running') {
            resolve(Boolean(ctx && ctx.state === 'running'));
            return;
          }
          if (Date.now() - t0 >= timeoutMs) {
            resolve(false);
            return;
          }
          setTimeout(tick, 20);
        };
        tick();
      });
    },

    /**
     * 標題卡的開場曲。瀏覽器允許自動播放就直接響起；
     * 不允許的話，掛一次性的手勢監聽（第一下按鍵／點擊 —— 也就是推開入場門那一下）
     * 一有手勢就 resume。進入遊戲後由世界的 setRegion 交叉淡接到當區配樂。
     */
    titleIntro() {
      if (started) return;
      currentRegion = 'title';
      this.start();
      if (!ctx) return;
      const unlock = () => {
        ctx?.resume?.();
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      };
      ctx.resume?.().catch?.(() => {});
      if (ctx.state !== 'running') {
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
      }
    },

    start() {
      if (started) {
        ctx?.resume?.();
        return;
      }
      try {
        if (!buildGraph()) return;
        started = true;
        armBell();
        // 檔案一律等到這個使用者手勢之後才開始抓（護欄 5：不拖慢第一個畫面）
        beginLoading();
      } catch (err) {
        console.warn('[Promptasy] 環境音無法啟動：', err);
      }
    },

    /**
     * 跨區時交叉淡入淡出到另一段配樂。
     * 有音檔就換音檔（等功率交叉淡入約 3 秒）；還沒到就先讓合成 pad 頂著，
     * 等它解好再從合成漂到音檔上。
     * @param {string} regionId
     * @param {number} [seconds] 交叉淡入淡出的長度
     */
    setRegion(regionId, seconds = REGION_CROSSFADE) {
      if (!regionId || !REGION_MOODS[regionId] || regionId === currentRegion) return false;
      currentRegion = regionId;
      if (ctx) {
        applyMix(seconds);
        requestBgm(regionId, seconds);
        prefetchNeighbors();
        armBell();
      }
      return true;
    },

    /**
     * 先把某一區的配樂準備好（測試 / 提前預熱用）。
     * @returns {Promise<boolean>} 有沒有真的拿到音檔
     */
    load(regionId = currentRegion) {
      const track = BGM_TRACKS[regionId];
      if (!track || !ctx || !filesEnabled) return Promise.resolve(false);
      want(track.file, 0);
      return decode(track.file).then((buf) => {
        if (!buf) return false;
        const p = playerFor(regionId);
        if (p) p.buffer = buf;
        if (regionId === currentRegion) {
          startBgm(regionId, REGION_CROSSFADE);
          applyMix(REGION_CROSSFADE);
        }
        return true;
      });
    },

    /**
     * 切換「用音檔」還是「只用合成」。
     * 關掉＝把 `public/audio/` 當成不存在（離線 / 檔案壞掉時的手動退路，也是測試用的開關）。
     */
    useFiles(on = true) {
      const next = Boolean(on);
      if (next === filesEnabled) return filesEnabled;
      filesEnabled = next;
      if (!ctx) return filesEnabled;
      if (!filesEnabled) {
        for (const id of REGION_MOOD_IDS) stopBgm(id, 0.6);
        // 立刻讓合成 pad 接手（stopBgm 是非同步收尾，這裡先把 playing 關掉）
        for (const p of players.values()) p.playing = false;
      } else {
        requestBgm(currentRegion, REGION_CROSSFADE);
      }
      applyMix(1.2);
      return filesEnabled;
    },
    get usesFiles() {
      return filesEnabled;
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
     * 音效。有音檔就放音檔，沒有（或還沒載到）就放合成版 —— 呼叫端不用管是哪一種。
     * `cue('pass', { grade: 'S' })` 會依評價微調音量。
     * @param {keyof SFX | keyof SFX_FILES} kind
     */
    cue(kind = 'pass', opts = {}) {
      const spec = SFX[kind];
      const fileSpec = SFX_FILES[kind];
      if (!spec && !fileSpec) return false;
      cueLog.push(kind);
      if (cueLog.length > 12) cueLog.shift();

      // 連按的 UI 音要節流（刻印牌可以按很快，但聲音不能疊成一片）
      if (fileSpec && fileSpec.throttle && ctx) {
        const t = ctx.currentTime;
        if (t - lastClickAt < fileSpec.throttle) return true;
        lastClickAt = t;
      }

      const gainScale = Number.isFinite(opts.gain) ? opts.gain : 1;
      if (kind === 'pass') {
        // 評價越高、缽敲得越實（S 最滿，C 收一點）
        const gradeScale = PASS_GRADE_GAIN[opts.grade] ?? PASS_GRADE_GAIN.C;
        if (playFileCue(kind, gradeScale * gainScale)) return true;
        const extra = GRADE_EXTRA[opts.grade] || [];
        playSeq(spec, { extra, gainScale: opts.grade === 'S' ? 1.15 : 1 });
        return true;
      }
      if (playFileCue(kind, gainScale)) return true;
      if (spec) playSeq(spec, { gainScale, baseScale: opts.baseScale ?? 1 });
      return true;
    },

    /** 走路的軟腳步聲（節流，避免一秒踩十下）。合成，沒有音檔。 */
    step(now = 0) {
      if (!ctx || isMuted) return false;
      if (now - lastStepAt < 0.26) return false;
      lastStepAt = now;
      playSeq(SFX.step, { baseScale: 0.94 + Math.random() * 0.12 });
      return true;
    },

    /**
     * 目前的音訊狀態（除錯 / 自動化測試用；純讀狀態，不做任何事）。
     */
    debug() {
      const bgm = {};
      for (const id of REGION_MOOD_IDS) {
        const track = BGM_TRACKS[id];
        const p = players.get(id);
        bgm[id] = {
          file: track ? track.file : null,
          title: track ? track.title : null,
          fetch: track ? fetchState.get(track.file) || 'idle' : 'idle',
          decoded: Boolean(track && decoded.has(track.file)),
          playing: Boolean(p && p.playing),
          segments: p ? p.segments.length : 0,
          gain: p ? Number(p.gain.gain.value.toFixed(4)) : 0,
          loopSeconds: p && p.buffer ? Number(p.buffer.duration.toFixed(2)) : 0,
          synthGain: layers.has(id) ? Number(layers.get(id).gain.gain.value.toFixed(4)) : 0,
        };
      }
      const sfx = {};
      for (const [kind, spec] of Object.entries(SFX_FILES)) {
        sfx[kind] = {
          file: spec.file,
          ready: decoded.has(spec.file),
          fetch: fetchState.get(spec.file) || 'idle',
          synthFallback: Boolean(SFX[kind]),
        };
      }
      return {
        started,
        region: currentRegion,
        /** 最近放過的音效（最舊 → 最新）。 */
        cues: cueLog.slice(),
        lastCue: cueLog.length ? cueLog[cueLog.length - 1] : null,
        source: sourceFor(currentRegion),
        usesFiles: filesEnabled,
        muted: isMuted,
        volume: currentVolume,
        masterGain: master ? Number(master.gain.value.toFixed(4)) : 0,
        duckGain: musicDuck ? Number(musicDuck.gain.value.toFixed(4)) : 1,
        chain: {
          context: Boolean(ctx),
          master: Boolean(master),
          compressor: Boolean(compressor),
          duck: Boolean(musicDuck),
          bgmBus: Boolean(bgmBus),
          sfxBus: Boolean(sfxBus),
        },
        pending: queue.length + running,
        failed: Array.from(fetchState.entries())
          .filter(([, v]) => v === 'failed')
          .map(([k]) => k),
        decodedTracks: decodedOrder.slice(),
        bgm,
        sfx,
      };
    },

    dispose() {
      if (bellTimer) clearTimeout(bellTimer);
      bellTimer = 0;
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = 0;
      for (const p of players.values()) {
        if (p.timer) clearTimeout(p.timer);
        p.timer = 0;
        p.playing = false;
        for (const s of p.segments) {
          try {
            s.src.stop();
          } catch {
            /* 已經停了 */
          }
        }
        p.segments = [];
      }
      players.clear();
      queue.length = 0;
      decoded.clear();
      decodedOrder.length = 0;
      bytes.clear();
      layers.clear();
      started = false;
      ctx?.close?.();
      ctx = null;
    },
  };

  return api;
}

export default createAudio;

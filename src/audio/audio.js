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
   * **這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
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
  /*
   * 契約鍛冶場（課程 v2 · Phase F）：還熱著的工坊。
   * 小三度 ＋ 純四度的鐵味和聲、sawtooth 被濾得很暗、鐘聲最密（那是敲打聲）。
   * **這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
   */
  toolcraft: Object.freeze({
    id: 'toolcraft',
    name: '鍛冶場的餘溫',
    root: 87.31,
    scale: Object.freeze([0, 3, 8, 15, 20]),
    bellScale: Object.freeze([0, 3, 8, 12, 15, 20]),
    voicing: Object.freeze(['sawtooth', 'sine', 'triangle']),
    cutoff: 390,
    lfoRate: 0.072,
    bellDensity: 0.72,
    bellEvery: 7,
    detune: 12,
  }),
  /*
   * 護欄崗（課程 v2 · Phase F）：守夜的哨所。
   * 五度空心和聲、幾乎不動的長音、鐘聲很稀但每一聲都拉得很長 —— 像有人在遠處守著。
   * **這一區沒有配樂音檔**（見 SYNTH_ONLY_REGIONS）。
   */
  wards: Object.freeze({
    id: 'wards',
    name: '不會關上的門',
    root: 123.47,
    scale: Object.freeze([0, 7, 12, 19, 26]),
    bellScale: Object.freeze([0, 7, 12, 14, 19, 24]),
    voicing: Object.freeze(['sine', 'triangle', 'sine']),
    cutoff: 520,
    lfoRate: 0.021,
    bellDensity: 0.26,
    bellEvery: 18,
    detune: 2,
  }),
  /*
   * 校驗場（課程 v2 · Phase G）：兩面鏡子互相照著的院子。
   * 音樂上的「照自己」＝同一個音程在上下兩個八度同時出現（0 / 12 / 24），
   * 中間夾一個小三度讓它不會空到像號角；鐘聲每一聲都會在稍後重複一次（bellEvery 短）。
   * **這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
   */
  refinery: Object.freeze({
    id: 'refinery',
    name: '照回來的那一句',
    root: 82.41,
    scale: Object.freeze([0, 3, 12, 15, 24]),
    bellScale: Object.freeze([0, 3, 7, 12, 15, 24]),
    voicing: Object.freeze(['sine', 'sine', 'triangle']),
    cutoff: 560,
    lfoRate: 0.034,
    bellDensity: 0.44,
    bellEvery: 8,
    detune: 3,
  }),
  /*
   * 減法之庭（課程 v2 · Phase H）：拿掉之後剩下的空氣。
   * 這一區的作法是**減法** —— 音階只有空心音（根音、八度、十二度、雙八度，
   * 連五度都推到高音去了，一個三度也沒有，所以不帶情緒色彩）、pad 只用兩個聲部、鐘聲最稀（bellDensity 全場最低）。
   * 根音 65.41（全場最低）：把空間讓出來，聽起來像一間空的院子。
   * **這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
   */
  frugality: Object.freeze({
    id: 'frugality',
    name: '拿掉之後',
    root: 65.41,
    scale: Object.freeze([0, 12, 19, 24]),
    bellScale: Object.freeze([0, 12, 19, 24, 31]),
    voicing: Object.freeze(['sine', 'sine']),
    cutoff: 480,
    lfoRate: 0.017,
    bellDensity: 0.2,
    bellEvery: 22,
    detune: 1,
  }),
  /*
   * 觀象臺（課程 v2 · Phase I）：一整片仰起來的天。
   * 根音 164.81（全場最高 —— 這一區在最高的地方，聲音也該離地最遠）、
   * 音階是拉開的九度與大三度（0, 4, 11, 16, 23：明亮，但沒有暖意），
   * 截止頻率全場最高（1100，泛音留得住 —— 鏡面反射的是光不是土），
   * 鐘聲密度中等偏高、間隔最短之一：星光一顆一顆亮起來。
   * **這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
   */
  sight: Object.freeze({
    id: 'sight',
    name: '鏡裡的星',
    root: 164.81,
    scale: Object.freeze([0, 4, 11, 16, 23]),
    bellScale: Object.freeze([0, 4, 11, 16, 23, 28]),
    voicing: Object.freeze(['sine', 'triangle', 'triangle']),
    cutoff: 1100,
    lfoRate: 0.036,
    bellDensity: 0.62,
    bellEvery: 7,
    detune: 3,
  }),
  /*
   * 分歧之廳（課程 v2 · Phase J1）：**這一區現在有配樂音檔了**（issue #3），這段合成 pad 是檔案還沒到 / 抓不到時的備援。
   * 兩份相反的守則同時亮著 —— 所以這一組的性格是「兩個聲音疊在一起，誰也沒有蓋過誰」：
   * 音階刻意同時放大三度與小三度（0 / 3 / 4），pad 走純三角波、失諧最大（8 音分），
   * 聽起來永遠像有兩台機器在同時說話。鐘聲密度全場最高。
   */
  divergence: Object.freeze({
    id: 'divergence',
    name: '兩面之詞',
    root: 138.59,
    scale: Object.freeze([0, 3, 4, 12, 15]),
    bellScale: Object.freeze([0, 3, 4, 7, 12, 15]),
    voicing: Object.freeze(['triangle', 'triangle', 'triangle']),
    cutoff: 580,
    lfoRate: 0.058,
    bellDensity: 0.68,
    bellEvery: 8,
    detune: 8,
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
  /* --- v1.2 · P03：濁靈（全部先合成；`SFX_FILES` 不加檔案，缺檔退回合成本來就是規則） --- */
  // 濁靈注意到你：短促的低頻雜訊（鋸齒波往下滑一小段）。`throttle` 是 cue 層的保險
  // （兩隻同時吼會疊成一團）；「每隻 ≥ 4 秒」的節流在 murks.js 的 field 內計時器。
  murkStir: {
    type: 'sawtooth',
    base: 62.0,
    gain: 0.02,
    throttle: 0.6,
    seq: [[0, 0, 0.16, 1], [-3, 0.05, 0.2, 0.7], [-7, 0.11, 0.24, 0.4]],
  },
  // 剝一層殼：一顆短促的敲擊 ＋ 一點碎光。`layers` 是三層音高（依累積命中數 1 / 2 / 3+ 選），
  // 每多剝一層就高一點 —— 聽得出「快說清楚了」。
  murkHit: {
    type: 'triangle',
    base: 440.0,
    gain: 0.03,
    layers: [1, 1.1892, 1.4983],
    seq: [[0, 0, 0.12, 1], [12, 0.02, 0.09, 0.45], [7, 0.06, 0.16, 0.5]],
  },
  // 安撫：一個暖和弦（大三和弦帶九音），有尾巴、比頌缽輕 —— 牠聽懂了，不是你贏了
  murkCalm: {
    type: 'sine',
    base: 261.63,
    gain: 0.05,
    seq: [[0, 0, 1.2, 0.8], [4, 0.1, 1.3, 0.75], [7, 0.2, 1.4, 0.7], [14, 0.34, 1.6, 0.45], [12, 0.5, 1.8, 0.35]],
  },
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
  /* --- issue #3：v2 交付的音效，這裡一樣放「檔案不在時」的備援合成版 --- */
  // 轉鈕的三檔（同一顆卡榫，音高越高＝檔位越高 —— 不看畫面也分得出轉到哪一檔）
  simLow: { type: 'triangle', base: 174.61, gain: 0.038, seq: [[0, 0, 0.08, 1], [7, 0.02, 0.06, 0.45], [19, 0.035, 0.04, 0.22]] },
  simMid: { type: 'triangle', base: 196.0, gain: 0.038, seq: [[0, 0, 0.08, 1], [7, 0.02, 0.06, 0.45], [19, 0.035, 0.04, 0.22]] },
  simHigh: { type: 'triangle', base: 220.0, gain: 0.038, seq: [[0, 0, 0.08, 1], [7, 0.02, 0.06, 0.45], [19, 0.035, 0.04, 0.22]] },
  // 應用關（試煉）通過：一記鑼 —— 一般過關的頌缽放大版，不是換一套語言
  trialPass: {
    type: 'sine',
    base: 98.0,
    gain: 0.09,
    seq: [
      [0, 0, 3.2, 1],
      [7, 0.01, 2.8, 0.7],
      [12, 0.03, 2.4, 0.5],
      [19, 0.06, 2.0, 0.32],
      [24, 0.12, 1.6, 0.18],
      [31, 0.2, 1.2, 0.1],
    ],
  },
  // 大師層印記：一記下壓的章 ＋ 後面一層很細的微光
  masterSeal: {
    type: 'triangle',
    base: 130.81,
    gain: 0.07,
    seq: [[0, 0, 0.18, 1], [12, 0.01, 0.12, 0.5], [24, 0.2, 0.5, 0.3], [31, 0.26, 0.7, 0.2]],
  },
  // 分歧之廳的硬門檻：厚重閂鎖被拉開（比一般解鎖更沉、沒有慶祝的微光）
  hardGate: {
    type: 'sine',
    base: 73.42,
    gain: 0.085,
    seq: [[0, 0, 0.5, 1], [5, 0.1, 0.6, 0.7], [12, 0.28, 1.0, 0.5], [19, 0.5, 1.4, 0.28]],
  },
  // 量器坊：敲模的那一下（很短、很準）
  formsTap: { type: 'triangle', base: 659.25, gain: 0.026, seq: [[0, 0, 0.07, 1], [12, 0.015, 0.05, 0.4]] },
  // 契約鍛冶場：鍛打（全區唯一的實體敲擊）
  toolcraftStrike: { type: 'triangle', base: 246.94, gain: 0.045, seq: [[0, 0, 0.1, 1], [12, 0.01, 0.08, 0.5], [26, 0.025, 0.05, 0.25]] },
  // 契約鍛冶場：契約完成（要低於試煉那一記鑼）
  toolcraftComplete: {
    type: 'sine',
    base: 196.0,
    gain: 0.055,
    seq: [[0, 0, 0.6, 0.8], [7, 0.1, 0.7, 0.7], [12, 0.24, 0.9, 0.5]],
  },
  // 減法之庭：東西被抽走（倒著長出來的一聲）
  frugalityRemove: { type: 'sine', base: 261.63, gain: 0.04, seq: [[0, 0, 0.9, 0.35], [7, 0.3, 0.6, 0.6], [12, 0.55, 0.35, 0.9]] },
  // 校驗場：倒帶回上一版
  refineryRerun: { type: 'sawtooth', base: 392.0, gain: 0.022, seq: [[0, 0, 0.1, 1], [-5, 0.06, 0.1, 0.7], [-12, 0.12, 0.12, 0.4]] },
  // 觀象臺：對焦鎖定（高、透明、克制）
  sightFocus: { type: 'sine', base: 1046.5, gain: 0.02, seq: [[0, 0, 0.5, 0.7], [7, 0.12, 0.6, 0.6], [12, 0.26, 0.9, 0.4]] },
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

/* ------------------------------------------------------------------ *
 * 響度系統（issue #3 · v2 音訊交付）
 *
 * **音檔本身一律不做響度處理**（交來什麼就編碼什麼，轉檔指令裡沒有任何
 * volume filter）。統一是在**播放時**用 Web Audio 的 gain 做的 ——
 * 換一批素材只要重新量一次、改一個數字，不必重新編碼、不必動任何邏輯。
 *
 *   配樂床（music bus） → -20 LUFS
 *   音效（sfx bus）     → -19 LUFS（只比床高 1 LU —— 站長的原話是「整體音量差不多，
 *                        音效跳出來一點點即可」。十二區的配樂全部沒有 attack transient，
 *                        音效是全場唯一的瞬態來源，本來就會自己跳出來，
 *                        所以音效設計者的交代是「寧可太小聲不要太大聲」。）
 *
 * 每一個檔案都在 `lufs` 欄位存著**編碼後**（也就是遊戲真的會播的那一份 m4a）
 * 用 `ffmpeg ebur128` 量到的 integrated LUFS，`gain` 則是由它算出來的線性倍率：
 *
 *   gain = 10 ^ ((目標 - lufs) / 20)
 *
 * 音效多一個 `trim`：這一聲**刻意**比「頭條事件」低幾 dB 的量（單位 dB，0 =
 * 頭條）。它是美術決定、不是量測結果，所以跟量測值分開存 ——
 * 目標 = -19 + trim，gain 仍然是同一條公式算出來的。
 * v2 的 trim 取自音效交付清單的 `recommended_gain_db`（以試煉鑼 -4 為 0 對齊）；
 * v1 的 trim 是從已上線的混音反推出來的，所以這次校準**聽起來不會有任何變化**
 * （逐檔誤差 < 3%），只是把當年手調的數字換成算得出來的數字。
 *
 * 唯一的例外是削波保護：gain 套下去之後的 true peak 不准超過 `SFX_PEAK_CEILING`。
 * 會踩到上限的那幾支在資料層標了 `clamped: true`（誠實記帳，不是偷偷改）。
 * ------------------------------------------------------------------ */

/** 配樂床的目標響度（LUFS integrated）。 */
export const MUSIC_TARGET_LUFS = -20;
/** 音效的目標響度（LUFS integrated；只比床高 1 LU —— 跳出來一點點就好）。 */
export const SFX_TARGET_LUFS = -19;
/** 音效套上 gain 之後的 true peak 上限（dBFS）。 */
export const SFX_PEAK_CEILING = -3;

/**
 * 響度 → 線性倍率。
 * @param {number} lufs   量到的 integrated LUFS
 * @param {number} target 目標 LUFS
 * @returns {number} 線性 gain
 */
export function gainForLufs(lufs, target) {
  return Math.pow(10, (target - lufs) / 20);
}

/**
 * 十二區配樂 ＋ 開場曲（站長以 Suno 創作，見 `public/LICENSE.md`）。
 * `mood` 指到合成備援的性格 —— 檔案沒到的時候放的就是它。
 * `lufs` 是編碼後量到的 integrated LUFS，`gain` 是把它拉到 -20 LUFS 的倍率。
 * `mode` 是交付清單寫的調式 —— 十二區共用同一組七音音級，所以任兩區交叉淡入都不會撞音。
 */
export const BGM_TRACKS = Object.freeze({
  title: Object.freeze({
    region: 'title',
    file: 'bgm_title.m4a',
    peak: -8.3,
    title: 'Promptasy Overture',
    lufs: -20.0,
    gain: 1.0,
  }),
  foundations: Object.freeze({
    region: 'foundations',
    file: 'bgm_foundations.m4a',
    peak: -8.4,
    title: 'Night Plateau Pad',
    mode: 'C Mixolydian',
    lufs: -20.1,
    gain: 1.0116,
  }),
  reasoning: Object.freeze({
    region: 'reasoning',
    file: 'bgm_reasoning.m4a',
    peak: -8.2,
    title: 'Thinking Corridor Float',
    mode: 'B♭ Lydian',
    lufs: -20.0,
    gain: 1.0,
  }),
  grounding: Object.freeze({
    region: 'grounding',
    file: 'bgm_grounding.m4a',
    peak: -7.7,
    title: 'Sunken Archive Bowed',
    mode: 'F Ionian',
    lufs: -20.0,
    gain: 1.0,
  }),
  orchestration: Object.freeze({
    region: 'orchestration',
    file: 'bgm_orchestration.m4a',
    peak: -6.7,
    title: 'Gear Workshop Pulse',
    mode: 'G Dorian',
    lufs: -20.0,
    gain: 1.0,
  }),
  config: Object.freeze({
    region: 'config',
    file: 'bgm_config.m4a',
    peak: -7.0,
    title: 'Mask Theatre Veil',
    mode: 'A Phrygian',
    lufs: -20.0,
    gain: 1.0,
  }),
  /* --- issue #3：v2 的六首（量器坊 / 契約鍛冶場 / 減法之庭 / 校驗場 / 觀象臺 / 分歧之廳） --- */
  forms: Object.freeze({
    region: 'forms',
    file: 'bgm_forms.m4a',
    peak: -2.7,
    title: 'Foundry of Measures',
    mode: 'D Aeolian',
    lufs: -13.7,
    gain: 0.4842,
  }),
  toolcraft: Object.freeze({
    region: 'toolcraft',
    file: 'bgm_toolcraft.m4a',
    peak: -4.9,
    title: 'Contract Forge',
    mode: 'G Dorian',
    lufs: -16.1,
    gain: 0.6383,
  }),
  frugality: Object.freeze({
    region: 'frugality',
    file: 'bgm_frugality.m4a',
    peak: -2.2,
    title: 'Garden of Subtraction',
    mode: 'C Mixolydian',
    lufs: -14.9,
    gain: 0.5559,
  }),
  refinery: Object.freeze({
    region: 'refinery',
    file: 'bgm_refinery.m4a',
    peak: -3.7,
    title: 'Proving Yard',
    mode: 'F Ionian',
    lufs: -15.1,
    gain: 0.5689,
  }),
  sight: Object.freeze({
    region: 'sight',
    file: 'bgm_sight.m4a',
    peak: -3.5,
    title: 'Observatory Terrace',
    mode: 'B♭ Lydian',
    lufs: -14.0,
    gain: 0.5012,
  }),
  divergence: Object.freeze({
    region: 'divergence',
    file: 'bgm_divergence.m4a',
    peak: -4.0,
    title: 'Hall of Divergence',
    mode: 'E Locrian',
    lufs: -14.1,
    gain: 0.507,
  }),
  wards: Object.freeze({
    region: 'wards',
    file: 'bgm_wards.m4a',
    peak: -3.7,
    title: 'The Unclosing Door',
    mode: 'A Phrygian',
    lufs: -13.2,
    gain: 0.4571,
  }),
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
 * 那比誠實地播一段自己的合成 pad 更糟。站長之後補上該區的音檔時，
 * 只要在 `BGM_TRACKS` 加一行、把 id 從這裡移走即可（其餘程式碼一個字都不必動）。
 *
 * issue #3 交付了六首（量器坊 / 契約鍛冶場 / 減法之庭 / 校驗場 / 觀象臺 / 分歧之廳），
 * 所以那六個 id 已經搬進 `BGM_TRACKS`；這條路走了一遍，證明它真的只要改一行。
 * 護欄崗的《The Unclosing Door》也在 2026-08-03 補齊 —— 十二區至此全部有自己的音檔，
 * 這份清單目前是空的，但機制留著：任何新區域上線時先進這裡，音檔到了再搬走。
 */
export const SYNTH_ONLY_REGIONS = Object.freeze([]);

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
  // 契約鍛冶場同樣只有一條橋接回中央高原
  toolcraft: Object.freeze(['foundations']),
  // 護欄崗沒有橋 —— 它是走出沉書檔案庫北緣就到的加建院落，回程那一首是檔案庫的
  wards: Object.freeze(['grounding']),
  // 校驗場同樣是加建（齒輪工坊西南外緣的院子），回程那一首是工坊的
  refinery: Object.freeze(['orchestration']),
  // 減法之庭是高原北緣的加建（沒有橋），回程那一首就是中央高原的
  frugality: Object.freeze(['foundations']),
  // 觀象臺自己一條橋接回中央高原；它自己沒有音檔，所以只預抓回程那一首
  sight: Object.freeze(['foundations']),
  // 分歧之廳是高原東側的加建（沒有橋），回程那一首就是中央高原的
  divergence: Object.freeze(['foundations']),
});

/**
 * 音效檔對照表：key 是既有的 cue 名稱 —— 有檔案就用檔案，沒有（或還沒載到）就用上面的合成版。
 *
 * `lufs`  這個檔案編碼後量到的 integrated LUFS（`ffmpeg ebur128`）。
 * `trim`  刻意比「頭條事件」低幾 dB（美術決定，0 = 頭條）。
 * `gain`  線性倍率 = 10^(((-18 + trim) - lufs) / 20)（削波保護見 `clamped`）。
 * `clamped` 套下去會超過 `SFX_PEAK_CEILING`，所以 gain 被上限壓下來過。
 * `layer` 疊在同一次 cue 上的第二個檔案（解鎖＝微光 ＋ 稍慢一點的石門）。
 * `alt`   同一個動作的另一顆素材，每次隨機挑一顆（連打才不會像機器）。
 * `duck`  這一聲期間把配樂壓低幾秒（讓 9 秒的頌缽有地方響）。
 * `throttle` 連按時最短間隔（秒）—— 逐 cue 各自算，彼此不干擾（＝交付清單的 `cooldown_ms`）。
 * `poly`  最多幾把同時響（＝交付清單的 `polyphony`）；超過就掐掉最舊的那一把。
 *        沒寫的（v1 那一批，清單沒有替它們指定）維持不設限。
 */
export const SFX_FILES = Object.freeze({
  // 過關：9 秒頌缽 —— 讓它響完，期間配樂壓 3 dB
  pass: Object.freeze({ file: 'sfx_pass.m4a', peak: -5.8, lufs: -19.5, trim: -2, gain: 0.8414, duck: 5.5 }),
  // 呈給神諭（手掌按下去）：一陣風
  submit: Object.freeze({ file: 'sfx_submit.m4a', peak: -4.4, lufs: -17.8, trim: -1.5, gain: 0.7328 }),
  // 石碑收下一段（選對了）：確認的漲聲
  stamp: Object.freeze({ file: 'sfx_select.m4a', peak: -5.7, lufs: -18.7, trim: -6.5, gain: 0.4571 }),
  // 面板打開：翻頁（整座檔案館的味道）
  open: Object.freeze({ file: 'sfx_page.m4a', peak: -3.0, lufs: -22.6, trim: -10.5, gain: 0.4519 }),
  codex: Object.freeze({ file: 'sfx_page.m4a', peak: -3.0, lufs: -22.6, trim: -9, gain: 0.537 }),
  // 真的解鎖：微光 ＋ 石門（門稍微慢一點進來）
  unlock: Object.freeze({
    file: 'sfx_unlock_shimmer.m4a',
    peak: -5.0,
    lufs: -19.3,
    trim: -2.5,
    gain: 0.7762,
    layer: Object.freeze({ file: 'sfx_unlock_door.m4a', peak: -6.0, lufs: -19.8, trim: -4.5, gain: 0.6531, delay: 0.28 }),
  }),
  // 先行前往：只有石門，沒有慶祝的微光（比較重、比較沉）
  gateOpen: Object.freeze({ file: 'sfx_unlock_door.m4a', peak: -6.0, lufs: -19.8, trim: -2.5, gain: 0.8222 }),
  // 刻印牌被按下去
  click: Object.freeze({ file: 'sfx_click.m4a', peak: -5.5, lufs: -30.3, trim: -18.5, gain: 0.4365, throttle: 0.07 }),
  // 絞盤咬進一格 / 齒輪工坊的器物
  ratchet: Object.freeze({ file: 'sfx_gear.m4a', peak: -6.4, lufs: -28.4, trim: -15, gain: 0.5248 }),
  // 起始祭壇的門檻 ＋ 刻文小語
  shrine: Object.freeze({ file: 'sfx_shrine.m4a', peak: -5.1, lufs: -14.0, trim: 1, gain: 0.631 }),
  // 隱藏成就：68 條全收集
  finale: Object.freeze({ file: 'sfx_finale.m4a', peak: -6.0, lufs: -20.0, trim: -3, gain: 0.7943, duck: 4.5 }),

  /* --- issue #3：v2 交付的音效（trim 取自交付清單，以試煉鑼為 0 對齊） --- */
  // 轉鈕的三檔：同一支素材移調而成，量出來的響度不同 → gain 各自把它們拉到同一個位置
  simLow: Object.freeze({ file: 'sfx_sim_low.m4a', peak: -12.1, lufs: -35.6, trim: -12, gain: 1.6982, throttle: 0.08, poly: 1 }),
  simMid: Object.freeze({ file: 'sfx_sim_mid.m4a', peak: -14.5, lufs: -37.9, trim: -12, gain: 2.2131, throttle: 0.08, poly: 1 }),
  simHigh: Object.freeze({ file: 'sfx_sim_high.m4a', peak: -13.6, lufs: -36.2, trim: -12, gain: 1.8197, throttle: 0.08, poly: 1 }),
  // 應用關（試煉）通過：一記鑼 —— 頌缽的放大版，期間把配樂讓開
  trialPass: Object.freeze({ file: 'sfx_trial_pass.m4a', peak: -11.9, lufs: -26.2, trim: 0, gain: 2.2909, duck: 5.0, poly: 1 }),
  // 大師層印記（無筆之印 / 默寫之印）：公證章下壓 ＋ 200ms 後那層微光
  masterSeal: Object.freeze({
    file: 'sfx_seal_stamp.m4a',
    peak: -12.2,
    lufs: -32.3,
    trim: -4,
    gain: 2.884,
    clamped: true,
    poly: 1,
    layer: Object.freeze({ file: 'sfx_seal_sparkle.m4a', peak: -5.8, lufs: -29.7, trim: -12, gain: 0.861, delay: 0.2 }),
  }),
  // 分歧之廳的硬門檻開啟（全場唯一一道沒有「先行前往」的門）
  hardGate: Object.freeze({ file: 'sfx_hard_gate.m4a', peak: -8.2, lufs: -27.5, trim: -2, gain: 1.82, clamped: true, poly: 1 }),
  // 量器坊：刻上一段＝敲模的那一下
  formsTap: Object.freeze({ file: 'sfx_forms_tap.m4a', peak: -11.9, lufs: -36.0, trim: -11, gain: 1.9953, throttle: 0.07, poly: 2 }),
  // 契約鍛冶場：刻上一段＝鍛打（兩顆隨機輪播，連打才不會像機器）
  toolcraftStrike: Object.freeze({
    file: 'sfx_toolcraft_strike_1.m4a',
    peak: -12.0,
    lufs: -37.0,
    trim: -8,
    gain: 2.818,
    clamped: true,
    alt: Object.freeze({ file: 'sfx_toolcraft_strike_2.m4a', peak: -12.0, lufs: -35.8, trim: -8, gain: 2.7542 }),
    throttle: 0.06,
    poly: 3,
  }),
  // 契約鍛冶場：石碑刻滿＝契約打完了（刻意低於試煉那一記鑼）
  toolcraftComplete: Object.freeze({ file: 'sfx_toolcraft_complete.m4a', peak: -10.3, lufs: -28.6, trim: -6, gain: 1.5136, poly: 1 }),
  // 減法之庭：刻上一段＝把多餘的抽走（倒放鋼琴，語意上就是「被拿掉」）
  frugalityRemove: Object.freeze({ file: 'sfx_frugality_remove.m4a', peak: -11.8, lufs: -25.0, trim: -8, gain: 0.7943, throttle: 0.15, poly: 1 }),
  // 校驗場：刻上一段＝再跑一輪（倒帶回上一版）
  refineryRerun: Object.freeze({ file: 'sfx_refinery_rerun.m4a', peak: -12.8, lufs: -26.1, trim: -10, gain: 0.7161, throttle: 0.12, poly: 1 }),
  // 觀象臺：刻上一段＝看見了（高、透明、克制）
  sightFocus: Object.freeze({ file: 'sfx_sight_focus.m4a', peak: -13.2, lufs: -28.4, trim: -10, gain: 0.9333, throttle: 0.2, poly: 1 }),
});

/**
 * 轉鈕三檔各自的 cue —— `cue('simDial', { notch: 0 | 1 | 2 })` 會轉成這裡的其中一支。
 * 音高越高＝檔位越高，不看畫面也分得出剛剛轉到哪一檔。
 */
export const SIM_NOTCH_CUES = Object.freeze(['simLow', 'simMid', 'simHigh']);

/**
 * 五片新土地各自的「刻上一段」音（其餘區域仍然是通用的 `stamp`）。
 * 對照交付清單的 `zone` 欄位：量測 / 鍛打 / 刪除 / 重跑 / 對焦。
 */
export const REGION_CARVE_CUES = Object.freeze({
  forms: 'formsTap',
  toolcraft: 'toolcraftStrike',
  frugality: 'frugalityRemove',
  refinery: 'refineryRerun',
  sight: 'sightFocus',
});

/** 五片新土地各自的「石碑刻滿了」音（沒列到的仍然是通用的 `seal`）。 */
export const REGION_SEAL_CUES = Object.freeze({
  toolcraft: 'toolcraftComplete',
});

/** 全部會被載入的檔名（測試用：驗證 `public/audio/` 真的有這些檔）。 */
export const AUDIO_MANIFEST = Object.freeze({
  bgm: Object.freeze(Object.values(BGM_TRACKS).map((t) => t.file)),
  sfx: Object.freeze(
    Array.from(
      new Set(
        Object.values(SFX_FILES).flatMap((s) =>
          [s.file, s.layer && s.layer.file, s.alt && s.alt.file].filter(Boolean)
        )
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
  /** cue → 上一次真的放出去的時間（逐 cue 節流，彼此不干擾）。 */
  const lastCueAt = new Map();
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

  /**
   * 這一首該用多大的 gain 播 —— 響度統一（-20 LUFS）就是在這裡發生的。
   * 音檔本身沒有做過任何響度處理，數字全部來自 `BGM_TRACKS[].gain`。
   */
  function trackGain(regionId) {
    const t = BGM_TRACKS[regionId];
    const g = t && Number.isFinite(t.gain) ? t.gain : 1;
    return Math.max(0.01, Math.min(4, g));
  }

  /** 開始播某一區的配樂（buffer 必須已經解好）。 */
  function startBgm(regionId, seconds = REGION_CROSSFADE) {
    if (!filesEnabled) return false;
    const p = playerFor(regionId);
    if (!p || !p.buffer || !ctx) return false;
    const now = ctx.currentTime;
    const from = holdParam(p.gain.gain, now);
    equalPowerRamp(p.gain.gain, now, Math.max(0.2, seconds), from, trackGain(regionId));
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

  /**
   * 播一個音檔音效。
   * @returns {{src: AudioBufferSourceNode, gain: GainNode}|null} 放出去的那一把聲音（給
   *   同時發聲數上限用的把手）；沒有解好 / 沒有 AudioContext 就回 null。
   */
  function playFile(file, { gain = 1, delay = 0, rate = 1 } = {}) {
    const buffer = decoded.get(file);
    if (!buffer || !ctx || !sfxBus) return null;
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
      return null;
    }
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* 已經斷開 */
      }
    };
    return { src, gain: g };
  }

  /**
   * 同時發聲數上限（音效交付清單的 `polyphony`）。
   *
   * 清單替每一顆音效寫了「最多幾把同時響」：轉鈕的卡榫是 1（轉快了應該是**換一下**，
   * 不是兩下疊在一起）、量測的敲模是 2、鍛打是 3（連打要疊得起來才像手工）。
   * 超過上限時**掐掉最舊的那一把**（12 ms 淡出，直接 stop 會有 click），
   * 這樣新的一下永遠聽得見 —— 而不是讓新的被吃掉。
   *
   * 沒有寫 `poly` 的 cue（v1 那一批）維持原本的行為：不設限。
   */
  const voices = new Map();
  function trackVoice(kind, poly, voice) {
    if (!voice || !Number.isFinite(poly) || poly <= 0) return;
    let list = voices.get(kind);
    if (!list) {
      list = [];
      voices.set(kind, list);
    }
    voice.src.addEventListener('ended', () => {
      const i = list.indexOf(voice);
      if (i >= 0) list.splice(i, 1);
    });
    list.push(voice);
    while (list.length > poly) {
      const oldest = list.shift();
      try {
        const t = ctx.currentTime;
        oldest.gain.gain.cancelScheduledValues(t);
        oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, t);
        oldest.gain.gain.linearRampToValueAtTime(0.0001, t + 0.012);
        oldest.src.stop(t + 0.014);
      } catch {
        /* 已經停了 */
      }
    }
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
    if (!spec) return false;
    /*
     * 同一個動作的兩顆素材隨機挑一顆（鍛打連打才不會像機器）。
     * 挑到的那一顆還沒解好就退回主素材；兩顆都沒解好就回 false 走合成備援。
     */
    let take = spec;
    if (spec.alt && decoded.has(spec.alt.file) && Math.random() < 0.5) take = spec.alt;
    if (!decoded.has(take.file)) take = spec;
    if (!decoded.has(take.file)) return false;
    const voice = playFile(take.file, { gain: (take.gain ?? 1) * gainScale, rate: take.rate ?? 1 });
    if (!voice) return false;
    trackVoice(kind, spec.poly, voice);
    // 疊在同一次 cue 上的第二層（解鎖＝微光 ＋ 稍慢一點進來的石門）
    if (spec.layer && decoded.has(spec.layer.file)) {
      const layerVoice = playFile(spec.layer.file, {
        gain: (spec.layer.gain ?? 1) * gainScale,
        delay: spec.layer.delay || 0,
      });
      // 第二層跟著同一個 cue 的上限走（它是同一件事的另一半，不是另一件事）
      trackVoice(`${kind}:layer`, spec.poly, layerVoice);
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
      /*
       * 轉鈕：一個 cue、三檔 —— `cue('simDial', { notch: 1 })`。
       * 呼叫端不必知道三支檔案叫什麼，只要說「轉到第幾檔」。
       */
      if (kind === 'simDial') {
        const n = Math.max(0, Math.min(SIM_NOTCH_CUES.length - 1, Number(opts.notch) || 0));
        kind = SIM_NOTCH_CUES[n];
      }
      const spec = SFX[kind];
      const fileSpec = SFX_FILES[kind];
      if (!spec && !fileSpec) return false;
      cueLog.push(kind);
      if (cueLog.length > 12) cueLog.shift();

      // 連按的 UI 音要節流（刻印牌可以按很快，但聲音不能疊成一片）。
      // 逐 cue 各自算 —— 敲一下鍛打不該讓刻印牌的按鍵音變啞。
      // v1.2 · P03：合成列也可以寫 `throttle`（濁靈的 murkStir）；音檔列的值優先。
      const throttle = (fileSpec && fileSpec.throttle) || (spec && spec.throttle) || 0;
      if (throttle && ctx) {
        const t = ctx.currentTime;
        if (t - (lastCueAt.get(kind) || -1e9) < throttle) return true;
        lastCueAt.set(kind, t);
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
      /*
       * v1.2 · P03：分層音高 —— `cue('murkHit', { layer: 2 })` 從 spec.layers 挑倍率
       * （0 起算、超出夾到最後一層），再乘上呼叫端給的 baseScale。
       */
      let baseScale = opts.baseScale ?? 1;
      if (spec && Array.isArray(spec.layers) && spec.layers.length && Number.isFinite(opts.layer)) {
        const li = Math.max(0, Math.min(spec.layers.length - 1, Math.floor(opts.layer)));
        baseScale *= spec.layers[li];
      }
      if (spec) playSeq(spec, { gainScale, baseScale });
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
          /** 這一首播滿時的 gain（＝把它拉到 -20 LUFS 的倍率）。 */
          targetGain: track ? trackGain(id) : 0,
          lufs: track && Number.isFinite(track.lufs) ? track.lufs : null,
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
          gain: spec.gain ?? 1,
          lufs: Number.isFinite(spec.lufs) ? spec.lufs : null,
          alt: spec.alt ? spec.alt.file : null,
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
        /*
         * 排隊中的**配樂**支數。`pending` 本身在標題卡上本來就會衝到 20 上下
         * （24 支音效是刻意一起抓的），對它下斷言等於在量機器多快 ——
         * 真正要守的護欄是「別把 12 首配樂都排進去」（共約 35 MB），量這一個才對。
         */
        pendingBgm: queue.filter((j) => /^bgm_/.test(j.file)).length,
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

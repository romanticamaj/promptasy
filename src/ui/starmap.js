/**
 * Promptasy — 四宿星圖（v1.2 · P08）
 *
 * 取代圖鑑上的「廠家徽章條」。世界裡的說法是：抄寫人從四個遠方抄回**四部原典**，
 * 天上四個星群各記著一部；你每收進一條技巧，對應的那一宿就多亮一顆星，
 * 一宿滿五顆就整組亮起、連成線。四宿全亮 ＝ 既有的隱藏成就（判定一格沒動）。
 *
 * 三條硬規則（各家品牌指引 ＋ WORLD §3.4「換皮但不說謊」）：
 *   1. **不畫任何標誌、不用任何品牌顏色**。星點是程序化算出來的圓點，
 *      顏色只用遊戲自己的兩階：未滿＝冷星光、滿了＝暖金（成就色）。
 *   2. **世界層文字零公司名**。宿只叫「第一宿…第四宿」，沒有任何影射公司的雙關。
 *   3. **真名只在星圖底下那一行做出處性使用**：列出四家的名稱、說明「原典＝這四家
 *      公開的官方文件」，並且**明寫沒有隸屬或背書關係**。名稱直接讀 `curriculum.json`
 *      的 `vendors`（一個位元組都不動），所以永遠不會抄錯。
 *
 * 這支檔案裡沒有任何 DOM 操作 —— 全部是純函式（吃資料、回字串），
 * 好讓 `npm run test:rubric` 直接把星點數與集滿判定拿去對。
 */
import { esc } from './dom.js';

/** 一宿集滿幾顆星（＝既有隱藏成就的每廠標記門檻，改這裡等於改成就條件）。 */
export const MANSION_TARGET = 5;

/** 四宿的世界說法。順序＝`curriculum.json` 的 vendors 順序。 */
export const MANSION_NAMES = Object.freeze(['第一宿', '第二宿', '第三宿', '第四宿']);

/** 四個星群釘在畫面四角（固定位置，不隨進度飄）。 */
export const MANSION_ANCHORS = Object.freeze([
  [86, 62],
  [254, 62],
  [86, 152],
  [254, 152],
]);

/** 每一宿的起始角（讓四叢星看起來不是同一個模子印出來的）。 */
const MANSION_SEEDS = Object.freeze([0.4, 1.9, 3.3, 5.1]);

/** 黃金角：拿來排星點的相位。同一個 i 永遠落在同一個位置（沒有亂數）。 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 星圖的畫布（viewBox）。 */
export const STARMAP_VIEWBOX = Object.freeze({ w: 340, h: 218 });

const round = (n) => Math.round(n * 100) / 100;

/**
 * 一宿的星點座標（程序化、可重現）。
 * @param {number} count 這一宿已經亮起的星數（＝該廠已收集的技巧標記數）
 * @param {number} index 第幾宿（0–3）
 */
export function mansionStars(count, index) {
  const [cx, cy] = MANSION_ANCHORS[index] || MANSION_ANCHORS[0];
  const seed = MANSION_SEEDS[index] || 0;
  const n = Math.max(0, Math.floor(count) || 0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = 5.5 + 5.6 * Math.sqrt(i);
    const a = i * GOLDEN_ANGLE + seed;
    out.push({
      x: round(cx + Math.cos(a) * r),
      y: round(cy + Math.sin(a) * r * 0.82),
      // 前五顆是「宿」本身（集滿時被連成線），之後的都是外圍的散星
      core: i < MANSION_TARGET,
    });
  }
  return out;
}

/**
 * 四宿的狀態（純資料）。
 * @param {object} opts
 * @param {Array}  opts.vendors `curriculum.json` 的 vendors（唯讀）
 * @param {object} opts.badges  `progression.state.badges`
 * @param {number} [opts.target] 一宿要幾顆才算滿
 */
export function starMansions({ vendors = [], badges = {}, target = MANSION_TARGET } = {}) {
  return vendors.map((v, i) => {
    const count = Math.max(0, Math.floor(badges[v.id] || 0));
    return {
      id: v.id,
      /** 真名只給星圖底下那一行用（出處性使用），星圖本體不印它。 */
      vendorName: v.name,
      name: MANSION_NAMES[i] || `第 ${i + 1} 宿`,
      index: i,
      count,
      target,
      lit: count >= target,
      stars: mansionStars(count, i),
    };
  });
}

/** 四宿全亮了嗎（＝隱藏成就的徽章那一半）。 */
export function allMansionsLit(mansions) {
  return Array.isArray(mansions) && mansions.length > 0 && mansions.every((m) => m.lit);
}

/**
 * 星圖底下那一行小字：四家的名稱 ＋「原典是什麼」。
 * 名稱一律由 vendors 現算，不手抄。
 */
export function starMapCaption(vendors = []) {
  const names = vendors.map((v) => v.name).join(' · ');
  return `原典＝這四家公開的官方文件：${names}（第一宿至第四宿依序對應）。`;
}

/** 免責句（星圖與成就頁共用同一句，測試守著它一字不差）。 */
export const STARMAP_DISCLAIMER = '本遊戲與這四家沒有隸屬或背書關係。';

/** 星圖本體（SVG 字串）。沒有標誌、沒有品牌色、沒有外部圖檔。 */
export function starMapSvg(mansions) {
  const groups = mansions
    .map((m) => {
      const [cx, cy] = MANSION_ANCHORS[m.index] || MANSION_ANCHORS[0];
      const dots = m.stars
        .map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.core ? 2.2 : 1.4}"/>`)
        .join('');
      const link =
        m.lit && m.stars.length >= m.target
          ? `<polyline class="starmap__link" points="${m.stars
              .slice(0, m.target)
              .map((s) => `${s.x},${s.y}`)
              .join(' ')}"/>`
          : '';
      return `<g class="starmap__mansion${m.lit ? ' is-lit' : ''}" data-mansion="${esc(m.id)}">
        ${link}<g class="starmap__stars">${dots}</g>
        <text class="starmap__label" x="${cx}" y="${cy + 50}" text-anchor="middle">${esc(m.name)} ${
        m.count
      } / ${m.target}</text>
      </g>`;
    })
    .join('');
  const lit = mansions.filter((m) => m.lit).length;
  const label = `四宿星圖：${mansions.map((m) => `${m.name} ${m.count} / ${m.target}`).join('、')}；已亮 ${lit} 宿。`;
  return `<svg class="starmap__sky" viewBox="0 0 ${STARMAP_VIEWBOX.w} ${STARMAP_VIEWBOX.h}" role="img" aria-label="${esc(
    label
  )}" focusable="false">${groups}</svg>`;
}

/**
 * 星圖整塊（圖 ＋ 底下那一行 ＋ 免責句）。
 * @param {object} opts
 * @param {Array}  opts.vendors
 * @param {object} opts.badges
 * @param {number} [opts.target]
 */
export function starMapBlock({ vendors = [], badges = {}, target = MANSION_TARGET } = {}) {
  const mansions = starMansions({ vendors, badges, target });
  return `<div class="starmap">
    ${starMapSvg(mansions)}
    <p class="starmap__note">${esc(starMapCaption(vendors))}</p>
    <p class="starmap__note starmap__note--legal">${esc(STARMAP_DISCLAIMER)}</p>
  </div>`;
}

export default starMapBlock;

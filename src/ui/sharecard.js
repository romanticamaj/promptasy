/**
 * Promptasy — 可分享的結果卡（Phase 21）
 *
 * 玩家在里程碑（通關 / 圖鑑 / 區域精通 / 隱藏成就）按下「分享」，
 * 就地用 canvas 畫一張 1200×630 的圖（og-image 比例，貼到聊天室或社群都不會被裁壞）。
 *
 * 分享出去的就是**這張圖 ＋ 一段話**（Phase 28）——
 * 那段話預設是世界的說法，玩家可以在框裡改成自己想說的，
 * 按下去的那一刻讀的就是框裡當下的字。沒有連結、沒有別的東西。
 *
 * 護欄：
 *   · **完全離線** —— 沒有任何外部服務、沒有 SDK、沒有網路請求。
 *     圖是 canvas 畫出來的，字型用的是已經自架的子集（document.fonts），
 *     石面質感與金髮絲全部是程序繪製，沒有任何圖檔。
 *   · 卡上的技巧名稱與稱號都來自遊戲資料；稱號是遊戲自撰的世界觀稱謂
 *     （ranks.json 的 note 有寫），不冒充任何官方分級。
 *
 * 視覺語言 = 夜間檔案館 ＋ 刻印牌：深墨石面、切角外框、金髮絲、
 * 冷星光當主色、暖金只留給「已達成」的熱點。
 */
import { createOverlay, el } from './dom.js';
import { rankFor, rankStats } from '../progression/ranks.js';

export const CARD_W = 1200;
export const CARD_H = 630;

/* ------------------------------------------------------------------ *
 * 分享出去的東西只有兩樣：**這張圖 ＋ 一段話**（Phase 28）
 *
 * Phase 24 曾經在下面排了一列「分享到 Facebook / Threads」的網頁入口 ——
 * 那些入口**只收得下文字和一個連結，收不下圖片**，
 * 所以收到的人看到的是一個程式碼倉庫的連結，不是玩家剛刻出來的那張卡。
 * 那不是玩家要分享的東西，整排已經拿掉。
 *
 * 現在只有一條路，而且兩種情況都送得出「圖 ＋ 那段話」：
 *   · 系統分享面板帶得動檔案 → 圖檔本身 ＋ 那段話直接交給 FB / IG / Threads / 訊息
 *   · 帶不動 → 把圖 ＋ 那段話一起放進剪貼簿（另外附一顆「下載圖片」保底）
 *
 * 沒有任何 SDK、沒有註冊任何應用程式、也不連任何伺服器 ——
 * 每一條路都是「玩家自己按下去」才會發生的一次動作。
 * ------------------------------------------------------------------ */

/**
 * 這個遊戲之後會住的地方。
 *
 * **不放進玩家貼出去的那段話裡** —— 分享的是那張圖與玩家自己寫的話，
 * 不是一個連結。留著這個常數是為了之後真的部署時有地方可以改。
 * TODO 部署後改成正式網址
 */
export const SHARE_URL = 'https://github.com/romanticamaj/promptasy';

/** 品牌那一句（和 index.html 的標題同一句）。 */
export const SHARE_TAGLINE = 'Learn Prompt Engineering by Playing';

/** 貼出去的那句話（世界的說法：稱號、刻進圖鑑的技法）。 */
export function shareText(model = {}) {
  const rank = model.rankTitle || '旅人';
  const lv = model.level ?? 1;
  const got = `已把 ${model.collected ?? 0} / ${model.total ?? 0} 條技法刻進圖鑑`;
  if (model.kind === 'result' && model.headline) {
    const grade = model.grade ? `，評價 ${model.grade}` : '';
    return `我在 Promptasy 通過了「${model.headline}」${grade} —— 現在的稱號是「${rank}」（Lv.${lv}），${got}。`;
  }
  if (model.kind === 'mastery' && model.headline) {
    return `我在 Promptasy 收齊了一片土地：${model.headline} —— 現在的稱號是「${rank}」（Lv.${lv}），${got}。`;
  }
  if (model.kind === 'finale') {
    return `我在 Promptasy 走完了整趟旅程 —— 稱號「${rank}」（Lv.${lv}），${got}。`;
  }
  return `我在 Promptasy 修行成了「${rank}」（Lv.${lv}）—— ${got}。`;
}

/**
 * 預設的那段話：世界的說法 ＋ 品牌那一句當落款。
 *
 * 玩家可以在分享卡上把它改成自己想說的（那個輸入框裡的字才是真的送出去的）。
 * **不帶網址** —— 分享的是圖，不是連結。
 */
export function shareCaption(model = {}) {
  return `${shareText(model)}\n${SHARE_TAGLINE}`;
}

/**
 * 一個只有 PNG 檔頭的假檔案。
 *
 * 系統分享面板支不支援「帶檔案」跟圖的內容無關，只跟型別有關 ——
 * 所以拿這個去問就好，不用等真正那張圖畫完。
 * （等圖畫完才決定要不要露出入口的話，開卡的瞬間焦點會落在別的地方，
 *  一兩百毫秒後才跳出一個主入口 —— 那對純鍵盤玩的人是很差的體驗。）
 */
export const SHARE_PROBE = (() => {
  try {
    return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'promptasy.png', { type: 'image/png' });
  } catch {
    return null;
  }
})();

/**
 * 這個瀏覽器能不能把「檔案」交給系統分享面板。
 * 這是唯一能把圖片本身交到那些 app 手上的路 —— 不支援就不要露出那個入口。
 */
export function systemShareSupported(file, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav || !file) return false;
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 繪圖小工具
 * ------------------------------------------------------------------ */

/** 可重現的亂數（同一張卡每次畫出來的顆粒一模一樣）。 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 切角矩形（刻印牌的八邊形輪廓）。 */
function chamfer(ctx, x, y, w, h, cut) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

const FONT_DISPLAY = `'Fraunces Display', 'Arcade Serif TC', Georgia, serif`;
const FONT_PROSE = `'Newsreader', 'Arcade Serif TC', Georgia, serif`;
const FONT_UI = `'Inter UI', 'Arcade Sans TC', system-ui, sans-serif`;
const FONT_META = `'Inter UI', system-ui, sans-serif`;

/** 全大寫、拉開字距的小標籤（canvas 沒有可靠的 letter-spacing，所以逐字畫）。 */
function tracked(ctx, str, x, y, { size = 13, color = '#9fb0c4', track = 3.4, align = 'left' } = {}) {
  ctx.save();
  ctx.font = `600 ${size}px ${FONT_META}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const chars = String(str).split('');
  const width = chars.reduce((a, c) => a + ctx.measureText(c).width + track, 0) - track;
  let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + track;
  }
  ctx.restore();
  return width;
}

/**
 * 折行：中文可以任意斷、英文儘量不拆字。
 * @returns {string[]}
 */
function wrap(ctx, str, maxWidth, maxLines = 99) {
  const lines = [];
  let line = '';
  const tokens = String(str).match(/[A-Za-z0-9@._/+-]+|\s+|[\s\S]/g) || [];
  for (const tk of tokens) {
    if (tk === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const candidate = line + tk;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line.replace(/\s+$/, ''));
      line = /^\s+$/.test(tk) ? '' : tk;
    } else {
      line = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line.replace(/\s+$/, ''));
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

/** 一行放不下就截斷並補省略號（技法名稱有長有短，不能讓它硬切在括號中間）。 */
function clipLine(ctx, str, maxWidth) {
  const text = String(str ?? '');
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut -= 1;
  return `${text.slice(0, cut).replace(/[\s（(、，,]+$/, '')}…`;
}

function paragraph(ctx, str, x, y, { font, color, maxWidth, lineHeight = 30, maxLines = 3 } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, str, maxWidth, maxLines);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  ctx.restore();
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

/** 一條金／星光髮絲線（兩端淡出）。 */
function hairline(ctx, x, y, w, color = 'rgba(196,220,236,0.22)') {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.12, color);
  g.addColorStop(0.88, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, 1);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 卡片本體
 * ------------------------------------------------------------------ */

/**
 * 把 model 畫到 canvas 上。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} m
 * @param {string} m.kindLabel   右上角那行（刻印紀錄 / 收集冊 / 土地封印 / 旅程完成）
 * @param {string} m.rankTitle   稱號
 * @param {string} m.rankTitleEn 稱號英文
 * @param {string} m.rankLine    稱號的一句話
 * @param {number} m.level
 * @param {number} m.collected
 * @param {number} m.total
 * @param {string} [m.grade]     通關評價（只有關卡結果卡有）
 * @param {string} [m.headline]  這張卡的主事件（例如關卡名）
 * @param {Array}  m.techniques  [{title, id}] 最多 3 條
 * @param {Array}  m.regions     [{name, nameEn, color, mastered}]
 */
export function drawCard(canvas, m) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const rand = rng(9176);

  /* --- 夜色底 --- */
  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.35, CARD_H);
  bg.addColorStop(0, '#121924');
  bg.addColorStop(0.46, '#090c12');
  bg.addColorStop(1, '#05070a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 頂部一圈很淡的星光（和面板頂緣那道光同一個語言）
  const glow = ctx.createRadialGradient(CARD_W * 0.5, -120, 40, CARD_W * 0.5, -120, 720);
  glow.addColorStop(0, 'rgba(169,201,216,0.22)');
  glow.addColorStop(1, 'rgba(169,201,216,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 石面：幾團很淡的斑，讓底不是純漸層
  for (let i = 0; i < 26; i += 1) {
    const cx = rand() * CARD_W;
    const cy = rand() * CARD_H;
    const r = 90 + rand() * 220;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const warm = rand() > 0.72;
    blob.addColorStop(0, warm ? 'rgba(230,199,155,0.035)' : 'rgba(169,201,216,0.03)');
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 顆粒（feTurbulence 的 canvas 版：一堆 1px 點）
  for (let i = 0; i < 5200; i += 1) {
    const a = rand() * 0.05;
    ctx.fillStyle = rand() > 0.5 ? `rgba(214,232,244,${a})` : `rgba(0,0,0,${a * 1.6})`;
    ctx.fillRect(Math.floor(rand() * CARD_W), Math.floor(rand() * CARD_H), 1, 1);
  }

  // 暗角
  const vig = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, CARD_H * 0.32, CARD_W / 2, CARD_H / 2, CARD_H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  /* --- 切角外框（刻印牌） --- */
  chamfer(ctx, 26, 26, CARD_W - 52, CARD_H - 52, 24);
  ctx.strokeStyle = 'rgba(196,220,236,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  chamfer(ctx, 38, 38, CARD_W - 76, CARD_H - 76, 17);
  ctx.strokeStyle = 'rgba(230,199,155,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const L = 78; // 左欄
  const R = 690; // 右欄
  const RW = CARD_W - R - 78;

  /* --- 標頭 --- */
  tracked(ctx, 'PROMPTARCADE', L, 92, { size: 14, color: '#a9c9d8', track: 4.6 });
  tracked(ctx, m.kindLabel || '', CARD_W - 78, 92, { size: 13, color: '#e6c79b', track: 3.6, align: 'right' });
  hairline(ctx, L, 108, CARD_W - 156);

  /* --- 稱號（座標刻意寫死：卡片是固定尺寸，流式排版只會讓底部溢出） --- */
  ctx.save();
  ctx.font = `500 68px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#eef4fa';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(169,201,216,0.35)';
  ctx.shadowBlur = 26;
  ctx.fillText(m.rankTitle, L, 182);
  ctx.restore();
  tracked(ctx, String(m.rankTitleEn || '').toUpperCase(), L, 212, { size: 13, color: '#66768d', track: 3.6 });

  paragraph(ctx, m.rankLine || '', L, 250, {
    font: `400 23px ${FONT_PROSE}`,
    color: '#c8d5e3',
    maxWidth: 540,
    lineHeight: 32,
    maxLines: 2,
  });

  /* --- 左欄下半：本次刻印（可選）＋ 刻進圖鑑的技法 --- */
  let listTop = 330; // 沒有 headline 時，技法清單從這裡開始
  if (m.headline) {
    hairline(ctx, L, 316, 540);
    tracked(ctx, '本次刻印', L, 338, { size: 12, color: '#66768d', track: 3.2 });
    ctx.save();
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.fillStyle = '#e6c79b';
    ctx.fillText(clipLine(ctx, m.headline, 540), L, 372);
    ctx.restore();
    listTop = 406;
  }

  const techs = (m.techniques || []).slice(0, 3);
  if (techs.length) {
    hairline(ctx, L, listTop - 14, 540);
    tracked(ctx, '刻進圖鑑的技法', L, listTop + 8, { size: 12, color: '#66768d', track: 3.2 });
    let ty = listTop + 44;
    for (const t of techs) {
      ctx.save();
      ctx.fillStyle = '#e6c79b';
      ctx.font = `400 16px ${FONT_UI}`;
      ctx.fillText('◈', L, ty);
      ctx.font = `500 21px ${FONT_UI}`;
      ctx.fillStyle = '#eef4fa';
      ctx.fillText(clipLine(ctx, t.title, 404), L + 24, ty);
      ctx.font = `400 13px ${FONT_META}`;
      ctx.fillStyle = '#66768d';
      ctx.textAlign = 'right';
      ctx.fillText(t.id, L + 540, ty);
      ctx.restore();
      ty += 38;
    }
  }

  /* --- 右欄：等級方章 ＋ 評價印章 --- */
  const badge = 92;
  chamfer(ctx, R, 132, badge, badge, 8);
  ctx.fillStyle = 'rgba(169,201,216,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(169,201,216,0.34)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `500 46px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#a9c9d8';
  ctx.shadowColor = 'rgba(169,201,216,0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText(String(m.level), R + badge / 2, 132 + 62);
  ctx.restore();
  tracked(ctx, 'LEVEL', R + badge / 2, 244, { size: 11, color: '#66768d', track: 3, align: 'center' });

  if (m.grade) {
    const gcx = R + badge + 78;
    ctx.save();
    ctx.beginPath();
    ctx.arc(gcx, 178, 46, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230,199,155,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(gcx, 178, 40, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230,199,155,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `500 48px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#e6c79b';
    ctx.shadowColor = 'rgba(230,199,155,0.5)';
    ctx.shadowBlur = 22;
    ctx.fillText(m.grade, gcx, 196);
    ctx.restore();
    tracked(ctx, 'GRADE', gcx, 244, { size: 11, color: '#66768d', track: 3, align: 'center' });
  }

  /* --- 右欄：收集進度 --- */
  const py = 288;
  tracked(ctx, '技巧已收集', R, py, { size: 12, color: '#66768d', track: 3.2 });
  ctx.save();
  ctx.font = `500 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#eef4fa';
  ctx.fillText(String(m.collected), R, py + 46);
  const w1 = ctx.measureText(String(m.collected)).width;
  ctx.font = `400 24px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#66768d';
  ctx.fillText(` / ${m.total}`, R + w1 + 4, py + 46);
  ctx.restore();

  const ratio = m.total ? Math.max(0, Math.min(1, m.collected / m.total)) : 0;
  ctx.fillStyle = 'rgba(196,220,236,0.14)';
  ctx.fillRect(R, py + 64, RW, 3);
  const meter = ctx.createLinearGradient(R, 0, R + Math.max(2, RW * ratio), 0);
  meter.addColorStop(0, 'rgba(169,201,216,0.75)');
  meter.addColorStop(1, '#e6c79b');
  ctx.fillStyle = meter;
  ctx.fillRect(R, py + 64, Math.max(2, RW * ratio), 3);

  /* --- 右欄：五片土地的封印 --- */
  tracked(ctx, '五片土地', R, py + 104, { size: 12, color: '#66768d', track: 3.2 });
  let sy = py + 124;
  for (const region of m.regions || []) {
    const on = region.mastered;
    chamfer(ctx, R, sy, 20, 20, 4);
    ctx.fillStyle = on ? 'rgba(230,199,155,0.26)' : 'rgba(169,201,216,0.05)';
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(230,199,155,0.75)' : 'rgba(196,220,236,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (on) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `400 13px ${FONT_UI}`;
      ctx.fillStyle = '#e6c79b';
      ctx.fillText('◈', R + 10, sy + 15);
      ctx.restore();
    }
    ctx.save();
    ctx.font = `${on ? 500 : 400} 19px ${FONT_UI}`;
    ctx.fillStyle = on ? '#eef4fa' : '#66768d';
    ctx.fillText(region.name, R + 32, sy + 15);
    ctx.font = `400 12px ${FONT_META}`;
    ctx.fillStyle = on ? 'rgba(230,199,155,0.7)' : 'rgba(102,118,141,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(on ? 'MASTERED' : '—', R + RW, sy + 15);
    ctx.restore();
    sy += 28;
  }

  /* --- 頁腳 --- */
  hairline(ctx, L, CARD_H - 76, CARD_W - 156, 'rgba(230,199,155,0.2)');
  ctx.save();
  ctx.font = `500 20px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#c8d5e3';
  ctx.fillText('Promptasy', L, CARD_H - 46);
  // 品牌名的寬度會隨字型載入狀態變動 —— 一定要量，不能寫死偏移量
  const brandW = ctx.measureText('Promptasy').width;
  ctx.font = `400 16px ${FONT_META}`;
  ctx.fillStyle = '#66768d';
  ctx.fillText('— Learn Prompt Engineering by Playing', L + brandW + 12, CARD_H - 46);
  ctx.restore();
  tracked(ctx, '夜間檔案館 · THE NIGHT ARCHIVE', CARD_W - 78, CARD_H - 46, {
    size: 12,
    color: '#66768d',
    track: 3,
    align: 'right',
  });

  return canvas;
}

/* ------------------------------------------------------------------ *
 * 預覽面板
 * ------------------------------------------------------------------ */

const KIND_LABEL = {
  result: '刻印紀錄 · TRIAL CLEARED',
  codex: '收集冊 · CODEX',
  mastery: '土地封印 · REGION MASTERED',
  finale: '旅程完成 · ALL COLLECTED',
};

/**
 * @param {object} opts
 * @param {object} opts.content
 * @param {object} opts.progression
 * @param {object} opts.ranksFile ranks.json
 * @param {Function} [opts.onClose]
 * @param {Function} [opts.onToast]
 */
export function createShareCard({ content, progression, ranksFile, onClose, onToast = null }) {
  const overlay = createOverlay({
    id: 'sharecard',
    title: '分享你的刻印紀錄',
    subtitle: '',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--share');

  const canvas = el('canvas', 'sharecard__canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  canvas.setAttribute('role', 'img');

  let lastModel = null;
  let fontsReady = false;
  /*
   * 圖先畫好、blob 先備好（Phase 24）。
   * `navigator.share()` 一定要在玩家按下去的那一下**直接**呼叫 ——
   * 中間只要 await 一次，手勢就斷了，瀏覽器會拒絕開系統分享面板。
   */
  let lastBlob = null;
  let lastFile = null;
  /** 玩家改過那段話沒？改過就不再被預設值蓋掉。 */
  let captionEdited = false;

  /** 子集字型要先真的載進來，canvas 才畫得出中文（否則會退回系統字型）。 */
  async function ensureFonts() {
    if (fontsReady) return;
    fontsReady = true;
    if (typeof document === 'undefined' || !document.fonts) return;
    const wanted = [
      `500 68px 'Fraunces Display'`,
      `500 68px 'Arcade Serif TC'`,
      `400 23px 'Newsreader'`,
      `500 22px 'Inter UI'`,
      `500 22px 'Arcade Sans TC'`,
    ];
    try {
      await Promise.all(wanted.map((f) => document.fonts.load(f, '刻印 Promptasy')));
      await document.fonts.ready;
    } catch {
      /* 字型載不起來就用系統字型畫 —— 卡片還是出得來 */
    }
  }

  /** 依 kind 組出這張卡要畫的東西。 */
  function buildModel(opts = {}) {
    const stats = rankStats(progression, content.curriculum);
    const { rank } = rankFor(stats, ranksFile.ranks || []);
    const groups = content.groupsOrdered();

    // 要秀在卡上的技巧：關卡結果卡用「這一關剛學到的」，其餘用「最近收集的」
    const ids = (opts.techniqueIds && opts.techniqueIds.length ? opts.techniqueIds : null) ||
      progression.state.collected.slice(-3).reverse();
    const techniques = ids
      .map((id) => content.technique(id))
      .filter(Boolean)
      .slice(0, 3)
      .map((t) => ({ title: t.title, id: t.id }));

    return {
      kind: opts.kind || 'codex',
      kindLabel: KIND_LABEL[opts.kind] || KIND_LABEL.codex,
      rankTitle: rank ? rank.title : '旅人',
      rankTitleEn: rank ? rank.titleEn : 'Traveller',
      rankLine: rank ? rank.line : '',
      level: stats.level,
      collected: stats.collected,
      total: stats.total,
      grade: opts.grade || '',
      headline: opts.headline || '',
      techniques,
      regions: groups.map((g) => ({
        name: g.name,
        nameEn: g.nameEn,
        color: g.color,
        mastered: progression.regionMastery(g.id).mastered,
      })),
    };
  }

  function fileName(model) {
    return `promptasy-${model.kind}-lv${model.level}-${model.collected}of${model.total}.png`;
  }

  async function render(opts) {
    await ensureFonts();
    lastModel = buildModel(opts);
    drawCard(canvas, lastModel);
    const alt = `Promptasy 結果卡：${lastModel.rankTitle} · Lv.${lastModel.level} · 已收集 ${lastModel.collected} / ${lastModel.total} 條技巧`;
    canvas.setAttribute('aria-label', alt);

    const dl = overlay.body.querySelector('[data-download]');
    if (dl) {
      dl.href = canvas.toDataURL('image/png');
      dl.download = fileName(lastModel);
    }
    // 玩家已經動手改過那段話 → 不要蓋掉他寫的東西
    const cap = overlay.body.querySelector('[data-caption]');
    if (cap && !captionEdited) cap.value = shareCaption(lastModel);
    await prepareFile();
  }

  /** 先把 blob 與 File 備好（分享出去的是這一份，不是再畫一次）。 */
  async function prepareFile() {
    lastBlob = null;
    lastFile = null;
    try {
      lastBlob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    } catch {
      lastBlob = null;
    }
    if (lastBlob && typeof File === 'function') {
      try {
        lastFile = new File([lastBlob], fileName(lastModel), { type: 'image/png' });
      } catch {
        lastFile = null;
      }
    }
    applySupport();
  }

  /**
   * 誰是主角？
   *   · 系統分享面板帶得動檔案 → 「分享圖＋文」（那是唯一能把圖交給那些 app 的路）
   *   · 帶不動 → 「複製圖＋文」；連剪貼簿都不給寫 → 「下載圖片」
   * 一個畫面只有一個主角，其餘退成安靜的那一階。
   */
  function applySupport() {
    const sys = overlay.body.querySelector('[data-sysshare]');
    // 用假檔案問就夠了 → 開卡的第一幀就知道要不要露出這個入口
    const supported = systemShareSupported(lastFile || SHARE_PROBE);
    if (sys) sys.hidden = !supported;
    const copy = overlay.body.querySelector('[data-copy]');
    const dl = overlay.body.querySelector('[data-download]');
    const copyIsHero = !supported && !!copy;
    if (copy) {
      copy.classList.toggle('btn--primary', copyIsHero);
      copy.classList.toggle('btn--ghost', !copyIsHero);
    }
    const dlIsHero = !supported && !copyIsHero;
    if (dl) {
      dl.classList.toggle('btn--primary', dlIsHero);
      dl.classList.toggle('btn--ghost', !dlIsHero);
    }
  }

  /** 這個畫面的主角（開卡時焦點就落在它上面）。 */
  function heroAction() {
    const sys = overlay.body.querySelector('[data-sysshare]');
    if (sys && !sys.hidden) return sys;
    return (
      overlay.body.querySelector('[data-copy]') ||
      overlay.body.querySelector('[data-download]') ||
      null
    );
  }

  /** 目前輸入框裡那段話（按下去的那一刻才讀，讀的是玩家改過的版本）。 */
  function captionNow() {
    const box = overlay.body.querySelector('[data-caption]');
    const typed = box ? String(box.value || '').trim() : '';
    if (typed) return typed;
    return lastModel ? shareCaption(lastModel) : '';
  }

  const canCopyImage = () =>
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.ClipboardItem === 'function';

  /**
   * 把圖（＋那句話）放進剪貼簿。
   *
   * 一定要在玩家按下去的那一下就**開始**寫（函式前半段是同步的），
   * 否則瀏覽器會認為不是使用者動作而拒絕。
   */
  async function copyBundle(text = '') {
    if (!lastBlob || !canCopyImage()) return false;
    try {
      const payload = { 'image/png': lastBlob };
      if (text) payload['text/plain'] = new Blob([text], { type: 'text/plain' });
      await navigator.clipboard.write([new window.ClipboardItem(payload)]);
      return true;
    } catch {
      /* 有些瀏覽器一次只收一種型別 → 退一步，至少把圖放進去 */
    }
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': lastBlob })]);
      return true;
    } catch {
      return false;
    }
  }

  function mount() {
    if (overlay.body.querySelector('[data-download]')) return;
    const canCopy = canCopyImage();

    overlay.body.innerHTML = `
      <div class="sharecard">
        <div class="sharecard__frame" data-frame></div>
        <div class="sharecard__side">
          <div class="sharecard__say">
            <label class="sharecard__saylabel" for="sharecard-say">一段話（可以改成你想說的）</label>
            <textarea class="sharecard__saybox" id="sharecard-say" data-caption rows="2"
              aria-describedby="sharecard-sayhint" spellcheck="false"></textarea>
          </div>
          <div class="sharecard__acts">
            <button class="btn btn--primary" type="button" data-sysshare hidden aria-label="把這張圖和這段話一起分享出去">分享圖＋文</button>
            ${canCopy ? '<button class="btn btn--primary" type="button" data-copy>複製圖＋文</button>' : ''}
            <a class="btn btn--ghost" data-download download="promptasy.png" href="#">下載圖片</a>
            <button class="btn btn--ghost" type="button" data-back>回去</button>
          </div>
          <p class="sharecard__hint" id="sharecard-sayhint">開啟 Facebook / Instagram / Threads 直接貼上 —— 圖和文字會一起送出。</p>
          <p class="sharecard__hint">圖只在這台裝置上，不會上傳。用 <kbd>Tab</kbd> 移動、<kbd>Enter</kbd> 按下去。</p>
        </div>
      </div>
    `;
    overlay.body.querySelector('[data-frame]').appendChild(canvas);
    overlay.body.querySelector('[data-back]').addEventListener('click', () => api.close());

    /* --- 那段話：玩家動過就不再被覆蓋 --- */
    const sayBox = overlay.body.querySelector('[data-caption]');
    if (sayBox) sayBox.addEventListener('input', () => { captionEdited = true; });

    const copyBtn = overlay.body.querySelector('[data-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const ready = !!lastBlob;
        // blob 開卡時就備好了 → 這裡不 await，寫剪貼簿仍在使用者手勢裡
        copyBundle(captionNow()).then((copied) => {
          if (copied) onToast?.('圖和那段話都複製好了 —— 到想貼的地方直接貼上。', 'good');
          else if (!ready) onToast?.('圖還在刻 —— 等一下再按一次。', 'warn');
          // 沒有權限 / 瀏覽器不給 → 退回「下載」這條一定走得通的路
          else onToast?.('這個瀏覽器不讓程式寫剪貼簿，改用「下載圖片」吧。', 'warn');
        });
      });
    }

    /* --- 系統分享面板：唯一能把「圖片本身」交給那些 app 的路 --- */
    const sysBtn = overlay.body.querySelector('[data-sysshare]');
    if (sysBtn) {
      sysBtn.addEventListener('click', () => {
        if (!lastModel) return;
        if (!lastFile) {
          onToast?.('圖還在刻 —— 等一下再按一次。', 'warn');
          return;
        }
        // 讀的是輸入框裡當下那段話（玩家改過的版本）—— 同步讀，手勢不會斷
        const text = captionNow();
        try {
          // 注意：這一行前面不准有任何 await —— 手勢一斷，系統分享面板就開不起來
          const p = navigator.share({ files: [lastFile], text });
          if (p && typeof p.catch === 'function') {
            p.catch((err) => {
              // 玩家自己按取消不算失敗，什麼都不要說
              if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
              onToast?.('這台裝置沒接受這次分享 —— 改用「複製圖＋文」吧。', 'warn');
            });
          }
        } catch {
          onToast?.('這台裝置沒接受這次分享 —— 改用「複製圖＋文」吧。', 'warn');
        }
      });
    }
  }

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    get canvas() {
      return canvas;
    },
    /** 目前這張卡的資料（除錯 / 自動化測試用）。 */
    model() {
      return lastModel;
    },
    /** 這次要帶出去的那段話（除錯 / 自動化測試用）—— 沒有網址，只有圖與話。 */
    shareData() {
      if (!lastModel) return null;
      return { text: captionNow(), preset: shareCaption(lastModel) };
    },
    /** 已經備好的 PNG（系統分享面板拿到的就是這一份）。 */
    get file() {
      return lastFile;
    },
    /**
     * @param {object} opts
     * @param {'result'|'codex'|'mastery'|'finale'} opts.kind
     * @param {string[]} [opts.techniqueIds] 要標亮的技巧（結果卡＝這一關剛學到的）
     * @param {string} [opts.grade]
     * @param {string} [opts.headline]
     */
    open(opts = {}) {
      mount();
      // 每開一張新的卡，那段話回到預設（上一張的話不會跟過來）
      captionEdited = false;
      // 卡片資料是同步算得出來的 → 那段話開卡的第一幀就在框裡，不用等圖畫完
      lastModel = buildModel(opts);
      const cap = overlay.body.querySelector('[data-caption]');
      if (cap) cap.value = shareCaption(lastModel);
      // 開卡的第一幀就決定「分享圖＋文」在不在 —— 焦點才不會落在別的地方之後又被搶走
      applySupport();
      overlay.setEyebrow('分享 · SHARE');
      // 副標留空：這句話已經在下面的說明裡，標頭少一行就能把高度讓給圖
      overlay.setTitle('分享你的刻印紀錄', '');
      overlay.resetScroll();
      // 焦點落在這個畫面的主角上（不是輸入框：那段話已經寫好了，想改再 Shift+Tab 回去）
      overlay.open({ focus: heroAction() });
      // 字型可能還沒 load 完 —— render 是 async，畫好會自己補上
      render(opts);
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createShareCard;

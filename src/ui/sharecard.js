/**
 * Promptasy — 可分享的結果卡（Phase 21）
 *
 * 玩家在里程碑（通關 / 圖鑑 / 區域精通 / 隱藏成就）按下「分享」，
 * 就地用 canvas 畫一張 1200×630 的圖（og-image 比例，貼到聊天室或社群都不會被裁壞）。
 *
 * 分享出去的就是**這張圖 ＋ 一段話**（Phase 28）——
 * 那段話預設是世界的說法，玩家可以在框裡改成自己想說的，
 * 按下去的那一刻讀的就是框裡當下的字。
 * 那段話的最後一行是遊戲的網址（站長決定；WORLD.md §3.5b 已同步修訂）——
 * 主體仍然是圖，網址只是讓看到的人走得過來。
 *
 * Phase 31 把「直接開 Threads / Facebook / Instagram」那一排放了回來，
 * 但每一顆都是「**先把圖備好 → 再開那個地方**」的一次動作，
 * 不是把成果換成一個連結（見下方那段長註解）。
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
import { createOverlay, el, esc, rovingList } from './dom.js';
import { rankFor, rankStats } from '../progression/ranks.js';

export const CARD_W = 1200;
export const CARD_H = 630;

/* ------------------------------------------------------------------ *
 * 分享出去的東西只有兩樣：**這張圖 ＋ 一段話**（Phase 28 / Phase 31）
 *
 * Phase 24 曾經在下面排了一列「分享到 ⭕⭕」的網頁入口 ——
 * 那些入口把**連結**丟過去（而且是程式碼倉庫的連結），
 * 收到的人看不到玩家剛刻出來的那張卡。Phase 28 因此把整排拿掉。
 * （現在那段話裡有網址，但它是**跟著圖一起走**的落款，不是替代品。）
 *
 * Phase 31 把那一排放回來，但換了做法：**先備好圖，再開那個地方**。
 * 每一顆的規則都一樣 ——
 *   ① 在按下去的那一瞬間把圖放進剪貼簿（或下載到裝置上）
 *   ② 同一個手勢裡開新分頁到那個平台（玩家本來就登入著）
 *   ③ 提示明講「接下來要做的那一個動作」
 * **沒有任何一顆是「只送出一個連結」** —— 圖一定跟著走。
 *
 * 各家真正收得下什麼（2026-07 實測 ＋ 官方文件）：
 *   · Threads 有 `threads.com/intent/post?text=`，文字會直接帶進撰寫框；
 *     圖片沒有任何網址參數帶得動 → 剪貼簿只放**圖**，Ctrl+V 一定貼得出圖來，
 *     不會和文字搶同一次貼上。
 *   · Facebook 的 `sharer.php` 只吃連結（`quote` 早就失效），
 *     也沒有帶得動內容的撰寫入口 → 只開首頁，圖走剪貼簿，
 *     文字讓玩家從那個框裡自己選起來（一次貼上只帶得走一種東西，所以老實分成兩步）。
 *   · Instagram 網頁版的「建立」走的是選檔案，不吃貼上 → 先把 PNG 下載下來，
 *     再開那一頁，讓玩家選剛剛那張圖。**不假裝它貼得上。**
 *
 * 沒有任何 SDK、沒有註冊任何應用程式、也不連任何伺服器 ——
 * 每一條路都是「玩家自己按下去」才會發生的一次動作。
 * ------------------------------------------------------------------ */

/**
 * 這個遊戲住的地方（2026-08 已上線；站長指定的短寫法）。
 *
 * 分享出去的主體仍然是**那張圖 ＋ 一段話**，但那段話的最後一行會帶上這個網址 ——
 * 看到卡片的人才走得過來（站長決定，WORLD.md §3.5b 已同步修訂）。
 */
export const SHARE_URL = 'https://garyhsieh.com/promptasy';

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
 * 預設的那段話：世界的說法 ＋ 品牌那一句當落款 ＋ 自己一行的網址。
 *
 * 玩家可以在分享卡上把它改成自己想說的（那個輸入框裡的字才是真的送出去的）。
 * 網址單獨佔一行 —— 各家撰寫框都會把它認成連結，也不會黏在落款上。
 */
export function shareCaption(model = {}) {
  return `${shareText(model)}\n${SHARE_TAGLINE} - ${SHARE_URL}`;
}

/* ------------------------------------------------------------------ *
 * 那一排「直接開這裡貼上」（Phase 31）
 * ------------------------------------------------------------------ */

/**
 * 按下去要開的那一頁。
 *
 * · `threads` —— 官方的撰寫入口，`text` 會直接帶進撰寫框。
 *   `threads.net/intent/post` 會 301 轉到 `threads.com/intent/post`（參數原封不動），
 *   所以直接寫新的網域，少跳一次。沒登入的話會先到登入頁，登入完自己回到這一頁。
 * · `facebook` —— 沒有任何帶得動內容的撰寫入口（`sharer.php` 只吃連結），
 *   所以就開首頁，讓玩家在自己已經登入的帳號裡點開貼文框。
 * · instagram —— 已依站長指示移除（網頁版無撰寫入口，體驗太差）
 *   伺服器根本不認，2026-07 實測會落回一般的首頁殼），所以老實開首頁，
 *   讓玩家自己按左邊那顆「建立」。圖是先下載好的，因為那個視窗只選得了檔案。
 *
 * @param {string} id threads / facebook
 * @param {object} [opts]
 * @param {string} [opts.text] 帶得進去的話（只有 Threads 收）
 * @returns {string|null} 沒有這條路就回 null（不假裝有）
 */
export function platformOpenUrl(id, { text = '' } = {}) {
  switch (id) {
    case 'threads':
      return `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`;
    case 'facebook':
      // 分享對話框（無需 app_id 的老入口）：自動開貼文框、帶上連結與 og 預覽
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`;
    default:
      return null;
  }
}

/**
 * 那一排石籤。
 *
 * `carry` 說的是「圖怎麼跟過去」：
 *   · `clipboard` —— 放進剪貼簿，玩家在那邊按 Ctrl+V
 *   · `download`  —— 下載成檔案，玩家在那邊選檔案
 * `textVia` 說的是「那段話怎麼跟過去」：
 *   · `url`    —— 網址參數直接帶進撰寫框
 *   · `manual` —— 那邊帶不進去 → 玩家自己從上面那個框裡選起來複製
 *
 * **每一顆都一定帶得走圖**（這是 Phase 31 和 Phase 24 最大的差別）。
 */
export const SHARE_TARGETS = [
  {
    id: 'threads',
    label: 'Threads',
    // 純文字分享（站長指示 2026-08-03）：文字直接帶進撰寫框，不再動剪貼簿
    carry: 'none',
    toast: '文字已經帶過去了 —— 檢查一下就能發。',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    // sharer.php 會直接開 FB 的貼文對話框（帶著遊戲連結與 og 預覽卡）；
    // FB 政策禁止預填文字，所以那段話先複製好，玩家在框裡 Ctrl+V。
    carry: 'clipboard',
    clipboard: 'text',
    toast: '文字已複製 —— 貼文框裡按 Ctrl+V 貼上（連結預覽會自動帶上）。',
  },
];

/* ------------------------------------------------------------------ *
 * 圖示（Phase 35.1）
 *
 * 全部是行內 SVG —— 沒有圖檔、沒有 icon font、沒有任何外部請求（護欄 3）。
 * 用 `currentColor` 上色，所以它們跟著刻印牌的受光狀態一起變。
 * 名字只放在 `aria-label` 裡（螢幕閱讀器讀得到），畫面上是純圖示。
 * ------------------------------------------------------------------ */
const ICON_ATTRS = 'viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"';

export const SHARE_ICONS = {
  facebook: `<svg ${ICON_ATTRS}><path fill="currentColor" d="M9.1 23.7v-8H6.6v-3.7h2.5v-1.6c0-4.1 1.9-6 5.9-6 .4 0 1 0 1.5.1.4.1.8.1 1.1.2v3.3l-.7-.1h-.7c-.7 0-1.3.1-1.7.3-.3.2-.5.4-.7.6-.2.4-.4 1-.4 1.8V12h3.9l-.4 2.1-.3 1.6h-3.2v8.2c5.4-.8 10-5.8 10-11.9C23.4 5.4 18.1 0 11.5 0S-.5 5.4-.5 12c0 5.6 3.9 10.3 9.1 11.6z" transform="translate(.5)"/></svg>`,
  threads: `<svg ${ICON_ATTRS}><path fill="currentColor" d="M12.2 24h-.02c-3.58-.02-6.33-1.2-8.18-3.51C2.35 18.44 1.5 15.59 1.47 12.01v-.02c.03-3.58.88-6.43 2.53-8.48C5.85 1.2 8.6.02 12.18 0h.01c2.75.02 5.05.73 6.83 2.1 1.68 1.29 2.86 3.13 3.51 5.47l-2.04.57c-1.1-3.96-3.9-5.99-8.3-6.02-2.91.02-5.11.94-6.54 2.72C4.31 6.5 3.62 8.91 3.59 12c.03 3.09.72 5.5 2.06 7.16 1.43 1.79 3.63 2.7 6.54 2.72 2.62-.02 4.36-.63 5.8-2.05 1.65-1.61 1.62-3.59 1.09-4.8-.31-.71-.87-1.3-1.63-1.75-.2 1.36-.63 2.45-1.29 3.27-.89 1.11-2.14 1.71-3.73 1.8-1.2.06-2.36-.22-3.26-.8-1.06-.69-1.69-1.74-1.75-2.97-.07-1.19.4-2.28 1.33-3.08.88-.76 2.12-1.21 3.58-1.29 1.07-.06 2.08-.01 3.02.14-.13-.74-.38-1.33-.75-1.76-.51-.59-1.31-.88-2.36-.89h-.03c-.84 0-1.99.23-2.72 1.32l-1.74-1.17c.98-1.45 2.57-2.26 4.48-2.26h.04c3.19.02 5.1 1.98 5.29 5.39l.32.14c1.49.7 2.58 1.76 3.15 3.07.8 1.82.87 4.79-1.55 7.16C17.63 23.16 15.38 23.98 12.2 24Zm1-11.69c-.24 0-.49 0-.74.02-1.84.1-2.98.95-2.92 2.14.07 1.26 1.45 1.84 2.78 1.77 1.23-.07 2.82-.54 3.09-3.71a10.5 10.5 0 0 0-2.21-.22Z"/></svg>`,
  copy: `<svg ${ICON_ATTRS}><rect x="8.6" y="3.4" width="12" height="14.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.4 20.6H5.6a2.2 2.2 0 0 1-2.2-2.2V7.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  done: `<svg ${ICON_ATTRS}><path d="M4.5 12.8 9.6 18 19.5 6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: `<svg ${ICON_ATTRS}><path d="M12 3.6v11.2m0 0 4-4m-4 4-4-4M4.4 18.2v1.4a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8v-1.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/** 按下去「成功了」的那一下，勾記留多久（毫秒）。 */
export const COPY_DONE_MS = 1900;

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

/**
 * 一枚小小的菱形刻記（技法列的項目符號、土地封印的印記）。
 *
 * 刻意用**畫的**而不是寫一個字：`◈`／`✦` 都不在自架子集裡
 * （`public/fonts/manifest.json` 的 `missing`），寫字就會掉到系統備援字型，
 * 換一台機器就換一種形狀與位置。畫出來的東西每一台都一樣。
 */
function diamond(ctx, cx, cy, r, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.72, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.72, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
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
 * @param {number} m.collected   已刻進圖鑑的技法數（v2：skillsV2 ＋ 舊技巧對照）
 * @param {number} m.total       目前的技法總數（catalog 現算，課程長大就跟著長）
 * @param {string} [m.grade]     通關評價（只有關卡結果卡有）
 * @param {string} [m.headline]  這張卡的主事件（例如關卡名）
 * @param {Array}  m.techniques  [{title, id}] 最多 3 條
 * @param {Array}  m.regions     [{name, nameEn, color, mastered}] —— 12 片土地
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
  tracked(ctx, 'PROMPTASY', L, 92, { size: 14, color: '#a9c9d8', track: 4.6 });
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
  let listTop = 326; // 沒有 headline 時，技法清單從這裡開始
  if (m.headline) {
    hairline(ctx, L, 308, 540);
    tracked(ctx, '本次刻印', L, 330, { size: 12, color: '#66768d', track: 3.2 });
    ctx.save();
    ctx.font = `500 26px ${FONT_UI}`;
    ctx.fillStyle = '#e6c79b';
    ctx.fillText(clipLine(ctx, m.headline, 540), L, 364);
    ctx.restore();
    listTop = 396;
  }

  const techs = (m.techniques || []).slice(0, 3);
  if (techs.length) {
    hairline(ctx, L, listTop - 14, 540);
    tracked(ctx, '刻進圖鑑的技法', L, listTop + 8, { size: 12, color: '#66768d', track: 3.2 });
    let ty = listTop + 44;
    for (const t of techs) {
      ctx.save();
      diamond(ctx, L + 5, ty - 7, 7, '#e6c79b');
      // 先量右邊那個 id 有多寬，名稱才知道自己能佔到哪裡（不能寫死，id 有長有短）
      ctx.font = `400 13px ${FONT_META}`;
      const idW = ctx.measureText(t.id).width;
      ctx.font = `500 21px ${FONT_UI}`;
      ctx.fillStyle = '#eef4fa';
      ctx.fillText(clipLine(ctx, t.title, Math.max(120, 540 - 24 - idW - 18)), L + 24, ty);
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
  const py = 284;
  tracked(ctx, '技法已收集', R, py, { size: 12, color: '#66768d', track: 3.2 });
  ctx.save();
  ctx.font = `500 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#eef4fa';
  ctx.fillText(String(m.collected), R, py + 44);
  const w1 = ctx.measureText(String(m.collected)).width;
  ctx.font = `400 24px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#66768d';
  ctx.fillText(` / ${m.total}`, R + w1 + 4, py + 44);
  ctx.restore();

  const ratio = m.total ? Math.max(0, Math.min(1, m.collected / m.total)) : 0;
  ctx.fillStyle = 'rgba(196,220,236,0.14)';
  ctx.fillRect(R, py + 60, RW, 3);
  const meter = ctx.createLinearGradient(R, 0, R + Math.max(2, RW * ratio), 0);
  meter.addColorStop(0, 'rgba(169,201,216,0.75)');
  meter.addColorStop(1, '#e6c79b');
  ctx.fillStyle = meter;
  ctx.fillRect(R, py + 60, Math.max(2, RW * ratio), 3);

  /* ------------------------------------------------------------------ *
   * 右欄：土地封印
   *
   * 課程 v2 之前這裡是「五片土地」，一片一行、每行 28px —— 12 片土地就會
   * 一路長到卡片外面去，壓在頁腳上。現在改成 **3 欄 × 4 列的印記格**：
   * 一格＝一枚切角封印 ＋ 土地名，12 片剛好排滿、離頁腳仍有一段留白。
   * 欄數與列高由土地數現算，之後真的再多一片也不會溢出（超過 12 片就縮列高）。
   * ------------------------------------------------------------------ */
  const regions = m.regions || [];
  const masteredCount = regions.filter((r) => r.mastered).length;
  const sealTop = py + 98;
  tracked(ctx, '土地封印', R, sealTop, { size: 12, color: '#66768d', track: 3.2 });
  tracked(ctx, `${masteredCount} / ${regions.length} MASTERED`, R + RW, sealTop, {
    size: 12,
    color: masteredCount ? '#e6c79b' : '#66768d',
    track: 2.4,
    align: 'right',
  });

  const cols = 3;
  const rowsN = Math.max(1, Math.ceil(regions.length / cols));
  const colW = RW / cols;
  // 格線的垂直預算：從印記格頂端到頁腳髮絲線之間，永遠留 34px 的呼吸
  const gridTop = sealTop + 22;
  const pitch = Math.min(26, Math.floor((CARD_H - 76 - 34 - gridTop) / rowsN));
  regions.forEach((region, i) => {
    const on = region.mastered;
    const cx = R + (i % cols) * colW;
    const cy = gridTop + Math.floor(i / cols) * pitch;
    chamfer(ctx, cx, cy, 17, 17, 4);
    ctx.fillStyle = on ? 'rgba(230,199,155,0.24)' : 'rgba(169,201,216,0.05)';
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(230,199,155,0.78)' : 'rgba(196,220,236,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (on) diamond(ctx, cx + 8.5, cy + 8.5, 4.6, '#e6c79b');
    ctx.save();
    ctx.font = `${on ? 500 : 400} 16px ${FONT_UI}`;
    ctx.fillStyle = on ? '#eef4fa' : '#7c8ca3';
    ctx.fillText(clipLine(ctx, region.name, colW - 34), cx + 25, cy + 13);
    ctx.restore();
  });

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
    title: '刻印記錄',
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
  /** 複製成功之後那個勾記要收回去的計時器。 */
  let copyDoneTimer = 0;

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

  /**
   * 一枚要秀在卡上的技法（v2 技能優先，查不到再退回舊技巧）。
   * 課程 v2 之後大多數神廟教的是 `skill-codex-v2.json` 的技能，
   * 只查舊 68 條的話，新蓋的那 100 多座通關之後卡上會是空的。
   */
  function markFor(id) {
    const sk = content.skill(id);
    if (sk) return { title: sk.nameZh, id: sk.id };
    const t = content.technique(id);
    return t ? { title: t.title, id: t.id } : null;
  }

  /** 依 kind 組出這張卡要畫的東西。 */
  function buildModel(opts = {}) {
    /*
     * 稱號 / 等級 / 精通片數一律走 runtime catalog ——
     * 以前這裡傳的是 `content.curriculum`（只認得舊五區），
     * 於是同一份存檔在卡上與在 HUD／圖鑑上會算出不一樣的稱號。
     */
    const stats = rankStats(progression, content.catalog);
    const { rank } = rankFor(stats, ranksFile.ranks || []);
    const groups = content.groupsOrdered();

    /*
     * 卡上的「已收集」＝**課程 v2 的技法**（130 條，由 catalog 現算）。
     * 判定沿用 `knowsSkill()`：技能本身進了 skillsV2，或它的祖先技巧
     * 已經在舊的 collected 裡（收集不倒退，D2）—— 和世界裡的軟門檻同一把尺。
     */
    const skills = content.catalog.skills || [];
    const skillsGot = skills.filter((s) => progression.knowsSkill(s.id)).length;

    // 要秀在卡上的技法：關卡結果卡用「這一關剛學到的」，其餘用「最近收集的」
    const recent = progression.collectedSkills().slice(-3).reverse();
    const fallback = recent.length ? recent : progression.state.collected.slice(-3).reverse();
    const ids =
      (opts.skillIds && opts.skillIds.length ? opts.skillIds : null) ||
      (opts.techniqueIds && opts.techniqueIds.length ? opts.techniqueIds : null) ||
      fallback;
    const techniques = ids.map(markFor).filter(Boolean).slice(0, 3);

    return {
      kind: opts.kind || 'codex',
      kindLabel: KIND_LABEL[opts.kind] || KIND_LABEL.codex,
      rankTitle: rank ? rank.title : '旅人',
      rankTitleEn: rank ? rank.titleEn : 'Traveller',
      rankLine: rank ? rank.line : '',
      level: stats.level,
      collected: skills.length ? skillsGot : stats.collected,
      total: skills.length ? skills.length : stats.total,
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
    const alt = `Promptasy 結果卡：${lastModel.rankTitle} · Lv.${lastModel.level} · 已收集 ${lastModel.collected} / ${lastModel.total} 條技法`;
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
   *   · 帶不動 → 那顆複製圖示；連剪貼簿都不給寫 → 只剩「下載」
   * 一個畫面只有一個主角，其餘退成安靜的那一階。
   */
  function applySupport() {
    // 系統分享鈕已依站長指示移除（2026-08-03）—— 複製鈕永遠是這一頁的主角。
    const copy = overlay.body.querySelector('[data-copy]');
    if (copy) copy.classList.add('is-hero');
  }

  /** 這個畫面的主角（開卡時焦點就落在它上面）。 */
  function heroAction() {
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

  const canCopyImage = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    if (typeof navigator.clipboard.write !== 'function') return false;
    if (typeof window === 'undefined' || typeof window.ClipboardItem !== 'function') return false;
    // 有的瀏覽器（Safari）會挑型別 —— 問得到就問，問不到就照舊試試看
    try {
      if (typeof window.ClipboardItem.supports === 'function') {
        return window.ClipboardItem.supports('image/png') !== false;
      }
    } catch {
      /* 問不出來就當作可以，真的不行下面的 catch 會接住 */
    }
    return true;
  };

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

  /**
   * 只把圖放進剪貼簿（Phase 31）。
   *
   * 一次貼上只帶得走一種東西 —— 那些撰寫框看到剪貼簿裡有圖就會貼圖、
   * 只有文字才貼文字。所以要玩家「按 Ctrl+V 貼上圖片」的時候，
   * 剪貼簿裡就**只放圖**，那一下不會變成貼出一段字。
   */
  async function copyImageOnly() {
    if (!lastBlob || !canCopyImage()) return false;
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': lastBlob })]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 把圖存到裝置上（Instagram 網頁版的「建立」只選得了檔案）。
   * 走的是已經備好的那顆 <a download> —— 同一個手勢裡按它就行。
   */
  function downloadImage() {
    const dl = overlay.body.querySelector('[data-download]');
    if (!dl || !dl.href || dl.href.endsWith('#')) return false;
    try {
      dl.click();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 開一個新分頁到那個平台。
   *
   * 一定要在按下去的那一瞬間**同步**呼叫（前面不能 await），
   * 不然瀏覽器會當成不是玩家自己開的而擋下來。
   * `noopener` —— 開出去的那一頁動不到這一頁。
   */
  function openTab(url) {
    if (!url || typeof window === 'undefined' || typeof window.open !== 'function') return false;
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (w && typeof w === 'object' && 'opener' in w) w.opener = null;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 那一排石籤按下去做的事（Phase 31）：
   * **先把圖備好 → 同一個手勢裡開那一頁 → 說出接下來要做的那一個動作。**
   */
  function goToPlatform(target) {
    if (!target || !lastModel) return;
    const text = captionNow();
    const url = platformOpenUrl(target.id, { text });
    const ready = !!lastBlob;

    // 純文字分享：什麼都不用備，直接開那一頁（文字已在網址裡）
    if (target.carry === 'none') {
      openTab(url);
      onToast?.(target.toast, 'good');
      return;
    }

    // 文字進剪貼簿 → 開那一頁（FB 不能預填文字，玩家在框裡 Ctrl+V）
    if (target.carry === 'clipboard' && target.clipboard === 'text') {
      const writing = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(text).then(() => true, () => false)
        : Promise.resolve(false);
      openTab(url);
      writing.then((copied) => {
        onToast?.(copied ? target.toast : '複製不了文字 —— 從上面那個框選起來複製吧。', copied ? 'good' : 'warn');
      });
      return;
    }

    // 這個瀏覽器不讓程式複製圖 → 那就走「存下來再選檔案」那條路（一樣帶得走圖）
    if (target.carry === 'clipboard' && !canCopyImage()) {
      const saved = downloadImage();
      openTab(url);
      onToast?.(
        saved
          ? '這個瀏覽器不讓程式複製圖 —— 已經幫你存下來了，把它拖進那邊的框裡。'
          : '圖還在刻 —— 那一頁先開著，等一下回來再按一次。',
        saved ? 'good' : 'warn'
      );
      return;
    }

    if (target.carry === 'download') {
      // 下載與開新頁都必須在這個手勢裡（前面一個 await 都不能有）
      const saved = downloadImage();
      openTab(url);
      onToast?.(
        saved ? target.toast : '圖還在刻 —— 那一頁先開著，等一下回來再按一次就會存下圖。',
        saved ? 'good' : 'warn'
      );
      return;
    }

    // 剪貼簿要在手勢裡就開始寫（不 await），開新頁也在同一個手勢裡
    const writing = copyImageOnly();
    openTab(url);
    writing.then((copied) => {
      if (copied) onToast?.(target.toast, 'good');
      else if (!ready) onToast?.('圖還在刻 —— 那一頁先開著，等一下回來再按一次就會複製好圖。', 'warn');
      else onToast?.('這個瀏覽器不讓程式複製圖 —— 改按「下載圖片」，再到那一頁選檔案。', 'warn');
    });
  }

  function mount() {
    if (overlay.body.querySelector('[data-download]')) return;
    const canCopy = canCopyImage();

    overlay.body.innerHTML = `
      <div class="sharecard">
        <div class="sharecard__frame" data-frame></div>
        <div class="sharecard__side">
          <div class="sharecard__say">
            <label class="sharecard__saylabel" for="sharecard-say">一段話</label>
            <textarea class="sharecard__saybox" id="sharecard-say" data-caption rows="3" spellcheck="false"></textarea>
          </div>
          <div class="sharecard__acts">
            <div class="sharecard__icons" data-targets>
              ${SHARE_TARGETS.map(
                (t) =>
                  `<button class="iconbtn" type="button" data-chip="${esc(t.id)}" title="${esc(
                    t.label
                  )}" aria-label="${esc(`${t.label}：${t.toast}`)}">${SHARE_ICONS[t.id] || ''}</button>`
              ).join('')}
              ${
                canCopy
                  ? `<button class="iconbtn iconbtn--copy" type="button" data-copy title="複製圖＋文" aria-label="把這張圖和這段話一起複製起來">
                      <span class="iconbtn__face" aria-hidden="true">${SHARE_ICONS.copy}</span>
                      <span class="iconbtn__face iconbtn__face--done" aria-hidden="true">${SHARE_ICONS.done}</span>
                    </button>`
                  : ''
              }
            </div>
            <a class="sharecard__dl" data-download download="promptasy.png" href="#" aria-label="把這張圖存到裝置上">${
              SHARE_ICONS.download
            }<span>下載</span></a>
          </div>
        </div>
      </div>
    `;
    overlay.body.querySelector('[data-frame]').appendChild(canvas);

    /* --- 那段話：玩家動過就不再被覆蓋 --- */
    const sayBox = overlay.body.querySelector('[data-caption]');
    if (sayBox) sayBox.addEventListener('input', () => { captionEdited = true; });

    const copyBtn = overlay.body.querySelector('[data-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const ready = !!lastBlob;
        // blob 開卡時就備好了 → 這裡不 await，寫剪貼簿仍在使用者手勢裡
        copyBundle(captionNow()).then((copied) => {
          if (copied) {
            // 成功那一下就地翻成勾記 —— 不用讀 toast 也知道剛剛那一按有效
            copyBtn.classList.add('is-done');
            if (copyDoneTimer) clearTimeout(copyDoneTimer);
            copyDoneTimer = setTimeout(() => {
              copyDoneTimer = 0;
              copyBtn.classList.remove('is-done');
            }, COPY_DONE_MS);
            onToast?.('圖和那段話都複製好了 —— 到想貼的地方直接貼上。', 'good');
          } else if (!ready) onToast?.('圖還在刻 —— 等一下再按一次。', 'warn');
          // 沒有權限 / 瀏覽器不給 → 退回「下載」這條一定走得通的路
          else onToast?.('這個瀏覽器不讓程式寫剪貼簿，改用「下載」吧。', 'warn');
        });
      });
    }

    /* --- 那一排：先備好圖，再開那一頁（Phase 31） --- */
    const targetsEl = overlay.body.querySelector('[data-targets]');
    if (targetsEl) {
      rovingList(targetsEl, '.iconbtn');
      targetsEl.addEventListener('click', (e) => {
        const chip = e.target.closest?.('[data-chip]');
        if (!chip || chip.disabled || !targetsEl.contains(chip)) return;
        const id = chip.getAttribute('data-chip');
        chip.classList.add('is-used');
        goToPlatform(SHARE_TARGETS.find((t) => t.id === id));
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
    /** 這次要帶出去的那段話（除錯 / 自動化測試用）—— 圖 ＋ 話 ＋ 最後一行的網址。 */
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

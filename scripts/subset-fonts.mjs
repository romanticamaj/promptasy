#!/usr/bin/env node
/**
 * PromptArcade — 字型子集化（build-time，執行一次就好）
 *
 * 為什麼要這個腳本：
 *   遊戲必須完全離線（護欄 3、CLAUDE.md 技術棧），所以不能連 Google Fonts CDN。
 *   但一套完整的繁體中文字型是 12–17 MB，直接自架會毀掉載入體感。
 *   幸好這個遊戲的**文字語料是有限的**（curriculum.json ＋ challenges.json ＋
 *   所有 UI 字串 ＋ 石碑碑文），所以我們把 CJK 字型切到「真的會用到的那幾千字」，
 *   Latin 字型切到 ASCII ＋ 排版標點，就能把總量壓到幾百 KB。
 *
 * 用法：
 *   node scripts/subset-fonts.mjs          # 需要 .font-cache/ 有原始 TTF
 *   node scripts/subset-fonts.mjs --fetch  # 缺檔就從 github.com/google/fonts 抓
 *
 * 產出：
 *   public/fonts/*.woff2
 *   public/fonts/manifest.json   ← 測試會拿它驗證「語料每個字都被涵蓋」
 *   public/fonts/OFL-*.txt       ← 每套字型的授權原文（護欄 6）
 *
 * 注意：使用者自己打的字（textarea）永遠走系統字型堆疊，不靠子集，
 *       所以「打了子集裡沒有的字」不會破圖 —— 見 src/styles.css 的 --font-input。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.font-cache');
const OUT = path.join(ROOT, 'public', 'fonts');
const GF = 'https://raw.githubusercontent.com/google/fonts/main';

/* ------------------------------------------------------------------ 字型表 */

/**
 * role:
 *   'display' → 只給 Latin 顯示字（大標、評價印章、數字）：ASCII ＋ 常用排版標點
 *   'latin'   → 語料裡所有非 CJK 字元
 *   'cjk'     → 語料裡的漢字 / 全形標點 ＋ 全部 Latin（讓中英混排走同一套度量）
 *
 * axes：可變軸保留範圍。實測 CJK 保留 wght 400–600 的**單一可變檔**
 *       比「400 / 600 兩個靜態檔」小約 15%，而且中間字重（500）可以無段使用。
 */
export const FONTS = [
  {
    id: 'fraunces',
    family: 'Fraunces Display',
    file: 'fraunces-display.woff2',
    src: 'Fraunces.ttf',
    license: 'OFL-Fraunces.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'Undercase Type (Phaedra Charles, Flavia Zimbardi)',
    url: 'https://github.com/google/fonts/tree/main/ofl/fraunces',
    role: 'display',
    axes: { wght: { min: 300, max: 700, default: 400 }, opsz: { min: 9, max: 144, default: 40 }, SOFT: 0, WONK: 1 },
  },
  {
    id: 'inter',
    family: 'Inter UI',
    file: 'inter-ui.woff2',
    src: 'Inter.ttf',
    license: 'OFL-Inter.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'Rasmus Andersson',
    url: 'https://github.com/google/fonts/tree/main/ofl/inter',
    role: 'latin',
    axes: { wght: { min: 300, max: 700, default: 400 }, opsz: { min: 14, max: 32, default: 14 } },
  },
  {
    id: 'newsreader',
    family: 'Newsreader',
    file: 'newsreader.woff2',
    src: 'Newsreader.ttf',
    license: 'OFL-Newsreader.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'Production Type (Jean-Baptiste Morizot, Lucas Descroix)',
    url: 'https://github.com/google/fonts/tree/main/ofl/newsreader',
    role: 'latin',
    axes: { wght: { min: 300, max: 600, default: 400 }, opsz: { min: 6, max: 72, default: 16 } },
  },
  {
    id: 'mono',
    family: 'Arcade Mono',
    file: 'arcade-mono.woff2',
    src: 'JetBrainsMono.ttf',
    license: 'OFL-JetBrainsMono.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'JetBrains (Philipp Nurullin, Konstantin Bulenkov)',
    url: 'https://github.com/google/fonts/tree/main/ofl/jetbrainsmono',
    role: 'latin',
    axes: { wght: { min: 400, max: 600, default: 400 } },
  },
  {
    id: 'serif-tc',
    family: 'Arcade Serif TC',
    file: 'arcade-serif-tc.woff2',
    src: 'NotoSerifTC.ttf',
    license: 'OFL-NotoSerifTC.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'Google (Noto Project)',
    url: 'https://github.com/google/fonts/tree/main/ofl/notoseriftc',
    role: 'cjk',
    axes: { wght: { min: 400, max: 600, default: 400 } },
  },
  {
    id: 'sans-tc',
    family: 'Arcade Sans TC',
    file: 'arcade-sans-tc.woff2',
    src: 'NotoSansTC.ttf',
    license: 'OFL-NotoSansTC.txt',
    licenseName: 'SIL Open Font License 1.1',
    author: 'Google (Noto Project)',
    url: 'https://github.com/google/fonts/tree/main/ofl/notosanstc',
    role: 'cjk',
    axes: { wght: { min: 400, max: 600, default: 400 } },
  },
];

const REMOTE = {
  'Fraunces.ttf': `${GF}/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf`,
  'Inter.ttf': `${GF}/ofl/inter/Inter%5Bopsz,wght%5D.ttf`,
  'Newsreader.ttf': `${GF}/ofl/newsreader/Newsreader%5Bopsz,wght%5D.ttf`,
  'JetBrainsMono.ttf': `${GF}/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf`,
  'NotoSerifTC.ttf': `${GF}/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf`,
  'NotoSansTC.ttf': `${GF}/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf`,
  'OFL-Fraunces.txt': `${GF}/ofl/fraunces/OFL.txt`,
  'OFL-Inter.txt': `${GF}/ofl/inter/OFL.txt`,
  'OFL-Newsreader.txt': `${GF}/ofl/newsreader/OFL.txt`,
  'OFL-JetBrainsMono.txt': `${GF}/ofl/jetbrainsmono/OFL.txt`,
  'OFL-NotoSerifTC.txt': `${GF}/ofl/notoseriftc/OFL.txt`,
  'OFL-NotoSansTC.txt': `${GF}/ofl/notosanstc/OFL.txt`,
};

/* ------------------------------------------------------------------ 語料 */

/**
 * 會被掃描的檔案：所有會變成畫面文字的來源。
 *
 * Phase 11：資料層改成掃 `src/data/` 底下**全部** JSON（原本只列了 curriculum 與
 * challenges，prologue / coach / builder-zh / flows 是靠與程式碼註解重疊才沒缺字，
 * 那是運氣不是保證）。寧可多切幾百個字圖，也不要哪天新增一個資料檔就漏字。
 */
export const CORPUS_FILES = [
  'index.html',
  ...walk(path.join(ROOT, 'src', 'data'), /\.json$/).map((p) => path.relative(ROOT, p)),
  ...walk(path.join(ROOT, 'src'), /\.(js|css)$/).map((p) => path.relative(ROOT, p)),
];

function walk(dir, re, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, re, out);
    else if (re.test(entry.name)) out.push(p);
  }
  return out.sort();
}

/** 一定要有的 Latin 字元（就算語料裡沒出現，也要能顯示：數字、標點、排版符號）。 */
const LATIN_BASELINE =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~' +
  ' –—―…‘’“”‹›«»•·°±×÷†‡§¶©®™←↑→↓↗↘↖↙⟶' +
  '✦✧★☆✓✔✕✗◐●○◆◇▲▼■□⟨⟩‧⁄№' +
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿŒœŠšŽž';

/** 判定「這個字元要交給 CJK 字型」。 */
export function isCjk(cp) {
  return (
    (cp >= 0x2e80 && cp <= 0x2fdf) || // 部首補充 / 康熙部首
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 標點（。、「」等）
    (cp >= 0x3100 && cp <= 0x312f) || // 注音
    (cp >= 0x31c0 && cp <= 0x31ef) || // 筆畫
    (cp >= 0x3400 && cp <= 0x4dbf) || // 擴充 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 基本區
    (cp >= 0xf900 && cp <= 0xfaff) || // 相容漢字
    (cp >= 0xfe10 && cp <= 0xfe1f) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xffef) // 全形
  );
}

/**
 * 掃出整個專案會用到的字元集合。
 *
 * 刻意掃「整個檔案」而不是只挑字串字面值 —— 這是**保守的超集**：
 * 多包含註解裡的中文（跟 UI 文字高度重疊，成本很低），
 * 但保證不會漏掉任何一句真的會顯示出來的話。
 */
export function collectCorpus(root = ROOT) {
  const set = new Set();
  for (const ch of LATIN_BASELINE) set.add(ch);
  const files = [];
  for (const rel of CORPUS_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    files.push(rel);
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp < 0x20) continue; // 換行 / tab 不需要字圖
      if (cp >= 0x1f000) continue; // emoji：交給系統彩色字型
      set.add(ch);
    }
  }
  const all = [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const latin = all.filter((c) => !isCjk(c.codePointAt(0)));
  return {
    files,
    latin,
    cjk: all.filter((c) => isCjk(c.codePointAt(0))),
    // 顯示字型只跑大標／數字／評價印章，用不到冷僻符號 —— 少 60% 的字圖
    display: latin.filter((c) => DISPLAY_RANGE.test(c)),
  };
}

/** Fraunces 只需要這些：字母、數字、常用標點、貨幣與破折號家族。 */
const DISPLAY_RANGE = /[A-Za-z0-9 .,:;!?'"“”‘’()[\]{}&@#%*+\-–—…·×✦/\\|<>=_^~$]/;

/**
 * 語料指紋：原始碼一改字，指紋就變。
 *
 * 測試會拿它跟 manifest 裡記的值比對 —— 不一致就代表有人加了新文案卻沒重跑
 * `npm run fonts`，那些新字會掉出子集、在畫面上變成系統字型的雜訊。
 * 故意做成 export 的函式，讓產生端與驗證端共用同一份實作。
 */
export function corpusFingerprint(corpus) {
  return crypto
    .createHash('sha256')
    .update(corpus.latin.join('') + '|' + corpus.cjk.join(''))
    .digest('hex')
    .slice(0, 16);
}

/** @param {ReturnType<typeof collectCorpus>} corpus */
export function charsFor(role, corpus) {
  if (role === 'display') return corpus.display;
  // CJK 字型在 CSS 裡帶 unicode-range，只負責漢字與全形標點；
  // 英數一律由前面的 Latin 字型供應（研究結論：Latin 排前面、CJK 排後面）。
  if (role === 'cjk') return corpus.cjk;
  return corpus.latin;
}

/* ------------------------------------------------ 原始字型的 cmap（驗證用） */

/** 解析 TTF/OTF 的 cmap，回傳「這套字型真的有哪些 codepoint」。 */
export function readCmap(buf) {
  const cps = new Set();
  const numTables = buf.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmapOff = buf.readUInt32BE(rec + 8);
  }
  if (!cmapOff) return cps;
  const n = buf.readUInt16BE(cmapOff + 2);
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    subtables.push({
      platform: buf.readUInt16BE(rec),
      encoding: buf.readUInt16BE(rec + 2),
      offset: cmapOff + buf.readUInt32BE(rec + 4),
    });
  }
  // 優先用 format 12（含 BMP 外），其次 format 4
  const pick =
    subtables.find((s) => buf.readUInt16BE(s.offset) === 12) ||
    subtables.find((s) => buf.readUInt16BE(s.offset) === 4);
  if (!pick) return cps;
  const format = buf.readUInt16BE(pick.offset);

  if (format === 12) {
    const groups = buf.readUInt32BE(pick.offset + 12);
    for (let i = 0; i < groups; i++) {
      const g = pick.offset + 16 + i * 12;
      const start = buf.readUInt32BE(g);
      const end = buf.readUInt32BE(g + 4);
      for (let cp = start; cp <= end && cp - start < 0x20000; cp++) cps.add(cp);
    }
  } else if (format === 4) {
    const segX2 = buf.readUInt16BE(pick.offset + 6);
    const seg = segX2 / 2;
    const endBase = pick.offset + 14;
    const startBase = endBase + segX2 + 2;
    const deltaBase = startBase + segX2;
    const rangeBase = deltaBase + segX2;
    for (let i = 0; i < seg; i++) {
      const end = buf.readUInt16BE(endBase + i * 2);
      const start = buf.readUInt16BE(startBase + i * 2);
      if (start === 0xffff) continue;
      const rangeOffset = buf.readUInt16BE(rangeBase + i * 2);
      for (let cp = start; cp <= end; cp++) {
        if (rangeOffset === 0) {
          cps.add(cp);
        } else {
          const gi = rangeBase + i * 2 + rangeOffset + (cp - start) * 2;
          if (gi + 1 < buf.length && buf.readUInt16BE(gi) !== 0) cps.add(cp);
        }
      }
    }
  }
  return cps;
}

/* ------------------------------------------------------------------ 主流程 */

async function ensureSources(fetchMissing) {
  fs.mkdirSync(CACHE, { recursive: true });
  const missing = Object.keys(REMOTE).filter((f) => !fs.existsSync(path.join(CACHE, f)));
  if (!missing.length) return;
  if (!fetchMissing) {
    throw new Error(
      `.font-cache/ 缺少原始字型：${missing.join(', ')}\n` +
        `執行 node scripts/subset-fonts.mjs --fetch 從 github.com/google/fonts 下載。`
    );
  }
  for (const name of missing) {
    process.stdout.write(`  下載 ${name} … `);
    const res = await fetch(REMOTE[name]);
    if (!res.ok) throw new Error(`下載失敗 ${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(CACHE, name), buf);
    console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  }
}

async function main() {
  const fetchMissing = process.argv.includes('--fetch');
  console.log('PromptArcade — 字型子集化\n');
  await ensureSources(fetchMissing);

  const corpus = collectCorpus();
  console.log(
    `語料：${corpus.files.length} 個檔案 → Latin ${corpus.latin.length} · CJK ${corpus.cjk.length} · Display ${corpus.display.length} 字元\n`
  );

  // 上一輪留下的檔案先清掉，避免改字型表後留下孤兒 woff2
  if (fs.existsSync(OUT)) {
    for (const f of fs.readdirSync(OUT)) {
      if (/\.(woff2|json)$/.test(f) || /^OFL-/.test(f)) fs.rmSync(path.join(OUT, f));
    }
  }
  fs.mkdirSync(OUT, { recursive: true });

  const entries = [];
  const missingByFont = {};
  let totalBytes = 0;

  for (const font of FONTS) {
    const srcPath = path.join(CACHE, font.src);
    const srcBuf = fs.readFileSync(srcPath);
    const chars = charsFor(font.role, corpus);
    const text = chars.join('');

    // 原始字型真的沒有的字（記錄下來，讓 fallback 堆疊接手）
    const available = readCmap(srcBuf);
    const missing = chars.filter((c) => !available.has(c.codePointAt(0)));
    missingByFont[font.id] = missing.map((c) => c.codePointAt(0));

    const out = await subsetFont(srcBuf, text, {
      targetFormat: 'woff2',
      variationAxes: font.axes,
    });
    fs.writeFileSync(path.join(OUT, font.file), out);
    totalBytes += out.length;

    const variable = Object.values(font.axes || {}).some((v) => v && typeof v === 'object');
    entries.push({
      id: font.id,
      family: font.family,
      file: font.file,
      bytes: out.length,
      role: font.role,
      variable,
      weight: font.weight ?? null,
      axes: font.axes,
      requested: chars.length,
      missing: missing.length,
      source: font.src,
      author: font.author,
      license: font.licenseName,
      licenseFile: font.license,
      url: font.url,
    });
    console.log(
      `  ${font.file.padEnd(28)} ${(out.length / 1024).toFixed(1).padStart(7)} KB` +
        `  (${chars.length} 字元${missing.length ? ` · 原字型缺 ${missing.length}` : ''})`
    );

    // 授權原文一起放進 public/fonts/（護欄 6）
    fs.copyFileSync(path.join(CACHE, font.license), path.join(OUT, font.license));
  }

  const manifest = {
    generated: '由 scripts/subset-fonts.mjs 產生，請勿手動編輯',
    corpusFiles: corpus.files,
    corpusHash: corpusFingerprint(corpus),
    coverage: {
      latin: corpus.latin.map((c) => c.codePointAt(0)),
      cjk: corpus.cjk.map((c) => c.codePointAt(0)),
      display: corpus.display.map((c) => c.codePointAt(0)),
    },
    missing: missingByFont,
    fonts: entries,
    totalBytes,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\n總計 ${(totalBytes / 1024).toFixed(1)} KB（${FONTS.length} 個檔案）`);
  console.log(`manifest → public/fonts/manifest.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

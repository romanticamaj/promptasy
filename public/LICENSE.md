# 資產授權（Asset Licenses）

本目錄只放**可商用 / CC 授權**的資產。每加入一個資產，就在下表補一行：檔名、來源、作者、授權。

## 字型（`fonts/`）

全部是 **SIL Open Font License 1.1（OFL-1.1）**，可自由自架、修改與再散布（含子集化）。
每套字型的授權原文一併放在本目錄：`fonts/OFL-*.txt`。

檔案是用 `scripts/subset-fonts.mjs` 從原始 TTF **子集化**過的 —— 只保留這個專案語料
（`src/data/*.json` ＋ 所有 UI 字串 ＋ 石碑碑文 ＋ 排版標點）真的會用到的字。
一套完整的繁體中文字型是 12–17 MB，子集後全套只有約 1.1 MB，才做得到「零 CDN、可離線」（護欄 3）。

| 檔案 | 原始字型 | 作者 / 鑄字廠 | 授權 | 子集大小 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `fonts/fraunces-display.woff2` | [Fraunces](https://github.com/google/fonts/tree/main/ofl/fraunces) | Undercase Type（Phaedra Charles, Flavia Zimbardi） | OFL-1.1 | 71 KB | Latin 大標、評價印章、大數字 |
| `fonts/newsreader.woff2` | [Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader) | Production Type（Jean-Baptiste Morizot, Lucas Descroix） | OFL-1.1 | 133 KB | Latin 長文襯線（情境、碑文、技巧說明） |
| `fonts/inter-ui.woff2` | [Inter](https://github.com/google/fonts/tree/main/ofl/inter) | Rasmus Andersson | OFL-1.1 | 82 KB | Latin 介面字與全大寫小標籤 |
| `fonts/arcade-mono.woff2` | [JetBrains Mono](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono) | JetBrains（Philipp Nurullin, Konstantin Bulenkov） | OFL-1.1 | 29 KB | 等寬：分數、編號、範例程式碼 |
| `fonts/arcade-serif-tc.woff2` | [Noto Serif TC](https://github.com/google/fonts/tree/main/ofl/notoseriftc) | Google（Noto Project） | OFL-1.1 | 451 KB | 中文襯線：大標與長文 |
| `fonts/arcade-sans-tc.woff2` | [Noto Sans TC](https://github.com/google/fonts/tree/main/ofl/notosanstc) | Google（Noto Project） | OFL-1.1 | 343 KB | 中文黑體：介面小字 |

合計約 **1.08 MB**。`fonts/manifest.json` 記錄了每個檔案涵蓋的 codepoint，
`npm run test:rubric` 會驗證「語料裡的每一個字都在子集裡」。

重新產生（原始 TTF 會快取在 `.font-cache/`，不進版控）：

```bash
npm run fonts          # 需要 .font-cache/ 已有原始 TTF
node scripts/subset-fonts.mjs --fetch   # 缺檔就從 github.com/google/fonts 下載
```

> 註：OFL 允許改名散布，且**要求**衍生字型不得使用原字型名稱中的保留字。
> 因此自架的字族名改成 `Arcade Serif TC` / `Arcade Sans TC` / `Arcade Mono` /
> `Fraunces Display`，原始名稱與出處如上表所示。

## 其他資產

| 檔案 | 來源 | 作者 | 授權 |
| --- | --- | --- | --- |
| _(尚無：`audio/`、`models/`、`textures/` 皆為空目錄)_ | | | |

音樂與音效目前**全部由 Web Audio 即時合成**（`src/audio/audio.js`），沒有外部音檔。
3D 世界的地形、道具與角色**全部程序生成**（`src/world/`、`src/player/`），沒有外部模型檔。
介面的顆粒質感是行內的 SVG `feTurbulence` data-URI（`src/styles.css` 的 `--grain`），也沒有外部圖檔。

## 允許的來源

- **角色與動畫**：[Mixamo](https://www.mixamo.com/)（Adobe，免費可商用）
- **模型**：[Kenney](https://kenney.nl/)（CC0）、[Quaternius](https://quaternius.com/)（CC0）、[Poly Pizza](https://poly.pizza/)（依各資產標示）
- **材質 / HDRI**：[Poly Haven](https://polyhaven.com/)（CC0）
- **字型**：只用 [SIL OFL](https://openfontlicense.org/) 或 CC0 授權的字型

音檔請直接放進 `audio/`，不要 base64 內嵌到程式碼裡。

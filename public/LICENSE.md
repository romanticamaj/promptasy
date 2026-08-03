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

## 音樂（`audio/bgm_*.m4a`）

十二首配樂（開場曲＋十一區配樂）著作權標示：**Gary Hsieh，由 SUNO.ai 輔助生成**，為本專案的原創授權曲目（本專案使用）。

> 本人原創，由 SUNO.ai 輔助生成，授權本專案使用。— Gary Hsieh

每首約 3 分鐘、AAC（m4a）、48 kHz stereo、128 kbps。

**檔案本身不做響度處理**（v2 那六首是 raw 交付，轉檔指令裡沒有任何 volume filter）——
統一是在播放時用 Web Audio 的 gain 做的，逐檔的量測值與倍率見
[`docs/design/audio-loudness.md`](../docs/design/audio-loudness.md) 與 `src/audio/audio.js` 的 `BGM_TRACKS`。
配樂床的目標是 **−20 LUFS**、音效是 **−19 LUFS**（只比配樂高 1 LU —— 配樂全是沒有
attack transient 的 pad，音效是全場唯一的瞬態來源，跳出來一點點就夠了）。

| 檔案 | 曲名 | 對應區域 | 來源 / 授權 |
| --- | --- | --- | --- |
| `audio/bgm_title.m4a` | Promptasy Overture | 開場標題卡（title） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_foundations.m4a` | Night Plateau Pad | 撰寫基本功（foundations） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_reasoning.m4a` | Thinking Corridor Float | 示範與推理（reasoning） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_grounding.m4a` | Sunken Archive Bowed | 脈絡與長文（grounding） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_orchestration.m4a` | Gear Workshop Pulse | 流程與代理（orchestration） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_config.m4a` | Mask Theatre Veil | 角色與參數（config） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_forms.m4a` | Foundry of Measures | 量器坊（forms） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_toolcraft.m4a` | Contract Forge | 契約鍛冶場（toolcraft） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_frugality.m4a` | Garden of Subtraction | 減法之庭（frugality） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_refinery.m4a` | Proving Yard | 校驗場（refinery） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_sight.m4a` | Observatory Terrace | 觀象臺（sight） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_divergence.m4a` | Hall of Divergence | 分歧之廳（divergence） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |
| `audio/bgm_wards.m4a` | The Unclosing Door | 護欄崗（wards） | Gary Hsieh，由 SUNO.ai 輔助生成（原創授權本專案使用） |

護欄崗（wards）還沒有自己的一首 —— 它誠實地登記在 `SYNTH_ONLY_REGIONS` 裡，走合成 pad。

## 音效（`audio/sfx_*.m4a`）

音效素材取自 **Splice**，依 Splice sample license 授權給站長帳號，已釐清可用於本專案。
（Splice 的樣本授權是**買斷、可用於作品**；不得再以樣本包的形式轉售或散布素材本身。）
v1 那批峰值 −6 dBFS、v2 那批峰值 −12 dBFS；兩批**都沒有做響度處理**，
播放時的 gain 依同一條公式算出來（見下方與 `docs/design/audio-loudness.md`）。

| 檔案 | 長度 | 用在哪裡 | 來源 / 授權 |
| --- | --- | --- | --- |
| `audio/sfx_pass.m4a` | 9.1 s | 過關（頌缽） | Splice sample license（授權至站長帳號，本專案已釐清可用） |
| `audio/sfx_unlock_door.m4a` | 2.8 s | 閘門開啟 / 先行前往（石門） | Splice sample license（同上） |
| `audio/sfx_unlock_shimmer.m4a` | 3.4 s | 解鎖新區域（微光） | Splice sample license（同上） |
| `audio/sfx_click.m4a` | 0.2 s | 刻印牌按下去 | Splice sample license（同上） |
| `audio/sfx_select.m4a` | 1.5 s | 石碑收下一段（選對了） | Splice sample license（同上） |
| `audio/sfx_submit.m4a` | 1.0 s | 呈給神諭（手掌按下去） | Splice sample license（同上） |
| `audio/sfx_page.m4a` | 0.9 s | 圖鑑 / 面板打開（翻頁） | Splice sample license（同上） |
| `audio/sfx_gear.m4a` | 1.3 s | 絞盤與齒輪工坊的器物 | Splice sample license（同上） |
| `audio/sfx_shrine.m4a` | 1.8 s | 起始祭壇的門檻 ＋ 刻文小語 | Splice sample license（同上） |
| `audio/sfx_finale.m4a` | 4.1 s | 隱藏成就（68 條全收集） | Splice sample license（同上） |
| `audio/sfx_sim_low.m4a` | 0.7 s | 轉鈕・第 1 檔（卡帶卡榫，移調 −2） | Splice sample license（同上） |
| `audio/sfx_sim_mid.m4a` | 0.7 s | 轉鈕・第 2 檔（原始音高） | Splice sample license（同上） |
| `audio/sfx_sim_high.m4a` | 0.7 s | 轉鈕・第 3 檔（移調 ＋2） | Splice sample license（同上） |
| `audio/sfx_trial_pass.m4a` | 4.8 s | 應用關（試煉）通過（鑼） | Splice sample license（同上） |
| `audio/sfx_seal_stamp.m4a` | 0.8 s | 大師層印記・實體層（公證章） | Splice sample license（同上） |
| `audio/sfx_seal_sparkle.m4a` | 0.9 s | 大師層印記・微光層（延遲 200 ms 疊上） | Splice sample license（同上） |
| `audio/sfx_hard_gate.m4a` | 2.4 s | 分歧之廳硬門檻開啟（厚重閂鎖） | Splice sample license（同上） |
| `audio/sfx_forms_tap.m4a` | 0.2 s | 量器坊・刻上一段（敲模） | Splice sample license（同上） |
| `audio/sfx_toolcraft_strike_1.m4a` | 0.3 s | 契約鍛冶場・鍛打 A（與 B 隨機輪播） | Splice sample license（同上） |
| `audio/sfx_toolcraft_strike_2.m4a` | 0.3 s | 契約鍛冶場・鍛打 B | Splice sample license（同上） |
| `audio/sfx_toolcraft_complete.m4a` | 1.9 s | 契約鍛冶場・石碑刻滿（契約完成） | Splice sample license（同上） |
| `audio/sfx_frugality_remove.m4a` | 2.2 s | 減法之庭・刻上一段（倒放鋼琴＝被抽走） | Splice sample license（同上） |
| `audio/sfx_refinery_rerun.m4a` | 0.6 s | 校驗場・刻上一段（倒帶＝再跑一輪） | Splice sample license（同上） |
| `audio/sfx_sight_focus.m4a` | 2.3 s | 觀象臺・刻上一段（對焦鎖定） | Splice sample license（同上） |

音檔合計約 **34.6 MB**（12 首配樂 ＋ 24 支音效），**一律等到標題卡按下去**（AudioContext 需要的
使用者手勢）之後才開始下載，而且只抓當區與鄰區的那幾首 —— 玩家不會一次下載 34.6 MB，
第一個畫面也不受影響。`src/audio/audio.js` 的**合成引擎完整保留**：檔案還沒到、抓不到或解不開時，
遊戲會自動退回即時合成的配樂與音效 —— 把 `audio/` 清空，核心迴圈照樣可玩（護欄 3）。

## 其他資產

| 檔案 | 來源 | 作者 | 授權 |
| --- | --- | --- | --- |
| _(尚無 —— 全部視覺皆為程序化生成,零模型/材質檔)_ | | | |

3D 世界的地形、道具與角色**全部程序生成**（`src/world/`、`src/player/`），沒有外部模型檔。
介面的顆粒質感是行內的 SVG `feTurbulence` data-URI（`src/styles.css` 的 `--grain`），也沒有外部圖檔。

## 允許的來源

- **角色與動畫**：[Mixamo](https://www.mixamo.com/)（Adobe，免費可商用）
- **模型**：[Kenney](https://kenney.nl/)（CC0）、[Quaternius](https://quaternius.com/)（CC0）、[Poly Pizza](https://poly.pizza/)（依各資產標示）
- **材質 / HDRI**：[Poly Haven](https://polyhaven.com/)（CC0）
- **字型**：只用 [SIL OFL](https://openfontlicense.org/) 或 CC0 授權的字型

音檔請直接放進 `audio/`，不要 base64 內嵌到程式碼裡。

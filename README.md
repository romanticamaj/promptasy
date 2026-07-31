# Promptasy — Learn Prompt Engineering by Playing

> A browser game to learn prompt engineering by playing — explore a world and solve challenges by writing prompts. Techniques from OpenAI, Anthropic, Google & xAI, each cited.

一款在瀏覽器裡「邊玩邊學 prompt engineering」的探索型小遊戲。你在一個夜色的世界裡探索、遇到問題、在地圖上找線索，然後**寫 prompt** 去解決它；解開後獲得經驗、解鎖新區域、把技巧收進圖鑑。核心是兩件事：**學習** ＋ **搜集**。

- **一句話定位**：Learn Prompt Engineering by Playing.
- **關鍵字**：`prompt engineering game`、`learn prompt engineering by playing`、`interactive prompt engineering practice`
- **GitHub topics**：`prompt-engineering` `learn-prompting` `game` `gamification` `llm` `education` `threejs` `webgl`

---

## 畫面（Screenshots）

> _待補：把遊玩截圖放進 `docs/screenshots/` 後在這裡引用。_

| 檔案 | 內容 |
| --- | --- |
| `docs/screenshots/title.png` | 開場標題卡 |
| `docs/screenshots/world.png` | 夜色高原、關卡光柱與星空 |
| `docs/screenshots/console.png` | Prompt 主控台與離線評分回饋 |
| `docs/screenshots/codex.png` | 68 條技巧圖鑑與廠家徽章 |

---

## 特色

- **先上一堂引導課程** — 第一次進遊戲會走一段序章「喚醒神諭」：四個要真的做到才過的操作門檻（走一步 / 轉鏡頭 / 跑起來 / 走到祭壇），接著三堂**核心概念實作課**（把話說清楚 / 正面表述 / 指令與資料要分開）。教學文字與弱→強對照**逐字取自官方文件**，輸入框預先填好那句「弱」寫法讓你動手修，打字時右邊的檢查項目會**即時亮起來**；自己試過一次才給看官方寫法，鷹架三堂逐堂減少。隨時可跳過（二次確認），也可從設定重看。
- **不用打字也玩得動：三種動手題型** — 預設互動不是打字。**石碑刻印**（24 關）是選擇建構題；**排序刻印**（2 關）把已經刻好的石版拖曳或用鍵盤**排順**（次序本身就是那一關要教的技巧）；**神諭工坊**（1 關）讓你當派工人 —— 挑工具牌、把值石填進參數格、排出呼叫的相依順序、最後立一條「參數找不到就反問」的規矩，把工具使用 / function calling 變成真的動得了的東西。石碑刻印一次只問一段（「第一段：要先告訴守門人什麼？」），你從 2–3 個選項裡挑；選對就**刻上石碑**（石屑、震動、鑿響），選錯石碑只是「不收」——抖一下、旁邊出現一句白話的教學回饋，再選就好，**你不可能失敗，只會學到東西**。刻滿之後浮出一個會呼吸的**手掌印**，按住 0.6 秒讓石碑發動，接著就是原本那張評分面板。錯的選項都是一般人真的會犯的寫法（含糊的「盡量簡短」、只說「不要」、指令和資料混在一起、少了讀者……）。排序刻印排錯時手掌印根本不會出現，工坊挑錯 / 放錯也只是「不收 ＋ 教你」—— 三種題型都不可能失敗。想自己打整段 prompt 的人可以隨時切到**自由書寫模式**（設定頁也有），起手寫法、快速填入、技巧積木、漂浮提示球、即時預檢一項都沒少。四種作答方式送出的都是同一段文字、走同一支離線評分引擎。
- **Learn by doing** — 27 個關卡，每關都在教一條真實、有官方出處的 prompt 技巧，而不是包著遊戲皮的填空題。
- **68 條技巧、15 個主題、5 大區域** — 內容整理自 OpenAI、Anthropic、Google、xAI 的官方文件，**每一條都能點到原始連結**；68 條技巧全部至少被一個關卡教到。
- **離線評分引擎** — 22 個可重用的檢查器（`hasRole` / `hasFewShot` / `specifiesFormat` / `hasConstraint` / `decomposesTask` / `keepsPromptLean` …）以結構偵測而非關鍵字比對判定「技巧是否被運用」，支援部分分數、證據式回饋與具體改進提示。
- **可探索的 3D 世界** — 中央高原 ＋ 四條橋 ＋ 四片各有調性的土地（階梯迴廊 / 沉書檔案庫 / 齒輪工坊 / 面具劇場），全部由 three.js 程序化生成，零外部模型檔。
- **美術方向：平靜的夜間探索** — 統一色本、key/fill/rim 三件套打光、星空與月暈、極光帶、貼地霧氣、分區螢火密度、bloom ＋ 自寫的 filmic 色彩分級；跨過一座橋時霧色 / 色偏 / 光強會平滑漂移，讓「換一片土地」變成一個事件。
- **分區生成式配樂** — 五片土地各有自己的調式、pad 音色與鐘聲密度，跨區交叉淡入淡出。**全部由 Web Audio 即時合成，沒有任何音檔。** 音效（開啟 / 送出 / 過關依評價加碼 / 未過 / 解鎖 / 腳步 / 圖鑑）同樣是合成的。
- **有骨節的人形主角** — 兜帽旅人由 three.js 基本幾何體組成（頭 / 兜帽 / 外袍 / 圍巾 / 背包 / 提燈 ＋ 可動的四肢），走路、奔跑、站立呼吸與過關歡呼**全部由關節旋轉即時算出來**，沒有骨架、沒有模型檔、沒有動畫檔；擺幅取自真實步態的關節活動度。
- **場景敘事** — 每片土地都有 2–4 組「故事小景」（對坐的石凳與沒收的茶具、刻到一半的碑林、走不到盡頭的階梯、翻開的書與還亮著的燈、拆到一半的機器、後台的戲服與面具），38 種程序化道具講出「這裡曾經發生過什麼」；地面有被踩出來的路，12 塊世界觀石碑散落在岔路上（按 <kbd>E</kbd> 閱讀，第一次讀給少量 XP）。
- **每區一個地標** — 斷環 / 無盡階梯塔 / 藏書之樹 / 巨臂吊車 / 面具拱門，從中央高原就看得到剪影，不用小地圖也知道往哪走。
- **編輯感的介面與自架字型** — 一套「夜間檔案館」的設計語言貫穿所有對話窗：深墨紙面 ＋ SVG 顆粒、髮絲線分隔、襯線大標配全大寫的 Latin 小標籤、統一的 expo-out 動態曲線。字型是 **OFL 授權自架子集**（Fraunces / Newsreader / Inter / JetBrains Mono ＋ 思源宋體 · 黑體繁中），依專案語料切到約 1.1 MB，**零 CDN、完全離線**；玩家自己打的字走系統字型堆疊，不受子集限制。
- **手感** — 移動有加速減速、鏡頭有延遲與前瞻並會 raycast 避開道具、奔跑時 FOV 微微拉開、角色有走路擺動、轉彎側傾與站立呼吸。
- **探索、升級、搜集** — XP／等級、雙條件解鎖鏈（等級 ＋ 前一區通關數）、技巧圖鑑與區域精通封印、四廠徽章、S/A/B/C 評價制、全收集的隱藏成就。
- **進度存在 localStorage** — 無帳號、無伺服器；設定頁可一鍵重置重學（二次確認）。
- **無障礙與低階機器** — 面板有 Tab 焦點鎖與焦點還原、可見的鍵盤 focus ring、`prefers-reduced-motion` 支援；畫質可即時切換（關閉後製）並記進存檔。
- **純靜態部署** — 建置後丟到 GitHub Pages / Netlify / Vercel 皆可。

---

## 操作（Controls）

> **整趟旅程不碰滑鼠也走得完。** 忘記按什麼，隨時按 <kbd>?</kbd> 叫出畫面上的「操作一覽」。
> 滑鼠當然照樣好用 —— 只是它不再是任何一件事的唯一入口。

| 按鍵 | 作用 |
| --- | --- |
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | 移動 |
| <kbd>Shift</kbd> | 奔跑 |
| <kbd>←</kbd><kbd>→</kbd> / 滑鼠拖曳 | 轉鏡頭 |
| <kbd>↑</kbd><kbd>↓</kbd> / 向上拖曳 / <kbd>空白鍵</kbd> | 抬頭看天空 / 低頭 |
| <kbd>-</kbd><kbd>=</kbd> / 滑鼠滾輪 | 鏡頭拉遠 / 拉近（別名 <kbd>PageDown</kbd><kbd>PageUp</kbd>） |
| <kbd>E</kbd> | 與石座互動 / 閱讀世界觀石碑 / 問問橋上的門（可先行前往） |
| <kbd>C</kbd> | 技巧圖鑑 |
| <kbd>O</kbd> | 設定（音量 / 靜音 / 畫質 / 重置進度） |
| <kbd>?</kbd> | 操作一覽（隨時叫得出來，讀題讀到一半也行） |
| <kbd>F3</kbd> | 效能監視器（FPS / 每幀毫秒 / 繪製次數 / 三角形數）開關 |

開著一關的時候：

| 按鍵 | 作用 |
| --- | --- |
| <kbd>Enter</kbd> | 第一、二幕：讀完了，往下一幕 |
| <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> | 石碑刻印：選這一段要填哪一句 |
| <kbd>↑</kbd><kbd>↓</kbd> | 在選項 / 快速填入 / 技巧積木 / 圖鑑條目之間移動焦點 |
| 按住 <kbd>Enter</kbd> | 石碑刻滿後：把手掌按上石碑，呈給神諭 |
| <kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>4</kbd> | 直接回到某一幕 |
| <kbd>L</kbd> / <kbd>H</kbd> / <kbd>M</kbd> / <kbd>S</kbd> | 翻線索 / 叫提示 / 換答題方式 / 分享 |
| <kbd>Ctrl</kbd>／<kbd>⌘</kbd> + <kbd>Enter</kbd> | 自由書寫模式：把 prompt 呈給神諭 |
| <kbd>Tab</kbd> | 移動焦點（焦點鎖在這一層裡） |
| <kbd>Esc</kbd> | 收起最上面那一層 |

單鍵快捷在**輸入框有焦點時一律失效** —— 打 prompt 的時候這些字母就只是字母。

---

## 快速開始

```bash
npm install
npm run dev          # 本機開發（http://localhost:5173）
npm run build        # 靜態輸出到 dist/
npm run preview      # 預覽 build 結果

npm run fonts        # 重新產生自架字型子集（改動文案後要跑；測試會檢查是否過期）
npm run test:rubric  # 離線 rubric / 存檔 / 進程 / 音訊 / 氣氛 / 字型的自我測試
npm run test:e2e     # headless Chrome 端到端驗證（會自己起 dev server）
```

需求：Node.js 18 以上。`test:e2e` 需要系統上有 Chrome / Chromium（可用 `CHROME_PATH` 指定）。
`npm run fonts` 需要 `.font-cache/` 有原始 TTF（不進版控）；第一次執行用
`node scripts/subset-fonts.mjs --fetch` 從 github.com/google/fonts 下載。
產出的 woff2 與授權原文都在 `public/fonts/`，已經在版控裡，**一般開發不需要重跑**。

---

## 專案結構

```
promptasy/
├─ CLAUDE.md                 # 北極星文件：願景、護欄、路線圖、變更紀錄
├─ index.html
├─ vite.config.js
├─ reference/
│  └─ prompting-crystal.html # 內容來源原檔（保留備查，不參與建置）
├─ scripts/
│  ├─ test-rubric.mjs        # 離線引擎自我測試
│  └─ headless-check.mjs     # CDP 端到端驗證
├─ public/
│  ├─ audio/                 # （目前配樂全部即時合成，此處保留給未來的音檔）
│  └─ models/ textures/      # CC 資產（附 LICENSE 註記）
└─ src/
   ├─ main.js                # 進入點
   ├─ engine/                # renderer、camera、天空 / 星空 / 極光、後製、主迴圈
   ├─ world/                 # 五片土地、橋、閘門、石座光柱、霧氣、分區氣氛表
   │  └─ props.js            # 故事小景、地標、世界觀石碑、走出來的路
   ├─ player/                # 角色控制器、跟隨鏡頭（含避障）
   │  └─ character.js        # 人形主角的骨節與程序化步態
   ├─ challenges/            # 關卡載入 + rubric 評分引擎（離線）
   │  └─ prologue.js         # 序章課程解析（引用 curriculum 的技巧與弱→強對照）
   ├─ prompt/                # Prompt 主控台 UI + 技巧積木
   │  └─ practice.js         # 序章練習台（同一支 rubric 引擎 ＋ 即時預檢）
   ├─ progression/           # XP、解鎖、圖鑑、徽章
   ├─ audio/                 # 分區生成式配樂 + 合成音效
   ├─ ui/                    # 標題卡、HUD、圖鑑、設定、成就、石碑
   │  └─ prologue.js         # 序章「喚醒神諭」的節奏與門檻判定
   ├─ save/                  # localStorage 讀寫 + 版本遷移 + reset
   └─ data/
      ├─ curriculum.json     # 68 技巧 / 15 主題 / 5 區域 / 官方出處
      ├─ challenges.json     # 27 個關卡與其 rubric
      └─ prologue.json       # 序章引導課程（節拍、門檻、三堂實作課）
```

---

## 內容與出處

`src/data/curriculum.json` 的技巧說明、範例與官方連結皆自 `reference/prompting-crystal.html` **逐字抽出、未做任何文字修改**，來源為四家的官方文件：

| 廠商 | 官方文件 |
| --- | --- |
| OpenAI | [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)、[Best practices](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api) |
| Anthropic | [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) |
| Google | [Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) |
| xAI | [Grok prompt engineering guides](https://docs.x.ai/docs/guides/grok-code-prompt-engineering) |

完整的 24 條出處總表存在 `curriculum.json` 的 `sources` 欄位，遊戲內圖鑑每一條技巧都可點到原文。

---

## 技術棧

Vite ＋ vanilla JS ＋ three.js（3D 世界與後製）＋ Web Audio（即時合成的配樂與音效）＋ localStorage（存檔）＋ 自架 OFL 字型子集（`subset-font`，僅 build 期）。無後端、無帳號、無資料庫、**執行期零外部請求**。

---

## 開發

專案的長期目標、設計支柱與不可妥協的開發護欄都在 [`CLAUDE.md`](./CLAUDE.md)；每次迭代前先讀它，交付後在最底的變更紀錄加一行。

---

## 授權

程式碼採 MIT。遊戲資產僅使用可商用 / CC 授權素材，來源註記於 [`public/LICENSE.md`](./public/LICENSE.md)
—— 世界、角色與音訊皆為程序生成；唯一的外部資產是 **SIL OFL 1.1** 授權的字型，
原始授權條文一併散布於 `public/fonts/OFL-*.txt`。技巧內容與連結版權歸各原始官方文件所有。

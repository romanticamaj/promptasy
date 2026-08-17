# Promptasy

> 一款在瀏覽器裡「邊玩邊學 prompt engineering」的探索型小遊戲。
> 玩家在一個有氛圍的世界裡探索、遇到問題、在地圖上找線索，然後**寫 prompt** 去解決它；
> 解開後獲得經驗、解鎖新區域、把技巧收進圖鑑。核心是兩件事：**學習** ＋ **搜集**。

- **Repo / 品牌**：`promptasy`（Phase 29 由 `promptarcade` 改名；prompt ＋ fantasy）
- **一句話定位**：Learn Prompt Engineering by Playing.
- **狀態**：**v1.1 已上線**（[garyhsieh.com/promptasy](https://garyhsieh.com/promptasy)）——12 區／142 關／130 技能。本檔是專案北極星，所有開發決策以此為準。

---

## 這份文件是什麼

這是 Promptasy 的**長期目標文件（north star）**與 AI 開發代理（Claude Code）的工作指南。
它刻意**不把美術風格、世界觀、關卡形式寫死**——只鎖定不可動搖的核心價值，其餘方向開放給每次迭代自行判斷、逐步演化。
任何一次開發，先讀這份文件，再決定「這次要把遊戲往哪個方向推進一格」。

**文件地圖（分層）**：

| 檔案 | 內容 | 什麼時候讀 |
|---|---|---|
| `CLAUDE.md`（本檔） | 北極星、護欄、工程 Harness | **每次開工先讀** |
| [`AGENTS.md`](./AGENTS.md) | 同一套 Harness 的精簡版（給 Codex 等其他代理） | 非 Claude Code 代理接手時 |
| [`WORLD.md`](./WORLD.md) | 世界觀、互動文法、效能與碰撞硬規則、29 項維護清單 | 動到世界內容之前 |
| [`docs/history/CHANGELOG.md`](./docs/history/CHANGELOG.md) | 完整開發變更紀錄（每次迭代往下加一行） | 接手時讀最後幾條；收尾時寫 |
| [`docs/history/prompts.html`](./docs/history/prompts.html) | 歷屆 goal / prompt 與達成效果對照表 | 想了解專案怎麼長出來的 |
| `docs/design/` | curriculum v2 設計、出處稽核、音訊響度數學 | 動到課程／出處／音訊時 |
| `docs/promptbooks/` | 各大廠 promptbook 擷取稿與 gap 分析 | 動到教學內容正確性時 |
| `README.md` | 對外門面（英文為主） | 對外數字有變時同步 |

---

## /goal — 長期、開放、不設限方向的目標

> **持續打造並精進 Promptasy：一款用「探索世界 ＋ 寫 prompt 解謎」來學會 prompt engineering 的瀏覽器遊戲。**

這是一個**沒有終點的 long-running 目標**。每一次執行，挑一個「當下投報率最高」的改進，端到端做完、確保遊戲仍可執行（`npm run dev` 能跑、無 console error），然後把進展記到 `docs/history/CHANGELOG.md` 最底。

方向完全開放——世界長怎樣、角色是誰、關卡是哪種形式、美術走什麼調性，**都由你（開發代理）自由發揮**，只要每次都讓遊戲更接近以下五個方向：

1. **學習更扎實** — 更完整、正確地涵蓋 130 條 prompt 技能（curriculum v2；最初的 68 條技巧逐字保留於 `curriculum.json`），且每條保留官方出處。
2. **探索＋升級＋搜集的體感更強** — 玩家想繼續走下去、想收集、想變強。
3. **感知美術價值更高、成本更低** — 用免費資產＋強美術指導，做出「看起來很貴」的畫面。
4. **離線評分更穩** — 不需 API key，核心迴圈就能判定 prompt 好壞並給有用回饋。
5. **手感與打磨更好** — 移動、鏡頭、音樂、UI、回饋節奏都更順。

**唯一不可妥協的護欄**（見下方「開發護欄」）：學習優先、內容正確且附出處、核心迴圈可離線、進度存在 localStorage 且可重置、每次交付都可執行。除此之外，放手去做。

**每次迭代的節奏**：讀本檔 → 選一個最高槓桿的改進 → 實作到可玩 → 自我驗證（能跑、能玩、無錯）→ 更新變更紀錄與路線圖。不求一次做完，求每次都往前一格且不倒退。

> **目前執行中的長程計畫（2026-08-17 起）：v1.2「濁靈之夜」** —— phase 序列、閘門與 `/goal` 文字在 [`docs/design/gameplay-roadmap.md`](./docs/design/gameplay-roadmap.md)；每個 phase 的章節、裁決與流水在 `docs/history/task_plan.md`／`findings.md`／`progress.md`。接手時先讀那三處。

---

## 遊戲願景與核心體驗

玩家是一個在陌生世界裡的旅人。世界由數個**區域（regions）**組成，每個區域對應一組 prompt 技巧主題。
你到處走、看風景、聽音樂；走到某處會**遇到一個問題**（卡住的角色、壞掉的裝置、鎖住的門、需要被說服的守衛……）。
問題旁邊或地圖上藏著**線索**（提示該用什麼技巧）。你打開 prompt 主控台，**寫一段 prompt** 去解決它。
系統即時判定你的 prompt 是否用對技巧、給回饋；解對了 → 拿經驗、解鎖、把該技巧收進**圖鑑**、世界對你打開更多。

目標情緒：**平靜地探索、時不時的靈光一閃、收集的滿足感、變強的成就感。**

---

## 設計支柱（Design Pillars）

1. **Learn by doing** — 每個機制都在教一個真實、有官方出處的 prompt 技巧；不是包著遊戲皮的填空題。
2. **Exploration & Progression** — 半開放世界，靠技巧解鎖漸進推進，明確的「升級感」。
3. **Collection（搜集）** — 一本會被慢慢填滿的技巧圖鑑＋廠家徽章；收集本身就是動力。
4. **Lowest cost, highest perceived art** — 用免費 CC 資產，靠**美術指導**（打光、色調、後製、氛圍）而非資產數量做出質感。
5. **Offline-first** — 核心遊玩迴圈不需要任何 API key 或後端；可選的「真 LLM 模式」是加分項，不是前提。
6. **Accurate & sourced** — 技巧內容與判定標準來自官方文件；圖鑑每一條都能點到出處。

---

## 參考（Reference）

視覺與體感參考 **thibault-introvigne.com** 那類作品：可探索的 3D 世界、有角色、有氛圍、有音樂、靠「發現」推進。
**我們模仿的是那個「探索 / 氛圍 / 發現 / 配樂」的體感，不是任何特定畫風。**

> **美術方向完全開放，不綁定任何既有風格（先前的「水晶」版只是內容來源，不是美術基準）。**
> 每次迭代可以嘗試不同調性（低多邊形、手繪、剪影、霧氣、夜景、島嶼、遺跡……），以「最低成本做出最高感知質感」為準。

---

## 核心玩法迴圈（Core Loop）

```
探索世界  →  遇到問題（challenge）  →  蒐集線索 / 看提示  →
開啟 Prompt 主控台  →  寫一段 prompt  →  評分引擎判定（離線）  →
回饋（過 / 部分過 / 未過 ＋ 提示）  →  過關：經驗＋解鎖＋收進圖鑑  →  繼續探索
```

- **一關 = 一個技巧的實戰**：問題情境會逼你用上某個（或某幾個）技巧才解得開。
- **回饋要教學**：沒過時，給「你缺了什麼」的具體提示，並連到該技巧的官方出處。
- **可重玩**：關卡可重寫更好的 prompt 拿更高評價（S/A/B/C），鼓勵精進。

---

## 內容來源與課程（Curriculum）

課程內容**沿用 `prompting-crystal.html` 裡的資料，但只取內容、丟掉水晶視覺**。
該檔的 `<script>` 內含以下可直接抽出的資料結構：

- `DATA` — 15 個主題、68 條技巧（每條含 `t` 標題、`tip` 說明、`ex` 範例、`note` 模型差異、`v` 適用廠家、`src` 官方出處）。
- `COMPARE` — 各廠差異對照矩陣。
- `BUILDER` — Prompt 組裝積木（角色／任務／脈絡／few-shot／CoT／格式／護欄／自我檢查）。
- `BEFOREAFTER` — 弱→強 prompt 對照範例。
- `SOURCES` — 四廠官方文件出處總表（共 24 個連結）。

**第一步工作**：把這些抽成乾淨的 `src/data/curriculum.json`（含 techniques、groups、vendors、sources、challenges），之後遊戲只讀 JSON。
既有的 5 大主題分群（撰寫基本功 / 示範與推理 / 脈絡與長文 / 流程與代理 / 角色與參數）＋工具站，可直接對應到**世界的區域**。

> **鐵則：技巧內容與出處一字不改地保留正確性；圖鑑每條都要能點到原始官方連結。**

---

## 關卡與評分引擎（Challenge & Rubric — 離線核心）

這是「低成本、離線、可玩」的關鍵。**不需要呼叫 LLM 也能判定 prompt 好壞。**

每個 challenge 用資料定義：

```jsonc
{
  "id": "gate-of-clarity-01",
  "region": "foundations",
  "teaches": ["clarity", "format"],        // 對應 technique id
  "scenario": "守門人聽不懂你的請求，除非你把要求講得夠具體。",
  "clue": "試著明確指定『輸出格式、長度、風格』。",
  "rubric": [                               // 離線檢查：技巧是否『出現』，不是比對固定字串
    { "check": "specifiesFormat", "weight": 2, "hint": "指定輸出格式（表格 / 條列 / 一句話…）" },
    { "check": "hasConstraint",   "weight": 1, "hint": "加一個可量化的限制（例如『3 句話』）" },
    { "check": "positiveFraming", "weight": 1, "hint": "說『要做什麼』而非只說『不要』" }
  ],
  "pass": 3,                                // 達到分數即過關；更高分 → 更高評價
  "source": "https://ai.google.dev/gemini-api/docs/prompting-strategies"
}
```

- **檢查器（checks）是一組可重用函式**：`hasRole`、`hasFewShot`（偵測 example/範例結構）、`specifiesFormat`、`hasConstraint`、`positiveFraming`、`hasDelimiters`、`asksToVerify`、`groundsInContext`… 用關鍵字 / 正則 / 結構偵測，給**部分分數＋提示**。
- **反作弊**：判定「技巧是否被運用」而非死背字串；空泛亂寫拿不到分。
- **選配進階模式**：玩家可自填 API key，把 prompt 真的送去 LLM、用另一段 rubric prompt 評「輸出」品質。**這是加分模組，核心迴圈永遠不依賴它。**

---

## 進度、升級與搜集（Progression & Collection）

- **經驗 / 等級**：解關得 XP、升等；等級或前置技巧達標才解鎖新區域（soft gating）。
- **技巧＝能力**：解鎖一個技巧後，Prompt 主控台就多一個對應的輔助（例如解鎖 few-shot 後可插入 example 積木）——**學到的東西立刻變成變強的工具**。
- **圖鑑（Codex / 搜集）**：68 條技巧的收集冊，收齊一個區域 → 該區「精通」；每條可展開看說明、範例、官方出處。
- **廠家徽章**：完成標記某廠的關卡累積該廠徽章（OpenAI / Anthropic / Google / xAI），四廠全收集 = 隱藏成就。
- **評價制**：每關可重寫拿 S/A/B/C，鼓勵回頭精進，增加重玩與學習深度。

---

## 存檔與重置（localStorage）

- 進度存在 **localStorage**，key 命名空間 `promptasy.v1.*`（改名前是 `promptarcade.v1.*`，`load()` 會自動搬過來），資料含版本欄位以利未來遷移。
- 存：等級 / XP、已解鎖區域、已收集技巧、各關最佳評價、廠家徽章、設定（音量、選的音樂、畫質）。
- **一鍵重置**：設定頁提供「重置進度、重新學習」，清空存檔並回到起點（要二次確認）。
- 存檔 schema 範例：

```jsonc
// localStorage["promptasy.v1.save"]
{
  "version": 1,
  "xp": 320, "level": 4,
  "unlockedRegions": ["foundations", "reasoning"],
  "collected": ["clarity", "positive", "format", "..."],
  "bestGrades": { "gate-of-clarity-01": "A" },
  "badges": { "openai": 3, "anthropic": 2, "google": 1, "xai": 0 },
  "settings": { "music": "ambient-01", "volume": 0.6, "quality": "high" }
}
```

---

## 技術棧（低成本 / 高美術 / 可離線）

- **建置**：Vite。語言 vanilla JS/TS，不上重框架（遊戲不需要 React 的心智模型）。
- **3D**：three.js。第三人稱角色控制器（WASD／點擊移動）＋跟隨鏡頭；若某風格用 2.5D / 俯視更省更好看也可以。
- **感知美術靠「指導」不靠「量」**：three.js 燈光 ＋ 後製（`EffectComposer`：bloom、vignette、景深、色彩分級）＋ 霧 ＋ 一致的配色 ＋ HDRI 環境光。這是「便宜卻高級」的來源。
- **免費 CC 資產**（標好授權）：角色與動畫用 **Mixamo**；模型用 **Kenney / Quaternius / Poly Pizza**；材質/HDRI 用 **Poly Haven**。優先低多邊形、風格化，降低成本又好統一。
- **音訊**：Web Audio API 或 **Howler.js**；分區背景樂、進出區域**淡入淡出**切換；玩家可切歌／加自己的音樂。音檔放 `public/`，不 base64 內嵌。
- **持久化**：localStorage（見上）。無後端、無帳號。
- **部署**：純靜態（GitHub Pages / Netlify / Vercel 皆可）。

---

## 專案結構（建議）

```
promptasy/
├─ CLAUDE.md                 # 本檔：北極星 + /goal + 變更紀錄
├─ README.md                 # 對外說明（含 SEO 關鍵字，見下）
├─ index.html
├─ package.json
├─ vite.config.js
├─ public/
│  ├─ audio/                 # 分區背景樂
│  └─ models/ textures/      # CC 資產（附 LICENSE 註記）
└─ src/
   ├─ main.js                # 進入點
   ├─ engine/                # renderer、camera、loop、postprocessing
   ├─ world/                 # 區域、地圖、互動觸發區
   ├─ player/                # 角色控制器、跟隨鏡頭
   ├─ challenges/            # 關卡載入 + rubric 評分引擎（離線）
   ├─ prompt/                # Prompt 主控台 UI + 技巧積木
   ├─ progression/           # XP、解鎖、圖鑑、徽章
   ├─ audio/                 # 音樂管理、分區淡入淡出
   ├─ ui/                    # HUD、圖鑑、設定、重置
   ├─ save/                  # localStorage 讀寫 + 版本遷移 + reset
   └─ data/
      └─ curriculum.json     # 從 prompting-crystal 抽出的技巧/群組/出處/關卡
```

---

## 開發護欄（Agent Working Agreement）

> **世界的規則寫在 [`WORLD.md`](./WORLD.md)**（世界觀、視覺調性、互動文法、場景敘事原則、命名規範、效能與碰撞的硬規則）。
> 動到世界內容（場景、道具、互動、文案）之前先讀它，做完照它最後一節的**維護檢查表**逐條過一遍。本檔的護欄仍優先於其中的任何美學主張。

**只有這幾條不可妥協，其餘方向自由：**

1. **學習優先**：任何炫技都不能犧牲「玩家真的學到 prompt 技巧」。
2. **內容正確且附出處**：技巧說明與 rubric 判定忠於官方文件；圖鑑每條可點到原始連結；不得杜撰技巧或來源。
3. **核心迴圈可離線**：不靠 API key 也能玩、能被評分。真 LLM 模式只能是選配。
4. **進度可存可重置**：localStorage 存檔、設定頁有「重置重學」。
5. **每次交付可執行**：`npm run dev` 能跑、無 console error、核心迴圈可玩；不半途留下壞掉的建置。
6. **資產授權乾淨**：只用可商用/CC 資產並於 `public/**/LICENSE` 註記來源。
7. **不倒退**：新迭代不得破壞既有可玩內容；大改動前先確認舊功能仍在。

護欄之外——世界觀、美術、關卡形式、敘事、進程曲線——**放手嘗試、允許換方向**。

---

## 每次迭代的完成定義（Definition of Done）

- [ ] 選定的改進端到端完成，且**實際可玩 / 可見**。
- [ ] `npm run dev` 正常、無 console error。
- [ ] 若動到內容：出處連結正確、可點。
- [ ] 若動到存檔：新舊 schema 相容或有遷移；reset 仍正常。
- [ ] 在 `docs/history/CHANGELOG.md` 加一行：做了什麼、下一步建議。

---

## 工程 Harness（開發與驗證流程 — v1 Phase 1–34 ＋ curriculum v2 磨出來的做法）

> 這是本專案實際運轉 40+ 個 phase 的工作流程。任何 AI 代理（Claude Code / Codex / 其他）接手時照這套走；
> 同一份流程也放在repo 根目錄的 `AGENTS.md`。

### 每個 Phase 的節奏

1. **讀北極星**：先讀本檔（護欄）＋ `docs/history/CHANGELOG.md`（最後幾條）與 `WORLD.md`（互動文法、擺放規則、效能與碰撞硬規則、29 項維護清單）。
2. **實作**：一個 phase 一個明確目標，端到端做完。動到玩家看得到的中文字串 → **一定要重跑 `npm run fonts`**（語料指紋測試不過就是在提醒你這件事）。
3. **驗證**（見下方測試策略）。
4. **收尾**：在 `docs/history/CHANGELOG.md` 加一行（繁體中文：做了什麼＋下一步建議）→ commit ＋ push。
5. **絕不碰**：使用者的 dev server（port 5175）與 `vite.config.js`；自己開的測試伺服器用別的 port、結束時要清乾淨（含整個 process group，不留孤兒 Chrome）。

### 測試金字塔（由快到慢）

| 指令 | 內容 | 耗時 | 什麼時候跑 |
|---|---|---|---|
| `npm run test:rubric` | 8 萬+ 斷言：評分引擎、資料完整性、出處健檢、碰撞審計、中文掃描、字型語料指紋、存檔遷移 | ~1 分 | **每次改動都跑**（最便宜的安全網） |
| `npm run test:playtest` | 每關「照提示一定過得了」的門檻：範例解 ≥A、快速填入必過、弱起手必不過、誤判迴歸案例 | ~10 秒 | 動到關卡資料 / 檢查器時 |
| `npm run build` | Vite 建置 | ~2 秒 | 每次改動都跑 |
| `npm run test:e2e` | 3,300+ 項無頭瀏覽器實玩（走路、序章、刻碑、過關、分享…） | **15–20 分鐘**（此機為 SwiftShader 軟體渲染 ~200ms/幀） | 大改動、動到互動流程時 |

### 測試策略（重要 — 這是成本控制的核心）

- **先問再跑**：如果這次改動**項目不多**（純文案、單一元件樣式、資料微調…），先詢問使用者要「全跑 / 只跑快的（rubric＋build）/ 不跑」，不要預設把 15–20 分鐘的 e2e 跑下去。使用者明說「不用跑測試」就照辦（但 rubric＋build 這種十幾秒的快檢通常仍值得跑，除非連這個也被排除）。
- **不重複驗證**：實作交給 subagent 時，subagent 跑過全綠的 e2e，orchestrator **不要再跑一次完整 e2e**——只做快速驗證（rubric ＋ build ＋ curl dev server 確認 200）。
- **已知 flaky**：e2e 有少數「動畫時序類」斷言（拖曳、火盆亮度、風鈴擺動）在軟體渲染下偶發失敗——失敗清單**只有**這幾條時重跑一次即可，不要追；若要根治，把斷言改成輪詢式（poll until），不要用固定 sleep 對齊牆鐘時間。
- **測試要防「空泛通過」**：幾何/版面斷言要先確認元素真的可量測（曾發生在錯誤的幕次量到 0×0 而全部空過）；新增功能的斷言先讓它失敗一次再讓它通過。

### 慣例與地雷

- **Subagent 分工**：大型實作交給 subagent（一個 phase 一個 agent、附完整 brief：現狀、目標、驗證要求、禁區）；研究類（抓文件）可多個並行，但**寫程式的不要並行**（會互踩檔案）；並行 agent 一律指定「不要碰 CLAUDE.md」，changelog 由 orchestrator 統一補。
- **中文字串 → `npm run fonts`**：CJK 子集是掃描全部 `src/**` 與 `src/data/*.json` 的語料切出來的；漏跑會被指紋測試攔下。
- **內容正確性（護欄 2）是紅線**：`curriculum.json` 一個位元組都不能動；遊戲自撰的翻譯/教學一律放獨立的 `authored: "game"` 資料層，並附真實官方連結；官方文件過時要用「時代註記」層標注，不改原文。
- **音檔後製慣例**：BGM 統一 -20 LUFS、SFX 峰值 -6 dBFS、AAC(m4a) 進 `public/audio/`，授權逐檔登記 `public/LICENSE.md`；檔案缺席時合成音自動後備（離線護欄）。
- **e2e 的埠**：測試 harness 用自己的 port（5198/5199/9333…），跑完殺掉整個 process group；殘留的無頭 Chrome 會佔 CDP 埠讓下一輪測試接錯瀏覽器。

---

## 路線圖（Roadmap — 可調整）

- **M0 內容抽取**：把 prompting-crystal 的資料轉成 `curriculum.json`（技巧＋出處＋分群）。
- **M1 可玩骨架**：一個區域、可移動角色＋鏡頭、一個 challenge、Prompt 主控台、離線 rubric、過關回饋、localStorage 存檔＋reset。
- **M2 進程與搜集**：XP／等級、圖鑑、區域解鎖、廠家徽章、評價制。
- **M3 內容鋪滿**：5 大區域對應 15 主題、覆蓋 68 技巧，每區數個 challenge。
- **M4 美術與氛圍**：後製、燈光、資產、轉場——把「感知質感」拉起來。
- **M5 音樂與手感**：分區配樂＋淡入淡出、移動/鏡頭/回饋節奏打磨。
- **M6 打磨與選配**：成就、教學引導、（選配）真 LLM 評分模式、無障礙、行動裝置。

> 路線圖是建議不是枷鎖；哪個環節投報率最高就先做哪個。
>
> **狀態（2026-08）**：M0–M6 已全部完成並發版 v1.1（curriculum v2：12 區／142 關／130 技能）。
> 尚未做的方向見 `docs/history/CHANGELOG.md` 各條「下一步建議」——最大缺口是**行動裝置**（觸控搖桿、720px 以下版面）與英文介面。

---

## 非目標（Non-Goals）

- 不做多人連線、不做帳號系統、不做後端資料庫。
- 核心迴圈不強制接 LLM API。
- 不追求 3A 級寫實美術；追求的是**風格化 ＋ 高感知質感 ＋ 低成本**。
- 不為了畫面犧牲「學到東西」。

---

## SEO（給 README 與網站 head）

- `<title>`：`Promptasy — Learn Prompt Engineering by Playing`
- meta / repo 描述：`A browser game to learn prompt engineering by playing — explore a world and solve challenges by writing prompts. Techniques from OpenAI, Anthropic, Google & xAI, each cited.`
- GitHub topics：`prompt-engineering` `learn-prompting` `game` `gamification` `llm` `education` `threejs` `webgl`
- 鎖長尾詞：`prompt engineering game`、`learn prompt engineering by playing`、`interactive prompt engineering practice`。

---

## 指令（How to run）

```bash
npm install
npm run dev      # 本機開發
npm run build    # 靜態輸出到 dist/
npm run preview  # 預覽 build 結果
```

---

## 變更紀錄（Changelog）

完整開發紀錄已分層搬到 **[`docs/history/CHANGELOG.md`](./docs/history/CHANGELOG.md)**（v1 Phase 1–34、curriculum v2 Phase 0–J、v1.1 發版與其後的所有細修）。

- **每次迭代仍要記一行**：做了什麼＋下一步建議，繁體中文——只是寫到 `docs/history/CHANGELOG.md` 最底，不再寫在本檔。
- 接手時先讀該檔**最後幾條**，就知道專案走到哪、下一步建議是什麼。
- 歷屆 goal / prompt 與達成效果的對照表：[`docs/history/prompts.html`](./docs/history/prompts.html)。

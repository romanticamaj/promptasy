# Promptasy 課程 v2 長時間實作計畫

> 狀態：**ready for execution**  
> 規劃基線：2026-08-01，`dev` @ `86b2d47`  
> 主規格：`docs/design/curriculum-v2.md`；工程護欄：`AGENTS.md`、`CLAUDE.md`、`WORLD.md`

## 0. 終點與完成條件

把目前 27 關／68 技巧／5 區，逐步演進成 **130 座一關一技巧的教學神廟＋12 座應用關／12 區**，保持純靜態、離線評分、官方來源可追溯、鍵盤完整可玩、舊存檔相容、既有內容不刪除。

全案完成需同時成立：

- 130 技能各有且只有一座教學神廟；每關 1 主檢查＋最多 1 地基檢查。
- 12 區與 mission graph 上線；130 教學神廟＋12 應用關可玩。
- 14 種型式的規劃完成，其中 K 期 `disclose` 為選配；未做時必須明確標成選配未實作。
- 59 個新檢查器只按需要實作，全部有 good／weak／bad、反作弊及中英 fixture。
- `src/data/curriculum.json` 保持 byte-identical；新內容有獨立 authored/sourced 資料層。
- `promptasy.v1.save` 舊存檔可讀、reset 正常；新增欄位全 additive 且有 `normalize()` 預設值。
- 快檢、playtest、build 全綠；所有新增互動有 e2e，console error 為 0。
- 每一期完成後更新 `CLAUDE.md` changelog、commit、push `dev`；只有 release gate 通過才合入 `main`。

## 1. 長時間執行節奏

每一期固定走同一個 loop：

1. 重讀本檔、`findings.md`、`progress.md`，確認當期唯一目標。
2. 先列當期資料 manifest、受影響檔案與 acceptance tests；新功能測試先觀察紅燈一次。
3. 實作一個可完整驗收的垂直切片；寫程式不並行，研究才可並行。
4. 中文字串有變更就先跑 `npm run fonts`。
5. 依測試矩陣驗證；不碰 port 5175，自己的 server/process group 全部清乾淨。
6. 逐條過 WORLD 29 項維護清單中適用項目。
7. 更新 `progress.md`／`findings.md`、`CLAUDE.md` changelog，commit 並 push `dev`。

任何錯誤記進本檔；同一錯誤不原樣重試。連續三種方法仍無法前進才向使用者報阻塞。

## 2. 先解決的三個規格矛盾

### D1 — 27 關遷移數字

`HANDOFF.md` 寫 4 保留／21 改造／2 應用，`curriculum-v2.md` 逐表小計是 **5／20／2**。以逐關表為準，Phase A 前用機器產生 27 行 manifest，並補文件勘誤；不憑摘要數字改資料。

### D2 — `teaches` 兼具教學與收集語意

目前 `teaches` 同時控制 UI 教學目標、官方來源、通關收集與 68 技巧覆蓋；直接縮成一條會讓尚未搬家的技巧暫時不可收集。

推薦做法：

- 新增單一 `primaryTechniqueId`，Phase A 立刻讓 UI／rubric／教練只顯示主技巧。
- 暫時保留舊 `teaches` 作相容收集清單，但更名路徑與測試明確標成 legacy；不得在畫面上假裝一次教了多條。
- B–J 每當新神廟接手一條技巧，就從舊關的 legacy list 移走；到 J 結束完全移除相容層。
- 已完成舊關的存檔保留既有 `collected`，不回收、不倒退。

### D3 — pass 降權公式

設計同時寫「每關 pass -0.5」與「總權重 50% 規則不變」，兩者不是完全等價。Phase A 先輸出 literal `-0.5` 與依總權重重算兩份矩陣。推薦遵照明確遷移規格採 **pass -0.5**，再以「弱起手仍不過、快速填入必過、sample ≥ A」作實際安全門，而非只看百分比。

## 3. 分期路線

### Phase 0 — 基線與契約鎖定

狀態：`pending`

產出：

- 產生 27 關 migration manifest：主技巧、主檢查、地基檢查、移除／降權項、before/after total/pass、`teaches` 相容處置。
- 記錄目前 challenge/flow/kind/checker/region/save/performance 基線，修正文件內已漂移的數字。
- 把 `curriculum.json` hash 加成不可變測試；新增資料不得寫回它。
- 跑一次未修改產品碼的 baseline：`test:rubric`、`test:playtest`、`build`；e2e 是否跑由使用者依成本策略決定。

主要檔案：`scripts/test-rubric.mjs`、`scripts/playtest-verify.mjs`、新建 migration manifest（建議 `docs/design/curriculum-v2-migration.json`）。

Exit：27 關逐行決策無缺漏；D1–D3 有可執行答案；baseline 結果寫進 `progress.md`。

### Phase A — 重複度手術

狀態：`pending`

目標：現有 27 關在玩家面只教一件事，先消除重複感，不新增題型。

變更：

- `src/data/challenges.json`：27 關 `assignsTask` 降到 0.5 且標成地基；6 關移除／替換非主題 `specifiesFormat`；5 關 `hasDelimiters` 2→1；pass 依 D3 調整；加入 `primaryTechniqueId`。
- `src/data/flows.json`：刻印段落與 feedback 同步收斂，不能 rubric 已移除但第三幕仍反覆教它。
- `src/prompt/console.js`、`src/challenges/content.js`、`src/progression/progression.js`：拆開主教學目標與 legacy collection 語意。
- `scripts/test-rubric.mjs`：新增「恰好 1 主檢查、地基 ≤1、assignsTask 不列為主教學、fractional pass 正確顯示」invariants。
- `scripts/playtest-verify.mjs`：27 關 sample ≥ A、全選對必過、weak starter 必不過、已知誤判不回歸。

Exit：27 關全部符合 C1；玩家看到的教學重點只有一條；舊存檔與已收集技巧不減少；rubric＋playtest＋build 全綠。

### Phase B — v2 catalog bridge＋`fix`／`spot`＋foundations 14

狀態：`pending`

先做 catalog bridge：

- 新增 `src/data/skill-codex-v2.json`：130 玩家面技能的 id、group、tier、先修、`masterRefs`、官方 source metadata、`authored: "game"` 說明。
- 新增 `src/data/regions-v2.json`：12 區定義與 mission graph；舊五區 id 不變。
- 新增單一 catalog loader（建議 `src/challenges/catalog.js`）把舊 68 與 v2 layer 合成 runtime catalog；`curriculum.json` hash 不變。
- 調整 `main.js`、`content.js`、progression、codex、ranks、settings、sharecard 與測試，停止硬編碼 68／5。

再做題型與內容：

- `src/prompt/fix.js`：預填弱稿、可點掉／替換片段、純鍵盤 roving focus、即時預檢、Esc 還原。
- `src/prompt/spot.js`：句子石籤 toggle、方向鍵＋Enter、正確／漏選／多選回饋、不扣分。
- `console.js` 擴 `FLOW_KINDS`、label、board lifecycle、fallback；舊 flow 缺 kind 仍是 choice。
- `flows.json`／`challenges.json` 新增 foundations 十座／改造既有關；補真實來源、位置、四拍與主檢查。
- `styles.css` 與 e2e：鍵盤、焦點、aria-live、reduced-motion、窄 viewport 可量測。

Exit：foundations 有 14 教學神廟；`fix`／`spot` 各至少一條先紅後綠的完整 e2e；舊三 kind 行為不變；fonts＋rubric＋playtest＋build＋e2e 綠。

### Phase C — `induct`／`tradeoff`＋reasoning 15

狀態：`pending`

- 以 choice 變體實作推規與雙面碑，不另造重型架構。
- 正解可依模型卡／素材加權，但兩個可行答案都必須收到誠實回饋。
- reasoning 補 10 座；few-shot 的規則歸納先做最小垂直切片。
- 新 checker 只開本期所需，全部有反作弊 fixture。

Exit：reasoning 15 座、同區不得連三座同型、推規的第四例真的驗證規則、tradeoff 不把取捨教成假通則。

### Phase D — `constraint`＋grounding/config 補齊＋行動版還債點

狀態：`pending`

- 把即時預檢升格為 `constraint` 舞台，不複製 rubric 引擎。
- grounding 與 config 各補到 12 座，完成既有五區課程遷移。
- 此期結束設一個 release checkpoint：評估並實作 ≤720px 的四幕與已上線 kinds 基本版面；不一定做世界觸控移動，但不能讓新題型 UI 無法操作。

Exit：既有五區均符合一關一技巧；constraint 完全資訊；鍵盤與窄 viewport 都走得完；舊 27 關遷移相容層完成第一次清理。

### Phase E — 量器坊 `forms`（新地形）14 座

狀態：`pending`

- 新增第 6 區地形、地標、路網、石座與 soft gate；沿用既有 kind，避免地形與新題型同一期爆量。
- runtime catalog／progression／codex 支援第六區；回答語言缺口以 `system-uses` 的一拍補上，除非 master list 先有獨立可追溯條目。
- 世界成本實測，不採文件舊數字；新地標最多 1 盞實體光，其餘 emissive。

Exit：14 座可玩；碰撞／coverage／淨空／三角形／光源預算全過；舊五區無退化。

### Phase F — 契約鍛冶場 `toolcraft` 11＋護欄崗 `wards` 5

狀態：`pending`

- 正西新地形＋東北加建；最大化沿用 workshop。
- 補工具描述、時機、順序、缺參數、權限、prompt injection 等 checker。
- 安全題不把 prompt 文字宣稱成真正安全邊界；明確教輸入通道、最小權限與 HITL。

Exit：兩區 16 座可玩；安全敘述有官方來源；不新增不必要光源；所有 workshop 鍵盤路徑全綠。

### Phase G — `multi`＋校驗場 `refinery` 11＋orchestration 收尾

狀態：`pending`

- 第三幕支援兩輪／多輪，但仍共用同一 rubric、手掌印與不失敗文法。
- 新增預寫中間輸出資料層，全部標 `authored: "game"`，不可偽裝成模型真實輸出。
- 校驗場加建；draft→review→refine、矛盾修復、eval、自評有真正的第二輪體感。

Exit：刷新頁面／切幕／切 mode 不會丟失或串錯輪次；multi 至少覆蓋成功、錯誤、Esc、reduced-motion、鍵盤 e2e。

### Phase H — `sim`＋減法之庭 `frugality` 7

狀態：`pending`

- 先做 3 座 spike（temperature、effort、action budget），每座 3 檔、共 9 段離線樣本；體感驗證後才擴。
- 離線樣本另檔、`authored: "game"`、帶模型／時代條件，絕不暗示為即時 LLM 結果。
- 減法之庭加建；改造火力熔爐與刻度儀之室。

Exit：斷網完全可玩；旋鈕各檔差異可讀且不冒充普遍真理；sample 數量受 schema/test 約束。

### Phase I — 觀象臺 `sight` 8（可獨立延後）

狀態：`pending`

- 新增小型地形與 8 座多模態提示神廟；遊戲仍只評 prompt 結構，不假裝真的看圖／生圖。
- 圖片／影片素材若新增，逐檔記授權；畫面不依外部 CDN。

Exit：8 座離線可玩；素材授權完整；新地形通過 WORLD 效能與碰撞預算。

### Phase J — 分歧之廳＋12 應用關＋大師層

狀態：`pending`

- 高原加建 divergence 9 座與 `reverse`；依模型卡讓答案翻面，來源並排可點。
- 上線 12 區應用關；第二幕跳過，只用已學技巧動態組 rubric。
- 新增 `seals[]` 與大師層印記，save additive；既有 finale 維持四廠條件，新廠只做支線。
- 移除 D2 的 legacy teaching/collection bridge，完成 130 技能 runtime 遷移。

Exit：130 教學＋12 應用全數可玩；130 技能每條只被教一次且平均有複習；舊 finale 不回退；全 suite 綠。

### Phase K — `disclose` 拾遺（選配）

狀態：`optional`

- 僅挑 2–3 座最適合的 grounding 神廟做素材背包與世界拾取點。
- 新 save 欄位 additive；未撿齊只提示，不失敗、不封死。
- 若成本／行動版／存檔風險不值得，正式記錄為未採用，不影響 130 技能完成。

Exit：跨世界素材有 reload/reset/e2e；或有一份明確的「不實作」決策記錄。

## 4. 測試矩陣

| 變更 | 必跑 | e2e |
|---|---|---|
| 文件／manifest | rubric＋build（除非使用者連快檢也排除） | 先問，通常不跑 |
| challenges／flows／checker | fonts（有中文）＋rubric＋playtest＋build | 依影響面；改互動流程則必跑 |
| 新 kind／四幕／鍵盤／save | fonts＋rubric＋playtest＋build | 必跑；新斷言先紅一次 |
| 新地形／碰撞／效能 | fonts＋rubric＋playtest＋build＋collision/perf audit | 必跑 |
| 全案 release | fonts＋rubric＋playtest＋build | 完整 e2e；只對已知動畫 flaky 允許一次重跑 |

驗收不只看「全綠」：幾何先證明可量測；e2e 用 poll-until，不用固定 sleep；subagent 若已完整跑過，orchestrator 不重跑，只做快檢＋HTTP 200。

## 5. Release checkpoints

- **R1（A）**：重複度手術在 dev 穩定；是否上 main 取決於 legacy collection 體驗是否無退化。
- **R2（D）**：既有五區 v2 化完成，適合第一次公開發布。
- **R3（F）**：8 區、工具與護欄線完成。
- **R4（J）**：12 區／142 關／130 技能正式完成。
- **R5（K optional）**：探索與關卡真正接起來。

每個 release 都需：完整 e2e、零 console error、來源抽查、存檔 migration/reset、README 數字與真實截圖更新，再由 `dev` 合入 `main` 與部署站。

## 6. 已知風險

| 風險 | 控制方式 |
|---|---|
| 59 checker 失控 | 只按期開、共用結構 parser、每個 checker 固定 fixture 契約 |
| 550 段左右新文案 | 一區一批；masterRefs→官方來源→authored 文案→人讀驗收四道門 |
| 新 kind 爆炸 | 每期最多 1–2 kind；共用 board interface、rubric、palm、focus contract |
| 68→130 破壞 runtime | 先 catalog bridge；所有固定數字改由 runtime catalog 推導 |
| 舊存檔／finale 回退 | additive normalize；四廠 finale 保持；舊 collected 不回收 |
| 行動版債變貴 | D 後設還債 checkpoint；每個新 kind 至少窄 viewport 可量測 |
| 文件與實際數據漂移 | 所有數字由腳本重算，文件只作設計意圖，不作 runtime 事實 |
| 官方來源變動 | 實作當期只查官方來源；找不到就排除／dated note，不用二手補洞 |

## 7. 規劃工作完成狀態

- [x] 讀取 `CLAUDE.md`、`WORLD.md`、`HANDOFF.md`
- [x] 讀取 curriculum v2、level references、gap analysis 與 master list 關鍵追溯／健康度
- [x] 盤點 repo 資料、runtime、測試與 git 基線
- [x] 建立 A–K 檔案級長時間實作計畫、驗收門、測試矩陣與 release checkpoints

## 8. 錯誤紀錄

| 錯誤 | 嘗試 | 處理 |
|---|---:|---|
| Windows UNC 執行 Git 觸發 dubious ownership | 1 | 不改 global config；Git 改走 WSL Linux 路徑 |
| PowerShell 展開 bash `$f` 導致空檔名 | 1 | 改用 PowerShell 明確列檔 |
| WSL 無 `rg` | 1 | 改用 `find`／`Get-ChildItem` |
| WSL 無 `node` | 1 | 改用 Windows Node |
| 首次假設 JSON 根為陣列 | 1 | 先讀 schema，再使用 `.challenges`／`.flows` |
| Windows `npm` 經 `cmd.exe` 無法使用 UNC cwd，錯到 `C:\Windows` 找測試腳本 | 1 | 不重跑相同命令；改以 Windows Node 直接執行測試腳本與 Vite CLI |
| rubric baseline 有 12 個既有開場斷言失敗（entrygate/title 舊結構） | 1 | 規劃文件未觸及產品碼；不擴大 PR 修復，於 PR 明列 16,490 pass／12 fail，留 Phase 0 重建 baseline |
| Windows Node 搭配 Linux `node_modules` 執行 Vite，缺 `@rollup/rollup-win32-x64-msvc` | 1 | 不刪 lockfile/node_modules、不改依賴；先找 WSL 既有 Node，沒有則標記 build 為環境未執行 |
| PowerShell 再次展開 bash status 變數，合併命令結尾無法回傳正確 code | 1 | 不再依賴合併變數；以各工具明確輸出判定：rubric 12 fail、Vite build passed |

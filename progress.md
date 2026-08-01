# Progress — Promptasy 長時間收尾

## 2026-08-01

- 啟用 `planning-with-files` 工作流。
- 確認三份規劃檔原先不存在並建立。
- 記錄 Windows UNC Git dubious ownership 問題；後續改走 WSL。
- 當前：Phase 0，準備完整讀取三份專案指引與交接文件。
- 已讀完 `HANDOFF.md`，確認 planning 首要交付為 Phase A（必要時含 B）的檔案級實作計畫、測試影響面與驗收條件。
- 已透過 WSL 成功確認 Git 狀態：`dev...origin/dev`，僅三份規劃檔未追蹤。
- 已讀 `CLAUDE.md` 北極星、護欄、DoD、工程 harness 與最近變更；確認 Phase A 不能犧牲來源正確性、離線核心、存檔相容或既有可玩內容。
- 已完整讀取 `WORLD.md`，萃取新題型的鍵盤、四幕、不失敗、來源、效能、碰撞、存檔與 29 項維護契約。
- 文件盤點首次因 PowerShell 提前展開 bash `$f` 失敗，已記錄並改用不含巢狀 shell 變數的讀法。
- 已讀 `curriculum-v2.md` §0–§2 與 130 技能總表，確認 A–K 計畫必須服從 C1–C9 與「既有五區不動地形」的分區策略。
- 已讀完 `curriculum-v2.md` 的神廟規格、27 關遷移、進程、A–K 路線、59 檢查器與已知未解問題；發現 HANDOFF 與主設計的遷移數字有一處矛盾，列為 Phase A 前置稽核。
- 已完整讀 `level-design-references.md`，並讀 `gap-analysis.md` §摘要與過時內容區；計畫將把 P1–P15 轉成每期驗收門，而不是只列功能清單。
- 已讀完 `gap-analysis.md`，並檢查 master list 的索引、來源健康度、68 技巧對照與 2026-08-01 稽核；接下來轉入實際 repo 結構與資料契約盤點。
- 已確認 package scripts 與 AGENTS.md 一致；WSL 缺少 `rg` 的搜尋錯誤已記錄，後續改用既有工具。
- 已列出核心資料／引擎／測試檔與近期 commits；WSL 也缺 Node，資料統計改走 Windows Node。
- Windows Node 可執行，但 JSON 根節點不是陣列；錯誤已記錄，下一步先確認 schema 再統計。
- 已用正確 schema 重算 27 關資料，確認舊分析基線已漂移，並識別 `teaches` 與小數 pass 是 Phase A 的兩個未寫明契約。
- 已盤點 runtime 對 curriculum、flows、progression 與測試的耦合；確認 130 技能需要先做 byte-safe catalog merge，且大量固定數字測試要分期改成 invariant。
- 完成 `task_plan.md`：A–K 路線、Phase 0 前置契約、檔案級改動、逐期 exit criteria、測試矩陣、release checkpoints 與風險控制均已寫入。
- 本輪只新增規劃文件，未修改產品程式碼、未更新 `CLAUDE.md` changelog、未 commit/push。
- 本輪未跑 rubric/build/e2e；HANDOFF 宣稱的綠燈僅視為交接資訊，Phase 0 會重新建立已驗證 baseline。
- 開 PR 前嘗試快速驗證；Windows `npm` 因 UNC cwd 限制錯到 `C:\Windows`，屬環境啟動錯誤，已改用等價的 Node/Vite 直接入口重驗。
- `node scripts/test-rubric.mjs` 實跑結果：16,490 通過、12 失敗；失敗全在既有 entrygate/title 開場斷言，與本 PR 三份 Markdown 無交集，未擴 scope 修產品碼。
- Windows Node 無法用 Linux `node_modules` 建置，Rollup 缺 Windows native optional dependency；未刪除或重裝使用者依賴，改查 WSL 是否已有可用 Node。
- 找到 WSL 既有 Node v24.18.0 並直接執行：Vite build 通過（68 modules，1.81s）；rubric 再次確認 16,490 pass／12 個既有開場斷言失敗。

## 2026-08-01 · Phase 0（基線與契約鎖定）· `done`

### 做了什麼

1. **27 關遷移 manifest**：新增 `docs/design/curriculum-v2-migration.json`（`authored: "game"`）。
   由**現況** `src/data/challenges.json` ＋ `curriculum-v2.md` §3 神廟總表／§4 遷移表逐關比對機器產生（產生器是一次性腳本，不進 repo）。
   27 行，每行含 `disposition`／`v2SkillId`／`primaryTechniqueId`(＋標題)／`mainCheck`(＋是否新檢查器＋過渡用 `interimMainCheck`)／
   `foundationCheck`／`checksToRemoveOrDownweight`(分 `phase: A` 與 `post-A`，含 `hold` 裁決)／
   `passBefore`→`passAfter`／`passAfterByWeightRule`／`totalWeightBefore`→`totalWeightAfter`／`teachesLegacy`／`designNote`。
   檔頭 `decisions` 區塊用散文寫清楚 D1／D2／D3 的裁決與遷移路徑，`conflicts` 逐條記下 8 個文件矛盾與處置。
2. **D1／D2／D3 定案**（細節寫進 `findings.md`）：5／20／2；`primaryTechniqueId` ＋ `teaches` 降為 legacy；literal −0.5 ＋ 三道 playtest 安全閘。
3. **12 個既有失敗斷言重建**（不是刪掉，是改成斷言「今天的設計」）：見下方逐條。
4. **`curriculum.json` byte-immutability 測試**：sha256 `53b0ca60…39062` 釘進 `scripts/test-rubric.mjs`，
   失敗訊息寫明「必須 byte-identical——新內容走 authored 資料層」。實測把常數改壞 → 紅；改回 → 綠。
5. **manifest 驗證測試**：新增 `▸ 課程 v2 遷移契約（Phase 0）` 區段，含 27 行完整性、id 與順序對齊、
   處置分佈 5/20/2、`primaryTechniqueId` 必須是真的技巧 id 且不撞號、主檢查恰好 1 條且不得是 `assignsTask`、
   地基 ≤1、新檢查器必須出現在**由 `curriculum-v2.md` §7.4 即時解析出來**的 59 個清單裡（不手抄副本）、
   `passAfter = passBefore − 0.5`、降權清單每一條都指得到現況真的存在的檢查與權重、manifest 不自帶官方連結（護欄 2）。
   實測把某關的 `passAfter` 改壞 → 紅；改回 → 綠。

### 這次實跑的 baseline（全部本次執行，非引用）

| 指令 | 結果 |
|---|---|
| `npm run test:rubric`（修復前） | ✗ 16,490 pass／**12 fail**（全是 Phase 34.5 改版後沒跟上的開場斷言） |
| `npm run test:rubric`（修復後、未加新測試） | ✓ 16,504 個斷言 |
| `npm run test:rubric`（含 Phase 0 新測試） | ✓ **17,479 個斷言，全綠** |
| `npm run test:playtest` | ✓ **226 個斷言**（未改動，這就是 baseline） |
| `npm run build` | ✓ 68 modules／**1.82s**；`index.html` 4.08 kB、CSS 110.50 kB（gzip 21.26）、JS 1,309.47 kB（gzip 382.34） |
| `npm run test:e2e` | **本期跳過（決策，見下）** |

**e2e 決策**：Phase 0 只動測試與文件（`scripts/test-rubric.mjs` ＋ 新 manifest ＋ 三份規劃檔），
**零產品碼改動**，依 `task_plan.md` §4 測試矩陣「文件／manifest → rubric＋build」這一列，本期不跑 15–20 分鐘的 e2e。
第一次 e2e 排在 **Phase B 的互動工作**（`fix`／`spot` 新題型，新斷言先紅一次）。

### 資料基線（現況實測，取代文件裡的舊數字）

- `challenges.json`：**27 關**、**118 條 rubric**、22 個檢查器被用到；區域分佈 foundations 6／reasoning 5／grounding 5／orchestration 6／config 5。
- `flows.json`：**27 份流程**，kind 分佈 `choice` 24／`order` 2／`workshop` 1。
- 檢查器出現關數（前段）：`assignsTask` 27、`specifiesFormat` 14、`hasDelimiters` 12、`hasConstraint` 11、
  `groundsInContext` 6、`explainsWhy` 5、`asksToVerify` 5、`hasFewShot` 4、`givesOutForUncertainty` 4；
  前三名合計 53/118 = **44.9%**（`gap-analysis.md` 的 49% 是 26 關／106 項那版）。
- `pass` 現況全為整數 3–5；`teaches` 每關 2–4 條。
- `curriculum.json`：68 技巧、75,078 bytes、sha256 `53b0ca60917f763e82aec256bc3dc07cb809e07607415a3907e9e8d408b39062`。
- Phase A 之後（依 manifest）：總權重 4.5–8.5、`pass` 2.5–4.5（首次出現小數門檻，UI 顯示要在 Phase A 一併測）。

### 效能基線（在 node 裡把整個世界蓋起來實測，非引用文件）

| 畫質 | 三角形 | 燈 | mesh | InstancedMesh／實例 | geometry | 碰撞體 |
|---|---:|---:|---:|---:|---:|---:|
| high | 142,664 | 45 | 1,199 | 42 ／ 971 | 527 | 786 |
| low | 80,656 | 32 | 1,177 | 42 ／ 665 | 505 | 564 |

（`WORLD.md` 寫的約 143k／44 盞、`curriculum-v2.md` 風險段寫的 125k／47 盞都已漂移，見 `findings.md` 勘誤表。
穿模稽核與碰撞覆蓋率由 `test:rubric` 內的 `collision-audit.mjs` 跑，本次全綠。）

### 12 個既有失敗斷言 → 今天的設計（逐條）

入場門（Phase 34.5：門上只剩呼吸燈 ＋ 一句話 ＋ sr-only 提示）：

1. `sr-only">或按任意鍵` → 改斷言現行文案 `sr-only">點擊或按任意鍵進入`（兩種操作一起講完）。
2. `.entrygate__hint` 延遲 ≥0.3s（元素已不存在，量到 NaN）→ 改斷言 **`entrygate__hint` 在原始碼與樣式裡都沒有殘留**；
   延遲迴圈縮成現存的兩樣東西（`.entrygate__orb`、`.entrygate__line`），並補一條「門上那顆按鈕不畫 focus 框」。
3. reduce 下 `.entrygate__hint` 仍看得見 → 迴圈改成現存三個類別，並補一條
   「reduce 下 `.title__name` 的 `filter: none` 一起解除模糊（不會停在糊掉的那一幀）」。

標題卡（Phase 34.5：整個名字從模糊裡對焦 ＋ 兩句話一行一行淡入，打字機整組撤掉）：

4. 「兩句話是打出來的（有游標）」→ 改斷言 **`title__typed`／`title__caret` 已整組移除**。
5. 「打字用展開運算子切字元」→ 改斷言兩句話**各自是一個完整節點**（`.title__tag` ＋ `.title__zh`），
   並補一條「中文那句的換行是寫死的 `<br />`」。
6. 「中英各有自己的打字速度」→ 改斷言 **`TYPE_CJK`／`TYPE_LATIN` 常數已移除**。
7. 「中文打得比英文慢」→ 改斷言**揭示節奏由 CSS 延遲決定且遞增**：定位句 1.35s < 中文 2s。
8. 「reduce 下不打字」→ 改斷言 reduce 區塊仍列出 `.title__tag`／`.title__zh`（不靠動畫收尾也看得見）。
9. `function finishTyping()` → 改斷言 **`finishTyping() {}` 只剩相容用的空殼**。
10. `start()` 裡呼叫 `finishTyping()` → 改斷言 `start()` **不再**呼叫它（按下開始就直接離場），
    並補一條「舊 API `isTyping` 永遠回 `false`」。
11. `sr-only">${esc(subtitle)}` → 改斷言定位句本身就是完整的一句（`title__tag">${esc(subtitle)}</p>`，
    螢幕閱讀器不會念到半句話）。
12. `.title.is-ready .title__start { opacity: 1 }` → 改斷言開始鍵**純 CSS 延遲**浮出（2.7s > 中文那句的 2s），
    且 `is-ready` 現在只負責開始鍵的呼吸光。

（斷言總數：入場門段落前後都是 9 條；標題卡段落 14 → 16 條。修復後未加新測試前 16,504，比原本的 16,502 多 2 條。）

### 未做／留給後續

- `scripts/playtest-verify.mjs` 本期未改（Phase 0 不動關卡資料）；Phase A 才加「主檢查唯一、地基 ≤1、小數 pass 顯示」等 invariant。
- 未 commit／push（依指示由 orchestrator 統一做 changelog ＋ commit）；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`。
- 未跑 `npm run fonts`：本期沒有動 `index.html`／`src/**`，字型語料指紋不受影響（rubric 的指紋測試已綠證實）。

## 2026-08-01 · Phase A（重複度手術）· `done`

### 做了什麼

1. **`src/data/challenges.json` 逐關照 manifest 執行**（27 關，零偏離）：
   - `assignsTask` 27 關 1 → **0.5** 並標 `foundation: true`；
   - `hasDelimiters` 只降 `example-hall-11`／`long-scroll-tower-23`（2→1），3 個 `hold`（`postbox-sprite-02`／
     `long-scroll-archive-05`／`thinking-chamber-14`）一分未動；
   - `silent-thinker-13` 的 `specifiesFormat` 直接移除；5 關的 `specifiesFormat` 權重中性替換
     （`subtask-workbench-31`→`decomposesTask`、`draft-review-wheel-32`／`echo-workshop-35`→`asksToRefine`、
     `tool-forge-33`→`definesTools`、`mask-workshop-41`→新增 `hasAudience` 承接 1 分）；
   - `pass` 全部 = `passAfter`（D3 literal −0.5，範圍 2.5–4.5）；
   - 新增 `primaryTechniqueId`（25 條互不重複、2 關應用關 `null`）與 rubric 上唯一的 `primary: true`。
   - 結果：rubric 118 → **113** 條，每關總權重與 manifest 的 `totalWeightAfter` 逐關相符。
2. **`src/data/flows.json` 第三幕收斂**：6 份 flow 不再教已經不計分的東西 —— 5 段格式段落移除
   （subtask／draft／tool／echo／mask）、`silent-thinker-13` 那段整段換成 `reasoning-02` 的「明確成功條件」；
   `mask-workshop-41` 的任務段改寫成「說明…寫給今晚第一次上船的擺渡船員看」讓 `hasAudience` 真的被刻進碑文；
   收起段落後的段落編號一併對齊。27 份 flow **全部選對仍然每一條檢查滿分（27/27 拿 S）**。
3. **顯示層手術**（`src/prompt/console.js`＋`src/styles.css`）：第二幕只放大**一條**刻文
   （主技巧的白話刻文 ＋ 它的神諭原典連結），其餘檢查降成一行「順手會用到」——沒有自己的教學段落、
   沒有自己的原典；第三幕的刻痕對照分成「這一關教的（金色標記）／地基／其他」三種位階，
   側頁籤同樣只有主刻文掛原典。收集仍由 legacy `teaches` 驅動，結算面板改寫成「✦ 順手收進圖鑑」（D2 的 uiRule）。
4. **小數門檻的顯示**：`src/challenges/rubric.js` 新增 `formatScore()`，
   `console.js`／`practice.js` 的進度燈、結果面板、每條檢查的得分與權重全部走它。
5. **測試**：`test-rubric.mjs` 的遷移契約區段從「比對 before」改寫成「比對 after」
   （phase-A 的四種動作逐條驗、**post-A 的一條都不准提前搬**、C1 的主檢查唯一與地基 ≤1、
   rubric 條數 113）；新增「小數門檻顯示 ＋ 一關只教一條 ＋ 收集不倒退」整個區段。
   `playtest-verify.mjs` 新增「示範解答一定做到主檢查、起手壞寫法一定還沒做到主檢查」。
6. **順手修掉 e2e 的既有紅燈**（不是這期弄壞的，見 `findings.md`）：
   (a) `headless-check.mjs` 還在斷言 Phase 34.5 撤掉的打字機標題卡，`[data-typed="tag"]` 為 null
   直接讓整支 e2e 在第 69 個斷言就中斷 —— 照 Phase 0 對 `test-rubric` 的做法改成斷言今天的設計；
   (b) `reloadPage()` 在換頁尾巴上會撞到「Inspected target navigated or closed」讓整支中斷，
   補一次 `readyState === 'complete'` 的輪詢（不是加長固定 sleep）；
   (c) 入場門區段還在量已經移除的 `.entrygate__hint`，`getComputedStyle(null)` 讓最後一段中斷 ——
   改成斷言今天的門面（呼吸燈 ＋ 一句話 ＋ sr-only 提示）；
   (d) 兩條寫死「第 1 / 4 段」的斷言改成由資料段數推導；
   (e) 已知 flaky 家族「拖曳」改成 poll-until（`AGENTS.md` 指定的根治方式）＋ 拖曳前先收掉可能還開著的
   分享卡／圖鑑／設定 ＋ 失敗訊息帶上 `elementFromPoint`；入場門呼吸燈改成等它擺到亮的那一段再取樣。
7. **應用關維持現況**：兩關 `primaryTechniqueId: null`，第二幕就退回 Phase 12 的多條刻文
   （每條各有自己的原典）——「把學過的用出來」不是「一次教四條」。真正的應用關型式等 Phase J。

### 本次實跑

| 指令 | Phase 0 baseline | Phase A |
|---|---|---|
| `npm run fonts` | 未跑 | ✓ 語料 55 檔／CJK **1634** 字／1331.5 KB（指紋測試綠） |
| `npm run test:rubric` | 17,479 | ✓ **17,705** |
| `npm run test:playtest` | 226 | ✓ **263** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 跳過（Phase 0 零產品碼改動） | ✓ **1,811 項檢查全過、零 console error** |

**e2e 的三次歷程（誠實記錄）**：第一次在第 69 個斷言就 `TypeError` 中斷（Phase 34.5 撤掉打字機之後
e2e 一直沒跑過，殘留舊斷言）；修好之後第二次跑到 799 個斷言時又被 `reloadPage()` 的換頁競態中斷；
第三次跑完全程但有 5 條紅（拖曳 3 條、分享取消 1 條、入場門呼吸燈 1 條）——
拖曳那一組另外用獨立 CDP 腳本在同一份工作樹上重現過：把疊在上面的面板收乾淨之後，
同一組滑鼠事件會正確地把石版搬到最上面，所以是「有東西擋住指標」而不是 Phase A 的退化。
第四次（拖曳前先收掉分享卡／圖鑑／設定 ＋ 呼吸燈改成等它擺到亮的那一段）**全綠**。

新測試都先確認會紅：把 `dial-room-43` 的 `primary` 移到別條 → 紅（`主檢查就是 manifest 指定的 mentionsParameters`）；
把進度燈改回裸浮點 → 紅（`沒有把原始浮點數直接塞進畫面`）。

### 未做／留給後續

- **沒有**改任何 rubric 列的 `techniqueId`（`techniqueIdRealign` 是描述欄，不是 Phase A 的動作），
  也沒有改 `challenge.source`；教學面的收斂只走 `primaryTechniqueId` 這一條路。
- `effort-forge-15` 的第二幕教 `params-03`，但通關收集的仍是它自己的 legacy `teaches`
  （`params-03` 由刻度儀之室收集）—— manifest 已裁決的過渡狀態，Phase J 移除相容層時一併收斂。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 測試仍綠）。


---

## Phase B · step 1 — v2 catalog bridge（2026-08-01 · done）

**一句話**：把「68 條技巧 / 5 個區域」這兩個散在十幾個檔案裡的寫死數字，收斂成一份
`src/challenges/catalog.js`；同時把課程 v2 的 **130 條技能 / 12 個區域**以 authored 資料層落地
（新七區 `implemented: false`）。**玩家看到的東西完全沒變**：仍然是 27 關 / 68 條 / 5 區。

### 做了什麼

1. **`src/data/skill-codex-v2.json`（新，185 KB）** —— 130 條技能逐條轉錄自 `curriculum-v2.md` §一，
   每條含 `id / nameZh / nameEn / tier / regionId / order / prereqs / masterRefs / oneLiner /
   legacyTechniqueId / legacyTechniqueSource / sources[]`。
   `sources` 是**程式從 `docs/prompt-engineering-master-list.md` 對應條目的「出處」欄逐條解析**出來的
   （共 445 筆，每筆帶 `masterRef` 可回查），不是人工重打、更不是從設計表一句話擴寫。
2. **`src/data/regions-v2.json`（新，13 KB）** —— 12 區。既有五區的 id／名稱／顏色／topicIds 一律
   以 `curriculum.json` 的 `groups` 為準（merge 時取原物件，不重寫）；新七區 `implemented: false`。
   每區帶 v2 的知識式軟門檻規格（`skills` / `regionSkills` / `masteredRegions` / `masteredAnyCount` ＋原句），
   **但這一期沒有啟用**：現行解鎖仍然完全由 `progression.js` 的 `REGION_GATES` 決定。
3. **`src/challenges/catalog.js`（新）** —— 單一 loader，把三份資料合成 runtime catalog，
   建構時就跑完整驗證（fail fast）。沒傳 v2 資料時會用 `curriculum.groups` 就地合成一份
   「全部已上線」的區域表，所以既有的 20 幾個 `createProgression({ curriculum, … })` 呼叫端行為一字未變。
4. **去硬編碼（runtime）** —— `main.js`（建 catalog 並傳給 content／progression／ranks；隱藏成就的
   68 改成 `achievement.total`；開機 log 走 `catalog.counts`）、`content.js`（`groupsOrdered()` 改由
   `catalog.implementedRegions()` 推導，新增 `regionsOrdered()` / `skill()` / `regionSkills()`）、
   `progression.js`（技巧／廠商／區域列舉全改走 catalog）、`ranks.js`（`rankStats` 收 catalog 或
   curriculum 都行；新增 `rankThreshold()` 支援 `"all"`）、`ranks.json`（最高階稱號的 68／5 → `"all"`）、
   `codex.js` / `settings.js` / `achievement.js`（總數走 `content.catalog.counts.techniques`）。
5. **去硬編碼（測試）** —— `scripts/expected-counts.json`（新）登記「真的是契約」的數字並逐格寫理由：
   27 關、目前上線的三種 kind、130 技能、12 區、5 區已上線、無出處技能 ≤3。
   其餘（配樂 6 = 5 區＋開場、氣氛 5、地標 5、稱號門檻、rubric 涵蓋率…）一律改成由 catalog 現算。
6. **新測試區段「課程 v2 runtime catalog（Phase B step 1）」** —— 資料契約（130／12／id 唯一／
   區域加總／先修拓撲無環／tier 合法／中文欄位）＋ **每一筆出處都必須真的出現在 master list 對應條目的
   「出處」欄**（護欄 2 的結構性保證）＋ 蒸餾規則 3（不得引用「出處找不到」的條目）＋ 新舊對照
   （`skillsForTechnique` / `techniqueForSkill` 互為反查）＋ 遷移 manifest 的 `needsV2Catalog` 收尾
   ＋ **行為中立**（catalog 版與 legacy 版的 `groupsOrdered()` / `masteredRegions()` / `hiddenAchievement()`
   逐欄相同、`REGION_GATES` 的 key 就是已上線區域、尚未上線的七區沒有任何關卡）
   ＋ 8 條 fail-fast 破壞測試（重複 id／先修不存在／成環／壞 tier／非 https／無出處又無說明／
   壞 legacyTechniqueId／把還沒蓋好的區域標成已上線）。

### 本次實跑

| 指令 | Phase A | Phase B step 1 |
|---|---|---|
| `npm run fonts` | 語料 55 檔／CJK 1634 字／1331.5 KB | ✓ 語料 **58** 檔／CJK **1664** 字／**1348.4 KB**（指紋測試綠） |
| `npm run test:rubric` | 17,705 | ✓ **21,393** |
| `npm run test:playtest` | 263 | ✓ **263**（未改，行為中立） |
| `npm run build` | ✓ | ✓（JS 1,461.66 KB / gzip 416.43 KB） |
| `npm run test:e2e` | 1,811 全過 | ✓ **1,816 項全過、零 console error**（第一次跑有 6 條環境型 flaky，見下） |

**e2e 誠實記錄**：第一次跑 1810 過／6 紅，全部落在 findings 已登記的 flaky 家族
（開場曲自動播放時序、fps 暖機 `{stable:0,fps:0}`、火盆亮度取樣、設定面板焦點時序、
`priority-stair-42` 的滑鼠拖曳 2 條）。當時機器 load average 11、軟體渲染每幀 228.6 ms。
依 `task_plan.md` §4「只對已知動畫 flaky 允許一次重跑」重跑一次，**1,816 項全過、零 console error**。
所有失敗都與本期改動無關（本期沒有碰音訊、粒子、拖曳、焦點）。

新測試都**實際破壞過一次確認會紅**（改完立刻還原、再跑一次確認回綠 21,393）：
把 `regions-v2.json` 的 `forms.implemented` 改成 `true` → catalog 在建構時直接丟例外
（`[catalog] 已實作的區域與 curriculum.groups 不一致：…,forms ≠ …`，整支測試中止 —— fail fast 生效）；
把 `clear-golden` 的第一個出處網址加一個字元 → 1 紅（`[clear-golden] 出處逐字取自 master #12 的「出處」欄`）；
把 `ranks.json` 的 `"all"` 改回 `68` → 2 紅（`最後一個稱號的收集門檻寫成 "all"，不是寫死的數字`）。

### 數字

- 技能：**130**（foundations 14 / reasoning 15 / grounding 12 / orchestration 12 / config 12 /
  forms 14 / toolcraft 11 / frugality 7 / refinery 11 / wards 5 / sight 8 / divergence 9）。
- tier：basic 37 / advanced 55 / master 38（由資料現算）。
- 出處：**445 筆**，每條技能 1–12 筆；**0 條技能沒有出處**（master list 唯一標「找不到」的 #11
  在蒸餾規則 3 就被排除，沒有被任何技能引用）。1 條技能（`migrate-cot-to-knob`）的出處帶
  master list 原有的「已標示下架」狀態註記，原樣傳遞。
- 新舊對照：130 條裡 **45 條**接得回舊 68 條（24 條來自遷移 manifest、20 條由附錄 C 的子集關係推導、
  1 條人工裁決 `skeleton-dev-message`），85 條是舊課程沒有的新技能 → `legacyTechniqueId: null`。
  遷移 manifest 有 25 條 `v2SkillId → primaryTechniqueId`，其中 `tool-when-not → agentic-01`
  本來就標了 `needsV2Catalog: true`（暫用）—— 這一期誠實回填成 `null` 並寫下理由
  （`agentic-01` 真正的後裔是 `tool-native-field`），測試逐條守住。

### 未做／留給後續

- 新七區只有資料，**沒有世界、沒有關卡、沒有圖鑑條目**；`gate` 規格尚未接上 runtime。
- `skill-codex-v2.json` 目前完整進 bundle（minify 後約 135 KB），JS 從約 1,320 KB → 1,462 KB。
  真正要省的話應該等圖鑑用得到它時再談 code-split，不要現在為了體積犧牲 fail-fast。
- 字型語料因為掃到新資料檔的中文（廠商名、文件名、區域主題句）而從 1634 → 1664 字、
  1331.5 → 1348.4 KB。這是 Phase 6 就定下的「保守超集」策略的必然成本。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。


---

## Phase B step 2 — `fix`／`spot` 題型 ＋ 撰寫基本功十座新神廟（2026-08-01）

狀態：`done`（未 commit／push）

### 做了什麼

**兩種新題型**（WORLD.md §3.3b 的第四、第五種，共用同一組 board 介面、同一隻手掌印、同一支離線引擎）

- `src/prompt/fix.js` — **改碑**：抄寫人留下一份寫壞的草稿，畫線的那幾句要一句一句換掉。
  `↑` `↓` 在畫線的句子之間走、`Enter` 攤開替代寫法、`Enter` 換上去；挑錯只會「石碑不收 ＋ 就地教學」。
  **`Esc` 是三段式還原**（見下方 findings）：替代寫法攤開著 → 收起來；停在已改好的句子 → 還原並重新攤開；
  沒有東西可還原 → 才冒泡出去收面板。正解可以是「整句拿掉」（`text: ''` ＋ `label`），
  那正是「補過頭」那一拍（P2 的「轉」）。
- `src/prompt/spot.js` — **點碑**：一疊石籤攤在檯上，玩家自己看出哪幾句有問題並點起來。
  方向鍵移動、`Enter` 點起來／放回去、`Esc` 放回去；點到不能動的那一句只會彈回來 ＋ 就地教學。
  壞的石籤可以帶 `replace`（改寫版）或不帶（＝拿掉）。**挑完之前手掌印根本不出現**。
- `src/prompt/console.js` — `FLOW_KINDS` 3 → 5、`KIND_LABEL`／`KIND_EN`、board lifecycle、
  `applyMode()` 的舞台切換、`flowKindOf()`（測試用）。**相容契約一個字都沒動**：
  缺 `kind`／未知 `kind`／宣告了 kind 卻沒有合法資料 → 一律回到石碑刻印。

**十座新神廟**（撰寫基本功 6 → 16 關；curriculum-v2 §3 的 foundations 14 座教學神廟到齊）

| id | 技能 | 題型 | 主檢查 |
|---|---|---|---|
| `nightwatch-relief-07` 新來的守夜人 | `clear-golden` | fix | 🆕`noUndefinedReference` |
| `measuring-table-08` 量繩之桌 | `clear-constraint` | fix | `hasConstraint` |
| `nodding-courier-09` 只會點頭的信差 | `clear-imperative` | spot | `assignsTask` |
| `first-rail-10` 只漆了第一節的欄杆 | `clear-scope` | fix | 🆕`statesScope` |
| `shout-stone-11` 喊破喉嚨的擴音石 | `clear-no-pressure` | spot | 🆕`avoidsPressureLanguage` |
| `wordfork-12` 一字之差的岔路 | `word-choice` | choice | 🆕`disambiguatesTerms` |
| `silent-foreman-13` 不解釋的工頭 | `context-why` | choice | `explainsWhy` |
| `empty-handed-envoy-14` 空手的信使 | `context-supply` | fix | `groundsInContext` |
| `old-tag-store-15` 舊標籤的倉庫 | `struct-xml` | choice | `hasDelimiters` |
| `parts-wall-16` 零件表 | `struct-anatomy` | spot | 🆕`namesComponents` |

每一座：`scenario` / `mission` / `craft` / `material` / `clue` / `starter` / `placeholder` /
`quickFills` / `sample` / 四拍的題型資料 ＋ **石碑刻印後備 `slots`**（相容契約），
rubric 恰好「1 主檢查（權重 3）＋ 1 地基（0.5）」、`pass = 2`（C1）。
`source` 一律是該技能在 `skill-codex-v2.json` 裡**逐條解析自 master list** 的真實官方連結。

**五個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）：
`noUndefinedReference`／`statesScope`／`avoidsPressureLanguage`／`disambiguatesTerms`／`namesComponents`。
全部結構性偵測（指涉的先行詞、範圍量詞＋例外的成對出現、大寫比例／驚嘆號密度、
「正面定義＋排除另一種讀法」的成對出現、行首零件名的相異數），中英雙語，
各有 good／weak／bad fixture ＋ 反作弊（關鍵字堆砌一個都不滿分）＋ `coach.json` 白話教學（實測填了就會亮）。

**存檔**：新增 `save.skillsV2[]`（純加法，`normalize()` 補空陣列、去重、丟掉非字串）。
新神廟通關時把 `primarySkillId` 記進去；有祖先的技巧照舊寫進 `collected`（D2：收集不倒退）。
`progression.isSkillCollected()` / `collectedSkills()` / `outcome.newlySkills` 一併上線。

**世界**：十座新石座落在撰寫基本功區的十個座標（由掃描腳本在真的地形上算出來，
region／coverage／四周可站／與所有石座 ≥13 公尺／避開石碑・小景・地標・刻文・祕密・器物・
橋的主動線・出生點・祭壇，全部走既有測試的同一組門檻）。

**效能（順手修掉一個馬上就要爆的預算）**：石座的暖光原本是「一座一盞 PointLight」——
27 → 37 座之後高畫質實測 **59 盞**（WORLD.md §6.1 的上限是 56，e2e 當場紅）。
改成**常數 8 盞的燈池**每幀指派給最近的幾座（燈的作用半徑 16 公尺、石座至少隔 13 公尺，
同一時間本來就只有兩三座照得到玩家 → 畫面零差異）。實測 **26 盞**（低畫質 13 盞），
而且燈數從此不隨關卡數成長 —— 這是 Phase C–J 能繼續加神廟的前提。

### 驗證

| 指令 | 之前 | 之後 |
|---|---|---|
| `npm run fonts` | 語料 58 檔／CJK 1664 字／1348.4 KB | ✓ 語料 **60** 檔／CJK **1696** 字／**1365.8 KB**（指紋測試綠） |
| `npm run test:rubric` | 21,393 | ✓ **25,877** |
| `npm run test:playtest` | 263 | ✓ **396** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 1,816 全過 | ✓ **1,920 項全過、零 console error** |

**世界量測**：三角形 142,664 → **144,920**（上限 420k）、燈光 45 → **26**（上限 56）、
碰撞體 786 → **788**（上限 1,400）、網格 1,199 → 1,249。

**e2e 誠實記錄**：第一次跑 1912 過／8 紅 —— 3 條是燈光預算（就是上面那個真的爆掉的問題，已修）、
2 條是把數字寫死的歷史快照斷言（coach 22 條、中文字型 1.01 MB 上限，改成由資料現算／往上調一格）、
2 條是我自己寫錯選擇器（`.stamp__grade` 應為 `.grade__mark`）、
1 條是已登記的環境型 flaky（`石座四個方向都按得到 E`，第二次跑自己過，期間沒有改到那一段）。
修掉之後**第二次跑 1,920 項全過、零 console error**。

**先紅後綠（逐條實測）**

- rubric：把 `nightwatch-relief-07` 的 fix 流程改成「正解換一個」→ 6 紅；
  拿掉 `shout-stone-11` 好石籤的 `why` → 4 紅；
  把 `flowKind()` 的 `isFixFlow()` 守衛拿掉 → 3 紅（相容契約）。三次都還原後回綠。
- e2e：把 `fix.js` 的 `Esc` 契約第二段停掉 ＋ 把 `spot.js` 的「不能動的那一句」判斷停掉 →
  改碑那一段 **6 條紅**（面板被關掉／沒有還原／顯示的不是原句／進度沒退回／替代寫法沒重新攤開／
  aria-live 沒講出「還原」），點碑那一段因為狀態被弄壞直接中斷。還原後即為上表的 1,920 全過。

### 未做／留給後續

- **既有 6 關的題型換裝仍未做**（curriculum-v2 §4 指定 `postbox-sprite-02` 由 choice 換成 order 等）。
  因此 C4「同一區不得連續三座同型」目前只對**新蓋的神廟**成立，測試也只守新神廟（有註解寫明）。
- **`rulesBeforeData` 與 `usesRareDelimiter` 這一期沒有實作**（詳見 `findings.md` 的理由：
  遷移 manifest 的不變式會擋住「主檢查是新檢查器卻已經實作」，要一起做那一關的改造才動得了）。
- 行動裝置（≤720px 的兩種新題型版面、觸控）仍未做；本期只驗到 820px 無水平溢位。
- 圖鑑還沒列 v2 技能（`skillsV2` 只是先把存檔與進度接起來）。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

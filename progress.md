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


---

## Phase C — `induct`／`tradeoff` 題型 ＋ 示範與推理 15 座（2026-08-01）

狀態：`done`（未 commit／push）

**一句話**：示範與推理這一區從 5 關長到 **15 座教學神廟**（curriculum-v2 §3 的 reasoning 總表到齊），
並上線兩種新題型 —— **推規碑（`induct`）** 與 **雙面碑（`tradeoff`）**。
兩者都是**石碑刻印的變體**：前面多一段「先想通一件事」的舞台，想通之後回到同一份 `slots` 刻印。

### 做了什麼

**兩種新題型**（WORLD.md §3.3b 的第六、第七種；共用同一組 board 介面、同一隻手掌印、同一支離線引擎）

- `src/prompt/slots.js`（新）— **刻印段落**：DOM、選項狀態、石屑、焦點、組出來的文字。
  由推規碑與雙面碑共用；`stele.js` 一個字都沒改（它是預設路徑，不為了少幾行程式碼冒回歸的險）。
- `src/prompt/induct.js`（新）— **推規碑**：牆上的對照一組一組浮出來，你要先看出規律。
  猜錯只會「牆不回應 ＋ 就地教學」（不扣分、不前進）；**最後一組是真的在驗證你的規律** ——
  只看前面推出來的那條「順手的規律」在那裡會答錯，而且那個選項就攤在眼前。
  想通了規律才開放刻印，刻滿 → 手印 → 呈給神諭。
- `src/prompt/tradeoff.js`（新）— **雙面碑**：一張卡、兩個都走得下去的面。
  **倒向哪一面都會前進**，但兩面都會誠實說出「這一張卡上買到什麼、付出什麼」；
  換一張卡，划算的那一面會**翻過來**。秤完兩張卡才開放刻印。
- `src/prompt/console.js`：`FLOW_KINDS` 5 → 7、`KIND_LABEL`／`KIND_EN`、board lifecycle、
  舞台切換、把手（`inductBoard` / `tradeoffBoard`）。**相容契約未變**：缺 kind／未知 kind／
  宣告了 kind 卻沒有合法資料（含**沒有 `slots`**）→ 一律回到石碑刻印。

**示範與推理 15 座**

| # | id | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|
| 1 | `example-hall-11` 示範迴廊（改造） | `fewshot-basics` | induct | `hasFewShot` |
| 2 | `lantern-rows-12` 一致的燈列（改造） | `fewshot-consistent` | choice | `hasFewShot` |
| 3 | `silent-thinker-13` 靜默的推理者（改造） | `reason-keep-simple` | spot | `keepsPromptLean` |
| 4 | `thinking-chamber-14` 思考室（改造） | `cot-separate-answer` | choice | `hasDelimiters` |
| 5 | `effort-forge-15` 火力熔爐（改造） | `knob-effort` | choice | `mentionsParameters` |
| 6 | `example-scale-16` 秤例之台 | `fewshot-count` | tradeoff | 🆕`justifiesExampleCount` |
| 7 | `flawed-cabinet-17` 壞掉的樣品櫃 | `fewshot-negative` | induct | 🆕`labelsNegativeExample` |
| 8 | `two-lampkeepers-18` 兩位掌燈人 | `fewshot-when` | tradeoff | 🆕`justifiesExampleCount` |
| 9 | `working-draft-19` 留著算式的草稿 | `fewshot-thinking` | fix | `hasFewShot` |
| 10 | `step-bridge-20` 一步一階的橋 | `cot-explicit` | choice | `hasStepByStep` |
| 11 | `silent-brooder-21` 不肯開口的沉思者 | `reason-no-transcript` | choice | 🆕`asksForRationaleNotTranscript` |
| 12 | `well-pause-22` 取水之後的停頓 | `think-after-tool` | fix | `asksToVerify` |
| 13 | `two-toll-bell-23` 兩段式的鐘 | `think-control` | choice | `mentionsParameters` |
| 14 | `honed-blade-24` 磨過頭的刀 | `overthinking-remove` | fix | `keepsPromptLean` |
| 15 | `three-wells-25` 三口井 | `self-consistency` | choice | 🆕`asksMultipleSamples` |

改造的 5 關照 `curriculum-v2-migration.json` 執行 post-A 條目（＋兩條 Phase 0 沒掃到的移除，
以 `addedIn: "C"` 標記並寫下理由），全部收斂成與新神廟同一個形狀：**主檢查 3 分 ＋ 地基 `assignsTask` 0.5 分、`pass` 2**。
`source` 改成回查得到 v2 技能的官方連結；`primaryTechniqueId` 保留（它們真的有祖先，收集不倒退）。

**撰寫基本功的兩座 `choice` 佔位換成真的雙面碑**（Phase B 留下的待辦）：
`wordfork-12`（直接換一個詞 vs 留著原詞補定義）、`old-tag-store-15`（角括號標籤 vs 井號標題）。
**只換第三幕的資料**，關卡文案、rubric、出處一字未動。

**四個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）：
`justifiesExampleCount`（明講的組數落在 2–5 ＋ 一句理由；「這一次不放」也算一種數量決定）、
`labelsNegativeExample`（反例標記 ＋「錯在哪」要在同一行或緊接的下一行）、
`asksForRationaleNotTranscript`（要「結論的依據」而不是「把內部推理原封不動輸出」）、
`asksMultipleSamples`（取樣次數 ＋ 多數決 ＋ 平手規則）。
全部結構性偵測、中英雙語、good／weak／bad fixture、反作弊，並補上 `coach.json` 白話教學（實測填了就會亮）。

**順手改嚴的既有檢查器**（不是為了關卡放寬）：
`keepsPromptLean` 新增「盡量完整／盡量徹底／愈詳細愈好」這一類鷹架的偵測（官方
"overthinking and excessive thoroughness" 講的正是這幾句）；
`SAMPLE_RUN_EN` / `SAMPLE_TIE_EN` 補上更自然的英文寫法。

**世界**：10 座新石座落在示範與推理區（隨機重啟的貪婪取樣，最小間距 13.4 公尺，
避開石碑／小景／地標／刻文／祕密／反應物件／器物／橋的主動線，並在 node 裡把世界蓋起來用
`solidAt()` 逐座掃過一圈）。石座燈仍是 Phase B 的常數 8 盞燈池 —— **燈數不隨關卡數成長**。

**樣式**：`src/styles.css` 新增推規碑（`.wall` / `.wallrow`）與雙面碑（`.twoface` / `.face` / `.tradelog`）
兩段，沿用既有的 `.stele` / `.carve` / `.opt` 語言；暖金只給成就熱點（刻上去、這一張卡上划算的那一面），
沒有紅字；`prefers-reduced-motion` 下動畫全關但內容照樣讀得懂；720px 以上兩面才並排。

### 驗證

| 指令 | Phase B | Phase C |
|---|---|---|
| `npm run fonts` | 語料 60 檔／CJK 1696 字／1365.8 KB | ✓ 語料 **63** 檔／CJK **1721** 字／**1381.5 KB**（指紋測試綠） |
| `npm run test:rubric` | 25,877 | ✓ **29,846** |
| `npm run test:playtest` | 396 | ✓ **554** |
| `npm run build` | ✓ | ✓（CSS 119.10 KB / gzip 22.45 KB） |
| `npm run test:e2e` | 1,920 全過 | ✓ **2,010 項全過、零 console error** |

**e2e 誠實記錄（四次）**：
① 第一次 11 紅 ＋ 在「牆上多刻出第三組」逾時中斷 —— 其中 3 條是**歷史快照型斷言**
（`byKind` 的初始化寫死了五種題型、`choice` 關數、reasoning 5 座）、2 條是已登記的拖曳 flaky，
另外 6 條抓到一個**真的 bug**：推規碑的選項按 `Enter` 沒有反應。
原因是 CDP 送進來的原始按鍵不保證會被瀏覽器翻成按鈕的預設 `click` ——
改碑與點碑當初就是自己接 `Enter`／空白鍵才會過（`fix.js` / `spot.js`）。
已在 `induct.js` / `tradeoff.js` / `slots.js` 三支都自己接（純鍵盤的正確做法，不是為了測試）。
② 第二次在 e2e 自己的注入字串上 `SyntaxError`：`join('\n')` 寫在樣板字面值裡會被當成真的換行。
③ 第三次 2,008 過／2 紅（只剩拖曳）。④ 修掉拖曳的根因後 **2,010 全過**。

**拖曳那一對斷言的根因（不是 flaky，是真的會停在差一格）**：`order.js` 的重排帶 FLIP 動畫
（`withSlide`：搬完先把每一列 translate 回原位，下一個 animation frame 才歸零）。
軟體渲染下一幀要 160 ms 以上，在那段時間裡 `getBoundingClientRect()` 讀到的還是**搬之前**的版面，
`indexAtY()` 因此算出「跟現在一樣的位置」，`to !== 現在` 這個守衛就把後續的移動全部擋掉 ——
石版停在只搬了一格的地方（`context,role,format,task`）。
修的是測試端：每一輪**重新量一次清單上緣**，並且由下往上分三步掃過去、每一步之間留 70 ms
讓影格追得上（產品碼一個字都沒改）。這一組從 Phase A 起被登記為 flaky，這一期查出了真正的原因。

### 未做／留給後續

- `three-wells-25` 沒有照 §3 用 `workshop`、`well-pause-22` 沒有用 `multi`（Phase G）、
  `effort-forge-15` 沒有用 `sim`（Phase H）—— 理由逐條記在 `findings.md`；
  題型換裝時只要換第三幕的資料，關卡文案、rubric、出處都不必動。
- 行動裝置（≤720px 的兩種新題型版面、觸控）仍未做；本期只驗到 820px 無水平溢位。
- 圖鑑仍未列 v2 技能（`skillsV2` 只是把存檔與進度接起來）。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。


---

## Phase D — 合尺（`constraint`）＋ 脈絡與長文／角色與參數各 12 座 ＋ 行動裝置還債點（2026-08-01）

狀態：`done`（未 commit／push）· **這是 R2 release checkpoint**

**一句話**：脈絡與長文與角色與參數各補到 **12 座教學神廟**，撰寫基本功欠著的兩座也補上 ——
**既有五區的課程 v2 化到此完成**（orchestration 依路線圖留到 Phase G）；
同時上線第八種題型 **合尺（`constraint`）**，以及行動裝置的第一次還債（面板在 390px 上真的按得動）。

### 做了什麼

**合尺（`constraint`）**——WORLD.md §3.3b 的第八種，唯一一種把「即時預檢」搬到台前的題型

- `src/prompt/constraint.js`（新）：委託人給你幾把**尺**，每一把用白話寫著它要量什麼（P9 完全資訊）；
  檯上的石片挑上去，尺**當場**亮或暗。亮的依據是 `checks.js` 的 `runCheck()` ——
  **沒有第二套評分邏輯**（護欄 3）。放錯只會「尺暗回去 ＋ 就地教學」，不扣分、不失敗；
  每一把尺都合了手掌印才浮出來，放錯一片手掌印會**收回去**。
  鍵位：`↑` `↓` 走、`Enter` 放上／拿下、`Esc` 拿下最後一片（檯上空的才冒泡收面板）。
- `src/prompt/console.js`：`FLOW_KINDS` 7 → 8、`KIND_LABEL`／`KIND_EN`、board lifecycle、舞台切換、
  `constraintBoard` 把手。**相容契約未變**：缺 kind／未知 kind／宣告了 kind 卻沒有合法資料
  （含沒有 `slots`、只有一把尺、每一片都是「該挑的」）→ 一律退回石碑刻印。
- `src/styles.css`：`.constraintboard` / `.gauges` / `.gauge` / `.pieces` / `.piece`，沿用既有的
  `.stele` / `.carve` 語言；暖金只給亮起來的尺與挑上去的石片，沒有紅字。

**脈絡與長文 12 座（＋1 應用關 ＝ 13 關）**

| # | id | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|
| 1 | `citation-desk-21` 引文閱覽台（改造） | `ground-quote-first` | fix | `asksToCiteSources` |
| 2 | `well-of-unknowing-22` 不知之井（改造） | `ground-out` | choice | `givesOutForUncertainty` |
| 3 | `long-scroll-tower-23` 長卷之塔（改造） | `long-query-last` | order | `putsQuestionLast` |
| 4 | `verify-spring-24` 查證之泉（改造） | `ground-read-first` | constraint | `asksToVerify` |
| 5 | `nameless-three-26` 三疊無名的卷 | `long-doc-structure` | choice | 🆕`labelsSources` |
| 6 | `laden-desk-27` 滿載的閱覽台 | `long-all-upfront` | constraint | `groundsInContext` |
| 7 | `sleepless-scribe-28` 無眠的抄寫員 | `long-outline-anchor` | order | 🆕`anchorsToSection` |
| 8 | `sealed-readroom-29` 封了口的閱覽室 | `ground-strict` | fix | `groundsInContext` |
| 9 | `mark-spring-30` 標記之泉 | `cite-format` | spot | 🆕`citesInline` |
| 10 | `prospect-log-31` 不肯收工的探勘隊 | `retrieval-budget` | choice | 🆕`setsRetrievalBudget` |
| 11 | `three-mirrors-32` 三面破鏡 | `halluc-causes` | spot | 🆕`diagnosesFailureCause` |
| 12 | `extract-bench-33` 萃取台 | `extract-spec` | fix | 🆕`allowsNullField` |

**角色與參數 12 座**

| # | id | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|
| 1 | `mask-workshop-41` 面具工坊（改造） | `role-basics` | fix | `hasRole` |
| 2 | `priority-stair-42` 優先序階梯（改造） | `hierarchy` | order | 🆕`ranksInstructions` |
| 3 | `dial-room-43` 刻度儀之室（改造） | `knob-temperature` | choice | `mentionsParameters` |
| 4 | `four-elements-mirror-44` 四要素之鏡（改造） | `skeleton-ptcf` | choice | `hasRole` |
| 5 | `crossroad-scale-45` 抉擇之秤（改造） | `model-pick` | tradeoff | 🆕`namesModelClass` |
| 6 | `lintel-words-46` 刻在門楣上的話 | `system-uses` | spot | `hasRole` |
| 7 | `one-slot-window-47` 只有一格的窗口 | `no-system-field` | fix | `hasDelimiters` |
| 8 | `six-lantern-48` 六面燈籠 | `skeleton-six-elements` | constraint | `hasAudience` |
| 9 | `scribe-longtable-49` 抄寫人的長桌 | `skeleton-dev-message` | order | 🆕`hasStopRule` |
| 10 | `two-grammar-hall-50` 兩種文法的殿 | `skeleton-consistency` | tradeoff | 🆕`usesOneSkeleton` |
| 11 | `sluice-gate-51` 截流閘 | `knob-limits` | constraint | `mentionsParameters` |
| 12 | `wish-pool-52` 許願池與旋鈕 | `param-not-plead` | tradeoff | `mentionsParameters` |

**撰寫基本功欠著的兩座**（Phase B 記在 findings 的那兩個 🆕）

| id | 技能 | 題型 | 主檢查 |
|---|---|---|---|
| `postbox-sprite-02` 郵箱精靈的分揀台（改造） | `struct-delimiters` | order | 🆕`usesRareDelimiter` |
| `long-scroll-archive-05` 規則牆（改造） | `pos-rules-first` | order | 🆕`rulesBeforeData` |

11 關改造照 `curriculum-v2-migration.json` 執行（`post-A` → `phase: "D"`，Phase 0／A 沒掃到的移除以
`addedIn: "D"` 標記並逐條寫理由），全部收斂成新神廟的形狀：**主檢查 3 分 ＋ 地基 assignsTask 0.5 分、pass 2**。
`source` 改成回查得到 v2 技能的官方連結；`primaryTechniqueId` 保留（收集不倒退，D2）。

**十二個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）：
`labelsSources`／`anchorsToSection`／`citesInline`／`setsRetrievalBudget`／`diagnosesFailureCause`／
`allowsNullField`／`ranksInstructions`／`hasStopRule`／`usesOneSkeleton`／`namesModelClass`／
`rulesBeforeData`／`usesRareDelimiter`。全部結構性偵測（位置比較、成對出現、區間判定、相異數、
罕見字元組合），中英雙語，各有 good／weak／bad fixture ＋ 反作弊，並補上 `coach.json` 白話教學。

**世界**：15 座新石座（隨機重啟的貪婪取樣，最小間距 13.6 公尺，避開石碑／小景／地標／刻文／祕密／
器物／橋的主動線，並**在 node 裡把世界蓋起來**用 `solidAt()` 逐座掃 24 個方向 × 4 個距離）。
石座燈仍是 Phase B 的常數 8 盞燈池 —— 燈數不隨關卡數成長。

**行動裝置還債點**（task_plan Phase D 的出口條件）

- `src/styles.css` 新增 `≤720px` 與 `≤430px` 兩段：面板貼齊視窗、長內容一律 `overflow-wrap: anywhere`、
  所有可按元素 `min-height: 40px`、輸入框 `font-size ≥ 16px`（iOS 才不會自動放大）、
  第三幕的石碑與對照上下疊、390px 下按鈕整行、圖鑑收成一欄。
- **世界的觸控移動（虛擬搖桿）明確不做**，理由與範圍記在 `findings.md`。

### 驗證

| 指令 | Phase C | Phase D |
|---|---|---|
| `npm run fonts` | 語料 63 檔／CJK 1721 字／1381.5 KB | ✓ CJK **1750** 字／**1399.9 KB**（指紋測試綠） |
| `npm run test:rubric` | 29,846 | ✓ **37,108** |
| `npm run test:playtest` | 554 | ✓ **816** |
| `npm run build` | ✓ | ✓（CSS 121.72 KB / gzip 22.82 KB；JS 1,706.89 KB / gzip 488.05 KB） |
| `npm run test:e2e` | 2,010 全過 | ✓ **2,157 項全過、零 console error** |

**e2e 誠實記錄（五輪）**

① 第一輪在「石碑刻印」段就整支中斷 —— 那一段開的是面具工坊，而它這一期換成了改碑；
順帶露出三個**歷史快照型斷言**（結果面板 5 條檢查、`byKind` 的 id 清單、25 座新石座）。
② 第二輪撞到自己留下的孤兒 dev server（port 5199 被佔住，測到的是舊頁面）——
`pkill -f headless-check` 只殺了包裝殼，Vite 還活著。
③ 第三輪 26 紅：其中 4 條是**環境**（load average 12、34 個孤兒 chrome，序章那一段的進度亂掉；
清乾淨之後同一份程式碼完全乾淨），其餘是真的要修的（合尺的干擾片、觸控目標、
拖曳的終點座標、圖鑑窄畫面溢位）。
④ 第四輪只剩 4 紅（拖曳 3 ＋ 圖鑑溢位 1）。
⑤ 修完之後 **2,157 項全過、零 console error**。

其中「圖鑑在 390px 溢位 140px」是用一支獨立的 CDP 探針當場量出來的
（種一份全收集存檔 → 開圖鑑 → 逐個元素比對右緣）：元凶是 `.tech__chips`
（廠家礦籤那一排 `flex: none` ＋ `margin-left: auto`）。詳見 `findings.md`。

**先紅後綠（逐條實測）**

- rubric：把 `laden-desk-27` 的一片干擾片標成「該挑的」→ 2 紅
  （「該挑的挑齊了每一把尺都亮」「挑齊之後＝示範解答」）；把 `constraint.js` 的 `runCheck()` 換成
  自己算的假結果 → 1 紅（「合尺的尺是用 checks.js 的 runCheck 量的」）。兩次還原後回綠。
  （第一次寫這條斷言時它**不會紅** —— 因為檔頭註解裡就有 `runCheck()`；改成先剝註解才真的守得住。）

### R2 release checkpoint · 發布就緒的數字（全部本次實測）

| 項目 | 數字 |
|---|---|
| 關卡 | **62 關**（撰寫基本功 16／示範與推理 15／脈絡與長文 13／流程與代理 6／角色與參數 12） |
| 接上 v2 技能的教學神廟 | **51 座**（Phase B 10 ＋ Phase C 15 ＋ Phase D 15 ＋ 改造 11） |
| 既有五區 v2 化 | foundations 14／15、reasoning 15／15、grounding 12／12、config 12／12 完成；orchestration 依路線圖留到 Phase G |
| 題型 | **8 種**（choice／order／workshop／fix／spot／induct／tradeoff／constraint） |
| 離線檢查器 | 22 既有 ＋ **21 個 §7.4 新檢查器已上線**（Phase B 5／C 4／D 12） |
| 舊 68 條技巧 | 收得滿 68（收集不倒退，D2） |
| 世界（高畫質實測） | 147,032 三角形（上限 420k）／**26 盞燈**（上限 56）／1,374 mesh／608 個碰撞體 |
| 建置 | CSS 122.9 KB（gzip 22.9）／JS 1,706.9 KB（gzip 488.1）／字型 1,399.9 KB |
| 存檔 | `promptasy.v1.save`；這一期**沒有新增欄位**（合尺沿用 `bestGrades` / `skillsV2`），舊存檔零遷移風險 |
| 行動裝置 | 面板（四幕 ＋ 八種題型 ＋ 結果 ＋ 圖鑑 ＋ 設定）在 720×900 與 390×844 可操作；**世界觸控移動未做** |

### 未做／留給後續

- **世界的觸控移動仍未做**（虛擬搖桿、相機、HUD 版面）；這一期只還了面板的債。
- `three-wells-25`／`well-pause-22`／`effort-forge-15`／`prospect-log-31`／`extract-bench-33` 等
  幾座沒有照 §3 指定的 `workshop`／`multi`／`sim` 型式（那幾種 kind 屬於後續期別，或資料形狀不合），
  理由逐條記在 `findings.md`；題型換裝時只要換第三幕的資料。
- 圖鑑仍未列 v2 技能（`skillsV2` 只是把存檔與進度接起來）。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。


---

## Phase E — 量器坊（`forms`）：第六區、第一塊新地形（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：正南長出第六片土地 **量器坊**，14 座教學神廟到齊（新蓋 13 ＋ 擬態之鏡搬家 1），
第一次上線**知識式軟門檻**（C8），並開了 9 個新檢查器。**這一期不開新題型**——
地形與內容同一期已經夠重，題型全部沿用既有八種。

### 做了什麼

**14 座神廟**（`order` 4 是搬過來的擬態之鏡，其餘 53–65）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `mimic-mirror-04` | 擬態之鏡（改造＋搬家） | `prefill-completion` | fix | `hasFewShot` |
| 2 | `gatehouse-gauge-53` | 量器坊的門房 | `fmt-specify` | choice | `specifiesFormat` |
| 3 | `bullet-wall-54` | 長出圓點的牆 | `fmt-markdown-diet` | fix | 🆕`statesFormatPreference` |
| 4 | `slippery-answer-55` | 抓不住的答案 | `answer-anchor` | constraint | 🆕`hasFallbackCategory` |
| 5 | `abacus-count-56` | 數不清的珠算 | `no-counting` | spot | 🆕`avoidsSelfCounting` |
| 6 | `two-rulers-57` | 兩把尺 | `len-concrete` | constraint | `hasConstraint` |
| 7 | `cut-summary-58` | 被砍掉重點的摘要 | `len-preserve` | fix | 🆕`saysWhatToPreserve` |
| 8 | `for-newcomer-59` | 給沒看過的人 | `len-readable` | choice | `hasAudience` |
| 9 | `empty-adjective-60` | 形容詞的空箱 | `tone-concrete` | fix | 🆕`definesToneConcretely` |
| 10 | `throat-clearing-61` | 清嗓子的傳令 | `no-preamble` | spot | 🆕`bansFillerPhrases` |
| 11 | `mould-room-62` | 鑄模房 | `so-basics` | choice | 🆕`definesSchema` |
| 12 | `two-seals-63` | 兩種印章 | `so-vs-jsonmode` | tradeoff | 🆕`definesSchema` |
| 13 | `twice-carved-64` | 重複刻的模 | `so-division` | spot | 🆕`noDuplicateSchemaRules` |
| 14 | `slideless-deck-65` | 沒有圖的簡報 | `doc-design-elements` | fix | 🆕`namesDesignElements` |

每一座：`scenario` / `mission` / `craft` / `material` / `clue` / `starter` / `placeholder` /
`quickFills` / `sample` ＋ 該題型的第三幕資料 ＋ **石碑刻印後備 `slots`**（相容契約），
rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1），
`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結。
**題型序列**：fix・choice・fix・constraint・spot・constraint・fix・choice・fix・spot・choice・tradeoff・spot・fix
—— 最長連續同型 **1**（C4 的門檻是 ≤2）。

**擬態之鏡的改造＋搬家**（manifest 新增 `phaseE` 區塊）：主題由「用範例展示格式」收斂成
「寫出開頭讓它接下去」，`specifiesFormat` 依 post-A 條目移除、`region` 改成 `forms`、
石座搬到 `[-18.7, 98.8]`、題型由 choice 換成 fix。`teaches` 與舊主技巧 `format-03`
一字未動（收集不倒退，D2）；最後一段刻印刻意停在「輸出：」——那正是 prefill 這一招本身。

**9 個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）。
三個是**非單調**的（多寫一句會讓它暗回去），合尺才不會退化成「全選就過關」：
`avoidsSelfCounting`（出現「你自己數一下」就整條歸零）、`saysWhatToPreserve`（必留清單列太長＝等於沒縮）、
`noDuplicateSchemaRules`（模上寫過的限制在散文裡再寫一次就掉分）。
兩座合尺神廟各自靠其中一把非單調的尺守住「挑齊會亮、全選一定有一把暗」。

**世界**：`REGION_SITES` 新增 `forms (0, 124) r=44`（半徑上限由 `buildTerrain()` 的
340 公尺見方網格決定，測試逐區驗證），地貌是「由北往南一階一階降下去的鑄場台階」；
`REGION_ATMOSPHERE.forms`（冷錫色、螢火最少）、`FLORA.forms`（方鑄塊／扁量盤／細量針三種剪影）、
`buildRegionProps` 的量尺柱（instanced ＋ emissive 刻度）與鑄槽、
地標 **刻度之柱**（高 24、留白 15、**零實體光源**）、三組故事小景、橋／閘門／路網全部自動跟上。
14 座石座落點用隨機重啟的貪婪取樣算出來，再**在 node 裡把世界蓋起來**逐座掃過
24 個方向 × 4 段距離（高低兩種畫質）。

**知識式軟門檻（C8）**：`REGION_GATES.forms` 新增 `knowledge`（規格逐字取自 `regions-v2.json`），
`gateSatisfied()` / `gateStatus()` 讀它；「會了嗎」走新的 `knowsSkill()`
（`skillsV2` 或 D2 相容橋的祖先技巧）。閘門說得出還差哪幾條（中文技能名），
`skippedGates` 先行前往照樣走得通且一分 XP 都不加。

**runtime 支援第六區**：catalog 的「已實作＝`curriculum.groups`」硬相等改成
「以既有五區開頭、後面才接新區」，並強制新區自己宣告主色；
`content.group()` / `groupsOrdered()`、`world` 的 `colorOf`（新增 `regions` 參數）、
`progression.regionMastery()`（新區改用 v2 技能算完成度）、圖鑑（新增只列技能的區域卡，
每條附可點的官方出處）全部跟上。

**配樂**：量器坊沒有音檔 → 新增 `SYNTH_ONLY_REGIONS = ['forms']` 誠實登記，
配一組自己的 `REGION_MOODS.forms`（根音 103.83、大二度堆疊、鐘聲密度 0.3、曲名「量器的餘響」），
跨區走合成 pad。**刻意不共用別區的音檔**（見 `findings.md`）。

### 驗證

| 指令 | Phase D | Phase E |
|---|---|---|
| `npm run fonts` | CJK 1750 字／1399.9 KB | ✓ CJK **1771** 字／**1413.4 KB**（指紋測試綠） |
| `npm run test:rubric` | 37,108 | ✓ **42,968** |
| `npm run test:playtest` | 816 | ✓ **1,076** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,157 全過 | ✓ **2,308 項全過、零 console error** |

**世界量測**（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase D | Phase E | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 147,032 | **154,868** | 420,000 |
| 光源（高畫質） | 26 | **27** | 56 |
| 碰撞體（高畫質） | 608 | **674** | 1,400 |
| mesh | 1,374 | **1,528** | — |
| InstancedMesh／實例 | 42 ／ 754 | **52 ／ 947** | — |
| 低畫質三角形／燈 | 86,732 ／ 13 | **94,044 ／ 14** | — |

唯一新增的那一盞燈是「每區一盞主色補光」（與其他四片土地同一個模式）；
**地標本身零實體光源**（e2e 逐一數過）。

### e2e 的三輪（誠實記錄）

① 第一輪：新的量器坊區段 **128 項一次全過**，但露出 10 條**歷史快照型斷言**
（4 道閘門 → 5、五個地標 → 6、五區植被 → 6、圖鑑 68 條 → 82、配樂 6 首 → 7、
指南針 5 根針 → 6、世界 62 關 → 75），全部改成由 catalog／`expected-counts` 現算；
另有 3 條是已登記的拖曳 flaky 家族。
② 修完快照斷言後重跑：**2,286 項全過、零 console error**（拖曳那一組自己過了）。
③ 加上「純鍵盤走完量器坊第一座」的區段後做兩輪**先紅**（見下），最後一輪
**2,308 項全過、零 console error**，零重跑。

### e2e 的三輪（誠實記錄）

① 第一輪：**2,621 通過、14 失敗**，四組，全部是真的東西：
   · 1 條 Phase F 的快照斷言（「齒輪工坊現在有 4 關」→ 收尾之後是 12）；
   · 5 條量器坊那一段（`for-newcomer-59` 換裝成 multi 之後，舊的播放器不會「收下回話」就卡在第一輪
     → 連帶讓「全破之後一條都不再是剪影 / 量器坊蓋上精通封印 / 進程也認定量器坊精通了」三條跟著紅）；
   · 5 條我自己新寫的 Esc 段落 —— **抓到的是我測試寫錯，不是產品錯**：
     前一步把回話卡的 ⓘ 打開了，`bindInfoTips` 的既有行為是「Esc 先收 ⓘ」，
     所以第一下 Esc 沒有收面板。改成**兩段都驗**（第一下收 ⓘ、面板還開著；第二下才收面板）；
   · 1 條 reduced-motion 的可見性 —— 我用了 `goAct(3)` 沒帶 `force`，那一關的第三幕還沒被走過，
     所以量到的是「在還沒切過去的幕裡」。改成 `goAct(3, { force: true })`。
② 第二輪（全部修完後）：**2,637 項全過、零 console error、零重跑**。
   GPU：SwiftShader 軟體渲染、每幀 224.9 ms —— 這一輪連 `AGENTS.md` 登記的
   動畫時序 flaky 家族（拖曳 / 風鈴 / 火盆亮度）都沒有出現。

### 先紅後綠（逐條實測）

- **rubric（3 次）**：把 `gateSatisfied()` 的知識式判定拿掉 → 1 紅（`量器坊仍鎖住`）；
  把刻度之柱的高度改成 12 → 2 紅（地標高度階 ＋ 剪影）；
  把 `regions-v2.json` 的 forms 主色拿掉 → catalog 建構時直接丟例外（fail fast）。
- **e2e 第一輪破壞（4 紅）**：讓圖鑑不再列新區域的技能 → `量器坊那一張卡列出 14 條技法`、
  `每一條技法都附得出可點的官方出處`、`出處是可點的 https 連結` ＋ 圖鑑總條數兩條；
  偷偷在刻度之柱加一盞 `PointLight` → `刻度之柱一盞實體光源都沒加`。
- **e2e 第二輪破壞（6 紅）**：把 `gatehouse-gauge-53` 第二段的正解換成「格式清楚一點就好」
  → `全程不碰滑鼠也拿得到 S`（S → A）＋ 該座的 S 斷言；
  把 `mould-room-62` 第二段的正解換成散文描述 → 該座 `拿不到 S`／`記成通關`／`技能進圖鑑` 三紅
  ＋ 連帶 `全破之後一條都不再是剪影`／`量器坊蓋上精通封印`／`進程也認定量器坊精通了`。
  兩輪都還原後即為上表的 2,308 全過。
- **已知 flaky**：第二輪破壞那一次同時出現拖曳 3 條 ＋ 風鈴擺動 1 條（`AGENTS.md` 登記的
  動畫時序家族）；最後一輪乾淨機器上全部自己過，**沒有重跑**。

### 未做／留給後續

- **量器坊沒有石碑／刻文小語／會回應的東西／動得了的器物**（那幾層的測試只要求既有五區）。
  這是刻意的範圍控制：本期把預算花在地形、14 座神廟與 9 個檢查器上。理由記在 `findings.md`。
- `len-readable` 的 `multi`（Phase G）與 `so-basics` 的 `workshop` 用佔位 kind 上線，
  換裝時只要換第三幕的資料。
- 量器坊的 `bgm_forms.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、
  把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

## Phase F — 契約鍛冶場（`toolcraft`）＋ 護欄崗（`wards`）：第七、八區（2026-08-02）

狀態：`done`（未 commit／push）— **R3 release checkpoint**

**一句話**：正西長出第七片土地 **契約鍛冶場**（11 座），沉書檔案庫北緣加建出 **護欄崗**（5 座）——
第一次做出**沒有橋的加建院落**，並開了 9 個工具／護欄的檢查器。
派工檯（workshop）是這一期的主場題型，順手把它的稱呼抽象化成一層可覆寫的字典。

### 做了什麼

**契約鍛冶場 11 座**（新蓋 9 ＋ 搬家改造 2）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `forge-door-66` | 契約鍛冶場的門 | `tool-native-field` | workshop | `definesTools` |
| 2 | `tool-forge-33` | 工具鍛造間（改造＋搬家） | `tool-description` | fix | `definesTools` |
| 3 | `two-keys-67` | 兩把同名的鑰匙 | `tool-naming` | spot | 🆕`toolNamesDistinct` |
| 4 | `crowded-bench-68` | 擺滿的工作檯 | `tool-fewer` | workshop | 🆕`limitsToolSurface` |
| 5 | `oracle-workshop-36` | 神諭工坊（改造＋搬家） | `tool-when-not` | workshop | 🆕`statesToolTriggers` |
| 6 | `unasking-smith-69` | 不肯開口問的匠人 | `tool-trigger-push` | tradeoff | 🆕`statesToolTriggers` |
| 7 | `blank-order-70` | 空白的委託單 | `tool-ask-missing` | fix | `givesOutForUncertainty` |
| 8 | `gear-mesh-71` | 齒輪的咬合 | `tool-order` | order | 🆕`ordersToolCalls` |
| 9 | `mental-ledger-72` | 心算的帳房 | `tool-prefer-compute` | fix | 🆕`prefersToolOverMentalMath` |
| 10 | `cartload-back-73` | 倒回來的一整車 | `tool-result-signal` | spot | 🆕`limitsToolOutput` |
| 11 | `silent-smith-74` | 沒有交代的匠人 | `tool-preamble` | fix | 🆕`requiresPreamble` |

**護欄崗 5 座**

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `speaking-letter-75` | 會說話的來信 | `inj-concept` | spot | `hasDelimiters` |
| 2 | `two-slots-76` | 兩道口 | `inj-input-channel` | tradeoff | `usesRareDelimiter` |
| 3 | `reshaped-order-77` | 改了形狀的委託 | `inj-lower-risk-shape` | fix | 🆕`reshapesToLowRisk` |
| 4 | `unclosing-door-78` | 不會關上的門 | `guardrail-hitl` | workshop | `requiresConfirmation` |
| 5 | `guest-in-disguise-79` | 假扮成客人的人 | `redteam` | workshop | 🆕`includesAdversarialCase` |

每一座：`scenario` / `mission` / `craft` / `material` / `clue` / `starter` / `placeholder` /
`quickFills` / `sample` ＋ 該題型的第三幕資料 ＋ **石碑刻印後備 `slots`**，
rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1），
`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結。
**題型序列**：toolcraft ＝ fix・workshop・workshop・spot・workshop・tradeoff・fix・order・fix・spot・fix；
wards ＝ spot・tradeoff・fix・workshop・workshop —— 兩區最長連續同型都是 **2**（C4 的門檻是 ≤2）。

**兩座搬家的舊神廟**（manifest 新增 `phaseF` 區塊）：`tool-forge-33` 由分段建構換成**改碑**
（起：說明只有一行 → 承：補上用途與參數 → 轉：全篇 CRITICAL 讓它每次都硬叫 → 合：規則在前、
語氣放平、附一個例子），`oracle-workshop-36` **沿用整套派工檯資料**、只把最後那條規矩由
「缺參數就問」換成「該用／不該用／誰優先」（缺參數那一題搬去了 `blank-order-70`，C2 不重教）。
兩座的 `teaches` 與舊主技巧一字未動（收集不倒退，D2）；流程與代理因此由 6 → **4 關**。

**9 個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）。
三個是**非單調**的：`requiresPreamble`（要求呼叫前吐 JSON → 整條歸零）、
`limitsToolSurface`（一邊收工具一邊又「全部列出來」→ 歸零）、
`prefersToolOverMentalMath`（又叫它「自己算一下」→ 歸零）。
`toolNamesDistinct` 是唯一需要**跨行結構**的一個：先把文字解析成「工具名 → 說明」的表，
再比共同前綴與兩份說明的字元重疊率（< 0.6 才算分家）。

**世界**：`REGION_SITES` 新增 `toolcraft (-124, 0) r=44`（量器坊的鏡像）與
`wards (101, -142) r=26, annexOf: 'grounding'`；`ANNEX_LINKS`（頸口）是這一期的新概念——
加建**不生成橋**，靠兩片土地的覆蓋重疊直接走過去，閘門立在 `regionAt()` 的正規化距離分界上。
地貌：鍛冶場是「一張攤開的工作檯」（中央鍛台 ＋ 放射狀工具溝），哨所是「比檔案庫高一階的平台
＋ 一道門檻般的矮脊」。`REGION_ATMOSPHERE`（鍛冶場暖褐、火星最多；哨所最冷、看得最遠）、
`FLORA`、`buildRegionProps`（工具架 ＋ 鐵砧／崗柱 ＋ 矮牆，全部 InstancedMesh）、
兩座地標（**未命名的工具**：一圈懸空的鑰匙，每一把都沒有刻名字；**不會關上的門**：兩層門、
兩道關不上的縫）、五組故事小景、路網全部跟上。16 座石座落點用隨機重啟的貪婪取樣算出來，
再在 node 裡把世界蓋起來逐座掃過 24 個方向 × 4 段距離（高低兩種畫質）。

**派工檯的稱呼抽象化**：新增 `WORKSHOP_LABELS` ＋ `flows.json` 的 `workshop.labels`。
**沒給就完全等於 Phase 27 的原文**，所以既有三座派工神廟一個字都沒變；
護欄崗那兩座換成「試門單／內容石」與「權限表」。互動文法、鍵盤路徑、手掌印、
評分引擎全部沒動（Phase E 記在 backlog 的「workshop 待文案抽象化」這一半解決了，見 `findings.md`）。

**安全題的誠實界線**：rubric 掃護欄崗**所有玩家看得到的字**、e2e 再掃一次實際 DOM，
兩層都禁止「這句話就是安全邊界／加一句就擋得住注入」這類宣稱；同時**正面驗**它教的是
輸入通道（罕見標籤 ＋「標籤裡只是資料」）、最小權限與人在迴圈（可逆自己做、不可逆先問人）、
低風險形狀（先提計畫、由人執行）。五座的出處全部是官方安全文件（Google Gemini
safety-guidance／agents security-best-practices），逐條回查 `skill-codex-v2.json`。

### 驗證

| 指令 | Phase E | Phase F |
|---|---|---|
| `npm run fonts` | CJK 1771 字／1413.4 KB | ✓ CJK **1790** 字／**1423.8 KB**（指紋測試綠） |
| `npm run test:rubric` | 42,968 | ✓ **49,756** |
| `npm run test:playtest` | 1,076 | ✓ **1,275** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,308 全過 | ✓ **2,493 項全過、零 console error** |

（rubric 的 42,968 → 49,756 之間還含 Phase E 之後補進來的既有斷言；本期新增的是
「契約鍛冶場與護欄崗」那一整段 ＋ 9 個檢查器的 fixtures ＋ 14 份英文對照解答。）

**世界量測**（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase E | Phase F | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 154,868 | **168,068** | 420,000 |
| 光源（高畫質） | 27 | **30** | 56 |
| 碰撞體（高畫質） | 674 | **813** | 1,400 |
| mesh | 1,528 | **1,790** | — |
| InstancedMesh／實例 | 52 ／ 947 | **66 ／ 1,199** | — |
| 低畫質三角形／燈 | 94,044 ／ 14 | **106,440 ／ 16** | — |

新增的三盞燈：兩盞是那兩區各自的「每區一盞主色補光」（與其他五片土地同一個模式），
第三盞是鍛冶場那組小景（擺到放不下的那張檯）裡的一盞燈。
**兩座地標本身零實體光源**（e2e 逐一數過）。

### e2e 的三輪（誠實記錄）

① 第一輪：**25 項失敗**——其中 5 條是既有 Phase 27 派工段落的斷言（`oracle-workshop-36`
改造後文案與燈數變了）、7 條是導航閃爍提示（知識式軟門檻在那個時間點替玩家開了新土地，
「＿＿已開啟」那一則把提示的冷卻推起來，蓋掉要驗的迷路提示）、3 條是入場門的固定 `sleep(900)`
在忙碌機器上賭輸、4 條是我自己新斷言的選擇器寫錯（`.stele__eyebrow` 沒有限定在 `.workshop` 裡）、
3 條是 `AGENTS.md` 登記的拖曳 flaky 家族。
② 第二輪（**先紅**）：把稱呼字典的覆寫關掉 → 護欄崗那四條斷言**如預期全紅**
（試門單 → 派工單、內容石 → 值石、無障礙標籤、畫面上不該冒出「派工單」）。
③ 第三輪（還原後）：**2,493 項全過、零 console error，零重跑**。
入場門那三條改成輪詢式斷言（`waitFor`，不是固定 sleep）——那是 `AGENTS.md` 早就寫著的規則，
本期把它補上；拖曳那三條在後兩輪都自己過了。

### 先紅後綠（逐條實測）

- **rubric（3 次）**：在護欄崗的線索裡塞一句「這句話就是安全邊界」→ 1 紅
  （`護欄崗的文案沒有把 prompt 文字宣稱成真正的安全邊界`）；把 `wards` 的 `annexOf` 拿掉
  （讓它變成一片普通的土地）→ **19 紅**（頸口不見了、閘門跑到橋上、母土地兩座石座的
  互動半徑被閘門柱擋住）；把 `unclosing-door-78` 的 `workshop.labels` 刪掉 → 2 紅。
- **e2e（1 輪 4 條）**：見上面的第二輪。

### 未做／留給後續

- **契約鍛冶場與護欄崗沒有石碑／刻文小語／會回應的東西／動得了的器物**（與 Phase E 的量器坊同樣的
  範圍控制；那四層的測試只要求既有五區）。理由記在 `findings.md`。
- 兩區的 `bgm_toolcraft.m4a` / `bgm_wards.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、
  把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- 流程與代理（orchestration）剩下 4 關，它的 v2 化排在 Phase G。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

## Phase G — 兩輪刻印（`multi`）＋ 校驗場（`refinery`）＋ 流程與代理收尾（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：第三幕第一次跑**兩輪** —— 刻完第一輪之後，會看到一段**遊戲自己寫好的**神諭回話，
第二輪才動手修它；齒輪工坊西南外緣長出第二座加建 **校驗場**（11 座），
流程與代理補回 **12 座**，既有五區之外的課程遷移到此告一段落。

### 做了什麼

**新題型：兩輪刻印（`multi`）** — `src/prompt/multi.js`

- 是**石碑刻印的變體**：共用 `slots.js` 的刻寫台與 `palm.js` 的結尾，
  送出的是同一段文字、走同一支離線引擎（護欄 3）。
- **輪次是 `flow.slots` 的一個切法**：每一輪只宣告吃幾段（`count`），
  段落全部住在 `flow.slots` 裡，而且 `sum(count) === slots.length`。
  這條契約同時買到三件事 —— 退回石碑刻印時玩家刻出來的字一模一樣、
  **結構上不可能串錯輪次**、測試不必知道題型就能驗「全部選對＝S」。
- **中間那一段回話是遊戲自撰的**（`authored: "game"`），畫面上永遠掛一顆 ⓘ 明講
  「這一段回話是遊戲自己寫好的示範，不是真的模型跑出來的結果」；回話卡不放任何連結。
- **狀態只活在記憶體裡**：切幕／切模式輪次原封不動；重開這一關一律回到第一輪；
  重新整理＝這一關從第一輪重來（誠實的「重新開始」，不為 multi 破例做落地存檔）。
- **6 座**用它：`self-mirror-93`（照自己的鏡）、`echo-workshop-35`（回音工坊）、
  `draft-review-wheel-32`（草稿之輪）、`endless-corridor-86`（走不完的長廊）、
  ＋ backlog 換裝的 `for-newcomer-59`（給沒看過的人）與 `well-pause-22`（取水之後的停頓）。

**流程與代理 12 座**（新蓋 10 ＋ 改造 2）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `subtask-workbench-31` | 拆解工作台（改造） | `chain-serial` | order | `decomposesTask` |
| 2 | `endpoint-stake-81` | 終點的樁 | `outcome-first` | constraint | 🆕`statesSuccessCriteria` |
| 3 | `three-maxims-82` | 三句箴言的柱 | `agent-three-reminders` | choice | `setsPersistence` |
| 4 | `two-end-scale-83` | 兩端的秤 | `agent-eagerness` | tradeoff | 🆕`tunesAutonomyLevel` |
| 5 | `irreversible-gate-34` | 不可逆之門（改造） | `agent-approval-bounds` | workshop | `requiresConfirmation` |
| 6 | `sprawling-site-84` | 越蓋越大的工地 | `agent-scope-drift` | spot | 🆕`limitsScope` |
| 7 | `drawing-room-85` | 審圖房 | `agent-plan-first` | order | 🆕`asksForPlanFirst` |
| 8 | `endless-corridor-86` | 走不完的長廊 | `agent-longhorizon` | **multi** | `setsPersistence` |
| 9 | `handover-table-87` | 交班的石桌 | `agent-state` | workshop | 🆕`definesHandoffState` |
| 10 | `dispatch-window-88` | 派工的窗口 | `agent-subagents` | workshop | 🆕`delegatesWithCriteria` |
| 11 | `nailed-rules-89` | 釘在門上的規矩 | `standing-instructions` | fix | 🆕`extractsStandingRules` |
| 12 | `hourglass-shop-90` | 沙漏工房 | `action-budget` | choice | 🆕`setsActionBudget` |

**校驗場 11 座**（新蓋 9 ＋ 搬家改造 2）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `wrong-door-91` | 走錯門的委託 | `meta-when` | choice | `diagnosesFailureCause` |
| 2 | `echo-workshop-35` | 回音工坊（改造＋搬家） | `meta-iterate` | **multi** | `asksToRefine` |
| 3 | `refinery-ruler-92` | 校驗場的量尺 | `meta-eval` | workshop | 🆕`definesEvalSet` |
| 4 | `self-mirror-93` | 照自己的鏡 | `meta-metaprompt` | **multi** | 🆕`asksModelToRewritePrompt` |
| 5 | `clashing-tablets-94` | 互相牴觸的兩條規矩 | `contradiction-fix` | order | 🆕`decisionTree` |
| 6 | `diagnosis-bench-95` | 診斷台 | `prompt-healthcheck` | spot | `diagnosesFailureCause` |
| 7 | `sevenfold-door-96` | 檢查了七遍的門 | `selfcheck-when` | tradeoff | `asksToVerify` |
| 8 | `empty-handed-inspector-97` | 空手的檢查員 | `verify-with-tools` | fix | `asksToVerify` |
| 9 | `own-carved-ruler-98` | 自己刻的量尺 | `self-rubric` | workshop | 🆕`definesWordedScale` |
| 10 | `half-cast-net-99` | 一次撈不完的網 | `two-stage-filter` | order | `decomposesTask` |
| 11 | `draft-review-wheel-32` | 草稿之輪（改造＋搬家） | `draft-review-refine` | **multi** | `asksToRefine` |

每一座：`scenario` / `mission` / `craft` / `material` / `clue` / `placeholder` / `quickFills` / `sample`
＋ 該題型的第三幕資料 ＋ **石碑刻印後備 `slots`**，rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、
`pass` 2」（C1），`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結。
**題型序列**：orchestration ＝ order・constraint・choice・tradeoff・workshop・spot・order・multi・
workshop・workshop・fix・choice；refinery ＝ choice・multi・workshop・multi・order・spot・tradeoff・
fix・workshop・order・multi —— 兩區最長連續同型都是 **2**，各用了 **8** 種題型。

**12 個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）。
四個是**非單調**的：`limitsScope`（自己又寫「順便」→ 歸零）、`decisionTree`（兩條都寫「一律」→ 歸零）、
`definesWordedScale`（文字級距寫好了又補一個數字分數 → 掉分）、
`setsActionBudget`（兩條上限落在同一個單位 → 只給部分分）。
中文與阿拉伯數字都認（`NUM_G`），英文那一面逐條補了 fixture 與對照解答。

**世界**：`REGION_SITES` 新增 `refinery (-129, 129) r=40, annexOf: 'orchestration'` ——
**第二座沒有橋的加建**，閘門立在 `regionAt()` 的正規化距離分界上。
地貌是「兩面互相照著的鏡」（一條淺谷把院子分成幾乎一樣高的兩半）；
`REGION_ATMOSPHERE`（銀灰、螢火 0.86）、`FLORA`（舊稿板／鏡胚／量規腳）、
`buildRegionProps`（兩兩相對的照面架 ＋ 稿堆，全部 InstancedMesh、零光源）、
地標**會回頭照自己的鏡**（高 20、留白 14、**零實體光源**）、三組故事小景、路網全部跟上。

**知識式軟門檻新開一種條件**：`masteredAny`（任一區精通）——
精通的定義完全沿用 `regionMastery()`，不會有第二套判準；閘門說得出「任何一片土地精通（目前 0）」。

### 驗證

| 指令 | Phase F | Phase G |
|---|---|---|
| `npm run fonts` | CJK 1790 字／1423.8 KB | ✓ CJK **1822** 字／**1447.6 KB**（指紋測試綠） |
| `npm run test:rubric` | 49,756 | ✓ **58,760** |
| `npm run test:playtest` | 1,275 | ✓ **1,642** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,493 全過 | ✓ **2,637 項全過、零 console error、零重跑** |

**世界量測**（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase F | Phase G | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 168,068 | **172,602** | 420,000 |
| 光源（高畫質） | 30 | **32** | 56 |
| 碰撞體（高畫質） | 813 | **856** | 1,400 |
| mesh | 1,790 | **1,977** | — |
| InstancedMesh／實例 | 66 ／ 1,199 | **74 ／ 1,218** | — |
| 低畫質三角形／燈 | 106,440 ／ 16 | **112,284 ／ 17** | — |

新增的兩盞燈：一盞是校驗場的「每區一盞主色補光」（與其他七片土地同一個模式），
另一盞是搬過去的小景裡本來就有的那一盞。**地標本身零實體光源**。

### 先紅後綠（逐條實測）

- **checks（第一次跑）**：12 個新檢查器一上線，rubric 立刻紅 17 條 ——
  12 條「有 fixture」、1 條題型清單、1 條「題型 multi 真的有神廟在用」、
  2 條字型語料、1 條 `v2CheckersLanded` 登記。全部是預期中的紅燈（新東西還沒補齊契約）。
- **playtest（我自己寫的新斷言）**：「只刻完第一輪還沒滿分」**一開始 4 座紅**
  （`well-pause-22` / `echo-workshop-35` / `for-newcomer-59` / `endless-corridor-86` 的第一輪就滿分）。
  **改的是設計不是斷言**：輪次切法改成「第一輪＝先寫一版」。
- **碰撞稽核**：校驗場的照面架有 5 組疊在 `place()` 的退回點上 → 兩種畫質各紅一條
  「有份量卻走得過去」。修法是那一段自己多試幾次、找不到就不擺。
- **加建吃掉母土地**：refinery 上線後 4 個既有物件被改判成 refinery
  （反應物 `orc-chime-draft`、祕密 `echo-shrine`、器物 `orc-brazier-forge`，
  ＋ 我自己新放的小景），各紅一條「落在標示的區域裡」。全部搬回工坊那一側。

### 未做／留給後續

- **校驗場沒有石碑／刻文小語／會回應的東西／動得了的器物**（與量器坊、契約鍛冶場、
  護欄崗同樣的範圍控制）。理由記在 `findings.md`。
- `hourglass-shop-90`（沙漏工房）用 `choice` 上線，§3 指定的 `sim` 留給 Phase H；
  `mould-room-62`（鑄模房）的 `workshop` 仍在 backlog。
- `bgm_refinery.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、把 id 從
  `SYNTH_ONLY_REGIONS` 移走即可。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

**G readiness（2026-08-02）**：9 區／**108 關**（既有 27 關 ＋ 課程 v2 新蓋的 81 座）／
130 條技能中的 **104 條**已經接上自己的神廟（`primarySkillId`）；59 個新檢查器已實作 **51** 個；
`curriculum.json` sha256 未變；存檔 additive（**這一期沒有新增任何欄位**）、reset 正常；
快檢 ＋ playtest ＋ build 全綠。

## Phase H — 轉鈕（`sim`）＋ 減法之庭（`frugality`）：第十區、第三座加建（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：第三幕第一次出現**旋鈕** —— 轉一格，神諭的回話就換一段（全部是遊戲預先寫好的
離線樣本，斷網照樣轉得動）；高原北緣長出第三座加建 **減法之庭**（7 座），
三座舊神廟（火力熔爐／刻度儀之室／沙漏工房）換裝成轉鈕。

### 做了什麼

**新題型：轉鈕（`sim`）** — `src/prompt/sim.js` ＋ `src/data/sim-samples.json`

- 是**石碑刻印的變體**：共用 `slots.js` 的刻寫台與 `palm.js` 的結尾，送出的是同一段文字、
  走同一支離線引擎（護欄 3）。**旋鈕不參與評分**（`api.text` 只回 `stage.text`）。
- **三檔都轉過了才開放刻印** —— 觀察就是這一關的內容，不是可以跳過的過場
  （與推規碑「想通才給刻」同一個文法；刻印只有一個開放入口，測試數 `stage.unlock()` 的呼叫次數）。
- **樣本住在獨立資料層**（`sim-samples.json`，`authored: "game"`），由 `main.js` 開機時
  `registerSimDials()` 註冊 —— `sim.js` 刻意**不 import JSON**，node 端的測試才能直接 import 它、
  自己餵一份樣本進來。樣本壞掉／沒註冊 → `flowKind` 安靜退回石碑刻印（相容契約，rubric 有守）。
- **9 段離線輸出樣本**（3 個旋鈕 × 剛好 3 檔，`SIM_NOTCHES = 3` 是硬性 schema）：
  思考火力 `reasoning_effort`（低火漏掉步驟／中火剛好／高火慢又囉嗦）、
  亂度 `temperature`（1.2 三次三種答案／0.7 還是會飄／0 這一台直接回絕）、
  動作預算（不設上限就查不完／只設回合數等於沒設／兩個單位分開設才收得住）。
- **誠實**：畫面上永遠掛一顆 ⓘ 明講「這些輸出是遊戲預先寫好的示範，不是真的模型跑出來的結果，
  也沒有連到任何服務」；每個旋鈕都寫得出 `condition`（在哪一台機器、哪一個時間點成立），
  那句話永遠跟樣本一起顯示 —— 旋鈕的行為不是普遍真理。
- **斷網完全可玩**：`sim.js` 裡沒有 `fetch`／連線／任何網址（rubric 掃原始碼），
  e2e 再用 `performance.getEntriesByType('resource')` 量一次「整段轉鈕沒有向外要過任何東西」。

**三座 spike（只換第三幕，評分那一面一個位元組沒動）**

| id | 神廟 | 技能 | 旋鈕 | 換裝前 |
|---|---|---|---|---|
| `effort-forge-15` | 火力熔爐 | `knob-effort` | 思考火力 low／medium／high | choice |
| `dial-room-43` | 刻度儀之室 | `knob-temperature` | 亂度 1.2／0.7／0 | choice |
| `hourglass-shop-90` | 沙漏工房 | `action-budget` | 不設上限／只設回合／兩個單位分開設 | choice |

manifest 新增 `phaseH` 區塊逐欄記錄；因為同一關現在有兩個期別講到題型，
`test-rubric` 的「第三幕題型」斷言改成**只跟最後一個講到題型的期別**比對（manifest 只增不改）。

**減法之庭 7 座**（全部新蓋）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `empty-plinth-100` | 空的基座 | `lean-prompt` | fix | `keepsPromptLean` |
| 2 | `twice-copied-101` | 抄了兩遍的抄寫人 | `lean-output` | spot | `keepsPromptLean` |
| 3 | `stacking-order-102` | 疊石的順序 | `cache-static-first` | order | 🆕`staticBeforeVariable` |
| 4 | `piling-table-103` | 越堆越高的桌 | `ctx-compaction` | multi | 🆕`asksToCompact` |
| 5 | `stale-tray-104` | 過期的托盤 | `ctx-pruning` | spot | 🆕`asksToCompact` |
| 6 | `unturnable-page-105` | 翻不動的那一頁 | `ctx-new-chat` | choice | 🆕`carriesForwardEssentials` |
| 7 | `memoryless-artisan-106` | 沒有記憶的工匠 | `ctx-reuse-reasoning` | choice | 🆕`carriesForwardEssentials` |

題型序列 fix・spot・order・multi・spot・choice・choice —— 最長連續同型 **2**（C4），用了 5 種題型；
rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1）；
`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結。

**世界**：`REGION_SITES` 新增 `frugality (0,-82) r=32 flat=27, annexOf: 'foundations'` ——
**第三座沒有橋的加建**，閘門立在高原正北的邊緣 (0,-55.3)。地貌是**整張地圖上最平的一片土地**
（起伏 < 3.2 公尺，因為東西都被搬走了）；`REGION_ATMOSPHERE`（霧最淡、看得最遠、螢火 0.4）、
`FLORA`（空托座／薄墊石／量繩樁）、`buildRegionProps`（空托座 10 ＋ 印子 12，**刻意是別區的一半**）、
地標**空的基座**（高 18、留白 13、**零實體光源**：銘文、光印子、被拿走那件東西的輪廓全部自發光）、
三組故事小景、路網全部跟上。配樂 `REGION_MOODS.frugality`（根音 65.41 全場最低、只有空心音、
鐘聲全場最稀）並登記進 `SYNTH_ONLY_REGIONS`。

**知識式軟門檻**：`REGION_GATES.frugality` 只有一條 `masteredAny: 1`（逐字取自 `regions-v2.json`）。

### 驗證

| 指令 | Phase G | Phase H |
|---|---|---|
| `npm run fonts` | CJK 1822 字 | ✓ CJK **1832** 字／**1454.3 KB**（指紋測試綠） |
| `npm run test:rubric` | 58,760 | ✓ **62,415** |
| `npm run test:playtest` | 1,642 | ✓ **1,768** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,637 全過 | ✓ **2,750 項全過、零 console error** |

**世界量測**（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase G | Phase H | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 172,602 | **179,574** | 420,000 |
| 光源（高畫質） | 32 | **34** | 56 |
| 碰撞體（高畫質） | 856 | **902** | 1,400 |
| mesh | 1,977 | **2,101** | — |
| InstancedMesh／實例 | 74 ／ 1,218 | **84 ／ 1,311** | — |
| 低畫質三角形／燈 | 112,284 ／ 17 | **118,258 ／ 18** | — |

新增的兩盞燈：一盞是減法之庭的「每區一盞主色補光」（與其他九片同一個模式），
另一盞是搬過去的小景裡本來就有的那一盞。**地標本身零實體光源**。

### 先紅後綠（逐條實測）

- **新檢查器一上線 rubric 立刻紅 20 條**（3 條 fixture、3 條 coach、7 條英文對照解答、
  題型清單／關卡數／區域數／合成專用區的契約、字型語料）—— 全部是預期中的紅燈。
- **`carriesForwardEssentials` 的 bad fixture 拿到 0.5 分**（只寫「換一頁」也給部分分）——
  改的是 fixture（換成一個連換頁都沒說的壞寫法），不是放寬檢查器。
- **`twice-copied-101` 的「一片都沒點就已經滿分」**：點碑那一關的原始草稿太短，
  `keepsPromptLean` 直接給滿分 → 這一關不用玩。**改的是設計不是斷言**：
  把要被點掉的那一句加上逐步鷹架，草稿變成真的有病灶。
- **`empty-plinth-100`／`twice-copied-101` 的「只刻第一段就滿分」**：兩關的主檢查都是
  `keepsPromptLean`，第一段（任務）自己就滿足它 → 把第一段改成「這一份是寫給誰看的」
  （不是指令，所以單獨不成立），任務往後挪一段。
- **e2e 第一輪：轉鈕的 `seen` 從 0 開始**（一進來停在某一檔卻沒算看過），連帶 9 條紅。
  修的是 `sim.js`（載入時就把當下那一檔記成看過的 —— 它的回話本來就在畫面上）。
- **e2e 第一輪：加建的頸口有 3 步是虛空**（`coverage ≤ 0.45`）——
  兩片土地的**可站立範圍**沒有重疊。第一版 `(0,-90) r30 flat22` 的可站立半徑只有 ~26.5，
  高原走得到 56.3，中間空了 7 公尺。最後定在 `(0,-82) r32 flat27`（可站立到 29.6，重疊 3.9 公尺）。
- **e2e 第二／三輪：76 條紅、同一個地方中斷**（而且與第一輪不同 —— 是真的回歸）。
  診斷出來的原因很有意思：手感量測是「一路往北走」的，Phase H 之後正北 54 公尺處
  多了一道門（減法之庭的頸口），走進自動詢問半徑 → 門一問就把操控權交給對話框 →
  後面每一個按鍵都落空。**這是對的遊戲行為**（Phase 29 的設計），所以修的是測試：
  量鏡頭之前先把門收起來、回到出生點，並把「它真的會問」記成一條斷言。
- **e2e 第四輪：圖鑑那一張卡的官方出處數是 0** —— 那一輪的存檔是「什麼都還沒學」的，
  七條都還是剪影。斷言改成驗「七條都是剪影」（收集之後才長出出處，那件事量器坊那一節已經驗過）。

### 未做／留給後續

- **減法之庭沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物**（與量器坊、契約鍛冶場、
  護欄崗、校驗場同樣的範圍控制）。
- §3 指定的第四座 `sim`（`contrast-same-name`「同名的兩個旋鈕」）屬 Phase J 的區域，本期不做。
- `bgm_frugality.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、把 id 從
  `SYNTH_ONLY_REGIONS` 移走即可。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

**H readiness（2026-08-02）**：10 區／**115 關**（既有 27 關 ＋ 課程 v2 新蓋的 88 座）／
130 條技能中的 **111 條**已經接上自己的神廟（`primarySkillId`）；59 個新檢查器已實作 **54** 個；
`curriculum.json` sha256 未變；存檔 additive（**這一期沒有新增任何欄位**）、reset 正常；
快檢 ＋ playtest ＋ build ＋ 完整 e2e 全綠、console error 為 0。

## Phase I — 觀象臺（`sight`）：第十一片土地、第三塊新地形（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：正東偏北長出一片斜著抬起來的高地 **觀象臺**，8 座神廟教「看圖、生圖、生影片、
說話的聲音、做東西的樣子」怎麼寫成 prompt —— 而**遊戲仍然只評 prompt 的結構**：
沒有引進任何一張圖、一段影片、一個音檔，整段玩下來零外部請求。這一期不開新題型。

### 做了什麼

**8 座神廟**（全部新蓋；沒有搬動或改造既有 27 關中的任何一關）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 |
|---|---|---|---|---|---|
| 1 | `first-window-107` | 觀象臺的第一格窗 | `mm-basics` | choice | 🆕`pointsAtRegion` |
| 2 | `blurred-corner-108` | 看不清的那一角 | `mm-troubleshoot` | fix | 🆕`pointsAtRegion` |
| 3 | `subjectless-picture-109` | 無主體的畫 | `img-generate` | fix | `positiveFraming` |
| 4 | `overcorrected-plate-110` | 改壞的那張 | `img-edit` | multi | 🆕`preservesPriorState` |
| 5 | `storyboard-wall-111` | 分鏡牆 | `video-prompt` | order | 🆕`namesShotElements` |
| 6 | `breathless-stone-112` | 唸太快的傳聲石 | `tts-writing` | fix | 🆕`usesProsodyPunctuation` |
| 7 | `same-three-faces-113` | 千篇一律的門面 | `design-anti-slop` | tradeoff | `positiveFraming` |
| 8 | `one-button-114` | 改了一顆鈕，塌了一面牆 | `fe-spec` | fix | 🆕`namesStackAndScope` |

題型序列 choice・fix・fix・multi・order・fix・tradeoff・fix —— 最長連續同型 **2**（C4），
用了 5 種既有題型（**這一期刻意不開新題型**：新地形 ＋ 8 座 ＋ 5 個檢查器已經夠重）。
rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1）；
`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結
（Google Files／Video understanding／Image generation／Veo、xAI TTS、Anthropic Sonnet 5 設計預設值、
OpenAI GPT-5.6 前端指引）。

**畫面上的素材：每一座都是「抄寫人寫下來的文字」**（逐座決定，記錄如下）

| 神廟 | 素材 | 為什麼 |
|---|---|---|
| 第一格窗 | 觀測紀錄（圖的內容 ＋ 影片長度與時間點） | 要教的是「指哪一塊 / 指哪一秒」，那件事寫成文字比放一張圖更清楚 |
| 看不清的那一角 | 收據抄本的描述 ＋ 校對人現在的問話 | 「字太小」這件事用文字說得出來；真的放一張糊掉的圖反而讀不到 |
| 無主體的畫 | 製圖人第三版的四句委託 | 病灶是那四句話本身，不是圖 |
| 改壞的那張 | 五次改動的紀錄 | 要看的是「第三次把第一次改掉了」，那是一份日誌 |
| 分鏡牆 | 牆上現有的石版 | 石版本來就是文字（而且第三幕真的把它們排起來） |
| 唸太快的傳聲石 | 一整段沒有標點的話 | 這一關的素材本來就是文字 |
| 千篇一律的門面 | 三張稿的共同點 ＋ 門面師寫過的話 | 要教的是「不要那樣」為什麼沒用 |
| 一顆鈕一面牆 | 交出去的那一句 ＋ 回來的結果 | 病灶是那一句話 |

**沒有任何一座使用程序化示意圖或圖檔** —— 判準寫成可執行的規則（WORLD.md §3.3c）：
資料層不得出現媒體檔名、畫面上不得出現 `<img>` / `<video>` / `<audio>`、整段零外部請求。
因此**本期沒有新增任何媒體資產，`public/LICENSE.md` 不需要新增條目**。

**5 個新檢查器**（`src/challenges/checks.js`，規格出自 curriculum-v2 §7.4）
`pointsAtRegion`（方位／編號／框起來的那一塊／`MM:SS` 時間戳 ＋ 要在那裡拿到什麼）／
`preservesPriorState`（一次一改 ＋ 明講保留前一步；**非單調**：一次塞三個以上的修改就掉分）／
`namesShotElements`（主體／動作／場景／運鏡／構圖／氣氛／聲音的**類別數**）／
`usesProsodyPunctuation`（語音標記或「句子切短 ＋ 真正的停頓記號」；**非單調**：
標點做好了卻還留著「請唸慢一點」就掉一階）／
`namesStackAndScope`（指名框架 ＋ 限定只動哪一塊 ＋ 沿用既有設計系統，三件事缺一不可）。
全部中英雙語（英文對照解答逐座驗過）。

**順手補的兩處既有檢查器**（不是放寬，是補漏）：`ZH_TASK_VERBS` 補上「畫一／畫成」
（生圖題的委託句本來會被判成「沒有任務動詞」），`pointsAtRegion` 另加一組英文的「要做什麼」動詞。

**世界**：`REGION_SITES` 新增 `sight (134, -18) r=34 flat=27`，**自己一條橋**；
地貌是「一片斜著抬起來的高地」（由西南橋頭往東北升 ＋ 幾道很淺的觀測溝）；
`REGION_ATMOSPHERE.sight`（霧最淡、看得最遠 fogFar 344、冷藍紫）、
`FLORA.sight`（碎鏡片／礦塊／測桿三種剪影）、`buildRegionProps` 的觀測架（柱 ＋ 自發光的環，
一律往東北仰 52 度）與落鏡（平躺的薄鏡片）、地標 **朝天的鏡**（高 21、留白 14、**零實體光源**，
放在 `(149, -31)` 的上坡側而不是正中央 —— 中央讓給石座）、三組故事小景、橋／閘門／路網全部自動跟上。
8 座石座落點用「候選格點 ＋ 隨機重啟貪婪」算出來，再**在 node 裡把世界蓋起來**逐座掃過
24 個方向 × 4 段距離（高低兩種畫質）。

**知識式軟門檻**：`REGION_GATES.sight` 只有 `mastered: ['foundations']` ——
這是**新開的第三種知識式條件**（前兩種是 `skills` / `regionSkills` 與 `masteredAny`），
問的是「你已經把**哪一片**土地學完了」。判準完全沿用 `regionMastery()`，不會有第二套。

**配樂**：`REGION_MOODS.sight`（根音 164.81 全場最高、截止頻率 1100 全場最高、
鐘聲間隔 7 秒最短之一、曲名「鏡裡的星」）並登記進 `SYNTH_ONLY_REGIONS`。

### 驗證

| 指令 | Phase H | Phase I |
|---|---|---|
| `npm run fonts` | CJK 1832 字／1454.3 KB | ✓ CJK **1847** 字／**1464.5 KB**（指紋測試綠） |
| `npm run test:rubric` | 62,415 | ✓ **67,077**（含 playtest 的 1,919） |
| `npm run test:playtest` | 1,768 | ✓ **1,919** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,750 全過 | ✓ **2,890 項全過、零 console error、零重跑** |

**世界量測**（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase H | Phase I | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 179,574 | **186,596** | 420,000 |
| 光源（高畫質） | 34 | **36** | 56 |
| 碰撞體（高畫質） | 902 | **961** | 1,400 |
| mesh | 2,101 | **2,252** | — |
| InstancedMesh／實例 | 84 ／ 1,311 | **93 ／ 1,403** | — |
| 低畫質三角形／燈 | 118,258 ／ 18 | **125,156 ／ 19** | — |

新增的兩盞燈：一盞是觀象臺的「每區一盞主色補光」（與其他十片同一個模式），
另一盞是小景「一次改了五處的那一張」裡本來就有的製圖桌燈。**地標本身零實體光源。**

### 先紅後綠（逐條實測）

- **新檢查器一上線 rubric 立刻紅 29 條**（6 條 fixture、8 條英文對照解答、
  區域數／關卡數／合成專用區／檢查器清單的契約、字型語料、以及三件真的做錯的事，見下）——
  全部是預期中的紅燈。
- **穿模稽核紅了兩類（真的做錯）**：碎鏡片（1.15 × 1.7 × 0.24）**轉過角度之後**外接盒的
  最薄兩軸都 ≥ 0.9 → 依 Phase 20 的鐵則要擋人，改成 `solid: true`；
  觀測架的環底緣離地只有 1.39–1.58 公尺（< `FLOAT_MIN` 1.6）→ 柱子加高到 3.2、環抬到 3.62×scale。
- **`breathless-stone-112` 的石座周圍 5 公尺走不到（3 個方向被擋）＋ 地標離石座只有 15.8 公尺**
  → 改的是落點：地標從區域正中央移到上坡側 `(149, -31)`、8 座石座重算（landmark 淨空 18.6、
  小景淨空 13、彼此 ≥ 13.6），重算後 24 方向 × 4 段距離全部走得到。
- **`[sight] 全收集 → 精通` 紅**：全破走訪沒有走完觀象臺 —— 這是**測試該補的**，
  補上 `clearRegion('sight')` 與「撰寫基本功整片精通 → 觀象臺自己開了」那一條。
- **正確答案的位置太集中（173 / 450 段不在第一個，門檻 0.4）**：新增的 35 段幾乎都把正解放第一個
  → 奇數段把第一個選項移到最後（190 / 450 = 0.42）。
- **字型總量兩次超出 1.5 MB 預算**（1503840 → 1500416 bytes）：改的是**用字**不是預算 ——
  把 9 個只出現在註解／風味文字裡的生僻字換掉（撬／玻璃／甜／弧／貪婪／喘／啞／醉／晶…），
  最後停在 1464.5 KB。

### e2e 的三輪（誠實記錄）

① **第一輪就全綠**：**2,890 項全過、零 console error、零重跑**（Phase H 是 2,750，新增 140 項）。
   GPU：SwiftShader 軟體渲染、每幀約 203 ms；`AGENTS.md` 登記的動畫時序 flaky 家族
   （拖曳 / 風鈴 / 火盆亮度）這一輪一條都沒出現。
② **刻意破壞的那一輪**（為了守「新斷言先紅一次」）：同時做兩件壞事 ——
   在朝天的鏡裡偷偷加一盞 `PointLight`、把 `REGION_GATES.sight` 的 `mastered: ['foundations']`
   換成 `masteredAny: 1`。觀象臺那一段當場變成 `.x.x.............x…`，紅的正是
   「『撰寫基本功整片精通』就是觀象臺唯一的缺口」「門上說的是中文區域名」
   「朝天的鏡一盞實體光源都沒加」這三條；順帶讓既有的「純鍵盤走完一圈」也紅了 10 條
   （門檻換了，走訪路線就跟著變）——證明這組斷言真的在守東西。
   確認之後把兩處還原（md5 逐檔比對回綠燈時的狀態），並重跑 rubric ＋ playtest ＋ build 全綠。
   ⚠️ 破壞那一輪跑到觀象臺就手動中止（證據已經拿到），收尾時把測試自己的 vite（5199）與
   無頭 Chrome 全部殺乾淨；使用者的 5175 一根手指都沒碰。

### 未做／留給後續

- **觀象臺沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物**（與量器坊、契約鍛冶場、
  護欄崗、校驗場、減法之庭同樣的範圍控制）。
- **§3 指定的題型全數照做，沒有新增 backlog**；既有的 backlog（鑄模房 `so-basics` → `workshop`）不變。
- `bgm_sight.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。

**I readiness（2026-08-02）**：11 區／**123 關**（既有 27 關 ＋ 課程 v2 新蓋的 96 座）／
130 條技能中的 **119 條**已經接上自己的神廟（`primarySkillId`）；59 個新檢查器已實作 **59** 個；
`curriculum.json` sha256 未變；存檔 additive（**這一期沒有新增任何欄位**）、reset 正常。

---

## Phase J1 — 分歧之廳（`divergence`）：第十二片土地、新題型「拆碑」、唯一一道硬門檻（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：中央高原東側的那道縫裡蓋起一座**廳**，9 座神廟教「兩家官方說法相反時怎麼辦」
與「換模型的時候要改什麼」；新增第十一種題型 **拆碑（`reverse`）**；
並且開了整個世界**唯一一道不能先行前往的門**（四區精通）。

### 做了什麼

**9 座神廟**（全部新蓋；既有 27 關與其他 11 區一格都沒動）

| # | id | 神廟名 | 技能 | 題型 | 主檢查 | 出處（廠家） |
|---|---|---|---|---|---|---|
| 1 | `two-faced-pillar-115` | 兩面的柱 · 身分 | `contrast-persona` | tradeoff | `hasRole` | Mistral |
| 2 | `two-faced-pillar-116` | 兩面的柱 · 記憶 | `contrast-carry-thinking` | tradeoff | `carriesForwardEssentials` | DeepSeek |
| 3 | `same-name-dial-117` | 同名的兩個旋鈕 | `contrast-same-name` | sim | `mentionsParameters` | xAI |
| 4 | `sealed-scale-118` | 封起來的刻度 | `migrate-params-deprecated` | spot | `mentionsParameters` | Google |
| 5 | `changed-stair-119` | 換了介面的階梯 | `migrate-cot-to-knob` | fix | `mentionsParameters` | Google |
| 6 | `old-reminder-120` | 舊叮嚀 | `migrate-recheck-concise` | fix | `hasConstraint` | Anthropic |
| 7 | `patched-robe-121` | 貼滿補丁的舊袍 | `migrate-strip-patches` | spot | `keepsPromptLean` | xAI |
| 8 | `moving-list-122` | 搬家的清單 | `migrate-checklist` | order | `decomposesTask` | Anthropic |
| 9 | `rewritten-stele-123` | 會改字的碑 | `era-current-rules` | reverse | `asksToCiteSources` | Google |

題型序列 tradeoff・tradeoff・sim・spot・fix・fix・spot・order・reverse ——
**與 curriculum-v2 §三 指定的那一串逐格相同**，最長連續同型 2（C4），用了 6 種題型。
rubric 一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1）；
`source` 逐條回查 `skill-codex-v2.json` 裡解析自 master list 的真實官方連結。
**這一期一個新檢查器都沒開**（59/59 早就實作完）。

**反差題：先發模型卡、再出題，兩家的立場並排掛出處**
`tradeoffFlow.rounds[].card` 新增選填的 `sources[]`，渲染成「神諭原典：〈文件名〉↗」的可點連結；
沒給就完全不顯示，既有的雙面碑一個像素都沒變。兩張卡秤完之後兩條判詞 ＋ 各自的出處
**並排留在「秤過的帳」上**。測試強制：`url` 必須是這條技能自己的官方清單裡那一個、
`name` 逐字等於 `docName`、兩張卡加起來至少兩家。正解隨模型卡翻面（`favours` 契約未動）。

**新題型：拆碑（`reverse`）** —— `src/prompt/reverse.js`（+`.reverseboard` 樣式）
牆上釘著一份**已經寫得很好**的舊委託，被拆成幾塊；玩家一塊一塊替它貼上名字
（「這一塊是為了什麼在這裡」）。它是**石碑刻印的變體**：共用 `slots.js` 的刻寫台與
`palm.js` 的結尾，送出的是同一段文字、走同一支離線引擎（護欄 3）。
- 貼錯 → 「碑不收這個名字」＋ 就地長出一句白話教學，不扣分、不前進、不跳失敗面板。
- **一定有一片誘餌名牌**（從頭到尾都不是正解）—— 那就是這一關的「轉」。
- **`Esc` 是「拆回來」不是「關面板」**：先把最後貼上去的那一塊拆回來、焦點回到它身上、
  `aria-live` 講出來；沒有東西可拆才冒泡收面板。
- 整份拆完才 `stage.unlock()`（想通才給刻，與推規碑同一個文法）。
- 鍵盤：方向鍵 roving、`Enter` / 數字鍵貼上、`prefers-reduced-motion` 只關動不關回應。
- 相容契約未變：缺 `reverseFlow` / 缺 `slots` / 未知 kind → 一律退回石碑刻印。

**轉鈕的第 4 組樣本**：`sim-samples.json` 新增 `same-name`（三檔＝三台機器、
**送出去的是同一行設定**、三段回話彼此不同、寫得出 `condition` 與年份），掛在
「同名的兩個旋鈕」上；旋鈕仍然不參與評分。

**世界**：`REGION_SITES` 新增 `divergence (76, 17) r=29 flat=25 annexOf: 'foundations'`
（**第四座加建、沒有自己的橋**，閘門立在頸口 `(51.8, 11.6)`）；
地貌是「一塊被鋪平的廣場」（中央抬高一階 ＋ 兩道互相交錯的淺溝）；
`REGION_ATMOSPHERE.divergence`（青灰、曝光 1.14 全場最高 —— 廳裡沒有暗處）、
`FLORA.divergence`（半塊碑／鎮石／量繩桿）、`buildRegionProps` 的對柱與落碑（零光源）、
地標 **兩面的柱**（五根等高的柱子，兩面刻著相反的神諭，高 22、留白 14、
**零實體光源**，放在 `(90, 31)` 的外側 —— 中間讓給石座）、
`REGION_NEIGHBORS` / `SYNTH_ONLY_REGIONS` / `REGION_MOODS.divergence`（「兩面之詞」：
根音 138.59、同時放大三度與小三度、三個聲部同一種音色、失諧 8 —— 永遠像有兩台機器在說話）。

**唯一一道硬門檻**：`REGION_GATES.divergence` = `{ hard: true, knowledge: { masteredAny: 4 } }`
（規格逐字取自 `regions-v2.json`）。三層實作：資料層的旗標、`gate.js` 的對話框
**不畫「直接前往」**（只留「先留下修行」與 `Esc`）、`skipGate()` 在進程層再擋一次
—— 分歧之廳永遠不會被寫進 `skippedGates`。其餘 11 區的先行前往一字未動。

**一條新的世界硬規則**：**加建的地界不得吃掉別人的橋**。
`regionAt()` 新增「點落在別人的橋上時，橋說了算」（只對 `annexOf` 的加建生效）——
不這樣做的話，通往觀象臺的那條橋會在分歧之廳解鎖之前整條走不過去。

**搬了一座石座**：`first-rail-10` 由 `(49, 20)` → `(44.5, 23.5)`（往北 5.7 公尺）——
新頸口的閘門柱子會卡進它的互動圈。**只動座標**，題目／評分／流程一個位元組沒動
（同 Phase H 搬 `wordfork-12` 的前例）。

### 世界量測（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | Phase I | Phase J1 | 上限 |
|---|---:|---:|---:|
| 三角形（高畫質） | 186,596 | **191,462** | 420,000 |
| 光源（高畫質） | 36 | **37** | 56 |
| 碰撞體（高畫質） | 961 | **991** | 1,400 |
| 網格 | 2,252 | **2,401** | — |
| 低畫質三角形／燈／碰撞體 | 125,156 / 19 / — | **130,000 / 20 / 825** | — |
| 穿模稽核（高／低畫質） | 0 / 0 | **0 / 0** | 0 |

唯一新增的那一盞燈是「每區一盞主色補光」（與其他六片新土地同一個模式）；
**地標零實體光源**。9 座石座在高／低兩種畫質下 24 個方向 × 4 段距離全部走得到；
彼此最小間距 **13.69** 公尺；頸口最低覆蓋 **0.919**（> 0.45 的可站立門檻）；
中央高原 15 座石座的區域判定一座都沒有改變。

### 驗證

| 指令 | Phase I | Phase J1 |
|---|---|---|
| `npm run fonts` | CJK 1847 字／1464.5 KB | ✓ CJK **1847** 字／**1464.5 KB**（指紋測試綠） |
| `npm run test:rubric` | 67,077 | ✓ **71,927**（含 playtest 的 2,113） |
| `npm run test:playtest` | 1,919 | ✓ **2,113** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,890 全過 | ✓ **3,050 通過／3 失敗**（全部是已登記的拖曳 flaky，見下） |

契約數字（`scripts/expected-counts.json`）：`challenges` 123 → **132**、
`v2ImplementedRegions` 11 → **12**（12 區到齊）、`flowKinds` 10 → **11**（加 `reverse`）、
`synthOnlyRegions` 加 `divergence`、新增 `divergenceShrines: 9`。

### 先紅後綠（逐條實測）

一次**刻意破壞**跑出 **15 條紅燈**（還原後全綠）：

| 破壞 | 紅的斷言 |
|---|---|
| 在「兩面的柱」裡偷加一盞 `PointLight` | 兩面的柱一盞實體光源都沒加 |
| 拿掉 `REGION_GATES.divergence.hard` | 分歧之廳是硬門檻／整個世界只有這一道硬門檻／`gateStatus` 說得出這是硬門檻／門上的字不提「先行前往」／門上的字說得出這一道要走過去才開／先行前往開不了這一道門／`skipGate` 明講理由／被擋下來之後仍然鎖著／不會被寫進 `skippedGates`／一道門都沒被記成先行前往（共 10 條） |
| 拿掉第一張模型卡的 `sources` | 第 1 張卡掛得出官方出處／兩張卡加起來至少兩家 |
| 把一片名牌的 `miss` 改成「短」 | 名牌「role」貼錯時有教學回饋（rubric ＋ playtest 各一條） |

另外 e2e 的第一輪本身就是一次真實的紅燈證據：新寫的 13 條斷言中有 7 條
（走到門前門自己問、四區精通自己開、切自由書寫…）先紅，逐條查出原因後才綠（見下）。

### e2e 的三輪（誠實記錄）

① **第一輪：3,027 通過／25 失敗。** 分成三類：
   - **既有的動畫時序 flaky（12 條）**：Phase 23 純鍵盤那一段的手掌印沒按下去
     （連帶結果／評價／通關／分享共 9 條）＋ Phase 27 的滑鼠拖曳 3 條。
     兩組都是 AGENTS.md 已登記的家族（固定 sleep ＋ 高負載），
     且同一段程式在同一輪的其他地方（Phase I／J1 的手掌印）照樣過。
   - **我自己漏改的契約（1 條）**：Phase H 的「三座神廟用轉鈕」→ 現在是 4 座。
   - **新斷言 ＋ 一條 Phase I 舊斷言的固定 sleep 問題（12 條）**：
     `teleport → sleep 900ms → 讀遊戲迴圈的結果` 在**剛 reload 完**的那幾秒可能連一個影格
     都沒跑完（世界要重蓋、shader 要編譯）。依 AGENTS.md 改成**輪詢**（poll until）：
     Phase I 的「HUD／配樂跟著換到觀象臺」、Phase J1 的「走到門前門自己問」。
     另外兩條是我測試自己寫錯：`content.evaluate()` 不存在（改成種存檔 ＋ 走
     `recordResult` 觸發 `refreshUnlocks`）、切模式應該用 `setMode()` 而不是 `KeyM`
     （結果面板開著時單鍵快捷本來就不吃）。
② **第二輪：3,048 通過／5 失敗** —— 第一輪那 12 條「動畫時序」全部自己綠了
   （手掌印、拖曳、分享、Phase I 的跨區），剩下的 5 條全部是同一件事：
   **「走到門前，門自己問了一句」沒有觸發**。查出來的原因不是測試寫錯，是**世界做錯**：
   分歧之廳的內圈（`flat`）原本設 21，頸口閘門正下方的覆蓋只有 0.84 →
   `terrainHeight` 的 `-(1 - cover) * 34` 讓那裡凹下去 5 公尺；
   `nearestGate()` 量的是 3D 距離，站在門前 5 公尺處的垂直落差 6.4 公尺
   直接把 7.5 公尺的判定半徑吃掉。**修的是世界不是測試**：內圈提到 25
   （廣場本來就該是平的），閘門底下的覆蓋回到 1.0，頸口最低覆蓋 0.770 → **0.919**；
   並新增一條 invariant「閘門正下方是平地（coverage > 0.98）」把這個坑釘死。
③ **第三輪（本輪結果）：3,050 通過／3 失敗** —— 剩下的三條全部是
   AGENTS.md 已登記的**拖曳家族**（Phase 27 排序刻印的「用真滑鼠把石版拖到最上面」
   那一組，三條是同一次拖曳的連帶）。它在第一輪紅、第二輪**綠**、第三輪又紅 ——
   跟這一期的改動沒有交集（分歧之廳與拆碑一條都沒碰到排序刻印），
   純粹是軟體渲染 ＋ 高負載下逐格 `mouseMoved` 的時序問題。
   **Phase J1 新寫的 13 組斷言（約 150 項）第三輪全數通過，全程零 console error。**
   （要根治的話得把那一段改成輪詢式，屬於測試品質的獨立工作，不在這一期的範圍。）

### 未做／留給後續

- **分歧之廳沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物**（與其他六片新土地
  同樣的範圍控制）。
- **12 座應用關、大師層印記 `seals[]`、拆掉 D2 相容層**屬於 J2／J3，這一期一格都沒動。
- `bgm_divergence.m4a` 尚未錄製；補上時只要在 `BGM_TRACKS` 加一行、把 id 從
  `SYNTH_ONLY_REGIONS` 移走即可。
- 未 commit／push；未動 `CLAUDE.md`、`task_plan.md`、`README.md`、`vite.config.js`、
  port 5175、`src/data/curriculum.json`（sha256 仍綠）。

**J1 readiness（2026-08-02）**：**12 區／132 關**（既有 27 關 ＋ 課程 v2 新蓋的 105 座）／
130 條技能中的 **128 條**已經接上自己的神廟（`primarySkillId`）——
剩下兩條（`clear-specific` / `clear-positive`）是既有的清晰之門與迷路的自動機，
它們走的仍然是 Phase A 的 `primaryTechniqueId`（`clarity-03` / `positive-01`），
補上 `primarySkillId` 這件事屬於 J3 拆掉 D2 相容層時一起做；59 個新檢查器已實作 **59** 個；
`curriculum.json` sha256 未變；存檔 additive（**這一期沒有新增任何欄位**）、reset 正常。

## Phase J2 — 12 座應用關（試煉）＋ 土地印記 ＋ 大師層印記（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：每一片土地的地標腳下多了一座**試煉** —— 它不教任何新技巧
（第二幕整幕不存在），只把你在那片土地上**已經學會的**那幾條組合起來考一次；
通過就把那片土地的**印記**收進來，另外開一層完全選配的**大師層印記**。

### 12 座應用關（區域／試煉名／型式／要求組合／候選列數）

| 區域 | id | 試煉名 | 型式 | 要求組合（候選技能 → 檢查器） | 候選列 |
|---|---|---|---|---|---:|
| 撰寫基本功 | `council-envoy-06`（沿用） | 議會信使 | 自由書寫 | clear-specific→hasConstraint／context-why→explainsWhy／struct-delimiters→usesRareDelimiter | 3 |
| 示範與推理 | `triple-echo-124` | 三重迴聲的考題 | 合尺 | fewshot-basics→hasFewShot／cot-explicit→hasStepByStep／knob-effort→mentionsParameters | 3 |
| 脈絡與長文 | `archive-seal-25`（沿用） | 檔案庫封印 | 自由書寫 | long-query-last→putsQuestionLast／ground-strict→groundsInContext／ground-out→givesOutForUncertainty | 3 |
| 流程與代理 | `nightlong-site-125` | 整夜的工地 | 派送／分流 | chain-serial→decomposesTask／outcome-first→statesSuccessCriteria／agent-approval-bounds→requiresConfirmation | 3 |
| 角色與參數 | `full-cast-theatre-126` | 全員到齊的劇場 | 排序 | role-basics→hasRole／hierarchy→ranksInstructions／skeleton-ptcf→specifiesFormat＊ | 3 |
| 量器坊 | `one-pour-cast-127` | 一次成形的鑄件 | 合尺 | fmt-specify→specifiesFormat／len-preserve→saysWhatToPreserve／answer-anchor→hasFallbackCategory | 3 |
| 契約鍛冶場 | `unwatched-forge-128` | 無人看管的工坊 | 派送／分流 | tool-description→definesTools／tool-when-not→statesToolTriggers／tool-ask-missing→givesOutForUncertainty | 3 |
| 減法之庭 | `one-line-left-129` | 只剩一句話 | 自由書寫 | lean-prompt→keepsPromptLean／ctx-pruning→asksToCompact＊／cache-static-first→staticBeforeVariable | 3 |
| 校驗場 | `who-can-mend-130` | 誰改得動這一份 | 拆碑 | meta-iterate→asksToRefine／meta-eval→definesEvalSet／contradiction-fix→decisionTree | 3 |
| 護欄崗 | `letters-in-disguise-131` | 假扮成委託的攻擊 | 點碑 | inj-concept→hasDelimiters／inj-input-channel→usesRareDelimiter／guardrail-hitl→requiresConfirmation | 3 |
| 觀象臺 | `still-to-reel-132` | 一張圖到一支片 | 排序 | mm-basics→pointsAtRegion／img-generate→positiveFraming／video-prompt→namesShotElements | 3 |
| 分歧之廳 | `three-machines-133` | 三台機器，同一題（終章） | 雙面碑 | contrast-persona→hasRole／contrast-carry-thinking→carriesForwardEssentials／migrate-recheck-concise→hasConstraint | 3 |

型式分佈＝**自由書寫 3／合尺 2／派送 2／排序 2／拆碑 1／點碑 1／雙面碑 1**，
與 `curriculum-v2.md` §5.2 逐格相同（測試強制）。
＊ 兩處偏離設計表，理由見 `findings.md`：
`skeleton-ptcf` 與 `role-basics` 的主檢查都是 `hasRole`（同一把尺不能量兩次）→ 前者改用 PTCF 的 F；
`len-preserve` 的神廟在 Phase E 就搬去量器坊了（候選必須屬於本區）→ 減法之庭改用 `ctx-pruning`。

每一座的 rubric 都是「**地基 `assignsTask` 0.5 ＋ 3 條候選 × 2 分**」，
兩座合尺各多一列非單調的 `avoidsPressureLanguage`（0.5、地基）——
不然「全部石片都挑上去」永遠合尺（見 findings）。

### 動態 rubric 與門檻公式

資料層宣告候選列（`candidate: true` ＋ `skillId`），開關卡時用 `knowsSkill()` 過濾，
門檻用同一支 `trialPass()` 重算：

```
pass = max(2, round(入選權重總和 × 0.5 × 2) / 2)      // src/challenges/trial.js
```

四種情境實測（以三重迴聲為例，候選 3 條 × 2 分 ＋ 地基 0.5 ＋ 壓力尺 0.5）：

| 已學 | 入選列 | 補位（誠實標出） | 總權重 | 門檻 | 示範解答 |
|---|---:|---:|---:|---:|---|
| 0 條 | 2（照 `order` 補） | 2 | 5.0 | 2.5 | S |
| 1 條 | 2 | 1 | 5.0 | 2.5 | S |
| 2 條 | 2 | 0 | 5.0 | 2.5 | S |
| 全部 | 3 | 0 | 7.0 | 3.5 | S |

**絕不軟鎖**：門檻永遠 ≥2、永遠 < 總權重；「打得開卻過不了」與「打不開」都不存在。
12 座 × 三種情境的示範解答全部 ≥A（實測全部 S、每一條檢查滿分），
弱起手在三種情境下都不過關。

### seals 與大師層印記

存檔新增四欄，全部純加法、`normalize()` 補空陣列、去重、reset 清乾淨、
**一格都不影響解鎖**（rubric 靜態掃描 `progression.js` 確認）：

| 欄位 | 內容 | 判定 |
|---|---|---|
| `seals[]` | 12 枚土地印記（區域 id） | 通過該區試煉就入袋，冪等 |
| `penlessSeals[]` | 無筆之印 ✒ | 教學神廟：沒用快速填入／技巧積木、沒開提示球、**範例從沒被翻開過**、刻印零退回、**開關卡以來第一次呈遞**就 S |
| `scribeSeals[]` | 默寫之印 ✍ | 教學神廟：**自由書寫模式**拿到 S（同樣要求範例從沒被翻開過） |
| `samplesSeen[]` | 翻開過範例的關卡 id | 大師層的**防作弊面** —— 永久記著，關掉重開再拿 S 也不算 |

推算（不落地）：**一區純手**＝該區教學神廟全部拿到無筆之印；
**分歧之證**＝分歧之廳 9 座全通 ＋ 終章試煉 S。
應用關**不發**大師層印記；沒給判定材料時一律不發（寧可漏發不可誤發）。

**畫面**：圖鑑徽章下面多一塊安靜的「土地印記」（12 格 ＋ 大師層計數），
每座拿到印記的神廟旁邊一枚 ✒／✍ 小記號，通過試煉的土地卡上一行「試煉已通過」；
HUD 的目標列後面加一個「· ✦ 印記」。

### 世界

12 座試煉的石座落點由掃描器求出（區域內、`coverage > 0.79`、四周走得到、
離地標 ≥18、離所有石座 >13、離橋的主動線 ≥8.5、避開小景／石碑／刻文小語／
器物／祕密／反應物／閘門），並讓 13 座既有石座**只動座標**讓位（最大 12.6 公尺）。

**護欄崗是唯一一處結構性改動**：它半徑 26、地標就站在正中央、淨空 13 ——
「石座離地標 ≥18」把整個內圈排除掉，**放不下第六座**（掃描器實測 0 個落點）。
放大半徑到 27／28／30 都排不出六座，而且 ≥28 會讓母土地的「引文閱覽台」
被新道具擦到。**裁決**：地標讓到邊緣 (101,-142) → **(92.5,-153.5)**，
中心 (101,-142) → **(108,-143)**、半徑 26 → **27**、內圈 18 → **20**，
才空得出六座（實測最小間距 14.53）。母土地一寸都沒被吃掉（142 關逐關驗）。

### 契約數字

| 契約 | Phase J1 | Phase J2 |
|---|---:|---:|
| `challenges` | 132 | **142**（130 教學神廟 ＋ 12 應用關） |
| `applicationTrials` | — | **12**（新增） |
| `foundationsShrines` | 15 | **14**（這一格從此只算教學神廟） |
| `groundingShrines` | 13 | **12**（同上） |

### 驗證

| 指令 | Phase J1 | Phase J2 |
|---|---|---|
| `npm run fonts` | CJK 1847／1464.5 KB | ✓ CJK **1855**／**1463.4 KB**（69 檔語料；先撞到 1.5 MB 硬牆，換掉 11 個新字才回到預算內） |
| `npm run test:rubric` | 71,927 | ✓ **76,538**（含 playtest 的 2,372） |
| `npm run test:playtest` | 2,113 | ✓ **2,372** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 3,050 通過／3 失敗 | ✓ **2,965 通過／9 失敗**（9 條全部是同一組已登記的 flaky，見下） |

### 先紅後綠（逐條實測）

e2e 第一輪本身就是最好的紅燈證據 —— 它抓到一個**真 bug**：

| 紅的東西 | 原因 | 修法 |
|---|---|---|
| `console.open()` 丟 `Cannot read properties of null (reading 'slots')` | 自由書寫的試煉沒有流程資料，而 `open()` 從 Phase 11 起就假設每一關都有 | `const f = currentFlow || {}` |
| 6 處「N 座教學神廟」 | 12 座試煉住在既有區域裡 | 三份腳本各建 `shrines` 過濾 |
| 4 處 `.rubric.find(r => r.primary).check` | 應用關沒有主檢查 | 先取 row 再判空 |
| 「每一關都有流程資料」 | 三座自由書寫的試煉刻意沒有 | 改成 `carveable`，並反向驗「剛好三座」 |
| 圖鑑 800px 溢位 +73px、ⓘ 氣泡凸出 | 我新加的印記那一塊 | 拿掉那顆 ⓘ（改成一句話）＋ `.seal { min-width: 0 }` |

另外在 rubric 層新寫的 Phase J2 一節（約 140 條）涵蓋：
12 座的資料契約、型式分佈逐格比對、候選列的技能歸屬與檢查器互異、
四種情境的動態 rubric 與門檻公式、四個新存檔欄位的 additive／去重／reset、
印記的冪等與「不解鎖任何東西」、七種不合格情境下**拿不到**大師層印記、
以及 finale 未回退的靜態掃描。

### e2e 的輪次（誠實記錄）

① 第一輪：抓到 `open()` 的 null 崩潰（真 bug）＋ 21 項契約失敗 → 全部修掉。
② 第二輪：12 項失敗（區域石座數 ＋ HUD 換區的固定 sleep ＋ 我重建的 J1 斷言
   用錯了 `skipGate` 的回傳形狀與 `world.scene`）→ 全部修掉，
   並把「走進校驗場 → HUD 跟著換」那一段改成**輪詢**（AGENTS.md 的建議）。
③ 第三輪：中途被我自己的孤兒 dev server（port 5199）撞掉 → 清乾淨後重跑。
④ 第四輪：2,959 通過／14 失敗 —— 其中 8 條是我自己重建 J1 時猜錯的 API
   （`skipGate` 的回傳形狀、`world.scene`、`reverseBoard.label()` 的簽章、
   閘門對話框的焦點判定）與兩個 J2 的真問題：
   幕指示器把第二幕內容區那顆 `data-act-go="1"` 的「回顧委託」也數進去了
   （選擇器改成 `.acts [data-act-go]`），以及大師層那兩段忘了先 `goAct(3)`
   —— 第一幕時書寫檯是 `hidden` 的，`Input.insertText` 打進虛空。全部修掉。
⑤ 第五輪：2,960 通過／13 失敗 —— **Phase J2 的 45 條全綠**，
   剩下 13 條分成三組：純鍵盤的手掌印（9）、滑鼠拖曳（3），
   以及我把拆碑的 `done`（那是**刻印**完成，不是**拆完**）用錯（1）→ 改成 `progress.taken`。
⑥ 第六輪（本輪結果）：**2,965 通過／9 失敗** ——
   9 條全部是**同一組**已登記的 flaky：Phase 23「純鍵盤走完一圈」那一段的
   手掌印沒按下去，以及跟著它連帶失敗的 8 條（結果／評價／通關／分享）。
   它在第四、五、六輪都紅，但**同一支手掌印在 J1／J2／其他七個題型的段落照樣過**
   —— 這一台是軟體渲染、每幀 203 ms，那一段用的是固定 sleep（AGENTS.md 已登記）。
   Phase 27 的滑鼠拖曳這一輪自己綠了（第四、五輪紅），同樣是那個家族。
   **Phase J1 重建的 39 條與 Phase J2 新寫的 45 條，本輪全數通過，全程零 console error。**

### 未做／留給 J3

- **D2 的 legacy teaching/collection bridge 還在**（拆掉它是 J3）。
- **`backlog`、README 數字與截圖、R4 驗收**屬 J3。
- **拆碑（reverse）的完整鍵盤走查**：我在修一次寫壞的檔案編輯時誤用
  `git checkout --`，把 Phase J1 尚未 commit 的 e2e 段落（約 678 行）刪掉了。
  已依 `progress.md`／`findings.md` 的描述**重寫**了一份分歧之廳與拆碑的 e2e，
  但那一段「真的按鍵盤把碑拆完再刻到手印」的走查沒有逐字還原 —— 詳見 `findings.md`。
- 未 commit／push；未動 `CLAUDE.md`、`task_plan.md`、`README.md`、`vite.config.js`、
  port 5175、`src/data/curriculum.json`（sha256 仍綠）。

## Phase J3 ＋ R4 release checkpoint 報告（2026-08-02）

狀態：`done`（未 commit／push）

**一句話**：D2 的相容層拆掉了 —— 130 座教學神廟從此**每一座都掛得出自己的 v2 技能**，
教學面（第二幕刻文、第三幕的 primary 列、結果面板、教練）一律以技能為正典、沒有退路；
收集面（68 條技巧、四廠徽章、隱藏成就）一格未動，舊存檔逐欄實測不倒退。
然後把 R4 的五項驗收全部實跑了一次。

### 1. 完成條件逐條（task_plan §0）

| 完成條件 | 狀態 | 證據 |
|---|---|---|
| 130 技能各有且只有一座教學神廟；每關 1 主檢查＋最多 1 地基 | ✅ | rubric：`130 座教學神廟 ↔ 130 條技能`、`沒有兩座神廟教同一條技能（C2）`、逐條 `技能 X 有自己的神廟`；C1 invariant 對全部 130 座成立 |
| 12 區與 mission graph 上線；130 教學神廟＋12 應用關可玩 | ✅ | `expected-counts`：challenges 142 / applicationTrials 12 / v2ImplementedRegions 12；e2e 走過 |
| 14 種型式規劃完成，其中 K 期 `disclose` 為選配；未做要明確標成選配未實作 | ✅ | 11 種 flow kind ＋ 自由書寫上線；**`disclose` 正式記錄為「選配，不實作」**（findings.md 有逐條理由與翻案條件） |
| 59 個新檢查器只按需要實作，全部有 good／weak／bad、反作弊及中英 fixture | ✅ | `checks.js` 共 **81** 個（22 原有 ＋ 59 新）；rubric 逐個驗「真的實作了」「真的被某座神廟用到」 |
| `curriculum.json` byte-identical | ✅ | sha256 釘死測試綠（本期一個位元組都沒碰它） |
| 舊存檔可讀、reset 正常、新欄位 additive 且有 `normalize()` 預設 | ✅ | 新增「R4：舊存檔搬家與重置實測」一節（見下） |
| 快檢、playtest、build 全綠；新增互動有 e2e，console error 為 0 | ✅ | 見下方數字 |

### 2. D2 拆除做了什麼

**資料層（最後兩座）**

| 關卡 | 接上的技能 | rubric（前 → 後） | pass | 第三幕 | source |
|---|---|---|---|---|---|
| `gate-of-clarity-01` 清晰之門 | `clear-specific` | assignsTask 0.5 ＋ specifiesFormat 2 ＋ **hasConstraint 2** ＋ hasAudience 1 → assignsTask 0.5（地基）＋ **hasConstraint 3**（主） | 2.5 → **2** | 4 段 → **3 段**（拿掉「寫給誰看」） | curriculum · OpenAI Best practices → **Microsoft · Prompt engineering techniques（Best practices）** |
| `lost-automaton-03` 迷路的自動機 | `clear-positive` | **positiveFraming 3** ＋ assignsTask 0.5 ＋ explainsWhy 2 → **positiveFraming 3**（主）＋ assignsTask 0.5（地基） | 2.5 → **2** | 3 段（第一段換成「先把今晚的路線交代給它」） | curriculum · OpenAI Best practices → **Anthropic · Prompting best practices（Control the format of responses）** |

移除的三條的主題都已經有自己的神廟（`hasAudience` → 六面燈籠、`specifiesFormat` → 量器坊 `fmt-specify`、
`explainsWhy` → `context-why`），所以是 C2「不重教」而不是刪內容。
`teaches` 逐字保留（測試比對 manifest 的 `teachesLegacy`），68 條的涵蓋率仍然是滿的。

**為什麼第一段要換掉**：`lost-automaton-03` 拿掉 `explainsWhy` 之後只剩兩條檢查，
原本的第一段「請一路靠右走到北門」自己就會拿滿分 —— playtest 有一條既有門檻
「只刻第一段還不會滿分」會直接紅。改成沒有任務動詞的路線句之後，第一段 0 分、全部刻完 S（同 J1 的前例）。

**程式層（三處相容分支拿掉）**

| 位置 | 拆掉的東西 |
|---|---|
| `console.js` `guidancePrimary()`（第二幕刻文） | `challenge.primarySkillId \|\| row.skillId \|\| null` → `challenge.primarySkillId` |
| `console.js` `renderChecklist()`（第三幕對照的 primary 列） | `(row.primary && challenge.primarySkillId) \|\|` → 三元式，主檢查沒有退路 |
| `console.js` `renderResult()`（結果面板的主技巧） | 同上 |
| `console.js` `guidanceRow()` | `(skillId && sourceForSkill(skillId)) \|\| sourceFor(techId)` → **有技能就走技能的出處**，不會偷偷退回舊技巧 |

`content.sourceForSkill()` 的 `name` 補上廠商前綴（`Anthropic · Prompting best practices`），
與 `curriculum.json` 的出處寫法一致 —— 拆掉相容層之後 130 座的原典全部走這一支，
畫面上必須看得出是哪一家（護欄 2）。

**`knowsSkill()`：留 fallback ＋ 加一次純加法回填**

任務給的兩條路我選了 (a) 並補上 (b) 的回填部分，但**沒有收窄 fallback** ——
收窄會真的讓人倒退（舊 68 條可以由多座關卡的 `teaches` 收到，回填補不齊），詳見 `findings.md`。
- 回填：開機時照「`bestGrades` × `primarySkillId`」把漏掉的技能補進 `skillsV2`，
  純加法、冪等、只補真的通關過的、補完立刻寫回 localStorage。
- fallback 正名為 **收集誠實層**（程式碼註解 ＋ WORLD.md §5.3b）。

### 3. 補回 J2 弄丟的 e2e 覆蓋

重寫了**拆碑（`reverse`）的完整鍵盤走查**（約 200 行、38 條斷言）：
第三幕焦點自己落在名牌上 → 誘餌真的存在 → 方向鍵 roving → 數字鍵貼錯（碑不收 ＋ 就地教學 ＋
`aria-live` ＋ 不扣分不前進不跳失敗面板）→ 貼對一塊 → **`Esc` 拆回來**（面板不會被順手收掉）→
一塊一塊真的按鍵盤貼完 → 焦點自己落到刻印 → 數字鍵刻滿（＝`sample`）→ 第四幕 →
按住 `Enter`（輪詢，不是固定 sleep）→ S ＋ 石座轉已通關 ＋ 技能入袋 ＋ 寫進 localStorage ＋ 官方出處。
J1 其他被刪的斷言在 J2 已重寫過，逐條核對後沒有缺口。

### 4. J2 那 9 條 e2e 失敗的真因與處置

**不是回歸，是測試自己的寫法。** 9 條全部指向 Phase 23「純鍵盤走完一圈」的那一次手掌印
（其餘 8 條是連帶）。寫法是 `keyDown → sleep(900) → keyUp`，`PALM_HOLD_MS` 是 600 ——
但 `sleep(900)` 量的是測試主機的牆鐘，而這台是 SwiftShader（每幀約 200 ms），
CDP 的 `keyDown` 可能晚好幾百毫秒才被頁面處理，於是「按住 900 ms」在頁面看來只有 300 ms。

**根治**：新增共用零件 `holdPalm()` —— 按下去 → **輪詢 `.palm.is-fired`** → 才放開；
鍵盤與滑鼠兩條路都走它。全套 **11 處**手掌印的固定 sleep 一次清乾淨
（純鍵盤、排序刻印、神諭工坊、改碑、點碑、量器坊、契約鍛冶場、兩輪刻印、轉鈕、觀象臺、改碑鍵盤版）。

### 5. R4 五項驗收

#### 5.1 全 suite 數字

| 指令 | Phase J2 | Phase J3 |
|---|---|---|
| `npm run fonts` | CJK 1855／1463.4 KB | ✓ CJK **1844**／**1463.4 KB**（69 檔語料，指紋測試綠） |
| `npm run test:rubric` | 76,538 | ✓ **76,757** |
| `npm run test:playtest` | 2,372 | ✓ **2,372** |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 2,965 通過／9 失敗 | ✓ **3,013 項全過、零 console error、零重跑**（見 §5.6） |

rubric 的淨變化＝新增兩節（「拆掉 D2 相容層」約 190 條、「R4：舊存檔搬家與重置實測」約 47 條）
減去兩座收斂掉的 rubric 列所帶的逐列斷言。

#### 5.2 世界量測（在 node 裡把世界蓋起來實測，非引用文件）

| 項目 | 上限 | 高畫質 | 低畫質 |
|---|---:|---:|---:|
| 三角形 | 420,000 | **194,083** | 132,674 |
| 光源 | 56 | **37** | 20 |
| 碰撞體 | 1,400 | **957** | 823 |
| 網格 | — | **2,457** | 2,407 |
| 幾何體／材質 | — | 1,317 / 1,213 | 1,267 / 1,210 |
| 石座（markers） | — | **142** | 142 |
| **穿模稽核** | 0 | **0** | **0** |

（這一期沒有新增任何場景內容；數字與 J1／J2 的差異來自 J2 的落點重排與這次的實測本身。）

#### 5.3 來源抽查（新區域的 20 個官方 URL，實際 curl、follow redirect）

| # | URL | HTTP | 備註 |
|---:|---|---:|---|
| 1 | ai.google.dev/gemini-api/docs/prompting-strategies#completion | 200 | |
| 2 | platform.claude.com/…/claude-prompting-best-practices#control-the-format-of-responses | 200 | 迷路的自動機的新出處 |
| 3 | developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 | 200 | 轉址到 `latest-model?model=gpt-5.6#prompting-best-practices`（官方自己的轉址，內容還在） |
| 4 | developers.openai.com/api/docs/guides/function-calling | 200 | |
| 5 | ai.google.dev/gemini-api/docs/agents#security-best-practices | 200 | |
| 6 | platform.claude.com/…/prompting-claude-opus-5#capability-improvements | 200 | |
| 7 | ai.google.dev/gemini-api/docs/files#troubleshooting-your-multimodal-prompt | 200 | |
| 8 | huggingface.co/mistralai/Magistral-Small-2509 | 200 | |
| 9 | docs.x.ai/…/audio/speech-to-speech#step-3--model-specific-best-practices | 200 | |
| 10 | ai.google.dev/gemini-api/docs/prompting-strategies#format_responses_with_the_completion_strategy | 200 | |
| 11 | platform.claude.com/…/prompting-claude-opus-5#written-deliverable-length | 200 | |
| 12 | ai.google.dev/gemini-api/docs/structured-output#vs-function-calling | 200 | |
| 13 | platform.claude.com/…/tool-use/define-tools#providing-tool-use-examples | 200 | |
| 14 | docs.x.ai/developers/tools/code-execution#when-to-use-code-execution | 200 | |
| 15 | developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml | 200 | |
| 16 | platform.claude.com/…/claude-prompting-best-practices#workflows-across-multiple-context-windows | 200 | |
| 17 | developers.openai.com/api/docs/guides/prompting | 200 | |
| 18 | docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/zero-shot-optimizer | 200 | |
| 19 | platform.claude.com/…/prompting-claude-sonnet-5#code-review-harnesses | 200 | |
| 20 | developer.meta.com/ai/docs/how-to-guides/vision-capabilities/ | 200 | 用假的桌面 UA 會被 Meta 擋成 400，用 curl 預設 UA 是 200；內容還在 |

**20 / 20 全部存活，沒有任何一條需要進 `dated-notes.json` 的下架註記層。**
另外把清晰之門新出處的四個候選（Microsoft／Cohere／xAI／Google）也一起 curl 過，全部 200。

#### 5.4 存檔 migration／reset 實測

新增 rubric 的「R4：舊存檔搬家與重置實測」一節：種一份 **`promptarcade.v1.save`**（舊命名空間）
的存檔，含 XP 1180／Lv.8／4 個已解鎖區域／5 條 collected／3 關 bestGrades／徽章／`loreRead`／
`prologueSteps`／`guidanceSeen`／`inscriptionsFound`／`secretsFound`／`handlesUsed`／
`skippedGates`／`skillsV2`／設定／flags，然後逐欄驗：

- 18 欄逐欄搬過來、一格沒少；`seals` / `penlessSeals` / `scribeSeals` / `samplesSeen`
  四個新欄位補成空陣列；新 key 立刻寫入、舊 key 留在原地。
- 閘門與收集**不倒退**：4 個已解鎖區域仍然解鎖、5 條舊技巧仍在圖鑑、
  `knowsSkill('clear-specific')` / `('clear-positive')` 仍為 true、
  原本就在 `skillsV2` 的技能沒被弄丟、三座通關過的神廟的技能都補齊了、最佳評價沒有被回填動到。
- `resetAll()` 之後**兩個 key 都清乾淨**，重載是全新存檔（技能／印記／區域全部回到起點）。

#### 5.5 README 改了什麼（誠實）

- 徽章：`68 techniques cited` → `130 skills cited`。
- What is this：130 skills / 445 source links，並寫明 68 條原編譯**逐字保留在底下**。
- Features：`27 challenges across 5 regions` → **142 challenges across 12 regions**
  （130 教學神廟 ＋ 12 應用關），並補上知識式軟門檻；
  `Four ways to answer` → **Twelve ways**（11 種題型 ＋ 自由書寫）；
  `22 reusable checks` → **81**；圖鑑段落補上 12 枚土地印記與大師層。
- 專案結構：`5 regions` → `12 regions, bridges, annexes`。
- Testing 表：rubric **76,757**、playtest **2,372**、e2e 見 §5.6。
- Content & sources：補上「130 技能的 v2 catalogue 是**另一層**，445 筆出處逐條解析自研究總表」。
- 中文區塊的「規模」整段重寫。
- **截圖沒有重拍**，但在圖片區塊上方加了一段誠實標註：這六張是 2026-07-31（Phase 32/34）拍的，
  當時是 5 區 27 關，畫面上的數字落後於現況，重拍列為未完成的工作。

#### 5.6 完整 e2e（R4 的最後一道門）

**一輪跑完：`✓ headless 全部通過：3013 項檢查、零 console error`（exit 0，零重跑）。**

| 項目 | Phase I | J1 | J2 | **R4（J3）** |
|---|---:|---:|---:|---:|
| e2e 檢查項數 | 2,890 | 3,050 通過／3 失敗 | 2,965 通過／9 失敗 | **3,013 全過** |
| console error | 0 | 0 | 0 | **0** |
| 重跑次數 | 0 | 2 | 5 | **0** |

- 43 個區段全部走完，最後兩段是這一期的新內容：
  「分歧之廳與拆碑（課程 v2 · Phase J1）」76 項、「應用關與印記（課程 v2 · Phase J2）」45 項。
- **AGENTS.md 登記的動畫時序 flaky 家族這一輪一條都沒出現** —— 手掌印那 11 處固定 sleep 已由
  `holdPalm()`（輪詢 `.palm.is-fired`）根治，Phase 27 的滑鼠拖曳家族也乾淨。
  這是這台機器（SwiftShader 軟體渲染）上第一次**完整套件第一輪就零失敗**。
- 環境：測試自己的 vite 走 5199、Chrome 走自己的 CDP 埠；**使用者的 5175 全程沒碰**；
  收尾時整個 process group 清乾淨（跑完 `pgrep chrome|vite` 只剩使用者自己的 5175）。
- 這一輪是 orchestrator 在 J1／J2／J3 三個切片全部落地之後**重新跑的一輪**（不是引用子代理的數字）。

### 6. 先紅後綠（逐條實測）

| 破壞 | 紅的斷言 |
|---|---|
| 拿掉 `gate-of-clarity-01` 的 `primarySkillId` | 10 條：`source 是 curriculum 裡真實存在的官方連結`／`source 屬於它所教技巧的出處`／`每一座教學神廟都掛得出 primarySkillId`／`技能 clear-specific 有自己的神廟`／`接上 §三 指定的技能`／`主技能有可點的官方出處`／`原典標籤寫得出廠商`／回填三條 |
| 把 `guidancePrimary()` 的相容退路加回去 | 2 條：`第二幕刻文不再有「主技能找不到就退回這一列的技能」的相容路徑`／`第二幕直接用 primarySkillId` |
| 拿掉開機回填 | 4 條：`開機時把已通關的那座神廟的技能回填進 skillsV2`／`兩座都回填了`／`回填立刻寫回 localStorage`／`再開一次不會重複回填（冪等）` |
| 把 `normalize()` 的 `seals` 預設改成 `['BROKEN']` | 3 條：`舊存檔的 seals 補成空陣列（純加法）`／`seals 去重`／`R4：舊存檔沒有的 seals 補成空陣列` |

另外 e2e 這一輪本身也是紅燈證據：新寫的拆碑鍵盤走查在第一輪就跑過（見 §5.6）。

### 7. backlog 的最終處置（逐條）

| 項目 | §3 指定 | 目前 | 最終狀態 | 一句話理由 |
|---|---|---|---|---|
| 鑄模房 `so-basics` | `workshop` | `choice` | **won't do** | 擋住的是 `workshop` 的四步語意（挑工具 → 填參數 → **排呼叫順序** → 立規矩）——schema 沒有「呼叫順序」那一步，硬套會把欄位教成有先後。做三步版等於為了一座神廟新開一套 stage contract（焦點／鍵盤／文字組裝／e2e）。 |
| 量繩之桌 `clear-constraint` | `constraint` | `fix` | **won't do** | 純資料工作、隨時做得了，但在 release gate 前換一份沒玩測過的第三幕資料，風險大於收益；現行 `fix`（把「短一點」換成有單位的規格）已達成教學目標。 |
| 零件表 `struct-anatomy` | `reverse` | `spot` | **won't do** | 同上；findings 早就記過「用 spot 幾乎等價」。 |
| 一字之差的岔路 `word-choice` | `tradeoff` | `tradeoff` | ✅ 完成（Phase C） | |
| 舊標籤的倉庫 `struct-xml` | `tradeoff` | `tradeoff` | ✅ 完成（Phase C） | |
| 三口井 `three-wells` | `workshop` | `choice` | ✅ 已裁決（Phase C） | 依內容本質改用 choice，不列為 backlog |
| 給沒看過的人／取水之後的停頓 | `multi` | `multi` | ✅ 完成（Phase G） | |
| 火力熔爐／刻度儀之室／沙漏工房 | `sim` | `sim` | ✅ 完成（Phase H） | |
| 空手的信使 `context-supply` | `disclose` | `fix` | **選配未實作** | 見下 |

### 8. Phase K（`disclose` 拾遺）的正式決策記錄

依 `task_plan.md` §0「K 期 `disclose` 為選配；未做時必須明確標成選配未實作」——
**Promptasy 課程 v2 不實作 `disclose`**，理由四條（完整版在 `findings.md`）：

1. 它是唯一一種會把**關卡**與**世界探索**綁在一起的題型，會打破「任何一關隨時開得起來」的契約，
   而鍵盤可玩性、e2e 與「先行前往」全部建立在那個契約上。
2. 它要新增一個**會影響可玩性**的存檔欄位（背包裡有什麼決定關卡打不打得開）——
   既有的新欄位全部是純加法且不影響解鎖。
3. 世界的觸控移動（虛擬搖桿）在 Phase D 就明確不做；沒有它，`disclose` 在手機上等於不可玩。
4. 它**不影響 130 條技能的完成度**：`context-supply` 已經有自己的神廟（空手的信使，`fix`），
   教的是同一件事。

翻案條件寫死在這裡：**先有世界的觸控移動，再談 `disclose`。**

### 9. 未做／留給後續

- **截圖沒有重拍**（`docs/media/` 的六張是 2026-07-31 拍的，當時 5 區 27 關）。
  README 已在圖片區塊上方**誠實標註**擷取時間與它落後於現況；重拍需要重新種存檔取景。
- **三筆 kind-swap 維持現狀**（見 §7）。
- **六個新區的配樂音檔仍未錄製**（誠實登記在 `SYNTH_ONLY_REGIONS`，跨區走合成 pad）。
- **行動裝置的世界觸控移動仍然不做**（Phase D 的裁決未變）。
- 未 commit／push；未動 `CLAUDE.md`、`task_plan.md`、`vite.config.js`、port 5175、
  `src/data/curriculum.json`（sha256 仍綠）。

---

## 2026-08-03 · Phase 35（手掌印加寬 ＋ 術語小卡）

站長點名兩件事，一件是手感、一件是彩蛋。

### 1. 手掌印（palm）加寬與美化

**站長原話**：「Enter stone 要加寬——長按 ENTER 的字串太擠、也沒有在適當位置換行，字體可以縮小，讓他美化。」

**先量再改**（headless 1280×900 實測，牌子 168×254）：

| | 之前 | 之後 |
|---|---|---|
| 牌子 | 168 × 254 px | **252 × 179 px**（900px 以下 232 × 171） |
| 主句 | 「把手掌按上 / 石碑」**斷在詞中間**，高 68px（兩行） | 「把手掌按上石碑」**一行**，高 29px |
| 提示 | 「按住不放（/ Enter 也可 / 以）」**三行**、括號被丟到下一行，高 94px | 兩行各自完整：「按住不放」／「或按住 <kbd>Enter</kbd>」，高 53px |
| 提示字級 | `--t-micro`（21.3px） | `calc(--t-micro × 0.86)`（**18.3px**，比主句 23.4px 小一階） |

作法：
- `palm.js` 與 `stele.js` 兩份 DOM（本來就逐字相同，rubric 有斷言把關）同步把提示拆成
  兩個 `.palm__hintline`，**用結構分行，不靠溢位換行**。
- `.palm` 加寬到 252px ＋ `max-width: 100%`，拱頂半徑跟著放大；
  `.palm__label` 與 `.palm__hintline` 都 `white-space: nowrap`（保證不會再斷在詞中間）；
  `.palm__hint` 改成 grid 兩列。
- 順手美化：石面加一層「上亮下暗」的線性漸層（跟刻印牌同一套受光方向），不再只有一圈暖光。
- 呼吸光暈 / 蓄力環 / `is-holding` / `is-slipped` / `is-fired` 與**鍵盤行為一格未動**。

**逐面複審**（e2e 實量，不是抽樣）：十一種題型的第三幕各開一次、把台上那一隻手掌叫出來量 ——
`choice` 252px、其餘十種（`order` / `workshop` / `fix` / `spot` / `induct` / `tradeoff` /
`constraint` / `multi` / `sim` / `reverse`）都是 250px，主句一律一行、提示一律兩行、
`Enter` 鍵帽都在、水平溢位 0。390×844 另量三關（含工坊）：232px、在面板內、高 171px（> 44px 觸控門檻）。
自由書寫模式沒有手掌印（它走「呈給神諭」那顆鍵，高 54px）—— 一併斷言，免得哪天被誤加。

### 2. 術語小卡（工程關鍵字 hover 彩蛋）

**站長要的**：畫面上出現的技術名詞（markdown / JSON / XML / temperature / token / few-shot /
system prompt / schema / API / prompt / LLM / HTML / CSS / TTS…）滑上去能看到
**白話說明 ＋ 用途 ＋ 一個小範例**。

- **資料**：新增 `src/data/glossary.json`（`authored: "game"`）**24 條**術語，每條
  `{ term, aliases[], zh, plain, use, example }`。這一層跟 `coach.json` 同性質 ——
  **扶手不是課本**：不教技巧、不掛 `techniqueId`、**整份檔案一個連結都沒有**
  （護欄 2 仍然成立：真正的教學與官方出處只在第二幕與圖鑑，rubric 逐條把關）。
- **標記器**：新增 `src/ui/glossary.js`。一次 `annotate(el)` ＝ 對那一塊 DOM 走一次
  `TreeWalker`，**沒有 MutationObserver、沒有輪詢**；跳過 `textarea` / `input` / `button` /
  `kbd` / `a` / `code` / `summary` / 標題與 `.src`（官方出處）；**一個面板一個字只標第一次**；
  只是把字包進 `<span class="gloss">`，`textContent` 一個位元組都不變。
- **標記的地方**：第一幕（情境／委託／素材）、第二幕（神諭刻文）、提示框、圖鑑的每一條技巧
  （圖鑑以「一條技巧」為一個面板 —— 整本掃一次的話 130 條裡只會有一個字被畫線）。
- **小卡**：`position: fixed` 掛在 `<body>` 上（面板有 `overflow`，掛裡面會被裁掉），
  下面塞不下就翻到上面，最後還有一道「一定留在畫面內」的夾。夜間檔案館語言、零外部資源。
- **鍵盤**：標記**刻意不進 Tab 順序**（決策與理由寫進 `WORLD.md` §3.7）。
  `Esc` 先收小卡、不順手關掉整個面板（`document` capture ＋ `stopPropagation`，實測有效）。
- **字型預算差點爆掉**：glossary 的新中文讓 CJK 語料從 1844 → 1848 字，字型總量
  **1,501,184 > 1,500,000 的硬上限**。沒有調高上限 —— 改成把只出現一次的四個字換掉
  （`妝`→樣子、`瑣`→小、以及我自己註解裡的 `慘` `裸`），語料回到 1844、總量 1463.4 KB。
  這件事本身是個發現：**這個專案的字型預算已經在 99.9%**（見 findings）。

### 驗證

| 套件 | 之前 | 之後 |
|---|---|---|
| `npm run fonts` | 語料 71 檔 / CJK 1844 | 語料 71 檔 / **CJK 1844**（換字後打平）／ 1463.4 KB，指紋綠 |
| `npm run test:rubric` | 76,757 | **77,311** 全綠 |
| `npm run test:playtest` | 2,372 | **2,372**（未動，符合預期） |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 3,013 | **3,190 全部通過、零 console error、零重跑** |

**先紅後綠**（實測）：把 `.palm` 寬度改回 168px → 2 條紅（`手掌印加寬到 252px`、
`窄畫面下不會撐破面板`）；在 glossary 塞一個 `https://` → 2 條紅
（`[gloss:temperature] example 不含連結`、`整份 glossary.json 一個連結都沒有`）；還原後全綠。

**e2e 的一個真問題（自己寫的斷言先紅過）**：一開始用「先量座標 → 再送 `mouseMoved`」，
小卡一直不出現。用 `elementsFromPoint` 追出來是 `.reveal` 入場動畫還在跑、
**先量好的座標會過期**（實測差 30px 以上）。改成 AGENTS.md 建議的**輪詢式**：
每一輪重新量、重新送滑鼠、再檢查卡片 —— 一次就過。

### e2e 兩輪的誠實紀錄

| 輪 | 結果 |
|---|---|
| 第一輪 | 3,054 通過 / **4 失敗** —— 全部是我自己新寫的「手掌印量得到嗎」那道守門，而且它抓到的是**真的問題**（見下） |
| 第二輪 | **3,190 全部通過、零 console error**；AGENTS.md 登記的動畫時序 flaky 家族一條都沒出現，沒有重跑 |

**第一輪為什麼紅**：前一段（`應用關與印記 · Phase J2`）呼叫了 `promptConsole.setMode('free')`，
而 `setMode()` **會寫進設定** —— 手掌印只存在於引導式，所以我整段量測落在自由書寫的書寫檯上，
一隻手掌都沒有。**這正是那道守門在防的事**（`每一種題型都有一隻量得到的手掌印（不會空過）`）：
它讓「什麼都沒量到」變成紅燈，而不是跑完全綠。
修法：量之前明確 `setMode('guided')` 並斷言 `modeAtStart === 'guided'`；
固定 sleep 換成輪詢（最多 20 次 × 150ms）；失敗時回報 `act / mode / ovHidden / dataAct / wraps`。

### 這一期沒有動到的東西

- `CLAUDE.md`、`vite.config.js`、port 5175（使用者的 dev server 全程沒碰，跑完只剩它自己）、
  `src/data/curriculum.json`（sha256 仍綠）。
- 未 commit／未 push。
- 字型的 6 個 `.woff2` **一個位元組都沒變**（換字之後語料字元集跟 HEAD 完全一樣），
  只有 `manifest.json` 的語料指紋更新。

---

## 2026-08-03 — 出處深連結（Source deep-linking）

**要求（站長原話的意圖）**：每一關顯示的廠商文件連結，要**直接跳到被引用的那一節**
（網址帶 hash / anchor），不是只到頁面最上面；而且要逐幕確認每一個顯示位置都照做。

### 做了什麼

**① 盤點**（scratchpad 腳本，非產品碼）：走過 142 關的每一個顯示路徑
（第二幕神諭原典、第三幕對照、結果面板、圖鑑的 130 技能卡與 68 技巧卡、序章、
刻文小語、時代註記、雙面碑的模型卡）→ **963 個顯示位置 / 360 個相異網址 / 114 份文件**。
確認 **12 座應用試煉整幕不顯示任何出處**（`links === 0`，e2e 既有斷言）。

**② 實地抓頁面**（2026-08-03 當天）：114 份官方文件全部 `curl` 下來。
三個問題網域誠實處理 —— `ai.google.dev` 的 302 自動登入迴圈用 cookie jar 解掉（20 份全取回）、
`developer.meta.com` 對 curl 回 400 改用 headless Chrome `--dump-dom`（3 份取回）、
`help.openai.com` 403 與 `docs.x.ai/docs/guides/grok-code-prompt-engineering` 404 維持原樣不動。

**③ 逐列定位**（550 列資料層出處）：優先序＝出處自己寫的章節名 →
這條技能的英文名恰好是某個章節 → master list 自己記過的深連結 →
master 條目的官方引文落在哪一節 → 文字片段。**一個 anchor 都沒有臆造**：
`heading` 型的 id 必須出現在當天抓下來的 HTML；`fragment` 型的片段必須在頁面文字裡唯一命中。

| 定位方式 | 列數 |
|---|---:|
| 本來就有（實地確認 id 仍在） | 192 |
| 標題 id | 155 |
| 標題 id（沿用 master list 的深連結） | 46 |
| 文字片段（`#:~:text=`） | 20 |
| **修好失效的舊 anchor** | **9** |
| 頁面層（誠實留白 ＋ 理由） | 116 |

寫回之後重新盤一次畫面：**anchor-ok 654 / fragment-ok 22 / page-level 287，壞掉的片段 0**。

**④ 寫回（兩層，理由不同）**
- **v2 的 130 條技能**（`skill-codex-v2.json`，遊戲自撰資料層）→ `url` 就地升級（178 列），
  每一列多一個 `anchor` 欄表態，`none` 的另附 `anchorNote` 理由；跟著同步
  `challenges.json` 的 `source`（40 關）與 `flows.json` 雙面碑的模型卡出處（5 條）。
- **舊 68 條**（`curriculum.json` 逐字鎖死）→ 新增顯示層疊加 `src/data/source-anchors.json`
  （`authored: "game"`，64 條）＋ 新模組 `src/challenges/source-anchor.js`，
  在 `content.js` / `prologue.js` **顯示時**才把片段接上去。
  **`anchored` 與 `url` 只准差一個片段**（測試強制驗證）。
- `dated-notes.json` 的 5 條新官方連結也一併深連結（逐條在頁面上找到那句話才寫）。

**⑤ 這次抓到的真問題**：9 條**原本就寫了 anchor、但那個 id 在現在的頁面上已經不存在**
（Anthropic 文件把 `&` 的 slug 規則從 `--` 改成 `-and-`、`#latex-output` 變成 `#la-te-x-output`…）
—— 玩家點過去只會停在頁面最上面。全部修好並在報告裡逐條列出。

**⑥ 誠實留白**：116 列停在頁面層，理由分兩類 ——「出處本來就是頁面層引用（沒有指名章節）
且 master 的官方引文在這一版頁面上找不到唯一落點」，以及「出處寫的章節在這一版頁面上找不到」。
每一條理由都寫進 `anchorNote` 與報告。

### 驗證

| 套件 | 之前 | 之後 |
|---|---|---|
| `npm run fonts` | CJK 1844 / 1463.4 KB | CJK 1844 / **1463.3 KB**，指紋綠（片段裡的非 ASCII 一律 percent-encode，語料沒被拖下水） |
| `npm run test:rubric` | 77,311 | **79,830 全綠** |
| `npm run test:playtest` | 2,372 | **2,372**（未動） |
| `npm run build` | ✓ | ✓ |
| `npm run test:e2e` | 3,190 | **3,206 全部通過、零 console error、零重跑** |

**先紅後綠**（實測）：把疊加層第一條的 `anchored` 改成別的網域、
把一列標 `heading` 的網址片段拔掉 → **8 條紅**
（`深連結與原網址只差一個片段`、`真的多加了片段`、`片段接在原網址後面`、
`標 heading 的網址真的帶著片段`、`圖鑑顯示的出處帶著深連結`、`sourceFor() 走同一層疊加`…）；還原後全綠。

**新增的測試**
- rubric：疊加層只准差片段、每一列都要表態（`anchor` ／ `none` ＋ `anchorNote`）、
  疊加的網址真的是那條技巧引用的那一個、`curriculum.json` 的原網址沒被動過、
  130 座神廟的主原典逐座檢查、試煉沒有主教學目標、
  覆蓋率契約 `scripts/expected-counts.json` 的 `sourceAnchors`（含**誠實的 none 數**與硬上限）。
- e2e：第二幕的 `href` 真的帶著片段且就是資料層那一個（`#best-practices`）、
  130 座主原典的深連結覆蓋、沒有片段的那幾座都標成 `none`（不是漏做）、
  圖鑑的舊 68 條走疊加層而 `curriculum.json` 仍是頁面層、序章結果面板的出處也深連結
  且每個片段都來自驗證過的疊加層。

### e2e 兩輪的誠實紀錄

| 輪 | 結果 |
|---|---|
| 第一輪（寫回後的第一版資料） | 3,203 通過 / **1 失敗** —— 序章那條「面板上的每個出處都指向 curriculum 裡的官方連結」用 `urls.has(href)` 逐字比對，深連結多了片段就對不上。**它抓到的是真的事**（顯示層變了而斷言沒跟上），改成比對網址本體 ＋ 新增「片段必須來自驗證過的疊加層」一條 |
| 第二輪（修好解析器的框架 id 與 GitHub anchor 之後重跑全套） | **3,206 全部通過、零 console error**；AGENTS.md 登記的動畫時序 flaky 家族一條都沒出現，沒有重跑 |

兩輪之間還修了解析器的三個真問題（都在寫回前抓到並重跑）：挑到 Google devsite 的
`#breadcrumb`、GitHub repo 頁的 `#folders-and-files`，以及把 repo 名當搜尋針挑出
`#step-1-installation`。修完 GitHub 的八條變成正確的 `#usage-recommendations` / `#official-prompts`。

### 文件

- 新增 `docs/design/source-anchor-audit.md`：逐網址驗證表、9 條失效 anchor 的前後對照、
  誠實留白的理由分類、三個抓不到的網域、為什麼用 Text Fragments、怎麼重驗。
- `WORLD.md` §3.4 新增「出處要深連結到被引用的那一節」三條硬規則。

### 這一期沒有動到的東西

- `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`（sha256 仍綠）。
- 未 commit／未 push。

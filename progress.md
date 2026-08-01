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

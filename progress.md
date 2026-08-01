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

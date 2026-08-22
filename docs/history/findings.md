# Findings — Promptasy 長時間收尾

## 已確認

- 專案原本沒有 `task_plan.md`、`findings.md`、`progress.md`。
- `CLAUDE.md`、`WORLD.md`、`HANDOFF.md` 均存在；需完整讀取後才能定案。
- 從 Windows UNC 路徑直接使用 Git 會觸發 dubious ownership，後續改走 WSL Linux 路徑。
- `HANDOFF.md` 指定下一件大事為由 27 關／68 技巧／5 區域擴展至 130 技能／12 區域，依 `docs/design/curriculum-v2.md` §8 的 A–K 路線執行。
- 第一優先是 Phase A「重複度手術」：既有 27 關收斂為 1 個主檢查＋最多 1 個基本功、`assignsTask` 權重降為 0.5 且不再當教學目標、同步下修 pass 門檻。
- Phase B 是新增 `fix`／`spot` 題型與對應神廟；是否和 A 合併規劃需看設計文件的依賴與風險。
- 27 關遷移約束為保留 4／改造 21／轉應用關 2，零刪除；59 個新檢查器是主要隱藏成本。
- Git 當前在 `dev...origin/dev`；三份新規劃檔是唯一未追蹤項目。
- `CLAUDE.md` 的不可妥協護欄：學習優先、內容與 rubric 忠於官方來源、核心離線、存檔可遷移／重置、每次交付可執行、資產授權乾淨、既有內容不倒退。
- 核心設計仍是「一關＝一個技巧的實戰」、失敗回饋必須指出缺失並連到官方來源、關卡可重玩提高評價。
- DoD 要求端到端可玩、無 console error、內容出處可點、存檔相容、最後更新 `CLAUDE.md` changelog。
- 最近 Phase 34 已達 rubric 16,502／playtest 226／e2e 約 1,786；e2e 尚有滑鼠拖曳時序類 flaky，建議改為 poll-until。
- 目前明確技術債含行動裝置未支援；它不應偷渡進 Phase A 純資料手術，但 Phase B 新互動必須評估鍵盤與觸控債務。
- `WORLD.md` 要求所有新題型維持四幕、同一離線評分引擎、同一手掌印結尾、不會失敗，且純鍵盤完整可走；新增 `kind` 必須預設不影響既有關卡。
- 官方出處必須始終可見；自撰教學資料標 `authored: "game"`，不得在資料層手抄或改寫 `curriculum.json` 的官方欄位。
- 互動仍只有 `E`；overlay 內要有焦點鎖、roving focus、`Esc` 還原、`aria-live`，文字輸入焦點時單鍵快捷失效。
- 世界性能硬規則：不新增場景光源（除非納入既有預算）、每幀零配置／平方距離／距離分級；有份量幾何要納入碰撞與淨空稽核。
- WORLD 維護清單共 29 項，涵蓋世界觀、互動、內容、視覺、效能、碰撞、存檔、rubric/e2e/playtest/build/changelog。
- 目前 `flows.json` 的向後相容契約是缺少 `kind` 時預設 `choice`；Phase B 的 `fix`／`spot` 應延續此契約。
- curriculum v2 的九項硬約束 C1–C9：一關一技巧、技巧只教一次、每關四拍、題型變奏、鷹架遞減、環境即題目、不失敗／完全資訊、知識式軟門檻、最佳化目標不擋路。
- 130 技能拆成 12 區；既有五區／地形全保留，新增七區中只有 `forms`、`toolcraft`、`sight` 需要新地形，其他是既有地形加建。
- 區內順序自由；跨區門檻應由已掌握技巧決定，不再以等級數字為主，仍可 `skippedGates` 先走。
- 每座神廟的規格欄包含教學前提、14 種互動型式之一、起承轉合、素材與 rubric；新檢查器必須採結構性偵測，不能靠關鍵字堆砌。
- 既有關卡收斂時，地基檢查最多 1 條、權重 0.5，且不計入評價門檻；主檢查才代表本關所教技能。
- curriculum v2 §6 明訂 A–K：A 資料手術；B `fix`/`spot`+foundations；C `induct`/`tradeoff`+reasoning；D `constraint`+grounding/config；E forms 新地形；F toolcraft 新地形+wards；G `multi`+refinery/orchestration；H `sim`+frugality；I sight；J divergence+12 應用關+大師層；K 選配 `disclose`。
- 最終範圍是 130 教學神廟＋12 應用關＝142 關，59 個新檢查器按期開發；設計明列 `sim` 樣本、新地形、行動裝置為主要風險。
- `curriculum-v2.md` 的遷移小計是保留 5／改造 20／應用關 2；`HANDOFF.md` 卻寫保留 4／改造 21／應用關 2，存在需在 Phase A 前以實際資料與設計列逐項解決的文件矛盾。
- 文件中的效能現況數字也有漂移（WORLD 約 143k/44 lights，curriculum v2 風險段寫 125k/47 lights）；實作不能沿用舊數字，需以測試與 runtime 現測為準。
- Phase A 具體全域改動：26 關 `assignsTask` 降至 0.5、pass 各降 0.5；6 關移除非主題的 `specifiesFormat`、5 關降權 `hasDelimiters`。但需先從現有資料產出精確 manifest，避免依摘要數字盲改。
- Phase B 預計 foundations 補至 14 座、+10 新神廟；`fix` 是可編輯弱稿，`spot` 是點選有問題句子，兩者需共同支援 token toggle、方向鍵與 Enter。
- 應用關不教新技巧、跳過第二幕，只針對玩家已學技巧動態組 rubric；新增 `seals[]` 必須 additive 並由 `normalize()` 補預設。
- v2 尚未提供約 550 段實際關卡文案；內容需分期從 master list 取材、標 `authored: "game"`、綁真實官方來源。
- level-design references 將 P1–P15 落成可測的關卡原則；最重要的實作含義是：主 rubric 上限、強制「轉」、鷹架由 fix/choice 走向 free、完全資訊、允許多解、技能以配角間隔複習、第一幕資訊量設硬上限。
- 14 種互動型式的成本分級已足以當 roadmap gate：綠色資料型先做；黃色單一新 kind 要先做失敗測試；紅色跨資料／跨輪／跨世界狀態需要獨立 phase。
- gap analysis 指出現況內容風險不能只靠重複度手術處理：temperature、顯式自我檢查、xAI 404、system prompt、過度詳細、CoT transcript、effort 等都有時代條件；Phase A 不應順便重寫 `curriculum.json`，需維持 dated-notes 分層。
- Phase A 要特別確認 `positiveFraming` 的語意：正面要求優先但必要禁令可保留，不能把「全部禁止句改寫」繼續當唯一正解。
- master list 是 292 條、493 個來源編號的 canonical source；130 技能只涵蓋可教的 prompt 技巧，實作期應以 master 編號回查具體「使用方式／出處」，而不是從設計表一句話擴寫事實。
- master list 明確標示 68/68 現有技巧都有映射，但 `role-04`、`fewshot-05`、`iterate-04` 僅部分涵蓋；新課程不能把這些未驗證宣稱重新包裝成正式教學。
- 來源健康度有特殊驗證語意：Meta 對非 JS 客戶端回 400 不是死鏈；OpenAI Help 403 與 xAI 404 不能當可驗證主來源；URL 存活度仍應分期重驗。
- gap analysis 的 A 手術建議原始基線是 26 關、106 rubric 項；現況已是 27 關，必須用當前 JSON 重算，不可把舊百分比直接當完成驗收。
- Git 當前 HEAD／origin/dev 是 `86b2d47`（handoff commit）；main 是 `7dd120e`（v2 設計），規劃檔之外沒有既有未提交改動。
- 實際資料基線：27 challenges／27 flows，kind 分布 choice 24、order 2、workshop 1；118 rubric 項（不是 gap analysis 的 106）。
- `assignsTask` 現在 27/27（不是舊文件的 26/26）；`specifiesFormat` 14、`hasDelimiters` 12。Phase A 的「26 關受影響」已過期，應明確決定第 27 關 `oracle-workshop-36` 是否同樣降權（依 C1 應該要）。
- 現有每關 `teaches` 有 2–4 條；只改 rubric 權重不足以達成「一關只教一件事」，Phase A manifest 必須同步定義 `teaches`、rubric `techniqueId`、coach/flow 顯示與收集行為的遷移。
- 現有 pass 為整數 3–5；若一律減 0.5 會出現小數門檻。需先確認 rubric/playtest/e2e/UI 對 fractional pass 的支援及顯示，不可只改 JSON。
- runtime 現在把 `curriculum.json` 直接傳進 content/progression/codex/ranks/settings/share/e2e；要擴到 130 技能而保持原檔 byte-identical，必須先新增「v2 catalog merge」邊界，讓舊 68 技巧與新 authored/sourced 技巧合併成 runtime catalog。
- 建議資料分層：`curriculum.json` 永遠原封不動；新增 `skill-codex-v2.json`（玩家面 id、區域、tier、masterRefs、官方 sources、authored game 說明）與 `regions-v2.json`，由單一 loader 驗證後合併。不得把 master list 的摘要冒充官方引文。
- 測試目前大量硬編碼 68 技巧／5 區／3 kinds／27 flows 與既有 kind 分布；各 phase 必須把「歷史快照型斷言」改成 schema/invariant 或新明確目標，避免為過測試寫死。
- `evaluate()` 接受任意 finite number pass，小數門檻在引擎層可運作；UI 會直接插入數字，因此 Phase A 要加小數顯示與差額文案測試。

## D1–D3 最終裁決（Phase 0 · 2026-08-01）

三個規格矛盾都已用**現況資料 ＋ 逐關表逐行比對**定案，寫進
`docs/design/curriculum-v2-migration.json` 的 `decisions` 區塊，並由 `npm run test:rubric` 逐行守住。

### D1 — 27 關遷移數字 → **保留 5／改造 20／轉應用關 2**

- 逐關點名（不是引用小計）：`curriculum-v2.md` §4 表格 27 行，處置欄「保留」出現 5 次、
  「改造」20 次、「轉為應用關」2 次，加總 27，與該節小計一致。
- 保留 5：`lost-automaton-03`、`well-of-unknowing-22`、`long-scroll-tower-23`、`oracle-workshop-36`、`priority-stair-42`。
- 轉應用關 2：`council-envoy-06`、`archive-seal-25`。
- `HANDOFF.md` 的「保留 4／改造 21／應用 2」是摘要漂移，屬文件勘誤（見下），資料一律以逐關表為準。

### D2 — `teaches` 拆成「教學」與「收集」兩種語意

- 新增 `primaryTechniqueId`：27 關逐關指定，**25 條互不重複**（2 關應用關為 `null`，因為應用關不教新技巧）。
  測試強制：必須是 `curriculum.json` 裡真的技巧 id、標題逐字相同、不得與別關撞號（C2）。
- `teaches` 原封不動保留為 **legacy collection list**（manifest 的 `teachesLegacy` 是逐字快照），
  只餵圖鑑／徽章／收集，不再出現在「這一關教什麼」的畫面上。B–J 逐條移走，Phase J 移除相容層。
- 唯一一條 `primaryTechniqueId` 不在該關現有 `teaches` 裡的是 `effort-forge-15` 的 `params-03`
  —— 那是 §4 明訂「由刻度儀之室讓過來」，manifest 已標成 conflict 並記下處置。
- `oracle-workshop-36` 的 v2 技能 `tool-when-not` 在 68 條裡**沒有**對應條目：暫用 `agentic-01`
  並標 `needsV2Catalog: true`，真正的條目要等 Phase B 的 `skill-codex-v2.json`（authored 層），**不得改寫 `curriculum.json`**。

### D3 — pass 降權採 literal −0.5

- manifest 逐關同時記 `passAfter`（literal −0.5）與 `passAfterByWeightRule`（調整後總權重 × 50%）。
- 27 關全部分岔（因為 `assignsTask` 一律 −0.5 讓總權重變成小數）；多數只差 ±0.25，
  但 `example-hall-11`、`silent-thinker-13`、`long-scroll-tower-23` 三關差 **+0.75**（literal 較嚴），
  原因是它們同時還被移除／降權了另一條檢查。
- 驗收門不是百分比：以 playtest 三道安全閘（弱起手仍不過／快速填入必過／sample ≥ A）實測為準，
  分岔的那幾關個別再調，不整批套百分比。

### Phase A 的實際改動面（用現況資料重算，取代舊文件的摘要數字）

- `assignsTask` 1→0.5：**27 關**（不是舊文件的 26 關）。
- 非主題 `specifiesFormat`：**6 關**（`tool-forge-33`→definesTools 加權、`subtask-workbench-31`→decomposesTask、
  `echo-workshop-35`／`draft-review-wheel-32`→asksToRefine、`mask-workshop-41`→hasAudience、`silent-thinker-13` 直接移除）。
  前 5 關是權重中性的替換，只有 `silent-thinker-13` 讓總權重 −1。
- `hasDelimiters` 2→1：`gap-analysis.md` §3 建議 3 列了 5 關，但其中 **3 關的分隔符在 v2 逐關表裡正是那一關的主檢查**
  （`postbox-sprite-02` = `struct-delimiters`、`long-scroll-archive-05` = `pos-rules-first` 的過渡主檢查、
  `thinking-chamber-14` = `cot-separate-answer`）。依 task_plan §2「以逐關表為準」裁決 **hold**，
  Phase A 實際只降 **2 關**（`example-hall-11`、`long-scroll-tower-23`）。
- 因此「前三名檢查器占比 49%→25%」這個預期效果**不會**只靠 Phase A 達成：
  Phase A 之後 `hasDelimiters` 仍然出現在 12 關（權重才變），真正的分散要等 B–J 把主題搬去各自的神廟。
  現況實測占比是 `assignsTask` 27 ＋ `specifiesFormat` 14 ＋ `hasDelimiters` 12 = 53/118 = **44.9%**
  （`gap-analysis.md` 寫的 49% 是 26 關／106 項那版的數字）。

## Phase A 實作發現（2026-08-01）

- **manifest 的 `techniqueIdRealign` 是描述欄，不是動作**：它標的是「主檢查那一列目前掛的 `techniqueId`
  與 `primaryTechniqueId` 不同」（實測 27 行逐條吻合）。Phase A **沒有**改任何 rubric 列的 `techniqueId`
  ——那不在 `checksToRemoveOrDownweight` 裡，改了會連動結果面板的出處。改的只有顯示層：
  第二幕與刻痕對照的主檢查那一列改掛 `primaryTechniqueId`（例如火力熔爐顯示的是 `params-03` 與 GPT-5 guide）。
- **`primary` / `foundation` 是新的 rubric 欄位**：runtime 需要知道「哪一列是主教學目標」，而 `primaryTechniqueId`
  推不出來（`effort-forge-15` 的 `params-03` 與 `oracle-workshop-36` 的 `agentic-01` 都不在自己 rubric 的
  `techniqueId` 裡）。所以主檢查那一列標 `primary: true`（＝manifest 的 `mainCheck`／`interimMainCheck`），
  `assignsTask` 標 `foundation: true`。兩個欄位都是 additive，舊資料沒有也不會壞。
- **權重中性的 replace 有一關要新增列**：`mask-workshop-41` 原本沒有 `hasAudience`，所以那 1 分是新增一列
  （`techniqueId: role-04`，沿用被換掉那一列的技巧）承接；其餘 4 關（subtask／draft／tool／echo）的
  `replaceWith` 本來就在 rubric 裡，直接加權重。因此 rubric 條數 118 → **113**（−1 移除 −5 替換 +1 承接）。
- **flow 收斂會動到「全部選對＝每條滿分」這條地基**：`mask-workshop-41` 拿掉格式那一段之後，
  原本的任務句「請向…說明」點不亮 `hasAudience`（檢查器認的是「說明給＿＿看」這類句型），
  所以把該段的正確選項改寫成「請說明這趟航次要注意什麼，寫給今晚第一次上船的擺渡船員看。」
  —— **改的是關卡文案，不是檢查器**（不放寬引擎）。
- **`silent-thinker-13` 的格式段落不能只是刪掉**：刪掉之後 `hasConstraint` 只剩 0.5 分（「500 枚硬幣」拿不到滿分），
  全部選對就不再是滿分。改成整段換掉：問「怎麼讓它知道做到哪裡算完成？」，正解是
  「成功條件：3 個階段、總共不超過 200 個字。」——那正好就是 `reasoning-02` 教的「非常具體的成功標準」，
  比原本的格式段更貼這一關的主題。
- **小數門檻真的會漏到畫面上**：`assignsTask` 0.5 ＋ pass −0.5 之後，進度燈與結果面板都會出現 `2.5`；
  部分分數相乘還會生出 `0.375` 這種值。新增 `formatScore()`（四捨五入到 2 位、整數不拖尾巴）
  並在 console／practice 兩支 UI 全面套用，測試同時守「不准把裸浮點塞進畫面」。
- **e2e 在 Phase A 之前就已經是紅的（不是這一期弄壞的）**：`scripts/headless-check.mjs` 還留著
  Phase 34.5 撤掉的打字機標題卡斷言（`.title__typed`／`.title__caret`／`[data-typed="tag"]`），
  第 6 個斷言之後就 `TypeError: reading 'textContent' of null` **整支中斷**，後面一項都沒跑到。
  Phase 0 只在 `test-rubric.mjs` 重建了那 12 條、e2e 當期跳過，所以沒被發現。
  Phase A 依同一個做法把 e2e 的兩個標題卡區段改成斷言「今天的設計」（文字第一幀就完整、揭示由 CSS 延遲驅動、
  按下去直接進場），否則 Phase A 的四幕改動根本驗不到。
  修好之後又露出第二個既有問題：`reloadPage()` 在換頁的尾巴上，下一個 CDP 呼叫會撞到
  「Inspected target navigated or closed」**讓整支中斷**（不是某一條斷言紅）。已補一次
  `document.readyState === 'complete'` 的輪詢等頁面穩定（不是加長固定 sleep）。
- **e2e 有兩條寫死「第 1 / 4 段」**：面具工坊收斂成 3 段之後會假性失敗。改成由資料的段數推導
  （`第 1 / ${slots} 段`）—— 這種「歷史快照型斷言」正是 `task_plan.md` §4 要求改成 invariant 的那一類。
- **e2e 的入場門區段也還在量已經不存在的 `.entrygate__hint`**（同樣是 Phase 34.5 的殘留）：
  `getComputedStyle(null)` 讓最後一段整個中斷。改成斷言今天的門面（呼吸燈 ＋ 一句話 ＋ sr-only 提示）。
- **已知 flaky 家族「拖曳」**：`priority-stair-42` 的滑鼠拖曳原本用固定 sleep（140／90／360ms），
  在 200ms/幀 的軟體渲染上「抓起來」與「放下」會撞在同一幀。依 `AGENTS.md` 改成 poll-until：
  等 `.slip.is-dragging` 出現才開始移動、輪詢等 `arrangement[0]` 真的變成目標（每輪補一次微小移動）、
  放開後再等拖曳狀態收乾淨。
  **另外用獨立的 CDP 腳本在同一份工作樹上單獨重現過**：把入場門／標題卡／序章收乾淨之後，
  同一組滑鼠事件會讓 `arrangement` 從 `context,format,role,task` 變成 `role,context,format,task`
  —— 拖曳機制本身是好的，長跑到那一段失敗是「有東西疊在上面吃掉指標事件」這一類的狀態問題，
  **與 Phase A 無關**（`priority-stair-42` 的 `orderFlow` 一個字都沒改）。
  因此又加了兩件事：拖曳前先把可能還開著的分享卡／圖鑑／設定收掉，並把
  `elementFromPoint` 的結果寫進失敗訊息，下次再紅時一眼看得出是誰擋住的。
- **入場門呼吸燈的透明度是來回擺盪的**：原本單點取樣 `opacity > 0.4`，剛好取到最暗那一格就紅
  （實測 0.3511）。改成併進既有的輪詢條件（等它擺到亮的那一段再取樣）。
- **應用關的第二幕維持原樣**：`council-envoy-06`／`archive-seal-25` 沒有主技巧（`primaryTechniqueId: null`），
  UI 就退回 Phase 12 的「每條檢查各一段刻文＋各自的原典」——它們本來就不是「一次教四條」，
  而是「把學過的四條用出來」。真正的應用關型式（跳過第二幕、動態組 rubric）等 Phase J。

## 文件勘誤（dated errata · 2026-08-01，不改歷史文件）

| 文件 | 寫的 | 現況實測 | 處置 |
|---|---|---|---|
| `HANDOFF.md` 邊界條件 | 27 關遷移「保留 4／改造 21／轉應用關 2」 | 逐關表點名為 **5／20／2** | 以 `curriculum-v2.md` §4 逐關表為準（D1）；`HANDOFF.md` 不改寫，本表留痕 |
| `docs/promptbooks/gap-analysis.md` §3 | 「26 關 × 4–7 條 ＝ 106 條檢查項」、`assignsTask` 26/26、前三名合計 49% | **27 關／118 條**；`assignsTask` 27/27、`specifiesFormat` 14、`hasDelimiters` 12、前三名合計 **44.9%** | 建議數字全部用現況重算；舊百分比不可直接當驗收門 |
| `docs/promptbooks/gap-analysis.md` §3 建議 3 | 5 關 `hasDelimiters` 2→1 | 其中 3 關的分隔符是 v2 的主檢查 | Phase A 只降 2 關，其餘 `hold`（manifest 已記 conflict 與理由） |
| `curriculum-v2.md` §4 `gate-of-clarity-01` 列 | 「拆掉 hasAudience／assignsTask」 | 同節「全域改動」寫 `assignsTask` 一律降為 0.5 | Phase A 一律降權（D3 的 −0.5 在算術上正是這一步）；整條移除等 §3 foundations #5「只會點頭的信差」上線，屬 post-A |
| `curriculum-v2.md` §3 foundations #14 | 「規則牆」沒有標（改造） | §4 明指 `long-scroll-archive-05` 遷入 `pos-rules-first` | 視為同一座神廟（長卷檔案室 → 規則牆），§3 漏標 |
| `curriculum-v2.md` §3 神廟名的「（保留）」 | 多座與 §4 的「改造」看似矛盾 | 兩者語意不同 | §3 的「（保留）」＝沿用既有石座與資料；§4 的處置欄＝主題是否收斂。`disposition` 一律取自 §4 |
| `WORLD.md` 效能現況 | 約 143k 三角形／44 盞燈 | 本次實測 **142,664 三角形／45 盞燈**（高畫質） | 數字接近，仍以每期實測為準，不引用文件舊值 |
| `curriculum-v2.md` §7.6 風險段 | 125k 三角形／47 盞燈 | 同上，已過期 | 同上 |

## 待盤點

- `HANDOFF.md` 的未完成項目、優先級、驗收條件與已知阻塞。
- `CLAUDE.md` 的北極星、硬護欄與最近變更。
- `WORLD.md` 的互動、擺放、效能、碰撞規則及 29 項維護清單。
- 工作樹、測試與 build 現況。
- `curriculum-v2.md` §8 A–K 路線與 Phase A／B 的檔案級契約。
- `gap-analysis.md` §3 的逐關重複度診斷。

## Phase B step 1 實作發現（catalog bridge · 2026-08-01）

- **`groupsOrdered()` 是整個相容層最危險的一格**。第一版讓 catalog 在「只給 curriculum」時
  回傳空的區域表，結果 `content.groupsOrdered()` 直接變成 `[]` —— 圖鑑與結果卡會整個空掉。
  已改成：沒給 `regions-v2` 時就用 `curriculum.groups` **就地合成一份「全部已上線」的區域表**，
  並加了一條測試逐欄比對「catalog 版 == legacy 版」，之後任何人動這一層都會被擋下來。
- **`legacyTechniqueId` 是多對一，而且必須允許重複**。`clarity-03` 同時是 `clear-specific`
  （遷移 manifest 指定）與 `clear-constraint`（附錄 C 子集推導）的祖先 —— 這是「舊課程一條、
  v2 拆成兩條」的正常結果，不是錯誤。真正要唯一的是**關卡的 `primaryTechniqueId`**（C2），
  那條約束仍然在 Phase A 的測試裡守著，兩者語意不同不要混為一談。
- **遷移 manifest 的 `needsV2Catalog` 在這一期收尾了**：`oracle-workshop-36` 的 v2 技能
  `tool-when-not` 在舊 68 條裡沒有祖先，Phase 0 暫用 `agentic-01` 佔位。現在 `agentic-01`
  的真正後裔是 `tool-native-field`（「用 API 的 tools 欄位定義工具」逐字對得上），
  所以 `tool-when-not.legacyTechniqueId` 誠實填 `null` ＋ `legacyNote` 記下理由，
  並由測試強制「標了 needsV2Catalog 的關卡，其 v2 技能必須有自己的官方出處且誠實記下沒有祖先」。
- **出處不能用人工重打，要用解析的**。130 條技能的 445 筆出處全部由程式從 master list 的
  「出處」欄擷取；測試在 CI 裡**重新解析一次 master list 並逐筆回查**。這讓「自撰摘要冒充官方引文」
  在結構上不可能發生（護欄 2），代價只是測試多跑一次 markdown 解析。
- **master list 的「出處」欄有兩種寫法**（多行條列、以及單行 `- **出處**：X · Y — url`），
  還有一種尾巴帶 `**（原文件已標示下架…）**` 的變體。只寫多行版的解析器會漏掉 100 多個條目
  且完全不報錯 —— 這種「安靜漏掉」比壞掉更危險，所以解析器與測試都同時處理三種形態，
  並以「零個條目解析不到出處」當成健康度斷言（實際只有 #11 是真的找不到）。
- **`docs/design/curriculum-v2.md` §1 蒸餾規則 3 已經先把「找不到」的條目排除掉了**，
  所以 130 條技能實際上**一條都沒有** `sources: []`。任務預期的「≤3 條」上限仍然寫進
  `scripts/expected-counts.json` 當天花板，超過就代表有人把沒出處的東西寫成教學。
- **`ranks.json` 的最高階門檻改成 `"all"` 是唯一會動到玩家可見數字的地方**（目前解析成 68／5，
  完全一樣）。稱號那句話「六十八條刻文全數入冊，五片土地與你同聲」刻意**不動** ——
  那是世界觀台詞，等課程真的長大時再一起改寫，現在改只會製造無意義的 e2e 差異。
- **字型語料是保守超集，會被新資料檔拉大**：CJK 1634 → 1664 字、1331.5 → 1348.4 KB，
  因為掃到了 `skill-codex-v2.json` 裡的中文廠商名（`Qwen（阿里雲百煉）`）、中文文件名與區域主題句。
  這些字目前一個都還沒上畫面。Phase 6 的建議（「執行期偵測缺字再改成只掃字串字面值」）仍然有效，
  但在新內容一期一期進來的階段，寧可多切也不要漏字。
- **e2e 的 6 條環境型 flaky 在 load average 11 的機器上會一起出現**（開場曲自動播放時序、
  fps 暖機、火盆亮度取樣、設定焦點時序、拖曳 2 條）。第二次跑 1,816 項全過。
  這一組值得之後照 `AGENTS.md` 全部改成 poll-until —— 目前只有拖曳那一組（Phase A）改過。


## Phase B step 2 實作發現（`fix`／`spot` ＋ 撰寫基本功十座 · 2026-08-01）

### 決策

- **`skillsV2[]` 的形狀**：純字串陣列的存檔欄位（`promptasy.v1.save.skillsV2`），
  `normalize()` 補空陣列、去重、丟掉非字串。**刻意不塞進 `collected`** ——
  `collected` 存的是舊 68 條技巧的 id，圖鑑／四廠徽章／稱號／隱藏成就全部依它算；
  v2 的 130 條技能有 85 條在舊 68 條裡**沒有祖先**（`legacyTechniqueId: null`），
  混進去會讓「x / 68」與徽章數字失真。所以新神廟通關時**兩邊各寫各的**：
  有祖先的照舊寫進 `collected`（D2：收集不倒退），技能本身寫進 `skillsV2`。
  `recordResult()` 的回傳多一個 `newlySkills`；`isSkillCollected()` / `collectedSkills()` 已上線，
  圖鑑要用它是後續的事（這一期只把存檔與進度接起來）。
- **`primarySkillId` 而不是第 26 條 `primaryTechniqueId`**：C2 要求「一條技巧只教一次」，
  舊 68 條的主技巧已經被既有 25 關用光；新神廟教的是 v2 技能，所以資料層多一個
  `primarySkillId`（rubric 的主檢查那一列也掛 `skillId`），`primaryTechniqueId` 一律 `null`。
  第二幕的「神諭原典」改走 `content.sourceForSkill()`（catalog）——
  一樣是**真實文件名 ＋ 可點的 https**（護欄 2、WORLD.md §3.4），不是換一套說法。
  `content.sourceName()` 也要吃 v2 出處，否則結果面板會秀出一長串網址。
- **改碑的 `Esc` 是三段式，由內往外**（文件寫在 `src/prompt/fix.js` 檔頭）：
  ① 替代寫法攤開著 → 收起來，那一句維持原樣；
  ② 焦點停在**已經改好**的句子 → 還原成原本的壞寫法並重新攤開替代寫法；
  ③ 以上都不是 → **不攔截**，讓事件冒泡出去收起面板。
  也就是「`Esc` 永遠先還原你剛剛做的那一步，沒東西可還原了才變回走出去的鑰匙」。
  點碑同理（點起來的 → 放回去；沒點起來的 → 冒泡）。三段都用 `aria-live` 講出來。
  這件事必須寫死並測到 —— 不然鍵盤玩家會在「想收起選項」的時候整個面板被關掉。
- **十座的題型分配與 §3 表格有五處差異**（全部是「那個 kind 還沒實作」，不是設計換方向）：

  | 神廟 | §3 指定 | 這一期 | 理由 |
  |---|---|---|---|
  | 量繩之桌 `clear-constraint` | `constraint` 🟡 | `fix` | `constraint` 是 Phase D 的 kind；「替每條限制找一個單位」本來就是把弱句換掉，fix 是最貼的過渡 |
  | 一字之差的岔路 `word-choice` | `tradeoff` | `choice` | `tradeoff` 是 Phase C 的 kind |
  | 空手的信使 `context-supply` | `disclose` 🔴 | `fix` | `disclose`（跨世界素材背包）是 Phase K **選配**；用 fix 讓玩家把「你自己去查」換成真的資料 |
  | 舊標籤的倉庫 `struct-xml` | `tradeoff` | `choice` | 同上，Phase C |
  | 零件表 `struct-anatomy` | `reverse` 🟡 | `spot` | `reverse` 是 Phase J 的 kind；「替每個零件貼名字、找出兩塊其實是同一個零件」用 spot 幾乎等價 |

  這五座的 `kind` 換掉時**只要換第三幕的資料**，關卡文案、rubric、出處都不必動。
- **C4（不得連續三座同型）目前只對新神廟成立**：既有六關（`gate-of-clarity-01` … `council-envoy-06`）
  仍然全是 choice，因為 §4 指定的題型換裝（例如 postbox → order）屬於那幾關自己的改造，不在這一期。
  測試的 C4 迴圈因此只掃有 `primarySkillId` 的關卡，並在註解裡寫明「等它們改造完就把這裡放開成整區」。

### 卡住 / 沒做的事（誠實記錄）

- **`rulesBeforeData` 與 `usesRareDelimiter` 沒有實作。** 它們是 foundations 表裡另外兩個 🆕，
  但遷移 manifest 的不變式擋住了：`long-scroll-archive-05` 標了 `newChecker: true`，
  測試會斷言「主檢查 `rulesBeforeData` **確實還不存在**」；而要讓它存在，就得同時
  (a) 改 manifest 那一行、(b) 執行該關的 post-A 改造（移除 `groundsInContext`／`hasConstraint`）、
  (c) 連帶改 `totalWeightAfter` / `passAfter`（passAfter 被釘死成 `passBefore − 0.5`）。
  那是「規則牆」那一座神廟自己的改造，不是這一期的「新增十座」。
  `usesRareDelimiter` 同理（要動 `postbox-sprite-02` 的 rubric 總權重）。**兩者一起留給那一關的改造。**
- **石座的燈是這一期差點撞牆的地方。** 一座一盞 PointLight，27 → 37 座之後高畫質實測 **59 盞**，
  超過 WORLD.md §6.1 的 56 盞（e2e 當場紅）。改成常數 8 盞的燈池指派給最近的幾座之後是 **26 盞**。
  沒有這一步，Phase C 再加 10 座就一定過不了；**燈數從此不隨關卡數成長**。
  代價：`marker.glow` 現在是一個 `{ color, intensity, position.y, worldY }` 的代理物件，
  不是 `THREE.PointLight` —— 之後若有人想對它做 `add()`／`shadow` 之類的事會失敗（已在程式碼註解寫明）。
- **`assignsTask` 第一次當上主檢查**（只會點頭的信差）。這跟 `gap-analysis.md` §3 建議 1
  「assignsTask 是及格線不是技巧」看似矛盾，其實不是：那條建議說的是「不該當**每一關**的教學目標」，
  而 `clear-imperative` 這座神廟教的**就是**「要它動手而不是給建議」。
  遷移 manifest 的 `mainCheck !== 'assignsTask'` 斷言只掃既有 27 關，沒有被放寬。
- **離線檢查器分不出「請你評估一下」是徵詢還是指令**。信差那一關原本想用它當「看似有動詞其實在徵詢」
  的那一拍，但 `assignsTask` 會把「評估」認成任務動詞（它本來就是動詞）。
  沒有為了關卡放寬引擎 —— 改的是關卡文案（那一句改成純問句「不知道這樣做好不好？」），
  教學上的因果由 spot 的就地回饋承擔。
- **「一句都沒改的草稿一定不過關」這條門檻做不到，而且不該做。** Phase 9 把 `pass` 放寬到總權重的一半，
  C1 之後一關只有「主檢查 3 ＋ 地基 0.5」，所以主檢查拿部分分數（0.5×3）＋地基滿分（0.5）＝ 2.0
  就剛好碰到門檻。真正該守的是**「這一關教的那一條沒有滿分」＋「評價進不了 A」**，測試改成守這兩條。
  而且在改碑／點碑模式下草稿根本送不出去（手掌印要做完才出現），玩家不會遇到這個邊界。
- **`鿿`（U+9FFF）差點被切進字型子集**：新檢查器一開始把 CJK 範圍寫成字面 `[一-鿿]`，
  語料掃描器把區間結尾那個字當成真的要用的字，結果原始字型缺字、指紋測試紅。
  改回 `[\u4e00-\u9fff]` 轉義寫法即可（`checks.js` 原本的 `CJK_RE` 就是這樣寫的 —— 有原因的）。
- **`快速填入不是直接給答案` 這條既有斷言擋下了六座新神廟**：一開始圖省事讓每一顆快速填入
  剛好等於示範解答的一行，串起來就是整份答案卷。已改成「零件」（把其中一顆改成通用版本）。
  這條斷言值得記下來 —— 它守的是 P3 鷹架遞減，不是格式潔癖。


## Phase C 實作發現（`induct`／`tradeoff` ＋ 示範與推理 15 座 · 2026-08-01）

### 決策

- **兩種新題型真的只是「石碑刻印的變體」，不是新框架。** 推規碑與雙面碑各自只多一段
  「先想通一件事」的舞台（猜規律／秤兩面），想通之後**回到同一份 `flows.json` 的 `slots`** 刻印。
  為此抽出 `src/prompt/slots.js`（刻印段落：DOM、選項狀態、石屑、焦點、組出來的文字），
  由 induct／tradeoff 兩支共用；**`src/prompt/stele.js` 一個字都沒改** ——
  它是 Phase 11 就在跑的預設路徑，沒有理由為了少幾行程式碼冒回歸的險（跟 Phase 27 抽 `palm.js` 時同一個判斷）。
  相容契約也因此多一條：`induct` / `tradeoff` 除了自己的資料，**還要有合法的 `slots`**，
  否則一律退回石碑刻印（rubric ＋ e2e 各守一次）。
- **「第四例真的驗證規則」是資料結構的事，不是文案宣稱。** `isInductFlow()` 硬性要求：
  最後一輪 `validates: true` 且 `reveal === examples.length - 1`（＝牆上剛好露出「除了它以外」的全部）。
  再加三條 rubric 不變式把教學意義釘死：**第一輪的正解 `follows: 'both'`**（只看前兩組推不出是哪一條規律）、
  **驗證輪的正解 `follows: 'true'`**、**驗證輪一定放著一個 `follows: 'naive'` 的選項且它不是正解、
  並帶 ≥20 字的回饋**。少了第一條，規律在第一輪就分出來了，第四例就只是第三個練習題。
- **雙面碑刻意做成「沒有正解」。** 每一輪是一張卡，兩面都會前進；差別只在碑說了什麼。
  「不把取捨教成假通則」落成一條可執行的不變式：**整關的 `favours` 必須兩面都出現過**
  （換一張卡贏家就翻面）。另外測試禁止輸的那一面被寫成「錯」（`你錯了|答錯|不可以用|絕對不能…`）——
  它只是在這一張卡上比較貴。第一版那條正則寫成 `絕對不`，把
  「你得先挑一個內文**絕對不會**出現的標籤名」誤判成責備語 —— 改成 `絕對不(?:能|要|可)`。
- **兩座神廟共用同一個主檢查是設計指定的，不是偷懶。** `justifiesExampleCount` 同時是
  「秤例之台」（幾組才夠）與「兩位掌燈人」（什麼時候不放）的主檢查；`mentionsParameters` 同時是
  「火力熔爐」與「兩段式的鐘」的主檢查 —— curriculum-v2 §3 就是這樣分派的。
  C2 管的是**技能只教一次**（`primarySkillId` 不重複），不是檢查器不重複。
- **改造的 5 關同時掛 `primaryTechniqueId` 與 `primarySkillId`。** 它們真的有祖先技巧
  （`fewshot-01` / `fewshot-03` / `reasoning-01` / `cot-02` / `params-03`），收集不能倒退（D2），
  所以兩邊各寫各的：`teaches` → `collected`，`primarySkillId` → `skillsV2`。
  Phase B 那條「課程 v2 的神廟不掛舊 68 條主技巧」的斷言因此改成**分兩種**：
  在遷移 manifest 裡的 → 必須等於 manifest 指定的那一條；不在 manifest 裡的（新蓋的）→ 必須是 `null`。

### 卡住 / 需要改到別處的事（誠實記錄）

- **`legacyChallenges` 的判準壞在 Phase C 的第一分鐘。** 遷移 manifest 的驗證迴圈原本用
  「沒有 `primarySkillId`」來認那 27 關；示範與推理五關拿到 `primarySkillId` 之後，
  它們會**安靜地掉出迴圈**（27 → 22），而且是「測試變少」不是「測試變紅」——最危險的那一種。
  改成以 manifest 的 id 為準（`manifestIds`），並保留原本的 27 筆數字斷言把它釘死。
- **manifest 有兩條 Phase 0 沒掃到的移除。** `example-hall-11` 的 `hasDelimiters`
  （主題屬於郵箱精靈的分揀台）與 `thinking-chamber-14` 的 `hasStepByStep`
  （主題屬於這一期新蓋的「一步一階的橋」）——留著就違反 C1／C2，但 §4 逐關表沒有列。
  處置：以 `addedIn: "C"` 標在 manifest 上並寫下理由，**不改寫既有條目**；
  `passAfter` / `totalWeightAfter` 保留 Phase A 的歷史值，Phase C 之後的現況另記 `passAfterC` / `totalWeightAfterC`。
  測試也跟著多一條：同一條檢查如果 Phase A 降權、Phase C 又整條移除，Phase A 的降權目標就不再存在。
- **`keepsPromptLean` 原本抓不到「盡量徹底」。** 「磨過頭的刀」（`overthinking-remove`）的起手弱寫法
  就是官方那句 "overthinking and excessive thoroughness" 講的鷹架，但它又短又有動詞 ——
  舊的 `keepsPromptLean` 會給它滿分，起手弱寫法就變成正解了。
  補上 `THOROUGH_SCAFFOLD_ZH/EN`（盡量完整／盡量徹底／愈詳細愈好／as thorough as possible…）
  並與「一步一步想」同列為鷹架。這是**檢查器變嚴**，不是為了關卡放寬。
- **`labelsNegativeExample` 的「同段落」不能用空行判。** 第一版用空行切段，
  沒有空行的 prompt 會變成一整塊 —— 正例的理由會被算到反例頭上。
  改成「反例的標記與理由要在**同一行或緊接的下一行**」，這才是真的結構偵測。
- **英文寫法有兩處要補**：`SAMPLE_RUN_EN` 原本要求數字緊接在動詞後面（"Run the same question 3 times"
  就中不了），改成允許中間隔一小段；`SAMPLE_TIE_EN` 補上 "if all three differ"。
  另外一條是**改測試不是改檢查器**：`well-pause-22` 的英文對照解答原本用 "decide whether…"
  （`decide` 不在任務動詞表裡），改寫成 "Review … and answer whether …" —— 那是 fixture 的用字問題，
  不值得為了一句 fixture 放寬 `assignsTask`。
- **石座落點在示範與推理這一區真的很擠。** 15 座石座 ＋ 石碑／小景／地標／刻文／祕密／反應物件／器物
  的淨空圈，貪婪的 farthest-point 取樣最多只排得下 8 座。改成**隨機重啟的貪婪**
  （4000 次、最小間距 13.4 公尺）才排得下 10 座。
  另外 `example-scale-16` 第一版落在 `(-98,-60)`，通過所有資料層門檻卻**被真的道具擋住**
  （石座周圍 4–5 公尺有實體）—— 落點掃描一定要把「在 node 裡真的把世界蓋起來、用 `solidAt()` 掃一圈」
  這一步算進去，光靠資料層的距離表不夠。
- **`three-wells-25` 沒有照 §3 用 `workshop`。** 神諭工坊的資料形狀是
  「挑工具 → 填參數 → 排呼叫 → 立規矩」，而三口井教的是「同一題跑幾次、怎麼裁決」——
  硬套會變成一道假的工具題。這一期用 `choice`（三段刻印剛好對上「跑幾次／取多數／平手怎麼辦」），
  題型換裝時只要換第三幕的資料，關卡文案、rubric、出處都不必動。
  同理，`well-pause-22`（§3 指定 `multi`，Phase G）用 `fix`、`effort-forge-15`（§3 指定 `sim`，Phase H）維持 `choice`。
- **`priority-stair-42` 的拖曳終於查出根因（Phase A 起被登記為 flaky）**：`order.js` 的重排帶 FLIP 動畫
  （`withSlide()`：搬完先把每一列 `translate` 回原位，下一個 animation frame 才歸零）。
  軟體渲染下一幀要 160 ms 以上，那段時間裡 `getBoundingClientRect()` 讀到的還是**搬之前**的版面，
  `indexAtY()` 於是算出「跟現在一樣的位置」，`moveTo()` 的 `to !== 現在` 守衛就把後續移動全部擋掉 ——
  石版停在只搬了一格（`context,role,format,task`）。三次跑都一樣，所以它不是時序抖動，是**確定性**的。
  修的是測試端（每一輪重新量清單上緣、由下往上分三步掃、每步之間留 70 ms 讓影格追得上），
  產品碼一個字都沒改：真的玩家的滑鼠本來就會連續移動，而且不會在 168 ms/幀 的軟體渲染上玩。
- **CDP 的原始按鍵不保證會變成按鈕的預設 `click`。** 推規碑第一次跑的時候，`Enter` 在選項上完全沒有反應
  （6 條紅）。改碑與點碑當初自己接 `Enter`／空白鍵不是多此一舉 —— 那是唯一可靠的做法。
  已在 `induct.js` / `tradeoff.js` / `slots.js` 三支補上，順帶也讓真的鍵盤玩家更穩。
- **e2e 的注入字串裡不能直接寫 `'\n'`**：它在樣板字面值裡會被當成真的換行，送進頁面就是未結束的字串
  （`SyntaxError`）。既有的區段寫的是 `'\\n'`，照抄就對了。


## Phase D 實作發現（`constraint` ＋ 脈絡與長文／角色與參數各 12 座 · 2026-08-01）

### 決策

- **合尺（`constraint`）真的只是「把即時預檢搬到台前」**。`src/prompt/constraint.js` 沒有任何自己的
  判準：`measure()` 直接 `import { runCheck } from '../challenges/checks.js'`，跟 rubric 引擎用的是
  同一支函式（護欄 3）。所以尺上的燈與送出後的評分**在結構上不可能分岔**。
  測試守這件事的時候踩到一個坑：第一版用 `/runCheck\(/.test(原始碼)`，結果**檔頭註解裡就寫了
  `runCheck()`**，把呼叫整個換掉測試照樣綠。改成先剝掉註解再驗（實測破壞會紅）。
- **「不會失敗」在合尺上要多做一件事：手掌印會收回去。** 其他題型是「做對才出現」，
  合尺是「做對了會出現、放錯一片又會不見」——因為尺是即時的。這反而是最好的教學：
  玩家會親眼看到「多放一片，那把尺就暗了」。
- **合尺最大的設計陷阱是「全選就過關」。** 大部分檢查器是**單調**的（多寫一句只會加分不會扣分），
  所以如果四把尺全是單調檢查，玩家把石片全部挑上去就一定全亮，這一關就白做了。
  處置：**每一座合尺神廟都必須至少有一把「非單調」的尺**，並且用資料層的不變式釘死
  （`全部挑上去一定有一把尺是暗的`，rubric ＋ playtest 各守一次）。目前用到的非單調檢查是
  `putsQuestionLast`（位置比較：多放東西會把問題擠離最後一行）與 `avoidsPressureLanguage`
  （施壓語一出現就整條歸零）。這條規則值得寫進未來新增合尺神廟的規格。
- **既有 27 關的地基只能有 assignsTask。** 遷移契約有三條互相咬合的斷言：`assignsTask` 必須還在、
  必須標成地基、而且**地基恰好一條**；再加上 C1 的「rubric 上沒有既不是主檢查也不是地基的雜項」，
  結論是**改造後的既有關卡一律只有兩列**。所以 §3 寫的「`hasDelimiters`＋🆕`usesRareDelimiter`」
  這種兩條 rubric 在既有關卡上做不到 —— 只能挑一條當主檢查。
- **`postbox-sprite-02` 的主檢查由 `hasDelimiters` 換成 `usesRareDelimiter`**（manifest 記的 `mainCheck`
  保留為歷史值，換人的理由寫在 `phaseD.note`）。理由有兩層：(a) `hasDelimiters` 已經是
  `struct-xml`（舊標籤的倉庫）與 `cot-separate-answer`（思考室）的主檢查，第三座會讓 C2 形同虛設；
  (b) 這一關的「轉」本來就是「內文自己就有 `---`，切點被吃掉」——那正是 `usesRareDelimiter` 量的東西。
- **`priority-stair-42` 的石版整組換掉了。** `ranksInstructions` 要的是「規矩排出高低 ＋ 牴觸時聽誰的」，
  舊的四片石版（role／task／format／context）是 PTCF 骨架，排對了也點不亮它。新的四片是
  「1. 安全規範／2. 這次委託／3. 個人偏好／牴觸時以排在前面的為準（＋這一次要做的事）」。
  e2e 的滑鼠拖曳那一段跟著改（`grip('safety')` → `grip('rule')`），拖曳機制本身一個字都沒動。
- **`mask-workshop-41` 換成 `fix` 之後，e2e 的「石碑刻印」主線要換一關開。** 那一段長跑
  （快速填入 → 選錯 → 刻滿 → 手印 → S → 存檔）原本開的就是面具工坊；改造後它是改碑，
  整段會失效。改成開 `four-elements-mirror-44`（同一區、仍然是 choice、5 段刻印）。

### 卡住 / 需要改到別處的事（誠實記錄）

- **`groundsInContext` 認的是「上面／下面這份**資料**」而不是「這份卷宗」。** 兩座新神廟的示範解答
  第一版寫「請只根據上面這份卷宗作答」，只拿到 0.75。**沒有為了關卡放寬檢查器** —— 改的是關卡文案
  （「請只根據上面這份資料作答，卷宗裡沒有寫到的就說沒有寫到」），世界觀的詞留在後半句。
- **`### 規則` 這種井號標題，`rulesBeforeData` 第一版認不出來。** 規則／資料區塊的偵測只允許
  `【`、`[`、`<` 這幾種前綴。補上 `#{1,6}\s*` 之後才認得井號版的骨架 —— 這是**檢查器補齊**，
  不是放寬（井號標題本來就是官方寫過的分段語法之一）。
- **起手弱寫法（starter）必須讓主檢查拿 0 分，不能只是「部分分數」。** C1 之後一關的總權重是 3.5、
  門檻 2，所以主檢查只要拿到 0.5×3 ＝ 1.5 再加地基 0.5 就剛好 2.0 —— **會過關**。
  這一期有三關的起手寫法因此重寫（標記之泉、兩種文法的殿、抉擇之秤）。
- **`maskNonInstruction` 會把成對標籤裡的內容遮掉。** 兩種文法的殿第一版把任務句寫在
  `<任務>…</任務>` 裡，`assignsTask` 直接 0 分。改成任務句寫在標籤外面、標籤只包角色與資料 ——
  這其實也比較貼近官方的骨架寫法。
- **排序刻印的初始排法必須是「一片都沒站對」的錯排（derangement）。** 三份新的 order 資料第一版
  各有一個固定點，測試立刻紅。這條斷言守的是「真的要動手排」，不是格式潔癖。
- **點碑要 4–8 片石籤、而且至少兩片是要留著的。** 新的三座點碑第一版只有 3–4 片、各只有 1 片好的，
  被既有斷言擋下來（那條斷言守的是「轉」：一定要有一片看起來壞其實要留）。
- **石座落點的掃描一定要「在 node 裡把世界蓋起來」再驗一次。** 純資料層的距離表會漏掉道具；
  這一期有一座（`three-mirrors-32`）通過所有距離門檻，卻落在「星圖林」祕密的 7.9 公尺內
  （既有斷言要求 ≥8）。另外要注意判準是**石座本體要擋得住人、周圍 2–5 公尺 24 個方向都走得到**，
  第一版誤把「石座本體有碰撞」當成被擋住，結果 15 座全部判成失敗。
- **行動裝置：世界的觸控移動明確不做（記錄為未採用）。** 這一期只還「面板」的債
  （四幕、八種題型、結果、圖鑑、設定在 720×900 與 390×844 可操作）。虛擬搖桿牽動相機、碰撞、
  HUD 版面與序章的四道門檻判定，屬於獨立一期的工作量；先做面板是因為**新題型的 UI 無法操作
  才是真正會卡死玩家的那一種債**（task_plan Phase D 的原話）。

### e2e 這一期的四件事（誠實記錄）

- **`mask-workshop-41` 換成 `fix` 之後，e2e 的「石碑刻印」主線整段失效。** 那一段長跑
  （快速填入 → 選錯 → 刻滿 → 手印 → S → 存檔 → 分享）原本就是開面具工坊。改成開
  `four-elements-mirror-44`（同一區、仍然是 choice、5 段刻印），順手把「結果面板列出 5 條檢查」
  這種**寫死條數**的斷言改成由資料現算。
- **「純鍵盤走完一圈」挑的是「第一個還沒通關又有流程的關卡」** —— Phase D 之後那一關變成
  `order`，整段（焦點落在第一個選項、數字鍵刻印…）就全紅了。改成挑「第一個 kind 是 choice 的」。
  這一類「挑第一個」的選法本來就脆；改法是把**這一段到底要驗哪一種題型**寫進選法裡。
- **拖曳那一段的終點座標抓錯了石版。** Phase D 把優先序階梯的石版換成三條規矩的階梯之後，
  宣告順序裡的第二片不再是畫面上最上面那一片，滑鼠因此只把第二片跟第一片對調。
  改成**量整份清單的上緣**（`[data-slips]` 的 `top`）當終點，並在捲到定位後才取座標 ——
  產品碼一個字都沒改。
- **`.tech__chips` 是圖鑑在 390px 上溢位 140px 的元凶。** 用一支獨立的 CDP 探針（種一份全收集的
  存檔、開圖鑑、逐個元素量右緣）當場抓出來：那一排廠家礦籤是 `flex: none` ＋ `margin-left: auto`，
  窄畫面會被推出容器。修好之後剩下的 13px 來自 **ⓘ 的絕對定位氣泡伸進 padding 區** ——
  畫面上一個像素都沒有凸出去，所以那兩張面板的判準改成「逐個元素比對內容邊」＋「整頁不會水平捲動」，
  而不是 `scrollWidth`（石碑那八種題型仍然用最嚴的 `scrollWidth === clientWidth`）。
- **觸控目標訂 44px 而不是 40px。** e2e 量 `getBoundingClientRect().height >= 40`；如果 CSS 剛好也寫
  40，次像素排版會讓它讀到 39.99 而假性失敗。CSS 一律給 44（Apple HIG 的建議值），量測留 4px 餘裕。
- **一次「整台機器太忙」造成的假紅要記下來**：其中一輪 e2e 在 load average 12（我自己留下 34 個
  孤兒 chrome）時，序章那一段出現 4 條紅（第一堂課的進度變成三堂課都做完）。把孤兒進程清乾淨、
  load 降到 1.7 之後同一份程式碼跑出來完全乾淨。**這一組不是新的 flaky 家族，是環境**；
  但它提醒一件事：e2e 收尾要真的把整個 process group 殺乾淨，否則下一輪會被自己拖垮。


## Phase E 實作發現（量器坊 · 新地形 ＋ 14 座 · 2026-08-02）

### 決策

- **新地形的半徑不是美術決定的，是網格決定的。** `buildTerrain()` 的平面是
  `WORLD_RADIUS * 2 + 40` ＝ 340 公尺見方（±170）。正南那片土地放在 `(0, 124)` 之後，
  半徑最多只能到 44（124 + 44 = 168），再大就會有一角掉出網格外變成看不見的洞。
  **刻意不去放大那張平面**：`seg` 是固定的 200，放大平面等於把**整個世界**的地形變粗一格，
  為了一片新土地讓既有五區的地貌全部改變不划算。
  新增了一條逐區斷言「整片土地都在地形網格裡」，之後再開新區時會當場被擋下來。
- **`colorOf()` 是新區域最容易斷掉的一格。** 世界的地面染色、石座光暈、閘門顏色全部走
  `curriculum.groups` 的 `color`，而新區域**不可能**出現在那一檔（它必須 byte-identical）。
  處置：`createWorld()` 新增 `regions` 參數收 `catalog.implementedRegions()`，
  查不到就退回預設灰藍（不會壞）；catalog 那一層則強制「新上線的區域必須自己宣告主色」，
  否則建構時丟例外 —— 不然會安靜地做出一片灰色的土地。
- **catalog 的「已實作＝curriculum.groups」硬相等是 Phase B 就埋下的定時炸彈。**
  它在 Phase B–D 是對的（世界真的只有五區），但第一個新區域上線的那一刻它必然要改。
  改法刻意不是「拿掉這條檢查」，而是收斂成「**以既有五區開頭、順序一樣**，後面才准接新區」——
  舊五區少一個、換順序、或新區插到中間，仍然當場丟例外。
- **`regionMastery()` 分岔成兩條路，而不是改寫成一條。** 既有五區有 legacy 技巧，
  完成度照舊由 `collected` 算（收集不倒退，D2）；量器坊在舊 68 條裡沒有主題，
  改用該區的 v2 技能（`skillsV2`）算，回傳多一個 `skillBased` 旗標讓圖鑑知道要寫「條技法」。
  **刻意不把 v2 技能混進 `collected`** —— 那會讓「x / 68」與四廠徽章失真（Phase B 的同一個判斷）。
- **知識式軟門檻（C8）要能查到「祖先技巧」才走得到。** 量器坊的門檻是
  `clear-specific` ＋ config 任一座，但 `clear-specific` **還沒有自己的神廟**
  （它屬於清晰之門，那一關的改造排在後面的期別）。所以 `knowsSkill()` 走兩條路：
  技能本身進了 `skillsV2`，**或者**它的祖先技巧（`legacyTechniqueId`）已經在 `collected` 裡。
  清晰之門收的正是 `clarity-03` ＝ `clear-specific` 的祖先，門因此走得到。
  這條相容橋是 D2 的一部分，Phase J 拆掉相容層時只留前面那一條——已在程式碼註解寫明。
- **配樂：合成專用比「借一首來墊」誠實。** 量器坊沒有 `bgm_forms.m4a`。
  拿面具劇場那一首來墊，跨橋時聽起來像沒換地方 —— 那比播一段自己的合成 pad 更糟，
  而且會讓「六首配樂各是不同的檔案」這條斷言變成謊話。
  處置：新增 `SYNTH_ONLY_REGIONS` 明確登記，配一組自己的 `REGION_MOODS.forms`
  （根音／音階／鐘聲密度都與其他六組不同，測試逐一比對），並把
  「每個已上線區域＋開場各有一首音檔」改寫成「**有音檔的**那幾區 ＋ 開場」。
  護欄 3 本來就寫著「合成引擎是備援，不是遺跡」——量器坊是第一個真的走這條路的區域。
- **回答語言（`gap-analysis` N-1）本期不新開技能。** curriculum-v2 §附錄 4 已經裁決：
  master list 把它併進既有條目、沒有獨立編號，建議在 E 期以 `system-uses` 的一拍補上。
  `system-uses` 的神廟（`lintel-words-46`，config 區）在 Phase D 就上線了，
  它的英文對照解答本來就含 `Always reply in traditional Chinese.` 這一句。
  **沒有為了湊一條技能而杜撰一個沒有出處的條目**（護欄 2）——留在 master list 補條目之後再開。

### 卡住 / 需要改到別處的事（誠實記錄）

- **`鿿`（U+9FFF）又差點被切進字型子集。** 新檢查器的 `SCHEMA_NAME_ONLY` 一開始把 CJK 範圍
  寫成字面 `[一-鿿]`，語料掃描器把區間結尾那個字當成真的要用的字 → 原始字型缺字、指紋測試紅。
  這是 Phase B 就記過的同一個坑（`checks.js` 原本的 `CJK_RE` 就是寫成 `[\u4e00-\u9fff]`）。
  **這條值得做成 lint**：任何新檔案只要出現字面 CJK 區間就直接紅。
- **「一份／一則／一個清單」會意外點亮 `hasConstraint` 與 `specifiesFormat`。**
  兩座神廟的第一段刻印（純粹的任務句）因此被 playtest 的
  「只刻第一段還不會滿分」擋下來 —— 因為第一段就已經拿到全部分數了。
  改的是**關卡文案**（「改寫成一則公告」→「重寫成公告」、「改寫成一份帶物清單」→
  「今晚要帶的東西重新寫過」），沒有為了關卡放寬檢查器。
- **`starter` 在 C1 之後的邊界非常窄。** 總權重 3.5、門檻 2，所以主檢查只要拿到
  部分分數 0.5×3 ＝ 1.5 再加地基 0.5 就**剛好過關**。
  這一期有四關的起手寫法因此重寫，判準是「讓主檢查拿 0 分」而不是「讓它看起來很弱」
  （Phase D 記過同一件事，這裡再次踩到 —— 值得寫成新神廟的檢查清單）。
- **`saysWhatToPreserve` 的必留清單在中文裡擺在動詞前面。** 第一版用
  「保留：＿＿」這種前置式的正則，結果「數字、期限與結論必須保留」整句抓不到。
  改成「先把 prompt 切成子句、找出含保留動詞的那一句、再由分隔符數出列了幾樣」——
  這才吃得下中文的語序，而且順便讓「列太長＝等於沒縮」這個非單調行為量得出來。
- **`hasFallbackCategory` 一開始太鬆。** 只要有「不屬於任何一類就標成其他」就滿分，
  但這一關的「合」是**固定位置 ＋ 兜底類別**兩件事。改成三個條件都要
  （命名的兜底桶 ＋ 觸發條件 ＋ 固定的答案位置）才滿分，兩件事只做到一件降成 0.75。
- **合尺的非單調尺不能硬湊。** 兩座合尺神廟各自需要一把「多放一片就會暗」的尺
  （Phase D 立下的規則）。這一期本來想在鑄模房也用合尺，但它唯一貼題的非單調檢查
  （`noDuplicateSchemaRules`）**屬於後面那一座神廟**，先拿來當尺會把主題教在前面。
  處置：鑄模房改用 `choice`（§3 指定的 `workshop` 留給 backlog），
  合尺留給抓不住的答案（`avoidsPressureLanguage`）與兩把尺（`avoidsSelfCounting`）。
- **e2e 的「歷史快照型斷言」這一期一次爆了 10 條**（4 道閘門、5 個地標、5 區植被、
  圖鑑 68 條、6 首配樂、5 根指南針、62 關）。它們在五區的世界裡都是對的，
  第六區一上線就全部失真。**全部改成由 catalog／`expected-counts` 現算**——
  這正是 `task_plan.md` §4 要求的那一類改寫，之後再開新區時不會再爆一次。

### kind-swap backlog（§3 指定 vs 這一期實作）

| 神廟 | 技能 | §3 指定 | 這一期 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 給沒看過的人 | `len-readable` | 多輪修正 `multi` 🔴 | `choice` | Phase G | `multi`（第三幕跑兩輪）是 Phase G 的 kind |
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 可隨時 | `workshop` 的資料形狀是「挑工具 → 填參數 → 排呼叫 → 立規矩」，介面文案通篇是「工具牌／值石」；拿來裝 schema 會把玩家教成「模子是一種工具」。等 workshop 的文案抽象化之後再換 |

（Phase B–D 留下的 backlog 沿用不變：量繩之桌 `constraint`、空手的信使 `disclose`、
零件表 `reverse`、三口井 `workshop`、取水之後的停頓 `multi`、火力熔爐 `sim`…
換裝時一律只換第三幕的資料，關卡文案、rubric、出處都不必動。）

### 未做，而且是刻意的

- **量器坊沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物。**
  那四層的測試只要求既有五區（`curriculum.groups`），所以新區不加也不會紅——
  但這代表**量器坊目前比其他五片土地安靜**：走過去只有神廟、地標、小景與植被，
  沒有可以敲的響石、沒有角落的字。這是本期的範圍控制（地形 ＋ 14 座 ＋ 9 個檢查器已經夠重），
  不是漏掉。補的時候要注意：反應物件目前 24 個、上限 30，器物之間硬性 14 公尺，
  兩者都要重新跑一次落點掃描。
- **行動裝置的世界觸控移動仍未做**（Phase D 已記錄為未採用）；本期只驗到面板在 390px 可操作。

## Phase F 實作發現（契約鍛冶場 · 新地形 11 座 ＋ 護欄崗 · 加建 5 座 · 2026-08-02）

### 決策

- **「加建」到底怎麼做？答案是「重疊，而不是搭一座短橋」。** curriculum-v2 §2 把護欄崗
  寫成 🟡「既有地形加建」。三種作法都試算過：
  ① 塞進沉書檔案庫現有的半徑裡 —— 檔案庫已經有 13 座石座，擠不下 5 座（石座之間硬性 13 公尺）；
  ② 拉遠一點、從檔案庫再牽一條橋出去 —— 那就是第七片大陸，不是加建，而且 `CORRIDORS`
     的地形影響會沿著中心到中心的整段抬起一條 9 公尺寬的脊，**改到既有檔案庫的地貌**；
  ③ **兩片土地的覆蓋刻意重疊**，靠 `coverage()` 的 max 讓中間沒有虛空 —— 走出書架就到了。
  選 ③。代價是「重疊處算誰的」變成一個新問題，處置見下一條。
- **重疊處的歸屬用「正規化距離」判定，而不是「誰先出現在陣列裡」。**
  `regionAt()` 原本是「第一個含得住這個點的 site 就贏」——沒有重疊時完全等價，
  一旦重疊就會被陣列順序決定，很脆。改成比 `d / radius`：離自己中心越近（相對於自己的大小）
  的那一片贏。這條規則同時給了閘門一個**天然的位置**：兩片土地的分界點。
  於是「人被擋下來的那一步」正好在拱門底下 —— 不必再寫一條特別的擋人幾何。
  測試逐點驗過既有 89 座石座、8 座地標、22 組小景的區域判定一個都沒有改變。
- **加建的閘門擋的是「地界」，不是一條線。** 既有五道橋的鎖是
  「離該區中心 radius+4 以內 ＋ 橋上過了 gateAt」；照抄到加建上會**咬進母土地**
  （wards 的 radius+4 會蓋到檔案庫的外圈）。改成 `regionAt(x,z).id === 'wards'`——
  精確、可讀，而且與閘門立的位置是同一條界線。
- **哨所的位置是被既有石座逼出來的。** 第一版把它放在檔案庫的東北對角線上，
  結果閘門的柱子離 `three-mirrors-32` 只有 2.5 公尺（石座周圍 5 公尺內不能有碰撞體）。
  試過旋轉軸向：±170 的網格在那個角落只剩 ~29 公尺的餘裕，`d=60、r=30` 的組合把方位
  鎖死在正 45°，一度也轉不動。最後改走**正北**（檔案庫 → 哨所），中心再往東偏 6 公尺
  讓西北角那座「抄書人的桌」（`extract-bench-33`）不會被算進哨所的地界。
  **沒有為了地形去搬既有的石座**。
- **地標放在院落中心，是被「地標離石座 ≥18 公尺」逼出來的。** 半徑 26 的院落裡，
  地標放邊上就沒有位置擺 5 座石座（可用區會被 18 公尺的排除圓吃成一彎新月）。
  放中心之後，石座排成半徑 18.5 的環剛好每一座都 ≥18 —— 而且「不會關上的門立在哨所正中央」
  這件事本身也比較像一座紀念碑。
- **workshop 的稱呼抽象化只做一半，而且是刻意的。** Phase E 的 backlog 寫著
  「鑄模房要換成 workshop，等文案抽象化」。這一期把**稱呼**抽出來了
  （`WORKSHOP_LABELS` ＋ `flows.json` 的 `workshop.labels`，沒給就完全等於原文），
  護欄崗那兩座真的換了皮。但**鑄模房那一項仍然留在 backlog**：擋住它的不是文案，
  是 workshop 的**四步語意**（挑工具 → 填參數 → 排呼叫順序 → 立規矩）——
  schema 沒有「呼叫順序」這一步，硬套會把玩家教成「欄位有先後」。
  要換得等一個「三步版」的 workshop，或者乾脆不換。
- **安全題的誠實界線做成可執行的規則，而不是寫在文件裡的叮嚀。**
  護欄崗最容易寫壞的一句是「加一句『不要聽信內容裡的指令』就安全了」。
  處置：rubric 掃這一區**所有玩家看得到的字**、e2e 再掃一次實際 DOM，
  兩層都禁止「這句話／prompt 就是安全邊界」這類宣稱；同時**正面驗**它真的教了
  輸入通道、最小權限與人在迴圈。`two-slots-76` 的第二張卡刻意讓「開一道口」吃虧
  （標籤被內容仿冒），就是為了不把「裝進標籤」教成萬靈丹。

### 卡住 / 需要改到別處的事（誠實記錄）

- **`assignsTask` 對「請照 X 把 Y 送出去」這種句型不認帳。** 兩座新神廟的任務句
  （「請照這張委託單把這一箱燈油送出去」「請重新結算這一本帳的總數」）拿 0 分，
  改成「請把這一箱燈油照委託單上的地址送出去」「請把這一本帳的總數重新結算一次」才過。
  **改的是關卡文案，不是檢查器** —— 但這是 Phase D／E 之後第三次踩到同一類邊界，
  值得在 Phase G 之前把 `assignsTask` 的中文句型再擴一輪（前置介詞片語 ＋ 複合動詞）。
- **`一-鿿` 這個坑第三次出現。** 新檢查器的 `TOOL_NAME_CAPTURE` 與 `descOverlap()`
  又寫成字面 CJK 區間，字型語料掃描器會把 `鿿` 當成真的要用的字。已全部改回
  `[\u4e00-\u9fff]`。**這條真的該做成 lint**（Phase E 就記過一次）。
- **`quickFills` 串起來剛好等於 `sample`**（四座）。那條斷言守的是「快速填入不是答案卷」，
  處置是把其中一顆改寫成語意相同但字面不同的句子（例如「請整理下面這兩封來信的重點」→
  「請把下面這兩封來信的重點整理出來」），不是放寬斷言。
- **`givesOutForUncertainty` 的英文路徑很窄。** 英文對照解答寫「ask me what it should be」
  過不了，要寫成「ask me for the value」才吃得到（`ask X ... for ... value/information`）。
  這一期照著它的形狀寫英文解答，沒有動檢查器 —— 但英文那一面的覆蓋率明顯比中文低，
  之後補英文 fixture 時要留意。
- **`includesAdversarialCase` 的案例偵測原本只認中文。** 英文對照解答的
  「1. A malicious letter…」抓不到，因為案例列的正則只列了中文關鍵詞。
  已補上 `malicious|injection|spoof|jailbreak|ignore all` 並改成大小寫不敏感。
- **導航閃爍提示會被「新土地開了」的提示擠掉。** e2e 第一輪有 7 條紅在這一段：
  知識式軟門檻在那個時間點替玩家開了契約鍛冶場，「＿＿已開啟，往前走吧」把冷卻計時器
  推起來，於是要驗的「迷路提示」被冷卻擋住。**那是產品的正確行為**（不嘮叨），
  所以改的是測試：在量之前先把冷卻走完。之後每加一道知識式門檻都要留意這一點。
- **入場門那三條是固定 `sleep(900)` 賭輸。** 門淡出 600ms、之後才 `title.open()`，
  在忙碌的機器上不夠。改成 `waitFor` 輪詢 —— `AGENTS.md` 早就寫著「動畫時序類的斷言
  要 poll until」，這是把舊債補上，不是為了讓它變綠。

### kind-swap backlog（§3 指定 vs 目前實作）

| 神廟 | 技能 | §3 指定 | 目前 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 給沒看過的人 | `len-readable` | 多輪修正 `multi` 🔴 | `choice` | Phase G | `multi`（第三幕跑兩輪）是 Phase G 的 kind |
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 待「三步版 workshop」 | **文案已經可以換皮了**（Phase F 的 `workshop.labels`），擋住的是四步語意：schema 沒有「呼叫順序」那一步，硬套會把欄位教成有先後 |

（Phase B–E 留下的 backlog 沿用不變：量繩之桌 `constraint`、空手的信使 `disclose`、
零件表 `reverse`、三口井 `workshop`、取水之後的停頓 `multi`、火力熔爐 `sim`…）

### 未做，而且是刻意的

- **契約鍛冶場與護欄崗沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物。**
  與 Phase E 的量器坊同樣的範圍控制（那四層的測試只要求既有五區）。
  代價一樣：這兩片土地比舊五片安靜。補的時候要注意反應物件目前 24 個、上限 30，
  器物之間硬性 14 公尺，兩者都要重新跑一次落點掃描。
- **`wards` 沒有進 `REGION_NEIGHBORS.grounding` 的預抓清單。** 那份清單只是用來
  「先偷偷抓哪一首壓縮檔」，而護欄崗根本沒有音檔 —— 列進去等於叫預抓器去抓一個不存在的檔案
  （測試也會直接紅在「鄰區必須是真的有音檔的區域」）。等它的 `bgm_wards.m4a` 錄好再加。
- **行動裝置的世界觸控移動仍未做**（Phase D 已記錄為未採用）；本期只驗到面板在 390px 可操作。

## 課程 v2 · Phase G（兩輪刻印 ＋ 校驗場 ＋ 流程與代理收尾，2026-08-02）

### 這一期學到的事

- **「第二輪要有加分」不是自動成立的。** 我自己寫的 playtest 斷言
  「只刻完第一輪還沒滿分」一開始就紅了 —— 6 座 multi 神廟裡有 4 座在第一輪就把
  主檢查做滿了。原因是 C1 之後每一關只有兩條檢查（主 3 ＋ 地基 0.5），
  兩輪一切，分數很容易全部落在第一輪。**處置是改設計不是改斷言**：
  把輪次切成「第一輪＝先寫一版（只有委託）／第二輪＝看過回話之後才補上真正的技巧」，
  這反而更貼近 multi 的前提（round 2 operates ON that draft）。
- **輪次不要另外存一份資料。** 一開始想過讓每一輪帶自己的 `slots`。
  改成「輪次只宣告吃幾段、段落全部住在 `flow.slots`」之後，三件事同時免費拿到：
  退回石碑刻印時玩家刻出來的字一模一樣、結構上不可能串錯輪次、
  測試不必知道題型就能驗「全部選對＝S」。**這是這一期最划算的一個決定。**
- **加建會吃掉母土地的一角，而且是「有東西住在那裡」的那一角。**
  校驗場（半徑 40）併走齒輪工坊西南角之後，有四個既有物件被 `regionAt()`
  改判成 refinery：一個反應物（`orc-chime-draft`）、一個祕密（`echo-shrine`）、
  一件器物（`orc-brazier-forge`），加上我自己新放的一組小景。
  **處置是把它們搬回工坊那一側**（逐一用測試真正要求的門檻搜位置），
  不是放寬測試。下一次做加建之前，先掃一次母土地在那個方向上住了什麼。
- **石座配位要「先放石座、再搬別的東西」。** 第一版腳本反過來做（先搬物件再配石座），
  結果搬過去的物件把石座的空間吃光，orchestration 12 座配不出來。
  倒過來之後兩區都一次配成（最小間距 refinery 15.4 / orchestration 14.8，門檻 13）。
- **地標可以偏心。** 40 公尺半徑要站下 11 座石座，中心那一圈（地標留白 18.6）
  是最貴的地皮。這一期第一次把地標推離區域中心 —— 但實測發現「推到邊角」
  反而更糟（它會擋住剩下那一圈的好地），最後的解法是**把三組小景貼著地標的留白圈擺**，
  讓兩種淨空圈**重疊**而不是相加，一口氣多出約 900 m² 的可用地。
- **`place()` 找不到空位時會退回一個固定點。** 校驗場的照面架有五組疊在同一個地方，
  被淨空濾網掃成幽靈，碰撞稽核直接紅。修法是在那一段自己多試幾次，
  真的找不到就**這一組不擺**（少一組比疊一堆好）。這個坑對每一區都成立，
  但共用的 `place()` 一改就會動到所有區域的 RNG 串流，所以刻意只在新的那一段修。
- **`REGION_MOODS` 的根音撞過兩次。** 先撞 `title`（92.5），改掉之後又撞 `toolcraft`（87.31）。
  加新區域的配樂時先把現有的十個根音印出來再挑。
- **`decisionTree` 的「先看…再看…」跨行。** 正則寫 `[^\n]{0,24}` 時整條斷在換行上；
  決策樹本來就是多行的東西，這一類「跨句結構」的檢查器要用 `[\s\S]`。

### 這一期的偏離（誠實記錄）

- **`prompt-healthcheck`（診斷台）的內容重寫過一次。** §3 指定它與 `meta-when`
  共用 `diagnosesFailureCause`。第一版的素材是「清掉一份長滿病灶的委託」，
  跑出來主檢查 0 分 —— 因為那份答案根本沒有在「分辨病因」。
  **沒有換檢查器**（那會偏離 §3），而是把這一關改寫成「照表逐條看，
  而且每一條病灶都要寫出它屬於哪一類」，並保留 §3 指定的那一拍「轉」
  （有一句看起來像行話，其實是廠裡真的有的東西）。
- **`action-budget`（沙漏工房）用 `choice` 上線。** §3 指定 `sim`（模擬—觀察—調整），
  那是 Phase H 的 kind。記進下面的 kind-swap backlog。

### kind-swap backlog（§3 指定 vs 目前實作）

| 神廟 | 技能 | §3 指定 | 目前 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 沙漏工房 | `action-budget` | 模擬 `sim` 🔴 | `choice` | Phase H | `sim`（轉旋鈕看離線輸出樣本）是 Phase H 的 kind |
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 待「三步版 workshop」 | 擋住的是四步語意：schema 沒有「呼叫順序」那一步，硬套會把欄位教成有先後 |

（Phase B–F 留下的 backlog 沿用不變：量繩之桌 `constraint`、空手的信使 `disclose`、
零件表 `reverse`、三口井 `workshop`、火力熔爐 `sim`、刻度儀之室 `sim`…
**Phase G 已清掉兩筆**：給沒看過的人 `multi` ✅、取水之後的停頓 `multi` ✅。）

### 未做，而且是刻意的

- **校驗場沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物。**
  與量器坊、契約鍛冶場、護欄崗同樣的範圍控制（那四層的測試只要求既有五區）。
  代價一樣：這片院子比舊五片安靜。
- **輪次狀態刻意不落地。** 重新整理頁面時這一關從第一輪重來。
  這不是 bug 也不是妥協 —— 其他八種題型都是這樣，為了 multi 破例做落地存檔
  會多出一個「存檔裡有半局遊戲」的狀態，那才是真正會串輪的來源。
  WORLD.md §3.3b 第 9 條把它寫成規則。
- **`bgm_refinery.m4a` 尚未錄製**；補上時只要在 `BGM_TRACKS` 加一行、
  把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- **`REGION_NEIGHBORS.refinery` 指回 `orchestration`**（它自己沒有音檔，
  預抓的是回程那一首）—— 與護欄崗同一個處理。

## 課程 v2 · Phase H（轉鈕 `sim` ＋ 減法之庭 · 2026-08-02）

### 這一期學到的事

- **加建的「可站立範圍」必須重疊，不是「半徑相加」。** `coverage()` 是
  `smoothstep(radius, flat, d)`，所以一片土地真正走得到的半徑不是 `radius` 而是
  「coverage 掉到 0.45 的那個距離」（radius 與 flat 的差越大，可站立範圍縮得越多）。
  第一版 `(0,-90) r30 flat22` 看起來離高原只有 90 − 62 = 28 公尺，實際上中間空了 7 公尺的虛空。
  **下一次做加建先算這個數字**：`hostReach + annexReach ≥ 距離`，其中
  `reach ≈ radius − 0.48 × (radius − flat)`。
- **加建的頸口會壓到母土地邊緣的既有石座。** 閘門的兩根柱子固定在頸口 ±5.4 公尺，
  正北那條線上剛好站著 `wordfork-12 (0,-52)` —— 柱子卡進它的互動範圍，
  rubric 的「石座周圍 5 公尺走得到」直接紅。試過三種閃避（偏西 20 公尺、偏東、把院子推遠）
  都會踩到別的東西（階梯迴廊的距離、虛空、其他石座），最後**把那一座往南挪 16 公尺**
  （只動座標，題目／評分／出處一個位元組沒動）。做加建之前先看一眼頸口那條線上住了什麼。
- **地標的 18 公尺淨空是新區域最貴的地皮。** 半徑 30 的院子扣掉地標淨空之後只剩一圈
  18–26 的環，再扣掉三組小景（各 10 公尺）與母土地邊緣的既有石座，7 座石座就配不出來。
  這一期試過三種搜尋（隨機貪婪／farthest-point／固定環）都卡在 6 座，
  最後成功的是**「先定角度、再沿半徑往內找第一個合法點」**——
  它允許每一座各自選自己的半徑，等於把環變成一條有彈性的曲線。
- **`flat` 是免費的空間。** 把內圈（完全平坦的核心）從 24 拉到 27，可用的環一口氣寬了 2 公尺 ——
  而且它剛好符合減法之庭的設定（整張地圖上最平的一片土地）。地形參數也是關卡設計的工具。
- **新的門會改變舊測試的前提。** e2e 的手感量測是「一路往北走」，Phase H 之後正北 54 公尺
  多了一道門，走進自動詢問半徑就把操控權交出去 —— 76 條斷言連環紅，而且**兩輪重現一模一樣**
  （所以不是 flaky，是真的回歸）。修的是測試不是遊戲（門會問是對的），
  但這件事值得記著：**在既有動線上新增互動時，先想一遍「哪些測試是沿著那條線走的」**。
- **`keepsPromptLean` 當主檢查時，第一段就會滿分。** 它只看「短 ＋ 有任務」，
  所以任何一句「請＋動作」單獨就是滿分 → 撞到 playtest 的「只刻第一段還不會滿分」。
  解法是把第一段換成**不是指令的那一句**（寫給誰看的 / 手上是什麼），任務往後挪一段 ——
  這反而讓題目更好：先決定讀者，再下指令。

### 這一期的偏離（誠實記錄）

- **`wordfork-12` 的座標動了**（(0,-52) → (-4,-36)）。理由見上；題目、rubric、示範解答、
  出處、id、區域全部沒動，收集與評價不受影響。
- **§3 指定的第四座 `sim`（`contrast-same-name`「同名的兩個旋鈕」）沒做** ——
  它屬於 Phase J 的區域（遷移／分歧），本期只做 §6 指定的三個 spike。
- **`sim` 的樣本是「一個旋鈕一組」而不是「一關一組」**：資料層以 `dialId` 引用，
  理論上兩座神廟可以共用同一個旋鈕。目前三座各用各的（測試驗 `dial.challengeId` 對得上）。

### kind-swap backlog（§3 指定 vs 目前實作）

| 神廟 | 技能 | §3 指定 | 目前 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 待「三步版 workshop」 | 擋住的是四步語意：schema 沒有「呼叫順序」那一步，硬套會把欄位教成有先後 |

（Phase B–F 留下的 backlog 沿用不變：量繩之桌 `constraint`、空手的信使 `disclose`、
零件表 `reverse`、三口井 `workshop`…
**Phase G 清掉兩筆**（給沒看過的人 `multi` ✅、取水之後的停頓 `multi` ✅）；
**Phase H 清掉三筆**：火力熔爐 `sim` ✅、刻度儀之室 `sim` ✅、沙漏工房 `sim` ✅。）

### 未做，而且是刻意的

- **減法之庭沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物。**
  與量器坊、契約鍛冶場、護欄崗、校驗場同樣的範圍控制（那四層的測試只要求既有五區）。
- **`bgm_frugality.m4a` 尚未錄製**；補上時只要在 `BGM_TRACKS` 加一行、
  把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- **`REGION_NEIGHBORS.frugality` 指回 `foundations`**（它自己沒有音檔，預抓的是回程那一首）。

## 課程 v2 · Phase I（觀象臺 · 正東偏北的小地形 ＋ 8 座 · 2026-08-02）

### 這一期學到的事

- **「東北」已經沒有位置了 —— 地圖是有限的，設計文件不是。** curriculum-v2 §二把觀象臺
  寫成「東北高地」，但東北那一角住著沉書檔案庫（`(95,-95) r46`）與它北緣的護欄崗
  （`(101,-142) r26`）。任何離檔案庫中心 < `46 + r + 虛空` 的點都會把兩片土地黏在一起；
  在 `r = 34` 時那個門檻是 84 公尺，而網格上限又要求 `|x| + r ≤ 168`。
  兩條線一交，可行解只剩**正東偏北**。處置：照做並**記下偏離**（世界觀上仍成立 ——
  它是一片抬起來的高地，從中央高原看出去在右前方偏上）。
  **下一次開新區域前先解這組不等式，再挑名字。**
- **地標不一定要放在區域正中央。** 第一版把朝天的鏡放在 `(134,-18)`（區域中心），
  於是 8 座石座只能擠在「地標淨空 18.6」到「可站立半徑 ~28」之間的一圈環上 ——
  怎麼搜都排不下（8 × 13.6 = 109 公尺的弧長）。把地標移到上坡側 `(149,-31)` 之後，
  中央那塊地讓了出來，同一支搜尋器一次就找到 minGap 14.1 的解。
  斷環（foundations）本來就不在高原中心，這件事其實一直有前例。
- **「轉過角度的薄片」是穿模稽核的常客。** 一片 `1.15 × 1.7 × 0.24` 的碎鏡片立起來、
  再繞 Y 轉 45 度，世界座標外接盒的 x/z 兩軸都變成 `(1.15 + 0.24) × 0.707 ≈ 0.98` ——
  最薄兩軸都 ≥ 0.9，於是它「有份量卻走得過去」。**判準吃的是外接盒，不是你心裡的厚度**：
  新增任何會旋轉的薄片時，先算 `(長 + 厚) × 0.707`。
- **飄空物件的下緣要用最壞的縮放去算。** 觀測架的環掛在柱頂 `2.9 × scale`，
  看起來離地兩公尺多；但 `scale` 最小 0.8、地形又有 ±0.45 的觀測溝，
  實測底緣只有 1.39 公尺（`FLOAT_MIN` 是 1.6）。改成 `3.62 × scale` 之後最壞情況仍有 2.4 公尺。
- **字型預算是硬牆，而且撞到它的是「註解裡的形容詞」。** 這一期新增 40 個漢字，
  其中 9 個只出現在程式註解或一句風味比喻裡（撬／玻璃／甜／弧／貪婪／喘／啞／醉／晶）。
  改掉那 9 個字就從 1503840 bytes 回到 1499xxx —— **每一個新字大約 0.65 KB**。
  寫註解時挑常用字，不是文學問題，是載入體感問題。
- **多模態最誠實（也最便宜）的作法是「不放圖」。** 這一區教的是怎麼寫看圖／生圖的 prompt，
  評的仍然只有文字結構。放一張真的圖會帶來三筆成本：資產授權、外部請求的風險、
  以及「遊戲好像真的看得到」的錯覺。改成**抄寫人把圖描述成文字**之後，
  三筆成本一起消失，而且世界觀本來就成立（這個世界只有紙）。規則寫進 WORLD.md §3.3c，
  由 rubric（掃資料層）＋ e2e（掃 DOM ＋ 量 resource timing）兩層守。
- **一條技能一座神廟，但一個檢查器可以有兩座。** `pointsAtRegion` 同時是第一格窗
  （教「指哪一塊 / 指哪一秒」）與看不清的那一角（教「語言解決不了就放大」）的主檢查。
  C2 管的是**技能**不重教，不是檢查器不重用 —— 兩座的示範解答與教學完全不同（playtest 有守）。

### 這一期的偏離（誠實記錄）

- **座標偏離設計文件**：`sight` 落在 `(134, -18)`（正東偏北）而不是東北。理由見上。
- **`ZH_TASK_VERBS` 動了一次**（補「畫一／畫成」）。這是補漏不是放寬：生圖題的委託句
  「請畫一張直式海報：…」在此之前會被判成「沒有任務動詞」。既有 115 關的斷言一條未紅。
- **這一期沒有開新題型**（§3 對這 8 座指定的型式全部落在既有五種裡）。

### 未做，而且是刻意的

- **觀象臺沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物**（與量器坊、契約鍛冶場、
  護欄崗、校驗場、減法之庭同樣的範圍控制）。代價一樣：這片高地比舊五片安靜。
- **`bgm_sight.m4a` 尚未錄製**；補上時只要在 `BGM_TRACKS` 加一行、把 id 從
  `SYNTH_ONLY_REGIONS` 移走即可。
- **`REGION_NEIGHBORS.sight` 指回 `foundations`**（它自己沒有音檔，預抓的是回程那一首）。

### kind-swap backlog（§3 指定 vs 目前實作）

| 神廟 | 技能 | §3 指定 | 目前 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 待「三步版 workshop」 | 擋住的是四步語意：schema 沒有「呼叫順序」那一步（Phase E 起沿用） |

（觀象臺這一期**沒有新增任何 backlog**：§3 指定的五種題型全部照做。）

---

## 課程 v2 · Phase J1（分歧之廳 · 高原上的建物 9 座 ＋ 新題型「拆碑」· 2026-08-02）

### 踩到的坑

- **加建的地界會把別人的橋整條切斷 —— 這是這一期最大的一個坑。**
  分歧之廳照設計要蓋在「中央高原上」，而高原四周只剩東邊那條橋（通往觀象臺，方位 82.3°）
  與東南那條橋（面具劇場，135°）中間那一段縫。任何放得下 9 座石座的圓盤
  （半徑 ≥ 28）都會擦到那兩條橋的其中一條。
  後果不是難看：`isWalkable()` 擋的是「屬於這座尚未解鎖的院子的點」，
  院子的地界一旦蓋到別人的橋上，**那條橋在院子解鎖之前整條走不過去**
  （而分歧之廳是硬門檻，多數玩家一輩子都是鎖著的）。
  **裁決**：這是規則漏了，不是位置沒喬好 —— 在 `regionAt()` 加一條
  「**點落在別人的橋上時，橋說了算**」（只對 `annexOf` 的加建生效）。
  既有的護欄崗／校驗場／減法之庭沒有任何一個點同時落在兩者上，所以行為完全不變
  （測試逐條驗「每一道橋上的閘門仍然算在自己的橋上」）。規則寫進 WORLD.md §1.4。
  三次不同的嘗試（縮半徑到 25、往南挪、往北挪）全部撞到「9 座石座塞不下」或
  「與面具劇場黏在一起」，逐一記在下面的落點表。
- **石座之間 > 13 公尺這條全域門檻，決定了一片土地的最小半徑。**
  分歧之廳原本想做成半徑 25 的小廣場（它是「建物」不是「土地」），
  但 9 座石座 ＋ 地標 18 公尺的淨空，在 r=25 裡怎麼排最小間距都只有 11.4。
  隨機重啟貪婪換成**「最遠點採樣 ＋ 局部改良」**（把最擠的那一對挑出來、
  把其中一個搬到離其他八座最遠的地方，900 次重啟）之後，r=29 才推到 **13.69**。
  結論：**9 座＝半徑 29 是下限**，再小就得改動全域門檻（不該為了一片土地改）。
- **閘門的柱子會卡進石座的互動圈。** 加建的頸口閘門有兩根 `solidRadius: 1.05` 的柱子
  站在 ±5.4 公尺處。新的頸口正好落在「第一根軌」（`first-rail-10`）前面 3.8 公尺 ——
  石座周圍 5 公尺的走位測試會紅。沿用 Phase H 搬 `wordfork-12` 的前例，
  **只動座標**把它往北挪 5.7 公尺到 `(44.5, 23.5)`（題目、評分、流程一個位元組沒動）。
  落點掃描器也因此把「離閘門的**兩根柱子** ≥ 8.5 公尺」加成硬條件（原本只量閘門中心）。
- **`hasConstraint` 會把「一則」當成量化限制。** 「請把公告改寫成**一則**告示」
  拿到滿分的 `hasConstraint` —— 於是「舊叮嚀」那一關的壞草稿直接及格，
  「壞草稿還沒學到東西」的斷言紅了。**沒有改檢查器**（那是既有 115 關共用的判準，
  改它的風險遠大於改一句文案），改成「請把公告改寫成告示」。
  這一類「量詞被當成規格」的誤判之後若再遇到，要一次收進 Phase 10 的候選清單再動。
- **`keepsPromptLean` 讓「第一段」永遠滿分。** 它量的是整段 prompt 夠不夠精簡 ——
  一段話當然精簡。所以「只刻第一段還不會滿分」這條 playtest 門檻在
  `keepsPromptLean` 當主檢查的關卡上必然紅（既有三座剛好都因為 `MIN_PROMPT_LENGTH`
  逃過一劫）。作法：把那一關 `slots` 的第一段換成**沒有任務動詞**的那一句
  （讀者是誰），`assignsTask` 0 分 → 評價落在 A，門檻回到綠。
- **`git show HEAD` 對照新字時要用同一個 CJK 範圍。** 一開始用 `[一-鿿]` 對照
  `collectCorpus()` 的結果，於是全形標點全部被誤報成「新字」。真正新增的漢字只有 10 個
  （厲 史 喬 坪 掠 撕 汊 汐 脾 荒），全部換掉之後字型從 1505632 bytes 回到 1464.5 KB。
  **每一個新字大約 0.56 KB —— 字型預算是硬牆，改的是用字不是預算。**
- **閘門的高度是「覆蓋權重」算出來的，覆蓋一掉下來門就站在坑裡。**
  `terrainHeight()` 的最後一行是 `h - (1 - cover) * 34` —— 內圈（`flat`）設 21 時，
  頸口閘門正下方的覆蓋只有 0.84，於是那裡凹下去 5 公尺。
  後果有兩層：看得到的是一道溝；看不到的是**「走到門前門自己問」再也不會觸發** ——
  `nearestGate()` 量的是 3D 距離，站在門前 5 公尺處的垂直落差 6.4 公尺
  直接把 7.5 公尺的判定半徑吃掉（e2e 連兩輪紅在同一組五條斷言上，第二輪才查出來）。
  **裁決**：把內圈提到 25（廣場本來就該是平的），閘門底下的覆蓋回到 1.0；
  並新增一條 invariant「閘門正下方是平地（coverage > 0.98）」把這個坑釘死。
- **重新載入之後的第一批影格在軟體渲染上可能要好幾秒。** 兩條新斷言與一條 Phase I 的
  舊斷言（HUD／配樂跟著換區、走到門前門自己問）都是「teleport → sleep 900ms → 讀遊戲迴圈的結果」。
  剛 reload 完世界要重蓋、shader 要編譯，900 毫秒可能連一個影格都沒跑完。
  依 AGENTS.md 的建議一律改成**輪詢**（poll until），不是把 sleep 加長。

### 裁決

- **硬門檻是這一期唯一一個對既有互動文法的例外，而且只有這一道。**
  `curriculum-v2.md` §5.4 明訂「全部是 soft requirement，唯一的 hard requirement 是 divergence」。
  實作分三層：資料層 `REGION_GATES.divergence.hard = true`；
  UI 層 `gate.js` 讀 `status.hard`，**那道門的對話框根本不畫「直接前往」**
  （提了卻按不下去比擋住更糟）；進程層 `skipGate()` 再擋一次，
  所以任何路徑（外掛、舊存檔、測試腳本）都寫不進 `skippedGates`。
  文案不寫成失敗：「這一道門要走過去才開 ／ 這裡的每一關都從『你已經知道通則』開始 ／
  先看兩面之詞，學到的只會是混亂。門一直在，回來就好。」
  其餘 11 區的先行前往一字未動（測試逐條守）。理由與規則寫進 WORLD.md §1.4。
- **rubric 欄零偏離。** §三 分歧之廳那張表指定的九個檢查器（含三座共用 `mentionsParameters`）
  全部照做 —— 既有 invariants **沒有**禁止同區重複主檢查（角色與參數本來就有
  `hasRole` ×3、`mentionsParameters` ×2），C2 管的是「技能不重教」而不是「檢查器不重用」。
  **這一期一個新檢查器都沒開**（59/59 早就實作完，`carriesForwardEssentials` 在 Phase H 就上線）。
- **反差題的模型卡掛得出官方出處，是新增一個資料欄位不是新增一種說法。**
  `flows.json` 的 `tradeoffFlow.rounds[].card.sources[]`（選填）會被渲染成
  「神諭原典：〈文件名〉↗」，沒給就完全不顯示 —— 既有的雙面碑一個像素都沒變。
  測試強制：每個 `url` 必須是**這條技能自己的官方清單裡**那一個、`name` 必須逐字等於
  `skill-codex-v2.json` 的 `docName`、兩張卡加起來至少講得出兩家的立場。
  **選項與判詞裡永遠不放連結**（護欄 2 的既有界線未動）。
- **`sim` 的反差題不另外做模型卡。** 「同名的兩個旋鈕」用的是既有的 `condition` ＋ ⓘ
  （畫面上永遠寫得出「這一組在哪一台機器、哪一個時間點成立」），官方出處走第二幕的神諭原典。
  理由：三檔本身就是三張卡，再疊一層連結只會讓旋鈕面變成連結牆。
- **分歧之廳的模型卡一律用「這一台 / 這一張卡」的說法，不點名廠商。**
  卡上的立場只寫官方文件真的寫過的那件事（「不要另外加身分設定」「附了建議的那一段就照著用」
  「歷史訊息只要保留最後的回答」），廠商名字留在**可點的出處**裡。
  這樣既不會把「某某家就是這樣」寫死成刻板印象，也不會杜撰任何一句話。

### 未做，而且是刻意的

- **分歧之廳沒有石碑（lore）／刻文小語／會回應的東西／動得了的器物**（與量器坊、
  契約鍛冶場、護欄崗、校驗場、減法之庭、觀象臺同樣的範圍控制）。
- **`bgm_divergence.m4a` 尚未錄製**；補上時只要在 `BGM_TRACKS` 加一行、
  把 id 從 `SYNTH_ONLY_REGIONS` 移走即可。
- **12 座應用關與大師層印記（`seals[]`）屬於 J2／J3**，這一期一格都沒動。
- **D2 的 legacy teaching/collection bridge 還在**（拆掉它是 J3 的事）。

### kind-swap backlog（§3 指定 vs 目前實作）

| 神廟 | 技能 | §3 指定 | 目前 | 何時換 | 理由 |
|---|---|---|---|---|---|
| 鑄模房 | `so-basics` | 派送／分流 `workshop` | `choice` | 待「三步版 workshop」 | 擋住的是四步語意：schema 沒有「呼叫順序」那一步（Phase E 起沿用） |

（分歧之廳這一期**沒有新增任何 backlog**：§三 指定的九種題型全部照做，序列一字未偏。）

## 課程 v2 · Phase J2（12 座應用關 ＋ 土地印記 ＋ 大師層印記 · 2026-08-02）

### 我造成的一次資料損失（誠實記錄，最重要的一條）

**我用 `git checkout -- scripts/headless-check.mjs` 想「還原一次寫壞的插入」，
結果把 Phase J1 尚未 commit 的 e2e 段落（約 678 行、約 160 項斷言）一起丟掉了。**
根因有兩層：

- 直接原因：我用 `s[:start] + clean + s[end:]` 修補檔案時，`end` 那個錨點字串
  （`setMode('free')`）在檔案**前面**也出現過，`str.index()` 拿到的是更早的位置，
  於是 `end < start`，整段被複製了一份（檔案從 13,274 行變成 22,737 行）。
- 真正的原因：**這個 repo 的 Phase J1 整期都還沒 commit**，而我把 `git checkout --`
  當成「還原我剛剛那一次編輯」用 —— 它還原的是 **HEAD**，不是上一步。

**教訓（寫成規則）**：
1. 動任何檔案之前先 `cp` 一份到 scratchpad；`git checkout --` 只有在確定
   「這個檔案自 HEAD 以來沒有別人的未提交改動」時才可以用。
2. 用字串索引改檔案時**一律先斷言 `start < end`**，或改用「唯一錨點 ＋ 一次 replace」。
3. 長跑專案每一期結束就 commit —— 未提交的成果沒有任何安全網。

**善後**：我依 `progress.md` / `findings.md` 對 Phase J1 的描述，
把分歧之廳與拆碑那一段 e2e **重寫**了一份（硬門檻的十條、地標零光源、
9＋1 座石座、拆碑的資料契約與貼錯不前進、模型卡的官方出處、Esc 拆回來）。
**它不是逐字還原**：拆碑的完整鍵盤走查（貼 → Esc → 再貼 → 刻印 → 手印 → S）
現在只驗到「貼錯不會被刻上去」與「全部貼對就開放刻印」，
少掉的是那一段真的按鍵盤走到手印的流程。這一段值得在 J3 補回來。

### 踩到的坑

- **應用關把「N 座教學神廟」這種斷言全面打破。** 12 座試煉住在既有的 12 個區域裡，
  於是 `challenges.filter(c => c.region === X).length` 這種寫法一次多出 1。
  作法是在 `test-rubric` / `playtest-verify` / `headless-check` 三份腳本裡各建一個
  `shrines = challenges.filter(c => !c.application)`，並把「每一關都接上了 v2 技能」
  「一條主檢查 ＋ 一條地基」「題型序列」這幾類斷言全部改成只對 `shrines` 成立。
  `expected-counts.json` 的 `foundationsShrines` 15 → **14**、`groundingShrines` 13 → **12**
  （這兩格從此只算教學神廟），新增 `applicationTrials: 12`。
- **`c.rubric.find(r => r.primary).check` 在四個地方會當場爆炸。** 應用關沒有主檢查，
  改碑 / 點碑 / 合尺 / 量器坊那幾節都直接 `.check` 取值。全部改成先取 row 再判空。
- **自由書寫的試煉沒有流程資料 → `console.open()` 直接丟例外。**
  `currentFlow.slots` 這一串在 Phase J2 之前永遠不會是 null（每一關都有流程）。
  修法是在 `open()` 裡取一次 `const f = currentFlow || {}`，所有石碑一律載入空的。
  **這是 e2e 第一輪抓到的真 bug，不是測試寫錯。**
- **合尺（constraint）需要一把「非單調」的尺，不然「全部挑上去」永遠合尺。**
  playtest 有一條既有門檻：`全部挑上去一定有一把尺暗掉`。
  兩座 constraint 試煉的三條候選（`hasFewShot`／`hasStepByStep`／`mentionsParameters`
  與 `specifiesFormat`／`saysWhatToPreserve`／`hasFallbackCategory`）**全部是單調的**——
  加東西只會加分。實測沒有任何干擾片能讓它們掉下來。
  **裁決**：這兩座各多掛一列 `avoidsPressureLanguage`（0.5 分、標成地基、不是候選），
  尺上因此有一把是非單調的（「這件事很急！！！」那一片會把它打暗）。
  這樣尺與 rubric 仍然一一對應（畫面上不會有「亮了卻不算分」的尺）。
- **`staticBeforeVariable` 會因為一個逗號誤判成「自打嘴巴」。**
  `今天的日期…放在最後面，開頭那一段之後不要再改動。` 這一句裡，
  `VARIABLE_FIRST_ZH` 的 `[^\n]{0,4}` 剛好跨過「最後面，」四個字接到「開頭」，
  整條歸零。**沒有改檢查器**（那是 130 關共用的判準），改成把兩句拆到**兩行**
  （換行是 `[^\n]` 跨不過去的邊界）—— 既有的 `stacking-order-102` 本來就是這樣寫的。
- **`saysWhatToPreserve` 會數必留清單的長度。** 列 5 樣＝「幾乎等於沒縮」只給 0.75。
  必留清單要住在**自己的子句**裡（`CLAUSE_SPLIT` 是 `[\n。；;]`），而且只列兩三樣。
- **`hasDelimiters` 與 `usesRareDelimiter` 不是同一件事。**
  `<外部來信>` 只點得亮 rare 那一條；`hasDelimiters` 要的是 `【資料】…【/資料】`
  或 `---` 或 `###` 章節。護欄崗的試煉因此寫成
  `### 指令 / ### 資料 ＋ <外部來信>…</外部來信>` —— 兩條都滿分，而且那正是
  「指令與資料分兩個通道」本來就該長的樣子。
- **`len-preserve` 不住在減法之庭。** curriculum-v2 §5.2 給減法之庭的組合是
  `lean-prompt ＋ len-preserve ＋ cache-static-first`，但 `len-preserve` 的神廟
  在 Phase E 就被搬到量器坊了 —— 而「候選列的技能必須屬於這一片土地」是硬規則。
  **裁決**：換成同一區的 `ctx-pruning`（`asksToCompact`），設計意圖（先砍再留）不變。
  這是本期**唯一一處偏離 §5.2 的組合**。
- **`skeleton-ptcf` 與 `role-basics` 的主檢查都是 `hasRole`。** 角色與參數的試煉
  照 §5.2 要同時要求這兩條，但同一把尺不能量兩次。
  **裁決**：`skeleton-ptcf` 這一列改用 `specifiesFormat`（PTCF 的 F），
  `role-basics` 保留 `hasRole`。這是第二處偏離（換的是檢查器不是技能）。
- **字型是硬牆，而且這一次真的撞到了。** 新內容帶進 11 個新漢字，總量
  1,505,056 bytes > 1,500,000 的上限。**改的是用字不是預算**：
  歷史→先前的、南堤→南岸、通宵→整夜、靠泊→停靠、監督→總管、研議→商議、
  融掉→熔掉、封蠟→封印、謹此→在此、熱鬧→熱絡、頒→給（程式註解）。
  回到 **1,463.4 KB**。每個新漢字約 0.5 KB × 2 套 CJK 字型。
- **世界擠不下第 143 座石座 —— 護欄崗是最極端的那一片。**
  它半徑 26，而地標「不會關上的門」就站在正中央、淨空 13 公尺；
  「石座離地標 ≥ 18 公尺」這條全域規則把整個內圈排除掉，
  **半徑 26 時一個落得下第六座石座的點都沒有**（掃描器實測 0 個）。
  放大半徑（27 / 28 / 30 都試過）也排不出六座，而且 28 以上會讓母土地的
  「引文閱覽台」被新長出來的道具擦到（e2e 之前就是這樣紅的）。
  **裁決**：把**地標讓到邊緣**（(101,-142) → (92.5,-153.5)），中心往東移到
  (108,-143)、半徑 27、內圈 20 —— 這才空得出六座（實測最小間距 14.53 公尺）。
  這是本期對世界唯一一處結構性改動；其餘 11 區只動座標。

### 裁決

- **應用關的 rubric 是 runtime 組出來的，公式只有一條。**
  `src/challenges/trial.js` 是唯一真相：`resolveTrial()` 篩選 ＋ `trialPass()` 重算。
  資料層存的 `pass` 是「全部候選都入選」時的值（給檔案層的測試看），
  runtime 一律重算 —— 兩邊用的是同一支函式，不可能分岔。
  公式：`pass = max(2, round(入選權重總和 × 0.5 × 2) / 2)`。
- **絕不軟鎖，而且誠實。** 已學的候選 < 2 條時照 `order` 補到 2 條，
  並在對照表底下明講「其中 N 條你還沒學過」。
  四種情境（0 / 1 / 2 / 全部學過）在 rubric 與 playtest 兩層都逐條驗過。
- **大師層的作弊面只有一個，就是「範例」。** 快速填入與提示球是「這一次」的狀態
  （關掉重開就重來），那沒關係 —— 因為重來的那一次仍然要一次到位。
  但**範例是答案卷**：看過就寫進 `samplesSeen[]` 永久記著，
  關掉重開再拿 S 也不算。技巧積木也算「用了輔助」（它與快速填入同一族）。
  判定全部寫在 `progression.js` 的 `masterSealFor()`，
  **沒給判定材料時一律不發**（舊呼叫端、測試腳本 → 寧可漏發不可誤發）。
- **試煉不發大師層印記。** 它本來就是「把學過的用出來」，再頒一次無筆之印沒有意義。
- **既有 finale 一格都沒動。** 四廠徽章、每廠 5 個標記、68→130 全收集的條件全部原樣；
  rubric 測試另外靜態掃描 `progression.js`，確認 `seals` / `penlessSeals`
  沒有出現在任何解鎖判定裡。

### 未做，而且是刻意的

- **D2 的 legacy teaching/collection bridge 還在**（拆掉它是 J3 的事）。
- **`backlog` 與 README、R4 驗收**屬 J3。
- **拆碑的完整鍵盤走查**（見上面的資料損失）還沒補回來。

## 課程 v2 · Phase J3（拆掉 D2 相容層 ＋ R4 release checkpoint · 2026-08-02）

### D2 拆除的裁決與實際範圍

- **「拆相容層」拆的是教學語意，不是收集語意。** D2 當初的問題是 `teaches` 一個欄位同時
  控制「這一關教什麼」「官方出處掛哪一條」「通關收哪幾條」四件事。J3 之後三個欄位語意互不重疊
  （寫進 WORLD.md §5.3b）：`primarySkillId` ＝ 教學的正典、`teaches` ＝ 只剩收集、
  `primaryTechniqueId` ＝ 這條技能的祖先（時代註記與收集的可追溯性）。
  **收集面一個位元組都沒動** —— 68 條技巧仍然每一條都收得到，四廠徽章與隱藏成就的條件一格未改。
- **最後兩座接上技能之後，C1 會自己逼你收斂。** 補上 `primarySkillId` 的那一刻，
  既有的 invariant（「rubric 上沒有既不是主檢查也不是地基的雜項」）立刻對這兩座生效 ——
  也就是說 D2 的拆除**不可能只加一個欄位**，它必然連帶把 manifest 早就裁決好的 post-A 移除做完：
  - `gate-of-clarity-01`：移除 `hasAudience`（主題在六面燈籠）與 `specifiesFormat`
    （主題在量器坊 `fmt-specify`），主檢查 `hasConstraint` 2 → 3、pass 2.5 → 2、第三幕由 4 段收成 3 段。
  - `lost-automaton-03`：移除 `explainsWhy`（主題是 `context-why`，有自己的神廟），
    主檢查 `positiveFraming` 維持 3、pass 2.5 → 2。
  manifest 的兩列 post-A 條目改標成 `phase: "J"` 並各補一個 `phaseJ` 區塊逐欄記錄；
  `specifiesFormat` 那一條是 Phase 0 的產生器沒掃到的（它被記成 `foundationCheck`），
  照 Phase D 的前例以 `addedIn: "J"` 補進去並寫明理由。
- **`source` 必須跟著教學走。** 既有測試要求「`source` 是它所教技能的官方出處（回查
  `skill-codex-v2.json`）」，所以兩座的 `source` 從 curriculum 的 OpenAI Best practices
  換成該技能自己的官方文件：清晰之門 → Microsoft · Prompt engineering techniques（Best practices）、
  迷路的自動機 → Anthropic · Prompting best practices（Control the format of responses）。
  兩個網址在本期的來源抽查裡都是 200。
- **`clear-specific` 的出處順序調過。** `sourceForSkill()` 顯示的是 `sources[0]`，
  而那一條原本是 xAI 的 Code Execution Tool（Best Practices）—— 對「具體到可以驗收」
  這一課來說，它可追溯但**不好讀**（玩家點過去會落在一個講程式碼執行的頁面）。
  把 Microsoft 那一筆排到第一位（四筆全部保留、全部仍逐條回查 master list #13／#21）。
  這是**編輯順序**的調整，不是新增或改寫出處。
- **`sourceForSkill()` 的 `name` 補上廠商前綴。** 拆掉相容層之後 130 座神廟的原典全部走這一支，
  而它原本只回 `docName`，畫面上會變成一個沒頭沒尾的文件名。改成
  `Anthropic · Prompting best practices` —— 與 `curriculum.json` 的出處寫法一模一樣。

### `knowsSkill()` 的處置（兩條路我選了「a ＋ 純加法遷移」）

任務給的兩條路是 (a) 留著 fallback 並正名、(b) 由 `bestGrades × primarySkillId` 回填 `skillsV2`
再收窄 fallback。**我兩件事都做了，但沒有收窄 fallback**，理由是收窄會真的讓人倒退：

- 舊的 68 條技巧可以由**多座**關卡的 legacy `teaches` 收到。
  例：`clarity-03` 同時出現在清晰之門與郵箱精靈的 `teaches` 裡 ——
  只通關過郵箱精靈的人，今天靠 fallback 是「會 `clear-specific`」的；
  只做回填（他沒通關清晰之門）補不到那一條，收窄 fallback 就會讓他的知識式軟門檻**後退**（違反護欄 7）。
- 所以：**回填照做**（開機時把「已通關 × `primarySkillId`」補進 `skillsV2`，純加法、冪等、
  只補真的通關過的、補完立刻寫回 localStorage），**fallback 留著並正名為「收集誠實層」**
  （程式碼註解與 WORLD.md §5.3b 都改了說法：它保證的是不倒退，不是教學的退路）。
- 測試守兩邊：舊存檔載入後 `knowsSkill` 仍為 true ＋ 回填確實發生 ＋ 只收過祖先技巧
  （沒通關那一座）照樣算「會了」而且**不會偽造 `skillsV2`**。

### e2e 的失敗真因（J2 記的那 9 條）

J2 最後一輪的 9 條失敗全部指向同一個動作：**Phase 23「純鍵盤走完一圈」那一段的手掌印沒按下去**
（其餘 8 條是它的連帶：結果面板、評價、通關、分享）。查下來不是回歸，是測試自己的寫法：

```
keyDown('Enter')  →  await sleep(900)  →  keyUp('Enter')
```

`PALM_HOLD_MS` 是 600 毫秒，而 `sleep(900)` 量的是**測試主機**的牆鐘。
這台是 SwiftShader 軟體渲染（每幀約 200 ms），CDP 送進去的 `keyDown` 可能晚好幾百毫秒
才被頁面的事件迴圈處理 —— 於是「按住 900 ms」在頁面看來只有 300 ms，手掌就滑掉了。
同一支手掌在同一輪的其他段落會過，只是因為那些段落剛好排在負載比較低的時候。

**根治（AGENTS.md 的建議做法）**：新增 `holdPalm()` 一支共用零件 ——
按下去 → **輪詢 `.palm.is-fired`** → 才放開，鍵盤與滑鼠兩條路都走它。
全套 11 處手掌印（純鍵盤、排序刻印、神諭工坊、改碑、點碑、量器坊、契約鍛冶場、
兩輪刻印、轉鈕、觀象臺、改碑鍵盤版）的固定 sleep 一次清乾淨。

### 補回 J2 弄丟的 e2e 覆蓋

依 `progress.md` / `findings.md` 的 J1 描述重寫了**拆碑（`reverse`）的完整鍵盤走查**
（J2 誤用 `git checkout --` 刪掉的就是這一段）：
開關卡 → 第三幕（焦點自己落在名牌上、誘餌真的存在）→ 方向鍵 roving →
數字鍵貼錯（碑不收 ＋ 就地教學 ＋ `aria-live` ＋ 不扣分不前進不跳失敗面板）→
貼對一塊 → **`Esc` 把它拆回來**（面板不會被順手收掉）→ 一塊一塊真的按鍵盤貼完 →
焦點自己落到刻印 → 數字鍵刻滿（刻出來的字＝`sample`）→ 第四幕 → 按住 `Enter`（輪詢）→
S ＋ 石座轉已通關 ＋ 技能入袋 ＋ 寫進 localStorage ＋ 結果面板掛得出官方出處。
J1 其他被刪的斷言（硬門檻十條、地標零光源、模型卡的官方出處、石座數）在 J2 已經重寫過，逐條核對後沒有缺口。

### backlog 的最終狀態（逐條）

| 項目 | §3 指定 | 目前 | 最終狀態 | 理由 |
|---|---|---|---|---|
| 鑄模房 `so-basics` | `workshop` | `choice` | **won't do** | 擋住的是 `workshop` 的**四步語意**（挑工具 → 填參數 → 排呼叫順序 → 立規矩）：schema 沒有「呼叫順序」那一步，硬套會把欄位教成有先後。做「三步版 workshop」等於新開一套 stage contract（焦點、鍵盤、文字組裝、e2e）只為了一座神廟，成本遠大於收益；現行 `choice` 的第二段本身就是那個模子，`definesSchema` 滿分。 |
| 量繩之桌 `clear-constraint` | `constraint` | `fix` | **won't do** | `constraint` 從 Phase D 起就實作好了，所以這是**純資料**工作、任何時候都做得了；但在 release gate 前換一份沒玩測過的第三幕資料，風險大於收益。現行 `fix`（把「短一點」換成有單位的規格）已經達成教學目標，且量器坊那一區已經有兩座 `constraint`。 |
| 零件表 `struct-anatomy` | `reverse` | `spot` | **won't do** | 同上。`reverse` 在 J1 上線了，但 findings 早就記過「用 spot 幾乎等價」（替每個零件貼名字 vs 找出哪幾塊其實是同一個零件），換裝的教學增益很小。 |
| 一字之差的岔路 `word-choice` | `tradeoff` | `tradeoff` | ✅ 完成 | Phase C |
| 舊標籤的倉庫 `struct-xml` | `tradeoff` | `tradeoff` | ✅ 完成 | Phase C |
| 三口井 `three-wells` | `workshop` | `choice` | ✅ 已裁決 | Phase C：依內容本質改用 choice，不是 backlog |
| 給沒看過的人／取水之後的停頓 | `multi` | `multi` | ✅ 完成 | Phase G |
| 火力熔爐／刻度儀之室／沙漏工房 | `sim` | `sim` | ✅ 完成 | Phase H |
| 空手的信使 `context-supply` | `disclose` 🔴 | `fix` | **選配未實作**（見下） | Phase K |

### Phase K（`disclose` 拾遺）的正式決策：選配，不實作

依 `task_plan.md` §0「14 種型式中 K 期 `disclose` 為選配；未做時必須明確標成選配未實作」——
**Promptasy 課程 v2 不實作 `disclose`。** 理由逐條：

1. **它是唯一一種會把「關卡」與「世界探索」綁在一起的題型。** 素材背包 ＋ 世界拾取點意味著
   「你必須先走到某個地方撿到某個東西，才解得開這一關」——那會把目前「任何一關隨時開得起來」
   的契約打破，而那個契約是鍵盤可玩性、e2e、以及「先行前往」全部建立在上面的。
2. **它要新增一個會影響可玩性的存檔欄位。** 背包裡有什麼會決定關卡打不打得開，
   等於第一次出現「存檔壞掉 → 關卡開不起來」的路徑。既有的新欄位全部是純加法且**不影響解鎖**。
3. **行動裝置的債還沒還完。** 世界的觸控移動（虛擬搖桿）在 Phase D 就明確不做；
   沒有觸控移動的話，`disclose` 在手機上等於不可玩。
4. **它不影響 130 條技能的完成度。** `context-supply` 已經有自己的神廟（空手的信使，`fix`），
   教的是同一件事：把「你自己去查」換成真的把資料放進來。

要改變這個決定的條件寫在這裡：**先有世界的觸控移動，再談 `disclose`。**

### 未做，而且是刻意的

- **截圖沒有重拍**（`docs/media/` 的六張是 2026-07-31 拍的，那時是 5 區 27 關）。
  README 已在圖片區塊上方**誠實標註**擷取時間與它落後於現況這件事。重拍需要重新種存檔取景，
  屬於獨立的一次工作。
- **三筆 kind-swap（鑄模房／量繩之桌／零件表）維持現狀**，理由見上表。
- **`bgm_divergence.m4a` 等六個新區的配樂音檔仍未錄製**（全部誠實登記在 `SYNTH_ONLY_REGIONS`）。
- 未 commit／push；未動 `CLAUDE.md`、`task_plan.md`、`vite.config.js`、port 5175、
  `src/data/curriculum.json`（sha256 仍綠）。

---

## Phase 35（2026-08-03）：手掌印加寬 ＋ 術語小卡

### 1. 字型預算已經在 99.9% —— 這是下一個會被踩到的地雷

`test:rubric` 的硬上限是 `fontBytes < 1_500_000`。Phase 35 之前的實際值是 **1,499,xxx**，
也就是**只剩不到 1 KB 的餘裕**。glossary.json 的新中文（含我自己寫的四個註解漢字）
把 CJK 語料從 1844 推到 1848 字，總量變成 **1,501,184**，當場紅燈。

處理方式**沒有調高上限**（那等於默默把載入體感的預算讓掉），改成找出「只因為這次改動
才出現的漢字」再換掉：一支小腳本比對 `git show HEAD:<file>` 與工作區的 CJK 集合，
答案只有四個字（`妝` `瑣` `慘` `裸`），全部改寫成既有字，語料回到 1844。

**給後續的人**：一個 CJK 字在兩套 TC 子集裡大約值 **630 bytes**。
換句話說，**現在只要新增 2 個新漢字就會爆預算**。真正的解法有三條，擇一：
1. 把 `CORPUS_FILES` 從「掃整個檔案」收斂成「只掃字串字面值」（可省 10–15%，
   但會失去「絕不漏字」的保證 —— CLAUDE.md Phase 6 就記過這個取捨）；
2. CJK 子集改用 woff2 的 `subset-glyf` 之外的壓縮策略 / 換一套更小的思源變體；
3. 誠實把上限調到 1.6 MB 並在 README 更新載入體感的數字。
在那之前，**任何新增中文的 phase 都要準備好「換字」這一步**。

### 2. 「讀得到但不擋路」的層要怎麼交代鍵盤鐵則

WORLD.md §3.1 的鐵則是「整趟旅程不碰滑鼠也走得完」。術語小卡是第一個**刻意不給鍵盤路徑**
的互動層，理由與判準已經寫進 WORLD.md §3.7，摘要：

- 一段情境會有 3–6 個標記，全部 `tabindex="0"` 會讓 `createOverlay` 的
  「開一層 → 焦點落在內容區第一個可按的東西」（Phase 23）落在一個**術語標記**上，
  而不是「聆聽指引 →」。那是玩家每一關都要走的路，不能為了彩蛋讓它變慢。
- 可以這樣取捨的**前提**是：這一層沒有任何進度依賴它。同一個名詞在圖鑑裡有完整的
  中文說明與官方出處，那條路純鍵盤走得到。

判準寫成一句話收進 §3.7：**「沒有它，純鍵盤的人是不是仍然什麼都不缺？」**
答案是「會缺」就不准犧牲 Tab 順序。

### 3. e2e：`.reveal` 入場動畫會讓「先量好的座標」過期

新寫的 hover 斷言第一輪紅燈。用 `document.elementsFromPoint()` 追出來的真因是：
第一幕的 `.mission` 帶 `.reveal .d2` 入場動畫，**量完座標到送出 `Input.dispatchMouseEvent`
之間元素還在移動**（實測 y 差 34px），滑鼠落在 `.mission` 的 div 上而不是 `.gloss` 上。

這是 AGENTS.md 記的「動畫時序類」家族的一個新變體 —— 不是 sleep 不夠久，是**座標本身會過期**。
修法一樣：**輪詢式**（每一輪重新量 → 重新送滑鼠 → 檢查結果），不要「量一次、送一次、睡一下」。

### 4. `src/ui/*.js` 不可以直接 `import xxx.json`

第一版把 `glossary.json` 直接 import 進 `src/ui/glossary.js`，Vite 建置沒事，
但 `test:rubric` 直接爆 `ERR_IMPORT_ATTRIBUTE_MISSING` —— 因為 rubric 會用 node 原生
import 拉 `src/prompt/console.js`，而 node 需要 `with { type: 'json' }`。

專案原本的慣例（所有 JSON 都由 `main.js` 帶進來）**不是風格偏好，是測試可跑性的硬約束**。
現在 `glossary.js` 匯出 `createGlossary(file)` ＋ 一個 `glossary.install(file)` 的單例包裝，
`main.js` 開機呼叫一次；沒裝資料時 `annotate()` 安靜地回 0（離線降級，不丟例外）。

### 5. 未做／刻意留下

- **術語標記沒有鍵盤入口**（見上，決策已入 WORLD.md §3.7）。
- **小卡在觸控裝置上是「點一下開、點別處關」**，沒有做長按；也沒有做「捲動時跟著那個字走」
  （捲動一律收起來 —— 追著跑比收起來更容易做錯）。
- **glossary 只掛在四個面向**（第一幕 / 第二幕 / 提示框 / 圖鑑）。刻文小語、器物、
  結果面板、設定頁**刻意沒接** —— 那些地方的文字本來就短，畫線只會變雜訊。
- 未 commit／push；未動 `CLAUDE.md`、`vite.config.js`、port 5175、`src/data/curriculum.json`。

### 6. e2e 的新斷言第一輪抓到的是**自己的前提**，不是產品

Phase 35 的「十一種題型的手掌印都量得到」第一輪紅了 4 條（11 種全部 `measurable: false`）。
單獨跑同一段程式碼卻全綠 —— 差別在**前一段**：`應用關與印記（Phase J2）` 那一節
呼叫了 `g.promptConsole.setMode('free')`，而 `setMode()` **會寫進設定**。
手掌印只存在於引導式（石碑刻印那一家），所以我的量測整段落在自由書寫的書寫檯上，
一隻手掌都沒有。

兩件事值得記下來：

1. **「量不到」必須是紅的，不能是空過。** 這一節一開始就寫了
   `eq(palmMissing.length, 0, '每一種題型都有一隻量得到的手掌印（不會空過）')` 這道守門，
   所以它是**紅燈**而不是「跑完全綠但其實什麼都沒量」。
   （CLAUDE.md 早就記過一次「在錯誤的幕次量到 0×0 而全部空過」——這道守門就是為了那件事。）
2. **e2e 是一條長狀態鏈。** 任何新的段落都要問「前一段把什麼留下來了」。
   修法是在量測前明確 `setMode('guided')` 並斷言 `modeAtStart === 'guided'`，
   同時把固定 sleep 換成輪詢（最多 20 次 × 150ms），失敗時回報
   `act / mode / ovHidden / dataAct / wraps` 讓下一個人不用再猜。

## 2026-08-03 — 出處深連結稽核的發現

- **既有的 anchor 會腐爛，而且沒有人在看**：9 條原本就寫了 anchor 的出處，那個 id
  在現在的頁面上**已經不存在**（Anthropic 文件把 `&` 的 slug 從 `--` 改成 `-and-`、
  `#latex-output` → `#la-te-x-output`、`hardcoding` → `hard-coding`）。
  離線測試看不出來（格式合法），只有實地抓頁面才驗得出。
  → 建議把「重抓 114 份文件、重驗每一個片段」做成一年一次的例行稽核，
  方法已寫進 `docs/design/source-anchor-audit.md`。
- **`ai.google.dev` 對非瀏覽器會掉進自動登入迴圈**（302 → `oauth2authorize`，body 空的）。
  帶一個 cookie jar（`curl -c/-b`）就正常回 200 —— 之前的擷取如果沒帶，很可能整批 Google
  文件都是空的。20 份頁面靠這一招才拿到。
- **`developer.meta.com` 對 `curl` 一律 400**（要 JS），但 headless Chrome `--dump-dom`
  拿得到完整 DOM，章節 id 齊全。之前 promptbooks 記的「抓不到」其實有解。
- **同一個網址在不同引用列指的是不同章節**。`claude-prompting-best-practices` 被 33 個
  顯示位置引用、`gpt4-1_prompting_guide` 被 45 個 —— 所以深連結必須**逐列**解析，
  「一個 URL 一個 anchor」的疊加設計會把不同技巧指到同一節。
  最後疊加層用 `(techniqueId, url)` 當鍵。
- **`docName` 括號裡的章節名是最好的搜尋針**：117 列的出處自己就寫了
  「Prompting best practices（Be clear and direct）」這種形狀，直接對得上頁面標題。
  這是 master list 當初的紀律留下來的紅利。
- **框架元件會冒充章節**：第一版解析器挑到 `#breadcrumb`（Google devsite 的麵包屑）、
  `#folders-and-files`（GitHub repo 頁的框架標題）、`#ms--in-this-article`（Microsoft 的 TOC）。
  加了一份「這些 id 不是章節」的封鎖清單才乾淨。
- **GitHub README 的 anchor 有兩種寫法**：元素上的 id 是 `user-content-x`，
  但真正跳得到的目標是 `href="#x"`；而且錨點掛在標題**後面**，
  往後看是空的、要往前一行才找得到標題文字。
- **搜尋針不能是文件自己的名字**：master 條目裡的 `llama-prompt-ops` 是 repo 名，
  它出現在頁面上的任何地方，據此挑出來的章節（`#step-1-installation`）沒有意義。
- **Text Fragments 要用頁面上的原字**：比對時可以把彎引號／破折號正規化，
  但寫進網址的片段必須是頁面上的literal 文字，否則瀏覽器比不到（`don’t` vs `don't`）。
- **片段裡的非 ASCII 會撞到字型預算**：阿里雲文件有 `#prompt-评测` 這種中文 id，
  直接寫進 JSON 會把兩個簡體字帶進 CJK 語料，而 Noto Serif/Sans TC 沒有這兩個字 →
  字型測試紅。改成 percent-encode（等價寫法）就解決了。
  這也再次證明 `docs/` 不進語料、`src/data/` 進語料這條界線很敏感。
- **114 份文件裡，SPA 分頁式渲染仍抓不到內容**：`docs.mistral.ai/.../sampling`（分頁）
  與 Qwen 模型卡的 Best Practices 區塊（JS 展開）—— 這兩處的時代註記只好停在頁面層。
- **「頁面層引用」本來就存在**：116 列停在頁面層裡有 98 列是出處本身就沒指名章節
  （例如「OpenAI · Function calling」整份文件）。這不是漏做，是引用的顆粒度就是一整份文件；
  硬加 anchor 才是杜撰。

## 2026-08-03 — issue #3 音訊交付的發現

- **一次性音效不能用 LUFS 正規化到跟配樂床同一個系統**。這是這一期最重要的發現：
  EBU 的 short-term 是 3 秒視窗，對 0.25 秒的敲擊來說視窗裡幾乎都是靜音 →
  量出來比實際低 9–11 dB（sim 轉鈕 S-max −45 vs momentary −36 vs integrated −36），
  照 `gain = target − measured` 算會需要 +18 dB，把 −12 dBFS 的峰值推到 **+6 dBFS**。
  momentary（400 ms）好一點但一樣會削波。結論：**瞬態的響度與峰值是兩件事**，
  一次性音效要用「它自己內容的 integrated LUFS ＋ 峰值天花板」，
  而且天花板會在很短的素材上綁定（四支頂到了）。這也解釋了為什麼音效交付一律做峰值正規化而不是響度正規化。
- **v1 的手調混音其實已經是一個一致的系統**。把每一支的 integrated LUFS 加上已上線的 gain
  反推「相對頭條事件低幾 dB」，得到的 trim 從 +1（祭壇）到 −18.5（按鍵音）連續分佈，
  沒有一支是離群值。所以這次校準用的是「反推 trim → 用公式重算 gain」，
  逐檔誤差 < 3%（≈ 0.24 dB）—— 混音沒有被改掉，只是換成算得出來的數字。
  這個手法值得推廣：**把耳朵調出來的東西反推成公式，再讓公式接管**，比重新調一次安全得多。
- **ffmpeg 的 ebur128 per-frame 需要 `-loglevel verbose`**，而且短於 3 秒的檔案
  **完全不會輸出任何 S 值**（short-term 要 3 秒的歷史）。要拿 S 得先 `apad` 補靜音，
  但補完之後量到的就是「3 秒視窗裡的能量」，對一次性音效不是想要的東西（見上一條）。
- **AAC 編碼會讓 true peak 跑掉**：`sfx_seal_sparkle` 的 wav 峰值 −12.1 dBFS，
  編成 m4a 之後量到 −5.8 dBFS（intersample peak）。所以**峰值天花板一定要量編碼後的檔案**，
  拿原始 wav 的數字算會低估 6 dB。整個響度表的量測對象因此一律是 `public/audio/` 裡的 m4a。
- **v1 六首配樂實測 −20.0 / −20.1 LUFS**，完全符合交接文件說的「烘在 −20」——
  這種宣稱值得花 30 秒驗一次，驗到了就可以放心讓 gain = 1.0。
- **節流的共用時戳是一個潛伏的 bug**：原本 `lastClickAt` 是一個變數給所有有 `throttle` 的
  cue 共用。v1 只有 `click` 一支有 throttle 所以看不出來；這一期加了六支之後，
  敲一下鍛打就會讓刻印牌的按鍵音在 70 ms 內變啞。改成 `Map` 逐 cue 各自算。
- **交付清單的 `recommended_gain_db` 是相對值，不是絕對值**（清單自己寫了
  「相對 BGM 的建議衰減量」）。直接當 gain 用會整組太小聲；當成「相對頭條事件的 trim」
  （以最大的 −4 為 0 重新對齊）才用得上，而且對得起音效設計者的意圖
  （鑼最響、微光層比章低 8 dB、轉鈕與量測音最克制）。
- **`SYNTH_ONLY_REGIONS` 這個設計真的只要改一行**。Phase E 寫下「音檔補上時只要在
  `BGM_TRACKS` 加一行、把 id 從這裡移走」的承諾，這一期六個區域一次驗證了它 ——
  播放、交叉淡入、預抓、debug、備援一行邏輯都沒有改。**誠實登記缺口**（而不是借別區的來墊）
  除了不騙玩家，還讓補上的那一天變成純資料改動。
- **測試裡的固定數字要分兩種**：`EXPECT.synthOnlyRegions` 那種「契約檔」改一個地方就全綠，
  但散在各 Phase 段落裡的 `ok(SYNTH_ONLY_REGIONS.includes('forms'), …)` 有 13 條要逐條翻面。
  差別在於前者是**單一真相**、後者是**當期快照**。當期快照本身沒有錯（它記錄了那一期的誠實狀態），
  但翻面時要改成「現在有了 ＋ 備援仍在」而不是直接刪掉 —— 刪掉就失去了「合成備援沒被拆」的保護。

### 2026-08-03（續）— 音效床從 −18 收到 −19、同時發聲數，以及循環點的那個洞

- **「比配樂高幾 LU」是站長的美術決定，不是工程可以自己挑的數字**。第一版把音效床放在
  −18 LUFS（高 2 LU）；站長與音效設計者的交代其實是「整體音量差不多，音效跳出來一點點即可」
  ＋「寧可太小聲不要太大聲」。改成 **−19**（高 1 LU）之後，整組音效低 1 dB，
  **相對平衡完全沒有變**（trim 是從上線中的混音反推的），而且**削波的壓力也一起變小**：
  原本四支頂到 −3 dBFS 天花板，現在剩三支（第二顆鍛打退回公式值）。
  結論：把「床的高度」做成一個常數（`SFX_TARGET_LUFS`），調整就是改一個數字 ＋ 重算一張表。
- **同時發聲數（polyphony）跟節流是兩件事**。節流管的是「多快可以再響一次」，
  polyphony 管的是「已經在響的那幾把怎麼辦」。轉鈕的卡榫是 1：轉快了應該是**換一下**
  而不是兩下疊在一起；鍛打是 3：連打要疊得起來才像手工。
  實作上要注意**掐掉最舊的、留下最新的**（而不是拒絕新的那一下）—— 玩家剛做的動作
  一定要聽得見；掐的時候要 12 ms 淡出，直接 `stop()` 會有 click。
- **交付清單的數字要能追溯回去**。`trim = recommended_gain_db + 4`、
  `throttle = cooldown_ms / 1000`、`poly = polyphony` 這三條關係寫成測試之後，
  以後誰調了其中一個，就必須回頭確認自己是不是在推翻音效設計者的交代（而不是靜靜地漂走）。
- **循環點有一個洞（既有行為，不是這次的回歸）**：配樂的自我交叉淡入是「整段播完、
  尾巴疊回頭」，但六首 v2（以及 v1）的素材本來就是**頭尾各自淡入淡出的 raw**——
  實測 `bgm_forms` 前 6 秒由 −75 爬到 −15 dB RMS、最後 2 秒掉到 −55 dB。
  兩邊都在淡的那 2.5 秒疊起來，等於每 3 分鐘有一段 4–6 秒、深約 10–15 dB 的凹陷。
  交付 README 自己給了解法：**取中段做環**（重播時跳過淡入的頭、在淡出的尾巴開始之前就接）。
  這次刻意沒動（架構不變是本期的邊界，而且 v1 一直是這個行為），
  但值得排一次：`BGM_TRACKS` 加 `head` / `tail` 兩個秒數，`startSegment()` 用
  `offset = head`、把接點提前到 `duration - tail - xf` 即可。

---

## 2026-08-03 — ⓘ「自己彈出來」的真兇是瀏覽器的 hover 重算

- **`mouseover` 不等於「使用者把滑鼠移過來」**。瀏覽器在版面變動（換幕、面板開合、
  內容重繪）之後會重算「游標底下是誰」，並對**新出現在游標底下的元素補送一次
  `mouseover`**。游標可以一動也沒動。所以任何「`mouseover` → 打開某個東西」的
  寫法，在會換內容的面板裡都等於「有時候自己會開」。
  **`mousemove` 才是「真的移動」的訊號** —— 重算 hover 不補 `mousemove`。
  再加一層座標比對，連「捲動時補送的同座標 `mousemove`」也一起擋掉。
- **CSS 的 `:hover` 有一模一樣的毛病，而且更難察覺**（連 JS 都不用參與）。
  只要顯示條件裡有 `:hover`，那個元素就會在「長到停住的游標底下」時自己亮起來。
  要讓「只有真的 hover 才算」，顯示條件就得完全交給 JS 判定的類別（這裡是 `.is-open`），
  CSS 只留 `:focus-within`（focus 一定是明確的意圖，不會被重算出來）。
- **這種 bug 在 headless 裡「查不到」是因為量測前提錯了，不是因為它不存在**。
  前三輪探針全部回報「沒有自己彈出來」，真相是標題卡還蓋在最上面
  （`elementFromPoint` 回傳 `title__zh` 才露餡）—— 面板一直在別人底下，
  連真的 hover 都摸不到它。**先驗證「對照組會過」再相信「實驗組沒過」**：
  加一條「真的把游標移上去 → 一定要打開」的 sanity check，前三輪就不會白跑。
  另外 `.title__start` 是靠 `window` 上的 `pointerdown`／`keydown` 收手勢的，
  對它 `.click()` 沒有用 —— 要用 `title.dismiss()`。
- **「開一層時焦點落在第一個可按的東西上」這條規則需要一份排除名單**。
  註腳型的觸發器（ⓘ）只要拿到焦點就等於被打開了，於是「打開面板」變成
  「打開面板 ＋ 塞一張說明卡」。修法不是把 focus-to-open 拿掉（鍵盤使用者要它），
  而是**只在「挑第一顆」的時候排除它**（`initialFocusIn`），
  Tab 的焦點鎖仍然用完整的 `focusableIn`。這個分法之後每加一種「hover/focus 就展開」
  的小元件都適用。
- **`clip-path` 剪過的按鈕要「視覺小、可點大」，得靠 pseudo 的 inset**。
  按鈕本體維持命中範圍（22px），兩層石面 `inset: var(--infotip-inset)` 往內縮，
  露出來的才是那顆 13px 的小石頭。不能用 padding —— `::before { inset: 0 }`
  會連 padding 一起蓋掉，視覺又變回原尺寸。內層 `::after` 記得跟著縮
  （`calc(var(--infotip-inset) + 1px)`），不然那 1px 的假邊會變粗。
- **標頭壓成一條的三個關鍵**：(a) `.panel__headline` 要 `min-width: 0`，
  不然長標題會把整條撐開而不是自己截斷；(b) `flex-shrink` 分級（NPC 給 3、
  關卡名給 1）＝「位置不夠時先犧牲誰」寫成規則，不是靠斷點猜；
  (c) 窄畫面用 `order` ＋ `flex-basis: 100%` 讓**進度小牌**掉行，
  而不是讓整條 `flex-direction: column` —— 後者會把 Esc 也拖下去、佔更多高度。
  390px 再收一階：`headline` 自己 wrap，讓**關卡名完整、NPC 掉到它底下**
  （關卡名是玩家要認的東西，截斷成「清晰...」比多一行還糟）。
- **改版面高度會讓「留在原地的真實游標」壓到別的東西上**。標頭矮了 79px 之後，
  一條與本期毫無關係的斷言（「被拒絕的石籤不會再被滑鼠抬起來」）開始紅 ——
  因為前一段測試把游標留在某個座標上，內容上移之後那裡剛好變成一張石籤。
  這類斷言的正確寫法有兩層：(a) 量之前**先把游標挪走並輪詢到真的沒有東西還在
  `:hover`**（固定 sleep 在一幀 200ms 的機器上等於一幀都沒過）；
  (b) 有補間的屬性（這裡是 `translate 120ms`）一律輪詢到落定。
  順手把它補強成「**把游標真的壓上去，它一樣不抬**」—— 原本那條在游標不在上面時
  是可以空過的。
- **「字級不得小於 12px」這種無障礙下限要區分「內文」與「圖示」**。ⓘ 縮到 9.6px
  之後一次踩紅 16 條掃描。正確的分法不是放寬下限，而是把**圖示**排除在外：
  它的內容是一個字形、自己帶 `aria-label`、真正要讀的字在氣泡裡（遠大於 12px）。
  把圖示算進內文下限，只會逼著把註腳畫成跟正文一樣大。

## 2026-08-03 — 拖曳「卡片消失」的真兇是 `insertBefore` 會重播 CSS 動畫

- **`insertBefore` 一個已經在文件裡的節點 ＝ 先移除、再插入**，所以它身上的
  CSS 動畫會**整段重播**。`.slip__grip` 掛著 `animation: opt-in ... both`
  ＋ `animation-delay: var(--i) × 42ms`，於是每搬動一次，那一片就跳回
  `opacity: 0`、等完延遲再淡回來 —— 玩家看到的就是「拖到一半卡片不見了」。
  這條**不只影響拖曳**：鍵盤搬動走的是同一支 `render()`，一樣會閃。
  一般化的規則：**任何「只搬不重建」的清單，入場動畫都必須在入場結束後關掉**
  （這裡是 `.slips.is-settled { animation: none }`），
  否則「只搬不重建」在視覺上等於「重建」。
- **FLIP 與「跟著指標的那一片」會搶同一個 `transform`。**
  FLIP 靠 inline `transform` 把每一片拉回原位再放開；被拖的那一片位置卻是由指標
  （`--lift`）決定的 —— 兩者寫同一個屬性，後寫的贏，於是卡片會跳到一個
  跟手指無關的位置。**修法是把被拖的那一片排除在 FLIP 之外**，不是去調時序：
  它不需要補間，它本來就在指標下面。
- **拖曳的座標基準不能用 `getBoundingClientRect()`。**
  rect **含**元素自己的 transform，拿它算「指標離元素頂端多遠」等於每一幀
  都把上一幀的位移再算一次（誤差累積）；而換位判定去量別片的 rect 時，
  那些片正卡在 220ms 的補間中，讀到的是動畫中途的假座標 → 邊界上無限互換。
  **版面座標（容器 rect ＋ `offsetTop`）不受 transform 影響**，是這類拖曳唯一穩的基準。
  FLIP 則要「起點用視覺 rect、終點用版面座標」才會連續（連搬兩次不跳）。
- **換位要有遲滯，而且要比「被拖那一片的中線」而不是指標。**
  沒有遲滯（這裡 9px），指標停在交界上會被上下各判定一次、無限彈；
  拿指標當基準的話，抓住卡片底部時會提早半張卡就換位（手感像「還沒到就先跳」）。
- **`z-index` 也是「卡片不見了」的來源之一**：被拖的那一片如果沒有壓在別片上面，
  滑過去時會被蓋住 —— 視覺上同樣是消失。

## 2026-08-03 — 同特異度的「打開時位移」會蓋掉變體的定位

- `.infotip__bubble` 預設 `left: 50%` ＋ `translate(-50%)`；書的氣泡改成靠左長
  （`left: 0` ＋ `translate(0)`）時，**`left` 生效了、`transform` 卻沒有** ——
  因為打開狀態那條 `.infotip.is-open .infotip__bubble` 是 (0,3,0)，
  跟 `.infotip--book.is-open .infotip__bubble` **一模一樣**，而它寫在後面。
  修法是把變體那條多掛一個既有的類（`.infotip.infotip--book.is-open`，(0,4,0)）。
  **一般化**：做「同一個元件的定位變體」時，`rest` 與 `open` 兩種狀態都要一起提特異度，
  只改 `rest` 會得到「一半生效」的詭異結果（左緣對了、卻整塊被推出去半個身位）。
- **`* { max-width: 100% }` 這種保險絲會把 tooltip 壓成一個字寬。**
  圖鑑在 ≤430px 有一條 `#codex .panel__body * { max-width: 100% }`（防 `<pre>` 撐寬版面），
  而氣泡的容器只有一顆圖示那麼寬（24px）→ 氣泡被壓成 32px 的直條，一行一個字。
  這是**既有的潛在坑**（ⓘ 在圖鑑裡本來就會中），只是書進來之後才被看見。
  修法：把 `.infotip__bubble` 明確排除在那條之外。
- **靠左長的氣泡，起點越靠右越容易被切掉。** 圖鑑那一列是「神諭原典」小標 ＋ 好幾本書，
  書從 x≈123 起跳、氣泡 289px → 右緣出界。修法不是再縮氣泡（會變成五行兩個字），
  而是**讓小標在窄畫面自己佔一行**，書就從最左邊排起（`.tech__srcslabel { flex: 1 1 100% }`）。

## 2026-08-03 — 其他（本輪順手記下的）

- **同一個 class 在不同看板上有好幾份**（`.palm` 同時存在於 stele 與 orderboard，
  兩份都在 DOM、只有一份看得見）。用 `document.querySelector('.act--carve .palm')`
  量到的是**隱藏的那一份**（0×0），量測會安靜地空過。
  量之前要用夠具體的選擇器（`.orderboard .palm`）或先確認 `getClientRects().length > 0`
  —— 這正是 AGENTS.md 說的「防空泛通過」。
- **分享卡上的品牌名還是舊的**：`drawCard()` 裡 `tracked(ctx, 'PROMPTARCADE', …)`
  ——Phase 29 改名時漏了這一個（它在 canvas 裡，不在任何 DOM 掃描的範圍內）。
  **本輪未動**（不在指示範圍），但那是玩家真的會分享出去的那張圖，值得單獨修。

## 2026-08-03 — 六件事（第二輪）的發現

- **`clip-path` 的護符牌不適合當「安靜的小東西」。** 提示球原本用刻印牌那一套
  （`::before` / `::after` 兩層剪影假造邊與面）做成一塊寫著「提示」的牌子，
  結果它在視覺重量上跟「呈給神諭」同一級 —— 玩家的眼睛會一直被它拉走，
  而它其實只是個備援。換成**單一 SVG ＋ opacity 呼吸**之後，同一個位置、同一個功能，
  但退回背景。**一般化**：元件的「階級」不只由顏色決定，**有沒有牌面**才是最大的那一階。
- **重複的標籤會偷走一整段縱向空間。** 每一幕的小標與指示器講的是同一句話，
  單看只是「有點囉唆」，但四幕加起來是 4 × 約 40px 的死空間，
  而它們正好卡在「玩家第一眼落點」的上方。拿掉之後題目直接上移到摺線內。
- **`flex: 1 1 14px` 的軌道會跟著石頭變窄而暴長。** 石頭從「ACT I 第一幕 · 委託」
  收成「委託」之後，四塊石頭省下的寬度全部被軌道吃掉（每段 300px 的金線）。
  這一版刻意留著（它讀起來仍然是一條完整的進度軌），但要知道
  **「縮短標籤」在 flex 版面上等於「加長它旁邊的彈性元素」**，不是單純變小。
- **`min-height` 之外還有 `padding` 與行高三個變數在撐高度。** 指示器要收到 2/3
  不能只改 `min-height`（40 → 32 只換到 45 → 37）；真正吃掉高度的是
  `padding: 7px 15px` 與 `--t-micro` 的行高。三個一起收才到 32px。
- **`E2E` 的 `H` 熱鍵一直是「焦點要在面板裡」**（監聽掛在 `overlay.root` 上）。
  用 CDP 對著 `body` 發鍵不會有反應 —— 這不是回歸，是既有設計；
  寫探針時要先 `focus()` 一個面板內真的可聚焦（**且沒有 disabled**）的元素。
  第一次探針挑了 `[data-sample]`，它在還沒失敗兩次前是 `disabled`，`focus()` 靜靜失敗。
- **20px 的圖示要留白才讀得出剪影。** 第一版典籍把書身畫滿整個 24 viewBox，
  縮到 20px 之後書脊、束帶、緞帶三個細節擠在一起變成一塊糊。
  第二版把書身收到 y 2.4–21.6、只留三個特徵（書脊線／十字束帶／右緣扣環）才讀得出來。

## 2026-08-03 — 站長三件事（第三輪）的發現

- **「圖示沒對齊」要先問的不是 CSS，是「這個字在不在子集裡」。** 結果列的
  `✓ ◐ ✕` 用的是同一段 CSS、同一個 22px 方框、同一組 `place-items:center`，
  但只有 `✕` 是正的 —— 因為 `arcade-mono.woff2`（JetBrains Mono 子集）
  原字型就沒有 `✓`(10003) 與 `◐`(9680)，那兩個掉到系統備援字型，
  side bearing 與基線整組不一樣。**`public/fonts/manifest.json` 的 `missing` 是第一手證據**，
  比在 devtools 裡推半天快得多；`document.fonts.check()` 反而會回 true（它答的是
  「字型載好了嗎」而不是「這個字它有嗎」），不能拿來當判準。
- **文字符號永遠不該拿來當 UI 圖示。** 就算子集裡有，字型的視覺中心也不等於幾何中心
  （`✓` 的 ink 幾乎全在基線以上）。改成行內 SVG 之後「置中」是 viewBox 的事實，
  量出來 dx=dy=0.008px，而且**跟著 em 縮放**，Phase 14 那種「整組型級放大 1.75 倍」
  再來一次也不會歪。已知同一個坑還在的地方：`checklist__dot` 的 `✓ ◐ ·`、
  `constraint.js` 的 `gauge__mark`（`✦ ◐ ○`）、分享卡上原本的 `◈`（本輪已改成畫的）。
- **固定尺寸的畫布上，「一行一列」的清單是定時炸彈。** 分享卡的土地封印本來是
  「一片一行 × 28px」，五片時剛好、十二片時整片掉出畫布。
  現在改成**格子數決定欄列、列高由剩餘高度反推**（並保證離頁腳 ≥34px）——
  規則是：**canvas 上任何會長的清單，都要寫成「先算得下多少，再決定怎麼排」**，
  不能寫成「一個一個往下加」。
- **課程 v2 之後，「x / 68」是三個不同的問題。** 圖鑑頂端算的是舊 68 條技巧、
  區域完成度在新七區算的是 v2 技能、稱號門檻算的又是舊技巧數。
  分享卡是唯一「一張圖要同時講完這三件事」的地方，所以它必須明確選一把尺 ——
  這次選的是 `knowsSkill()`（skillsV2 ∪ 舊技巧祖先），因為那是玩家在世界裡
  真的被拿來開門的那把尺。**同一個數字在不同畫面代表不同東西時，要在程式碼裡寫下選了哪一把。**
- **142 關裡有 101 關沒有 legacy `teaches`。** 分享卡的「刻進圖鑑的技法」只查舊 68 條，
  所以 Phase B 之後新蓋的那一百多座神廟通關後那一欄是空的 —— 但畫面不會報錯，
  只是安靜地少一塊。**「查不到就顯示空的」是最難被發現的一種壞掉**；
  v2 之後凡是「用 id 查東西來顯示」的地方，都要先確認查的是不是新那一層。
- **`navigator.share` 之前不能 await 這條規矩，讓「先備好 blob」的時序變成測試的隱性前提。**
  探針一開始只等 900ms 就按「複製圖＋文」，那時 `lastBlob` 還沒好，
  `copyBundle()` 直接 return false，看起來像「剪貼簿沒帶文字」的 bug。
  在軟體渲染的機器上 1200×630 的 `toBlob` 要好幾秒 —— 探針要等的是**狀態**（blob 備好了沒），
  不是牆鐘時間。

## 2026-08-03 — 142 關內容稽核：79 條 findings 的逐條處置

12 個代理逐關審完 142 關，交回 79 條（24 高 / 29 中 / 26 低，涵蓋 65 關）。
**54 照建議套用、20 調整後套用、5 記錄理由後跳過。**

### 這一輪學到的（比逐條表更重要）

- **「素材裡有沒有那句話」是點碑／改碑題型的存亡前提，而不是文案細節。**
  `spot`／`fix` 的玩法是「從你已經看過的句子裡挑」，但有五關的 slips／fragments
  一半是玩家在 Act 1 素材卡從沒讀過的新句子 —— 題型的前提整個不成立，
  玩家只會困惑「這是哪來的」。**新增 spot／fix 關卡時，
  material.text 必須逐句涵蓋 flow 裡的每一張紙條**，這比任何評分細節都先決。
- **謎題挖掉的那一塊，必須就是被評分的那一塊。** `three-maxims-82` 的柱子磨掉第二句箴言，
  primary check 卻只量第一句 —— 玩家填對了被問的那格，分數卻是別的地方給的。
  這種錯位在資料上完全合法（rubric 與 flow 是兩份檔案），只有實際玩過才看得出來。
- **同一關內兩段教學可以互相打臉，而且不會有任何測試攔下來。**
  `effort-forge-15` 的旋鈕模擬演完「中火就夠」，下一步的刻印正解卻是 high，
  錯誤回饋還寫著「思考火力要開高」。`wish-pool-52` 的「temperature 轉到 0 是保證」
  與同畫面 `dated-notes.json` 的「設 0 也只是趨近確定、Claude Sonnet 5 會報錯」同框。
  **sim／tradeoff／multi 這種「先給你看一段結論、再叫你作答」的題型，
  結論與正解要放在一起讀過一遍。**
- **C1 契約（一關恰好一條主檢查 ＋ 至多一條地基）會讓「故事說三件事、只評一件」變成常態。**
  三條 findings（`three-maxims-82`／`endless-corridor-86`／`unclosing-door-78`）
  都是同一件事：自由書寫模式下只滿足主檢查就能拿 S，跳過情境明講「唯獨缺了這幾條才會出事」的其餘部分。
  引導模式不受影響（每個 slot 都要刻）。要真的修，得在 `checks.js` 寫複合檢查器
  （像 `asksToCompact` 的 compact/keep/drop 三合一那樣）——**這是引擎工作，不是內容工作**，
  而且 `requiresConfirmation` 有四關共用，改了要重驗四關。
- **`workshop` 題型的組裝樣板是寫死的工具呼叫語法，換皮換不掉。**
  `handover-table-87` 的 labels 已經把「工具」換成「欄位」，
  但 `callLine()` 仍然吐『呼叫「目前做到哪」，停在哪一間＝第 7 間。』——
  欄位不是函式，這段話讀起來不成立。而且 `order` 題型有
  「排好的字＝`c.sample`」的斷言、`workshop` 沒有，所以工坊組出來的字
  跟自由書寫的「看看範例」可以是兩篇不同的文章而測試全綠。
  **不是在教工具呼叫的關卡就不要用 `workshop`**（這一關改成 `order` 之後，
  四片石版排好即逐字等於示範解答，漏掉的第三欄也順勢回來了）。
- **`challenge.source` 必須屬於它的主技能（測試有守），所以「換一條正確的出處」
  一定會連動到 `skill-codex-v2.json`。** `wish-pool-52` 教 temperature，
  掛的卻是 xAI「網頁搜尋限定網域」——換成 Google Model parameters 時，
  同時要把那一列加進 `param-not-plead.sources` 並補 `masterRef`（76），
  否則 `[wish-pool-52] source 屬於它所教技能的出處` 會紅。
- **錯的深連結比沒有深連結更傷。** Magistral 模型卡的 `#sampling-parameters`
  被拿來佐證「模型卡建議附上身分設定」，那一節只有 `top_p`／`temperature`。
  查不到正確錨點時，正確的動作是**降回頁面層 ＋ 寫下誠實理由**，
  不是猜一個新的片段；`expected-counts.json` 的 `skillRowsWithoutAnchor`
  跟著 75 → 76，並在 `why` 裡寫清楚「這是把一條錯的深連結改成誠實的頁面層引用，
  不是把驗證拿掉」（那個數字的契約明講「只准往下走」，所以往上一定要留下理由）。
- **快速填入有兩條互相拉扯的斷言**：`2–4 片`、以及
  `全部按下去 ≠ 示範解答` 但 `全部按下去必須過關`。
  補一片「交代任務」讓掛零的地基分回來時，很容易一腳踩進上限、
  另一腳踩進「等於答案卷」——正解是**併進既有的某一片**（多一行），
  而不是新增一片。
- **合尺板的空狀態會把引擎的「字太少了」複述 N 次。**
  `runCheck('')` 對每一把尺回同一句通用證據；合尺板每一把尺底下都畫它，
  於是玩家開場看到的是三到四行一模一樣的廢話。
  **「還沒開始」不是「做錯了」**——這種狀態應該只呈現「這把尺要量什麼」。

### 逐條處置表

| 關卡 | 嚴重度 | 位置 | 處置 | 說明 |
|---|---|---|---|---|
| dispatch-window-88 | high | scenario/material | **applied** | scenario/material 五張→三張，與 mission／material.text／三把工具一致 |
| dispatch-window-88 | medium | flow slot 3 (workshop.stages[2] / order) | **adapted** | 工坊的四步（含排順序）是引擎寫死的，拿不掉；改成把順序講出理由：兩件互不相干、可同時派，先派最久的那一件（copy 的說明也改成「最久的一件」） |
| diagnosis-bench-95 | high | clue / rubric primary check (diagnosesFailureCause) / coach 教學 | **adapted** | 沒有動檢查器（改 checks.js 會波及 coach 與回歸案例）；改走 reviewer 的備案：把素材補成真的含有那三類病因（「那個東西」＝資料沒給、表格逼它硬填、問下個月水位＝超出範圍），craft 補上「每一條再說出病因是哪一種」 |
| diagnosis-bench-95 | high | material / spotFlow d2 | **applied** | 「閘門日誌」寫進委託本文，附註改成廠裡的名詞表（不再提素材裡沒有的「巡檢紀錄」） |
| diagnosis-bench-95 | medium | material | **applied** | 處裡 → 處理 |
| empty-handed-inspector-97 | high | flow slots (第 2、3 段標號) | **applied** | 四段標號改成第一／第二／第三／最後 |
| sevenfold-door-96 | medium | tradeoffFlow rounds[1].verdicts.drop | **applied** | 「八百次就是一整個下午」→「八百次疊起來就是一整天的機器時間」 |
| clashing-tablets-94 | medium | orderFlow (decisionTree 第二層與 else 分支) | **applied** | else 分支改成「排進明天的例行批次」，第二層（急件→當天寄出）才真的產生區別；sample／快速填入／orderFlow／coach 四處同步 |
| wrong-door-91 | medium | flow slots / sample 不一致 | **adapted** | sample 補上開場那句委託；快速填入不是新增一片（上限 4 片）而是併進第一片 |
| effort-forge-15 | high | sim（simFlow reasoning-effort 旋鈕模擬）vs. flow slots 最後一段／quickFills／sample | **applied** | 最後一段正解、快速填入、示範解答、rubric hint 與 checkOptions.example 全部 high → medium；high 降為錯誤選項並回饋「模擬剛剛才看到」；low 選項移除（它的教訓模擬裡已經演過） |
| wordfork-12 | medium | sample／quickFills（第一段與第二段拼起來的完整句） | **applied** | 走 reviewer 建議的 (a)：任務句保留「語言」這個歧義詞，第二段才把它講死；順手改掉那個會誤導的干擾選項回饋 |
| two-lampkeepers-18 | medium | material／sample／quickFills（『這本帳』／『下面的帳目』） | **applied** | material 補上那本收成帳的數字，sample／快速填入／slot 的任務句後面實際附上帳目 |
| parts-wall-16 | low | sample／quickFill「掛資料」（資料段） | **applied** | sample／flow／coach 的資料句改回素材裡真的有的「水井這週停用三天。」（namesComponents 只有這一關在用，所以 coach 也跟著改） |
| verify-spring-24 | high | sample / flow slot 1 / constraintFlow piece(read) | **applied** | 三處「地圖室裡的三張筆記」→「泉守推來的三張筆記」 |
| well-pause-22 | medium | scenario | **applied** | scenario「數字互相打架」→「說法兜不起來」（走 reviewer 的 (a)） |
| well-pause-22 | medium | flow slot 3（第三段：第二桶推翻了第一桶，怎麼辦？） | **applied** | 配合 (a)：「取平均值」錯誤選項改成「兩桶各算一半可信度，含糊帶過」，回饋跟著改 |
| well-pause-22 | low | flow（multiFlow.handoffs[0].text） | **applied** | 過場文字的第二桶改成與素材逐字相同的「偏濁，帶鐵鏽味」 |
| three-wells-25 | medium | scenario | **applied** | scenario 改成「加總只算過一遍」，動機對準「同一題重複驗算」而不是調解三口井 |
| working-draft-19 | low | flow（fixFlow.fragments 的 longwind 片段） | **adapted** | 沒有改 mission，而是把整份弱草稿寫進 material（任務句／示範／那段冗長思路），與 [19][20][21] 同一條原則：Act 1 看到的＝Act 3 要處理的 |
| shout-stone-11 | high | material vs flow(spotFlow.slips) / craft | **applied** | material 補成完整委託（雜訊句 ＋ 兩句有資訊的 ＋ 那句帶長度的），與 spotFlow 的六張紙條逐句對得上 |
| nodding-courier-09 | medium | material vs flow(spotFlow.slips) / craft | **applied** | s2（門牌與取水時間）、s5（同一張紙、最多 12 行）併進 material |
| nightwatch-relief-07 | medium | flow(fixFlow.fragments) — id: story | **adapted** | 走 (a) 而不是 (b)：那段身世寫進交班紙（craft 本來就寫著「補過頭的身世就整段拿掉」，只是素材沒給） |
| mimic-mirror-04 | medium | rubric(hasFewShot, primary) / sample / primarySkillId="prefill-completion" | **adapted** | 查了官方出處：Google 的 completion strategy 本來就是「幾組成對範例 ＋ 最後一組留白」，sample 正是那個形狀，所以不改 rubric 也不改 skillId；改的是 clue —— 補一句「最後一組只寫到『輸出：』就停手」，把 format-03（部分輸入）那一半講明 |
| lost-automaton-03 | low | clue / flow slot1 | **adapted** | clue 換成這一關素材自己的例子（不要走左邊→請靠右走）；南門北門改成在 scenario 裡先交代（不動 slot 選項） |
| triple-echo-124 | medium | mission ＋ constraint gauge | **applied** | mission「三把尺」→「每一把尺」 |
| one-pour-cast-127 | medium | mission ＋ constraint gauge | **applied** | 同上 |
| one-pour-cast-127 | medium | material | **applied** | material 補上六段回報的實際內容，補給／航路／天氣三類看得出出處 |
| unwatched-forge-128 | high | scenario ＋ material vs flow(workshop.tools) | **applied** | 走 (a)：scenario／material 改成三把工具，其中一把跟今晚這件事無關 |
| one-line-left-129 | high | sample | **applied** | 那句從別關抄來的 ctx-pruning 範例拿掉，換成素材裡真的有的「開場那段舊客套話整段拿掉」（asksToCompact 仍然滿分） |
| who-can-mend-130 | medium | flow reverseFlow.tags/parts vs slots | **applied** | stop 收進最後一段的正解與 sample；settled 改寫成真的涵蓋四塊 |
| who-can-mend-130 | medium | flow reverseFlow.lead | **applied** | lead 改成「另外掛著的一份成功範例——不是牆上那三版」 |
| still-to-reel-132 | low | flow orderFlow piece p4 / sample | **applied** | p4 主體改成木牌本身（呼應 p2 的無人畫面）；順手修掉 p3／p4 標籤對調的既有錯誤 |
| three-machines-133 | high | scenario ＋ clue vs flow tradeoffFlow.rounds | **adapted** | 走 (a) 但保住區域主題：scenario 改成「這片土地上三台機器的守則卡——今晚攤開的是其中兩張」（標題「三台機器」不動），clue 收成「只有身分那一件會翻面，另外兩件哪一張卡都要寫」 |
| full-cast-theatre-126 | low | clue ＋ flow orderFlow | **applied** | clue 補上「中間才輪到『請它做什麼』」 |
| stale-tray-104 | medium | material | **applied** | material 第一句範圍排除第三份，第三份改寫成「雖然也是上個月的，卻是唯一寫著初始數量的一份」 |
| storyboard-wall-111 | medium | quickFills | **adapted** | 補「場景」片、運鏡片改成「鏡頭緩緩推近，構圖用中景」；上限 4 片，所以把委託句併進最後一片（順手補上原本掛零的 assignsTask） |
| storyboard-wall-111 | low | material / flow slot order | **applied** | material 改寫成與六片實際石版一致（動作併進主體、補上那片委託牌） |
| twice-copied-101 | low | title / npc | **applied** | 標題／NPC 改成「先抄一遍才敢答」 |
| twice-copied-101 | low | flow slot (spotFlow p3) | **applied** | p3 改成「先把整張收成帳的品項重列一次」，因果貼回「抄一遍」 |
| two-faced-pillar-115 | high | flow/source（tradeoffFlow.rounds[1].card.sources ＋ challenge.source） | **adapted** | 查不到 Magistral 頁上真的講身分設定的錨點 → 不亂猜一個新錨點，改成頁面層 ＋ `anchor:"none"` ＋ 誠實理由；challenge.source 與卡片同步；`expected-counts.json` 的 75 → 76 一起改並寫下為什麼 |
| same-name-dial-117 | medium | flow slot（simFlow.ask） | **adapted** | sim 真的有三台機器（第三台沒有這一格），所以不是改 ask 而是把第三台鋪陳進 material 與 scenario |
| breathless-stone-112 | low | quickFills | **applied** | 補一片「交代任務」；為了不讓四片剛好等於示範解答，最後一片多一句節奏交代 |
| patched-robe-121 | low | npc / scenario | **applied** | npc 改成「一件貼滿補丁的舊袍」 |
| sealed-scale-118 | low | npc / scenario | **applied** | npc／scenario 的「一整排」收成「幾個」 |
| rewritten-stele-123 | low | flow slot（reverseFlow.settled） | **applied** | settled 改寫成涵蓋四塊（含「找不到就老實說」） |
| two-faced-pillar-116 | low | flow slot（tradeoffFlow.rounds[0].card.sources） | **applied** | 卡片補上但書：只要呼叫過工具，推理內容依官方規定要整段留著 |
| draft-review-wheel-32 | high | flow multiFlow.handoffs[0].text（校準師轉出來的第一格草稿／神諭第一次回話） | **adapted** | 走 (a)：草稿補長到真的 89 字（超過 80 字的標準），括號同時寫出「超過標準」與「沒寫出是哪三天」 |
| irreversible-gate-34 | medium | flow workshop.tools[1]（"set" 閘門_調高度）＋ material | **applied** | set 工具補上「閘號」參數 ＋ 新增「二號閘」值石，呼叫句變成「閘號＝二號閘、目標高度＝60 公分」；miss 提示跟著改 |
| irreversible-gate-34 | low | clue | **applied** | clue 的「八把鑰匙、兩把沒備份」改成「有一把沒有備份」 |
| laden-desk-27 | low | flow constraintFlow.gauges（第 2 支尺 putsQuestionLast）與 rubric | **skipped** | C1 契約（test-rubric.mjs:6190）規定神廟恰好一條主檢查 ＋ 至多一條地基，rubric 上不准有雜項 —— 加 putsQuestionLast 會直接違約，而且會動到 pass 門檻。這是全部合尺神廟共通的架構（完全資訊、單點評分），不是這一關的 bug。留作後續：要嘛結果面板另外列出「你還多做到的」，要嘛改 C1 |
| tool-forge-33 | low | craft 與 flow fixFlow.fragments（desc 片段的正確替換） | **applied** | craft 拿掉「關鍵規則放最前面」（正解沒有這樣排），改成「把邊界也寫進去」 |
| three-maxims-82 | high | rubric（主檢查 setsPersistence）／scenario／craft | **adapted** | 複合檢查器＝改 checks.js（本輪範圍外，且 C1 不准加 rubric 列）。改的是更根本的錯位：柱子磨掉的是第二句箴言、評分卻只量第一句 —— 把磨掉的那一句換成被評分的那一句（做到完全解決才交還），另外兩句留在素材上讓玩家抄進去。flow 的段落標號同步 |
| endless-corridor-86 | high | rubric（主檢查 setsPersistence）／scenario／material | **skipped** | 同 [51] 的架構限制，但這一關沒有錯位可修：scenario／clue 本來就把 persistence 擺在第一輪、回報節奏擺在第二輪，multi 流程也強制兩輪都走完。要真的評到第二輪的東西，得在 checks.js 加一個複合檢查器 —— 記為後續 |
| handover-table-87 | high | flow（kind: workshop，composition template）／sample | **applied** | kind 由 workshop 改成 order（reviewer 的首選）。四片石版＝c.sample 的四行，排好即逐字等於示範解答；漏掉的第三欄「卡住的地方」跟著回來；workshop 區塊整個移除 |
| two-slots-76 | medium | flow slot 2（tradeoff round 2 card / verdicts） | **adapted** | 不改被仿冒的那一組標籤（改掉就沒有伏筆了），而是把伏筆接完：兩邊判詞都給出「換成這一封信裡絕不會出現的字元組合」的具體示範，settled 補上「每一封都要重看一次」 |
| guest-in-disguise-79 | low | flow（workshop.stages 第 3 步 order 排序 / workshop.tools 的 miss 文案） | **adapted** | 工坊的排序步驟拿不掉（引擎寫死四步），照 reviewer 的次選：把理由寫進題目本身 —— 「先測哪一種？照案例紙上出現的先後排。」 |
| unclosing-door-78 | low | rubric（主檢查 requiresConfirmation）／scenario | **skipped** | 同 [51][52]：requiresConfirmation 是四關共用的檢查器，改成複合式要動 checks.js 並重驗四關。記為後續 |
| forge-door-66 | high | material／flow（workshop 第2步 params）／sample | **applied** | 1310 寫進這一關自己的素材（「西元 1310 年立的那一份」），填錯時的提示改成對得上那句話 |
| crowded-bench-68 | high | flow（workshop 第4步 rules）／sample | **applied** | 規矩正解／快速填入／示範解答的「只留 3 把」全部改成 2 把 |
| twice-carved-64 | medium | flow（spotFlow ask 與 s5） | **applied** | ask 改成「哪幾句有問題 —— 寫重複了，或者該寫卻沒寫？」，同時涵蓋重複與遺漏 |
| two-seals-63 | low | clue | **applied** | clue 收窄成「這一批要直接進帳本」，跟 tradeoff 的 settled 同一個語氣 |
| gear-mesh-71 | low | flow（orderFlow order） | **adapted** | 沒有放寬排序判定（會動到 order 的契約），改成 reviewer 的次選：craft 補一句「先寫有先後的，再寫可以並行的，讀的人才不會漏看依賴」 |
| priority-stair-42 | high | scenario ↔ mission/material | **applied** | scenario 整段改寫成規矩優先序的鋪陳，拿掉五段式結構的敘述 |
| scribe-longtable-49 | high | craft ↔ orderFlow.order | **applied** | craft 拿掉「範例」（桌上沒有那一片） |
| scribe-longtable-49 | medium | scenario ↔ flow.orderFlow.ask | **applied** | scenario「八張段落石版」→「四片」，並把「範例躺在資料堆裡」改成「收工那一塊還是空的」 |
| oracle-workshop-36 | high | scenario/material ↔ workshop.tools/rules | **applied** | 走 (a)：肇事案例改成「把明天的天氣拿去翻昨天的帳本」，正確規矩正好修得到；四把工具的說法一併收成三把 |
| four-elements-mirror-44 | medium | mission ↔ material | **applied** | mission 的「9 個字」→「六個字」 |
| four-elements-mirror-44 | low | rubric | **skipped** | 同 [49]：C1 契約不准在 rubric 上加第三列。四要素由刻印的四個 slot 強制，畫面上的 rubric 清單也已經誠實列出被評的是哪一條 |
| dial-room-43 | medium | scenario/material ↔ craft/quickFills/sample | **adapted** | 走 reviewer 的第二個選項（拿掉「火力」那面牆）而不是加句子 —— 這一關的時代註記本來就寫著「一次只轉一個旋鈕」，再塞一個 effort 反而衝突 |
| dial-room-43 | low | sample / flow slot 2 | **applied** | sample／slot 拿掉 top_p=0.8，只留 temperature 設為 0；快速填入補一句「不必再多轉一個 top_p」 |
| lintel-words-46 | medium | craft ↔ material/flow.spotFlow/slots | **applied** | craft 收成實際示範到的三種（角色、禁區、輸出語言） |
| one-slot-window-47 | low | flow.fixFlow (tail fragment) | **applied** | 走 (a)：tail 那句寫進 material 與 starter 的弱寫法裡，它才真的是「被黏住的一部分」 |
| two-grammar-hall-50 | low | scenario/craft ↔ flow.tradeoffFlow.sides | **adapted** | 沒有新增第三個分支（要多一輪素材與判詞），照 reviewer 的次選在 clue 補上原因：方括號跟一般文字裡的括號長得太像，通常第一個被刷掉 |
| lintel-words-46 | low | 跨關卡（lintel-words-46／one-slot-window-47／six-lantern-48／scribe-longtable-49／two-grammar-hall-50） | **skipped** | 五座骨架神廟共用同一份停水公告是刻意的（一次只換一個變因，認知負荷最低），reviewer 自己也寫明這一點。換掉其中一兩關會讓五關的素材與示範解答全部要重對，收益低於風險 |
| wish-pool-52 | high | 其他（rubric 主檢查 techniqueId="params-01" 對應的 skill "param-not-plead" 的官方出處，顯示於第二幕神諭刻文與過關後 Act4「本關技巧的官方出處」連結） | **applied** | 出處換成 Google 的 Model parameters（同時補進 param-not-plead 的 sources ＋ masterRef 76，因為 challenge.source 必須屬於主技能）；craft 與 tradeoff 判詞改掉「這是保證」的絕對說法，與同畫面的時代註記不再打臉 |
| empty-adjective-60 | high | material | **applied** | material 補上真正要重寫的告示原文，並讓「各位鄉親好！」這句樣板句真的重複三次 |
| two-rulers-57 | high | material | **applied** | material 補上航班說明節錄與「原文共 640 字，已經算好」，sample 裡那個數字不再憑空冒出來 |
| for-newcomer-59 | high | material | **applied** | 走 (a)：素材補上 5 月 20 日與 3,000 元，過場的第一版結論改寫成真的對應這份素材（並點名那兩個數字被省掉了） |
| abacus-count-56 | medium | sample | **adapted** | 「紀錄筆數是 14 筆」不是刪掉就好 —— 它同時是 spotFlow 一張紙條的正解，刪了 sample 就對不上。改成素材裡真的有的東西：三份稿各自寫的字數不用理會，一律以 812 字為準 |

### 留給後續

1. **複合檢查器**（`checks.js`）：`setsPersistence` 與 `requiresConfirmation` 都只量情境所講的一半。
   要嘛比照 `asksToCompact` 寫成三合一，要嘛放寬 C1 讓神廟掛得起第二條低權重檢查。
2. **合尺神廟的「多做的沒有被承認」**：合尺板要求全部亮才給手掌印，但結果面板只列 rubric 上那兩條。
3. **`scripts/test-rubric.mjs:8416` 的既有 `TypeError`**：`platformOpenUrl('instagram', …)` 回 `null`
   （Phase 31 之後 Instagram 沒有網頁入口是刻意的），那一行沒有防呆，整支測試因此跑不到終點——
   後面約 3,000 行從來沒有被執行過。連同分享那 51 條漂掉的斷言一起翻面，是下一輪的第一件事。

## 2026-08-03 — 站長回報三個 bug 的發現

### 1. CJK 的直書其實是「grid 自動排版把文字丟進 20px 的欄」

`.face`（雙面碑的一面）是 `grid-template-columns: 20px minmax(0, 1fr)`，
按鈕底下卻有**四個**直接子元素。兩欄的自動排版把第 3、4 個孩子放到第二列，
於是那一句話落進 20px 的鍵位欄 —— **中文的 min-content 就是一個字**，
所以看起來像直書。`minmax(0, 1fr)` 這種「已經做對的」欄寬完全防不到這件事，
因為問題出在**孩子的數量**，不是欄寬。

規則：**多欄的 grid 底下，一欄只能有一個孩子。** 一欄要放好幾段文字，
就包一個 `min-width: 0` 的 wrapper（不是靠 `grid-column: 2` 一個一個指定 ——
那要每加一段就記得補一次，遲早會漏）。

一個副作用的教訓：這個 bug 在**英文**下幾乎看不出來（min-content 是一個單字，
20px 的欄會被撐開變寬），所以純英文的目視複審抓不到它。CJK 專案的版面斷言
要量的是「文字區塊的寬度是不是接近它該有的寬度」，不是「有沒有溢位」。

### 2. 取捨題的紀錄少了「這一列是哪一張卡」就會讀成自相矛盾

雙面碑的設計本來就是**同一題、換一張卡、划算的那一面翻面**。
所以「秤過的帳」裡兩列的「你倒向哪一面」很常一模一樣，判詞卻相反 ——
如果那一列沒有寫出「這一列是哪一台機器」，讀起來就是同一題被問兩次、答案互相打架。

規則：**凡是「同一題換一個前提」的題型，紀錄的每一列都要自己帶著那個前提。**
（做法：卡名 ＋ 那張卡的關鍵句各一行。）
資料面同時要求卡名本身講得出區別 —— `three-machines-133` 原本叫
「第一張卡」「第二張卡」，那不是名字，那是編號。

### 3. 碰撞稽核只問中心點，所以大而扁的東西可以整片是鬼影

`collision-audit.mjs` 的 `auditCoverage()` 對每一件「有份量」的東西
只問一次 `solidAt(中心 x, 中心 z)`。一塊直徑 19 公尺的圓臺座，
中心被一個 1.3 公尺的柱子圓蓋住就算「有覆蓋」——**稽核永遠是 0，
但外圈六、七公尺是走得上去然後陷下去的石頭**。

而且這件事會自己發生：臺座本身有被 `markSolidParts` 標成實體，
只是外接盒推出來的半徑（10.6）被 `SOLID_MAX_RADIUS`（3.6）夾住。
**夾一個半徑，等於在那件東西的外圈製造一圈鬼影** —— 夾的當下沒有任何訊號。

用一支「邊緣取樣」的探針（對每件半徑 ≥2 的東西在 0.75×半徑處取樣 12 個方向）
掃出來，全世界有 **5 座地標的臺座**都是這個毛病，不只站長看到的那一座：
`twin-pillars` / `nameless-keys` / `facing-glass` / `empty-plinth` / `sky-mirror`
（後四座是 Phase E–J 蓋的，從來沒有登記過自己的臺座）。

建議（沒有在這一輪做，因為會動到全部稽核的門檻）：
把 `auditCoverage()` 改成「半徑 ≥2 的東西要多取樣邊緣」，
並讓 `collectSolids()` 在**夾半徑**的時候留下可以被斷言的記號
（例如 `clamped: true`），不然「被夾過」這件事在資料上完全看不出來。

### 4. 順手發現：`--t-nano` 這個 CSS 變數從來沒有被定義過

`styles.css` 有四處在用 `var(--t-nano)`（`.tradelog` 附近兩處、
窄畫面的 `.gauge` 與 `.piece__grip`），但整份樣式表裡沒有任何一行定義它 ——
那幾行的 `font-size` 是無效宣告（字級直接繼承父層）。
不是本輪的 bug，沒有動；新加的 `.tradelog__premise` 刻意改用相對的 `0.92em`。

---

## 發版前測試債清理（2026-08-03）的順手發現

### 5. `SOURCE_NOTE` 已經沒有人用了 —— 而註解說它搬到了 `sourceBook` 的 `extra`

`console.js` 仍然匯出
`SOURCE_NOTE = '每一段刻文都指得回它的神諭原典 —— 也就是 OpenAI、Anthropic、Google、xAI 的官方文件。'`，
`renderGuidance()` 上方的註解也寫著「那顆 ⓘ 講的是出處，所以它的內容跟著那本書走了（見 `sourceBook` 的 extra）」——
但**整個 repo 沒有任何一處呼叫 `sourceBook()` 時傳 `extra`**，
所以那句解釋現在**畫面上完全不存在**（小卡上只有「神諭原典：<文件名>」）。

護欄 2 沒有破（真實文件名與可點的官方連結一直看得見，而且標籤後面接得出「Anthropic · …」
這種一看就知道是誰家文件的名字），所以這一輪**沒有動 `src/`**，
只把測試改成釘住「小卡＝神諭原典：<真實文件名>」。
要補的話一行就好：`sourceBook(primary.src, { label: SOURCE_LABEL, extra: SOURCE_NOTE })`。

### 6. `styles.css` 裡有三塊已經沒有人用的分享卡樣式

`.sharecard__chip` / `.sharecard__chips` / `.sharecard__sendlabel` 在 2026-08-03 的
分享面板收斂之後**沒有任何 HTML 會產生它們**（現在的那一排是 `.sharecard__icons > .iconbtn`）。
rubric 原本有一條「那一排石籤有自己的樣式」正是靠這幾塊死樣式在通過 ——
已改成釘 `.iconbtn` / `.sharecard__icons`。死樣式本身沒有刪（不在這一輪的範圍）。

### 7. 兩條「單位不一致」的資產預算

- `test-rubric` 的字型總量：訊息印 `bytes / 1024`（KiB），門檻卻寫 `1_500_000`（十進位 MB）。
  142 關的語料把總量推到 1,473 KiB —— 以 KiB 看是 1.44 MiB（沒超），以十進位看是 1.508 MB（超了）。
  已統一成 KiB（上限 1.5 MiB）。
- `headless-check` 的兩套中文字型合計：同一個毛病，1.15 MB → 1.2 MiB。

這兩條守的其實是「還是子集，不是整包字型」（完整版 16 MB + 11 MB），
不是「不准長」；語料每一期都會被新內容撐大，**單位要先講清楚**才有辦法談門檻。

### 8. 一條測試自己寫死座標造成的假紅

`headless-check` 的導航提示「往目標走過去」用 `g.player.teleport(t.x + 22, t.z + 16)`，
也就是**假設玩家原本站得比 27 個單位還遠**。目標位置一改（或前一段測試把玩家留在別的地方），
它會變成「往目標走過去反而變遠」（實測 25.1 → 27.2），連帶四條冷卻／淡出的斷言一起紅。
已改成沿著「玩家 → 目標」那條線縮短 12 個單位 —— 不管站在哪裡都成立。

### 9. 手掌印提示已經小於 12px（站長定稿）

`--t-micro × 0.86 × 0.4` 在 720 / 390px 下量到 7–8px，撞上「窄畫面不得小於 12px」那條。
它重複的是同一個畫面上已經用大字寫過的動作（「把手掌按上石碑」＋ 那顆手掌本身），
所以這一輪把它列成**唯一一條寫明理由的例外**，而不是把門檻整條調低 ——
其餘任何一處小於 12px 的內文照樣紅，失敗訊息也改成印出「哪個 class：幾 px」。

## v1.2「濁靈之夜」裁決 D1–D6（2026-08-17 · 站長：照推薦）

> `/goal` 開每個 phase 前先讀本節；找不到對應裁決就停下請示。改動一律追加新條目，不改舊條目。

| # | 事項 | 裁決 | 影響 phase |
|---|---|---|---|
| D1 | 濁靈名字外觀與數量 | **「濁靈／濁言／清燈」**；外觀＝該區顏色被弄髒的一團霧＋一顆眼光；**v1 8 隻，前四區各 2**（foundations／reasoning／grounding／orchestration） | P01–P04 |
| D2 | 四廠世界化 | **「四部原典／四宿」**：星圖用程序化星點、無標誌；世界層文字零公司名；圖鑑出處列與名稱一字不改；成就頁加免責句 | P08 |
| D3 | 中點揭示觸發 | **走進分歧之廳**（跳門者不錯過） | P21 |
| D4 | `firstPrompt` | **記錄**：P07 起擷取序章第一次自由書寫（純文字、≤280 字、escape、只存本機）；舊檔無則終局改用「你最好的一句」；刻碑／分享前必經確認 | P07、P22 |
| D5 | 跳躍鍵 | **`J`**（`E`／`Space`／`Shift` 都不動；keyhelp 與 e2e 同步；P24 手機以情境鍵承接） | P13、P14、P24 |
| D6 | 滑翔 | **延到 P19 開頭用 `/codex consult` 決定**；預設傾向不做（若做：起飛台＝地標平台、落點＝捷徑另一端） | P19 |

## v1.2 里程碑閘門紀錄

（每個里程碑閘門的「過／砍」在此追加：日期、閘門、決定、理由。`/goal` 在閘門處找不到「過」就停。）

## v1.2 · P01 開工前的發現（2026-08-17）

- Codex consult 指出「不落盤」不只 `recordResult`：主控台第二幕 `markGuidanceSeen()`、看範例 `markSampleSeen()` 也會持久化 challenge id → murk 要在 console 端依 `kind` 跳過；e2e 改比「送出前後 state 深比較＋序列化 save 相同」。
- rubric 主列沒有 `primary:true` 時第二幕找不到主教學列；`expected-counts.json` 是 `contract.<key>:{value,why}`；`noCollideZones` 會把靠石座 <9.9m 且無 `keepSolid` 的實體當雜物濾掉。
- 保守選擇：murk 第一幕用專用 eyebrow「濁言」而不動全域 `ACTS`；`onResult` murk 分支置頂 return。

## v1.2 · P01 執行中的發現（2026-08-18）

- 實作 subagent 兩次被外部因素中斷（API 連線中斷；Anthropic session 用量上限），續跑後完成；磁碟上的改動沒有遺失。
- **Codex 額度用盡**（提示 2026-08-20 12:46 前不可用）：`/codex review` 無法執行。保守替代：改用 Claude 內建 `/code-review high` 做獨立審查，P1 仍必修；Codex 恢復後的下一個 phase 再回到「Codex consult＋review」。此替代不算違反 §5（審查仍有、且獨立於實作者）。
- **濁靈座標規則升級（獨立審查＋e2e 抓到）**：原本「離石座 ≥8m、離其他互動物 ≥4m」會讓濁靈的 5.5m 互動圈蓋住石碑（4.6）／刻文（3.8）／器物（3.2）的可讀範圍（濁靈搶 E 排在它們前面），也讓舊 e2e「石座前 8m 不該有提示」失敗。定案：**互動圈不重疊**——離石座 ≥12（6.5＋5.5）、離石碑 ≥10.1、刻文 ≥9.3、器物 ≥8.7、其他不搶 E 的東西 ≥4；**唯一例外** `murk-while-at-it` ≥10（orchestration 13 座石座飽和、全區無 ≥12 的點；石座在仲裁裡本來就贏，玩家端零倒退），例外表寫在 `test-rubric.mjs` 且上限 1 條。因此 6 隻搬家：vague-ask (6,-27)→(21,-32)、only-donts (16,39)→(27,39)、no-example (-100,-106)→(-105,-106)、trust-me (91,-106)→(86,-103)、all-at-once (-108.5,71.5)→(-94,85)、while-at-it (-71,100.5)→(-85.5,99)。
- 獨立審查其餘 P2（`nearest()` 與 handles.js 重複、near 光暈在面板開著時不重置、`murkChallenge` 手抄 15 欄、`recordMurk` 手抄 outcome 形狀）**留給 P02／P03 吸收**（P03 會重寫濁靈狀態機，P02 會動 recorder），不在 P01 擴 scope。已修：結果面「+0 XP（本關已拿過更高評價）」假文案 → 濁靈專用一句、分享鍵對濁靈隱藏、HUD 副標改用牠自己的名字、材質快取（WORLD E16）＋殼只畫正面、`keepSolid` 註解改實話。

## v1.2 · P02 的發現（2026-08-18）

- **「安撫」的判定要跟評分引擎一致**：引擎有部分得分（一列 0.75），若「安撫」只算整條全過的列，會出現「量表過線、印章寫沒過」。定案：`calmed = 這一次 evaluation.passed || 累積命中權重和 ≥ pass`；結果卡的印章／量表／教練／fails 一律看**這一次**，濁靈的累積狀態放在**一行**（`[data-murk-newly]`）——誠實、不打架。「存了 grade ＝ 安撫過」是唯一的安撫旗標。
- **濁靈 XP 也要 `refreshUnlocks()`**：原 spec 寫「不觸發」是為了不讓濁靈污染關卡分母，但等級升了閘門不重算會卡玩家（HUD 說 Lv.3、閘門仍鎖）。定案：與其他 XP 寫入者一致，升等即重算並宣告解鎖；`bestGrades`／`collected`／`skillsV2` 仍不碰。roadmap／task_plan 契約文字已同步。
- 審查 P2 留待後續：`gainLine` 已抽共用；`STATS142` e2e 快照字串已統一；`murkCount(ids)` 只數 murks.json 裡存在的 id（改名／刪除不會讓圖鑑數字超過 8）。
- 給 P03 的契約：`recordMurk(challenge, evaluation, meta)` → 13 個 recordResult 同形鍵（grade 在 `bestGrade`）＋ `murk:{ newlyPassedIndices, hits, score, total, calmed, newlyCalmed }`；`hits` 是**已完全命中**的列（部分得分不算殼剝落，但可經 attempt-pass 安撫）→ P03 剝殼只看 `newlyPassedIndices`，安撫時剩下的殼一律轉「餘殼」。

## v1.2 · P03 的發現（2026-08-18）

- 演出的計時器要**夾 dt**：這台機器的 e2e 是軟體渲染（一幀 0.2–0.4s），不夾的話 0.6s 的剝落只剩 2–3 幀、閃白根本看不到；分頁切走再回來也會一口氣跳到終態。定案 `min(dt, 0.1)` 只給演出計時器，移動／碰撞照舊。
- 「第一次走近」的偵測不能綁 `aware`（aware 含 `!busy`）——否則開關面板＝重新走近，濁靈會在每次沒過之後又吼一次。看距離。
- 進度重置（設定頁）不會重載頁面，世界端所有「單向」的視覺狀態（隱藏的殼、清燈）都要有 reset 路徑，否則存檔空了、世界還是舊的、下一次 strike 變 no-op。這條對之後任何「世界會記住玩家做過什麼」的東西都適用（P05 時辰、P08 星圖、P15 秘密…）→ 記進 WORLD.md 檢查表（P04）。
- `onRubricHits` 契約：**四鍵**（challenge／passedIndices／newlyPassedIndices／total）為底；`kind==='murk'` 多帶 `murk` 子物件（recorder 的回傳）；P09 接石座時只用四鍵。
- 審查工具的可用性成了瓶頸（Codex 額度、Claude session 上限各中斷一次）：`/code-review` 五個角度只跑完一個。已把跑完的那個角度全部處理；其餘角度（移除行為稽核、跨檔追蹤、慣例）等 P04 開工前若額度恢復再補一次針對 P01–P03 的總審。

## v1.2 · P05 的發現（2026-08-18）

- **時辰的 hour 0 必須逐值等於舊畫面**——這是「不倒退」在視覺上的實作方式：所有映射（星 uOpacity／uScale、月亮方向、月相 disc/halo、極光乘數）都以 hour 0 為錨點做分段線性，e2e 開機時逐值比對；之後任何動天空的 phase 都照這個做法。
- 月相不能用「咬掉」：disc／halo 是加法混合的 sprite，暗色 sprite 減不掉、天空色的遮罩會在 halo 上切出硬邊 → 改用 disc／halo 的 scale＋opacity 交叉（「越滿越亮、暈越寬」），零新 sprite。
- 月亮降到地平線時**陰影光源不能跟著降**（掠射角→acne／拉長條紋）：sprite 走 alt、DirectionalLight 仰角地板 22°、bias 隨 sin 比放大。
- `composeMood` 只接 number／`#rrggbb`，其他顏色型別要透傳、缺鍵要省略——否則 P06 色彩腳本丟 `THREE.Color` 進來會變全黑。
- 測試不要 pin 原始碼逐字（`n = null`、縮排、箭頭函式換行）與絕對光源數；驗行為與「前後不變」。

## v1.2 · P06 的發現（2026-08-19）

- **退路要「逐鍵」不能「整組」**：色彩腳本某一列的一個色打錯時，原本會讓整區的 fog／tint／hemi／exposure 全退回中央高原——比它想守的那件事（天空）更嚴重的倒退。定案：氣氛永遠來自該區自己的 `REGION_ATMOSPHERE`，驗不過只退那一個鍵（sky→基準、key／rim／particle→null）。**這條適用於之後每一個「資料驅動的視覺層」**。
- **資料不能當自己的驗證者**：`validateColorScript()` 原本讀 json 裡的 `base`／`tolerance`，改壞 json 就自動全過。改用模組常數，json 的 `base` 只當可讀複本、對不上算警告。
- **知識式門也要能「暗」**：三態原本只看 `requires.region`（只有 4 道鏈式門有），其餘 6 道知識門永遠琥珀＝三態塌成兩態。改成讀 `knowledgeGaps` 指到的區（技能所在區／`regionSkills`／`masteredAny: N` 用「已解鎖區數」判定）。`progression` 的 gap 順手帶 `regionId`。
- **琥珀不能借用暖金**：WORLD.md §2.2 明訂「暖金只留給成就熱點」，「可以先行前往」不是成就 → 新增 `PALETTE.invite #a8865c`。之後任何「邀請／提示」類的顏色都用它，不要動暖金。
- **lerp 要會「到位」**：`x += (t−x)*k` 永遠差幾個 ulp，`!==` 判斷會讓每一道門每幀都在追。逐通道 <1e-3 就貼上並設 `visualSettled`——與 P05 的 mood snap 同一套規矩。
- **節奏稽核的樣點要去重**：路網線段共用端點，1090 個樣點裡只有 880 個是唯一座標，死區段在交叉口被切成好幾段（68 段 → 合併後 12 段）。不去重的話「死區只准變少」這條規則會被端點位移騙過去。

## v1.2 里程碑 A 閘門 · 站長回覆（2026-08-19）

- **裁決：改（不是砍）。** 站長實玩後第一個回饋：**「濁靈的遊戲內容，也是讓使用者用選的，不要打字。」**
- 原因（設計面）：濁靈是**地圖上的遭遇**，節奏要短、要能連續遇到；每遇到一隻就自由書寫一整段 prompt 太重，與「遭遇 → 出招 → 打中」的節拍不合。石座那 142 關本來就有十一種**選擇式**作答文法，濁靈卻因為「沒有 flow」被主控台自動退成自由書寫（`console.js:2118` `content.flow(id)` 找不到 → free）——這是實作的副作用，不是設計決定。
- 處置：新增 **P06b · 濁靈的選擇式作答**（見 roadmap／task_plan），濁靈補上 `choice` 題型的 flow（**slot 數 ＝ rubric 條數 ＝ 殼數**，一段對一層殼），並照既有設定 `promptMode` 走（預設 guided ＝ 選；玩家自己切 free 仍可自由書寫，不倒退）。
- 閘門 A 其餘問題（時辰／顏色／三態是否讀得出進度）站長尚未回覆 → **P06b 做完仍停在閘門 A**，等站長再玩一次。

## v1.2 里程碑 A 閘門 · 站長回覆 ②（2026-08-19）

- **「區域顏色我看不出來、閘門三態我也看不出來。我以為顏色要豐富一點，其實是路上的物件要多一點？」**
- **查證：站長是對的，而且比想像嚴重。** 課程 v2 之後加的 **7 區反應物 0、器物 0**：forms／toolcraft／wards／refinery／frugality／sight／divergence 全部掛零；原本的 5 區每區 8–12 件（foundations 12、其餘 8）。P06 節奏稽核的 micro 死區（sight 75m、forms 72m、toolcraft 67m 連續沒東西）指的就是這件事——那些區只有石座與地標，中間全是空地。
- **「顏色看不出來」與「路上沒東西」是同一個問題**：區域色主要靠**物件**顯色（`key` 補光、`rim` 道具自發光補色、`particle` 螢火色）。7 區沒有物件 → 沒有東西可以上色。加上 P06 為了不倒退刻意讓 `fog`／`tint` **逐值不變**（那兩個本來就分區了），P06 實際只動到天空穹頂，夜裡 ±12° 色相天生細微。→ **先補物件，顏色自然會浮出來**；天空偏移要不要放大，等有東西之後再評。
- **閘門三態看不出來**：門立在橋中央，玩家多半還沒走到橋上；emissive 0.6／0.35／0.12 在夜裡遠看差異小。同樣先不調——等路上有東西、玩家真的會走到橋邊再看。
- **處置**：新增 **P06c · 把 7 個空區的路填滿**（roadmap 插在閘門 A 之前）。這也把里程碑 C 的精神（先量再放）提前——節奏稽核在 P06 就備好了，正好當靶。里程碑 B（殘頁／星圖／石座演出）往後挪一輪。


## v1.2 · P06c 的發現（2026-08-19）

- **「顏色看不出來」的答案是物件，不是顏色。** 補完 7 片空區的 22 件反應物與 22 件器物之後，
  同一組 `key`／`rim`／`particle` 立刻讀得出來：量器坊冷錫綠（key `#c2c79f`）、契約鍛冶場暖褐
  （`#c8977c`）、觀象臺冷藍紫（`#b0c0e6`）—— 三張截圖擺在一起是三個顏色。P06 沒動 `fog`／`tint`
  是對的（那兩個本來就分區了）；缺的一直是「有東西可以被那盞補光打到」。
  **推論**：之後再遇到「某個視覺層看不出來」，先問「那一層打在什麼東西上」，不要先調數值。
- **「離石座 ≥12」在三片土地上無解。** 那個 12 是 P01 給濁靈（互動半徑 5.5）訂的；器物只有 3.2、
  反應物根本不搶 `E`。分歧之廳（半徑 29 站 10 座）、護欄崗（半徑 27 站 6 座＋地標）、
  觀象臺（路網貼著橋頭與坡緣）0.5 公尺網格全區掃過**一個點都沒有**。
  處置：例外表 3 條、每條寫理由（同 P01 的規矩），退到的值仍大於既有規則（7）。
  **推論**：淨空半徑要跟著**那一層自己的互動半徑**走（`r_marker + r_layer`），
  把別層的保守值整批套過來會把小東西擠出地圖。
- **`place()` 有一條 keepClear 攔不住的退路。** `buildRegionProps()` 的 `place()` 試 8 次都撞到淨空區時，
  會**直接回 `{ x: site.x, z: site.z + radiusMax }`** —— 那個落點不再檢查 keepClear。
  所以「器物旁邊 5.5 公尺留白」不是保證：實測有 4 件器物的四周 20 個方向只有 16 個走得到。
  這一輪是靠**搬器物**繞過去的（既有斷言 `free >= 18` 一條都沒放寬）。
  **待辦**：`place()` 應該在退路上也挑一個離淨空區最遠的點，而不是回一個固定座標（留給後續 phase）。
- **擺位不能只驗中心點。** 音石列是一排 5 顆、每顆自己一個觸發點，中心合法不代表整排合法
  （第一版 divergence 的第一顆落在 coverage 0.84 的坡邊）。新增了「每一顆都 `isWalkable` 且不埋在石頭裡」的斷言，
  9 列全部要過。**同樣的問題會出現在任何「一個 id 對應一排東西」的資料上。**
- **e2e 有一條「四周走得過去」的線，rubric 以前沒有。** 反應物那一層原本只有 e2e 在量
  （半徑 2.0 的一圈 16 個方向至少 13 個沒有碰撞體），rubric 只驗中心點 —— 所以一個被道具圍住的落點
  要等 15 分鐘的 e2e 才會紅。這一輪補進 rubric（器物那條 18/20 本來就在 rubric，反應物這條漏了）。
  **通則：e2e 量得到的幾何條件，rubric 也要量得到；e2e 只該負責「真的按得到、真的動了」。**
- **重整之後標題卡會擋在前面。** 新的 e2e 段落接在一次 `reloadPage()` 後面時，標題卡是開著的、
  角色不接操控 —— `teleport` 之後永遠等不到互動提示（逾時 30 秒才報）。
  新增段落如果前一段做過重整，第一件事是把標題卡按掉再清場面（既有的鍵盤段落本來就這樣做，
  只是那條規矩沒有寫下來）。
- **截圖腳本要驗鏡頭有沒有埋進地形。** 鏡頭在角色後面 7.5 公尺 —— 站在階梯狀地形（量器坊）的下一階時，
  那個點會卡進上一階裡，拍出來是一片黑，而「檔案大小 > 20KB」完全攔不住（那張黑圖 122 KB）。
  `shots-regions.mjs` 改成量 `camera.y - terrainHeight(camera.x, camera.z) > 0.8`。

## v1.2 · P06c 的發現（2026-08-19）

- **「拿掉那批東西再蓋一次世界」不是有效的基準**：`handles` 同時餵給 `keepClear`，而程序化擺放 `place()` 每被退一次就多抽兩次亂數 → 少了 22 件器物，整片土地的道具佈局亂數流就位移（實測 forms／toolcraft／divergence／refinery／frugality 的 `props:*` 都不一樣）。等於在驗一個永遠不會出貨的佈局＝**假保證**。正解：對真的會出貨的世界驗，只把「它自己」那組碰撞體扣掉（`clearExceptSelf`，中心 <1m 都算自己——一件器物常由好幾塊組成，絞盤就登記三顆）。**這條對之後任何「先量再放」的 phase 都適用。**
- e2e 的「站遠一點看有沒有提示」不能寫死 `+26,+26`：實測 7 區有 6 區會掉進虛空、甚至掉出 ±170 的地形網格，斷言是**從地圖外通過的**（還會誤觸跨區的進區演出）。改成 `farWalkablePoint()`：繞圈找 22–34m 之間第一個 `coverage>0.9`、`regionAt` 仍是同一區、`isClear` 的點。
- 課程 v2 後加的七片土地本來一件會回應的東西都沒有——這件事在 v1.1 就存在，直到 P06 的節奏稽核把它量出來、站長實玩把它講出來才被發現。**「先量再放」的工具要早做**：它讓「感覺怪怪的」變成「forms 有 65 個樣點離最近的微觸 >45m」。

## v1.2 執行政策變更：閘門不再停下（2026-08-19 · 站長指示）

- 站長：**「直接一路做到完成，我最後驗證。」**
- 生效範圍：里程碑 A（已完成兩輪回饋修訂）之後的**所有**閘門（B／C／D／E）。
- 新規則：走到「▶ 閘門」時，**照樣把閘門摘要寫進 `progress.md`**（本里程碑新增了什麼、建議實玩路線、風險與砍案條件），但**不停下**，直接接下一個 phase。站長在**全部做完之後**一次驗收。
- 不變的部分：每個 phase 仍然要 rubric／playtest／build／e2e 全綠、console error 0、獨立審查（`/code-review high`，Codex 額度恢復後改回 `/codex review`）、WORLD.md 檢查表、三件組與 changelog、逐 phase commit＋push `dev`。**護欄與鐵則一個字都不放寬**。
- 風險（站長已知並接受）：沒有中途的體感回饋，設計偏差會累積到最後才被發現；補償做法是**每個里程碑的閘門摘要照寫**，讓最後驗收時有一條可回溯的路線圖，且每個 phase 的砍案條件都留在 roadmap 裡。
- 仍然會停下請示的情況（不變）：護欄衝突、要動 `curriculum.json`、需要新資產授權、三種方法仍卡住的錯誤。

## v1.2 · P07 的發現（2026-08-20）

- **揭示節拍的 class 是「別名」不是「數字」**：`.reveal.d1–d4` 是 `--i` 的別名，寫 `d5` 沒有對應規則就等於延遲 0——結果「獎勵」搶在「內文」前面亮。新增揭示層級時要同時補 CSS，不能只寫 class。
- **新增一層路上的東西就要餵進 `pacing-audit`**：P06c 才把死區數升級成硬斷言，P07 的 24 頁殘頁沒進 POI 表 → 下一個 phase 會照著過期數據決定要把中景放哪。補進去之後 mid 死區 1 段 → 0 段。**慣例：新資料層若擺在路網 12m 內，同一個 phase 就要更新 `pacing-audit.mjs` 的 POI 集合。**
- **`firstPrompt` 的擷取點**：序章其實沒有自由書寫（全是石碑刻印），所以實作成「序章第一次送出」＋「自由書寫模式送出」兩個入口，且 `captureFirstPrompt` 寫一次就鎖。存的是**玩家原文**（未轉義）→ P22 顯示與分享前一定要 `esc()`。
- e2e 的「換區時序」三條（HUD／配樂切到觀象臺）在這台機器上是既有 flake，重跑一次即綠；`headless-check` 被外部 SIGTERM 中斷時**不會清掉自己的 process group**（留下 vite 5199＋headless Chrome），下次開跑前要先確認沒有孤兒。

## v1.2 · P08 的發現（2026-08-21）

- **回聲要「延後說」不是「先說」**：世界裡值得說一句話的時刻，畫面上通常同時正要開一個面板（撿殘頁、讀碑、看結果都是先觸發事件再 `openPanel`）。當場說＝下一幀就被 `isBusy` 收掉，玩家一個字都看不到。定案：`echo()` **一律只記著**，由 `update()` 在面板收起來的那一拍補說；冷卻中直接丟棄（不排隊嘮叨）。**之後任何「事件 → 一句話」的通道都照這個做法。**
- 四廠的世界化只動 UI：星圖是純 DOM／SVG 的星點與連線，**世界層文案零公司名**由 rubric 硬 grep 守著（白名單只有圖鑑出處列、星圖說明、成就頁）；`curriculum.json` 的 vendors 一個位元組沒動、隱藏成就的判定也沒動。
- 這台機器同時跑多個 agent 時 e2e 明顯不穩（renderer 掛掉、接到別的 browser）。慣例：**開跑前先確認 9333／5199 沒有孤兒、清掉 `/tmp/promptasy-e2e-*`**；被外部中斷的 `headless-check` 不會清自己的 process group。

## v1.2 · P09 的發現（2026-08-21）

- **「借用別的模組的物件」要有還回去的單一入口**：光柱（`marker.beacon`）是石座自己的東西，演出只是借它的 `scale.y`／`position.y`。借用點必須集中成一組（`beaconScale0`／`beaconY0`／`beaconBorrowed`），**換石座、reset、切低畫質、演完**四條路都要還回去——漏一條就會看到一根卡在收短狀態的光柱。
- **先驗證再破壞**：任何「換目標」的 API（`play(新目標, …)`）都要先確認新目標**真的有東西可做**，再去拆掉舊目標的狀態。否則「什麼都沒做」的呼叫會產生副作用。
- **粒子是舞台的區域座標**：舞台一搬，沒收乾淨的粒子就會瞬移。凡是「整組搬位置」的演出層，收尾一定要連粒子一起收。
- `reducedMotion` 的判準是「**位移**要拿掉、**回應**要留著」：透明度、亮度、顏色照亮；縮放與移動一律直接到終態。這一條在同一支檔案裡也要**逐段**檢查，不能只做一半。
- **沒人呼叫的 dispose 函式是陷阱**：模組層的共用快取被任何一個實例釋放，其他實例就從畫面上消失。要嘛做成逐實例 `dispose()`、要嘛明講「刻意沒有」。
- 字型 manifest 的 `corpusFiles` 會與 `corpusHash` 脫節（新檔沒帶新字時 hash 不變、指紋測試抓不到）→ 新增 `src/**` 檔案後仍要 `npm run fonts`。

## v1.2 · P10 的發現（2026-08-21）

- **新的獎勵一定要接上既有的防作弊面**：`最少技巧達成` 一開始只看技法數，於是 39 關可以「按範例 → 貼上 → 送出」直接拿。凡是掛在「大師層」那一排的東西，都要走 `masterSealFor` 同一套規矩（看過範例／快速填入／提示球一律不算）。
- **舞台原點的地面高度不代表四周**：石座正中央的 `terrainHeight` 只說明那一點。任何散開超過 2 公尺的演出道具都要**各自取自己腳下的高度**；地形太陡時「那一件不出現」比「硬擺在半空」好。單元測試也要逐座驗，不能只驗舞台區域座標（那永遠會過）。
- **數字的「好方向」要跟文案一致**：分數越高越好、字數與技法數越少越好。三軸都寫「第 N 百分位」會讓囉唆的答案看起來像贏了，還跟下一行的徽章互相打臉。
- **揭示節拍要依「實際有出現的東西」順排**，寫死 index 會在某些分支留下 3–4 拍的空白（同 P07 的 `.reveal.dN` 教訓，這次是另一種形態）。
- 這台機器負載高時，e2e 裡**帶長時間閒置的斷言**（50 秒導航提示）整段會失敗；load average 11 那一輪 9 條紅、降到 4.5 之後全綠。判斷 flake 前先看 `uptime`。

- **「只在中心取一次地面高度」會一路犯到中觀層**：P10b 是石座四周的短牆，P11 是母題的三階——凡是散開超過 2 公尺的東西都要**逐塊貼自己腳下的地**。中觀層更危險的是：浮起來的塊會被 `listSubstantial()` 的 `FLOAT_MIN` 當成「從底下走過去」而豁免，**穿模稽核因此看不到它**（P11 的 `twice-01` 整座 0 塊被稽核到）。所以貼地要有**獨立於稽核**的斷言。
- **中觀層的座標不能只用離線幾何算**：母題進 `keepClear`，移動它會讓程序化道具整批重擲 → 「四周走得到」這種問題只有**真的把世界重建一次**才量得到。世界建一次約 0.5 秒，所以正解是寫一支「改資料 → 重建 → 量」的迴圈去搜，不是憑幾何猜。
- **`.find()` 在測試裡等於一顆地雷**：`BRIDGE_LANES`／`CORRIDORS` 都只含主區，附屬區回 `undefined`；下一行解參照就是 `TypeError` 把**整支測試打掛**，而不是紅一條。測試裡的查表一律守衛＋補一條「找得到」的斷言。
- **唯讀 getter 上的指派在非嚴格模式是靜默的**：e2e 透過 `Runtime.evaluate` 跑非嚴格 IIFE，`player.cameraYaw = …` 不會丟例外、也不會生效——整段「面向某方向走過去」於是變成不會失敗的裝飾。要改變玩家狀態就用**真的輸入**（按鍵）並輪詢到條件成立。
- **寫得出來的斷言不等於抓得到東西**：`!pointInBand(band, x, z, 0)` 看起來像在驗穿模，但碰撞半徑本來就把人擋在中線 1.32m 外、半厚只有 0.7 → 它**永遠成立**。新斷言先問一句「什麼情況下它會紅」，答不出來就不是斷言。
- **「不屬於任何一片土地」的那些地方要自己想清楚**：橋面夾在兩片土地的半徑之間，`groundBlend()`／`regionAt()` 都不認它，但它的 `coverage` 是 1.0 —— 於是「虛空就壓暗」那層保護也不會生效，任何「找不到就退回預設」的寫法都會在那裡留下一條硬邊。地圖上凡是有「兩個系統之間的縫」，就要有第三個系統負責那條縫。
- **同一個量不要在兩個地方各加一次**：粒子的高度在建構時散一次、在 `update()` 又加一整個 span，天花板就變兩倍（宣告 12m、實測 25.9m）。凡是「起點隨機 ＋ 每幀位移」的東西，隨機要嘛給起點、要嘛給相位，不能兩邊都給。
- **量「離地多高」要量離出生那一點的地面**，不是腳下當下那一點：橫向漂移會把粒子帶到坡下，那是地形的起伏，不是它自己飄的——量錯基準會讓斷言在陡坡上假紅、在平地上假綠。
- **常數要是真的拿去比的那一個**：`CULL_M = 120` 但程式比的是 `CULL_M + 60` —— 調它不會生效。兩份真相裡有一份沒作用，比沒有更糟。
- **驗證訊息的格式可能就是 API**：`loadColorScript()` 靠 `${id}.${key}: …` 這個格式認出壞的是哪一鍵再逐鍵退回；少寫 `.鍵名` 的那一條就默默失去了保護，`hasColorScript()` 說壞了、值卻照樣交出去。
- **會隨機器速度變動的量不要拿來當斷言**：e2e 那條「排隊中的音檔 ≤4」量的是這台機器抓得多快（24 支音效本來就是刻意一起抓的），load 高就必紅。要守的是「別把 12 首配樂排進去」→ 就去量佇列裡的配樂支數。找不到與速度無關的量法時，寧可為它加一個 debug 欄位。
- **取樣式的「證明」要講清楚自己的解析度**：`standR` 一圈一圈往外量，兩圈之間沒有取樣點 —— 步長 0.4 就會漏掉 0.28 公尺的環狀缺口，然後**理直氣壯地說那一圈是平的**。這種量法要嘛把步長壓到「漏掉也不影響結論」的尺度（0.15 < 玩家半徑 0.62），要嘛在文件裡明寫它量不到什麼。
- **「最高的那一面」不等於「人站的那一面」**：有頂蓋的平臺在同一顆碰撞圓裡有兩個上向面。剪影的頂給稽核看，腳踩得到的那一面給玩家看 —— 一個欄位扛兩件事，兩件都會講錯。
- **一個欄位一個意思**：`top`／`standTop`／`standR` 拆開之後每一條斷言都問得清楚；合在一起就會出現「這個 3 到底是高度還是半徑」。同理，同一列裡不要一半是離地、一半是世界高度，欄位名要看得出單位。
- **`Math.min` 寫的「全程都…」是假斷言**：最小值早就被起始條件保證了。凡是「整段都 X」的斷言，量的一定是**最差的那一次**。
- **測試裡的搜尋條件與判定條件要一致**：落腳點搜尋接受到 `r + 4`、下一行卻用 `1.6` 判生死 —— 內容一改就變成硬失敗。搜不到合格的就換候選，不要讓整支測試紅。
- **假的時間也會被真的迴圈打斷**：e2e 手動餵 `nudge.update(20)` 三拍看起來是純確定性的，但真正的遊戲迴圈同時也在用真實 dt 呼叫同一支——機器一忙就有別的提示先占走位子。餵到條件成立為止才是對的寫法（這就是那個「load 高必紅」的長年 flake 的根）。
- **「叫什麼名字」不能當「在不在那個狀態」**：跳躍狀態機拿 `standing`（哪一顆可站立體）當成「站不站著」用，而全世界 180 顆可站立體裡只有 1 顆登記過名字 —— 於是跳上任何一顆無名石頭，下一幀就穿回地形高度再被脫困保險絲橫向擠出來。狀態用狀態欄位（布林或索引），名字只當標籤。
- **測試的替身也要涵蓋「欄位是空的」那一種**：rubric 的模擬與 e2e 都只餵有名字的平台，所以那個 HIGH 級的 bug 兩邊都看不到。凡是「這個欄位可有可無」的資料，反例就是它的預設值。
- **迴圈邊界不能當斷言邊界**：`for (; tries < 6; …)` 產生的 `tries` 再去斷言 `tries <= 6`，永遠成立。斷言的門檻要比產生它的那段程式更嚴一格。

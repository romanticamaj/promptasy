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

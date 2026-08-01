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

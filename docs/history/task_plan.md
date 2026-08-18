# Promptasy 課程 v2 長時間實作計畫

> 狀態：**ready for execution**  
> 規劃基線：2026-08-01，`dev` @ `86b2d47`  
> 主規格：`docs/design/curriculum-v2.md`；工程護欄：`AGENTS.md`、`CLAUDE.md`、`WORLD.md`

## 0. 終點與完成條件

把目前 27 關／68 技巧／5 區，逐步演進成 **130 座一關一技巧的教學神廟＋12 座應用關／12 區**，保持純靜態、離線評分、官方來源可追溯、鍵盤完整可玩、舊存檔相容、既有內容不刪除。

全案完成需同時成立（**Phase J／R4 於 2026-08-02 逐條驗收，結果如下**）：

- [x] 130 技能各有且只有一座教學神廟；每關 1 主檢查＋最多 1 地基檢查。
      → 142 關 ＝ 130 教學神廟（每座掛得出 `primarySkillId`、彼此不重複）＋ 12 應用關；C1 對全部 130 座成立。
- [x] 12 區與 mission graph 上線；130 教學神廟＋12 應用關可玩。
      → `v2ImplementedRegions` 12、`challenges` 142、`applicationTrials` 12；e2e 實走過。
- [x] 14 種型式的規劃完成，其中 K 期 `disclose` 為選配；未做時必須明確標成選配未實作。
      → 11 種 flow kind ＋ 自由書寫上線；**`disclose` 正式記錄為「選配，不實作」**（四條理由 ＋ 翻案條件在 `findings.md`／`progress.md`）。
- [x] 59 個新檢查器只按需要實作，全部有 good／weak／bad、反作弊及中英 fixture。
      → `CHECK_IDS` 共 **81**（22 原有 ＋ 59 新）；rubric 逐個驗「真的實作了」「真的被某座神廟用到」。
- [x] `src/data/curriculum.json` 保持 byte-identical；新內容有獨立 authored/sourced 資料層。
      → sha256 `53b0ca60…39062` 釘死測試綠（A–J 全期未動）；新內容全在 `authored: "game"` 層。
- [x] `promptasy.v1.save` 舊存檔可讀、reset 正常；新增欄位全 additive 且有 `normalize()` 預設值。
      → R4 種一份舊命名空間 `promptarcade.v1.save` 存檔實測：18 欄逐欄搬過來、4 個新欄位補空陣列、
      閘門與收集不倒退、`resetAll()` 兩個 key 都清乾淨。
- [x] 快檢、playtest、build 全綠；所有新增互動有 e2e，console error 為 0。
      → 見 §5 的 R4 數字。
- [ ] 每一期完成後更新 `CLAUDE.md` changelog、commit、push `dev`；只有 release gate 通過才合入 `main`。
      → **A–J 期一律不由代理 commit／push**（本輪的工作協議明訂不動 `CLAUDE.md`、不 commit、不 push、不合 `main`）；
      變更全部留在工作區，changelog 與 commit 由 repo 擁有者決定。這是唯一一條刻意未做的完成條件。

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

### D1 — 27 關遷移數字 ✅ 已裁決（Phase 0）

`HANDOFF.md` 寫 4 保留／21 改造／2 應用，`curriculum-v2.md` 逐表小計是 **5／20／2**。
Phase 0 已把 §4 逐關表 27 行逐一點名重算：**保留 5／改造 20／轉應用關 2 = 27**，與 §4 小計一致，
`HANDOFF.md` 的 4／21／2 是摘要漂移（文件勘誤，記在 `findings.md`，不改歷史文件、不改資料）。
保留的 5 關：`lost-automaton-03`、`well-of-unknowing-22`、`long-scroll-tower-23`、`oracle-workshop-36`、`priority-stair-42`。
轉應用關的 2 關：`council-envoy-06`、`archive-seal-25`。
機器產生的逐關 manifest：`docs/design/curriculum-v2-migration.json`（由 `test:rubric` 逐行驗證）。

### D2 — `teaches` 兼具教學與收集語意 ✅ 已裁決（Phase 0）

目前 `teaches` 同時控制 UI 教學目標、官方來源、通關收集與 68 技巧覆蓋；直接縮成一條會讓尚未搬家的技巧暫時不可收集。

**裁決（照原推薦做法定案）**：

- 新增單一 `primaryTechniqueId`，Phase A 立刻讓 UI／rubric／教練只顯示主技巧。
  27 關的主技巧已在 manifest 逐關指定，且**彼此不重複**（25 條，2 關應用關為 `null`），測試強制驗證。
- 暫時保留舊 `teaches` 作相容收集清單（manifest 的 `teachesLegacy` 逐字快照），但路徑與測試明確標成 legacy；不得在畫面上假裝一次教了多條。
- B–J 每當新神廟接手一條技巧，就從舊關的 legacy list 移走；到 J 結束完全移除相容層。
- 已完成舊關的存檔保留既有 `collected`，不回收、不倒退。

### D3 — pass 降權公式 ✅ 已裁決（Phase 0）

設計同時寫「每關 pass -0.5」與「總權重 50% 規則不變」，兩者不是完全等價。

**裁決**：採 **literal −0.5**（manifest 的 `passAfter`，逐關記錄），並同時輸出依總權重重算的 `passAfterByWeightRule` 供比對。
兩份矩陣在「權重同時被下修」的關卡上分岔，最大 +0.75 分（`example-hall-11`／`silent-thinker-13`／`long-scroll-tower-23`）。
真正的驗收門不是百分比，而是 playtest 的三道安全閘：**弱起手（starter）仍不過、快速填入／全選對必過、sample ≥ A**；
分岔的那幾關以安全閘實測為準，必要時個別再調，不整批套百分比。

## 3. 分期路線

### Phase 0 — 基線與契約鎖定

狀態：`done`（2026-08-01）

產出（全部完成）：

- 產生 27 關 migration manifest：主技巧、主檢查、地基檢查、移除／降權項、before/after total/pass、`teaches` 相容處置。
- 記錄目前 challenge/flow/kind/checker/region/save/performance 基線，修正文件內已漂移的數字。
- 把 `curriculum.json` hash 加成不可變測試；新增資料不得寫回它。
- 跑一次未修改產品碼的 baseline：`test:rubric`、`test:playtest`、`build`；e2e 依成本策略本期不跑。

主要檔案：`scripts/test-rubric.mjs`、`docs/design/curriculum-v2-migration.json`（新建）、`findings.md`、`progress.md`。
`scripts/playtest-verify.mjs` 本期未改（Phase 0 不動關卡資料，既有 226 個斷言即是 baseline）。

Exit criteria：

- [x] 27 關逐行決策無缺漏（manifest 27 行，id 與 `challenges.json` 逐一對齊含順序，測試強制）。
- [x] D1 有可執行答案：逐關表點名重算 = 保留 5／改造 20／應用 2（`HANDOFF.md` 的 4／21／2 記為勘誤）。
- [x] D2 有可執行答案：`primaryTechniqueId`（27 關逐關指定、彼此不重複）＋ `teaches` 降為 legacy 收集清單。
- [x] D3 有可執行答案：literal −0.5 逐關記錄，並附依總權重重算的對照欄與三道 playtest 安全閘。
- [x] `curriculum.json` byte-immutability 測試上線（sha256 釘死，實測破壞會紅）。
- [x] 12 個既有開場斷言重建成「今天的設計」的斷言，`test:rubric` 全綠。
- [x] baseline 結果（rubric／playtest／build／資料／效能）寫進 `progress.md`，e2e 跳過的理由也寫進去。

### Phase A — 重複度手術

狀態：`done`（2026-08-01）

目標：現有 27 關在玩家面只教一件事，先消除重複感，不新增題型。

變更：

- `src/data/challenges.json`：**一律照 `docs/design/curriculum-v2-migration.json` 的 `phase: "A"` 條目執行**——
  27 關 `assignsTask` 降到 0.5 且標成地基；6 關移除／替換非主題 `specifiesFormat`（5 關換成該關真正的主檢查、`silent-thinker-13` 直接移除）；
  `hasDelimiters` 2→1 **只做 2 關**（`example-hall-11`、`long-scroll-tower-23`）——
  `postbox-sprite-02`／`long-scroll-archive-05`／`thinking-chamber-14` 的分隔符在 v2 逐關表裡正是那一關的主檢查，manifest 已裁決 `hold`；
  pass 依 D3 literal −0.5；加入 `primaryTechniqueId`。
- `src/data/flows.json`：刻印段落與 feedback 同步收斂，不能 rubric 已移除但第三幕仍反覆教它。
- `src/prompt/console.js`、`src/challenges/content.js`、`src/progression/progression.js`：拆開主教學目標與 legacy collection 語意。
- `scripts/test-rubric.mjs`：新增「恰好 1 主檢查、地基 ≤1、assignsTask 不列為主教學、fractional pass 正確顯示」invariants。
- `scripts/playtest-verify.mjs`：27 關 sample ≥ A、全選對必過、weak starter 必不過、已知誤判不回歸。

Exit：27 關全部符合 C1；玩家看到的教學重點只有一條；舊存檔與已收集技巧不減少；rubric＋playtest＋build 全綠。

Exit criteria（逐條實測）：

- [x] 27 關逐關照 manifest 的 `phase: "A"` 條目執行完畢：`assignsTask` 27 關降到 0.5 並標 `foundation`、
      `hasDelimiters` 只降 `example-hall-11`／`long-scroll-tower-23` 兩關（3 個 `hold` 一個都沒動）、
      `silent-thinker-13` 的 `specifiesFormat` 直接移除、5 關的 `specifiesFormat` 權重中性地換成該關真正的主檢查、
      `pass` 全部 = `passAfter`。零偏離（測試逐條比對 manifest）。
- [x] 27 關新增 `primaryTechniqueId`（25 條互不重複，2 關應用關為 `null`），rubric 上恰好一列標 `primary`
      ＝ manifest 的 `mainCheck`（新檢查器未實作時＝`interimMainCheck`）。
- [x] 玩家看到的教學重點只有一條：第二幕只放大主技巧的刻文＋它的神諭原典，其餘檢查降到一行「順手會用到」
      （沒有自己的教學段落、沒有自己的原典）；第三幕的刻痕對照分成「這一關教的／地基／其他」三種位階。
- [x] 第三幕不再教已經不計分的東西：6 份 flow 的格式段落收斂（5 段移除、`silent-thinker-13` 那段改成
      reasoning-02 的「明確成功條件」），27 份 flow 全部選對仍然每一條檢查滿分。
- [x] 收集不倒退：收集照舊由 legacy `teaches` 驅動，27 關的 `teaches` 一字未改，仍然收得滿 68 條。
- [x] 小數門檻在畫面上讀得順：新增 `formatScore()`，進度燈／結果面板／刻痕對照／序章練習台全部走它。
- [x] `npm run fonts`（中文有變）＋`test:rubric`（17,705）＋`test:playtest`（263）＋`build` 全綠；
      `test:e2e` **1,811 項全綠、零 console error**（過程中修掉三個 Phase A 之前就存在的 e2e 中斷／紅燈，
      逐條記在 `findings.md`）。

### Phase B — v2 catalog bridge＋`fix`／`spot`＋foundations 14

狀態：`done`（2026-08-01）— step 1（catalog bridge）＋ step 2（`fix`／`spot`＋foundations 十座）都完成

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

#### Step 1 — v2 catalog bridge ✅ done（2026-08-01）

只做「資料 ＋ loader ＋ 去硬編碼」，**玩家看到的東西一個像素都沒變**（新七區只在資料層，`implemented: false`）。

- [x] `src/data/skill-codex-v2.json`：130 條技能（id／中文名／英文短名／tier／區域／先修／`masterRefs`／
      `sources`／`legacyTechniqueId`／`oneLiner`），445 筆官方出處**逐條解析自 master list 的「出處」欄**
      （測試逐條回查，自撰摘要在結構上無法冒充官方引文）。
- [x] `src/data/regions-v2.json`：12 區（既有五區 id／名稱／顏色沿用 curriculum，新七區 `implemented: false`），
      技能數加總 130；`gate` 是 v2 知識式軟門檻的**規格**，尚未啟用（現行解鎖仍由 `REGION_GATES` 決定）。
- [x] `src/challenges/catalog.js`：單一 loader，建構時就驗（重複 id／先修不存在／成環／非 https 出處／
      無出處又無誠實說明／區域加總／已上線區域必須等於 `curriculum.groups`）→ 不合就丟例外，不安靜降級。
- [x] 去硬編碼：`main.js`、`content.js`、`progression.js`、`ranks.js`、`ranks.json`、`codex.js`、
      `settings.js`、`achievement.js` —— 區域與技巧的列舉、隱藏成就與稱號門檻全部改由 catalog 現算
      （`ranks.json` 最高階稱號的 68／5 改成 `"all"`）。
- [x] 去硬編碼測試：`test-rubric.mjs` 與 `headless-check.mjs` 的 68／5／3 kinds 改成 catalog 推導；
      真的是契約的數字（27 關、130 技能、12 區、5 區已上線、找不到出處 ≤3）登記進 `scripts/expected-counts.json`。
- [x] 新增 rubric 區段「課程 v2 runtime catalog」：資料契約 ＋ 出處回查 ＋ 新舊對照 ＋ **行為中立**
      （catalog 版與 legacy 版的列舉逐欄相同）＋ 8 條 fail-fast 破壞測試。
- [x] 驗證：`fonts`（語料 58 檔／CJK 1664 字／1348.4 KB）、`test:rubric` 17,705 → **21,393**、
      `test:playtest` 263（未改）、`build` ✓、`test:e2e` **1,816 項全過、零 console error**。

#### Step 2 — `fix`／`spot` ＋ 撰寫基本功十座 ✅ done（2026-08-01）

- [x] `src/prompt/fix.js`（改碑）：預填弱稿、畫線的句子可攤開替代寫法、純鍵盤 roving focus、
      即時預檢、**三段式 `Esc` 還原**（收起選項 → 還原已改好的句子 → 才冒泡收面板，逐段 `aria-live`）、
      正解可以是「整句拿掉」（那就是 P2 的「轉」）。
- [x] `src/prompt/spot.js`（點碑）：石籤 toggle、方向鍵＋`Enter`、正確／漏選／多選都只教學不扣分、
      壞石籤可帶改寫版或直接拿掉、挑完之前手掌印不出現。
- [x] `console.js` 擴 `FLOW_KINDS` 3 → 5、label、board lifecycle、`flowKindOf()`；
      **相容契約未變**：缺 kind／未知 kind／資料不合契約 → 一律回到石碑刻印（rubric ＋ e2e 各守一次）。
- [x] `challenges.json`／`flows.json` 新增 **10 座**（撰寫基本功 6 → 16 關，curriculum-v2 §3 的
      foundations 14 座教學神廟到齊）；每座含四拍、素材、起手弱寫法、快速填入、示範解答
      ＋ **石碑刻印後備 slots**；`source` 逐條回查 `skill-codex-v2.json` 的真實官方連結。
- [x] **5 個新檢查器**（§7.4）：`noUndefinedReference`／`statesScope`／`avoidsPressureLanguage`／
      `disambiguatesTerms`／`namesComponents`，全部結構性偵測 ＋ 中英雙語 ＋ good/weak/bad ＋ 反作弊
      ＋ `coach.json` 白話教學（實測「照著填就會亮」）。
      （`rulesBeforeData`／`usesRareDelimiter` 這一期**沒有**實作 —— 它們掛在既有兩關身上，
      要連同那兩關的改造與 manifest 一起動，理由記在 `findings.md`。）
- [x] 存檔：新增 `skillsV2[]`（純加法、`normalize()` 補預設、去重；通關時與 legacy `collected` 兩邊各寫各的）。
- [x] 世界：十座新石座落在撰寫基本功區，走既有的落點／淨空／碰撞／可行走性門檻。
      **順手修掉一個馬上要爆的預算**：石座的燈由「一座一盞」改成常數 8 盞的燈池
      （27 → 37 座之後實測 59 盞 > 56；改完 26 盞，而且燈數不再隨關卡數成長）。
- [x] `styles.css` ＋ e2e：鍵盤、焦點、`aria-live`、`prefers-reduced-motion`、820px 無水平溢位。
- [x] 驗證：`fonts`（語料 60 檔／CJK 1696 字／1365.8 KB）、`test:rubric` 21,393 → **25,877**、
      `test:playtest` 263 → **396**、`build` ✓、`test:e2e` 1,816 → **1,920 項全過、零 console error**。
      新斷言逐條先紅後綠（rubric 3 次資料／程式碼破壞、e2e 1 次題型契約破壞，逐項記在 `progress.md`）。

Exit criteria（逐條實測）：

- [x] foundations 有 **14 座教學神廟**（＋1 應用關 ＋1 主題待搬家的 `mimic-mirror-04` ＝ 16 關）。
- [x] `fix`／`spot` 各有一條**先紅後綠**的完整鍵盤 e2e（開關卡 → 第三幕 → 挑錯不失敗 →
      `Esc` 契約 → 做對 → 手印 → S → 石座轉已通關 → 技能入袋 → 存檔）。
- [x] 舊三 kind 行為不變（27 關仍是 choice／order 2／workshop 1，資料一個位元組沒動）。
- [x] fonts＋rubric＋playtest＋build＋e2e 全綠。

### Phase C — `induct`／`tradeoff`＋reasoning 15

狀態：`done`（2026-08-01）

- 以 choice 變體實作推規與雙面碑，不另造重型架構。
- 正解可依模型卡／素材加權，但兩個可行答案都必須收到誠實回饋。
- reasoning 補 10 座；few-shot 的規則歸納先做最小垂直切片。
- 新 checker 只開本期所需，全部有反作弊 fixture。

Exit：reasoning 15 座、同區不得連三座同型、推規的第四例真的驗證規則、tradeoff 不把取捨教成假通則。

Exit criteria（逐條實測）：

- [x] **示範與推理 15 座教學神廟**：既有 5 關照 manifest 改造（`example-hall-11`／`lantern-rows-12`／
      `silent-thinker-13`／`thinking-chamber-14`／`effort-forge-15` → `fewshot-basics`／`fewshot-consistent`／
      `reason-keep-simple`／`cot-separate-answer`／`knob-effort`）＋ 新蓋 10 座；
      15 條技能一對一、無重複（C2），且這一區的 15 條 v2 技能全部有神廟了。
- [x] **`induct`（推規碑）**：`src/prompt/induct.js` —— 牆上的對照一組一組浮出來，猜錯只會
      「牆不回應 ＋ 就地教學」，想通之後回到**同一份資料的 `slots`** 刻印（＝石碑刻印的變體，
      共用 `src/prompt/slots.js` ＋ `palm.js`，沒有另造框架）。
- [x] **推規的第四例真的驗證規則**（資料層強制）：第一輪的正解必須 `follows: 'both'`
      （只看前面推不出是哪一條規律）、最後一輪必須 `validates: true` 且 `reveal === examples.length - 1`、
      驗證輪的正解 `follows: 'true'`、且**一定有一個 `follows: 'naive'` 的選項在畫面上、不是正解、
      並帶 ≥20 字的教學回饋** —— 猜錯的人拿到的是教學，不是運氣。
- [x] **`tradeoff`（雙面碑）**：`src/prompt/tradeoff.js` —— 兩面都會前進，兩面都收到誠實判詞；
      沒被選中的那一面只講「這一張卡上要付什麼代價」，測試禁止它被寫成「錯」。
- [x] **不把取捨教成假通則**：每一關的 `favours` 必須**兩面都出現過**（換一張卡就翻面），
      每張卡的兩面判詞都存在、≥12 字、且彼此不同（`isTradeoffFlow` ＋ rubric ＋ playtest 三層守）。
- [x] **同區不得連三座同型（C4）**：示範與推理整區 15 座逐一檢查（induct／choice／spot／choice／choice／
      tradeoff／induct／tradeoff／fix／choice／choice／fix／choice／fix／choice，最長連續 2），並用了 5 種題型。
- [x] **撰寫基本功兩座 `choice` 佔位換成真的雙面碑**：`wordfork-12`（換詞 vs 補定義）、
      `old-tag-store-15`（標籤 vs 井號標題），只換第三幕資料，rubric／出處／文案一字未動。
- [x] **4 個新檢查器**（§7.4）：`justifiesExampleCount`／`labelsNegativeExample`／
      `asksForRationaleNotTranscript`／`asksMultipleSamples`，全部結構性偵測 ＋ 中英雙語 ＋
      good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學（實測照著填就會亮）。
- [x] **D2 語意**：改造的 5 關同時給 legacy 技巧（`teaches` → `collected`）與 `skillsV2`；
      新蓋的 10 座只給 `skillsV2`（舊 68 條沒有祖先）。收集不倒退。
- [x] fonts（語料 63 檔／CJK 1721 字）＋rubric（25,877 → **29,846**）＋playtest（396 → **554**）
      ＋build＋**完整 e2e（1,920 → 2,010 項全過、零 console error）** 全綠。

### Phase D — `constraint`＋grounding/config 補齊＋行動版還債點

狀態：`done`（2026-08-01）— 這是 **R2 release checkpoint**

- 把即時預檢升格為 `constraint` 舞台，不複製 rubric 引擎。
- grounding 與 config 各補到 12 座，完成既有五區課程遷移。
- 此期結束設一個 release checkpoint：評估並實作 ≤720px 的四幕與已上線 kinds 基本版面；不一定做世界觸控移動，但不能讓新題型 UI 無法操作。

Exit：既有五區均符合一關一技巧；constraint 完全資訊；鍵盤與窄 viewport 都走得完；舊 27 關遷移相容層完成第一次清理。

Exit criteria（逐條實測）：

- [x] **合尺（`constraint`）＝把即時預檢升格成舞台，不是第二套引擎**：`src/prompt/constraint.js` 的
      `measure()` 直接呼叫 rubric 在用的 `runCheck()`（測試把註解剝掉之後驗，改壞會紅）；
      每一把尺用白話寫出它要量什麼（P9 完全資訊）、放錯只會「尺暗回去 ＋ 就地教學」（不扣分、不失敗、
      手掌印跟著收回去）、每一把尺都合了手掌印才浮出來。
      **資料層強制「合尺是取捨不是全選」**：全部石片挑上去一定有一把尺是暗的（rubric ＋ playtest 各守一次）。
- [x] **脈絡與長文 12 座教學神廟**（＋1 應用關 `archive-seal-25` ＝ 13 關）：既有 4 關照 manifest 改造
      （`citation-desk-21`／`well-of-unknowing-22`／`long-scroll-tower-23`／`verify-spring-24`）＋ 新蓋 8 座。
- [x] **角色與參數 12 座教學神廟**：既有 5 關改造（`mask-workshop-41`／`priority-stair-42`／`dial-room-43`／
      `four-elements-mirror-44`／`crossroad-scale-45`）＋ 新蓋 7 座。
- [x] **撰寫基本功欠著的兩座補上**：`long-scroll-archive-05`（規則牆 · 🆕`rulesBeforeData`）與
      `postbox-sprite-02`（🆕`usesRareDelimiter`），兩者都換裝成 `order`。
      **既有五區的 v2 化到此完成**（orchestration 依路線圖留到 Phase G）。
- [x] **12 個新檢查器**（§7.4）：`labelsSources`／`anchorsToSection`／`citesInline`／`setsRetrievalBudget`／
      `diagnosesFailureCause`／`allowsNullField`／`ranksInstructions`／`hasStopRule`／`usesOneSkeleton`／
      `namesModelClass`／`rulesBeforeData`／`usesRareDelimiter`，全部結構性偵測 ＋ 中英雙語 ＋
      good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學。
- [x] **C1**：11 關改造後一律收斂成「主檢查 3 ＋ 地基 assignsTask 0.5、pass 2」，rubric 上沒有雜項。
- [x] **C4**：脈絡與長文（fix／choice／order／constraint／choice／constraint／order／fix／spot／choice／spot／fix）
      與角色與參數（fix／order／choice／choice／tradeoff／spot／fix／constraint／order／tradeoff／constraint／tradeoff）
      都沒有連續三座同型（最長連續 2）。
- [x] **行動裝置還債點**：`≤720px` 與 `≤430px` 兩段版面規則上線；e2e 在 **720×900 與 390×844** 兩個
      viewport 逐一開八種題型的第三幕，量到「零水平溢位、可按元素一律 ≥40px 高、沒有 <12px 的字」，
      並在 390px 用真的指標事件把合尺玩到手掌印出現。**世界的觸控移動（虛擬搖桿）明確不做**，理由與
      範圍記在 `findings.md`。
- [x] **manifest 誠實更新**：11 關的 `post-A` 條目改成 `phase: "D"`，Phase 0／A 沒掃到的移除以
      `addedIn: "D"` 標記並逐條寫理由；新增 `phaseD` 區塊（`skillId`／`mainCheck`／`mainWeightAfterD`／
      `totalWeightAfterD`／`passAfterD`／`kindAfterD`／`note`），沿用 Phase C 的 `passAfterC` 慣例。
- [x] fonts（語料 CJK 1750 字／1399.9 KB）＋rubric（29,846 → **37,108**）＋playtest（554 → **816**）
      ＋build＋**完整 e2e（2,010 → 2,157 項全過、零 console error）** 全綠。

### Phase E — 量器坊 `forms`（新地形）14 座

狀態：`done`（2026-08-02）

- 新增第 6 區地形、地標、路網、石座與 soft gate；沿用既有 kind，避免地形與新題型同一期爆量。
- runtime catalog／progression／codex 支援第六區；回答語言缺口以 `system-uses` 的一拍補上，除非 master list 先有獨立可追溯條目。
- 世界成本實測，不採文件舊數字；新地標最多 1 盞實體光，其餘 emissive。

Exit：14 座可玩；碰撞／coverage／淨空／三角形／光源預算全過；舊五區無退化。

Exit criteria（逐條實測）：

- [x] **量器坊 14 座教學神廟**：新蓋 13 座 ＋ 由撰寫基本功搬過來的 `mimic-mirror-04`
      （§3 forms 第 3 列指名的「擬態之鏡」，manifest 新增 `phaseE` 區塊逐欄記錄）。
      14 條技能一對一、無重複（C2），這一區的 14 條 v2 技能全部有神廟了。
      撰寫基本功因此由 16 → **15 關**（`expected-counts` 同步改寫並寫明理由）。
- [x] **沿用既有 kind，不開新題型**（本期指示）：choice 3／fix 4／spot 3／constraint 2／tradeoff 2，
      **整區最長連續同型 2**（C4），共用 5 種題型。§3 指定但屬於後續期別的兩種
      （`len-readable` 的 `multi` → Phase G、`so-basics` 的 `workshop`）以佔位 kind 上線，
      逐條記進 `findings.md` 的 kind-swap backlog。
- [x] **新地形**：`forms` 落在正南 `(0, 124)`、半徑 44（半徑上限由 `buildTerrain()` 的
      340 公尺見方網格決定，測試逐區驗「整片土地都在網格裡」）；地貌是「由北往南一階一階降下去的
      鑄場台階」（`detailFor()` 新增 `forms` 分支，測試驗它真的單調下降且有起伏）；
      橋、閘門、`BRIDGE_LANES`、路網、`REGION_ATMOSPHERE`、`FLORA`、`buildRegionProps` 全部跟上。
- [x] **地標「刻度之柱」**（§二逐字：一根被刻滿量度的斷柱，柱頂懸著一把不動的尺）：高 24、留白 15，
      **一盞實體光源都沒加**（刻度與尺全部 emissive／加色混合，e2e 逐一數過）。
      三組故事小景（倒到一半的那一模／量過就沒再量的桌／溢出來的那一槽）。
- [x] **世界成本實測**（不採文件舊數字）：高畫質 147,032 → **154,868 三角形**（上限 420k）、
      **26 → 27 盞燈**（上限 56；唯一新增的是與其他四片土地相同的「每區一盞主色補光」）、
      碰撞體 608 → **674**（上限 1,400）、mesh 1,374 → 1,528。14 座石座在高／低兩種畫質下
      24 個方向 × 4 段距離全部走得到，正南那條橋的主動線整條無阻擋。
- [x] **知識式軟門檻（C8）上線**：`REGION_GATES.forms` 新增 `knowledge` 欄位，條件逐字取自
      `regions-v2.json`（`clear-specific` ＋ config 任一座），**不看等級、不看前一區通關數**；
      「會了嗎」走 `knowsSkill()`（`skillsV2` 或 D2 相容橋的祖先技巧）。
      閘門說得出還差哪幾條（中文技能名，不露 id），`skippedGates` 先行前往照樣走得通且不給任何進度。
- [x] **runtime 支援第六區**：catalog 的「已實作＝curriculum.groups」硬相等改成
      「以既有五區開頭、後面才接新區」，並強制新區必須自己宣告主色（實測破壞會丟例外）；
      `content.group()`／`groupsOrdered()`、`world` 的 `colorOf`、HUD／toast、
      `progression.regionMastery()`（新區改用 v2 技能算完成度）、圖鑑（新增只列技能的區域卡）全部跟上。
- [x] **回答語言缺口**：master list 沒有獨立可追溯條目，依 §附錄 4 的建議留在 `system-uses`
      （`lintel-words-46`）那一拍，本期不新開技能（理由記在 `findings.md`）。
- [x] **配樂**：量器坊**沒有**音檔。新增 `SYNTH_ONLY_REGIONS` 誠實登記，配一組自己的
      `REGION_MOODS.forms`（根音 103.83、大二度堆疊、最低鐘聲密度），跨區走合成 pad
      （護欄 3）。**刻意不共用別區的音檔**——那會讓過橋聽起來像沒換地方。
- [x] **9 個新檢查器**（§7.4）：`statesFormatPreference`／`hasFallbackCategory`／`avoidsSelfCounting`／
      `saysWhatToPreserve`／`definesToneConcretely`／`bansFillerPhrases`／`definesSchema`／
      `noDuplicateSchemaRules`／`namesDesignElements`，全部結構性偵測 ＋ 中英雙語 ＋
      good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學（實測照著填就會亮）。
      其中三個是**非單調**的，合尺才不會退化成「全選就過關」。
- [x] fonts（語料 CJK **1771** 字／1413.4 KB）＋rubric（37,108 → **42,968**）
      ＋playtest（816 → **1,076**）＋build ＋ **完整 e2e（2,157 → 2,308 項全過、零 console error）** 全綠。
      新斷言逐條先紅後綠（rubric 3 次、e2e 2 輪共 10 條，逐項記在 `progress.md`）。

### Phase F — 契約鍛冶場 `toolcraft` 11＋護欄崗 `wards` 5

狀態：`done`（2026-08-02）— 這是 **R3 release checkpoint**

- 正西新地形＋東北加建；最大化沿用 workshop。
- 補工具描述、時機、順序、缺參數、權限、prompt injection 等 checker。
- 安全題不把 prompt 文字宣稱成真正安全邊界；明確教輸入通道、最小權限與 HITL。

Exit：兩區 16 座可玩；安全敘述有官方來源；不新增不必要光源；所有 workshop 鍵盤路徑全綠。

Exit criteria（逐條實測）：

- [x] **契約鍛冶場 11 座教學神廟**：新蓋 9 座 ＋ 由流程與代理搬過來的 2 座
      （`tool-forge-33` → `tool-description`、`oracle-workshop-36` → `tool-when-not`，
      manifest 新增 `phaseF` 區塊逐欄記錄）。11 條技能一對一、無重複（C2），
      這一區的 11 條 v2 技能全部有神廟了。流程與代理因此由 6 → **4 關**
      （`expected-counts` 同步登記並寫明理由；該區的 v2 化排在 Phase G）。
- [x] **護欄崗 5 座教學神廟**：`inj-concept` / `inj-input-channel` / `inj-lower-risk-shape` /
      `guardrail-hitl` / `redteam`，一對一、無重複。
- [x] **沿用既有題型**（本期不開新 kind）：toolcraft ＝ fix・workshop・workshop・spot・workshop・
      tradeoff・fix・order・fix・spot・fix；wards ＝ spot・tradeoff・fix・workshop・workshop。
      兩區**最長連續同型都是 2**（C4），共用 6 種題型。
- [x] **正西新地形**：`toolcraft` 落在 `(-124, 0)`、半徑 44（量器坊的鏡像，同樣壓在
      `buildTerrain()` 的 ±170 網格內）；地貌是「一張攤開的工作檯」——中央抬高的鍛台
      ＋ 放射狀的工具溝槽（測試驗中央比外圈高、四周真的有溝）。橋、閘門、`BRIDGE_LANES`、
      路網、`REGION_ATMOSPHERE`、`FLORA`、`buildRegionProps` 全部跟上。
- [x] **護欄崗是加建，不是新大陸**：`REGION_SITES` 新增 `annexOf: 'grounding'` 與
      `ANNEX_LINKS`（頸口）——**不生成新的橋**，兩片土地的覆蓋刻意重疊，走出檔案庫北緣
      就到了。重疊處的歸屬由 `regionAt()` 的**正規化距離**決定，閘門就立在那條分界上；
      鎖住時擋的是「地界」而不是一條線，所以**母土地一寸都沒有被吃掉**
      （測試逐關驗過檔案庫 13 座石座的區域判定沒有改變）。
- [x] **兩座地標**：未命名的工具（高 23、留白 15）與不會關上的門（高 19、留白 13），
      **兩座都是零實體光源**（刻痕、鑰匙齒、門縫的光全部 emissive；e2e 逐一數過）。
      五組故事小景（沒有人替它取名字的那一把／擺到放不下的那張檯／沒有人敢動的那一台／
      被拆開讀過的那幾封／沒有人在的那個崗）。
- [x] **世界成本實測**（在 node 裡把世界蓋起來，不採文件舊數字）：高畫質
      154,868 → **168,068 三角形**（上限 420k）、**27 → 30 盞燈**（上限 56；兩盞是那兩區
      各自的主色補光，第三盞是鍛冶場小景裡的一盞燈）、碰撞體 674 → **813**（上限 1,400）、
      mesh 1,528 → 1,790。16 座石座在高／低兩種畫質下 24 個方向 × 4 段距離全部走得到。
- [x] **知識式軟門檻（C8）**：`REGION_GATES.toolcraft`（`agent-approval-bounds` ＋
      orchestration 三座）與 `REGION_GATES.wards`（grounding 三座 ＋ toolcraft 一座），
      條件逐字取自 `regions-v2.json`，不看等級、不看前一區通關數；`skippedGates`
      先行前往照樣走得通且一分 XP 都不加。**護欄崗的門不在橋上**（它沒有橋），
      而是立在加建的頸口上。
- [x] **9 個新檢查器**（§7.4）：`toolNamesDistinct`／`limitsToolSurface`／`statesToolTriggers`／
      `ordersToolCalls`／`prefersToolOverMentalMath`／`limitsToolOutput`／`requiresPreamble`／
      `reshapesToLowRisk`／`includesAdversarialCase`，全部結構性偵測 ＋ 中英雙語 ＋
      good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學。其中三個是**非單調**的
      （呼叫前吐 JSON、一邊收工具一邊又全攤開、又叫它自己心算，一律整條歸零）。
- [x] **安全題不把 prompt 文字宣稱成真正的安全邊界**：rubric 掃護欄崗所有玩家看得到的字、
      e2e 再掃一次實際 DOM，兩層都禁止「這句話就是安全邊界／加一句就擋得住注入」這類宣稱；
      同時**正面驗**它真的教了輸入通道（罕見標籤 ＋「標籤裡只是資料」）、最小權限與人在迴圈
      （可逆自己做、不可逆先問人）、低風險形狀（先提計畫、由人執行）。
      五座的 `source` 逐條回查 `skill-codex-v2.json`，全部是官方安全文件。
- [x] **workshop 最大化沿用 ＋ 文案抽象化**：新增 `WORKSHOP_LABELS` 一層可覆寫的稱呼字典
      （`flows.json` 的 `workshop.labels`）。**沒給就完全等於 Phase 27 的原文**——既有三座
      派工神廟一個字都沒變（rubric ＋ e2e 各守一次）；護欄崗那兩座換成「試門單／內容石／
      權限表」。互動文法、鍵盤路徑、手掌印、評分引擎全部沒動。
- [x] fonts（語料 64 檔／CJK **1790** 字／1423.8 KB）＋rubric（49,477 → **49,756**）
      ＋playtest（1,076 → **1,275**）＋build ＋ **完整 e2e（2,308 → 2,493 項全過、零 console error）** 全綠。
      新斷言逐條先紅後綠（rubric 3 次、e2e 1 輪 4 條，逐項記在 `progress.md`）。

**R3 readiness（2026-08-02）**：8 區／**89 關**（既有 27 關 ＋ 課程 v2 新蓋的 62 座）／
130 條技能中的 **81 條**已經接上自己的神廟（`primarySkillId`）；59 個新檢查器已實作 **39** 個；`curriculum.json` sha256 未變；
存檔 additive、reset 正常；快檢 ＋ playtest ＋ build ＋ 完整 e2e 全綠、console error 為 0。

### Phase G — `multi`＋校驗場 `refinery` 11＋orchestration 收尾

狀態：`done`（2026-08-02）

- 第三幕支援兩輪／多輪，但仍共用同一 rubric、手掌印與不失敗文法。
- 新增預寫中間輸出資料層，全部標 `authored: "game"`，不可偽裝成模型真實輸出。
- 校驗場加建；draft→review→refine、矛盾修復、eval、自評有真正的第二輪體感。

Exit：刷新頁面／切幕／切 mode 不會丟失或串錯輪次；multi 至少覆蓋成功、錯誤、Esc、reduced-motion、鍵盤 e2e。

Exit criteria（逐條實測）：

- [x] **兩輪刻印（`multi`）＝石碑刻印的變體，不是第二套框架**：`src/prompt/multi.js` 共用
      `slots.js` 的刻寫台與 `palm.js` 的結尾，送出的是同一段文字、走同一支離線引擎（護欄 3）。
      **輪次是 `flow.slots` 的一個切法**（每一輪只宣告 `count`，`sum(count) === slots.length`）——
      這條契約同時買到「退回石碑刻印時字一模一樣」「結構上不可能串錯輪次」「測試不必知道題型」。
- [x] **中間那一段輸出是遊戲自撰的，而且畫面上說得出來**：資料層強制 `authored: "game"`，
      回話卡旁邊永遠掛一顆 ⓘ 明講「這一段回話是遊戲自己寫好的示範，不是真的模型跑出來的結果」；
      回話卡不自帶任何連結（教學與出處仍只在第二幕與圖鑑）。rubric ＋ playtest ＋ e2e 三層各守一次。
- [x] **輪次狀態的設計已裁決並寫進 WORLD.md §3.3b 第 9 條**：只活在記憶體裡 ——
      切幕／切模式輪次原封不動；重開這一關一律回到第一輪；**重新整理＝這一關從第一輪重來**
      （誠實地「重新開始」，不為 multi 破例做落地存檔）。**硬要求「不串輪」由結構保證**。
- [x] **第二輪真的在加分**（不是裝飾）：playtest 逐關驗「只刻完第一輪還沒滿分」——
      這條斷言先紅一次（6 座中有 4 座第一輪就滿分），因此把輪次切法改成「第一輪＝先寫一版」。
- [x] **校驗場 11 座教學神廟**：新蓋 9 座 ＋ 由流程與代理搬過來的 2 座
      （`draft-review-wheel-32` → `draft-review-refine`、`echo-workshop-35` → `meta-iterate`，
      manifest 新增 `phaseG` 區塊逐欄記錄）。11 條技能一對一、無重複（C2）。
- [x] **流程與代理收尾到 12 座**：既有 2 關改造（`subtask-workbench-31` → order、
      `irreversible-gate-34` → workshop）＋ 新蓋 10 座。既有五區之外的遷移到此告一段落。
- [x] **C1／C4**：23 座一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、pass 2」；
      題型序列 orchestration ＝ order・constraint・choice・tradeoff・workshop・spot・order・multi・
      workshop・workshop・fix・choice；refinery ＝ choice・multi・workshop・multi・order・spot・
      tradeoff・fix・workshop・order・multi —— 兩區最長連續同型都是 2，各用了 8 種題型。
- [x] **backlog 的兩座換裝到位**：量器坊 `for-newcomer-59`（`len-readable`）與
      示範與推理 `well-pause-22`（`think-after-tool`）由佔位 kind 換成 §3 指定的 `multi`。
- [x] **12 個新檢查器**（§7.4）：`statesSuccessCriteria`／`tunesAutonomyLevel`／`limitsScope`／
      `asksForPlanFirst`／`definesHandoffState`／`delegatesWithCriteria`／`extractsStandingRules`／
      `setsActionBudget`／`definesEvalSet`／`asksModelToRewritePrompt`／`decisionTree`／
      `definesWordedScale`，全部結構性偵測 ＋ 中英雙語 ＋ good／weak／bad fixture ＋ 反作弊
      ＋ `coach.json` 白話教學（實測照著填就會亮）。其中四個是**非單調**的。
- [x] **校驗場是第二座加建**（`annexOf: 'orchestration'`，沒有橋、閘門立在頸口）；
      **知識式軟門檻新開一種條件 `masteredAny`**（任一區精通，定義完全沿用 `regionMastery()`）；
      `skippedGates` 先行前往照樣走得通且一分 XP 都不加。
- [x] **世界成本實測**（在 node／瀏覽器裡把世界蓋起來，不採文件舊數字）：見 `progress.md` 的表。
- [x] fonts（CJK 1822 字）＋rubric（49,756 → **58,760**）＋playtest（1,275 → **1,642**）
      ＋build ＋ **完整 e2e（2,493 → 2,637 項全過、零 console error、零重跑）** 全綠。
      第一輪 14 條紅燈的分類與處置逐條記在 `progress.md`（1 條快照、5 條舊播放器沒接 multi、
      6 條是我自己測試寫錯、2 條連帶）。

### Phase H — `sim`＋減法之庭 `frugality` 7

狀態：`done`（2026-08-02）

- 先做 3 座 spike（temperature、effort、action budget），每座 3 檔、共 9 段離線樣本；體感驗證後才擴。
- 離線樣本另檔、`authored: "game"`、帶模型／時代條件，絕不暗示為即時 LLM 結果。
- 減法之庭加建；改造火力熔爐與刻度儀之室。

Exit：斷網完全可玩；旋鈕各檔差異可讀且不冒充普遍真理；sample 數量受 schema/test 約束。

Exit criteria（逐條實測）：

- [x] **轉鈕（`sim`）＝石碑刻印的變體，不是第二套框架**：`src/prompt/sim.js` 共用 `slots.js` 的
      刻寫台與 `palm.js` 的結尾，送出的是同一段文字、走同一支離線引擎（護欄 3）。
      **旋鈕不參與評分** —— `api.text` 只回 `stage.text`（測試剝掉註解之後掃原始碼），
      轉旋鈕一百次也不會改變被評分的內容。
- [x] **三座 spike 上線**（§3 指定的三個 `sim` 神廟，全部是既有神廟換裝第三幕）：
      火力熔爐（`knob-effort`）／刻度儀之室（`knob-temperature`）／沙漏工房（`action-budget`）。
      三座的 **rubric、pass、示範解答、`slots`、官方出處一個位元組都沒動**（manifest 的 `phaseH`
      區塊逐欄記錄；退回石碑刻印時玩家刻出來的字一模一樣）。§3 的第四座 `sim`
      （`contrast-same-name`）屬 Phase J 的區域，本期不做。
- [x] **9 段離線樣本**：`src/data/sim-samples.json`（`authored: "game"`）—— 3 個旋鈕 × 剛好 3 檔，
      每一檔一段回話 ＋ 一句「這一檔怎麼讀」；`SIM_NOTCHES = 3` 是 schema 硬性約束，
      三檔的回話**彼此不同**（資料層強制，轉了沒差別這一課就不存在）。
- [x] **絕不暗示為即時 LLM 結果**：畫面上永遠掛一顆 ⓘ 明講「這些輸出是遊戲預先寫好的示範，
      不是真的模型跑出來的結果，也沒有連到任何服務」；每一個旋鈕都寫得出 `condition`
      （在哪一台機器、哪一個時間點成立），那句話永遠跟樣本一起顯示。
- [x] **斷網完全可玩**：`sim.js` 裡沒有 `fetch`／`XMLHttpRequest`／`WebSocket`／任何網址
      （rubric 掃原始碼），e2e 再用 `performance.getEntriesByType('resource')` 量一次
      「整段轉鈕沒有向外要過任何東西」。樣本註冊失敗時安靜退回石碑刻印（相容契約）。
- [x] **觀察是內容，不是過場**：三檔都轉過了才開放刻印（與推規碑「想通才給刻」同一個文法），
      而且刻印只有一個開放入口（測試數 `stage.unlock()` 的呼叫次數）。
- [x] **減法之庭 7 座教學神廟**（`lean-prompt`／`lean-output`／`cache-static-first`／
      `ctx-compaction`／`ctx-pruning`／`ctx-new-chat`／`ctx-reuse-reasoning`），一對一、無重複（C2）；
      題型 fix・spot・order・multi・spot・choice・choice —— 最長連續同型 2（C4），用了 5 種題型；
      全部「主檢查 3 ＋ 地基 `assignsTask` 0.5、pass 2」（C1）。
- [x] **高原加建**（curriculum-v2 §二：🟡 高原加建）：`frugality (0,-82) r=32 flat=27,
      annexOf: 'foundations'` —— **第三座沒有橋的加建**，閘門立在高原正北的邊緣 (0,-55.3)；
      地貌是整張地圖上**最平**的一片土地（起伏 < 3.2 公尺，測試逐點量）。
      母土地一寸都沒有被吃掉（15 座石座的區域判定逐關驗），代價是原本站在頸口正中央的
      `wordfork-12` 往南挪了 16 公尺（只動座標）。
- [x] **知識式軟門檻（C8）**：`REGION_GATES.frugality` 只有一條 `masteredAny: 1`
      （逐字取自 `regions-v2.json`），不看等級、不看前一區通關數；`skippedGates`
      先行前往照樣走得通且一分 XP 都不加。
- [x] **3 個新檢查器**（§7.4）：`staticBeforeVariable`／`asksToCompact`／`carriesForwardEssentials`，
      結構性偵測 ＋ 中英雙語 ＋ good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學。
      其中 `staticBeforeVariable` 是**非單調**的（一邊說固定的放前面、一邊又把今天日期擺最前面 → 整條歸零）。
- [x] **配樂**：減法之庭**沒有**音檔，誠實登記進 `SYNTH_ONLY_REGIONS`，配一組自己的
      `REGION_MOODS.frugality`（根音 65.41 全場最低、只有空心音、鐘聲全場最稀）。
- [x] fonts（CJK **1832** 字）＋rubric（58,760 → **62,415**）＋playtest（1,642 → **1,768**）
      ＋build ＋ **完整 e2e（2,637 → 2,750 項全過、零 console error）** 全綠。
      新斷言逐條先紅後綠（詳見 `progress.md`）。

### Phase I — 觀象臺 `sight` 8（可獨立延後）

狀態：`done`（2026-08-02）

- 新增小型地形與 8 座多模態提示神廟；遊戲仍只評 prompt 結構，不假裝真的看圖／生圖。
- 圖片／影片素材若新增，逐檔記授權；畫面不依外部 CDN。

Exit：8 座離線可玩；素材授權完整；新地形通過 WORLD 效能與碰撞預算。

Exit criteria（逐條實測）：

- [x] **8 座教學神廟上線**（全部新蓋，沒有搬動或改造既有 27 關中的任何一關 ——
      manifest 的 `challenges` 一列都沒有動）：觀象臺的第一格窗（`mm-basics`）／
      看不清的那一角（`mm-troubleshoot`）／無主體的畫（`img-generate`）／改壞的那張（`img-edit`）／
      分鏡牆（`video-prompt`）／唸太快的傳聲石（`tts-writing`）／千篇一律的門面（`design-anti-slop`）／
      改了一顆鈕，塌了一面牆（`fe-spec`）。8 條技能一對一、無重複（C1／C2）。
- [x] **C1／C4**：8 座一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、pass 2」；
      題型序列 choice・fix・fix・multi・order・fix・tradeoff・fix ——
      最長連續同型 2（C4），用了 5 種既有題型（**這一期沒有開新題型**）。
- [x] **遊戲仍然只評 prompt 的結構**（本期最重要的那條線，寫成三條可執行的規則，
      見 WORLD.md §3.3c）：素材是抄寫人寫下來的文字；資料層與畫面都不得出現任何
      圖片／影片／音檔（rubric 掃資料、e2e 掃 DOM）；整段玩下來**零外部請求**
      （e2e 用 `performance.getEntriesByType('resource')` 量過）。
      **因此本期沒有新增任何媒體資產，`public/LICENSE.md` 不需要新增條目。**
- [x] **5 個新檢查器**（§7.4）：`pointsAtRegion`／`preservesPriorState`／`namesShotElements`／
      `usesProsodyPunctuation`／`namesStackAndScope`，全部結構性偵測 ＋ 中英雙語
      ＋ good／weak／bad fixture ＋ 反作弊 ＋ `coach.json` 白話教學（實測照著填就會亮）。
      其中兩個是**非單調**的：`preservesPriorState`（一次塞三個以上的修改就掉分）與
      `usesProsodyPunctuation`（標點做好了卻還留著「請唸慢一點」就掉一階）。
- [x] **新地形（小）**：`sight (134, -18) r=34 flat=27`，**自己一條橋**（不接在任何一區後面）。
      設計寫的是「東北高地」，實際落在**正東偏北** —— 東北那一角已被沉書檔案庫（r=46）
      與護欄崗佔滿，理由與算式記在 `findings.md`。與檔案庫留得出 6.3 公尺虛空、
      橋線離檔案庫中心最近 81.5 公尺（不會擦過去）、`134 + 34 = 168` 壓在 ±170 網格內。
- [x] **知識式軟門檻（C8）新開一種條件 `mastered`**（指名道姓的那一片土地精通）：
      `REGION_GATES.sight` 只有 `mastered: ['foundations']`（逐字取自 `regions-v2.json`）；
      `skippedGates` 先行前往照樣走得通且一分 XP 都不加。
- [x] **世界成本實測**（在 node 裡把世界蓋起來，不採文件舊數字）：三角形 179,574 → **186,596**、
      光源 34 → **36**（一盞主色補光 ＋ 小景裡本來就有的製圖桌燈；**地標零實體光源**）、
      碰撞體 902 → **961**、穿模稽核 0 件；低畫質 125,156 tris ／ 19 盞。
- [x] **配樂**：觀象臺**沒有**音檔，誠實登記進 `SYNTH_ONLY_REGIONS`，配一組自己的
      `REGION_MOODS.sight`（根音 164.81 全場最高、截止頻率全場最高、鐘聲間隔最短之一）。
- [x] fonts（CJK **1847** 字／1464.5 KB）＋rubric（62,415 → **67,077**）
      ＋playtest（1,768 → **1,919**）＋build ＋ **完整 e2e（2,750 → 2,890 項全過、零 console error、
      零重跑，第一輪就乾淨）** 全綠。新斷言另以**刻意破壞**跑了一輪完整 e2e 驗證會紅
      （觀象臺那一段確實出現 3 個 x），還原後即為上述綠燈（詳見 `progress.md`）。

### Phase J — 分歧之廳＋12 應用關＋大師層

狀態：`done`（2026-08-02）— 這是 **R4 release checkpoint**，分三個切片（J1／J2／J3）做完

- 高原加建 divergence 9 座與 `reverse`；依模型卡讓答案翻面，來源並排可點。
- 上線 12 區應用關；第二幕跳過，只用已學技巧動態組 rubric。
- 新增 `seals[]` 與大師層印記，save additive；既有 finale 維持四廠條件，新廠只做支線。
- 移除 D2 的 legacy teaching/collection bridge，完成 130 技能 runtime 遷移。

Exit：130 教學＋12 應用全數可玩；130 技能每條只被教一次且平均有複習；舊 finale 不回退；全 suite 綠。

Exit criteria（逐條實測）：

- [x] **分歧之廳 9 座教學神廟**（J1）：兩面的柱·身分／兩面的柱·記憶／同名的兩個旋鈕／封起來的刻度／
      換了介面的階梯／舊叮嚀／貼滿補丁的舊袍／搬家的清單／會改字的碑 —— 技能一對一、無重複（C2），
      題型序列 tradeoff・tradeoff・sim・spot・fix・fix・spot・order・reverse 與 §三逐格相同
      （最長連續 2、6 種題型，C4），一律「主檢查 3 ＋ 地基 `assignsTask` 0.5、`pass` 2」（C1），
      **零新檢查器**（59/59 在 Phase I 就開完了）。
- [x] **模型卡翻面**：反差題先發模型卡再出題，正解隨卡翻面；兩張卡的官方出處並排可點
      （`tradeoffFlow.rounds[].card.sources[]`，測試強制 url 屬該技能官方清單、`name` 逐字等於 `docName`、
      兩張卡至少兩家）。輸的一面只講「這張卡上要付什麼代價」，不得被寫成「錯」（Phase C 契約沿用）。
- [x] **新題型 `reverse`（拆碑）**：`src/prompt/reverse.js` 走已驗證的 induct 模式 ——
      拆開的委託一塊一塊貼名牌 → 貼錯只就地教學（不扣分／不前進／不失敗）→ 全部標對才開放刻印 →
      共用 `slots.js` ＋ `palm.js` ＋ 同一支離線引擎（護欄 3）。缺資料／未知 kind → 退回石碑刻印。
- [x] **`contrast-same-name` 的 `sim`**：`sim-samples.json` 新增第 4 組旋鈕（三檔＝三台機器、
      同一行 `reasoning_effort: high`、三段回話互異、`condition` 帶年份），旋鈕不參與評分。
- [x] **高原建物 ＋ 硬門檻**：`divergence (76,17) r=29 annexOf: 'foundations'`（第四座沒有橋的加建），
      地標「兩面的柱」零實體光源；`REGION_GATES.divergence` 是**全場唯一的硬門檻**
      （`masteredAny: 4` ＋ `hard: true`）—— 對話框不畫「直接前往」、`skipGate()` 進程層再擋一次、
      divergence 永不進 `skippedGates`；其餘 11 區的「想先過去看看嗎」一字未動。例外寫進 WORLD.md §1.4。
- [x] **12 座應用關**（J2）：每區一座、位置在該區地標腳下；沿用 `council-envoy-06`／`archive-seal-25`
      ＋ 新蓋 10 座 → `challenges` **142**（130 教學 ＋ 12 應用）。型式分佈 free 3／constraint 2／
      workshop 2／order 2／reverse 1／spot 1／tradeoff 1，與 §5.2 逐格相同（測試強制）。
- [x] **應用關不教新技巧**：第二幕（神諭刻文）**整幕跳過**（幕指示器誠實地只有三幕、`Alt+2` 不會跳到不存在的幕）、
      畫面上零官方連結、`primarySkillId`／`primaryTechniqueId` 一律 `null`、不計入 130 教學神廟的 C1/C2 統計。
- [x] **動態 rubric（P9 完全資訊、不軟鎖）**：`src/challenges/trial.js` 是唯一真相 ——
      候選列各掛一條該區技能，開關卡時用 `knowsSkill()` 過濾，
      `pass = max(2, round(入選權重總和 × 0.5 × 2) / 2)`；已學 0／1／2／全部四種情境逐一實測
      （示範解答全部 S、弱起手全部不過、門檻永遠 ≥2 且 < 總權重），已學 < 2 時照 `order` 補位並
      在畫面上誠實標「你還沒學過」。
- [x] **`seals[]` ＋ 大師層印記**：存檔新增四個純加法欄位 `seals`（12 枚土地印記，冪等）／
      `penlessSeals`（無筆之印）／`scribeSeals`（默寫之印）／`samplesSeen`（防作弊面），
      `normalize()` 補預設、去重、reset 清乾淨。判定寫在 `masterSealFor()`：
      無筆之印＝教學神廟 ＋ 沒用快速填入／積木 ＋ 沒開提示球 ＋ 範例從沒被翻開過 ＋ 刻印零退回 ＋
      **開關卡以來第一次呈遞**就 S；默寫之印＝自由書寫模式 S ＋ 同樣的範例條件。應用關不發。
- [x] **既有 finale 不回退**：`vendors` 仍是四廠、`codex.js` 的 `TARGET = 5` 與「四廠全數集齊」文案未改；
      rubric 靜態掃描確認 `seals`／`penlessSeals` 沒有出現在任何解鎖判定裡（C9：大師層永不擋路）；
      e2e 掃圖鑑 DOM 確認徽章區沒有 Qwen／DeepSeek／Mistral（新廠只做支線）。
- [x] **D2 相容層拆除**（J3）：最後兩座教學神廟接上技能（`gate-of-clarity-01` → `clear-specific`、
      `lost-automaton-03` → `clear-positive`）→ **130 座教學神廟 ↔ 130 條技能一對一**；
      `console.js` 的四處「主技巧找不到就退回 legacy」相容分支全部拿掉（教學面以技能為正典、沒有退路）；
      `teaches` 逐字保留為**收集**清單（68 條涵蓋率仍滿、四廠徽章與隱藏成就一格未改）；
      `knowsSkill()` 的祖先 fallback 正名為「收集誠實層」並補一次**純加法開機回填**
      （`bestGrades × primarySkillId` → `skillsV2`，冪等）—— 收窄 fallback 會讓舊存檔倒退，故不收窄（理由在 `findings.md`）。
- [x] **backlog 最終處置**：`mould-room-62`（`so-basics`）→ `workshop` 正式記為 **won't do**
      （擋住的是 workshop 的四步語意「排呼叫順序」，schema 沒有那一步）；量繩之桌／零件表同樣 won't do；
      `disclose`（Phase K）正式記錄為**選配未實作**（四條理由 ＋ 翻案條件：先有世界的觸控移動）。
- [x] **R4 五項驗收全部實跑**（數字見下方 §5 與 `progress.md` 的 R4 報告）：全 suite、
      碰撞／效能稽核、20 筆官方來源實際 curl、舊命名空間存檔的 migration／reset 實測、README 數字更新。

### Phase K — `disclose` 拾遺（選配）

狀態：`not implemented（選配，正式不採用 · 2026-08-02）` —— 決策記錄見 `findings.md`／`progress.md` 的 Phase J3 一節：
四條理由（會打破「任何一關隨時開得起來」的契約／會新增一個影響可玩性的存檔欄位／
沒有世界觸控移動就等於行動裝置不可玩／不影響 130 條技能的完成度，`context-supply` 已有自己的神廟），
翻案條件寫死：**先有世界的觸控移動，再談 `disclose`**。

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
- **R2（D）**：既有五區 v2 化完成，適合第一次公開發布。**已於 2026-08-01 抵達**（見 Phase D exit criteria 與 `progress.md` 的 release-readiness 數字）。
- **R3（F）**：8 區、工具與護欄線完成。**已於 2026-08-02 抵達**（見 Phase F exit criteria 與 `progress.md` 的 release-readiness 數字）。
- **（G）**：9 區、既有五區之外的遷移完成、迭代類技巧第一次有體感。不是 release checkpoint，但 R4 的路已經走了一半。
- **R4（J）**：12 區／142 關／130 技能正式完成。**已於 2026-08-02 抵達** —— 完整驗收見 `progress.md`
  的「Phase J3 ＋ R4 release checkpoint 報告」。實跑數字：
  `fonts` CJK 1,844／1,463.4 KB · `test:rubric` **76,757** · `test:playtest` **2,372** · `build` ✓ ·
  `test:e2e` **3,013 項全過、零 console error、零重跑（第一輪就乾淨）** · 世界高畫質 194,083 tris／37 燈／957 碰撞體／穿模稽核 0 ·
  來源抽查 **20/20 存活** · 舊命名空間存檔 migration／reset 逐欄實測通過 · README 數字已更新
  （截圖未重拍，已在 README 誠實標註擷取時間落後）。
  **尚未合入 `main`、尚未部署** —— 依工作協議由 repo 擁有者決定。
- **R5（K optional）**：探索與關卡真正接起來。**不實作**（見 Phase K 的決策記錄）。

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
| 石座燈光在 37 座時衝到 59 盞（>56 預算），e2e 3 條紅 | 1 | 不是把上限調高，而是把「一座一盞」改成常數 8 盞的燈池指派給最近的幾座（畫面零差異、燈數不再隨關卡數成長） |
| 新檢查器用字面 `[一-鿿]` 寫 CJK 範圍，害字型語料多切一個原始字型沒有的字 | 1 | 改回 `[\u4e00-\u9fff]` 轉義（`checks.js` 原本就是這樣寫的），重跑 `npm run fonts` |
| 新神廟的快速填入串起來剛好等於示範解答，撞到「快速填入不是直接給答案」 | 1 | 把其中一顆改成通用零件；那條斷言守的是鷹架遞減，不是格式潔癖 |
| e2e 新斷言用了 `.stamp__grade`（不存在），兩條假性紅 | 1 | 照既有題型 e2e 的寫法改成 `.grade__mark` |
| `rulesBeforeData` 實作不了：manifest 斷言「主檢查是新檢查器 → 它必須還不存在」 | 1 | 不改斷言、不硬做；連同該關的改造一起留到後續，理由寫進 `findings.md` |
| rubric baseline 有 12 個既有開場斷言失敗（entrygate/title 舊結構） | 1 | 規劃文件未觸及產品碼；不擴大 PR 修復，於 PR 明列 16,490 pass／12 fail，留 Phase 0 重建 baseline。**Phase 0 已修**：12 條全部改寫成 Phase 34.5 現行設計的斷言（不是刪掉），並實測破壞會紅 |
| Windows Node 搭配 Linux `node_modules` 執行 Vite，缺 `@rollup/rollup-win32-x64-msvc` | 1 | 不刪 lockfile/node_modules、不改依賴；先找 WSL 既有 Node，沒有則標記 build 為環境未執行 |
| PowerShell 再次展開 bash status 變數，合併命令結尾無法回傳正確 code | 1 | 不再依賴合併變數；以各工具明確輸出判定：rubric 12 fail、Vite build passed |

---

# v1.2「濁靈之夜」長時間實作計畫（2026-08-17 起）

> 狀態：**ready for execution**（站長已裁決 D1–D6，見 `findings.md`）
> 分期清單、依賴、預算、閘門、`/goal`：**`docs/design/gameplay-roadmap.md`**（本檔不重複列，只放每個 phase 開工時寫的章節與錯誤紀錄）。
> 上游研究：`docs/design/gameplay-research-2026-08.md`（＋Codex 兩輪）、`research-worldbuilding-2026-08.md`、`research-map-2026-08.md`、`spec-murk-encounter.md`。
> 工程護欄：`AGENTS.md`、`CLAUDE.md`、`WORLD.md`；長時間執行節奏沿用本檔 §1（重讀三件組 → manifest／acceptance tests 先列、新測試先紅後綠 → 垂直切片、寫程式不並行 → fonts → 測試矩陣 → WORLD 29 項 → 更新三件組＋changelog → commit＋push `dev`）＋ roadmap §5 的 v1.2 增補（Codex consult／review、里程碑閘門、自主模式的 e2e 規則）。

## v1.2 終點與完成條件

- [ ] 25 個 phase（30 次執行）全部 `[x]`，五個里程碑閘門皆有站長「過」（`findings.md`）。
- [ ] 四條 v1.2 鐵則全程成立：威脅不懲罰且進度只累積、沒有會走動的 NPC、一律夜景沒有日出、`E` 唯一互動鍵（跳躍用 `J`）。
- [ ] 預算：三角形 ≤ 420k、光源 37（不增）、碰撞體 ≤ 1,400、collision-audit 0、每幀零配置。
- [ ] `curriculum.json` byte-identical；新內容全在 `authored: "game"` 層並附出處；`expected-counts.json` 既有契約值不變（只加鍵）。
- [ ] 存檔純加法（`murks`、`firstPrompt`、`shortcuts`…）＋ `normalize()` 預設；reset 乾淨；舊檔可讀。
- [ ] 每個 phase：rubric／playtest／build 全綠，動到互動／世界／存檔者 e2e 全綠、console error 0。
- [ ] release gate（P25b）：README／CLAUDE.md／AGENTS.md 數字與音訊規格同步、`prompts.html` 補 v1.2 goal、合入 `main`。

## v1.2 各 phase 章節

（`/goal` 每開一個 phase 在此新增「### P<NN> — 名稱」：現狀、目標、範圍／非目標、資料 manifest、受影響檔案、預算、acceptance tests、禁區；收尾時逐條打勾 exit criteria。）

### P01 — 濁靈資料層＋世界實體＋互動仲裁（2026-08-17 開工 · 2026-08-18 完成）

狀態：`done`

**現狀**：世界只有五層互動（反應／風味／小語／石座／器物）與一種「會動的活物」（守望小獸）；主控台 `renderResult()`（`src/prompt/console.js:1702` 附近）固定呼叫 `progression.recordResult()` 後解參照 `outcome`；沒有 `kind` 分流。四區座標：foundations (0,0) r62 flat50、reasoning (-95,-95) r46 flat34、grounding (95,-95) r46 flat34、orchestration (-95,95) r46 flat34；四區石座 15／16／13／13 座（座標見 `challenges.json`），器物 22、反應物 23、地標／小景各區皆有。

**目標**：8 隻濁靈可見、可互動、按 `E` 開既有主控台（自由書寫）、送出走既有流程但**不落盤**；演出與存檔留給 P02／P03。

**範圍**
1. `src/data/murks.json`（`authored:"game"`）：`{ version:1, authored:"game", note, xp:24, entries[8] }`；entry ＝ `{ id, region, at:[x,z], title, taint, mission, clue, teaches:[legacy technique id], primarySkillId, rubric:[{check,weight,hint}], pass, sample, source }`。**8 隻**（D1）：foundations ×2、reasoning ×2、grounding ×2、orchestration ×2，各綁該區已有神廟的技巧，`source` **直接沿用該技巧神廟的 `source`**（保證在 anchors）：建議對應 `gate-of-clarity-01`（assignsTask+specifiesFormat+hasConstraint）、`lost-automaton-03`（positiveFraming）、`example-hall-11`（hasFewShot）、`step-bridge-20`（hasStepByStep）、`citation-desk-21`（asksToCiteSources）、`well-of-unknowing-22`（givesOutForUncertainty）、`subtask-workbench-31`（decomposesTask）、`sprawling-site-84`（limitsScope）。`rubric` 3 條（主檢查 weight 2 ＋ 兩條 weight 1，其中一條可為 `assignsTask`）、`pass` = 3。`taint`＝像玩家自己會寫的爛 prompt（繁中，1–2 句）；`sample`＝範例解（playtest 要求 ≥A，且 `taint` 原文必不過）。文案照 WORLD.md §3.6 禁字表。
2. `src/world/murks.js`：`createMurkField({ entries, kitOf, terrainHeight, isBusy, reducedMotion })` → `{ group, murks, update(dt,t,px,pz), nearest(pos, maxDist, forward), byId }`；照 `reactive.js` 樣板（`FAR_SQ 45²` 整組跳過、`NEAR_SQ 15²` 外每 3 幀、零每幀配置、暫存向量提模組層）；每隻 `THREE.Group` 名 `murk:<id>`，子件：`body`（實心底座 `userData.solidRadius=0.9`）、`core`（眼光 emissive）、`shells[]`（殼數＝rubric 條數，**半透明材質**→稽核自動免除）、`glow` sprite；**0 光源**、每隻 ≤600 三角；狀態 `idle→aware`（≤8m 轉頭看玩家、`isBusy()` 時不動）；本 phase 沒有 struck／calming／settled 的視覺（P03）。用區域 `kitOf(region)` 的 dark／mid 色。
3. `src/world/world.js`：`createWorld` 接 `murks` 資料、建 field、`root.add`、每幀 `update`、對外 `murks`／`nearestMurk(pos, maxDist=5.5, forward)`（面向排名同 `nearestHandle`）。
4. `src/main.js`：第 ⑥ 層互動——優先序 石座 6.5 > **濁靈 5.5** > 石碑 4.6 > 刻文 3.8 > 器物 3.2 > 閘門；HUD `setInteract` 文案「濁靈 · 一段沒說清楚的請求 <kbd>E</kbd> 安撫」；`KeyE && nearMurk` → `audio.cue('open'); openPanel(promptConsole, murk.challenge)`；`murk.challenge` ＝ `{ id, region, title, npc:'濁靈', scenario: taint, mission, clue, teaches, primarySkillId, rubric, pass, sample, source, kind:'murk' }`（無 flow → 既有邏輯自動 free）。`onResult` 對 `kind==='murk'` 只 `hud.refresh()`＋音效，**不**找 marker、不慶祝解鎖。
5. `src/prompt/console.js`：`renderResult()` 依 `challenge.kind==='murk'` 分流到 `progression.recordMurk(id, evaluation, meta)`；第一幕標題「濁言」＋ `taint` 引文樣式（最小 CSS）。
6. `src/progression/progression.js`：**最小版** `recordMurk()`：回傳與 `recordResult` **同形狀** outcome（`xpGain:0, levelBefore/After 現值, leveledUp:false, newlyCollected:[], newlySkills:[], newlyUnlocked:[], previousGrade:null, bestGrade:null, improved:false, newSeal:null, newPenless:false, newScribe:false` 及其他 `renderResult` 會讀的欄位）且**不寫任何 state**。
7. `expected-counts.json`：只**新增** `murks: 8` 鍵；既有值不動。
8. 座標由實作者用 node 蓋世界後計算並驗證：離任何石座 ≥8m、離橋 lane／頸口 ≥4m、離器物／反應物／石碑／刻文／地標／小景中心 ≥4m、離出生點 ≥7m、在該區 `flat` 半徑內、且 `isClear`；規則寫進 rubric 測試。

**Codex consult 增補（2026-08-17，六點必修）**
- 主控台進第二幕會 `markGuidanceSeen()`、看範例會 `markSampleSeen()`（`console.js:939` 附近）——`kind==='murk'` 時**跳過**兩者，否則 murk id 會落進 `guidanceSeen/samplesSeen`；e2e 要比較送出前後**完整 state 與序列化 save 相同**，不是只驗「沒有 murk 欄」。
- murk `rubric` 主列必須 `primary:true`（第二幕靠它找主教學列，`primarySkillId` 才會呈現）；其他列補 `foundation`／`skillId`／`techniqueId` 與既有神廟同形。
- `body.userData.keepSolid = true`（否則靠石座 <9.9m 會被 `noCollideZones` 當雜物濾掉，`world.js:2858`）；座標 `isClear` 對「加入 murk 前的 baseline world」檢查。
- `expected-counts.json` 是 `contract.<key>: {value, why}` 形；新增 `contract.murks: {value:8, why:"…"}`，測試讀 `EXPECT.murks.value`。
- 第一幕標題不得改全域 `ACTS`；murk 用專用 eyebrow（不能顯示「第 01 關／共 N 關」——murk 不在 `content.challengesOf()`）。
- `main.js`：import `murks.json` → `createWorld({murks})`；`nearMurk` 的 reset 與 gate blocking 一起處理；`onResult` 的 murk 分支**置頂並 `return`**；`world.updateReactions()`／每幀呼叫 `murkField.update()`；`keepClear` 納入 murk；`window.__promptasy.murks` 暴露資料給 e2e。測試世界（`test-rubric` 的 `World.createWorld`）也要傳 murks。
- 最小 outcome（`onResult` 已提前 return 前提下）：`{ xpGain:0, newlyCollected:[], newlyUnlocked:[], leveledUp:false, levelAfter:<現值>, improved:false, previousGrade:null, bestGrade:null }`，再補齊 `levelBefore/newlySkills/newSeal/newPenless/newScribe` 與 `recordResult` 同形。
- 既有 hook：e2e `evaluate()/key()/waitFor()`、遊戲端 `player.teleport()/promptConsole.open()/setMode()/goAct()`；playtest `runPlaytestVerify()` 追加 murks 的 sample/taint 迴圈。

**非目標**：存檔／XP／圖鑑（P02）、剝殼演出／SFX／回呼（P03）、WORLD.md 修訂與文案定稿（P04）、任何新按鍵、任何會移動的實體。

**受影響檔案**：新增 `src/data/murks.json`、`src/world/murks.js`；修改 `src/world/world.js`、`src/main.js`、`src/prompt/console.js`、`src/progression/progression.js`、`src/styles.css`（最小）、`scripts/test-rubric.mjs`、`scripts/playtest-verify.mjs`（或 playtest 資料入口）、`scripts/headless-check.mjs`、`scripts/expected-counts.json`；`npm run fonts` 產物。

**預算**：三角 +<5k（194k→<200k）、光源 37 不變、碰撞體 +8（957→965）、collision-audit 未涵蓋 0、零每幀配置。

**Acceptance tests（先紅後綠）**
- rubric：`murks.json` 結構／`authored`／8 筆／每筆 `check ∈ CHECK_IDS`／`source ∈ anchors`／座標規則／`expected-counts.murks===8`；node 蓋世界 solids 含 8 個 `murk:` 且總數 <1,400、collision-audit 0；`recordMurk` 不改 `state`（deep-equal 前後）。
- playtest：8 隻 `sample` ≥A、`taint` 原文不過。
- e2e：teleport 到 `murk-*` 旁 → `[data-interact]` 含「濁靈」與「安撫」→ `KeyE` → `promptConsole.isOpen` 且 free 模式、第一幕含 taint → 送 taint → 未通過、XP 不變、save 無 murk 欄 → `Escape`；tris/lights 舊斷言沿用；console error 0。
- 舊斷言零改動。

**禁區**：`curriculum.json`、`challenges.json`、`flows.json`、`vite.config.js`、dev server 5175、`CLAUDE.md`、`WORLD.md`（P04 才動）。

Exit criteria：
- [x] 8 隻可見可互動；E 開主控台 free；送出不落盤（e2e 深比較 state 與序列化 save 前後相同）。
- [x] rubric 84,234／playtest 2,429／build ✓／e2e 3,409 全綠、console error 0；`npm run fonts` 已跑（1474.1 KB）。
- [x] 預算實測：三角 192,170 → 195,530（+3.4k）、光源 37、碰撞體 962 → 969、collision-audit 未涵蓋 0。

### P02 — 濁靈進程與存檔＋圖鑑第四列（2026-08-18 開工 · 同日完成）

狀態：`done`（Codex 額度用盡至 8/20 → consult 由 orchestrator 對照程式碼自審；review 用 `/code-review high`，10 條 → 5 條當場修、餘記 findings）

**現狀（P01 之後）**：`progression.recordMurk(id, evaluation, meta)` 是唯讀 stub（回傳 recordResult 同形 outcome、不寫 state）；主控台 `renderResult()` 已依 `kind==='murk'` 分流；`main.js` `onResult` murk 分支只給音效就 return；存檔 `save.js` 無 `murks` 欄；圖鑑 `worldFinds()`（`src/ui/codex.js:76`）有三列（刻文／祕密／器物）。評分：`evaluate()` 回 `results[i].passed`（布林）與 `weight`；`gradeForRatio(ratio)`、`xpForGrade(grade, baseXp)`、`betterGrade` 在 `src/challenges/rubric.js`。

**目標**：安撫會被記住（跨次累積、永不清零）、有評價、有 XP、進圖鑑第四列；不污染 142 關統計。

**範圍**
1. `src/save/save.js`：`defaultSave().murks = {}`；`normalize()` 逐鍵驗 `{ hits:[int…去重排序], grade: 'S'|'A'|'B'|'C'|null }`，壞值丟棄；`reset()` 自然清空；純加法、不動 `migrate` 版本號。
2. `src/progression/progression.js`：`recordMurk(id, evaluation, meta)` **真正落盤**：`hits = 聯集(舊 hits, evaluation.results 中 passed===true 的 index)`；`score = Σ rubric[i].weight for i in hits`；`calmed = score ≥ challenge.pass`（`pass` 由 murks.json 帶入——`recordMurk` 需拿到 rubric/pass：由 challenge 形物件傳入或從 murk 資料表查；建議簽名 `recordMurk(challenge, evaluation, meta)`，`challenge.kind==='murk'`）；`grade = calmed ? betterGrade(舊 grade, gradeForRatio(score/total)) : 舊 grade`（只升不降；全部命中 → S）；XP 只補差額：`xpForGrade(grade, murks.json.xp) − xpForGrade(舊 grade, xp)`，寫進 `state.xp`、升等照 `levelFromXp`；**不動** `bestGrades`／`collected`／`skillsV2`／`refreshUnlocks()`；`newlyCollected` 保持空（教學技巧的收集仍只由神廟給——保守，避免濁靈變成收集捷徑）。**原子回傳** `{ xpGain, levelBefore, levelAfter, leveledUp, newlyCollected:[], newlySkills:[], newlyUnlocked:[], previousGrade, bestGrade:grade, improved, newSeal:null, newPenless:false, newScribe:false, murk:{ newlyPassedIndices, hits, score, total, calmed, newlyCalmed } }`（前 13 鍵與 recordResult 同形，加一個 `murk` 子物件給 P03）。另加 `murkCount()`（有 grade 的數）、`murkState(id)`、`murkHits(id)`。**主控台第一次送出前**（`open()`）：既有 `best` 對 murk 改讀 `murkState(id).grade` 顯示「最佳評價」。
3. `src/prompt/console.js`：`renderResult` 對 murk 顯示：安撫時「牠聽懂了…」＋ `+N XP`（若 xpGain>0）＋ 評價；未安撫時既有「再修一次」＋缺什麼；`outcome.murk` 存在時把「本次新命中 N 條」寫進結果面一行（P03 會拿同一資料剝殼）。不重播殼（P03 才有殼動畫）。
4. `src/ui/codex.js`：`worldFinds()` 第四列「濁言與正言 n/8」（`murkTotal` 由 main.js 傳入＝`murkFile.entries.length`），列後可展開清單：每隻 `title`、`taint`（弱）、最佳評價、`sample`（強）、`teaches`／`primarySkillId` 技能名、`source` 出處連結（護欄 2）；未安撫者只顯示 title＋「還沒聽懂」。
5. `src/main.js`：`onResult` murk 分支：`outcome.murk.newlyCalmed` → `hud.celebrate`／`audio.cue('pass')`、`hud.refresh()`；升等照既有 toast＋`engine.pulse(0.7)`；仍不找 marker、不 `refreshGates`。`createCodex({ murkTotal })`。`window.__promptasy` 已有 murks。
6. `scripts/expected-counts.json` 不動（8 已在）。

**非目標**：殼剝落／清燈／SFX／回呼（P03）；WORLD.md／文案定稿（P04）；`bestGrades`；`refreshUnlocks`。

**受影響檔案**：`src/save/save.js`、`src/progression/progression.js`、`src/prompt/console.js`、`src/ui/codex.js`、`src/main.js`、`src/styles.css`（圖鑑第四列最小樣式）、`scripts/test-rubric.mjs`、`scripts/headless-check.mjs`、fonts 產物。

**預算**：無場景改動（三角／光／碰撞不變）；存檔 +1 欄。

**Acceptance tests（先紅後綠）**
- rubric：`normalize()` 對舊檔補 `murks:{}`、壞值（非陣列 hits、非法 grade、非整數 index）被丟、`reset()` 清空；`recordMurk` 累積聯集（兩次送出不同命中 → 聯集）、安撫規則（score≥pass）、grade 只升不降、XP 只補差額、**`bestGrades`／`collected`／`skillsV2`／已通關數／稱號前後 deep-equal**、`levelFromXp` 一致；`murkCount()`。
- e2e：送 taint 原文 → 未安撫但 `murks[id].hits` 可能 >0、save 有 `murks` 鍵；關掉重開 → 主控台顯示的狀態一致（無殼動畫可驗，只驗 state）；送 sample → `murks[id].grade` 有值、XP 增加 `xpForGrade`、圖鑑第四列 `1/8`＋條目含 taint／sample／出處連結、「已通關數／稱號」不變；`reset` 後 `murks` 為 `{}`；舊斷言零改動；console error 0。
- 舊斷言零改動；`npm run fonts`。

**禁區**：同 P01（另：不動 `expected-counts` 既有值）。

**審查後修訂（2026-08-18）**（`/code-review` 兩輪：語意、解鎖、XP 來源、存檔計數）
- **A · 這一次 vs 累積**：`hits` 仍＝ `results[i].passed === true` 的列的聯集；**`calmed = evaluation.passed === true || 累積 score ≥ pass`**（引擎的單次判定是第一級的安撫方式，靠部分分數過的也算）；安撫時 `grade = betterGrade(舊, gradeForRatio(max(這一次 ratio（過了才算）, 累積 score/total)))`；`wasCalmed = 舊 grade !== null`（**存了 grade 就是安撫旗標**）；`newlyCalmed = calmed && !wasCalmed`；XP 差額不變。結果面**印章／分數條／逐列／提示球／fails／範例解鎖／音效全部看這一次**（跟關卡一模一樣）；濁靈的累積狀態只佔分數條下面**一行** `[data-murk-newly]`：這一次才安撫 →「牠聽懂了。這一句話，你替牠說完了。」＋ 共用的 `gainLine(outcome)`（+N XP · 升等 · 評價）；早就安撫 →「牠早就聽懂了 · 累積 s / t · 最佳評價 G」；只有新命中 →「這一次替牠說清楚了 N 處 · 累積 s / t」；否則沒有那一行。允許「這一次沒過、但聯集湊到 pass」：印章沒過、那一行宣告牠聽懂了＋XP；`main.js` 播這一次的 fail 音、但仍 `hud.celebrate`（誠實而一致）。`main.js` 抽 `celebrateLevelUp(outcome)`／`announceUnlocks(outcome)` 給關卡與濁靈兩支共用。
- **B · 解鎖**：`recordMurk` 在 XP 寫進 `state.xp/level` 後**呼叫 `refreshUnlocks()`**（與其他 XP 寫入者一致——審查證明濁靈升等後閘門會過期；不倒退優先於原 spec「不碰 refreshUnlocks」的字句），`outcome.newlyUnlocked` 帶回；仍不動 `bestGrades`／`collected`／`skillsV2`／印記／徽章。
- **C · XP 來源**：拿掉 `createProgression({ murksXp })` 選項與其管線；`baseXp = Number.isFinite(challenge.xp) ? challenge.xp : (evaluation.baseXp ?? 0)`，與 `recordResult` 同一條。
- **D · 存檔與計數**：`normalize()` 只在 `hits.length > 0` 時保留 `grade`，否則 `grade: null`；`murkCount(ids = null)` 給 `ids`（murks.json 的 id）時只數這些（存檔孤兒不算）——codex.js 與 main.js（`__promptasy.murkCount`）都傳 `murks.map(m => m.id)`；`murkState()`／`murkHits()` 不變。
- 測試：test-rubric 恢復**動態**同形斷言（keys(recordMurk) ＝ keys(活的 recordResult) ＋ `murk`）、加真引擎「部分分數過」（murk-trust-me）、「這一次沒過但聯集安撫」（murk-vague-ask 兩句、XP 只給一次）、`refreshUnlocks` 效果（Lv.2 → Lv.3 開 reasoning）、`murkCount(ids)`、normalize 丟沒 hits 的 grade；headless-check 四個快照共用一份 `STATS142`（含 penlessSeals／scribeSeals）、濁靈 e2e 換成新文案（印章＝這一次；`[data-murk-newly]` 三種句子）。

Exit criteria：
- [x] 安撫被記住、跨次累積、有評價與 XP、進圖鑑第四列；142 關統計（bestGrades／collected／skillsV2／seals／badges／已通關數／稱號）前後 deep-equal。
- [x] rubric 84,367／playtest 2,429／build ✓／e2e 3,448 全綠、console error 0；fonts 已跑。
- [x] outcome 契約寫進 progress.md／CHANGELOG／roadmap P02–P03（給 P03）。

### P03 — 濁靈演出：`onRubricHits` 契約＋剝殼＋清燈＋SFX（2026-08-18 開工 · 同日完成）

狀態：`done`（Codex 額度用盡至 8/20 → consult 由 orchestrator 自審；`/code-review high` 因 session 上限只跑完 1/5 角度，該角度 6 條全修）

**現狀（P02 之後）**：`recordMurk()` 原子回傳 `outcome.murk = { newlyPassedIndices, hits, score, total, calmed, newlyCalmed }`；`console.js renderResult()` 先算 outcome、畫結果、最後 `onResult?.({challenge, evaluation, outcome})`（`console.js:~1902`）；`main.js` onResult murk 分支處理音效／慶祝／升等／解鎖後 return；`src/world/murks.js` 每隻有 `shells[]`（殼數＝rubric 條數；材質依 kit＋index **共用快取**）、`core/coreMat`、`glow`、`state: 'idle'|'aware'`、`awareAmt`、`setNear`，`update()` 做呼吸／轉頭；開機時**尚未**依存檔還原殼數；`audio.js` `SFX` 合成表（如 `scurry`）＋ `cue()` 檔案缺席自動退回合成；`engine.pulse(amount)`；粒子樣板 `reactive.js:366–408`（`THREE.Points` 逐點位置＋`needsUpdate`）；`reducedMotion` 已傳進 murk field。

**目標**：命中的檢查看得見——每命中一條剝一層殼；安撫→清燈；有聲音；重開不重播；不打擾閱讀。

**範圍**
1. **回呼契約** `console.js`：新增 `onRubricHits?.({ challenge, passedIndices, newlyPassedIndices, total })`，在 recorder 回傳後、**畫結果之前**觸發一次。murk：直接用 `outcome.murk`（`newlyPassedIndices/hits/total`）；非 murk（給 P09）：`passedIndices` = 本次 `results[i].passed===true` 的 index，`newlyPassedIndices` = 相對於「本次開啟主控台 session 內已命中集合」的新增（記憶體 `Set`，`open()` 時清空），`total` = rubric 條數。P03 只在 murk 路徑接世界；非 murk 路徑只回呼、不演出。
2. **世界演出** `src/world/murks.js`：
   - `field.strike(id, { newlyPassedIndices, hits, total, calmed, newlyCalmed })`：對 `newlyPassedIndices` 的殼做「剝落」（0.6s：縮小＋淡出→隱藏；材質先 `clone()` 一次成 per-instance 再動 opacity，避免動到共用快取）；身體閃白 2 幀（core emissive 短暫 2.4）；8–12 顆加法粒子（一組共用 `THREE.Points` 池，零每幀配置：預先配好 12 顆的 buffer，只改位置/生命值）；`engine.pulse(0.28)` 由 main.js 呼叫（world 不碰 engine）。
   - `calmed && newlyCalmed`：剩下的殼轉「餘殼」（opacity ×0.35、停止旋轉）→ 眼光轉暖白（core color/emissive lerp 到 `#fff2d6`）→ 濁靈縮成清燈（head 縮到 0.55、body 不動）；**過關演出**＝光屑（同一顆 Points 池的 6 顆）從濁靈飛出、繞玩家一圈 ≤3s、回到清燈位；狀態 `settled`。`reducedMotion`：跳過光屑與剝落動畫，直接套終態。
   - 已 `settled` 的濁靈：`update()` 不再 aware 轉頭（清燈是安靜的），glow 暖色微弱呼吸。
   - `field.restore(id, { hits, calmed })`（開機／存檔載入時由 world 呼叫一次）：依 `hits` 直接把殼設隱藏、`calmed` 直接 settled——**不播動畫**。`createMurkField` 接 `stateOf(id)`（回 `progression.murkState(id)`）在建構時還原。
   - 殼與 `hits` 的對應：殼 index = rubric index。
   - 面板開著（`isBusy()`）時演出**照播**（玩家正看著結果面；世界在背景），但 aware 轉頭停。
3. **音訊** `audio.js` `SFX` 合成列：`murkStir`（走近 8m 內第一次 aware：短促低頻雜訊，`throttle` ≥ 4s／隻，用既有節流機制或 field 內計時器）、`murkHit`（每剝一殼：三層音高依累積 hits 數 1/2/3+ 選 seq）、`murkCalm`（安撫：暖和弦，與既有 `pass` cue 不重疊——main.js 在 newlyCalmed 時**只播 `murkCalm`**，不再播 `pass`；attempt 的 pass/fail cue 照 P02 邏輯保留但 newlyCalmed 時讓位給 murkCalm）。全部先合成、`SFX_FILES` 不加檔案（缺檔自動退回合成本來就是規則）。
4. **接線** `main.js`：`createPromptConsole({ ..., onRubricHits })` → murk 時 `world.murks.strike(challenge.id, outcome.murk)`＋`engine.pulse(0.28)`＋`audio.cue('murkHit')`（每條一次，最多 3 次、間隔 90ms 用 setTimeout；不是每幀）；`onResult` murk 分支：newlyCalmed → `audio.cue('murkCalm')`、`hud.celebrate`（既有）、`player.celebrate`（既有）。`createWorld({..., murkStateOf: (id) => progression.murkState(id) })`。
5. **e2e 把手**：`window.__promptasy.world.murks.byId(id)` 已有；加 `m.visibleShellCount()`、`m.state`。

**審查後修訂（2026-08-18；`/code-review high` 只跑完 Angle A、6 條）**：① 剝落從殼「當時的 opacity」淡出（`peelFrom[]`），同一擊安撫時不會先跳成餘殼再淡；② `murkStir` 的「第一次走近」看**距離**不看 aware（`wasAware = inRange`），開關面板不再重吼；③ `field.reset()`：進度重置不重載時把殼長回來、清燈變回濁靈、粒子池清空，`main.js onReset` 呼叫；④ `onRubricHits` 濁靈路徑多帶 `murk:{…calmed,newlyCalmed…}` 第五鍵（非 murk 仍四鍵），世界端不再用 `!settled` 猜「這一次才安撫」；⑤ 同一擊安撫時碎光最多 `N − SCRAP_COUNT` 顆，留位給光屑；⑥ 演出計時器用 `min(dt, 0.1)`，慢渲染／分頁切回不會一格跑完。

**非目標**：石座演出（P09）、文案／WORLD.md（P04）、hitstop／震動／慢動作、任何實體跟隨玩家、新光源。

**受影響檔案**：`src/prompt/console.js`、`src/world/murks.js`、`src/world/world.js`（傳 `murkStateOf`、暴露 strike/restore）、`src/main.js`、`src/audio/audio.js`、`scripts/test-rubric.mjs`（SFX 表新增三條的合成 fallback／throttle 斷言、`strike/restore` 純函式行為、零每幀配置靜態掃描）、`scripts/headless-check.mjs`（輪詢式）、fonts（若有新字串）。

**預算**：粒子池 +1 Points（≤12 顆）；三角不變；0 光源；零每幀配置（剝落動畫用 field 內的計時器陣列，不在 tick 內 new）。

**Acceptance tests（先紅後綠）**
- rubric：`SFX.murkStir/murkHit/murkCalm` 存在且 `cue()` 有合成 fallback；`murkStir` 有節流；`strike()` 對 `newlyPassedIndices=[0,2]` 使殼 0/2 進入剝落、其餘不動；`restore({hits:[1], calmed:false})` 立即隱藏殼 1、不播動畫；`restore({calmed:true})` → settled；`onRubricHits` 非 murk 的 session 差量（同一 session 兩次送出 → 第二次只回新增；`open()` 後歸零）；靜態掃描 `murks.js` update/strike 內無 `new THREE.`／`.map(`／`.filter(`。
- e2e（**輪詢式**，不用固定 sleep 對齊）：teleport 到 `murk-vague-ask` → 殼數 3 → 送一段只命中 1 條的 prompt → 輪詢直到殼數 2、`state` 仍非 settled、粒子池有活粒子過 → 關掉重開 → 殼數仍 2（不重播）→ 送 sample → 輪詢直到 `state==='settled'`、殼全為餘殼或隱藏、glow 暖色；`reducedMotion` 模式（用既有 e2e 的 reduced-motion 開關）走同一路徑直接到終態；重新整理頁面後 `restore` 讓那隻一開機就是 settled；console error 0；舊斷言零改動。
- 音效：e2e 檢查 `audio` 診斷輸出含 `murkHit`（既有 `cue` 診斷把手）。

**禁區**：同 P01／P02；另不動 `SFX_FILES`、不加 m4a。

Exit criteria：
- [x] 剝殼／餘殼／清燈／光屑／SFX 全部可見可聽；重開不重播；開機依存檔還原；reset 世界同步。
- [x] rubric 84,527／playtest 2,429／build ✓／e2e 3,525 全綠、console error 0。
- [x] 數字與 `onRubricHits` 契約寫進 progress.md／CHANGELOG／findings（給 P09）。

### P04 — 濁靈世界觀文案層 ＋ WORLD.md 修訂（2026-08-18 開工 · 同日完成）

狀態：`done`（純文案＋文件＋一句回聲；orchestrator 直接做，未開 subagent；Codex 仍不可用）

**做了什麼**
- WORLD.md：§1.5 加濁靈一條、新增 **§1.6 濁靈與清燈**（起源＝回聲接不住的份量、安撫＝代它把話說完、清燈＝解開的問題、沒聽懂不是失敗且永不忘、只有頭／光／霧／殼會動、用語禁「怪物／敵人／打敗／傷害／血量」、資料 `authored:"game"`）；§3.2 表加 **⑥ 遭遇** 列與新的搶 E 優先序「石座 > 濁靈 > 石碑 > 刻文 > 器物 > 閘門」＋「互動圈不重疊靠擺放不靠仲裁」；§3.5 加濁靈一條；新增 **§4.8 濁靈的擺放**（全部距離規則、例外表上限 1、主體／0 光源／≤600 三角、命名）；§8 檢查表加 **B7b**（會被「打」的東西＝prompt 品質、留在原地）與 **G24b**（世界端單向視覺狀態要有 `reset()` 路徑）。
- `main.js`：第一盞清燈亮起時回聲一句「沒說清楚的話，也能被說完。你替牠說了。」（19 字、不解釋規則）；`npm run fonts`。
- 既有文案（murks.json 的 title／taint／mission／clue、主控台「牠聽懂了…」「還沒聽懂」「濁言」、圖鑑「濁言與正言」）已在 P01–P03 由 rubric 的禁字表逐句掃過；本 phase 複核用語一致（濁靈／濁言／清燈；無「怪物／敵人／打敗」）。

**驗證**：rubric 84,527／build ✓／zh-scan ✓／fonts ✓／e2e（見 progress）。

Exit criteria：
- [x] WORLD.md §1.6／§3.2／§3.5／§4.8／§8 到位；文案用語一致。
- [x] rubric／build／e2e 全綠、console error 0。

### P05 — `setMood` 單一入口 ＋ 一夜的時辰（2026-08-18 開工）

狀態：`in progress`（Codex 仍不可用 → consult 由 orchestrator 自審；review 用 `/code-review high`）

**現狀**：`src/engine/engine.js` `createEngine()`：`setMood({fog,tint,hemi,fogNear,fogFar,exposure})` 寫 `moodTarget`，每幀 lerp 到 `moodNow` 套霧色／色偏／半球光／曝光（`engine.js:415–475, 522–530`）；天空元素：`makeStars()`（ShaderMaterial，uniforms `uTime/uMap/uOpacity/uScale`，high 950 顆／low 420 顆）、`makeMoon(dir)`（`disc`＋`halo` 兩個 Sprite，掛在固定 `moonDir (-40,60,30)`；另有 DirectionalLight `moon` 打光＋陰影）、`makeAurora()`（若干 band，`rotation.y += drift`）；`PALETTE.moon/aurora`。區域氣氛 `REGION_ATMOSPHERE`（`world.js:253`）由 `main.js:166/986` 在進區時 `engine.setMood(atmosphereFor(id))`。進程：`progression.masteredRegions()`、`state.skillsV2.length`（130 滿）、`murkCount(ids)`（8 滿）、`createProgression({onChange})` 有變更回呼。WORLD.md §2.2「一律夜景。沒有白天、沒有日出」。

**目標**：天空成為進度的外顯——一夜之中的時辰隨進度推進（入夜→深夜→月落→星最亮之夜），永遠是夜；所有氣氛參數走**同一個** `setMood` 入口（區域色盤 × 時辰因子），P06 的色彩腳本才有地方接。

**範圍**
1. `engine.js`：`setMood()` 擴成 `{ fog, tint, hemi, fogNear, fogFar, exposure, moon:{ alt:0..1, phase:0..1 }, stars:{ density:0..1 }, aurora:{ intensity:0..1, hue:-1..1 } }`（全部可選、都進 `moodTarget/moodNow` 平滑）。套用：`moon.alt` → 月亮 Sprite 群與 `DirectionalLight` 方向沿同一條弧從高（alt 1 ≈ 現在的 60°）降到近地平線（alt 0 ≈ 8°，光仍在地平線上、陰影相機照顧到）；`moon.phase` → 最便宜可信的做法（disc 疊一片與天空底色同色的暗 sprite 做「咬掉」，或 disc/halo 的 opacity＋scale 交叉，任選一種、寫清楚為什麼）；`stars.density` → `uOpacity`（0.55→1.0）＋ `uScale`（0.85→1.1）；`aurora.intensity/hue` → 各 band 材質 opacity 乘數與顏色 lerp（`PALETTE.aurora` ↔ 偏綠／偏紫）。**0 新光源**、不新增網格（月相的暗 sprite 算 1 個 Sprite，不是 mesh）。
2. **時辰**（`src/engine/hours.js` 或 `src/world/hours.js`，純函式）：`hourOf({ mastered, masteredTotal:12, skills, skillsTotal:130, murks, murksTotal:8 })` → `{ index:0|1|2|3, p:0..1 }`：`p = 0.5·mastered/12 + 0.3·skills/130 + 0.2·murks/8`；index：p<0.25→0 入夜、<0.5→1 深夜、<1→2 月落、p≥1（全部收齊）→3 **星最亮之夜**（終態；沒有黎明）。`hourFactor(index)` → `{ fogMul, hemiAdd, exposureMul, moon:{alt,phase}, stars:{density}, aurora:{intensity,hue} }`：入夜 `fogMul 1.0 / hemiAdd 0 / moon alt .75 phase .3 / stars .7 / aurora .5`；深夜 `0.95 / −0.03 / .5 .5 / .8 / .7`；月落 `0.9 / −0.06 / .2 .75 / .9 / .85`；星最亮 `1.05 / +0.02 / .05 1.0 / 1.0 / 1.0 hue +.4`。**時辰只乘因子、不換區域色系。**
3. **單一入口** `main.js`：`applyMood()` ＝ `engine.setMood(composeMood(atmosphereFor(regionId), hourFactor(hour)))`（`composeMood` 純函式：fog 乘亮度、hemi 加、exposure 乘、moon/stars/aurora 直接帶）；進區時與 `progression.onChange`（murk 安撫／技能／精通變化）時都走它；`engine.forceHour(n|null)` 覆寫（測試／截圖），`window.__promptasy.engine.forceHour`、`window.__promptasy.hour()` 回目前 `{index,p,forced}`。
4. **截圖**：`scripts/shots-hours.mjs`（用 headless-check 同一套 CDP 啟動方式、自己的 port）對 foundations 中心四個時辰各截一張 PNG 到 `docs/design/shots/hour-{0..3}.png`（1280×720、high quality）；不進 e2e 常態流程（手動指令），但要能跑。
5. WORLD.md §2.2：加「時辰」規則（永遠是夜、四態、只乘因子、終態星最亮之夜、明寫沒有黎明、`setMood` 是唯一入口、色彩腳本走同一入口）。
6. 效能：時辰改變是低頻事件（進區／進程變化），不在每幀算；`moodNow` 的 lerp 已存在。

**非目標**：區域色彩腳本本身（P06）、閘門三態（P06）、任何白天／日出、天氣。

**受影響檔案**：`src/engine/engine.js`、新 `src/engine/hours.js`、`src/main.js`、`WORLD.md`（§2.2）、`scripts/test-rubric.mjs`、`scripts/headless-check.mjs`、新 `scripts/shots-hours.mjs`、`docs/design/shots/`。

**預算**：光源 37 不變、mesh 不變（+≤1 Sprite）、零每幀配置（uniform 與 sprite 位置在 lerp 迴圈裡直接寫）。

**Acceptance tests（先紅後綠）**
- rubric：`hourOf` 邊界（0／0.25／0.5／0.999／1 → 0/1/2/2/3；全部收齊才 3）、`hourFactor` 表、`composeMood` 純函式（區域色系不變：fog 色相不變只乘亮度）；`setMood` 接受新鍵並平滑（`moodTarget` 讀回）；靜態掃描 engine 每幀迴圈無新配置。
- e2e：預設存檔 → `hour().index===0`；`forceHour(3)` → 輪詢直到月亮群 y 明顯低於 hour 0、星 `uOpacity` ≥ 0.95、極光 opacity 乘數 ≈1、hemi 變化在 ±0.08 內、fog 色相不變；`forceHour(null)` 回 0；光源仍 37；舊斷言零改動（預設時辰 0 ＝ 現在的樣子：入夜的因子必須讓 hour 0 的畫面與 P04 之前**逐值相同**——`fogMul 1、hemiAdd 0、exposureMul 1`、月亮位置＝現在的 `moonDir`、`uOpacity 0.9`、`uScale 900` → 把 stars.density 的映射校準成 density .7 ↔ 現值）。
- 截圖腳本能跑出 4 張檔案（大小 >20KB）。

**禁區**：同前；`REGION_ATMOSPHERE` 的既有數值不動（P06 才動）；`vite.config.js`；dev server 5175。

Exit criteria：
- [ ] 四態可用 `forceHour` 切換、截圖存檔；預設時辰的畫面逐值等於 P04 之前。
- [ ] rubric／build／e2e 全綠、console error 0；光源 37。
- [ ] WORLD.md §2.2 時辰規則；數字寫進 progress／CHANGELOG。

## v1.2 錯誤紀錄

（沿用 §8 規則：任何錯誤記在此；同一錯誤不原樣重試；連續三種方法仍無法前進才報阻塞。）

- 2026-08-18 · P01：實作 subagent 被 API 連線中斷、再被 session 用量上限中斷各一次 → `SendMessage` 續跑同一 agent，磁碟改動未失；Codex 額度用盡（8/20 前）→ 改 `/code-review high` 獨立審查。
- 2026-08-18 · P01：e2e 五輪才全綠——第 1 輪「石座前 8m 不該有提示」（真問題：濁靈圈蓋到石座圈 → 座標規則升級）、第 2 輪濁靈仲裁測試的寫死座標（改為動態找相疊那一對）、第 3／4 輪各為不同的既有時序斷言（派工檯 `sleep(460)`；開場曲／觀象臺換區），皆非 P01 改動範圍、第 5 輪全過。**觀察**：這台機器同時有其他 Claude session 時 e2e flake 率明顯升高；建議 P25b 把 `sleep(460)` 類斷言改輪詢。


# Promptasy 遊戲性 Roadmap（v1.1 → v2「濁靈之夜」）

> **這是什麼**：v1.1 上線後、以「更好玩」為目標的長程 roadmap。它把五份研究（[遊戲性總研究＋Codex 審查](./gameplay-research-2026-08.md)、[世界觀擴充](./research-worldbuilding-2026-08.md)、[地圖與關卡結構](./research-map-2026-08.md)、[濁靈遭遇 spec](./spec-murk-encounter.md)、[關卡設計參考](./level-design-references.md)）裡的所有方案排成**每一格都能在一次 `/goal` 執行內交付**的 phase 序列。
> **怎麼用**：`/goal` 每次執行時讀本檔，接續 `[~]`（進行中）或取第一個 `[ ]`，做完打 `[x]`、寫 changelog。方案編號（1-A、M3、W-2…）對應各研究文件的表格，細節去那裡查；本檔只管**順序、範圍、依賴、完成定義、預算**。
> **版本**：v2（2026-08-17，吸收 Codex 第一輪審查：拆成 25 個 phase（其中 5 個拆 a/b，共 30 次執行）、修正日出／傳送／勝負／streak／跟隨光靈與鐵則的衝突、補 `/goal` 的恢復與失敗政策、每 phase 補預算）｜ **分支**：`feature/tainted-request-encounter`。

---

## 0. 北極星不變，護欄不變

CLAUDE.md 的五個方向與七條護欄仍是最高準則。本 roadmap 只回答「往哪個順序推」。四條**本 roadmap 專屬的鐵則**（Codex 兩輪審查後定案，任何 phase 不得換詞規避）：

1. **威脅不懲罰、進度只累積**：任何「怪」都不扣分、不掉東西、不傳送、不追人、不倒數；沒有回合勝負、沒有 streak、沒有會過期的任務。玩家對一隻濁靈的理解進度（已命中的檢查）**永不清零**。攻擊＝prompt 品質。（WORLD.md §3.5）
2. **世界裡沒有會走動的 NPC**：新角色一律是「留在原地的東西」（WORLD.md:147/153）。會動的只有頭、光、霧、殼；過關演出可以有短暫的光屑飛散，但**沒有任何實體跟隨玩家、沒有殘影走出小景範圍**。
3. **一律夜景、沒有日出**（WORLD.md:163）：不做日夜循環，做「一夜的時辰」：入夜 → 深夜 → 月落 → **月落後、星最亮的夜**（終態）。不出現黎明、魚肚白、東方發白。
4. **`E` 是唯一互動鍵**；跳躍若上線，用一顆**新的**桌機鍵（不搶 `E`、不搶抬頭的空白鍵，見 P13）。

## 1. 主題：v2「濁靈之夜」

**一句話**：這一夜，你替這片土地上「沒說清楚的話」把話說完；說得越清楚，夜越亮、星越滿。

- **怪物**＝濁靈（沒說清楚的請求結成的霧）；**安撫**＝代它把話說完；安撫後＝清燈。
- **四廠**在世界裡是「四部原典／四宿」（星圖）：出處列與名稱一字不改、世界層文字零公司名、成就頁有免責句、不畫任何標誌（各家品牌指引）。
- **主線弧**：序章問句「抄寫人去哪了、母碑原本寫什麼」→ 中點揭示（分歧之廳：神諭不只一種聽法；凡學會說話的人都是抄寫人）→ 終局（回聲把你序章的第一句 prompt 還給你，你重寫它，母碑重立）。
- **進度外顯**：時辰（天空）、四宿（星圖）、清燈（地面）、衣角光點（角色）——四處同時看得到「我變強了」。

## 2. Phase 序列（25 個 phase／30 次執行，5 個里程碑）

**粒度**：一個 phase ＝ 一次 `/goal` 執行 ＝ 一個 subagent 端到端做完（估 CC 時間 1–3 小時；超過就該再拆）。**每個 phase 都必須**：rubric＋playtest＋build＋e2e 全綠、console error 0、改中文字串跑 `npm run fonts`、WORLD.md 維護檢查表逐條過、`docs/history/CHANGELOG.md` 一行、本檔打勾。**每個 phase 開工前 `/codex consult` 審 brief，收尾前 `/codex review` 審 diff**。**每個里程碑結束＝站長實玩閘門**（見 §3），未過閘門不得開下一里程碑。

**預算基線**（WORLD.md §6.1；每 phase DoD 都要重新實測填數）：三角形 194k／420k、光源 37／56（新增內容一律 0 光源）、碰撞體 957／1,400、collision-audit 未涵蓋 0、每幀零配置。

### 里程碑 A：先讓「遭遇」存在（怪物 × 互動 × 世界觀）

- [ ] **P01 · 濁靈資料層＋世界實體＋互動仲裁**（M）— `src/data/murks.json`（`authored:"game"`，8 隻／前四區各 2；rubric 只引用既有 checks、source 必在 anchors、座標淨空規則）；`src/world/murks.js`（`createMurkField`，reactive.js 樣板：距離分帶、零每幀配置、`murk:<id>` 命名、`solidRadius 0.9`、0 光源、每隻 ≤600 三角）；main.js 第 ⑥ 互動層（半徑 5.5，石座 > 濁靈 > 石碑 > 刻文 > 器物 > 閘門，面向排名）；HUD 提示「濁靈 · 一段沒說清楚的請求 `E` 安撫」；`E` 開既有主控台（challenge 形物件、無 flow → 自動 free）。**本 phase 不做演出、不寫存檔**：`renderResult()` 依 `kind` 分流到最小版 `progression.recordMurk()`——它回傳與 `recordResult` 同形狀的 **outcome**（`xpGain 0、leveledUp false、newly* 空陣列…`）但不落盤，讓既有 `renderResult()` 的解參照全部安全；P02 再補持久化。
  - 依賴：無。方案：1-A（實體半）。Spec §3、§4.1、§4.2。
  - DoD：8 隻可見可互動；rubric 測試驗資料層；碰撞體 +8、collision-audit 0；tris 增量 <5k；e2e：teleport→提示→E→console open→free；舊斷言零改動。

- [ ] **P02 · 濁靈進程與存檔＋圖鑑第四列**（S–M）— 主控台 `renderResult()` 依 `challenge.kind` 選**唯一** recorder：`murk` → `progression.recordMurk(id, evaluation)`（**不**走 `recordResult`、不進 `bestGrades`、不觸發 `refreshUnlocks()`）；存檔新增單一物件欄 `murks: { [id]: { hits:[rubricIndex…], grade } }`（純加法、`normalize()` 給 `{}`、reset 清空）；`hits` 為跨次**累積聯集**（永不清零）；**安撫規則定死**：累積命中的權重和 ≥ `pass` 即安撫（可能仍剩殼——剩的殼變成半透明「餘殼」，之後補上可拿更高評價，全剝＝S）；`grade` 由累積權重和經既有評分函數算出、只升不降；`recordMurk()` **原子回傳** `{ newlyPassedIndices, hits, score, grade, calmed, newlyCalmed }`，供 P03 回呼使用；XP 只補差額（`murks.json.xp`）；圖鑑 `worldFinds()` 第四列「濁言與正言 n/8」＋條目（濁言 → 你的最佳評價 → 範例強句 → 技巧連結 → 出處）；`progression.murkCount()`。
  - 依賴：P01。方案：1-A（進程半）。Spec §4.4、§4.5。
  - DoD：安撫不改「已通關數／稱號／142 分母」（rubric 測試明確斷言）；舊檔載入補 `murks:{}`；e2e：送 taint 原文→未安撫但 hits 可能 >0（**不**斷言殼數不變）→送 sample→安撫、圖鑑 1/8、save 有 id；reset 清空。

- [ ] **P03 · 濁靈演出：`onRubricHits` 契約＋剝殼＋清燈＋SFX**（M）— 主控台新增回呼 `onRubricHits({ challenge, passedIndices, newlyPassedIndices, total })`（以 rubric index 為穩定 ID；**時序**：`recordMurk()` 先寫聯集並原子回傳 `newlyPassedIndices`，回呼**用它的回傳值**觸發，顯示結果之前；非 murk 關卡的差量＝「本次開啟主控台 session 內」的差量，記憶體暫存、開面板時歸零）；世界端只對 `newlyPassedIndices` 剝殼（閃白 2 幀、8–12 顆加法粒子、`murkHit` 合成 SFX 依累積數換音高層、`engine.pulse(0.28)`），重開面板時殼數＝存檔 hits 數（不重播）；達標→`murkCalm`、眼光轉暖白、縮成清燈（原位）；**過關演出**＝一撮光屑從濁靈飛出、繞玩家一圈（≤3 秒）回到清燈位（無實體、無碰撞、`reducedMotion` 直接落成清燈）；`murkStir` 靠近雜訊（節流）。
  - 依賴：P02。方案：1-A（演出半）、5-A（最小版）。Spec §2、§4.3、§4.6。
  - DoD：e2e 輪詢式斷言「newly=N → 殼少 N」「重開不重播」；SFX 皆有合成 fallback；tris 增量 <3k；`reducedMotion` 路徑測過。

- [ ] **P04 · 濁靈世界觀文案層 ＋ WORLD.md 修訂**（S）— 研究 W §2：起源（回聲接不住的份量）、安撫語意（代它把話說完）、「清燈」用語；回聲一句（≤31 字）；WORLD.md §1 加「1.6 濁靈與清燈」、§3.2 加第 ⑥ 層、§3.5 加「濁靈沒聽懂＝殼還在，不是失敗」、§4 加濁靈擺放規則、§8 檢查表加濁靈項；禁字表逐句過；`npm run fonts`。
  - 依賴：P03。方案：W-5（文案部分）。
  - DoD：`zh-scan` 通過；文案量 ≤ 30 句；e2e 舊斷言零改動。

- [ ] **P05 · `setMood` 單一入口 ＋ 一夜的時辰**（M）— 把 `engine.setMood()` 擴成 `{ fog, tint, hemi, fogNear, fogFar, exposure, moon:{alt, phase}, stars:{density}, aurora:{intensity, hue} }`（月亮 sprite 遮罩、星點 shader uniform、極光 uniform 都收進來）；時辰 = f(清燈數／精通區數／技能數) 四態：入夜／深夜／月落／星最亮之夜；時辰只乘「因子」不換色系（霧亮度 ±10%、hemi ±0.08）；`window.__promptasy.engine.forceHour(n)` 供 e2e 與截圖。
  - 依賴：無（可與 A 段任一交錯）。方案：M3。
  - DoD：光源 37；e2e 固定時辰 0 跑舊斷言零改動；四態截圖存 `docs/design/shots/`；WORLD.md §2.2 加「時辰」規則（明寫沒有黎明）。

- [ ] **P06 · 區域色彩腳本 ＋ 軟門檻三態 ＋ 節奏稽核腳本**（M）— 每區 3–5 色 color script（天空上下色、霧、主光 emissive、rim、粒子色）取代單一 accent，經 P05 入口套用；閘門與石座三態自發光（未知＝暗／可去但建議先別＝琥珀／建議去＝主色）；`scripts/pacing-audit.mjs`（沿路網每 5m 取樣，各區 POI 節奏直方圖與 >45m 死區，進 `test:rubric` 當軟警告）。
  - 依賴：P05。方案：4-A、M12、M9。
  - DoD：12 區色卡表寫進 WORLD.md §2.2；三態由 `regions-v2` gate 規格與進度算出（gate 未啟用時只兩態）；pacing-audit 輸出納入 changelog。

**▶ 閘門 A（站長實玩）**：安撫 8 隻濁靈是否比石座更好玩？時辰／色彩是否讀得出進度？砍案條件：若濁靈體感 < 石座，里程碑 B 的 P10 改為「濁靈演出精修」而非鋪石座。

### 里程碑 B：世界觀投遞 I ＋「寫 prompt」的可見後果（世界觀 × 互動 × 重玩）

- [ ] **P07 · 殘頁 ＋ 回信碑 ＋ `firstPrompt` 擷取**（M）— `letters.json`（`authored:"game"`；教學句必附出處、純風味不放連結，同 `secrets.json` 測試規則）＋圖鑑「殘頁」頁；每區 2 頁（24 頁）、放在小景／地標背面、皆有 tell；`LORE_TABLETS` 支援多筆跡（原句／後人補寫／劃掉，字級樣式）；**存檔開始擷取 `firstPrompt`**（序章第一次自由書寫的原文，純文字、≤280 字、HTML escape、只存本機；舊檔無則之後終局改用「你最好的一句」）。
  - 依賴：P04。方案：W-1、W-6（擷取部分）。
  - DoD：`zh-scan`、禁字表；存檔純加法＋reset；e2e 撿一頁殘頁進圖鑑。

- [ ] **P08 · 四宿星圖 ＋ 反應式回聲 ＋ 12 區傳說鉤**（S–M）— 圖鑑徽章區換程序化四宿星圖（星點、無標誌）＋免責句（「原典＝四家公開官方文件；本遊戲與其無隸屬或背書」）、出處列一字不動；回聲依「上一件做的事」換一句（既有 toast 通道，≤2 句 ≤31 字，≥12 條分支）；12 區守護／聲音／傳說鉤（研究 W §4 表）各落 1 塊碑或 1 頁殘頁。
  - 依賴：P07。方案：W-2、W-4（回聲部分）。
  - DoD：世界層文字零公司名（rubric 測試 grep）；成就頁免責句存在；e2e 舊斷言零改動。

- [ ] **P09 · 石座演出 a：回呼接石座 ＋ 4 個 check ＋ 一區試水**（M）— 把 P03 的 `onRubricHits` 接到石座（`kind` 缺省＝challenge）；為 `assignsTask / specifiesFormat / hasConstraint / hasRole` 各設計一段石座周邊演出（光柱分段點亮、石環刻痕逐條浮現、碎石排成表格、碎石定量），未命中**不演出**；只在 foundations 區啟用；演出資料由 check 名對應（`src/world/rubric-fx.js`），**不進 challenges.json**。
  - 依賴：P03、閘門 A。方案：5-A。
  - DoD：142 關資料零改動；tris 增量 <8k、0 光源；e2e 輪詢式「命中 N 條→演出 N 段」；低畫質可關演出。

- [ ] **P10a · 石座演出 b：其餘 4 個 check ＋ 鋪 12 區**（M）— `hasFewShot / hasDelimiters / asksToVerify / groundsInContext` 演出；鋪全部石座（三角形總量檢查）。
  - 依賴：P09。方案：5-A。
  - DoD：tris <215k；低畫質可關；e2e 兩區各驗一關。
- [ ] **P10b · 解法百分位 ＋ 最少技巧徽章**（S）— 過關後「你在第 X 百分位」（內建範例解分布：分數／字數／技巧數三軸，UI 明寫「內建分布」）＋「最少技巧達成」隱藏徽章（**不用「最少字」**）。
  - 依賴：P10a。方案：5-H。
  - DoD：百分位資料 `authored:"game"`；e2e 一關驗百分位顯示；不動 `refreshUnlocks()`。

**▶ 閘門 B（站長實玩）**：石座演出是否讓「寫得更好」變得有感？殘頁／星圖是否被讀？砍案條件：演出若干擾閱讀回饋 → P10 的鋪量回退為「只保留 4 個 check」。

### 里程碑 C：地圖中景 → 垂直（地圖 × 動作）

- [ ] **P11 · 中觀遮擋帶 ＋ 母題（reasoning 一區切片）**（M）— 入口看不到地標、繞過一道石脊才揭露；3–5 個重複母題中景（instanced、emissive、0 光源、lane 外 8m）；橋中段長凳＋框景（lane 外 4m）；WORLD.md §4.7 明寫「遮擋帶」為中景階例外（6–12m）。
  - 依賴：P06（pacing-audit）。方案：M1、M8（母題半）、M11（長凳版）。
  - DoD：collision-audit 0；淨空全保；pacing-audit reasoning 死區數下降；tris 增量 <4k。

- [ ] **P12 · 地面材質語言 ＋ 每區粒子 ＋ 母題鋪 3–4 區**（M）— 地面頂點色第二層（每區 2 色基底＋碎紋，區界 6m 漸變，低畫質 fallback）；每區一種專屬 GPU 粒子（紙屑／火星／花粉／齒輪屑／沙／星塵…）；母題與遮擋帶鋪 grounding／orchestration／config。
  - 依賴：P11。方案：M7、M8、4-C。
  - DoD：tris <225k、碰撞體 <1,050；粒子每區 +1 draw call。

- [ ] **P13 · 可站立表面 `solidTop` ＋ 碰撞稽核擴充（無跳躍）**（M）— `collectSolids` 加 `top`（頂面高度）與「可站立體」類別；`clampPosition`／ground = max(terrain, solidTop) 的資料通路先建好（玩家仍貼地、無跳躍，所以此 phase 玩家行為零改變）；collision-audit 新增可站立體規則、`FLOAT_MIN` 例外語意；WORLD.md §6.3 修訂；**決定跳躍鍵**（建議 `Shift`＝跑不動、`Space`＝抬頭不動、新增 `J`／`Ctrl` 之一，e2e 與 keyhelp 同步）。
  - 依賴：P11。方案：M5（資料層）。
  - DoD：rubric 測試驗 solidTop 資料；e2e 舊斷言零改動；WORLD.md §3.1 加跳躍鍵條目（標「尚未啟用」）。

- [ ] **P14 · 跳躍原型（單區）**（M）— Y 軸與重力、跳（coyote 100ms、input buffer 150ms、鬆手提前下落）、程序化 squash-stretch、落地塵、落地音；只在 foundations 允許（其他區跳躍高度 0，行為不變）；**邊界護欄**：跳躍落點若不在 coverage 內或會穿 solids，起跳即被夾住（不會掉進虛空、無傳送）；`reducedMotion` 保留位移去掉擠壓。
  - 依賴：P13。方案：2-A（只跳）。**本 phase 自建一座 foundations 的 1.6m 測試高台**（也是正式的第一座）。
  - DoD：舊路線全部不需要跳就走得完；e2e 跳上該高台；FPS 低畫質不降。

- [ ] **P15 · 高台語法 ＋ 高處秘密 ＋ 橋缺口（鋪 4 區）**（M）— 每區 2 處 1.6–3.0m 高台（屋頂／欄杆／書架頂／齒輪背，「站上去看得到別的東西」）；secrets 4→12（三種 tell：不對的東西／聲音先到／高處），圖鑑「秘境」章節（純風味無 source）；橋中段 3m 缺口（跳躍後）＋ 旁邊保留可繞行的窄板（不倒退）。
  - 依賴：P14。方案：M5、M10、M11（缺口版）。
  - DoD：collision-audit 0；秘密皆有 tell；不跳也走得完每一座橋。

- [ ] **P16a · 跳躍全區啟用 ＋ 母題／高台鋪 forms／toolcraft／frugality／refinery**（M）— 跳躍高度全區開；四區的中景、粒子、高台。
  - 依賴：P15。方案：M1、M5、M8。
  - DoD：tris <232k、碰撞體 <1,100；四區 pacing-audit 死區 ≤1。
- [ ] **P16b · 母題／高台鋪 wards／sight／divergence ＋ 全區收尾**（M）— 剩餘區；pacing-audit 全區。
  - 依賴：P16a。
  - DoD：tris <240k、光源 37、碰撞體 <1,150；pacing-audit 每區 >45m 死區 ≤1。

**▶ 閘門 C（站長實玩）**：跳躍是否有理由（看得到、想上去）？中景是否讓 12 區讀得出差別？砍案條件：跳躍體感差 → P19 滑翔直接砍。

### 里程碑 D：遭遇 II ＋ 捷徑 ＋ 收攏故事（怪物 × 地圖 × 世界觀 × 小知識）

- [ ] **P17 · 大濁靈（累積理解式）＋ 濁言圖鑑分層**（M）— 每區 1 隻大濁靈（原地、體積大、多殼、rubric 6–8 條）：**沒有回合、沒有勝負**——每次送出把新命中的檢查累積上去（沿用 P02/P03 契約），殼剝完即安撫；圖鑑分層：安撫開濁言、A 開抄寫人眉批、S 開一句來歷（純風味）；規則疊加關型（每一層殼揭示下一條限制，Password Game 式，但已剝的殼不會回來）。
  - 依賴：P10a。方案：1-B（改造後）、5-F、W-5 分層。
  - DoD：無任何清零／勝負文案；rubric 只引用既有 checks；tris 增量 <6k。

- [ ] **P18 · 護欄崗守門者（離線腳本）＋ 選配 LLM 模式**（M）— wards 區守門者＝「有 system prompt 的守衛」（教注入防禦／護欄／指令階層）：離線＝腳本化狀態機（≥12 條分支，對「你用的技巧」反應）；線上 LLM 模式僅選配（既有 API key 設定），核心迴圈不依賴；無失敗態（守衛「還沒被說服」）。
  - 依賴：P17。方案：1-D。
  - DoD：離線腳本可獨立通關；e2e 走離線路徑；線上模式關閉時零 console error。

- [ ] **P19 · 相鄰區捷徑（一條）＋ 外交式導向 ＋ 滑翔決策**（M）— `SHORTCUTS[]` 資料、窄走廊地形（half 4／flat 2，`coverage()` 逐點驗、不出 ±168）、單側解鎖（既有 `capstan` 文法）、存檔 `shortcuts:{id:bool}`；先做 orchestration↔config 南弧；外交式導向：螢火群整體流向「下一個建議去處」（可在設定關閉）；**phase 開頭 `/codex consult` 決定滑翔做不做**（若做，起飛台＝地標平台、落點＝捷徑另一端，排入 P24 前一格）。
  - 依賴：P16。方案：M2、M4、M6（決策）。
  - DoD：未解鎖真的走不過（e2e）；守望石仍在；WORLD.md §4.4 加導向規則。

- [ ] **P20a · 傳聞連線頁 ＋ 回聲重演（小景內）**（M）— 圖鑑「傳聞」頁（Outer Wilds Rumor 式，`links:[[a,b]]` 純資料，不加存檔欄，未找到的一端只畫虛線不劇透）；回聲重演：每區 1 處小景旁一團坐著的光，`E` 後 4–6 秒 rigless 殘影**在小景範圍內**重演（零碰撞零光源，`reducedMotion` 直接顯示結果）。
  - 依賴：P08。方案：W-3、W-4。
  - DoD：e2e 舊斷言零改動；重演不離開小景 6m。
- [ ] **P20b · 檔案廊（AI 小知識 24 則）**（M）— 每區一座小展館：收集到的技巧＝展品，走近浮出小知識（不彈窗）。**小知識的分工**：`glossary.json`（術語小卡，24 條，§3.7）＝「是什麼」、130 技能＝「怎麼做」、小知識＝「為什麼／背後機制」（token、context window、temperature、指令階層、注入為何有效…），來源限官方文件與一手論文，每則 ≤ 60 字＋出處，`authored:"game"`，先寫 24 則（每區 2）。
  - 依賴：P20a。方案：5-B（博物館部分）。
  - DoD：小知識每則附出處、`zh-scan`；圖鑑三分法（Lore／Creatures／Research）成形；e2e 舊斷言零改動。

- [ ] **P21 · 中點揭示 ＋ 鏡碑第二層**（S–M）— 分歧之廳兩面柱＋回聲一句＝中點揭示（觸發：走進分歧之廳；跳門者不錯過）；校驗場鏡碑第二層（「凡學會說話的人都是抄寫人」，綁稱號鏈第三階）。
  - 依賴：P08、P17。方案：W-6（中點）。
  - DoD：兩段皆加法（多碑多句）；未達門檻只是「碑還沒亮」。

- [ ] **P22 · 終局：回聲的小祠 ＋ 母碑重立**（M）— 130 技能全收＋四宿全亮 → 小祠開口 → 最後一隻濁靈＝你的 `firstPrompt`（無則「你最好的一句」）→ 重寫（free、任何 rubric、不會失敗）→ 母碑在斷環中央重立、刻你的句子（**分享前確認**、HTML escape、可選擇不刻）→ 分享卡新樣板；時辰到終態「星最亮之夜」。
  - 依賴：P05、P07、P21。方案：W-6（終局）。
  - DoD：reset 後可重走；私人內容不會未經確認出現在分享卡；e2e 用測試存檔走完終局。

**▶ 閘門 D（站長實玩）**：主線是否有「啊哈」？大濁靈是否值得再鋪？砍案條件：大濁靈體感平 → 不擴量。

### 里程碑 E：進程、擴量、打磨

- [ ] **P23 · 進程外顯 ＋ 今日三事（無過期）＋ 成就**（M）— XP／等級外顯成角色衣角光點格數（Sky cape 式）；「今日三事」＝每天換三個**提議**（重解一關拿 S、找一處線索、拜訪一區；本地時間；不做完不會消失、沒有 streak、可在設定關閉）；成就與四宿全亮的既有隱藏成就整理。
  - 依賴：P22。方案：2-B（外顯）、5-G（改造後）。
  - DoD：不動 `refreshUnlocks()`；存檔純加法；無倒數／過期文案。

- [ ] **P24 · 行動裝置操作（功能凍結後）**（M–L，可拆 a/b）— 見 [GitHub #4](https://github.com/romanticamaj/promptasy/issues/4)：`src/input/` 共用 action state、`player.js` 改讀 state、`main.js` 抽 `interact()`、動態搖桿＋鏡頭區＋≥44px 情境鍵（含跳躍）＋`visualViewport` 鍵盤高度、`pointer:coarse` 預設 low quality。**依賴 P23 功能凍結**：所有新輸入（跳、遭遇、捷徑）都已定型，才一次接進去。
  - 方案：3-A、3-B、3-D。
  - DoD：390×844 直向走完「移動→開石座→自由書寫→關面板繼續走→跳上高台→安撫一隻濁靈」；鍵鼠零回歸；e2e 觸控斷言；iOS Safari／Android Chrome 各實機一次。

- [ ] **P25a · 打磨：果汁複核 ＋ 音訊 ＋ 無障礙**（M）— game-feel 複核（只保留不造成壓力的：squash、粒子、音層、`pulse`）；12 區 SFX／BGM 補錄（**以 `src/audio/audio.js` 與 WORLD.md §6.5 為準：BGM -20 LUFS、SFX -19 LUFS、峰值上限 -3 dBFS**；順手把 CLAUDE.md 那句「SFX 峰值 -6 dBFS」改成一致）；無障礙（reduced-motion 全覆蓋、螢幕閱讀器路徑）。
  - 依賴：P24。方案：2-C（子集）。
- [ ] **P25b · 效能回歸 ＋ 測試收斂 ＋ v2 發版**（M）— 低階機 low quality 30fps；e2e flaky 清零；README／CLAUDE.md 數字同步；`expected-counts.json` 契約更新；`docs/history/prompts.html` 補 v2 goal；v2 發版。
  - 依賴：P25a。

### 可夾帶項（任一 phase 順手做，S，各自 ≤ 半小時）
- 4-B Toon／描邊或低解析後製（畫質設定可關）；開主控台時隨機一句 tip（來自小知識）；圖鑑「還有 N 條相關未發現」；技巧牌桌（5-E，只在圖鑑內的練習模式，不進世界）。

## 3. 里程碑閘門（站長實玩）

每個里程碑結束時 `/goal` **停下來**、在 changelog 寫「閘門 X 待站長實玩」，並列出：本里程碑新增的可玩內容、建議實玩路線（≤10 分鐘）、砍案條件。站長回覆「過」或「砍 P??／改 P??」後才繼續。**這是自動測試回答不了「好不好玩」的補償機制。**

## 4. 依賴圖（文字版）

```
P01→P02→P03→P04 ─┐
P05→P06 ─────────┼─▶ 閘門A ─▶ P07→P08 ─┐  P09→P10a→P10b ─▶ 閘門B
                 │                     └────────────────┘
閘門B ─▶ P11→P12→P13→P14→P15→P16a→P16b ─▶ 閘門C
閘門C ─▶ P17→P18 ─▶ P19          P20a→P20b→P21→P22 ─▶ 閘門D   （P17 依 P10a；P20a 依 P08；P22 依 P05、P07、P21）
閘門D ─▶ P23 ─▶ P24（功能凍結後）─▶ P25a→P25b v2
```

## 5. 每個 phase 的固定流程（`/goal` 的操作定義）

0. **恢復狀態**：`git status` 檢查工作樹。**有來源不明或非本 phase 的未提交／已暫存改動時：不得 stash、不得 reset、不得納入 commit；若與本 phase 目標重疊即停下請示，不重疊則繞開它們工作**。讀本檔：有 `[~]` 就續做該 phase（讀其 brief 與 changelog 末條），沒有就取第一個 `[ ]` 並改成 `[~]`。若遇到「▶ 閘門」且上一里程碑剛完成、changelog 沒有站長「過」的紀錄 → 寫閘門摘要、**停止**。**若該 phase 依賴 §6 尚未決定的事項（P01 依 §6-1；P08 依 §6-2；P21 依 §6-3；P07 依 §6-4；P13 依 §6-5；P19 依 §6-6）且 changelog／brief 目錄找不到站長決定 → 停下請示**。
1. 讀 `CLAUDE.md`（護欄＋Harness）→ `docs/history/CHANGELOG.md` 最後幾條 → 本檔 → 該 phase 引用的研究文件段落 → `WORLD.md` 相關節。
2. 寫 **phase brief** 到 `docs/design/briefs/P<NN>.md`（現狀、目標、範圍、非目標、預算、驗證、禁區）；`/codex consult` 審 brief，吸收合理意見。**若 brief 顯示 phase 超過一次執行量 → 先在本檔拆成 a/b，只做 a。**
3. 交**一個** subagent 實作（不並行寫程式）。禁區永遠包含：`curriculum.json`、`challenges.json`／`flows.json`（除非 brief 明列）、`vite.config.js`、使用者 dev server 5175、`CLAUDE.md`（changelog 由 orchestrator 寫）。
4. 驗證：依 CLAUDE.md 測試策略——每個 phase 至少 `npm run test:rubric` → `npm run test:playtest` → `npm run build`；動到互動流程／世界／存檔的 phase 跑完整 `npm run test:e2e`（本 roadmap 幾乎每個 phase 都算），純文案／資料微調可只跑快檢並在 changelog 註明；subagent 全綠則 orchestrator 只快檢（rubric＋build＋curl）；改中文字串 → `npm run fonts`。**測試失敗**：先定位修復；已知 flaky（拖曳／火盆／風鈴時序）只重跑一次；**禁止刪除或放寬既有斷言**（設計變更需重釘的斷言要在 changelog 說明理由）。
5. `/codex review` 審 diff；**P1 必修**、P2 判斷並記錄；再跑快檢。**Codex 與護欄／本檔衝突時，護欄與本檔優先；Codex 指出的護欄違反則必修。**
6. 收尾：WORLD.md 維護檢查表逐條過、`docs/history/CHANGELOG.md` 一行（做了什麼＋預算實測數字＋下一步）、本檔 `[~]`→`[x]`（範圍有變就改本檔）、**commit 前 `git diff --cached --stat` 確認 staged 只含本 phase 的檔案**、commit（訊息繁中；**不切分支**、留在當前 feature 分支；push 僅在該分支已有 upstream 時）。**做完即停**，不連做下一個 phase。
7. **停下請示**的情況：護欄衝突、Codex P1 無法在本 phase 內解、範圍要砍或大改、里程碑閘門、需要新資產授權、任何要動 `curriculum.json` 的念頭。
8. **不倒退**：任何 phase 都不得刪既有可玩內容；不留壞建置（做不完就把可獨立交付的部分交付、其餘標回 `[ ]` 並寫進 changelog）。

## 6. 待站長決定（開 P01 前）

1. 濁靈名字外觀（「濁靈／濁言／清燈」）與數量（8 隻前四區 vs 12 區各 1）。
2. 四廠世界化採「四部原典／四宿」（推薦）還是學派別名。
3. 中點揭示觸發：走進分歧之廳（推薦）或精通 6 區。
4. 終局是否記錄 `firstPrompt`（P07 起擷取，新存檔欄）。
5. P13 跳躍鍵選哪一顆（不動 `E`／`Space`／`Shift`）。
6. P19 滑翔要不要（可延到該 phase 用 codex 決）。

---

## 附：`/goal` 文字（站長核准後直接下）

```
/goal 依 docs/design/gameplay-roadmap.md 推進 Promptasy v2「濁靈之夜」，每次只做一個 phase。
流程照該檔 §5：先 git status——來源不明或非本 phase 的未提交／已暫存改動不得 stash／reset／納入 commit，
與目標重疊就停下請示；roadmap 有 [~] 就續做，否則取第一個 [ ] 並標 [~]；phase 依賴 §6 未決事項且找不到站長決定就停；
遇到「▶ 閘門」且 changelog 無站長「過」的紀錄就寫閘門摘要並停止。讀 CLAUDE.md 護欄與 Harness、
CHANGELOG 末幾條、WORLD.md 相關節；寫 brief 到 docs/design/briefs/P<NN>.md 並 /codex consult；
brief 顯示做不完就先在 roadmap 拆 a/b 只做 a。一次只讓一個 subagent 寫碼；禁區：curriculum.json、
challenges.json／flows.json（除非 brief 明列）、vite.config.js、dev server 5175、CLAUDE.md。
測試依 CLAUDE.md 策略：至少 rubric／playtest／build，動到互動／世界／存檔就跑完整 e2e；全綠、console error 0；
改中文字串跑 npm run fonts；測試失敗先定位修復，
已知 flaky 只重跑一次，禁止刪除或放寬斷言。/codex review 審 diff 並修 P1；護欄與 roadmap 優先於 Codex。
護欄衝突、P1 解不了、範圍要砍、要動 curriculum.json 一律停下請示。收尾：WORLD.md 檢查表、
CHANGELOG 一行（含預算實測數字＋下一步）、roadmap 打 [x]、git diff --cached --stat 確認只含本 phase、
commit（不切分支；有 upstream 才 push）。
鐵則：威脅不懲罰且進度只累積、沒有會走動的 NPC、一律夜景沒有日出、E 唯一互動鍵、
內容正確附出處、核心可離線、存檔純加法可重置、每次可執行、不倒退。做完即停。
```

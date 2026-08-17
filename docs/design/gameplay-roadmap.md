# Promptasy 遊戲性 Roadmap（v1.1 → v2「濁靈之夜」）

> **這是什麼**：v1.1 上線後、以「更好玩」為目標的長程 roadmap。它把五份研究（[遊戲性總研究＋Codex 審查](./gameplay-research-2026-08.md)、[世界觀擴充](./research-worldbuilding-2026-08.md)、[地圖與關卡結構](./research-map-2026-08.md)、[濁靈遭遇 spec](./spec-murk-encounter.md)、[關卡設計參考](./level-design-references.md)）裡的所有方案排成**可逐一交付的 phase 序列**。
> **怎麼用**：`/goal` 每次執行時讀本檔，挑第一個未勾選的 phase（或接續進行中的），做完打勾、寫 changelog。方案編號（1-A、M3、W2…）對應各研究文件的表格，細節去那裡查；本檔只管**順序、範圍、依賴、完成定義**。
> **成文**：2026-08-17 ｜ **分支**：`feature/tainted-request-encounter` ｜ **狀態**：草稿 → Codex 審查 → 站長核准後成為 `/goal` 的依據。

---

## 0. 北極星不變，護欄不變

CLAUDE.md 的五個方向與七條護欄仍是最高準則。本 roadmap 只回答「往哪個順序推」。三條**本 roadmap 專屬的鐵則**（Codex 審查後定案）：

1. **威脅不懲罰**：任何「怪」都不扣分、不掉東西、不傳送、不追人；失敗態不存在（WORLD.md §3.5）。攻擊＝prompt 品質。
2. **世界裡沒有會走動的 NPC**：新角色一律是「留在原地的東西」（WORLD.md:147/153）；會動的只有頭、光、霧與過關後的短暫演出。
3. **一律夜景**：不做日夜循環，做「一夜的時辰」（入夜→深夜→月落→魚肚白），時辰只隨進度推進。

## 1. 主題：v2「濁靈之夜」

**一句話**：這一夜，你替這片土地上「沒說清楚的話」把話說完；說得越清楚，夜越亮，直到看見東方發白。

- **怪物**＝濁靈（沒說清楚的請求結成的霧）；**安撫**＝代它把話說完；安撫後＝清燈。
- **四廠**在世界裡是「四部原典／四宿」（星圖），出處列與名稱一字不改，世界層文字零公司名，成就頁有免責句。
- **主線弧**：序章問句「抄寫人去哪了、母碑原本寫什麼」→ 中點揭示（分歧之廳：神諭不只一種聽法；凡學會說話的人都是抄寫人）→ 終局（回聲把你序章的第一句 prompt 還給你，你重寫它，母碑重立）。
- **進度外顯**：時辰（天空）、四宿（星圖）、清燈（地面）、翼光式衣角（角色）——四個地方同時看得到「我變強了」。

## 2. Phase 序列

慣例：每個 phase ＝ 一次 `/goal` 執行 ＝ 一個 subagent 端到端做完（大 phase 拆 a/b 兩次執行）。**量**：S ≈ 半次、M ≈ 一次、L ≈ 兩次。每個 phase 都必須：rubric＋playtest＋build＋e2e 全綠、console error 0、改中文字串跑 `npm run fonts`、WORLD.md 維護檢查表逐條過、changelog 一行、本檔打勾。**每個 phase 開工前用 `/codex consult` 審 brief，收尾前用 `/codex review` 審 diff**（交錯審查）。

### 里程碑 A：先讓「遭遇」存在（怪物 × 互動 × 世界觀）

- [ ] **G1 · 濁靈遭遇 v1**（M–L）— 依 [spec-murk-encounter.md](./spec-murk-encounter.md)：8 隻濁靈（前四區各 2）、`E` 開既有主控台（強制 free）、rubric 命中逐殼剝落（閃白＋粒子＋合成 SFX＋`engine.pulse`）、安撫→清燈、圖鑑第四列「濁言與正言」、存檔 `murksCalmed`、第 ⑥ 互動層（半徑 5.5，石座 > 濁靈 > 石碑）。**含世界觀文案層**（研究 W §2：起源、安撫語意、「清燈」用語；回聲一句 ≤31 字）。
  - 依賴：無。方案：1-A、5-A（最小版）、W-5。
  - DoD 見 spec §7；另加：WORLD.md §1 加「濁靈」條、§3.2 加第 ⑥ 層。

- [ ] **G2 · 一夜的時辰 ＋ 區域色彩腳本 ＋ 軟門檻三態**（M）— `setMood()` 收成單一入口（時辰因子 × 區域色盤）；時辰＝f(精通區數／清燈數／技能數)，驅動月高／月相遮罩／星密度／極光強度色相／霧亮度 ±10%；每區 3–5 色 color script（天空上下色、霧、主光 emissive、rim、粒子色）取代單一 accent；閘門與石座三態自發光（暗／琥珀／主色）；`scripts/pacing-audit.mjs`（沿路網每 5m 取樣，輸出各區 POI 節奏直方圖與 >45m 死區，進 `test:rubric` 當軟警告）。
  - 依賴：無（與 G1 可對調）。方案：M3、4-A、M12、M9。
  - DoD：三個時辰狀態可用 `window.__promptasy` 強制切換並截圖；e2e 固定時辰跑舊斷言零改動；光源仍 37；WORLD.md §2.2 加「時辰」與「色彩腳本」規則。

- [ ] **G3 · 世界觀投遞 I：殘頁、回信碑、四宿星圖、反應式回聲**（S–M）— `letters.json`（`authored:"game"`，教學句必附出處、純風味不放連結）＋圖鑑「殘頁」頁；`LORE_TABLETS` 支援多筆跡（原句／後人補寫／劃掉）；圖鑑徽章區換成程序化四宿星圖＋免責句（出處列不動）；回聲依「上一件做的事」換一句（既有 toast 通道，≤2 句 ≤31 字）；12 區守護／聲音／傳說鉤（研究 W §4 表）落到各區 1 塊碑或 1 頁殘頁。
  - 依賴：G1（濁靈條目要進殘頁與傳聞）。方案：W-1、W-2、5-B（殘頁部分）。
  - DoD：殘頁 ≥ 24 頁（每區 2）、皆有 tell（放在小景／地標背面）、圖鑑可讀；`zh-scan` 通過；禁字表（WORLD §3.6）逐句過。

### 里程碑 B：讓「寫 prompt」在世界裡有可見後果（互動 × 重玩）

- [ ] **G4 · rubric → 石座演出（信使模擬機最小版）＋ 解法直方圖**（L，拆 a/b）— G1 已在濁靈上驗證「命中→剝殼」；本 phase 把同一條回呼 `onRubricHits` 接到石座：為最常見的 8 個 check（`assignsTask/specifiesFormat/hasConstraint/hasRole/hasFewShot/hasDelimiters/asksToVerify/groundsInContext`）各設計一段石座周邊的機關演出（光柱分段點亮、石環刻痕逐條浮現、格式對→碎石排成表格、缺限制→碎石溢出…），未命中的項目**不演出**（只在主控台照舊逐條提示）；過關後顯示「你在第 X 百分位」（內建範例解分布：分數／字數／技巧數三軸，誠實標示為內建分布）＋「最少技巧達成」隱藏徽章（**不用「最少字」**）。
  - 依賴：G1 的回呼。方案：5-A、5-H。G4a＝回呼＋4 個 check 演出＋一區試水；G4b＝其餘 check＋直方圖＋鋪全部石座。
  - DoD：142 關資料零改動（演出由 check 名對應，不進 challenges.json）；三角形增量 <15k；e2e 對「命中 N 條→演出 N 段」輪詢式斷言。

- [ ] **G5 · 中觀遮擋帶 ＋ 每區母題／地面材質／粒子（一區切片 → 鋪 12 區）**（L，拆 a/b）— 選 reasoning 做切片：入口看不到地標，繞過一道石脊才揭露；每區 3–5 個重複母題中景（instanced、emissive、0 光源）；地面頂點色第二層（每區 2 色基底＋碎紋，區界 6m 漸變）；每區一種專屬 GPU 粒子（紙屑／火星／花粉／齒輪屑／沙／星塵）；橋中段長凳＋框景。
  - 依賴：G2 的色彩腳本、pacing-audit。方案：M1、M7、M8、M11（長凳版）、4-C。
  - DoD：三角總量 <235k、光源 37、碰撞體 <1,100、collision-audit 0 未涵蓋；pacing-audit 每區 >45m 死區數下降；淨空（石座 5.6、lane ±3.2、出生 7）全保。

### 里程碑 C：垂直（動作 × 地圖）

- [ ] **G6 · 跳躍原型 ＋ 高台語法**（L，拆 a/b）— G6a：Y 軸與重力、跳（coyote 100ms、input buffer 150ms、鬆手提前下落）、程序化 squash-stretch、落地塵、`collectSolids` 加可站立頂面（`solidTop`）＋玩家 ground = max(terrain, solidTop)、碰撞審計新增「可站立體」類別與 `FLOAT_MIN` 例外；**桌機鍵位空白鍵**（現為抬頭看天 → 抬頭改長按或移到別鍵，需 WORLD.md §3.1 修訂並 e2e 更新）。G6b：每區 2 處 1.6–3.0m 高台（屋頂／欄杆／書架頂／齒輪背），高處秘密（secrets 4→12，三種 tell）、橋中段 3m 缺口。
  - 依賴：G5（高台是中景的一部分）。方案：2-A（只跳）、M5、M10、M11（缺口版）。
  - DoD：掉進虛空→回到起跳點（不失敗）；舊路線全部不需要跳就走得完（不倒退）；e2e 新增跳上高台取秘密。**滑翔在此不做**（留 G8 決定）。

- [ ] **G7 · 遭遇 II：大濁靈回合對決 ＋ 護欄崗守門 ＋ 規則疊加關**（M–L）— 每區 1 隻「大濁靈」（原地、體積大、多殼）：Ooblets 式**回合對決**——牠出一段濁言牌，你寫改良版，兩邊 rubric 分數比大小，三回合定勝負（沒贏只是「牠還沒聽懂」，可再來）；護欄崗（wards）的守門者＝離線腳本化的「有 system prompt 的守衛」（教注入防禦／護欄，離線後備必備，線上 LLM 模式僅選配）；規則疊加關（Password Game 式：每回合多一條 rubric 限制）。濁言圖鑑分層（安撫 1 次開濁言、A 開抄寫人眉批、S 開一句來歷）。
  - 依賴：G1、G4a。方案：1-B、1-D（離線版）、5-F、W-5 分層。
  - DoD：全部無失敗態；每隻大濁靈 rubric 只引用既有 checks；wards 守衛的腳本回應 ≥ 12 條分支。

- [ ] **G8 · 相鄰區捷徑環化 ＋ 外交式導向（＋滑翔決策）**（M–L）— 先做一條捷徑（orchestration↔config 南弧，z≈150 界內）：`SHORTCUTS[]` 資料、窄走廊地形、單側解鎖（既有 `capstan` 文法）、存檔 `shortcuts`、e2e 驗「未解鎖走不過」；驗證體感後鋪其餘三條（reasoning↔grounding、config↔forms、toolcraft↔orchestration）。外交式導向：螢火群整體流向「下一個建議去處」（regions-v2 gate 規格）、路網岔口頂點色微亮、迷航 >40s 地標「呼吸」——可在設定關閉。**滑翔（M6）在此 phase 開頭用 `/codex consult` 決定做不做**：若做，起飛台＝地標平台、落點＝捷徑另一端。
  - 依賴：G6。方案：M2、M4、M6。
  - DoD：捷徑不動 ±170 網格外任何點（`coverage()` 逐點驗）；守望石仍在；WORLD.md §4.4 加導向規則。

### 里程碑 D：把故事收攏（世界觀 × 小知識 × 進程）

- [ ] **G9 · 世界觀投遞 II：傳聞連線頁 ＋ 回聲重演 ＋ AI 博物館**（M–L）— 圖鑑「傳聞」頁（Outer Wilds Rumor 式：碑／殘頁／濁靈／壁畫為卡片，找到一端先畫虛線，`links:[[a,b]]` 純資料，不加存檔欄）；回聲重演（每區 1 處：小景旁一團坐著的光，`E` 後 4–6 秒 rigless 殘影重演，零碰撞零光源，`reducedMotion` 直接顯示結果）；每區一座小「檔案廊」（AI 博物館）：收集到的技巧＝展品，走近浮出 30 字作者口吻小知識＋出處（不彈窗）；地標背面程序化壁畫（只有圖）。
  - 依賴：G3。方案：W-3、W-4、5-B（博物館部分）。
  - DoD：小知識每則附官方出處；`authored:"game"`；圖鑑三分法（Lore／Creatures／Research）成形。

- [ ] **G10 · 主線終局：中點揭示 ＋ 第一句話 ＋ 母碑重立**（L）— 分歧之廳兩面柱＋回聲一句＝中點揭示（觸發：走進分歧之廳；跳門者不錯過）；校驗場鏡碑第二層揭示（「凡學會說話的人都是抄寫人」）；存檔新增 `firstPrompt`（序章第一句，純加法，舊檔無則終局改用「你最好的一句」）；130 技能全收＋四宿全亮 → 回聲的小祠開口 → 最後一隻濁靈＝你自己的第一句 → 重寫（free、任何 rubric、不會失敗）→ 母碑在斷環中央重立、刻你的句子 → 分享卡新樣板；時辰到「魚肚白」（G2 的最終態）。
  - 依賴：G1、G2、G3、G7。方案：W-6。
  - DoD：三段皆加法（多碑多句多場景）；未達門檻只是「碑還沒亮」；reset 後全部歸零可重走。

- [ ] **G11 · 進程與重玩：翼光式外顯 ＋ 每日三事 ＋ 成就**（M）— XP／等級外顯成角色衣角光點格數（Sky cape）；每日三事（重解一關拿 S、找一處線索、拜訪一區；本地時間；任務必須教技巧不是 chores）；streak（無懲罰）；技巧牌桌（可選：NPC 出題卡、從已收集技巧打 1–3 張再寫短 prompt，兩段式判定）。
  - 依賴：G4（直方圖）、G10（終局定義「全收」）。方案：2-B（外顯部分）、5-G、5-E。
  - DoD：不動 `refreshUnlocks()`；存檔純加法；每日任務可在設定關閉。

### 里程碑 E：擴量與打磨

- [ ] **G12 · 行動裝置操作**（M–L）— 見 [GitHub #4](https://github.com/romanticamaj/promptasy/issues/4)：`src/input/` 共用 action state、`player.js` 改讀 state、`main.js` 抽 `interact()`、動態搖桿＋鏡頭區＋≥44px 情境鍵＋`visualViewport` 鍵盤高度、`pointer:coarse` 預設 low quality。**若 G6 已上線，跳躍鍵一併進情境鍵**。
  - 依賴：無硬依賴；排最後是因為它擴量不擴好玩。方案：3-A、3-B、3-D。

- [ ] **G13 · 打磨與收斂**（M）— game-feel 果汁複核（只保留不造成壓力的：squash、粒子、音層、`pulse`）、12 區專屬 SFX／BGM 補錄（-20 LUFS／-6 dBFS 慣例）、無障礙（reduced-motion 全覆蓋、螢幕閱讀器路徑）、效能回歸（低階機 low quality 目標 30fps）、e2e flaky 清零、README／CLAUDE.md 數字同步、v2 發版。
  - 依賴：全部。方案：2-C（子集）。

### 可夾帶項（任一 phase 順手做，S）
- 4-B Toon／描邊或低解析後製（畫質設定可關）；M7 地面材質（若 G5 沒做完）；M10 前兩種 tell；開主控台時隨機一句 tip；圖鑑「還有 N 條相關未發現」。

## 3. 依賴圖（文字版）

```
G1 濁靈 ──┬─▶ G3 投遞 I ──▶ G9 投遞 II ──┐
          ├─▶ G4 石座演出 ──▶ G7 遭遇 II ─┼─▶ G10 終局 ──▶ G11 進程 ──▶ G13 打磨
G2 時辰／色彩 ─▶ G5 中景 ─▶ G6 跳躍 ─▶ G8 捷徑 ─┘                    ▲
G12 手機（獨立，可插任一處；建議 G10 後）───────────────────────────────┘
```

## 4. 每個 phase 的固定流程（給 /goal）

1. 讀 `CLAUDE.md`（護欄＋Harness）→ `docs/history/CHANGELOG.md` 最後幾條 → 本檔 → 該 phase 引用的研究文件段落 → `WORLD.md` 相關節。
2. 寫 **phase brief**（現狀、目標、範圍、非目標、驗證、禁區）到 `docs/design/briefs/G<N>.md`；`/codex consult` 審 brief，吸收合理意見。
3. 交 subagent 實作（一個 phase 一個 agent；不並行寫程式）。禁區永遠包含：`curriculum.json`、`challenges.json`／`flows.json`（除非 brief 明列）、`vite.config.js`、使用者 dev server 5175、`CLAUDE.md`（changelog 由 orchestrator 寫）。
4. 驗證：`npm run test:rubric` → `npm run test:playtest` → `npm run build` → `npm run test:e2e`（subagent 跑過全綠則 orchestrator 只快檢）；改中文字串 → `npm run fonts`。
5. `/codex review` 審 diff；P1 必修、P2 判斷；再跑快檢。
6. 收尾：WORLD.md 維護檢查表逐條過、`docs/history/CHANGELOG.md` 一行、本檔打勾＋若範圍有變就改本檔、commit（＋push，若站長的 harness 允許）。
7. **不倒退**：任何 phase 都不得刪既有可玩內容；舊 e2e 斷言只能因設計變更而重釘，不能放水。

## 5. 待站長決定（開 G1 前）

1. 濁靈名字外觀（「濁靈／濁言／清燈」）與數量（8 隻前四區 vs 12 區各 1）。
2. 四廠世界化採「四部原典／四宿」（推薦）還是學派別名。
3. 中點揭示觸發：走進分歧之廳（推薦）或精通 6 區。
4. 終局是否記錄 `firstPrompt`（新存檔欄）。
5. G6 空白鍵改綁跳躍（抬頭看天改長按／別鍵）是否接受。
6. G8 滑翔要不要（可延到該 phase 用 codex 決）。

---

## 附：`/goal` 文字（站長核准後貼進 CLAUDE.md 或直接下指令）

```
/goal 持續推進 Promptasy v2「濁靈之夜」：依 docs/design/gameplay-roadmap.md 的 phase 序列，
每次執行挑第一個未勾選（或進行中）的 phase，照該檔 §4 的固定流程端到端做完：
讀 CLAUDE.md 護欄與 Harness → 讀 CHANGELOG 末幾條與 roadmap → 寫 phase brief 到 docs/design/briefs/G<N>.md
並用 /codex consult 審 brief → 交一個 subagent 實作（不並行寫程式；禁區：curriculum.json、
challenges.json／flows.json 除非 brief 明列、vite.config.js、dev server 5175、CLAUDE.md）→
rubric／playtest／build／e2e 全綠、console error 0、改中文字串跑 npm run fonts →
/codex review 審 diff 並修 P1 → WORLD.md 維護檢查表逐條過 → CHANGELOG 加一行 →
roadmap 打勾 → commit。鐵則：威脅不懲罰、沒有會走動的 NPC、一律夜景、內容正確附出處、
核心可離線、存檔純加法可重置、每次交付可執行、不倒退。大 phase 拆 a/b 兩次執行；
每次只做一個 phase，做完就停，把「做了什麼＋下一步」寫進 CHANGELOG。
```

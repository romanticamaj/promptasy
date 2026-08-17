# 遊戲性擴充研究（Gameplay Research, 2026-08）

> 這份文件是 **設計階段的原料**，不是規格書、也還沒有任何決定。
> 起因：站長希望 Promptasy 更「像遊戲」——地圖上有遭遇／對戰（哥布林之類）、玩家有動作（攻擊、跳躍）、
> 支援手機操作（參考 [Sky: Children of the Light](https://www.thatskygame.com/tc/)）、場景顏色更豐富、
> 把 AI 小知識織進世界、並且有別於「走到石座 → 開文字框」的新互動／動畫形式。
>
> **第一步**（本文件）：上網把玩法好的作品與開源專案的做法查清楚，對照 repo 現況，列出可選方案。
> **成文日期**：2026-08-17 ｜ **不動的東西**：本文件不改任何程式、測試、`CLAUDE.md`。
> 研究由四個並行 agent 完成（Sky＋手機操控／Web 動作戰鬥／教育遊戲＋美術／repo 現況盤點），附錄保留原始報告與全部出處。

---

## 目錄

1. [一頁摘要：建議方案與優先序](#一一頁摘要建議方案與優先序)
2. [Repo 現況盤點（做這些事的地基）](#二repo-現況盤點)
3. [方案總表（18 個，五個方向）](#三方案總表)
4. [核心設計翻譯：「寫 prompt 就是攻擊」](#四核心設計翻譯寫-prompt-就是攻擊)
5. [護欄對照與風險](#五護欄對照與風險)
6. [附錄 A：Sky ＋ 手機觸控研究](#附錄-asky-children-of-the-light--手機優先的-web-3d-操控)
7. [附錄 B：Web 3D 動作／戰鬥參考](#附錄-b瀏覽器-3d-動作戰鬥參考作品與實作方式)
8. [附錄 C：教育遊戲玩法 ＋ 美術方向](#附錄-c教育遊戲玩法參考--風格化低多邊形美術方向)

---

## 一、一頁摘要：建議方案與優先序

四份研究交叉出來的共識：

- **不要做「傳統打怪」**。世界基調（WORLD.md：平靜的夜間探索）、護欄 1（學習優先）、以及所有 cozy 遊戲的教訓（Sky／Journey／A Short Hike）都指向同一件事：威脅可以有，但**不能死、不能掉進度**；「攻擊」的最佳翻譯是 **prompt 品質本身**（Typing of the Dead、1001 Nights、Gandalf 都是這條路）。
- **手機支援是最大缺口，而且必須兩件一起做**：世界層的觸控移動（目前完全沒有），＋ 主控台的鍵盤感知版面。少一件都不算「手機可玩」。
- **「寫完 prompt → 世界真的變了」是最強槓桿**。現在回饋是分數與文字；如果 rubric 命中項目能驅動可見的演出（機關動、怪物被說服、箱子排整齊），既補「互動形式多樣」也補「遊戲性」，且可套用到既有 142 關而不改資料。
- 顏色與小知識是**低成本高感知**的補強，適合當每個 phase 的搭配項目。

**建議的四個階段（每階段一個 phase、可獨立交付）**

| 階段 | 方案 | 為什麼先做 | 工程量 |
|---|---|---|---|
| **P1** | **單手觸控層（Sky 式）＋ 主控台手機版** — 動態搖桿、右半邊拖鏡頭、長按＝互動、情境式大鍵；主控台用 `visualViewport` 貼鍵盤 | 唯一「沒有就完全玩不了」的缺口；也是 CLAUDE.md 路線圖明列的最大缺口 | M |
| **P2** | **言靈對決（遭遇即出題）** — 地圖上遊蕩的「爛請求」小怪（哥布林＝一段模糊 prompt），靠近觸發現有主控台；rubric 分數 → 傷害演出、缺的 check → 護盾＋提示；勝利後怪物「被說服」入圖鑑 | 最貼核心、重用全部評分引擎；給「戰鬥」的體感但不違反 cozy | S–M |
| **P3** | **輕動作層** — 跳躍（＋短滑翔）、閃避、木杖輕擊；敵人 Yuka 式 seek/wander、碰到只「偷線索碎片」（Journey 圍巾式損失，可拾回）；含 hitstop／screen shake／squash-stretch 果汁 | 補「動作手感」；跳躍開新探索路徑；建立實體層與狀態機供後續複用 | M |
| **P4** | **信使模擬機（Output Simulator）＋ 區域色彩腳本** — rubric 命中項目驅動機關演出；每區 5 色調色盤驅動天空／霧／主光／rim／粒子 | 「回饋要教學」的最強實作；顏色拉高區域辨識與進度感 | L ＋ M |

搭配項目（任一階段可夾帶）：AI 博物館＋手冊殘頁（小知識）、技巧牌桌、規則石陣、每日三事。

---

## 二、Repo 現況盤點

（完整版見 agent 報告；這裡只留跟本題直接相關的事實，皆為實測。）

**地基**
- Vite 6 ＋ three.js 0.170，純前端零後端；`src/main.js` 的 `boot()` 一次組裝所有系統；引擎 `src/engine/engine.js` 提供 `onUpdate(fn)` 註冊回呼、`setMood()`、`setQuality()`（high＝EffectComposer＋UnrealBloom＋自寫 filmic `GradeShader`）。
- **沒有 ECS／實體管理器**：會動的東西各自掛在 `engine.onUpdate` 或 world/reactive/handles 的 `update()`。要加敵人得自己開一層。
- 玩家 `src/player/player.js`：第三人稱、damp 加減速、跟隨鏡頭＋避障；**沒有跳躍、沒有重力、沒有 Y 軸物理**（`y = terrainHeight(x,z)` 直接貼地）。全 repo grep `jump / hostile / combat / HP` 皆 0。
- 角色 `src/player/character.js`：**rigless 程序化動畫**（巢狀 Object3D 關節＋相位正弦），無骨架、無 GLTF、無 Mixamo → 加攻擊／受擊／跳躍姿態＝在 `update()` 加相位項，不需匯入動畫檔。
- 碰撞：`src/world/world.js` 把場景攤成一組 2D 圓柱 `{x,z,r}`（~957 筆），`solidAt()` **線性掃描**、無空間網格；`clampPosition()` 切線滑行、`escapeSolid()` 保險絲。可直接給 NPC 共用。
- 最接近「敵人 AI」的既有樣板：`src/world/reactive.js` 的 `buildSpirit()`（守望小獸：進 4.2m 竄開、~9s 回來、`away/hop/facing` 狀態機、會轉頭看玩家）＋螢火 flocking；觸發器已有扁平 Float64Array＋hysteresis＋距離分級＋音效節流。

**硬規則（WORLD.md §6）**
- 預算：三角形 ≤ 420k（現 194k）、光源 ≤ 56（現 37）、碰撞體 ≤ 1,400（現 957）、穿模稽核必須 0；**新增場景內容原則上不准新增光源**。
- 每幀迴圈：只比平方距離、不 raycast、不算 Y；**零每幀配置**；45m 外整組跳過、15m 外每 3 幀一次；時間敏感互動用計時器。
- 互動文法：**`E` 是唯一互動鍵**（「整趟旅程不碰滑鼠也走得完」）；搶 E 優先序 石座 > 石碑 > 刻文 > 器物 > 閘門；主控台是四幕分鏡（委託→指引→刻印→手印），11 種題型，以「按住 Enter 600ms 手掌印」結尾；**設計上不存在失敗**。
- WORLD.md 明講「新增角色前先問能不能改成一件留在原地的東西」，基調是「平靜的夜間探索，不是恐怖」。

**行動裝置現況（重點）**
- `index.html` 有 `viewport-fit=cover`；`src/styles.css:8052` 起有「行動裝置還債點」註解：面板 720/390px 無水平溢位、觸控目標 ≥40px、輸入框 `font-size: max(16px,…)`；**「世界的觸控移動（虛擬搖桿）刻意不做」**。
- 全 repo grep `touchstart / maxTouchPoints / pointer:coarse / nipplejs` 皆 0 → 手機上面板能讀能點，但**世界層無法移動、沒有 E 的觸控替代**。

**測試**：`npm run test:rubric`（含在 node 蓋整個世界跑碰撞／預算稽核）、`npm run test:e2e`（自寫 CDP 驅動 Chrome，10k 行，console error 一條就失敗，除錯把手 `window.__promptasy`）。新增觸控／敵人都要補斷言。

---

## 三、方案總表

工程量：S ≈ 1 phase 內的小工作、M ≈ 1 phase、L ≈ 2+ phase。「連結」欄＝與「學 prompt」核心的關係（護欄 1）。

### 方向 ①：地圖遭遇／對戰

| # | 名稱 | 一句話 | 參考 | 量 | 連結 | 風險 |
|---|---|---|---|---|---|---|
| 1-A | **言靈對決（遭遇即出題）** | 遊蕩小怪＝寫壞的請求；靠近觸發現有主控台；rubric 分數→傷害演出、漏掉的 check→護盾（＝hint）；勝利後怪物「被說服」入圖鑑（BEFOREAFTER 弱→強對照現成） | Typing of the Dead、1001 Nights、Gandalf 難度階梯、Slime Rancher「收服不殺」 | S–M | 每隻怪＝一項技巧；S 評價可加 Prompt Golf「最少字」條件 | 演出蓋過閱讀回饋；老關卡不得倒退 |
| 1-B | **Ooblets 式回合對決** | 怪出「爛 prompt」牌，玩家寫改良版，兩邊 rubric 分數比大小，三回合定勝負；可加「防禦回合」＝寫 system prompt 護欄 | Ooblets 舞蹈對戰、Pokémon、Tensor Trust 攻防 | S–M | 直接把弱→強對照做成對戰；教護欄 | 節奏偏慢 |
| 1-C | **探照燈型非戰鬥威脅** | 特定區放漂浮「霧眼」巡邏，藍圈視野／變紅追逐；被抓不死、只掉少量光能並被送回區入口；正確 prompt 解鎖安全路徑 | Sky Krill（Dark Dragons）、Journey Guardian | M | 線索／解題換安全 | 破壞平靜基調——限 1–2 區、可關閉 |
| 1-D | **Boss＝守門 LLM（選配線上）** | 各區 boss 是有 system prompt 的 AI 守衛，要說服／突破；離線版用 rubric＋腳本化守衛回應 | Gandalf、Suck Up!、Tensor Trust | M–L | 教 system prompt、護欄、注入防禦 | 護欄 3：離線後備必須夠有趣 |
| 1-E | **Survivors-lite 訓練場** | arena 怪群湧來，每 30 秒一題，答越好自動攻擊越強（分數→DPS）；純幾何體零資產 | VOID PULSE、canvas-vampire-survivors | M | 重玩精進 S 評價的即時回報 | 與 cozy 衝突最大，只能當可選小遊戲 |

### 方向 ②：玩家動作（攻擊、跳躍、閃避）

| # | 名稱 | 一句話 | 參考 | 量 | 連結 | 風險 |
|---|---|---|---|---|---|---|
| 2-A | **輕動作層** | 跳（coyote time、input buffer）、閃避、木杖輕擊；玩家狀態機 Idle/Move/Jump/Fall/Attack/Dodge/Hurt；攻擊用動畫時間點開 hitbox 視窗；敵人碰到只「偷線索碎片」，輕擊可擊退掉回 | swift502/Sketchbook 狀態機、Yuka steering、Tunic 最小輸入集（鎖定＋一顆閃避）、A Short Hike | M | 動作只負責「推開怪／收集線索」，學習迴圈不變；跳躍開新探索路徑 | 需開 Y 軸／重力；碰撞審計；不能讓「不會打」的學習者卡關 |
| 2-B | **Sky 式跳＋長按滑翔＋光能量** | 一顆鍵：點＝跳、長按＝滑翔；能量靠「碰觸光源／解關」回充；XP 外顯成角色身上的光點／衣角格數（翼光） | Sky cape/Winged Light、Apple Behind the Design | M | 進度可視化；收集碎光微升等 | 護欄「學習優先」：收集不能喧賓奪主；存檔遷移 |
| 2-C | **Game-feel 果汁包**（配 2-A） | hitstop 40–90ms、trauma² screen shake、camera kick、squash-stretch、hit flash、粒子、傷害飄字、音效分層、命中 vignette 加深 | Vlambeer Art of Screenshake、Juice it or lose it、Eiserloh GDC 2016 | S | 讓 rubric 分數「打得出來」 | 軟體渲染 e2e 對動畫時序斷言要輪詢式 |
| 2-D | **技能＝Prompt 積木施法** | 解鎖的技巧變成可施放法術（Few-shot 光環、Delimiter 結界、CoT 連鎖…），面對怪先選積木組骨架再補文字 | Scribblenauts、Baba Is You、open-world-builder 技能資料物件 | M | 「學到即變強」具體化 | 玩家只按積木不寫字→保留內容 check 門檻 |

### 方向 ③：手機操作

| # | 名稱 | 一句話 | 參考 | 量 | 風險 |
|---|---|---|---|---|---|
| 3-A | **單手觸控層（Sky 式）** | 動態搖桿（按哪出哪，nipplejs `dynamic` 或自寫 Pointer Events）＋右半邊單指轉鏡頭／雙指縮放＋**長按任意處＝互動（E 的替代）**＋情境式浮現的大顆「互動／開主控台」鍵；`pointer:coarse` 或 <720px 自動啟用、HUD 收成一列 | Sky 單手模式、Apple Behind the Design（「休閒玩家絕不會兩手同時放螢幕上」）、nipplejs、ecctrl 搖桿放 DOM 層 | M | 多指分區與現有 WASD／鏡頭衝突；低階機要同步降畫質；e2e 要模擬觸控 |
| 3-B | **主控台手機版（鍵盤感知覆蓋層）** | 全螢幕 sheet；`visualViewport.resize` 綁高度（差 >60px 才算鍵盤）；技巧積木列貼鍵盤上緣；`interactive-widget=resizes-content`；送出後 `blur()` 收鍵盤回世界；手機不用 Fullscreen API 改 PWA standalone | tkte.ch、bramus viewport-resize-behavior、franciscomoretti dvh | S–M | iOS Safari 版本差異，需真機測 |
| 3-C | **點按移動＋navmesh** | tap 地面走過去、tap 物件走過去並互動；`three-pathfinding` `clampStep` 順便統一碰撞 | three-pathfinding、Sky 情境鍵 | L | 12 區程序化場景要另寫 navmesh baking；與 3-A 二選一或互補 |
| 3-D | **<720px 版面總整理** | `dvh/svh`、`orientation` 分橫直、觸控目標 ≥44px、面板改全螢幕 sheet 並暫停搖桿、`env(safe-area-inset-*)`、`setPixelRatio(min(dpr,1.5))`＋後製可關 | 通用最佳實務 | S–M | — |

### 方向 ④：場景顏色／美術

| # | 名稱 | 一句話 | 參考 | 量 | 風險 |
|---|---|---|---|---|---|
| 4-A | **區域色彩腳本（color script）** | 每區 3–5 色（天空上下色＋霧色＋主光＋rim 補色）驅動 `setMood`／天空 shader／粒子色；走進新區「顏色變了」＝進度感 | Monument Valley 色彩節奏、Sky/Journey 各 realm 調性、80.lv「光層級當導演」 | M | 需與現有 PALETTE／mood 系統整合 |
| 4-B | **Toon＋描邊 或 A Short Hike 低解析度後製** | `MeshToonMaterial`+gradientMap＋OutlinePass；或 render-to-texture 降解析＋色階分級 | sbcode toon、Sable ligne claire、A Short Hike 製作談 | M | 描邊在低多邊形密集場景會雜；SwiftShader e2e 變慢→畫質設定可關 |
| 4-C | **風格化草／水／GPU 粒子** | 單三角草片 instancing、Codrops 蓬鬆草、風格化水 shader、GPGPU 螢火／花粉／落葉綁區域色 | Bruno Simon、Codrops | M | 三角形預算（現 194k/420k） |

### 方向 ⑤：AI 小知識 ＋ 新互動／動畫形式

| # | 名稱 | 一句話 | 參考 | 量 | 連結 | 風險 |
|---|---|---|---|---|---|---|
| 5-A | **信使模擬機（Output Simulator）** | 寫完 prompt 不是彈分數，而是機關／NPC 依 rubric 命中項目「演出」：格式對→箱子整齊、缺限制→箱子爆量、無角色→答非所問；失敗要「好看」（KSP） | Elevator Saga、Human Resource Machine、CodeCombat、KSP | L | 離線 rubric 變可見因果；套用既有 142 關不改資料 | 每類 check 一段動畫；先做 6–8 個常見 check |
| 5-B | **AI 博物館＋手冊殘頁** | 每區一座小展館，收集技巧＝展品（30 字作者口吻小知識）；Tunic 式「AI 手冊殘頁」散落地圖拼出 token／context window／temperature 圖解；Outer Wilds Rumor 式「還有 N 條相關未發現」 | Animal Crossing 博物館、Tunic、Hades Codex、Outer Wilds Ship Log、Hollow Knight 獵人日誌 | S–M | 小知識自然融入探索；每則附官方出處（護欄 2） | 文案量→`authored:"game"` 層＋重跑 `npm run fonts`；走近浮出不彈窗 |
| 5-C | **規則石陣（Baba Is You 式）** | 地上字塊 [輸出][是][表格]／[你][是][資深編輯]，推成句子即生效、門開／守衛態度變 | Baba Is You | M | 體感「角色／格式／護欄＝改變世界規則」；字塊對應 technique id | 每關限 3–5 塊；推動邏輯照碰撞硬規則 |
| 5-D | **魔像工坊（拖放積木／Parsons 排序）** | 拖 prompt 積木或排序殘缺段落修好魔像，魔像依命中項目做不同動作 | Blockly、Parsons problems 研究（等效學習、更省時）、while True: learn() | M | 教結構與順序（長脈絡在前、指令在後） | 觸控拖放與 720px 版面尚未做 |
| 5-E | **技巧牌桌** | NPC 出題卡，玩家從已收集技巧打 1–3 張，牌組有 synergy；先選招再寫短 prompt | Slay the Spire、Inscryption | M | 教「何時用哪招」；圖鑑從獎盃變資源 | 兩段式判定避免「選對卡亂寫也過」 |
| 5-F | **規則疊加關（Password Game 式）＋說服型 NPC** | 每回合多一條 rubric 限制，prompt 要改到全部同時滿足；NPC 用狀態機對「你用的技巧」做不同反應 | The Password Game、Suck Up!、Disco Elysium | S–M | 多重限制、自我檢查、語氣 | — |
| 5-G | **每日三事＋靈的記憶追蹤** | 每日 3 小任務（重解一關拿 S、找一處線索、拜訪一區）；新關型「跟隨光軌」先追線索軌跡到 NPC | Sky Daily Quests、Spirits 重演記憶、Duolingo streak | S–M | 任務要真的教技巧 | 本地時間可改；別變 chores |
| 5-H | **解法直方圖／雙軸最佳化徽章** | 過關後顯示「你在第 X 百分位」（內建範例解分布：分數／字數／技巧數）；隱藏「最少字達成」挑戰 | Zachtronics 直方圖、HRM OCD 挑戰、Prompt Golf | S | 精進 S 評價的動機 | 分布是內建假資料，要誠實標示 |

---

## 四、核心設計翻譯：「寫 prompt 就是攻擊」

這是把「地圖對戰」與「學習優先」接起來的關鍵想法（來自 Typing of the Dead／1001 Nights／Gandalf 的共同模式）：

- **哥布林＝一個寫壞的請求**（模糊、無格式、只說不要）。牠的「弱點」＝這關要教的技巧（`specifiesFormat`、`hasFewShot`…）。
- **傷害＝現有 rubric 分數**；命中的 check 逐條打出「弱點爆擊」；漏掉的 check 顯示為**護盾**（護盾文字就是 hint）。
- **敵人不會殺你**：只會「把提示筆記打亂／偷走線索碎片」（Journey 圍巾式損失，可拾回）。
- **收服而非殺死**：打敗後變成圖鑑裡的「弱 prompt vs 強 prompt」條目（`BEFOREAFTER` 資料剛好可用）。
- **S 評價的額外條件**可借 Prompt Golf：用最少字達標。
- 這條路線的三個實作層次由淺到深：1-A（重用主控台，只加 FSM＋演出）→ 2-A/2-C（真的能揮杖、跳、閃）→ 5-A（rubric 命中驅動世界演出）。

---

## 五、護欄對照與風險

| 護欄 | 對本題的意義 |
|---|---|
| 1 學習優先 | 動作層只能是「推開／收集／通行」，解決問題仍要寫 prompt；收集物不能喧賓奪主 |
| 2 內容正確附出處 | 小知識／怪物條目一律 `authored: "game"` 層＋真實官方連結；`curriculum.json` 不動 |
| 3 核心可離線 | 1-D 的 LLM boss 必須有腳本化離線後備 |
| 4 存檔可重置 | 新欄位（光能、收服圖鑑、每日任務）走純加法＋`migrate()` |
| 5 每次可執行 | 觸控／敵人各要補 e2e 斷言（輪詢式，不對齊牆鐘） |
| 7 不倒退 | 老關卡照玩；`E` 單鍵鐵則在觸控上要有等價路徑（長按／情境鍵） |
| WORLD.md 硬規則 | 敵人＝新碰撞體與每幀迴圈：零每幀配置、距離分級、不加光源（用 emissive）；碰撞體預算 1,400 |
| 基調 | 「平靜的夜間探索」——威脅限區、可關閉、不死不掉進度 |

**主要不確定／要驗證的**：
- 觸控在低階機的效能（bloom 是主要成本）→ `pointer:coarse` 預設 low quality。
- 開 Y 軸／跳躍後，現有「貼地」碰撞模型與 957 個圓柱是否夠用；是否需要空間網格（現在 O(n)）。
- 敵人放進世界後 WORLD.md 的碰撞稽核與「新增角色前先問能不能改成留在原地的東西」是否要修訂。

---

## 附錄 A：Sky: Children of the Light ＋ 手機優先的 Web 3D 操控

### 1. Sky — 好玩／好摸的地方拆解

**1-1 移動、飛行、斗篷能量**
- **斗篷（Cape）＝等級條**：收集「翼光（Winged Light）」→ 斗篷多一格 wedge（上限 266）→ 飛更高更遠。翼光是「生命值＋等級」合體：被螃蟹／Krill 打到、溺水會**掉翼光**（1–6 格），短時間內可撿回。（[Wiki: Winged Light](https://sky-children-of-the-light.fandom.com/wiki/Winged_Light)、[Steam 完整指南](https://steamcommunity.com/sharedfiles/filedetails/?id=3218476618)）
- **能量回充是「靠近光」**：碰蠟燭、進雲層、跟其他玩家互動都會回充 → 「補給」是社交／探索行為，不是撿血包。
- **飛行分兩層**：跳＝點翅膀鍵、長按＝起飛；空中預設「收翼懸停」用搖桿平移，再點「張翼」鍵進俯衝／爬升 → 新手一顆鍵能飛，老手多一層自由度。（[官方 Help Center: Controls & Navigation](https://thatgamecompany.helpshift.com/hc/en/17-sky-children-of-the-light/section/116-controls-navigation/)、[Wiki: Advanced Flying](https://sky-children-of-the-light.fandom.com/wiki/Advanced_Flying)）

**1-2 觸控方案（重點）**
- **左半邊虛擬搖桿**：拖越遠跑越快；**右半邊滑動轉鏡頭、雙指捏合縮放**；靠近可互動物時**情境式動作鍵浮現**；**點角色本身＝開表情輪盤**（也用來「呼喊」讓附近的光亮起）。（[Sky Controls Explained](https://mpratamasky.eu5.org/post.php?id=9)）
- **單手模式（預設）vs 雙手模式（上線後加）**：單手＝搖桿不限左半邊、任何位置按下即出現（dynamic joystick）、鏡頭用雙指、**長按畫面任何處＝跳／飛** → 一隻拇指玩完整個遊戲。雙手＝類手把固定 d-pad、可 Flip Sides、可反轉鏡頭。
- **陳星漢的設計原則**（[Apple Behind the Design](https://developer.apple.com/news/?id=zm47it7t)）：「沒有搖桿／扳機，也不能讓 UI 遮住畫面 → 靠設計＋回饋做到比實體手把更好」；「休閒玩家**絕不會兩手同時放在螢幕上**」→ 先做單手；回饋用「角落細微圓環擴縮」不擋畫面；「最好的設計是輕推（nudge）不是牽繩（leash）」。
- **反面教材**：上線初期 iOS 評論仍批評觸控控制不足 → 觸控 3D 就算 thatgamecompany 也要多年迭代。（[Wikipedia](https://en.wikipedia.org/wiki/Sky:_Children_of_the_Light)）

**1-3 表情／社交**：表情從靈解鎖、多階升級；點角色開輪盤；牽手可帶新手飛；鞠躬是社群禮儀。

**1-4 搜集**：翼光（升等）；靈（Spirits）→ 跟著軌跡「重演記憶」→ 解鎖友誼樹（表情、斗篷、面具、樂器、翼力 buff）；裝飾品是長線動力。

**1-5 非戰鬥「敵人」**：**Krill（暗龍）**——巨大黑色漂浮生物、單一藍眼探照燈掃地面，**藍圈＝視線範圍，變紅＝被發現→快跑**；被撞掉 1–6 翼光。純迴避、無戰鬥。（[Wiki: Dark Dragons](https://sky-children-of-the-light.fandom.com/wiki/Dark_Dragons)）Eden 終局把翼光獻給石像 → 每週重生。

**1-6 進程／日常／經濟**：7 realm 對應人生階段；三種貨幣（蠟燭／心／Ascended Candle）；每日任務 4 顆蠟燭、五類（好友互動、遊戲動作、拜訪祠、找光、重演記憶）；賽季制。（[Wiki: Quests](https://sky-children-of-the-light.fandom.com/wiki/Quests)、[Wiki: Currency](https://sky-children-of-the-light.fandom.com/wiki/Currency)）

**1-7 美術指導**：「數位 3D 的 luminism」，光同時是視覺語言與主題（[GDC: Art of Sky](https://gdcvault.com/play/1026903/Art-of-Sky-Children-of)）。環境美術 Flora Yu（[80.lv](https://80.lv/articles/how-to-design-emotional-game-environments-for-sky-children-of-the-light)）：**光層級當導演**（最強光指向舞台、周圍刻意安靜）；**色彩節奏**（入口壓暗封閉→打開時更亮更柔）；**導航不靠路標**（宏觀地標→中觀路徑／材質／高差→微觀色群／輪廓／光口袋，「玩家覺得是自己發現的」）。

**1-8 可移植到單人小型瀏覽器遊戲**：✅ 一顆鍵「跳＋長按滑翔」、以光為能量、翼光式可視等級條；✅ 單手觸控（動態搖桿＋雙指鏡頭＋長按動作、情境鍵）；✅ 非戰鬥威脅（視野圈＋掉資源不死）；✅ 靈的「跟軌跡重演」→ 關前線索追蹤；✅ 每日 3–4 小任務、光層級導航。❌ 多人社交、賽季付費、7 年手感迭代量級。

### 2. Web 3D 手機觸控最佳實務

- **虛擬搖桿**：[nipplejs](https://github.com/yoannmoinet/nipplejs)（MIT；`mode: static|semi|dynamic`，dynamic＝Sky 單手模式；事件 `move` 給 vector/force/angle）；[three-joystick](https://github.com/SimonMo88/three-joystick)；[pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) 的 `EcctrlJoystick`（搖桿放 canvas 外 DOM 層的做法值得抄）。自寫：Pointer Events＋`setPointerCapture`、`touch-action: none`、`user-select: none`。
- **點按移動＋navmesh**：[three-pathfinding](https://github.com/donmccurdy/three-pathfinding)（`findPath`、`clampStep`）；tap 地面＝走過去、tap 互動物＝走過去並觸發，顯示落點光圈；坡地／遮擋易誤點。
- **鏡頭**：右半邊單指 orbit、雙指 dolly；yomotsu/camera-controls 已內建；多方案並存要做**輸入分區**（`pointerId` 區分多指）。（[codepen: joystick + orbit](https://codepen.io/ogames/pen/rNmYpdo)）
- **動作鍵配置**：右下拇指弧主動作最大顆、次要在其上方；左下搖桿；HUD 靠上；長按任意處＝主動作；`navigator.vibrate` 輕觸回饋；`env(safe-area-inset-*)`。
- **開源範例**：[PiusNyakoojo/PlayerControls](https://github.com/PiusNyakoojo/PlayerControls)、[Henry Egloff Player Controller](https://henryegloff.com/three-js-player-controller/)、[three.js forum: Mobile Character Controller](https://discourse.threejs.org/t/working-on-this-three-js-mobile-device-character-controller-for-some-upcoming-games/62003)、[forum: keyboard + joystick 第三人稱](https://discourse.threejs.org/t/third-person-controller-with-keyboard-joystick-no-mouse/53433)。
- **<720px 版面**：`dvh/svh`；`orientation` 分橫直；觸控目標 ≥44px；主要操作在拇指弧；`setPixelRatio(min(dpr,1.5~2))`＋後製可關；面板改全螢幕 sheet 並暫停搖桿手勢。
- **手機 textarea（主控台）**：iOS Safari 鍵盤彈出**不觸發 window resize**，只變 `visualViewport` → 用 `visualViewport.resize/scroll` 綁主控台高度（差 >60px 才算鍵盤開啟）（[tkte.ch](https://tkte.ch/articles/2019/09/23/safari-13-mobile-keyboards-and-the-visualviewport-api.html)、[bramus](https://github.com/bramus/viewport-resize-behavior/blob/main/explainer.md)）；`interactive-widget=resizes-content` 給 Chrome/Android（[franciscomoretti](https://www.franciscomoretti.com/blog/fix-mobile-keyboard-overlap-with-visualviewport)）；開主控台＝全螢幕 DOM 覆蓋層、暫停 3D 輸入、canvas 降幀；技巧積木列貼鍵盤上方減少打字；送出後 `blur()`；手機模式**不要**進 Fullscreen API（鍵盤常出問題），改 PWA standalone。（[PlayCanvas forum](https://forum.playcanvas.com/t/how-to-stop-canvas-resizing-when-mobile-keyboard-is-in-use/27882)、[itch.io](https://itch.io/t/3849130/overlay-keyboard-for-fullscreen-game-on-mobile-is-broken-goes-on-top-of-the-content)）

### 3. 附錄 A 原始方案（已併入第三節 3-A/3-B/2-B/1-C/3-C/5-G）

建議優先序：單手觸控層 → 主控台手機版（一起做才算「手機可玩」）→ 翼光式外顯進程 → 每日三事 → 探照燈威脅 → 點按移動＋navmesh。

---

## 附錄 B：瀏覽器 3D 動作／戰鬥參考作品與實作方式

### 1. 具體參考作品

| # | 專案 | 做得好的地方 | 機制怎麼做 | 授權／資產 |
|---|---|---|---|---|
| 1 | [swift502/Sketchbook](https://github.com/swift502/Sketchbook)（three.js＋cannon.js 第三人稱遊樂場） | 最經典 three.js 第三人稱範本：走／跑／跳／落地／衝刺、跟隨鏡頭、載具 | **膠囊 raycast 角色控制器＋「general state system」**（每個狀態一個 class：Idle/Walk/Sprint/JumpIdle/JumpRunning/Falling/DropIdle…）；`AnimationMixer` crossfade | MIT；2024-10 封存（鼓勵 fork） |
| 2 | [Mugen87/yuka](https://github.com/Mugen87/yuka)／[showcases](https://mugen87.github.io/yuka/showcases/) | 引擎無關 AI 工具箱：steering（seek/flee/pursue/wander/flock）、FSM、Goal-driven agent、fuzzy logic、A*/navmesh、感知 | 敵人＝`Vehicle`＋`SteeringManager`；行為＝`StateMachine` 或 `Think` | MIT；零依賴 |
| 3 | [Mugen87/dive](https://github.com/Mugen87/dive)＋[Game AI 文章](https://discourse.threejs.org/t/game-ai-how-to-implement-a-basic-deathmatch-shooter/7609) | 完整可玩 AI 對戰示範 | goal-driven 架構、fuzzy 決策、Blender navmesh | MIT |
| 4 | [alexflexcodex/zombieRobot](https://github.com/alexflexcodex/zombieRobot)（[Demo](https://zombie.alexmassy.com/)） | 「一波波敵人衝過來」完整例子 | Yuka 追擊；three.js `Octree` 碰撞（官方 games_fps 同款） | 示範用 |
| 5 | [open-world-builder](https://github.com/open-world-builder/open-world-builder)（Babylon 動作 RPG，[論壇](https://forum.babylonjs.com/t/3d-action-rpg-real-time-combat-demo-full-source/50301)） | 施法條／冷卻／體力、**傷害飄字、命中粒子、命中音效** | **技能是資料物件**（動畫時間點→VFX→分段傷害）→ 很適合「rubric 分數→技能資料→演出」 | 授權不明→只當設計參考 |
| 6 | [orion3dgames/t5c](https://github.com/orion3dgames/t5c)（Babylon＋Colyseus RPG） | 技能、敵人、掉落、UI 骨架 | 敵人 FSM（巡邏／追擊／攻擊）與技能資料表可借鑑 | 開源 |
| 7 | [donmccurdy/three-pathfinding](https://github.com/donmccurdy/three-pathfinding) | 標準 navmesh 尋路 | 自己不產 navmesh；配 Yuka 或自寫 steering | MIT |
| 8 | [Rapier 角色控制器範例](https://threejs.org/examples/physics_rapier_character_controller.html)／[kinematic-character-controller-example](https://github.com/doppl3r/kinematic-character-controller-example) | 內建 `KinematicCharacterController`：上階梯、貼地、斜坡、跳躍 | 跳躍＝加垂直速度；閃避＝短暫高速位移＋無敵旗標；碰撞 query 當 hitbox | Apache-2.0 |
| 9 | [three.js 動畫混合範例](https://threejs.org/examples/webgl_animation_skinning_blending.html)／[additive](https://threejs.org/examples/webgl_animation_skinning_additive_blending.html) | `crossFadeTo`、權重混合、additive（上半身攻擊＋下半身走路） | `AnimationUtils.makeClipAdditive` | MIT；資產 Mixamo |
| 10 | survivors-like：VOID PULSE（three.js、零資產）、[canvas-vampire-survivors](https://github.com/ricardo-foundry/canvas-vampire-survivors)、[topic](https://github.com/topics/vampire-survivors) | 純程序化視覺就有爽感（與 Promptasy「全程序化」一致） | 敵人＝位置＋半徑；每幀 seek＋鄰居排斥；命中＝圓重疊 | MIT |

非開源但值得看：hordes.io（[訪談](https://www.webgamedev.com/interviews/dek-hordes)）；Babylon「Lola」第三人稱範例（[論壇](https://forum.babylonjs.com/t/lola-a-third-person-game-example/54818)）。

**免費戰鬥資產（可商用）**：Quaternius [Ultimate Monsters Pack](https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6)（50 隻怪含 attack/death/run，CC0）、[Goblin](https://poly.pizza/m/OdCOFSmEhl)（CC0）、[Animated Easy Enemies](https://quaternius.itch.io/animated-easy-enemies)、[Universal Animation Library 1/2](https://quaternius.com/packs/universalanimationlibrary2.html)（120+130 段近戰／閃避／跳／受擊，CC0）；Kenney Animated Characters（CC0）；Mixamo（免費可商用，**不可再散布原始動畫檔**，[FAQ](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775)）；[nipplejs](https://github.com/yoannmoinet/nipplejs)。
（註：Promptasy 目前角色是程序化 rigless，若維持這條路，這些動畫包只當**姿態參考**，不需匯入。）

**共同實作模式**：玩家**狀態機**（每狀態管「可否被中斷」＋動畫），攻擊用**動畫時間點開 hitbox 視窗**；敵人 FSM（Idle→Patrol→Chase→Attack→Stagger→Dead）＋steering，感知用距離＋視錐即可；命中＝球／膠囊重疊，之後 **hitstop→擊退→閃白→粒子→飄字→音效**；動畫 crossfade＋上半身 additive。

### 2. 「輕戰鬥但保持 cozy」的設計模式

Cozy 原則（Kitfox [Designing for Coziness](https://www.gamedeveloper.com/design/designing-for-coziness)、[Lostgarden](https://lostgarden.com/2018/01/24/cozy-games/)）：安全、豐足、柔軟；**沒有不可逆的損失** → 不死亡、不掉進度、失敗只是「再想一次」。

- **A Short Hike**：無戰鬥，張力來自地形／體力（羽毛數）→ 跳／滑翔可以是純探索能力。
- **Journey**：Guardian 非致命——被抓只**縮短圍巾**（[Critical Play](https://medium.com/game-design-fundamentals/critical-play-journey-eb4e824a1a91)）→ 敵人碰到玩家只扣「靈感／墨水」。
- **Tunic**：借「Zelda 式鎖定＋一顆閃避鍵」最小輸入集（[分析](https://ffto.blog/2022/06/25/thoughts-on-the-game-design-in-tunic/)）。
- **Ooblets**：舞蹈卡牌對戰取代打鬥、勝負看分數（[Kotaku](https://kotaku.com/ooblets-is-all-about-dance-battles-cute-critters-and-1844424564)）→ 與 rubric 天然相容。
- **Slime Rancher／Pokémon**：收集／馴服不是殺 → 被「說服」後入圖鑑。
- **Typing of the Dead／[The Way of Words](https://graydonk.itch.io/the-way-of-words)**：打字本身即攻擊，敵人頭上顯示要輸入的東西 → 「敵人頭上顯示缺的技巧」。
- **Scribblenauts／Baba Is You**：用字造物、改規則 → 「解鎖的技巧＝你能寫出的詞彙」。
- **1001 Nights**（Ada Eden）：**故事即武器**，AI 依邏輯／連貫／脈絡評分（[premortem](https://premortem.games/2024/09/23/ada-edens-ai-powered-1001-nights-is-a-story-about-narrative-power/)）→ 最接近「prompt 品質＝傷害」的商業實例。
- **Suck Up!**：說服 NPC 開門（[Steam](https://store.steampowered.com/app/2726370/Suck_Up/)）→ 守衛型敵人＝說服關卡。

**AI／LLM 當敵人的遊戲**（[比較文](https://prompttrace.airedlab.com/blog/prompt-injection-game-alternatives)）：Gandalf（關卡制、防禦層數＝難度階梯）；[Tensor Trust](https://arxiv.org/pdf/2311.01011)（同時寫攻擊與防禦 prompt → 教 system prompt／護欄）；[Prompt Golf](https://www.producthunt.com/products/prompt-golf)（字數越少越高分）；HackAPrompt；[Hacc-Man](https://arxiv.org/html/2405.15902v1)（街機外殼提高參與度）；AI Dungeon（純敘事）。

### 3. Game-feel「果汁」清單（three.js 可直接做）

出處：[Vlambeer Art of Screenshake](https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/)、Juice it or lose it、[Eiserloh GDC 2016 Juicing Your Cameras](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf)、[Game feel on the web](https://valdemird.com/blog/game-feel-on-the-web/)、[效果拆解](https://dkliao.itch.io/the-art-of-screenshake-recreation/devlog/451576/quick-breakdown-of-all-the-effects)。

- **Hitstop**：命中瞬間 dt 乘 0～0.05，40–90ms；只凍動畫不凍相機。
- **Screen shake（trauma 模型）**：`trauma∈[0,1]`、實際搖動＝`trauma²`、噪聲偏移＋小角度滾轉、每幀衰減。
- **Camera kick／FOV**：命中反向推相機 2–4cm spring 回；重擊 FOV +3°。
- **Squash & stretch**：起手 (1.1,0.9,1.1)→命中 (0.9,1.1,0.9)→回彈；跳起拉長、落地壓扁（程序化角色最容易）。
- **Anticipation＋follow-through**、**Hit flash**（emissive 閃白 2 幀）、**Knockback**、**粒子**（命中火花 5–12 顆加法混合＋塵土）、**傷害飄字**、**音效分層**（whoosh＋thud＋「叮」依分數換層、音高 ±5%、峰值 -6 dBFS）、**慢動作**（終結擊 0.3× 100ms；閃避成功 witch-time）、**輸入手感**（coyote time 100ms、input buffer 150ms、跳躍鬆手提前下落）、**後製**（命中時 vignette 加深＋色差 1 幀）、**敵人回饋**（護盾碎裂音）。

### 4. 附錄 B 原始方案（已併入第三節 1-A/2-A/2-D/1-B/1-D/1-E）

建議優先序：言靈對決 → 輕動作層 → 技巧積木施法；回合對決／LLM boss／Survivors 視反應再做。

---

## 附錄 C：教育遊戲玩法參考 ＋ 風格化低多邊形美術方向

### 1. 玩法出色的教育／解謎遊戲 → 可移植的教學模式

| 遊戲 | 核心機制 | 可移植模式 |
|---|---|---|
| **Human Resource Machine / 7 Billion Humans** | 極少指令搬箱子；每關「指令數／步數」雙最佳化挑戰 | **雙軸最佳化徽章**（最少字／最少技巧）；程式在畫面上「真的跑起來」是最大賣點。（[7BH](https://steamcommunity.com/app/792100)、[HRM 優化解](https://steamcommunity.com/sharedfiles/filedetails/?id=550015574)） |
| **Opus Magnum / TIS-100 / Shenzhen I/O** | 任何能跑的解都過；過關後三張直方圖跟全球比較；說明書當遊戲內容 | **解法直方圖**（離線內建分布）；圖鑑變成「要翻的手冊」。（[Opus](https://steamcommunity.com/app/558990/discussions/0/2381701715716278004/)、[Shenzhen 教學分析](https://medium.com/games-for-learning/shenzhen-i-o-a-lesson-for-serious-games-66b955de5d58)、[TIS-100 論文](https://gamestudies.org/2401/articles/phipps)） |
| **Baba Is You** | 規則是可推的方塊 | **規則即物件**（[專訪](https://www.gamedeveloper.com/design/designing-i-baba-is-you-i-s-delightfully-innovative-rule-writing-system)） |
| **Portal / Portal 2** | 零文字：每房一個概念、安全驗證、逐步放手 | **Show-don't-tell 序列**（[onboarding](https://medium.com/@mhkt/portal-2-taught-me-everything-i-know-about-onboarding-4e5abf0310c1)、[TVTropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/InstructiveLevelDesign)） |
| **Duolingo** | streak、hearts、聯賽、早期輕鬆勝利 | 離線可做 **streak＋每日一題＋XP 加倍時段**；聯賽需後端→非目標。（[Trophy](https://trophy.so/blog/duolingo-gamification-case-study)、[StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)） |
| **CodeCombat** | 寫碼→角色立刻在地圖上行動 | **寫的東西驅動角色**（[freeCodeCamp](https://www.freecodecamp.org/news/best-coding-games-online-adults-learn-to-code/)） |
| **Untrusted / Elevator Saga / Screeps** | 瀏覽器內寫 JS 改變關卡；可視化模擬 | **可視化模擬器**（[awesome-games-of-coding](https://github.com/michelpereira/awesome-games-of-coding)） |
| **while True: learn()** | 拖節點連線建 ML 管線 | **拖線流程圖**（適合 CoT／prompt chaining／agent 區）（[Steam](https://store.steampowered.com/app/619150/while_True_learn/)、[評析](https://nnnarennnn.medium.com/while-true-learn-game-critique-43ff3e68b561)） |
| **Turing Complete** | 前面做的東西當後面的積木 | **技能即積木**（[Steam](https://store.steampowered.com/app/1444480/Turing_Complete/)） |
| **Kerbal Space Program** | 失敗很好玩、快速重試 | **失敗要好看**（[KSP 教學文](https://ali-a-hussain.medium.com/failures-in-teaching-physics-through-ksp-7319be5f3f3e)） |
| **Flexbox Froggy / CSS Diner / Regex Crossword / SQL Murder Mystery / Vim Adventures** | 一關一概念、30 秒內完成、即時視覺回饋 | **微關卡節奏＋敘事包裝**（[Flexbox Froggy](https://flexboxfroggy.com/)、[Regex Crossword](https://regexcrossword.com/)、[SQL Murder Mystery](https://www.edugamehq.com/games/sql-murder-mystery/)） |
| **Gandalf / Tensor Trust / The Password Game / Suck Up!** | 8 層防禦套密碼；規則不斷疊加；說服 AI NPC | **規則疊加關**＋**說服型 NPC**（狀態機）（[Gandalf](https://zazencodes.substack.com/p/learn-llm-prompt-injection-with-the)、[Password Game](https://neal-fun.fandom.com/wiki/The_Password_Game)） |

### 2. 文字框以外的互動形式（皆可離線用現有 rubric 判定）

| 形式 | 做法 | 參考 | 適合教 |
|---|---|---|---|
| 拖放 prompt 積木 | 角色／任務／脈絡／範例／格式／護欄積木拖進槽位；rubric 檢查組合 | [Blockly Games](https://neal-fun.org/blockly-games/)、Scratch | 結構化 prompt、BUILDER 八積木 |
| 順序／排序（Parsons） | 打亂段落拖成正確順序（可含干擾段）；研究：學習效果等同從零寫、更省時 | [arXiv 2512.22407](https://arxiv.org/pdf/2512.22407)、[含干擾](https://arxiv.org/pdf/2311.00792) | 長脈絡在前、指令在後、few-shot 擺位 |
| 技巧卡牌對戰 | NPC 出題卡，打 1–3 張技巧，組合有 synergy | Slay the Spire（[Cloudfall 分析](https://www.cloudfallstudios.com/blog/2020/11/2/game-design-tips-reverse-engineering-slay-the-spires-decisions)）、Inscryption | 技巧選型 |
| 找碴（spot-the-flaw） | 點出爛 prompt 的 2–3 個問題 | Papers, Please、[Obra Dinn 分析](https://intermittentmechanism.blog/2024/05/20/the-interplay-of-puzzle-and-narrative-in-return-of-the-obra-dinn/) | positive framing、clarity、delimiters |
| A/B 輸出比對 | 兩段模擬輸出選更好者並說明 | 「哪個是 AI 寫的」測驗 | 評估輸出、格式遵循 |
| 修補魔像（填空） | 只缺幾個槽，填對魔像亮 | Regex Crossword、CSS Diner | 約束、量化限制 |
| 規則疊加 | 每回合多一條規則，prompt 要全滿足 | The Password Game | 多重限制、自我檢查 |
| NPC 對「技巧」反應 | 選「你要用的招式」而非句子；狀態機回應 | Suck Up!、Disco Elysium | 角色扮演、語氣、說服 |
| 模擬機器可視化 | 機器依 rubric 命中項目做不同動作 | Elevator Saga、HRM、CodeCombat、KSP | 幾乎全部 |
| 規則字塊推動 | 推 [格式][是][表格] 門就開 | Baba Is You | 格式、角色、護欄 |

### 3. 「小知識」投放模式

- **可收集圖鑑／日誌**（最合適）：[Hollow Knight 獵人日誌](https://hollowknight.fandom.com/wiki/Hunter%27s_Journal)（重複互動解鎖完整條目）；[Outer Wilds Ship Log](https://nh.outerwildsmods.com/guides/ship-log/) Rumor Mode（條目連線、未知處顯示「還有線索」）；[Hades Codex](https://hades.fandom.com/wiki/Codex)（第一人稱作者口吻）。
- **博物館展區**（很合適）：Animal Crossing 每件捐贈有展示標籤式短說明（[Nookipedia](https://nookipedia.com/wiki/Museum)、[Play the Past](https://www.playthepast.org/?p=6880)）。
- **Tunic 手冊頁**（合適且有味道）：56 頁散落地圖、亂序、藏秘密（[Tunic Wiki](https://tunic.fandom.com/wiki/Instruction_Booklet)）。
- **壁畫／石碑**、**NPC 閒話**（放模型差異 `note` 最自然）；**載入畫面提示**不合適（本作無載入）→ 改「開主控台時隨機一句 tip」。

### 4. 美術方向：three.js 低成本拉高感知質感

- **每區 color script**：Monument Valley 把每一幕印出貼牆看色彩節奏（[製作](https://www.creativebloq.com/computer-arts/making-monument-valley-71412213)）。
- **漸層天空＋霧色同步**：Sky/Journey 不同世界不同色調＋角色發光統一風格（[80.lv 專訪](https://80.lv/articles/interview-a-deep-dive-into-the-art-of-sky-children-of-the-light-with-thatgamecompany)）。
- **Toon＋描邊**：`MeshToonMaterial`+gradientMap＋OutlinePass（[sbcode](https://sbcode.net/threejs/meshtoonmaterial/)、[custom toon](https://www.maya-ndljk.com/blog/threejs-basic-toon-shader)、[outline](https://medium.com/@coderfromnineteen/three-js-post-processing-outline-effect-6dff6a2fe3c0)）。
- **Sable ligne claire**：無陰影、細黑線、柔和色塊（[專訪](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability)、[Cook and Becker](https://www.cookandbecker.com/en/article/170/sable-exploration-through-line-art.html)）。
- **A Short Hike 低解析度渲染**：RTT 降解析＋無 AA＋柔描邊＋色階分級（[PS Blog](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/)、[Lospec 調色盤](https://lospec.com/palette-list/a-short-hike)）。
- **風格化草／水**：單三角草片 instancing（Bruno Simon 78,400 片一 geometry）、[Codrops 草](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)、[BOTW 草](https://smythdesign.com/blog/stylized-grass-webgl/)、[Codrops 水](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/)。
- **GPU 粒子**（螢火／花粉／落葉）綁區域調色盤；**Rim light**：每區一盞反向低強度彩光或 toon shader 加 fresnel（注意 WORLD.md 光源預算 → 優先 fresnel）。
- Showcase：[Bruno Simon GitHub](https://github.com/brunosimon)（folio-2019、infinite-world 開源）、[Awwwards three.js 合集](https://www.awwwards.com/awwwards/collections/three-js/)、[Utsubo 2026 精選](https://www.utsubo.com/blog/best-threejs-websites-2026)。
- 免費資產：Quaternius Ultimate Monsters（CC0）、[Kenney Blocky Characters](https://kenney.nl/assets/blocky-characters)（18 角色×27 動畫）、[Poly Haven](https://polyhaven.com/hdris)、Poly Pizza。

### 5. 附錄 C 原始方案（已併入第三節 5-C/5-D/5-A/5-E/5-B/4-A/4-B）

建議優先序：信使模擬機（可見因果，最大槓桿）→ AI 博物館＋手冊殘頁 → 區域色彩腳本 → 規則石陣／魔像工坊／技巧牌桌擇一試水。

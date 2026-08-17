# 地圖與關卡結構研究（Map & Level Structure, 2026-08）

> 研究報告（唯讀研究，未改任何程式）。成文 2026-08-17，由研究 agent 產出、orchestrator 歸檔。上游：`docs/design/gameplay-research-2026-08.md`；下游：`docs/design/gameplay-roadmap.md`。

以下是報告（僅回傳，未動任何檔案）。

---

# Promptasy 地圖與關卡結構研究報告（2026-08-17）

## 〇、現況盤點（讀完 WORLD.md §4/§6、world.js、regions-v2.json、gameplay-research §一/§六）

- **地圖拓樸**：`REGION_SITES` 12 區 ＝ 中央高原（r62）＋ 7 片有橋的土地（`CORRIDORS`：星形放射，橋長各異、`half 9`、閘門在橋正中央）＋ 4 座 `annexOf` 加建（護欄崗/校驗場/減法之庭/分歧之廳，靠覆蓋重疊、無橋、閘門立在正規化距離分界）。地形 ±170 網格已幾乎塞滿（多處註解寫「壓在網格邊界」）。
- **高度**：`terrainHeight` ＝ 各區 `detailFor()` 的小起伏（±3–5 公尺）混合，非覆蓋處往下沉 34 公尺成「虛空」。**沒有可跨越的垂直落差、沒有第二層**；玩家不能跳。所有區之間只有「一條橋」——星形樹狀圖，**零迴圈**（去 A 區再去 B 區一定要走回高原）。
- **導航資產已有**：每區 1 座 21–27 公尺地標（§4.1）、頂點色路網（§4.3）、20–30 公尺一次反應物（§4.4）、4 處 secrets（§4.5，全放地標背面）、指路石/守望石（§4.6）、三高度階（§4.7）、`REGION_ATMOSPHERE` 每區霧色/色偏/hemi、天空為星點＋月亮 sprite＋兩片極光帶（engine.js）。
- **門檻**：`regions-v2.json` 的 `gate` 規格（軟門檻／知識即升級）**尚未啟用**，仍由 `progression.js REGION_GATES` 控管；2026-08-03 起沒有任何硬門檻。
- **研究文件已定調**：下一 phase ＝ 行動裝置輸入基礎，之後才是「rubric→世界因果」單關垂直切片、靜止的受污染請求遭遇、**跳躍探索原型（只做垂直移動）**、色彩腳本可隨時插入。本報告的提案要能接在這條線後面，不與之打架。

---

## 一、外部研究摘要（依題綱 a–g）

### (a) BotW 三角形法則 ＋ Sky 的巨觀/中觀/微觀

- **三角形法則**（Fujibayashi/Takizawa/Dohta GDC 2017；[Kotaku 整理](https://kotaku.com/breath-of-the-wilds-biggest-design-secret-lots-of-tria-1819113140)、[Game Developer 5 lessons](https://www.gamedeveloper.com/design/5-design-lessons-learned-from-i-the-legend-of-zelda-breath-of-the-wild-i-)、[Radiator Blog](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html)）：三種尺寸的三角形——**大＝地標、中＝遮擋視線製造「翻過去才看到」的驚喜、小＝地面質感**；不規則的三角形（多一個尖、一個凹）藏 Korok。三角形同時給「翻過去 vs 繞過去」的選擇 → 玩家路線分散。Nic Phan 的補充（[Gravity to go Forward](https://www.gamedeveloper.com/design/breath-of-the-wild-open-world-analysis-gravity-to-go-forward)）：**往下走比往上便宜**，四座神獸入口全在窪地；用地形當重力，不畫路線。
- **Sky 三層尋路**（Flora Yu, thatgamecompany，[80.lv](https://80.lv/articles/how-to-design-emotional-game-environments-for-sky-children-of-the-light)）：macro＝遠距剪影/空間錨點；meso＝可讀的路、材質變化、高低變化、框景、重複母題；micro＝色群、道具、燈光口袋、獨特形狀。她先用**灰階看場景**（value contrast → 剪影 → 最亮光源），詳細度預算優先給主動線與敘事點，背景只負責剪影與深度。GDC 2020 Tanabe「Art of Sky」（[GDC Vault](https://gdcvault.com/play/1026903/Art-of-Sky-Children-of)）同一脈絡。
- **對照 Promptasy**：macro（12 地標）與 micro（小景、器物、反應物）都很強，**meso 最弱**：橋是唯一的中距離連接、沒有中型遮擋、從高原望出去幾乎一覽無遺——「你翻過去才看得到」這件事目前不存在。

### (b) 跳躍/滑翔後的垂直層

- **A Short Hike**：金羽毛決定能爬/滑多久，「每一根羽毛都真的打開新地方」是最被稱讚的設計（[Scientific Gamer](https://scientificgamer.com/thoughts-a-short-hike/)、[Culture Eater](http://cultureeater.com.au/a-short-hike/)）；山越靠近頂越垂直但仍多路徑；受 BotW「看得到就爬得到」影響。
- **Sky**：翼光升級斗篷 → 飛更高更遠；隱藏翼光多藏在「跳下去信任一次」的隧道或斷崖後（[TheGamer](https://www.thegamer.com/sky-children-of-the-light-winged-light-locations-isle-of-dawn/)、[Fandom](https://sky-children-of-the-light.fandom.com/wiki/Winged_Light)）。滑翔線是「起點高、終點看得見、途中不能停」的一段緩坡動線。
- **Journey**（Chen GDC 2013，[GDC Vault](https://gdcvault.com/play/1017700/Designing)、[Adventure Gamers](https://adventuregamers.com/articles/view/24361)）：遠山＝全程北極星；沙丘與地標提供「移動感」；圍巾長度＝可飛距離，用可見物件外顯能力。
- **對照**：目前世界是平的、內圈 `flat` 完全平坦；跳躍原型上線時若地圖沒有「1.5–4 公尺的台階／屋頂／欄杆」，跳躍會變成沒有理由的按鍵。**要先種「看得到但走不上去」的位置**。

### (c) 可解鎖捷徑與迴圈

- Dark Souls：Firelink 電梯是「第一個 aha」；**繞路要有一點成本，捷徑才是獎勵**（[TheGamer](https://www.thegamer.com/dark-souls-1-fromsoftwares-magnum-opus-of-interconnected-level-design/)、[Roha, Medium](https://medium.com/@Jamesroha/world-design-lessons-from-fromsoftware-78cadc8982df)）。Hollow Knight：單向解鎖、之後雙向可走（[HG101](https://www.hardcoregaming101.net/hollow-knight/amp/)、[MetaFilter 整理](https://www.metafilter.com/188536/The-World-Design-of-Hollow-Knight)）。BorisTheBrave 的 lock-and-key 分類與 soft requirement（已在 `level-design-references.md` #24）；Mega Man 弱點鏈 ＝ 有最佳路線但不強制（#28）。
- **對照**：Promptasy 是星形樹，A→B 一律回高原；**加「相鄰兩區之間的短捷徑」就能把樹變成環**（reasoning↔grounding 之間、orchestration↔config 之間、forms↔config…），而且用「從一側解開」的門就是最便宜的 Souls 式獎勵。

### (d) 夜色時序／天氣／動態天空

- 便宜做法：垂直漸層天球 shader（threejs 官方 [sky sun shader](https://threejs.org/examples/webgl_shaders_sky.html) 太重、太寫實；[threex.daynight](https://github.com/jeromeetienne/threex.daynight) 示範「用時間驅動太陽方向＋天球顏色＋燈光」的最小結構；[三.js 論壇 Complete Sky System](https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311) 有月相/星旋轉的參考）。極光：[Shadertoy XtGGRt](https://www.shadertoy.com/view/XtGGRt)（純程序、幾層 sine noise）與 [Codrops WebGPU aurora silk](https://tympanus.net/codrops/2026/08/11/exploring-procedural-geometry-with-three-js-and-webgpu/)。Sable 的做法值得抄：**霧是每個生態區客製的，且霧本身就是日夜循環的骨架**（[Game Developer](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability)、[GDC 2022 The Art of Sable](https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection)）。
- 「時間標記進度」的先例：Journey 白天→黃昏→夜→暴風雪→黎明；Sky 六個 realm 從清晨走到黑夜再到暴風眼；Firewatch 各章節不同時段（[GDC 2015 Art of Firewatch](https://gdcvault.com/play/1022295/The-Art-of)）。**結論：可行且非常合本作**——但 WORLD.md 定調「夜間探索」，所以不做日夜循環，做「**一夜之中的時辰**」：入夜→深夜→月落→魚肚白（全部收齊才看到黎明），月相/月高/極光強度隨精通區數推進，且 `REGION_ATMOSPHERE` 只是被乘上一個「時辰因子」而不換色系。

### (e) 十二區的生態辨識（單一 heightmap）

- Firewatch：**分層剪影＋大膽色彩分層**（[Thumbsticks](https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch/)）；Sable：每區霧與描邊變化（同上）；Sky/Yu：每區是一個「角色研究」——功能、歷史、主導形狀、調色、密度、氛圍。
- **對照**：目前 12 區用 `detailFor()` 的地形函數（階梯/書架溝/碗形/尺/放射溝…）＋ 每區道具 kit ＋ 霧色，**主導形狀已有**；缺的是「地面材質/頂點色語言」（草地 vs 石板 vs 沙 vs 水面反光都是同一張頂點色）、每區專屬的環境粒子（現在全是 motes 密度差異）、每區的「天際線」（只有一根地標，沒有中景輪廓群）。

### (f) POI 密度與節奏

- 「30 秒必有事做」是 Ubisoft 式開放世界的常態，但也被批評為「遊樂場而非地方」（[GameSpot 談 AC Shadows](https://www.gamespot.com/articles/assassins-creed-shadows-grounds-its-open-world-in-reality-without-spoiling-the-fun/1100-6538017/)）；WORLD.md §4.4 已寫「每 20–30 公尺一次反應、中間要有真正安靜」與 Don Carson「細節是預算」——**本作已在正確的一邊**。Ghost of Tsushima 導風（Rockenbeck GDC 2021 [GDC Vault](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating)、[Ludonode 分析](https://ludonodestudios.medium.com/%EF%B8%8F-the-invisible-hand-how-ghost-of-tsushima-guides-players-without-a-traditional-hud-70f6772fcacc)）證明**方向提示可以完全外交（diegetic）**：風、煙、鳥、聲音。本作的守望石已是「望向未解石座」，可以更進一步。
- 建議節奏公式（走速約 4–5 m/s）：**每 20–30 m 一個微觸（反應/器物）、每 60–90 m 一個中景（小景/石碑）、每區一個地標，橋段中央刻意留 20 m 的「什麼都沒有」**——現在橋是純直線，最需要一個中點事件（閘門）之外的節奏。

### (g) 給收集者的秘密

- Korok 設計原則：藏在「看起來怪怪的、有一點不對」的地方，靠玩家注意到環境異常（[Underlevelled](https://underlevelled.com/2021/07/08/in-defence-of-breath-of-the-wilds-900-korok-seeds/)）；BotW 用不規則三角形暗示藏東西；Sky 的翼光藏在「跳下去信任一次」的地方；Hollow Knight 的隱藏牆靠聲音/裂縫暗示。**通則：秘密要有 tell（可讀的異常），且發現本身即回饋**——本作 §4.5「走進去就算找到」已守這條。目前只有 4 處、規則單一（地標背面）；跳躍上線後「高處的秘密」是全新一類。

---

## 二、提案清單（12 項）

工程量：S ≈ 半個 phase、M ≈ 1 phase、L ≈ 2 phase+。「相容性」對照 `REGION_SITES`／§6 硬規則（三角 194k/420k、光 37/56、碰撞 957/1400、淨空、`FLOAT_MIN`）。

| # | 名稱 | 一句話 | 參考 | 量 | 相容性／風險 |
|---|---|---|---|---|---|
| M1 | **中觀遮擋帶（三角形法則的「中三角」）** | 在每片土地入口與地標之間、以及橋的兩側外緣，放 6–12 公尺高的中景輪廓群（石脊、書牆、齒輪堆、帆幕），刻意擋住從橋頭直視地標的視線，走進去才「揭露」 | BotW 三角形（中＝遮擋）、Radiator「避免 A→B 直線視線」、Sky meso 層 | M | 純幾何＋自發光可做到 **+0 光源**；每區 ~+1.5k 三角、+10 碰撞體，總計 +18k/+120 在預算內。**風險**：擋到 `BRIDGE_LANES ±3.2` 與石座 5.6 淨空 → 只放在 lane 外 8 m；要跑 collision-audit；§4.7 規定中景 3–8 m，此處建議 6–12 m 需在 WORLD.md 明寫「遮擋帶」為中景階上限的例外或新增一階 |
| M2 | **相鄰區短捷徑（環化）** | 4 條「單側解鎖」的窄索橋/石階：reasoning↔grounding（北弧）、orchestration↔config（南弧）、config↔forms、toolcraft↔orchestration；從先到達那一側敲開（絞盤／推石＝現有 `capstan` 文法），之後雙向可走 | Dark Souls Firelink 電梯、Hollow Knight 單向門、BorisTheBrave soft requirement | M–L | 需要新的 `SHORTCUTS[]` 資料（from/to/gateAt/unlockedFrom），`terrainHeight` 加一種「窄走廊」（half 4、flat 2）並在 `coverage/regionAt` 納入；捷徑走廊在虛空上方，長度 60–100 m。**風險**：地形網格 ±170 已滿——南弧 orchestration↔config 走 z≈150 剛好在界內；北弧會擦到 frugality (0,-82) r32，需繞 z≈-150。存檔新增 `shortcuts:{id:bool}`（schema 遷移＋reset）。e2e 要驗「未解鎖時真的走不過」 |
| M3 | **一夜的時辰（progress-as-time）** | 全域「時辰」= f(精通區數/收集數)：入夜→深夜→月落→魚肚白；驅動月高與月相（sprite 換遮罩即可）、星密度、極光強度/色相、`REGION_ATMOSPHERE` 乘上時辰因子（fog 亮度±10%、hemi ±0.08）；集滿 130 技能才看到東方發白 | Journey/Sky 的一趟＝一天、Sable「霧是日夜的骨架」、threex.daynight 結構 | S–M | 零新光源、零新網格（改 uniform 與 sprite）。**與 WORLD.md「夜間」不衝突**（永遠是夜，只是深淺）。**風險**：色彩腳本（研究文件 4-A）與它必須共用同一個 `setMood()` 入口，否則兩套在搶霧色；e2e 截圖比對要固定時辰 |
| M4 | **外交式導向（守望石 → 風＋光＋鳥）** | 不加 HUD 箭頭：把「下一個建議去處」（regions-v2 gate 規格）翻譯成三種外交提示——螢火群整體慢慢往那個方向流、路網頂點色在岔路口對那一支微亮、地標頂端在你迷航 >40 s 時「呼吸」一下 | Ghost of Tsushima 導風、Sky 光的層級當導演、BotW 塔 | S–M | 只動 shader uniform／頂點色與 motes 速度場；0 光源。**風險**：不能取代守望石；要可關（設定頁）；規則寫進 WORLD.md §4.4 |
| M5 | **跳躍後的第一層垂直（3 階高台語法）** | 配合「跳躍原型」phase：每區 2–3 處 1.6–3.0 m 高台（屋頂/欄杆/書架頂/齒輪背）—— 「站上去看得到別的東西」；高台上放 secrets 或高處刻文；地形不動，用 props 疊 | A Short Hike「每根羽毛真的打開一個地方」、Sky 隱藏翼光在高處、BotW「看得到就到得了」 | M（地圖側；跳躍本身另計） | 每個高台是新的**可站立表面** → 現有碰撞是圓柱、沒有「頂面」概念，需要 `collectSolids` 加 `top` 高度並讓 player 的 ground 取 max(terrain, solidTop)。**風險最大**：碰撞審計四條規則要補「可站立體」類別；`FLOAT_MIN 1.6` 對高台不適用要例外化；不能擋任何淨空 |
| M6 | **滑翔線（若滑翔納入）** | 4–6 條「高處起點 → 遠處看得見的落點」：從地標平台（M5 之上）滑往相鄰區或橋中央；落點就是 M2 捷徑的另一端 → 滑翔＝首次開通 | Sky 飛行線、Journey 圍巾、A Short Hike | L | 依賴 M5＋跳躍/滑翔實作；地標 21–27 m 若能上去（螺旋梯或光梯）就是天然起飛台，但 §4.1 地標周圍留白 14–16 m 是為了剪影，梯子要貼身。**風險**：滑翔速度×落點距離要與 `WORLD_RADIUS` 相容，掉進虛空要有「回到起跳點」（§3.5 不會失敗） |
| M7 | **每區地面材質語言（頂點色第二層）** | 為 12 區各定義 2 色地面（基底＋碎紋：石板格/沙紋/木紋/水面反光/苔）用頂點色＋一張 4×4 程序化 detail 紋理的 UV 縮放區分；區界處 6 m 漸變 | Firewatch 分層色、Sable 每區調性、Sky micro 層 | S–M | 只改 `buildTerrain` 的顏色與一張共用材質，三角/光/碰撞全 0。**風險**：與路網頂點色疊加要保住路的可讀性；低畫質 fallback |
| M8 | **每區專屬環境粒子與天際線母題** | motes 之外每區一種 GPU 粒子（紙屑/火星/花粉/齒輪屑/沙/星塵…）＋ 每區在外緣放 3–5 個「重複母題」中景（同一形狀重複＝Sky 的 repeated motif），讓遠看就知道那是哪一區 | Sky meso「重複視覺母題」、Firewatch 剪影 | M | Points/Instanced，0 光源；每區 +1 draw call 粒子、+3–5 instanced 網格；三角 +~10k 總計。**風險**：與 M1 遮擋帶合併設計避免重複做兩套中景 |
| M9 | **POI 節奏稽核腳本** | 寫一支 `scripts/pacing-audit.mjs`：沿路網取樣（每 5 m）算「距最近微觸/中景/地標」的分布，輸出每區的節奏直方圖與「>45 m 的死區」清單，納入 `test:rubric` 當軟警告 | Ubisoft「30 秒」反面教材、WORLD §4.4「20–30 m 一次、中間要安靜」、Carson 預算 | S | 純 node、零遊戲改動；為 M1/M2/M8 提供擺放依據（先量再放）。**風險**：無 |
| M10 | **有 tell 的秘密（擴 4 → 12 處，三種語法）** | 每區 1 處，三種 tell：①「不對的東西」（一塊石頭沒有影子/一格書架反著）②「聲音先到」（走近才聽得到的一支音，反應物件反向用）③「高處」（M5 上線後）；找到即記錄，圖鑑加「12 處秘境」章節（純風味，無 source） | Korok「怪怪的地方」、Hollow Knight 聲音暗示、Sky 高處翼光 | S–M | 沿用 secrets.json + §4.5 規則（地標背面/離主動線 8 m）；存檔 `secrets[]` 已有。**風險**：護欄 2 —— 不掛技巧、不放連結 |
| M11 | **橋的中段節奏** | 每條橋在閘門之外加一個「中點事件」：一段路面塌成 3 m 缺口（跳躍後）或一座可坐長凳＋回望高原的框景，讓 60–100 m 的直橋不再是走廊 | Sky 框景、Yu「lighting pocket」、Souls 篝火 | S | 器物系統現成（`bench`）；`BRIDGE_LANES` 淨空 ±3.2 → 長凳放 lane 外側 4 m。**風險**：塌缺口版本要等跳躍；有跳躍前只做長凳/框景 |
| M12 | **軟門檻視覺三態** | 閘門與石座依 gate/進度呈三態（未知＝暗、可去但建議先別＝琥珀微光、建議去＝主色亮），從高原遠看就讀得出（配合 M4） | BotW/TotK 神廟三態（`level-design-references` #8）、Mega Man 最佳路線不強制 | S | 只改自發光強度/色；0 光源。**風險**：與 regions-v2 `gate` 啟用進度綁定，若 gate 仍未啟用就先只有兩態 |

---

## 三、建議的「垂直切片」順序

（前提：依研究文件 §6.4，行動裝置輸入基礎先做完；下列每一格可獨立交付、不倒退。）

1. **M9 節奏稽核腳本**（S）— 先量再改；一天內完成，後續每一步都拿它驗。
2. **M3 一夜的時辰 ＋ M12 三態**（S–M，可與研究文件 4-A 色彩腳本同一 phase）— 全是 uniform/emissive 層級的改動，零預算壓力，卻立刻給「進度看得見」；把 `setMood()` 收成單一入口，之後色彩腳本與時辰共用。
3. **M1 中觀遮擋帶 ＋ M8 母題**（M）— 選 **一片土地**（建議 reasoning：階梯地形本來就適合層層遮擋）做垂直切片：入口看不到地標、繞過一道石脊才揭露；跑 collision-audit 與 M9，確認節奏改善後再鋪其他 11 區。
4. **M4 外交式導向**（S–M）— 只做「螢火流向」一種提示先驗證體感；可關。
5. **M2 相鄰區捷徑**（M–L）— 只做一條（orchestration↔config 南弧，最不擠），含存檔欄位、單側解鎖、e2e；證明樹→環的體感值得再鋪三條。
6. **跳躍原型 phase 之後**：M5 高台語法（一區 2 處）→ M11 橋缺口 → M10 高處秘密 → 最後才 M6 滑翔線（依賴最多、量最大）。
7. **M7 地面材質、M10 前兩種 tell** 是任一 phase 可夾帶的低風險項目。

## 四、跨提案的硬規則備忘

- 所有新中景/高台一律 emissive ＋ InstancedMesh，**光源維持 37**；三角總增量估 <40k（194k→<235k）。
- 任何新可站立表面都要進 `collectSolids` 與碰撞審計的例外表說明；淨空（石座 5.6、lane ±3.2、出生 7）先於美感。
- 新資料層（secrets、shortcuts、時辰）一律 `authored: "game"`、無 `source/teaches`；動到中文字串跑 `npm run fonts`；存檔加欄位要有遷移＋reset 測試。
- 地形網格 ±170 已滿：M2 捷徑與 M6 落點的座標要先用 `coverage()` 逐點驗，任何 `>168` 的點都會掉出網格。

Sources: [Kotaku 三角形法則](https://kotaku.com/breath-of-the-wilds-biggest-design-secret-lots-of-tria-1819113140) · [Game Developer 5 lessons](https://www.gamedeveloper.com/design/5-design-lessons-learned-from-i-the-legend-of-zelda-breath-of-the-wild-i-) · [Radiator Blog](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html) · [Gravity to go Forward](https://www.gamedeveloper.com/design/breath-of-the-wild-open-world-analysis-gravity-to-go-forward) · [80.lv Sky/Flora Yu](https://80.lv/articles/how-to-design-emotional-game-environments-for-sky-children-of-the-light) · [GDC Vault Art of Sky](https://gdcvault.com/play/1026903/Art-of-Sky-Children-of) · [Scientific Gamer A Short Hike](https://scientificgamer.com/thoughts-a-short-hike/) · [Sky Winged Light](https://sky-children-of-the-light.fandom.com/wiki/Winged_Light) · [GDC Vault Designing Journey](https://gdcvault.com/play/1017700/Designing) · [TheGamer Dark Souls](https://www.thegamer.com/dark-souls-1-fromsoftwares-magnum-opus-of-interconnected-level-design/) · [Roha FromSoftware](https://medium.com/@Jamesroha/world-design-lessons-from-fromsoftware-78cadc8982df) · [HG101 Hollow Knight](https://www.hardcoregaming101.net/hollow-knight/amp/) · [Ghost of Tsushima GDC 2021](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating) · [Ludonode 導風分析](https://ludonodestudios.medium.com/%EF%B8%8F-the-invisible-hand-how-ghost-of-tsushima-guides-players-without-a-traditional-hud-70f6772fcacc) · [threex.daynight](https://github.com/jeromeetienne/threex.daynight) · [three.js 論壇 Sky System](https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311) · [Shadertoy Auroras](https://www.shadertoy.com/view/XtGGRt) · [Codrops WebGPU aurora](https://tympanus.net/codrops/2026/08/11/exploring-procedural-geometry-with-three-js-and-webgpu/) · [Sable readability](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability) · [GDC Art of Sable](https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection) · [GDC Art of Firewatch](https://gdcvault.com/play/1022295/The-Art-of) · [Thumbsticks Firewatch](https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch/) · [GameSpot AC Shadows「30 秒」](https://www.gamespot.com/articles/assassins-creed-shadows-grounds-its-open-world-in-reality-without-spoiling-the-fun/1100-6538017/) · [Underlevelled Korok](https://underlevelled.com/2021/07/08/in-defence-of-breath-of-the-wilds-900-korok-seeds/)
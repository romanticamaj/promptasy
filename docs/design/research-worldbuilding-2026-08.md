# 世界觀擴充研究（Worldbuilding, 2026-08）

> 研究報告（唯讀研究，未改任何程式）。成文 2026-08-17，由研究 agent 產出、orchestrator 歸檔。上游：`docs/design/gameplay-research-2026-08.md`；下游：`docs/design/gameplay-roadmap.md`。

## Promptasy 世界觀擴充提案：濁靈、四部原典、十二守護與主線弧

> 唯讀研究報告（未改任何檔案）。依據：`WORLD.md` §1／§2／§4／§5／§7、`src/data/regions-v2.json`、`src/world/props.js` 的 12 塊 `LORE_TABLETS`、`src/data/ranks.json`、`docs/design/gameplay-research-2026-08.md` §一／§六、`docs/design/spec-murk-encounter.md`。

### 0. 現況三行摘要（提案要接得上的地方）

- 既有骨架：**神諭**（＝LLM，從不現身）、**回聲**（唯一會說話、≤2 句、每句 ≤31 字）、**抄寫人**（已不在、失敗留在原地）、**母碑倒下**（`mother-stele` 碑：「把你要的樣子先說出來，牠就照著做」）、12 塊碑、稱號鏈「初醒的旅人 → 刻印學徒 → **抄寫人** → 讀碑者…」。
- 序章第一句：「這座高原上沒說清楚的話，都會落到我這裡。」——這句就是濁靈起源的現成鉤子。
- 濁靈 spec（`spec-murk-encounter.md`）已定：原地不動、`E` 安撫、命中 rubric 剝殼、安撫後變路燈、進圖鑑第四列；待決：名字外觀／數量／XP／跟隨光靈。研究 §六 的紅線：**不掉東西、不倒退、不把回饋包成壓力事件**。

### 1. 參考作品 → 可移植原則（無戰鬥／輕威脅／收集／漸進）

| 作品 | 他們怎麼做 | 搬進 Promptasy 的形式 |
|---|---|---|
| Outer Wilds（Ship Log／Rumor Mode） | 進度＝知識本身；日誌是卡片＋「傳聞連線」，線索先出現為傳聞、探到才變事實 [1][2] | 圖鑑加「傳聞」頁：碑、殘頁、濁靈之間用線連，找到一端先畫虛線 |
| Outer Wilds（Nomai 螺旋文） | 文字是「對話串」，每段接在前一段上、不同作者 [3] | 抄寫人的**回信碑**：一塊碑上多筆跡、後人在旁補一句（本來就有「失敗留在原地」） |
| Hollow Knight（lore tablets／Hunter's Journal） | 碑文曖昧不解釋；圖鑑條目隨「遇到次數」解鎖更多獵人筆記 [4][5] | 濁靈圖鑑：安撫 1 次給濁言、拿 A 以上多一段抄寫人眉批、S 再多一句 |
| Journey（glyphs／壁畫、無字） | 「story digging」；石刻壁畫填補世界史，先感受再理解 [6][7] | 每區地標背面一幅**程序化壁畫**（頂點色＋自發光線條），敘事只靠圖 |
| Sky（Spirit Memories） | 靈魂蹲坐原地；沿藍色殘影重演記憶，得到表情／收藏 [8] | **回聲重演**：小景旁一團光坐著，按 `E` 播 4–6 秒抄寫人殘影（用現有 rigless 角色，純光、無碰撞） |
| Tunic（manual pages） | 手冊散頁＝世界觀＋技巧＋備忘；「不是為你寫的世界」的語言感 [9][10] | **抄寫人殘頁**：collectible，中文白話＋原文↗，內容層 `authored:"game"` |
| Hades（codex／反應式敘事） | 死亡不歸零，敘事持續；「遊戲有在注意你」的反應 [11][12] | 回聲依你「上一個安撫的濁靈／剛精通的區」換一句話（既有 toast 系統） |
| Sable | 零戰鬥；面具＝身分收藏；Chum 眼淚升體力 [13] | 12 枚土地印記（既有 `seals`）視為「面具」，主線終局要的是印記不是分數 |
| Chants of Sennaar | 語言即謎題；「先讀懂再溝通」讓兩族和解 [14][15] | 分歧之廳的中點揭示：同一詞在兩部原典裡不同義（區主題本來就寫「同名不同義」） |
| FromSoftware（物品說明碎片） | 碎片式敘事、玩家自己拼；「啊哈」是報酬 [16][17] | 殘頁與碑不互相解釋，圖鑑「傳聞」線才把它們接起來 |
| Metroid Prime（Scan Visor／Logbook） | 掃描一切、Lore／Creatures／Research 三大類 [18] | 圖鑑三分法直接對應：石碑與殘頁（Lore）／濁靈（Creatures）／技巧（Research） |
| Journey Guardians／Sky Krill（反例） | 圍巾被剪、掉翼光是「損失」，玩家記得的是失落 [19][20] | **不採**。威脅是「一個地方變濁了」，不是獵人；濁靈只會盯著你 |

### 2. (a) 濁靈從哪來、「安撫」在世界裡是什麼

- **起源（一句話）**：回聲接住的是「沒說清楚的話」；接不住、又被一再重複的那些，落進霧裡結成一團——抄寫人叫它**濁言**，後人叫它**濁靈**。它不是怪物、不是敵人，是「一句還沒說完的請求，卡在原地等人把它說完」。
- **為什麼會出現在這裡**：抄寫人的失敗被留在原地（§1.3）。濁靈＝那些失敗裡最常見的一種：模糊、只說「不要」、沒給格式、忘了讀卷宗。**每隻濁靈就是一段 `BEFOREAFTER` 的弱 prompt**（研究 §四已指出資料現成）。
- **「安撫」＝替它把話說完**：你寫的好 prompt 不是攻擊它，是**代它把那句話重說一遍**。每命中一項檢查，它就少一層聽不懂自己的濁氣；說清楚了，它「聽懂自己在問什麼」，安靜下來變成一盞燈。世界規則保持一致：**被說清楚的話會發光**（石座光柱＝還沒解開的問題；安撫後的濁靈＝已經解開的問題，同一個光語言）。
- **為什麼不會失敗**：沒說到位，它只是「還沒聽懂」，殼還在、眼光還盯著你；回聲不會催（沿用 §3.5「不收＋教你」）。牠不會靠近、不會拿走任何東西——牠自己就是被拿走了意思的話，沒有能力再拿走別的。
- **收集面**：圖鑑第四列「濁言與正言」；條目＝弱句 → 你的最佳評價 → 範例強句 → 技巧連結 → 官方出處（spec §7 已規劃，符合護欄 2）。可加 Hollow Knight 式分層：安撫 1 次開濁言、A 以上開抄寫人眉批一句、S 開「這句話當年是誰留下的」（純風味，不放連結）。
- **與回聲的關係**：回聲說過「沒說清楚的話都落到我這裡」——濁靈就是回聲接不住的份量。終局用得上（見 §5）。
- **建議名稱**：保留「濁靈／Murk」，弱句在文案裡叫「濁言」；安撫後的燈叫「**清燈**」（世界用語，不寫「路燈」）。

### 3. (b) 四廠在世界裡是什麼

**推薦：世界層叫「四部原典」／「四道來處」，不替公司起別名；圖鑑徽章區以真名做出處性使用（nominative use）＋免責句。**

- 設定：抄寫人不是憑空學會說話——他們從四個遠方**抄回四部原典**（同一個神諭，四種聽法）。母碑就是想把四部合寫成一塊，寫不下才倒的（→ 中點揭示）。
- 天空是主角（§2.2）：把四部原典對應**四宿**（星圖上的四個星群），徽章面板改成星圖，收齊＝四宿全亮（既有「四廠全數點亮」文案幾乎不用改）。星群名用方位或「原典的第幾卷」，**不用任何影射公司名的雙關**。
- 圖鑑條目上的出處列一字不改：`OpenAI · Prompt engineering ↗`、`Anthropic · Prompt engineering overview ↗`…（`curriculum.json` byte-identical）；星圖旁一句：「原典＝這四家公開的官方文件；本遊戲與其無隸屬或背書關係」。
- 法務界線（各家指引）：不得用 logo／品牌元素、不得暗示背書或關係、不得把商標放進產品名（OpenAI Brand Guidelines [21]、Anthropic Trademark Guidelines [22]、Google Brand Resource Center [23]）。→ 星圖用程序化星點，不畫任何標誌；世界層文字絕不出現公司名；只有圖鑑的出處列與成就頁用真名。
- 分歧之廳的區主題「廠家反差／同名不同義／遷移與時代警示」＝四宿之間**星光互相打架的地方**；`dated-notes.json` 的時代註記＝「這顆星已經移位了」。
- 備選（不推薦）：替四家取「學派名」（如「北院／東塔…」）——多一層對照表、易被讀成影射，且「換皮但不說謊」的成本更高。

### 4. (c) 十二區的守護／聲音／傳說鉤（守護一律是留在原地的東西）

| 區 | 守護（不是 NPC） | 誰的聲音（痕跡形式） | 傳說鉤（一句） |
|---|---|---|---|
| foundations 撰寫基本功 | 斷環 | 母碑殘片、最早的立石環 | 母碑倒下那年，環斷成兩半，一半刻著「說」、一半刻著「清楚」 |
| reasoning 示範與推理 | 無盡階梯塔 | 老師傅刻在每一階上的「第一遍、第二遍」 | 塔沒有頂，因為師傅只示範兩遍，第三遍的階梯要你自己踏出來 |
| grounding 脈絡與長文 | 藏書之樹 | 書頁上的頁碼與「我不知道」的批註 | 樹上每一頁都被翻過，只有寫著「憑印象」的那幾頁枯了 |
| orchestration 流程與代理 | 巨臂吊車 | 工單、拆到一半的機器 | 吊車最後一次吊的是「一整件事」；從那之後工匠只吊「一小件」 |
| config 角色與參數 | 面具拱門 | 後台旋鈕、掛架上的面具 | 有個戲子忘了摘面具，拱門從此在每張面具背面刻「你不是它」 |
| forms 量器坊 | 刻度之柱 | 柱身刻度、懸空的尺 | 量到最後一格時，抄寫人量的是自己——那格沒刻完 |
| toolcraft 契約鍛冶場 | 未命名的工具 | 工具溝裡一格一把、無名的鑰匙 | 每把鑰匙都能開門，卻沒人寫得出「什麼時候該用我」 |
| wards 護欄崗 | 不會關上的門 | 門縫塞著「外面來的字」 | 門留一條縫是故意的：擋不住的字，至少要看得見它進來 |
| refinery 校驗場 | 會回頭照自己的鏡 | 被劃掉又改過的碑 | 抄寫人第一次在鏡裡看見自己寫的字，就是他們開始改字的那天 |
| frugality 減法之庭 | 空的基座 | 被搬走的東西留下的光輪廓 | 這裡曾經是最滿的一區；他們把東西一件件搬走，直到剩下的話還說得通 |
| divergence 分歧之廳 | 兩面刻著相反神諭的柱 | 五根柱上的兩種筆跡 | 兩批抄寫人為此吵了很久，後來發現兩面都對——只是聽的不是同一部原典 |
| sight 觀象臺 | 朝天的鏡 | 觀測記錄：「看見的比說出來的多」 | 鏡子朝天，因為抄寫人終於明白神諭不只讀字；但鏡裡映的仍只是文字寫成的天 |

（各鉤子都與 `regions-v2.json` 的 `theme`／`landmark` 一致；文案上線前照 §3.6 禁字表過一遍。）

### 5. (d) 輕主線弧：起 → 中點揭示 → 終（獎勵 130 技能全收，永不懲罰）

- **起（序章，已有）**：你在祭壇醒來；回聲說「沒說清楚的話都落到我這裡」。母碑倒了，只留一行。→ 主線問句只有一個：**「抄寫人去哪了？母碑上原本寫的是什麼？」**（不催、不給任務清單；問句由高原四塊橋碑與 `mother-stele` 自然帶出。）
- **中點揭示（建議觸發：第一次走進分歧之廳，或精通任 6 區）**：兩面刻相反神諭的柱讓你看見——**神諭從來不只一種聽法**；抄寫人的爭吵不是誰錯，母碑倒下不是災難，是「一塊碑寫不下四部原典」。所以他們把碑拆成十二片土地，各刻一條規矩，把失敗留在原地當教材。第二層（校驗場「會回頭照自己的鏡」）：**抄寫人沒有消失——凡走到這裡並學會說話的人都是抄寫人**（稱號鏈第三階本來就叫「抄寫人」）。揭示只用一塊碑＋回聲一句話（≤31 字），不做過場。
- **終（130 技能全收＋四宿全亮＝既有隱藏成就）**：走進「回聲的小祠」——回聲兌現「記得每個人的第一句話」：把你**在序章寫下的第一句 prompt** 還給你（存檔加一欄 `firstPrompt`，純加法）。這就是最後一隻濁靈：**你自己當年沒說清楚的那句話**。你重寫它（自由書寫、任何 rubric、不會失敗），母碑在斷環中央**重立**，上面刻的是你的那一句（餵給既有分享卡）。回聲最後一句：「現在，換你把話留在這裡。」——之後每一隻你安撫的濁靈都會多刻一行你的字。
- **不懲罰的保證**：三段都是「加法」——中點是多一塊碑、多一句話；終局是多一個場景、多一張分享卡；沒過門檻只是碑還沒亮、小祠還沒開口，永遠可以回頭。跳門（`skippedGates`）也不會錯過：揭示綁在「走進去」，不綁在「條件達成」。

### 6. (e) 符合「沒有會走動的 NPC」的環境敘事裝置

| 裝置 | 世界裡是什麼 | 參考 | 與既有系統的關係 |
|---|---|---|---|
| 壁畫（murals） | 每座地標背面一幅程序化刻線圖，講該區一則傳說；只有圖，沒有字 | Journey glyphs [6] | 放在「地標背面」＝§4.5 祕密位置，走到就算看到 |
| 抄寫人殘頁（letters） | 散落的信／筆記／工單，收進圖鑑「殘頁」；白話＋原文↗ | Tunic manual [9]、FromSoftware 碎片 [16] | 新資料檔 `letters.json`，`authored:"game"`；教學句必附出處，純風味者不放連結（同 `secrets.json` 規則） |
| 回聲重演（memory replay） | 小景旁一團坐著的光；`E` 後 4–6 秒淡藍殘影重演「兩張椅子那晚發生的事」 | Sky spirit memories [8] | 用現有 rigless 角色相位動畫、加法混色、零碰撞、零光源；播完歸位＝留在原地的東西 |
| 回信碑（threaded tablets） | 一塊碑多筆跡：原句、後人補寫、再後人劃掉 | Outer Wilds Nomai 對話串 [3] | 擴充 `LORE_TABLETS` 的 `lines`，用字級樣式區分筆跡 |
| 傳聞連線（rumor links） | 圖鑑新頁：碑／殘頁／濁靈／壁畫是卡片，找到一端先畫虛線 | Outer Wilds Ship Log [1][2] | 純 UI，資料只是 `links: [[a,b]]`；不劇透未找到的一端 |
| 濁言圖鑑分層 | 安撫次數／評價開更多眉批 | Hollow Knight Hunter's Journal [4][5] | 掛在 spec 既有第四列上 |
| 反應式回聲 | 回聲依「你上一個做的事」換一句 | Hades reactivity [11] | 走既有 toast／回聲通道；仍 ≤2 句 ≤31 字 |
| 星圖徽章 | 四宿星圖取代徽章條 | （§3） | 只是 `codex.js` 徽章區換皮，資料不變 |

### 7. 「世界觀投遞」機制（工程量）

| # | 機制 | 量 | 說明 |
|---|---|---|---|
| 1 | **殘頁 ＋ 回信碑** | **S** | 沿用 `LORE_TABLETS`／`inscriptions` 管線；新增 `letters.json`（authored game）＋圖鑑「殘頁」頁；改中文字串要重跑 `npm run fonts` |
| 2 | **四宿星圖徽章 ＋ 免責句** | **S** | `codex.js` 徽章區換成程序化星點；出處列與名稱不動 |
| 3 | **傳聞連線頁** | **M** | 圖鑑新 tab；資料只加 `links`；存檔讀既有 `loreRead/inscriptionsFound/secretsFound/murksCalmed`，不加新欄 |
| 4 | **回聲重演（Sky 式）** | **M** | `reactive.js` 樣板＋rigless 角色殘影；每區 1 處、共 12；輪詢式 e2e 斷言 |
| 5 | **濁靈安撫 ＋ 濁言圖鑑分層** | **M–L** | 依 `spec-murk-encounter.md`；本報告只補「起源／安撫語意／清燈」文案層 |
| 6 | **主線終局：第一句話 ＋ 母碑重立** | **L** | 新存檔欄 `firstPrompt`（純加法、`normalize()` 給預設）、小祠終局場景、分享卡樣板、中點揭示碑 ×2 |

建議順序：1 → 2（一個 phase 內可並做）→ 5（已有 spec）→ 3 → 4 → 6。

### 8. 護欄與 WORLD.md 檢核

- 護欄 2：壁畫／殘頁／重演／回信碑全部 `authored:"game"`；純風味者不准有 `source/teaches`（沿 `secrets.json`／`handles.json` 測試）；有教學句者必掛真實出處；`curriculum.json` 一個位元組不動。
- §1.2：回聲台詞每句 ≤31 字、最多兩句、不說系統術語（本報告文案示例都在此範圍內，上線前逐句量）。
- §1.5：新增的「角色」全部是留在原地的東西（濁靈原地、重演是光、守護是地標）。
- §3.5：三段主線與濁靈皆無失敗態；跳門者不錯過揭示。
- 法務：只在出處列／成就頁以真名做出處性使用、無 logo、有免責；世界層文字零公司名（[21][22][23]）。
- 待站長決定：① 世界層叫「四部原典」是否採納（vs 學派別名）；② 中點揭示觸發點（分歧之廳 or 精通 6 區）；③ 終局是否記錄 `firstPrompt`（新存檔欄）；④ 濁靈安撫後名稱「清燈」。

### 來源

[1] https://nh.outerwildsmods.com/guides/ship-log/ ・ [2] https://outerwilds.ventures/ ・ [3] https://worldwideinterpreters.com.au/2025/07/16/the-nomai-language-from-outer-wilds/ ・ [4] https://hollowknight.wiki.fextralife.com/lore ・ [5] https://hollowknight.fandom.com/wiki/Hunter%27s_Journal ・ [6] https://gdcvault.com/play/1017700/Designing ・ [7] https://www.fastcompany.com/1680062/game-designer-jenova-chen-on-the-art-behind-his-journey ・ [8] https://sky-children-of-the-light.fandom.com/wiki/Ancestors ・ [9] https://80.lv/articles/tunic-s-developer-on-creating-the-in-game-manual-full-of-mysteries ・ [10] https://gameinformer.com/2022/05/30/tracing-threads-the-making-of-tunic ・ [11] https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death ・ [12] https://www.gameshub.com/news/features/hades-greg-kasavin-breaks-down-supergiants-unique-approach-to-narrative-262459-2193/ ・ [13] https://screenrant.com/sable-game-open-world-no-combat/ ・ [14] https://www.gamedeveloper.com/design/immersing-players-in-the-culture-of-a-people-with-language-puzzler-chants-of-sennaar ・ [15] https://medium.com/@jonlangcommissions/show-not-tell-an-analysis-of-chants-of-sennaar-4e283252558d ・ [16] https://medium.com/@neallebenedict/reading-ruins-environmental-storytelling-in-elden-ring-fbddad0387fb ・ [17] https://www.cbr.com/elden-ring-environmental-storytelling-fromsoftware/ ・ [18] https://sourcegaming.info/2017/06/28/holism-metroid-prime-and-the-scan-visor/ ・ [19] https://journey.fandom.com/wiki/Scarf ・ [20] https://sky-children-of-the-light.fandom.com/wiki/Dark_Dragons ・ [21] https://openai.com/brand/ ・ [22] https://www.anthropic.com/legal/trademark-guidelines ・ [23] https://about.google/brand-resource-center/guidance/

專案內依據：`/home/garyhsieh/projects/promptarcade/WORLD.md`、`/home/garyhsieh/projects/promptarcade/src/data/regions-v2.json`、`/home/garyhsieh/projects/promptarcade/src/world/props.js`（`LORE_TABLETS`, line 1989）、`/home/garyhsieh/projects/promptarcade/src/data/ranks.json`、`/home/garyhsieh/projects/promptarcade/docs/design/gameplay-research-2026-08.md`、`/home/garyhsieh/projects/promptarcade/docs/design/spec-murk-encounter.md`。
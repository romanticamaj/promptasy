# 關卡設計參考（Level Design References）

> 這份文件是 **設計階段的原料**，不是規格書。
> 它把「別人怎麼設計會教東西的關卡」查清楚、記下來，讓後續的關卡改造有依據可引用，
> 而不是憑感覺說「這樣比較好玩」。
>
> **成文日期**：2026-08-01 ｜ **範圍**：Zelda 神廟模型、無文字教學的解謎遊戲、技能門檻與區域結構、教育遊戲設計
> **不動的東西**：這份文件不改任何程式、測試或 `CLAUDE.md`。

---

## 目錄

1. [參考清單](#一參考清單)
2. [設計原則萃取（15 條）](#二設計原則萃取15-條)
3. [互動型式庫（14 種）](#三互動型式庫14-種)
4. [對照：Promptasy 現況](#四對照promptasy-現況)
5. [沒查到 / 沒讀到的東西](#五沒查到--沒讀到的東西)

---

## 一、參考清單

**讀取狀態說明**

| 標記 | 意思 |
|---|---|
| ✅ 全文讀 | 實際抓到內文並讀完，可以引用細節 |
| 🟡 摘要層 | 只讀到搜尋摘要 / 標題層級，論點方向可信但**不要引用具體數字或原句** |
| ⛔ 讀不到 | 回 403 或需登入 / 為影片，只能靠二手轉述 |

### A. Zelda 神廟模型（BotW / TotK）

| # | 標題 | 作者 / 出處 | URL | 狀態 | 它教了我們什麼 |
|---|---|---|---|---|---|
| 1 | Shrines in Breath of the Wild | Reed Priest（個人部落格，2019-03-21） | https://reedpriest.wixsite.com/website/post/shrines-in-breath-of-the-wild | ✅ | 一座神廟 ＝ 一個機制的四拍：**introduce → expand → twist → challenge**；神廟用專屬視覺與專屬音樂把玩家從開放世界的噪音裡「隔離」出來，是心理上的隔音室。 |
| 2 | Breath of the Wild: Experimental Solutions | Joshua Gad（Medium，2017-05-08） | https://joshuabgad.medium.com/breath-of-the-wild-experimental-solutions-5ce0ec0ec9b7 | ✅ | 化學引擎造出「**沒有一個問題只有一個正解**」的世界；玩家做的是 exploratory-experimentation，不是找出設計師藏的那一把鑰匙。 |
| 3 | 5 design lessons learned from The Legend of Zelda: Breath of the Wild | Holly Green（Game Developer，2023-05-11） | https://www.gamedeveloper.com/design/5-design-lessons-learned-from-i-the-legend-of-zelda-breath-of-the-wild-i- | ✅ | 五條：自訂節奏、**三角形法則**（地形三角同時當地標、遮擋與節奏調節器，不用「偵探視覺」也導得動玩家）、化學互動、逼玩家換工具、資源稀缺。 |
| 4 | GDC 17: Breaking conventions with Breath of the Wild | Daniel New（Thumbsticks，2017-03-02，GDC 2017 談話轉述） | https://www.thumbsticks.com/gdc-17-breaking-conventions-breath-of-the-wild/ | ✅ | 藤林秀麿用 **2D 原型**（3D 引擎重做初代 Zelda）驗證「multiplicative gameplay」；把「不能過的牆」拿掉才是真自由，不然只是自由的錯覺。 |
| 5 | Change and Constant: Breaking Conventions with The Legend of Zelda: Breath of the Wild | Fujibayashi / Takizawa / Dohta（GDC 2017） | https://www.gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions ／ 鏡像 https://archive.org/details/gdc-2017-breaking-conventions-with-the-legend-of-zelda-breath-of-the-wild | ⛔（90 分鐘影片） | 上面第 4 條的一手來源。想引用原句要看影片。 |
| 6 | How Breath of the Wild's cogs shaped Tears of the Kingdom（GDC 2024 panel recap） | Ozzie Mejia（Shacknews，2024-03-20） | https://www.shacknews.com/article/139210/zelda-totk-gdc-2024-panel-recap | ✅ | 堂田卓宏那句設計宣言：**「與其做出好玩的東西，不如做一個會讓好玩的事自己發生的系統」**；把神廟閘門改成物理物件之後，同一道壓力開關題長出好幾種解法。 |
| 7 | Tunes of the Kingdom: Evolving Physics and Sounds for TotK | Dohta / Takayama / Osada（GDC 2024） | https://gdcvault.com/play/1034667/Tunes-of-the-Kingdom-Evolving | ⛔（影片） | 第 6 條的一手來源。 |
| 8 | Shrine Colours in Zelda: Tears of the Kingdom and Breath of the Wild | Cheryl-Jean Leo（2023-06-12） | https://cjleo.com/blog/shrine-colours-in-zelda-tears-of-the-kingdom-and-breath-of-the-wild/ | ✅ | BotW 的神廟有**三種遠距可讀的狀態**（未發現＝橘、已發現未解＝橘藍、已解＝全藍）；TotK 砍掉中間那一態，玩家遠遠看到會空歡喜一場。狀態要「一眼」讀得出來。 |
| 9 | The 10 best Ancient Shrine level designs in Breath of the Wild | Zelda Universe | https://zeldauniverse.net/features/breath-of-the-wild-best-shrine-designs/ | ⛔ 403 | 想看「哪幾座被公認做得最好」的清單，沒抓到。 |

### B. 一關一機制 · 無文字教學

| # | 標題 | 作者 / 出處 | URL | 狀態 | 它教了我們什麼 |
|---|---|---|---|---|---|
| 10 | How to Start Designing Great Test Chambers in Portal 2: Episode One | PlaySmart / Demon Arisen（2025-05-15；另有 Steam 版 https://steamcommunity.com/sharedfiles/filedetails/?id=2658095532） | https://mygamingtutorials.com/2025/05/15/how-to-start-designing-great-test-chambers-in-portal-2-episode-one/ | ✅ | **主元素 vs 次元素**的分野；一間測試室只能有**一個 central concept**、主元素上限約 4 個；**backward design**（從終點反推障礙）；先確立一個「聰明的瞬間」再往外長。 |
| 11 | Portal 2 and transfer of learning in playful environments | Shashank Pawar（2017-04-24） | https://shashankpawar.com/2017/04/24/portal-2-and-transfer-of-learning-in-playful-environments/ | ✅ | Portal 2 的章節結構 ＝ **隔離 → 漸進組合 → 遷移**；1–4 章是有明確出入口的測試室，第 5 章「逃脫」把同樣的技能丟進開放場景（near transfer）。明確引用認知負荷理論與 worked example 原則。 |
| 12 | Portal Design And Detail（官方 Level Design 指南） | Valve Developer Community | https://developer.valvesoftware.com/wiki/Portal_Design_And_Detail | ⛔ 403 | 只從搜尋摘要讀到核心主張：**introduce 新概念前先給一間剝掉所有干擾的教學室，玩家沒展現理解就不放行**。要引用原文得換管道。 |
| 13 | Thinking With Portals: Making A Portal 2 Test Chamber | Game Informer（2010-03-17） | https://gameinformer.com/b/features/archive/2010/03/17/thinking-with-portals-making-a-test-chamber.aspx | 🟡 | Valve 設計流程總是先訂一個「要教會哪個機制」的目標再蓋房間。 |
| 14 | A Deconstructive Analysis of The Witness | Daniel Podgorski（The Gemsbok，2020-01-15） | https://thegemsbok.com/art-reviews-and-articles/the-witness-thekla-jonathan-blow-analysis-deconstruction/ | ✅ | 島上 11 個區域各自 **isolate 一條規則變體**，先學會基礎（從圓點畫到終點）再逐區加規則；最後的頓悟是「環境本身也是題目」——把學院式的解題與觀察世界接在一起。 |
| 15 | The Witness, 10 Years Later, Still Refuses To Explain Itself | GameSpot | https://www.gamespot.com/articles/the-witness-10-years-later-still-refuses-to-explain-itself/1100-6537705/ | ⛔ 403 | 搜尋摘要層：全遊戲零文字提示，**學習本身就是遊戲**；玩家靠觀察、實驗、失敗來內化規則。 |
| 16 | 5 Years Later, I'm Still Looking for a Puzzle Game as Good as The Witness | The Escapist | https://www.escapistmagazine.com/5-years-later-im-still-looking-for-a-puzzle-game-as-good-as-the-witness/ | ⛔ 403 | 搜尋摘要層：把謎題語言比喻成語言學習——先教**名詞、動詞、形容詞**，再教**文法**（怎麼把學過的規則組成完整句子）。這個比喻對 prompt 教學非常好用。 |
| 17 | Super Mario 3D World's 4 Step Level Design | Mark Brown（Game Maker's Toolkit，2015-03-16）；文字轉述見 Nintendo Life https://www.nintendolife.com/news/2015/03/video_nintendos_four_step_stage_design_is_why_you_love_super_mario_games_so_much | https://www.youtube.com/watch?v=dBmIkEvEBtA | ⛔（影片，靠轉述） | 任天堂的**起承轉合（kishōtenketsu）**：introduce → develop → twist → resolution。導演林田宏一講的：一個機制可以在五分鐘內被教會、發展、翻轉，然後丟掉。 |
| 18 | Sequelitis: Mega Man Classic vs Mega Man X（教學片段剪輯） | Egoraptor；TV Tropes 條目 https://tvtropes.org/pmwiki/pmwiki.php/WebVideo/Sequelitis | https://www.youtube.com/watch?v=WGQlXcg8yC8 | ⛔（影片，靠轉述） | **conveyance**：用關卡本身教會玩家怎麼玩，不用文字、不用提示精靈。「開場那一段」要設計成玩家不可能學不會。 |
| 19 | Designing Baba is You's delightfully innovative rule-writing system | John Harris 訪 Arvi Teikari（Game Developer，2019-05-08） | https://www.gamedeveloper.com/design/designing-i-baba-is-you-i-s-delightfully-innovative-rule-writing-system | ✅ | 規則變成**可以被玩家搬動的物件**；設計流程是「先找到一個有趣的互動，再反推一關」；最大的可用性陷阱是**一開始就 active 的規則太多，關卡立刻變得壓垮人**。附加：Extra 關給完成主義者，但不擋主線。 |
| 20 | Stephen's Sausage Roll（作為**反例**） | Thinky Games 條目 https://thinkygames.com/games/stephens-sausage-roll/ ；TV Tropes https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/StephensSausageRoll | 同左 | 🟡 | 零鷹架、垂直懸崖式難度、機制「一直藏在眼前」等你自己撞到。對硬派玩家是神作，對「中文圈一般人」是勸退——**我們要它的『機制自己被發現』，不要它的難度曲線**。 |
| 21 | Reimagining failure in strategy game design in Into the Breach | Alex Wiltshire（Game Developer，2018-02-28） | https://www.gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i- | ✅ | **完全資訊**（敵人下一步全部先告訴你）把戰鬥變成謎題；失敗被重新定義成「取捨」而不是懲罰；每回合都在互相競爭的優先序之間選一個。 |
| 22 | 'Into the Breach' Design Postmortem | Matthew Davis（GDC 2019） | https://www.gdcvault.com/play/1025772/-Into-the-Breach-Design | ⛔（影片） | 第 21 條的一手來源。 |
| 23 | Why a World of Goo dev made a puzzle game about programming humans（Human Resource Machine） | Alex Wawro 訪 Kyle Gabler（Game Developer，2015-06-12） | https://www.gamedeveloper.com/design/why-a-i-world-of-goo-i-dev-made-a-puzzle-game-about-programming-humans | ✅ | 把組合語言指令包裝成「抓起下一個輸入 / 把這個放到那裡」的具體動作；**可選的最佳化目標（程式碼多短、跑多快）不擋進度**——給高手一個天花板，但新手照樣過得去。Gabler：指令就像樂高。 |

### C. 技能門檻與區域結構

| # | 標題 | 作者 / 出處 | URL | 狀態 | 它教了我們什麼 |
|---|---|---|---|---|---|
| 24 | Lock and Key Dungeons | BorisTheBrave（2021-02-27） | https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/ | ✅ | 鎖與鑰匙的分類：**道具 / 角色升級 / 密碼（＝知識）/ 事件旗標**；**hard requirement vs soft requirement**（後者只是「建議你先去別的地方」，強者可以硬闖）；用 **mission graph** 把邏輯相依性抽離實體地圖來規劃。 |
| 25 | Boss Keys ／ How my Boss Key dungeon graphs work | Mark Brown（GMTK，Patreon） | https://www.patreon.com/posts/how-my-boss-key-13801754 | 🟡 | 用依賴圖分析 Zelda / Metroid / Hollow Knight 的非線性關卡：小鑰匙 vs 道具鎖 vs boss 鑰匙，圖形本身就看得出一座迷宮有多線性。 |
| 26 | Outer Wilds critical analysis | Andrew Haining（Game Developer，2020-02-25） | https://www.gamedeveloper.com/design/outer-wilds-critical-analysis | ✅ | **知識即升級**：遊戲不給你新動詞，變強的是玩家本人不是角色；ship log 那張「敘事網」本身變成後設遊戲。 |
| 27 | Metroidbrainia: An in-depth exploration of knowledge-gated games | Thinky Games | https://thinkygames.com/features/metroidbrainia-an-in-depth-exploration-of-knowledge-gated-games/ | ⛔ 403 | 搜尋摘要層：知識門檻遊戲（Outer Wilds / Tunic / Animal Well / La-Mulana / Fez）的分類與比較。想要完整分類法得換管道。 |
| 28 | Choosing The Best Boss Order in Mega Man | Retroware（2021-03-01） | https://articles.retroware.com/2021/03/01/the-best-boss-order-for-mega-man-1987/ | 🟡 | 八個關卡任意順序 ＋ 弱點鏈：**有一條「最佳路線」但不強制**，走錯順序只是比較難，不是走不下去。這是 soft gating 的教科書範例。 |

### D. 教育遊戲設計 · 學習科學

| # | 標題 | 作者 / 出處 | URL | 狀態 | 它教了我們什麼 |
|---|---|---|---|---|---|
| 29 | Motivating Children to Learn Effectively: Exploring the Value of Intrinsic Integration in Educational Games | M. P. Jacob Habgood & Shaaron E. Ainsworth，*Journal of the Learning Sciences* 20(2), 169–206（2011） | https://shura.shu.ac.uk/3556/1/Habgood_Ainsworth_final.pdf | 🟡（PDF 抽字失敗，只讀到摘要與二手描述） | **「巧克力裹花椰菜」的反面 ＝ intrinsic integration**：把學習內容交付在**核心機制本身**上，而不是當成玩遊戲的門票或獎勵；並讓學習內容長進世界的隱喻與結構裡。以 Zombie Division 做對照實驗，intrinsic 版在學習成效與動機上都較好，free-choice 時段玩得也較久。 |
| 30 | Extrinsically Integrated Instructional Quizzes in Learning Games: An Educational Disaster or Not? | Frontiers in Psychology（2021） | https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.678380/full | 🟡 | 對 intrinsic integration 的反面檢驗——外掛式測驗到底有多糟。要拿來平衡第 29 條的結論。 |
| 31 | The Chemistry of Game Design | Daniel Cook（Lostgarden，2007-07-19；Game Developer 版 https://www.gamedeveloper.com/design/the-chemistry-of-game-design） | https://lostgarden.com/2007/07/19/the-chemistry-of-game-design/ | ✅ | **skill atom**：行動 → 模擬 → 回饋 → 玩家更新心智模型，這個迴圈是所有遊戲的碎形單位；atom 串成 **skill chain**（會跳 → 跳平台 → 跳過陷阱）；學會之後如果一直重複同一件事就會 **burnout**。 |
| 32 | Computational Thinking & The Game Zoombinis（TERC / CIRCL 研究計畫）；論文 Assessing implicit computational thinking in Zoombinis puzzle gameplay | TERC、CIRCL、Ryan Baker 等 | https://circlcenter.org/zoombinis/ ／ 論文 PDF https://learninganalytics.upenn.edu/ryanbaker/CHB-D-19-03159R1.pdf | ⛔ 403 ／ 🟡 | 12 種謎題 × 4 種難度，每一種謎題對應一項運算思維（問題拆解、樣式辨識、抽象化、演算法設計）；研究關心的是**隱性學習**——玩家在遊戲裡做到了，但講不出名詞。 |
| 33 | An Analysis of the Design and Pedagogy of DragonBox（ICLS 2023 poster） | ISLS repository | https://repository.isls.org/bitstream/1/10064/1/ICLS2023_1873-1874.pdf | ⛔ 403（另有多篇二手評論） | 搜尋摘要層：把代數規則映射成「移動卡片、隔離盒子」的動作，**先用圖像玩，再逐步淡出成真正的數學符號**（scaffolding fading）。這是「換皮但不說謊」的另一種版本。 |
| 34 | Covering all the bases: Duolingo's approach to writing skills；題型清單見 Duolingo Wiki | Duolingo Blog / Duolingo Wiki | https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-writing-skills/ ／ https://duolingo.fandom.com/wiki/Exercise | 🟡 | **word bank ＋ 干擾項**：句子的每個詞都給你，外加幾個最近教過的錯誤選項；寫作能力從「單字 → 短語 → 有 word bank 的造句 → 自由書寫」逐級放手。另有 tap the pairs（配對）等題型。 |
| 35 | The Guidance Fading Effect（Sweller）；How Fading Worked Solution Steps Works（Renkl 等，*Instructional Science*） | John Sweller；Alexander Renkl et al. | https://cogscisci.wordpress.com/wp-content/uploads/2019/08/sweller-guidance-fading.pdf ／ https://link.springer.com/article/10.1023/B:TRUC.0000021815.74806.f6 | 🟡 | **worked example → completion problem → 獨立解題**：把做好的範例一步一步抽掉，中間那些半成品就是「填空題」。worked example 只在**技能習得早期**有效，晚期會被略過，所以鷹架非撤不可。 |

**統計**：35 筆條目 ／ 其中 **17 筆全文讀** ✅、**8 筆摘要層** 🟡、**10 筆讀不到** ⛔（403 或影片）。

---

## 二、設計原則萃取（15 條）

> 每一條後面括號裡是它出自哪幾筆參考。這些是**給 Promptasy 用的**，不是通則整理。

### P1 · 一廟一概念（one shrine, one concept）
一關只教**一條**技巧。其他一切（素材、NPC、氛圍）都是為了讓那一條技巧變得必要，不是為了增加內容。
Valve 的說法是一間測試室只有一個 *central concept*、主元素上限約四個；神廟的說法是「一個機制的四拍」。
→ 對我們：一關的 rubric 條數要有上限；超過就是兩關。
（#1、#10、#14）

### P2 · 起承轉合四拍（introduce → develop → twist → conclude）
同一條技巧在一關之內要走完四步：先在最乾淨的情況下用一次、再加一點條件、然後**翻轉**（同一條技巧用在你沒想到的地方）、最後讓玩家自己完成一次證明學會了。
一個機制可以在五分鐘內被教會、發展、翻轉，然後**丟掉**——不要捨不得。
（#17、#1）

### P3 · 先示範後翻轉：鷹架一定要撤
worked example（看做好的）→ completion problem（填空）→ 獨立作答，三階段。
鷹架不撤就沒有學習：worked example 只在早期有效，晚期學習者根本不看。
Duolingo 的路徑同構：單字 → 短語 → word bank 造句 → 自由書寫。
→ 對我們：**石碑刻印是 word bank，自由書寫是終點**。同一條技巧的第二次出場就該少一格鷹架。
（#35、#11、#34、#33）

### P4 · 環境即題目（conveyance，能不寫字就不寫字）
玩家該做什麼，要從**素材本身**看出來，而不是從說明文字讀出來。
守門人手上那張寫壞的告示，本身就要讓人手癢想改；Mega Man X 的開場不用一句話就教會你所有動作。
→ 對我們：`material` 的品質決定一關好不好玩。素材看得懂 ＝ 任務看得懂。
（#18、#14、#19、#16）

### P5 · 隔離房間（把世界的噪音關掉）
神廟有專屬的視覺與專屬的音樂，是心理上的隔音室；Valve 會先給一間「剝掉所有干擾」的教學室。
→ 對我們：四幕分鏡的第一幕已經在做這件事（只有題目、零連結）。原則是**進到題目裡，世界要安靜下來**。
（#1、#12）

### P6 · 狀態要遠距可讀（三態，不是兩態）
BotW 的神廟有三種顏色：沒發現 / 發現了還沒解 / 解掉了。TotK 砍掉中間那一態，玩家遠遠看到會空歡喜。
地形三角同時是地標、遮擋與節奏調節器——不用小地圖也導得動人。
→ 對我們：石座的三態（未解 / 走近 / 已解）要**在遠處就分得出來**，不能靠走近才知道。
（#8、#3）

### P7 · 自由順序 ＋ 軟門檻
BotW 讓你用自己的節奏走；Mega Man 八關任意順序，有一條最佳路線但走錯只是比較難。
Boris 的分類：**hard requirement 是真的過不去，soft requirement 只是建議**。
→ 對我們：區域解鎖是 hard（等級 ＋ 前一區通關數），但**一個區域內的關卡順序應該是 soft**——推薦一條路線，不強制。
（#3、#28、#24）

### P8 · 知識即升級（knowledge gating）
Outer Wilds 不給你任何新動詞，變強的是玩家本人。Boris 把這叫「密碼型的鎖」——鑰匙是**你知道了什麼**。
→ 對我們：這是 Promptasy 的天然形狀。技巧本身就是鑰匙；理想的門是「你懂了 few-shot 就開得了」，而不是「等級到 4 就開得了」。
（#26、#24、#27）

### P9 · 完全資訊、失敗不是懲罰
Into the Breach 把敵人下一步全部攤開，戰鬥因此變成謎題；失敗被重新定義成取捨而不是懲罰。
→ 對我們：WORLD.md §3.5「不會失敗」已經是這條原則的實作。要繼續守住，而且**評分標準也要在作答前就全部攤開**（現在的即時預檢正是這件事）。
（#21、#22）

### P10 · 做系統，不要做腳本；允許一題多解
「與其做出好玩的東西，不如做一個會讓好玩的事自己發生的系統。」BotW 的化學引擎讓「沒有一個問題只有一個正解」。
→ 對我們：離線 rubric 判定的是「**技巧有沒有出現**」而不是比對字串，本質上就允許多解——
但玩家不知道。應該讓他**看得見**「不只你那一種寫法會過」。
（#6、#2、#4）

### P11 · 技能鏈與 burnout（間隔複習，但不要原樣重複）
skill atom 串成 skill chain；學會之後一直重複同一件事就會 burnout。
→ 對我們：一條技巧不該只出現一次。它要在後面的關卡以**配角**身分回來（主角是新技巧），
既做到間隔複習，又不會讓人覺得在寫重複的題目。
（#31）

### P12 · 變奏而非重複（same mechanic, new wrinkle）
Portal 每一章都回頭引用先前的元素，讓玩家探索它們之間的互動；132 座神廟主題一致但體驗各異。
Baba 的做法是**先找到一個有趣的互動，再反推一關**——不是先排課綱再填題目。
→ 對我們：「這一關要教 X」不足以生出好關卡；要先找到「X 用在這裡會讓人『喔！』」的那個瞬間。
（#11、#1、#19）

### P13 · 內在整合（教的東西必須是核心動詞本身）
「巧克力裹花椰菜」＝ 把學習當成玩遊戲的門票。反過來的 intrinsic integration ＝ 學習內容交付在核心機制上，
並長進世界的隱喻與結構裡。DragonBox 把代數規則變成移動卡片的動作；HRM 把組合語言變成搬紙箱。
→ 對我們：**寫 prompt 必須是核心動詞**。任何「答對三題才准繼續探索」的設計都是花椰菜。
（#29、#33、#23、#30）

### P14 · 最佳化目標可選，但不擋進度
HRM 的 size / speed challenge、Baba 的 Extra 關：給高手一個天花板，新手照樣走完主線。
→ 對我們：S 評價、以及 CLAUDE.md Phase 9 提過的「不用任何提示就拿到 S」的隱藏勳章，
就是我們的 size challenge。**它們永遠不能變成解鎖條件。**
（#23、#19）

### P15 · 起始複雜度是最大的殺手
Baba 的作者親口說：**一開始就 active 的規則越多，關卡越容易變得壓垮人**。Valve 的主元素上限也是同一件事。
→ 對我們：素材卡的長度、rubric 的條數、第一幕同時出現的資訊量，都要有硬上限。
「玩家打開關卡的第一秒眼睛落在哪裡」比「這關教得多完整」重要。
（#19、#10、#11 的認知負荷段落）

---

## 三、互動型式庫（14 種）

> 每一種寫：**它是什麼 → 靈感來源 → 適合教哪一類 prompt 技巧 → 我們的引擎要花多少工**。
>
> 可行性分級：
> - 🟢 **免費**：現有的 `choice` / `order` / `workshop` / 自由書寫直接做得到，只是換資料
> - 🟡 **中等**：要一種新的 `flows.json` `kind` ＋ 一塊新 UI，但沿用第三幕舞台、預檢、手掌印
> - 🔴 **貴**：需要新的資料層（例如離線輸出樣本、跨關卡狀態）或新的互動文法

| # | 型式 | 靈感來源 | 適合教什麼 | 可行性 |
|---|---|---|---|---|
| 1 | **分段建構（choice）**<br>一段一段從 2–3 個選項裡挑，選對就刻上去 | Duolingo word bank ＋ 干擾項（#34）；HRM 的指令積木（#23） | 幾乎所有「一段 prompt 該寫什麼」的技巧：角色、任務、格式、限制、正面表述 | 🟢 已上線（24 關） |
| 2 | **排序（order）**<br>內容已經給好，用拖曳／鍵盤排順序 | Boss Keys 的依賴圖（#25）；HRM 的指令順序（#23） | 結構型技巧：資料在前問題在後、規則的優先序、prompt chaining 的步驟先後 | 🟢 已上線（2 關） |
| 3 | **派送 / 分流（workshop）**<br>挑工具 → 填參數 → 排呼叫順序 → 立規矩 | HRM 把資料送到對的地方（#23）；Zoombinis 的分類關卡（#32） | 工具使用 / function calling；也適合「哪一段該放 system、哪一段該放 user」 | 🟢 已上線（1 關） |
| 4 | **自由書寫（free-write）** | 鷹架撤除的終點（#35、#34） | 綜合應用、複習關、拿隱藏勳章 | 🟢 已上線（可切換模式） |
| 5 | **猜規則（rule induction）**<br>給三個「輸入→輸出」的例子，玩家先推出規則，再套用到第四個 | The Witness 一區 isolate 一條規則、逼玩家自己歸納（#14、#16） | **few-shot 的完美同構**——玩家親身體會「範例本身就在傳規則」；也適合 ex/output 一致性 | 🟡 可用 `choice` 的變體做（第四題答案 ＝ 選項），近乎 🟢 |
| 6 | **找碴 / 挑出壞掉的那一句**<br>素材上的句子變成可點的 token，玩家把有問題的那幾句點出來 | Witness 的「同一組規則兩個版本」（#14）；conveyance（#18） | 消除模糊語言、負面表述、指令與資料混在一起、多餘鷹架（`keepsPromptLean`） | 🟡 新 kind，但互動很輕（token 上點 toggle，鍵盤 ↑↓ ＋ Enter） |
| 7 | **修理（fix-the-broken）**<br>預填一段官方文件裡的弱寫法，玩家改到過關 | Portal「先示範再要你做」（#11、#12）；DragonBox 的漸進形式化（#33） | 全部技巧通用，特別適合序章與每區第一關 | 🟢 已有雛形（`starter` 弱寫法）；升級成「點掉壞掉的字」＝ 🟡 |
| 8 | **前後對照（before / after）**<br>把弱寫法與強寫法並排，玩家指出「強在哪一點」 | curriculum 既有的 `BEFOREAFTER`；Portal 的 worked example（#11、#35） | 適合當一關的**第二幕素材**而不是第三幕題型；讓「為什麼這樣比較好」有依據 | 🟢 純呈現 |
| 9 | **約束滿足（constraint satisfaction）**<br>把所有限制攤在畫面上，玩家要找到同時滿足全部的寫法 | Into the Breach 的完全資訊與競爭優先序（#21） | 護欄（guardrails）、格式＋長度＋語氣同時成立、系統訊息的規則堆疊 | 🟡 我們的即時預檢**已經是**這塊面板；只要把它從「輔助」升成「舞台」即可 |
| 10 | **取捨（trade-off，兩個都對但評價不同）**<br>同一段有兩個正確選項，但這一關的素材用其中一個更合適 | Into the Breach 每回合的競爭優先序（#21）；Mega Man 的弱點鏈有最佳路線但不強制（#28） | 進階技巧：表格 vs 條列、CoT vs 直接回答、temperature 的高低取捨 | 🟢–🟡 `flows.json` 的 correct 改成帶權重；回饋文案要重寫 |
| 11 | **模擬—觀察—調整（simulation → observe → adjust）**<br>轉一個旋鈕，神諭的「輸出」跟著變（預先寫好的離線樣本，不呼叫 API） | DragonBox 改變動作看方程式怎麼變（#33）；Baba 改規則看世界怎麼變（#19）；「做系統不做腳本」（#6） | temperature / reasoning_effort / verbosity / top-p 這些**旋鈕型**技巧——目前只能用文字描述，體感最弱的一塊 | 🔴 需要一份離線輸出樣本資料（每個旋鈕值一段預寫輸出）。護欄 3 不受影響（不需 API key） |
| 12 | **逆向拆解（reverse-engineering）**<br>給一段好 prompt，玩家標出「這段用了哪一條技巧」 | Boss Keys 的依賴圖（#25）；HRM 的最佳化挑戰（#23） | **複習關 / 區域期末考**；把圖鑑收集轉成一次主動回憶 | 🟡 退化版（「這一段是哪一條技巧？」＝ `choice`）幾乎免費；真正的文字 span 標註 ＝ 🔴 |
| 13 | **逐步揭露的情報（progressive disclosure）**<br>要先在世界裡找到 2–3 塊素材，才刻得完這一關 | Outer Wilds 的 ship log 敘事網（#26）；知識即升級（#8 原則） | `groundsInContext`、`asksToCiteSources`、長文脈絡——把「找資料」真的變成走路 | 🔴 需要跨關卡的「素材背包」存檔欄位與世界端的拾取點 |
| 14 | **多輪修正（multi-turn refinement）**<br>刻完第一段 → 神諭回一段（預寫好的）不夠好的輸出 → 玩家刻第二段去修它 | Portal 第 5 章的 near transfer（#11）；起承轉合的「轉」（#17） | `asksToRefine`、prompt chaining、自我檢查、迭代式改寫——這是目前**完全沒有體感**的一類技巧 | 🔴 第三幕要能跑兩輪；但可以完全複用 `choice`，成本主要在資料與轉場 |

### 型式 → 原則的對照速查

| 想達成的原則 | 首選型式 |
|---|---|
| P3 鷹架要撤 | 1 → 7 → 4（同一條技巧的三次出場） |
| P4 環境即題目 | 6、7、8 |
| P9 完全資訊 | 9、10 |
| P10 允許多解 | 10、11 |
| P11 間隔複習不重複 | 5、12 |
| P12 變奏 | 5、11、14 |

---

## 四、對照：Promptasy 現況

**現有素材**：27 關（`src/data/challenges.json`）、27 份流程（`src/data/flows.json`）；
題型分佈 `choice` 24 ／ `order` 2 ／ `workshop` 1，外加可切換的自由書寫模式。

| 研究裡的做法 | 我們現在的位置 |
|---|---|
| 一廟一概念（P1） | ⚠️ 部分——關卡有 3–5 條 rubric，等於一關同時教好幾件事。**這是最值得檢討的一項。** |
| 起承轉合四拍（P2） | ❌ 目前一關就是一次作答，沒有「翻轉」那一拍 |
| 鷹架遞減（P3） | ✅ 序章有（full → partial → light）；⚠️ 26 關正篇之間沒有遞減曲線 |
| 環境即題目（P4） | ✅ Phase 8 的 `material` 已經在做 |
| 隔離房間（P5） | ✅ 四幕分鏡第一幕 |
| 三態遠距可讀（P6） | ✅ 石座三態 ＋ 光柱（Phase 4） |
| 自由順序 ＋ 軟門檻（P7） | ⚠️ 區域是 hard gate；區內順序其實已經自由，但**沒有推薦路線的引導** |
| 知識即升級（P8） | ⚠️ 解鎖看的是等級與通關數，不是「你懂了什麼」 |
| 完全資訊、不會失敗（P9） | ✅ WORLD.md §3.5 ＋ 即時預檢 |
| 允許多解（P10） | ✅ 引擎允許；❌ 玩家看不見 |
| 間隔複習（P11） | ❌ 68 條技巧目前是「每條至少被教到一次」，沒有第二次出場 |
| 變奏（P12） | ⚠️ 26 關題型 24 個是同一種 |
| 內在整合（P13） | ✅ 核心動詞就是寫 prompt |
| 可選最佳化目標（P14） | ⚠️ 有 S 評價，但沒有「不用提示」這類自我加難 |
| 起始複雜度上限（P15） | ✅ 四幕分鏡就是為此而生 |

**看起來投報率最高的三個缺口**：P11（技巧只出現一次）、P2（沒有「轉」）、P12（題型單一）。

---

## 五、沒查到 / 沒讀到的東西

老實記錄，免得下一次重查：

1. **GDC Vault 的三場一手影片**（#5 BotW 2017、#7 TotK 2024、#22 Into the Breach 2019）都是影片且需要帳號，
   本次只靠文字轉述。想引用**原句**（例如藤林秀麿與堂田卓宏的原話）必須另外看影片。
2. **Valve 官方的 Portal 關卡設計指南**（#12）與 **Zelda Universe 的神廟排名**（#9）都回 403，
   只讀到搜尋摘要。Valve 那句「玩家沒展現理解就不放行」是二手轉述，引用時要註明。
3. **Thinky Games 的 Metroidbrainia 專文**（#27）回 403——這是知識門檻遊戲最完整的分類文章，
   對 P8 很關鍵，值得換管道再取一次。
4. **Habgood & Ainsworth 2011**（#29）的 PDF 兩個來源都抽不出文字（掃描 / 壓縮流），
   只讀到摘要層。**Zombie Division 的實際玩法在網路二手描述裡有互相矛盾的版本**
   （有的說是動作遊戲、有的說是塔防），本文因此**沒有寫出它的類型**——要引用細節得先拿到可讀全文。
5. **DragonBox 的 ICLS 2023 分析**（#33）與 **Zoombinis 的 CIRCL 專頁**（#32）皆 403；
   Zoombinis 的論文 PDF 有公開連結但本次沒有讀進去。
6. **The Witness 的兩篇主要評論**（#15、#16）403，第 16 條那個「名詞 / 動詞 / 形容詞 / 文法」的比喻
   是搜尋摘要層取得的，引用時要註明是轉述。
7. 沒有查的方向（留給下次）：**Tunic 的說明書設計**（把教學做成收集品，跟我們的圖鑑高度相關）、
   **Return of the Obra Dinn 的推理驗證機制**（三個一組才確認，等於一種寬容的評分）、
   **Nintendo 的「起承轉合」一手資料**（林田宏一的原始訪談，目前只有 GMTK 轉述）。

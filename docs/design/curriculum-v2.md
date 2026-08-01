# Promptasy 課程與關卡設計 v2（Curriculum & Level Design v2）

> **這份文件是什麼**：把 `docs/prompt-engineering-master-list.md` 的 **292 條技巧**蒸餾成一套**玩家面的技能總表**，
> 替**每一條技能配一座只教它一條的神廟**，並把 12 個區域、互動型式、進程與實作順序一次定完。
> **這份文件不改任何程式、測試或 `CLAUDE.md`**；它是下一階段實作的規格來源。
>
> **成文日期**：2026-08-01 ｜ **依據**：`docs/design/level-design-references.md`（35 筆參考 / 15 條原則 P1–P15 / 14 種互動型式）、
> `docs/prompt-engineering-master-list.md`（292 條 / 17 章）、`docs/promptbooks/gap-analysis.md` §2–§3、`WORLD.md` §1（世界觀）與 §3（互動文法）、
> `src/data/curriculum.json`（現行 68 技巧 / 5 區）、`src/data/challenges.json`（現行 27 關）。

---

## 目錄

| § | 內容 |
|---|---|
| [0](#零設計契約) | 設計契約：這份設計服從哪幾條原則 |
| [1](#一skill-codex-v2可教技能總表) | Skill Codex v2 — 可教技能總表（130 條） |
| [2](#二區域規劃) | 區域規劃（12 區） |
| [3](#三每技巧一關神廟總表) | 每技巧一關 — 神廟總表（核心交付） |
| [4](#四既有-27-關的遷移) | 既有 27 關的遷移（保留／改造／轉為應用關） |
| [5](#五進程系統) | 進程系統：XP、精通、應用關、大師層 |
| [6](#六實作路線圖) | 實作路線圖（分期 ＋ 引擎成本） |
| [7](#七統計) | 統計 |

---

<a id="零設計契約"></a>

## 零、設計契約

這份設計要解決的是 `gap-analysis.md` §3 診斷出來的病：**26 關裡 `assignsTask` 出現 26 次（100%）、`specifiesFormat` 54%、`hasDelimiters` 46%，前三名占掉所有檢查項的 49%**——
玩家從第六關開始，每一關的前兩段刻印都長一樣。同一份參考文件的 §四也指出投報率最高的三個缺口是 **P11（技巧只出現一次、沒有第二次出場）、P2（沒有「轉」那一拍）、P12（26 關有 24 關是同一種題型）**。

因此本設計把下面九條當成**硬約束**（違反就是設計錯誤，不是品味問題）：

| # | 約束 | 出自 | 在這份設計裡怎麼落實 |
|---|---|---|---|
| C1 | **一關只教一條技巧** | P1（一廟一概念）、P15（起始複雜度） | 130 條技能 ↔ 130 座神廟，一對一。每關 **rubric 主檢查 1 條**，最多再掛 1 條「地基」檢查（權重 0.5，不計入評價門檻） |
| C2 | **同一條技巧絕不重教** | 業主要求（薩爾達神廟模式）、P11 | 每條技能只有一座神廟。後面的關卡可以**要求用到**先前的技巧（`教學前提`欄），但不再解釋它 |
| C3 | **每關要有起承轉合四拍** | P2、P12 | 神廟總表每一列都有 `起／承／轉／合`。**「轉」是強制欄位**——沒有翻轉的那一拍就不算設計完 |
| C4 | **題型要變奏** | P12 | 14 種互動型式刻意分配（見 §3 的型式直方圖）；同一個區域內不得連續三座用同一種型式 |
| C5 | **鷹架要遞減** | P3、#35 Sweller | 每區前 1/3 用 `fix`／`choice`（有預填、有選項），中段用 `spot`／`order`／`constraint`，末段的應用關用 `free`（自由書寫） |
| C6 | **環境即題目** | P4 | 每一列都有 `素材` 欄；素材看得懂＝任務看得懂。素材是抄寫人留下的失敗品，不是說明文字 |
| C7 | **不會失敗、完全資訊** | P9、WORLD.md §3.5 | 沿用現行「選錯不扣分、就地教學、不前進」；rubric 在作答前全部攤開（即時預檢） |
| C8 | **知識即升級、軟門檻** | P7、P8、#24 Boris | 區內順序完全自由；跨區用「你已經會了什麼」當條件（不是等級數字），而且沿用既有的 `skippedGates`「想先過去看看嗎」 |
| C9 | **最佳化目標可選、不擋進度** | P14 | S 評價、「零提示通關」勳章、大師層都是**選配**，永遠不能變成解鎖條件 |

另外三條是**世界觀約束**（`WORLD.md`）：神廟名要 diegetic（名詞＋場所，例如「不知之井」）；教學換皮但每一條都接得回真實官方文件（護欄 2）；整趟旅程不碰滑鼠也走得完（§3.1 鐵則）。

---

<a id="一skill-codex-v2可教技能總表"></a>

## 一、Skill Codex v2 — 可教技能總表

**蒸餾規則**（先寫規則，再看結果）：

1. **同一技巧的廠商變體、版本警示、參數別名 → 併進母技能**，寫成該技能的 note，不另開一條。
   例：`effort` / `reasoning_effort` / `thinking_level`（#64 #65 #66 #68 #276）＝ 一條 `knob-effort`。
2. **純 API 機制、平台開關、部署設定、產品配方 → 排除**，並在 §7 逐條寫理由（誠實排除，不靜默丟掉）。
3. **總表本身標記「出處找不到」的條目 → 排除**（護欄 2）。
4. **一個母條目底下真的有兩件互相獨立的事 → 拆成兩條技能**（僅兩例：#187 拆成 `chain-serial` 與 `draft-review-refine`、#76 拆成 `knob-temperature` 與 `knob-limits`）。
5. **tier**：`基本功`＝聊天視窗就用得到、零背景知識；`進階`＝要先會別的技巧；`大師`＝取捨題、跨模型判斷、或需要工程脈絡。

> **每一列的 `master #` 欄可以直接對回 `docs/prompt-engineering-master-list.md` 的 `### N.` 條目**（該檔的錨點是 `#eN`）。

### 撰寫基本功（`foundations`） — 14 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `clear-golden` | 把它當成沒有背景的新同事 | #12,#144 | prompt 要寫到「一個沒看過這件事的人拿了就做得出來」才算寫完。 | 基本功 | — |
| `clear-specific` | 具體到可以驗收 | #13,#21 | 把情境、成果、長度、格式、風格寫成看得見的規格；先認出你要的是問題、任務、實體還是補完。 | 基本功 | `clear-golden` |
| `clear-positive` | 說要做什麼，不要只說不要 | #14 | 把「不要做 X」翻成「請做 Y」，模型才知道往哪走。 | 基本功 | `clear-specific` |
| `clear-constraint` | 限制要寫成量得出來的數字 | #15 | 「短一點」不是限制，「三句話以內」才是。 | 基本功 | `clear-specific` |
| `clear-imperative` | 要它動手，不是要它給建議 | #16 | 用祈使句要成品，不要問「你覺得可以怎麼做」。 | 基本功 | `clear-positive` |
| `clear-scope` | 講清楚這條規矩管到哪裡 | #17 | 新模型照字面做事，不會替你類推：「每一節都要」要自己說。 | 進階 | `clear-specific` |
| `clear-no-pressure` | 喊得大聲沒有用 | #18 | 全大寫、賄賂、催促、情緒勒索都不會讓它做得更好。 | 基本功 | `clear-positive` |
| `word-choice` | 換一個詞就換一個結果 | #265,#72 | 歧義詞（語言／檢討／think）會整個換掉輸出方向，挑字要挑只有一種解讀的。 | 進階 | `clear-specific` |
| `context-why` | 說明為什麼 | #22 | 給指令一個動機，它才知道邊界在哪裡。 | 基本功 | `clear-specific` |
| `context-supply` | 它不知道的事，你要給它 | #23,#24,#99,#54 | 背景資訊與規則都要親手放進 prompt；它不知道今天幾號、也不知道自己是誰。 | 基本功 | `context-why` |
| `struct-delimiters` | 用分隔符把東西切開 | #27,#28 | 標題、清單、前綴、BEGIN/END 都行；分隔符要挑自然語言裡罕見的字元組合。 | 基本功 | `context-supply` |
| `struct-xml` | 標籤分區，以及它為什麼變得沒那麼必要 | #25,#26 | XML 標籤讓區塊界線最清楚；新模型已較不依賴它，別為了標籤而標籤。 | 進階 | `struct-delimiters` |
| `struct-anatomy` | prompt 的零件表 | #29,#30,#38 | 內容與版面是兩件事；把會變的部分抽成變數，骨架才重複用得了。 | 進階 | `struct-delimiters` |
| `pos-rules-first` | 規則放最前面，打架時靠後的贏 | #37 | 規則區放最上面；同一件事講兩次時，模型傾向照靠近結尾那一條做。 | 進階 | `struct-anatomy` |

### 示範與推理（`reasoning`） — 15 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `fewshot-basics` | 範例的基本功 | #39 | 放 3–5 個相關、多樣、結構一致的「輸入→輸出」，勝過一整段形容。 | 基本功 | `clear-specific` |
| `fewshot-consistent` | 範例的格式要一致，而且要配指令 | #42,#43 | 格式一不一致，模型學走的規律就不一樣；沒有指令的範例會讓它學到不相干的東西。 | 基本功 | `fewshot-basics` |
| `fewshot-count` | 幾個才夠，以及多到什麼程度會壞 | #41,#44 | 數量要實測：太少學不到、太多會過擬合；長脈絡模型另有 many-shot 這條路。 | 進階 | `fewshot-basics` |
| `fewshot-negative` | 壞例子與例子的順序 | #268 | 負面範例要附「為什麼錯」；範例的排列順序本身也會被學成規律。 | 進階 | `fewshot-consistent` |
| `fewshot-when` | 什麼時候不該放範例 | #40,#45 | Google 說幾乎永遠要放；推理模型的官方建議卻是先 zero-shot 再說。 | 大師 | `fewshot-count` |
| `fewshot-thinking` | 在範例裡示範怎麼想 | #47 | 範例裡連推理過程一起示範，模型會連推理樣式一起學走。 | 進階 | `fewshot-basics` `cot-explicit` |
| `cot-explicit` | 明講「一步一步想」 | #59,#60 | 非推理模型要你開口它才會想；思考功能關掉時，這是唯一的替代路徑。 | 基本功 | `clear-specific` |
| `cot-separate-answer` | 把推理和答案切開 | #61 | 要它解釋，就要指定推理放哪、答案放哪，不然兩者黏成一團。 | 進階 | `cot-explicit` `struct-delimiters` |
| `reason-keep-simple` | 推理模型要短、要目標 | #56,#57 | 對推理模型別下逐步鷹架；給目標與成功標準，指令越短越穩。 | 進階 | `cot-explicit` |
| `reason-no-transcript` | 不要叫它覆述腦子裡的過程 | #58,#74 | 要求轉錄內部推理會被拒絕；要看過程請用官方的推理摘要。 | 大師 | `reason-keep-simple` |
| `think-control` | 用一句話開關它的思考 | #62,#272,#274 | 有的模型自己決定想多久；有的靠 `/think`、`/no_think` 或讓回應以 `<think>` 開頭。 | 進階 | `cot-explicit` |
| `think-after-tool` | 拿到東西之後再想一次 | #63 | 工具結果回來時明講「先評估再繼續」，它才會在中途調整方向。 | 進階 | `think-control` |
| `knob-effort` | 想多久的那個旋鈕 | #64,#65,#66,#68,#276,#71,#75 | 各家名字都不同（effort / reasoning_effort / thinking_level），關小或關掉時 prompt 要寫得更明。 | 進階 | `think-control` |
| `overthinking-remove` | 把「盡量徹底」的鷹架收掉 | #70,#253 | 鼓勵徹底的句子會讓新模型想過頭；該刪的是你的鷹架，不是它的能力。 | 大師 | `reason-keep-simple` |
| `self-consistency` | 同一題問三次，取多數 | #288 | 不確定的題目多跑幾次投票；評測也要多跑取平均，不要只看一次。 | 進階 | `cot-explicit` |

### 脈絡與長文（`grounding`） — 12 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `long-query-last` | 資料在前、問題在後（以及頭尾各一次） | #80,#81 | 長資料放最上面、任務放最後；某些模型長文時要把指令在開頭與結尾各放一次。 | 基本功 | `struct-delimiters` |
| `long-doc-structure` | 多份文件要標好，而且別用 JSON 包 | #82,#83,#292 | 每份文件標上來源與編號；長資料用標籤或直線分隔，JSON 既傷準度又貴。 | 進階 | `long-query-last` |
| `long-all-upfront` | 乾脆全部放進去，但一次別問太多針 | #84,#85 | 脈絡夠長就整份放進去；同一次要找的東西越多，命中率越低。 | 進階 | `long-doc-structure` |
| `long-outline-anchor` | 先做大綱，再把每句話錨回章節 | #86,#87 | 長文先讓它列出內部大綱，再要求每個主張標出出自哪一節。 | 大師 | `long-doc-structure` |
| `ground-strict` | 只准用我給的資料 | #90 | 明講「只根據以下內容作答」，把它的舊記憶關在門外。 | 基本功 | `context-supply` |
| `ground-out` | 給它一條說「我不知道」的路 | #89 | 明講「沒有就說沒有」「不清楚就先問我一到三個問題」，硬掰才會停。 | 基本功 | `ground-strict` |
| `ground-quote-first` | 先把原文引出來，再作答 | #88 | 要求它先貼出相關原句、再根據原句回答，答案就跑不掉。 | 基本功 | `ground-strict` |
| `cite-format` | 引用要就地標在句尾 | #92,#98 | 引用格式要在 prompt 裡規定清楚，而且「開了引用」不等於每次都會引。 | 進階 | `ground-quote-first` |
| `ground-read-first` | 讀過再說，沒證據不准說做完了 | #97,#96,#95 | 沒讀就不准斷言；進度與結論都要有可指出的依據，重要的事跨來源對一次。 | 進階 | `ground-quote-first` |
| `retrieval-budget` | 什麼情況才值得再查一次 | #91,#94,#93 | 把「什麼時候該再搜、什麼時候該停」寫進 prompt，不然它會查到天亮或第一頁就收工。 | 大師 | `ground-read-first` |
| `halluc-causes` | 幻覺的三種來源 | #281 | 分清楚是「資料沒給」「問題超綱」還是「格式逼它硬填」，修法完全不同。 | 大師 | `ground-out` |
| `extract-spec` | 抽資料：四要素與缺欄位填 null | #282,#132 | 任務指令＋格式模板＋注意事項＋輸出示例；沒有的欄位一律 null，不准猜。 | 進階 | `ground-strict` |

### 流程與代理（`orchestration`） — 12 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `chain-serial` | 把大事拆小，一步的產物餵給下一步 | #187,#287 | 拆指令、串接、彙總三種拆法；串接時要明講「這一輪只回傳第幾步」。 | 基本功 | `clear-specific` |
| `outcome-first` | 講終點，不規定每一步 | #55,#171,#254 | 描述「做完長什麼樣」與「什麼時候該停」，路徑交給它；規格一次講完，少來回。 | 進階 | `chain-serial` |
| `agent-three-reminders` | 三條老規矩：做完、去查、先想 | #169 | 持續做到完、不確定就去查不要猜、動手前先計畫——一段話講完。 | 基本功 | `outcome-first` |
| `agent-eagerness` | 積極度是一條光譜，兩頭都要會調 | #170,#185,#188 | 太保守要推它一把、太衝要拉住它；官方列了九個可調維度。 | 大師 | `agent-three-reminders` |
| `agent-approval-bounds` | 什麼可以自己做，什麼要先問 | #172,#173,#174,#179 | 依「可逆性」畫界線：可逆的自己做、不可逆的先問；還要分清「評估」與「動手」。 | 進階 | `agent-three-reminders` |
| `agent-scope-drift` | 別自己加戲 | #175,#176,#177,#194 | 不准擴大範圍、不准為了過測試寫死、不准留一地暫存檔。 | 進階 | `outcome-first` |
| `agent-plan-first` | 先計畫、審過再動手 | #190,#178,#189 | 讓它先交計畫、你點頭再執行；官方有現成的八步工作流可以照抄。 | 進階 | `agent-approval-bounds` |
| `agent-longhorizon` | 長工要一段一段推，還要跟它說脈絡會被壓縮 | #180,#181,#118 | 增量推進、狀態隨時可交接；並明講「脈絡會自動壓縮，不要提早收工」，進度只在階段變化時報。 | 大師 | `agent-plan-first` |
| `agent-state` | 狀態與記憶要有地方放 | #183,#184 | 把「現在做到哪」寫成一份可讀可寫的檔案，跨回合才接得起來。 | 大師 | `agent-longhorizon` |
| `agent-subagents` | 什麼時候該派人去做 | #186 | 會拖慢主線又獨立的事才外派；派出去要連驗收標準一起交代。 | 大師 | `agent-state` |
| `standing-instructions` | 把常駐的規矩寫成一張紙 | #192,#193 | 每次都要講的事寫成常駐檔案；短而具體勝過長。 | 進階 | `agent-three-reminders` |
| `action-budget` | 動作預算與回合預算 | #166,#191 | 一句「你最多只能呼叫 n 次工具」就收得住亂查；回合數與呼叫數是兩件事。 | 進階 | `agent-approval-bounds` |

### 角色與參數（`config`） — 12 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `role-basics` | 給它一個角色（順便別綁太死） | #48,#49 | 一句「你是⋯」就能換掉整個語域；但角色寫得太死會擋掉它該做的事。 | 基本功 | `clear-specific` |
| `system-uses` | 系統訊息拿來做什麼 | #50 | 角色、格式、規則、禁區、輸出語言——這五種話放系統訊息最穩。 | 進階 | `role-basics` |
| `hierarchy` | 誰說了算（含單回合覆寫） | #51,#52,#53 | 開發者訊息壓過使用者訊息；推理模型把 system 改叫 developer，位置一樣。 | 進階 | `system-uses` |
| `no-system-field` | 沒有系統欄位的時候 | #270 | 只有一個輸入框時，把角色與規則接在你的問題前面，用分隔符切開。 | 基本功 | `system-uses` |
| `skeleton-ptcf` | 四要素：角色・任務・脈絡・格式 | #36 | 最小可用的骨架；四格填滿，八成的問題就成立了。 | 基本功 | `role-basics` |
| `skeleton-six-elements` | 六要素：再加上風格、語氣、受眾 | #266 | 把風格、語氣、受眾升格成必填欄位，輸出的「調」才穩得下來。 | 進階 | `skeleton-ptcf` |
| `skeleton-dev-message` | 開發者訊息骨架與收工規則 | #33,#34,#35 | 身分→指令→範例→脈絡的四段式；再往上是七段、八段，最後一段是「什麼時候該停」。 | 大師 | `skeleton-ptcf` `hierarchy` |
| `skeleton-consistency` | 骨架擇一貫徹，不要混用 | #31,#32,#267 | 標籤版與標題版都行，混著用最糟；挑一種就整份走到底。 | 大師 | `skeleton-dev-message` |
| `knob-temperature` | 溫度與取樣範圍 | #278,#76,#273,#279 | 要穩定就低、要多樣就高；0 不保證每次一樣，而思考型模型不准設 0。 | 進階 | `param-not-plead` |
| `knob-limits` | 輸出上限與停止序列 | #76,#73 | 講清楚最多寫多長、看到什麼就停；還要記得替它的思考留空間。 | 進階 | `knob-temperature` |
| `param-not-plead` | 能用旋鈕保證的，不要用嘴巴拜託 | #10 | 「請每次都一樣」是願望，`temperature=0` 才是保證。 | 基本功 | `clear-constraint` |
| `model-pick` | 挑一台對的 | #4,#262,#263 | 推理型像資深同事、一般型像新進同事；先決定要付多少推理，再寫 prompt。 | 大師 | `knob-effort` |

### 量器坊（`forms`） — 14 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `fmt-specify` | 直接把格式指定出來 | #101,#106,#102 | 要表格就說表格、要三行就說三行；數學式預設是 LaTeX，要純文字得明講；也可以用標籤指定輸出區塊。 | 基本功 | `clear-specific` |
| `fmt-markdown-diet` | 少用條列也要明講（而且要一直講） | #104,#105,#103 | 要它別滿版標題與圓點，得寫一段格式偏好；長對話裡還要週期性重申。你的排版也會傳染給它。 | 進階 | `fmt-specify` |
| `prefill-completion` | 寫出開頭讓它接下去 | #46,#251 | 把回應的第一行先寫好，它會照那個形狀接完；此路在部分新模型上已改走結構化輸出。 | 進階 | `fmt-specify` |
| `answer-anchor` | 讓答案抓得出來 | #283,#285 | 把最終答案放進固定位置（`\boxed{}`、`"answer"`）；分類任務一定要有兜底類別。 | 進階 | `fmt-specify` |
| `no-counting` | 不要叫它數數 | #286 | 字數、筆數這種事交給程式算好再餵給它，別叫它自己數。 | 基本功 | `clear-constraint` |
| `len-concrete` | 長度要給得出數字（想得多≠說得多） | #107,#111,#113 | 「簡短」不是長度，「三句話」才是；推理旋鈕控制的是想多少，不是說多少；對話長度與檔案長度要分開講。 | 基本功 | `clear-constraint` |
| `len-preserve` | 要短，就明講什麼必須留下 | #108 | 只說「縮短」它會砍掉最重要的那段；要點名哪些不准丟。 | 基本功 | `len-concrete` |
| `len-readable` | 好讀跟短是兩回事 | #114,#115 | 最終要給人看的東西要「重新落地」，不是工作腦的延伸；一句話就能改掉行文習慣。 | 進階 | `len-preserve` |
| `tone-concrete` | 語氣要用具體的寫作選擇定義 | #116,#117 | 別寫「請專業一點」，要寫「不用驚嘆號、每段兩句、不用比喻」；給的樣板句要求它變化。 | 進階 | `len-readable` |
| `no-preamble` | 去掉開場白與說教 | #120,#271 | 「當然！以下是⋯」「值得注意的是⋯」都可以列成禁用片語直接關掉。 | 基本功 | `tone-concrete` |
| `so-basics` | 用結構把輸出綁住 | #121,#122 | 把想要的欄位寫成 schema，格式就不再靠運氣。 | 進階 | `fmt-specify` |
| `so-vs-jsonmode` | 結構化輸出 vs JSON 模式 vs 工具 | #124,#284,#123 | 前者保證符合你的 schema，後者只保證是合法 JSON；用後者時 prompt 裡要出現 "json" 並附範例。 | 大師 | `so-basics` |
| `so-division` | 模子管形狀，話只管任務（哪些是保證、哪些只是建議） | #129,#127,#128,#130,#146 | schema 已經寫的東西不要在 prompt 裡再寫一次；資料塞不進模子時要先講好怎麼辦。 | 大師 | `so-basics` |
| `doc-design-elements` | 要簡報、要圖，就要點名設計元素 | #133 | 要它做視覺文件，得指名版面、配色、動態這些元素，不然只會給你純文字。 | 進階 | `fmt-specify` |

### 契約鍛冶場（`toolcraft`） — 11 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `tool-native-field` | 工具要用宣告的，不要用講的 | #155 | 把工具寫進 API 的 tools 欄位，不要把 schema 抄進 prompt 文字裡。 | 進階 | `struct-anatomy` |
| `tool-description` | 工具說明是最重要的一件事（含範例與語氣） | #134,#137,#138,#139,#157 | 工具說明要寫到實習生看了就會用；關鍵規則放最前面、附上範例與邊界案例、別滿篇 CRITICAL。 | 基本功 | `tool-native-field` |
| `tool-naming` | 命名要有姓，描述不可以重疊 | #140,#143 | 同一族工具用同一個前綴；兩個工具的描述不能讓人二選一選不出來；用列舉讓非法狀態寫不出來。 | 進階 | `tool-description` |
| `tool-fewer` | 只擺出用得到的 | #135,#156,#141 | 工具越多挑錯的機率越高；相關的操作合併，你已經知道的參數不要問它。 | 進階 | `tool-description` |
| `tool-when-not` | 什麼時候該用、什麼時候不該用 | #136,#149,#160 | 把「該用」「不該用」與例外條款一起寫；只有邊界寫清楚，它才不會亂叫工具。 | 進階 | `tool-fewer` |
| `tool-trigger-push` | 它不肯用工具時推一把（以及強迫的副作用） | #158,#145 | 偏好自己想的模型要明講「先查再答」；但強制呼叫會讓它沒辦法直接回答。 | 大師 | `tool-when-not` |
| `tool-ask-missing` | 缺參數就問，不要猜，也不准說「等一下再查」 | #150,#151 | 必要參數沒有就回頭問人；禁止它承諾「我稍後會查」然後不查。 | 基本功 | `tool-when-not` |
| `tool-order` | 先後順序與一次叫好幾個 | #152,#153,#148 | 有相依關係的要規定順序；沒有相依關係的鼓勵一次叫齊。 | 進階 | `tool-when-not` |
| `tool-prefer-compute` | 寧可去算，不要用猜的 | #154,#167,#159 | 算術、日期、統計一律交給工具或程式；必要時讓它寫一小段程式來算。 | 進階 | `tool-ask-missing` |
| `tool-result-signal` | 回來的東西只留有用的 | #142,#162 | 工具回傳要精簡到只剩訊號；伺服器端工具的輸出你根本拿不到，要它自己寫進回應。 | 大師 | `tool-order` |
| `tool-preamble` | 動手前後都要說一句（但不要吐結構化文字） | #119,#165 | 呼叫工具前後對人說一句話；但別要求它在呼叫前輸出 JSON，那會直接壞掉。 | 進階 | `tool-description` |

### 減法之庭（`frugality`） — 7 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `lean-prompt` | 精簡的 prompt 反而更好 | #207,#8,#20 | 每條指令只講一次；最成功的 prompt 平均只有二十來個字。 | 基本功 | `clear-specific` |
| `lean-output` | 只生成必要的東西 | #291 | 它讀比寫快得多；能不叫它重述的就不要叫它重述。 | 進階 | `lean-prompt` |
| `cache-static-first` | 不動的放前面，會變的放後面 | #209,#210,#211,#212 | 固定的規則與資料放最前面，變動的放最後；前綴一改，快取就整個失效（但快取不影響品質）。 | 大師 | `struct-anatomy` |
| `ctx-compaction` | 長流程要壓縮脈絡 | #213,#182,#208,#217 | 脈絡會漲；定期把過去的過程壓成摘要，並明講交接時要保留哪些事實。 | 大師 | `agent-longhorizon` |
| `ctx-pruning` | 把過期的東西換成一句話 | #214 | 老掉的工具結果留著只會佔位置，換成一行摘要。 | 進階 | `ctx-compaction` |
| `ctx-new-chat` | 換主題就開新的一頁 | #215 | 舊主題的殘影會讓它變懶；換題目就換一頁，比任何咒語都有效。 | 基本功 | `ctx-compaction` |
| `ctx-reuse-reasoning` | 把想過的帶回去用 | #216 | 多輪之間把推理脈絡帶回去，既省 token 也更聰明。 | 大師 | `ctx-compaction` |

### 校驗場（`refinery`） — 11 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `meta-when` | 先問這是不是 prompt 的問題 | #3,#9 | 有些問題該換模型、該給工具、該改流程；不是每一件事都靠改字解決。 | 基本功 | `clear-specific` |
| `meta-iterate` | prompt 是改出來的（怎麼知道收斂了） | #1,#7,#202,#206,#201 | 官方範本只是起點；卡住時換句話說、換成類比任務、調換順序。再加限制輸出仍相似＝收斂。 | 基本功 | `meta-when` |
| `meta-eval` | 建一組題目來比 | #2,#5,#203,#290 | 手上要有一小組有標準答案的題目；改 prompt 之後並排跑，才知道是不是真的變好。上線後持續收回饋。 | 大師 | `meta-iterate` |
| `meta-metaprompt` | 讓它改自己的 prompt | #205,#204,#19 | 把失敗的輸出連同 prompt 一起交回去，要它指出哪一句造成的並改寫。 | 進階 | `meta-iterate` |
| `contradiction-fix` | 打架的規則，改寫成決策樹 | #199 | 兩條規則同時成立時輸出會亂跳；官方解法是排成「先看什麼、再看什麼」。 | 進階 | `pos-rules-first` |
| `prompt-healthcheck` | 二十二條健檢 | #200 | 錯字、沒定義的行話、主觀形容詞、一次塞太多任務——照著表逐條看。 | 大師 | `meta-iterate` |
| `selfcheck-when` | 「請再檢查一次」什麼時候有用 | #195 | 舊模型靠它救回一命，新模型多半只是被拖慢——這句話該不該留是要判斷的。 | 大師 | `meta-eval` |
| `verify-with-tools` | 給它能真的驗的東西 | #196 | 光說「檢查一下」沒有用；要指定「用什麼驗、驗什麼、不通過怎麼辦」。 | 進階 | `selfcheck-when` |
| `self-rubric` | 先寫評分表，再自評（而且用文字級距） | #198,#289 | 讓它先訂出「好長什麼樣」再照著自評；級距用文字寫，不要用 1–5。 | 大師 | `verify-with-tools` |
| `two-stage-filter` | 先全部找出來，再過濾 | #197 | 一次要它「只找真正重要的」會漏；分成「先找齊」與「再篩選」兩段。 | 大師 | `chain-serial` |
| `draft-review-refine` | 草稿 → 審查 → 改寫 | #187 | 最常見的一條鏈：先寫、再用另一段 prompt 挑毛病、最後照著改。 | 基本功 | `chain-serial` |

### 護欄崗（`wards`） — 5 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `inj-concept` | 別人的字也會變成指令 | #244 | 放進 prompt 的外部內容等同可執行指令——它就是 SQL injection 的那個問題。 | 基本功 | `context-supply` |
| `inj-input-channel` | 用「怎麼給」提高安全，不是只靠一句話 | #245 | 把外部內容用固定通道、固定標籤送進去，比在 prompt 裡拜託它別上當可靠。 | 進階 | `inj-concept` |
| `inj-lower-risk-shape` | 把任務改成本來就不危險的形狀 | #246 | 讓它「提出建議由人執行」而不是「直接執行」，風險就從根上消掉。 | 大師 | `inj-input-channel` |
| `guardrail-hitl` | 人留在迴圈裡 | #248,#249 | 最小權限、敏感動作先問人、可疑就停下來——官方有現成的護欄範本可以照抄。 | 大師 | `agent-approval-bounds` |
| `redteam` | 先自己攻擊自己 | #247 | 上線前用對抗式測試找出會被繞過的地方，這也是一種 prompt 練習。 | 大師 | `inj-lower-risk-shape` |

### 觀象臺（`sight`） — 8 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `mm-basics` | 看圖說話的五件事 | #218,#222 | 圖文一起給時要說清楚看哪裡、要什麼、圖與文的關係；問影片要用時間戳。 | 基本功 | `clear-specific` |
| `mm-troubleshoot` | 它看錯了怎麼辦 | #219,#220,#234,#221,#223 | 拆步驟、指定要看的區域、給它裁切工具放大；輸入圖本身的清晰度與解析度設定也是 prompt 的一部分。 | 進階 | `mm-basics` |
| `img-generate` | 生圖的範本與六條實務 | #224,#226 | 主體、場景、風格、鏡頭、光線、細節依序寫；「不要出現 X」要改寫成正面描述。 | 基本功 | `clear-positive` |
| `img-edit` | 改圖：範本與連鎖編輯 | #225,#231 | 改圖要講清楚改哪裡、保留哪裡；風格由形容詞決定，複雜的改動一次一步。 | 進階 | `img-generate` |
| `video-prompt` | 影片 prompt 的六個要素（含三種聲音分開寫） | #227,#229,#228 | 主體、動作、場景、鏡頭運動、風格、氣氛；描述性語言與臉部細節關鍵字會明顯改變結果。 | 進階 | `img-generate` |
| `tts-writing` | 標點就是韻律（以及語音標記的兩種語法） | #235,#237,#236 | 逗號、句號、破折號決定停頓；要它慢下來就改標點，不是拜託它慢一點。 | 進階 | `tone-concrete` |
| `design-anti-slop` | 避開「一看就是 AI 做的」 | #238,#239,#240 | 先知道它的預設家風，再指定具體的替代方案；或先要它提選項再建構。 | 大師 | `tone-concrete` |
| `fe-spec` | 要做東西就要指名（框架、六個面向、既有系統） | #241,#242 | 指名框架與函式庫，涵蓋版面、狀態、無障礙等六個面向；改一小塊時要明講保留既有設計系統。 | 進階 | `design-anti-slop` |

### 分歧之廳（`divergence`） — 9 條

| id | 中文名 | master # | 一句話 | tier | 先修 |
|---|---|---|---|---|---|
| `contrast-persona` | 該不該給它一個身分：兩家相反 | #269,#277 | 有的官方明說「不要加 system prompt」，有的官方強烈建議「請務必加上這一段」。 | 大師 | `role-basics` |
| `contrast-carry-thinking` | 想過的東西要不要帶回去：三家立場 | #275 | 多輪對話要不要把思考內容帶回去，三家官方立場不同，抄錯會變慢也會變笨。 | 大師 | `ctx-reuse-reasoning` |
| `contrast-same-name` | 同一個名字，不同意思 | #67 | 同一個參數名在不同家控制的是完全不同的東西——照抄別人的設定會出事。 | 大師 | `knob-effort` |
| `migrate-params-deprecated` | 抄來的旋鈕設定會直接報錯 | #69,#77,#78,#257 | 有的模型設了 temperature 就回錯誤、有的官方直接說「全部保持預設」。 | 大師 | `knob-temperature` |
| `migrate-cot-to-knob` | 把 CoT 鷹架換成旋鈕 | #258 | 舊模型靠「一步一步想」，新模型改用思考等級——同一件事換了介面。 | 大師 | `cot-explicit` `knob-effort` |
| `migrate-recheck-concise` | 換模型時要重看「簡潔」這種話 | #109,#110,#112 | 舊模型要你叫它簡短，新模型本來就簡短——同一句話現在會讓它答太少。 | 大師 | `len-concrete` |
| `migrate-strip-patches` | 換更強的模型就把補丁刪掉 | #264 | 舊 prompt 裡那些為了繞過弱點的補丁，在新模型上會變成新的弱點。 | 大師 | `migrate-recheck-concise` |
| `migrate-checklist` | 遷移不要整包重寫 | #252,#260,#261 | 先換模型不動 prompt、跑一次評測、只改壞掉的那幾條——官方給的是五步，不是重來。 | 大師 | `meta-eval` |
| `era-current-rules` | 守則會換版 | #255,#256 | 各家的「現行最佳實務」是一整頁、而且會改版；抄三年前的文章比不抄還糟。 | 大師 | `migrate-checklist` |

---

<a id="二區域規劃"></a>

## 二、區域規劃

現行五區（foundations / reasoning / grounding / orchestration / config）**全部保留、地形不動**——它們本來就對得上課程的五大分群，硬改會違反護欄 7（不倒退）。
新增七區，其中 **只有三區需要新地形**，其餘四區是既有地形上的建物或院落（`gap-analysis.md` §四已建議過這個作法：地形成本高，能加建就不要開新區）。

| # | 區域 | 世界裡的位置 | 主題 | 技能數 | 解鎖關係（P7 軟門檻 · P8 知識即升級） | 地標一句話 | 引擎成本 |
|---|---|---|---|---:|---|---|---|
| 1 | **撰寫基本功** `foundations` | 中央高原 | 把話說完整：說清楚、給脈絡、切好區塊。這一區教的是「你沒說的它不會知道」。 | 14 | 起點。序章畢業即開放，區內 14 座神廟自由順序（P7 軟門檻）。 | 斷環 | 既有 |
| 2 | **示範與推理** `reasoning` | 西北 · 階梯迴廊 | 給它看，或讓它想：範例、逐步思考、思考旋鈕。這一區教的是「怎麼影響它的過程」。 | 15 | 軟門檻：foundations 任兩座神廟。閘門會問「要先過去看看嗎」（既有 skippedGates 機制）。 | 無盡階梯塔 | 既有 |
| 3 | **脈絡與長文** `grounding` | 東北 · 沉書檔案庫 | 先讀再答：長文定位、引用、抗幻覺、檢索預算。這一區教的是「怎麼讓它有依據」。 | 12 | 軟門檻：foundations 的 context-supply ＋ struct-delimiters（知識即升級，P8）。 | 藏書之樹 | 既有 |
| 4 | **流程與代理** `orchestration` | 西南 · 齒輪工坊 | 把大事拆小、把界線畫清楚：拆解、鏈、自主性、預算、狀態。 | 12 | 軟門檻：reasoning ＋ grounding 各兩座。 | 巨臂吊車 | 既有 |
| 5 | **角色與參數** `config` | 東南 · 面具劇場 | 換上面具再開口：角色、系統訊息、指令階層、骨架、取樣旋鈕。 | 12 | 軟門檻：foundations 全區精通（或 8 座）。 | 面具拱門 | 既有 |
| 6 | **量器坊** `forms` | 正南 · 新地形 | 把神諭的話倒進模子裡定形：輸出格式、長度、語氣、結構化輸出。 | 14 | 軟門檻：foundations 的 fmt 前置（clear-specific）＋ config 任一座。 | 刻度之柱（一根被刻滿量度的斷柱，柱頂懸著一把不動的尺） | 🔴 新地形 |
| 7 | **契約鍛冶場** `toolcraft` | 正西 · 新地形 | 工具是宣告出來的：說明、命名、時機、順序、預算。抄寫人在這裡替神諭打造它的手。 | 11 | 軟門檻：orchestration 三座（含 agent-approval-bounds）。 | 未命名的工具（半空中一圈懸浮的鑰匙，每一把都沒有刻名字） | 🔴 新地形 |
| 8 | **減法之庭** `frugality` | 中央高原北緣 · 高原上的院落 | 學會拿掉：精簡、快取順序、脈絡壓縮。這一區的每一關都是「刪對地方」。 | 7 | 軟門檻：任一區精通。 | 空的基座（一座什麼都沒放的基座，銘文寫著被拿走的東西） | 🟡 高原加建 |
| 9 | **校驗場** `refinery` | 西南外緣 · 齒輪工坊旁的院子 | 改 prompt 的 prompt：迭代、評測、自評、健檢、矛盾修復。 | 11 | 軟門檻：orchestration 兩座 ＋ 任一區精通。 | 會回頭照自己的鏡（兩面互相對照的鏡） | 🟡 既有地形加建 |
| 10 | **護欄崗** `wards` | 東北外緣 · 檔案庫外的哨所 | 外面來的字也是指令：注入、輸入通道、低風險形狀、人在迴圈。 | 5 | 軟門檻：grounding 三座 ＋ toolcraft 一座。 | 不會關上的門（一道永遠留一條縫的雙層門） | 🟡 既有地形加建 |
| 11 | **觀象臺** `sight` | 東北高地 · 新地形（小） | 不只讀字：看圖、看影片、生圖、生影片、說話的聲音、做東西的樣子。 | 8 | 軟門檻：foundations 全區精通。與其他區互不相依（可最早或最晚玩）。 | 一面朝天的鏡（斜插在坡上、映著整片星空的巨鏡） | 🔴 新地形（小） |
| 12 | **分歧之廳** `divergence` | 中央高原 · 高原上的建物 | 神諭彼此矛盾：廠家反差、同名不同義、遷移與時代警示。大師層的收束。 | 9 | 硬門檻：四區精通（等同既有 finale 的位階）。 | 五根兩面刻著相反神諭的柱 | 🟢 高原建物 |

**三條區域層的規則**：

- **區內完全自由順序**（P7）。推薦路線用「走出來的路」的亮度表示（WORLD.md §4.3 的頂點色路網已經有這個能力），不是用鎖。
- **跨區是軟門檻**：條件寫的是「你已經會了哪幾條」（P8 知識即升級）而不是等級數字；閘門沿用既有的「想先過去看看嗎」，選了就開門但不給進度。
- **`sight`（觀象臺）刻意不接在任何一區後面**——多模態跟文字技巧沒有依賴關係，它應該是玩家隨時可以岔出去的一條線（#3 BotW 自訂節奏）。

---

<a id="三每技巧一關神廟總表"></a>

## 三、每技巧一關 — 神廟總表

這是這份文件的**核心交付**。每一列＝一座神廟＝一條技巧。欄位讀法：

- **教學前提**：這一關**可以假設玩家已經會**的技巧（＝素材與選項可以直接用它，不再解釋）。這就是 C2「不重教」的實作方式，也是 P11 的間隔複習：舊技巧以**配角**身分回來。
- **互動型式**：取自參考文件 §三的 14 種型式。括號內是引擎成本（🟢 換資料即可／🟡 新 `kind` ＋ 一塊 UI／🔴 新資料層或新互動文法）。
- **起承轉合**：P2。**「轉」是這一關存在的理由**——沒有那個「喔！」的瞬間就不要蓋這一關（P12：先找到有趣的互動，再反推關卡）。
- **rubric**：`既有檢查器` 直接寫名字；**🆕** ＝ 需要新寫一個離線檢查器。所有新檢查器都必須是**結構性偵測**而不是關鍵字比對（沿用現行反作弊原則）。

### 撰寫基本功（`foundations`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `clear-golden` | **新來的守夜人** | （序章即可） | 修理（fix-the-broken） 🟢／🟡 | 起：照交班紙巡一次，做不出來／承：把缺的背景一句一句補回去／轉：補過頭，任務被背景蓋住／合：改成一張新人拿了就會做的紙 | 守夜人的交班紙：「照舊巡一輪，重點那幾個地方多看一下。」 | 🆕`noUndefinedReference`（有沒有沒交代的「那個／照舊／重點」）＋ `assignsTask` |
| 2 | `clear-specific` | **清晰之門（改造）** | `clear-golden` | 分段建構（choice） 🟢 | 起：模糊的告示做出四種都對又都不對的東西／承：一項一項補規格／轉：規格互相打架，得挑一個／合：寫出只有一種做法的告示 | 守門人那張「幫我寫個東西」的告示 | `hasConstraint`＋`specifiesFormat` |
| 3 | `clear-positive` | **迷路的自動機（保留）** | `clear-specific` | 修理（fix-the-broken） 🟢／🟡 | 起：自動機胸口一串「不要」，它站著不動／承：把第一條禁令翻成正面指令／轉：有一條禁令翻不動——那條是真的要留的護欄／合：正面指令在前、必要的禁令留在後 | 自動機胸口的禁止清單 | `positiveFraming` |
| 4 | `clear-constraint` | **量繩之桌** | `clear-specific` | 約束滿足（constraint satisfaction） 🟡 | 起：桌上三條沒有刻度的繩子／承：替每條限制找一個單位／轉：兩條限制同時滿足不了，要標出哪一條可以讓／合：一組彼此不打架的可量化限制 | 抄寫人留下的「請寫得簡短、正式、完整」三張便條 | `hasConstraint` |
| 5 | `clear-imperative` | **只會點頭的信差** | `clear-positive` | 找碴（spot-the-flaw） 🟡 | 起：信差只回「這是個好主意」／承：從四句話裡挑出沒有動詞的那幾句／轉：有一句看似有動詞其實是在徵詢／合：改寫成一句「請把…交給我」 | 信差帶回來的三段回覆，全是建議、沒有成品 | `assignsTask` |
| 6 | `clear-scope` | **只漆了第一節的欄杆** | `clear-specific` | 修理（fix-the-broken） 🟢／🟡 | 起：欄杆只有第一節被漆／承：找出指令裡沒寫的「其餘各節」／轉：把範圍講太大又漆到不該漆的地方／合：一句話把適用與例外都框出來 | 抄寫人的施工單：「把欄杆漆成暖白色。」 | 🆕`statesScope` |
| 7 | `clear-no-pressure` | **喊破喉嚨的擴音石** | `clear-positive` | 找碴（spot-the-flaw） 🟡 | 起：擴音石把同一句話喊了三遍／承：點掉沒有資訊量的那幾句／轉：有一句看起來像情緒、其實帶了真的限制，不能刪／合：留下只有資訊的版本 | 一段全大寫、加了「求你了、很急」的委託 | 🆕`avoidsPressureLanguage` |
| 8 | `word-choice` | **一字之差的岔路** | `clear-specific` | 取捨（trade-off） 🟢–🟡 | 起：同一句話兩種讀法，走出兩條岔路／承：替歧義詞挑一個替代詞／轉：另一關的模型對同一個字反應相反／合：挑出在這個情境裡唯一講得通的字 | 石碑上刻著「請調整這段文字的語言」 | 🆕`disambiguatesTerms` |
| 9 | `context-why` | **不解釋的工頭** | `clear-specific` | 分段建構（choice） 🟢 | 起：工頭只說「把它縮短」／承：補上「因為要唸給電話那頭聽」／轉：動機改成「要貼在告示牌上」，正解跟著翻面／合：一句指令＋一句理由 | 工頭的字條：「把這段縮短。」 | `explainsWhy` |
| 10 | `context-supply` | **空手的信使** | `context-why` | 逐步揭露（progressive disclosure） 🔴 | 起：信使問了一個世界外面的問題／承：在附近找到兩張要交給它的資料／轉：其中一張是規則不是背景，要分開放／合：資料與規則分區放好再問 | 散在閱覽台上的兩張紙：一張是名單，一張是館規 | `groundsInContext` |
| 11 | `struct-delimiters` | **郵箱精靈的分揀台（改造）** | `context-supply` | 排序（order） 🟢 | 起：黏成一團的信送錯了／承：替每一段找一個標籤／轉：有一段內文自己就有「---」，分隔符被吃掉／合：改用罕見的字元組合重切一次 | 黏成一團、標點跟內文長得一樣的三封信 | `hasDelimiters`＋🆕`usesRareDelimiter` |
| 12 | `struct-xml` | **舊標籤的倉庫** | `struct-delimiters` | 取捨（trade-off） 🟢–🟡 | 起：倉庫每個箱子都包了三層標籤／承：拆掉一層看還讀不讀得懂／轉：有一箱多文件的貨拆了就亂，標籤要留／合：判斷哪些留、哪些拆 | 抄寫人包了三層 `<note>` 的一張便條 | `hasDelimiters` |
| 13 | `struct-anatomy` | **零件表** | `struct-delimiters` | 逆向拆解（reverse-engineering） 🟡 | 起：一張拆開攤平的舊 prompt／承：替每個零件貼上名字／轉：有兩塊其實是同一個零件的兩種叫法／合：把會變動的那塊換成變數 | 牆上釘著一份被拆成八塊的舊委託 | 🆕`namesComponents` |
| 14 | `pos-rules-first` | **規則牆** | `struct-anatomy` | 排序（order） 🟢 | 起：規則被埋在資料中間，沒被照做／承：把規則搬到最前面／轉：結尾又冒出一句相反的話，結果翻面／合：規則在前、結尾不留相反的話 | 一份規則夾在資料第三段的委託書 | `hasDelimiters`＋🆕`rulesBeforeData` |

### 示範與推理（`reasoning`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `fewshot-basics` | **示範迴廊（保留）** | `clear-specific` | 猜規則（rule induction） 🟡 | 起：只看兩個例子就猜下一個／承：補到三個，規律才浮出來／轉：第四個例子是別的規律，會把人帶歪／合：挑出三個講同一件事的例子 | 迴廊牆上刻著五組輸入輸出，其中兩組不同族 | `hasFewShot` |
| 2 | `fewshot-consistent` | **一致的燈列（保留）** | `fewshot-basics` | 找碴（spot-the-flaw） 🟡 | 起：一列燈高高低低／承：點出哪幾盞的格式跟別人不一樣／轉：全部對齊了卻沒有指令，它學走了錯的規律／合：對齊格式＋補一句任務 | 四組寫法各異的「輸入：／輸出：」 | `hasFewShot`＋`assignsTask` |
| 3 | `fewshot-count` | **秤例之台** | `fewshot-basics` | 取捨（trade-off） 🟢–🟡 | 起：秤上一邊 1 例、一邊 40 例／承：加到 3 例，準度跳一階／轉：加到 12 例，它開始照抄例子的內容／合：挑一個「夠用就好」的數量 | 天秤兩端各壓著一疊範例卡 | 🆕`justifiesExampleCount` |
| 4 | `fewshot-negative` | **壞掉的樣品櫃** | `fewshot-consistent` | 猜規則（rule induction） 🟡 | 起：櫃子裡三個標了叉的樣品／承：替其中一個補上「錯在哪」／轉：把三個樣品的順序調換，輸出跟著變／合：正例在前、反例附理由、順序打散 | 標了叉卻沒說原因的三個樣品 | 🆕`labelsNegativeExample` |
| 5 | `fewshot-when` | **兩位掌燈人** | `fewshot-count` | 取捨（trade-off） 🟢–🟡 | 起：兩位掌燈人給了相反的指示／承：各按一次，看輸出差在哪／轉：換一張模型卡，正解翻面／合：說得出「這一次為什麼不放」 | 兩塊刻著相反守則的石板 | 🆕`justifiesExampleCount` |
| 6 | `fewshot-thinking` | **留著算式的草稿** | `fewshot-basics` `cot-explicit` | 修理（fix-the-broken） 🟢／🟡 | 起：範例只有答案，模型也只給答案／承：在範例裡補一段思路／轉：思路寫太長，它連冗長也學走／合：短而完整的一段示範思路 | 一張只寫了答案、擦掉算式的草稿 | `hasFewShot`＋`hasStepByStep` |
| 7 | `cot-explicit` | **一步一階的橋** | `clear-specific` | 分段建構（choice） 🟢 | 起：一口氣跨過去，掉下來／承：加一句「先列步驟再作答」／轉：同一句話對推理模型反而變差／合：先判斷它是哪一種，再決定加不加 | 一道被沖走中段的石橋與一份算錯的帳 | `hasStepByStep` |
| 8 | `cot-separate-answer` | **思考室（保留）** | `cot-explicit` `struct-delimiters` | 排序（order） 🟢 | 起：推理與答案混在一起，抓不出結論／承：分成兩格／轉：只留答案格，理由沒地方放又開始亂寫／合：兩格都留，答案在最後 | 一段推理與結論黏成一整片的回覆 | `hasDelimiters`＋`hasStepByStep` |
| 9 | `reason-keep-simple` | **靜默的推理者（保留）** | `cot-explicit` | 找碴（spot-the-flaw） 🟡 | 起：長長的鷹架讓它繞遠路／承：一句一句刪掉多餘的鋪陳／轉：刪過頭連成功標準都沒了／合：只剩任務＋怎樣算成功 | 一份寫了七層「請仔細地、徹底地」的委託 | `keepsPromptLean` |
| 10 | `reason-no-transcript` | **不肯開口的沉思者** | `reason-keep-simple` | 分段建構（choice） 🟢 | 起：一直要它「把想的過程原封不動寫出來」，被拒絕／承：改成要它給結論的依據／轉：真的需要過程時，改走官方摘要那條路／合：問得到依據、也拿得到摘要 | 三次被回絕的請求紀錄 | 🆕`asksForRationaleNotTranscript` |
| 11 | `think-control` | **兩段式的鐘** | `cot-explicit` | 分段建構（choice） 🟢 | 起：同一口鐘有兩種敲法／承：敲一次，讓它自己決定想多久／轉：換一個模型，同一句話沒有作用，得改用開關／合：說得出這一台該用哪一種 | 鐘座上刻著兩行不同語法的咒文 | `mentionsParameters` |
| 12 | `think-after-tool` | **取水之後的停頓** | `think-control` | 多輪修正（multi-turn refinement） 🔴 | 起：打第一桶水就直接下結論／承：加一句「拿到結果先評估」／轉：第二桶水的結果推翻第一桶，得改計畫／合：每一輪都回頭看一次 | 井邊兩桶內容互相矛盾的水樣紀錄 | `asksToVerify` |
| 13 | `knob-effort` | **火力熔爐（保留）** | `think-control` | 模擬—觀察—調整（simulation） 🔴 | 起：轉到最大，慢又囉嗦／承：往下轉一格，輸出跟著變／轉：轉到最小時舊 prompt 直接失手，要補指示／合：替這件事挑一格，並說得出理由 | 爐邊掛著四塊標了不同刻度名的牌子 | `mentionsParameters` |
| 14 | `overthinking-remove` | **磨過頭的刀** | `reason-keep-simple` | 修理（fix-the-broken） 🟢／🟡 | 起：一句「請盡量完整徹底」換來一份長到沒人看的東西／承：刪掉鷹架句／轉：刪掉之後有一項真的漏了，要用成功標準補回來／合：鷹架換成一條驗收條件 | 磨到只剩一半的刀與一份 4000 字的回覆 | `keepsPromptLean` |
| 15 | `self-consistency` | **三口井** | `cot-explicit` | 派送／分流（workshop） 🟢 | 起：一口井給了一個答案／承：另外兩口井給了不同答案／轉：三個答案兩兩不同，得訂一個裁決規則／合：寫成「跑三次、取多數、平手就說不確定」 | 三口水位不同的井與一本只記了一次的帳 | 🆕`asksMultipleSamples` |

### 脈絡與長文（`grounding`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `long-query-last` | **長卷之塔（保留 · order）** | `struct-delimiters` | 排序（order） 🟢 | 起：問題壓在兩千字前面，被忽略／承：把問題搬到最後／轉：卷更長時，開頭那份指令也要補回來／合：資料在中間、指令包住兩頭 | 一卷問題寫在最前面的長帳 | `putsQuestionLast` |
| 2 | `long-doc-structure` | **三疊無名的卷** | `long-query-last` | 分段建構（choice） 🟢 | 起：三疊卷沒有名字，引用不到／承：替每一份補上來源標籤／轉：改用 JSON 包起來，反而找不到了／合：換成標籤或直線分隔的排法 | 三疊沒有封面的抄本 | `hasDelimiters`＋🆕`labelsSources` |
| 3 | `long-all-upfront` | **滿載的閱覽台** | `long-doc-structure` | 約束滿足（constraint satisfaction） 🟡 | 起：只放了摘要，答案剛好在被省掉的那段／承：整份放進去，答對了／轉：一次問七個問題，開始漏／合：整份放進去，但問題拆成兩輪 | 一份被摘要掉三分之二的卷宗 | `groundsInContext` |
| 4 | `long-outline-anchor` | **無眠的抄寫員** | `long-doc-structure` | 多輪修正（multi-turn refinement） 🔴 | 起：直接問，答案抓錯章節／承：先要一份大綱／轉：大綱對了但主張仍然沒有錨點／合：大綱＋逐句錨回節次 | 一本沒有目錄的厚抄本 | `decomposesTask`＋🆕`anchorsToSection` |
| 5 | `ground-strict` | **封了口的閱覽室** | `context-supply` | 修理（fix-the-broken） 🟢／🟡 | 起：它用了卷宗裡沒有的事／承：補上「只根據以下內容」／轉：資料裡真的沒有答案，它又硬掰／合：嚴格限定＋一條退路 | 一份答案裡混進了外面傳聞的回覆 | `groundsInContext` |
| 6 | `ground-out` | **不知之井（保留）** | `ground-strict` | 分段建構（choice） 🟢 | 起：井對每個問題都答得出來，包括不存在的／承：補上「查不到就說查不到」／轉：模糊的問題不該回答也不該拒答，要反問／合：三種情況各有一句話 | 井壁上刻著三個答案，其中一個是編的 | `givesOutForUncertainty` |
| 7 | `ground-quote-first` | **引文閱覽台（保留）** | `ground-strict` | 修理（fix-the-broken） 🟢／🟡 | 起：答案聽起來很像卷裡寫的，其實不是／承：要求先列引文／轉：引文貼對了，結論卻超出引文／合：引文＋只根據引文的結論 | 一段引號用得很漂亮但原文查不到的回覆 | `asksToCiteSources` |
| 8 | `cite-format` | **標記之泉** | `ground-quote-first` | 找碴（spot-the-flaw） 🟡 | 起：所有出處集中堆在文末，對不回去／承：把出處挪到各自的句尾／轉：有一句沒有出處也被放過了／合：規定格式＋規定「沒出處就不要寫」 | 一段把八個出處全堆在最後一行的報告 | 🆕`citesInline` |
| 9 | `ground-read-first` | **查證之泉（保留）** | `ground-quote-first` | 約束滿足（constraint satisfaction） 🟡 | 起：它說「已確認」，但沒有任何依據／承：加上「每個結論要指出依據」／轉：兩個來源說法不同，得說出採信哪一個／合：先讀、附依據、衝突要講 | 三份互相矛盾的里程紀錄 | `asksToVerify`＋`groundsInContext` |
| 10 | `retrieval-budget` | **不肯收工的探勘隊** | `ground-read-first` | 派送／分流（workshop） 🟢 | 起：探勘隊查了三十次還在查／承：訂出「什麼情況才准再查」／轉：訂太緊，重要的一次補查被擋掉／合：條件＋上限＋停止條件 | 一本記了三十次重複查詢的探勘日誌 | 🆕`setsRetrievalBudget` |
| 11 | `halluc-causes` | **三面破鏡** | `ground-out` | 找碴（spot-the-flaw） 🟡 | 起：三段錯誤的回覆長得很像／承：替每一段標出它的病因／轉：有一段是格式逼出來的，補資料沒有用／合：對症下三種不同的藥 | 三段各自出錯的回覆與它們的原始 prompt | 🆕`diagnosesFailureCause` |
| 12 | `extract-spec` | **萃取台** | `ground-strict` | 派送／分流（workshop） 🟢 | 起：抽出來的表格有三格是編的／承：補上「沒有就填 null」／轉：模板本身沒說清楚，它把兩個欄位混在一起／合：四要素齊全的一份萃取規格 | 一張三格被填滿卻沒有依據的表 | 🆕`allowsNullField` |

### 流程與代理（`orchestration`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `chain-serial` | **拆解工作台（保留）** | `clear-specific` | 排序（order） 🟢 | 起：一次交代四件事，只做到第一件／承：拆成四張工單／轉：第三張要吃第二張的產物，順序不能換／合：一條說得出先後的鏈 | 桌上一張寫了四件事的大工單 | `decomposesTask` |
| 2 | `outcome-first` | **終點的樁** | `chain-serial` | 約束滿足（constraint satisfaction） 🟡 | 起：規定了十二個步驟，它照做卻做錯東西／承：改成描述成品／轉：只講成品它做不完就收工，要補停止條件／合：成品＋成功標準＋停止條件 | 一份寫滿步驟卻沒寫成品的施工單 | 🆕`statesSuccessCriteria` |
| 3 | `agent-three-reminders` | **三句箴言的柱** | `outcome-first` | 分段建構（choice） 🟢 | 起：它做到一半就把球丟回來／承：補上「做完再回報」／轉：補了之後它連該問的也不問了／合：三條同時在場才平衡 | 柱身上被磨掉一條的三句箴言 | `setsPersistence` |
| 4 | `agent-eagerness` | **兩端的秤** | `agent-three-reminders` | 取捨（trade-off） 🟢–🟡 | 起：同一段話在兩個任務上一個太衝一個太慢／承：往其中一端調／轉：調過頭變成另一種病／合：說得出這個任務要站在哪一格 | 一支兩端都可以掛砝碼的秤 | 🆕`tunesAutonomyLevel` |
| 5 | `agent-approval-bounds` | **不可逆之門（保留）** | `agent-three-reminders` | 派送／分流（workshop） 🟢 | 起：它把不可逆的那件事做掉了／承：把動作分成兩堆／轉：有一件可逆但代價很高，要另立一條／合：三層授權寫成規矩 | 門上掛著八把鑰匙，其中兩把沒有備份 | `requiresConfirmation` |
| 6 | `agent-scope-drift` | **越蓋越大的工地** | `outcome-first` | 找碴（spot-the-flaw） 🟡 | 起：請它修一扇窗，回來多了一整面牆／承：點出超出範圍的部分／轉：有一項超出範圍卻是必要的，要用「先問」處理／合：範圍界線＋越界要先問 | 一份「順便」做了六件事的完工報告 | 🆕`limitsScope` |
| 7 | `agent-plan-first` | **審圖房** | `agent-approval-bounds` | 排序（order） 🟢 | 起：沒有圖就開工，拆錯牆／承：要求先出計畫／轉：計畫太細變成綁手綁腳／合：粗綱＋審核點 | 一張畫到一半就開工的施工圖 | 🆕`asksForPlanFirst` |
| 8 | `agent-longhorizon` | **走不完的長廊** | `agent-plan-first` | 多輪修正（multi-turn refinement） 🔴 | 起：走到一半它以為結束了／承：加上「還沒完成就繼續」／轉：它開始每一步都回報，吵到不能用／合：階段變化才回報＋不准提早收工 | 一份每三行報一次進度的日誌 | `setsPersistence` |
| 9 | `agent-state` | **交班的石桌** | `agent-longhorizon` | 派送／分流（workshop） 🟢 | 起：換一個人接手，全部重來／承：訂出交接檔要記哪四件事／轉：記太多，接手的人讀不完／合：一份夠用的交接格式 | 石桌上兩份彼此對不上的交班紀錄 | 🆕`definesHandoffState` |
| 10 | `agent-subagents` | **派工的窗口** | `agent-state` | 派送／分流（workshop） 🟢 | 起：全部自己做，做到天亮／承：把兩件事外派／轉：外派的人交回來的東西對不上，因為沒給驗收標準／合：派什麼、給什麼、怎麼收 | 窗口前排著五張性質不同的工單 | 🆕`delegatesWithCriteria` |
| 11 | `standing-instructions` | **釘在門上的規矩** | `agent-three-reminders` | 修理（fix-the-broken） 🟢／🟡 | 起：同一句叮嚀在六份委託裡各寫一次／承：抽出來釘在門上／轉：釘上去的那張越寫越長，沒人讀／合：短到看得完的一張 | 六份開頭一模一樣的委託 | 🆕`extractsStandingRules` |
| 12 | `action-budget` | **沙漏工房** | `agent-approval-bounds` | 模擬—觀察—調整（simulation） 🔴 | 起：沙漏漏完它還在查／承：給一個次數上限／轉：上限給在錯的單位上（回合 vs 呼叫），沒有生效／合：兩個單位分開設 | 一個刻度被磨掉的沙漏 | 🆕`setsActionBudget` |

### 角色與參數（`config`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `role-basics` | **面具工坊（保留）** | `clear-specific` | 修理（fix-the-broken） 🟢／🟡 | 起：沒有面具的回覆四不像／承：戴上一張面具，語域立刻對了／轉：面具寫死成「只准講三句」，任務做不完／合：角色到位、限制留活口 | 架上一排寫了各種身分的面具 | `hasRole` |
| 2 | `system-uses` | **刻在門楣上的話** | `role-basics` | 派送／分流（workshop） 🟢 | 起：規則寫在每一次的問句裡，忘了就沒了／承：把五類話各自歸位／轉：有一句其實該留在當次問句裡／合：常駐的上門楣、當次的留在問句 | 門楣與便條上各寫了一半的規矩 | `hasRole` |
| 3 | `hierarchy` | **優先序階梯（保留 · order）** | `system-uses` | 排序（order） 🟢 | 起：兩條規矩打架，照了不該照的那條／承：把它們排進階梯／轉：使用者臨時要求覆寫了其中一條，但覆寫不了另一條／合：排出一條有階序的規則表 | 三張互相牴觸的規矩石版 | 🆕`ranksInstructions` |
| 4 | `no-system-field` | **只有一格的窗口** | `system-uses` | 修理（fix-the-broken） 🟢／🟡 | 起：只有一個輸入框，規矩沒地方放／承：把規矩接在問題前面／轉：規矩跟問題黏在一起被當成內容／合：規矩＋分隔符＋問題 | 一個只有一條細縫的受理窗口 | `hasDelimiters`＋`hasRole` |
| 5 | `skeleton-ptcf` | **四要素之鏡（保留）** | `role-basics` | 分段建構（choice） 🟢 | 起：鏡子只照出兩格／承：一格一格補上／轉：有一格填了但填的是別格的東西／合：四格各歸其位 | 一面只亮了兩格的四格鏡 | `hasRole`＋`specifiesFormat` |
| 6 | `skeleton-six-elements` | **六面燈籠** | `skeleton-ptcf` | 約束滿足（constraint satisfaction） 🟡 | 起：四格填滿了，語氣還是不對／承：補上受眾／轉：受眾與語氣互相牴觸，要選一個／合：六面都點亮 | 一盞只點亮四面的六面燈籠 | `hasAudience` |
| 7 | `skeleton-dev-message` | **抄寫人的長桌** | `skeleton-ptcf` `hierarchy` | 排序（order） 🟢 | 起：段落順序被打亂，範例被當成資料／承：排回四段／轉：任務會跑太久，要補一段收工規則／合：一份帶停止條件的骨架 | 八張被打散的段落石版 | `hasRole`＋🆕`hasStopRule` |
| 8 | `skeleton-consistency` | **兩種文法的殿** | `skeleton-dev-message` | 取捨（trade-off） 🟢–🟡 | 起：一份 prompt 裡三種分段語法／承：挑一種改寫／轉：另一種語法在這個素材上其實更省／合：說得出為什麼挑這一種 | 一份同時用了標籤、井號與括號的委託 | 🆕`usesOneSkeleton` |
| 9 | `knob-temperature` | **刻度儀之室（保留 · sim）** | `param-not-plead` | 模擬—觀察—調整（simulation） 🔴 | 起：同一句話跑三次，三種答案／承：把刻度往下轉／轉：轉到 0 之後這台機器直接回絕／合：依模型與任務挑一格 | 一台刻度盤上有兩段被封住的儀器 | `mentionsParameters` |
| 10 | `knob-limits` | **截流閘** | `knob-temperature` | 約束滿足（constraint satisfaction） 🟡 | 起：話被硬生生截斷／承：把上限調開／轉：上限開大了，思考卻把額度吃光／合：上限＋停止記號＋預留 | 一段在句子中間斷掉的抄本 | `mentionsParameters` |
| 11 | `param-not-plead` | **許願池與旋鈕** | `clear-constraint` | 取捨（trade-off） 🟢–🟡 | 起：對著池子許了三次願，沒有一次成真／承：改去轉旋鈕／轉：有一件事真的沒有旋鈕，只能寫進 prompt／合：分得出哪一種該用哪一邊 | 池邊十張願望紙與一排旋鈕 | `mentionsParameters` |
| 12 | `model-pick` | **抉擇之秤（保留）** | `knob-effort` | 取捨（trade-off） 🟢–🟡 | 起：同一份委託在兩台上結果差很多／承：換一台再跑／轉：貴的那台在這件事上反而更差／合：說得出這件事該找誰 | 兩張規格互異的模型卡 | 🆕`namesModelClass` |

### 量器坊（`forms`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `fmt-specify` | **量器坊的門房** | `clear-specific` | 分段建構（choice） 🟢 | 起：拿回來一大段散文／承：指定成三欄表格／轉：素材其實不適合表格，換成條列／合：格式與素材對得上 | 一段該是清單卻寫成散文的回覆 | `specifiesFormat` |
| 2 | `fmt-markdown-diet` | **長出圓點的牆** | `fmt-specify` | 修理（fix-the-broken） 🟢／🟡 | 起：整面牆都是圓點／承：寫一段格式偏好壓下去／轉：聊到第三十輪又長回來／合：偏好＋週期性重申 | 一份三層巢狀圓點的回覆 | 🆕`statesFormatPreference` |
| 3 | `prefill-completion` | **擬態之鏡（保留）** | `fmt-specify` | 修理（fix-the-broken） 🟢／🟡 | 起：它每次都先客套三句／承：先替它寫好第一行／轉：換一台模型，這招被擋下來／合：改用等價的替代路徑 | 一面只映出半句話的鏡子 | `hasFewShot` |
| 4 | `answer-anchor` | **抓不住的答案** | `fmt-specify` | 約束滿足（constraint satisfaction） 🟡 | 起：答案埋在第七段中間／承：規定放進固定的框／轉：遇到不屬於任何一類的東西，框裡沒東西可放／合：固定位置＋兜底類別 | 六段找不到結論的回覆 | 🆕`hasFallbackCategory` |
| 5 | `no-counting` | **數不清的珠算** | `clear-constraint` | 找碴（spot-the-flaw） 🟡 | 起：它報的字數每次都不一樣／承：把真正的字數當資料餵進去／轉：改成「不超過 n 字」它又亂估／合：數字由外面給，它只負責寫 | 三份自報字數互相矛盾的稿 | 🆕`avoidsSelfCounting` |
| 6 | `len-concrete` | **兩把尺** | `clear-constraint` | 約束滿足（constraint satisfaction） 🟡 | 起：說了「簡短」拿回八百字／承：換成「三句話以內」／轉：把思考旋鈕調小，長度沒變／合：長度歸長度、思考歸思考 | 桌上一把沒有刻度、一把有刻度的尺 | `hasConstraint` |
| 7 | `len-preserve` | **被砍掉重點的摘要** | `len-concrete` | 修理（fix-the-broken） 🟢／🟡 | 起：摘要把唯一的關鍵數字砍了／承：補上「數字與結論必須保留」／轉：保留清單列太長，等於沒縮／合：短＋一張很短的必留清單 | 一份把結論砍掉的三行摘要 | 🆕`saysWhatToPreserve` |
| 8 | `len-readable` | **給沒看過的人** | `len-preserve` | 多輪修正（multi-turn refinement） 🔴 | 起：結論寫得像內部筆記／承：加一句「寫給沒參與過的人看」／轉：改寫之後太長，得在好讀與短之間取捨／合：好讀優先、長度用必留清單控 | 一段滿是內部代號的結案報告 | `hasAudience` |
| 9 | `tone-concrete` | **形容詞的空箱** | `len-readable` | 修理（fix-the-broken） 🟢／🟡 | 起：「請溫暖一點」換來一堆表情符號／承：換成三條看得見的寫作規則／轉：規則裡的樣板句被逐字重複／合：規則＋要求變化 | 三個貼著形容詞卻空著的箱子 | 🆕`definesToneConcretely` |
| 10 | `no-preamble` | **清嗓子的傳令** | `tone-concrete` | 找碴（spot-the-flaw） 🟡 | 起：每一句話前面都有兩句清嗓子／承：點掉沒有內容的開場／轉：有一句開場其實在講前提，不能刪／合：一張禁用片語清單 | 一段有三句開場白的公告 | 🆕`bansFillerPhrases` |
| 11 | `so-basics` | **鑄模房** | `fmt-specify` | 派送／分流（workshop） 🟢 | 起：同一個任務回來三種形狀／承：替它做一個模／轉：模上少了一格，資料溢出來／合：模與資料對得上 | 三個形狀不一的鑄件 | 🆕`definesSchema` |
| 12 | `so-vs-jsonmode` | **兩種印章** | `so-basics` | 取捨（trade-off） 🟢–🟡 | 起：兩顆印章蓋出來的東西看起來一樣／承：拿一份難的資料去試／轉：其中一顆只保證「是 JSON」，欄位全跑掉／合：挑對印章，並補上該補的一句 | 兩顆刻著不同保證的印章 | 🆕`definesSchema` |
| 13 | `so-division` | **重複刻的模** | `so-basics` | 找碴（spot-the-flaw） 🟡 | 起：模上與紙上寫了同一件事兩次／承：刪掉紙上那份／轉：有一筆資料塞不進模，沒人交代怎麼辦／合：分工清楚＋例外條款 | 一份 schema，外加一段把同樣規則又寫一次的 prompt | 🆕`noDuplicateSchemaRules` |
| 14 | `doc-design-elements` | **沒有圖的簡報** | `fmt-specify` | 修理（fix-the-broken） 🟢／🟡 | 起：要一份簡報，拿回一段文字／承：點名要幾頁、每頁要什麼／轉：元素點太滿變成塞爆的版面／合：元素清單＋留白要求 | 一份只有標題沒有版面的簡報稿 | 🆕`namesDesignElements` |

### 契約鍛冶場（`toolcraft`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `tool-native-field` | **契約鍛冶場的門** | `struct-anatomy` | 派送／分流（workshop） 🟢 | 起：工具說明被寫進正文，模型當成資料唸出來／承：把它搬進工具欄／轉：有一條使用準則沒地方放，要放進工具說明本身／合：宣告與正文各歸其位 | 一份把 schema 貼在正文裡的委託 | `definesTools` |
| 2 | `tool-description` | **工具鍛造間（保留）** | `tool-native-field` | 修理（fix-the-broken） 🟢／🟡 | 起：說明只有一行，工具被亂用／承：補上用途、時機、參數意義／轉：全篇 MUST 讓它每次都硬叫工具／合：規則在前、語氣放平、附一個例子 | 一把只刻了名字的工具 | `definesTools` |
| 3 | `tool-naming` | **兩把同名的鑰匙** | `tool-description` | 找碴（spot-the-flaw） 🟡 | 起：兩把工具的說明幾乎一樣／承：改名並劃清界線／轉：有一個參數是自由字串，什麼都塞得進來／合：命名分家＋參數改成列舉 | 工具架上兩把名字相似的鑰匙 | 🆕`toolNamesDistinct` |
| 4 | `tool-fewer` | **擺滿的工作檯** | `tool-description` | 派送／分流（workshop） 🟢 | 起：檯面上二十把工具，它挑錯／承：收掉用不到的／轉：收太多之後有一件事沒工具做，得靠分層取用／合：桌面精簡＋深層工具收進抽屜 | 擺了二十把工具的檯面 | 🆕`limitsToolSurface` |
| 5 | `tool-when-not` | **神諭工坊（保留 · workshop）** | `tool-fewer` | 派送／分流（workshop） 🟢 | 起：查天氣也去翻檔案庫／承：替每把工具寫下使用時機／轉：有一種情況兩把都適用，要訂優先／合：時機＋例外＋優先序 | 四把用途相鄰的工具與一疊委託 | 🆕`statesToolTriggers` |
| 6 | `tool-trigger-push` | **不肯開口問的匠人** | `tool-when-not` | 取捨（trade-off） 🟢–🟡 | 起：明明有工具，它自己猜／承：加一句「先查再答」／轉：改成強制呼叫之後，連該直接回答的也去查／合：推一把，但不要焊死 | 一份靠猜寫完的報價單 | 🆕`statesToolTriggers` |
| 7 | `tool-ask-missing` | **空白的委託單** | `tool-when-not` | 修理（fix-the-broken） 🟢／🟡 | 起：地址欄空著，它自己編了一個／承：加上「缺就問」／轉：它改成「我稍後會確認」然後沒有下文／合：缺就問＋不准開空頭支票 | 一張關鍵欄位空白的委託單 | `givesOutForUncertainty` |
| 8 | `tool-order` | **齒輪的咬合** | `tool-when-not` | 排序（order） 🟢 | 起：先鎖螺絲再對位，整組報廢／承：把順序排出來／轉：有三件事其實可以同時做／合：相依的排序、獨立的並行 | 三張有先後、兩張沒有先後的工單 | 🆕`ordersToolCalls` |
| 9 | `tool-prefer-compute` | **心算的帳房** | `tool-ask-missing` | 修理（fix-the-broken） 🟢／🟡 | 起：帳房心算，差了三百／承：改成「一律用工具計算」／轉：沒有現成工具，要它寫一段程式算／合：能算的都不用猜 | 一本心算出來、少了三百的帳 | 🆕`prefersToolOverMentalMath` |
| 10 | `tool-result-signal` | **倒回來的一整車** | `tool-order` | 找碴（spot-the-flaw） 🟡 | 起：一次倒回三千行紀錄，重點被淹沒／承：挑出真正需要的欄位／轉：有一段依據在伺服器端，撈不出來／合：精簡回傳＋要求它把依據寫進回應 | 一車三千行的原始紀錄 | 🆕`limitsToolOutput` |
| 11 | `tool-preamble` | **沒有交代的匠人** | `tool-description` | 修理（fix-the-broken） 🟢／🟡 | 起：它默默做了六件事，沒人知道發生什麼／承：加上動手前後各一句話／轉：要求那句話用 JSON 寫，工具呼叫壞掉／合：說話用人話，結構留給輸出 | 一份完全沒有交代的六步施工紀錄 | 🆕`requiresPreamble` |

### 減法之庭（`frugality`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `lean-prompt` | **空的基座** | `clear-specific` | 修理（fix-the-broken） 🟢／🟡 | 起：一份四百字的委託，重點講了三次／承：刪掉重複的兩次／轉：刪到剩一句反而漏了成功標準／合：短，但四件事都在 | 立在減法之庭中央的空基座與一卷長委託 | `keepsPromptLean` |
| 2 | `lean-output` | **抄了兩遍的抄寫人** | `lean-prompt` | 找碴（spot-the-flaw） 🟡 | 起：它把整份資料重抄一遍才回答／承：點掉不需要輸出的部分／轉：有一段重述其實是引用依據，要留／合：只輸出你真的要的 | 一份把整卷資料重抄一遍才回答的回覆 | `keepsPromptLean` |
| 3 | `cache-static-first` | **疊石的順序** | `struct-anatomy` | 排序（order） 🟢 | 起：每次都把日期寫在最前面／承：把不動的規則搬到前面／轉：只改了開頭一個字，整疊就白疊了／合：靜態在前、變動在後 | 一疊每次都得從頭重疊的石頭 | 🆕`staticBeforeVariable` |
| 4 | `ctx-compaction` | **越堆越高的桌** | `agent-longhorizon` | 多輪修正（multi-turn refinement） 🔴 | 起：桌上堆到看不見手邊的事／承：把舊的壓成一段摘要／轉：摘要漏掉一個關鍵決定，後面全歪／合：壓縮＋必留清單 | 一張堆到看不見桌面的工作桌 | 🆕`asksToCompact` |
| 5 | `ctx-pruning` | **過期的托盤** | `ctx-compaction` | 找碴（spot-the-flaw） 🟡 | 起：托盤裡十份過期的查詢結果／承：挑出還有用的／轉：其中一份雖然舊卻是唯一的依據／合：換成摘要，但依據留原文 | 托盤裡十份過期的查詢結果 | 🆕`asksToCompact` |
| 6 | `ctx-new-chat` | **翻不動的那一頁** | `ctx-compaction` | 分段建構（choice） 🟢 | 起：同一頁講到第五個主題，回答開始敷衍／承：換一頁重問／轉：有一件事需要前面的脈絡，要手動帶過去／合：換頁＋帶走該帶的那三行 | 一頁講了五個主題的長談 | 🆕`carriesForwardEssentials` |
| 7 | `ctx-reuse-reasoning` | **沒有記憶的工匠** | `ctx-compaction` | 分段建構（choice） 🟢 | 起：每一輪都從零開始想／承：把上一輪的推理帶回去／轉：帶回去的東西過期了，反而害它／合：帶新鮮的、丟過期的 | 兩份重複推導同一件事的草稿 | 🆕`carriesForwardEssentials` |

### 校驗場（`refinery`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `meta-when` | **走錯門的委託** | `clear-specific` | 分段建構（choice） 🟢 | 起：同一句話改了十版還是錯／承：把病因分成四類／轉：其中一個真的只要多給一份資料／合：先分類，再決定要不要改字 | 一疊改了十版的委託草稿 | 🆕`diagnosesFailureCause` |
| 2 | `meta-iterate` | **回音工坊（保留）** | `meta-when` | 多輪修正（multi-turn refinement） 🔴 | 起：第一版落空／承：換句話說再跑一次／轉：換了三種說法都一樣，代表收斂了／合：說得出「這裡已經不用再改」 | 工坊牆上釘著同一份任務的五個版本 | `asksToRefine` |
| 3 | `meta-eval` | **校驗場的量尺** | `meta-iterate` | 派送／分流（workshop） 🟢 | 起：憑感覺說新版比較好／承：拿五題有答案的題目跑一次／轉：新版在其中兩題變差，總分才是重點／合：一組題目＋一條判準 | 兩個版本的 prompt，與一句「感覺新版比較好」 | 🆕`definesEvalSet` |
| 4 | `meta-metaprompt` | **照自己的鏡** | `meta-iterate` | 多輪修正（multi-turn refinement） 🔴 | 起：改了三次都沒進步／承：把 prompt 與壞輸出一起交回去／轉：它改出來的版本更長，要限制它只能刪不能加／合：一次帶約束的自我改寫 | 一份失敗的輸出，與產生它的那段 prompt | 🆕`asksModelToRewritePrompt` |
| 5 | `contradiction-fix` | **互相牴觸的兩條規矩** | `pos-rules-first` | 排序（order） 🟢 | 起：兩條規矩同時成立，輸出每次不同／承：找出真正衝突的那一對／轉：其實不是二選一，是有先後／合：改寫成有序的決策樹 | 兩塊同時說「一律」與「除非」的石版 | 🆕`decisionTree` |
| 6 | `prompt-healthcheck` | **診斷台** | `meta-iterate` | 找碴（spot-the-flaw） 🟡 | 起：一份哪裡都不對勁的 prompt／承：照表點出六個病灶／轉：有一項看起來是病其實是必要的行話／合：改完再過一次表 | 一份長滿典型錯誤的委託 | 🆕`diagnosesFailureCause` |
| 7 | `selfcheck-when` | **檢查了七遍的門** | `meta-eval` | 取捨（trade-off） 🟢–🟡 | 起：加了自我檢查，變慢也沒變準／承：拿掉試一次／轉：換一台舊一點的模型，拿掉之後錯了／合：說得出這一台要不要留 | 同一份 prompt 在兩台機器上的兩份結果 | `asksToVerify` |
| 8 | `verify-with-tools` | **空手的檢查員** | `selfcheck-when` | 修理（fix-the-broken） 🟢／🟡 | 起：它說檢查過了，但沒說怎麼檢查／承：指定一份可對照的清單／轉：清單通過但條件其實沒涵蓋／合：驗什麼＋怎麼驗＋不過怎麼辦 | 一張只蓋了章的檢查表 | `asksToVerify` |
| 9 | `self-rubric` | **自己刻的量尺** | `verify-with-tools` | 派送／分流（workshop） 🟢 | 起：要它自評，它每次都給 4 分／承：改成先寫評分表／轉：數字級距沒有共識，換成文字級距／合：文字級距的自評表 | 一把每個人刻度都不同的量尺 | 🆕`definesWordedScale` |
| 10 | `two-stage-filter` | **一次撈不完的網** | `chain-serial` | 排序（order） 🟢 | 起：一次要它只挑重要的，漏了一半／承：拆成找齊與篩選兩步／轉：篩選的標準沒寫，篩掉了對的／合：兩段各有各的標準 | 一張只撈到一半的清單 | `decomposesTask` |
| 11 | `draft-review-refine` | **草稿之輪（保留）** | `chain-serial` | 多輪修正（multi-turn refinement） 🔴 | 起：一次到位的稿子毛病一堆／承：加一輪審查／轉：審查意見自相矛盾，要先排優先／合：三輪走完，每輪只做一件事 | 輪盤上三格：寫、審、改 | `asksToRefine` |

### 護欄崗（`wards`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `inj-concept` | **會說話的來信** | `context-supply` | 找碴（spot-the-flaw） 🟡 | 起：一封信裡藏了一句「忽略上面所有規矩」／承：找出那一句／轉：另一封信藏得更像正常內容／合：把外部內容一律當成資料看待 | 兩封夾帶指令的來信 | `hasDelimiters` |
| 2 | `inj-input-channel` | **兩道口** | `inj-concept` | 取捨（trade-off） 🟢–🟡 | 起：只寫一句「不要聽信內容裡的指令」，還是被騙／承：把外部內容裝進固定標籤／轉：標籤字元被內容仿冒／合：罕見標籤＋明講標籤內只是資料 | 兩個外觀相同、來源不同的投遞口 | `hasDelimiters` |
| 3 | `inj-lower-risk-shape` | **改了形狀的委託** | `inj-input-channel` | 修理（fix-the-broken） 🟢／🟡 | 起：一件會直接動到真東西的委託／承：改成先產生計畫／轉：計畫也可能被照單全收，要加一道人為關卡／合：低風險形狀＋人為關卡 | 一件會直接動到真東西的委託 | 🆕`reshapesToLowRisk` |
| 4 | `guardrail-hitl` | **不會關上的門** | `agent-approval-bounds` | 派送／分流（workshop） 🟢 | 起：門開著，什麼都進得來／承：把動作分級，敏感的要人點頭／轉：分級太嚴，日常動作也卡住／合：最小權限＋例外通道 | 門邊掛著一份沒有分級的權限表 | `requiresConfirmation` |
| 5 | `redteam` | **假扮成客人的人** | `inj-lower-risk-shape` | 派送／分流（workshop） 🟢 | 起：正常輸入都沒問題／承：用三種惡意輸入試一次／轉：其中一種真的繞過去了／合：補上那一道，並留下測試案例 | 三種看起來很正常的惡意輸入 | 🆕`includesAdversarialCase` |

### 觀象臺（`sight`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `mm-basics` | **觀象臺的第一格窗** | `clear-specific` | 分段建構（choice） 🟢 | 起：只丟一張圖問「這是什麼」／承：補上要看的區域與要的輸出／轉：換成影片，位置說不清楚了／合：用時間戳指到那一秒 | 一張沒有指定看哪裡的照片 | 🆕`pointsAtRegion` |
| 2 | `mm-troubleshoot` | **看不清的那一角** | `mm-basics` | 修理（fix-the-broken） 🟢／🟡 | 起：它把角落那行字讀錯／承：要它先描述再判斷／轉：字太小，語言解決不了，要放大／合：拆步驟＋放大＋提高輸入品質 | 一張關鍵字樣糊掉的照片 | 🆕`pointsAtRegion` |
| 3 | `img-generate` | **無主體的畫** | `clear-positive` | 修理（fix-the-broken） 🟢／🟡 | 起：一句「畫一張好看的圖」什麼都不是／承：依序補上六個欄位／轉：寫了「不要有人」反而畫出人／合：全部改成正面描述 | 一張什麼都有一點的模糊草圖 | `positiveFraming` |
| 4 | `img-edit` | **改壞的那張** | `img-generate` | 多輪修正（multi-turn refinement） 🔴 | 起：一次交代五個修改，整張走樣／承：拆成一次一個／轉：第三步把第一步改掉了，要指定「保留前一步」／合：一步一改＋每步指定保留 | 同一張圖被改了五次的紀錄 | 🆕`preservesPriorState` |
| 5 | `video-prompt` | **分鏡牆** | `img-generate` | 排序（order） 🟢 | 起：只寫了主體，鏡頭亂飄／承：補上鏡頭運動與氣氛／轉：要素順序換了，重點跟著換／合：六個要素排成一句 | 一段只寫了主體的分鏡稿 | 🆕`namesShotElements` |
| 6 | `tts-writing` | **唸太快的傳聲石** | `tone-concrete` | 修理（fix-the-broken） 🟢／🟡 | 起：一整句沒有標點，唸成一團／承：加上停頓／轉：加太多標點變成結巴／合：標點對得上呼吸 | 一段沒有任何標點的長句 | 🆕`usesProsodyPunctuation` |
| 7 | `design-anti-slop` | **千篇一律的門面** | `tone-concrete` | 取捨（trade-off） 🟢–🟡 | 起：三份設計長得一模一樣／承：點名要避開的預設／轉：只說「不要那樣」還是回到原點，要給替代方案／合：具體替代＋先提選項再做 | 三張幾乎相同的版面草稿 | `positiveFraming` |
| 8 | `fe-spec` | **改了一顆鈕，塌了一面牆** | `design-anti-slop` | 修理（fix-the-broken） 🟢／🟡 | 起：改一顆按鈕，整套樣式被重寫／承：加上「保留既有設計系統」／轉：新元件沒有先例，要指名規範／合：指名＋保留＋只動這一塊 | 一份把整套樣式重寫的改動 | 🆕`namesStackAndScope` |

### 分歧之廳（`divergence`）

| # | 技巧 | 神廟名 | 教學前提 | 互動型式 | 起承轉合 | 素材／情境 | rubric |
|---|---|---|---|---|---|---|---|
| 1 | `contrast-persona` | **兩面的柱 · 身分** | `role-basics` | 取捨（trade-off） 🟢–🟡 | 起：同一段角色設定，兩張模型卡結果相反／承：讀兩邊的原典／轉：正解隨模型卡翻面／合：說得出「這一台屬於哪一邊」 | 柱子兩面刻著相反的官方句子 | `hasRole` |
| 2 | `contrast-carry-thinking` | **兩面的柱 · 記憶** | `ctx-reuse-reasoning` | 取捨（trade-off） 🟢–🟡 | 起：帶回去之後變好了／承：換一台，帶回去變差／轉：第三家說要帶但只帶簽章／合：依模型決定帶什麼 | 三張對同一件事說法不同的官方卡 | 🆕`carriesForwardEssentials` |
| 3 | `contrast-same-name` | **同名的兩個旋鈕** | `knob-effort` | 模擬—觀察—調整（simulation） 🔴 | 起：照著別人的設定轉，結果完全不同／承：讀兩邊的定義／轉：其中一邊控制的根本不是思考長度／合：先確認這個名字在這裡是什麼意思 | 兩台機器上名字一模一樣的旋鈕 | `mentionsParameters` |
| 4 | `migrate-params-deprecated` | **封起來的刻度** | `knob-temperature` | 找碴（spot-the-flaw） 🟡 | 起：照舊設定送出去，直接被回絕／承：找出哪幾格已經封了／轉：封起來之後要決定性，得改寫系統訊息／合：封住的用文字達成 | 一排被封條貼住的刻度 | `mentionsParameters` |
| 5 | `migrate-cot-to-knob` | **換了介面的階梯** | `cot-explicit` `knob-effort` | 修理（fix-the-broken） 🟢／🟡 | 起：舊 prompt 的逐步鷹架在新模型上變差／承：刪掉鷹架、改調旋鈕／轉：旋鈕開到最大也補不回其中一項，要用成功標準／合：鷹架換旋鈕＋補一條驗收 | 一份在新機器上反而變差的舊 prompt | `mentionsParameters` |
| 6 | `migrate-recheck-concise` | **舊叮嚀** | `len-concrete` | 修理（fix-the-broken） 🟢／🟡 | 起：舊 prompt 的「請簡潔」讓新模型答得太少／承：拿掉那一句／轉：拿掉之後另一台又太長／合：改成具體長度而不是形容詞 | 一句從舊 prompt 抄過來的「請簡潔」 | `hasConstraint` |
| 7 | `migrate-strip-patches` | **貼滿補丁的舊袍** | `migrate-recheck-concise` | 找碴（spot-the-flaw） 🟡 | 起：一件貼了十塊補丁的舊 prompt／承：一塊一塊撕掉試／轉：有一塊撕掉真的漏水，那不是補丁是需求／合：留需求、丟補丁 | 一件貼滿補丁的舊袍 | `keepsPromptLean` |
| 8 | `migrate-checklist` | **搬家的清單** | `meta-eval` | 排序（order） 🟢 | 起：換模型時整份重寫，壞得更徹底／承：改成先換、後測、再改／轉：其中一步順序錯了會白做／合：一張排好序的遷移清單 | 一份整包重寫之後更糟的 prompt | `decomposesTask` |
| 9 | `era-current-rules` | **會改字的碑** | `migrate-checklist` | 逆向拆解（reverse-engineering） 🟡 | 起：碑上的字跟手上的抄本不一樣／承：比對兩份，找出改掉的三條／轉：有一條不是改掉，是反過來了／合：養成回頭讀原典的習慣 | 一份三年前抄下的守則，與碑上現在的字 | `asksToCiteSources` |

### 型式直方圖（130 座教學神廟）

| 型式 | 座數 | 占比 | 引擎成本 | 為什麼分到這麼多 |
|---|---:|---:|---|---|
| 修理（fix-the-broken） | 28 | 21.5% | 🟢／🟡 | 對應 P3 的 worked example → completion problem；每區前段的主力 |
| 找碴（spot-the-flaw） | 18 | 13.8% | 🟡 | 教「什麼該拿掉」最有效的形狀，直接吃掉減法／找碴一整類主題 |
| 取捨（trade-off） | 15 | 11.5% | 🟢–🟡 | 所有「兩邊都有官方出處」的題目都要這個形狀，否則會教成假通則（P10） |
| 派送／分流（workshop） | 15 | 11.5% | 🟢 | 宣告型主題（工具、狀態、權限、評分表）的天然形狀，既有 `workshop` kind 可直接用 |
| 分段建構（choice） | 14 | 10.8% | 🟢 | 既有預設載體，最不需要學習成本；留給「這一段該寫什麼」最直白的題目 |
| 排序（order） | 14 | 10.8% | 🟢 | 結構型技巧（順序、階層、鏈）的天然形狀，既有 `order` kind 可直接用 |
| 多輪修正（multi-turn refinement） | 9 | 6.9% | 🔴 | 目前完全沒有體感的一類（迭代、鏈、改圖），非它不可 |
| 約束滿足（constraint satisfaction） | 8 | 6.2% | 🟡 | 把現行的即時預檢從輔助升格成舞台，幾乎零新程式碼 |
| 模擬—觀察—調整（simulation） | 4 | 3.1% | 🔴 | 旋鈕型技巧唯一有體感的形狀；需要離線輸出樣本（護欄 3 不受影響） |
| 逆向拆解（reverse-engineering） | 2 | 1.5% | 🟡 | 複習與期末考的形狀，把圖鑑收集轉成一次主動回憶 |
| 猜規則（rule induction） | 2 | 1.5% | 🟡 | few-shot 的完美同構——玩家親身體會「範例本身就在傳規則」（#14 The Witness） |
| 逐步揭露（progressive disclosure） | 1 | 0.8% | 🔴 | 把「找資料」真的變成走路，成本最高所以只用在最值得的一關 |

> **14 種型式裡有兩種沒有出現在教學神廟裡**，這是刻意的：**8 前後對照**在參考文件裡就被評為「適合當第二幕素材而不是第三幕題型」，所以它以**素材**身分出現在多座神廟（弱→強並排）；
> **4 自由書寫**是鷹架撤除的終點，全部留給 12 座應用關與大師層勳章（P3、C5）。

**跟現況的對照**：現行 27 關是 `choice` 24 ／ `order` 2 ／ `workshop` 1（單一型式占 89%）。
本設計最大的單一型式是 `fix`，占 21.5% —— 這是 P12（變奏而非重複）的量化目標。

**新互動型式（本設計要求引擎新增的 `flows.json` `kind`）**：

| 新 kind | 世界裡叫什麼 | 玩家在做什麼 | 成本 | 對應型式 |
|---|---|---|---|---|
| `spot` | **點碑** | 素材上的句子變成可點的石籤，把有問題的那幾句點出來 | 🟡 | 6 找碴 |
| `induct` | **推規** | 看三組「輸入→輸出」，先答出規則，再套用到第四個 | 🟡（`choice` 變體） | 5 猜規則 |
| `constraint` | **合尺** | 所有限制攤在畫面上，要找到同時滿足全部的寫法 | 🟡（即時預檢升格為舞台） | 9 約束滿足 |
| `tradeoff` | **雙面碑** | 同一段有兩個都對的選項，這一關的素材只有一個更合適 | 🟡（`choice` 加權重＋雙回饋） | 10 取捨 |
| `sim` | **轉鈕** | 轉一個旋鈕，神諭的輸出跟著變（離線預寫樣本，不呼叫 API） | 🔴 需要離線輸出樣本資料層 | 11 模擬—觀察—調整 |
| `multi` | **兩輪刻印** | 刻完第一段 → 神諭回一段預寫的不夠好的輸出 → 刻第二段去修它 | 🔴 第三幕要能跑兩輪 | 14 多輪修正 |
| `reverse` | **拆碑** | 給一段好 prompt，標出每一段用了哪一條技巧 | 🟡（退化成 `choice`） | 12 逆向拆解 |
| `disclose` | **拾遺** | 要先在世界裡撿到 2–3 塊素材才刻得完 | 🔴 需要「素材背包」存檔欄位＋世界端拾取點 | 13 逐步揭露 |
| `fix` | **改碑** | 預填一段弱寫法，改到過關（現行 `starter` 的升級版：可以點掉壞掉的字） | 🟡（現行已有雛形） | 7 修理 |

`choice` / `order` / `workshop` / 自由書寫**完全沿用**，不動任何既有關卡（護欄 7）。

---

<a id="四既有-27-關的遷移"></a>

## 四、既有 27 關的遷移

原則：**不刪任何一座石座、不動任何一個 NPC、不丟任何一份素材**。「改造」＝把 rubric 從 4–7 條收斂成 1 條主檢查（＋至多 1 條地基），
多出來的主題**搬去它自己的那一座神廟**（那正是 §3 新增神廟的來源之一）。

| 既有關卡 id | 名字 | 處置 | 對應新技能 | 怎麼改 |
|---|---|---|---|---|
| `gate-of-clarity-01` | 清晰之門 | **改造** | `clear-specific` | 拆掉 hasAudience／assignsTask 兩條，只留「具體到可以驗收」；素材與 NPC 全部保留 |
| `postbox-sprite-02` | 郵箱精靈的分揀台 | **改造** | `struct-delimiters` | 主題改成分隔符本身；第三幕由 choice 換成 order（把三封信排進三個標籤） |
| `lost-automaton-03` | 迷路的自動機 | **保留** | `clear-positive` | Phase 9 已驗證「只靠教練提示一次過關」，只降權 assignsTask |
| `mimic-mirror-04` | 擬態之鏡 | **改造** | `prefill-completion` | 從「用範例展示格式」收斂成「寫出開頭讓它接下去」；few-shot 讓給示範迴廊 |
| `long-scroll-archive-05` | 長卷檔案室 | **改造** | `pos-rules-first` | 主題改成「規則放最前面／結尾的話會贏」，長文定位交給長卷之塔 |
| `council-envoy-06` | 議會信使（試煉） | **轉為應用關** | — | 本來就是 7 條 rubric 的綜合題 → 正式升格為 foundations 的應用關（不教新技巧，P11） |
| `example-hall-11` | 示範迴廊 | **改造** | `fewshot-basics` | 第三幕改成 induct（猜規則）：先推出規律再挑第四個例子 |
| `lantern-rows-12` | 一致的燈列 | **改造** | `fewshot-consistent` | 主題收斂成「格式一致＋範例要配指令」；hasConstraint 移除 |
| `silent-thinker-13` | 靜默的推理者 | **改造** | `reason-keep-simple` | 移除 specifiesFormat（Phase 26 已建議），第三幕改成 spot（點掉多餘鷹架） |
| `thinking-chamber-14` | 思考室 | **改造** | `cot-separate-answer` | 從三條技巧收斂成一條；hasFewShot 讓給 fewshot-thinking |
| `effort-forge-15` | 火力熔爐 | **改造** | `knob-effort` | 第三幕換成 sim（轉旋鈕看離線輸出樣本），這是 sim 型式的首發關 |
| `citation-desk-21` | 引文閱覽台 | **改造** | `ground-quote-first` | 只留「先引用再作答」；引用格式獨立成標記之泉 |
| `well-of-unknowing-22` | 不知之井 | **保留** | `ground-out` | 只降權 assignsTask／positiveFraming |
| `long-scroll-tower-23` | 長卷之塔 | **保留** | `long-query-last` | order 型式與資料完全沿用，加一拍「頭尾各一次」的轉 |
| `verify-spring-24` | 查證之泉 | **改造** | `ground-read-first` | 併入「沒證據不准說做完了」與跨來源查證，rubric 由 5 條降為 2 條 |
| `archive-seal-25` | 檔案庫封印 | **轉為應用關** | — | 6 條 rubric 的綜合題 → grounding 的應用關 |
| `subtask-workbench-31` | 拆解工作台 | **改造** | `chain-serial` | 第三幕改成 order；specifiesFormat／hasConstraint 移除 |
| `draft-review-wheel-32` | 草稿之輪 | **改造** | `draft-review-refine` | 搬到校驗場；第三幕改成 multi（真的走三輪） |
| `tool-forge-33` | 工具鍛造間 | **改造** | `tool-description` | 搬到契約鍛冶場；specifiesFormat 換成 definesTools 加權 |
| `irreversible-gate-34` | 不可逆之門 | **改造** | `agent-approval-bounds` | 收斂成「可逆／不可逆」一條主題；setsPersistence 讓給三句箴言的柱 |
| `echo-workshop-35` | 回音工坊 | **改造** | `meta-iterate` | 搬到校驗場；主題改成「怎麼知道已經收斂」 |
| `oracle-workshop-36` | 神諭工坊 | **保留** | `tool-when-not` | workshop 型式與 27 關資料沿用，主題明確化為「該用與不該用」 |
| `mask-workshop-41` | 面具工坊 | **改造** | `role-basics` | 併入「角色不要綁太死」當作轉的那一拍；specifiesFormat 移除 |
| `priority-stair-42` | 優先序階梯 | **保留** | `hierarchy` | order 型式沿用；structure-03 讓給抄寫人的長桌 |
| `dial-room-43` | 刻度儀之室 | **改造** | `knob-temperature` | 第三幕改成 sim；params-03（effort）讓給火力熔爐 |
| `four-elements-mirror-44` | 四要素之鏡 | **改造** | `skeleton-ptcf` | rubric 由 6 條降為 2 條，只留四要素本身 |
| `crossroad-scale-45` | 抉擇之秤 | **改造** | `model-pick` | 主題明確化為「挑哪一台」；keepsPromptLean 讓給減法之庭 |

**小計**：保留 5 關（型式與資料原封不動，只降權 `assignsTask`）、改造 20 關（收斂主題、部分換型式）、轉為應用關 2 關（本來就是綜合題）。
**沒有任何一關被刪除**——這是護欄 7 的硬要求。

**全域改動（一次做完，26 關受影響）**：`assignsTask` 由 1 分降為 0.5 分並排除於「這一關教什麼」之外（`gap-analysis.md` §3 建議 1）；
各關 `pass` 門檻同步下修 0.5（「門檻＝總權重 50%」的規則不變）。這條改動會讓前三名檢查器的合計占比從 49% 降到約 25%。

---

<a id="五進程系統"></a>

## 五、進程系統

### 5.1 技能 ↔ 進度的對應

| 事件 | 給什麼 | 存檔欄位 |
|---|---|---|
| 通關一座神廟 | XP（依評價）＋ 該條技能收進圖鑑 ＋ 廠家徽章重算 | `bestGrades` / `collected` / `badges`（沿用） |
| 一區全部教學神廟通關 | 該區**精通**（圖鑑暖金封印 ＋ 世界補光轉金 ＋ toast） | 由 `collected` 推算（沿用，冪等） |
| 通過應用關 | XP ＋ 該區的**印記**（12 枚） | 🆕 `seals[]`（純加法，舊存檔補空陣列） |
| 讀完一條刻文小語／石碑 | 少量 XP | `inscriptionsFound` / `loreRead`（沿用） |

**XP 分層**（依 tier 而不是依區域——這樣玩家先玩哪一區都公平）：

| tier | 座數 | 基礎 XP（C 評價） | S 評價 | 理由 |
|---|---:|---:|---:|---|
| 基本功 | 37 | 40 | 88 | 序章畢業後的主要收入，讓前 15 分鐘升得快（#gamedeveloper：前 15 分鐘決定去留） |
| 進階 | 55 | 60 | 132 | — |
| 大師 | 38 | 90 | 198 | 取捨題本來就難，但它們**不是解鎖條件**（C9） |

### 5.2 應用關（P11 間隔複習，但不重教）

每區一座**試煉**，位置在該區地標的腳下。規則：

1. **不教任何新技巧**——第二幕（神諭刻文）在應用關**整幕跳過**，直接從委託進到刻印。這是鷹架撤除的最後一格（P3、C5）。
2. **要求組合該區 ≥2 條已學技巧**，而且**只有已經學會的那幾條會被列進 rubric**（沒學過的不列 → 不會被沒教過的東西擋住，P9）。
3. **型式偏向 `free`／`constraint`／`reverse`**——因為這時候玩家該自己寫得出來了。

| 區域 | 試煉名 | 要求組合 | 型式 | 素材 |
|---|---|---|---|---|
| 撰寫基本功 | **議會信使（沿用 council-envoy-06）** | clear-specific ＋ context-why ＋ struct-delimiters | 自由書寫（free-write） | 一封要同時說服三個人的信 |
| 示範與推理 | **三重迴聲的考題** | fewshot-basics ＋ cot-explicit ＋ knob-effort | 約束滿足（constraint satisfaction） | 一題必須示範、又必須簡短的委託 |
| 脈絡與長文 | **檔案庫封印（沿用 archive-seal-25）** | long-query-last ＋ ground-strict ＋ ground-out | 自由書寫（free-write） | 一整櫃只有三成有答案的卷宗 |
| 流程與代理 | **通宵的工地** | chain-serial ＋ outcome-first ＋ agent-approval-bounds | 派送／分流（workshop） | 一件要跨夜、中途要人點頭的工程 |
| 角色與參數 | **全員到齊的劇場** | skeleton-ptcf ＋ hierarchy ＋ role-basics | 排序（order） | 一場三個角色規矩互相牴觸的演出 |
| 量器坊 | **一次成形的鑄件** | fmt-specify ＋ len-preserve ＋ answer-anchor | 約束滿足（constraint satisfaction） | 一份同時要短、要有固定欄位、要抓得出答案的表 |
| 契約鍛冶場 | **無人看管的工坊** | tool-description ＋ tool-when-not ＋ tool-ask-missing | 派送／分流（workshop） | 四把用途相鄰、參數不齊的工具 |
| 減法之庭 | **只剩一句話** | lean-prompt ＋ len-preserve ＋ cache-static-first | 自由書寫（free-write） | 一份四百字、要砍到剩五十字的委託 |
| 校驗場 | **誰改得動這一份** | meta-iterate ＋ meta-eval ＋ contradiction-fix | 逆向拆解（reverse-engineering） | 一份三個人都改不好的 prompt |
| 護欄崗 | **假扮成委託的攻擊** | inj-concept ＋ inj-input-channel ＋ guardrail-hitl | 找碴（spot-the-flaw） | 五封來信，其中兩封夾帶指令 |
| 觀象臺 | **一張圖到一支片** | mm-basics ＋ img-generate ＋ video-prompt | 排序（order） | 一張參考圖與一份沒有分鏡的需求 |
| 分歧之廳 | **三台機器，同一題（終章）** | 全區任選 ≥3 條，含至少一條反差技巧 | 取捨（trade-off） | 同一份素材配三張不同的模型卡 |

### 5.3 大師層與隱藏成就（P14：可選，永不擋路）

| 名稱 | 條件 | 性質 |
|---|---|---|
| **無筆之印** | 一座神廟：不用任何快速填入、不開提示球、不看範例，一次拿到 S | 每座神廟各自可得，圖鑑上加一枚小記號 |
| **默寫之印** | 一座神廟：用**自由書寫模式**拿到 S（不用石碑刻印） | 同上 |
| **一區純手** | 一區全部神廟都拿到無筆之印 | 12 枚 |
| **分歧之證** | 分歧之廳 9 座全通 ＋ 終章試煉 S | 大師層封頂 |
| **既有 finale** | 68→130 技巧全收集 ＋ 四廠徽章 | ⚠️ **條件維持四廠**（`gap-analysis.md` 已警告：加廠會讓已通關玩家的成就回退，違反護欄 7）。Qwen／DeepSeek 另立支線徽章 |

### 5.4 解鎖圖（mission graph，#24 Boris）

```
序章「喚醒神諭」
      │
      ▼
 foundations ──┬─→ reasoning ─┬─→ orchestration ─┬─→ toolcraft ─→ wards
   （14）      │    （15）     │     （12）        │    （11）      （5）
               │              │                   └─→ refinery（11）
               ├─→ grounding ─┘                    
               │    （12）    └────────────────────→ wards（5）
               ├─→ config（12）──→ forms（14）
               ├─→ sight（8）  ← 不接在任何一區後面，隨時可岔出去
               └─→ frugality（7）← 任一區精通即可
                                   
       四區精通 ──→ divergence（9）──→ 終章試煉
```

全部是 **soft requirement**（#24 的分類）：閘門會問「想先過去看看嗎」，選了就開門。
唯一的 hard requirement 是 `divergence`——它的每一關都建立在「你已經知道通則」之上，先看反差會學成混亂。

---

<a id="六實作路線圖"></a>

## 六、實作路線圖

排序原則：**先把既有 27 關的重複度修掉（最痛的病）→ 再把 🟢 型式吃完（零引擎成本的內容量）→ 才開新地形與 🔴 型式。**
每一期都要維持「`npm run dev` 能跑、無 console error、既有內容不倒退」（護欄 5、7）。

| 期 | 內容 | 產出 | 新 kind | 引擎成本 | 為什麼排在這裡 |
|---|---|---|---|---|---|
| **A** | **重複度手術**：`assignsTask` 全面降權 0.5、26 關 `pass` 同步下修、6 關換掉不是主題的 `specifiesFormat`、5 關 `hasDelimiters` 降權 | 現有 27 關全部只教一件事 | — | 🟢 純資料 | 不動一行引擎就把 49% → 25%；也是後面所有新關的評分基準 |
| **B** | **`fix` ＋ `spot` 兩種 kind**（改碑／點碑）＋ foundations 補到 14 座 | +10 座新神廟，foundations 完整 | `fix` `spot` | 🟡 兩塊輕 UI（token 上 toggle、鍵盤 ↑↓ Enter） | 這兩種吃掉最多主題（減法、找碴、修理），而且互動極輕 |
| **C** | **`induct` ＋ `tradeoff`** ＋ reasoning 補到 15 座 | +10 座，few-shot 一整組到位 | `induct` `tradeoff` | 🟡（都是 `choice` 變體） | few-shot 的猜規則是全遊戲最好的一個「喔！」；取捨解鎖後面所有反差題 |
| **D** | **`constraint`（合尺）** ＋ grounding 12 ＋ config 12 | +12 座 | `constraint` | 🟡 即時預檢升格為舞台 | 預檢已經寫好了，這一期幾乎是把既有元件換個位置 |
| **E** | **量器坊（新地形 · 正南）** 14 座 | 第 6 區 | — | 🔴 新地形 ＋ 🟢 沿用既有 kind | 輸出格式／長度／語氣是「中文圈一般人」最有感的一批（`gap-analysis` N-8、N-10、N-14） |
| **F** | **契約鍛冶場（新地形 · 正西）** 11 座 ＋ **護欄崗**（加建）5 座 | 第 7、8 區 | — | 🔴 新地形（1）＋ 🟡 加建（1） | 工具與護欄是同一條線；`workshop` kind 已經上線，內容成本低 |
| **G** | **`multi`（兩輪刻印）** ＋ 校驗場（加建）11 座 ＋ orchestration 補齊 | +12 座，迭代類技巧首次有體感 | `multi` | 🔴 第三幕跑兩輪 ＋ 預寫輸出樣本 | 迭代／自評／鏈是目前**完全沒有體感**的一類，值得付這個成本 |
| **H** | **`sim`（轉鈕）** ＋ 減法之庭（加建）7 座 ＋ 刻度儀之室與火力熔爐改造 | 旋鈕類技巧有體感 | `sim` | 🔴 離線輸出樣本資料層（**不需 API key**，護欄 3 不受影響） | 旋鈕是最後一塊「只能用文字描述」的區域 |
| **I** | **觀象臺（新地形 · 小）** 8 座 | 第 11 區（多模態） | — | 🔴 新地形（小） | 與其他區零依賴，可以獨立排程；也可以視資源整期延後 |
| **J** | **分歧之廳（高原建物）** 9 座 ＋ 12 座應用關 ＋ 大師層印記 | 完整大師層與收束 | `reverse` | 🟢 建物 ＋ 🟡 `reverse`（退化成 `choice`） | 它建立在「已經知道通則」之上，必須最後做 |
| **K**（選配） | **`disclose`（拾遺）** — 把 2–3 座神廟改成「要先在世界裡撿到素材」 | 世界與關卡真正接起來 | `disclose` | 🔴 素材背包存檔欄位 ＋ 世界端拾取點 | 最貴、最像「探索遊戲」的一步；不做也不影響任何一條技巧被教到 |

**分期後的累計教學神廟數（估計）**：A 25 → B 35 → C 45 → D 57 → E 71 → F 87 → G 99 → H 106 → I 114 → J 130，12 座應用關全部在 J 期一次上線。
（A 期之後是 25 而不是 27，因為 `council-envoy-06` 與 `archive-seal-25` 轉成了應用關。）

**風險與對策**：

- **🔴 `sim` 的離線輸出樣本**是最容易失控的一塊（每個旋鈕值都要一段預寫輸出）。對策：先只做 3 座（temperature、effort、action budget），每個旋鈕 3 檔、每檔 1 段輸出＝ 9 段文字，驗證體感之後再擴。
- **新地形三塊**（量器坊、契約鍛冶場、觀象臺）會動到 `WORLD.md §6.1` 的效能預算（目前 125k 三角形 / 47 盞燈）。對策：新區沿用既有的程序化幾何體與材質快取，地標各只給 1 盞實體光源，其餘用自發光。
- **59 個新檢查器**是內容期最大的隱形成本。對策：每一期只開該期需要的那幾個，並沿用現行「結構性偵測 ＋ good/weak/bad fixture ＋ 反作弊斷言」的測試模式。

---

<a id="七統計"></a>

## 七、統計

### 7.1 技能

| 項目 | 數字 |
|---|---:|
| **技能總數** | **130** |
| 對應到的 master-list 條目 | 273 / 292 |
| 排除的條目 | 19 |
| 一條技能 ↔ 多個條目（合併） | 84 條技能 |
| 一個條目 → 兩條技能（拆分） | 2 例（#187、#76） |
| tier 分佈 | 基本功 37 ／ 進階 55 ／ 大師 38 |

### 7.2 每區技能數

| 區域 | 技能數 | 教學神廟 | 應用關 | 合計關卡 |
|---|---:|---:|---:|---:|
| 撰寫基本功 `foundations` | 14 | 14 | 1 | 15 |
| 示範與推理 `reasoning` | 15 | 15 | 1 | 16 |
| 脈絡與長文 `grounding` | 12 | 12 | 1 | 13 |
| 流程與代理 `orchestration` | 12 | 12 | 1 | 13 |
| 角色與參數 `config` | 12 | 12 | 1 | 13 |
| 量器坊 `forms` | 14 | 14 | 1 | 15 |
| 契約鍛冶場 `toolcraft` | 11 | 11 | 1 | 12 |
| 減法之庭 `frugality` | 7 | 7 | 1 | 8 |
| 校驗場 `refinery` | 11 | 11 | 1 | 12 |
| 護欄崗 `wards` | 5 | 5 | 1 | 6 |
| 觀象臺 `sight` | 8 | 8 | 1 | 9 |
| 分歧之廳 `divergence` | 9 | 9 | 1 | 10 |
| **合計** | **130** | **130** | **12** | **142** |

### 7.3 互動型式直方圖

| 型式 | 座數 | 占比 |
|---|---:|---:|
| 修理（fix-the-broken） | 28 | 21.5% |
| 找碴（spot-the-flaw） | 18 | 13.8% |
| 取捨（trade-off） | 15 | 11.5% |
| 派送／分流（workshop） | 15 | 11.5% |
| 分段建構（choice） | 14 | 10.8% |
| 排序（order） | 14 | 10.8% |
| 多輪修正（multi-turn refinement） | 9 | 6.9% |
| 約束滿足（constraint satisfaction） | 8 | 6.2% |
| 模擬—觀察—調整（simulation） | 4 | 3.1% |
| 逆向拆解（reverse-engineering） | 2 | 1.5% |
| 猜規則（rule induction） | 2 | 1.5% |
| 逐步揭露（progressive disclosure） | 1 | 0.8% |
| **合計** | **130** | 100% |

（另有 12 座應用關：自由書寫 3 ／ 約束滿足 2 ／ 派送 2 ／ 排序 2 ／ 逆向拆解 1 ／ 找碴 1 ／ 取捨 1。）

### 7.4 檢查器

- **沿用既有檢查器**：22 個 — `asksToCiteSources`、`asksToRefine`、`asksToVerify`、`assignsTask`、`decomposesTask`、`definesTools`、`explainsWhy`、`givesOutForUncertainty`、`groundsInContext`、`hasAudience`、`hasConstraint`、`hasDelimiters`、`hasFewShot`、`hasRole`、`hasStepByStep`、`keepsPromptLean`、`mentionsParameters`、`positiveFraming`、`putsQuestionLast`、`requiresConfirmation`、`setsPersistence`、`specifiesFormat`
- **需要新寫**：**59 個**（這是本設計最大的一筆隱形成本；其中約三分之二是既有檢查器的結構變體——位置比較、成對偵測、區間判定——可以共用 `checks.js` 現成的遮蔽（`maskNonInstruction`）與候選排名機制）

| 新檢查器 | 偵測什麼（全部是結構性偵測，不是關鍵字比對） |
|---|---|
| `allowsNullField` | 有沒有交代缺欄位的處置（填 null／留空／標為未知） |
| `anchorsToSection` | 有沒有要求每個主張標出出自哪一節 |
| `asksForPlanFirst` | 有沒有要求先交計畫、經核可再執行 |
| `asksForRationaleNotTranscript` | 要的是「結論的依據」而不是「把內部推理原封不動輸出」 |
| `asksModelToRewritePrompt` | 有沒有把 prompt 本身連同壞輸出一起交回去要求改寫 |
| `asksMultipleSamples` | 有沒有寫出取樣次數與裁決規則（跑 n 次／取多數／平手怎麼辦） |
| `asksToCompact` | 有沒有要求把過去的過程壓成摘要並指定必留項 |
| `avoidsPressureLanguage` | 全大寫比例、驚嘆號密度、賄賂與急迫語（「求你」「很急」「給你小費」） |
| `avoidsSelfCounting` | 沒有要求模型自己數數量，且把數量當成輸入提供 |
| `bansFillerPhrases` | 有沒有列出禁用片語（開場白／說教語） |
| `carriesForwardEssentials` | 換頁／換輪時有沒有指定要帶走哪些事實 |
| `citesInline` | 引用標記與被引用句同句／同段（相對位置偵測），而不是全部堆在文末 |
| `decisionTree` | 互相衝突的規則是否被改寫成有序的判斷（先看什麼、再看什麼） |
| `definesEvalSet` | 有沒有提到一組有標準答案的題目與比較方式 |
| `definesHandoffState` | 有沒有指定要記錄哪些狀態欄位以便交接 |
| `definesSchema` | 有沒有寫出欄位名與型別（而不是用散文描述格式） |
| `definesToneConcretely` | 語氣是用可驗收的寫作選擇描述，而不是形容詞 |
| `definesWordedScale` | 評分級距用文字描述，而不是純數字 |
| `delegatesWithCriteria` | 外派時有沒有同時給驗收標準 |
| `diagnosesFailureCause` | 有沒有指出病因類別（資料沒給／超綱／格式逼它填） |
| `disambiguatesTerms` | 對素材裡的歧義詞有沒有補上限定語或替代詞 |
| `extractsStandingRules` | 有沒有把重複出現的叮嚀抽成一個常駐區塊 |
| `hasFallbackCategory` | 分類或萃取有沒有兜底類別／未知值 |
| `hasStopRule` | 有沒有一條「什麼時候該停」 |
| `includesAdversarialCase` | 有沒有納入至少一個惡意／邊界輸入的處置 |
| `justifiesExampleCount` | 範例組數落在合理區間，且有一句話交代為什麼是這個數量 |
| `labelsNegativeExample` | 反例有沒有配一句「為什麼錯」（反例標記 ＋ 理由句同段落） |
| `labelsSources` | 每份文件有沒有可辨識的來源標籤或編號 |
| `limitsScope` | 有沒有一句話限制範圍（只動這一塊／不要順便） |
| `limitsToolOutput` | 有沒有限制工具回傳的欄位／筆數 |
| `limitsToolSurface` | 有沒有限制同時暴露的工具數或說明分層取用 |
| `namesComponents` | 有沒有替各區塊標上零件名（角色／任務／資料／範例／格式） |
| `namesDesignElements` | 有沒有點名版面／配色／頁數／動態這類設計元素 |
| `namesModelClass` | 有沒有指名要用哪一類模型並給理由 |
| `namesShotElements` | 有沒有點名鏡頭運動／氣氛／聲音這類分鏡要素 |
| `namesStackAndScope` | 有沒有指名框架／函式庫，並限定只動哪一塊 |
| `noDuplicateSchemaRules` | schema 已經寫的限制沒有在 prompt 裡再寫一次 |
| `noUndefinedReference` | 出現「那個／照舊／上次那樣」這類沒有先行詞的指涉，且 prompt 內找不到定義 |
| `ordersToolCalls` | 有沒有寫出呼叫的先後或明說可以並行 |
| `pointsAtRegion` | 有沒有指出要看圖／影片的哪一塊（區域、座標或時間戳） |
| `prefersToolOverMentalMath` | 有沒有明講計算類工作一律交給工具或程式 |
| `preservesPriorState` | 多步修改時有沒有明講「保留前一步的結果」 |
| `ranksInstructions` | 有沒有寫出規則之間的優先序（誰壓過誰） |
| `requiresPreamble` | 有沒有要求動作前後對使用者說一句話 |
| `reshapesToLowRisk` | 有沒有把「直接執行」改成「提出計畫由人執行」 |
| `rulesBeforeData` | 規則區塊的起始位置是否在資料區塊之前（結構位置比較，非關鍵字） |
| `saysWhatToPreserve` | 要求縮短時有沒有同時點名必須保留的東西 |
| `setsActionBudget` | 有沒有給出動作／回合次數上限（數字＋單位） |
| `setsRetrievalBudget` | 有沒有寫出「什麼情況才再查」或次數上限 |
| `statesFormatPreference` | 有沒有一段成文的格式偏好（而不是單句「不要用條列」） |
| `statesScope` | 有沒有一句話界定「這條規矩管到哪裡」（每一節／只有第一段／不含附錄） |
| `statesSuccessCriteria` | 有沒有一句可驗收的「做完長什麼樣」 |
| `statesToolTriggers` | 有沒有寫出「該用／不該用」的判斷條件 |
| `staticBeforeVariable` | 固定內容的位置是否全部早於變動內容（結構位置比較） |
| `toolNamesDistinct` | 工具名有共同前綴，且兩份描述的關鍵詞不重疊 |
| `tunesAutonomyLevel` | 有沒有把積極度往某一端明確拉（多做一步／先問再做） |
| `usesOneSkeleton` | 整份 prompt 的分段語法是否一致（不混用標籤／標題／括號） |
| `usesProsodyPunctuation` | 有沒有用標點或語音標記控制停頓（而不是用形容詞拜託） |
| `usesRareDelimiter` | 分隔符是否為自然語言中罕見的字元組合，且未在內文中出現過 |

### 7.5 排除的條目

共 **19 條**（占 292 條的 6.5%）。理由分三類：**API／schema 機制 8 條、產品與平台開關 7 條、部署與工程流程 3 條、出處無法驗證 1 條**。

| master # | 條目 | 排除理由 |
|---|---|---|
| #6 | 把 prompt 存在程式碼裡並版本控管 | 純工程流程（版控、feature flag），沒有任何一句話是寫給模型看的 |
| #11 | OpenAI「六大策略」框架 | ⚠️ 總表本身標記「出處找不到」（HTTP 403）。護欄 2：不收錄無法一手驗證的內容 |
| #79 | 觸發安全過濾的 fallback 回應：提高 temperature | 平台回應行為與錯誤處理，不是一條可練習的寫法 |
| #100 | 什麼時候該用文件集合檢索（六種情境） | 產品功能選用指南（要不要開某個檢索服務），非 prompt 寫作 |
| #125 | Structured Outputs 的 schema 硬性要求與不支援功能 | JSON Schema 的引擎限制清單（欄位上限、巢狀層數），寫 schema 的人才需要 |
| #126 | 處理 refusal：拒絕不會照你的 schema 走 | 客戶端錯誤處理（檢查 refusal 欄位） |
| #131 | `pattern` 正則的隱含全字串比對（xAI regex 子集） | 單一廠商的 regex 實作細節 |
| #147 | 工具 `parameters` 的根必須是 object | API 400 規則，改的是 schema 不是 prompt |
| #161 | 工具組合的四個推薦配方 | 產品層的功能搭配建議（開哪些 hosted tools） |
| #163 | 函式回應必須嚴格對齊 `id`／`name`／數量 | API 呼叫格式，程式端的事 |
| #164 | 多模態函式回應與行內指令的正確擺法 | API 訊息組裝細節 |
| #168 | 做一個「直接顯示給使用者」的工具 | 產品架構建議，不是 prompt 技巧 |
| #230 | Veo 影片延伸（extension）的限制 | 產品規格限制（可延伸幾秒） |
| #232 | prompt 複雜度會影響生成時間；同 prompt 多變體用 `n` | 計費與 API 參數行為 |
| #233 | 搜尋中的影像／影片理解要另外開 | 產品開關（哪個服務支援哪個旗標） |
| #243 | Computer use 的影像解析度建議 | 成本／效能設定值，非 prompt 寫作 |
| #250 | 即時濫用分類器可能中斷生成 | 平台安全行為，應用端要處理的是錯誤流程 |
| #259 | 客製工具被忽略時改用 `-customtools` 模型變體 | 模型變體選用偏方；而且總表註明它只存在於已標示下架的頁面 |
| #280 | 超出原生 context 長度時用 RoPE scaling（YaRN） | 部署設定（自架推論），總表自己也寫明「要調整的是部署設定，不是 prompt」 |

> **誠實補充**：排除不代表「這條不重要」，只代表**它沒有一句話是寫給模型看的**，因此教不成一座「寫 prompt」的神廟。
> 這些條目仍然留在 master list 裡，也仍然會出現在圖鑑的「神諭原典」連結所指向的官方頁面上——玩家點過去讀得到，只是遊戲不替它蓋關卡。

### 7.6 與現況的落差

| 指標 | 現況 | 本設計 |
|---|---|---|
| 玩家面技能數 | 68 | 130（+91%） |
| 涵蓋的 master-list 條目 | 80 / 292（27%） | 273 / 292（93.5%） |
| 區域數 | 5 | 12（其中 3 塊新地形、4 塊加建、5 塊沿用） |
| 關卡數 | 27 | 142（130 教學 ＋ 12 應用） |
| 一關教幾條技巧 | 2–4 條（rubric 4–7 條） | **1 條**（rubric 主檢查 1 ＋ 地基 ≤1） |
| 最大單一型式占比 | 89%（`choice` 24/27） | 21.5%（`fix` 28/130） |
| 技巧的第二次出場 | 0 | 133 次「教學前提」引用 ＋ 36 次應用關要求 ＝ 每條技能平均再出場 1.3 次 |

---

## 附：這份設計沒有解決的事（誠實記錄）

1. **130 座神廟的實際文案（`mission` / `material` / `clue` / `flows` 的 111→約 550 段刻印）本文件沒有寫**——這裡定的是骨架與型式，內容要在各期實作時逐區產出。
2. **`sim` 的離線輸出樣本要寫多少段、由誰寫**沒有定案。它是唯一會讓「離線」這條護欄承壓的地方（樣本本身是遊戲自撰內容，須標 `authored: "game"`）。
3. **行動裝置**（觸控搖桿、720px 以下的四幕與新題型版面）仍然沒有做，而本設計新增了 9 種題型，會讓這筆債更貴。建議在 D 期之後插一期還債。
4. **`gap-analysis.md` §2 的 N-1（回答語言跟隨提問語言）** 在 master list 裡被併進既有條目、沒有獨立編號，因此本表沒有替它開一條技能。
   這是本設計已知的**唯一一條「中文圈五分技巧」缺口**，建議在 E 期（量器坊）以 `system-uses`（#50 的五種用途之一就是輸出語言）的一拍補上，或回頭在 master list 補一個獨立條目再開技能。
5. **廠家徽章**只保留四廠（護欄 7）；Qwen／DeepSeek 的內容有進來（#266、#269、#276、#280 等），但沒有給徽章。

<!-- CURRICULUM-V2-COMPLETE -->

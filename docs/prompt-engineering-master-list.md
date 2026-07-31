# Prompt Engineering 技巧總表（Master List）— 九家廠商完整版

> **目的**：把各家 LLM 官方文件教的**每一條 prompt engineering 技巧**收成一份可勾選的完整清單，每條都附「怎麼用」與「官方出處」。
> 這是 **Promptasy** 專案的權威技巧總表；遊戲內容、圖鑑、關卡的涵蓋度稽核都以本檔為準。
> **原則**：不臆造、不遺漏。找不到或無法驗證的出處，一律誠實寫「**找不到**」。

- **彙整日**：2026-08-01（Part 1：四大廠）／2026-08-01（Part 2：其餘五家）
- **本檔範圍（Part 1）**：Anthropic、OpenAI、Google、xAI 四大廠 —— 條目 #1–#264
- **本檔範圍（Part 2）**：Qwen（阿里）、DeepSeek、Mistral、Meta（Llama）、Cohere、Microsoft（Azure OpenAI / Foundry） —— 新增條目 #265–#292，其餘併入既有條目
- **語言**：正體中文敘述；官方英文術語與引文於精確度重要處保留原文

---

<a id="toc"></a>

## 目錄（Table of contents）

| 章節 | 內容 | 條目範圍 | 條數 |
|---|---|---:|---:|
| [一](#sec1) | 原始來源說明（九份 promptbook ＋ 統計表 ＋ 去重統計） | — | — |
| [二](#sec2) | 來源健康度：已下架／擷取失敗的文件與本檔處理方式 | — | — |
| [三](#sec3) | **技巧總表（以下 17 章）** | #1–#292 | 292 |
| [第 1 章](#ch1) | 前置作業、模型選擇與方法論 | #1–#11 | 11 |
| [第 2 章](#ch2) | 清晰、具體與正面表述 | #12–#21、#265 | 11 |
| [第 3 章](#ch3) | 脈絡、動機與背景資訊 | #22–#24 | 3 |
| [第 4 章](#ch4) | 結構、分隔符與官方 prompt 骨架 | #25–#38、#266–#267 | 16 |
| [第 5 章](#ch5) | 範例：Few-shot、Many-shot 與補完策略 | #39–#47、#268 | 10 |
| [第 6 章](#ch6) | 角色、系統訊息與指令階層 | #48–#54、#269–#271 | 10 |
| [第 7 章](#ch7) | 推理、思考控制與取樣參數 | #55–#79、#272–#279 | 33 |
| [第 8 章](#ch8) | 長上下文與資訊定位 | #80–#87、#280 | 9 |
| [第 9 章](#ch9) | 依據、引用與抗幻覺 | #88–#100、#281–#282 | 15 |
| [第 10 章](#ch10) | 輸出格式、長度、語氣與結構化輸出 | #101–#133、#283–#286 | 37 |
| [第 11 章](#ch11) | 工具使用與 Function Calling | #134–#168 | 35 |
| [第 12 章](#ch12) | 代理系統：自主性、狀態、記憶與多步流程 | #169–#194、#287 | 27 |
| [第 13 章](#ch13) | 迭代、自我檢查、評測與 metaprompting | #195–#206、#288–#290 | 15 |
| [第 14 章](#ch14) | 效率、精簡、快取與脈絡管理 | #207–#217、#291–#292 | 13 |
| [第 15 章](#ch15) | 多模態、媒體生成與視覺／前端設計 | #218–#243 | 26 |
| [第 16 章](#ch16) | 安全、護欄與 prompt injection | #244–#250 | 7 |
| [第 17 章](#ch17) | 模型特定注意事項與遷移警示 | #251–#264 | 14 |
| [Part 2 併入說明](#part2) | 其餘五家 118 個來源編號的併入方式 | — | — |
| [附錄 A](#appA) | 追溯對照表：Part 1 來源編號 → 條目（375 列） | — | 375 |
| [附錄 A-2](#appA2) | 追溯對照表：Part 2 來源編號 → 條目（118 列） | — | 118 |
| [附錄 B](#appB) | 反查：條目 → 來源編號（292 列） | #1–#292 | 292 |
| [附錄 C](#appC) | 遊戲課程對照：`curriculum.json` 68 技巧 → 條目 | — | 68 |
| [稽核紀錄](#audit) | Part 3 完整性稽核（2026-08-01） | — | — |

---

<a id="quickindex"></a>

## 快速索引（全部 292 條）

> 「廠商數」＝該條目「出處」欄實際引用的**來源機構**數（九家＋Microsoft 共 10 個）。數字越大代表該技巧的跨廠共識越強。
> 點編號可跳到條目；點章號可跳到該章。

| # | 技巧名 | 廠商數 | 章 |
|---:|---|---:|---:|
| [#1](#e1) | Prompt engineering 的定義：非決定性，一半藝術一半科學（What prompt engineering is） | 2 | [1](#ch1) |
| [#2](#e2) | 動手之前的三個前提（Before prompt engineering） | 1 | [1](#ch1) |
| [#3](#e3) | 不是每個問題都該用 prompt engineering 解（When to prompt engineer） | 1 | [1](#ch1) |
| [#4](#e4) | 選模型：推理模型像資深同事，GPT 模型像新進同事（Reasoning vs GPT models） | 1 | [1](#ch1) |
| [#5](#e5) | 生產環境釘住 model snapshot 並建立測試套件（Pin snapshots + evals） | 1 | [1](#ch1) |
| [#6](#e6) | 把 prompt 存在應用程式碼裡並版本控管（Version prompts in code） | 1 | [1](#ch1) |
| [#7](#e7) | 提示設計是迭代的，官方範本只是起點（Prompt engineering is iterative） | 2 | [1](#ch1) |
| [#8](#e8) | 「最好的 prompt」不是最長的：不要過度工程化（Don't over-engineer） | 1 | [1](#ch1) |
| [#9](#e9) | 選技巧的決策框架（Decision framework） | 1 | [1](#ch1) |
| [#10](#e10) | 元原則：能用參數或程式保證的，不要用 prompt 拜託（Use parameters, not pleading） | 1 | [1](#ch1) |
| [#11](#e11) | OpenAI「六大策略」框架（Six strategies）— ⚠️ 出處**找不到** | — | [1](#ch1) |
| [#12](#e12) | 把話說清楚、直接說（Be clear and direct ／ 黃金法則） | 5 | [2](#ch2) |
| [#13](#e13) | 要求要具體：官方 good／bad 對照（Be specific in requests） | 3 | [2](#ch2) |
| [#14](#e14) | 說「要做什麼」而不是「不要做什麼」（Positive framing） | 2 | [2](#ch2) |
| [#15](#e15) | 明確寫出限制（Constraints） | 3 | [2](#ch2) |
| [#16](#e16) | 用祈使句要求「動手做」而不是「給建議」（Ask for action, not suggestions） | 1 | [2](#ch2) |
| [#17](#e17) | 新一代模型更「照字面」執行：適用範圍要明講（Literal instruction following） | 2 | [2](#ch2) |
| [#18](#e18) | 不要用全大寫、賄賂、情緒勒索或急迫語氣（No all-caps / bribes / pressure） | 1 | [2](#ch2) |
| [#19](#e19) | 用自然語言、完整句子；並把 Gemini 當成你的 prompt 編輯器（Workspace 六條） | 1 | [2](#ch2) |
| [#20](#e20) | 量化基準：最成功的 prompt 平均約 21 個字（The 21-word finding） | 1 | [2](#ch2) |
| [#21](#e21) | 四種輸入型態：問題／任務／實體／補完（Input types） | 1 | [2](#ch2) |
| [#22](#e22) | 說明「為什麼」：給指令背後的動機（Add context / give the reason） | 1 | [3](#ch3) |
| [#23](#e23) | 把模型需要的資訊直接放進 prompt（Add context / RAG） | 6 | [3](#ch3) |
| [#24](#e24) | 有效脈絡的兩種型態：背景資訊 vs 規則（Two kinds of context） | 1 | [3](#ch3) |
| [#25](#e25) | 用 XML 標籤把 prompt 分區（Structure prompts with XML tags） | 2 | [4](#ch4) |
| [#26](#e26) | ⚠️ XML 標籤對現代模型「已較不必要」（XML: less necessary now） | 1 | [4](#ch4) |
| [#27](#e27) | 用 Markdown 標題、清單與章節標題當分隔符（Markdown delimiters） | 3 | [4](#ch4) |
| [#28](#e28) | 前綴標籤與 BEGIN/END、{} 分隔符（Prefixes and section delimiters） | 3 | [4](#ch4) |
| [#29](#e29) | 內容 vs 結構的二分（Content and structure） | 1 | [4](#ch4) |
| [#30](#e30) | Prompt 的組成元件與別名對照（Prompt components & aliases） | 2 | [4](#ch4) |
| [#31](#e31) | 官方骨架 A：Google Gemini Enterprise 的 `<OBJECTIVE_AND_PERSONA>` 七段範本 | 1 | [4](#ch4) |
| [#32](#e32) | 官方骨架 B：Gemini 3 的 XML 版與 Markdown 版（擇一貫徹） | 1 | [4](#ch4) |
| [#33](#e33) | 官方骨架 C：OpenAI developer message 四段（Identity → Instructions → Examples → Context） | 1 | [4](#ch4) |
| [#34](#e34) | 官方骨架 D：GPT-4.1 的七段模板 | 1 | [4](#ch4) |
| [#35](#e35) | 官方骨架 E：GPT-5.6 的八段模板（含 Stop rules） | 1 | [4](#ch4) |
| [#36](#e36) | 官方骨架 F：Persona-Task-Context-Format 四要素（P-T-C-F） | 1 | [4](#ch4) |
| [#37](#e37) | Response Rules 放最前面；指令衝突時模型傾向遵循靠近結尾的那條（Position effects） | 3 | [4](#ch4) |
| [#38](#e38) | Prompt template：把變數抽出來（Prompt templates） | 1 | [4](#ch4) |
| [#39](#e39) | Few-shot 的基本功：相關、多樣、結構化、3–5 個（Use examples effectively） | 6 | [5](#ch5) |
| [#40](#e40) | Google 立場：建議**永遠**在 prompt 裡放 few-shot 範例（Always include few-shot） | 1 | [5](#ch5) |
| [#41](#e41) | 範例數量要實測，太多會 overfit（Number of examples） | 1 | [5](#ch5) |
| [#42](#e42) | 範例的格式必須完全一致（Consistent formatting） | 1 | [5](#ch5) |
| [#43](#e43) | 範例一定要配清楚指令；而且規則與範例必須對得上（Examples + instructions must agree） | 2 | [5](#ch5) |
| [#44](#e44) | Many-shot in-context learning（把 few-shot 放大到數百～數十萬個） | 1 | [5](#ch5) |
| [#45](#e45) | 推理模型先試 zero-shot，再考慮加範例（Zero-shot first） | 1 | [5](#ch5) |
| [#46](#e46) | 補完策略：寫出回應的開頭讓模型接下去（Partial input completion） | 4 | [5](#ch5) |
| [#47](#e47) | 在範例裡用 `<thinking>` 標籤示範推理樣式（Multishot examples work with thinking） | 1 | [5](#ch5) |
| [#48](#e48) | 給模型一個角色（Role / persona prompting） | 4 | [6](#ch6) |
| [#49](#e49) | ⚠️ 角色不要過度限制（Don't over-constrain the role） | 1 | [6](#ch6) |
| [#50](#e50) | System instruction 的五種用途與安全定位（System instructions） | 1 | [6](#ch6) |
| [#51](#e51) | 指令階層：developer > user（Chain of command） | 3 | [6](#ch6) |
| [#52](#e52) | 推理模型用 developer message 取代 system message | 1 | [6](#ch6) |
| [#53](#e53) | 單一回合覆寫 system prompt（Per-response instructions） | 1 | [6](#ch6) |
| [#54](#e54) | 讓模型正確自報身分／模型字串（Model self-knowledge） | 1 | [6](#ch6) |
| [#55](#e55) | 推理模型：給目標與成功標準，不要規定每一個中間步驟（General instructions over prescriptive steps） | 2 | [7](#ch7) |
| [#56](#e56) | 推理模型偏好簡短清楚的指令（Keep it simple） | 1 | [7](#ch7) |
| [#57](#e57) | ⚠️ 不要對推理模型下 CoT，也不要在工具呼叫前誘發額外推理（Avoid chain-of-thought for reasoning models） | 2 | [7](#ch7) |
| [#58](#e58) | ⚠️ 不要叫模型覆述／轉錄它的內部推理（`reasoning_extraction` 拒絕） | 2 | [7](#ch7) |
| [#59](#e59) | 非推理模型仍要明講逐步思考；重推理問題可加「Think very hard」 | 4 | [7](#ch7) |
| [#60](#e60) | 手動 chain-of-thought 作為 fallback（thinking 關閉時） | 1 | [7](#ch7) |
| [#61](#e61) | 要求解釋推理，並用分隔符把推理與答案切開（Explain its reasoning） | 2 | [7](#ch7) |
| [#62](#e62) | Adaptive thinking：模型自己決定何時想、想多久（Adaptive thinking） | 1 | [7](#ch7) |
| [#63](#e63) | 引導工具結果之後的反思（Interleaved thinking） | 1 | [7](#ch7) |
| [#64](#e64) | Anthropic `effort` 等級與調校原則（Effort levels） | 1 | [7](#ch7) |
| [#65](#e65) | OpenAI `reasoning.effort`：七級與「先建 baseline 再動它」 | 1 | [7](#ch7) |
| [#66](#e66) | xAI `reasoning_effort`：三級、預設 high、**不能關閉** | 1 | [7](#ch7) |
| [#67](#e67) | ⚠️ 同一個參數名在不同模型意義不同：xAI multi-agent 的 `reasoning.effort` 控制的是**代理數量** | 1 | [7](#ch7) |
| [#68](#e68) | Google `thinking_level` 取代 `thinking_budget`，並依任務難度選檔 | 2 | [7](#ch7) |
| [#69](#e69) | ⚠️ Anthropic `budget_tokens` 已淘汰（Claude 4.7+ 會回 400） | 1 | [7](#ch7) |
| [#70](#e70) | ⚠️ 過度思考：把「盡量徹底」的鷹架收掉（Overthinking） | 1 | [7](#ch7) |
| [#71](#e71) | ⚠️ 關閉 thinking 的兩種副作用與解法（Running with thinking disabled） | 1 | [7](#ch7) |
| [#72](#e72) | 「think」這個字的敏感度（Word sensitivity） | 1 | [7](#ch7) |
| [#73](#e73) | 為推理保留 token 空間；注意 `max_tokens` 與 tokenizer 變動 | 3 | [7](#ch7) |
| [#74](#e74) | Reasoning summary 與 thought signature（看得到／帶得回推理狀態） | 2 | [7](#ch7) |
| [#75](#e75) | Minimal reasoning 下要「更用力 prompt」（Minimal reasoning） | 1 | [7](#ch7) |
| [#76](#e76) | 取樣參數總覽：max output tokens / temperature / topK / topP / stop_sequences / seed | 1 | [7](#ch7) |
| [#77](#e77) | ⚠️ Gemini 3.x：取樣參數保持預設；要決定性請改寫 system instruction | 1 | [7](#ch7) |
| [#78](#e78) | ⚠️ Claude Sonnet 5：設定 `temperature` / `top_p` / `top_k` 會回 400 錯誤 | 2 | [7](#ch7) |
| [#79](#e79) | 觸發安全過濾的 fallback 回應：提高 temperature（Fallback responses） | 1 | [7](#ch7) |
| [#80](#e80) | 長資料放最上面、問題與指令放最後（Queries at the end） | 3 | [8](#ch8) |
| [#81](#e81) | ⚠️ GPT-4.1 長文：指令放在**開頭與結尾各一次** | 2 | [8](#ch8) |
| [#82](#e82) | 用 XML 結構化多文件與 metadata（Document structure） | 1 | [8](#ch8) |
| [#83](#e83) | ⭐ 長文多文件的格式：XML 與 pipe 分隔表現好，**JSON 特別差** | 1 | [8](#ch8) |
| [#84](#e84) | 長脈絡的新典範：直接把全部資料放進去（Provide all information upfront） | 1 | [8](#ch8) |
| [#85](#e85) | 多針（multiple needles）檢索的準確度取捨 | 1 | [8](#ch8) |
| [#86](#e86) | 長文先做內部大綱，再把主張錨回章節（`<long_context_handling>`） | 1 | [8](#ch8) |
| [#87](#e87) | 三階段推理策略：Query Analysis → Context Analysis → Synthesis | 1 | [8](#ch8) |
| [#88](#e88) | 先原文引用，再作答（Ground responses in quotes） | 1 | [9](#ch9) |
| [#89](#e89) | 允許模型說「我不知道」，並要求它明確指出模糊之處 | 4 | [9](#ch9) |
| [#90](#e90) | 嚴格 grounding：只用提供的脈絡作答（Strict grounding） | 2 | [9](#ch9) |
| [#91](#e91) | ⭐ 引用行為與檢索預算要寫進 prompt（Grounding, citations, and retrieval budgets） | 1 | [9](#ch9) |
| [#92](#e92) | 引用格式規範（Citation format） | 3 | [9](#ch9) |
| [#93](#e93) | Web search 與引用規則（`<web_search_rules>`） | 1 | [9](#ch9) |
| [#94](#e94) | 研究的停止條件：邊際價值遞減就停（Stop when marginal value drops） | 1 | [9](#ch9) |
| [#95](#e95) | 跨來源查證與結構化研究流程（Research and information gathering） | 1 | [9](#ch9) |
| [#96](#e96) | ⭐ 進度宣稱必須有工具結果佐證（Ground progress claims） | 1 | [9](#ch9) |
| [#97](#e97) | 讀過再說：agentic coding 的抗幻覺指令（Minimizing hallucinations in agentic coding） | 1 | [9](#ch9) |
| [#98](#e98) | ⚠️ 開了引用不代表每次都會引用（Citations are not guaranteed） | 1 | [9](#ch9) |
| [#99](#e99) | URL context 的三條使用規則 | 1 | [9](#ch9) |
| [#100](#e100) | 什麼時候該用文件集合檢索（Collections Search 的六種情境） | 1 | [9](#ch9) |
| [#101](#e101) | 直接指定回應格式（Response format） | 3 | [10](#ch10) |
| [#102](#e102) | 用 XML 格式指示器指定輸出區塊（XML format indicators） | 1 | [10](#ch10) |
| [#103](#e103) | Prompt 本身的排版風格會傳染給輸出（Match your prompt style to the desired output） | 1 | [10](#ch10) |
| [#104](#e104) | 用一段詳細的格式偏好區塊減少 markdown／條列濫用 | 1 | [10](#ch10) |
| [#105](#e105) | Markdown 只在語義正確的地方用，並在長對話中週期性重申 | 1 | [10](#ch10) |
| [#106](#e106) | 數學式預設用 LaTeX，要純文字必須明講（LaTeX output） | 1 | [10](#ch10) |
| [#107](#e107) | 給具體的長度限制，並做分層 verbosity（Concrete length constraints） | 2 | [10](#ch10) |
| [#108](#e108) | ⭐ 要「短」就明講「什麼必須保留」（Say what to preserve） | 1 | [10](#ch10) |
| [#109](#e109) | ⚠️ 遷移時重新檢視「Be concise」這類籠統的簡潔指令 | 1 | [10](#ch10) |
| [#110](#e110) | 現行 Claude 模型更簡潔——想要摘要就要明講 | 1 | [10](#ch10) |
| [#111](#e111) | ⭐ `effort` 控制的是「想多少」不是「說多少」（Effort ≠ response length） | 1 | [10](#ch10) |
| [#112](#e112) | Sonnet 5 依任務複雜度自動校準長度（Calibrated response length） | 1 | [10](#ch10) |
| [#113](#e113) | 「對話冗長度」與「寫到檔案的文件長度」要分開下指令 | 1 | [10](#ch10) |
| [#114](#e114) | 一句話就能改行為；而且「好讀」與「短」是兩回事 | 1 | [10](#ch10) |
| [#115](#e115) | ⭐ 最終摘要要「重新落地」，不是工作腦內語言的延續（Readability when communicating with the user） | 1 | [10](#ch10) |
| [#116](#e116) | 用**具體的寫作選擇**定義語氣，不要用模糊標籤（Define the tone） | 4 | [10](#ch10) |
| [#117](#e117) | 提供的樣板句要求變化，避免逐字重複（Vary sample phrases） | 1 | [10](#ch10) |
| [#118](#e118) | 進度更新的節奏：只在階段變更或發現改變計畫時更新 | 2 | [10](#ch10) |
| [#119](#e119) | Tool preamble：工具呼叫前後都要對使用者說話（Tool preambles） | 1 | [10](#ch10) |
| [#120](#e120) | 去掉開場白（Remove preamble） | 2 | [10](#ch10) |
| [#121](#e121) | 用 Structured Outputs 約束輸出結構（取代 prefill 控格式） | 2 | [10](#ch10) |
| [#122](#e122) | Structured Outputs 是什麼、帶來什麼（OpenAI） | 1 | [10](#ch10) |
| [#123](#e123) | Structured Outputs vs Function calling：怎麼選 | 2 | [10](#ch10) |
| [#124](#e124) | ⭐ Structured Outputs vs JSON mode：一律優先用前者 | 1 | [10](#ch10) |
| [#125](#e125) | Structured Outputs 的 schema 硬性要求與不支援功能 | 1 | [10](#ch10) |
| [#126](#e126) | 處理 refusal：拒絕不會照你的 schema 走 | 1 | [10](#ch10) |
| [#127](#e127) | Structured Outputs 的四條 best practices | 1 | [10](#ch10) |
| [#128](#e128) | 在 prompt 裡處理「輸入無法符合 schema」的情況 | 1 | [10](#ch10) |
| [#129](#e129) | ⭐ 讓 schema 承擔格式，prompt 只負責講任務（Division of labour） | 1 | [10](#ch10) |
| [#130](#e130) | ⭐ 分清楚「引擎保證」與「模型盡力」的 schema 關鍵字 | 1 | [10](#ch10) |
| [#131](#e131) | `pattern` 正則的隱含全字串比對（xAI regex 子集） | 1 | [10](#ch10) |
| [#132](#e132) | ⭐ 結構化萃取：缺欄位設 `null` 而不是猜（`<extraction_spec>`） | 2 | [10](#ch10) |
| [#133](#e133) | 文件創作：簡報／動畫／視覺文件要明確要求設計元素 | 1 | [10](#ch10) |
| [#134](#e134) | ⭐ 工具描述是工具效能**最重要**的因素（Tool descriptions） | 4 | [11](#ch11) |
| [#135](#e135) | 工具數量要控制，只暴露與任務相關的工具（Fewer tools） | 2 | [11](#ch11) |
| [#136](#e136) | 在 system prompt 明確定義「該用」與「不該用」工具的情境 | 1 | [11](#ch11) |
| [#137](#e137) | 把使用準則寫進 function description 本身 | 1 | [11](#ch11) |
| [#138](#e138) | 關鍵規則要放在描述的**最前面**（Position within the description） | 1 | [11](#ch11) |
| [#139](#e139) | 在工具定義裡附範例與邊界案例（`input_examples` / few-shot in description） | 2 | [11](#ch11) |
| [#140](#e140) | 工具命名要有 namespace；描述不可重疊；schema 要扁平 | 2 | [11](#ch11) |
| [#141](#e141) | 把相關操作合併成較少的工具；不要叫模型填你已經知道的參數 | 2 | [11](#ch11) |
| [#142](#e142) | 工具回傳只給「高訊號」資訊（High-signal tool results） | 1 | [11](#ch11) |
| [#143](#e143) | 套用軟體工程原則：最小驚訝、用 enum 讓非法狀態無法表示 | 1 | [11](#ch11) |
| [#144](#e144) | ⭐ 實習生測試（The intern test） | 1 | [11](#ch11) |
| [#145](#e145) | `tool_choice` 四種模式與一個重要副作用 | 3 | [11](#ch11) |
| [#146](#e146) | Strict mode：保證工具參數符合 schema | 3 | [11](#ch11) |
| [#147](#e147) | 工具 `parameters` 的根必須是 object，否則 400 | 1 | [11](#ch11) |
| [#148](#e148) | 平行工具呼叫（Parallel tool calling） | 2 | [11](#ch11) |
| [#149](#e149) | 調整「什麼時候會呼叫工具」的判斷邊界，並記得寫例外條款 | 2 | [11](#ch11) |
| [#150](#e150) | 缺少必要參數時：問使用者，不要猜 | 2 | [11](#ch11) |
| [#151](#e151) | ⭐ 明確禁止「承諾稍後再呼叫工具」的幻覺 | 1 | [11](#ch11) |
| [#152](#e152) | 明確規定工具呼叫的**順序** | 1 | [11](#ch11) |
| [#153](#e153) | 混用 hosted tools 與自訂函式時，明確指定偏好順序與 fallback | 1 | [11](#ch11) |
| [#154](#e154) | 明確要求「寧可用工具也不要自己算」（Prefer tools over internal computation） | 4 | [11](#ch11) |
| [#155](#e155) | 用 API 原生的 `tools` 欄位，不要把 schema 手動塞進 prompt | 2 | [11](#ch11) |
| [#156](#e156) | Deferred tools / tool search：詳細指引放函式描述，namespace 描述保持精簡 | 1 | [11](#ch11) |
| [#157](#e157) | ⚠️ 把「CRITICAL / MUST」這類強語氣**調弱**（避免過度觸發） | 1 | [11](#ch11) |
| [#158](#e158) | Thinking 關閉或模型偏好推理時，要明確推一把去用工具（Tool use triggering） | 1 | [11](#ch11) |
| [#159](#e159) | Programmatic Tool Calling（PTC）：什麼時候該用、什麼時候不該用 | 1 | [11](#ch11) |
| [#160](#e160) | 工具使用規則區塊（`<tool_usage_rules>`） | 1 | [11](#ch11) |
| [#161](#e161) | 工具組合的四個推薦配方（Suggested tool combinations） | 1 | [11](#ch11) |
| [#162](#e162) | ⚠️ 伺服器端工具的輸出**不會**回傳給你 | 1 | [11](#ch11) |
| [#163](#e163) | 函式回應必須嚴格對齊 `id` / `name` / 數量（Function response matching） | 1 | [11](#ch11) |
| [#164](#e164) | ⚠️ 多模態函式回應與行內指令的正確擺法（避免 thought leakage） | 1 | [11](#ch11) |
| [#165](#e165) | ⚠️ 要求模型在工具呼叫前輸出結構化文字會壞掉（Malformed_Function_Call） | 1 | [11](#ch11) |
| [#166](#e166) | 工具呼叫過多的兩招：降 thinking level ＋ 給「動作預算」 | 1 | [11](#ch11) |
| [#167](#e167) | Code execution：什麼時候該開，以及它的副作用 | 2 | [11](#ch11) |
| [#168](#e168) | 做一個「直接顯示給使用者」的工具（send-to-user tool） | 1 | [11](#ch11) |
| [#169](#e169) | ⭐ 三條經典 agentic 提醒（Persistence / Tool-calling / Planning） | 1 | [12](#ch12) |
| [#170](#e170) | 代理積極度是一條連續光譜，兩個方向都要會調（Controlling agentic eagerness） | 2 | [12](#ch12) |
| [#171](#e171) | ⭐ Outcome-first：描述終點與成功標準，不規定路徑；並定義停止條件 | 1 | [12](#ch12) |
| [#172](#e172) | ⭐ 定義自主性與核准邊界（Autonomy and approval boundaries） | 1 | [12](#ch12) |
| [#173](#e173) | 依「可逆性」決定要不要先問（Balancing autonomy and safety） | 1 | [12](#ch12) |
| [#174](#e174) | 明講邊界：什麼時候該交付「評估」而不是「修改」 | 1 | [12](#ch12) |
| [#175](#e175) | ⭐ 抑制過度工程化與 scope drift（Overeagerness / scope constraints） | 2 | [12](#ch12) |
| [#176](#e176) | 不要為了通過測試而寫死（Avoid hardcoding to tests） | 1 | [12](#ch12) |
| [#177](#e177) | Coding agent 的具體規範清單（Coding agent prompt rules） | 1 | [12](#ch12) |
| [#178](#e178) | 八步問題解決工作流（Problem-solving workflow） | 1 | [12](#ch12) |
| [#179](#e179) | 互動式編碼產品：主動提出改動讓使用者核可，而不是先問要不要做 | 1 | [12](#ch12) |
| [#180](#e180) | 長程任務靠「增量推進」維持方向（Long-horizon reasoning and state tracking） | 1 | [12](#ch12) |
| [#181](#e181) | ⚠️ Context awareness：告訴模型「context 會自動壓縮，不要提早收工」 | 1 | [12](#ch12) |
| [#182](#e182) | 跨多個 context window 的工作流（六條） | 1 | [12](#ch12) |
| [#183](#e183) | 狀態管理的四條最佳實務（State management） | 2 | [12](#ch12) |
| [#184](#e184) | ⭐ 建立記憶系統（Construct a memory system） | 1 | [12](#ch12) |
| [#185](#e185) | 自主 pipeline 要加「不要問、直接做」的提醒（Rare cases of early stopping） | 1 | [12](#ch12) |
| [#186](#e186) | Subagent 編排：何時委派、何時自己做（Subagent orchestration） | 2 | [12](#ch12) |
| [#187](#e187) | 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate） | 4 | [12](#ch12) |
| [#188](#e188) | Agentic 行為的九個可調維度（Agentic workflow dimensions） | 1 | [12](#ch12) |
| [#189](#e189) | Google 官方 agentic system instruction 範本（九點，經研究驗證） | 1 | [12](#ch12) |
| [#190](#e190) | 先計畫、審過再執行（Plan mode / collaborative planning） | 2 | [12](#ch12) |
| [#191](#e191) | `max_turns`：agentic 迴圈的「回合」預算（不是工具呼叫數） | 1 | [12](#ch12) |
| [#192](#e192) | ⭐ 把常駐指令寫成檔案：`AGENTS.md`（短而具體 > 長） | 1 | [12](#ch12) |
| [#193](#e193) | Skills：把可重用的指令包成資料夾 | 1 | [12](#ch12) |
| [#194](#e194) | 減少 agentic coding 產生的暫存檔 | 1 | [12](#ch12) |
| [#195](#e195) | ⚠️ 要求自我檢查——但新一代模型要把這類指令**刪掉**（Self-check / over-verification） | 1 | [13](#ch13) |
| [#196](#e196) | ⭐ 光說「檢查一下」沒用——給它能驗證的工具，並指定驗證什麼 | 2 | [13](#ch13) |
| [#197](#e197) | ⭐ 把「發現」與「過濾」分成兩個階段（Code review harnesses） | 1 | [13](#ch13) |
| [#198](#e198) | ⭐ 讓模型先自建評分表再自評（`<self_reflection>`） | 2 | [13](#ch13) |
| [#199](#e199) | ⭐ 找出並解決 prompt 裡互相矛盾的指令（Contradictory instructions） | 2 | [13](#ch13) |
| [#200](#e200) | ⭐⭐ Prompt 健康檢查清單（22 條除錯項） | 1 | [13](#ch13) |
| [#201](#e201) | 迭代三招：換句話說／換成類比任務／調換內容順序 | 2 | [13](#ch13) |
| [#202](#e202) | 迭代方法論與「已經收斂」的判準 | 2 | [13](#ch13) |
| [#203](#e203) | 用 ground truth 做並排比較（Compare prompts） | 1 | [13](#ch13) |
| [#204](#e204) | 用官方的 prompt 優化工具（Prompt optimizers） | 4 | [13](#ch13) |
| [#205](#e205) | ⭐ Metaprompting：讓模型優化自己的 prompt | 2 | [13](#ch13) |
| [#206](#e206) | 四條 prompt 精修實務（Prompting overview 的實務清單） | 1 | [13](#ch13) |
| [#207](#e207) | ⭐⭐ 精簡的 prompt 反而表現更好（Favor leaner prompts） | 1 | [14](#ch14) |
| [#208](#e208) | 長 session 要監控 context 成長（Track context growth） | 1 | [14](#ch14) |
| [#209](#e209) | ⭐ 靜態內容放前面、變動內容放後面（Front-load static content） | 3 | [14](#ch14) |
| [#210](#e210) | ⚠️ 快取只在「完全相同的前綴」命中：只能往後追加，不能改前面 | 2 | [14](#ch14) |
| [#211](#e211) | 快取的門檻、一致性要求與 cache key | 2 | [14](#ch14) |
| [#212](#e212) | 快取不影響輸出品質（消除一個常見誤解） | 1 | [14](#ch14) |
| [#213](#e213) | ⭐ Context compaction：長 agent loop 的脈絡壓縮 | 2 | [14](#ch14) |
| [#214](#e214) | Context pruning：把過期的工具呼叫換成精簡摘要 | 1 | [14](#ch14) |
| [#215](#e215) | 換主題就開新對話（避免懶惰行為） | 1 | [14](#ch14) |
| [#216](#e216) | 重用推理脈絡以省 token 並提升智慧（Reuse reasoning context） | 2 | [14](#ch14) |
| [#217](#e217) | 把脈絡管理做成使用者可見的指令（`/context`、`/compact`、`/btw`） | 1 | [14](#ch14) |
| [#218](#e218) | 多模態提示的五大基本功（Multimodal fundamentals） | 2 | [15](#ch15) |
| [#219](#e219) | ⭐ 多模態 prompt 的五招 troubleshooting | 1 | [15](#ch15) |
| [#220](#e220) | 多模態的 step-by-step 三種寫法 | 1 | [15](#ch15) |
| [#221](#e221) | 影像／文件輸入的物理品質也是 prompt 的一部分 | 2 | [15](#ch15) |
| [#222](#e222) | 影片：用 `MM:SS` 時間戳提問，並要求同時描述影音 | 1 | [15](#ch15) |
| [#223](#e223) | `media_resolution`：在 prompt 層決定「這張圖要看多細」 | 1 | [15](#ch15) |
| [#224](#e224) | 影像生成的七種可重用範本（Nano Banana） | 1 | [15](#ch15) |
| [#225](#e225) | 影像編輯的七種可重用範本 | 1 | [15](#ch15) |
| [#226](#e226) | 影像生成的六條 best practices（含「語意負向提示」） | 1 | [15](#ch15) |
| [#227](#e227) | Veo 影片 prompt 的六個構成要素 | 1 | [15](#ch15) |
| [#228](#e228) | Veo 的聲音提示三分法（對白／音效／環境音） | 1 | [15](#ch15) |
| [#229](#e229) | Veo：用描述性語言與臉部細節關鍵字 | 1 | [15](#ch15) |
| [#230](#e230) | Veo 影片延伸（extension）的限制 | 1 | [15](#ch15) |
| [#231](#e231) | xAI 影像：風格由 prompt 的形容詞決定，並用連鎖編輯迭代 | 1 | [15](#ch15) |
| [#232](#e232) | xAI 影片與影像生成：prompt 複雜度會影響生成時間；同 prompt 多變體用 `n` | 1 | [15](#ch15) |
| [#233](#e233) | 搜尋中的影像／影片理解要另外開，而且會影響脈絡 | 1 | [15](#ch15) |
| [#234](#e234) | ⭐ 給模型一個「裁切工具」來放大影像的相關區域 | 1 | [15](#ch15) |
| [#235](#e235) | TTS：標點就是韻律指令（Writing effective text） | 1 | [15](#ch15) |
| [#236](#e236) | Speech tags：行內標記與包夾標記兩種語法 | 1 | [15](#ch15) |
| [#237](#e237) | 語音體驗的四條高影響力建議 | 1 | [15](#ch15) |
| [#238](#e238) | ⭐ 前端設計：避開「AI slop」美學 | 1 | [15](#ch15) |
| [#239](#e239) | ⭐ 破解設計預設值的兩個可靠手法：指定具體替代方案／先提選項再建構 | 1 | [15](#ch15) |
| [#240](#e240) | 知道模型的「預設家風」才知道要覆寫什麼（Opus 4.8 house style） | 1 | [15](#ch15) |
| [#241](#e241) | 前端工程：指定框架／函式庫，並涵蓋六個面向 | 1 | [15](#ch15) |
| [#242](#e242) | 增量前端改動：明確要求保留既有設計系統 | 1 | [15](#ch15) |
| [#243](#e243) | Computer use 的影像解析度建議 | 1 | [15](#ch15) |
| [#244](#e244) | Prompt injection 被明確類比為 SQL injection | 1 | [16](#ch16) |
| [#245](#e245) | 用「輸入方式」而不是只有 prompt 文字來提高安全性 | 1 | [16](#ch16) |
| [#246](#e246) | 把任務改成本質上更低風險的形狀 | 1 | [16](#ch16) |
| [#247](#e247) | 對抗性測試與自動化紅隊（Adversarial testing） | 1 | [16](#ch16) |
| [#248](#e248) | ⭐ Computer Use 的 HITL 安全 system instruction（教科書級護欄範例） | 1 | [16](#ch16) |
| [#249](#e249) | Managed agents 的護欄：最小權限、人為覆核 | 1 | [16](#ch16) |
| [#250](#e250) | ⚠️ 即時濫用分類器可能中斷生成（Safeguards） | 1 | [16](#ch16) |
| [#251](#e251) | ⚠️⚠️ Prefill（預填回應開頭）已不再支援，以及四條遷移路徑 | 1 | [17](#ch17) |
| [#252](#e252) | Anthropic 遷移六要點（Migration considerations） | 1 | [17](#ch17) |
| [#253](#e253) | Claude Fable 5：單次請求會跑很久，要先改基礎設施 | 1 | [17](#ch17) |
| [#254](#e254) | 互動式編碼產品：把任務規格一次講完，減少來回 | 1 | [17](#ch17) |
| [#255](#e255) | Gemini 3 的核心提示原則（官方八條總表） | 1 | [17](#ch17) |
| [#256](#e256) | Gemini 3.x 的三條現行提示最佳實務 | 1 | [17](#ch17) |
| [#257](#e257) | Gemini 3.x 參數與行為更新總表 | 1 | [17](#ch17) |
| [#258](#e258) | 從 Gemini 2.5 遷移：把 CoT 鷹架換成 `thinking_level` | 1 | [17](#ch17) |
| [#259](#e259) | 客製工具被忽略時改用 `-customtools` 模型變體 | 1 | [17](#ch17) |
| [#260](#e260) | ⭐ OpenAI 的五步 prompt 遷移流程（不要整包重寫） | 1 | [17](#ch17) |
| [#261](#e261) | GPT-5.2 遷移：先換模型，先不動 prompt | 1 | [17](#ch17) |
| [#262](#e262) | Pro mode：什麼時候值得用 | 1 | [17](#ch17) |
| [#263](#e263) | xAI 遷移：明確選擇「要付多少推理」 | 1 | [17](#ch17) |
| [#264](#e264) | ⭐ 換到更強的模型時：簡化 system prompt、刪掉補丁式提示 | 1 | [17](#ch17) |
| [#265](#e265) | 用詞歧義：換掉一個詞就換一個結果（Disambiguate individual words） | 1 | [2](#ch2) |
| [#266](#e266) | 官方骨架 G：Qwen 六要素（背景／目的／風格／語氣／受眾／輸出） | 1 | [4](#ch4) |
| [#267](#e267) | 官方骨架 H：Mistral 的階層式章節骨架（角色句 → 可用資源 → 回應格式 → 範例） | 1 | [4](#ch4) |
| [#268](#e268) | 放負面範例並說明「為什麼錯」；範例順序也會被學走（Negative examples & ordering） | 1 | [5](#ch5) |
| [#269](#e269) | ⚠️ DeepSeek-R1：不要加 system prompt，所有指令放進 user prompt | 1 | [6](#ch6) |
| [#270](#e270) | 拿不到 system prompt 時：把整體脈絡串接在 user prompt 前面 | 1 | [6](#ch6) |
| [#271](#e271) | Llama 4 的官方建議 system prompt：降低「誤拒絕」與說教語氣（含禁用片語清單） | 1 | [6](#ch6) |
| [#272](#e272) | 用 prompt 文字切換思考模式：`/think` 與 `/no_think` 軟開關 | 1 | [7](#ch7) |
| [#273](#e273) | ⚠️ 思考模型禁止 greedy decoding；思考／非思考要用不同取樣參數 | 2 | [7](#ch7) |
| [#274](#e274) | 強制模型真的開始思考：讓回應以 `<think>\n` 開頭 | 2 | [7](#ch7) |
| [#275](#e275) | 多輪對話要不要把「思考內容」帶回去——三家立場不同 | 3 | [7](#ch7) |
| [#276](#e276) | DeepSeek 現行 API：思考模式預設開啟，`reasoning_effort` 只有 `high` 與 `max` 有實效 | 1 | [7](#ch7) |
| [#277](#e277) | 推理模型的官方 system prompt 模板（Mistral `[THINK]` 版） | 1 | [7](#ch7) |
| [#278](#e278) | temperature 怎麼挑：依任務性質分兩類；而且 `0` 不保證完全決定性 | 2 | [7](#ch7) |
| [#279](#e279) | Temperature 與 Top P 不要一起調（固定一個、調另一個） | 1 | [7](#ch7) |
| [#280](#e280) | 超出原生 context 長度時用 RoPE scaling（YaRN），不要硬塞 | 1 | [8](#ch8) |
| [#281](#e281) | 幻覺的三種成因與對應修法（Reducing hallucinations） | 1 | [9](#ch9) |
| [#282](#e282) | 結構化萃取抑制幻覺的四要素：任務指令＋格式模板＋注意事項＋輸出示例 | 1 | [9](#ch9) |
| [#283](#e283) | 把答案放在可解析的固定位置：`\boxed{}` 與 `"answer": "C"` | 2 | [10](#ch10) |
| [#284](#e284) | JSON 模式：光設參數不夠，prompt 裡必須出現 "json" 並附一個範例 | 1 | [10](#ch10) |
| [#285](#e285) | 分類任務的兩種輸出策略與取捨，並一定要寫兜底類別 | 1 | [10](#ch10) |
| [#286](#e286) | ⚠️ 不要叫模型數字數：把 `charCount` 當成輸入資料餵給它 | 1 | [10](#ch10) |
| [#287](#e287) | 在同一個 prompt 裡寫出任務步驟清單，並指定「只回傳哪一步」 | 5 | [12](#ch12) |
| [#288](#e288) | 多次生成取多數：Self-consistency，以及「評測要多跑取平均」 | 2 | [13](#ch13) |
| [#289](#e289) | 要模型評分時用「文字級距」而不是 1–5 數字級距（Prefer worded scales） | 1 | [13](#ch13) |
| [#290](#e290) | 上線之後持續收使用者回饋來改 prompt（Feedback loop） | 2 | [13](#ch13) |
| [#291](#e291) | 只生成必要的東西：模型「吃 token」比「吐 token」快 | 1 | [14](#ch14) |
| [#292](#e292) | 版面經濟學：表格比 JSON 省 token、連續空白會各自計費 | 1 | [14](#ch14) |

---
<a id="sec1"></a>
## 一、原始來源說明

本檔**不是**直接從網路重新擷取，而是彙整自 `docs/promptbooks/` 底下九份「一手擷取檔」。那九份檔案是在 **2026-07-30** 以 WebFetch／直接抓取官方 HTML／官方 `llms.txt` 匯出等方式逐頁擷取，內含**原文短引文＋可點的 deep link**。本檔在轉述時，**出處一律回填原始官方 URL**（不指向 promptbook 檔案本身）。

| Promptbook 檔案 | 廠商 | 擷取日 | 收錄技巧編號 | 條數 |
|---|---|---|---|---|
| `docs/promptbooks/anthropic.md` | Anthropic（Claude） | 2026-07-30 | `T-A01`–`T-A107` | 107 |
| `docs/promptbooks/openai.md` | OpenAI | 2026-07-30 | `T-O01`–`T-O142` | 142 |
| `docs/promptbooks/google.md` | Google（Gemini API / Gemini Enterprise Agent Platform / Workspace） | 2026-07-30 | `G-01`–`G-86` | 86 |
| `docs/promptbooks/xai.md` | xAI（Grok） | 2026-07-30 | `X-01`–`X-40` | 40 |
| `docs/promptbooks/qwen.md` | Qwen（阿里雲百煉 ＋ 官方模型卡） | 2026-07-30 | `Q-01`–`Q-22` | 22 |
| `docs/promptbooks/deepseek.md` | DeepSeek | 2026-07-30 | `D-01`–`D-14` | 14 |
| `docs/promptbooks/mistral.md` | Mistral | 2026-07-30 | `MI-01`–`MI-25` | 25 |
| `docs/promptbooks/meta-llama.md` | Meta（Llama） | 2026-07-30 | `L-01`–`L-22` | 22 |
| `docs/promptbooks/others.md` | Cohere ＋ Microsoft | 2026-07-30 | `CO-01`–`CO-15`、`MS-01`–`MS-20` | 35 |
| `docs/promptbooks/gap-analysis.md` | （分析檔，非來源） | 2026-07-31 | — | — |

### 統計表

| 廠商 | 來源技巧條數 | 落入本檔的獨立條目數（含與他廠合併者） | 備註 |
|---|---:|---:|---|
| Anthropic | 107 | 107 條全數映射 | 涵蓋 9 份官方文件（含 4 份模型專屬頁、2 份工具頁、1 篇官方部落格） |
| OpenAI | 142 | 142 條全數映射 | 涵蓋 13 份官方文件（Platform 指南 ＋ 4 份 Cookbook） |
| Google | 86 | 86 條全數映射 | 涵蓋 27 份 Gemini API 文件 ＋ 19 份 Vertex/Gemini Enterprise 文件 ＋ 4 份 Workspace 文件 |
| xAI | 40 | 40 條全數映射 | 涵蓋 35 份 docs.x.ai 頁面 |
| **Part 1 小計** | **375** | **條目 #1–#264** | 112 個來源編號因跨廠／跨頁教同一技巧而被併入既有條目 |
| Qwen（阿里） | 22 | 22 條全數映射 | 13 條開出（或共同開出）新條目、9 條併入既有條目；教材集中在阿里雲百煉中文教程 ＋ 官方模型卡 Best Practices |
| DeepSeek | 14 | 13 條映射到條目、1 條無可引用內容 | 8 條開出新條目、5 條併入既有條目；`D-14`（Prompt Library）**找不到**可引用內容 |
| Mistral | 25 | 25 條全數映射 | 13 條開出新條目、12 條併入既有條目；含四大廠沒有的「What to Avoid」整節 |
| Meta（Llama） | 22 | 22 條全數映射 | 5 條開出新條目、17 條併入既有條目；每個技巧附 Pros/Cons 是其特色 |
| Cohere | 15 | 15 條全數映射 | 2 條開出新條目、13 條併入既有條目 |
| Microsoft（Azure OpenAI / Foundry） | 20 | 20 條全數映射 | 3 條開出新條目、17 條併入既有條目 |
| **Part 2 小計** | **118** | **新增條目 #265–#292（28 條）** | 44 個來源編號開出（或共同開出）這 28 個新條目、73 個併入既有條目、1 個（`D-14`）無可引用內容 |
| **總計** | **493** | **本檔共 292 個編號條目** | 201 個來源編號因跨廠／跨頁／跨家教同一技巧而被併入既有條目 |

> **統計上的誠實揭露**：`anthropic.md` 自述「合計 102 條」、`openai.md` 自述「合計 139 條」，但兩檔**實際編號**分別到 `T-A107` 與 `T-O142`。本檔以**實際編號**為準（107 / 142），並在追溯附錄逐條列出，確保沒有任何一條被漏掉。

### 去重（dedup）統計

> 依**最終**的「出處」欄實際出現的廠商數重新統計（九家＋Microsoft 共 10 個來源機構）。

| 一個條目引用的廠商數 | 條目數 |
|---|---:|
| 6 家 | 2 |
| 5 家 | 2 |
| 4 家 | 9 |
| 3 家 | 14 |
| 2 家 | 54 |
| 單一廠商 | 210 |
| 無官方出處（#11，標為「找不到」） | 1 |
| **合計** | **292** |

---

<a id="sec2"></a>
## 二、來源健康度（Source health）— 誠實揭露

以下是 promptbook 擷取當下就被標記為**已下架／無法擷取／已標示 deprecated** 的文件。本檔在受影響的條目上都會於「出處」行標註。

| 文件 | 狀態（2026-07-30） | 本檔處理方式 |
|---|---|---|
| xAI《Prompt Engineering》指南 `https://docs.x.ai/docs/guides/grok-code-prompt-engineering` | **HTTP 404，整頁下架**；Wayback 兩次皆 429 限流無法取得存檔 | 不列為任何條目的出處。原頁摘要中的五個要點**無法一手驗證**，本檔**不收錄**（詳見條目 #264 下方的來源健康度附註）。後繼參考：https://docs.x.ai/developers/tools/code-execution#best-practices |
| OpenAI Help Center《Best practices for prompt engineering with the OpenAI API》 | **HTTP 403 Forbidden，三次皆失敗**（help.openai.com 擋自動擷取） | 「六大策略」框架列為條目 **#11**，出處標為「**找不到**」並附未驗證註記 |
| Google《Gemini 3 Developer Guide》`https://ai.google.dev/gemini-api/docs/gemini-3` | HTTP 200，但頁面**自我標示 deprecated**（"This page is deprecated and will be removed."） | 條目 **#258 / #259** 的出處行標註「原文件已標示下架」＋後繼參考 URL |
| Google《Gemini for Workspace Prompting guide 101》PDF（W2） | 檔案下載成功（4.2 MB），但擷取環境無 `pdftotext`，**內文未能解析** | 本檔**沒有任何內容宣稱來自該 PDF**；同一份手冊的官方網頁版（W1）已完整擷取並作為出處 |
| OpenAI `cookbook.openai.com` / `platform.openai.com` 舊網域 | 308 導向 `developers.openai.com` | 出處一律使用**新網域**；舊連結仍可點（會導向） |
| Anthropic prompt-engineering 子頁（`be-clear-and-direct`、`multishot-prompting`、`chain-of-thought`、`use-xml-tags`…） | 已全部合併到單一頁 `claude-prompting-best-practices` | 出處一律使用**合併頁 ＋ anchor** |
| DeepSeek《Prompt Library（提示庫）》`https://api-docs.deepseek.com/prompt-library/` | 頁面**只有 13 張卡片的標題與一句描述**，卡片沒有連結、點擊不導頁，**無法擷取任何完整提示詞** | 來源編號 `D-14` **不對應本檔任何條目**，於追溯表標為「**找不到**」。卡片標題（代碼改寫／內容分類／結構化輸出／角色扮演／模型提示詞生成…）已逐字保留在 `deepseek.md` D 節，但**不足以支撐任何技巧條目** |
| DeepSeek《Reasoning Model》`https://api-docs.deepseek.com/guides/reasoning_model` | **已下架**（2026-07-30 的 sitemap 已無此頁），內容由 `guides/thinking_mode` 取代 | R1 世代的溫度／系統提示建議只存在於 GitHub repo README，條目 #269 / #273 / #274 皆已標註「世代限定」並附現行 API 的對照條目 #276 |
| Meta llama-cookbook `getting-started/Prompt_Engineering_with_Llama.ipynb` | **主分支已移除**；僅剩 Llama 2 時代的 AWS Bedrock 版與 prompt-ops 教學 | 本檔**不引用**該 notebook；Meta 的教學主體改引官方文件站 `developer.meta.com/ai/docs/how-to-guides/prompting/` |
| Meta 官方 prompt 指南的 **ReAct 章節** | **當前版本沒有**（早期版本曾有） | **不收錄 —— 找不到**（避免引用已下架內容）。ReAct 型的行為指引請改引 #169 / #171 / #189 |
| Qwen 官方文件站 `https://qwen.readthedocs.io/en/latest/` | **沒有任何 prompting / sampling / best-practices 頁面**（目錄只有推理、部署、量化、訓練） | Qwen 的「怎麼寫 prompt」一律引阿里雲百煉中文教程，「怎麼用這個模型」一律引官方 Hugging Face 模型卡 |
| Meta `llama.com` 全站、Mistral `guides/prompting_capabilities`、OpenAI 舊網域 | 301 導向（`developer.meta.com` / `models/best-practices/prompt-engineering` / `developers.openai.com`） | 出處一律使用**新網址**；`llama.com` 為 JS 渲染頁，promptbook 以無頭瀏覽器完整渲染後擷取 |
| `developer.meta.com` 全站（Meta 的 20 條出處） | **對非 JS 客戶端一律回 HTTP 400**（2026-08-01 複查：連首頁 `developer.meta.com/` 也是 400，但仍回傳 380 KB 的 JS 外殼） | **不是死連結**，是機器人／JS 閘門。2026-08-01 以無頭 Chrome 實際渲染複查兩頁皆正常：`/ai/docs/how-to-guides/prompting/`（標題 `Prompt engineering \| How-to Guides`，章節含 Stylization／Formatting／Restrictions／Zero- and few-shot／Role-based／Chain-of-thought／Self-consistency／RAG／Limiting extraneous tokens／Program-aided language models／Reducing hallucinations，與 `L-02`–`L-18` 逐條吻合）、`/ai/docs/model-cards-and-prompt-formats/llama4/`（含 Suggested System Prompt，對應 `L-19`）。出處維持不變；**用 curl／腳本驗證連結時會看到 400，屬預期行為** |
| xAI《Grok Code Prompt Engineering》—— `curriculum.json` 仍在引用 | 同上（HTTP 404 已下架）。2026-08-01 複查其次要來源 `https://docs.x.ai/developers/models/grok-4.5`：**HTTP 200 但為純規格頁**（僅模態、脈絡長度、定價、rate limit），**沒有**「詳細 system prompt 帶來明顯提升」或「角色可任意順序」的敘述 | 兩項 xAI 專屬宣稱**找不到**可驗證出處，本檔**不收錄**；影響到的遊戲課程技巧 `role-04`、`iterate-04` 已於[附錄 C](#appC) 逐條標示 |

---

<a id="sec3"></a>
## 三、技巧總表

> **編號規則**：`#1`–`#264` 為 Part 1（四大廠）、`#265`–`#292` 為 Part 2（其餘五家）新開的條目。
> **Part 2 的條目是「插進對應章節」而不是附在檔尾**，所以同一章內會出現 Part 1 與 Part 2 的編號交錯（例如第 7 章的 #79 之後緊接著 #272）；編號在全檔仍是遞增的。
> **合併規則**：同一個技巧被多廠教到 → **一個條目、多個出處**，廠家差異寫在「使用方式」或「適用/注意」裡；真正不同的技巧才分開。

---

<a id="ch1"></a>
## 第 1 章　前置作業、模型選擇與方法論

<a id="e1"></a>
### 1. Prompt engineering 的定義：非決定性，一半藝術一半科學（What prompt engineering is）
- **使用方式**：把 prompt engineering 理解成「寫出能讓模型**穩定**產出合格內容的指令」的工程活動；因為輸出本質上非決定性，所以要靠反覆實測而不是一次寫對。心態上：先接受「同一個 prompt 不一定每次一樣」，再用測試把變異壓下來。
- **出處**：
  - OpenAI · Prompt engineering — https://developers.openai.com/api/docs/guides/prompt-engineering
  - Meta · Prompt engineering（How-to Guides） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：全部模型。原文：`"prompting to get your desired output is a mix of art and science."` Meta 補上一個**排序**立場：相對於 fine-tuning、distillation 或換更大的模型，調 prompt 通常是最快的一條路——`"optimizing your prompts often provides the fastest path to better results—achieving the performance improvements you need without additional model training or infrastructure costs."`（先調 prompt，再談訓練與換模型；同族判斷見 #3）

<a id="e2"></a>
### 2. 動手之前的三個前提（Before prompt engineering）
- **使用方式**：開始調 prompt 之前先確認三件事到位：(1) 這個用例的**成功標準**寫得出來、(2) 有辦法**實測**對照那個標準、(3) 手上有**一版可以改的 prompt 草稿**。沒有的話，先去建立這三件事再回來。
- **出處**：Anthropic · Prompt engineering overview — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview#before-prompt-engineering
- **適用/注意**：全部。原文：`"If not, spend time establishing that first."`

<a id="e3"></a>
### 3. 不是每個問題都該用 prompt engineering 解（When to prompt engineer）
- **使用方式**：遇到不合格的 eval 先問「這是 prompt 的問題嗎」——延遲與成本問題常常換一個模型就解決了，不必硬調 prompt。
- **出處**：Anthropic · Prompt engineering overview — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview#when-to-prompt-engineer
- **適用/注意**：全部。

<a id="e4"></a>
### 4. 選模型：推理模型像資深同事，GPT 模型像新進同事（Reasoning vs GPT models）
- **使用方式**：推理模型（o 系列、GPT-5.x 高 effort）給**高層次目標**就能做好；一般 GPT 模型需要**明確、逐條的指令**。實務上很多工作流是混用：「o 系列規劃、GPT 執行」。推理模型特別適合的七類用例：模糊任務、資訊萃取、複雜文件分析、agentic 規劃、視覺推理、code review、模型評估（官方舉例 F1 從 4o 的 0.12 拉到 o1 的 0.74）。
- **出處**：
  - OpenAI · Prompt engineering（Choosing a model / Prompting reasoning models） — https://developers.openai.com/api/docs/guides/prompt-engineering#choosing-a-model
  - OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：原文：`"A reasoning model is like a senior co-worker. … A GPT model is like a junior coworker."`；`"One model family isn't better than the other—they're just different."` 不確定時 `gpt-5.6` 是通用文字生成的強預設。

<a id="e5"></a>
### 5. 生產環境釘住 model snapshot 並建立測試套件（Pin snapshots + evals）
- **使用方式**：正式服務把模型釘在特定 snapshot（不要用會浮動的別名），同時建立測試與評估套件，換版或升級模型時用它監控 prompt 行為有沒有走樣。
- **出處**：OpenAI · Prompt engineering — https://developers.openai.com/api/docs/guides/prompt-engineering
- **適用/注意**：全部。

<a id="e6"></a>
### 6. 把 prompt 存在應用程式碼裡並版本控管（Version prompts in code）
- **使用方式**：不要依賴平台端的「可重用 prompt 物件」，把生產 prompt 放進程式碼：prompt builder 放在靠近功能的小模組、動態值用有型別的參數或 schema、改動前先加 fixture 與 eval、上線用 feature flag 或分階段發布。
- **出處**：OpenAI · Prompt engineering（Version prompts in code） — https://developers.openai.com/api/docs/guides/prompt-engineering#version-prompts-in-code
- **適用/注意**：⚠️ **API 上的可重用 prompt 物件正在淘汰**——2026-06-03 起弱化建立，`v1/prompts` 端點預計 **2026-11-30 關閉**。遷移指南：https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object

<a id="e7"></a>
### 7. 提示設計是迭代的，官方範本只是起點（Prompt engineering is iterative）
- **使用方式**：把官方指南與範本當「起手式」而不是答案，一定要拿自己的用例實測、觀察模型回應後再修。Mistral 把這件事講成一條工程紀律：**prompt 要像程式碼一樣被迭代與評估**——換一家模型、甚至只是同一家的一次小改版，都可能讓原本穩定的 prompt 走樣，所以要定期回頭重看自己的 prompt 並量測改動的影響。
- **出處**：
  - Google · Prompt design strategies — https://ai.google.dev/gemini-api/docs/prompting-strategies
  - Mistral · Prompting best practices（Advice） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：所有 Gemini 模型、所有場景。原文：`"These guidelines and templates are starting points."`／Mistral：`"different models from different labs, and even a simple update, can change the model behaviour and a consistent prompt may be impacted by these changes."`、`"do not hesitate to revisit your prompts and see the impact, similar to how you would iterate on your code and model training, you should iterate on your prompts and evaluate the impact of your changes."`

<a id="e8"></a>
### 8. 「最好的 prompt」不是最長的：不要過度工程化（Don't over-engineer）
- **使用方式**：判準是「用**最少必要結構**穩定達成目標」。不要一次把所有技巧全堆上去，挑能解決你當前問題的那幾條就好；要套用到每一個 session（而非每一次 prompt）的指令，搬到 CLAUDE.md／skills 之類的常駐機制去。
- **出處**：Anthropic · Blog: Best practices for prompt engineering（2025-11-10） — https://claude.com/blog/best-practices-for-prompt-engineering
- **適用/注意**：全部。原文：`"The best prompt isn't the longest or most complex. It's the one that achieves your goals reliably with the minimum necessary structure."` ＊該頁為部落格，promptbook 標註「WebFetch 擷取模型有重排版面」，引用時建議再人工核對原頁。官方另附疑難排解對照表：回應太籠統→加具體性／範例；離題→講清楚真正目標與動機；格式不一致→加 few-shot；太複雜不可靠→拆成多個 prompt；有多餘開場白→明確要求跳過；胡編亂造→明確允許說「我不知道」；只給建議不動手→用祈使句。

<a id="e9"></a>
### 9. 選技巧的決策框架（Decision framework）
- **使用方式**：照這個順序自問：① 請求夠清楚明確嗎？不夠就先修清晰度 → ② 任務簡單嗎？只用核心技巧 → ③ 需要特定格式嗎？用範例（或結構化輸出）→ ④ 任務複雜嗎？考慮拆解（chaining）→ ⑤ 需要推理嗎？用 extended thinking 或 CoT。
- **出處**：Anthropic · Blog: Best practices for prompt engineering — https://claude.com/blog/best-practices-for-prompt-engineering
- **適用/注意**：全部。＊部落格來源，同 #8 的擷取品質註記。原文第 3 步提到 prefill，但 prefill 在 Claude 4.6+ 已不支援（見 #251）。

<a id="e10"></a>
### 10. 元原則：能用參數或程式保證的，不要用 prompt 拜託（Use parameters, not pleading）
- **使用方式**：凡是有 API 參數或程式手段可以「保證」的事，就不要寫進 prompt 求模型配合。三個官方實例：① 只想查特定網站 → 用 `allowed_domains`（上限 5 個，不能與 `excluded_domains` 併用），不要在 prompt 寫「只看 xxx.com」；② 合規宣告、IVR 提示這種**必須一字不差**的句子 → 用 `force_message` 直接 TTS 合成，完全不經模型；③ 專有名詞常被聽錯／唸錯 → 用 `keyterms`（最多 100 個詞、每詞 50 字）偏向 ASR、用 `replace`（如 `{"Acme Mobile": "Acme Mobull"}`）改發音而不動逐字稿。
- **出處**：
  - xAI · Web Search — https://docs.x.ai/developers/tools/web-search#only-search-in-specific-domains
  - xAI · Speech to Speech（Force Message） — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#force-message
  - xAI · Speech to Speech（keyterms / replace） — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#keyterms
- **適用/注意**：X Search 的等價參數為 `allowed_x_handles` / `excluded_x_handles`（各上限 20）與 `from_date` / `to_date`（ISO8601）。這條是全檔最可移植的元原則之一：**prompt 的邊界就在「模型可以不聽話」的地方**。

<a id="e11"></a>
### 11. OpenAI「六大策略」框架（Six strategies）— ⚠️ 出處**找不到**
- **使用方式**：業界廣泛流傳的 OpenAI 六大策略：write clear instructions／provide reference text／split complex tasks into simpler subtasks／give the model time to think／use external tools／test changes systematically。這六件事在本檔其他條目都有**可驗證的**官方對應（依序約為 #12、#23、#187、#59、#154、#5），建議實作時引用那些條目的出處。
- **出處**：**找不到** —— OpenAI Help Center《Best practices for prompt engineering with the OpenAI API》（https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api）於 2026-07-30 擷取時**回傳 HTTP 403 Forbidden，三次皆失敗**。上述六項來自搜尋引擎摘要，**未經一手驗證，不得當成官方引文使用**。（原文件無法驗證 — 找不到，後繼參考: https://developers.openai.com/api/docs/guides/prompt-engineering）
- **適用/注意**：這是 `curriculum.json` 目前引用的來源之一，需要人工用瀏覽器補齊或改引其他條目。

---

<a id="ch2"></a>
## 第 2 章　清晰、具體與正面表述

<a id="e12"></a>
### 12. 把話說清楚、直接說（Be clear and direct ／ 黃金法則）
- **使用方式**：把模型當成「聰明但剛到職、不懂你們內規的新同事」——想要什麼就明講，包括**輸出格式與限制**；步驟的順序或完整性重要時，用編號清單或條列把步驟排出來。想要「超出基本要求」的成果就直接寫，不要指望它從模糊的 prompt 猜。**黃金法則**：把 prompt 拿給一個對這個任務背景很少的同事看，如果他會困惑，模型也會。
  - 官方對照：弱 `Create an analytics dashboard` → 強 `Create an analytics dashboard. Include as many relevant features and interactions as possible. Go beyond the basics to create a fully-featured implementation.`
  - Google Workspace 版對照：`"Training plan."` → `"Write a training plan for the sales team for the launch of a brand new product."`
- **出處**：
  - Anthropic · Prompting best practices（Be clear and direct） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct
  - Google · Prompt design strategies（Clear and specific instructions） — https://ai.google.dev/gemini-api/docs/prompting-strategies#clear-and-specific-instructions
  - Google · Give clear and specific instructions（Vertex / Gemini Enterprise） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/clear-instructions
  - Google · Tips to write prompts for Gemini（Workspace 說明中心） — https://support.google.com/a/users/answer/14200040
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（構建清晰明確的 Prompt） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Mistral · Prompting best practices（Structure） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Meta · Prompt engineering（Crafting effective prompts） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：四廠共識級的第一原則。Google 的三原則版本：`"Tell the model what to do." / "Be clear and specific." / "Specify any constraints or formatting requirements for the output."`；Workspace 五條版本再加上「用自然語言」「提供脈絡」「用具體相關的關鍵字」「把複雜任務拆成分開的 prompt」。同源的工具版檢查見 #143（intern test）。**Part 2 的三家把同一條原則講得更白**：Qwen 把寫 prompt 類比成「指派工作給同事」，並直言 `构建一个清晰具体的 Prompt 是充分发挥大模型能力的最重要一步。`（官方對照：模糊版 `我想推广公司的新产品……帮我创建一条微博帖子。` → 清晰版 `请为我司“阿里云百炼”最新推出的“Zephyr Z9”轻薄便携手机设计一条吸引眼球的微博推广帖。內容需彰显Zephyr Z9的独特卖点……`）；Mistral 給的自我檢查法則與黃金法則同構——`"imagine you're writing for someone with no prior context—they should be able to understand and execute the task solely by reading the prompt."`；Meta 則要求 `"Be clear and concise… Avoid using jargon or technical terms that may confuse the model."`，並補一句 `"Detailed, explicit instructions produce better results than open-ended prompts. Giving explicit instructions is like placing rules and restrictions on how the model responds to your prompt."`

<a id="e13"></a>
### 13. 要求要具體：官方 good／bad 對照（Be specific in requests）
- **使用方式**：把「分析一下這份資料」換成「算出這些變數的相關係數矩陣，並標出 0.7 以上的相關」。同時**把資料格式與限制講出來**，資料本身也附上。
  - 官方對照：❌ `"Analyze this data"` → ✅ `"Calculate the correlation matrix for these variables and highlight correlations above 0.7"`
  - 官方脈絡寫法：`Here's my CSV data with columns: date, revenue, costs / Please calculate monthly profit margins and identify the best-performing month. / Data: [['2024-01', 50000, 35000], ...]`
- **出處**：
  - xAI · Code Execution Tool（Best Practices） — https://docs.x.ai/developers/tools/code-execution#best-practices
  - Cohere · Advanced Prompt Engineering Techniques（Defining the Task） — https://docs.cohere.com/docs/advanced-prompt-engineering-techniques
  - Microsoft · Prompt engineering techniques（Best practices） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：這是 xAI 全站唯一一組標題就叫「Best Practices」的**文字提示**教學。同節第 3 條建議「數學計算用低 temperature（0.0–0.3）、用 `grok-4.5` 這類推理模型產程式碼」——⚠️ 這與 Google Gemini 3.x「不要動取樣參數」（#76）**方向相反**，是現成的廠家差異素材。Cohere 補一個很實用的觀察：**不要直接把問題丟出去，要先把任務定義清楚**（給背景知識、領域術語與相關範例，同時控制 prompt 長度不要淹沒模型），因為模型一旦先講出一個錯的斷言，後面會想辦法自圓其說——`"Without a definition of the task or other additional context the model can sometimes make an incorrect assertion and then attempt to reconcile what has already been generated."` Microsoft 的兩條同義守則可以當口訣：`"Be specific. Leave as little to interpretation as possible. Restrict the operational space."` 與 `"Be descriptive. Use analogies."`

<a id="e14"></a>
### 14. 說「要做什麼」而不是「不要做什麼」（Positive framing）
- **使用方式**：把禁令改寫成正面指令，這是控制輸出格式最有效的手法之一。
  - 官方對照：❌ `Do not use markdown in your response` → ✅ `Your response should be composed of smoothly flowing prose paragraphs.`
- **出處**：
  - Anthropic · Prompting best practices（Control the format of responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
  - Cohere · A Guide to Crafting Effective Prompts（Do vs. Do Not Do） — https://docs.cohere.com/docs/crafting-effective-prompts
- **適用/注意**：所有現行 Claude 模型。同一原則在影像領域叫「語意負向提示」（#226），在語氣控制上叫「正面示範勝過負面指令」（#112、#118）。Cohere 的版本更細膩——**不是不能寫禁止句，而是禁止句不能單獨存在**：先寫「要做什麼」，再補「不要做什麼」。官方對照：不要只寫 `"avoid extracting full sentences from the input text"`，要寫 `Paraphrase the content into re-written, easily digestible sentences. Do not extract full sentences from the input text.`（原則句：`"Be explicit in exactly what you want the model to do. Be as assertive as possible and avoid language that could be considered vague."`）

<a id="e15"></a>
### 15. 明確寫出限制（Constraints）
- **使用方式**：在 prompt 裡寫清楚「怎麼讀」與「怎麼生成」的限制——長度、範圍、可以做什麼與不可以做什麼。官方最短範例：`Summarize this text in one sentence:`。限制要**可量測**，不要用「簡短一點」這種主觀形容詞。
- **出處**：
  - Google · Prompt design strategies（Constraints） — https://ai.google.dev/gemini-api/docs/prompting-strategies#constraints
  - Mistral · Prompting best practices（What to Avoid） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Meta · Prompt engineering（Explicit instructions / Restrictions） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：全部。「用可量測的限制取代主觀形容詞」在 Google 的 Prompt health checklist（#199）中被列為 Ambiguity 問題：`"write a summary of 3 sentences or less"` 優於 `"write a brief summary"`。Mistral 把要避開的模糊字眼分成兩類並要求換成客觀量測：`"Avoid blurry quantitative adjectives: 'too long', 'too short', 'many', 'few', etc. Instead, provide objective measures."`、`"Avoid blurry words like 'things', 'stuff', 'write an interesting report', 'make it better', etc. Instead, state exactly what you mean by 'interesting', 'better', etc."` Meta 則把「明確指令」直接定義成**在模型身上加規則與限制**，並給出可直接檢測的限制句：`Only use academic papers.` / `Never give sources older than 2020.`（官方 A/B：加了這兩句之後，引用來源從 2017 年變成只剩 2020 年以後）。⚠️ 但「限制」不等於「叫模型自己數字數」，見 #286。

<a id="e16"></a>
### 16. 用祈使句要求「動手做」而不是「給建議」（Ask for action, not suggestions）
- **使用方式**：現行模型指令跟隨很精確——你問「可以建議一些修改嗎」，它可能真的只給建議。要它動手就用祈使句。
  - 官方對照：❌ `Can you suggest some changes to improve this function?` → ✅ `Change this function to improve its performance.` / `Make these edits to the authentication flow.`
- **出處**：Anthropic · Prompting best practices（Tool usage） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用/注意**：所有現行 Claude 模型。想在系統層設定傾向，見 #169 的 `<default_to_action>` / `<do_not_act_before_instructions>`。

<a id="e17"></a>
### 17. 新一代模型更「照字面」執行：適用範圍要明講（Literal instruction following）
- **使用方式**：新模型**不會**把一項指令默默推廣到另一項，也不會推測你沒提的需求。要它廣泛套用就把範圍寫出來：`Apply this formatting to every section, not just the first one`。
- **出處**：
  - Anthropic · Prompting Claude Sonnet 5（More literal instruction following） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#more-literal-instruction-following
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：Claude Sonnet 5 / Opus 4.8；GPT-4.1 起。副作用見 #196——你說「只回報高嚴重度」，它就真的只回報高嚴重度。

<a id="e18"></a>
### 18. 不要用全大寫、賄賂、情緒勒索或急迫語氣（No all-caps / bribes / pressure）
- **使用方式**：先寫正常語氣的 prompt，真的不行再考慮加強；不要一開始就用 `MUST`、全大寫、「做不好會有很糟的事發生」這類話術。
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1 起。⚠️ Google 講得更重：第一代基礎模型在某些情況會因為 `"very bad things will happen if you don't get this correct"` 這類話而改善，但**現在的模型不會再改善，很多情況反而更差**（見 #199 的 Overt manipulation）。Anthropic 的對應建議是把 `CRITICAL: You MUST…` 降級成 `Use this tool when…`（見 #156）。

<a id="e19"></a>
### 19. 用自然語言、完整句子；並把 Gemini 當成你的 prompt 編輯器（Workspace 六條）
- **使用方式**：像跟人講話一樣寫完整句子；具體並反覆迭代；簡短但具體、避免行話；把它當對話（用追問慢慢修）；引用你自己的檔案（Drive／`@` 符號）；還有一條可以直接照抄的 meta-prompt：`Make this a power prompt: [original prompt text here]`（中文官方版：「請建議更有效的提示：[在此插入原始提示文字]」）。
- **出處**：Google · Gemini for Workspace: Prompting guide 101 — https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/
- **適用/注意**：面向一般使用者（非 API）。中文版頁面：https://workspace.google.com/intl/zh-TW/resources/ai/writing-effective-prompts/

<a id="e20"></a>
### 20. 量化基準：最成功的 prompt 平均約 21 個字（The 21-word finding）
- **使用方式**：Google 團隊研究發現最成功的 prompt 平均約 **21 個字**，而一般人第一次嘗試通常**少於 9 個字**——所以「再多寫一句」通常就是最便宜的改善。同文另兩條：**換不同 persona 做 A/B 比較**（例如同一個訓練主題，分別叫它當「同事」與當「老師」，比較結果）；在側邊欄寫 prompt 時可以用 `@` 引用 Docs／Sheets。
- **出處**：Google · Blog: 5 tips for writing great prompts（2024-07-29） — https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/
- **適用/注意**：這是難得的官方**量化**基準，適合當「太短的 prompt」的判準。

<a id="e21"></a>
### 21. 四種輸入型態：問題／任務／實體／補完（Input types）
- **使用方式**：寫 prompt 前先想清楚你給的是哪一種輸入，四種寫法不一樣：
  - **Question（問題）**：`What's a good name for a flower shop that specializes in selling bouquets of dried flowers? Create a list of 5 options with just the names.`
  - **Task（任務）**：`Give me a simple list of just the things that I must bring on a camping trip. The list should have 5 items.`
  - **Entity（實體）**：`Classify the following items as [large, small]:` ＋ `Elephant / Mouse / Snail`
  - **Completion（補完）**：給半截讓模型續寫（見 #45）。
- **出處**：Google · Prompt design strategies（Input types） — https://ai.google.dev/gemini-api/docs/prompting-strategies#input
- **適用/注意**：Google 特有的分類法，適合當「這題該怎麼問」的入門分流。

<a id="e265"></a>
### 265. 用詞歧義：換掉一個詞就換一個結果（Disambiguate individual words）
- **使用方式**：prompt 裡定義任務的關鍵詞，要挑「只有一種解釋」的那一個。官方案例是中文特有的一層：要模型判斷文件是哪一國文字時，把「語言」改成「語種」——因為「語言」也可以指書面語／口頭語，「語種」沒有這個歧義。同一個優化案例還做了兩件事：把塞在句子中間的長文件 `${documents}` 用分隔符抽成獨立內容區塊；把散落在「## 限制」裡的冗餘要求拆回框架中正確的欄位。
  - 官方原文：`将“语言”替换为“语种”。因为“语言”这个词有歧义，不一定代指的是英语、法语，也可以是书面语言、口头语言。语种就没有这个歧义。`
  - 官方原文：`${documents}部分是一段很长的话，放在某句话中并不合适。应该使用分隔符标记切分出来，作为一个重要的内容块。`
- **出處**：Qwen（阿里雲百煉）· 文生文 Prompt 指南（優化案例一） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- **適用/注意**：Qwen 全系列（案例以 qwen-turbo 為背景）。這是四大廠英文文件不會教、中文使用者卻特別有感的一層——**歧義不只發生在句子層級，也發生在單詞層級**。與 Google 除錯清單的 Ambiguity（#200 第 6 條）、Mistral 的「避免模糊字眼」（#15）同族，但顆粒度更細。

---

<a id="ch3"></a>
## 第 3 章　脈絡、動機與背景資訊

<a id="e22"></a>
### 22. 說明「為什麼」：給指令背後的動機（Add context / give the reason）
- **使用方式**：解釋這條規則為什麼重要，模型會從解釋中舉一反三，給出更貼題的回應。
  - 官方對照：❌ `NEVER use ellipses` → ✅ `Your response will be read aloud by a text-to-speech engine, so never use ellipses since the text-to-speech engine will not know how to pronounce them.`
  - 可填空模板（Fable 5 頁）：`I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request].`
- **出處**：
  - Anthropic · Prompting best practices（Add context to improve performance） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#add-context-to-improve-performance
  - Anthropic · Prompting Claude Fable 5（Give the reason, not only the request） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#give-the-reason-not-only-the-request
- **適用/注意**：所有現行 Claude 模型。原文：`"Claude is smart enough to generalize from the explanation."` 影像生成也有同構建議（見 #226 的 "Provide context and intent"）。

<a id="e23"></a>
### 23. 把模型需要的資訊直接放進 prompt（Add context / RAG）
- **使用方式**：不要假設模型知道你的產品規格、公司政策或使用者歷史——把它需要的文件貼進 prompt，並加一句限縮指令。Google 官方 Wi-Fi 路由器燈號範例：不給文件時輸出泛用排障步驟，把燈號對照表貼進去並加上 `Answer the question using the text below. Respond with only the text provided.` 之後就只回答該貼上的那一句。做法上可以是自己查向量庫後把文字放進 prompt，也可以用內建的 file search 工具（這整套技術叫 RAG）。
- **出處**：
  - Google · Prompt design strategies（Add context） — https://ai.google.dev/gemini-api/docs/prompting-strategies#context
  - OpenAI · Prompt engineering（Include relevant context information） — https://developers.openai.com/api/docs/guides/prompt-engineering#include-relevant-context-information
  - Meta · Prompt engineering（Retrieval-augmented generation） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Mistral · Prompting best practices（Personalization / Providing facts） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Cohere · A Guide to Crafting Effective Prompts（Context / grounded generation） — https://docs.cohere.com/docs/crafting-effective-prompts
  - Microsoft · Prompt engineering techniques（Provide grounding context） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：要注意 context window 上限（依模型從 10 萬到 100 萬 tokens 不等）。嚴格 grounding 的寫法見 #89；長脈絡的擺放位置見 #79。Part 2 的四家補了四個實作層細節：**Meta** 用「梅洛帕克三天氣溫」示範 RAG 的完整效果——貼上資料後答得出來，問到**沒提供的日期時模型會如實說沒有**（`"Sorry, I don't have information about the temperature in Menlo Park on 2023-07-18."`），並指出 RAG `"is more affordable than fine-tuning, which might also negatively impact the foundational model's capabilities."`；**Mistral** 的最小可行寫法是在 prompt 裡開一個 `# Facts` 清單把事實列進去（`"It's important to use clear and concise language when presenting these facts."`）；**Cohere** 建議不要把文件貼進訊息，改走 `documents` 參數的 grounded generation（好處是 `"Less incorrect information. / More directly useful responses. / Responses with precise citations for source tracing."`），並給出具體的 chunk 大小 —— **100–400 字**的 key-value 片段；**Microsoft** 給了一條選材原則：`"the closer you can get your source material to the final form of the answer you want, the less work the model needs to do, which means there's less opportunity for error."`

<a id="e24"></a>
### 24. 有效脈絡的兩種型態：背景資訊 vs 規則（Two kinds of context）
- **使用方式**：分清楚你放進去的脈絡是哪一種——(a) **背景資訊**：模型生成時要參照的資料；(b) **規則／預先寫好的回應**：用來操控模型行為的指令。兩者混在一起最容易造成模型把資料當指令執行。
- **出處**：Google · Add contextual information（Vertex / Gemini Enterprise） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/contextual-information
- **適用/注意**：這個二分正是 prompt injection 的結構性防線（見 #32 的 `<context>` 標註與 #244）。
---

<a id="ch4"></a>
## 第 4 章　結構、分隔符與官方 prompt 骨架

<a id="e25"></a>
### 25. 用 XML 標籤把 prompt 分區（Structure prompts with XML tags）
- **使用方式**：當 prompt 同時混了指令、脈絡、範例與變動輸入，就把每一塊用具描述性的標籤包起來（`<instructions>`、`<context>`、`<input>`、`<examples>`）。標籤名要跨 prompt 一致；內容有天然層級時就巢狀。XML **屬性**還可以帶 metadata，而且可以在指令裡被引用（例如「只看 `type="policy"` 的那幾份」）。
  - 官方巢狀寫法：`<documents><document index="1">…</document></documents>`
  - OpenAI few-shot 版：`<examples><example1 type="Abbreviate"><input>San Francisco</input><output>SF</output></example1></examples>`
- **出處**：
  - Anthropic · Prompting best practices（Structure prompts with XML tags） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#structure-prompts-with-xml-tags
  - OpenAI · Prompt engineering（Message formatting with Markdown and XML） — https://developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：`"XML is convenient for precisely wrapping sections with metadata and enabling nesting."`（OpenAI）／`"Use consistent, descriptive tag names across your prompts."`（Anthropic）。⚠️ 但見 #26。

<a id="e26"></a>
### 26. ⚠️ XML 標籤對現代模型「已較不必要」（XML: less necessary now）
- **使用方式**：Anthropic 官方部落格把 XML 標籤歸類在「對現代模型較不必要、但特定情境仍有用」——仍然值得用在**極複雜的混合內容 prompt**、需要**絕對確定內容邊界**、或使用**舊版模型**時；其餘情況「清楚的標題、空白與明確的語言」通常一樣好。
- **出處**：Anthropic · Blog: Best practices for prompt engineering — https://claude.com/blog/best-practices-for-prompt-engineering
- **適用/注意**：⚠️ 這與主文件頁 #25（仍把 XML 標籤列在 General principles）**語氣不同**。實作時應以主文件頁為準，把本條當成「進階提醒」。＊部落格來源，擷取經重排。

<a id="e27"></a>
### 27. 用 Markdown 標題、清單與章節標題當分隔符（Markdown delimiters）
- **使用方式**：用 `#` / `##` 標題標示大區塊與子區塊、用清單傳達層級、用 inline backtick 精確標示檔案／函式／類別名。推理模型指南把它與 XML 標籤、章節標題並列為「釐清輸入結構」的三種分隔符。
- **出處**：
  - OpenAI · Prompt engineering（Message formatting with Markdown and XML） — https://developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml
  - OpenAI · Reasoning best practices（Use delimiters） — https://developers.openai.com/api/docs/guides/reasoning-best-practices
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Mistral · Prompting best practices（Formatting） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Cohere · A Guide to Crafting Effective Prompts（Formatting and Delimiters） — https://docs.cohere.com/docs/crafting-effective-prompts
- **適用/注意**：Google 補一條重要規則：**XML 與 Markdown 擇一貫徹，不要在同一個 prompt 混用**（見 #255）。Mistral 給了「為什麼是 Markdown／XML」的三個理由，第三個很少有廠商明講：`"Readable: Easy for humans to scan. / Parsable: Simple to extract information programmatically. / Familiar: Likely seen massively during the model's training."`，並補一句「好格式不只幫模型，也幫維護的人」——`"Good formatting not only helps the model understand the prompt but also makes it easier for developers to iterate and maintain the application."` Cohere 則把規則收斂成一句可執行的：不同性質的內容（指令、脈絡、資源）要用**帶說明文字的標頭**分開，而且 `"Headers can be made more clear by prepending them with ##."`（官方骨架：`## Instructions` ＋ `## Input Text`）。

<a id="e28"></a>
### 28. 前綴標籤與 BEGIN/END、{} 分隔符（Prefixes and section delimiters）
- **使用方式**：簡單 prompt 用「前綴＋冒號」標籤（`TASK:`、`CLASSES:`、`OBJECTS:`）就夠；複雜 prompt 才上 XML，長資料段落可以用 `BEGIN`/`END` 或 `{}` 包起來，讓它明顯不是指令。
- **出處**：
  - Google · Structure prompts（Vertex / Gemini Enterprise） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/structure-prompts
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（使用分隔符號區分單元） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Microsoft · Prompt engineering techniques（Add clear syntax） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：**Qwen 是少數把「怎麼挑分隔符」寫成明文規則的**：要挑自然語言中罕見、辨識度高的字元組合（`###`、`===`、`>>>`），目的是讓模型知道那是邊界而不是普通標點——`分隔符的选择应着眼于那些在自然语言文本中罕见的、独特的字符组合，例如：###、===、>>>等。……关键在于其辨识度高，确保模型能够明确区分这些符号是作为内容区域的界限标识，而非文本中的普通标点或语法组成部分。`，而且**任務越複雜，分隔符的收益越大**（`随着任务复杂度的增加，合理利用分隔符越能提升 LLM 的表现。`）。Microsoft 補三個實作細節：分隔符（例如 `---`）可以**同時當成生成的停止條件**、章節標頭與特殊變數用**全大寫**做區別、`"If you're not sure what syntax to use, consider using Markdown or XML."`（理由同 #27：模型訓練時看過大量這兩種格式）。同頁的官方護欄句值得照抄：`If there is no data that can help answer the question, respond with "I do not have this information. Please contact customer service".`／`You can only answer questions related to order history and amount charged for it.`／`For everything else, please redirect to the customer service agent.`

<a id="e29"></a>
### 29. 內容 vs 結構的二分（Content and structure）
- **使用方式**：檢查 prompt 時分兩層看：**內容**——完成任務所需的資訊有沒有全部給到；**結構**——就算資訊都在，排序、標籤、分隔符也會影響模型能不能正確解析。兩層都要修。
- **出處**：Google · Overview of prompting strategies — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#how-to-create-an-effective-prompt
- **適用/注意**：這是所有「骨架類」技巧的上位概念。

<a id="e30"></a>
### 30. Prompt 的組成元件與別名對照（Prompt components & aliases）
- **使用方式**：Google 給了兩張表。**四組成版**（入門）：Task（必要）／System instructions（選）／Few-shot examples（選）／Contextual information（選）。**十二元件版**（完整，含業界別名，方便你在不同文件間對得上號）：
  | 元件 | 定義 | 別名 |
  |---|---|---|
  | Objective | 你要模型達成什麼 | mission / goal |
  | Instructions | 逐步怎麼做 | task / steps / directions |
  | System instructions | 跨任務控制模型行為的技術性指令 | — |
  | Persona | 模型扮演誰 | role / vision |
  | Constraints | 生成時必須遵守的限制 | guardrails / boundaries / controls |
  | Tone | 回應語氣 | style / voice / mood |
  | Context | 執行任務要參照的資訊 | background / documents / input data |
  | Few-shot examples | 回應該長什麼樣的範例 | exemplars / samples |
  | Reasoning steps | 叫模型解釋推理 | thinking steps |
  | Response format | 想要的輸出格式 | structure / presentation / layout |
  | **Recap** | **在 prompt 結尾簡短重述關鍵限制與輸出格式** | — |
  | Safeguards | 把問題錨回 bot 的任務範圍 | safety rules |
- **出處**：
  - Google · Introduction to prompting — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/introduction-prompt-design
  - Google · Overview of prompting strategies（Components of a prompt） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#components-of-a-prompt
  - Microsoft · Prompt engineering techniques（Prompt components） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：**`Recap` 是 Google 特有的元件**（在結尾重述限制與格式），與 OpenAI「長文指令頭尾各放一次」（#80）是同一個效應的兩種說法。另注意官方直言：`"Gemini models often perform well without the need for prompt engineering, especially for straightforward tasks."` **Microsoft 的五元件版本**（依常用程度排序）補了兩個 Google 表裡沒有的名字：`Instructions`（指令）／`Primary content`（要被處理或轉換的主要文字）／`Examples`／**`Cue`（引子：放在 prompt 結尾、模型可以接著長下去的開頭，`"Cues act as the 'jumpstart' for the output of the model"`，用法見 #46）**／**`Supporting content`（輔助內容：當前日期、使用者名稱與偏好這類「不是任務目標、但會影響輸出」的資訊）**。

<a id="e31"></a>
### 31. 官方骨架 A：Google Gemini Enterprise 的 `<OBJECTIVE_AND_PERSONA>` 七段範本
- **使用方式**：直接照抄這個骨架填空（後五段是選配）：
  ```
  <OBJECTIVE_AND_PERSONA>
  You are a [insert a persona, such as a "math teacher" or "automotive expert"]. Your task is to...
  </OBJECTIVE_AND_PERSONA>

  <INSTRUCTIONS>
  To complete the task, you need to follow these steps:
  1. …
  </INSTRUCTIONS>

  ------------- Optional Components ------------

  <CONSTRAINTS>   Dos and don'ts   </CONSTRAINTS>
  <CONTEXT>       The provided context   </CONTEXT>
  <OUTPUT_FORMAT> The output format must be …   </OUTPUT_FORMAT>
  <FEW_SHOT_EXAMPLES> Input: / Thoughts: / Output: </FEW_SHOT_EXAMPLES>
  <RECAP>         Re-emphasize the key aspects, especially the constraints, output format, etc.   </RECAP>
  ```
- **出處**：Google · Overview of prompting strategies（Sample prompt template） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#sample-prompt-template
- **適用/注意**：注意 `<FEW_SHOT_EXAMPLES>` 內建 `Thoughts:` 一欄——範例裡示範推理，呼應 #46。

<a id="e32"></a>
### 32. 官方骨架 B：Gemini 3 的 XML 版與 Markdown 版（擇一貫徹）
- **使用方式**：兩種都是官方原文骨架，**選一種就一路用到底**。XML 版最重要的是 `<context>` 那一行的註解——包起來之後**模型會知道那是資料而不是指令**（結構性的注入防線）：
  ```
  <role>You are a helpful assistant.</role>
  <constraints>1. Be objective.  2. Cite sources.</constraints>
  <context>[Insert User Input Here - The model knows this is data, not instructions]</context>
  <task>[Insert the specific user request here]</task>
  ```
  Markdown 版：`# Identity` / `# Constraints` / `# Output format`。
  另有一組更完整的「System Instruction ＋ User Prompt」綜合範本：system 端拆成 `<role>` / `<instructions>`（Plan → Execute → Validate → Format 四步）/ `<constraints>`（Verbosity、Tone）/ `<output_format>`；user 端則是 `<context>` ＋ `<task>` ＋ `<final_instruction>`。
- **出處**：
  - Google · Prompt design strategies（Structured prompting examples） — https://ai.google.dev/gemini-api/docs/prompting-strategies#structured_prompting_examples
  - Google · Prompt design strategies（Example template combining best practices） — https://ai.google.dev/gemini-api/docs/prompting-strategies#example_template_combining_best_practices
- **適用/注意**：Gemini 3.x。

<a id="e33"></a>
### 33. 官方骨架 C：OpenAI developer message 四段（Identity → Instructions → Examples → Context）
- **使用方式**：developer 訊息照這個順序寫：① **Identity**（助手的用途、溝通風格、目標）→ ② **Instructions**（產生回應的規則、該做與不該做）→ ③ **Examples**（輸入／輸出範例）→ ④ **Context**（訓練資料外的專有資料）。**動態脈絡放在 prompt 尾端附近**，常重複使用的內容放開頭（配合 prompt caching，見 #208）。
- **出處**：OpenAI · Prompt engineering — https://developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml
- **適用/注意**：全部 OpenAI 模型。

<a id="e34"></a>
### 34. 官方骨架 D：GPT-4.1 的七段模板
- **使用方式**：
  ```
  # Role and Objective
  # Instructions
  ## Sub-categories for more detailed instructions
  # Reasoning Steps
  # Output Format
  # Examples
  ## Example 1
  # Context
  # Final Instructions and Step-by-Step Thinking Prompt
  ```
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1。注意最後一段刻意放在 Context 之後——這正是 #80「指令頭尾各放一次」的落地。

<a id="e35"></a>
### 35. 官方骨架 E：GPT-5.6 的八段模板（含 Stop rules）
- **使用方式**：OpenAI 目前最新版的複雜 prompt 起手結構：
  ```
  Role:             [the model's function and context]
  Personality:      [tone and collaboration style]
  Goal:             [user-visible outcome]
  Success criteria: [what must be true before the final answer]
  Constraints:      [policy, safety, business, evidence, and side-effect limits]
  Tools:            [which tools to use, when, and what not to use]
  Output:           [sections, length, format, and tone]
  Stop rules:       [when to retry, fallback, abstain, ask, or stop]
  ```
- **出處**：OpenAI · Prompting guidance for GPT-5.6（Suggested prompt structure） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6 系列。與 #34 對照可以看出官方骨架的演進：**新增了 Personality、Success criteria、Stop rules，拿掉了 Reasoning Steps**（因為推理已內建，見 #57）。

<a id="e36"></a>
### 36. 官方骨架 F：Persona-Task-Context-Format 四要素（P-T-C-F）
- **使用方式**：面向一般使用者的最小骨架，**不必四個都用，用幾個就有幫助**。
  - 官方標註範例：`You are a program manager in [industry]. (Persona) Draft an executive summary email to [persona] based on [details about relevant program docs]. (Task + Context) Limit to bullet points. (Format)`
  - 部落格白話版：`"I'm a project manager"`（persona）`"and need to create a detailed project tracker"`（task）`"for a website redesign project"`（context）`"in a simple table with fields for dates, status and tasks."`（format）
- **出處**：
  - Google · Gemini for Workspace: Prompting guide 101 — https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/
- **適用/注意**：Workspace／一般使用者情境。與 #35 的八段模板是同一族譜的兩個複雜度。

<a id="e37"></a>
### 37. Response Rules 放最前面；指令衝突時模型傾向遵循靠近結尾的那條（Position effects）
- **使用方式**：把整體性的「Response Rules / Instructions」章節放在 prompt 開頭給高層次指引。另一條實測結論：**GPT-4.1 在指令互相衝突時，傾向遵循比較靠近 prompt 結尾的那一條**——所以覆寫規則要放後面，而且更該做的是先把衝突消掉（見 #199）。
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Cohere · A Guide to Crafting Effective Prompts（Formatting and Delimiters） — https://docs.cohere.com/docs/crafting-effective-prompts
  - Microsoft · Prompt engineering techniques（Start with clear instructions / Order matters） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：GPT-4.1。原文：`"If conflicting instructions exist, GPT-4.1 tends to follow closer to end of prompt."` Cohere 的規則更硬：`"Instructions should be placed at the beginning of the prompt"`。⚠️ **Microsoft 則附了一段罕見的自我修正註記**——他們的研究支持「任務講在最前面」，但 `"in contrast to previous model versions (GPT-3 and prior), our testing showed that the model response with ChatGPT and GPT-4 models was the same regardless of whether the technique is utilized."`（技巧仍建議照做，但**在新模型上實測已經沒差**）。這本身就是一個可教的元教訓：**prompt 技巧會隨模型版本過時**。Microsoft 同時把位置效應命名為近因偏誤：`"Order matters… Even the order of few-shot examples can matter. This difference is referred to as recency bias."`

<a id="e38"></a>
### 38. Prompt template：把變數抽出來（Prompt templates）
- **使用方式**：把會變動的部分寫成 `{變數名}` 讓程式替換，例如 `Do {animal_name} {animal_activity}?`。規則：變數必須用大括號包住、變數名不能有空白。
- **出處**：Google · Use prompt templates — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-templates
- **適用/注意**：限制——`System instructions` 不支援當可替換變數；prompt templates 不支援多模態 prompt。

<a id="e266"></a>
### 266. 官方骨架 G：Qwen 六要素（背景／目的／風格／語氣／受眾／輸出）
- **使用方式**：用六個井字號區塊把需求填滿，官方定義逐字如下：
  - `背景：介绍与任务紧密相关的背景信息。这一环节有助于LLM深入理解讨论的具体环境，从而保证其生成内容与话题高度相关。`
  - `目的：明确指出您期望LLM完成的具体任务。通过设定清晰、精确的目标指令，可引导LLM聚焦于实现既定任务，提升输出的有效性。`
  - `风格：指定您希望 LLM 输出的写作风格，可以是某个具体名人、具体流派或者某类专家的写作风格。`
  - `语气：定义输出内容应有的语气，比如正式、诙谐、温馨、关怀等，以便适应不同的使用场景和使用目的。`
  - `受众：明确指出内容面向的读者群体，无论是专业人士、入门学习者还是儿童等，这样LLM就能调整语言和内容深度，使之更加贴合受众需求。`
  - `输出：规定输出内容的具体形式，确保LLM提供的成果能直接满足后续应用的需求，比如列表、JSON数据格式、专业分析报告等形式。`
  官方完整範例（逐字節錄）：
  ```
  #背景#
  我想为公司的新产品做广告。我公司的名字叫阿里云百炼，产品叫阿里云百炼 Zephyr Z9，是一款轻薄便携的手机。
  #目的#
  为我创建一个微博帖子（限制：500字），旨在让人们有兴趣点击产品链接购买。
  #风格#
  遵循黑米等成功公司为类似产品做广告的写作风格。
  #语气#
  有说服力
  #受众#
  我公司在微博上的受众通常是年轻一辈人。定制你的帖子，保证喜欢数码产品的人能快速关注到你的帖子。
  #输出#
  微博上的帖子，简洁而有影响力。
  ```
- **出處**：Qwen（阿里雲百煉）· 文生文 Prompt 指南（Prompt 框架） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- **適用/注意**：Qwen 全系列。特色是把**風格、語氣、受眾**拆成三個獨立必填欄位（其他廠通常併進「角色」或「風格指引」）。官方對效果的說法：`在未使用 Prompt 框架时，LLM 输出虽表现尚可，但显得过于泛化，缺乏必要的细节和针对特定群体的吸引力。`；也明講框架可增減：`Prompt 框架在实践中有非常多的种类，您可以根据您的任务需求增减其结构组成。` 與 #36（P-T-C-F）、#31（七段範本）、#35（八段模板）是同一族譜的不同顆粒度；井字號分隔符的選字理由見 #28。

<a id="e267"></a>
### 267. 官方骨架 H：Mistral 的階層式章節骨架（角色句 → 可用資源 → 回應格式 → 範例）
- **使用方式**：開頭一句「角色＋任務」，接著用 `#` 章節把「可用選項／資源」「回應格式」「範例」分層擺開。官方範例（語言偵測，逐字節錄）：
  ```
  You are a language detection model, your task is to detect the language of the given text.

  # Available Languages
  Select the language from the following list:
  - English: "en"
  - French: "fr"
  - Spanish: "es"
  - German: "de"
  Any language not listed must be classified as "other" with the code "on".

  # Response Format
  Your answer must follow this format:
  {"language_iso": <language_code>}

  # Examples
  Below are sample inputs and expected outputs:
  ## English
  User: Hello, how are you?
  Answer: {"language_iso": "en"}
  ## French
  User: Bonjour, comment allez-vous?
  Answer: {"language_iso": "fr"}
  ```
- **出處**：Mistral · Prompting best practices（Structure） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：Mistral 全系列。原則句：`"When giving instructions, organize them hierarchically or with a clear structure, such as dividing them into clear sections and subsections. The prompt should be clear and complete."` 這個骨架有三個值得抄的習慣：**枚舉型任務要把合法選項列完**、**兜底類別要明寫**（`other` / `"on"`，同 #285）、**回應格式用一行 schema 示範**（同 #101）。角色句型見 #48、範例的兩種放法見 #39。

---

<a id="ch5"></a>
## 第 5 章　範例：Few-shot、Many-shot 與補完策略

<a id="e39"></a>
### 39. Few-shot 的基本功：相關、多樣、結構化、3–5 個（Use examples effectively）
- **使用方式**：範例是操控輸出格式、語氣與結構**最可靠**的手段。三個品質要求：**Relevant**（貼近你的真實用例）、**Diverse**（涵蓋邊界案例，變化要夠大以免模型學到非預期規律）、**Structured**（用 `<example>` 包起來，多個包在 `<examples>` 裡，讓模型分得出範例與指令）。**建議 3–5 個**。你也可以請模型幫你評估範例的相關性與多樣性，或依現有範例再生成更多。範例通常放在 `developer`／system 訊息裡。
- **出處**：
  - Anthropic · Prompting best practices（Use examples effectively） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#use-examples-effectively
  - OpenAI · Prompt engineering（Few-shot learning） — https://developers.openai.com/api/docs/guides/prompt-engineering#few-shot-learning
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（為模型提供輸出樣例） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Mistral · Prompting best practices（Example Prompting / Few-Shot） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Meta · Prompt engineering（Zero-shot / Few-shot） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Microsoft · Prompt engineering techniques（Few-shot learning） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：全部。OpenAI 版強調 `"try to show a diverse range of possible inputs with the desired outputs."` Part 2 四家各補一個角度：**Qwen** 指出樣例不只教格式，還能**壓低多次輸出的變異**——`提供样例可以让大模型多次输出的结果更一致，从而稳定模型表现。`；**Mistral** 區分兩種放法——寫在 prompt 的 `# Examples` 區塊，或做成**對話歷史裡的假 user/assistant 往返**（標準 few-shot 結構），並定義 `"zero-shot prompting involves no examples."`；**Meta** 解釋了 "shot" 一詞的來源（`"This term originates from training computer vision models on photographs, where one shot was one example or instance that the model used to classify an image."`），官方範例還示範用範例定義更細緻的輸出（情感分類改成正／中／負三個百分比）；**Microsoft** 點出一個容易被忽略的效果——**範例教的是「標籤的類別層級」而不只是字面**：`"It can infer the category of label that is wanted, even without a 'basketball' label in the examples."` 負面範例與排列順序的進階規則見 #268。

<a id="e40"></a>
### 40. Google 立場：建議**永遠**在 prompt 裡放 few-shot 範例（Always include few-shot）
- **使用方式**：Google 是四廠中態度最強的——`"We recommend to always include few-shot examples in your prompts."` 而且**如果範例夠清楚，甚至可以把指令刪掉**。few-shot 特別常被用來規範格式、措辭、範圍與整體模式；範例要具體且多樣。
- **出處**：Google · Prompt design strategies（Few-shot） — https://ai.google.dev/gemini-api/docs/prompting-strategies#few-shot
- **適用/注意**：⚠️ 與 Gemini 3.x 的「簡化 prompt、不要用為舊模型設計的冗長工程」（#256）並存時要一起讀；也與 OpenAI 推理模型的「先試 zero-shot」（#44）方向相反——這是很好的廠家／模型別差異素材。

<a id="e41"></a>
### 41. 範例數量要實測，太多會 overfit（Number of examples）
- **使用方式**：Gemini 通常幾個範例就抓得到模式，但實際數量要自己試。太少改變不了行為，**太多會讓模型過擬合到範例上**（開始把範例的偶然特徵當成規則）。
- **出處**：Google · Prompt design strategies（Number of examples） — https://ai.google.dev/gemini-api/docs/prompting-strategies#number-examples
- **適用/注意**：Vertex 側同樣說法：`"Too many examples can cause the model to overfit."`

<a id="e42"></a>
### 42. 範例的格式必須完全一致（Consistent formatting）
- **使用方式**：few-shot 的主要功能之一就是示範輸出格式，所以每個範例的結構與排版要**逐字級一致**——特別注意 XML 標籤、空白、換行、範例之間的分隔符。
- **出處**：Google · Prompt design strategies（Consistent formatting） — https://ai.google.dev/gemini-api/docs/prompting-strategies#consistent-formatting
- **適用/注意**：全部。

<a id="e43"></a>
### 43. 範例一定要配清楚指令；而且規則與範例必須對得上（Examples + instructions must agree）
- **使用方式**：**沒有清楚指令的 few-shot 是危險的**——模型可能從範例學到你沒打算讓它學的模式或關聯。反過來，加了規則就要補上示範該行為的範例，並確認**規則裡寫的行為在範例裡真的做到了**。Google 建議用 XML 風格標記把範例框起來（`<EXAMPLE> INPUT: … OUTPUT: … </EXAMPLE>`）。
- **出處**：
  - Google · Include few-shot examples — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-examples
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：原文：`"Without clear instructions, models might pick up on unintended patterns or relationships from the examples."`／`"ensure behaviors cited in rules match examples."` 「指令與範例互相矛盾」也是 Google 除錯清單的一條（#200）。

<a id="e44"></a>
### 44. Many-shot in-context learning（把 few-shot 放大到數百～數十萬個）
- **使用方式**：有百萬級 context window 時，可以把範例從「幾個」放大到**數百、數千甚至數十萬個**，這會解鎖新能力，效果可比擬針對該任務微調過的模型；搭配 context caching 讓這種高輸入量在經濟上可行。
- **出處**：Google · Long context — https://ai.google.dev/gemini-api/docs/long-context#long-form-text
- **適用/注意**：Gemini 長脈絡模型。與 #41「太多會 overfit」看似衝突——差別在於 many-shot 是**同一分佈的大量範例**，不是少數幾個被過度學習。

<a id="e45"></a>
### 45. 推理模型先試 zero-shot，再考慮加範例（Zero-shot first）
- **使用方式**：對 o 系列這種推理模型，先不給範例試一次；真的不行再加 few-shot。
- **出處**：OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：o 系列推理模型。⚠️ 與 Google #40 的「永遠放 few-shot」方向相反。

<a id="e46"></a>
### 46. 補完策略：寫出回應的開頭讓模型接下去（Partial input completion）
- **使用方式**：生成式模型本質上是「進階自動補完」。與其用自然語言把格式規則講到死，不如**給一組範例並直接寫出回應的開頭**。
  - 官方大綱範例：`Create an outline for an essay about hummingbirds.` 後面接 `I. Introduction` 與 `*`，模型就會用 `*` 條列而不是 `A. B. C.`。
  - 官方點餐轉 JSON 範例：純自然語言指令會輸出所有欄位（含沒點的），改成給一組 `Order/Output` 範例＋最後留一個 `Output:` 開頭，模型就會自動略掉沒點的品項。
  - Vertex 的分類範例：`<examples>` 裡放三組 `Name: / Type:`，最後留一個 `Type:` 讓它補。
- **出處**：
  - Google · Prompt design strategies（Completion） — https://ai.google.dev/gemini-api/docs/prompting-strategies#completion
  - Google · Prompt design strategies（Format responses with the completion strategy） — https://ai.google.dev/gemini-api/docs/prompting-strategies#format_responses_with_the_completion_strategy
  - Cohere · A Guide to Crafting Effective Prompts（Begin the Completion Yourself） — https://docs.cohere.com/docs/crafting-effective-prompts
  - Microsoft · Prompt engineering techniques（Prime the output） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
  - DeepSeek · Chat Prefix Completion (Beta) — https://api-docs.deepseek.com/guides/chat_prefix_completion
- **適用/注意**：官方警語——**複雜 JSON Schema 請改用 structured output 功能**（見 #121），補完策略適合非 JSON 的排版控制。同一個技巧有三種實作層級：**(a) 純 prompt** —— Cohere 直接在 prompt 末尾示範開頭幾行（`"you can show the model how the completion should begin, and it will tend to follow suit."`，官方例：要求輸出 HTML 文件並附上 `<!DOCTYPE html>` / `<html>` 起頭）；Microsoft 稱之為 `Cue`（`"including a few words or phrases at the end of the prompt to obtain a model response that follows the desired form"`，官方例：`"Here's a bulleted list of key points:\n- "`、`One possible search query is:` 可以把輸出從多個查詢壓成一個）。**(b) API 一等公民** —— DeepSeek 的 Chat Prefix Completion：把最後一則 `assistant` 訊息的 `prefix` 設為 `True`，官方示範用 ` ```python\n ` 當前綴強迫輸出 Python 程式碼，再用 `stop` 參數擋掉後面的解釋（需切到 `base_url="https://api.deepseek.com/beta"`）。**(c) 生成端強制** —— 思考模型用 `<think>\n` 起頭（#274）。⚠️ **Anthropic 現行模型已不支援 prefill**（#251），所以這個技巧不可跨廠照搬。

<a id="e47"></a>
### 47. 在範例裡用 `<thinking>` 標籤示範推理樣式（Multishot examples work with thinking）
- **使用方式**：在 few-shot 範例內部放 `<thinking>` 區塊示範你想要的推理樣式，模型會把那個風格推廣到它自己的 extended thinking block。
- **出處**：Anthropic · Prompting best practices（Leverage thinking capabilities） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用/注意**：所有現行 Claude 模型。⚠️ 注意 Google 的反例：**不要提供「先給結論再補推理」的範例**（CoT 順序錯誤，見 #200）。

<a id="e268"></a>
### 268. 放負面範例並說明「為什麼錯」；範例順序也會被學走（Negative examples & ordering）
- **使用方式**：除了給正確範例，再放幾個**錯誤示範並清楚標示錯在哪**，模型才學得會分辨對錯；同時注意**範例的排列順序**——如果順序本身存在可以被學到的規律（例如答案剛好 Yes/No 交替、或同類例子全連在一起），模型可能學到那個規律而不是題意。
- **出處**：Cohere · Advanced Prompt Engineering Techniques（Few-shot Prompting） — https://docs.cohere.com/docs/advanced-prompt-engineering-techniques
- **適用/注意**：原文：`"In addition to giving correct examples, including negative examples with a clear indication of why they are wrong can help the LLM learn to distinguish between correct and incorrect responses. Ordering the examples can also be important; if there are patterns that could be picked up on that are not relevant to the correctness of the question, the model may incorrectly pick up on those instead of the semantics of the question itself."` 與 #39（相關／多樣／結構化）、#41（太多會 overfit）、#43（規則與範例必須對得上）互補——**這幾種失效都是同一件事：模型學到了你沒打算教的東西**。

---

<a id="ch6"></a>
## 第 6 章　角色、系統訊息與指令階層

<a id="e48"></a>
### 48. 給模型一個角色（Role / persona prompting）
- **使用方式**：在 system／developer 訊息裡設定角色，可以聚焦模型的行為與語氣——**一句話就有差**。
  - Anthropic：`system: "You are a helpful coding assistant specializing in Python."`
  - OpenAI（o 系列）：`You are an AI retail agent. As a retail agent, you can help users cancel or modify pending orders, return or exchange delivered orders…`
- **出處**：
  - Anthropic · Prompting best practices（Give Claude a role） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - Mistral · Prompting best practices（Providing a Purpose / Roleplaying） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Meta · Prompt engineering（Role-based prompts） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：透過 `system`（Anthropic）／`developer`（OpenAI 推理模型）參數。角色用來「設定基礎行為、語氣，並勾勒可執行的動作範圍」。Mistral 給了一句可以直接填空的最小模板：`"You are a <role>, your task is to <task>."`，並說明它的作用是 `"steer the model toward a specific vertical and task, ensuring it quickly understands the context and expected output."` Meta 是少數會為每個技巧列出**代價**的廠商——角色型提示的好處是 `Improves relevance` 與 `Increases accuracy`，代價是 `"Requires more effort to gather and provide the necessary information about the role or perspective of the person or entity being addressed."`（官方範例：`You are a virtual tour guide walking tourists around Eiffel Tower on a night tour…`）。⚠️ 不要過度限制角色，見 #49。

<a id="e49"></a>
### 49. ⚠️ 角色不要過度限制（Don't over-constrain the role）
- **使用方式**：過度具體的角色會壓縮模型的可用性；現代的替代做法是**明講你要的觀點／視角**，而不是硬指派一個身分。
- **出處**：Anthropic · Blog: Best practices for prompt engineering — https://claude.com/blog/best-practices-for-prompt-engineering
- **適用/注意**：全部。＊部落格來源。原文：`"Be explicit about desired perspective rather than assigning a role."`

<a id="e50"></a>
### 50. System instruction 的五種用途與安全定位（System instructions）
- **使用方式**：官方建議用 system instruction 告訴模型「你要它怎麼表現、怎麼回應」，五種用途：定義 persona／定義輸出格式／定義輸出風格與語氣／定義任務目標或規則／提供額外脈絡。它特別適合放**終端使用者看不到也改不了**的資訊。
  - 官方 persona 範例：`You are Captain Barktholomew, the most feared pirate dog of the seven seas. You are from the 1700s and have no knowledge of anything after that time. You only talk about topics related to being a pirate. End every message with "woof!"`
  - **同一個 persona 換一個字就換一個受眾**：`teaching college students…` vs `helping primary school students…`
  - 非英文語言：直接加 `Respond in the same language as the query.`
  - 資訊不足就拒答：`If the user does not provide all of this information, please respond with, "I'm sorry, but I do not have all of the necessary information to create a speech. Please provide the event, audience size, speaker information, tone, length, and any miscellaneous information."`
- **出處**：
  - Google · System instructions introduction — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instruction-introduction#use_cases
  - Google · Use system instructions — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions#use_cases
- **適用/注意**：⚠️ 官方安全警語：`"System instructions can help guide the model to follow instructions, but they don't fully prevent jailbreaks or leaks. We recommend exercising caution around putting any sensitive information in system instructions."` ⚠️ **反向立場見 #269**（DeepSeek-R1 要求完全不要用 system prompt）與 **#270**（拿不到 system prompt 時的替代寫法）。

<a id="e51"></a>
### 51. 指令階層：developer > user（Chain of command）
- **使用方式**：三種角色形成權限階層——`developer` 訊息（應用開發者的指令）**優先於** `user` 訊息（終端使用者的指令），`assistant` 是模型自己產生的。官方比喻：developer / user 訊息就像程式語言裡的**函式定義與傳入引數**。`instructions` 參數優先度高於 `input` 內容。
- **出處**：
  - OpenAI · Prompt engineering（Message roles and instruction following） — https://developers.openai.com/api/docs/guides/prompt-engineering#message-roles-and-instruction-following
  - Meta · Llama 4 — Model Cards & Prompt Formats（Roles） — https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/
  - Cohere · An Overview of System Messages — https://docs.cohere.com/docs/system-instructions
- **適用/注意**：⚠️ 重要限制——`instructions` **只作用於當次請求，不會沿用到後續對話回合**。**Cohere 把 system message 再拆成三層並定義優先序**（官方文件裡少見的明文）：`System Preamble`（含 `Safety Preamble`，**任何情況都要遵守，即使使用者指令牴觸**）→ `Default Preamble`（預設行為，**使用者的 system message 可以覆蓋**）→ `Developer Preamble`（你透過 API 加的那一段）；原文：`"if a user provides contradictory instructions in their system message, then such instructions take precedence over ones specified in the Default Preamble."` **Meta 則定義了四種角色**：`system` / `user` / `assistant` / `tool`，並附一個實作上容易踩的坑——`"Note that the role name used in the prompt template is ipython"`（`tool` 在模板裡實際寫成 `ipython`）。延伸閱讀：OpenAI Model Spec 的 chain of command — https://model-spec.openai.com/2025-02-12.html#chain_of_command

<a id="e52"></a>
### 52. 推理模型用 developer message 取代 system message
- **使用方式**：從 `o1-2024-12-17` 起，對推理模型改用 `developer` 角色而不是 `system`。
- **出處**：OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：`o1-2024-12-17` 起。

<a id="e53"></a>
### 53. 單一回合覆寫 system prompt（Per-response instructions）
- **使用方式**：語音 session 可以只針對**這一回合**覆寫 system prompt，之後自動回到 session 層設定——用來注入動態脈絡（CRM 資料、來電者資訊）或臨時改行為，不必更新整個 session。
  - 官方範例：`Respond in Spanish for this turn only.`
- **出處**：xAI · Speech to Speech（Per-response instructions） — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#per-response-instructions
- **適用/注意**：`response.create` 的 `instructions` 欄位。

<a id="e54"></a>
### 54. 讓模型正確自報身分／模型字串（Model self-knowledge）
- **使用方式**：若應用需要模型正確自我辨識，或需要它推薦特定的 API model string，就在 prompt 裡明講。
  - 官方寫法：`The assistant is Claude, created by Anthropic. The current model is Claude Opus 5.` ／ `When an LLM is needed, please default to Claude Opus 5 unless the user requests otherwise. The exact model string for Claude Opus 5 is claude-opus-5.`
- **出處**：Anthropic · Prompting best practices（Model self-knowledge） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#model-self-knowledge
- **適用/注意**：所有現行 Claude 模型。模型不會自己知道自己的版本字串。

<a id="e269"></a>
### 269. ⚠️ DeepSeek-R1：不要加 system prompt，所有指令放進 user prompt
- **使用方式**：R1 系列的官方使用建議明講：**不要用 system prompt**，把角色、規則、格式要求全部寫在 user 訊息裡。官方自家的 Web／App 也是這樣跑的——沒有 system prompt，只為「檔案上傳」與「網頁搜尋」另外設計了兩個 user 端模板（見 #80、#92）。
- **出處**：DeepSeek · DeepSeek-R1 README（Usage Recommendations） — https://github.com/deepseek-ai/DeepSeek-R1
- **適用/注意**：DeepSeek-R1 系列（含 R1-Distill-Qwen / R1-Distill-Llama 蒸餾版）。原文：`"Avoid adding a system prompt; all instructions should be contained within the user prompt."`／`"In the official DeepSeek web/app, we don't use system prompts but design two specific prompts for file upload and web search for better user experience. In addition, the temperature in web/app is 0.6."` ⚠️ **這與四大廠「把規則寫進 system instruction」的教學（#50、#51、#31）方向相反，也與 Mistral 推理模型「推理指令就放 system prompt」（#277）完全相反**——是最乾淨的一組「同一件事、不同廠商相反建議」的教材。⚠️ 世代限定：這是 R1 時代（可自行部署、可控 chat template）的建議，現行 DeepSeek API 的思考模式規格見 #276。

<a id="e270"></a>
### 270. 拿不到 system prompt 時：把整體脈絡串接在 user prompt 前面
- **使用方式**：兩層輸入的分工是——system 在對話**開頭**設定整體脈絡與行為（通常由開發者管理），user 提供**當下這一輪**的脈絡或指令。如果你的執行環境根本改不到 system prompt（第三方介面、別人的產品、只能送一段文字的欄位），官方作法是**把整體脈絡直接串接在使用者查詢前面**：
  ```json
  {
    "role": "user",
    "content": "system_prompt\n\nUser: user_prompt"
  }
  ```
- **出處**：Mistral · Prompting best practices（Main Concepts） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：Mistral 全系列，但這個手法可移植到任何廠商。原文：`"If you cannot control the system prompt, you can still include the general context and instructions in the user prompt by concatenating them with the actual query."` 與 #269（DeepSeek 要求全部放 user）殊途同歸：**system 訊息是慣例與權限機制，不是指令生效的必要條件**；但指令階層（#51）與 system 的安全定位（#50）仍然只有真正的 system 訊息才有。

<a id="e271"></a>
### 271. Llama 4 的官方建議 system prompt：降低「誤拒絕」與說教語氣（含禁用片語清單）
- **使用方式**：Meta 直接公開一份可客製的 system prompt 範本，目的**不是**加能力，而是**壓掉模型自身對齊訓練帶來的副作用**——過度拒答與說教口吻。四個可直接抄的成分：① 定義一個能在幽默／同理／知性／創意／解題之間自然切換的對話者；② 明講「有時候人只是想被聽見」，不要每次都硬要幫忙；③ **禁用片語清單**；④ 講清楚模型身分、知識截止日與語言政策。
  - 官方原文（逐字節錄）：`You understand user intent and don't try to be overly helpful to the point where you miss that the user is looking for chit-chat, emotional support, humor or venting. Sometimes people just want you to listen… Always avoid templated language.`
  - `You never lecture people to be nicer or more inclusive.`
  - `You never use phrases that imply moral superiority or a sense of authority, including but not limited to "it's important to", "it's crucial to", "it's essential to", "it's unethical to", "it's worth noting…", "Remember…" etc. Avoid using these.`
  - `You are Llama 4. Your knowledge cutoff date is August 2024. … Respond in the language the user speaks to you in, unless they ask otherwise.`
- **出處**：Meta · Llama 4 — Model Cards & Prompt Formats（Suggested System Prompt） — https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/
- **適用/注意**：Llama 4 Scout / Maverick。官方定位：`"A good system prompt can be effective in reducing false refusals and 'preachy' language common in LLM responses. Consider the prompt below as a basic template that should be customized for specific needs or use cases."` 這份 prompt 是「用**具體寫作選擇**定義語氣」（#116）的極端具體版，禁用片語清單可直接移植到其他廠商的風格規範；模型自報身分的作法見 #54。⚠️ 客製時要保留你自己的安全政策，不要整段照抄就上線。

---

<a id="ch7"></a>
## 第 7 章　推理、思考控制與取樣參數

<a id="e55"></a>
### 55. 推理模型：給目標與成功標準，不要規定每一個中間步驟（General instructions over prescriptive steps）
- **使用方式**：對推理模型，給**任務、限制、想要的輸出格式**，外加「什麼算完成」與「該怎麼驗證自己的工作」，然後放手；不要手寫逐步計畫。Anthropic 說得更直白：一句 `think thoroughly` 通常比人手寫的 step-by-step 計畫效果更好，因為模型的推理常常超出人類會規定的範圍。
- **出處**：
  - Anthropic · Prompting best practices（Leverage thinking capabilities） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
  - OpenAI · Reasoning — https://developers.openai.com/api/docs/guides/reasoning
  - OpenAI · Reasoning best practices（Be specific） — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：所有現行 Claude 模型、OpenAI 推理模型。原文：`"Prefer general instructions over prescriptive steps."`／`"Give the model the task, constraints, and desired output format" without "prescribing every intermediate step."`／`"define what counts as done and how the model should verify its work."` ⚠️ 對**非**推理模型（GPT-4.1 級）方向相反，見 #59。

<a id="e56"></a>
### 56. 推理模型偏好簡短清楚的指令（Keep it simple）
- **使用方式**：對 o 系列，短而清楚的指令表現最好；不要把 prompt 塞滿鷹架。
- **出處**：OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：o 系列推理模型。原文：`"The models excel at understanding and responding to brief, clear instructions."`

<a id="e57"></a>
### 57. ⚠️ 不要對推理模型下 CoT，也不要在工具呼叫前誘發額外推理（Avoid chain-of-thought for reasoning models）
- **使用方式**：推理模型已經在內部推理，再加「一步一步想」是多餘的；在每次 function call 前硬塞推理提示甚至會**降低**表現。
- **出處**：
  - OpenAI · Reasoning best practices（Avoid chain-of-thought） — https://developers.openai.com/api/docs/guides/reasoning-best-practices
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - Microsoft · Prompt engineering techniques（文章開頭警語） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：o 系列推理模型。原文：`"a developer should not try to induce additional reasoning before each function call"`。⚠️ 與 GPT-4.1 的「Planning 提醒」（#169 第 3 條）**直接相反**，是最重要的模型別差異之一。Microsoft 把這件事升級成整篇文章的**前提警語**，寫在第一行：`"These techniques aren't recommended for reasoning models like gpt-5 and o-series models."`，並補一句 `"each model behaves differently, so the learnings might not apply equally to all models."`——換句話說，**「這份指南適用於哪一類模型」本身就該是教材的一部分**。

<a id="e58"></a>
### 58. ⚠️ 不要叫模型覆述／轉錄它的內部推理（`reasoning_extraction` 拒絕）
- **使用方式**：任何叫模型把內部推理當作回應文字 echo／transcribe／explain 出來的 prompt、skill 或 harness 指令，在 Claude Fable 5 上會觸發 `reasoning_extraction` 拒絕類別，導致大量 fallback 到 Opus 4.8。遷移時要**稽核既有 skill 與 system prompt 裡的「展示你的思考」指令並刪掉**；要看推理就去讀 adaptive thinking 的結構化 `thinking` block。
- **出處**：
  - Anthropic · Prompting Claude Fable 5（Recommended scaffolding changes） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#recommended-scaffolding-changes
  - Microsoft · Prompt engineering techniques（Chain of thought prompting） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：Claude Fable 5。⚠️ 這條**推翻了一個非常常見的舊技巧**（「請說明你的推理過程」）。**Microsoft 把它寫成使用政策層級的警告**：`"Attempting to extract model reasoning through methods other than the reasoning summary parameter aren't supported, may violate the Acceptable Use Policy, and may result in throttling or suspension when detected."`——也就是說，這已經不只是「效果差」，而是**可能違反使用條款**。要看推理請走官方的 reasoning summary／thinking block（#74）。

<a id="e59"></a>
### 59. 非推理模型仍要明講逐步思考；重推理問題可加「Think very hard」
- **使用方式**：GPT-4.1 這類非推理模型需要你明白要求：`First, think carefully step by step about what documents are needed to answer the query. Then, print out the TITLE and ID of each document.` Gemini 2.5／3 系列則自動產生內部 thinking，**通常不需要**要求它在回應裡列出計畫或步驟；但對重推理問題，一句 `Think very hard before answering` 仍能提升表現，代價是額外的 thinking token。
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Google · Prompt design strategies（Enhancing reasoning and planning） — https://ai.google.dev/gemini-api/docs/prompting-strategies#enhancing_reasoning_and_planning
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（思維鏈 COT） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Microsoft · Prompt engineering techniques（Chain of thought prompting） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：GPT-4.1（非推理模型）；Gemini 2.5／3 的 `Think very hard` 是例外中的例外。**Qwen 給了一組很乾淨的同題對照**（JSON 檢查任務）：不用 CoT 的 `#输出#` 寫 `如果全部符合要求，只输出 "符合要求"，否则只输出 "不符合要求"。`；用 CoT 的版本改成 `先输出针对各要求的思考判断过程。如果全部符合要求，再输出 "符合要求"，否则输出 "不符合要求"。`——**差別只在「先輸出思考判斷過程」這一句**。Qwen 把 CoT 定位成 `使用起来较为简单的引导方法，但能够显著提高大模型在复杂场景下的推理能力。`，並提到還有思維樹（ToT）、Boosting of Thoughts 等更進階的方法。**Microsoft** 的官方句型是 `Take a step-by-step approach in your response, cite sources and give reasoning before sharing final answer in the below format: ANSWER is: <name>`——**同時規定了推理順序與最終答案的格式**（同 #283 的思路）。⚠️ Microsoft 特別註明 `"This technique is only applicable non-reasoning models."`（見 #57、#58）。

<a id="e60"></a>
### 60. 手動 chain-of-thought 作為 fallback（thinking 關閉時）
- **使用方式**：thinking 關掉時仍可請模型逐步思考，並用 `<thinking>` / `<answer>` 標籤把推理與最終輸出乾淨分開。
- **出處**：Anthropic · Prompting best practices（Leverage thinking capabilities） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用/注意**：⚠️ 在 Claude Opus 5 上建議改成「保持 thinking 開著、降低 effort」——關閉 thinking 時模型偶爾會把內部 XML 標籤漏到可見輸出（見 #71）。

<a id="e61"></a>
### 61. 要求解釋推理，並用分隔符把推理與答案切開（Explain its reasoning）
- **使用方式**：三個層次由淺到深：(a) 加一句 `Explain your reasoning`；(b) `Think step by step and print out the thinking process.`；(c) **指定輸出格式把 think 與 answer 拆成兩個 JSON 欄位**方便程式解析——官方原句：`What is the most likely interpretation of this sentence? Think step by step and print out the thinking process. Please output in JSON format with final answer in 'answer', and thinking steps in 'think' fields.`
- **出處**：
  - Google · Instruct the model to explain its reasoning — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/explain-reasoning
  - Cohere · Advanced Prompt Engineering Techniques（Chain of Thought） — https://docs.cohere.com/docs/advanced-prompt-engineering-techniques
- **適用/注意**：⚠️ Google 自己也提醒：如果模型有 Thinking 能力，先試試**不給** step-by-step 指令，看內建 Thinking 是否比你手寫的更好（見 #200 的 "Thinking Vs. Reasoning"）。**Cohere 用同一題（LegalBench 傳聞證據判定）示範了 CoT 的三段式演進**，並點出它的真正痛點是**答案不好抽**：① zero-shot CoT——`A: Work through the problem step by step first and then answer the question.`；② 把 `Reasoning:` 放進 few-shot 範例，同時示範想要的輸出格式；③ 直接要求 JSON——`Given a statement, respond with a JSON object that has two keys: reasoning and answer. The first key's value should contain the reasoning used to arrive at the answer. The second key's value should contain either "Yes" or "No".` 官方也解釋了為什麼要「先想再答」：`"Problems can arise when the model gives an answer right away and then ends up being 'stuck' with it and has to find a way to reconcile the already given answer."`

<a id="e62"></a>
### 62. Adaptive thinking：模型自己決定何時想、想多久（Adaptive thinking）
- **使用方式**：Claude 4.6 之後與 Mythos Preview 用 `thinking: {type: "adaptive"}`，由模型依 `effort` 與問題複雜度自我校準。想收斂過度思考就用 prompt 直接說：`Thinking adds latency and should only be used when it will meaningfully improve answer quality - typically for problems that require multistep reasoning. When in doubt, respond directly.`
- **出處**：Anthropic · Prompting best practices（Leverage thinking capabilities） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用/注意**：各模型預設不同——Opus 4.6～4.8 與 Sonnet 4.6 省略 `thinking` 參數時**關閉**；Opus 5 與 Sonnet 5 **預設開啟**；Fable 5 與 Mythos 5 **永遠開著且只有 adaptive 模式**。官方：`"In internal evaluations, adaptive thinking reliably drives better performance than extended thinking."`

<a id="e63"></a>
### 63. 引導工具結果之後的反思（Interleaved thinking）
- **使用方式**：多步驟工具流程加一句：`After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action.`
- **出處**：Anthropic · Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用/注意**：所有現行 Claude 模型；多步驟工具流程。⚠️ 對 o 系列反而不要這樣做（#57）。

<a id="e64"></a>
### 64. Anthropic `effort` 等級與調校原則（Effort levels）
- **使用方式**：`effort` 是智慧／延遲／成本三者取捨的**主要旋鈕**。五級定義：`max`（無 token 上限的絕對最大能力）／`xhigh`（最難的編碼與 agentic 用例）／`high`（預設，多數用例的平衡點）／`medium`（成本敏感、願意用一點智慧換 token）／`low`（短而範圍明確、延遲敏感、非智慧敏感的工作）。實務原則：**推理太淺時先把 effort 調高，不要用 prompt 硬繞**；一定要維持 low 就補一句 `This task involves multistep reasoning. Think carefully through the problem before responding.`。Opus 4.8 建議編碼／agentic 從 `xhigh` 起跳、智慧敏感任務至少 `high`，並注意 `max` 有時會**過度思考**且報酬遞減；跑 `max`/`xhigh` 時輸出預算從 64k tokens 起調。跨模型 benchmark 要**用觀察到的 thinking 長度對齊，不要用 effort 的名字對齊**（Sonnet 5 medium ≈ Sonnet 4.6 high；Sonnet 5 high ≈ Sonnet 4.6 max）。
- **出處**：
  - Anthropic · Prompting Claude Sonnet 5（Calibrating effort and thinking depth） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#calibrating-effort-and-thinking-depth
  - Anthropic · Prompting Claude Fable 5（Consider all effort levels） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#consider-all-effort-levels
  - Anthropic · Prompting Claude Opus 4.8（Calibrating effort and thinking depth） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8#calibrating-effort-and-thinking-depth
- **適用/注意**：Fable 5 頁另附一段抑制高 effort 下多餘整理的 prompt：`Don't add features, refactor, or introduce abstractions beyond what the task requires… Don't design for hypothetical future requirements: do the simplest thing that works well… Only validate at system boundaries (user input, external APIs).` 官方：`"Lower effort settings on Claude Fable 5 still perform well and often exceed xhigh performance on prior models."`

<a id="e65"></a>
### 65. OpenAI `reasoning.effort`：七級與「先建 baseline 再動它」
- **使用方式**：等級由低到高：`none`（延遲極敏感、完全不需推理）／`minimal`／`low`（效率型，延遲只小幅增加）／`medium`（多數工作的預設，pareto 曲線上的平衡點）／`high`（難推理、複雜除錯、深度規劃）／`xhigh`／`max`（複雜非同步流程）。操作紀律：**先用目前設定建立 baseline，再改**；把 `reasoning.effort` 當成**微調旋鈕，不是救品質的主要手段**；`high`/`xhigh` 只在 eval 證明有提升時才用。複雜多步驟任務則建議直接拉高。
- **出處**：
  - OpenAI · Reasoning — https://developers.openai.com/api/docs/guides/reasoning
  - OpenAI · Prompting guidance for GPT-5.6（Reasoning effort） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用/注意**：原文：`"Treat reasoning.effort as a tuning knob, not the primary way to recover quality."`

<a id="e66"></a>
### 66. xAI `reasoning_effort`：三級、預設 high、**不能關閉**
- **使用方式**：Grok 4.5 用 `reasoning_effort` 控制回答前思考多少：`low`（延遲敏感的 agentic 與簡單工具呼叫）／`medium`（複雜資料分析與長脈絡推理）／`high`（預設；極難問題、複雜數學、多步邏輯、競賽級任務）。
- **出處**：xAI · Reasoning — https://docs.x.ai/developers/model-capabilities/text/reasoning#the-reasoning_effort-parameter
- **適用/注意**：⚠️ `grok-4.5` **推理無法關閉**；且推理模型**不接受** `presencePenalty` / `frequencyPenalty` / `stop`，送了會直接報錯。

<a id="e67"></a>
### 67. ⚠️ 同一個參數名在不同模型意義不同：xAI multi-agent 的 `reasoning.effort` 控制的是**代理數量**
- **使用方式**：在 `grok-4.20-multi-agent` 上，`reasoning.effort` 控制的是「有幾個 agent 協作」（4 或 16 個），不是思考深度；而且多一級 `xhigh`。
- **出處**：xAI · Reasoning（Multi-agent model） — https://docs.x.ai/developers/model-capabilities/text/reasoning#multi-agent-model
- **適用/注意**：`grok-4.20-multi-agent`（beta）。這條的教學價值在於一個閱讀習慣：**同名參數要逐模型確認語意**。

<a id="e68"></a>
### 68. Google `thinking_level` 取代 `thinking_budget`，並依任務難度選檔
- **使用方式**：Gemini 3.x 不再用數字 token 預算，改成字串等級：`minimal`（速度優先；聊天、快速事實、簡單工具呼叫）／`low`（低延遲少步驟的程式與 agentic；也適合需要一點思考的分析與寫作）／`medium`（**預設**，多數任務的最佳品質，推薦給複雜程式與 agentic）／`high`（最大化思考與工具使用；複雜推理、難數學、最難的程式或 agent 任務）。官方操作建議：**從 medium 起跳** → 想更快更便宜試 `low` → 難題切 `high` → 簡單查詢用 `minimal`。另兩條：**看 thought summary 來 debug 你的 prompt**；**輸出很長時反而要叫模型少想以省 token**。
- **出處**：
  - Google · What's new in Gemini 3.5 Flash（Thinking budget / Default effort level） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#thinking-budget
  - Google · Gemini thinking（Best practices） — https://ai.google.dev/gemini-api/docs/thinking#best_practices
  - Qwen（阿里雲百煉）· 深度思考（thinking_budget） — https://help.aliyun.com/zh/model-studio/deep-thinking
- **適用/注意**：Gemini 3.5 Flash 的**預設由 high 降為 medium**。原文：`"The raw numeric thinking_budget parameter is no longer recommended across all Gemini 3.x models."` ⚠️ **但「數字預算」在別家仍然是現行作法**：阿里雲百煉的 `thinking_budget` 直接限制推理過程的最大 token 數，`超过限制后模型立即输出回复`，官方適用清單為 `Qwen3.7、Qwen3.6、Qwen3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供）系列模型`。這是「**用參數控制思考深度**」而不是「用 prompt 說『簡短思考』」的典型——與 #64／#65／#66／#276 的等級制是同一個旋鈕的兩種介面。

<a id="e69"></a>
### 69. ⚠️ Anthropic `budget_tokens` 已淘汰（Claude 4.7+ 會回 400）
- **使用方式**：不要再用 extended thinking 的 `budget_tokens` 設思考上限；改用降低 `effort`，或用 `max_tokens` 當硬上限搭配 adaptive thinking。
- **出處**：Anthropic · Prompting best practices（Overthinking and excessive thoroughness） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overthinking-and-excessive-thoroughness
- **適用/注意**：⚠️ 在 Opus 4.6 / Sonnet 4.6 上仍可用但已 deprecated；**Claude 4.7 以後設定 `budget_tokens` 會回 400 錯誤**。

<a id="e70"></a>
### 70. ⚠️ 過度思考：把「盡量徹底」的鷹架收掉（Overthinking）
- **使用方式**：舊模型時代為了逼模型更徹底而寫的 prompt，現在會造成過度探索。三個修法：① **把一律預設改成有條件的指引**——`Default to using [tool]` → `Use [tool] when it would enhance your understanding of the problem.`；② **拿掉過度提示**——`If in doubt, use [tool]` 會造成過度觸發；③ **把 effort 當 fallback**（降級）。還可以直接下一段限制反覆權衡的 prompt：`When you're deciding how to approach a problem, choose an approach and commit to it. Avoid revisiting decisions unless you encounter new information that directly contradicts your reasoning. If you're weighing two approaches, pick one and see it through.`
- **出處**：Anthropic · Prompting best practices（Overthinking and excessive thoroughness） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overthinking-and-excessive-thoroughness
- **適用/注意**：Claude Opus 4.6 起。

<a id="e71"></a>
### 71. ⚠️ 關閉 thinking 的兩種副作用與解法（Running with thinking disabled）
- **使用方式**：Claude Opus 5 在 thinking 關閉時偶爾會 (a) **把工具呼叫寫成文字**（呼叫不會執行，而且洩漏的文字留在對話歷史會影響後續回合）、(b) **把 `<thinking>` 等內部 XML 標籤吐到可見回應**。主要解法：**保持 thinking 開著、用 low effort 控成本**——`"for most tasks, thinking enabled at low effort performs better than thinking disabled at similar cost."` 若 system prompt 有「不要思考／不要推理」的規則，**刪掉它**（那會增加標籤洩漏）。修補句用通用寫法：`Do not include internal or system XML tags in your response.`
- **出處**：Anthropic · Prompting Claude Opus 5（Running with thinking disabled） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#running-with-thinking-disabled
- **適用/注意**：⚠️ 反直覺細節：**點名 thinking 標籤反而比通用寫法無效**——`"Instructions that call out thinking tags by name are less effective than the general form."`

<a id="e72"></a>
### 72. 「think」這個字的敏感度（Word sensitivity）
- **使用方式**：Claude Opus 4.5 在 extended thinking 關閉時，對 "think" 及其變體特別敏感；改用 `consider`、`evaluate`、`reason through` 等替代詞。
- **出處**：Anthropic · Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用/注意**：Claude Opus 4.5，extended thinking 關閉時。

<a id="e73"></a>
### 73. 為推理保留 token 空間；注意 `max_tokens` 與 tokenizer 變動
- **使用方式**：推理會吃掉輸出預算。OpenAI 建議**開始實驗時至少保留 25,000 tokens 給推理與輸出**，並監控 `max_output_tokens` 造成的不完整回應。Anthropic 提醒：預算太緊時你會看到「幾乎全是 thinking ＋ 被截斷的答案 ＋ `stop_reason: "max_tokens"`」。
- **出處**：
  - OpenAI · Reasoning — https://developers.openai.com/api/docs/guides/reasoning
  - Anthropic · Prompting Claude Sonnet 5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#calibrating-effort-and-thinking-depth
  - Qwen · Qwen3-235B-A22B 模型卡（Adequate Output Length） — https://huggingface.co/Qwen/Qwen3-235B-A22B
- **適用/注意**：⚠️ **Claude Sonnet 5 使用新 tokenizer，同樣文字約多產生 30% tokens**——為 Sonnet 4.6 調過的 `max_tokens` 可能會截斷等價輸出。**Qwen 把輸出長度直接當成「正確率變數」而不只是成本變數**：`"We recommend using an output length of 32,768 tokens for most queries. For benchmarking on highly complex problems, such as those found in math and programming competitions, we suggest setting the max output length to 38,912 tokens. This provides the model with sufficient space to generate detailed and comprehensive responses, thereby enhancing its overall performance."`（版本差異：Instruct-2507 建議 16,384；Thinking-2507 與 Qwen3.5 的複雜題建議 81,920；Qwen3-Coder 建議 65,536）——**不給夠長度，模型沒有空間把推理走完**。

<a id="e74"></a>
### 74. Reasoning summary 與 thought signature（看得到／帶得回推理狀態）
- **使用方式**：OpenAI 的推理摘要要**主動 opt in**（`summary: "auto"`），否則不會包含在輸出裡。Google 的 thought signature 是模型內部推理狀態的加密表示——用 Interactions API 的 stateful 模式時自動處理，但**自己管理歷史（stateless）時必須把 thought 區塊連同 signature 一起帶回**。
- **出處**：
  - OpenAI · Reasoning — https://developers.openai.com/api/docs/guides/reasoning
  - Google · Gemini thinking — https://ai.google.dev/gemini-api/docs/thinking
- **適用/注意**：Google：`"signature … Always present, even when the model performs minimal reasoning."` xAI 的等價要求見 #210（`reasoning_content` 必須帶回）。

<a id="e75"></a>
### 75. Minimal reasoning 下要「更用力 prompt」（Minimal reasoning）
- **使用方式**：`minimal` 這一檔的表現**比高檔更受 prompt 影響**。此時要沿用 GPT-4.1 那套模式：要求簡短說明思路、要求詳盡的工具 preamble、明確要求「呼叫函式前廣泛規劃、對前次呼叫結果反思」、把 query 拆成所有必要子請求並逐一確認完成。
- **出處**：OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用/注意**：GPT-5 minimal reasoning。原文：`"Minimal reasoning performance can vary more drastically depending on prompt than higher reasoning levels."`

<a id="e76"></a>
### 76. 取樣參數總覽：max output tokens / temperature / topK / topP / stop_sequences / seed
- **使用方式**：五個常用旋鈕的官方定義：token 約 4 個字元、**100 tokens ≈ 60–80 個英文字**；`temperature = 0` 為決定性（永遠選最高機率的 token）；`topK = 1` 即 greedy decoding；`topP` 預設 0.95；stop sequence **要避開會出現在內容裡的字串**。Vertex 側另給實務建議：回應太籠統／太短／出現 fallback 就**調高** temperature；無限生成時把 temperature 調到至少 0.1；**1.0 是建議的起始值**（Gemini 支援 0.0–2.0，預設 1.0）；Gemini 專屬的 `seed` 固定後會「盡力」給相同回應，但**不保證決定性**。
- **出處**：
  - Google · Prompt design strategies（Model parameters） — https://ai.google.dev/gemini-api/docs/prompting-strategies#model-parameters
  - Google · Experiment with parameter values — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/adjust-parameter-values
- **適用/注意**：⚠️ 這些**傳統**參數建議在 Gemini 3.x 上已被推翻，見 #77。

<a id="e77"></a>
### 77. ⚠️ Gemini 3.x：取樣參數保持預設；要決定性請改寫 system instruction
- **使用方式**：Gemini 3.x 的推理能力是針對**預設值**最佳化的。把 temperature 調低（<1.0）可能造成迴圈或在數學／推理任務上退化。官方明講：`temperature`、`top_p`、`top_k` **從所有請求中移除**。想要「每次一樣」的決定性輸出，改成「在 system instruction 裡寫明確規則」。
- **出處**：
  - Google · Prompt design strategies（Model parameters） — https://ai.google.dev/gemini-api/docs/prompting-strategies#model-parameters
  - Google · What's new in Gemini 3.5 Flash（Sampling parameters） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#sampling-parameters
- **適用/注意**：Gemini 3.x 全系列（3 Flash / 3.1 Pro / 3.1 Flash-Lite / 3.5 Flash / 3.6 Flash）。⚠️ 這與「temperature 設 0 求一致」的傳統教學**直接衝突**，也與 xAI「數學計算用 0.0–0.3」（#13）相反。

<a id="e78"></a>
### 78. ⚠️ Claude Sonnet 5：設定 `temperature` / `top_p` / `top_k` 會回 400 錯誤
- **使用方式**：這是 Sonnet 級模型的新限制。以前靠 `temperature` 取得風格變化的做法，要改成**用 system prompt 指令**引導語氣與多樣性（具體手法見 #239「先提選項再建構」）。
- **出處**：
  - Anthropic · Prompting Claude Sonnet 5（Tone and writing style） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#tone-and-writing-style
  - DeepSeek · Thinking Mode（不支援取樣參數） — https://api-docs.deepseek.com/guides/thinking_mode
- **適用/注意**：Claude Sonnet 5。⚠️ 任何「調 temperature 控制隨機性／一致性」的教學都要標註它在最新 Claude 與 Gemini 模型上已不適用。⚠️ **同一個限制在 DeepSeek 是「靜默失效」而不是報錯**——思考模式下 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 全部無作用，而且為了相容性**設了不會報錯**：`"Thinking mode does not support the temperature, top_p, presence_penalty, or frequency_penalty parameters. Please note that, for compatibility with existing software, setting these parameters will not trigger an error but will also have no effect."` 這是很好的除錯題材：**「設了沒報錯」不等於「有作用」**（三種行為對照：Claude 回 400、Gemini 3.x 要求不要送、DeepSeek 靜默忽略）。

<a id="e79"></a>
### 79. 觸發安全過濾的 fallback 回應：提高 temperature（Fallback responses）
- **使用方式**：當 prompt 或回應觸發安全過濾時，模型會給 fallback（例：`I'm not able to help with that, as I'm only a language model.`）。官方建議是**提高 temperature**。
- **出處**：Google · Prompt design strategies（Fallback responses） — https://ai.google.dev/gemini-api/docs/prompting-strategies#fallback-responses
- **適用/注意**：⚠️ 適用於仍可調參數的 Gemini 模型；在 Gemini 3.x 上與 #77 衝突，優先遵循 #77。

<a id="e272"></a>
### 272. 用 prompt 文字切換思考模式：`/think` 與 `/no_think` 軟開關
- **使用方式**：Qwen3 提供一個**寫在文字裡**的模式開關——在 user 訊息或 system 訊息裡加 `/think` 或 `/no_think`，就能逐輪切換要不要先思考；多輪對話中模型遵循**最近一次**的指令。其他廠商多半只提供 API 參數，這是少見的「模式切換也是 prompt 的一部分」。
  - 官方原文：`"you can add /think and /no_think to user prompts or system messages to switch the model's thinking mode from turn to turn. The model will follow the most recent instruction in multi-turn conversations."`
- **出處**：
  - Qwen · Qwen3-235B-A22B 模型卡（Advanced Usage） — https://huggingface.co/Qwen/Qwen3-235B-A22B
  - Qwen · Qwen3.5-397B-A17B 模型卡 — https://huggingface.co/Qwen/Qwen3.5-397B-A17B
  - Qwen（阿里雲百煉）· 深度思考 — https://help.aliyun.com/zh/model-studio/deep-thinking
- **適用/注意**：⚠️ **版本差異很大，教材一定要標世代**：(a) `enable_thinking=True` 時無論寫哪個開關，輸出**都會**有 `<think>...</think>` 區塊，只是關閉思考時內容為空；`enable_thinking=False` 時軟開關**完全失效**。(b) **Qwen3.5 已不支援軟開關**——`"Qwen3.5 does not officially support the soft switch of Qwen3, i.e., /think and /nothink."`，而且預設一定先思考，要直接回答只能改 API 參數。(c) 百煉把深度思考模型分成**混合思考**（`enable_thinking` 可開可關）與**僅思考**（永遠先思考、無法關閉）兩類；思考內容走 `reasoning_content` 欄位、回覆走 `content`。思考長度的參數化控制見 #68。

<a id="e273"></a>
### 273. ⚠️ 思考模型禁止 greedy decoding；思考／非思考要用不同取樣參數
- **使用方式**：Qwen 與 DeepSeek 都把「思考型模型不能把 temperature 設成 0」寫進官方建議，理由是會造成**效能退化與無限重複**。官方數值：
  - Qwen 思考模式（`enable_thinking=True`）：`Temperature=0.6, TopP=0.95, TopK=20, MinP=0`，並且明寫 **`DO NOT use greedy decoding`**；非思考模式：`Temperature=0.7, TopP=0.8, TopK=20, MinP=0`。
  - 版本差異（同為官方）：Instruct-2507 為 `0.7 / 0.8 / 20 / 0`；Thinking-2507 為 `0.6 / 0.95 / 20 / 0`；Qwen3-Coder 為 `temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.05`；QwQ-32B 為 `Temperature=0.6, TopP=0.95, MinP=0` 且 `TopK` 建議 20–40。
  - DeepSeek-R1：`"Set the temperature within the range of 0.5-0.7 (0.6 is recommended) to prevent endless repetitions or incoherent outputs."`
  - 重複太多時的官方旋鈕：`presence_penalty` 調 0–2，但值太高偶爾會造成語言混雜與品質微幅下降。
- **出處**：
  - Qwen · Qwen3-235B-A22B 模型卡（Best Practices） — https://huggingface.co/Qwen/Qwen3-235B-A22B
  - Qwen · Qwen3.5-397B-A17B 模型卡（Best Practices） — https://huggingface.co/Qwen/Qwen3.5-397B-A17B
  - DeepSeek · DeepSeek-R1 README（Usage Recommendations） — https://github.com/deepseek-ai/DeepSeek-R1
- **適用/注意**：⚠️ 這與「要穩定就把 temperature 設 0」的傳統直覺**完全相反**，也是把 #76／#278 的通用建議套到思考模型上會出事的地方。跨廠對照：Gemini 3.x 要求**乾脆不要送這些參數**（#77）、Claude Sonnet 5 送了會回 400（#78）、DeepSeek 現行 API 的思考模式則是**設了靜默無效**（見 #78 的注記與 #276）。⚠️ 這幾條都是「本地部署／可控 chat template」情境的建議，走託管 API 前要先確認該參數在該模型上還有沒有作用。

<a id="e274"></a>
### 274. 強制模型真的開始思考：讓回應以 `<think>\n` 開頭
- **使用方式**：思考型模型有時會**跳過思考**——直接吐一個空的 `<think>\n\n</think>` 就開始作答，品質會明顯下降。官方解法是在生成端（chat template 或前綴）**強制每次回應都以 `<think>\n` 起頭**。
  - DeepSeek 原文：`"we have observed that the DeepSeek-R1 series models tend to bypass thinking pattern (i.e., outputting "<think>\n\n</think>") when responding to certain queries, which can adversely affect the model's performance. To ensure that the model engages in thorough reasoning, we recommend enforcing the model to initiate its response with "<think>\n" at the beginning of every output."`
  - Qwen（QwQ-32B）原文：`"Enforce Thoughtful Output: Ensure the model starts with "<think>\n" to prevent generating empty thinking content, which can degrade output quality."`
- **出處**：
  - DeepSeek · DeepSeek-R1 README（Usage Recommendations） — https://github.com/deepseek-ai/DeepSeek-R1
  - Qwen · QwQ-32B 模型卡（Usage Guidelines） — https://huggingface.co/Qwen/QwQ-32B
- **適用/注意**：DeepSeek-R1 系列、QwQ-32B（皆為可自行部署、能控制生成起頭的情境）。教學價值在於它承認了一件事：**模型可能「假裝」思考**——所以「有沒有思考」要看結構，不能看它說自己想過。⚠️ 技術上這就是 prefill／prefix completion（見 #46、#251）：Anthropic 現行模型已不支援 prefill，作法不可跨廠照搬。

<a id="e275"></a>
### 275. 多輪對話要不要把「思考內容」帶回去——三家立場不同
- **使用方式**：把先前回合的推理過程（`<think>` 區塊／`reasoning_content`／`[THINK]` 段）放回 context，三家官方給的答案**不一樣**，一定要照你用的模型走：
  - **Qwen / QwQ：不要帶**——`"In multi-turn conversations, the historical model output should only include the final output part and does not need to include the thinking content."`（官方 Jinja2 chat template 已實作；沒用該模板的框架要由開發者自己保證）
  - **Mistral Ministral 3 Reasoning：強烈建議保留**——`"Multi-turn Traces: We highly recommend keeping the reasoning traces in context."`（Magistral 則說由你依用例自行取捨）
  - **DeepSeek：看有沒有工具呼叫**——兩個 user 訊息之間若**沒有**工具呼叫，中間的 `reasoning_content` 不需要參與上下文串接（送了也會被忽略）；若**有**工具呼叫，`reasoning_content` **必須**回傳，否則 `"the API will return a 400 error."`
- **出處**：
  - Qwen · Qwen3-235B-A22B-Thinking-2507 模型卡 — https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507
  - Mistral · Ministral-3-8B-Reasoning-2512 模型卡（Recommended Settings） — https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512
  - DeepSeek · Thinking Mode — https://api-docs.deepseek.com/guides/thinking_mode
- **適用/注意**：這是 Part 2 最實用的一組廠家差異。同族議題見 #74（OpenAI 的 reasoning summary 要 opt-in、Google 的 thought signature 必須帶回）與 #210（漏傳 `reasoning_content` 是推理模型的頭號快取殺手）——**「思考內容怎麼處理」已經是每一家都要單獨查的規格，沒有通則**。

<a id="e276"></a>
### 276. DeepSeek 現行 API：思考模式預設開啟，`reasoning_effort` 只有 `high` 與 `max` 有實效
- **使用方式**：三條規格要記住：(1) **思考開關預設是開的**；(2) 一般請求的預設 effort 是 `high`，複雜 agent 請求（官方點名 Claude Code、OpenCode）會**自動升到 `max`**；(3) 為了相容性，`low` 與 `medium` 會被映射成 `high`、`xhigh` 映射成 `max`——所以「調低一點省成本」在這裡是無效操作。
  - 官方原文：`"(1) The thinking toggle defaults to enabled (2) In thinking mode, the default effort is high for regular requests; for some complex agent requests (such as Claude Code, OpenCode), effort is automatically set to max (3) In thinking mode, for compatibility, low and medium are mapped to high, and xhigh is mapped to max"`
- **出處**：DeepSeek · Thinking Mode — https://api-docs.deepseek.com/guides/thinking_mode
- **適用/注意**：`deepseek-v4-pro` / `deepseek-v4-flash`。與 #64（Anthropic 五級）、#65（OpenAI 七級）、#66（xAI 三級、不能關）、#68（Google `thinking_level` 四級）並列——**同一個參數名在五家有五種語意與五種可用級距**（#67 是同一個閱讀習慣的極端案例）。⚠️ 同時注意 #78 的注記：思考模式下 `temperature` 等取樣參數設了不會報錯，但也完全沒有作用。

<a id="e277"></a>
### 277. 推理模型的官方 system prompt 模板（Mistral `[THINK]` 版）
- **使用方式**：Mistral 的推理模型走的是「**把推理指令本身放進 system prompt**」路線，並用 `[THINK]` / `[/THINK]` 特殊 token 包住思考段。官方 system prompt（逐字）：
  ```
  First draft your thinking process (inner monologue) until you arrive at a response. Format your response using Markdown, and use LaTeX for any mathematical equations. Write both your thoughts and the response in the same language as the input.

  Your thinking process must follow the template below:[THINK]Your thoughts or/and draft, like working through an exercise on scratch paper. Be as casual and as long as you want until you are confident to generate the response. Use the same language as the input.[/THINK]Here, provide a self-contained response.
  ```
  Ministral 3 Reasoning 的用法是**把官方這段接在你自己的 system prompt 後面**（`"Use our provided system prompt, and append it to your custom system prompt to define a clear environment and use case, including guidance on how to effectively leverage tools in agentic systems."`），不是二選一。
- **出處**：
  - Mistral · Magistral-Small-2509 模型卡 — https://huggingface.co/mistralai/Magistral-Small-2509
  - Mistral · Ministral-3-8B-Reasoning-2512 官方 SYSTEM_PROMPT.txt — https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512/blob/main/SYSTEM_PROMPT.txt
- **適用/注意**：Magistral Small / Medium 1.2、Ministral 3 Reasoning 2512。官方硬性要求：`"The [THINK] and [/THINK] are special tokens that must be encoded as such."` 取樣建議 `top_p: 0.95` / `temperature: 0.7` / `max_tokens: 131072`；context window 128k，但 `"Performance might degrade past 40k but Magistral should still give good results."` ⚠️ **與 #269（DeepSeek-R1：不要用 system prompt）完全相反**，兩條放在一起就是「推理模型該不該有 system prompt」的完整對照；工具數量的建議見 #135、多輪保留思考內容見 #275。

<a id="e278"></a>
### 278. temperature 怎麼挑：依任務性質分兩類；而且 `0` 不保證完全決定性
- **使用方式**：兩家把 temperature 的選法講成同一個二分法——
  - **要決定性**（數學、分類、醫療、推理）：用**非常低**的值。官方舉例「分類代理應該用 `0` 以永遠選最好的 token」，數學助理則可用非常低但不為 0 的值以避免重複；Mistral Large 3（非推理旗艦）建議日常與正式環境**低於 0.1**；Microsoft 舉例產生法律文件要用很低的溫度。
  - **要創意**（腦力激盪、寫小說、想標語、角色扮演）：用**高**的值，但不要高到變成亂數與胡言亂語；Microsoft 舉例虛構故事可用較高溫度（如 0.7）。
  - ⚠️ **關鍵誠實揭露**：即使 `temperature=0`（greedy sampling），因為**硬體差異與捨入誤差**仍可能出現些微差異，長輸出時**一個 token 不同就會整段岔開**。
- **出處**：
  - Mistral · Sampling（Temperature / The Best Temperature） — https://docs.mistral.ai/models/best-practices/sampling
  - Mistral · Mistral-Large-3-675B-Instruct-2512 模型卡（Recommended Settings） — https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512
  - Microsoft · Prompt engineering techniques（Temperature and Top_p） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：原文：`"There's no one-size-fits-all Temperature for all use cases, but some guidelines can help you find the best for your applications."`／`"even with greedy sampling at temperature=0, slight variances can sometimes occur due to hardware differences and rounding errors."`／`"Consider the trade-off: higher Temperatures increase creativity but may decrease quality and accuracy."` ⚠️ 三個例外一定要一起讀：**思考型模型禁止 greedy decoding**（#273）、**Gemini 3.x 要求乾脆不要送這些參數**（#77）、**Claude Sonnet 5 送了直接 400**（#78）。也就是說「調 temperature」已經是**模型別**的知識而不是通則（Google 的 `seed` 同樣只是「盡力」而非保證，見 #76）。

<a id="e279"></a>
### 279. Temperature 與 Top P 不要一起調（固定一個、調另一個）
- **使用方式**：Top P 的作用是把不太可能的 token 擋在候選之外以維持輸出品質，而且它是**在 temperature 之後**才套用的；兩個一起動就分不清是誰造成的影響。官方建議**先固定一個、只調另一個**，實測找出最佳組合。
- **出處**：Mistral · Sampling（Top P） — https://docs.mistral.ai/models/best-practices/sampling
- **適用/注意**：原文：`"Top P ensures that only high-quality tokens are considered, maintaining output quality by excluding unlikely tokens. It's challenging to balance Temperature and Top P, so it's recommended to fix one and adjust the other."`／`"Interaction with Temperature: Top P is applied after Temperature."` Microsoft 給出完全相同的建議（`"The general recommendation is to alter one of these two parameters at a time, not both."`，出處見 #278）。⚠️ 適用前提同 #278：這條只在該模型還接受取樣參數時才成立。

---

<a id="ch8"></a>
## 第 8 章　長上下文與資訊定位

<a id="e80"></a>
### 80. 長資料放最上面、問題與指令放最後（Queries at the end）
- **使用方式**：處理 20k+ tokens 的長文件時，把長文件／輸入放在 prompt 的**最上面**，query、指令、範例放後面。Anthropic 官方測試：**問題放最後可讓回應品質提升最多 30%**（尤其是複雜的多文件輸入）。Google 加一條：大塊資料後用一句**轉場句錨定**，例如 `"Based on the preceding information..."` / `"Based on the information above..."`。
- **出處**：
  - Anthropic · Prompting best practices（Long context prompting） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
  - Google · Long context FAQ — https://ai.google.dev/gemini-api/docs/long-context#where_is_the_best_place_to_put_my_query_in_the_context_window
  - DeepSeek · DeepSeek-R1 README（Official Prompts：檔案上傳模板） — https://github.com/deepseek-ai/DeepSeek-R1
- **適用/注意**：四廠中至少三廠一致（OpenAI 的 prompt caching 也導向「變動內容放最後」，見 #209，只是理由是快取命中而非品質）。⚠️ 但 GPT-4.1 的建議不同，見 #81。**DeepSeek 公開了自家 App 真正在用的檔案上傳模板，正好是這條規則的官方實例**（逐字）：
  ```
  [file name]: {file_name}
  [file content begin]
  {file_content}
  [file content end]
  {question}
  ```
  結構是「檔名 → 明確的內容邊界標記 → 問題」——**資料在前、問題在後，而且邊界用一眼看得出來的標記包住**（同 #28 的分隔符原則）。

<a id="e81"></a>
### 81. ⚠️ GPT-4.1 長文：指令放在**開頭與結尾各一次**
- **使用方式**：
  ```
  # Instructions
  [Your instructions here]

  # External Context
  [Long context material]

  # Final Instructions
  [Summary or critical reminders]
  ```
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Microsoft · Prompt engineering techniques（Repeat instructions at the end / Double down） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：GPT-4.1 長文任務。⚠️ 與 #80「只放最後」不同——這是很好的廠家差異素材。Google 的 `Recap` 元件（#30）其實是同一個效應的第三種說法，而 **Microsoft 是第四種說法並給出了機制名稱**：`"Models can be susceptible to recency bias, which in this context means that information at the end of the prompt might have more significant influence over the output than information at the beginning of the prompt. Therefore, it's worth experimenting with repeating the instructions at the end of the prompt and evaluating the impact on the generated response."`；同頁的 best practice 把它講成一句口訣——`"Double down. Sometimes you might need to repeat yourself to the model. Give instructions before and after your primary content, use an instruction and a cue, and so on."` ⚠️ 注意這與 #207（精簡、每條指令只講一次）存在張力：**重複要用在「長文脈絡的頭尾錨定」，不是無差別地把每條規則講兩次**。

<a id="e82"></a>
### 82. 用 XML 結構化多文件與 metadata（Document structure）
- **使用方式**：多份文件時，每份包在 `<document>` 裡，內含 `<document_content>` 與 `<source>`（以及其他 metadata）子標籤：
  ```
  <documents>
    <document index="1">
      <source>annual_report_2023.pdf</source>
      <document_content>{{ANNUAL_REPORT}}</document_content>
    </document>
  </documents>
  ```
- **出處**：Anthropic · Prompting best practices（Long context prompting） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- **適用/注意**：所有現行 Claude 模型；多文件任務。

<a id="e83"></a>
### 83. ⭐ 長文多文件的格式：XML 與 pipe 分隔表現好，**JSON 特別差**
- **使用方式**：實測結論——把多份文件塞進長 context 時，這兩種格式表現好：
  ```
  <doc id='1' title='Title'>Content here</doc>

  ID: 1 | TITLE: Title | CONTENT: Content here
  ```
  而 **JSON 格式表現特別差**。
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1 長文多文件。原文：`"XML and pipe-delimited formats performed well; JSON performed particularly poorly."` 這是很反直覺、很有教學價值的實測結論。

<a id="e84"></a>
### 84. 長脈絡的新典範：直接把全部資料放進去（Provide all information upfront）
- **使用方式**：以前要丟舊訊息、做摘要、或用向量庫 RAG；有百萬級 context window 之後，可以改採「一次全放進去」的直接做法。官方以 Kalamang 語（使用者不到 200 人）的 in-context learning 實驗作為證據。
- **出處**：Google · Long context — https://ai.google.dev/gemini-api/docs/long-context#getting-started-with-long-context
- **適用/注意**：`"While these techniques remain valuable in specific scenarios, Gemini's extensive context window invites a more direct approach."`

<a id="e85"></a>
### 85. 多針（multiple needles）檢索的準確度取捨
- **使用方式**：單一「針」的 needle-in-a-haystack 可達約 99%，但要一次撈**多個**特定資訊時準確度會掉。官方建議是拆成多次查詢，並用 context caching 攤平重複送入 context 的成本。
- **出處**：Google · Long context（Limitations） — https://ai.google.dev/gemini-api/docs/long-context#long-context-limitations
- **適用/注意**：長脈絡設計時的成本／準確度取捨點。

<a id="e86"></a>
### 86. 長文先做內部大綱，再把主張錨回章節（`<long_context_handling>`）
- **使用方式**：輸入超過約 10k tokens 時，要求模型**先產出一份簡短的內部大綱**（列出與請求相關的關鍵章節），再把每個主張重新錨定到具體文件章節並驗證引文。
  - 官方原句：`First, produce a short internal outline of the key sections relevant to the user's request.`
- **出處**：OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：GPT-5.2；長文任務。

<a id="e87"></a>
### 87. 三階段推理策略：Query Analysis → Context Analysis → Synthesis
- **使用方式**：長文／RAG 的官方三段式指令：① **Query Analysis**：拆解並分析直到確定意圖；② **Context Analysis**：謹慎挑選文件，每份標上相關度 `[high/medium/low/none]`；③ **Synthesis**：摘要最相關的文件並說明為什麼相關。
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1 長文／RAG。

<a id="e280"></a>
### 280. 超出原生 context 長度時用 RoPE scaling（YaRN），不要硬塞
- **使用方式**：輸入超過模型原生上下文長度時，官方要求啟用 YaRN 這類 RoPE scaling 技術來擴充，而不是把超長內容直接送進去。門檻依模型而異：QwQ-32B 是 8,192 tokens；Qwen3.5 原生支援 262,144 tokens，**輸入＋輸出總長**超過才需要 scaling。
- **出處**：
  - Qwen · QwQ-32B 模型卡（Usage Guidelines） — https://huggingface.co/Qwen/QwQ-32B
  - Qwen · Qwen3.5-397B-A17B 模型卡 — https://huggingface.co/Qwen/Qwen3.5-397B-A17B
- **適用/注意**：原文：`"Handle Long Inputs: For inputs exceeding 8,192 tokens, enable YaRN to improve the model's ability to capture long-sequence information effectively."`（YaRN 論文：https://arxiv.org/abs/2309.00071）。這條提醒了一件 prompt 層看不到的事：**所有「長脈絡技巧」（#80、#84、#85）的前提是你真的在模型的有效長度之內**——超出之後要調整的是部署設定，不是 prompt。

---

<a id="ch9"></a>
## 第 9 章　依據、引用與抗幻覺

<a id="e88"></a>
### 88. 先原文引用，再作答（Ground responses in quotes）
- **使用方式**：長文件任務中，先請模型把相關段落**原文引用**出來（放在 `<quotes>` 標籤裡），再基於這些引文執行任務。這能讓它聚焦相關內容、忽略其餘。
  - 官方醫療助理範例：`Find quotes from the patient records and appointment history that are relevant to diagnosing the patient's reported symptoms. Place these in <quotes> tags. Then, based on these quotes, list all information that would help the doctor diagnose…`
- **出處**：Anthropic · Prompting best practices（Long context prompting） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- **適用/注意**：所有現行 Claude 模型；長文件 / RAG。Google 的 agentic 範本（#189）也有等價要求：`"Verify your claims by quoting the exact applicable information (including policies) when referring to them."`

<a id="e89"></a>
### 89. 允許模型說「我不知道」，並要求它明確指出模糊之處
- **使用方式**：明確給模型「承認限制」的許可，而不是逼它硬猜——這能減少幻覺、提升可靠性。
  - Anthropic 官方範例：`If the data is insufficient to draw conclusions, say so rather than speculating.`
  - OpenAI GPT-5.2 版更進一步（`<uncertainty_and_ambiguity>`）：`If the question is ambiguous or underspecified, explicitly call this out and ask up to 1–3 clarifying questions.`——並可提出帶有標示假設的多種詮釋。
- **出處**：
  - Anthropic · Blog: Best practices for prompt engineering — https://claude.com/blog/best-practices-for-prompt-engineering
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
  - Meta · Prompt engineering（Restrictions） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Microsoft · Prompt engineering techniques（Give the model an "out"） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：全部。＊Anthropic 部落格來源（該條在主文件頁沒有獨立章節）。Meta 把它列成一條可直接抄的限制句：`If you don't know the answer, say that you don't know.` Microsoft 則給了這個技巧最完整的命名與說明——**給模型一條「出路」**：`"It can sometimes be helpful to give the model an alternative path if it's unable to complete the assigned task. For example, when asking a question over a piece of text, you might include something like 'respond with not found if the answer isn't present.' This addition can help the model avoid generating false responses."` 同族做法：兜底類別（#285）、缺欄位設 `null`（#132）、找不到就說找不到（#90）。

<a id="e90"></a>
### 90. 嚴格 grounding：只用提供的脈絡作答（Strict grounding）
- **使用方式**：明確設定模型只能用你給的脈絡，找不到就說找不到。
  - OpenAI 版一句話：`Only use provided External Context to answer. If unknown, respond "I don't have that information."`
  - Google 版是一整段可直接貼上的 system instruction：`You are a strictly grounded assistant limited to the information provided in the User Context. In your answers, rely only on the facts that are directly mentioned in that context. You must not access or utilize your own knowledge or common sense to answer. Do not assume or infer from the provided facts; simply report them exactly as they appear… any facts or details that are not directly mentioned in the context must be considered completely untruthful and completely unsupported. If the exact answer is not explicitly written in the context, you must state that the information is not available.`
  - 同一份 Google 文件另給兩段可照抄的子句：**當日日期**（`For time-sensitive user queries that require up-to-date information, you MUST follow the provided current time (date and year) when formulating search queries in tool calls. Remember it is 2026 this year.`）與**知識截止日**（`Your knowledge cutoff date is January 2025.`）。
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Google · Prompt design strategies（Gemini 3 Flash strategies） — https://ai.google.dev/gemini-api/docs/prompting-strategies#gemini_3_flash_strategies
- **適用/注意**：Google 版對 Gemini 3 Flash 標示，但同樣適用於任何需要嚴格 RAG 的場景。

<a id="e91"></a>
### 91. ⭐ 引用行為與檢索預算要寫進 prompt（Grounding, citations, and retrieval budgets）
- **使用方式**：定義三件事：什麼需要證據支撐、什麼算足夠證據、資訊缺失時怎麼辦；並且**只引用真的檢索到的來源，推論要另外標示**。再給一個**檢索預算**——什麼情況才值得再搜一次。
  - 官方 prompt：`For ordinary Q&A, start with one broad search using short, discriminative keywords. If the top results contain enough support for the core request, answer from those results. / Make another retrieval call only when a required fact, owner, date, ID, or source is missing; the user asked for exhaustive coverage or comparison; a specific artifact must be read; or an important claim would otherwise be unsupported. / Do not search again only to improve phrasing, add examples, or support nonessential detail.`
- **出處**：OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6 系列。「檢索預算」是相對新的技巧。

<a id="e92"></a>
### 92. 引用格式規範（Citation format）
- **使用方式**：把引用的**位置與格式**規定清楚：緊接在相關陳述之後，單一來源用 `[NAME](ID)`，多個來源用逗號分隔。**DeepSeek 公開了自家 Web/App 的網頁搜尋回答模板，本身就是一份寫好的 rubric**（逐字節錄）：每筆搜尋結果以 `[webpage X begin]...[webpage X end]` 包住；`请按照引用编号[citation:X]的格式在答案中对应部分引用上下文。如果一句话源自多个上下文，请列出所有相关的引用编号，例如[citation:3][citation:5]，切记不要将引用集中在最后返回引用编号，而是在答案对应部分列出。` 同一份模板還規定了：`并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。`、列舉題 `尽量将答案控制在10个要点以内`、創作題 `请务必在正文的段落中引用对应的参考编号……不能只在文章末尾引用。`、`你的回答应该综合多个相关网页来回答，不能重复引用一个网页。`、`除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。`
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - DeepSeek · DeepSeek-R1 README（Official Prompts：Web Search） — https://github.com/deepseek-ai/DeepSeek-R1
  - Microsoft · Prompt engineering techniques（Specifying the output structure） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：GPT-4.1 RAG。⭐ **Microsoft 給了「為什麼要求引用能降低幻覺」的機制解釋**：要求附引用等於**逼模型必須犯兩次錯**才編得出東西（先編內容、再編引用）——`"Asking for citations makes it so that the model must make two errors every time it generates a response: the first error is the fabricated response, and the second is the bad citation."`；而且 **行內引用優於文末引用**，因為 `"the closer the citation is to the text it supports, the shorter the distance ahead the model needs to anticipate the citation, which suggests that inline citations are better mitigations for false content generation than citations at the end of the content."` ✅ 這與 DeepSeek 模板的 `切记不要将引用集中在最后` **不約而同**——兩家從不同角度得到同一條規則。

<a id="e93"></a>
### 93. Web search 與引用規則（`<web_search_rules>`）
- **使用方式**：事實可能不確定時**優先上網查而不是假設**；所有取自網路的資訊都要附引用；優先採用近期來源；先講清楚研究深度、要求涵蓋而不要一直反問澄清。
- **出處**：OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：GPT-5.2。

<a id="e94"></a>
### 94. 研究的停止條件：邊際價值遞減就停（Stop when marginal value drops）
- **使用方式**：多來源反覆研究直到**再搜也不會實質改變答案或增加有意義細節**為止；過程中查證主張、解決矛盾、補上高價值的相鄰材料。
  - 官方原句：`Keep iterating until additional searching is unlikely to materially change the answer or add meaningful detail.`
- **出處**：OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：GPT-5.2。與 #171 的 stopping conditions 是同一個家族。

<a id="e95"></a>
### 95. 跨來源查證與結構化研究流程（Research and information gathering）
- **使用方式**：三件事：① **給清楚的成功標準**（什麼才算成功回答了這個研究問題）；② **要求跨來源查證**；③ 複雜研究用結構化流程——官方原句：`Search for this information in a structured way. As you gather data, develop several competing hypotheses. Track your confidence levels in your progress notes to improve calibration. Regularly self-critique your approach and plan. Update a hypothesis tree or research notes file to persist information and provide transparency.`
- **出處**：Anthropic · Prompting best practices（Research and information gathering） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#research-and-information-gathering
- **適用/注意**：所有現行 Claude 模型。

<a id="e96"></a>
### 96. ⭐ 進度宣稱必須有工具結果佐證（Ground progress claims）
- **使用方式**：長時間自主執行時，要求模型把**每一項進度宣稱對照本次 session 的工具結果做稽核**。
  - 官方 prompt：`Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that.`
- **出處**：Anthropic · Prompting Claude Fable 5（Ground progress claims during long runs） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#ground-progress-claims-during-long-runs
- **適用/注意**：Fable 5 / Mythos 5；長程自主任務。官方測試：這**幾乎完全消除了捏造的狀態回報**，即使在刻意誘發的任務上。

<a id="e97"></a>
### 97. 讀過再說：agentic coding 的抗幻覺指令（Minimizing hallucinations in agentic coding）
- **使用方式**：直接下一段禁止臆測的規則：`Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.`
- **出處**：Anthropic · Prompting best practices（Minimizing hallucinations in agentic coding） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#minimizing-hallucinations-in-agentic-coding
- **適用/注意**：所有現行 Claude 模型；agentic coding。OpenAI 的等價寫法見 #169 第 2 條（`do NOT guess or make up an answer`）。

<a id="e98"></a>
### 98. ⚠️ 開了引用不代表每次都會引用（Citations are not guaranteed）
- **使用方式**：xAI 誠實揭露：啟用 inline citations **不保證**模型每次都會引用，引不引由模型自行判斷；而且 `citations` 清單裡的 URL **不一定**都被最終答案引用（只是探索過程中看過）。所以引用完整性要在應用層檢查，不能只靠開關。
- **出處**：xAI · Citations — https://docs.x.ai/developers/tools/citations
- **適用/注意**：⚠️ 預設值不一致——Responses API 預設**啟用**（回應文字可能直接含 `[[N]](url)`），xAI Python SDK 預設**停用**。

<a id="e99"></a>
### 99. URL context 的三條使用規則
- **使用方式**：① 給**直接 URL**——模型只會抓你提供的 URL，不會跟著頁面裡的連結再往下爬；② 先確認 URL **不需要登入、不在付費牆後**；③ 用**完整 URL 含協定**（`https://www.google.com` 而不是 `google.com`）。
- **出處**：Google · URL context（Best practices） — https://ai.google.dev/gemini-api/docs/url-context#best-practices
- **適用/注意**：Gemini URL context 工具。

<a id="e100"></a>
### 100. 什麼時候該用文件集合檢索（Collections Search 的六種情境）
- **使用方式**：六種官方適用情境：企業知識庫（內部文件與政策）／財務分析（跨多份 SEC filing、財報）／客服（依產品文件回答）／研究與盡職調查（綜合論文、技術報告、產業分析）／法遵與法務（回應必須錨在官方指引與法規）／個人知識管理。它做的是**語意檢索**（依意義與脈絡而非只有關鍵字）。附加檔案時系統會**自動啟用文件檢索，把請求轉成 agentic workflow**。
- **出處**：
  - xAI · Collections Search — https://docs.x.ai/developers/tools/collections-search#when-to-use-collections-search
  - xAI · Chat with Files — https://docs.x.ai/developers/model-capabilities/files/chat-with-files
- **適用/注意**：這是 RAG（#23）的產品化形式。

<a id="e281"></a>
### 281. 幻覺的三種成因與對應修法（Reducing hallucinations）
- **使用方式**：Meta 把幻覺拆成三種情境，每一種都給一個 prompt 層的修法：
  1. **知識缺口**（問到模型沒學過的主題）→ 補足脈絡與資訊，並**要求它為每個主張提供來源或證據**。
  2. **缺少觀點設定**（問題需要特定立場或視角）→ 補上那個角色的**目標、價值與信念**。
  3. **缺少語氣設定**（問題需要特定語氣或風格）→ 補上**受眾與溝通目的**。
- **出處**：Meta · Prompt engineering（Reducing hallucinations） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：Llama 全系列。原文：`"A well-crafted prompt can help to reduce hallucination in language models, by providing them with clear and accurate information and context."`；官方另指向 Meta Responsible Use Guide 第 14–17 頁。這條的價值在於**把「模型亂講」拆成可診斷的三類**，剛好對應本檔三條不同的修法：補脈絡（#23）、要求引用（#92）、定義角色與語氣（#48、#116）。

<a id="e282"></a>
### 282. 結構化萃取抑制幻覺的四要素：任務指令＋格式模板＋注意事項＋輸出示例
- **使用方式**：要模型從一段對話或文件裡抽出多個維度並輸出 JSON 時，官方給的組合拳是四件事一起上：
  - `任务指令：明确告诉模型需要做什么，用指令形式而非联想形式描述任务，减少模型理解的层数。`
  - `回答格式：指定 JSON 格式模板，让模型严格按照结构化格式输出，有效减少幻觉。`
  - `注意事项：提出对模型的明确要求与限制，如"准确性优先""不能更改原文"等，进一步约束模型行为。`
  - `输出示例：提供符合格式要求的样例数据，是避免模型产生幻觉的最有效方式。`
- **出處**：Qwen（阿里雲百煉）· 文生文 Prompt 指南（優化案例二） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- **適用/注意**：官方結論句：`当需要模型输出结构化数据时，提供明确的格式模板和符合格式的示例数据是最有效的优化手段。同时，使用"准确性优先""不能更改原文"等限制性指令，可以有效减少模型的幻觉现象。` 值得注意的是它把「**附一筆符合格式的樣例資料**」列為**抑制幻覺**最有效的手段（而不只是控制格式），這與 #39／#43 把範例定位成「控格式與語氣」不同。同族做法：缺欄位設 `null`（#132）、讓 schema 承擔格式（#129）、JSON 模式要附範例（#284）。

---

<a id="ch10"></a>
## 第 10 章　輸出格式、長度、語氣與結構化輸出

<a id="e101"></a>
### 101. 直接指定回應格式（Response format）
- **使用方式**：明講你要什麼形狀——表格、條列、電梯簡報、關鍵字、單句或段落。也可以用 system instruction 控制整體詳盡程度：`All questions should be answered comprehensively with details, unless the user requests a concise response specifically.`
- **出處**：
  - Google · Prompt design strategies（Response format） — https://ai.google.dev/gemini-api/docs/prompting-strategies#response-format
  - Meta · Prompt engineering（Formatting） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Cohere · A Guide to Crafting Effective Prompts（Example Outputs / Structured Output） — https://docs.cohere.com/docs/crafting-effective-prompts
- **適用/注意**：全部。Google 除錯清單把「沒指定輸出格式」列為常見缺陷（#200）：不要讓模型猜結構，而且**要在 few-shot 範例裡把輸出結構示範出來**。Meta 的最小寫法就是三句話：`Use bullet points.` / `Return as a JSON object.` / `Use fewer technical terms and help me apply it in my work in communications.` ⭐ **Cohere 更進一步：不要說「適當時使用條列」，直接把輸出骨架畫出來**——用佔位符示範每一行長什麼樣（`High level summary: <summary>` ＋ `3 important events related to the series:` ＋ `* <important event 1>` …），要 JSON 就把整個 JSON 骨架連同 `"<include a short summary of the text here>"` 這類說明一起寫進 prompt（`"JSON works particularly well with the Command R models."`）。要**保證**符合 schema 則要走 Structured Outputs（#121、#124）。

<a id="e102"></a>
### 102. 用 XML 格式指示器指定輸出區塊（XML format indicators）
- **使用方式**：直接指定輸出要包在哪個標籤裡，例如：`Write the prose sections of your response in <smoothly_flowing_prose_paragraphs> tags.`
- **出處**：Anthropic · Prompting best practices（Control the format of responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用/注意**：所有現行 Claude 模型。

<a id="e103"></a>
### 103. Prompt 本身的排版風格會傳染給輸出（Match your prompt style to the desired output）
- **使用方式**：如果格式一直不聽話，試著把 prompt 本身寫成你想要的樣子——例如**把 prompt 裡的 markdown 拿掉，輸出的 markdown 量也會減少**。
- **出處**：Anthropic · Prompting best practices（Control the format of responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用/注意**：所有現行 Claude 模型。

<a id="e104"></a>
### 104. 用一段詳細的格式偏好區塊減少 markdown／條列濫用
- **使用方式**：想精細控制就給一段規範區塊（官方範本標籤 `<avoid_excessive_markdown_and_bullet_points>`）：長文用流暢散文段落；markdown 保留給 inline code、code block 與簡單標題；除非是真正離散的項目或使用者明確要求，否則不要用有序／無序清單。
  - 官方句子：`When writing reports, documents, technical explanations, analyses, or any long-form content, write in clear, flowing prose using complete paragraphs and sentences.` ／ `NEVER output a series of overly short bullet points.` ／ `Your goal is readable, flowing text that guides the reader naturally through ideas rather than fragmenting information into isolated points.`
- **出處**：Anthropic · Prompting best practices（Control the format of responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用/注意**：所有現行 Claude 模型。

<a id="e105"></a>
### 105. Markdown 只在語義正確的地方用，並在長對話中週期性重申
- **使用方式**：只在語義正確處使用 Markdown（inline code、code fence、清單、表格）；用反引號標示檔案／資料夾／函式／類別名稱；inline 數學用 `\( \)`。長對話會漂移，所以**每 3–5 則使用者訊息就把 Markdown 指令再附一次**。另有一個歷史性開關：從 `o1-2024-12-17` 起，在第一行寫 `Formatting re-enabled` 可以開啟 markdown。
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用/注意**：原文：`"Append Markdown instruction every 3-5 user messages to maintain consistent adherence over long conversations."`——「長對話中要週期性重申格式指令」是很實用的一條。

<a id="e106"></a>
### 106. 數學式預設用 LaTeX，要純文字必須明講（LaTeX output）
- **使用方式**：現行 Claude 模型的數學式預設輸出 LaTeX。要純文字就要把所有形式都禁掉並指定替代寫法：`Format your response in plain text only. Do not use LaTeX, MathJax, or any markup notation such as \( \), $, or \frac{}{}.`（並指定用 `/`、`*`、`^`）
- **出處**：Anthropic · Prompting best practices（LaTeX output） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#latex-output
- **適用/注意**：所有現行 Claude 模型。

<a id="e107"></a>
### 107. 給具體的長度限制，並做分層 verbosity（Concrete length constraints）
- **使用方式**：不要說「短一點」，給數字並分層。官方範例：預設 3–6 句；是非題 ≤2 句；複雜任務用結構化條列。API 層則用 `text.verbosity` 設定該次請求的**預設**詳細度，prompt 只管任務專屬需求。還可以**全域設低、區域覆寫**——Cursor 的做法是全域 low verbosity，只對「寫程式碼與程式工具」用自然語言覆寫成 high：`Write code for clarity first. Use high verbosity for writing code and code tools.`
- **出處**：
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
  - OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Cohere · A Guide to Crafting Effective Prompts（Length Control） — https://docs.cohere.com/docs/crafting-effective-prompts
- **適用/注意**：`"While API verbosity parameter is default, GPT-5 is trained to respond to natural-language verbosity overrides."` **Cohere 明列三種可用的長度單位並各給一句可抄的句型**：段落（`"give a summary in two paragraphs"`）、句數（`"make the response between 3 and 5 sentences long"`）、字數（`"the completion should be at least 100 and no more than 200 words long"`），並宣稱 `"Command A models excel at length control."` ⚠️ **與 Mistral「不要叫模型數字數」（#286）方向相反**——兩者的分界是：**要求輸出多長**可以（生成時可以逼近），**要求模型對輸入做長度判斷**不可靠。

<a id="e108"></a>
### 108. ⭐ 要「短」就明講「什麼必須保留」（Say what to preserve）
- **使用方式**：指定哪些資訊**必須保留**、哪些**可以省略**，遠比單純說「短一點」有效。
  - 官方 prompt：`Lead with the conclusion. Include the evidence needed to support it, any material caveat, and the next action. Omit secondary detail and repetition.` ／ `Keep all required facts, decisions, caveats, and next steps. Trim introductions, repetition, generic reassurance, and optional background first.`
- **出處**：OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
- **適用/注意**：GPT-5.6。「保留清單 vs 刪除清單」是這條的核心結構。

<a id="e109"></a>
### 109. ⚠️ 遷移時重新檢視「Be concise」這類籠統的簡潔指令
- **使用方式**：GPT-5.6 本身就更簡潔，籠統的 `Be concise` 可能適得其反——升級時把這類指令拿出來重新評估是否還有用。
- **出處**：OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
- **適用/注意**：GPT-5.6。

<a id="e110"></a>
### 110. 現行 Claude 模型更簡潔——想要摘要就要明講
- **使用方式**：現行模型的溝通風格比舊版更直接、以事實為本（不自我慶祝）、更口語、更精簡。副作用是它可能**跳過工具呼叫後的口頭摘要**直接做下一步。要摘要就補一句：`After completing a task that involves tool use, provide a quick summary of the work you've done.`
- **出處**：Anthropic · Prompting best practices（Communication style and verbosity） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#communication-style-and-verbosity
- **適用/注意**：⚠️ **Claude Opus 5 是例外**——預設回應比前代長，而且調高／調低 effort 都不會可靠改變可見長度，要明確 prompt 要求簡潔。

<a id="e111"></a>
### 111. ⭐ `effort` 控制的是「想多少」不是「說多少」（Effort ≠ response length）
- **使用方式**：降 effort 會減少思考量，但**不會可靠地縮短可見回應**。要控制長度就要明確 prompt。長 system prompt 中，建議在**結尾附近**再放一次簡短提醒。
  - 官方句子：`Keep responses focused, brief, and concise. Keep disclaimers and caveats short, and spend most of the response on the main answer.` ／ `<tone_preference>Keep outputs reasonably concise.</tone_preference>`
- **出處**：Anthropic · Prompting Claude Opus 5（Response length and verbosity） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#response-length-and-verbosity
- **適用/注意**：Claude Opus 5。

<a id="e112"></a>
### 112. Sonnet 5 依任務複雜度自動校準長度（Calibrated response length）
- **使用方式**：Sonnet 5 不是固定冗長度，而是依複雜度自動校準。要更短就下正面示範：`Provide concise, focused responses. Skip non-essential context, and keep examples minimal.`
- **出處**：Anthropic · Prompting Claude Sonnet 5（Response length and verbosity） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#response-length-and-verbosity
- **適用/注意**：⚠️ 官方強調：**正面示範（示範你要的簡潔度）比負面指令有效**。

<a id="e113"></a>
### 113. 「對話冗長度」與「寫到檔案的文件長度」要分開下指令
- **使用方式**：這是兩件事。針對寫到磁碟的文件另外校準：`Match the length of written documents to what the task needs: cover the substance, but do not pad with filler sections, redundant summaries, or boilerplate.`
- **出處**：Anthropic · Prompting Claude Opus 5（Written deliverable length） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#written-deliverable-length
- **適用/注意**：Claude Opus 5。

<a id="e114"></a>
### 114. 一句話就能改行為；而且「好讀」與「短」是兩回事
- **使用方式**：指令跟隨強的模型上，**一句簡短指令**就能取代逐條列舉每一種行為。兩個要點：**先講結果**（`Lead with the outcome. Your first sentence after finishing should answer 'what happened' or 'what did you find'`）；以及縮短的方法是**有選擇地刪內容**（刪掉不會改變讀者下一步行動的細節），**不是**把文字壓成碎片、縮寫或箭頭鏈。另附檢查點行為：`Pause for the user only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input that only they can provide. If you hit one of these, ask and end the turn, rather than ending on a promise.`
- **出處**：Anthropic · Prompting Claude Fable 5（Strong instruction following） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#strong-instruction-following
- **適用/注意**：Fable 5 / Mythos 5。原文：`"Being readable and being concise are different things, and readability matters more."`

<a id="e115"></a>
### 115. ⭐ 最終摘要要「重新落地」，不是工作腦內語言的延續（Readability when communicating with the user）
- **使用方式**：長 agentic 對話後，模型容易寫出難懂的文字（箭頭鏈縮寫、深度實作細節、引用使用者沒看到的 thinking）。關鍵洞見：**工具呼叫之間用簡寫沒問題（那是你在想事情），但最終摘要的讀者沒看過那一切**。可直接引用的官方句子：`The vocabulary you built up while working is yours, not theirs; leave it behind unless you re-introduce it.` ／ `If you have to choose between short and clear, choose clear.`
- **出處**：Anthropic · Prompting Claude Fable 5（Readability when communicating with the user） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#readability-when-communicating-with-the-user
- **適用/注意**：Fable 5 / Mythos 5；長 agentic 對話。

<a id="e116"></a>
### 116. 用**具體的寫作選擇**定義語氣，不要用模糊標籤（Define the tone）
- **使用方式**：不要說「專業一點」「友善一點」，描述會定義語氣的寫作決策——例如答案要多直接、要不要先承認對方的問題、什麼時候才安撫。
  - 官方 prompt：`State the answer directly. If the user reports a problem, acknowledge the specific issue before giving the next step. Use reassurance only when it is relevant. Omit generic praise and unnecessary sign-offs.`
  - Anthropic 的等價範例（覆寫 Opus 4.8 預設的直接、有主見、少驗證性用語、少 emoji 的風格）：`Use a warm, collaborative tone. Acknowledge the user's framing before answering.`
- **出處**：
  - OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
  - Anthropic · Prompting Claude Opus 4.8（Tone and writing style） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8#tone-and-writing-style
  - Meta · Prompt engineering（Stylization） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Cohere · An Overview of System Messages（Command A 預設 system message） — https://docs.cohere.com/docs/system-instructions
- **適用/注意**：OpenAI 的說法是 `"Personality controls tone, warmth, directness, formality, humor, empathy, and polish."`（對應 #35 八段模板的 Personality 欄位）。**Meta 把「風格化」拆成三種可直接套的句型**：類比某種節目或受眾（`Explain this to me like a topic on a children's educational network show teaching elementary students.`）、宣告自己的身分與用途再下限制（`I'm a software engineer using large language models for summarization. Summarize the following text in under 250 words:`）、指定敘事人格（`Give your answer like an old-timey private investigator hunting down a case step-by-step.`）。⭐ **Cohere 直接公開 Command A 的預設 system message**，本身就是一份「風格規範怎麼寫」的教科書級範例（逐字節錄）：`If the input is ambiguous, ask clarifying follow-up questions.` / `When outputting responses of more than seven sentences, split the response into paragraphs.` / `Prefer the active voice.` / `Limit lists to no more than 10 items unless the list is a set of finite instructions, in which case complete the list.` / `Use the third person when asked to write a summary.` / `When asked to extract values from source material, use the exact form, separated by commas.` / `When generating code output without specifying the programming language, please generate Python code.` —— **每一條都是「具體的寫作選擇」而不是形容詞**。反向極端（明列禁用片語）見 #271。

<a id="e117"></a>
### 117. 提供的樣板句要求變化，避免逐字重複（Vary sample phrases）
- **使用方式**：給模型範例句時，要同時要求它不要在同一段對話裡逐字重複——`Never repeat sample phrase in same conversation; vary to avoid sounding repetitive.`
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1。

<a id="e118"></a>
### 118. 進度更新的節奏：只在階段變更或發現改變計畫時更新
- **使用方式**：不要叫模型旁白每一次例行工具呼叫。統一節奏：
  - OpenAI GPT-5.6：`Before tool calls for a multi-step task, send a one- or two-sentence user-visible update that states the first step. During the task, update only when a major phase begins or a finding changes the plan.`
  - OpenAI GPT-5.2（`<user_updates_spec>`）：`Send brief updates (1–2 sentences) only when you start a new major phase or discover plan-changing information.`
  - Anthropic Opus 5：`Before your first tool call, say in one sentence what you're about to do. While working, give a brief update only when you find something important or change direction. When you finish, lead with the outcome.`
- **出處**：
  - OpenAI · Prompting guidance for GPT-5.6（Long-running workflows and state） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
  - Anthropic · Prompting Claude Opus 5（User-facing progress updates） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#user-facing-progress-updates
  - Anthropic · Prompting Claude Sonnet 5（User-facing progress updates） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#user-facing-progress-updates
- **適用/注意**：⚠️ **舊鷹架要拆掉**：`"If you've added scaffolding to force interim status messages ('After every 3 tool calls, summarize progress'), try removing it."`（Sonnet 5 / Opus 4.8）。Anthropic 同時重申：**正面示範比「不要做什麼」的指令有效**。

<a id="e119"></a>
### 119. Tool preamble：工具呼叫前後都要對使用者說話（Tool preambles）
- **使用方式**：在重要步驟前給一段清楚的 preamble，說明為什麼要呼叫這個工具；GPT-4.1 的版本更硬：**呼叫工具前後都要 message 使用者**，讓他們一直在狀況內。
  - 官方 prompt 片段：
    ```
    <tool_preambles>
    - Always begin by rephrasing the user's goal in a friendly, clear manner.
    - Then outline a structured plan detailing each logical step.
    </tool_preambles>
    ```
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：⚠️ 與 #118「不要旁白例行呼叫」看似衝突——差別在**重要步驟／新階段 vs 例行呼叫**，以及 minimal reasoning（#75）需要更多 preamble。

<a id="e120"></a>
### 120. 去掉開場白（Remove preamble）
- **使用方式**：直接在 system prompt 下指令：`Respond directly without preamble. Do not start with phrases like "Here is...", "Based on...", etc.` 或者改成要模型輸出在 XML 標籤內、用 structured outputs、用 tool calling。**偶爾漏出來的開場白就在後處理階段砍掉**。
- **出處**：
  - Anthropic · Prompting best practices（Migrating away from prefilled responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
  - Meta · Prompt engineering（Limiting extraneous tokens） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：Claude 4.6+（因為 prefill 已不能用，見 #251）。**Meta 把這件事寫成一個「四技疊加」的示範**——要模型只吐你要的東西（不要 `"Sure! Here's more information on…"`），官方解法是**角色 ＋ 規則限制 ＋ 明確指令 ＋ 一個範例**四樣同時上：
  ```
  You are a robot that only outputs JSON. You reply in JSON format with the field 'zip_code'.
  Example question: What is the zip code of the Empire State Building?
  Example answer: {'zip_code': 10118}
  Question: What is the zip code of Menlo Park?
  ```
  原文：`"By combining a role, rules and restrictions, explicit instructions, and an example, the model can be prompted to generate the desired response."`

<a id="e121"></a>
### 121. 用 Structured Outputs 約束輸出結構（取代 prefill 控格式）
- **使用方式**：需要輸出符合特定 schema 時，優先用 Structured Outputs 功能。官方也建議**先直接叫模型照結構輸出試試**——新模型被告知後能可靠符合複雜 schema，尤其搭配重試機制。**分類任務**用帶 enum 欄位的工具或 structured outputs。
- **出處**：
  - Anthropic · Prompting best practices（Migrating away from prefilled responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
  - Mistral · Prompting best practices（Structured Outputs） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：Claude 4.6+。Mistral 的定位一致：`"To ensure the model generates structured and predictable responses, we provide the ability of enforcing a specific JSON output format. This is particularly useful for tasks requiring a consistent structure that can be easily parsed and processed programmatically."` ⚠️ 注意「格式參數」與「schema 保證」的差別，見 #124 與 #284。

<a id="e122"></a>
### 122. Structured Outputs 是什麼、帶來什麼（OpenAI）
- **使用方式**：用它可以得到**可靠的型別安全**、**明確的 refusal 欄位**、以及**更簡單的 prompt**——不必再為格式問題寫驗證與重試邏輯。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：GPT-4o 起；新專案官方建議從 `gpt-5.6` 開始。

<a id="e123"></a>
### 123. Structured Outputs vs Function calling：怎麼選
- **使用方式**：判準很簡單——**要把模型接到工具／函式／資料**時用 function calling；**只是想讓模型回覆使用者時輸出有結構**時用 `text.format` 的 Structured Outputs。Google 的說法一樣：Structured Outputs 是「格式化最終回應」，Function Calling 是「在對話中採取行動」。
- **出處**：
  - OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
  - Google · Structured output（vs function calling） — https://ai.google.dev/gemini-api/docs/structured-output#vs-function-calling
- **適用/注意**：Google 同頁的五條 best practices：清楚的 `description`（引導模型）／強型別（integer、string、enum）／prompt 也要講清楚要做什麼／**輸出雖然語法上是合法 JSON，值仍要在應用層驗證**／對「符合 schema 但語意錯誤」的輸出做錯誤處理。schema 的 `title`（屬性的簡短說明）與 `description`（較長詳細說明）都是給模型看的提示。

<a id="e124"></a>
### 124. ⭐ Structured Outputs vs JSON mode：一律優先用前者
- **使用方式**：Structured Outputs **保證符合 schema**，JSON mode 只保證是合法 JSON。官方：`"We recommend always using Structured Outputs instead of JSON mode when possible."` 若真的要用 JSON mode，**必須在 prompt 裡明確要求輸出 JSON**，否則可能產生「無止盡的空白字元串流」。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：全部。

<a id="e125"></a>
### 125. Structured Outputs 的 schema 硬性要求與不支援功能
- **使用方式**：所有欄位都必須 `required`（要做選填就用與 `null` 的 union）；物件必須永遠設 `additionalProperties: false`；根層必須是 object，不能是 `anyOf`。上限：5000 個 property、10 層巢狀、所有 property 合計 1000 個 enum 值。**不支援** `allOf`、`not`、`dependentRequired`、`if/then/else`；fine-tuned 模型另外不支援字串的 `minLength`/`maxLength`/`pattern`/`format`、數值限制、`patternProperties`、陣列的 `minItems`/`maxItems`。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：全部。

<a id="e126"></a>
### 126. 處理 refusal：拒絕不會照你的 schema 走
- **使用方式**：模型拒絕時回應會帶一個 `refusal` 欄位、內容 `type: "refusal"`，**不會符合你的 schema**。程式要先檢查它，同時也要處理不完整回應與內容過濾。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：全部。

<a id="e127"></a>
### 127. Structured Outputs 的四條 best practices
- **使用方式**：① 鍵名要清楚直覺；② 重要的鍵加上清楚的 `title` 與 `description`；③ **建立並使用 eval 來決定哪種結構最好用**；④ 用原生 SDK 支援（Pydantic / Zod）避免 JSON schema 分歧（divergence）。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：全部。

<a id="e128"></a>
### 128. 在 prompt 裡處理「輸入無法符合 schema」的情況
- **使用方式**：schema 只保證形狀，不保證輸入一定填得進去。官方建議在 prompt 指令中明確涵蓋「輸入無法對應到 schema 時該怎麼辦」。
- **出處**：OpenAI · Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- **適用/注意**：全部。與 #132（缺欄位設 null）是同一個問題的兩種解法。

<a id="e129"></a>
### 129. ⭐ 讓 schema 承擔格式，prompt 只負責講任務（Division of labour）
- **使用方式**：既然欄位規格已經定義在 JSON Schema 裡，就**不要在 system prompt 再把欄位重講一次**。官方 invoice 範例的 system prompt 短到只有一句：`Given a raw invoice, carefully analyze the text and extract the relevant invoice data into JSON format.`
- **出處**：xAI · Structured Outputs（System prompt） — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#system-prompt
- **適用/注意**：這是「精簡 prompt」（#207）在格式領域的具體落地。

<a id="e130"></a>
### 130. ⭐ 分清楚「引擎保證」與「模型盡力」的 schema 關鍵字
- **使用方式**：xAI 老實列出哪些約束是結構性強制、哪些只是模型盡力（**盡力的部分要自己在應用層驗**）。
  - **保證上限**：`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum` 無上限；`minLength`/`maxLength` 到 2,048；`minItems`/`maxItems` 到 256；`minProperties`/`maxProperties` 到 64。
  - **僅盡力（不保證）**：`not` / `if` / `then` / `else` / 超過一個子 schema 的 `allOf` / 未列在 String formats 的 `format` 值 / 超過上述上限的約束。
  - **會被 400 拒絕**：零 variant 的 `enum` 或 `anyOf` / schema 為 `true` 或 `false` 的 property / `maxContains` / `minContains` / `items` 寫成陣列（tuple 驗證要用 `prefixItems`）。
  - 其他：`additionalProperties` 預設 `false`，要開必須明寫 `true`；可為 null 用型別陣列 `{"type": ["string", "null"]}` 或含 null 的 `anyOf`；未列在 `required` 的欄位視為選填；Draft 2020-12 最佳，Draft-07 也接受。
- **出處**：xAI · Structured Outputs（Best-effort keywords） — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#best-effort-keywords
- **適用/注意**：教你分辨「哪些約束是系統保證的、哪些要自己驗」——這個習慣適用於所有廠商。

<a id="e131"></a>
### 131. `pattern` 正則的隱含全字串比對（xAI regex 子集）
- **使用方式**：xAI 的 `pattern` 有幾個容易寫錯的語意差異：`^` 與 `$` 是**隱含的**（pattern 永遠比對整個字串，不必自己加）；`.` **會**匹配換行；捕獲群組 `(...)` 沒有語意作用（等同非捕獲群組）。**不支援**：反向參照（`\1`、`\k<name>`）、Unicode property escapes（`\p{L}`）、詞邊界（`\b`、`\B`）、lookahead／lookbehind、inline modifiers。
- **出處**：xAI · Structured Outputs（Regex support） — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#regex-support-pattern
- **適用/注意**：`grok` 模型的 structured outputs。

<a id="e132"></a>
### 132. ⭐ 結構化萃取：缺欄位設 `null` 而不是猜（`<extraction_spec>`）
- **使用方式**：提供明確 JSON schema 或輸出形狀，區分必填／選填欄位，並明講：`Always follow this schema exactly (no extra fields); if a field is not present, set to null rather than guessing.` 回傳前再掃一次做完整性檢查。
- **出處**：
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
  - Microsoft · Prompt engineering techniques（Specifying the output structure） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：GPT-5.2；萃取／PDF／Office 工作流。⭐ **Microsoft 補了一個很精緻的萃取陷阱**：不指定結構時，模型會吐出「X 做了 Y **而且** Z」這種**複合陳述**，事後很難逐項查證；解法是**規定輸出結構**——`"if you ask the model to extract factual statements from a paragraph, it might extract compound statements such as 'X is doing Y AND Z' (which can be harder to verify). This can be avoided by specifying an output structure such as (entity1, relationship, entity2)."` 抑制幻覺的四要素組合見 #282。

<a id="e133"></a>
### 133. 文件創作：簡報／動畫／視覺文件要明確要求設計元素
- **使用方式**：現行模型製作簡報、動畫、視覺文件的指令跟隨度高，通常第一次就能產出可用結果；想要好結果就**明確要求設計元素、視覺層級與動畫**。
  - 官方句型：`Create a professional presentation on [topic]. Include thoughtful design elements, visual hierarchy, and engaging animations where appropriate.`
- **出處**：Anthropic · Prompting best practices（Document creation） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#document-creation
- **適用/注意**：所有現行 Claude 模型。呼應遷移六要點中的「Request specific features explicitly」（#252）。

<a id="e283"></a>
### 283. 把答案放在可解析的固定位置：`\boxed{}` 與 `"answer": "C"`
- **使用方式**：兩家官方給了同一組「照抄就能用」的規範句，讓推理過程與最終答案能被程式**穩定切出來**：
  - 數學題：`Please reason step by step, and put your final answer within \boxed{}.`（Qwen 與 DeepSeek 逐字相同）
  - 選擇題：`Please show your choice in the answer field with only the choice letter, e.g., "answer": "C".`
- **出處**：
  - Qwen · Qwen3-235B-A22B 模型卡（Best Practices） — https://huggingface.co/Qwen/Qwen3-235B-A22B
  - DeepSeek · DeepSeek-R1 README（Usage Recommendations） — https://github.com/deepseek-ai/DeepSeek-R1
- **適用/注意**：Qwen3 / Qwen3.5 / QwQ 全系列（同句亦見於 Instruct-2507、Thinking-2507、QwQ-32B 模型卡）、DeepSeek-R1 系列。同一個設計思路在其他家的變體：Meta 要求把答案包在三個反引號裡好讓外部程式抽取後投票（#288）、Cohere 把 CoT 改成 `{reasoning, answer}` 的 JSON（#61）、OpenAI 的 Structured Outputs（#121–#132）。**推理與答案混在同一段文字時，先想「程式要怎麼把答案切出來」**。

<a id="e284"></a>
### 284. JSON 模式：光設參數不夠，prompt 裡必須出現 "json" 並附一個範例
- **使用方式**：DeepSeek 的 JSON 輸出有三個硬性前置條件，其中兩個在 **prompt 層**：
  1. `response_format` 設成 `{'type': 'json_object'}`；
  2. **system 或 user prompt 裡必須出現 "json" 這個字**，而且要**附上期望的 JSON 範例**；
  3. `max_tokens` 要設夠，避免 JSON 字串中途被截斷。
  官方 system prompt 範例（逐字）：`The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.` 後面接 `EXAMPLE INPUT:` 與 `EXAMPLE JSON OUTPUT:` 兩段示範。
- **出處**：DeepSeek · JSON Output — https://api-docs.deepseek.com/guides/json_mode
- **適用/注意**：官方另誠實揭露：`"When using the JSON Output feature, the API may occasionally return empty content. We are actively working on optimizing this issue. You can try modifying the prompt to mitigate such problems."` ✅ **這與 OpenAI 的 JSON mode 規則一致**（#124：沒在 prompt 明確要求輸出 JSON 可能產生無止盡的空白字元串流）——兩家共識：**格式參數保證的是「合法」，不是「你要的那個形狀」**；要保證形狀請改用 Structured Outputs（#121、#124）。

<a id="e285"></a>
### 285. 分類任務的兩種輸出策略與取捨，並一定要寫兜底類別
- **使用方式**：同一個分類任務有兩條路，官方把取捨講明：
  - **直接輸出標籤**（模型只回一個詞或字串）：有效、快、便宜，**輸出 token 最少**，但可靠性與彈性較差。
  - **輸出 JSON 物件**：可靠、有彈性、好接下游處理，代價是多花一點 token，但能支援更複雜的用例。
  另外兩個細節：**把「不屬於任何類別」的兜底類別明寫進 prompt**（官方範例的 `customer_service`），以及用一句話把輸出鎖死——`You will only respond with the category among the categories listed above without any explanations or notes, in a single self-contained compound term.`
- **出處**：Mistral · Prompting best practices（Classification） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：原文：`"Ask for the label directly… Effective, fast and cheap, this strategy will use the less amount of output tokens but may lack reliability and flexibility."`／`"Ask for a json output… Reliable, flexible and practical, this strategy will generate slightly more tokens but allows for more complex use cases and more flexibility."` 這是少見的「兩個作法都對、選哪個看情境」官方教材。兜底類別的做法與 #28 的護欄句、#89（允許說不知道）、#132（缺欄位設 null）同族——**永遠給模型一條合法的退路，它才不用硬編一個答案**。

<a id="e286"></a>
### 286. ⚠️ 不要叫模型數字數：把 `charCount` 當成輸入資料餵給它
- **使用方式**：與長度有關的**條件判斷**不要交給模型算。官方連「超過 100 字就拆開」都列為要避免的寫法，因為模型不會數字數；正解是**在輸入資料裡就把字數當成一個欄位提供**：
  ```
  Existing records:
  - { record: "User: Alice, Age: 30", charCount: 15 }
  - { record: "User: Bob, Age: 25", charCount: 13 }
  New data:
  - { data: "User: Charlie, Age: 35", charCount: 17 }
  ```
- **出處**：Mistral · Prompting best practices（What to Avoid） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：官方的避免清單是**兩條都不行**：`"Avoid: 'If the record is too long, split it into multiple records.'"`（模糊）與 `"Avoid: 'If the record is longer than 100 characters, split it into multiple records.'"`（精確但模型算不出來），正解是 `"Instead, provide character counts as input"`。⚠️ **與 Cohere「Command A 擅長長度控制，段落／句數／字數都能指定」（#107）方向相反**——差別在於：**要求輸出多長**是可以的（模型生成時可以逼近），**要求模型對輸入做長度判斷**則不可靠。同族原則見 #10（能用參數或程式保證的就不要用 prompt 拜託）與 #154（該算的交給工具）。

---

<a id="ch11"></a>
## 第 11 章　工具使用與 Function Calling

<a id="e134"></a>
### 134. ⭐ 工具描述是工具效能**最重要**的因素（Tool descriptions）
- **使用方式**：每個工具的 description 要涵蓋四件事：**做什麼**、**什麼時候該用（以及什麼時候不該用）**、**回傳什麼／關鍵回傳欄位**、**重要的注意事項與限制（包含「這個工具不會回傳什麼」與錯誤處理）**；每個參數的意義與格式也要寫。
  - 官方好例：`Retrieves the current stock price for a given ticker symbol. The ticker symbol must be a valid symbol for a publicly traded company on a major US stock exchange like NYSE or NASDAQ. The tool will return the latest trade price in USD. It should be used when the user asks about the current or most recent price of a specific stock. It will not provide any other information about the stock or company.`
  - 官方壞例：`Gets the stock price for a ticker.`
- **出處**：
  - Anthropic · Define tools（Best practices for tool definitions） — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
  - OpenAI · Prompting guidance for GPT-5.6（Tool routing） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
  - Google · Function calling（Best practices） — https://ai.google.dev/gemini-api/docs/function-calling#best-practices
  - xAI · Function Calling（Tool schema reference） — https://docs.x.ai/developers/tools/function-calling#tool-schema-reference
- **適用/注意**：⚠️ **廠家分歧（重要教材）**——Anthropic 說 `"Provide extremely detailed descriptions. This is by far the most important factor in tool performance."`，並要求**每個工具描述至少 3–4 句，複雜的要更多**；OpenAI GPT-5.6 則說 `"Expose only tools relevant to the task, and keep their descriptions concise and precise."`（見 #135）。Google 的八條 best practices 還包含：命名要具描述性且無空白與特殊字元、強型別（integer/string/enum）、**同時啟用的工具維持在 10–20 個以內**、prompt 也要給脈絡、執行前先驗證 function call、做穩健的錯誤處理、外部 API 用適當的認證。xAI 則直白定位：`"description | Yes | What the tool does — helps the model decide when to use it"`（每次請求上限 200 個工具）。

<a id="e135"></a>
### 135. 工具數量要控制，只暴露與任務相關的工具（Fewer tools）
- **使用方式**：起手可用的函式數量目標 **< 20**（Google 說 10–20）；大量或不常用的工具用 **tool search / deferred tools** 延後載入。GPT-5.6 更進一步：只暴露任務相關的工具，並讓描述簡潔精確。
- **出處**：
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
  - OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
  - Mistral · Ministral-3-8B-Reasoning-2512 模型卡（Tools） — https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512
- **適用/注意**：原文：`"Aim for fewer than 20 functions available at the start of a turn"`。Mistral 在模型卡上給了同方向的明文建議（agentic prompt 少見）：`"Keep the set of tools well-defined and limit their number to the minimum required for the use case - Avoiding overloading the model with an excessive number of tools."`

<a id="e136"></a>
### 136. 在 system prompt 明確定義「該用」與「不該用」工具的情境
- **使用方式**：用兩個清單把邊界寫死：
  ```
  - Use tools when:
    - The user wants to cancel or modify an order.
  - Do not use tools when:
    - The user asks a general question like "What's your return policy?"
    - The user asks something outside your retail role (e.g., "Write a poem").
  ```
- **出處**：
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：原文：`"Use the system prompt to describe when (and when not) to use each function. Generally, tell the model exactly what to do."`

<a id="e137"></a>
### 137. 把使用準則寫進 function description 本身
- **使用方式**：不要只靠 system prompt——**description 裡就要說明何時該被呼叫、參數該怎麼組**，因為那是模型選工具時最直接讀到的東西。
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。

<a id="e138"></a>
### 138. 關鍵規則要放在描述的**最前面**（Position within the description）
- **使用方式**：description 裡最重要的那條規則放第一句。官方 ripgrep 的例子就是把「特殊字元要跳脫」放在模型最先讀到的位置。
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。與 #37（位置效應）同源。

<a id="e139"></a>
### 139. 在工具定義裡附範例與邊界案例（`input_examples` / few-shot in description）
- **使用方式**：清楚的描述最重要，但對**輸入複雜、有巢狀物件、或格式敏感參數**的工具，再附上範例：
  - Anthropic：用 `input_examples` 欄位提供**通過 schema 驗證**的範例（範例會與 tool schema 一起放進 prompt）。
  - OpenAI：在 function description 裡放 few-shot（官方 ripgrep 範例用一張「字面 → regex pattern」對照表教模型跳脫特殊字元），並**針對反覆出現的失敗補上邊界案例**。
- **出處**：
  - Anthropic · Define tools（Providing tool use examples） — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#providing-tool-use-examples
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：`input_examples` 限制——每個範例必須通過 `input_schema` 驗證（否則 400）；不支援 server tools；簡單範例約 20–50 tokens、複雜巢狀約 100–200 tokens。

<a id="e140"></a>
### 140. 工具命名要有 namespace；描述不可重疊；schema 要扁平
- **使用方式**：工具跨多個服務時用服務前綴（`github_list_prs`、`slack_send_message`），工具庫變大時選擇才不會模糊。同時避免多個工具用途重疊或描述含糊（模型會叫錯）；參數樹**不要層層巢狀**，扁平（欄位放在最上層）比較可靠。能用結構化 `tools` 參數就用，真的要在自由文字裡定義工具就把它當自訂協定處理。
- **出處**：
  - Anthropic · Define tools — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：搭配 tool search 時 namespace 特別重要。MCP 相關建議：用 `allowed_tools` 只載入必要工具縮小 payload；回傳 `mcp_list_tools` 或帶 `previous_response_id` 避免重複匯入工具以降低延遲。

<a id="e141"></a>
### 141. 把相關操作合併成較少的工具；不要叫模型填你已經知道的參數
- **使用方式**：與其為每個動作開一個工具（`create_pr`、`review_pr`、`merge_pr`），不如合成一個帶 `action` 參數的工具——**更少、更強的工具**能減少選擇模糊。同理，**總是連著呼叫的函式就合併起來**，而且已知的參數由程式帶入，不要讓模型填。
- **出處**：
  - Anthropic · Define tools — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：原文：`"Don't make the model fill arguments you already know"` ／ `"Combine functions that are always called in sequence."`

<a id="e142"></a>
### 142. 工具回傳只給「高訊號」資訊（High-signal tool results）
- **使用方式**：回傳語意明確、穩定的識別碼（slug、UUID），不要回不透明的內部參照；**只回模型下一步推理需要的欄位**。臃腫的回應會浪費 context，也讓模型更難抓到重點。
- **出處**：Anthropic · Define tools — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
- **適用/注意**：所有支援工具的 Claude 模型。

<a id="e143"></a>
### 143. 套用軟體工程原則：最小驚訝、用 enum 讓非法狀態無法表示
- **使用方式**：函式要「顯而易懂」（principle of least surprise）；用 enum 與物件結構讓非法狀態根本表達不出來，而不是靠 prompt 拜託模型不要傳錯。
- **出處**：OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：原文：`"Use enums and object structure to make invalid states unrepresentable."` 與 #10 是同一個元原則。

<a id="e144"></a>
### 144. ⭐ 實習生測試（The intern test）
- **使用方式**：一個好用的自我檢查——**「一個實習生／人類，只拿到你給模型的東西，能不能正確使用這個函式？」** 不行就補描述。
- **出處**：OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：與 Anthropic 的「黃金法則」（#12）是同一個思路的工具版，適合做成跨廠家對照。

<a id="e145"></a>
### 145. `tool_choice` 四種模式與一個重要副作用
- **使用方式**：四種模式一致：`auto`（模型自己決定，預設）／`any`｜`required`（必須至少呼叫一個工具，但不指定哪個）／`tool`｜指定 function（強制呼叫特定工具）／`none`（禁用工具）。
- **出處**：
  - Anthropic · Define tools（Forcing tool use） — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
  - xAI · Function Calling（Tool choice） — https://docs.x.ai/developers/tools/function-calling#tool-choice
- **適用/注意**：⚠️ **重要副作用（Anthropic）**：`tool_choice` 設為 `any` 或 `tool` 時，API 會 prefill assistant 訊息去強制呼叫工具，**模型就不會在 `tool_use` 區塊前輸出任何自然語言解釋，即使你明確要求也一樣**。要同時保留說明就改用 `auto` ＋ 在 `user` 訊息裡明講：`What's the weather like in London? Use the get_weather tool in your response.`

<a id="e146"></a>
### 146. Strict mode：保證工具參數符合 schema
- **使用方式**：Anthropic 在自訂工具加 `strict: true`；OpenAI **建議永遠開啟** strict mode（需要 `additionalProperties: false` 且所有欄位標 `required`）；xAI 則是**隱含永遠為 true**，不需設定。最強的保證組合：`tool_choice: {"type": "any"}` ＋ strict = 一定會呼叫工具**且**參數嚴格符合 schema。
- **出處**：
  - Anthropic · Strict tool use — https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - xAI · Structured Outputs — https://docs.x.ai/developers/model-capabilities/text/structured-outputs
- **適用/注意**：xAI：`"the strict flag is implicitly always true"`；`"When using supported schema features, the response is guaranteed to match your schema."`

<a id="e147"></a>
### 147. 工具 `parameters` 的根必須是 object，否則 400
- **使用方式**：工具參數的根型別必須是 `"type": "object"`；其他型別要巢狀在 `properties` 裡。根層的 `anyOf` / `oneOf` **只有在每個分支本身都是 object 時**才行；否則（純量、陣列、含非 object 分支的聯集）無法編譯成 tool-call 文法，會被 400 拒絕並指名該工具。
- **出處**：xAI · Function Calling（Parameter schema） — https://docs.x.ai/developers/tools/function-calling#parameter-schema
- **適用/注意**：`grok` 模型。

<a id="e148"></a>
### 148. 平行工具呼叫（Parallel tool calling）
- **使用方式**：現行模型會自動平行呼叫互不相依的工具。想把成功率推到接近 100%，給一段規則區塊（`<use_parallel_tool_calls>`）：`If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls.` 反向也可以要求循序：`Execute operations sequentially with brief pauses between each step to ensure stability.` API 層則可用 `parallel_tool_calls: false` 保證「剛好零個或一個工具被呼叫」。
- **出處**：
  - Anthropic · Prompting best practices（Optimize parallel tool calling） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#optimize-parallel-tool-calling
  - OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：xAI 預設也開啟平行呼叫（`"Process all of them before continuing."`），同樣可用 `parallel_tool_calls: false` 關掉（見 #145 出處）。兩條硬規則：**有相依關係不可平行**、**絕不可用佔位符或猜測缺少的參數**。

<a id="e149"></a>
### 149. 調整「什麼時候會呼叫工具」的判斷邊界，並記得寫例外條款
- **使用方式**：預設 `tool_choice: auto` 下，模型每回合自行判斷（請求對應到某工具的描述能力、且答案不在 context 裡就呼叫；穩定知識、創作任務、閒聊則直接回答）。你可以用 system prompt 三個強度調整：`Use your judgment about whether to call a tool or respond directly.`（保守）→ `Use the tools to investigate before responding.`（增加）→ `Always call a tool first before responding.`（最強）。⚠️ **但「一律呼叫工具」會造成幻覺**，一定要補例外條款：
  ```
  - Always call a tool before answering factual questions
  - However, if insufficient information to properly call tool, ask user for details needed
  ```
- **出處**：
  - Anthropic · Tool use overview（When Claude uses tools） — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview#when-claude-uses-tools
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：「規則 ＋ 例外條款」是很好的進階教學結構。

<a id="e150"></a>
### 150. 缺少必要參數時：問使用者，不要猜
- **使用方式**：模型行為有差——**Claude Opus 比較會發現參數缺失並主動詢問**；**Claude Sonnet 可能會問（尤其被要求先思考再輸出工具請求時），但也可能推測一個合理值**。所以要明講：`Validate arguments against the format before sending the call; if you are unsure, ask for clarification instead of guessing.`
- **出處**：
  - Anthropic · Tool use overview（When Claude uses tools） — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview#when-claude-uses-tools
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：與 #148 的「絕不用佔位符」呼應。

<a id="e151"></a>
### 151. ⭐ 明確禁止「承諾稍後再呼叫工具」的幻覺
- **使用方式**：直接下規則：`Do NOT promise to call a function later. If a function call is required, emit it now; otherwise respond normally.`
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。Anthropic 的等價問題是「宣告要做但沒真的呼叫工具就結束回合」，見 #185。

<a id="e152"></a>
### 152. 明確規定工具呼叫的**順序**
- **使用方式**：某些任務有硬性前後關係，就把順序寫成編號步驟並指名工具：
  ```
  To Process a refund for a delivered order, follow the following steps:
  1. Confirm the order was delivered. Use: `order_status_check`
  2. Check the refund eligibility policy. Use: `refund_policy_check`
  3. Create the refund request. Use: `refund_create`
  4. Notify the user of refund status. Use: `user_notify`
  ```
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。GPT-5.6 的等價護欄：`Before taking an action, resolve required discovery, retrieval, and validation steps. Do not skip a prerequisite because the intended final state seems obvious.`（見 #134 出處）

<a id="e153"></a>
### 153. 混用 hosted tools 與自訂函式時，明確指定偏好順序與 fallback
- **使用方式**：兩個工具都做得到時要講清楚誰優先、什麼時候退而求其次：`When both could be used, prefer calculate_shipping_cost for accuracy and policy compliance. Fall back to python only if the custom tool is unavailable or fails.`
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。

<a id="e154"></a>
### 154. 明確要求「寧可用工具也不要自己算」（Prefer tools over internal computation）
- **使用方式**：把該交給工具的類別列出來：`You have access to a code_interpreter. Always prefer using code_interpreter when a user asks a question involving: math problems, data analysis, generating or executing code, formatting or transforming structured text. Avoid doing these directly in your own response.` Google 給了兩條更簡潔的規則：**需要冷門或近期事實 → 開 Google Search grounding；需要任何算術／計數／計算 → 開 code execution。**
- **出處**：
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - Google · Prompt design strategies（Grounding and code execution） — https://ai.google.dev/gemini-api/docs/prompting-strategies#grounding_and_code_execution
  - Meta · Prompt engineering（Program-aided language models） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Microsoft · Prompt engineering techniques（Use of affordances） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：這是抗幻覺最有效的結構性做法之一。**Meta 把理由講得最直白**——模型不擅長算數但很擅長寫程式，所以把計算任務轉成「產生程式碼再執行」（Program-Aided Language）：`"LLMs, by nature, aren't great at performing calculations. While LLMs are bad at arithmetic, they're great for code generation."`，官方 prompt 就兩句：`Only return Python code, nothing else.` ＋ `Generate python code to calculate the following: …`。**Microsoft 則給了沒有原生工具呼叫時的土法**：`"One simple way to use an affordance is to stop generation once the affordance calls are generated by the model, then paste the outcomes back into the prompt."`（並指出 search 這類 affordance `"can be an affordance to help mitigate against fabricated answers, and to get up-to-date information."`）。⚠️ 有原生 `tools` 欄位就不要自己拼字串，見 #155。

<a id="e155"></a>
### 155. 用 API 原生的 `tools` 欄位，不要把 schema 手動塞進 prompt
- **使用方式**：讓 API 解析工具定義，而不是自己把 JSON schema 寫進 prompt 文字裡。官方實測：**pass rate 提升約 2%**。
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - Qwen · Qwen3-235B-A22B 模型卡（Agentic Use） — https://huggingface.co/Qwen/Qwen3-235B-A22B
- **適用/注意**：GPT-4.1。同一個精神在 Qwen 是「**別自己寫工具呼叫模板，用官方框架**」：`"We recommend using Qwen-Agent to make the best use of agentic ability of Qwen3. Qwen-Agent encapsulates tool-calling templates and tool-calling parsers internally, greatly reducing coding complexity."`（https://github.com/QwenLM/Qwen-Agent）——**工具協定屬於基礎設施，不屬於 prompt**。

<a id="e156"></a>
### 156. Deferred tools / tool search：詳細指引放函式描述，namespace 描述保持精簡
- **使用方式**：用 tool search 延後載入大型或不常用的工具面時，**把詳細指引放在函式描述裡，namespace 的描述保持精簡**。
- **出處**：OpenAI · Function calling — https://developers.openai.com/api/docs/guides/function-calling
- **適用/注意**：使用 deferred / tool search 時。

<a id="e157"></a>
### 157. ⚠️ 把「CRITICAL / MUST」這類強語氣**調弱**（避免過度觸發）
- **使用方式**：以前為了避免工具「觸發不足」而寫的強硬語氣，在新模型上會造成**過度觸發**。修法很簡單：`CRITICAL: You MUST use this tool when...` → `Use this tool when...`
- **出處**：Anthropic · Prompting best practices（Tool usage） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用/注意**：Claude Opus 4.5 / 4.6 及之後。與 #18、#70 同屬「強度反轉」家族。

<a id="e158"></a>
### 158. Thinking 關閉或模型偏好推理時，要明確推一把去用工具（Tool use triggering）
- **使用方式**：thinking 關掉時，模型比較不會主動找工具或搜尋——**如果你依賴工具呼叫，就在 system prompt 加一句明確的推力**。另外 `high` / `xhigh` effort 在 agentic 搜尋與編碼上會明顯用更多工具。Opus 4.8 有個特性：**傾向用推理取代工具呼叫**（多數情況結果更好），想增加工具使用就**調高 effort**，尤其在知識工作上。
- **出處**：
  - Anthropic · Prompting Claude Sonnet 5（Tool use triggering） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#tool-use-triggering
  - Anthropic · Prompting Claude Opus 4.8（Tool use triggering） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8#tool-use-triggering
- **適用/注意**：Claude Sonnet 5 / Opus 4.8。

<a id="e159"></a>
### 159. Programmatic Tool Calling（PTC）：什麼時候該用、什麼時候不該用
- **使用方式**：PTC 讓模型用 JavaScript 在託管環境裡編排工具。**適合有界的工作流**：過濾、join、排序、聚合、批次、把大量中間輸出縮成精簡 schema。**不適合**單次呼叫，或需要語義判斷的地方（那些留給直接工具呼叫）。官方骨架：
  ```
  <tool_orchestration>
  Use Programmatic Tool Calling for [bounded stage] using only [eligible tools].
  Run independent calls concurrently when safe. Use only documented tool input and output fields.
  Process and reduce the intermediate results, then emit exactly [output schema], including the evidence needed for the final answer.
  Stop when [condition] is met. Retry transient failures at most [R] times.
  Do not repeat completed calls or perform side-effecting actions. If a required result is still missing, return a clear structured failure.
  Use direct tool calls for [semantic judgment, approval, or final validation].
  </tool_orchestration>
  ```
- **出處**：OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6 系列。⚠️ `program_output` 與最終 assistant `message` 是**兩個獨立輸出**，兩邊都要測。

<a id="e160"></a>
### 160. 工具使用規則區塊（`<tool_usage_rules>`）
- **使用方式**：一段可重用的規則：需要新鮮或使用者專屬資料時**優先用工具而非內部知識**；工具描述要精準；獨立操作鼓勵平行化；高影響改動要求驗證步驟與重述。
  - 官方原句：`Prefer tools over internal knowledge whenever you need fresh or user-specific data.`
- **出處**：OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：GPT-5.2。

<a id="e161"></a>
### 161. 工具組合的四個推薦配方（Suggested tool combinations）
- **使用方式**：「你想做什麼 → 該開哪些工具」的官方對照：
  - 研究與分析資料 → **Web Search ＋ Code Execution**（搜尋收集資訊、程式分析與視覺化）
  - 匯整新聞與社群 → **Web Search ＋ X Search**
  - 從多來源萃取洞見 → **Web Search ＋ X Search ＋ Code Execution**
  - 監控即時討論 → **X Search ＋ Web Search**
  只要把工具放進 `tools` 陣列，模型會依任務自行編排。
- **出處**：xAI · Advanced Tool Usage — https://docs.x.ai/developers/tools/advanced-usage#suggested-tool-combinations
- **適用/注意**：`grok` 模型。

<a id="e162"></a>
### 162. ⚠️ 伺服器端工具的輸出**不會**回傳給你
- **使用方式**：串流時看得到每一次工具呼叫的決策，但**伺服器端工具的輸出不會出現在 API 回應裡**——模型只在內部使用。所以若你需要「模型把依據講出來」，必須在 prompt 裡明確要求它把重點寫進最終回應（不能指望從 API 撈出來）。
- **出處**：xAI · Tool Usage Details — https://docs.x.ai/developers/tools/tool-usage-details#real-time-server-side-tool-calls
- **適用/注意**：`grok` 的 server-side 工具。

<a id="e163"></a>
### 163. 函式回應必須嚴格對齊 `id` / `name` / 數量（Function response matching）
- **使用方式**：每個 FunctionResponse 必須帶對應 FunctionCall 的 `id`、`name` 要一致、數量要一對一。
- **出處**：Google · What's new in Gemini 3.5 Flash（Function calling） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#function-calling
- **適用/注意**：⚠️ **很難 debug 的坑**：Interactions API 會報錯，但 **GenerateContent API 不會報錯**，而是讓模型回**空回應 ＋ `finish_reason: STOP`**。

<a id="e164"></a>
### 164. ⚠️ 多模態函式回應與行內指令的正確擺法（避免 thought leakage）
- **使用方式**：兩個常見錯誤都會造成「思考外洩」與品質下降：① 把圖片放在 function response **外面**；② 把額外指令當成另一個 part 附在 function response 旁邊。正確做法：**多模態內容放進 function response 的 parts 裡**；**額外指令用兩個換行接在 function response 文字結尾**。
- **出處**：Google · What's new in Gemini 3.5 Flash（Multimodal function responses / Inline instructions） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#multimodal-function-responses
- **適用/注意**：Gemini 3.x。

<a id="e165"></a>
### 165. ⚠️ 要求模型在工具呼叫前輸出結構化文字會壞掉（Malformed_Function_Call）
- **使用方式**：如果你要求模型在呼叫工具**之前**先輸出 `<UPDATE>...</UPDATE>` 這類結構化文字（XML/YAML/JSON），工具呼叫可能偶爾以 `Malformed_Function_Call` 失敗。三種解法（依官方優先序）：
  1. **首選——把「工作筆記」做成一個 `update()` 函式**：`Before calling any other tool, in every response you MUST first call update with all required parameters (previous_step, plan, next_step, external).`（四個參數：`previous_step` 上一步的關鍵發現與結果／`plan` 計畫目前狀態／`next_step` 依計畫下一個立即動作的簡短說明／`external` 給使用者看的白話說明）
  2. 改用 Markdown 標題寫筆記（`# UPDATE`、`## PLAN`）而不是結構化文字。
  3. 乾脆不要求模型在工具呼叫前輸出文字。
- **出處**：Google · Function calling（Workarounds for pre-tool text requirements） — https://ai.google.dev/gemini-api/docs/function-calling#workarounds-for-pre-tool-text-requirements
- **適用/注意**：⚠️ 這條與 #119（tool preamble）**直接互動**——想要 preamble 又想要穩定工具呼叫，Google 的答案是「把 preamble 變成一次工具呼叫」。

<a id="e166"></a>
### 166. 工具呼叫過多的兩招：降 thinking level ＋ 給「動作預算」
- **使用方式**：thinking level 越高，模型越愛用工具去探索與驗證。先降級（medium → low → minimal）；還是太多就加一句動作預算：`You have a limited action budget of <n> tool calls. Use them efficiently.`
- **出處**：Google · What's new in Gemini 3.5 Flash（Reducing tool calls） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#reducing-tool-calls
- **適用/注意**：Gemini 3.x agentic workflow。

<a id="e167"></a>
### 167. Code execution：什麼時候該開，以及它的副作用
- **使用方式**：四種該開的情境：**數值問題**（要精確計算不要估算）、**資料處理**（分析 prompt 裡的複雜資料）、**複雜邏輯**（需要中間結果的多步計算）、**驗證**（覆核數學結果或驗證假設）。可直接照抄的情境 prompt：`Calculate the Sharpe ratio for a portfolio with returns [0.12, 0.08, -0.03, 0.15] and risk-free rate 0.02` ／ `Perform a t-test to compare these two groups and interpret the p-value: Group A: […], Group B: […]` ／ `Solve this differential equation using numerical methods: dy/dx = x^2 + y, with initial condition y(0) = 1`。
- **出處**：
  - xAI · Code Execution Tool — https://docs.x.ai/developers/tools/code-execution#when-to-use-code-execution
  - Google · Code execution（Limitations） — https://ai.google.dev/gemini-api/docs/code-execution#limitations
- **適用/注意**：⚠️ Google 的誠實副作用警告：`"In some cases, enabling code execution can lead to regressions in other areas of model output (for example, writing a story)."` 而且不同模型使用 code execution 的能力不一。xAI 沙箱限制：檔案系統存取受限、無法連外部網路、所有運算 stateless。

<a id="e168"></a>
### 168. 做一個「直接顯示給使用者」的工具（send-to-user tool）
- **使用方式**：長時間非同步代理時，給模型一個能在**不結束回合**的情況下把訊息原封不動顯示給使用者的工具。關鍵原理：**工具的輸入永遠不會被摘要，所以內容能完整送達**。但**光定義工具不夠**——沒有 system prompt 的引導語，模型很少會呼叫它：`Between tool calls, when you have content the user must read verbatim (a partial deliverable, a direct answer to their question), call the send_to_user tool with that content. Use send_to_user only for user-facing content, not for narration or reasoning.`
- **出處**：Anthropic · Prompting Claude Fable 5（Create a send-to-user tool） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#create-a-send-to-user-tool
- **適用/注意**：Fable 5 / Mythos 5；長時間非同步代理。
---

<a id="ch12"></a>
## 第 12 章　代理系統：自主性、狀態、記憶與多步流程

<a id="e169"></a>
### 169. ⭐ 三條經典 agentic 提醒（Persistence / Tool-calling / Planning）
- **使用方式**：官方實測這三條合計讓 SWE-bench Verified 表現**提升約 20%**：
  1. **Persistence**：`You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user.`
  2. **Tool-calling（用工具，不要猜）**：`If you are not sure about file content or codebase structure, use your tools to read files and gather the relevant information: do NOT guess or make up an answer.`
  3. **Planning（規劃與反思）**：`You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls.`
  GPT-5 系列的等價三要點：徹底規劃（把 query 拆成所有必要子請求、每次工具呼叫後反思、確認全部完成才結束回合）／重要步驟前給 preamble／用 TODO 清單工具或 rubric 強制結構化規劃。
- **出處**：
  - OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
  - OpenAI · Prompt engineering（Prompting current GPT-5 series models） — https://developers.openai.com/api/docs/guides/prompt-engineering#prompting-current-gpt-5-series-models
- **適用/注意**：⚠️ 第 3 條（Planning）**只適用於非推理模型**——對 o 系列反而會降低表現（見 #57）。官方另量化：prompt 誘發的規劃提升 4%。

<a id="e170"></a>
### 170. 代理積極度是一條連續光譜，兩個方向都要會調（Controlling agentic eagerness）
- **使用方式**：模型可以被推到光譜任一端。
  - **降低積極度**：給 `<context_gathering>` 區塊（`Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.`）＋ 降低 `reasoning_effort`。
  - **提高積極度**：給 `<persistence>` 區塊（`You are an agent - please keep going until user's query is completely resolved. / Only terminate when sure problem is solved. / Never stop or hand back to the user when you encounter uncertainty — research or deduce.`）。
  - Anthropic 的等價兩個開關：`<default_to_action>`（`By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing.`）與 `<do_not_act_before_instructions>`（`Do not jump into implementation or change files unless clearly instructed to make changes. When the user's intent is ambiguous, default to providing information, doing research, and providing recommendations rather than taking action.`）。
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Anthropic · Prompting best practices（Tool usage） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用/注意**：GPT-5 系列；所有現行 Claude 模型。

<a id="e171"></a>
### 171. ⭐ Outcome-first：描述終點與成功標準，不規定路徑；並定義停止條件
- **使用方式**：GPT-5.6 最強的用法是**定義目標結果、成功標準、限制與可用脈絡，然後讓模型自己選路徑**，同時定義停止條件。
  ```
  Resolve the customer's issue end to end.

  Success means:
  - make the eligibility decision from available policy and account evidence
  - complete any allowed action before responding
  - return completed_actions, customer_message, and blockers
  - if required evidence is missing, ask for the smallest missing field
  ```
- **出處**：OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6 系列。原文：`"Describe the destination rather than prescribing every step."` 「成功標準清單 ＋ 停止條件」也被寫進八段模板（#35）。

<a id="e172"></a>
### 172. ⭐ 定義自主性與核准邊界（Autonomy and approval boundaries）
- **使用方式**：定義每一種請求授權到什麼程度，模型才能在不必要停下來問人的情況下持續安全、在範圍內工作。官方強調 **「簡短的政策通常就夠了」**，而且要**明確列舉安全的本地動作**（讀檔、看 log、改範圍內的程式）。
  ```
  For requests to answer, explain, review, diagnose, or plan, inspect the relevant
  materials and report the result. Do not implement changes unless the request also asks for them.

  For requests to change, build, or fix, make the requested in-scope local changes
  and run relevant non-destructive validation without asking first.

  Require confirmation for external writes, destructive actions, purchases, or a
  material expansion of scope.
  ```
- **出處**：OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：⚠️ **不要重複「先問過我」這類許可語句**——`"Repeating instructions such as 'ask first,' 'do not mutate,' or 'wait for approval' can cause unnecessary approval requests."`

<a id="e173"></a>
### 173. 依「可逆性」決定要不要先問（Balancing autonomy and safety）
- **使用方式**：給一段可逆性政策：`Consider the reversibility and potential impact of your actions. You are encouraged to take local, reversible actions like editing files or running tests, but for actions that are hard to reverse, affect shared systems, or could be destructive, ask the user before proceeding.` 再補一句：`When encountering obstacles, do not use destructive actions as a shortcut.`（例如不要用 `--no-verify` 抄捷徑）
  - 官方三類需要先問的動作：**破壞性**（刪檔／刪 branch／drop table／`rm -rf`）、**難以復原**（`git push --force`、`git reset --hard`、改已發布的 commit）、**別人看得到**（push、在 PR/issue 留言、送訊息、改共用基礎設施）。
- **出處**：Anthropic · Prompting best practices（Balancing autonomy and safety） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#balancing-autonomy-and-safety
- **適用/注意**：Claude Opus 4.6 起；agentic。Google Computer Use 的等價安全規則見 #248。

<a id="e174"></a>
### 174. 明講邊界：什麼時候該交付「評估」而不是「修改」
- **使用方式**：兩段可直接用的邊界句：`When the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one.` ／ `Before running a command that changes system state (restarts, deletes, config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause.`
- **出處**：Anthropic · Prompting Claude Fable 5（State the boundaries） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#state-the-boundaries
- **適用/注意**：Fable 5 / Mythos 5。

<a id="e175"></a>
### 175. ⭐ 抑制過度工程化與 scope drift（Overeagerness / scope constraints）
- **使用方式**：新一代模型傾向多開檔案、加不必要的抽象、做沒人要求的彈性。Anthropic 給四個面向的抑制指令：**Scope**（只做被要求的）、**Documentation**（不要幫沒改的程式加註解／型別）、**Defensive coding**（不要為不可能發生的情況加錯誤處理，只在系統邊界驗證）、**Abstractions**（不要為一次性操作做抽象、不要為假想的未來需求設計）。核心句：`Avoid over-engineering. Only make changes that are directly requested or clearly necessary.` ／ `The right amount of complexity is the minimum needed for the current task.`
  - OpenAI GPT-5.2 的 `<design_and_scope_constraints>`：`Implement EXACTLY and ONLY what the user requests. No extra features, no added components.`（採用「最簡單的有效詮釋」）
  - 讓產出符合既有 codebase 標準的 `<code_editing_rules>`：`Model-written code should adhere to existing style and design standards and blend in neatly to codebase.` ／ `Clarity and Reuse: Every component should be modular and reusable. / Consistency: UI must adhere to consistent design system.`
  - 把過強的探索語氣調弱（Cursor 案例）：移除 `maximize_` 前綴、軟化「徹底」相關語氣；`Bias towards not asking user for help if you can find answer yourself.`
- **出處**：
  - Anthropic · Prompting best practices（Overeagerness） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overeagerness
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用/注意**：Claude Opus 4.5 / 4.6；GPT-5 / GPT-5.2。

<a id="e176"></a>
### 176. 不要為了通過測試而寫死（Avoid hardcoding to tests）
- **使用方式**：一段可直接用的規則：`Implement a solution that works correctly for all valid inputs, not just the test cases. Do not hard-code values or create solutions that only work for specific test inputs.` ／ `Tests are there to verify correctness, not to define the solution.` ／ `If the task is unreasonable or infeasible, or if any of the tests are incorrect, please inform me rather than working around them.`
- **出處**：Anthropic · Prompting best practices（Avoid focusing on passing tests and hardcoding） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#avoid-focusing-on-passing-tests-and-hardcoding
- **適用/注意**：所有現行 Claude 模型；coding。

<a id="e177"></a>
### 177. Coding agent 的具體規範清單（Coding agent prompt rules）
- **使用方式**：官方彙整的可照抄規則：用 `apply_patch` 做檔案編輯（`"to match the training distribution"`）／終端指令效率（`Do not use ls -R, find, or grep—these are slow. Use rg and rg --files.`）／根因修復（`Fix the problem at root cause rather than applying surface-level patches when possible.`）／改動最小化並與既有風格一致／pre-commit 抓到的既有錯誤不要順手修（`Do not fix pre-existing errors on lines you didn't touch`）／清理（`Check git status to sanity check changes; revert any scratch files or unintended modifications.`）／移除加上去的 inline 註解／`NEVER add copyright or license headers unless specifically requested.`／完成說明的長度依任務大小調整／`Do NOT tell user to save file if already created or modified using apply_patch.`
  另有 GPT-5 系列 coding 任務的 prompt 要點：把模型框成軟體工程 agent 並明定職責、清楚說明工具用法、指定何時**不要**用某些模式、要求用單元測試或 Python 指令驗證改動、**謹慎驗證 patch**（`apply_patch` 這種工具可能回傳成功但其實失敗）、給具體的指令呼叫範例（`"which improves reliability"`）、要求乾淨且語義正確的 Markdown（檔案路徑／函式／類別用反引號）。
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide（Appendix） — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - OpenAI · Prompt engineering（Prompting current GPT-5 series models） — https://developers.openai.com/api/docs/guides/prompt-engineering#prompting-current-gpt-5-series-models
- **適用/注意**：GPT-5 系列 coding agent。

<a id="e178"></a>
### 178. 八步問題解決工作流（Problem-solving workflow）
- **使用方式**：`Understand deeply, investigate, plan, implement incrementally, debug, test frequently, iterate, validate.`
- **出處**：OpenAI · Cookbook: GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用/注意**：GPT-4.1 coding agent。

<a id="e179"></a>
### 179. 互動式編碼產品：主動提出改動讓使用者核可，而不是先問要不要做
- **使用方式**：`Propose changes proactively for user to approve/reject rather than asking whether to proceed with plan.` 理由：`Code edits can be quite proactive as user can always reject them. Code should be easy to review.`
- **出處**：OpenAI · Cookbook: GPT-5 prompting guide（Cursor 案例） — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用/注意**：GPT-5 系列互動式編碼產品。

<a id="e180"></a>
### 180. 長程任務靠「增量推進」維持方向（Long-horizon reasoning and state tracking）
- **使用方式**：官方觀察：`"Claude maintains orientation across extended sessions by focusing on incremental progress, making steady advances on a few things at a time rather than attempting everything at once."` ——設計 prompt 時就要把任務切成可穩定推進的小塊，而不是要求它一次全做完。
- **出處**：Anthropic · Prompting best practices（Long-horizon reasoning and state tracking） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-horizon-reasoning-and-state-tracking
- **適用/注意**：所有現行 Claude 模型；長程 agentic 任務。

<a id="e181"></a>
### 181. ⚠️ Context awareness：告訴模型「context 會自動壓縮，不要提早收工」
- **使用方式**：具備 context awareness 的模型會追蹤剩餘 context，可能在接近上限時自動收尾。若你的 harness 會壓縮 context 或能把狀態寫到外部檔案，就要告訴它：
  `Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Therefore, do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to memory before the context window refreshes… Never artificially stop any task early regardless of the context remaining.`
  另一個相關做法：**不要把剩餘 token 倒數秀給模型看**（`"Avoid surfacing explicit context-budget counts where possible."`），必要時補一句 `You have ample context remaining. Do not stop, summarize, or suggest a new session on account of context limits. Continue the work.`
- **出處**：
  - Anthropic · Prompting best practices（Context awareness and multiwindow workflows） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#context-awareness-and-multiwindow-workflows
  - Anthropic · Prompting Claude Fable 5（Rare cases of context-budget concern） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#rare-cases-of-context-budget-concern
- **適用/注意**：Claude Sonnet 5 / Sonnet 4.6 / Sonnet 4.5 / Haiku 4.5；Fable 5 / Mythos 5。

<a id="e182"></a>
### 182. 跨多個 context window 的工作流（六條）
- **使用方式**：
  1. **第一個 context window 用不同的 prompt**：用它建立框架（寫測試、做 setup script），之後的 context window 才在 todo-list 上迭代。
  2. **讓模型用結構化格式寫測試**（例如 `tests.json`）並強調重要性：`It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality.`
  3. **建立生活品質工具**：鼓勵它做 `init.sh` 之類的啟動腳本。
  4. **重開 vs 壓縮**：現行模型很擅長從本機檔案系統重建狀態，所以開新 context 時要**很明確地指示起手式**（`Call pwd`、`Review progress.txt, tests.json, and the git logs`、先跑一次整合測試）。
  5. **提供驗證工具**：`"As the length of autonomous tasks grows, Claude needs to verify correctness without continuous human feedback."`（例如 Playwright MCP server、computer use）
  6. **鼓勵用完整個 context**：`It's encouraged to spend your entire output context working on the task - just make sure you don't run out of context with significant uncommitted work.`
- **出處**：Anthropic · Prompting best practices（Workflows across multiple context windows） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#workflows-across-multiple-context-windows
- **適用/注意**：所有現行 Claude 模型；長程 agentic。

<a id="e183"></a>
### 183. 狀態管理的四條最佳實務（State management）
- **使用方式**：① **結構化資料用結構化格式**（測試結果、任務狀態 → JSON）；② **進度筆記用非結構化文字**（自由書寫的進度筆記反而好用）；③ **用 git 追蹤狀態**（提供已完成事項的 log 與可還原的檢查點）；④ **強調增量推進**（明確要求它追蹤自己的進度）。
- **出處**：
  - Anthropic · Prompting best practices（State management best practices） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#state-management-best-practices
  - DeepSeek · Multi-round Conversation — https://api-docs.deepseek.com/guides/multi_round_chat
- **適用/注意**：所有現行 Claude 模型。⚠️ 前提提醒：多數 Chat API（DeepSeek 官方明文）是**無狀態**的——上下文必須由呼叫端自己把每一輪訊息串進 `messages`，**沒有「模型會記得剛才那句」這回事**。這也是 #275（思考內容要不要帶回）與 #210（快取只在完全相同前綴命中）之所以會變成規格細節的原因。

<a id="e184"></a>
### 184. ⭐ 建立記憶系統（Construct a memory system）
- **使用方式**：給模型一個地方寫下前次執行的教訓——**簡單到一個 Markdown 檔案就行**。筆記規範（官方原文）：`Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong.` 引導它 bootstrap：`Reflect on the previous sessions we've had together. Use subagents to identify core themes and lessons, and store them in [X].`
- **出處**：Anthropic · Prompting Claude Fable 5（Construct a memory system） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#construct-a-memory-system
- **適用/注意**：Fable 5 / Mythos 5。

<a id="e185"></a>
### 185. 自主 pipeline 要加「不要問、直接做」的提醒（Rare cases of early stopping）
- **使用方式**：長 session 深處，模型偶爾會用純文字宣告「我現在來跑 X」就結束回合（沒真的呼叫工具），或在已有足夠資訊時停下來問許可。加一段 system reminder：
  `You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work.` ＋ `Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ('I'll…', 'let me know when…'), do that work now with tool calls.`
- **出處**：Anthropic · Prompting Claude Fable 5（Rare cases of early stopping） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#rare-cases-of-early-stopping
- **適用/注意**：Fable 5 / Mythos 5；自主 pipeline。OpenAI 的等價規則見 #151。

<a id="e186"></a>
### 186. Subagent 編排：何時委派、何時自己做（Subagent orchestration）
- **使用方式**：現行模型會自己判斷何時該委派，通常不需明講；你要做的是把子代理工具定義好、讓它自然編排，然後**留意過度或不足**。可直接用的政策句：
  - 通用：`Use subagents when tasks can run in parallel, require isolated context, or involve independent workstreams that don't need to share state. For simple tasks, sequential operations, single-file edits, or tasks where you need to maintain context across steps, work directly rather than delegating.`
  - Opus 5 版（更嚴）：`Delegate to a subagent only for large tasks that are genuinely independent and parallelizable, such as a wide multi-file investigation. Do not delegate work you can finish yourself in a handful of tool calls, and do not use subagents to verify or double-check your own work.`
  - Opus 4.8 版（**方向相反**，預設偏少，要鼓勵）：`Do not spawn a subagent for work you can complete directly in a single response… Spawn multiple subagents in the same turn when fanning out across items or reading multiple files.`
  - 非同步委派勝過阻塞等待：`Delegate independent subtasks to subagents and keep working while they run. Intervene if a subagent goes off track or is missing relevant context.`（長壽命的 subagent 跨子任務保留 context，靠 cache read 省時省錢，也避免被最慢的 subagent 卡住）
  - xAI Grok Build 用**權限**定義三種內建 subagent：`general-purpose`（全能）／`explore`（唯讀、不能執行 shell、不能編輯）／`plan`（只寫計畫）；「persona」只是行為疊加層（語氣、focus、contract），不改權限。Subagent 是獨立的子 session，結束時回傳摘要給 parent。
- **出處**：
  - Anthropic · Prompting best practices（Subagent orchestration） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#subagent-orchestration
  - Anthropic · Prompting Claude Opus 5（Controlling subagent spawning） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#controlling-subagent-spawning
  - Anthropic · Prompting Claude Opus 4.8（Controlling subagent spawning） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8#controlling-subagent-spawning
  - Anthropic · Prompting Claude Fable 5（Parallel subagents） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#parallel-subagents
  - xAI · Subagents — https://docs.x.ai/build/features/subagents
- **適用/注意**：⚠️ **模型別差異很大**：Opus 4.6 `"has a strong predilection for subagents and may spawn them in situations where a simpler, direct approach would suffice."`；Opus 5 也比前代更容易委派；**Opus 4.8 反而預設偏少**，需要明確鼓勵。

<a id="e187"></a>
### 187. 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate）
- **使用方式**：三種拆法：
  - **拆指令**：一個 prompt 一個指令，依使用者輸入決定跑哪一個。
  - **Chain（序列）**：多步驟任務中每一步一個 prompt，前一個的輸出當下一個的輸入。訣竅是**在前段就指定輸出格式讓下一段好吃**——官方電信客訴例第一段：`Extract the main issues and sentiments from the customer feedback on our telecom services. … Please format the output into a list with each issue/sentiment in a sentence, separated by semicolon.`
  - **Aggregate（平行）**：對資料的不同部分平行跑不同操作再合併。官方唱片行例的合併段還示範加權：`Recommend a stocklist of about 20 records based on the most sold and most streamed records. Roughly three quarters of the stock list should be based on record sales, and the rest on streaming.`
  好處：`"Smaller prompts can help you improve controllability, debugging, and accuracy."`
- **出處**：
  - Google · Prompt design strategies（Break down prompts into components） — https://ai.google.dev/gemini-api/docs/prompting-strategies#prompt-components
  - Google · Break down complex tasks into simpler prompts — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/break-down-prompts
  - Anthropic · Prompting best practices（Chain complex prompts） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#chain-complex-prompts
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（提示鏈 Prompt Chaining） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Cohere · Advanced Prompt Engineering Techniques（Prompt Chaining） — https://docs.cohere.com/docs/advanced-prompt-engineering-techniques
- **適用/注意**：**Qwen 把 CoT 與提示鏈放在同一個光譜上比較**：CoT `使用起来较为简单`，提示鏈 `虽然相对思维链来说构建模式更加复杂，但模型表现更好，准确率更高。它非常适合逻辑复杂但能按照固定模式拆解的困难任务。` **Cohere 則給了「為什麼非拆不可」的具體理由**——叫模型 `"work through the problem step by step"` 它**有時就是會忘記**（`"an LLM will sometimes try to jump to the answer immediately"`），拆成兩次呼叫（先要分析、再只回 Yes/No）就不會；而且拆開之後 `"one can include more complex instructions without as high of a chance of them being lost in the information overload."` 第二段 prompt 的官方寫法是把前一段的輸出當成一個具名區塊餵回去（`## question` ＋ `## analysis`）。同一次呼叫內的步驟清單見 #287。⚠️ **Anthropic 已把 prompt chaining 的定位下修**：有了 adaptive thinking 與 subagent 編排，大部分多步驟推理都在模型內部完成，顯式 chaining `"is still useful when you need to inspect intermediate outputs or enforce a specific pipeline structure."` 目前最常見的 chaining 模式是**自我修正**：產生草稿 → 依標準審查 → 依審查結果修訂。

<a id="e287"></a>
### 287. 在同一個 prompt 裡寫出任務步驟清單，並指定「只回傳哪一步」
- **使用方式**：這是與 #187（拆成**多個** prompt）互補的另一半：**同一次呼叫內**用編號步驟把解題流程寫出來。五家的官方寫法：
  - **Qwen**：對複雜任務直接加一個 `#任務步驟#` 區塊——`对于许多复杂任务，提醒 LLM 如何完成任务是非常必要的。`（官方數學應用題加上「1. 先計算…2. 再計算…3. 最後計算…」三步驟後就算對了）
  - **Cohere**：編號步驟＋**最後一行指定只輸出哪一步**——`1. Read through the entire text carefully / 2. Extract the most important paragraph / 3. From the paragraph extracted in step 2, extract the most important sentence / 4. Summarize the sentence extracted in step 3 and make it between 30 and 50 words long. / 5. Only return the result of step 4 in your response.`
  - **Meta**：Meta 版的「chain-of-thought」其實是**由你給一串有順序的子問題**（`Begin with: 1. Why it was built 2. Then by how long it took them to build 3. Where were the materials sourced to build 4. Number of people it took to build`），而不是叫模型「一步一步想」。
  - **Mistral**：摘要任務拆成 `## Summarize` → `## Interesting Questions` → `## Write a report` 三個小節，好處是**好 debug**——`"it's easier to solve complex problems when we decompose them into simpler and small steps and it's easier for us to debug and inspect the model behavior."`
  - **Microsoft**：先抽事實、再依事實產生查詢，`"Large language models (LLMs) often perform better if the task is broken down into smaller steps."`
- **出處**：
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（設定完成任務的步驟） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Cohere · A Guide to Crafting Effective Prompts（Task Splitting） — https://docs.cohere.com/docs/crafting-effective-prompts
  - Meta · Prompt engineering（Chain-of-thought prompting） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - Mistral · Prompting best practices（Summarization） — https://docs.mistral.ai/models/best-practices/prompt-engineering
  - Microsoft · Prompt engineering techniques（Break the task down） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：⚠️ **「Chain-of-thought」在各家的定義不同**：OpenAI／Google 指的是「叫模型逐步思考」（#59、#61），Meta 指的是「由你提供一串子問題」——同名不同義，教材要標清楚。⚠️ 對**推理模型**方向相反：不要規定每一個中間步驟（#55），也不要另外下 CoT（#57）；Microsoft 那頁開宗明義就寫 `"These techniques aren't recommended for reasoning models like gpt-5 and o-series models."` Meta 也誠實列出代價：`"Requires effort: The chain of thought technique requires more effort to create and provide the necessary prompts or questions."`

<a id="e188"></a>
### 188. Agentic 行為的九個可調維度（Agentic workflow dimensions）
- **使用方式**：Google 把 agent 行為拆成三大類九個可以在 prompt 裡明確調整的維度：
  - **推理與策略**：`Logical decomposition`（要多徹底分析限制、前置條件與操作順序）／`Problem diagnosis`（診斷深度與溯因推理的使用；接受最明顯的答案還是探索複雜、低機率的解釋）／`Information exhaustiveness`（分析每一份政策文件 vs 優先效率與速度）
  - **執行與可靠度**：`Adaptability`（嚴守初始計畫 vs 觀察與假設矛盾時立刻轉向）／`Persistence and Recovery`（自我修正的程度；高堅持提升成功率但可能造成 token 成本上升或迴圈）／`Risk Assessment`（明確區分低風險探索動作（讀）與高風險狀態改變（寫））
  - **互動與輸出**：`Ambiguity and permission handling`（何時可以假設、何時必須停下來問）／`Verbosity`（工具呼叫旁邊要產生多少文字；執行中要不要向使用者解釋）／`Precision and completeness`（是否必須解決每個邊界案例、給精確數字，還是可以估算）
- **出處**：Google · Prompt design strategies（Agentic workflows） — https://ai.google.dev/gemini-api/docs/prompting-strategies#agentic-workflows
- **適用/注意**：這是一個很好的「agent prompt 檢查表」框架。

<a id="e189"></a>
### 189. Google 官方 agentic system instruction 範本（九點，經研究驗證）
- **使用方式**：官方說這段 system instruction 已被研究人員在 agentic benchmark 上驗證能提升表現（模型必須遵守複雜規則手冊並與使用者互動的場景）。九點依序是：邏輯相依與衝突排序／風險評估／溯因推理與假設探索／結果評估與適應／資訊來源盤點／精準與 grounding／完備性／堅持與耐心／行動抑制。關鍵原文：
  - `You are a very strong reasoner and planner. Use these critical instructions to structure your plans, thoughts, and responses.`
  - `Before taking any action (either tool calls or responses to the user), you must proactively, methodically, and independently plan and reason about:`
  - `For exploratory tasks (like searches), missing optional parameters is a LOW risk. Prefer calling the tool with the available information over asking the user, unless your Rule 1 (Logical Dependencies) reasoning determines that optional information is required for a later step in your plan.`
  - `Look beyond immediate or obvious causes. The most likely reason may not be the simplest and may require deeper inference.`
  - `Verify your claims by quoting the exact applicable information (including policies) when referring to them.`
  - `On transient errors (e.g. please try again), you must retry unless an explicit retry limit (e.g., max x tries) has been reached. If such a limit is hit, you must stop. On other errors, you must change your strategy or arguments, not repeat the same failed call.`
  - `Inhibit your response: only take an action after all the above reasoning is completed. Once you've taken an action, you cannot take it back.`
- **出處**：Google · Prompt design strategies（Agentic SI template） — https://ai.google.dev/gemini-api/docs/prompting-strategies#agentic-si-template
- **適用/注意**：Gemini 3.x agent／tool-use 場景。

<a id="e190"></a>
### 190. 先計畫、審過再執行（Plan mode / collaborative planning）
- **使用方式**：把「計畫」變成一道有強制力的門檻，而不是一句提醒。
  - **xAI Plan Mode**：計畫模式下 agent 探索 codebase 並草擬計畫等你核可；**只有計畫檔可以被編輯，其他編輯工具一律被拒——而且這個門檻獨立於權限模式（就算開了 always-approve 也一樣）**。何時用：`Ambiguous architecture, unclear requirements, or high-impact restructures`；何時跳過：`Clear one-path changes, obvious bug fixes, renames, formatting, pure research`。任務看起來模糊時 agent 也會自己進入計畫模式。
  - **Google Deep Research**：設 `collaborative_planning=True`，agent 會**先回傳研究計畫而不是直接執行**，你可以多輪修改，滿意後才批准。
- **出處**：
  - xAI · Plan Mode — https://docs.x.ai/build/features/plan-mode
  - Google · Deep Research（Collaborative planning） — https://ai.google.dev/gemini-api/docs/deep-research#collaborative-planning
- **適用/注意**：這是「行動抑制」（#189 第 9 點）的產品化版本。

<a id="e191"></a>
### 191. `max_turns`：agentic 迴圈的「回合」預算（不是工具呼叫數）
- **使用方式**：`max_turns` 限制的是**助理回合數**，不是個別工具呼叫數——一個回合裡模型可以平行叫很多工具。官方建議值：快速查詢 1–2（最快，可能漏掉深層洞見）／平衡研究 3–5／深度研究 10+ 或不設（最完整，延遲與成本較高）。到達上限時 agent 會停止再呼叫工具，用目前蒐集到的資訊產生最終回應。
- **出處**：
  - xAI · Tool Usage Details — https://docs.x.ai/developers/tools/tool-usage-details#understanding-turns-vs-tool-calls
  - xAI · Advanced Tool Usage — https://docs.x.ai/developers/tools/advanced-usage#understanding-max_turns-with-client-side-tools
- **適用/注意**：⚠️ **客戶端工具會重置計數**——模型呼叫 client-side 工具時執行會暫停並把控制權交還你的應用；你提供結果之後，**後續請求會再給滿 `max_turns` 個 server-side 回合**（設 5 且已用 3 次，接下來又是 5 次）。

<a id="e192"></a>
### 192. ⭐ 把常駐指令寫成檔案：`AGENTS.md`（短而具體 > 長）
- **使用方式**：把編碼慣例、build／test 指令、架構筆記寫進 repo 根目錄的 `AGENTS.md`，agent 每個 session 自動載入，不必每次重講。最重要的一句：**檔案不設大小上限，但短而具體的指令比長的更會被遵守**（`"short, specific instructions are followed more reliably than long ones"`）。
  - 載入順序（深層覆寫淺層）：全域 `~/.grok/` → 從 repo root 一路到工作目錄的每一層；巢狀 `AGENTS.md` 只作用於它的子樹，所以 monorepo 可以每個 package 有自己的慣例。
  - 相容性：每個目錄會讀 `AGENTS.md`、`Agents.md`、`AGENT.md`、`CLAUDE.md`、`Claude.md`、`CLAUDE.local.md`，以及 `.grok/rules/` 下的每個 `*.md`（`.claude/rules/`、`.cursor/rules/` 也會讀）。
  - 單次執行注入規則：`--rules`（附加到 system prompt）或 `--system-prompt-override`（整段取代）。
- **出處**：xAI · AGENTS.md / Project rules — https://docs.x.ai/build/features/project-rules
- **適用/注意**：Grok Build。與 Anthropic「要套用到每個 session 的指令搬進 CLAUDE.md／skills」（#8）是同一個做法。

<a id="e193"></a>
### 193. Skills：把可重用的指令包成資料夾
- **使用方式**：把 markdown 指令、腳本檔與資源打包成一個資料夾當「skill」給 agent 重複使用；使用者可呼叫的 skill 還會變成 slash command（`/<skill-name>`）。
- **出處**：xAI · Skills, Plugins & Marketplaces — https://docs.x.ai/build/features/skills-plugins-marketplaces
- **適用/注意**：Grok Build。

<a id="e194"></a>
### 194. 減少 agentic coding 產生的暫存檔
- **使用方式**：加一句：`If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task.`
- **出處**：Anthropic · Prompting best practices（Reduce file creation in agentic coding） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#reduce-file-creation-in-agentic-coding
- **適用/注意**：所有現行 Claude 模型；agentic coding。

---

<a id="ch13"></a>
## 第 13 章　迭代、自我檢查、評測與 metaprompting

<a id="e195"></a>
### 195. ⚠️ 要求自我檢查——但新一代模型要把這類指令**刪掉**（Self-check / over-verification）
- **使用方式**：**傳統做法**：在結尾加一句 `Before you finish, verify your answer against [test criteria].`，對程式與數學特別能可靠抓錯。
  **⚠️ 反轉**：Claude Opus 5 本來就會自我驗證，沿用舊模型的驗證指令會造成過度驗證、白白增加 token 與延遲——`"When migrating to Claude Opus 5, remove these instructions rather than rewriting them."` 同理也**不要**再叫它 `double-check your answer` / `re-verify before responding`。另外要限制修正旁白：`Only correct an earlier statement when the error would change the user's code, conclusions, or decisions… For slips that change nothing for the user, make the fix and move on without noting it.` 範圍也要一起講清楚：`Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work.` ／ `If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it.`
- **出處**：
  - Anthropic · Prompting best practices（Ask Claude to self-check） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
  - Anthropic · Prompting Claude Opus 5（Task scope and over-verification） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#task-scope-and-over-verification
  - Anthropic · Prompting Claude Opus 5（Self-correction） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#self-correction
- **適用/注意**：⚠️ 這是全檔最重要的「強度反轉」之一：**舊模型要加、Opus 5 要刪**。

<a id="e196"></a>
### 196. ⭐ 光說「檢查一下」沒用——給它能驗證的工具，並指定驗證什麼
- **使用方式**：讓模型真的能跑驗證，並列出優先序：
  ```
  After making changes, run the most relevant validation available:
  - targeted tests for changed behavior
  - type checks or lint checks when applicable
  - build checks for affected packages
  - a minimal smoke test when full validation is too expensive

  If validation cannot be run, explain why and describe the next best check.
  ```
  長跑任務則把自我驗證做成明確節奏，而且**用另開 fresh context 的 verifier subagent 通常勝過自我批判**：`Establish a method for checking your own work at an interval of [X] as you build. Run this every [X interval], verifying your work with subagents against the specification.` 同一份文件另三條鷹架建議：**從你難度區間的頂端開始**（挑一個比你會派給舊模型更難的任務）、**重構既有 prompt 與 skill**（為舊模型設計的 skill 常常對新模型過度規定而降低品質）。
- **出處**：
  - OpenAI · Prompting guidance for GPT-5.6（Check work before finishing） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
  - Anthropic · Prompting Claude Fable 5（Recommended scaffolding changes） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#recommended-scaffolding-changes
- **適用/注意**：⚠️ 與 #195 不衝突——差別在於「叫它自己再想一次」（該刪）vs「給它可執行的驗證工具」（該加）。

<a id="e197"></a>
### 197. ⭐ 把「發現」與「過濾」分成兩個階段（Code review harnesses）
- **使用方式**：新模型會**照字面**執行你的過濾指令。review prompt 說「只回報高嚴重度」或「保守一點」，它就真的少報——這是 harness 效應不是能力退步（調查一樣深、找到一樣多 bug，只是不回報）。正確做法是**要求全部回報，再用另一個 pass 過濾**：
  `Report every issue you find, including ones you are uncertain about or consider low-severity. Do not filter for importance or confidence at this stage - a separate verification step will do that. Your goal here is coverage: it is better to surface a finding that later gets filtered out than to silently drop a real bug.`
  若一定要單 pass 自我過濾，就**具體說明門檻在哪**，不要用「重要」這種定性詞：`report any bugs that could cause incorrect behavior, a test failure, or a misleading result; only omit nits like pure style or naming preferences.`
- **出處**：
  - Anthropic · Prompting Claude Opus 5（Capability improvements） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#capability-improvements
  - Anthropic · Prompting Claude Sonnet 5（Code review harnesses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#code-review-harnesses
- **適用/注意**：Claude Opus 5 / Sonnet 5 / Opus 4.8。

<a id="e198"></a>
### 198. ⭐ 讓模型先自建評分表再自評（`<self_reflection>`）
- **使用方式**：讓模型**先自己建立一份 5–7 類的評分 rubric（只給它自己用）**，再依 rubric 反覆自我檢視產出，可大幅提升 one-shot 應用品質。
  ```
  <self_reflection>
  - First spend time thinking of a rubric until confident.
  - Create a rubric with 5-7 categories. This is for your purposes only.
  </self_reflection>
  ```
  搭配句：`Think deeply about every aspect making a world-class one-shot web app—use that to create a rubric.`
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide（Zero-to-one app generation） — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Mistral · Prompting best practices（Evaluation） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：GPT-5 系列。**Mistral 把「讓模型自評」整理成三條可選路線**：① **輸出附信心分數**（`You are a summarization system that can provide summaries with associated confidence scores.` ＋ 只回 `Summary` 與 `Confidence` 兩個鍵的 JSON）；② **在同一個 prompt 裡加一個評估步驟**（`Step 1:` 產三份摘要 → `Step 2:` 評比哪一份最好並說明理由，判準明列 `clarity, completeness, and relevance`）；③ **用另一個 LLM 來評**（LLM chaining，把第一段的輸出貼進第二段 prompt）——`"In production systems, it is common to employ another LLM for evaluation so that the evaluation step can be separate from the generation summaries."`，代價是 `"it may result in additional API calls and potentially increased costs."` ⚠️ 評分要用文字級距而不是數字級距，見 #289。

<a id="e199"></a>
### 199. ⭐ 找出並解決 prompt 裡互相矛盾的指令（Contradictory instructions）
- **使用方式**：矛盾的指令會讓模型**花掉推理 token 去想辦法調和衝突**。官方例子：醫療客服 prompt 同時寫「一律先查病歷」與「緊急狀況立刻給 911 指引」——解法是明確補上例外：`Do not do lookup in emergency case, proceed immediately to providing 911 guidance.`
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Mistral · Prompting best practices（What to Avoid：Avoid Contradicting Yourself） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：GPT-5 系列。與 #37（衝突時遵循靠近結尾者）是同一個問題的兩面：**能消掉就消掉，消不掉才靠位置**。⭐ **Mistral 給了一個可以直接套用的結構化解法：把互相牴觸的規則改寫成有序的決策樹**（`"As your system prompt gets long, slight contradictions may appear."`——官方例子是「資料與既有紀錄相關就更新」與「資料是新的就建立新紀錄」同時存在，兩條規則對「既是新的又相關」的資料沒有答案）：
  ```
  ## How to update database records
  Follow these steps:
  - If the data does not include new information (i.e., it already exists in a record):
    - Ignore this data.
  - Otherwise, if the data is not related to any existing record in the same table:
    - Create a new record.
  - Otherwise, if the related record is larger than 100 characters:
    - Create a new record.
  - Otherwise, if the data directly contradicts the existing record:
    - Delete the existing record and create a new one.
  - Otherwise:
    - Update the existing record to include the new data.
  ```
  **`if / otherwise if / otherwise` 的有序結構讓「兩條規則同時成立」在結構上不可能發生**——這也是最容易寫成自動檢查器的一種 prompt 形狀。

<a id="e200"></a>
### 200. ⭐⭐ Prompt 健康檢查清單（22 條除錯項）
- **使用方式**：prompt 表現不如預期時，照這份官方清單逐條檢查。
  **（A）寫作層面（9 條）**
  1. **Typos**：檢查定義任務的關鍵字（例如把 summarize 打成 sumarize）、技術詞、實體名稱——拼錯會直接拉低表現。
  2. **Grammar**：句子難解析、有黏連片段、主詞動詞不一致、結構彆扭，模型可能就理解錯。
  3. **Punctuation**：逗號、句號、引號與其他分隔符用錯會讓模型誤解 prompt。
  4. **未定義的行話**：不要把領域術語、縮寫、首字母縮略詞當成有普世意義——除非你在 prompt 裡明確定義。
  5. **Clarity**：如果你自己都會納悶範圍、具體步驟或隱含假設，那 prompt 就是不清楚。
  6. **Ambiguity**：不要用缺乏可量測定義的主觀／相對形容詞——用客觀限制（`"write a summary of 3 sentences or less"` 而不是 `"write a brief summary"`）。
  7. **缺少關鍵資訊**：任務若需要某份文件、公司政策、使用者歷史或資料集，要確定那些資訊真的寫在 prompt 裡。
  8. **用字不佳**：檢查是否有不必要地複雜、含糊或冗長的措辭。
  9. **第二人複核**：如果模型持續表現不好，找另一個人來讀你的 prompt。
  **（B）指令與範例（7 條）**
  10. **Overt manipulation**：拿掉情緒訴求、奉承或人為壓力——`"very bad things will happen if you don't get this correct"` 這類話在第一代模型上曾有效，**現在的模型不會再改善，很多情況反而更差**。
  11. **指令與範例互相矛盾**：逐條稽核邏輯矛盾，或指令與範例對不上。
  12. **冗餘的指令與範例**：同一個指令或概念用略微不同的說法重複多次卻沒有新增資訊。
  13. **不相關的指令與範例**：若某條指令或範例拿掉之後不影響核心任務，它可能就是多餘的。
  14. **該用 few-shot 卻沒用**：任務複雜、需要特定格式或細膩語氣時，一定要給具體的輸入／輸出範例。
  15. **沒指定輸出格式**：不要讓模型猜結構；明確指令 ＋ 在 few-shot 範例中示範輸出結構。
  16. **沒定義角色**：要模型扮演特定角色，就要在 system instruction 裡把角色定義好。
  **（C）Prompt 與系統設計（6 條）**
  17. **任務規格不足**：要為邊界案例與非預期輸入提供明確處理路徑，也要說明資料缺漏時怎麼辦，不要假設插入的資料一定存在且格式良好。
  18. **超出模型能力**：不要用 prompt 要求模型做它有已知根本限制的事。
  19. **一個 prompt 塞太多任務**：一次要求好幾種不同的認知動作（1. 摘要 2. 抽實體 3. 翻譯 4. 草擬 email）就是太多，拆成分開的 prompt。
  20. **非標準資料格式**：輸出要機器可讀時，用 JSON / XML / Markdown / YAML 這類常見標準；真的需要非標準格式，就先讓模型輸出常見格式再用程式轉換。
  21. **CoT 順序錯誤**：不要提供「先給最終結構化答案、再補逐步推理」的範例。
  22. **Thinking vs. Reasoning**：如果用了 Thinking，試著**拿掉**你手寫的 step-by-step 指令，測試看看內建 Thinking 產生的推理是不是比你寫的更好。
  （另兩條屬同節）**內部參照互相衝突**：不要寫需要模型從 prompt 多處拼湊片段指令的非線性邏輯或條件；**Prompt injection 風險**：檢查插入 prompt 的不可信使用者輸入周圍有沒有明確防護。
- **出處**：Google · Overview of prompting strategies（Prompt health checklist） — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#prompt_health_checklist
- **適用/注意**：這是四廠中最完整的一份 prompt 除錯清單，可以直接當 code-review 用的檢查表。

<a id="e201"></a>
### 201. 迭代三招：換句話說／換成類比任務／調換內容順序
- **使用方式**：
  - **換句話說**：同義的不同寫法會得到不同結果（`How do I bake a pie?` / `Suggest a recipe for a pie.` / `What's a good pie recipe?`）。
  - **換成類比任務**：模型不照做時，改用能達到相同結果的另一種任務描述——官方例子是分類題失敗後改寫成 `Multiple choice problem: Which of the following options describes the book The Odyssey?`，模型就只回一個選項。
  - **調換內容順序**：`[examples][context][input]` / `[input][examples][context]` / `[examples][input][context]` 三種排列都試一次。
- **出處**：
  - Google · Prompt design strategies（Iteration） — https://ai.google.dev/gemini-api/docs/prompting-strategies#iteration
  - Meta · Prompt engineering（Vary the prompts） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：全部。Meta 把「換寫法」列進五條基本功之一，而且理由不只是找最佳解，也包含**產出多樣性**：`"Using different prompts can help the model improve at its task and produce more diverse and creative output. Try using different styles, tones, and formats to see how the model responds."`

<a id="e202"></a>
### 202. 迭代方法論與「已經收斂」的判準
- **使用方式**：拿到回應後記下你喜歡與不喜歡的地方，逐次修 prompt。官方用 Chromecast 廣告文案示範四次迭代：把元件分行列 → 合併成一句 → 明確要求數量 → 明確要求欄位（headline／body）。判準很實用：**當你再加限制、輸出仍然相似，代表你已經迭代成功了。** 另附一條多模態小技巧：`"for multimodal prompts, try adding the files to the prompt before the instructions."`
- **出處**：
  - Google · Prompt iteration strategies — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-iteration
  - Meta · Prompt engineering（Test and refine） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：全部。Meta 的版本是把「測試—精修」明確寫成流程的一環：`"Once you have created a set of prompts, test them out on the model to see how it performs. If the results are not as expected, try refining the prompts by adding more detail or adjusting the tone and style."` 上線後的回饋迴圈見 #290。

<a id="e203"></a>
### 203. 用 ground truth 做並排比較（Compare prompts）
- **使用方式**：先寫下你**心目中的標準答案（ground truth）**，再把不同 prompt 的模型回應統一拿去跟它比較，而不是憑感覺挑。
- **出處**：Google · Compare prompts — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/compare-prompts
- **適用/注意**：全部。

<a id="e204"></a>
### 204. 用官方的 prompt 優化工具（Prompt optimizers）
- **使用方式**：OpenAI 有 prompt optimizer 工具，可以找出 prompt 中的模糊與矛盾（`"We recommend testing your prompts in our prompt optimizer tool to help identify these types of issues."`）。Google 提供三種官方優化器：
  - **Zero-shot optimizer**：即時、低延遲，改良單一 prompt 或 system instruction 範本；**model-independent**，還有 `gemini_nano` 模式專門優化給小模型。兩種用法——**Instruction Generation**（用白話描述目標，不必從零寫複雜 system instruction）與 **Prompt Refinement**（已有可用 prompt 但輸出不穩定／略微離題／細節不足）。特別適用時機：**升級模型後既有 prompt 表現不如預期**。
  - **Few-shot optimizer**：即時、低延遲，分析「模型回應不符期待」的範例來精修 system instruction。
  - **Data-driven optimizer**：批次、任務層級的迭代優化器，用標註過的樣本 prompt 對照指定評估指標來改善 prompt。
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Google · Optimize prompts — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer
  - Google · Zero-shot optimizer — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/zero-shot-optimizer
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（Prompt 一鍵優化工具） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Meta · llama-prompt-ops — https://github.com/meta-llama/llama-prompt-ops
- **適用/注意**：這是「用 AI 改 prompt」的產品化版本，與 #205 的手動 metaprompting 互補。**另外兩家也各有官方工具**：阿里雲百煉在 Prompt 頁面內建「自動優化」按鈕，會把你的短 prompt 自動擴寫並補細節，官方甚至建議**先跑優化工具再讀其他技巧**（`推荐您先将 Prompt经过优化工具扩写改进，再接着阅读和体验其他优化技巧。`，⚠️ 該功能會消耗 token 計費）；Meta 則提供 Python 套件 `llama-prompt-ops`，專門把**在別家 LLM 上調好的 prompt 自動改寫成適合 Llama 的版本**（`"It transforms prompts that work well with other LLMs into prompts that are optimized for LLM models, improving performance and reliability."`），並公布了無標註資料的最佳化方法 PDO（Prompt Duel Optimizer，https://www.arxiv.org/abs/2510.13907）。

<a id="e205"></a>
### 205. ⭐ Metaprompting：讓模型優化自己的 prompt
- **使用方式**：直接問模型：`What specific phrases could be added/deleted from prompt to consistently elicit desired behavior?`——官方說已有多位使用者**直接部署 GPT-5 產生的 prompt 修訂版**。沒有 prompt 草稿時也可以請模型生一版：Anthropic 提供 Claude Cookbook 的 metaprompt recipe（Colab notebook），另有 GitHub 互動教學與 Google Sheets 輕量版教學。
- **出處**：
  - OpenAI · Cookbook: GPT-5 prompting guide（Metaprompting） — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - Anthropic · Prompt engineering overview — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    - metaprompt notebook：https://colab.research.google.com/github/anthropics/claude-cookbooks/blob/main/misc/metaprompt.ipynb
    - GitHub 互動教學：https://github.com/anthropics/prompt-eng-interactive-tutorial
    - Google Sheets 版：https://docs.google.com/spreadsheets/d/19jzLgRruG9kjUQNKtCg1ZjdD6l6weA6qRXG5zLIAhC8
- **適用/注意**：Google Workspace 的等價 meta-prompt 是 `Make this a power prompt: [original prompt text here]`（見 #19）。

<a id="e206"></a>
### 206. 四條 prompt 精修實務（Prompting overview 的實務清單）
- **使用方式**：① **分離關注點**——`Put overall tone or role guidance in the system message; keep task-specific details and examples in user messages`；② **整理範例**——`Combine few-shot examples into a concise YAML-style or bulleted block`；③ **結構化文件**——`Mirror your project structure with clear folder names`；④ **早驗證**——`Run your prompt tests and evaluation cases every time you publish`。
- **出處**：OpenAI · Prompting（總覽頁） — https://developers.openai.com/api/docs/guides/prompting
- **適用/注意**：⚠️ 此頁**不含**舊版的「六大策略」框架；六大策略在 Help Center 文章（見 #11，擷取失敗）。

<a id="e288"></a>
### 288. 多次生成取多數：Self-consistency，以及「評測要多跑取平均」
- **使用方式**：LLM 是機率性的，就算下了 CoT，單次生成仍可能算錯。**Self-consistency** 的作法是**同一個 prompt 跑多次、取出現最多次的那個答案**，代價是算力變高。實作前提是答案要能被程式抽出來——官方示範直接在 prompt 裡要求把答案用三個反引號包起來：
  ````
  John found that the average of 15 numbers is 40.
  If 10 is added to each number then the mean of the numbers is?
  Report the answer surrounded by three backticks, for example: ```123```
  ````
  同一個道理延伸到評測方法論：DeepSeek 明講 `"When evaluating model performance, it is recommended to conduct multiple tests and average the results."`——**單次跑分不可信**。
- **出處**：
  - Meta · Prompt engineering（Self-consistency） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
  - DeepSeek · DeepSeek-R1 README（Usage Recommendations） — https://github.com/deepseek-ai/DeepSeek-R1
- **適用/注意**：原文：`"LLMs are probabilistic; even with chain-of-thought prompting, a single generation might produce incorrect results. Self-consistency introduces enhanced accuracy by selecting the most frequent answer from multiple generations, at the cost of higher compute."` 與 #5（建立 eval 套件）、#203（用 ground truth 並排比較）是同一條工程紀律的三個面向；把答案固定在可解析位置的作法見 #283。⚠️ 與 #273 的關係：思考型模型本來就**不該**用 greedy decoding，所以多次生成本來就會不同——self-consistency 在這類模型上是自然可用的。

<a id="e289"></a>
### 289. 要模型評分時用「文字級距」而不是 1–5 數字級距（Prefer worded scales）
- **使用方式**：需要模型對東西打分時，不要說「用 1 到 5 分評分」，改成給有語意的等級並**逐級寫清定義**；真的需要數字時自己在程式端轉換。
  ```
  Rate these options using this scale:
  - Very Low: if the option is highly irrelevant
  - Low: if the option is not good enough
  - Neutral: if the option is not particularly interesting
  - Good: if the option is worth considering
  - Very Good: for highly relevant options
  ```
- **出處**：Mistral · Prompting best practices（What to Avoid） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：原文：`"If you need a model to rate something, use a worded scale for better performance."`／`"You can convert this worded scale to a numeric one if needed."` 這條在四大廠文件裡沒有等價說法，卻對**所有 LLM-as-judge／自評流程**都適用（#197、#198）——**模型對「詞」的掌握度遠高於對「刻度」的掌握度**。這也是 #15「用可量測的限制取代主觀形容詞」在評分場景的反向補充：要模型**輸出**評價時，語意級距反而比數字好。

<a id="e290"></a>
### 290. 上線之後持續收使用者回饋來改 prompt（Feedback loop）
- **使用方式**：prompt 工程不是上線就結束。兩家官方都把「**線上回饋**」列為拿到最佳輸出的關鍵之一：Qwen 要求在正式環境持續接收回饋並據以調整；Meta 把 `Gather feedback` 列進「crafting effective prompts」的五條基本功，用回饋找出**模型還需要更多引導的地方**。
- **出處**：
  - Qwen（阿里雲百煉）· 文生文 Prompt 指南（Prompt 測試與迭代） — https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
  - Meta · Prompt engineering（Crafting effective prompts） — https://developer.meta.com/ai/docs/how-to-guides/prompting/
- **適用/注意**：原文：`生成最优 prompt 是一个高度实验性的过程，需要不断尝试和调整各种方法。`／`即使在 prompt 优化完成后，持续地在线上环境中接收反馈并作出相应调整，才能使模型更好地理解和满足用户需求。`／Meta：`"use feedback from users or other sources to continually improve your prompts. This can help you identify areas where the model needs more guidance and make adjustments accordingly."` 與 #5（釘 snapshot ＋ eval）、#202（迭代的收斂判準）、#204（優化工具）構成完整迴圈：**離線 eval 抓回歸、線上回饋抓盲點**。

---

<a id="ch14"></a>
## 第 14 章　效率、精簡、快取與脈絡管理

<a id="e207"></a>
### 207. ⭐⭐ 精簡的 prompt 反而表現更好（Favor leaner prompts）
- **使用方式**：這是 GPT-5.6 最核心的轉向。拿掉重複的指令與範例、簡化工具描述，可以**提升**任務表現——官方內部測試：精簡化讓評測分數提升 **10–15%**，同時 token 減少 **41–66%**。可執行的做法：
  - **從已經能用的 prompt 與工具集出發，一次移除一組指令**，然後跑 eval。
  - **每條指令只講一次**（`State each instruction once.`）。
  - **但精簡不是無差別刪除**——`Keep examples and style guidance when they encode a product requirement or correct a measured gap.`（代表真正產品需求、或用來修正實測落差的範例與風格指引要留著）
- **出處**：
  - OpenAI · Model guidance / latest model（Prompting best practices） — https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
  - OpenAI · Prompting guidance for GPT-5.6 — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：⚠️ 這與「prompt 寫得越詳細越好」的傳統教學**相反**，也與 Google「永遠放 few-shot」（#40）方向不同。同族的說法：Google Gemini 3.x「簡化 prompt」（#256、#258）、xAI「升級模型要簡化 prompt」（#264）、xAI `AGENTS.md`「短而具體 > 長」（#192）——**這是 2026 年最強的一個時代訊號**。

<a id="e208"></a>
### 208. 長 session 要監控 context 成長（Track context growth）
- **使用方式**：重複的 prompt 內容與工具描述會隨對話回合累積，放大 token 用量。要在**開跑時**與**對話變長的過程中**都追蹤 context。
- **出處**：OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
- **適用/注意**：GPT-5.6。

<a id="e209"></a>
### 209. ⭐ 靜態內容放前面、變動內容放後面（Front-load static content）
- **使用方式**：把 system prompt、few-shot 範例、參考文件全部放在 prompt **最前面**形成穩定前綴；把使用者專屬、會變動的內容放**最後**。這樣才吃得到 prompt caching 的成本與延遲優惠。
  - Google 的隱式快取版本：**把大且共用的內容放在 prompt 最前面**，並**在短時間內送出前綴相似的請求**。
- **出處**：
  - OpenAI · Prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching
  - OpenAI · Prompt engineering — https://developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml
  - xAI · Prompt Caching Best Practices — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices#best-practices
  - Google · Context caching（Implicit caching） — https://ai.google.dev/gemini-api/docs/caching#implicit-caching
- **適用/注意**：⚠️ 與 Anthropic「長文件放最上面、問題放最後」（#80）**方向一致但理由不同**（一個為了回應品質、一個為了 cache 命中）——兩者都指向「**問題放最後**」，是四廠共識級的結論。xAI 六條快取實務的其餘四條見 #210～#212。

<a id="e210"></a>
### 210. ⚠️ 快取只在「完全相同的前綴」命中：只能往後追加，不能改前面
- **使用方式**：`"Cache hits are only possible for exact prefix matches within a prompt."` 多輪對話中**絕對不要編輯、刪除或重排先前的訊息，只能追加新的**。三種會打斷快取的改動（官方各附範例）：把先前的 assistant 回應改短、整段刪掉某則 assistant 訊息、把 user 與 system 訊息的順序對調。
  - ⚠️ **推理模型的頭號快取殺手**：漏傳先前回應的 `reasoning_content`。兩種正解——把加密的 reasoning content 送回去，或改用 `previous_response_id` 的 stateful 模式。
- **出處**：
  - OpenAI · Prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching
  - xAI · Prompt Caching — What Breaks Caching — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn
- **適用/注意**：xAI 原文：`"For reasoning models, you must include reasoning_content from previous responses; omitting it is the top cause of cache misses."`

<a id="e211"></a>
### 211. 快取的門檻、一致性要求與 cache key
- **使用方式**：三件事：
  - **最低 1,024 tokens** 才可能被快取（低於此門檻的 prompt 無法快取）。
  - **圖片與工具必須在請求間完全相同**（圖片的 `detail` 參數也要一致）。
  - **設 cache key**：OpenAI GPT-5.6+ 可用 `prompt_cache_key` 提高命中率，建議「每個 key 跨所有前綴的總流量維持在約每分鐘 15 個請求」。xAI 把這條提到模型指南最上層：**強烈建議設 `prompt_cache_key`（Chat Completions 用 `x-grok-conv-id` header）**，它會把同一段對話的請求路由到同一台伺服器讓快取命中可靠；**不設的話，多輪對話常常落在冷快取伺服器上，等於每次都付全額 input**。conversation ID 用 UUID 或應用的 session ID 即可。另外要**監控 `cached_tokens`**（一直是 0 就去檢查 conversation ID 與訊息順序），而且要**優雅處理快取未命中**（eviction 與路由代表命中不保證，應用在沒有快取時也要能運作）。
- **出處**：
  - OpenAI · Prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching
  - xAI · Grok 4.5（Important details） — https://docs.x.ai/developers/grok-4-5#important-details
- **適用/注意**：xAI Grok 4.5 規格（供成本估算）：知識截止 2026-02-01；`$2.00 / 1M` input、`$6.00 / 1M` output。長 agent loop 另外受惠於 context compaction（見 #213）。

<a id="e212"></a>
### 212. 快取不影響輸出品質（消除一個常見誤解）
- **使用方式**：`"Does caching affect output quality? No. Caching only accelerates the prompt processing phase. The model's output is identical whether the prompt is served from cache or computed from scratch."` ——可以放心為了成本去做快取優化。
- **出處**：xAI · Prompt Caching Best Practices — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices#does-caching-affect-output-quality
- **適用/注意**：`grok` 模型；概念可通用。

<a id="e213"></a>
### 213. ⭐ Context compaction：長 agent loop 的脈絡壓縮
- **使用方式**：把長對話壓成一個不透明的 compaction item，**保留 system prompt、附加檔案、先前推理與對話的濃縮紀錄，丟掉冗長的工具輸出與來回**。xAI 明確主張這不只省錢，**還會讓回答更準**（脈絡變乾淨，模型不會被舊工具輸出干擾）。三個必須**同時成立**的壓縮時機：① 對話大到每次呼叫的 `input_tokens` 已經傷到成本或延遲；② 你仍希望模型記得先前回合（否則直接開新對話）；③ **目前視窗還在模型的 context 上限之內**（壓縮是縮小對話，救不了已經超限的請求）。典型模式：在 agent loop 裡每 N 回合呼叫一次 Compaction API，或每當你的記帳顯示 rendered context 超過門檻時呼叫一次。OpenAI 的等價功能是 `/responses/compact`（`"a loss-aware compression pass over prior conversation state"`）。
- **出處**：
  - xAI · Context Compaction — https://docs.x.ai/developers/advanced-api-usage/context-compaction
  - OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：長 agent loop、多步驟代理流程。

<a id="e214"></a>
### 214. Context pruning：把過期的工具呼叫換成精簡摘要
- **使用方式**：舊的、已經不需要的工具呼叫與結果**從 context 移除**，改放一段精簡摘要保留重要資訊。
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。與 #213（壓縮）是同一個問題的手動版。

<a id="e215"></a>
### 215. 換主題就開新對話（避免懶惰行為）
- **使用方式**：話題轉換時**開一條新的對話 thread**，不要在同一個 context 裡硬接下去。
- **出處**：OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用/注意**：o3 / o4-mini。

<a id="e216"></a>
### 216. 重用推理脈絡以省 token 並提升智慧（Reuse reasoning context）
- **使用方式**：用 Responses API 把先前請求的推理項目帶進來，模型就能參照舊的推理痕跡，**省下 CoT token 也不必重建**。
  - OpenAI：`o3` / `o4-mini` 用 Responses API ＋ `store=true`；或 `include=["reasoning.encrypted_content"]` 保存推理項目——`"Persisting these reasoning items between tool calls during inference will therefore lead to higher intelligence"`。⚠️ **Chat Completions API 不包含推理脈絡**，複雜 agentic 工作流的 token 用量可能因此升高。
  - xAI：Responses API 的 stateful 模式——先前的 input prompt、reasoning content 與模型回應**存在 xAI 伺服器 30 天**，用 `previous_response_id` 續談而不必重送全部歷史；**30 天後要自己保存歷史與加密思考內容**再放進新請求。續談**不必沿用相同的工具設定或模型參數**，仍會被完整 hydrate。Zero Data Retention 使用者的替代路徑：讓伺服器把加密的 reasoning 與加密的工具輸出一併回傳給客戶端，下一回合再帶回去。
- **出處**：
  - OpenAI · Reasoning best practices — https://developers.openai.com/api/docs/guides/reasoning-best-practices
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
  - OpenAI · Cookbook: o3/o4-mini function calling guide — https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
  - xAI · Generate Text — https://docs.x.ai/developers/model-capabilities/text/generate-text
  - xAI · Advanced Tool Usage — https://docs.x.ai/developers/tools/advanced-usage#append-the-encrypted-agentic-tool-calling-states
- **適用/注意**：與 #74（thought signature）是同一個問題在三家的不同實作。

<a id="e217"></a>
### 217. 把脈絡管理做成使用者可見的指令（`/context`、`/compact`、`/btw`）
- **使用方式**：Grok Build 把脈絡管理做成 TUI 指令，等於在教使用者「脈絡是有限資源、要主動管理」：`/context`（查目前脈絡用量）／`/compact [context]`（壓縮對話歷史）／`/btw <question>`（**問一個側邊問題但不打斷主線**）／`/rewind`（回到先前回合）／`/effort`（設定目前模型的 reasoning effort）。
- **出處**：xAI · Modes and Commands — https://docs.x.ai/build/modes-and-commands#core-tui-commands
- **適用/注意**：Grok Build。`/btw` 是很值得借鑑的互動設計。


<a id="e291"></a>
### 291. 只生成必要的東西：模型「吃 token」比「吐 token」快
- **使用方式**：輸出長度是延遲與成本的主要來源，官方要求在**結構化輸出**時只讓模型生成嚴格必要的部分。兩個官方壞例：`NO_OP`（不需更動）的操作卻還要模型把整筆記錄的內容重新輸出一遍；一次要它生出一整本書。正解是**只生成「更新的那部分」或必要資料**。
- **出處**：Mistral · Prompting best practices（What to Avoid） — https://docs.mistral.ai/models/best-practices/prompt-engineering
- **適用/注意**：原文：`"Models are faster at ingesting tokens than generating them. If using structured outputs, only ask the model to generate what is strictly necessary."`／`"Bad Examples: Generating full record content for a NO_OP operation. Generating an entire book in one shot."` 這是 #207（精簡 prompt）的**輸出側**對偶：輸入省的是成本與注意力，輸出省的是延遲。同族做法見 #108（要短就明講什麼必須保留）、#142（工具回傳只給高訊號資訊）、#292（版面經濟學）。

<a id="e292"></a>
### 292. 版面經濟學：表格比 JSON 省 token、連續空白會各自計費
- **使用方式**：同樣的資訊用不同排版塞進 prompt，token 數差很多。三條官方可操作規則：
  1. **用表格而不是 JSON** —— 表格不必在每一列重複欄位名稱：`"This format can be a space-efficient way to include data, rather than preceding every field with a name (such as with JSON)."`
  2. **小心空白** —— `"Consecutive white spaces are treated as separate tokens, which can waste space."`；單一空白通常會跟後面的詞併成同一個 token，所以**能用一個空白就不要用標點**。
  3. **日期寫法** —— 把月份拼成英文全名反而比純數字日期更省 token（`"spelling out the entire month is more space efficient than a fully numeric date."`）。
- **出處**：Microsoft · Prompt engineering techniques（Space efficiency） — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- **適用/注意**：⚠️ 這條與 #83（GPT-4.1 長文實測：XML 與 pipe 分隔表現好、**JSON 特別差**）是**同一個結論的兩個理由**——一個是回應品質、一個是 token 成本，兩邊都指向「長資料不要用 JSON 包」。與 #207（精簡 prompt）、#291（少生成）同屬效率章的三兄弟。

---

<a id="ch15"></a>
## 第 15 章　多模態、媒體生成與視覺／前端設計

<a id="e218"></a>
### 218. 多模態提示的五大基本功（Multimodal fundamentals）
- **使用方式**：① **指令要具體**（`"leave minimal room for misinterpretation"`）；② **加幾個寫實的 few-shot 範例**；③ **拆成步驟**（把複雜任務切成可管理的子目標）；④ **指定輸出格式**（Markdown / JSON / HTML…）；⑤ **單圖 prompt 時把圖片放在文字前面**——但如果內容需要圖文高度交錯才說得通，就用最自然的順序。
- **出處**：
  - Google · Files API ＋ File prompting strategies — https://ai.google.dev/gemini-api/docs/files#prompt-design-fundamentals
  - Meta · Vision Capabilities — https://developer.meta.com/ai/docs/how-to-guides/vision-capabilities/
- **適用/注意**：⚠️ **PDF 文件頁的規則相反**：`"If using a single page, place the text prompt after the page."`（https://ai.google.dev/gemini-api/docs/document-processing#best-practices）。另 Vertex 側的迭代頁建議 `"for multimodal prompts, try adding the files to the prompt before the instructions."`（見 #202）。⚠️ **Meta 的多模態頁只有一句話，但那句話本身就是一條規則**：`"For the multimodal use cases, apply the prompt guidance provided for Llama 3.2. For text-only use cases, you can apply the prompt guidance from Llama 3.1."`——**同一個模型家族的「文字」與「多模態」可能適用不同世代的提示指引**，查文件時要先確認自己在看哪一份。

<a id="e219"></a>
### 219. ⭐ 多模態 prompt 的五招 troubleshooting
- **使用方式**：一整套「壞掉了怎麼修」的診斷法：
  1. **模型沒從相關區域取資訊** → 明講你要它看圖的哪些面向。（`How many days will these diapers last a baby?` → `Use the weight shown on the box to determine the child's age, and use the total number of diapers in the box. Divide the total number by how many diapers the child goes through per day.`）
  2. **輸出太籠統、沒貼合影像** → 在 prompt 開頭**先叫它描述影像／影片再給任務指令**，或要求它在回應中提及圖中的東西。（`What is in common between these images?` → `First, describe what's in each image in detail. What's in common between these images?`）
  3. **要定位是哪一步失敗** → 單獨叫它 `Describe what's in this image.` 或加 `Please explain why.`，先確認它的初步理解對不對。
  4. **出現幻覺內容** → 調低 temperature，或要求較短的描述（比較不會外推出額外細節）。
  5. **調取樣參數** → 試不同 temperature 與 top-k 調整創意程度。
  另一個籠統 → 具體的對照：`Describe this image.` → `Parse the time and city from the airport board shown in this image into a list.`
- **出處**：Google · File prompting strategies（Troubleshooting） — https://ai.google.dev/gemini-api/docs/files#troubleshooting-your-multimodal-prompt
- **適用/注意**：⚠️ 第 4、5 招涉及調 temperature，在 Gemini 3.x 上與 #77 衝突，優先遵循 #77。

<a id="e220"></a>
### 220. 多模態的 step-by-step 三種寫法
- **使用方式**：(a) 自己把任務拆成編號步驟；(b) 直接叫它 `Think step by step`；(c) **先解析再回答**——`Parse the formula in the image first. Then based on the formula, answer "what's the 4th term in the sequence?"`
- **出處**：Google · File prompting strategies — https://ai.google.dev/gemini-api/docs/files#break_it_down_step-by-step
- **適用/注意**：需要同時視覺理解與推理的任務。

<a id="e221"></a>
### 221. 影像／文件輸入的物理品質也是 prompt 的一部分
- **使用方式**：上傳前先確認：**圖片轉正**（`Verify that images are correctly rotated.` / `Rotate pages to the correct orientation before uploading.`）、**不要模糊**（`Use clear, non-blurry images.` / `Avoid blurry pages.`）。單圖＋文字時，把文字 prompt 放在圖片**之前**。
- **出處**：
  - Google · Image understanding（Tips & best practices） — https://ai.google.dev/gemini-api/docs/image-understanding#tips-best-practices
  - Google · Document (PDF) processing（Best practices） — https://ai.google.dev/gemini-api/docs/document-processing#best-practices
  - Mistral · Ministral-3-8B-Reasoning-2512 模型卡（Vision） — https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512
- **適用/注意**：**輸入品質是 prompt 品質的一部分**。Mistral 補了一條同性質的物理限制：影像長寬比盡量接近 1:1，`"Avoiding the use of overly thin or wide images - crop them as needed to ensure optimal performance."`——**必要時先裁切再送進去**。

<a id="e222"></a>
### 222. 影片：用 `MM:SS` 時間戳提問，並要求同時描述影音
- **使用方式**：可以直接指向影片的某個時間點：`What are the examples given at 00:05 and 00:10 supposed to show us?` 要完整摘要就同時要求音訊與視覺：`Describe the key events in this video, providing both audio and visual details. Include timestamps for salient moments.`
- **出處**：Google · Video understanding — https://ai.google.dev/gemini-api/docs/video-understanding
- **適用/注意**：⚠️ 視覺預設取樣為 **1 FPS**，快速運動或快速換場的影片可能漏掉細節。

<a id="e223"></a>
### 223. `media_resolution`：在 prompt 層決定「這張圖要看多細」
- **使用方式**：Gemini 3 新增 `media_resolution`（`low` / `medium` / `high` / `ultra_high`），可**逐個內容項目**設定，決定每張圖或每個影格分配多少 token。高解析度讀得到小字與細節，但更貴更慢。
- **出處**：Google · Image understanding（media_resolution） — https://ai.google.dev/gemini-api/docs/image-understanding#media_resolution
- **適用/注意**：Gemini 3。與 OpenAI 的 image `detail` 參數同族（見 #211 的快取一致性要求）。

<a id="e224"></a>
### 224. 影像生成的七種可重用範本（Nano Banana）
- **使用方式**：官方 prompt 骨架，直接填空：
  1. **寫實場景**：`A photorealistic [type of shot] of a [subject description] in a [setting description]. [Description of the light]. Shot from a [camera angle] with a [lens type].`
  2. **風格化插畫／貼紙**：`A [style] of a [subject, with details about accessories or actions] doing [activity]. The design features [visual qualities, e.g., bold outlines, cel-shading, etc.] and [color/background preference].`
  3. **圖中文字**：`Create a [image type] for [brand/concept] with the text "[text to render]" in a [font style]. The design should be [style description], with a [color scheme].`
  4. **產品情境照**：`A high-resolution, studio-lit product photograph of a [product description] on a [background surface/description]. The lighting is a [lighting setup, e.g., three-point softbox setup] to [lighting purpose]. The camera angle is a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp focus on [key detail]. [Aspect ratio].`
  5. **極簡與留白**：`A minimalist composition featuring a single [subject] positioned in the [bottom-right/top-left/etc.] of the frame. The background is a vast, empty [color] canvas, creating significant negative space. Soft, subtle lighting. [Aspect ratio].`
  6. **連續分鏡／漫畫**：`Make a 3 panel comic in a [style]. Put the character in a [type of scene].`
  7. **搭配 Search grounding 生成時事圖**：`Make a simple but stylish graphic of last night's Arsenal game in the Champion's League`
- **出處**：Google · Image generation（Prompt guide） — https://ai.google.dev/gemini-api/docs/image-generation#image-generation-prompts
- **適用/注意**：Gemini 影像生成。

<a id="e225"></a>
### 225. 影像編輯的七種可重用範本
- **使用方式**：
  1. **增刪元素**：`Using the provided image of [subject], please [add/remove/modify] [element] to/from the scene. Ensure the change is [description of how the change should integrate].`
  2. **語意遮罩式局部重繪（inpainting）**：`Using the provided image, change only the [specific element] to [new element/description]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition.`
  3. **風格轉換**：`Transform the provided photograph of [subject] into the artistic style of [artist/art style]. Preserve the original composition but render it with [description of stylistic elements].`
  4. **多圖合成**：`Create a new image by combining the elements from the provided images. Take the [element from image 1] and place it with/on the [element from image 2]. The final image should be a [description of the final scene].`
  5. **高保真細節保留**：`Using the provided images, place [element from image 2] onto [element from image 1]. Ensure that the features of [element from image 1] remain completely unchanged. The added element should [description of how the element should integrate].`
  6. **草稿變成品**：`Turn this rough [medium] sketch of a [subject] into a [style description] photo. Keep the [specific features] from the sketch but add [new details/materials].`
  7. **角色一致性 360 度視角**：`A studio portrait of [person] against [background], [looking forward/in profile looking right/etc.]`——官方補充：`"For best results, include previously generated images in subsequent prompts to maintain consistency."`
- **出處**：Google · Image generation（Image editing prompts） — https://ai.google.dev/gemini-api/docs/image-generation#image-editing-prompts
- **適用/注意**：Gemini 影像編輯。

<a id="e226"></a>
### 226. 影像生成的六條 best practices（含「語意負向提示」）
- **使用方式**：
  - **Be hyper-specific**：不要寫 `fantasy armor`，寫 `ornate elven plate armor, etched with silver leaf patterns, with a high collar and pauldrons shaped like falcon wings.`
  - **Provide context and intent**：說明圖的用途——`Create a logo for a high-end, minimalist skincare brand` 遠優於 `Create a logo.`
  - **Iterate and refine**：不要期待一次到位，用對話慢慢改（`That's great, but can you make the lighting a bit warmer?`）。
  - **Use step-by-step instructions**：複雜場景拆步驟——`First, create a background of a serene, misty forest at dawn. Then, in the foreground, add a moss-covered ancient stone altar. Finally, place a single, glowing sword on top of the altar.`
  - **⭐ Use "semantic negative prompts"**：不要說 `no cars`，正面描述你要的場景——`an empty, deserted street with no signs of traffic.`
  - **Control the camera**：用攝影／電影術語（`wide-angle shot`、`macro shot`、`low-angle perspective`）。
- **出處**：Google · Image generation（Best practices） — https://ai.google.dev/gemini-api/docs/image-generation#best-practices
- **適用/注意**：**語意負向提示**是「正面表述」（#14）在影像領域的具體化。

<a id="e227"></a>
### 227. Veo 影片 prompt 的六個構成要素
- **使用方式**：**主體、動作、風格**為必填；**鏡位與運鏡、構圖、對焦與鏡頭效果、氛圍**為選填。
  - Subject：影片裡要出現的物體、人、動物或景色
  - Action：主體在做什麼（走路、跑步、轉頭）
  - Style：具體的影片風格關鍵字（sci-fi、horror film、film noir、cartoon）
  - Camera positioning and motion：`aerial view`、`eye-level`、`top-down shot`、`dolly shot`、`worms eye`
  - Composition：`wide shot`、`close-up`、`single-shot`、`two-shot`
  - Focus and lens effects：`shallow focus`、`deep focus`、`soft focus`、`macro lens`、`wide-angle lens`
  - Ambiance：`blue tones`、`night`、`warm tones`
  - 官方六要素齊備範例：`Close up shot (composition) of melting icicles (subject) on a frozen rock wall (context) with cool blue tones (ambiance), zoomed in (camera motion) maintaining close-up detail of water drips (action).`
- **出處**：Google · Veo（Prompt guide） — https://ai.google.dev/gemini-api/docs/veo#basics
- **適用/注意**：Veo 影片生成。

<a id="e228"></a>
### 228. Veo 的聲音提示三分法（對白／音效／環境音）
- **使用方式**：三種寫法各有慣例：
  - **Dialogue**：用引號寫具體台詞——`"This must be the key," he murmured.`
  - **Sound Effects (SFX)**：直接描述聲音——`tires screeching loudly, engine roaring.`
  - **Ambient Noise**：描述整體聲景——`A faint, eerie hum resonates in the background.`
- **出處**：Google · Veo（Audio） — https://ai.google.dev/gemini-api/docs/veo#audio
- **適用/注意**：Veo 3 起可依提示產生同步聲軌。

<a id="e229"></a>
### 229. Veo：用描述性語言與臉部細節關鍵字
- **使用方式**：多用形容詞與副詞把畫面講清楚；想強調臉部細節就在 prompt 裡用 `portrait` 這類詞。
- **出處**：Google · Veo（More tips） — https://ai.google.dev/gemini-api/docs/veo#more-tips
- **適用/注意**：Veo。

<a id="e230"></a>
### 230. Veo 影片延伸（extension）的限制
- **使用方式**：延伸會從最後 1 秒／24 影格續接；**如果最後 1 秒沒有人聲，聲音就無法有效延伸**——所以規劃分段時要把要延續的聲音留在尾巴。
- **出處**：Google · Veo（Extend prompt） — https://ai.google.dev/gemini-api/docs/veo#extend-prompt
- **適用/注意**：Veo。

<a id="e231"></a>
### 231. xAI 影像：風格由 prompt 的形容詞決定，並用連鎖編輯迭代
- **使用方式**：xAI 的影像文件沒有 prompt 範本，唯一的指引是**把想要的美學直接寫進 prompt**（從超寫實攝影到動畫、油畫、鉛筆素描）。多次編輯時**把每次的輸出當成下一次的輸入**做漸進式精修。
  - 官方範例：生成 `A collage of London landmarks in a stenciled street-art style`；編輯 `Render this as a pencil sketch with detailed shading`；圖生影片 `Make the water crash down and slowly pan out the camera`
- **出處**：
  - xAI · Image Editing（Style transfer / Multi-turn editing） — https://docs.x.ai/developers/model-capabilities/images/editing#style-transfer
- **適用/注意**：Grok Imagine。

<a id="e232"></a>
### 232. xAI 影片與影像生成：prompt 複雜度會影響生成時間；同 prompt 多變體用 `n`
- **使用方式**：`"Prompt complexity — More detailed scenes require additional processing"`——寫更細的場景就要接受更久的生成時間。想從**同一個 prompt** 拿多張變體時用 `sample_batch()` 的 `n` 參數（單一請求生成全部，最有效率），**不同 prompt** 才用並行請求。長寬比可設 `auto` 讓模型依 prompt 自選最佳比例。
- **出處**：
  - xAI · Video Generation — https://docs.x.ai/developers/model-capabilities/video/generation
  - xAI · Image Generation — https://docs.x.ai/developers/model-capabilities/images/generation#concurrent-requests
- **適用/注意**：Grok Imagine。

<a id="e233"></a>
### 233. 搜尋中的影像／影片理解要另外開，而且會影響脈絡
- **使用方式**：`enable_image_understanding` 設 true 會給 agent `view_image` 工具，讓它能分析搜尋過程中遇到的圖片。注意這與「Grok 搜尋到的圖片會被放進寫回應時的模型脈絡」是**兩件不同的事**。`enable_video_understanding` **只有 X Search 有，Web Search 沒有**。
- **出處**：
  - xAI · Web Search — https://docs.x.ai/developers/tools/web-search#enable-image-search
  - xAI · X Search — https://docs.x.ai/developers/tools/x-search#enable-video-understanding
- **適用/注意**：`grok` 搜尋工具。

<a id="e234"></a>
### 234. ⭐ 給模型一個「裁切工具」來放大影像的相關區域
- **使用方式**：給 Claude 一個 crop 工具或 agent skill，讓它能「放大」影像的相關區域——官方測試顯示在影像評測上有**一致的提升**。
- **出處**：Anthropic · Prompting best practices（Improved vision capabilities） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#improved-vision-capabilities
- **適用/注意**：Claude Opus 4.5 / 4.6（Opus 5、Fable 5 有各自的視覺章節）。這是「用工具擴充能力」在視覺領域的落地。

<a id="e235"></a>
### 235. TTS：標點就是韻律指令（Writing effective text）
- **使用方式**：四條寫「好唸的文字」的規則：
  - **用自然的標點**——逗號、句號、問號引導節奏與語調；`"Wait, really?"` 聽起來比 `"Wait really"` 自然。
  - **加情緒脈絡**——`"That's amazing!"` 聽起來興奮，`"That's amazing."` 則平鋪直敘。
  - **長文切段落**——段落分隔會產生自然停頓，也幫模型在長文本上維持一致品質。
  - **單次請求控制在 15,000 字元以內。**
- **出處**：xAI · Text to Speech — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#writing-effective-text
- **適用/注意**：xAI TTS。這是純文字模態之外的全新提示技巧家族。

<a id="e236"></a>
### 236. Speech tags：行內標記與包夾標記兩種語法
- **使用方式**：
  - **行內標記** `[tag]`：放在該發生表情的位置（笑、停頓等）。
  - **包夾標記** `<tag>text</tag>`：改變整段的表達方式（耳語、唱歌等）。
  - 官方範例：`So I walked in and [pause] there it was. [laugh] I honestly could not believe it! <whisper>It was a secret the whole time.</whisper> Pretty cool, right?`
  - 分類：Pauses／Laughter & crying／Mouth sounds／Breathing（行內）；Volume & intensity／Pitch & speed／Vocal style（包夾）。
- **出處**：xAI · Text to Speech（Speech tags） — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#speech-tags
- **適用/注意**：xAI TTS。

<a id="e237"></a>
### 237. 語音體驗的四條高影響力建議
- **使用方式**：① 開 `server_vad` 取得自然的插話（barge-in）；② **串流輸出音訊 delta**（`response.output_audio.delta`）立刻送到喇叭，不要等整段回應；③ **輸入與輸出格式一致**（24 kHz PCM）避免重取樣；④ 客戶端安全性優先用 ephemeral token。
- **出處**：xAI · Speech to Speech — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#additional-high-impact-recommendations
- **適用/注意**：xAI 語音 session。

<a id="e238"></a>
### 238. ⭐ 前端設計：避開「AI slop」美學
- **使用方式**：模型會收斂到「在分佈中央」的通用產出，在前端設計上就是所謂的 AI slop。官方 `<frontend_aesthetics>` 區塊指定四個面向：
  - **Typography**：避開 Arial / Inter 這類通用字型（而且**連 Space Grotesk 這種「反預設的預設」也要避開**——`"it is critical that you think outside the box!"`）
  - **Color & Theme**：用 CSS 變數；`"Dominant colors with sharp accents outperform timid, evenly-distributed palettes."`
  - **Motion**：`"one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions"`
  - **Backgrounds**：做出氛圍與深度，不要只用純色
  要避開的：過度使用的字型家族、俗套配色（尤其白底紫漸層）、可預測的版面、缺乏脈絡個性的餅乾模子設計。
- **出處**：Anthropic · Prompting best practices（Frontend design） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#frontend-design
- **適用/注意**：Claude Opus 4.5 / 4.6（Opus 4.8 與 Sonnet 5 有各自更精簡的版本，見 #239 / #240）。延伸閱讀：https://www.claude.com/blog/improving-frontend-design-through-skills ／ frontend-design skill 完整定義 https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md

<a id="e239"></a>
### 239. ⭐ 破解設計預設值的兩個可靠手法：指定具體替代方案／先提選項再建構
- **使用方式**：**通用指令沒用**——`"Generic instructions ('don't use that color,' 'make it clean and minimal') tend to shift the model to a different fixed palette rather than producing variety."` 兩個可靠做法：
  1. **指定具體替代方案**（模型會精確遵循詳細規格）。
  2. **先讓模型提出選項再建構**：`Before building, propose 4 distinct visual directions tailored to this brief (each as: bg hex / accent hex / typeface, plus a one-line rationale). Ask the user to pick one, then implement only that direction.`
- **出處**：Anthropic · Prompting Claude Sonnet 5（Design and frontend defaults） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#design-and-frontend-defaults
- **適用/注意**：Claude Sonnet 5。⚠️ **因為 Sonnet 5 不接受 `temperature`（#78），「先提選項再建構」是官方建議用來產生跨次執行差異的做法。**

<a id="e240"></a>
### 240. 知道模型的「預設家風」才知道要覆寫什麼（Opus 4.8 house style）
- **使用方式**：官方明確描述了 Claude Opus 4.8 的預設視覺風格：**暖奶油／米白背景（約 `#F4F1EA`）、襯線標題字（Georgia、Fraunces、Playfair）、斜體單字強調、赤陶／琥珀點綴色**，而且 `"This default is persistent."` 這在編輯、餐旅、作品集類型讀起來不錯，但在 dashboard、開發工具、金融科技、醫療、企業應用上會顯得不對——那些場景就要明確覆寫。
- **出處**：Anthropic · Prompting Claude Opus 4.8（Design and frontend defaults） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8#design-and-frontend-defaults
- **適用/注意**：Claude Opus 4.8。

<a id="e241"></a>
### 241. 前端工程：指定框架／函式庫，並涵蓋六個面向
- **使用方式**：官方推薦的函式庫——樣式：Tailwind CSS、shadcn/ui、Radix Themes；圖示：Lucide、Material Symbols、Heroicons；動畫：Motion；框架：Next.js (TypeScript)、React、HTML。從零開始的網頁 app 可以一個 prompt 生成，而且要**以簡單為目標、避免 Next.js / React 這類外部依賴**（`"Aim for simplicity while fully achieving the goal"`）。要整合進大型既有 codebase，prompt 應涵蓋六件事：**Principles**（視覺品質標準、模組化可重用元件、設計一致性）／**UI/UX**（字體、顏色、間距版面、互動狀態、無障礙）／**Structure**（檔案與資料夾配置）／**Components**（可重用 wrapper 範例、與後端呼叫分離的策略）／**Pages**（常見版面的樣板）／**Agent Instructions**（確認設計假設、搭鷹架、強制標準、串 API、測試狀態、寫文件）。
- **出處**：
  - OpenAI · Prompt engineering（Prompting current GPT-5 series models） — https://developers.openai.com/api/docs/guides/prompt-engineering#prompting-current-gpt-5-series-models
  - OpenAI · Cookbook: GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用/注意**：GPT-5 系列。⚠️ 注意兩處官方建議看似衝突（推薦 Next.js／又說避免 Next.js）——差別在「大型既有 codebase」vs「從零的單頁 app」。

<a id="e242"></a>
### 242. 增量前端改動：明確要求保留既有設計系統
- **使用方式**：
  ```
  For incremental frontend changes:
  - inspect and preserve existing design tokens, components, and patterns;
  - do not add extra features or decorative UI unless requested;
  - preserve responsive behavior and expected states;
  - render and inspect the result before finalizing.
  ```
  另外：大型／密集／座標敏感的影像要用**原始解析度**送進去。
- **出處**：OpenAI · Prompting guidance for GPT-5.6（Frontend and visual tasks） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6。最後一條「定案前先 render 並檢視結果」與 #196（給驗證工具）同源。

<a id="e243"></a>
### 243. Computer use 的影像解析度建議
- **使用方式**：內部測試顯示 **1080p** 是效能與成本的好平衡；成本特別敏感的工作負載可用 **720p 或 1366×768**，表現仍然不錯。
- **出處**：Anthropic · Prompting Claude Sonnet 5（Computer use） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#computer-use
- **適用/注意**：Claude Sonnet 5（`computer_20251124`）／Opus 4.8。

---

<a id="ch16"></a>
## 第 16 章　安全、護欄與 prompt injection

<a id="e244"></a>
### 244. Prompt injection 被明確類比為 SQL injection
- **使用方式**：把插入 prompt 的不可信使用者輸入當成 SQL 參數來處理——`"Prompt injection, much like SQL injection, is a way for malicious users to design an input prompt that manipulates the output of the model, for example, by sending an input prompt that instructs the model to ignore any previous examples."` 結構性防線是把使用者輸入包在明確標示為「資料」的區塊裡（見 #32 的 `<context>` 註解與 #24 的內容／規則二分）。
- **出處**：Google · Safety guidance — https://ai.google.dev/gemini-api/docs/safety-guidance#consider_adjustments_to_mitigate_safety_and_factuality_risks
- **適用/注意**：Google 的除錯清單也把「Prompt injection risk」列為系統設計層面的檢查項（#200）。

<a id="e245"></a>
### 245. 用「輸入方式」而不是只有 prompt 文字來提高安全性
- **使用方式**：把安全設計往 UX 推——限制使用者只能從下拉選單選 prompt，或提供已驗證安全的描述性建議句。`"The exact input you give to an LLM can make a difference in the quality of the output."`
- **出處**：Google · Safety guidance — https://ai.google.dev/gemini-api/docs/safety-guidance#consider_adjustments_to_mitigate_safety_and_factuality_risks
- **適用/注意**：與 #10（能用參數保證的不要用 prompt 拜託）是同一個工程直覺。

<a id="e246"></a>
### 246. 把任務改成本質上更低風險的形狀
- **使用方式**：與其做「從零寫一封 email」，不如限制成「把大綱擴寫」或「提供替代寫法」——**範圍更窄、有更多人為監督的任務風險更低**。
- **出處**：Google · Safety guidance — https://ai.google.dev/gemini-api/docs/safety-guidance#consider_adjustments_to_mitigate_safety_and_factuality_risks
- **適用/注意**：這是 prompt 之外的產品設計層決策。

<a id="e247"></a>
### 247. 對抗性測試與自動化紅隊（Adversarial testing）
- **使用方式**：官方區分兩種有害輸入：**惡意輸入**與**無意間造成傷害的輸入**（`"the input itself may be innocuous, but produces harmful output -- for example, asking a text generation model to describe a person of a particular ethnicity and receiving a racist output."`）。測試資料要在**句構、語意、長度**三個維度上有多樣性；也可以用**另一個語言模型當自動化紅隊**去找出會誘發有害輸出的輸入。而且因為 `"LLMs are known to sometimes produce different outputs for the same input prompt."`，同一組測試要**跑多輪**才抓得到更多問題輸出。
- **出處**：Google · Safety guidance — https://ai.google.dev/gemini-api/docs/safety-guidance#perform_safety_testing_appropriate_to_your_use_case
- **適用/注意**：全部。

<a id="e248"></a>
### 248. ⭐ Computer Use 的 HITL 安全 system instruction（教科書級護欄範例）
- **使用方式**：官方提供一整段可直接貼上的 system instruction，把「必須先問使用者」的行為分類窮舉出來（同意條款、CAPTCHA、金流、發送訊息、敏感資料、檔案、瀏覽器資料、登入與冒名、無法克服的障礙）。最值得學的是它定義了**準備動作可以先做完、但不可逆的最後一步之前必須停下來問**：
  - `For Consequential Actions: Perform all preparatory steps (e.g., navigating, filling out forms, typing a message). You will ask for confirmation AFTER all necessary information is entered on the screen, but BEFORE you perform the final, irreversible action (e.g., before clicking "Send", "Submit", "Confirm Purchase", "Share").`
  - `Robot Detection: You MUST NEVER attempt to solve or bypass the following. … CAPTCHAs (of any kind)`
  - `Insurmountable Obstacles: If you are technically unable to interact with a user interface element or are stuck in a loop you cannot resolve, ask the user to take over.`
  - `Provide custom safety instructions: Implement a custom system instruction to define and enforce your own safety boundaries.`
- **出處**：Google · Computer Use（Safety best practices） — https://ai.google.dev/gemini-api/docs/computer-use#safety-best-practices
- **適用/注意**：與 Anthropic 的可逆性政策（#173）互為對照——Google 的版本更細，多了「準備／執行」的切點。

<a id="e249"></a>
### 249. Managed agents 的護欄：最小權限、人為覆核
- **使用方式**：三條規則：`"Only use tools from trusted sources and scope permissions to the minimum required."` ／ `"The agent may use any credential it has access to, so only provide credentials whose full scope you are willing to grant."` ／ `"Always verify outputs (generated code, data transformations, configuration changes) before deploying them, especially for tasks that modify data or interact with external systems."`
- **出處**：Google · Managed agents（Security best practices） — https://ai.google.dev/gemini-api/docs/agents#security-best-practices
- **適用/注意**：Gemini managed agents；原則可通用於任何 agent 架構。

<a id="e250"></a>
### 250. ⚠️ 即時濫用分類器可能中斷生成（Safeguards）
- **使用方式**：GPT-5.6 系統在生成過程中會套用**即時的網路與生物濫用分類器**，可能擋下請求或造成審查造成的延遲暫停——設計正當但敏感領域的應用時要把這個行為納入錯誤處理。
- **出處**：OpenAI · Model guidance / latest model（Safeguards） — https://developers.openai.com/api/docs/guides/latest-model#safeguards
- **適用/注意**：GPT-5.6 系列。
---

<a id="ch17"></a>
## 第 17 章　模型特定注意事項與遷移警示

<a id="e251"></a>
### 251. ⚠️⚠️ Prefill（預填回應開頭）已不再支援，以及四條遷移路徑
- **使用方式**：**從 Claude 4.6 系列與 Claude Mythos Preview 開始，最後一則 assistant 訊息的 prefill 不再支援**，送了會回 400 錯誤（舊模型仍支援；在對話中間插入 assistant 訊息不受影響）。官方給的四條遷移路徑：
  1. **控制輸出格式** → 改用 Structured Outputs（見 #121）。
  2. **去掉開場白** → 直接下指令 ／ 輸出包在 XML 標籤 ／ structured outputs ／ tool calling ／ 後處理砍掉（見 #120）。
  3. **避免不當拒絕** → 已不需要——`"Claude is much better at appropriate refusals now. Clear prompting within the user message without prefill should be sufficient."`
  4. **續寫被中斷的回應** → 把續寫需求放進 **user 訊息**：`Your previous response was interrupted and ended with [previous_response]. Continue from where you left off.`
  5. **脈絡補水／角色一致性** → 把原本 prefill 的提醒**注入 user turn**；若屬於更複雜的 agentic 系統，考慮**透過工具**或在 context compaction 時補水。
- **出處**：Anthropic · Prompting best practices（Migrating away from prefilled responses） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
- **適用/注意**：Claude 4.6 以後（含 Fable 5 / Mythos 5 / Opus 5 / Sonnet 5）。原文理由：`"Model intelligence and instruction following have advanced such that most use cases of prefill no longer require it."` ⚠️ 任何教「prefill 預填回應」的教材都必須標註為**舊模型限定**。

<a id="e252"></a>
### 252. Anthropic 遷移六要點（Migration considerations）
- **使用方式**：
  1. **Be specific about desired behavior**：具體描述你想在輸出裡看到什麼。
  2. **Frame your instructions with modifiers**：加上鼓勵提升品質與細節的修飾語。
  3. **Request specific features explicitly**：動畫與互動元素要明確要求（見 #133）。
  4. **Update thinking configuration**：Claude 4.6 用 adaptive thinking，取代手動 `budget_tokens`（見 #69）。
  5. **Migrate away from prefilled responses**（見 #251）。
  6. **Tune anti-laziness prompting**：如果你以前的 prompt 鼓勵模型更徹底或更積極用工具，**把那些指引調弱**（見 #157、#70）。
- **出處**：Anthropic · Prompting best practices（Migration considerations） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migration-considerations
- **適用/注意**：從舊世代 Claude 遷移。

<a id="e253"></a>
### 253. Claude Fable 5：單次請求會跑很久，要先改基礎設施
- **使用方式**：高 effort 下單一請求可能跑好幾分鐘，自主執行可達數小時。遷移前要先調整 **client timeout、串流與進度指示**，並考慮改成**非同步輪詢而非阻塞等待**。同時可以用一段 prompt 避免它在任務模糊時過度規劃：`When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey.`
- **出處**：Anthropic · Prompting Claude Fable 5（Longer turns by default） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#longer-turns-by-default
- **適用/注意**：Fable 5 / Mythos 5。定位（原文）：`"particularly effective at end-to-end work that takes a person hours, days, or weeks to complete."`

<a id="e254"></a>
### 254. 互動式編碼產品：把任務規格一次講完，減少來回
- **使用方式**：`"To maximize both performance and token efficiency in coding products, use xhigh or high effort, add autonomous features like an auto mode, and reduce the number of human interactions required from your users."` 原因：`"ambiguous or underspecified prompts conveyed progressively over multiple user turns tend to relatively reduce token efficiency and sometimes performance."`
- **出處**：Anthropic · Prompting Claude Sonnet 5（Interactive coding products） — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#interactive-coding-products
- **適用/注意**：Claude Sonnet 5 / Opus 4.8。

<a id="e255"></a>
### 255. Gemini 3 的核心提示原則（官方八條總表）
- **使用方式**：
  1. **Be precise and direct**：清楚簡潔地陳述目標，**避免不必要或過度說服性的語言**。
  2. **Use consistent structure**：用清楚的分隔符分開 prompt 的不同部分；XML 風格標籤（`<context>`、`<task>`）或 Markdown 標題都有效，**選一種在同一個 prompt 內貫徹**。
  3. **Define parameters**：明確解釋任何模糊的術語或參數。
  4. **Control output verbosity**：Gemini 3 預設給直接有效率的答案；**要更口語或更詳細就必須明講**。
  5. **Handle multimodal inputs coherently**：文字、影像、音訊、影片一律視為同等級輸入。
  6. **Prioritize critical instructions**：核心行為限制、角色定義與輸出格式要求放在 **System Instruction 或使用者 prompt 的最開頭**。
  7. **Structure for long contexts**：大量脈絡（文件、程式碼）**全部先給，指令與問題放在 prompt 最後**。
  8. **Anchor context**：大塊資料後用轉場句銜接，例如 `"Based on the information above..."`。
- **出處**：Google · Prompt design strategies（Core prompting principles） — https://ai.google.dev/gemini-api/docs/prompting-strategies#core_prompting_principles
- **適用/注意**：Gemini 3 系列。這八條與本檔的 #12、#25/#27、#101、#37、#80 互相對應，是 Google 版的總綱。

<a id="e256"></a>
### 256. Gemini 3.x 的三條現行提示最佳實務
- **使用方式**：
  - **Precise instructions**：**要簡潔**——3.x 是推理模型，**為舊模型設計的冗長或複雜 prompt 工程可能讓它過度分析**。
  - **Output verbosity**：預設較不囉嗦、偏好直接有效率的答案；需要對話感就明確引導（`Explain this as a friendly, talkative assistant`）。
  - **Context management**：大資料集（整本書、整個 codebase、長影片）時把指令與問題放最後，並用 `"Based on the preceding information..."` 錨定推理。
- **出處**：Google · What's new in Gemini 3.5 Flash（Prompting best practices） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#prompting-best-practices
- **適用/注意**：Gemini 3.x。與 OpenAI #207、xAI #264 同屬「精簡時代」訊號。

<a id="e257"></a>
### 257. Gemini 3.x 參數與行為更新總表
- **使用方式**：升級 3.x 時逐條對照：`temperature` / `top_p` / `top_k` **強烈建議不要改預設值**；用 `thinking_level` 取代 `thinking_budget`；function calling 回應的 `id`、`name`、數量必須與先前呼叫一致；多模態內容要放在 function response **裡面**而不是外面；行內指令要**接在 function response 文字後面**而不是當成獨立的 part；agentic workflow 想減少工具呼叫就降低 thinking level 或實驗 system instruction。
- **出處**：Google · What's new in Gemini 3.5 Flash（Parameter updates） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#parameter-updates
- **適用/注意**：Gemini 3.x。各條的細節見 #77、#68、#163、#164、#166。

<a id="e258"></a>
### 258. 從 Gemini 2.5 遷移：把 CoT 鷹架換成 `thinking_level`
- **使用方式**：如果你以前是用 chain-of-thought 提示去「逼」2.5 推理，改成用 `thinking_level: "medium"` 或 `"high"` **搭配更簡單的 prompt**。
- **出處**：
  - Google · What's new in Gemini 3.5 Flash（Migrate from 2.5） — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#migrate-from-25
  - Google · Gemini 3 Developer Guide — https://ai.google.dev/gemini-api/docs/gemini-3 **（原文件已標示下架 — 找不到穩定版本，後繼參考: https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5）**
- **適用/注意**：Gemini 3.x。原文：`"Simplify prompts. If you used chain-of-thought prompt engineering to force reasoning, try thinking_level: 'medium' or 'high' with simpler prompts instead."`

<a id="e259"></a>
### 259. 客製工具被忽略時改用 `-customtools` 模型變體
- **使用方式**：官方 FAQ 的實務偏方——如果 `gemini-3.1-pro-preview` 一直忽略你的 custom tools 而改用 bash 指令，改用 `gemini-3.1-pro-preview-customtools`。
- **出處**：Google · Gemini 3 Developer Guide（FAQ） — https://ai.google.dev/gemini-api/docs/gemini-3 **（原文件已標示下架／將被移除 — 該 FAQ 條目尚未搬到後繼頁，後繼參考: https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5）**
- **適用/注意**：⚠️ 這是本檔唯一**只存在於已標示 deprecated 頁面**的技巧條目，使用前請自行再確認。

<a id="e260"></a>
### 260. ⭐ OpenAI 的五步 prompt 遷移流程（不要整包重寫）
- **使用方式**：
  ```
  1. Switch the model and preserve the current reasoning effort.
  2. Run representative evals before changing the prompt.
  3. Remove obsolete scaffolding, repeated instructions, and irrelevant tools.
  4. Add only the smallest targeted instruction that fixes a measured regression.
  5. Re-run evals after each prompt or reasoning change.
  ```
- **出處**：OpenAI · Prompting guidance for GPT-5.6（Prompt migration workflow） — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用/注意**：GPT-5.6 系列。原文：`"Do not rewrite a working prompt stack all at once."`

<a id="e261"></a>
### 261. GPT-5.2 遷移：先換模型，先不動 prompt
- **使用方式**：`Switch models, don't change prompts yet. Keep the prompt functionally identical so you're testing model change.` 步驟：換模型 → 釘住 `reasoning_effort` → 跑 eval → 再增量調整。
- **出處**：OpenAI · Cookbook: GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用/注意**：GPT-5.2。與 #260 是同一個紀律的兩個版本。

<a id="e262"></a>
### 262. Pro mode：什麼時候值得用
- **使用方式**：`"Use pro mode when a marginal quality improvement materially affects the outcome."` 而且要**在同一組代表性任務上比較 standard 與 pro**。官方示範 prompt：`Review this database migration plan for failure modes that could cause data loss or extended downtime. For each finding, cite the relevant step, estimate impact and likelihood, and recommend a specific mitigation. Return the five most important risks in severity order.`
- **出處**：OpenAI · Model guidance / latest model — https://developers.openai.com/api/docs/guides/latest-model
- **適用/注意**：GPT-5.6 系列。

<a id="e263"></a>
### 263. xAI 遷移：明確選擇「要付多少推理」
- **使用方式**：舊模型下線後請求會被自動轉址到 `grok-4.3`，但轉址會套用**預設**的 reasoning effort。官方建議**明確指定**而不是接受轉址的預設值：`"Doing so explicitly lets you control which reasoning effort you pay for, rather than accepting the default applied by the redirect."` 官方遷移對照（節錄）：`grok-4-1-fast-reasoning` / `grok-4-fast-reasoning` / `grok-4-0709` → `grok-4.3` with `low` effort；`grok-4-1-fast-non-reasoning` / `grok-4-fast-non-reasoning` / `grok-3` → `grok-4.3` with `none` effort；`grok-code-fast-1` → `grok-build-0.1`。
- **出處**：xAI · May 15 Retirement — https://docs.x.ai/developers/migration/may-15-retirement#recommended-replacements
- **適用/注意**：`grok` 模型。

<a id="e264"></a>
### 264. ⭐ 換到更強的模型時：簡化 system prompt、刪掉補丁式提示
- **使用方式**：三點：
  1. **簡化 system prompt**——模型能力大幅提升，prompt 應該**短很多**；而且**叫模型幫你把舊 prompt 概括化，不要逐字搬過去**（`"Ask Grok to generalize your existing system prompt rather than porting it verbatim."`）。
  2. **刪掉補丁式提示**——為了補舊模型 bug 或限制而加的 prompt hack 與 edge-case 修補，全部拿掉（`"Prompt hacks and edge-case fixes needed for GPT models are unnecessary."`）。
  3. **推理預設是開的**——預設 `reasoning.effort` 為 `"high"`，要關掉設 `"none"`。
- **出處**：xAI · Speech to Speech（Model-specific best practices） — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#step-3--model-specific-best-practices
- **適用/注意**：該節直接對象是 `grok-voice-think-fast-2.0`，但「簡化＋去補丁」的原則對所有模型升級皆適用，與 Google #256 / #258 和 OpenAI #207 是同一個時代訊號。
  > **⚠️ 來源健康度附註**：xAI 原本的《Prompt Engineering》指南（`https://docs.x.ai/docs/guides/grok-code-prompt-engineering`）於 2026-07-30 擷取時**回傳 HTTP 404，整頁已下架**，Wayback Machine 兩次嘗試皆被限流（429）無法取得存檔。搜尋引擎快取顯示該頁曾涵蓋「提供具體 context／使用詳細 system prompt／用 XML 或 Markdown 標記 context 區塊／使用原生 tool-calling 而非 XML 格式的工具輸出／適合 agentic 任務而非 one-shot 查詢」五點，但**無法一手驗證，本檔不將其列為可引用的官方條目 —— 找不到**。後繼參考：https://docs.x.ai/developers/tools/code-execution#best-practices

---

<a id="part2"></a>
## Part 2 併入說明（Qwen / DeepSeek / Mistral / Meta / Cohere / Microsoft）

> **Part 2 已完成併入，本節不另列條目。** 五份 promptbook（`qwen.md`、`deepseek.md`、`mistral.md`、`meta-llama.md`、`others.md`，皆 2026-07-30 擷取）共 **118 個來源編號**，全部依「一個技巧一個條目」的原則處理：**與既有條目講同一件事的，就在該條目加一行出處並補上廠家差異；真正新的技巧才開新條目，並且直接放進對應章節**。

| 廠商 | 來源編號 | 開出（或共同開出）新條目 | 併入既有條目 | 代表性的新條目 |
|---|---:|---:|---:|---|
| Qwen（阿里） | `Q-01`–`Q-22`（22） | 13 | 9 | #265 用詞歧義、#266 六要素骨架、#272 `/think` 軟開關、#282 四要素抑制幻覺 |
| DeepSeek | `D-01`–`D-14`（14） | 8 | 5（＋1 找不到） | #269 不要用 system prompt、#276 effort 只有 high/max、#284 JSON 模式 |
| Mistral | `MI-01`–`MI-25`（25） | 13 | 12 | #267 階層式骨架、#277 `[THINK]` 系統提示、#278 挑溫度、#286 不要數字數、#289 文字級距 |
| Meta（Llama） | `L-01`–`L-22`（22） | 5 | 17 | #271 Llama 4 反說教系統提示、#281 幻覺三成因、#288 self-consistency |
| Cohere | `CO-01`–`CO-15`（15） | 2 | 13 | #268 負面範例與範例順序、#287 步驟清單（共同） |
| Microsoft | `MS-01`–`MS-20`（20） | 3 | 17 | #292 版面經濟學、#278 溫度（共同）、#287 步驟清單（共同） |
| **合計** | **118** | **44 個來源編號 → 28 個新條目（#265–#292）** | **73** | 另有 1 個來源編號（`D-14`）無可引用內容，標為「找不到」 |

> **Part 2 最有教學價值的，是它製造出來的「同一件事、不同答案」**：推理模型該不該有 system prompt（#269 vs #277）、多輪要不要保留思考內容（#275 的三種答案）、能不能叫模型控制長度（#107 vs #286）、思考模型的溫度該怎麼設（#273 vs #278）——這些**矛盾本身就是官方事實**，本檔一律並陳並標明各自的適用模型，不做調和。

---

<a id="appendix"></a>
## 附錄：追溯對照表（Traceability appendix）

> **這張表是「每一條技巧都有被整理出來」的保證**。九份 promptbook 的 **493** 個來源編號，每一個都**恰好出現一次**，並指向本檔的某個條目。
> 驗證方式：以程式逐一比對 `T-A01`–`T-A107`（107）、`T-O01`–`T-O142`（142）、`G-01`–`G-86`（86）、`X-01`–`X-40`（40）、`Q-01`–`Q-22`（22）、`D-01`–`D-14`（14）、`MI-01`–`MI-25`（25）、`L-01`–`L-22`（22）、`CO-01`–`CO-15`（15）、`MS-01`–`MS-20`（20），確認無遺漏、無重複、無越界。
> **Part 2 的編號是本檔自行編定的**（那五份 promptbook 只有 `A1`/`B2`/`C-A3`/`M-14` 這類章節標籤，沒有全域編號）：`Q-`＝Qwen、`D-`＝DeepSeek、`MI-`＝Mistral、`L-`＝Meta Llama、`CO-`＝Cohere、`MS-`＝Microsoft；一個章節若明確教了兩件以上可分開的事，就拆成兩個編號（例如 `MI-03`／`MI-04` 同出自 Mistral A3）。下方 A-2 表附有「promptbook 章節」欄可以逐條回查。
> **兩個沒有正常對應的編號，誠實揭露**：條目 **#11**（OpenAI 六大策略）沒有來源編號，因為其官方文件 HTTP 403 擷取失敗，出處標為「找不到」；來源編號 **`D-14`**（DeepSeek Prompt Library）沒有對應條目，因為該頁面沒有任何可擷取的提示詞內文，同樣標為「找不到」。

<a id="appA"></a>
### A. 依來源編號排序（Anthropic → OpenAI → Google → xAI）

| 來源編號 | 廠商 | 落入本檔條目 |
|---|---|---|
| `T-A01` | Anthropic | #12 |
| `T-A02` | Anthropic | #22 |
| `T-A03` | Anthropic | #39 |
| `T-A04` | Anthropic | #25 |
| `T-A05` | Anthropic | #48 |
| `T-A06` | Anthropic | #80 |
| `T-A07` | Anthropic | #82 |
| `T-A08` | Anthropic | #88 |
| `T-A09` | Anthropic | #54 |
| `T-A10` | Anthropic | #110 |
| `T-A11` | Anthropic | #14 |
| `T-A12` | Anthropic | #102 |
| `T-A13` | Anthropic | #103 |
| `T-A14` | Anthropic | #104 |
| `T-A15` | Anthropic | #106 |
| `T-A16` | Anthropic | #133 |
| `T-A17` | Anthropic | #251 |
| `T-A18` | Anthropic | #121 |
| `T-A19` | Anthropic | #120 |
| `T-A20` | Anthropic | #251 |
| `T-A21` | Anthropic | #251 |
| `T-A22` | Anthropic | #251 |
| `T-A23` | Anthropic | #16 |
| `T-A24` | Anthropic | #170 |
| `T-A25` | Anthropic | #157 |
| `T-A26` | Anthropic | #148 |
| `T-A27` | Anthropic | #70 |
| `T-A28` | Anthropic | #69 |
| `T-A29` | Anthropic | #62 |
| `T-A30` | Anthropic | #63 |
| `T-A31` | Anthropic | #55 |
| `T-A32` | Anthropic | #47 |
| `T-A33` | Anthropic | #60 |
| `T-A34` | Anthropic | #195 |
| `T-A35` | Anthropic | #72 |
| `T-A36` | Anthropic | #180 |
| `T-A37` | Anthropic | #181 |
| `T-A38` | Anthropic | #182 |
| `T-A39` | Anthropic | #183 |
| `T-A40` | Anthropic | #173 |
| `T-A41` | Anthropic | #95 |
| `T-A42` | Anthropic | #186 |
| `T-A43` | Anthropic | #187 |
| `T-A44` | Anthropic | #194 |
| `T-A45` | Anthropic | #175 |
| `T-A46` | Anthropic | #176 |
| `T-A47` | Anthropic | #97 |
| `T-A48` | Anthropic | #234 |
| `T-A49` | Anthropic | #238 |
| `T-A50` | Anthropic | #252 |
| `T-A51` | Anthropic | #2 |
| `T-A52` | Anthropic | #3 |
| `T-A53` | Anthropic | #205 |
| `T-A54` | Anthropic | #253 |
| `T-A55` | Anthropic | #64 |
| `T-A56` | Anthropic | #114 |
| `T-A57` | Anthropic | #96 |
| `T-A58` | Anthropic | #174 |
| `T-A59` | Anthropic | #186 |
| `T-A60` | Anthropic | #184 |
| `T-A61` | Anthropic | #185 |
| `T-A62` | Anthropic | #181 |
| `T-A63` | Anthropic | #22 |
| `T-A64` | Anthropic | #115 |
| `T-A65` | Anthropic | #168 |
| `T-A66` | Anthropic | #196 |
| `T-A67` | Anthropic | #58 |
| `T-A68` | Anthropic | #197 |
| `T-A69` | Anthropic | #111 |
| `T-A70` | Anthropic | #118 |
| `T-A71` | Anthropic | #113 |
| `T-A72` | Anthropic | #195 |
| `T-A73` | Anthropic | #186 |
| `T-A74` | Anthropic | #195 |
| `T-A75` | Anthropic | #71 |
| `T-A76` | Anthropic | #112 |
| `T-A77` | Anthropic | #64 |
| `T-A78` | Anthropic | #64 |
| `T-A79` | Anthropic | #73 |
| `T-A80` | Anthropic | #158 |
| `T-A81` | Anthropic | #118 |
| `T-A82` | Anthropic | #17 |
| `T-A83` | Anthropic | #78 |
| `T-A84` | Anthropic | #239 |
| `T-A85` | Anthropic | #254 |
| `T-A86` | Anthropic | #197 |
| `T-A87` | Anthropic | #243 |
| `T-A88` | Anthropic | #64 |
| `T-A89` | Anthropic | #158 |
| `T-A90` | Anthropic | #186 |
| `T-A91` | Anthropic | #240 |
| `T-A92` | Anthropic | #116 |
| `T-A93` | Anthropic | #149 |
| `T-A94` | Anthropic | #150 |
| `T-A95` | Anthropic | #134 |
| `T-A96` | Anthropic | #139 |
| `T-A97` | Anthropic | #141 |
| `T-A98` | Anthropic | #140 |
| `T-A99` | Anthropic | #142 |
| `T-A100` | Anthropic | #134 |
| `T-A101` | Anthropic | #145 |
| `T-A102` | Anthropic | #146 |
| `T-A103` | Anthropic | #89 |
| `T-A104` | Anthropic | #26 |
| `T-A105` | Anthropic | #49 |
| `T-A106` | Anthropic | #9 |
| `T-A107` | Anthropic | #8 |
| `T-O01` | OpenAI | #1 |
| `T-O02` | OpenAI | #4 |
| `T-O03` | OpenAI | #5 |
| `T-O04` | OpenAI | #51 |
| `T-O05` | OpenAI | #6 |
| `T-O06` | OpenAI | #33 |
| `T-O07` | OpenAI | #27 |
| `T-O08` | OpenAI | #25 |
| `T-O09` | OpenAI | #209 |
| `T-O10` | OpenAI | #39 |
| `T-O11` | OpenAI | #23 |
| `T-O12` | OpenAI | #177 |
| `T-O13` | OpenAI | #241 |
| `T-O14` | OpenAI | #169 |
| `T-O15` | OpenAI | #4 |
| `T-O16` | OpenAI | #206 |
| `T-O17` | OpenAI | #207 |
| `T-O18` | OpenAI | #207 |
| `T-O19` | OpenAI | #207 |
| `T-O20` | OpenAI | #135 |
| `T-O21` | OpenAI | #207 |
| `T-O22` | OpenAI | #208 |
| `T-O23` | OpenAI | #171 |
| `T-O24` | OpenAI | #172 |
| `T-O25` | OpenAI | #172 |
| `T-O26` | OpenAI | #109 |
| `T-O27` | OpenAI | #107 |
| `T-O28` | OpenAI | #108 |
| `T-O29` | OpenAI | #116 |
| `T-O30` | OpenAI | #134 |
| `T-O31` | OpenAI | #159 |
| `T-O32` | OpenAI | #91 |
| `T-O33` | OpenAI | #118 |
| `T-O34` | OpenAI | #65 |
| `T-O35` | OpenAI | #242 |
| `T-O36` | OpenAI | #196 |
| `T-O37` | OpenAI | #35 |
| `T-O38` | OpenAI | #260 |
| `T-O39` | OpenAI | #262 |
| `T-O40` | OpenAI | #250 |
| `T-O41` | OpenAI | #65 |
| `T-O42` | OpenAI | #55 |
| `T-O43` | OpenAI | #73 |
| `T-O44` | OpenAI | #74 |
| `T-O45` | OpenAI | #56 |
| `T-O46` | OpenAI | #57 |
| `T-O47` | OpenAI | #27 |
| `T-O48` | OpenAI | #45 |
| `T-O49` | OpenAI | #55 |
| `T-O50` | OpenAI | #52 |
| `T-O51` | OpenAI | #105 |
| `T-O52` | OpenAI | #216 |
| `T-O53` | OpenAI | #4 |
| `T-O54` | OpenAI | #4 |
| `T-O55` | OpenAI | #134 |
| `T-O56` | OpenAI | #136 |
| `T-O57` | OpenAI | #139 |
| `T-O58` | OpenAI | #156 |
| `T-O59` | OpenAI | #143 |
| `T-O60` | OpenAI | #144 |
| `T-O61` | OpenAI | #141 |
| `T-O62` | OpenAI | #135 |
| `T-O63` | OpenAI | #145 |
| `T-O64` | OpenAI | #146 |
| `T-O65` | OpenAI | #148 |
| `T-O66` | OpenAI | #122 |
| `T-O67` | OpenAI | #123 |
| `T-O68` | OpenAI | #124 |
| `T-O69` | OpenAI | #125 |
| `T-O70` | OpenAI | #125 |
| `T-O71` | OpenAI | #126 |
| `T-O72` | OpenAI | #127 |
| `T-O73` | OpenAI | #128 |
| `T-O74` | OpenAI | #209 |
| `T-O75` | OpenAI | #210 |
| `T-O76` | OpenAI | #211 |
| `T-O77` | OpenAI | #211 |
| `T-O78` | OpenAI | #170 |
| `T-O79` | OpenAI | #170 |
| `T-O80` | OpenAI | #170 |
| `T-O81` | OpenAI | #119 |
| `T-O82` | OpenAI | #65 |
| `T-O83` | OpenAI | #216 |
| `T-O84` | OpenAI | #241 |
| `T-O85` | OpenAI | #198 |
| `T-O86` | OpenAI | #175 |
| `T-O87` | OpenAI | #107 |
| `T-O88` | OpenAI | #175 |
| `T-O89` | OpenAI | #179 |
| `T-O90` | OpenAI | #199 |
| `T-O91` | OpenAI | #204 |
| `T-O92` | OpenAI | #75 |
| `T-O93` | OpenAI | #105 |
| `T-O94` | OpenAI | #205 |
| `T-O95` | OpenAI | #177 |
| `T-O96` | OpenAI | #107 |
| `T-O97` | OpenAI | #175 |
| `T-O98` | OpenAI | #86 |
| `T-O99` | OpenAI | #89 |
| `T-O100` | OpenAI | #213 |
| `T-O101` | OpenAI | #118 |
| `T-O102` | OpenAI | #160 |
| `T-O103` | OpenAI | #132 |
| `T-O104` | OpenAI | #261 |
| `T-O105` | OpenAI | #93 |
| `T-O106` | OpenAI | #94 |
| `T-O107` | OpenAI | #169 |
| `T-O108` | OpenAI | #155 |
| `T-O109` | OpenAI | #81 |
| `T-O110` | OpenAI | #90 |
| `T-O111` | OpenAI | #59 |
| `T-O112` | OpenAI | #87 |
| `T-O113` | OpenAI | #17 |
| `T-O114` | OpenAI | #37 |
| `T-O115` | OpenAI | #37 |
| `T-O116` | OpenAI | #43 |
| `T-O117` | OpenAI | #27 |
| `T-O118` | OpenAI | #25 |
| `T-O119` | OpenAI | #83 |
| `T-O120` | OpenAI | #18 |
| `T-O121` | OpenAI | #149 |
| `T-O122` | OpenAI | #117 |
| `T-O123` | OpenAI | #119 |
| `T-O124` | OpenAI | #92 |
| `T-O125` | OpenAI | #34 |
| `T-O126` | OpenAI | #178 |
| `T-O127` | OpenAI | #48 |
| `T-O128` | OpenAI | #152 |
| `T-O129` | OpenAI | #136 |
| `T-O130` | OpenAI | #137 |
| `T-O131` | OpenAI | #139 |
| `T-O132` | OpenAI | #138 |
| `T-O133` | OpenAI | #151 |
| `T-O134` | OpenAI | #146 |
| `T-O135` | OpenAI | #150 |
| `T-O136` | OpenAI | #215 |
| `T-O137` | OpenAI | #214 |
| `T-O138` | OpenAI | #57 |
| `T-O139` | OpenAI | #216 |
| `T-O140` | OpenAI | #153 |
| `T-O141` | OpenAI | #154 |
| `T-O142` | OpenAI | #140 |
| `G-01` | Google | #7 |
| `G-02` | Google | #12 |
| `G-03` | Google | #21 |
| `G-04` | Google | #46 |
| `G-05` | Google | #15 |
| `G-06` | Google | #101 |
| `G-07` | Google | #46 |
| `G-08` | Google | #40 |
| `G-09` | Google | #41 |
| `G-10` | Google | #42 |
| `G-11` | Google | #23 |
| `G-12` | Google | #187 |
| `G-13` | Google | #76 |
| `G-14` | Google | #77 |
| `G-15` | Google | #201 |
| `G-16` | Google | #79 |
| `G-17` | Google | #154 |
| `G-18` | Google | #255 |
| `G-19` | Google | #90 |
| `G-20` | Google | #59 |
| `G-21` | Google | #32 |
| `G-22` | Google | #32 |
| `G-23` | Google | #188 |
| `G-24` | Google | #189 |
| `G-25` | Google | #257 |
| `G-26` | Google | #77 |
| `G-27` | Google | #68 |
| `G-28` | Google | #163 |
| `G-29` | Google | #164 |
| `G-30` | Google | #166 |
| `G-31` | Google | #256 |
| `G-32` | Google | #258 |
| `G-33` | Google | #259 |
| `G-34` | Google | #68 |
| `G-35` | Google | #74 |
| `G-36` | Google | #84 |
| `G-37` | Google | #44 |
| `G-38` | Google | #80 |
| `G-39` | Google | #85 |
| `G-40` | Google | #209 |
| `G-41` | Google | #218 |
| `G-42` | Google | #219 |
| `G-43` | Google | #220 |
| `G-44` | Google | #221 |
| `G-45` | Google | #222 |
| `G-46` | Google | #223 |
| `G-47` | Google | #224 |
| `G-48` | Google | #225 |
| `G-49` | Google | #226 |
| `G-50` | Google | #227 |
| `G-51` | Google | #228 |
| `G-52` | Google | #229 |
| `G-53` | Google | #230 |
| `G-54` | Google | #134 |
| `G-55` | Google | #165 |
| `G-56` | Google | #123 |
| `G-57` | Google | #99 |
| `G-58` | Google | #167 |
| `G-59` | Google | #248 |
| `G-60` | Google | #190 |
| `G-61` | Google | #249 |
| `G-62` | Google | #245 |
| `G-63` | Google | #244 |
| `G-64` | Google | #246 |
| `G-65` | Google | #247 |
| `G-66` | Google | #30 |
| `G-67` | Google | #29 |
| `G-68` | Google | #30 |
| `G-69` | Google | #31 |
| `G-70` | Google | #200 |
| `G-71` | Google | #12 |
| `G-72` | Google | #43 |
| `G-73` | Google | #24 |
| `G-74` | Google | #187 |
| `G-75` | Google | #28 |
| `G-76` | Google | #50 |
| `G-77` | Google | #76 |
| `G-78` | Google | #61 |
| `G-79` | Google | #202 |
| `G-80` | Google | #38 |
| `G-81` | Google | #203 |
| `G-82` | Google | #204 |
| `G-83` | Google | #36 |
| `G-84` | Google | #19 |
| `G-85` | Google | #20 |
| `G-86` | Google | #12 |
| `X-01` | xAI | #66 |
| `X-02` | xAI | #67 |
| `X-03` | xAI | #263 |
| `X-04` | xAI | #211 |
| `X-05` | xAI | #209 |
| `X-06` | xAI | #212 |
| `X-07` | xAI | #210 |
| `X-08` | xAI | #213 |
| `X-09` | xAI | #129 |
| `X-10` | xAI | #146 |
| `X-11` | xAI | #130 |
| `X-12` | xAI | #131 |
| `X-13` | xAI | #134 |
| `X-14` | xAI | #147 |
| `X-15` | xAI | #145 |
| `X-16` | xAI | #191 |
| `X-17` | xAI | #191 |
| `X-18` | xAI | #161 |
| `X-19` | xAI | #162 |
| `X-20` | xAI | #13 |
| `X-21` | xAI | #167 |
| `X-22` | xAI | #10 |
| `X-23` | xAI | #233 |
| `X-24` | xAI | #98 |
| `X-25` | xAI | #100 |
| `X-26` | xAI | #192 |
| `X-27` | xAI | #190 |
| `X-28` | xAI | #186 |
| `X-29` | xAI | #193 |
| `X-30` | xAI | #217 |
| `X-31` | xAI | #235 |
| `X-32` | xAI | #236 |
| `X-33` | xAI | #264 |
| `X-34` | xAI | #53 |
| `X-35` | xAI | #10 |
| `X-36` | xAI | #10 |
| `X-37` | xAI | #237 |
| `X-38` | xAI | #231 |
| `X-39` | xAI | #232 |
| `X-40` | xAI | #216 |

<a id="appA2"></a>
### A-2. Part 2 來源編號（Qwen → DeepSeek → Mistral → Meta → Cohere → Microsoft）

> 「promptbook 章節」欄對應該廠 promptbook 檔案內的小節標題，方便逐條回查原文引文。

| 來源編號 | 廠商 | promptbook 章節 | 落入本檔條目 |
|---|---|---|---|
| `Q-01` | Qwen | A1 構建清晰明確的 Prompt | #12 |
| `Q-02` | Qwen | A2 六要素 Prompt 框架 | #266 |
| `Q-03` | Qwen | A3 為模型提供輸出樣例 | #39 |
| `Q-04` | Qwen | A4 設定完成任務的步驟 | #287 |
| `Q-05` | Qwen | A5 使用分隔符號區分單元 | #28 |
| `Q-06` | Qwen | A6 思維鏈（CoT） | #59 |
| `Q-07` | Qwen | A6 提示鏈（Prompt Chaining） | #187 |
| `Q-08` | Qwen | A7 Prompt 測試與迭代（線上回饋） | #290 |
| `Q-09` | Qwen | A8 用詞歧義（語言→語種） | #265 |
| `Q-10` | Qwen | A9 四要素組合抑制幻覺 | #282 |
| `Q-11` | Qwen | A10 Prompt 一鍵優化工具 | #204 |
| `Q-12` | Qwen | B1 /think 與 /no_think 軟開關 | #272 |
| `Q-13` | Qwen | B2 Qwen3.5 取消軟開關 | #272 |
| `Q-14` | Qwen | B3 thinking_budget | #68 |
| `Q-15` | Qwen | B4 混合思考 vs 僅思考模式 | #272 |
| `Q-16` | Qwen | C1 取樣參數／禁止 greedy decoding | #273 |
| `Q-17` | Qwen | C2 足夠的輸出長度 | #73 |
| `Q-18` | Qwen | C3 標準化輸出格式 | #283 |
| `Q-19` | Qwen | C4 多輪歷史不帶思考內容 | #275 |
| `Q-20` | Qwen | C5 強制模型真的開始思考 | #274 |
| `Q-21` | Qwen | C6 長輸入的處理（YaRN） | #280 |
| `Q-22` | Qwen | C7 工具呼叫走 Qwen-Agent | #155 |
| `D-01` | DeepSeek | A1 溫度設 0.5–0.7 | #273 |
| `D-02` | DeepSeek | A2 不要加系統提示 | #269 |
| `D-03` | DeepSeek | A3 數學題固定指令句 | #283 |
| `D-04` | DeepSeek | A4 評測要多跑取平均 | #288 |
| `D-05` | DeepSeek | A5 強制以 <think>\n 開頭 | #274 |
| `D-06` | DeepSeek | B1 檔案上傳模板 | #80 |
| `D-07` | DeepSeek | B2 網頁搜尋回答模板 | #92 |
| `D-08` | DeepSeek | C1 思考模式開關與 effort | #276 |
| `D-09` | DeepSeek | C2 思考模式不支援取樣參數 | #78 |
| `D-10` | DeepSeek | C3 reasoning_content 回傳規則 | #275 |
| `D-11` | DeepSeek | C4 JSON 輸出的 prompt 前置條件 | #284 |
| `D-12` | DeepSeek | C5 Chat Prefix Completion | #46 |
| `D-13` | DeepSeek | C6 多輪對話要自己串上下文 | #183 |
| `D-14` | DeepSeek | D Prompt Library（提示庫） | **找不到**（該頁無可擷取內容，見來源健康度表） |
| `MI-01` | Mistral | A1 system vs user（含串接替代法） | #270 |
| `MI-02` | Mistral | A2 Providing a Purpose（角色句型） | #48 |
| `MI-03` | Mistral | A3 Structure（寫給沒有前情提要的人） | #12 |
| `MI-04` | Mistral | A3 官方結構化骨架（語言偵測） | #267 |
| `MI-05` | Mistral | A4 Formatting（Markdown / XML 三理由） | #27 |
| `MI-06` | Mistral | A5 Example Prompting / Few-Shot | #39 |
| `MI-07` | Mistral | A6 Structured Outputs | #121 |
| `MI-08` | Mistral | A7 Advice（像程式碼一樣迭代） | #7 |
| `MI-09` | Mistral | B1 避免主觀與模糊的字眼 | #15 |
| `MI-10` | Mistral | B2 避免自相矛盾（決策樹） | #199 |
| `MI-11` | Mistral | B3 不要叫 LLM 數字數 | #286 |
| `MI-12` | Mistral | B4 不要產生太多 token | #291 |
| `MI-13` | Mistral | B5 Prefer Worded Scales | #289 |
| `MI-14` | Mistral | C1 Classification（兩種策略） | #285 |
| `MI-15` | Mistral | C2 Summarization（逐步指令） | #287 |
| `MI-16` | Mistral | C3 Personalization（提供事實表） | #23 |
| `MI-17` | Mistral | C4 Evaluation（三種作法） | #198 |
| `MI-18` | Mistral | D1 Temperature（0 也不完全確定） | #278 |
| `MI-19` | Mistral | D2 依任務挑溫度 | #278 |
| `MI-20` | Mistral | D3 Temperature 與 Top P 不要一起調 | #279 |
| `MI-21` | Mistral | E1 Magistral 推理系統提示 | #277 |
| `MI-22` | Mistral | E2 多輪保留 reasoning trace | #275 |
| `MI-23` | Mistral | E2 工具數量壓到最少 | #135 |
| `MI-24` | Mistral | E3 Mistral Large 3 溫度 < 0.1 | #278 |
| `MI-25` | Mistral | E2 Vision 影像長寬比 | #221 |
| `L-01` | Meta | A 什麼是 prompt engineering／為什麼先調 prompt | #1 |
| `L-02` | Meta | B Be clear and concise | #12 |
| `L-03` | Meta | B Use specific examples | #39 |
| `L-04` | Meta | B Vary the prompts | #201 |
| `L-05` | Meta | B Test and refine | #202 |
| `L-06` | Meta | B Gather feedback | #290 |
| `L-07` | Meta | B1 明確指令＝加規則與限制 | #15 |
| `L-08` | Meta | B2 Stylization | #116 |
| `L-09` | Meta | B3 Formatting | #101 |
| `L-10` | Meta | B4 Restrictions（含「不知道就說不知道」） | #89 |
| `L-11` | Meta | C1 Zero-shot / Few-shot（shot 詞源） | #39 |
| `L-12` | Meta | C2 Role-based prompts（Pros/Cons） | #48 |
| `L-13` | Meta | C3 Chain-of-thought（一串子問題） | #287 |
| `L-14` | Meta | C4 Self-consistency | #288 |
| `L-15` | Meta | C5 Retrieval-augmented generation | #23 |
| `L-16` | Meta | C6 Limiting extraneous tokens | #120 |
| `L-17` | Meta | C7 Program-aided language models | #154 |
| `L-18` | Meta | C8 Reducing hallucinations | #281 |
| `L-19` | Meta | D Llama 4 建議系統提示 | #271 |
| `L-20` | Meta | D1 Llama 4 的四種角色 | #51 |
| `L-21` | Meta | E Vision（版本對應） | #218 |
| `L-22` | Meta | F llama-prompt-ops | #204 |
| `CO-01` | Cohere | C-A1 指令放最前面 | #37 |
| `CO-02` | Cohere | C-A1 ## 標頭分區 | #27 |
| `CO-03` | Cohere | C-A2 Context / grounded generation | #23 |
| `CO-04` | Cohere | C-A3 Incorporating Example Outputs | #101 |
| `CO-05` | Cohere | C-A4 Structured Output | #101 |
| `CO-06` | Cohere | C-A5 Do vs. Do Not Do | #14 |
| `CO-07` | Cohere | C-A6 Length Control | #107 |
| `CO-08` | Cohere | C-A7 Begin the Completion Yourself | #46 |
| `CO-09` | Cohere | C-A8 Task Splitting | #287 |
| `CO-10` | Cohere | C-B1 Defining the Task | #13 |
| `CO-11` | Cohere | C-B2 Few-shot（負面範例／順序） | #268 |
| `CO-12` | Cohere | C-B3 Chain of Thought（三種寫法） | #61 |
| `CO-13` | Cohere | C-B4 Prompt Chaining | #187 |
| `CO-14` | Cohere | C-C 三層 preamble 與優先序 | #51 |
| `CO-15` | Cohere | C-C Command A 預設 system message | #116 |
| `MS-01` | Microsoft | M1 開場警語（不適用於推理模型） | #57 |
| `MS-02` | Microsoft | M-1 Prompt 的五種組成元件 | #30 |
| `MS-03` | Microsoft | M-2 Zero/One/Few-shot | #39 |
| `MS-04` | Microsoft | M-3 Start with clear instructions | #37 |
| `MS-05` | Microsoft | M-4 Repeat instructions at the end | #81 |
| `MS-06` | Microsoft | M-5 Prime the output | #46 |
| `MS-07` | Microsoft | M-6 Add clear syntax | #28 |
| `MS-08` | Microsoft | M-7 Break the task down | #287 |
| `MS-09` | Microsoft | M-8 Use of affordances | #154 |
| `MS-10` | Microsoft | M-9 Chain of thought prompting | #59 |
| `MS-11` | Microsoft | M-9 萃取推理的使用政策警語 | #58 |
| `MS-12` | Microsoft | M-10 引用降低幻覺／行內優於文末 | #92 |
| `MS-13` | Microsoft | M-10 避免複合陳述（指定輸出結構） | #132 |
| `MS-14` | Microsoft | M-11 Temperature 與 Top_p | #278 |
| `MS-15` | Microsoft | M-12 Provide grounding context | #23 |
| `MS-16` | Microsoft | M-13 Be specific / Be descriptive | #13 |
| `MS-17` | Microsoft | M-13 Double down | #81 |
| `MS-18` | Microsoft | M-13 Order matters | #37 |
| `MS-19` | Microsoft | M-13 Give the model an "out" | #89 |
| `MS-20` | Microsoft | M-14 Space efficiency | #292 |

<a id="appB"></a>
### B. 反查：本檔條目 → 來源編號

| 條目 | 來源編號 |
|---|---|
| #1 | `T-O01`, `L-01` |
| #2 | `T-A51` |
| #3 | `T-A52` |
| #4 | `T-O02`, `T-O15`, `T-O53`, `T-O54` |
| #5 | `T-O03` |
| #6 | `T-O05` |
| #7 | `G-01`, `MI-08` |
| #8 | `T-A107` |
| #9 | `T-A106` |
| #10 | `X-22`, `X-35`, `X-36` |
| #11 | （無 — 出處找不到，見條目說明） |
| #12 | `T-A01`, `G-02`, `G-71`, `G-86`, `Q-01`, `MI-03`, `L-02` |
| #13 | `X-20`, `CO-10`, `MS-16` |
| #14 | `T-A11`, `CO-06` |
| #15 | `G-05`, `MI-09`, `L-07` |
| #16 | `T-A23` |
| #17 | `T-A82`, `T-O113` |
| #18 | `T-O120` |
| #19 | `G-84` |
| #20 | `G-85` |
| #21 | `G-03` |
| #22 | `T-A02`, `T-A63` |
| #23 | `T-O11`, `G-11`, `MI-16`, `L-15`, `CO-03`, `MS-15` |
| #24 | `G-73` |
| #25 | `T-A04`, `T-O08`, `T-O118` |
| #26 | `T-A104` |
| #27 | `T-O07`, `T-O47`, `T-O117`, `MI-05`, `CO-02` |
| #28 | `G-75`, `Q-05`, `MS-07` |
| #29 | `G-67` |
| #30 | `G-66`, `G-68`, `MS-02` |
| #31 | `G-69` |
| #32 | `G-21`, `G-22` |
| #33 | `T-O06` |
| #34 | `T-O125` |
| #35 | `T-O37` |
| #36 | `G-83` |
| #37 | `T-O114`, `T-O115`, `CO-01`, `MS-04`, `MS-18` |
| #38 | `G-80` |
| #39 | `T-A03`, `T-O10`, `Q-03`, `MI-06`, `L-03`, `L-11`, `MS-03` |
| #40 | `G-08` |
| #41 | `G-09` |
| #42 | `G-10` |
| #43 | `T-O116`, `G-72` |
| #44 | `G-37` |
| #45 | `T-O48` |
| #46 | `G-04`, `G-07`, `D-12`, `CO-08`, `MS-06` |
| #47 | `T-A32` |
| #48 | `T-A05`, `T-O127`, `MI-02`, `L-12` |
| #49 | `T-A105` |
| #50 | `G-76` |
| #51 | `T-O04`, `L-20`, `CO-14` |
| #52 | `T-O50` |
| #53 | `X-34` |
| #54 | `T-A09` |
| #55 | `T-A31`, `T-O42`, `T-O49` |
| #56 | `T-O45` |
| #57 | `T-O46`, `T-O138`, `MS-01` |
| #58 | `T-A67`, `MS-11` |
| #59 | `T-O111`, `G-20`, `Q-06`, `MS-10` |
| #60 | `T-A33` |
| #61 | `G-78`, `CO-12` |
| #62 | `T-A29` |
| #63 | `T-A30` |
| #64 | `T-A55`, `T-A77`, `T-A78`, `T-A88` |
| #65 | `T-O34`, `T-O41`, `T-O82` |
| #66 | `X-01` |
| #67 | `X-02` |
| #68 | `G-27`, `G-34`, `Q-14` |
| #69 | `T-A28` |
| #70 | `T-A27` |
| #71 | `T-A75` |
| #72 | `T-A35` |
| #73 | `T-A79`, `T-O43`, `Q-17` |
| #74 | `T-O44`, `G-35` |
| #75 | `T-O92` |
| #76 | `G-13`, `G-77` |
| #77 | `G-14`, `G-26` |
| #78 | `T-A83`, `D-09` |
| #79 | `G-16` |
| #80 | `T-A06`, `G-38`, `D-06` |
| #81 | `T-O109`, `MS-05`, `MS-17` |
| #82 | `T-A07` |
| #83 | `T-O119` |
| #84 | `G-36` |
| #85 | `G-39` |
| #86 | `T-O98` |
| #87 | `T-O112` |
| #88 | `T-A08` |
| #89 | `T-A103`, `T-O99`, `L-10`, `MS-19` |
| #90 | `T-O110`, `G-19` |
| #91 | `T-O32` |
| #92 | `T-O124`, `D-07`, `MS-12` |
| #93 | `T-O105` |
| #94 | `T-O106` |
| #95 | `T-A41` |
| #96 | `T-A57` |
| #97 | `T-A47` |
| #98 | `X-24` |
| #99 | `G-57` |
| #100 | `X-25` |
| #101 | `G-06`, `L-09`, `CO-04`, `CO-05` |
| #102 | `T-A12` |
| #103 | `T-A13` |
| #104 | `T-A14` |
| #105 | `T-O51`, `T-O93` |
| #106 | `T-A15` |
| #107 | `T-O27`, `T-O87`, `T-O96`, `CO-07` |
| #108 | `T-O28` |
| #109 | `T-O26` |
| #110 | `T-A10` |
| #111 | `T-A69` |
| #112 | `T-A76` |
| #113 | `T-A71` |
| #114 | `T-A56` |
| #115 | `T-A64` |
| #116 | `T-A92`, `T-O29`, `L-08`, `CO-15` |
| #117 | `T-O122` |
| #118 | `T-A70`, `T-A81`, `T-O33`, `T-O101` |
| #119 | `T-O81`, `T-O123` |
| #120 | `T-A19`, `L-16` |
| #121 | `T-A18`, `MI-07` |
| #122 | `T-O66` |
| #123 | `T-O67`, `G-56` |
| #124 | `T-O68` |
| #125 | `T-O69`, `T-O70` |
| #126 | `T-O71` |
| #127 | `T-O72` |
| #128 | `T-O73` |
| #129 | `X-09` |
| #130 | `X-11` |
| #131 | `X-12` |
| #132 | `T-O103`, `MS-13` |
| #133 | `T-A16` |
| #134 | `T-A95`, `T-A100`, `T-O30`, `T-O55`, `G-54`, `X-13` |
| #135 | `T-O20`, `T-O62`, `MI-23` |
| #136 | `T-O56`, `T-O129` |
| #137 | `T-O130` |
| #138 | `T-O132` |
| #139 | `T-A96`, `T-O57`, `T-O131` |
| #140 | `T-A98`, `T-O142` |
| #141 | `T-A97`, `T-O61` |
| #142 | `T-A99` |
| #143 | `T-O59` |
| #144 | `T-O60` |
| #145 | `T-A101`, `T-O63`, `X-15` |
| #146 | `T-A102`, `T-O64`, `T-O134`, `X-10` |
| #147 | `X-14` |
| #148 | `T-A26`, `T-O65` |
| #149 | `T-A93`, `T-O121` |
| #150 | `T-A94`, `T-O135` |
| #151 | `T-O133` |
| #152 | `T-O128` |
| #153 | `T-O140` |
| #154 | `T-O141`, `G-17`, `L-17`, `MS-09` |
| #155 | `T-O108`, `Q-22` |
| #156 | `T-O58` |
| #157 | `T-A25` |
| #158 | `T-A80`, `T-A89` |
| #159 | `T-O31` |
| #160 | `T-O102` |
| #161 | `X-18` |
| #162 | `X-19` |
| #163 | `G-28` |
| #164 | `G-29` |
| #165 | `G-55` |
| #166 | `G-30` |
| #167 | `G-58`, `X-21` |
| #168 | `T-A65` |
| #169 | `T-O14`, `T-O107` |
| #170 | `T-A24`, `T-O78`, `T-O79`, `T-O80` |
| #171 | `T-O23` |
| #172 | `T-O24`, `T-O25` |
| #173 | `T-A40` |
| #174 | `T-A58` |
| #175 | `T-A45`, `T-O86`, `T-O88`, `T-O97` |
| #176 | `T-A46` |
| #177 | `T-O12`, `T-O95` |
| #178 | `T-O126` |
| #179 | `T-O89` |
| #180 | `T-A36` |
| #181 | `T-A37`, `T-A62` |
| #182 | `T-A38` |
| #183 | `T-A39`, `D-13` |
| #184 | `T-A60` |
| #185 | `T-A61` |
| #186 | `T-A42`, `T-A59`, `T-A73`, `T-A90`, `X-28` |
| #187 | `T-A43`, `G-12`, `G-74`, `Q-07`, `CO-13` |
| #188 | `G-23` |
| #189 | `G-24` |
| #190 | `G-60`, `X-27` |
| #191 | `X-16`, `X-17` |
| #192 | `X-26` |
| #193 | `X-29` |
| #194 | `T-A44` |
| #195 | `T-A34`, `T-A72`, `T-A74` |
| #196 | `T-A66`, `T-O36` |
| #197 | `T-A68`, `T-A86` |
| #198 | `T-O85`, `MI-17` |
| #199 | `T-O90`, `MI-10` |
| #200 | `G-70` |
| #201 | `G-15`, `L-04` |
| #202 | `G-79`, `L-05` |
| #203 | `G-81` |
| #204 | `T-O91`, `G-82`, `Q-11`, `L-22` |
| #205 | `T-A53`, `T-O94` |
| #206 | `T-O16` |
| #207 | `T-O17`, `T-O18`, `T-O19`, `T-O21` |
| #208 | `T-O22` |
| #209 | `T-O09`, `T-O74`, `G-40`, `X-05` |
| #210 | `T-O75`, `X-07` |
| #211 | `T-O76`, `T-O77`, `X-04` |
| #212 | `X-06` |
| #213 | `T-O100`, `X-08` |
| #214 | `T-O137` |
| #215 | `T-O136` |
| #216 | `T-O52`, `T-O83`, `T-O139`, `X-40` |
| #217 | `X-30` |
| #218 | `G-41`, `L-21` |
| #219 | `G-42` |
| #220 | `G-43` |
| #221 | `G-44`, `MI-25` |
| #222 | `G-45` |
| #223 | `G-46` |
| #224 | `G-47` |
| #225 | `G-48` |
| #226 | `G-49` |
| #227 | `G-50` |
| #228 | `G-51` |
| #229 | `G-52` |
| #230 | `G-53` |
| #231 | `X-38` |
| #232 | `X-39` |
| #233 | `X-23` |
| #234 | `T-A48` |
| #235 | `X-31` |
| #236 | `X-32` |
| #237 | `X-37` |
| #238 | `T-A49` |
| #239 | `T-A84` |
| #240 | `T-A91` |
| #241 | `T-O13`, `T-O84` |
| #242 | `T-O35` |
| #243 | `T-A87` |
| #244 | `G-63` |
| #245 | `G-62` |
| #246 | `G-64` |
| #247 | `G-65` |
| #248 | `G-59` |
| #249 | `G-61` |
| #250 | `T-O40` |
| #251 | `T-A17`, `T-A20`, `T-A21`, `T-A22` |
| #252 | `T-A50` |
| #253 | `T-A54` |
| #254 | `T-A85` |
| #255 | `G-18` |
| #256 | `G-31` |
| #257 | `G-25` |
| #258 | `G-32` |
| #259 | `G-33` |
| #260 | `T-O38` |
| #261 | `T-O104` |
| #262 | `T-O39` |
| #263 | `X-03` |
| #264 | `X-33` |
| #265 | `Q-09` |
| #266 | `Q-02` |
| #267 | `MI-04` |
| #268 | `CO-11` |
| #269 | `D-02` |
| #270 | `MI-01` |
| #271 | `L-19` |
| #272 | `Q-12`, `Q-13`, `Q-15` |
| #273 | `Q-16`, `D-01` |
| #274 | `Q-20`, `D-05` |
| #275 | `Q-19`, `D-10`, `MI-22` |
| #276 | `D-08` |
| #277 | `MI-21` |
| #278 | `MI-18`, `MI-19`, `MI-24`, `MS-14` |
| #279 | `MI-20` |
| #280 | `Q-21` |
| #281 | `L-18` |
| #282 | `Q-10` |
| #283 | `Q-18`, `D-03` |
| #284 | `D-11` |
| #285 | `MI-14` |
| #286 | `MI-11` |
| #287 | `Q-04`, `MI-15`, `L-13`, `CO-09`, `MS-08` |
| #288 | `D-04`, `L-14` |
| #289 | `MI-13` |
| #290 | `Q-08`, `L-06` |
| #291 | `MI-12` |
| #292 | `MS-20` |


<a id="appC"></a>

### C. 遊戲課程對照表（`src/data/curriculum.json` 68 技巧 → 本檔條目）

> **這張表回答的是「遊戲裡教的每一條，本檔都有涵蓋嗎？」** 結論：**68 / 68 全部對得到條目**（無遺漏）。
> 對應方式是**依概念**而非依字面：遊戲課程的顆粒度比本檔細，所以會出現多對一（例如 `decompose-01`–`decompose-04` 四條都落在 #187）與一對多（一條課程技巧橫跨本檔兩三個條目）。
> 「覆蓋」欄：**完整** ＝ 該課程技巧的每一項宣稱在本檔都有附官方出處的對應；**部分** ＝ 主體有涵蓋，但其中某項宣稱的原始出處已下架／擷取失敗，本檔依護欄不予收錄，於下方逐條說明。
> 驗證方式：以程式比對 `curriculum.json` 的 68 個 `id` 與本檔的 `### N.` 標題，確認每個引用的條目編號都真實存在。

| 課程 id | 課程技巧名 | 分群 | 對應本檔條目 | 覆蓋 |
|---|---|---|---|---|
| `clarity-01` | 把模型當成聰明但沒 context 的新同事 | 撰寫基本功（foundations） | [#12](#e12) 把話說清楚、直接說（Be clear and direct ／ 黃金法則） | 完整 |
| `clarity-02` | 具體說明情境、結果、長度、格式、風格 | 撰寫基本功（foundations） | [#13](#e13) 要求要具體：官方 good／bad 對照（Be specific in requests）<br>[#12](#e12) 把話說清楚、直接說（Be clear and direct ／ 黃金法則） | 完整 |
| `clarity-03` | 消除模糊語言，改用具體參數 | 撰寫基本功（foundations） | [#15](#e15) 明確寫出限制（Constraints） | 完整 |
| `clarity-04` | 指令放最前面，並與內容用分隔符隔開 | 撰寫基本功（foundations） | [#37](#e37) Response Rules 放最前面；指令衝突時模型傾向遵循靠近結尾的那條（Position effects）<br>[#28](#e28) 前綴標籤與 BEGIN/END、{} 分隔符（Prefixes and section delimiters） | 完整 |
| `clarity-05` | 加上「為什麼」——說明指令背後的動機 | 撰寫基本功（foundations） | [#22](#e22) 說明「為什麼」：給指令背後的動機（Add context / give the reason） | 完整 |
| `clarity-06` | 對新一代模型要更明確、善用修飾語 | 撰寫基本功（foundations） | [#12](#e12) 把話說清楚、直接說（Be clear and direct ／ 黃金法則）<br>[#17](#e17) 新一代模型更「照字面」執行：適用範圍要明講（Literal instruction following） | 完整 |
| `positive-01` | 說要做什麼，而非只說不要做什麼 | 撰寫基本功（foundations） | [#14](#e14) 說「要做什麼」而不是「不要做什麼」（Positive framing） | 完整 |
| `format-01` | 明確指定格式、長度與結構 | 撰寫基本功（foundations） | [#101](#e101) 直接指定回應格式（Response format）<br>[#15](#e15) 明確寫出限制（Constraints） | 完整 |
| `format-02` | 用範例展示想要的格式（勝過只用文字描述） | 撰寫基本功（foundations） | [#39](#e39) Few-shot 的基本功：相關、多樣、結構化、3–5 個（Use examples effectively）<br>[#46](#e46) 補完策略：寫出回應的開頭讓模型接下去（Partial input completion） | 完整 |
| `format-03` | 用「部分輸入」引導模型完成（partial input） | 撰寫基本功（foundations） | [#46](#e46) 補完策略：寫出回應的開頭讓模型接下去（Partial input completion） | 完整 |
| `format-04` | 用 XML 標籤指定輸出區塊 | 撰寫基本功（foundations） | [#102](#e102) 用 XML 格式指示器指定輸出區塊（XML format indicators） | 完整 |
| `format-05` | 讓 prompt 的風格貼近你想要的輸出風格 | 撰寫基本功（foundations） | [#103](#e103) Prompt 本身的排版風格會傳染給輸出（Match your prompt style to the desired output） | 完整 |
| `format-06` | 控制冗長度（verbosity） | 撰寫基本功（foundations） | [#107](#e107) 給具體的長度限制，並做分層 verbosity（Concrete length constraints）<br>[#111](#e111) ⭐ `effort` 控制的是「想多少」不是「說多少」（Effort ≠ response length） | 完整 |
| `structure-01` | 用 Markdown、XML 標籤或章節標題分段 | 撰寫基本功（foundations） | [#27](#e27) 用 Markdown 標題、清單與章節標題當分隔符（Markdown delimiters）<br>[#25](#e25) 用 XML 標籤把 prompt 分區（Structure prompts with XML tags） | 完整 |
| `structure-02` | Anthropic 特別重視 XML 標籤 | 撰寫基本功（foundations） | [#25](#e25) 用 XML 標籤把 prompt 分區（Structure prompts with XML tags）<br>[#82](#e82) 用 XML 結構化多文件與 metadata（Document structure） | 完整 |
| `structure-03` | GPT-4.1 建議的 prompt 段落順序 | 撰寫基本功（foundations） | [#34](#e34) 官方骨架 D：GPT-4.1 的七段模板 | 完整 |
| `structure-04` | Google 的前綴（prefix）技巧 | 撰寫基本功（foundations） | [#28](#e28) 前綴標籤與 BEGIN/END、{} 分隔符（Prefixes and section delimiters）<br>[#46](#e46) 補完策略：寫出回應的開頭讓模型接下去（Partial input completion） | 完整 |
| `structure-05` | 長 context 時，指令放「頭尾各一份」 | 撰寫基本功（foundations） | [#81](#e81) ⚠️ GPT-4.1 長文：指令放在**開頭與結尾各一次** | 完整 |
| `role-01` | 在 system prompt 設定角色，哪怕一句話也有效 | 角色與參數（config） | [#48](#e48) 給模型一個角色（Role / persona prompting） | 完整 |
| `role-02` | 善用訊息角色的優先序（developer > user） | 角色與參數（config） | [#51](#e51) 指令階層：developer > user（Chain of command） | 完整 |
| `role-03` | 把關鍵指令放進 system instruction | 角色與參數（config） | [#50](#e50) System instruction 的五種用途與安全定位（System instructions）<br>[#37](#e37) Response Rules 放最前面；指令衝突時模型傾向遵循靠近結尾的那條（Position effects） | 完整 |
| `role-04` | xAI：詳細的 system prompt 帶來明顯提升 | 角色與參數（config） | [#50](#e50) System instruction 的五種用途與安全定位（System instructions）<br>[#12](#e12) 把話說清楚、直接說（Be clear and direct ／ 黃金法則） | **部分** |
| `fewshot-01` | 放 3–5 個範例，效果最穩 | 示範與推理（reasoning） | [#39](#e39) Few-shot 的基本功：相關、多樣、結構化、3–5 個（Use examples effectively） | 完整 |
| `fewshot-02` | 範例要「相關、多樣、結構化」 | 示範與推理（reasoning） | [#39](#e39) Few-shot 的基本功：相關、多樣、結構化、3–5 個（Use examples effectively） | 完整 |
| `fewshot-03` | Google：幾乎一定要放範例，且格式要一致 | 示範與推理（reasoning） | [#40](#e40) Google 立場：建議**永遠**在 prompt 裡放 few-shot 範例（Always include few-shot）<br>[#42](#e42) 範例的格式必須完全一致（Consistent formatting） | 完整 |
| `fewshot-04` | 範例數量靠實驗，太多會 overfit | 示範與推理（reasoning） | [#41](#e41) 範例數量要實測，太多會 overfit（Number of examples） | 完整 |
| `fewshot-05` | 漸進策略：先 zero-shot → few-shot → fine-tune | 示範與推理（reasoning） | [#45](#e45) 推理模型先試 zero-shot，再考慮加範例（Zero-shot first）<br>[#3](#e3) 不是每個問題都該用 prompt engineering 解（When to prompt engineer） | **部分** |
| `cot-01` | 引導逐步思考（針對非推理模型） | 示範與推理（reasoning） | [#59](#e59) 非推理模型仍要明講逐步思考；重推理問題可加「Think very hard」 | 完整 |
| `cot-02` | 用 <thinking> / <answer> 分離推理與最終答案 | 示範與推理（reasoning） | [#60](#e60) 手動 chain-of-thought 作為 fallback（thinking 關閉時）<br>[#61](#e61) 要求解釋推理，並用分隔符把推理與答案切開（Explain its reasoning） | 完整 |
| `cot-03` | 在 few-shot 範例裡放 <thinking> 示範推理 | 示範與推理（reasoning） | [#47](#e47) 在範例裡用 `<thinking>` 標籤示範推理樣式（Multishot examples work with thinking） | 完整 |
| `cot-04` | 請模型自我檢查 | 示範與推理（reasoning） | [#195](#e195) ⚠️ 要求自我檢查——但新一代模型要把這類指令**刪掉**（Self-check / over-verification） | 完整 |
| `reasoning-01` | 別叫推理模型「think step by step」 | 示範與推理（reasoning） | [#57](#e57) ⚠️ 不要對推理模型下 CoT，也不要在工具呼叫前誘發額外推理（Avoid chain-of-thought for reasoning models） | 完整 |
| `reasoning-02` | 推理模型：保持簡短、先 zero-shot、給明確成功標準 | 示範與推理（reasoning） | [#56](#e56) 推理模型偏好簡短清楚的指令（Keep it simple）<br>[#55](#e55) 推理模型：給目標與成功標準，不要規定每一個中間步驟（General instructions over prescriptive steps）<br>[#45](#e45) 推理模型先試 zero-shot，再考慮加範例（Zero-shot first） | 完整 |
| `reasoning-03` | Anthropic：用 adaptive thinking + effort，取代 budget_tokens | 示範與推理（reasoning） | [#62](#e62) Adaptive thinking：模型自己決定何時想、想多久（Adaptive thinking）<br>[#64](#e64) Anthropic `effort` 等級與調校原則（Effort levels）<br>[#69](#e69) ⚠️ Anthropic `budget_tokens` 已淘汰（Claude 4.7+ 會回 400） | 完整 |
| `reasoning-04` | Gemini 2.5／3：內建思考，簡單 nudge 即可 | 示範與推理（reasoning） | [#59](#e59) 非推理模型仍要明講逐步思考；重推理問題可加「Think very hard」<br>[#68](#e68) Google `thinking_level` 取代 `thinking_budget`，並依任務難度選檔 | 完整 |
| `reasoning-05` | xAI Grok 4.5：用 reasoning_effort 調節，且無法關閉 | 示範與推理（reasoning） | [#66](#e66) xAI `reasoning_effort`：三級、預設 high、**不能關閉** | 完整 |
| `grounding-01` | 提供參考文本，並要求只根據它作答 | 脈絡與長文（grounding） | [#90](#e90) 嚴格 grounding：只用提供的脈絡作答（Strict grounding）<br>[#23](#e23) 把模型需要的資訊直接放進 prompt（Add context / RAG） | 完整 |
| `grounding-02` | 給模型一條「出路」，避免硬掰 | 脈絡與長文（grounding） | [#89](#e89) 允許模型說「我不知道」，並要求它明確指出模糊之處 | 完整 |
| `grounding-03` | 工具資訊不足時，請模型反問使用者 | 脈絡與長文（grounding） | [#150](#e150) 缺少必要參數時：問使用者，不要猜<br>[#151](#e151) ⭐ 明確禁止「承諾稍後再呼叫工具」的幻覺 | 完整 |
| `grounding-04` | 要求「先引用文件再作答」 | 脈絡與長文（grounding） | [#88](#e88) 先原文引用，再作答（Ground responses in quotes） | 完整 |
| `grounding-05` | 別臆測沒讀過的東西（investigate before answering） | 脈絡與長文（grounding） | [#97](#e97) 讀過再說：agentic coding 的抗幻覺指令（Minimizing hallucinations in agentic coding） | 完整 |
| `grounding-06` | 用 Grounding with Search / 程式執行工具補實 | 脈絡與長文（grounding） | [#154](#e154) 明確要求「寧可用工具也不要自己算」（Prefer tools over internal computation）<br>[#167](#e167) Code execution：什麼時候該開，以及它的副作用 | 完整 |
| `longcontext-01` | 長文件放最上面，問題放最後 | 脈絡與長文（grounding） | [#80](#e80) 長資料放最上面、問題與指令放最後（Queries at the end） | 完整 |
| `longcontext-02` | 用 XML <documents> 包裹多份文件 | 脈絡與長文（grounding） | [#82](#e82) 用 XML 結構化多文件與 metadata（Document structure） | 完整 |
| `longcontext-03` | 大段資料後加一句「承上」錨定 | 脈絡與長文（grounding） | [#80](#e80) 長資料放最上面、問題與指令放最後（Queries at the end）<br>[#255](#e255) Gemini 3 的核心提示原則（官方八條總表） | 完整 |
| `decompose-01` | 把複雜任務拆成子任務 | 流程與代理（orchestration） | [#187](#e187) 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate）<br>[#169](#e169) ⭐ 三條經典 agentic 提醒（Persistence / Tool-calling / Planning） | 完整 |
| `decompose-02` | Prompt chaining：一步的輸出餵給下一步 | 流程與代理（orchestration） | [#187](#e187) 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate） | 完整 |
| `decompose-03` | 最常見的鏈：自我修正（draft → review → refine） | 流程與代理（orchestration） | [#187](#e187) 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate） | 完整 |
| `decompose-04` | 平行處理再合併（aggregate responses） | 流程與代理（orchestration） | [#187](#e187) 把複雜任務拆成多個 prompt：拆指令／串接（chain）／彙總（aggregate） | 完整 |
| `agentic-01` | 用 API 的 tools 欄位定義工具，別塞在文字裡 | 流程與代理（orchestration） | [#155](#e155) 用 API 原生的 `tools` 欄位，不要把 schema 手動塞進 prompt | 完整 |
| `agentic-02` | 工具與參數的描述要清楚 | 流程與代理（orchestration） | [#134](#e134) ⭐ 工具描述是工具效能**最重要**的因素（Tool descriptions）<br>[#137](#e137) 把使用準則寫進 function description 本身 | 完整 |
| `agentic-03` | GPT-4.1 的三個 agent 系統提醒 | 流程與代理（orchestration） | [#169](#e169) ⭐ 三條經典 agentic 提醒（Persistence / Tool-calling / Planning） | 完整 |
| `agentic-04` | 明確區分「動手做」vs「只給建議」 | 流程與代理（orchestration） | [#16](#e16) 用祈使句要求「動手做」而不是「給建議」（Ask for action, not suggestions） | 完整 |
| `agentic-05` | 善用平行工具呼叫 | 流程與代理（orchestration） | [#148](#e148) 平行工具呼叫（Parallel tool calling） | 完整 |
| `agentic-06` | 高風險／不可逆動作先請使用者確認 | 流程與代理（orchestration） | [#173](#e173) 依「可逆性」決定要不要先問（Balancing autonomy and safety）<br>[#172](#e172) ⭐ 定義自主性與核准邊界（Autonomy and approval boundaries） | 完整 |
| `agentic-07` | Structured Outputs：用 schema 約束輸出 | 流程與代理（orchestration） | [#121](#e121) 用 Structured Outputs 約束輸出結構（取代 prefill 控格式）<br>[#129](#e129) ⭐ 讓 schema 承擔格式，prompt 只負責講任務（Division of labour）<br>[#124](#e124) ⭐ Structured Outputs vs JSON mode：一律優先用前者 | 完整 |
| `iterate-01` | 建立 eval、頻繁迭代 | 流程與代理（orchestration） | [#5](#e5) 生產環境釘住 model snapshot 並建立測試套件（Pin snapshots + evals）<br>[#1](#e1) Prompt engineering 的定義：非決定性，一半藝術一半科學（What prompt engineering is） | 完整 |
| `iterate-02` | 換句話說／換類比任務／換內容順序 | 流程與代理（orchestration） | [#201](#e201) 迭代三招：換句話說／換成類比任務／調換內容順序 | 完整 |
| `iterate-03` | 讓模型改進自己的 prompt（metaprompting） | 流程與代理（orchestration） | [#205](#e205) ⭐ Metaprompting：讓模型優化自己的 prompt<br>[#204](#e204) 用官方的 prompt 優化工具（Prompt optimizers）<br>[#19](#e19) 用自然語言、完整句子；並把 Gemini 當成你的 prompt 編輯器（Workspace 六條） | 完整 |
| `iterate-04` | xAI：持續 refine，並引用上次的失敗 | 流程與代理（orchestration） | [#202](#e202) 迭代方法論與「已經收斂」的判準<br>[#19](#e19) 用自然語言、完整句子；並把 Gemini 當成你的 prompt 編輯器（Workspace 六條） | **部分** |
| `iterate-05` | Prompt caching：把穩定內容放前面 | 流程與代理（orchestration） | [#209](#e209) ⭐ 靜態內容放前面、變動內容放後面（Front-load static content） | 完整 |
| `params-01` | Temperature：控制隨機性 | 角色與參數（config） | [#76](#e76) 取樣參數總覽：max output tokens / temperature / topK / topP / stop_sequences / seed<br>[#278](#e278) temperature 怎麼挑：依任務性質分兩類；而且 `0` 不保證完全決定性 | 完整 |
| `params-02` | top-p / top-k：取樣範圍 | 角色與參數（config） | [#76](#e76) 取樣參數總覽：max output tokens / temperature / topK / topP / stop_sequences / seed<br>[#279](#e279) Temperature 與 Top P 不要一起調（固定一個、調另一個） | 完整 |
| `params-03` | 推理／冗長度參數：effort · reasoning_effort · verbosity | 角色與參數（config） | [#65](#e65) OpenAI `reasoning.effort`：七級與「先建 baseline 再動它」<br>[#64](#e64) Anthropic `effort` 等級與調校原則（Effort levels）<br>[#66](#e66) xAI `reasoning_effort`：三級、預設 high、**不能關閉** | 完整 |
| `params-04` | Max output tokens 與 stop sequences | 角色與參數（config） | [#76](#e76) 取樣參數總覽：max output tokens / temperature / topK / topP / stop_sequences / seed | 完整 |
| `framework-01` | Google Workspace：Persona · Task · Context · Format | 角色與參數（config） | [#36](#e36) 官方骨架 F：Persona-Task-Context-Format 四要素（P-T-C-F）<br>[#20](#e20) 量化基準：最成功的 prompt 平均約 21 個字（The 21-word finding） | 完整 |
| `framework-02` | OpenAI：結構化 prompt 四區塊 | 角色與參數（config） | [#33](#e33) 官方骨架 C：OpenAI developer message 四段（Identity → Instructions → Examples → Context） | 完整 |
| `framework-03` | 何時用推理模型 vs 一般模型 | 角色與參數（config） | [#4](#e4) 選模型：推理模型像資深同事，GPT 模型像新進同事（Reasoning vs GPT models） | 完整 |

**統計**：完整 **65** 條、部分 **3** 條、未涵蓋 **0** 條。68 條課程技巧共落在本檔 **80 個相異條目**上（本檔 292 條中的 27%——換句話說，**遊戲目前教的只是這份總表的一小部分，還有 212 條沒有進到課程**）。

#### C-1. 三條「部分涵蓋」的誠實說明

> 這三條的共同點是：**課程引用的原始頁面已經下架或擋擷取**，所以本檔依「內容正確且附出處、不臆造」的原則**不收錄**該宣稱，只保留有官方出處的部分。

- **`role-04`（xAI：詳細的 system prompt 帶來明顯提升）** → [#50](#e50)、[#12](#e12)
  - xAI 專屬的兩項宣稱（詳細 system prompt 帶來明顯提升／Grok 4.5 角色任意順序）**找不到**可驗證官方出處：主要來源 `grok-code-prompt-engineering` 已 404，次要來源 `models/grok-4.5` 經本次複查為純規格頁、無此敘述。#50／#12 只涵蓋通用的「把規則寫進 system instruction、講明確」。
- **`fewshot-05`（漸進策略：先 zero-shot → few-shot → fine-tune）** → [#45](#e45)、[#3](#e3)
  - 「不夠就微調（fine-tune）」這一階**找不到**可驗證官方出處：主要來源為 OpenAI Help Center（HTTP 403，見 #11）。已驗證的部分是推理模型的「先 zero-shot 再考慮加範例」（#45）與「先問這是不是 prompt 的問題」（#3）。
- **`iterate-04`（xAI：持續 refine，並引用上次的失敗）** → [#202](#e202)、[#19](#e19)
  - 「在下一輪 prompt 裡明講上一次失敗在哪」這個具體動作**找不到**可驗證官方出處：唯一來源 `grok-code-prompt-engineering` 已 404。#202／#19 只涵蓋通用的「當成對話、持續修正」。

#### C-2. 給 `curriculum.json` 的出處修補建議（本次稽核發現）

> **只是建議，本次稽核未修改任何遊戲檔案。** `curriculum.json` 有 10 條技巧引用了本檔判定為**無法一手驗證**的兩個頁面，建議改引下表右欄那些已驗證的官方連結（本檔對應條目內即為現行可用網址）。

| 課程技巧 | 目前引用的失效頁面 | 建議改引（本檔條目內的已驗證官方連結） |
|---|---|---|
| `clarity-02`、`clarity-03`、`clarity-04`、`positive-01`、`format-02`、`fewshot-05` | OpenAI Help Center《Best practices for prompt engineering with the OpenAI API》（**HTTP 403**，見條目 [#11](#e11)） | 依序 [#13](#e13)／[#15](#e15)／[#37](#e37)＋[#28](#e28)／[#14](#e14)／[#39](#e39)／[#45](#e45) |
| `structure-01`、`role-04`、`agentic-01`、`iterate-04`、`iterate-05` | xAI《Grok Code Prompt Engineering》`docs.x.ai/docs/guides/grok-code-prompt-engineering`（**HTTP 404 整頁下架**） | 依序 [#27](#e27)＋[#25](#e25)／（**找不到**，見 C-1）／[#155](#e155)／（**找不到**，見 C-1）／[#209](#e209) |

---

<a id="audit"></a>

## 稽核紀錄（Audit log）

### Part 3 完整性稽核 — 2026-08-01

> **稽核目標**（依專案負責人設定的標準）：「我要很完整的清單，每一個技巧都有出處跟使用方式，找不到的就寫找不到，確保每個技巧都有整理出來。」
> 本次為**對抗式稽核**：不採信本檔既有的自述數字，全部以程式重新計算並與原始 promptbook、官方網站逐一比對。

#### 一、查了什麼

| # | 檢查項目 | 方法 | 結果 |
|---|---|---|---|
| 1 | 條目編號 #1–#292 是否各出現**恰好一次**、無跳號、無重號、無越界 | 逐行解析 17 章的 `### N.` 標題 | ✅ 292 / 292，0 跳號、0 重號 |
| 2 | 每個條目是否都有**非空的「使用方式」與「出處」** | 逐條抽出欄位並量長度 | ✅ 292 / 292 皆有，0 條過短或空白 |
| 3 | 「出處」是否**全為 https**、且指向**官方網域**（不得指向 `docs/promptbooks/` 檔案本身） | 抽出全部 URL 比對網域白名單 | ✅ 0 個 http、0 個指向 promptbook 檔案；「出處」欄共 257 個相異 URL、落在 20 個網域，全部為廠商官方文件站，或其官方 GitHub repo／Hugging Face 模型卡（\`github.com/deepseek-ai\`、\`github.com/meta-llama\`、\`github.com/anthropics\`、\`huggingface.co/Qwen\`、\`huggingface.co/mistralai\`）。少數 arXiv 連結只出現在「適用/注意」的延伸閱讀，未被當成出處 |
| 4 | 九份 promptbook 的 **493 個來源編號**是否各在追溯表出現**恰好一次** | 比對 `T-A01`–`T-A107`／`T-O01`–`T-O142`／`G-01`–`G-86`／`X-01`–`X-40`／`Q-01`–`Q-22`／`D-01`–`D-14`／`MI-01`–`MI-25`／`L-01`–`L-22`／`CO-01`–`CO-15`／`MS-01`–`MS-20` | ✅ 493 / 493，0 遺漏、0 重複、0 越界 |
| 5 | 追溯表 A／A-2 的**目標條目是否都存在**、且**正查與反查是否完全一致** | 由 A／A-2 反推一份反查表，與附錄 B 逐格比對 | ✅ 0 個無效目標、292 / 292 條目都有反查列、**0 處正反不一致** |
| 6 | **是否只是「紙上對應」**：每個來源編號落到的條目，是否真的引用了**該廠自己的官方網域** | 對 493 條映射逐一檢查目標條目的出處欄 | ✅ **0 個例外** —— 493 條映射全部落在有引用該廠官方網域的條目上 |
| 7 | **深度抽查**：隨機抽 25 個來源編號，打開 promptbook 原文小節，確認條目**真的教到那個技巧**（而非只是掛名） | 分層隨機抽樣（10 家各至少 1 條）：`CO-01`、`CO-02`、`CO-15`、`D-02`、`D-05`、`G-05`、`G-40`、`L-09`、`MI-05`、`MS-18`、`Q-01`、`Q-11`、`T-A12`、`T-A31`、`T-A38`、`T-A44`、`T-A70`、`T-A84`、`T-O141`、`T-O23`、`T-O31`、`T-O49`、`T-O56`、`X-09`、`X-37` | ✅ **25 / 25 為實質涵蓋**，0 條掛名式對應。原文引文（含中／英文）在對應條目內逐句可對上；跨廠合併的條目（如 `CO-01`→#37、`MS-18`→#37）也各自保留了該廠的差異點 |
| 8 | 統計表與去重表的數字是否**與實際相符** | 全部重算 | ✅ 全數相符：Part 1 375 來源 / 112 併入、Part 2 118 來源 / 44 開新條目 / 73 併入 / 1 找不到、總計 493 / 292 條目 / 201 併入；去重表 6 家 2、5 家 2、4 家 9、3 家 14、2 家 54、單一 211（含 #11）亦相符 |
| 9 | **官方連結實測**：抽 32 個出處 URL（跨 13 個網域）實際發 HTTP 請求 | `curl -L`，逐一記錄狀態碼 | ⚠️ 30 / 32 回 200；2 個 `developer.meta.com` 回 **400**——經無頭 Chrome 實際渲染複查，**兩頁皆正常存在**，400 是該站對非 JS 客戶端的閘門，非死連結（已補進來源健康度表） |
| 10 | **遊戲課程涵蓋度**：`src/data/curriculum.json` 的 68 條技巧是否每條都對得到本檔條目 | 逐條依概念比對，並驗證引用的條目編號真實存在 | ✅ **68 / 68 全部對得到**（0 條未涵蓋）；其中 3 條為「部分涵蓋」，原因是課程引用的原始頁面已下架，詳見[附錄 C](#appC) |

#### 二、修了什麼

| 修正 | 內容 |
|---|---|
| **新增[目錄](#toc)** | 17 章 ＋ 各章條目範圍 ＋ 條數 ＋ 可點的跳轉錨點（含附錄與本節） |
| **新增[快速索引](#quickindex)** | 全部 292 條的「編號 / 技巧名 / 廠商數 / 所屬章」一覽表，編號與章號皆可跳轉 |
| **新增跳轉錨點** | 為 17 個章節（`#ch1`–`#ch17`）、292 個條目（`#e1`–`#e292`）與各附錄插入 HTML 錨點；**未更動任何標題文字** |
| **新增[附錄 C](#appC)** | `curriculum.json` 68 技巧 → 本檔條目的完整對照表，含「覆蓋：完整／部分」欄與 3 條部分涵蓋的逐條說明 |
| **新增附錄 C-2** | 給 `curriculum.json` 的出處修補建議：10 條課程技巧目前引用的兩個失效頁面（403 / 404），以及各自可改引的已驗證官方連結 |
| **補進[來源健康度](#sec2)表** | (a) `developer.meta.com` 全站對非 JS 客戶端回 HTTP 400 的行為，附無頭瀏覽器複查結果，避免日後被誤判成死連結；(b) xAI `models/grok-4.5` 經複查為純規格頁、不含課程宣稱的兩項內容 |

> **本次稽核未修改任何遊戲程式碼、測試或 `CLAUDE.md`**，也未改動既有 292 個條目的「使用方式」「出處」「適用/注意」任何一個字——因為第 1–8 項檢查沒有發現需要修正的內容錯誤。

#### 三、還誠實剩下的限制

1. **沒有重新擷取官方原文**。本檔的內容正確性建立在 2026-07-30 那次 promptbook 擷取之上；本次只重驗**連結是否存活**（抽樣 32 個）與**對應是否成立**，沒有逐頁比對官方文件在 2026-07-30 之後是否又改版。廠商文件改動頻繁，建議每季重跑一次擷取。
2. **URL 實測是抽樣，不是全量**。257 個相異出處 URL 中實測了 32 個（12.5%），分層覆蓋 13 個網域。未實測的 225 個沿用擷取當時的狀態。
3. **深度抽查是 25 / 493（5.1%）**。第 6 項的「廠商網域一致性」是全量檢查（493 / 493），可以排除大範圍的掛名式對應；但「引文是否逐字精確」只在這 25 條上人工確認過。
4. **三條 xAI／OpenAI 宣稱永久標為「找不到」**。條目 [#11](#e11)（OpenAI 六大策略，HTTP 403）、以及附錄 C-1 的 `role-04`／`iterate-04`（xAI Grok Code 指南，HTTP 404）——這些內容在業界廣為流傳，但**沒有可驗證的一手官方出處**，本檔選擇不收錄而非照抄二手摘要。若日後官方復原該頁或改由他頁承接，應回頭補上。
5. **來源編號 `D-14`（DeepSeek Prompt Library）仍無對應條目**，因為該頁只有卡片標題、沒有可擷取的提示詞內文。狀態與 Part 2 相同，非本次新增問題。
6. **「一個技巧」的切分帶有判斷成分**。493 個來源編號合併成 292 個條目，哪些算「同一件事」是編者判斷；本檔的取捨標準（同一技巧一條、多個出處；真正不同才拆開）已在第三章開頭寫明，但不同的人切出來的條數會不一樣。
7. **附錄 C 的對應是「依概念」**，不是機械比對。多對一（如 `decompose-01`–`04` 全落在 #187）與一對多都存在，因此「68 條課程技巧」與「80 個相異條目」兩個數字不能互推。

<!-- PART3-AUDITED: 2026-08-01 -->

<!-- PART1-COMPLETE: big4 -->
<!-- PART2-COMPLETE: all9 -->

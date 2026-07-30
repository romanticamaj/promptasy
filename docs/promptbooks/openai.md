# OpenAI 官方 Prompt Engineering 教學總覽（Promptbook）

> **用途**：這份文件是 PromptArcade 用來稽核遊戲內容涵蓋度的**參考資料**，不是遊戲內容本身。
> 目標是把 OpenAI 官方文件裡「每一條不同的技巧／建議」逐條收錄，附上原文短引文與可點的出處連結。
> **原則**：不改寫、不臆造。不確定的地方一律直接引用原文。中文摘要僅為理解輔助，**官方說法以引文與連結為準**。

- **廠商（vendor）**：OpenAI
- **擷取日（capture date）**：2026-07-30
- **擷取方式**：WebFetch 逐頁擷取

---

## 一、來源文件清單（Source documents）

| # | 文件名稱 | 完整 URL | 最後更新日 |
|---|---|---|---|
| O1 | Prompt engineering（Platform API 指南） | https://developers.openai.com/api/docs/guides/prompt-engineering | 未標示，擷取日 2026-07-30 |
| O2 | Model guidance / latest model（GPT-5.6） | https://developers.openai.com/api/docs/guides/latest-model | 未標示，擷取日 2026-07-30 |
| O3 | Prompting guidance for GPT-5.6 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 | 未標示，擷取日 2026-07-30（相關公告日 2026-07-09） |
| O4 | Prompting（總覽頁） | https://developers.openai.com/api/docs/guides/prompting | 未標示，擷取日 2026-07-30 |
| O5 | Reasoning（推理模型指南） | https://developers.openai.com/api/docs/guides/reasoning | 未標示，擷取日 2026-07-30 |
| O6 | Reasoning best practices（o 系列） | https://developers.openai.com/api/docs/guides/reasoning-best-practices | 未標示，擷取日 2026-07-30 |
| O7 | Function calling | https://developers.openai.com/api/docs/guides/function-calling | 未標示，擷取日 2026-07-30 |
| O8 | Structured Outputs | https://developers.openai.com/api/docs/guides/structured-outputs | 未標示，擷取日 2026-07-30 |
| O9 | Prompt caching | https://developers.openai.com/api/docs/guides/prompt-caching | 未標示，擷取日 2026-07-30 |
| O10 | Cookbook：GPT-5 prompting guide | https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide | 文件內未標示（外部資料指出原始發佈 2025-08-07） |
| O11 | Cookbook：GPT-5.2 prompting guide | https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide | 未標示，擷取日 2026-07-30 |
| O12 | Cookbook：GPT-4.1 prompting guide | https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide | 未標示，擷取日 2026-07-30 |
| O13 | Cookbook：o3 / o4-mini function calling guide | https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide | 文件 FAQ 中提及「May 2025」 |

### 擷取失敗與注意事項（誠實揭露）

1. **❌ 擷取失敗：Help Center「Best practices for prompt engineering with the OpenAI API」**
   URL：https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api
   狀態：**HTTP 403 Forbidden，嘗試 3 次皆失敗**（help.openai.com 擋 WebFetch）。
   → 這是 `curriculum.json` 目前引用的來源之一。**本文件無法涵蓋它的內容**，需要人工用瀏覽器補。
   （網路搜尋結果顯示該系列有「六大策略」框架：write clear instructions / provide reference text / split complex tasks into simpler subtasks / give the model time to think / use external tools / test changes systematically。**但這是搜尋摘要而非官方頁面原文，未經驗證，不應直接當成官方引文使用。**）
2. **⚠️ URL 遷移**：`cookbook.openai.com/...` 全數 308 導向 `developers.openai.com/cookbook/...`；`platform.openai.com/docs/...` 亦導向 `developers.openai.com/api/docs/...`。`curriculum.json` 內的 OpenAI 連結多數仍可用（會被導向），但建議更新為新網域。
3. **⚠️ O12（GPT-4.1 guide）** 的正確路徑是 `.../cookbook/examples/gpt4-1_prompting_guide`（沒有點）；`gpt-4.1_prompting_guide`（有點）回 404。`curriculum.json` 目前用的是正確的無點版本。
4. **⚠️ O6（Reasoning best practices）** 擷取到的內容仍以 o3 / o4-mini / GPT-4.1 為例，看起來是**較舊、未隨 GPT-5.x 更新的頁面**。最新的推理指引請以 O5 與 O3 為準。
5. 官方頁面**未標示 last-updated 日期**，故一律記為「未標示，擷取日 2026-07-30」。

### 本文件收錄的技巧總數

- O1 Platform 指南：**16 條**
- O2/O3 GPT-5.6 專屬指引：**21 條**
- O5/O6 推理模型：**14 條**
- O7 Function calling：**11 條**
- O8 Structured Outputs：**8 條**
- O9 Prompt caching：**4 條**
- O10 GPT-5 cookbook：**18 條**
- O11 GPT-5.2 cookbook：**11 條**
- O12 GPT-4.1 cookbook：**20 條**
- O13 o 系列 function calling：**16 條**
- **合計 139 條**

---

## 二、O1：Platform「Prompt engineering」指南

> 頁面章節順序（原文標題）：Prompt engineering → Choosing a model → Prompt engineering → Message roles and instruction following → Version prompts in code → Message formatting with Markdown and XML → Few-shot learning → Include relevant context information → Prompting current GPT-5 series models → Prompting reasoning models → Next steps → Other resources

#### T-O01 什麼是 prompt engineering（定義）
- **中文摘要**：官方定義：撰寫有效指令的過程，讓模型能**穩定地**產出符合需求的內容。由於輸出是非決定性的，這件事「一半是藝術、一半是科學」。
- **原文引文**：
  > "Prompt engineering is the process of writing effective instructions for a model, such that it consistently generates content that meets requirements."
  > "Because the content generated from a model is non-deterministic, prompting to get your desired output is a mix of art and science."
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering
- **適用**：全部模型

#### T-O02 選模型：reasoning model vs GPT model
- **原文引文**：
  > "Reasoning models generate an internal chain of thought to analyze the input prompt, and excel at understanding complex tasks."
  > "When in doubt, `gpt-5.6` offers a strong default for general-purpose text generation."
- **中文摘要**：推理模型會產生內部思考鏈，擅長複雜任務與多步驟規劃，但較慢較貴；GPT 模型快、省、聰明，但需要更明確的指令。大模型理解廣度好，小模型速度／成本好。
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#choosing-a-model
- **適用**：全部

#### T-O03 生產環境要 pin model snapshot 並建立測試套件
- **中文摘要**：把生產應用釘在特定 model snapshot；建立測試與評估套件，在換版／升級模型時監控 prompt 行為。
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering
- **適用**：全部

#### T-O04 ⭐ Message roles：developer / user / assistant 的指令階層（chain of command）
- **中文摘要**：三種角色形成權限階層：`developer` 訊息是應用開發者的指令，**優先於** `user` 訊息；`user` 訊息是終端使用者的指令，優先度**低於** developer；`assistant` 是模型產生的訊息。`instructions` 參數的優先度高於 `input` 內容。官方比喻：developer / user 訊息就像程式語言的「函式定義」與「傳入引數」。
- **原文引文**：
  > "`developer` messages are instructions provided by the application developer, prioritized ahead of `user` messages."
  > "You could think about `developer` and `user` messages like a function and its arguments in a programming language."
- **重要限制**：`instructions` 只作用於當次請求，**不會沿用到後續對話回合**。
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#message-roles-and-instruction-following
- **延伸**：OpenAI Model Spec 的 chain of command：https://model-spec.openai.com/2025-02-12.html#chain_of_command
- **適用**：全部模型

#### T-O05 ⚠️ Version prompts in code（可重用 prompt 物件已被淘汰）
- **中文摘要**：**OpenAI 正在淘汰 API 上的可重用 prompt 物件**——2026-06-03 起弱化 prompt 建立，`v1/prompts` 端點預計 **2026-11-30 關閉**。改成把生產 prompt 存在應用程式碼裡：把 prompt builder 放在靠近功能的小模組、動態值用有型別的函式參數或 schema、改動前先加 fixture 與 eval、用 feature flag 或分階段發布。
- **原文引文**：
  > "Store production prompts in your application code instead of creating reusable prompt objects."
  > "OpenAI is deprecating reusable prompt objects in the API. Prompt creation will be de-emphasized beginning June 3, 2026."
  > "The `v1/prompts` endpoint is scheduled to shut down on November 30, 2026."
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#version-prompts-in-code
- **遷移指南**：https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object
- **適用**：全部

#### T-O06 ⭐ Developer message 的四段標準結構：Identity → Instructions → Examples → Context
- **中文摘要**：官方建議 developer 訊息的典型排序：
  1. **Identity**：助手的用途、溝通風格、目標
  2. **Instructions**：產生回應的規則、該做與不該做
  3. **Examples**：輸入／輸出範例
  4. **Context**：訓練資料外的額外資料、專有資料——**動態脈絡放在 prompt 尾端附近**
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#message-formatting-with-markdown-and-xml
- **適用**：全部模型
- **💡 這是一個非常適合做成「prompt 積木／組裝」關卡的官方結構。**

#### T-O07 用 Markdown 標題與清單標示區塊與層級
- **原文引文**：
  > "Markdown headers and lists can be helpful to mark distinct sections of a prompt, and to communicate hierarchy."
- **出處**：同 T-O06
- **適用**：全部模型

#### T-O08 用 XML 標籤界定內容邊界、用 XML 屬性帶 metadata
- **原文引文**：
  > "XML tags can help delineate where one piece of content begins and ends. XML attributes can also define metadata."
- **中文摘要**：XML 屬性可定義關於內容的中繼資料，且**可以在指令中被引用**（例如「只看 `type="policy"` 的那幾份」）。
- **出處**：同 T-O06
- **適用**：全部模型

#### T-O09 把常重複使用的內容放在 prompt 開頭（配合 prompt caching）
- **原文引文**：
  > "Place reusable content at the beginning of your prompt and among the first API parameters" 以取得 "cost and latency savings."
- **出處**：同 T-O06；詳見 T-O60 以下 prompt caching 章節
- **適用**：全部模型

#### T-O10 Few-shot learning（在 prompt 內放輸入／輸出範例）
- **原文引文**：
  > "Few-shot learning lets you steer a large language model toward a new task by including input/output examples in the prompt."
  > "When providing examples, try to show a diverse range of possible inputs with the desired outputs."
- **中文摘要**：不需 fine-tune，只要在 prompt 裡放幾組輸入／輸出範例，模型會隱含地學到規律並套用到新輸入。範例通常放在 `developer` 訊息裡。**要涵蓋多樣的可能輸入。**
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#few-shot-learning
- **適用**：全部模型

#### T-O11 RAG：加入相關脈絡資訊
- **原文引文**：
  > "The technique of adding additional relevant context is sometimes called retrieval-augmented generation (RAG)."
  > "Models can only handle so much data within the context they consider during a generation request."
- **中文摘要**：把訓練資料以外的專有／特化資料加進 prompt，可以把回應**限縮在你認定最有幫助的資源上**。做法包含查向量資料庫後把檢索文字放進 prompt，或用 OpenAI 內建的 file search 工具。要注意 context window 上限（依模型從 10 萬到 100 萬 tokens 不等）。
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#include-relevant-context-information
- **適用**：全部模型

#### T-O12 GPT 系列 coding 任務的 prompt 要點
- **中文摘要**：明確定義 agent 角色與職責（把模型框成軟體工程 agent）、清楚說明工具用法、指定何時**不要**用某些模式（例如非必要不要用互動式執行）、要求用單元測試或 Python 指令驗證改動、**謹慎驗證 patch**（像 `apply_patch` 這種工具可能回傳成功但其實失敗）、給具體的指令呼叫範例、要求乾淨且語義正確的 Markdown（檔案路徑／函式／類別用反引號）。
- **原文引文**：
  > "Instruct the model to test changes with unit tests or Python commands, and validate patches carefully."
  > "Include concrete examples of how to invoke commands with the provided functions, which improves reliability."
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#prompting-current-gpt-5-series-models
- **適用**：GPT-5 系列

#### T-O13 前端工程：指定框架／函式庫與六個面向
- **中文摘要**：官方推薦的函式庫——樣式：Tailwind CSS、shadcn/ui、Radix Themes；圖示：Lucide、Material Symbols、Heroicons；動畫：Motion。從零開始的網頁 app 可一個 prompt 生成，且「以簡單為目標、避免 Next.js / React 這類外部依賴」。要整合進大型既有 codebase，prompt 應涵蓋六件事：Principles（視覺品質標準、模組化可重用元件、設計一致性）、UI/UX（字體、顏色、間距版面、互動狀態、無障礙）、Structure（檔案／資料夾配置）、Components（可重用 wrapper 範例、與後端呼叫分離的策略）、Pages（常見版面的樣板）、Agent Instructions（確認設計假設、搭鷹架、強制標準、串 API、測試狀態、寫文件）。
- **原文引文**：
  > "GPT-5.6 performs well at building front ends from scratch as well as contributing to large, established codebases."
  > "Aim for simplicity while fully achieving the goal, and avoid external dependencies such as Next.js or React."
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O14 Agentic 任務三要點：規劃、preamble、TODO 追蹤
- **中文摘要**：(1) 徹底規劃——把 query 拆成所有必要子請求、每次工具呼叫後反思、確認全部完成才結束回合；(2) 在重要步驟前給清楚的 preamble（說明為什麼呼叫這個工具）；(3) 用 TODO 清單工具或 rubric 強制結構化規劃，避免漏步驟。
- **原文引文**：
  > "Remember, you are an agent - please keep going until the user's query is completely resolved."
  > "Before you call a tool explain why you are calling it"
- **出處**：同上
- **適用**：GPT-5 系列 agentic

#### T-O15 ⭐ 推理模型 vs GPT 模型：資深同事 vs 新進同事
- **中文摘要**：這是 OpenAI 最核心的模型別 prompt 原則。推理模型給**高層次的目標**就能做好，GPT 模型需要**明確的指令**。
- **原文引文**：
  > "A reasoning model is like a senior co-worker. You can give them a goal to achieve and trust them."
  > "A GPT model is like a junior coworker. They'll perform best with explicit instructions."
  > "reasoning models will provide better results on tasks with only high-level guidance."
- **出處**：https://developers.openai.com/api/docs/guides/prompt-engineering#prompting-reasoning-models
- **適用**：全部
- **💡 這是一條非常適合做成關卡的核心對比。**

#### T-O16 O4 總覽頁的四條 prompt 精修實務
- **中文摘要**：`Prompting` 總覽頁另給了四條實務：
  1. **分離關注點**：「Put overall tone or role guidance in the system message; keep task-specific details and examples in user messages」
  2. **整理範例**：「Combine few-shot examples into a concise YAML-style or bulleted block」
  3. **結構化文件**：「Mirror your project structure with clear folder names」
  4. **早驗證**：「Run your prompt tests and evaluation cases every time you publish」
- **出處**：https://developers.openai.com/api/docs/guides/prompting
- **適用**：全部
- **注意**：此頁**不含**舊版的「六大策略」框架；六大策略在 Help Center 文章（本次擷取失敗）。

---

## 三、O2 / O3：GPT-5.6 專屬 prompting 指引（最新）

> 適用模型：**gpt-5.6-sol（旗艦）、gpt-5.6-terra、gpt-5.6-luna**
> O3 章節順序：Simplify prompts first → Outcome-first prompts and stopping conditions → Personality, collaboration, and response length → Define autonomy and approval boundaries → Tool routing → Programmatic Tool Calling → Grounding, citations, and retrieval budgets → Long-running workflows and state → Reasoning effort → Frontend and visual tasks → Check work before finishing → Suggested prompt structure → Prompt migration workflow
> O2 章節順序：Introduction → What is new → Safeguards → Migration quickstart → Prompting best practices → Favor leaner prompts → Define autonomy and approval boundaries → Set response length and style → Set a default with `text.verbosity` → Specify what a short answer must include → Define the tone → Pro mode → … → Programmatic Tool Calling → …

#### T-O17 ⭐⭐ Favor leaner prompts（更精簡的 prompt 表現更好）
- **中文摘要**：**這是 GPT-5.6 最核心的轉向。** 拿掉重複的指令與範例、簡化工具描述，可以**提升**任務表現。官方內部測試：精簡化的 prompt 讓評測分數提升 **10–15%**，同時 token 減少 **41–66%**。
- **原文引文**：
  > "Removing repeated instructions and examples and simplifying tool descriptions can improve task performance."
- **出處**：https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices ／ https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6 系列
- **⚠️ 這與「prompt 寫得越詳細越好」的傳統教學相反，是必須收進遊戲的重大更新。**

#### T-O18 從能用的 prompt 出發，一次移除一組指令並跑 eval
- **原文引文**：
  > "Start with a prompt and tool set that already works. Remove one group of instructions."
- **出處**：同上
- **適用**：GPT-5.6

#### T-O19 State each instruction once（每條指令只講一次）
- **原文引文**：
  > "State each instruction once."
- **出處**：同上
- **適用**：GPT-5.6

#### T-O20 只暴露相關的工具，描述要簡潔精確
- **原文引文**：
  > "Expose only tools relevant to the task, and keep their descriptions concise and precise."
- **出處**：同上
- **適用**：GPT-5.6
- **⚠️ 注意**：這與 Anthropic 的「工具描述要極其詳細、至少 3–4 句」（T-A95）**方向相反**，是很好的「廠家差異」教學素材。

#### T-O21 保留「編碼了產品需求」或「修正了實測落差」的範例
- **原文引文**：
  > "Keep examples and style guidance when they encode a product requirement or correct a measured gap."
- **中文摘要**：精簡不是無差別刪除。範例與風格指引若代表真正的產品需求，或用來修正實測出來的落差，就要留著。
- **出處**：同上
- **適用**：GPT-5.6

#### T-O22 長 session 要監控 context 成長
- **原文引文**：
  > "Track context both at the start of a run as the conversation grows."
- **中文摘要**：重複的 prompt 與工具內容會隨對話回合累積，放大 token 用量。
- **出處**：同上
- **適用**：GPT-5.6

#### T-O23 ⭐⭐ Outcome-first prompts and stopping conditions（描述終點，不規定路徑）
- **中文摘要**：GPT-5.6 最強的用法是：**定義目標結果、成功標準、限制與可用脈絡，然後讓模型自己選路徑**。同時要定義停止條件。
- **原文引文**：
  > "Describe the destination rather than prescribing every step."
- **官方範例 prompt**：
  ```
  Resolve the customer's issue end to end.

  Success means:
  - make the eligibility decision from available policy and account evidence
  - complete any allowed action before responding
  - return completed_actions, customer_message, and blockers
  - if required evidence is missing, ask for the smallest missing field
  ```
- **出處**：https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6 系列
- **💡 「成功標準清單 ＋ 停止條件」是非常適合做成關卡的結構。**

#### T-O24 ⭐ Define autonomy and approval boundaries（定義授權邊界）
- **中文摘要**：定義每一種請求授權到什麼程度，模型才能在不必要地停下來問人的情況下持續安全、在範圍內的工作。官方強調「**簡短的政策通常就夠了**」，並且要**明確列舉安全的本地動作**。
- **原文引文**：
  > "Define what level of action each request authorizes so the model can continue safe, in-scope work."
  > "A compact policy is usually sufficient."
  > "Name safe local actions explicitly, such as reading files, inspecting logs, editing in-scope code."
- **官方範例 prompt**：
  ```
  For requests to answer, explain, review, diagnose, or plan, inspect the relevant
  materials and report the result. Do not implement changes unless the request also
  asks for them.

  For requests to change, build, or fix, make the requested in-scope local changes
  and run relevant non-destructive validation without asking first.

  Require confirmation for external writes, destructive actions, purchases, or a
  material expansion of scope.
  ```
- **出處**：同上
- **適用**：GPT-5.6 系列

#### T-O25 ⚠️ 不要重複「先問過我」這類許可語句
- **原文引文**：
  > "Repeating instructions such as 'ask first,' 'do not mutate,' or 'wait for approval' can cause unnecessary approval requests."
- **出處**：同上
- **適用**：GPT-5.6

#### T-O26 ⚠️ 遷移時重新檢視「Be concise」這類籠統的簡潔指令
- **原文引文**：
  > "Check whether broad brevity instructions such as 'Be concise' are still useful."
- **中文摘要**：GPT-5.6 本身就更簡潔，籠統的簡潔指令可能適得其反。
- **出處**：https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
- **適用**：GPT-5.6

#### T-O27 用 `text.verbosity` 設定預設詳細度，prompt 只管任務專屬需求
- **原文引文**：
  > "Use `text.verbosity` to set the default level of detail for a request."
- **出處**：同上
- **適用**：GPT-5.6

#### T-O28 ⭐ 要求簡短時，明講「什麼必須保留」
- **中文摘要**：要短，就要指定哪些資訊必須保留、哪些可以省略——這比單純說「短一點」有效得多。
- **原文引文**：
  > "Identify the information the model must preserve and the detail it can omit."
- **官方範例 prompt**：
  ```
  Lead with the conclusion. Include the evidence needed to support it, any material
  caveat, and the next action. Omit secondary detail and repetition.

  Keep all required facts, decisions, caveats, and next steps. Trim introductions,
  repetition, generic reassurance, and optional background first.
  ```
- **出處**：同上
- **適用**：GPT-5.6
- **💡 「保留清單 vs 刪除清單」是很好的關卡題材。**

#### T-O29 Define the tone（用具體寫作選擇定義語氣，不要用模糊標籤）
- **原文引文**：
  > "Describe the writing choices that define your product's tone, such as how directly to state the answer."
  > "Personality controls tone, warmth, directness, formality, humor, empathy, and polish."
- **官方範例 prompt**：
  ```
  State the answer directly. If the user reports a problem, acknowledge the
  specific issue before giving the next step. Use reassurance only when it is
  relevant. Omit generic praise and unnecessary sign-offs.
  ```
- **出處**：https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6

#### T-O30 Tool routing（工具描述要說清楚四件事）
- **原文引文**：
  > "Expose only task-relevant tools. Tool descriptions should state what the tool does."
- **中文摘要**：工具描述要說明：做什麼、何時使用、關鍵回傳欄位、錯誤處理。另有一段防止跳過前置步驟的 prompt。
- **官方範例 prompt**：
  ```
  Before taking an action, resolve required discovery, retrieval, and
  validation steps. Do not skip a prerequisite because the intended final
  state seems obvious.
  ```
- **出處**：同上
- **適用**：GPT-5.6

#### T-O31 Programmatic Tool Calling（PTC）：什麼時候該用、什麼時候不該用
- **中文摘要**：PTC 讓模型用 JavaScript 在託管執行環境裡編排工具。適合**有界的工作流**：過濾、join、排序、聚合、批次、把大量中間輸出縮成精簡 schema。**不適合**單次呼叫，或需要語義判斷的地方。要注意 `program_output` 與最終 assistant `message` 是**兩個獨立輸出**，兩邊都要測。
- **原文引文**：
  > "Programmatic Tool Calling works best for bounded workflows where code can process several tool results."
  > "The `program_output` item and final assistant `message` are separate outputs."
- **官方範例 prompt**：
  ```
  <tool_orchestration>
  Use Programmatic Tool Calling for [bounded stage] using only [eligible tools].
  Run independent calls concurrently when safe. Use only documented tool input
  and output fields.

  Process and reduce the intermediate results, then emit exactly [output schema],
  including the evidence needed for the final answer.

  Stop when [condition] is met. Retry transient failures at most [R] times.
  Do not repeat completed calls or perform side-effecting actions. If a required
  result is still missing, return a clear structured failure.

  Use direct tool calls for [semantic judgment, approval, or final validation].
  </tool_orchestration>
  ```
- **出處**：https://developers.openai.com/api/docs/guides/latest-model ／ https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6 系列

#### T-O32 ⭐ Grounding, citations, and retrieval budgets（引用行為與檢索預算要寫進 prompt）
- **中文摘要**：定義什麼需要證據支撐、什麼算足夠證據、資訊缺失時怎麼辦；**只引用真的檢索到的來源，推論要另外標示**。並且要給檢索預算——什麼情況才值得再搜一次。
- **原文引文**：
  > "For grounded answers, citation behavior should be part of the prompt."
- **官方範例 prompt**：
  ```
  For ordinary Q&A, start with one broad search using short, discriminative
  keywords. If the top results contain enough support for the core request,
  answer from those results.

  Make another retrieval call only when a required fact, owner, date, ID, or
  source is missing; the user asked for exhaustive coverage or comparison; a
  specific artifact must be read; or an important claim would otherwise be
  unsupported.

  Do not search again only to improve phrasing, add examples, or support
  nonessential detail.
  ```
- **出處**：https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6 系列
- **💡 「檢索預算」是一條很新的技巧，遊戲很可能沒有。**

#### T-O33 Long-running workflows and state（進度更新的節奏）
- **中文摘要**：多步驟任務在第一次工具呼叫**之前**送一段一到兩句、使用者看得到的更新，說明第一步要做什麼；執行中只在**重大階段變更**或**發現改變了計畫**時才更新。**不要叫模型旁白每一次例行的工具呼叫。**
- **原文引文**：
  > "Do not ask the model to narrate routine tool calls."
- **官方範例 prompt**：
  ```
  Before tool calls for a multi-step task, send a one- or two-sentence
  user-visible update that states the first step. During the task, update only
  when a major phase begins or a finding changes the plan.
  ```
- **出處**：同上
- **適用**：GPT-5.6 系列

#### T-O34 Reasoning effort：先建立 baseline 再動它
- **原文引文**：
  > "Establish a baseline with the current reasoning effort before changing it."
  > "Treat `reasoning.effort` as a tuning knob, not the primary way to recover quality."
- **中文摘要**：測試「維持原設定」與「降一級」；latency 敏感用 low、medium 為平衡預設、high/xhigh 只在 eval 證明有提升時才用。
- **出處**：https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 ／ https://developers.openai.com/api/docs/guides/reasoning
- **適用**：GPT-5.6 系列

#### T-O35 Frontend and visual tasks（保留既有設計系統）
- **中文摘要**：增量前端改動時，要求模型檢視並**保留既有的 design token、元件與樣式**；不要加額外功能或裝飾性 UI；保留 responsive 行為與預期狀態；**定案前先 render 並檢視結果**。大型／密集／座標敏感的影像要用原始解析度。
- **原文引文**：
  > "GPT-5.6 has stronger layout, visual hierarchy, and design judgment."
- **官方範例 prompt**：
  ```
  For incremental frontend changes:
  - inspect and preserve existing design tokens, components, and patterns;
  - do not add extra features or decorative UI unless requested;
  - preserve responsive behavior and expected states;
  - render and inspect the result before finalizing.
  ```
- **出處**：https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6
- **適用**：GPT-5.6 系列

#### T-O36 ⭐ Check work before finishing（給驗證工具，並指定驗證什麼）
- **中文摘要**：光說「檢查一下」沒用——要**給模型能驗證輸出的工具**，並指定哪一種驗證重要。程式碼跑針對性測試，視覺任務先 render 再檢視。**驗證跑不動時要說明原因並提出次佳檢查方式。**
- **原文引文**：
  > "Give GPT-5.6 access to tools that can validate the output."
- **官方範例 prompt**：
  ```
  After making changes, run the most relevant validation available:
  - targeted tests for changed behavior
  - type checks or lint checks when applicable
  - build checks for affected packages
  - a minimal smoke test when full validation is too expensive

  If validation cannot be run, explain why and describe the next best check.
  ```
- **出處**：同上
- **適用**：GPT-5.6 系列

#### T-O37 ⭐⭐ Suggested prompt structure（官方推薦的八段 prompt 結構）
- **中文摘要**：複雜 prompt 的起手結構。
- **原文引文**：
  > "Use this structure as a starting point for complex prompts."
- **官方模板**：
  ```
  Role: [the model's function and context]

  Personality: [tone and collaboration style]

  Goal: [user-visible outcome]

  Success criteria: [what must be true before the final answer]

  Constraints: [policy, safety, business, evidence, and side-effect limits]

  Tools: [which tools to use, when, and what not to use]

  Output: [sections, length, format, and tone]

  Stop rules: [when to retry, fallback, abstain, ask, or stop]
  ```
- **出處**：同上
- **適用**：GPT-5.6 系列
- **💡 這是 OpenAI 目前最新的「prompt 積木」官方版本，強烈建議取代遊戲裡舊的 builder 結構或並列呈現。**

#### T-O38 ⭐ Prompt migration workflow（五步遷移流程，不要整包重寫）
- **原文引文**：
  > "Do not rewrite a working prompt stack all at once."
- **官方流程**：
  ```
  1. Switch the model and preserve the current reasoning effort.
  2. Run representative evals before changing the prompt.
  3. Remove obsolete scaffolding, repeated instructions, and irrelevant tools.
  4. Add only the smallest targeted instruction that fixes a measured regression.
  5. Re-run evals after each prompt or reasoning change.
  ```
- **出處**：同上
- **適用**：GPT-5.6 系列

#### T-O39 Pro mode（何時值得用）
- **原文引文**：
  > "Use pro mode when a marginal quality improvement materially affects the outcome."
  > "Compare standard and pro modes on the same representative tasks."
- **官方 pro mode 請求範例**：
  ```
  Review this database migration plan for failure modes that could cause data loss
  or extended downtime. For each finding, cite the relevant step, estimate impact
  and likelihood, and recommend a specific mitigation. Return the five most
  important risks in severity order.
  ```
- **出處**：https://developers.openai.com/api/docs/guides/latest-model
- **適用**：GPT-5.6 系列

#### T-O40 Safeguards（即時濫用分類器可能中斷生成）
- **原文引文**：
  > 系統在生成過程中套用 "real-time cyber and biology misuse classifiers"，可能擋下請求或造成審查造成的延遲暫停。
- **出處**：https://developers.openai.com/api/docs/guides/latest-model#safeguards
- **適用**：GPT-5.6 系列

---

## 四、O5 / O6：推理模型（Reasoning models）

#### T-O41 `reasoning.effort` 的七個等級與用法
- **原文引文**：
  > "Lower effort favors speed and lower token usage, while at higher effort the model thinks more completely to provide higher quality responses."
- **等級（原文摘要）**：`none`（「Latency-critical tasks that do not benefit from any reasoning」）、`minimal`、`low`（「Efficient reasoning with a modest latency increase」）、`medium`（多數工作的預設，「a well-balanced point on the pareto curve」）、`high`（「Hard reasoning, complex debugging, deep planning」）、`xhigh`、`max`（複雜非同步流程、需要最大智慧時）。
- **出處**：https://developers.openai.com/api/docs/guides/reasoning
- **適用**：推理模型

#### T-O42 ⭐ 給任務、限制、輸出格式——不要規定每一個中間步驟
- **原文引文**：
  > "Give the model the task, constraints, and desired output format" without "prescribing every intermediate step."
  > "define what counts as done and how the model should verify its work."
- **出處**：https://developers.openai.com/api/docs/guides/reasoning
- **適用**：推理模型

#### T-O43 為推理 tokens 保留 context 空間
- **原文引文**：
  > "OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when you start experimenting."
- **中文摘要**：要監控 `max_output_tokens` 造成的不完整回應——避免在推理階段（而非可見輸出階段）就把 token 用完。
- **出處**：同上
- **適用**：推理模型

#### T-O44 Reasoning summaries 要主動開啟
- **原文引文**：
  > 用 `summary: "auto"` 取得推理摘要；該輸出 "will not be included unless you explicitly opt in."
- **出處**：同上
- **適用**：推理模型

#### T-O45 ⭐ Keep it simple（推理模型偏好簡短清楚的指令）
- **原文引文**：
  > "The models excel at understanding and responding to brief, clear instructions."
- **出處**：https://developers.openai.com/api/docs/guides/reasoning-best-practices
- **適用**：o 系列推理模型

#### T-O46 ⭐⭐ Avoid chain-of-thought（不要叫推理模型「一步一步想」）
- **中文摘要**：推理模型已在內部推理，額外的 CoT 提示是多餘的。
- **原文引文**：
  > "Avoid chain-of-thought: Unnecessary since these models reason internally"
- **出處**：同上
- **適用**：o 系列推理模型
- **⚠️ 這與 GPT 系列的建議相反，是重要的廠家／模型別差異。**

#### T-O47 Use delimiters（用 Markdown、XML 標籤、章節標題釐清輸入結構）
- **原文引文**：
  > "Use delimiters: Markdown, XML tags, and section titles clarify input structure"
- **出處**：同上
- **適用**：o 系列推理模型

#### T-O48 Zero-shot first（先試不給範例，再考慮 few-shot）
- **原文引文**：
  > "Zero-shot first: Try without examples before adding few-shot demonstrations"
- **出處**：同上
- **適用**：o 系列推理模型
- **⚠️ 與 GPT 系列「多給範例」的建議方向不同。**

#### T-O49 Be specific（提供明確的限制與成功標準）
- **原文引文**：
  > "Be specific: Provide explicit constraints and success criteria"
- **出處**：同上
- **適用**：o 系列推理模型

#### T-O50 用 developer message 取代 system message
- **原文引文**：
  > "Starting with `o1-2024-12-17`, use developer messages instead of system messages"
- **出處**：同上
- **適用**：`o1-2024-12-17` 起

#### T-O51 「Formatting re-enabled」（重新開啟 markdown）
- **原文引文**：
  > As of `o1-2024-12-17`, include "Formatting re-enabled" on first line to enable markdown
- **出處**：同上
- **適用**：`o1-2024-12-17` 起

#### T-O52 用 Responses API + `store=true` 重用推理脈絡以省 token
- **原文引文**：
  > For `o3` and `o4-mini`, use the Responses API with `store=true` to include relevant reasoning items from previous requests.
  > "Chat Completions API doesn't include reasoning context, potentially increasing token usage for complex agentic workflows."
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O53 何時選 GPT、何時選推理模型
- **中文摘要**：GPT 模型——速度與成本優先、任務定義明確；o 系列——準確與可靠性最重要、問題複雜多步驟。**多數工作流是兩者混用：o 系列規劃、GPT 執行。**
- **原文引文**：
  > "One model family isn't better than the other—they're just different."
- **出處**：同上
- **適用**：全部

#### T-O54 推理模型的七類成功用例
- **中文摘要（原文列舉）**：(1) 模糊任務（能理解有限資訊並釐清缺口）、(2) 資訊萃取（從大量資料中找出相關細節）、(3) 複雜文件分析（跨數百頁找關聯）、(4) Agentic 規劃（編排多步驟解法）、(5) 視覺推理（處理困難的圖表／影像）、(6) Code review（跨多檔案偵測細微改動）、(7) 模型評估（細膩的判斷任務；官方舉例「F1 score went from 0.12 with 4o to 0.74 with o1」）。
- **出處**：同上
- **適用**：推理模型選型

---

## 五、O7：Function calling（工具／函式定義最佳實務）

> 章節：Best practices for defining functions（官方明列 8 條）＋ Tool choice ＋ Strict mode ＋ Parallel calls

#### T-O55 ⭐ 清楚且詳細的函式文件
- **原文引文**：
  > "Write clear and detailed function names, parameter descriptions, and instructions"
  > "Explicitly describe the purpose of the function and each parameter (and its format), and what the output represents."
- **出處**：https://developers.openai.com/api/docs/guides/function-calling
- **適用**：全部

#### T-O56 用 system prompt 說明「何時該用、何時不該用」每個函式
- **原文引文**：
  > "Use the system prompt to describe when (and when not) to use each function. Generally, tell the model _exactly_ what to do."
- **出處**：同上
- **適用**：全部

#### T-O57 附上範例與邊界案例（特別針對反覆出現的失敗）
- **原文引文**：
  > "Include examples and edge cases, especially to rectify any recurring failures."
- **出處**：同上
- **適用**：全部

#### T-O58 deferred tools：詳細指引放函式描述，namespace 描述保持精簡
- **原文引文**：
  > "Put detailed guidance in the function description and keep the namespace description concise."
- **出處**：同上
- **適用**：使用 deferred / tool search 時

#### T-O59 ⭐ 套用軟體工程原則：最小驚訝原則、用 enum 讓非法狀態無法表示
- **原文引文**：
  > "Make the functions obvious and intuitive"（principle of least surprise）
  > "Use enums and object structure to make invalid states unrepresentable."
- **出處**：同上
- **適用**：全部

#### T-O60 ⭐ The intern test（實習生測試）
- **中文摘要**：一個非常好用的自我檢查：「一個實習生／人類，只拿到你給模型的東西，能不能正確使用這個函式？」
- **原文引文**：
  > "Can an intern/human correctly use the function given nothing but what you gave the model?"
- **出處**：同上
- **適用**：全部
- **💡 與 Anthropic 的「Golden rule」（給同事看得懂嗎）是同一個思路的不同版本，很適合做成跨廠家對照。**

#### T-O61 Offload to code（能用程式算的就不要叫模型填）
- **原文引文**：
  > "Don't make the model fill arguments you already know"
  > "Combine functions that are always called in sequence."
- **出處**：同上
- **適用**：全部

#### T-O62 ⭐ 起手可用函式數量 < 20
- **原文引文**：
  > "Aim for fewer than 20 functions available at the start of a turn"
  > "Use tool search to defer large or infrequently used parts of your tool surface."
- **出處**：同上
- **適用**：全部

#### T-O63 `tool_choice` 四種模式
- **中文摘要**：預設由模型決定；可用 `tool_choice` 強制成 Auto / Required / Forced Function / Allowed tools。
- **出處**：同上
- **適用**：全部

#### T-O64 Strict mode（建議永遠開啟）
- **原文引文**：
  > "We recommend always enabling strict mode"
- **中文摘要**：需要 `additionalProperties: false` 且所有欄位標為 `required`。
- **出處**：同上
- **適用**：全部

#### T-O65 平行呼叫可關閉
- **原文引文**：
  > 設 `parallel_tool_calls: false` 以確保 "exactly zero or one tool is called."
- **出處**：同上
- **適用**：全部

---

## 六、O8：Structured Outputs

#### T-O66 Structured Outputs 是什麼、帶來什麼
- **原文引文**：
  > 提供 "reliable type-safety"、"explicit refusals"、"simpler prompting"，不需為格式問題做驗證或重試。
- **出處**：https://developers.openai.com/api/docs/guides/structured-outputs
- **適用**：GPT-4o 起；新專案建議從 `gpt-5.6` 開始

#### T-O67 Structured Outputs vs Function calling（怎麼選）
- **原文引文**：
  > 需要 "connecting the model to tools, functions, data, etc." 時用 function calling；
  > 「想在模型回覆使用者時結構化其輸出」時用 `text.format` 的 Structured Outputs。
- **出處**：同上
- **適用**：全部

#### T-O68 ⭐ Structured Outputs vs JSON mode
- **原文引文**：
  > Structured Outputs "ensure schema adherence" while JSON mode only ensures valid JSON.
  > "We recommend always using Structured Outputs instead of JSON mode when possible."
- **中文摘要**：JSON mode 需要在 prompt 裡明確要求輸出 JSON，否則可能產生「無止盡的空白字元串流」。
- **出處**：同上
- **適用**：全部

#### T-O69 Schema 硬性要求
- **中文摘要（原文重點）**：所有欄位都必須 `required`（要做選填就用與 `null` 的 union）；物件必須永遠設 `additionalProperties: false`；根層必須是 object 不能是 `anyOf`；上限：5000 個 property、10 層巢狀、所有 property 合計 1000 個 enum 值。
- **出處**：同上
- **適用**：全部

#### T-O70 不支援的 schema 功能
- **中文摘要**：不支援 `allOf`、`not`、`dependentRequired`、`if/then/else`。fine-tuned 模型另外不支援字串的 `minLength`/`maxLength`/`pattern`/`format`、數值限制、`patternProperties`、陣列的 `minItems`/`maxItems`。
- **出處**：同上
- **適用**：全部

#### T-O71 處理 refusal（拒絕不會照你的 schema 走）
- **原文引文**：
  > "the API response will include a new field called `refusal`"
- **中文摘要**：因為拒絕不一定符合你的 schema，要檢查回應內容中的 `type: "refusal"`。也要處理不完整回應與內容過濾。
- **出處**：同上
- **適用**：全部

#### T-O72 Structured Outputs 的四條 best practices
- **原文引文**：
  > "Name keys clearly and intuitively"
  > 為重要的鍵使用 "clear titles and descriptions for important keys"
  > "Create and use evals to determine the structure that works best"
  > 用原生 SDK 支援（Pydantic / Zod）避免 "JSON schema divergence"
- **出處**：同上
- **適用**：全部

#### T-O73 在 prompt 裡處理「輸入無法符合 schema」的情況
- **中文摘要**：官方建議在 prompt 指令中涵蓋「輸入無法對應到 schema 時該怎麼辦」。
- **出處**：同上
- **適用**：全部

---

## 七、O9：Prompt caching（prompt 結構會影響成本與延遲）

#### T-O74 ⭐ 靜態內容放前面、變動內容放後面
- **原文引文**：
  > "Place static content like instructions and examples at the beginning of your prompt, and put variable content, such as user-specific information, at the end."
- **出處**：https://developers.openai.com/api/docs/guides/prompt-caching
- **適用**：全部
- **⚠️ 注意**：這與 Anthropic「長文件放最上面、問題放最後」（T-A06）方向一致，但理由不同（Anthropic 是為了回應品質，OpenAI 這裡是為了 cache 命中）。兩者都指向「**問題放最後**」。

#### T-O75 Cache 只在「完全相同的前綴」上命中
- **原文引文**：
  > "Cache hits are only possible for exact prefix matches within a prompt."
- **出處**：同上
- **適用**：全部

#### T-O76 最低 1,024 tokens 才可能被快取
- **中文摘要**：低於此門檻的 prompt 無法被快取。
- **出處**：同上
- **適用**：全部

#### T-O77 圖片與工具必須在請求間完全相同
- **原文引文**：
  > "Images and tools, which must be identical between requests"
- **中文摘要**：圖片的 `detail` 參數也必須完全一致。另外 GPT-5.6+ 可用 `prompt_cache_key` 提高命中率，建議「Keep the total traffic across all prefixes for each key to approximately 15 requests per minute.」
- **出處**：同上
- **適用**：全部

---

## 八、O10：Cookbook — GPT-5 prompting guide

> 章節順序：Agentic workflow predictability → Controlling agentic eagerness → Prompting for less eagerness → Prompting for more eagerness → Tool preambles → Reasoning effort → Reusing reasoning context with the Responses API → Maximizing coding performance → Frontend app development → Zero-to-one app generation → Matching codebase design standards → Collaborative coding in production (Cursor) → System prompt and parameter tuning → Optimizing intelligence and instruction-following → Steering → Verbosity → Instruction following → Minimal reasoning → Markdown formatting → Metaprompting → Appendix

#### T-O78 ⭐ Controlling agentic eagerness（代理積極度是一條連續光譜）
- **原文引文**：
  > "GPT-5 is trained to operate anywhere along this spectrum, from making high-level decisions under ambiguous circumstances."
- **出處**：https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- **適用**：GPT-5 系列

#### T-O79 降低積極度：`<context_gathering>` 區塊 ＋ 降 reasoning_effort
- **原文引文**：
  > "Switch to a lower reasoning_effort to reduce exploration depth but improve efficiency and latency."
- **官方 prompt 片段**：
  ```
  <context_gathering>
  Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.
  ...
  </context_gathering>
  ```
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O80 ⭐ 提高積極度：`<persistence>` 區塊
- **原文引文**：
  > "Never stop or hand back to the user when you encounter uncertainty — research or deduce."
- **官方 prompt 片段**：
  ```
  <persistence>
  - You are an agent - please keep going until user's query is completely resolved.
  - Only terminate when sure problem is solved.
  </persistence>
  ```
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O81 ⭐ Tool preambles（工具前導訊息）
- **原文引文**：
  > "GPT-5 is trained to provide clear upfront plans and consistent progress updates via 'tool preamble' messages."
- **官方 prompt 片段**：
  ```
  <tool_preambles>
  - Always begin by rephrasing the user's goal in a friendly, clear manner.
  - Then outline a structured plan detailing each logical step.
  </tool_preambles>
  ```
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O82 Reasoning effort（複雜多步驟任務用更高 effort）
- **原文引文**：
  > "For complex, multi-step tasks, we recommend higher reasoning to ensure best possible outputs."
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O83 用 Responses API 重用推理脈絡
- **原文引文**：
  > "This allows the model to refer to previous reasoning traces, conserving CoT tokens and eliminating reconstruction."
- **出處**：同上
- **適用**：GPT-5 系列 agentic

#### T-O84 前端框架建議
- **原文引文**：
  > "Frameworks: Next.js (TypeScript), React, HTML; Styling: Tailwind CSS, shadcn/ui, Radix Themes."
- **出處**：同上
- **適用**：GPT-5 系列前端任務

#### T-O85 ⭐⭐ Zero-to-one app generation：`<self_reflection>` 自建評分表
- **中文摘要**：讓模型**先自己建立一份 5–7 類的評分 rubric（只給自己用）**，再依 rubric 反覆自我檢視產出，可大幅提升 one-shot 應用品質。
- **原文引文**：
  > "Think deeply about every aspect making a world-class one-shot web app—use that to create a rubric."
- **官方 prompt 片段**：
  ```
  <self_reflection>
  - First spend time thinking of a rubric until confident.
  - Create a rubric with 5-7 categories. This is for your purposes only.
  </self_reflection>
  ```
- **出處**：同上
- **適用**：GPT-5 系列
- **💡 「自建評分表再自評」是一條很有教學價值的高階技巧。**

#### T-O86 `<code_editing_rules>`：讓產出符合既有 codebase 標準
- **原文引文**：
  > "Model-written code should adhere to existing style and design standards and blend in neatly to codebase."
  > "- Clarity and Reuse: Every component should be modular and reusable. / - Consistency: UI must adhere to consistent design system."
- **出處**：同上
- **適用**：GPT-5 系列 coding

#### T-O87 Verbosity：全域參數 ＋ 自然語言區域覆寫（Cursor 案例）
- **原文引文**：
  > "Set low verbosity globally, then specify high verbosity only for coding tools."
  > "Write code for clarity first. Use high verbosity for writing code and code tools."
  > "While API verbosity parameter is default, GPT-5 is trained to respond to natural-language verbosity overrides."
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O88 把過強的探索語氣調弱（Cursor 案例）
- **原文引文**：
  > "Refined prompt removed maximize_ prefix and softened language around thoroughness for better tool decisions."
  > "Bias towards not asking user for help if you can find answer yourself."
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O89 主動提出改動而非先問許可（Cursor 案例）
- **原文引文**：
  > "Propose changes proactively for user to approve/reject rather than asking whether to proceed with plan."
  > "Code edits can be quite proactive as user can always reject them. Code should be easy to review."
- **出處**：同上
- **適用**：GPT-5 系列互動式編碼產品

#### T-O90 ⭐⭐ 找出並解決 prompt 中互相矛盾的指令
- **中文摘要**：矛盾的指令會讓模型花掉推理 token 去想辦法調和衝突。官方舉的例子是醫療客服 prompt 中「一律先查病歷」與「緊急狀況立刻給 911 指引」互相矛盾——解法是明確補上例外：「Do not do lookup in emergency case, proceed immediately to providing 911 guidance.」
- **原文引文**：
  > "Contradictory instructions cause model to expend reasoning tokens searching for ways to reconcile conflicts."
- **出處**：同上
- **適用**：GPT-5 系列
- **💡 「指令衝突偵測」是一條很好的高階關卡題材。**

#### T-O91 用 prompt optimizer 工具找出模糊與矛盾
- **原文引文**：
  > "We recommend testing your prompts in our prompt optimizer tool to help identify these types of issues."
- **出處**：同上
- **適用**：全部

#### T-O92 Minimal reasoning（延遲敏感任務）
- **原文引文**：
  > "Minimal reasoning performance can vary more drastically depending on prompt than higher reasoning levels."
  > "Prompting patterns similar to GPT-4.1 work best. Include brief explanation of thought process."
  > "Requesting thorough tool-calling preambles continually updating user on progress improves minimal reasoning performance."
- **中文摘要**：minimal reasoning 下要更用力 prompt：要求簡短說明思路、要求詳盡的工具 preamble、明確要求「呼叫函式前廣泛規劃、對前次呼叫結果反思」、把 query 拆成所有必要子請求並逐一確認完成。
- **出處**：同上
- **適用**：GPT-5 minimal reasoning

#### T-O93 Markdown formatting（語義正確地使用，並週期性重申）
- **原文引文**：
  > "Use Markdown only where semantically correct (inline code, code fences, lists, tables)."
  > "Use backticks to format file, directory, function, and class names. Use \\( \\) for inline math."
  > "Append Markdown instruction every 3-5 user messages to maintain consistent adherence over long conversations."
- **出處**：同上
- **適用**：GPT-5 系列
- **💡 「長對話中要週期性重申格式指令」是一條很實用、遊戲可能沒有的技巧。**

#### T-O94 ⭐ Metaprompting（讓模型優化自己的 prompt）
- **原文引文**：
  > "Several users have deployed prompt revisions generated simply by asking GPT-5 what elements to add."
  > "What specific phrases could be added/deleted from prompt to consistently elicit desired behavior?"
- **出處**：同上
- **適用**：GPT-5 系列

#### T-O95 Coding agent prompt 的具體規範（官方 appendix 摘要）
- **中文摘要（原文要點彙整）**：
  - 用 `apply_patch`：「We highly recommend using apply_patch for file edits to match the training distribution.」
  - 終端指令效率：「Do not use ls -R, find, or grep—these are slow. Use rg and rg --files.」
  - 根因修復：「Fix the problem at root cause rather than applying surface-level patches when possible.」
  - 改動最小化：「Changes should be minimal and focused on task. Keep consistent with existing codebase style.」
  - pre-commit：「Do not fix pre-existing errors on lines you didn't touch if pre-commit catches them.」
  - 清理：「Check git status to sanity check changes; revert any scratch files or unintended modifications.」
  - 註解：「Remove all inline comments added—inline comments generally avoided unless misinterpretation risk is high.」
  - 授權標頭：「NEVER add copyright or license headers unless specifically requested.」
  - 完成說明：「For smaller tasks describe in brief bullet points; for complex tasks include high-level descriptions.」
  - 「Do NOT tell user to save file if already created or modified using apply_patch.」
- **出處**：同上
- **適用**：GPT-5 系列 coding agent

---

## 九、O11：Cookbook — GPT-5.2 prompting guide

> 章節：Introduction → Key behavioral differences → Prompting patterns → Compaction → Agentic steerability & user updates → Tool-calling and parallelism → Structured extraction, PDF, and Office workflows → Prompt Migration Guide → Web search and research → Conclusion → Appendix

#### T-O96 給具體的長度限制（分層 verbosity）
- **原文引文**：
  > "Give clear and concrete length constraints especially in enterprise and coding agents."
- **中文摘要**：官方範例把 verbosity 分層：預設 3–6 句；是非題 ≤2 句；複雜任務用結構化條列。
- **出處**：https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- **適用**：GPT-5.2

#### T-O97 ⭐ 防止 scope drift（`<design_and_scope_constraints>`）
- **原文引文**：
  > "Implement EXACTLY and ONLY what the user requests. No extra features, no added components."
- **中文摘要**：強調採用「最簡單的有效詮釋」，明確禁止額外功能與範圍外的設計裝飾。
- **出處**：同上
- **適用**：GPT-5.2

#### T-O98 ⭐ 長文處理（`<long_context_handling>`）：先做內部大綱，再把主張錨回章節
- **原文引文**：
  > "First, produce a short internal outline of the key sections relevant to the user's request."
- **中文摘要**：輸入超過約 10k tokens 時，要求模型先做內部大綱，並把每個主張重新錨定到具體文件章節、驗證引文。
- **出處**：同上
- **適用**：GPT-5.2；長文任務

#### T-O99 ⭐ 模糊與幻覺緩解（`<uncertainty_and_ambiguity>` ＋ `<high_risk_self_check>`）
- **原文引文**：
  > "If the question is ambiguous or underspecified, explicitly call this out and ask up to 1–3 clarifying questions."
- **中文摘要**：處理不完整規格時，要模型**明確指出模糊之處**，提出帶有標示假設的多種詮釋，或要求澄清（最多 1–3 個問題）。
- **出處**：同上
- **適用**：GPT-5.2

#### T-O100 Compaction（`/responses/compact` 延伸有效脈絡）
- **原文引文**：
  > "Compaction performs a loss-aware compression pass over prior conversation state, reducing token footprint."
- **出處**：同上
- **適用**：GPT-5.2 多步驟代理流程

#### T-O101 Agentic 更新規格（`<user_updates_spec>`）
- **原文引文**：
  > "Send brief updates (1–2 sentences) only when you start a new major phase or discover plan-changing information."
- **出處**：同上
- **適用**：GPT-5.2

#### T-O102 Tool-calling 規則（`<tool_usage_rules>`）
- **原文引文**：
  > "Prefer tools over internal knowledge whenever you need fresh or user-specific data."
- **中文摘要**：工具描述要精準；獨立操作鼓勵平行化；高影響改動要求驗證步驟與重述。
- **出處**：同上
- **適用**：GPT-5.2

#### T-O103 ⭐ 結構化萃取（`<extraction_spec>`）：缺欄位設 null 而非猜測
- **原文引文**：
  > "Always follow this schema exactly (no extra fields); if a field is not present, set to null rather than guessing."
- **中文摘要**：提供明確 JSON schema 或輸出形狀，區分必填／選填欄位，回傳前再掃一次做完整性檢查。
- **出處**：同上
- **適用**：GPT-5.2；萃取／PDF／Office 工作流

#### T-O104 ⭐ Migration：先換模型、先不動 prompt
- **原文引文**：
  > "Switch models, don't change prompts yet. Keep the prompt functionally identical so you're testing model change."
- **中文摘要**：先換模型、釘住 `reasoning_effort`、跑 eval，再增量調整。
- **出處**：同上
- **適用**：GPT-5.2

#### T-O105 Web search & citation 規則（`<web_search_rules>`）
- **原文引文**：
  > "Prefer web research over assumptions whenever facts may be uncertain; include citations for all web-derived information."
- **中文摘要**：先講清楚研究深度、要求涵蓋而不要反問澄清、所有網路來源的主張都要附引用、優先近期來源。
- **出處**：同上
- **適用**：GPT-5.2

#### T-O106 ⭐ 研究的停止條件（邊際價值遞減）
- **原文引文**：
  > "Keep iterating until additional searching is unlikely to materially change the answer or add meaningful detail."
- **中文摘要**：多來源反覆研究直到邊際價值下降；查證主張、解決矛盾、補上高價值的相鄰材料。
- **出處**：同上
- **適用**：GPT-5.2

---

## 十、O12：Cookbook — GPT-4.1 prompting guide

> 章節順序：Agentic Workflows → Long context → Chain of Thought → Instruction Following → General Advice → Appendix: Generating and Applying File Diffs
> 官方量化結果（原文）：agentic harness 在 SWE-bench Verified 達 55% pass rate（非推理模型 SOTA）；**三條提醒讓表現提升約 20%**；prompt 誘發的規劃提升 4%；API 解析的工具定義比手動注入 schema 好 2%。

#### T-O107 ⭐⭐ 三條 agentic 提醒（官方稱提升約 20%）
- **1. Persistence（持續）**
  > "You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user."
- **2. Tool-calling（用工具，不要猜）**
  > "If you are not sure about file content or codebase structure, use your tools to read files and gather the relevant information: do NOT guess or make up an answer."
- **3. Planning（規劃與反思）**
  > "You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls."
- **出處**：https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- **適用**：GPT-4.1（模式亦被 GPT-5 minimal reasoning 沿用）
- **💡 這三條是 OpenAI 最經典、最可教的 agentic prompt 積木。**

#### T-O108 用 API 原生的 tools 欄位，不要把 schema 手動塞進 prompt
- **原文引文**：
  > "Use API-parsed tool descriptions versus manually injecting schemas for 2% pass rate improvement."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O109 ⭐⭐ 長文：指令放**開頭與結尾各一次**
- **原文引文**：
  > "Place instructions at both beginning and end of provided context for better performance."
- **官方結構**：
  ```
  # Instructions
  [Your instructions here]

  # External Context
  [Long context material]

  # Final Instructions
  [Summary or critical reminders]
  ```
- **出處**：同上
- **適用**：GPT-4.1 長文任務
- **⚠️ 這與 Anthropic「問題放最後」（T-A06）不同——OpenAI 這裡建議**頭尾各放一次**。是很好的廠家差異素材。

#### T-O110 明確設定「只用提供的脈絡」或「可用內部知識」
- **原文引文**：
  > "Only use provided External Context to answer. If unknown, respond 'I don't have that information.'"
- **出處**：同上
- **適用**：GPT-4.1 RAG

#### T-O111 Chain of Thought（GPT-4.1 需要明講）
- **原文引文**：
  > "First, think carefully step by step about what documents are needed to answer the query. Then, print out the TITLE and ID of each document."
- **出處**：同上
- **適用**：GPT-4.1（非推理模型）
- **⚠️ 與 o 系列「不要用 CoT」（T-O46）相反。**

#### T-O112 ⭐ 三階段推理策略（Query Analysis → Context Analysis → Synthesis）
- **原文引文**：
  > "1. Query Analysis: Break down and analyze until confident about intent. / 2. Context Analysis: Carefully select documents, rating each [high/medium/low/none]. / 3. Synthesis: Summarize most relevant documents and why."
- **出處**：同上
- **適用**：GPT-4.1 長文／RAG

#### T-O113 ⭐ GPT-4.1 更「照字面」執行指令
- **原文引文**：
  > "GPT-4.1 follows instructions more literally than predecessors; be explicit about behavior."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O114 Response Rules 區塊放在最前面
- **原文引文**：
  > "Start with overall Response Rules or Instructions section with high-level guidance."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O115 ⭐ 指令衝突時，GPT-4.1 傾向遵循**靠近結尾**的那條
- **原文引文**：
  > "If conflicting instructions exist, GPT-4.1 tends to follow closer to end of prompt."
- **出處**：同上
- **適用**：GPT-4.1
- **💡 這是一條可直接做成關卡的「位置效應」知識。**

#### T-O116 規則要配上範例，且範例要與規則對得上
- **原文引文**：
  > "Add examples demonstrating desired behavior; ensure behaviors cited in rules match examples."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O117 ⭐ Markdown 分隔符建議
- **原文引文**：
  > "Use markdown titles for major sections and subsections, inline backticks for code precision."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O118 XML 分隔符適合複雜巢狀與 metadata
- **原文引文**：
  > "XML is convenient for precisely wrapping sections with metadata and enabling nesting."
- **官方片段**：
  ```xml
  <examples>
  <example1 type="Abbreviate">
  <input>San Francisco</input>
  <output>SF</output>
  </example1>
  </examples>
  ```
- **出處**：同上
- **適用**：GPT-4.1

#### T-O119 ⭐⭐ 長文多文件格式：XML 與 pipe 分隔好，**JSON 特別差**
- **原文引文**：
  > "XML and pipe-delimited formats performed well; JSON performed particularly poorly."
- **官方兩種好格式**：
  ```
  <doc id='1' title='Title'>Content here</doc>

  ID: 1 | TITLE: Title | CONTENT: Content here
  ```
- **出處**：同上
- **適用**：GPT-4.1 長文多文件
- **💡 這是一條很反直覺、很有教學價值的實測結論。**

#### T-O120 ⭐ 不要用全大寫／賄賂／急迫語氣
- **原文引文**：
  > "Not necessary to use all-caps or bribes; start without, use only if necessary."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O121 ⭐ 「一律呼叫工具」會造成幻覺——要補上資訊充足性檢查
- **原文引文**：
  > "If lacking info to call tool, ask user for needed information; prevents hallucination."
- **官方片段**：
  ```
  - Always call a tool before answering factual questions
  - However, if insufficient information to properly call tool, ask user for details needed
  ```
- **出處**：同上
- **適用**：GPT-4.1
- **💡 「規則的例外條款」是一條很好的進階關卡。**

#### T-O122 提供的樣板句要求變化，避免逐字重複
- **原文引文**：
  > "Never repeat sample phrase in same conversation; vary to avoid sounding repetitive."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O123 工具呼叫前後都要對使用者說話
- **原文引文**：
  > "Always message user before and after calling tool to keep them in loop."
- **出處**：同上
- **適用**：GPT-4.1

#### T-O124 引用格式規範
- **原文引文**：
  > "Include citations immediately after relevant statements: [NAME](ID) for single, multiple sources separated by commas."
- **出處**：同上
- **適用**：GPT-4.1 RAG

#### T-O125 ⭐⭐ 官方推薦的 prompt 結構模板
- **官方模板**：
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
- **出處**：同上
- **適用**：GPT-4.1
- **💡 可與 GPT-5.6 的八段結構（T-O37）並列，展示官方 prompt 結構的演進。**

#### T-O126 八步問題解決工作流
- **原文引文**：
  > "Understand deeply, investigate, plan, implement incrementally, debug, test frequently, iterate, validate."
- **出處**：同上
- **適用**：GPT-4.1 coding agent

---

## 十一、O13：Cookbook — o3 / o4-mini function calling guide

> 章節：Introduction → Prompt guidance for better function calling performance → Responses API → Agentic Experience with Hosted tools → FAQ

#### T-O127 Role prompting（用 developer message 設定基礎行為）
- **原文引文**：
  > "role prompting is helpful in setting the base behavior, tone and outlining the set of actions"
- **官方片段**：`You are an AI retail agent. As a retail agent, you can help users cancel or modify pending orders, return or exchange delivered orders…`
- **出處**：https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide
- **適用**：o3 / o4-mini

#### T-O128 ⭐ 明確規定工具呼叫的**順序**
- **原文引文**：
  > "explicitly outline the orders to accomplish certain tasks… check to see if directories exist"
- **官方片段**：
  ```
  To Process a refund for a delivered order, follow the following steps:
  1. Confirm the order was delivered. Use: `order_status_check`
  2. Check the refund eligibility policy. Use: `refund_policy_check`
  3. Create the refund request. Use: `refund_create`
  4. Notify the user of refund status. Use: `user_notify`
  ```
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O129 ⭐ 明確定義「該用工具」與「不該用工具」的情境
- **原文引文**：
  > "helpful to clarify the model boundaries on when and when not to invoke certain tools"
- **官方片段**：
  ```
  - Use tools when:
    - The user wants to cancel or modify an order.
    ...
  - Do not use tools when:
    - The user asks a general question like "What's your return policy?"
    - The user asks something outside your retail role (e.g., "Write a poem").
  ```
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O130 把使用準則寫進 function description 本身
- **原文引文**：
  > "function description should clarify when it should be invoked and how its arguments should be constructed"
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O131 ⭐ 在 function description 裡放 few-shot 範例
- **原文引文**：
  > "few shot prompting can improve tool calling performance, especially when the model struggles to construct arguments"
- **中文摘要**：官方 ripgrep 範例用一張「字面 → regex pattern」對照表教模型跳脫特殊字元。
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O132 ⭐ 關鍵規則放在描述**最前面**
- **原文引文**：
  > "instruction to escape a special character is relatively the first thing the model reads"
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O133 ⭐ 明確禁止「承諾稍後呼叫」的幻覺
- **原文引文**：
  > "Do NOT promise to call a function later. If a function call is required, emit it now; otherwise respond normally."
- **出處**：同上
- **適用**：o3 / o4-mini
- **💡 這是一條很具體、很好做成關卡的反幻覺技巧。**

#### T-O134 Strict mode 確保參數符合 schema
- **原文引文**：
  > "setting `strict` to `true` will ensure function calls reliably adhere to the function schema"
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O135 格式驗證指令
- **原文引文**：
  > "Validate arguments against the format before sending the call; if you are unsure, ask for clarification instead of guessing."
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O136 換主題就開新對話（避免懶惰行為）
- **原文引文**：
  > "begin a fresh conversation thread rather than continuing in the same context"
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O137 ⭐ Context pruning：把過期工具呼叫移除，改放精簡摘要
- **原文引文**：
  > "remove them from the context. Instead, provide a concise summary of the important information"
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O138 ⭐⭐ 不要在工具呼叫前誘發額外推理
- **原文引文**：
  > "a developer should not try to induce additional reasoning before each function call"
- **中文摘要**：推理模型的內部推理已足夠，額外的 CoT 提示會**降低**表現。
- **出處**：同上
- **適用**：o3 / o4-mini
- **⚠️ 與 GPT-4.1 的「Planning 提醒」（T-O107-3）**直接相反**——這是絕佳的模型別差異教材。

#### T-O139 用 Responses API 保存推理項目
- **原文引文**：
  > "Persisting these reasoning items between tool calls during inference will therefore lead to higher intelligence"
  > `include=["reasoning.encrypted_content"]`
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O140 ⭐ 混用 hosted tools 與自訂函式時，明確指定偏好順序與 fallback
- **原文引文**：
  > "instruct the model which tool is preferred and when. This reduces ambiguity, improves accuracy"
  > "When both could be used, prefer `calculate_shipping_cost` for accuracy and policy compliance. Fall back to `python` only if the custom tool is unavailable or fails."
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O141 明確要求「寧可用工具也不要自己算」
- **原文引文**：
  > "You have access to a `code_interpreter`. Always prefer using `code_interpreter` when a user asks a question involving: math problems, data analysis, generating or executing code, formatting or transforming structured text. Avoid doing these directly in your own response."
- **出處**：同上
- **適用**：o3 / o4-mini

#### T-O142 工具描述要不重疊、schema 要扁平
- **原文引文**：
  > "If multiple tools have overlapping purposes or vague descriptions, models may call the wrong one"
  > "deeply layered argument trees can impact performance or reliability… flatter schemas, argument fields are top-level"
  > "Use the structured tools parameter when possible. If you must define tools in free text, treat it as custom protocol"
- **中文摘要**：另有 MCP 相關建議——用 `allowed_tools` 只載入必要工具以縮小 payload；回傳 `mcp_list_tools` 或帶 `previous_response_id` 避免重複匯入工具以降低延遲。
- **出處**：同上
- **適用**：o3 / o4-mini

---

## 十二、給 PromptArcade 的稽核備註（不是官方內容）

以下是本次擷取中發現、**與遊戲現有 68 條技巧可能有落差**的重點（僅為快速印象，正式 gap analysis 另做）：

1. **重大方向轉變（GPT-5.6）**：**「精簡 prompt 反而更好」（T-O17，內部測試 +10–15% 分數、−41–66% tokens）與「outcome-first、描述終點不規定步驟」（T-O23）** 直接挑戰了「prompt 越詳細越好」的傳統教學。這是本次擷取最重要的發現。
2. **官方 prompt 結構已更新兩代**：GPT-4.1 的七段結構（T-O125）→ GPT-5.6 的八段結構（Role / Personality / Goal / Success criteria / Constraints / Tools / Output / Stop rules，T-O37）。遊戲的 builder 積木應該對照更新。
3. **強烈的模型別矛盾（絕佳教材）**：
   - GPT-4.1「要規劃、要 CoT」（T-O107-3、T-O111）vs o 系列「不要誘發額外推理、不要 CoT」（T-O138、T-O46）
   - GPT-4.1「指令頭尾各放一次」（T-O109）vs Anthropic「長資料在前、問題在後」（T-A06）
   - OpenAI GPT-5.6「工具描述要簡潔」（T-O20）vs Anthropic「工具描述要極其詳細、至少 3–4 句」（T-A95）
   - GPT-5.6「精簡 prompt」vs GPT-4.1「三條提醒 +20%」
4. **全新技巧（遊戲很可能未涵蓋）**：檢索預算與引用行為（T-O32）、停止條件 / stop rules（T-O23、T-O37）、授權與許可邊界（T-O24）、`<self_reflection>` 自建 rubric（T-O85）、指令衝突偵測（T-O90）、metaprompting（T-O94）、長文件格式 JSON 特別差（T-O119）、長對話中週期性重申格式指令（T-O93）、intern test（T-O60）、起手工具數 <20（T-O62）、缺欄位設 null 而非猜測（T-O103）、研究的邊際價值停止條件（T-O106）、不要承諾「稍後再呼叫工具」（T-O133）。
5. **已淘汰／需標註的內容**：可重用 prompt 物件（T-O05，2026-11-30 關閉）；`curriculum.json` 內的 `platform.openai.com` 與 `cookbook.openai.com` 連結應更新到 `developers.openai.com`。
6. **❌ 未能涵蓋**：Help Center 的「六大策略」文章（403，見上方失敗說明）。這是 curriculum 現有引用來源之一，需人工補齊。

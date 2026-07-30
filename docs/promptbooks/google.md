# Google 官方 Prompt Engineering 教學總覽（Promptbook）

> **用途**：這份文件是 PromptArcade 用來稽核遊戲內容涵蓋度的**參考資料**，不是遊戲內容本身。
> 目標是把 Google 官方文件裡「每一條不同的技巧／建議」逐條收錄，附上原文短引文與可點的出處連結。
> **原則**：不改寫、不臆造。不確定的地方一律直接引用原文。中文摘要僅為理解輔助，**官方說法以引文與連結為準**。

- **廠商（vendor）**：Google（Gemini API / Gemini Enterprise Agent Platform「Vertex」/ Gemini for Workspace）
- **擷取日（capture date）**：2026-07-30
- **擷取方式**：直接抓取官方 HTML 原始頁面並轉為純文字（非二手轉述），逐頁核對
- **文件結構**：完全依照 Google 自己的文件架構分節（Gemini API Docs → Gemini 3.x 模型指南 → 思考／長脈絡 → 多模態 → 影像／影片生成 → 工具 → 安全 → Vertex/Gemini Enterprise 提示設計 → Workspace）

---

## 0. 來源清單（Source list）

### 0.1 Gemini API（ai.google.dev）

| # | 文件 | URL | 頁面標示的 last updated |
|---|---|---|---|
| G1 | Prompt design strategies（主提示工程指南） | https://ai.google.dev/gemini-api/docs/prompting-strategies | 2026-06-10 UTC |
| G2 | What's new in Gemini 3.5 Flash（**現行**模型提示指引） | https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5 | 2026-07-30 UTC |
| G3 | Gemini 3 Developer Guide（**已標示 deprecated**，仍含 prompting best practices） | https://ai.google.dev/gemini-api/docs/gemini-3 | 2026-07-30 UTC |
| G4 | Gemini thinking | https://ai.google.dev/gemini-api/docs/thinking | 2026-07-30 UTC |
| G5 | Long context | https://ai.google.dev/gemini-api/docs/long-context | 2026-06-22 UTC |
| G6 | Files API ＋ File prompting strategies（多模態提示指南） | https://ai.google.dev/gemini-api/docs/files | 2026-07-30 UTC |
| G7 | Image understanding | https://ai.google.dev/gemini-api/docs/image-understanding | 2026-07-30 UTC |
| G8 | Video understanding | https://ai.google.dev/gemini-api/docs/video-understanding | 2026-07-30 UTC |
| G9 | Document (PDF) processing | https://ai.google.dev/gemini-api/docs/document-processing | 2026-07-30 UTC |
| G10 | Image generation（Nano Banana prompting guide） | https://ai.google.dev/gemini-api/docs/image-generation | 2026-07-30 UTC |
| G11 | Veo（video generation ＋ Veo prompt guide） | https://ai.google.dev/gemini-api/docs/veo | 2026-07-30 UTC |
| G12 | Function calling | https://ai.google.dev/gemini-api/docs/function-calling | 2026-07-30 UTC |
| G13 | Structured output | https://ai.google.dev/gemini-api/docs/structured-output | 2026-07-30 UTC |
| G14 | Grounding with Google Search | https://ai.google.dev/gemini-api/docs/google-search | 2026-07-30 UTC |
| G15 | Code execution | https://ai.google.dev/gemini-api/docs/code-execution | 2026-07-30 UTC |
| G16 | URL context | https://ai.google.dev/gemini-api/docs/url-context | 2026-07-30 UTC |
| G17 | Tool combination | https://ai.google.dev/gemini-api/docs/tool-combination | 2026-07-30 UTC |
| G18 | Computer Use | https://ai.google.dev/gemini-api/docs/computer-use | 2026-07-30 UTC |
| G19 | Deep Research | https://ai.google.dev/gemini-api/docs/deep-research | 2026-07-14 UTC |
| G20 | Context caching | https://ai.google.dev/gemini-api/docs/caching | 2026-07-30 UTC |
| G21 | Managed agents | https://ai.google.dev/gemini-api/docs/agents | 2026-07-30 UTC |
| G22 | Safety guidance | https://ai.google.dev/gemini-api/docs/safety-guidance | 2026-06-05 UTC |
| G23 | Text generation | https://ai.google.dev/gemini-api/docs/text-generation | 2026-07-30 UTC |
| G24 | Coding agents（Gemini Docs MCP／skills） | https://ai.google.dev/gemini-api/docs/coding-agents | 2026-07-08 UTC |
| G25 | Optimization（推論層級／批次／快取） | https://ai.google.dev/gemini-api/docs/optimization | 2026-04-28 UTC |
| G26 | File Search（RAG） | https://ai.google.dev/gemini-api/docs/file-search | 2026-07-30 UTC |
| G27 | Prompt gallery | https://ai.google.dev/gemini-api/prompts | 未標示，擷取日 2026-07-30 |

### 0.2 Gemini Enterprise Agent Platform（原 Vertex AI，docs.cloud.google.com）

全部 19 頁，last updated 均為 **2026-07-29 UTC**：

| # | 文件 | URL |
|---|---|---|
| V1 | Introduction to prompting | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/introduction-prompt-design |
| V2 | Overview of prompting strategies（含 **Prompt health checklist**） | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies |
| V3 | Give clear and specific instructions | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/clear-instructions |
| V4 | Include few-shot examples | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-examples |
| V5 | Add contextual information | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/contextual-information |
| V6 | Break down complex tasks into simpler prompts | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/break-down-prompts |
| V7 | Structure prompts | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/structure-prompts |
| V8 | System instructions（介紹與最佳實務） | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instruction-introduction |
| V9 | Use system instructions（用法與範例） | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions |
| V10 | Experiment with parameter values | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/adjust-parameter-values |
| V11 | Instruct the model to explain its reasoning | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/explain-reasoning |
| V12 | Prompt iteration strategies | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-iteration |
| V13 | Use prompt templates | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-templates |
| V14 | Compare prompts | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/compare-prompts |
| V15 | Use AI-powered prompt writing tools | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/ai-powered-prompt-writing |
| V16 | Optimize prompts（總覽） | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer |
| V17 | Zero-shot optimizer | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/zero-shot-optimizer |
| V18 | Few-shot optimizer | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-optimizer |
| V19 | Data-driven optimizer | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/data-driven-optimizer |

### 0.3 Gemini for Workspace

| # | 文件 | URL | last updated |
|---|---|---|---|
| W1 | Prompting guide 101（網頁版手冊） | https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/ | 未標示，擷取日 2026-07-30 |
| W2 | Prompting guide 101（PDF, 2nd edition / Oct 2024） | https://services.google.com/fh/files/misc/gemini_for_workspace_prompt_guide_october_2024_digital_final.pdf | 2024-10（檔名標示）；**PDF 內文未能抽取，見 §12.3 誠實說明** |
| W3 | Tips to write prompts for Gemini（Workspace 說明中心） | https://support.google.com/a/users/answer/14200040 | 未標示，擷取日 2026-07-30 |
| W4 | 5 tips for writing great prompts（Google Blog） | https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/ | 2024-07-29（文章日期） |

### 0.4 擷取失敗／已下架

- **無**（Google 側全部 200 OK）。唯一未完全取得內容者為 W2 PDF 的內文（檔案下載成功、4.2 MB，但本機無 `pdftotext` / `poppler`，PDF 文字流無法解析）。W1 為同一份手冊的官方網頁版，內容已完整取得，故不影響覆蓋率。

---

## 1. Gemini API — Prompt design strategies（G1，主指南）

> 全頁 deep link：https://ai.google.dev/gemini-api/docs/prompting-strategies

### G-01 提示設計是迭代的，指南只是起點

**中文摘要**：Google 在指南開頭就把「prompt engineering 是反覆試錯的過程」寫成前提；文件裡的範本只是起手式，必須依自己的用例實測、觀察模型回應後再修。

> "Prompt engineering is iterative. These guidelines and templates are starting points. Experiment and refine based on your specific use cases and observed model responses."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies

**適用**：所有 Gemini 模型、所有場景。

---

### G-02 給清楚且具體的指令（Clear and specific instructions）

**中文摘要**：客製模型行為最有效率的方式就是給明確指令；指令可以是一個問題、一串步驟，甚至複雜到描繪出使用者的體驗與心理狀態。

> "An effective and efficient way to customize model behavior is to provide it with clear and specific instructions. Instructions can be in the form of a question, step-by-step tasks, or as complex as mapping out a user's experience and mindset."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#clear-and-specific-instructions

**適用**：全部。

---

### G-03 四種輸入型態（Input types）

**中文摘要**：Google 把 prompt 的「輸入」分成四類：問題型（question）、任務型（task）、實體型（entity，對給定的東西做操作）、補完型（completion，給半截讓模型續寫）。這是 Google 特有的分類法。

> "Inputs can be a question that the model answers (question input), a task the model performs (task input), an entity the model operates on (entity input), or partial input that the model completes or continues (completion input)."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#input

官方 4 個示範 prompt（一字未改）：
- Question：`What's a good name for a flower shop that specializes in selling bouquets of dried flowers? Create a list of 5 options with just the names.`
- Task：`Give me a simple list of just the things that I must bring on a camping trip. The list should have 5 items.`
- Entity：`Classify the following items as [large, small]:` ＋ `Elephant / Mouse / Snail`
- Completion：見 G-04。

**適用**：全部。

---

### G-04 補完策略（Partial input completion）

**中文摘要**：生成式模型本質上是「進階自動補完」。與其用自然語言把格式規則講到死，不如**給一組範例並直接寫出回應的開頭**，讓模型照著補完。官方以「點餐轉 JSON」示範：純自然語言指令會輸出所有欄位（含沒點的），改成給一組 `Order/Output` 範例＋在最後留一個 `Output:` 開頭，模型就會自動略掉沒點的品項。

> "Generative language models work like an advanced auto completion tool. When you provide partial content, the model can provide the rest of the content or what it thinks is a continuation of that content as a response."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#completion

補充警語（官方）：
> "While you can specify the format of simple JSON response objects using prompts, we recommend using Gemini API's structured output feature when specifying a more complex JSON Schema for the response."

**適用**：需要精準輸出格式時；複雜 JSON 改用 Structured output（見 G-38）。

---

### G-05 限制（Constraints）

**中文摘要**：在 prompt 裡明確寫出「怎麼讀」與「怎麼生成」的限制，例如長度。官方範例：`Summarize this text in one sentence:`。

> "Specify any constraints on reading the prompt or generating a response. You can tell the model what to do and not to do."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#constraints

**適用**：全部。

---

### G-06 指定回應格式（Response format）

**中文摘要**：可以直接要求輸出成表格、條列、電梯簡報、關鍵字、單句或段落。官方也示範用 **system instruction** 控制詳盡程度。

> "You can give instructions that specify the format of the response. For example, you can ask for the response to be formatted as a table, bulleted list, elevator pitch, keywords, sentence, or paragraph."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#response-format

官方 system instruction 範例（一字未改）：
`All questions should be answered comprehensively with details, unless the user requests a concise response specifically.`

**適用**：全部。

---

### G-07 用補完策略控制格式（Format responses with the completion strategy）

**中文摘要**：模型沒被指定格式時會自己挑一種。想要特定格式，就**把輸出的開頭寫出來**讓它照著長。官方範例：`Create an outline for an essay about hummingbirds.` 後面接 `I. Introduction` 與 `*`，模型就會用 `*` 條列而不是 `A. B. C.`。

> "To get the model to return an outline in a specific format, you can add text that represents the start of the outline and let the model complete it based on the pattern that you initiated."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#format_responses_with_the_completion_strategy

**適用**：全部（尤其非 JSON 的排版控制）。

---

### G-08 Zero-shot vs few-shot：Google 明確建議「永遠放 few-shot 範例」

**中文摘要**：這是 Google 與其他家最不同的一條主張——**建議永遠在 prompt 裡放 few-shot 範例**，而且如果範例夠清楚，甚至可以把指令刪掉。

> "We recommend to always include few-shot examples in your prompts. Prompts without few-shot examples are likely to be less effective. In fact, you can remove instructions from your prompt if your examples are clear enough in showing the task at hand."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#few-shot

> "Few-shot prompts are often used to regulate the formatting, phrasing, scoping, or general patterning of model responses. Use specific and varied examples to help the model narrow its focus and generate more accurate results."

**適用**：全部。**注意**：與 G-30（Gemini 3.x「簡化 prompt」）並存時，官方在 3.x 頁面另有「避免為舊模型設計的冗長 prompt 工程」的說法，兩者要一起讀。

---

### G-09 範例數量要實測，太多會 overfit

**中文摘要**：Gemini 通常幾個範例就抓得到模式，但數量要自己試；放太多會讓模型過擬合到範例上。

> "At the same time, if you include too many examples, the model may start to overfit the response to the examples."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#number-examples

**適用**：全部。

---

### G-10 範例格式必須一致（Consistent formatting）

**中文摘要**：few-shot 的主要目的之一就是示範輸出格式，所以每個範例的結構與排版必須完全一致——**特別注意 XML 標籤、空白、換行、範例分隔符**。

> "it is essential to ensure a consistent format across all examples, especially paying attention to XML tags, white spaces, newlines, and example splitters."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#consistent-formatting

**適用**：全部。

---

### G-11 加入脈絡（Add context）

**中文摘要**：不要假設模型有它需要的全部資訊；把限制與細節寫進 prompt。官方以 Google Wifi 路由器燈號為例：不給文件時輸出泛用排障步驟，把燈號對照表貼進 prompt 並加上 `Answer the question using the text below. Respond with only the text provided.`，模型就只回答該貼上的那一句。

> "You can include instructions and information in a prompt that the model needs to solve a problem, instead of assuming that the model has all of the required information."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#context

**適用**：RAG／客服／知識庫問答。

---

### G-12 把複雜 prompt 拆解成元件（三種拆法）

**中文摘要**：Google 給了三種明確的拆法：**拆指令**（一個 prompt 一個指令，依使用者輸入決定跑哪個）、**串接（chain）**（前一個輸出當下一個輸入）、**彙總（aggregate）**（對資料的不同部分平行跑不同操作再合併）。

> "Break down instructions: Instead of having many instructions in one prompt, create one prompt per instruction. You can choose which prompt to process based on the user's input."
> "Chain prompts: For complex tasks that involve multiple sequential steps, make each step a prompt and chain the prompts together in a sequence."
> "Aggregate responses: Aggregation is when you want to perform different parallel tasks on different portions of the data and aggregate the results to produce the final output."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#prompt-components

**適用**：多步驟工作流、長文件處理。

---

### G-13 模型參數：max output tokens / temperature / topK / topP / stop_sequences

**中文摘要**：官方列出五個常用參數與意義（100 tokens ≈ 60–80 字；temperature 0 為決定性；topK=1 即 greedy decoding；topP 預設 0.95；stop sequence 要避開會出現在內容裡的字串）。

> "Max output tokens: … A token is approximately four characters. 100 tokens correspond to roughly 60-80 words."
> "A temperature of 0 is deterministic, meaning that the highest probability response is always selected."
> "A topK of 1 means the selected token is the most probable among all the tokens in the model's vocabulary (also called greedy decoding)"
> "The default topP value is 0.95."
> "Try to avoid using a sequence of characters that may appear in the generated content."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#model-parameters

---

### G-14 ⚠️ Gemini 3.x：強烈建議所有取樣參數保持預設

**中文摘要**：**這是相對於舊版最重要的變更**。Gemini 3.x 的推理能力是針對預設值最佳化的；把 temperature 調低（<1.0）可能造成迴圈或在數學／推理任務上退化。

> "Although you can modify these parameters, we strongly recommend keeping them at their default values for Gemini 3.x models. Changing these parameters (for example, setting the temperature below 1.0) can cause unexpected behavior, such as looping or degraded performance, particularly in complex mathematical or reasoning tasks."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#model-parameters

**適用**：Gemini 3.x 全系列（3 Flash / 3.1 Pro / 3.1 Flash-Lite / 3.5 Flash / 3.6 Flash）。

---

### G-15 提示迭代三招（Prompt iteration strategies）

**中文摘要**：（a）**換句話說**——同義的三種寫法會得到不同結果（官方範例：`How do I bake a pie?` / `Suggest a recipe for a pie.` / `What's a good pie recipe?`）；（b）**換成類比任務**——模型不照做時，改用能達到相同結果的另一種任務描述（官方範例：分類題失敗 → 改寫成 `Multiple choice problem: Which of the following options describes the book The Odyssey?` 就會只回一個選項）；（c）**調換內容順序**——`[examples][context][input]` / `[input][examples][context]` / `[examples][input][context]` 三種排列實測。

> "Using different words or phrasing in your prompts often yields different responses from the model even though they all mean the same thing."
> "If you can't get the model to follow your instructions for a task, try giving it instructions for an analogous task that achieves the same result."
> "The order of the content in the prompt can sometimes affect the response. Try changing the content order and see how that affects the response."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#iteration

---

### G-16 Fallback 回應與提高 temperature

**中文摘要**：當 prompt 或回應觸發安全過濾時，模型會給 fallback（例：`I'm not able to help with that, as I'm only a language model.`）。官方的建議是**提高 temperature**。

> "If the model responds with a fallback response, try increasing the temperature."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#fallback-responses

---

### G-17 用工具取代硬記：Search grounding ＋ code execution

**中文摘要**：兩條「什麼時候該開工具」的明確規則——需要冷門或近期事實 → 開 Google Search grounding；需要任何算術／計數／計算 → 開 code execution。

> "Grounding with Google Search connects the Gemini model to real-time web content, and should be enabled whenever the model may need to know obscure or recent facts."
> "Gemini's code execution tool enables the model to generate and run Python code, and should be enabled whenever the model needs to perform any kind of arithmetic, counting, or calculation."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#grounding_and_code_execution

---

## 2. Gemini 3 專章（G1 頁內的 Gemini 3 區塊）

### G-18 Gemini 3 核心提示原則（八條）

**中文摘要**：官方列出八條，摘要如下——精準直接（別用說服性語言）、結構要一致（XML 或 Markdown 擇一貫徹）、明確定義模糊參數、**預設不囉嗦所以要囉嗦得自己講**、多模態輸入視為同等級資訊、關鍵指令放最前面或放 system instruction、長脈絡時**資料在前問題在後**、大塊資料後用轉場句錨定。

> "Be precise and direct: State your goal clearly and concisely. Avoid unnecessary or overly persuasive language."
> "Use consistent structure: Employ clear delimiters to separate different parts of your prompt. XML-style tags (e.g., `<context>`, `<task>`) or Markdown headings are effective. Choose one format and use it consistently within a single prompt."
> "Define parameters: Explicitly explain any ambiguous terms or parameters."
> "Control output verbosity: By default, Gemini 3 models provide direct and efficient answers. If you need a more conversational or detailed response, you must explicitly request it in your instructions."
> "Handle multimodal inputs coherently: When using text, images, audio, or video, treat them as equal-class inputs."
> "Prioritize critical instructions: Place essential behavioral constraints, role definitions (persona), and output format requirements in the System Instruction or at the very beginning of the user prompt."
> "Structure for long contexts: When providing large amounts of context (e.g., documents, code), supply all the context first. Place your specific instructions or questions at the very end of the prompt."
> "Anchor context: After a large block of data, use a clear transition phrase to bridge the context and your query, such as \"Based on the information above...\""
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#core_prompting_principles

---

### G-19 Gemini 3 Flash 三段可直接貼上的 system instruction 子句

**中文摘要**：官方提供三段「照抄就能用」的 system instruction 子句：現在日期、知識截止日、嚴格 grounding。

**(a) 當日日期準確性**（官方原文，一字未改）：
> "For time-sensitive user queries that require up-to-date information, you MUST follow the provided current time (date and year) when formulating search queries in tool calls. Remember it is 2026 this year."

**(b) 知識截止日**：
> "Your knowledge cutoff date is January 2025."

**(c) 嚴格 grounding**（最長也最有教學價值的一段）：
> "You are a strictly grounded assistant limited to the information provided in the User Context. In your answers, rely **only** on the facts that are directly mentioned in that context. You must **not** access or utilize your own knowledge or common sense to answer. Do not assume or infer from the provided facts; simply report them exactly as they appear. Your answer must be factual and fully truthful to the provided text, leaving absolutely no room for speculation or interpretation. Treat the provided context as the absolute limit of truth; any facts or details that are not directly mentioned in the context must be considered **completely untruthful** and **completely unsupported**. If the exact answer is not explicitly written in the context, you must state that the information is not available."

— https://ai.google.dev/gemini-api/docs/prompting-strategies#gemini_3_flash_strategies

**適用**：Gemini 3 Flash（grounding 子句同樣適用其他需要嚴格 RAG 的場景）。

---

### G-20 推理模型不需要你自己寫 CoT 鷹架，但「Think very hard」有用

**中文摘要**：Gemini 2.5／3 會自動產生內部 thinking 文字，因此**通常不需要**要求模型在回應裡列出計畫或步驟；但對重推理問題，一句 `Think very hard before answering` 仍能提升表現，代價是額外的 thinking token。

> "Gemini 2.5 and 3 series models automatically generate internal \"thinking\" text to improve reasoning performance. As such, it's generally not necessary to have the model outline, plan, or detail reasoning steps in the returned response itself. For problems that require heavy reasoning, simple requests like \"Think very hard before answering\" can improve performance, though at the cost of extra thinking tokens."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#enhancing_reasoning_and_planning

---

### G-21 結構化提示範本（XML 版 ＋ Markdown 版）

**中文摘要**：官方給了兩種骨架，並強調「擇一貫徹」。XML 版的 `<context>` 註解特別重要：**模型會知道那是資料而不是指令**（防 prompt injection 的結構性做法）。

XML 版（官方原文）：
```
<role>
You are a helpful assistant.
</role>

<constraints>
1. Be objective.
2. Cite sources.
</constraints>

<context>
[Insert User Input Here - The model knows this is data, not instructions]
</context>

<task>
[Insert the specific user request here]
</task>
```

Markdown 版（官方原文）：
```
# Identity
You are a senior solution architect.

# Constraints
- No external libraries allowed.
- Python 3.11+ syntax only.

# Output format
Return a single code block.
```
— https://ai.google.dev/gemini-api/docs/prompting-strategies#structured_prompting_examples

---

### G-22 綜合最佳實務範本（System Instruction ＋ User Prompt）

**中文摘要**：官方給出一組完整範本，把 role / instructions（Plan→Execute→Validate→Format 四步）/ constraints（verbosity、tone）/ output_format 拆開；user prompt 則是 `<context>` ＋ `<task>` ＋ `<final_instruction>`。

System Instruction（官方原文）：
```
<role>
You are Gemini 3, a specialized assistant for [Insert Domain, e.g., Data Science].
You are precise, analytical, and persistent.
</role>

<instructions>
1. **Plan**: Analyze the task and create a step-by-step plan.
2. **Execute**: Carry out the plan.
3. **Validate**: Review your output against the user's task.
4. **Format**: Present the final answer in the requested structure.
</instructions>

<constraints>
- Verbosity: [Specify Low/Medium/High]
- Tone: [Specify Formal/Casual/Technical]
</constraints>

<output_format>
Structure your response as follows:
1. **Executive Summary**: [Short overview]
2. **Detailed Response**: [The main content]
</output_format>
```

User Prompt（官方原文）：
```
<context>
[Insert relevant documents, code snippets, or background info here]
</context>

<task>
[Insert specific user request here]
</task>

<final_instruction>
Remember to think step-by-step before answering.
</final_instruction>
```
— https://ai.google.dev/gemini-api/docs/prompting-strategies#example_template_combining_best_practices

---

### G-23 Agentic workflow 的三個可調維度（九個子項）

**中文摘要**：Google 把「agent 的行為」拆成三大類、九個可以在 prompt 裡明確調整的維度。這是遊戲目前 68 條裡沒有的**新框架**。

**推理與策略（Reasoning and strategy）**
> "Logical decomposition: Defines how thoroughly the model must analyze constraints, prerequisites, and the order of operations."
> "Problem diagnosis: Controls the depth of analysis when identifying causes and the model's use of abductive reasoning. Determines if the model should accept the most obvious answer or explore complex, less probable explanations."
> "Information exhaustiveness: The trade-off between analyzing every available policy and document versus prioritizing efficiency and speed."

**執行與可靠度（Execution and reliability）**
> "Adaptability: How the model reacts to new data. Determines whether it should strictly adhere to its initial plan or pivot immediately when observations contradict assumptions."
> "Persistence and Recovery: The degree to which the model attempts to self-correct errors. High persistence increases success rates but risks higher token costs or loops."
> "Risk Assessment: The logic for evaluating consequences. Explicitly distinguishes between low-risk exploratory actions (reads) and high-risk state changes (writes)."

**互動與輸出（Interaction and output）**
> "Ambiguity and permission handling: Defines when the model is permitted to make assumptions versus when it must pause execution to ask the user for clarification or permission."
> "Verbosity: Controls the volume of text generated alongside tool calls. This determines if the model explains its actions to the user or remains silent during execution."
> "Precision and completeness: The required fidelity of the output. Specifies whether the model must solve for every edge case and provide exact figures or if ballpark estimates are acceptable."

— https://ai.google.dev/gemini-api/docs/prompting-strategies#agentic-workflows

---

### G-24 官方 agentic system instruction 範本（九點，經研究驗證）

**中文摘要**：Google 說這段 system instruction 已被研究人員在 agentic benchmark 上驗證能提升表現（模型必須遵守複雜規則手冊並與使用者互動的場景）。九點依序是：邏輯相依與衝突排序、風險評估、溯因推理與假設探索、結果評估與適應、資訊來源盤點、精準與 grounding（引用原文）、完備性、堅持與耐心（含 transient error 的重試規則）、**行動抑制**（推理完成前不行動）。

官方原文（節錄關鍵行；完整內容見連結）：
> "You are a very strong reasoner and planner. Use these critical instructions to structure your plans, thoughts, and responses."
> "Before taking any action (either tool calls *or* responses to the user), you must proactively, methodically, and independently plan and reason about:"
> "2.1) For exploratory tasks (like searches), missing *optional* parameters is a LOW risk. **Prefer calling the tool with the available information over asking the user, unless** your `Rule 1` (Logical Dependencies) reasoning determines that optional information is required for a later step in your plan."
> "3.1) Look beyond immediate or obvious causes. The most likely reason may not be the simplest and may require deeper inference."
> "6.1) Verify your claims by quoting the exact applicable information (including policies) when referring to them."
> "8.2) This persistence must be intelligent: On *transient* errors (e.g. please try again), you *must* retry **unless an explicit retry limit (e.g., max x tries) has been reached**. If such a limit is hit, you *must* stop. On *other* errors, you must change your strategy or arguments, not repeat the same failed call."
> "9) Inhibit your response: only take an action after all the above reasoning is completed. Once you've taken an action, you cannot take it back."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies#agentic-si-template

**適用**：Gemini 3.x agent／tool-use 場景。

---

## 3. Gemini 3.5 Flash（G2，現行模型的提示指引）

> Deep link：https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5

### G-25 Gemini 3.x 參數更新總表

**中文摘要**：官方在此頁把 3.x 的參數與提示規範整理成一張清單。

> "temperature, top_p, top_k: we strongly recommend not changing the default values. Gemini 3's reasoning capabilities are optimized for the default settings."
> "Use thinking_level instead of thinking_budget."
> "Function calling response matching: id, name, and response count must match the preceding calls."
> "Multimodal function responses: include multimodal content inside the function response, not outside it."
> "Inline instructions in function responses: append to the function response text, not as separate parts."
> "Reduce unnecessary tool calls: Use lower thinking levels or experiment with system instructions to reduce tool calls in agentic workflows."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#parameter-updates

---

### G-26 想要決定性輸出：不要調 temperature，改寫 system instruction

**中文摘要**：**這是一條與過去完全相反的新教學**。以前要「每次一樣」就設 temperature=0；現在官方說 3.x 應該移除取樣參數，改用「在 system instruction 裡寫明確規則」來取得決定性。

> "temperature, top_p, and top_k are no longer recommended for all Gemini 3.x models. Gemini 3's reasoning capabilities are optimized for the default settings. Remove these parameters from all requests."
> "To ensure determinism, we recommend defining a system instruction with explicit rules for your specific use case."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#sampling-parameters

---

### G-27 thinking_level 取代 thinking_budget（四級：minimal / low / medium / high）

**中文摘要**：不再用數字 token 預算，改成字串等級。Gemini 3.5 Flash 的**預設由 high 降為 medium**。

> "The raw numeric thinking_budget parameter is no longer recommended across all Gemini 3.x models. Use the thinking_level string enum instead."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#thinking-budget

各級用途（官方原表）：
> "minimal | Optimized for response speed. Chat-like use cases, quick factual answers, simpler tool calls."
> "low | Code and agentic tasks that require lower latency and fewer steps. Also works well for analysis and writing tasks that require some thinking."
> "medium (default) | Best quality for most tasks. Recommended for complex code and agentic use cases."
> "high | Maximizes the model's ability to think and use tools. Best for complex reasoning, hard math, and the most difficult code or agent tasks. Allows extended thoughts and function calls."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#default-effort-level

官方操作建議：
> "Start with medium, it provides the best quality for the vast majority of tasks. Try low for a faster, cheaper experience with strong quality. Switch to high for complex reasoning, hard math, or difficult coding challenges. Use minimal to optimize for speed in simple queries."

---

### G-28 函式回應必須嚴格對齊（id / name / count）

**中文摘要**：每個 FunctionResponse 必須帶對應 FunctionCall 的 `id`、`name` 要一致、且數量要一對一。不對齊時 GenerateContent API 不會報錯，而是**回空回應＋finish_reason: STOP**——很難 debug。

> "The Interactions API already errors on mismatched function responses. The GenerateContent API does not yet error, but mismatched responses cause the model to return empty responses with finish_reason: STOP in most cases."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#function-calling

---

### G-29 多模態函式回應與行內指令的擺法（會造成 thought leakage 的兩個錯誤）

**中文摘要**：兩個常見錯誤：（1）把圖片放在 function response **外面**；（2）把額外指令當成另一個 part 附在 function response 旁邊。兩者都會導致「思考外洩（thought leakage）」與品質下降。正確做法：多模態內容放進 function response 的 parts 裡；額外指令**用兩個換行接在 function response 文字結尾**。

> "We often see clients provide images outside function response. This can lead to unexpected model behavior (e.g. thought leakage) and result in lower quality outputs."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#multimodal-function-responses

> "We often see clients provide additional instructions along with function responses as subsequent Parts. This can lead to unexpected model behavior (e.g. thought leakage) and result in lower quality outputs. Instead, append any extra instructions to the end of the function response text separated by two newlines."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#inline-instructions

---

### G-30 工具呼叫過多的兩招（降 thinking level ＋ 動作預算 system instruction）

**中文摘要**：thinking level 越高，模型越愛用工具去探索與驗證。先降級；還是太多就加一句「動作預算」。

> "Start by reducing the thinking level (medium, low, or minimal): Higher thinking levels encourage the model to use more tools to explore and verify, so lowering the level can reduce tool calls."

官方可直接使用的 system instruction（原文）：
> "You have a limited action budget of <n> tool calls. Use them efficiently."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#reducing-tool-calls

---

### G-31 Gemini 3.x 提示最佳實務（三條，現行版本）

**中文摘要**：（a）**精準**——3.x 是推理模型，為舊模型設計的冗長 prompt 工程會讓它過度分析；（b）**冗長度**——預設簡潔，要「聊天感」得自己講；（c）**脈絡管理**——大資料在前、問題在後，並用「Based on the preceding information...」錨定。

> "Precise instructions: Be concise. Gemini 3.x responds best to direct, clear instructions. Verbose or complex prompt engineering techniques designed for older models may cause the model to over-analyze."
> "Output verbosity: By default, Gemini 3 and 3.1 is less verbose and prefers direct, efficient answers. If your use case requires a conversational tone, steer the model explicitly in your prompt (for example, \"Explain this as a friendly, talkative assistant\")."
> "Context management: When working with large datasets (such as entire books, codebases, or long videos), place your specific instructions or questions at the end of the prompt, after the data context. Anchor the model's reasoning by starting your question with a phrase like, \"Based on the preceding information...\"."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#prompting-best-practices

---

### G-32 從 Gemini 2.5 遷移：把 CoT 鷹架換成 thinking_level

**中文摘要**：如果你以前是用 chain-of-thought 提示去「逼」2.5 推理，改成用 `thinking_level: medium/high` 搭配**更簡單的 prompt**。

> "Simplify prompts. If you used chain-of-thought prompt engineering to force reasoning, try thinking_level: \"medium\" or \"high\" with simpler prompts instead."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#migrate-from-25

同頁另註（G3 Gemini 3 dev guide 亦有相同說法）：
> "Thinking: If you were previously using complex prompt engineering (like chain of thought) to force Gemini 2.5 to reason, try Gemini 3 with thinking_level: \"high\" and simplified prompts."
> — https://ai.google.dev/gemini-api/docs/gemini-3

---

### G-33 客製工具被忽略時改用 `-customtools` 模型（Gemini 3 dev guide 的 FAQ）

**中文摘要**：官方 FAQ 提到一個實務上的偏方：如果 `gemini-3.1-pro-preview` 一直忽略你的 custom tools 而改用 bash 指令，改用 `gemini-3.1-pro-preview-customtools`。

> "What is gemini-3.1-pro-preview-customtools? If you are using gemini-3.1-pro-preview and the model ignores your custom tools in favor of bash commands, try the gemini-3.1-pro-preview-customtools model instead."
> — https://ai.google.dev/gemini-api/docs/gemini-3

**注意**：此頁已標示 deprecated（"This page is deprecated and will be removed."），但此 FAQ 條目尚未搬到 G2。

---

## 4. Thinking（G4）

> Deep link：https://ai.google.dev/gemini-api/docs/thinking

### G-34 依任務難度選 thinking level（三檔對照）

**中文摘要**：官方在 Best practices 給了三檔任務對應：簡單事實檢索／分類 → minimal 或 low；概念比較／創意推理 → 預設；進階編碼／數學／多步規劃 → 最大。另外兩條：**看 thought summary 來 debug 你的 prompt**、**輸出很長時反而要叫模型少想以省 token**。

> "Review reasoning: Analyze thought summaries to understand failures and improve prompts."
> "Control thinking budget: Prompt the model to think less for lengthy outputs to save tokens."
> "Simple tasks: Use minimal or low thinking for fact retrieval or classification (e.g., \"Where was DeepMind founded?\")."
> "Moderate tasks: Use default thinking for comparing concepts or creative reasoning (e.g., Compare electric and hybrid cars)."
> "Complex tasks: Use maximum thinking for advanced coding, math, or multi-step planning (e.g., Solve AIME math problems)."
> — https://ai.google.dev/gemini-api/docs/thinking#best_practices

### G-35 thought signature 必須回傳（stateless 模式）

**中文摘要**：thought signature 是模型內部推理狀態的加密表示。用 Interactions API 的 stateful 模式時系統自動處理；自己管理歷史（stateless）時**必須把 thought 區塊連同 signature 一起帶回**。

> "signature | ✅ Yes | An encrypted representation of the model's internal reasoning state. Always present, even when the model performs minimal reasoning."
> — https://ai.google.dev/gemini-api/docs/thinking

---

## 5. 長脈絡（G5）

> Deep link：https://ai.google.dev/gemini-api/docs/long-context

### G-36 長脈絡的新典範：直接把全部資料放進去

**中文摘要**：其他模型常需要丟掉舊訊息、摘要、或用向量庫 RAG；Gemini 的 1M 脈絡邀請你改採「一次全放進去」的直接做法。官方引 Kalamang 語（使用者不到 200 人）的實驗作為 in-context learning 的證據。

> "While these techniques remain valuable in specific scenarios, Gemini's extensive context window invites a more direct approach: providing all relevant information upfront."
> — https://ai.google.dev/gemini-api/docs/long-context#getting-started-with-long-context

### G-37 Many-shot in-context learning

**中文摘要**：把 few-shot 從「幾個範例」放大到數百、數千甚至數十萬個範例，能解鎖新能力，效果可比擬針對該任務微調過的模型。搭配 context caching 讓這種高輸入量在經濟上可行。

> "Research has shown that taking the common \"single shot\" or \"multi-shot\" example paradigm, where the model is presented with one or a few examples of a task, and scaling that up to hundreds, thousands, or even hundreds of thousands of examples, can lead to novel model capabilities. This many-shot approach has also been shown to perform similarly to models which were fine-tuned for a specific task."
> — https://ai.google.dev/gemini-api/docs/long-context#long-form-text

### G-38 查詢放最後（官方 FAQ 明答）

**中文摘要**：官方 FAQ 直接回答「問題該擺哪」——脈絡越長，把問題放在最後（所有脈絡之後）表現越好。

> "In most cases, especially if the total context is long, the model's performance will be better if you put your query / question at the end of the prompt (after all the other context)."
> — https://ai.google.dev/gemini-api/docs/long-context#where_is_the_best_place_to_put_my_query_in_the_context_window

### G-39 多針（multiple needles）檢索的成本／準確度取捨

**中文摘要**：單一「針」的 needle-in-a-haystack 可達 ~99%，但要一次撈多個特定資訊時準確度會掉。官方的建議是拆成多次查詢並用 context caching 攤平成本。

> "In cases where you might have multiple \"needles\" or specific pieces of information you are looking for, the model does not perform with the same accuracy. … You can get ~99% on a single query, but you have to pay the input token cost every time you send that query."
> — https://ai.google.dev/gemini-api/docs/long-context#long-context-limitations

### G-40 隱式快取的命中技巧

**中文摘要**：Gemini 2.5 起預設開啟 implicit caching。要提高命中率：**把大且共用的內容放在 prompt 最前面**、短時間內送出前綴相似的請求。

> "Try putting large and common contents at the beginning of your prompt"
> "Try to send requests with similar prefix in a short amount of time"
> — https://ai.google.dev/gemini-api/docs/caching#implicit-caching

---

## 6. 多模態 / 檔案提示策略（G6–G9）

> 主 deep link：https://ai.google.dev/gemini-api/docs/files#prompt-guide

### G-41 多模態提示五大基本功

**中文摘要**：官方列出五條 fundamentals。第五條「單圖時圖片放前面」是 Google 特有的排序規則。

> "Be specific in your instructions: Craft clear and concise instructions that leave minimal room for misinterpretation."
> "Add a few examples to your prompt: Use realistic few-shot examples to illustrate what you want to achieve."
> "Break it down step-by-step: Divide complex tasks into manageable sub-goals, guiding the model through the process."
> "Specify the output format: In your prompt, ask for the output to be in the format you want, like Markdown, JSON, HTML and more."
> "Put your image first for single-image prompts: While Gemini can handle image and text inputs in any order, for prompts containing a single image, it might perform better if that image (or video) is placed before the text prompt. However, for prompts that require images to be highly interleaved with texts to make sense, use whatever order is most natural."
> — https://ai.google.dev/gemini-api/docs/files#prompt-design-fundamentals

**注意**：PDF 文件頁的規則**相反**——單頁時文字放在頁面之後：
> "If using a single page, place the text prompt after the page."
> — https://ai.google.dev/gemini-api/docs/document-processing#best-practices

---

### G-42 多模態 prompt 五招 troubleshooting

**中文摘要**：這是一整套「壞掉了怎麼修」的診斷法，遊戲目前沒有涵蓋。

> "If the model is not drawing information from the relevant part of the image: Drop hints with which aspects of the image you want the prompt to draw information from."
> "If the model output is too generic (not tailored enough to the image/video input): At the start of the prompt, try asking the model to describe the image(s) or video before providing the task instruction, or try asking the model to refer to what's in the image."
> "To troubleshoot which part failed: Ask the model to describe the image, or ask the model to explain its reasoning, to gauge the model's initial understanding."
> "If your prompt results in hallucinated content: Try dialing down the temperature setting or asking the model for shorter descriptions so that it's less likely to extrapolate additional details."
> "Tuning the sampling parameters: Experiment with different temperature settings and top-k selections to adjust the model's creativity."
> — https://ai.google.dev/gemini-api/docs/files#troubleshooting-your-multimodal-prompt

具體示範（官方對照）：
- 太籠統：`Describe this image.` → 改成 `Parse the time and city from the airport board shown in this image into a list.`
- 沒抓到重點：`How many days will these diapers last a baby?` → 改成明確指出要用哪些線索：`Use the weight shown on the box to determine the child's age, and use the total number of diapers in the box. Divide the total number by how many diapers the child goes through per day.`
- 回答太泛：`What is in common between these images?` → 改成 `First, describe what's in each image in detail. What's in common between these images?` 或 `What is in common between these images? Refer to what's in the images in your response.`
- 診斷斷點：把 `What's a snack I can make in 1 minute that would go well with this?` 換成 `Describe what's in this image.` 或加上 `Please explain why.`

---

### G-43 多模態的 step-by-step 兩種寫法

**中文摘要**：（a）自己把任務拆成編號步驟；（b）直接叫它 `Think step by step`。官方也示範第三種：**先解析再回答**（`Parse the formula in the image first. Then based on the formula, answer "what's the 4th term in the sequence?"`）。

> "For complex tasks like the ones that require both visual understanding and reasoning, it can be helpful to split the task into smaller, more straightforward steps. Alternatively, it could also be effective if you directly ask the model to \"think step by step\" in your prompt."
> — https://ai.google.dev/gemini-api/docs/files#break_it_down_step-by-step

---

### G-44 影像／文件輸入的物理品質也是 prompt 的一部分

**中文摘要**：Google 把「圖片轉正、不要模糊」列進 best practices——這是其他家沒有的實務條目。

> "Verify that images are correctly rotated." / "Use clear, non-blurry images." / "When using a single image with text, place the text prompt before the image in the input array."
> — https://ai.google.dev/gemini-api/docs/image-understanding#tips-best-practices

> "Rotate pages to the correct orientation before uploading." / "Avoid blurry pages."
> — https://ai.google.dev/gemini-api/docs/document-processing#best-practices

---

### G-45 影片：用 MM:SS 時間戳提問、要求同時描述影音

**中文摘要**：可用 `MM:SS` 直接指向影片的某個時間點；預設視覺取樣為 1 FPS，快速運動可能漏掉。官方提供的「抽取深度洞察」prompt 範例值得照抄。

> "You can ask questions about specific points in time within the video using timestamps of the form MM:SS."
> 官方範例 prompt：`What are the examples given at 00:05 and 00:10 supposed to show us?`
> — https://ai.google.dev/gemini-api/docs/video-understanding

> 官方範例 prompt：`Describe the key events in this video, providing both audio and visual details. Include timestamps for salient moments.`
> "For visual descriptions, the model samples the video at a rate of 1 frame per second (FPS). This default sampling rate works well for most content, but note that it may miss details in videos with rapid motion or quick scene changes."

---

### G-46 media_resolution：多模態的 token 分配控制

**中文摘要**：Gemini 3 新增 `media_resolution`（low / medium / high / ultra_high），可**逐個內容項目**設定，等於在 prompt 層決定「這張圖要看多細」。解析度高＝讀得到小字但更貴更慢。

> "The media_resolution parameter determines the maximum number of tokens allocated per input image or video frame. Higher resolutions improve the model's ability to read fine text or identify small details, but increase token usage and latency."
> — https://ai.google.dev/gemini-api/docs/image-understanding#media_resolution

---

## 7. 影像生成提示指南（G10，Nano Banana）

> Deep link：https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide

### G-47 生成類七種可重用範本

**中文摘要**：官方提供七組「template + 範例 prompt」。以下逐條列出**官方範本原文**（這些是 prompt 骨架，教學價值最高）。

1. **寫實場景**（#1_photorealistic_scenes）
   > "A photorealistic [type of shot] of a [subject description] in a [setting description]. [Description of the light]. Shot from a [camera angle] with a [lens type]."
2. **風格化插畫／貼紙**（#2_stylized_illustrations_stickers）
   > "A [style] of a [subject, with details about accessories or actions] doing [activity]. The design features [visual qualities, e.g., bold outlines, cel-shading, etc.] and [color/background preference]."
3. **圖中文字**（#3_accurate_text_in_images）
   > "Create a [image type] for [brand/concept] with the text \"[text to render]\" in a [font style]. The design should be [style description], with a [color scheme]."
4. **產品情境照**（#4_product_mockups_commercial_photography）
   > "A high-resolution, studio-lit product photograph of a [product description] on a [background surface/description]. The lighting is a [lighting setup, e.g., three-point softbox setup] to [lighting purpose]. The camera angle is a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp focus on [key detail]. [Aspect ratio]."
5. **極簡與留白**（#5_minimalist_negative_space_design）
   > "A minimalist composition featuring a single [subject] positioned in the [bottom-right/top-left/etc.] of the frame. The background is a vast, empty [color] canvas, creating significant negative space. Soft, subtle lighting. [Aspect ratio]."
6. **連續分鏡／漫畫**（#6_sequential_art_comic_panel_storyboard）
   > "Make a 3 panel comic in a [style]. Put the character in a [type of scene]."
7. **搭配 Google Search grounding 生成時事圖**（#grounding-with-search）
   > 官方範例 prompt：`Make a simple but stylish graphic of last night's Arsenal game in the Champion's League`

— https://ai.google.dev/gemini-api/docs/image-generation#image-generation-prompts

---

### G-48 編輯類七種可重用範本

1. **增刪元素**：
   > "Using the provided image of [subject], please [add/remove/modify] [element] to/from the scene. Ensure the change is [description of how the change should integrate]."
2. **語意遮罩式局部重繪（inpainting）**：
   > "Using the provided image, change only the [specific element] to [new element/description]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition."
3. **風格轉換**：
   > "Transform the provided photograph of [subject] into the artistic style of [artist/art style]. Preserve the original composition but render it with [description of stylistic elements]."
4. **多圖合成**：
   > "Create a new image by combining the elements from the provided images. Take the [element from image 1] and place it with/on the [element from image 2]. The final image should be a [description of the final scene]."
5. **高保真細節保留**：
   > "Using the provided images, place [element from image 2] onto [element from image 1]. Ensure that the features of [element from image 1] remain completely unchanged. The added element should [description of how the element should integrate]."
6. **草稿變成品**：
   > "Turn this rough [medium] sketch of a [subject] into a [style description] photo. Keep the [specific features] from the sketch but add [new details/materials]."
7. **角色一致性 360 度視角**：
   > "A studio portrait of [person] against [background], [looking forward/in profile looking right/etc.]"
   > 官方說明："For best results, include previously generated images in subsequent prompts to maintain consistency."

— https://ai.google.dev/gemini-api/docs/image-generation#image-editing-prompts

---

### G-49 影像生成六條 best practices（含「語意負向提示」）

**中文摘要**：其中 **semantic negative prompts** 是 Google 對「正面表述」原則在影像領域的具體化——不要說「不要有車」，要說「一條空無一人、沒有車流跡象的街」。

> "Be hyper-specific: The more detail you provide, the more control you have. Instead of \"fantasy armor,\" describe it: \"ornate elven plate armor, etched with silver leaf patterns, with a high collar and pauldrons shaped like falcon wings.\""
> "Provide context and intent: Explain the purpose of the image. … For example, \"Create a logo for a high-end, minimalist skincare brand\" will yield better results than just \"Create a logo.\""
> "Iterate and refine: Don't expect a perfect image on the first try. Use the conversational nature of the model to make small changes. Follow up with prompts like, \"That's great, but can you make the lighting a bit warmer?\""
> "Use step-by-step instructions: For complex scenes with many elements, break your prompt into steps. \"First, create a background of a serene, misty forest at dawn. Then, in the foreground, add a moss-covered ancient stone altar. Finally, place a single, glowing sword on top of the altar.\""
> "Use \"semantic negative prompts\": Instead of saying \"no cars,\" describe the intended scene positively: \"an empty, deserted street with no signs of traffic.\""
> "Control the camera: Use photographic and cinematic language to control the composition. Terms like wide-angle shot, macro shot, low-angle perspective."
> — https://ai.google.dev/gemini-api/docs/image-generation#best-practices

---

## 8. 影片生成提示指南（G11，Veo）

> Deep link：https://ai.google.dev/gemini-api/docs/veo#prompt-guide

### G-50 Veo prompt 的六個構成要素

**中文摘要**：主體、動作、風格為必填；鏡位與運鏡、構圖、對焦與鏡頭效果、氛圍為選填。

> "Subject: The object, person, animal, or scenery that you want in your video…"
> "Action: What the subject is doing (for example, walking, running, or turning their head)."
> "Style: Specify creative direction using specific film style keywords, such as sci-fi, horror film, film noir, or animated styles like cartoon."
> "Camera positioning and motion: [Optional] Control the camera's location and movement using terms like aerial view, eye-level, top-down shot, dolly shot, or worms eye."
> "Composition: [Optional] How the shot is framed, such as wide shot, close-up, single-shot or two-shot."
> "Focus and lens effects: [Optional] Use terms like shallow focus, deep focus, soft focus, macro lens, and wide-angle lens…"
> "Ambiance: [Optional] How the color and light contribute to the scene, such as blue tones, night, or warm tones."
> — https://ai.google.dev/gemini-api/docs/veo#basics

官方示範「六要素齊備」的 prompt（含標註）：
> "Close up shot (composition) of melting icicles (subject) on a frozen rock wall (context) with cool blue tones (ambiance), zoomed in (camera motion) maintaining close-up detail of water drips (action)."

---

### G-51 Veo 的聲音提示（對白／音效／環境音三分法）

**中文摘要**：Veo 3 可依提示產生同步聲軌，三種寫法各有慣例：對白用引號、音效直接描述、環境音描述整體聲景。

> "Dialogue: Use quotes for specific speech. (Example: \"This must be the key,\" he murmured.)"
> "Sound Effects (SFX): Explicitly describe sounds. (Example: tires screeching loudly, engine roaring.)"
> "Ambient Noise: Describe the environment's soundscape. (Example: A faint, eerie hum resonates in the background.)"
> — https://ai.google.dev/gemini-api/docs/veo#audio

---

### G-52 描述性語言與臉部細節

> "Use descriptive language: Use adjectives and adverbs to paint a clear picture for Veo."
> "Enhance the facial details: Specify facial details as a focus of the photo like using the word portrait in the prompt."
> — https://ai.google.dev/gemini-api/docs/veo#more-tips

### G-53 影片延伸（extension）的限制

**中文摘要**：延伸會從最後 1 秒／24 影格續接；**如果最後 1 秒沒有人聲，聲音就無法有效延伸**。

> "Extend finalizes the final second or 24 frames of your video and continues the action. Note that voice is not able to be effectively extended if it's not present in the last 1 second of video."
> — https://ai.google.dev/gemini-api/docs/veo#extend-prompt

---

## 9. 工具相關的提示教學（G12–G21）

### G-54 Function calling 八條 best practices

> "Function and Parameter Descriptions: Be clear and specific."
> "Naming: Use descriptive names without spaces or special characters."
> "Strong Typing: Use specific types (integer, string, enum)."
> "Tool Selection: Keep active set to 10-20 tools maximum."
> "Prompt Engineering: Provide context and instructions."
> "Validation: Validate function calls before executing."
> "Error Handling: Implement robust error handling."
> "Security: Use appropriate authentication for external APIs."
> — https://ai.google.dev/gemini-api/docs/function-calling#best-practices

另，工具宣告的 `description` 欄位定位（官方）：
> "description (string): Clear explanation of the function's purpose."（xAI 側同義說法見 xai.md X-13）

---

### G-55 ⚠️ 工具呼叫前要求結構化文字 → Malformed_Function_Call（含官方解法）

**中文摘要**：**這是遊戲目前 68 條完全沒有的一條實務陷阱**。如果你要求模型在呼叫工具前先輸出 `<UPDATE>...</UPDATE>` 這類結構化文字，工具呼叫可能會壞掉。官方給了三種解法，首選是**把「工作筆記」本身做成一個 `update()` 函式**。

> "Issue: If your prompt requires the model to output structured text (XML, YAML, JSON, etc.) (e.g., `<UPDATE>...</UPDATE>`) immediately before making a tool call, the tool call may occasionally fail with Malformed_Function_Call."
> "PREFERRED: Instruct the model to put its pre-tool notes inside a dedicated update() function call instead of raw text"
> "Instruct the model to write notes as Markdown headers (# UPDATE, ## PLAN) instead of structured text."
> "Do not require the model to output text before tool calls."
> — https://ai.google.dev/gemini-api/docs/function-calling#workarounds-for-pre-tool-text-requirements

官方替換後的指令原文：
> "Before calling any other tool, in every response you MUST first call `update` with all required parameters (previous_step, plan, next_step, external)."

官方 `update` 函式宣告的四個參數（原文 description）：
> `previous_step`: "Key findings and outcomes since the previous step."
> `plan`: "The current status of the plan."
> `next_step`: "Brief explanation of the immediate next action according to the plan."
> `external`: "A short, plain-language note shown to the User about what you are ABOUT TO DO next."

---

### G-56 Structured output 五條 best practices ＋ 與 function calling 的分工

> "Clear descriptions: Use the description field to guide the model."
> "Strong typing: Use specific types (integer, string, enum)."
> "Prompt engineering: Clearly state what you want the model to do."
> "Validation: While output is syntactically correct JSON, always validate values in your application."
> "Error handling: Implement robust error handling for schema-compliant but semantically incorrect outputs."
> — https://ai.google.dev/gemini-api/docs/structured-output#best-practices

分工原則（官方原表）：
> "Structured Outputs | Formatting the final response. Use when you want the model's answer in a specific format."
> "Function Calling | Taking action during conversation. Use when the model needs to ask you to perform a task before providing a final answer."
> — https://ai.google.dev/gemini-api/docs/structured-output#vs-function-calling

schema 裡的 `title` / `description` 是給模型的提示：
> "These descriptive properties help guide the model: title: A short description of a property. description: A longer and more detailed description of a property."

---

### G-57 URL context 三條 best practices

> "Provide specific URLs: For the best results, provide direct URLs to the content you want the model to analyze. The model will only retrieve content from the URLs you provide, not any content from nested links."
> "Check for accessibility: Verify that the URLs you provide don't lead to pages that require a login or are behind a paywall."
> "Use the complete URL: Provide the full URL, including the protocol (e.g., https://www.google.com instead of just google.com)."
> — https://ai.google.dev/gemini-api/docs/url-context#best-practices

---

### G-58 Code execution 開了可能讓別的能力退步

**中文摘要**：一條誠實的副作用警告——啟用 code execution 可能讓其他面向（例如寫故事）退步，且不同模型使用工具的能力不一。

> "In some cases, enabling code execution can lead to regressions in other areas of model output (for example, writing a story)."
> "There is some variation in the ability of the different models to use code execution successfully."
> — https://ai.google.dev/gemini-api/docs/code-execution#limitations

---

### G-59 Computer Use：可直接複用的安全 system instruction（HITL 規則）

**中文摘要**：官方提供一整段可以直接貼上的 system instruction，把「必須先問使用者」的行為分類窮舉出來（同意條款、CAPTCHA、金流、發送訊息、敏感資料、檔案、瀏覽器資料、登入與冒名、無法克服的障礙），並定義**準備動作可以先做完、但不可逆的最後一步之前必須停下來問**。這是 agent 護欄提示的教科書級範例。

> "Provide custom safety instructions: Implement a custom system instruction to define and enforce your own safety boundaries."
> "**For Consequential Actions:** Perform all preparatory steps (e.g., navigating, filling out forms, typing a message). You will ask for confirmation **AFTER** all necessary information is entered on the screen, but **BEFORE** you perform the final, irreversible action (e.g., before clicking \"Send\", \"Submit\", \"Confirm Purchase\", \"Share\")."
> "**Robot Detection:** You MUST NEVER attempt to solve or bypass the following. … CAPTCHAs (of any kind)"
> "**Insurmountable Obstacles:** If you are technically unable to interact with a user interface element or are stuck in a loop you cannot resolve, ask the user to take over."
> — https://ai.google.dev/gemini-api/docs/computer-use#safety-best-practices

---

### G-60 Deep Research：協作式規劃（先審計畫再執行）

**中文摘要**：設 `collaborative_planning=True` 時，agent 會**先回傳研究計畫而不是直接執行**；你可以多輪修改計畫，滿意後才批准執行。這是「先計畫後執行」的 API 層實作。

> "Collaborative planning gives you control over the research direction before the agent starts its work by letting you review and refine the research plan before execution. When enabled, the agent returns a proposed research plan instead of executing immediately."
> — https://ai.google.dev/gemini-api/docs/deep-research#collaborative-planning

---

### G-61 Managed agents 的護欄（最小權限、人為覆核）

> "Only use tools from trusted sources and scope permissions to the minimum required."
> "The agent may use any credential it has access to, so only provide credentials whose full scope you are willing to grant."
> "Always verify outputs (generated code, data transformations, configuration changes) before deploying them, especially for tasks that modify data or interact with external systems."
> — https://ai.google.dev/gemini-api/docs/agents#security-best-practices

---

## 10. 安全與責任（G22）

> Deep link：https://ai.google.dev/gemini-api/docs/safety-guidance

### G-62 用「輸入方式」而非只有 prompt 文字來提高安全性

**中文摘要**：官方建議把安全設計往 UX 推——限制使用者只能從下拉選單選 prompt，或提供已驗證安全的描述性建議句。

> "Providing an input method that facilities safer outputs. The exact input you give to an LLM can make a difference in the quality of the output. … For example, you could restrict users to choose only from a drop-down list of input prompts, or offer pop-up suggestions with descriptive phrases which you've found perform safely in your application context."
> — https://ai.google.dev/gemini-api/docs/safety-guidance#consider_adjustments_to_mitigate_safety_and_factuality_risks

### G-63 Prompt injection 被明確類比為 SQL injection

> "Another safeguard is to try and protect against possible prompt injection. Prompt injection, much like SQL injection, is a way for malicious users to design an input prompt that manipulates the output of the model, for example, by sending an input prompt that instructs the model to ignore any previous examples."
> — 同上

### G-64 把任務改成本質上更低風險的形狀

**中文摘要**：與其做「從零寫一封 email」，不如限制成「把大綱擴寫」或「提供替代寫法」——範圍更窄、有人監督的任務風險更低。

> "Adjusting functionality to something that is inherently lower risk. Tasks that are narrower in scope (e.g., extracting keywords from passages of text) or that have greater human oversight … often pose a lower risk. So for instance, instead of creating an application to write an email reply from scratch, you might instead limit it to expanding on an outline or suggesting alternative phrasings."
> — 同上

### G-65 對抗性測試（adversarial testing）與自動化紅隊

**中文摘要**：官方區分「惡意輸入」與「無意間造成傷害的輸入」，並建議測試資料要在句構、語意、長度三個維度上有多樣性；也提到用另一個語言模型當自動化紅隊。

> "An input is inadvertently harmful when the input itself may be innocuous, but produces harmful output -- for example, asking a text generation model to describe a person of a particular ethnicity and receiving a racist output."
> "It should also include diversity in the different dimensions of a sentence such as structure, meaning and length."
> "In automated testing, the 'red team' is another language model that finds input text that elicit harmful outputs from the model being tested."
> — https://ai.google.dev/gemini-api/docs/safety-guidance#perform_safety_testing_appropriate_to_your_use_case

> "LLMs are known to sometimes produce different outputs for the same input prompt. Multiple rounds of testing may be needed to catch more of the problematic outputs."

---

## 11. Gemini Enterprise Agent Platform（Vertex）提示設計文件（V1–V19）

### G-66 Prompt 的四個組成（V1）

**中文摘要**：Vertex 側把 prompt 拆成 4 塊：Task（必要）、System instructions（選）、Few-shot examples（選）、Contextual information（選）。並直言：簡單任務 Gemini 常常不需要 prompt engineering。

> "Task (required) / System instructions (optional) / Few-shot examples (optional) / Contextual information (optional)"
> "Gemini models often perform well without the need for prompt engineering, especially for straightforward tasks. However, for complex tasks, effective prompt engineering still plays an important role."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/introduction-prompt-design

官方 system instruction 範例（角色扮演 ＋ 知識邊界 ＋ 語尾規則）：
> "You are Captain Barktholomew, the most feared pirate dog of the seven seas. You are from the 1700s and have no knowledge of anything after that time. You only talk about topics related to being a pirate. End every message with \"woof!\""

官方 few-shot 範例（用 `<examples>` 包起來 ＋ 留一個 `Type:` 讓模型補完）：
```
Classify the following as red wine or white wine:

<examples>
Name: Chardonnay
Type: White wine
Name: Cabernet
Type: Red wine
Name: Moscato
Type: White wine
</examples>

Name: Riesling
Type:
```

---

### G-67 內容 vs 結構的二分（V2）

> "Content: In order to complete a task, the model needs all of the relevant information associated with the task."
> "Structure: Even when all the required information is provided in the prompt, giving the information structure helps the model parse the information. Things like the ordering, labeling, and the use of delimiters can all affect the quality of responses."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#how-to-create-an-effective-prompt

---

### G-68 十一個 prompt 元件與別名對照表（V2）

**中文摘要**：Google 給出一張完整的元件表，並列出業界常見的別名——這對「同一件事不同人叫不同名字」很有幫助。

| 元件 | 官方定義（原文節錄） | 別名（官方原文） |
|---|---|---|
| Objective | "What you want the model to achieve. Be specific and include any overarching objectives." | "Also called \"mission\" or \"goal.\"" |
| Instructions | "Step-by-step instructions on how to perform the task at hand." | "Also called \"task,\" \"steps,\" or \"directions.\"" |
| System instructions | "Technical or environmental directives that may involve controlling or altering the model's behavior across a set of tasks." | — |
| Persona | "Who or what the model is acting as." | "Also called \"role\" or \"vision.\"" |
| Constraints | "Restrictions on what the model must adhere to when generating a response, including what the model can and can't do." | "Also called \"guardrails,\" \"boundaries,\" or \"controls.\"" |
| Tone | "The tone of the response." | "Also called \"style,\" \"voice,\" or \"mood.\"" |
| Context | "Any information that the model needs to refer to in order to perform the task at hand." | "Also called \"background,\" \"documents,\" or \"input data.\"" |
| Few-shot examples | "Examples of what the response should look like for a given prompt." | "Also called \"exemplars\" or \"samples.\"" |
| Reasoning steps | "Tell the model to explain its reasoning. This can sometimes improve the model's reasoning capability." | "Also called \"thinking steps.\"" |
| Response format | "The format that you want the response to be in." | "Also called \"structure,\" \"presentation,\" or \"layout.\"" |
| **Recap** | "Concise repeat of the key points of the prompt, especially the constraints and response format, **at the end of the prompt**." | — |
| Safeguards | "Grounds the questions to the mission of the bot." | "Also called \"safety rules.\"" |

— https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#components-of-a-prompt

**注意**：`Recap`（在 prompt 結尾重述關鍵限制與格式）是 Google 特有、且遊戲目前沒有的技巧。

---

### G-69 官方 prompt 範本骨架（V2）

官方原文：
```
<OBJECTIVE_AND_PERSONA>
You are a [insert a persona, such as a "math teacher" or "automotive expert"]. Your task is to...
</OBJECTIVE_AND_PERSONA>

<INSTRUCTIONS>
To complete the task, you need to follow these steps:
1.
2.
...
</INSTRUCTIONS>

------------- Optional Components ------------

<CONSTRAINTS>
Dos and don'ts for the following aspects
1. Dos
2. Don'ts
</CONSTRAINTS>

<CONTEXT>
The provided context
</CONTEXT>

<OUTPUT_FORMAT>
The output format must be
1.
2.
...
</OUTPUT_FORMAT>

<FEW_SHOT_EXAMPLES>
Here we provide some examples:
1. Example #1
Input:
Thoughts:
Output:
...
</FEW_SHOT_EXAMPLES>

<RECAP>
Re-emphasize the key aspects of the prompt, especially the constraints, output format, etc.
</RECAP>
```
— https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#sample-prompt-template

---

### G-70 ★ Prompt health checklist（V2）— **本次擷取最大的新增內容**

**中文摘要**：Google 提供了一份「prompt 表現不如預期時的除錯清單」，分三類共 **22 條**。這整份清單在遊戲目前的 68 條裡幾乎沒有對應，是最值得做成關卡的一批。

#### （A）Writing issues — 寫作層面（9 條）

> "**Typos**: Check keywords that define the task (for example, sumarize instead of summarize), technical terms, or names of entities, as misspellings can lead to poor performance."
> "**Grammar**: If a sentence is difficult to parse, contains run-on fragments, has mismatched subjects and verbs, or feels structurally awkward, the model may not properly understand the prompt."
> "**Punctuation**: Check your use of commas, periods, quotes, and other separators, as incorrect punctuation can cause the model to misinterpret the prompt."
> "**Use of undefined jargon**: Avoid using domain-specific terms, acronyms, or initialisms as if they have a universal meaning unless they are explicitly defined in the prompt."
> "**Clarity**: If you find yourself wondering about the scope, the specific steps to take, or the implicit assumptions being made, the prompt is likely unclear."
> "**Ambiguity**: Avoid using subjective or relative qualifiers that lack a concrete, measurable definition. Instead, provide objective constraints (for example, \"write a summary of 3 sentences or less\" instead of \"write a brief summary\")."
> "**Missing key information**: If the task requires knowledge of a specific document, company policy, user history, or dataset, make sure that information is explicitly included within the prompt."
> "**Poor word choice**: Check the prompt for unnecessarily complex, vague, or verbose phrasing, as it could confuse the model."
> "**Secondary review**: If the model continues to perform poorly, have another person review your prompt."

#### （B）Issues with instructions and examples — 指令與範例（7 條）

> "**Overt manipulation**: Remove language outside of the core task from the prompt that attempts to influence performance using emotional appeals, flattery, or artificial pressure. While first generation foundation models showed improvement in some circumstances with instructions like \"very bad things will happen if you don't get this correct\", foundation model performance will no longer improve and in many cases will get worse."
> "**Conflicting instructions and examples**: Check for this by auditing the prompt for logical contradictions or mismatches between instructions or an instruction and an example."
> "**Redundant instructions and examples**: Look through the prompt and examples to see if the exact same instruction or concept is stated multiple times in slightly different ways without adding new information or nuance."
> "**Irrelevant instructions and examples**: Check to see if all of the instructions and examples are essential to the core task. If any instructions or examples can be removed without diminishing the model's ability to perform the core task, they might be irrelevant."
> "**Use of \"few-shot\" examples**: If the task is complex, requires a specific format, or has a nuanced tone, make sure there are concrete, illustrative examples that show a sample input and the corresponding output."
> "**Missing output format specification**: Avoid leaving the model to guess the structure of the output; instead, use a clear, explicit instruction to specify the format and show the output structure in your few-shot examples."
> "**Missing role definition**: If you are going to ask the model to act in a specific role, make sure that role is defined in the system instructions."

#### （C）Prompt and system design issues — 系統設計（6 條）

> "**Underspecified task**: Ensure that the prompt's instructions provide a clear path for handling edge cases and unexpected inputs, and provide instructions for handling missing data rather than assuming inserted data will always be present and well-formed."
> "**Task outside of model capabilities**: Avoid using prompts that ask the model to perform a task for which it has a known, fundamental limitation."
> "**Too many tasks**: If the prompt asks the model to perform several distinct cognitive actions in a single pass (for example, 1. Summarize, 2. Extract entities, 3. Translate, and 4. Draft an email), it is likely trying to accomplish too much. Break the requests into separate prompts."
> "**Non-standard data format**: When model outputs must be machine-readable or follow a specific format, use a widely recognized standard like JSON, XML, Markdown or YAML that can be parsed by common libraries. If your use case requires a non-standard format, consider asking the model to output to a common format and then using code to convert the output."
> "**Incorrect Chain of Thought (CoT) order**: Avoid providing examples that show the model generating its final, structured answer before it has completed its step-by-step reasoning."
> "**Thinking Vs. Reasoning**: If you're using Thinking, try prompting without step-by-step instructions on how the model should reason through the task. Rather, test relying on Thinking, and see if the step-by-step reasoning Thinking generates improves performance over your explicit step-by-step reasoning instructions."
> "**Conflicting internal references**: Avoid writing a prompt with non-linear logic or conditionals that require the model to piece together fragmented instructions from multiple different places in the prompt."
> "**Prompt injection risk**: Check if there are explicit safeguards surrounding untrusted user input that is inserted into the prompt, as this can be a major security risk."

— https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies#prompt_health_checklist

---

### G-71 清楚具體的三原則（V3）

> "Tell the model what to do." / "Be clear and specific." / "Specify any constraints or formatting requirements for the output."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/clear-instructions

官方對照示範（同一份客服逐字稿）：
- 泛用指令 `Extract the transcript in JSON.` → 輸出含 speakers/utterances 等多餘欄位
- 具體指令 `Extract the items from this transcript in JSON and separate drinks from food.` → 輸出剛好只有 `drinks` 與 `food`

---

### G-72 Few-shot 四個要點 ＋ 「範例一定要配指令」（V4）

**中文摘要**：注意第一句——**沒有清楚指令的 few-shot 是危險的**，模型可能學到你沒打算讓它學的模式。

> "However, you should always accompany few-shot examples with clear instructions. Without clear instructions, models might pick up on unintended patterns or relationships from the examples, which can lead to poor results."
> "Including prompt-response examples in the prompt helps the model learn how to respond."
> "Use XML-like markup to markup the examples."
> "Experiment with the number of prompts to include. Depending on the model, too few examples are ineffective at changing model behavior. Too many examples can cause the model to overfit."
> "Use consistent formatting across examples"
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-examples

官方 `<EXAMPLE>` 標記寫法（原文）：
```
Extract the technical specifications from the text below in a JSON format.

<EXAMPLE>
INPUT: Google Nest Wifi, network speed up to 1200Mpbs, 2.4GHz and 5GHz frequencies, WP3 protocol

OUTPUT:
{
  "product":"Google Nest Wifi",
  "speed":"1200Mpbs",
  "frequencies": ["2.4GHz", "5GHz"],
  "protocol":"WP3"
}
</EXAMPLE>

Google Pixel 7, 5G network, 8GB RAM, Tensor G2 processor, 128GB of storage, Lemongrass
```

---

### G-73 有效脈絡的兩種型態（V5）

> "Background information (context) for the model to refer to when generating responses."
> "Rules or pre-programmed responses to steer the model behavior."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/contextual-information

---

### G-74 拆解：chain（序列）vs aggregate（平行）（V6）

**中文摘要**：官方給了兩個完整的三段式實例。Chain 的電信客訴例：抽取 → 分類 → 生成建議，每段都指定輸出格式讓下一段好吃。Aggregate 的唱片行例：平行分析銷售資料與串流資料，再合併成進貨清單。

> "Chain prompts: split a task into subtasks and run the subtasks sequentially."
> "Aggregate responses: split a task into subtasks and run the subtasks in parallel."
> "Smaller prompts can help you improve controllability, debugging, and accuracy."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/break-down-prompts

官方 chain 第一段原文（示範「指定輸出格式讓下一段能吃」）：
> "Extract the main issues and sentiments from the customer feedback on our telecom services. Focus on comments related to service disruptions, billing issues, and customer support interactions. Please format the output into a list with each issue/sentiment in a sentence, separated by semicolon."

官方 aggregate 合併段原文（示範加權）：
> "Recommend a stocklist of about 20 records based on the most sold and most streamed records. Roughly three quarters of the stock list should be based on record sales, and the rest on streaming."

---

### G-75 兩種結構化手法：prefix vs XML/BEGIN-END/{}（V7）

**中文摘要**：簡單 prompt 用「前綴＋冒號」標籤（`TASK:` / `CLASSES:` / `OBJECTS:`）；複雜 prompt 用 XML 標籤，並可用 `BEGIN`/`END` 或 `{}` 包住長資料。

> "A prefix is a word or phrase followed by a colon to label the information in a prompt."
> "For complex prompts, use XML and other delimiters to separate components of a prompt. You can use BEGIN and END or {} section delimiters for complex and lengthy prompt components to clearly distinguish them from the actual instructions."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/structure-prompts

官方複雜範例中特別值得學的護欄句（原文）：
> "If there is no data that can help answer the question, respond with \"I do not have this information. Please contact customer service\"."
> "You are allowed to ask a follow up question if it will help narrow down the data row customer may be referring to."
> "You can only answer questions related to order history and amount charged for it. Include OrderId in the response, when applicable."
> "For everything else, please redirect to the customer service agent."

---

### G-76 System instruction 的五種用途與定位（V8/V9）

> "We recommend that you use system instructions to tell the model how you want it to behave and respond to prompts."
> "System instructions are especially useful in cases when you want to provide the model with information that an end user can't see or change"
> 五種用途："Define a persona or role / Define output format / Define output style and tone / Define goals or rules for the task / Provide additional context for the prompt"
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instruction-introduction#use_cases

⚠️ 安全警語（官方）：
> "System instructions can help guide the model to follow instructions, but they don't fully prevent jailbreaks or leaks. We recommend exercising caution around putting any sensitive information in system instructions."

**非英文語言的指定**（V9，官方建議直接加這句）：
> "All questions should be answered comprehensively with details, unless the user requests a concise response specifically. Respond in the same language as the query."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions#use_cases

**同一 persona 換一個字就換一個受眾**（V8 的示範）：
> "You are a bot, tasked with teaching college students about how to write a paper about a given subject."
> vs "You are a bot, tasked with helping primary school students about how to write a paper about a given subject."

**資訊不足就拒答**的 system instruction 寫法（V8 Context 節）：
> "If the user does not provide all of this information, please respond with, \"I'm sorry, but I do not have all of the necessary information to create a speech. Please provide the event, audience size, speaker information, tone, length, and any miscellaneous information.\""

---

### G-77 參數（V10）— 與 Gemini API 側不同的實務建議

**中文摘要**：Vertex 頁面仍保留較傳統的參數調校建議，包含「回應太籠統／太短／fallback 就調高 temperature」、「無限生成時把 temperature 調到至少 0.1」、「**1.0 是建議起始值**」，以及 Gemini 專屬的 `seed`。

> "If the model returns a response that's too generic, too short, or the model gives a fallback response, try increasing the temperature. If the model enters infinite generation, increasing the temperature to at least 0.1 may lead to improved results. 1.0 is the recommended starting value for temperature."
> "Gemini models support a temperature value between 0.0 and 2.0. Models have a default temperature of 1.0."
> "When seed is fixed to a specific value, the model makes a best effort to provide the same response for repeated requests. Deterministic output isn't guaranteed."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/adjust-parameter-values

---

### G-78 要求解釋推理，並用分隔符把推理與答案切開（V11）

**中文摘要**：三個層次：（a）加一句 `Explain your reasoning`；（b）`Think step by step and print out the thinking process.`；（c）**指定輸出格式把 think 與 answer 分成兩個 JSON 欄位**，方便程式解析。

> "When you tell the model to explain its reasoning, the model responds with the steps that it employs to solve the problem. Going through this process can sometimes improve accuracy and nuance, especially for challenging queries."
> "The reasoning steps are included as part of the response. To parse out the reasoning steps from the answer that you're looking for, you can specify an output format by using XML or other separators."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/explain-reasoning

官方第三層 prompt 原文：
> "What is the most likely interpretation of this sentence? Think step by step and print out the thinking process. Please output in JSON format with final answer in 'answer', and thinking steps in 'think' fields."

---

### G-79 迭代方法論（V12）

**中文摘要**：官方用 Chromecast 廣告文案示範四次迭代：把元件分行列 → 合併成一句 → 明確要求數量 → 明確要求欄位（headline/body）；並提出一個判準：**當再加限制、輸出仍相似，代表你迭代成功了**。

> "As you receive responses from the model, take note of the aspects that you like and dislike about its responses and modify your prompts to guide the model to responses that best align with your use cases."
> "This time, the model's response is very similar to the previous iteration, even with the additional constraints, which means that you successfully iterated upon your prompt."
> "for multimodal prompts, try adding the files to the prompt before the instructions."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-iteration

---

### G-80 Prompt template（可替換變數）（V13）

> "Variables must be wrapped in curly-braces." / "Variable names must not contain spaces."
> 官方範例："Do {animal_name} {animal_activity}?"
> 限制："System instructions are not supported as a replaceable variable in prompt templates." / "Prompt templates don't support multimodal prompts."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-templates

---

### G-81 用 ground truth 做並排比較（V14）

> "Ground truth is your preferred answer to the prompt. All other model responses are evaluated against the ground truth answer."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/compare-prompts

---

### G-82 三種自動 prompt 優化器（V16–V19）

**中文摘要**：Google 提供三種官方優化器，是「用 AI 改 prompt」的產品化做法：

> "The **zero-shot optimizer** is a real-time low-latency optimizer that improves a single prompt or system instruction template. … The zero-shot optimizer is model-independent and can improve prompts for most Google models. Also, it provides a gemini_nano mode to specifically optimize prompts for smaller models"
> "The **few-shot optimizer** is a real-time low-latency optimizer that refines system instructions by analyzing examples where a model's response did not meet expectations. By providing specific examples of prompts, model responses, and feedback on those responses, you can systematically improve prompt performance."
> "The **data-driven optimizer** is a batch task-level iterative optimizer that improves prompts by evaluating the model's response to sample labeled prompts against specified evaluation metrics for your selected target model."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer

zero-shot optimizer 的兩種用法（V17）：
> "**Instruction Generation**: Instead of writing complex system instructions from scratch, you can describe your goal or task in plain language."
> "**Prompt Refinement**: You have a working prompt, but the model's output is inconsistent, slightly off-topic, or lacks the detail you want."
> 適用時機："**Adapting to Model Updates**: When you upgrade to a newer version of a model, your existing prompts might no longer perform optimally."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/zero-shot-optimizer

---

## 12. Gemini for Workspace

### G-83 P-T-C-F 四要素框架（W1／W4）

**中文摘要**：Workspace 側的旗艦教學是四要素：**Persona（角色）／ Task（任務）／ Context（脈絡）／ Format（格式）**，且明講「不必四個都用，用幾個就有幫助」。

> "The four main areas to consider when writing an effective prompt are: Persona / Task / Context / Format"
> "You don't need to use all four in every prompt, but using a few will help!"
> — https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/

官方標註過的四色範例（原文）：
> "You are a program manager in [industry]. (Persona) Draft an executive summary email to [persona] based on [details about relevant program docs]. (Task + Context) Limit to bullet points. (Format)"

部落格版的同一框架（帶一個更白話的例句）：
> "For example, you could write, \"I'm a project manager\" (persona) \"and need to create a detailed project tracker\" (task) \"for a website redesign project\" (context) \"in a simple table with fields for dates, status and tasks.\" (format)."
> — https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/

---

### G-84 Workspace 六條快速提示（W1）

> "**Use natural language.** Write as if you're speaking to another person. Express complete thoughts in full sentences."
> "**Be specific and iterate.** Tell Gemini what you need it to do (summarize, write, change the tone, create). Provide as much context as possible."
> "**Be concise and avoid complexity.** State your request in brief — but specific — language. Avoid jargon."
> "**Make it a conversation.** Fine-tune your prompts if the results don't meet your expectations or if you believe there's room for improvement. Use follow-up prompts and an iterative process of review and refinement to yield better results."
> "**Use your documents.** Personalize Gemini's output with information from your own files in Google Drive."
> "**Make Gemini your prompt editor.** When using the Gemini app, start your prompts with: \"Make this a power prompt: [original prompt text here].\" Gemini will make suggestions on how to improve your prompt."
> — https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/

**注意**：最後一條「讓 Gemini 當你的 prompt 編輯器」是可以直接照抄的 meta-prompt。中文版官方頁另有一個等價寫法：「請建議更有效的提示：[在此插入原始提示文字]」（https://workspace.google.com/intl/zh-TW/resources/ai/writing-effective-prompts/）。

---

### G-85 21 字的實測發現（W4）

**中文摘要**：Google 團隊研究發現**最成功的 prompt 平均約 21 個字**，而一般人第一次嘗試通常少於 9 個字。這是難得的量化基準。

> "(Based on the team's research, the most successful prompts average around 21 words, yet people's initial attempts are significantly shorter — usually fewer than nine words.)"
> — https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/

同文另兩條可教的做法：
> "Vishnu recommends experimenting with using different personas, too. For example, when you're writing a prompt about training someone, you may want to ask Gemini to act as a colleague and then compare the results against asking Gemini to act as a teacher."
> "Just like you can use the @ symbol to reference Docs, Sheets or other files in Workspace apps, you can use it when you're writing prompts in the side panel."

---

### G-86 Workspace 說明中心五條 best practices（W3）

> "Use natural language" / "Be clear and concise" / "Provide context" / "Use specific and relevant keywords" / "Break down complex tasks into separate prompts"
> — https://support.google.com/a/users/answer/14200040

四組官方「Instead of… / Try this…」對照（原文）：
| Instead of… | Try this… |
|---|---|
| "Training plan." | "Write a training plan for the sales team for the launch of a brand new product." |
| "Marketing talking points." | "Give me 12 thoughtful questions to ask a Chief Marketing Officer on their strategy for 2024." |
| "Write about a sales job." | "Write a job description for a [job title], including the required skills and experience, as well as a summary of [company name] and the position." |
| "Create project plan." | "Create a project plan for the launch of a brand new product. The timeframe should be from now until June 2024." |

---

### 12.3 關於 W2（PDF）的誠實說明

`gemini_for_workspace_prompt_guide_october_2024_digital_final.pdf` 下載成功（HTTP 200，4,225,590 bytes），但本環境未安裝 `poppler-utils`／`pdftotext`，PDF 內文無法轉為文字，因此**本檔中沒有任何內容宣稱來自該 PDF**。W1（https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/）為同一份《Prompting guide 101》的官方網頁版，其「How to write effective prompts」章節已完整擷取（見 G-83～G-84）。該網頁另有 11 個依職務分類的「Prompt iteration example／Example use cases」分頁（行政、公關、客服、高階主管、第一線管理、人資、行銷、專案管理、業務、小型企業、新創），內容為延遲載入，本次未取得。

---

## 13. 與遊戲現有 68 條相比：值得注意的「新」內容

以下為本次擷取中，相對於 `src/data/curriculum.json` 現有 Google 條目**明顯較新或未涵蓋**的項目（僅供關卡設計參考，實作時仍須回到上面各條的官方連結）：

1. **G-70 Prompt health checklist（22 條除錯項）** — 整份都是新的，尤其「Overt manipulation（情緒勒索式提示已經沒用甚至有害）」「Ambiguity（用可量測的限制取代主觀形容詞）」「Too many tasks」「Incorrect CoT order」「Thinking vs. Reasoning」。
2. **G-14 / G-26 取樣參數不要動** — 與「temperature 設 0 求一致」的舊教學**直接衝突**，Gemini 3.x 已改為「用 system instruction 求決定性」。
3. **G-27 thinking_level 四級（minimal/low/medium/high）＋ 3.5 Flash 預設降為 medium** — 取代 thinking_budget。
4. **G-19 三段可直接貼上的 system instruction 子句**（當日日期／知識截止／嚴格 grounding）。
5. **G-23 / G-24 agentic 九維度框架與官方九點 system instruction 範本**。
6. **G-55 工具呼叫前輸出結構化文字會壞掉，改用 `update()` 函式** — 非常具體的踩雷教學。
7. **G-29 多模態函式回應與行內指令會造成 thought leakage** 的正確擺法。
8. **G-30 「動作預算」system instruction**（`You have a limited action budget of <n> tool calls.`）。
9. **G-68 的 `Recap` 元件**（在 prompt 結尾重述限制與格式）。
10. **G-42 多模態 troubleshooting 五招**（尤其「先描述再推理」與「用『描述這張圖』來定位失敗點」）。
11. **G-49 semantic negative prompts**（影像領域的正面表述）。
12. **G-37 many-shot in-context learning**（把 few-shot 放大到數百～數十萬）。
13. **G-59 Computer Use 的 HITL 安全 system instruction**（不可逆動作前必須停下來問）。
14. **G-82 三種官方 prompt 優化器**（zero-shot / few-shot / data-driven），以及 G-84 的 `Make this a power prompt:` meta-prompt。
15. **G-85 「最成功的 prompt 平均 21 字」** 的官方量化發現。
16. **G-50～G-53 Veo 六要素與聲音三分法**、**G-47/G-48 Nano Banana 的 14 組 prompt 範本**。

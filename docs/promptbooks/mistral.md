# Promptbook — Mistral AI

- **廠商**：Mistral AI
- **擷取日期**：2026-07-30
- **內容性質**：以下皆為**官方文件**（docs.mistral.ai 官方文件、mistralai 官方 Hugging Face 模型卡）。引文一字未改（英文原文），摘要以繁體中文書寫。

## 來源清單（Source URLs）

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| S1 | Prompting（Best Practices，原 `guides/prompting_capabilities` 已 301 導向此頁） | https://docs.mistral.ai/models/best-practices/prompt-engineering | 未標示，擷取日 2026-07-30 |
| S2 | Sampling（Temperature / Top P / Penalties） | https://docs.mistral.ai/models/best-practices/sampling | 未標示，擷取日 2026-07-30 |
| S3 | Magistral-Small-2509 模型卡（推理模型系統提示） | https://huggingface.co/mistralai/Magistral-Small-2509 | 未標示，擷取日 2026-07-30 |
| S4 | Ministral-3-8B-Reasoning-2512 模型卡（Recommended Settings） | https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512 | 未標示，擷取日 2026-07-30 |
| S5 | Ministral-3 Reasoning 官方 SYSTEM_PROMPT.txt | https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512/blob/main/SYSTEM_PROMPT.txt | 未標示，擷取日 2026-07-30 |
| S6 | Mistral-Large-3-675B-Instruct-2512 模型卡（Recommended Settings） | https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512 | 未標示，擷取日 2026-07-30 |

> 註：`https://docs.mistral.ai/guides/prompting_capabilities/` 目前 301 導向 S1；S1 的原始 markdown 前置資料仍標示 `id: prompting_capabilities`，可確認是同一份文件的新網址。

---

## A. 核心概念（來源：S1「Main Concepts」）

### A1. System prompt vs. user prompt（以及沒有 system 時的替代作法）

**中文摘要**：Mistral 把兩層輸入講得很乾淨：system 在對話開頭設定整體脈絡與行為、通常由開發者管理；user 提供當下這一輪的脈絡或指令。特別實用的一條：**如果你控制不了 system prompt，可以把整體脈絡直接串接在 user prompt 前面**，並附上具體的 JSON 串接寫法。

> The system prompt is provided at the beginning of the conversation. It sets the general context and instructions for the model's behavior and is typically managed by the developer.

> The user prompt is provided during the conversation to give the model specific context or instructions for the current interaction.

> If you cannot control the system prompt, you can still include the general context and instructions in the user prompt by concatenating them with the actual query.

**官方串接寫法（逐字）**：

```json
{
  "role": "user",
  "content": "system_prompt\n\nUser: user_prompt"
}
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering
- 適用模型：Mistral 全系列

### A2. Providing a Purpose（角色扮演 / 目的定義）

**中文摘要**：官方給出一句可直接套用的句型模板，並說明它的作用是把模型迅速導向某個垂直領域與任務。

> Also called Roleplaying, it's the first step in crafting a prompt and corresponds to defining a clear purpose. A common approach is to start with a concise role and task definition, such as:

> "You are a <role>, your task is to <task>."

> This simple yet powerful technique helps steer the model toward a specific vertical and task, ensuring it quickly understands the context and expected output.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### A3. Structure（階層化結構＋「寫給沒有前情提要的人看」）

**中文摘要**：指令要分章節、有階層。官方給了一條很好用的自我檢查法則：想像你是寫給一個完全沒有背景知識的人看，他光讀這份 prompt 就要能執行任務。

> When giving instructions, organize them hierarchically or with a clear structure, such as dividing them into clear sections and subsections. The prompt should be clear and complete.

> A useful rule of thumb is to imagine you're writing for someone with no prior context—they should be able to understand and execute the task solely by reading the prompt.

**官方結構化範例（逐字，語言偵測任務）**：

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

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### A4. Formatting：Markdown / XML 標籤，並說明「為什麼」

**中文摘要**：Mistral 給了三個理由，其中第三個「模型訓練時大量看過」很少有廠商明講。

> Formatting is critical for crafting effective prompts. It allows you to explicitly highlight different sections, making the structure intuitive for both the model and developers. Markdown and/or XML-style tags are ideal because they are:

> Readable: Easy for humans to scan.
> Parsable: Simple to extract information programmatically.
> Familiar: Likely seen massively during the model's training.

> Good formatting not only helps the model understand the prompt but also makes it easier for developers to iterate and maintain the application.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### A5. Example Prompting / Few-Shot（兩種放法）

**中文摘要**：Mistral 區分兩種給範例的方式——直接寫在 prompt 的 `# Examples` 區塊，或做成**對話歷史裡的假 user/assistant 往返**（標準 few-shot 結構）。並明確定義 zero-shot 是不給範例。

> Example prompting is a technique where you provide a few task examples to improve the model's understanding, accuracy and specially the output format.

> A specific example of this is few-shot prompting, where artificial interactions between the user and model are included in the conversation history. In contrast, zero-shot prompting involves no examples.

**官方標準 few-shot 結構（逐字，節錄）**：

```json
[
  {"role": "system", "content": "You are a language detection model. Your task is to detect the language of the given text.\n[...]"},
  {"role": "user", "content": "Hello, how are you?"},
  {"role": "assistant", "content": "{\"language_iso\": \"en\"}"},
  {"role": "user", "content": "Bonjour, comment allez-vous?"},
  {"role": "assistant", "content": "{\"language_iso\": \"fr\"}"}
]
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### A6. Structured Outputs

> To ensure the model generates structured and predictable responses, we provide the ability of enforcing a specific JSON output format. This is particularly useful for tasks requiring a consistent structure that can be easily parsed and processed programmatically.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### A7. Advice：把 prompt 當程式碼一樣迭代

> When building a prompt, it is important to stay flexible and experiment, different models from different labs, and even a simple update, can change the model behaviour and a consistent prompt may be impacted by these changes.

> Hence, do not hesitate to revisit your prompts and see the impact, similar to how you would iterate on your code and model training, you should iterate on your prompts and evaluate the impact of your changes.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

---

## B. What to Avoid（Mistral 最有辨識度的一節）

這一整節是「反面清單」，四大廠都沒有這麼系統化的等價章節，非常適合改造成關卡。

> Below we provide a list of "good to know" advice about what to avoid doing. The list is not exhaustive and can depend on your use case - but these points are good to keep in mind while building your prompts.

### B1. 避免主觀與模糊的字眼

**中文摘要**：兩類要避開——模糊的量詞形容詞（太長、太短、很多、很少）與模糊的名詞（東西、有趣的報告、變好一點）。要改成客觀可衡量的說法。

> Avoid blurry quantitative adjectives: "too long", "too short", "many", "few", etc. Instead, provide objective measures.

> Avoid blurry words like "things", "stuff", "write an interesting report", "make it better", etc. Instead, state exactly what you mean by "interesting", "better", etc.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### B2. 避免自相矛盾——改用決策樹

**中文摘要**：system prompt 一長就容易出現細微矛盾。官方的解法不是「寫清楚一點」，而是**把規則改寫成有序的決策樹**（if / otherwise if / otherwise），這是可以直接做成檢查器的結構。

> As your system prompt gets long, slight contradictions may appear.
> Example:
> "If the new data is related to an existing database record, update this record."
> "If the data is new, create a new record."
> This is unclear because new data could either update an existing record or create a new one.

**官方決策樹範例（逐字）**：

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

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### B3. 不要叫 LLM 數字數（把字數當成輸入資料餵給它）

**中文摘要**：極具實務價值的一條：不只是「不要說太長就拆開」，連「超過 100 字就拆開」也不行——因為模型不會算字數。正解是**把 charCount 當成輸入資料的一個欄位**。

> Avoid: "If the record is too long, split it into multiple records."
> Avoid: "If the record is longer than 100 characters, split it into multiple records."
> Instead, provide character counts as input:

```
Existing records:
- { record: "User: Alice, Age: 30", charCount: 15 }
- { record: "User: Bob, Age: 25", charCount: 13 }
New data:
- { data: "User: Charlie, Age: 35", charCount: 17 }
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### B4. 不要產生太多 token（吃 token 比吐 token 快）

> Models are faster at ingesting tokens than generating them. If using structured outputs, only ask the model to generate what is strictly necessary.

> Bad Examples: Generating full record content for a NO_OP operation. Generating an entire book in one shot.

> Only generate the update or necessary data.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### B5. 評分用「文字級距」而非數字級距（Prefer Worded Scales）

**中文摘要**：要模型打分時，用有語意的等級（Very Low / Low / Neutral / Good / Very Good）並逐級寫清定義，比 1–5 分好；需要數字時再自己轉換。這是四大廠都沒明講的一條。

> If you need a model to rate something, use a worded scale for better performance.

> Avoid: "Rate these options on a 1 to 5 scale, 1 being highly irrelevant and 5 being highly relevant."

> Use:
```
Rate these options using this scale:
- Very Low: if the option is highly irrelevant
- Low: if the option is not good enough
- Neutral: if the option is not particularly interesting
- Good: if the option is worth considering
- Very Good: for highly relevant options
```

> You can convert this worded scale to a numeric one if needed.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

---

## C. 四個能力示範（來源：S1「Prompting Examples」）

> Below we walk you through example prompts showing four different prompting capabilities: Classification / Summarization / Personalization / Evaluation

### C1. Classification（分類）— 兩種策略的取捨

**中文摘要**：官方把分類拆成兩條路線並講明取捨：**直接輸出標籤**（快、便宜、輸出 token 最少，但可靠性與彈性較差）vs. **輸出 JSON**（可靠、彈性、好接後續處理，但多花一點 token）。這種「同一任務兩種作法＋取捨」的寫法很適合做成「兩個都對但評價不同」的題型。

> Mistral models can easily categorize text into distinct classes.

> Ask for the label directly, the model should then answer with a single word or string. Effective, fast and cheap, this strategy will use the less amount of output tokens but may lack reliability and flexibility.

> Ask for a json output, the model should then answer with a json object that could be downstream processed easily. Reliable, flexible and practical, this strategy will generate slightly more tokens but allows for more complex use cases and more flexibility.

**官方分類 system prompt（逐字，節錄）**：

```
You are a bank customer service bot. Your task is to assess customer intent and categorize customer inquiry into one of the predefined categories.

# Categories
The main categories available are the following:
- card_arrival: Inquiries about the arrival of the card, or if it is lost.
- change_pin: Inquiries about changing the pin code of the card.
- exchange_rate: Inquiries about the exchange rate of the card.
- country_support: Inquiries about the countries supported by the card.
- cancel_transfer: Inquiries about canceling a transfer.
- charge_dispute: Inquiries about a charge dispute.
If the text doesn't fit into any of the above categories, classify it as:
- customer_service: Inquiries about customer service in general that do not fit into the previous categories.

# Answer Format
You will only respond with the category among the categories listed above without any explanations or notes, in a single self-contained compound term.
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering
- 注意：官方把「不在清單內」的兜底類別（`customer_service`）明寫進 prompt，等於強制模型有退路。

### C2. Summarization（摘要）— 三個策略

**中文摘要**：官方把一份摘要 prompt 拆成三個明確策略：**逐步指令**（受 CoT 啟發，把任務拆成摘要 → 出題 → 寫報告三步，好 debug）、**要求模型自己生成範例與解釋**、**指定輸出格式**。

> Step-by-step instructions: This strategy is inspired by the chain-of-thought prompting that enables LLMs to use a series of intermediate reasoning steps to tackle complex tasks. It's often easier to solve complex problems when we decompose them into simpler and small steps and it's easier for us to debug and inspect the model behavior.

> Example generation: We can ask LLMs to automatically guide the reasoning and understanding process by generating examples with the explanations and steps.

> Output formatting: We can ask LLMs to output in a certain format by directly asking "write a report in the Markdown format".

**官方 prompt（逐字）**：

```
You are a commentator. Your task is to write a report on an essay.
When presented with the essay, come up with interesting questions to ask, and answer each question.
Afterward, combine all the information and write a report in the markdown format.

# Essay:
{essay}

# Instructions:
## Summarize:
In clear and concise language, summarize the key points and themes presented in the essay.

## Interesting Questions:
Generate three distinct and thought-provoking questions that can be asked about the content of the essay. For each question:
- After "Q: ", describe the problem
- After "A: ", provide a detailed explanation of the problem addressed in the question.
- Enclose the ultimate answer in <>.

## Write a report
Using the essay summary and the answers to the interesting questions, create a comprehensive report in Markdown format.
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### C3. Personalization（個人化）— 提供事實表

**中文摘要**：客服信件個人化的關鍵策略只有一條：**把事實用清單餵進 prompt**，語言要清楚簡潔。這是最小可行的 grounding 教學。

> Providing facts: Incorporating facts into prompts can be useful for developing customer support bots. It's important to use clear and concise language when presenting these facts. This can help the LLM to provide accurate and quick responses to customer queries.

**官方 prompt（逐字，節錄）**：

```
You are a mortgage lender customer service bot, and your task is to create personalized email responses to address customer questions. Answer the customer's inquiry using the provided facts below. Ensure that your response is clear, concise, and directly addresses the customer's question. Address the customer in a friendly and professional manner. Sign the email with "Lender Customer Support."

# Facts
30-year fixed-rate: interest rate 6.403%, APR 6.484%
20-year fixed-rate: interest rate 6.329%, APR 6.429%
15-year fixed-rate: interest rate 5.705%, APR 5.848%
[...]

# Email
{insert customer email here}
```

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

### C4. Evaluation（自我評估）— 三種作法

**中文摘要**：官方列出三條路：**輸出附信心分數**、**在同一個 prompt 裡加一個評估步驟**、**用另一個 LLM 來評**（production 常見作法，等於 LLM chaining）。

> There are many ways to evaluate LLM outputs. Here are three approaches for your reference: include a confidence score, introduce an evaluation step, or employ another LLM for evaluation.

**(a) 信心分數**（官方 prompt 逐字）：

```
You are a summarization system that can provide summaries with associated confidence scores.
In clear and concise language, provide three short summaries of the following essay, along with their confidence scores.
You will only respond with a JSON object with the key Summary and Confidence. Do not provide explanations.

# Essay:
{insert essay text here}
```

> JSON output: For facilitating downstream tasks, JSON format output is frequently preferred. We can enable the JSON mode by setting the response_format to `{"type": "json_object"}` and specify in the prompt that "You will only respond with a JSON object with the key Summary and Confidence." Specifying these keys within the JSON object is beneficial for clarity and consistency.

> Higher Temperature: In this example, we increase the temperature score to encourage the model to be more creative and output three generated summaries that are different from each other.

**(b) 在 prompt 裡加評估步驟**（官方 prompt 逐字）：

```
Step 1: In this step, provide three short summaries of the given essay. Each summary should be clear, concise, and capture the key points of the speech. Aim for around 2-3 sentences for each summary.
Step 2: Evaluate the three summaries from Step 1 and rate which one you believe is the best. Explain your choice by pointing out specific reasons such as clarity, completeness, and relevance to the speech content.
```

**(c) 用另一個 LLM 評（LLM chaining）**（官方 prompt 逐字）：

```
You are given an essay and three summaries of the essay. Evaluate the three summaries and rate which one you believe is the best.
Explain your choice by pointing out specific reasons such as clarity, completeness, and relevance to the essay content.

# Essay:
{insert essay text here}

# Summaries
{insert the previous output}
```

> LLM chaining: In this example, we chain two LLMs in a sequence, where the output from the first LLM serves as the input for the second LLM. The method of chaining LLMs can be adapted to suit your specific use cases. [...] While LLM chaining offers flexibility, it's important to consider that it may result in additional API calls and potentially increased costs.

> In production systems, it is common to employ another LLM for evaluation so that the evaluation step can be separate from the generation summaries.

- URL：https://docs.mistral.ai/models/best-practices/prompt-engineering

---

## D. 取樣參數（來源：S2）

### D1. Temperature 的用途與「0 也不完全確定」的警告

**中文摘要**：Mistral 明講即使 temperature=0（greedy sampling），因為硬體差異與捨入誤差仍可能有些微差異，長輸出時一個 token 不同就會整段岔開。這是很誠實、其他廠商少見的一段。

> **Temperature** in Large Language Models (LLMs) controls output diversity. Lower values make the model more deterministic, focusing on likely responses for accuracy. Higher values increase creativity and diversity.

> While intuitively, setting `temperature` to 0 should make outputs fully deterministic and consistent (same prompt and settings = same completion output), in reality, even with greedy sampling at `temperature=0`, **slight variances** can sometimes occur due to hardware differences and rounding errors. [...] This effect becomes especially evident during long completions (input and/or output), where a single differing token can create an entirely new sequence.

- URL：https://docs.mistral.ai/models/best-practices/sampling

### D2. 依任務挑溫度（The Best Temperature）

> There's no one-size-fits-all Temperature for all use cases, but some guidelines can help you find the best for your applications.

> **Determinism** — Requirements: Tasks needing consistent, accurate responses, such as Mathematics, Classification, Healthcare, or Reasoning. Temperature: Use very low values, sometimes not null to add slight uniqueness.

> For example, a classification agent should use a Temperature of 0 to always pick the best token. A math chat assistant might use very low Temperature values to avoid repetition while maintaining accuracy.

> **Creativity** — Requirements: Tasks needing diverse, unique text, like brainstorming, writing novels, creating slogans, or roleplaying. Temperature: Use high values, but avoid excessively high Temperatures to prevent randomness and nonsense outputs.

> Consider the trade-off: higher Temperatures increase creativity but may decrease quality and accuracy.

- URL：https://docs.mistral.ai/models/best-practices/sampling

### D3. Temperature 與 Top P 不要一起調

> Top P ensures that only high-quality tokens are considered, maintaining output quality by excluding unlikely tokens. It's challenging to balance Temperature and Top P, so it's recommended to fix one and adjust the other.

> **Interaction with Temperature**: Top P is applied after Temperature.

> **Balancing Temperature and Top P**: It's challenging to balance both. Start by fixing one parameter and adjust the other, experiment to find optimal settings.

- URL：https://docs.mistral.ai/models/best-practices/sampling

---

## E. 推理模型的官方系統提示與設定（來源：S3–S6）

### E1. Magistral：官方**建議放進 system prompt** 的推理模板

**中文摘要**：與 DeepSeek-R1「不要用 system prompt」完全相反——Mistral 的推理模型把**推理指令本身放在 system prompt**，並用 `[THINK]`／`[/THINK]` 特殊 token 包住思考內容。官方也直說：要不要在多輪中保留 reasoning trace，由你依用途決定。

> **Reasoning prompt**: The reasoning prompt is given in the system prompt.

> We highly recommend including the following system prompt for the best results, you can edit and customise it if needed for your specific use case.

**官方系統提示（逐字）**：

```
First draft your thinking process (inner monologue) until you arrive at a response. Format your response using Markdown, and use LaTeX for any mathematical equations. Write both your thoughts and the response in the same language as the input.

Your thinking process must follow the template below:[THINK]Your thoughts or/and draft, like working through an exercise on scratch paper. Be as casual and as long as you want until you are confident to generate the response. Use the same language as the input.[/THINK]Here, provide a self-contained response.
```

> The `[THINK]` and `[/THINK]` are special tokens that **must** be encoded as such.

> We invite you to choose, depending on your use case and requirements, between keeping reasoning traces during multi-turn interactions or keeping only the final assistant response.

**取樣參數**：

> Please make sure to use: `top_p`: 0.95 / `temperature`: 0.7 / `max_tokens`: 131072

> **Context Window:** A 128k context window. Performance *might* degrade past **40k** but Magistral should still give good results.

- URL：https://huggingface.co/mistralai/Magistral-Small-2509
- 適用模型：Magistral Small / Medium 1.2

### E2. Ministral 3 Reasoning：把官方 system prompt 附加在你自己的 system prompt 上

**中文摘要**：官方作法是「官方 system prompt ＋ 你自己的 system prompt」疊加。另外三條很值得教：**多輪要保留 reasoning trace**（與 Qwen「不要保留」相反）、**溫度 0.7**、**工具數量要控制在最少必要**。

> System Prompt: Use our provided system prompt, and append it to your custom system prompt to define a clear environment and use case, including guidance on how to effectively leverage tools in agentic systems.

> Multi-turn Traces: We highly recommend keeping the reasoning traces in context.

> Sampling Parameters: Use a **temperature of 0.7** for most environments ; Different temperatures may be explored for different use cases - developers are encouraged to experiment with alternative settings.

> Tools: Keep the set of tools well-defined and limit their number to the minimum required for the use case - Avoiding overloading the model with an excessive number of tools.

> Vision: When deploying with vision capabilities, we recommend maintaining an aspect ratio close to 1:1 (width-to-height) for images. Avoiding the use of overly thin or wide images - crop them as needed to ensure optimal performance.

**官方 SYSTEM_PROMPT.txt（逐字全文）**：

```
# HOW YOU SHOULD THINK AND ANSWER

First draft your thinking process (inner monologue) until you arrive at a response. Format your response using Markdown, and use LaTeX for any mathematical equations. Write both your thoughts and the response in the same language as the input.

Your thinking process must follow the template below:[THINK]Your thoughts or/and draft, like working through an exercise on scratch paper. Be as casual and as long as you want until you are confident to generate the response to the user.[/THINK]Here, provide a self-contained response.
```

- URL：https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512 ；https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512/blob/main/SYSTEM_PROMPT.txt
- 適用模型：Ministral 3（3B / 8B / 14B）Reasoning 2512

### E3. Mistral Large 3（非推理旗艦）：溫度建議 < 0.1

**中文摘要**：與推理模型 0.7 形成明顯對比——日常與正式環境建議溫度**低於 0.1**，創意用途才調高。

> **System Prompt**: Define a clear environment and use case, including guidance on how to effectively leverage tools in agentic systems.

> **Sampling Parameters**: Use a temperature below 0.1 for daily-driver and production environments ; Higher temperatures may be explored for creative use cases - developers are encouraged to experiment with alternative settings.

- URL：https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512
- 適用模型：Mistral Large 3 Instruct 2512

---

## F. 大廠比較觀察（供關卡設計參考）

1. **「What to Avoid」整節**（B）在四大廠沒有等價章節，尤其：
   - **不要叫 LLM 數字數 → 把 charCount 當輸入資料**（B3）
   - **矛盾指令 → 改寫成決策樹**（B2）
   - **評分要用文字級距而非數字級距**（B5）
2. **分類任務的兩種策略與取捨**（C1）非常適合做成「兩個都對、但這關的素材適合哪一個」的題型。
3. **推理模型的 system prompt 立場與 DeepSeek 完全相反**（E1 vs. deepseek.md A2）；**多輪是否保留 reasoning trace 又與 Qwen 相反**（E2 vs. qwen.md C4）——三家對照可以做成一整關。
4. **temperature=0 也不保證完全確定**（D1）是很誠實、可教的細節。
5. **工具數量要壓到最少**（E2）是 agentic prompt 少見的明文建議。

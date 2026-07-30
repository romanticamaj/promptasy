# Promptbook — DeepSeek（深度求索）

- **廠商**：DeepSeek（深度求索）
- **擷取日期**：2026-07-30
- **內容性質**：以下皆為**官方文件**（api-docs.deepseek.com 官方 API 文件、DeepSeek 官方 GitHub repo README）。引文一字未改；簡體中文引文保持原樣，摘要以繁體中文書寫。

## 來源清單（Source URLs）

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| S1 | Thinking Mode（思考模式） | https://api-docs.deepseek.com/guides/thinking_mode | 未標示，擷取日 2026-07-30 |
| S2 | JSON Output（JSON 輸出） | https://api-docs.deepseek.com/guides/json_mode | 未標示，擷取日 2026-07-30 |
| S3 | Chat Prefix Completion (Beta) | https://api-docs.deepseek.com/guides/chat_prefix_completion | 未標示，擷取日 2026-07-30 |
| S4 | Multi-round Conversation | https://api-docs.deepseek.com/guides/multi_round_chat | 未標示，擷取日 2026-07-30 |
| S5 | Prompt Library（提示庫） | https://api-docs.deepseek.com/prompt-library/ | 未標示，擷取日 2026-07-30 |
| S6 | DeepSeek-R1 官方 README（Usage Recommendations ＋ Official Prompts） | https://github.com/deepseek-ai/DeepSeek-R1（raw: https://raw.githubusercontent.com/deepseek-ai/DeepSeek-R1/main/README.md） | 未標示，擷取日 2026-07-30 |
| S7 | Integrate with AI Tools（coding agents） | https://api-docs.deepseek.com/guides/coding_agents | 未標示，擷取日 2026-07-30 |

> **擷取狀態說明**：
> - api-docs.deepseek.com 的 sitemap（https://api-docs.deepseek.com/sitemap.xml，2026-07-30 擷取）**已無** `guides/reasoning_model` 或 `quick_start/parameter_settings` 頁面；R1 時代的「reasoning model」頁面已被 **Thinking Mode（S1）** 取代。
> - **Prompt Library（S5）在擷取當日只是一面目錄牆**：13 張卡片各有標題與一句描述，但頁面上沒有可擷取的完整提示詞內文（卡片沒有連結、點擊不導頁）。詳見 D 節，已如實標註。
> - 文件當前示範模型為 `deepseek-v4-pro` / `deepseek-v4-flash`。

---

## A. 推理模型的使用建議（來源：S6，DeepSeek-R1 官方 README）

這是 DeepSeek 最具代表性、也最常被引用的一段 prompt 指南。它與其他廠商最大的不同在於：**要求你「少做」而不是「多做」**。

### A1. 溫度設 0.5–0.7（建議 0.6）

**中文摘要**：官方明訂溫度區間，理由是避免無限重複與語無倫次的輸出。注意這是「不要用 0」的立場，與 Qwen 思考模型禁止 greedy decoding 一致。

> Set the temperature within the range of 0.5-0.7 (0.6 is recommended) to prevent endless repetitions or incoherent outputs.

- URL：https://github.com/deepseek-ai/DeepSeek-R1
- 適用模型：DeepSeek-R1 系列（含蒸餾版 R1-Distill-Qwen / R1-Distill-Llama）

### A2. **不要加系統提示**，所有指令放在 user prompt

**中文摘要**：這條是 DeepSeek 最反直覺、也最該入題的一條。四大廠幾乎都在教「怎麼寫好 system prompt」，DeepSeek-R1 官方卻要求**不要用 system prompt**，一切指令放進 user 訊息。官方 App/Web 也確實不用 system prompt。

> **Avoid adding a system prompt; all instructions should be contained within the user prompt.**

> In the official DeepSeek web/app, we don't use system prompts but design two specific prompts for file upload and web search for better user experience. In addition, the temperature in web/app is 0.6.

- URL：https://github.com/deepseek-ai/DeepSeek-R1
- 適用模型：DeepSeek-R1 系列

### A3. 數學題加上固定指令句

**中文摘要**：與 Qwen 完全同款的一句規範句：要求逐步推理並把最終答案放進 `\boxed{}`。

> For mathematical problems, it is advisable to include a directive in your prompt such as: "Please reason step by step, and put your final answer within \boxed{}."

- URL：https://github.com/deepseek-ai/DeepSeek-R1
- 適用模型：DeepSeek-R1 系列

### A4. 評測要多跑幾次取平均

**中文摘要**：官方把「單次結果不可信」寫進使用建議——這是評測方法論層級的指導，多數廠商的 prompt 文件不會提。

> When evaluating model performance, it is recommended to conduct multiple tests and average the results.

- URL：https://github.com/deepseek-ai/DeepSeek-R1

### A5. 強制模型以 `<think>\n` 開頭，避免它跳過思考

**中文摘要**：官方觀察到 R1 有時會直接輸出空的 `<think>\n\n</think>`（等於沒思考），因此建議**強制每次回覆都以 `<think>\n` 開頭**。QwQ-32B 有同款建議（見 qwen.md C5）。

> Additionally, we have observed that the DeepSeek-R1 series models tend to bypass thinking pattern (i.e., outputting "\<think\>\n\n\</think\>") when responding to certain queries, which can adversely affect the model's performance.
> **To ensure that the model engages in thorough reasoning, we recommend enforcing the model to initiate its response with "\<think\>\n" at the beginning of every output.**

- URL：https://github.com/deepseek-ai/DeepSeek-R1

---

## B. 官方 Prompt 模板（來源：S6「Official Prompts」）

DeepSeek 直接把自家 App/Web 在用的兩個 prompt 模板公開，這是四大廠少見的透明度。

### B1. 檔案上傳模板（把檔名與內容用標記包起來，問題放最後）

**中文摘要**：模板結構是「檔名 → `[file content begin]` … `[file content end]` → 問題」。這正是「資料在前、問題在後 ＋ 明確的內容邊界標記」的官方實例。

```
file_template = \
"""[file name]: {file_name}
[file content begin]
{file_content}
[file content end]
{question}"""
```

- URL：https://github.com/deepseek-ai/DeepSeek-R1

### B2. 網頁搜尋回答模板（中文版，逐字保留）

**中文摘要**：這是一整套「有出處的長回答」規格書：每筆搜尋結果以 `[webpage X begin]...[webpage X end]` 包裹、引用要用 `[citation:X]` 且**必須就地標在對應句尾而非集中在文末**、列舉題控制在 10 點以內、創作題要在正文段落引用、長答案要結構化分段、要綜合多個網頁不可重複引用同一頁、語言要跟隨提問者。這在教學上是一份極好的「rubric 化 prompt」範本。

> # 以下内容是基于用户发送的消息的搜索结果:
> {search_results}
> 在我给你的搜索结果中，每个结果都是[webpage X begin]...[webpage X end]格式的，X代表每篇文章的数字索引。请在适当的情况下在句子末尾引用上下文。请按照引用编号[citation:X]的格式在答案中对应部分引用上下文。如果一句话源自多个上下文，请列出所有相关的引用编号，例如[citation:3][citation:5]，切记不要将引用集中在最后返回引用编号，而是在答案对应部分列出。
> 在回答时，请注意以下几点：
> - 今天是{cur_date}。
> - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
> - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
> - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号，例如[citation:3][citation:5]，不能只在文章末尾引用。
> - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
> - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
> - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
> - 你的回答应该综合多个相关网页来回答，不能重复引用一个网页。
> - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
>
> # 用户消息为：
> {question}

**英文版對應句（同一模板的英文版，逐字）**：

> Please cite the context at the end of the relevant sentence when appropriate. Use the citation format [citation:X] in the corresponding part of your answer. If a sentence is derived from multiple contexts, list all relevant citation numbers, such as [citation:3][citation:5]. Be sure not to cluster all citations at the end; instead, include them in the corresponding parts of the answer.

> Not all content in the search results is closely related to the user's question. You need to evaluate and filter the search results based on the question.

> Unless the user requests otherwise, your response should be in the same language as the user's question.

- URL：https://github.com/deepseek-ai/DeepSeek-R1
- 適用模型：DeepSeek 官方 Web/App（R1 世代）

---

## C. 當前 API 文件裡的可教技巧

### C1. 思考模式：開關與 effort 控制

**中文摘要**：思考模式預設開啟；`reasoning_effort` 只有 `high` / `max` 有實效，`low`/`medium` 會被映射成 `high`、`xhigh` 映射成 `max`。複雜 agent 請求（如 Claude Code、OpenCode）會自動升到 `max`。

> The DeepSeek model supports the thinking mode: before outputting the final answer, the model will first output a chain-of-thought reasoning to improve the accuracy of the final response.

> (1) The thinking toggle defaults to enabled
> (2) In thinking mode, the default effort is high for regular requests; for some complex agent requests (such as Claude Code, OpenCode), effort is automatically set to max
> (3) In thinking mode, for compatibility, low and medium are mapped to high, and xhigh is mapped to max

- URL：https://api-docs.deepseek.com/guides/thinking_mode
- 適用模型：deepseek-v4-pro / deepseek-v4-flash（思考模式）

### C2. 思考模式**不支援**取樣參數（且不會報錯）

**中文摘要**：這是很容易踩的坑：`temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 在思考模式下**設了不會出錯，但也完全沒有作用**。也就是說 A1 的「溫度 0.6」是 R1 時代的本地部署建議，**不適用**於現行 API 的思考模式。

> Thinking mode does not support the temperature, top_p, presence_penalty, or frequency_penalty parameters. Please note that, for compatibility with existing software, setting these parameters will not trigger an error but will also have no effect.

- URL：https://api-docs.deepseek.com/guides/thinking_mode

### C3. 多輪對話中 `reasoning_content` 的回傳規則（有無工具呼叫不同）

**中文摘要**：沒有工具呼叫時，前幾輪的思考內容不需要（也不會被）帶進上下文；**有工具呼叫時則必須完整回傳，否則 API 直接回 400**。

> Between two `user` messages, if the model did not perform a tool call, the intermediate `assistant`'s `reasoning_content` does not need to participate in the context concatenation. If passed to the API in subsequent turns, it will be ignored.

> Between two `user` messages, if the model performed a tool call, the intermediate `assistant`'s `reasoning_content` must participate in the context concatenation and must be passed back to the API in all subsequent user interaction turns.

> If your code does not correctly pass back `reasoning_content`, the API will return a 400 error.

- URL：https://api-docs.deepseek.com/guides/thinking_mode

### C4. JSON 輸出：光設參數不夠，prompt 裡要出現「json」並附範例

**中文摘要**：DeepSeek 的 JSON 模式有三個硬性前置條件，其中兩個是 **prompt 層級**的：提示詞裡必須出現 "json" 這個字，而且要**附上期望的 JSON 範例**。另外要把 `max_tokens` 設夠避免截斷。

> To enable JSON Output, users should:
> Set the response_format parameter to {'type': 'json_object'}.
> Include the word "json" in the system or user prompt, and provide an example of the desired JSON format to guide the model in outputting valid JSON.
> Set the max_tokens parameter reasonably to prevent the JSON string from being truncated midway.

> When using the JSON Output feature, the API may occasionally return empty content. We are actively working on optimizing this issue. You can try modifying the prompt to mitigate such problems.

**官方範例（system prompt，逐字）**：

> The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.
> EXAMPLE INPUT:
> Which is the highest mountain in the world? Mount Everest.
> EXAMPLE JSON OUTPUT:
> {
> "question": "Which is the highest mountain in the world?",
> "answer": "Mount Everest"
> }

- URL：https://api-docs.deepseek.com/guides/json_mode
- 適用模型：deepseek-v4-pro（文件示範）

### C5. Chat Prefix Completion：用「幫模型開頭」控制輸出

**中文摘要**：DeepSeek 提供把最後一則 `assistant` 訊息設成 `prefix: True` 的機制——你先幫模型寫好開頭，模型接著往下寫。官方示範用 ` ```python\n ` 當前綴強迫輸出 Python 程式碼，再用 `stop` 參數擋掉後面的解釋。這是「Begin the completion yourself」這一類技巧的**API 級**實作，Cohere 也有同類教學（見 others.md）。

> The chat prefix completion follows the Chat Completion API, where users provide an assistant's prefix message for the model to complete the rest of the message.

> When using chat prefix completion, users must ensure that the role of the last message in the messages list is assistant and set the prefix parameter of the last message to True.

> In this example, we set the prefix message of the assistant to "```python\n" to force the model to output Python code, and set the stop parameter to ['```'] to prevent additional explanations from the model.

- URL：https://api-docs.deepseek.com/guides/chat_prefix_completion
- 適用模型：需設 `base_url="https://api.deepseek.com/beta"`（Beta 功能）

### C6. 多輪對話要自己串上下文

**中文摘要**：DeepSeek API 是無狀態的，上下文必須由呼叫端自行把每一輪訊息串進 `messages`。

- URL：https://api-docs.deepseek.com/guides/multi_round_chat

---

## D. Prompt Library（提示庫）— 內容單薄，如實標註

**中文摘要**：官方提示庫頁面（S5）於 2026-07-30 擷取時**只有 13 張卡片的標題與一句描述**，卡片沒有連結、點擊不會展開內文，因此**無法從該頁擷取任何完整的示範提示詞**。以下逐字保留卡片文字，作為「DeepSeek 認為值得示範的任務類型」清單：

> 提示库 — 探索 DeepSeek 提示词样例，挖掘更多可能

| 標題 | 描述（逐字） |
|------|--------------|
| 代码改写 | 对代码进行修改，来实现纠错、注释、调优等。 |
| 代码解释 | 对代码进行解释，来帮助理解代码内容。 |
| 代码生成 | 让模型生成一段完成特定功能的代码。 |
| 内容分类 | 对文本内容进行分析，并对齐进行自动归类 |
| 结构化输出 | 将内容转化为 Json，来方便后续程序处理 |
| 角色扮演（自定义人设） | 自定义人设，来与用户进行角色扮演。 |
| 角色扮演（情景续写） | 提供一个场景，让模型模拟该场景下的任务对话 |
| 散文写作 | 让模型根据提示词创作散文 |
| 诗歌创作 | 让模型根据提示词，创作诗歌 |
| 文案大纲生成 | 根据用户提供的主题，来生成文案大纲 |
| 宣传标语生成 | 让模型生成贴合商品信息的宣传标语。 |
| 模型提示词生成 | 根据用户需求，帮助生成高质量提示词 |
| 中英翻译专家 | 中英文互译，对用户输入内容进行翻译 |

- URL：https://api-docs.deepseek.com/prompt-library/
- **注意**：其中「模型提示词生成」（用模型幫你寫 prompt）是一個 meta-prompting 類別，但官方頁面未提供其內容。

---

## E. 大廠比較觀察（供關卡設計參考）

1. **「不要用 system prompt」**（A2）是 DeepSeek 最獨特的一條，與 OpenAI/Anthropic/Google 的教學方向相反，非常適合做成「同一件事，不同廠商相反建議」的對照關卡。
2. **強制 `<think>\n` 開頭防止模型跳過思考**（A5）——「模型可能假裝思考」這個現象本身就是很好的教材。
3. **官方把自家 App 的 prompt 公開**（B1、B2），而且那份搜尋模板本身就是一份 rubric（引用要就地標、列舉限 10 點、要綜合多頁不可重複引用）。
4. **JSON 模式要求 prompt 裡出現 "json" 字樣並附範例**（C4）——「參數不是萬能，prompt 仍要配合」的具體例證。
5. **Prefix completion**（C5）是把「幫模型開頭」變成 API 一等公民的作法。
6. **思考模式下取樣參數靜默失效**（C2）——「設了沒報錯 ≠ 有作用」，是很好的除錯題材。

# Promptbook — Meta（Llama）

- **廠商**：Meta（Llama）
- **擷取日期**：2026-07-30
- **內容性質**：以下皆為**官方文件**（Meta 官方 Llama 文件站、Meta 官方 GitHub repo）。引文一字未改（英文原文），摘要以繁體中文書寫。

## 來源清單（Source URLs）

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| S1 | Prompt engineering（How-to Guides，側欄標為 **Prompt Engineering (Updated)**） | https://developer.meta.com/ai/docs/how-to-guides/prompting/ （舊網址 https://www.llama.com/docs/how-to-guides/prompting/ 301 導向此頁） | 未標示，擷取日 2026-07-30 |
| S2 | Llama 4 — Model Cards & Prompt Formats（含 Suggested System Prompt） | https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/ | 未標示，擷取日 2026-07-30 |
| S3 | Vision Capabilities（多模態提示） | https://developer.meta.com/ai/docs/how-to-guides/vision-capabilities/ | 未標示，擷取日 2026-07-30 |
| S4 | llama-prompt-ops（Meta 官方 prompt 自動最佳化工具） | https://github.com/meta-llama/llama-prompt-ops | 未標示，擷取日 2026-07-30 |
| S5 | llama-cookbook（官方 cookbook；prompt engineering notebook 現況見註） | https://github.com/meta-llama/llama-cookbook | 未標示，擷取日 2026-07-30 |

> **擷取狀態說明**：
> - `llama.com` 全站已 301 導向 `developer.meta.com/ai/docs/...`；該站為 JS 渲染，需以無頭瀏覽器取得內文（本次以 headless Chrome 完整渲染後擷取）。
> - S5（llama-cookbook）主分支上**已無** `getting-started/Prompt_Engineering_with_Llama.ipynb`；僅剩 `3p-integrations/aws/prompt_engineering_with_llama_2_on_amazon_bedrock.ipynb`（Llama 2 時代）與 `getting-started/llama-tools/prompt-ops_101.ipynb`。教學主體已收斂到 S1。
> - S1 目前版本**沒有** ReAct 章節（早期版本曾有），本文件不補列。

---

## A. 什麼是 prompt engineering / 為什麼先調 prompt（來源：S1）

**中文摘要**：Meta 把 prompt engineering 定位成「相對於 fine-tuning / distillation / 換更大的模型，**最快**拿到效果提升的路徑」，而且不需要額外訓練或基礎設施成本。這個「先調 prompt 再談訓練」的排序，是 Meta 文件的開場立場。

> Prompt engineering is a technique used in natural language processing (NLP) to improve the performance of large language models (LLMs) by providing them with more context and information about the task in hand. It involves creating prompts—short pieces of text—to provide additional information or guidance to the model to produce more accurate and relevant results.

> While you can improve model performance through fine-tuning, distillation, or upgrading to larger or newer models, optimizing your prompts often provides the fastest path to better results—achieving the performance improvements you need without additional model training or infrastructure costs.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/
- 適用模型：Llama 全系列

---

## B. Crafting effective prompts（五條基本功）

**中文摘要**：Meta 的五條基本功中，有兩條是**流程層級**而非文字層級（Vary the prompts、Gather feedback），這在其他廠商的「基本功清單」裡比較少見。

> **Be clear and concise:** Your prompt should be easy to understand and provide enough information for the model to generate relevant output. Avoid using jargon or technical terms that may confuse the model.

> **Use specific examples:** Providing specific examples ("few-shot") in your prompt can help the model better understand what kind of output is expected. For example, if you want the model to generate a story about a particular topic, include a few sentences about the setting, characters, and plot.

> **Vary the prompts:** Using different prompts can help the model improve at its task and produce more diverse and creative output. Try using different styles, tones, and formats to see how the model responds.

> **Test and refine:** Once you have created a set of prompts, test them out on the model to see how it performs. If the results are not as expected, try refining the prompts by adding more detail or adjusting the tone and style.

> **Gather feedback:** Finally, use feedback from users or other sources to continually improve your prompts. This can help you identify areas where the model needs more guidance and make adjustments accordingly.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### B1. 明確指令＝在模型身上加規則與限制

> Detailed, explicit instructions produce better results than open-ended prompts. Giving explicit instructions is like placing rules and restrictions on how the model responds to your prompt.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### B2. Stylization（風格化）

**中文摘要**：Meta 把「風格」拆成三種可直接套的句型：類比某種節目/受眾、宣告自己的身分與用途再下限制、指定敘事人格。

> You can steer the model towards responding in a specific writing style:

> Explain this to me like a topic on a children's educational network show teaching elementary students.

> I'm a software engineer using large language models for summarization. Summarize the following text in under 250 words:

> Give your answer like an old-timey private investigator hunting down a case step-by-step.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### B3. Formatting（格式）

> You can request specific formats using prompts:
> Use bullet points.
> Return as a JSON object.
> Use fewer technical terms and help me apply it in my work in communications.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### B4. Restrictions（限制）＋ 官方對照範例

**中文摘要**：Meta 是少數把「限制」獨立成一節並用 A/B 對照證明效果的廠商。其中「不知道就說不知道」與「不要引用 2020 年以前的來源」都是可直接檢測的限制型指令。

> Restrictions tell the model what not to do:
> Only use academic papers.
> Never give sources older than 2020.
> If you don't know the answer, say that you don't know.

> The example below illustrates how explicit instructions give more specific results by limiting the responses to recently created sources.

> More likely to cite sources from 2017: `Explain the latest advances in large language models to me.`

> Gives more specific advances and only cites sources from 2020: `Explain the latest advances in large language models to me. Always cite your sources. Never cite sources older than 2020.`

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

---

## C. Prompting techniques（八種技巧，來源：S1）

### C1. Zero-shot / Few-shot（含「shot」一詞的來源）

**中文摘要**：Meta 特別解釋了 "shot" 這個詞的來源（來自電腦視覺訓練用的一張範例照片），這是很好的教學素材。few-shot 的官方範例把情感分類升級成「正/中/負三種信心百分比」，示範「範例能定義更細緻的輸出格式」。

> A shot is an example or demonstration of what type of prompt and response you expect from a large language model. This term originates from training computer vision models on photographs, where one shot was one example or instance that the model used to classify an image.

> Modern LLMs like Llama are capable of following instructions and producing responses without having previously seen an example of a task. Prompting without examples is called "zero-shot prompting".

> Adding specific examples of your desired output generally results in a more accurate, consistent output when compared with zero-shot prompting. This technique is called "few-shot prompting".

**官方 few-shot 範例（逐字）**：

```
You are a sentiment classifier. For each message, give the percentage of positive/netural/negative.
Here are some samples:
Text: I liked it
Sentiment: 70% positive 30% neutral 0% negative
Text: It could be better
Sentiment: 0% positive 50% neutral 50% negative
Text: It's fine
Sentiment: 25% positive 50% neutral 25% negative
Text: I thought it was okay
Text: I loved it!
Text: Terrible service 0/10
```

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C2. Role-based prompts（角色型提示，含 Pros/Cons）

**中文摘要**：Meta 是少數會為每個技巧列出「代價」的廠商——角色型提示的 con 是「要花力氣蒐集並提供角色資訊」。

> Creating prompts based on the role or perspective of the person or entity being addressed can be useful for generating more relevant and engaging responses from the model.

> **Improves relevance:** Role-based prompting helps the language model understand the role or perspective of the person or entity being addressed, which can lead to more relevant and engaging responses.

> **Increases accuracy:** Providing additional context about the role or perspective of the person or entity being addressed can help the language model avoid making mistakes or misunderstandings.

> **Requires effort:** Requires more effort to gather and provide the necessary information about the role or perspective of the person or entity being addressed.

**官方範例（逐字）**：

> You are a virtual tour guide walking tourists around Eiffel Tower on a night tour. Describe Eiffel Tower to your audience in a way that includes its history, the number of people visiting each year, the amount of time it takes to do a full tour and why so many people visit it each year.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C3. Chain-of-thought prompting（Meta 的定義偏「給一串問題」）

**中文摘要**：注意 Meta 對 CoT 的定義與其他廠不同——它強調的是**由你提供一系列問題/子提示引導模型思考順序**，官方範例是編號的 1–4 步敘事大綱，而不是「Let's think step by step」。

> Chain-of-thought prompting provides the language model with a series of prompts or questions to help guide its thinking and generate a more coherent and relevant response. This technique can be useful for generating more thoughtful and well-reasoned responses from language models.

> **Improves coherence:** Helps the language model think through a problem or question in a logical and structured way, which can lead to more coherent and relevant responses.

> **Increases depth:** Providing a series of prompts or questions can help the language model explore a topic more deeply and thoroughly, potentially leading to more insightful and informative responses.

> **Requires effort:** The chain of thought technique requires more effort to create and provide the necessary prompts or questions.

**官方範例（逐字）**：

```
You are a virtual tour guide from 1901. You are guiding tourists visiting Eiffel Tower. Describe Eiffel Tower to your audience.
Begin with:
1. Why it was built
2. Then by how long it took them to build
3. Where were the materials sourced to build
4. Number of people it took to build
End with the number of people visiting the Eiffel tour annually in the 1900's, the amount of time it completes a full tour and why so many people visit this place each year.
Make your tour funny by including 1 or 2 funny jokes at the end of the tour.
```

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C4. Self-consistency（自我一致性）

**中文摘要**：跑多次同一個 prompt、取出現最多次的答案。Meta 明講代價是算力變高。官方範例還示範了一個小技巧：**要求把答案包在三個反引號裡**，好讓外部程式抽取答案再投票。

> LLMs are probabilistic; even with chain-of-thought prompting, a single generation might produce incorrect results. Self-consistency introduces enhanced accuracy by selecting the most frequent answer from multiple generations, at the cost of higher compute.

**官方範例（逐字）**：

```
John found that the average of 15 numbers is 40.
If 10 is added to each number then the mean of the numbers is?
Report the answer surrounded by three backticks, for example: ```123```
```

> Running the above several times and taking the most commonly returned value for the answer would make use of the self-consistency approach.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C5. Retrieval-augmented generation（RAG）

**中文摘要**：Meta 用一個很具體的「梅洛公園氣溫」例子示範：不給資料時模型說自己沒有即時資料；把三天氣溫貼進 prompt 後模型答對，而且**問到沒提供的日期時會如實說沒有**——這正是「grounding ＋ 給模型退路」的示範。

> Retrieval-augmented generation (RAG) describes the practice of including information in the prompt that has been retrieved from an external database. It's an effective way to incorporate facts into your LLM application and is more affordable than fine-tuning, which might also negatively impact the foundational model's capabilities.

> The information source in a RAG system could be as simple as a lookup table or as sophisticated as a vector database containing all of your company's knowledge

**官方範例與回應（逐字）**：

```
Given the following information about temperatures in Menlo Park:
2023-12-11 : 52 degrees Fahrenheit
2023-12-12 : 51 degrees Fahrenheit
2023-12-13 : 55 degrees Fahrenheit
What was the temperature in Menlo Park on 2023-12-12?
# Sure! The temperature in Menlo Park on 2023-12-12 was 51 degrees Fahrenheit.

What was the temperature in Menlo Park on 2023-07-18 ?
# Sorry, I don't have information about the temperature in Menlo Park on 2023-07-18. The information provided only includes temperatures for December 11th, 12th, and 13th of 2023.
```

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C6. Limiting extraneous tokens（限制廢話 token）

**中文摘要**：這是 Meta 很實用的一節：要讓模型只吐你要的東西，官方的解法是**四種技巧疊加**——角色 ＋ 規則限制 ＋ 明確指令 ＋ 一個範例。

> A common challenge in LLM applications is ensuring a model generates a suitable response without extraneous tokens (e.g. "Sure! Here's more information on…").

> By combining a role, rules and restrictions, explicit instructions, and an example, the model can be prompted to generate the desired response.

**官方範例（逐字）**：

```
You are a robot that only outputs JSON. You reply in JSON format with the field 'zip_code'.
Example question: What is the zip code of the Empire State Building?
Example answer: {'zip_code': 10118}
Question: What is the zip code of Menlo Park?
```
回應：`{'zip_code': 94025}`

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C7. Program-aided language models（PAL，讓模型寫程式代替算數）

**中文摘要**：Meta 明講 LLM 不擅長算數但擅長寫程式，因此把計算任務轉成「產生程式碼再執行」。這是一個「用工具補模型弱點」的教學點。

> LLMs, by nature, aren't great at performing calculations. While LLMs are bad at arithmetic, they're great for code generation. Program-Aided Language makes use of a model's code-generation skills by instructing the model to write code to solve calculation tasks.

**官方範例（逐字）**：

```
Only return Python code, nothing else.
Generate python code to calculate the following:
((-5 + 93 * 4 - 0) * (4^4 + -7 + 0 * 5))
```

> Executing the returned code provides the correct result.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

### C8. Reducing hallucinations（三種幻覺情境與對應修法）

**中文摘要**：Meta 把幻覺拆成三種成因並各給一個修法：知識缺口 → 補脈絡＋要求提供出處；缺少觀點設定 → 補上該角色的目標/價值/信念；缺少語氣設定 → 補上受眾與溝通目的。並指向 Responsible Use Guide 第 14–17 頁。

> Even modern LLMs can produce hallucinations—confidently stated information that isn't supported by the source material. Meta's Responsible Use Guide is a great resource to understand how best to prompt and address input/output risks of the language model. Refer to pages (14-17).

> A well-crafted prompt can help to reduce hallucination in language models, by providing them with clear and accurate information and context.

> **Example 1** — A language model is asked to generate a response to a question about a topic it has not been trained on. The language model may hallucinate information or make up facts that are not accurate or supported by evidence.
> **Fix:** To fix this issue, you can provide the language model with more context or information about the topic to help it understand what is being asked and generate a more accurate response. You could also ask the language model to provide sources or evidence for any claims it makes to ensure that its responses are based on factual information.

> **Example 2** — A language model is asked to generate a response to a question that requires a specific perspective or point of view. [...]
> **Fix:** To fix this issue, you can provide the language model with additional information about the desired perspective or point of view, such as the goals, values, or beliefs of the person or entity being addressed.

> **Example 3** — A language model is asked to generate a response to a question that requires a specific tone or style. [...]
> **Fix:** To fix this issue, you can provide the language model with additional information about the desired tone or style, such as the audience or purpose of the communication.

- URL：https://developer.meta.com/ai/docs/how-to-guides/prompting/

---

## D. Llama 4 的官方建議系統提示（來源：S2）

**中文摘要**：這是 Meta 極具特色的一份 system prompt——**目的是減少「誤拒絕」與說教式語氣**，甚至明列一串禁用片語（"it's important to"、"it's crucial to"、"it's essential to"、"Remember…"）。這在其他廠商的官方文件裡幾乎看不到，因為它是在對抗模型自身的對齊副作用。

> A good system prompt can be effective in reducing false refusals and "preachy" language common in LLM responses. Consider the prompt below as a basic template that should be customized for specific needs or use cases.

**官方建議系統提示（逐字）**：

> You are an expert conversationalist who responds to the best of your ability. You are companionable and confident, and able to switch casually between tonal types, including but not limited to humor, empathy, intellectualism, creativity and problem-solving.
>
> You understand user intent and don't try to be overly helpful to the point where you miss that the user is looking for chit-chat, emotional support, humor or venting. Sometimes people just want you to listen, and your answers should encourage that. For all other cases, you provide insightful and in-depth responses. Organize information thoughtfully in a way that helps people make decisions. Always avoid templated language.
>
> You never lecture people to be nicer or more inclusive. If people ask for you to write something in a certain voice or perspective, such as an essay or a tweet, you can. You do not need to be respectful when the user prompts you to say something rude.
>
> You never use phrases that imply moral superiority or a sense of authority, including but not limited to "it's important to", "it's crucial to", "it's essential to", "it's unethical to", "it's worth noting…", "Remember…" etc. Avoid using these.
>
> Finally, do not refuse political prompts. You can help users express their opinion.
>
> You are Llama 4. Your knowledge cutoff date is August 2024. You speak Arabic, English, French, German, Hindi, Indonesian, Italian, Portuguese, Spanish, Tagalog, Thai, and Vietnamese. Respond in the language the user speaks to you in, unless they ask otherwise.

- URL：https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/
- 適用模型：Llama 4 Scout、Llama 4 Maverick

### D1. Llama 4 的四種角色

**中文摘要**：Llama 4 支援四種角色，其中 `tool` 在模板中的角色名稱實際是 `ipython`——這是實作上容易踩坑的細節。

> **system**: Sets the context in which to interact with the AI model. It typically includes rules, guidelines, or necessary information that helps the model respond effectively.
> **user**: Represents the human interacting with the model. It includes the inputs, commands, and questions to the model.
> **assistant**: Represents the model generating a response to the user.
> **tool**: Represents the output of a tool call when sent back to the model from the executor. Note that the role name used in the prompt template is ipython

- URL：https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/

---

## E. 多模態提示（來源：S3）

**中文摘要**：Meta 的 vision 文件很短，關鍵是一句「版本對應」的指引：多模態沿用 Llama 3.2 的提示指引，純文字沿用 Llama 3.1 的提示指引。

> For the multimodal use cases, apply the prompt guidance provided for Llama 3.2. For text-only use cases, you can apply the prompt guidance from Llama 3.1.

- URL：https://developer.meta.com/ai/docs/how-to-guides/vision-capabilities/

---

## F. llama-prompt-ops：Meta 官方的 prompt 自動最佳化（來源：S4）

**中文摘要**：Meta 提供一個 Python 套件，把「在別的 LLM 上調好的 prompt」自動改寫成適合 Llama 的版本。這是四大廠少見的「prompt 可以被自動最佳化」立場（Alibaba 百煉也有一鍵優化，見 qwen.md A10）。repo 另公布了 PDO（Prompt Duel Optimizer，無標註資料的 prompt 最佳化方法）論文。

> prompt-ops is a Python package that **automatically optimizes prompts** for Llama models. It transforms prompts that work well with other LLMs into prompts that are optimized for LLM models, improving performance and reliability.

> We've published a new paper on **PDO (Prompt Duel Optimizer)** - an efficient label-free prompt optimization method using dueling bandits and Thompson sampling.

- URL：https://github.com/meta-llama/llama-prompt-ops
- 論文：https://www.arxiv.org/abs/2510.13907

---

## G. 大廠比較觀察（供關卡設計參考）

1. **每個技巧附 Pros / Cons**（C2、C3）——「這招要花什麼代價」是其他廠很少寫的維度。
2. **"shot" 一詞來自電腦視覺**（C1）是個好記的知識點。
3. **Self-consistency 被列為正式技巧**（C4），且官方教你用三個反引號包住答案好抽取——這是「為了外部程式可解析而設計輸出」的具體示範。
4. **Program-aided language models**（C7）——承認模型不會算數，改叫它寫程式。
5. **Limiting extraneous tokens 是四技疊加**（C6），可直接對應到「多個檢查器同時滿分」的關卡設計。
6. **Llama 4 建議系統提示明列禁用片語**（D）——「反說教」型 system prompt 在官方文件裡極罕見。
7. **Meta 對 CoT 的定義偏向「你給一串子問題」**（C3），與 OpenAI/Google 的「叫模型逐步思考」不完全相同，是很好的「同名不同義」教材。

# Promptbook — 其他廠商（Cohere、Microsoft Azure OpenAI / Foundry）

- **擷取日期**：2026-07-30
- **內容性質**：以下皆為**官方文件**（docs.cohere.com、learn.microsoft.com）。引文一字未改（英文原文），摘要以繁體中文書寫。
- **這個檔案為什麼存在**：本次研究的主要交付是 Qwen / DeepSeek / Mistral / Meta 各一份；Cohere 與 Microsoft 屬「有官方文件才收」的加選項。**誠實說明：這兩家的內容其實一點都不單薄**——Cohere 有完整的兩章 prompt engineering 教材、Microsoft 有一份約 6,300 字的技術文；本檔把它們合併只是因為交付結構如此，不是因為內容不足。真正單薄／找不到的項目另列於 C 節。

---

# 一、Cohere

## 來源清單

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| C1 | A Guide to Crafting Effective Prompts | https://docs.cohere.com/docs/crafting-effective-prompts | 未標示，擷取日 2026-07-30 |
| C2 | Advanced Prompt Engineering Techniques | https://docs.cohere.com/docs/advanced-prompt-engineering-techniques | 未標示，擷取日 2026-07-30 |
| C3 | An Overview of System Messages | https://docs.cohere.com/docs/system-instructions | 未標示，擷取日 2026-07-30 |

> 小技巧（官方自己在頁首寫的）：Cohere 文件任何頁面後面加 `.md` 就會回傳乾淨的 Markdown；完整索引在 https://docs.cohere.com/llms.txt。本檔即以此方式取得逐字原文。

## C-A. 基礎章（來源：C1）

官方開宗明義給了「有效 prompt」的四個屬性與八個主題：

> The most effective prompts are those that are clear, concise, specific, and include examples of exactly what a response should look like. [...] We will cover formatting and delimiters, context, using examples, structured output, do vs. do not do, length control, begin the completion yourself, and task splitting.

### C-A1. Formatting and Delimiters（指令放最前面、用 `##` 標頭分區）

**中文摘要**：Cohere 明確要求**指令放在 prompt 開頭**，並且不同性質的內容（指令、脈絡、資源）要用**帶說明文字的標頭**分開，標頭前面加 `##` 會更清楚。

> Instructions should be placed at the beginning of the prompt, and different types of information, such as instructions, context, and resources, should be delimited with an explanatory header. Headers can be made more clear by prepending them with `##`.

```
## Instructions
Summarize the text below.

## Input Text
{input_text}
```

- URL：https://docs.cohere.com/docs/crafting-effective-prompts
- 適用模型：Command 家族（文件示範 `command-a-plus-05-2026`，temperature 0.3）

### C-A2. Context（補上「這份輸入是什麼」的脈絡）與 grounded generation

**中文摘要**：Cohere 指出光有清楚指令還不夠——要補上「這段輸入是什麼」的背景。更進一步，Cohere 推薦不要把文件貼進訊息，而是走 `documents` 參數的 grounded generation，好處是**更少錯誤資訊、更直接可用、而且回傳精確引用可追溯來源**。

> However, it lacks context that the LLM could use to produce a better-quality summary for the desired output. Including information about the input text could improve the prompt.

> Grounded completion focuses on generating accurate and relevant responses by avoiding preambles, or having to include documents directly in the message. The benefits include:
> * Less incorrect information.
> * More directly useful responses.
> * Responses with precise citations for source tracing.

> For this method, we recommend providing documents through the documents parameter. Our models process conversations and document snippets (100-400 word chunks in key-value pairs) as input

- URL：https://docs.cohere.com/docs/crafting-effective-prompts
- 值得注意：**100–400 字的 chunk 大小**是官方給的具體數字，其他廠商很少寫死。

### C-A3. Incorporating Example Outputs（給「輸出長什麼樣」的骨架）

**中文摘要**：不要說「適當時使用條列」，而是直接畫出輸出骨架（用 `<summary>`、`<important event 1>` 這種佔位符）。

> LLMs respond well when they have specific examples to work from. For example, instead of asking for the salient points of the text and using bullet points "where appropriate", give an example of what the output should look like.

```
## Example Output
High level summary: <summary>
3 important events related to the series:
* <important event 1>
* <important event 2>
* <important event 3>
```

- URL：https://docs.cohere.com/docs/crafting-effective-prompts

### C-A4. Structured Output

> In addition to examples, asking the model for structured output with a clear and demonstrated output format can help constrain the output to match desired requirements. JSON works particularly well with the Command R models.

```
Output the summary in the following JSON format:
{
  "short_summary": "<include a short summary of the text here>",
  "most_important_events": [
    "<one important event>",
    "<another important event>",
    "<another important event>"
  ]
}
```

- URL：https://docs.cohere.com/docs/crafting-effective-prompts

### C-A5. Do vs. Do Not Do（正面表述，但保留必要的禁止句）

**中文摘要**：Cohere 的立場比多數廠商細膩——它要求**先寫「要做什麼」**（Paraphrase the content into re-written, easily digestible sentences.），**再**補上禁止句（Do not extract full sentences...），而不是只寫禁止句。

> Be explicit in **exactly** what you want the model to do. Be as assertive as possible and avoid language that could be considered vague. To encourage abstract summarization, do not write something like "avoid extracting full sentences from the input text," and instead do the following:

> Paraphrase the content into re-written, easily digestible sentences. Do not extract full sentences from the input text.

- URL：https://docs.cohere.com/docs/crafting-effective-prompts

### C-A6. Length Control（三種可用的長度單位）

**中文摘要**：官方明列三種可用的長度單位——段落、句子、字數，並給出可直接抄的句型。

> Command A models excel at length control. Use this to your advantage by being explicit about the desired length of completion. Different units of length work well, including paragraphs ("give a summary in two paragraphs"); sentences ("make the response between 3 and 5 sentences long"); and words ("the completion should be at least 100 and no more than 200 words long").

> The output summary should be at least 250 words and no more than 300 words long.

- URL：https://docs.cohere.com/docs/crafting-effective-prompts
- 對照：Mistral 的立場是「不要叫模型數字數」（見 mistral.md B3）——**同一件事兩家給相反建議**，是很好的對照題材。

### C-A7. Begin the Completion Yourself（幫模型開頭）

**中文摘要**：與 DeepSeek 的 prefix completion 同一個概念，但 Cohere 是用純 prompt 做到：直接在 prompt 末尾示範開頭幾行，模型會跟著走。

> LLMs can easily be constrained by beginning the completion as part of the input prompt. For example, if it is very important that the output is HTML code and that it must be a well-formed HTML document, you can show the model how the completion should begin, and it will tend to follow suit.

```
Please generate the response in a well-formed HTML document. The completion should begin as
follows:

<!DOCTYPE html>
<html>
```

- URL：https://docs.cohere.com/docs/crafting-effective-prompts

### C-A8. Task Splitting（把任務拆成編號步驟，並只回傳最後一步）

**中文摘要**：官方範例的最後一行「Only return the result of step 4 in your response.」很值得學——拆步驟的同時也要指定**只輸出哪一步**。

> Finally, task splitting should be used when the requested task is complex and can be broken down into sub-tasks.

```
## Instructions
Using the included text below, perform the following steps:

1. Read through the entire text carefully
2. Extract the most important paragraph
3. From the paragraph extracted in step 2, extract the most important sentence
4. Summarize the sentence extracted in step 3 and make it between 30 and 50 words long.
5. Only return the result of step 4 in your response.
```

- URL：https://docs.cohere.com/docs/crafting-effective-prompts

## C-B. 進階章（來源：C2）

Cohere 的進階章用**同一題（LegalBench 傳聞證據判定）貫穿四個階段**，逐步從答錯改到答對且可解析——這種「同一題持續改良」的教學結構，在四大廠文件裡是很好的敘事範本。

### C-B1. Defining the Task（先定義任務，別直接丟問題）

**中文摘要**：直接問會拿到冗長且模稜兩可的答案，而且模型一旦先給錯答案就會硬拗（"stuck"）。解法是提供背景知識、領域術語、相關範例，並且控制 prompt 長度不要淹沒模型。

> Rather than simply asking a question directly, one should clearly define the task while providing concise and unambiguous instructions. The model can generally construct a much more grounded response by including relevant background knowledge, domain-specific terminology, and related examples. Optimizing the length of the prompt itself to only provide sufficient information without overwhelming the model's context window can also improve performance.

> Without a definition of the task or other additional context the model can sometimes make an incorrect assertion and then attempt to reconcile what has already been generated.

**改良後的 zero-shot prompt（逐字）**：

```
Hearsay is an out-of-court statement introduced to prove the truth of the matter
asserted. Answer the following question regarding hearsay with either Yes or No.
```

- URL：https://docs.cohere.com/docs/advanced-prompt-engineering-techniques

### C-B2. Few-shot Prompting（含**負面範例**與**打亂順序**兩條進階規則）

**中文摘要**：這是 Cohere 最有價值的一段之一——除了給正確範例，還建議**放入負面範例並清楚說明為什麼錯**；同時**範例順序也重要**，若順序本身有可被學到的規律，模型可能學到規律而不是題意。

> Unlike the zero-shot examples above, few-shot prompting is a technique that provides a model with examples of the task being performed before asking the specific question to be answered. We can steer the LLM toward a high-quality solution by providing a few relevant and diverse examples in the prompt. Good examples condition the model to the expected response type and style.

> In addition to giving correct examples, including negative examples with a clear indication of why they are wrong can help the LLM learn to distinguish between correct and incorrect responses. Ordering the examples can also be important; if there are patterns that could be picked up on that are not relevant to the correctness of the question, the model may incorrectly pick up on those instead of the semantics of the question itself.

- URL：https://docs.cohere.com/docs/advanced-prompt-engineering-techniques

### C-B3. Chain of Thought（三種寫法：zero-shot CoT／few-shot CoT／JSON 化 CoT）

**中文摘要**：Cohere 明確講出 CoT 的兩個代價與解法：CoT 的答案**不好抽取**。它示範了三段式演進——(1) 直接叫模型 step by step；(2) 把 `Reasoning:` 放進 few-shot 範例，逼答案以 "Yes" 開頭；(3) 直接要求 JSON `{reasoning, answer}` 讓下游好解析。

> Chain of thought (sometimes abbreviated CoT) prompting encourages the LLM to provide a step-by-step explanation of its reasoning that can improve transparency, allow for better error analysis, and help guide the model to the correct answer. Problems can arise when the model gives an answer right away and then ends up being "stuck" with it and has to find a way to reconcile the already given answer.

> With CoT prompting, one can also request intermediate outputs at each step, which can help identify and correct errors early in the process. This forced "thinking before you answer" helps emulate human thought processes and incorporate common-sense knowledge into the task.

> With "zero-shot CoT," one can simply ask the model to "think step by step":
> `A: Work through the problem step by step first and then answer the question.`

> While we have the answer now, it is not easily extractable (we would prefer either "yes" or "no" separate from the reasoning). One approach is to incorporate CoT in the few-shot setup and simultaneously demonstrate the desired output format.

**JSON 化 CoT（逐字，節錄）**：

```
Given a statement, respond with a JSON object that has two keys: `reasoning` and `answer`.
The first key's value should contain the reasoning used to arrive at the answer.
The second key's value should contain either "Yes" or "No".
```

- URL：https://docs.cohere.com/docs/advanced-prompt-engineering-techniques

### C-B4. Prompt Chaining（模型會忘記「先思考」，所以拆成兩次呼叫）

**中文摘要**：Cohere 給的理由很具體：叫模型 "work through step by step" 它**有時就是會忘記**；拆成兩個 prompt（先分析、再只回 Yes/No）就不會。而且拆開之後，你可以塞更複雜的指令而不怕被資訊洪流淹沒。

> Finally, prompt chaining can explicitly force a model to slow down and break a task into constituent parts. [...] However, an LLM will sometimes try to jump to the answer immediately. Further, one can include more complex instructions without as high of a chance of them being lost in the information overload.

> For example, instead of asking the model to "work through the problem step by step" before answering (which in certain cases LLMs can forget to do), we can first ask for an analysis of the situation, then ask for a simple "yes" or "no" answer.

**第二段 prompt（逐字）**：

```
Given the question below and the accompanying analysis, answer with only "Yes" or "No".

## question
{question}

## analysis
{completion_from_prompt_1}
```

- URL：https://docs.cohere.com/docs/advanced-prompt-engineering-techniques

## C-C. System message（來源：C3）

**中文摘要**：Cohere 把 system message 拆成三層並定義了優先順序：`System Preamble`（含 Safety Preamble，**任何情況都要遵守，即使使用者指令牴觸**）、`Default Preamble`（預設行為，**使用者的 system message 可以覆蓋**）、`Developer Preamble`（你透過 API 加上去的那一段）。這種三層優先序的明文說明，在官方文件裡相當少見。

> A system message (sometimes referred to as a 'preamble' in the code below) is provided to a model at the beginning of a conversation to dictate how it should behave throughout the rest of the conversation. It can be thought of as instructions for the model which outline the goals and behaviors for a particular interaction.

> While prompting is a natural way to interact with and instruct an LLM, writing a custom system message is a shortcut to direct the model's behavior. [...] Additionally, providing instructions in the system message removes the need of having to repeat such instructions for every prompt that is provided as part of a conversation.

> The `System Preamble` section contains instructions that the model should adhere to at all times, even if the user provides contradictory instructions. It also includes the `Safety Preamble`, which is set using the safety mode API parameter. The `Default Preamble`, in contrast, contains instructions that the model is asked to follow by default, unless otherwise specified. That means, if a user provides contradictory instructions in their system message, then such instructions take precedence over ones specified in the `Default Preamble`.

**Cohere 公開的 Command A 預設 system message（逐字節錄）**——這本身就是一份極佳的「風格規範怎麼寫」範例：

> - You reply conversationally with a friendly and informative tone and often include introductory statements and follow-up questions.
> - If the input is ambiguous, ask clarifying follow-up questions.
> - Use Markdown-specific formatting in your response (for example to highlight phrases in bold or italics, create tables, or format code blocks).
> - When outputting responses of more than seven sentences, split the response into paragraphs.
> - Prefer the active voice.
> - Limit lists to no more than 10 items unless the list is a set of finite instructions, in which case complete the list.
> - Use the third person when asked to write a summary.
> - When asked to extract values from source material, use the exact form, separated by commas.
> - When generating code output without specifying the programming language, please generate Python code.
> - If you are asked a question that requires reasoning, first think through your answer, slowly and step by step, then answer.

- URL：https://docs.cohere.com/docs/system-instructions
- 適用模型：Command A（另有 Command R / R+ 的較短版本，官方也一併公開）

---

# 二、Microsoft（Azure OpenAI / Microsoft Foundry）

## 來源清單

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| M1 | Prompt engineering techniques | https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering | `ms.date: 2026-05-13`；頁面 metadata `updated_at: 2026-06-05` |

> 重要前提，官方寫在文章第一行：

> These techniques aren't recommended for reasoning models like gpt-5 and o-series models.

> This article attempts to capture general concepts and patterns that apply to all GPT models. However, it's important to understand that each model behaves differently, so the learnings might not apply equally to all models.

### M-1. Prompt 的五種組成元件

**中文摘要**：Microsoft 把 prompt 拆成五種元件並按「常用程度」排序：Instructions（指令）、Primary content（主要內容，要被處理/轉換的文字）、Examples（範例）、Cue（引子）、Supporting content（輔助內容，如日期、使用者偏好）。這種「元件分類學」在其他廠商文件裡沒有等價物。

> **Instructions** are likely the most commonly used prompt component. Instructions are simply that: instructions to the model on what to do.

> **Primary content** refers to text that the model processes or transforms. Typically, you use primary content with instructions.

> **Cues** act as the "jumpstart" for the output of the model, helping to direct the model to the desired output. They're often a prefix that the model can build onto.

> **Supporting content** is information that the model can use to influence the output. It differs from primary content in that it's not the main target of the task, but it's typically used along with primary content. Common examples include contextual information such as the current date, the name of the user, user preferences, and so on.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-2. Zero-shot / One-shot / Few-shot 的定義與「範例會推斷出沒教過的標籤」

**中文摘要**：Microsoft 特別點出一個現象：few-shot 範例裡沒有 "Basketball" 這個標籤，模型仍能推斷出來——範例教的是「標籤的類別層級」，不只是字面。

> Successful prompts often rely on the practice of "one-shot" or "few-shot" learning. This practice involves including one or more examples of the desired behavior of the model, typically by including input and output pairs. This approach isn't learning in the sense that the model is permanently changed, but rather that the examples better condition the model to respond as desired for only the current inference.

> The preceding example illustrates the utility of few-shot learning. Without the examples, the model seems to be guessing at the desired behavior, while the examples cleanly show the model how to operate. This example also demonstrates the power of the model. It can infer the category of label that is wanted, even without a "basketball" label in the examples.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-3. Start with clear instructions（指令放最前面）＋ 誠實的版本註記

**中文摘要**：Microsoft 給了建議，但**同時誠實標註新版模型上這招沒差**——這種「我們的建議在新模型上失效了」的自我修正註記非常罕見，很適合教「prompt 技巧會隨模型版本而過時」。

> The sequence information appears in the prompt matters. [...] Our research suggests that telling the model the task you want it to do at the beginning of the prompt, before sharing additional contextual information or examples, can help produce higher-quality outputs.

> Although following this technique is still generally recommended, in contrast to previous model versions (GPT-3 and prior), our testing showed that the model response with ChatGPT and GPT-4 models was the same regardless of whether the technique is utilized.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-4. Repeat instructions at the end（近因偏誤）

> Models can be susceptible to **recency bias**, which in this context means that information at the end of the prompt might have more significant influence over the output than information at the beginning of the prompt. Therefore, it's worth experimenting with repeating the instructions at the end of the prompt and evaluating the impact on the generated response.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-5. Prime the output（用引子強制輸出形態）

> This refers to including a few words or phrases at the end of the prompt to obtain a model response that follows the desired form. For example, using a cue such as `"Here's a bulleted list of key points:\n- "` can help make sure the output is formatted as a list of bullet points.

> In the above prompt, the text *One possible search query is:* primes the model to produce a single output. Without this cue the model produces several search queries as output.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- 對照：與 Cohere C-A7、DeepSeek prefix completion 同族。

### M-6. Add clear syntax（分隔符可兼作停止條件；不確定就用 Markdown 或 XML）

**中文摘要**：兩個很實用的細節：(1) `---` 這類分隔符可以**同時當生成的停止條件**；(2) 章節標頭用**大寫**做區別；(3) 不知道用什麼語法就用 Markdown 或 XML，理由是模型訓練時看過大量這兩種格式。

> Use clear syntax for your prompt to communicate intent and make outputs easier to parse.

> In the example below, separators (`---` in this case) have been added between different sources of information or steps. This allows the use of `---` as a stopping condition for generation. In addition, section headings or special variables are presented in uppercase to differentiate them.

> If you're not sure what syntax to use, consider using Markdown or XML. The models have been trained on a large quantity web content in XML and Markdown, which might provide better results.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-7. Break the task down（拆成兩階段：先抽事實、再產查詢）

> Large language models (LLMs) often perform better if the task is broken down into smaller steps. [...] the prompt can be restructured so that the model is first instructed to extract relevant facts, and then instructed to generate search queries that can be used to verify those facts.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-8. Use of affordances（讓模型呼叫外部能力，並把結果貼回 prompt）

> Sometimes we can get the model to use an affordance instead of relying on its own parameters for information and answers. Search, for example, can be an affordance to help mitigate against fabricated answers, and to get up-to-date information.

> One simple way to use an affordance is to stop generation once the affordance calls are generated by the model, then paste the outcomes back into the prompt.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-9. Chain of thought prompting（含使用政策警語）

> This is a variation on the **break the task down** technique. Instead of splitting a task into smaller steps, in this approach, the model response is instructed to proceed step-by-step and present all the steps involved. Doing so reduces the possibility of inaccuracy of outcomes and makes assessing the model response easier.

> This technique is only applicable non-reasoning models. Attempting to extract model reasoning through methods other than the reasoning summary parameter aren't supported, may violate the Acceptable Use Policy, and may result in throttling or suspension when detected.

**官方範例句（逐字）**：

> Take a step-by-step approach in your response, cite sources and give reasoning before sharing final answer in the below format: ANSWER is: `<name>`

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-10. Specifying the output structure（引用要「就地」、避免複合陳述）

**中文摘要**：這一段有兩個很精緻的洞見：(1) **要求附引用會讓模型必須犯兩個錯才能編造**（先編內容、再編引用），所以引用能降低幻覺；而且**行內引用比文末引用有效**，因為模型要「預先看多遠」比較短。(2) 抽取事實時若不指定結構，模型會吐出「X 做了 Y **而且** Z」這種難以驗證的複合陳述，指定 `(entity1, relationship, entity2)` 結構就能避免。

> Using your prompt to specify the structure of the output can have a significant effect on the nature and quality of the results. Sometimes system message inputs as "only write true facts" or "don't fabricate information" might not be adequate mitigations. Instead, asking for the model response to also include citations can help result in a reduction of the prevalence of incorrect responses.

> If you instruct the model to cite the source material when it makes statements, those statements are much more likely to be grounded. Asking for citations makes it so that the model must make two errors every time it generates a response: the first error is the fabricated response, and the second is the bad citation. Note that the closer the citation is to the text it supports, the shorter the distance ahead the model needs to anticipate the citation, which suggests that inline citations are better mitigations for false content generation than citations at the end of the content.

> Similarly, if you ask the model to extract factual statements from a paragraph, it might extract compound statements such as 'X is doing Y AND Z' (which can be harder to verify). This can be avoided by specifying an output structure such as (entity1, relationship, entity2).

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- 對照：DeepSeek 官方搜尋模板也要求「引用不可集中在文末」（見 deepseek.md B2）——兩家不約而同。

### M-11. Temperature 與 Top_p

> The temperature parameter can be set between 0 and 2. A higher value, for example 0.7 makes the output more random and produce more divergent responses, while a lower value, like. 0.2, makes the output more focused and concrete. A fictional story could be generated using a higher temperature. Whereas to generate a legal document it's recommended to use a much lower temperature.

> The general recommendation is to alter one of these two parameters at a time, not both.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering
- 對照：Mistral 同樣建議「固定一個、調另一個」（見 mistral.md D3）。

### M-12. Provide grounding context

> One of the most effective ways to provide reliable answers is to give the model data to draw its responses from (grounding data). [...] In general, the closer you can get your source material to the final form of the answer you want, the less work the model needs to do, which means there's less opportunity for error.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-13. Best practices（五條，含「給模型一條退路」）

> **Be specific**. Leave as little to interpretation as possible. Restrict the operational space.
> **Be descriptive**. Use analogies.
> **Double down**. Sometimes you might need to repeat yourself to the model. Give instructions before and after your primary content, use an instruction and a cue, and so on.
> **Order matters**. The order in which you present information to the model might impact the output. [...] Even the order of few-shot examples can matter. This difference is referred to as recency bias.
> **Give the model an "out"**. It can sometimes be helpful to give the model an alternative path if it's unable to complete the assigned task. For example, when asking a question over a piece of text, you might include something like "respond with 'not found' if the answer isn't present." This addition can help the model avoid generating false responses.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

### M-14. Space efficiency（token 級的版面經濟學）

**中文摘要**：這是四大廠都沒有的一節——**prompt 的排版會影響 token 數**：表格比 JSON 省（不用每個欄位都重複欄名）；**連續空白會各自算成 token**，能用一個空白就別用標點；日期寫成月份全名反而比純數字省 token。

> Given this limited space, it's important to use it as efficiently as possible.

> Tables – As shown in the examples in the previous section, GPT models can easily understand tabular formatted data. This format can be a space-efficient way to include data, rather than preceding every field with a name (such as with JSON).

> White space – Consecutive white spaces are treated as separate tokens, which can waste space. Spaces preceding a word, on the other hand, are typically treated as part of the same token as the word. Carefully watch your usage of white space and don't use punctuation when a space alone will do.

> In this case, spelling out the entire month is more space efficient than a fully numeric date.

- URL：https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

---

# 三、確實單薄或找不到的項目（誠實記錄）

| 項目 | 狀況（2026-07-30 擷取） |
|------|------------------------|
| Qwen 官方文件站的 prompt 章節 | **不存在**。https://qwen.readthedocs.io/en/latest/ 的目錄只有 Getting Started / Inference / Run Locally / Deployment / Quantization / Training / Framework，沒有任何 prompting、sampling、best practices 頁面。Qwen 的 prompt 教材在阿里雲百煉（見 qwen.md）。 |
| DeepSeek Prompt Library 的提示詞內文 | **頁面上沒有**。https://api-docs.deepseek.com/prompt-library/ 只有 13 張卡片的標題與一句描述，卡片沒有連結、點擊不導頁，無法擷取完整提示詞（詳見 deepseek.md D 節，已逐字保留卡片文字）。 |
| DeepSeek 的 `guides/reasoning_model` 頁 | **已下架**。sitemap 中不存在，內容由 `guides/thinking_mode` 取代。R1 時代的溫度/系統提示建議只存在於 GitHub repo README（deepseek.md A 節）。 |
| Meta llama-cookbook 的 Prompt Engineering notebook | **主分支已移除**。只剩 Llama 2 時代的 AWS Bedrock 版與 prompt-ops 教學；教學主體已收斂到官方文件站（meta-llama.md）。 |
| Meta 官方 prompt 指南的 ReAct 章節 | **當前版本沒有**（早期版本曾有）。本次未補列，避免引用已下架內容。 |
| Mistral `guides/prompting_capabilities` | 已 301 導向 `models/best-practices/prompt-engineering`，內容完整保留（mistral.md）。 |

---

# 四、跨廠比較速記（供關卡設計參考）

| 議題 | 各家立場 |
|------|----------|
| 推理模型要不要 system prompt | DeepSeek-R1：**不要**，全部放 user prompt／Mistral Magistral、Ministral Reasoning：**要**，推理指令就放 system prompt |
| 多輪要不要保留思考內容 | Qwen / QwQ：**不要**放進歷史／Mistral Ministral Reasoning：**強烈建議保留**／DeepSeek：**看有沒有工具呼叫**（有的話必須回傳，否則 400） |
| 能不能叫模型控制長度 | Cohere：**可以**，段落/句數/字數都行／Mistral：**不要叫它數字數**，把 charCount 當輸入資料 |
| 思考模型的溫度 | Qwen：0.6 且**禁止 greedy**／DeepSeek-R1（本地）：0.5–0.7／DeepSeek 現行 API 思考模式：**參數無效**／Mistral 推理模型：0.7／Mistral Large 3（非推理）：**< 0.1** |
| 引用要放哪 | Microsoft：**行內**優於文末（模型要預看的距離較短）／DeepSeek 搜尋模板：**切記不要集中在最後** |
| 評分要用什麼尺度 | Mistral：**文字級距**優於 1–5 數字級距 |
| prompt 能不能自動最佳化 | Meta：llama-prompt-ops／阿里雲百煉：Prompt 一鍵優化工具（兩家都提供官方工具） |

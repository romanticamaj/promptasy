# Promptbook — Qwen（阿里巴巴 / 通義千問）

- **廠商**：Alibaba Cloud / Qwen Team（通義千問）
- **擷取日期**：2026-07-30
- **內容性質**：以下皆為**官方文件**（阿里雲百煉說明中心、Qwen 官方 Hugging Face 模型卡、Qwen 官方部落格、Qwen 官方 readthedocs）。引文一字未改；簡體中文引文保持原樣，摘要以繁體中文書寫。

## 來源清單（Source URLs）

| # | 文件 | URL | 標示的最後更新 |
|---|------|-----|----------------|
| S1 | 文生文 Prompt 指南（百煉 Model Studio 實踐教程） | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide | 2026-05-12 16:42:30 |
| S2 | 深度思考（thinking mode / thinking_budget） | https://help.aliyun.com/zh/model-studio/deep-thinking | 2026-07-25 22:07:57 |
| S3 | Qwen3-235B-A22B 模型卡（Best Practices） | https://huggingface.co/Qwen/Qwen3-235B-A22B | 未標示，擷取日 2026-07-30 |
| S4 | Qwen3-235B-A22B-Instruct-2507 模型卡 | https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507 | 未標示，擷取日 2026-07-30 |
| S5 | Qwen3-235B-A22B-Thinking-2507 模型卡 | https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507 | 未標示，擷取日 2026-07-30 |
| S6 | QwQ-32B 模型卡（Usage Guidelines） | https://huggingface.co/Qwen/QwQ-32B | 未標示，擷取日 2026-07-30 |
| S7 | Qwen3-Coder-480B-A35B-Instruct 模型卡 | https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct | 未標示，擷取日 2026-07-30 |
| S8 | Qwen3.5-397B-A17B 模型卡（Best Practices，2026-02 發布） | https://huggingface.co/Qwen/Qwen3.5-397B-A17B | 未標示，擷取日 2026-07-30 |
| S9 | Qwen3 官方部落格 | https://qwenlm.github.io/blog/qwen3/ | 未標示，擷取日 2026-07-30 |
| S10 | Qwen 官方文件站（目錄） | https://qwen.readthedocs.io/en/latest/ | 未標示，擷取日 2026-07-30 |

> **重要觀察**：Qwen 官方 readthedocs（S10）**沒有**專門的 prompt engineering 頁面；它只談推理/部署/量化/訓練。Qwen 體系的「怎麼寫 prompt」教學集中在**阿里雲百煉的中文教程（S1）**，而「怎麼用這個模型」的參數與思考模式建議集中在**模型卡的 Best Practices 區塊（S3–S8）**。這是 Qwen 與 OpenAI/Anthropic 最大的結構差異。

---

## A. Prompt 撰寫方法論（來源：S1，阿里雲百煉 · 文生文 Prompt 指南）

### A1. 構建清晰明確的 Prompt（清晰度是第一原則）

**中文摘要**：官方把寫 prompt 類比成「指派工作給同事」——只丟一句話，對方很難達到你的預期；提供明確目的、思考方向與執行策略，才會有高標準產出。官方明講這是「最重要的一步」。

> 使用 LLM 也一样，您的任务描述（Prompt）越清晰、具体、没有歧义，LLM 的表现越能符合您的期望。

> 构建一个清晰具体的 Prompt 是充分发挥大模型能力的最重要一步。

**官方對照範例（模糊 → 清晰具體）**：

> 模糊的 Prompt：我想推广公司的新产品。我的公司名为阿里云百炼，新产品名为 Zephyr Z9，是一款轻薄便携的手机。帮我创建一条微博帖子。

> 清晰具体的 Prompt：请为我司“阿里云百炼”最新推出的“Zephyr Z9”轻薄便携手机设计一条吸引眼球的微博推广帖。內容需彰显Zephyr Z9的独特卖点，如极致轻薄设计、高性能配置及用户便利性，同时融入创意元素以提升观众兴趣和互动意愿。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列（qwen-max / plus / turbo / 開源 Qwen3、Qwen3.5 等）

### A2. 六要素 Prompt 框架：背景 / 目的 / 風格 / 語氣 / 受眾 / 輸出

**中文摘要**：Qwen 官方推薦的結構化模板共六個欄位。值得注意的是它把**風格、語氣、受眾**獨立成必填欄位——這三項在 OpenAI/Anthropic 的骨架裡通常被合併進「角色」或「風格指引」，Qwen 則明確要求分開寫，並用 `#背景#`、`#目的#` 這種井字號區塊當分隔符。

> 背景：介绍与任务紧密相关的背景信息。这一环节有助于LLM深入理解讨论的具体环境，从而保证其生成内容与话题高度相关。
> 目的：明确指出您期望LLM完成的具体任务。通过设定清晰、精确的目标指令，可引导LLM聚焦于实现既定任务，提升输出的有效性。
> 风格：指定您希望 LLM 输出的写作风格，可以是某个具体名人、具体流派或者某类专家的写作风格。
> 语气：定义输出内容应有的语气，比如正式、诙谐、温馨、关怀等，以便适应不同的使用场景和使用目的。
> 受众：明确指出内容面向的读者群体，无论是专业人士、入门学习者还是儿童等，这样LLM就能调整语言和内容深度，使之更加贴合受众需求。
> 输出：规定输出内容的具体形式，确保LLM提供的成果能直接满足后续应用的需求，比如列表、JSON数据格式、专业分析报告等形式。

**官方完整範例（框架長什麼樣）**：

> #背景#
> 我想为公司的新产品做广告。我公司的名字叫阿里云百炼，产品叫阿里云百炼 Zephyr Z9，是一款轻薄便携的手机。
> #目的#
> 为我创建一个微博帖子（限制：500字），旨在让人们有兴趣点击产品链接购买。
> #风格#
> 遵循黑米等成功公司为类似产品做广告的写作风格。
> #语气#
> 有说服力
> #受众#
> 我公司在微博上的受众通常是年轻一辈人。定制你的帖子，保证喜欢数码产品的人能快速关注到你的帖子。
> #输出#
> 微博上的帖子，简洁而有影响力。

**官方對效果的說明**：

> 在未使用 Prompt 框架时，LLM 输出虽表现尚可，但显得过于泛化，缺乏必要的细节和针对特定群体的吸引力。

> Prompt 框架在实践中有非常多的种类，您可以根据您的任务需求增减其结构组成。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列

### A3. 技巧一：為模型提供輸出樣例（few-shot / 風格模仿）

**中文摘要**：官方強調樣例不只是教格式，還能**穩定多次輸出的一致性**（降低變異）。範例情境是小紅書種草文，官方在 `#語氣與風格#` 區塊塞進四種寫作公式當樣例。

> 在 Prompt 中提供您期望的输出示例，可以让 LLM “模仿”我们所要求的规范、格式、概念、文法、语气进行输出。同时，提供样例可以让大模型多次输出的结果更一致，从而稳定模型表现。

> 观察输出时，您可以发现，LLM 学习了样例的要求并针对性地生成了符合格式要求的种草文。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列

### A4. 技巧二：設定完成任務的步驟（`#任務步驟#`）

**中文摘要**：對複雜任務，官方建議在 prompt 裡直接寫出解題步驟清單，模型會照著走。範例是一題追及問題的數學應用題，加上三步驟後模型算對。

> 对于许多复杂任务，提醒 LLM 如何完成任务是非常必要的。

> #任务步骤#
> 1. 先计算小明被爸爸追上时的时间和移动的距离。
> 2. 再计算小明去爷爷家剩余的距离和需要的时间。
> 3. 最后计算小明到爷爷家的时间。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列（非思考模式時效果最明顯）

### A5. 技巧三：使用分隔符號區分單元（並給出「怎麼挑分隔符」的規則）

**中文摘要**：這是 Qwen 文件裡少見地**講到選字原則**的一條：分隔符要挑自然語言中罕見、辨識度高的字元組合（`###`、`===`、`>>>`），目的是讓模型知道那是邊界而不是標點。任務越複雜，分隔符的收益越大。

> 在构建复杂的 Prompt 时，采用特定的分隔符来界定不同内容单元是极为关键的，这一做法显著增强了 LLM 对 Prompt 正确解析的能力。随着任务复杂度的增加，合理利用分隔符越能提升 LLM 的表现。

> 分隔符的选择应着眼于那些在自然语言文本中罕见的、独特的字符组合，例如：###、===、>>>等。这些特殊符号序列并无固定规则，关键在于其辨识度高，确保模型能够明确区分这些符号是作为内容区域的界限标识，而非文本中的普通标点或语法组成部分。

> 您可以在输出中发现明显差别，在使用了分隔符的输出中，LLM 不仅理解了三段话的逻辑关系，还正确识别了分隔符，并根据分隔符的段落生成了三段强相关的总结。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列

### A6. 技巧四：引導模型「思考」——思維鏈（CoT）與提示鏈（Prompt Chaining）

**中文摘要**：官方把 CoT 定位成「簡單但收益大」的入門法；提示鏈則是「建構較複雜但表現更好、準確率更高」的進階法，適合邏輯複雜但可固定拆解的任務。官方的 CoT 示範很具體：把 `#輸出#` 從「只輸出符合/不符合」改成「先輸出思考判斷過程，再輸出結論」。

> 对于逻辑推理和语境学习的复杂任务来说，简单的 Prompt 技巧可能无法满足任务需求。但您可以通过引导模型生成推理过程或帮助模型拆解复杂任务并逐步推理的方式，让模型在生成推理结果前生成更多的推理依据，从而提升模型在复杂问题上的表现。

> 这里为您先介绍思维链（Chain of Thought，COT），它是一种使用起来较为简单的引导方法，但能够显著提高大模型在复杂场景下的推理能力。

**CoT 的官方對照（同一題 JSON 檢查任務）**：

> 不使用思维链 `#输出#`：如果全部符合要求，只输出 "符合要求"，否则只输出 "不符合要求"。
> 使用思维链 `#输出#`：先输出针对各要求的思考判断过程。如果全部符合要求，再输出 "符合要求"，否则输出 "不符合要求"。

**提示鏈**：

> 除了思维链，启发 LLM 进行“思考”的实用方法还有提示链（Prompt Chaining）。提示链通过多轮对话，引导 LLM “思考” 方向，让 LLM 从简单任务开始，沿着设计好的“思考”方向逐步完成一个复杂推理。

> 提示链虽然相对思维链来说构建模式更加复杂，但模型表现更好，准确率更高。它非常适合逻辑复杂但能按照固定模式拆解的困难任务。

> 引导 LLM “思考”的方法还有很多种，比如：思维树（Tree of Thoughts, ToT)、Boosting of Thoughts 等。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：Qwen 全系列（注意：對已內建思考模式的 Qwen3 / Qwen3.5 思考模型，官方另有「不要重複搭鷹架」的思路，見 C 節）

### A7. Prompt 測試與迭代（含線上回饋迴圈）

**中文摘要**：官方把 prompt 工程定調為「高度實驗性」的流程，並額外強調**上線後持續收使用者回饋再調整**才是拿到最佳輸出的關鍵之一。

> 生成最优 prompt 是一个高度实验性的过程，需要不断尝试和调整各种方法。

> 此外，值得注意的是，除了精心设计的 prompt 外，用户提供的反馈和修正也是获取模型最佳输出的关键因素之一。即使在 prompt 优化完成后，持续地在线上环境中接收反馈并作出相应调整，才能使模型更好地理解和满足用户需求。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide

### A8. 官方優化案例一：用詞歧義會直接毀掉多語言指令

**中文摘要**：這是四大廠文件裡很少見的「**中文用詞歧義**」層級的教學——把「語言」改成「語種」，因為「語言」可能被理解成書面語/口語。同案例還示範：把塞在句子中間的長文件 `${documents}` 用分隔符抽成獨立內容區塊。

> 将“语言”替换为“语种”。因为“语言”这个词有歧义，不一定代指的是英语、法语，也可以是书面语言、口头语言。语种就没有这个歧义。

> ${documents}部分是一段很长的话，放在某句话中并不合适。应该使用分隔符标记切分出来，作为一个重要的内容块。

> 优化前 Prompt 结构较为松散，而且## 限制部分内容过于冗余。因此使用本教程提供的 Prompt 框架重新排版并将## 限制部分的内容拆分到正确的位置。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide
- 適用模型：文中案例以 qwen-turbo 為背景

### A9. 官方優化案例二：四要素組合抑制幻覺（任務指令＋格式模板＋注意事項＋輸出示例）

**中文摘要**：針對「從對話中抽多維度分析並輸出 JSON」，官方提出四要素組合，並明講「提供符合格式的樣例資料是**避免模型產生幻覺最有效的方式**」，以及用「準確性優先」「不能更改原文」這類限制性指令約束模型。

> 任务指令：明确告诉模型需要做什么，用指令形式而非联想形式描述任务，减少模型理解的层数。
> 回答格式：指定 JSON 格式模板，让模型严格按照结构化格式输出，有效减少幻觉。
> 注意事项：提出对模型的明确要求与限制，如"准确性优先""不能更改原文"等，进一步约束模型行为。
> 输出示例：提供符合格式要求的样例数据，是避免模型产生幻觉的最有效方式。

> 当需要模型输出结构化数据时，提供明确的格式模板和符合格式的示例数据是最有效的优化手段。同时，使用"准确性优先""不能更改原文"等限制性指令，可以有效减少模型的幻觉现象。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide

### A10. 平台級輔助：Prompt 一鍵優化工具

**中文摘要**：百煉平台內建「自動優化」按鈕，會呼叫大模型把你的短 prompt 擴寫、補細節；官方建議先跑優化工具再讀其他技巧。此功能會計費（消耗 token）。

> 阿里云百炼提供了Prompt一键优化工具，您可以在Prompt页面点击自动优化尝试该工具。该工具能针对输入的提示（Prompt）进行自动扩写和细节添加，推荐您先将 Prompt经过优化工具扩写改进，再接着阅读和体验其他优化技巧。

- URL：https://help.aliyun.com/zh/model-studio/prompt-engineering-guide

---

## B. 思考模式（Thinking Mode）的 prompt 級控制

### B1. `/think` 與 `/no_think` 軟開關（Qwen3 世代）

**中文摘要**：Qwen3 允許在**使用者訊息或系統訊息裡直接寫 `/think`、`/no_think`** 來逐輪切換思考模式；多輪對話中模型遵循**最近一次**的指令。這是一個「把模式切換寫進 prompt 文字」的機制，其他廠商多半只給 API 參數。

> We provide a soft switch mechanism that allows users to dynamically control the model's behavior when `enable_thinking=True`. Specifically, you can add `/think` and `/no_think` to user prompts or system messages to switch the model's thinking mode from turn to turn. The model will follow the most recent instruction in multi-turn conversations.

> For API compatibility, when `enable_thinking=True`, regardless of whether the user uses `/think` or `/no_think`, the model will always output a block wrapped in `<think>...</think>`. However, the content inside this block may be empty if thinking is disabled.
> When `enable_thinking=False`, the soft switches are not valid.

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B ；https://qwenlm.github.io/blog/qwen3/
- 適用模型：Qwen3 系列（Qwen3-235B-A22B 等混合思考模型）

### B2. Qwen3.5 取消軟開關（版本差異，重要）

**中文摘要**：Qwen3.5 官方明講**不支援** Qwen3 的 `/think`、`/nothink` 軟開關；預設就會先思考，要直接回答只能改 API 參數。教材若沿用 Qwen3 的軟開關寫法，在 Qwen3.5 上會失效。

> Qwen3.5 does not officially support the soft switch of Qwen3, i.e., `/think` and `/nothink`.

> Qwen3.5 will think by default before response. You can obtain direct response from the model without thinking by configuring the API parameters.

- URL：https://huggingface.co/Qwen/Qwen3.5-397B-A17B
- 適用模型：Qwen3.5 系列

### B3. 思考長度預算 `thinking_budget`

**中文摘要**：百煉提供 `thinking_budget` 直接限制推理過程的最大 token 數，超過就立刻輸出回覆——這是「用參數控制思考深度」而非「用 prompt 說『簡短思考』」的官方作法。

> 深度思考模型有时会生成冗长的推理过程，增加等待时间并消耗更多 Token。通过thinking_budget参数可设置推理过程的最大 Token 数，超过限制后模型立即输出回复。

> thinking_budget参数支持思考过程的最大 Token 数。适用于Qwen3.7、Qwen3.6、Qwen3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供）系列模型。

- URL：https://help.aliyun.com/zh/model-studio/deep-thinking
- 適用模型：Qwen3 及之後的思考模型（見引文列出的清單）

### B4. 混合思考 vs. 僅思考模式

**中文摘要**：百煉把深度思考模型分成兩類：混合思考（`enable_thinking` 可開可關）與僅思考（永遠先思考、不能關）。思考內容走 `reasoning_content` 欄位、回覆走 `content`。

> 百炼深度思考模型分为两种模式：
> 混合思考模式：通过enable_thinking参数控制思考开关：设为true：模型先思考再回复；设为false：模型直接回复；
> 仅思考模式：模型始终在回复前进行思考，无法关闭。

> 思考内容通过reasoning_content字段返回，回复内容通过content字段返回。

- URL：https://help.aliyun.com/zh/model-studio/deep-thinking

---

## C. 取樣參數與輸出規範（模型卡 Best Practices）

### C1. 思考模式 / 非思考模式的取樣參數（Qwen3、Qwen3.5）

**中文摘要**：Qwen 是少數把「思考模式與非思考模式要用**不同**取樣參數」寫死在官方文件裡的廠商，並且**明確禁止 greedy decoding**（temperature=0），理由是會導致效能退化與無限重複——這與 OpenAI/Anthropic 常見的「要穩定就 temperature=0」直覺相反。

> For thinking mode (`enable_thinking=True`), use `Temperature=0.6`, `TopP=0.95`, `TopK=20`, and `MinP=0`. **DO NOT use greedy decoding**, as it can lead to performance degradation and endless repetitions.

> For non-thinking mode (`enable_thinking=False`), we suggest using `Temperature=0.7`, `TopP=0.8`, `TopK=20`, and `MinP=0`.

> For supported frameworks, you can adjust the `presence_penalty` parameter between 0 and 2 to reduce endless repetitions. However, using a higher value may occasionally result in language mixing and a slight decrease in model performance.

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B ；https://huggingface.co/Qwen/Qwen3.5-397B-A17B
- 適用模型：Qwen3 系列、Qwen3.5 系列
- 其他版本差異（同樣官方）：
  - Qwen3-235B-A22B-**Instruct**-2507：`Temperature=0.7, TopP=0.8, TopK=20, MinP=0`（https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507）
  - Qwen3-235B-A22B-**Thinking**-2507：`Temperature=0.6, TopP=0.95, TopK=20, MinP=0`（https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507）
  - Qwen3-**Coder**-480B-A35B-Instruct：`temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.05`（https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct）
  - QwQ-32B：`Temperature=0.6, TopP=0.95, MinP=0`，且 `TopK` 建議 20–40（https://huggingface.co/Qwen/QwQ-32B）

### C2. 足夠的輸出長度（把「長度預算」當成品質變數）

**中文摘要**：Qwen 官方把 max output length 當成影響**正確率**的變數，而不只是成本變數：不給夠長度，模型沒空間把推理走完。不同版本給的數字不同。

> **Adequate Output Length**: We recommend using an output length of 32,768 tokens for most queries. For benchmarking on highly complex problems, such as those found in math and programming competitions, we suggest setting the max output length to 38,912 tokens. This provides the model with sufficient space to generate detailed and comprehensive responses, thereby enhancing its overall performance.

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B
- 版本差異：Instruct-2507 建議 16,384；Thinking-2507 與 Qwen3.5 複雜題建議 81,920；Qwen3-Coder 建議 65,536。

### C3. 標準化輸出格式（數學題與選擇題的官方句型）

**中文摘要**：Qwen 官方直接給出兩句「照抄就能用」的規範句：數學題要求逐步推理並把答案放進 `\boxed{}`；選擇題要求以 JSON 的 `answer` 欄位只給選項字母。這與 DeepSeek-R1 的官方建議完全一致（見 deepseek.md），是兩家共通的「離線可驗證輸出」設計。

> **Math Problems**: Include "Please reason step by step, and put your final answer within \boxed{}." in the prompt.

> **Multiple-Choice Questions**: Add the following JSON structure to the prompt to standardize responses: "Please show your choice in the `answer` field with only the choice letter, e.g., `"answer": "C"`."

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B（同句亦見於 S4、S5、S6、S8）
- 適用模型：Qwen3 / Qwen3.5 / QwQ 全系列

### C4. 多輪歷史中「不要帶思考內容」

**中文摘要**：多輪對話回傳歷史時，只放最終回覆、不要放 `<think>` 內容。官方說 Jinja2 chat template 已實作，但沒用該模板的框架要由開發者自己保證。

> **No Thinking Content in History**: In multi-turn conversations, the historical model output should only include the final output part and does not need to include the thinking content. It is implemented in the provided chat template in Jinja2. However, for frameworks that do not directly use the Jinja2 chat template, it is up to the developers to ensure that the best practice is followed.

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507 ；https://huggingface.co/Qwen/QwQ-32B ；https://huggingface.co/Qwen/Qwen3.5-397B-A17B
- 適用模型：所有 Qwen 思考模型

### C5. 強制模型真的開始思考（QwQ 專屬）

**中文摘要**：QwQ-32B 會出現「空思考」——直接吐出空的 `<think>` 區塊，官方要求以 `<think>\n` 開頭強制模型思考。這與 DeepSeek-R1 的同名建議是業界僅見的兩例。

> **Enforce Thoughtful Output**: Ensure the model starts with "\<think\>\n" to prevent generating empty thinking content, which can degrade output quality.

- URL：https://huggingface.co/Qwen/QwQ-32B
- 適用模型：QwQ-32B

### C6. 長輸入的處理（YaRN）

**中文摘要**：超過原生上下文時官方建議啟用 YaRN 之類的 RoPE scaling，而不是硬塞。QwQ 的門檻是 8,192 tokens；Qwen3.5 原生 262,144 tokens。

> **Handle Long Inputs**: For inputs exceeding 8,192 tokens, enable [YaRN](https://arxiv.org/abs/2309.00071) to improve the model's ability to capture long-sequence information effectively.

> Qwen3.5 natively supports context lengths of up to 262,144 tokens. For long-horizon tasks where the total length (including both input and output) exceeds this limit, we recommend using RoPE scaling techniques to handle long texts effectively., e.g., YaRN.

- URL：https://huggingface.co/Qwen/QwQ-32B ；https://huggingface.co/Qwen/Qwen3.5-397B-A17B

### C7. 工具呼叫建議走 Qwen-Agent

**中文摘要**：官方建議 agentic 用法直接用 Qwen-Agent，因為它內建工具呼叫模板與解析器，能省掉自己寫 prompt 模板的複雜度。

> Qwen3 excels in tool calling capabilities. We recommend using [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) to make the best use of agentic ability of Qwen3. Qwen-Agent encapsulates tool-calling templates and tool-calling parsers internally, greatly reducing coding complexity.

- URL：https://huggingface.co/Qwen/Qwen3-235B-A22B

---

## D. 大廠比較觀察（供關卡設計參考）

1. **「風格 / 語氣 / 受眾」被列為獨立必填欄位**（A2）——OpenAI/Anthropic 較少把「受眾」提到框架層級。
2. **分隔符的「選字原則」有明文**（A5）：要挑自然語言罕見的字元組合，理由是避免被當成普通標點。
3. **明確禁止 greedy decoding**（C1）：思考模型 temperature=0 會退化並無限重複，與「要穩定就 0」的直覺相反。
4. **輸出長度被當成品質變數**（C2），且不同版本給不同數字。
5. **模式切換可以寫在 prompt 文字裡**（`/think`、`/no_think`，B1），且此機制在 Qwen3.5 被移除（B2）——版本差異本身就是一個可教的點。
6. **中文用詞歧義層級的優化**（A8：「語言」→「語種」）是中文圈使用者特別有感、英文文件不會教的東西。

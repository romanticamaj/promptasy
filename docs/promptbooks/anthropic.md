# Anthropic 官方 Prompt Engineering 教學總覽（Promptbook）

> **用途**：這份文件是 PromptArcade 用來稽核遊戲內容涵蓋度的**參考資料**，不是遊戲內容本身。
> 目標是把 Anthropic 官方文件裡「每一條不同的技巧／建議」逐條收錄，附上原文短引文與可點的出處連結。
> **原則**：不改寫、不臆造。不確定的地方一律直接引用原文。中文摘要僅為理解輔助，**官方說法以引文與連結為準**。

- **廠商（vendor）**：Anthropic（Claude）
- **擷取日（capture date）**：2026-07-30
- **擷取方式**：WebFetch 逐頁擷取

---

## 一、來源文件清單（Source documents）

| # | 文件名稱 | 完整 URL | 最後更新日 |
|---|---|---|---|
| A1 | Prompting best practices（主要彙整頁，本專案原始種子來源） | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices | 未標示，擷取日 2026-07-30 |
| A2 | Prompt engineering overview | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview | 未標示，擷取日 2026-07-30 |
| A3 | Prompting Claude Fable 5 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5 | 未標示，擷取日 2026-07-30 |
| A4 | Prompting Claude Opus 5 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5 | 未標示，擷取日 2026-07-30 |
| A5 | Prompting Claude Sonnet 5 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 | 未標示，擷取日 2026-07-30 |
| A6 | Prompting Claude Opus 4.8 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8 | 未標示，擷取日 2026-07-30 |
| A7 | Tool use with Claude（overview） | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview | 未標示，擷取日 2026-07-30 |
| A8 | Define tools（工具定義最佳實務） | https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools | 未標示，擷取日 2026-07-30 |
| A9 | Blog：Best practices for prompt engineering | https://claude.com/blog/best-practices-for-prompt-engineering | 頁面標示 2025-11-10 |

### 擷取狀態與注意事項（誠實揭露）

1. **Anthropic 已把 prompt-engineering 子頁合併成單一頁。** 以下舊 URL 現在都會導向同一份 `claude-prompting-best-practices`（實測 `be-clear-and-direct`、`multishot-prompting`、`chain-of-thought` 三個都回傳同一份內容）：
   - `.../prompt-engineering/be-clear-and-direct`
   - `.../prompt-engineering/multishot-prompting`
   - `.../prompt-engineering/chain-of-thought`
   - `.../prompt-engineering/use-xml-tags`（推定同上）
   - `.../prompt-engineering/system-prompts`、`prefill-claudes-response`、`chain-prompts`、`long-context-tips`、`extended-thinking-tips`（推定同上）
   → **對遊戲的影響**：`src/data/curriculum.json` 裡指向這些舊子頁的連結仍可點（會導向合併頁），但**錨點可能失效**。建議改指向合併頁 + 對應 anchor。
2. **A9（部落格）的擷取品質較低**：WebFetch 的擷取模型把該頁重新編排過，引文可信但**版面結構為擷取模型所整理**。本文件中 A9 的引文標為「＊部落格，擷取經重排」。若要引用到遊戲圖鑑，建議優先用 A1 的同義條目。
3. 官方頁面**未標示 last-updated 日期**（Mintlify 站台無可見時間戳），故一律記為「未標示，擷取日 2026-07-30」。

### 本文件收錄的技巧總數

- A1 主頁（跨模型通用）：**48 條**
- A3–A6 模型專屬：**38 條**
- A7/A8 工具使用：**11 條**
- A9 部落格補充：**5 條**（其餘與 A1 重疊）
- **合計 102 條**

---

## 二、A1 主頁：Prompting best practices（適用所有現行 Claude 模型）

> 頁面自述的結構：「**Model-specific guidance** first … **Techniques for all current models** after that … **Migration considerations** last」
> 涵蓋模型（原文列舉）：Claude Fable 5、Claude Mythos 5、Claude Opus 5、Claude Opus 4.8、Claude Opus 4.7、Claude Opus 4.6、Claude Sonnet 5、Claude Sonnet 4.6、Claude Haiku 4.5。

### 2.1 General principles（一般原則）

#### T-A01 Be clear and direct（把話說清楚、直接說）
- **中文摘要**：Claude 對明確、直白的指令反應最好。想要「超出基本要求」的成果，就要明講，不要期待模型從模糊的 prompt 裡推測。把 Claude 想成「聰明但剛到職、不懂你們內規的新同事」。
- **原文引文**：
  > "Claude responds well to clear, explicit instructions. Being specific about your desired output can help enhance results. If you want 'above and beyond' behavior, explicitly request it rather than relying on the model to infer this from vague prompts."
  > "Think of Claude as a brilliant but new employee who lacks context on your norms and workflows."
- **黃金法則（原文）**：
  > "**Golden rule:** Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they'd be confused, Claude will be too."
- **兩條細則（原文）**：
  > "Be specific about the desired output format and constraints."
  > "Provide instructions as sequential steps using numbered lists or bullet points when the order or completeness of steps matters."
- **官方示例**：弱 `Create an analytics dashboard` → 強 `Create an analytics dashboard. Include as many relevant features and interactions as possible. Go beyond the basics to create a fully-featured implementation.`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct
- **適用**：所有現行 Claude 模型

#### T-A02 Add context to improve performance（說明「為什麼」）
- **中文摘要**：說明指令背後的動機／理由，可以讓 Claude 更理解目標、給出更貼題的回應。Claude 有能力從解釋中「舉一反三」。
- **原文引文**：
  > "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can help Claude better understand your goals and deliver more targeted responses."
  > "Claude is smart enough to generalize from the explanation."
- **官方示例**：弱 `NEVER use ellipses` → 強 `Your response will be read aloud by a text-to-speech engine, so never use ellipses since the text-to-speech engine will not know how to pronounce them.`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#add-context-to-improve-performance
- **適用**：所有現行 Claude 模型

#### T-A03 Use examples effectively（few-shot / multishot）
- **中文摘要**：範例是最可靠的輸出格式／語氣／結構操控手段。範例要**相關**（貼近真實用例）、**多樣**（涵蓋邊界案例、避免模型學到非預期的規律）、**結構化**（用 `<example>` 包起來，多個用 `<examples>`）。建議 3–5 個。也可以請 Claude 幫你評估或生成範例。
- **原文引文**：
  > "Examples are one of the most reliable ways to steer Claude's output format, tone, and structure. A few well-crafted examples (known as few-shot or multishot prompting) improve accuracy and consistency."
  > "**Relevant:** Mirror your actual use case closely."
  > "**Diverse:** Cover edge cases and vary enough that Claude doesn't pick up unintended patterns."
  > "**Structured:** Wrap examples in `<example>` tags (multiple examples in `<examples>` tags) so Claude can distinguish them from instructions."
  > "Include 3–5 examples for best results. You can also ask Claude to evaluate your examples for relevance and diversity, or to generate additional ones based on your initial set."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#use-examples-effectively
- **適用**：所有現行 Claude 模型

#### T-A04 Structure prompts with XML tags（用 XML 標籤分區）
- **中文摘要**：當 prompt 混雜指令、脈絡、範例、變動輸入時，用 XML 標籤各自包起來（如 `<instructions>`、`<context>`、`<input>`）可以減少誤解。標籤名要一致且具描述性；內容有天然層級時就巢狀（`<documents>` 內含 `<document index="n">`）。
- **原文引文**：
  > "XML tags help Claude parse complex prompts unambiguously, especially when your prompt mixes instructions, context, examples, and variable inputs."
  > "Use consistent, descriptive tag names across your prompts."
  > "Nest tags when content has a natural hierarchy (documents inside `<documents>`, each inside `<document index=\"n\">`)."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#structure-prompts-with-xml-tags
- **適用**：所有現行 Claude 模型

#### T-A05 Give Claude a role（在 system prompt 給角色）
- **中文摘要**：在 system prompt 設定角色，可以聚焦 Claude 的行為與語氣。**一句話就有差**。
- **原文引文**：
  > "Setting a role in the system prompt focuses Claude's behavior and tone for your use case. Even a single sentence makes a difference"
- **官方示例**：`system: "You are a helpful coding assistant specializing in Python."`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role
- **適用**：所有現行 Claude 模型（透過 `system` 參數）

#### T-A06 Long context：把長資料放最上面（queries at the end）
- **中文摘要**：處理 20k+ tokens 的長文件時，把長文件／輸入放在 prompt 的**最上面**，query、指令、範例放後面。官方測試指出，問題放最後可讓回應品質提升最多 30%（尤其是複雜的多文件輸入）。
- **原文引文**：
  > "**Put longform data at the top:** Place your long documents and inputs near the top of your prompt, above your query, instructions, and examples. This improves performance across all models."
  > "Queries at the end can improve response quality by up to 30 percent in tests, especially with complex, multidocument inputs."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- **適用**：所有現行 Claude 模型；20k+ tokens 的長文任務

#### T-A07 Long context：用 XML 結構化文件與 metadata
- **中文摘要**：多份文件時，每份包在 `<document>` 裡，內含 `<document_content>` 與 `<source>`（以及其他 metadata）子標籤。
- **原文引文**：
  > "**Structure document content and metadata with XML tags:** When using multiple documents, wrap each document in `<document>` tags with `<document_content>` and `<source>` (and other metadata) subtags for clarity."
- **官方示例**：`<documents><document index="1"><source>annual_report_2023.pdf</source><document_content>{{ANNUAL_REPORT}}</document_content></document>…</documents>`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- **適用**：所有現行 Claude 模型；多文件任務

#### T-A08 Long context：Ground responses in quotes（先引用再作答）
- **中文摘要**：長文件任務中，先請 Claude 把相關段落**原文引用**出來，再進行任務。這能讓它聚焦在相關內容、忽略其餘。
- **原文引文**：
  > "**Ground responses in quotes:** For long document tasks, ask Claude to quote relevant parts of the documents first before carrying out its task. This helps Claude focus on the relevant content and ignore the rest of the document."
- **官方示例（醫療助理）**：`Find quotes from the patient records and appointment history that are relevant to diagnosing the patient's reported symptoms. Place these in <quotes> tags. Then, based on these quotes, list all information that would help the doctor diagnose…`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- **適用**：所有現行 Claude 模型；長文件 / RAG

#### T-A09 Model self-knowledge（讓模型正確自報身分／模型字串）
- **中文摘要**：若應用需要 Claude 正確自我辨識、或需要指定 API model string，在 prompt 裡明講。
- **原文引文**：
  > "The assistant is Claude, created by Anthropic. The current model is Claude Opus 5."
  > "When an LLM is needed, please default to Claude Opus 5 unless the user requests otherwise. The exact model string for Claude Opus 5 is claude-opus-5."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#model-self-knowledge
- **適用**：所有現行 Claude 模型

### 2.2 Output and formatting（輸出與格式）

#### T-A10 Communication style and verbosity（現行模型更簡潔，要摘要就明講）
- **中文摘要**：現行模型的溝通風格比舊版更簡潔自然：更直接、以事實為本（不自我慶祝）、更口語、更精簡。副作用是它可能**跳過工具呼叫後的口頭摘要**直接做下一步；想看推理過程就要明講。
- **原文引文**：
  > "**More direct and grounded:** Provides fact-based progress reports rather than self-celebratory updates"
  > "**Less verbose:** May skip detailed summaries for efficiency unless prompted otherwise"
  > "After completing a task that involves tool use, provide a quick summary of the work you've done."
- **例外（原文）**：
  > "Claude Opus 5 is an exception on verbosity: its default user-facing responses run longer than prior models', and raising or lowering effort does not reliably change visible response length. Prompt explicitly for conciseness instead."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#communication-style-and-verbosity
- **適用**：所有現行 Claude 模型；Opus 5 為例外

#### T-A11 正面表述：說「要做什麼」而不是「不要做什麼」
- **中文摘要**：控制輸出格式最有效的做法之一，就是把禁令改寫成正面指令。
- **原文引文**：
  > "**Tell Claude what to do instead of what not to do**"
  > "Instead of: 'Do not use markdown in your response' / Try: 'Your response should be composed of smoothly flowing prose paragraphs.'"
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用**：所有現行 Claude 模型

#### T-A12 用 XML 格式指示器指定輸出區塊
- **中文摘要**：直接指定輸出要包在哪個標籤裡。
- **原文引文**：
  > "Write the prose sections of your response in `<smoothly_flowing_prose_paragraphs>` tags."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用**：所有現行 Claude 模型

#### T-A13 Match your prompt style to the desired output（prompt 的風格會傳染給輸出）
- **中文摘要**：prompt 本身的排版風格會影響回應風格。例如把 prompt 裡的 markdown 拿掉，輸出的 markdown 量也會減少。
- **原文引文**：
  > "The formatting style used in your prompt may influence Claude's response style. If you are still experiencing steerability issues with output formatting, try matching your prompt style to your desired output style as closely as possible. For example, removing markdown from your prompt can reduce the volume of markdown in the output."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用**：所有現行 Claude 模型

#### T-A14 用詳細的格式偏好區塊（減少 markdown 濫用）
- **中文摘要**：想精細控制 markdown／條列使用，給一段明確的規範區塊。官方提供 `<avoid_excessive_markdown_and_bullet_points>` 完整範本：長文用流暢散文段落、markdown 保留給 inline code / code block / 簡單標題、除非是真正離散的項目或使用者明確要求，否則不要用有序／無序清單。
- **原文引文**：
  > "When writing reports, documents, technical explanations, analyses, or any long-form content, write in clear, flowing prose using complete paragraphs and sentences."
  > "NEVER output a series of overly short bullet points."
  > "Your goal is readable, flowing text that guides the reader naturally through ideas rather than fragmenting information into isolated points."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses
- **適用**：所有現行 Claude 模型

#### T-A15 LaTeX output（數學式預設用 LaTeX，要純文字須明講）
- **中文摘要**：現行模型的數學式預設輸出 LaTeX；要純文字就要給明確指令（連 `\( \)`、`$`、`\frac{}{}` 都要禁止，並指定用 `/`、`*`、`^`）。
- **原文引文**：
  > "Claude's latest models default to LaTeX for mathematical expressions, equations, and technical explanations."
  > "Format your response in plain text only. Do not use LaTeX, MathJax, or any markup notation such as \\( \\), $, or \\frac{}{}."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#latex-output
- **適用**：所有現行 Claude 模型

#### T-A16 Document creation（簡報／動畫／視覺文件）
- **中文摘要**：現行模型製作簡報、動畫、視覺文件的指令跟隨度高，通常第一次就能產出可用結果；想要好結果就明確要求設計元素、視覺層級與動畫。
- **原文引文**：
  > "Create a professional presentation on [topic]. Include thoughtful design elements, visual hierarchy, and engaging animations where appropriate."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#document-creation
- **適用**：所有現行 Claude 模型

#### T-A17 ⚠️ Prefill 已不再支援（重要變更）
- **中文摘要**：**從 Claude 4.6 系列與 Claude Mythos Preview 開始，最後一則 assistant 訊息的 prefill（預填回應開頭）不再支援**，會回 400 錯誤。舊模型仍支援；在對話中間插入 assistant 訊息不受影響。
- **原文引文**：
  > "Starting with Claude 4.6 models and Claude Mythos Preview, prefilled responses (providing a partial assistant message for Claude to continue from) on the last assistant turn are no longer supported. Requests with prefilled assistant messages to these models return a 400 error. Model intelligence and instruction following have advanced such that most use cases of prefill no longer require it."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
- **適用**：Claude 4.6 以後的模型（含 Fable 5 / Mythos 5 / Opus 5 / Sonnet 5）
- **⚠️ 對遊戲的意義**：若 `curriculum.json` 中有「prefill 預填回應」的技巧條目，其適用性已經改變，需標註為「舊模型限定」。

#### T-A18 Prefill 遷移：控制輸出格式 → 改用 Structured Outputs
- **原文引文**：
  > "The Structured Outputs feature is designed specifically to constrain Claude's responses to follow a given schema. Try asking the model to conform to your output structure first, as newer models can reliably match complex schemas when told to, especially if implemented with retries. For classification tasks, use either tools with an enum field containing your valid labels or structured outputs."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
- **適用**：Claude 4.6+

#### T-A19 Prefill 遷移：去掉開場白 → 直接下指令
- **原文引文**：
  > "Use direct instructions in the system prompt: 'Respond directly without preamble. Do not start with phrases like \"Here is...\", \"Based on...\", etc.' Alternatively, direct the model to output within XML tags, use structured outputs, or use tool calling. If the occasional preamble slips through, strip it in post-processing."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migrating-away-from-prefilled-responses
- **適用**：Claude 4.6+

#### T-A20 Prefill 遷移：避免不當拒絕 → 已不需要
- **原文引文**：
  > "Claude is much better at appropriate refusals now. Clear prompting within the `user` message without prefill should be sufficient."
- **出處**：同上
- **適用**：Claude 4.6+

#### T-A21 Prefill 遷移：續寫 → 把續寫需求放進 user 訊息
- **原文引文**：
  > "Move the continuation to the user message, and include the final text from the interrupted response: 'Your previous response was interrupted and ended with `[previous_response]`. Continue from where you left off.'"
- **出處**：同上
- **適用**：Claude 4.6+

#### T-A22 Prefill 遷移：脈絡補水／角色一致性 → 注入 user turn 或用工具
- **原文引文**：
  > "For very long conversations, inject what were previously prefilled-assistant reminders into the user turn. If context hydration is part of a more complex agentic system, consider hydrating through tools … or during context compaction."
- **出處**：同上
- **適用**：Claude 4.6+；長對話 / agentic

### 2.3 Tool use（工具使用）

#### T-A23 明確要求「動手做」而不是「給建議」
- **中文摘要**：現行模型指令跟隨很精確。你說「可以建議一些修改嗎」，它可能真的只給建議而不動手。要它動手就要用祈使句。
- **原文引文**：
  > "Claude's latest models are trained for precise instruction following and benefit from explicit direction to use specific tools. If you say 'can you suggest some changes,' Claude will sometimes provide suggestions rather than implementing them, even if making changes might be what you intended."
- **官方示例**：弱 `Can you suggest some changes to improve this function?` → 強 `Change this function to improve its performance.` / `Make these edits to the authentication flow.`
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用**：所有現行 Claude 模型

#### T-A24 `<default_to_action>` / `<do_not_act_before_instructions>`（兩個方向的行動傾向開關）
- **中文摘要**：想讓模型預設就動手，給 `<default_to_action>` 區塊；想讓它保守、先研究再說，給 `<do_not_act_before_instructions>` 區塊。
- **原文引文（積極）**：
  > "By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing."
- **原文引文（保守）**：
  > "Do not jump into implementation or change files unless clearly instructed to make changes. When the user's intent is ambiguous, default to providing information, doing research, and providing recommendations rather than taking action."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用**：所有現行 Claude 模型

#### T-A25 ⚠️ 把「CRITICAL / MUST」這類強語氣**調弱**
- **中文摘要**：Claude Opus 4.5 / 4.6 對 system prompt 更敏感。以前為了避免「工具觸發不足」而寫的強硬語氣，現在會造成**過度觸發**。修法是把 `CRITICAL: You MUST use this tool when...` 降級成 `Use this tool when...`。
- **原文引文**：
  > "Claude Opus 4.5 and Claude Opus 4.6 are also more responsive to the system prompt than previous models. If your prompts were designed to reduce undertriggering on tools or skills, these models may now overtrigger. The fix is to dial back any aggressive language."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage
- **適用**：Claude Opus 4.5 / 4.6 及之後

#### T-A26 Optimize parallel tool calling（平行工具呼叫）
- **中文摘要**：現行模型會自動平行呼叫互不相依的工具。官方給了 `<use_parallel_tool_calls>` 區塊可把成功率推到接近 100%；反之也可以要求循序執行。重點規則：**有相依關係的呼叫不可平行**、**絕不可用佔位符或猜測缺少的參數**。
- **原文引文**：
  > "If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel."
  > "However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls."
  > （減少平行）"Execute operations sequentially with brief pauses between each step to ensure stability."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#optimize-parallel-tool-calling
- **適用**：所有現行 Claude 模型

### 2.4 Thinking and reasoning（思考與推理）

#### T-A27 Overthinking：把「盡量徹底」的鷹架收掉
- **中文摘要**：Claude Opus 4.6 在高 effort 下會做大量前置探索。以前鼓勵它更徹底的 prompt 現在要調整：把「一律使用 X 工具」改成「當 X 工具能增進理解時才用」；拿掉「有疑慮就用 X」這種過度提示；真的還是太積極就降 `effort`。
- **原文引文**：
  > "**Replace blanket defaults with more targeted instructions.** Instead of 'Default to using [tool],' add guidance like 'Use [tool] when it would enhance your understanding of the problem.'"
  > "**Remove over-prompting.** Tools that undertriggered in previous models are likely to trigger appropriately now. Instructions like 'If in doubt, use [tool]' will cause overtriggering."
  > "**Use effort as a fallback.**"
- **限制思考的官方 prompt**：
  > "When you're deciding how to approach a problem, choose an approach and commit to it. Avoid revisiting decisions unless you encounter new information that directly contradicts your reasoning. If you're weighing two approaches, pick one and see it through."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overthinking-and-excessive-thoroughness
- **適用**：Claude Opus 4.6 起

#### T-A28 ⚠️ `budget_tokens` 已淘汰，改用 `effort` + adaptive thinking
- **中文摘要**：extended thinking 的 `budget_tokens` 在 Opus 4.6 / Sonnet 4.6 上仍可用但**已 deprecated**；**Claude 4.7 以後設定 `budget_tokens` 會回 400 錯誤**。改用降低 `effort`，或用 `max_tokens` 當硬上限搭配 adaptive thinking。
- **原文引文**：
  > "If you need a hard ceiling on thinking costs, extended thinking with a `budget_tokens` cap is still functional on Opus 4.6 and Sonnet 4.6 but is deprecated. On Claude 4.7 and later models, setting `budget_tokens` returns a 400 error."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overthinking-and-excessive-thoroughness
- **適用**：Claude 4.7+
- **⚠️ 對遊戲的意義**：涉及「thinking budget」的技巧條目需要更新為 `effort`。

#### T-A29 Adaptive thinking（自適應思考）與觸發行為可被 prompt 調整
- **中文摘要**：Claude 4.6 之後與 Mythos Preview 用 adaptive thinking（`thinking: {type: "adaptive"}`），由模型自己決定何時思考、思考多久，依 `effort` 與問題複雜度校準。Fable 5 / Mythos 5 **思考永遠開著、且只有 adaptive 模式**。官方說 adaptive thinking 在內部評測上「可靠地」優於 extended thinking。若模型思考得太頻繁（常見於龐大複雜的 system prompt），可以用 prompt 收斂。
- **原文引文**：
  > "Claude calibrates its thinking based on two factors: the `effort` parameter and query complexity. Higher effort elicits more thinking, and more complex queries do the same."
  > "In internal evaluations, adaptive thinking reliably drives better performance than extended thinking."
  > "Thinking adds latency and should only be used when it will meaningfully improve answer quality - typically for problems that require multistep reasoning. When in doubt, respond directly."
- **各模型預設（原文）**：
  > "On Claude Opus 4.6 through Claude Opus 4.8 and Claude Sonnet 4.6, thinking is off when you omit the `thinking` parameter. On Claude Opus 5 and Claude Sonnet 5, thinking is on by default … On Claude Fable 5 and Claude Mythos 5, thinking is always on."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#leverage-thinking--interleaved-thinking-capabilities
- **適用**：Claude 4.6+

#### T-A30 引導工具呼叫後的反思（interleaved thinking）
- **原文引文**：
  > "After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action."
- **出處**：同 T-A29
- **適用**：所有現行 Claude 模型；多步驟工具流程

#### T-A31 ⚠️ 一般性指令優於逐步規定（「think thoroughly」勝過手寫步驟）
- **中文摘要**：與很多人的直覺相反——給 Claude 一句「think thoroughly」通常比你手寫的逐步計畫效果更好，因為它的推理常常超出人類會規定的範圍。
- **原文引文**：
  > "**Prefer general instructions over prescriptive steps.** A prompt like 'think thoroughly' often produces better reasoning than a hand-written step-by-step plan. Claude's reasoning frequently exceeds what a human would prescribe."
- **出處**：同 T-A29
- **適用**：所有現行 Claude 模型

#### T-A32 Multishot 範例可以搭配 thinking（用 `<thinking>` 標籤示範推理樣式）
- **原文引文**：
  > "**Multishot examples work with thinking.** Use `<thinking>` tags inside your few-shot examples to show Claude the reasoning pattern. It will generalize that style to its own extended thinking blocks."
- **出處**：同 T-A29
- **適用**：所有現行 Claude 模型

#### T-A33 手動 chain-of-thought 作為 fallback（thinking 關閉時）
- **中文摘要**：thinking 關掉時，仍可請 Claude 逐步思考，並用 `<thinking>` / `<answer>` 標籤把推理與最終輸出乾淨分開。但在 Opus 5 上建議改成「保持 thinking 開著、降低 effort」，因為關閉 thinking 時模型偶爾會把內部 XML 標籤漏到可見輸出。
- **原文引文**：
  > "**Manual chain-of-thought (CoT) prompting as a fallback.** When thinking is off, you can still encourage step-by-step reasoning by asking Claude to think through the problem. Use structured tags like `<thinking>` and `<answer>` to cleanly separate reasoning from the final output."
- **出處**：同 T-A29
- **適用**：thinking 關閉時；Opus 5 有例外

#### T-A34 ⚠️ Ask Claude to self-check（自我檢查）—— 但 Opus 5 相反
- **中文摘要**：在結尾加一句「完成前請對照 [測試條件] 驗證你的答案」，對程式與數學特別能可靠抓錯。**但 Claude Opus 5 是例外**：它本來就會自我驗證，沿用舊模型的驗證指令會造成過度驗證、白白增加 token 與延遲——遷移到 Opus 5 時應該**刪掉**這類指令而不是改寫。
- **原文引文**：
  > "**Ask Claude to self-check.** Append something like 'Before you finish, verify your answer against [test criteria].' This catches errors reliably, especially for coding and math."
  > "Claude Opus 5 is the exception: it verifies its own work well without explicit instruction, and verification instructions carried over from prompts tuned for earlier models can cause over-verification… When migrating to Claude Opus 5, remove these instructions rather than rewriting them."
- **出處**：同 T-A29
- **適用**：所有現行模型；Opus 5 為反例

#### T-A35 「think」這個字的敏感度（Opus 4.5 關閉 thinking 時）
- **原文引文**：
  > "When extended thinking is disabled, Claude Opus 4.5 is particularly sensitive to the word 'think' and its variants. Consider using alternatives like 'consider,' 'evaluate,' or 'reason through' in those cases."
- **出處**：同 T-A29
- **適用**：Claude Opus 4.5，extended thinking 關閉時

### 2.5 Agentic systems（代理系統）

#### T-A36 Long-horizon reasoning and state tracking（長程任務與狀態追蹤）
- **原文引文**：
  > "Claude maintains orientation across extended sessions by focusing on incremental progress, making steady advances on a few things at a time rather than attempting everything at once."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-horizon-reasoning-and-state-tracking
- **適用**：所有現行 Claude 模型；長程 agentic 任務

#### T-A37 Context awareness：告訴模型「context 會自動壓縮，不要提早收工」
- **中文摘要**：Sonnet 5 / 4.6 / 4.5 與 Haiku 4.5 具備 context awareness（能追蹤剩餘 context）。若你的 harness 會壓縮 context 或能把狀態寫到外部檔案，要告訴模型，否則它可能在接近上限時自動收尾。
- **原文引文**：
  > "Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Therefore, do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to memory before the context window refreshes… Never artificially stop any task early regardless of the context remaining."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#context-awareness-and-multiwindow-workflows
- **適用**：Claude Sonnet 5 / Sonnet 4.6 / Sonnet 4.5 / Haiku 4.5

#### T-A38 跨多個 context window 的工作流（6 條）
- **中文摘要與原文重點**：
  1. **第一個 context window 用不同的 prompt**：「Use the first context window to set up a framework (write tests, create setup scripts), then use future context windows to iterate on a todo-list.」
  2. **讓模型用結構化格式寫測試**（例如 `tests.json`），並提醒重要性：「It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality.」
  3. **建立生活品質工具**：鼓勵它做 `init.sh` 之類的啟動腳本。
  4. **重開 vs 壓縮**：「Claude's latest models are extremely effective at discovering state from the local filesystem.」開新 context 時要很明確地指示起手式（`Call pwd`、`Review progress.txt, tests.json, and the git logs`、先跑一次整合測試）。
  5. **提供驗證工具**：「As the length of autonomous tasks grows, Claude needs to verify correctness without continuous human feedback.」（例如 Playwright MCP server、computer use）
  6. **鼓勵用完整個 context**：「It's encouraged to spend your entire output context working on the task - just make sure you don't run out of context with significant uncommitted work.」
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#workflows-across-multiple-context-windows
- **適用**：所有現行 Claude 模型；長程 agentic

#### T-A39 State management best practices（4 條）
- **原文引文**：
  > "**Use structured formats for state data:** When tracking structured information (like test results or task status), use JSON or other structured formats."
  > "**Use unstructured text for progress notes:** Freeform progress notes work well for tracking general progress and context."
  > "**Use git for state tracking:** Git provides a log of what's been done and checkpoints that can be restored."
  > "**Emphasize incremental progress:** Explicitly ask Claude to keep track of its progress and focus on incremental work."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#state-management-best-practices
- **適用**：所有現行 Claude 模型

#### T-A40 Balancing autonomy and safety（不可逆動作要先確認）
- **中文摘要**：沒有指引時，Opus 4.6 可能執行難以復原或影響共用系統的動作。官方給了一段完整的「可逆性」prompt：鼓勵本地可逆操作，難以復原／影響他人／破壞性的動作要先問；遇到阻礙時不可用破壞性手段抄捷徑（例如 `--no-verify`）。
- **原文引文**：
  > "Consider the reversibility and potential impact of your actions. You are encouraged to take local, reversible actions like editing files or running tests, but for actions that are hard to reverse, affect shared systems, or could be destructive, ask the user before proceeding."
  > "When encountering obstacles, do not use destructive actions as a shortcut."
- **官方舉例的三類**：destructive operations（刪檔／刪 branch／drop table／`rm -rf`）、hard to reverse（`git push --force`、`git reset --hard`、改已發布的 commit）、operations visible to others（push、留言在 PR/issue、送訊息、改共用基礎設施）。
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#balancing-autonomy-and-safety
- **適用**：Claude Opus 4.6 起；agentic

#### T-A41 Research and information gathering（研究與資訊蒐集）
- **中文摘要**：三個要點——(1) 給清楚的成功標準；(2) 要求跨來源查證；(3) 複雜研究用結構化流程：發展多個競爭假設、追蹤信心水準、定期自我批判、把假設樹／研究筆記寫成檔案。
- **原文引文**：
  > "**Provide clear success criteria:** Define what constitutes a successful answer to your research question."
  > "**Encourage source verification:** Ask Claude to verify information across multiple sources."
  > "Search for this information in a structured way. As you gather data, develop several competing hypotheses. Track your confidence levels in your progress notes to improve calibration. Regularly self-critique your approach and plan. Update a hypothesis tree or research notes file to persist information and provide transparency."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#research-and-information-gathering
- **適用**：所有現行 Claude 模型

#### T-A42 Subagent orchestration（子代理編排）
- **中文摘要**：現行模型會自己判斷何時該委派給子代理，不需明講。你要做的是：(1) 把子代理工具定義好；(2) 讓它自然編排；(3) **留意過度使用**——Opus 4.6 特別偏愛子代理，Opus 5 也比前代更容易委派。太多就給明確指引。
- **原文引文**：
  > "Claude Opus 4.6 has a strong predilection for subagents and may spawn them in situations where a simpler, direct approach would suffice."
  > "Use subagents when tasks can run in parallel, require isolated context, or involve independent workstreams that don't need to share state. For simple tasks, sequential operations, single-file edits, or tasks where you need to maintain context across steps, work directly rather than delegating."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#subagent-orchestration
- **適用**：Claude Opus 4.6 / Opus 5 / Fable 5 等具 subagent 能力的 harness

#### T-A43 ⚠️ Chain complex prompts（prompt chaining 的角色已縮小）
- **中文摘要**：有了 adaptive thinking 與 subagent 編排，Claude 大部分多步驟推理都在內部處理完。**顯式的 prompt chaining（拆成多次 API 呼叫）現在主要用在：需要檢查中間輸出、或要強制特定 pipeline 結構時。** 最常見的 chaining 模式是**自我修正**：產生草稿 → 依標準審查 → 依審查結果修訂。
- **原文引文**：
  > "With adaptive thinking and subagent orchestration, Claude handles most multistep reasoning internally. Explicit prompt chaining (breaking a task into sequential API calls) is still useful when you need to inspect intermediate outputs or enforce a specific pipeline structure."
  > "The most common chaining pattern is **self-correction:** generate a draft → have Claude review it against criteria → have Claude refine based on the review."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#chain-complex-prompts
- **適用**：所有現行 Claude 模型
- **⚠️ 對遊戲的意義**：「prompt chaining」技巧條目的定位已從「主力技巧」降級為「特定情境技巧」。

#### T-A44 Reduce file creation in agentic coding（減少產生暫存檔）
- **原文引文**：
  > "If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#reduce-file-creation-in-agentic-coding
- **適用**：所有現行 Claude 模型；agentic coding

#### T-A45 Overeagerness（過度工程化）—— 官方的「最小化」prompt
- **中文摘要**：Opus 4.5 / 4.6 傾向過度工程化（多開檔案、加不必要的抽象、做沒人要求的彈性）。官方給了四個面向的抑制指令：**Scope**（只做被要求的）、**Documentation**（不要幫沒改的程式加註解／型別）、**Defensive coding**（不要為不可能發生的情況加錯誤處理，只在系統邊界驗證）、**Abstractions**（不要為一次性操作做抽象、不要為假想的未來需求設計）。
- **原文引文**：
  > "Avoid over-engineering. Only make changes that are directly requested or clearly necessary."
  > "The right amount of complexity is the minimum needed for the current task."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#overeagerness
- **適用**：Claude Opus 4.5 / 4.6

#### T-A46 Avoid focusing on passing tests and hardcoding（不要為了過測試而寫死）
- **原文引文**：
  > "Implement a solution that works correctly for all valid inputs, not just the test cases. Do not hard-code values or create solutions that only work for specific test inputs."
  > "Tests are there to verify correctness, not to define the solution."
  > "If the task is unreasonable or infeasible, or if any of the tests are incorrect, please inform me rather than working around them."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#avoid-focusing-on-passing-tests-and-hardcoding
- **適用**：所有現行 Claude 模型；coding

#### T-A47 Minimizing hallucinations in agentic coding（讀過再說）
- **原文引文**：
  > "Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#minimizing-hallucinations-in-agentic-coding
- **適用**：所有現行 Claude 模型；agentic coding

### 2.6 Capability-specific tips（能力別技巧）

#### T-A48 Vision：給 Claude 一個「裁切工具」
- **中文摘要**：Opus 4.5 / 4.6 視覺能力提升，尤其是脈絡中有多張圖時。有一個經證實有效的技巧：**給 Claude 一個 crop 工具或 agent skill 讓它能「放大」影像的相關區域**，在影像評測上有一致的提升。
- **原文引文**：
  > "One technique that has proven effective to further boost performance is to give Claude a crop tool or agent skill. Testing has shown consistent uplift on image evaluations when Claude is able to 'zoom' in on relevant regions of an image."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#improved-vision-capabilities
- **適用**：Claude Opus 4.5 / 4.6（Opus 5、Fable 5 有各自的視覺章節）

#### T-A49 Frontend design：避開「AI slop」美學
- **中文摘要**：模型會收斂到「在分佈中央」的通用產出，在前端設計上就是所謂的 AI slop。官方 `<frontend_aesthetics>` 區塊指定四個面向：**Typography**（避開 Arial / Inter 這類通用字型）、**Color & Theme**（用 CSS 變數；主色明確＋銳利點綴優於平均分配的怯懦色盤）、**Motion**（一次編排良好的載入動畫勝過零散的微互動）、**Backgrounds**（做出氛圍與深度，不要只用純色）。要避開的：過度使用的字型家族、俗套配色（尤其白底紫漸層）、可預測的版面、缺乏脈絡個性的餅乾模子設計。
- **原文引文**：
  > "You tend to converge toward generic, 'on distribution' outputs. In frontend design, this creates what users call the 'AI slop' aesthetic."
  > "Dominant colors with sharp accents outperform timid, evenly-distributed palettes."
  > "one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions"
  > "You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!"
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#frontend-design
- **適用**：Claude Opus 4.5 / 4.6（Opus 4.8 與 Sonnet 5 有各自更精簡的版本，見 T-A76 / T-A86）

### 2.7 Migration considerations（遷移注意事項，6 條）

#### T-A50 遷移六要點
- **原文引文**：
  > "1. **Be specific about desired behavior:** Consider describing exactly what you'd like to see in the output."
  > "2. **Frame your instructions with modifiers:** Adding modifiers that encourage Claude to increase the quality and detail of its output can help better shape Claude's performance."
  > "3. **Request specific features explicitly:** Animations and interactive elements should be requested explicitly when desired."
  > "4. **Update thinking configuration:** Claude 4.6 models use adaptive thinking … instead of manual thinking with `budget_tokens`."
  > "5. **Migrate away from prefilled responses**"
  > "6. **Tune anti-laziness prompting:** If your prompts previously encouraged the model to be more thorough or use tools more aggressively, dial back that guidance."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#migration-considerations
- **適用**：從舊世代遷移

---

## 三、A2：Prompt engineering overview（何時該做 prompt engineering）

#### T-A51 動手之前的三個前提
- **中文摘要**：這份指南假設你已經有 (1) 明確的成功標準定義、(2) 能對照標準做實測的方法、(3) 一版想改進的 prompt 草稿。沒有的話，先去建立這三件事。
- **原文引文**：
  > "1. A clear definition of the success criteria for your use case / 2. Some ways to empirically test against those criteria / 3. A first draft prompt you want to improve"
  > "If not, spend time establishing that first."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview#before-prompt-engineering
- **適用**：全部

#### T-A52 不是每個問題都該用 prompt engineering 解
- **原文引文**：
  > "Not every success criteria or failing eval is best solved by prompt engineering. For example, you can sometimes improve latency and cost more easily by selecting a different model."
- **出處**：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview#when-to-prompt-engineer
- **適用**：全部

#### T-A53 metaprompt / 互動式教學資源
- **中文摘要**：沒有 prompt 草稿時，可以用 Claude Cookbook 的 metaprompt recipe 產一版；另有 GitHub 互動教學與 Google Sheets 輕量版教學。
- **出處**：
  - metaprompt notebook：https://colab.research.google.com/github/anthropics/claude-cookbooks/blob/main/misc/metaprompt.ipynb
  - GitHub 互動教學：https://github.com/anthropics/prompt-eng-interactive-tutorial
  - Google Sheets 版：https://docs.google.com/spreadsheets/d/19jzLgRruG9kjUQNKtCg1ZjdD6l6weA6qRXG5zLIAhC8
- **適用**：全部

---

## 四、A3：Prompting Claude Fable 5 / Mythos 5

> 適用：Claude Fable 5、Claude Mythos 5。定位（原文）：
> "Claude Fable 5 takes on problems that were previously too complex, long-running, or ambiguous for prior models, and is particularly effective at end-to-end work that takes a person hours, days, or weeks to complete."
> 頁面 URL：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5

#### T-A54 Longer turns by default（單次請求會跑很久，要先改基礎設施）
- **中文摘要**：高 effort 下單一請求可能跑好幾分鐘，自主執行可達數小時。遷移前要先調整 client timeout、串流與進度指示，並考慮改成非同步輪詢而非阻塞等待。另外可用一段 prompt 避免它在任務模糊時過度規劃。
- **原文引文**：
  > "When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey."
- **出處**：…/prompting-claude-fable-5#longer-turns-by-default
- **適用**：Fable 5 / Mythos 5

#### T-A55 Consider all effort levels（effort 是主要旋鈕）
- **原文引文**：
  > "Effort is the primary control for the trade-off between intelligence, latency, and cost on Claude Fable 5. Use `high` as the default for most tasks, with `xhigh` for the most capability-sensitive workloads and `medium` or `low` for routine work."
  > "Lower effort settings on Claude Fable 5 still perform well and often exceed `xhigh` performance on prior models."
- **抑制高 effort 下多餘整理的 prompt（原文）**：
  > "Don't add features, refactor, or introduce abstractions beyond what the task requires… Don't design for hypothetical future requirements: do the simplest thing that works well… Only validate at system boundaries (user input, external APIs)."
- **出處**：…/prompting-claude-fable-5#consider-all-effort-levels
- **適用**：Fable 5 / Mythos 5

#### T-A56 Strong instruction following（一句話就能改行為，不必逐條列舉）
- **中文摘要**：指令跟隨強到「一句簡短指令」就能取代「逐條列舉每一種行為」。官方的簡潔範例強調兩件事：**先講結果**，以及**「好讀」與「短」是兩回事，好讀更重要**；而縮短的方法是「有選擇地刪內容」，不是把文字壓縮成碎片、縮寫或箭頭鏈。
- **原文引文**：
  > "Lead with the outcome. Your first sentence after finishing should answer 'what happened' or 'what did you find'… Being readable and being concise are different things, and readability matters more."
  > "The way to keep output short is to be selective about what you include (drop details that don't change what the reader would do next), not to compress the writing into fragments, abbreviations, arrow chains like A → B → fails, or jargon."
- **檢查點行為（原文）**：
  > "Pause for the user only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input that only they can provide. If you hit one of these, ask and end the turn, rather than ending on a promise."
- **出處**：…/prompting-claude-fable-5#strong-instruction-following
- **適用**：Fable 5 / Mythos 5

#### T-A57 Ground progress claims during long runs（進度回報要有工具結果佐證）
- **中文摘要**：長時間自主執行時，要求它把每一項進度宣稱對照本次 session 的工具結果做稽核。官方測試指出，這**幾乎完全消除了捏造的狀態回報**，即使在刻意誘發的任務上。
- **原文引文**：
  > "Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that."
  > "In Anthropic's testing, this nearly eliminated fabricated status reports even on tasks designed to elicit them."
- **出處**：…/prompting-claude-fable-5#ground-progress-claims-during-long-runs
- **適用**：Fable 5 / Mythos 5；長程自主任務
- **💡 這是一條「新技巧」，遊戲目前很可能沒有涵蓋。**

#### T-A58 State the boundaries（明講邊界：什麼該做、什麼不該做）
- **原文引文**：
  > "When the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one."
  > "Before running a command that changes system state (restarts, deletes, config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause."
- **出處**：…/prompting-claude-fable-5#state-the-boundaries
- **適用**：Fable 5 / Mythos 5

#### T-A59 Parallel subagents（非同步委派勝過阻塞等待）
- **原文引文**：
  > "Long-lived subagents that keep their context across subtasks save time and cost through cache reads and avoid bottlenecking on the slowest subagent."
  > "Delegate independent subtasks to subagents and keep working while they run. Intervene if a subagent goes off track or is missing relevant context."
- **出處**：…/prompting-claude-fable-5#parallel-subagents
- **適用**：Fable 5 / Mythos 5

#### T-A60 Construct a memory system（建立記憶系統）
- **中文摘要**：Fable 5 在「能記錄前次執行的教訓並回頭參照」時表現特別好。給它一個地方寫筆記，簡單到一個 Markdown 檔案就行。官方給了筆記規範與 bootstrap 方法。
- **原文引文**：
  > "Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong."
  > "Reflect on the previous sessions we've had together. Use subagents to identify core themes and lessons, and store them in [X]."
- **出處**：…/prompting-claude-fable-5#construct-a-memory-system
- **適用**：Fable 5 / Mythos 5
- **💡 這是一條「新技巧」（記憶系統設計），遊戲目前很可能沒有涵蓋。**

#### T-A61 Rare cases of early stopping（自主流程的「不要問、直接做」提醒）
- **中文摘要**：長 session 深處，模型偶爾會以「我現在來跑 X」這種純文字宣告結束回合而沒真的呼叫工具，或在已有足夠資訊時停下來問許可。自主 pipeline 應加一段 system reminder。
- **原文引文**：
  > "You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work."
  > "Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ('I'll…', 'let me know when…'), do that work now with tool calls."
- **出處**：…/prompting-claude-fable-5#rare-cases-of-early-stopping
- **適用**：Fable 5 / Mythos 5；自主 pipeline

#### T-A62 Rare cases of context-budget concern（不要把剩餘 token 倒數秀給模型看）
- **原文引文**：
  > "This is most often triggered when the harness shows a remaining-token countdown to the model. Avoid surfacing explicit context-budget counts where possible."
  > "You have ample context remaining. Do not stop, summarize, or suggest a new session on account of context limits. Continue the work."
- **出處**：…/prompting-claude-fable-5#rare-cases-of-context-budget-concern
- **適用**：Fable 5 / Mythos 5

#### T-A63 Give the reason, not only the request（給理由，不只給請求）
- **中文摘要**：Fable 5 理解請求背後的意圖時表現更好。官方給了一個可套用的句型模板。
- **原文引文**：
  > "I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request]."
- **出處**：…/prompting-claude-fable-5#give-the-reason-not-only-the-request
- **適用**：Fable 5 / Mythos 5
- **💡 可直接對應到 T-A02（給脈絡與動機），但這裡多了一個**可填空的模板**，很適合做成遊戲關卡。

#### T-A64 Readability when communicating with the user（最終摘要要「重新落地」而非延續工作腦內語言）
- **中文摘要**：長 agentic 對話後，模型容易寫出難懂的文字（箭頭鏈縮寫、深度實作細節、引用使用者沒看到的 thinking）。官方指出關鍵洞見：**工具呼叫之間用簡寫沒問題（那是你在想事情），但最終摘要的讀者沒看過那一切**；如果模型工作了很久而使用者沒在看，最終訊息是他們看到的第一眼，要當成「重新落地」而不是工作思緒的延續。
- **原文引文**：
  > "Terse shorthand is fine between tool calls (that's you thinking out loud, and brevity there is good). Your final summary is different: it's for a reader who didn't see any of that."
  > "The vocabulary you built up while working is yours, not theirs; leave it behind unless you re-introduce it."
  > "If you have to choose between short and clear, choose clear."
- **出處**：…/prompting-claude-fable-5#readability-when-communicating-with-the-user
- **適用**：Fable 5 / Mythos 5；長 agentic 對話
- **💡 這是一條非常適合做成關卡的「新技巧」：讀者意識 ＋ 摘要重新落地。**

#### T-A65 Create a send-to-user tool（做一個「直接顯示給使用者」的工具）
- **中文摘要**：長時間非同步代理時，給模型一個能在**不結束回合**的情況下把訊息原封不動顯示給使用者的工具。關鍵原理：**工具的輸入永遠不會被摘要，所以內容能完整送達**。但光定義工具不夠——沒有 system prompt 的引導語，Fable 5 很少會呼叫它。
- **原文引文**：
  > "Tool inputs are never summarized, so the content arrives intact."
  > "Defining the tool is not sufficient on its own; without an instruction in the system prompt, Claude Fable 5 rarely calls it."
  > "Between tool calls, when you have content the user must read verbatim (a partial deliverable, a direct answer to their question), call the send_to_user tool with that content. Use send_to_user only for user-facing content, not for narration or reasoning."
- **出處**：…/prompting-claude-fable-5#create-a-send-to-user-tool
- **適用**：Fable 5 / Mythos 5；長時間非同步代理

#### T-A66 Recommended scaffolding changes（4 條鷹架調整）
- **原文引文**：
  > "**Start at the top of your difficulty range.** Pick a task harder than what you'd assign to prior models."
  > "**Make self-verification explicit in long-run prompts.** Separate, fresh-context verifier subagents tend to outperform self-critique."
  > "Establish a method for checking your own work at an interval of [X] as you build. Run this every [X interval], verifying your work with subagents against the specification."
  > "**Refactor existing prompts and skills.** Skills developed for prior models are often too prescriptive for Claude Fable 5 and can degrade output quality."
- **出處**：…/prompting-claude-fable-5#recommended-scaffolding-changes
- **適用**：Fable 5 / Mythos 5

#### T-A67 ⚠️ 不要叫 Claude 覆述自己的推理（會觸發 `reasoning_extraction` 拒絕）
- **中文摘要**：叫模型把內部推理當作回應文字echo／轉錄／解釋出來的 prompt、skill 或 harness 指令，會在 Fable 5 上觸發 `reasoning_extraction` 拒絕類別，導致大量 fallback 到 Opus 4.8。遷移時要稽核既有 skill 與 system prompt 裡的「展示你的思考」指令。要看推理就去讀 adaptive thinking 的結構化 `thinking` blocks。
- **原文引文**：
  > "Prompts, skills, or harness instructions that tell the model to echo, transcribe, or explain its internal reasoning as response text can trigger the `reasoning_extraction` refusal category on Claude Fable 5, causing elevated fallbacks to Claude Opus 4.8."
- **出處**：…/prompting-claude-fable-5#recommended-scaffolding-changes
- **適用**：Fable 5
- **⚠️ 這推翻了一個常見的舊技巧（「請說明你的推理過程」），非常值得收進遊戲。**

---

## 五、A4：Prompting Claude Opus 5

> 頁面 URL：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
> 定位（原文）："Claude Opus 5 is built for complex agentic coding and enterprise work, with particular strengths in long-horizon agentic tasks."

#### T-A68 ⚠️ Code review：不要說「只回報高嚴重度」
- **中文摘要**：Opus 5 會**照字面執行**你的過濾指令。若 review prompt 說「只回報高嚴重度問題」或「保守一點」，它會照做而回報變少。正確做法是要求它**全部回報，再用另一個 pass 過濾**。
- **原文引文**：
  > "If your review prompt says 'only report high-severity issues' or 'be conservative,' the model may follow that instruction literally and report less; ask it to report everything and filter in a separate pass instead."
- **出處**：…/prompting-claude-opus-5#capability-improvements
- **適用**：Claude Opus 5

#### T-A69 Response length and verbosity（effort 控制的是「想多少」不是「說多少」）
- **中文摘要**：Opus 5 預設回應比前代長。關鍵觀念：**`effort` 參數控制的是模型「思考」多少，不是「說」多少**——降 effort 不會可靠地縮短可見回應。要控制長度就要明確 prompt。長 system prompt 中，建議在**結尾附近**再放一次簡短提醒。
- **原文引文**：
  > "The effort parameter controls how much the model thinks rather than how much it says: lowering effort can reduce thinking volume without reliably shortening the visible response. To control response length, prompt for it explicitly."
  > "Keep responses focused, brief, and concise. Keep disclaimers and caveats short, and spend most of the response on the main answer."
  > `<tone_preference>Keep outputs reasonably concise.</tone_preference>`
- **出處**：…/prompting-claude-opus-5#response-length-and-verbosity
- **適用**：Claude Opus 5

#### T-A70 User-facing progress updates（描述你要的節奏與形狀）
- **中文摘要**：要調降旁白，就描述你想要的**節奏與形狀**，而不是禁止。官方也重申：**正面示範比「不要做什麼」的指令有效**。
- **原文引文**：
  > "Before your first tool call, say in one sentence what you're about to do. While working, give a brief update only when you find something important or change direction. When you finish, lead with the outcome."
  > "Positive examples of the communication style you want tend to be more effective than instructions about what not to do."
- **出處**：…/prompting-claude-opus-5#user-facing-progress-updates
- **適用**：Claude Opus 5

#### T-A71 Written deliverable length（寫到檔案的文件長度要另外校準）
- **中文摘要**：對話冗長度與「寫到磁碟的文件長度」是兩回事，要分開下指令。
- **原文引文**：
  > "Match the length of written documents to what the task needs: cover the substance, but do not pad with filler sections, redundant summaries, or boilerplate."
- **出處**：…/prompting-claude-opus-5#written-deliverable-length
- **適用**：Claude Opus 5

#### T-A72 ⚠️ Task scope and over-verification（要「刪掉」驗證指令）
- **原文引文**：
  > "Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions ('include a final verification step for any non-trivial task,' 'use a subagent to verify'), remove them."
  > "Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work."
  > "If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it."
- **出處**：…/prompting-claude-opus-5#task-scope-and-over-verification
- **適用**：Claude Opus 5

#### T-A73 Controlling subagent spawning（Opus 5 版）
- **原文引文**：
  > "Delegate to a subagent only for large tasks that are genuinely independent and parallelizable, such as a wide multi-file investigation. Do not delegate work you can finish yourself in a handful of tool calls, and do not use subagents to verify or double-check your own work."
- **出處**：…/prompting-claude-opus-5#controlling-subagent-spawning
- **適用**：Claude Opus 5

#### T-A74 Self-correction（不要再叫它 double-check，並限制修正旁白）
- **原文引文**：
  > "Avoid instructing re-checks it already performs ('double-check your answer,' 're-verify before responding'); like verification instructions, these compound with the model's own behavior and add cost without improving results."
  > "Only correct an earlier statement when the error would change the user's code, conclusions, or decisions… For slips that change nothing for the user, make the fix and move on without noting it."
- **出處**：…/prompting-claude-opus-5#self-correction
- **適用**：Claude Opus 5

#### T-A75 ⚠️ Running with thinking disabled（關閉 thinking 的兩種副作用與解法）
- **中文摘要**：Opus 5 關閉 thinking 時偶爾會出現兩種問題：(1) **把工具呼叫寫成文字**（呼叫不會執行，且洩漏的文字會留在對話歷史影響後續回合）；(2) **把 `<thinking>` 等內部 XML 標籤吐到可見回應**。主要解法是**保持 thinking 開著、用低 effort 控成本**——「thinking 開著跑 low effort」在相近成本下比「關閉 thinking」表現更好。若 system prompt 有「不要思考／不要推理」的規則，**刪掉它**，那種指令會增加標籤洩漏。另外，**點名 thinking 標籤反而比通用寫法無效**。
- **原文引文**：
  > "for most tasks, thinking enabled at `low` effort performs better than thinking disabled at similar cost."
  > "If your system prompt contains a rule instructing the model not to think or not to reason, remove it; that kind of instruction increases tag leakage."
  > "When you use a tool, you may say a brief sentence first. If no tool can express what the user asked for, say so instead of guessing. Do not include internal or system XML tags in your response."
  > "Instructions that call out thinking tags by name are less effective than the general form, so avoid naming them specifically."
- **出處**：…/prompting-claude-opus-5#running-with-thinking-disabled
- **適用**：Claude Opus 5，thinking 關閉時

---

## 六、A5：Prompting Claude Sonnet 5

> 頁面 URL：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5

#### T-A76 Response length and verbosity（依任務複雜度自動校準）
- **原文引文**：
  > "Claude Sonnet 5 calibrates response length to the complexity of the task rather than defaulting to a fixed verbosity."
  > "Provide concise, focused responses. Skip non-essential context, and keep examples minimal."
  > "Positive examples showing how Claude can communicate with the appropriate level of concision tend to be more effective than negative examples or instructions that tell the model what not to do."
- **出處**：…/prompting-claude-sonnet-5#response-length-and-verbosity
- **適用**：Claude Sonnet 5

#### T-A77 Effort 等級完整定義（max / xhigh / high / medium / low）
- **原文引文**：
  > "**`max`:** Absolute maximum capability with no constraints on token spending."
  > "**`xhigh`:** Extra high effort is the recommended setting for the hardest coding and agentic use cases."
  > "**`high`:** The default. This setting balances token usage and intelligence for most use cases."
  > "**`medium`:** Good for cost-sensitive use cases that need to reduce token usage while trading off intelligence."
  > "**`low`:** Reserve for short, scoped tasks and latency-sensitive workloads that are not intelligence-sensitive."
- **跨模型對照（原文）**：
  > "Claude Sonnet 5 at medium is comparable in intelligence to Claude Sonnet 4.6 at high, and Claude Sonnet 5 at high is comparable to Claude Sonnet 4.6 at max. When benchmarking, match by observed thinking length rather than effort name."
- **出處**：…/prompting-claude-sonnet-5#calibrating-effort-and-thinking-depth
- **適用**：Claude Sonnet 5

#### T-A78 推理太淺時「先調 effort，不要用 prompt 硬繞」
- **原文引文**：
  > "If you observe shallow reasoning on complex problems, raise effort to `high` or `xhigh` rather than prompting around it. If you need to keep effort at `low` for latency, add targeted guidance: 'This task involves multistep reasoning. Think carefully through the problem before responding.'"
- **出處**：同上
- **適用**：Claude Sonnet 5 / Opus 4.8

#### T-A79 ⚠️ `max_tokens` 要留思考空間；新 tokenizer 多 ~30% tokens
- **原文引文**：
  > "if the budget is tight, you may see a response that is almost entirely thinking followed by a truncated answer and `stop_reason: \"max_tokens\"`."
  > "Because Claude Sonnet 5 uses a new tokenizer that produces approximately 30% more tokens for the same text, `max_tokens` limits tuned for Claude Sonnet 4.6 may truncate equivalent output."
- **出處**：同上
- **適用**：Claude Sonnet 5

#### T-A80 Tool use triggering（thinking 關閉時要明確推一把）
- **原文引文**：
  > "With thinking disabled, the model is less likely to reach for tools or consider searching; if you rely on tool calls with thinking off, add an explicit nudge in the system prompt."
  > "`high` or `xhigh` effort settings show substantially more tool usage in agentic search and coding."
- **出處**：…/prompting-claude-sonnet-5#tool-use-triggering
- **適用**：Claude Sonnet 5

#### T-A81 ⚠️ 把「每 3 次工具呼叫就摘要一次」這類鷹架拿掉
- **原文引文**：
  > "If you've added scaffolding to force interim status messages ('After every 3 tool calls, summarize progress'), try removing it."
- **出處**：…/prompting-claude-sonnet-5#user-facing-progress-updates
- **適用**：Claude Sonnet 5 / Opus 4.8

#### T-A82 More literal instruction following（明確寫出適用範圍）
- **中文摘要**：Sonnet 5 照字面解讀，**不會把一項指令默默推廣到另一項**，也不會推測你沒提的需求。要它廣泛套用，就要明講範圍。
- **原文引文**：
  > "It does not silently generalize an instruction from one item to another, and it does not infer requests you didn't make."
  > "If you need Claude to apply an instruction broadly, state the scope explicitly (for example, 'Apply this formatting to every section, not just the first one')."
- **出處**：…/prompting-claude-sonnet-5#more-literal-instruction-following
- **適用**：Claude Sonnet 5 / Opus 4.8

#### T-A83 ⚠️ `temperature` / `top_p` / `top_k` 在 Sonnet 5 上會回 400 錯誤
- **中文摘要**：這是 Sonnet 級模型的新限制。以前靠 `temperature` 取得風格變化的做法要改成**用 system prompt 指令**引導語氣與多樣性。
- **原文引文**：
  > "if you previously relied on `temperature` for stylistic variety, note that setting `temperature`, `top_p`, or `top_k` to a non-default value returns a 400 error on Claude Sonnet 5. This constraint is new for Sonnet-class models."
- **出處**：…/prompting-claude-sonnet-5#tone-and-writing-style
- **適用**：Claude Sonnet 5
- **⚠️ 對遊戲的意義**：若 curriculum 有「調 temperature 控制隨機性／一致性」的技巧，需要標註它在最新 Claude 模型上已不適用。

#### T-A84 Design and frontend defaults：兩個可靠的破解手法
- **中文摘要**：模型在開放式前端／設計題上會落入固定的預設風格。**通用指令（「別用那個顏色」「乾淨簡約一點」）只會讓它換到另一組固定色盤，不會產生多樣性。** 兩個可靠做法：(1) **指定具體替代方案**（模型會精確遵循詳細規格）；(2) **先讓模型提出選項再建構**——因為 Sonnet 5 不接受 `temperature`，這是產生跨次執行差異的**建議做法**。
- **原文引文**：
  > "Generic instructions ('don't use that color,' 'make it clean and minimal') tend to shift the model to a different fixed palette rather than producing variety."
  > "Before building, propose 4 distinct visual directions tailored to this brief (each as: bg hex / accent hex / typeface, plus a one-line rationale). Ask the user to pick one, then implement only that direction."
- **出處**：…/prompting-claude-sonnet-5#design-and-frontend-defaults
- **適用**：Claude Sonnet 5
- **💡 「先提選項再建構」是一條非常適合做關卡的新技巧。**

#### T-A85 Interactive coding products（把任務規格一次講完，減少來回）
- **原文引文**：
  > "To maximize both performance and token efficiency in coding products, use `xhigh` or `high` effort, add autonomous features like an auto mode, and reduce the number of human interactions required from your users."
  > "ambiguous or underspecified prompts conveyed progressively over multiple user turns tend to relatively reduce token efficiency and sometimes performance."
- **出處**：…/prompting-claude-sonnet-5#interactive-coding-products
- **適用**：Claude Sonnet 5 / Opus 4.8

#### T-A86 Code review harnesses（把「過濾」跟「發現」分成兩階段）
- **中文摘要**：舊 harness 遷移到 Sonnet 5 可能看到 recall 下降——這是 harness 效應不是能力退步。模型照你說的「保守一點」執行，調查一樣深入、找到一樣多 bug，但**不回報**低於你設定門檻的發現。解法是把「信心過濾」搬出「發現階段」。若一定要單 pass 自我過濾，就要**具體說明門檻在哪**，不要用「重要」這種定性詞。
- **原文引文**：
  > "Report every issue you find, including ones you are uncertain about or consider low-severity. Do not filter for importance or confidence at this stage - a separate verification step will do that. Your goal here is coverage: it is better to surface a finding that later gets filtered out than to silently drop a real bug."
  > "be concrete about where the bar is rather than using qualitative terms like 'important': for example, 'report any bugs that could cause incorrect behavior, a test failure, or a misleading result; only omit nits like pure style or naming preferences.'"
- **出處**：…/prompting-claude-sonnet-5#code-review-harnesses
- **適用**：Claude Sonnet 5 / Opus 4.8

#### T-A87 Computer use 解析度建議
- **原文引文**：
  > "Internal computer use testing shows that sending images at 1080p provides a good balance of performance and cost."
  > "For particularly cost-sensitive workloads, 720p or 1366×768 are lower-cost options with strong performance."
- **出處**：…/prompting-claude-sonnet-5#computer-use
- **適用**：Claude Sonnet 5（`computer_20251124`）／Opus 4.8

---

## 七、A6：Prompting Claude Opus 4.8

> 頁面 URL：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8
> 大部分條目與 Sonnet 5 同（T-A76、T-A78、T-A81、T-A82、T-A85、T-A86、T-A87 皆有對應段落）。以下只列 Opus 4.8 特有者。

#### T-A88 Effort 起手建議與 `max` 的「過度思考」風險
- **原文引文**：
  > "Start with the `xhigh` effort level for coding and agentic use cases, and use a minimum of `high` effort for most intelligence-sensitive use cases."
  > "**`max`:** Max effort can deliver performance gains in some use cases, but may show diminishing returns from increased token usage. This setting can also sometimes be prone to overthinking."
  > "Effort is likely to be more important for this model than for any prior Opus, so experiment with it actively when you upgrade."
- **輸出預算建議（原文）**：
  > "If you are running Claude Opus 4.8 at `max` or `xhigh` effort, set a large max output token budget… Start at 64k tokens and tune from there."
- **出處**：…/prompting-claude-opus-4-8#calibrating-effort-and-thinking-depth
- **適用**：Claude Opus 4.8

#### T-A89 Tool use triggering：Opus 4.8 偏好「推理」多過「呼叫工具」
- **原文引文**：
  > "Claude Opus 4.8 has a tendency to favor reasoning over tool calls. This produces better results in most cases. However, increasing the effort setting is a useful lever to increase the level of tool usage, especially in knowledge work."
- **出處**：…/prompting-claude-opus-4-8#tool-use-triggering
- **適用**：Claude Opus 4.8

#### T-A90 Controlling subagent spawning：Opus 4.8 **預設偏少**（與 Opus 5 相反）
- **原文引文**：
  > "Claude Opus 4.8 tends to spawn fewer subagents by default. However, this behavior is steerable through prompting; give Claude Opus 4.8 explicit guidance around when subagents are desirable."
  > "Do not spawn a subagent for work you can complete directly in a single response… Spawn multiple subagents in the same turn when fanning out across items or reading multiple files."
- **出處**：…/prompting-claude-opus-4-8#controlling-subagent-spawning
- **適用**：Claude Opus 4.8

#### T-A91 Opus 4.8 的「預設家風」（具體描述其預設設計語言）
- **中文摘要**：官方明確描述了 Opus 4.8 的預設視覺風格，讓你知道要覆蓋什麼：暖奶油／米白背景（約 `#F4F1EA`）、襯線標題字（Georgia、Fraunces、Playfair）、斜體單字強調、赤陶／琥珀點綴色。這在編輯、餐旅、作品集類型讀起來不錯，但在 dashboard、開發工具、金融科技、醫療、企業應用上會顯得不對。
- **原文引文**：
  > "Claude Opus 4.8 has strong design instincts, with a consistent default house style: warm cream/off-white backgrounds (~`#F4F1EA`), serif display type (Georgia, Fraunces, Playfair), italic word-accents, and a terracotta/amber accent."
  > "This default is persistent."
- **出處**：…/prompting-claude-opus-4-8#design-and-frontend-defaults
- **適用**：Claude Opus 4.8

#### T-A92 Tone：Opus 4.8 預設風格是「直接、有主見、少驗證性用語、少 emoji」
- **原文引文**：
  > "Claude Opus 4.8 tends toward a direct, opinionated style with minimal validation-forward phrasing and sparing emoji use."
  > "Use a warm, collaborative tone. Acknowledge the user's framing before answering."
- **出處**：…/prompting-claude-opus-4-8#tone-and-writing-style
- **適用**：Claude Opus 4.8

---

## 八、A7 / A8：Tool use（工具使用與工具定義）

#### T-A93 Claude 何時會呼叫工具（可用 system prompt 調整）
- **中文摘要**：預設 `tool_choice: {"type": "auto"}` 下，Claude 每回合自行決定。**判斷邊界可以用 system prompt 調整**——官方給了三個強度等級的範例句。
- **原文引文**：
  > "It calls a tool when the request maps to that tool's described capability and the answer isn't already in context. It responds directly for stable knowledge, creative tasks, and conversational turns."
  > 增加：`"Use the tools to investigate before responding."` → 更強：`"Always call a tool first before responding."` → 保守：`"Use your judgment about whether to call a tool or respond directly."`
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview#when-claude-uses-tools
- **適用**：所有支援工具的 Claude 模型

#### T-A94 缺少必要參數時的模型差異
- **原文引文**：
  > "If the user's prompt doesn't include enough information to fill all the required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it. Claude Sonnet might ask, especially when prompted to think before outputting a tool request. But it might also infer a reasonable value."
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview#when-claude-uses-tools
- **適用**：Opus vs Sonnet 差異

#### T-A95 ⭐ 工具描述要「極其詳細」（工具效能最重要的因素）
- **中文摘要**：這是官方明講「**目前為止最重要**」的工具效能因素。描述要涵蓋：工具做什麼、**什麼時候該用（以及什麼時候不該用）**、每個參數的意義與影響、重要的注意事項與限制（包含「這個工具不會回傳什麼」）。**每個工具描述至少 3–4 句，複雜的要更多。**
- **原文引文**：
  > "**Provide extremely detailed descriptions.** This is by far the most important factor in tool performance."
  > "Aim for at least 3–4 sentences for each tool description, more if the tool is complex."
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions
- **適用**：所有支援工具的 Claude 模型

#### T-A96 `input_examples`（給複雜工具提供 schema 驗證過的輸入範例）
- **原文引文**：
  > "Clear descriptions are most important, but for tools with complex inputs, nested objects, or format-sensitive parameters, you can use the `input_examples` field to provide schema-validated examples."
  > "Examples are included in the prompt alongside your tool schema, showing Claude concrete patterns for well-formed tool calls."
- **限制（原文）**：每個範例必須通過 `input_schema` 驗證（否則 400）；不支援 server tools；簡單範例約 20–50 tokens、複雜巢狀約 100–200 tokens。
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#providing-tool-use-examples
- **適用**：user-defined 與 Anthropic-schema client tools

#### T-A97 把相關操作**合併**成較少的工具
- **原文引文**：
  > "Rather than creating a separate tool for every action (`create_pr`, `review_pr`, `merge_pr`), group them into a single tool with an `action` parameter. Fewer, more capable tools reduce selection ambiguity and make your tool surface easier for Claude to navigate."
- **出處**：同 T-A95
- **適用**：所有支援工具的 Claude 模型

#### T-A98 工具命名要有 namespace
- **原文引文**：
  > "When your tools span multiple services or resources, prefix names with the service (for example, `github_list_prs`, `slack_send_message`). This makes tool selection unambiguous as your library grows."
- **出處**：同 T-A95
- **適用**：多服務工具庫；搭配 tool search 時特別重要

#### T-A99 工具回傳只給「高訊號」資訊
- **原文引文**：
  > "Return semantic, stable identifiers (for example, slugs or UUIDs) rather than opaque internal references, and include only the fields Claude needs to reason about its next step. Bloated responses waste context and make it harder for Claude to extract what matters."
- **出處**：同 T-A95
- **適用**：所有支援工具的 Claude 模型

#### T-A100 好／壞工具描述對照（官方範例）
- **好（原文）**：
  > "Retrieves the current stock price for a given ticker symbol. The ticker symbol must be a valid symbol for a publicly traded company on a major US stock exchange like NYSE or NASDAQ. The tool will return the latest trade price in USD. It should be used when the user asks about the current or most recent price of a specific stock. It will not provide any other information about the stock or company."
- **壞（原文）**：
  > "Gets the stock price for a ticker."
- **官方解說**：
  > "The good description clearly explains what the tool does, when to use it, what data it returns, and what the `ticker` parameter means."
- **出處**：同 T-A95
- **適用**：所有支援工具的 Claude 模型

#### T-A101 `tool_choice` 四種模式與副作用
- **原文引文**：
  > "`auto` allows Claude to decide whether to call any provided tools or not… `any` tells Claude that it must use one of the provided tools, but doesn't force a particular tool. `tool` forces Claude to always use a particular tool. `none` prevents Claude from using any tools."
- **重要副作用（原文）**：
  > "when you have `tool_choice` as `any` or `tool`, the API prefills the assistant message to force a tool to be used. This means that the models will not emit a natural language response or explanation before `tool_use` content blocks, even if explicitly asked to do so."
- **替代做法（原文）**：
  > "If you would like the model to provide natural language context or explanations while still requesting that the model use a specific tool, you can use `{\"type\": \"auto\"}` for `tool_choice` (the default) and add explicit instructions in a `user` message. For example: `What's the weather like in London? Use the get_weather tool in your response.`"
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use
- **適用**：所有支援工具的 Claude 模型

#### T-A102 Strict tool use（保證 schema 一致）
- **原文引文**：
  > "Add `strict: true` to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
  > "Combine `tool_choice: {\"type\": \"any\"}` with strict tool use to guarantee both that one of your tools will be called AND that the tool inputs strictly follow your schema."
- **出處**：https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
- **適用**：custom tools

#### 延伸閱讀（官方指向）
- Writing tools for agents（工具設計深度指南）：https://www.anthropic.com/engineering/writing-tools-for-agents
- Improving frontend design through skills：https://www.claude.com/blog/improving-frontend-design-through-skills
- frontend-design skill 完整定義：https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md

---

## 九、A9：部落格 Best practices for prompt engineering（2025-11-10）

> ＊此頁 WebFetch 的擷取模型有重排版面。以下引文為擷取結果中標為原文的句子，**引用到遊戲前建議再人工核對原頁**。
> URL：https://claude.com/blog/best-practices-for-prompt-engineering

#### T-A103 Give permission to express uncertainty（允許說「我不知道」）
- **中文摘要**：明確允許模型承認限制，而不是硬猜，可以減少幻覺、提升可靠性。
- **原文引文**：
  > "Reduce hallucinations and increase reliability" by explicitly permitting uncertainty.
  > 範例："If the data is insufficient to draw conclusions, say so rather than speculating."
- **適用**：全部
- **💡 這條在 A1 主頁沒有獨立章節，是部落格特有的獨立技巧。**

#### T-A104 ⚠️ XML 標籤「已較不必要」（但仍有用）
- **中文摘要**：部落格把 XML 標籤列在「對現代模型較不必要的技巧」下：仍然有用，但適用情境縮小到極複雜的混合內容 prompt、需要絕對確定內容邊界、或使用舊版模型。現代替代方案是清楚的標題、空白與明確的語言。
- **原文引文**：
  > **Status:** "Less necessary but still useful in specific situations"
  > **Modern Alternative:** "Clear headings, whitespace, and explicit language often work just as well."
- **⚠️ 注意**：這與 A1 主頁的 T-A04（仍把 XML 標籤列為 General principles）**語氣不同**。收進遊戲時應以 A1 為準，並可把此條當作「進階提醒」。

#### T-A105 ⚠️ Role prompting 不要過度限制
- **原文引文**：
  > "Don't over-constrain the role. Overly specific roles can limit the AI's helpfulness."
  > **Modern Alternative:** "Be explicit about desired perspective rather than assigning a role."
- **適用**：全部

#### T-A106 技巧選擇的決策框架（Decision Framework）
- **中文摘要**：官方給了一個選技巧的順序：1) 請求夠清楚明確嗎？不夠就先修清晰度。2) 任務簡單嗎？只用核心技巧。3) 需要特定格式嗎？用範例或 prefill。4) 任務複雜嗎？考慮拆解（chaining）。5) 需要推理嗎？用 extended thinking 或 CoT。
- **適用**：全部
- **💡 這是一個很適合做成遊戲「導覽 / 選技巧」機制的結構。**

#### T-A107 常見錯誤與「最好的 prompt」定義
- **原文引文**：
  > "The best prompt isn't the longest or most complex. It's the one that achieves your goals reliably with the minimum necessary structure."
  > "**Don't over-engineer:** Longer, more complex prompts are NOT always better"
  > "**Don't use every technique at once:** Select techniques addressing your specific challenge"
  > "For instructions you want applied to every session rather than every prompt, move them into CLAUDE.md files, skills, or other steering methods."
- **官方的疑難排解對照表（摘要）**：回應太籠統→加具體性／範例／明確要求完整；回應離題→講清楚真正目標與動機；格式不一致→加 few-shot 或 prefill；太複雜不可靠→拆成多個 prompt（chaining）；有多餘開場白→prefill 或明確要求跳過；胡編亂造→明確允許說「我不知道」；只給建議不動手→用祈使句。
- **適用**：全部

---

## 十、給 PromptArcade 的稽核備註（不是官方內容）

以下是本次擷取中發現、**與遊戲現有 68 條技巧可能有落差**的重點（僅為快速印象，正式 gap analysis 另做）：

1. **已被官方推翻／改變適用範圍的舊技巧**：prefill 預填回應（T-A17，4.6+ 不支援）、thinking `budget_tokens`（T-A28，4.7+ 報錯）、`temperature`/`top_p`/`top_k`（T-A83，Sonnet 5 報錯）、prompt chaining 的定位下降（T-A43）、XML 標籤「較不必要」的說法（T-A104）、「請說明你的推理過程」可能觸發拒絕（T-A67）。
2. **全新技巧（遊戲很可能未涵蓋）**：進度宣稱要有工具結果佐證（T-A57）、記憶系統設計（T-A60）、給理由的填空模板（T-A63）、最終摘要要「重新落地」（T-A64）、send-to-user 工具（T-A65）、先提設計選項再建構（T-A84）、自我檢查在 Opus 5 上要**刪掉**（T-A34/T-A72）、平行工具呼叫（T-A26）、可逆性／確認邊界（T-A40）、code review 的「發現與過濾分兩階段」（T-A86）、給 vision 一個 crop 工具（T-A48）。
3. **強度反轉**：以前要「加強語氣避免偷懶」，現在要「調弱語氣避免過度觸發」（T-A25、T-A27、T-A50-6）。

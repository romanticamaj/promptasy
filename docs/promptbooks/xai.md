# xAI（Grok）官方 Prompt Engineering 教學總覽（Promptbook）

> **用途**：這份文件是 PromptArcade 用來稽核遊戲內容涵蓋度的**參考資料**，不是遊戲內容本身。
> 目標是把 xAI 官方文件裡「每一條不同的技巧／建議」逐條收錄，附上原文短引文與可點的出處連結。
> **原則**：不改寫、不臆造。不確定的地方一律直接引用原文。中文摘要僅為理解輔助，**官方說法以引文與連結為準**。

- **廠商（vendor）**：xAI（文件中新署名為「SpaceXAI」）
- **擷取日（capture date）**：2026-07-30
- **擷取方式**：以 `https://docs.x.ai/llms.txt`（官方全站 Markdown 匯出，1,300,844 bytes / 147 個頁面）為主，並對個別頁面以 `<path>.md` 端點與 HTML 交叉驗證
- **文件結構**：依 xAI 自己的資訊架構分節（Models → Model capabilities → Tools → Advanced API usage → Grok Build（coding agent）→ Voice → Imagine）

---

## ⚠️ 0. 首要發現：xAI 已把「Prompt Engineering 指南」整頁下架

**`https://docs.x.ai/docs/guides/grok-code-prompt-engineering`（`curriculum.json` 目前引用的 xAI 第一順位來源）現在回傳 HTTP 404。**

- 直接以 curl 抓取：`404`（含 `.md` 端點亦為 `{"error":"Page not found"}`）。
- WebFetch：`The server returned HTTP 404 Not Found.`
- Wayback Machine：兩次嘗試皆被限流（`429 Too Many Requests`），無法取得存檔快照。
- 該頁對應的模型 `grok-code-fast-1` 已改名為 **Grok Build 0.1**（`grok-build-0.1`），`grok-code-fast-1` 現為別名；新的 `https://docs.x.ai/developers/models/grok-code-fast-1` 頁面**只有規格表，沒有任何 prompt engineering 內容**。
- 全站 `llms.txt` 的 147 個頁面中，**沒有任何一頁標題含「Prompt Engineering」**。

**結論**：截至 2026-07-30，xAI **不再有一份獨立的 prompt engineering 指南**。現存的提示教學散落在各能力頁的「Best Practices」小節裡。這對遊戲的影響見 §12。

> 唯一在搜尋引擎快取中仍可見該頁摘要（Bing/Google 索引），內容涵蓋「提供具體 context」「使用詳細 system prompt」「用 XML 或 Markdown 標記 context 區塊」「使用原生 tool-calling 而非 XML 格式的工具輸出」「適合 agentic 任務而非 one-shot 查詢」五點。**這五點無法一手驗證（原頁已 404），本檔不將其列為可引用的官方條目**，僅在此註記，供團隊決定是否從 `curriculum.json` 移除或替換該來源。

---

## 1. 來源清單（Source list）

全部經 `https://docs.x.ai/llms.txt` 於 2026-07-30 一次性取得（該檔為官方維護的全站 Markdown 匯出）。**xAI 文件頁面不標示 last updated 日期**，故一律記為「未標示，擷取日 2026-07-30」。頁面內容的時效可由 `Release Notes` 交叉推定（最新條目為 2026 年 7 月：`grok-voice-think-fast-2.0`、Grok 4.5 EU 上線）。

| # | 文件 | URL | last updated |
|---|---|---|---|
| X1 | Grok 4.5（旗艦模型指南） | https://docs.x.ai/developers/grok-4-5 | 未標示，擷取日 2026-07-30 |
| X2 | Reasoning（`reasoning_effort`） | https://docs.x.ai/developers/model-capabilities/text/reasoning | 未標示，擷取日 2026-07-30 |
| X3 | Generate Text（Responses API） | https://docs.x.ai/developers/model-capabilities/text/generate-text | 未標示，擷取日 2026-07-30 |
| X4 | Structured Outputs | https://docs.x.ai/developers/model-capabilities/text/structured-outputs | 未標示，擷取日 2026-07-30 |
| X5 | Multi Agent（beta） | https://docs.x.ai/developers/model-capabilities/text/multi-agent | 未標示，擷取日 2026-07-30 |
| X6 | Comparison with Chat Completions API | https://docs.x.ai/developers/model-capabilities/text/comparison | 未標示，擷取日 2026-07-30 |
| X7 | Tools Overview | https://docs.x.ai/developers/tools/overview | 未標示，擷取日 2026-07-30 |
| X8 | Function Calling | https://docs.x.ai/developers/tools/function-calling | 未標示，擷取日 2026-07-30 |
| X9 | Code Execution Tool（**含 Best Practices**） | https://docs.x.ai/developers/tools/code-execution | 未標示，擷取日 2026-07-30 |
| X10 | Web Search | https://docs.x.ai/developers/tools/web-search | 未標示，擷取日 2026-07-30 |
| X11 | X Search | https://docs.x.ai/developers/tools/x-search | 未標示，擷取日 2026-07-30 |
| X12 | Collections Search | https://docs.x.ai/developers/tools/collections-search | 未標示，擷取日 2026-07-30 |
| X13 | Citations | https://docs.x.ai/developers/tools/citations | 未標示，擷取日 2026-07-30 |
| X14 | Tool Usage Details（`max_turns`） | https://docs.x.ai/developers/tools/tool-usage-details | 未標示，擷取日 2026-07-30 |
| X15 | Advanced Tool Usage | https://docs.x.ai/developers/tools/advanced-usage | 未標示，擷取日 2026-07-30 |
| X16 | Remote MCP | https://docs.x.ai/developers/tools/remote-mcp | 未標示，擷取日 2026-07-30 |
| X17 | Prompt Caching — Best Practices & FAQ | https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices | 未標示，擷取日 2026-07-30 |
| X18 | Prompt Caching — Maximizing Cache Hits | https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits | 未標示，擷取日 2026-07-30 |
| X19 | Prompt Caching — What Breaks Caching | https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn | 未標示，擷取日 2026-07-30 |
| X20 | Context Compaction | https://docs.x.ai/developers/advanced-api-usage/context-compaction | 未標示，擷取日 2026-07-30 |
| X21 | Grok Build（coding agent 總覽） | https://docs.x.ai/build/overview | 未標示，擷取日 2026-07-30 |
| X22 | AGENTS.md（Project rules） | https://docs.x.ai/build/features/project-rules | 未標示，擷取日 2026-07-30 |
| X23 | Plan Mode | https://docs.x.ai/build/features/plan-mode | 未標示，擷取日 2026-07-30 |
| X24 | Subagents | https://docs.x.ai/build/features/subagents | 未標示，擷取日 2026-07-30 |
| X25 | Skills, Plugins & Marketplaces | https://docs.x.ai/build/features/skills-plugins-marketplaces | 未標示，擷取日 2026-07-30 |
| X26 | Modes and Commands | https://docs.x.ai/build/modes-and-commands | 未標示，擷取日 2026-07-30 |
| X27 | Text to Speech（**含 Best Practices / Speech Tags**） | https://docs.x.ai/developers/model-capabilities/audio/text-to-speech | 未標示，擷取日 2026-07-30 |
| X28 | Speech to Speech（**含 Best Practices / 模型專屬提示建議**） | https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech | 未標示，擷取日 2026-07-30 |
| X29 | Image Generation | https://docs.x.ai/developers/model-capabilities/images/generation | 未標示，擷取日 2026-07-30 |
| X30 | Image Editing | https://docs.x.ai/developers/model-capabilities/images/editing | 未標示，擷取日 2026-07-30 |
| X31 | Video Generation | https://docs.x.ai/developers/model-capabilities/video/generation | 未標示，擷取日 2026-07-30 |
| X32 | Chat with Files | https://docs.x.ai/developers/model-capabilities/files/chat-with-files | 未標示，擷取日 2026-07-30 |
| X33 | May 15 Retirement（遷移建議） | https://docs.x.ai/developers/migration/may-15-retirement | 未標示，擷取日 2026-07-30 |
| X34 | Release Notes | https://docs.x.ai/developers/release-notes | 最新條目：2026 年 7 月 |
| X35 | Models | https://docs.x.ai/developers/models | 未標示，擷取日 2026-07-30 |

### 擷取失敗

| URL | 結果 | 備註 |
|---|---|---|
| https://docs.x.ai/docs/guides/grok-code-prompt-engineering | **404（頁面已下架）** | curl 與 WebFetch 各試一次皆 404；Wayback 兩次皆 429 限流。詳見 §0。 |
| https://docs.x.ai/docs/guides/function-calling | 200，但為舊路徑 | 現行正規路徑為 `/developers/tools/function-calling`（本檔採用後者） |
| https://docs.x.ai/developers/models/grok-4.5 | 200 | 純規格頁，無提示教學（提示教學在 `/developers/grok-4-5`） |

---

## 2. 模型層級的提示決策（X1、X2、X33）

### X-01 `reasoning_effort`：Grok 4.5 的三級推理深度，預設 high，**不能關閉**

**中文摘要**：Grok 4.5 用 `reasoning_effort` 控制回答前思考多少。與 Gemini 不同的是——xAI 明講**推理無法關閉**，而且**推理模型不接受 `presencePenalty` / `frequencyPenalty` / `stop`**（送了會直接報錯）。

> "`grok-4.5` supports the `reasoning_effort` parameter, which controls how much effort the model spends thinking before responding."
> "If not specified, `reasoning_effort` defaults to `\"high\"`. Reasoning cannot be disabled."
> "`presencePenalty`, `frequencyPenalty`, and `stop` cannot be used with reasoning models. Requests that include them return an error."
> — https://docs.x.ai/developers/model-capabilities/text/reasoning#the-reasoning_effort-parameter

三級對照（官方原表，一字未改）：
> "`\"low\"` | Uses some reasoning tokens, but still fast | Latency-sensitive agentic use and simple tool calling."
> "`\"medium\"` | More thinking for less-latency sensitive applications | Complex data analysis and long-context reasoning."
> "`\"high\"` (default) | Uses more reasoning tokens for deeper thinking | Very challenging problems, complex math, multi-step logic, competition-level tasks"

**適用**：`grok-4.5`。

---

### X-02 多代理模型的 `reasoning.effort` 意義完全不同：控制**代理數量**而非思考深度

**中文摘要**：這是一個很容易踩的陷阱——同一個參數名，在 `grok-4.20-multi-agent` 上控制的是「有幾個 agent 協作」（4 或 16 個），多一級 `xhigh`。

> "For `grok-4.20-multi-agent`, the `reasoning.effort` parameter controls **how many agents** collaborate on a request rather than reasoning depth."
> "`grok-4.20-multi-agent` | `reasoning.effort`: `\"low\"` / `\"medium\"` / `\"high\"` / `\"xhigh\"` | Controls agent count (4 or 16)"
> — https://docs.x.ai/developers/model-capabilities/text/reasoning#multi-agent-model

**適用**：`grok-4.20-multi-agent`（beta）。

---

### X-03 遷移時要「明確選擇要付多少推理」

**中文摘要**：舊模型下線後會被自動轉址到 `grok-4.3`，但轉址會套用預設的 reasoning effort。xAI 建議**明確指定**，而不是接受轉址的預設值。

> "In most cases, migrating is as simple as changing the `\"model\"` field in your API request. Doing so explicitly lets you control which reasoning effort you pay for, rather than accepting the default applied by the redirect."
> "If your workload benefits from deeper reasoning, set `medium` or `high` reasoning effort explicitly on your requests."
> — https://docs.x.ai/developers/migration/may-15-retirement#recommended-replacements

官方遷移對照（節錄）：
| 退役模型 | 建議替代 |
|---|---|
| `grok-4-1-fast-reasoning` / `grok-4-fast-reasoning` / `grok-4-0709` | `grok-4.3` with `low` reasoning effort |
| `grok-4-1-fast-non-reasoning` / `grok-4-fast-non-reasoning` / `grok-3` | `grok-4.3` with `none` reasoning effort |
| `grok-code-fast-1` | `grok-build-0.1` |

---

### X-04 Grok 4.5 的兩條「重要細節」：`prompt_cache_key` 與長 agent loop 的 compaction

**中文摘要**：xAI 把「設 `prompt_cache_key`」提到模型指南的最上層——不設的話，多輪對話常常會落在冷快取的伺服器上，等於每次都付全額 input。

> "**We highly recommend setting a [`prompt_cache_key`]** (Responses API; `x-grok-conv-id` header on Chat Completions). It routes a conversation's requests to the same server, making cache hits reliable; without it you often pay full input price on a cache-cold server."
> "**Long agent loops** additionally benefit from context compaction; for tool-heavy workloads see function calling."
> — https://docs.x.ai/developers/grok-4-5#important-details

Grok 4.5 規格（官方原表）：知識截止 **February 1, 2026**；`$2.00 / 1M` input、`$6.00 / 1M` output。

---

## 3. Prompt 結構與快取（X17–X19）— **xAI 目前最完整的「prompt 該怎麼排」教學**

### X-05 六條 Prompt Caching Best Practices

**中文摘要**：這六條裡有兩條其實是純粹的 **prompt 結構教學**（第 3、4 條）：**只能往後追加，不能改前面**；**靜態內容前置**（system prompt、few-shot 範例、參考文件全部放最前面形成穩定前綴）。這與 Gemini 的 implicit cache 建議一致，但 xAI 寫得更明確。

> "1. **Always set `x-grok-conv-id`** (or `prompt_cache_key` for Responses API) — Routes requests to the same server, maximizing cache hits."
> "2. **Use a stable conversation ID** — A UUID or your application's session ID works well."
> "3. **Never modify earlier messages** — Only append new ones. Any edit, removal, or reorder breaks the cache."
> "4. **Front-load static content** — Place system prompts, few-shot examples, and reference documents at the beginning where they form a stable prefix."
> "5. **Monitor `cached_tokens`** — If consistently 0, verify your conversation ID and message ordering."
> "6. **Handle cache misses gracefully** — Eviction and routing mean cache hits aren't guaranteed. Your application should work without caching."
> — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices#best-practices

**適用**：所有 `grok` 語言模型。

---

### X-06 快取不影響輸出品質（消除一個常見誤解）

> "Does caching affect output quality? No. Caching only accelerates the prompt processing phase. The model's output is identical whether the prompt is served from cache or computed from scratch."
> — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices#does-caching-affect-output-quality

---

### X-07 推理模型的多輪對話**必須**把 `reasoning_content` 帶回去

**中文摘要**：xAI 直接點名「漏傳 reasoning_content 是快取未命中的頭號原因」。兩種正解：把加密的 reasoning content 送回去，或改用 `previous_response_id` 的 stateful 模式。

> "**Keep messages unchanged.** For cache hits in multi-turn conversations, never edit, remove, or reorder earlier messages — only append new ones. For reasoning models, you **must** include `reasoning_content` from previous responses; omitting it is the top cause of cache misses."
> — https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn

官方列出三種會打斷快取的改動（各附範例）：
> "**What changed:** The assistant response on line 11 was shortened to `\"It stores KV pairs.\"`"（編輯早期訊息）
> "**What changed:** The assistant message on line 11 was removed entirely."（刪除訊息）
> "**What changed:** Lines 9 and 10 were swapped — the user message now comes before the system message."（調換順序）

---

### X-08 Context Compaction：長 agent loop 的脈絡壓縮

**中文摘要**：把長對話壓成一個不透明的 compaction item，保留 system prompt、附件、先前推理與對話的濃縮紀錄，丟掉冗長的工具輸出。xAI 明確主張這**不只省錢，還會讓回答更準**（脈絡變乾淨，模型不會被舊工具輸出干擾）。

> "**Context compaction** lets you shrink those messages into a single opaque item that preserves the salient state — system prompts, attached files, prior reasoning, and a compacted record of the turns — while dropping the verbose tool output and back-and-forth."
> "**Sharper responses** — a tighter context keeps the model focused on the current task instead of getting distracted by stale tool output and old turns."
> — https://docs.x.ai/developers/advanced-api-usage/context-compaction

三個必須同時成立的壓縮時機（官方原文）：
> "The conversation has grown large enough that `input_tokens` on each call is hurting cost or latency."
> "You still want the model to remember prior turns (otherwise just start a new conversation)."
> "The current window still fits within the model's context limit (compaction shrinks the conversation — it cannot rescue a request that is already over the limit)."

> "A typical pattern is to call the Compaction API every N turns inside an agent loop, or once whenever your bookkeeping shows the rendered context above a threshold you've chosen for your workload."

---

## 4. Structured Outputs（X4）

### X-09 用 schema 承擔格式，讓 prompt 只講任務

**中文摘要**：xAI 明確教一個分工原則——**欄位規格交給 JSON Schema，system prompt 只負責講任務**，不要在 prompt 裡再把欄位重講一次。官方的 invoice 範例 system prompt 短到只有一句。

> "The system prompt instructs the model to extract invoice data from text. Since the schema is defined separately, the prompt can focus on the task without explicitly specifying the required fields in the output JSON."
> — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#system-prompt

官方 system prompt（原文，一字未改）：
> "Given a raw invoice, carefully analyze the text and extract the relevant invoice data into JSON format."

---

### X-10 工具參數永遠是 strict schema（隱含 `strict: true`）

**中文摘要**：xAI 的第二條保證與 OpenAI 不同——**tool call 的參數一定嚴格符合 schema，`strict` 旗標永遠隱含為 true**，不需要你設定。

> "The second way is through tool calling. When you define tools, xAI models will always generate tool call arguments that strictly conform to the tool's input JSON Schema (the `strict` flag is implicitly always `true`)."
> — https://docs.x.ai/developers/model-capabilities/text/structured-outputs

> "When using supported schema features, the response is guaranteed to match your schema."

---

### X-11 「保證」與「盡力而為」的界線：哪些 schema 關鍵字不會被強制

**中文摘要**：這是 xAI 特有、且非常實用的一張表——它老實告訴你哪些 schema 約束是**引擎層強制**、哪些只是**模型盡力**。盡力而為的部分要自己在應用層驗。

> "These keywords are accepted but not structurally enforced; the model handles them and does so reliably in practice, but outputs are not guaranteed to satisfy these constraints. We recommend validating if strict conformance is required."
> 盡力而為清單："`not` / `if` / `then` / `else` / `allOf` with more than one subschema / `format` values not listed under String formats / Constraints exceeding the limits above"
> — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#best-effort-keywords

保證上限（官方原表）：
| Keyword | Guaranteed up to |
|---|---|
| `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` | No limit |
| `minLength` / `maxLength` | 2,048 |
| `minItems` / `maxItems` | 256 |
| `minProperties` / `maxProperties` | 64 |

其他規則：
> "`additionalProperties` defaults to `false` and must be set to `true` explicitly."
> "To make a field nullable, use a type array (`{\"type\": [\"string\", \"null\"]}`) or an `anyOf` variant that includes `null`. Fields not listed in `required` are treated as optional."
> "Schemas authored against Draft 2020-12 work best; Draft-07 schemas are also accepted."

會被 400 拒絕的 schema：
> "`enum` or `anyOf` with zero variants / Properties with a schema of `true` or `false` / `maxContains` / `minContains` / `items` as an array (use `prefixItems` for tuple validation)"

---

### X-12 `pattern` 正則的隱含全字串比對（一個很容易寫錯的細節）

**中文摘要**：xAI 支援的正則子集裡有一條語意差異——`^` 與 `$` 是**隱含的**，pattern 永遠比對整個字串，不必自己加；捕獲群組沒有語意作用；`.` 會匹配換行。

> "`^` and `$` are *implicit*—the pattern always matches the *entire string* (no need to add them)"
> "`.` matches newlines"
> "Capturing groups `(...)` have no semantic effect (they behave like non-capturing groups)"
> 不支援："Backreferences (`\\1`, `\\k<name>`, etc.) / Unicode property escapes (`\\p{L}`, `\\P{Letter}`) / Word boundaries (`\\b`, `\\B`) / Lookahead and lookbehind / Inline modifiers"
> — https://docs.x.ai/developers/model-capabilities/text/structured-outputs#regex-support-pattern

---

## 5. Function Calling（X8）與工具編排（X7、X14、X15）

### X-13 工具定義三欄位：`description` 是給模型看的提示

**中文摘要**：xAI 把 `description` 的用途寫得很直白——**它就是模型決定「什麼時候用這個工具」的依據**。上限每次請求 200 個工具。

> "`name` | Yes | Unique identifier (max 200 tools per request)"
> "`description` | Yes | What the tool does — helps the model decide when to use it"
> "`parameters` | Yes | JSON Schema defining function inputs"
> — https://docs.x.ai/developers/tools/function-calling#tool-schema-reference

---

### X-14 `parameters` 的根必須是 object（或全是 object 的聯集），否則 400

**中文摘要**：一條具體的踩雷規則——工具參數的根型別如果是純量、陣列，或含有非 object 分支的 `anyOf`/`oneOf`，會**無法編譯成 tool-call 文法**而被 400 拒絕。

> "The root of a `parameters` schema must be an object (`\"type\": \"object\"`); nest any other types inside `properties`. A root `anyOf` or `oneOf` also works when every branch is itself an object"
> "A tool whose `parameters` root is neither an object nor a union of objects (for example, a scalar, an array, or an `anyOf`/`oneOf` with a non-object branch) cannot be compiled into a tool-call grammar and is rejected with a `400` error that names the tool."
> — https://docs.x.ai/developers/tools/function-calling#parameter-schema

---

### X-15 `tool_choice` 四段控制

> "`\"auto\"` | Model decides whether to call a tool (default)"
> "`\"required\"` | Model must call at least one tool"
> "`\"none\"` | Disable tool calling"
> "`{\"type\": \"function\", \"function\": {\"name\": \"...\"}}` | Force a specific tool"
> — https://docs.x.ai/developers/tools/function-calling#tool-choice

平行呼叫預設開啟：
> "By default, parallel function calling is enabled — the model can request multiple tool calls in a single response. Process all of them before continuing."
> "Disable with `parallel_tool_calls: false` in your request."

---

### X-16 `max_turns`：agentic 迴圈的「回合」預算（不是工具呼叫數）

**中文摘要**：`max_turns` 限制的是**助理回合數**，不是工具呼叫數——一個回合裡模型可以平行叫很多工具。官方給了三檔建議值。

> "**Important**: `max_turns` does **not** directly limit the number of individual tool calls. Instead, it limits the number of assistant turns in the agentic loop. During a single turn, the model may invoke multiple tools in parallel."
> — https://docs.x.ai/developers/tools/tool-usage-details#understanding-turns-vs-tool-calls

官方建議值（原表）：
> "**Quick lookups** | 1-2 | Fastest response, may miss deeper insights"
> "**Balanced research** | 3-5 | Good balance of speed and thoroughness"
> "**Deep research** | 10+ or unset | Most comprehensive, longer latency and higher cost"

> "When the agent reaches the limit, it will stop making additional tool calls and generate a final response based on information gathered so far."

---

### X-17 混用伺服器端與客戶端工具時，`max_turns` 會被重置

**中文摘要**：一個很細但會咬人的行為——客戶端工具呼叫等於「檢查點」，會讓回合計數歸零。

> "When the model decides to invoke a client-side tool, the agent execution **pauses and yields control back to your application**."
> "If you set `max_turns=5` and the agent performs 3 server-side tool calls before requesting a client-side tool, the subsequent request (after you provide the client-side tool result) will again allow up to 5 server-side tool turns."
> — https://docs.x.ai/developers/tools/advanced-usage#understanding-max_turns-with-client-side-tools

---

### X-18 工具組合的四個推薦配方

**中文摘要**：xAI 給了一張「你想做什麼 → 該開哪些工具 → 為什麼」的表，是很好的「工具選擇」教材。

> "**Research & analyze data** | Web Search + Code Execution | Web search gathers information, code execution analyzes and visualizes it"
> "**Aggregate news & social media** | Web Search + X Search | Get comprehensive coverage from both traditional web and social platforms"
> "**Extract insights from multiple sources** | Web Search + X Search + Code Execution | Collect data from various sources then compute correlations and trends"
> "**Monitor real-time discussions** | X Search + Web Search | Track social sentiment alongside authoritative information"
> — https://docs.x.ai/developers/tools/advanced-usage#suggested-tool-combinations

> "Equipping your requests with multiple tools is straightforward—simply include the tools you want to activate in the `tools` array of your request. The model will intelligently orchestrate between them based on the task at hand."

---

### X-19 伺服器端工具的輸出**不會**回傳給你

**中文摘要**：串流時可以看到每一次工具呼叫的決策，但**伺服器端工具的輸出不會回到 API 回應裡**——模型只在內部使用。這會影響你怎麼設計「要模型把依據講出來」的提示。

> "**Note**: Only the tool call invocations are shown — **server-side tool call outputs are not returned** in the API response. The agent uses these outputs internally to formulate its final response."
> — https://docs.x.ai/developers/tools/tool-usage-details#real-time-server-side-tool-calls

---

## 6. Code Execution 的 Best Practices（X9）— xAI 現存最接近「提示教學」的一節

### X-20 三條 Best Practices（含官方 good/bad 對照）

**中文摘要**：這是 xAI 全站唯一一組標題就叫「Best Practices」的**文字提示**教學。三條：具體、提供資料格式與脈絡、選對模型設定。

**1. 要求要具體**
> "Provide clear, detailed instructions about what you want the code to accomplish"
> 官方對照（原文）：
> ```
> # Good: Specific and clear
> "Calculate the correlation matrix for these variables and highlight correlations above 0.7"
>
> # Avoid: Vague requests
> "Analyze this data"
> ```
> — https://docs.x.ai/developers/tools/code-execution#1-be-specific-in-requests

**2. 提供脈絡與資料格式**
> "Always specify the data format and any constraints on the data, and provide as much context as possible"
> 官方範例（原文）：
> ```
> Here's my CSV data with columns: date, revenue, costs
> Please calculate monthly profit margins and identify the best-performing month.
> Data: [['2024-01', 50000, 35000], ['2024-02', 55000, 38000], ...]
> ```
> — https://docs.x.ai/developers/tools/code-execution#2-provide-context-and-data-format

**3. 用對的模型設定**
> "**Temperature**: Use lower values (0.0-0.3) for mathematical calculations"
> "**Model**: Use reasoning models like `grok-4.5` for better code generation"
> — https://docs.x.ai/developers/tools/code-execution#3-use-appropriate-model-settings

**注意**：第 3 條的 temperature 建議與 Google Gemini 3.x「不要動取樣參數」的立場**相反**——這是一個可以做成「廠家差異」教學的好對比。

---

### X-21 什麼時候該開 code execution（四種情境）

> "**Numerical Problems**: When you need exact calculations rather than approximations"
> "**Data Processing**: Analyzing complex data from the prompt"
> "**Complex Logic**: Multi-step calculations that require intermediate results"
> "**Verification**: Double-checking mathematical results or validating assumptions"
> — https://docs.x.ai/developers/tools/code-execution#when-to-use-code-execution

三個可直接照抄的情境 prompt（官方原文）：
> "Calculate the Sharpe ratio for a portfolio with returns [0.12, 0.08, -0.03, 0.15] and risk-free rate 0.02"
> "Perform a t-test to compare these two groups and interpret the p-value: Group A: [23, 25, 28, 30], Group B: [20, 22, 24, 26]"
> "Solve this differential equation using numerical methods: dy/dx = x^2 + y, with initial condition y(0) = 1"

沙箱限制（會影響你怎麼寫 prompt）：
> "**File I/O**: Limited file system access for security reasons"
> "No access to external networks or file systems"
> "All computations are stateless and secure"

---

## 7. 搜尋與檢索工具的「參數式提示」（X10–X13）

### X-22 用 `allowed_domains` / `excluded_domains` 取代在 prompt 裡拜託

**中文摘要**：xAI 的設計哲學是**把來源限制做成參數而不是提示句**——想要只查某些網站，不要在 prompt 裡寫「只看 xxx.com」，直接用 `allowed_domains`（上限 5 個，且不能與 `excluded_domains` 併用）。

> "Use `allowed_domains` to make the web search **only** perform the search and web browsing on web pages that fall within the specified domains."
> "`allowed_domains` cannot be set together with `excluded_domains` in the same request."
> — https://docs.x.ai/developers/tools/web-search#only-search-in-specific-domains

X Search 的等價參數：
> "`allowed_x_handles` | Only consider posts from specific X handles (max 20)"
> "`excluded_x_handles` | Exclude posts from specific X handles (max 20)"
> "`from_date` / `to_date` | … Both fields need to be in ISO8601 format, e.g., \"YYYY-MM-DD\""
> — https://docs.x.ai/developers/tools/x-search#x-search-parameters

---

### X-23 影像／影片理解要另外開，而且會影響上下文

> "Setting `enable_image_understanding` to true equips the agent with access to the `view_image` tool, allowing it to analyze images encountered during the search process."
> "After Grok searches for images, the returned images are included in the model context used to write the response. This is separate from `enable_image_understanding`, which lets Grok inspect images it finds while browsing regular web pages."
> — https://docs.x.ai/developers/tools/web-search#enable-image-search

> "`enable_video_understanding` … This is only available for X Search (not Web Search)."
> — https://docs.x.ai/developers/tools/x-search#enable-video-understanding

---

### X-24 引用是預設行為，但「模型不保證每次都引」

**中文摘要**：一條誠實的限制說明——開了 inline citations 不代表模型每次都會引用；引不引用由模型自行判斷。另外 `citations` 清單裡的 URL **不一定**都被最終答案引用（只是探索過程中看過）。

> "**Important**: Enabling inline citations does not guarantee that the model will cite sources on every answer. The model decides when and where to include citations based on the context and nature of the query."
> "Note that not every URL in this list will necessarily be directly referenced in the final answer. The agent may examine a source during its research process and determine it is not sufficiently relevant to the user's query, but the URL will still appear in this list for transparency."
> — https://docs.x.ai/developers/tools/citations

預設值差異（官方原表，很容易踩）：
> "Responses API … **Default** | Enabled — response text may include `[[N]](url)` links without extra configuration"
> "xAI Python SDK … **Default** | Disabled — omit `include`, or do not pass `\"inline_citations\"`"

---

### X-25 Collections Search 的六種適用情境

> "**Enterprise Knowledge Bases**: When you need Grok to reference internal documents and policies"
> "**Financial Analysis**: Analyzing SEC filings, earnings reports, and financial statements across multiple documents"
> "**Customer Support**: Building chatbots that can answer questions based on your product documentation"
> "**Research & Due Diligence**: Synthesizing information from academic papers, technical reports, or industry analyses"
> "**Compliance & Legal**: Ensuring responses are grounded in your official guidelines and regulations"
> "**Personal Knowledge Management**: Organizing and querying your personal document collections"
> — https://docs.x.ai/developers/tools/collections-search#when-to-use-collections-search

> "**Semantic Search**: Find documents based on meaning and context, not just keywords"

附加檔案會自動變成 agentic workflow：
> "When files are attached, the system automatically enables document search capabilities, transforming your request into an agentic workflow."
> — https://docs.x.ai/developers/model-capabilities/files/chat-with-files

---

## 8. Grok Build（coding agent）的提示工程（X21–X26）

### X-26 `AGENTS.md`：把常駐指令寫成檔案（**短而具體 > 長**）

**中文摘要**：xAI 的 coding agent 用 `AGENTS.md` 當每個 session 自動載入的常駐 prompt。最重要的一句是最後那條：**檔案不設大小上限，但短而具體的指令比長的更會被遵守**。

> "Project rules are Markdown files that Grok loads into context for every session in a directory tree. Put coding conventions, build and test commands, and architecture notes in an `AGENTS.md` at your repo root, and Grok follows them without being told each session."
> "Files are loaded in full, with no size cap; **short, specific instructions are followed more reliably than long ones**."
> — https://docs.x.ai/build/features/project-rules

載入順序與覆寫規則（官方原文）：
> "Grok loads rules in this order, with deeper files taking precedence on conflicts: 1. Global rules in `~/.grok/` 2. Every directory from the repo root down to the working directory"
> "A nested `AGENTS.md` scopes to its subtree, so a monorepo can carry different conventions per package"

相容性（值得注意：直接讀 `CLAUDE.md`）：
> "Within each directory, Grok reads any of `AGENTS.md`, `Agents.md`, `AGENT.md`, `CLAUDE.md`, `Claude.md`, and `CLAUDE.local.md`, plus every `*.md` file in a `.grok/rules/` directory (`.claude/rules/` and `.cursor/rules/` are read for compatibility)."

單次執行的規則注入：
> "To add rules for a single run without editing files, pass `--rules` (Grok appends the text to the system prompt), or `--system-prompt-override` to replace the system prompt entirely"

---

### X-27 Plan Mode：先計畫後執行的門檻機制

**中文摘要**：計畫模式下**只有計畫檔可以被編輯**，其他編輯工具一律被拒——而且這個門檻獨立於權限模式（就算你開了 always-approve 也一樣）。官方也給了「什麼時候該用／不該用」。

> "In plan mode the agent explores the codebase and drafts a plan for your approval before it edits anything."
> "**Use for** | Ambiguous architecture, unclear requirements, or high-impact restructures"
> "**Skip for** | Clear one-path changes, obvious bug fixes, renames, formatting, pure research (explore instead)"
> "Only the session plan file may be edited until you approve. Other edit tools are rejected, including under auto or always-approve."
> "The agent can enter plan mode on its own when a task looks ambiguous."
> — https://docs.x.ai/build/features/plan-mode

---

### X-28 Subagents：以「權限」定義角色

**中文摘要**：三種內建 subagent 型別是用**能做什麼**來區分的（不是用人格）：`general-purpose`（全能）、`explore`（唯讀、不能執行 shell、不能編輯）、`plan`（只寫計畫）。另有「persona」是純行為疊加層。

> "`general-purpose` | Default full-capability child"
> "`explore` | Read, list, and search only (no shell, no edits)"
> "`plan` | Drafts an implementation plan (no shell, no edits)"
> "Personas are behavioral overlays only (tone, focus, contracts)"
> "Subagents are independent child sessions with their own context. They return a summary to the parent when finished."
> — https://docs.x.ai/build/features/subagents

---

### X-29 Skills：把可重用的指令包成資料夾

> "Skills are reusable folders containing markdown instructions, script files, and resources for agents."
> "User-invocable skills also appear as slash commands, for example `/<skill-name>`."
> — https://docs.x.ai/build/features/skills-plugins-marketplaces

---

### X-30 脈絡管理指令（`/context`、`/compact`、`/btw`）

**中文摘要**：Grok Build 把「脈絡管理」做成使用者可見的指令，等於在教使用者：脈絡是有限資源、要主動管理。`/btw` 特別有意思——問一個側邊問題但不打斷主線。

> "Use `/context` to check current context usage."
> "`/compact [context]` | Compact conversation history"
> "`/btw <question>` | Ask a side question without interrupting"
> "`/rewind` | Rewind to a previous turn"
> "`/effort` | Set reasoning effort for the current model"
> — https://docs.x.ai/build/modes-and-commands#core-tui-commands

---

## 9. 語音（X27、X28）— xAI 特有的「聲音提示」教學

### X-31 TTS 的「寫出好唸的文字」四條 Best Practices

**中文摘要**：這是 xAI 特有的一組提示技巧——**標點就是韻律指令**。

> "**Use natural punctuation.** Commas, periods, and question marks guide pacing and intonation. `\"Wait, really?\"` sounds more natural than `\"Wait really\"`."
> "**Add emotional context.** Exclamation marks and question marks influence delivery - `\"That's amazing!\"` sounds enthusiastic while `\"That's amazing.\"` is matter-of-fact."
> "**Break long content into paragraphs.** Paragraph breaks create natural pauses and help the model maintain consistent quality across longer text."
> "**Keep unary requests under 15,000 characters.**"
> — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#writing-effective-text

---

### X-32 Speech Tags：兩種語音標記語法

**中文摘要**：兩類標記——**行內標記** `[tag]` 放在該發生表情的位置；**包夾標記** `<tag>文字</tag>` 改變整段的表達方式。

> "**Inline tags** `[tag]` — placed at a specific point in the text to produce a vocal expression (e.g. a laugh or pause)"
> "**Wrapping tags** `<tag>text</tag>` — wrap a section of text to change how it is delivered (e.g. whispering, singing)"
> 官方範例："So I walked in and \[pause] there it was. \[laugh] I honestly could not believe it! \<whisper>It was a secret the whole time.\</whisper> Pretty cool, right?"
> — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#speech-tags

分類：Pauses / Laughter & crying / Mouth sounds / Breathing（行內）；Volume & intensity / Pitch & speed / Vocal style（包夾）。

---

### X-33 ★ 換到更強的模型時：**簡化 system prompt、刪掉補丁式提示**

**中文摘要**：**這是 xAI 全站最有教學價值的一條 prompt engineering 指引**，講的是「模型變強後，舊 prompt 要怎麼改」。三點：把 system prompt 大幅縮短（而且**叫 Grok 幫你把舊 prompt 概括化，不要逐字搬**）、刪掉為了補舊模型 bug 而加的所有 workaround 提示、推理預設是開的。

> "**Simplify your system prompt.** The model is significantly more capable, so your prompt should be much shorter. Ask Grok to generalize your existing system prompt rather than porting it verbatim."
> "**Remove workaround prompting.** Prompt hacks and edge-case fixes needed for GPT models are unnecessary. Strip out instructions added solely to patch bugs or limitations of the previous model."
> "**Reasoning is enabled by default.** The default `reasoning.effort` is `\"high\"` for complex multi-step instructions, nuanced tone, and ambiguous queries. Set it to `\"none\"` to disable reasoning."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#step-3--model-specific-best-practices

**適用**：`grok-voice-think-fast-2.0`（該節的直接對象），但「簡化＋去補丁」的原則對所有模型升級皆適用；與 Google 的 G-31/G-32「Gemini 3.x 要簡化 prompt」是同一個時代訊號。

---

### X-34 Per-response instructions：單回合覆寫 system prompt

**中文摘要**：語音 session 可以針對**單一回合**覆寫 system prompt，之後自動回到 session 層設定——用來注入動態脈絡（CRM 資料、來電者資訊）或臨時改行為。

> "Override the session-level system prompt for a single response by setting `instructions` on `response.create`"
> 官方範例（原文）："Respond in Spanish for this turn only."
> "The override applies only to this response — subsequent responses revert to the session `instructions`. This is useful for injecting dynamic context (e.g. CRM data, caller info) or temporarily changing behavior without updating the session."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#per-response-instructions

---

### X-35 Force Message：完全不經模型的逐字台詞

**中文摘要**：合規宣告、IVR 提示這類「必須一字不差」的句子，不要交給模型講——用 `force_message` 直接 TTS 合成。這是一個很重要的設計原則：**該用程式保證的東西不要用 prompt 保證**。

> "Use `force_message` to make the agent speak a **hard-coded, TTS-synthesized line** without involving the model. This is useful for scripted greetings, compliance disclosures (e.g. \"This call is being recorded\"), IVR prompts, or any utterance that must be delivered verbatim."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#force-message

---

### X-36 用參數而非 prompt 修正辨識與發音

**中文摘要**：兩個「不要靠 prompt 硬拗」的參數：`keyterms`（把 ASR 偏向專有名詞）與 `replace`（改變唸法但不改逐字稿）。

> "Bias transcription toward domain-specific vocabulary — product names, proper nouns, brand names, or technical terms that the model might otherwise mis-transcribe — by setting `audio.input.transcription.keyterms`… up to 100 terms with each term up to 50 characters."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#keyterms

> "`replace` | … Map of phrases to spoken substitutions applied to the model's output before TTS, e.g. `{\"Acme Mobile\": \"Acme Mobull\"}`. Fixes pronunciation by changing the spoken audio without altering the transcript."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#session-parameters

---

### X-37 語音體驗的四條高影響力建議

> "**Enable `server_vad`** for automatic, natural barge-in."
> "**Stream output audio deltas** (`response.output_audio.delta`) to the speaker instantly — do not wait for the full response."
> "**Match input/output format** (24 kHz PCM) to avoid resampling."
> "**Prefer ephemeral tokens** for client-side security."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#additional-high-impact-recommendations

---

## 10. 影像／影片生成（X29–X31）

### X-38 風格由 prompt 的形容詞決定（Grok Imagine）

**中文摘要**：xAI 的影像文件**沒有 prompt 範本教學**（相對於 Google 的 14 組範本），唯一的提示指引是「把想要的美學寫進 prompt」。

> "The `grok-imagine-image-quality` model supports a wide range of visual styles, from ultra-realistic photography to anime, oil paintings, and pencil sketches. Transform existing images by describing the desired aesthetic in your prompt."
> — https://docs.x.ai/developers/model-capabilities/images/editing#style-transfer

> "Chain multiple edits together by using each output as the input for the next. This enables iterative refinement; start with a base image and progressively add details, adjust styles, or make corrections."
> — https://docs.x.ai/developers/model-capabilities/images/editing#multi-turn-editing

官方 prompt 範例（原文）：
- 生成：`A collage of London landmarks in a stenciled street-art style`
- 編輯：`Render this as a pencil sketch with detailed shading`
- 圖生影片：`Make the water crash down and slowly pan out the camera`

---

### X-39 影片生成：prompt 複雜度直接影響生成時間

> "**Prompt complexity** — More detailed scenes require additional processing"
> — https://docs.x.ai/developers/model-capabilities/video/generation

> "**Aspect Ratio**: `auto` | Model auto-selects the best ratio for the prompt"
> — https://docs.x.ai/developers/model-capabilities/images/generation#aspect-ratio

同 prompt 要多張變體用 `sample_batch()` / `n`，不同 prompt 才用並行請求：
> "If you want multiple variations from the **same prompt**, use `sample_batch()` with the `n` parameter instead. That generates all images in a single request and is the most efficient approach for same-prompt generation."
> — https://docs.x.ai/developers/model-capabilities/images/generation#concurrent-requests

---

## 11. 狀態管理與 API 選擇（X3、X6）

### X-40 Responses API 的 stateful 模式：用 `previous_response_id` 取代重送全部歷史

**中文摘要**：這是 xAI 目前主推的多輪做法——**回應存在伺服器 30 天**，用 id 續談；30 天後要自己保存歷史與加密思考內容。

> "**previous input prompts, reasoning content, and model responses are saved and stored on xAI's servers**. You can continue the interaction by appending new prompt messages instead of resending the full conversation."
> "**The responses will be stored for 30 days, after which they will be removed.** … If you want to continue a conversation after 30 days, please store your responses history and the encrypted thinking content locally, and pass them in a new request body."
> — https://docs.x.ai/developers/model-capabilities/text/generate-text

Zero Data Retention 使用者的替代路徑：
> "There is another option for the ZDR (Zero Data Retention) users … that is to let the xAI server also return the encrypted reasoning and the encrypted tool output besides the final content to the client side, and those encrypted contents can be included as a part of the context in the next turn conversation."
> — https://docs.x.ai/developers/tools/advanced-usage#append-the-encrypted-agentic-tool-calling-states

延續對話不必沿用相同工具設定：
> "Note that the follow-up conversation does not need to use the same tools, model parameters, or any other configuration as the initial conversation—it will still be fully hydrated with the complete agentic state from the previous interaction."

---

## 12. 對照與影響：xAI 側該怎麼更新遊戲內容

### 12.1 現有 `curriculum.json` 的 xAI 來源健檢

| 目前引用 | 狀態（2026-07-30） |
|---|---|
| `https://docs.x.ai/docs/guides/grok-code-prompt-engineering` | ❌ **404，已下架**。建議移除或替換。 |
| `https://docs.x.ai/developers/model-capabilities/text/reasoning` | ✅ 200，內容已更新為 `grok-4.5` 三級 effort（X-01、X-02） |
| `https://docs.x.ai/developers/model-capabilities/text/structured-outputs` | ✅ 200，內容大幅擴充（X-09～X-12） |
| `https://docs.x.ai/docs/guides/function-calling` | ⚠️ 200，但為舊路徑；正規路徑為 `/developers/tools/function-calling` |
| `https://docs.x.ai/developers/models/grok-4.5` | ✅ 200，但**只有規格表**；提示相關內容在 `/developers/grok-4-5` |
| `https://docs.x.ai/developers/model-capabilities/text/generate-text` | ✅ 200 |

**建議的替代來源**（皆為本次一手驗證的 200）：
- `https://docs.x.ai/developers/tools/code-execution#best-practices`（xAI 現存唯一一組正式的文字提示 Best Practices）
- `https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices#best-practices`（prompt 結構／靜態內容前置）
- `https://docs.x.ai/build/features/project-rules`（AGENTS.md：短而具體 > 長）
- `https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#step-3--model-specific-best-practices`（簡化 prompt、刪補丁）
- `https://docs.x.ai/developers/tools/function-calling#tool-schema-reference`（工具 description 的作用）

### 12.2 相對於遊戲現有 68 條，xAI 側值得新增的內容

1. **X-05 / X-07「靜態內容前置、只能追加不能改前面」** — 一條同時涵蓋 prompt 結構與成本的實務規則，且與 Google 的 implicit cache 建議可互相印證。
2. **X-33「升級模型時要簡化 prompt、刪掉補丁式提示」** — 與 Google G-31/G-32 呼應，可做成跨廠家的「時代變了」關卡。
3. **X-09「schema 承擔格式，prompt 只講任務」** — 明確的分工原則，遊戲現有的 `specifiesFormat` 檢查可以延伸出這一層。
4. **X-11「保證 vs 盡力而為的 schema 關鍵字」** — 教玩家分辨「哪些約束是系統保證的、哪些要自己驗」。
5. **X-16 / X-17「`max_turns` 是回合預算不是工具數，且客戶端工具會重置計數」** — agentic 成本控制。
6. **X-20「具體 vs 含糊」的官方 good/bad 對照** — 可直接當關卡素材（`"Calculate the correlation matrix… above 0.7"` vs `"Analyze this data"`）。
7. **X-22 / X-36「該用參數的不要用 prompt 拜託」** — 一條重要的元原則（來源限制、發音、專有名詞辨識都有專屬參數）。
8. **X-26「短而具體的指令比長的更會被遵守」** — 與「加更多指令就更好」的直覺相反，適合做成反直覺關卡。
9. **X-35「必須逐字的內容不要交給模型」（force_message）** — prompt 的邊界在哪。
10. **X-31 / X-32「標點就是韻律指令」與兩種 speech tag** — 全新的模態，遊戲目前完全沒有。
11. **X-02「同一個參數名在不同模型意義不同」** — 讀官方文件的重要習慣。
12. **X-20 第 3 條 temperature 0.0–0.3 vs Google 3.x「不要動」** — 現成的廠家差異對照素材。

### 12.3 一個必須誠實面對的結構性事實

xAI 的文件已從「有一份 prompt engineering 指南」轉為「提示知識散在各能力頁的 Best Practices 裡」。以「可引用的官方提示條目數量」而言，xAI 目前**遠少於** OpenAI / Anthropic / Google。遊戲若要維持四廠平衡，xAI 側的關卡應以「**參數與結構的決策**」（reasoning_effort、max_turns、schema 嚴格度、快取前綴、AGENTS.md）為主軸，而不是「怎麼寫句子」——因為那正是 xAI 官方文件現在真正在教的東西。

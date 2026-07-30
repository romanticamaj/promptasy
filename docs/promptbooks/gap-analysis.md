# PromptArcade 課程落差分析（Gap Analysis）

> **這份文件是什麼**：把 `docs/promptbooks/` 底下 9 份 2026-07-30 擷取的官方參考資料，
> 逐條比對遊戲現有的 **68 條技巧 / 15 主題 / 5 區域**（`src/data/curriculum.json`）、
> **26 關**（`src/data/challenges.json`）與 **13 則刻文小語**（`src/data/inscriptions.json`），
> 找出「已經過時的」「還沒教到的」「重複到讓人膩的」，並排出下一階段該做什麼。
>
> - **稽核日**：2026-07-31（參考資料擷取日 2026-07-30；連結狀態為 2026-07-31 實測）
> - **課程原始抽取日**：2026-07-26（來源是更早的彙整檔）
> - **這份文件不是遊戲內容**，也不是官方文字。所有官方說法一律附逐字引文與可點連結。
> - **本階段（Phase 26）只做「顯示層的誠實補丁」**：`curriculum.json` 一個位元組都沒改
>   （那些引文在它們的年代是正確的引用），改動全部落在 `src/data/dated-notes.json` 這一層。

---

## 摘要（一頁看完）

| 項目 | 數量 |
|---|---|
| 掃過的官方參考資料 | 9 份（Anthropic 102 條 · OpenAI 139 · Google G-01~G-86 · xAI X-01~X-40 · Qwen · DeepSeek · Mistral · Meta-Llama · 其他（Cohere / Microsoft）） |
| 比對對象 | 68 技巧 / 15 主題 / 26 關 / 111 段刻碑流程 / 13 則刻文小語 |
| **已被官方推翻或縮限的內容** | **14 項**（其中 4 項本階段已補上時代註記） |
| **實測失效的出處** | **1 個硬 404**、1 個官方標示即將移除、1 個舊路徑、1 個內容已搬走、1 個擋自動擷取（共 26 個網址中 5 個有狀況） |
| **值得新增的技巧候選** | **38 條**（5 分 15 條 / 4 分 15 條 / 3 分 8 條） |
| **完全沒覆蓋的廠商** | Qwen（中文圈最相關）、DeepSeek、Mistral、Meta、Cohere、Microsoft |
| 檢查器重複度最高的三項 | `assignsTask` 26/26 · `specifiesFormat` 14/26 · `hasDelimiters` 12/26 |

**一句話結論**：課程的**事實正確性**大致守得住（68 條裡真正被推翻的只有 4 條核心、其餘是「適用範圍縮小」），
但有兩個結構性問題比任何單條錯誤都嚴重 ——
**（1）兩大廠 2026 年都轉向「最小必要結構」，而遊戲的 S 評價正在獎勵相反行為；
（2）遊戲主打中文圈，卻完全沒有 Qwen（唯一有中文母語 prompt 方法論的廠商）。**

---

## 一、過時 / 已反轉的內容（護欄 2）

判定標準：**遊戲現在正在教的東西，被更新的官方文件明確推翻、縮限，或照做會直接報錯。**
每一項都先在遊戲資料裡查證過才列出來（沒查到就標「遊戲未涵蓋，不算落差」）。

### 🔴 A 級 — 照做會出錯 / 已經修了

#### A1. `temperature` 設 0 求一致 —— 三家官方各自否定，且 `dial-room-43` 的滿分示範解答就是它

| 遊戲現在說 | 位置 |
|---|---|
| 「低溫＝更確定（結構化任務）、高溫＝更有創意。**0＝完全確定**。」 | `params-01` tip |
| 「top-k 從機率最高的 K 個 token 取樣（**=1 即貪婪解碼**）」 | `params-02` tip |
| 「請把 temperature 設為 0、**top_p 設為 0.8**，因為印刷工需要每次印出來都一模一樣。」 | `dial-room-43` 的 S 級示範解答 |
| 「要每次都一樣就把 temperature 調到 0」 | 刻文小語 `mirror-walk-dial` |

官方新說法（四處、四家）：

> "temperature, top_p, and top_k are **no longer recommended for all Gemini 3.x models**. Gemini 3's reasoning capabilities are optimized for the default settings. **Remove these parameters from all requests.**"
> "**To ensure determinism, we recommend defining a system instruction with explicit rules for your specific use case.**"
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#sampling-parameters

> "setting `temperature`, `top_p`, or `top_k` to a non-default value **returns a 400 error on Claude Sonnet 5**. This constraint is new for Sonnet-class models."
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5

> "For thinking mode … **DO NOT use greedy decoding**, as it can lead to performance degradation and endless repetitions."
> — https://huggingface.co/Qwen/Qwen3.5-397B-A17B

> "even with greedy sampling at `temperature=0`, **slight variances** can sometimes occur due to hardware differences and rounding errors."
> — https://docs.mistral.ai/models/best-practices/sampling

外加「不要同時轉兩個旋鈕」這條，兩家獨立同意：

> "Start by fixing one parameter and adjust the other" — https://docs.mistral.ai/models/best-practices/sampling
> "The general recommendation is to alter one of these two parameters at a time, not both." — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

**⚠️ 未解的矛盾**：Google 自家的 Vertex 頁（2026-07-29 仍在更新）仍寫「1.0 is the recommended starting value for temperature」
（https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/adjust-parameter-values）。
**同一家公司兩頁互打** —— 這件事本身是最好的教材（見 §2 的「廠家反差」）。

**本階段處理**：`params-01` / `params-02` 各補一條時代註記；`dial-room-43` 的 `clue` 補一句查核備註。
**沒有改**示範解答與刻碑流程（改了會動到「全選對＝S 且每條檢查滿分」的鐵則，屬 Phase 27 的重做範圍）。

---

#### A2. 自我檢查（`cot-04`）在 Claude Opus 5 上要「刪掉」而不是改寫

遊戲有 **5 關**把 `asksToVerify` 設成得分項（`council-envoy-06`、`effort-forge-15` ×3 分、`verify-spring-24`、`subtask-workbench-31`、`draft-review-wheel-32`），
`cot-04` 本身沒有任何模型別註記。

> "Claude Opus 5 is the exception: it verifies its own work well without explicit instruction, and verification instructions carried over from prompts tuned for earlier models can cause over-verification… **When migrating to Claude Opus 5, remove these instructions rather than rewriting them.**"
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

> "If your prompt contains explicit verification instructions … **remove them**."
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5

**本階段處理**：`cot-04` 補時代註記；`effort-forge-15` 的 `clue` 補一句。評分不動。

---

#### A3. xAI 的 prompt engineering 指南整頁 404 —— 5 條技巧的出處點下去是空的

`https://docs.x.ai/docs/guides/grok-code-prompt-engineering` → **HTTP 404（2026-07-31 curl 實測）**。
被 `structure-01`、`role-04`、`agentic-01`、`iterate-04`、`iterate-05` 五條引用。

xAI 全站 `llms.txt` 的 147 頁裡**沒有任何一頁標題含 Prompt Engineering** —— 沒有一對一的替代頁。

**本階段處理**：原網址留在 `curriculum.json` 不動（護欄 2：引文與出處逐字保留），
顯示層加一句「此文件已下架（2026-07 查核）。後繼參考：xAI · Grok 4.5 指南 ↗」。

**Phase 27 建議**（本階段刻意不做，因為會動到 `curriculum.json`）：

| 技巧 | 建議 | 可用的替代出處（皆實測 200） |
|---|---|---|
| `iterate-05` | ✅ 直接換出處，內容更強 | https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices（"**Never modify earlier messages** — Only append new ones."） |
| `agentic-01` | ⚠️ xAI 那半句無一手來源，建議降級 | https://docs.x.ai/developers/tools/function-calling |
| `structure-01` | ❌ 無替代 → 建議把 `xai` 從 vendors 移除 | — |
| `role-04` | ❌ **方向已反轉**（見 A4），應重寫 | — |
| `iterate-04` | ❌ 無替代 | — |

---

#### A4. `role-04`「xAI：詳細的 system prompt 帶來明顯提升」現在方向相反

> "**Simplify your system prompt.** The model is significantly more capable, so your prompt should be **much shorter**."
> "**Remove workaround prompting.** … Strip out instructions added solely to patch bugs or limitations of the previous model."
> — https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech

> "**short, specific instructions are followed more reliably than long ones**"
> — https://docs.x.ai/build/features/project-rules

另外 tip 後半「Grok 4.5 允許 system／user／assistant 角色任意順序混用」在整份 xAI 參考資料裡**找不到佐證**，
而它引的 `models/grok-4.5` 頁已確認「只有規格表、無提示教學」。

**本階段未處理**（要改 `curriculum.json` 的 tip，超出「最小外科手術」範圍）。列為 Phase 27 第一順位。

---

### 🟠 B 級 — 適用範圍縮小，教學方向要補條件

#### B1. 「越詳細越好」被 GPT-5.6 反轉 —— 而遊戲的評分機制正在獎勵相反行為

這是本次稽核**最重要的單一發現**，而且它不是內容問題，是**評分設計問題**。

遊戲現況：`clarity-02`「**細節越多、結果越貼近需求**」、`framework-01`「**請寫得比直覺更詳細**」，
`council-envoy-06`（7 條 rubric）與 `four-elements-mirror-44`（6 條 rubric）在教玩家「一項都別漏才拿 S」。

三家官方在 2026 都往反方向收斂：

> "Removing repeated instructions and examples and simplifying tool descriptions **can improve task performance**."（官方內部測試：分數 +10–15%、token −41–66%）
> "**State each instruction once.**"
> — https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6

> "**The best prompt isn't the longest or most complex. It's the one that achieves your goals reliably with the minimum necessary structure.**"
> "**Don't use every technique at once:** Select techniques addressing your specific challenge"
> — https://claude.com/blog/best-practices-for-prompt-engineering

> "Be concise. Gemini 3.x responds best to direct, clear instructions. **Verbose or complex prompt engineering techniques designed for older models may cause the model to over-analyze.**"
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5

**注意這裡有真實張力，不是單向反轉**：Google 同一份文件另一節仍寫
「We recommend to **always** include few-shot examples in your prompts」（https://ai.google.dev/gemini-api/docs/prompting-strategies）。
所以正確的教學不是「改教簡短」，而是**教「什麼時候該做減法」**。

**建議**（Phase 27）：新增一個「減法」主題與 2–3 關，並讓既有的 `keepsPromptLean` 檢查器從「只有推理模型關卡用」擴大使用。

#### B2. 情緒勒索式提示已經無效甚至有害

> "While first generation foundation models showed improvement in some circumstances with instructions like \"very bad things will happen if you don't get this correct\", **foundation model performance will no longer improve and in many cases will get worse**."
> — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies

> "Not necessary to use all-caps or bribes; start without, use only if necessary."
> — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide

**遊戲未教這一招 → 不算落差**，但也**沒教「不要這樣做」**。屬未覆蓋（見 §2 N-12）。

#### B3. 強語氣（CRITICAL / MUST / ALWAYS）要調弱

遊戲 `clarity-06` 的 note 只說「催促式提示可以收斂」，沒說出後果，也沒給改寫規則。

> "If your prompts were designed to reduce undertriggering on tools or skills, these models may now **overtrigger**. The fix is to **dial back any aggressive language**."（官方改法：`CRITICAL: You MUST use this tool when...` → `Use this tool when...`）
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

順帶：`clarity-06` 的「**Claude 4 系列**特有」措辭已過時（現行陣容是 Fable 5 / Mythos 5 / Opus 5 / Sonnet 5 / Opus 4.8…）。

#### B4. Prompt chaining 已從主力技巧降級為特定情境技巧

> "With adaptive thinking and subagent orchestration, Claude handles most multistep reasoning internally. Explicit prompt chaining … **is still useful when you need to inspect intermediate outputs or enforce a specific pipeline structure.**"
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

好消息：遊戲的 `decompose-03`（draft → review → refine）與 `draft-review-wheel-32` 剛好命中官方現在唯一點名的模式。
**本階段處理**：`decompose-02` 補時代註記。

#### B5. 「請說明你的推理過程」在 Claude Fable 5 會觸發拒絕

遊戲 `cot-02`（`<thinking>` / `<answer>` 分離）與 `thinking-chamber-14` 的示範解答直接要求輸出 `<thinking>` 區塊。

> "Prompts … that tell the model to **echo, transcribe, or explain its internal reasoning as response text can trigger the `reasoning_extraction` refusal category on Claude Fable 5**"
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5

> "This technique is only applicable non-reasoning models. Attempting to extract model reasoning … **may violate the Acceptable Use Policy**"
> — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

`cot-01` 已標「針對非推理模型」，但 `cot-02` / `cot-03` 沒有這個邊界。**建議 Phase 27 補 note。**

#### B6. `effort` 等級表已擴充，且 effort 控的是「想多少」不是「說多少」

遊戲三處都寫「low／medium／high」：`params-03`、`effort-forge-15` clue、`crossroad-scale-45` clue。

> Anthropic：`low` / `medium` / `high`(預設) / `xhigh` / `max` — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5
> "**The effort parameter controls how much the model thinks rather than how much it says**" — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
> OpenAI：`none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` — https://developers.openai.com/api/docs/guides/reasoning
> DeepSeek：「low and medium are **mapped to high**」— https://api-docs.deepseek.com/guides/thinking_mode

另外 `crossroad-scale-45` 的示範解答把 Anthropic 的 `effort` 與 OpenAI 的 `verbosity` 寫進同一段 prompt（Anthropic 沒有 `verbosity` 參數）。
**這一關不算「教錯」（兩個參數各自都真實存在），但混用是不精確的。** 列 Phase 27。

#### B7. Google 的 `thinking_budget` 已停用（但 Qwen 反而主推）

> "The raw numeric `thinking_budget` parameter is **no longer recommended across all Gemini 3.x models**. Use the `thinking_level` string enum instead."
> — https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5

> 「通过 thinking_budget 参数可设置推理过程的最大 Token 数」— https://help.aliyun.com/zh/model-studio/deep-thinking

遊戲兩者都沒教（`reasoning-03` 已正確涵蓋 Anthropic 側的 `budget_tokens` 淘汰）。**不算落差，但 `thinking_level` 值得補。**

#### B8. `positive-01`「全部改寫成正面」是遊戲自己加上去的推論

`lost-automaton-03` 的 mission 逐字：「把自動機胸口那串『不要』**全部**改寫成『要做什麼』的正面指令」。
官方立場其實是「**先講要做什麼，必要的禁止句留在後面**」：

> "Paraphrase the content into re-written, easily digestible sentences. **Do not extract full sentences from the input text.**"
> — https://docs.cohere.com/docs/crafting-effective-prompts

> "Restrictions tell the model what not to do: Only use academic papers. Never give sources older than 2020."
> — https://developer.meta.com/ai/docs/how-to-guides/prompting/

**建議**：把 mission 從「全部改寫」改成「先寫要做什麼，必要的禁止句留在後面」。低成本、不動評分。

#### B9. 「指令放最前面」在新模型上已無差別（誠實註記）

> "Although following this technique is still generally recommended, **in contrast to previous model versions … our testing showed that the model response with ChatGPT and GPT-4 models was the same regardless of whether the technique is utilized.**"
> — https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering

同時 Google 給了**二分規則**，遊戲沒把它講清楚（所以 `clarity-04`「指令放最前面」與 `long-scroll-archive-05`「資料先、任務後」在玩家眼裡像在打架）：

> "**Prioritize critical instructions**: Place essential behavioral constraints … **at the very beginning**."
> "**Structure for long contexts**: … supply all the context first. Place your specific instructions or questions **at the very end**."
> — https://ai.google.dev/gemini-api/docs/prompting-strategies

**建議**：不是修，是**補一關**教這條二分規則。

#### B10. XML 標籤被官方部落格列為「較不必要」（不建議照做）

> **Status:** "Less necessary but still useful in specific situations" / **Modern Alternative:** "Clear headings, whitespace, and explicit language often work just as well."
> — https://claude.com/blog/best-practices-for-prompt-engineering

**判定：暫不動。** 官方主頁（`claude-prompting-best-practices`）仍把 XML 標籤列為 General principles，
且 `hasDelimiters` 是 12 關的得分項。建議只在圖鑑加「進階提醒」，**不動評分器**。

### ✅ 查核後確認「遊戲已經是對的」（列出來避免下次重查）

| 線索 | 判定 |
|---|---|
| prefill 已死（Claude 4.6+ 回 400） | 遊戲 68 條**完全沒有 prefill 技巧** → 不是落差，是可以補的新內容 |
| `budget_tokens` 已死 | `reasoning-03` 的 note 已寫「Opus 4.7 以後回 400，改用 effort」→ **已正確** |
| 推理模型不要「一步一步想」 | `reasoning-01` 正是這條 → **已正確**（但 DeepSeek / Mistral 立場相反，見 §2 反差素材） |
| Gemini 3 內建思考、簡單 nudge 即可 | `reasoning-04` → **已正確** |
| 新模型預設偏簡短 | `format-06` 的 note → **已正確**（但 Claude Opus 5 是反例，見下） |
| xAI 推理模型不支援 `stop` / penalty | `reasoning-05` 的 note 與現行官方文字**逐條相符**，是 xAI 側寫得最準的一條 |
| `docs.cloud.google.com/gemini-enterprise-agent-platform/*` 四個網址 | 全部 200、2026-07-29 仍在更新 → **不用動** |
| `cookbook.openai.com` / `platform.openai.com` 網域遷移 | 遊戲已全部使用 `developers.openai.com` → **不用動** |
| Anthropic 子頁合併 | 遊戲已全部指向合併頁 → **不用動**（但缺 anchor，見 §4） |

**新發現的反例**：`format-06` 的「Claude 新模型都偏簡短」對 Opus 5 是反的 ——
> "**Claude Opus 5 is an exception on verbosity: its default user-facing responses run longer than prior models'**"
> — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

---

## 二、未覆蓋的新技巧（依「中文圈一般人」的價值排序）

評分＝對「中文圈一般人、用聊天視窗、沒有 API」的實用價值（5 ＝明天就用得到）。
標記：🇨🇳 中文特化 ／ 📦 結構化輸出 ／ 🔧 工具與代理 ／ ⚡ 廠家反差素材。

### ★★★★★ 五分（15 條 — 這一批決定 Phase 27 的內容）

| # | 中文名 | 一句話 | 出處 |
|---|---|---|---|
| N-1 🇨🇳⚡ | **回答語言跟隨提問語言** | 一句話修掉「我用中文問、它用英文回」。**遊戲 68 條完全沒有任何一條提到輸出語言** —— 一個中文遊戲教 prompt 卻不教怎麼讓模型講中文，這是最不該有的缺口 | DeepSeek（**官方簡體中文原文**）https://github.com/deepseek-ai/DeepSeek-R1 ／ Mistral https://huggingface.co/mistralai/Magistral-Small-2509 ／ Meta https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/ |
| N-2 🇨🇳 | **六要素框架：背景／目的／風格／語氣／受眾／輸出** | Qwen 官方的中文 prompt 骨架，把「風格・語氣・受眾」升格成三個獨立必填欄位 | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide |
| N-3 🇨🇳 | **分隔符的「選字原則」** | 唯一有明文教「怎麼挑分隔符」的廠商：挑自然語言中罕見的字元組合（`###`、`===`、`>>>`），理由是別讓模型當成普通標點 | 同上 |
| N-4 🇨🇳 | **中文用詞歧義：「語言」→「語種」** | 四大廠英文文件永遠不會教的中文母語級優化 | 同上 |
| N-5 | **先講終點，不要規定每一步（outcome-first ＋ 停止條件）** | 定義「成功長什麼樣」與「什麼時候該停」，路徑交給模型 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| N-6 | **找出並修掉 prompt 裡互相矛盾的指令** | 「規則互相打架」是真實故障模式；官方解法是改寫成**有序決策樹** | https://docs.mistral.ai/models/best-practices/prompt-engineering ／ https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide |
| N-7 | **每條指令只講一次（精簡也是技巧）** | 對應 §1 B1；現有 `keepsPromptLean` 檢查器可直接複用 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| N-8 | **要求「簡短」時，明講什麼必須保留、什麼可以丟** | 一般人最常寫「幫我寫短一點」，這條是可立刻見效的升級 | 同上 |
| N-9 | **模糊時請它反問 1–3 個問題，而不是硬猜** | 遊戲 `grounding-03` 只有「工具缺參數才反問」，缺一般情境版 | https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide |
| N-10 | **用具體的寫作選擇定義語氣，不要用模糊標籤** | 把「請專業一點」改寫成可驗收的具體行為 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| N-11 | **明確寫出「適用範圍」** | 新模型照字面執行、不替你類推：「這個格式套用到每一節，不只第一節」 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 |
| N-12 ⚡ | **情緒勒索與全大寫已經無效（甚至有害）** | 見 §1 B2 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies |
| N-13 | **Prompt 健檢清單（22 條除錯項）** | 「寫壞了怎麼修」的官方診斷表，一半是一般人的病（錯字、未定義的行話、主觀形容詞、一次塞太多任務） | 同上 |
| N-14 ⚡📦 | **去掉「當然！以下是…」—— 四招疊加消滅廢話** | 角色＋規則＋明確指令＋一個範例四招同時上；結構上就是「多個檢查器同時滿分」的關卡，**零新程式碼** | https://developer.meta.com/ai/docs/how-to-guides/prompting/ |
| N-15 | **反說教：明列禁用片語** | 官方 system prompt 直接列出「重要的是…」「值得注意的是…」等禁用語 | https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/ |

### ★★★★ 四分（15 條）

| # | 中文名 | 一句話 | 出處 |
|---|---|---|---|
| N-16 🔧 | **工具使用 / function calling 的基本概念** | 遊戲 `agentic` 有 7 條全在教「描述怎麼寫」，缺「這件事到底是什麼」的入門 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview ／ https://developers.openai.com/api/docs/guides/function-calling |
| N-17 📦 | **結構化輸出：schema 承擔格式，prompt 只講任務** | 「Structured Outputs 保證符合 schema、JSON mode 只保證是合法 JSON」 | https://developers.openai.com/api/docs/guides/structured-outputs ／ https://docs.x.ai/developers/model-capabilities/text/structured-outputs |
| N-18 📦 | **缺欄位填 `null`，不要猜** | 與 `grounding-02`（給出路）同心法的結構化版 | https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide |
| N-19 🔧 | **檢索預算：什麼情況才值得再搜一次** | 天然的「勾選哪些情況才准再搜」決策樹關 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| N-20 🔧 | **動作預算**：`You have a limited action budget of <n> tool calls.` | 一句話控制 agent 亂用工具 | https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5 |
| N-21 🇨🇳⚡ | **引用要「就地」標在句尾，不要集中在文末** | Microsoft 給了對「為什麼要求引用能降低幻覺」最好的解釋：**模型必須犯兩個錯**；DeepSeek 用中文獨立說了同一件事 | https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering ／ https://github.com/deepseek-ai/DeepSeek-R1 |
| N-22 | **負面範例 ＋ 打亂範例順序** | 「範例的順序本身會被學成規律」很適合做成刻印題的錯誤選項 | https://docs.cohere.com/docs/advanced-prompt-engineering-techniques |
| N-23 | **範例一定要配指令** | 沒有清楚指令的 few-shot 會讓模型學到「不相干的規律」 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-examples |
| N-24 | **拆步驟時，明說「只回傳第幾步的結果」** | 一句話、極易檢查、一般人立刻有感 | https://docs.cohere.com/docs/crafting-effective-prompts |
| N-25 | **評分要用文字級距，不要用 1–5 數字級距** | 反直覺、四大廠都沒有、極易做成選擇建構題 | https://docs.mistral.ai/models/best-practices/prompt-engineering |
| N-26 | **不要叫模型自己數數量，把數量當輸入餵給它** | 與 N-27 合成「模型不會算數，那怎麼辦」主題 | 同上 |
| N-27 | **模型不會算數，但會寫程式（PAL）** | 純 prompt 層、聊天視窗就做得到的版本 | https://developer.meta.com/ai/docs/how-to-guides/prompting/ |
| N-28 | **自我一致性：同一題問三次取多數** | 一般人做得到、馬上有收穫 | 同上 ／ https://github.com/deepseek-ai/DeepSeek-R1 |
| N-29 | **`Recap`：在 prompt 結尾重述關鍵限制與格式** | Google 特有的第 11 個 prompt 元件 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies |
| N-30 | **沒有 system 欄位時，把它串在 user prompt 前面** | 補上遊戲 `role` 主題對「只用聊天視窗的人」的斷層 | https://docs.mistral.ai/models/best-practices/prompt-engineering |

### ★★★ 三分（8 條，記錄備查）

N-31 分隔符怎麼選（Markdown / XML / pipe，且長文件用 JSON 特別差，https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide）／
N-32 長對話中週期性重申格式指令（同上網域 gpt-5 guide）／
N-33 自建評分表再自評 `<self_reflection>`（同上）／
N-34 「實習生測試」＝ OpenAI 版的黃金法則，與 `clarity-01` 成對（https://developers.openai.com/api/docs/guides/function-calling）／
N-35 給理由的填空模板（https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5）／
N-36 最終摘要要「重新落地」——讀者沒看過你的工作過程（同上）／
N-37 token 版面經濟學：表格比 JSON 省、連續空白各算一個 token（https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering）／
N-38 迭代的停止判準：再加限制、輸出仍相似＝你已經迭代成功（https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-iteration）

### ⚡ 廠家反差素材（現成的、官方文件自己提供的取捨）

遊戲有廠家徽章機制，卻沒有任何一關在教**廠商之間的分歧**。以下六組都是一手可引、且能做成「同一題三個答案」的關卡：

1. **刻度盤沒有通用值** — Google 3.x「全部移除」／Google Vertex「1.0 起跳、答太短就調高」／xAI「數學用 0.0–0.3」／Qwen 思考「0.6，禁止 0」／Qwen 非思考「0.7」／Claude Sonnet 5「設了就 400」／DeepSeek 思考模式「設了不報錯但也沒作用」。**教學收束：參數建議一定要綁模型，抄別人的溫度是錯的。**
2. **prompt 該長還是該短** — Qwen 六要素＋一鍵擴寫 vs xAI「短而具體更可靠」vs Gemini 3.x「太冗長會過度分析」，而 Google 同一份文件又說「**always** include few-shot examples」。
3. **工具說明該寫多長** — Anthropic「**extremely detailed**，至少 3–4 句」vs OpenAI GPT-5.6「**concise and precise**」。（https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools vs https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6）
4. **該不該給它一個身分** — DeepSeek-R1「**Avoid adding a system prompt**」vs Mistral Magistral「**We highly recommend including the following system prompt**」。
5. **要不要叫它一步一步想** — OpenAI o 系列「不要」vs DeepSeek-R1「數學題**建議**加上『Please reason step by step』」。
6. **指令放前面還是後面** — GPT-4.1「頭尾各放一次」vs Anthropic／Google 長脈絡「資料在前、問題在後」；Google 自己在「圖片放文字前還是後」三頁三種答案。

**教學價值**：反差教「建議有範圍」，共識（如 N-21 的就地引用）教「什麼才是真的通則」。這比任何單一規則都值錢。

### 廠商覆蓋建議

| 廠商 | 內容價值 | 中文圈相關性 | 建議 |
|---|---|---|---|
| **Qwen** | 高（唯一的中文母語方法論：六要素、分隔符選字、語種歧義、四要素抑幻覺） | **最高** | **值得加成第 5 個徽章** |
| **DeepSeek** | 高（不用 system prompt、強制 `<think>`、公開自家 App prompt、JSON 模式前置條件、**官方簡體中文原文**） | **極高** | **值得加徽章**；它是唯一能讓「神諭原典」直接顯示官方中文原句的廠商 |
| **Mistral** | 最高（「What to Avoid」整節是四大廠沒有的一整片礦） | 低 | 挖內容，不給徽章 |
| **Meta / Llama** | 中高（反說教、self-consistency、PAL、去廢話四招） | 中低（官方語言清單**不含中文**） | 挖 3–4 條，不給徽章 |
| **Cohere / Microsoft** | 中高（負面範例、就地引用的雙重錯誤論、token 版面經濟學） | 低／中 | 挖內容，不給徽章 |

⚠️ **加徽章的護欄風險**：`finaleSeen` 的隱藏成就目前是「四廠全收集」。加到五、六廠會讓已通關玩家的成就條件回退，**違反護欄 7（不倒退）**。
安全作法：隱藏成就的條件**維持四廠**，新廠另立支線。

---

## 三、關卡重複度診斷

26 關 × 每關 4–7 條 rubric ＝ 106 條檢查項。實際分布：

| 檢查器 | 出現關數 | 占比 | 診斷 |
|---|---|---|---|
| `assignsTask` | **26 / 26** | 100% | 🔴 **每一關都有** —— 它已經不是「技巧」，是「及格線」 |
| `specifiesFormat` | **14 / 26** | 54% | 🟠 過半 |
| `hasDelimiters` | **12 / 26** | 46% | 🟠 近半 |
| `hasConstraint` | 11 / 26 | 42% | 🟠 |
| `groundsInContext` | 6 | 23% | ✅ |
| `explainsWhy` / `asksToVerify` | 5 | 19% | ✅ |
| `hasFewShot` | 4 | 15% | ✅ |
| `hasAudience` / `positiveFraming` / `hasStepByStep` / `mentionsParameters` / `givesOutForUncertainty` / `hasRole` | 3 | 12% | ✅ |
| `keepsPromptLean` / `asksToCiteSources` / `putsQuestionLast` / `decomposesTask` / `asksToRefine` | 2 | 8% | 🟡 偏低 |
| `definesTools` / `setsPersistence` / `requiresConfirmation` | **1** | 4% | 🟡 只出現一次 |

**為什麼會膩**：玩家在第 6 關之後，每一關的前兩段刻印幾乎都是「寫出任務」＋「指定格式」。
`assignsTask` 100% ＋ `specifiesFormat` 54% ＋ `hasDelimiters` 46% ＝ 前三名合計占了所有檢查項的 **49%**。

### 具體建議（**本階段不實作**，避免動到 26 關的評分平衡與 111 段刻印流程）

**原則：不是刪掉重複的檢查，是把它降權成「地基」而不是「得分點」。**

1. **`assignsTask` 全面降權為 0.5 分（目前 26 關全是 1 分）**
   它是每一關的前提，不該再被當成「這一關教的東西」。省下來的權重回填給該關真正的主題。
   影響：26 關的 `pass` 門檻要同步下修 0.5（總權重降 0.5，門檻＝總權重 50% 的規則不變）。

2. **這 6 關的 `specifiesFormat` 建議換掉**（它們的主題其實不是格式）：

   | 關卡 | 現況權重 | 建議換成 |
   |---|---|---|
   | `tool-forge-33`（工具鍛造間） | 2 | `definesTools` 加權（目前**只有這 1 關**用到） |
   | `subtask-workbench-31`（拆解工作台） | 1 | `decomposesTask` 加權（目前只有 2 關） |
   | `echo-workshop-35`（回音工坊） | 1 | `asksToRefine` 加權（目前只有 2 關） |
   | `draft-review-wheel-32`（草稿之輪） | 1 | `asksToRefine` 加權 |
   | `mask-workshop-41`（面具工坊） | 1 | `hasAudience`（角色與讀者本來就是一組） |
   | `silent-thinker-13`（靜默的推理者） | 1 | 移除；這一關的主題是 `keepsPromptLean`，格式只是雜訊 |

   留著格式的 8 關（`gate-of-clarity-01`、`postbox-sprite-02`、`mimic-mirror-04`、`council-envoy-06`、
   `example-hall-11`、`lantern-rows-12`、`priority-stair-42`、`four-elements-mirror-44`）本來就是在教格式，不動。

3. **這 5 關的 `hasDelimiters` 建議由 2 分降為 1 分**：`postbox-sprite-02`、`long-scroll-archive-05`、
   `example-hall-11`、`thinking-chamber-14`、`long-scroll-tower-23`
   —— 它們已經有 `groundsInContext` / `putsQuestionLast` / `hasFewShot` 承擔主題，分隔符只是達成手段。
   （`citation-desk-21`、`archive-seal-25`、`tool-forge-33`、`echo-workshop-35`、`mask-workshop-41`、
   `four-elements-mirror-44` 已經是 1 分，不動；`priority-stair-42` 的 3 分是那一關的主題，也不動。）
   同時參考 §1 B10：Anthropic 部落格已把 XML 標籤列為「較不必要」，這一項不宜再占 46% 的版面。

4. **給只出現一次的三個檢查器各再找一關**：`definesTools`（配 N-16 工具使用新關）、
   `setsPersistence`（配 N-19 檢索預算）、`requiresConfirmation`（配 N-13 授權邊界）。

5. **新增 2–3 個檢查器承接新主題**（見 §4）：`saysOutputLanguage`（N-1）、`decisionTree`（N-6）、`statesScope`（N-11）。
   這三個都是結構性偵測（不是關鍵字比對），符合既有的反作弊原則。

**預期效果**：前三名檢查器的合計占比從 49% 降到約 33%，每一關的「這一關在教什麼」會變得辨識得出來。

---

## 四、建議路線圖（Phase 27+）

### Phase 27 —— 誠實度收尾（低風險、應該先做）

1. **`role-04` 重寫**（§1 A4）：現行 xAI 文件方向已反轉，而且「角色任意順序混用」那句無來源。
2. **5 條技巧的 xAI 出處處理**（§1 A3 的表）：`iterate-05` 換 URL、`agentic-01` 換 URL、`structure-01` 移除 xai vendor、`iterate-04` 重寫或刪除。
3. **4 條技巧改指非 deprecated 的 Google 頁**（§5 的表）：純 URL 置換，內容不動。
4. **Anthropic 的 14 條技巧補 anchor**：現在全部指向同一個沒有錨點的合併頁，玩家點進去要自己找。
5. **`cot-02` / `cot-03` 補模型別 note**（§1 B5）；**`clarity-06` 的「Claude 4 系列」更新措辭**（§1 B3）。
6. **`lost-automaton-03` 的 mission 從「全部改寫」改成「先寫要做什麼，必要的禁止句留在後面」**（§1 B8）。

### Phase 28 —— 中文圈補課（最高投報率）

**新區域或新主題：「說話的規矩」**（N-1 ~ N-4 ＋ N-30）
—— 回答語言、六要素、分隔符選字、語種歧義、沒有 system 欄位時怎麼辦。
這一批全是 5 分，而且**只有中文文件才教得到**，正好對上「中文圈一般人」的定位。
需要：`curriculum.json` 新增 `qwen` / `deepseek` 兩個 vendor（`vendors` 是自由字串陣列，不用遷移）＋圖鑑新增廠家格。

### Phase 29 —— 減法與工具（兩個結構性主題）

- **「減法」主題**（N-5、N-7、N-8、N-10 ＋ §1 B1）：教「什麼時候該把東西拿掉」。
  同時處理 §3 的評分失衡 —— 目前 S 評價在獎勵「把每一項都塞進去」，與 2026 年三家官方的方向相反。
- **「工具與代理」補完**（N-16 ~ N-20）：工具使用是什麼、schema 承擔格式、檢索預算、動作預算、授權邊界。
  這一組需要**新的互動題型**：不是「寫一段 prompt」，而是
  **「勾選這個工具該不該被呼叫」／「把矛盾的規則排成決策樹」／「填工具說明的三個欄位」**。
  石碑刻印的「一段一段選」已經是現成的載體，只要換掉題目的形狀。

### Phase 30 —— 廠家反差廳

§2 的六組反差做成「先發模型卡，再出題」——同一個素材、同一個任務，換一張模型卡，正解就翻面。
資料層最小改動：`challenges.json` 新增 `modelCard` 與 `contrast` 兩個欄位；第二幕（神諭刻文）已經在渲染
「神諭原典：〈文件名〉↗」，改成並排兩欄即可，不需要新面板。
`rubric.js` 的 `checkOptions` 機制（Phase 10 加的）可以承接「依卡片反向計分」。
**擺放建議**：不開第六個 3D 區域（地形成本高），做成中央高原上的一座「分歧之廳」——
五根柱子、每根兩面刻著相反的神諭。敘事上也成立：這個世界的世界觀已經是「神諭」，**神諭彼此矛盾**是最自然的下一章。

### 持續維運

- **每季重跑一次出處健檢**（26 個網址逐一 curl；本次只花了兩分鐘就抓到 1 個 404 ＋ 1 個 deprecated）。
- Cohere 官方文件任何頁面後面加 `.md` 就回傳乾淨 Markdown，索引在 `https://docs.cohere.com/llms.txt` ——
  之後要定期重驗出處，這條路比 headless 渲染便宜得多。

---

## 五、出處健檢結果（2026-07-31 實測）

`curriculum.json` 共引用 **26 個不同網址**，逐一以 curl 跟隨轉址測試：

| 狀態 | 數量 | 明細 |
|---|---|---|
| ✅ 200 正常 | 21 | — |
| ❌ **404 已下架** | **1** | `https://docs.x.ai/docs/guides/grok-code-prompt-engineering`（被 5 條技巧引用）→ 顯示層已加註 |
| ⚠️ 官方標示即將移除 | 1 | `https://ai.google.dev/gemini-api/docs/gemini-3`（頁面自帶 "This page is deprecated and will be removed."，被 `format-06`、`structure-01`、`role-03`、`longcontext-03` 引用）→ 顯示層已加註，後繼參考 `whats-new-gemini-3.5` |
| ⚠️ 200 但為舊路徑 | 1 | `https://docs.x.ai/docs/guides/function-calling` → 正規路徑 `https://docs.x.ai/developers/tools/function-calling`（被 `agentic-02`、`agentic-05` 引用） |
| ⚠️ 200 但內容已搬走 | 1 | `https://docs.x.ai/developers/models/grok-4.5` 只剩規格表；提示教學在 `https://docs.x.ai/developers/grok-4-5` |
| ⚠️ 403（擋自動擷取） | 1 | `https://help.openai.com/en/articles/6654000-...`（瀏覽器應仍可開，但**它是 6 條技巧 ＋ 3 關官方性的單點依賴**，且無法自動驗證）→ 建議 Phase 27 人工確認，或改指 `https://developers.openai.com/api/docs/guides/prompt-engineering` |

另記：`framework-01` 引用的 Workspace PDF 仍 200，但內容是 2024-10 版；現行網頁版為
`https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/`。

---

## 六、本階段（Phase 26）實際做了什麼

**原則：`curriculum.json` 逐字未改**（那些引文在它們的年代是正確的引用），
所有補丁落在新的顯示層 `src/data/dated-notes.json`（`authored: "game"`）。

| 檔案 | 動作 |
|---|---|
| `src/data/dated-notes.json` | **新增**。4 條技巧時代註記（`params-01` / `params-02` / `cot-04` / `decompose-02`）＋ 2 條出處狀態註記（xAI 404、Google deprecated），每一條都附可點的 https 官方連結 |
| `src/challenges/content.js` | `createContent()` 收第 7 個參數；`displayTechnique()` 多回一個 `dated`；新增 `datedNote(id)` / `sourceNote(url)`。沒有這一層時安靜降級 |
| `src/ui/dom.js` | 新增 `datedNoteHtml()` / `sourceNoteHtml()` 兩個共用的小渲染器 |
| `src/ui/codex.js` | 圖鑑的技巧卡片顯示時代註記；官方出處清單旁標註已下架 / 即將移除 |
| `src/prompt/console.js` | 第二幕（神諭刻文）每一條刻文下面顯示時代註記與出處狀態 |
| `src/ui/inscription.js` | 刻文小語的小對話窗同上 |
| `src/styles.css` | `.datednote` / `.srcnote` —— 小、冷色、一條細線的註腳樣式 |
| `src/data/challenges.json` | `dial-room-43` 與 `effort-forge-15` 的 `clue` 各補一句有日期的查核備註（**評分、示範解答、刻印流程一律未動**） |
| `scripts/test-rubric.mjs` | 新增時代註記層的資料合法性測試（掛在真實技巧上、有年月、中文、無整句英文、連結不埋在文字裡、至少一個 https 官方出處、原網址仍留在 `curriculum.json`、顯示層真的接出來、沒有這一層時安靜降級） |

**刻意沒做的事**（留給 Phase 27，因為會動到評分平衡或 `curriculum.json`）：
`role-04` 重寫、5 條 xAI 出處置換、`dial-room-43` 的示範解答與刻印流程重做、
`assignsTask` 全面降權、新檢查器、新廠商徽章。

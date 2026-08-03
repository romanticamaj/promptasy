# 出處深連結稽核（Source deep-link audit）

> 稽核日：**2026-08-03**　·　方法：當天實際 `curl` / headless Chrome 抓下每一份官方文件，
> 逐條比對「這一列引用的是哪一節」，只有**在頁面上真的找得到**的 anchor 才寫回資料層。
> 一個 anchor 都沒有臆造：`heading` 型的 id 必須出現在當天抓下來的 HTML 裡，
> `fragment` 型的文字片段必須在頁面文字裡**唯一**命中（測試會重驗）。

## 為什麼要做這件事

CLAUDE.md 護欄 2 要求「圖鑑每條都能點到出處」。原本點得到的是**整份文件**——
玩家落在頁面最上面，還要自己在幾千字裡找那一句。深連結讓「附出處」真的完成：
點下去就落在被引用的那一節。

## 兩層寫法（為什麼不是一種）

| 層 | 檔案 | 做法 |
|---|---|---|
| 課程 v2 的 130 條技能 | `src/data/skill-codex-v2.json` | 遊戲自撰的資料層 → `url` **就地升級**，每一列多一個 `anchor` 欄記錄定位方式（`already` / `heading` / `repaired` / `fragment` / `none`），`none` 的另附 `anchorNote` 說明理由 |
| 舊 68 條技巧 | `src/data/source-anchors.json`（新增） | `curriculum.json` 是逐字保留的官方引文、**一個位元組都不能動** → 改用顯示層疊加：`{ techniqueId, url, anchored, method }`，`anchored` 與 `url` **只准差一個片段**（測試強制驗證），在 `content.js` / `prologue.js` 顯示時套上 |

`skill-codex-v2.json` 的網址變了，跟著同步的還有 `challenges.json` 的 `source`（結果面板那一行）
與 `flows.json` 雙面碑的模型卡出處 —— 它們指的是同一列，不同步就會出現「同一份文件兩種寫法」。
`dated-notes.json`（時代註記）的 5 條新官方連結也一併深連結。

## 覆蓋率

### 逐列（資料層 550 列出處）

| 定位方式 | 列數 |
|---|---:|
| 本來就有（實地確認 id 仍在） | 192 |
| 標題 id | 167 |
| 頁面層（誠實留白） | 116 |
| 標題 id（沿用 master list 記下的深連結） | 46 |
| 文字片段 | 20 |
| 修好失效的舊 anchor | 9 |

### 逐個「畫面上顯示得到的出處」（寫回之後重新盤點）

共 **963 列**顯示位置、**360 個相異網址**：

| 狀態 | 顯示列數 | 相異網址 |
|---|---:|---:|
| anchor-ok | 654 | 297 |
| fragment-ok | 22 | 18 |
| page-level | 287 | 45 |

`anchor-ok` ＝ 片段是頁面上真的有的 id；`fragment-ok` ＝ 文字片段在頁面上唯一命中；
`page-level` ＝ 誠實留在頁面層。**壞掉的片段：0**。

## 這次修好的：失效的舊 anchor

9 條原本就寫了 anchor、但**那個 id 在現在的頁面上已經不存在**（點過去只會停在頁面最上面）：

| 技能 | 舊 anchor（已失效） | 換成 | 依據 |
|---|---|---|---|
| `word-choice` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `fewshot-thinking` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `cot-explicit` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `think-control` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `think-after-tool` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `outcome-first` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |
| `agent-scope-drift` | `#avoid-focusing-on-passing-tests-and-hardcoding` | `#avoid-focusing-on-passing-tests-and-hard-coding` | 出處寫的章節「Avoid focusing on passing tests and hardcoding」對上頁面標題「 Avoid focusing on passing tests and hardcoding」 |
| `fmt-specify` | `#latex-output` | `#la-te-x-output` | 出處寫的章節「LaTeX output」對上頁面標題「 LaTeX output」 |
| `selfcheck-when` | `#leverage-thinking--interleaved-thinking-capabilities` | `#leverage-thinking-and-interleaved-thinking-capabilities` | 舊 anchor #leverage-thinking--interleaved-thinking-capabilities 已不存在；頁面上的 #leverage-thinking-and-interleaved-thinking-capabilities（「 Leverage thinking & interleaved thinking capabilities」）是同一個標題換了 slug 規則 |

## 逐網址驗證表

> 一列 ＝ 一份官方文件。「列數」是資料層有幾列引用它；「定位方式」是那些列各自的結果。

| 官方文件 | 列數 | 定位方式 | 用到的片段（節錄） |
|---|---:|---|---|
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices | 73 | 本來就有（實地確認 id 仍在） ×38；修好失效的舊 anchor ×9；標題 id（沿用 master list 記下的深連結） ×21；頁面層（誠實留白） ×3；標題 id ×2 | `#be-clear-and-direct` `#control-the-format-of-responses` `#tool-usage` |
| https://ai.google.dev/gemini-api/docs/prompting-strategies | 43 | 本來就有（實地確認 id 仍在） ×24；文字片段 ×1；標題 id（沿用 master list 記下的深連結） ×17；標題 id ×1 | `#clear-and-specific-instructions` `#input` `#constraints` |
| https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide | 30 | 頁面層（誠實留白） ×20；標題 id ×5；文字片段 ×5 | `#delimiters` `#:~:text=XML%20is%20convenient` `#3-chain-of-thought` |
| https://developers.openai.com/api/docs/guides/prompt-engineering | 20 | 本來就有（實地確認 id 仍在） ×11；標題 id ×1；頁面層（誠實留白） ×2；文字片段 ×2；標題 id（沿用 master list 記下的深連結） ×4 | `#include-relevant-context-information` `#message-formatting-with-markdown-and-xml` `#few-shot-learning` |
| https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering | 18 | 標題 id ×17；頁面層（誠實留白） ×1 | `#best-practices` `#provide-grounding-context` `#add-clear-syntax` |
| https://docs.mistral.ai/models/best-practices/prompt-engineering | 16 | 標題 id ×16 | `#structure` `#avoid` `#personalization` |
| https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide | 16 | 頁面層（誠實留白） ×7；標題 id ×7；文字片段 ×2 | `#prompting-for-less-eagerness` `#matching-codebase-design-standards` `#:~:text=Write%20code%20for` |
| https://developer.meta.com/ai/docs/how-to-guides/prompting/ | 15 | 標題 id ×15 | `#crafting-effective-prompts` `#restrictions` `#retrieval-augmented-generation` |
| https://developers.openai.com/api/docs/guides/reasoning-best-practices | 14 | 頁面層（誠實留白） ×8；標題 id ×6 | `#how-to-prompt-reasoning-models-effectively` `#reasoning-models-vs-gpt-models` `#how-to-keep-costs-low-and-accuracy-high` |
| https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide | 14 | 標題 id ×9；頁面層（誠實留白） ×5 | `#avoid-chain-of-thought-prompting` `#context-setting-via-developer-message` `#agentic-experience-with-hosted-tools` |
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5 | 13 | 本來就有（實地確認 id 仍在） ×13 | `#give-the-reason-not-only-the-request` `#recommended-scaffolding-changes` `#consider-all-effort-levels` |
| https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 | 13 | 頁面層（誠實留白） ×9；文字片段 ×1；標題 id ×3 | `#:~:text=Repeating%20instructions%20such` `#define-the-tone` `#make-routing-instructions-task-specific` |
| https://help.aliyun.com/zh/model-studio/prompt-engineering-guide | 11 | 頁面層（誠實留白） ×4；標題 id ×7 | `#05776c0f8brr0` `#48dbb207cbaf0` `#2ae22a9c7028a` |
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 | 10 | 本來就有（實地確認 id 仍在） ×10 | `#more-literal-instruction-following` `#calibrating-effort-and-thinking-depth` `#interactive-coding-products` |
| https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide | 10 | 標題 id ×5；文字片段 ×4；頁面層（誠實留白） ×1 | `#33-long-context-and-recall` `#34-handling-ambiguity--hallucination-risk` `#:~:text=Keep%20iterating%20until` |
| https://developers.openai.com/api/docs/guides/function-calling | 8 | 頁面層（誠實留白） ×5；標題 id ×3 | `#best-practices-for-defining-functions` |
| https://docs.cohere.com/docs/crafting-effective-prompts | 8 | 標題 id ×8 | `#do-vs-do-not-do` `#context` `#formatting-and-delimiters` |
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5 | 8 | 本來就有（實地確認 id 仍在） ×8 | `#running-with-thinking-disabled` `#user-facing-progress-updates` `#controlling-subagent-spawning` |
| https://github.com/deepseek-ai/DeepSeek-R1 | 7 | 標題 id ×7 | `#usage-recommendations` `#official-prompts` |
| https://developers.openai.com/api/docs/guides/latest-model | 7 | 文字片段 ×1；頁面層（誠實留白） ×1；本來就有（實地確認 id 仍在） ×5 | `#:~:text=Use%20pro%20mode%20when` `#prompting-best-practices` |
| https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5 | 6 | 本來就有（實地確認 id 仍在） ×6 | `#thinking-budget` `#reducing-tool-calls` `#sampling-parameters` |
| https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools | 6 | 本來就有（實地確認 id 仍在） ×6 | `#best-practices-for-tool-definitions` `#providing-tool-use-examples` `#forcing-tool-use` |
| https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api | 6 | 頁面層（誠實留白） ×6 | — |
| https://docs.cohere.com/docs/advanced-prompt-engineering-techniques | 5 | 標題 id ×5 | `#defining-the-task` `#few-shot-prompting` `#chain-of-thought-prompting` |
| https://claude.com/blog/best-practices-for-prompt-engineering | 5 | 頁面層（誠實留白） ×4；標題 id ×1 | `#customer-stories` |
| https://huggingface.co/Qwen/Qwen3-235B-A22B | 5 | 標題 id ×4；頁面層（誠實留白） ×1 | `#advanced-usage-switching-between-thinking-a…` `#best-practices` `#agentic-use` |
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8 | 5 | 本來就有（實地確認 id 仍在） ×5 | `#calibrating-effort-and-thinking-depth` `#controlling-subagent-spawning` `#tone-and-writing-style` |
| https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech | 5 | 本來就有（實地確認 id 仍在） ×5 | `#per-response-instructions` `#force-message` `#keyterms` |
| https://ai.google.dev/gemini-api/docs/gemini-3 | 5 | 頁面層（誠實留白） ×4；標題 id ×1 | `#prompting-best-practices` |
| https://docs.x.ai/docs/guides/grok-code-prompt-engineering | 5 | 頁面層（誠實留白） ×5 | — |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-design-strategies | 4 | 本來就有（實地確認 id 仍在） ×4 | `#how-to-create-an-effective-prompt` `#components-of-a-prompt` `#sample-prompt-template` |
| https://ai.google.dev/gemini-api/docs/long-context | 4 | 本來就有（實地確認 id 仍在） ×4 | `#long-form-text` `#where_is_the_best_place_to_put_my_query_in_…` `#getting-started-with-long-context` |
| https://developers.openai.com/api/docs/guides/reasoning | 4 | 標題 id ×3；頁面層（誠實留白） ×1 | `#reasoning-summaries` `#advice-on-prompting` |
| https://docs.x.ai/developers/model-capabilities/text/reasoning | 4 | 本來就有（實地確認 id 仍在） ×2；標題 id（沿用 master list 記下的深連結） ×2 | `#the-reasoning_effort-parameter` `#multi-agent-model` |
| https://docs.x.ai/developers/model-capabilities/text/structured-outputs | 4 | 本來就有（實地確認 id 仍在） ×2；標題 id ×1；標題 id（沿用 master list 記下的深連結） ×1 | `#system-prompt` `#best-effort-keywords` `#example-client-side-tools-with-structured-o…` |
| https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview | 4 | 本來就有（實地確認 id 仍在） ×2；頁面層（誠實留白） ×2 | `#when-to-prompt-engineer` `#before-prompt-engineering` |
| https://ai.google.dev/gemini-api/docs/safety-guidance | 4 | 本來就有（實地確認 id 仍在） ×4 | `#consider_adjustments_to_mitigate_safety_and…` `#perform_safety_testing_appropriate_to_your_…` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/clear-instructions | 3 | 標題 id ×1；頁面層（誠實留白） ×2 | `#google-signin-client-id` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/introduction-prompt-design | 3 | 標題 id ×1；頁面層（誠實留白） ×2 | `#what-is-prompt-design-and-prompt-engineering` |
| https://api-docs.deepseek.com/guides/thinking_mode | 3 | 標題 id ×3 | `#thinking-mode-toggle-and-effort-control` `#tool-calls` `#input-and-output-parameters` |
| https://developers.openai.com/api/docs/guides/structured-outputs | 3 | 標題 id ×2；頁面層（誠實留白） ×1 | `#chat` `#structured-outputs-vs-json-mode` |
| https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512 | 3 | 標題 id ×3 | `#recommended-settings` |
| https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/ | 3 | 頁面層（誠實留白） ×2；文字片段 ×1 | `#:~:text=I%E2%80%99m%20a%20project%20manager` |
| https://ai.google.dev/gemini-api/docs/files | 3 | 本來就有（實地確認 id 仍在） ×3 | `#prompt-design-fundamentals` `#troubleshooting-your-multimodal-prompt` `#break_it_down_step-by-step` |
| https://ai.google.dev/gemini-api/docs/image-generation | 3 | 本來就有（實地確認 id 仍在） ×3 | `#image-generation-prompts` `#best-practices` `#image-editing-prompts` |
| https://ai.google.dev/gemini-api/docs/veo | 3 | 本來就有（實地確認 id 仍在） ×3 | `#basics` `#more-tips` `#audio` |
| https://docs.x.ai/developers/tools/code-execution | 2 | 本來就有（實地確認 id 仍在） ×2 | `#best-practices` `#when-to-use-code-execution` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/few-shot-examples | 2 | 標題 id ×1；頁面層（誠實留白） ×1 | `#zero-shot-versus-few-shot-prompts` |
| https://ai.google.dev/gemini-api/docs/thinking | 2 | 文字片段 ×1；本來就有（實地確認 id 仍在） ×1 | `#:~:text=Always%20present%2C%20even` `#best_practices` |
| https://huggingface.co/Qwen/Qwen3.5-397B-A17B | 2 | 標題 id ×2 | `#instruct-or-non-thinking-mode` `#best-practices` |
| https://help.aliyun.com/zh/model-studio/deep-thinking | 2 | 頁面層（誠實留白） ×1；標題 id ×1 | `#5caa63cc88kzd` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/break-down-prompts | 2 | 標題 id ×2 | `#task-1:-identify-customer-issues` |
| https://docs.x.ai/developers/tools/tool-usage-details | 2 | 本來就有（實地確認 id 仍在） ×2 | `#understanding-turns-vs-tool-calls` `#real-time-server-side-tool-calls` |
| https://docs.x.ai/developers/tools/advanced-usage | 2 | 本來就有（實地確認 id 仍在） ×2 | `#understanding-max_turns-with-client-side-to…` `#append-the-encrypted-agentic-tool-calling-s…` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions | 2 | 本來就有（實地確認 id 仍在） ×1；標題 id（沿用 master list 記下的深連結） ×1 | `#use_cases` |
| https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama4/ | 2 | 標題 id ×2 | `#-roles-` `#-suggested-system-prompt-` |
| https://docs.cohere.com/docs/system-instructions | 2 | 標題 id ×2 | `#writing-a-custom-system-message` |
| https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/ | 2 | 頁面層（誠實留白） ×2 | — |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/adjust-parameter-values | 2 | 頁面層（誠實留白） ×2 | — |
| https://ai.google.dev/gemini-api/docs/function-calling | 2 | 本來就有（實地確認 id 仍在） ×2 | `#best-practices` `#workarounds-for-pre-tool-text-requirements` |
| https://docs.x.ai/developers/tools/function-calling | 2 | 本來就有（實地確認 id 仍在） ×2 | `#tool-schema-reference` `#tool-choice` |
| https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview | 2 | 本來就有（實地確認 id 仍在） ×2 | `#when-claude-uses-tools` |
| https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices | 2 | 本來就有（實地確認 id 仍在） ×2 | `#best-practices` `#does-caching-affect-output-quality` |
| https://ai.google.dev/gemini-api/docs/image-understanding | 2 | 本來就有（實地確認 id 仍在） ×2 | `#tips-best-practices` `#media_resolution` |
| https://docs.x.ai/developers/model-capabilities/audio/text-to-speech | 2 | 本來就有（實地確認 id 仍在） ×2 | `#writing-effective-text` `#speech-tags` |
| https://docs.x.ai/docs/guides/function-calling | 2 | 頁面層（誠實留白） ×1；標題 id ×1 | `#parallel-function-calling` |
| https://support.google.com/a/users/answer/14200040 | 1 | 標題 id ×1 | `#natural-language` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/contextual-information | 1 | 標題 id ×1 | `#google-signin-client-id` |
| https://ai.google.dev/gemini-api/docs/url-context | 1 | 本來就有（實地確認 id 仍在） ×1 | `#best-practices` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/structure-prompts | 1 | 標題 id ×1 | `#google-signin-client-id` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-templates | 1 | 文字片段 ×1 | `#:~:text=Do%20%7Banimal_name%7D%20%7Banimal_…` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/explain-reasoning | 1 | 標題 id ×1 | `#examples` |
| https://huggingface.co/Qwen/QwQ-32B | 1 | 標題 id ×1 | `#usage-guidelines` |
| https://docs.x.ai/developers/tools/citations | 1 | 標題 id ×1 | `#inline-citations` |
| https://docs.x.ai/build/features/plan-mode | 1 | 標題 id ×1 | `#when-to-use` |
| https://ai.google.dev/gemini-api/docs/deep-research | 1 | 本來就有（實地確認 id 仍在） ×1 | `#collaborative-planning` |
| https://api-docs.deepseek.com/guides/multi_round_chat | 1 | 頁面層（誠實留白） ×1 | — |
| https://docs.x.ai/build/features/subagents | 1 | 頁面層（誠實留白） ×1 | — |
| https://docs.x.ai/build/features/project-rules | 1 | 標題 id ×1 | `#discovery` |
| https://docs.x.ai/build/features/skills-plugins-marketplaces | 1 | 頁面層（誠實留白） ×1 | — |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instruction-introduction | 1 | 本來就有（實地確認 id 仍在） ×1 | `#use_cases` |
| https://docs.mistral.ai/models/best-practices/sampling | 1 | 標題 id ×1 | `#temperature` |
| https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512 | 1 | 標題 id ×1 | `#recommended-settings` |
| https://docs.x.ai/developers/tools/web-search | 1 | 本來就有（實地確認 id 仍在） ×1 | `#only-search-in-specific-domains` |
| https://docs.x.ai/developers/migration/may-15-retirement | 1 | 本來就有（實地確認 id 仍在） ×1 | `#recommended-replacements` |
| https://api-docs.deepseek.com/guides/chat_prefix_completion | 1 | 頁面層（誠實留白） ×1 | — |
| https://api-docs.deepseek.com/guides/json_mode | 1 | 標題 id ×1 | `#notice` |
| https://ai.google.dev/gemini-api/docs/structured-output | 1 | 本來就有（實地確認 id 仍在） ×1 | `#vs-function-calling` |
| https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use | 1 | 頁面層（誠實留白） ×1 | — |
| https://ai.google.dev/gemini-api/docs/code-execution | 1 | 本來就有（實地確認 id 仍在） ×1 | `#limitations` |
| https://developers.openai.com/api/docs/guides/prompt-caching | 1 | 頁面層（誠實留白） ×1 | — |
| https://ai.google.dev/gemini-api/docs/caching | 1 | 本來就有（實地確認 id 仍在） ×1 | `#implicit-caching` |
| https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn | 1 | 標題 id ×1 | `#what-breaks-caching` |
| https://docs.x.ai/developers/grok-4-5 | 1 | 本來就有（實地確認 id 仍在） ×1 | `#important-details` |
| https://docs.x.ai/developers/advanced-api-usage/context-compaction | 1 | 標題 id ×1 | `#context-compaction` |
| https://docs.x.ai/build/modes-and-commands | 1 | 本來就有（實地確認 id 仍在） ×1 | `#core-tui-commands` |
| https://docs.x.ai/developers/model-capabilities/text/generate-text | 1 | 標題 id ×1 | `#chaining-the-conversation` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-iteration | 1 | 文字片段 ×1 | `#:~:text=for%20multimodal%20prompts%2C` |
| https://developers.openai.com/api/docs/guides/prompting | 1 | 標題 id ×1 | `#refine-your-prompt` |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/compare-prompts | 1 | 頁面層（誠實留白） ×1 | — |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer | 1 | 頁面層（誠實留白） ×1 | — |
| https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/zero-shot-optimizer | 1 | 頁面層（誠實留白） ×1 | — |
| https://github.com/meta-llama/llama-prompt-ops | 1 | 標題 id ×1 | `#what-is-prompt-ops` |
| https://ai.google.dev/gemini-api/docs/computer-use | 1 | 本來就有（實地確認 id 仍在） ×1 | `#safety-best-practices` |
| https://ai.google.dev/gemini-api/docs/agents | 1 | 本來就有（實地確認 id 仍在） ×1 | `#security-best-practices` |
| https://developer.meta.com/ai/docs/how-to-guides/vision-capabilities/ | 1 | 標題 id ×1 | `#-capabilities-of-llama-3.2-` |
| https://ai.google.dev/gemini-api/docs/video-understanding | 1 | 頁面層（誠實留白） ×1 | — |
| https://ai.google.dev/gemini-api/docs/document-processing | 1 | 本來就有（實地確認 id 仍在） ×1 | `#best-practices` |
| https://docs.x.ai/developers/model-capabilities/images/editing | 1 | 本來就有（實地確認 id 仍在） ×1 | `#style-transfer` |
| https://huggingface.co/mistralai/Magistral-Small-2509 | 1 | 標題 id ×1 | `#sampling-parameters` |
| https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512/blob/main/SYSTEM_PROMPT.txt | 1 | 頁面層（誠實留白） ×1 | — |
| https://huggingface.co/Qwen/Qwen3-235B-A22B-Thinking-2507 | 1 | 標題 id ×1 | `#best-practices` |
| https://docs.x.ai/developers/models/grok-4.5 | 1 | 頁面層（誠實留白） ×1 | — |
| https://services.google.com/fh/files/misc/gemini_for_workspace_prompt_guide_october_2024_digital_final.pdf | 1 | 頁面層（誠實留白） ×1 | — |

## 誠實留在頁面層的（none）與理由

| 理由 | 列數 | 涉及的文件（節錄） |
|---|---:|---|
| 頁面層引用（出處沒有指名章節），且 master 條目的官方引文在這一版頁面上找不到唯一落點 | 95 | https://developers.openai.com/api/docs/guides/function-calling<br>https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide<br>https://claude.com/blog/best-practices-for-prompt-engineering<br>…共 35 份 |
| page-unfetchable | 2 | https://workspace.google.com/intl/en/resources/ai/writing-effective-prompts/ |
| 出處寫的章節「構建清晰明確的 Prompt」在這一版頁面上找不到對得起來的 id | 1 | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide |
| 出處寫的章節「Use delimiters」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/reasoning-best-practices |
| 出處寫的章節「使用分隔符號區分單元」在這一版頁面上找不到對得起來的 id | 1 | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide |
| 出處寫的章節「Reasoning effort」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「Give the model an "out"」在這一版頁面上找不到對得起來的 id | 1 | https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering |
| 出處寫的章節「Be specific」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/reasoning-best-practices |
| 出處寫的章節「Cursor 案例」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide |
| 出處寫的章節「Long-running workflows and state」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「Suggested prompt structure」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「Adequate Output Length」在這一版頁面上找不到對得起來的 id | 1 | https://huggingface.co/Qwen/Qwen3-235B-A22B |
| 出處寫的章節「Beta」在這一版頁面上找不到對得起來的 id | 1 | https://api-docs.deepseek.com/guides/chat_prefix_completion |
| 出處寫的章節「2025-11-10」在這一版頁面上找不到對得起來的 id | 1 | https://claude.com/blog/best-practices-for-prompt-engineering |
| 出處寫的章節「2024-07-29」在這一版頁面上找不到對得起來的 id | 1 | https://blog.google/products-and-platforms/products/workspace/google-gemini-workspace-ai-prompt-tips/ |
| 出處寫的章節「Prompt 測試與迭代」在這一版頁面上找不到對得起來的 id | 1 | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide |
| 出處寫的章節「Prompt 一鍵優化工具」在這一版頁面上找不到對得起來的 id | 1 | https://help.aliyun.com/zh/model-studio/prompt-engineering-guide |
| 出處寫的章節「Check work before finishing」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「Frontend and visual tasks」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「Prompt migration workflow」在這一版頁面上找不到對得起來的 id | 1 | https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6 |
| 出處寫的章節「PDF」在這一版頁面上找不到對得起來的 id | 1 | https://services.google.com/fh/files/misc/gemini_for_workspace_prompt_guide_october_2024_digital_final.pdf |

### 三個抓不到的網域（誠實記錄，本次沒有改動）

| 網域 | 狀況 | 處置 |
|---|---|---|
| `help.openai.com/…/6654000-best-practices…` | 對非瀏覽器一律回 **403**（Zendesk 反爬），headless Chrome 也拿不到內容 | 保留頁面層網址；`docs/promptbooks` 早已記為「找不到」 |
| `docs.x.ai/docs/guides/grok-code-prompt-engineering` | **404**，文件已下架 | 保留原網址 ＋ `dated-notes.json` 既有的「已下架 ＋ 後繼參考」標註（Phase 26 就做了） |
| `developer.meta.com/ai/docs/…` | 對 `curl` 回 **400**（要 JS） | 用 headless Chrome `--dump-dom` 取得，anchor 照樣驗證過 ✔ |

## 文字片段（Text Fragments）這個選擇

有些頁面（OpenAI cookbook 的長篇 guide、Google 的 blog、Mistral 的分頁式文件）
被引用的那一句底下**沒有可用的標題 id**。這種情況改用 W3C 的
[Text Fragments](https://wicg.github.io/scroll-to-text-fragment/)（`#:~:text=…`）：

- Chrome / Edge：捲到那句話並 highlight —— 正是我們要的「直接落在被引用的那一段」。
- Safari / Firefox：不支援時**安靜地正常開啟該頁面**，不會壞掉（優雅降級）。
- 片段一律 ≤ 8 個詞，且在頁面文字裡**唯一**命中（重複命中就不用，寧可退回頁面層）。
- 片段取的是**頁面上的原字**（彎引號、破折號原樣），不是正規化過的版本 —— 否則瀏覽器比不到。

## 怎麼重驗

```bash
npm run test:rubric   # 疊加層只准差片段、每一列都要表態、覆蓋率契約（scripts/expected-counts.json 的 sourceAnchors）
npm run test:e2e      # 畫面上的 href 真的帶著片段（第二幕神諭原典、圖鑑、試煉零連結）
```

離線測試驗的是「資料層與顯示層一致、片段格式合法」；
**「這個 id 在線上真的存在」只有稽核當天實際抓頁面驗證過**（本檔就是那份紀錄）。
官方文件改版時 anchor 會失效 —— 下一次稽核照著上面的方法重跑一遍即可。

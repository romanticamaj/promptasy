# Spec：濁靈遭遇（Murk Encounter）— 地圖上的「受污染的請求」

> **分支**：`feature/tainted-request-encounter` ｜ **成文**：2026-08-17 ｜ **修訂**：v2（吸收 Codex 審查：獨立 recorder／`murks` 存檔欄、`onRubricHits` 差量契約、去掉跟隨光靈）｜ **狀態**：草稿，待站長核准後開工。**實作拆成 roadmap P01–P04 四次執行**（見 `gameplay-roadmap.md`）。
> **上游**：`docs/design/gameplay-research-2026-08.md`（研究＋Codex 審查；本 spec 對應其 §6.4 第 3 步「靜止的受污染請求遭遇」與第 2 步「rubric → 世界可見因果」的最小切片）
> **不在本 spec 內**：行動裝置操作 → [GitHub issue #4](https://github.com/romanticamaj/promptasy/issues/4)；跳躍／攻擊鍵、會追人的敵人、區域色彩腳本 → 後續 phase。

---

## 0. 一句話

在地圖上放幾隻**濁靈（Murk）**——每一隻是一段「寫壞的請求」具象化的小生物。走近按 `E`，用現有主控台**自由書寫**一段好 prompt；評分引擎每命中一項檢查，牠身上就剝掉一層濁氣（閃光＋粒子＋音效）；達標後牠被「安撫」成一盞安靜的小光靈，跟你走幾步、然後回到原位變成路燈，並收進圖鑑「走出來的收集」。**沒有血量、沒有追逐、沒有懲罰、不會失敗**——這是 Promptasy 版本的「遇到哥布林」。

## 1. 目標與非目標

**目標**
1. 給玩家「遭遇 → 出招 → 打中 → 收服」的戰鬥節奏與果汁，但攻擊＝prompt 品質（護欄 1）。
2. 第一次把「rubric 命中 → 世界可見因果」做出來（研究 5-A 的最小版），為之後的關卡演出探路。
3. 一個新的可收集類別（圖鑑第四列），強化搜集。

**非目標（本 phase 明確不做）**
- 濁靈**不移動、不追人、不碰玩家**（WORLD.md:147「沒有會走動的 NPC」、:153「先問能不能改成留在原地的東西」——濁靈是留在原地的東西，會動的只有頭與濁氣）。
- 玩家不加任何新按鍵（WORLD.md:259「`E` 是唯一的互動鍵」）。
- 不做 hitstop／螢幕震動／慢動作（Codex：會把閱讀回饋包成壓力事件；先只用既有 `engine.pulse` 與粒子）。
- 不改任何既有 142 關資料、不動 `curriculum.json`、不動 `scripts/expected-counts.json` 的既有契約值（只**新增**鍵）。
- 不做手機（#4）。

## 2. 玩家體驗（逐拍）

1. **遠看**（45m 內）：一團低矮的暗色濁氣在原地翻湧，中央有一顆微弱的眼光；沒有光源，只用 emissive。與區域色盤同色系但明度更低，像一塊「該區的顏色被弄髒的地方」。
2. **走近**（≤ 8m）：濁靈轉頭盯你、發出短促雜訊（音效 `murkStir`，節流）；HUD 互動提示：`濁靈 · 一段沒說清楚的請求 <kbd>E</kbd> 安撫`（格式照 WORLD.md:259：標題＋一句狀態＋E＋動詞）。
3. **按 E**：開既有主控台（`promptConsole.open(murkChallenge)`），主控台**強制自由書寫**。第一幕「委託」改顯示牠的**濁言**（那段寫壞的 prompt，例：「幫我寫個東西，不要太長也不要太短，反正你懂的」）＋任務（「把這句話說清楚，讓它變成一個能被執行的請求」）；線索 `clue` 照舊。
4. **送出**：評分引擎逐項判定。**演出**：每命中一項 rubric → 對應的一層濁氣殼剝落（縮小＋淡出）、身體閃白 2 幀、8–12 顆加法粒子、音效 `murkHit`（依累積分數換音高層）、`engine.pulse(0.28)`；沒命中的項目在主控台照舊逐條顯示「缺什麼＋出處」（既有 fail 路徑，WORLD §3.5:471「柔和的音效、逐條指出缺什麼、附出處。不是懲罰」）——濁靈本體**不反擊**，只是剩下的殼還在，可以再寫。
5. **達標**（`score ≥ pass`）：最後一層殼散開，眼光轉為暖白，濁靈縮成一盞**清燈**（原位、常駐、回頭看得到自己安撫過的痕跡）；`hud.celebrate`／既有過關音；記入圖鑑。過關演出＝一撮光屑從濁靈飛出、繞玩家一圈（≤3 秒）回到清燈位——**沒有任何實體跟隨玩家**（WORLD.md:147/153；`reducedMotion` 直接落成清燈）。
6. **重玩與累積**：沒達標時已命中的檢查**記在存檔裡、永不清零**——下次回來殼數＝已命中數，只要把剩下的補上；安撫過的濁靈仍可按 E 再寫拿更高評價。

## 3. 資料層（`authored: "game"`）

新檔 `src/data/murks.json`：

```jsonc
{
  "version": 1,
  "authored": "game",
  "note": "遊戲自撰的『濁言』與情境；rubric 檢查器與教學出處沿用官方文件，不新增技巧、不改 curriculum。",
  "xp": 24,
  "entries": [
    {
      "id": "murk-vague-ask",
      "region": "foundations",
      "at": [52, -8],                    // 世界座標 [x, z]，照 handles.json / REACTIVE_SPOTS 慣例
      "title": "含糊的請求",
      "taint": "幫我寫個東西，不要太長也不要太短，反正你懂的。",   // 牠的濁言（弱 prompt）
      "mission": "把這句話說清楚：說明要做什麼、給誰、什麼格式、多長。",
      "clue": "明確指定任務、對象、輸出格式與可量化的長度。",
      "teaches": ["clarity", "format"],   // technique id（沿用 curriculum）
      "primarySkillId": "v2-xxx",         // 對應 skill-codex-v2 的技能，圖鑑連結用
      "rubric": [
        { "check": "assignsTask",     "weight": 2, "hint": "先說清楚要做的『事』是什麼" },
        { "check": "specifiesFormat", "weight": 1, "hint": "指定輸出格式（條列／表格／一段話）" },
        { "check": "hasConstraint",   "weight": 1, "hint": "加一個可量化的限制（例如『三句話』）" }
      ],
      "pass": 3,
      "sample": "……",                    // 範例解（playtest 要求 ≥ A）
      "source": "https://ai.google.dev/gemini-api/docs/prompting-strategies"
    }
  ]
}
```

- **v1 數量：8 隻**，落在前四區（foundations 起）各 2 隻，各綁一項該區已教的技巧；`taint` 文案要「像玩家自己會寫出來的爛 prompt」，並且與 `sample` 構成弱→強對照（圖鑑條目就是這一對）。
- `rubric[].check` 只能引用 `src/challenges/checks.js` 既有檢查器（測試強制）；`source` 必須是 `source-anchors.json` 已登錄的官方 URL（測試強制）。
- 座標規則：離任何石座 ≥ 8m、離橋／頸口 ≥ 4m、離其他互動物 ≥ 4m、不在出生點 7m 內、必須在 `REGION_SITES` 該區半徑內（測試強制，照 WORLD.md 淨空規則）。

## 4. 系統設計

### 4.1 世界實體 `src/world/murks.js`（新）
- `createMurkField({ entries, kitOf, terrainHeight, isBusy, reducedMotion })` → `{ group, murks, update(dt,t,px,pz), nearest(pos, maxDist), calm(id, grade), setCalmed(id, grade) }`。樣板照 `reactive.js` 的 `createReactiveField`：扁平陣列、`FAR_SQ=45²` 整組跳過、`NEAR_SQ=15²` 外每 3 幀一次、**零每幀配置**（暫存向量提模組層）。
- 每隻＝`THREE.Group` 命名 `murk:<id>`（`類型:id` 慣例，碰撞稽核與 e2e 靠它）；子件：`core`（眼光，emissive）、`shells[]`（濁氣殼，數量＝rubric 條數，半透明 → 稽核自動免除）、`body`（實心底座，`userData.solidRadius = 0.9`）、`glow`（sprite）。**0 光源**。
- 狀態機：`idle → aware（玩家 ≤8m，轉頭＋stir 音效節流 TRIGGER_COOLDOWN）→ struck（逐殼剝落動畫，由 console 回呼驅動）→ calming（縮成光靈）→ following（跟隨 8s 計時器，不是幀數）→ settled（原位小燈）`；`reducedMotion` 時跳過跟隨、直接 settled。
- 幾何預算：每隻 ≤ 600 三角形（8 隻 < 5k，總量遠低於 420k 上限）。

### 4.2 互動仲裁 `src/main.js`
- 新增第 ⑥ 層「遭遇」：互動半徑 **5.5**，優先序 **石座 6.5 > 濁靈 5.5 > 石碑 4.6 > 刻文 3.8 > 器物 3.2 > 閘門**（WORLD.md:272 的遞減規則，濁靈夾在石座與石碑之間；資料層座標規則保證濁靈不會與石座同時在範圍內）。
- `KeyE && nearMurk` → `audio.cue('open'); openPanel(promptConsole, murk.challenge)`；`murk.challenge` 是由 entry 組出的 challenge 形物件（`{ id, region, title, npc:'濁靈', scenario: taint, mission, clue, teaches, primarySkillId, rubric, pass, sample, source, kind:'murk' }`），**沒有 flow → console 既有邏輯自動 free**（`console.js:2076`）。
- WORLD.md §3.2 表格加一列 ⑥；`nearestMurk` 用與 `nearestHandle` 相同的面向排名。

### 4.3 主控台 `src/prompt/console.js`（最小改動）
- `challenge.kind === 'murk'` 時：第一幕標題改「濁言」、顯示 `taint` 為引文樣式；其餘四幕流程、手掌印、範例解鎖（`SAMPLE_AFTER_FAILS`）全部沿用。
- **唯一 recorder**：`renderResult()` 依 `challenge.kind` 分流——`murk` → `progression.recordMurk(id, evaluation)`；**不**呼叫 `recordResult`（否則會進 `bestGrades`、觸發 XP／技能／`refreshUnlocks()`，污染 142 關統計）。既有 `onResult` 照樣觸發，main.js 端依 `kind` 分支。
- 新增回呼 `onRubricHits?.({ challenge, passedIndices, newlyPassedIndices, total })`：以 **rubric 陣列 index** 為穩定 ID；`passedIndices`＝本次命中；`newlyPassedIndices`＝相對於存檔累積 `hits` 的新增；評分完成、顯示結果**之前**觸發。世界端只對 `newly` 剝殼，重開面板不重播；`total`＝rubric 條數＝殼數。

### 4.4 進程與存檔
- `save.js`：新增**單一物件欄** `murks: { [id]: { hits: [rubricIndex…], grade } }`（`defaultSave` 給 `{}`；`normalize()` 逐鍵驗 `hits` 為整數陣列去重、`grade` 為合法評價或 null；純加法；`reset()` 自然清除）。**不用 `bestGrades`**（那是 142 關的分子，會污染已通關數／稱號／統計）。
- `progression.js`：`recordMurk(id, evaluation)` → `hits` 取聯集（永不清零）、達標時寫 `grade`（只升不降）、XP 只補差額（`murks.json.xp`）、`newlyCollected` 沿用 teaches；`murkCount()`／`murkHits(id)`。**不影響 `refreshUnlocks()`**（WORLD.md:723-730）、不改 `expected-counts` 既有契約值。
- `main.js` 的 `onResult`：`challenge.kind === 'murk'` 分支 → `world.murks.calm(id, grade)`＋既有慶祝；不呼叫 `world.markers.find`。

### 4.5 圖鑑 `src/ui/codex.js`
- `worldFinds()` 加第四列「安撫的濁靈 n/8」；展開條目：`taint`（弱）→ 玩家最佳評價＋`sample`（強）＋ `teaches` 技巧連結 ＋ `source` 官方出處（護欄 2）。

### 4.6 音訊 `src/audio/audio.js`
- 新增 `SFX` 合成列：`murkStir`（短噪音、低頻）、`murkHit`（三層音高由累積分數決定）、`murkCalm`（暖和弦）；先合成、之後再補 m4a（檔案缺席自動退回合成，護欄 3）。`murkStir` 用 `throttle`。

### 4.7 HUD／文案
- 互動提示與 toast 文案為新中文字串 → **必跑 `npm run fonts`**。

## 5. 硬規則對照

| 規則 | 本 spec 怎麼守 |
|---|---|
| WORLD §3.5 不扣分、不失敗、不前進 | 沒過只剩殼在、可再寫；無 HP、無掉落、無傳送、無倒退 |
| `E` 唯一互動鍵 | 濁靈走 E；無新鍵 |
| 沒有會走動的 NPC | 濁靈原位；跟隨光靈是過關後 8 秒的演出、不可互動、不擋路、之後回原位 |
| 光源 ≤56（現 37） | 新增 0 光源，全 emissive |
| 碰撞體 ≤1,400（現 957） | +8（`solidRadius 0.9`，`keepSolid` 不設） |
| 三角形 ≤420k（現 194k） | +<5k |
| 零每幀配置、距離分帶 | 照 reactive.js 樣板 |
| 內容正確附出處 | `authored:"game"`；rubric 只引用既有 checks；source 必在 anchors |
| 存檔純加法、reset 乾淨 | `murksCalmed` 走 normalize；bestGrades 複用 |
| 不倒退 | 不改既有 142 關與 flows；e2e 舊斷言全保留 |

## 6. 測試計畫

- **`npm run test:rubric`** 新增：`murks.json` 結構與 `authored:"game"`；每個 `check` 存在於 checks.js；`source` 在 anchors；座標淨空規則；在 node 蓋世界後 solids 數含 8 隻且總數 <1,400；`murk:` 名字路徑通過 `collision-audit`（半透明殼自動免除，底座被涵蓋）；`save.normalize` 對舊檔補 `murksCalmed: []`；`reset` 後為空。
- **`npm run test:playtest`** 新增：每隻 `sample` ≥ A；`taint` 本身送進去必不過（弱起手必不過；**不**斷言其命中數為 0——部分命中是允許的）。
- **`npm run test:e2e`** 新增（鏡像 `headless-check.mjs:1849-1866` 與 `2437-2481`）：teleport 到某隻濁靈旁 → `[data-interact]` 顯示「濁靈…安撫」→ `KeyE` → `promptConsole.isOpen` 且模式為 free、第一幕含 taint 文字 → 送 taint 原文 → 未安撫、無 XP、`murks[id].hits` 可能 >0 且殼數＝total−hits → 關掉重開殼數不重播 → 送 sample → `murks[id].grade` 有值、殼數 0、圖鑑第四列 `1/8`、「已通關數／稱號」不變；`Escape` 後光屑演出 ≤3 秒、清燈在原位；tris/lights 預算斷言沿用；console error 0。動畫時序斷言一律**輪詢式**。
- **`npm run build`**、**`npm run fonts`**（指紋測試會攔）。
- 手動：走一遍 8 隻，確認提示、演出、音效、圖鑑；WORLD.md 維護檢查表逐條過。

## 7. 完成定義（DoD）

- [ ] 8 隻濁靈可見、可互動、可安撫、可重玩、進圖鑑；已命中的檢查跨次累積。
- [ ] 濁靈的存在不改變任何既有關卡／互動的行為（e2e 舊斷言零改動）。
- [ ] rubric／playtest／build／e2e 全綠、console error 0；`npm run fonts` 已跑。
- [ ] `WORLD.md` §3.2 加第 ⑥ 層、§4 加濁靈擺放規則、維護檢查表更新；`docs/history/CHANGELOG.md` 加一行；README 數字（若對外提及）同步。
- [ ] 存檔升級相容（舊檔載入不壞、reset 乾淨）。

## 8. 工程量與分工

估 **M–L**，**拆成 roadmap P01（實體＋仲裁）→ P02（進程＋存檔＋圖鑑）→ P03（回呼＋演出＋SFX）→ P04（文案＋WORLD.md）四次執行**，每次一個 subagent。禁區：`curriculum.json`、`challenges.json`、`flows.json`、`vite.config.js`、使用者的 dev server（5175）、`CLAUDE.md`（changelog 由 orchestrator 補）。

## 9. 待站長決定（開工前）

1. **名字與外觀**：暫名「濁靈（Murk）」＋「濁言」；外觀走「該區顏色被弄髒的一團霧＋一顆眼光」。OK 或想要更「哥布林」一點的剪影？
2. **數量與分佈**：v1 8 隻／前四區；還是全 12 區各 1？
3. **XP**：24（介於刻文與石座之間）。
4. ~~跟隨 8 秒的光靈~~ → 已改為「光屑繞一圈回清燈位」（無實體跟隨），不需決定。

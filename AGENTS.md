# AGENTS.md — Promptasy 工程 Harness

> 給任何 AI 代理（Codex / Claude Code / 其他）的工作流程。北極星與護欄在 `CLAUDE.md`，
> 世界觀與互動文法在 `WORLD.md` —— **先讀那兩份，再動手**。本檔只講「怎麼做事」。

## 專案一句話

Promptasy（前名 PromptArcade）：在瀏覽器裡「邊玩邊學 prompt engineering」的 three.js 探索遊戲。
離線評分、130 條技能全附官方出處、142 個關卡（130 教學＋12 應用）、12 個區域、11 種題型。
純靜態、無後端、localStorage 存檔。v1.1 已上線 garyhsieh.com/promptasy。

## 每個 Phase 的節奏

1. **讀北極星**：`CLAUDE.md`（護欄）＋ `docs/history/CHANGELOG.md`（最後幾條）與 `WORLD.md`（互動文法、擺放規則、效能與碰撞硬規則、29 項維護清單）。
2. **實作**：一個 phase 一個明確目標，端到端做完。動到玩家看得到的中文字串 → **一定要重跑 `npm run fonts`**（語料指紋測試不過就是在提醒你）。
3. **驗證**（見下方測試策略）。
4. **收尾**：在 `docs/history/CHANGELOG.md` 加一行（繁體中文：做了什麼＋下一步建議）→ commit ＋ push。
5. **絕不碰**：使用者的 dev server（port 5175）與 `vite.config.js`；自己開的測試伺服器用別的 port、結束時清乾淨（含整個 process group，不留孤兒 Chrome）。

## 測試金字塔（由快到慢）

| 指令 | 內容 | 耗時 | 什麼時候跑 |
|---|---|---|---|
| `npm run test:rubric` | 8 萬+ 斷言：評分引擎、資料完整性、出處健檢、碰撞審計、中文掃描、字型語料指紋、存檔遷移 | ~1 分 | **每次改動都跑** |
| `npm run test:playtest` | 每關「照提示一定過得了」：範例解 ≥A、快速填入必過、弱起手必不過、誤判迴歸 | ~10 秒 | 動到關卡資料 / 檢查器時 |
| `npm run build` | Vite 建置 | ~2 秒 | 每次改動都跑 |
| `npm run test:e2e` | 3,300+ 項無頭瀏覽器實玩（走路、序章、刻碑、過關、分享…） | **15–20 分鐘**（軟體渲染機器） | 大改動、動到互動流程時 |

## 測試策略（成本控制的核心）

- **先問再跑**：改動**項目不多**時（純文案、單一元件樣式、資料微調…），先詢問使用者要
  「全跑 / 只跑快的（rubric＋build）/ 不跑」，不要預設把 15–20 分鐘的 e2e 跑下去。
  使用者明說「不用跑測試」就照辦（rubric＋build 十幾秒的快檢通常仍值得，除非連這個也被排除）。
- **不重複驗證**：subagent 跑過全綠的 e2e，orchestrator 只做快速驗證（rubric ＋ build ＋ curl dev server 200）。
- **已知 flaky**：e2e 有少數「動畫時序類」斷言（拖曳、火盆亮度、風鈴擺動）在軟體渲染下偶發失敗——
  失敗清單**只有**這幾條時重跑一次即可；要根治就改成輪詢式斷言（poll until），不要用固定 sleep。
- **防空泛通過**：幾何/版面斷言先確認元素真的可量測（曾在錯誤幕次量到 0×0 而全部空過）；
  新功能的斷言先讓它失敗一次再讓它通過。

## 慣例與地雷

- **內容正確性是紅線**（CLAUDE.md 護欄 2）：`curriculum.json` 一個位元組都不能動；
  遊戲自撰的翻譯/教學放獨立 `authored: "game"` 資料層並附真實官方連結；
  官方文件過時用「時代註記」層（`src/data/dated-notes.json`）標注，不改原文。
- **中文字串 → `npm run fonts`**：CJK 子集掃描全部 `src/**` 與 `src/data/*.json` 切出來；漏跑會被指紋測試攔下。
- **鍵盤優先**（WORLD.md §3）：加任何互動前先回答「純鍵盤怎麼做」。
- **音檔後製**：BGM 統一 -20 LUFS、SFX 峰值 -6 dBFS、AAC(m4a) 進 `public/audio/`，
  授權逐檔登記 `public/LICENSE.md`（配樂標示：Gary Hsieh，由 SUNO.ai 輔助生成）；檔案缺席時合成音自動後備。
- **存檔**：`promptasy.v1.save`（自動從舊的 `promptarcade.v1.save` 遷移）；新欄位一律 additive ＋ `normalize()` 給預設值。
- **e2e 的埠**：harness 用自己的 port（5198/5199/9333…），跑完殺掉整個 process group；
  殘留的無頭 Chrome 會佔 CDP 埠讓下一輪測試接錯瀏覽器。
- **並行代理**：研究類（抓文件）可並行；**寫程式的不要並行**（會互踩檔案）；
  並行時一律指定「不要碰 CLAUDE.md」，changelog 由 orchestrator 統一補。

## 指令速查

```bash
npm run dev            # 本機開發（使用者通常已在 5175 跑著一個 —— 不要動它）
npm run build          # 靜態輸出 dist/
npm run fonts          # 重切字型子集（改過中文字串後必跑）
npm run test:rubric    # 快（~15s）— 每次都跑
npm run test:playtest  # 快（~10s）— 動到關卡時跑
npm run test:e2e       # 慢（15–20min）— 大改動才跑，先問使用者
```

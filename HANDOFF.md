# Session Handoff — 關卡總設計 v2 實作

> 交接日:2026-08-01 · 分支:`dev`(從 `main` @ `7dd120e` 切出)
> 交接對象:接手 planning / 實作的 coding agent。
> 本檔只講「現在在哪、要去哪、看哪些文件」;工作流程規範在 `AGENTS.md`(必讀)。

## 一句話現況

Promptasy(前名 PromptArcade)是已上線的 three.js prompt-engineering 學習遊戲
(https://www.garyhsieh.com/promptasy),現有 27 關/68 技巧/5 區域,全部測試綠
(rubric 16,502 斷言/playtest 226/e2e ~1,784)。**下一件大事:依照已完成的
「關卡總設計 v2」把遊戲擴展成 130 技能 × 12 區域的神廟式課程。**

## 要做的方向(依優先序)

依 `docs/design/curriculum-v2.md` §8 的 11 階段路線圖(A–K)實作,起手式:

1. **Phase A・重複度手術**(🟢 純資料改動):現有 27 關 rubric 收斂成
   「1 主檢查＋≤1 基本功」,`assignsTask` 降權至 0.5 並不再列為教學目標,
   `pass` 門檻同步下修——先把「每關都在教同幾件事」的重複感殺掉。
2. **Phase B**:新題型 `fix`(改碑)與 `spot`(點碑)＋對應神廟。
3. 之後逐階段照路線圖走(每階段 = 一個區域或一種新題型)。

**Planning agent 的第一個任務**:讀完下方文件後,把 Phase A(必要時含 B)
展開成可執行的實作計畫(檔案級變更清單、測試影響面、驗收條件)。

## 必讀文件(依序)

| 文件 | 內容 | 為什麼要讀 |
|---|---|---|
| `AGENTS.md` | 工程 Harness:每個 phase 的節奏、測試金字塔與策略、慣例與地雷 | **工作方式的合約**——測試先問再跑、中文字串必重跑 `npm run fonts`、port 5175 不可碰 |
| `CLAUDE.md` | 北極星:護欄(學習優先/內容正確附出處/離線核心/存檔相容/不倒退)＋ 33 個 phase 的變更紀錄 | 護欄不可妥協;變更紀錄是全部歷史 |
| `docs/design/curriculum-v2.md` | **本次要實作的總設計**:130 技能總表、12 區域規劃、每技巧一關的教學設計(互動型式/起承轉合/rubric 概念)、27 關遷移表、59 個新檢查器規格、11 階段路線圖 | 實作的藍圖 |
| `docs/design/level-design-references.md` | 35 筆關卡設計研究、15 條設計原則(P1–P15)、14 種互動型式庫(含引擎成本) | 設計書引用的 P 編號出處 |
| `docs/prompt-engineering-master-list.md` | 292 條技巧大清單(九廠、每條含使用方式＋官方出處、可溯源附錄) | 技能內容的唯一事實來源;新關卡的教學文字與出處從這裡取 |
| `docs/promptbooks/gap-analysis.md` | 豐富度稽核:過時內容、重複度診斷、出處健檢 | §3 是 Phase A 的依據 |
| `WORLD.md` | 世界觀聖經:互動文法(E 鍵/四幕/純鍵盤硬規則)、擺放與效能碰撞硬規則、29 項維護清單 | 所有新內容都要過它的檢查清單 |

## 關鍵技術座標

- 關卡資料:`src/data/challenges.json`(27 關)＋ `src/data/flows.json`(刻印流程,`kind: choice|order|workshop`)
- 評分引擎:`src/challenges/checks.js`(22 檢查器)＋ `rubric.js`(S≥0.95/A≥0.78/B≥0.60,pass=權重 50%)
- 課程資料:`src/data/curriculum.json`(68 技巧,**位元組不可動**;遊戲自撰內容一律走 `authored:"game"` 資料層)
- 互動 UI:`src/prompt/console.js`(四幕)/`stele.js`(選擇刻印)/`order.js`(排序)/`workshop.js`(派工)
- 測試:`npm run test:rubric`(~15s,必跑)/`test:playtest`(~10s)/`test:e2e`(15–20min,大改動才跑,先問)
- 已知 e2e flaky:動畫時序類(拖曳對/火盆/風鈴),清單見 AGENTS.md;根治方向是改輪詢式斷言

## 邊界條件(planning 時要納入)

- 護欄 2:每條教學內容必附真實官方出處;大清單有 3 條「找不到」(403/404 頁),不可拿二手摘要冒充
- 護欄 7 不倒退:27 關遷移採 保留 4/改造 21/轉應用關 2,零刪除
- 行動裝置尚未支援(觸控/≤720px)——新題型會加重這筆債,設計書已標注
- 59 個新檢查器是最大隱藏成本,逐階段開發,規格在 curriculum-v2.md §7.4
- 部署:main 分支經 garyhsieh.com 站(submodule)上線;**本 repo 的 dev 分支開發、驗證綠了才進 main**

## 交接時的 git 狀態

- `main` = `7dd120e`(關卡總設計 v2 文件)已部署上線
- `dev` = 從 `7dd120e` 切出,本檔是 dev 的第一個 commit
- GitHub:https://github.com/romanticamaj/promptasy(public)

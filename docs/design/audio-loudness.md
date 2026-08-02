# 音訊響度校準表（issue #3）

> 2026-08-03。逐檔量測 → 逐檔 gain。這一份是 `src/audio/audio.js` 裡那些數字的來源與算式，
> 換一批素材時照這份重跑一次就好。

## 規則

**音檔本身一律不做響度處理。** 交來什麼就編碼什麼（轉檔指令裡沒有任何 volume filter），
統一發生在**播放時**的 Web Audio gain。理由有三個：

1. 換素材只要重新量一次、改一個數字，不必重新編碼、不必動任何邏輯。
2. 原始檔的動態範圍不會被烘死，之後要重新平衡隨時可以。
3. 量測值與倍率都留在程式碼裡 → 測試可以逐檔把公式再算一次（`npm run test:rubric`）。

目標：

| 匯流排 | 目標 | 為什麼 |
|---|---|---|
| 配樂床 music bus | **−20 LUFS** | 這是 v1 六首已經烘好的位置，整個世界的音量感就是照它長出來的 |
| 音效 sfx bus | **−19 LUFS** | 只比床高 1 LU。站長的原話是「整體音量差不多，音效跳出來一點點即可」 |

**為什麼只高 1 LU（而不是更多）**：十二區的配樂全部沒有 attack transient（pad／弓奏／swell），
音效是全場唯一的瞬態來源 —— 它本來就會自己跳出來。音效設計者在交付清單裡寫得很直白：
「寧可太小聲不要太大聲」。所以每一個要取捨的地方都往**安靜**那一邊靠。

算式：

```
配樂  gain = 10 ^ ((−20 − lufs) / 20)
音效  gain = 10 ^ (((−19 + trim) − lufs) / 20)          並且  peak + 20log10(gain) ≤ −3 dBFS
```

`trim` 是這一聲**刻意**比「頭條事件」低幾 dB（美術決定，不是量測結果，所以跟量測值分開存）。
頭條事件 = 試煉那一記鑼（`trialPass`，trim = 0）。
v2 的 trim 取自音效交付清單的 `recommended_gain_db`，以那記鑼的 −4 為 0 重新對齊
（`trim = recommended + 4`）；v1 的 trim 是從**已經上線的混音**反推出來的 ——
也就是說**相對平衡完全保留**，v1 那一批只是跟著整個系統一起低了 1 dB
（−18 → −19 的那一步；逐檔的相對關係一個 dB 都沒有變）。

## 量測方法

```bash
# integrated LUFS + true peak（遊戲真的會播的那一份 m4a，不是原始 wav）
ffmpeg -hide_banner -loglevel verbose -i public/audio/<file>.m4a \
  -filter_complex 'ebur128=peak=true:framelog=verbose' -f null -
```

轉檔（**沒有** volume filter）：

```bash
ffmpeg -i <delivery>.wav -vn -c:a aac -b:a 128k public/audio/<file>.m4a
```

> **短於 0.4 秒的檔案要先補靜音再量**：EBU 的 integrated 是用 400 ms 的區塊算的，
> 0.22–0.26 秒的素材（`sfx_click` / `sfx_forms_tap` / 兩顆鍛打）連一個完整區塊都湊不出來，
> ffmpeg 會直接回 −70.0 LUFS（那是「靜音」的地板值，不是它的響度）。
> 量這幾支時在前面接一段 `apad=pad_dur=4`：靜音區塊本來就會被絕對閘門（−70 LUFS）濾掉，
> 所以補完之後量到的仍然是**素材自己那幾個有聲音的區塊**。
>
> ```bash
> ffmpeg -hide_banner -i public/audio/<file>.m4a -af 'apad=pad_dur=4,ebur128=peak=true' -f null -
> ```
>
> 表格裡的每一個數字都可以用上面兩條指令重現（長檔補不補靜音結果一樣）。

> **為什麼不用 short-term max 當一次性音效的代理**：EBU 的 short-term 是 3 秒視窗，
> 對 0.25 秒的敲擊來說視窗裡幾乎都是靜音，量出來比實際低 9–11 dB，
> 據此算出來的 gain 會讓峰值衝到 0 dBFS 以上（實測 sim 轉鈕會需要 +18 dB → +6 dBFS）。
> 所以一次性音效用的是**它自己內容的 integrated LUFS**（ffmpeg 的 gating 只算有聲音的那幾塊），
> 再加上 −3 dBFS 的峰值天花板當保險。會頂到天花板的在資料層標了 `clamped: true`。

## 配樂（目標 −20 LUFS）

| 檔案 | 交付狀態 | I (LUFS) | true peak | gain dB | gain 線性 | 套上後的峰值 |
|---|---|---|---|---|---|---|
| `bgm_title.m4a` | v1（已烘 −20） | −20.0 | −8.3 | +0.0 | 1.0000 | −8.3 |
| `bgm_foundations.m4a` | v1（已烘 −20） | −20.1 | −8.4 | +0.1 | 1.0116 | −8.3 |
| `bgm_reasoning.m4a` | v1（已烘 −20） | −20.0 | −8.2 | +0.0 | 1.0000 | −8.2 |
| `bgm_grounding.m4a` | v1（已烘 −20） | −20.0 | −7.7 | +0.0 | 1.0000 | −7.7 |
| `bgm_orchestration.m4a` | v1（已烘 −20） | −20.0 | −6.7 | +0.0 | 1.0000 | −6.7 |
| `bgm_config.m4a` | v1（已烘 −20） | −20.0 | −7.0 | +0.0 | 1.0000 | −7.0 |
| `bgm_forms.m4a` | v2（raw） | −13.7 | −2.7 | −6.3 | 0.4842 | −9.0 |
| `bgm_toolcraft.m4a` | v2（raw） | −16.1 | −4.9 | −3.9 | 0.6383 | −8.8 |
| `bgm_frugality.m4a` | v2（raw） | −14.9 | −2.2 | −5.1 | 0.5559 | −7.3 |
| `bgm_refinery.m4a` | v2（raw） | −15.1 | −3.7 | −4.9 | 0.5689 | −8.6 |
| `bgm_sight.m4a` | v2（raw） | −14.0 | −3.5 | −6.0 | 0.5012 | −9.5 |
| `bgm_divergence.m4a` | v2（raw） | −14.1 | −4.0 | −5.9 | 0.5070 | −9.9 |

v1 六首量出來剛好是 −20.0 / −20.1 → gain ≈ 1.0，證實它們當年就是烘在 −20 的（校準沒有動到它們）。

## 音效（目標 −19 LUFS ＋ trim）

| cue | 檔案 | I | true peak | trim | 目標 | gain dB | gain 線性 | 套上後的峰值 | 上限 |
|---|---|---|---|---|---|---|---|---|---|
| `pass` | `sfx_pass.m4a` | −19.5 | −5.8 | −2 | −21.0 | −1.5 | 0.8414 | −7.3 |  |
| `submit` | `sfx_submit.m4a` | −17.8 | −4.4 | −1.5 | −20.5 | −2.7 | 0.7328 | −7.1 |  |
| `stamp` | `sfx_select.m4a` | −18.7 | −5.7 | −6.5 | −25.5 | −6.8 | 0.4571 | −12.5 |  |
| `open` | `sfx_page.m4a` | −22.6 | −3.0 | −10.5 | −29.5 | −6.9 | 0.4519 | −9.9 |  |
| `codex` | `sfx_page.m4a` | −22.6 | −3.0 | −9 | −28.0 | −5.4 | 0.5370 | −8.4 |  |
| `unlock` | `sfx_unlock_shimmer.m4a` | −19.3 | −5.0 | −2.5 | −21.5 | −2.2 | 0.7762 | −7.2 |  |
| `unlock` / layer | `sfx_unlock_door.m4a` | −19.8 | −6.0 | −4.5 | −23.5 | −3.7 | 0.6531 | −9.7 |  |
| `gateOpen` | `sfx_unlock_door.m4a` | −19.8 | −6.0 | −2.5 | −21.5 | −1.7 | 0.8222 | −7.7 |  |
| `click` | `sfx_click.m4a` | −30.3 | −5.5 | −18.5 | −37.5 | −7.2 | 0.4365 | −12.7 |  |
| `ratchet` | `sfx_gear.m4a` | −28.4 | −6.4 | −15 | −34.0 | −5.6 | 0.5248 | −12.0 |  |
| `shrine` | `sfx_shrine.m4a` | −14.0 | −5.1 | +1 | −18.0 | −4.0 | 0.6310 | −9.1 |  |
| `finale` | `sfx_finale.m4a` | −20.0 | −6.0 | −3 | −22.0 | −2.0 | 0.7943 | −8.0 |  |
| `simLow` | `sfx_sim_low.m4a` | −35.6 | −12.1 | −12 | −31.0 | +4.6 | 1.6982 | −7.5 |  |
| `simMid` | `sfx_sim_mid.m4a` | −37.9 | −14.5 | −12 | −31.0 | +6.9 | 2.2131 | −7.6 |  |
| `simHigh` | `sfx_sim_high.m4a` | −36.2 | −13.6 | −12 | −31.0 | +5.2 | 1.8197 | −8.4 |  |
| `trialPass` | `sfx_trial_pass.m4a` | −26.2 | −11.9 | 0 | −19.0 | +7.2 | 2.2909 | −4.7 |  |
| `masterSeal` | `sfx_seal_stamp.m4a` | −32.3 | −12.2 | −4 | −23.0 | +9.2 | 2.8840 | −3.0 | **clamp** |
| `masterSeal` / layer | `sfx_seal_sparkle.m4a` | −29.7 | −5.8 | −12 | −31.0 | −1.3 | 0.8610 | −7.1 |  |
| `hardGate` | `sfx_hard_gate.m4a` | −27.5 | −8.2 | −2 | −21.0 | +5.2 | 1.8200 | −3.0 | **clamp** |
| `formsTap` | `sfx_forms_tap.m4a` | −36.0 | −11.9 | −11 | −30.0 | +6.0 | 1.9953 | −5.9 |  |
| `toolcraftStrike` | `sfx_toolcraft_strike_1.m4a` | −37.0 | −12.0 | −8 | −27.0 | +9.0 | 2.8180 | −3.0 | **clamp** |
| `toolcraftStrike` / alt | `sfx_toolcraft_strike_2.m4a` | −35.8 | −12.0 | −8 | −27.0 | +8.8 | 2.7542 | −3.2 |  |
| `toolcraftComplete` | `sfx_toolcraft_complete.m4a` | −28.6 | −10.3 | −6 | −25.0 | +3.6 | 1.5136 | −6.7 |  |
| `frugalityRemove` | `sfx_frugality_remove.m4a` | −25.0 | −11.8 | −8 | −27.0 | −2.0 | 0.7943 | −13.8 |  |
| `refineryRerun` | `sfx_refinery_rerun.m4a` | −26.1 | −12.8 | −10 | −29.0 | −2.9 | 0.7161 | −15.7 |  |
| `sightFocus` | `sfx_sight_focus.m4a` | −28.4 | −13.2 | −10 | −29.0 | −0.6 | 0.9333 | −13.8 |  |

三支頂到 −3 dBFS 天花板的（`masterSeal` 的章、`hardGate` 的閂鎖、第一顆鍛打）在資料層標了
`clamped: true` —— 誠實記帳，不是偷偷改。它們都是很短的瞬態：峰值高、能量低，
本來就沒有辦法在不削波的前提下推到目標響度。

### v1 這次改了多少

| cue | 舊的 gain（上線中的手調值） | 新的 gain（算出來的） | 差 |
|---|---|---|---|
| `pass` | 0.95 | 0.8414 | −1.05 dB |
| `submit` | 0.80 | 0.7328 | −0.76 dB |
| `stamp` | 0.50 | 0.4571 | −0.78 dB |
| `open` | 0.50 | 0.4519 | −0.88 dB |
| `codex` | 0.60 | 0.5370 | −0.96 dB |
| `unlock` | 0.85 | 0.7762 | −0.79 dB |
| `unlock` / layer | 0.72 | 0.6531 | −0.85 dB |
| `gateOpen` | 0.90 | 0.8222 | −0.79 dB |
| `click` | 0.50 | 0.4365 | −1.18 dB |
| `ratchet` | 0.60 | 0.5248 | −1.16 dB |
| `shrine` | 0.70 | 0.6310 | −0.90 dB |
| `finale` | 0.90 | 0.7943 | −1.09 dB |

逐檔落在 **−0.76 ～ −1.18 dB**（平均 −0.94 dB）—— 也就是「整個音效匯流排低 1 dB」
這一件事，加上把當年耳朵調出來的數字換成公式算出來的數字所帶來的 ±0.2 dB 微調。
**v1 內部的相對平衡沒有被動過**（trim 就是從上線中的混音反推出來的），
改變的只有整組音效相對配樂床的高度：從高 2 LU 收成高 1 LU。

## 怎麼重驗

```bash
npm run test:rubric        # 逐檔把公式再算一次（數字打錯會當場紅）
```

測試驗的是：每個檔案都記著量測值 → gain 等於公式算出來的 → 套上 gain 之後不削波 →
標了 `clamped` 的真的被天花板壓下來過且剛好貼著天花板 → 標了 `trialPass` 的 trim 是 0
（其餘全部比它低）。

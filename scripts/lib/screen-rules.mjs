/**
 * Promptasy — 中觀層（遮擋帶／母題）的擺位規則（v1.2 · P12 抽出來的共用件）
 *
 * WORLD.md §4.10 那幾條「離什麼要多遠」以前只寫在 `scripts/test-rubric.mjs` 裡，
 * 於是 `scripts/screen-fit.mjs`（搜候選座標的那支）只能抄一份 —— 兩份數字總有一天會分家，
 * 而且分家的那一天，搜出來的座標會「在工具裡合法、在測試裡紅」。
 * 所以門檻與距離函式**只有這一份**，測試與搜尋工具都 import 它。
 *
 * 這裡只放**純資料與純函式**：不蓋場景、不 import three.js。
 */

/**
 * 每一層互動物的互動半徑（公尺）。
 * 遮擋帶與母題不是互動物（沒有 `E`），所以它們守的是**淨空**而不是「互動圈不重疊」：
 * 每一個碰撞圓都要離得夠遠，讓玩家還走得進那件東西的互動半徑內
 * —— `need = 該層互動半徑 + 玩家半徑 + 這個碰撞圓自己的半徑`。
 * 石座那一格是淨空半徑 `PEDESTAL_CLEAR`（5.6），不是互動半徑。
 */
export const LAYER_INTERACT_R = Object.freeze({
  marker: 5.6,
  /*
   * v1.2 · P17：大濁靈那一格是**淨空半徑 4.0**，不是牠的互動半徑 6.0 ——
   * 與石座那一格（`PEDESTAL_CLEAR` 5.6，而不是互動半徑 6.5）同一個道理：
   * 這張表問的是「中觀層的石頭不准擋住玩家走到它旁邊」。
   * 大濁靈真正要守的是「站在牠的互動圈上按得到牠」，那一條由
   * `GREAT_MURK_WINNABLE_MIN` 逐點量（同 P16c 守夜人的結論）。
   * 4.0 ＝ 貼身那一圈 2.6 ＋ 一步 1.4：石頭停在那之外，人繞得過去也按得到。
   * 照 6.0 寫的話，兩道遮擋帶會把護欄崗與分歧之廳的落點**全部**吃掉（實測：各 0 個）。
   *
   * ⚠️ **這張表量的是淨空，不是互動圈**（P17 審查 · 第 9 條）：拿它去問
   * 「互動圈上還站得住嗎」，量到的會是 3.7 公尺的圈（大濁靈）與 5.3 公尺的圈（石座），
   * 兩者都不是那一層真正搶得到 `E` 的那一圈。要問互動圈就用 `interactRingRadius()`。
   */
  greatmurk: 4,
  murk: 5.5,
  secret: 5.5,
  watchman: 4.6,
  /*
   * v1.2 · P18：守門者。這一格**同時是**他的淨空半徑與他的互動圈
   * （不像石座與大濁靈那樣一分為二）—— 他的擺位規則要求
   * 「互動圈與每一層都不重疊」，所以沒有「圈比淨空大」的那個問題。
   */
  guardian: 3.2,
  tablet: 4.6,
  react: 4.4,
  ins: 3.8,
  letter: 3.8,
  handle: 3.2,
});

/**
 * 一個淨空目標**自己**的半徑（公尺）：目標帶了 `r` 就用它，沒帶才退回那一層的預設。
 *
 * v1.2 · P16b 補的：反應層那一格（4.4）是**六種反應物裡最大的那一個**（光菇圈），
 * 被整批套在風鈴（3.2）、靜水盤（3.2）、螢蛾（3.0）、小獸（4.2）、音石（1.75）身上 ——
 * 拿光菇圈的尺寸去量風鈴，等於 P06c 記下的那條教訓（「淨空半徑要跟著那一層自己的
 * 互動半徑走」）在同一層裡又犯了一次。現在 `reactive.js` 的 `reactiveTargets()`
 * 交出**自己**的半徑（音石列是刻意的例外：整排一個目標 4.4，理由在 `SONGSTONE_ROW_CLEAR`），
 * **這一支只負責挑**：沒有人再抄第二份數字。
 */
export const targetRadius = (t) => (Number.isFinite(t.r) ? t.r : LAYER_INTERACT_R[t.k]);

/**
 * v1.2 · P16c：守夜人的互動半徑（`src/world/watchmen.js` 的 `WATCHMAN_RADIUS`）。
 * 這裡重寫一份是為了讓**不 import three.js** 的擺位規則也用得到；
 * `test:rubric` 逐值比對兩份（分家就紅）。
 */
export const WATCHMAN_R = 4.6;

/**
 * v1.2 · P17：大濁靈的互動半徑（`src/world/murks.js` 的 `GREAT_MURK_RADIUS`）。
 * 同 `WATCHMAN_R`：這裡重寫一份是為了讓**不 import three.js** 的擺位規則也用得到，
 * `test:rubric` 逐值比對兩份（分家就紅）。
 */
export const GREAT_MURK_R = 6;

/**
 * v1.2 · P18：守門者的互動半徑（`src/world/guardian.js` 的 `GUARDIAN_RADIUS`）。
 * 同 `WATCHMAN_R`：這裡重寫一份是為了讓**不 import three.js** 的擺位規則也用得到，
 * `test:rubric` 逐值比對兩份（分家就紅）。
 */
export const GUARDIAN_R = 3.2;

/**
 * 石座的互動半徑（`src/world/world.js` 的 `nearestMarker()` 預設 `maxDistance`）。
 * `LAYER_INTERACT_R.marker` 是**淨空**半徑 `PEDESTAL_CLEAR`（5.6），不是這一個；
 * `test:rubric` 用真的呼叫 `nearestMarker()` 的方式比對兩份（分家就紅）。
 */
export const MARKER_R = 6.5;

/**
 * **一件東西真正搶得到 `E` 的那一圈**（公尺）。
 *
 * `targetRadius()` 交出來的是**淨空**半徑（「石頭不准擋住玩家走到它旁邊」），
 * 有兩層刻意比互動圈小：石座 5.6（`PEDESTAL_CLEAR`，真正的互動圈 6.5）、
 * 大濁靈 4.0（貼身那一圈 ＋ 一步，真正的互動圈 6.0）。
 * 一個欄位混兩種語意，守門的斷言就會對著**不是它在守的那一圈**發綠燈
 * （P17 審查 · 第 9 條；同 findings 的「守門的斷言要看得到它在守的東西」）——
 * 所以問「互動圈上還有站得住的位置嗎」一律走這一支。
 * @param {{k:string, r?:number}} t
 * @returns {number}
 */
export const interactRingRadius = (t) =>
  t.k === 'marker' ? MARKER_R : t.k === 'greatmurk' ? GREAT_MURK_R : targetRadius(t);

/**
 * 大濁靈離每一層要多遠（公尺）。與小濁靈同一套文法（WORLD.md §4.8），只是半徑換成 6.0：
 *   · 搶 `E` 的每一層：**互動圈不重疊** ＝ 6.0 ＋ 那一層的互動半徑
 *   · 不搶 `E` 的東西（反應物／地標／小景／祕密）：≥ `GREAT_MURK_AUTO_MIN`
 *     —— 小濁靈是 4；大濁靈的底座半徑 1.5（小濁靈 0.9），所以加上那 0.6 差額 ＝ 4.6
 *   · 中觀層的石頭：那是**碰撞圓**不是互動點，守的是「還走得進牠的互動圈」
 *     ＝ 6.0 ＋ 玩家半徑 ＋ 那顆圓的半徑（`solidProblems()` 已經用同一條式子，所以只要
 *     把大濁靈餵進 `interactionTargets()`，`screen-fit --verify` 就會替我們守著它）
 */
export const GREAT_MURK_AUTO_MIN = 4.6;
/**
 * 大濁靈離**反應物**（風鈴、音石、光菇…）至少多遠（公尺）。
 * 小濁靈那一條是 8.7（＝ 5.5 ＋ 3.2，寫在反應物自己的擺位規則裡：走過去的時候
 * 不要一次觸發兩件事）；半徑換成 6.0 就是 **9.2**。
 */
export const GREAT_MURK_REACT_MIN = 9.2;
/** 大濁靈彼此、以及與小濁靈之間（6.0 ＋ 5.5 ＝ 11.5 → 取整 12，與既有的濁靈間距同一個數字）。 */
export const GREAT_MURK_GAP = 12;
/**
 * 大濁靈離石座（公尺）。
 *
 * **不是**「互動圈不重疊」（6.5 ＋ 6.0 ＝ 12.5）—— 那是量出來擺不下的：
 * 142 座石座已經把 12 片土地填滿，照 12.5 掃過整張地圖，
 * 示範與推理（16 座）、護欄崗（6 座擠在半徑 27 的哨所）、分歧之廳（10 座）
 * **全區一個格點都沒有**。這一條與守夜人（P16c）走同一個結論：
 * 石座**永遠贏濁靈**，所以規則反過來寫成「不准站進人家的地盤」——
 * 9.0 ＝ 石座互動半徑 6.5 ＋ 大濁靈底座 1.5 ＋ 1.0 的餘裕（人站得進兩者之間）。
 * **真正要守的東西另外量**（`GREAT_MURK_WINNABLE_MIN`）。
 */
export const GREAT_MURK_MARKER_MIN = 9;
/**
 * 石座那一條的**例外表**（上限 1 條，要寫理由）—— 與小濁靈的
 * `MARKER_MIN_EXCEPTIONS`（流程與代理區那一隻退到 10）同一種東西。
 *
 * `divergence`（分歧之廳，半徑 29 的建物裡 10 座石座 ＋ 兩道石脊 ＋ 一位守夜人
 * ＋ 三件器物 ＋ 兩頁殘頁）：`node scripts/murk-fit.mjs --ceiling` 把石座那一條拿掉、
 * 其餘每一條照舊，逐點掃過平地圈，只留「搜尋器真的會收下」的點
 * （離線篩全過 ＋ 貼身 16/16 ＋ 按得到 ≥ 門檻）——
 * **那些點裡離最近那座石座最遠只到 7.57 公尺**（46 個合格點，最遠的就是現行出貨的落點）。
 * 9.0 掃下去這片土地一個落點都沒有（離線篩只剩 5 個點，而且沒有一個四周繞得過去）。
 *
 * ⚠️ **「上限」要與搜尋器問同一件事**（P17 審查 · 第 2 條）：不管其餘規則的話，
 * 整片土地離最近石座最遠是 23.52 公尺（外圈沒有石座的地方，離路網／覆蓋率／
 * 中觀層那幾條全部過不了）。P17 收尾時這裡寫的 6.18、契約檔寫的 7.43
 * 都比真的擺在那裡的那一隻（7.57）還小 —— 兩個數字都不是上限，只是量錯了範圍。
 *
 * 7.2 是往下留了 0.37 公尺餘裕的門檻（契約檔記著 7.57 這個上限，
 * `test:rubric` 逐值比對「例外 ≤ 上限」）；玩家端零倒退 —— 石座在仲裁裡本來就贏，
 * 站在石座前永遠是石座，而大濁靈那一側由「不准堵住石座周圍 5 公尺那一圈」
 * 這條**看得到石座**的硬斷言守著（`test:rubric` ③b）。
 * 其餘 11 片土地照 9.0 掃的上限：護欄崗 9.18（最緊，11 個合格點）、
 * 校驗場 9.66、示範與推理 9.51，其餘 12.43–22.39。
 */
export const GREAT_MURK_MARKER_EXCEPTIONS = Object.freeze({ divergence: 7.2 });
/**
 * **真正要守的東西**：走向大濁靈的 24 個方向裡，有幾個「找得到一個站得住、
 * 而且在那個位置上**是牠贏**的點」（沒有任何一座石座在 6.5 之內、也沒有另一隻濁靈更近）。
 * 一條射線由內到外試六格（2.8 → 5.8，全部落在牠的互動半徑 6.0 之內）。
 *
 * 為什麼是「一整條射線上找得到一點」而不是「某一圈上的那一點」：玩家不是站在一個圓上，
 * 他是**朝著牠走過去**——路上任何一個站得住又按得到的位置都算數。
 * 只量單一半徑會把「外圈被石座佔走、內圈其實可以」的方向誤判成走不到（量錯尺度的一種）。
 *
 * 與守夜人那一條（`WATCHMAN_WINNABLE_MIN`）同一種寫法、同一個理由：
 * 距離規則怎麼寫都好，玩家得走得到牠面前、按得下 `E`。門檻是量出來的。
 */
export const GREAT_MURK_WINNABLE_RADII = Object.freeze([2.8, 3.4, 4.0, 4.6, 5.2, 5.8]);
export const GREAT_MURK_WINNABLE_DIRS = 24;
export const GREAT_MURK_WINNABLE_MIN = 8;
/**
 * **沒有例外表。** 12 片土地實測 10–24（最差的是分歧之廳 10/24 —— 那座廳裡
 * 10 座石座 ＋ 兩道石脊 ＋ 一位守夜人幾乎沒有留白），門檻訂在 8：
 * 最差的那一片也還留得下兩格餘裕（同守夜人那一條的作法：門檻 ＝ 上限 − 2）。
 */
export const GREAT_MURK_WINNABLE_EXCEPTIONS = Object.freeze({});
/**
 * 大濁靈離「走出來的那條路」的區間（公尺）：遇得到，但不站在路中間。
 * 上限沿用母題那一條（`MOTIF_PATH_MAX` 26）。
 *
 * v1.2 · P17 審查 · 第 4 條：這五個數字原本住在 `scripts/murk-fit.mjs` 裡，
 * `test:rubric` 那一邊把 6／6／7／9 重打成字面值、路網那一條乾脆沒有 ——
 * 於是把大濁靈的 `at` 搬到路中間、或搬到離路 40 公尺外，`test:rubric` 照樣全綠
 * （WORLD.md §4.8 自己寫的是「門檻只有一份：`screen-rules.mjs`」）。現在只有這一份。
 */
export const GREAT_MURK_PATH_MIN = 3.5;
/**
 * 大濁靈離地標多遠（公尺）。小濁靈與守夜人對地標守的是 4
 * （§4.14：「地標旁邊要矮」管的是**高的東西**，不是一個人）；
 * 大濁靈的殼撐到 4 公尺，站在地標腳邊會把地標的剪影吃掉一角，所以按底座差額補到 6。
 * 拉到地標自己的 `clear`（13–16）會讓觀象臺與護欄崗直接歸零（量出來的）。
 */
export const GREAT_MURK_LANDMARK_MIN = 6;
/** 離小景（story vignette）—— 小濁靈是 4，大濁靈按底座差額補到 6。 */
export const GREAT_MURK_VIGNETTE_MIN = 6;
/** 離出生點（公尺，沿用小濁靈那一條）。 */
export const GREAT_MURK_SPAWN_MIN = 7;
/** 離起始祭壇（公尺，沿用小濁靈那一條）。 */
export const GREAT_MURK_SHRINE_MIN = 9;
/** 大濁靈的底座碰撞半徑（`murks.js` 的 `GREAT_BODY_RADIUS`；`test:rubric` 逐值比對）。 */
export const GREAT_MURK_BODY_R = 1.5;
/**
 * 大濁靈對「不搶 `E` 的石頭」（中觀層）的淨空半徑 —— 就是 `LAYER_INTERACT_R.greatmurk` 那一格本身。
 * 寫成 `= 4` 的話這個 4 就有兩份（而且沒有人比對），改一份不會紅。
 */
export const GREAT_MURK_CLEAR = LAYER_INTERACT_R.greatmurk;
/**
 * 加了大濁靈之後，**繞不繞得過去**：貼著身體的那一圈（半徑 2.6）16 個方向全通。
 * 2.6 要大於「底座 1.5 ＋ 玩家 0.62 ＝ 2.12」——小濁靈那一組（1.7／2.6／3.5）
 * 最裡面那一圈會落在大濁靈的身體裡，量出來永遠是紅的（量錯尺寸的經典形態）。
 * 更外圈的「走得到嗎」由 `GREAT_MURK_WINNABLE_*` 那一條量（它同時問「是不是牠贏」）。
 */
export const GREAT_MURK_RING = 2.6;
export const GREAT_MURK_RING_DIRS = 16;

/**
 * 守夜人**與比他高階的兩層**（石座、濁靈）之間守的距離（公尺）。
 *
 * 其餘每一層（石碑、刻文小語、殘頁、器物）守的是「互動圈不重疊」——
 * 守夜人在仲裁裡贏過它們，圈疊上去就等於把它們蓋掉。
 * 石座與濁靈**永遠贏守夜人**，所以規則反過來：他不准站進人家的地盤裡。
 *
 * 為什麼不是「圈不重疊」（石座要 4.6 + 6.5 = 11.1）：那是**量出來**的。
 * 142 座石座已經把 12 片土地填得很滿 —— 逐點掃過整張地圖，
 * 護欄崗（半徑 27 的哨所裡 6 座石座）與分歧之廳（半徑 29 裡 10 座）
 * **全區一個落點都沒有**（全區離每一座石座最遠只到 9.10／9.75 公尺）。
 * 8.0 ＝ 石座互動半徑 6.5 ＋ 1.5 的餘裕；照這條線掃，12 片土地每一片都擺得下
 * （最擠的護欄崗 8.14、分歧之廳 8.25），而且**真正要守的東西另外量**：
 * 加了守夜人之後，他自己的互動圈與每一座石座的互動圈上都還要有夠多方向
 * 「站得住而且是自己贏」（`test:rubric` 逐點掃 24 個方向）。
 */
export const WATCHMAN_ABOVE_MIN = Object.freeze({
  marker: 8.0,
  murk: 7.5,
  /*
   * v1.2 · P17 審查 · 第 1 條：大濁靈那一格**不是**另訂一個 8.0。
   *
   * 原本這一格沒有任何地方讀它（守夜人的擺位稽核掃 `murks.json` 的每一筆、
   * 一律套 `.murk` 7.5），而大濁靈那一側要求的是「互動圈不重疊」
   * ＝ 6.0 ＋ 4.6 ＝ **10.6**。把守夜人擺在離大濁靈 7.6 公尺處，
   * 守夜人的門會過、大濁靈的門會紅 —— 而從常數看不出哪一個才算數。
   * 所以這一格直接寫成那條式子本身：兩道門讀的是同一個數字。
   * （現行出貨最近的一對：`watch-sky-mirror` ↔ `murk-great-somewhere` 10.97。）
   */
  greatmurk: GREAT_MURK_R + WATCHMAN_R,
});
/**
 * 守夜人離「**不搶 `E` 的東西**」至少多遠：反應物、祕密、小景、**地標**。
 *
 * 4 公尺是既有的先例（濁靈的 `nearRules` 對這四種也是 4）。
 * 地標為什麼不吃它自己的 14–16 公尺留白：那條規矩（WORLD.md §2.2「高的東西旁邊要矮」）
 * 管的是**高的東西**，守夜人是一個 1.8 公尺的人，他站在地標旁邊正好證明那座地標有多高。
 * 這一條是量出來才放的：吃 `lm.clear` 的話，護欄崗（哨所半徑 27、地標留白 13）
 * 唯一一個「四周按得到他」滿分的落點會被自己的地標擋掉（實測 8.73 < 13）。
 */
export const WATCHMAN_AUTO_MIN = 4;

/**
 * **真正要守的東西**：站在守夜人的互動圈上，24 個方向裡有幾個
 * 「站得住、而且**是他贏**」（比他高階的石座 6.5／濁靈 5.5 不在那一點的範圍內）。
 *
 * 距離規則怎麼寫都好 —— 玩家得走得到他面前、按得下 `E`。這一條是量出來的門檻：
 * 十片土地都找得到 **24/24** 的落點，所以門檻訂在 22（比產生它的搜尋器嚴一格）。
 * 兩片例外，數字是逐點掃過整片土地之後的**上限**，不是妥協：
 *   · `wards`（哨所半徑 27，6 座石座）全區最好 18/24
 *   · `divergence`（廳半徑 29，10 座石座）全區最好 18/24，
 *     再吃完其餘每一條擺位規則之後只剩 11/24
 * 門檻各留兩格餘裕（16／10）。要再加例外就要先量、再寫理由。
 */
export const WATCHMAN_WINNABLE_MIN = 22;
export const WATCHMAN_WINNABLE_EXCEPTIONS = Object.freeze({ wards: 16, divergence: 10 });
/** 守夜人離「走出來的路」的區間（公尺）：遇得到，但不站在路中間。 */
export const WATCHMAN_PATH_MIN = 3;
export const WATCHMAN_PATH_MAX = 12;

/* ------------------------------------------------------------------ *
 * v1.2 · P18：守門者的擺位
 *
 * 他與守夜人是同一種東西（一個站著不動、會回答你的人），所以規則整套沿用，
 * 只有三處不同，而且三處都是**量出來**的：
 *   ① 互動半徑 3.2（守夜人 4.6）—— 護欄崗是 12 片土地裡最擠的一片，
 *      照 4.6 掃全區只剩 5 個落點，而且全部離那道門 21.5 公尺（那就不叫站在門邊）。
 *   ② 他必須**站在那道「不會關上的門」旁邊**（`GUARDIAN_LANDMARK_MAX`）——
 *      這是這一格的設計前提，所以寫成一條硬規則，不是「擺完再看看順不順眼」。
 *   ③ 他的互動圈**與每一層都不重疊**（`GUARDIAN_NO_OVERLAP_MARGIN`）——
 *      連石座那一層也是。守夜人做不到這件事（142 座石座把 12 片土地填滿了），
 *      所以他那一邊只好改守「不准站進人家的地盤」；守門者只有一位、只要擺得下一個口袋，
 *      就該守最嚴的那一條 —— 這也是他半徑比別人小卻不會被誰蓋掉的原因
 *      （WORLD.md §3.2「半徑跟著仲裁順序遞減」那條慣例，守的正是這件事）。
 * ------------------------------------------------------------------ */

/**
 * 守門者與**比他高階的那幾層**之間的距離（公尺）。
 *
 * 石座那一格與守夜人是**同一條規矩**（「不准站進人家的地盤」），所以寫成同一條式子
 * ——`MARKER_R + 1.5`（＝ 8.0，與 `WATCHMAN_ABOVE_MIN.marker` 逐值相同，`test:rubric` 比對）。
 * 濁靈與守夜人那三格是「互動圈不重疊」，一律寫成兩個半徑相加，不重打字面值
 * （P17 審查 · 第 1 條：同一件事的門檻要寫成那條式子本身）。
 */
export const GUARDIAN_ABOVE_MIN = Object.freeze({
  marker: MARKER_R + 1.5,
  murk: 5.5 + GUARDIAN_R,
  greatmurk: GREAT_MURK_R + GUARDIAN_R,
  watchman: WATCHMAN_R + GUARDIAN_R,
});
/** 離「不搶 `E` 的東西」（反應物、祕密、小景、地標）至少多遠 —— 沿用守夜人那一條的理由與數字。 */
export const GUARDIAN_AUTO_MIN = WATCHMAN_AUTO_MIN;
/**
 * 離那道「不會關上的門」最多多遠（公尺）—— **他是站在門邊的人**。
 *
 * 12 是量出來的。`node scripts/guardian-fit.mjs --region wards --why`（0.5 公尺一格）：
 * 全區**只有 6 個**合格格點，而且**6 個全部在門邊**，離門 8.6–10.0 公尺 ——
 * 也就是說門檻收到 8.5 才會開始少掉點，訂 12 是替「以後有人挪動那道門」留的餘裕，
 * 不是替現行的點留的。現行出貨的落點 (102.75, -153) 離門 10.26 公尺，
 * 是把格點收細之後找到的（它不落在 0.5 的格子上），也是**唯一**通得過重建驗的那一個
 * ——那 6 個格點全部卡在「貼身三圈繞不過去」（P18 審查 · 第 4 條：這一段的數字原本抄錯了）。
 */
export const GUARDIAN_LANDMARK_MAX = 12;
/** 他站在哪一座地標旁邊（護欄崗的地標 ＝ 那道不會關上的門）。 */
export const GUARDIAN_LANDMARK_ID = 'ajar-doors';
/**
 * **互動圈與每一層都不重疊**時，還要多留這麼寬（公尺）。
 *
 * **0 —— 而且訂不出比 0 更大的值。** 護欄崗擠到全區只剩 6 個合格落點，
 * 現行出貨最緊的一對是 `ward-gatekeeper` ↔ `watchman:watch-unclosing-door`：
 * 量到 7.83，要 7.80 —— **只剩 0.03**。任何 > 0.03 的餘裕都會讓出貨的落點當場過不了，
 * 所以這一格就是「圈不重疊」本身，不多留（P18 審查 · 第 2 條：
 * 不要在註解裡承諾一個出貨點滿足不了的餘裕）。
 *
 * 餘裕小到這種程度的補償做法照 findings 那一條：**把它印進斷言訊息裡**——
 * `test:rubric` 逐層量最緊的那一對、印出剩幾公分，`expected-counts.json`
 * 的 `overlapSlack` 逐值比對，下一個動他座標的人會先紅、而且一眼看得出為什麼。
 */
export const GUARDIAN_NO_OVERLAP_MARGIN = 0;
/**
 * 守門者離某一層至少多遠（公尺）——**搜尋器與 `test:rubric` 問的是同一支**。
 *
 * · 不搶 `E` 的（反應物／祕密）：`GUARDIAN_AUTO_MIN`，**與他的圈多大無關**（是個常數）。
 * · 石座：`GUARDIAN_ABOVE_MIN.marker` 守的是「不准站進人家的地盤」，也與圈多大無關；
 *   但「圈不重疊」那一條同時也要成立，所以取兩者大的那一個。
 * · 其餘每一層：**互動圈不重疊** ＝ 兩個互動半徑相加 ＋ 餘裕（換半徑就要跟著重算）。
 *
 * ⚠️ `--survey` 換半徑調查時**一定要重新呼叫這一支**，不要拿 `GUARDIAN_R` 那一次的
 * 輸出去做線性平移（`out - GUARDIAN_R + radius`）—— 那會把上面兩個常數也一起平移掉，
 * 憑空造出一個沒有人訂過的門檻（P18 審查 · 第 5 條）。
 *
 * @param {{k:string, r?:number}} t `interactionTargets()` 的一列
 * @param {number} [radius] 要用哪一個互動半徑量
 */
export function guardianNeedFrom(t, radius = GUARDIAN_R) {
  if (t.k === 'react' || t.k === 'secret') return GUARDIAN_AUTO_MIN;
  const overlap = radius + interactRingRadius(t) + GUARDIAN_NO_OVERLAP_MARGIN;
  return t.k === 'marker' ? Math.max(GUARDIAN_ABOVE_MIN.marker, overlap) : overlap;
}
/** 離「走出來的路」的區間（公尺）：遇得到，但不站在路中間（沿用守夜人那一條）。 */
export const GUARDIAN_PATH_MIN = WATCHMAN_PATH_MIN;
export const GUARDIAN_PATH_MAX = WATCHMAN_PATH_MAX;
/** 底座碰撞半徑（`guardian.js` 的 `GUARDIAN_BODY_RADIUS`；`test:rubric` 逐值比對）。 */
export const GUARDIAN_BODY_R = 0.55;
/** 貼身繞得過去：量哪幾圈、幾個方向（沿用守夜人那一套）。 */
export const GUARDIAN_RING_RADII = Object.freeze([1.7, 2.6, 3.5]);
export const GUARDIAN_RING_DIRS = 8;
/**
 * **真正要守的東西**：站在他的互動圈上，24 個方向裡有幾個「站得住、而且是他贏」。
 *
 * 他的圈與每一層都不重疊，所以「是他贏」這件事在幾何上本來就成立 ——
 * 這一條真正在量的是**站不站得住**（腳下是不是崩掉的區緣、有沒有石頭擋著）。
 * 現行出貨量到 **22/24**（`guardian-fit -- --verify` 印的那個「站得住」），
 * 門檻訂在 **20**：留兩格餘裕。上限那一份記在 `expected-counts.json` 的
 * `winnableCeiling`（22），`test:rubric` 逐值比對，實測掉到門檻以下就紅。
 * （另一個 24/24 是「貼身」：3 圈 × 8 個方向 —— 兩個數字不是同一件事。）
 */
export const GUARDIAN_WINNABLE_DIRS = 24;
export const GUARDIAN_WINNABLE_MIN = 20;

/** 離橋的主動線：`LANE_HALF + LANE_MARGIN`（再扣掉自己的半徑 —— 圓心在外面就夠了）。 */
export const LANE_MARGIN = 4;
/** 離閘門（公尺）。 */
export const GATE_MIN = 8;
/**
 * 母題離「走出來的那條路」的區間（公尺）：看得到、走得過去、不擋路。
 *
 * 下限 9 → **7**（v1.2 · P12，量出來的）：P11 只鋪了階梯迴廊一區，9 公尺看起來夠寬鬆；
 * 鋪到另外三片土地時 `scripts/screen-fit.mjs` 掃出來的事實是 ——
 * 一片土地的自由落點（扣掉所有互動圈、主動線、閘門、地標留白、崩落邊緣之後）
 * **幾乎全部落在離路 4–12 公尺**（沉書檔案庫 315 個自由點裡只有 3 個 ≥9 公尺、
 * 齒輪工坊 175 個裡只有 2 個、面具劇場 451 個裡只有 3 個）——
 * 9 公尺那條線會把「一片土地放 3–4 座」直接變成不可能。
 * 7 公尺仍然遠得下人：母題的碰撞半徑 ≈1.4 ＋ 玩家 0.62 ＝ 2.0，路邊還留得下 5 公尺。
 */
export const MOTIF_PATH_MIN = 7;
export const MOTIF_PATH_MAX = 26;
/** 母題彼此至少隔多遠（公尺）—— 重複才叫母題，擠在一起就是一堆雜物。 */
export const MOTIF_GAP = 16;
/**
 * **高台離母題**至少隔多遠（公尺，v1.2 · P15）。
 *
 * 母題彼此的 16 是「重複才叫母題」的規矩 —— 那條規矩管的是**同一種形狀**。
 * 高台與母題是兩種不同的東西（一個是「這裡是哪」，一個是「這個站得上去」），
 * 擠在一起不會糊成一團，只會擋路 —— 所以守的是**走得過去**：
 * 母題的碰撞半徑 ≈1.4 ＋ 高台 1.6 ＋ 兩倍玩家半徑 ＝ 4.2，12 公尺留得下 7.8 公尺的空地。
 *
 * 這個數字是**量出來**才改的（同 P12 把 `MOTIF_PATH_MIN` 9 → 7 的作法）：
 * v1.2 · P15 加上「四周每個方向都跳得上去」之後，12 片土地裡**只有中央高原**
 * 還找得到離母題 16 公尺以上的合法落點；沉書檔案庫最遠的合法點是 20.6、
 * 面具劇場是 13.9 —— 16 那條線會讓「有高台的土地」直接從四片變成一片。
 */
export const PLATFORM_MOTIF_GAP = 12;
/** 兩道遮擋帶之間要留得下的缺口（公尺）。 */
export const BAND_GAP = 8;
/**
 * 母題／高台離**遮擋帶核心矩形**至少要留這麼寬（公尺，**再加上自己的碰撞半徑**）。
 *
 * v1.2 · P16a 補的那一條：母題與高台一路只跟彼此比距離（`MOTIF_GAP`／`PLATFORM_MOTIF_GAP`），
 * 跟遮擋帶之間一條規則都沒有 —— 先擺帶、再搜高台，搜尋器會把高台放在
 * 離石脊 0.45 公尺的地方（P16a 實測），兩顆碰撞圓疊在一起、人從那一側走不過去。
 * 中心距不管用：帶是長條，中心離得遠不代表端點離得遠 → 量的是離核心矩形的距離
 * （`screens.js` 的 `bandCoreDistance()`，搜尋器／`--verify`／`test:rubric` 共用同一支）。
 *
 * 2.64 ＝ 玩家直徑 1.24 ＋ 走得順的餘裕 1.4。加上高台半徑 1.4 之後是 4.04 公尺，
 * 現行出貨最擠的那一對（`reasoning-second-spine` ↔ `reasoning-twice-01`）量到 5.37。
 */
export const BAND_CLEAR = 2.64;
/** 母題每一塊腳下的覆蓋率下限（不准踩在崩掉的區緣上）。 */
export const MOTIF_COVERAGE_MIN = 0.96;
/** 母題各塊之間的地形落差上限（公尺）—— 讀得出是同一組東西，不是一半埋在山坡裡。 */
export const MOTIF_STEP_DROP_MAX = 1.1;
/** 碰撞圓腳下的覆蓋率下限（不准掉進虛空）。 */
export const SOLID_COVERAGE_MIN = 0.9;
/** 逐塊貼地：底面離自己腳下的地最多浮這麼高（公尺）。 */
export const GROUND_HUG_MAX = 0.35;
/** 逐塊貼地：底面最多埋這麼深（公尺）—— 再深就是整塊沉進土裡。 */
export const GROUND_BURY_MAX = 2.2;
/**
 * 「四周繞得過去」量在哪一圈、要通幾個方向（v1.2 · P15 抽出來的共用件）。
 *
 * 這兩個數字以前住在兩個地方：`screen-fit`（產生座標的那一支）量半徑 5 的圈、
 * 16 個方向裡要 14 個；`test:rubric` 量「半徑 ＋ 玩家 ＋ 2」的圈、要 16 個全通。
 * P14 只有一座高台、剛好兩邊都過；P15 一鋪開就出現
 * 「工具說可行、測試說不行」——**兩份數字分家了**。現在只有這一份。
 */
export const AROUND_RING = 5;
export const AROUND_DIRS = 16;
export const AROUND_FREE_MIN = 14;

/**
 * 中觀層每一片土地的碰撞體上限（v1.2 · P12：12 區鋪完要離 1,400 的硬上限夠遠）。
 * **20 → 22（v1.2 · P15）**：每片土地多了兩座高台、一座一顆圓。
 * 面具劇場是現在最擠的一片：2 道帶（8）＋ 4 座母題（8）＋ 1 座高台（1）＝ 17。
 */
export const SOLIDS_PER_REGION_MAX = 22;

/**
 * 把所有「有互動圈、不准被擋住」的東西列成一張表。
 * @param {object} data `{ challenges, inscriptions, letters, handles, reactiveSpots, murks, tablets, secrets }`
 * @returns {Array<{k:string, id:string, at:number[]}>}
 */
export function interactionTargets(data) {
  const out = [];
  for (const c of data.challenges || []) if (c.position) out.push({ k: 'marker', id: c.id, at: c.position });
  for (const i of data.inscriptions || []) out.push({ k: 'ins', id: i.id, at: i.at });
  for (const l of data.letters || []) out.push({ k: 'letter', id: l.id, at: l.at });
  for (const h of data.handles || []) out.push({ k: 'handle', id: h.id, at: h.at });
  // 反應物由 `reactive.js` 的 `reactiveTargets()` 各自帶好自己的 `r`（見 `targetRadius`）
  for (const s of data.reactiveSpots || []) out.push({ k: 'react', id: s.id, at: s.at, r: s.r });
  // v1.2 · P17：大濁靈（互動半徑 6.0）與小濁靈（5.5）是同一層的兩個尺寸，各自帶自己的那一格
  for (const m of data.murks || []) out.push({ k: m && m.kind === 'great' ? 'greatmurk' : 'murk', id: m.id, at: m.at });
  // v1.2 · P16c：守夜人（互動半徑 4.6，與石碑同一階）
  for (const w of data.watchmen || []) out.push({ k: 'watchman', id: w.id, at: w.at });
  /*
   * v1.2 · P18：守門者（互動半徑 3.2）。**一定要餵進來**：
   * 沒有這一列，中觀層、大濁靈、下一格要擺的東西都會照一個少了他的世界去算
   * （P17 交接記下的那條教訓）。
   */
  for (const g of data.guardians || []) out.push({ k: 'guardian', id: g.id, at: g.at });
  for (const t of data.tablets || []) out.push({ k: 'tablet', id: t.id, at: t.at });
  /*
   * v1.2 · P15：`tell: "high"` 的祕密**不進這張表**。
   * 這張表守的是「走過去的時候不要兩件事同時觸發、也不要被石頭擋住」——
   * 高處的祕密躺在高台的頂面上，走路的人根本碰不到它（`SECRET_HIGH_REACH`），
   * 而它腳下那一塊地的淨空由那座高台自己守（高台走的是同一份門檻）。
   * 留在表裡的話，高台會與自己頂上的東西互相排斥，永遠擺不出來。
   */
  for (const s of data.secrets || []) if (s.tell !== 'high') out.push({ k: 'secret', id: s.id, at: s.at });
  return out;
}

const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

/** 離最近一條橋的主動線多遠（公尺）。 */
export function laneDistance(World, x, z) {
  let best = Infinity;
  for (const l of World.BRIDGE_LANES) {
    const d = segDist(x, z, l.ax, l.az, l.bx, l.bz);
    if (d < best) best = d;
  }
  return best;
}

/** 離最近一道閘門多遠（公尺）。 */
export function gateDistance(World, x, z) {
  let best = Infinity;
  for (const c of [...World.CORRIDORS, ...World.ANNEX_LINKS]) {
    const d = Math.hypot(x - c.gate.x, z - c.gate.z);
    if (d < best) best = d;
  }
  return best;
}

/** 離「走出來的路網」（`buildPathNetwork()` 的線段）多遠（公尺）。 */
export function pathDistance(segs, x, z) {
  let best = Infinity;
  for (const s of segs) {
    const d = segDist(x, z, s[0], s[1], s[2], s[3]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * 一個中觀層的碰撞圓有沒有踩到別人（回問題清單，空陣列＝過）。
 * 測試逐條 `ok()`、搜尋工具拿它當篩子 —— **同一份門檻**。
 *
 * @param {object} World  `src/world/world.js`
 * @param {{x:number,z:number,r:number}} sd 碰撞圓
 * @param {string} regionId 這一層屬於哪一片土地
 * @param {Array} targets `interactionTargets()` 的結果
 * @param {Array} landmarks `props.js` 的 `LANDMARKS`
 * @returns {string[]}
 */
export function solidProblems(World, sd, regionId, targets, landmarks) {
  const problems = [];
  for (const t of targets) {
    const need = targetRadius(t) + World.PLAYER_RADIUS + sd.r;
    const d = Math.hypot(sd.x - t.at[0], sd.z - t.at[1]);
    if (d < need) problems.push(`太靠近 ${t.k}:${t.id}（${d.toFixed(2)} < ${need.toFixed(2)}）`);
  }
  for (const lm of landmarks) {
    const d = Math.hypot(sd.x - lm.at[0], sd.z - lm.at[1]);
    if (d < lm.clear) problems.push(`踩進地標 ${lm.id} 的留白（${d.toFixed(2)} < ${lm.clear}）`);
  }
  const lane = laneDistance(World, sd.x, sd.z);
  if (lane < World.LANE_HALF + LANE_MARGIN - sd.r) problems.push(`離主動線太近（${lane.toFixed(2)}）`);
  const gate = gateDistance(World, sd.x, sd.z);
  if (gate < GATE_MIN) problems.push(`離閘門太近（${gate.toFixed(2)}）`);
  const here = World.regionAt(sd.x, sd.z);
  if (!here || here.id !== regionId || here.onBridge) problems.push(`不在 ${regionId} 上（${JSON.stringify(here)}）`);
  const cov = World.coverage(sd.x, sd.z);
  if (cov <= SOLID_COVERAGE_MIN) problems.push(`掉進虛空（coverage ${cov.toFixed(2)}）`);
  return problems;
}

export default {
  LAYER_INTERACT_R,
  targetRadius,
  MARKER_R,
  interactRingRadius,
  WATCHMAN_R,
  GREAT_MURK_R,
  GREAT_MURK_AUTO_MIN,
  GREAT_MURK_REACT_MIN,
  GREAT_MURK_GAP,
  GREAT_MURK_MARKER_MIN,
  GREAT_MURK_BODY_R,
  GREAT_MURK_CLEAR,
  GREAT_MURK_RING,
  GREAT_MURK_RING_DIRS,
  GREAT_MURK_WINNABLE_RADII,
  GREAT_MURK_WINNABLE_DIRS,
  GREAT_MURK_WINNABLE_MIN,
  GREAT_MURK_WINNABLE_EXCEPTIONS,
  GREAT_MURK_MARKER_EXCEPTIONS,
  GREAT_MURK_PATH_MIN,
  GREAT_MURK_LANDMARK_MIN,
  GREAT_MURK_VIGNETTE_MIN,
  GREAT_MURK_SPAWN_MIN,
  GREAT_MURK_SHRINE_MIN,
  WATCHMAN_ABOVE_MIN,
  WATCHMAN_AUTO_MIN,
  WATCHMAN_WINNABLE_MIN,
  WATCHMAN_WINNABLE_EXCEPTIONS,
  WATCHMAN_PATH_MIN,
  WATCHMAN_PATH_MAX,
  GUARDIAN_R,
  GUARDIAN_ABOVE_MIN,
  GUARDIAN_AUTO_MIN,
  GUARDIAN_LANDMARK_MAX,
  GUARDIAN_LANDMARK_ID,
  GUARDIAN_NO_OVERLAP_MARGIN,
  guardianNeedFrom,
  GUARDIAN_PATH_MIN,
  GUARDIAN_PATH_MAX,
  GUARDIAN_BODY_R,
  GUARDIAN_RING_RADII,
  GUARDIAN_RING_DIRS,
  GUARDIAN_WINNABLE_DIRS,
  GUARDIAN_WINNABLE_MIN,
  PLATFORM_MOTIF_GAP,
  AROUND_RING,
  AROUND_FREE_MIN,
  AROUND_DIRS,
  LANE_MARGIN,
  GATE_MIN,
  MOTIF_PATH_MIN,
  MOTIF_PATH_MAX,
  MOTIF_GAP,
  BAND_GAP,
  BAND_CLEAR,
  MOTIF_COVERAGE_MIN,
  MOTIF_STEP_DROP_MAX,
  SOLID_COVERAGE_MIN,
  GROUND_HUG_MAX,
  GROUND_BURY_MAX,
  SOLIDS_PER_REGION_MAX,
  interactionTargets,
  laneDistance,
  gateDistance,
  pathDistance,
  solidProblems,
};

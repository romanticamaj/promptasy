/**
 * Promptasy — 圖鑑（Codex / 搜集）
 *
 * 5 大區域 → 15 主題 → 68 條技巧。
 * 已收集：展開看說明、範例、模型差異、可點的官方出處。
 * 未收集：只留剪影（???），收集本身就是動力。
 */
import {
  bindInfoTips,
  createOverlay,
  datedNoteHtml,
  esc,
  infoTip,
  rovingList,
  safeRich,
  sourceBook,
  sourceNoteHtml,
} from './dom.js';
import { glossary } from './glossary.js';
import { clueFound, rumorBlock } from './rumors.js';
import { MANSION_TARGET, allMansionsLit, starMansions, starMapBlock } from './starmap.js';

/** 官方出處在畫面上的說法（和主控台第二幕同一句話）。 */
const SOURCE_LABEL = '神諭原典';

/** 秘境那一章的 tell 排序（與 `secrets.json` 的 `tells` 同一組鍵）。 */
const SECRET_TELL_ORDER = Object.freeze(['odd', 'sound', 'high']);

/** 評價的高低（C < B < A < S）；沒有評價 ＝ 還沒安撫。 */
const GRADE_RANK = Object.freeze({ C: 1, B: 2, A: 3, S: 4 });
const gradeAtLeast = (grade, want) => (GRADE_RANK[grade] || 0) >= GRADE_RANK[want];

/**
 * v1.2 · P17：一個濁言條目的**三層**現在各自開了沒有。
 *
 *   · `taint`  安撫過（存了評價）→ 濁言原文、正言範例、技法與官方出處
 *   · `note`   最佳評價 ≥ A → 抄寫人的眉批（遊戲自撰，不掛出處）
 *   · `origin` 最佳評價 ＝ S → 一句來歷（純風味，不掛出處）
 *
 * 抽成模組層的純函式是為了**測得到**：三層的解鎖條件是規則，不是版面。
 * @param {string|null} grade 這一隻的最佳評價（null ＝ 還沒安撫）
 * @param {object} entry      murks.json 的一筆（小濁靈沒有後兩層的資料）
 */
export function murkLayerState(grade, entry = {}) {
  const calmed = gradeAtLeast(grade, 'C');
  return {
    taint: calmed,
    note: calmed && Boolean(entry.scribeNote) && gradeAtLeast(grade, 'A'),
    origin: calmed && Boolean(entry.origin) && gradeAtLeast(grade, 'S'),
  };
}

export function createCodex({
  content,
  progression,
  onClose,
  onShare = null,
  getRank = null,
  /** Phase 22：世界裡的小收集 —— 刻文小語與藏起來的地方各有幾個。 */
  inscriptionTotal = 0,
  secretTotal = 0,
  /**
   * v1.2 · P15：「秘境」章節 —— `secrets.json` 的 entries 與那份 tell 說明。
   * 找到的收進來（標題、那幾句話、註腳）；沒找到的只留一行 **tell**：
   * 不說在哪裡，只說「世界會怎麼先告訴你」——收集的鉤子在這裡，不在座標。
   */
  secrets = [],
  secretTells = {},
  /** Phase 25：動得了的器物有幾件。 */
  handleTotal = 0,
  /** v1.2 · P02：濁靈（murks.json entries）—— 第四列「濁言與正言」與可展開的條目。 */
  murkTotal = 0,
  murks = [],
  /** v1.2 · P07：抄寫人的殘頁（letters.json entries）—— 第五列與可展開的條目。 */
  letterTotal = 0,
  letters = [],
  /**
   * v1.2 · P20a：傳聞 —— `rumors.json` 的 links ＋ 六種線索的 `ref → 名字` 索引。
   * **沒有存檔欄**：一條線畫不畫得出來完全由兩端各自找到了沒推導（見 `src/ui/rumors.js`）。
   */
  rumors = [],
  rumorIndex = null,
  /**
   * v1.2 · P20b：檔案廊的小知識（`archive.json` 的 notes）——**第四層教學**：
   * 術語小卡講「是什麼」、130 條技法講「怎麼做」、守夜人**引用**既有的那一句，
   * 這一層講「**為什麼**」。世界層走近就浮出來（不彈窗），這裡是可以回頭讀、
   * 而且**點得到官方出處**的那一份（護欄 2）。
   */
  archiveNotes = [],
}) {
  const overlay = createOverlay({
    id: 'codex',
    title: '技巧圖鑑',
    subtitle: '',
    wide: true,
    onClose: () => api.close(),
  });

  /**
   * 圖鑑頂端的稱號列：一句話講完「你現在走到哪」＋ 一顆分享鈕。
   * 稱號是遊戲自撰的世界觀稱謂（見 src/data/ranks.json），不是官方分級。
   */
  function rankBar() {
    const info = typeof getRank === 'function' ? getRank() : null;
    const lv = progression.levelInfo().level;
    const rank = info && info.rank ? info.rank : null;
    const nextLine =
      info && info.next
        ? `<p class="sharebar__next muted">下一個稱號「${esc(info.next.title)}」：需要 Lv.${
            info.next.level
          } · 收集 ${info.next.collected} 條 · 精通 ${info.next.mastered} 片土地</p>`
        : '<p class="sharebar__next muted">已是最高稱號 —— 回頭把每一關重寫成 S 吧。</p>';
    return `<div class="sharebar">
      <div class="sharebar__who">
        <p class="meta-label meta-label--star">目前稱號 · Rank</p>
        <b class="sharebar__rank">${esc(rank ? rank.title : '旅人')} <span class="muted">Lv.${lv}</span></b>
        ${nextLine}
      </div>
      ${
        onShare
          ? '<button class="btn btn--ghost" type="button" data-share-codex>分享收集成果<kbd>S</kbd></button>'
          : ''
      }
    </div>`;
  }

  /**
   * 走出來的收集：刻文小語（教一件小事）與藏起來的地方（純風味）。
   * 刻意放在徽章下面、字級很小 —— 它是「順手撿到的」，不是主線進度。
   */
  function worldFinds() {
    if (!inscriptionTotal && !secretTotal && !handleTotal && !murkTotal && !letterTotal) return '';
    const ins = progression.inscriptionCount ? progression.inscriptionCount() : 0;
    const sec = progression.secretCount ? progression.secretCount() : 0;
    const hnd = progression.handleCount ? progression.handleCount() : 0;
    // 只數 murks.json 裡真的有的那幾隻（存檔裡的孤兒 id 不算）
    const mrk = progression.murkCount ? progression.murkCount(murks.map((m) => m.id)) : 0;
    const ltr = progression.letterCount ? progression.letterCount() : 0;
    const blessed = Boolean(progression.state.flags && progression.state.flags.echoBlessing);
    const rows = [];
    if (inscriptionTotal) {
      rows.push(
        `<li><b>刻文小語</b><span>${ins} / ${inscriptionTotal}</span><i>角落刻著字的東西，走近按 E</i></li>`
      );
    }
    if (secretTotal) {
      rows.push(
        `<li><b>藏起來的地方</b><span>${sec} / ${secretTotal}</span><i>${
          sec >= secretTotal ? '全都找到了' : '不在路上，找到才算'
        }</i></li>`
      );
    }
    if (handleTotal) {
      rows.push(
        `<li><b>動過的器物</b><span>${hnd} / ${handleTotal}</span><i>${
          hnd >= handleTotal ? '這片土地上動得了的東西都被你動過了' : '罐子、火盆、響石、絞盤…走近按 E'
        }</i></li>`
      );
    }
    if (murkTotal) {
      rows.push(
        `<li><b>濁言與正言</b><span>${mrk} / ${murkTotal}</span><i>${
          mrk >= murkTotal ? '每一句寫壞的話都被你說清楚了' : '留在原地的濁靈，走近按 E 替牠把話說清楚'
        }</i></li>`
      );
    }
    if (letterTotal) {
      rows.push(
        `<li><b>抄寫人的殘頁</b><span>${ltr} / ${letterTotal}</span><i>${
          ltr >= letterTotal ? '他們留下的每一頁你都收齊了' : '掉在路邊的工單、信與筆記，走近按 E'
        }</i></li>`
      );
    }
    /*
     * v1.2 · P20b：這裡只留**計數**。濁言的那本書搬到「濁言」那一分、
     * 殘頁那一本搬到「世界觀」那一分（見 `render()` 的三分法）——
     * 一張計數表底下掛兩本書，讀的人分不出哪一本屬於哪一列。
     */
    return `<div class="finds">
      <div class="meta-rule"><h4><span class="zh">走出來的收集</span></h4></div>
      <ul class="finds__list">${rows.join('')}</ul>
      ${blessed ? '<p class="badges__hidden">✦ 回聲的祝福 —— 你找到了那座小祠。</p>' : ''}
    </div>`;
  }


  /**
   * v1.2 · P17：**鎖著的那一層只給剪影，不劇透。**
   * 講得出「這裡還有東西」與「怎麼拿到」，但一個字的內容都不露。
   */
  function lockedLayer(label, need) {
    return `<div class="murkbook__layer murkbook__layer--locked" data-murk-locked="${esc(need)}">
      <p class="murkbook__label">${esc(label)}<span class="murkbook__need">拿到 ${esc(need)} 才讀得到</span></p>
      <p class="murkbook__silhouette" aria-hidden="true">▒▒▒▒▒　▒▒▒▒▒▒▒▒　▒▒▒▒</p>
    </div>`;
  }

  /**
   * v1.2 · P02：濁言與正言 —— 第四列下面可展開的清單。
   * 安撫過的：濁言（弱）→ 你的最佳評價 → 範例（強）→ 教的技法 → 官方出處（護欄 2）。
   * 還沒安撫的：只留名字＋「還沒聽懂」（不露範例、不露出處 —— 那是自己走過去寫出來的）。
   *
   * v1.2 · P17：大濁靈的條目**分三層**——安撫開濁言、拿到 A 開抄寫人的眉批、
   * 拿到 S 開一句來歷。眉批與來歷都是遊戲自撰（`authored: "game"`）的風味文字，
   * **不掛出處**（護欄 2：只有真的教學句才附官方連結）。沒到那一層只給剪影。
   */
  function murkBook() {
    if (!murkTotal || !Array.isArray(murks) || !murks.length) return '';
    const items = murks
      .map((m) => {
        const st = progression.murkState ? progression.murkState(m.id) : null;
        const grade = st && st.grade ? st.grade : null;
        if (!grade) {
          return `<li class="murkbook__item murkbook__item--quiet" data-murk="${esc(m.id)}"${
            m.kind === 'great' ? ' data-murk-great' : ''
          }>
            <span class="murkbook__title">${esc(m.title)}</span>
            <span class="murkbook__state">還沒聽懂</span>
          </li>`;
        }
        const skill = m.primarySkillId && content.skill ? content.skill(m.primarySkillId) : null;
        const tech = !skill && m.primaryTechniqueId && content.technique ? content.technique(m.primaryTechniqueId) : null;
        const skillName = skill ? skill.nameZh : tech ? tech.title : '';
        const srcName = content.sourceName ? content.sourceName(m.source) : m.source;
        return `<li class="murkbook__item" data-murk="${esc(m.id)}"${m.kind === 'great' ? ' data-murk-great' : ''}>
          <details>
            <summary>
              <span class="murkbook__title">${esc(m.title)}</span>
              <span class="murkbook__grade grade--${esc(grade).toLowerCase()}">最佳評價 ${esc(grade)}</span>
            </summary>
            <div class="murkbook__body">
              <p class="murkbook__label">濁言</p>
              <blockquote class="murkbook__taint">${esc(m.taint)}</blockquote>
              <p class="murkbook__label">正言 · 範例</p>
              <blockquote class="murkbook__sample">${esc(m.sample)}</blockquote>
              ${skillName ? `<p class="murkbook__skill">這一句話背後的技法：<b>${esc(skillName)}</b></p>` : ''}
              <a class="src" href="${esc(m.source)}" target="_blank" rel="noopener">${esc(srcName)} · 官方出處 ↗</a>
              ${
                m.scribeNote
                  ? murkLayerState(grade, m).note
                    ? `<div class="murkbook__layer" data-murk-note><p class="murkbook__label">抄寫人的眉批</p><p class="murkbook__note">${esc(
                        m.scribeNote
                      )}</p></div>`
                    : lockedLayer('抄寫人的眉批', 'A')
                  : ''
              }
              ${
                m.origin
                  ? murkLayerState(grade, m).origin
                    ? `<div class="murkbook__layer" data-murk-origin><p class="murkbook__label">來歷</p><p class="murkbook__note">${esc(
                        m.origin
                      )}</p></div>`
                    : lockedLayer('來歷', 'S')
                  : ''
              }
            </div>
          </details>
        </li>`;
      })
      .join('');
    return `<div class="murkbook">
      <ul class="murkbook__list">${items}</ul>
    </div>`;
  }

  /**
   * v1.2 · P07：抄寫人的殘頁 —— 第五列下面可展開的清單。
   * 撿到的：那幾行字（＋有教學的那幾頁附技巧名與官方出處，護欄 2）。
   * 還沒撿到的：只留一行「還沒找到」—— 不劇透（連標題都不給）。
   */
  function letterBook() {
    if (!letterTotal || !Array.isArray(letters) || !letters.length) return '';
    const items = letters
      .map((l, i) => {
        const found = progression.hasFoundLetter ? progression.hasFoundLetter(l.id) : false;
        if (!found) {
          return `<li class="letterbook__item letterbook__item--quiet" data-letter="${esc(l.id)}">
            <span class="letterbook__title">殘頁 ${i + 1}</span>
            <span class="letterbook__state">還沒找到</span>
          </li>`;
        }
        const view = l.techniqueId && content.displayTechnique ? content.displayTechnique(l.techniqueId) : null;
        const src = l.techniqueId && content.sourceFor ? content.sourceFor(l.techniqueId) : null;
        return `<li class="letterbook__item" data-letter="${esc(l.id)}">
          <details>
            <summary>
              <span class="letterbook__title">${esc(l.title)}</span>
              <span class="letterbook__kind">${view ? '有一句教你的話' : '只是一頁字'}</span>
            </summary>
            <div class="letterbook__body">
              ${(l.lines || []).map((line) => `<p class="letterbook__line">${esc(line)}</p>`).join('')}
              ${
                view
                  ? `<p class="letterbook__skill">這一頁引的是：<b>${esc(view.title)}</b></p>${
                      l.hint ? `<p class="letterbook__how">${esc(l.hint)}</p>` : ''
                    }${
                      src
                        ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(
                            src.name
                          )} · ${SOURCE_LABEL} ↗</a>`
                        : ''
                    }`
                  : ''
              }
            </div>
          </details>
        </li>`;
      })
      .join('');
    return `<div class="letterbook">
      <ul class="letterbook__list">${items}</ul>
    </div>`;
  }

  /**
   * v1.2 · P08：四宿星圖（取代原本的廠家徽章條）。
   *
   * 世界的說法是四部原典各有一宿；星點數 ＝ 該廠已收集的技巧標記數，
   * 一宿滿 5 顆就亮起並連線，四宿全亮 ＝ 既有的隱藏成就（判定一格沒動）。
   * 星圖本體不出現任何公司名、標誌或品牌色；真名只在底下那一行做出處性使用，
   * 並且和免責句放在一起（見 src/ui/starmap.js 的檔頭）。
   */
  function badgeStrip() {
    const badges = progression.state.badges;
    const vendors = content.curriculum.vendors || [];
    const total = Object.values(badges).reduce((a, b) => a + b, 0);
    const TARGET = MANSION_TARGET; // 每廠各集滿 5 個標記 = 一宿亮起 = 隱藏成就的那一半
    const complete = allMansionsLit(starMansions({ vendors, badges, target: TARGET }));
    return `<div class="badges">
      <div class="meta-rule"><h4><span class="zh">四宿星圖</span><span class="en">Four Mansions</span></h4></div>
      <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">已收集 ${total} 個技巧標記 · 每廠集滿 ${TARGET} 個解開隱藏成就</p>
      ${starMapBlock({ vendors, badges, target: TARGET })}
      ${complete ? '<p class="badges__hidden">✦ 四宿全亮 —— 隱藏成就達成。</p>' : ''}
      ${worldFinds()}
      <p class="codex__hint">未收集的技巧只留下編號。方向鍵可以在條目之間走，<kbd>Enter</kbd> 展開。${infoTip(
        '在世界裡解開對應的關卡，那一條就會被寫進圖鑑；每一條都附得出可點的官方出處。',
        { label: '未收集的技巧是什麼意思' }
      )}</p>
    </div>`;
  }

  /* ---------------------------------------------------------------- *
   * 課程 v2 · Phase J2：印記
   *
   *   土地印記（12 枚）：通過那一片土地的試煉就入袋。
   *   大師層印記（可選、永不擋路 —— C9）：無筆之印 / 默寫之印 /
   *   一區純手 / 分歧之證。它們**不是任何東西的解鎖條件**，所以在圖鑑上
   *   只佔一小塊，安靜地放在徽章下面。
   * ---------------------------------------------------------------- */

  /** 一座神廟教的那條技能 / 技巧 → 那一關（拿來標大師層的小記號）。 */
  function shrineOf(kind, id) {
    const list = content.challenges || [];
    return list.find((c) => c.application !== true && (kind === 'skill' ? c.primarySkillId === id : c.primaryTechniqueId === id)) || null;
  }

  /** 一座神廟的大師層小記號（沒拿到就什麼都不畫）。 */
  function masterMark(kind, id) {
    const c = shrineOf(kind, id);
    if (!c || !progression.hasPenless) return '';
    const pen = progression.hasPenless(c.id);
    const scr = progression.hasScribe(c.id);
    if (!pen && !scr) return '';
    const bits = [];
    if (pen) bits.push('<span class="mseal" title="無筆之印：沒用任何輔助，一次拿到 S">✒</span>');
    if (scr) bits.push('<span class="mseal" title="默寫之印：自由書寫模式拿到 S">✍</span>');
    return `<span class="mseals">${bits.join('')}</span>`;
  }

  /** 印記那一小塊（土地印記 ＋ 大師層）。 */
  function sealStrip() {
    if (!progression.masterSeals) return '';
    const m = progression.masterSeals();
    const regions = content.groupsOrdered();
    const cells = regions
      .map((g) => {
        const got = m.seals.includes(g.id);
        const pure = m.pureRegions.includes(g.id);
        return `<li class="seal ${got ? 'is-on' : ''}${pure ? ' is-pure' : ''}" style="--c:${esc(g.color)}"
          title="${esc(g.name)}${got ? ' · 試煉已通過' : ' · 試煉還沒通過'}${pure ? ' · 一區純手' : ''}">
          <span class="seal__mark">${got ? '✦' : '·'}</span><b>${esc(g.name)}</b>
        </li>`;
      })
      .join('');
    return `<div class="seals">
      <div class="meta-rule"><h4><span class="zh">土地印記</span><span class="en">Seals</span></h4></div>
      <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">每一片土地的地標腳下都有一座試煉；通過了就把那一片的印記收進來（${m.seals.length} / ${regions.length}）。</p>
      <ul class="seals__list">${cells}</ul>
      <p class="codex__hint">大師層（完全選配，不給 XP、不解鎖任何東西）：無筆之印 ✒ ${
        m.penless.length
      } 枚 · 默寫之印 ✍ ${m.scribe.length} 枚 · 一區純手 ${m.pureRegions.length} 片 · 最少技巧達成 ⌁ ${
        (m.lean || []).length
      } 枚${m.divergenceProof ? ' · ✦ 分歧之證' : ''}</p>
      <p class="codex__hint">最少技巧達成 ⌁：用不多於這一關<b>內建範例解</b>裡最精簡那一份的技法數通過。${infoTip(
        '每一關都附一小把內建的參考解答（由這一關自己的示範解答與提示片段跑評分引擎產生，不是其他玩家的成績）。用不多於其中最精簡那一份的技法數通過，就記下一枚。它不給經驗、不影響評價，也不是任何東西的解鎖條件。',
        { label: '最少技巧達成是什麼' }
      )}</p>
    </div>`;
  }

  /* ---------------------------------------------------------------- *
   * v1.2 · P15：秘境（藏起來的地方）
   *
   * 護欄 2：這一章**一個字的教學都沒有** —— 純風味。所以它不掛技巧、不放連結、
   * 不顯示任何官方出處（`secrets.json` 連 `source` 欄位都不准有，`test:rubric` 在守）。
   * ---------------------------------------------------------------- */
  const TELL_LABEL = Object.freeze({ odd: '不對的東西', sound: '聲音先到', high: '高處' });

  function secretCard(sec, regionName) {
    const got = progression.hasFoundSecret ? progression.hasFoundSecret(sec.id) : false;
    const tell = TELL_LABEL[sec.tell] || '';
    if (!got) {
      return `<li class="tech tech--locked">
        <div class="tech__head">
          <span class="tech__id">${esc(regionName)}</span>
          <b class="tech__title">？？？</b>
          ${tell ? `<span class="tech__chips"><span class="chip" style="--c:var(--invite)">${esc(tell)}</span></span>` : ''}
        </div>
      </li>`;
    }
    return `<li class="tech">
      <details>
        <summary>
          <span class="tech__id">${esc(regionName)}</span>
          <b class="tech__title">${esc(sec.title)}</b>
          ${tell ? `<span class="tech__chips"><span class="chip" style="--c:var(--invite)">${esc(tell)}</span></span>` : ''}
        </summary>
        <div class="tech__body">
          ${(sec.lines || []).map((l) => `<p class="tech__tip">${esc(l)}</p>`).join('')}
          ${sec.note ? `<p class="tech__note">${esc(sec.note)}</p>` : ''}
        </div>
      </details>
    </li>`;
  }

  function secretChapter() {
    if (!secrets.length) return '';
    const names = new Map(content.groupsOrdered().map((g) => [g.id, g.name]));
    const found = secrets.filter((sc) => (progression.hasFoundSecret ? progression.hasFoundSecret(sc.id) : false)).length;
    const legend = SECRET_TELL_ORDER.filter((k) => secrets.some((sc) => sc.tell === k))
      .map((k) => `<b>${esc(TELL_LABEL[k])}</b>：${esc(secretTells[k] || '')}`)
      .join('<br>');
    /*
     * 版型借技巧那一疊的 `.tech`（方向鍵才走得進去、樣式也一致），
     * 但外面包一層 `.finds` —— 「這一疊不是技巧」在選擇器上就分得開
     * （e2e 數技巧條數時限定在 `.codex .tech` 裡）。
     */
    return `<div class="seals finds">
      <div class="meta-rule"><h4><span class="zh">秘境</span><span class="en">Hidden Places</span></h4></div>
      <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">走進去就算找到，不用按鍵。它們不教任何技巧 —— 只是這個世界自己的事（${found} / ${secrets.length}）。</p>
      <ul class="techs">${secrets.map((sc) => secretCard(sc, names.get(sc.region) || sc.region)).join('')}</ul>
      ${legend ? `<p class="codex__hint">${legend}</p>` : ''}
    </div>`;
  }

  /* ---------------------------------------------------------------- *
   * v1.2 · P20a：傳聞（把找到的線索接起來）
   *
   * 護欄 2：這一章與秘境同一個規格 —— **一個字的教學都沒有**，不掛技巧、
   * 不放連結、不顯示任何官方出處。它只回答一件事：「這一條與那一條講的是同一件事。」
   * ---------------------------------------------------------------- */
  function rumorChapter() {
    if (!Array.isArray(rumors) || !rumors.length) return '';
    return rumorBlock({
      links: rumors,
      index: rumorIndex,
      found: (ref) => clueFound(ref, progression),
      regionNames: new Map(content.groupsOrdered().map((g) => [g.id, g.name])),
    });
  }

  /* ---------------------------------------------------------------- *
   * v1.2 · P20b：檔案廊（小知識 · 為什麼會這樣）
   *
   * 護欄 2：這一章與技巧那一疊同一個規格 —— **每一則都附得出可點的官方出處**
   * （`archive.json` 的 `source`，網址只准來自 repo 裡已經驗證過的那一份集合）。
   * 它與另外三層分工清楚：不是術語小卡（那是「是什麼」）、不是技法（「怎麼做」）、
   * 也不是守夜人引用過的那一句 —— 這一章只回答「**為什麼會這樣**」。
   *
   * 版型借技巧那一疊的 `.tech`（方向鍵才走得進去），但**內文用自己的 class**：
   * `.tech__tip` / `.tech__ex` / `.tech__note` / `.tech__srcs` 是「整本圖鑑不准有
   * 整句英文」那條掃描與出處深連結那條斷言在看的選擇器，混進來會讓它們量到
   * 不屬於它們的東西（findings「守門的斷言要看得到它在守的東西」的反面）。
   * ---------------------------------------------------------------- */
  function archiveChapter() {
    if (!Array.isArray(archiveNotes) || !archiveNotes.length) return '';
    const names = new Map(content.groupsOrdered().map((gp) => [gp.id, gp.name]));
    /*
     * `source` 照隔壁每一章的寫法守一次。護欄 2 真正的關卡在資料那一側
     * （`test:rubric` 逐則回查那 365 個已驗證網址），這裡守的是**別的東西**：
     * 少了那個欄位的一則會在 `render()` 裡丟例外 —— 那不是少一個連結，
     * 是**整本圖鑑打不開**。
     */
    const items = archiveNotes
      .map(
        (n) => `<li class="tech">
        <details>
          <summary>
            <span class="tech__id">${esc(names.get(n.region) || n.region)}</span>
            <b class="tech__title">${esc(n.title)}</b>
          </summary>
          <div class="archive__body">
            <p class="archive__why">${esc(n.body)}</p>
            ${
              n.source && n.source.url
                ? `<p class="archive__srcs"><a class="src" href="${esc(n.source.url)}" target="_blank" rel="noopener">${esc(
                    n.source.name || n.source.url
                  )} · ${SOURCE_LABEL} ↗</a></p>`
                : ''
            }
          </div>
        </details>
      </li>`
      )
      .join('');
    return `<div class="archive">
      <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">十二片土地各一座檔案廊，走近就浮出來一則（${
        archiveNotes.length
      } 則）。它們不教做法，只講背後的機制 —— 每一則都附得出官方出處。</p>
      <ul class="techs">${items}</ul>
    </div>`;
  }

  /**
   * v1.2 · P20b：三分法的分隔條。
   * 圖鑑長到有六、七個章節之後，讀的人分不出「哪幾章是同一種東西」——
   * 三條分隔把它們收成三疊：世界觀（純風味）／濁言（你替牠說清楚的話）／
   * 小知識（為什麼會這樣）。技法那一大疊仍然自己一區，排在最後。
   */
  function division(zh, en, sub) {
    return `<div class="division">
      <div class="meta-rule meta-rule--division"><h4><span class="zh">${esc(zh)}</span><span class="en">${esc(
        en
      )}</span></h4></div>
      <p class="division__sub muted">${esc(sub)}</p>
    </div>`;
  }

  function techniqueCard(tech) {
    const got = progression.isCollected(tech.id);
    const vendors = (tech.vendors || [])
      .map((v) => {
        const meta = content.vendor(v);
        return `<span class="chip" style="--c:${esc(meta ? meta.color : '#888')}">${esc(meta ? meta.name : v)}</span>`;
      })
      .join('');

    if (!got) {
      // 未收集＝一行剪影。說明只在圖鑑頂端講一次，不在 65 條裡重複 65 遍。
      return `<li class="tech tech--locked">
        <div class="tech__head">
          <span class="tech__id">${esc(tech.id)}</span>
          <b class="tech__title">？？？</b>
        </div>
      </li>`;
    }

    /*
     * Phase 14：畫面上先給看得懂的中文（curriculum-zh.json，遊戲自撰的譯寫），
     * 官方英文原文降級成可展開的「原文 ↗」並附可點的出處 —— 換句話說，不換內容。
     * 官方出處清單永遠留在畫面上，不收進摺頁（護欄 2）。
     */
    const view = content.displayTechnique(tech) || tech;
    const origin = view.origin || {};
    const firstSrc = (view.sources || [])[0] || null;

    return `<li class="tech">
      <details>
        <summary>
          <span class="tech__id">${esc(tech.id)}</span>
          <b class="tech__title">${esc(tech.title)}</b>${masterMark('technique', tech.id)}
          <span class="tech__chips">${vendors}</span>
        </summary>
        <div class="tech__body">
          <p class="tech__tip">${esc(view.tip)}</p>
          ${view.example ? `<pre class="tech__ex">${esc(view.example)}</pre>` : ''}
          ${view.note ? `<p class="tech__note">${safeRich(view.note)}</p>` : ''}
          ${datedNoteHtml(view.dated)}
          ${
            view.translated
              ? `<details class="origin"><summary>原文 ↗（官方英文）</summary>
                  <p class="origin__note">上面那段中文是 Promptasy 自己寫的譯寫，方便閱讀；下面才是官方文件的原文。</p>
                  ${origin.tip ? `<p class="origin__body" lang="en">${esc(origin.tip)}</p>` : ''}
                  ${origin.example ? `<pre class="origin__body" lang="en">${esc(origin.example)}</pre>` : ''}
                  ${origin.note ? `<p class="origin__body" lang="en">${safeRich(origin.note)}</p>` : ''}
                  ${
                    firstSrc
                      ? `<a class="src" href="${esc(firstSrc.url)}" target="_blank" rel="noopener">${esc(
                          firstSrc.name
                        )} · 官方出處 ↗</a>`
                      : ''
                  }
                </details>`
              : ''
          }
          <ul class="tech__srcs">
            <li class="tech__srcslabel">${esc(SOURCE_LABEL)}</li>
            ${(view.sources || [])
              .map(
                (s) =>
                  `<li>${sourceBook(s, { label: SOURCE_LABEL })}${sourceNoteHtml(
                    content.sourceNote ? content.sourceNote(s.url) : null
                  )}</li>`
              )
              .join('')}
          </ul>
        </div>
      </details>
    </li>`;
  }

  /**
   * 課程 v2 · Phase E：只教 v2 技能的區域（量器坊起）在舊 68 條裡沒有主題，
   * 所以圖鑑改列這一區的技能本身。**顯示規則與舊技巧完全一樣**：
   * 未收集只留一行剪影，收集了才展開看說明 ＋ 可點的官方出處（護欄 2）。
   */
  function skillCard(skill) {
    const got = progression.isSkillCollected(skill.id);
    if (!got) {
      return `<li class="tech tech--locked">
        <div class="tech__head">
          <span class="tech__id">${esc(skill.id)}</span>
          <b class="tech__title">？？？</b>
        </div>
      </li>`;
    }
    const sources = content.catalog.sourcesForSkill(skill.id);
    return `<li class="tech">
      <details>
        <summary>
          <span class="tech__id">${esc(skill.id)}</span>
          <b class="tech__title">${esc(skill.nameZh)}</b>${masterMark('skill', skill.id)}
          <span class="tech__chips"><span class="chip" style="--c:var(--gold)">${esc(skill.tier)}</span></span>
        </summary>
        <div class="tech__body">
          <p class="tech__tip">${esc(skill.oneLiner)}</p>
          <ul class="tech__srcs">
            <li class="tech__srcslabel">${esc(SOURCE_LABEL)}</li>
            ${sources
              .map(
                (s) =>
                  `<li>${sourceBook(
                    { url: s.url, name: s.docName || s.vendor },
                    { label: SOURCE_LABEL }
                  )}${sourceNoteHtml(content.sourceNote ? content.sourceNote(s.url) : null)}</li>`
              )
              .join('')}
          </ul>
        </div>
      </details>
    </li>`;
  }

  /** 一整區的技能清單（沒有主題可以分層，所以只有一疊）。 */
  function skillSection(regionId) {
    const skills = content.regionSkills(regionId);
    if (!skills.length) return '';
    const got = skills.filter((s) => progression.isSkillCollected(s.id)).length;
    return `<section class="topic">
      <h4 class="topic__head">
        <span class="topic__num">✦</span>
        <span>這片土地上的技法</span>
        <span class="topic__count">${got}/${skills.length}</span>
      </h4>
      <p class="topic__sub">解開這一區的神廟，那一條就會被刻進來。</p>
      <ul class="techs">${skills.map(skillCard).join('')}</ul>
    </section>`;
  }

  function render() {
    const collected = progression.state.collected.length;
    const totalTech = content.catalog.counts.techniques;
    overlay.setEyebrow('技巧圖鑑 · 收集冊');
    overlay.setTitle('技巧圖鑑', `已收集 ${collected} / ${totalTech} 條技巧`);

    const groups = content
      .groupsOrdered()
      .map((g) => {
        const mastery = progression.regionMastery(g.id);
        const pct = mastery.total ? Math.round((mastery.collected / mastery.total) * 100) : 0;
        const unit = mastery.skillBased ? '條技法' : '條技巧';
        const topics = mastery.skillBased
          ? skillSection(g.id)
          : content
          .topicsOf(g.id)
          .map((topic) => {
            const techs = content.techniquesOf(topic.id);
            const got = techs.filter((t) => progression.isCollected(t.id)).length;
            return `<section class="topic">
              <h4 class="topic__head">
                <span class="topic__num">${esc(topic.num)}</span>
                <span>${esc(topic.title)}</span>
                <span class="topic__count">${got}/${techs.length}</span>
              </h4>
              <p class="topic__sub">${esc(topic.sub)}</p>
              <ul class="techs">${techs.map(techniqueCard).join('')}</ul>
            </section>`;
          })
          .join('');

        const sealed = Boolean(progression.hasSeal && progression.hasSeal(g.id));
        return `<article class="region-card${mastery.mastered ? ' is-mastered' : ''}" style="--c:${esc(g.color)}">
          ${mastery.mastered ? '<span class="region-card__seal">✦ 精通 Mastered</span>' : ''}
          ${sealed ? '<p class="region-card__trial">✦ 試煉已通過 —— 這片土地的印記在你身上。</p>' : ''}
          <header class="region-card__head">
            <div>
              <h3>${esc(g.name)} <span class="muted">${esc(g.nameEn)}</span></h3>
            </div>
            <div class="region-card__meta">
              <p class="muted">${mastery.collected} / ${mastery.total} ${unit}${
                mastery.mastered ? ' · 已全數收集' : ''
              }</p>
              <div class="meter meter--sm"><i style="width:${pct}%"></i></div>
              ${
                mastery.mastered && onShare
                  ? `<button class="btn btn--ghost region-card__share" type="button" data-share-region="${esc(
                      g.id
                    )}">分享這片土地的封印</button>`
                  : ''
              }
            </div>
          </header>
          <div class="region-card__body">${topics}</div>
        </article>`;
      })
      .join('');

    /*
     * v1.2 · P20b：三分法 —— Lore（世界觀）／Creatures（濁言）／Research（小知識）。
     * 技法那一大疊（`div.codex`）仍然排在最後，選擇器一個字沒動
     * （e2e 數技巧條數靠的就是 `#codex .codex .tech`）。
     */
    /*
     * **分隔條只有在底下真的有東西時才畫。** 五個章節的每一支在資料空的時候
     * 都回 `''`（`archiveNotes` 的預設就是 `[]`），所以無條件畫分隔條的話，
     * 少了某一份資料的呼叫端會得到一個標題＋副標、底下空空如也。
     */
    const loreHtml = `${secretChapter()}${rumorChapter()}${letterBook()}`;
    const murkHtml = murkBook();
    const archiveHtml = archiveChapter();
    overlay.body.innerHTML =
      `${rankBar()}${badgeStrip()}${sealStrip()}` +
      (loreHtml
        ? `${division('世界觀', 'Lore', '這個世界自己的事：藏起來的地方、對得上的傳聞、撿到的殘頁。')}${loreHtml}`
        : '') +
      (murkHtml ? `${division('濁言', 'Creatures', '留在原地的那些話，以及你替牠說清楚的那一句。')}${murkHtml}` : '') +
      (archiveHtml
        ? `${division('小知識', 'Research', '為什麼會這樣 —— 機制那一層，每一則都點得到官方出處。')}${archiveHtml}`
        : '') +
      `<div class="codex">${groups}</div>`;
    // 每次重繪都會換掉 ⓘ 節點，但事件是委派在 body 上，綁一次就夠
    bindInfoTips(overlay.body);
    /*
     * Phase 35：術語小卡。這裡以「一條技巧」為單位各掃一次
     * （整本圖鑑掃一次的話，130 條裡只會有一個字被畫線）。
     */
    glossary.annotateEach(overlay.body, '.tech__body');
  }

  /*
   * Phase 23：68 條技巧一條一條 Tab 過去太累 —— 方向鍵直接在條目之間跳，
   * Home / End 跳到頭尾；Tab 仍然是「離開這一疊、去下一個地方」。
   * 事件委派在 body 上，每次重繪的新條目也吃得到。
   * 選擇器刻意只挑「技巧本身」那一層的 summary —— 展開後裡面還有一個
   * 「原文 ↗」的摺頁，把它也算進來的話方向鍵會停在看不到的東西上。
   */
  rovingList(overlay.body, '.tech > details > summary');

  /** S：分享收集成果（和主控台同一個鍵，同一件事）。 */
  overlay.body.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (String(e.key).toLowerCase() !== 's') return;
    const share = overlay.body.querySelector('[data-share-codex]');
    if (!share) return;
    e.preventDefault();
    share.click();
  });

  // 分享鈕也是每次重繪就換掉的節點 → 事件委派在 body 上，綁一次就夠
  overlay.body.addEventListener('click', (e) => {
    const all = e.target.closest?.('[data-share-codex]');
    if (all) {
      onShare?.({ kind: 'codex' });
      return;
    }
    const region = e.target.closest?.('[data-share-region]');
    if (region) {
      const id = region.getAttribute('data-share-region');
      const g = content.group(id);
      onShare?.({ kind: 'mastery', headline: `${g ? g.name : id} · 精通` });
    }
  });

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    open() {
      render();
      overlay.open();
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createCodex;

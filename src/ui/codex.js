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
  sourceNoteHtml,
} from './dom.js';
import { glossary } from './glossary.js';

export function createCodex({
  content,
  progression,
  onClose,
  onShare = null,
  getRank = null,
  /** Phase 22：世界裡的小收集 —— 刻文小語與藏起來的地方各有幾個。 */
  inscriptionTotal = 0,
  secretTotal = 0,
  /** Phase 25：動得了的器物有幾件。 */
  handleTotal = 0,
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
    if (!inscriptionTotal && !secretTotal && !handleTotal) return '';
    const ins = progression.inscriptionCount ? progression.inscriptionCount() : 0;
    const sec = progression.secretCount ? progression.secretCount() : 0;
    const hnd = progression.handleCount ? progression.handleCount() : 0;
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
    return `<div class="finds">
      <div class="meta-rule"><h4><span class="zh">走出來的收集</span></h4></div>
      <ul class="finds__list">${rows.join('')}</ul>
      ${blessed ? '<p class="badges__hidden">✦ 回聲的祝福 —— 你找到了那座小祠。</p>' : ''}
    </div>`;
  }

  function badgeStrip() {
    const badges = progression.state.badges;
    const total = Object.values(badges).reduce((a, b) => a + b, 0);
    const all = (content.curriculum.vendors || [])
      .map((v) => {
        const n = badges[v.id] || 0;
        return `<li class="badge ${n > 0 ? 'is-on' : ''}" style="--c:${esc(v.color)}">
          <span class="badge__dot"></span>
          <b>${esc(v.name)}</b>
          <span class="badge__n">${n}</span>
        </li>`;
      })
      .join('');
    const TARGET = 5; // 每廠各集滿 5 個標記 = 隱藏成就
    const complete = (content.curriculum.vendors || []).every((v) => (badges[v.id] || 0) >= TARGET);
    return `<div class="badges">
      <div class="meta-rule"><h4><span class="zh">廠家徽章</span><span class="en">Vendor Marks</span></h4></div>
      <p class="muted" style="margin:0 0 var(--s4);font-size:var(--t-micro)">已收集 ${total} 個技巧標記 · 每廠集滿 ${TARGET} 個解開隱藏成就</p>
      <ul class="badges__list">${all}</ul>
      ${complete ? '<p class="badges__hidden">✦ 四廠全數集齊 —— 隱藏成就達成。</p>' : ''}
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
      } 枚 · 默寫之印 ✍ ${m.scribe.length} 枚 · 一區純手 ${m.pureRegions.length} 片${
        m.divergenceProof ? ' · ✦ 分歧之證' : ''
      }</p>
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
            ${(view.sources || [])
              .map(
                (s) =>
                  `<li><a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(
                    s.name
                  )} ↗</a>${sourceNoteHtml(content.sourceNote ? content.sourceNote(s.url) : null)}</li>`
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
            ${sources
              .map(
                (s) =>
                  `<li><a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(
                    s.docName || s.vendor
                  )} ↗</a>${sourceNoteHtml(content.sourceNote ? content.sourceNote(s.url) : null)}</li>`
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

    overlay.body.innerHTML = `${rankBar()}${badgeStrip()}${sealStrip()}<div class="codex">${groups}</div>`;
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

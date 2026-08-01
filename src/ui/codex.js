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
          <b class="tech__title">${esc(tech.title)}</b>
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
        const topics = content
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

        return `<article class="region-card${mastery.mastered ? ' is-mastered' : ''}" style="--c:${esc(g.color)}">
          ${mastery.mastered ? '<span class="region-card__seal">✦ 精通 Mastered</span>' : ''}
          <header class="region-card__head">
            <div>
              <h3>${esc(g.name)} <span class="muted">${esc(g.nameEn)}</span></h3>
            </div>
            <div class="region-card__meta">
              <p class="muted">${mastery.collected} / ${mastery.total} 條技巧${
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

    overlay.body.innerHTML = `${rankBar()}${badgeStrip()}<div class="codex">${groups}</div>`;
    // 每次重繪都會換掉 ⓘ 節點，但事件是委派在 body 上，綁一次就夠
    bindInfoTips(overlay.body);
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

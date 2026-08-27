/**
 * Promptasy — HUD：等級／XP 條、區域名、最近目標、互動提示、快捷按鈕、浮動訊息
 */
import { el, esc } from './dom.js';

export function createHud({ content, progression, getObjective = null, onOpenCodex, onOpenSettings }) {
  let currentRegion = 'foundations';
  let onBridge = false;
  const root = el('div', 'hud');
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__level">
        <div class="hud__lvbadge"><span data-level>1</span></div>
        <div class="hud__lvmeta">
          <p class="meta-label hud__lvcap">Traveller</p>
          <div class="hud__xpbar"><i data-xpfill style="width:0%"></i></div>
          <p class="hud__xptext"><span data-xptext>0 / 100 XP</span></p>
        </div>
      </div>
      <div class="hud__region">
        <div class="hud__cartouche" data-cartouche>
          <p class="hud__regionen" data-regionen>Foundations</p>
          <p class="hud__regionname" data-region>撰寫基本功</p>
        </div>
        <p class="hud__objective" data-objective></p>
      </div>
      <div class="hud__buttons">
        <button class="btn btn--ghost" data-codex type="button">圖鑑 <kbd>C</kbd></button>
        <button class="btn btn--ghost" data-settings type="button">設定 <kbd>O</kbd></button>
      </div>
    </div>
    <div class="hud__interact" data-interact hidden></div>
    <aside class="hud__aside" data-aside hidden aria-live="polite"></aside>
    <div class="hud__toasts" data-toasts role="status" aria-live="polite"></div>
    <div class="hud__banner" data-banner hidden aria-hidden="true"></div>
    <p class="hud__controls">WASD 移動 · Shift 奔跑 · ← → 轉鏡頭 · ↑ ↓ 抬頭低頭（或拖曳滑鼠）· 空白鍵看天空 · - = 拉遠拉近 · E 互動 · ? 操作一覽</p>
  `;

  const levelEl = root.querySelector('[data-level]');
  const xpFill = root.querySelector('[data-xpfill]');
  const xpText = root.querySelector('[data-xptext]');
  const regionEl = root.querySelector('[data-region]');
  const regionEnEl = root.querySelector('[data-regionen]');
  const cartoucheEl = root.querySelector('[data-cartouche]');
  const objectiveEl = root.querySelector('[data-objective]');
  const interactEl = root.querySelector('[data-interact]');
  const asideEl = root.querySelector('[data-aside]');
  const toastsEl = root.querySelector('[data-toasts]');
  const bannerEl = root.querySelector('[data-banner]');
  const levelBadge = root.querySelector('.hud__lvbadge');
  let lastXp = progression.state.xp;
  let lastLevel = progression.levelInfo().level;

  root.querySelector('[data-codex]').addEventListener('click', () => onOpenCodex?.());
  root.querySelector('[data-settings]').addEventListener('click', () => onOpenSettings?.());

  /** 短暫加上一個 class，讓 CSS 播一次動畫（重複觸發也能重播）。 */
  function flash(node, className, ms = 900) {
    if (!node) return;
    node.classList.remove(className);
    // 強制 reflow → 同一個 class 可以連續重播
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), ms);
  }

  function refresh() {
    const lv = progression.levelInfo();
    levelEl.textContent = String(lv.level);
    // XP 條的寬度由 CSS transition 補間；拿到 XP 時再閃一下
    xpFill.style.width = `${Math.round(lv.ratio * 100)}%`;
    xpText.textContent = `${lv.into} / ${lv.need} XP · 共 ${progression.state.xp}`;

    if (progression.state.xp > lastXp) flash(xpFill.parentElement, 'is-gaining', 1200);
    if (lv.level > lastLevel) flash(levelBadge, 'is-levelup', 1400);
    lastXp = progression.state.xp;
    lastLevel = lv.level;

    const group = content.group(currentRegion);
    const mastery = progression.regionMastery(currentRegion);
    // 中文名是主體、英文名是上方的小標籤（cartouche）；橋上的狀態只加註在中文名後
    regionEl.textContent = group
      ? `${group.name}${onBridge ? '（通往此區的橋上）' : ''}`
      : currentRegion;
    regionEnEl.textContent = group ? group.nameEn : '';

    const remaining = content.challengesOf(currentRegion).filter((c) => !progression.isCleared(c.id));
    /* 課程 v2 · Phase J2：這片土地的試煉過了就在區域名後面刻一枚印記（安靜，不搶戲）。 */
    const sealed = Boolean(progression.hasSeal && progression.hasSeal(currentRegion));
    const mark = `${mastery.mastered ? ' · ✦ 精通' : ''}${sealed ? ' · ✦ 印記' : ''}`;
    if (remaining.length) {
      objectiveEl.textContent = `下一個目標：${remaining[0].title}（本區還有 ${remaining.length} 關）· 圖鑑 ${mastery.collected}/${mastery.total}${mark}`;
      return;
    }

    // 本區全破 → 指向下一個還有事情做的已解鎖區域
    const next = typeof getObjective === 'function' ? getObjective(currentRegion) : null;
    if (next && next.challenge) {
      const g = content.group(next.regionId);
      objectiveEl.textContent =
        next.regionId === currentRegion
          ? `下一個目標：${next.challenge.title} · 圖鑑 ${mastery.collected}/${mastery.total}${mark}`
          : `此區已全數通關${mark} · 下一站：${g ? g.name : next.regionId} — ${next.challenge.title}`;
    } else {
      objectiveEl.textContent = `此區已全數通關 · 圖鑑 ${mastery.collected}/${mastery.total}${mark}`;
    }
  }

  return {
    root,
    refresh,
    get region() {
      return currentRegion;
    },
    /** 玩家走進新區域時呼叫（同一區重複呼叫不會重畫）。 */
    setRegion(regionId, bridge = false) {
      if (!regionId || (regionId === currentRegion && bridge === onBridge)) return false;
      const changed = regionId !== currentRegion;
      currentRegion = regionId;
      onBridge = bridge;
      refresh();
      // 真的換了一片土地才播刻印的轉場，橋上的狀態切換不播
      if (changed) flash(cartoucheEl, 'is-turning', 800);
      return changed;
    },
    /**
     * v1.2 · P20b：檔案廊那一則小知識（走近浮出、走開淡掉）。
     *
     * 它**不是** `setInteract`：那一條是「按 `E` 做什麼」的提示，
     * 這一條是一張讀得到、按不到的紙片（不搶鍵、不開面板、不停世界，
     * WORLD §3.3「一次只有一件事擁有畫面」——所以它掛在畫面側邊，
     * 而且比它高階的任何一層一出現，呼叫端就會傳 null 把它收掉）。
     * @param {string|null} html
     */
    setAside(html) {
      if (!html) {
        if (asideEl.hidden) return false;
        asideEl.hidden = true;
        asideEl.innerHTML = '';
        return true;
      }
      if (!asideEl.hidden && asideEl.innerHTML === html) return false;
      asideEl.hidden = false;
      asideEl.innerHTML = html;
      return true;
    },
    setInteract(html) {
      if (!html) {
        interactEl.hidden = true;
        interactEl.innerHTML = '';
        return;
      }
      interactEl.hidden = false;
      interactEl.innerHTML = html;
    },
    /**
     * 浮動訊息。長訊息停久一點；同時最多 4 則，最舊的先退場。
     */
    toast(message, kind = 'info') {
      const node = el('div', `toast toast--${kind}`, esc(message));
      toastsEl.appendChild(node);
      while (toastsEl.children.length > 4) toastsEl.firstElementChild.remove();
      requestAnimationFrame(() => node.classList.add('is-in'));
      const hold = Math.min(6400, 2600 + String(message).length * 55);
      setTimeout(() => {
        node.classList.remove('is-in');
        setTimeout(() => node.remove(), 420);
      }, hold);
    },

    /**
     * 螢幕級的慶祝（S 評價 / 區域精通 / 隱藏成就）。
     * 純 CSS，不佔 3D 的效能預算。
     * @param {string} text
     * @param {'s'|'mastery'|'finale'} kind
     */
    celebrate(text, kind = 's') {
      bannerEl.hidden = false;
      bannerEl.className = `hud__banner hud__banner--${kind}`;
      bannerEl.innerHTML = `<span class="hud__banner-glow"></span><b>${esc(text)}</b>`;
      flash(bannerEl, 'is-on', 2200);
      setTimeout(() => {
        bannerEl.hidden = true;
      }, 2300);
    },
    setVisible(v) {
      root.style.display = v ? '' : 'none';
    },
  };
}

export default createHud;

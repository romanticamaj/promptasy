/**
 * Promptasy — 隱藏成就：全部技巧收集 ＋ 四宿全亮
 *
 * 這是整趟旅程的收尾畫面：不給新的東西，只把玩家做到的事情好好講一次，
 * 並留下四部原典的入口（護欄 2：內容可回溯到出處），附上免責句。
 */
import { createOverlay, esc } from './dom.js';
import { MANSION_TARGET, STARMAP_DISCLAIMER, starMapSvg, starMansions } from './starmap.js';

export function createAchievement({ content, progression, onClose, onShare = null }) {
  const overlay = createOverlay({
    id: 'achievement',
    title: '✦ 隱藏成就達成',
    subtitle: '',
    onClose: () => api.close(),
  });

  function render() {
    const info = progression.hiddenAchievement();
    overlay.setEyebrow('隱藏成就 · 旅程完成');
    overlay.setTitle('✦ 隱藏成就達成', `全 ${info.total} 條技巧收集完畢 · 四宿全亮`);

    /*
     * v1.2 · P08：四宿星圖（和圖鑑同一支純函式、同一套畫法）。
     * 這裡的星點數直接吃隱藏成就算出來的 count，所以顯示與判定不可能對不上。
     * 星圖本體不畫標誌、不用品牌色；四家的真名留在底下的官方文件清單裡
     * （出處性使用），並且和免責句放在一起。
     */
    const badges = Object.fromEntries(info.vendors.map((v) => [v.id, v.count]));
    const starSky = starMapSvg(
      starMansions({
        vendors: content.curriculum.vendors || [],
        badges,
        target: info.badgeTarget || MANSION_TARGET,
      })
    );

    // curriculum.sources 是「廠家 → 官方文件清單」，每廠取前兩條當入口（真名的出處性使用）
    const byVendor = content.curriculum.sources || {};
    const sources = (content.curriculum.vendors || [])
      .flatMap((v) =>
        (byVendor[v.id] || []).slice(0, 2).map(
          (s) =>
            `<li><span class="muted">${esc(v.name)}</span> <a class="src" href="${esc(
              s.url
            )}" target="_blank" rel="noopener">${esc(s.name || s.url)} ↗</a></li>`
        )
      )
      .join('');

    overlay.body.innerHTML = `
      <div class="finale">
        <p class="finale__lead">
          你走完了五片土地，把 ${info.total} 條 prompt 技巧一條一條寫出來、被判定通過、收進圖鑑。
          從「把話講清楚」開始，一路到示範、推理、脈絡、流程與參數 —— 這些都不是背下來的，是你實際寫過的。
        </p>
        <div class="starmap">${starSky}</div>
        <p class="finale__note">旅程沒有終點：回頭把每一關重寫成 S 評價，或直接把這些技巧用在你今天要寫的那個 prompt 上。</p>
        ${
          onShare
            ? `<div class="result__share"><button class="btn btn--ghost" type="button" data-share>分享這趟旅程</button></div>`
            : ''
        }
        <div class="meta-rule"><h4><span class="zh">官方文件</span><span class="en">Primary Sources</span></h4></div>
        <ul class="finale__srcs">${sources}</ul>
        <p class="starmap__note starmap__note--legal">${esc(STARMAP_DISCLAIMER)}</p>
      </div>
    `;
    overlay.body
      .querySelector('[data-share]')
      ?.addEventListener('click', () =>
        onShare?.({ kind: 'finale', headline: `${info.collected} / ${info.total} 全數收集` })
      );
  }

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

export default createAchievement;

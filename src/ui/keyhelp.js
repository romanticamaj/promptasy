/**
 * PromptArcade — 操作一覽（Phase 23）
 *
 * 這個世界從頭到尾都可以只用鍵盤走完：走路、轉鏡頭、拉遠拉近、走近石座、
 * 一段一段把 prompt 刻上去、把手掌按上石碑、翻圖鑑、改設定。
 * 這一頁就是那張表 —— 隨時按 `?` 叫出來，按 Esc 收起。
 *
 * 它是「旅人自己抄下來的手記」，所以用的是世界的說法（石座、石碑、刻文、幕），
 * 不出現系統術語。內容純風味 ＋ 操作說明，不教技巧、不放連結（護欄 2）。
 */
import { createOverlay, esc } from './dom.js';

/**
 * 按鍵表。第一欄是鍵帽，第二欄是「按下去會發生什麼」。
 * 匯出給測試用：鍵不重複、每一條都講得出做什麼。
 */
export const KEY_GROUPS = Object.freeze([
  {
    id: 'walk',
    title: '走路',
    rows: [
      { keys: ['W', 'A', 'S', 'D'], what: '往前後左右走' },
      { keys: ['Shift'], what: '跑起來' },
    ],
  },
  {
    id: 'camera',
    title: '鏡頭',
    rows: [
      { keys: ['←', '→'], what: '往左右轉' },
      { keys: ['↑', '↓'], what: '抬頭 / 低頭' },
      { keys: ['空白鍵'], what: '一口氣抬頭看天空' },
      { keys: ['-', '='], what: '鏡頭拉遠 / 拉近' },
    ],
  },
  {
    id: 'world',
    title: '走近東西',
    rows: [
      { keys: ['E'], what: '唯一的互動鍵：石座、石碑、角落的刻文' },
      { keys: ['C'], what: '翻開技巧圖鑑' },
      { keys: ['O'], what: '設定：音量、畫質、答題方式、重新開始' },
      { keys: ['Esc'], what: '收起最上面那一層' },
      { keys: ['?'], what: '隨時叫出這張一覽' },
    ],
  },
  {
    id: 'carve',
    title: '讀題與刻印',
    note: '走到石座按 E 之後，這些鍵就會派上用場。',
    rows: [
      { keys: ['Enter'], what: '讀完了 —— 往下一幕' },
      { keys: ['1', '2', '3'], what: '挑一段刻上石碑' },
      { keys: ['↑', '↓'], what: '在選項、石籤、圖鑑條目之間移動' },
      { keys: ['Tab'], what: '移到下一個地方（Shift 加 Tab 往回）' },
      { keys: ['Alt', '1'], what: '直接回到某一幕（Alt 加 1 到 4）' },
      { keys: ['L'], what: '翻開線索 / 神諭刻文' },
      { keys: ['H'], what: '叫出提示（自由書寫的時候）' },
      { keys: ['M'], what: '換一種答題方式' },
      { keys: ['S'], what: '分享這次的刻印' },
      { keys: ['Enter'], what: '按住不放 —— 把手掌按上石碑' },
    ],
  },
]);

export function createKeyHelp({ onClose } = {}) {
  const overlay = createOverlay({
    id: 'keyhelp',
    title: '操作一覽',
    subtitle: '不用碰滑鼠也走得完全程',
    eyebrow: '旅人的手記',
    onClose: () => api.close(),
  });
  overlay.root.classList.add('overlay--keys');

  overlay.body.innerHTML = `
    <div class="keyhelp">
      ${KEY_GROUPS.map(
        (g, gi) => `<section class="keyhelp__group reveal d${Math.min(gi + 1, 3)}">
          <div class="meta-rule"><h4><span class="zh">${esc(g.title)}</span></h4></div>
          ${g.note ? `<p class="keyhelp__note">${esc(g.note)}</p>` : ''}
          <ul class="keyhelp__list">
            ${g.rows
              .map(
                (r) => `<li class="keyhelp__row">
                  <span class="keyhelp__keys">${r.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>
                  <span class="keyhelp__what">${esc(r.what)}</span>
                </li>`
              )
              .join('')}
          </ul>
        </section>`
      ).join('')}
      <p class="keyhelp__foot">滑鼠照常好用 —— 這張表只是告訴你「不用它也行」。</p>
    </div>
  `;

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    open() {
      overlay.resetScroll();
      overlay.open();
    },
    close() {
      overlay.close();
      onClose?.();
    },
    toggle() {
      if (overlay.isOpen) api.close();
      else api.open();
      return overlay.isOpen;
    },
  };
  return api;
}

export default createKeyHelp;

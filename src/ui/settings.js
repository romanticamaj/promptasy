/**
 * Promptasy — 設定頁：音量 / 靜音 / 畫質 / 重置進度（二次確認）
 */
import { createOverlay, esc } from './dom.js';

export function createSettings({
  content,
  progression,
  audio,
  onClose,
  onReset,
  onQualityChange,
  onReplayPrologue,
  onPromptModeChange,
  onPerfMonitorChange,
  // v1.2 · P19：螢火指路（外交式導向）的開關
  onGuidesChange,
  onOpenKeyHelp,
}) {
  const overlay = createOverlay({
    id: 'settings',
    title: '設定',
    subtitle: '進度會自動存在這台裝置上，隨時可以重新開始',
    eyebrow: '設定',
    onClose: () => api.close(),
  });

  let confirming = false;

  function render() {
    const s = progression.state.settings;
    const lv = progression.levelInfo();
    overlay.body.innerHTML = `
      <div class="settings">
        <section class="settings__row">
          <label for="set-volume">音量</label>
          <input id="set-volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" />
          <output data-vol>${Math.round(s.volume * 100)}</output>
        </section>

        <section class="settings__row">
          <label for="set-mute">靜音</label>
          <input id="set-mute" type="checkbox" ${s.muted ? 'checked' : ''} />
          <span class="muted">每片土地都有自己的曲調，走過橋就會換。</span>
        </section>

        <section class="settings__row">
          <label for="set-quality">畫質</label>
          <select id="set-quality">
            <option value="high" ${s.quality === 'high' ? 'selected' : ''}>高（畫面效果全開）</option>
            <option value="low" ${s.quality === 'low' ? 'selected' : ''}>低（畫面精簡，跑得更順）</option>
          </select>
          <span class="muted">馬上生效。畫面會頓的話就切到低。</span>
        </section>

        <section class="settings__row">
          <label for="set-guides">螢火指路</label>
          <input id="set-guides" type="checkbox" data-guides ${s.guides !== false ? 'checked' : ''} />
          <span class="muted">開著的時候，路邊的螢火群會整體往「下一個建議去處」那一側飄。想自己找路就關掉它 —— 關掉之後螢火只會照原本的樣子聚散。</span>
        </section>

        <section class="settings__row">
          <label for="set-perf">效能監視器</label>
          <input id="set-perf" type="checkbox" data-perf ${s.perfMonitor ? 'checked' : ''} />
          <span class="muted">在角落顯示畫面更新速度、顯示卡型號等即時數字，想知道自己的機器跑得順不順時可以打開。也可以隨時按 <kbd>F3</kbd> 開關。</span>
        </section>

        <hr class="rule" />

        <section class="settings__row">
          <label for="set-mode">答題方式</label>
          <select id="set-mode">
            <option value="guided" ${s.promptMode !== 'free' ? 'selected' : ''}>石碑刻印（動手做，推薦）</option>
            <option value="free" ${s.promptMode === 'free' ? 'selected' : ''}>自由書寫（自己打字）</option>
          </select>
          <span class="muted">石碑刻印大多是一段一段問你「這一段要填什麼」，選對就刻上去；有幾關改成把石版排順、或到工坊挑工具填參數。自由書寫則是自己打整段 prompt。</span>
        </section>

        <section class="settings__row">
          <label for="set-keys">操作一覽</label>
          <button class="btn btn--ghost" id="set-keys" data-keys type="button">看看有哪些鍵 <kbd>?</kbd></button>
          <span class="muted">這趟旅程不用滑鼠也走得完 —— 走路、轉鏡頭、刻石碑、翻圖鑑都有對應的鍵。隨時按 <kbd>?</kbd> 就會出來。</span>
        </section>

        <section class="settings__row">
          <label for="set-prologue">引導課程</label>
          <button class="btn btn--ghost" id="set-prologue" data-prologue type="button">重看引導課程</button>
          <span class="muted">序章「喚醒神諭」：三堂實作課，每一堂都附得出官方出處，隨時可跳過。</span>
        </section>

        <hr class="rule" />

        <section class="settings__stats">
          <div class="meta-rule"><h4><span class="zh">目前進度</span><span class="en">Progress</span></h4></div>
          <ul>
            <li>等級 <b>Lv.${lv.level}</b>（${lv.into} / ${lv.need} XP）</li>
            <li>累積經驗 <b>${progression.state.xp}</b> XP</li>
            <li>已收集技巧 <b>${progression.state.collected.length}</b> / ${
              content.catalog.counts.techniques
            }</li>
            <li>已通關 <b>${Object.keys(progression.state.bestGrades).length}</b> / ${content.challenges.length}</li>
            <li>已解鎖區域 <b>${progression.state.unlockedRegions
              .map((id) => esc((content.group(id) || {}).name || id))
              .join('、')}</b></li>
            ${
              progression.skippedGateCount() > 0
                ? `<li>其中 <b>${progression.skippedGateCount()}</b> 道門是你先行前往的（門開了，關還在那裡等你）</li>`
                : ''
            }
          </ul>
        </section>

        <hr class="rule" />

        <section class="settings__danger">
          <h4><span class="zh">重置進度、重新學習</span><span class="en">Reset</span></h4>
          <p class="muted">會清空等級、圖鑑、徽章與所有關卡評價。此動作無法復原。</p>
          <button class="btn ${confirming ? 'btn--danger' : 'btn--ghost'}" data-reset type="button">
            ${confirming ? '再按一次確認：真的要清空全部進度' : '重置進度'}
          </button>
          ${confirming ? '<button class="btn btn--ghost" data-cancel type="button">取消</button>' : ''}
        </section>
      </div>
    `;

    overlay.body.querySelector('#set-volume').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      overlay.body.querySelector('[data-vol]').textContent = String(Math.round(v * 100));
      progression.updateSettings({ volume: v });
      audio?.setVolume(v);
    });

    overlay.body.querySelector('#set-mute').addEventListener('change', (e) => {
      progression.updateSettings({ muted: e.target.checked });
      audio?.setMuted(e.target.checked);
    });

    overlay.body.querySelector('#set-quality').addEventListener('change', (e) => {
      progression.updateSettings({ quality: e.target.value });
      onQualityChange?.(e.target.value);
    });

    overlay.body.querySelector('[data-guides]').addEventListener('change', (e) => {
      progression.updateSettings({ guides: e.target.checked });
      onGuidesChange?.(e.target.checked);
    });

    overlay.body.querySelector('[data-perf]').addEventListener('change', (e) => {
      progression.updateSettings({ perfMonitor: e.target.checked });
      onPerfMonitorChange?.(e.target.checked);
    });

    overlay.body.querySelector('#set-mode').addEventListener('change', (e) => {
      progression.updateSettings({ promptMode: e.target.value === 'free' ? 'free' : 'guided' });
      onPromptModeChange?.(e.target.value);
    });

    overlay.body.querySelector('[data-keys]')?.addEventListener('click', () => {
      onOpenKeyHelp?.();
    });

    overlay.body.querySelector('[data-prologue]')?.addEventListener('click', () => {
      onReplayPrologue?.();
    });

    overlay.body.querySelector('[data-reset]').addEventListener('click', () => {
      if (!confirming) {
        confirming = true;
        render();
        return;
      }
      confirming = false;
      progression.resetAll();
      onReset?.();
      render();
    });

    overlay.body.querySelector('[data-cancel]')?.addEventListener('click', () => {
      confirming = false;
      render();
    });
  }

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    open() {
      confirming = false;
      render();
      overlay.open();
    },
    /** 設定被別的地方改掉時（例如 F3 開關效能監視器）重畫一次，勾勾才不會過期。 */
    refresh() {
      if (overlay.isOpen) render();
    },
    close() {
      overlay.close();
      onClose?.();
    },
  };
  return api;
}

export default createSettings;

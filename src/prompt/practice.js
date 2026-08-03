/**
 * Promptasy — 練習台（序章引導課程的三堂課）
 *
 * Phase 13：序章不再是另一種玩法。
 *
 * 以前這裡是一張「左邊教學、右邊打字修 prompt」的桌子 —— 玩家在序章學會的
 * 互動，走進正式關卡就用不上了（正式關卡預設是石碑刻印）。現在改成
 * **和正式關卡一模一樣的四幕分鏡**，只是短一號：
 *
 *   ①委託：那句「弱」的請求擺在眼前 —— 先看見哪裡不對。
 *   ②神諭刻文：這一課只講**一個**概念（遊戲自撰的白話）＋ 它的神諭原典（可點）。
 *   ③刻印：同一支石碑（src/prompt/stele.js）—— 一段一段選，選錯不失敗，
 *           旁邊的刻痕對照跟正式關卡一樣即時亮燈。
 *   ④手印：按住手掌 → 呈給神諭 → 結果 ＋ XP ＋ 收進圖鑑。
 *
 * 兩件事沒有變（護欄）：
 *   · 評分完全走同一支離線 rubric 引擎（../challenges/rubric.js），沒有第二套邏輯
 *   · 教學內容的官方出處逐字取自 curriculum.json，畫面上永遠點得到
 *
 * 「刻對了會長什麼樣」由 prologue.json 的 flow.slots 定義，正確選項串起來
 * 必須通過該課的 rubric —— 這件事由測試強制驗證，不是靠人工目視。
 */
import { bindInfoTips, createOverlay, esc, on, safeRich, sourceBook } from '../ui/dom.js';
import { evaluate, formatScore } from '../challenges/rubric.js';
import { CHECKS } from '../challenges/checks.js';
import { createStele } from './stele.js';
import { ACTS, GUIDE_TITLE, SOURCE_LABEL, SOURCE_NOTE, actLabelText } from './console.js';

const GRADE_LABEL = { S: '完美', A: '優秀', B: '良好', C: '通過' };

/**
 * 鷹架強度 → 刻痕對照要先露出多少提示。
 * 一堂比一堂少（faded scaffolding）；石碑本身的教學回饋不受影響，永遠都在。
 */
const SCAFFOLD = {
  full: { hintsUpfront: true },
  partial: { hintsUpfront: false },
  light: { hintsUpfront: false },
};

export function createPractice({
  content,
  progression,
  onPass,
  onSubmit,
  onDone,
  onClose,
  onCarve,
  onReject,
  onSeal,
  onTap,
}) {
  let step = null;
  /** 這一課送出過幾次（重刻一次算一次）。 */
  let attempts = 0;
  let passed = false;
  /** 目前在第幾幕。 */
  let act = 1;
  let visited = new Set([1]);
  let lastEvaluation = null;

  const overlay = createOverlay({
    id: 'practice',
    title: '練習台',
    eyebrow: '序章 · 引導練習',
    wide: true,
    // 與正式關卡同一條標頭（課名 ＋ 英文名在左，第幾課與 Esc 在右）
    headBar: true,
    onClose: () => api.close(),
  });

  overlay.body.innerHTML = `
    <div class="console console--practice" data-act="1">
      <nav class="acts" data-acts aria-label="四幕進度">
        ${ACTS.map(
          // 石頭上只刻名字（編號留給 aria-label —— 畫面上不重複講同一件事）
          (a) => `<button class="acts__item" type="button" data-act-go="${a.n}" aria-label="${esc(
            actLabelText(a.n, a.zh).zh
          )}">
            <span class="acts__zh">${a.zh}</span>
          </button>`
        ).join('<span class="acts__rule" aria-hidden="true"></span>')}
      </nav>

      <section class="act act--brief" data-in-acts="1" tabindex="-1" aria-label="第一幕 · 委託">
        <p class="practice__echo reveal d1" data-echo></p>
        <p class="console__scenario reveal d2" data-brief></p>
        <figure class="artifact reveal d3">
          <figcaption class="artifact__label">委託人留下的那句話</figcaption>
          <pre class="artifact__body" data-weak></pre>
        </figure>
        <div class="mission reveal d4">
          <div class="meta-rule"><h4><span class="zh">你的任務</span><span class="en">Mission</span></h4></div>
          <p class="mission__text" data-ask></p>
        </div>
        <div class="act__foot reveal d4">
          <span class="spacer"></span>
          <button class="btn btn--primary" type="button" data-act-next="2">聆聽指引 →</button>
        </div>
      </section>

      <section class="act act--guide" data-in-acts="2" tabindex="-1" aria-label="第二幕 · 指引">
        <h3 class="act__head reveal d1">${GUIDE_TITLE}<span class="act__lead act__lead--inline" data-guide-lead>這一課只有一段刻文。</span></h3>
        <ol class="glyphs" data-inscription></ol>
        <div class="teach" data-teach></div>
        <div class="act__foot reveal">
          <button class="btn btn--ghost" type="button" data-act-go="1">← 回顧委託</button>
          <span class="spacer"></span>
          <button class="btn btn--primary" type="button" data-act-next="3">開始刻印 →</button>
        </div>
      </section>

      <section class="act act--carve" data-in-acts="3 4" aria-label="第三幕 · 刻印">
        <div class="carvehead">
          <span class="spacer"></span>
          <p class="console__label"><span class="zh">石碑刻印</span><span class="en">Carve</span></p>
        </div>
        <div class="carvestage">
          <div class="carvestage__main">
            <div class="stele-slot" data-stele-slot></div>
          </div>
          <aside class="rail" data-rail>
            <div class="meta-rule">
              <h4><span class="zh">刻痕對照</span><span class="en">Live Check</span></h4>
            </div>
            <p class="lamp" data-lamp aria-live="polite"><span class="lamp__dot"></span><span data-lamp-text></span></p>
            <ul class="checklist checklist--live" data-checklist></ul>
            <details class="guidetab" data-guidetab>
              <summary>${GUIDE_TITLE} · 翻回指引<kbd>L</kbd></summary>
              <div data-guide-compact></div>
            </details>
          </aside>
        </div>
      </section>

      <section class="act act--verdict" data-in-acts="4" tabindex="-1" aria-label="第四幕 · 手印">
        <div class="result" data-result hidden tabindex="-1" role="status" aria-live="polite"></div>
      </section>
    </div>
  `;

  const echoEl = overlay.body.querySelector('[data-echo]');
  const briefEl = overlay.body.querySelector('[data-brief]');
  const weakEl = overlay.body.querySelector('[data-weak]');
  const askEl = overlay.body.querySelector('[data-ask]');
  const inscriptionEl = overlay.body.querySelector('[data-inscription]');
  const teachEl = overlay.body.querySelector('[data-teach]');
  const guideCompactEl = overlay.body.querySelector('[data-guide-compact]');
  const guideTabEl = overlay.body.querySelector('[data-guidetab]');
  const checklistEl = overlay.body.querySelector('[data-checklist]');
  const lampEl = overlay.body.querySelector('[data-lamp]');
  const lampTextEl = overlay.body.querySelector('[data-lamp-text]');
  const resultEl = overlay.body.querySelector('[data-result]');
  const steleSlot = overlay.body.querySelector('[data-stele-slot]');
  const consoleEl = overlay.body.querySelector('.console');
  const actSections = Array.from(overlay.body.querySelectorAll('[data-in-acts]'));
  const actNavEl = overlay.body.querySelector('[data-acts]');
  const actBtns = Array.from(overlay.body.querySelectorAll('[data-act-go]'));

  bindInfoTips(overlay.body);

  /* ---------------------------------------------------------------- 石碑 */

  const stele = createStele({
    onCarve: ({ index, total }) => {
      runPreflight();
      onCarve?.({ index, total });
    },
    onReject: ({ feedback }) => onReject?.({ feedback }),
    onComplete: () => {
      onSeal?.();
      goAct(4, { force: true });
    },
    onPress: ({ text }) => submit(text),
    onTap: () => onTap?.(),
  });
  steleSlot.appendChild(stele.root);

  /* ------------------------------------------------------------ 分鏡機 */

  function canGoAct(n) {
    if (!step) return false;
    if (!Number.isInteger(n) || n < 1 || n > ACTS.length) return false;
    if (n === 4 && !stele.done) return false;
    return visited.has(n) || n === act + 1;
  }

  function renderActNav() {
    actNavEl.hidden = !step;
    for (const btn of actBtns) {
      const n = Number(btn.getAttribute('data-act-go'));
      const isNow = n === act;
      btn.classList.toggle('is-now', isNow);
      btn.classList.toggle('is-done', visited.has(n) && !isNow);
      btn.disabled = !isNow && !canGoAct(n);
      btn.setAttribute('aria-current', isNow ? 'step' : 'false');
      const { roman, zh } = actLabelText(n, ACTS[n - 1].zh);
      btn.setAttribute('aria-label', zh);
      btn.title = isNow ? `${roman} ${zh}（現在在這裡）` : `回到 ${roman} ${zh}`;
    }
    consoleEl.classList.toggle('is-palm', act === 4);
  }

  function actFocusTarget(n) {
    if (n === 3) return stele.focusTarget;
    if (n === 4) {
      if (!stele.fired) return stele.palmTarget;
      if (!resultEl.hidden) return resultEl;
    }
    return actSections.find((s) => s.getAttribute('data-in-acts').split(' ').includes(String(n))) || null;
  }

  function goAct(n, { force = false, focus = true } = {}) {
    if (!step) return act;
    if (!Number.isInteger(n) || n < 1 || n > ACTS.length) return act;
    if (!force && !canGoAct(n)) return act;
    const changed = n !== act;
    act = n;
    visited.add(n);
    consoleEl.setAttribute('data-act', String(n));
    for (const sec of actSections) {
      sec.hidden = !sec.getAttribute('data-in-acts').split(' ').includes(String(n));
    }
    renderActNav();
    if (changed) overlay.resetScroll();
    if (focus) {
      const target = actFocusTarget(n);
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus?.();
        }
      }
    }
    return act;
  }

  on(overlay.body, '[data-act-go]', 'click', (e, target) => {
    goAct(Number(target.getAttribute('data-act-go')));
  });
  on(overlay.body, '[data-act-next]', 'click', (e, target) => {
    goAct(Number(target.getAttribute('data-act-next')), { force: true });
  });

  // 前兩幕：Enter 往下一幕（按鈕、連結、details 自己處理 Enter）
  overlay.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (act !== 1 && act !== 2) return;
    const t = e.target;
    if (t && t.closest && t.closest('a, button, summary, input, textarea, [contenteditable]')) return;
    e.preventDefault();
    goAct(act + 1, { force: true });
  });

  /*
   * 單鍵快捷（Phase 23）：和正式關卡同一套，序章學到的手指習慣直接帶得走。
   *   Alt + 1…4  回到某一幕　　L  翻開神諭刻文
   */
  overlay.root.addEventListener('keydown', (e) => {
    if (!step || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.altKey) {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= ACTS.length) {
        e.preventDefault();
        goAct(n);
      }
      return;
    }
    if (String(e.key).toLowerCase() === 'l' && guideTabEl) {
      e.preventDefault();
      guideTabEl.open = !guideTabEl.open;
      const summary = guideTabEl.querySelector('summary');
      try {
        summary?.focus({ preventScroll: true });
      } catch {
        summary?.focus?.();
      }
    }
  });

  /* --------------------------------------------------- 第二幕：神諭刻文 */

  /** 一課一條刻文：白話說明 ＋ 做法 ＋ 可點的神諭原典。 */
  function renderInscription() {
    const ins = step.inscription;
    if (!ins) {
      inscriptionEl.innerHTML = '';
      guideCompactEl.innerHTML = '';
      return;
    }
    inscriptionEl.innerHTML = `<li class="glyph reveal" style="--i:2">
      <span class="glyph__mark" aria-hidden="true">1</span>
      <div class="glyph__body">
        <h5 class="glyph__title">${esc(ins.title)}${ins.tech ? `<i>${esc(ins.tech)}</i>` : ''}</h5>
        ${ins.what ? `<p class="glyph__what">${esc(ins.what)}</p>` : ''}
        ${ins.how ? `<p class="glyph__how">${esc(ins.how)}</p>` : ''}
        ${
          ins.source
            ? `<p class="srcrow">${sourceBook(ins.source, {
                label: SOURCE_LABEL,
                extra: SOURCE_NOTE,
              })}</p>`
            : ''
        }
      </div>
    </li>`;
    // 第三幕的側頁籤：同一段刻文，壓成一行
    guideCompactEl.innerHTML = `<ul class="guidetab__list"><li>
      <b>${esc(ins.title)}</b>
      ${ins.how ? `<span>${esc(ins.how)}</span>` : ''}
      ${ins.source ? sourceBook(ins.source, { label: SOURCE_LABEL }) : ''}
    </li></ul>`;
    if (guideTabEl) guideTabEl.open = false;
  }

  /**
   * 官方原文（次要參考）。
   *
   * 刻文是遊戲自撰的白話，所以官方怎麼說的一定要留一個入口 ——
   * 收在可展開的「原文 ↗」裡：官方 tip / example 逐字，附可點的出處。
   */
  function renderTeach() {
    const q = step.quote;
    const cards = step.teachCards
      .map(
        (card) => `<article class="teach__card">
          <h5>${esc(card.title)}</h5>
          <p class="teach__tip">${safeRich(card.tip)}</p>
          ${card.exampleZh ? `<pre class="teach__ex">${esc(card.exampleZh)}</pre>` : ''}
          ${
            card.example
              ? `<details class="origin"><summary>原文 ↗（官方英文）</summary>
                  <pre class="origin__body" lang="en">${esc(card.example)}</pre>
                  ${(card.sources || [])
                    .slice(0, 1)
                    .map(
                      (s) =>
                        `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(
                          s.name
                        )} · 官方出處 ↗</a>`
                    )
                    .join('')}
                </details>`
              : (card.sources || [])
                  .slice(0, 1)
                  .map(
                    (s) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`
                  )
                  .join('')
          }
        </article>`
      )
      .join('');

    // 弱 → 強：官方那組對照（逐字），一樣收在「原文 ↗」裡
    const pair =
      q && q.kind === 'beforeAfter'
        ? `<details class="origin"><summary>原文 ↗（官方的弱 → 強對照）</summary>
            <p class="origin__note">${esc(
              q.zhNote || '上面的中文是遊戲自撰的示範，不是官方文字。'
            )}</p>
            <pre class="origin__body" lang="en">弱：${esc(q.weak)}\n強：${esc(q.strong)}</pre>
            ${
              q.source
                ? `<a class="src" href="${esc(q.source.url)}" target="_blank" rel="noopener">${esc(
                    q.source.name
                  )} · 官方出處 ↗</a>`
                : ''
            }
          </details>`
        : '';

    /*
     * 全部收在一個摺頁裡。
     * 第二幕的焦點只有那一條刻文；想查「官方到底怎麼寫的」的人，
     * 打開這一頁就看得到逐字原文與可點的出處（護欄 2：查得到、不冒充）。
     */
    teachEl.innerHTML = `<details class="origin origin--refs">
      <summary>官方怎麼說 ↗（原文與出處）</summary>
      <div class="origin__refs">${cards}${pair}</div>
    </details>`;
  }

  /* ------------------------------------------------- 第三幕：刻痕對照 */

  /** 和正式關卡同一份清單：做到的亮起來，沒做到的（依鷹架）給提示。 */
  function renderChecklist(evaluation = null) {
    const scaffold = SCAFFOLD[step.scaffold] || SCAFFOLD.full;
    const showHints = scaffold.hintsUpfront || attempts > 0;
    checklistEl.innerHTML = step.rubric
      .map((row, i) => {
        const src = content.sourceFor(row.techniqueId);
        const def = CHECKS[row.check];
        const tech = content.technique(row.techniqueId);
        const r = evaluation ? evaluation.results[i] : null;
        const state = r ? (r.passed ? 'pass' : r.partial ? 'part' : 'miss') : null;
        const icon = r ? (r.passed ? '✓' : r.partial ? '◐' : '·') : '';
        return `<li class="${state ? `checklist__row is-${state}` : ''}" style="--i:${i}">
          <span class="checklist__dot" aria-hidden="true">${icon}</span>
          <span class="checklist__text">
            <b>${esc(def ? def.label : row.check)}</b>
            ${tech ? `<i>${esc(tech.title)}</i>` : ''}
            ${
              r && r.evidence && (r.passed || r.partial)
                ? `<em class="checklist__evidence">${esc(r.evidence)}</em>`
                : ''
            }
            ${r && !r.passed && showHints && r.hint ? `<em class="checklist__hint">${esc(r.hint)}</em>` : ''}
          </span>
          <span class="checklist__w">${formatScore(row.weight)} 分</span>
          ${src ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">出處 ↗</a>` : ''}
        </li>`;
      })
      .join('');
  }

  /** 刻一段亮一盞燈（同一支離線引擎，不寫進度、不給分）。 */
  function runPreflight() {
    if (!step) return null;
    const evaluation = evaluate(step, stele.text);
    renderChecklist(evaluation);
    renderLamp(evaluation);
    return evaluation;
  }

  function renderLamp(evaluation) {
    if (!evaluation) {
      lampEl.hidden = true;
      return;
    }
    lampEl.hidden = false;
    const ready = evaluation.earned >= evaluation.pass;
    const done = evaluation.results.filter((r) => r.passed).length;
    lampEl.classList.toggle('is-ready', ready);
    lampTextEl.textContent = ready
      ? `已達通過門檻 —— 把手掌按上石碑就過關了（做到 ${done} / ${evaluation.results.length} 項）`
      : `再刻幾段就夠了（目前 ${formatScore(evaluation.earned)} / 需要 ${formatScore(evaluation.pass)} 分）`;
  }

  /* ------------------------------------------------------- 第四幕：手印 */

  function submit(textOverride) {
    if (!step || passed) return;
    attempts += 1;
    onSubmit?.(step);
    const text = typeof textOverride === 'string' ? textOverride : stele.text;
    const evaluation = evaluate(step, text);
    lastEvaluation = evaluation;
    goAct(4, { force: true, focus: false });
    renderChecklist(evaluation);
    renderLamp(evaluation);
    renderResult(evaluation);
  }

  function renderResult(evaluation) {
    resultEl.hidden = false;

    if (!evaluation.passed) {
      // 石碑只收正確的刻痕，理論上走不到這裡 —— 但真的走到了，也要給得出路
      const missing = evaluation.results.filter((r) => !r.passed);
      resultEl.innerHTML = `
        <div class="result__top is-fail reveal" style="--i:0">
          <div class="grade grade--none is-stamp"><span class="grade__mark">—</span><span class="grade__label">${
            evaluation.tooShort ? '太短了' : '再刻一次'
          }</span></div>
          <div class="result__meter">
            <p class="result__scoreline"><b>${formatScore(evaluation.earned)}</b> / ${formatScore(
              evaluation.total
            )} · 通過門檻 ${formatScore(evaluation.pass)}</p>
            <div class="meter"><i style="width:${Math.round(
              (evaluation.earned / evaluation.total) * 100
            )}%"></i><u style="left:${Math.round((evaluation.pass / evaluation.total) * 100)}%"></u></div>
            <p class="gain gain--none">還差這些 —— 回到石碑重刻一次就好。</p>
          </div>
        </div>
        <ul class="rows">${missing
          .map(
            (r, i) =>
              `<li class="row row--miss" style="--i:${i}"><span class="row__icon">✕</span>
                <div class="row__main"><div class="row__head"><b>${esc(r.label)}</b></div>
                <p class="row__hint">${esc(r.hint)}</p></div></li>`
          )
          .join('')}</ul>
        <div class="practice__next"><button class="btn btn--primary" data-recarve type="button">回到石碑重刻</button></div>
      `;
      focusResult();
      return;
    }

    passed = true;
    const outcome = progression.completePrologueStep(step.id, { teaches: step.teaches, xp: step.xp });
    const collected = outcome.newlyCollected
      .map((id) => content.technique(id))
      .filter(Boolean)
      .map((t) => {
        const src = content.sourceFor(t.id);
        return `<li><b>${esc(t.title)}</b> ${
          src ? `<a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">出自 ${esc(src.name)} ↗</a>` : ''
        }</li>`;
      })
      .join('');

    resultEl.innerHTML = `
      <div class="result__top is-pass reveal" style="--i:0">
        <div class="grade grade--${esc(evaluation.grade).toLowerCase()} is-stamp">
          <span class="grade__mark">${esc(evaluation.grade)}</span>
          <span class="grade__label">${GRADE_LABEL[evaluation.grade]}</span>
        </div>
        <div class="result__meter">
          <p class="result__scoreline"><b>${formatScore(evaluation.earned)}</b> / ${formatScore(
            evaluation.total
          )} · 通過門檻 ${formatScore(evaluation.pass)}</p>
          <div class="meter"><i style="width:${Math.round(
            (evaluation.earned / evaluation.total) * 100
          )}%"></i><u style="left:${Math.round((evaluation.pass / evaluation.total) * 100)}%"></u></div>
          <p class="gain">＋${outcome.xpGain} XP${
            outcome.leveledUp ? ` · 升到 Lv.${outcome.levelAfter}！` : ''
          }</p>
        </div>
      </div>
      ${
        collected
          ? `<div class="collected" style="--i:1"><h4><span class="zh">✦ 收進圖鑑</span><span class="en">Collected</span></h4><ul>${collected}</ul></div>`
          : ''
      }
      <p class="result__source reveal" style="--i:2">這一課的官方出處
        <a class="src" href="${esc(step.source)}" target="_blank" rel="noopener">${esc(step.sourceName)} ↗</a>
      </p>
      <div class="practice__next">
        <button class="btn btn--primary" data-next type="button">繼續</button>
      </div>
    `;
    focusResult();
    onPass?.({ step, evaluation, outcome });
  }

  on(overlay.body, '[data-next]', 'click', () => {
    onDone?.({ step, evaluation: lastEvaluation });
  });
  on(overlay.body, '[data-recarve]', 'click', () => {
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    stele.reopen();
    visited.delete(4);
    goAct(3, { force: true });
    runPreflight();
  });

  function focusResult() {
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      resultEl.focus({ preventScroll: true });
    } catch {
      resultEl.focus?.();
    }
  }

  const api = {
    get isOpen() {
      return overlay.isOpen;
    },
    get root() {
      return overlay.root;
    },
    /** 目前這一步（測試與序章流程用）。 */
    get step() {
      return step;
    },
    get attempts() {
      return attempts;
    },
    get passed() {
      return passed;
    },
    /** 目前在第幾幕。 */
    get act() {
      return act;
    },
    get visitedActs() {
      return [...visited].sort((a, b) => a - b);
    },
    canGoAct,
    goAct,
    /** 石碑的把手（測試與除錯用）。 */
    get stele() {
      return stele;
    },
    /** 選一個選項（＝玩家點下去那一下）。 */
    pick: (i) => stele.pick(i),
    /** 直接觸發手掌印（測試用，不必真的按住 600ms）。 */
    press: () => stele.press(),
    submit,
    open(resolvedStep, { index = 1, total = 3 } = {}) {
      step = resolvedStep;
      attempts = 0;
      passed = false;
      lastEvaluation = null;
      overlay.setEyebrow(`序章 · 第 ${String(index).padStart(2, '0')} 課 / 共 ${String(total).padStart(2, '0')} 課`);
      overlay.setTitle(step.title, step.titleEn);
      echoEl.textContent = step.echo || '';
      briefEl.textContent = step.brief || '';
      weakEl.textContent = step.starter || '';
      askEl.textContent = step.ask || '';
      renderInscription();
      renderTeach();
      resultEl.hidden = true;
      resultEl.innerHTML = '';
      stele.load(step.flow);
      renderChecklist();
      lampEl.hidden = true;
      // 導演的第一顆鏡頭永遠是委託：先看見「哪裡不對」
      visited = new Set([1]);
      act = 1;
      goAct(1, { force: true, focus: false });
      runPreflight();
      overlay.open({ focus: actFocusTarget(1) });
      overlay.resetScroll();
    },
    close() {
      overlay.close();
      onClose?.(step);
    },
  };

  return api;
}

export default createPractice;

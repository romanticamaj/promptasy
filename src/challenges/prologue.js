/**
 * Promptasy — 序章（引導課程）內容解析
 *
 * prologue.json 只記「引用哪一條技巧、哪一組 before/after」，
 * 真正會顯示出來的教學文字一律在這裡從 curriculum.json 取出來 —— 逐字，不改寫。
 * 這樣 CLAUDE.md 護欄 2（內容正確且附出處）在結構上就成立：
 * 序章不可能出現一句 curriculum 裡沒有的「官方說法」。
 *
 * 解析後的每個 step 直接就是 rubric 引擎吃得下的 challenge 形狀
 * （id / rubric / pass / xp / teaches），所以序章與正式關卡共用同一套離線評分邏輯。
 */

/**
 * @param {object} prologueData src/data/prologue.json
 * @param {object} curriculum   src/data/curriculum.json
 */
export function createPrologueContent(prologueData, curriculum, curriculumZh = null) {
  const techniques = new Map((curriculum.techniques || []).map((t) => [t.id, t]));
  const beforeAfter = new Map((curriculum.beforeAfter || []).map((b) => [b.title, b]));
  /** 官方範例的中文譯寫（curriculum-zh.json）—— 序章沒自己寫 zhCards 時的退路。 */
  const zhTech = new Map(Object.entries((curriculumZh && curriculumZh.techniques) || {}));

  /**
   * 引用一組官方的弱→強對照，或一條技巧的官方範例。
   *
   * Phase 9：畫面上要先給玩家看得懂的中文（`zh.*`，遊戲自撰），
   * 官方英文原文（`weak` / `strong` / `example`，逐字）降級成「原文 ↗」的次要參考。
   * 兩者一定分開存放 —— 翻譯永遠不會被當成官方引文顯示。
   */
  function resolveQuote(quote) {
    if (!quote || typeof quote !== 'object') return null;
    const zh = quote.zh && typeof quote.zh === 'object' ? quote.zh : {};
    if (quote.kind === 'beforeAfter') {
      const pair = beforeAfter.get(quote.title);
      if (!pair) return null;
      return {
        kind: 'beforeAfter',
        title: pair.title,
        weak: pair.weak,
        strong: pair.strong,
        // 遊戲自撰的中文示範（主要顯示內容）
        weakZh: typeof zh.weak === 'string' ? zh.weak : '',
        strongZh: typeof zh.strong === 'string' ? zh.strong : '',
        zhNote: typeof zh.note === 'string' ? zh.note : '',
        source: pair.source || null,
      };
    }
    if (quote.kind === 'techniqueExample') {
      const tech = techniques.get(quote.techniqueId);
      if (!tech || !tech.example) return null;
      return {
        kind: 'techniqueExample',
        title: tech.title,
        techniqueId: tech.id,
        example: tech.example,
        exampleZh: typeof zh.example === 'string' ? zh.example : '',
        zhNote: typeof zh.note === 'string' ? zh.note : '',
        source: (tech.sources || [])[0] || null,
      };
    }
    return null;
  }

  function resolveStep(step) {
    const quote = resolveQuote(step.quote);
    const zhCards = step.zhCards && typeof step.zhCards === 'object' ? step.zhCards : {};
    const teachCards = (step.teachTechniques || [])
      .map((id) => techniques.get(id))
      .filter(Boolean)
      .map((t) => ({
        id: t.id,
        title: t.title,
        // tip 也走中文譯寫層（curriculum-zh.json），沒有譯寫就是官方原文（多半本來就是中文）
        tip: (zhTech.get(t.id) || {}).tip || t.tip,
        // example 是官方逐字原文；exampleZh 是遊戲自撰的中文示範（顯示時中文在前）
        example: t.example,
        exampleZh:
          (typeof zhCards[t.id] === 'string' ? zhCards[t.id] : '') ||
          (zhTech.get(t.id) || {}).example ||
          '',
        vendors: t.vendors || [],
        sources: t.sources || [],
      }));

    // 起手文字：那句「弱」的委託逐字留著 —— 第一幕要讓玩家先看見「哪裡不對」
    // Phase 9：顯示的是中文的弱寫法（玩家看得懂才知道要修什麼），不是官方英文原文
    let starter = typeof step.starter === 'string' ? step.starter : '';
    if (!starter && step.starterFrom === 'weak' && quote) starter = quote.weakZh || quote.weak || '';

    return {
      ...step,
      quote,
      starter,
      teachCards,
      /**
       * 第二幕「神諭刻文」的那一條。
       * 標題 / 說明 / 做法是遊戲自撰的白話（一次只講一個概念），
       * 但一定掛得回它的**神諭原典**（curriculum 裡那條技巧的官方出處）。
       */
      inscription: resolveInscription(step),
      /** 石碑刻印的流程（Phase 13：序章與正式關卡用同一種互動）。 */
      flow: resolveFlow(step.flow),
      /** 全部選對會刻出來的那一段 prompt（測試與教學回顧用）。 */
      assembled: assemble(step.flow),
      /** 這一步的官方出處（顯示在卡片與結果上）。 */
      sourceName: sourceNameFor(step, teachCards),
    };
  }

  /** 一課只教一個概念 —— 把它連同它的官方出處解出來。 */
  function resolveInscription(step) {
    const src = step.inscription || null;
    if (!src) return null;
    const tech = techniques.get(src.techniqueId) || null;
    const sources = (tech && tech.sources) || [];
    return {
      techniqueId: src.techniqueId,
      title: src.title,
      what: src.what || '',
      how: src.how || '',
      /** 對應技巧的正式名稱（顯示在標題旁邊，不冒充官方文字）。 */
      tech: tech ? tech.title : '',
      /** 神諭原典：優先取這一課指定的那份官方文件。 */
      source: sources.find((s) => s.url === step.source) || sources[0] || null,
    };
  }

  function resolveFlow(flow) {
    if (!flow || !Array.isArray(flow.slots) || !flow.slots.length) return null;
    return { slots: flow.slots.map((s) => ({ ask: s.ask, options: s.options.slice() })) };
  }

  /** 每一段的正確選項串起來 = 這一課「刻對了」的那段 prompt。 */
  function assemble(flow) {
    if (!flow || !Array.isArray(flow.slots)) return '';
    return flow.slots
      .map((s) => (s.options.find((o) => o.correct) || {}).text || '')
      .join('\n');
  }

  function sourceNameFor(step, teachCards) {
    for (const card of teachCards) {
      const hit = (card.sources || []).find((s) => s.url === step.source);
      if (hit) return hit.name;
    }
    for (const id of step.teaches || []) {
      const tech = techniques.get(id);
      const hit = ((tech && tech.sources) || []).find((s) => s.url === step.source);
      if (hit) return hit.name;
    }
    return '官方文件';
  }

  const steps = (prologueData.steps || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(resolveStep);
  const stepById = new Map(steps.map((s) => [s.id, s]));

  return {
    data: prologueData,
    title: prologueData.title,
    titleEn: prologueData.titleEn,
    shrine: prologueData.shrine,
    beats: (prologueData.beats || []).slice(),
    steps,
    step: (id) => stepById.get(id) || null,
    technique: (id) => techniques.get(id) || null,
  };
}

export default createPrologueContent;

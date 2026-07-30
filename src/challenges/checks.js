/**
 * PromptArcade — 離線 rubric 檢查器（Offline rubric checks）
 *
 * 設計原則（見 CLAUDE.md「關卡與評分引擎」）：
 *  1. 判定「技巧是否被『運用』」，不是比對固定字串 → 反作弊。
 *  2. 中英雙語偵測（課程內容是中文，但 prompt 常用英文寫）。
 *  3. 每個檢查回傳 { score, passed, partial, evidence }，evidence 是給玩家看的教學回饋。
 *  4. 純函式、零相依 → 可在瀏覽器與 node 測試腳本共用。
 *
 * score: 1 = 完全做到、0.5 = 部分做到（給部分分數）、0 = 沒做到。
 */

/** 低於此長度的 prompt 一律 0 分（防止亂打字騙分）。 */
export const MIN_PROMPT_LENGTH = 15;

/* ------------------------------------------------------------------ *
 * 共用工具
 * ------------------------------------------------------------------ */

const clean = (s) => (typeof s === 'string' ? s : '');
const lines = (s) => clean(s).split(/\r?\n/);
const countMatches = (s, re) => (clean(s).match(re) || []).length;

function result(score, evidence) {
  const clamped = Math.max(0, Math.min(1, score));
  return {
    score: clamped,
    passed: clamped >= 1,
    partial: clamped > 0 && clamped < 1,
    evidence: evidence || '',
  };
}

const PASS = (evidence) => result(1, evidence);
/** 差一點點就完全做到（Phase 9：多給一階部分分數，讓努力被看見）。 */
const MOST = (evidence) => result(0.75, evidence);
const PART = (evidence) => result(0.5, evidence);
const MISS = (evidence) => result(0, evidence);

/**
 * 粗略的「字重」：英文以詞計、中文以字數的一半計。
 * 用來判斷 prompt 是否「簡短直接」（reasoning-01 / reasoning-02）。
 */
function promptWeight(text) {
  const t = clean(text);
  const cjk = (t.match(CJK_RE) || []).length;
  const words = (t.replace(CJK_RE, ' ').match(/[A-Za-z0-9_@#$%'"./-]+/g) || []).length;
  return words + cjk / 2;
}

/** 節錄一段證據文字，避免回饋面板被超長 prompt 洗版。 */
function snip(text, max = 64) {
  const t = clean(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/* ------------------------------------------------------------------ *
 * 任務動詞（給 assignsTask / positiveFraming 共用）
 * ------------------------------------------------------------------ */

const TASK_VERBS_EN = [
  'write', 'summarize', 'summarise', 'translate', 'list', 'explain', 'analyze', 'analyse',
  'generate', 'create', 'rewrite', 'classify', 'extract', 'compare', 'draft', 'convert',
  'describe', 'outline', 'review', 'plan', 'design', 'calculate', 'sort', 'suggest',
  'recommend', 'answer', 'produce', 'build', 'identify', 'evaluate', 'organize', 'organise',
  'transform', 'edit', 'proofread', 'brainstorm', 'categorize', 'categorise', 'count',
  'fix', 'improve', 'label', 'rank', 'rate', 'respond', 'reply', 'return', 'format',
  'group', 'output', 'provide', 'critique', 'compose', 'expand', 'condense', 'simplify',
  'structure', 'turn', 'map', 'give', 'show', 'tell', 'name', 'find', 'make',
  // 一般祈使動詞（世界裡的委託也算「明確任務」）
  'keep', 'use', 'walk', 'go', 'stay', 'wait', 'follow', 'bring', 'carry', 'deliver',
  'send', 'take', 'open', 'close', 'move', 'head', 'start', 'begin', 'continue',
  'ensure', 'include', 'add', 'remove', 'replace', 'apply', 'focus', 'pick', 'choose',
  'select', 'read', 'ask', 'call', 'draft', 'set', 'put', 'place', 'reorder', 'split',
];
const TASK_VERB_SET = new Set(TASK_VERBS_EN);

const ZH_TASK_VERBS =
  '寫出|寫一|寫個|寫成|寫下|寫好|撰寫|列出|列成|條列|分點|總結|摘要|翻譯|解釋|說明|分析|產生|生成|製作|做出|做成|做一|改寫|重寫|改成|換成|轉成|轉換|分類|擷取|抽取|比較|設計|規劃|整理|統整|彙整|判斷|建議|計算|算出|重算|排序|評估|回答|作答|回覆|回報|輸出|提供|歸納|標註|標出|標上|檢視|檢查|核對|確認|命名|挑出|找出|選出|選擇|畫出|補上|加上|保持|沿著|走到|前進|靠右|靠左|等我|停在|告訴|調整|設定|清理|清掉|安排|處理|完成|執行';

/**
 * 有些「動詞」其實是複合名詞的前半（「輸出格式」「輸出上限」「完成前」）。
 * 命中之後再看下一個字，是這些詞就不算指令動詞 —— 這是 Phase 10 最大宗的誤判來源。
 */
const ZH_VERB_BLOCKERS = {
  輸出: /^(?:格式|上限|下限|欄位|結構|樣式|長度|規格|範例|要求|方式|形式|型態|字數|內容|區|標籤|順序)/,
  完成: /^(?:前|之前|後|之後|時|度)/,
  說明: /^(?:欄|區|如下|文件)/,
  回答: /^(?:格式|欄|區|裡|中|內)/,
  回覆: /^(?:格式|欄|區|裡|中|內|的)/,
  回報: /^(?:格式|欄|區|裡|中|內)/,
  執行: /^(?:前|之前|後|之後)/,
  處理: /^(?:前|之前|後|之後)/,
};

/** 這個中文動詞後面接的是複合名詞 → 不算指令。 */
function verbBlocked(verb, rest) {
  const blocker = ZH_VERB_BLOCKERS[verb];
  return Boolean(blocker && blocker.test(rest));
}

/** 去掉行首的清單符號 / 編號 / 禮貌詞，露出真正的動詞。 */
const LEAD_NOISE = /^[\s>*\-–—•·]*(?:\d+[.)、]\s*)?(?:step\s*\d+\s*[:：.)]?\s*)?(?:(?:your\s+)?task\s*[:：]\s*)?(?:you\s+(?:should|must|will|need\s+to)\s+)?(?:your\s+task\s+is\s+to\s+)?(?:please\s+|kindly\s+|now\s+|then\s+|first,?\s+|next,?\s+|finally,?\s+)*/i;

/**
 * 把 prompt 切成「指令單位」：以換行與句號切句。
 * 中文句號／問號／驚嘆號後面常常直接接下一句（不留空白），所以 CJK 標點一律切開 ——
 * 否則「你是一位港務長。請向新來的擺渡船員說明今晚的航次」整句會被當成一個敘述句。
 */
function directives(text) {
  return clean(text)
    .split(/\r?\n|(?<=[。！？；])|(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 口語的祈使開頭：「把…整理成表格」「用平穩的速度前進」「依照下面的格式回覆」。
 * 一般人寫中文指令時大量出現，卻不是動詞本身 —— 單獨列出來才判得到。
 */
const ZH_IMPERATIVE_LEAD =
  /^\s*(?:請|麻煩|幫我|替我|你要|我要你|需要你)?\s*(?:先|再|首先|接著|然後|最後|之後|直接|立刻|馬上|務必|一定|順便)?\s*(把|將|用|以|依照|依據|按照|根據|針對|沿著|保持|維持|記得|務必|一律|全部|每一?[點項行段條])(?=\S)/;

/**
 * 「請＋（狀語）＋動詞」：一般人最常寫的委託句型。
 * 「請向新來的擺渡船員說明今晚的航次」「請只根據上面這份資料回答」都要接得住，
 * 但「請大家先儲水」（信件內文）不行 —— 所以中間可以隔字，結尾一定要是真的任務動詞。
 */
const ZH_POLITE_VERB = new RegExp(
  `^\\s*(?:請|麻煩|幫我|替我|我要你|需要你|你要|拜託)\\s*(?:你|您)?\\s*[^。！？!?\\n]{0,20}?(${ZH_TASK_VERBS})`
);

/** 從動詞開始擷取一段乾淨的動詞片語（切在句／逗點，不會截在半個詞上）。 */
function verbPhrase(sentence, verb) {
  const at = sentence.indexOf(verb);
  if (at < 0) return verb;
  const rest = sentence.slice(at);
  const cut = rest.split(/[。．！？!?；;，,、：:\n]/)[0].trim();
  const phrase = cut || rest.trim();
  return phrase.length > 24 ? `${phrase.slice(0, 24)}…` : phrase;
}

/** 這句是不是「動詞開頭的祈使句」？回傳命中的動詞或 null。 */
function matchVerb(sentence) {
  const zh = sentence.match(
    new RegExp(
      `^\\s*(?:請|麻煩|幫我|替我|你要|我要你|需要你|任務\\s*[:：]\\s*)?\\s*(?:首先|接著|然後|最後|之後|先|再)?\\s*(${ZH_TASK_VERBS})`
    )
  );
  if (zh && !verbBlocked(zh[1], sentence.slice(sentence.indexOf(zh[1]) + zh[1].length))) return zh[1];
  const zhLead = sentence.match(ZH_IMPERATIVE_LEAD);
  const zhPolite = sentence.match(ZH_POLITE_VERB);
  const stripped = sentence.replace(LEAD_NOISE, '');
  const first = (stripped.match(/^([a-z]+)\b/i) || [])[1];
  if (first && TASK_VERB_SET.has(first.toLowerCase())) return first.toLowerCase();
  if (zhPolite && !verbBlocked(zhPolite[1], sentence.slice(sentence.indexOf(zhPolite[1]) + zhPolite[1].length))) {
    return zhPolite[1];
  }
  // 「把…／用…／依照…」這種祈使開頭：句子要有點長度才算指令，避免把「用戶」之類的詞當動詞
  if (zhLead && sentence.trim().length >= 6) return zhLead[1];
  return null;
}

/**
 * 動詞開頭的祈使句。也接受一個前置子句（「Using only the text above, list…」／
 * 「根據上面的資料，列出…」）——祈使動詞仍然要真的出現，才不會誤判敘述句。
 */
function imperativeVerb(sentence) {
  const direct = matchVerb(sentence);
  if (direct) return direct;
  const lead = sentence.match(/^[^,，]{2,60}[,，]\s*(.+)$/);
  return lead ? matchVerb(lead[1]) : null;
}

/** 只寫「回答問題」這種沒有受詞的空指令 —— 給部分分數，不給滿分。 */
const VAGUE_TASK_ONLY =
  /^\s*(?:請|麻煩|幫我|替我)?\s*(?:回答|回覆|answer|reply to)\s*(?:一下)?\s*(?:我的|the\s+|my\s+)?(?:問題|questions?)?\s*[。．.!！?？]?\s*$/i;

/** 回傳 { verb, phrase, vague }；找不到指令回傳 null。 */
function imperativePhrase(sentence) {
  const verb = imperativeVerb(sentence);
  if (!verb) return null;
  return {
    verb,
    phrase: verbPhrase(sentence, verb),
    vague: VAGUE_TASK_ONLY.test(sentence),
  };
}

function countPositiveDirectives(text) {
  return directives(text).filter((s) => imperativeVerb(s)).length;
}

/* ------------------------------------------------------------------ *
 * 遮蔽「不是指令」的區塊（assignsTask 專用）
 *
 * 玩家貼進來的信件內文、範例列、資料區裡本來就有動詞（「請大家先儲水」），
 * 那不是玩家下的指令。把這些區塊遮掉之後再找任務動詞，才不會教錯因果。
 * ------------------------------------------------------------------ */

/** 章節標題看起來是「資料／範例區」而不是「指令區」。 */
const DATA_HEADING_RE =
  /(資料|材料|素材|內容|文件|文本|原文|來源|附件|信件|帳目|帳|紀錄|記錄|筆記|卷|範例|示範|例子|脈絡|背景|引文|context|data|document|source|material|examples?|input|reference)/i;

/** 範例列與規格欄位列：這些行是「素材」，不是玩家的指令。 */
const FIELD_LABEL_LINE =
  /^[ \t>*\-–—•·]*(?:input|output|in|out|q|a|例|例子|範例|示範|輸入|輸出|原句|原文|改寫前|改寫後|修改前|修改後|工具名|tool[_ ]?name|說明|描述|description|參數|parameters?|params?|args?|來源|source|標籤|label|備註|note)[ \t]*[:：]/i;

/** 「告示原文：…」「委託單內容：…」這種一看就是貼上來的素材。 */
const MATERIAL_LABEL_LINE =
  /^[ \t>*\-–—•·]*[^\n:：]{0,8}(?:原文|內容|資料|材料|文件|信件|帳目|紀錄|記錄|筆記|告示|草稿|工單|便條|委託單|日誌)[ \t]*[:：]/;

function maskNonInstruction(text) {
  let t = clean(text);
  // 圍籬與三引號包起來的內容
  t = t.replace(/```[\s\S]*?```/g, '\n');
  t = t.replace(/"""[\s\S]*?"""/g, '\n');
  t = t.replace(/'''[\s\S]*?'''/g, '\n');
  // 成對標籤：只遮「整塊」的（開標籤自成一行），才不會把同一行的指令一起吃掉
  t = t.replace(/^[ \t]*<([a-zA-Z][\w-]{0,30})(?:\s[^>]*)?>[\s\S]*?<\/\1>[ \t]*$/gm, '\n');
  // 剩下的孤立標籤只拿掉標籤本身
  t = t.replace(/<\/?[a-zA-Z][\w-]{0,30}(?:\s[^>]*)?>/g, ' ');
  // 【資料】…【/資料】
  t = t.replace(/【([^】\n]{1,20})】[\s\S]*?【\/\1】/g, '\n');
  t = t.replace(/【[^】\n]{1,20}】/g, ' ');
  // 引號裡的整段材料
  t = t.replace(/「[^」]{6,}」/g, '（引文）').replace(/『[^』]{6,}』/g, '（引文）');

  // 章節標題：資料／範例段落整段遮掉，指令段落留著
  const out = [];
  let skipping = false;
  for (const line of t.split(/\r?\n/)) {
    const heading = line.match(/^[ \t]*#{1,6}[ \t]*(.+?)[ \t]*$/);
    if (heading) {
      skipping = DATA_HEADING_RE.test(heading[1]);
      out.push('');
      continue;
    }
    if (skipping) {
      out.push('');
      continue;
    }
    if (FIELD_LABEL_LINE.test(line) || MATERIAL_LABEL_LINE.test(line)) {
      out.push('');
      continue;
    }
    out.push(line);
  }
  const masked = out.join('\n');
  if (masked.trim()) return masked;

  // 全部被遮光了 → 玩家可能把整段指令都寫在一個「資料」標題底下。
  // 退回只遮「範例列／欄位列」的輕量版，避免把玩家真正的指令一起吃掉。
  return clean(text)
    .split(/\r?\n/)
    .map((line) => (FIELD_LABEL_LINE.test(line) || MATERIAL_LABEL_LINE.test(line) ? '' : line))
    .join('\n');
}

/**
 * 只認「禁止式指令」，不認敘述句裡的 never/不要。
 * 例：「for the ferryman, who has never read a council document」不算禁止句。
 */
const NEG_DIRECTIVE_RE =
  /(?:^|[,，;；、]\s*|\band\s+|\bbut\s+|\balso\s+)(?:do not|don'?t|never\s+(?:use|add|include|mention|write|say|start|begin|make|put|give|reply|respond|output|show)|avoid|refrain from|must not|should not|shouldn'?t)\b|(?:請勿|不要|不可以|不得|不准|禁止|切勿)|(?:^|[,，；;、])\s*(?:不可|不能|別|勿|避免)/gi;

function negativePhrases(text) {
  const found = [];
  for (const sentence of directives(text)) {
    NEG_DIRECTIVE_RE.lastIndex = 0;
    const hits = sentence.match(NEG_DIRECTIVE_RE);
    if (hits) found.push(...hits.map((h) => h.replace(/^[\s,，;；、]+/, '')));
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 各檢查器的 regex
 * ------------------------------------------------------------------ */

// --- hasRole ---------------------------------------------------------
const ROLE_EN =
  /\b(?:you are|you're|act as|acting as|assume the role of|your role is|imagine you are|pretend (?:to be|you are)|behave as)\s+(?:an?|the)?\s*([a-z][a-z0-9 ,\-/&.]{2,60})/i;
const ROLE_ZH =
  /(?:你是|您是|你就是|你現在是|你來當|請你當|你來扮演|你將扮演|請扮演|扮演|擔任|身為|假設你是|想像你是|把自己當成|你的角色是|你的身分是|你的身份是)\s*(?:一位|一個|一名|個|位|名)?\s*([^\s，。,.;；!！?？\n]{2,20})/;
const ROLE_LABEL =
  /(?:^|\n)\s*(?:role|persona|角色|身分|身份|人設)\s*[:：]\s*(\S[^\n]{1,80})/i;
const GENERIC_ROLE =
  /^(?:a |an |the )?(?:very |really |super )?(?:helpful |friendly |good |smart |great |nice )*(?:ai|a\.i\.|assistant|ai assistant|chat ?bot|bot|model|language model|llm|helper|人工智慧|ai\s*助手|助手|助理|機器人|模型|聊天機器人)\b/i;

// --- hasFewShot ------------------------------------------------------
const IN_LABEL =
  /^\s*(?:input|in|q|question|user|prompt|例子?|範例輸入|輸入|原句|原文|原本|改寫前|修改前|之前|問|問題|使用者|來源)\s*[:：]\s*(.*)$/i;
const OUT_LABEL =
  /^\s*(?:output|out|a|answer|assistant|response|result|結果|輸出|範例輸出|答|答案|回覆|回答|改寫後|修改後|之後|變成|應該|轉換後)\s*[:：]\s*(.*)$/i;
const ARROW_PAIR = /^\s*(.{2,200}?)\s*(?:->|→|=>|⇒|＝>)\s*(.{2,200})\s*$/;
/** 同一行寫完一組：「輸入：… 。輸出：…」（thinking-chamber-14 玩家的直覺寫法）。 */
const SAME_LINE_PAIR =
  /(?:輸入|input|原句|原文|問|q)\s*[:：]\s*(\S[^\n]*?)[\s。．.、,，;；]+(?:輸出|output|答案?|結果|回覆|a)\s*[:：]\s*(\S[^\n]*)/i;
const EXAMPLE_TAG = /<example[^>]*>([\s\S]*?)<\/example>/gi;
const EXAMPLE_HEAD = /^[ \t]*(?:examples?|範例|舉例|示範)[ \t]*[:：]?[ \t]*$/im;

// --- specifiesFormat -------------------------------------------------
const FORMAT_NOUN_EN =
  /\b(?:json|yaml|xml|csv|tsv|markdown|html|table|bullet(?:ed)? list|bullet points?|numbered list|ordered list|checklist|code block|plain text|prose|paragraphs?|headings?|one sentence|a single sentence|single sentence|a single word|one word|one line|two columns|schema|template|outline)\b/i;
const FORMAT_NOUN_ZH =
  /(表格|表列|兩欄|三欄|條列|分點|逐點|項目符號|編號清單|編號列表|清單|列表|純文字|純文本|程式碼區塊|一句話|兩句話|一段話|一段短文|短文|三段|段落|標題|大綱|欄位|模板|範本|格式如下|一個字|問答|對話框?|json|markdown|csv|yaml|xml)/i;
/**
 * 「一行」只有在講輸出形狀時才算格式 ——
 * 「埋在最後一行」是在描述上一版怎麼壞掉的，不是規格（echo-workshop-35 誤判）。
 */
const FORMAT_ONE_LINE =
  /(?:用|以|限)[^\n。，,]{0,2}一行|(?:寫成|排成|整理成|輸出|回覆|回答|呈現|格式[:：])[^\n。，,]{0,4}一行|每(?:一)?[^\n。，,]{0,5}一行|一行一(?:筆|則|條|項|個|張)|一行(?:呈現|寫完|就好|即可)/;
const FORMAT_DECL =
  /(?:^|\n)\s*(?:output ?format|format|回覆格式|輸出格式|格式)\s*[:：]\s*(\S[^\n]*)/i;
const FORMAT_VERB =
  /\b(?:respond|reply|answer|output|return|present|write|format)\b[^.\n]{0,30}\b(?:in|as|using|with)\b[^.\n]{0,30}/i;
const FORMAT_WORD_ONLY = /\bformat\b|格式/i;

// --- hasConstraint ---------------------------------------------------
const NUM = '(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred|一|二|兩|三|四|五|六|七|八|九|十|百|幾)';
const UNIT_EN =
  'words?|sentences?|bullet points?|bullets?|points?|items?|lines?|paragraphs?|characters?|chars?|steps?|examples?|rows?|columns?|tokens?|pages?|ideas?|options?|reasons?|tips?|questions?|sections?|slides?|entries|fields?';
/** 一看就是「輸出規格」的單位。 */
const UNIT_STRONG_ZH =
  '個字|字元|字|句話|句|個重點|個要點|個範例|個項目|個步驟|個問題|個理由|重點|要點|點|項|行|段|條|步|則|篇|欄|列|組|頁';
/** 這些量詞多半只是在講故事（一次、一個、三張筆記）—— 後面沒接規格名詞就不算限制。 */
const UNIT_WEAK_ZH = '個|種|類|次|件|位|名|張|盞|袋|枚|艘|棟|扇';
const UNIT_ZH = `${UNIT_STRONG_ZH}|${UNIT_WEAK_ZH}`;
const CONSTRAINT_EN = new RegExp(`\\b${NUM}\\s*(?:[-–~]|\\s+to\\s+)?\\s*(?:\\d+\\s*)?(?:${UNIT_EN})\\b`, 'i');
// 「簡短一點」「多一點」不是量化限制 —— 前面是形容詞的「一點」要排除，否則模糊語言會蒙混過關。
// 「第一次」的「第」、「每一個 / 哪一個 / 這一次」的限定詞也要排除（Phase 10 誤判清單）。
const CONSTRAINT_ZH = new RegExp(
  `(?<![好多少大小長短快慢簡易難久單早晚第每哪這那某另上下前後])(${NUM})\\s*(?:[-–~到至]\\s*${NUM}\\s*)?(${UNIT_ZH})`,
  'g'
);
/** 弱量詞後面若緊跟著規格名詞（「3 個條列重點」「2 個風險」），就升級成真限制。 */
const SPEC_NOUN_AFTER =
  /^(?:[^\n。，,、]{0,6})(?:字|句|點|項|行|段|條|則|篇|欄|列|組|重點|要點|範例|步驟|問題|理由|選項|風險|建議|標語|欄位|階段)/;
const LIMIT_WORD =
  /\b(?:under|below|less than|no more than|at most|at least|maximum|max|minimum|min|between|exactly|up to|within|no longer than)\b|不超過|不多於|不少於|至多|至少|最多|最少|恰好|剛好|以內|之內|以下|以上|上限|下限|限制在|控制在/i;
const VAGUE_LENGTH =
  /\b(?:short|brief|concise|succinct|not too long|a bit longer|as short as possible)\b|簡短|精簡|簡潔|短一點|盡量短|不要太長|長一點/i;

// --- hasDelimiters ---------------------------------------------------
const FENCE = /```/g;
const TRIPLE_QUOTE = /"""|'''/g;
const HEADING_2 = /^[ \t]*#{2,}[ \t]*\S/m;
const HEADING_1 = /^[ \t]*#[ \t]*\S/m;
const HR_LINE = /^[ \t]*(?:-{3,}|={3,}|\*{3,}|─{3,}|#{3,})[ \t]*$/m;
const XML_PAIR = /<([a-zA-Z][\w-]{1,30})(?:\s[^>]*)?>[\s\S]*?<\/\1>/;
const XML_OPEN = /<([a-zA-Z][\w-]{1,30})(?:\s[^>]*)?>/;
const BRACKET_TAG = /\[[A-Z\u4e00-\u9fff][^\]\n]{1,30}\]|【[^】\n]{1,20}】|〈[^〉\n]{1,20}〉|《[^》\n]{1,20}》/g;
const LABEL_LINE = /^[ \t]*[A-Za-z\u4e00-\u9fff][\w \u4e00-\u9fff/-]{1,24}[:：][ \t]*\S/;
/** 一般人最直覺的「把資料包起來」：整段夾在中文引號裡也算切開了。 */
const ZH_QUOTE_BLOCK = /「[^」]{10,}」|『[^』]{10,}』|〔[^〕]{10,}〕/;

// --- asksToVerify ----------------------------------------------------
const VERIFY_EN =
  /\b(?:verify|double[-\s]?check|re-?check|recheck|check|review|validate|cross[-\s]?check|confirm|proofread|sanity[-\s]?check)\b[^.\n]{0,50}?\b(?:your (?:answer|response|output|work|result|reasoning|numbers?|figures?)|the (?:answer|output|result|numbers?|figures?|facts?|citations?|calculations?)|each (?:number|figure|fact|claim|item)|every (?:number|figure|fact|claim|item)|for (?:errors|mistakes|accuracy|consistency)|against the (?:source|text|document|original|report))/i;
const VERIFY_BEFORE =
  /\bbefore (?:finishing|you finish|answering|you answer|submitting|responding|giving your)/i;
const VERIFY_ZH =
  /(?:檢查|核對|複查|驗證|確認|校對|再看|再讀|重看|重讀|對照)[^\n]{0,14}(?:答案|輸出|結果|內容|正確|無誤|是否|是不是|有沒有|對不對|對得上|對得起來|相符|吻合|總和|加起來|錯字|每(?:個|一)|數字|來源|原文|一次|一遍|一下|再回答)|自我檢查|自己檢查|先檢查再|(?:回答|作答|輸出|交出|完成|寫完|給我)[^\n]{0,4}(?:前|之前|後|完之?後)[^\n]{0,10}(?:檢查|確認|核對|驗證|校對|看一遍|讀一遍)|最後[^\n]{0,8}(?:檢查|核對|確認|驗證|校對)/;
const VERIFY_WEAK = /\b(?:verify|double[-\s]?check|validate|proofread)\b|檢查|核對|驗證/i;

// --- groundsInContext ------------------------------------------------
const CONTEXT_REF_EN =
  /\b(?:the (?:text|document|article|passage|report|data|context|information|material|content|transcript|notes?|excerpt) (?:below|above|provided|given|attached|that follows)|the following (?:text|document|article|data|passage|information|report|content|material)|provided (?:context|document|text|material|sources?)|based on the (?:above|below|following|provided|given|attached))\b|<context>|<document>|<source>|<reference>/i;
const CONTEXT_REF_ZH =
  /(?:以下|下面|下方|上面|上方|上述|前面|附上|附件|提供的|所給的|給你的|我給|這份|這段|這些|那段)[^\n]{0,6}(?:資料|文件|文章|文字|內容|報告|段落|資訊|訊息|紀錄|記錄|筆記|逐字稿|摘錄|告示|帳|信|清單)|參考資料|參考文件|參考下面|根據資料|依照資料|<context>|【[^】\n]{0,10}(?:資料|文件|內容|原文)[^】\n]{0,10}】/;
const EXCLUSIVE =
  /\b(?:only|solely|exclusively|strictly|nothing but)\b|僅(?:能|可|以|根據|依據|使用|用)?|只(?:能|可以|可|根據|依據|使用|用|參考|看)/i;
const NO_OUTSIDE =
  /\b(?:do not|don'?t|never)\b[^.\n]{0,40}\b(?:outside|external|prior|your own|general|background)\b[^.\n]{0,20}\bknowledge\b|\bwithout using (?:outside|external|prior) knowledge\b|(?:不要|不可|不能|別|勿|禁止)(?:使用|依賴|參考|動用)?[^\n]{0,8}(?:外部|自身|你的|你自己的|既有|先驗)(?:知識|資訊|資料)|不得使用外部|(?:不要|別)(?:用|使用)你(?:自己)?的知識|(?:不要|別)(?:自己)?(?:亂)?(?:補充|加油添醋|想像|發揮)/i;

// --- hasStepByStep ---------------------------------------------------
const STEP_EN =
  /\bstep[-\s]?by[-\s]?step\b|\bthink (?:it )?through\b|\bshow your (?:work|reasoning|thinking)\b|\breason(?:ing)? (?:through|about|step)\b|\bwalk (?:me )?through\b|\bthink (?:carefully )?before (?:answering|you answer|responding)\b|\bthink (?:very |really |extra )?hard\b|\btake a deep breath and\b|\blet'?s think\b/i;
const STEP_TAG = /<(?:thinking|thought|scratchpad|reasoning)>/i;
const STEP_FIRST_THEN = /\bfirst,?\b[\s\S]{0,120}?\b(?:then|after that|next|finally)\b/i;
const STEP_ZH =
  /逐步|一步一步|一項一項|按步驟|依步驟|依序|按順序|步驟如下|分步|分成[^\n]{0,4}(?:個)?步驟|思考過程|推理過程|先(?:想|思考)|想清楚再|慢慢想|好好想|仔細(?:地)?想|仔細思考|認真想|深入(?:地)?想|想過(?:之後)?再(?:回答|作答|下結論|給|說)|先.{0,24}(?:再|然後|接著)|<thinking>/;
const STEP_NUMBERED = /^[ \t]*(?:step\s*)?[1-9][.)、]\s*\S/gim;

// --- hasAudience -----------------------------------------------------
const AUDIENCE_NOUNS =
  'audiences?|readers?|users?|visitors?|customers?|clients?|students?|beginners?|novices?|experts?|children|child|kids?|teenagers?|developers?|engineers?|designers?|managers?|executives?|investors?|recruiters?|teachers?|doctors?|nurses?|parents?|professionals?|newcomers?|colleagues?|players?|shoppers?|patients?|subscribers?';
const AUDIENCE_EN = new RegExp(
  [
    // for a non-technical manager / for first-time visitors / written for new users
    `\\b(?:for|to|aimed at|written for|targeted at|geared towards?)\\s+(?:an?|the)?\\s*(?:[a-z][\\w-]*[ -]){0,3}(?:${AUDIENCE_NOUNS})\\b`,
    // for a general audience / for a 5-year-old / for a layperson
    '\\bfor (?:an? |the )?(?:non[-\\s]?technical|lay ?(?:person|people)|general (?:audience|public)|5[-\\s]?year[-\\s]?olds?|first[-\\s]?timers?)\\b',
    // for the ferryman, who has never read …
    '\\bfor (?:an? |the )?[\\w-]+,?\\s+who\\s+(?:has|have|is|are|does|do|will|never|might|already)\\b',
    '\\bexplain (?:it |this )?(?:to|for) (?:an? |the )?\\w+',
    '\\b(?:target )?audience\\s*[:：]\\s*\\S',
    '\\bassume (?:the reader|your reader|no prior)\\b',
    '\\byour readers? (?:are|is)\\b',
  ].join('|'),
  'i'
);
const AUDIENCE_ZH =
  /(?:讀者|對象|受眾|聽眾|觀眾|使用者|目標客群)\s*(?:是|為|群?[:：])|(?:寫|說明|解釋|講|做|整理|翻譯)給[^\n]{0,16}(?:看|聽|讀|用)|給(?:完全)?(?:不懂|沒有|初學|新手|第一次|初次|剛來|新來|小學生|國中生|高中生|大學生|外行|非技術|一般人|工程師|設計師|主管|老闆|客戶|投資人|家長|學生|旅人|讀者)|面向(?:初學|新手|一般|非)|以(?:國小|國中|高中|大學)生(?:能|可以)?(?:懂|理解)|讓(?:完全)?(?:不懂|沒有經驗|第一次|新手|外行)[^\n]{0,12}(?:看得懂|聽得懂|讀得懂|理解)|[^\n，。,.；;]{2,14}(?:也|都)(?:看得懂|讀得懂|聽得懂|能看懂|能讀懂|能懂)|為[^\n，。,.；;]{2,14}(?:而寫|寫的|量身)|給[^\n，。,.；;]{1,14}(?:看得懂|讀得懂|聽得懂)/;
const AUDIENCE_WEAK = /\baudience\b|讀者|受眾|對象/i;

// --- givesOutForUncertainty -----------------------------------------
const UNCERTAIN_COND =
  /\bif\b[^.\n]{0,60}\b(?:you (?:don'?t|do not) know|you'?re not sure|you are not sure|unsure|uncertain|not (?:stated|mentioned|available|found|present|in the)|no (?:information|data)|cannot (?:be )?determine|can'?t (?:be )?determine|insufficient)/i;
const UNCERTAIN_SAY =
  /\b(?:say|reply|respond|write|answer|state|output|return|use)\b[^.\n]{0,40}\b(?:i don'?t know|"?unknown"?|"?not stated"?|not found|insufficient information|no information|cannot determine|can'?t determine|not in the (?:text|document|report|context))/i;
const UNCERTAIN_RATHER =
  /\b(?:rather than|instead of)\s+(?:guess|guessing|making (?:it|something) up|speculating)\b/i;
const UNCERTAIN_ZH =
  /(?:不知道|不確定|沒有(?:提到|寫|說|相關資料)|找不到|查無|資料(?:中|裡)?(?:沒有|不足|沒寫)|無法(?:確定|判斷))[^\n]{0,18}(?:就|請|則|時|的話)?[^\n]{0,12}(?:說|回答|回覆|寫|輸出|標示|告訴|直說|明說|承認)|(?:就|請|直接|可以|允許你?)?(?:說|回答|回覆|寫|輸出|標示)[「『"']?(?:不知道|不確定|未提及|沒有提到|資料中沒有|資料裡沒有|無法確定|查無此|沒有寫)|寧可(?:說|回答)?不知道/;
/**
 * grounding-03：資訊不足時「反問使用者」也是官方認可的出路
 * （GPT-4.1：if you don't have enough information to call the tool, ask the user for the information you need）。
 */
const UNCERTAIN_ASK =
  /\bask (?:the |a |an )?[\w-]+\b[^.\n]{0,60}\bfor\b[^.\n]{0,40}\b(?:information|details?|value|values|parameters?|input)\b|\bask the user for the information you need\b/i;
const UNCERTAIN_ASK_ZH =
  /(?:反問|回頭問|詢問|請教|問)[^\n]{0,8}(?:使用者|用戶|玩家|旅人|對方|我)[^\n]{0,16}(?:缺|需要|不足|補上|提供|資訊|參數|哪裡|什麼)|向(?:使用者|對方|我)(?:詢問|確認|要)|(?:就|請|可以)?(?:回頭)?問(?:我|使用者|對方)(?:一句|一下|清楚)?/;
const NO_FABRICATE =
  /\b(?:do not|don'?t|never)\b[^.\n]{0,24}\b(?:guess|guessing|fabricate|invent|speculate|hallucinate|assume)\b|\b(?:do not|don'?t|never)\b\s*make\b[^.\n]{0,16}\bup\b|(?:不要|不可|不能|別|勿|禁止)(?:編造|臆測|猜測|亂猜|亂編|杜撰|瞎掰|自行想像|自己想|亂講)/i;

// --- asksToCiteSources（grounding-04：先引用再作答） -------------------
const CITE_VERB = /\b(?:quote|cite|copy|reproduce|pull|extract|list|show)\b/i;
const CITE_OBJECT =
  /\b(?:sections?|passages?|quotes?|sentences?|lines?|excerpts?|paragraphs?|evidence|snippets?|citations?)\b/i;
const CITE_SOURCE_HINT =
  /\b(?:documents?|texts?|sources?|reports?|articles?|context|transcripts?|notes?|records?|ledger)\b|原文|文件|資料|來源|出處/i;
const CITE_BEFORE =
  /\bbefore (?:answering|you answer|responding|you respond|your answer|writing)\b|回答前|作答前|答覆前|回答之前/i;
const CITE_ZH =
  /(?:引用|引述|摘錄|節錄|標出|指出|附上|列出|貼出|抄出|先貼)[^\n]{0,14}(?:原文|原句|文件|資料|段落|句子|那一句|出處|來源|依據|佐證|證據)|(?:哪(?:一)?句|哪一段|哪裡)[^\n]{0,8}(?:支持|佐證|證明|寫著)/;
const CITE_WEAK = /\b(?:quote|cite|citation|citations|sources?|references?)\b|引用|出處|來源|佐證/i;

// --- putsQuestionLast（longcontext-01：資料在前、問題在後） -------------
const QUESTION_LABEL = /^\s*(?:question|query|問題|提問|請問)\s*[:：]/i;
const ENDS_WITH_QUESTION = /[?？]\s*$/;

// --- decomposesTask（decompose-01/02/04、agentic-05 的規劃） ------------
const DECOMP_EN =
  /\b(?:break|split|divide|decompose|separate)\b[^.\n]{0,30}\b(?:in)?to\b[^.\n]{0,30}\b(?:sub-?tasks?|sub-?requests?|sub-?questions?|sub-?steps?|steps?|stages?|parts?|pieces?|chunks?)\b/i;
const DECOMP_ZH =
  /(?:拆(?:解|分|成|開)|分解|切分|切成|分成|拆成|逐項拆|分工|列出)[^\n]{0,12}(?:子任務|子問題|子步驟|小任務|小工作|幾件事|幾個步驟|步驟|階段|部分|區塊)|一件一件(?:做|處理|完成)|一項一項(?:做|處理|完成)/;
const DECOMP_CHAIN =
  /\b(?:each|every) (?:step|sub-?task)\b[^.\n]{0,50}\b(?:output|result|feeds?|input|next)\b|(?:上一步|前一步)[^\n]{0,10}(?:輸出|結果)[^\n]{0,12}(?:當|作為|餵|接)/i;
const DECOMP_PARALLEL =
  /\b(?:in parallel|parallel(?:ise|ize)?|independent(?:ly)?)\b[^.\n]{0,40}\b(?:calls?|tools?|tasks?|steps?|requests?)\b|\b(?:calls?|tools?|tasks?|steps?)\b[^.\n]{0,40}\b(?:in parallel|independent(?:ly)?)\b|平行(?:處理|呼叫|執行)/i;
const DECOMP_WORD = /\bsub-?tasks?\b|\bsub-?requests?\b|子任務|子問題/i;
const NUM_STEP_LINE = /^[ \t>*\-–—•·]*(?:step\s*)?[1-9][.)、]\s*(\S.*)$/i;

// --- asksToRefine（decompose-03 / iterate-03 / iterate-04） -------------
const REFINE_VERB = /\b(?:revise|refine|rewrite|re-?write|improve|polish|tighten|redo|iterate on)\b/i;
const REFINE_CTX =
  /\b(?:draft|critique|criticism|critici[sz]e|review|feedback|first (?:version|pass|draft)|self-?critique|previous (?:answer|version|attempt|approach|output|prompt))\b/i;
const METAPROMPT =
  /\b(?:improve|rewrite|refine|upgrade|optimi[sz]e)\b[^.\n]{0,28}\b(?:this|my|the|your) prompt\b|\bmake (?:this|it) (?:into )?(?:a )?(?:power prompt|better prompt)\b|把(?:這個|我的|這段)?\s*prompt\s*(?:改|寫|優化|變|升級)/i;
const REFINE_ZH =
  /(?:修訂|改寫|重寫|修正|優化|改進|潤飾|再改)[^\n]{0,14}(?:草稿|初稿|第一版|上一版|答案|輸出|內容|prompt)|(?:草稿|初稿|寫一版|先寫)[^\n]{0,26}(?:再|然後|接著)[^\n]{0,12}(?:修訂|修改|改寫|優化|潤|重寫|改一次)|(?:先|請先)[^\n]{0,8}(?:寫|做)(?:一份|一版|個)?(?:草稿|初稿)[^\n]{0,26}(?:檢討|審查|對照|檢查)/;
const REFINE_WEAK = /\b(?:revise|refine|rewrite|improve|polish|critique|review)\b|修訂|改寫|優化|審查|檢討/i;

// --- definesTools（agentic-01 / agentic-02） ---------------------------
const TOOL_NAME_LABEL =
  /(?:^|\n)\s*(?:tool[_ ]?name|name|function(?:[_ ]?name)?|tool|工具(?:名稱|名)?|函式(?:名稱|名)?)\s*[:：]\s*\S/i;
const TOOL_DESC_LABEL = /(?:^|\n)\s*(?:description|desc|說明|描述)\s*[:：]\s*\S/i;
const TOOL_PARAM_LABEL = /(?:^|\n)\s*(?:parameters?|params?|arguments?|args|參數)\s*[:：]\s*\S/i;
const TOOL_JSON_NAME = /"(?:name|function)"\s*:\s*"/i;
const TOOL_JSON_REST = /"(?:description|parameters|arguments)"\s*:/i;
const TOOL_WORD = /\btools?\b|\bfunction[- ]calling\b|工具|函式/i;

// --- setsPersistence（agentic-03） -------------------------------------
const PERSIST_EN =
  /\b(?:keep going|keep working|continue working|do not stop|don'?t stop|do not (?:end|yield)|never stop)\b[^.\n]{0,60}\b(?:until|till)\b|\buntil\b[^.\n]{0,40}(?:completely |fully )?(?:resolved|solved|complete|completed|finished|done)\b|\bonly (?:terminate|stop|end your turn|end the turn|finish)\b[^.\n]{0,60}\b(?:when|once|after)\b/i;
const PERSIST_ZH =
  /直到[^\n]{0,18}(?:完全)?(?:解決|完成|處理完|結束|為止)|做到(?:完全)?(?:解決|完成|好為止)|一直(?:做|處理|進行)[^\n]{0,10}(?:到|直到|完)|(?:不要|別)(?:中途|半途|做一半)(?:就)?(?:停|放棄|交還|回報)/;
const PERSIST_WEAK = /\byou are an agent\b|\bpersistence\b|\bkeep going\b|\buntil\b|你是(?:一個)?(?:代理|agent)|直到/i;

// --- requiresConfirmation（agentic-06） --------------------------------
const RISKY_ACTION =
  'delete|deleting|deletion|drop|dropping|remove|removing|overwrite|overwriting|force[- ]push|reset|wipe|purge|deploy|deploying|publish|publishing|migrat\\w*|irreversible|destructive|production';
const CONFIRM_WORD = 'ask|confirm|confirmation|check with|approval|approve|permission|sign[- ]?off|pause';
const CONFIRM_EN_A = new RegExp(
  `\\b(?:${CONFIRM_WORD})\\b[^.\\n]{0,60}\\bbefore\\b[^.\\n]{0,60}\\b(?:${RISKY_ACTION})\\b`,
  'i'
);
const CONFIRM_EN_B = new RegExp(
  `\\bbefore\\b[^.\\n]{0,40}\\b(?:${RISKY_ACTION})\\b[^.\\n]{0,60}\\b(?:${CONFIRM_WORD})\\b`,
  'i'
);
const CONFIRM_ZH =
  /(?:刪除|移除|覆寫|清空|上線|部署|發布|強制推送|不可逆|破壞性|動到)[^\n]{0,18}(?:前|之前)[^\n]{0,16}(?:先)?(?:問|詢問|確認|徵得|取得(?:同意|許可)|等我)|(?:先)?(?:問過?我|問使用者|詢問|確認|徵得同意|等我同意)[^\n]{0,14}(?:再|才|之後)[^\n]{0,14}(?:刪除|移除|覆寫|清空|部署|發布|執行|動手)/;
const CONFIRM_WEAK = /\b(?:ask (?:me|the user)|confirm|confirmation|approval|permission)\b|徵求|確認|詢問/i;

// --- mentionsParameters（params-01…04 / reasoning-03 / reasoning-05） ---
const PARAM_KEY =
  'temperature|top[-_ ]?p|top[-_ ]?k|max[-_ ]?(?:output[-_ ]?)?tokens?|stop[-_ ]?sequences?|reasoning[-_ ]?effort|thinking[-_ ]?budget|budget[-_ ]?tokens|verbosity|effort';
const PARAM_NAME = new RegExp(`\\b(?:${PARAM_KEY}|parameters?|sampling)\\b|溫度|取樣|參數|思考(?:深度|預算)|輸出上限`, 'i');
/** 中文寫法：「把溫度設為 0.2」「思考深度設成高」。 */
const PARAM_VALUE_ZH =
  /(?:溫度|思考深度|思考預算|輸出上限|字數上限)[^\n]{0,8}(?:設|調|定|為|是|＝|=|：|:)[^\n]{0,4}(?:\d+(?:\.\d+)?|高|中|低|最高|最低)/;
const PARAM_VALUE = new RegExp(
  `\\b(?:${PARAM_KEY})\\b[^.\\n]{0,26}?(?:=|:|\\bto\\b|\\bof\\b|\\bat\\b|設(?:為|成|定)|調(?:到|成|為)|為)?\\s*(?:0?\\.\\d+|\\d{1,6}(?:\\.\\d+)?|low|medium|high|minimal|maximum|高|中|低)`,
  'i'
);

// --- keepsPromptLean（reasoning-01 / reasoning-02） ---------------------
const CJK_RE = /[\u4e00-\u9fff]/g;

// --- explainsWhy -----------------------------------------------------
const WHY_STRONG =
  /\bbecause\b|\bthe reason (?:is|why)\b|\bthis (?:is )?(?:important|matters|is needed)\b[^.\n]{0,10}\bbecause\b|\bsince (?:our|the|we|this|it)\b|\bso that\b|\bin order to\b|\bwhy\s*[:：]/i;
const WHY_ZH =
  /因為|原因是|原因在於|原因出在|理由是|由於|之所以|以便|為了|這樣才能|目的是|以避免|以確保|才不會|好讓|問題是|問題出在|問題在於|毛病在|錯在|失敗的地方|沒做好的地方/;
/** 「上一版把日期埋在最後一行，沒有人看到」—— 說明上次哪裡失敗，也是在解釋 why。 */
const WHY_FAILURE_ZH =
  /(?:上一版|上一次|上次|前一版|前一次|舊版|之前那版|原本那版|先前的)[^\n]{0,30}(?:沒有人|沒人|沒有|沒|漏|錯|失敗|做壞|壞在|看不到|找不到|不清楚|太長|太短)/;

/**
 * 找出所有「數字＋單位」候選，過濾掉序數／成語／疊詞，並替每個候選打分。
 * 分數最高的當證據 —— 才不會在有「3 組範例」的 prompt 裡回報「一種」。
 */
function zhConstraintCandidates(text) {
  const t = clean(text);
  const found = [];
  CONSTRAINT_ZH.lastIndex = 0;
  let m;
  while ((m = CONSTRAINT_ZH.exec(t)) !== null) {
    const whole = m[0];
    const unit = m[2];
    const end = m.index + whole.length;
    // 疊詞：一步一步、一件一件、一項一項 —— 那是語氣，不是規格（前後兩半都要濾掉）
    if (t.slice(end, end + whole.length) === whole) continue;
    if (m.index >= whole.length && t.slice(m.index - whole.length, m.index) === whole) continue;
    // 「親切一點」「清楚一點」：形容詞後面的「一點」是感覺，不是規格
    if (whole.replace(/\s+/g, '') === '一點' && /[\u4e00-\u9fff]/.test(t[m.index - 1] || '')) continue;
    const after = t.slice(end, end + 10);
    const weak = new RegExp(`^(?:${UNIT_WEAK_ZH})$`).test(unit);
    const promoted = weak && SPEC_NOUN_AFTER.test(after);
    const strong = !weak || promoted;
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    const limitNear = LIMIT_WORD.test(before) || LIMIT_WORD.test(after);
    const arabic = /\d/.test(m[1]);
    found.push({
      text: (promoted ? t.slice(m.index, end + (after.match(SPEC_NOUN_AFTER) || [''])[0].length) : whole).trim(),
      strong,
      rank: (strong ? 4 : 0) + (limitNear ? 3 : 0) + (arabic ? 2 : 0) + unit.length,
    });
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 檢查器定義
 * ------------------------------------------------------------------ */

/**
 * 每個檢查器：
 *   id          — rubric 中引用的名字
 *   label       — UI 顯示的短標題
 *   hint        — 沒做到時的預設教學提示（challenge 可覆寫）
 *   techniqueId — 對應 curriculum.json 的技巧 id（用來取官方出處連結）
 *   run(text)   — 回傳 { score, passed, partial, evidence }
 */
const definitions = [
  {
    id: 'hasRole',
    label: '角色設定 Role',
    hint: '在開頭加一句「你是一位＿＿」，把身分講出來。例如「你是一位資深編輯」「你是一位在地導覽員」。',
    techniqueId: 'role-01',
    run(text) {
      const label = clean(text).match(ROLE_LABEL);
      const en = clean(text).match(ROLE_EN);
      const zh = clean(text).match(ROLE_ZH);
      const captured = (label && label[1]) || (en && en[1]) || (zh && zh[1]);
      if (!captured) return MISS('還沒有給身分。在最前面加一句「你是一位＿＿」，例如「你是一位資深編輯」。');
      const role = captured.trim();
      if (GENERIC_ROLE.test(role)) {
        return MOST(`看到身分「${snip(role, 24)}」了，但太籠統。換成有專業的身分，例如「資深編輯」「在地導覽員」。`);
      }
      return PASS(`角色：「${snip(role, 32)}」`);
    },
  },

  {
    id: 'assignsTask',
    label: '明確任務 Task',
    hint: '用一句「請＋動作」直接說要它做什麼。例如「請摘要下面這段文字」「請列出三個重點」「請改寫成公告」。',
    techniqueId: 'clarity-02',
    run(text) {
      // 只在「玩家自己下的指令」裡找動詞：資料區、範例列、引文內容都先遮掉
      const found = directives(maskNonInstruction(text))
        .map((s) => imperativePhrase(s))
        .filter(Boolean);
      const solid = found.filter((f) => !f.vague);
      if (solid.length) {
        const seen = [];
        for (const f of solid) if (!seen.includes(f.phrase)) seen.push(f.phrase);
        return PASS(`任務：${seen.slice(0, 3).map((p) => `「${p}」`).join('、')}`);
      }
      if (found.length) {
        return PART('只寫「回答問題」看不出要它做什麼。補上受詞，例如「請根據上面的資料回答：這一季有多少袋離開倉庫？」。');
      }
      if (/(?:^|\n)\s*(?:task|任務|工作|目標)\s*[:：]\s*\S/i.test(clean(text))) {
        return MOST('有寫「任務：」但後面沒接動作。補一個動詞，例如「任務：請摘要下面這段文字」。');
      }
      return MISS('看不出你要它「做什麼動作」。開頭寫一句「請＋動作」，例如「請把下面這段改寫成公告」。');
    },
  },

  {
    id: 'hasFewShot',
    label: 'Few-shot 範例',
    hint: '直接示範一組「輸入 → 輸出」，它會照抄。寫成兩行：「輸入：（原本長這樣）」換行「輸出：（我要長這樣）」。',
    techniqueId: 'format-02',
    run(text) {
      const ls = lines(text);
      const lastContent = ls.reduce((acc, l, idx) => (l.trim() ? idx : acc), -1);
      let pairs = 0;
      let primer = false;
      for (let i = 0; i < ls.length; i += 1) {
        // 同一行就寫完一組
        const inline = ls[i].match(SAME_LINE_PAIR);
        if (inline && inline[1].trim() && inline[2].trim()) {
          pairs += 1;
          continue;
        }
        const m = ls[i].match(IN_LABEL);
        if (!m) continue;
        let inputBody = (m[1] || '').trim();
        for (let j = i + 1; j < Math.min(ls.length, i + 5); j += 1) {
          const o = ls[j].match(OUT_LABEL);
          if (!o) {
            if (!inputBody) inputBody = ls[j].trim();
            continue;
          }
          let outBody = (o[1] || '').trim();
          if (!outBody) {
            const next = (ls[j + 1] || '').trim();
            // 收尾的「輸出：」是留給模型接寫的開頭（completion primer），不是第三組範例
            if (j >= lastContent || !next || IN_LABEL.test(next) || OUT_LABEL.test(next)) {
              primer = true;
              break;
            }
            outBody = next;
          }
          if (inputBody && outBody) {
            pairs += 1;
            i = j;
          }
          break;
        }
      }
      // 只有一個孤零零的「輸出：」收尾，前面沒有任何輸入 → 也是 primer
      if (!primer && lastContent >= 0 && OUT_LABEL.test(ls[lastContent]) && !(ls[lastContent].match(OUT_LABEL) || [])[1].trim()) {
        primer = true;
      }

      const arrowPairs = ls.filter((l) => {
        const m = l.match(ARROW_PAIR);
        return m && m[1].trim().length >= 2 && m[2].trim().length >= 2;
      }).length;
      pairs += arrowPairs;

      if (pairs > 0) {
        return PASS(
          `偵測到 ${pairs} 組「輸入→輸出」範例${pairs >= 3 ? '（3 組以上最穩）' : ''}${
            primer ? '，結尾還留了「輸出：」讓它接著寫 —— 很好的收尾。' : '。'
          }`
        );
      }

      // <example> 區塊或「範例：」段落，有內容但沒有成對輸入輸出 → 部分分數
      EXAMPLE_TAG.lastIndex = 0;
      const tagged = [...clean(text).matchAll(EXAMPLE_TAG)].filter((m) => m[1].trim().length > 4);
      if (tagged.length) {
        return MOST('有範例區塊，但沒看到成對的示範。補上「輸入：…」與「輸出：…」兩行，它才學得到形狀。');
      }
      if (EXAMPLE_HEAD.test(clean(text))) {
        return MOST('提到了範例，但沒有成對示範。用「輸入：…」「輸出：…」兩行寫出來，效果差很多。');
      }
      return MISS('還沒有示範。寫兩行給它看：「輸入：（原本的樣子）」「輸出：（你要的樣子）」，比用講的有效得多。');
    },
  },

  {
    id: 'specifiesFormat',
    label: '指定輸出格式 Format',
    hint: '告訴它「答案長什麼樣子」。直接寫：「請用 3 點條列回答」「請用一段 100 字以內的短文」「請做成表格」。',
    techniqueId: 'format-01',
    run(text) {
      const t = clean(text);
      const en = t.match(FORMAT_NOUN_EN);
      const zh = t.match(FORMAT_NOUN_ZH) || t.match(FORMAT_ONE_LINE);
      if (en || zh) {
        return PASS(`指定了格式：「${(en ? en[0] : zh[0]).trim()}」`);
      }
      const decl = t.match(FORMAT_DECL);
      if (decl && decl[1].trim().length >= 3) {
        return PASS(`格式宣告：「${snip(decl[1], 40)}」`);
      }
      if (FORMAT_VERB.test(t)) {
        return MOST('有說「用…回覆」但沒講是哪一種。指名一種：條列、表格、一段短文、一句話。');
      }
      if (FORMAT_WORD_ONLY.test(t)) {
        return MOST('寫了「格式」卻沒說是哪一種。補上「輸出格式：3 點條列」這種一句話。');
      }
      return MISS('還沒說答案要長什麼樣子。加一句「請用 3 點條列回答」或「請做成表格」就可以了。');
    },
  },

  {
    id: 'hasConstraint',
    label: '可量化限制 Constraint',
    hint: '把「短一點」換成數字。寫「不超過 100 字」「用 3 到 5 句話」「只要 3 個重點」——數字＋單位就對了。',
    techniqueId: 'clarity-03',
    run(text) {
      const t = clean(text);
      const en = t.match(CONSTRAINT_EN);
      const candidates = zhConstraintCandidates(t);
      const strong = candidates.filter((c) => c.strong);
      if (en || strong.length) {
        const best = strong.length
          ? strong.slice().sort((a, b) => b.rank - a.rank)[0].text
          : en[0].trim();
        const bounded = LIMIT_WORD.test(t);
        return PASS(`量化限制：「${best}」${bounded ? '（且有上／下限詞，很好）' : ''}`);
      }
      if (candidates.length) {
        const noisy = candidates[0].text;
        return PART(
          `「${noisy}」比較像在敘述，不是輸出規格。換成「數字＋規格單位」：3 個重點、100 字以內、5 行。`
        );
      }
      if (LIMIT_WORD.test(t)) {
        return MOST('有「不超過／至少」但後面沒接數字。補成「不超過 100 字」「至少 3 個重點」。');
      }
      const vague = t.match(VAGUE_LENGTH);
      if (vague) {
        return PART(`「${vague[0]}」是感覺，不是規格。換成數字：「用 3 到 5 句話」「不超過 100 字」。`);
      }
      return MISS('還沒有數字。加一個「數字＋單位」：3 句話、100 字以內、5 個重點，挑一個寫上去。');
    },
  },

  {
    id: 'positiveFraming',
    label: '正面表述 Positive',
    hint: '訣竅：把「不要做 X」改寫成「請做 Y」。例如把「不要走左邊」寫成「請靠右走」。少用「不要／別／禁止」，多寫「請直接…／請改成…」。',
    techniqueId: 'positive-01',
    run(text) {
      const pos = countPositiveDirectives(text);
      const negs = negativePhrases(text);
      const neg = negs.length;
      const negList = [...new Set(negs.map((n) => n.trim()))].slice(0, 3).join('、');

      if (pos === 0 && neg === 0) {
        return MISS('還沒有任何指令。先寫一句「請＋你要它做的事」，例如「請靠右走到北門」。');
      }
      if (pos === 0) {
        return MISS(
          `整段都是禁止句（${negList}），沒有一句「要做什麼」。把每個「不要 X」翻成「請做 Y」：「不要走左邊」→「請靠右走」。`
        );
      }
      if (neg === 0) {
        return PASS(`${pos} 句都是「要做什麼」，一句禁止句都沒有 —— 完全正面表述。`);
      }
      if (pos >= neg * 2) {
        return PASS(`以「要做什麼」為主（${pos} 句正面 / ${neg} 句禁止），這樣就可以了。`);
      }
      if (pos > neg) {
        return MOST(`正面句略多（${pos} 正 / ${neg} 負：${negList}）。再把剩下的「不要」翻成「請…」就滿分了。`);
      }
      return PART(
        `禁止句偏多（${pos} 正 / ${neg} 負：${negList}）。把它們一句一句改寫成「請做 Y」，不要只說不能做什麼。`
      );
    },
  },

  {
    id: 'hasDelimiters',
    label: '分隔符與結構 Delimiters',
    hint: '把「要處理的資料」用符號框起來，跟指令分開。最簡單：資料前後各放一行 ---，或寫成【資料】…【/資料】。',
    techniqueId: 'clarity-04',
    run(text) {
      const t = clean(text);
      if (XML_PAIR.test(t)) {
        const tag = t.match(XML_PAIR)[1];
        return PASS(`使用成對 XML 標籤 <${tag}>…</${tag}>（Anthropic 特別推薦）。`);
      }
      if (countMatches(t, FENCE) >= 2) return PASS('使用 ``` 程式碼圍籬把內容包起來。');
      if (countMatches(t, TRIPLE_QUOTE) >= 2) return PASS('使用三引號 """ 分隔指令與內容（OpenAI 範例作法）。');
      if (HR_LINE.test(t)) return PASS('使用分隔線（--- / ===）切段。');
      if (HEADING_2.test(t)) return PASS('使用 ## / ### 章節標題切分 prompt 段落。');
      if (countMatches(t, BRACKET_TAG) >= 2) return PASS('用【資料】…【/資料】這類標記把段落切開了。');
      if (ZH_QUOTE_BLOCK.test(t)) return MOST('用「」把整段內容框起來了。想更保險，改成前後各一行 --- 或【資料】…【/資料】。');

      const h1 = lines(t).filter((l) => HEADING_1.test(l)).length;
      if (h1 >= 2) return PASS(`使用 ${h1} 個 # 章節標題切分各段落（GPT-4.1 建議的骨架就是這種寫法）。`);
      if (h1 === 1) return MOST('只有一個 # 標題。把「指令」和「資料」各給一段，例如再加一行【資料】…【/資料】。');
      if (countMatches(t, BRACKET_TAG) === 1) return MOST('有一個【】標記了。收尾也放一個（【資料】…【/資料】），資料才算被框起來。');
      if (XML_OPEN.test(t)) return MOST('有開頭的標籤卻沒有結尾。補上對應的結束標籤才切得乾淨。');
      const labelled = lines(t).filter((l) => LABEL_LINE.test(l)).length;
      if (labelled >= 2) return MOST(`有 ${labelled} 行「標題：內容」的結構。再把資料前後各放一行 ---，就完全分開了。`);
      if (countMatches(t, FENCE) === 1 || countMatches(t, TRIPLE_QUOTE) === 1) {
        return PART('分隔符只放了一邊。開頭與結尾都要放，才框得起來。');
      }
      return MISS('指令和資料黏在一起。把資料前後各放一行 ---，或寫成【資料】…【/資料】。');
    },
  },

  {
    id: 'asksToVerify',
    label: '自我檢查 Verify',
    hint: '在最後補一句要它自己複查。例如「最後請檢查一次，每個數字都要跟上面的資料對得起來」。',
    techniqueId: 'cot-04',
    run(text) {
      const t = clean(text);
      if (VERIFY_EN.test(t) || VERIFY_ZH.test(t)) {
        return PASS('有要求模型檢核自己的輸出。');
      }
      if (VERIFY_BEFORE.test(t)) return PASS('有「完成之前先檢查」的收尾指令。');
      if (VERIFY_WEAK.test(t)) {
        return MOST('有提到檢查，但沒說要檢查什麼。寫成「最後請對照上面的資料，檢查每個數字」。');
      }
      return MISS('還沒有自我檢查。結尾加一句「最後請檢查一次，有錯就直接改掉」。');
    },
  },

  {
    id: 'groundsInContext',
    label: '依據給定資料 Grounding',
    hint: '把資料貼進來，再加一句「請只根據上面這份資料回答，不要用你自己的知識」。',
    techniqueId: 'grounding-01',
    run(text) {
      const t = clean(text);
      const hasRef = CONTEXT_REF_EN.test(t) || CONTEXT_REF_ZH.test(t);
      const noOutside = NO_OUTSIDE.test(t);
      const exclusive = EXCLUSIVE.test(t);

      if (noOutside && hasRef) return PASS('指名了參考資料，且明確禁止使用外部知識。');
      if (hasRef && exclusive) return PASS('指名了參考資料，並要求「只根據它」作答。');
      if (noOutside) return PASS('明確要求不得動用外部知識。');
      if (hasRef) return MOST('有指到資料了，只差一句「只根據」。補上「請只根據上面這份資料回答」。');
      if (exclusive) {
        return MOST(
          '有寫「只…」，但沒指出是哪一份。這一條要看到「上面／下面這份資料」這種指稱，例如「請只根據上面這份資料回答」。'
        );
      }
      return MISS('還沒把它綁在資料上。貼上資料，再加一句「請只根據上面這份資料回答」。');
    },
  },

  {
    id: 'hasStepByStep',
    label: '逐步思考 Step-by-step',
    hint: '要它先想再答。直接寫「請一步一步想過再回答」，或列出「1. 先… 2. 再… 3. 最後…」。',
    techniqueId: 'cot-01',
    run(text) {
      const t = clean(text);
      if (STEP_EN.test(t) || STEP_TAG.test(t) || STEP_ZH.test(t) || STEP_FIRST_THEN.test(t)) {
        return PASS('有引導模型先推理再作答。');
      }
      const numbered = countMatches(t, STEP_NUMBERED);
      if (numbered >= 3) return PASS(`給了 ${numbered} 個編號步驟，等於把推理流程寫死。`);
      if (numbered === 2) return MOST('有 2 個編號步驟了。再補一步，或直接加一句「請一步一步想過再回答」。');
      return MISS('還沒要它先想。加一句「請一步一步想過再回答」就可以了。');
    },
  },

  {
    id: 'hasAudience',
    label: '指定對象 Audience',
    hint: '講清楚這是寫給誰看的。加一句「這是寫給＿＿看的」，例如「寫給第一次來的旅人看」「寫給完全不懂的人看」。',
    techniqueId: 'clarity-02',
    run(text) {
      const t = clean(text);
      const en = t.match(AUDIENCE_EN);
      const zh = t.match(AUDIENCE_ZH);
      if (en || zh) return PASS(`指定了對象：「${snip((en ? en[0] : zh[0]).trim(), 28)}」`);
      if (AUDIENCE_WEAK.test(t)) return MOST('提到讀者了，但沒說是誰。補成「這是寫給第一次來的旅人看的」。');
      return MISS('還沒說寫給誰看。加一句「這是寫給＿＿看的」，深度與語氣才會對。');
    },
  },

  {
    id: 'givesOutForUncertainty',
    label: '給不知道的出路 Escape hatch',
    hint: '給它一條退路，它就不會硬掰。加一句「如果資料裡沒有寫，就直接回答『資料中沒有提到』」。',
    techniqueId: 'grounding-02',
    run(text) {
      const t = clean(text);
      if (UNCERTAIN_COND.test(t) || UNCERTAIN_SAY.test(t) || UNCERTAIN_ZH.test(t) || UNCERTAIN_RATHER.test(t)) {
        return PASS('給了「查不到就直說」的出路，模型不必硬掰。');
      }
      if (UNCERTAIN_ASK.test(t) || UNCERTAIN_ASK_ZH.test(t)) {
        return PASS('給了「資訊不足就反問使用者」的出路，模型不必亂猜參數。');
      }
      if (NO_FABRICATE.test(t)) {
        return MOST('有說不准亂編，但沒給替代做法。補一句「找不到就回答『資料中沒有提到』」。');
      }
      return MISS('還沒給它退路。加一句「如果資料裡沒有寫，就直接說『資料中沒有提到』」。');
    },
  },

  {
    id: 'explainsWhy',
    label: '說明理由 Why',
    hint: '多寫一句「因為＿＿」。例如「請用純文字，因為後面的程式讀不了表格」——它才推得出你真正要什麼。',
    techniqueId: 'clarity-05',
    run(text, options = {}) {
      const t = clean(text);
      // 這一關該用什麼理由，由關卡資料決定；預設留一個通用範例
      const example = options.example || '因為這份公告今晚就要貼出去';
      const failure = t.match(WHY_FAILURE_ZH);
      if (failure) return PASS(`說明了上一版哪裡失敗：「${snip(failure[0], 44)}」`);
      const m = t.match(WHY_STRONG) || t.match(WHY_ZH);
      if (!m) return MISS(`還沒說「為什麼」。在指令後面加一句「因為＿＿」，例如「${example}」。`);
      const idx = t.indexOf(m[0]);
      const after = t.slice(idx + m[0].length).replace(/^[\s,，：:]+/, '');
      const tail = after.split(/[\n。.!?！？]/)[0] || '';
      if (tail.trim().length < 4) {
        return MOST(`「${m[0]}」後面太短了。把理由講完，例如「${example}」。`);
      }
      return PASS(`說明了理由：「${snip(`${m[0]}${tail}`, 44)}」`);
    },
  },

  {
    id: 'asksToCiteSources',
    label: '先引用再作答 Cite',
    hint: '要它先把證據抄出來。加一句「回答前，先把資料裡支持你答案的那幾句原文引出來」。',
    techniqueId: 'grounding-04',
    run(text) {
      const t = clean(text);
      const before = CITE_BEFORE.test(t);
      for (const s of directives(t)) {
        if (CITE_ZH.test(s)) return PASS(`要求引用原文：「${snip(s, 36)}」`);
        if (CITE_VERB.test(s) && CITE_OBJECT.test(s) && (CITE_SOURCE_HINT.test(s) || before)) {
          return PASS(`要求引用原文：「${snip(s, 36)}」`);
        }
      }
      if (CITE_WEAK.test(t)) {
        return MOST('有提到出處，但沒要它先引出來。寫成「回答前，先引用資料裡支持你答案的句子」。');
      }
      return MISS('還沒要它給依據。加一句「回答前，先把資料裡支持你答案的原文引出來」。');
    },
  },

  {
    id: 'putsQuestionLast',
    label: '資料在前、提問在後 Placement',
    hint: '順序很重要：長資料先貼在最上面，問題留到最後一行再問。結尾寫「問題：＿＿？」就對了。',
    techniqueId: 'longcontext-01',
    run(text) {
      const t = clean(text);
      // 中文字資訊密度較高，計份量時算兩倍
      const bulk = t.length + (t.match(CJK_RE) || []).length;
      if (bulk < 120) {
        return MISS('這關練的是「資料在前、問題在後」。先把整份資料貼上來，最後一行再寫「問題：＿＿？」。');
      }
      const parts = directives(t);
      let lastAt = -1;
      let lastStr = '';
      for (const s of parts) {
        const isAsk = ENDS_WITH_QUESTION.test(s) || QUESTION_LABEL.test(s) || Boolean(imperativeVerb(s));
        if (!isAsk) continue;
        const at = t.lastIndexOf(s);
        if (at > lastAt) {
          lastAt = at;
          lastStr = s;
        }
      }
      if (lastAt < 0) return MISS('看不出問題在哪。最後一行補一句「問題：＿＿？」。');
      const ratio = lastAt / t.length;
      if (ratio >= 0.5) return PASS(`問題放在全文最後 —— 很好：「${snip(lastStr, 32)}」`);
      if (ratio >= 0.25) return MOST('問題卡在中間，後面還有一堆資料。把問題整句搬到最後一行再問。');
      return MISS('問題放在最前面了。先把整份資料貼上來，問題留到最後一行再問。');
    },
  },

  {
    id: 'decomposesTask',
    label: '拆解子任務 Decompose',
    hint: '把工作列成 1. 2. 3.，或直接說「請拆成子任務，一步一步完成」。',
    techniqueId: 'decompose-01',
    run(text) {
      const t = clean(text);
      if (DECOMP_EN.test(t) || DECOMP_ZH.test(t)) return PASS('有明確要求把任務拆成子任務。');
      if (DECOMP_CHAIN.test(t)) return PASS('有把「前一步的答案就是下一步的材料」講清楚 —— 這樣它才接得下去。');

      const steps = lines(t)
        .map((l) => (l.match(NUM_STEP_LINE) || [])[1])
        .filter((body) => body && imperativeVerb(body));
      if (steps.length >= 3) return PASS(`列出了 ${steps.length} 個編號子任務，等於把流程寫死。`);
      if (steps.length === 2) return MOST('已經列出 2 個步驟了。再補第 3 步，或加一句「請把這件事拆成幾個步驟」。');
      if (DECOMP_PARALLEL.test(t)) return MOST('有提到可以同時處理，但沒把工作列成清單。用 1. 2. 3. 列出來。');
      if (DECOMP_WORD.test(t)) return MOST('提到了子任務，但沒真的拆出來。用 1. 2. 3. 一條一條寫。');
      // 用頓號／逗號一口氣列了好幾件事 —— 方向對了，但還沒真的拆成清單
      for (const s of directives(t)) {
        const segs = s
          .split(/[、,，]/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (segs.length >= 3 && segs.filter((seg) => imperativeVerb(seg)).length >= 3) {
          return PART('你已經一口氣列了好幾件事 —— 再把它們寫成 1. 2. 3. 的清單，它才會一件一件做完。');
        }
      }
      return MISS('還沒拆解。把工作列成 1. 2. 3.，或直接說「請拆成子任務，一步一步完成」。');
    },
  },

  {
    id: 'asksToRefine',
    label: '審查後修訂 Refine',
    hint: '要它做兩輪。寫「請先寫一版草稿，再照上面的標準自己檢查一次，然後把草稿改好」。',
    techniqueId: 'decompose-03',
    run(text) {
      const t = clean(text);
      if (METAPROMPT.test(t)) return PASS('有要求它改寫 prompt 本身 —— 讓 AI 幫你改 prompt，最省力的一招。');
      if (REFINE_ZH.test(t)) return PASS('有「先草稿 → 再修訂」的循環。');
      if (REFINE_VERB.test(t) && REFINE_CTX.test(t)) {
        return PASS('有要求依審查／草稿再修訂一次。');
      }
      if (REFINE_WEAK.test(t)) {
        return MOST('有提到修改，但沒講清楚三步。寫成「先寫草稿 → 對照標準檢查 → 再改一次」。');
      }
      return MISS('還少了「再改一次」。加一句「請先寫一版草稿，檢查過後再改寫一次」。');
    },
  },

  {
    id: 'definesTools',
    label: '工具定義 Tool spec',
    hint: '寫三行就好：「工具名：＿＿」「說明：這個工具會做什麼」「參數：每個欄位是什麼、什麼型別」。',
    techniqueId: 'agentic-02',
    run(text) {
      const t = clean(text);
      let score = 0;
      if (TOOL_NAME_LABEL.test(t) || TOOL_JSON_NAME.test(t)) score += 1;
      if (TOOL_DESC_LABEL.test(t)) score += 1;
      if (TOOL_PARAM_LABEL.test(t)) score += 1;
      if (score < 3 && TOOL_JSON_NAME.test(t) && TOOL_JSON_REST.test(t)) score = Math.max(score, 2);

      if (score >= 3) return PASS('工具名、說明、參數三樣都寫了 —— 這份定義可以直接用。');
      if (score === 2) return MOST('三樣裡少一樣（工具名 / 說明 / 參數）。補齊那一行就滿分了。');
      if (score === 1) return PART('只寫了一樣。三行都要有：「工具名：」「說明：」「參數：」。');
      if (TOOL_WORD.test(t)) return PART('提到工具但沒定義它。寫三行：「工具名：」「說明：」「參數：」。');
      return MISS('還沒定義工具。寫三行：「工具名：＿＿」「說明：＿＿」「參數：＿＿（型別與用途）」。');
    },
  },

  {
    id: 'setsPersistence',
    label: '持續到完成 Persistence',
    hint: '加一句「請一直做到問題完全解決為止，不要做到一半就回來問我」，它才不會半途停下。',
    techniqueId: 'agentic-03',
    run(text) {
      const t = clean(text);
      if (PERSIST_EN.test(t) || PERSIST_ZH.test(t)) return PASS('有要求 agent 做到完全解決才結束。');
      if (PERSIST_WEAK.test(t)) return MOST('語氣接近了，但沒把話說死。補一句「做到完全解決為止才交還給我」。');
      return MISS('還沒交代「做到底」。加一句「請一直做到問題完全解決為止」。');
    },
  },

  {
    id: 'requiresConfirmation',
    label: '不可逆先確認 Confirm',
    hint: '危險動作要先問過你。加一句「刪除任何東西之前，先問我一句，我同意了再動手」。',
    techniqueId: 'agentic-06',
    run(text) {
      const t = clean(text);
      if (CONFIRM_EN_A.test(t) || CONFIRM_EN_B.test(t) || CONFIRM_ZH.test(t)) {
        return PASS('有要求在不可逆動作前先取得確認。');
      }
      if (CONFIRM_WEAK.test(t)) {
        return MOST('有提到要確認，但沒說「哪一種動作」。寫成「刪除任何東西之前先問我」。');
      }
      return MISS('還沒有剎車。加一句「刪除任何東西之前，先問我一句再動手」。');
    },
  },

  {
    id: 'mentionsParameters',
    label: '取樣與推理參數 Parameters',
    hint: '把旋鈕的數值寫出來。例如「請把 temperature 設為 0.2」「思考深度設為高」「輸出上限 300 tokens」。',
    techniqueId: 'params-01',
    run(text, options = {}) {
      const t = clean(text);
      // 關卡可以宣告自己的說法（例如熔爐關的「高火／中火／低火」就是 effort 等級）
      const synonyms = Array.isArray(options.synonyms) ? options.synonyms : [];
      const example = options.example || 'temperature 設為 0.2';
      const synHit = synonyms.find((s) => s && t.includes(s));
      if (synHit) return PASS(`指定了思考火力：「${synHit}」`);
      const hit = t.match(PARAM_VALUE) || t.match(PARAM_VALUE_ZH);
      if (hit) return PASS(`指定了參數與數值：「${snip(hit[0], 32)}」`);
      if (PARAM_NAME.test(t)) return MOST(`提到參數了，但沒給數值。寫成「${example}」。`);
      return MISS(`還沒動到旋鈕。寫出參數與數值，例如「${example}」。`);
    },
  },

  {
    id: 'keepsPromptLean',
    label: '簡短直接 Lean prompt',
    hint: '這一關要「短」。只寫任務和你要的成果，不要加「請一步一步想」——這種模型自己會想，加了反而更差。',
    techniqueId: 'reasoning-01',
    run(text) {
      const t = clean(text);
      const scaffold =
        STEP_EN.test(t) || STEP_TAG.test(t) || STEP_ZH.test(t) || countMatches(t, STEP_NUMBERED) >= 2;
      if (scaffold) {
        return MISS('出現了「一步一步想」這類鋪陳 —— 這種模型自己會想，加了反而變差。刪掉它，直接說你要什麼。');
      }
      if (!countPositiveDirectives(t)) {
        return MISS('夠短了，但看不出任務。寫一句「請＋動作」說清楚要它做什麼。');
      }
      const w = Math.round(promptWeight(t));
      if (w <= 65) return PASS(`約 ${w} 字重、沒有多餘的鋪陳 —— 這樣剛剛好。`);
      if (w <= 110) return MOST(`約 ${w} 字重，稍微長了一點。只留任務和「怎樣算成功」就好。`);
      return MISS(`約 ${w} 字重，太囉嗦了。砍到只剩任務與成功標準（例如「不超過 60 字、指名一條路」）。`);
    },
  },
];

/** id → 檢查器 */
export const CHECKS = Object.freeze(
  definitions.reduce((acc, def) => {
    acc[def.id] = Object.freeze(def);
    return acc;
  }, {})
);

export const CHECK_IDS = Object.freeze(definitions.map((d) => d.id));

/**
 * 執行單一檢查。找不到檢查器時回傳 0 分（資料錯誤不該讓遊戲爆掉）。
 * @param {string} id
 * @param {string} text
 * @param {object} [options] 關卡層級的微調（challenges.json 的 rubric[].checkOptions）：
 *   - example  ：回饋裡要用哪一個「貼近本關情境」的示範句
 *   - synonyms ：本關可接受的同義說法（例如熔爐關的「高火」＝ effort high）
 */
export function runCheck(id, text, options = {}) {
  const def = CHECKS[id];
  if (!def) {
    return { ...MISS(`未知的檢查器：${id}`), id, label: id, unknown: true };
  }
  const raw = clean(text).trim();
  if (raw.length < MIN_PROMPT_LENGTH) {
    return {
      ...MISS('字太少了，看不出你用了什麼技巧。至少寫成一句完整的指令。'),
      id,
      label: def.label,
      techniqueId: def.techniqueId,
    };
  }
  const out = def.run(raw, options || {});
  return { ...out, id, label: def.label, techniqueId: def.techniqueId };
}

export default CHECKS;

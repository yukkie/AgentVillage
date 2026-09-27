/**
 * selectors.js — CSS ランタイム到達性ゲート（#634）のセレクタ整形（純粋関数）。
 *
 * - splitSelectorList: CSSOM の selectorText（グループセレクタ）をセレクタ単位に分解する
 * - toReachabilityProbe: jsdom の静的レンダリングでは原理的に一致しない「状態」部分
 *   （ユーザー操作状態の擬似クラス・擬似要素）をセレクタの形から機械的に取り除き、
 *   `document.querySelector` で照合できるセレクタを返す。除外ではなく照合なので、
 *   「:hover ルールだけ残ってベース要素が消えた」デッドも検出される。
 *   構造擬似クラス（:not / :disabled / :first-child 等）は jsdom が評価できるので残す。
 *   個別判断の allowlist を持たないことが #634 の要件（doc/FrontendDesign.md §7.6）。
 */

// ユーザー操作に依存する状態擬似クラス。focus-visible / focus-within は focus より先に照合する。
const STATE_PSEUDO_CLASS = /:(?:hover|active|focus-visible|focus-within|focus|visited|target)(?![\w-])/g;
// 擬似要素（::xxx / ::xxx(...)）と、単一コロンの旧記法。
const PSEUDO_ELEMENT = /::[\w-]+(?:\([^)]*\))?/g;
const LEGACY_PSEUDO_ELEMENT = /:(?:before|after|first-line|first-letter)(?![\w-])/g;
const EMPTY_NOT = /:not\(\s*\)/g;

/**
 * 括弧の外にあるカンマでだけ分割する（`:not(.a, .b)` は分割しない）。
 * @param {string} selectorText
 * @returns {string[]}
 */
export function splitSelectorList(selectorText) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of selectorText) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * 括弧の外の結合子（空白・> + ~）で複合セレクタ列に分解する。
 * @param {string} selector
 * @returns {{compounds: string[], combinators: string[]}}
 */
function splitCompounds(selector) {
  const compounds = [];
  const combinators = [];
  let depth = 0;
  let cur = '';
  let pending = null; // 直前に読んだ結合子（' ' / '>' / '+' / '~'）
  for (const ch of selector.trim()) {
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (pending === null || pending === ' ') pending = /\s/.test(ch) ? (pending ?? ' ') : ch;
      continue;
    }
    if (pending !== null) {
      compounds.push(cur);
      combinators.push(pending);
      cur = '';
      pending = null;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    cur += ch;
  }
  compounds.push(cur);
  return { compounds, combinators };
}

/**
 * @param {string} selector - splitSelectorList で分解済みの単一セレクタ
 * @returns {string} querySelector で照合するセレクタ
 */
export function toReachabilityProbe(selector) {
  // 先に複合セレクタへ分解してから各々の状態部分を取り除く。取り除いてから分解すると
  // `.a :hover` が `.a ` になり、空になった複合セレクタと単なる末尾空白を区別できない。
  const { compounds, combinators } = splitCompounds(selector);
  return compounds
    .map((compound, i) => {
      const stripped = compound
        .replace(PSEUDO_ELEMENT, '')
        .replace(LEGACY_PSEUDO_ELEMENT, '')
        .replace(STATE_PSEUDO_CLASS, '')
        .replace(EMPTY_NOT, '');
      const filled = stripped === '' ? '*' : stripped;
      if (i === 0) return filled;
      const comb = combinators[i - 1];
      return comb === ' ' ? ` ${filled}` : ` ${comb} ${filled}`;
    })
    .join('');
}

/**
 * レポート表示用: vitest の CSS Modules stable 命名（`_name_hash`）を元のクラス名に戻す。
 * @param {string} selector
 * @returns {string}
 */
export function readableSelector(selector) {
  return selector.replace(/\._([A-Za-z][\w-]*)_[0-9a-f]{6}(?![\w-])/g, '.$1');
}

#!/usr/bin/env node
/**
 * cssDeadRules.mjs — 静的到達性監査（#620 AC-5 D案）
 *
 * `src/**\/*.module.css` の各セレクタについて、対応する production JS/JSX から
 * 参照されている形跡があるかを静的に検査する。ランタイム計測（vitest + jsdom）とは異なり、
 * テストを実行せずセレクタ単位・1秒未満で候補を洗い出せる棚卸しツール。
 *
 * 検出できるもの: D1（宣言はあるが production コードに consumer が無い＝静的デッド候補）。
 * 検出できないもの: D2（子孫セレクタ等の構造上到達しない）／D3（分岐・prop 未到達で
 * 実行時に到達しない）。これらは人手判定（S4/S5）が必要。`styles[...]` のような動的アクセスを
 * 含むモジュールは判定不能なので "dynamic" として個別に警告し、誤って D1 扱いしない。
 *
 * スコープ: 各 `.module.css` を import している production ファイル（`*.test.*` を除く
 * `src/**\/*.{js,jsx}`）を先に特定し、その import の実際のローカル名（`styles` とは限らない。
 * 別名 import 対応）だけを参照検索の対象にする（モジュール単位スコープ。#620 訂正2 = S2'）。
 * `frontend/src` 全体を `styles.` で grep する方式は、別名 import の見落とし（false negative）と
 * 別モジュールの同名クラスの誤検出（false positive）の両方を生むため採用しない。
 *
 * 使い方: npm run audit:css （このリポジトリでは `frontend/` 配下で実行する）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..', 'src');

// ---------------------------------------------------------------------------
// ファイル収集
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(SRC_ROOT);
const cssModules = allFiles.filter((f) => f.endsWith('.module.css'));
// production consumer 候補: テストファイルは production reachability の対象外
// （Avatar.test.jsx が variant='muted' を明示的に描画しても、production の呼び出し元が
//  一度も渡していなければ本番ではデッド、という #620 の議論と整合させるため）。
const jsFiles = allFiles.filter(
  (f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f)
);

const jsFileCache = new Map();
function readJs(file) {
  if (!jsFileCache.has(file)) jsFileCache.set(file, fs.readFileSync(file, 'utf8'));
  return jsFileCache.get(file);
}

// ---------------------------------------------------------------------------
// import 解決（別名 import 対応）
// ---------------------------------------------------------------------------

// moduleAbsPath -> [{ file, localName }]
const importersByModule = new Map();
const IMPORT_RE = /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g;

for (const jsFile of jsFiles) {
  const text = readJs(jsFile);
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    const [, localName, importPath] = m;
    const abs = path.resolve(path.dirname(jsFile), importPath);
    if (!importersByModule.has(abs)) importersByModule.set(abs, []);
    importersByModule.get(abs).push({ file: jsFile, localName });
  }
}

// ---------------------------------------------------------------------------
// CSS 解析（深さ0のルールのみ。@media 等ネストは対象外＝誤検出を避けるため保守的にスキップ）
// ---------------------------------------------------------------------------

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function parseTopLevelRules(css) {
  const text = stripComments(css);
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) {
        const selectorText = text.slice(selectorStart, i);
        if (!selectorText.trim().startsWith('@')) {
          const line = text.slice(0, selectorStart).split('\n').length;
          rules.push({ selectorText, line });
        }
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) selectorStart = i + 1;
    }
  }
  return rules;
}

const CLASS_TOKEN_RE = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;

function classTokensOf(selector) {
  const tokens = [];
  let m;
  CLASS_TOKEN_RE.lastIndex = 0;
  while ((m = CLASS_TOKEN_RE.exec(selector))) tokens.push(m[1]);
  return tokens;
}

// ---------------------------------------------------------------------------
// 参照判定
// ---------------------------------------------------------------------------

function isReferenced(localName, className, text) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dot = new RegExp(`${localName}\\.${escaped}\\b`);
  const bracket = new RegExp(`${localName}\\[['"]${escaped}['"]\\]`);
  return dot.test(text) || bracket.test(text);
}

function hasDynamicAccess(localName, text) {
  // styles[expr] で expr がリテラル文字列でない（テンプレートリテラル・変数）場合を検出。
  const re = new RegExp(`${localName}\\[(?!['"])`);
  return re.test(text);
}

// ---------------------------------------------------------------------------
// 監査本体
// ---------------------------------------------------------------------------

const results = [];

for (const cssFile of cssModules) {
  const importers = importersByModule.get(cssFile) || [];
  const relCss = path.relative(path.resolve(__dirname, '..'), cssFile).replace(/\\/g, '/');

  if (importers.length === 0) {
    results.push({
      file: relCss,
      line: null,
      selector: '(module 全体)',
      status: 'no-importer',
      note: 'この .module.css を import している production ファイルが見つからない',
    });
    continue;
  }

  const dynamic = importers.some(({ file, localName }) => hasDynamicAccess(localName, readJs(file)));

  const css = fs.readFileSync(cssFile, 'utf8');
  const rules = parseTopLevelRules(css);

  for (const rule of rules) {
    const selectors = rule.selectorText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const selector of selectors) {
      const tokens = [...new Set(classTokensOf(selector))];
      if (tokens.length === 0) continue; // 要素セレクタのみ等（.container img の "img" 側は対象外）

      const unreferenced = tokens.filter(
        (cls) => !importers.some(({ file, localName }) => isReferenced(localName, cls, readJs(file)))
      );

      if (unreferenced.length === 0) continue;

      results.push({
        file: relCss,
        line: rule.line,
        selector,
        status: dynamic ? 'dynamic' : 'D1-candidate',
        note: dynamic
          ? `動的アクセスあり（styles[...] 変数式）。手動照合が必要: ${unreferenced.join(', ')}`
          : `未参照クラス: ${unreferenced.join(', ')}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const candidates = results.filter((r) => r.status === 'D1-candidate');
const dynamicFlags = results.filter((r) => r.status === 'dynamic');
const noImporter = results.filter((r) => r.status === 'no-importer');

function printTable(rows, title) {
  if (rows.length === 0) return;
  console.log(`\n## ${title} (${rows.length})\n`);
  for (const r of rows) {
    const loc = r.line ? `${r.file}:${r.line}` : r.file;
    console.log(`- ${loc}  ${r.selector}  — ${r.note}`);
  }
}

console.log(`cssDeadRules: ${cssModules.length} module(s) scanned.`);
printTable(candidates, 'D1 候補（production consumer なし）');
printTable(dynamicFlags, '動的アクセスあり（要手動照合）');
printTable(noImporter, 'import 元が見つからないモジュール');

console.log(
  `\n合計: D1候補 ${candidates.length} 件 / 動的アクセス要確認 ${dynamicFlags.length} 件 / import元なし ${noImporter.length} 件`
);
console.log(
  '\n注意: D2（構造上到達しない子孫セレクタ等）・D3（分岐で実行時に到達しない）はこのスクリプトでは検出できません。'
  + ' 上記候補は出発点であり、削除前に必ず consumer を実読して判定してください（doc/FrontendDesign.md §7.6 参照）。'
);

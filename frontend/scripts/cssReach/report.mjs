#!/usr/bin/env node
/**
 * report.mjs — CSS ランタイム到達性ゲート（#634）の判定。
 *
 * `vitest run --config vitest.css-reach.config.js` が書き出したテストファイル単位の計測結果を
 * マージし、未到達セレクタ・判定不能セレクタ・どのテストにも読み込まれなかった module.css が
 * 1件でもあれば一覧を出して exit 1 にする。除外リスト（allowlist）は持たない。
 * 擬似・状態セレクタは selectors.js の toReachabilityProbe で機械的に照合済み。
 *
 * 使い方: npm run audit:css:runtime （frontend/ 配下で実行。pre-commit フック frontend-css-reach）
 */
import fs from 'node:fs';
import path from 'node:path';
import { findUnreached } from './findUnreached.js';
import { readableSelector } from './selectors.js';
import { FRONTEND_ROOT, OUT_DIR, toFrontendRelative } from './paths.js';

const resultFiles = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')) : [];
if (resultFiles.length === 0) {
  console.error(`css-reach: 計測結果がありません（${toFrontendRelative(OUT_DIR)}）。npm run audit:css:runtime で実行してください。`);
  process.exit(1);
}
const perFile = resultFiles.map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')));

const cssModuleFiles = fs
  .readdirSync(path.join(FRONTEND_ROOT, 'src'), { recursive: true })
  .filter((f) => f.endsWith('.module.css'))
  .map((f) => toFrontendRelative(path.join(FRONTEND_ROOT, 'src', f)))
  .sort();

const { unreachedSelectors, invalidSelectors, unloadedModules } = findUnreached(perFile, cssModuleFiles);
const total = new Set(perFile.flat().map((r) => `${r.source}\u0000${r.selector}`)).size;

if (unreachedSelectors.length === 0 && invalidSelectors.length === 0 && unloadedModules.length === 0) {
  console.log(`css-reach: OK — ${cssModuleFiles.length} module.css / ${total} セレクタすべてがテストで到達しました。`);
  process.exit(0);
}

console.error('css-reach: FAIL — テストで一度も DOM に一致しない CSS があります。');
console.error('対処は2択: 本番で到達する分岐ならその振る舞いを検証するテストを書く／本番で到達しないなら CSS（と JSX）ごと消す。');
console.error('（doc/FrontendDesign.md §7.6。allowlist は作らない）\n');
for (const { source, selector } of unreachedSelectors) {
  console.error(`  未到達    ${source}  ${readableSelector(selector)}`);
}
for (const { source, selector, error } of invalidSelectors) {
  console.error(`  判定不能  ${source}  ${readableSelector(selector)}  (${error})`);
}
for (const source of unloadedModules) {
  console.error(`  未読込    ${source}  （どのテストからも import されていない）`);
}
process.exit(1);

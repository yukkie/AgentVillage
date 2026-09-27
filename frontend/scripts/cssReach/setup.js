/**
 * setup.js — CSS ランタイム到達性ゲート（#634）の vitest setupFile。
 * `vitest.css-reach.config.js` からのみ読み込む（通常の `npm test` には載せない）。
 *
 * DOM が変わるたびに（MutationObserver）、読み込み済みの `*.module.css` の各セレクタが
 * 一度でも実 DOM に一致したかを記録し、テストファイル終了時に JSON で書き出す。
 * `afterEach` で評価してはいけない: Testing Library の cleanup でアンマウントされた後になり、
 * 描画されたルールも含めて全部「未到達」と誤検出する（doc/FrontendDesign.md §7.6）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { splitSelectorList, toReachabilityProbe } from './selectors.js';
import { OUT_DIR, toFrontendRelative } from './paths.js';

// key: `${source}\0${selector}` -> { source, selector, probe, matched, error }
const records = new Map();

function* styleRules(rules) {
  for (const rule of rules) {
    if (rule.selectorText !== undefined) yield rule;
    else if (rule.cssRules) yield* styleRules(rule.cssRules); // @media 等の入れ子
  }
}

function sheetSource(sheet) {
  const id = sheet.ownerNode?.getAttribute?.('data-vite-dev-id');
  if (!id || !id.endsWith('.module.css')) return null;
  return toFrontendRelative(id);
}

function sweep() {
  for (const sheet of document.styleSheets) {
    const source = sheetSource(sheet);
    if (!source) continue;
    for (const rule of styleRules(sheet.cssRules)) {
      for (const selector of splitSelectorList(rule.selectorText)) {
        const key = `${source}\u0000${selector}`;
        let rec = records.get(key);
        if (!rec) {
          rec = { source, selector, probe: toReachabilityProbe(selector), matched: false, error: null };
          records.set(key, rec);
        }
        if (rec.matched) continue;
        try {
          if (document.querySelector(rec.probe)) rec.matched = true;
        } catch (e) {
          rec.error = `${e.name}: ${e.message}`.slice(0, 200);
        }
      }
    }
  }
}

new MutationObserver(sweep).observe(document, { childList: true, subtree: true, attributes: true });

afterAll(() => {
  sweep();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const name = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const out = [...records.values()].map(({ source, selector, matched, error }) => ({ source, selector, matched, error }));
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(out));
});

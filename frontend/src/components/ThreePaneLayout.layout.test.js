import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = __dirname;
const screensDir = path.resolve(__dirname, '../screens');

function readCss(relativePath) {
  const baseDir = relativePath.startsWith('screens/') ? screensDir : componentsDir;
  const cssPath = relativePath.replace(/^screens\//, '');
  return fs.readFileSync(path.join(baseDir, cssPath), 'utf8');
}

function ruleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? '';
}

function expectDeclaration(block, property, value) {
  expect(block.replace(/\s+/g, ' ')).toContain(`${property}: ${value}`);
}

describe('ThreePaneLayout height contract', () => {
  it('keeps viewport height ownership in SpectatorScreen frame', () => {
    /**
     * SUT: SpectatorScreen.module.css / ThreePaneLayout.module.css
     * Mock: なし
     * Level: unit
     * Objective: ブラウザ由来の viewport height を SpectatorScreen frame だけが所有することを検証する。
     */
    const spectatorCss = readCss('screens/SpectatorScreen.module.css');
    const layoutCss = readCss('ThreePaneLayout.module.css');

    expectDeclaration(ruleBlock(spectatorCss, '.frame'), 'height', '100vh');
    expect(layoutCss).not.toContain('100vh');
  });

  it('allows panes to shrink inside their parent instead of expanding to fit feed content', () => {
    /**
     * SUT: ThreePaneLayout.module.css
     * Mock: なし
     * Level: unit
     * Objective: 3ペインがコンテンツ高さではなく親から与えられた高さに閉じる制約を持つことを検証する。
     */
    const css = readCss('ThreePaneLayout.module.css');

    expectDeclaration(ruleBlock(css, '.shell'), 'min-height', '0');
    expectDeclaration(ruleBlock(css, '.shell'), 'overflow', 'hidden');
    expectDeclaration(ruleBlock(css, '.colLeft'), 'min-height', '0');
    expectDeclaration(ruleBlock(css, '.colCenter'), 'min-height', '0');
    expectDeclaration(ruleBlock(css, '.colCenter'), 'min-width', '0');
    expectDeclaration(ruleBlock(css, '.colCenter'), 'overflow', 'hidden');
    expectDeclaration(ruleBlock(css, '.colRight'), 'min-height', '0');
  });

  it('keeps the speech feed as the scrolling area within the center pane', () => {
    /**
     * SUT: SpectatorScreen.module.css
     * Mock: なし
     * Level: unit
     * Objective: 中央フィードが残り高さの中でスクロールする領域として定義されることを検証する。
     */
    const css = readCss('screens/SpectatorScreen.module.css');
    const feed = ruleBlock(css, '.feed');

    expectDeclaration(feed, 'flex', '1');
    expectDeclaration(feed, 'min-height', '0');
    expectDeclaration(feed, 'overflow-y', 'auto');
  });
});

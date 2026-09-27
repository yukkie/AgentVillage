import { describe, expect, it } from 'vitest';
import { readableSelector, splitSelectorList, toReachabilityProbe } from './selectors.js';

describe('cssReach selectors (#634)', () => {
  it('pure: splitSelectorList: 括弧内のカンマでは分割しない', () => {
    /*
    SUT: splitSelectorList
    Mock: なし
    Level: unit
    Objective: グループセレクタをトップレベルのカンマでだけ分割し、:not(.a, .b) のような括弧内のカンマは保持することを検証する。
    */
    expect(splitSelectorList('.a, .b > .c ,.d:not(.e, .f)')).toEqual(['.a', '.b > .c', '.d:not(.e, .f)']);
    expect(splitSelectorList('.solo')).toEqual(['.solo']);
  });

  it('pure: toReachabilityProbe: 状態擬似クラスと擬似要素を取り除き構造擬似クラスは残す', () => {
    /*
    SUT: toReachabilityProbe
    Mock: なし
    Level: unit
    Objective: jsdom の静的レンダリングでは一致しない状態擬似クラス・擬似要素だけを機械的に取り除き、jsdom が評価できる構造擬似クラス（:not/:disabled 等）は照合対象に残すことを検証する。
    */
    expect(toReachabilityProbe('.btn:hover')).toBe('.btn');
    expect(toReachabilityProbe('.link:focus-visible')).toBe('.link');
    expect(toReachabilityProbe('.dayBlock:hover .phaseList')).toBe('.dayBlock .phaseList');
    expect(toReachabilityProbe('.phaseItem:hover:not(.active)')).toBe('.phaseItem:not(.active)');
    expect(toReachabilityProbe('.createBtn:not(:disabled):hover')).toBe('.createBtn:not(:disabled)');
    expect(toReachabilityProbe('.spThink summary::marker')).toBe('.spThink summary');
    expect(toReachabilityProbe('.spThink summary::-webkit-details-marker')).toBe('.spThink summary');
    expect(toReachabilityProbe('.q:before')).toBe('.q');
    expect(toReachabilityProbe('.row:first-child')).toBe('.row:first-child');
    expect(toReachabilityProbe('.a:focus-within > .b:active')).toBe('.a > .b');
    expect(toReachabilityProbe('.plain .selector')).toBe('.plain .selector');
  });

  it('pure: toReachabilityProbe: 状態擬似クラスだけの複合セレクタは * で補う', () => {
    /*
    SUT: toReachabilityProbe
    Mock: なし
    Level: unit
    Objective: 状態擬似クラスを取り除いた結果、複合セレクタが空になる場合（先頭・結合子直後）は * で補い、構文として有効な照合セレクタを返すことを検証する。
    */
    expect(toReachabilityProbe(':hover')).toBe('*');
    expect(toReachabilityProbe('.a > :hover')).toBe('.a > *');
    expect(toReachabilityProbe('.a :focus-visible::after')).toBe('.a *');
    expect(toReachabilityProbe('.a:not(:hover)')).toBe('.a');
  });
});

describe('cssReach readableSelector (#634)', () => {
  it('pure: readableSelector: CSS Modules のハッシュ付きクラス名を元のクラス名に戻す', () => {
    /*
    SUT: readableSelector
    Mock: なし
    Level: unit
    Objective: vitest の stable 命名（_name_hash）で出力されたクラス名を、レポート表示用に元のクラス名へ戻すことを検証する。
    */
    expect(readableSelector('._scoreList_126856._threat_126856 ._scoreItem_126856 ._score_fill_126856'))
      .toBe('.scoreList.threat .scoreItem .score_fill');
    expect(readableSelector('._crumb_6fb764 a:hover')).toBe('.crumb a:hover');
  });
});

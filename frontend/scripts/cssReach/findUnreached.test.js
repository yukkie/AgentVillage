import { describe, expect, it } from 'vitest';
import { findUnreached } from './findUnreached.js';

const rec = (source, selector, matched, error = null) => ({ source, selector, matched, error });

describe('cssReach findUnreached (#634)', () => {
  it('pure: findUnreached: いずれかのテストファイルで一致したセレクタは到達扱いにする', () => {
    /*
    SUT: findUnreached
    Mock: なし
    Level: unit
    Objective: テストファイルごとの計測結果のうち1ファイルでも matched なら、他ファイルで未一致でも到達扱いにする（ファイル横断マージ）ことを検証する。
    */
    const perFile = [
      [rec('src/A.module.css', '._x_1', false)],
      [rec('src/A.module.css', '._x_1', true)],
    ];
    const result = findUnreached(perFile, ['src/A.module.css']);
    expect(result).toEqual({ unreachedSelectors: [], invalidSelectors: [], unloadedModules: [] });
  });

  it('pure: findUnreached: どのテストファイルでも一致しなかったセレクタを未到達として返す', () => {
    /*
    SUT: findUnreached
    Mock: なし
    Level: unit
    Objective: 全ファイルで未一致のセレクタを未到達として返し、querySelector が例外を投げたまま一度も一致しなかったセレクタは判定不能として別枠で返すことを検証する。
    */
    const perFile = [
      [rec('src/A.module.css', '._live_1', true), rec('src/A.module.css', '._dead_1', false)],
      [rec('src/A.module.css', '._dead_1', false), rec('src/A.module.css', '._bad_1:has(', false, 'SyntaxError')],
    ];
    const result = findUnreached(perFile, ['src/A.module.css']);
    expect(result.unreachedSelectors).toEqual([{ source: 'src/A.module.css', selector: '._dead_1' }]);
    expect(result.invalidSelectors).toEqual([{ source: 'src/A.module.css', selector: '._bad_1:has(', error: 'SyntaxError' }]);
    expect(result.unloadedModules).toEqual([]);
  });

  it('pure: findUnreached: どのテストにも読み込まれなかった module.css をファイル単位で未到達にする', () => {
    /*
    SUT: findUnreached
    Mock: なし
    Level: unit
    Objective: 静的に列挙した module.css のうち、どのテストファイルの計測結果にも出所として現れなかったファイルを unloadedModules として返すことを検証する。
    */
    const perFile = [[rec('src/A.module.css', '._x_1', true)]];
    const result = findUnreached(perFile, ['src/A.module.css', 'src/B.module.css']);
    expect(result.unloadedModules).toEqual(['src/B.module.css']);
    expect(result.unreachedSelectors).toEqual([]);
  });
});

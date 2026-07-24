import { describe, expect, it } from 'vitest';
import { toggleInSet } from './toggleInSet.js';

describe('toggleInSet', () => {
  it('pure: toggleInSet: 要素があれば削除した新しい Set を返す', () => {
    /*
    SUT: toggleInSet()
    Mock: なし
    Level: unit
    Objective: 入力 Set に要素が既にあれば、その要素を除いた新しい Set を返すことを検証する。
    */
    const input = new Set(['Alice', 'Bob']);
    const result = toggleInSet(input, 'Alice');
    expect(result).toEqual(new Set(['Bob']));
  });

  it('pure: toggleInSet: 要素がなければ追加した新しい Set を返す', () => {
    /*
    SUT: toggleInSet()
    Mock: なし
    Level: unit
    Objective: 入力 Set に要素がなければ、その要素を追加した新しい Set を返すことを検証する。
    */
    const input = new Set(['Alice']);
    const result = toggleInSet(input, 'Bob');
    expect(result).toEqual(new Set(['Alice', 'Bob']));
  });

  it('pure: toggleInSet: 入力 Set を破壊しない（新インスタンスを返す）', () => {
    /*
    SUT: toggleInSet()
    Mock: なし
    Level: unit
    Objective: toggleInSet が入力 Set を変更せず、常に新しい Set インスタンスを返すことを検証する。
    */
    const input = new Set(['Alice']);
    const result = toggleInSet(input, 'Bob');
    expect(input).toEqual(new Set(['Alice']));
    expect(result).not.toBe(input);
  });
});

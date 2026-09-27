import { describe, expect, it } from 'vitest';
import ROLES from '../config/roles.json';
import { PLAYER_COUNT_RULES, matchesPlayerCountRule } from './playerCountRule.js';

describe('PLAYER_COUNT_RULES', () => {
  it('pure: PLAYER_COUNT_RULES: roles.json のキーを数値昇順で返す', () => {
    /*
    SUT: PLAYER_COUNT_RULES
    Mock: なし
    Level: unit
    Objective: ルール項目が roles.json（SSOT）のキーを数値化・昇順に並べたものと一致することを検証する (#623 AC-1)
    */
    const expected = Object.keys(ROLES).map(Number).sort((a, b) => a - b);
    expect(expected.length).toBeGreaterThan(0);
    expect(PLAYER_COUNT_RULES).toEqual(expected);
  });
});

describe('matchesPlayerCountRule', () => {
  it('pure: matchesPlayerCountRule: rule が null なら常に true、数値なら cast 人数一致のみ true', () => {
    /*
    SUT: matchesPlayerCountRule()
    Mock: なし
    Level: unit
    Objective: 未選択（null）は全ゲームを通し、人数指定時は cast 人数が一致するゲームだけを通すことを検証する (#623 AC-3)
    */
    const five = { cast: ['A', 'B', 'C', 'D', 'E'] };
    const twelve = { cast: Array.from({ length: 12 }, (_, i) => `P${i}`) };

    expect(matchesPlayerCountRule(five, null)).toBe(true);
    expect(matchesPlayerCountRule(twelve, null)).toBe(true);
    expect(matchesPlayerCountRule(five, 5)).toBe(true);
    expect(matchesPlayerCountRule(five, 11)).toBe(false);
    // #303 以前の汚染アーカイブ（roles.json に無い人数）はどのルールにも一致しない
    expect(PLAYER_COUNT_RULES.some(rule => matchesPlayerCountRule(twelve, rule))).toBe(false);
  });
});

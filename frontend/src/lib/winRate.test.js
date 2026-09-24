import { describe, it, expect } from 'vitest';
import { winRate, formatWinRate } from './winRate.js';

describe('winRate', () => {
  it('pure: winRate: 勝数と出場数から四捨五入した勝率(%)を返す', () => {
    /*
    SUT: winRate
    Mock: なし
    Level: unit
    Objective: wins / games を百分率に四捨五入して返すことを検証する (#629 AC-1/AC-2)
    */
    expect(winRate(2, 3)).toBe(67);
    expect(winRate(0, 4)).toBe(0);
    expect(winRate(5, 5)).toBe(100);
  });

  it('pure: winRate: 出場0回は null を返す', () => {
    /*
    SUT: winRate
    Mock: なし
    Level: unit
    Objective: 母数 0 で NaN / Infinity / 0 ではなく null（データなし）を返すことを検証する (#629 AC-6)
    */
    expect(winRate(0, 0)).toBeNull();
  });
});

describe('formatWinRate', () => {
  it('pure: formatWinRate: 数値は % 付き、null はデータなし表記を返す', () => {
    /*
    SUT: formatWinRate
    Mock: なし
    Level: unit
    Objective: 勝率の表示文字列が数値なら "67%"、null なら "—"（0% にしない）になることを検証する (#629 AC-6)
    */
    expect(formatWinRate(67)).toBe('67%');
    expect(formatWinRate(0)).toBe('0%');
    expect(formatWinRate(null)).toBe('—');
  });
});

import { describe, it, expect } from 'vitest';
import { phaseHeading } from './phaseHeading.js';

describe('phaseHeading', () => {
  it('pure: phaseHeading: game_over は「勝敗結果」を返す', () => {
    /*
     * SUT: phaseHeading
     * Mock: なし
     * Level: unit
     * Objective: phase='game_over' のとき day に関わらず「勝敗結果」を返すことを検証する。
     */
    expect(phaseHeading(3, 'game_over')).toBe('勝敗結果');
  });

  it('pure: phaseHeading: eve は「前夜 プロローグ」を返す', () => {
    /*
     * SUT: phaseHeading
     * Mock: なし
     * Level: unit
     * Objective: phase='eve' のとき day に関わらず「前夜 プロローグ」を返すことを検証する。
     */
    expect(phaseHeading(1, 'eve')).toBe('前夜 プロローグ');
  });

  it.each([
    ['discuss', 2, 'Day 2 議論'],
    ['vote', 2, 'Day 2 投票・処刑'],
    ['night', 2, 'Day 2 夜フェーズ'],
  ])('pure: phaseHeading: phase=%s は Day n + フェーズ名を返す', (phase, day, expected) => {
    /*
     * SUT: phaseHeading
     * Mock: なし
     * Level: unit
     * Objective: discuss/vote/night の各フェーズで `Day {day} {ラベル}` 形式の文字列を返すことを検証する。
     */
    expect(phaseHeading(day, phase)).toBe(expected);
  });

  it('pure: phaseHeading: 未知 phase では Day n undefined を返す（既存挙動保存）', () => {
    /*
     * SUT: phaseHeading
     * Mock: なし
     * Level: unit
     * Objective: 未知の phase 値では DAY_PHASE_LABEL に存在せず undefined を埋め込んだ文字列になる、
     * 既存インライン三項式と同じ挙動を保存していることを検証する（AC-4: フォールバックを足さない）。
     */
    expect(phaseHeading(1, 'unknown_phase')).toBe('Day 1 undefined');
  });
});

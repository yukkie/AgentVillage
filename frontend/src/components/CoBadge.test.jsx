import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CoBadge from './CoBadge.jsx';

afterEach(() => {
  cleanup();
});

describe('CoBadge', () => {
  it('統合: CoBadge: role の日本語名と ▶ … CO 文言を表示する', () => {
    /*
     * SUT: CoBadge
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: role_meta にある役職キーを渡すと日本語名を含む「▶ {ja} CO」文言を表示することを検証する。
     */
    render(<CoBadge role="Seer" />);

    expect(screen.getByText(/▶.*占い師.*CO/)).toBeTruthy();
  });

  it('統合: CoBadge: ROLE_META にない role は生キーをそのまま表示する', () => {
    /*
     * SUT: CoBadge
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: ROLE_META_BY_KEY に存在しない role キーでも生キー文字列をそのまま CO バッジに表示することを検証する（防御フォールバック。AC-4 既存挙動保存）。
     */
    render(<CoBadge role="UnknownRole" />);

    expect(screen.getByText(/▶.*UnknownRole.*CO/)).toBeTruthy();
  });

  it('統合: CoBadge: role が falsy なら何も描画しない', () => {
    /*
     * SUT: CoBadge
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: role が undefined/null/空文字のとき何も DOM を描画しないことを検証する。
     */
    const { container } = render(<CoBadge role={undefined} />);

    expect(container.firstChild).toBeNull();
  });

  it('統合: CoBadge: role の色を --co-color CSS 変数に渡す', () => {
    /*
     * SUT: CoBadge
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: role_meta の color を --co-color インラインスタイル変数として設定することを検証する（jsdom は計算済みスタイルを評価しないため getPropertyValue で読む）。
     */
    render(<CoBadge role="Seer" />);

    const badge = screen.getByText(/▶.*占い師.*CO/);
    expect(badge.style.getPropertyValue('--co-color')).toBeTruthy();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ThreePaneLayout from './ThreePaneLayout.jsx';

afterEach(() => {
  cleanup();
});

describe('ThreePaneLayout landmark semantics', () => {
  it('renders the center pane as the main landmark', () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: component
    Objective: 中央ペインが main landmark としてレンダリングされ、children を内包することを検証する。
    */
    render(
      <ThreePaneLayout left={<p>L</p>} right={<p>R</p>}>
        <p>center content</p>
      </ThreePaneLayout>
    );

    const main = screen.getByRole('main');
    expect(main).toBeTruthy();
    expect(main.textContent).toContain('center content');
  });

  it('renders left and right panes as complementary landmarks distinguished by aria-label', () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: component
    Objective: 左右ペインが aria-label 付き complementary landmark として個別に特定できることを検証する。
    */
    render(
      <ThreePaneLayout
        left={<p>left content</p>}
        right={<p>right content</p>}
        leftAriaLabel="タイムライン"
        rightAriaLabel="ロスター"
      >
        <p>center</p>
      </ThreePaneLayout>
    );

    const left = screen.getByRole('complementary', { name: 'タイムライン' });
    const right = screen.getByRole('complementary', { name: 'ロスター' });

    expect(left.textContent).toContain('left content');
    expect(right.textContent).toContain('right content');
  });

  it('falls back to default aria-labels when none are provided', () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: component
    Objective: aria-label 未指定時にデフォルト値が付き、左右の complementary landmark が依然区別できることを検証する。
    */
    render(
      <ThreePaneLayout left={<p>L</p>} right={<p>R</p>}>
        <p>center</p>
      </ThreePaneLayout>
    );

    expect(screen.getByRole('complementary', { name: '左サイドパネル' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '右サイドパネル' })).toBeTruthy();
  });
});

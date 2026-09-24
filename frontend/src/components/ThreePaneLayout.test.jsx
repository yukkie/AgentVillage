import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreePaneLayout from './ThreePaneLayout.jsx';
import styles from './ThreePaneLayout.module.css';

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

describe('ThreePaneLayout collapsed rail label', () => {
  it('統合: ThreePaneLayout: leftLabel を渡すと折りたたみ時のみ rail が描画される', async () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: integration
    Objective: leftLabel 指定時、開いている間は rail が存在せず、折りたたみボタンをクリックした後にのみ
      rail 要素としてラベルテキストが描画されることを検証する（組み合わせ境界: collapsibleLeft × leftOpen）。
    */
    const user = userEvent.setup();
    render(
      <ThreePaneLayout left={<p>L</p>} right={<p>R</p>} collapsibleLeft leftLabel="フィルタ">
        <p>center</p>
      </ThreePaneLayout>
    );

    expect(document.querySelector(`.${styles.rail}`)).toBeNull();

    await user.click(screen.getByRole('button', { name: '左ペインを閉じる' }));

    const rail = document.querySelector(`.${styles.rail}`);
    expect(rail).toBeTruthy();
    expect(rail.textContent).toBe('フィルタ');
  });

  it('統合: ThreePaneLayout: rightLabel を渡すと折りたたみ時のみ rail が描画される', async () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: integration
    Objective: rightLabel 指定時、右ペイン折りたたみボタンをクリックした後にのみ
      rail 要素としてラベルテキストが描画されることを検証する。
    */
    const user = userEvent.setup();
    render(
      <ThreePaneLayout left={<p>L</p>} right={<p>R</p>} collapsibleRight rightLabel="ロースター">
        <p>center</p>
      </ThreePaneLayout>
    );

    expect(document.querySelector(`.${styles.rail}`)).toBeNull();

    await user.click(screen.getByRole('button', { name: '右ペインを閉じる' }));

    const rail = document.querySelector(`.${styles.rail}`);
    expect(rail).toBeTruthy();
    expect(rail.textContent).toBe('ロースター');
  });

  it('統合: ThreePaneLayout: leftLabel を渡さない場合は折りたたみ時も rail が描画されない', async () => {
    /*
    SUT: ThreePaneLayout
    Mock: なし
    Level: integration
    Objective: leftLabel 未指定（従来どおりの呼び出し）では、折りたたみ後も rail が描画されないことを
      回帰確認する（既存呼び出し元の挙動を変えないことの担保）。
    */
    const user = userEvent.setup();
    render(
      <ThreePaneLayout left={<p>L</p>} right={<p>R</p>} collapsibleLeft>
        <p>center</p>
      </ThreePaneLayout>
    );

    await user.click(screen.getByRole('button', { name: '左ペインを閉じる' }));

    expect(document.querySelector(`.${styles.rail}`)).toBeNull();
  });
});

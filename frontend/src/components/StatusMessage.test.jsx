import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatusMessage from './StatusMessage.jsx';
import styles from './StatusMessage.module.css';

afterEach(() => {
  cleanup();
});

describe('StatusMessage', () => {
  it('統合: StatusMessage: kind="loading" は data-status="loading" と loading クラスを付与する', () => {
    /*
     * SUT: StatusMessage
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: kind="loading" のとき data-status 属性と内部 loading クラスが付与されることを検証する (AC-3)。
     */
    const { container } = render(<StatusMessage kind="loading">読み込み中…</StatusMessage>);
    const el = container.querySelector('div');

    expect(el.getAttribute('data-status')).toBe('loading');
    expect(el.classList.contains(styles.loading)).toBe(true);
  });

  it('統合: StatusMessage: kind="error" は data-status="error" と error クラスを付与する', () => {
    /*
     * SUT: StatusMessage
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: kind="error" のとき data-status 属性と内部 error クラスが付与されることを検証する (AC-3)。
     */
    const { container } = render(<StatusMessage kind="error">読み込めませんでした。</StatusMessage>);
    const el = container.querySelector('div');

    expect(el.getAttribute('data-status')).toBe('error');
    expect(el.classList.contains(styles.error)).toBe(true);
  });

  it('統合: StatusMessage: className prop を内部クラスと結合する', () => {
    /*
     * SUT: StatusMessage
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: 呼び出し側が渡す className が内部 styles.status と結合されて要素に付与されることを検証する (AC-3)。
     */
    const { container } = render(
      <StatusMessage kind="loading" className="callerLayout">読み込み中…</StatusMessage>
    );
    const el = container.querySelector('div');

    expect(el.classList.contains(styles.status)).toBe(true);
    expect(el.classList.contains('callerLayout')).toBe(true);
  });

  it('統合: StatusMessage: children をそのまま本文として描画する', () => {
    /*
     * SUT: StatusMessage
     * Mock: なし（plain props を入力）
     * Level: integration
     * Objective: children に渡した文言を部品が固定文言に置き換えず、そのまま描画することを検証する (AC-3/AC-5)。
     */
    render(<StatusMessage kind="error">戦績を読み込めませんでした。</StatusMessage>);

    expect(screen.getByText('戦績を読み込めませんでした。')).toBeTruthy();
  });
});

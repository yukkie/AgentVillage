import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RoleTag from './RoleTag.jsx';
import styles from './RoleTag.module.css';

afterEach(() => {
  cleanup();
});

describe('RoleTag', () => {
  it('unit: RoleTag: className を styles.tag と結合して透過する', () => {
    /*
     * SUT: RoleTag
     * Mock: なし（plain props を入力）
     * Level: unit
     * Objective: className prop が内部 styles.tag と結合されて要素に付与されることを検証する (AC-4)。
     */
    const { container } = render(<RoleTag role="Seer" className="callerLayout" />);
    const el = container.querySelector('span');

    expect(el.classList.contains(styles.tag)).toBe(true);
    expect(el.classList.contains('callerLayout')).toBe(true);
  });

  it('unit: RoleTag: 未知の役職キーは生キーをフォールバック表示する', () => {
    /*
     * SUT: RoleTag
     * Mock: なし（plain props を入力）
     * Level: unit
     * Objective: ROLE_META_BY_KEY にない役職キーでも null を返さず、生キーをそのままバッジ表示することを検証する (AC-7)。
     */
    render(<RoleTag role="UnknownRole" />);

    expect(screen.getByText('UnknownRole')).toBeTruthy();
  });

  it('unit: RoleTag: role が falsy なら何も描画しない', () => {
    /*
     * SUT: RoleTag
     * Mock: なし（plain props を入力）
     * Level: unit
     * Objective: role が falsy（null/undefined/''）のとき何も描画しないことを検証する。
     */
    const { container: c1 } = render(<RoleTag role={null} />);
    expect(c1.firstChild).toBeNull();

    cleanup();
    const { container: c2 } = render(<RoleTag role={undefined} />);
    expect(c2.firstChild).toBeNull();

    cleanup();
    const { container: c3 } = render(<RoleTag role="" />);
    expect(c3.firstChild).toBeNull();
  });

  it('unit: RoleTag: 既知の役職キーは日本語名をバッジ表示する', () => {
    /*
     * SUT: RoleTag
     * Mock: なし（plain props を入力）
     * Level: unit
     * Objective: ROLE_META_BY_KEY にある役職キーは従来どおり ja 名でバッジ表示されることを検証する（退行防止）。
     */
    const { container } = render(<RoleTag role="Seer" />);
    const el = container.querySelector('span');

    expect(screen.getByText('占い師')).toBeTruthy();
    expect(el.classList.contains(styles.tag)).toBe(true);
  });
});

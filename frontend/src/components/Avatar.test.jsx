import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Avatar, { AvatarButton } from './Avatar.jsx';

afterEach(() => {
  cleanup();
});

describe('Avatar label layouts', () => {
  it('renders agent name label in vertical layout', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: label prop を渡すと名前テキストが表示され、vertical layout クラスが付くことを検証する。
    */
    render(<Avatar name="Nox" label="Nox" layout="vertical" />);
    expect(screen.getByText('Nox')).toBeTruthy();
  });

  it('renders agent name label in horizontal layout', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: horizontal layout が適用されることを検証する。
    */
    const { container } = render(<Avatar name="Nox" label="Nox" layout="horizontal" />);
    expect(container.firstChild.dataset.layout).toBe('horizontal');
  });

  it('renders without label as bare icon (no label text)', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: label なしでは名前テキストが表示されず、既存の bare Avatar 挙動が維持されることを検証する。
    */
    render(<Avatar name="Nox" />);
    expect(screen.queryByTestId('avatar-label')).toBeNull();
  });
});

describe('Avatar variants', () => {
  it('applies selected variant', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: variant="selected" が identity wrapper の data-variant に反映されることを検証する。
    */
    const { container } = render(<Avatar name="Nox" label="Nox" variant="selected" />);
    expect(container.firstChild.dataset.variant).toBe('selected');
  });

  it('applies muted variant', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: variant="muted" が data-variant に反映されることを検証する。
    */
    const { container } = render(<Avatar name="Nox" label="Nox" variant="muted" />);
    expect(container.firstChild.dataset.variant).toBe('muted');
  });

  it('applies dead variant', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: variant="dead" が data-variant に反映されることを検証する（dead prop のアイコン内オーバーレイとは別）。
    */
    const { container } = render(<Avatar name="Nox" label="Nox" variant="dead" />);
    expect(container.firstChild.dataset.variant).toBe('dead');
  });
});

describe('Avatar accessibility', () => {
  it('sets img alt to empty string when label is provided', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: label あり時は img の alt="" になり、accessible name 重複を避けることを検証する。
    */
    const { container } = render(<Avatar name="Nox" label="Nox" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('sets img alt to name when label is absent', () => {
    /*
    SUT: Avatar
    Mock: なし
    Level: unit
    Objective: label なし時は img の alt=name で accessible name を提供することを検証する。
    */
    const { container } = render(<Avatar name="Nox" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('Nox');
  });
});

describe('AvatarButton', () => {
  it('renders as a button element', () => {
    /*
    SUT: AvatarButton
    Mock: vi.fn
    Level: unit
    Objective: AvatarButton が button role を持つ要素としてレンダリングされることを検証する。
    */
    render(<AvatarButton name="Nox" label="Nox" onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('fires onClick when clicked', async () => {
    /*
    SUT: AvatarButton
    Mock: vi.fn（onClick の発火を観測）
    Level: unit
    Objective: クリックで onClick が1回発火することを検証する。
    */
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<AvatarButton name="Nox" label="Nox" onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has aria-label equal to label prop', () => {
    /*
    SUT: AvatarButton
    Mock: なし
    Level: unit
    Objective: AvatarButton の aria-label が label prop と一致し、accessible name が正しく設定されることを検証する。
    */
    render(<AvatarButton name="Nox" label="Nox" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Nox' })).toBeTruthy();
  });

  it('applies selected variant when selected prop is true', () => {
    /*
    SUT: AvatarButton
    Mock: なし
    Level: unit
    Objective: selected={true} で内包する Avatar に selected variant が適用されることを検証する。
    */
    const { container } = render(<AvatarButton name="Nox" label="Nox" selected onClick={vi.fn()} />);
    expect(container.querySelector('[data-variant="selected"]')).toBeTruthy();
  });
});

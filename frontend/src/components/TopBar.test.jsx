import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.jsx';

function renderTopBar(crumbs, children) {
  return render(
    <MemoryRouter>
      <TopBar crumbs={crumbs}>{children}</TopBar>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe('TopBar breadcrumb semantics', () => {
  it('renders breadcrumbs as a navigation landmark', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: パンくず領域が aria-label 付き navigation landmark として特定できることを検証する。
    */
    renderTopBar([{ label: 'r/agent-jinrou', onClick: () => {} }, { label: 'Day 2' }]);

    expect(screen.getByRole('navigation', { name: 'パンくず' })).toBeTruthy();
  });

  it('exposes a clickable crumb as a link and fires onClick on activation', async () => {
    /*
    SUT: TopBar
    Mock: vi.fn（onClick の発火を観測）
    Level: component
    Objective: onClick を持つ中間 crumb が link role を持ち、クリックで onClick が発火し、href="#" のデフォルト遷移が抑止されることを検証する。
    */
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderTopBar([{ label: 'r/agent-jinrou', onClick }, { label: 'Day 2' }]);

    const link = screen.getByRole('link', { name: 'r/agent-jinrou' });
    await user.click(link);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render a crumb without onClick as a link', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: onClick を持たない中間 crumb が link role を持たない（dead link を作らない）ことを検証する退行防止テスト。
    */
    renderTopBar([{ label: '観戦' }, { label: 'Day 2' }]);

    expect(screen.queryByRole('link', { name: '観戦' })).toBeNull();
    expect(screen.getByText('観戦')).toBeTruthy();
  });

  it('marks the last crumb as the current page', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: 最後の crumb（現在地）に aria-current="page" が付くことを検証する。
    */
    renderTopBar([{ label: 'r/agent-jinrou', onClick: () => {} }, { label: 'Day 2' }]);

    const current = screen.getByText('Day 2');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('renders a to-crumb as a router Link', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: to を持つ中間 crumb が link role でレンダリングされることを検証する。
    */
    renderTopBar([{ label: 'r/agent-jinrou', to: '/' }, { label: 'Day 2' }]);

    const link = screen.getByRole('link', { name: 'r/agent-jinrou' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('prefers to over onClick when both are provided', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: to と onClick が両方ある場合、to が優先されて Link としてレンダリングされることを検証する。
    */
    const onClick = vi.fn();
    renderTopBar([{ label: 'home', to: '/', onClick }, { label: 'current' }]);

    const link = screen.getByRole('link', { name: 'home' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('does not linkify the last crumb even when to is provided', () => {
    /*
    SUT: TopBar
    Mock: なし
    Level: component
    Objective: 最後の crumb（現在地）は to が渡っていてもリンク化されないことを検証する。
    */
    renderTopBar([{ label: 'home', to: '/' }, { label: 'current', to: '/current' }]);

    expect(screen.queryByRole('link', { name: 'current' })).toBeNull();
    expect(screen.getByText('current').getAttribute('aria-current')).toBe('page');
  });
});

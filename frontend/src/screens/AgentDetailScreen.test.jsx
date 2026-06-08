import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AgentDetailScreen from './AgentDetailScreen.jsx';

afterEach(() => {
  cleanup();
});

function renderAgent({ sessionId, agentName = 'Nox' } = {}) {
  const path = sessionId
    ? `/game/${sessionId}/agent/${agentName}`
    : `/agent/${agentName}`;
  const routePath = sessionId
    ? '/game/:sessionId/agent/:agentName'
    : '/agent/:agentName';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={<AgentDetailScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AgentDetailScreen semantic structure', () => {
  it('exposes the agent hero as a banner-like header and picker as a list', () => {
    /*
     * SUT: AgentDetailScreen / AgentHero / LeftPane
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
     * Level: component
     * Objective: AgentHero が header、AgentPicker が list/listitem role で特定できることを検証する。
     */
    renderAgent();

    expect(document.querySelector('header')?.textContent).toContain('Nox');
    expect(within(screen.getByRole('list', { name: 'エージェント一覧' })).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('exposes overview thoughts, suspicion matrix, night actions, and history as semantic lists', async () => {
    /*
     * SUT: AgentDetailScreen tab panels
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
     * Level: component
     * Objective: 推論ログ・疑い度マトリクス・夜行動・過去戦績が list/listitem role で特定できることを検証する。
     */
    const user = userEvent.setup();
    renderAgent();

    expect(within(screen.getByRole('list', { name: '直近の推論' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('list', { name: '疑い度マトリクス' })).getAllByRole('listitem')).toHaveLength(8);
    expect(within(screen.getByRole('list', { name: '夜の行動' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '過去の戦績' }));

    expect(within(screen.getByRole('list', { name: '過去の戦績' })).getAllByRole('listitem')).toHaveLength(5);
  });

  it('renders game-scoped breadcrumbs when sessionId is present', () => {
    /*
     * SUT: AgentDetailScreen TopBar crumbs
     * Mock: なし
     * Level: component
     * Objective: /game/:sessionId/agent/:agentName では sessionId が含まれるパンくずが表示されることを検証する。
     */
    renderAgent({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.getByText('test-session-001')).toBeTruthy();
  });

  it('renders global breadcrumbs when sessionId is absent', () => {
    /*
     * SUT: AgentDetailScreen TopBar crumbs
     * Mock: なし
     * Level: component
     * Objective: /agent/:agentName では sessionId なしのパンくずが表示されることを検証する。
     */
    renderAgent({ agentName: 'Nox' });

    expect(screen.queryByText('test-session-001')).toBeNull();
    expect(screen.getAllByText('Nox').length).toBeGreaterThan(0);
  });
});

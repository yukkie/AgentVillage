import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentDetailScreen from './AgentDetailScreen.jsx';

afterEach(() => {
  cleanup();
});

describe('AgentDetailScreen semantic structure', () => {
  it('exposes the agent hero as a banner-like header and picker as a list', () => {
    /*
     * SUT: AgentDetailScreen / AgentHero / LeftPane
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
     * Level: component
     * Objective: AgentHero が header、AgentPicker が list/listitem role で特定できることを検証する。
     */
    render(<AgentDetailScreen />);

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
    render(<AgentDetailScreen />);

    expect(within(screen.getByRole('list', { name: '直近の推論' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('list', { name: '疑い度マトリクス' })).getAllByRole('listitem')).toHaveLength(8);
    expect(within(screen.getByRole('list', { name: '夜の行動' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '過去の戦績' }));

    expect(within(screen.getByRole('list', { name: '過去の戦績' })).getAllByRole('listitem')).toHaveLength(5);
  });
});

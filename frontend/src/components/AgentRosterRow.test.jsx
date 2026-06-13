import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentRosterRow from './AgentRosterRow.jsx';

afterEach(() => {
  cleanup();
});

function renderRow(props = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <AgentRosterRow name="Alice" to="/game/s1/agent/Alice" {...props} />
      </ul>
    </MemoryRouter>
  );
}

describe('AgentRosterRow', () => {
  it('統合: AgentRosterRow: name を表示し to へリンクする', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: name テキストを表示し、行全体が props.to の href を持つ Link としてレンダリングされることを検証する。
     */
    renderRow({ to: '/game/s1/agent/Alice' });

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/game/s1/agent/Alice');
  });

  it('統合: AgentRosterRow: showRole=true で役職タグと Avatar 役職刻印を表示する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: showRole=true のとき真役職（RoleTag・Avatar 役職刻印）が表示されることを検証する。
     */
    const { container } = renderRow({ role: 'Seer', showRole: true });

    expect(screen.getAllByText('占い師').length).toBeGreaterThan(0);
    expect(container.querySelector('[class*="roleTag"]')).toBeTruthy();
  });

  it('統合: AgentRosterRow: showRole=false で役職タグを表示しない', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: showRole=false のとき RoleTag・Avatar 役職刻印を一切表示しないことを検証する（public 役職リーク防止）。
     */
    const { container } = renderRow({ role: 'Seer', showRole: false });

    expect(screen.queryByText('占い師')).toBeNull();
    expect(container.querySelector('[class*="roleTag"]')).toBeNull();
  });

  it('統合: AgentRosterRow: coRole があれば CO バッジを表示する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: coRole が渡されたとき CO 役職バッジ（▶ … CO）を表示することを検証する。
     */
    renderRow({ coRole: 'Seer' });

    expect(screen.getByText(/▶.*占い師.*CO/)).toBeTruthy();
  });

  it('統合: AgentRosterRow: ROLES にない coRole は生キーを CO バッジに表示する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: ROLES に未登録の coRole でも CO バッジを欠落させず生キー文字列を表示することを検証する（防御フォールバック）。
     */
    renderRow({ coRole: 'UnknownRole' });

    expect(screen.getByText(/▶.*UnknownRole.*CO/)).toBeTruthy();
  });

  it('統合: AgentRosterRow: deathMeta があれば Day N · content を表示する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: deathMeta が渡されたとき死因メタ（Day N · content）を表示することを検証する。
     */
    renderRow({ dead: true, deathMeta: { day: 1, content: 'Bob was executed.' } });

    expect(screen.getByText(/Day 1 · Bob was executed\./)).toBeTruthy();
  });

  it('統合: AgentRosterRow: showRole=false でも deathMeta は表示する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: public 相当（showRole=false）でも死因メタは役職を露出しないため表示維持されることを検証する（#521 AC-3 組み合わせ境界）。
     */
    const { container } = renderRow({
      role: 'Werewolf',
      showRole: false,
      dead: true,
      deathMeta: { day: 1, content: 'Werewolves attacked Bob.' },
    });

    expect(screen.getByText(/Day 1 · Werewolves attacked Bob\./)).toBeTruthy();
    expect(screen.queryByText('人狼')).toBeNull();
    expect(container.querySelector('[class*="roleTag"]')).toBeNull();
  });

  it('統合: AgentRosterRow: アイコン左・statusDot 右端の DOM 順で描画する', () => {
    /*
     * SUT: AgentRosterRow
     * Mock: なし（plain props を入力）
     * Level: component
     * Objective: 行 Link 内が「アイコン（img を含む）→ … → statusDot」の順で並び、statusDot が右端要素であることを検証する。
     */
    const { container } = renderRow({ role: 'Seer', showRole: true });

    const link = container.querySelector('a');
    expect(link.firstElementChild.querySelector('img')).toBeTruthy();
    expect(link.lastElementChild.className).toMatch(/statusDot/);
  });
});

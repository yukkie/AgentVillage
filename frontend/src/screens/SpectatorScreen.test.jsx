import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedItem, LeftPane } from './SpectatorScreen.jsx';
import styles from './SpectatorScreen.module.css';

const roleAssignment = {
  Alice: 'Seer',
  Bob: 'Werewolf',
  Carol: 'Knight',
};

afterEach(() => {
  cleanup();
});

function renderFeedItem(overrides) {
  const ev = {
    day: 1,
    event_type: 'vote',
    agent: 'Alice',
    target: 'Bob',
    content: '',
    is_public: false,
    ...overrides,
  };

  return render(
    <FeedItem
      ev={ev}
      prevById={{}}
      roleAssignment={roleAssignment}
      title="Test Village"
    />
  );
}

function renderLeftPane(overrides = {}) {
  const props = {
    activeDay: 1,
    activePhase: 'discuss',
    setDay: vi.fn(),
    setPhase: vi.fn(),
    days: [1],
    agentNames: ['Alice', 'Bob', 'Carol'],
    daySummary: {
      1: {
        target: 'Bob',
        nightDone: true,
      },
    },
    ...overrides,
  };

  return {
    ...render(<LeftPane {...props} />),
    props,
  };
}

describe('FeedItem event routing', () => {
  it.each([
    ['vote', { event_type: 'vote', agent: 'Alice', target: 'Bob' }, /Alice → Bob/],
    ['elimination', { event_type: 'elimination', agent: 'Bob' }, /Bob が処刑されました/],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Bob was Werewolf' }, /Bob は人狼陣営/],
    ['wolf_chat', { event_type: 'wolf_chat', agent: 'Bob', content: 'Attack Alice tonight.' }, /Attack Alice tonight\./],
    ['inspection', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Bob is Werewolf' }, /Bob: 人狼陣営/],
    ['guard', { event_type: 'guard', agent: 'Carol', target: 'Alice' }, /Carol.*Alice を護衛/],
    ['guard_block', { event_type: 'guard_block', target: 'Alice', is_public: false }, /護衛成功: Alice は守られた/],
    ['night_attack', { event_type: 'night_attack', target: 'Alice', is_public: false }, /Alice を襲撃/],
  ])('renders %s events with the expected card', (_eventType, event, expectedText) => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: event_type ごとに対応するカード表示へルーティングされることを検証する。
     */
    renderFeedItem(event);

    expect(screen.getByText(expectedText)).toBeTruthy();
  });
});

describe('LeftPane phase interaction', () => {
  it.each([
    ['議論フェーズ', 'discuss'],
    ['投票・処刑', 'vote'],
    ['夜フェーズ', 'night'],
  ])('calls setPhase("%s") when the phase row is clicked', async (label, phase) => {
    /**
     * SUT: LeftPane
     * Mock: vi.fn() で setDay / setPhase state setter を観測
     * Level: unit
     * Objective: 左ペインのフェーズ行クリックが対応する phase state 更新を要求することを検証する。
     */
    const user = userEvent.setup();
    const { props } = renderLeftPane();

    await user.click(screen.getByText(label, { exact: false }));

    expect(props.setDay).toHaveBeenCalledWith(1);
    expect(props.setPhase).toHaveBeenCalledWith(phase);
  });

  it('marks only the active phase row as active', () => {
    /**
     * SUT: LeftPane
     * Mock: vi.fn() で未使用 state setter を提供
     * Level: unit
     * Objective: activeDay / activePhase に一致するフェーズ行だけ active class を持つことを検証する。
     */
    const { container } = renderLeftPane({ activeDay: 1, activePhase: 'vote' });
    const rows = within(container).getAllByText(/議論フェーズ|投票・処刑|夜フェーズ/);
    const discussRow = rows.find(row => row.textContent.includes('議論フェーズ'));
    const voteRow = rows.find(row => row.textContent.includes('投票・処刑'));
    const nightRow = rows.find(row => row.textContent.includes('夜フェーズ'));

    expect(discussRow.className.split(' ')).not.toContain(styles.active);
    expect(voteRow.className.split(' ')).toContain(styles.active);
    expect(nightRow.className.split(' ')).not.toContain(styles.active);
  });
});

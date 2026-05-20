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
    ['vote', { event_type: 'vote', agent: 'Alice', target: 'Bob', content: 'Alice votes for Bob' }, /Alice votes for Bob/],
    ['elimination', { event_type: 'elimination', agent: 'Bob', content: 'Bob was executed by the village vote.' }, /Bob was executed by the village vote\./],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Alice senses: Bob was Werewolf' }, /Alice senses: Bob was Werewolf/],
    ['wolf_chat', { event_type: 'wolf_chat', agent: 'Bob', content: 'Attack Alice tonight.' }, /Attack Alice tonight\./],
    ['inspection', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf' }, /Alice inspects Bob: Werewolf/],
    ['guard', { event_type: 'guard', agent: 'Carol', target: 'Alice', content: 'Carol guards Alice' }, /Carol guards Alice/],
    ['guard_block', { event_type: 'guard_block', target: 'Alice', is_public: false, content: 'Alice was protected by the Knight! The attack was blocked.' }, /Alice was protected by the Knight! The attack was blocked\./],
    ['night_attack', { event_type: 'night_attack', target: 'Alice', is_public: false, content: 'Werewolves attack Alice' }, /Werewolves attack Alice/],
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

  it.each([
    ['medium_result villager-side result', { event_type: 'medium_result', agent: 'Alice', target: 'Carol', content: 'Alice senses: Carol was Not Werewolf' }],
    ['medium_result werewolf result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Alice senses: Bob was Werewolf' }],
    ['inspection villager-side result', { event_type: 'inspection', agent: 'Alice', target: 'Carol', content: 'Alice inspects Carol: Not Werewolf', inspection_role: 'Villager' }],
    ['inspection werewolf result', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', inspection_role: 'Werewolf' }],
  ])('renders %s without frontend translation', (_caseName, event) => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: 霊媒/占い結果をフロントエンドで陣営文言へ翻訳せず、ログ content のまま表示することを検証する。
     */
    renderFeedItem(event);

    expect(screen.getByText(event.content)).toBeTruthy();
    expect(screen.queryByText(/村人陣営|人狼陣営/)).toBeNull();
  });

  it('renders actor avatars around two-party system logs', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: 二者が関わるシステムログで agent / target のアバターが左右に表示されることを検証する。
     */
    renderFeedItem({
      event_type: 'inspection',
      agent: 'Alice',
      target: 'Bob',
      content: 'Alice inspects Bob: Werewolf',
    });

    expect(screen.getByAltText('Alice')).toBeTruthy();
    expect(screen.getByAltText('Bob')).toBeTruthy();
  });

  it('renders a missing-content marker instead of reconstructing a system log message', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: content が欠損したシステムログでは表示文を再構築せず、欠損マーカーを表示することを検証する。
     */
    renderFeedItem({
      event_type: 'medium_result',
      agent: 'Alice',
      target: 'Bob',
      content: '',
    });

    expect(screen.getByText('[missing content]')).toBeTruthy();
    expect(screen.queryByText(/Alice senses|Bob was|村人陣営|人狼陣営/)).toBeNull();
  });

  it('renders the only actor avatar on the right side for single-actor system logs', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: 一者だけが関わるシステムログでは右側に対象アバターが表示されることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'elimination',
      agent: 'Bob',
      content: 'Bob was executed by the village vote.',
    });

    const row = container.querySelector(`.${styles.sysrow}`);
    const avatar = screen.getByAltText('Bob');

    expect(row.lastElementChild.querySelector('img[alt="Bob"]')).toBe(avatar);
  });
});

describe('FeedItem: phase_start visibility', () => {
  it('hides day_vote phase_start', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: day_vote の phase_start が中央フィードに表示されないことを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'phase_start', phase: 'day_vote', content: '=== DAY 1  VOTE ===' });
    expect(container.firstChild).toBeNull();
  });

  it('hides night phase_start', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: night の phase_start が中央フィードに表示されないことを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'phase_start', phase: 'night', content: '=== NIGHT 1 ===' });
    expect(container.firstChild).toBeNull();
  });

  it('shows GAME START phase_start', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: init の phase_start（GAME START）が表示されることを検証する。
     */
    renderFeedItem({ event_type: 'phase_start', phase: 'init', content: '=== GAME START ===' });
    expect(screen.getByText(/が開始されました/)).toBeTruthy();
  });
});

describe('FeedItem: vote card', () => {
  it('shows voter and target avatars without duplicate icon', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: 投票カードに投票者・被投票者の img が表示され、本文テキスト内に ⚑ アイコン文字が含まれないことを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'vote', agent: 'Alice', target: 'Bob' });
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    const sysText = container.querySelector('[class*="sysText"]');
    expect(sysText?.textContent).not.toMatch(/⚑/);
  });
});

describe('FeedItem: elimination card', () => {
  it('shows target avatar', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: 処刑カードに対象者の img が表示されることを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'elimination', agent: 'Bob' });
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('FeedItem: wolf_chat card', () => {
  it('folds thought into details when ev.thought is present', () => {
    /**
     * SUT: FeedItem (WolfChatCard)
     * Mock: なし
     * Level: unit
     * Objective: wolf_chat に thought がある場合「思考ログを読む」details が表示されることを検証する。
     */
    renderFeedItem({ event_type: 'wolf_chat', agent: 'Bob', content: 'Attack tonight.', thought: '狼として最適な標的を選ぶ。' });
    expect(screen.getByText(/思考ログを読む/)).toBeTruthy();
  });

  it('does not show thought details when ev.thought is absent', () => {
    /**
     * SUT: FeedItem (WolfChatCard)
     * Mock: なし
     * Level: unit
     * Objective: wolf_chat に thought がない場合「思考ログを読む」が表示されないことを検証する。
     */
    renderFeedItem({ event_type: 'wolf_chat', agent: 'Bob', content: 'Attack tonight.' });
    expect(screen.queryByText(/思考ログを読む/)).toBeNull();
  });
});

describe('FeedItem: system event icons', () => {
  it('guard uses 🛡 icon in SystemRow', () => {
    /**
     * SUT: FeedItem (SystemRow)
     * Mock: なし
     * Level: unit
     * Objective: guard イベントの SystemRow 左アイコンが 🛡 であることを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'guard', agent: 'Carol', target: 'Alice' });
    const icon = container.querySelector('[class*="sysIconCol"] > [class*="sysIcon"]');
    expect(icon?.textContent).toBe('🛡');
  });

  it('inspection uses 🔮 icon in SystemRow', () => {
    /**
     * SUT: FeedItem (SystemRow)
     * Mock: なし
     * Level: unit
     * Objective: inspection イベントの SystemRow 左アイコンが 🔮 であることを検証する。
     */
    const { container } = renderFeedItem({ event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Bob is Werewolf' });
    const icon = container.querySelector('[class*="sysIconCol"] > [class*="sysIcon"]');
    expect(icon?.textContent).toBe('🔮');
  });

  it('body text has no redundant emoji prefix for guard', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: guard の本文テキスト（sysText）に 🛡 が含まれないことを検証する（sysIcon は対象外）。
     */
    const { container } = renderFeedItem({ event_type: 'guard', agent: 'Carol', target: 'Alice' });
    const sysText = container.querySelector('[class*="sysText"]');
    expect(sysText?.textContent).not.toMatch(/🛡/);
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

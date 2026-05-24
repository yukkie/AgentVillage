import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedItem, LeftPane, RightPane } from './SpectatorScreen.jsx';
import SpectatorScreen from './SpectatorScreen.jsx';
import styles from './SpectatorScreen.module.css';
import * as replayLoader from '../lib/replayLoader.js';

vi.mock('../lib/replayLoader.js', () => ({
  fetchReplayLog: vi.fn(),
  fetchReplayAgents: vi.fn(),
  fetchReplayGame: vi.fn(),
}));

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
  it('folds thought into details when ev.reasoning is present', () => {
    /**
     * SUT: FeedItem (WolfChatCard)
     * Mock: なし
     * Level: unit
     * Objective: wolf_chat に reasoning がある場合「思考ログを読む」details が表示されることを検証する。
     */
    renderFeedItem({ event_type: 'wolf_chat', agent: 'Bob', content: 'Attack tonight.', reasoning: '狼として最適な標的を選ぶ。' });
    expect(screen.getByText(/思考ログを読む/)).toBeTruthy();
  });

  it('does not show thought details when ev.reasoning is absent', () => {
    /**
     * SUT: FeedItem (WolfChatCard)
     * Mock: なし
     * Level: unit
     * Objective: wolf_chat に reasoning がない場合「思考ログを読む」が表示されないことを検証する。
     */
    renderFeedItem({ event_type: 'wolf_chat', agent: 'Bob', content: 'Attack tonight.' });
    expect(screen.queryByText(/思考ログを読む/)).toBeNull();
  });
});

describe('FeedItem: private action thought details', () => {
  it.each([
    ['inspection', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf' }],
    ['guard', { event_type: 'guard', agent: 'Carol', target: 'Alice', content: 'Carol guards Alice' }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Alice senses: Bob was Werewolf' }],
  ])('folds thought into details for %s when ev.reasoning is present', (_eventType, event) => {
    /**
     * SUT: FeedItem (SystemRow)
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: inspection / guard / medium_result に reasoning がある場合「思考ログを読む」details が表示されることを検証する。
     */
    renderFeedItem({ ...event, reasoning: '非公開能力の対象選択理由。' });

    expect(screen.getByText(/思考ログを読む/)).toBeTruthy();
    expect(screen.getByText(/非公開能力の対象選択理由/)).toBeTruthy();
  });

  it.each([
    ['inspection', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf' }],
    ['guard', { event_type: 'guard', agent: 'Carol', target: 'Alice', content: 'Carol guards Alice' }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Alice senses: Bob was Werewolf' }],
  ])('does not show thought details for %s when ev.reasoning is absent', (_eventType, event) => {
    /**
     * SUT: FeedItem (SystemRow)
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: inspection / guard / medium_result に reasoning がない場合「思考ログを読む」が表示されないことを検証する。
     */
    renderFeedItem(event);

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

describe('LeftPane night death display', () => {
  it('shows attacked agent name from dayActions when available', () => {
    /**
     * SUT: LeftPane
     * Mock: なし（dayActions plain object を入力）
     * Level: unit
     * Objective: dayActions[day].nightActions に night_attack がある場合 ⚰ マークと共に左ペインに表示されることを検証する。
     */
    renderLeftPane({
      days: [1],
      dayActions: {
        1: {
          nightActions: [{ event_type: 'night_attack', agent: 'Kai', target: 'Alice', is_public: false }],
          execResult: null,
        },
      },
    });

    expect(screen.getByText(/⚰.*Alice|Alice.*⚰/)).toBeTruthy();
  });

  it('shows nothing when dayActions has no night_attack for the day', () => {
    /**
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: dayActions に night_attack がない場合は ⚰ が表示されないことを検証する。
     */
    const { container } = renderLeftPane({
      days: [1],
      dayActions: {},
    });

    expect(container.querySelector('[class*="deathline"]')).toBeNull();
  });
});

const baseAgents = {
  Alice: { role: 'Seer',     is_alive: true,  claimed_role: null },
  Bob:   { role: 'Werewolf', is_alive: false, claimed_role: null },
  Carol: { role: 'Knight',   is_alive: true,  claimed_role: null },
};

function renderRightPane(overrides = {}) {
  const props = {
    agents: baseAgents,
    roleAssignment: { Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' },
    coStatus: {},
    dayActions: {},
    activeDay: 1,
    viewerMode: 'spectator',
    ...overrides,
  };
  return render(<RightPane {...props} />);
}

describe('RightPane: suspicion meter removed', () => {
  it('does not render a suspicion meter', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 容疑度メーターが右ペインに存在しないことを検証する。
     */
    const { container } = renderRightPane();
    expect(container.querySelector('[class*="meter"]')).toBeNull();
  });
});

describe('RightPane: role display in spectator mode', () => {
  it('shows true role tag for alive agents', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: spectatorモードで生存エージェントに真の役職タグが表示されることを検証する。
     */
    renderRightPane({ viewerMode: 'spectator' });
    // Alice is Seer (true role), Carol is Knight (true role)
    expect(screen.getAllByText(/占い師/).length).toBeGreaterThan(0);
  });

  it('shows CO role badge when agent has claimed_role', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: COしたエージェントのCO役職バッジが表示されることを検証する。
     */
    renderRightPane({
      coStatus: { Alice: 'Seer' },
    });
    expect(screen.getByText(/占い師.*CO|CO.*占い師|▶.*占い師/)).toBeTruthy();
  });
});

describe('RightPane: CO board dynamic', () => {
  it('shows CO agents with their claimed role', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: COボードに coStatus から動的生成されたエージェント名と役職が表示されることを検証する。
     */
    renderRightPane({
      coStatus: { Alice: 'Seer', Carol: 'Knight' },
    });
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });

  it('shows 未CO placeholder when no one has CO for a role', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: COがない場合に「未CO」が表示されることを検証する。
     */
    renderRightPane({ coStatus: {} });
    expect(screen.getAllByText('未CO').length).toBeGreaterThan(0);
  });
});

describe('RightPane: night actions for activeDay', () => {
  it('shows night action entries for the active day', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: activeDay の夜行動が右ペインに表示されることを検証する。
     */
    const dayActions = {
      1: {
        nightActions: [
          { day: 1, event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false },
        ],
        execResult: { target: 'Bob', voteTable: [{ from: 'Alice', to: 'Bob' }] },
      },
    };
    renderRightPane({ dayActions, activeDay: 1 });
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('shows exec result for the active day', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: activeDay の処刑結果（ターゲット）が表示されることを検証する。
     */
    const dayActions = {
      1: {
        nightActions: [],
        execResult: { target: 'Bob', voteTable: [{ from: 'Alice', to: 'Bob' }] },
      },
    };
    renderRightPane({ dayActions, activeDay: 1 });
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
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

const MINIMAL_JSONL = [
  '{"id":"e1","day":1,"phase":"init","event_type":"phase_start","agent":null,"target":null,"content":"=== GAME START ===","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e2","day":1,"phase":"day_discussion","event_type":"speech","agent":"Alice","target":null,"content":"こんにちは","is_public":true,"speech_id":1,"reply_to":null}',
  '{"id":"e3","day":1,"phase":"day_vote","event_type":"vote","agent":"Alice","target":"Bob","content":"Alice votes for Bob","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e4","day":1,"phase":"day_vote","event_type":"elimination","agent":"Bob","target":null,"content":"Bob was executed.","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e5","day":1,"phase":"day_discussion","event_type":"co_announcement","agent":"Alice","target":null,"content":"Alice claims to be Seer","is_public":true,"speech_id":null,"reply_to":null,"claimed_role":"Seer"}',
].join('\n');

const MINIMAL_AGENT_JSON = {
  Alice: { name: 'Alice', role: 'Seer', state: { is_alive: true }, profile: { name: 'Alice' } },
};

describe('SpectatorScreen: sessionId integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const CAST = [];

  it('renders feed events from fetchReplayLog after load', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: sessionId が渡されると fetchReplayLog の結果がフィードに表示されることを検証する。
     */
    replayLoader.fetchReplayLog.mockResolvedValue(MINIMAL_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(MINIMAL_AGENT_JSON);

    render(<SpectatorScreen sessionId="test-session-001" cast={CAST} />);

    await waitFor(() => expect(screen.getByText('こんにちは')).toBeTruthy(), { timeout: 3000 });
  });

  it('shows CO count from real log events', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: co_announcement イベントの数が TopBar の CO 表示に反映されることを検証する。
     */
    replayLoader.fetchReplayLog.mockResolvedValue(MINIMAL_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(MINIMAL_AGENT_JSON);

    render(<SpectatorScreen sessionId="test-session-001" cast={CAST} />);

    await waitFor(() => {
      const coSpan = [...document.querySelectorAll('span')].find(el => el.textContent.includes('CO'));
      expect(coSpan?.querySelector('strong')?.textContent).toBe('1');
    }, { timeout: 3000 });
  });

  it('shows load error when fetchReplayLog rejects', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchReplayLog を reject するモック
     * Level: integration
     * Objective: fetch 失敗時にエラーメッセージが表示されることを検証する。
     */
    replayLoader.fetchReplayLog.mockRejectedValue(new Error('network error'));
    replayLoader.fetchReplayAgents.mockResolvedValue({});

    render(<SpectatorScreen sessionId="bad-session" cast={CAST} />);

    await waitFor(() => expect(screen.getByText(/network error/)).toBeTruthy(), { timeout: 3000 });
  });

  it('calls onBack when back button is clicked', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchReplayLog / fetchReplayAgents / onBack を vi.fn()
     * Level: integration
     * Objective: onBack prop が渡されていれば「← 一覧」ボタンが表示されクリックで呼ばれることを検証する。
     */
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});
    const onBack = vi.fn();

    const user = userEvent.setup();
    render(<SpectatorScreen sessionId="test-session-001" cast={CAST} onBack={onBack} />);

    await user.click(screen.getByText('← 一覧'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

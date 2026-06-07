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

function renderFeedItem(overrides, options = {}) {
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
      viewerMode={options.viewerMode}
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
        execResult: { target: 'Bob', votes: 1, voteTable: [] },
        nightDone: true,
        nightActions: [],
        speechCount: 0,
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

  it('renders public night_attack event using target (not agent) as victim', () => {
    /**
     * SUT: FeedItem (night_attack branch)
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: unit
     * Objective: is_public=true の night_attack で ev.target（被害者名）が表示され、
     *            ev.agent（null）を誤ってフォールバックしないことを検証する。
     */
    renderFeedItem({
      event_type: 'night_attack',
      agent: null,
      target: 'Alice',
      is_public: true,
      content: 'Werewolves attacked Alice! Alice was found dead at dawn.',
    });

    expect(screen.getByText(/Werewolves attacked Alice/)).toBeTruthy();
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

  it('renders suspicion_update snapshots as spectator meter rows', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: suspicion_snapshot を持つ suspicion_update が、content 文字列主体ではなく
     *            バー主体の疑念メーターとして表示されることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'suspicion_update',
      agent: 'Alice',
      content: 'Alice suspicion update: Bob=0.82, Carol=0.45, Dave=0.31',
      is_public: false,
      suspicion_snapshot: { Bob: 0.82, Carol: 0.45, Dave: 0.31 },
    });

    expect(screen.getByText('疑念')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
    expect(screen.getByText('Dave')).toBeTruthy();
    expect(screen.getByAltText('Alice')).toBeTruthy();
    expect(screen.queryByText('疑念メーター')).toBeNull();
    expect(container.querySelector('[aria-label="Bob suspicion 82%"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Carol suspicion 45%"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Dave suspicion 31%"]')).toBeTruthy();
    expect(screen.queryByText('delta trace')).toBeNull();
    expect(screen.getByText('Alice suspicion update: Bob=0.82, Carol=0.45, Dave=0.31')).toBeTruthy();
  });

  it('renders threat_update snapshots as spectator meter rows', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: threat_snapshot を持つ threat_update が、脅威メーターとして表示されることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'threat_update',
      agent: 'Bob',
      content: 'Bob threat update: Alice=0.74, Carol=0.25',
      is_public: false,
      threat_snapshot: { Alice: 0.74, Carol: 0.25 },
    });

    expect(screen.getByText('脅威')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
    expect(screen.getByAltText('Bob')).toBeTruthy();
    expect(screen.queryByText('脅威メーター')).toBeNull();
    expect(container.querySelector('[aria-label="Alice threat 74%"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Carol threat 25%"]')).toBeTruthy();
  });

  it('falls back to content when suspicion/threat snapshots are missing', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（旧アーカイブ相当の LogEvent plain object を入力）
     * Level: component
     * Objective: snapshot が欠如した旧ログでも suspicion_update を破棄せず content を表示することを検証する。
     */
    renderFeedItem({
      event_type: 'suspicion_update',
      agent: 'Alice',
      content: 'Alice suspicion update: Bob=0.82',
      is_public: false,
      suspicion_snapshot: null,
    });

    expect(screen.getByText('Alice suspicion update: Bob=0.82')).toBeTruthy();
  });

  it('hides suspicion/threat updates in public mode', () => {
    /**
     * SUT: FeedItem
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: is_public=false の suspicion_update が public モードではマウントされないことを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'suspicion_update',
      agent: 'Alice',
      content: 'Alice suspicion update: Bob=0.82',
      is_public: false,
      suspicion_snapshot: { Bob: 0.82 },
    }, { viewerMode: 'public' });

    expect(container.firstChild).toBeNull();
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

describe('FeedItem semantic cards', () => {
  it.each([
    ['speech', { event_type: 'speech', agent: 'Alice', content: 'こんにちは', speech_id: 1, is_public: true }, 'Alice D1-01 10:03'],
    ['wolf_chat', { event_type: 'wolf_chat', agent: 'Bob', content: 'Attack Alice tonight.', is_public: false }, 'Bob wolf chat'],
  ])('renders %s as an article', (_type, event, name) => {
    /*
     * SUT: FeedItem → SpeechCard / WolfChatCard
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: 発言カード相当が article role で特定できることを検証する。
     */
    renderFeedItem(event);

    expect(screen.getByRole('article', { name })).toBeTruthy();
  });

  it('renders speech timestamp as a time element', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: 発言タイムスタンプが <time> 要素としてレンダリングされることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'speech',
      agent: 'Alice',
      content: 'こんにちは',
      speech_id: 1,
      is_public: true,
    });

    expect(container.querySelector('time')?.textContent).toBe('10:03');
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
  it('shows attacked agent name from daySummary when available', () => {
    /**
     * SUT: LeftPane
     * Mock: なし（daySummary plain object を入力）
     * Level: unit
     * Objective: daySummary[day].nightActions に night_attack がある場合 ⚰ マークと共に左ペインに表示されることを検証する。
     */
    renderLeftPane({
      days: [1],
      daySummary: {
        1: {
          nightActions: [{ event_type: 'night_attack', agent: 'Kai', target: 'Alice', is_public: false }],
          execResult: null,
          speechCount: 0,
          nightDone: false,
        },
      },
    });

    expect(screen.getByText(/⚰.*Alice|Alice.*⚰/)).toBeTruthy();
  });

  it('shows nothing when daySummary has no night_attack for the day', () => {
    /**
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: daySummary に night_attack がない場合は ⚰ が表示されないことを検証する。
     */
    const { container } = renderLeftPane({
      days: [1],
      daySummary: {},
    });

    expect(container.querySelector('[class*="deathline"]')).toBeNull();
  });
});

const baseAgents = {
  Alice: { role: 'Seer',     is_alive: true,  claimed_role: null },
  Bob:   { role: 'Werewolf', is_alive: false, claimed_role: null },
  Carol: { role: 'Knight',   is_alive: true,  claimed_role: null },
};

// Bob is dead at day 1
const baseDeadByDay = { 1: new Map([['Bob', { day: 1, content: 'Bob was executed.' }]]) };

function renderRightPane(overrides = {}) {
  const props = {
    agents: baseAgents,
    roleAssignment: { Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' },
    coStatus: {},
    daySummary: {},
    activeDay: 1,
    deadByDay: baseDeadByDay,
    viewerMode: 'spectator',
    ...overrides,
  };
  return render(<RightPane {...props} />);
}

describe('RightPane: death reason display (#391)', () => {
  it('shows day and content for dead agent in roster', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 死亡者行に死亡日（Day N）と死因テキスト（content）が表示されることを検証する（AC1 / #391）。
     */
    renderRightPane({
      deadByDay: { 1: new Map([['Bob', { day: 1, content: 'Bob was executed.' }]]) },
      activeDay: 1,
    });
    expect(screen.getByText(/Day 1 · Bob was executed\./)).toBeTruthy();
  });

  it('shows night_attack content for dead agent', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 夜襲死亡者行に night_attack の content テキストが表示されることを検証する（AC2 / #391）。
     */
    renderRightPane({
      deadByDay: { 1: new Map([['Bob', { day: 1, content: 'Werewolves attacked Bob.' }]]) },
      activeDay: 1,
    });
    expect(screen.getByText(/Werewolves attacked Bob\./)).toBeTruthy();
  });

  it('shows no deathReason when deadByDay entry has no metadata', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: メタデータなし（Map.get が undefined）の死亡者行には死亡理由が表示されないことを検証する。
     */
    const { container } = renderRightPane({
      deadByDay: { 1: new Map([['Bob', undefined]]) },
      activeDay: 1,
    });
    expect(container.querySelector('[class*="deathReason"]')).toBeNull();
  });
});

describe('RightPane semantic lists', () => {
  it('exposes CO board, night actions, and roster groups as semantic lists', () => {
    /*
     * SUT: RightPane
     * Mock: なし（agents / daySummary plain object を入力）
     * Level: component
     * Objective: COボード・夜行動・生存/死亡ロスターが list/listitem role で特定できることを検証する。
     */
    const daySummary = {
      1: {
        nightActions: [
          { day: 1, event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false },
        ],
        execResult: null,
        speechCount: 0,
        nightDone: false,
      },
    };

    renderRightPane({
      daySummary,
      activeDay: 1,
      coStatus: { Alice: 'Seer' },
    });

    expect(within(screen.getByRole('list', { name: 'カミングアウト状況' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('list', { name: 'Day 1 夜の行動' })).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('list', { name: '生存エージェント' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('list', { name: '死亡者' })).getAllByRole('listitem')).toHaveLength(1);
  });
});

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

  it('hides true role tag for alive agents in public mode (AC2)', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: publicモードで生存エージェントの真の役職タグが非表示になることを検証する（AC2 / #314）。
     *            死亡者行（Bob）は常時役職公開のため対象外。
     */
    const { container } = renderRightPane({ viewerMode: 'public', coStatus: {} });
    // Find the alive section (first rosterSection) and check no roleTag inside it
    const aliveSections = container.querySelectorAll('[class*="rosterSection"]');
    // aliveSections[0] = 生存, aliveSections[1] = 死亡者
    const aliveSection = aliveSections[0];
    const roleTagsInAlive = aliveSection.querySelectorAll('[class*="roleTag"]');
    expect(roleTagsInAlive.length).toBe(0);
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
    const daySummary = {
      1: {
        nightActions: [
          { day: 1, event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false },
        ],
        execResult: { target: 'Bob', votes: 1, voteTable: [{ from: 'Alice', to: 'Bob' }] },
        speechCount: 0,
        nightDone: false,
      },
    };
    renderRightPane({ daySummary, activeDay: 1 });
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
    const daySummary = {
      1: {
        nightActions: [],
        execResult: { target: 'Bob', votes: 1, voteTable: [{ from: 'Alice', to: 'Bob' }] },
        speechCount: 0,
        nightDone: false,
      },
    };
    renderRightPane({ daySummary, activeDay: 1 });
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });
});

describe('LeftPane night phase visibility', () => {
  it('hides the night phase row when nightActions is empty and nightDone is false', () => {
    /**
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: nightActions が空かつ nightDone=false のとき（昼処刑終了など夜フェーズ未実行の日）
     *            夜フェーズ行が左ペインに表示されないことを検証する (#459)。
     */
    renderLeftPane({
      daySummary: {
        1: { nightActions: [], execResult: null, speechCount: 0, nightDone: false },
      },
    });
    expect(screen.queryByText(/夜フェーズ/)).toBeNull();
  });

  it('shows the night phase row when nightActions has entries', () => {
    /**
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: nightActions にエントリがある日は夜フェーズ行が表示されることを検証する (#459)。
     */
    renderLeftPane({
      daySummary: {
        1: {
          nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
          execResult: null,
          speechCount: 0,
          nightDone: false,
        },
      },
    });
    expect(screen.getByText(/夜フェーズ/)).toBeTruthy();
  });

  it('shows the night phase row when nightDone is true', () => {
    /**
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: nightDone=true（公開 night_attack が存在する）日は夜フェーズ行が表示されることを検証する (#459)。
     */
    renderLeftPane({
      daySummary: {
        1: { nightActions: [], execResult: null, speechCount: 0, nightDone: true },
      },
    });
    expect(screen.getByText(/夜フェーズ/)).toBeTruthy();
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
    vi.resetAllMocks();
  });

  const CAST = [];

  async function waitForReplayLoadToSettle() {
    await waitFor(() => {
      expect(replayLoader.fetchReplayLog).toHaveBeenCalledOnce();
      expect(replayLoader.fetchReplayAgents).toHaveBeenCalledOnce();
      expect(screen.queryByText(/読み込み中/)).toBeNull();
      expect(screen.queryByText(/参加者情報を読み込み中。|発言ログを読み込み中。/)).toBeNull();
    }, { timeout: 3000 });
  }

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
    await waitForReplayLoadToSettle();
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
    await waitForReplayLoadToSettle();
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
    await waitForReplayLoadToSettle();
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

    await waitForReplayLoadToSettle();
    await user.click(screen.getByText('← 一覧'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('FeedItem: public mode hides spectator-only events (AC3 / #314)', () => {
  it.each([
    ['inspection', { event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false }],
    ['guard', { event_type: 'guard', agent: 'Carol', target: 'Alice', content: 'Carol guards Alice', is_public: false }],
    ['medium_result', { event_type: 'medium_result', agent: 'Alice', target: 'Bob', content: 'Alice senses: Bob was Werewolf', is_public: false }],
    ['wolf_chat', { event_type: 'wolf_chat', agent: 'Bob', content: 'Attack Alice tonight.', is_public: false }],
  ])('hides %s entirely in public mode', (_type, event) => {
    /*
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: public モードで spectator 限定イベント（inspection/guard/medium_result/wolf_chat）が完全非表示になることを検証する（AC3 / #314）。
     */
    const { container } = render(
      <FeedItem ev={event} prevById={{}} roleAssignment={roleAssignment} title="Test" viewerMode="public" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows inspection in spectator mode', () => {
    /*
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: spectator モードでは inspection が表示されることを検証する（対比用）。
     */
    render(
      <FeedItem
        ev={{ event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false }}
        prevById={{}} roleAssignment={roleAssignment} title="Test" viewerMode="spectator"
      />
    );
    expect(screen.getByText(/Alice inspects Bob: Werewolf/)).toBeTruthy();
  });
});

describe('SpeechCard: viewerMode public (AC2 / #314)', () => {
  function renderSpeechCard(viewerMode = 'spectator') {
    const ev = {
      day: 1,
      event_type: 'speech',
      agent: 'Alice',
      target: null,
      content: 'こんにちは',
      speech_id: 1,
      reply_to: null,
      claimed_role: null,
      reasoning: null,
      is_public: true,
    };
    return render(
      <FeedItem
        ev={ev}
        prevById={{}}
        roleAssignment={roleAssignment}
        title="Test Village"
        viewerMode={viewerMode}
      />
    );
  }

  it('shows role tag in spectator mode', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし
     * Level: unit
     * Objective: spectator モードで発言カードに真の役職タグが表示されることを検証する（#314）。
     */
    renderSpeechCard('spectator');
    expect(document.querySelectorAll('[class*="roleTag"]').length).toBeGreaterThan(0);
  });

  it('hides role tag in public mode (AC2)', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし
     * Level: unit
     * Objective: public モードで発言カードの役職タグが非表示になることを検証する（AC2 / #314）。
     */
    renderSpeechCard('public');
    expect(document.querySelectorAll('[class*="roleTag"]').length).toBe(0);
  });

  it.each(['spectator', 'public'])('shows CO badge with coBadge class in %s mode', (mode) => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし
     * Level: unit
     * Objective: spectator / public 両モードで CO バッジが coBadge クラスで表示されることを検証する（#314 / #417）。
     */
    const ev = {
      day: 1,
      event_type: 'speech',
      agent: 'Alice',
      content: 'こんにちは',
      speech_id: 1,
      reply_to: null,
      claimed_role: 'Seer',
      reasoning: null,
      is_public: true,
    };
    const { container } = render(
      <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} title="Test" viewerMode={mode} />
    );
    const badge = container.querySelector('[class*="coBadge"]');
    expect(badge).toBeTruthy();
    expect(badge.className).toMatch(/coBadge/);
  });
});

describe('ThoughtDetails: viewerMode public (AC4 / #314)', () => {
  function renderWithReasoning(viewerMode = 'spectator') {
    const ev = {
      day: 1,
      event_type: 'speech',
      agent: 'Alice',
      content: 'こんにちは',
      speech_id: 1,
      reply_to: null,
      claimed_role: null,
      reasoning: '村人として最適な行動を選ぶ。',
      is_public: true,
    };
    return render(
      <FeedItem
        ev={ev}
        prevById={{}}
        roleAssignment={roleAssignment}
        title="Test Village"
        viewerMode={viewerMode}
      />
    );
  }

  it('shows expandable thought details in spectator mode', () => {
    /*
     * SUT: FeedItem → SpeechCard → ThoughtDetails
     * Mock: なし
     * Level: unit
     * Objective: spectator モードで思考ログが <details> として展開可能であることを検証する（#314）。
     */
    const { container } = renderWithReasoning('spectator');
    expect(container.querySelector('details')).toBeTruthy();
    expect(screen.getByText(/思考ログを読む/)).toBeTruthy();
  });

  it('shows lock badge instead of expandable details in public mode (AC4)', () => {
    /*
     * SUT: FeedItem → SpeechCard → ThoughtDetails
     * Mock: なし
     * Level: unit
     * Objective: public モードで思考ログが <details> でなくロックバッジに切り替わることを検証する（AC4 / #314）。
     */
    const { container } = renderWithReasoning('public');
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByText(/🔒/)).toBeTruthy();
  });
});

describe('SpectatorScreen: viewerMode toggle (AC1 / #314)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('toggles between spectator and public mode on header button click (AC1)', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchReplayLog / fetchReplayAgents を vi.fn()
     * Level: integration
     * Objective: ヘッダーのトグルボタンクリックで spectator / public が切り替わることを検証する（AC1 / #314）。
     */
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});
    const user = userEvent.setup();

    render(<SpectatorScreen sessionId="test-session-001" cast={[]} />);

    await waitFor(() => {
      expect(screen.queryByText(/読み込み中/)).toBeNull();
    }, { timeout: 3000 });

    // Initially in spectator mode
    expect(screen.getByText(/観戦者モード/)).toBeTruthy();

    // Click to switch to public mode
    await user.click(screen.getByText(/観戦者モード/));
    expect(screen.getByText(/参加者視点/)).toBeTruthy();

    // Click again to switch back
    await user.click(screen.getByText(/参加者視点/));
    expect(screen.getByText(/観戦者モード/)).toBeTruthy();
  });
});

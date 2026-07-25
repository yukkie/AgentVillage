import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { LeftPane, RightPane } from './SpectatorScreen.jsx';
import SpectatorScreen from './SpectatorScreen.jsx';
import { FeedItem } from '../components/FeedCard.jsx';
import styles from './SpectatorScreen.module.css';
import feedStyles from '../components/FeedCard.module.css';
import roleTagStyles from '../components/RoleTag.module.css';
import * as replayLoader from '../lib/replayLoader.js';
import * as archiveLoader from '../lib/archiveLoader.js';

vi.mock('../lib/replayLoader.js', () => ({
  fetchReplayLog: vi.fn(),
  fetchReplayAgents: vi.fn(),
  fetchReplayGame: vi.fn(),
}));

vi.mock('../lib/archiveLoader.js', () => ({
  fetchGameList: vi.fn(),
  fetchGameBySessionId: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{location.pathname}{location.search}</output>;
}

function renderSpectator(sessionId, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/game/${sessionId}${search}`]}>
      <Routes>
        <Route path="/game/:sessionId" element={<SpectatorScreen />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

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
    <MemoryRouter initialEntries={['/game/test-session']}>
      <Routes>
        <Route path="/game/:sessionId" element={
          <FeedItem
            ev={ev}
            prevById={{}}
            roleAssignment={roleAssignment}
            sessionId="test-session"
            viewerMode={options.viewerMode}
            bulkThoughtsOpen={options.bulkThoughtsOpen}
          />
        } />
      </Routes>
    </MemoryRouter>
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
    selectedAgents: new Set(),
    onToggleAgent: vi.fn(),
    presentRoles: ['Villager', 'Seer', 'Werewolf', 'Knight'],
    selectedRoles: new Set(),
    onToggleRole: vi.fn(),
    thoughtsOpen: false,
    onToggleThoughts: vi.fn(),
    viewerMode: 'spectator',
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
    expect(screen.getByText('Alice')).toBeTruthy();
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
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.queryByText('脅威メーター')).toBeNull();
    expect(container.querySelector('[aria-label="Alice threat 74%"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Carol threat 25%"]')).toBeTruthy();
  });

  it('uses spectator_content for suspicion/threat trace text in spectator mode', () => {
    /**
     * SUT: FeedItem → RelationshipUpdateRow
     * Mock: なし（LogEvent 形状の plain object を入力）
     * Level: component
     * Objective: snapshot 分岐の trace 表示も contentForViewer 経由で spectator_content を優先することを検証する。
     */
    renderFeedItem({
      event_type: 'suspicion_update',
      agent: 'Alice',
      content: 'public trace should not be used',
      spectator_content: 'Alice suspicion update: Bob=0.82',
      is_public: false,
      suspicion_snapshot: { Bob: 0.82 },
    });

    expect(screen.getByText('Alice suspicion update: Bob=0.82')).toBeTruthy();
    expect(screen.queryByText('public trace should not be used')).toBeNull();
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

    const row = container.querySelector(`.${feedStyles.sysrow}`);
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

  it('renders game_start_narrative as a gm system row', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: game_start_narrative イベントがナラティブ本文を含む gm システム行としてレンダリングされることを検証する
     */
    renderFeedItem({ event_type: 'game_start_narrative', phase: 'init', day: 0, content: 'A werewolf lurks among the villagers.' });
    expect(screen.getByText(/A werewolf lurks/)).toBeTruthy();
  });

  it('renders role_assigned summary as a gm system row in public mode', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: public mode の role_assigned summary row が前夜の役職構成テキストとして表示されることを検証する。
     */
    renderFeedItem({
      event_type: 'role_assigned',
      phase: 'init',
      day: 0,
      agent: null,
      is_public: true,
      content: 'This village has 3 Villagers · 1 Seer · 1 Werewolf',
    }, { viewerMode: 'public' });

    expect(screen.getByText('役職構成')).toBeTruthy();
    expect(screen.getByText(/This village has 3 Villagers/)).toBeTruthy();
  });

  it('hides role_assigned summary row in spectator mode', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: spectator mode では role_assigned summary row を非表示にし、個別役職カードだけを表示対象にすることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'role_assigned',
      phase: 'init',
      day: 0,
      agent: null,
      is_public: true,
      content: 'This village has 3 Villagers · 1 Seer · 1 Werewolf',
    }, { viewerMode: 'spectator' });

    expect(container.firstChild).toBeNull();
  });

  it('renders role_assigned per-agent row as an agent episode card in spectator mode', () => {
    /**
     * SUT: FeedItem → AgentEpisodeCard
     * Mock: なし
     * Level: component
     * Objective: spectator mode の role_assigned per-agent row が大きな Avatar と真役職タグ付きのエピソードカードとして表示されることを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'role_assigned',
      phase: 'init',
      day: 0,
      agent: 'Alice',
      is_public: false,
      content: 'Alice came to realize they were the Seer.',
    }, { viewerMode: 'spectator' });

    expect(screen.getByRole('article', { name: 'Alice 役職割り当て' })).toBeTruthy();
    expect(screen.getByAltText('Alice')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Alice came to realize they were the Seer.')).toBeTruthy();
    expect(container.querySelector('[class*="agentEpisode"]')).toBeTruthy();
    expect(container.querySelector('[class*="roleTag"]')).toBeTruthy();
  });

  it('hides role_assigned per-agent row in public mode', () => {
    /**
     * SUT: FeedItem
     * Mock: なし
     * Level: unit
     * Objective: public mode では is_public=false の role_assigned per-agent row がマウントされないことを検証する。
     */
    const { container } = renderFeedItem({
      event_type: 'role_assigned',
      phase: 'init',
      day: 0,
      agent: 'Alice',
      is_public: false,
      content: 'Alice came to realize they were the Seer.',
    }, { viewerMode: 'public' });

    expect(container.firstChild).toBeNull();
  });

  it('falls back for archived role_assigned rows with missing content', () => {
    /**
     * SUT: FeedItem → AgentEpisodeCard
     * Mock: なし
     * Level: unit
     * Objective: role_assigned を含まない/本文欠損に近い旧アーカイブ互換ケースでもカード表示が壊れず欠損マーカーを表示することを検証する。
     */
    renderFeedItem({
      event_type: 'role_assigned',
      phase: 'init',
      day: 0,
      agent: 'Alice',
      is_public: false,
      content: '',
    }, { viewerMode: 'spectator' });

    expect(screen.getByText('[missing content]')).toBeTruthy();
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
const baseDeaths = { Bob: { day: 1, cause: 'elimination', content: 'Bob was executed.' } };

function renderRightPane(overrides = {}) {
  const props = {
    agents: baseAgents,
    roleAssignment: { Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' },
    coStatus: {},
    daySummary: {},
    activeDay: 1,
    deaths: baseDeaths,
    viewerMode: 'spectator',
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={['/game/test-session']}>
      <Routes>
        <Route path="/game/:sessionId" element={<RightPane {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RightPane: death reason display (#391)', () => {
  it('keeps future death records alive before their death day', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: activeDay より後の日に死亡するエージェントは、activeDay 時点の生存者として表示されることを検証する（#554 AC-4）。
     */
    renderRightPane({
      deaths: { Bob: { day: 2, cause: 'attack', content: 'Bob was found dead at dawn.' } },
      activeDay: 1,
    });
    expect(within(screen.getByRole('list', { name: '生存エージェント' })).getByText('Bob')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: '死亡者' })).queryByText('Bob')).toBeNull();
  });

  it('shows day and content for dead agent in roster', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 死亡者行に死亡日（Day N）と死因テキスト（content）が表示されることを検証する（AC1 / #391）。
     */
    renderRightPane({
      deaths: { Bob: { day: 1, cause: 'elimination', content: 'Bob was executed.' } },
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
      deaths: { Bob: { day: 1, cause: 'attack', content: 'Werewolves attacked Bob.' } },
      activeDay: 1,
    });
    expect(screen.getByText(/Werewolves attacked Bob\./)).toBeTruthy();
  });

  it('shows no deathReason when death entry has no metadata', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: メタデータなし（Map.get が undefined）の死亡者行には死亡理由が表示されないことを検証する。
     */
    const { container } = renderRightPane({
      deaths: { Bob: undefined },
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
     *            死亡者行は #521 AC-3 の別テストで検証する。
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

describe('RightPane: dead role hidden in public mode (#521 AC-3)', () => {
  it('hides dead agent role tag in public mode but keeps death reason', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: component
     * Objective: 組み合わせ境界（死亡者行 × public モード）で真役職を非表示にしつつ、
     *            役職を露出しない死因メタ（Day N · content）は表示維持されることを検証する（#521 AC-3）。
     */
    const { container } = renderRightPane({
      viewerMode: 'public',
      deaths: { Bob: { day: 1, cause: 'attack', content: 'Werewolves attacked Bob.' } },
      activeDay: 1,
      coStatus: {},
    });
    const deadSection = container.querySelectorAll('[class*="rosterSection"]')[1];
    expect(deadSection.querySelectorAll('[class*="roleTag"]').length).toBe(0);
    expect(screen.getByText(/Day 1 · Werewolves attacked Bob\./)).toBeTruthy();
  });

  it('shows dead agent role tag in spectator mode', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: component
     * Objective: spectator モードでは死亡者行に真役職タグが表示されることを検証する（AC-3 の対となる正常系）。
     */
    const { container } = renderRightPane({
      viewerMode: 'spectator',
      deaths: { Bob: { day: 1, cause: 'attack', content: 'Werewolves attacked Bob.' } },
      activeDay: 1,
      coStatus: {},
    });
    const deadSection = container.querySelectorAll('[class*="rosterSection"]')[1];
    expect(deadSection.querySelectorAll('[class*="roleTag"]').length).toBeGreaterThan(0);
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

describe('RightPane: night action icon role colors (#608)', () => {
  it.each([
    ['inspection', 'inspection', styles.inspection],
    ['guard', 'guard', styles.guard],
    ['night_attack', 'night_attack', styles.night_attack],
  ])('統合: RightPane: %s の夜行動アイテムに event_type クラスが付与される', (_label, eventType, expectedClass) => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: nightActions の event_type に応じて、CSS 側の役職色ルールと名前が一致する
     *            state クラス（inspection/guard/night_attack）が action 要素に付与されることを検証する（AC-1, AC-2）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: eventType, agent: 'Alice', target: 'Bob', is_public: false }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');
    const actionItem = actionList.querySelector(`.${styles.action}`);

    expect(actionItem.classList.contains(expectedClass)).toBe(true);
  });

  it('統合: RightPane: inspection_role=Werewolf の inspection 行に黒バッジが表示される', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: inspection_role が 'Werewolf' の inspection 行に .res.black バッジが描画されることを検証する（AC-3）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false, inspection_role: 'Werewolf' }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');
    const badge = actionList.querySelector(`.${styles.res}`);

    expect(badge).toBeTruthy();
    expect(badge.classList.contains(styles.black)).toBe(true);
    expect(badge.classList.contains(styles.white)).toBe(false);
  });

  it('統合: RightPane: inspection_role=Villager の inspection 行に白バッジが表示される', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: inspection_role が 'Villager' の inspection 行に .res.white バッジが描画されることを検証する（AC-3）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Carol', is_public: false, inspection_role: 'Villager' }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');
    const badge = actionList.querySelector(`.${styles.res}`);

    expect(badge).toBeTruthy();
    expect(badge.classList.contains(styles.white)).toBe(true);
    expect(badge.classList.contains(styles.black)).toBe(false);
  });

  it('統合: RightPane: inspection_role が無い旧アーカイブ互換の inspection 行にバッジが表示されない', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: inspection_role フィールドを持たない旧アーカイブ形状の inspection 行では
     *            .res バッジが描画されないことを検証する（AC-3 の互換境界）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');

    expect(actionList.querySelector(`.${styles.res}`)).toBeNull();
  });

  it('統合: RightPane: guard/night_attack 行には inspection_role があってもバッジが表示されない', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: バッジ描画が event_type === 'inspection' に限定され、guard/night_attack 行では
     *            表示されないことを検証する（AC-3 の組み合わせ境界）。
     */
    const daySummary = {
      1: {
        nightActions: [
          { event_type: 'guard', agent: 'Carol', target: 'Alice', is_public: false },
          { event_type: 'night_attack', agent: null, target: 'Alice', is_public: false },
        ],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');

    expect(actionList.querySelector(`.${styles.res}`)).toBeNull();
  });
});

describe('LeftPane phase dot colors unaffected (#608 AC-6)', () => {
  it('LeftPane: phaseDiscuss/phaseNight/phaseExec の dot に既存の状態修飾クラスが付与されたまま残る', () => {
    /*
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: デッドだった .phaseItem.day|night|exec 系統の削除後も、生存系統
     *            .phaseDiscuss/.phaseNight/.phaseExec が引き続き各フェーズ行に付与され、
     *            フェーズドットの色分け表示が変化しないことを検証する（AC-6）。
     */
    renderLeftPane({
      activeDay: 1,
      activePhase: 'vote',
      daySummary: {
        1: {
          nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
          execResult: { target: 'Bob', votes: 1, voteTable: [] },
          speechCount: 0,
          nightDone: true,
        },
      },
    });

    const discussRow = screen.getByText(/議論フェーズ/).closest(`.${styles.phaseItem}`);
    const voteRow = screen.getByText(/投票・処刑/).closest(`.${styles.phaseItem}`);
    const nightRow = screen.getByText(/夜フェーズ/).closest(`.${styles.phaseItem}`);

    expect(discussRow.classList.contains(styles.phaseDiscuss)).toBe(true);
    expect(voteRow.classList.contains(styles.phaseExec)).toBe(true);
    expect(nightRow.classList.contains(styles.phaseNight)).toBe(true);
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

describe('LeftPane agent filter chips', () => {
  it('LeftPane: 9人以上でも全参加者のチップを表示する', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: 参加者フィルタが先頭8人に制限されず、agentNames の全参加者を AvatarButton として表示することを検証する。
     */
    const agentNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory'];

    renderLeftPane({ agentNames });

    agentNames.forEach(name => {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    });
  });

  it('LeftPane: 選択中の参加者チップが selected variant で描画される', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: selectedAgents に含まれる参加者チップが aria-pressed と selected variant で選択状態を表すことを検証する。
     */
    const { container } = renderLeftPane({ selectedAgents: new Set(['Alice']) });

    const button = screen.getByRole('button', { name: 'Alice' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-variant="selected"]')?.textContent).toContain('Alice');
  });

  it('LeftPane: 参加者チップのクリックで onToggleAgent を呼ぶ', async () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で onToggleAgent callback を観測
     * Level: unit
     * Objective: 参加者 AvatarButton のクリックが該当エージェント名で toggle callback を呼ぶことを検証する。
     */
    const user = userEvent.setup();
    const onToggleAgent = vi.fn();
    renderLeftPane({ onToggleAgent });

    await user.click(screen.getByRole('button', { name: 'Bob' }));

    expect(onToggleAgent).toHaveBeenCalledWith('Bob');
  });
});

describe('LeftPane role filter chips', () => {
  it('LeftPane: presentRoles にない役職チップを表示しない', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: 役職フィルタが村に存在する役職だけを表示し、不参加役職を表示しないことを検証する。
     */
    renderLeftPane({ presentRoles: ['Villager', 'Seer', 'Werewolf'] });

    expect(screen.getByRole('button', { name: '村人' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '占い師' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '人狼' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '霊媒師' })).toBeNull();
    expect(screen.queryByRole('button', { name: '狩人' })).toBeNull();
    expect(screen.queryByRole('button', { name: '狂人' })).toBeNull();
  });

  it('LeftPane: 選択中の役職チップに aria-pressed と on クラスが付く', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: selectedRoles に含まれる役職チップが aria-pressed と on class で選択状態を表すことを検証する。
     */
    renderLeftPane({ selectedRoles: new Set(['Seer']) });

    const button = screen.getByRole('button', { name: '占い師' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains(styles.on)).toBe(true);
  });

  it('LeftPane: 役職チップのクリックで onToggleRole を呼ぶ', async () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で onToggleRole callback を観測
     * Level: unit
     * Objective: 役職チップのクリックが該当 role key で toggle callback を呼ぶことを検証する。
     */
    const user = userEvent.setup();
    const onToggleRole = vi.fn();
    renderLeftPane({ onToggleRole });

    await user.click(screen.getByRole('button', { name: '占い師' }));

    expect(onToggleRole).toHaveBeenCalledWith('Seer');
  });

  it('LeftPane: public モードでは役職フィルタを表示しない', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: public viewerMode では真役職リークを避けるため役職フィルタ UI を表示しないことを検証する。
     */
    renderLeftPane({ viewerMode: 'public' });

    expect(screen.queryByText('役職フィルタ')).toBeNull();
    expect(screen.queryByRole('button', { name: '占い師' })).toBeNull();
  });
});

describe('LeftPane thought log display toggle', () => {
  it('LeftPane: 表示行は思考ログトグルだけを表示する', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: 表示フィルタ行から発言/投票/CO/夜の行動チップが削除され、思考ログトグルのみ残ることを検証する。
     */
    renderLeftPane();

    expect(screen.queryByRole('button', { name: '発言' })).toBeNull();
    expect(screen.queryByRole('button', { name: '投票' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CO' })).toBeNull();
    expect(screen.queryByRole('button', { name: '夜の行動' })).toBeNull();
    expect(screen.getByRole('button', { name: '思考ログ' })).toBeTruthy();
  });

  it('LeftPane: 思考ログトグルのクリックで onToggleThoughts を呼ぶ', async () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で onToggleThoughts callback を観測
     * Level: unit
     * Objective: 思考ログトグルのクリックが一括開閉 callback を呼ぶことを検証する。
     */
    const user = userEvent.setup();
    const onToggleThoughts = vi.fn();
    renderLeftPane({ onToggleThoughts });

    await user.click(screen.getByRole('button', { name: '思考ログ' }));

    expect(onToggleThoughts).toHaveBeenCalledOnce();
  });

  it('LeftPane: public モードでは思考ログトグルを表示しない', () => {
    /*
     * SUT: LeftPane
     * Mock: vi.fn() で state setter / toggle callback を提供
     * Level: unit
     * Objective: public viewerMode では思考ログトグルを表示しないことを検証する。
     */
    renderLeftPane({ viewerMode: 'public' });

    expect(screen.queryByRole('button', { name: '思考ログ' })).toBeNull();
  });
});

const MINIMAL_JSONL = [
  '{"id":"e1","day":1,"phase":"init","event_type":"phase_start","agent":null,"target":null,"content":"=== GAME START ===","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e2","day":1,"phase":"day_discussion","event_type":"speech","agent":"Alice","target":null,"content":"こんにちは","is_public":true,"speech_id":1,"reply_to":null}',
  '{"id":"e3","day":1,"phase":"day_vote","event_type":"vote","agent":"Alice","target":"Bob","content":"Alice votes for Bob","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e4","day":1,"phase":"day_vote","event_type":"elimination","agent":"Bob","target":null,"content":"Bob was executed.","is_public":true,"speech_id":null,"reply_to":null}',
  '{"id":"e5","day":1,"phase":"day_discussion","event_type":"co_announcement","agent":"Alice","target":null,"content":"Alice claims to be Seer","is_public":true,"speech_id":null,"reply_to":null,"claimed_role":"Seer"}',
].join('\n');

const AGENT_FILTER_JSONL = [
  '{"id":"af1","day":1,"phase":"day_discussion","event_type":"speech","agent":"Alice","target":null,"content":"alice-only speech","is_public":true,"speech_id":1,"reply_to":null}',
  '{"id":"af2","day":1,"phase":"day_discussion","event_type":"speech","agent":"Bob","target":null,"content":"bob-only speech","is_public":true,"speech_id":2,"reply_to":null}',
  '{"id":"af3","day":1,"phase":"day_discussion","event_type":"speech","agent":"Carol","target":null,"content":"carol-only speech","is_public":true,"speech_id":3,"reply_to":null}',
].join('\n');

const THOUGHT_TOGGLE_JSONL = [
  '{"id":"tt1","day":1,"phase":"day_discussion","event_type":"speech","agent":"Alice","target":null,"content":"alice reasoning speech","is_public":true,"speech_id":1,"reply_to":null,"reasoning":"Alice reasoning"}',
  '{"id":"tt2","day":1,"phase":"day_discussion","event_type":"speech","agent":"Bob","target":null,"content":"bob reasoning speech","is_public":true,"speech_id":2,"reply_to":null,"reasoning":"Bob reasoning"}',
].join('\n');

const MINIMAL_AGENT_JSON = {
  Alice: { name: 'Alice', role: 'Seer', state: { is_alive: true }, profile: { name: 'Alice' } },
};

const AGENT_FILTER_AGENT_JSON = {
  Alice: { name: 'Alice', role: 'Seer', state: { is_alive: true }, profile: { name: 'Alice' } },
  Bob: { name: 'Bob', role: 'Werewolf', state: { is_alive: true }, profile: { name: 'Bob' } },
  Carol: { name: 'Carol', role: 'Knight', state: { is_alive: true }, profile: { name: 'Carol' } },
};

describe('SpectatorScreen: sessionId integration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  async function waitForReplayLoadToSettle() {
    await waitFor(() => {
      expect(replayLoader.fetchReplayLog).toHaveBeenCalledOnce();
      expect(replayLoader.fetchReplayAgents).toHaveBeenCalledOnce();
      expect(screen.queryByText(/読み込み中/)).toBeNull();
      expect(screen.queryByText(/参加者情報を読み込み中。|発言ログを読み込み中。/)).toBeNull();
    }, { timeout: 3000 });
  }

  it('統合: SpectatorScreen: TopBar パンくずとフィード見出しが同じフェーズ見出しラベルを表示する', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: TopBar パンくずの最終要素と中央フィード見出し(h2)が phaseHeading(activeDay, activePhase)
     * による同一のラベル文言を表示することを検証する（#596 AC-3: 2箇所が同じ関数を使っていることの配線検証）。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(MINIMAL_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(MINIMAL_AGENT_JSON);

    renderSpectator('phase-heading-session');

    await waitFor(() => expect(screen.getByText('こんにちは')).toBeTruthy(), { timeout: 3000 });

    const heading = screen.getByRole('heading', { level: 2 });
    // h2 は "{phaseHeading} {sessionId}" の合成テキストなので先頭の見出しラベル部分だけ取り出す
    const headingLabel = heading.textContent.replace('phase-heading-session', '').trim();
    const crumb = screen.getByText(headingLabel, { selector: 'span[aria-current="page"]' });
    expect(crumb).toBeTruthy();
  });

  it('renders feed events from fetchReplayLog after load', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: sessionId が URL params で渡されると fetchReplayLog の結果がフィードに表示されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(MINIMAL_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(MINIMAL_AGENT_JSON);

    renderSpectator('test-session-001');

    await waitFor(() => expect(screen.getByText('こんにちは')).toBeTruthy(), { timeout: 3000 });
    await waitForReplayLoadToSettle();
  });

  it('SpectatorScreen: 参加者チップ2つを選択するとフィードが2人の発言に絞られ、再クリックで解除される', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: 参加者フィルタの複数選択 state が中央フィードへ反映され、再クリックで解除されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(AGENT_FILTER_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);
    const user = userEvent.setup();

    renderSpectator('agent-filter-session');

    await waitFor(() => expect(screen.getByText('alice-only speech')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText('bob-only speech')).toBeTruthy();
    expect(screen.getByText('carol-only speech')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Alice' }));
    expect(screen.getByText('alice-only speech')).toBeTruthy();
    expect(screen.queryByText('bob-only speech')).toBeNull();
    expect(screen.queryByText('carol-only speech')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Bob' }));
    expect(screen.getByText('alice-only speech')).toBeTruthy();
    expect(screen.getByText('bob-only speech')).toBeTruthy();
    expect(screen.queryByText('carol-only speech')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Alice' }));
    expect(screen.queryByText('alice-only speech')).toBeNull();
    expect(screen.getByText('bob-only speech')).toBeTruthy();
    expect(screen.queryByText('carol-only speech')).toBeNull();
  });

  it('SpectatorScreen: 役職チップ選択でフィードが該当役職の発言に絞られる', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: 役職フィルタの選択 state が中央フィードへ反映されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(AGENT_FILTER_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);
    const user = userEvent.setup();

    renderSpectator('role-filter-session');

    await waitFor(() => expect(screen.getByText('alice-only speech')).toBeTruthy(), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '占い師' }));

    expect(screen.getByText('alice-only speech')).toBeTruthy();
    expect(screen.queryByText('bob-only speech')).toBeNull();
    expect(screen.queryByText('carol-only speech')).toBeNull();

    await user.click(screen.getByRole('button', { name: '狩人' }));
    expect(screen.getByText('alice-only speech')).toBeTruthy();
    expect(screen.queryByText('bob-only speech')).toBeNull();
    expect(screen.getByText('carol-only speech')).toBeTruthy();
  });

  it('SpectatorScreen: spectator で役職選択後に public へ切り替えると絞り込みが解除される', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: public viewerMode では役職フィルタ状態が残っていてもフィード絞り込みが適用されないことを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(AGENT_FILTER_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);
    const user = userEvent.setup();

    renderSpectator('role-filter-public-session');

    await waitFor(() => expect(screen.getByText('alice-only speech')).toBeTruthy(), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '占い師' }));
    expect(screen.queryByText('bob-only speech')).toBeNull();

    await user.click(screen.getByText(/観戦者モード/));

    expect(screen.getByText('alice-only speech')).toBeTruthy();
    expect(screen.getByText('bob-only speech')).toBeTruthy();
    expect(screen.getByText('carol-only speech')).toBeTruthy();
    expect(screen.queryByText('役職フィルタ')).toBeNull();
  });

  it('SpectatorScreen: 初期表示で全 details が閉じている', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: 思考ログ一括トグルの既定状態が OFF で、全 details が閉じていることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(THOUGHT_TOGGLE_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);

    const { container } = renderSpectator('thought-toggle-default-session');

    await waitFor(() => expect(screen.getByText('alice reasoning speech')).toBeTruthy(), { timeout: 3000 });
    const details = [...container.querySelectorAll('details')];

    expect(details).toHaveLength(2);
    expect(details.every(detail => detail.open === false)).toBe(true);
  });

  it('SpectatorScreen: 思考ログトグル ON で全 details が開き、OFF で全て閉じる', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: 思考ログ一括トグル ON/OFF がフィード内の全 ThoughtDetails の open 状態へ反映されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(THOUGHT_TOGGLE_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);
    const user = userEvent.setup();

    const { container } = renderSpectator('thought-toggle-session');

    await waitFor(() => expect(screen.getByText('alice reasoning speech')).toBeTruthy(), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '思考ログ' }));
    expect([...container.querySelectorAll('details')].every(detail => detail.open === true)).toBe(true);

    await user.click(screen.getByRole('button', { name: '思考ログ' }));
    expect([...container.querySelectorAll('details')].every(detail => detail.open === false)).toBe(true);
  });

  it('SpectatorScreen: 一括 ON 後に個別の details を閉じても他は開いたまま', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: 一括トグル後も個別の思考ログを手動開閉でき、他の details 状態に影響しないことを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(THOUGHT_TOGGLE_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);
    const user = userEvent.setup();

    const { container } = renderSpectator('thought-toggle-manual-session');

    await waitFor(() => expect(screen.getByText('alice reasoning speech')).toBeTruthy(), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '思考ログ' }));

    const details = [...container.querySelectorAll('details')];
    details[0].open = false;
    fireEvent(details[0], new Event('toggle'));

    expect(details[0].open).toBe(false);
    expect(details[1].open).toBe(true);
  });

  it('SpectatorScreen: public モードでは思考ログトグルが表示されない', async () => {
    /*
     * SUT: SpectatorScreen
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: public viewerMode では思考ログ一括トグルが表示されないことを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(THOUGHT_TOGGLE_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(AGENT_FILTER_AGENT_JSON);

    renderSpectator('thought-toggle-public-session', '?view=public');

    await waitFor(() => expect(screen.getByText('alice reasoning speech')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: '思考ログ' })).toBeNull();
  });

  it('shows CO count from real log events', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn() でモック
     * Level: integration
     * Objective: co_announcement イベントの数が TopBar の CO 表示に反映されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue(MINIMAL_JSONL);
    replayLoader.fetchReplayAgents.mockResolvedValue(MINIMAL_AGENT_JSON);

    renderSpectator('test-session-001');

    await waitFor(() => {
      const coSpan = [...document.querySelectorAll('span')].find(el => el.textContent.includes('CO'));
      expect(coSpan?.querySelector('strong')?.textContent).toBe('1');
    }, { timeout: 3000 });
    await waitForReplayLoadToSettle();
  });

  it('shows load error when fetchReplayLog rejects', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchGameBySessionId / fetchReplayLog を reject するモック
     * Level: integration
     * Objective: fetch 失敗時にエラーメッセージが表示されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockRejectedValue(new Error('network error'));
    replayLoader.fetchReplayAgents.mockResolvedValue({});

    renderSpectator('bad-session');

    await waitFor(() => expect(screen.getByText(/network error/)).toBeTruthy(), { timeout: 3000 });
    await waitForReplayLoadToSettle();
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
      <FeedItem ev={event} prevById={{}} roleAssignment={roleAssignment} sessionId="test-session" viewerMode="public" />
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
      <MemoryRouter initialEntries={['/game/test-session']}>
        <Routes>
          <Route path="/game/:sessionId" element={
            <FeedItem
              ev={{ event_type: 'inspection', agent: 'Alice', target: 'Bob', content: 'Alice inspects Bob: Werewolf', is_public: false }}
              prevById={{}} roleAssignment={roleAssignment} sessionId="test-session" viewerMode="spectator"
            />
          } />
        </Routes>
      </MemoryRouter>
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
      <MemoryRouter initialEntries={['/game/test-session']}>
        <Routes>
          <Route path="/game/:sessionId" element={
            <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="test-session" viewerMode={viewerMode} />
          } />
        </Routes>
      </MemoryRouter>
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
      <MemoryRouter initialEntries={['/game/test-session']}>
        <Routes>
          <Route path="/game/:sessionId" element={
            <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="test-session" viewerMode={mode} />
          } />
        </Routes>
      </MemoryRouter>
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
      <MemoryRouter initialEntries={['/game/test-session']}>
        <Routes>
          <Route path="/game/:sessionId" element={
            <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId="test-session" viewerMode={viewerMode} />
          } />
        </Routes>
      </MemoryRouter>
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

describe('SpectatorScreen: back button', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders a back button that navigates to /', async () => {
    /*
     * SUT: SpectatorScreen (default export)
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn()
     * Level: integration
     * Objective: 「← 一覧」ボタンが存在し、クリックするとルートに戻ることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});
    const user = userEvent.setup();

    renderSpectator('test-session-001');

    await waitFor(() => {
      expect(screen.queryByText(/読み込み中/)).toBeNull();
    }, { timeout: 3000 });

    expect(screen.getByText('← 一覧')).toBeTruthy();
    await user.click(screen.getByText('← 一覧'));
    // MemoryRouter 上で / に遷移すると SpectatorScreen がアンマウントされる
    expect(screen.queryByText('← 一覧')).toBeNull();
  });
});

describe('avatar navigation links (#485)', () => {
  const sessionId = 'test-session-nav';

  function renderWithSession(component) {
    return render(
      <MemoryRouter initialEntries={[`/game/${sessionId}`]}>
        <Routes>
          <Route path="/game/:sessionId" element={component} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('SpeechCard avatar links to agent detail page (AC: フィード発言カード Avatar)', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし
     * Level: unit
     * Objective: speech イベントの Avatar がゲーム内エージェント詳細ページへの Link を持つことを検証する（AC / #485）。
     */
    const ev = {
      day: 1, event_type: 'speech', agent: 'Alice', content: 'hello',
      speech_id: 1, reply_to: null, claimed_role: null, reasoning: null, is_public: true,
    };
    const { container } = renderWithSession(
      <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode="spectator" />
    );
    const link = container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`);
    expect(link).toBeTruthy();
  });

  it('SpeechCard avatar preserves public viewerMode query in agent detail link', () => {
    /*
     * SUT: FeedItem → SpeechCard
     * Mock: なし
     * Level: contract
     * Objective: public viewerMode の URL query が発言カード Avatar から AgentDetailScreen への Link に引き継がれることを検証する。
     */
    const ev = {
      day: 1, event_type: 'speech', agent: 'Alice', content: 'hello',
      speech_id: 1, reply_to: null, claimed_role: null, reasoning: null, is_public: true,
    };
    const { container } = render(
      <MemoryRouter initialEntries={[`/game/${sessionId}?view=public`]}>
        <Routes>
          <Route path="/game/:sessionId" element={
            <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode="public" />
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice?view=public"]`)).toBeTruthy();
  });

  it('SystemRow leftName Avatar links to agent detail page (AC: フィード SystemRow leftName)', () => {
    /*
     * SUT: FeedItem → SystemRow
     * Mock: なし
     * Level: unit
     * Objective: SystemRow の leftName Avatar がエージェント詳細ページへの Link を持つことを検証する（AC / #485）。
     */
    const ev = { day: 1, event_type: 'vote', agent: 'Alice', target: 'Bob', content: 'vote', is_public: true };
    const { container } = renderWithSession(
      <FeedItem ev={ev} prevById={{}} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode="spectator" />
    );
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`)).toBeTruthy();
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Bob"]`)).toBeTruthy();
  });

  it('RightPane alive roster Avatar links to agent detail page (AC: 右ペイン生存エージェント)', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 右ペイン生存ロスターの Avatar が AgentDetailScreen への Link を持つことを検証する（AC / #485）。
     */
    const { container } = renderWithSession(
      <RightPane
        agents={baseAgents}
        roleAssignment={{ Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' }}
        coStatus={{}}
        daySummary={{}}
        activeDay={1}
        deaths={baseDeaths}
        viewerMode="spectator"
      />
    );
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`)).toBeTruthy();
  });

  it('RightPane CO board agent name links to agent detail page (AC: 右ペイン CO ボード)', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: CO ボードに表示されているエージェント名が Link を持つことを検証する（AC / #485）。
     */
    const { container } = renderWithSession(
      <RightPane
        agents={baseAgents}
        roleAssignment={{ Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' }}
        coStatus={{ Alice: 'Seer' }}
        daySummary={{}}
        activeDay={1}
        deaths={baseDeaths}
        viewerMode="spectator"
      />
    );
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`)).toBeTruthy();
  });

  it('RightPane night action agent/target links to agent detail page (AC: 右ペイン夜の行動)', () => {
    /*
     * SUT: RightPane
     * Mock: なし
     * Level: unit
     * Objective: 夜の行動の agent / target 名が Link を持つことを検証する（AC / #485）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
        execResult: null, speechCount: 0, nightDone: false,
      },
    };
    const { container } = renderWithSession(
      <RightPane
        agents={baseAgents}
        roleAssignment={{ Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' }}
        coStatus={{}}
        daySummary={daySummary}
        activeDay={1}
        deaths={baseDeaths}
        viewerMode="spectator"
      />
    );
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`)).toBeTruthy();
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Bob"]`)).toBeTruthy();
  });

  it('RightPane vote grid from/to avatars link to agent detail page', () => {
    /*
     * SUT: RightPane (vote grid)
     * Mock: なし
     * Level: unit
     * Objective: 投票グリッドの from / to Avatar が AgentDetailScreen への Link を持つことを検証する。
     */
    const daySummary = {
      1: {
        nightActions: [],
        execResult: { target: 'Bob', votes: 1, voteTable: [{ from: 'Alice', to: 'Bob' }] },
        speechCount: 0,
        nightDone: false,
      },
    };
    const { container } = renderWithSession(
      <RightPane
        agents={baseAgents}
        roleAssignment={{ Alice: 'Seer', Bob: 'Werewolf', Carol: 'Knight' }}
        coStatus={{}}
        daySummary={daySummary}
        activeDay={1}
        deaths={baseDeaths}
        viewerMode="spectator"
      />
    );
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Alice"]`)).toBeTruthy();
    expect(container.querySelector(`a[href="/game/${sessionId}/agent/Bob"]`)).toBeTruthy();
  });

  it('LeftPane filter chip does NOT link to agent detail (AC: 左ペインフィルターは対象外)', () => {
    /*
     * SUT: LeftPane
     * Mock: なし
     * Level: unit
     * Objective: 左ペインの「参加者で絞る」フィルターチップが Link を持たないことを検証する（AC / #485）。
     */
    const { container } = renderWithSession(
      <LeftPane
        activeDay={1} activePhase="discuss" setDay={vi.fn()} setPhase={vi.fn()}
        days={[1]} agentNames={['Alice', 'Bob']}
        daySummary={{ 1: { execResult: null, nightDone: false, nightActions: [], speechCount: 0 } }}
      />
    );
    const filterChips = container.querySelectorAll('[class*="filtRow"] button');
    filterChips.forEach(chip => {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip.closest('a')).toBeNull();
    });
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
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});
    const user = userEvent.setup();

    renderSpectator('test-session-001');

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

  it('initializes public mode from ?view=public after reload', async () => {
    /*
     * SUT: SpectatorScreen viewerMode URL state
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn()
     * Level: contract
     * Objective: URL 直打ち/リロード相当の初期表示で ?view=public が public viewerMode として反映されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});

    renderSpectator('test-session-001', '?view=public');

    await waitFor(() => {
      expect(screen.queryByText(/読み込み中/)).toBeNull();
    }, { timeout: 3000 });

    expect(screen.getByText(/参加者視点/)).toBeTruthy();
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/test-session-001?view=public');
  });

  it('writes viewerMode toggle changes to the URL query', async () => {
    /*
     * SUT: SpectatorScreen viewerMode toggle
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents を vi.fn()
     * Level: contract
     * Objective: viewerMode トグル操作が ?view=public の付与/削除として URL に反映されることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});
    const user = userEvent.setup();

    renderSpectator('test-session-001');

    await waitFor(() => {
      expect(screen.queryByText(/読み込み中/)).toBeNull();
    }, { timeout: 3000 });

    await user.click(screen.getByText(/観戦者モード/));
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/test-session-001?view=public');

    await user.click(screen.getByText(/参加者視点/));
    expect(screen.getByLabelText('current-location').textContent).toBe('/game/test-session-001');
  });
});

describe('RightPane: avatars in CO status and night actions (#403)', () => {
  it('統合: RightPane: CO済みエージェント行にアバターアイコンと名前テキストが表示される', () => {
    /*
     * SUT: RightPane (CoStatusBoard)
     * Mock: なし
     * Level: integration
     * Objective: coStatus に Seer: Alice がある場合、COボード内に Alice のアバター画像と名前テキストが Link で表示されることを検証する（AC-1）。
     */
    const { container } = renderRightPane({
      coStatus: { Alice: 'Seer' },
    });
    const coBoard = container.querySelector('[aria-label="カミングアウト状況"]');
    const aliceImg = coBoard.querySelector('img[src*="Alice"]');
    expect(aliceImg).toBeTruthy();
    const aliceLabel = coBoard.querySelector('[data-testid="avatar-label"]');
    expect(aliceLabel).toBeTruthy();
    expect(aliceLabel.textContent).toBe('Alice');
    expect(aliceImg.closest('a')).toBeTruthy();
  });

  it('統合: CoStatusBoard: 役職名ラベルが RoleTag バッジで表示される', () => {
    /*
     * SUT: RightPane (CoStatusBoard)
     * Mock: なし
     * Level: integration
     * Objective: COボード各行の役職名ラベル（旧 .coRole）が独自 span ではなく RoleTag（styles.tag 付与）で描画されることを検証する (AC-1, AC-2, AC-5)。
     */
    const { container } = renderRightPane({
      coStatus: { Alice: 'Seer' },
    });
    const coBoard = container.querySelector('[aria-label="カミングアウト状況"]');
    const roleLabel = within(coBoard).getByText('占い師');
    expect(roleLabel.classList.contains(roleTagStyles.tag)).toBe(true);
    expect(roleLabel.classList.contains(styles.coBoardRole)).toBe(true);
  });

  it('統合: RightPane: 夜の行動actor行にアバターと名前が表示される', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: nightActions に inspection(agent=Alice) がある場合、夜の行動リスト内に Alice のアバター画像と名前テキストが表示されることを検証する（AC-2）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');
    const aliceImg = actionList.querySelector('img[src*="Alice"]');
    expect(aliceImg).toBeTruthy();
    const labels = actionList.querySelectorAll('[data-testid="avatar-label"]');
    const aliceLabel = Array.from(labels).find(el => el.textContent === 'Alice');
    expect(aliceLabel).toBeTruthy();
  });

  it('統合: RightPane: 夜の行動ターゲット行にアバターと名前が表示される', () => {
    /*
     * SUT: RightPane (NightActionsPanel)
     * Mock: なし
     * Level: integration
     * Objective: nightActions に target=Bob がある場合、夜の行動リスト内に Bob のアバター画像と名前テキストが表示されることを検証する（AC-2）。
     */
    const daySummary = {
      1: {
        nightActions: [{ event_type: 'inspection', agent: 'Alice', target: 'Bob', is_public: false }],
        execResult: null,
        speechCount: 0,
        nightDone: true,
      },
    };
    const { container } = renderRightPane({ daySummary, activeDay: 1 });
    const actionList = container.querySelector('[aria-label="Day 1 夜の行動"]');
    const bobImg = actionList.querySelector('img[src*="Bob"]');
    expect(bobImg).toBeTruthy();
    const labels = actionList.querySelectorAll('[data-testid="avatar-label"]');
    const bobLabel = Array.from(labels).find(el => el.textContent === 'Bob');
    expect(bobLabel).toBeTruthy();
  });
});

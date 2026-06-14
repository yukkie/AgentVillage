import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AgentDetailScreen from './AgentDetailScreen.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- fixture: game_stats.json 形状（DataSpec §6） ---
const STATS_FIXTURE = {
  games: [
    {
      game_id: '2026-05-09T18:10:31',
      winner: 'Villagers',
      players: [
        { name: 'Nox', role: 'Seer', faction: 'village', model: 'm', survived: true, won: true },
        { name: 'Kai', role: 'Werewolf', faction: 'werewolf', model: 'm', survived: false, won: false },
      ],
    },
    {
      game_id: '2026-05-10T10:29:27',
      winner: 'Werewolves',
      players: [
        { name: 'Nox', role: 'Villager', faction: 'village', model: 'm', survived: false, won: false },
        { name: 'Kai', role: 'Werewolf', faction: 'werewolf', model: 'm', survived: true, won: true },
      ],
    },
  ],
};

function mockFetchOk(data) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }));
}

// global mode fetch mock: /stats/game_stats.json と /config/agents.json を出し分ける（#519）。
// configBlurbs=null で blurb fetch だけ失敗させ、フォールバック（—）を検証する。
function mockGlobalFetch({ stats, configBlurbs }) {
  vi.stubGlobal('fetch', vi.fn(url => {
    const path = String(url);
    if (path === '/config/agents.json') {
      return configBlurbs
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(configBlurbs) })
        : Promise.resolve({ ok: false, status: 500 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(stats) });
  }));
}

// blurb fixture（/config/agents.json 形状・#519）。fetch mock が /config/agents.json に返す。
const CONFIG_FIXTURE = [
  { name: 'Nox', blurb: 'Quiet as a moonless night, he finds the frayed edge in everything you say.' },
  { name: 'Mira', blurb: 'Stands where instinct meets logic and smells a lie before it forms.' },
];

function mockGameScopedFetch({ indexEntry, jsonlText, agentJsonByName, configBlurbs = CONFIG_FIXTURE }) {
  vi.stubGlobal('fetch', vi.fn(url => {
    const path = String(url);
    if (path === '/state_archive/index.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([indexEntry]) });
    }
    if (path === '/config/agents.json') {
      return configBlurbs
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(configBlurbs) })
        : Promise.resolve({ ok: false, status: 500 });
    }
    if (path.endsWith('/spectator_log.jsonl')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(jsonlText) });
    }
    const agentEntry = Object.entries(agentJsonByName).find(([name]) => path.endsWith(`/agents/${name.toLowerCase()}.json`));
    if (agentEntry) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(agentEntry[1]) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }));
}

const GAME_SCOPED_INDEX = {
  session_id: 'session-real-001',
  title: '桜霞村',
  days: 2,
  cast: ['Nox', 'Mira', 'Kai'],
};

const GAME_SCOPED_JSONL = [
  { id: 's1', day: 1, event_type: 'speech', agent: 'Nox', speech_id: 1, content: '私は占い師です', is_public: true, reasoning: 'Kaiが怪しい。', claimed_role: 'Seer' },
  { id: 's2', day: 1, event_type: 'speech', agent: 'Mira', speech_id: 2, content: '了解です', is_public: true },
  { id: 'i1', day: 1, event_type: 'inspection', agent: 'Nox', target: 'Kai', content: 'Nox inspects Kai: Werewolf', is_public: false, reasoning: 'Kaiの視点漏れを確認する。' },
  { id: 'g1', day: 1, event_type: 'guard', agent: 'Nox', target: 'Mira', content: 'Nox guards Mira', is_public: false, reasoning: 'Miraを守る価値が高い。' },
  { id: 'a1', day: 1, event_type: 'night_attack', agent: 'Nox', target: 'Mira', content: 'Nox attacks Mira', is_public: false, reasoning: '護衛が薄い。' },
  { id: 's3', day: 2, event_type: 'speech', agent: 'Nox', speech_id: 3, content: 'Kaiを疑います', is_public: true },
  { id: 'u1', day: 2, event_type: 'suspicion_update', agent: 'Nox', is_public: false, suspicion_snapshot: { Kai: 0.86, Mira: 0.24 } },
].map(event => JSON.stringify(event)).join('\n');

const GAME_SCOPED_AGENTS = {
  Nox: {
    profile: { name: 'Nox', model: 'm', persona: {} },
    state: { is_alive: true, beliefs: { Kai: { suspicion: 0.7 }, Mira: { suspicion: 0.2 } }, claimed_role: 'Seer' },
    role: 'Seer',
  },
  Mira: {
    profile: { name: 'Mira', model: 'm', persona: {} },
    state: { is_alive: true, beliefs: {}, claimed_role: null },
    role: 'Villager',
  },
  Kai: {
    profile: { name: 'Kai', model: 'm', persona: {} },
    state: { is_alive: false, beliefs: {}, claimed_role: null },
    role: 'Werewolf',
  },
};

function mockGameScopedReplay() {
  mockGameScopedFetch({
    indexEntry: GAME_SCOPED_INDEX,
    jsonlText: GAME_SCOPED_JSONL,
    agentJsonByName: GAME_SCOPED_AGENTS,
  });
}

function renderGameScoped({ sessionId = 'test-session-001', agentName = 'Nox', search = '' } = {}) {
  if (!vi.isMockFunction(globalThis.fetch)) {
    mockGameScopedFetch({
      indexEntry: { ...GAME_SCOPED_INDEX, session_id: sessionId, title: sessionId },
      jsonlText: GAME_SCOPED_JSONL,
      agentJsonByName: GAME_SCOPED_AGENTS,
    });
  }
  return render(
    <MemoryRouter initialEntries={[`/game/${sessionId}/agent/${agentName}${search}`]}>
      <Routes>
        <Route path="/game/:sessionId/agent/:agentName" element={<AgentDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderGlobal(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/agent/:agentName" element={<AgentDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

// --- game-scoped mode（スタブ非依存の配線テスト。実データ化は別 Issue） ---

describe('AgentDetailScreen game-scoped breadcrumbs', () => {
  it('renders game-scoped breadcrumbs when sessionId is present', () => {
    /*
     * SUT: AgentDetailScreen TopBar crumbs
     * Mock: なし
     * Level: component
     * Objective: /game/:sessionId/agent/:agentName では sessionId が含まれるパンくずが表示されることを検証する。
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.getByText('test-session-001')).toBeTruthy();
  });

  it('preserves public viewerMode query in the game breadcrumb link', () => {
    /*
     * SUT: AgentDetailScreen TopBar crumbs
     * Mock: なし
     * Level: contract
     * Objective: AgentDetailScreen からゲーム画面へ戻るパンくずが ?view=public を引き継ぐことを検証する。
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox', search: '?view=public' });

    expect(screen.getByRole('link', { name: 'test-session-001' }).getAttribute('href')).toBe('/game/test-session-001?view=public');
  });

  it('preserves public viewerMode query in game-scoped agent picker links', async () => {
    /*
     * SUT: AgentDetailScreen LeftPane
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: contract
     * Objective: game-scoped AgentDetailScreen の AgentPicker 内リンクが ?view=public を引き継ぐことを検証する。
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox', search: '?view=public' });

    expect((await screen.findByRole('link', { name: /Mira/ })).getAttribute('href')).toBe('/game/test-session-001/agent/Mira?view=public');
  });
});

describe('AgentDetailScreen game-scoped stub-only UI cleanup', () => {
  it('game-scoped TopBar removes stub-only action buttons', () => {
    /*
     * SUT: AgentDetailScreen TopBar
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: integration
     * Objective: game-scoped AgentDetailScreen の TopBar から stub-only action buttons が撤去されることを検証する (AC-1)
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.queryByText(/LIVE観戦中/)).toBeNull();
    expect(screen.queryByText(/プロファイルJSON/)).toBeNull();
    expect(screen.queryByText(/ウォッチ/)).toBeNull();
  });

  it('game-scoped TopBar toggles viewerMode query like SpectatorScreen', async () => {
    /*
     * SUT: AgentDetailScreen TopBar viewerMode toggle
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: contract
     * Objective: game-scoped mode のみに viewerMode トグルがあり、SpectatorScreen と同じ query 遷移を行うことを検証する (AC-2)
     */
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    const spectatorToggle = screen.getByRole('button', { name: /観戦者モード/ });
    await user.click(spectatorToggle);
    expect(screen.getByRole('button', { name: /参加者視点/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'test-session-001' }).getAttribute('href')).toBe('/game/test-session-001?view=public');

    await user.click(screen.getByRole('button', { name: /参加者視点/ }));
    expect(screen.getByRole('button', { name: /観戦者モード/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'test-session-001' }).getAttribute('href')).toBe('/game/test-session-001');
  });

  it('game-scoped left pane removes sort controls', () => {
    /*
     * SUT: AgentDetailScreen LeftPane
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: integration
     * Objective: 左ペインの onClick なし並べ替えボタンが撤去されることを検証する (AC-3)
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.queryByRole('button', { name: /発言数/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /容疑度/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /役職別/ })).toBeNull();
  });

  it('game-scoped removes cheers goal and pseudo thought timestamps', () => {
    /*
     * SUT: AgentDetailScreen game-scoped center pane
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: integration
     * Objective: 応援スコア・現在の目標・thought 疑似時刻が撤去されることを検証する (AC-4)
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.queryByText('応援スコア')).toBeNull();
    expect(screen.queryByText(/現在の目標/)).toBeNull();
    expect(screen.queryByText(/^\d{1,2}:\d{2}$/)).toBeNull();
  });

  it('game-scoped removes suspicion tab and right pane night actions', () => {
    /*
     * SUT: AgentDetailScreen game-scoped tabs and RightPane
     * Mock: global fetch（game-scoped replay fixture を返す）
     * Level: integration
     * Objective: 「疑い・信頼」タブと右ペインの「夜の行動」パネルが撤去されることを検証する (AC-5)
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.queryByRole('button', { name: '疑い・信頼' })).toBeNull();
    expect(screen.queryByText('夜の行動')).toBeNull();
  });
});

describe('AgentDetailScreen game-scoped real data', () => {
  it('game-scoped renders real role and faction from agent json in spectator mode', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: agent JSON の role から役職タグと所属陣営を spectator mode に表示することを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByRole('heading', { name: 'Nox' })).toBeTruthy();
    expect(screen.getAllByText('占い師').length).toBeGreaterThan(0);
    expect(screen.getByText(/村人陣営/)).toBeTruthy();
  });

  it('game-scoped renders session label and alive status from real data', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: session メタと agent JSON の state.is_alive から session ラベルと生死・Day 表示を描画することを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    await screen.findByRole('heading', { name: 'Nox' });
    expect(screen.getAllByText(/session-real-001/).length).toBeGreaterThan(0);
    expect(screen.getByText(/生存中 · Day 2/)).toBeTruthy();
  });

  it('game-scoped renders real speech count and AgentRosterRow links', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: speech イベントから対象 agent の本村発言数を数え、左ペインを実参加者リンクで描画することを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    await screen.findByRole('heading', { name: 'Nox' });
    expect(screen.getByText('2')).toBeTruthy();
    const picker = screen.getByRole('list', { name: 'エージェント一覧' });
    expect(within(picker).getByRole('link', { name: /Mira/ }).getAttribute('href')).toBe('/game/session-real-001/agent/Mira');
    expect(within(picker).getByRole('link', { name: /Kai/ }).getAttribute('href')).toBe('/game/session-real-001/agent/Kai');
  });

  it('game-scoped public mode hides role faction and suspicion matrix', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: public viewerMode で真役職・所属陣営・疑念マトリクスを非表示にすることを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox', search: '?view=public' });

    await screen.findByRole('heading', { name: 'Nox' });
    expect(screen.queryByText(/村人陣営/)).toBeNull();
    expect(screen.queryByText('疑い度マトリクス')).toBeNull();
  });

  it('game-scoped does not create real trust data from agent json', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: agents/*.json に存在しない trust 相当フィールドを実データとして新設表示しないことを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    await screen.findByRole('heading', { name: 'Nox' });
    expect(screen.queryByText('信頼度')).toBeNull();
  });

  it('game-scoped shows an error message when replay loading fails', async () => {
    /*
     * SUT: AgentDetailScreen (game-scoped mode)
     * Mock: global fetch（state_archive/index.json の取得失敗）
     * Level: integration
     * Objective: game-scoped 実データ取得が失敗したとき、エラー表示にフォールバックすることを検証する。
     */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByText(/Failed to fetch game list/)).toBeTruthy();
  });
});

describe('AgentDetailScreen game-scoped day timeline', () => {
  it('game-scoped renders day tabs and switches the agent timeline day', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: 中央ペインの Day タブをクリックすると、選択日の対象エージェント timeline に切り替わることを検証する。
     */
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByRole('tab', { name: 'Day1' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Day2' })).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'Day1' }).getAttribute('id')).toBe('agent-day-panel-1');
    expect(screen.getByRole('tab', { name: 'Day1' }).getAttribute('aria-controls')).toBe('agent-day-panel-1');
    expect(screen.getByText('私は占い師です')).toBeTruthy();
    expect(screen.queryByText('Kaiを疑います')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Day2' }));
    expect(screen.getByRole('tabpanel', { name: 'Day2' }).getAttribute('id')).toBe('agent-day-panel-2');
    expect(screen.getByText('Kaiを疑います')).toBeTruthy();
    expect(screen.queryByText('私は占い師です')).toBeNull();
  });

  it('game-scoped renders selected agent speech and spectator reasoning through FeedItem', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: 対象エージェントの speech が FeedItem 経由で表示され、spectator mode では reasoning を確認できることを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByText('私は占い師です')).toBeTruthy();
    expect(screen.getAllByText('思考ログを読む').length).toBeGreaterThan(0);
    expect(screen.getByText('Kaiが怪しい。')).toBeTruthy();
  });

  it('game-scoped renders selected agent private night actions through shared feed rows', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: 対象エージェントの inspection / guard / private night_attack が共通 FeedItem/SystemRow 表示で描画されることを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByText('占い結果')).toBeTruthy();
    expect(screen.getByText('Nox inspects Kai: Werewolf')).toBeTruthy();
    expect(screen.getByText('護衛')).toBeTruthy();
    expect(screen.getByText('Nox guards Mira')).toBeTruthy();
    expect(screen.getByText('人狼の襲撃')).toBeTruthy();
    expect(screen.getByText('Nox attacks Mira')).toBeTruthy();
  });

  it('game-scoped public mode locks reasoning and hides private night actions', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: public mode では speech reasoning がロック表示になり、private 夜行動は非表示になることを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox', search: '?view=public' });

    expect(await screen.findByText('私は占い師です')).toBeTruthy();
    expect(screen.getByText('🔒 思考ログ')).toBeTruthy();
    expect(screen.queryByText('Kaiが怪しい。')).toBeNull();
    expect(screen.queryByText('Nox inspects Kai: Werewolf')).toBeNull();
    expect(screen.queryByText('Nox guards Mira')).toBeNull();
    expect(screen.queryByText('Nox attacks Mira')).toBeNull();
  });

  it('game-scoped timeline uses FeedItem semantics for speech links and system rows', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json を返す）
     * Level: integration
     * Objective: 中央タイムラインが FeedItem のリンク・SystemRow 表示契約を使って描画されることを検証する。
     */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByText('私は占い師です')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Nox/ }).some(link => (
      link.getAttribute('href') === '/game/session-real-001/agent/Nox'
    ))).toBe(true);
    expect(screen.getByText('占い結果')).toBeTruthy();
    expect(screen.getByText('人狼の襲撃')).toBeTruthy();
  });

  it('game-scoped timeline shows an empty state when no Day events exist', async () => {
    /*
     * SUT: AgentDetailScreen game-scoped day timeline
     * Mock: global fetch（day=0 のみの spectator_log.jsonl と agents/*.json を返す）
     * Level: integration
     * Objective: Day1 以降のイベントが無い game-scoped archive では Day タブを出さず空状態を表示することを検証する。
     */
    mockGameScopedFetch({
      indexEntry: { session_id: 'session-empty-001', title: '空村', days: 0, cast: ['Nox'] },
      jsonlText: JSON.stringify({ id: 'r0', day: 0, event_type: 'role_assigned', agent: 'Nox', is_public: false }),
      agentJsonByName: { Nox: GAME_SCOPED_AGENTS.Nox },
    });
    renderGameScoped({ sessionId: 'session-empty-001', agentName: 'Nox' });

    expect(await screen.findByText('このゲームの Day イベントはありません。')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Day1' })).toBeNull();
  });
});

// --- global profile mode（#522・実データ化） ---

describe('AgentDetailScreen(global)', () => {
  it('エージェント名と img[alt=name] が描画される', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: 名前見出しと alt=name の Avatar img が描画されることを検証する (AC-6)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox');

    expect(await screen.findByRole('heading', { name: 'Nox' })).toBeTruthy();
    // Hero + 左ペインの双方に Avatar(alt=Nox) が出る。1つ以上あれば AC-6 を満たす。
    expect(screen.getAllByAltText('Nox').length).toBeGreaterThan(0);
  });

  it('左ペインに全エージェントの /agent/{name} リンクが描画される', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: 左ペインが全エージェント名の /agent/{encodeURIComponent(name)} リンク集になることを検証する (AC-3)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox');

    const list = await screen.findByRole('list', { name: 'エージェント一覧' });
    const noxLink = within(list).getByRole('link', { name: /Nox/ });
    expect(noxLink.getAttribute('href')).toBe('/agent/Nox');
    const kaiLink = within(list).getByRole('link', { name: /Kai/ });
    expect(kaiLink.getAttribute('href')).toBe('/agent/Kai');
  });

  it('game-scoped 固有の要素（session ラベル・疑念マトリクス・夜の行動・推論ログ）が存在しない', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: global mode で1ゲーム固有 UI が描画されないことを検証する (AC-4)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox');
    await screen.findByRole('heading', { name: 'Nox' });

    expect(screen.queryByText('疑い度マトリクス')).toBeNull();
    expect(screen.queryByText('推論ログ', { exact: false })).toBeNull();
    expect(screen.queryByText('夜の行動')).toBeNull();
    expect(screen.queryByText(/桜霞村/)).toBeNull();
    expect(screen.queryByText('生存中', { exact: false })).toBeNull();
  });

  it('?view=public でも表示内容が変わらず viewerMode トグルが出ない', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: viewerMode による出し分けを行わない（public でも内容不変・トグル UI なし）ことを検証する (AC-5)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox?view=public');
    await screen.findByRole('heading', { name: 'Nox' });

    expect(screen.queryByText('観戦者モード')).toBeNull();
    expect(screen.queryByText('参加者視点')).toBeNull();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('勝率・通算成績が game_stats.json の集計値で表示される', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: 勝率・通算成績が parseGameStats の集計結果で描画されることを検証する (AC-1)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox');
    await screen.findByRole('heading', { name: 'Nox' });

    // Nox: 2戦1勝 → 勝率 50%
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getAllByText(/2\s*戦/).length).toBeGreaterThan(0);
  });

  it('過去戦績一覧に gameId・role 列・勝敗が表示される', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: 過去戦績一覧に session_id(=game_id)・role 列・勝敗が表示されることを検証する (AC-2)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Nox');
    const history = await screen.findByRole('list', { name: '過去の戦績' });

    expect(within(history).getByText('2026-05-10T10:29:27')).toBeTruthy();
    expect(within(history).getByText('2026-05-09T18:10:31')).toBeTruthy();
    // role 列（AC-2 で許可）— Seer の日本語名
    expect(within(history).getByText('占い師')).toBeTruthy();
  });

  it('存在しない agent でも名前・アバターを表示し成績は 0 になる', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（game_stats.json を返す）
    Level: integration
    Objective: game_stats.json に無い名前でも名前・アバターを描画し成績 0 を表示することを検証する (AC-7)
    */
    mockFetchOk(STATS_FIXTURE);
    renderGlobal('/agent/Unknown');

    expect(await screen.findByRole('heading', { name: 'Unknown' })).toBeTruthy();
    expect(screen.getByAltText('Unknown')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('fetch 失敗時に error 表示を出す', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode)
    Mock: global fetch（ok:false）
    Level: integration
    Objective: fetch 失敗時に error 表示へフォールバックすることを検証する (AC-7)
    */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderGlobal('/agent/Nox');

    await waitFor(() => {
      expect(screen.getByText(/読み込め|エラー/)).toBeTruthy();
    });
  });
});

// --- blurb 実データ化（#519・両モード共通） ---

describe('AgentDetailScreen blurb', () => {
  it('統合: global mode が config の blurb をヒーローに表示する', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode) GlobalHero blurb
    Mock: global fetch（game_stats.json と /config/agents.json を出し分ける）
    Level: integration
    Objective: global mode のヒーローが /config/agents.json 由来の blurb を表示することを検証する (AC-2)
    */
    mockGlobalFetch({ stats: STATS_FIXTURE, configBlurbs: CONFIG_FIXTURE });
    renderGlobal('/agent/Nox');

    expect(await screen.findByText('Quiet as a moonless night, he finds the frayed edge in everything you say.')).toBeTruthy();
  });

  it('統合: game-scoped mode が config の blurb をヒーローに表示する', async () => {
    /*
    SUT: AgentDetailScreen (game-scoped mode) AgentHero blurb
    Mock: global fetch（state_archive/index.json, spectator_log.jsonl, agents/*.json, /config/agents.json を返す）
    Level: integration
    Objective: game-scoped mode のヒーローが /config/agents.json 由来の blurb を表示することを検証する (AC-2)
    */
    mockGameScopedReplay();
    renderGameScoped({ sessionId: 'session-real-001', agentName: 'Nox' });

    expect(await screen.findByText('Quiet as a moonless night, he finds the frayed edge in everything you say.')).toBeTruthy();
  });

  it('統合: blurb fetch 失敗時もヒーロー本体を表示しフォールバックする', async () => {
    /*
    SUT: AgentDetailScreen (global profile mode) GlobalHero blurb fallback
    Mock: global fetch（game_stats.json は成功・/config/agents.json のみ失敗）
    Level: integration
    Objective: blurb fetch が失敗してもヒーロー本体（名前・勝率）を描画し、blurb は — にフォールバックすることを検証する (AC-4)
    */
    mockGlobalFetch({ stats: STATS_FIXTURE, configBlurbs: null });
    renderGlobal('/agent/Nox');

    expect(await screen.findByRole('heading', { name: 'Nox' })).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

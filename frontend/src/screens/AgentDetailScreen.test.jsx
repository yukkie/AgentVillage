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

function renderGameScoped({ sessionId = 'test-session-001', agentName = 'Nox', search = '' } = {}) {
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

  it('preserves public viewerMode query in game-scoped agent picker links', () => {
    /*
     * SUT: AgentDetailScreen LeftPane
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
     * Level: contract
     * Objective: game-scoped AgentDetailScreen の AgentPicker 内リンクが ?view=public を引き継ぐことを検証する。
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox', search: '?view=public' });

    expect(screen.getByRole('link', { name: /Mira/ }).getAttribute('href')).toBe('/game/test-session-001/agent/Mira?view=public');
  });
});

describe('AgentDetailScreen game-scoped stub-only UI cleanup', () => {
  it('game-scoped TopBar removes stub-only action buttons', () => {
    /*
     * SUT: AgentDetailScreen TopBar
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
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
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
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
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
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
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
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
     * Mock: なし（stub/agentDetail.js の既存スタブデータを使用）
     * Level: integration
     * Objective: 「疑い・信頼」タブと右ペインの「夜の行動」パネルが撤去されることを検証する (AC-5)
     */
    renderGameScoped({ sessionId: 'test-session-001', agentName: 'Nox' });

    expect(screen.queryByRole('button', { name: '疑い・信頼' })).toBeNull();
    expect(screen.queryByText('夜の行動')).toBeNull();
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import * as archiveLoader from './lib/archiveLoader.js';
import * as replayLoader from './lib/replayLoader.js';

vi.mock('./lib/archiveLoader.js', async (importOriginal) => ({
  // Keep the real pure functions (parseGameStats / parseAllAgentNames etc.),
  // mock only the fetch-boundary functions.
  ...(await importOriginal()),
  fetchGameList: vi.fn().mockResolvedValue([]),
  fetchGameBySessionId: vi.fn(),
  fetchGameStats: vi.fn().mockResolvedValue({ games: [] }),
}));

vi.mock('./lib/replayLoader.js', () => ({
  fetchReplayLog: vi.fn(),
  fetchReplayAgents: vi.fn(),
  fetchReplayGame: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('App routing contract', () => {
  it('renders GameListScreen at /', async () => {
    /*
     * SUT: App (Routes)
     * Mock: fetchGameList
     * Level: integration
     * Objective: "/" が GameListScreen をレンダリングすることを検証する。
     */
    archiveLoader.fetchGameList.mockResolvedValue([]);

    renderAt('/');

    expect(screen.getByText(/新しい村を作る/)).toBeTruthy();
  });

  it('renders SpectatorScreen at /game/:sessionId', async () => {
    /*
     * SUT: App (Routes)
     * Mock: fetchGameBySessionId / fetchReplayLog / fetchReplayAgents
     * Level: integration
     * Objective: "/game/:sessionId" が SpectatorScreen をレンダリングすることを検証する。
     */
    archiveLoader.fetchGameBySessionId.mockResolvedValue({ cast: [] });
    replayLoader.fetchReplayLog.mockResolvedValue('');
    replayLoader.fetchReplayAgents.mockResolvedValue({});

    renderAt('/game/test-session-001');

    expect(screen.getByRole('navigation', { name: 'パンくず' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /新しい村を作る/ })).toBeNull();
  });

  it('renders AgentDetailScreen (game-scoped) at /game/:sessionId/agent/:agentName', () => {
    /*
     * SUT: App (Routes)
     * Mock: なし（AgentDetailScreen はスタブデータ）
     * Level: integration
     * Objective: "/game/:sessionId/agent/:agentName" が AgentDetailScreen を game-scoped mode でレンダリングすることを検証する。
     */
    renderAt('/game/test-session-001/agent/Nox');

    // パンくずに sessionId が含まれていれば game-scoped mode
    expect(screen.getByText('test-session-001')).toBeTruthy();
  });

  it('renders AgentDetailScreen (global mode) at /agent/:agentName', () => {
    /*
     * SUT: App (Routes)
     * Mock: なし（AgentDetailScreen はスタブデータ）
     * Level: integration
     * Objective: "/agent/:agentName" が AgentDetailScreen を global profile mode でレンダリングすることを検証する。
     */
    renderAt('/agent/Nox');

    // global mode ではパンくずに sessionId がない
    expect(screen.queryByText('test-session-001')).toBeNull();
    expect(screen.getAllByText('Nox').length).toBeGreaterThan(0);
  });

  it.each(['/foo', '/game', '/game/'])('renders the 404 fallback at %s', (path) => {
    /*
     * SUT: App (Routes)
     * Mock: なし
     * Level: integration
     * Objective: no-match URL が白画面ではなく 404 fallback をレンダリングすることを検証する。
     */
    renderAt(path);

    expect(screen.getByRole('heading', { name: '404 - Not Found' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '銀色の狼の404アイコン' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '村の一覧へ戻る' }).getAttribute('href')).toBe('/');
  });
});

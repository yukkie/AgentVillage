import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import GameListScreen from './GameListScreen.jsx';
import * as archiveLoader from '../lib/archiveLoader.js';

vi.mock('../lib/archiveLoader.js', () => ({
  fetchGameList: vi.fn(),
}));

const game = {
  id: '20260510_102927',
  title: '【第12回】「黎明の小径」— 狼勝利',
  tag: '完了',
  live: false,
  hot: false,
  day: 3,
  winner: 'wolf',
  winnerLabel: '狼陣営勝',
  rule: '標準11人',
  votes: 0,
  comments: 0,
  viewers: null,
  cast: ['Kael', 'Kai', 'Mira'],
  desc: '狂人 Kael の超積極投票で村が分断',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockGameList(games = [game]) {
  archiveLoader.fetchGameList.mockResolvedValue(games);
}

function renderGameList() {
  return render(
    <MemoryRouter>
      <GameListScreen />
    </MemoryRouter>
  );
}

describe('GameListScreen GameCard semantics', () => {
  it('exposes each game card as an article named by session id', async () => {
    /**
     * SUT: GameListScreen / GameCard
     * Mock: fetchGameList（state_archive index の取得を固定）
     * Level: component
     * Objective: GameCard が article role と session_id 由来の accessible name で安定特定できることを検証する。
     */
    mockGameList();

    renderGameList();

    const card = await screen.findByRole('article', { name: '20260510_102927' });

    expect(card).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: game.title })).toBeTruthy();
  });

  it('renders a link to /game/:sessionId for each game card', async () => {
    /**
     * SUT: GameListScreen / GameCard
     * Mock: fetchGameList（state_archive index の取得を固定）
     * Level: component
     * Objective: Router 化後、GameCard が /game/:id へのリンクを持つことを検証する。
     */
    mockGameList();

    renderGameList();

    await screen.findByRole('article', { name: '20260510_102927' });
    const link = screen.getByRole('link', { name: new RegExp(game.title) });
    expect(link.getAttribute('href')).toBe('/game/20260510_102927');
  });
});

describe('GameListScreen list semantics', () => {
  it('exposes side navigation and right widgets as semantic lists', async () => {
    /*
     * SUT: GameListScreen / LeftPane / RightPane
     * Mock: fetchGameList（state_archive index の取得を固定）
     * Level: component
     * Objective: 左サイドナビと右ウィジェットの項目群が list/listitem role で特定できることを検証する。
     */
    mockGameList();

    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    const sideNav = screen.getByRole('navigation', { name: 'ゲーム一覧サイドナビ' });
    expect(within(sideNav).getAllByRole('list').length).toBeGreaterThanOrEqual(4);
    expect(within(sideNav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);

    const ranking = screen.getByRole('list', { name: '今週の勝率トップ' });
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(5);

    const posts = screen.getByRole('list', { name: '観戦コミュニティ' });
    expect(within(posts).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('renders agent links to /agent/:agentName in top agents and ranking', async () => {
    /*
     * SUT: GameListScreen / LeftPane / RightPane
     * Mock: fetchGameList
     * Level: component
     * Objective: 左ペイン「注目エージェント」と右ペイン「勝率トップ」が /agent/:name へのリンクを持つことを検証する。
     */
    mockGameList();

    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    const agentLinks = screen.getAllByRole('link').filter(
      l => l.getAttribute('href')?.startsWith('/agent/')
    );
    expect(agentLinks.length).toBeGreaterThan(0);
  });
});

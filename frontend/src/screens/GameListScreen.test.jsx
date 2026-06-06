import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

describe('GameListScreen GameCard semantics', () => {
  it('exposes each game card as an article named by session id', async () => {
    /**
     * SUT: GameListScreen / GameCard
     * Mock: fetchGameList（state_archive index の取得を固定）
     * Level: component
     * Objective: GameCard が article role と session_id 由来の accessible name で安定特定できることを検証する。
     */
    mockGameList();

    render(<GameListScreen />);

    const card = await screen.findByRole('article', { name: '20260510_102927' });

    expect(card).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: game.title })).toBeTruthy();
  });

  it('opens the selected game when the card body button is clicked', async () => {
    /**
     * SUT: GameListScreen / GameCard
     * Mock: fetchGameList（state_archive index の取得を固定）
     * Level: component
     * Objective: semantic button 化後もカード選択で onOpenGame に選択 game が渡ることを検証する。
     */
    const onOpenGame = vi.fn();
    const user = userEvent.setup();
    mockGameList();

    render(<GameListScreen onOpenGame={onOpenGame} />);

    await user.click(await screen.findByRole('button', { name: new RegExp(game.title) }));

    await waitFor(() => {
      expect(onOpenGame).toHaveBeenCalledWith(game);
    });
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

    render(<GameListScreen />);
    await screen.findByRole('article', { name: '20260510_102927' });

    const sideNav = screen.getByRole('navigation', { name: 'ゲーム一覧サイドナビ' });
    expect(within(sideNav).getAllByRole('list').length).toBeGreaterThanOrEqual(4);
    expect(within(sideNav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);

    const ranking = screen.getByRole('list', { name: '今週の勝率トップ' });
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(5);

    const posts = screen.getByRole('list', { name: '観戦コミュニティ' });
    expect(within(posts).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

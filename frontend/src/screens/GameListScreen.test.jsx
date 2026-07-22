import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import GameListScreen from './GameListScreen.jsx';
import * as archiveLoader from '../lib/archiveLoader.js';

vi.mock('../lib/archiveLoader.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchGameList: vi.fn(),
  fetchGameStats: vi.fn(),
}));

const game = {
  id: '20260510_102927',
  title: '【第12回】「黎明の小径」— 狼勝利',
  tag: '完了',
  live: false,
  day: 3,
  winner: 'wolf',
  winnerLabel: '狼陣営勝',
  rule: '標準11人',
  viewers: null,
  cast: ['Kael', 'Kai', 'Mira'],
  desc: '狂人 Kael の超積極投票で村が分断',
};

const liveGame = {
  id: '20260601_120000',
  title: '第13回「桜霞」',
  tag: '',
  live: true,
  day: 2,
  winner: null,
  winnerLabel: null,
  rule: '標準11人',
  viewers: 142,
  cast: ['Nox', 'Mira'],
  desc: '',
};

const rankingAgents = [
  'Ada Lovelace',
  'Kai',
  'Mira',
  'Nox',
  'Sera',
  'Rei',
  'Haru',
  'Toma',
  'Lumi',
  'Nana',
  'Vael',
  'Sora',
  'Ren',
  'Kael',
  'Sable',
];

const statsFixture = {
  games: [
    {
      game_id: 'g1',
      players: rankingAgents.map(name => ({
        name,
        won: name === 'Ada Lovelace' || name === 'Kai',
      })),
    },
    {
      game_id: 'g2',
      players: rankingAgents.map(name => ({
        name,
        won: name === 'Ada Lovelace',
      })),
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockGameList(games = [game], stats = statsFixture) {
  archiveLoader.fetchGameList.mockResolvedValue(games);
  archiveLoader.fetchGameStats.mockResolvedValue(stats);
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
    /*
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
    /*
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
     * Objective: 左サイドナビ（ルールのみ）と右ウィジェット（勝率ランキングのみ）の項目群が list/listitem role で特定できることを検証する。
     */
    mockGameList();

    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    const sideNav = screen.getByRole('navigation', { name: 'ゲーム一覧サイドナビ' });
    expect(within(sideNav).getAllByRole('list').length).toBeGreaterThanOrEqual(1);
    expect(within(sideNav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);

    const ranking = await screen.findByRole('list', { name: '勝率ランキング' });
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(15);
  });

  it('統合: GameListScreen: 勝率ランキングの行は encodeURIComponent した /agent/:name リンクを維持する', async () => {
    /*
     * SUT: GameListScreen / RightPane
     * Mock: fetchGameList / fetchGameStats
     * Level: component
     * Objective: 右ペイン「勝率ランキング」が encodeURIComponent した /agent/:name へのリンクを持つことを検証する (AC-5)
     */
    mockGameList();

    renderGameList();
    const ranking = await screen.findByRole('list', { name: '勝率ランキング' });

    const adaLink = within(ranking).getByRole('link', { name: /Ada Lovelace/ });
    expect(adaLink.getAttribute('href')).toBe('/agent/Ada%20Lovelace');
  });
});

describe('GameListScreen real stats ranking（#337）', () => {
  it('統合: GameListScreen: 勝率ランキングは fetchGameStats 由来の15人分を表示し TOP_AGENTS 固定値を表示しない', async () => {
    /*
     * SUT: GameListScreen / RightPane
     * Mock: fetchGameList / fetchGameStats
     * Level: component
     * Objective: TOP_AGENTS スタブではなく game_stats.json 由来の15人分のランキング順と勝率が表示されることを検証する (AC-1/AC-7)
     */
    mockGameList();
    renderGameList();

    const ranking = await screen.findByRole('list', { name: '勝率ランキング' });
    const rows = within(ranking).getAllByRole('listitem');

    expect(rows).toHaveLength(15);
    expect(within(rows[0]).getByText('Ada Lovelace')).toBeTruthy();
    expect(within(rows[0]).getByText('100%')).toBeTruthy();
    expect(within(rows[1]).getByText('Kai')).toBeTruthy();
    expect(within(rows[1]).getByText('50%')).toBeTruthy();
    expect(within(ranking).queryByText('72%')).toBeNull();
  });

  it('統合: GameListScreen: 勝率ランキングの loading/error/empty fallback を表示する', async () => {
    /*
     * SUT: GameListScreen / RightPane
     * Mock: fetchGameList / fetchGameStats
     * Level: component
     * Objective: 統計取得中・失敗時・空ランキング時に右ペインだけが fallback 表示になることを検証する (AC-5)
     */
    mockGameList();
    archiveLoader.fetchGameStats.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderGameList();
    expect(screen.getByText('勝率を集計中…')).toBeTruthy();
    unmount();

    mockGameList();
    archiveLoader.fetchGameStats.mockRejectedValue(new Error('boom'));
    renderGameList();
    expect(await screen.findByText('勝率を読み込めませんでした')).toBeTruthy();
    cleanup();

    mockGameList([game], { games: [] });
    renderGameList();
    expect(await screen.findByText('集計できる戦績がありません')).toBeTruthy();
  });
});

describe('GameListScreen fetchGameList 失敗時のエラー表示（#614）', () => {
  it('統合: fetchGameList が reject したとき unhandled rejection を起こさず StatusMessage でエラー表示し loading を解除する', async () => {
    /*
     * SUT: GameListScreen
     * Mock: fetchGameList（reject を再現）/ fetchGameStats
     * Level: component
     * Objective: fetchGameList の reject 時に unhandled rejection が発生せず、
     *   loading が false になり（AC-4）、ゲーム0件と区別できる StatusMessage kind="error" の
     *   エラー表示が出る（AC-1・AC-2・AC-3）ことを検証する。
     */
    archiveLoader.fetchGameList.mockRejectedValue(new Error('boom'));
    archiveLoader.fetchGameStats.mockResolvedValue(statsFixture);

    renderGameList();

    const errorMessage = await screen.findByText('ゲーム一覧を読み込めませんでした');
    expect(errorMessage.getAttribute('data-status')).toBe('error');

    // loading が既存挙動どおり解除されている（「読み込み中…」が残らない）
    expect(screen.queryByText('読み込み中…')).toBeNull();

    // ゲーム0件の正常系（空配列）とは区別される — カードが無いのはエラーによるものであり、
    // 正常系の「0件表示」用の文言等は出ていない（エラー文言のみが表示される）
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('統合: fetchGameList 成功時は既存どおりゲーム一覧が表示されエラー表示が出ない（AC-5）', async () => {
    /*
     * SUT: GameListScreen
     * Mock: fetchGameList / fetchGameStats
     * Level: component
     * Objective: fetchGameList 成功時に StatusMessage kind="error" が出現せず、
     *   既存どおりゲーム一覧が表示されることを検証する（回帰防止）。
     */
    mockGameList();

    renderGameList();

    await screen.findByRole('article', { name: '20260510_102927' });
    expect(screen.queryByText('ゲーム一覧を読み込めませんでした')).toBeNull();
  });
});

describe('GameListScreen stub UI 削除（AC-1〜AC-4）', () => {
  it('統合: GameCard に upvote・提供:RunVillage・観戦コメント数・並びHot が存在しない', async () => {
    /*
     * SUT: GameListScreen / GameCard
     * Mock: fetchGameList
     * Level: component
     * Objective: #541 で削除したスタブ UI 要素が GameCard に存在せず、👁同時観戦は残ることを検証する (AC-1)
     */
    mockGameList();
    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    expect(screen.queryByText('▲')).toBeNull();
    expect(screen.queryByText('▼')).toBeNull();
    expect(screen.queryByText(/提供/)).toBeNull();
    expect(screen.queryByText(/RunVillage/)).toBeNull();
    expect(screen.queryByText(/観戦コメント/)).toBeNull();
    expect(screen.queryByText(/ログDL/)).toBeNull();
    expect(screen.queryByText(/保存/)).toBeNull();
    expect(screen.queryByText(/共有/)).toBeNull();
    expect(screen.queryByText(/並び/)).toBeNull();
    expect(screen.queryByText(/Hot/)).toBeNull();
    // 👁 同時観戦は残っている
    expect(screen.getByText(/同時観戦/)).toBeTruthy();
  });

  it('統合: LeftPane はルールのみ残しマイページ・カテゴリ・注目エージェントを表示しない', async () => {
    /*
     * SUT: GameListScreen / LeftPane
     * Mock: fetchGameList
     * Level: component
     * Objective: #541 で削除した LeftPane セクションが存在せず、ルールセクションが残ることを検証する (AC-2)
     */
    mockGameList();
    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    const nav = screen.getByRole('navigation', { name: 'ゲーム一覧サイドナビ' });
    expect(within(nav).getByText('ルール')).toBeTruthy();
    expect(within(nav).queryByText('マイページ')).toBeNull();
    expect(within(nav).queryByText('カテゴリ')).toBeNull();
    expect(within(nav).queryByText('注目エージェント')).toBeNull();
  });

  it('統合: RightPane は勝率ランキングのみ残し次回開催・観戦コミュニティを表示しない', async () => {
    /*
     * SUT: GameListScreen / RightPane
     * Mock: fetchGameList
     * Level: component
     * Objective: #541 で削除した RightPane セクションが存在せず、勝率ランキングが残ることを検証する (AC-3)
     */
    mockGameList();
    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    expect(screen.getByRole('list', { name: '勝率ランキング' })).toBeTruthy();
    expect(screen.queryByText(/次回開催/)).toBeNull();
    expect(screen.queryByRole('list', { name: '観戦コミュニティ' })).toBeNull();
  });

  it('統合: TopBar は検索ボックス・通知3・自分のbot参加を表示しない', async () => {
    /*
     * SUT: GameListScreen / TopBar
     * Mock: fetchGameList
     * Level: component
     * Objective: #541 で削除した TopBar 要素が存在しないことを検証する (AC-4)
     */
    mockGameList();
    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    expect(screen.queryByPlaceholderText(/検索/)).toBeNull();
    expect(screen.queryByText(/通知/)).toBeNull();
    expect(screen.queryByText(/自分のbot/)).toBeNull();
  });
});

describe('GameListScreen 保持要素（AC-6）', () => {
  it('統合: LIVE バナー・NewVillageForm・ルールセクション・viewers が残っている', async () => {
    /*
     * SUT: GameListScreen
     * Mock: fetchGameList（live ゲームを含む）
     * Level: component
     * Objective: AC-6 の保持要素（LIVE バナー・NewVillageForm・ルールセクション・👁同時観戦）が存在することを検証する
     */
    mockGameList([liveGame, game]);
    renderGameList();
    // 完了タブがデフォルト — live ゲームは完了タブで非表示
    await screen.findByRole('article', { name: '20260510_102927' });

    // NewVillageForm
    expect(screen.getByText('新しい村を作る')).toBeTruthy();
    // ルールセクション
    const nav = screen.getByRole('navigation', { name: 'ゲーム一覧サイドナビ' });
    expect(within(nav).getByText('ルール')).toBeTruthy();
    // 👁 同時観戦（完了ゲームの viewers は null → '—'）
    expect(screen.getByText(/同時観戦/)).toBeTruthy();
  });
});

describe('GameListScreen タブ（AC-9・AC-10）', () => {
  it('統合: タブが LIVE と完了の2つのみ表示される', async () => {
    /*
     * SUT: GameListScreen
     * Mock: fetchGameList
     * Level: component
     * Objective: タブが「🔴 LIVE」と「完了」の2つのみで、削除済みタブが存在しないことを検証する (AC-9)
     */
    mockGameList();
    renderGameList();
    await screen.findByRole('article', { name: '20260510_102927' });

    const tabs = screen.getAllByRole('button').filter(
      b => b.className.includes('tab') || ['🔴 LIVE', '完了'].includes(b.textContent.trim())
    );
    const tabTexts = tabs.map(b => b.textContent.trim());
    expect(tabTexts).toContain('🔴 LIVE');
    expect(tabTexts).toContain('完了');
    expect(tabTexts).not.toContain('▶ 注目');
    expect(tabTexts).not.toContain('🔥 熱い議論');
    expect(tabTexts).not.toContain('🆕 新着');
  });

  it('統合: LIVE タブは live=true のゲームのみ、完了タブは live=false のゲームのみ表示する', async () => {
    /*
     * SUT: GameListScreen / filterGames
     * Mock: fetchGameList（live と完了が混在）
     * Level: component
     * Objective: タブ切り替えで live/完了 が正しくフィルタされることを検証する (AC-10)
     */
    const user = userEvent.setup();
    mockGameList([liveGame, game]);
    renderGameList();

    // デフォルトは完了タブ — 完了ゲームのみ表示
    await screen.findByRole('article', { name: '20260510_102927' });
    expect(screen.queryByRole('article', { name: '20260601_120000' })).toBeNull();

    // LIVE タブに切り替え — live ゲームのみ表示
    await user.click(screen.getByRole('button', { name: '🔴 LIVE' }));
    await screen.findByRole('article', { name: '20260601_120000' });
    expect(screen.queryByRole('article', { name: '20260510_102927' })).toBeNull();
  });
});

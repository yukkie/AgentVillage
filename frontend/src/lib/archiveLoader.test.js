import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseIndexToGameList, parseEntryToGame, fetchGameBySessionId, fetchGameList,
  parseGameStats, parseAllAgentNames, parseWinRateRanking, parseFactionWinRates, fetchGameStats,
} from './archiveLoader.js';
import { normalizeAgentJson } from '../legacy/normalizeAgentJson.js';

// --- fixture data ---

const ENTRY_WOLF = {
  session_id: '20260510_102927',
  date: '2026-05-10T10:29:27',
  agent_count: 11,
  days: 3,
  winner: 'wolf',
  cast: ['Kael', 'Kai', 'Mira'],
  live: false,
};

const ENTRY_VILLAGE = {
  session_id: '20260509_181031',
  date: '2026-05-09T18:10:31',
  agent_count: 19,
  days: 3,
  winner: 'village',
  cast: ['Mira', 'Ren'],
  live: false,
};

const ENTRY_NO_WINNER = {
  session_id: '20260329_183044',
  date: '2026-03-29T18:30:44',
  agent_count: 5,
  days: 1,
  winner: null,
  cast: ['Gina'],
  live: false,
};

// --- parseEntryToGame ---

describe('parseEntryToGame', () => {
  it('maps session_id to id', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: session_id が GameCard の id として保持され、#318 replay viewer へ渡せることを検証する
    */
    const game = parseEntryToGame(ENTRY_WOLF);
    expect(game.id).toBe('20260510_102927');
  });

  it('sets winner and winnerLabel for wolf victory', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: 狼勝利エントリの winner / winnerLabel が正しく変換されることを検証する
    */
    const game = parseEntryToGame(ENTRY_WOLF);
    expect(game.winner).toBe('wolf');
    expect(game.winnerLabel).toBe('狼陣営勝');
  });

  it('sets winner and winnerLabel for village victory', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: 村人勝利エントリの winner / winnerLabel が正しく変換されることを検証する
    */
    const game = parseEntryToGame(ENTRY_VILLAGE);
    expect(game.winner).toBe('village');
    expect(game.winnerLabel).toBe('村人陣営勝');
  });

  it('sets winner to null and winnerLabel to null when winner is missing', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: 勝者不明エントリで winner / winnerLabel が null になることを検証する
    */
    const game = parseEntryToGame(ENTRY_NO_WINNER);
    expect(game.winner).toBeNull();
    expect(game.winnerLabel).toBeNull();
  });

  it('preserves cast array', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: cast 配列がそのまま保持されることを検証する
    */
    const game = parseEntryToGame(ENTRY_WOLF);
    expect(game.cast).toEqual(['Kael', 'Kai', 'Mira']);
  });

  it('pure: parseEntryToGame は votes/comments/hot フィールドを返さない', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: #541 でソーシャルフィールドを削除済み — votes/comments/hot が返り値に含まれないことを検証する (AC-11)
    */
    const game = parseEntryToGame(ENTRY_WOLF);
    expect(game).not.toHaveProperty('votes');
    expect(game).not.toHaveProperty('comments');
    expect(game).not.toHaveProperty('hot');
  });
});

// --- parseIndexToGameList ---

describe('parseIndexToGameList', () => {
  it('returns one game per index entry', () => {
    /*
    SUT: parseIndexToGameList
    Mock: なし
    Level: unit
    Objective: index 配列の要素数と出力配列の要素数が一致することを検証する
    */
    const games = parseIndexToGameList([ENTRY_WOLF, ENTRY_VILLAGE, ENTRY_NO_WINNER]);
    expect(games).toHaveLength(3);
  });

  it('returns empty array for empty index', () => {
    /*
    SUT: parseIndexToGameList
    Mock: なし
    Level: unit
    Objective: 空の index に対して空配列を返すことを検証する
    */
    expect(parseIndexToGameList([])).toEqual([]);
  });
});

// --- fetchGameList (#595 AC-4: shared fetchIndex() error message) ---

describe('fetchGameList', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws with the shared index fetch error message', async () => {
    /*
     * SUT: fetchGameList
     * Mock: global fetch（ok:false レスポンスを固定）
     * Level: unit
     * Objective: index fetch 失敗時に fetchGameBySessionId と同一のエラーメッセージ
     * （`Failed to fetch game list: {status}`）で throw することを検証し、
     * fetchIndex() 共通化後もエラー処理が重複せず一致していることを間接担保する (AC-4)。
     */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchGameList()).rejects.toThrow('Failed to fetch game list: 500');
  });
});

// --- fetchGameBySessionId ---

describe('fetchGameBySessionId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the matching index entry by sessionId', async () => {
    /*
     * SUT: fetchGameBySessionId
     * Mock: global fetch（index.json のレスポンスを固定）
     * Level: unit
     * Objective: sessionId に一致する index エントリが返ることを検証する。
     */
    const index = [ENTRY_WOLF, ENTRY_VILLAGE];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(index),
    }));

    const result = await fetchGameBySessionId('20260510_102927');
    expect(result).toBe(index[0]);
  });

  it('throws when sessionId is not found', async () => {
    /*
     * SUT: fetchGameBySessionId
     * Mock: global fetch（index.json のレスポンスを固定）
     * Level: unit
     * Objective: sessionId に一致するエントリがない場合に Error をスローすることを検証する。
     */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([ENTRY_WOLF]),
    }));

    await expect(fetchGameBySessionId('not-exist')).rejects.toThrow('Session not found: not-exist');
  });
});

// --- parseGameStats / parseAllAgentNames（#522 global profile mode） ---

const STATS_FIXTURE = {
  games: [
    {
      game_id: '2026-05-09T18:10:31',
      winner: 'Villagers',
      players: [
        { name: 'Nox', role: 'Seer', faction: 'village', model: 'm', survived: true, won: true },
        { name: 'Kai', role: 'Werewolf', faction: 'werewolf', model: 'm', survived: false, won: false },
        { name: 'Mira', role: 'Villager', faction: 'village', model: 'm', survived: true, won: true },
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

describe('parseGameStats', () => {
  it('勝利数・出場数を name でフィルタして集計する', () => {
    /*
    SUT: parseGameStats
    Mock: なし
    Level: unit
    Objective: agentName で全ゲームをフィルタし wins/total が正しく集計されることを検証する (AC-1)
    */
    const stats = parseGameStats(STATS_FIXTURE, 'Nox');
    expect(stats.total).toBe(2);
    expect(stats.wins).toBe(1);
  });

  it('過去戦績一覧は gameId と role と won を含む', () => {
    /*
    SUT: parseGameStats
    Mock: なし
    Level: unit
    Objective: records が game_id(=session_id) / role / won を含み、ゲーム降順であることを検証する (AC-2)
    */
    const stats = parseGameStats(STATS_FIXTURE, 'Nox');
    expect(stats.records).toEqual([
      { gameId: '2026-05-10T10:29:27', role: 'Villager', won: false },
      { gameId: '2026-05-09T18:10:31', role: 'Seer', won: true },
    ]);
  });

  it('存在しない agent は wins:0 total:0 records:[] を返す', () => {
    /*
    SUT: parseGameStats
    Mock: なし
    Level: unit
    Objective: game_stats.json に存在しない名前で空集計を返すことを検証する (AC-7 empty state)
    */
    const stats = parseGameStats(STATS_FIXTURE, 'Unknown');
    expect(stats).toEqual({
      wins: 0, total: 0, records: [],
      byFaction: { village: { wins: 0, total: 0 }, werewolf: { wins: 0, total: 0 } },
    });
  });

  it('pure: parseGameStats: faction 別の wins / total を返す', () => {
    /*
    SUT: parseGameStats
    Mock: なし
    Level: unit
    Objective: 対象エージェントの村側・狼側それぞれの wins / total を集計し、出場0回の陣営も 0/0 で返すことを検証する (#629 AC-2)
    */
    expect(parseGameStats(STATS_FIXTURE, 'Nox').byFaction).toEqual({
      village: { wins: 1, total: 2 },
      werewolf: { wins: 0, total: 0 },
    });
    expect(parseGameStats(STATS_FIXTURE, 'Kai').byFaction).toEqual({
      village: { wins: 0, total: 0 },
      werewolf: { wins: 1, total: 2 },
    });
  });

  it('pure: parseGameStats: role ではなく faction で陣営を集計する', () => {
    /*
    SUT: parseGameStats
    Mock: なし
    Level: unit
    Objective: role と faction が食い違うデータで faction 側に計上されること（role からの独自マッピングをしない）を検証する (#629 AC-3)
    */
    const stats = {
      games: [
        { game_id: 'g1', players: [{ name: 'Odd', role: 'Villager', faction: 'werewolf', won: true }] },
      ],
    };
    expect(parseGameStats(stats, 'Odd').byFaction).toEqual({
      village: { wins: 0, total: 0 },
      werewolf: { wins: 1, total: 1 },
    });
  });
});

describe('fetchGameStats', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed game_stats.json on success', async () => {
    /*
    SUT: fetchGameStats
    Mock: global fetch（game_stats.json のレスポンスを固定）
    Level: unit
    Objective: fetch 成功時に game_stats.json をパースして返すことを検証する。
    */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(STATS_FIXTURE),
    }));
    const result = await fetchGameStats();
    expect(result).toBe(STATS_FIXTURE);
  });

  it('throws when fetch fails', async () => {
    /*
    SUT: fetchGameStats
    Mock: global fetch（ok:false）
    Level: unit
    Objective: fetch 失敗時に Error をスローすることを検証する (AC-7 error path)。
    */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchGameStats()).rejects.toThrow('Failed to fetch game stats: 500');
  });
});

describe('parseAllAgentNames', () => {
  it('全ゲームの参加エージェント名のユニーク集合を返す', () => {
    /*
    SUT: parseAllAgentNames
    Mock: なし
    Level: unit
    Objective: 全 game.players[].name を重複排除しソートして返すことを検証する (AC-3)
    */
    expect(parseAllAgentNames(STATS_FIXTURE)).toEqual(['Kai', 'Mira', 'Nox']);
  });

  it('空の games には空配列を返す', () => {
    /*
    SUT: parseAllAgentNames
    Mock: なし
    Level: unit
    Objective: games が空のとき空配列を返すことを検証する
    */
    expect(parseAllAgentNames({ games: [] })).toEqual([]);
  });
});

describe('parseWinRateRanking', () => {
  it('pure: parseWinRateRanking: game_stats players の won と出場数から minGames 以上の勝率ランキングを返す', () => {
    /*
    SUT: parseWinRateRanking
    Mock: なし
    Level: unit
    Objective: game_stats.json の players[].won を name ごとに集計し、minGames 以上のエージェントだけを勝率順で返すことを検証する (AC-2/AC-3/AC-6)
    */
    const stats = {
      games: [
        {
          game_id: 'g1',
          players: [
            { name: 'Nox', won: true },
            { name: 'Kai', won: false },
            { name: 'Mira', won: true },
          ],
        },
        {
          game_id: 'g2',
          players: [
            { name: 'Nox', won: false },
            { name: 'Kai', won: true },
            { name: 'Mira', won: true },
          ],
        },
        {
          game_id: 'g3',
          players: [
            { name: 'Nox', won: true },
            { name: 'Kai', won: true },
            { name: 'Solo', won: true },
          ],
        },
      ],
    };

    // #629 で factionWinRate が追加されたため、既存フィールドの値・順序のみを照合する（AC-7）。
    expect(parseWinRateRanking(stats, { limit: 3, minGames: 2 })).toMatchObject([
      { name: 'Mira', wins: 2, games: 2, winRate: 100 },
      { name: 'Kai', wins: 2, games: 3, winRate: 67 },
      { name: 'Nox', wins: 2, games: 3, winRate: 67 },
    ]);
  });

  it('pure: parseWinRateRanking: デフォルトでは15人分の勝率ランキングを返す', () => {
    /*
    SUT: parseWinRateRanking
    Mock: なし
    Level: unit
    Objective: 5人に絞らず、現行エージェント全員分（15人）の勝率を返すことを検証する (AC-1/AC-2)
    */
    const agents = Array.from({ length: 15 }, (_, i) => `Agent ${String(i + 1).padStart(2, '0')}`);
    const stats = {
      games: [
        { game_id: 'g1', players: agents.map(name => ({ name, won: name === 'Agent 01' })) },
        { game_id: 'g2', players: agents.map(name => ({ name, won: name === 'Agent 01' || name === 'Agent 02' })) },
      ],
    };

    expect(parseWinRateRanking(stats)).toHaveLength(15);
    expect(parseWinRateRanking(stats)[0]).toMatchObject({ name: 'Agent 01', winRate: 100 });
  });

  it('pure: parseWinRateRanking: 空または不正な game_stats では空ランキングを返す', () => {
    /*
    SUT: parseWinRateRanking
    Mock: なし
    Level: unit
    Objective: games が空または欠落している場合に例外ではなく空配列を返し UI fallback に委ねることを検証する (AC-4)
    */
    expect(parseWinRateRanking({ games: [] })).toEqual([]);
    expect(parseWinRateRanking(null)).toEqual([]);
  });

  it('pure: parseWinRateRanking: 各エージェントに faction 別の勝率を付与する', () => {
    /*
    SUT: parseWinRateRanking
    Mock: なし
    Level: unit
    Objective: ランキング各行が村側・狼側の勝率を持ち、出場0回の陣営は null になることを検証する (#629 AC-1/AC-6)
    */
    const stats = {
      games: [
        { game_id: 'g1', players: [{ name: 'Nox', faction: 'village', won: true }] },
        { game_id: 'g2', players: [{ name: 'Nox', faction: 'village', won: false }] },
        { game_id: 'g3', players: [{ name: 'Nox', faction: 'village', won: true }] },
      ],
    };
    expect(parseWinRateRanking(stats)[0].factionWinRate).toEqual({ village: 67, werewolf: null });
  });

  it('pure: parseWinRateRanking: faction 別勝率は既存の順位を変えない', () => {
    /*
    SUT: parseWinRateRanking
    Mock: なし
    Level: unit
    Objective: 村側勝率の大小が通算勝率と逆でも、並び順が通算勝率で決まり続けることを検証する (#629 AC-7)
    */
    const stats = {
      games: [
        // A: 村 2/2 (100%), 狼 0/2 → 通算 50%
        // B: 村 0/1 (0%),   狼 2/2 → 通算 67%
        { game_id: 'g1', players: [{ name: 'A', faction: 'village', won: true }, { name: 'B', faction: 'werewolf', won: true }] },
        { game_id: 'g2', players: [{ name: 'A', faction: 'village', won: true }, { name: 'B', faction: 'werewolf', won: true }] },
        { game_id: 'g3', players: [{ name: 'A', faction: 'werewolf', won: false }, { name: 'B', faction: 'village', won: false }] },
        { game_id: 'g4', players: [{ name: 'A', faction: 'werewolf', won: false }] },
      ],
    };
    const ranking = parseWinRateRanking(stats);
    expect(ranking.map(r => [r.name, r.winRate])).toEqual([['B', 67], ['A', 50]]);
    expect(ranking.map(r => r.factionWinRate)).toEqual([
      { village: 0, werewolf: 100 },
      { village: 100, werewolf: 0 },
    ]);
  });
});

describe('parseFactionWinRates', () => {
  it('pure: parseFactionWinRates: won プレイヤーの faction から陣営勝率を集計する', () => {
    /*
    SUT: parseFactionWinRates
    Mock: なし
    Level: unit
    Objective: 各ゲームの won:true プレイヤーの faction を勝者陣営とし、全ゲーム横断の村陣営・狼陣営の勝率と試合数を返すことを検証する (#629 AC-11)
    */
    const stats = {
      games: [
        { game_id: 'g1', winner: 'Villagers', players: [{ name: 'A', faction: 'village', won: true }, { name: 'B', faction: 'werewolf', won: false }] },
        { game_id: 'g2', winner: 'Werewolves', players: [{ name: 'A', faction: 'village', won: false }, { name: 'B', faction: 'werewolf', won: true }] },
        { game_id: 'g3', winner: 'Werewolves', players: [{ name: 'A', faction: 'village', won: false }, { name: 'B', faction: 'werewolf', won: true }] },
      ],
    };
    expect(parseFactionWinRates(stats)).toEqual({ games: 3, village: 33, werewolf: 67 });
  });

  it('pure: parseFactionWinRates: ゲーム0件・不正入力では勝率 null を返す', () => {
    /*
    SUT: parseFactionWinRates
    Mock: なし
    Level: unit
    Objective: 母数 0 で NaN / 0% ではなく null（データなし）を返し、不正入力でも例外にしないことを検証する (#629 AC-11)
    */
    const empty = { games: 0, village: null, werewolf: null };
    expect(parseFactionWinRates({ games: [] })).toEqual(empty);
    expect(parseFactionWinRates(null)).toEqual(empty);
  });

  it('pure: parseFactionWinRates: 勝者を判定できないゲームは母数から除外する', () => {
    /*
    SUT: parseFactionWinRates
    Mock: なし
    Level: unit
    Objective: won:true のプレイヤーがいないゲーム・players 欠落ゲームを母数に含めないことを検証する (#629 AC-11)
    */
    const stats = {
      games: [
        { game_id: 'g1', players: [{ name: 'A', faction: 'village', won: true }] },
        { game_id: 'g2', players: [{ name: 'A', faction: 'village', won: false }] },
        { game_id: 'g3' },
      ],
    };
    expect(parseFactionWinRates(stats)).toEqual({ games: 1, village: 100, werewolf: 0 });
  });
});

// --- normalizeAgentJson ---

describe('normalizeAgentJson', () => {
  it('returns split-format data unchanged', () => {
    /*
    SUT: normalizeAgentJson
    Mock: なし
    Level: unit
    Objective: 現行 profile/state 形式のデータがそのまま返ることを検証する
    */
    const data = {
      profile: { name: 'Kael', model: 'claude-haiku', persona: {} },
      state: { is_alive: false },
      role: 'Medium',
    };
    expect(normalizeAgentJson(data)).toBe(data);
  });

  it('promotes flat legacy format to profile/state structure', () => {
    /*
    SUT: normalizeAgentJson
    Mock: なし
    Level: unit
    Objective: pre-#52 flat 形式が profile/state 分割形式に変換されることを検証する (Legacy-Adapter)
    */
    const flat = {
      name: 'Gina',
      model: 'claude-haiku',
      persona: { style: 'calm' },
      beliefs: {},
      memory_summary: [],
      is_alive: true,
      claimed_role: null,
      intended_co: null,
      role: 'Villager',
    };
    const result = normalizeAgentJson(flat);
    expect(result.profile.name).toBe('Gina');
    expect(result.state.is_alive).toBe(true);
    expect(result.role).toBe('Villager');
  });

  it('fills missing flat fields with defaults', () => {
    /*
    SUT: normalizeAgentJson
    Mock: なし
    Level: unit
    Objective: flat 形式でフィールドが欠落している場合にデフォルト値で補完されることを検証する
    */
    const minimal = { name: 'Gina' };
    const result = normalizeAgentJson(minimal);
    expect(result.profile.name).toBe('Gina');
    expect(result.state.is_alive).toBe(true);
    expect(result.state.beliefs).toEqual({});
    expect(result.role).toBeNull();
  });
});

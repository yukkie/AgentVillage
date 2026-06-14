import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseIndexToGameList, parseEntryToGame, fetchGameBySessionId,
  parseGameStats, parseAllAgentNames, fetchGameStats,
  parseBlurb, fetchAgentConfig,
} from './archiveLoader.js';
import { normalizeAgentJson } from '../legacy/normalizeAgentJson.js';
import AGENT_CONFIG from '../../../config/agents.json';

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

  it('falls back votes/comments/hot to 0/0/false (#312)', () => {
    /*
    SUT: parseEntryToGame
    Mock: なし
    Level: unit
    Objective: ログに存在しないソーシャルフィールドがフォールバック値になることを検証する (#312)
    */
    const game = parseEntryToGame(ENTRY_WOLF);
    expect(game.votes).toBe(0);
    expect(game.comments).toBe(0);
    expect(game.hot).toBe(false);
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
    expect(stats).toEqual({ wins: 0, total: 0, records: [] });
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

// --- parseBlurb / fetchAgentConfig（#519 blurb 実データ化） ---

const CONFIG_FIXTURE = [
  { name: 'Nox', style: 'cynical, detached, intelligent', blurb: 'Finds the frayed edge in every word, quiet as a moonless night.' },
  { name: 'Mira', style: 'analytical, methodical, honest', blurb: 'Stands where instinct meets logic, smelling a lie before it lands.' },
];

describe('parseBlurb', () => {
  it('pure: parseBlurb が name 一致の blurb を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: config 配列から name 一致エントリの blurb 文字列を返すことを検証する (AC-2/AC-3)
    */
    expect(parseBlurb(CONFIG_FIXTURE, 'Nox')).toBe('Finds the frayed edge in every word, quiet as a moonless night.');
  });

  it('pure: parseBlurb は未知 name に null を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: config に存在しない名前では null を返し、表示側のフォールバックに委ねることを検証する (AC-4)
    */
    expect(parseBlurb(CONFIG_FIXTURE, 'Unknown')).toBeNull();
  });

  it('pure: parseBlurb は config が null でも null を返す', () => {
    /*
    SUT: parseBlurb
    Mock: なし
    Level: unit
    Objective: fetch 失敗で config が null のとき例外を投げず null を返すことを検証する (AC-4)
    */
    expect(parseBlurb(null, 'Nox')).toBeNull();
  });
});

describe('agents.json blurb data', () => {
  it('pure: agents.json の全エージェントに英語 blurb が存在する', () => {
    /*
    SUT: config/agents.json
    Mock: なし
    Level: unit
    Objective: 全エージェントに非空の英語 blurb 文字列が存在することを検証する (AC-1)
    */
    expect(AGENT_CONFIG.length).toBeGreaterThan(0);
    for (const agent of AGENT_CONFIG) {
      expect(typeof agent.blurb).toBe('string');
      expect(agent.blurb.trim().length).toBeGreaterThan(0);
      // 英語版（ASCII のみ・日本語文字を含まない）であることを担保する
      expect(/[　-鿿]/.test(agent.blurb)).toBe(false);
    }
  });
});

describe('fetchAgentConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed config/agents.json on success', async () => {
    /*
    SUT: fetchAgentConfig
    Mock: global fetch（config/agents.json のレスポンスを固定）
    Level: unit
    Objective: fetch 成功時に config/agents.json をパースして返すことを検証する。
    */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CONFIG_FIXTURE),
    }));
    const result = await fetchAgentConfig();
    expect(result).toBe(CONFIG_FIXTURE);
  });

  it('throws when fetch fails', async () => {
    /*
    SUT: fetchAgentConfig
    Mock: global fetch（ok:false）
    Level: unit
    Objective: fetch 失敗時に Error をスローすることを検証する (AC-4 fallback path)。
    */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchAgentConfig()).rejects.toThrow('Failed to fetch agent config: 500');
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

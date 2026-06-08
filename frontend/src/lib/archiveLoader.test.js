import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseIndexToGameList, parseEntryToGame, fetchGameBySessionId } from './archiveLoader.js';
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

/**
 * Game list loader — fetches state_archive/index.json and converts entries
 * to the shape expected by GameListScreen.
 *
 * All data access is isolated in fetchGameList() so the fetch URL can be
 * swapped to a FastAPI endpoint (#315) without touching GameListScreen.
 */

// index.json is served via Vite's static file middleware (see vite.config.js).
// Replace this with a FastAPI endpoint URL in production (#315).
const INDEX_URL = '/state_archive/index.json';

/**
 * Convert a single index.json entry to a GameCard-compatible object.
 * Fields unavailable in the archive logs are set to fallback values.
 *
 * @param {object} entry - One element from state_archive/index.json
 * @returns {object}
 */
export function parseEntryToGame(entry) {
  const winnerLabel =
    entry.winner === 'village' ? '村人陣営勝' :
    entry.winner === 'wolf'    ? '狼陣営勝' :
    null;

  const dateLabel = entry.date
    ? new Date(entry.date).toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : entry.session_id;

  return {
    id: entry.session_id,
    live: entry.live ?? false,
    day: entry.days,
    title: entry.session_id,           // #312: village name not in logs
    rule: '—',                         // #312: rule config not in logs
    winner: entry.winner ?? null,
    winnerLabel,
    cast: entry.cast ?? [],
    desc: '',                          // #312: game summary not in logs
    tag: `完了 · ${dateLabel}`,
    viewers: 0,
  };
}

/**
 * Parse a full index.json array into GameCard-compatible objects.
 *
 * @param {object[]} index - Parsed contents of state_archive/index.json
 * @returns {object[]}
 */
export function parseIndexToGameList(index) {
  return index.map(parseEntryToGame);
}

/**
 * Fetch and parse state_archive/index.json.
 * Shared by fetchGameList() and fetchGameBySessionId() (#595).
 * Not memoized on purpose: a live game's index must stay fresh on every call.
 *
 * @returns {Promise<object[]>}
 */
async function fetchIndex() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch game list: ${res.status}`);
  return res.json();
}

/**
 * Fetch state_archive/index.json and return a list of GameCard-compatible
 * objects. Throws if the fetch fails.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchGameList() {
  return parseIndexToGameList(await fetchIndex());
}

// --- Game stats (#522 global profile mode) ---

// game_stats.json lives at state/stats/, served by the /stats middleware in
// vite.config.js (local dev only). Replace with a FastAPI endpoint in production (#315).
const GAME_STATS_URL = '/stats/game_stats.json';

/**
 * Aggregate a single agent's cross-game record from game_stats.json (DataSpec §6).
 * `won` is read as-is; no winner/faction value conversion (already done by collector).
 *
 * @param {{games: object[]}} gamesJson - Parsed game_stats.json
 * @param {string} agentName
 * @returns {{wins: number, total: number, records: {gameId: string, role: string, won: boolean}[]}}
 *   records are ordered newest-game-first. Empty for an unknown agentName.
 */
export function parseGameStats(gamesJson, agentName) {
  const records = [];
  let wins = 0;
  let total = 0;
  for (const game of gamesJson.games) {
    const player = game.players.find(p => p.name === agentName);
    if (!player) continue;
    total += 1;
    if (player.won) wins += 1;
    records.push({ gameId: game.game_id, role: player.role, won: player.won });
  }
  // Newest game first (games[] is appended in chronological order by collector).
  records.reverse();
  return { wins, total, records };
}

/**
 * Collect the unique set of all agent names across every game, sorted.
 * Used by the global-mode left pane's cross-agent profile link list (AC-3).
 *
 * @param {{games: object[]}} gamesJson - Parsed game_stats.json
 * @returns {string[]}
 */
export function parseAllAgentNames(gamesJson) {
  const names = new Set();
  for (const game of gamesJson.games) {
    for (const player of game.players) names.add(player.name);
  }
  return [...names].sort();
}

/**
 * Build the GameListScreen win-rate ranking from game_stats.json.
 *
 * @param {{games: object[]} | null} gamesJson - Parsed game_stats.json
 * @param {{limit?: number, minGames?: number}} options
 * @returns {{name: string, wins: number, games: number, winRate: number}[]}
 */
export function parseWinRateRanking(gamesJson, { limit = 15, minGames = 2 } = {}) {
  if (!Array.isArray(gamesJson?.games)) return [];

  const byName = new Map();
  for (const game of gamesJson.games) {
    if (!Array.isArray(game.players)) continue;
    for (const player of game.players) {
      if (!player?.name) continue;
      const current = byName.get(player.name) ?? { name: player.name, wins: 0, games: 0 };
      current.games += 1;
      if (player.won) current.wins += 1;
      byName.set(player.name, current);
    }
  }

  return [...byName.values()]
    .filter(agent => agent.games >= minGames)
    .map(agent => ({
      ...agent,
      winRate: Math.round((agent.wins / agent.games) * 100),
    }))
    .sort((a, b) =>
      b.winRate - a.winRate ||
      b.games - a.games ||
      a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

/**
 * Fetch and parse game_stats.json. Throws if the fetch fails.
 *
 * @returns {Promise<{games: object[]}>}
 */
export async function fetchGameStats() {
  const res = await fetch(GAME_STATS_URL);
  if (!res.ok) throw new Error(`Failed to fetch game stats: ${res.status}`);
  return res.json();
}

// --- Agent config blurb (#519) ---

// frontend/public/config/agents.json holds static, name-keyed agent metadata
// (style, occupation, blurb …). Vite/static hosting serves it as /config/agents.json.
// This static config is intentionally outside the FastAPI migration scope (#315).
const AGENT_CONFIG_URL = '/config/agents.json';

/**
 * Look up an agent's static blurb (1-line profile) from /config/agents.json.
 * Returns null when the agent is absent or config is null/missing so the
 * display side can fall back to a placeholder (AC-4). No placeholder string
 * is baked in here to keep this pure and decoupled from the UI symbol.
 *
 * @param {{name: string, blurb?: string}[] | null} config - Parsed /config/agents.json
 * @param {string} name
 * @returns {string | null}
 */
export function parseBlurb(config, name) {
  if (!Array.isArray(config)) return null;
  const entry = config.find(a => a.name === name);
  return entry?.blurb ?? null;
}

/**
 * Fetch and parse /config/agents.json. Throws if the fetch fails.
 *
 * @returns {Promise<{name: string, blurb?: string}[]>}
 */
export async function fetchAgentConfig() {
  const res = await fetch(AGENT_CONFIG_URL);
  if (!res.ok) throw new Error(`Failed to fetch agent config: ${res.status}`);
  return res.json();
}

/**
 * Fetch a single game entry by sessionId from state_archive/index.json.
 * Returns the raw index entry (including cast) for use by SpectatorScreen.
 * Throws if the session is not found.
 *
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function fetchGameBySessionId(sessionId) {
  const index = await fetchIndex();
  const entry = index.find(e => e.session_id === sessionId);
  if (!entry) throw new Error(`Session not found: ${sessionId}`);
  return entry;
}

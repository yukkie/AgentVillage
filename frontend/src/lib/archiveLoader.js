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
    // Social fields are not stored in the archive
    votes: 0,                          // #312: not available in logs
    comments: 0,                       // #312: not available in logs
    viewers: 0,
    hot: false,
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
 * Fetch state_archive/index.json and return a list of GameCard-compatible
 * objects. Throws if the fetch fails.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchGameList() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch game list: ${res.status}`);
  const index = await res.json();
  return parseIndexToGameList(index);
}

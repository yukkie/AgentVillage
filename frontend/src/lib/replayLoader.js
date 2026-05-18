import { parseGameData } from './parseGameData.js';

function agentFileName(name) {
  return `${String(name).toLowerCase()}.json`;
}

function archiveUrl(sessionId, path) {
  return `/state_archive/${encodeURIComponent(sessionId)}/${path}`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

/**
 * Fetch archived agent JSON files for one session.
 *
 * Missing agent files are skipped so older/incomplete archives can still show
 * the speech feed. A future API endpoint can replace this fan-out with one
 * request without changing SpectatorScreen.
 *
 * @param {{ sessionId: string, cast: string[] }} params
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchReplayAgents({ sessionId, cast = [] }) {
  const entries = await Promise.all(
    cast.map(async name => {
      try {
        const data = await fetchJson(archiveUrl(sessionId, `agents/${agentFileName(name)}`));
        return [name, data];
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(entries.filter(Boolean));
}

/**
 * Fetch the spectator log for one archived session.
 *
 * This is currently a whole-file fetch. If logs become large, this function is
 * the intended replacement point for day chunks, cursor pagination, or a
 * ReadableStream JSONL parser.
 *
 * @param {{ sessionId: string }} params
 * @returns {Promise<string>}
 */
export function fetchReplayLog({ sessionId }) {
  return fetchText(archiveUrl(sessionId, 'spectator_log.jsonl'));
}

/**
 * Convenience loader for callers that do not need staged updates.
 *
 * @param {{ sessionId: string, cast: string[] }} params
 * @returns {Promise<{ events: object[], agents: Record<string, object> }>}
 */
export async function fetchReplayGame({ sessionId, cast = [] }) {
  const [jsonlText, agentJsonByName] = await Promise.all([
    fetchReplayLog({ sessionId }),
    fetchReplayAgents({ sessionId, cast }),
  ]);
  return parseGameData(jsonlText, agentJsonByName);
}

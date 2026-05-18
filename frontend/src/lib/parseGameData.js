import { normalizeAgentJson } from '../legacy/normalizeAgentJson.js';

const THINK_PREFIX = '[THINK]';

/**
 * Parse one JSONL line into a LogEvent-compatible object.
 *
 * Kept separate so replay loading can later move from whole-file parsing to
 * chunked JSONL parsing without changing screen components.
 *
 * @param {string} line
 * @returns {object | null}
 */
export function parseEventLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function stripThinkPrefix(content) {
  if (!content?.startsWith(THINK_PREFIX)) return content ?? '';
  return content.slice(THINK_PREFIX.length).trimStart();
}

function eventKey(event) {
  return `${event.day ?? ''}:${event.agent ?? ''}:${event.speech_id ?? ''}`;
}

function isPrivateThinkEvent(event) {
  return (
    event.event_type === 'speech' &&
    event.is_public === false &&
    typeof event.content === 'string' &&
    event.content.startsWith(THINK_PREFIX)
  );
}

/**
 * Convert raw LogEvent rows into UI events.
 *
 * The current archive stores thoughts as private "[THINK]" speech rows that
 * share day/agent/speech_id with the public speech. The spectator feed wants
 * the thought on the visible public speech card, so we merge those rows here.
 *
 * @param {object[]} rawEvents
 * @returns {object[]}
 */
export function normalizeEvents(rawEvents) {
  const publicEvents = [];
  const speechByKey = new Map();
  const pendingThoughts = new Map();

  rawEvents.forEach(event => {
    if (isPrivateThinkEvent(event)) {
      const key = eventKey(event);
      const thought = stripThinkPrefix(event.content);
      const speech = speechByKey.get(key);
      if (speech) {
        speech.thought = thought;
      } else {
        pendingThoughts.set(key, thought);
      }
      return;
    }

    const normalized = { ...event };
    if (normalized.event_type === 'speech' && normalized.is_public !== false) {
      const key = eventKey(normalized);
      if (pendingThoughts.has(key)) {
        normalized.thought = pendingThoughts.get(key);
      }
      speechByKey.set(key, normalized);
    }
    publicEvents.push(normalized);
  });

  return publicEvents;
}

function parseAgent(agentJson) {
  const normalized = normalizeAgentJson(agentJson);
  const name = normalized.profile?.name ?? agentJson.name;

  return {
    name,
    role: normalized.role ?? null,
    is_alive: normalized.state?.is_alive ?? true,
    claimed_role: normalized.state?.claimed_role ?? null,
    persona: normalized.profile?.persona ?? {},
    profile: normalized.profile ?? {},
    state: normalized.state ?? {},
  };
}

/**
 * Parse archive JSONL and agent JSON into the GameData shape consumed by React.
 *
 * This function is intentionally synchronous and pure. I/O stays in
 * replayLoader.js, which is the seam to replace with cursor/chunk/streaming
 * APIs if archived games become too large for whole-file fetch.
 *
 * @param {string} jsonlText
 * @param {Record<string, object>} agentJsonByName
 * @returns {{ events: object[], agents: Record<string, object> }}
 */
export function parseGameData(jsonlText, agentJsonByName = {}) {
  const rawEvents = jsonlText
    .split(/\r?\n/)
    .map(parseEventLine)
    .filter(Boolean);

  const agents = {};
  Object.values(agentJsonByName).forEach(agentJson => {
    const agent = parseAgent(agentJson);
    if (agent.name) agents[agent.name] = agent;
  });

  return {
    events: normalizeEvents(rawEvents),
    agents,
  };
}

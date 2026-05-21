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
  return `${event.event_type ?? ''}:${event.day ?? ''}:${event.agent ?? ''}:${event.speech_id ?? ''}`;
}

function fallbackEventKey(event) {
  return `${event.event_type ?? ''}:${event.day ?? ''}:${event.agent ?? ''}`;
}

function mergeableThoughtEventType(event) {
  return event.event_type === 'speech' || event.event_type === 'wolf_chat';
}

function isVisibleThoughtTarget(event) {
  if (event.event_type === 'speech') return event.is_public !== false;
  if (event.event_type === 'wolf_chat') return true;
  return false;
}

// Legacy-adapter: archived logs store private thoughts as sibling "[THINK]"
// events. Keep this bridge searchable until LogEvent can carry mixed
// public/private fields directly.
function isPrivateThinkEvent(event) {
  return (
    mergeableThoughtEventType(event) &&
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
  const eventByKey = new Map();
  const latestEventByFallbackKey = new Map();
  const pendingThoughts = new Map();
  const pendingFallbackThoughts = new Map();

  rawEvents.forEach(event => {
    if (isPrivateThinkEvent(event)) {
      const key = eventKey(event);
      const fallbackKey = fallbackEventKey(event);
      const thought = stripThinkPrefix(event.content);
      const visibleEvent = eventByKey.get(key) ?? latestEventByFallbackKey.get(fallbackKey);
      if (visibleEvent) {
        visibleEvent.thought = thought;
      } else {
        if (event.speech_id != null) {
          pendingThoughts.set(key, thought);
        } else {
          pendingFallbackThoughts.set(fallbackKey, thought);
        }
      }
      return;
    }

    const normalized = { ...event };
    if (isVisibleThoughtTarget(normalized)) {
      const key = eventKey(normalized);
      const fallbackKey = fallbackEventKey(normalized);
      if (pendingThoughts.has(key)) {
        normalized.thought = pendingThoughts.get(key);
        pendingThoughts.delete(key);
      } else if (pendingFallbackThoughts.has(fallbackKey)) {
        normalized.thought = pendingFallbackThoughts.get(fallbackKey);
        pendingFallbackThoughts.delete(fallbackKey);
      }
      eventByKey.set(key, normalized);
      latestEventByFallbackKey.set(fallbackKey, normalized);
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
 * Aggregate per-day execution target, vote count, and night completion from
 * elimination / vote / night_attack events. Days with only other event types
 * (speech, guard, etc.) have no entry in the returned map.
 *
 * @param {object[]} events
 * @returns {Record<number, { target: string|null, votes: number, nightDone: boolean }>}
 */
export function aggregateDayResults(events) {
  const result = {};
  const voteCounts = {};

  for (const ev of events) {
    const d = ev.day;
    if (!d) continue;

    if (ev.event_type === 'elimination' && ev.is_public) {
      if (!result[d]) result[d] = { target: null, votes: 0, nightDone: false };
      result[d].target = ev.agent;
    } else if (ev.event_type === 'vote') {
      if (!result[d]) result[d] = { target: null, votes: 0, nightDone: false };
      if (!voteCounts[d]) voteCounts[d] = {};
      voteCounts[d][ev.target] = (voteCounts[d][ev.target] || 0) + 1;
      result[d].votes = Math.max(...Object.values(voteCounts[d]));
    } else if (ev.event_type === 'night_attack' && ev.is_public) {
      if (!result[d]) result[d] = { target: null, votes: 0, nightDone: false };
      result[d].nightDone = true;
    }
  }

  return result;
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
 * @returns {{ events: object[], agents: Record<string, object>, daySummary: object }}
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

  const events = normalizeEvents(rawEvents);
  return {
    events,
    agents,
    daySummary: aggregateDayResults(rawEvents),
  };
}

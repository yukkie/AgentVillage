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
      const reasoning = stripThinkPrefix(event.content);
      const visibleEvent = eventByKey.get(key) ?? latestEventByFallbackKey.get(fallbackKey);
      if (visibleEvent) {
        visibleEvent.reasoning = reasoning;
      } else {
        if (event.speech_id != null) {
          pendingThoughts.set(key, reasoning);
        } else {
          pendingFallbackThoughts.set(fallbackKey, reasoning);
        }
      }
      return;
    }

    const normalized = { ...event };
    if (isVisibleThoughtTarget(normalized)) {
      const key = eventKey(normalized);
      const fallbackKey = fallbackEventKey(normalized);
      if (pendingThoughts.has(key)) {
        normalized.reasoning = pendingThoughts.get(key);
        pendingThoughts.delete(key);
      } else if (pendingFallbackThoughts.has(fallbackKey)) {
        normalized.reasoning = pendingFallbackThoughts.get(fallbackKey);
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
 * Index public night_attack events by day to get the attacked agent name.
 *
 * @param {object[]} events
 * @returns {Record<number, { attacked: string }>}
 */
export function aggregateNightResults(events) {
  const result = {};
  for (const ev of events) {
    if (ev.event_type === 'night_attack' && !ev.is_public && ev.target) {
      result[ev.day] = { attacked: ev.target };
    }
  }
  return result;
}

const ACTION_KIND = {
  inspection: 'divine',
  guard: 'guard',
  night_attack: 'attack',
  elimination: 'exec',
};

/**
 * Build a flat timeline of night/day actions for the right-pane action list.
 * Includes inspection, guard, private night_attack (wolf POV), and elimination.
 * Public night_attack (village result announcement) is excluded — use aggregateNightResults for that.
 *
 * @param {object[]} events
 * @returns {Array<{ day: number, when: 'N'|'D', kind: string, who: string, target: string, label: string }>}
 */
export function buildActionsTimeline(events) {
  const nightEntries = [];
  const dayEntries = [];

  for (const ev of events) {
    if (ev.event_type === 'inspection') {
      nightEntries.push({ day: ev.day, when: 'N', kind: 'divine', who: ev.agent, target: ev.target, label: '占い' });
    } else if (ev.event_type === 'guard') {
      nightEntries.push({ day: ev.day, when: 'N', kind: 'guard', who: ev.agent, target: ev.target, label: '護衛' });
    } else if (ev.event_type === 'night_attack' && !ev.is_public) {
      nightEntries.push({ day: ev.day, when: 'N', kind: 'attack', who: ev.agent, target: ev.target, label: '襲撃' });
    } else if (ev.event_type === 'elimination' && ev.is_public) {
      dayEntries.push({ day: ev.day, when: 'D', kind: 'exec', who: '村', target: ev.agent, label: '処刑' });
    }
  }

  return [...nightEntries, ...dayEntries];
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
 * Aggregate CO (coming-out) status from co_announcement events.
 *
 * @param {object[]} events
 * @returns {Record<string, string>} agent name → claimed_role
 */
export function aggregateCoStatus(events, upToDay) {
  const result = {};
  for (const ev of events) {
    if (upToDay !== undefined && ev.day > upToDay) continue;
    if (ev.event_type === 'co_announcement' && ev.agent && ev.claimed_role) {
      result[ev.agent] = ev.claimed_role;
    }
  }
  return result;
}

/**
 * Aggregate per-day night actions and execution results.
 *
 * nightActions: inspection / guard / private night_attack (is_public=false)
 * execResult:   elimination target + vote breakdown
 *
 * @param {object[]} events
 * @returns {Record<number, { nightActions: object[], execResult: { target: string, voteTable: {from:string,to:string}[] } | null }>}
 */
export function aggregateDayActions(events) {
  const result = {};

  function ensureDay(d) {
    if (!result[d]) result[d] = { nightActions: [], execResult: null };
  }

  for (const ev of events) {
    const d = ev.day;
    if (!d) continue;

    if (
      (ev.event_type === 'inspection' || ev.event_type === 'guard') ||
      (ev.event_type === 'night_attack' && !ev.is_public)
    ) {
      ensureDay(d);
      result[d].nightActions.push(ev);
    } else if (ev.event_type === 'vote') {
      ensureDay(d);
      if (!result[d].execResult) result[d].execResult = { target: null, voteTable: [] };
      result[d].execResult.voteTable.push({ from: ev.agent, to: ev.target });
    } else if (ev.event_type === 'elimination') {
      ensureDay(d);
      if (!result[d].execResult) result[d].execResult = { target: null, voteTable: [] };
      result[d].execResult.target = ev.agent;
    }
  }

  return result;
}

/**
 * Build a cumulative dead-map per day from elimination and night_attack events.
 *
 * Returns a map from day number → Map<agentName, { day: number, content: string }>.
 * Days with no new deaths inherit the previous day's map so callers can simply
 * do `deadByDay[activeDay]?.has(name)` or `.get(name)` without caring about history.
 *
 * @param {object[]} events
 * @returns {Record<number, Map<string, { day: number, content: string }>>}
 */
export function computeDeadByDay(events) {
  const dayNumbers = [...new Set(events.map(ev => ev.day).filter(Boolean))].sort((a, b) => a - b);
  if (dayNumbers.length === 0) return {};

  const deathsByDay = {};
  const guardBlocksByDay = {};
  for (const ev of events) {
    if (!ev.day) continue;
    if (ev.event_type === 'elimination' && ev.agent) {
      if (!deathsByDay[ev.day]) deathsByDay[ev.day] = [];
      deathsByDay[ev.day].push({ name: ev.agent, day: ev.day, content: ev.content ?? '' });
    } else if (ev.event_type === 'night_attack' && !ev.is_public && ev.target) {
      if (!deathsByDay[ev.day]) deathsByDay[ev.day] = [];
      deathsByDay[ev.day].push({ name: ev.target, day: ev.day, content: ev.content ?? '', isNightAttack: true });
    } else if (ev.event_type === 'guard_block' && !ev.is_public && ev.target) {
      if (!guardBlocksByDay[ev.day]) guardBlocksByDay[ev.day] = new Set();
      guardBlocksByDay[ev.day].add(ev.target);
    }
  }

  const result = {};
  let cumulative = new Map();
  for (const day of dayNumbers) {
    const blocked = guardBlocksByDay[day] ?? new Set();
    const entries = deathsByDay[day] ?? [];
    if (entries.length > 0) {
      cumulative = new Map(cumulative);
      for (const entry of entries) {
        if (entry.isNightAttack) {
          if (!blocked.has(entry.name)) {
            cumulative.set(entry.name, { day: entry.day, content: entry.content });
          }
        } else {
          cumulative.set(entry.name, { day: entry.day, content: entry.content });
        }
      }
    }
    result[day] = cumulative;
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
    nightResults: aggregateNightResults(rawEvents),
    actionsTimeline: buildActionsTimeline(rawEvents),
  };
}

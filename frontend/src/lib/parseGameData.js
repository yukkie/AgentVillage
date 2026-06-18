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

// Legacy-Adapter: archived logs store private thoughts as sibling "[THINK]"
// events. New logs carry reasoning directly on the event (event.reasoning).
// Keep this bridge until all archived logs are regenerated with the new schema.
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
 * Aggregate per-day night actions and execution results.
 *
 * nightActions: inspection / guard / private night_attack (is_public=false)
 * execResult:   elimination target + vote breakdown
 * speechCount:  public/private speech count for the day
 * nightDone:    true when a public night_attack announcement exists
 *
 * @param {object[]} events
 * @returns {Record<number, { nightActions: object[], execResult: { target: string|null, votes: number, voteTable: {from:string,to:string}[] } | null, speechCount: number, nightDone: boolean }>}
 */
export function aggregateDaySummary(events) {
  const result = {};
  const voteCounts = {};

  function ensureDay(d) {
    if (!result[d]) {
      result[d] = {
        nightActions: [],
        execResult: null,
        speechCount: 0,
        nightDone: false,
      };
    }
  }

  function ensureExecResult(d) {
    ensureDay(d);
    if (!result[d].execResult) {
      result[d].execResult = { target: null, votes: 0, voteTable: [] };
    }
    return result[d].execResult;
  }

  for (const ev of events) {
    const d = ev.day;
    if (!d) continue;

    if (ev.event_type === 'speech') {
      ensureDay(d);
      result[d].speechCount += 1;
    } else if (
      (ev.event_type === 'inspection' || ev.event_type === 'guard') ||
      (ev.event_type === 'night_attack' && !ev.is_public)
    ) {
      ensureDay(d);
      result[d].nightActions.push(ev);
    } else if (ev.event_type === 'vote') {
      const execResult = ensureExecResult(d);
      execResult.voteTable.push({ from: ev.agent, to: ev.target });
      if (!voteCounts[d]) voteCounts[d] = {};
      voteCounts[d][ev.target] = (voteCounts[d][ev.target] || 0) + 1;
      execResult.votes = Math.max(...Object.values(voteCounts[d]));
    } else if (ev.event_type === 'elimination' && ev.is_public) {
      ensureExecResult(d).target = ev.agent;
    } else if (ev.event_type === 'night_attack' && ev.is_public) {
      ensureDay(d);
      result[d].nightDone = true;
    }
  }

  return result;
}

/**
 * Aggregate CO (coming-out) status from events.
 *
 * New logs: reads claimed_role directly from speech events.
 * Legacy-Adapter: old logs emit a separate co_announcement event; both paths
 * are handled so archived replays continue to work.
 *
 * @param {object[]} events
 * @returns {Record<string, string>} agent name → claimed_role
 */
export function aggregateCoStatus(events, upToDay) {
  const result = {};
  for (const ev of events) {
    if (upToDay !== undefined && ev.day > upToDay) continue;
    if (ev.event_type === 'speech' && ev.agent && ev.claimed_role) {
      result[ev.agent] = ev.claimed_role;
    } else if (ev.event_type === 'co_announcement' && ev.agent && ev.claimed_role) {
      // Legacy-Adapter: pre-#420 logs emitted CO as a separate event
      result[ev.agent] = ev.claimed_role;
    }
  }
  return result;
}

/**
 * Build death records by agent from public death-confirmation events.
 *
 * @param {object[]} events
 * @returns {Record<string, { day: number, cause: 'attack'|'elimination', content: string }>}
 */
export function deathsByAgent(events) {
  const result = {};

  for (const ev of events) {
    if (!ev.day) continue;
    if (ev.event_type === 'elimination' && ev.agent && !result[ev.agent]) {
      result[ev.agent] = { day: ev.day, cause: 'elimination', content: ev.content ?? '' };
    } else if (ev.event_type === 'night_attack' && ev.is_public === true && ev.target && !result[ev.target]) {
      result[ev.target] = { day: ev.day, cause: 'attack', content: ev.content ?? '' };
    }
  }

  return result;
}

/**
 * Return the day an agent died, or -1 when no death record exists.
 *
 * @param {object[]} events
 * @param {string} name
 * @returns {number}
 */
export function deathDayOf(events, name) {
  return deathsByAgent(events)[name]?.day ?? -1;
}

function collectParticipantNames(events, agents) {
  const names = new Set(Object.keys(agents));
  for (const ev of events) {
    if (ev.agent) names.add(ev.agent);
    if (ev.target) names.add(ev.target);
  }
  return [...names].sort();
}

/**
 * Build the AgentDetail game-scoped roster from log participants and agent JSON.
 *
 * @param {object[]} events
 * @param {Record<string, object>} agents
 * @returns {{name: string, role: string|null, isAlive: boolean}[]}
 */
export function buildAgentDetailRoster(events, agents = {}) {
  return collectParticipantNames(events, agents).map(name => ({
    name,
    role: agents[name]?.role ?? null,
    isAlive: agents[name]?.is_alive ?? true,
  }));
}

/**
 * Count one agent's speech events.
 *
 * @param {object[]} events
 * @param {string} agentName
 * @returns {number}
 */
export function countAgentSpeeches(events, agentName) {
  return events.filter(ev => ev.event_type === 'speech' && ev.agent === agentName).length;
}

function suspicionPercent(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value))) * 100);
}

function latestSuspicionSnapshot(events, agentName) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (
      ev.event_type === 'suspicion_update' &&
      ev.agent === agentName &&
      ev.suspicion_snapshot &&
      typeof ev.suspicion_snapshot === 'object'
    ) {
      return ev.suspicion_snapshot;
    }
  }
  return null;
}

/**
 * Build suspicion matrix rows for AgentDetail.
 *
 * Uses the latest suspicion_update snapshot for the agent when present. Falls
 * back to agents/*.json state.beliefs[].suspicion for older archives.
 *
 * @param {object[]} events
 * @param {Record<string, object>} agents
 * @param {string} agentName
 * @returns {{name: string, suspicion: number}[]}
 */
export function buildSuspicionMatrix(events, agents = {}, agentName) {
  const snapshot = latestSuspicionSnapshot(events, agentName);
  const source = snapshot ?? Object.fromEntries(
    Object.entries(agents[agentName]?.state?.beliefs ?? {})
      .map(([name, belief]) => [name, belief?.suspicion])
      .filter(([, value]) => Number.isFinite(value))
  );

  return Object.entries(source)
    .filter(([name, value]) => name !== agentName && Number.isFinite(value))
    .map(([name, value]) => ({ name, suspicion: suspicionPercent(value) }))
    .sort((a, b) => b.suspicion - a.suspicion || a.name.localeCompare(b.name));
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
 * @returns {{ events: object[], agents: Record<string, object>, daySummary: object, nightResults: object, actionsTimeline: object[] }}
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
  const gameOverEvent = rawEvents.find(ev => ev.event_type === 'game_over');
  return {
    events,
    agents,
    daySummary: aggregateDaySummary(rawEvents),
    nightResults: aggregateNightResults(rawEvents),
    actionsTimeline: buildActionsTimeline(rawEvents),
    winner: gameOverEvent?.winner ?? null,
  };
}

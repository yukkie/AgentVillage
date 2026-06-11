// Legacy-Adapter: new logs use speech.claimed_role for CO; old logs emit a
// separate co_announcement event. Keep co_announcement here so archived replays
// continue to appear in the discuss feed.
const DISCUSS_TYPES = new Set(['speech', 'co_announcement']);
const DISCUSS_SPECTATOR_TYPES = new Set(['suspicion_update', 'threat_update']);
const VOTE_TYPES = new Set(['vote', 'elimination', 'medium_result']);
const NIGHT_TYPES = new Set(['wolf_chat', 'inspection', 'guard', 'guard_block', 'night_attack']);
const NIGHT_PHASES = new Set(['night', 'night_wolf_chat']);

/**
 * Filter events for the centre feed by day and active phase tab.
 *
 * @param {object[]} events - normalised event list from parseGameData
 * @param {number} day
 * @param {'discuss'|'vote'|'night'} phase
 * @returns {object[]}
 */
export function filterFeedEvents(events, day, phase) {
  return events.filter(ev => {
    if (ev.day !== day) return false;

    if (phase === 'discuss') {
      if (DISCUSS_TYPES.has(ev.event_type)) return ev.is_public !== false;
      if (DISCUSS_SPECTATOR_TYPES.has(ev.event_type)) return true;
      if (ev.event_type === 'phase_start') return !NIGHT_PHASES.has(ev.phase) && ev.phase !== 'day_vote';
      return false;
    }

    if (phase === 'vote') {
      if (VOTE_TYPES.has(ev.event_type)) return true;
      if (ev.event_type === 'phase_start') return ev.phase === 'day_vote';
      return false;
    }

    if (phase === 'night') {
      if (NIGHT_TYPES.has(ev.event_type)) return true;
      if (ev.event_type === 'phase_start') return NIGHT_PHASES.has(ev.phase);
      return false;
    }

    if (phase === 'game_over') {
      return ev.event_type === 'game_over';
    }

    if (phase === 'eve') {
      return ev.event_type === 'game_start_narrative' || ev.event_type === 'role_assigned';
    }

    return false;
  });
}

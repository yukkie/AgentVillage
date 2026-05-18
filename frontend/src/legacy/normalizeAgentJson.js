/**
 * Legacy-Adapter: normalize old agent JSON shapes to the current profile/state format.
 *
 * Search marker: Legacy-Adapter
 * Handles agent dicts written before the profile/state split (pre-issue-#52).
 *
 * Only adaptation logic lives here. No game logic, no domain behavior.
 */

/**
 * Normalize an agent JSON object to the current { profile, state, role } shape.
 * Agents saved before the profile/state split use a flat top-level structure.
 *
 * @param {object} data - Raw parsed agent JSON
 * @returns {{ profile: object, state: object, role: string|null }}
 */
export function normalizeAgentJson(data) {
  // Current format: already has profile/state keys
  if ('profile' in data) {
    return data;
  }

  // Legacy flat format (pre-#52): promote to profile/state structure
  return {
    profile: {
      name: data.name ?? null,
      model: data.model ?? null,
      persona: data.persona ?? {},
    },
    state: {
      beliefs: data.beliefs ?? {},
      memory_summary: data.memory_summary ?? [],
      is_alive: data.is_alive ?? true,
      claimed_role: data.claimed_role ?? null,
      intended_co: data.intended_co ?? null,
    },
    role: data.role ?? null,
  };
}

"""Legacy-Adapter: normalize old actor JSON shapes to the current ActorProfile + ActorState format.

Search marker: Legacy-Adapter
Handles actor dicts written before the profile/state split (pre-issue-#52).

Only adaptation logic lives here. No game logic, no domain behavior.
"""

from src.domain.actor import ActorProfile, ActorState


def normalize_actor_dict(
    data: dict,
    agent_catalog: dict[str, ActorProfile] | None,
) -> tuple[ActorProfile, ActorState]:
    """Legacy-Adapter: convert a flat (legacy) actor dict to (ActorProfile, ActorState).

    Called only when ``data`` lacks the ``profile`` / ``state`` keys introduced
    in the profile/state split. The current on-disk format goes through
    ``actor_from_dict`` directly and never reaches this function.
    """
    fallback_name = data.get("name")
    if fallback_name and agent_catalog and fallback_name in agent_catalog:
        catalog_profile = agent_catalog[fallback_name]
        profile_data = {
            "name": data.get("name", catalog_profile.name),
            "model": data.get("model", catalog_profile.model),
            "persona": data.get("persona", catalog_profile.persona.model_dump(mode="json")),
        }
    else:
        profile_data = {
            "name": data["name"],
            "model": data.get("model", ActorProfile.model_fields["model"].default),
            "persona": data["persona"],
        }

    state_data = {
        "beliefs": data.get("beliefs", {}),
        "memory_summary": data.get("memory_summary", []),
        "is_alive": data.get("is_alive", True),
        "claimed_role": data.get("claimed_role"),
        "intended_co": data.get("intended_co"),
    }

    return (
        ActorProfile.model_validate(profile_data),
        ActorState.model_validate(state_data),
    )

from src.domain.actor import Actor
from src.agent import store


def update_memory(actor: Actor, memory_updates: list[str]) -> Actor:
    """Append memory_updates to actor's memory_summary and persist."""
    for item in memory_updates:
        if item and item not in actor.state.memory_summary:
            actor.state.memory_summary.append(item)
    try:
        store.save(actor)
    except OSError as e:
        raise OSError(f"Failed to persist memory for {actor.name}: {e}") from e
    return actor

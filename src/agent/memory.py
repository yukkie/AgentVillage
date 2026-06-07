from src.domain.actor import Actor, Belief
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


def update_beliefs(actor: Actor, suspicion_scores: dict[str, float]) -> Actor:
    """Apply suspicion score updates to actor beliefs and persist.

    Values are clamped to [0.0, 1.0]. Missing belief entries are created.
    """
    for name, score in suspicion_scores.items():
        clamped = max(0.0, min(1.0, score))
        if name not in actor.state.beliefs:
            actor.state.beliefs[name] = Belief()
        actor.state.beliefs[name].suspicion = clamped
    try:
        store.save(actor)
    except OSError as e:
        raise OSError(f"Failed to persist beliefs for {actor.name}: {e}") from e
    return actor


def update_threat_scores(actor: Actor, threat_scores: dict[str, float]) -> Actor:
    """Apply threat score updates to actor state and persist.

    Values are clamped to [0.0, 1.0]. Intended for Werewolf actors only.
    """
    for name, score in threat_scores.items():
        actor.state.threat_scores[name] = max(0.0, min(1.0, score))
    try:
        store.save(actor)
    except OSError as e:
        raise OSError(f"Failed to persist threat scores for {actor.name}: {e}") from e
    return actor


def suspicion_snapshot(actor: Actor) -> dict[str, float]:
    """Return the actor's post-update accumulated suspicion state.

    Derived from the same in-memory ``beliefs`` that ``update_beliefs`` writes
    and ``store.save`` persists to ``agent.json``. No separate replay-only
    accumulator is maintained.
    """
    return {name: belief.suspicion for name, belief in actor.state.beliefs.items()}


def threat_snapshot(actor: Actor) -> dict[str, float]:
    """Return the actor's post-update accumulated threat state.

    Derived from the same in-memory ``threat_scores`` that
    ``update_threat_scores`` writes and ``store.save`` persists to
    ``agent.json``. Intended for Werewolf actors only.
    """
    return dict(actor.state.threat_scores)

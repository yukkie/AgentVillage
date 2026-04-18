from src.action.types import Vote, Inspect, Attack, CO
from src.domain.actor import Actor
from src.domain.roles import Werewolf

ActionType = Vote | Inspect | Attack | CO


def resolve_vote(action: Vote, agents: list[Actor]) -> str:
    """Return the target of the vote (validated externally)."""
    return action.target


def resolve_inspect(action: Inspect, agents: list[Actor]) -> tuple[str, Werewolf | None]:
    """
    Resolve a Seer's inspect action.
    Returns (target_name, result) where result is Werewolf instance if target is a Werewolf, else None.
    The Seer only learns alignment, not the specific role.
    """
    for actor in agents:
        if actor.name == action.target:
            return (actor.name, actor.role if isinstance(actor.role, Werewolf) else None)
    raise ValueError(f"resolve_inspect: target '{action.target}' not found in agents")


def resolve_attack(action: Attack, agents: list[Actor]) -> str:
    """
    Resolve a Werewolf's attack action.
    Returns the name of the attacked player.
    """
    return action.target


def resolve_co(action: CO, actor: Actor) -> str:
    """
    Resolve a CO (Coming Out) action.
    Returns the claimed role.
    """
    return action.role

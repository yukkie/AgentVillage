from src.action.types import Vote, Inspect, Attack, CO
from src.domain.actor import Actor
from src.domain.roles import Werewolf

ActionType = Vote | Inspect | Attack | CO


def resolve_vote(action: Vote, agents: list[Actor]) -> str:
    """Return the target of the vote (validated externally)."""
    return action.target


def resolve_inspect(action: Inspect, agents: list[Actor]) -> tuple[str, str]:
    """
    Resolve a Seer's inspect action.
    Returns (target_name, result) where result is "Werewolf" or "Not Werewolf".
    The Seer only learns alignment, not the specific role.
    """
    for actor in agents:
        if actor.name == action.target:
            result = "Werewolf" if isinstance(actor.role, Werewolf) else "Not Werewolf"
            return (actor.name, result)
    return (action.target, "Unknown")


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

from src.action.types import Vote, Inspect, Attack, CO
from src.domain.agent import AgentState

ActionType = Vote | Inspect | Attack | CO


def resolve_vote(action: Vote, agents: list[AgentState]) -> str:
    """Return the target of the vote (validated externally)."""
    return action.target


def resolve_inspect(action: Inspect, agents: list[AgentState]) -> tuple[str, str]:
    """
    Resolve a Seer's inspect action.
    Returns (target_name, result) where result is "Werewolf" or "Not Werewolf".
    The Seer only learns alignment, not the specific role.
    """
    for agent in agents:
        if agent.name == action.target:
            result = "Werewolf" if agent.role == "Werewolf" else "Not Werewolf"
            return (agent.name, result)
    return (action.target, "Unknown")


def resolve_attack(action: Attack, agents: list[AgentState]) -> str:
    """
    Resolve a Werewolf's attack action.
    Returns the name of the attacked player.
    """
    return action.target


def resolve_co(action: CO, actor: AgentState) -> str:
    """
    Resolve a CO (Coming Out) action.
    Returns the claimed role.
    """
    return action.role

from src.action.types import Vote, Inspect, Attack, CO
from src.agent.state import AgentState

ActionType = Vote | Inspect | Attack | CO


def validate(action: ActionType, actor: AgentState, alive_players: list[str]) -> bool:
    """
    Validate that an action is legal given the current game state.
    Returns True if the action is valid, False otherwise.
    """
    if isinstance(action, Vote):
        # Can only vote for alive players other than yourself
        return action.target in alive_players and action.target != actor.name

    elif isinstance(action, Inspect):
        # Only Seer can inspect
        if actor.role != "Seer":
            return False
        return action.target in alive_players and action.target != actor.name

    elif isinstance(action, Attack):
        # Only Werewolf can attack
        if actor.role != "Werewolf":
            return False
        return action.target in alive_players and action.target != actor.name

    elif isinstance(action, CO):
        # Any alive player can CO (claim a role)
        return actor.is_alive

    return False

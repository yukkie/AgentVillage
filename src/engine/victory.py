from src.domain.agent import AgentState


def check_victory(agents: list[AgentState]) -> str | None:
    """
    Check win condition among alive agents.
    Returns:
      "Villagers" if all Werewolves have been eliminated
      "Werewolves" if Werewolves >= non-Werewolf players
      None if game continues
    """
    alive = [a for a in agents if a.is_alive]
    werewolves = [a for a in alive if a.role == "Werewolf"]
    villagers = [a for a in alive if a.role != "Werewolf"]

    if len(werewolves) == 0:
        return "Villagers"
    if len(werewolves) >= len(villagers):
        return "Werewolves"
    return None

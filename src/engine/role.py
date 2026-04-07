ROLE_NIGHT_ACTIONS = {
    "Villager": None,
    "Werewolf": "attack",
    "Seer": "inspect",
    "Knight": "guard",
    "Medium": None,
    "Madman": None,
}


def has_night_action(role: str) -> bool:
    return ROLE_NIGHT_ACTIONS.get(role) is not None


def get_night_action_type(role: str) -> str | None:
    return ROLE_NIGHT_ACTIONS.get(role)

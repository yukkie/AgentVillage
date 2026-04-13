from src.domain.roles.role import Role
from src.domain.roles.villager import Villager
from src.domain.roles.werewolf import Werewolf
from src.domain.roles.seer import Seer
from src.domain.roles.knight import Knight
from src.domain.roles.medium import Medium
from src.domain.roles.madman import Madman

_ROLE_REGISTRY: dict[str, Role] = {
    "Villager": Villager(),
    "Werewolf": Werewolf(),
    "Seer": Seer(),
    "Knight": Knight(),
    "Medium": Medium(),
    "Madman": Madman(),
}


def get_role(role: str) -> Role:
    """Factory: role name string -> Role instance."""
    r = _ROLE_REGISTRY.get(role)
    if r is None:
        raise ValueError(f"Unknown role: {role!r}")
    return r


__all__ = [
    "Role",
    "Villager",
    "Werewolf",
    "Seer",
    "Knight",
    "Medium",
    "Madman",
    "get_role",
]

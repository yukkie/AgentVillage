"""Pure functions for building role roster display strings."""
from collections import Counter

from src.domain.actor import Actor


def build_roster_summary(agents: list[Actor]) -> str:
    """Return a role count summary string, e.g. '3 Villagers · 1 Seer · 1 Werewolf'."""
    counts: Counter[str] = Counter(a.role.name for a in agents)
    role_map = {a.role.name: a.role for a in agents}
    parts = [
        f"{count} {role_map[name].plural if count > 1 else name}"
        for name, count in sorted(counts.items())
    ]
    return "This village has " + " · ".join(parts)


def build_roster_full(agents: list[Actor]) -> list[tuple[str, str, str]]:
    """Return a list of (name, role_name, style) tuples for full spectator display."""
    return [(a.name, a.role.name, a.persona.style) for a in agents]

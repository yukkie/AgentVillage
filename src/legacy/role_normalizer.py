"""Legacy-Adapter: normalize old role representations to Role instances.

Search marker: Legacy-Adapter
Handles role name strings stored in JSON before RoleField was introduced (pre-issue-#72).

Only adaptation logic lives here. No game logic, no domain behavior.
"""

from src.domain.roles import Role, get_role


def normalize_role_field(v: object) -> Role | None:
    """Legacy-Adapter: accept role name strings from old JSON alongside Role instances."""
    if v is None:
        return None
    if isinstance(v, Role):
        return v
    try:
        return get_role(str(v))
    except ValueError:
        return None

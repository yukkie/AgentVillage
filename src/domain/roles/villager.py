from src.domain.roles.role import Role


class Villager(Role):
    @property
    def name(self) -> str:
        return "Villager"

    @property
    def faction(self) -> str:
        return "village"

    @property
    def night_action(self) -> str | None:
        return None

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        return (
            "You are a Villager. Your goal is to identify and eliminate the Werewolf through "
            "discussion and voting. Observe others carefully, share your suspicions, and vote "
            "strategically. You have no special night actions."
        )

    def co_prompt(self) -> str:
        return ""

    def pre_night_prompt(self) -> str:
        return ""

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        return ""

    def co_strategy_hint(self) -> str:
        return ""

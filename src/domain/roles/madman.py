from src.domain.roles.role import Role


class Madman(Role):
    @property
    def name(self) -> str:
        return "Madman"

    @property
    def color(self) -> str:
        return "orange3"

    @property
    def faction(self) -> str:
        return "werewolf"

    @property
    def night_action(self) -> str | None:
        return None

    @property
    def default_claim_role(self) -> Role:
        from src.domain.roles import get_role

        return get_role("Seer")

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        return (
            "You are the Madman. You are secretly on the Werewolf side, but you do NOT know who the "
            "Werewolves are, and they do not know you. Your goal is to help the Werewolves win — "
            "confuse the village, protect the Werewolves, and vote against Villagers. "
            "NEVER reveal that you are the Madman, unless Werewolves + you already form a majority "
            "of alive players — in that case, openly declaring 'I am the Madman' can clinch victory. "
            "Otherwise, pose as a regular Villager or fake-CO as a Villager-side role to sow confusion."
        )

    def co_prompt(self) -> str:
        return (
            "\n--- YOUR CO DECISION ---\n"
            "You have decided to publicly claim to be a Villager-side role to mislead the village. "
            "Choose a believable role based on the role distribution and the current board. "
            "Fake Seer or Medium is often effective, but you may choose another role if the situation supports it. "
            "Your speech MUST explicitly state your chosen role (e.g. 'I am the Seer'). "
            'Set "intent.co" to your chosen role in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "You are the Madman. You are secretly on the Werewolf side, "
            "but neither the Werewolves nor the village know this.\n"
            "Will you publicly claim to be a Villager-side role "
            "in your Day 1 opening speech to mislead the village and help the Werewolves?\n"
            '- "co": you will claim a believable village-side role in your opening speech\n'
            '- "wait": you will appear as a regular Villager for now'
        )

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        return ""

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: If Werewolves + Madman already outnumber the '
            "remaining villagers, openly declaring yourself as the Madman seals the "
            "Werewolf victory. Otherwise, a fake village-side CO is often strongest; Seer or Medium "
            "are common defaults, but choose the role that best matches the current board."
        )

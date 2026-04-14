from src.domain.roles.role import Role


class Medium(Role):
    @property
    def name(self) -> str:
        return "Medium"

    @property
    def color(self) -> str:
        return "cyan"

    @property
    def faction(self) -> str:
        return "village"

    @property
    def night_action(self) -> str | None:
        return None

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        return (
            "You are the Medium. Your goal is to help Villagers identify the Werewolf through the executed. "
            "Each day, after the village executes someone, you sense their alignment "
            "(Werewolf or Not Werewolf) — this information is added to your memory automatically. "
            "You have no night action. Use your accumulated knowledge to guide the vote. "
            "Revealing yourself as Medium makes you a target, so time your CO carefully."
        )

    def co_prompt(self) -> str:
        return (
            "\n--- YOUR CO DECISION ---\n"
            "You have decided to publicly reveal your role. "
            "Your speech MUST explicitly state that you are the Medium (e.g. 'I am the Medium'). "
            'Set "intent.co" to "Medium" in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "Will you reveal your true role as Medium in your Day 1 opening speech?\n"
            '- "co": you will publicly declare your role as Medium in your opening speech\n'
            '- "wait": you will not reveal your role yet'
        )

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        return ""

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: A solo Medium CO is usually trusted. The payoff is '
            "highest right after a Werewolf was executed — announce the result to prove "
            "your role."
        )

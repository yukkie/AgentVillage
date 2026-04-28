from src.domain.roles.role import Role


class Seer(Role):
    @property
    def name(self) -> str:
        return "Seer"

    @property
    def color(self) -> str:
        return "blue"

    @property
    def faction(self) -> str:
        return "village"

    @property
    def night_action(self) -> str | None:
        return "inspect"

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        return (
            "You are the Seer. Your goal is to help Villagers identify the Werewolf. "
            "Each night you can inspect a player and learn their alignment (Werewolf or Not Werewolf). "
            "Use your knowledge wisely — revealing yourself as Seer makes you a target for the Werewolf. "
            "Share inspection results strategically."
        )

    def co_prompt(self) -> str:
        return (
            "\n--- YOUR CO DECISION ---\n"
            "You have decided to publicly reveal your role. "
            "Your speech MUST explicitly state that you are the Seer (e.g. 'I am the Seer'). "
            'Set "intent.co" to "Seer" in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "Will you reveal your true role as Seer in your Day 1 opening speech?\n"
            '- "co": you will publicly declare your role as Seer in your opening speech\n'
            '- "wait": you will not reveal your role yet'
        )

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        candidates = [p for p in alive_players if p != agent_name]
        return (
            f"NIGHT ACTION — {agent_name} (Seer)\n"
            f"Context: {context}\n"
            f"Alive players (excluding you): {', '.join(candidates)}\n"
            f"Your task: choose one player to INSPECT (learn their alignment) tonight.\n"
            "Pick a player you want to investigate.\n"
            "Respond with ONLY valid JSON, no other text:\n"
            '{"target": "<player name>", "reasoning": "<one sentence why>"}'
        )

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: If no other Seer has claimed yet, a solo CO earns '
            "strong village trust. If you hold a black (Werewolf) result, revealing it "
            "now is a major opportunity to drive the vote."
        )

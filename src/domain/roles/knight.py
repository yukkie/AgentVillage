from src.domain.roles.role import Role


class Knight(Role):
    @property
    def name(self) -> str:
        return "Knight"

    @property
    def color(self) -> str:
        return "bright_green"

    @property
    def faction(self) -> str:
        return "village"

    @property
    def night_action(self) -> str | None:
        return "guard"

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        return (
            "You are the Knight. Your goal is to protect Villagers from the Werewolf's nightly attack. "
            "Each night you choose one player to guard; if the Werewolf attacks them, the attack is blocked. "
            "You cannot guard yourself. Revealing yourself as Knight makes you a priority target, "
            "so time your CO carefully."
        )

    def co_prompt(self) -> str:
        return (
            "\n--- YOUR CO DECISION ---\n"
            "You have decided to publicly reveal your role. "
            "Your speech MUST explicitly state that you are the Knight (e.g. 'I am the Knight'). "
            'Set "intent.co" to "Knight" in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "Will you reveal your true role as Knight in your Day 1 opening speech?\n"
            '- "co": you will publicly declare your role as Knight in your opening speech\n'
            '- "wait": you will not reveal your role yet'
        )

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        candidates = [p for p in alive_players if p != agent_name]
        return (
            f"NIGHT ACTION — {agent_name} (Knight)\n"
            f"Context: {context}\n"
            f"Alive players (excluding you): {', '.join(candidates)}\n"
            f"Your task: choose one player to GUARD (protect from werewolf attack) tonight.\n"
            "Pick a player you want to protect. You cannot guard yourself.\n"
            "Respond with ONLY valid JSON, no other text:\n"
            '{"target": "<player name>", "reasoning": "<one sentence why>"}'
        )

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: Late-game CO can help organize votes by disclosing '
            "your guard history, but you become a prime night-attack target. Use it "
            "when the trade-off favors the village."
        )

from src.domain.roles.role import Role


class Werewolf(Role):
    @property
    def name(self) -> str:
        return "Werewolf"

    @property
    def faction(self) -> str:
        return "werewolf"

    @property
    def night_action(self) -> str | None:
        return "attack"

    def role_prompt(self, wolf_partners: list[str] | None = None) -> str:
        assert wolf_partners is not None, (
            "wolf_partners must not be None for Werewolf (use [] if last surviving)"
        )
        base = (
            "You are a Werewolf. Your goal is to eliminate Villagers until Werewolves equal or "
            "outnumber them. During the day, blend in and deflect suspicion onto others. "
            "Lie convincingly. At night, you attack a target chosen by the system."
        )
        if wolf_partners:
            base += f"\nYour wolf partner(s): {', '.join(wolf_partners)}. Keep this secret."
        else:
            base += "\nYou are the last surviving Werewolf. You must act alone."
        return base

    def co_prompt(self) -> str:
        return (
            "\n--- YOUR CO DECISION ---\n"
            "You have decided to publicly claim to be the Seer to confuse the village. "
            "Your speech MUST explicitly state that you are the Seer (e.g. 'I am the Seer'). "
            'Set "intent.co" to "Seer" in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "Will you publicly claim to be the Seer in your Day 1 opening speech "
            "to confuse the village and neutralize the real Seer?\n"
            '- "co": you will claim to be the Seer in your opening speech\n'
            '- "wait": you will stay silent about your role for now'
        )

    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str:
        candidates = [p for p in alive_players if p != agent_name]
        return (
            f"NIGHT ACTION — {agent_name} (Werewolf)\n"
            f"Context: {context}\n"
            f"Alive players (excluding you): {', '.join(candidates)}\n"
            f"Your task: choose one player to ATTACK (eliminate) tonight.\n"
            "You must pick a non-Werewolf target. Respond with ONLY the player's exact name, nothing else."
        )

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: If no real Seer or Medium has claimed yet, a fake '
            "solo CO (as Seer) lets you steal a key village role. When multiple COs are "
            "already in play and the village is confused, a fake CO deepens the chaos."
        )

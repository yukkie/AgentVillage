from src.domain.roles.role import Role


class Werewolf(Role):
    @property
    def name(self) -> str:
        return "Werewolf"

    @property
    def color(self) -> str:
        return "red"

    @property
    def faction(self) -> str:
        return "werewolf"

    @property
    def night_action(self) -> str | None:
        return "attack"

    @property
    def default_claim_role(self) -> Role:
        from src.domain.roles import get_role

        return get_role("Seer")

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
            "You have decided to publicly claim a village-side role to confuse the village. "
            "Choose a believable claim based on the current role distribution and discussion flow. "
            "A fake Seer claim is the default fallback, but you may choose another role if it fits the board better. "
            "Your speech MUST explicitly state your chosen role (e.g. 'I am the Seer'). "
            'Set "intent.co" to your chosen claimed role in your JSON output.'
        )

    def pre_night_prompt(self) -> str:
        return (
            "Will you publicly claim a village-side role in your Day 1 opening speech "
            "to confuse the village and pressure the real claimant? Use the role distribution to judge what fake CO is most believable.\n"
            '- "co": you will claim a role such as Seer or Medium in your opening speech\n'
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
            "You must pick a non-Werewolf target.\n"
            "Respond with ONLY valid JSON, no other text:\n"
            '{"target": "<player name>", "reasoning": "<one sentence why>"}'
        )

    def co_strategy_hint(self) -> str:
        return (
            '  "co" strategy hint: If no real Seer or Medium has claimed yet, stealing a key '
            "village role with a fake CO can shape the board early. Fake Seer is the most common "
            "default, but adapt your claimed role to the current role distribution and existing claims."
        )

from __future__ import annotations

from typing import TYPE_CHECKING

from src.domain.roles.role import Role

if TYPE_CHECKING:
    from src.domain.actor import Actor
    from src.domain.schema import SpeechEntry


class Werewolf(Role):
    @property
    def name(self) -> str:
        return "Werewolf"

    @property
    def plural(self) -> str:
        return "Werewolves"

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

    def output_format_prompt(self, lang: str = "English") -> str:
        return f"""
--- OUTPUT FORMAT ---
You MUST respond with ONLY valid JSON matching this exact schema. No other text.

{{
  "thought": "<your internal reasoning, hidden from others>",
  "speech": "<what you say aloud to the group>",
  "reasoning": "<your public deduction: who you suspect and why>",
  "intent": {{
    "co": "<role_name or null>"
  }},
  "memory_update": ["<key thing to remember for future turns>", ...],
  "suspicion_scores": {{"<player_name>": <0.0-1.0>, ...}},
  "threat_scores": {{"<player_name>": <0.0-1.0>, ...}}
}}

Rules:
- "thought", "speech", "reasoning", "memory_update" must be written in {lang}
- "thought" is your private inner monologue
- "speech" is your actual spoken words (1-3 sentences)
- "reasoning" is your public deduction statement (1-2 sentences)
- "intent.co" is your role claim if you choose to reveal it, otherwise null
- "memory_update" lists 0-3 key observations to remember
- "suspicion_scores" maps each player you have updated village-side suspicion about (0.0=trusted, 1.0=certain werewolf from the village perspective); omit players whose suspicion has not changed
- "threat_scores" maps each player by how threatening they are to your werewolf team (0.0=safe, 1.0=must eliminate — prioritize Seer, Knight, or anyone close to exposing you); omit players whose threat level has not changed
- Do NOT include your real role in speech unless you are doing a CO
"""

    def night_chat_prompt(self, actor: Actor, wolf_partners: list[str], alive_players: list[str], wolf_chat_log: list[SpeechEntry], lang: str = "English") -> str:
        """Build prompt for werewolf team night chat (secret coordination before attack)."""
        target_candidates = ", ".join(
            p for p in alive_players if p != actor.name and p not in wolf_partners
        )
        lines = [
            f"You are {actor.name}, a Werewolf in a social deduction game.",
            f"Your wolf partners tonight: {', '.join(wolf_partners)}.",
            f"Alive players (potential targets): {target_candidates}.",
            "",
            "It is night. You are meeting secretly with your wolf partner(s) to coordinate.",
            "Your goal is not just to make an individual decision, but to reach a shared plan with your wolf partner(s).",
            "Discuss who to attack tonight, react to what your partner says, and try to move the conversation toward agreement.",
            "Also coordinate your deception plan for the next day: who should fake-CO, which role each wolf should claim, and whether anyone should wait instead.",
            "You are allowed to decide that both wolves fake-CO, only one does, both wait, or even claim the same role if that fits your strategy.",
        ]
        if actor.state.threat_scores:
            lines.append("\nYour current threat assessments (0.0=safe to ignore, 1.0=must eliminate soon):")
            lines.append("Use these to prioritize tonight's attack target.")
            for name, score in actor.state.threat_scores.items():
                lines.append(f"  {name}: threat={score:.2f}")
        if wolf_chat_log:
            lines.append("\nWolf team conversation so far:")
            for entry in wolf_chat_log:
                lines.append(f"  {entry.agent}: {entry.text}")
        lines.append(f"""
--- OUTPUT FORMAT ---
Respond with ONLY valid JSON. No extra fields, no explanation, no other text.
{{
  "thought": "<your private reasoning>",
  "speech": "<what you say to your wolf partner(s)>",
  "attack_candidates": {{"<player_name>": <0.0-1.0>, ...}},
  "self_co_decision": {{
    "claim_role": "<role_name or null>",
    "timing": "next_day" | "wait"
  }}
}}
- "thought" and "speech" must be written in {lang}
- "attack_candidates" lists your preferred attack targets tonight (highest score = most preferred)
- Use "speech" to discuss and negotiate fake-CO ideas with your wolf partner(s)
- "self_co_decision" is your own final personal decision after this discussion, even if the wolves do not fully agree
- If you decide to fake-CO on the next day, set "timing" to "next_day" and set "claim_role" to the role name you will claim (must be an English role name, e.g. "Seer", "Knight", "Villager", "Medium", "Madman" — never use a translated name)
- If you decide to wait, set "timing" to "wait" and "claim_role" to null
- The engine will use only "self_co_decision" to decide your next-day intended fake-CO
- The JSON must contain exactly these four fields and nothing else.
- Note: "attack_candidates" is the night-attack target field; the daytime speech schema uses a separate "vote_candidates" field.""")
        return "\n".join(lines)

    def vote_strategy_prompt(self) -> str:
        return (
            "\n--- VOTE STRATEGY ---\n"
            "Pick a vote strategy and set it in the \"strategy\" field of your JSON output:\n"
            '- "village_side": vote like a Villager would. You may even vote for a wolf partner '
            'if it builds trust (the "line-cutting" play). Use this when you need to look innocent.\n'
            '- "wolf_side": vote to advance the werewolf win condition. Target key village roles '
            "(claimed Seer, Medium, Knight) or pile votes on a confirmed villager. "
            "Be aware: an obviously wolf-aligned vote can draw suspicion from the village, "
            "so use this only when the gain outweighs that risk."
        )

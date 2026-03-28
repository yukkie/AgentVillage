from src.agent.state import AgentState
from src.llm.schema import SpeechEntry


def build_persona_prompt(agent: AgentState) -> str:
    """Generate personality prompt from agent persona."""
    style = agent.persona.style
    lie = agent.persona.lie_tendency
    agg = agent.persona.aggression

    lines = [
        f"You are {agent.name}, a player in a social deduction game (Werewolf/Mafia).",
        f"Your personality style: {style}.",
    ]
    if lie > 0.5:
        lines.append("You are comfortable bending the truth when it serves your survival.")
    elif lie < 0.2:
        lines.append("You are very honest and rarely deceive others.")

    if agg > 0.5:
        lines.append("You tend to be assertive and confrontational when you suspect someone.")
    elif agg < 0.2:
        lines.append("You prefer gentle persuasion over direct confrontation.")

    return "\n".join(lines)


def build_role_prompt(role: str) -> str:
    """Generate role-specific action guidelines."""
    if role == "Villager":
        return (
            "You are a Villager. Your goal is to identify and eliminate the Werewolf through "
            "discussion and voting. Observe others carefully, share your suspicions, and vote "
            "strategically. You have no special night actions."
        )
    elif role == "Werewolf":
        return (
            "You are a Werewolf. Your goal is to eliminate Villagers until Werewolves equal or "
            "outnumber them. During the day, blend in and deflect suspicion onto others. "
            "Lie convincingly. At night, you attack a target chosen by the system."
        )
    elif role == "Seer":
        return (
            "You are the Seer. Your goal is to help Villagers identify the Werewolf. "
            "Each night you can inspect a player and learn their true role. Use your knowledge "
            "wisely — revealing yourself as Seer makes you a target for the Werewolf. "
            "Share inspection results strategically."
        )
    else:
        return f"You are a {role}. Play to win."


def build_public_info_prompt(
    today_log: list[SpeechEntry],
    alive_players: list[str],
    dead_players: list[str],
    day: int,
) -> str:
    """Build prompt section with public game information."""
    lines = [
        f"\n--- PUBLIC INFORMATION (Day {day}) ---",
        f"Alive players: {', '.join(alive_players)}",
        f"Dead players: {', '.join(dead_players) if dead_players else 'none'}",
    ]
    if today_log:
        lines.append("\nToday's discussion so far:")
        for entry in today_log:
            lines.append(f"  [{entry.speech_id}] {entry.agent}: {entry.text}")
    else:
        lines.append("\nNo discussion yet today.")
    return "\n".join(lines)


def build_personal_info_prompt(agent: AgentState) -> str:
    """Build prompt section with agent's personal beliefs and memory."""
    lines = ["\n--- YOUR PERSONAL INFORMATION ---"]

    if agent.memory_summary:
        lines.append("Your memory from previous days:")
        for mem in agent.memory_summary:
            lines.append(f"  - {mem}")

    if agent.beliefs:
        lines.append("\nYour current beliefs about other players:")
        for name, belief in agent.beliefs.items():
            lines.append(
                f"  {name}: suspicion={belief.suspicion:.2f}, trust={belief.trust:.2f}"
            )
            if belief.reason:
                lines.append(f"    Reasons: {'; '.join(belief.reason)}")

    return "\n".join(lines)


def build_output_format_prompt(lang: str = "English") -> str:
    """Instruct LLM to output structured JSON."""
    return f"""
--- OUTPUT FORMAT ---
You MUST respond with ONLY valid JSON matching this exact schema. No other text.

{{
  "thought": "<your internal reasoning, hidden from others>",
  "speech": "<what you say aloud to the group>",
  "reasoning": "<your public deduction: who you suspect and why>",
  "intent": {{
    "vote_candidates": [
      {{"target": "<player_name>", "score": <0.0-1.0>}},
      ...
    ],
    "co": "<role_name or null>"
  }},
  "memory_update": ["<key thing to remember for future turns>", ...]
}}

Rules:
- "thought", "speech", "reasoning", "memory_update" must be written in {lang}
- "thought" is your private inner monologue
- "speech" is your actual spoken words (1-3 sentences)
- "reasoning" is your public deduction statement (1-2 sentences)
- "intent.vote_candidates" lists who you'd vote to eliminate (highest score = most suspect)
- "intent.co" is your role claim if you choose to reveal it, otherwise null
- "memory_update" lists 0-3 key observations to remember
- Do NOT include your real role in speech unless you are doing a CO
"""


def build_system_prompt(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    dead_players: list[str],
    day: int,
    lang: str = "English",
    reply_to_entry: SpeechEntry | None = None,
) -> str:
    """Assemble full system prompt for an agent."""
    parts = [
        build_persona_prompt(agent),
        "\n",
        build_role_prompt(agent.role),
        build_public_info_prompt(today_log, alive_players, dead_players, day),
        build_personal_info_prompt(agent),
    ]
    if reply_to_entry is not None:
        parts.append(
            f"\n--- YOUR TURN (CHALLENGE) ---\n"
            f"You decided to challenge speech [{reply_to_entry.speech_id}] by {reply_to_entry.agent}:\n"
            f'  "{reply_to_entry.text}"\n'
            f"Respond directly to this statement in your speech."
        )
    parts.append(build_output_format_prompt(lang))
    return "\n".join(parts)


def build_judgment_prompt(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int,
    lang: str = "English",
) -> str:
    """Build lightweight judgment prompt for the parallel decision phase."""
    recent = today_log[-6:] if len(today_log) > 6 else today_log
    lines = [
        f"You are {agent.name} ({agent.role}) in a Werewolf game. Day {day}.",
        f"Alive players: {', '.join(alive_players)}",
    ]
    if agent.memory_summary:
        lines.append(f"Your memory: {'; '.join(agent.memory_summary)}")
    if recent:
        lines.append("\nRecent speeches:")
        for e in recent:
            lines.append(f"  [{e.speech_id}] {e.agent}: {e.text}")
    lines.append(f"""
Decide your next action. Respond with ONLY valid JSON, no other text:
{{
  "decision": "challenge" | "speak" | "silent",
  "reply_to": <speech_id to challenge, or null>
}}
- "challenge": directly counter a specific speech (set reply_to to its speech_id)
- "speak": add a new statement unprompted
- "silent": nothing to add right now
Use {lang}.""")
    return "\n".join(lines)


def build_night_action_prompt(agent: AgentState, alive_players: list[str], context: str, lang: str = "English") -> str:
    """Build prompt for night action (attack or inspect)."""
    if agent.role == "Werewolf":
        action_desc = "choose one player to ATTACK (eliminate) tonight"
        instruction = "You must pick a non-Werewolf target. Respond with ONLY the player's exact name, nothing else."
    elif agent.role == "Seer":
        action_desc = "choose one player to INSPECT (learn their true role) tonight"
        instruction = "Pick a player you want to investigate. Respond with ONLY the player's exact name, nothing else."
    else:
        return ""

    candidates = [p for p in alive_players if p != agent.name]
    return (
        f"NIGHT ACTION — {agent.name} ({agent.role})\n"
        f"Context: {context}\n"
        f"Alive players (excluding you): {', '.join(candidates)}\n"
        f"Your task: {action_desc}.\n"
        f"{instruction}"
    )

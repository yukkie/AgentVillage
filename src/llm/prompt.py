from src.agent.state import AgentState
from src.llm.schema import SpeechEntry


_SPEECH_STYLE_PROMPTS: dict[str, str] = {
    "polite": "You speak politely and formally, using respectful language at all times.",
    "casual": "You speak in a relaxed, casual tone.",
    "blunt": "You speak bluntly and directly, with little regard for social niceties.",
    "gentle": (
        "You speak in a calm, measured tone — composed and unhurried, "
        "like a mature adult who chooses words carefully and never raises their voice."
    ),
    "tsundere": (
        "You have a tsundere personality: you act cold, dismissive, or even hostile on the surface, "
        "but occasionally let warmth or concern slip through — especially when caught off guard. "
        "You would never openly admit to caring about others."
    ),
}


def build_persona_prompt(agent: AgentState) -> str:
    """Generate personality prompt from agent persona."""
    style = agent.persona.style
    lie = agent.persona.lie_tendency
    agg = agent.persona.aggression

    identity_parts = [agent.name]
    if agent.persona.age is not None:
        identity_parts.append(f"age {agent.persona.age}")
    if agent.persona.gender is not None:
        identity_parts.append(agent.persona.gender)
    identity = ", ".join(identity_parts)

    lines = [
        f"You are {identity}, a player in a social deduction game (Werewolf/Mafia).",
        f"Your personality style: {style}.",
    ]

    speech_prompt = _SPEECH_STYLE_PROMPTS.get(agent.persona.speech_style)
    if speech_prompt:
        lines.append(speech_prompt)
    elif agent.persona.speech_style != "casual":
        lines.append(f"Your speaking style: {agent.persona.speech_style}.")

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
    all_agents: list[AgentState] | None = None,
    past_votes: list[dict] | None = None,
    past_deaths: list[dict] | None = None,
) -> str:
    """Build prompt section with public game information."""
    from collections import Counter
    lines = [f"\n--- PUBLIC INFORMATION (Day {day}) ---"]

    if all_agents:
        role_counts = Counter(a.role for a in all_agents)
        role_summary = ", ".join(f"{count} {role}" for role, count in sorted(role_counts.items()))
        lines.append(f"Role distribution: {role_summary}")

    lines += [
        f"Alive players: {', '.join(alive_players)}",
        f"Dead players: {', '.join(dead_players) if dead_players else 'none'}",
    ]

    if past_deaths:
        lines.append("\nPast deaths:")
        for d in past_deaths:
            cause = "executed" if d["cause"] == "execution" else "killed by werewolves"
            lines.append(f"  Day {d['day']}: {d['name']} was {cause}")

    if past_votes:
        lines.append("\nPast votes:")
        for v in past_votes:
            vote_str = ", ".join(f"{voter}→{target}" for voter, target in v["votes"].items())
            lines.append(f"  Day {v['day']}: {vote_str}")

    if all_agents:
        claims = [
            f"{a.name} claims {a.claimed_role}"
            for a in all_agents
            if a.claimed_role is not None
        ]
        if claims:
            lines.append(f"Known role claims: {', '.join(claims)}")

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
    all_agents: list[AgentState] | None = None,
    past_votes: list[dict] | None = None,
    past_deaths: list[dict] | None = None,
    intended_co: bool = False,
) -> str:
    """Assemble full system prompt for an agent."""
    parts = [
        build_persona_prompt(agent),
        "\n",
        build_role_prompt(agent.role),
        build_public_info_prompt(today_log, alive_players, dead_players, day, all_agents, past_votes, past_deaths),
        build_personal_info_prompt(agent),
    ]
    if reply_to_entry is not None:
        parts.append(
            f"\n--- YOUR TURN (CHALLENGE) ---\n"
            f"You decided to challenge speech [{reply_to_entry.speech_id}] by {reply_to_entry.agent}:\n"
            f'  "{reply_to_entry.text}"\n'
            f"Respond directly to this statement in your speech."
        )
    if intended_co:
        if agent.role == "Werewolf":
            parts.append(
                "\n--- YOUR PRE-GAME DECISION ---\n"
                "Before the game began, you decided to claim to be the Seer today to confuse the village. "
                "Declare yourself as the Seer in your speech. "
                'Set "intent.co" to "Seer" in your JSON output.'
            )
        else:
            parts.append(
                f"\n--- YOUR PRE-GAME DECISION ---\n"
                f"Before the game began, you decided to publicly reveal your role today. "
                f"State that you are the {agent.role} in your speech. "
                f'Set "intent.co" to "{agent.role}" in your JSON output.'
            )
    parts.append(build_output_format_prompt(lang))
    return "\n".join(parts)


def build_pre_night_prompt(
    agent: AgentState,
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[AgentState] | None = None,
) -> str:
    """Build prompt for pre-night CO decision phase (non-Villager roles only).

    Seer decides whether to true-CO. Werewolf decides whether to fake-CO as Seer.
    Both choices are encoded as "co" | "wait".
    """
    if agent.role == "Werewolf":
        decision_desc = (
            "Will you claim to be the Seer (fake-CO) in your Day 1 opening speech "
            "to confuse the village and neutralize the real Seer?\n"
            '- "co": you will claim to be the Seer in your opening speech\n'
            '- "wait": you will stay silent about your role for now'
        )
    else:
        decision_desc = (
            f"Will you reveal your true role as {agent.role} in your Day 1 opening speech?\n"
            f'- "co": you will publicly declare your role as {agent.role} in your opening speech\n'
            f'- "wait": you will not reveal your role yet'
        )

    lines = [
        f"You are {agent.name}, a player in a social deduction game (Werewolf/Mafia).",
        f"Your personality style: {agent.persona.style}.",
        "",
        f"Your secret role is: {agent.role}",
        f"Players in this game: {', '.join(alive_players)}",
    ]

    if all_agents:
        from collections import Counter
        role_counts = Counter(a.role for a in all_agents)
        role_summary = ", ".join(f"{count} {role}" for role, count in sorted(role_counts.items()))
        lines.append(f"Role distribution in this game: {role_summary}")

    lines += [
        "",
        "Before Day 1 begins, you must secretly decide your opening strategy.",
        decision_desc,
        "",
        "--- OUTPUT FORMAT ---",
        'Respond with ONLY valid JSON, no other text:',
        "{",
        '  "thought": "<your internal reasoning>",',
        '  "decision": "co" | "wait",',
        '  "reasoning": "<brief explanation of your choice>"',
        "}",
        f'- "thought" and "reasoning" must be written in {lang}',
        '- "decision" must be exactly "co" or "wait" (always English, no other value)',
    ]
    return "\n".join(lines)


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
Decide your next action. Respond with ONLY valid JSON. No extra fields, no explanation, no other text.
{{
  "decision": "challenge" | "speak" | "silent",
  "reply_to": <speech_id to challenge, or null>
}}
- "challenge": directly counter a specific speech (set reply_to to its speech_id)
- "speak": add a new statement unprompted
- "silent": nothing to add right now
- The JSON must contain exactly these two fields and nothing else.
Use {lang} only for internal reasoning if needed, but keep the JSON minimal.""")
    return "\n".join(lines)


def build_wolf_chat_prompt(
    agent: AgentState,
    wolf_partners: list[str],
    alive_players: list[str],
    wolf_chat_log: list[SpeechEntry],
    lang: str = "English",
) -> str:
    """Build prompt for werewolf team night chat (secret coordination before attack)."""
    lines = [
        f"You are {agent.name}, a Werewolf in a social deduction game.",
        f"Your wolf partners tonight: {', '.join(wolf_partners)}.",
        f"Alive players (potential targets): {', '.join(p for p in alive_players if p != agent.name and p not in wolf_partners)}.",
        "",
        "It is night. You are meeting secretly with your wolf partner(s) to coordinate.",
        "Discuss who to attack tonight. You may propose a target and explain your reasoning.",
    ]
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
  "vote_candidates": [
    {{"target": "<player_name>", "score": <0.0-1.0>}},
    ...
  ]
}}
- "thought" and "speech" must be written in {lang}
- "vote_candidates" lists your preferred attack targets (highest score = most preferred)
- The JSON must contain exactly these three fields and nothing else.""")
    return "\n".join(lines)


def build_night_action_prompt(agent: AgentState, alive_players: list[str], context: str) -> str:
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

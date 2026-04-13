from dataclasses import dataclass, field

from src.domain.agent import AgentState
from src.domain.roles import get_role
from src.domain.schema import SpeechEntry


@dataclass
class PublicContext:
    today_log: list[SpeechEntry]
    alive_players: list[str]
    dead_players: list[str]
    day: int
    all_agents: list[AgentState] | None = None
    past_votes: list[dict] | None = None
    past_deaths: list[dict] | None = None


@dataclass
class SpeechDirection:
    lang: str = "English"
    reply_to_entry: SpeechEntry | None = None
    intended_co: bool = False


@dataclass
class RoleSpecificContext:
    """Base class for role-specific runtime context."""
    pass


@dataclass
class WolfSpecificContext(RoleSpecificContext):
    wolf_partners: list[str] = field(default_factory=list)


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


def build_role_prompt(role: str, wolf_partners: list[str] | None = None) -> str:
    """Generate role-specific action guidelines.

    Delegates to the Role class (Strategy pattern). See src/domain/roles/.
    """
    if role != "Werewolf":
        assert wolf_partners is None, (
            f"wolf_partners must be None for non-Werewolf roles, got role={role!r}"
        )
    return get_role(role).role_prompt(wolf_partners)


def build_public_info_prompt(ctx: PublicContext) -> str:
    """Build prompt section with public game information."""
    from collections import Counter
    lines = [f"\n--- PUBLIC INFORMATION (Day {ctx.day}) ---"]

    if ctx.all_agents:
        role_counts = Counter(a.role for a in ctx.all_agents)
        role_summary = ", ".join(f"{count} {role}" for role, count in sorted(role_counts.items()))
        lines.append(f"Role distribution: {role_summary}")

    lines += [
        f"Alive players: {', '.join(ctx.alive_players)}",
        f"Dead players: {', '.join(ctx.dead_players) if ctx.dead_players else 'none'}",
    ]

    if ctx.past_deaths:
        lines.append("\nPast deaths:")
        for d in ctx.past_deaths:
            cause = "executed" if d["cause"] == "execution" else "killed by werewolves"
            lines.append(f"  Day {d['day']}: {d['name']} was {cause}")

    if ctx.past_votes:
        lines.append("\nPast votes:")
        for v in ctx.past_votes:
            vote_str = ", ".join(f"{voter}→{target}" for voter, target in v["votes"].items())
            lines.append(f"  Day {v['day']}: {vote_str}")

    if ctx.all_agents:
        claims = [
            f"{a.name} claims {a.claimed_role}"
            for a in ctx.all_agents
            if a.claimed_role is not None
        ]
        if claims:
            lines.append(f"Known role claims: {', '.join(claims)}")

    if ctx.today_log:
        lines.append("\nToday's discussion so far:")
        for entry in ctx.today_log:
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
    ctx: PublicContext,
    direction: SpeechDirection,
    role_ctx: RoleSpecificContext | None = None,
) -> str:
    """Assemble full system prompt for an agent."""
    wolf_partners = role_ctx.wolf_partners if isinstance(role_ctx, WolfSpecificContext) else None
    parts = [
        build_persona_prompt(agent),
        "\n",
        build_role_prompt(agent.role, wolf_partners),
        build_public_info_prompt(ctx),
        build_personal_info_prompt(agent),
    ]
    if direction.reply_to_entry is not None:
        parts.append(
            f"\n--- YOUR TURN (CHALLENGE) ---\n"
            f"You decided to challenge speech [{direction.reply_to_entry.speech_id}] by {direction.reply_to_entry.agent}:\n"
            f'  "{direction.reply_to_entry.text}"\n'
            f"Respond directly to this statement in your speech."
        )
    if direction.intended_co:
        co_text = get_role(agent.role).co_prompt()
        if co_text:
            parts.append(co_text)
    parts.append(build_output_format_prompt(direction.lang))
    return "\n".join(parts)


def build_pre_night_prompt(
    agent: AgentState,
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[AgentState] | None = None,
) -> str:
    """Build prompt for pre-night decision phase (non-Villager roles only).

    Seer decides whether to reveal their role on Day 1.
    Werewolf decides whether to falsely claim to be the Seer.
    Madman decides whether to falsely claim to be a Villager-side role.
    All choices are encoded as "co" | "wait".
    """
    decision_desc = get_role(agent.role).pre_night_prompt()

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


def _build_co_strategy_hint(role: str) -> str:
    """Return a role-specific strategic hint for the discussion-phase CO decision."""
    return get_role(role).co_strategy_hint()


def build_judgment_prompt(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int,
    lang: str = "English",
    co_eligible: bool = False,
) -> str:
    """Build lightweight judgment prompt for the parallel decision phase.

    When co_eligible is True, a 4th option "co" is added with a role-specific
    strategic hint. Eligibility is decided by the engine (claimed_role is None
    and role != "Villager").
    """
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

    if co_eligible:
        co_hint = _build_co_strategy_hint(agent.role)
        lines.append(f"""
Decide your next action. Respond with ONLY valid JSON. No extra fields, no explanation, no other text.
{{
  "decision": "challenge" | "speak" | "silent" | "co",
  "reply_to": <speech_id to challenge, or null>
}}
- "challenge": directly counter a specific speech (set reply_to to its speech_id)
- "speak": add a new statement unprompted
- "silent": nothing to add right now
- "co": publicly declare your role (Coming-Out) in your next speech
{co_hint}
- The JSON must contain exactly these two fields and nothing else.
Use {lang} only for internal reasoning if needed, but keep the JSON minimal.""")
    else:
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
    """Build prompt for night action (attack, inspect, or guard)."""
    return get_role(agent.role).night_action_prompt(agent.name, alive_players, context)

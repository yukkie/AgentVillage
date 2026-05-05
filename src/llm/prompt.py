from collections import Counter
from dataclasses import dataclass, field
from typing import Literal, TypedDict

from src.domain.actor import Actor
from src.domain.roles import Role, Werewolf
from src.domain.schema import SpeechEntry


class PastVote(TypedDict):
    day: int
    votes: dict[str, str]


class PastDeath(TypedDict):
    day: int
    name: str
    cause: Literal["execution", "attack"]


@dataclass
class PublicContext:
    today_log: list[SpeechEntry]
    alive_players: list[str]
    dead_players: list[str]
    day: int
    all_agents: list[Actor] | None = None
    past_votes: list[PastVote] | None = None
    past_deaths: list[PastDeath] | None = None


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


def build_persona_prompt(actor: Actor) -> str:
    """Generate personality prompt from actor persona."""
    style = actor.persona.style
    lie = actor.persona.lie_tendency
    agg = actor.persona.aggression

    identity_parts = [actor.name]
    if actor.persona.age is not None:
        identity_parts.append(f"age {actor.persona.age}")
    if actor.persona.gender is not None:
        identity_parts.append(actor.persona.gender)
    identity = ", ".join(identity_parts)

    lines = [
        f"You are {identity}, a player in a social deduction game (Werewolf/Mafia).",
        f"Your personality style: {style}.",
    ]

    speech_prompt = _SPEECH_STYLE_PROMPTS.get(actor.persona.speech_style)
    if speech_prompt:
        lines.append(speech_prompt)
    elif actor.persona.speech_style != "casual":
        lines.append(f"Your speaking style: {actor.persona.speech_style}.")

    if lie > 0.5:
        lines.append("You are comfortable bending the truth when it serves your survival.")
    elif lie < 0.2:
        lines.append("You are very honest and rarely deceive others.")

    if agg > 0.5:
        lines.append("You tend to be assertive and confrontational when you suspect someone.")
    elif agg < 0.2:
        lines.append("You prefer gentle persuasion over direct confrontation.")

    return "\n".join(lines)


def build_role_prompt(role: Role, wolf_partners: list[str] | None = None) -> str:
    """Generate role-specific action guidelines.

    Delegates to the Role class (Strategy pattern). See src/domain/roles/.
    """
    if not isinstance(role, Werewolf):
        assert wolf_partners is None, (
            f"wolf_partners must be None for non-Werewolf roles, got role={role!r}"
        )
    return role.role_prompt(wolf_partners)


def build_public_info_prompt(ctx: PublicContext) -> str:
    """Build prompt section with public game information."""
    lines = [f"\n--- PUBLIC INFORMATION (Day {ctx.day}) ---"]

    if ctx.all_agents:
        role_counts = Counter(a.role.name for a in ctx.all_agents)
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
            f"{a.name} claims {a.state.claimed_role.name}"
            for a in ctx.all_agents
            if a.state.claimed_role is not None
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


def build_personal_info_prompt(actor: Actor) -> str:
    """Build prompt section with actor's personal beliefs and memory."""
    lines = ["\n--- YOUR PERSONAL INFORMATION ---"]

    if actor.state.intended_co is not None:
        lines.append(
            f"You planned to fake-CO as {actor.state.intended_co.name} today. "
            "Execute this plan in your speech unless something unexpected has happened."
        )

    if actor.state.memory_summary:
        lines.append("Your memory from previous days:")
        for mem in actor.state.memory_summary:
            lines.append(f"  - {mem}")

    if actor.state.beliefs:
        lines.append("\nYour current suspicion levels for other players (0.0=trusted, 1.0=certain werewolf):")
        lines.append("Use these scores to guide your vote — prioritize high-suspicion players.")
        for name, belief in actor.state.beliefs.items():
            lines.append(f"  {name}: suspicion={belief.suspicion:.2f}")
            if belief.reason:
                lines.append(f"    Reasons: {'; '.join(belief.reason)}")

    return "\n".join(lines)


def build_discussion_system_prompt(
    actor: Actor,
    ctx: PublicContext,
    co_eligible: bool = False,
    lang: str = "English",
    role_ctx: RoleSpecificContext | None = None,
) -> str:
    """Build system prompt for the DISCUSSION tool use call.

    The caller (client.py) passes the tool definitions separately via the
    Anthropic tools parameter. This prompt provides persona, game state,
    and instructions for choosing among the available tools.
    """
    wolf_partners = role_ctx.wolf_partners if isinstance(role_ctx, WolfSpecificContext) else None
    parts = [
        build_persona_prompt(actor),
        "\n",
        build_role_prompt(actor.role, wolf_partners),
        build_public_info_prompt(ctx),
        build_personal_info_prompt(actor),
    ]

    tool_instructions = [
        "\n--- YOUR TURN ---",
        "Choose exactly one of the following tools to take your action this turn:",
        '- speak: make a new statement (use when you have something to say)',
        '- challenge: directly counter a specific previous speech (use when you disagree with someone)',
        '- silent: pass this turn (use when you have nothing to add)',
    ]
    if co_eligible:
        co_hint = actor.role.co_strategy_hint()
        tool_instructions.append(f'- co: publicly declare a role (Coming-Out)\n  {co_hint}')
    tool_instructions.append(f'\nAll "thought" and "speech" fields must be written in {lang}.')
    parts.append("\n".join(tool_instructions))

    return "\n".join(parts)


def build_vote_prompt(
    actor: Actor,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int,
    past_votes: list[PastVote] | None = None,
    past_deaths: list[PastDeath] | None = None,
    wolf_partners: list[str] | None = None,
    lang: str = "English",
) -> str:
    """Build the dedicated VOTE-phase prompt.

    Independent from build_system_prompt: the vote decision needs the full
    day discussion + history + the speaker's own vote_candidates hint, not
    the full speech-context (persona color, CO direction, etc.).
    """
    candidates = [p for p in alive_players if p != actor.name]
    lines = [
        f"You are {actor.name} ({actor.role.name}) in a Werewolf game. Day {day}.",
        f"Alive players: {', '.join(alive_players)}",
        f"You must vote for one of: {', '.join(candidates)} (cannot vote for yourself).",
    ]

    if wolf_partners is not None:
        partners_str = ", ".join(wolf_partners) if wolf_partners else "none (you are the last wolf)"
        lines.append(f"Your wolf partner(s): {partners_str}.")

    if actor.state.memory_summary:
        lines.append(f"\nYour memory: {'; '.join(actor.state.memory_summary)}")

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

    if today_log:
        lines.append("\nToday's full discussion:")
        for entry in today_log:
            lines.append(f"  [{entry.speech_id}] {entry.agent}: {entry.text}")
    else:
        lines.append("\nNo discussion yet today.")

    if actor.state.beliefs:
        suspicion_str = ", ".join(
            f"{name}={b.suspicion:.2f}"
            for name, b in actor.state.beliefs.items()
            if name in alive_players
        )
        if suspicion_str:
            lines.append(
                f"\nYour suspicion scores (0.0=trusted, 1.0=certain werewolf): {suspicion_str}"
            )

    strategy_block = actor.role.vote_strategy_prompt()
    if strategy_block:
        lines.append(strategy_block)

    has_strategy = bool(strategy_block)
    strategy_field = '\n  "strategy": "village_side" | "wolf_side"' if has_strategy else '\n  "strategy": null'
    lines.append(f"""
--- OUTPUT FORMAT ---
Respond with ONLY valid JSON. No extra fields, no explanation, no other text.
{{
  "target": "<one player name from the candidates above>",
  "reasoning": "<one short paragraph: why this target>",{strategy_field}
}}
- "reasoning" must be written in {lang}
- "target" must be exactly one of: {', '.join(candidates)}""")
    if has_strategy:
        lines.append('- "strategy" must be exactly "village_side" or "wolf_side" (always English, see VOTE STRATEGY above)')
    else:
        lines.append('- "strategy" must be null (only Werewolves use this field)')
    return "\n".join(lines)


def build_wolf_chat_prompt(
    actor: Actor,
    wolf_partners: list[str],
    alive_players: list[str],
    wolf_chat_log: list[SpeechEntry],
    lang: str = "English",
) -> str:
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
- If you decide to fake-CO on the next day, set "timing" to "next_day" and set "claim_role" to the role name you will claim
- If you decide to wait, set "timing" to "wait" and "claim_role" to null
- The engine will use only "self_co_decision" to decide your next-day intended fake-CO
- The JSON must contain exactly these four fields and nothing else.
- Note: "attack_candidates" is the night-attack target field; the daytime speech schema uses a separate "vote_candidates" field.""")
    return "\n".join(lines)


def build_night_action_prompt(actor: Actor, alive_players: list[str], context: str) -> str:
    """Build prompt for night action (attack, inspect, or guard)."""
    return actor.role.night_action_prompt(actor.name, alive_players, context)

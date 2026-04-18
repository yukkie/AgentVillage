import json
import sys
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic

from src.domain.actor import Actor
from src.domain.roles import Villager
from src.domain.schema import AgentOutput, Intent, JudgmentOutput, PreNightOutput, SpeechEntry, WolfChatOutput
from src.llm.prompt import PublicContext, RoleSpecificContext, SpeechDirection, build_judgment_prompt, build_night_action_prompt, build_pre_night_prompt, build_system_prompt, build_wolf_chat_prompt

_client = anthropic.Anthropic()


def _default_output(actor: Actor) -> AgentOutput:
    """Fallback AgentOutput when LLM call or parse fails."""
    return AgentOutput(
        thought="...",
        speech="I need to think more carefully.",
        reasoning="I'm not sure who to suspect yet.",
        intent=Intent(vote_candidates=[], co=None),
        memory_update=[],
    )


def _log_error(fn: str, agent_name: str, stage: str, e: Exception, raw: str) -> None:
    print(f"[{fn}] {stage} error for {agent_name}: {e!r}", file=sys.stderr)
    if raw:
        print(f"[{fn}] raw response: {raw!r}", file=sys.stderr)


def _extract_json(text: str) -> str:
    """Extract the first complete JSON object from text.

    Handles markdown code fences, multiple JSON blocks, and self-correction
    patterns where the LLM emits extra text or a second JSON block.

    Strategy:
    1. Look for a ```json ... ``` or ``` ... ``` fence first — this avoids
       false matches on set-notation like {SQ, Jonas, Lumi} in prose.
    2. Fall back to bracket counting when no fence is present.
    """
    import re
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    # Fallback: bracket counting to find first complete { ... } span
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]  # truncated JSON fallback


def call(
    actor: Actor,
    ctx: PublicContext,
    direction: SpeechDirection,
    role_ctx: RoleSpecificContext | None = None,
) -> AgentOutput:
    """Call LLM for day-phase speech and return structured AgentOutput."""
    system_prompt = build_system_prompt(actor, ctx, direction, role_ctx)
    raw = ""
    try:
        message = _client.messages.create(
            model=actor.state.model,
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": "It's your turn. Provide your response in the required JSON format.",
                }
            ],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call", actor.name, "api", e, raw)
        return _default_output(actor)
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return AgentOutput.model_validate(data)
    except Exception as e:
        _log_error("call", actor.name, "parse", e, raw)
        return _default_output(actor)


def call_judgment(
    actor: Actor,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int = 1,
    lang: str = "English",
) -> JudgmentOutput:
    """Call LLM for the lightweight parallel judgment decision."""
    co_eligible = actor.state.claimed_role is None and not isinstance(actor.role, Villager)
    prompt = build_judgment_prompt(actor, today_log, alive_players, day, lang, co_eligible)
    raw = ""
    try:
        message = _client.messages.create(
            model=actor.state.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_judgment", actor.name, "api", e, raw)
        return JudgmentOutput(decision="silent")
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return JudgmentOutput.model_validate(data)
    except Exception as e:
        _log_error("call_judgment", actor.name, "parse", e, raw)
        return JudgmentOutput(decision="silent")



def call_speech_parallel(
    calls: list[tuple[Actor, PublicContext, SpeechDirection, RoleSpecificContext | None]]
) -> Iterator[tuple[Actor, AgentOutput]]:
    """Fire all speech calls in parallel; yield results in completion order."""
    with ThreadPoolExecutor() as executor:
        future_to_actor = {
            executor.submit(call, actor, ctx, direction, role_ctx): actor
            for actor, ctx, direction, role_ctx in calls
        }
        for future in as_completed(future_to_actor):
            yield future_to_actor[future], future.result()


def call_pre_night_action(
    actor: Actor,
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[Actor] | None = None,
) -> PreNightOutput:
    """Call LLM for pre-night CO decision and return structured PreNightOutput."""
    prompt = build_pre_night_prompt(actor, alive_players, lang, all_agents)
    raw = ""
    try:
        message = _client.messages.create(
            model=actor.state.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_pre_night_action", actor.name, "api", e, raw)
        return PreNightOutput(thought="...", decision="wait", reasoning="Defaulting to wait.")
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return PreNightOutput.model_validate(data)
    except Exception as e:
        _log_error("call_pre_night_action", actor.name, "parse", e, raw)
        return PreNightOutput(thought="...", decision="wait", reasoning="Defaulting to wait.")


def call_pre_night_parallel(
    agents: list[Actor],
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[Actor] | None = None,
) -> Iterator[tuple[Actor, PreNightOutput]]:
    """Call pre-night CO decision for all agents in parallel; yield results in completion order."""
    with ThreadPoolExecutor() as executor:
        future_to_agent = {
            executor.submit(call_pre_night_action, actor, alive_players, lang, all_agents): actor
            for actor in agents
        }
        for future in as_completed(future_to_agent):
            actor = future_to_agent[future]
            yield actor, future.result()


def call_discussion_parallel(
    actors: list[Actor],
    today_log_snapshot: list[SpeechEntry],
    alive_names: list[str],
    day: int,
    lang: str,
    build_speech_args: Callable[
        [Actor, SpeechEntry | None, bool, list[SpeechEntry]],
        tuple[PublicContext, SpeechDirection, RoleSpecificContext | None],
    ],
) -> Iterator[tuple[Actor, JudgmentOutput, AgentOutput | None, SpeechEntry | None, bool]]:
    """Run judgment→speech chain for all actors in parallel; yield results in completion order."""

    def _chain(actor: Actor) -> tuple[Actor, JudgmentOutput, AgentOutput | None, SpeechEntry | None, bool]:
        judgment = call_judgment(actor, today_log_snapshot, alive_names, day, lang)
        if judgment.decision == "silent":
            return actor, judgment, None, None, False
        is_co_eligible = actor.state.claimed_role is None and not isinstance(actor.role, Villager)
        force_co = judgment.decision == "co" and is_co_eligible
        reply_to_entry: SpeechEntry | None = None
        if judgment.decision == "challenge" and judgment.reply_to is not None:
            reply_to_entry = next(
                (e for e in today_log_snapshot if e.speech_id == judgment.reply_to),
                None,
            )
        ctx, direction, role_ctx = build_speech_args(actor, reply_to_entry, force_co, today_log_snapshot)
        output = call(actor, ctx, direction, role_ctx)
        return actor, judgment, output, reply_to_entry, force_co

    with ThreadPoolExecutor() as executor:
        futures = {executor.submit(_chain, actor): actor for actor in actors}
        for future in as_completed(futures):
            yield future.result()


def call_wolf_chat(
    actor: Actor,
    wolf_partners: list[str],
    alive_players: list[str],
    wolf_chat_log: list[SpeechEntry],
    lang: str = "English",
) -> WolfChatOutput:
    """Call LLM for werewolf team night chat and return structured WolfChatOutput."""
    prompt = build_wolf_chat_prompt(actor, wolf_partners, alive_players, wolf_chat_log, lang)
    raw = ""
    try:
        message = _client.messages.create(
            model=actor.state.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_wolf_chat", actor.name, "api", e, raw)
        return WolfChatOutput(thought="...", speech="...", vote_candidates=[])
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return WolfChatOutput.model_validate(data)
    except Exception as e:
        _log_error("call_wolf_chat", actor.name, "parse", e, raw)
        return WolfChatOutput(thought="...", speech="...", vote_candidates=[])


def call_night_action(
    actor: Actor,
    context: str,
    alive_players: list[str],
) -> str:
    """Call LLM for night action and return target player name."""
    prompt = build_night_action_prompt(actor, alive_players, context)
    if not prompt:
        return ""

    candidates = [p for p in alive_players if p != actor.name]
    raw = ""
    try:
        message = _client.messages.create(
            model=actor.state.model,
            max_tokens=64,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )
        raw = message.content[0].text.strip()
    except Exception as e:
        _log_error("call_night_action", actor.name, "api", e, raw)
        return candidates[0] if candidates else ""
    # Validate that the returned name is a valid alive player
    for candidate in candidates:
        if candidate.lower() == raw.lower():
            return candidate
    # If exact match fails, try partial match
    for candidate in candidates:
        if candidate.lower() in raw.lower():
            return candidate
    # Fallback: first candidate
    return candidates[0] if candidates else ""

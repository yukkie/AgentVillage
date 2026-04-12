import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Iterator

import anthropic

from src.agent.state import AgentState
from src.llm.prompt import PublicContext, SpeechDirection, RoleSpecificContext, build_system_prompt, build_judgment_prompt, build_night_action_prompt, build_pre_night_prompt, build_wolf_chat_prompt
from src.llm.schema import AgentOutput, Intent, JudgmentOutput, PreNightOutput, SpeechEntry, WolfChatOutput

_client = anthropic.Anthropic()


def _default_output(agent: AgentState) -> AgentOutput:
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
    agent: AgentState,
    ctx: PublicContext,
    direction: SpeechDirection,
    role_ctx: RoleSpecificContext | None = None,
) -> AgentOutput:
    """Call LLM for day-phase speech and return structured AgentOutput."""
    system_prompt = build_system_prompt(agent, ctx, direction, role_ctx)
    raw = ""
    try:
        message = _client.messages.create(
            model=agent.model,
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
        _log_error("call", agent.name, "api", e, raw)
        return _default_output(agent)
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return AgentOutput.model_validate(data)
    except Exception as e:
        _log_error("call", agent.name, "parse", e, raw)
        return _default_output(agent)


def call_judgment(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int = 1,
    lang: str = "English",
) -> JudgmentOutput:
    """Call LLM for the lightweight parallel judgment decision."""
    co_eligible = agent.claimed_role is None and agent.role != "Villager"
    prompt = build_judgment_prompt(agent, today_log, alive_players, day, lang, co_eligible)
    raw = ""
    try:
        message = _client.messages.create(
            model=agent.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_judgment", agent.name, "api", e, raw)
        return JudgmentOutput(decision="silent")
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return JudgmentOutput.model_validate(data)
    except Exception as e:
        _log_error("call_judgment", agent.name, "parse", e, raw)
        return JudgmentOutput(decision="silent")


def call_judgment_parallel(
    agents: list[AgentState],
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int = 1,
    lang: str = "English",
) -> Iterator[tuple[AgentState, JudgmentOutput]]:
    """Call judgment for all agents in parallel; yield results in completion order."""
    with ThreadPoolExecutor() as executor:
        future_to_agent = {
            executor.submit(call_judgment, agent, today_log, alive_players, day, lang): agent
            for agent in agents
        }
        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            yield agent, future.result()


def call_pre_night_action(
    agent: AgentState,
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[AgentState] | None = None,
) -> PreNightOutput:
    """Call LLM for pre-night CO decision and return structured PreNightOutput."""
    prompt = build_pre_night_prompt(agent, alive_players, lang, all_agents)
    raw = ""
    try:
        message = _client.messages.create(
            model=agent.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_pre_night_action", agent.name, "api", e, raw)
        return PreNightOutput(thought="...", decision="wait", reasoning="Defaulting to wait.")
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return PreNightOutput.model_validate(data)
    except Exception as e:
        _log_error("call_pre_night_action", agent.name, "parse", e, raw)
        return PreNightOutput(thought="...", decision="wait", reasoning="Defaulting to wait.")


def call_pre_night_parallel(
    agents: list[AgentState],
    alive_players: list[str],
    lang: str = "English",
    all_agents: list[AgentState] | None = None,
) -> Iterator[tuple[AgentState, PreNightOutput]]:
    """Call pre-night CO decision for all agents in parallel; yield results in completion order."""
    with ThreadPoolExecutor() as executor:
        future_to_agent = {
            executor.submit(call_pre_night_action, agent, alive_players, lang, all_agents): agent
            for agent in agents
        }
        for future in as_completed(future_to_agent):
            agent = future_to_agent[future]
            yield agent, future.result()


def call_wolf_chat(
    agent: AgentState,
    wolf_partners: list[str],
    alive_players: list[str],
    wolf_chat_log: list[SpeechEntry],
    lang: str = "English",
) -> WolfChatOutput:
    """Call LLM for werewolf team night chat and return structured WolfChatOutput."""
    prompt = build_wolf_chat_prompt(agent, wolf_partners, alive_players, wolf_chat_log, lang)
    raw = ""
    try:
        message = _client.messages.create(
            model=agent.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        _log_error("call_wolf_chat", agent.name, "api", e, raw)
        return WolfChatOutput(thought="...", speech="...", vote_candidates=[])
    try:
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return WolfChatOutput.model_validate(data)
    except Exception as e:
        _log_error("call_wolf_chat", agent.name, "parse", e, raw)
        return WolfChatOutput(thought="...", speech="...", vote_candidates=[])


def call_night_action(
    agent: AgentState,
    context: str,
    alive_players: list[str],
) -> str:
    """Call LLM for night action and return target player name."""
    prompt = build_night_action_prompt(agent, alive_players, context)
    if not prompt:
        return ""

    candidates = [p for p in alive_players if p != agent.name]
    raw = ""
    try:
        message = _client.messages.create(
            model=agent.model,
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
        _log_error("call_night_action", agent.name, "api", e, raw)
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

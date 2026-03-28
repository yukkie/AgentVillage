import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Iterator

import anthropic

from src.agent.state import AgentState
from src.llm.prompt import build_system_prompt, build_judgment_prompt, build_night_action_prompt
from src.llm.schema import AgentOutput, Intent, JudgmentOutput, SpeechEntry

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


def _extract_json(text: str) -> str:
    """Extract JSON object from text, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    # Try raw JSON
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return match.group(0)
    return text


def call(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    dead_players: list[str],
    day: int = 1,
    lang: str = "English",
    reply_to_entry: SpeechEntry | None = None,
    all_agents: list[AgentState] | None = None,
) -> AgentOutput:
    """Call LLM for day-phase speech and return structured AgentOutput."""
    system_prompt = build_system_prompt(agent, today_log, alive_players, dead_players, day, lang, reply_to_entry, all_agents)
    try:
        message = _client.messages.create(
            model=agent.model,
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": "It's your turn. Provide your response in the required JSON format.",
                }
            ],
        )
        raw = message.content[0].text
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return AgentOutput.model_validate(data)
    except Exception:
        return _default_output(agent)


def call_judgment(
    agent: AgentState,
    today_log: list[SpeechEntry],
    alive_players: list[str],
    day: int = 1,
    lang: str = "English",
) -> JudgmentOutput:
    """Call LLM for the lightweight parallel judgment decision."""
    prompt = build_judgment_prompt(agent, today_log, alive_players, day, lang)
    try:
        message = _client.messages.create(
            model=agent.model,
            max_tokens=64,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        json_str = _extract_json(raw)
        data = json.loads(json_str)
        return JudgmentOutput.model_validate(data)
    except Exception:
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


def call_night_action(
    agent: AgentState,
    context: str,
    alive_players: list[str],
    lang: str = "English",
) -> str:
    """Call LLM for night action and return target player name."""
    prompt = build_night_action_prompt(agent, alive_players, context, lang)
    if not prompt:
        return ""

    candidates = [p for p in alive_players if p != agent.name]
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
    except Exception:
        return candidates[0] if candidates else ""

import json
import re

import anthropic

from src.agent.state import AgentState
from src.llm.prompt import build_system_prompt, build_night_action_prompt
from src.llm.schema import AgentOutput, Intent

_client = anthropic.Anthropic()


def _default_output(agent: AgentState) -> AgentOutput:
    """Fallback AgentOutput when LLM call or parse fails."""
    return AgentOutput(
        thought="...",
        speech=f"I need to think more carefully.",
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
    today_log: list[str],
    alive_players: list[str],
    dead_players: list[str],
    day: int = 1,
) -> AgentOutput:
    """Call LLM for day-phase action and return structured AgentOutput."""
    system_prompt = build_system_prompt(agent, today_log, alive_players, dead_players, day)
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

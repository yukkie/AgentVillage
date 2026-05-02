"""Tool definitions and response parsing for DISCUSSION phase tool use calls."""

import sys

import anthropic

from src.domain.schema import (
    ChallengeResult,
    CoResult,
    DiscussionResult,
    SilentResult,
    SpeakResult,
)
from src.legacy.role_normalizer import normalize_role_field


def build_discussion_tools(co_eligible: bool) -> list[dict]:
    """Build the tool definitions list for a DISCUSSION call."""
    role_names_hint = "e.g. Seer, Villager, Knight, Werewolf"
    tools: list[dict] = [
        {
            "name": "speak",
            "description": "Make a new statement to the group.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "thought": {"type": "string", "description": "Your private reasoning (not shown to others)."},
                    "speech": {"type": "string", "description": "What you say aloud to the group."},
                    "memory_update": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Short notes to add to your memory for future days.",
                    },
                    "suspicion_scores": {
                        "type": "object",
                        "description": "Updated suspicion per player (0.0=trusted, 1.0=certain wolf). Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                    "threat_scores": {
                        "type": "object",
                        "description": "Updated threat level per player (0.0=safe, 1.0=must eliminate). Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                },
                "required": ["thought", "speech"],
            },
        },
        {
            "name": "challenge",
            "description": "Directly counter a specific previous speech.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "thought": {"type": "string", "description": "Your private reasoning."},
                    "speech": {"type": "string", "description": "What you say aloud in response."},
                    "reply_to": {"type": "integer", "description": "The speech_id of the entry you are challenging."},
                    "memory_update": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Short notes to add to your memory.",
                    },
                    "suspicion_scores": {
                        "type": "object",
                        "description": "Updated suspicion per player. Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                    "threat_scores": {
                        "type": "object",
                        "description": "Updated threat level per player. Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                },
                "required": ["thought", "speech", "reply_to"],
            },
        },
        {
            "name": "silent",
            "description": "Pass this turn — you have nothing to add right now.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "reasoning": {"type": "string", "description": "Why you are staying silent."},
                },
                "required": ["reasoning"],
            },
        },
    ]
    if co_eligible:
        tools.append({
            "name": "co",
            "description": "Publicly declare (Coming-Out) your role to the group.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "thought": {"type": "string", "description": "Your private reasoning."},
                    "speech": {"type": "string", "description": "What you say aloud when declaring your role."},
                    "claim_role": {"type": "string", "description": f"The role name you are claiming ({role_names_hint})."},
                    "memory_update": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Short notes to add to your memory.",
                    },
                    "suspicion_scores": {
                        "type": "object",
                        "description": "Updated suspicion per player. Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                    "threat_scores": {
                        "type": "object",
                        "description": "Updated threat level per player. Omit if unchanged.",
                        "additionalProperties": {"type": "number"},
                    },
                },
                "required": ["thought", "speech", "claim_role"],
            },
        })
    return tools


def parse_discussion_tool_result(message: anthropic.types.Message, agent_name: str) -> DiscussionResult:
    """Extract the tool use block from an LLM message and return a DiscussionResult."""
    for block in message.content:
        if block.type != "tool_use":
            continue
        inp = block.input
        name = block.name
        if name == "speak":
            return SpeakResult(
                thought=inp.get("thought", ""),
                speech=inp.get("speech", ""),
                memory_update=inp.get("memory_update", []),
                suspicion_scores=inp.get("suspicion_scores"),
                threat_scores=inp.get("threat_scores"),
            )
        if name == "challenge":
            return ChallengeResult(
                thought=inp.get("thought", ""),
                speech=inp.get("speech", ""),
                reply_to=int(inp.get("reply_to", 0)),
                memory_update=inp.get("memory_update", []),
                suspicion_scores=inp.get("suspicion_scores"),
                threat_scores=inp.get("threat_scores"),
            )
        if name == "co":
            raw_role = inp.get("claim_role")
            claim_role = normalize_role_field(raw_role)
            if claim_role is None:
                _log_warning(agent_name, f"co tool missing valid claim_role: {raw_role!r}; falling back to speak")
                return SpeakResult(
                    thought=inp.get("thought", ""),
                    speech=inp.get("speech", ""),
                    memory_update=inp.get("memory_update", []),
                    suspicion_scores=inp.get("suspicion_scores"),
                    threat_scores=inp.get("threat_scores"),
                )
            return CoResult(
                thought=inp.get("thought", ""),
                speech=inp.get("speech", ""),
                claim_role=claim_role,
                memory_update=inp.get("memory_update", []),
                suspicion_scores=inp.get("suspicion_scores"),
                threat_scores=inp.get("threat_scores"),
            )
        if name == "silent":
            return SilentResult(reasoning=inp.get("reasoning", ""))

    # No tool_use block found — fall back to silent
    _log_warning(agent_name, "no tool_use block in response; falling back to silent")
    return SilentResult(reasoning="no tool use block")


def _log_warning(agent_name: str, message: str) -> None:
    print(f"[discussion_tools] warning for {agent_name}: {message}", file=sys.stderr)

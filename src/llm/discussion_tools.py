"""Tool definitions and response parsing for DISCUSSION phase tool use calls."""

import re
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

_XML_TAG_RE = re.compile(r"<(\w[\w:-]*)[^>]*>.*?</\1>", re.DOTALL)


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
                    "speech": {"type": "string", "description": "What you say aloud to the group. Do not use XML tags."},
                    "thought": {"type": "string", "description": "Your private reasoning (not shown to others). Do not use XML tags."},
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
                "required": ["speech", "thought"],
            },
        },
        {
            "name": "challenge",
            "description": "Directly counter a specific previous speech.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "speech": {"type": "string", "description": "What you say aloud in response. Do not use XML tags."},
                    "thought": {"type": "string", "description": "Your private reasoning. Do not use XML tags."},
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
                "required": ["speech", "thought", "reply_to"],
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
                    "speech": {"type": "string", "description": "What you say aloud when declaring your role. Do not use XML tags."},
                    "claim_role": {"type": "string", "description": f"The role name you are claiming ({role_names_hint})."},
                    "thought": {"type": "string", "description": "Your private reasoning. Do not use XML tags."},
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
                "required": ["speech", "claim_role", "thought"],
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
            speech = inp.get("speech", "")
            thought = inp.get("thought", "")
            _warn_xml_tags(agent_name, name, speech, thought)
            if not speech:
                _log_warning(agent_name, "speak tool returned empty speech; falling back to silent")
                return SilentResult(reasoning="empty speech fallback")
            return SpeakResult(
                thought=thought,
                speech=speech,
                memory_update=inp.get("memory_update", []),
                suspicion_scores=inp.get("suspicion_scores"),
                threat_scores=inp.get("threat_scores"),
            )
        if name == "challenge":
            speech = inp.get("speech", "")
            thought = inp.get("thought", "")
            _warn_xml_tags(agent_name, name, speech, thought)
            if not speech:
                _log_warning(agent_name, "challenge tool returned empty speech; falling back to silent")
                return SilentResult(reasoning="empty speech fallback")
            return ChallengeResult(
                thought=thought,
                speech=speech,
                reply_to=int(inp.get("reply_to", 0)),
                memory_update=inp.get("memory_update", []),
                suspicion_scores=inp.get("suspicion_scores"),
                threat_scores=inp.get("threat_scores"),
            )
        if name == "co":
            speech = inp.get("speech", "")
            thought = inp.get("thought", "")
            _warn_xml_tags(agent_name, name, speech, thought)
            raw_role = inp.get("claim_role")
            claim_role = normalize_role_field(raw_role)
            if claim_role is None:
                _log_warning(agent_name, f"co tool missing valid claim_role: {raw_role!r}; falling back to speak")
                if not speech:
                    _log_warning(agent_name, "co fallback-to-speak also has empty speech; falling back to silent")
                    return SilentResult(reasoning="empty speech fallback")
                return SpeakResult(
                    thought=thought,
                    speech=speech,
                    memory_update=inp.get("memory_update", []),
                    suspicion_scores=inp.get("suspicion_scores"),
                    threat_scores=inp.get("threat_scores"),
                )
            if not speech:
                _log_warning(agent_name, "co tool returned empty speech; falling back to silent")
                return SilentResult(reasoning="empty speech fallback")
            return CoResult(
                thought=thought,
                speech=speech,
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


def _warn_xml_tags(agent_name: str, tool_name: str, speech: str, thought: str) -> None:
    for field_name, value in (("speech", speech), ("thought", thought)):
        for match in _XML_TAG_RE.finditer(value):
            _log_warning(agent_name, f"{tool_name}.{field_name} contains XML tag: {match.group()!r}")


def _log_warning(agent_name: str, message: str) -> None:
    print(f"[discussion_tools] warning for {agent_name}: {message}", file=sys.stderr)

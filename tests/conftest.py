import json
from unittest.mock import MagicMock

import anthropic
import pytest

from src.domain.actor import Actor, ActorProfile, ActorState, Persona, make_actor
from src.domain.event import LogEvent
from src.domain.schema import AgentOutput, Intent, JudgmentOutput, PreNightOutput
from src.engine.game import GameEngine
from src.llm.client import LLMClient
from src.logger.writer import LogWriter


def make_legacy_agent_json(name: str, role: str) -> dict:
    return {
        "name": name,
        "persona": Persona(style="calm").model_dump(mode="json"),
        "beliefs": {},
        "memory_summary": [],
        "is_alive": True,
        "role": role,
    }


def make_split_agent_json(name: str, role: str) -> dict:
    return {
        "profile": ActorProfile(name=name, persona=Persona(style="calm")).model_dump(mode="json"),
        "state": ActorState(
            beliefs={},
            memory_summary=[],
            is_alive=True,
        ).model_dump(mode="json"),
        "role": role,
    }


@pytest.fixture
def make_test_actor():
    def _make_test_actor(name: str, role: str = "Villager") -> Actor:
        profile = ActorProfile(
            name=name,
            persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        )
        state = ActorState(
            beliefs={},
            memory_summary=[],
            is_alive=True,
        )
        return make_actor(profile, state, role)

    return _make_test_actor


@pytest.fixture
def make_test_engine():
    def _make_test_engine(agents: list[Actor]) -> tuple[GameEngine, list[LogEvent]]:
        events: list[LogEvent] = []
        log_writer = MagicMock(spec=LogWriter)
        log_writer.write.side_effect = lambda e: events.append(e)
        llm_client = MagicMock(spec=LLMClient)
        engine = GameEngine(
            agents=agents,
            log_writer=log_writer,
            lang="English",
            llm_client=llm_client,
        )
        return engine, events

    return _make_test_engine


# ── Shared Mock Builders for LLM Client ──────────────────────────────────


def make_llm_client_with_response(response_text: str) -> LLMClient:
    """Build LLMClient mock that returns a specific response."""
    msg = MagicMock()
    msg.content = [MagicMock(text=response_text)]
    anthropic_client = MagicMock(spec=anthropic.Anthropic)
    anthropic_client.messages.create.return_value = msg
    return LLMClient(anthropic_client)


def make_failing_llm_client() -> LLMClient:
    """Build LLMClient mock that raises RuntimeError on API call."""
    anthropic_client = MagicMock(spec=anthropic.Anthropic)
    anthropic_client.messages.create.side_effect = RuntimeError("API error")
    return LLMClient(anthropic_client)


# ── Shared Mock Builders for GameEngine ──────────────────────────────────


def make_agent_output(name: str, speech: str = "Hello.") -> AgentOutput:
    """Build AgentOutput with standard defaults for test side_effect."""
    return AgentOutput(
        thought="thinking",
        speech=speech,
        reasoning="reasoning",
        intent=Intent(vote_candidates=[]),
        memory_update=[],
    )


def make_speech_parallel_side_effect():
    """Side effect for call_speech_parallel: each actor returns standard AgentOutput."""
    def _side_effect(calls):
        return iter([(a, make_agent_output(a.name)) for a, *_ in calls])
    return _side_effect


def make_silent_discussion_side_effect():
    """Side effect for call_discussion_parallel: all actors respond with silent judgment."""
    def _side_effect(actors, *_, **__):
        return iter([(a, JudgmentOutput(decision="silent"), None, None) for a in actors])
    return _side_effect


def make_pre_night_parallel_side_effect(decision: str, claim_role: str | None = None):
    """Side effect for call_pre_night_parallel: each actor returns PreNightOutput."""
    def _side_effect(targets, *_, **__):
        return iter([
            (actor, PreNightOutput(
                thought="thinking",
                decision=decision,
                claim_role=claim_role,
                reasoning="reason",
            )) for actor in targets
        ])
    return _side_effect


# ── Shared JSON Constants for Client Tests ──────────────────────────────


AGENT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Hello village.",
    "reasoning": "just a test",
    "intent": {"vote_candidates": []},
    "memory_update": [],
})

JUDGMENT_OUTPUT_JSON = json.dumps({"decision": "speak"})

JUDGMENT_CO_OUTPUT_JSON = json.dumps({
    "decision": "co",
    "reply_to": None,
    "claim_role": "Knight",
})

PRE_NIGHT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "decision": "wait",
    "claim_role": None,
    "reasoning": "not ready",
})

PRE_NIGHT_CO_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "decision": "co",
    "claim_role": "Medium",
    "reasoning": "fake medium",
})

WOLF_CHAT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Let's attack Alice.",
    "vote_candidates": [{"target": "Alice", "score": 0.9}],
})

NIGHT_ACTION_OUTPUT_JSON = json.dumps({
    "target": "Alice",
    "reasoning": "She is the most suspicious.",
})

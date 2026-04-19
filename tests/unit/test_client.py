"""Unit tests for src/llm/client.py — LLM client is injected as a mock."""
import json
from unittest.mock import MagicMock

from src.domain.actor import Actor, ActorState, Persona, make_actor
from src.domain.schema import AgentOutput, JudgmentOutput, PreNightOutput, WolfChatOutput
from src.llm.client import call, call_judgment, call_night_action, call_pre_night_action, call_wolf_chat


def _make_actor(name: str = "Alice", role: str = "Villager") -> Actor:
    state = ActorState(
        name=name,
        persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    )
    return make_actor(state, role)


def _make_mock_client(response_text: str) -> MagicMock:
    msg = MagicMock()
    msg.content = [MagicMock(text=response_text)]
    client = MagicMock()
    client.messages.create.return_value = msg
    return client


_AGENT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Hello village.",
    "reasoning": "just a test",
    "intent": {"vote_candidates": []},
    "memory_update": [],
})

_JUDGMENT_OUTPUT_JSON = json.dumps({"decision": "speak"})

_PRE_NIGHT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "decision": "wait",
    "reasoning": "not ready",
})

_WOLF_CHAT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Let's attack Alice.",
    "vote_candidates": [{"target": "Alice", "score": 0.9}],
})


class TestCall:
    def test_returns_agent_output(self):
        actor = _make_actor()
        client = _make_mock_client(_AGENT_OUTPUT_JSON)
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = call(actor, ctx, direction, client=client)
        assert isinstance(result, AgentOutput)
        assert result.speech == "Hello village."
        client.messages.create.assert_called_once()

    def test_returns_fallback_on_exception(self):
        actor = _make_actor()
        client = MagicMock()
        client.messages.create.side_effect = RuntimeError("API error")
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = call(actor, ctx, direction, client=client)
        assert isinstance(result, AgentOutput)
        assert result.speech == "I need to think more carefully."


class TestCallJudgment:
    def test_returns_judgment_output(self):
        actor = _make_actor()
        client = _make_mock_client(_JUDGMENT_OUTPUT_JSON)
        result = call_judgment(actor, [], ["Alice", "Bob"], day=1, client=client)
        assert isinstance(result, JudgmentOutput)
        assert result.decision == "speak"
        client.messages.create.assert_called_once()

    def test_returns_silent_on_exception(self):
        actor = _make_actor()
        client = MagicMock()
        client.messages.create.side_effect = RuntimeError("API error")
        result = call_judgment(actor, [], ["Alice", "Bob"], day=1, client=client)
        assert result.decision == "silent"


class TestCallPreNightAction:
    def test_returns_pre_night_output(self):
        actor = _make_actor("Gina", "Seer")
        client = _make_mock_client(_PRE_NIGHT_OUTPUT_JSON)
        result = call_pre_night_action(actor, ["Gina", "Bob"], client=client)
        assert isinstance(result, PreNightOutput)
        assert result.decision == "wait"
        client.messages.create.assert_called_once()

    def test_returns_wait_fallback_on_exception(self):
        actor = _make_actor("Gina", "Seer")
        client = MagicMock()
        client.messages.create.side_effect = RuntimeError("API error")
        result = call_pre_night_action(actor, ["Gina", "Bob"], client=client)
        assert result.decision == "wait"


class TestCallWolfChat:
    def test_returns_wolf_chat_output(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = _make_mock_client(_WOLF_CHAT_OUTPUT_JSON)
        result = call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [], client=client)
        assert isinstance(result, WolfChatOutput)
        assert result.speech == "Let's attack Alice."
        client.messages.create.assert_called_once()

    def test_returns_empty_fallback_on_exception(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = MagicMock()
        client.messages.create.side_effect = RuntimeError("API error")
        result = call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [], client=client)
        assert result.speech == "..."


class TestCallNightAction:
    def test_exact_match(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = _make_mock_client("Alice")
        result = call_night_action(actor, "night context", ["Alice", "Bob"], client=client)
        assert result == "Alice"

    def test_partial_match(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = _make_mock_client("I think Alice is the target")
        result = call_night_action(actor, "night context", ["Alice", "Bob"], client=client)
        assert result == "Alice"

    def test_fallback_to_first_candidate_on_no_match(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = _make_mock_client("Nobody")
        result = call_night_action(actor, "night context", ["Alice", "Bob"], client=client)
        assert result == "Alice"

    def test_fallback_to_first_candidate_on_exception(self):
        actor = _make_actor("Wolf", "Werewolf")
        client = MagicMock()
        client.messages.create.side_effect = RuntimeError("API error")
        result = call_night_action(actor, "night context", ["Alice", "Bob"], client=client)
        assert result == "Alice"

    def test_returns_empty_string_when_no_prompt(self):
        # Villager has no night action prompt → returns ""
        actor = _make_actor("Alice", "Villager")
        client = MagicMock()
        result = call_night_action(actor, "night context", ["Alice", "Bob"], client=client)
        assert result == ""
        client.messages.create.assert_not_called()

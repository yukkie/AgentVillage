"""Unit tests for src/llm/client.py — LLMClient with injected mock anthropic client."""
import json
from unittest.mock import MagicMock

import anthropic

from src.domain.schema import AgentOutput, JudgmentOutput, PreNightOutput, WolfChatOutput
from src.domain.roles import get_role
from src.llm.client import LLMClient, resolve_claim_role


def _make_llm_client(response_text: str) -> LLMClient:
    msg = MagicMock()
    msg.content = [MagicMock(text=response_text)]
    anthropic_client = MagicMock(spec=anthropic.Anthropic)
    anthropic_client.messages.create.return_value = msg
    return LLMClient(anthropic_client)


def _make_failing_llm_client() -> LLMClient:
    anthropic_client = MagicMock(spec=anthropic.Anthropic)
    anthropic_client.messages.create.side_effect = RuntimeError("API error")
    return LLMClient(anthropic_client)


_AGENT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Hello village.",
    "reasoning": "just a test",
    "intent": {"vote_candidates": []},
    "memory_update": [],
})

_JUDGMENT_OUTPUT_JSON = json.dumps({"decision": "speak"})

_JUDGMENT_CO_OUTPUT_JSON = json.dumps({"decision": "co", "reply_to": None, "claim_role": "Knight"})

_PRE_NIGHT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "decision": "wait",
    "claim_role": None,
    "reasoning": "not ready",
})

_PRE_NIGHT_CO_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "decision": "co",
    "claim_role": "Medium",
    "reasoning": "fake medium",
})

_WOLF_CHAT_OUTPUT_JSON = json.dumps({
    "thought": "thinking",
    "speech": "Let's attack Alice.",
    "vote_candidates": [{"target": "Alice", "score": 0.9}],
})


class TestCall:
    def test_returns_agent_output(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = _make_llm_client(_AGENT_OUTPUT_JSON)
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = llm.call(actor, ctx, direction)
        assert isinstance(result, AgentOutput)
        assert result.speech == "Hello village."

    def test_returns_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = _make_failing_llm_client()
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = llm.call(actor, ctx, direction)
        assert isinstance(result, AgentOutput)
        assert result.speech == "I need to think more carefully."


class TestCallJudgment:
    def test_returns_judgment_output(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = _make_llm_client(_JUDGMENT_OUTPUT_JSON)
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert isinstance(result, JudgmentOutput)
        assert result.decision == "speak"

    def test_returns_silent_on_exception(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = _make_failing_llm_client()
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert result.decision == "silent"

    def test_parses_claim_role_when_present(self, make_test_actor):
        actor = make_test_actor("Alice", "Werewolf")
        llm = _make_llm_client(_JUDGMENT_CO_OUTPUT_JSON)
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert result.decision == "co"
        assert result.claim_role.name == "Knight"


class TestCallPreNightAction:
    def test_returns_pre_night_output(self, make_test_actor):
        actor = make_test_actor("Gina", "Seer")
        llm = _make_llm_client(_PRE_NIGHT_OUTPUT_JSON)
        result = llm.call_pre_night_action(actor, ["Gina", "Bob"])
        assert isinstance(result, PreNightOutput)
        assert result.decision == "wait"

    def test_returns_wait_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Gina", "Seer")
        llm = _make_failing_llm_client()
        result = llm.call_pre_night_action(actor, ["Gina", "Bob"])
        assert result.decision == "wait"

    def test_parses_claim_role_when_present(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_llm_client(_PRE_NIGHT_CO_OUTPUT_JSON)
        result = llm.call_pre_night_action(actor, ["Wolf", "Bob"])
        assert result.decision == "co"
        assert result.claim_role.name == "Medium"


class TestCallWolfChat:
    def test_returns_wolf_chat_output(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_llm_client(_WOLF_CHAT_OUTPUT_JSON)
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert isinstance(result, WolfChatOutput)
        assert result.speech == "Let's attack Alice."

    def test_returns_empty_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_failing_llm_client()
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert result.speech == "..."


class TestCallNightAction:
    def test_exact_match(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_llm_client("Alice")
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result == "Alice"

    def test_partial_match(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_llm_client("I think Alice is the target")
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result == "Alice"

    def test_fallback_to_first_candidate_on_no_match(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_llm_client("Nobody")
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result == "Alice"

    def test_fallback_to_first_candidate_on_exception(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = _make_failing_llm_client()
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result == "Alice"

    def test_returns_empty_string_when_no_prompt(self, make_test_actor):
        actor = make_test_actor("Alice", "Villager")
        llm = _make_failing_llm_client()
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result == ""
        llm._client.messages.create.assert_not_called()


class TestResolveClaimRole:
    def test_logs_and_ignores_claim_for_non_co_role(self, make_test_actor, capsys):
        actor = make_test_actor("Alice", "Villager")

        result = resolve_claim_role(actor, get_role("Seer"))

        captured = capsys.readouterr()
        assert result is None
        assert "resolve_claim_role" in captured.err
        assert "unexpected claim_role=Seer" in captured.err

    def test_logs_when_falling_back_to_default_claim_role(self, make_test_actor, capsys):
        actor = make_test_actor("Wolf", "Werewolf")

        result = resolve_claim_role(actor, None)

        captured = capsys.readouterr()
        assert result is not None
        assert result.name == "Seer"
        assert "resolve_claim_role" in captured.err
        assert "falling back to default_claim_role=Seer" in captured.err

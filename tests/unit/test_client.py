"""Unit tests for src/llm/client.py — LLMClient with injected mock anthropic client."""
import json

import anthropic
import pydantic
import pytest

from src.domain.schema import AgentOutput, JudgmentOutput, NightActionOutput, PreNightOutput, WolfChatOutput
from src.domain.roles import get_role
from src.llm.client import _classify_error, resolve_claim_role
from tests.conftest import (
    AGENT_OUTPUT_JSON,
    JUDGMENT_CO_OUTPUT_JSON,
    JUDGMENT_OUTPUT_JSON,
    NIGHT_ACTION_OUTPUT_JSON,
    PRE_NIGHT_CO_OUTPUT_JSON,
    PRE_NIGHT_OUTPUT_JSON,
    WOLF_CHAT_OUTPUT_JSON,
    make_failing_llm_client,
    make_llm_client_with_response,
)


class TestCall:
    def test_returns_agent_output(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = make_llm_client_with_response(AGENT_OUTPUT_JSON)
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = llm.call(actor, ctx, direction)
        assert isinstance(result, AgentOutput)
        assert result.speech == "Hello village."

    def test_returns_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = make_failing_llm_client()
        from src.llm.prompt import PublicContext, SpeechDirection
        ctx = PublicContext(alive_players=["Alice"], dead_players=[], day=1, today_log=[])
        direction = SpeechDirection()
        result = llm.call(actor, ctx, direction)
        assert isinstance(result, AgentOutput)
        assert result.speech == "I need to think more carefully."


class TestCallJudgment:
    def test_returns_judgment_output(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = make_llm_client_with_response(JUDGMENT_OUTPUT_JSON)
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert isinstance(result, JudgmentOutput)
        assert result.decision == "speak"

    def test_returns_silent_on_exception(self, make_test_actor):
        actor = make_test_actor("Alice")
        llm = make_failing_llm_client()
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert result.decision == "silent"

    def test_parses_claim_role_when_present(self, make_test_actor):
        actor = make_test_actor("Alice", "Werewolf")
        llm = make_llm_client_with_response(JUDGMENT_CO_OUTPUT_JSON)
        result = llm.call_judgment(actor, [], ["Alice", "Bob"], day=1)
        assert result.decision == "co"
        assert result.claim_role.name == "Knight"


class TestCallPreNightAction:
    def test_returns_pre_night_output(self, make_test_actor):
        actor = make_test_actor("Gina", "Seer")
        llm = make_llm_client_with_response(PRE_NIGHT_OUTPUT_JSON)
        result = llm.call_pre_night_action(actor, ["Gina", "Bob"])
        assert isinstance(result, PreNightOutput)
        assert result.decision == "wait"

    def test_returns_wait_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Gina", "Seer")
        llm = make_failing_llm_client()
        result = llm.call_pre_night_action(actor, ["Gina", "Bob"])
        assert result.decision == "wait"

    def test_parses_claim_role_when_present(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(PRE_NIGHT_CO_OUTPUT_JSON)
        result = llm.call_pre_night_action(actor, ["Wolf", "Bob"])
        assert result.decision == "co"
        assert result.claim_role.name == "Medium"


class TestCallWolfChat:
    def test_returns_wolf_chat_output(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(WOLF_CHAT_OUTPUT_JSON)
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert isinstance(result, WolfChatOutput)
        assert result.speech == "Let's attack Alice."

    def test_returns_empty_fallback_on_exception(self, make_test_actor):
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_failing_llm_client()
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert result.speech == "..."


class TestCallNightAction:
    def test_exact_match(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — returns JSON with target matching a candidate exactly
        Level: unit
        Objective: exact name match resolves to correct NightActionOutput.target
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(NIGHT_ACTION_OUTPUT_JSON)
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert isinstance(result, NightActionOutput)
        assert result.target == "Alice"

    def test_reasoning_is_extracted(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — returns JSON with reasoning field
        Level: unit
        Objective: reasoning field is preserved in NightActionOutput
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(NIGHT_ACTION_OUTPUT_JSON)
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result.reasoning == "She is the most suspicious."

    def test_partial_match(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — returns JSON with target embedded in longer string
        Level: unit
        Objective: partial name match still resolves to correct target
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(
            json.dumps({"target": "I think Alice", "reasoning": "suspicious"})
        )
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result.target == "Alice"

    def test_fallback_to_first_candidate_on_no_match(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — returns JSON with unrecognized target
        Level: unit
        Objective: falls back to first candidate when target cannot be matched
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(
            json.dumps({"target": "Nobody", "reasoning": ""})
        )
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result.target == "Alice"

    def test_fallback_to_first_candidate_on_exception(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — raises RuntimeError
        Level: unit
        Objective: returns empty reasoning and first candidate on API failure
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_failing_llm_client()
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result.target == "Alice"
        assert result.reasoning == ""

    def test_returns_empty_when_no_prompt(self, make_test_actor):
        """
        SUT: LLMClient.call_night_action
        Mock: anthropic SDK — not called (Villager has no night_action_prompt)
        Level: unit
        Objective: returns NightActionOutput with empty target when no prompt is generated
        """
        actor = make_test_actor("Alice", "Villager")
        llm = make_failing_llm_client()
        result = llm.call_night_action(actor, "night context", ["Alice", "Bob"])
        assert result.target == ""
        assert result.reasoning == ""
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


@pytest.mark.unit
class TestClassifyError:
    def test_classifies_anthropic_api_error(self):
        """
        SUT: _classify_error()
        Mock: なし
        Level: unit
        Objective: anthropic.APIError のサブクラスが "api" に分類されること。
        """
        import httpx
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        response = httpx.Response(429, request=request)
        e = anthropic.RateLimitError(message="rate limit", response=response, body={})
        assert _classify_error(e) == "api"

    def test_classifies_pydantic_validation_error(self):
        """
        SUT: _classify_error()
        Mock: なし
        Level: unit
        Objective: pydantic.ValidationError が "validation" に分類されること。
        """
        try:
            pydantic.TypeAdapter(int).validate_python("not-an-int")
        except pydantic.ValidationError as e:
            assert _classify_error(e) == "validation"
        else:
            pytest.fail("Expected ValidationError")

    def test_classifies_json_decode_error(self):
        """
        SUT: _classify_error()
        Mock: なし
        Level: unit
        Objective: json.JSONDecodeError が "extraction" に分類されること。
        """
        try:
            json.loads("{invalid}")
        except json.JSONDecodeError as e:
            assert _classify_error(e) == "extraction"
        else:
            pytest.fail("Expected JSONDecodeError")

    def test_classifies_unexpected_error(self):
        """
        SUT: _classify_error()
        Mock: なし
        Level: unit
        Objective: 上記以外の例外が "unexpected" に分類されること。
        """
        assert _classify_error(RuntimeError("boom")) == "unexpected"
        assert _classify_error(ValueError("bad")) == "unexpected"
        assert _classify_error(KeyError("missing")) == "unexpected"


@pytest.mark.unit
class TestClassifyAndLogError:
    def test_api_error_logged_with_api_kind(self, capsys):
        """
        SUT: _classify_and_log_error()
        Mock: なし
        Level: unit
        Objective: anthropic.APIError 系の例外が "api error" としてログ出力されること。
        """
        import httpx
        from src.llm.client import _classify_and_log_error
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        response = httpx.Response(429, request=request)
        e = anthropic.RateLimitError(message="rate limit", response=response, body={})
        _classify_and_log_error("call", "Alice", e, "")
        captured = capsys.readouterr()
        assert "api error" in captured.err

    def test_validation_error_logged_with_validation_kind(self, capsys):
        """
        SUT: _classify_and_log_error()
        Mock: なし
        Level: unit
        Objective: pydantic.ValidationError が "validation error" としてログ出力されること。
        """
        from src.llm.client import _classify_and_log_error
        try:
            pydantic.TypeAdapter(int).validate_python("bad")
        except pydantic.ValidationError as e:
            _classify_and_log_error("call", "Alice", e, '{"bad": true}')
            captured = capsys.readouterr()
            assert "validation error" in captured.err

    def test_unexpected_error_logged_with_unexpected_kind(self, capsys):
        """
        SUT: _classify_and_log_error()
        Mock: なし
        Level: unit
        Objective: 未分類例外が "unexpected error" としてログ出力されること。
        """
        from src.llm.client import _classify_and_log_error
        _classify_and_log_error("call", "Alice", RuntimeError("boom"), "")
        captured = capsys.readouterr()
        assert "unexpected error" in captured.err

    def test_raw_response_logged_when_present(self, capsys):
        """
        SUT: _classify_and_log_error()
        Mock: なし
        Level: unit
        Objective: raw が空でない場合にレスポンス内容もログ出力されること。
        """
        from src.llm.client import _classify_and_log_error
        _classify_and_log_error("call", "Alice", RuntimeError("boom"), "some raw text")
        captured = capsys.readouterr()
        assert "some raw text" in captured.err

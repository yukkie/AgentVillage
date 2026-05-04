"""Unit tests for src/llm/client.py — LLMClient with injected mock anthropic client."""
import json

import anthropic
import pydantic
import pytest

from unittest.mock import MagicMock

from src.domain.schema import ChallengeResult, CoResult, NightActionOutput, SilentResult, SpeakResult, VoteOutput, WolfChatOutput
from src.domain.roles import get_role
from src.llm.client import LLMClient, _classify_error, resolve_claim_role
from tests.conftest import (
    NIGHT_ACTION_OUTPUT_JSON,
    VOTE_OUTPUT_JSON,
    VOTE_OUTPUT_WOLF_JSON,
    WOLF_CHAT_OUTPUT_JSON,
    make_failing_llm_client,
    make_llm_client_with_response,
)


def _make_tool_use_message(tool_name: str, tool_input: dict):
    """Build a MagicMock simulating anthropic.types.Message with a tool_use block."""
    block = MagicMock()
    block.type = "tool_use"
    block.name = tool_name
    block.input = tool_input
    msg = MagicMock()
    msg.content = [block]
    return msg


def _make_discussion_llm_client(tool_name: str, tool_input: dict) -> LLMClient:
    """Build LLMClient whose messages.create returns a tool use response."""
    import anthropic
    anthropic_client = MagicMock(spec=anthropic.Anthropic)
    anthropic_client.messages.create.return_value = _make_tool_use_message(tool_name, tool_input)
    return LLMClient(anthropic_client)


class TestCallDiscussion:
    def test_returns_speak_result(self, make_test_actor):
        """
        SUT: LLMClient.call_discussion
        Mock: anthropic SDK — returns tool_use block for "speak"
        Level: unit
        Objective: speak ツール選択時に SpeakResult が返ること。
        """
        actor = make_test_actor("Alice")
        llm = _make_discussion_llm_client("speak", {"thought": "thinking", "speech": "Hello!"})
        from src.llm.prompt import PublicContext
        ctx = PublicContext(alive_players=["Alice", "Bob"], dead_players=[], day=1, today_log=[])
        result = llm.call_discussion(actor, ctx)
        assert isinstance(result, SpeakResult)
        assert result.speech == "Hello!"
        assert result.thought == "thinking"

    def test_returns_challenge_result(self, make_test_actor):
        """
        SUT: LLMClient.call_discussion
        Mock: anthropic SDK — returns tool_use block for "challenge"
        Level: unit
        Objective: challenge ツール選択時に ChallengeResult が返り reply_to が保持されること。
        """
        actor = make_test_actor("Alice")
        llm = _make_discussion_llm_client("challenge", {"thought": "t", "speech": "I disagree!", "reply_to": 3})
        from src.llm.prompt import PublicContext
        ctx = PublicContext(alive_players=["Alice", "Bob"], dead_players=[], day=1, today_log=[])
        result = llm.call_discussion(actor, ctx)
        assert isinstance(result, ChallengeResult)
        assert result.reply_to == 3
        assert result.speech == "I disagree!"

    def test_returns_co_result(self, make_test_actor):
        """
        SUT: LLMClient.call_discussion
        Mock: anthropic SDK — returns tool_use block for "co"
        Level: unit
        Objective: co ツール選択時に CoResult が返り claim_role が Role インスタンスに変換されること。
        """
        actor = make_test_actor("Alice", "Seer")
        llm = _make_discussion_llm_client("co", {"thought": "t", "speech": "I am Seer!", "claim_role": "Seer"})
        from src.llm.prompt import PublicContext
        ctx = PublicContext(alive_players=["Alice", "Bob"], dead_players=[], day=1, today_log=[])
        result = llm.call_discussion(actor, ctx)
        assert isinstance(result, CoResult)
        assert result.claim_role.name == "Seer"

    def test_returns_silent_result(self, make_test_actor):
        """
        SUT: LLMClient.call_discussion
        Mock: anthropic SDK — returns tool_use block for "silent"
        Level: unit
        Objective: silent ツール選択時に SilentResult が返ること。
        """
        actor = make_test_actor("Alice")
        llm = _make_discussion_llm_client("silent", {"reasoning": "nothing to add"})
        from src.llm.prompt import PublicContext
        ctx = PublicContext(alive_players=["Alice", "Bob"], dead_players=[], day=1, today_log=[])
        result = llm.call_discussion(actor, ctx)
        assert isinstance(result, SilentResult)
        assert result.reasoning == "nothing to add"

    def test_returns_silent_fallback_on_exception(self, make_test_actor):
        """
        SUT: LLMClient.call_discussion
        Mock: anthropic SDK raises RuntimeError
        Level: unit
        Objective: API 失敗時に SilentResult フォールバックが返ること。
        """
        actor = make_test_actor("Alice")
        llm = make_failing_llm_client()
        from src.llm.prompt import PublicContext
        ctx = PublicContext(alive_players=["Alice", "Bob"], dead_players=[], day=1, today_log=[])
        result = llm.call_discussion(actor, ctx)
        assert isinstance(result, SilentResult)


class TestCallWolfChat:
    def test_returns_wolf_chat_output(self, make_test_actor):
        """
        SUT: LLMClient.call_wolf_chat
        Mock: anthropic SDK
        Level: unit
        Objective: 狼チャット応答の speech / attack_candidates / self_co_decision が WolfChatOutput としてパースされること。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(WOLF_CHAT_OUTPUT_JSON)
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert isinstance(result, WolfChatOutput)
        assert result.speech == "Let's attack Alice."
        assert result.self_co_decision.claim_role is not None
        assert result.self_co_decision.claim_role.name == "Seer"
        assert result.self_co_decision.timing == "next_day"

    def test_returns_empty_fallback_on_exception(self, make_test_actor):
        """
        SUT: LLMClient.call_wolf_chat
        Mock: anthropic SDK raises RuntimeError
        Level: unit
        Objective: API失敗時に空の attack_candidates と wait の self_co_decision を持つフォールバックが返ること。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_failing_llm_client()
        result = llm.call_wolf_chat(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], [])
        assert result.speech == "..."
        assert result.self_co_decision.timing == "wait"
        assert result.self_co_decision.claim_role is None


class TestCallVote:
    def test_returns_vote_output(self, make_test_actor):
        """
        SUT: LLMClient.call_vote
        Mock: anthropic SDK
        Level: unit
        Objective: VOTE プロンプトの応答が VoteOutput としてパースされること。
        """
        actor = make_test_actor("Alice", "Villager")
        llm = make_llm_client_with_response(VOTE_OUTPUT_JSON)
        result = llm.call_vote(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob"],
            day=1,
        )
        assert isinstance(result, VoteOutput)
        assert result.target == "Alice"
        assert result.reasoning == "Her speech contradicts the seer claim."
        assert result.strategy is None

    def test_returns_wolf_strategy_field(self, make_test_actor):
        """
        SUT: LLMClient.call_vote
        Mock: anthropic SDK
        Level: unit
        Objective: 狼が strategy フィールド付きで返したとき VoteOutput.strategy として保持されること。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        llm = make_llm_client_with_response(VOTE_OUTPUT_WOLF_JSON)
        result = llm.call_vote(
            actor,
            today_log=[],
            alive_players=["Wolf", "Seer1"],
            day=1,
            wolf_partners=[],
        )
        assert result.strategy == "wolf_side"
        assert result.target == "Seer1"

    def test_returns_empty_fallback_on_exception(self, make_test_actor):
        """
        SUT: LLMClient.call_vote
        Mock: anthropic SDK raises RuntimeError
        Level: unit
        Objective: API 失敗時に target="" の VoteOutput が返ること（_run_vote 側でフォールバック処理）。
        """
        actor = make_test_actor("Alice", "Villager")
        llm = make_failing_llm_client()
        result = llm.call_vote(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob"],
            day=1,
        )
        assert result.target == ""
        assert result.strategy is None


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

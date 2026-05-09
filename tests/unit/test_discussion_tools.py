"""Unit tests for src/llm/discussion_tools.py — parse_discussion_tool_result."""

from unittest.mock import MagicMock

from src.domain.schema import ChallengeResult, CoResult, SilentResult, SpeakResult
from src.llm.discussion_tools import _parse_score_dict, parse_discussion_tool_result


def _make_message(tool_name: str, tool_input: dict):
    """Build a MagicMock simulating anthropic.types.Message with a single tool_use block."""
    block = MagicMock()
    block.type = "tool_use"
    block.name = tool_name
    block.input = tool_input
    msg = MagicMock()
    msg.content = [block]
    return msg


class TestParseSpeakEmptySpeech:
    def test_speak_with_empty_speech_returns_silent(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool and empty speech
        Level: unit
        Objective: speak ツールで speech="" のとき SilentResult を返すこと（空発言行表示を防ぐ）。
        """
        msg = _make_message("speak", {"speech": "", "thought": "I have nothing to say"})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)

    def test_speak_with_nonempty_speech_returns_speak_result(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool and non-empty speech
        Level: unit
        Objective: speak ツールで speech が入っているとき SpeakResult を返すこと。
        """
        msg = _make_message("speak", {"speech": "Hello everyone.", "thought": "Let me speak"})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SpeakResult)
        assert result.speech == "Hello everyone."

    def test_challenge_with_empty_speech_returns_silent(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with challenge tool and empty speech
        Level: unit
        Objective: challenge ツールで speech="" のとき SilentResult を返すこと。
        """
        msg = _make_message("challenge", {"speech": "", "thought": "...", "reply_to": 3})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)

    def test_challenge_with_nonempty_speech_returns_challenge_result(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with challenge tool and non-empty speech
        Level: unit
        Objective: challenge ツールで speech が入っているとき ChallengeResult を返すこと。
        """
        msg = _make_message("challenge", {"speech": "I disagree.", "thought": "...", "reply_to": 3})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, ChallengeResult)
        assert result.speech == "I disagree."
        assert result.reply_to == 3


class TestParseSilentTool:
    def test_silent_tool_returns_silent_result(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with silent tool
        Level: unit
        Objective: silent ツール選択時に SilentResult を返すこと。
        """
        msg = _make_message("silent", {"reasoning": "I have nothing to add."})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)

    def test_no_tool_use_block_returns_silent(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with no tool_use block
        Level: unit
        Objective: tool_use ブロックが存在しない場合に SilentResult にフォールバックすること。
        """
        block = MagicMock()
        block.type = "text"
        msg = MagicMock()
        msg.content = [block]
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)

    def test_non_tool_use_block_is_skipped(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with text block followed by tool_use block
        Level: unit
        Objective: tool_use でないブロックをスキップし、後続の tool_use ブロックを処理すること。
        """
        text_block = MagicMock()
        text_block.type = "text"
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.name = "silent"
        tool_block.input = {"reasoning": "skipping"}
        msg = MagicMock()
        msg.content = [text_block, tool_block]
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)


class TestParseCoTool:
    def test_co_with_valid_role_and_speech_returns_co_result(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with co tool, valid role, non-empty speech
        Level: unit
        Objective: co ツールで valid role と speech が揃っているとき CoResult を返すこと。
        """
        msg = _make_message("co", {"speech": "I am the Seer!", "claim_role": "Seer", "thought": "..."})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, CoResult)
        assert result.speech == "I am the Seer!"

    def test_co_with_empty_speech_returns_silent(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with co tool, valid role, empty speech
        Level: unit
        Objective: co ツールで speech="" のとき SilentResult を返すこと。
        """
        msg = _make_message("co", {"speech": "", "claim_role": "Seer", "thought": "..."})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)

    def test_co_with_invalid_role_and_speech_falls_back_to_speak(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with co tool, invalid role, non-empty speech
        Level: unit
        Objective: co ツールで claim_role が無効のとき SpeakResult にフォールバックすること。
        """
        msg = _make_message("co", {"speech": "I claim something.", "claim_role": "InvalidRole", "thought": "..."})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SpeakResult)
        assert result.speech == "I claim something."

    def test_co_with_invalid_role_and_empty_speech_returns_silent(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with co tool, invalid role, empty speech
        Level: unit
        Objective: co ツールで claim_role が無効かつ speech="" のとき SilentResult を返すこと。
        """
        msg = _make_message("co", {"speech": "", "claim_role": "InvalidRole", "thought": "..."})
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SilentResult)


class TestEmptySpeechRawResponseLogging:
    def test_speak_empty_speech_logs_raw_response(self, capsys):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool and empty speech
        Level: unit
        Objective: speak ツールで empty-speech fallback 時、raw_response が stderr に出力されること。
        """
        msg = _make_message("speak", {"speech": "", "thought": "..."})
        parse_discussion_tool_result(msg, "TestAgent", raw_response='{"raw": "llm_output"}')
        captured = capsys.readouterr()
        assert '{"raw": "llm_output"}' in captured.err

    def test_challenge_empty_speech_logs_raw_response(self, capsys):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with challenge tool and empty speech
        Level: unit
        Objective: challenge ツールで empty-speech fallback 時、raw_response が stderr に出力されること。
        """
        msg = _make_message("challenge", {"speech": "", "thought": "...", "reply_to": 1})
        parse_discussion_tool_result(msg, "TestAgent", raw_response="raw challenge response")
        captured = capsys.readouterr()
        assert "raw challenge response" in captured.err

    def test_co_empty_speech_logs_raw_response(self, capsys):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with co tool, valid role, empty speech
        Level: unit
        Objective: co ツールで empty-speech fallback 時、raw_response が stderr に出力されること。
        """
        msg = _make_message("co", {"speech": "", "claim_role": "Seer", "thought": "..."})
        parse_discussion_tool_result(msg, "TestAgent", raw_response="raw co response")
        captured = capsys.readouterr()
        assert "raw co response" in captured.err

    def test_nonempty_speech_does_not_log_raw_response(self, capsys):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool and non-empty speech
        Level: unit
        Objective: speech が空でない場合、raw_response がログに出力されないこと。
        """
        msg = _make_message("speak", {"speech": "Hello!", "thought": "..."})
        parse_discussion_tool_result(msg, "TestAgent", raw_response="should_not_appear")
        captured = capsys.readouterr()
        assert "should_not_appear" not in captured.err

    def test_empty_raw_response_not_logged(self, capsys):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool and empty speech, no raw
        Level: unit
        Objective: raw_response が空文字のとき raw response ログ行が出力されないこと。
        """
        msg = _make_message("speak", {"speech": "", "thought": "..."})
        parse_discussion_tool_result(msg, "TestAgent", raw_response="")
        captured = capsys.readouterr()
        assert "raw LLM response" not in captured.err


class TestParseXmlTagWarning:
    def test_xml_tag_in_speech_logs_warning(self, capsys):
        """
        SUT: parse_discussion_tool_result (via _warn_xml_tags)
        Mock: anthropic.types.Message (MagicMock) with XML tag embedded in speech
        Level: unit
        Objective: speech フィールドに XML タグが含まれるとき警告が stderr に出力されること。
        """
        msg = _make_message(
            "speak",
            {
                "speech": "<thinking>some thought</thinking>",
                "thought": "normal thought",
            },
        )
        parse_discussion_tool_result(msg, "TestAgent")
        captured = capsys.readouterr()
        assert "XML tag" in captured.err
        assert "<thinking>some thought</thinking>" in captured.err

    def test_parameter_tag_in_thought_logs_warning(self, capsys):
        """
        SUT: parse_discussion_tool_result (via _warn_xml_tags)
        Mock: anthropic.types.Message (MagicMock) with <parameter> tag in thought
        Level: unit
        Objective: thought フィールドに <parameter> タグが含まれるとき警告が stderr に出力されること。
        """
        msg = _make_message(
            "speak",
            {
                "speech": "Hello!",
                "thought": 'my reasoning <parameter name="speech">actual speech</parameter>',
            },
        )
        parse_discussion_tool_result(msg, "TestAgent")
        captured = capsys.readouterr()
        assert "XML tag" in captured.err

    def test_no_xml_tags_produces_no_warning(self, capsys):
        """
        SUT: parse_discussion_tool_result (via _warn_xml_tags)
        Mock: anthropic.types.Message (MagicMock) with clean fields
        Level: unit
        Objective: XML タグが含まれない正常なレスポンスでは警告が出ないこと。
        """
        msg = _make_message("speak", {"speech": "I think it's Alice.", "thought": "My reasoning."})
        parse_discussion_tool_result(msg, "TestAgent")
        captured = capsys.readouterr()
        assert "XML tag" not in captured.err


class TestParseScoreDict:
    def test_valid_dict_returns_float_values(self):
        """
        SUT: _parse_score_dict
        Mock: なし
        Level: unit
        Objective: 正常な dict[str, float] がそのまま返ること。
        """
        assert _parse_score_dict({"Alice": 0.8, "Bob": 0.3}) == {"Alice": 0.8, "Bob": 0.3}

    def test_string_value_returns_none(self):
        """
        SUT: _parse_score_dict
        Mock: なし
        Level: unit
        Objective: LLM が str を返した場合に None になること（AttributeError クラッシュを防ぐ）。
        """
        assert _parse_score_dict("Alice: 0.8") is None

    def test_none_returns_none(self):
        """
        SUT: _parse_score_dict
        Mock: なし
        Level: unit
        Objective: None 入力が None を返すこと。
        """
        assert _parse_score_dict(None) is None

    def test_list_returns_none(self):
        """
        SUT: _parse_score_dict
        Mock: なし
        Level: unit
        Objective: list 入力が None を返すこと。
        """
        assert _parse_score_dict(["Alice", 0.8]) is None

    def test_non_string_keys_are_filtered(self):
        """
        SUT: _parse_score_dict
        Mock: なし
        Level: unit
        Objective: キーが str でないエントリは除外されること。
        """
        assert _parse_score_dict({1: 0.5, "Bob": 0.3}) == {"Bob": 0.3}


class TestSuspicionScoresDictValidation:
    def test_speak_with_string_suspicion_scores_returns_speak_result_without_scores(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool; suspicion_scores is a string
        Level: unit
        Objective: LLM が suspicion_scores を str で返したとき AttributeError を起こさず
                   suspicion_scores=None の SpeakResult を返すこと。
        """
        msg = _make_message("speak", {
            "speech": "I suspect Alice.",
            "thought": "...",
            "suspicion_scores": "Alice: 0.8",
        })
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SpeakResult)
        assert result.suspicion_scores is None

    def test_challenge_with_string_suspicion_scores_returns_challenge_result_without_scores(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with challenge tool; suspicion_scores is a string
        Level: unit
        Objective: challenge ツールで suspicion_scores が str のとき suspicion_scores=None の
                   ChallengeResult を返すこと。
        """
        msg = _make_message("challenge", {
            "speech": "That doesn't add up.",
            "thought": "...",
            "reply_to": 2,
            "suspicion_scores": "high",
        })
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, ChallengeResult)
        assert result.suspicion_scores is None

    def test_speak_with_valid_dict_suspicion_scores_preserved(self):
        """
        SUT: parse_discussion_tool_result
        Mock: anthropic.types.Message (MagicMock) with speak tool; suspicion_scores is a valid dict
        Level: unit
        Objective: suspicion_scores が正常な dict のときそのまま SpeakResult に保持されること。
        """
        msg = _make_message("speak", {
            "speech": "I suspect Alice.",
            "thought": "...",
            "suspicion_scores": {"Alice": 0.8, "Bob": 0.2},
        })
        result = parse_discussion_tool_result(msg, "TestAgent")
        assert isinstance(result, SpeakResult)
        assert result.suspicion_scores == {"Alice": 0.8, "Bob": 0.2}

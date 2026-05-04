"""Unit tests for src/llm/discussion_tools.py — parse_discussion_tool_result."""

from unittest.mock import MagicMock

from src.domain.schema import ChallengeResult, CoResult, SilentResult, SpeakResult
from src.llm.discussion_tools import parse_discussion_tool_result


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

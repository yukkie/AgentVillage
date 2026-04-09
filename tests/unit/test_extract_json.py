"""Tests for _extract_json helper in llm/client.py."""
from src.llm.client import _extract_json


class TestExtractJson:
    def test_plain_json(self):
        assert _extract_json('{"decision": "speak"}') == '{"decision": "speak"}'

    def test_json_in_markdown_fence(self):
        text = '```json\n{"decision": "challenge", "reply_to": 5}\n```'
        assert _extract_json(text) == '{"decision": "challenge", "reply_to": 5}'

    def test_json_in_plain_fence(self):
        text = '```\n{"decision": "silent"}\n```'
        assert _extract_json(text) == '{"decision": "silent"}'

    def test_prose_with_set_notation_then_fenced_json(self):
        """Regression: prose containing {Name, Name} must not be mistaken for JSON."""
        text = (
            "The wolves are among {SQ, Jonas, Lumi}.\n\n"
            "```json\n"
            '{"decision": "challenge", "reply_to": 5}\n'
            "```"
        )
        result = _extract_json(text)
        assert result == '{"decision": "challenge", "reply_to": 5}'

    def test_prose_with_braces_fallback_to_bracket_counting(self):
        """When no fence present, bracket counting still works for simple cases."""
        text = 'Some text {"decision": "speak", "reply_to": null} more text'
        assert _extract_json(text) == '{"decision": "speak", "reply_to": null}'

    def test_no_json_returns_text(self):
        assert _extract_json("no braces here") == "no braces here"

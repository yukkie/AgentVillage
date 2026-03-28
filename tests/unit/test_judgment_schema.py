import pytest
from pydantic import ValidationError

from src.llm.schema import JudgmentOutput, SpeechEntry


class TestSpeechEntry:
    def test_valid(self):
        e = SpeechEntry(speech_id=1, agent="Setsu", text="I suspect SQ.")
        assert e.speech_id == 1
        assert e.agent == "Setsu"

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            SpeechEntry(speech_id=1, agent="Setsu")


class TestJudgmentOutput:
    def test_challenge_with_reply_to(self):
        j = JudgmentOutput(decision="challenge", reply_to=3)
        assert j.decision == "challenge"
        assert j.reply_to == 3

    def test_speak_no_reply_to(self):
        j = JudgmentOutput(decision="speak")
        assert j.decision == "speak"
        assert j.reply_to is None

    def test_silent(self):
        j = JudgmentOutput(decision="silent")
        assert j.decision == "silent"

    def test_invalid_decision_raises(self):
        with pytest.raises(ValidationError):
            JudgmentOutput(decision="attack")

    def test_parse_from_dict(self):
        j = JudgmentOutput.model_validate({"decision": "challenge", "reply_to": 2})
        assert j.decision == "challenge"
        assert j.reply_to == 2

import pytest
from pydantic import ValidationError

from src.domain.schema import JudgmentOutput, SpeechEntry


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

    def test_co_decision(self):
        j = JudgmentOutput(decision="co", claim_role="Medium")
        assert j.decision == "co"
        assert j.reply_to is None
        assert j.claim_role.name == "Medium"

    def test_invalid_decision_raises(self):
        with pytest.raises(ValidationError):
            JudgmentOutput(decision="attack")

    def test_parse_from_dict(self):
        j = JudgmentOutput.model_validate({"decision": "challenge", "reply_to": 2, "claim_role": None})
        assert j.decision == "challenge"
        assert j.reply_to == 2

    def test_claim_role_defaults_to_none(self):
        j = JudgmentOutput(decision="speak")
        assert j.claim_role is None

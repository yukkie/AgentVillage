import pytest
from pydantic import ValidationError

from src.domain.schema import (
    ChallengeResult,
    CoResult,
    DiscussionResult,
    SilentResult,
    SpeakResult,
    SpeechEntry,
)
from src.domain.roles import get_role


class TestSpeechEntry:
    def test_valid(self):
        e = SpeechEntry(speech_id=1, agent="Setsu", text="I suspect SQ.")
        assert e.speech_id == 1
        assert e.agent == "Setsu"

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            SpeechEntry(speech_id=1, agent="Setsu")


class TestSpeakResult:
    def test_minimal_fields(self):
        """
        SUT: SpeakResult
        Mock: なし
        Level: unit
        Objective: thought と speech だけで生成でき、オプション項目はデフォルト値になること。
        """
        r = SpeakResult(thought="t", speech="Hello!")
        assert r.thought == "t"
        assert r.speech == "Hello!"
        assert r.co is None
        assert r.memory_update == []
        assert r.suspicion_scores is None
        assert r.threat_scores is None

    def test_with_scores(self):
        """
        SUT: SpeakResult
        Mock: なし
        Level: unit
        Objective: suspicion_scores / threat_scores が正しく保持されること。
        """
        r = SpeakResult(
            thought="t",
            speech="s",
            suspicion_scores={"Bob": 0.7},
            threat_scores={"Bob": 0.5},
        )
        assert r.suspicion_scores == {"Bob": 0.7}
        assert r.threat_scores == {"Bob": 0.5}


class TestChallengeResult:
    def test_reply_to_required(self):
        """
        SUT: ChallengeResult
        Mock: なし
        Level: unit
        Objective: reply_to が必須フィールドとして保持されること。
        """
        r = ChallengeResult(thought="t", speech="I disagree!", reply_to=3)
        assert r.reply_to == 3
        assert r.speech == "I disagree!"

    def test_defaults(self):
        """
        SUT: ChallengeResult
        Mock: なし
        Level: unit
        Objective: memory_update / suspicion_scores / threat_scores のデフォルトが正しいこと。
        """
        r = ChallengeResult(thought="t", speech="s", reply_to=1)
        assert r.memory_update == []
        assert r.suspicion_scores is None
        assert r.threat_scores is None


class TestCoResult:
    def test_claim_role_preserved(self):
        """
        SUT: CoResult
        Mock: なし
        Level: unit
        Objective: claim_role に Role インスタンスを渡して保持できること。
        """
        seer = get_role("Seer")
        r = CoResult(thought="t", speech="I am Seer!", claim_role=seer)
        assert r.claim_role.name == "Seer"

    def test_defaults(self):
        """
        SUT: CoResult
        Mock: なし
        Level: unit
        Objective: memory_update / suspicion_scores / threat_scores のデフォルトが正しいこと。
        """
        r = CoResult(thought="t", speech="s", claim_role=get_role("Seer"))
        assert r.memory_update == []
        assert r.suspicion_scores is None


class TestSilentResult:
    def test_reasoning_preserved(self):
        """
        SUT: SilentResult
        Mock: なし
        Level: unit
        Objective: reasoning フィールドが保持されること。
        """
        r = SilentResult(reasoning="nothing to add")
        assert r.reasoning == "nothing to add"


class TestDiscussionResultUnion:
    def test_speak_is_discussion_result(self):
        """
        SUT: DiscussionResult type alias
        Mock: なし
        Level: unit
        Objective: SpeakResult が DiscussionResult の isinstance チェックを通ること。
        """
        r: DiscussionResult = SpeakResult(thought="t", speech="s")
        assert isinstance(r, SpeakResult)
        assert not isinstance(r, SilentResult)

    def test_silent_guard_pattern(self):
        """
        SUT: DiscussionResult type alias
        Mock: なし
        Level: unit
        Objective: isinstance(result, SilentResult) で SilentResult だけ選別できること。
        """
        results: list[DiscussionResult] = [
            SpeakResult(thought="t", speech="s"),
            SilentResult(reasoning="quiet"),
            ChallengeResult(thought="t", speech="s", reply_to=1),
        ]
        silent = [r for r in results if isinstance(r, SilentResult)]
        speaking = [r for r in results if not isinstance(r, SilentResult)]
        assert len(silent) == 1
        assert len(speaking) == 2

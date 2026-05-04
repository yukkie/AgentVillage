"""Unit tests for GameEngine helpers that remain local to a single method."""
import pytest
from unittest.mock import patch

from src.engine.phase import Phase
from src.domain.schema import SilentResult, SpeakResult
from src.domain.event import EventType


class TestDiscussionCoDecision:
    """Tests for the "co" tool use in discussion phase."""

    def test_speak_result_does_not_set_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: call_discussion_parallel returns SpeakResult (no co)
        Level: unit
        Objective: SpeakResult では claimed_role が変わらないこと。
        """
        seer = make_test_actor("Seer1", "Seer")
        engine, _ = make_test_engine([seer])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, SpeakResult(thought="t", speech="Just speaking.")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert seer.state.claimed_role is None

    def test_silent_result_emits_silent_speech_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SilentResult
        Mock: call_discussion_parallel returns SilentResult
        Level: unit
        Objective: SilentResult のとき is_public な SPEECH イベントが「silently watching」内容で emit されること。
        """
        villager = make_test_actor("V1", "Villager")
        engine, events = make_test_engine([villager])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        silent_events = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.is_public and "silently" in e.content
        ]
        assert len(silent_events) >= 1


class TestApplyThreatScores:
    def test_apply_discussion_result_threat_scores_updates_state_and_emits_event(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: store.save をパッチ
        Level: unit
        Objective: SpeakResult.threat_scores が非 None のとき actor.state.threat_scores が
                   更新され THREAT_UPDATE イベントが emit されること。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        result = SpeakResult(
            thought="thinking",
            speech="Hello.",
            threat_scores={"Alice": 0.85},
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(wolf, result, Phase.DAY_DISCUSSION)

        assert wolf.state.threat_scores["Alice"] == pytest.approx(0.85)
        threat_events = [e for e in events if e.event_type == EventType.THREAT_UPDATE]
        assert len(threat_events) == 1
        assert "Alice=0.85" in threat_events[0].content
        assert threat_events[0].is_public is False

    def test_apply_discussion_result_no_threat_scores_emits_no_threat_event(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: store.save をパッチ
        Level: unit
        Objective: SpeakResult.threat_scores が None のとき THREAT_UPDATE イベントが
                   emit されないこと。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        result = SpeakResult(
            thought="thinking",
            speech="Hello.",
            threat_scores=None,
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(wolf, result, Phase.DAY_DISCUSSION)

        assert not any(e.event_type == EventType.THREAT_UPDATE for e in events)


class TestApplyDiscussionResult:
    """Tests for GameEngine._apply_discussion_result."""

    def test_suspicion_scores_update_state_and_emit_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.suspicion_scores が非 None のとき beliefs が更新され
                   SUSPICION_UPDATE イベントが emit されること。
        """
        actor = make_test_actor("Alice")
        target = make_test_actor("Bob")
        engine, events = make_test_engine([actor, target])

        result = SpeakResult(
            thought="thinking",
            speech="I suspect Bob.",
            suspicion_scores={"Bob": 0.8},
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        assert actor.state.beliefs["Bob"].suspicion == pytest.approx(0.8)
        suspicion_events = [e for e in events if e.event_type == EventType.SUSPICION_UPDATE]
        assert len(suspicion_events) == 1
        assert "Bob=0.80" in suspicion_events[0].content
        assert suspicion_events[0].is_public is False

    def test_threat_scores_update_state_and_emit_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.threat_scores が非 None のとき threat_scores が更新され
                   THREAT_UPDATE イベントが emit されること。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        result = SpeakResult(
            thought="thinking",
            speech="Hello.",
            threat_scores={"Alice": 0.9},
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(wolf, result, Phase.DAY_DISCUSSION)

        assert wolf.state.threat_scores["Alice"] == pytest.approx(0.9)
        threat_events = [e for e in events if e.event_type == EventType.THREAT_UPDATE]
        assert len(threat_events) == 1
        assert "Alice=0.90" in threat_events[0].content
        assert threat_events[0].is_public is False

    def test_memory_update_is_applied(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.memory_update が非空のとき actor.state.memory_summary に追記されること。
        """
        actor = make_test_actor("Alice")
        engine, _ = make_test_engine([actor])

        result = SpeakResult(
            thought="t",
            speech="s",
            memory_update=["Bob acted suspiciously on Day1"],
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        assert any("Bob acted suspiciously" in m for m in actor.state.memory_summary)

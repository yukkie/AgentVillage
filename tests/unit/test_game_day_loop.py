"""Unit tests for GameEngine helpers that remain local to a single method."""
import pytest
from unittest.mock import patch

from src.engine.phase import Phase
from src.domain.schema import CoResult, SilentResult, SpeakResult
from src.domain.event import EventType
from src.engine.phase_day import _resolve_post_vote


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
        other = make_test_actor("V1")
        engine, _ = make_test_engine([seer, other])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, SpeakResult(thought="t", speech="Just speaking.")),
            (other, SilentResult(reasoning="nothing")),
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
        other = make_test_actor("V2")
        engine, events = make_test_engine([villager, other])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, SilentResult(reasoning="nothing")),
            (other, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        silent_events = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.is_public and "silently" in e.content
        ]
        assert len(silent_events) >= 1

    def test_post_co_speech_keeps_claimed_role_without_co_decision(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_discussion_result
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: CO 後の通常発言は claimed_role を保持するが decision="co" は再emitしないこと。
        """
        from src.domain.roles import get_role

        seer = make_test_actor("Seer1", "Seer")
        other = make_test_actor("V1")
        engine, events = make_test_engine([seer, other])

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(
                seer,
                CoResult(
                    thought="I should claim.",
                    speech="I am the seer.",
                    claim_role=get_role("Seer"),
                ),
                Phase.DAY_DISCUSSION,
            )
            engine._apply_discussion_result(
                seer,
                SpeakResult(
                    thought="Share result.",
                    speech="My result is white.",
                ),
                Phase.DAY_DISCUSSION,
            )

        speech_events = [e for e in events if e.event_type == EventType.SPEECH]

        assert speech_events[0].claimed_role == get_role("Seer")
        assert speech_events[0].decision == "co"
        assert speech_events[1].claimed_role == get_role("Seer")
        assert speech_events[1].decision == ""

    def test_vote_crashes_when_no_other_alive_player(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote in phase_day.py (others empty branch)
        Mock: call_discussion_parallel (SilentResult); call_vote_parallel はデフォルト mock
              (target="" を返す → alive_names にマッチせず else 分岐 → others が空 → IndexError)
        Level: unit
        Objective: 他に生存者がいない不正ゲーム状態で投票を実行すると IndexError が発生すること。
                   正常フローでは勝敗判定が先に通るためこの状態には到達しない。
                   ガードを置かず即クラッシュさせる設計を確認する death test。
        """
        loner = make_test_actor("Alice")
        engine, _ = make_test_engine([loner])

        engine._llm_client.call_discussion_parallel.side_effect = (
            lambda actors, *_, **__: iter([(loner, SilentResult(reasoning="nothing"))])
        )

        with patch("src.agent.store.save"), pytest.raises(IndexError):
            engine._run_day()


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


class TestGameOver:
    def test_emits_game_over_event_with_winner(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._game_over()
        Mock: なし（make_test_engine の LLMClient mock）
        Level: unit
        Objective: _game_over() を直接呼び出したとき GAME_OVER イベントが winner 文字列を含む
                   content で is_public=True として emit されること。
        """
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([villager])

        engine._game_over("Werewolves")

        game_over_events = [e for e in events if e.event_type == EventType.GAME_OVER]
        assert len(game_over_events) == 1
        assert "Werewolves" in game_over_events[0].content
        assert game_over_events[0].is_public is True


class TestResolvePostVote:
    def test_medium_receives_memory_update_and_medium_result_event(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: _resolve_post_vote (phase_day.py)
        Mock: src.agent.memory.update_memory をパッチ; src.agent.store.save をパッチ
        Level: unit
        Objective: Medium 生存時に _resolve_post_vote を呼ぶと update_memory が呼ばれ、
                   MEDIUM_RESULT イベントが非公開で emit されること。
        """
        medium = make_test_actor("Medium1", "Medium")
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, events = make_test_engine([medium, wolf])

        with patch("src.agent.memory.update_memory") as mock_update_memory, \
                patch("src.agent.store.save"):
            _resolve_post_vote(engine, wolf.name)

        mock_update_memory.assert_called_once_with(
            medium,
            ["Day 1: Wolf1 was executed, they were Werewolf"],
        )
        medium_events = [e for e in events if e.event_type == EventType.MEDIUM_RESULT]
        assert len(medium_events) == 1
        assert medium_events[0].agent == medium.name
        assert medium_events[0].target == wolf.name
        assert medium_events[0].is_public is False

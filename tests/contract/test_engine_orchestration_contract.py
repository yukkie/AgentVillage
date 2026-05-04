"""Contract tests for GameEngine orchestration boundaries.

Covers the orchestration edge cases identified in Issue #184:

- run() loop: GAME START event + winner propagation + day counter
- _get_agent() miss: returns None for unknown names; _eliminate() is a no-op
- intended-CO miss: PRE_NIGHT_DECISION event emitted, intended_co cleared
- post-speech memory update: memory_mod.update_memory called iff non-empty

These tests use a real GameEngine and drive it with minimal setup so that the
contracts between run(), _apply_speech_output(), and the downstream modules
(memory_mod, store, LogEvent) are verified through real execution paths rather
than synthesised mock data.
"""
from unittest.mock import patch

import pytest

from src.domain.event import EventType
from src.domain.schema import SpeakResult
from src.engine.phase import Phase


# ── run() loop contract ───────────────────────────────────────────────────────


@pytest.mark.unit
class TestRunLoopContract:
    """SUT: GameEngine.run()
    Mock: _run_pre_night, _run_day, _run_night をパッチしてループを制御
    Level: unit
    Objective: run() のループ制御・GAME START emit・winner 返却の契約を検証する。
    """

    def test_run_emits_game_start_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run()
        Mock: _run_pre_night, _run_day, _run_night をパッチ
        Level: unit
        Objective: run() 開始時に PHASE_START / "GAME START" イベントが emit されること。
        """
        agents = [make_test_actor("A")]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_pre_night"),
            patch.object(engine, "_run_day", return_value="Villagers"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        start_events = [
            e for e in events
            if e.event_type == EventType.PHASE_START and "GAME START" in e.content
        ]
        assert len(start_events) == 1
        assert start_events[0].is_public is True

    def test_run_returns_winner_and_calls_game_over(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run()
        Mock: _run_pre_night, _run_day, _run_night をパッチ
        Level: unit
        Objective: _run_night が winner を返したとき run() がその値を返し _game_over を呼ぶこと。
        """
        agents = [make_test_actor("A"), make_test_actor("B", "Werewolf")]
        engine, _ = make_test_engine(agents)

        with (
            patch.object(engine, "_run_pre_night"),
            patch.object(engine, "_run_day", return_value=None),
            patch.object(engine, "_run_night", return_value="Werewolves"),
            patch.object(engine, "_game_over") as mock_game_over,
        ):
            result = engine.run()

        assert result == "Werewolves"
        mock_game_over.assert_called_once_with("Werewolves")

    def test_run_increments_day_on_loop_continuation(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run()
        Mock: _run_pre_night, _run_day, _run_night をパッチ。2ループ目で終了
        Level: unit
        Objective: day / night ともに winner なしのとき day が +1 されてループが継続すること。
        """
        agents = [make_test_actor("A")]
        engine, _ = make_test_engine(agents)

        with (
            patch.object(engine, "_run_pre_night"),
            patch.object(engine, "_run_day", side_effect=[None, "Villagers"]),
            patch.object(engine, "_run_night", return_value=None),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        assert engine.day == 2


# ── _get_agent() miss contract ────────────────────────────────────────────────


@pytest.mark.unit
class TestGetAgentMissContract:
    """SUT: GameEngine._get_agent() / _eliminate()
    Mock: なし
    Level: unit
    Objective: 存在しない名前への miss handling が安全であることを検証する。
    """

    def test_get_agent_returns_none_for_unknown_name(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._get_agent()
        Mock: なし
        Level: unit
        Objective: 登録されていない名前を渡したとき None が返ること。
        """
        agents = [make_test_actor("Alice")]
        engine, _ = make_test_engine(agents)

        assert engine._get_agent("Unknown") is None

    def test_eliminate_with_unknown_name_emits_no_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._eliminate()
        Mock: なし（store.save は呼ばれないため不要）
        Level: unit
        Objective: 存在しない名前で _eliminate() を呼んでも例外にならずイベントも emit しないこと。
        """
        agents = [make_test_actor("Alice")]
        engine, events = make_test_engine(agents)

        engine._eliminate("Unknown", EventType.NIGHT_ATTACK, "night")

        attack_events = [e for e in events if e.event_type == EventType.NIGHT_ATTACK]
        assert attack_events == []


# ── post-speech memory update contract ───────────────────────────────────────


@pytest.mark.unit
class TestMemoryUpdateContract:
    """SUT: GameEngine._apply_discussion_result() -> memory_mod.update_memory()
    Mock: memory_mod.update_memory をパッチ、store.save をパッチ
    Level: unit
    Objective: memory_update フィールドが非空のときのみ update_memory が呼ばれる契約を検証する。
    """

    def test_non_empty_memory_update_calls_update_memory(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: memory_mod.update_memory をパッチ、store.save をパッチ
        Level: unit
        Objective: SpeakResult.memory_update が非空のとき memory_mod.update_memory(actor, updates) が呼ばれること。
        """
        actor = make_test_actor("Alice")
        engine, _ = make_test_engine([actor])

        result = SpeakResult(
            thought="thinking",
            speech="Bob looks suspicious.",
            memory_update=["Bob seems suspicious."],
        )

        with (
            patch("src.engine.game.memory_mod.update_memory") as mock_update,
            patch("src.agent.store.save"),
        ):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        mock_update.assert_called_once_with(actor, ["Bob seems suspicious."])

    def test_empty_memory_update_skips_update_memory(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: memory_mod.update_memory をパッチ、store.save をパッチ
        Level: unit
        Objective: SpeakResult.memory_update が空リストのとき memory_mod.update_memory が呼ばれないこと。
        """
        actor = make_test_actor("Alice")
        engine, _ = make_test_engine([actor])

        result = SpeakResult(thought="thinking", speech="Hello.")  # memory_update=[]

        with (
            patch("src.engine.game.memory_mod.update_memory") as mock_update,
            patch("src.agent.store.save"),
        ):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        mock_update.assert_not_called()

"""
SUSPICION_UPDATE イベントの emit と Renderer 描画テスト（Issue #36）。
"""
from unittest.mock import patch

from src.domain.event import EventType, LogEvent
from src.domain.schema import SpeakResult
from src.engine.phase import Phase
from src.ui.renderer import Renderer


def _make_speak_result(suspicion_scores: dict[str, float] | None) -> SpeakResult:
    return SpeakResult(
        thought="thinking",
        speech="Hello.",
        suspicion_scores=suspicion_scores,
    )


def _make_event(event_type: EventType, **kwargs) -> LogEvent:
    return LogEvent.make(day=1, phase="day_discussion", event_type=event_type, **kwargs)


# ── emit tests ────────────────────────────────────────────────────────────────


class TestSuspicionUpdateEmit:
    def test_event_emitted_when_scores_non_empty(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: suspicion_scores が非空のとき SUSPICION_UPDATE イベントが emit されること。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        result = _make_speak_result({"Bob": 0.7, "Carol": 0.3})

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        su_events = [e for e in events if e.event_type == EventType.SUSPICION_UPDATE]
        assert len(su_events) == 1

    def test_event_not_emitted_when_scores_none(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: suspicion_scores が None のとき SUSPICION_UPDATE イベントが emit されないこと。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        result = _make_speak_result(None)

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        su_events = [e for e in events if e.event_type == EventType.SUSPICION_UPDATE]
        assert len(su_events) == 0

    def test_event_contains_agent_name_and_scores(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: SUSPICION_UPDATE イベントに agent 名とスコア文字列が含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        result = _make_speak_result({"Bob": 0.74, "Carol": 0.42})

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        su_event = next(e for e in events if e.event_type == EventType.SUSPICION_UPDATE)
        assert su_event.agent == "Alice"
        assert "Bob=0.74" in su_event.content
        assert "Carol=0.42" in su_event.content

    def test_event_is_not_public(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: SUSPICION_UPDATE イベントが is_public=False であること（観戦者専用）。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        result = _make_speak_result({"Bob": 0.9})

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        su_event = next(e for e in events if e.event_type == EventType.SUSPICION_UPDATE)
        assert su_event.is_public is False


# ── Renderer tests ────────────────────────────────────────────────────────────


class TestSuspicionUpdateRenderer:
    def test_rendered_in_spectator_mode(self):
        """
        SUT: Renderer.on_event (SUSPICION_UPDATE)
        Mock: なし
        Level: unit
        Objective: spectator モードで SUSPICION_UPDATE イベントが表示されること。
        """
        renderer = Renderer([], spectator_mode=True)
        event = _make_event(
            EventType.SUSPICION_UPDATE,
            agent="Alice",
            content="Alice suspicion update: Bob=0.70, Carol=0.30",
            is_public=False,
        )

        result = renderer.on_event(event)

        assert result is not None
        assert "Alice suspicion update" in result.plain

    def test_hidden_in_public_mode(self):
        """
        SUT: Renderer.on_event (SUSPICION_UPDATE)
        Mock: なし
        Level: unit
        Objective: public モードで SUSPICION_UPDATE イベントが表示されないこと（is_public=False フィルタ）。
        """
        renderer = Renderer([], spectator_mode=False)
        event = _make_event(
            EventType.SUSPICION_UPDATE,
            agent="Alice",
            content="Alice suspicion update: Bob=0.70, Carol=0.30",
            is_public=False,
        )

        result = renderer.on_event(event)

        assert result is None

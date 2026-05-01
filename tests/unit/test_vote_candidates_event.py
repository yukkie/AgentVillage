"""
VOTE_CANDIDATES イベントの emit と Renderer 描画テスト（Issue #219）。
"""
from unittest.mock import patch

from src.domain.event import EventType, LogEvent
from src.domain.schema import AgentOutput, Intent, VoteCandidate
from src.engine.phase import Phase
from src.ui.renderer import Renderer


def _make_output(candidates: list[tuple[str, float]]) -> AgentOutput:
    return AgentOutput(
        thought="thinking",
        speech="Hello.",
        reasoning="reason",
        intent=Intent(
            vote_candidates=[VoteCandidate(target=t, score=s) for t, s in candidates]
        ),
        memory_update=[],
    )


def _make_event(event_type: EventType, **kwargs) -> LogEvent:
    return LogEvent.make(day=1, phase="day_opening", event_type=event_type, **kwargs)


# ── emit tests ────────────────────────────────────────────────────────────────


class TestVoteCandidatesEmit:
    def test_event_emitted_when_candidates_non_empty(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_speech_output
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: vote_candidates が非空のとき VOTE_CANDIDATES イベントが emit されること。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        output = _make_output([("Bob", 0.7), ("Carol", 0.3)])

        with patch("src.agent.store.save"):
            engine._apply_speech_output(actor, output, Phase.DAY_OPENING)

        vc_events = [e for e in events if e.event_type == EventType.VOTE_CANDIDATES]
        assert len(vc_events) == 1

    def test_event_not_emitted_when_candidates_empty(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_speech_output
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: vote_candidates が空のとき VOTE_CANDIDATES イベントが emit されないこと。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        output = _make_output([])

        with patch("src.agent.store.save"):
            engine._apply_speech_output(actor, output, Phase.DAY_OPENING)

        vc_events = [e for e in events if e.event_type == EventType.VOTE_CANDIDATES]
        assert len(vc_events) == 0

    def test_event_contains_agent_name_and_candidates(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_speech_output
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: VOTE_CANDIDATES イベントに agent 名と candidates の文字列が含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        output = _make_output([("Bob", 0.74), ("Carol", 0.42)])

        with patch("src.agent.store.save"):
            engine._apply_speech_output(actor, output, Phase.DAY_OPENING)

        vc_event = next(e for e in events if e.event_type == EventType.VOTE_CANDIDATES)
        assert vc_event.agent == "Alice"
        assert "Bob(0.74)" in vc_event.content
        assert "Carol(0.42)" in vc_event.content

    def test_event_is_not_public(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_speech_output
        Mock: LogWriter.write (via make_test_engine), store.save
        Level: unit
        Objective: VOTE_CANDIDATES イベントが is_public=False であること（観戦者専用）。
        """
        actor = make_test_actor("Alice", "Villager")
        engine, events = make_test_engine([actor])
        output = _make_output([("Bob", 0.9)])

        with patch("src.agent.store.save"):
            engine._apply_speech_output(actor, output, Phase.DAY_OPENING)

        vc_event = next(e for e in events if e.event_type == EventType.VOTE_CANDIDATES)
        assert vc_event.is_public is False


# ── Renderer tests ────────────────────────────────────────────────────────────


class TestVoteCandidatesRenderer:
    def test_rendered_in_spectator_mode(self):
        """
        SUT: Renderer.on_event (VOTE_CANDIDATES)
        Mock: なし
        Level: unit
        Objective: spectator モードで VOTE_CANDIDATES イベントが [CANDIDATES] プレフィックス付きで表示されること。
        """
        renderer = Renderer([], spectator_mode=True)
        event = _make_event(
            EventType.VOTE_CANDIDATES,
            agent="Alice",
            content="Alice: Bob(0.70), Carol(0.30)",
            is_public=False,
        )

        result = renderer.on_event(event)

        assert result is not None
        assert "[CANDIDATES] Alice: Bob(0.70), Carol(0.30)" in result.plain

    def test_hidden_in_public_mode(self):
        """
        SUT: Renderer.on_event (VOTE_CANDIDATES)
        Mock: なし
        Level: unit
        Objective: public モードで VOTE_CANDIDATES イベントが表示されないこと（is_public=False フィルタ）。
        """
        renderer = Renderer([], spectator_mode=False)
        event = _make_event(
            EventType.VOTE_CANDIDATES,
            agent="Alice",
            content="Alice: Bob(0.70), Carol(0.30)",
            is_public=False,
        )

        result = renderer.on_event(event)

        assert result is None

    def test_style_is_dim_cyan(self):
        """
        SUT: Renderer.on_event (VOTE_CANDIDATES)
        Mock: なし
        Level: unit
        Objective: VOTE_CANDIDATES イベントのスタイルが dim cyan であること。
        """
        renderer = Renderer([], spectator_mode=True)
        event = _make_event(
            EventType.VOTE_CANDIDATES,
            agent="Alice",
            content="Alice: Bob(0.90)",
            is_public=False,
        )

        result = renderer.on_event(event)

        assert result is not None
        assert any("dim cyan" in str(s.style) for s in result.spans)

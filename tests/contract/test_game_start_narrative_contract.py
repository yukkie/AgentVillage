"""Contract test: GameEngine emits game_start_narrative on game start."""
from unittest.mock import patch

from src.domain.event import EventType


class TestGameStartNarrativeContract:
    def test_game_start_narrative_is_emitted(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run
        Mock: _run_day, _game_over をパッチしてループを即終了
        Level: unit
        Objective: game_start_narrative イベントが day=0, phase='init', is_public=True で emit されることを検証する
        """
        agents = [make_test_actor("A")]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_day", return_value="Werewolves"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        narrative_events = [e for e in events if e.event_type == EventType.GAME_START_NARRATIVE]
        assert len(narrative_events) == 1

        ev = narrative_events[0]
        assert ev.day == 0
        assert ev.phase == "init"
        assert ev.is_public is True
        assert len(ev.content) > 0

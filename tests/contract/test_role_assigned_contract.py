"""Contract test: GameEngine emits role_assigned events on game start."""
from unittest.mock import patch

from src.domain.event import EventType


class TestRoleAssignedContract:
    def test_summary_event_is_emitted(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run
        Mock: _run_day, _game_over をパッチしてループを即終了
        Level: unit
        Objective: role_assigned summary イベントが day=0, phase='init', agent=None, is_public=True で emit されることを検証する
        """
        agents = [
            make_test_actor("Alice", "Seer"),
            make_test_actor("Bob", "Villager"),
            make_test_actor("Carol", "Werewolf"),
        ]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_day", return_value="Werewolves"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        summary_events = [
            e for e in events
            if e.event_type == EventType.ROLE_ASSIGNED and e.agent is None
        ]
        assert len(summary_events) == 1

        ev = summary_events[0]
        assert ev.day == 0
        assert ev.phase == "init"
        assert ev.is_public is True
        assert "Villager" in ev.content
        assert "Seer" in ev.content
        assert "Werewolf" in ev.content

    def test_per_agent_events_are_emitted(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run
        Mock: _run_day, _game_over をパッチしてループを即終了
        Level: unit
        Objective: role_assigned per-agent イベントが全エージェント分 day=0, phase='init', is_public=False で emit されることを検証する
        """
        agents = [
            make_test_actor("Alice", "Seer"),
            make_test_actor("Bob", "Villager"),
            make_test_actor("Carol", "Werewolf"),
        ]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_day", return_value="Werewolves"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        per_agent_events = [
            e for e in events
            if e.event_type == EventType.ROLE_ASSIGNED and e.agent is not None
        ]
        assert len(per_agent_events) == 3

        agent_names = {e.agent for e in per_agent_events}
        assert agent_names == {"Alice", "Bob", "Carol"}

        for ev in per_agent_events:
            assert ev.day == 0
            assert ev.phase == "init"
            assert ev.is_public is False
            assert "came to realize they were the" in ev.content

    def test_per_agent_content_matches_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run
        Mock: _run_day, _game_over をパッチしてループを即終了
        Level: unit
        Objective: per-agent イベントの content がエージェント名と役職名を含むことを検証する
        """
        agents = [make_test_actor("Alice", "Seer")]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_day", return_value="Werewolves"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        per_agent = next(
            e for e in events
            if e.event_type == EventType.ROLE_ASSIGNED and e.agent == "Alice"
        )
        assert "Alice" in per_agent.content
        assert "Seer" in per_agent.content

    def test_role_assigned_emitted_after_narrative(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine.run
        Mock: _run_day, _game_over をパッチしてループを即終了
        Level: unit
        Objective: role_assigned イベントが game_start_narrative の直後に emit されることを検証する
        """
        agents = [make_test_actor("Alice", "Seer")]
        engine, events = make_test_engine(agents)

        with (
            patch.object(engine, "_run_day", return_value="Werewolves"),
            patch.object(engine, "_game_over"),
        ):
            engine.run()

        init_events = [e for e in events if e.day == 0 and e.phase == "init"]
        types = [e.event_type for e in init_events]
        narrative_idx = types.index(EventType.GAME_START_NARRATIVE)
        first_role_idx = next(i for i, t in enumerate(types) if t == EventType.ROLE_ASSIGNED)
        assert first_role_idx > narrative_idx

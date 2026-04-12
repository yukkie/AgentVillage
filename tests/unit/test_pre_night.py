"""
前夜フェーズ（PRE_NIGHT）のテスト。
- build_pre_night_prompt の内容
- build_system_prompt の intended_co 反映
- _run_pre_night のフロー（LLM・store.save をモック）
"""
from unittest.mock import MagicMock, patch


from src.agent.state import AgentState, Persona
from src.engine.game import GameEngine
from src.engine.phase import Phase
from src.llm.prompt import PublicContext, SpeechDirection, WolfSpecificContext, build_pre_night_prompt, build_system_prompt
from src.llm.schema import PreNightOutput
from src.logger.event import EventType, LogEvent
from src.logger.writer import LogWriter


def _make_agent(name: str, role: str) -> AgentState:
    return AgentState(
        name=name,
        role=role,
        persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    )


def _make_engine(agents: list[AgentState]) -> tuple[GameEngine, list[LogEvent]]:
    events: list[LogEvent] = []
    log_writer = MagicMock(spec=LogWriter)
    log_writer.write.side_effect = lambda e: events.append(e)
    engine = GameEngine(agents=agents, log_writer=log_writer, lang="English")
    return engine, events


# ── build_pre_night_prompt ──────────────────────────────────────────────────


class TestBuildPreNightPrompt:
    def test_seer_prompt_contains_true_co_description(self):
        agent = _make_agent("Gina", "Seer")
        prompt = build_pre_night_prompt(agent, ["Gina", "SQ", "Raqio"])
        assert "Seer" in prompt
        assert "co" in prompt
        assert "wait" in prompt
        # Should NOT mention fake-CO language
        assert "fake" not in prompt.lower()

    def test_werewolf_prompt_contains_fake_co_description(self):
        agent = _make_agent("SQ", "Werewolf")
        prompt = build_pre_night_prompt(agent, ["Gina", "SQ", "Raqio"])
        assert "Seer" in prompt
        assert "co" in prompt
        assert "wait" in prompt
        # Should mention deception
        assert "fake" in prompt.lower() or "false" in prompt.lower() or "confuse" in prompt.lower()

    def test_prompt_includes_all_players(self):
        agent = _make_agent("Gina", "Seer")
        players = ["Gina", "SQ", "Raqio", "Zephyr", "Setsu"]
        prompt = build_pre_night_prompt(agent, players)
        for p in players:
            assert p in prompt


# ── build_system_prompt (intended_co) ─────────────────────────────────────


class TestBuildSystemPromptIntendedCo:
    def test_no_intended_co_section_by_default(self):
        agent = _make_agent("Gina", "Seer")
        ctx = PublicContext(today_log=[], alive_players=["Gina", "SQ"], dead_players=[], day=1)
        prompt = build_system_prompt(agent, ctx, SpeechDirection())
        assert "CO DECISION" not in prompt

    def test_seer_intended_co_adds_true_co_instruction(self):
        agent = _make_agent("Gina", "Seer")
        ctx = PublicContext(today_log=[], alive_players=["Gina", "SQ"], dead_players=[], day=1)
        prompt = build_system_prompt(agent, ctx, SpeechDirection(intended_co=True))
        assert "CO DECISION" in prompt
        assert "Seer" in prompt
        assert "intent.co" in prompt
        # Must NOT instruct Seer to fake
        assert "fake" not in prompt.lower()

    def test_werewolf_intended_co_adds_fake_co_instruction(self):
        agent = _make_agent("SQ", "Werewolf")
        ctx = PublicContext(today_log=[], alive_players=["Gina", "SQ"], dead_players=[], day=1)
        role_ctx = WolfSpecificContext(wolf_partners=[])
        prompt = build_system_prompt(agent, ctx, SpeechDirection(intended_co=True), role_ctx)
        assert "CO DECISION" in prompt
        assert "Seer" in prompt  # instructs to claim Seer
        assert "intent.co" in prompt
        # Must NOT tell werewolf to reveal true role
        assert "Werewolf" not in prompt.split("--- YOUR CO DECISION ---")[1]


# ── _run_pre_night ──────────────────────────────────────────────────────────


class TestRunPreNight:
    def _make_output(self, decision: str) -> PreNightOutput:
        return PreNightOutput(thought="thinking", decision=decision, reasoning="reason")

    def test_only_non_villager_agents_participate(self):
        agents = [
            _make_agent("A", "Villager"),
            _make_agent("B", "Villager"),
            _make_agent("C", "Seer"),
            _make_agent("D", "Werewolf"),
        ]
        engine, events = _make_engine(agents)

        call_results = [self._make_output("wait"), self._make_output("wait")]
        with (
            patch("src.engine.game.llm_client.call_pre_night_action", side_effect=call_results),
            patch("src.agent.store.save"),
        ):
            engine._run_pre_night()

        decision_events = [e for e in events if e.event_type == EventType.PRE_NIGHT_DECISION]
        # Only Seer and Werewolf → 2 events
        assert len(decision_events) == 2
        agents_in_events = {e.agent for e in decision_events}
        assert agents_in_events == {"C", "D"}

    def test_co_decision_sets_intended_co_true(self):
        agents = [_make_agent("Gina", "Seer"), _make_agent("SQ", "Villager")]
        engine, _ = _make_engine(agents)

        with (
            patch("src.engine.game.llm_client.call_pre_night_action", return_value=self._make_output("co")),
            patch("src.agent.store.save"),
        ):
            engine._run_pre_night()

        seer = next(a for a in agents if a.name == "Gina")
        assert seer.intended_co is True

    def test_wait_decision_sets_intended_co_false(self):
        agents = [_make_agent("Gina", "Seer"), _make_agent("SQ", "Villager")]
        engine, _ = _make_engine(agents)

        with (
            patch("src.engine.game.llm_client.call_pre_night_action", return_value=self._make_output("wait")),
            patch("src.agent.store.save"),
        ):
            engine._run_pre_night()

        seer = next(a for a in agents if a.name == "Gina")
        assert seer.intended_co is False

    def test_decision_events_are_spectator_only(self):
        agents = [_make_agent("Gina", "Seer"), _make_agent("SQ", "Villager")]
        engine, events = _make_engine(agents)

        with (
            patch("src.engine.game.llm_client.call_pre_night_action", return_value=self._make_output("co")),
            patch("src.agent.store.save"),
        ):
            engine._run_pre_night()

        decision_events = [e for e in events if e.event_type == EventType.PRE_NIGHT_DECISION]
        assert all(not e.is_public for e in decision_events)

    def test_phase_start_event_is_spectator_only(self):
        agents = [_make_agent("Gina", "Seer"), _make_agent("SQ", "Villager")]
        engine, events = _make_engine(agents)

        with (
            patch("src.engine.game.llm_client.call_pre_night_action", return_value=self._make_output("wait")),
            patch("src.agent.store.save"),
        ):
            engine._run_pre_night()

        phase_starts = [
            e for e in events
            if e.event_type == EventType.PHASE_START and e.phase == Phase.PRE_NIGHT.value
        ]
        assert len(phase_starts) == 1
        assert not phase_starts[0].is_public

    def test_no_villagers_only_skips_phase(self):
        agents = [_make_agent("A", "Villager"), _make_agent("B", "Villager")]
        engine, events = _make_engine(agents)

        with patch("src.engine.game.llm_client.call_pre_night_action") as mock_call:
            engine._run_pre_night()

        mock_call.assert_not_called()
        assert not any(e.event_type == EventType.PRE_NIGHT_DECISION for e in events)

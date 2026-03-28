"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (llm_client.call / call_judgment_parallel) はモック。
"""
from unittest.mock import MagicMock, patch

from src.agent.state import AgentState, Persona, Belief
from src.engine.game import GameEngine
from src.engine.phase import Phase
from src.llm.schema import AgentOutput, Intent, JudgmentOutput, SpeechEntry
from src.logger.event import EventType, LogEvent
from src.logger.writer import LogWriter


def _make_agent(name: str, role: str = "Villager") -> AgentState:
    return AgentState(
        name=name,
        role=role,
        persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    )


def _make_output(name: str, speech: str = "Hello.") -> AgentOutput:
    return AgentOutput(
        thought="thinking",
        speech=speech,
        reasoning="reasoning",
        intent=Intent(vote_candidates=[]),
        memory_update=[],
    )


def _make_engine(agents: list[AgentState]) -> tuple[GameEngine, list[LogEvent]]:
    events: list[LogEvent] = []
    log_writer = MagicMock(spec=LogWriter)
    log_writer.write.side_effect = lambda e: events.append(e)
    engine = GameEngine(agents=agents, log_writer=log_writer, lang="English")
    return engine, events


class TestRunDayPhaseOrder:
    def test_opening_then_discussion_then_vote(self):
        agents = [_make_agent("A"), _make_agent("B"), _make_agent("C", "Werewolf")]
        engine, events = _make_engine(agents)

        # all judgment → silent (skip discussion speaking)
        silent = JudgmentOutput(decision="silent")

        with (
            patch("src.engine.game.llm_client.call", side_effect=lambda ag, *a, **kw: _make_output(ag.name)),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(agents[0], silent), (agents[1], silent), (agents[2], silent)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        phase_starts = [e for e in events if e.event_type == EventType.PHASE_START]
        phases = [e.phase for e in phase_starts]
        assert Phase.DAY_OPENING.value in phases
        assert Phase.DAY_DISCUSSION.value in phases
        assert Phase.DAY_VOTE.value in phases
        # ordering
        assert phases.index(Phase.DAY_OPENING.value) < phases.index(Phase.DAY_DISCUSSION.value)
        assert phases.index(Phase.DAY_DISCUSSION.value) < phases.index(Phase.DAY_VOTE.value)

    def test_speech_ids_are_sequential(self):
        agents = [_make_agent("A"), _make_agent("B")]
        engine, events = _make_engine(agents)

        silent = JudgmentOutput(decision="silent")

        with (
            patch("src.engine.game.llm_client.call", side_effect=lambda ag, *a, **kw: _make_output(ag.name)),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(agents[0], silent), (agents[1], silent)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        speech_events = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.is_public and e.speech_id is not None
        ]
        ids = [e.speech_id for e in speech_events]
        assert ids == sorted(ids)
        assert ids == list(range(1, len(ids) + 1))

    def test_challenge_reply_to_recorded(self):
        agents = [_make_agent("A"), _make_agent("B")]
        engine, events = _make_engine(agents)

        # B challenges speech_id=1 (A's opening speech)
        challenge = JudgmentOutput(decision="challenge", reply_to=1)
        silent = JudgmentOutput(decision="silent")

        with (
            patch("src.engine.game.llm_client.call", side_effect=lambda ag, *a, **kw: _make_output(ag.name)),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(agents[1], challenge), (agents[0], silent)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        challenge_events = [e for e in events if e.reply_to is not None and e.is_public]
        assert len(challenge_events) == 1
        assert challenge_events[0].reply_to == 1

    def test_all_silent_does_not_raise(self):
        agents = [_make_agent("A"), _make_agent("B", "Werewolf")]
        engine, _ = _make_engine(agents)

        silent = JudgmentOutput(decision="silent")

        with (
            patch("src.engine.game.llm_client.call", side_effect=lambda ag, *a, **kw: _make_output(ag.name)),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(agents[0], silent), (agents[1], silent)]
            )),
            patch("src.agent.store.save"),
        ):
            result = engine._run_day()  # should not raise

        assert result in (None, "Werewolves", "Villagers")

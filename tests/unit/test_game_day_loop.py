"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (llm_client.call / call_judgment_parallel) はモック。
"""
from unittest.mock import MagicMock, patch

from src.agent.state import AgentState, Persona
from src.engine.game import GameEngine
from src.engine.phase import Phase
from src.llm.schema import AgentOutput, Intent, JudgmentOutput
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


class TestDiscussionCoDecision:
    """Tests for the "co" judgment option in discussion phase."""

    def test_eligible_agent_co_sets_claimed_role(self):
        """Seer (unclaimed) chooses co → claimed_role is set after speaking."""
        seer = _make_agent("Seer1", "Seer")
        assert seer.claimed_role is None
        engine, _ = _make_engine([seer])

        co_judgment = JudgmentOutput(decision="co")
        # LLM speech output includes intent.co (Seer declares themselves)
        co_output = AgentOutput(
            thought="I'll CO now.",
            speech="I am the Seer!",
            reasoning="r",
            intent=Intent(vote_candidates=[], co="Seer"),
            memory_update=[],
        )

        with (
            patch("src.engine.game.llm_client.call", return_value=co_output),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(seer, co_judgment)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        assert seer.claimed_role == "Seer"

    def test_ineligible_agent_co_treated_as_speak(self):
        """Agent that already claimed a role cannot CO again — falls back to speak."""
        seer = _make_agent("Seer1", "Seer")
        seer.claimed_role = "Seer"  # already claimed
        engine, events = _make_engine([seer])

        co_judgment = JudgmentOutput(decision="co")
        normal_output = _make_output("Seer1", "Just speaking.")

        call_mock = MagicMock(return_value=normal_output)
        with (
            patch("src.engine.game.llm_client.call", call_mock),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(seer, co_judgment)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        # _do_speak should be called with force_co=False (ineligible): direction.intended_co == False
        args, _ = call_mock.call_args
        direction = args[2]
        assert direction.intended_co is False

    def test_villager_co_treated_as_speak(self):
        """Villager cannot CO — co judgment falls back to speak."""
        villager = _make_agent("V1", "Villager")
        engine, _ = _make_engine([villager])

        co_judgment = JudgmentOutput(decision="co")
        normal_output = _make_output("V1", "Just talking.")

        call_mock = MagicMock(return_value=normal_output)
        with (
            patch("src.engine.game.llm_client.call", call_mock),
            patch("src.engine.game.llm_client.call_judgment_parallel", return_value=iter(
                [(villager, co_judgment)]
            )),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        # force_co must be False for Villager: direction.intended_co == False
        args, _ = call_mock.call_args
        assert args[2].intended_co is False

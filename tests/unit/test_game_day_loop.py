"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (LLMClient メソッド) はモック。
"""
from unittest.mock import MagicMock, patch

from src.domain.actor import ActorState, Actor, Persona, make_actor
from src.engine.game import GameEngine
from src.engine.phase import Phase
from src.domain.schema import AgentOutput, Intent, JudgmentOutput
from src.domain.event import EventType, LogEvent
from src.domain.roles import Seer
from src.logger.writer import LogWriter


def _make_agent(name: str, role: str = "Villager") -> Actor:
    state = ActorState(
        name=name,
        persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    )
    return make_actor(state, role)


def _make_output(name: str, speech: str = "Hello.") -> AgentOutput:
    return AgentOutput(
        thought="thinking",
        speech=speech,
        reasoning="reasoning",
        intent=Intent(vote_candidates=[]),
        memory_update=[],
    )


def _make_engine(agents: list[Actor]) -> tuple[GameEngine, list[LogEvent]]:
    events: list[LogEvent] = []
    log_writer = MagicMock(spec=LogWriter)
    log_writer.write.side_effect = lambda e: events.append(e)
    with patch("src.engine.game.llm_factory.create_client", return_value=MagicMock()):
        engine = GameEngine(agents=agents, log_writer=log_writer, lang="English")
    return engine, events


def _silent_discussion(actors, *_, **__):
    """call_discussion_parallel stub: all actors silent."""
    return iter([(a, JudgmentOutput(decision="silent"), None, None, False) for a in actors])


class TestRunDayPhaseOrder:
    def test_opening_then_discussion_then_vote(self):
        agents = [_make_agent("A"), _make_agent("B"), _make_agent("C", "Werewolf")]
        engine, events = _make_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = _silent_discussion

        with patch("src.agent.store.save"):
            engine._run_day()

        phase_starts = [e for e in events if e.event_type == EventType.PHASE_START]
        phases = [e.phase for e in phase_starts]
        assert Phase.DAY_OPENING.value in phases
        assert Phase.DAY_DISCUSSION.value in phases
        assert Phase.DAY_VOTE.value in phases
        assert phases.index(Phase.DAY_OPENING.value) < phases.index(Phase.DAY_DISCUSSION.value)
        assert phases.index(Phase.DAY_DISCUSSION.value) < phases.index(Phase.DAY_VOTE.value)

    def test_speech_ids_are_sequential(self):
        agents = [_make_agent("A"), _make_agent("B")]
        engine, events = _make_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = _silent_discussion

        with patch("src.agent.store.save"):
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
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])

        # B challenges speech_id=1 (A's opening speech)
        challenge = JudgmentOutput(decision="challenge", reply_to=1)

        def discussion_with_challenge(actors, today_log, *_, **__):
            # find speech_id=1 entry from today_log
            reply_to_entry = next((e for e in today_log if e.speech_id == 1), None)
            return iter([
                (_make_agent("A"), JudgmentOutput(decision="silent"), None, None, False),
                (_make_agent("B"), challenge, _make_output("B"), reply_to_entry, False),
            ])

        engine._llm_client.call_discussion_parallel.side_effect = discussion_with_challenge

        with (
            patch("src.engine.game.DISCUSSION_ROUNDS", 1),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        challenge_events = [e for e in events if e.reply_to is not None and e.is_public]
        assert len(challenge_events) == 1
        assert all(e.reply_to == 1 for e in challenge_events)

    def test_all_silent_does_not_raise(self):
        agents = [_make_agent("A"), _make_agent("B", "Werewolf")]
        engine, _ = _make_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = _silent_discussion

        with patch("src.agent.store.save"):
            result = engine._run_day()

        assert result in (None, "Werewolves", "Villagers")


class TestDiscussionCoDecision:
    """Tests for the "co" judgment option in discussion phase."""

    def test_eligible_agent_co_sets_claimed_role(self):
        """Seer (unclaimed) chooses co → claimed_role is set after speaking."""
        seer = _make_agent("Seer1", "Seer")
        assert seer.state.claimed_role is None
        engine, _ = _make_engine([seer])

        co_output = AgentOutput(
            thought="I'll CO now.",
            speech="I am the Seer!",
            reasoning="r",
            intent=Intent(vote_candidates=[], co="Seer"),
            memory_update=[],
        )
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, JudgmentOutput(decision="co"), co_output, None, True),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert isinstance(seer.state.claimed_role, Seer)

    def test_ineligible_agent_co_treated_as_speak(self):
        """Agent that already claimed a role cannot CO again — falls back to speak."""
        seer = _make_agent("Seer1", "Seer")
        seer.state.claimed_role = "Seer"  # already claimed
        engine, _ = _make_engine([seer])

        normal_output = _make_output("Seer1", "Just speaking.")
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        # force_co=False because already claimed
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, JudgmentOutput(decision="co"), normal_output, None, False),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        # co intent is None in normal_output → claimed_role unchanged
        assert seer.state.claimed_role is not None  # still the old value, not set again

    def test_villager_co_treated_as_speak(self):
        """Villager cannot CO — co judgment falls back to speak (force_co=False)."""
        villager = _make_agent("V1", "Villager")
        engine, _ = _make_engine([villager])

        normal_output = _make_output("V1", "Just talking.")
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, JudgmentOutput(decision="co"), normal_output, None, False),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        # Villager co intent is None → claimed_role stays None
        assert villager.state.claimed_role is None

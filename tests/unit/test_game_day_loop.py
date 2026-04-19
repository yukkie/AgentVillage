"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (LLMClient メソッド) はモック。
"""
from unittest.mock import MagicMock, patch

from src.engine.game import GameEngine
from src.engine.phase import Phase
from src.domain.schema import AgentOutput, Intent, JudgmentOutput
from src.domain.event import EventType
from src.domain.roles import Seer
from src.llm.client import LLMClient
from src.logger.writer import LogWriter


def _make_output(name: str, speech: str = "Hello.") -> AgentOutput:
    return AgentOutput(
        thought="thinking",
        speech=speech,
        reasoning="reasoning",
        intent=Intent(vote_candidates=[]),
        memory_update=[],
    )


class TestGameEngineLlmInjection:
    def test_uses_injected_llm_client_without_factory_patch(self, make_test_actor):
        agents = [make_test_actor("A")]
        log_writer = MagicMock(spec=LogWriter)
        injected_llm = MagicMock(spec=LLMClient)

        engine = GameEngine(
            agents=agents,
            log_writer=log_writer,
            lang="English",
            llm_client=injected_llm,
        )

        assert engine._llm_client is injected_llm


def _silent_discussion(actors, *_, **__):
    """call_discussion_parallel stub: all actors silent."""
    return iter([(a, JudgmentOutput(decision="silent"), None, None, False) for a in actors])


class TestRunDayPhaseOrder:
    def test_opening_then_discussion_then_vote(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B"), make_test_actor("C", "Werewolf")]
        engine, events = make_test_engine(agents)
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

    def test_speech_ids_are_sequential(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B")]
        engine, events = make_test_engine(agents)
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

    def test_challenge_reply_to_recorded(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B")]
        engine, events = make_test_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])

        # B challenges speech_id=1 (A's opening speech)
        challenge = JudgmentOutput(decision="challenge", reply_to=1)

        def discussion_with_challenge(actors, today_log, *_, **__):
            # find speech_id=1 entry from today_log
            reply_to_entry = next((e for e in today_log if e.speech_id == 1), None)
            return iter([
                (make_test_actor("A"), JudgmentOutput(decision="silent"), None, None, False),
                (make_test_actor("B"), challenge, _make_output("B"), reply_to_entry, False),
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

    def test_all_silent_does_not_raise(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B", "Werewolf")]
        engine, _ = make_test_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = _silent_discussion

        with patch("src.agent.store.save"):
            result = engine._run_day()

        assert result in (None, "Werewolves", "Villagers")


class TestDiscussionCoDecision:
    """Tests for the "co" judgment option in discussion phase."""

    def test_eligible_agent_co_sets_claimed_role(self, make_test_actor, make_test_engine):
        """Seer (unclaimed) chooses co → claimed_role is set after speaking."""
        seer = make_test_actor("Seer1", "Seer")
        assert seer.state.claimed_role is None
        engine, _ = make_test_engine([seer])

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

    def test_ineligible_agent_co_treated_as_speak(self, make_test_actor, make_test_engine):
        """Agent that already claimed a role cannot CO again — falls back to speak."""
        seer = make_test_actor("Seer1", "Seer")
        seer.state.claimed_role = "Seer"  # already claimed
        engine, _ = make_test_engine([seer])

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

    def test_villager_co_treated_as_speak(self, make_test_actor, make_test_engine):
        """Villager cannot CO — co judgment falls back to speak (force_co=False)."""
        villager = make_test_actor("V1", "Villager")
        engine, _ = make_test_engine([villager])

        normal_output = _make_output("V1", "Just talking.")
        engine._llm_client.call_speech_parallel.side_effect = lambda calls: iter([(a, _make_output(a.name)) for a, *_ in calls])
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, JudgmentOutput(decision="co"), normal_output, None, False),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        # Villager co intent is None → claimed_role stays None
        assert villager.state.claimed_role is None

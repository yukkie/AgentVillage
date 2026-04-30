"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (LLMClient メソッド) はモック。
"""
from unittest.mock import MagicMock, patch

from src.engine.game import GameEngine
from src.engine.phase_day import run_day_phase
from src.engine.phase_night import run_night_phase
from src.engine.phase_pre_night import run_pre_night_phase
from src.engine.phase import Phase
from src.domain.schema import AgentOutput, Intent, JudgmentOutput
from src.domain.event import EventType
from src.domain.roles import Seer
from src.llm.client import LLMClient
from src.logger.writer import LogWriter
from tests.conftest import (
    make_agent_output,
    make_night_action_side_effect,
    make_silent_discussion_side_effect,
    make_speech_parallel_side_effect,
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

    def test_phase_modules_import_independently(self):
        assert callable(run_pre_night_phase)
        assert callable(run_day_phase)
        assert callable(run_night_phase)


class TestRunDayPhaseOrder:
    def test_opening_then_discussion_then_vote(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B"), make_test_actor("C", "Werewolf")]
        engine, events = make_test_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()

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
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()

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
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()

        # B challenges speech_id=1 (A's opening speech)
        challenge = JudgmentOutput(decision="challenge", reply_to=1)

        def discussion_with_challenge(actors, today_log, *_, **__):
            # find speech_id=1 entry from today_log
            reply_to_entry = next((e for e in today_log if e.speech_id == 1), None)
            return iter([
                (make_test_actor("A"), JudgmentOutput(decision="silent"), None, None),
                (make_test_actor("B"), challenge, make_agent_output("B"), reply_to_entry),
            ])

        engine._llm_client.call_discussion_parallel.side_effect = discussion_with_challenge

        with (
            patch("src.engine.phase_day.DISCUSSION_ROUNDS", 1),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        challenge_events = [e for e in events if e.reply_to is not None and e.is_public]
        assert len(challenge_events) == 1
        assert all(e.reply_to == 1 for e in challenge_events)

    def test_all_silent_does_not_raise(self, make_test_actor, make_test_engine):
        agents = [make_test_actor("A"), make_test_actor("B", "Werewolf")]
        engine, _ = make_test_engine(agents)
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()

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
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, JudgmentOutput(decision="co"), co_output, None),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert isinstance(seer.state.claimed_role, Seer)

    def test_ineligible_agent_co_treated_as_speak(self, make_test_actor, make_test_engine):
        """Agent that already claimed a role cannot CO again — falls back to speak."""
        seer = make_test_actor("Seer1", "Seer")
        seer.state.claimed_role = "Seer"  # already claimed
        engine, _ = make_test_engine([seer])

        normal_output = make_agent_output("Seer1", "Just speaking.")
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, JudgmentOutput(decision="co"), normal_output, None),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        # co intent is None in normal_output → claimed_role unchanged
        assert seer.state.claimed_role is not None  # still the old value, not set again

    def test_villager_co_treated_as_speak(self, make_test_actor, make_test_engine):
        """Villager cannot CO — co judgment falls back to speak."""
        villager = make_test_actor("V1", "Villager")
        engine, _ = make_test_engine([villager])

        normal_output = make_agent_output("V1", "Just talking.")
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, JudgmentOutput(decision="co"), normal_output, None),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        # Villager co intent is None → claimed_role stays None
        assert villager.state.claimed_role is None

    def test_failed_discussion_co_clears_intended_co(self, make_test_actor, make_test_engine):
        seer = make_test_actor("Seer1", "Seer")
        engine, _ = make_test_engine([seer])
        normal_output = make_agent_output("Seer1", "I have something to say.")

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, JudgmentOutput(decision="co"), normal_output, None),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert seer.state.intended_co is None

    def test_discussion_fake_co_uses_selected_claim_role(self, make_test_actor, make_test_engine):
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, _ = make_test_engine([wolf])
        co_output = AgentOutput(
            thought="I'll fake medium.",
            speech="I am the Medium.",
            reasoning="r",
            intent=Intent(vote_candidates=[], co="Medium"),
            memory_update=[],
        )
        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (wolf, JudgmentOutput(decision="co", claim_role="Medium"), co_output, None),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert wolf.state.claimed_role.name == "Medium"


class TestRunNightPhaseOrder:
    def test_declarations_finish_before_resolution(self, make_test_actor, make_test_engine):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        target = make_test_actor("Villager1")
        engine, _ = make_test_engine([seer, wolf, target])
        order: list[str] = []

        base_side_effect = make_night_action_side_effect({"Wolf1": "Seer1", "Seer1": "Villager1"})

        def night_action(actor, _context, _alive_names):
            order.append(f"declare:{actor.name}")
            return base_side_effect(actor, _context, _alive_names)

        engine._llm_client.call_night_action.side_effect = night_action

        original_eliminate = engine._eliminate

        def eliminate_and_record(*args, **kwargs):
            order.append("resolve:attack")
            return original_eliminate(*args, **kwargs)

        with (
            patch("src.agent.store.save"),
            patch("src.engine.phase_night.resolve_inspect") as mock_resolve_inspect,
            patch.object(engine, "_eliminate", side_effect=eliminate_and_record),
        ):
            mock_resolve_inspect.side_effect = lambda action, agents: (
                order.append("resolve:inspect"),
                ("Villager1", None),
            )[1]
            engine._run_night()

        declare_indexes = [i for i, step in enumerate(order) if step.startswith("declare:")]
        resolve_indexes = [i for i, step in enumerate(order) if step.startswith("resolve:")]
        assert declare_indexes
        assert resolve_indexes
        assert max(declare_indexes) < min(resolve_indexes)

    def test_inspection_is_not_published_if_seer_dies_at_night(self, make_test_actor, make_test_engine):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        target = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, target])

        engine._llm_client.call_night_action.side_effect = make_night_action_side_effect({
            "Wolf1": "Seer1",
            "Seer1": "Villager1",
        })

        with patch("src.agent.store.save"):
            engine._run_night()

        assert seer.is_alive is False
        assert seer.state.beliefs == {}
        assert not any(e.event_type == EventType.INSPECTION for e in events)

    def test_inspection_is_published_if_seer_survives(self, make_test_actor, make_test_engine):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        target = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, target])

        engine._llm_client.call_night_action.side_effect = make_night_action_side_effect({
            "Wolf1": "Villager1",
            "Seer1": "Wolf1",
        })

        with patch("src.agent.store.save"):
            engine._run_night()

        assert seer.is_alive is True
        assert seer.state.beliefs["Wolf1"].suspicion == 1.0
        assert any(
            e.event_type == EventType.INSPECTION and e.agent == "Seer1" and e.target == "Wolf1"
            for e in events
        )

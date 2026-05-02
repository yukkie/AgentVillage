"""
_run_day() のフェーズ順・speech_id採番・フォールバックを検証する。
LLM呼び出し (LLMClient メソッド) はモック。
"""
import pytest
from unittest.mock import MagicMock, patch

from src.engine.game import GameEngine
from src.engine.phase_day import run_day_phase
from src.engine.phase_night import run_night_phase
from src.engine.phase_pre_night import run_pre_night_phase
from src.engine.phase import Phase
from src.domain.schema import AgentOutput, ChallengeResult, CoResult, Intent, SilentResult, SpeakResult
from src.domain.event import EventType
from src.domain.roles import Seer
from src.llm.client import LLMClient
from src.logger.writer import LogWriter
from tests.conftest import (
    make_night_action_side_effect,
    make_silent_discussion_side_effect,
    make_speech_parallel_side_effect,
    make_vote_parallel_side_effect,
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
        def discussion_with_challenge(actors, *_, **__):
            return iter([
                (make_test_actor("A"), SilentResult(reasoning="quiet")),
                (make_test_actor("B"), ChallengeResult(thought="t", speech="I disagree!", reply_to=1)),
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
    """Tests for the "co" tool use in discussion phase."""

    def test_co_result_sets_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with CoResult
        Mock: call_discussion_parallel returns CoResult(claim_role=Seer)
        Level: unit
        Objective: CoResult が返ったとき actor.state.claimed_role に正しいロールがセットされること。
        """
        seer = make_test_actor("Seer1", "Seer")
        assert seer.state.claimed_role is None
        engine, _ = make_test_engine([seer])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, CoResult(thought="CO now", speech="I am the Seer!", claim_role=seer.role)),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert isinstance(seer.state.claimed_role, Seer)

    def test_speak_result_does_not_set_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: call_discussion_parallel returns SpeakResult (no co)
        Level: unit
        Objective: SpeakResult では claimed_role が変わらないこと。
        """
        seer = make_test_actor("Seer1", "Seer")
        engine, _ = make_test_engine([seer])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, SpeakResult(thought="t", speech="Just speaking.")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert seer.state.claimed_role is None

    def test_silent_result_emits_silent_speech_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SilentResult
        Mock: call_discussion_parallel returns SilentResult
        Level: unit
        Objective: SilentResult のとき is_public な SPEECH イベントが「silently watching」内容で emit されること。
        """
        villager = make_test_actor("V1", "Villager")
        engine, events = make_test_engine([villager])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (villager, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        silent_events = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.is_public and "silently" in e.content
        ]
        assert len(silent_events) >= 1

    def test_fake_co_wolf_sets_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with CoResult (wolf fake CO)
        Mock: call_discussion_parallel returns CoResult(claim_role=Medium) for wolf
        Level: unit
        Objective: 狼が CoResult で Medium を詐称したとき claimed_role に Medium がセットされること。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, _ = make_test_engine([wolf])

        from src.domain.roles import get_role
        medium_role = get_role("Medium")

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (wolf, CoResult(thought="fake", speech="I am the Medium.", claim_role=medium_role)),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert wolf.state.claimed_role.name == "Medium"


class TestVoteOutputFlow:
    """#216 — dedicated VoteOutput from call_vote_parallel flows into VOTE LogEvent."""

    def test_wolf_side_strategy_recorded_in_vote_event(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote
        Mock: call_vote_parallel returns VoteOutput with strategy="wolf_side"
        Level: unit
        Objective: 狼が VoteOutput.strategy="wolf_side" を返したとき、その値が VOTE LogEvent の decision に記録されること。reasoning は VoteOutput.reasoning から取り、AgentOutput.reasoning は流用しないこと。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        seer = make_test_actor("Seer1", "Seer")
        engine, events = make_test_engine([wolf, seer])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"Wolf1": "Seer1", "Seer1": "Wolf1"},
            reasonings={"Wolf1": "Seer1 should be eliminated."},
            strategies={"Wolf1": "wolf_side"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        vote_events = [e for e in events if e.event_type == EventType.VOTE and e.agent == "Wolf1"]
        assert len(vote_events) == 1
        assert vote_events[0].decision == "wolf_side"
        assert vote_events[0].reasoning == "Seer1 should be eliminated."
        assert vote_events[0].target == "Seer1"

    def test_villager_vote_has_no_strategy(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote
        Mock: call_vote_parallel returns VoteOutput with strategy=None
        Level: unit
        Objective: 村人エージェントの VOTE LogEvent には decision（strategy）が空文字で入ること（村人プロンプトは strategy を出力しない）。
        """
        villager = make_test_actor("V1", "Villager")
        target = make_test_actor("V2", "Villager")
        engine, events = make_test_engine([villager, target])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"V1": "V2", "V2": "V1"},
            reasonings={"V1": "suspicion"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        vote_events = [e for e in events if e.event_type == EventType.VOTE and e.agent == "V1"]
        assert len(vote_events) == 1
        assert vote_events[0].decision == ""

    def test_village_side_allows_voting_for_wolf_partner(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote
        Mock: call_vote_parallel returns VoteOutput targeting wolf partner with strategy="village_side"
        Level: unit
        Objective: 狼が VoteOutput.strategy="village_side" で仲間（別の狼）を投票先に指定したとき、そのままその仲間に投票できること（ライン切り戦略）。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        engine, events = make_test_engine([wolf1, wolf2])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"Wolf1": "Wolf2", "Wolf2": "Wolf1"},
            reasonings={"Wolf1": "line-cutting"},
            strategies={"Wolf1": "village_side"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        wolf1_votes = [e for e in events if e.event_type == EventType.VOTE and e.agent == "Wolf1"]
        assert len(wolf1_votes) == 1
        assert wolf1_votes[0].target == "Wolf2"
        assert wolf1_votes[0].decision == "village_side"

    def test_vote_event_reasoning_comes_from_vote_output_not_speech(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote
        Mock: call_speech_parallel emits AgentOutput with reasoning="speech-side"; call_vote_parallel emits VoteOutput with reasoning="vote-side"
        Level: unit
        Objective: ⚠️unit test mandatory — VOTE LogEvent の reasoning が VoteOutput.reasoning から取られ、AgentOutput.reasoning（発言用）は流用されないこと（AC）。
        """
        a = make_test_actor("A")
        b = make_test_actor("B")
        engine, events = make_test_engine([a, b])

        speech_output = AgentOutput(
            thought="t",
            speech="s",
            reasoning="speech-side reasoning that must NOT leak into the vote event",
            intent=Intent(),
            memory_update=[],
        )

        def speech_side_effect(calls):
            return iter([(actor, speech_output) for actor, *_ in calls])

        engine._llm_client.call_speech_parallel.side_effect = speech_side_effect
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"A": "B", "B": "A"},
            reasonings={"A": "vote-side reasoning"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        a_votes = [e for e in events if e.event_type == EventType.VOTE and e.agent == "A"]
        assert len(a_votes) == 1
        assert a_votes[0].reasoning == "vote-side reasoning"
        assert "speech-side" not in a_votes[0].reasoning

    def test_invalid_target_falls_back_to_first_other(self, make_test_actor, make_test_engine):
        """
        SUT: _run_vote
        Mock: call_vote_parallel returns VoteOutput with unknown target
        Level: unit
        Objective: VoteOutput.target が生存者でない場合、最初の他者へフォールバックして投票が記録されること。
        """
        a = make_test_actor("A")
        b = make_test_actor("B")
        engine, events = make_test_engine([a, b])

        engine._llm_client.call_speech_parallel.side_effect = make_speech_parallel_side_effect()
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"A": "Ghost", "B": "A"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        a_votes = [e for e in events if e.event_type == EventType.VOTE and e.agent == "A"]
        assert len(a_votes) == 1
        assert a_votes[0].target == "B"


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

    def test_apply_speech_output_threat_scores_updates_state_and_emits_event(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_speech_output()
        Mock: monkeypatch で store.save を no-op に差し替え（make_test_engine 経由）
        Level: unit
        Objective: AgentOutput.threat_scores が非 None のとき actor.state.threat_scores が
                   更新され THREAT_UPDATE イベントが emit されること。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        output = AgentOutput(
            thought="thinking",
            speech="Hello.",
            reasoning="reasoning",
            intent=Intent(),
            threat_scores={"Alice": 0.85},
        )

        with patch("src.agent.store.save"):
            engine._apply_speech_output(wolf, output, Phase.DAY_OPENING)

        assert wolf.state.threat_scores["Alice"] == pytest.approx(0.85)
        threat_events = [e for e in events if e.event_type == EventType.THREAT_UPDATE]
        assert len(threat_events) == 1
        assert "Alice=0.85" in threat_events[0].content
        assert threat_events[0].is_public is False

    def test_apply_speech_output_no_threat_scores_emits_no_threat_event(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: GameEngine._apply_speech_output()
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: AgentOutput.threat_scores が None のとき THREAT_UPDATE イベントが
                   emit されないこと。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        output = AgentOutput(
            thought="thinking",
            speech="Hello.",
            reasoning="reasoning",
            intent=Intent(),
            threat_scores=None,
        )

        with patch("src.agent.store.save"):
            engine._apply_speech_output(wolf, output, Phase.DAY_OPENING)

        assert not any(e.event_type == EventType.THREAT_UPDATE for e in events)

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


class TestApplyDiscussionResult:
    """Tests for GameEngine._apply_discussion_result."""

    def test_suspicion_scores_update_state_and_emit_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.suspicion_scores が非 None のとき beliefs が更新され
                   SUSPICION_UPDATE イベントが emit されること。
        """
        actor = make_test_actor("Alice")
        target = make_test_actor("Bob")
        engine, events = make_test_engine([actor, target])

        result = SpeakResult(
            thought="thinking",
            speech="I suspect Bob.",
            suspicion_scores={"Bob": 0.8},
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        assert actor.state.beliefs["Bob"].suspicion == pytest.approx(0.8)
        suspicion_events = [e for e in events if e.event_type == EventType.SUSPICION_UPDATE]
        assert len(suspicion_events) == 1
        assert "Bob=0.80" in suspicion_events[0].content
        assert suspicion_events[0].is_public is False

    def test_threat_scores_update_state_and_emit_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.threat_scores が非 None のとき threat_scores が更新され
                   THREAT_UPDATE イベントが emit されること。
        """
        wolf = make_test_actor("Wolf", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, villager])

        result = SpeakResult(
            thought="thinking",
            speech="Hello.",
            threat_scores={"Alice": 0.9},
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(wolf, result, Phase.DAY_DISCUSSION)

        assert wolf.state.threat_scores["Alice"] == pytest.approx(0.9)
        threat_events = [e for e in events if e.event_type == EventType.THREAT_UPDATE]
        assert len(threat_events) == 1
        assert "Alice=0.90" in threat_events[0].content
        assert threat_events[0].is_public is False

    def test_memory_update_is_applied(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result with SpeakResult
        Mock: patch で store.save を no-op に差し替え
        Level: unit
        Objective: SpeakResult.memory_update が非空のとき actor.state.memory_summary に追記されること。
        """
        actor = make_test_actor("Alice")
        engine, _ = make_test_engine([actor])

        result = SpeakResult(
            thought="t",
            speech="s",
            memory_update=["Bob acted suspiciously on Day1"],
        )

        with patch("src.agent.store.save"):
            engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)

        assert any("Bob acted suspiciously" in m for m in actor.state.memory_summary)

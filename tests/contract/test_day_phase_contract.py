"""Contract tests for day-phase orchestration and event/data-flow boundaries."""

from unittest.mock import patch

from src.domain.event import EventType
from src.domain.roles import Seer, get_role
from src.domain.schema import ChallengeResult, CoResult, SilentResult, SpeakResult
from src.engine.phase import Phase
from src.llm.prompt import PublicContext, WolfSpecificContext
from tests.conftest import make_silent_discussion_side_effect, make_vote_parallel_side_effect


class TestRunDayPhaseContract:
    def test_opening_then_discussion_then_vote(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns SilentResult for each actor
        Level: contract
        Architecture ref: doc/Architecture.md §3.1, §3.3, ADR-004
        Objective: DAY_DISCUSSION が DAY_VOTE より先に開始される昼フェーズの順序契約を検証する。
        """
        agents = [make_test_actor("A"), make_test_actor("B"), make_test_actor("C", "Werewolf")]
        engine, events = make_test_engine(agents)
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()

        with patch("src.agent.store.save"):
            engine._run_day()

        phase_starts = [e for e in events if e.event_type == EventType.PHASE_START]
        phases = [e.phase for e in phase_starts]
        assert Phase.DAY_DISCUSSION.value in phases
        assert Phase.DAY_VOTE.value in phases
        assert phases.index(Phase.DAY_DISCUSSION.value) < phases.index(Phase.DAY_VOTE.value)

    def test_speech_ids_are_sequential(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns SilentResult for each actor
        Level: contract
        Architecture ref: doc/Architecture.md §3.3, ADR-004
        Objective: engine から LogEvent へ流れる speech_id が連番で採番される契約を検証する。
        """
        agents = [make_test_actor("A"), make_test_actor("B")]
        engine, events = make_test_engine(agents)
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
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns SpeakResult then ChallengeResult(reply_to=1)
        Level: contract
        Architecture ref: doc/Architecture.md §3.3, ADR-004
        Objective: AgentOutput.reply_to が公開 LogEvent.reply_to に到達するデータフロー契約を検証する。
        """
        actors_list = [make_test_actor("A"), make_test_actor("B")]
        engine, events = make_test_engine(actors_list)
        call_count = [0]

        def discussion_with_challenge(actors, *_, **__):
            call_count[0] += 1
            if call_count[0] == 1:
                return iter([
                    (actors_list[0], SpeakResult(thought="t", speech="Hello")),
                    (actors_list[1], SilentResult(reasoning="quiet")),
                ])
            return iter([
                (actors_list[0], SilentResult(reasoning="quiet")),
                (actors_list[1], ChallengeResult(thought="t", speech="I disagree!", reply_to=1)),
            ])

        engine._llm_client.call_discussion_parallel.side_effect = discussion_with_challenge

        with (
            patch("src.engine.phase_day.DISCUSSION_ROUNDS", 2),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        challenge_events = [e for e in events if e.reply_to is not None and e.is_public]
        assert len(challenge_events) == 1
        assert all(e.reply_to == 1 for e in challenge_events)

    def test_all_silent_does_not_raise(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns SilentResult for each actor
        Level: contract
        Architecture ref: doc/Architecture.md §3.1, ADR-004
        Objective: 全員が silent を選んでも engine 全体が winner 判定まで安全に進行する契約を検証する。
        """
        agents = [make_test_actor("A"), make_test_actor("B", "Werewolf")]
        engine, _ = make_test_engine(agents)
        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()

        with patch("src.agent.store.save"):
            result = engine._run_day()

        assert result in (None, "Werewolves", "Villagers")


class TestDiscussionCoDecisionContract:
    def test_co_result_sets_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns CoResult(claim_role=Seer)
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: CoResult が返ったとき claimed_role ライフサイクルが public state に反映されることを検証する。
        """
        seer = make_test_actor("Seer1", "Seer")
        other = make_test_actor("V1")
        assert seer.state.claimed_role is None
        engine, _ = make_test_engine([seer, other])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (seer, CoResult(thought="CO now", speech="I am the Seer!", claim_role=seer.role)),
            (other, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert isinstance(seer.state.claimed_role, Seer)

    def test_fake_co_wolf_sets_claimed_role(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_discussion_parallel returns CoResult(claim_role=Medium) for a werewolf
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: 狼の fake CO が claimed_role に反映されるライフサイクル契約を検証する。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        other = make_test_actor("V1")
        engine, _ = make_test_engine([wolf, other])
        medium_role = get_role("Medium")

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (wolf, CoResult(thought="fake", speech="I am the Medium.", claim_role=medium_role)),
            (other, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert wolf.state.claimed_role.name == "Medium"

    def test_speech_events_keep_claimed_role_after_co(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: call_discussion_parallel returns CoResult then SpeakResult for the same actor
        Level: contract
        Architecture ref: doc/Architecture.md §2.4, §3.2
        Objective: CO 発言以降の SPEECH イベントすべてに actor.state.claimed_role が添付されることを検証する。
        """
        seer = make_test_actor("Seer1", "Seer")
        other = make_test_actor("V1")
        engine, events = make_test_engine([seer, other])
        call_count = [0]

        def discussion_with_followup(_actors, *_, **__):
            call_count[0] += 1
            if call_count[0] == 1:
                return iter([
                    (seer, CoResult(thought="CO now", speech="I am the Seer!", claim_role=seer.role)),
                    (other, SilentResult(reasoning="nothing")),
                ])
            return iter([
                (seer, SpeakResult(thought="followup", speech="My result still matters.")),
                (other, SilentResult(reasoning="nothing")),
            ])

        engine._llm_client.call_discussion_parallel.side_effect = discussion_with_followup

        with (
            patch("src.engine.phase_day.DISCUSSION_ROUNDS", 2),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        seer_speeches = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.agent == "Seer1" and e.speech_id is not None
        ]
        assert [e.claimed_role.name for e in seer_speeches] == ["Seer", "Seer"]
        assert [e.decision for e in seer_speeches] == ["co", ""]

    def test_repeated_co_speech_keeps_co_decision(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: call_discussion_parallel returns CoResult twice for the same actor
        Level: contract
        Architecture ref: doc/Architecture.md §2.4, §3.2
        Objective: 同じエージェントの二回目以降の CO 発言も decision="co" として emit されることを検証する。
        """
        seer = make_test_actor("Seer1", "Seer")
        other = make_test_actor("V1")
        engine, events = make_test_engine([seer, other])
        call_count = [0]

        def repeated_co(_actors, *_, **__):
            call_count[0] += 1
            return iter([
                (seer, CoResult(thought=f"CO {call_count[0]}", speech="I am the Seer!", claim_role=seer.role)),
                (other, SilentResult(reasoning="nothing")),
            ])

        engine._llm_client.call_discussion_parallel.side_effect = repeated_co

        with (
            patch("src.engine.phase_day.DISCUSSION_ROUNDS", 2),
            patch("src.agent.store.save"),
        ):
            engine._run_day()

        seer_speeches = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.agent == "Seer1" and e.speech_id is not None
        ]
        assert [e.claimed_role.name for e in seer_speeches] == ["Seer", "Seer"]
        assert [e.decision for e in seer_speeches] == ["co", "co"]

    def test_unclaimed_speech_event_keeps_claimed_role_none(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: call_discussion_parallel returns SpeakResult for an unclaimed actor
        Level: contract
        Architecture ref: doc/Architecture.md §2.4, §3.2
        Objective: 未COエージェントの SPEECH イベントは claimed_role=None のまま emit されることを検証する。
        """
        actor = make_test_actor("Alice")
        other = make_test_actor("Bob")
        engine, events = make_test_engine([actor, other])

        engine._llm_client.call_discussion_parallel.side_effect = lambda _actors, *_, **__: iter([
            (actor, SpeakResult(thought="t", speech="I have no claim.")),
            (other, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        speech_events = [
            e for e in events
            if e.event_type == EventType.SPEECH and e.agent == "Alice" and e.speech_id is not None
        ]
        assert len(speech_events) >= 1
        assert all(e.claimed_role is None for e in speech_events)


class TestVoteOutputFlowContract:
    def test_wolf_side_strategy_recorded_in_vote_event(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_vote_parallel returns VoteOutput(strategy="wolf_side")
        Level: contract
        Architecture ref: doc/Architecture.md §3.3
        Objective: VoteOutput.strategy と reasoning が VOTE LogEvent へ到達する契約を検証する。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        seer = make_test_actor("Seer1", "Seer")
        engine, events = make_test_engine([wolf, seer])

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
        assert vote_events[0].vote_strategy == "wolf_side"
        assert vote_events[0].decision == ""
        assert vote_events[0].reasoning == "Seer1 should be eliminated."
        assert vote_events[0].target == "Seer1"

    def test_villager_vote_has_no_strategy(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_vote_parallel returns VoteOutput(strategy=None)
        Level: contract
        Architecture ref: doc/Architecture.md §3.3
        Objective: 村人の VoteOutput が strategy なしで VOTE LogEvent へ流れる契約を検証する。
        """
        villager = make_test_actor("V1", "Villager")
        target = make_test_actor("V2", "Villager")
        engine, events = make_test_engine([villager, target])

        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"V1": "V2", "V2": "V1"},
            reasonings={"V1": "suspicion"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        vote_events = [e for e in events if e.event_type == EventType.VOTE and e.agent == "V1"]
        assert len(vote_events) == 1
        assert vote_events[0].vote_strategy == ""

    def test_vote_event_reasoning_comes_from_vote_output(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_vote_parallel returns VoteOutput(reasoning="vote-side reasoning")
        Level: contract
        Architecture ref: doc/Architecture.md §3.3
        Objective: VOTE LogEvent.reasoning が VoteOutput.reasoning から流入する契約を検証する。
        """
        a = make_test_actor("A")
        b = make_test_actor("B")
        engine, events = make_test_engine([a, b])

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

    def test_invalid_target_falls_back_to_first_other(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_day()
        Mock: call_vote_parallel returns VoteOutput(target="Ghost")
        Level: contract
        Architecture ref: doc/Architecture.md §3.1, §3.3
        Objective: 無効な投票先が engine 側で最初の他者へ正規化される契約を検証する。
        """
        a = make_test_actor("A")
        b = make_test_actor("B")
        engine, events = make_test_engine([a, b])

        engine._llm_client.call_discussion_parallel.side_effect = make_silent_discussion_side_effect()
        engine._llm_client.call_vote_parallel.side_effect = make_vote_parallel_side_effect(
            targets={"A": "Ghost", "B": "A"},
        )

        with patch("src.agent.store.save"):
            engine._run_day()

        a_votes = [e for e in events if e.event_type == EventType.VOTE and e.agent == "A"]
        assert len(a_votes) == 1
        assert a_votes[0].target == "B"


class TestIntendedCoLifecycleContract:
    def test_intended_co_included_in_discussion_prompt(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: 夜にセットされた intended_co が翌日 DISCUSSION フェーズの LLM プロンプトに含まれる契約を検証する。
        """
        from src.llm.prompt import build_discussion_system_prompt

        wolf = make_test_actor("Wolf1", "Werewolf")
        seer_role = get_role("Seer")
        wolf.state.intended_co = seer_role

        ctx = PublicContext(
            today_log=[],
            alive_players=["Wolf1", "Alice"],
            dead_players=[],
            day=2,
        )
        role_ctx = WolfSpecificContext(wolf_partners=[])
        prompt = build_discussion_system_prompt(wolf, ctx, co_eligible=True, lang="English", role_ctx=role_ctx)

        assert "planned to fake" in prompt.lower() or "fake-co as seer" in prompt.lower() or "planned to" in prompt.lower()
        assert wolf.state.intended_co is not None  # intended_co はプロンプト生成では消えない

    def test_intended_co_absent_from_prompt_when_none(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: intended_co が None のとき偽CO指示がプロンプトに混入しない契約を検証する。
        """
        from src.llm.prompt import build_discussion_system_prompt

        villager = make_test_actor("Alice", "Villager")
        assert villager.state.intended_co is None

        ctx = PublicContext(
            today_log=[],
            alive_players=["Alice", "Wolf1"],
            dead_players=[],
            day=2,
        )
        prompt = build_discussion_system_prompt(villager, ctx, co_eligible=False, lang="English")

        assert "fake" not in prompt.lower()
        assert "planned to" not in prompt.lower()

    def test_intended_co_cleared_after_co_result(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: call_discussion_parallel returns CoResult for wolf
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: CoResult が返ったあと intended_co がクリアされる（夜セット→昼DISCUSSION参照→クリア）ライフサイクル契約を検証する。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Alice")
        seer_role = get_role("Seer")
        wolf.state.intended_co = seer_role

        engine, _ = make_test_engine([wolf, villager])
        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (wolf, CoResult(thought="fake CO", speech="I am the Seer!", claim_role=seer_role)),
            (villager, SilentResult(reasoning="nothing")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        assert wolf.state.intended_co is None
        assert wolf.state.claimed_role is not None
        assert wolf.state.claimed_role.name == "Seer"


class TestSpeechThinkHackContract:
    def test_speech_thought_in_reasoning_field(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._apply_discussion_result()
        Mock: call_discussion_parallel returns SpeakResult with a specific thought
        Level: contract
        Objective: speech の thought が SPEECH イベントの reasoning フィールドに格納され、
                   speech ごとに1つの公開イベントのみ emit される契約を検証する（新スキーマ）。
        """
        actor = make_test_actor("Alice")
        other = make_test_actor("Bob")
        engine, emitted = make_test_engine([actor, other])

        engine._llm_client.call_discussion_parallel.side_effect = lambda actors, *_, **__: iter([
            (actor, SpeakResult(thought="inner monologue", speech="Hello everyone")),
            (other, SilentResult(reasoning="quiet")),
        ])

        with patch("src.agent.store.save"):
            engine._run_day()

        speech_events = [
            e for e in emitted
            if e.event_type == EventType.SPEECH and e.agent == "Alice" and e.is_public
        ]
        assert len(speech_events) >= 1
        assert all(e.reasoning == "inner monologue" for e in speech_events)

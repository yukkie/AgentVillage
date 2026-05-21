"""Contract tests for night-phase orchestration and state lifecycle boundaries."""

from unittest.mock import patch

from src.domain.event import EventType
from tests.conftest import make_night_action_side_effect


class TestRunNightPhaseOrderContract:
    def test_declarations_finish_before_resolution(self, make_test_actor, make_test_engine):
        """
        SUT: GameEngine._run_night()
        Mock: call_night_action returns deterministic targets; resolve_inspect is patched to record order
        Level: contract
        Architecture ref: doc/Architecture.md §3.1
        Objective: 夜フェーズが宣言完了後に解決へ進む順序契約を検証する。
        """
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

        def apply_attack_and_record(*args, **kwargs):
            order.append("resolve:attack")
            return True

        with (
            patch("src.agent.store.save"),
            patch("src.engine.phase_night.resolve_inspect") as mock_resolve_inspect,
            patch(
                "src.engine.phase_night._apply_night_attack_death",
                side_effect=apply_attack_and_record,
            ),
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
        """
        SUT: GameEngine._run_night()
        Mock: call_night_action returns attack-on-seer plus inspection target
        Level: contract
        Architecture ref: doc/Architecture.md §3.1
        Objective: 占い師が夜に死亡した場合は inspection 結果が LogEvent に公開されない契約を検証する。
        """
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
        """
        SUT: GameEngine._run_night()
        Mock: call_night_action returns attack on villager and inspection on wolf
        Level: contract
        Architecture ref: doc/Architecture.md §3.1
        Objective: 占い師が生存した場合は inspection 結果が belief と LogEvent に到達する契約を検証する。
        """
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


class TestWolfChatContract:
    def test_wolf_chat_sets_intended_co_from_self_decision(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat()
        Mock: call_wolf_chat returns WolfChatOutput with self_co_decision for each wolf
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: WolfChatOutput.self_co_decision が intended_co ライフサイクルへ反映される契約を検証する。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        def wolf_chat_with_self_decision(actor, partners, alive, log, lang):
            from src.domain.schema import WolfChatOutput

            return WolfChatOutput.model_validate(
                {
                    "thought": "thinking",
                    "speech": "...",
                    "attack_candidates": {"Alice": 0.7},
                    "self_co_decision": {
                        "claim_role": "Seer" if actor.name == "Wolf1" else "Medium",
                        "timing": "next_day",
                    },
                }
            )

        with patch("src.engine.phase_night.store.save"):
            engine._llm_client.call_wolf_chat.side_effect = wolf_chat_with_self_decision
            from src.engine.phase_night import _run_wolf_chat

            _run_wolf_chat(engine)

        assert wolf1.state.intended_co is not None
        assert wolf1.state.intended_co.name == "Seer"
        assert wolf2.state.intended_co is not None
        assert wolf2.state.intended_co.name == "Medium"

    def test_wolf_chat_wait_plan_clears_intended_co(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat()
        Mock: call_wolf_chat returns wait self_co_decision
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: wait 計画が intended_co をクリアするライフサイクル契約を検証する。
        """
        from src.domain.schema import WolfChatOutput
        from src.engine.phase_night import _run_wolf_chat

        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        wolf1.state.intended_co = wolf1.role.default_claim_role
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        engine._llm_client.call_wolf_chat.return_value = WolfChatOutput.model_validate(
            {
                "thought": "thinking",
                "speech": "...",
                "attack_candidates": {"Alice": 0.7},
                "self_co_decision": {"claim_role": None, "timing": "wait"},
            }
        )

        with patch("src.engine.phase_night.store.save"):
            _run_wolf_chat(engine)

        assert wolf1.state.intended_co is None
        assert wolf2.state.intended_co is None

    def test_wolf_chat_allows_different_personal_decisions(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat()
        Mock: call_wolf_chat returns different self_co_decision per werewolf
        Level: contract
        Architecture ref: doc/Architecture.md §3.2
        Objective: 狼ごとに異なる self_co_decision が独立して intended_co に反映される契約を検証する。
        """
        from src.domain.schema import WolfChatOutput
        from src.engine.phase_night import _run_wolf_chat

        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        def wolf_chat_team_plan(actor, partners, alive, log, lang):
            if actor.name == "Wolf1":
                return WolfChatOutput.model_validate(
                    {
                        "thought": "thinking",
                        "speech": "You fake-CO Medium, I will fake-CO Seer.",
                        "attack_candidates": {"Alice": 0.7},
                        "self_co_decision": {"claim_role": "Seer", "timing": "next_day"},
                    }
                )
            return WolfChatOutput.model_validate(
                {
                    "thought": "thinking",
                    "speech": "I disagree, I will wait.",
                    "attack_candidates": {"Alice": 0.7},
                    "self_co_decision": {"claim_role": None, "timing": "wait"},
                }
            )

        with patch("src.engine.phase_night.store.save"):
            engine._llm_client.call_wolf_chat.side_effect = wolf_chat_team_plan
            _run_wolf_chat(engine)

        assert wolf1.state.intended_co is not None
        assert wolf1.state.intended_co.name == "Seer"
        assert wolf2.state.intended_co is None

    def test_wolf_chat_emits_thought_as_non_public_event(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat()
        Mock: call_wolf_chat returns WolfChatOutput with a specific thought string
        Level: contract
        Objective: wolf chat の thought が is_public=False の WOLF_CHAT イベントとして emit される契約を検証する。
        """
        from src.domain.schema import WolfChatOutput
        from src.engine.phase_night import _run_wolf_chat

        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, emitted = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        engine._llm_client.call_wolf_chat.return_value = WolfChatOutput(
            thought="secret plan",
            speech="let's attack Alice",
            attack_candidates={"Alice": 0.9},
        )

        with patch("src.engine.phase_night.store.save"):
            _run_wolf_chat(engine)

        thought_events = [
            e for e in emitted
            if not e.is_public and "[THINK]" in e.content and e.event_type == EventType.WOLF_CHAT
        ]
        assert len(thought_events) == 2  # one per wolf
        assert all("secret plan" in e.content for e in thought_events)

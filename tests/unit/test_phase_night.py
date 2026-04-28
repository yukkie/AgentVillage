"""
SUT: src/engine/phase_night — _run_wolf_chat, _resolve_night_outcomes, _publish_night_results,
     _publish_inspection, and the guard/guard-block/inspection branches not covered by
     test_game_day_loop.py.
"""
from unittest.mock import patch

from src.domain.event import EventType
from src.domain.schema import VoteCandidate, WolfChatOutput
from src.engine.phase_night import (
    AttackDeclaration,
    GuardDeclaration,
    InspectDeclaration,
    InspectionResult,
    NightDeclarations,
    NightResolution,
    _publish_inspection,
    _publish_night_results,
    _resolve_night_outcomes,
    _run_wolf_chat,
)


class TestRunWolfChat:
    def test_single_wolf_skips_chat(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client (MagicMock via make_test_engine)
        Level: unit
        Objective: 狼が1体のとき wolf-chat をスキップして None を返すこと。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf, villager])

        result = _run_wolf_chat(engine)

        assert result is None
        engine._llm_client.call_wolf_chat.assert_not_called()

    def test_multi_wolf_chat_returns_top_scored_target(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client.call_wolf_chat — WolfChatOutputを返す
        Level: unit
        Objective: 2体の狼が vote_candidates のスコアを合算し、最高スコアの攻撃対象名を返すこと。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        def wolf_chat_side_effect(actor, partners, alive, log, lang):
            return WolfChatOutput(
                thought="thinking",
                speech=f"{actor.name} says attack Alice",
                vote_candidates=[VoteCandidate(target="Alice", score=0.8)],
            )

        engine._llm_client.call_wolf_chat.side_effect = wolf_chat_side_effect

        result = _run_wolf_chat(engine)

        assert result == "Alice"
        wolf_chat_events = [e for e in events if e.event_type == EventType.WOLF_CHAT]
        assert len(wolf_chat_events) == 2  # one per wolf per round

    def test_multi_wolf_chat_empty_candidates_returns_none(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client.call_wolf_chat — 空の vote_candidates を返す
        Level: unit
        Objective: 全ての狼が vote_candidates を返さないとき None を返すこと。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        engine._llm_client.call_wolf_chat.return_value = WolfChatOutput(
            thought="thinking",
            speech="...",
            vote_candidates=[],
        )

        result = _run_wolf_chat(engine)

        assert result is None

    def test_multi_wolf_chat_wolf_target_excluded(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client.call_wolf_chat — 仲間の狼を vote 対象にする
        Level: unit
        Objective: 狼仲間への vote はスコア集計から除外され、他の有効な候補が選ばれること。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        def wolf_chat_side_effect(actor, partners, alive, log, lang):
            return WolfChatOutput(
                thought="thinking",
                speech="...",
                vote_candidates=[
                    VoteCandidate(target="Wolf2", score=0.9),  # own pack — must be excluded
                    VoteCandidate(target="Alice", score=0.5),
                ],
            )

        engine._llm_client.call_wolf_chat.side_effect = wolf_chat_side_effect

        result = _run_wolf_chat(engine)

        assert result == "Alice"


class TestResolveNightOutcomes:
    def test_guard_blocks_attack_sets_succeeded(self, make_test_actor, make_test_engine):
        """
        SUT: _resolve_night_outcomes
        Mock: engine._llm_client (MagicMock via make_test_engine)
        Level: unit
        Objective: 騎士のガード対象と攻撃対象が一致するとき guard.succeeded=True になり _eliminate が呼ばれないこと。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf, knight, villager])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Alice")
        declarations = NightDeclarations(attack=attack, guard=guard, inspect=None)

        resolution = _resolve_night_outcomes(engine, declarations)

        assert resolution.guard is not None
        assert resolution.guard.succeeded is True
        assert villager.is_alive is True

    def test_guard_different_target_does_not_block(self, make_test_actor, make_test_engine):
        """
        SUT: _resolve_night_outcomes
        Mock: engine._llm_client (MagicMock via make_test_engine)
        Level: unit
        Objective: 騎士のガード対象と攻撃対象が異なるとき攻撃対象が排除されること。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        alice = make_test_actor("Alice")
        bob = make_test_actor("Bob")
        engine, _ = make_test_engine([wolf, knight, alice, bob])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Bob")
        declarations = NightDeclarations(attack=attack, guard=guard, inspect=None)

        resolution = _resolve_night_outcomes(engine, declarations)

        assert resolution.guard is not None
        assert resolution.guard.succeeded is False
        assert alice.is_alive is False

    def test_no_attack_declaration_skips_eliminate(self, make_test_actor, make_test_engine):
        """
        SUT: _resolve_night_outcomes
        Mock: engine._llm_client (MagicMock via make_test_engine)
        Level: unit
        Objective: 攻撃宣言がない（attack=None）とき誰も排除されないこと。
        """
        knight = make_test_actor("Knight1", "Knight")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([knight, villager])

        declarations = NightDeclarations(attack=None, guard=None, inspect=None)

        resolution = _resolve_night_outcomes(engine, declarations)

        assert resolution.attack is None
        assert villager.is_alive is True


class TestPublishNightResults:
    def test_guard_block_emits_private_and_public_events(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: memory_mod.update_memory — メモリ更新のファイルI/Oを回避
        Level: unit
        Objective: ガードブロック成功時に非公開と公開の GUARD_BLOCK イベントが各1件 emit されること。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        alice = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, knight, alice])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Alice", succeeded=True)
        resolution = NightResolution(attack=attack, guard=guard, inspection=None)

        with patch("src.engine.phase_night.memory_mod.update_memory"):
            _publish_night_results(engine, resolution)

        guard_block_events = [e for e in events if e.event_type == EventType.GUARD_BLOCK]
        assert len(guard_block_events) == 2
        private_events = [e for e in guard_block_events if not e.is_public]
        public_events = [e for e in guard_block_events if e.is_public]
        assert len(private_events) == 1
        assert len(public_events) == 1

    def test_guard_block_updates_knight_memory(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: memory_mod.update_memory — 呼び出しをキャプチャ
        Level: unit
        Objective: ガードブロック成功時に騎士のメモリが update_memory で更新されること。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        alice = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf, knight, alice])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Alice", succeeded=True)
        resolution = NightResolution(attack=attack, guard=guard, inspection=None)

        with patch("src.engine.phase_night.memory_mod.update_memory") as mock_update:
            _publish_night_results(engine, resolution)

        mock_update.assert_called_once()
        call_args = mock_update.call_args
        assert call_args[0][0] is knight
        assert "Alice" in call_args[0][1][0]

    def test_guard_not_succeeded_emits_no_guard_block(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: なし
        Level: unit
        Objective: ガードが失敗（succeeded=False）のとき GUARD_BLOCK イベントが emit されないこと。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        alice = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, knight, alice])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Bob", succeeded=False)
        resolution = NightResolution(attack=attack, guard=guard, inspection=None)

        _publish_night_results(engine, resolution)

        assert not any(e.event_type == EventType.GUARD_BLOCK for e in events)


class TestGuardReasoning:
    def test_guard_reasoning_stored_in_log_event(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: なし
        Level: unit
        Objective: GuardDeclaration.reasoning が GUARD LogEvent の reasoning フィールドに渡ること
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        alice = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, knight, alice])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Alice", succeeded=False, reasoning="Alice is the Seer candidate.")
        resolution = NightResolution(attack=attack, guard=guard, inspection=None)

        _publish_night_results(engine, resolution)

        guard_events = [e for e in events if e.event_type == EventType.GUARD]
        assert len(guard_events) == 1
        assert guard_events[0].reasoning == "Alice is the Seer candidate."


class TestPublishInspection:
    def test_inspect_werewolf_sets_suspicion_max(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: Seer が Werewolf を占ったとき suspicion=1.0, trust=0.0 がセットされ INSPECTION イベントが emit されること。
        """
        from src.domain.roles import Werewolf as WerewolfRole

        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, events = make_test_engine([seer, wolf])

        wolf_role_instance = wolf.role
        assert isinstance(wolf_role_instance, WerewolfRole)

        declaration = InspectDeclaration(actor=seer, target="Wolf1")
        inspection = InspectionResult(declaration=declaration, result=wolf_role_instance)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        assert seer.state.beliefs["Wolf1"].suspicion == 1.0
        assert seer.state.beliefs["Wolf1"].trust == 0.0
        inspection_events = [e for e in events if e.event_type == EventType.INSPECTION]
        assert len(inspection_events) == 1
        assert inspection_events[0].agent == "Seer1"
        assert inspection_events[0].target == "Wolf1"

    def test_inspect_villager_sets_trust_max(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: Seer が村人を占ったとき suspicion=0.0, trust=1.0 がセットされ INSPECTION イベントが emit されること。
        """
        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([seer, villager])

        declaration = InspectDeclaration(actor=seer, target="Alice")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        assert seer.state.beliefs["Alice"].suspicion == 0.0
        assert seer.state.beliefs["Alice"].trust == 1.0
        inspection_events = [e for e in events if e.event_type == EventType.INSPECTION]
        assert len(inspection_events) == 1
        assert inspection_events[0].agent == "Seer1"
        assert inspection_events[0].target == "Alice"

    def test_inspect_werewolf_sets_inspection_role_field(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: Werewolf を占ったとき INSPECTION イベントの inspection_role.name が "Werewolf" であること。
        """
        from src.domain.roles import Werewolf as WerewolfRole

        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, events = make_test_engine([seer, wolf])

        wolf_role_instance = wolf.role
        assert isinstance(wolf_role_instance, WerewolfRole)

        declaration = InspectDeclaration(actor=seer, target="Wolf1")
        inspection = InspectionResult(declaration=declaration, result=wolf_role_instance)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        ev = next(e for e in events if e.event_type == EventType.INSPECTION)
        assert ev.inspection_role is not None
        assert ev.inspection_role.name == "Werewolf"

    def test_inspect_non_werewolf_sets_inspection_role_villager(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: 村人を占ったとき INSPECTION イベントの inspection_role.name が "Villager" であること。
        """
        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([seer, villager])

        declaration = InspectDeclaration(actor=seer, target="Alice")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        ev = next(e for e in events if e.event_type == EventType.INSPECTION)
        assert ev.inspection_role is not None
        assert ev.inspection_role.name == "Villager"

    def test_inspect_seer_sets_inspection_role_villager(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: Seer（占い師）を占ったとき INSPECTION イベントの inspection_role.name が "Villager" であること。
        """
        seer1 = make_test_actor("Seer1", "Seer")
        seer2 = make_test_actor("Seer2", "Seer")
        engine, events = make_test_engine([seer1, seer2])

        declaration = InspectDeclaration(actor=seer1, target="Seer2")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        ev = next(e for e in events if e.event_type == EventType.INSPECTION)
        assert ev.inspection_role is not None
        assert ev.inspection_role.name == "Villager"

    def test_inspect_content_is_human_readable(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: INSPECTION イベントの content が Python repr ではなく固定文字列であること。
        """
        from src.domain.roles import Werewolf as WerewolfRole

        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, events = make_test_engine([seer, wolf])

        wolf_role_instance = wolf.role
        assert isinstance(wolf_role_instance, WerewolfRole)

        declaration = InspectDeclaration(actor=seer, target="Wolf1")
        inspection = InspectionResult(declaration=declaration, result=wolf_role_instance)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        ev = next(e for e in events if e.event_type == EventType.INSPECTION)
        assert "Werewolf" in ev.content
        assert "<" not in ev.content  # no Python repr like <src.domain.roles.Werewolf object>

    def test_inspect_reasoning_stored_in_log_event(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: InspectDeclaration.reasoning が INSPECTION LogEvent の reasoning フィールドに渡ること
        """
        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([seer, villager])

        declaration = InspectDeclaration(actor=seer, target="Alice", reasoning="Alice seems evasive.")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        ev = next(e for e in events if e.event_type == EventType.INSPECTION)
        assert ev.reasoning == "Alice seems evasive."

    def test_inspect_updates_existing_belief(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: 対象への Belief がすでに存在するとき上書き更新され INSPECTION イベントが1件だけ emit されること。
        """
        from src.domain.actor import Belief

        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([seer, villager])

        seer.state.beliefs["Alice"] = Belief(suspicion=0.5, trust=0.5)

        declaration = InspectDeclaration(actor=seer, target="Alice")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        assert seer.state.beliefs["Alice"].trust == 1.0
        assert len([e for e in events if e.event_type == EventType.INSPECTION]) == 1

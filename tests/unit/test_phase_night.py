"""
SUT: src/engine/phase_night — _run_wolf_chat, _resolve_night_outcomes, _publish_night_results,
     _publish_inspection, and the guard/guard-block/inspection branches not covered by
     test_game_day_loop.py.
"""
from unittest.mock import patch

from src.domain.event import EventType
from src.domain.schema import WolfChatOutput, WolfSelfCoDecision
from src.engine.phase_night import (
    AttackDeclaration,
    GuardDeclaration,
    InspectDeclaration,
    InspectionResult,
    NightDeclarations,
    NightResolution,
    _apply_night_attack_death,
    _apply_wolf_self_decisions,
    _publish_inspection,
    _publish_night_results,
    _resolve_declared_inspection,
    _resolve_night_outcomes,
    _run_wolf_chat,
)
from tests.conftest import make_wolf_chat_side_effect


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
        Objective: 2体の狼が attack_candidates のスコアを合算し、最高スコアの攻撃対象名を返すこと。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        engine._llm_client.call_wolf_chat.side_effect = make_wolf_chat_side_effect(score=0.8)

        result = _run_wolf_chat(engine)

        assert result == "Alice"
        wolf_chat_events = [e for e in events if e.event_type == EventType.WOLF_CHAT]
        assert len(wolf_chat_events) == 2  # one per wolf per round

    def test_multi_wolf_chat_empty_candidates_returns_none(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client.call_wolf_chat — 空の attack_candidates を返す
        Level: unit
        Objective: 全ての狼が attack_candidates を返さないとき None を返すこと。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        engine._llm_client.call_wolf_chat.return_value = WolfChatOutput(
            thought="thinking",
            speech="...",
            attack_candidates={},
        )

        result = _run_wolf_chat(engine)

        assert result is None

    def test_multi_wolf_chat_wolf_target_excluded(self, make_test_actor, make_test_engine):
        """
        SUT: _run_wolf_chat
        Mock: engine._llm_client.call_wolf_chat — 仲間の狼を attack 対象にする
        Level: unit
        Objective: 狼仲間への attack_candidates はスコア集計から除外され、他の有効な候補が選ばれること。
        """
        wolf1 = make_test_actor("Wolf1", "Werewolf")
        wolf2 = make_test_actor("Wolf2", "Werewolf")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf1, wolf2, villager])
        engine._wolf_chat_rounds = 1

        def wolf_chat_with_wolf_target(actor, partners, alive, log, lang):
            return WolfChatOutput(
                thought="thinking",
                speech="...",
                attack_candidates={"Wolf2": 0.9, "Alice": 0.5},
            )

        engine._llm_client.call_wolf_chat.side_effect = wolf_chat_with_wolf_target

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

    def test_apply_night_attack_death_returns_false_for_unknown_target(
        self, make_test_actor, make_test_engine
    ):
        """
        SUT: _apply_night_attack_death
        Mock: なし
        Level: unit
        Objective: 存在しない襲撃対象では死亡状態や死亡履歴を変更せず False を返すこと。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        alice = make_test_actor("Alice")
        engine, _ = make_test_engine([wolf, alice])

        result = _apply_night_attack_death(
            engine,
            AttackDeclaration(actor=wolf, target="Unknown"),
        )

        assert result is False
        assert alice.is_alive is True
        assert engine._past_deaths == []


class TestPublishNightResults:
    def test_guard_block_emits_single_public_event_with_spectator_content(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: memory_mod.update_memory — メモリ更新のファイルI/Oを回避
        Level: unit
        Objective: ガードブロック成功時に is_public=True の GUARD_BLOCK イベントが1件 emit され、
                   spectator_content に観戦者向け詳細が含まれること（新スキーマ）。
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
        assert len(guard_block_events) == 1
        ev = guard_block_events[0]
        assert ev.is_public is True
        assert "Alice" in ev.spectator_content
        assert "Knight" in ev.spectator_content

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

    def test_attack_reasoning_stored_in_night_attack_log_event(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: なし
        Level: unit
        Objective: AttackDeclaration.reasoning が NIGHT_ATTACK LogEvent の reasoning フィールドに渡ること
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        alice = make_test_actor("Alice")
        engine, events = make_test_engine([wolf, alice])

        attack = AttackDeclaration(actor=wolf, target="Alice", reasoning="Alice is likely the Seer.")
        resolution = NightResolution(attack=attack, guard=None, inspection=None)

        _publish_night_results(engine, resolution)

        attack_events = [e for e in events if e.event_type == EventType.NIGHT_ATTACK]
        assert len(attack_events) == 1
        assert attack_events[0].reasoning == "Alice is likely the Seer."

    def test_night_events_are_published_in_resolution_order(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: src.engine.phase_night.store.save — inspection のファイルI/Oを回避
        Level: unit
        Objective: 夜フェーズの観戦者ログが guard → inspection → private attack → public death の順で emit されること。
        """
        wolf = make_test_actor("Wolf1", "Werewolf")
        knight = make_test_actor("Knight1", "Knight")
        seer = make_test_actor("Seer1", "Seer")
        alice = make_test_actor("Alice")
        bob = make_test_actor("Bob")
        engine, events = make_test_engine([wolf, knight, seer, alice, bob])

        attack = AttackDeclaration(actor=wolf, target="Alice")
        guard = GuardDeclaration(actor=knight, target="Bob", succeeded=False)
        inspection = InspectionResult(
            declaration=InspectDeclaration(actor=seer, target="Wolf1"),
            result=wolf.role,
        )
        resolution = NightResolution(
            attack=attack,
            guard=guard,
            inspection=inspection,
            attack_succeeded=True,
        )

        with patch("src.engine.phase_night.store.save"):
            _publish_night_results(engine, resolution)

        night_events = [
            (event.event_type, event.is_public)
            for event in events
            if event.event_type
            in {
                EventType.GUARD,
                EventType.INSPECTION,
                EventType.NIGHT_ATTACK,
                EventType.GUARD_BLOCK,
            }
        ]
        assert night_events == [
            (EventType.GUARD, False),
            (EventType.INSPECTION, False),
            (EventType.NIGHT_ATTACK, False),
            (EventType.NIGHT_ATTACK, True),
        ]

    def test_guard_block_is_published_after_private_attack(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_night_results
        Mock: memory_mod.update_memory — メモリ更新のファイルI/Oを回避
        Level: unit
        Objective: 護衛成功時は private attack → public guard_block（1イベント）の順で emit されること（新スキーマ）。
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

        night_events = [
            (event.event_type, event.is_public)
            for event in events
            if event.event_type in {EventType.NIGHT_ATTACK, EventType.GUARD_BLOCK}
        ]
        assert night_events == [
            (EventType.NIGHT_ATTACK, False),
            (EventType.GUARD_BLOCK, True),
        ]


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
        inspection_events = [e for e in events if e.event_type == EventType.INSPECTION]
        assert len(inspection_events) == 1
        assert inspection_events[0].agent == "Seer1"
        assert inspection_events[0].target == "Wolf1"

    def test_inspect_villager_sets_suspicion_min(self, make_test_actor, make_test_engine):
        """
        SUT: _publish_inspection
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: Seer が村人を占ったとき suspicion=0.0 がセットされ INSPECTION イベントが emit されること。
        """
        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, events = make_test_engine([seer, villager])

        declaration = InspectDeclaration(actor=seer, target="Alice")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        assert seer.state.beliefs["Alice"].suspicion == 0.0
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

        seer.state.beliefs["Alice"] = Belief(suspicion=0.5)

        declaration = InspectDeclaration(actor=seer, target="Alice")
        inspection = InspectionResult(declaration=declaration, result=None)

        with patch("src.engine.phase_night.store.save"):
            _publish_inspection(engine, inspection)

        assert seer.state.beliefs["Alice"].suspicion == 0.0
        assert len([e for e in events if e.event_type == EventType.INSPECTION]) == 1


class TestApplyWolfSelfDecisions:
    def test_next_day_claim_role_none_logs_warning(self, caplog, make_test_actor, make_test_engine):
        """
        SUT: _apply_wolf_self_decisions
        Mock: store.save — ファイルI/Oを回避; caplog で logging をキャプチャ
        Level: unit
        Objective: timing=next_day かつ claim_role=None のとき、狼の名前を含む warning ログが出ること。
        """
        import logging
        from unittest.mock import patch

        wolf = make_test_actor("Wolf1", "Werewolf")
        engine, _ = make_test_engine([wolf])

        output = WolfChatOutput(
            thought="t",
            speech="s",
            attack_candidates={},
            self_co_decision=WolfSelfCoDecision(claim_role=None, timing="next_day"),
        )

        with patch("src.engine.phase_night.store.save"), \
             caplog.at_level(logging.WARNING, logger="src.engine.phase_night"):
            _apply_wolf_self_decisions(engine, [wolf], {"Wolf1": output})

        assert any("Wolf1" in r.message for r in caplog.records)

    def test_reco_allowed_when_claimed_role_already_set(self, make_test_actor, make_test_engine):
        """
        SUT: _apply_wolf_self_decisions
        Mock: store.save — ファイルI/Oを回避
        Level: unit
        Objective: claimed_role が既にセットされた狼が timing=next_day で claim_role を指定したとき
                   intended_co に新しい役職がセットされること（re-CO が許可されること）。
        """
        from src.domain.roles import Seer
        from unittest.mock import patch

        wolf = make_test_actor("Wolf1", "Werewolf")
        wolf.state.claimed_role = Seer()
        engine, _ = make_test_engine([wolf])

        output = WolfChatOutput(
            thought="t",
            speech="s",
            attack_candidates={},
            self_co_decision=WolfSelfCoDecision(claim_role=Seer(), timing="next_day"),
        )

        with patch("src.engine.phase_night.store.save"):
            _apply_wolf_self_decisions(engine, [wolf], {"Wolf1": output})

        assert wolf.state.intended_co is not None
        assert wolf.state.intended_co.name == "Seer"


class TestResolveDeclaredInspection:
    def test_reasoning_is_preserved_after_target_resolution(self, make_test_actor, make_test_engine):
        """
        SUT: _resolve_declared_inspection
        Mock: なし
        Level: unit
        Objective: dataclasses.replace で target を上書きしても reasoning が失われないこと。
        """
        seer = make_test_actor("Seer1", "Seer")
        villager = make_test_actor("Alice")
        engine, _ = make_test_engine([seer, villager])

        declaration = InspectDeclaration(actor=seer, target="Alice", reasoning="Alice looks suspicious.")
        result = _resolve_declared_inspection(engine, declaration)

        assert result is not None
        assert result.declaration.reasoning == "Alice looks suspicious."

    def test_none_input_returns_none(self, make_test_actor, make_test_engine):
        """
        SUT: _resolve_declared_inspection
        Mock: なし
        Level: unit
        Objective: inspect=None のとき None を返すこと。
        """
        seer = make_test_actor("Seer1", "Seer")
        engine, _ = make_test_engine([seer])

        result = _resolve_declared_inspection(engine, None)

        assert result is None

"""Smoke tests for testability and wiring guardrails around the engine layer.

These tests do not verify AgentVillage runtime behavior directly. They exist to
protect dependency injection and import-time wiring assumptions so that runtime
contract tests can focus on actual game behavior.
"""

from unittest.mock import MagicMock

from src.engine.game import GameEngine
from src.engine.phase_day import run_day_phase
from src.engine.phase_night import run_night_phase
from src.llm.client import LLMClient
from src.logger.writer import LogWriter


class TestEngineTestabilitySmoke:
    """Smoke tests that protect engine testability and module wiring."""

    def test_uses_injected_llm_client_without_factory_patch(self, make_test_actor):
        """
        SUT: GameEngine.__init__()
        Mock: MagicMock LLMClient and LogWriter
        Level: unit
        Objective: testability smoke testとして、注入した LLMClient が factory patch なしで保持されることを確認する。
        """
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
        """
        SUT: src.engine.phase_day / src.engine.phase_night import wiring
        Mock: なし
        Level: unit
        Objective: testability smoke testとして、フェーズモジュールが循環参照なしに import できることを確認する。
        """
        assert callable(run_day_phase)
        assert callable(run_night_phase)

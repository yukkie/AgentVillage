from unittest.mock import MagicMock

import pytest

from src.domain.actor import Actor, ActorState, Persona, make_actor
from src.domain.event import LogEvent
from src.engine.game import GameEngine
from src.llm.client import LLMClient
from src.logger.writer import LogWriter


@pytest.fixture
def make_test_actor():
    def _make_test_actor(name: str, role: str = "Villager") -> Actor:
        state = ActorState(
            name=name,
            persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
            beliefs={},
            memory_summary=[],
            is_alive=True,
        )
        return make_actor(state, role)

    return _make_test_actor


@pytest.fixture
def make_test_engine():
    def _make_test_engine(agents: list[Actor]) -> tuple[GameEngine, list[LogEvent]]:
        events: list[LogEvent] = []
        log_writer = MagicMock(spec=LogWriter)
        log_writer.write.side_effect = lambda e: events.append(e)
        llm_client = MagicMock(spec=LLMClient)
        engine = GameEngine(
            agents=agents,
            log_writer=log_writer,
            lang="English",
            llm_client=llm_client,
        )
        return engine, events

    return _make_test_engine

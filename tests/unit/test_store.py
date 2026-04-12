"""store モジュールのテスト。"""
import json
from pathlib import Path

import pytest

from src.agent.state import AgentState, Persona
from src.agent import store


def _make_agent_json(name: str, role: str) -> dict:
    return AgentState(
        name=name,
        role=role,
        persona=Persona(style="calm"),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    ).model_dump()


@pytest.fixture()
def agents_dir(tmp_path: Path) -> Path:
    d = tmp_path / "agents"
    d.mkdir()
    (d / "alice.json").write_text(
        json.dumps(_make_agent_json("Alice", "Villager")), encoding="utf-8"
    )
    (d / "bob.json").write_text(
        json.dumps(_make_agent_json("Bob", "Werewolf")), encoding="utf-8"
    )
    return d


def test_load_all_from_dir_returns_agents(agents_dir: Path) -> None:
    """指定ディレクトリから AgentState を全件読み込めること。"""
    agents = store.load_all_from_dir(agents_dir)
    assert len(agents) == 2
    names = {a.name for a in agents}
    assert names == {"Alice", "Bob"}


def test_load_all_from_dir_empty(tmp_path: Path) -> None:
    """JSONが0件のディレクトリでは空リストを返すこと。"""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    assert store.load_all_from_dir(empty_dir) == []


def test_load_all_delegates_to_load_all_from_dir(agents_dir: Path, monkeypatch) -> None:
    """load_all() が load_all_from_dir(STATE_DIR) に委譲していること。"""
    called_with: list[Path] = []

    original = store.load_all_from_dir

    def spy(path: Path) -> list[AgentState]:
        called_with.append(path)
        return original(path)

    monkeypatch.setattr(store, "load_all_from_dir", spy)
    monkeypatch.setattr(store, "STATE_DIR", agents_dir)

    store.load_all()
    assert called_with == [agents_dir]

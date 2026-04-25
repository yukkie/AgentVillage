"""store モジュールのテスト。"""
import json
from pathlib import Path

import pytest

from src.domain.actor import Actor, ActorProfile, ActorState, Persona
from src.domain.roles import get_role
from src.agent import store
from tests.conftest import make_legacy_agent_json, make_split_agent_json


@pytest.fixture()
def agents_dir(tmp_path: Path) -> Path:
    d = tmp_path / "agents"
    d.mkdir()
    (d / "alice.json").write_text(
        json.dumps(make_legacy_agent_json("Alice", "Villager")), encoding="utf-8"
    )
    (d / "bob.json").write_text(
        json.dumps(make_split_agent_json("Bob", "Werewolf")), encoding="utf-8"
    )
    return d


def test_load_all_from_dir_returns_agents(agents_dir: Path) -> None:
    """指定ディレクトリから Actor を全件読み込めること。"""
    agents = store.load_all_from_dir(agents_dir)
    assert len(agents) == 2
    names = {a.name for a in agents}
    assert names == {"Alice", "Bob"}


def test_load_all_from_dir_empty(tmp_path: Path) -> None:
    """JSONが0件のディレクトリでは空リストを返すこと。"""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    assert store.load_all_from_dir(empty_dir) == []


def test_load_missing_file_raises(tmp_path: Path, monkeypatch) -> None:
    """
    SUT: load()
    Mock: monkeypatch で STATE_DIR を tmp_path に差し替え
    Level: unit
    Objective: 存在しないエージェントファイルを load() したとき FileNotFoundError が送出されること。
    """
    monkeypatch.setattr(store, "STATE_DIR", tmp_path)
    with pytest.raises(FileNotFoundError, match="Agent state file not found"):
        store.load("ghost")


def test_load_all_delegates_to_load_all_from_dir(agents_dir: Path, monkeypatch) -> None:
    """load_all() が load_all_from_dir(STATE_DIR) に委譲していること。"""
    called_with: list[Path] = []

    original = store.load_all_from_dir

    def spy(path: Path) -> list[Actor]:
        called_with.append(path)
        return original(path)

    monkeypatch.setattr(store, "load_all_from_dir", spy)
    monkeypatch.setattr(store, "STATE_DIR", agents_dir)

    store.load_all()
    assert called_with == [agents_dir]


def test_save_writes_split_json(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(store, "STATE_DIR", tmp_path)
    actor = Actor(
        profile=ActorProfile(name="Alice", persona=Persona(style="calm")),
        state=ActorState(beliefs={}, memory_summary=[], is_alive=True),
        role=get_role("Villager"),
    )
    store.save(actor)

    written = json.loads((tmp_path / "alice.json").read_text(encoding="utf-8"))
    assert "profile" in written
    assert "state" in written
    assert written["role"] == "Villager"

"""src/engine/setup.py の initialize_agents() のテスト。"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from src.engine.setup import initialize_agents


def test_initialize_agents_count():
    """5人分のActorが返ること。"""
    with patch("src.agent.store.save"):
        result = initialize_agents(5)

    assert len(result) == 5


def test_initialize_agents_roles_distribution():
    """5人モードのとき、役職が roles.json 通りの種類・数で配られること。"""
    with patch("src.agent.store.save"):
        agents = initialize_agents(5)

    roles = [a.role.name for a in agents]
    roles_config = json.loads(Path("config/roles.json").read_text(encoding="utf-8"))
    expected = sorted(roles_config["5"])
    assert sorted(roles) == expected


def test_initialize_agents_unique_names():
    """各エージェントの名前が一意であること。"""
    with patch("src.agent.store.save"):
        agents = initialize_agents(5)

    names = [a.name for a in agents]
    assert len(names) == len(set(names))


def test_initialize_agents_beliefs_exclude_self():
    """beliefs に自分自身のキーが含まれないこと。"""
    with patch("src.agent.store.save"):
        agents = initialize_agents(5)

    for agent in agents:
        assert agent.name not in agent.state.beliefs


def test_initialize_agents_invalid_player_count():
    """存在しないプレイヤー数を指定したとき sys.exit が呼ばれること。"""
    with pytest.raises(SystemExit):
        initialize_agents(99)


def test_initialize_agents_corrupt_agents_json(monkeypatch):
    """
    SUT: initialize_agents()
    Mock: monkeypatch で Path.read_text を差し替え、agents.json 読み込み時に不正JSONを返す
    Level: unit
    Objective: agents.json が不正な JSON のとき sys.exit(1) が呼ばれること。
    """
    original_read = Path.read_text

    def fake_read(self, **kwargs):
        if self.name == "agents.json":
            return "{not valid json"
        return original_read(self, **kwargs)

    monkeypatch.setattr(Path, "read_text", fake_read)
    with pytest.raises(SystemExit):
        initialize_agents(5)


def test_initialize_agents_corrupt_roles_json(monkeypatch):
    """
    SUT: initialize_agents()
    Mock: monkeypatch で Path.read_text を差し替え、roles.json 読み込み時に不正JSONを返す
    Level: unit
    Objective: roles.json が不正な JSON のとき sys.exit(1) が呼ばれること。
    """
    original_read = Path.read_text

    def fake_read(self, **kwargs):
        if self.name == "roles.json":
            return "{not valid json"
        return original_read(self, **kwargs)

    monkeypatch.setattr(Path, "read_text", fake_read)
    with patch("src.agent.store.save"):
        with pytest.raises(SystemExit):
            initialize_agents(5)

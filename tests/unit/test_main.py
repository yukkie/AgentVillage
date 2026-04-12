"""main.py の initialize_agents() のテスト。"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from main import initialize_agents


def test_initialize_agents_count(tmp_path):
    """5人分のAgentStateが返ること。"""
    agents = initialize_agents.__wrapped__(5) if hasattr(initialize_agents, "__wrapped__") else None

    # store.save をモックして実ファイルを書かせない
    with patch("main.store.save"), patch("main.Path") as mock_path:
        # config ファイルは実際のものを使う
        import importlib, main as m
        with patch.object(m, "Path", wraps=Path):
            with patch("src.agent.store.save"):
                result = initialize_agents(5)

    assert len(result) == 5


def test_initialize_agents_roles_distribution(tmp_path):
    """5人モードのとき、役職が roles.json 通りの種類・数で配られること。"""
    with patch("src.agent.store.save"):
        agents = initialize_agents(5)

    roles = [a.role for a in agents]
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
        assert agent.name not in agent.beliefs


def test_initialize_agents_invalid_player_count():
    """存在しないプレイヤー数を指定したとき sys.exit が呼ばれること。"""
    with pytest.raises(SystemExit):
        initialize_agents(99)

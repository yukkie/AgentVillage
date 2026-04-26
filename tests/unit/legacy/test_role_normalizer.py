"""
Legacy-Adapter のテスト: normalize_role_field

旧 JSON に含まれるロール名文字列・Role インスタンス・None が
正しく Role | None に変換されることを検証する。
"""
import pytest

from src.domain.roles import get_role
from src.legacy.role_normalizer import normalize_role_field


def test_none_returns_none():
    """
    SUT: normalize_role_field
    Mock: なし
    Level: unit
    Objective: None を渡したとき None が返ること。
    """
    assert normalize_role_field(None) is None


def test_role_instance_passthrough():
    """
    SUT: normalize_role_field
    Mock: なし
    Level: unit
    Objective: すでに Role インスタンスであればそのまま返ること。
    """
    role = get_role("Werewolf")
    assert normalize_role_field(role) is role


@pytest.mark.parametrize("role_name", ["Villager", "Werewolf", "Seer", "Knight", "Medium", "Madman"])
def test_role_name_string_converts_to_role(role_name: str):
    """
    SUT: normalize_role_field
    Mock: なし
    Level: unit
    Objective: 旧 JSON のロール名文字列が対応する Role インスタンスに変換されること。
    """
    result = normalize_role_field(role_name)
    assert result is not None
    assert result.name == role_name


def test_unknown_string_returns_none():
    """
    SUT: normalize_role_field
    Mock: なし
    Level: unit
    Objective: 未知のロール名文字列は ValueError を握り潰して None を返すこと。
    """
    assert normalize_role_field("UnknownRole") is None

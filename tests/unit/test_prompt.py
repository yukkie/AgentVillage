import pytest

from src.llm.prompt import build_role_prompt


def test_build_role_prompt_wolf_partners_non_none_for_non_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt("Seer", wolf_partners=["Alice"])


def test_build_role_prompt_wolf_partners_none_for_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt("Werewolf", wolf_partners=None)


def test_build_role_prompt_wolf_partners_empty_for_werewolf_is_allowed():
    result = build_role_prompt("Werewolf", wolf_partners=[])
    assert "last surviving Werewolf" in result


def test_build_role_prompt_wolf_partners_list_for_werewolf_is_allowed():
    result = build_role_prompt("Werewolf", wolf_partners=["Bob"])
    assert "Bob" in result

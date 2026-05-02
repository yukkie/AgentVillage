import pytest

from src.domain.actor import Belief
from src.llm.prompt import build_personal_info_prompt, build_role_prompt
from src.domain.roles import get_role


def test_build_role_prompt_wolf_partners_non_none_for_non_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt(get_role("Seer"), wolf_partners=["Alice"])


def test_build_role_prompt_wolf_partners_none_for_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt(get_role("Werewolf"), wolf_partners=None)


def test_build_role_prompt_wolf_partners_empty_for_werewolf_is_allowed():
    result = build_role_prompt(get_role("Werewolf"), wolf_partners=[])
    assert "last surviving Werewolf" in result


def test_build_role_prompt_wolf_partners_list_for_werewolf_is_allowed():
    result = build_role_prompt(get_role("Werewolf"), wolf_partners=["Bob"])
    assert "Bob" in result


def test_get_role_unknown_role_raises():
    with pytest.raises(ValueError, match="Unknown role"):
        get_role("UnknownRole")


def test_belief_has_no_trust_field():
    """
    SUT: Belief
    Mock: なし
    Level: unit
    Objective: Belief に trust フィールドが存在しないこと（AC: Belief has only suspicion: float）。
    """
    belief = Belief(suspicion=0.7)
    assert not hasattr(belief, "trust")


def test_personal_info_prompt_shows_suspicion_scores(make_test_actor):
    """
    SUT: build_personal_info_prompt
    Mock: なし
    Level: unit
    Objective: actor.state.beliefs に suspicion が入っているとき suspicion スコアとガイダンスがプロンプトに含まれること（AC）。
    """
    actor = make_test_actor("Alice", "Villager")
    actor.state.beliefs = {
        "Bob": Belief(suspicion=0.8),
        "Carol": Belief(suspicion=0.2),
    }
    prompt = build_personal_info_prompt(actor)
    assert "suspicion" in prompt
    assert "Bob" in prompt
    assert "0.80" in prompt
    assert "Carol" in prompt
    assert "0.20" in prompt
    assert "vote" in prompt.lower()


def test_personal_info_prompt_omits_suspicion_section_when_no_beliefs(make_test_actor):
    """
    SUT: build_personal_info_prompt
    Mock: なし
    Level: unit
    Objective: actor.state.beliefs が空のとき suspicion セクションが含まれないこと。
    """
    actor = make_test_actor("Alice", "Villager")
    actor.state.beliefs = {}
    prompt = build_personal_info_prompt(actor)
    assert "suspicion levels" not in prompt

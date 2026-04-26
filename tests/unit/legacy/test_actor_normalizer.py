"""
Legacy-Adapter のテスト: normalize_actor_dict

actor_from_dict の legacy パス（flat 形式）が正しく ActorProfile + ActorState に
変換されることを検証する。
"""
import pytest

from src.domain.actor import ActorProfile, ActorState, Persona
from src.legacy.actor_normalizer import normalize_actor_dict


def _minimal_flat(name: str = "Alice", role: str = "Villager") -> dict:
    return {
        "name": name,
        "persona": Persona(style="calm").model_dump(mode="json"),
        "beliefs": {},
        "memory_summary": [],
        "is_alive": True,
        "role": role,
    }


def test_normalize_flat_without_catalog():
    """
    SUT: normalize_actor_dict
    Mock: なし
    Level: unit
    Objective: agent_catalog なしの flat dict が ActorProfile + ActorState に変換されること。
    """
    data = _minimal_flat("Alice", "Villager")
    profile, state = normalize_actor_dict(data, agent_catalog=None)

    assert isinstance(profile, ActorProfile)
    assert profile.name == "Alice"
    assert isinstance(state, ActorState)
    assert state.is_alive is True


def test_normalize_flat_with_catalog_uses_catalog_profile():
    """
    SUT: normalize_actor_dict
    Mock: なし
    Level: unit
    Objective: agent_catalog に名前が存在するとき、catalog のモデル値が補完されること。
    """
    catalog_profile = ActorProfile(
        name="Alice",
        model="claude-opus-4-7",
        persona=Persona(style="bold"),
    )
    data = _minimal_flat("Alice")
    data.pop("persona", None)
    data["persona"] = catalog_profile.persona.model_dump(mode="json")

    profile, state = normalize_actor_dict(data, agent_catalog={"Alice": catalog_profile})

    assert profile.model == "claude-opus-4-7"


def test_normalize_flat_catalog_miss_falls_back_to_data():
    """
    SUT: normalize_actor_dict
    Mock: なし
    Level: unit
    Objective: catalog に名前がないとき data の値をそのまま使うこと。
    """
    data = _minimal_flat("Unknown")
    profile, state = normalize_actor_dict(data, agent_catalog={"Alice": ActorProfile(
        name="Alice", persona=Persona(style="calm")
    )})

    assert profile.name == "Unknown"


def test_normalize_flat_preserves_beliefs_and_memory():
    """
    SUT: normalize_actor_dict
    Mock: なし
    Level: unit
    Objective: beliefs / memory_summary が ActorState に正しく引き継がれること。
    """
    data = _minimal_flat()
    data["beliefs"] = {"Bob": {"suspicion": 0.8, "trust": 0.2, "reason": ["suspect"]}}
    data["memory_summary"] = ["Bob acted suspiciously"]

    _, state = normalize_actor_dict(data, agent_catalog=None)

    assert "Bob" in state.beliefs
    assert state.beliefs["Bob"].suspicion == pytest.approx(0.8)
    assert state.memory_summary == ["Bob acted suspiciously"]


def test_normalize_flat_dead_actor():
    """
    SUT: normalize_actor_dict
    Mock: なし
    Level: unit
    Objective: is_alive=False の flat dict が正しく変換されること。
    """
    data = _minimal_flat()
    data["is_alive"] = False

    _, state = normalize_actor_dict(data, agent_catalog=None)

    assert state.is_alive is False

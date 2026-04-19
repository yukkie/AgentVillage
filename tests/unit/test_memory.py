"""src/agent/memory.py のテスト。"""
import pytest

from src.domain.actor import Actor, ActorState, Persona
from src.agent.memory import update_memory


def _make_actor(name: str = "Alice") -> Actor:
    from src.domain.actor import make_actor
    state = ActorState(
        name=name,
        persona=Persona(style="calm"),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    )
    return make_actor(state, "Villager")


def test_update_memory_appends_new_items(monkeypatch) -> None:
    """
    SUT: update_memory()
    Mock: monkeypatch で store.save を no-op に差し替え
    Level: unit
    Objective: 新しい記憶が memory_summary に追記されること。
    """
    from src.agent import memory as mem_mod
    monkeypatch.setattr(mem_mod.store, "save", lambda _: None)
    actor = _make_actor()
    result = update_memory(actor, ["saw wolf", "suspect Bob"])
    assert result.state.memory_summary == ["saw wolf", "suspect Bob"]


def test_update_memory_skips_duplicates(monkeypatch) -> None:
    """
    SUT: update_memory()
    Mock: monkeypatch で store.save を no-op に差し替え
    Level: unit
    Objective: 既存の記憶と重複するアイテムは追記されないこと。
    """
    from src.agent import memory as mem_mod
    monkeypatch.setattr(mem_mod.store, "save", lambda _: None)
    actor = _make_actor()
    actor.state.memory_summary.append("saw wolf")
    update_memory(actor, ["saw wolf", "new info"])
    assert actor.state.memory_summary == ["saw wolf", "new info"]


def test_update_memory_raises_on_io_error(monkeypatch) -> None:
    """
    SUT: update_memory()
    Mock: monkeypatch で store.save が OSError を送出するよう差し替え
    Level: unit
    Objective: store.save() が OSError を送出したとき、コンテキスト付きで OSError が re-raise されること。
    """
    from src.agent import memory as mem_mod

    def failing_save(_):
        raise OSError("disk full")

    monkeypatch.setattr(mem_mod.store, "save", failing_save)
    actor = _make_actor()
    with pytest.raises(OSError, match="Failed to persist memory for Alice"):
        update_memory(actor, ["some update"])

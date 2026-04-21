"""Renderer のイベント描画テスト。

- 公開／観戦モードの可視性フィルタ
- 主要な EventType ごとのスタイル・本文
- CO 済み時の発言色
"""
from rich.text import Text

from src.domain.event import EventType, LogEvent
from src.ui.renderer import Renderer


def _make_event(event_type: EventType, **kwargs) -> LogEvent:
    return LogEvent.make(day=1, phase="day", event_type=event_type, **kwargs)


# ── 可視性フィルタ ────────────────────────────────────────────────────────────


def test_non_public_event_hidden_in_public_mode(make_test_actor) -> None:
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(
        EventType.NIGHT_ATTACK, agent="Wolf", target="Alice", is_public=False
    )

    assert renderer.on_event(event) is None


def test_non_public_event_visible_in_spectator_mode(make_test_actor) -> None:
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=True)
    event = _make_event(
        EventType.NIGHT_ATTACK, agent="Wolf", target="Alice", is_public=False
    )

    result = renderer.on_event(event)

    assert isinstance(result, Text)
    assert "Wolf attacks Alice" in result.plain


# ── 代表的な EventType の描画 ────────────────────────────────────────────────


def test_speech_uses_white_without_co(make_test_actor) -> None:
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(
        EventType.SPEECH, agent="Alice", content="Hello.", speech_id=1
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[1] Alice: Hello." in result.plain
    # First span carries the name prefix; style should be bold white.
    assert "white" in str(result.spans[0].style)


def test_speech_uses_true_role_color_in_spectator_mode(make_test_actor) -> None:
    actor = make_test_actor("Wolf", "Werewolf")
    renderer = Renderer([actor], spectator_mode=True)
    event = _make_event(EventType.SPEECH, agent="Wolf", content="Hi.")

    result = renderer.on_event(event)

    assert result is not None
    assert actor.role.color in str(result.spans[0].style)


def test_think_prefix_renders_as_dim_spectator_line(make_test_actor) -> None:
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=True)
    event = _make_event(
        EventType.SPEECH, agent="Alice", content="[THINK] they look nervous", is_public=False
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[THINK] Alice: they look nervous" in result.plain


def test_vote_renders_agent_and_target(make_test_actor) -> None:
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(EventType.VOTE, agent="Alice", target="Bob")

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[VOTE] Alice → Bob"


def test_simple_event_uses_mapping_prefix(make_test_actor) -> None:
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(EventType.INSPECTION, content="Seer saw Bob is Werewolf", is_public=False)

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[INSPECT] Seer saw Bob is Werewolf"


def test_night_attack_without_agent_falls_back_to_content(make_test_actor) -> None:
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(EventType.NIGHT_ATTACK, content="No one was attacked", is_public=False)

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[NIGHT] No one was attacked"


def test_phase_start_wraps_with_newlines(make_test_actor) -> None:
    renderer = Renderer([], spectator_mode=False)
    event = _make_event(EventType.PHASE_START, content="=== Day 1 ===")

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "\n=== Day 1 ===\n"


def test_game_over_has_header_and_footer(make_test_actor) -> None:
    renderer = Renderer([], spectator_mode=False)
    event = _make_event(EventType.GAME_OVER, content="Village wins!")

    result = renderer.on_event(event)

    assert result is not None
    assert "Village wins!" in result.plain
    assert result.plain.count("=" * 50) == 2

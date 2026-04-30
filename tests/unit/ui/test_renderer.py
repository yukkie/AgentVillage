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


def test_inspection_structured_field_used_when_present(make_test_actor) -> None:
    """
    SUT: Renderer._render_inspection
    Mock: なし
    Level: unit
    Objective: inspection_role が設定されているとき content に依存せず構造化フィールドから描画されること。
    """
    from src.domain.roles import get_role
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.INSPECTION,
        agent="Seer1",
        target="Wolf1",
        content="Seer1 inspects Wolf1: Not Werewolf",  # wrong content — should be ignored
        inspection_role=get_role("Werewolf"),
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[INSPECT] Seer1 inspects Wolf1: Werewolf"


def test_inspection_falls_back_to_content_for_legacy_events(make_test_actor) -> None:
    """
    SUT: Renderer._render_inspection
    Mock: なし
    Level: unit
    Objective: inspection_role が None のレガシーイベントは content をそのまま表示すること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.INSPECTION,
        content="Seer saw Bob is Werewolf",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[INSPECT] Seer saw Bob is Werewolf"


def test_simple_event_uses_mapping_prefix(make_test_actor) -> None:
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(EventType.GUARD, content="Knight guards Alice", is_public=False)

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[GUARD] Knight guards Alice"


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


# ── #203: JUDGMENT decision フィールド ──────────────────────────────────────────


def test_judgment_shows_decision_field() -> None:
    """
    SUT: Renderer.on_event (JUDGMENT)
    Mock: なし
    Level: unit
    Objective: JUDGMENT イベントの decision フィールドがエージェント名の後に表示されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.JUDGMENT,
        agent="Gina",
        decision="speak",
        reasoning="情報が少ないため発言する。",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[JUDGMENT] Gina: speak" in result.plain


def test_judgment_reasoning_follows_decision_on_newline() -> None:
    """
    SUT: Renderer.on_event (JUDGMENT)
    Mock: なし
    Level: unit
    Objective: reasoning が decision の後に改行で続くこと。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.JUDGMENT,
        agent="Gina",
        decision="speak",
        reasoning="情報が少ないため発言する。",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[JUDGMENT] Gina: speak\n情報が少ないため発言する。" in result.plain


# ── #205: reasoning の dim 表示 ──────────────────────────────────────────────────


def test_vote_reasoning_is_dimmed_in_spectator_mode(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (VOTE)
    Mock: なし
    Level: unit
    Objective: spectator モードで reasoning が dim スタイルの別 span として追加されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.VOTE, agent="Alice", target="Bob", reasoning="Bobが怪しい。"
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "Bobが怪しい。" in result.plain
    dim_spans = [s for s in result.spans if "dim" in str(s.style)]
    assert len(dim_spans) >= 1


def test_vote_strategy_shown_in_spectator_mode() -> None:
    """
    SUT: Renderer.on_event (VOTE)
    Mock: なし
    Level: unit
    Objective: spectator モードで decision (strategy) が VOTE イベントに表示されること（#212）。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.VOTE,
        agent="Wolf1",
        target="Seer1",
        reasoning="Seer は処刑したい。",
        decision="wolf_side",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "wolf_side" in result.plain
    assert "[VOTE] Wolf1 → Seer1" in result.plain


def test_vote_strategy_hidden_in_public_mode() -> None:
    """
    SUT: Renderer.on_event (VOTE)
    Mock: なし
    Level: unit
    Objective: public モードでは strategy（decision）が露出しないこと（観戦者専用情報）。
    """
    renderer = Renderer([], spectator_mode=False)
    event = _make_event(
        EventType.VOTE,
        agent="Wolf1",
        target="Seer1",
        reasoning="Seer は処刑したい。",
        decision="wolf_side",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "wolf_side" not in result.plain
    assert "Seer は処刑したい。" not in result.plain


def test_guard_reasoning_is_dimmed_in_spectator_mode() -> None:
    """
    SUT: Renderer.on_event (GUARD)
    Mock: なし
    Level: unit
    Objective: spectator モードで reasoning が dim スタイルの別 span として追加されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.GUARD,
        content="Knight guards Alice",
        reasoning="Aliceが占い師候補。",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "Aliceが占い師候補。" in result.plain
    dim_spans = [s for s in result.spans if "dim" in str(s.style)]
    assert len(dim_spans) >= 1


def test_inspection_reasoning_is_dimmed_in_spectator_mode() -> None:
    """
    SUT: Renderer._render_inspection
    Mock: なし
    Level: unit
    Objective: spectator モードで reasoning が dim スタイルの別 span として追加されること。
    """
    from src.domain.roles import get_role
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.INSPECTION,
        agent="Seer1",
        target="Wolf1",
        inspection_role=get_role("Werewolf"),
        reasoning="Wolfの行動パターンが一致。",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "Wolfの行動パターンが一致。" in result.plain
    dim_spans = [s for s in result.spans if "dim" in str(s.style)]
    assert len(dim_spans) >= 1


def test_judgment_reasoning_is_dimmed() -> None:
    """
    SUT: Renderer.on_event (JUDGMENT)
    Mock: なし
    Level: unit
    Objective: reasoning が dim スタイルの別 span として追加されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.JUDGMENT,
        agent="Gina",
        decision="silent",
        reasoning="今は静観が最善。",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    dim_spans = [s for s in result.spans if "dim" in str(s.style)]
    assert len(dim_spans) >= 1

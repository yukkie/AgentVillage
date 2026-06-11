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
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: 旧ログの [THINK] speech 行が従来どおり spectator 思考行として描画されること。
    """
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=True)
    event = _make_event(
        EventType.SPEECH, agent="Alice", content="[THINK] they look nervous", is_public=False
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[THINK] Alice: they look nervous" in result.plain


def test_speech_reasoning_renders_as_think_line_in_spectator_mode(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: 新ログの SPEECH.reasoning が spectator の思考行として描画され、content に [THINK] が出ないこと。
    """
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=True)
    event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I think Bob is suspicious.",
        reasoning="Bob avoided voting.",
        speech_id=3,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[3] Alice: I think Bob is suspicious." in result.plain
    assert "[THINK] Alice: Bob avoided voting." in result.plain
    assert "[THINK] I think Bob is suspicious." not in result.plain


def test_speech_reasoning_hidden_in_public_mode(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: public モードでは SPEECH.reasoning が表示されないこと。
    """
    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I think Bob is suspicious.",
        reasoning="Bob avoided voting.",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "Bob avoided voting." not in result.plain


def test_speech_claimed_role_generates_co_line(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: SPEECH.claimed_role から CO 表示が生成されること。
    """
    from src.domain.roles import get_role

    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I am the seer.",
        claimed_role=get_role("Seer"),
        decision="co",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[CO] Alice claims to be Seer" in result.plain
    assert "Alice: I am the seer." in result.plain


def test_speech_claimed_role_transition_generates_co_line_without_decision(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: SPEECH.claimed_role が表示済み状態から変化したとき decision に依存せず [CO] 宣言行を表示すること。
    """
    from src.domain.roles import get_role

    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I will share my result.",
        claimed_role=get_role("Seer"),
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[CO] Alice claims to be Seer" in result.plain
    assert "Alice: I will share my result." in result.plain


def test_repeated_claimed_role_does_not_generate_co_line(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: 表示済み claimed_role と同じ役職の後続発言では decision="co" があっても CO 宣言行を二重表示しないこと。
    """
    from src.domain.roles import get_role

    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)
    first_event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I am the seer.",
        claimed_role=get_role("Seer"),
    )
    repeated_event = _make_event(
        EventType.SPEECH,
        agent="Alice",
        content="Again, I am the seer.",
        claimed_role=get_role("Seer"),
        decision="co",
    )

    first_result = renderer.on_event(first_event)
    repeated_result = renderer.on_event(repeated_event)

    assert first_result is not None
    assert repeated_result is not None
    assert "[CO] Alice claims to be Seer" in first_result.plain
    assert "[CO] Alice claims to be Seer" not in repeated_result.plain
    assert "Alice: Again, I am the seer." in repeated_result.plain


def test_claimed_role_change_generates_new_co_line(make_test_actor) -> None:
    """
    SUT: Renderer._render_speech
    Mock: なし
    Level: unit
    Objective: claimed_role が別役職へ変化したとき、新しい CO 宣言行を表示すること。
    """
    from src.domain.roles import get_role

    actor = make_test_actor("Alice", "Villager")
    renderer = Renderer([actor], spectator_mode=False)

    renderer.on_event(_make_event(
        EventType.SPEECH,
        agent="Alice",
        content="I am the seer.",
        claimed_role=get_role("Seer"),
    ))
    result = renderer.on_event(_make_event(
        EventType.SPEECH,
        agent="Alice",
        content="Actually, I am the medium.",
        claimed_role=get_role("Medium"),
    ))

    assert result is not None
    assert "[CO] Alice claims to be Medium" in result.plain
    assert "Alice: Actually, I am the medium." in result.plain


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


def test_spectator_content_preferred_in_spectator_mode() -> None:
    """
    SUT: Renderer.on_event
    Mock: なし
    Level: unit
    Objective: spectator モードでは spectator_content が content より優先表示されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.GUARD_BLOCK,
        content="No one died tonight.",
        spectator_content="Alice was protected by the Knight.",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[GUARD BLOCK] Alice was protected by the Knight."


def test_spectator_content_falls_back_to_content_when_empty() -> None:
    """
    SUT: Renderer.on_event
    Mock: なし
    Level: unit
    Objective: spectator_content が空なら spectator モードでも content にフォールバックすること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(EventType.GUARD_BLOCK, content="No one died tonight.")

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[GUARD BLOCK] No one died tonight."


def test_spectator_content_hidden_in_public_mode() -> None:
    """
    SUT: Renderer.on_event
    Mock: なし
    Level: unit
    Objective: public モードでは spectator_content ではなく content が表示されること。
    """
    renderer = Renderer([], spectator_mode=False)
    event = _make_event(
        EventType.GUARD_BLOCK,
        content="No one died tonight.",
        spectator_content="Alice was protected by the Knight.",
    )

    result = renderer.on_event(event)

    assert result is not None
    assert result.plain == "[GUARD BLOCK] No one died tonight."


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


def test_threat_update_renders_with_dim_red_style() -> None:
    """
    SUT: Renderer.on_event (THREAT_UPDATE)
    Mock: なし
    Level: unit
    Objective: THREAT_UPDATE イベントが [THREAT] プレフィックスで dim red スタイルとして描画されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.THREAT_UPDATE,
        agent="Wolf",
        content="Wolf threat update: Seer=0.90, Knight=0.60",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[THREAT]" in result.plain
    assert "Seer=0.90" in result.plain
    red_spans = [s for s in result.spans if "red" in str(s.style)]
    assert len(red_spans) >= 1


def test_threat_update_hidden_in_public_mode() -> None:
    """
    SUT: Renderer.on_event (THREAT_UPDATE)
    Mock: なし
    Level: unit
    Objective: THREAT_UPDATE は is_public=False のため public モードでは None を返すこと。
    """
    renderer = Renderer([], spectator_mode=False)
    event = _make_event(
        EventType.THREAT_UPDATE,
        agent="Wolf",
        content="Wolf threat update: Seer=0.90",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is None


def test_wolf_chat_speech_renders_red(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (WOLF_CHAT)
    Mock: なし
    Level: unit
    Objective: WOLF_CHAT の speech イベントが red スタイルで描画されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.WOLF_CHAT,
        agent="Wolf1",
        content="Wolf1: let's attack Alice",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "let's attack Alice" in result.plain
    spans = [s for s in result._spans if s.style == "red"]
    assert len(spans) > 0


def test_wolf_chat_thought_renders_dim_red(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (WOLF_CHAT thought)
    Mock: なし
    Level: unit
    Objective: WOLF_CHAT.reasoning が dim red スタイルで描画されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.WOLF_CHAT,
        agent="Wolf1",
        content="Wolf1: let's attack Alice",
        reasoning="secret plan",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "secret plan" in result.plain
    spans = [s for s in result._spans if s.style == "dim red"]
    assert len(spans) > 0


def test_wolf_chat_legacy_think_prefix_renders_dim_red(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (WOLF_CHAT legacy thought)
    Mock: なし
    Level: unit
    Objective: 旧ログの WOLF_CHAT [THINK] 行が dim red スタイルで描画されること。
    """
    renderer = Renderer([], spectator_mode=True)
    event = _make_event(
        EventType.WOLF_CHAT,
        agent="Wolf1",
        content="[THINK] secret plan",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[WOLF] [THINK] secret plan" in result.plain
    assert "secret plan" in result.plain
    spans = [s for s in result._spans if s.style == "dim red"]
    assert len(spans) > 0


# ── ROLE_ASSIGNED ─────────────────────────────────────────────────────────────


def test_role_assigned_summary_renders_cyan(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (ROLE_ASSIGNED summary)
    Mock: なし
    Level: unit
    Objective: summary イベント（agent=None）が [ROLE] プレフィックス付きで cyan スタイルで描画されること
    """
    renderer = Renderer([], spectator_mode=False)
    event = LogEvent.make(
        day=0,
        phase="init",
        event_type=EventType.ROLE_ASSIGNED,
        agent=None,
        content="This village has 3 Villagers · 1 Seer · 1 Werewolf",
        is_public=True,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[ROLE]" in result.plain
    assert "This village has" in result.plain
    spans = [s for s in result._spans if s.style == "cyan"]
    assert len(spans) > 0


def test_role_assigned_per_agent_renders_role_color_in_spectator(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (ROLE_ASSIGNED per-agent, spectator mode)
    Mock: なし
    Level: unit
    Objective: per-agent イベントが spectator mode でエージェントの role.color で描画されること
    """
    actor = make_test_actor("Alice", "Seer")
    renderer = Renderer([actor], spectator_mode=True)
    event = LogEvent.make(
        day=0,
        phase="init",
        event_type=EventType.ROLE_ASSIGNED,
        agent="Alice",
        content="Alice came to realize they were the Seer.",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is not None
    assert "[ROLE]" in result.plain
    assert "Alice" in result.plain
    seer_color = actor.role.color
    spans = [s for s in result._spans if s.style == seer_color]
    assert len(spans) > 0


def test_role_assigned_per_agent_hidden_in_public_mode(make_test_actor) -> None:
    """
    SUT: Renderer.on_event (ROLE_ASSIGNED per-agent, public mode)
    Mock: なし
    Level: unit
    Objective: per-agent イベント（is_public=False）が public mode で非表示になること
    """
    actor = make_test_actor("Alice", "Seer")
    renderer = Renderer([actor], spectator_mode=False)
    event = LogEvent.make(
        day=0,
        phase="init",
        event_type=EventType.ROLE_ASSIGNED,
        agent="Alice",
        content="Alice came to realize they were the Seer.",
        is_public=False,
    )

    result = renderer.on_event(event)

    assert result is None


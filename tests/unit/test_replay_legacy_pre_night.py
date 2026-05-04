from pathlib import Path

from src.logger.reader import load_events
from src.ui.renderer import Renderer


def test_load_events_and_renderer_support_legacy_pre_night_entries(make_test_actor, tmp_path: Path):
    """
    SUT: load_events(), Renderer.on_event()
    Mock: なし
    Level: unit
    Objective: Legacy-Adapter として archived PRE_NIGHT replay イベントを読めて描画できること。
    """
    log_path = tmp_path / "spectator_log.jsonl"
    log_path.write_text(
        (
            '{"day":1,"phase":"pre_night","event_type":"pre_night_decision",'
            '"agent":"Wolf","content":"Wolf decided to CO.","is_public":false}\n'
        ),
        encoding="utf-8",
    )

    events = load_events(log_path)

    assert len(events) == 1
    assert events[0].phase == "pre_night"
    assert events[0].event_type.value == "pre_night_decision"

    renderer = Renderer([make_test_actor("Wolf", "Werewolf")], spectator_mode=True)
    rendered = renderer.on_event(events[0])

    assert rendered is not None
    assert "[PRE-NIGHT]" in rendered.plain

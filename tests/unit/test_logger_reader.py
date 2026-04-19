"""Unit tests for src/logger/reader.py — load_events()."""
from pathlib import Path

from src.domain.event import EventType, LogEvent
from src.logger.reader import load_events


def _make_event(day: int = 1, content: str = "hello") -> LogEvent:
    return LogEvent.make(
        day=day,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content=content,
        is_public=True,
    )


def test_load_events_returns_empty_for_missing_file(tmp_path: Path) -> None:
    result = load_events(tmp_path / "nonexistent.jsonl")
    assert result == []


def test_load_events_returns_empty_for_empty_file(tmp_path: Path) -> None:
    p = tmp_path / "log.jsonl"
    p.write_text("", encoding="utf-8")
    assert load_events(p) == []


def test_load_events_parses_single_event(tmp_path: Path) -> None:
    event = _make_event()
    p = tmp_path / "log.jsonl"
    p.write_text(event.model_dump_json() + "\n", encoding="utf-8")

    result = load_events(p)
    assert len(result) == 1
    assert result[0].agent == "Alice"
    assert result[0].event_type == EventType.SPEECH


def test_load_events_parses_multiple_events(tmp_path: Path) -> None:
    events = [_make_event(day=i, content=f"msg {i}") for i in range(1, 4)]
    p = tmp_path / "log.jsonl"
    p.write_text("\n".join(e.model_dump_json() for e in events), encoding="utf-8")

    result = load_events(p)
    assert len(result) == 3
    assert [r.day for r in result] == [1, 2, 3]


def test_load_events_skips_blank_lines(tmp_path: Path) -> None:
    event = _make_event()
    p = tmp_path / "log.jsonl"
    p.write_text(f"\n{event.model_dump_json()}\n\n", encoding="utf-8")

    result = load_events(p)
    assert len(result) == 1


def test_load_events_skips_corrupted_lines_with_warning(tmp_path: Path) -> None:
    """壊れた行はスキップされ、警告が出て、正常な行は読み込まれること。"""
    good = _make_event(day=1)
    p = tmp_path / "log.jsonl"
    p.write_text(
        good.model_dump_json() + "\n" + "NOT_JSON\n" + _make_event(day=2).model_dump_json() + "\n",
        encoding="utf-8",
    )

    import warnings

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = load_events(p)

    assert len(result) == 2
    assert any("corrupted" in str(w.message).lower() for w in caught)


def test_load_events_skips_invalid_schema_with_warning(tmp_path: Path) -> None:
    """JSON だがスキーマが壊れた行もスキップされること。"""
    p = tmp_path / "log.jsonl"
    p.write_text('{"invalid": true}\n', encoding="utf-8")

    import warnings

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = load_events(p)

    assert result == []
    assert len(caught) == 1

"""
リプレイモードのテスト。

- run_replay は anthropic.Anthropic を一切呼ばない（LLMフリー）
- ReplayPager がアーカイブを正しく読み込む
- ArchiveSelector がアーカイブなしのとき None を返す
"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from src.domain.event import EventType, LogEvent
from src.ui.replay import ArchiveSelector, ReplayPager, run_replay
from tests.conftest import make_legacy_agent_json, make_split_agent_json


def _make_event_jsonl(*events: LogEvent) -> str:
    return "\n".join(e.model_dump_json() for e in events)


@pytest.fixture()
def tmp_archive(tmp_path: Path) -> Path:
    """Minimal archive with 2 agents and a public log."""
    archive = tmp_path / "20260101_000000"
    agents_dir = archive / "agents"
    agents_dir.mkdir(parents=True)

    (agents_dir / "alice.json").write_text(
        json.dumps(make_legacy_agent_json("Alice", "Villager")), encoding="utf-8"
    )
    (agents_dir / "bob.json").write_text(
        json.dumps(make_split_agent_json("Bob", "Werewolf")), encoding="utf-8"
    )

    event = LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="Hello everyone.",
        is_public=True,
    )
    (archive / "public_log.jsonl").write_text(
        _make_event_jsonl(event), encoding="utf-8"
    )
    (archive / "spectator_log.jsonl").write_text(
        _make_event_jsonl(event), encoding="utf-8"
    )
    return archive


# ── LLM非呼び出し保証 ────────────────────────────────────────────────────────


def test_replay_does_not_call_llm(tmp_archive: Path) -> None:
    """リプレイモードでは anthropic.Anthropic のインスタンスが生成されないこと。"""
    with patch("anthropic.Anthropic") as mock_client:
        # _getch を 'q' を即時返すようモック（ページャーを即終了）
        with patch("src.ui.replay._getch", return_value="q"):
            run_replay(spectator_mode=False, archive_path=tmp_archive)
        mock_client.assert_not_called()


def test_replay_spectator_does_not_call_llm(tmp_archive: Path) -> None:
    """spectatorモードのリプレイでも LLM を呼ばないこと。"""
    with patch("anthropic.Anthropic") as mock_client:
        with patch("src.ui.replay._getch", return_value="q"):
            run_replay(spectator_mode=True, archive_path=tmp_archive)
        mock_client.assert_not_called()


# ── ReplayPager ──────────────────────────────────────────────────────────────


def test_pager_loads_agents(tmp_archive: Path) -> None:
    """アーカイブから正しく Actor が読み込まれること。"""
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    names = {a.name for a in pager._agents}
    assert names == {"Alice", "Bob"}


def test_pager_builds_lines(tmp_archive: Path) -> None:
    """publicモードでイベントが1行以上レンダリングされること。"""
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    assert len(pager._lines) >= 1


def test_pager_spectator_shows_more_lines(tmp_archive: Path) -> None:
    """spectatorモードはpublicモード以上の行数を持つこと（同じログなら同数以上）。"""
    public_pager = ReplayPager(tmp_archive, spectator_mode=False)
    spectator_pager = ReplayPager(tmp_archive, spectator_mode=True)
    assert len(spectator_pager._lines) >= len(public_pager._lines)


# ── ArchiveSelector ──────────────────────────────────────────────────────────


def test_selector_returns_none_when_no_archives(tmp_path: Path) -> None:
    """アーカイブが0件のとき None を返すこと。"""
    empty_dir = tmp_path / "state_archive"
    empty_dir.mkdir()
    selector = ArchiveSelector(empty_dir)
    result = selector.select()
    assert result is None


def test_selector_returns_none_when_dir_missing(tmp_path: Path) -> None:
    """state_archive/ ディレクトリが存在しないとき None を返すこと。"""
    selector = ArchiveSelector(tmp_path / "nonexistent")
    result = selector.select()
    assert result is None


# ── ReplayPager エラーハンドリング (#105) ─────────────────────────────────────


def test_pager_loads_empty_when_agents_dir_missing(tmp_path: Path) -> None:
    """agents/ ディレクトリが存在しないとき空リストを返し、クラッシュしないこと。"""
    archive = tmp_path / "20260101_000000"
    archive.mkdir()
    event = LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="Hello.",
        is_public=True,
    )
    (archive / "public_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")
    (archive / "spectator_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")

    import sys
    from io import StringIO

    captured = StringIO()
    with patch.object(sys, "stderr", captured):
        pager = ReplayPager(archive, spectator_mode=False)

    assert pager._agents == []
    assert "agents/ directory not found" in captured.getvalue()


def test_pager_skips_corrupt_agent_file(tmp_path: Path) -> None:
    """agents/ 内の壊れた JSON ファイルはスキップされ、正常ファイルは読み込まれること。"""
    archive = tmp_path / "20260101_000000"
    agents_dir = archive / "agents"
    agents_dir.mkdir(parents=True)

    good_data = make_split_agent_json("Alice", "Villager")
    (agents_dir / "alice.json").write_text(json.dumps(good_data), encoding="utf-8")
    (agents_dir / "bob.json").write_text("NOT_JSON", encoding="utf-8")

    event = LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="Hello.",
        is_public=True,
    )
    (archive / "public_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")
    (archive / "spectator_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")

    import sys
    from io import StringIO

    captured = StringIO()
    with patch.object(sys, "stderr", captured):
        pager = ReplayPager(archive, spectator_mode=False)

    assert len(pager._agents) == 1
    assert pager._agents[0].name == "Alice"
    assert "bob.json" in captured.getvalue()


def test_pager_loads_legacy_agent_json_without_profile(tmp_path: Path) -> None:
    archive = tmp_path / "20260101_000000"
    agents_dir = archive / "agents"
    agents_dir.mkdir(parents=True)

    (agents_dir / "alice.json").write_text(
        json.dumps(make_legacy_agent_json("Alice", "Villager")),
        encoding="utf-8",
    )
    event = LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="Hello.",
        is_public=True,
    )
    (archive / "public_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")
    (archive / "spectator_log.jsonl").write_text(event.model_dump_json(), encoding="utf-8")

    pager = ReplayPager(archive, spectator_mode=False)

    assert len(pager._agents) == 1
    assert pager._agents[0].name == "Alice"

"""
リプレイモードのテスト。

- run_replay は anthropic.Anthropic を一切呼ばない（LLMフリー）
- ReplayPager がアーカイブを正しく読み込む
- ArchiveSelector がアーカイブなしのとき None を返す
"""
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

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


# ── _getch() key normalization (#183) ────────────────────────────────────────


def test_getch_normalizes_arrow_keys() -> None:
    """
    SUT: _getch()
    Mock: readchar.readkey — arrow key raw bytes を返すように差し替え
    Level: unit
    Objective: UP/DOWN/LEFT/RIGHT の raw bytes が対応する文字列にマップされること。
    """
    import readchar as rc

    from src.ui.replay import _getch

    arrow_cases = [
        (rc.key.UP, "UP"),
        (rc.key.DOWN, "DOWN"),
        (rc.key.LEFT, "LEFT"),
        (rc.key.RIGHT, "RIGHT"),
    ]
    for raw_key, expected in arrow_cases:
        with patch("readchar.readkey", return_value=raw_key):
            assert _getch() == expected, f"expected {expected!r} for raw {raw_key!r}"


def test_getch_passes_through_unmapped_key() -> None:
    """
    SUT: _getch()
    Mock: readchar.readkey — マッピング外のキー 'q' を返すように差し替え
    Level: unit
    Objective: マッピングに存在しないキーはそのまま返ること。
    """
    from src.ui.replay import _getch

    with patch("readchar.readkey", return_value="q"):
        assert _getch() == "q"


# ── ArchiveSelector navigation (#183) ────────────────────────────────────────


@pytest.fixture()
def tmp_archive_dir(tmp_path: Path) -> Path:
    """Archive directory with 3 sub-archives for selector navigation tests."""
    arch_dir = tmp_path / "state_archive"
    for name in ["20260101_000000", "20260102_000000", "20260103_000000"]:
        (arch_dir / name).mkdir(parents=True)
    return arch_dir


def test_selector_navigates_and_selects(tmp_archive_dir: Path) -> None:
    """
    SUT: ArchiveSelector.select()
    Mock: _getch (side_effect キューで操作シーケンスを再現), _clear (stdout汚染回避)
    Level: unit
    Objective: DOWN→DOWN→UP→Enter のキー操作でカーソルが1番目のアーカイブを選択して返ること。
    """
    keys = iter(["DOWN", "DOWN", "UP", "\r"])
    selector = ArchiveSelector(tmp_archive_dir)
    with patch("src.ui.replay._getch", side_effect=keys), patch("src.ui.replay._clear"):
        result = selector.select()

    archives = sorted(
        [p for p in tmp_archive_dir.iterdir() if p.is_dir()], reverse=True
    )
    assert result == archives[1]


def test_selector_returns_none_on_quit_with_archives(tmp_archive_dir: Path) -> None:
    """
    SUT: ArchiveSelector.select()
    Mock: _getch (即座に 'q' を返す), _clear (stdout汚染回避)
    Level: unit
    Objective: アーカイブが存在する状態で 'q' を押すと None が返ること。
    """
    selector = ArchiveSelector(tmp_archive_dir)
    with patch("src.ui.replay._getch", return_value="q"), patch("src.ui.replay._clear"):
        result = selector.select()

    assert result is None


# ── ReplayPager end-of-replay controls (#183) ────────────────────────────────


def test_pager_end_of_replay_q_quits(tmp_archive: Path) -> None:
    """
    SUT: ReplayPager.run()
    Mock: _getch (即 'q'), _clear, shutil.get_terminal_size (十分な高さを返す)
    Level: unit
    Objective: 末尾表示中に 'q' を押すとページャーが終了すること。
    """
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    large_size = MagicMock()
    large_size.lines = len(pager._lines) + 10
    large_size.columns = 80

    with (
        patch("src.ui.replay._getch", return_value="q"),
        patch("src.ui.replay._clear"),
        patch("shutil.get_terminal_size", return_value=large_size),
    ):
        pager.run()


def test_pager_end_of_replay_k_scrolls_up(tmp_archive: Path) -> None:
    """
    SUT: ReplayPager.run()
    Mock: _getch (side_effect: 'k' then 'q'), _clear, shutil.get_terminal_size
    Level: unit
    Objective: 末尾表示中に 'k' を押すと1行戻り、その後 'q' で終了できること。
    """
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    large_size = MagicMock()
    large_size.lines = len(pager._lines) + 10
    large_size.columns = 80

    keys = iter(["k", "q"])
    with (
        patch("src.ui.replay._getch", side_effect=keys),
        patch("src.ui.replay._clear"),
        patch("shutil.get_terminal_size", return_value=large_size),
    ):
        pager.run()


def test_pager_end_of_replay_b_scrolls_page_up(tmp_archive: Path) -> None:
    """
    SUT: ReplayPager.run()
    Mock: _getch (side_effect: 'b' then 'q'), _clear, shutil.get_terminal_size
    Level: unit
    Objective: 末尾表示中に 'b' を押すとpage_size分戻り、その後 'q' で終了できること。
    """
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    large_size = MagicMock()
    large_size.lines = len(pager._lines) + 10
    large_size.columns = 80

    keys = iter(["b", "q"])
    with (
        patch("src.ui.replay._getch", side_effect=keys),
        patch("src.ui.replay._clear"),
        patch("shutil.get_terminal_size", return_value=large_size),
    ):
        pager.run()


def test_pager_end_of_replay_g_goes_to_top(tmp_archive: Path) -> None:
    """
    SUT: ReplayPager.run()
    Mock: _getch (side_effect: 'g' then 'q'), _clear, shutil.get_terminal_size
    Level: unit
    Objective: 末尾表示中に 'g' を押すとトップに戻り、その後 'q' で終了できること。
    """
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    large_size = MagicMock()
    large_size.lines = len(pager._lines) + 10
    large_size.columns = 80

    keys = iter(["g", "q"])
    with (
        patch("src.ui.replay._getch", side_effect=keys),
        patch("src.ui.replay._clear"),
        patch("shutil.get_terminal_size", return_value=large_size),
    ):
        pager.run()


# ── run_replay() entry paths (#183) ──────────────────────────────────────────


def test_run_replay_calls_archive_selector_when_no_archive(tmp_path: Path) -> None:
    """
    SUT: run_replay()
    Mock: ArchiveSelector.select (None を返す)
    Level: unit
    Objective: archive_path=None のとき ArchiveSelector.select() が呼ばれること。
    """
    with patch("src.ui.replay.ArchiveSelector") as mock_selector_cls:
        mock_selector_cls.return_value.select.return_value = None
        run_replay(spectator_mode=False, archive_path=None)
        mock_selector_cls.return_value.select.assert_called_once()


def test_run_replay_does_not_create_pager_when_selector_returns_none(tmp_path: Path) -> None:
    """
    SUT: run_replay()
    Mock: ArchiveSelector.select (None を返す), ReplayPager (呼ばれないことを確認)
    Level: unit
    Objective: ArchiveSelector が None を返したとき ReplayPager が生成されないこと。
    """
    with (
        patch("src.ui.replay.ArchiveSelector") as mock_selector_cls,
        patch("src.ui.replay.ReplayPager") as mock_pager_cls,
    ):
        mock_selector_cls.return_value.select.return_value = None
        run_replay(spectator_mode=False, archive_path=None)
        mock_pager_cls.assert_not_called()

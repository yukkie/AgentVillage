"""src/logger/writer.py の LogWriter / archive_state() のテスト。"""
from pathlib import Path
from unittest.mock import patch

from src.logger.writer import LogWriter


def _make_state(tmp_path: Path) -> tuple[Path, Path, Path]:
    """テスト用の state/ 構造を作成して返す。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    stats_dir = tmp_path / "stats"
    stats_dir.mkdir()
    public_log = tmp_path / "public_log.jsonl"
    spectator_log = tmp_path / "spectator_log.jsonl"
    return agents_dir, public_log, spectator_log


def test_log_writer_clears_agent_json(tmp_path: Path) -> None:
    """
    SUT: LogWriter.__init__
    Mock: src.logger.writer の LOG_DIR / PUBLIC_LOG / SPECTATOR_LOG / AGENTS_DIR を tmp_path 配下に差し替え
    Level: unit
    Objective: LogWriter 生成時に state/agents/*.json が削除されること
    """
    agents_dir, public_log, spectator_log = _make_state(tmp_path)
    stale = agents_dir / "wolf1.json"
    stale.write_text("{}", encoding="utf-8")

    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", public_log),
        patch("src.logger.writer.SPECTATOR_LOG", spectator_log),
        patch("src.logger.writer.AGENTS_DIR", agents_dir),
    ):
        LogWriter()

    assert not stale.exists()


def test_log_writer_preserves_stats(tmp_path: Path) -> None:
    """
    SUT: LogWriter.__init__
    Mock: src.logger.writer のパス定数を tmp_path 配下に差し替え
    Level: unit
    Objective: LogWriter 生成時に state/stats/ 配下のファイルが削除されないこと
    """
    agents_dir, public_log, spectator_log = _make_state(tmp_path)
    stats_file = tmp_path / "stats" / "game_stats.json"
    stats_file.write_text("[]", encoding="utf-8")

    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", public_log),
        patch("src.logger.writer.SPECTATOR_LOG", spectator_log),
        patch("src.logger.writer.AGENTS_DIR", agents_dir),
    ):
        LogWriter()

    assert stats_file.exists()


def test_log_writer_clears_multiple_agent_json(tmp_path: Path) -> None:
    """
    SUT: LogWriter.__init__
    Mock: src.logger.writer のパス定数を tmp_path 配下に差し替え
    Level: unit
    Objective: state/agents/ 内の複数 JSON がすべて削除されること
    """
    agents_dir, public_log, spectator_log = _make_state(tmp_path)
    files = [agents_dir / f"{name}.json" for name in ("alice", "wolf1", "wolf2")]
    for f in files:
        f.write_text("{}", encoding="utf-8")

    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", public_log),
        patch("src.logger.writer.SPECTATOR_LOG", spectator_log),
        patch("src.logger.writer.AGENTS_DIR", agents_dir),
    ):
        LogWriter()

    assert not any(f.exists() for f in files)


def test_log_writer_no_error_when_agents_dir_empty(tmp_path: Path) -> None:
    """
    SUT: LogWriter.__init__
    Mock: src.logger.writer のパス定数を tmp_path 配下に差し替え
    Level: unit
    Objective: state/agents/ が空のときでもエラーなく初期化できること
    """
    agents_dir, public_log, spectator_log = _make_state(tmp_path)

    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", public_log),
        patch("src.logger.writer.SPECTATOR_LOG", spectator_log),
        patch("src.logger.writer.AGENTS_DIR", agents_dir),
    ):
        LogWriter()  # エラーが出なければ OK

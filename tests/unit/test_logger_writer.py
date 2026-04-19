"""Unit tests for src/logger/writer.py — LogWriter.write()."""
from pathlib import Path
from unittest.mock import patch

from src.domain.event import EventType, LogEvent


def _make_event(is_public: bool = True) -> LogEvent:
    return LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="hello",
        is_public=is_public,
    )


def test_write_creates_log_files(tmp_path: Path) -> None:
    """正常系: ログファイルにイベントが書き込まれること。"""
    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", tmp_path / "public_log.jsonl"),
        patch("src.logger.writer.SPECTATOR_LOG", tmp_path / "spectator_log.jsonl"),
    ):
        from src.logger.writer import LogWriter

        writer = LogWriter()
        writer.write(_make_event(is_public=True))

        assert (tmp_path / "spectator_log.jsonl").read_text(encoding="utf-8").strip()
        assert (tmp_path / "public_log.jsonl").read_text(encoding="utf-8").strip()


def test_write_ioerror_prints_to_stderr_and_does_not_raise(tmp_path: Path) -> None:
    """IOError 発生時にゲームが止まらず stderr に出力されること。"""
    with (
        patch("src.logger.writer.LOG_DIR", tmp_path),
        patch("src.logger.writer.PUBLIC_LOG", tmp_path / "public_log.jsonl"),
        patch("src.logger.writer.SPECTATOR_LOG", tmp_path / "spectator_log.jsonl"),
    ):
        from src.logger.writer import LogWriter

        writer = LogWriter()

        import io
        fake_stderr = io.StringIO()
        # Path.open を IOError に差し替え（LogWriter.__init__ 後なので write() だけに作用）
        with patch("pathlib.Path.open", side_effect=IOError("disk full")):
            with patch("src.logger.writer.sys.stderr", fake_stderr):
                writer.write(_make_event())
        assert "disk full" in fake_stderr.getvalue()

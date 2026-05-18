import shutil
import sys
from datetime import datetime
from pathlib import Path

from src.config import ARCHIVE_DIR, LOG_DIR, SPECTATOR_LOG, AGENTS_DIR
from src.domain.event import LogEvent


def archive_state() -> Path | None:
    """Archive the current state/ folder to state_archive/YYYYMMDD_HHMMSS/.

    Returns the archive path, or None if there was nothing to archive.
    """
    if not SPECTATOR_LOG.exists() or SPECTATOR_LOG.stat().st_size == 0:
        return None
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ARCHIVE_DIR / timestamp
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(LOG_DIR), str(dest))
    return dest


class LogWriter:
    def __init__(self) -> None:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        AGENTS_DIR.mkdir(parents=True, exist_ok=True)
        SPECTATOR_LOG.write_text("", encoding="utf-8")
        for f in AGENTS_DIR.glob("*.json"):
            f.unlink()

    def write(self, event: LogEvent) -> None:
        line = event.model_dump_json() + "\n"
        try:
            with SPECTATOR_LOG.open("a", encoding="utf-8") as f:
                f.write(line)
        except IOError as e:
            print(f"[LogWriter] write failed: {e}", file=sys.stderr)

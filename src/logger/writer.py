import shutil
from datetime import datetime
from pathlib import Path

from src.logger.event import LogEvent
from src.logger.logger import ARCHIVE_DIR, PUBLIC_LOG, SPECTATOR_LOG, STATE_DIR


def archive_state() -> Path | None:
    """Archive the current state/ folder to state_archive/YYYYMMDD_HHMMSS/.

    Returns the archive path, or None if there was nothing to archive.
    """
    if not PUBLIC_LOG.exists() or PUBLIC_LOG.stat().st_size == 0:
        return None
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ARCHIVE_DIR / timestamp
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(STATE_DIR), str(dest))
    return dest


class LogWriter:
    def __init__(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        # Clear logs at start of new game
        PUBLIC_LOG.write_text("", encoding="utf-8")
        SPECTATOR_LOG.write_text("", encoding="utf-8")

    def write(self, event: LogEvent) -> None:
        line = event.model_dump_json() + "\n"
        # Spectator log contains everything
        with SPECTATOR_LOG.open("a", encoding="utf-8") as f:
            f.write(line)
        # Public log only contains public events
        if event.is_public:
            with PUBLIC_LOG.open("a", encoding="utf-8") as f:
                f.write(line)

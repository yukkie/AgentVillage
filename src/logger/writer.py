from pathlib import Path

from src.logger.event import LogEvent

STATE_DIR = Path("state")
PUBLIC_LOG = STATE_DIR / "public_log.jsonl"
SPECTATOR_LOG = STATE_DIR / "spectator_log.jsonl"


class LogWriter:
    def __init__(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        # Clear logs at start of new game
        PUBLIC_LOG.write_text("")
        SPECTATOR_LOG.write_text("")

    def write(self, event: LogEvent) -> None:
        line = event.model_dump_json() + "\n"
        # Spectator log contains everything
        with SPECTATOR_LOG.open("a") as f:
            f.write(line)
        # Public log only contains public events
        if event.is_public:
            with PUBLIC_LOG.open("a") as f:
                f.write(line)

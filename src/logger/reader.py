"""JSONL log reading utilities shared across UI and future tooling."""
import json
from pathlib import Path

from src.logger.event import LogEvent


def load_events(path: Path) -> list[LogEvent]:
    """Load all LogEvents from a JSONL file.

    Returns an empty list if the file does not exist or is empty.
    """
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            events.append(LogEvent.model_validate(json.loads(line)))
    return events

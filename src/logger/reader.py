"""JSONL log reading utilities shared across UI and future tooling."""
import json
import warnings
from pathlib import Path

from src.domain.event import LogEvent


def load_events(path: Path) -> list[LogEvent]:
    """Load all LogEvents from a JSONL file.

    Returns an empty list if the file does not exist or is empty.
    """
    if not path.exists():
        return []
    events = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            events.append(LogEvent.model_validate(json.loads(line)))
        except Exception as e:
            warnings.warn(f"Skipping corrupted log line: {e}", stacklevel=2)
    return events

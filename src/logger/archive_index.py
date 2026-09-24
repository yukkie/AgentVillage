"""Generate state_archive/index.json from archived game sessions.

Reads each session under state_archive/ and extracts game metadata from
spectator_log.jsonl and agents/*.json. The resulting index.json is consumed
by the frontend via archiveLoader.js.

Called automatically from main.py after a CLI game is archived, and also
runnable manually via `python tools/generate_archive_index.py`.
"""

import json
import re

from src.config import ARCHIVE_DIR

OUTPUT_PATH = ARCHIVE_DIR / "index.json"

_WINNER_MAP = {
    "villagers win": "village",
    "werewolves win": "wolf",
}

_SESSION_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$")


def _parse_session(session_id: str, session_dir) -> dict | None:
    log_path = session_dir / "spectator_log.jsonl"
    agents_dir = session_dir / "agents"

    if not log_path.is_file() or not agents_dir.is_dir():
        return None

    events = []
    with log_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))

    game_over = next(
        (e for e in events if e.get("event_type") == "game_over"), None
    )

    winner = None
    if game_over:
        content_lower = game_over.get("content", "").lower()
        for keyword, value in _WINNER_MAP.items():
            if keyword in content_lower:
                winner = value
                break

    max_day = max((e.get("day", 0) for e in events), default=0)

    agent_files = [f.name for f in agents_dir.glob("*.json")]
    cast = [f.rsplit(".json", 1)[0].capitalize() for f in sorted(agent_files)]

    date_str = None
    m = _SESSION_RE.match(session_id)
    if m:
        y, mo, d, h, mi, s = m.groups()
        date_str = f"{y}-{mo}-{d}T{h}:{mi}:{s}"

    return {
        "session_id": session_id,
        "date": date_str,
        "agent_count": len(agent_files),
        "days": max_day,
        "winner": winner,
        "cast": cast,
        "live": False,
    }


def generate_archive_index() -> int:
    """Regenerate state_archive/index.json from all archived sessions.

    Returns the number of session entries written.

    Raises if ARCHIVE_DIR does not exist or a session cannot be read; callers
    that must not fail the caller's own flow (e.g. main.py after a game)
    should catch exceptions around this call.
    """
    sessions = sorted(
        d.name for d in ARCHIVE_DIR.iterdir()
        if d.is_dir() and _SESSION_RE.match(d.name)
    )

    entries = []
    for session_id in sessions:
        entry = _parse_session(session_id, ARCHIVE_DIR / session_id)
        if entry is not None:
            entries.append(entry)

    # newest first
    entries.reverse()

    OUTPUT_PATH.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(entries)

"""Generate state_archive/index.json from archived game sessions.

Run from the repository root:
    python tools/generate_archive_index.py

Reads each session under state_archive/ and extracts game metadata from
public_log.jsonl and agents/*.json. The resulting index.json is consumed
by the frontend via archiveLoader.js.
"""

import json
import os
import re
import sys

ARCHIVE_DIR = os.path.join(os.path.dirname(__file__), "..", "state_archive")
OUTPUT_PATH = os.path.join(ARCHIVE_DIR, "index.json")

_WINNER_MAP = {
    "villagers win": "village",
    "werewolves win": "wolf",
}

_SESSION_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$")


def parse_session(session_id: str, session_dir: str) -> dict | None:
    log_path = os.path.join(session_dir, "public_log.jsonl")
    agents_dir = os.path.join(session_dir, "agents")

    if not os.path.isfile(log_path) or not os.path.isdir(agents_dir):
        return None

    events = []
    with open(log_path, encoding="utf-8") as f:
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

    agent_files = [f for f in os.listdir(agents_dir) if f.endswith(".json")]
    cast = [os.path.splitext(f)[0].capitalize() for f in sorted(agent_files)]

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


def main() -> None:
    if not os.path.isdir(ARCHIVE_DIR):
        print(f"ERROR: {ARCHIVE_DIR} not found", file=sys.stderr)
        sys.exit(1)

    sessions = sorted(
        d for d in os.listdir(ARCHIVE_DIR)
        if os.path.isdir(os.path.join(ARCHIVE_DIR, d)) and _SESSION_RE.match(d)
    )

    entries = []
    for session_id in sessions:
        session_dir = os.path.join(ARCHIVE_DIR, session_id)
        entry = parse_session(session_id, session_dir)
        if entry is not None:
            entries.append(entry)

    # newest first
    entries.reverse()

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"Generated {OUTPUT_PATH} ({len(entries)} sessions)")


if __name__ == "__main__":
    main()

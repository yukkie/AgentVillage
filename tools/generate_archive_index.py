"""Generate state_archive/index.json from archived game sessions.

Run from the repository root:
    python tools/generate_archive_index.py

This is a thin entrypoint; the actual logic lives in
src/logger/archive_index.py and is also invoked automatically by main.py
after a CLI game is archived.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.logger.archive_index import OUTPUT_PATH, generate_archive_index  # noqa: E402


def main() -> None:
    count = generate_archive_index()
    print(f"Generated {OUTPUT_PATH} ({count} sessions)")


if __name__ == "__main__":
    main()

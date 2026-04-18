from pathlib import Path

# Game settings
DISCUSSION_ROUNDS = 2
WOLF_CHAT_ROUNDS = 3

# Environment
PROJECT_ROOT = Path(__file__).parent.parent
STATE_DIR = PROJECT_ROOT / "state/agents"
LOG_DIR = PROJECT_ROOT / "state"
PUBLIC_LOG = LOG_DIR / "public_log.jsonl"
SPECTATOR_LOG = LOG_DIR / "spectator_log.jsonl"
ARCHIVE_DIR = PROJECT_ROOT / "state_archive"

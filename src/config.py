import json
from pathlib import Path

# Game settings
DISCUSSION_ROUNDS = 3
WOLF_CHAT_ROUNDS = 3

# Environment
PROJECT_ROOT = Path(__file__).parent.parent
PUBLIC_CONFIG_DIR = PROJECT_ROOT / "frontend" / "public" / "config"
AGENT_CONFIG_PATH = PUBLIC_CONFIG_DIR / "agents.json"
ROLE_CONFIG_PATH = PUBLIC_CONFIG_DIR / "roles.json"
TOKEN_CONFIG_PATH = PUBLIC_CONFIG_DIR / "tokens.json"
AGENTS_DIR = PROJECT_ROOT / "state/agents"
LOG_DIR = PROJECT_ROOT / "state"
SPECTATOR_LOG = LOG_DIR / "spectator_log.jsonl"
ARCHIVE_DIR = PROJECT_ROOT / "state_archive"

# LLM token limits
MAX_TOKENS: dict[str, int] = json.loads(TOKEN_CONFIG_PATH.read_text(encoding="utf-8"))

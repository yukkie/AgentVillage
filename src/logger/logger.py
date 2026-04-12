"""Shared constants for the logger package."""
from pathlib import Path

STATE_DIR = Path("state")
PUBLIC_LOG = STATE_DIR / "public_log.jsonl"
SPECTATOR_LOG = STATE_DIR / "spectator_log.jsonl"
ARCHIVE_DIR = Path("state_archive")

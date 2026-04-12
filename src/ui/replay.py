"""Replay mode: archive selector UI + pager for JSONL log files."""
from __future__ import annotations

import os
import shutil
import sys
from io import StringIO
from pathlib import Path

import msvcrt
from rich.console import Console
from rich.text import Text

from src.agent import store
from src.agent.state import AgentState
from src.logger.event import EventType, LogEvent
from src.logger.reader import load_events
from src.ui.renderer import render_event

ARCHIVE_DIR = Path("state_archive")


def _getch() -> str:
    """Read a single keypress from the terminal (Windows msvcrt)."""
    ch = msvcrt.getch()
    if ch in (b"\x00", b"\xe0"):
        ch2 = msvcrt.getch()
        mapping = {b"H": "UP", b"P": "DOWN", b"K": "LEFT", b"M": "RIGHT"}
        return mapping.get(ch2, "UNKNOWN")
    try:
        return ch.decode("utf-8")
    except Exception:
        return ""


def _clear() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def _render_rich_to_lines(text: Text, width: int) -> list[str]:
    """Render a rich Text object to a list of ANSI-colored strings (one per line)."""
    sio = StringIO()
    c = Console(file=sio, force_terminal=True, width=width, highlight=False)
    c.print(text, end="")
    raw = sio.getvalue()
    return raw.split("\n")


class ArchiveSelector:
    """Interactive archive selection UI with arrow-key navigation."""

    def __init__(self, archive_dir: Path = ARCHIVE_DIR) -> None:
        self._dir = archive_dir

    def select(self) -> Path | None:
        if not self._dir.exists():
            print("No archives found.")
            return None

        archives = sorted(
            [p for p in self._dir.iterdir() if p.is_dir()],
            reverse=True,
        )
        if not archives:
            print("No archives found.")
            return None

        cursor = 0
        while True:
            _clear()
            print("Select an archive to replay:\n")
            for i, arch in enumerate(archives):
                prefix = "  > " if i == cursor else "    "
                print(f"{prefix}{arch.name}")
            print("\n[↑↓] Move  [Enter] Select  [q] Quit")

            key = _getch()
            if key == "UP" and cursor > 0:
                cursor -= 1
            elif key == "DOWN" and cursor < len(archives) - 1:
                cursor += 1
            elif key in ("\r", "\n"):
                _clear()
                return archives[cursor]
            elif key in ("q", "\x1b"):
                _clear()
                return None


class ReplayPager:
    """Pager that displays a JSONL replay log with keyboard navigation."""

    def __init__(self, archive_path: Path, spectator_mode: bool) -> None:
        self._archive = archive_path
        self._spectator = spectator_mode
        self._agents = self._load_agents()
        self._lines = self._build_lines()

    def _load_agents(self) -> list[AgentState]:
        return store.load_all_from_dir(self._archive / "agents")

    def _load_events(self) -> list[LogEvent]:
        log_file = "spectator_log.jsonl" if self._spectator else "public_log.jsonl"
        return load_events(self._archive / log_file)

    def _build_lines(self) -> list[str]:
        width = shutil.get_terminal_size().columns
        events = self._load_events()

        # Reset claimed_role to None so public-mode colors reflect what was
        # publicly known at each moment, not the end-of-game state.
        dynamic_agents = {a.name: a.model_copy() for a in self._agents}
        for a in dynamic_agents.values():
            a.claimed_role = None

        all_lines: list[str] = []
        for event in events:
            # Update claimed_role in real time when a CO is announced.
            # Use event.claimed_role (structured field) rather than parsing content text.
            if event.event_type == EventType.CO_ANNOUNCEMENT and event.agent and event.claimed_role:
                if event.agent in dynamic_agents:
                    dynamic_agents[event.agent].claimed_role = event.claimed_role

            rich_text = render_event(event, list(dynamic_agents.values()), self._spectator)
            if rich_text is None:
                continue
            rendered = _render_rich_to_lines(rich_text, width)
            # Strip trailing empty line that Console.print appends
            while rendered and rendered[-1] == "":
                rendered.pop()
            all_lines.extend(rendered)
        return all_lines

    def run(self) -> None:
        if not self._lines:
            print("No events to display.")
            return

        pos = 0
        while True:
            size = shutil.get_terminal_size()
            page_size = max(1, size.lines - 2)
            total = len(self._lines)

            _clear()
            page_lines = self._lines[pos : pos + page_size]
            sys.stdout.write("\n".join(page_lines))

            end_line = pos + len(page_lines)
            at_end = end_line >= total

            if at_end:
                status = (
                    f"  [End of replay]  (Line {pos + 1}-{end_line} / {total})"
                    "  [k/↑] Line↑  [b] Page↑  [g] Top  [q] Quit"
                )
                sys.stdout.write(f"\n\033[7m{status}\033[0m\n")
                sys.stdout.flush()
                while True:
                    key = _getch()
                    if key in ("q", "\x1b"):
                        _clear()
                        return
                    if key in ("k", "UP") and pos > 0:
                        pos = max(0, pos - 1)
                        break
                    if key in ("b", "\x08") and pos > 0:
                        pos = max(0, pos - page_size)
                        break
                    if key == "g":
                        pos = 0
                        break
                continue

            status = (
                f"  [Space/f]↓Page  [b]↑Page  [j/↓]↓Line  [k/↑]↑Line"
                f"  [g]Top  [G]End  [q]Quit  (Line {pos + 1}-{end_line} / {total})"
            )
            sys.stdout.write(f"\n\033[7m{status}\033[0m")
            sys.stdout.flush()

            key = _getch()
            if key in (" ", "f", "\r", "\n"):
                pos = min(pos + page_size, total - 1)
            elif key in ("b", "\x08"):
                pos = max(0, pos - page_size)
            elif key in ("j", "DOWN"):
                pos = min(pos + 1, total - 1)
            elif key in ("k", "UP"):
                pos = max(0, pos - 1)
            elif key == "g":
                pos = 0
            elif key == "G":
                pos = max(0, total - page_size)
            elif key in ("q", "\x1b"):
                _clear()
                return


def run_replay(spectator_mode: bool, archive_path: Path | None = None) -> None:
    """Entry point for replay mode."""
    if archive_path is None:
        archive_path = ArchiveSelector().select()
    if archive_path is None:
        return
    mode_label = "spectator" if spectator_mode else "public"
    print(f"\nReplaying: {archive_path.name}  [{mode_label} mode]\n")
    pager = ReplayPager(archive_path, spectator_mode)
    pager.run()

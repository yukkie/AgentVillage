import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.table import Table

from src.domain.actor import Actor

STATS_PATH = Path("state/stats/game_stats.json")

_console = Console()


def record_game(agents: list[Actor], winner: str) -> None:
    """Append one game record to STATS_PATH."""
    STATS_PATH.parent.mkdir(parents=True, exist_ok=True)

    if STATS_PATH.exists():
        data = json.loads(STATS_PATH.read_text(encoding="utf-8"))
    else:
        data = {"games": []}

    # faction values from Role.faction: "village" | "werewolf"
    # winner values from check_victory(): "Villagers" | "Werewolves"
    winner_faction = "village" if winner == "Villagers" else "werewolf"

    players = [
        {
            "name": a.name,
            "role": a.role.name,
            "faction": a.role.faction,
            "model": a.model,
            "survived": a.state.is_alive,
            "won": a.role.faction == winner_faction,
        }
        for a in agents
    ]

    data["games"].append({
        "game_id": datetime.now().isoformat(timespec="seconds"),
        "winner": winner,
        "players": players,
    })

    STATS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def show_stats() -> None:
    """Display win-rate tables with Rich (4 views: character / role / faction / model)."""
    if not STATS_PATH.exists():
        _console.print("[yellow]No stats recorded yet. Play a game first.[/yellow]")
        return

    data = json.loads(STATS_PATH.read_text(encoding="utf-8"))
    games = data.get("games", [])
    if not games:
        _console.print("[yellow]No stats recorded yet. Play a game first.[/yellow]")
        return

    _console.print(f"\n[bold]Game Statistics[/bold]  ({len(games)} games total)\n")

    views = [
        ("By Character", "name"),
        ("By Role", "role"),
        ("By Faction", "faction"),
        ("By Model", "model"),
    ]

    for title, key in views:
        totals: dict[str, int] = defaultdict(int)
        wins: dict[str, int] = defaultdict(int)

        for game in games:
            for p in game["players"]:
                group = p[key]
                totals[group] += 1
                if p["won"]:
                    wins[group] += 1

        table = Table(title=title, show_header=True, header_style="bold cyan")
        table.add_column(key.capitalize(), style="white")
        table.add_column("Games", justify="right")
        table.add_column("Wins", justify="right")
        table.add_column("Win Rate", justify="right")

        for group in sorted(totals):
            g = totals[group]
            w = wins[group]
            rate = f"{w / g * 100:.1f}%" if g > 0 else "—"
            table.add_row(group, str(g), str(w), rate)

        _console.print(table)
        _console.print()

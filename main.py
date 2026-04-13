"""
AgentVillage — LLM Werewolf Game

Usage:
    uv run main.py                           # Public mode (English)
    uv run main.py --spectator               # Spectator mode
    uv run main.py --lang Japanese           # Japanese output
    uv run main.py --players 7               # 7-player mode (default: 5)
    uv run main.py --spectator --lang Japanese --players 7
    uv run main.py --replay                  # Replay mode (public)
    uv run main.py --replay --spectator      # Replay mode (spectator)
"""
import argparse
import os
import sys

from dotenv import load_dotenv

load_dotenv()

if not os.environ.get("ANTHROPIC_API_KEY"):
    print("Error: ANTHROPIC_API_KEY is not set.")
    print("Copy .env.example to .env and add your API key.")
    sys.exit(1)

from src.engine.setup import initialize_agents  # noqa: E402
from src.engine.game import GameEngine  # noqa: E402
from src.logger.writer import LogWriter, archive_state  # noqa: E402
from src.ui.cli import CLI  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="AgentVillage — LLM Werewolf Game")
    parser.add_argument(
        "--spectator",
        action="store_true",
        help="Enable spectator mode (show thoughts, night actions, and secret information)",
    )
    parser.add_argument(
        "--lang",
        default="English",
        help="Language for agent speech and reasoning (e.g. English, Japanese)",
    )
    parser.add_argument(
        "--players",
        type=int,
        default=5,
        help="Number of players (e.g. 5 or 7)",
    )
    parser.add_argument(
        "--replay",
        action="store_true",
        help="Replay a past game from state_archive/ (no LLM calls)",
    )
    args = parser.parse_args()

    spectator_mode: bool = args.spectator

    if args.replay:
        from src.ui.replay import run_replay

        run_replay(spectator_mode=spectator_mode)
    else:
        lang: str = args.lang

        agents = initialize_agents(args.players)

        cli = CLI(agents=agents, spectator_mode=spectator_mode)
        cli.show_intro()
        cli.show_agent_roles()

        log_writer = LogWriter()

        engine = GameEngine(
            agents=agents,
            log_writer=log_writer,
            event_callback=cli.on_event,
            lang=lang,
        )

        winner = engine.run()
        cli.show_winner(winner)

        archive_path = archive_state()
        if archive_path:
            print(f"Game archived to: {archive_path}")


if __name__ == "__main__":
    main()

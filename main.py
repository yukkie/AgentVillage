"""
AgentVillage — LLM Werewolf Game

Usage:
    uv run main.py                           # Public mode (English)
    uv run main.py --spectator               # Spectator mode
    uv run main.py --lang Japanese           # Japanese output
    uv run main.py --players 7               # 7-player mode (default: 5; also 9, 11, 13, 15)
    uv run main.py --spectator --lang Japanese --players 7
    uv run main.py --replay                  # Replay mode (public)
    uv run main.py --replay --spectator      # Replay mode (spectator)
    uv run main.py --info                    # Show LLM usage logs (INFO)
"""
import argparse
import logging
import os
import sys

from dotenv import load_dotenv

from src.engine.setup import initialize_agents
from src.engine.game import GameEngine
from src.logger.writer import LogWriter, archive_state
from src.stats.collector import record_game, show_stats
from src.ui.cli import CLI


def main() -> None:
    load_dotenv()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY is not set.")
        print("Copy .env.example to .env and add your API key.")
        sys.exit(1)

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
        help="Number of players (e.g. 5, 7, 9, 11, 13, or 15)",
    )
    parser.add_argument(
        "--replay",
        action="store_true",
        help="Replay a past game from state_archive/ (no LLM calls)",
    )
    parser.add_argument(
        "--info",
        action="store_true",
        help="Enable INFO logging (shows LLM usage stats per API call)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show win-rate statistics and exit",
    )
    args = parser.parse_args()

    if args.info:
        logging.basicConfig(level=logging.INFO, format="%(message)s")

    if args.stats:
        show_stats()
        return

    spectator_mode: bool = args.spectator

    if args.replay:
        from src.ui.replay import run_replay

        run_replay(spectator_mode=spectator_mode)
    else:
        lang: str = args.lang

        log_writer = LogWriter()

        agents = initialize_agents(args.players)

        cli = CLI(agents=agents, spectator_mode=spectator_mode)
        cli.show_intro()
        cli.show_agent_roles()

        engine = GameEngine(
            agents=agents,
            log_writer=log_writer,
            event_callback=cli.on_event,
            lang=lang,
        )

        winner = engine.run()
        cli.show_winner(winner)

        record_game(agents, winner)

        archive_path = archive_state()
        if archive_path:
            print(f"Game archived to: {archive_path}")


if __name__ == "__main__":
    main()

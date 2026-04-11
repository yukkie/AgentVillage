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
import json
import os
import random
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

if not os.environ.get("ANTHROPIC_API_KEY"):
    print("Error: ANTHROPIC_API_KEY is not set.")
    print("Copy .env.example to .env and add your API key.")
    sys.exit(1)

from src.agent.state import AgentState, Persona, Belief  # noqa: E402
from src.agent import store  # noqa: E402
from src.engine.game import GameEngine  # noqa: E402
from src.logger.writer import LogWriter, archive_state  # noqa: E402
from src.ui.cli import CLI  # noqa: E402


def initialize_agents(num_players: int) -> list[AgentState]:
    """Create and persist initial agent states with randomized roles."""
    Path("state/agents").mkdir(parents=True, exist_ok=True)

    agent_configs = json.loads(Path("config/agents.json").read_text(encoding="utf-8"))
    roles_config = json.loads(Path("config/roles.json").read_text(encoding="utf-8"))

    key = str(num_players)
    if key not in roles_config:
        print(f"Error: no role configuration found for {num_players} players.")
        print(f"Available: {', '.join(roles_config.keys())} players")
        sys.exit(1)

    roles = roles_config[key]
    selected_configs = agent_configs[:num_players]
    if len(selected_configs) < num_players:
        print(f"Error: not enough agents in config/agents.json for {num_players} players (found {len(agent_configs)}).")
        sys.exit(1)

    shuffled_roles = roles[:]
    random.shuffle(shuffled_roles)

    agents = []
    for config, role in zip(selected_configs, shuffled_roles):
        name = config["name"]
        beliefs = {
            other["name"]: Belief()
            for other in selected_configs
            if other["name"] != name
        }
        agent = AgentState(
            name=name,
            role=role,
            persona=Persona.model_validate(config),
            beliefs=beliefs,
            memory_summary=[],
            is_alive=True,
        )
        store.save(agent)
        agents.append(agent)

    return agents


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

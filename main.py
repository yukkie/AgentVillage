"""
AgentVillage — LLM Werewolf Game

Usage:
    uv run main.py                        # Public mode (English)
    uv run main.py --spectator            # Spectator mode
    uv run main.py --lang Japanese        # Japanese output
    uv run main.py --spectator --lang Japanese
"""
import argparse
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


AGENT_CONFIGS = [
    {
        "name": "Setsu",
        "persona": Persona(style="logical, calm, empathic", lie_tendency=0.1, aggression=0.2),
    },
    {
        "name": "SQ",
        "persona": Persona(style="cheerful, intuitive, social", lie_tendency=0.2, aggression=0.3),
    },
    {
        "name": "Raqio",
        "persona": Persona(style="cautious, quiet, observant", lie_tendency=0.15, aggression=0.15),
    },
    {
        "name": "Gina",
        "persona": Persona(style="analytical, methodical, honest", lie_tendency=0.05, aggression=0.25),
    },
    {
        "name": "Zephyr",
        "persona": Persona(style="charming, manipulative, confident", lie_tendency=0.8, aggression=0.6),
    },
]

ROLES = ["Villager", "Villager", "Villager", "Seer", "Werewolf"]


def initialize_agents() -> list[AgentState]:
    """Create and persist initial agent states with randomized roles."""
    Path("state/agents").mkdir(parents=True, exist_ok=True)

    shuffled_roles = ROLES[:]
    random.shuffle(shuffled_roles)

    agents = []
    for config, role in zip(AGENT_CONFIGS, shuffled_roles):
        name = config["name"]
        beliefs = {
            other["name"]: Belief()
            for other in AGENT_CONFIGS
            if other["name"] != name
        }
        agent = AgentState(
            name=name,
            role=role,
            persona=config["persona"],
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
    args = parser.parse_args()

    spectator_mode: bool = args.spectator
    lang: str = args.lang

    agents = initialize_agents()

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

"""
AgentVillage — LLM Werewolf Game

Usage:
    uv run main.py               # Public mode
    uv run main.py --spectator   # Spectator mode (shows thoughts & night actions)
"""
import argparse
import random
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from src.agent.state import AgentState, Persona, Belief
from src.agent import store
from src.engine.game import GameEngine
from src.engine.role import ROLES
from src.logger.writer import LogWriter
from src.ui.cli import CLI


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

ROLE_ASSIGNMENTS = {
    "Setsu": "Villager",
    "SQ": "Villager",
    "Raqio": "Villager",
    "Gina": "Seer",
    "Zephyr": "Werewolf",
}


def initialize_agents() -> list[AgentState]:
    """Create and persist initial agent states."""
    # Ensure state directory exists
    Path("state/agents").mkdir(parents=True, exist_ok=True)

    agents = []
    for config in AGENT_CONFIGS:
        name = config["name"]
        role = ROLE_ASSIGNMENTS[name]

        # Initialize beliefs about all other agents
        beliefs = {}
        for other_config in AGENT_CONFIGS:
            other_name = other_config["name"]
            if other_name != name:
                beliefs[other_name] = Belief()

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
    args = parser.parse_args()

    spectator_mode: bool = args.spectator

    # Initialize agents
    agents = initialize_agents()

    # Set up UI
    cli = CLI(agents=agents, spectator_mode=spectator_mode)
    cli.show_intro()
    cli.show_agent_roles()

    # Set up logger
    log_writer = LogWriter()

    # Run game
    engine = GameEngine(
        agents=agents,
        log_writer=log_writer,
        event_callback=cli.on_event,
    )

    winner = engine.run()
    cli.show_winner(winner)


if __name__ == "__main__":
    main()

"""Game initialization — agent creation, role assignment, and persistence."""
import json
import random
import sys
from pathlib import Path

from src.domain.agent import AgentState, Belief, Persona
from src.agent import store


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

"""Game initialization — agent creation, role assignment, and persistence."""
import json
import random
import sys
from pathlib import Path

from src.config import STATE_DIR
from src.domain.actor import Actor, ActorProfile, ActorState, Belief, Persona, make_actor
from src.agent import store


def initialize_agents(num_players: int) -> list[Actor]:
    """Create and persist initial agent states with randomized roles."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        agent_configs = json.loads(Path("config/agents.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        print("Error: config/agents.json not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: config/agents.json is not valid JSON: {e}")
        sys.exit(1)

    try:
        roles_config = json.loads(Path("config/roles.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        print("Error: config/roles.json not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: config/roles.json is not valid JSON: {e}")
        sys.exit(1)

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

    actors = []
    for config, role in zip(selected_configs, shuffled_roles):
        name = config["name"]
        beliefs = {
            other["name"]: Belief()
            for other in selected_configs
            if other["name"] != name
        }
        profile = ActorProfile(
            name=name,
            model=config.get("model", ActorProfile.model_fields["model"].default),
            persona=Persona.model_validate(config),
        )
        state = ActorState(
            beliefs=beliefs,
            memory_summary=[],
            is_alive=True,
        )
        actor = make_actor(profile, state, role)
        store.save(actor)
        actors.append(actor)

    return actors

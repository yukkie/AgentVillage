"""Game initialization — agent creation, role assignment, and persistence."""
import json
import random
import sys

from src.config import AGENT_CONFIG_PATH, AGENTS_DIR, ROLE_CONFIG_PATH
from src.domain.actor import Actor, ActorProfile, ActorState, Belief, Persona, make_actor
from src.agent import store


def initialize_agents(num_players: int) -> list[Actor]:
    """Create and persist initial agent states with randomized roles."""
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        agent_configs = json.loads(AGENT_CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Error: {AGENT_CONFIG_PATH} not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: {AGENT_CONFIG_PATH} is not valid JSON: {e}")
        sys.exit(1)

    try:
        roles_config = json.loads(ROLE_CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Error: {ROLE_CONFIG_PATH} not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: {ROLE_CONFIG_PATH} is not valid JSON: {e}")
        sys.exit(1)

    key = str(num_players)
    if key not in roles_config:
        print(f"Error: no role configuration found for {num_players} players.")
        print(f"Available: {', '.join(roles_config.keys())} players")
        sys.exit(1)

    roles = roles_config[key]
    if len(agent_configs) < num_players:
        print(f"Error: not enough agents in {AGENT_CONFIG_PATH} for {num_players} players (found {len(agent_configs)}).")
        sys.exit(1)
    selected_configs = random.sample(agent_configs, num_players)

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

from dataclasses import dataclass
from pathlib import Path
import json

from pydantic import BaseModel

from src.domain.roles import Role, get_role
from src.domain.schema import RoleField


class Persona(BaseModel):
    style: str
    lie_tendency: float = 0.2
    aggression: float = 0.3
    gender: str | None = None
    age: str | None = None
    speech_style: str = "casual"


class Belief(BaseModel):
    suspicion: float = 0.5
    trust: float = 0.5
    reason: list[str] = []


class ActorProfile(BaseModel):
    name: str
    model: str = "claude-haiku-4-5-20251001"
    persona: Persona


class ActorState(BaseModel):
    beliefs: dict[str, Belief] = {}
    memory_summary: list[str] = []
    is_alive: bool = True
    claimed_role: RoleField = None  # publicly claimed role via CO; None until CO
    intended_co: RoleField = None  # role to claim in the next speech; None when not planning a CO


@dataclass
class Actor:
    profile: ActorProfile
    state: ActorState
    role: Role

    @property
    def name(self) -> str:
        return self.profile.name

    @property
    def model(self) -> str:
        return self.profile.model

    @property
    def persona(self) -> Persona:
        return self.profile.persona

    @property
    def is_alive(self) -> bool:
        return self.state.is_alive


def make_actor(profile: ActorProfile, state: ActorState, role_name: str) -> Actor:
    return Actor(profile=profile, state=state, role=get_role(role_name))


def load_agent_catalog(path: Path = Path("config/agents.json")) -> dict[str, ActorProfile]:
    configs = json.loads(path.read_text(encoding="utf-8"))
    return {
        config["name"]: ActorProfile(
            name=config["name"],
            model=config.get("model", ActorProfile.model_fields["model"].default),
            persona=Persona.model_validate(config),
        )
        for config in configs
    }


def actor_to_dict(actor: Actor) -> dict:
    return {
        "profile": actor.profile.model_dump(mode="json"),
        "state": actor.state.model_dump(mode="json"),
        "role": actor.role.name,
    }


def actor_from_dict(data: dict, agent_catalog: dict[str, ActorProfile] | None = None) -> Actor:
    role_name = data["role"]

    # Preferred on-disk format: keep static profile and dynamic state separate.
    if "profile" in data and "state" in data:
        profile = ActorProfile.model_validate(data["profile"])
        state = ActorState.model_validate(data["state"])
        return make_actor(profile, state, role_name)

    # Backward-compatibility path for archived/top-level JSON. Normalize the
    # legacy flat shape into the new ActorProfile + ActorState structure here
    # so the rest of the codebase only deals with the new model.
    fallback_name = data.get("name")
    if fallback_name and agent_catalog and fallback_name in agent_catalog:
        profile = agent_catalog[fallback_name]
        profile_data = {
            "name": data.get("name", profile.name),
            "model": data.get("model", profile.model),
            "persona": data.get("persona", profile.persona.model_dump(mode="json")),
        }
    else:
        profile_data = {
            "name": data["name"],
            "model": data.get("model", ActorProfile.model_fields["model"].default),
            "persona": data["persona"],
        }

    state_data = {
        "beliefs": data.get("beliefs", {}),
        "memory_summary": data.get("memory_summary", []),
        "is_alive": data.get("is_alive", True),
        "claimed_role": data.get("claimed_role"),
        "intended_co": data.get("intended_co"),
    }
    return make_actor(
        ActorProfile.model_validate(profile_data),
        ActorState.model_validate(state_data),
        role_name,
    )

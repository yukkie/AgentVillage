from dataclasses import dataclass

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


class ActorState(BaseModel):
    name: str
    model: str = "claude-haiku-4-5-20251001"
    persona: Persona
    beliefs: dict[str, Belief] = {}
    memory_summary: list[str] = []
    is_alive: bool = True
    claimed_role: RoleField = None  # publicly claimed role via CO; None until CO
    intended_co: bool = False  # set True by pre-night phase if agent decided to CO on Day 1


@dataclass
class Actor:
    state: ActorState
    role: Role

    @property
    def name(self) -> str:
        return self.state.name

    @property
    def is_alive(self) -> bool:
        return self.state.is_alive


def make_actor(state: ActorState, role_name: str) -> Actor:
    return Actor(state=state, role=get_role(role_name))

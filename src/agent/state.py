from pydantic import BaseModel


class Persona(BaseModel):
    style: str
    lie_tendency: float = 0.2
    aggression: float = 0.3


class Belief(BaseModel):
    suspicion: float = 0.5
    trust: float = 0.5
    reason: list[str] = []


class AgentState(BaseModel):
    name: str
    role: str  # "Villager" | "Werewolf" | "Seer"
    model: str = "claude-haiku-4-5-20251001"
    persona: Persona
    beliefs: dict[str, Belief] = {}
    memory_summary: list[str] = []
    is_alive: bool = True
    claimed_role: str | None = None  # publicly claimed role via CO; None until CO

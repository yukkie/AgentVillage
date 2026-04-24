from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, PlainSerializer

from src.domain.roles import Role, get_role


def _role_from_json(v: object) -> Role | None:
    if v is None:
        return None
    if isinstance(v, Role):
        return v
    try:
        return get_role(str(v))
    except ValueError:
        return None


def _role_to_json(v: Role | None) -> str | None:
    return v.name if v is not None else None


RoleField = Annotated[
    Role | None,
    BeforeValidator(_role_from_json),
    PlainSerializer(_role_to_json, when_used="json"),
]


class PreNightOutput(BaseModel):
    thought: str
    decision: Literal["co", "wait"]
    claim_role: RoleField = None
    reasoning: str


class SpeechEntry(BaseModel):
    speech_id: int
    agent: str
    text: str


class JudgmentOutput(BaseModel):
    decision: Literal["challenge", "speak", "silent", "co"]
    reply_to: int | None = None
    claim_role: RoleField = None


class VoteCandidate(BaseModel):
    target: str
    score: float


class Intent(BaseModel):
    vote_candidates: list[VoteCandidate] = []
    co: RoleField = None


class AgentOutput(BaseModel):
    thought: str
    speech: str
    reasoning: str
    intent: Intent
    memory_update: list[str] = []


class WolfChatOutput(BaseModel):
    thought: str
    speech: str
    vote_candidates: list[VoteCandidate] = []

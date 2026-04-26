from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, PlainSerializer

from src.domain.roles import Role
from src.legacy.role_normalizer import normalize_role_field


def _role_to_json(v: Role | None) -> str | None:
    return v.name if v is not None else None


RoleField = Annotated[
    Role | None,
    BeforeValidator(normalize_role_field),
    PlainSerializer(_role_to_json, when_used="json"),
]


class PreNightOutput(BaseModel):
    """LLM response schema for the pre-night decision phase.

    Mock-Policy: Forbidden
        LLM I/O contract. ``LLMClient`` mocks must produce JSON that
        validates as this schema; tests must not synthesize free-form
        replacements. See ``tests/TestStrategy.md`` §5.
    """

    thought: str
    decision: Literal["co", "wait"]
    claim_role: RoleField = None
    reasoning: str


class SpeechEntry(BaseModel):
    speech_id: int
    agent: str
    text: str


class JudgmentOutput(BaseModel):
    """LLM response schema for the discussion-phase judgment call.

    Mock-Policy: Forbidden
        LLM I/O contract. See ``PreNightOutput`` and
        ``tests/TestStrategy.md`` §5.
    """

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
    """LLM response schema for a regular speech turn.

    Mock-Policy: Forbidden
        LLM I/O contract. See ``PreNightOutput`` and
        ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    reasoning: str
    intent: Intent
    memory_update: list[str] = []


class WolfChatOutput(BaseModel):
    """LLM response schema for the werewolves' private night chat.

    Mock-Policy: Forbidden
        LLM I/O contract. See ``PreNightOutput`` and
        ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    vote_candidates: list[VoteCandidate] = []

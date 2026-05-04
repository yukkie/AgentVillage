from dataclasses import dataclass, field
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


class SpeechEntry(BaseModel):
    speech_id: int
    agent: str
    text: str


@dataclass
class SpeakResult:
    """Result of the 'speak' tool use in a DISCUSSION turn.

    Mock-Policy: Forbidden
        DISCUSSION tool use result contract. Tests must not synthesize
        free-form replacements. See ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    co: Role | None = None
    memory_update: list[str] = field(default_factory=list)
    suspicion_scores: dict[str, float] | None = None
    threat_scores: dict[str, float] | None = None


@dataclass
class ChallengeResult:
    """Result of the 'challenge' tool use in a DISCUSSION turn.

    Mock-Policy: Forbidden
        DISCUSSION tool use result contract. See ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    reply_to: int
    memory_update: list[str] = field(default_factory=list)
    suspicion_scores: dict[str, float] | None = None
    threat_scores: dict[str, float] | None = None


@dataclass
class CoResult:
    """Result of the 'co' tool use in a DISCUSSION turn.

    Mock-Policy: Forbidden
        DISCUSSION tool use result contract. See ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    claim_role: Role
    memory_update: list[str] = field(default_factory=list)
    suspicion_scores: dict[str, float] | None = None
    threat_scores: dict[str, float] | None = None


@dataclass
class SilentResult:
    """Result of the 'silent' tool use in a DISCUSSION turn.

    Mock-Policy: Forbidden
        DISCUSSION tool use result contract. See ``tests/TestStrategy.md`` §5.
    """

    reasoning: str


DiscussionResult = SpeakResult | ChallengeResult | CoResult | SilentResult


class NightActionOutput(BaseModel):
    """LLM response schema for night actions (guard / inspect / attack-fallback).

    Mock-Policy: Forbidden
        LLM I/O contract. See ``tests/TestStrategy.md`` §5.
    """

    target: str
    reasoning: str = ""


class WolfSelfCoDecision(BaseModel):
    """LLM response schema for a werewolf's personal final next-day CO decision."""

    claim_role: RoleField = None
    timing: Literal["next_day", "wait"] = "wait"


class VoteOutput(BaseModel):
    """LLM response schema for the dedicated VOTE phase prompt.

    The ``strategy`` field is only populated by Werewolf actors; village-side
    actors leave it ``None``. Kept on the shared schema for simplicity — if
    the field is mis-emitted by the wrong faction it surfaces in the spectator
    VOTE log and is easy to spot.

    Mock-Policy: Forbidden
        LLM I/O contract. See ``tests/TestStrategy.md`` §5.
    """

    target: str
    reasoning: str = ""
    strategy: Literal["village_side", "wolf_side"] | None = None


class WolfChatOutput(BaseModel):
    """LLM response schema for the werewolves' private night chat.

    Mock-Policy: Forbidden
        LLM I/O contract. See ``tests/TestStrategy.md`` §5.
    """

    thought: str
    speech: str
    attack_candidates: dict[str, float] = {}
    self_co_decision: WolfSelfCoDecision = WolfSelfCoDecision()

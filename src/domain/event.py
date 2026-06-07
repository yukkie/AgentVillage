import uuid
from enum import Enum

from pydantic import BaseModel, Field

from src.domain.schema import RoleField


class EventType(Enum):
    SPEECH = "speech"
    VOTE = "vote"
    JUDGMENT = "judgment"
    ELIMINATION = "elimination"
    NIGHT_ATTACK = "night_attack"
    INSPECTION = "inspection"
    PRE_NIGHT_DECISION = "pre_night_decision"
    WOLF_CHAT = "wolf_chat"
    GUARD = "guard"
    GUARD_BLOCK = "guard_block"
    MEDIUM_RESULT = "medium_result"
    CO_ANNOUNCEMENT = "co_announcement"
    SUSPICION_UPDATE = "suspicion_update"
    THREAT_UPDATE = "threat_update"
    GAME_OVER = "game_over"
    GAME_START_NARRATIVE = "game_start_narrative"
    PHASE_START = "phase_start"


class LogEvent(BaseModel):
    """Event payload exchanged between ``GameEngine`` (producer) and
    ``Renderer`` / ``ReplayPager`` / ``LogWriter`` (consumers).

    Mock-Policy: Forbidden
        Contract type between modules we own. Consumer-side tests must not
        synthesize ``LogEvent`` instances that the engine would never produce
        (e.g. ``INSPECTION`` without ``target``). Use a real producer or a
        contract test under ``tests/contract/`` instead. See
        ``tests/TestStrategy.md`` §5.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day: int
    phase: str
    event_type: EventType
    agent: str | None = None
    target: str | None = None
    content: str = ""
    is_public: bool = True
    speech_id: int | None = None
    reply_to: int | None = None
    claimed_role: RoleField = None
    inspection_role: RoleField = None
    reasoning: str = ""
    decision: str = ""
    vote_strategy: str = ""
    spectator_content: str = ""
    winner: str | None = None
    suspicion_snapshot: dict[str, float] | None = None
    threat_snapshot: dict[str, float] | None = None

    @classmethod
    def make(
        cls,
        day: int,
        phase: str,
        event_type: EventType,
        agent: str | None = None,
        target: str | None = None,
        content: str = "",
        is_public: bool = True,
        speech_id: int | None = None,
        reply_to: int | None = None,
        claimed_role: RoleField = None,
        inspection_role: RoleField = None,
        reasoning: str = "",
        decision: str = "",
        vote_strategy: str = "",
        spectator_content: str = "",
        winner: str | None = None,
        suspicion_snapshot: dict[str, float] | None = None,
        threat_snapshot: dict[str, float] | None = None,
    ) -> "LogEvent":
        return cls(
            day=day,
            phase=phase,
            event_type=event_type,
            agent=agent,
            target=target,
            content=content,
            is_public=is_public,
            speech_id=speech_id,
            reply_to=reply_to,
            claimed_role=claimed_role,
            inspection_role=inspection_role,
            reasoning=reasoning,
            decision=decision,
            vote_strategy=vote_strategy,
            spectator_content=spectator_content,
            winner=winner,
            suspicion_snapshot=suspicion_snapshot,
            threat_snapshot=threat_snapshot,
        )

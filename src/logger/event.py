import uuid
from enum import Enum

from pydantic import BaseModel, Field


class EventType(Enum):
    SPEECH = "speech"
    REASONING = "reasoning"
    VOTE = "vote"
    ELIMINATION = "elimination"
    NIGHT_ATTACK = "night_attack"
    INSPECTION = "inspection"
    GAME_OVER = "game_over"
    PHASE_START = "phase_start"


class LogEvent(BaseModel):
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
        )

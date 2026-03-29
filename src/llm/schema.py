from typing import Literal

from pydantic import BaseModel


class PreNightOutput(BaseModel):
    thought: str
    decision: Literal["co", "wait"]
    reasoning: str


class SpeechEntry(BaseModel):
    speech_id: int
    agent: str
    text: str


class JudgmentOutput(BaseModel):
    decision: Literal["challenge", "speak", "silent"]
    reply_to: int | None = None


class VoteCandidate(BaseModel):
    target: str
    score: float


class Intent(BaseModel):
    vote_candidates: list[VoteCandidate] = []
    co: str | None = None


class AgentOutput(BaseModel):
    thought: str
    speech: str
    reasoning: str
    intent: Intent
    memory_update: list[str] = []

from pydantic import BaseModel


class VoteCandidate(BaseModel):
    target: str
    score: float


class Intent(BaseModel):
    vote_candidates: list[VoteCandidate] = []
    co: str | None = None


class AgentOutput(BaseModel):
    thought: str
    speech: str
    reasoning: str  # 推理宣言フェーズ用（誰をなぜ疑うか）
    intent: Intent
    memory_update: list[str] = []

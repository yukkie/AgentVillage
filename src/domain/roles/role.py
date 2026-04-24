from abc import ABC, abstractmethod

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema


class Role(ABC):
    """Abstract base class for werewolf game roles (Strategy pattern)."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def color(self) -> str: ...

    @property
    @abstractmethod
    def faction(self) -> str: ...

    @property
    @abstractmethod
    def night_action(self) -> str | None: ...

    @property
    def can_co(self) -> bool:
        return True

    @property
    def default_claim_role(self) -> "Role":
        return self

    @abstractmethod
    def role_prompt(self, wolf_partners: list[str] | None = None) -> str: ...

    @abstractmethod
    def co_prompt(self) -> str: ...

    @abstractmethod
    def pre_night_prompt(self) -> str: ...

    @abstractmethod
    def night_action_prompt(
        self, agent_name: str, alive_players: list[str], context: str
    ) -> str: ...

    @abstractmethod
    def co_strategy_hint(self) -> str: ...

    def output_format_prompt(self, lang: str = "English") -> str:
        """Instruct LLM to output structured JSON for the speech phase.

        Shared across all roles. Override only if a role needs a different schema.
        """
        return f"""
--- OUTPUT FORMAT ---
You MUST respond with ONLY valid JSON matching this exact schema. No other text.

{{
  "thought": "<your internal reasoning, hidden from others>",
  "speech": "<what you say aloud to the group>",
  "reasoning": "<your public deduction: who you suspect and why>",
  "intent": {{
    "vote_candidates": [
      {{"target": "<player_name>", "score": <0.0-1.0>}},
      ...
    ],
    "co": "<role_name or null>"
  }},
  "memory_update": ["<key thing to remember for future turns>", ...]
}}

Rules:
- "thought", "speech", "reasoning", "memory_update" must be written in {lang}
- "thought" is your private inner monologue
- "speech" is your actual spoken words (1-3 sentences)
- "reasoning" is your public deduction statement (1-2 sentences)
- "intent.vote_candidates" lists who you'd vote to eliminate (highest score = most suspect)
- "intent.co" is your role claim if you choose to reveal it, otherwise null
- "memory_update" lists 0-3 key observations to remember
- Do NOT include your real role in speech unless you are doing a CO
"""

    def __eq__(self, other: object) -> bool:
        return type(self) is type(other)

    def __hash__(self) -> int:
        return hash(type(self))

    @classmethod
    def __get_pydantic_core_schema__(cls, source: type, handler: GetCoreSchemaHandler) -> core_schema.CoreSchema:
        return core_schema.is_instance_schema(cls)

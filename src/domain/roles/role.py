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

    @classmethod
    def __get_pydantic_core_schema__(cls, source: type, handler: GetCoreSchemaHandler) -> core_schema.CoreSchema:
        return core_schema.is_instance_schema(cls)

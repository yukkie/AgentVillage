import anthropic

from src.llm.client import LLMClient


def create_client() -> LLMClient:
    return LLMClient(anthropic.Anthropic())

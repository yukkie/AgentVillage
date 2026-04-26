import anthropic

from src.llm.client import LLMClient


def create_client() -> LLMClient:
    """External-Boundary: anthropic SDK — instantiates the real API client."""
    return LLMClient(anthropic.Anthropic())

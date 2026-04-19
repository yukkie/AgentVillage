"""Unit tests for src/llm/factory.py."""
from unittest.mock import MagicMock, patch

import anthropic

from src.llm.client import LLMClient
from src.llm.factory import create_client


class TestCreateClient:
    def test_returns_llm_client_instance(self):
        mock_anthropic = MagicMock(spec=anthropic.Anthropic)
        with patch("src.llm.factory.anthropic.Anthropic", return_value=mock_anthropic):
            result = create_client()
            assert isinstance(result, LLMClient)
            assert result._client is mock_anthropic

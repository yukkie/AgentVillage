"""Unit tests for src/llm/factory.py."""
from unittest.mock import MagicMock, patch

import anthropic

from src.llm.factory import create_client


class TestCreateClient:
    def test_returns_anthropic_client(self):
        mock_client = MagicMock(spec=anthropic.Anthropic)
        with patch("src.llm.factory.anthropic.Anthropic", return_value=mock_client) as mock_cls:
            result = create_client()
            mock_cls.assert_called_once_with()
            assert result is mock_client

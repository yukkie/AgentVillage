"""Unit tests for tools/generate_archive_index.py — thin entrypoint."""
import runpy
import sys
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).parent.parent.parent / "tools" / "generate_archive_index.py"


def test_tools_entrypoint_calls_generate_archive_index(capsys) -> None:
    """
    SUT: tools/generate_archive_index.py の main()
    Mock: src.logger.archive_index.generate_archive_index を差し替え
    Level: unit
    Objective: AC-3: 手動実行のエントリポイントが src.logger.archive_index.generate_archive_index を呼び、件数を表示すること。
    """
    with patch("src.logger.archive_index.generate_archive_index", return_value=3) as mock_gen:
        with patch.object(sys, "argv", [str(SCRIPT_PATH)]):
            runpy.run_path(str(SCRIPT_PATH), run_name="__main__")

    mock_gen.assert_called_once_with()
    captured = capsys.readouterr()
    assert "3 sessions" in captured.out

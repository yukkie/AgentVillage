"""main.py の main() 関数のテスト。"""
from unittest.mock import MagicMock, patch


def _run_main(argv: list[str]) -> None:
    """sys.argv を差し替えて main() を呼び出すヘルパー。"""
    import sys
    with patch.object(sys, "argv", ["main.py"] + argv):
        import main
        main.main()


@patch("main.archive_state", return_value=None)
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_normal_game(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_archive):
    """デフォルト引数でゲームが1回実行されること。"""
    fake_agents = [MagicMock()]
    mock_init.return_value = fake_agents

    fake_engine = MagicMock()
    fake_engine.run.return_value = "Villagers"
    mock_engine_cls.return_value = fake_engine

    fake_cli = MagicMock()
    mock_cli_cls.return_value = fake_cli

    _run_main([])

    mock_init.assert_called_once_with(5)
    mock_engine_cls.assert_called_once()
    fake_engine.run.assert_called_once()
    fake_cli.show_winner.assert_called_once_with("Villagers")


@patch("main.archive_state", return_value=None)
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_replay_mode(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_archive):
    """--replay 指定のとき run_replay() が呼ばれ、GameEngine は呼ばれないこと。"""
    with patch("src.ui.replay.run_replay") as mock_replay:
        _run_main(["--replay"])

    mock_init.assert_not_called()
    mock_engine_cls.assert_not_called()
    mock_replay.assert_called_once_with(spectator_mode=False)

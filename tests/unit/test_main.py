"""main.py の main() 関数のテスト。"""
import os
import pytest
from unittest.mock import MagicMock, patch


def _run_main(argv: list[str]) -> None:
    """sys.argv を差し替えて main() を呼び出すヘルパー。"""
    import sys
    with patch.object(sys, "argv", ["main.py"] + argv), \
         patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
        import main
        main.main()


@patch("main.generate_archive_index")
@patch("main.archive_state", return_value="state_archive/game_20240101.json")
@patch("main.record_game")
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_prints_archive_path(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_record, mock_archive, mock_gen_index, capsys):
    """
    SUT: main.main
    Mock: archive_state が実パスを返す。generate_archive_index はダミーに差し替え
    Level: unit
    Objective: archive_state がパスを返したとき "Game archived to: ..." が出力されること
    """
    mock_init.return_value = [MagicMock()]
    fake_engine = MagicMock()
    fake_engine.run.return_value = "Villagers"
    mock_engine_cls.return_value = fake_engine
    mock_cli_cls.return_value = MagicMock()

    _run_main([])

    captured = capsys.readouterr()
    assert "Game archived to: state_archive/game_20240101.json" in captured.out


@patch("main.generate_archive_index")
@patch("main.archive_state", return_value="state_archive/game_20240101.json")
@patch("main.record_game")
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_calls_generate_archive_index_when_archived(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_record, mock_archive, mock_gen_index):
    """
    SUT: main.main
    Mock: archive_state が実パスを返す。generate_archive_index はダミーに差し替え
    Level: unit
    Objective: AC-1/AC-2: archive_state が成功したとき generate_archive_index が呼ばれること。
    """
    mock_init.return_value = [MagicMock()]
    fake_engine = MagicMock()
    fake_engine.run.return_value = "Villagers"
    mock_engine_cls.return_value = fake_engine
    mock_cli_cls.return_value = MagicMock()

    _run_main([])

    mock_gen_index.assert_called_once_with()


@patch("main.generate_archive_index")
@patch("main.archive_state", return_value=None)
@patch("main.record_game")
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_skips_generate_archive_index_when_not_archived(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_record, mock_archive, mock_gen_index):
    """
    SUT: main.main
    Mock: archive_state が None を返す（アーカイブが作られなかったケース）
    Level: unit
    Objective: AC-6: archive_state() が None のとき generate_archive_index が呼ばれないこと。
    """
    mock_init.return_value = [MagicMock()]
    fake_engine = MagicMock()
    fake_engine.run.return_value = "Villagers"
    mock_engine_cls.return_value = fake_engine
    mock_cli_cls.return_value = MagicMock()

    _run_main([])

    mock_gen_index.assert_not_called()


@patch("main.generate_archive_index", side_effect=RuntimeError("boom"))
@patch("main.archive_state", return_value="state_archive/game_20240101.json")
@patch("main.record_game")
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_archive_index_failure_does_not_raise(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_record, mock_archive, mock_gen_index, capsys):
    """
    SUT: main.main
    Mock: generate_archive_index が例外を送出するよう差し替え
    Level: unit
    Objective: AC-5: index 生成が失敗しても main() は例外を伝播させず、record_game/archive_state の結果に影響しないこと。
    """
    mock_init.return_value = [MagicMock()]
    fake_engine = MagicMock()
    fake_engine.run.return_value = "Villagers"
    mock_engine_cls.return_value = fake_engine
    mock_cli_cls.return_value = MagicMock()

    _run_main([])  # 例外を送出せず完走すること

    mock_record.assert_called_once()
    captured = capsys.readouterr()
    assert "Warning: failed to regenerate archive index: boom" in captured.err


@patch("main.archive_state", return_value=None)
@patch("main.record_game")
@patch("main.LogWriter")
@patch("main.CLI")
@patch("main.GameEngine")
@patch("main.initialize_agents")
def test_main_normal_game(mock_init, mock_engine_cls, mock_cli_cls, mock_writer_cls, mock_record, mock_archive):
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


def test_main_no_api_key_exits():
    """
    SUT: main.main
    Mock: os.environ.get("ANTHROPIC_API_KEY") が None を返すよう差し替え
    Level: unit
    Objective: ANTHROPIC_API_KEY が未設定のとき sys.exit(1) が呼ばれること
    """
    import sys
    import main
    with patch.object(sys, "argv", ["main.py"]), \
         patch("main.os.environ.get", return_value=None), \
         pytest.raises(SystemExit) as exc_info:
        main.main()
    assert exc_info.value.code == 1


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


@patch("main.generate_archive_index")
def test_replay_mode_does_not_call_generate_archive_index(mock_gen_index):
    """
    SUT: main.main
    Mock: src.ui.replay.run_replay をダミーに差し替え
    Level: unit
    Objective: 組み合わせ境界(AC-7): --replay 指定時、generate_archive_index が呼ばれないこと。
    """
    with patch("src.ui.replay.run_replay"):
        _run_main(["--replay"])

    mock_gen_index.assert_not_called()

"""Unit tests for src/logger/archive_index.py — generate_archive_index()."""
import json
from pathlib import Path
from unittest.mock import patch


def _write_session(archive_dir: Path, session_id: str, *, winner_content: str, day: int, agent_names: list[str]) -> None:
    session_dir = archive_dir / session_id
    agents_dir = session_dir / "agents"
    agents_dir.mkdir(parents=True)
    for name in agent_names:
        (agents_dir / f"{name}.json").write_text("{}", encoding="utf-8")

    events = [
        {"event_type": "speech", "day": day, "content": "hello"},
        {"event_type": "game_over", "day": day, "content": winner_content},
    ]
    log_path = session_dir / "spectator_log.jsonl"
    with log_path.open("w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")


def test_generate_archive_index_writes_expected_entries(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index.generate_archive_index
    Mock: src.logger.archive_index の ARCHIVE_DIR / OUTPUT_PATH を tmp_path 配下に差し替え
    Level: unit
    Objective: セッションディレクトリを走査し、期待どおりのフィールドを持つ index.json を生成すること。
    """
    archive_dir = tmp_path / "state_archive"
    archive_dir.mkdir()
    _write_session(
        archive_dir, "20260101_120000",
        winner_content="Villagers win the game", day=3, agent_names=["alice", "bob"],
    )

    output_path = archive_dir / "index.json"

    with (
        patch("src.logger.archive_index.ARCHIVE_DIR", archive_dir),
        patch("src.logger.archive_index.OUTPUT_PATH", output_path),
    ):
        from src.logger.archive_index import generate_archive_index

        generate_archive_index()

    assert output_path.exists()
    entries = json.loads(output_path.read_text(encoding="utf-8"))
    assert len(entries) == 1
    entry = entries[0]
    assert entry["session_id"] == "20260101_120000"
    assert entry["date"] == "2026-01-01T12:00:00"
    assert entry["agent_count"] == 2
    assert entry["days"] == 3
    assert entry["winner"] == "village"
    assert entry["cast"] == ["Alice", "Bob"]
    assert entry["live"] is False


def test_generate_archive_index_orders_newest_first(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index.generate_archive_index
    Mock: ARCHIVE_DIR / OUTPUT_PATH を tmp_path 配下に差し替え
    Level: unit
    Objective: 複数セッションがあるとき、新しい順（session_id 降順）に並ぶこと。
    """
    archive_dir = tmp_path / "state_archive"
    archive_dir.mkdir()
    _write_session(archive_dir, "20260101_120000", winner_content="Villagers win", day=1, agent_names=["alice"])
    _write_session(archive_dir, "20260201_120000", winner_content="Werewolves win", day=2, agent_names=["bob"])

    output_path = archive_dir / "index.json"

    with (
        patch("src.logger.archive_index.ARCHIVE_DIR", archive_dir),
        patch("src.logger.archive_index.OUTPUT_PATH", output_path),
    ):
        from src.logger.archive_index import generate_archive_index

        generate_archive_index()

    entries = json.loads(output_path.read_text(encoding="utf-8"))
    assert [e["session_id"] for e in entries] == ["20260201_120000", "20260101_120000"]


def test_generate_archive_index_skips_session_id_match_but_incomplete_dir(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index.generate_archive_index
    Mock: ARCHIVE_DIR / OUTPUT_PATH を tmp_path 配下に差し替え
    Level: unit
    Objective: 組み合わせ境界: セッションID形式には一致するが spectator_log.jsonl / agents/ が欠けたディレクトリは
        （_parse_session が None を返し）生成される index.json のエントリから除外されること。
    """
    archive_dir = tmp_path / "state_archive"
    archive_dir.mkdir()
    _write_session(archive_dir, "20260101_120000", winner_content="Villagers win", day=1, agent_names=["alice"])
    # セッションID形式には一致するが中身が空（spectator_log.jsonl も agents/ も無い）
    (archive_dir / "20260201_120000").mkdir()

    output_path = archive_dir / "index.json"

    with (
        patch("src.logger.archive_index.ARCHIVE_DIR", archive_dir),
        patch("src.logger.archive_index.OUTPUT_PATH", output_path),
    ):
        from src.logger.archive_index import generate_archive_index

        generate_archive_index()

    entries = json.loads(output_path.read_text(encoding="utf-8"))
    assert [e["session_id"] for e in entries] == ["20260101_120000"]


def test_parse_session_returns_none_when_log_or_agents_dir_missing(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index._parse_session
    Mock: なし
    Level: unit
    Objective: spectator_log.jsonl または agents/ が欠けたセッションは None を返し、index.json に含まれないこと。
    """
    from src.logger.archive_index import _parse_session

    # spectator_log.jsonl も agents/ も存在しない空ディレクトリ
    session_dir = tmp_path / "20260101_120000"
    session_dir.mkdir()
    assert _parse_session("20260101_120000", session_dir) is None

    # agents/ はあるが spectator_log.jsonl が無い
    session_dir2 = tmp_path / "20260102_120000"
    (session_dir2 / "agents").mkdir(parents=True)
    assert _parse_session("20260102_120000", session_dir2) is None


def test_parse_session_skips_blank_lines_in_log(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index._parse_session
    Mock: なし
    Level: unit
    Objective: spectator_log.jsonl 中の空行を無視して残りのイベントを正しく読めること。
    """
    from src.logger.archive_index import _parse_session

    session_dir = tmp_path / "20260101_120000"
    (session_dir / "agents").mkdir(parents=True)
    (session_dir / "agents" / "alice.json").write_text("{}", encoding="utf-8")

    log_path = session_dir / "spectator_log.jsonl"
    log_path.write_text(
        '{"event_type": "speech", "day": 1, "content": "hi"}\n'
        "\n"
        '{"event_type": "game_over", "day": 1, "content": "Villagers win"}\n',
        encoding="utf-8",
    )

    entry = _parse_session("20260101_120000", session_dir)

    assert entry is not None
    assert entry["days"] == 1
    assert entry["winner"] == "village"


def test_parse_session_winner_none_when_no_game_over_event(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index._parse_session
    Mock: なし
    Level: unit
    Objective: game_over イベントが無いログでは winner が None になること。
    """
    from src.logger.archive_index import _parse_session

    session_dir = tmp_path / "20260101_120000"
    (session_dir / "agents").mkdir(parents=True)
    (session_dir / "agents" / "alice.json").write_text("{}", encoding="utf-8")

    log_path = session_dir / "spectator_log.jsonl"
    log_path.write_text(
        '{"event_type": "speech", "day": 1, "content": "hi"}\n',
        encoding="utf-8",
    )

    entry = _parse_session("20260101_120000", session_dir)

    assert entry is not None
    assert entry["winner"] is None


def test_parse_session_winner_none_when_content_unrecognized(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index._parse_session
    Mock: なし
    Level: unit
    Objective: game_over イベントはあるが content がどちらのキーワードにも一致しないとき winner が None になること。
    """
    from src.logger.archive_index import _parse_session

    session_dir = tmp_path / "20260101_120000"
    (session_dir / "agents").mkdir(parents=True)
    (session_dir / "agents" / "alice.json").write_text("{}", encoding="utf-8")

    log_path = session_dir / "spectator_log.jsonl"
    log_path.write_text(
        '{"event_type": "game_over", "day": 1, "content": "draw"}\n',
        encoding="utf-8",
    )

    entry = _parse_session("20260101_120000", session_dir)

    assert entry is not None
    assert entry["winner"] is None


def test_parse_session_date_none_when_session_id_unrecognized(tmp_path: Path) -> None:
    """
    SUT: src.logger.archive_index._parse_session
    Mock: なし
    Level: unit
    Objective: session_id がタイムスタンプ形式(YYYYMMDD_HHMMSS)に一致しないとき date が None になること。
    """
    from src.logger.archive_index import _parse_session

    session_dir = tmp_path / "not-a-timestamp"
    (session_dir / "agents").mkdir(parents=True)
    (session_dir / "agents" / "alice.json").write_text("{}", encoding="utf-8")

    log_path = session_dir / "spectator_log.jsonl"
    log_path.write_text(
        '{"event_type": "game_over", "day": 1, "content": "Villagers win"}\n',
        encoding="utf-8",
    )

    entry = _parse_session("not-a-timestamp", session_dir)

    assert entry is not None
    assert entry["date"] is None

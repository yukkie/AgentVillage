"""
リプレイモードのテスト。

- run_replay は anthropic.Anthropic を一切呼ばない（LLMフリー）
- ReplayPager がアーカイブを正しく読み込む
- ArchiveSelector がアーカイブなしのとき None を返す
"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from src.domain.actor import ActorState, Persona
from src.domain.event import EventType, LogEvent
from src.ui.replay import ArchiveSelector, ReplayPager, run_replay


# ── helpers ─────────────────────────────────────────────────────────────────


def _make_agent_json(name: str, role: str) -> dict:
    data = ActorState(
        name=name,
        persona=Persona(style="calm"),
        beliefs={},
        memory_summary=[],
        is_alive=True,
    ).model_dump()
    data["role"] = role
    return data


def _make_event_jsonl(*events: LogEvent) -> str:
    return "\n".join(e.model_dump_json() for e in events)


@pytest.fixture()
def tmp_archive(tmp_path: Path) -> Path:
    """Minimal archive with 2 agents and a public log."""
    archive = tmp_path / "20260101_000000"
    agents_dir = archive / "agents"
    agents_dir.mkdir(parents=True)

    (agents_dir / "alice.json").write_text(
        json.dumps(_make_agent_json("Alice", "Villager")), encoding="utf-8"
    )
    (agents_dir / "bob.json").write_text(
        json.dumps(_make_agent_json("Bob", "Werewolf")), encoding="utf-8"
    )

    event = LogEvent.make(
        day=1,
        phase="day_opening",
        event_type=EventType.SPEECH,
        agent="Alice",
        content="Hello everyone.",
        is_public=True,
    )
    (archive / "public_log.jsonl").write_text(
        _make_event_jsonl(event), encoding="utf-8"
    )
    (archive / "spectator_log.jsonl").write_text(
        _make_event_jsonl(event), encoding="utf-8"
    )
    return archive


# ── LLM非呼び出し保証 ────────────────────────────────────────────────────────


def test_replay_does_not_call_llm(tmp_archive: Path) -> None:
    """リプレイモードでは anthropic.Anthropic のインスタンスが生成されないこと。"""
    with patch("anthropic.Anthropic") as mock_client:
        # _getch を 'q' を即時返すようモック（ページャーを即終了）
        with patch("src.ui.replay._getch", return_value="q"):
            run_replay(spectator_mode=False, archive_path=tmp_archive)
        mock_client.assert_not_called()


def test_replay_spectator_does_not_call_llm(tmp_archive: Path) -> None:
    """spectatorモードのリプレイでも LLM を呼ばないこと。"""
    with patch("anthropic.Anthropic") as mock_client:
        with patch("src.ui.replay._getch", return_value="q"):
            run_replay(spectator_mode=True, archive_path=tmp_archive)
        mock_client.assert_not_called()


# ── ReplayPager ──────────────────────────────────────────────────────────────


def test_pager_loads_agents(tmp_archive: Path) -> None:
    """アーカイブから正しく Actor が読み込まれること。"""
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    names = {a.name for a in pager._agents}
    assert names == {"Alice", "Bob"}


def test_pager_builds_lines(tmp_archive: Path) -> None:
    """publicモードでイベントが1行以上レンダリングされること。"""
    pager = ReplayPager(tmp_archive, spectator_mode=False)
    assert len(pager._lines) >= 1


def test_pager_spectator_shows_more_lines(tmp_archive: Path) -> None:
    """spectatorモードはpublicモード以上の行数を持つこと（同じログなら同数以上）。"""
    public_pager = ReplayPager(tmp_archive, spectator_mode=False)
    spectator_pager = ReplayPager(tmp_archive, spectator_mode=True)
    assert len(spectator_pager._lines) >= len(public_pager._lines)


# ── ArchiveSelector ──────────────────────────────────────────────────────────


def test_selector_returns_none_when_no_archives(tmp_path: Path) -> None:
    """アーカイブが0件のとき None を返すこと。"""
    empty_dir = tmp_path / "state_archive"
    empty_dir.mkdir()
    selector = ArchiveSelector(empty_dir)
    result = selector.select()
    assert result is None


def test_selector_returns_none_when_dir_missing(tmp_path: Path) -> None:
    """state_archive/ ディレクトリが存在しないとき None を返すこと。"""
    selector = ArchiveSelector(tmp_path / "nonexistent")
    result = selector.select()
    assert result is None

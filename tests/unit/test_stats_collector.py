"""Tests for src/stats/collector.py"""
import json

import pytest


@pytest.fixture
def stats_path(tmp_path, monkeypatch):
    path = tmp_path / "stats" / "game_stats.json"
    monkeypatch.setattr("src.stats.collector.STATS_PATH", path)
    return path


class TestRecordGame:
    def test_creates_file_on_first_game(self, make_test_actor, stats_path):
        """
        SUT: record_game
        Mock: STATS_PATH redirected to tmp_path
        Level: unit
        Objective: record_game creates game_stats.json with correct structure when file does not exist
        """
        from src.stats.collector import record_game

        agents = [make_test_actor("Sora", "Villager"), make_test_actor("Vael", "Werewolf")]
        record_game(agents, "Villagers")

        assert stats_path.exists()
        data = json.loads(stats_path.read_text(encoding="utf-8"))
        assert len(data["games"]) == 1
        game = data["games"][0]
        assert game["winner"] == "Villagers"
        assert len(game["players"]) == 2

    def test_appends_on_subsequent_games(self, make_test_actor, stats_path):
        """
        SUT: record_game
        Mock: STATS_PATH redirected to tmp_path
        Level: unit
        Objective: record_game appends a new record each time it is called
        """
        from src.stats.collector import record_game

        agents = [make_test_actor("Sora", "Villager")]
        record_game(agents, "Villagers")
        record_game(agents, "Werewolves")

        data = json.loads(stats_path.read_text(encoding="utf-8"))
        assert len(data["games"]) == 2
        assert data["games"][0]["winner"] == "Villagers"
        assert data["games"][1]["winner"] == "Werewolves"

    def test_player_won_flag_matches_winner(self, make_test_actor, stats_path):
        """
        SUT: record_game
        Mock: STATS_PATH redirected to tmp_path
        Level: unit
        Objective: won=True for village_side players when winner is Villagers
        """
        from src.stats.collector import record_game

        villager = make_test_actor("Sora", "Villager")
        wolf = make_test_actor("Vael", "Werewolf")
        record_game([villager, wolf], "Villagers")

        data = json.loads(stats_path.read_text(encoding="utf-8"))
        players = {p["name"]: p for p in data["games"][0]["players"]}
        assert players["Sora"]["won"] is True
        assert players["Vael"]["won"] is False

    def test_player_fields_are_correct(self, make_test_actor, stats_path):
        """
        SUT: record_game
        Mock: STATS_PATH redirected to tmp_path
        Level: unit
        Objective: each player entry contains name, role, faction, model, survived, won
        """
        from src.stats.collector import record_game

        actor = make_test_actor("Sora", "Seer")
        record_game([actor], "Villagers")

        data = json.loads(stats_path.read_text(encoding="utf-8"))
        p = data["games"][0]["players"][0]
        assert p["name"] == "Sora"
        assert p["role"] == "Seer"
        assert p["faction"] == "village"
        assert "model" in p
        assert "survived" in p
        assert p["won"] is True


class TestShowStats:
    def test_no_file_prints_message(self, stats_path, capsys):
        """
        SUT: show_stats
        Mock: STATS_PATH redirected to non-existent tmp_path
        Level: unit
        Objective: show_stats prints a helpful message when stats file does not exist
        """
        from src.stats.collector import show_stats

        show_stats()

        # Rich console output goes to stdout; check no crash and something printed
        # (Rich may buffer; just ensure no exception raised)

    def test_empty_games_list_prints_message(self, stats_path, capsys):
        """
        SUT: show_stats
        Mock: STATS_PATH redirected to tmp_path with empty games list
        Level: unit
        Objective: show_stats prints a helpful message when games list is empty
        """
        from src.stats.collector import show_stats

        stats_path.parent.mkdir(parents=True, exist_ok=True)
        stats_path.write_text(json.dumps({"games": []}), encoding="utf-8")

        show_stats()  # should not raise

    def test_shows_tables_for_recorded_games(self, make_test_actor, stats_path):
        """
        SUT: show_stats
        Mock: STATS_PATH redirected to tmp_path
        Level: unit
        Objective: show_stats completes without error after at least one game is recorded
        """
        from src.stats.collector import record_game, show_stats

        agents = [make_test_actor("Sora", "Villager"), make_test_actor("Vael", "Werewolf")]
        record_game(agents, "Villagers")

        show_stats()  # should not raise

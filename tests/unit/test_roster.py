"""Tests for src/ui/roster.py"""

from src.ui.roster import build_roster_full, build_roster_summary


class TestBuildRosterSummary:
    def test_single_role(self, make_test_actor):
        """
        SUT: build_roster_summary
        Mock: なし
        Level: unit
        Objective: 1種類の役職のみのとき単数形が使われること
        """
        agents = [make_test_actor("Sora", "Villager")]
        result = build_roster_summary(agents)
        assert result == "This village has 1 Villager"

    def test_multiple_same_role_uses_plural(self, make_test_actor):
        """
        SUT: build_roster_summary
        Mock: なし
        Level: unit
        Objective: 同じ役職が複数いるとき複数形が使われること
        """
        agents = [make_test_actor("Sora", "Villager"), make_test_actor("Vael", "Villager")]
        result = build_roster_summary(agents)
        assert "2 Villagers" in result

    def test_werewolf_plural_is_werewolves(self, make_test_actor):
        """
        SUT: build_roster_summary
        Mock: なし
        Level: unit
        Objective: Werewolfが複数のとき "Werewolves" になること
        """
        agents = [make_test_actor("A", "Werewolf"), make_test_actor("B", "Werewolf")]
        result = build_roster_summary(agents)
        assert "2 Werewolves" in result

    def test_madman_plural_is_madmen(self, make_test_actor):
        """
        SUT: build_roster_summary
        Mock: なし
        Level: unit
        Objective: Madmanが複数のとき "Madmen" になること
        """
        agents = [make_test_actor("A", "Madman"), make_test_actor("B", "Madman")]
        result = build_roster_summary(agents)
        assert "2 Madmen" in result

    def test_mixed_roles_format(self, make_test_actor):
        """
        SUT: build_roster_summary
        Mock: なし
        Level: unit
        Objective: 複数役職が " · " 区切りで結合されること
        """
        agents = [
            make_test_actor("A", "Villager"),
            make_test_actor("B", "Villager"),
            make_test_actor("C", "Villager"),
            make_test_actor("D", "Seer"),
            make_test_actor("E", "Werewolf"),
        ]
        result = build_roster_summary(agents)
        assert result.startswith("This village has ")
        assert " · " in result
        assert "3 Villagers" in result
        assert "1 Seer" in result
        assert "1 Werewolf" in result


class TestBuildRosterFull:
    def test_returns_name_role_style_tuples(self, make_test_actor):
        """
        SUT: build_roster_full
        Mock: なし
        Level: unit
        Objective: (name, role_name, style) のタプルリストが返ること
        """
        agents = [make_test_actor("Sora", "Seer"), make_test_actor("Vael", "Werewolf")]
        result = build_roster_full(agents)
        assert len(result) == 2
        names = [r[0] for r in result]
        roles = [r[1] for r in result]
        assert "Sora" in names
        assert "Vael" in names
        assert "Seer" in roles
        assert "Werewolf" in roles

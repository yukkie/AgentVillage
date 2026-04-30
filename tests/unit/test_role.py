import pytest

from src.domain.roles import (
    Villager,
    Werewolf,
    Seer,
    Knight,
    Medium,
    Madman,
    get_role,
)


class TestGetRole:
    def test_returns_correct_types(self):
        assert isinstance(get_role("Villager"), Villager)
        assert isinstance(get_role("Werewolf"), Werewolf)
        assert isinstance(get_role("Seer"), Seer)
        assert isinstance(get_role("Knight"), Knight)
        assert isinstance(get_role("Medium"), Medium)
        assert isinstance(get_role("Madman"), Madman)

    def test_unknown_role_raises(self):
        with pytest.raises(ValueError, match="Unknown role"):
            get_role("Pirate")


class TestRoleProperties:
    @pytest.mark.parametrize(
        "role_name, faction, night_action",
        [
            ("Villager", "village", None),
            ("Werewolf", "werewolf", "attack"),
            ("Seer", "village", "inspect"),
            ("Knight", "village", "guard"),
            ("Medium", "village", None),
            ("Madman", "werewolf", None),
        ],
    )
    def test_properties(self, role_name, faction, night_action):
        role = get_role(role_name)
        assert role.name == role_name
        assert role.faction == faction
        assert role.night_action == night_action

    @pytest.mark.parametrize(
        "role_name, expected_color",
        [
            ("Villager", "white"),
            ("Werewolf", "red"),
            ("Seer", "blue"),
            ("Knight", "bright_green"),
            ("Medium", "cyan"),
            ("Madman", "orange3"),
        ],
    )
    def test_color(self, role_name, expected_color):
        assert get_role(role_name).color == expected_color


class TestRolePrompt:
    def test_villager(self):
        result = get_role("Villager").role_prompt()
        assert "Villager" in result

    def test_werewolf_with_partners(self):
        result = get_role("Werewolf").role_prompt(wolf_partners=["Alice"])
        assert "Alice" in result

    def test_werewolf_includes_vote_strategy(self):
        """
        SUT: Werewolf.role_prompt
        Mock: なし
        Level: unit
        Objective: 狼の役職プロンプトに village_side / wolf_side の戦略指示が含まれること（#212）。
        """
        result = get_role("Werewolf").role_prompt(wolf_partners=["Alice"])
        assert "VOTE STRATEGY" in result
        assert "village_side" in result
        assert "wolf_side" in result
        assert "line-cutting" in result  # village_side で仲間投票も許容する旨
        assert "suspicion" in result  # wolf_side のリスク説明

    def test_villager_does_not_include_vote_strategy(self):
        """
        SUT: Villager.role_prompt
        Mock: なし
        Level: unit
        Objective: 村人の役職プロンプトに狼用の vote strategy 指示が含まれないこと（AC: 村人プロンプト不変）。
        """
        result = get_role("Villager").role_prompt()
        assert "VOTE STRATEGY" not in result
        assert "village_side" not in result
        assert "wolf_side" not in result

    def test_werewolf_last_surviving(self):
        result = get_role("Werewolf").role_prompt(wolf_partners=[])
        assert "last surviving Werewolf" in result

    def test_werewolf_none_raises(self):
        with pytest.raises(AssertionError):
            get_role("Werewolf").role_prompt(wolf_partners=None)

    def test_seer(self):
        result = get_role("Seer").role_prompt()
        assert "Seer" in result

    def test_knight(self):
        result = get_role("Knight").role_prompt()
        assert "Knight" in result

    def test_medium(self):
        result = get_role("Medium").role_prompt()
        assert "Medium" in result

    def test_madman(self):
        result = get_role("Madman").role_prompt()
        assert "Madman" in result


class TestCoPrompt:
    def test_villager_empty(self):
        assert get_role("Villager").co_prompt() == ""

    def test_werewolf_claims_seer(self):
        result = get_role("Werewolf").co_prompt()
        assert "Seer" in result

    def test_seer(self):
        result = get_role("Seer").co_prompt()
        assert "Seer" in result

    def test_madman_claims_villager_side(self):
        result = get_role("Madman").co_prompt()
        assert "Seer" in result or "Medium" in result


class TestPreNightPrompt:
    def test_villager_empty(self):
        assert get_role("Villager").pre_night_prompt() == ""

    def test_werewolf(self):
        result = get_role("Werewolf").pre_night_prompt()
        assert "co" in result and "wait" in result

    def test_seer(self):
        result = get_role("Seer").pre_night_prompt()
        assert "co" in result and "wait" in result


class TestNightActionPrompt:
    def test_villager_empty(self):
        assert get_role("Villager").night_action_prompt("Alice", ["Bob"], "ctx") == ""

    def test_werewolf(self):
        result = get_role("Werewolf").night_action_prompt("Wolf", ["Alice", "Bob", "Wolf"], "ctx")
        assert "ATTACK" in result
        assert "Wolf" not in result.split("Alive players (excluding you): ")[1].split("\n")[0]

    def test_seer(self):
        result = get_role("Seer").night_action_prompt("Seer1", ["Alice", "Seer1"], "ctx")
        assert "INSPECT" in result

    def test_knight(self):
        result = get_role("Knight").night_action_prompt("K", ["Alice", "K"], "ctx")
        assert "GUARD" in result

    def test_medium_empty(self):
        assert get_role("Medium").night_action_prompt("M", ["Alice"], "ctx") == ""

    def test_madman_empty(self):
        assert get_role("Madman").night_action_prompt("Mad", ["Alice"], "ctx") == ""


class TestOutputFormatPrompt:
    def test_default_method_exists_on_all_roles(self):
        for role_name in ["Villager", "Werewolf", "Seer", "Knight", "Medium", "Madman"]:
            result = get_role(role_name).output_format_prompt()
            assert "thought" in result
            assert "speech" in result
            assert "intent" in result

    def test_lang_is_injected(self):
        result = get_role("Villager").output_format_prompt(lang="Japanese")
        assert "Japanese" in result

    def test_werewolf_output_format_includes_strategy_field(self):
        """
        SUT: Werewolf.output_format_prompt
        Mock: なし
        Level: unit
        Objective: 狼の output_format に intent.strategy フィールドの案内が含まれること（#212）。
        """
        result = get_role("Werewolf").output_format_prompt()
        assert "strategy" in result
        assert "village_side" in result
        assert "wolf_side" in result

    def test_villager_output_format_excludes_strategy_field(self):
        """
        SUT: Villager.output_format_prompt
        Mock: なし
        Level: unit
        Objective: 村人の output_format には狼用 strategy フィールドが含まれないこと（AC: 村人プロンプト不変）。
        """
        result = get_role("Villager").output_format_prompt()
        assert "strategy" not in result
        assert "village_side" not in result

    def test_returns_json_schema_instruction(self):
        result = get_role("Seer").output_format_prompt()
        assert "OUTPUT FORMAT" in result
        assert "memory_update" in result


class TestCoStrategyHint:
    def test_villager_empty(self):
        assert get_role("Villager").co_strategy_hint() == ""

    @pytest.mark.parametrize("role_name", ["Werewolf", "Seer", "Knight", "Medium", "Madman"])
    def test_non_villager_has_hint(self, role_name):
        result = get_role(role_name).co_strategy_hint()
        assert "co" in result.lower()

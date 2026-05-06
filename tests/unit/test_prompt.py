import pytest

from src.domain.actor import Belief
from src.domain.roles import get_role
from src.domain.roles.werewolf import Werewolf
from src.llm.prompt import build_personal_info_prompt, build_public_info_prompt, build_role_prompt, PublicContext


def test_build_role_prompt_wolf_partners_non_none_for_non_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt(get_role("Seer"), wolf_partners=["Alice"])


def test_build_role_prompt_wolf_partners_none_for_werewolf_raises():
    with pytest.raises(AssertionError):
        build_role_prompt(get_role("Werewolf"), wolf_partners=None)


def test_build_role_prompt_wolf_partners_empty_for_werewolf_is_allowed():
    result = build_role_prompt(get_role("Werewolf"), wolf_partners=[])
    assert "last surviving Werewolf" in result


def test_build_role_prompt_wolf_partners_list_for_werewolf_is_allowed():
    result = build_role_prompt(get_role("Werewolf"), wolf_partners=["Bob"])
    assert "Bob" in result


def test_get_role_unknown_role_raises():
    with pytest.raises(ValueError, match="Unknown role"):
        get_role("UnknownRole")


def test_belief_has_no_trust_field():
    """
    SUT: Belief
    Mock: なし
    Level: unit
    Objective: Belief に trust フィールドが存在しないこと（AC: Belief has only suspicion: float）。
    """
    belief = Belief(suspicion=0.7)
    assert not hasattr(belief, "trust")


def test_personal_info_prompt_shows_suspicion_scores(make_test_actor):
    """
    SUT: build_personal_info_prompt
    Mock: なし
    Level: unit
    Objective: actor.state.beliefs に suspicion が入っているとき suspicion スコアとガイダンスがプロンプトに含まれること（AC）。
    """
    actor = make_test_actor("Alice", "Villager")
    actor.state.beliefs = {
        "Bob": Belief(suspicion=0.8),
        "Carol": Belief(suspicion=0.2),
    }
    prompt = build_personal_info_prompt(actor)
    assert "suspicion" in prompt
    assert "Bob" in prompt
    assert "0.80" in prompt
    assert "Carol" in prompt
    assert "0.20" in prompt
    assert "vote" in prompt.lower()


def test_personal_info_prompt_omits_suspicion_section_when_no_beliefs(make_test_actor):
    """
    SUT: build_personal_info_prompt
    Mock: なし
    Level: unit
    Objective: actor.state.beliefs が空のとき suspicion セクションが含まれないこと。
    """
    actor = make_test_actor("Alice", "Villager")
    actor.state.beliefs = {}
    prompt = build_personal_info_prompt(actor)
    assert "suspicion levels" not in prompt


def test_build_public_info_prompt_custom_today_log_header(make_test_actor):
    """
    SUT: build_public_info_prompt
    Mock: なし
    Level: unit
    Objective: today_log_header 引数を渡すと今日の議論セクションの見出しが置き換わること。
    """
    from src.domain.schema import SpeechEntry
    entry = SpeechEntry(speech_id=1, agent="Alice", text="hello")
    ctx = PublicContext(
        today_log=[entry],
        alive_players=["Alice", "Bob"],
        dead_players=[],
        day=1,
    )
    prompt = build_public_info_prompt(ctx, today_log_header="Today's full discussion:")
    assert "Today's full discussion:" in prompt
    assert "Today's discussion so far:" not in prompt


def test_build_public_info_prompt_default_header(make_test_actor):
    """
    SUT: build_public_info_prompt
    Mock: なし
    Level: unit
    Objective: today_log_header を省略したときデフォルト見出しが使われること。
    """
    from src.domain.schema import SpeechEntry
    entry = SpeechEntry(speech_id=1, agent="Alice", text="hello")
    ctx = PublicContext(
        today_log=[entry],
        alive_players=["Alice", "Bob"],
        dead_players=[],
        day=1,
    )
    prompt = build_public_info_prompt(ctx)
    assert "Today's discussion so far:" in prompt


class TestRoleNightChatPrompt:
    def test_non_werewolf_role_returns_none(self, make_test_actor):
        """
        SUT: Role.night_chat_prompt
        Mock: なし
        Level: unit
        Objective: 非狼役職の night_chat_prompt() は None を返すこと。
        """
        actor = make_test_actor("Alice", "Villager")
        for role_name in ("Villager", "Seer", "Knight", "Medium", "Madman"):
            role = get_role(role_name)
            assert role.night_chat_prompt(actor, [], [], []) is None, f"{role_name} should return None"

    def test_werewolf_night_chat_prompt_returns_string(self, make_test_actor):
        """
        SUT: Werewolf.night_chat_prompt
        Mock: なし
        Level: unit
        Objective: Werewolf.night_chat_prompt() が文字列を返すこと。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        role = Werewolf()
        result = role.night_chat_prompt(actor, [], ["Alice", "Bob"], [])
        assert isinstance(result, str)
        assert len(result) > 0

    def test_werewolf_night_chat_prompt_shows_threat_scores_when_present(self, make_test_actor):
        """
        SUT: Werewolf.night_chat_prompt
        Mock: なし
        Level: unit
        Objective: actor.state.threat_scores が非空のとき脅威スコアとガイダンスがプロンプトに含まれること。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        actor.state.threat_scores = {"Seer": 0.9, "Knight": 0.6}
        role = Werewolf()
        prompt = role.night_chat_prompt(actor, [], ["Seer", "Knight", "Villager"], [])
        assert "threat" in prompt.lower()
        assert "Seer" in prompt
        assert "0.90" in prompt
        assert "Knight" in prompt
        assert "0.60" in prompt

    def test_werewolf_night_chat_prompt_omits_threat_section_when_empty(self, make_test_actor):
        """
        SUT: Werewolf.night_chat_prompt
        Mock: なし
        Level: unit
        Objective: actor.state.threat_scores が空のとき脅威スコアセクションが含まれないこと。
        """
        actor = make_test_actor("Wolf", "Werewolf")
        actor.state.threat_scores = {}
        role = Werewolf()
        prompt = role.night_chat_prompt(actor, [], ["Alice", "Bob"], [])
        assert "threat assessments" not in prompt

    def test_werewolf_night_chat_prompt_includes_wolf_chat_log(self, make_test_actor):
        """
        SUT: Werewolf.night_chat_prompt
        Mock: なし
        Level: unit
        Objective: wolf_chat_log が非空のときその発言内容がプロンプトに含まれること。
        """
        from src.domain.schema import SpeechEntry
        actor = make_test_actor("Wolf", "Werewolf")
        log = [SpeechEntry(speech_id=1, agent="Wolf", text="Let's attack Alice.")]
        role = Werewolf()
        prompt = role.night_chat_prompt(actor, ["OtherWolf"], ["Alice", "Wolf", "OtherWolf"], log)
        assert "Wolf team conversation so far" in prompt
        assert "Let's attack Alice." in prompt

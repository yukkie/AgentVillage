from src.domain.actor import Belief
from src.llm.prompt import build_judgment_prompt
from src.domain.schema import SpeechEntry


def _make_log(*texts: str) -> list[SpeechEntry]:
    return [SpeechEntry(speech_id=i + 1, agent=f"Agent{i}", text=t) for i, t in enumerate(texts)]


class TestBuildJudgmentPrompt:
    def test_contains_agent_name_and_role(self, make_test_actor):
        actor = make_test_actor("Setsu")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu", "SQ"], day=1)
        assert "Setsu" in prompt
        assert "Villager" in prompt

    def test_contains_recent_speeches_with_ids(self, make_test_actor):
        actor = make_test_actor("Setsu")
        actor.state.beliefs = {"SQ": Belief()}
        log = _make_log("Hello everyone.", "I suspect SQ.")
        prompt = build_judgment_prompt(actor, log, ["Setsu", "SQ"], day=1)
        assert "[1]" in prompt
        assert "[2]" in prompt
        assert "Hello everyone." in prompt

    def test_only_last_6_speeches_included(self, make_test_actor):
        actor = make_test_actor("Setsu")
        actor.state.beliefs = {"SQ": Belief()}
        log = _make_log(*[f"speech {i}" for i in range(10)])
        prompt = build_judgment_prompt(actor, log, ["Setsu"], day=2)
        # speech 0-3 should be excluded (only last 6: 4-9)
        assert "speech 0" not in prompt
        assert "speech 9" in prompt

    def test_memory_included(self, make_test_actor):
        actor = make_test_actor("Setsu")
        actor.state.beliefs = {"SQ": Belief()}
        actor.state.memory_summary = ["SQ changed vote on Day1"]
        prompt = build_judgment_prompt(actor, [], ["Setsu", "SQ"], day=2)
        assert "SQ changed vote on Day1" in prompt

    def test_json_format_instruction_present(self, make_test_actor):
        actor = make_test_actor("Setsu")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1)
        assert "challenge" in prompt
        assert "silent" in prompt
        assert "reply_to" in prompt

    def test_co_option_absent_for_villager(self, make_test_actor):
        actor = make_test_actor("Setsu", "Villager")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1, co_eligible=False)
        assert '"co"' not in prompt

    def test_co_option_present_when_co_eligible(self, make_test_actor):
        actor = make_test_actor("Setsu", "Seer")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1, co_eligible=True)
        assert '"co"' in prompt

    def test_co_strategy_hint_seer(self, make_test_actor):
        actor = make_test_actor("Setsu", "Seer")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1, co_eligible=True)
        assert "Seer" in prompt
        assert "trust" in prompt.lower()

    def test_co_strategy_hint_werewolf(self, make_test_actor):
        actor = make_test_actor("Setsu", "Werewolf")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1, co_eligible=True)
        assert "fake" in prompt.lower() or "chaos" in prompt.lower()

    def test_co_strategy_hint_madman(self, make_test_actor):
        actor = make_test_actor("Setsu", "Madman")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1, co_eligible=True)
        assert "Madman" in prompt

    def test_co_not_in_format_when_not_eligible(self, make_test_actor):
        """Ensure the 4th choice is absent when co_eligible=False (default)."""
        actor = make_test_actor("Setsu", "Seer")
        actor.state.beliefs = {"SQ": Belief()}
        prompt = build_judgment_prompt(actor, [], ["Setsu"], day=1)  # default co_eligible=False
        assert '"co"' not in prompt

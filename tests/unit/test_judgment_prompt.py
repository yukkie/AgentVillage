from src.domain.actor import ActorState, Actor, Persona, Belief, make_actor
from src.llm.prompt import build_judgment_prompt
from src.domain.schema import SpeechEntry


def _make_agent(
    name: str = "Setsu",
    role: str = "Villager",
    memory: list[str] | None = None,
    claimed_role: str | None = None,
) -> Actor:
    state = ActorState(
        name=name,
        role=role,
        persona=Persona(style="calm", lie_tendency=0.1, aggression=0.2),
        beliefs={"SQ": Belief()},
        memory_summary=memory or [],
        is_alive=True,
        claimed_role=claimed_role,
    )
    return make_actor(state)


def _make_log(*texts: str) -> list[SpeechEntry]:
    return [SpeechEntry(speech_id=i + 1, agent=f"Agent{i}", text=t) for i, t in enumerate(texts)]


class TestBuildJudgmentPrompt:
    def test_contains_agent_name_and_role(self):
        agent = _make_agent()
        prompt = build_judgment_prompt(agent, [], ["Setsu", "SQ"], day=1)
        assert "Setsu" in prompt
        assert "Villager" in prompt

    def test_contains_recent_speeches_with_ids(self):
        agent = _make_agent()
        log = _make_log("Hello everyone.", "I suspect SQ.")
        prompt = build_judgment_prompt(agent, log, ["Setsu", "SQ"], day=1)
        assert "[1]" in prompt
        assert "[2]" in prompt
        assert "Hello everyone." in prompt

    def test_only_last_6_speeches_included(self):
        agent = _make_agent()
        log = _make_log(*[f"speech {i}" for i in range(10)])
        prompt = build_judgment_prompt(agent, log, ["Setsu"], day=2)
        # speech 0-3 should be excluded (only last 6: 4-9)
        assert "speech 0" not in prompt
        assert "speech 9" in prompt

    def test_memory_included(self):
        agent = _make_agent(memory=["SQ changed vote on Day1"])
        prompt = build_judgment_prompt(agent, [], ["Setsu", "SQ"], day=2)
        assert "SQ changed vote on Day1" in prompt

    def test_json_format_instruction_present(self):
        agent = _make_agent()
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1)
        assert "challenge" in prompt
        assert "silent" in prompt
        assert "reply_to" in prompt

    def test_co_option_absent_for_villager(self):
        agent = _make_agent(role="Villager")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1, co_eligible=False)
        assert '"co"' not in prompt

    def test_co_option_present_when_co_eligible(self):
        agent = _make_agent(role="Seer")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1, co_eligible=True)
        assert '"co"' in prompt

    def test_co_strategy_hint_seer(self):
        agent = _make_agent(role="Seer")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1, co_eligible=True)
        assert "Seer" in prompt
        assert "trust" in prompt.lower()

    def test_co_strategy_hint_werewolf(self):
        agent = _make_agent(role="Werewolf")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1, co_eligible=True)
        assert "fake" in prompt.lower() or "chaos" in prompt.lower()

    def test_co_strategy_hint_madman(self):
        agent = _make_agent(role="Madman")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1, co_eligible=True)
        assert "Madman" in prompt

    def test_co_not_in_format_when_not_eligible(self):
        """Ensure the 4th choice is absent when co_eligible=False (default)."""
        agent = _make_agent(role="Seer")
        prompt = build_judgment_prompt(agent, [], ["Setsu"], day=1)  # default co_eligible=False
        assert '"co"' not in prompt

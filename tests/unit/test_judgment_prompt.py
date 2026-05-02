from src.llm.prompt import PublicContext, build_discussion_system_prompt
from src.domain.schema import SpeechEntry


def _make_ctx(*texts: str, day: int = 1) -> PublicContext:
    log = [SpeechEntry(speech_id=i + 1, agent=f"Agent{i}", text=t) for i, t in enumerate(texts)]
    return PublicContext(
        today_log=log,
        alive_players=["Setsu", "SQ"],
        dead_players=[],
        day=day,
    )


class TestBuildDiscussionSystemPrompt:
    def test_contains_agent_name_and_role(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: プロンプトにエージェント名とロール名が含まれること。
        """
        actor = make_test_actor("Setsu")
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx)
        assert "Setsu" in prompt
        assert "Villager" in prompt

    def test_contains_today_log_speeches(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: 今日の発言ログが speech_id 付きでプロンプトに含まれること。
        """
        actor = make_test_actor("Setsu")
        ctx = _make_ctx("Hello everyone.", "I suspect SQ.")
        prompt = build_discussion_system_prompt(actor, ctx)
        assert "[1]" in prompt
        assert "[2]" in prompt
        assert "Hello everyone." in prompt

    def test_tool_instructions_present(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: speak / challenge / silent ツール案内がプロンプトに含まれること。
        """
        actor = make_test_actor("Setsu")
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx)
        assert "speak" in prompt
        assert "challenge" in prompt
        assert "silent" in prompt

    def test_co_tool_absent_for_villager(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: co_eligible=False のとき「- co:」説明がプロンプトに含まれないこと。
        """
        actor = make_test_actor("Setsu", "Villager")
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx, co_eligible=False)
        assert "- co:" not in prompt

    def test_co_tool_present_when_co_eligible(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: co_eligible=True のとき「- co:」説明がプロンプトに含まれること。
        """
        actor = make_test_actor("Setsu", "Seer")
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx, co_eligible=True)
        assert "- co:" in prompt

    def test_co_strategy_hint_seer(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: co_eligible=True で Seer のとき、Seer 固有の戦略ヒントが含まれること。
        """
        actor = make_test_actor("Setsu", "Seer")
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx, co_eligible=True)
        assert "Seer" in prompt
        assert "trust" in prompt.lower()

    def test_co_strategy_hint_werewolf(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: co_eligible=True で Werewolf のとき、偽 CO 向け戦略ヒントが含まれること。
        """
        from src.llm.prompt import WolfSpecificContext
        actor = make_test_actor("Setsu", "Werewolf")
        ctx = _make_ctx()
        role_ctx = WolfSpecificContext(wolf_partners=[])
        prompt = build_discussion_system_prompt(actor, ctx, co_eligible=True, role_ctx=role_ctx)
        assert "fake" in prompt.lower() or "claim" in prompt.lower()
        assert "Seer" in prompt or "Medium" in prompt

    def test_memory_included(self, make_test_actor):
        """
        SUT: build_discussion_system_prompt()
        Mock: なし
        Level: unit
        Objective: actor.state.memory_summary の内容がプロンプトに含まれること。
        """
        actor = make_test_actor("Setsu")
        actor.state.memory_summary = ["SQ changed vote on Day1"]
        ctx = _make_ctx()
        prompt = build_discussion_system_prompt(actor, ctx)
        assert "SQ changed vote on Day1" in prompt

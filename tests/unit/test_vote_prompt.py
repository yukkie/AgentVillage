"""build_vote_prompt のプロンプト組立テスト（Issue #216）。"""
from src.domain.actor import Belief
from src.domain.schema import SpeechEntry
from src.llm.prompt import build_vote_prompt


def _log(*texts: str) -> list[SpeechEntry]:
    return [SpeechEntry(speech_id=i + 1, agent=f"A{i}", text=t) for i, t in enumerate(texts)]


class TestBuildVotePrompt:
    def test_includes_alive_candidates_and_excludes_self(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: 投票候補リストに自分自身が含まれず、他の生存者全員が含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob", "Carol"],
            day=1,
        )
        assert "must vote for one of: Bob, Carol" in prompt

    def test_includes_today_full_discussion(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: 当日の議論ログ全体（speech_id 付き）がプロンプトに含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        prompt = build_vote_prompt(
            actor,
            today_log=_log("hello", "I suspect Bob"),
            alive_players=["Alice", "Bob"],
            day=1,
        )
        assert "Today's full discussion" in prompt
        assert "[1] A0: hello" in prompt
        assert "[2] A1: I suspect Bob" in prompt

    def test_includes_suspicion_scores_hint(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: actor.state.beliefs に suspicion スコアが入っているとき VOTE プロンプトにヒントとして含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        actor.state.beliefs = {
            "Bob": Belief(suspicion=0.74),
            "Carol": Belief(suspicion=0.42),
        }
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob", "Carol"],
            day=1,
        )
        assert "suspicion" in prompt
        assert "Bob=0.74" in prompt
        assert "Carol=0.42" in prompt

    def test_no_suspicion_hint_when_beliefs_empty(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: actor.state.beliefs が空のとき suspicion ヒントが含まれないこと。
        """
        actor = make_test_actor("Alice", "Villager")
        actor.state.beliefs = {}
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob"],
            day=1,
        )
        assert "suspicion scores" not in prompt

    def test_includes_past_votes_and_deaths(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: past_votes と past_deaths がプロンプトに含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob"],
            day=2,
            past_votes=[{"day": 1, "votes": {"Alice": "Bob", "Bob": "Carol"}}],
            past_deaths=[{"day": 1, "name": "Carol", "cause": "execution"}],
        )
        assert "Past votes" in prompt
        assert "Alice→Bob" in prompt
        assert "Past deaths" in prompt
        assert "Carol was executed" in prompt

    def test_villager_prompt_excludes_strategy_block(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: 村人の VOTE プロンプトには VOTE STRATEGY ブロックが含まれず、strategy が null 強制される指示が入ること。
        """
        actor = make_test_actor("Alice", "Villager")
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob"],
            day=1,
        )
        assert "VOTE STRATEGY" not in prompt
        assert "must be null" in prompt

    def test_werewolf_prompt_includes_strategy_block_and_partners(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: 狼の VOTE プロンプトに VOTE STRATEGY ブロック・village_side / wolf_side / 仲間情報が含まれること。
        """
        actor = make_test_actor("Wolf1", "Werewolf")
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Wolf1", "Wolf2", "Seer1"],
            day=1,
            wolf_partners=["Wolf2"],
        )
        assert "VOTE STRATEGY" in prompt
        assert "village_side" in prompt
        assert "wolf_side" in prompt
        assert "Wolf2" in prompt

    def test_includes_memory_summary_when_present(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: actor.state.memory_summary が非空のときその内容がプロンプトに含まれること。
        """
        actor = make_test_actor("Alice", "Villager")
        actor.state.memory_summary = ["Bob changed vote on Day1", "Carol stayed silent"]
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Alice", "Bob", "Carol"],
            day=2,
        )
        assert "Bob changed vote on Day1" in prompt
        assert "Carol stayed silent" in prompt

    def test_lone_wolf_prompt_indicates_no_partner(self, make_test_actor):
        """
        SUT: build_vote_prompt
        Mock: なし
        Level: unit
        Objective: 仲間が全滅した狼に渡される VOTE プロンプトで「last wolf」相当の表現が含まれること。
        """
        actor = make_test_actor("Wolf1", "Werewolf")
        prompt = build_vote_prompt(
            actor,
            today_log=[],
            alive_players=["Wolf1", "Seer1"],
            day=2,
            wolf_partners=[],
        )
        assert "last wolf" in prompt

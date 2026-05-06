import json
import sys
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic
import pydantic

from src.config import MAX_TOKENS
from src.domain.actor import Actor
from src.domain.roles import Role
from src.domain.schema import (
    DiscussionResult,
    NightActionOutput,
    SilentResult,
    SpeechEntry,
    VoteOutput,
    WolfChatOutput,
)
from src.llm.discussion_tools import build_discussion_tools, parse_discussion_tool_result
from src.llm.prompt import (
    PastDeath,
    PastVote,
    PublicContext,
    RoleSpecificContext,
    build_discussion_system_prompt,
    build_night_action_prompt,
    build_vote_prompt,
    build_wolf_chat_prompt,
)


def resolve_claim_role(actor: Actor, claim_role: Role | None) -> Role | None:
    if actor.role.can_co and claim_role is not None:
        return claim_role

    # Fallback path: the model chose CO but omitted the specific claimed role.
    if actor.role.can_co:
        fallback_role = actor.role.default_claim_role
        _log_warning(
            "resolve_claim_role",
            actor.name,
            f"claim_role missing; falling back to default_claim_role={fallback_role.name} for role {actor.role.name}",
        )
        return fallback_role

    # Unexpected path: a non-CO role returned a claim role anyway.
    if claim_role is not None:
        _log_warning(
            "resolve_claim_role",
            actor.name,
            f"received unexpected claim_role={claim_role.name} for non-CO role {actor.role.name}; ignoring",
        )
        return None

    return None


def _classify_error(e: Exception) -> str:
    """Classify an LLM call exception into one of four categories."""
    if isinstance(e, anthropic.APIError):
        return "api"
    if isinstance(e, pydantic.ValidationError):
        return "validation"
    if isinstance(e, json.JSONDecodeError):
        return "extraction"
    return "unexpected"


def _log_error(fn: str, agent_name: str, stage: str, e: Exception, raw: str) -> None:
    print(f"[{fn}] {stage} error for {agent_name}: {e!r}", file=sys.stderr)
    if raw:
        print(f"[{fn}] raw response: {raw!r}", file=sys.stderr)


def _classify_and_log_error(fn: str, agent_name: str, e: Exception, raw: str) -> None:
    kind = _classify_error(e)
    _log_error(fn, agent_name, kind, e, raw)


def _log_warning(fn: str, agent_name: str, message: str) -> None:
    print(f"[{fn}] warning for {agent_name}: {message}", file=sys.stderr)


def _extract_json(text: str) -> str:
    """Extract the first complete JSON object from text.

    Handles markdown code fences, multiple JSON blocks, and self-correction
    patterns where the LLM emits extra text or a second JSON block.

    Strategy:
    1. Look for a ```json ... ``` or ``` ... ``` fence first — this avoids
       false matches on set-notation like {SQ, Jonas, Lumi} in prose.
    2. Fall back to bracket counting when no fence is present.
    """
    import re
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    # Fallback: bracket counting to find first complete { ... } span
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]  # truncated JSON fallback


class LLMClient:
    """Wrapper around ``anthropic.Anthropic`` for game-specific LLM calls.

    External-Boundary: anthropic SDK
    Mock-Policy: Required
        External API. Tests must mock this client (or the underlying
        ``anthropic.Anthropic``) — using the real API would make tests slow,
        flaky, and costly. Mock responses must conform to the JSON schemas
        in ``src/domain/schema.py``; off-schema mocks defeat the purpose.
    """

    def __init__(self, client: anthropic.Anthropic) -> None:
        self._client = client

    def call_discussion(
        self,
        actor: Actor,
        ctx: PublicContext,
        lang: str = "English",
        role_ctx: RoleSpecificContext | None = None,
    ) -> DiscussionResult:
        """Call LLM for a DISCUSSION turn using tool use; return one DiscussionResult."""
        co_eligible = actor.state.claimed_role is None and actor.role.can_co
        system_prompt = build_discussion_system_prompt(actor, ctx, co_eligible, lang, role_ctx)
        tools = build_discussion_tools(co_eligible)
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_discussion"],
                system=system_prompt,
                tools=tools,
                tool_choice={"type": "any"},
                messages=[
                    {
                        "role": "user",
                        "content": "It's your turn. Use one of the available tools to take your action.",
                    }
                ],
            )
            return parse_discussion_tool_result(message, actor.name, message.model_dump_json())
        except Exception as e:
            _classify_and_log_error("call_discussion", actor.name, e, "")
            return SilentResult(reasoning="error fallback")

    def call_discussion_parallel(
        self,
        actors: list[Actor],
        ctx_map: dict[str, tuple[PublicContext, RoleSpecificContext | None]],
        lang: str,
    ) -> Iterator[tuple[Actor, DiscussionResult]]:
        """Run DISCUSSION tool use calls for all actors in parallel; yield in completion order.

        ``ctx_map`` maps actor name → (PublicContext, RoleSpecificContext | None),
        pre-built by the engine so the client stays oblivious to game state.
        """

        def _call(actor: Actor) -> tuple[Actor, DiscussionResult]:
            ctx, role_ctx = ctx_map[actor.name]
            result = self.call_discussion(actor, ctx, lang, role_ctx)
            return actor, result

        with ThreadPoolExecutor() as executor:
            futures = {executor.submit(_call, actor): actor for actor in actors}
            for future in as_completed(futures):
                yield future.result()

    def call_vote(
        self,
        actor: Actor,
        today_log: list[SpeechEntry],
        alive_players: list[str],
        day: int,
        past_votes: list[PastVote] | None = None,
        past_deaths: list[PastDeath] | None = None,
        wolf_partners: list[str] | None = None,
        lang: str = "English",
    ) -> VoteOutput:
        """Call LLM for the dedicated VOTE-phase decision."""
        prompt = build_vote_prompt(
            actor,
            today_log,
            alive_players,
            day,
            past_votes,
            past_deaths,
            wolf_partners,
            lang,
        )
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_vote"],
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text
            return VoteOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call_vote", actor.name, e, raw)
            return VoteOutput(target="", reasoning="", strategy=None)

    def call_vote_parallel(
        self,
        calls: list[tuple[Actor, list[str] | None]],
        today_log: list[SpeechEntry],
        alive_players: list[str],
        day: int,
        past_votes: list[PastVote] | None = None,
        past_deaths: list[PastDeath] | None = None,
        lang: str = "English",
    ) -> Iterator[tuple[Actor, VoteOutput]]:
        """Run VOTE-phase calls for all actors in parallel; yield in completion order.

        ``calls`` is a list of (actor, wolf_partners_or_None). Wolf partners
        are pre-resolved by the engine so the client stays oblivious to game
        state.
        """
        with ThreadPoolExecutor() as executor:
            future_to_actor = {
                executor.submit(
                    self.call_vote,
                    actor,
                    today_log,
                    alive_players,
                    day,
                    past_votes,
                    past_deaths,
                    wolf_partners,
                    lang,
                ): actor
                for actor, wolf_partners in calls
            }
            for future in as_completed(future_to_actor):
                yield future_to_actor[future], future.result()

    def call_wolf_chat(
        self,
        actor: Actor,
        wolf_partners: list[str],
        alive_players: list[str],
        wolf_chat_log: list[SpeechEntry],
        lang: str = "English",
    ) -> WolfChatOutput:
        """Call LLM for werewolf team night chat and return structured WolfChatOutput."""
        prompt = build_wolf_chat_prompt(actor, wolf_partners, alive_players, wolf_chat_log, lang)
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_wolf_chat"],
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text
            return WolfChatOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call_wolf_chat", actor.name, e, raw)
            return WolfChatOutput(thought="...", speech="...", attack_candidates={})

    def call_night_action(
        self,
        actor: Actor,
        context: str,
        alive_players: list[str],
    ) -> NightActionOutput:
        """Call LLM for night action and return structured NightActionOutput."""
        prompt = build_night_action_prompt(actor, alive_players, context)
        if not prompt:
            return NightActionOutput(target="", reasoning="")

        candidates = [p for p in alive_players if p != actor.name]
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_night_action"],
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
            )
            raw = message.content[0].text.strip()
            parsed = NightActionOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call_night_action", actor.name, e, raw)
            return NightActionOutput(target=candidates[0] if candidates else "", reasoning="")

        # Validate target is a live player; fall back to first candidate on mismatch
        target = parsed.target
        for candidate in candidates:
            if candidate.lower() == target.lower():
                return NightActionOutput(target=candidate, reasoning=parsed.reasoning)
        for candidate in candidates:
            if candidate.lower() in target.lower():
                return NightActionOutput(target=candidate, reasoning=parsed.reasoning)
        return NightActionOutput(
            target=candidates[0] if candidates else "",
            reasoning=parsed.reasoning,
        )

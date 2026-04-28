import json
import sys
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic
import pydantic

from src.config import MAX_TOKENS
from src.domain.actor import Actor
from src.domain.roles import Role
from src.domain.schema import AgentOutput, Intent, JudgmentOutput, PreNightOutput, SpeechEntry, WolfChatOutput
from src.llm.prompt import PublicContext, RoleSpecificContext, SpeechDirection, build_judgment_prompt, build_night_action_prompt, build_pre_night_prompt, build_system_prompt, build_wolf_chat_prompt


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


def _default_output(actor: Actor) -> AgentOutput:
    """Fallback AgentOutput when LLM call or parse fails."""
    return AgentOutput(
        thought="...",
        speech="I need to think more carefully.",
        reasoning="I'm not sure who to suspect yet.",
        intent=Intent(vote_candidates=[], co=None),
        memory_update=[],
    )


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

    def call(
        self,
        actor: Actor,
        ctx: PublicContext,
        direction: SpeechDirection,
        role_ctx: RoleSpecificContext | None = None,
    ) -> AgentOutput:
        """Call LLM for day-phase speech and return structured AgentOutput."""
        system_prompt = build_system_prompt(actor, ctx, direction, role_ctx)
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_speech"],
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": "It's your turn. Provide your response in the required JSON format.",
                    }
                ],
            )
            raw = message.content[0].text
            return AgentOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call", actor.name, e, raw)
            return _default_output(actor)

    def call_judgment(
        self,
        actor: Actor,
        today_log: list[SpeechEntry],
        alive_players: list[str],
        day: int = 1,
        lang: str = "English",
    ) -> JudgmentOutput:
        """Call LLM for the lightweight parallel judgment decision."""
        co_eligible = actor.state.claimed_role is None and actor.role.can_co
        prompt = build_judgment_prompt(actor, today_log, alive_players, day, lang, co_eligible)
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_judgment"],
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text
            return JudgmentOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call_judgment", actor.name, e, raw)
            return JudgmentOutput(decision="silent")

    def call_speech_parallel(
        self,
        calls: list[tuple[Actor, PublicContext, SpeechDirection, RoleSpecificContext | None]],
    ) -> Iterator[tuple[Actor, AgentOutput]]:
        """Fire all speech calls in parallel; yield results in completion order."""
        with ThreadPoolExecutor() as executor:
            future_to_actor = {
                executor.submit(self.call, actor, ctx, direction, role_ctx): actor
                for actor, ctx, direction, role_ctx in calls
            }
            for future in as_completed(future_to_actor):
                yield future_to_actor[future], future.result()

    def call_pre_night_action(
        self,
        actor: Actor,
        alive_players: list[str],
        lang: str = "English",
        all_agents: list[Actor] | None = None,
    ) -> PreNightOutput:
        """Call LLM for pre-night CO decision and return structured PreNightOutput."""
        prompt = build_pre_night_prompt(actor, alive_players, lang, all_agents)
        raw = ""
        try:
            message = self._client.messages.create(
                model=actor.model,
                max_tokens=MAX_TOKENS["call_pre_night_action"],
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text
            return PreNightOutput.model_validate_json(_extract_json(raw))
        except Exception as e:
            _classify_and_log_error("call_pre_night_action", actor.name, e, raw)
            return PreNightOutput(thought="...", decision="wait", claim_role=None, reasoning="Defaulting to wait.")

    def call_pre_night_parallel(
        self,
        agents: list[Actor],
        alive_players: list[str],
        lang: str = "English",
        all_agents: list[Actor] | None = None,
    ) -> Iterator[tuple[Actor, PreNightOutput]]:
        """Call pre-night CO decision for all agents in parallel; yield results in completion order."""
        with ThreadPoolExecutor() as executor:
            future_to_agent = {
                executor.submit(self.call_pre_night_action, actor, alive_players, lang, all_agents): actor
                for actor in agents
            }
            for future in as_completed(future_to_agent):
                actor = future_to_agent[future]
                yield actor, future.result()

    def call_discussion_parallel(
        self,
        actors: list[Actor],
        today_log_snapshot: list[SpeechEntry],
        alive_names: list[str],
        day: int,
        lang: str,
        build_speech_args: Callable[
            [Actor, SpeechEntry | None, list[SpeechEntry]],
            tuple[PublicContext, SpeechDirection, RoleSpecificContext | None],
        ],
    ) -> Iterator[tuple[Actor, JudgmentOutput, AgentOutput | None, SpeechEntry | None]]:
        """Run judgment→speech chain for all actors in parallel; yield results in completion order."""

        def _chain(actor: Actor) -> tuple[Actor, JudgmentOutput, AgentOutput | None, SpeechEntry | None]:
            judgment = self.call_judgment(actor, today_log_snapshot, alive_names, day, lang)
            if judgment.decision == "silent":
                return actor, judgment, None, None
            is_co_eligible = actor.state.claimed_role is None and actor.role.can_co
            actor.state.intended_co = (
                resolve_claim_role(actor, judgment.claim_role)
                if judgment.decision == "co" and is_co_eligible
                else None
            )
            reply_to_entry: SpeechEntry | None = None
            if judgment.decision == "challenge" and judgment.reply_to is not None:
                reply_to_entry = next(
                    (e for e in today_log_snapshot if e.speech_id == judgment.reply_to),
                    None,
                )
            ctx, direction, role_ctx = build_speech_args(actor, reply_to_entry, today_log_snapshot)
            output = self.call(actor, ctx, direction, role_ctx)
            return actor, judgment, output, reply_to_entry

        with ThreadPoolExecutor() as executor:
            futures = {executor.submit(_chain, actor): actor for actor in actors}
            for future in as_completed(futures):
                yield future.result()

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
            return WolfChatOutput(thought="...", speech="...", vote_candidates=[])

    def call_night_action(
        self,
        actor: Actor,
        context: str,
        alive_players: list[str],
    ) -> str:
        """Call LLM for night action and return target player name."""
        prompt = build_night_action_prompt(actor, alive_players, context)
        if not prompt:
            return ""

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
        except Exception as e:
            _classify_and_log_error("call_night_action", actor.name, e, raw)
            return candidates[0] if candidates else ""
        # Validate that the returned name is a valid alive player
        for candidate in candidates:
            if candidate.lower() == raw.lower():
                return candidate
        # If exact match fails, try partial match
        for candidate in candidates:
            if candidate.lower() in raw.lower():
                return candidate
        # Fallback: first candidate
        return candidates[0] if candidates else ""

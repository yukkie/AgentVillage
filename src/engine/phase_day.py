from __future__ import annotations

import random
from typing import TYPE_CHECKING

from src.agent import memory as memory_mod
from src.config import DISCUSSION_ROUNDS
from src.domain.event import EventType, LogEvent
from src.domain.roles import Medium, Werewolf
from src.engine.phase import Phase
from src.engine.victory import check_victory
from src.engine.vote import tally_votes

if TYPE_CHECKING:
    from src.engine.game import GameEngine


def _run_opening(engine: GameEngine) -> None:
    engine.phase = Phase.DAY_OPENING
    engine._phase_start(Phase.DAY_OPENING)

    opening_order = engine._alive_agents()
    random.shuffle(opening_order)

    opening_calls = [(actor, *engine._build_speech_args(actor)) for actor in opening_order]
    for actor, output in engine._llm_client.call_speech_parallel(opening_calls):
        engine._apply_speech_output(actor, output, Phase.DAY_OPENING)


def _run_discussion(engine: GameEngine) -> None:
    engine.phase = Phase.DAY_DISCUSSION
    for _round in range(DISCUSSION_ROUNDS):
        engine._phase_start(Phase.DAY_DISCUSSION)
        alive = engine._alive_agents()
        snapshot = list(engine.today_log)

        spoke_anyone = False
        for actor, judgment, output, reply_to_entry in engine._llm_client.call_discussion_parallel(
            alive,
            snapshot,
            engine._alive_names(),
            engine.day,
            engine.lang,
            engine._build_speech_args,
        ):
            if judgment.reasoning:
                engine._emit(LogEvent.make(
                    day=engine.day,
                    phase=Phase.DAY_DISCUSSION.value,
                    event_type=EventType.JUDGMENT,
                    agent=actor.name,
                    content=f"{actor.name} [{judgment.decision}]: {judgment.reasoning}",
                    is_public=False,
                    decision=judgment.decision,
                    reasoning=judgment.reasoning,
                ))
            if output is None:
                engine._emit(LogEvent.make(
                    day=engine.day,
                    phase=Phase.DAY_DISCUSSION.value,
                    event_type=EventType.SPEECH,
                    agent=actor.name,
                    content=f"{actor.name} is watching the village silently...",
                    is_public=True,
                ))
            else:
                spoke_anyone = True
                engine._apply_speech_output(
                    actor, output, Phase.DAY_DISCUSSION, reply_to_entry
                )

        if not spoke_anyone:
            break


def _run_vote(engine: GameEngine) -> str | None:
    engine.phase = Phase.DAY_VOTE
    engine._phase_start(Phase.DAY_VOTE)

    votes: dict[str, str] = {}
    alive_names = engine._alive_names()

    for actor in engine._alive_agents():
        output = engine._day_outputs.get(actor.name)
        target = None

        if output and output.intent.vote_candidates:
            sorted_candidates = sorted(
                output.intent.vote_candidates,
                key=lambda vc: vc.score,
                reverse=True,
            )
            for vc in sorted_candidates:
                if vc.target in alive_names and vc.target != actor.name:
                    target = vc.target
                    break

        if target is None:
            others = [n for n in alive_names if n != actor.name]
            target = others[0] if others else None

        if target:
            vote_action = engine._make_vote(target)
            if engine._validate_action(vote_action, actor, alive_names):
                votes[actor.name] = target
                vote_reasoning = output.reasoning if output else ""
                engine._emit(LogEvent.make(
                    day=engine.day,
                    phase=Phase.DAY_VOTE.value,
                    event_type=EventType.VOTE,
                    agent=actor.name,
                    target=target,
                    content=f"{actor.name} votes for {target}",
                    is_public=True,
                    reasoning=vote_reasoning,
                ))

    if not votes:
        return None

    engine._past_votes.append({"day": engine.day, "votes": dict(votes)})
    eliminated = tally_votes(votes)
    engine._eliminate(eliminated, EventType.ELIMINATION, Phase.DAY_VOTE.value)
    return eliminated


def _resolve_post_vote(engine: GameEngine, eliminated: str) -> None:
    medium = next((a for a in engine._alive_agents() if isinstance(a.role, Medium)), None)
    if not medium:
        return

    executed_actor = engine._get_agent(eliminated)
    if not executed_actor:
        return

    result = "Werewolf" if isinstance(executed_actor.role, Werewolf) else "Not Werewolf"
    memory_mod.update_memory(
        medium,
        [f"Day {engine.day}: {eliminated} was executed, they were {result}"],
    )
    engine._emit(LogEvent.make(
        day=engine.day,
        phase=Phase.DAY_VOTE.value,
        event_type=EventType.MEDIUM_RESULT,
        agent=medium.name,
        target=eliminated,
        content=f"{medium.name} senses: {eliminated} was {result}",
        is_public=False,
    ))


def run_day_phase(engine: GameEngine) -> str | None:
    engine._day_outputs = {}

    _run_opening(engine)
    _run_discussion(engine)
    eliminated = _run_vote(engine)
    if eliminated:
        _resolve_post_vote(engine, eliminated)

    return check_victory(engine.agents)

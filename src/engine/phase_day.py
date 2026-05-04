from __future__ import annotations

from typing import TYPE_CHECKING

from src.agent import memory as memory_mod
from src.config import DISCUSSION_ROUNDS
from src.domain.actor import Actor
from src.domain.event import EventType, LogEvent
from src.domain.roles import Medium, Werewolf
from src.engine.phase import Phase
from src.engine.victory import check_victory
from src.engine.vote import tally_votes

if TYPE_CHECKING:
    from src.engine.game import GameEngine


def _run_discussion(engine: GameEngine) -> None:
    engine.phase = Phase.DAY_DISCUSSION
    for _round in range(DISCUSSION_ROUNDS):
        engine._phase_start(Phase.DAY_DISCUSSION)
        alive = engine._alive_agents()
        snapshot = list(engine.today_log)
        ctx_map = engine._build_discussion_ctx_map(snapshot)

        spoke_anyone = False
        for actor, result in engine._llm_client.call_discussion_parallel(
            alive,
            ctx_map,
            engine.lang,
        ):
            entry = engine._apply_discussion_result(actor, result, Phase.DAY_DISCUSSION)
            if entry is not None:
                spoke_anyone = True

        if not spoke_anyone:
            break


def _run_vote(engine: GameEngine) -> str | None:
    engine.phase = Phase.DAY_VOTE
    engine._phase_start(Phase.DAY_VOTE)

    alive = engine._alive_agents()
    alive_names = engine._alive_names()

    calls: list[tuple[Actor, list[str] | None]] = []
    for actor in alive:
        wolf_partners: list[str] | None = None
        if isinstance(actor.role, Werewolf):
            wolf_partners = [
                a.name for a in alive if isinstance(a.role, Werewolf) and a.name != actor.name
            ]
        calls.append((actor, wolf_partners))

    votes: dict[str, str] = {}
    for actor, vote_output in engine._llm_client.call_vote_parallel(
        calls,
        list(engine.today_log),
        alive_names,
        engine.day,
        engine._past_votes,
        engine._past_deaths,
        engine.lang,
    ):
        if vote_output.target in alive_names and vote_output.target != actor.name:
            target = vote_output.target
        else:
            others = [n for n in alive_names if n != actor.name]
            target = others[0]
        vote_action = engine._make_vote(target)
        if not engine._validate_action(vote_action, actor, alive_names):
            continue
        votes[actor.name] = target
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.DAY_VOTE.value,
            event_type=EventType.VOTE,
            agent=actor.name,
            target=target,
            content=f"{actor.name} votes for {target}",
            is_public=True,
            reasoning=vote_output.reasoning,
            decision=vote_output.strategy or "",
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
    _run_discussion(engine)
    eliminated = _run_vote(engine)
    if eliminated:
        _resolve_post_vote(engine, eliminated)

    return check_victory(engine.agents)

from __future__ import annotations

from typing import TYPE_CHECKING

from src.agent import memory as memory_mod
from src.domain.event import EventType, LogEvent
from src.domain.roles import Villager
from src.engine.phase import Phase

if TYPE_CHECKING:
    from src.engine.game import GameEngine


def run_pre_night_phase(engine: GameEngine) -> None:
    """Run the one-time pre-night CO decision phase."""
    targets = [a for a in engine._alive_agents() if not isinstance(a.role, Villager)]
    if not targets:
        return

    engine._phase_start(Phase.PRE_NIGHT)

    for actor, output in engine._llm_client.call_pre_night_parallel(
        targets, engine._alive_names(), engine.lang, engine.agents
    ):
        actor.state.intended_co = output.decision == "co"
        memory_mod.update_memory(actor, [f"Pre-game decision: {output.reasoning}"])

        decision_label = "decided to CO" if actor.state.intended_co else "decided to wait"
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.PRE_NIGHT.value,
            event_type=EventType.PRE_NIGHT_DECISION,
            agent=actor.name,
            content=f"{actor.name} ({actor.role.name}) {decision_label}. Reasoning: {output.reasoning}",
            is_public=False,
        ))

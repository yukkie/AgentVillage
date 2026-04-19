from __future__ import annotations

from typing import TYPE_CHECKING

from src.agent import memory as memory_mod, store
from src.action.resolver import resolve_attack, resolve_inspect
from src.action.types import Attack, Inspect
from src.domain.actor import Belief
from src.domain.event import EventType, LogEvent
from src.domain.roles import Knight, Seer, Werewolf
from src.domain.schema import SpeechEntry
from src.engine.phase import Phase
from src.engine.victory import check_victory

if TYPE_CHECKING:
    from src.engine.game import GameEngine


def run_night_phase(engine: GameEngine) -> str | None:
    engine.phase = Phase.NIGHT
    engine._phase_start(Phase.NIGHT)
    engine.today_log = []

    alive_names = engine._alive_names()
    night_context = f"Day {engine.day} night. Alive: {', '.join(alive_names)}"

    attack_target: str | None = None
    guard_target: str | None = None

    wolves = [a for a in engine._alive_agents() if isinstance(a.role, Werewolf)]
    if len(wolves) >= 2:
        engine.phase = Phase.NIGHT_WOLF_CHAT
        engine._phase_start(Phase.NIGHT_WOLF_CHAT)
        wolf_chat_log: list[SpeechEntry] = []
        wolf_names = [w.name for w in wolves]
        last_wolf_outputs = {w.name: None for w in wolves}

        for _round in range(engine._wolf_chat_rounds):
            for wolf in wolves:
                partners = [n for n in wolf_names if n != wolf.name]
                output = engine._llm_client.call_wolf_chat(
                    wolf, partners, alive_names, wolf_chat_log, engine.lang
                )
                last_wolf_outputs[wolf.name] = output
                entry = SpeechEntry(
                    speech_id=engine._next_speech_id(),
                    agent=wolf.name,
                    text=output.speech,
                )
                wolf_chat_log.append(entry)
                engine._emit(LogEvent.make(
                    day=engine.day,
                    phase=Phase.NIGHT_WOLF_CHAT.value,
                    event_type=EventType.WOLF_CHAT,
                    agent=wolf.name,
                    content=f"{wolf.name}: {output.speech}",
                    is_public=False,
                ))

        score_totals: dict[str, float] = {}
        for wolf in wolves:
            out = last_wolf_outputs[wolf.name]
            if out and out.vote_candidates:
                for vc in out.vote_candidates:
                    if vc.target in alive_names and vc.target not in wolf_names:
                        score_totals[vc.target] = score_totals.get(vc.target, 0.0) + vc.score
        if score_totals:
            attack_target = max(score_totals, key=lambda t: score_totals[t])

    if attack_target is None:
        for actor in engine._alive_agents():
            if not isinstance(actor.role, Werewolf):
                continue
            target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
            attack = Attack(target=target_name)
            if engine._validate_action(attack, actor, alive_names):
                attack_target = resolve_attack(attack, engine.agents)
                break

    if attack_target:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.NIGHT_ATTACK,
            agent=wolves[0].name if wolves else None,
            target=attack_target,
            content=f"Werewolves attack {attack_target}",
            is_public=False,
        ))

    seer_inspect: tuple[object, Inspect] | None = None

    knight = None
    for actor in engine._alive_agents():
        if isinstance(actor.role, Knight):
            knight = actor
            target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
            candidates = [n for n in alive_names if n != actor.name]
            if target_name in candidates:
                guard_target = target_name
                engine._emit(LogEvent.make(
                    day=engine.day,
                    phase=Phase.NIGHT.value,
                    event_type=EventType.GUARD,
                    agent=actor.name,
                    target=guard_target,
                    content=f"{actor.name} guards {guard_target}",
                    is_public=False,
                ))

        elif isinstance(actor.role, Seer):
            target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
            inspect = Inspect(target=target_name)
            if engine._validate_action(inspect, actor, alive_names):
                seer_inspect = (actor, inspect)

    seer_survived = True
    if attack_target:
        if guard_target == attack_target:
            engine._emit(LogEvent.make(
                day=engine.day,
                phase=Phase.NIGHT.value,
                event_type=EventType.GUARD_BLOCK,
                target=attack_target,
                content=f"{attack_target} was protected by the Knight! The attack was blocked.",
                is_public=False,
            ))
            engine._emit(LogEvent.make(
                day=engine.day,
                phase=Phase.NIGHT.value,
                event_type=EventType.GUARD_BLOCK,
                content="The village woke up to find everyone safe. The werewolves' attack seems to have failed.",
                is_public=True,
            ))
            if knight:
                memory_mod.update_memory(
                    knight,
                    [f"Day {engine.day}: successfully guarded {guard_target} from werewolf attack"],
                )
        else:
            if seer_inspect and seer_inspect[0].name == attack_target:
                seer_survived = False
            engine._eliminate(attack_target, EventType.NIGHT_ATTACK, Phase.NIGHT.value)

    if seer_inspect and seer_survived:
        seer, inspect = seer_inspect
        name, result = resolve_inspect(inspect, engine.agents)
        if name not in seer.state.beliefs:
            seer.state.beliefs[name] = Belief()
        if isinstance(result, Werewolf):
            seer.state.beliefs[name].suspicion = 1.0
            seer.state.beliefs[name].trust = 0.0
            seer.state.beliefs[name].reason.append(f"Day {engine.day}: inspected as Werewolf")
        else:
            seer.state.beliefs[name].suspicion = 0.0
            seer.state.beliefs[name].trust = 1.0
            seer.state.beliefs[name].reason.append(f"Day {engine.day}: inspected as Not Werewolf")
        store.save(seer)
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.INSPECTION,
            agent=seer.name,
            target=name,
            content=f"{seer.name} inspects {name}: {result}",
            is_public=False,
        ))

    return check_victory(engine.agents)

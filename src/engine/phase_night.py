from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.agent import memory as memory_mod, store
from src.action.resolver import resolve_attack, resolve_inspect
from src.action.types import Attack, Inspect
from src.domain.actor import Actor, Belief
from src.domain.event import EventType, LogEvent
from src.domain.roles import Knight, Seer, Werewolf
from src.domain.schema import SpeechEntry, WolfChatOutput
from src.engine.phase import Phase
from src.engine.victory import check_victory

if TYPE_CHECKING:
    from src.engine.game import GameEngine


@dataclass
class NightDeclarations:
    attack_target: str | None
    attack_actor: Actor | None
    guard_target: str | None
    knight: Actor | None
    seer_inspect: tuple[Actor, Inspect] | None


@dataclass
class InspectionResolution:
    seer: Actor
    target_name: str
    result: Werewolf | None


@dataclass
class NightResolution:
    attack_target: str | None
    attack_actor: Actor | None
    guard_target: str | None
    knight: Actor | None
    attack_blocked: bool = False
    inspection: InspectionResolution | None = None


def _run_wolf_chat(engine: GameEngine) -> str | None:
    wolves = [a for a in engine._alive_agents() if isinstance(a.role, Werewolf)]
    if len(wolves) < 2:
        return None

    engine.phase = Phase.NIGHT_WOLF_CHAT
    engine._phase_start(Phase.NIGHT_WOLF_CHAT)
    wolf_chat_log: list[SpeechEntry] = []
    wolf_names = [w.name for w in wolves]
    last_wolf_outputs: dict[str, WolfChatOutput | None] = {w.name: None for w in wolves}

    for _round in range(engine._wolf_chat_rounds):
        for wolf in wolves:
            partners = [n for n in wolf_names if n != wolf.name]
            output = engine._llm_client.call_wolf_chat(
                wolf, partners, engine._alive_names(), wolf_chat_log, engine.lang
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

    alive_names = engine._alive_names()
    score_totals: dict[str, float] = {}
    for wolf in wolves:
        out = last_wolf_outputs[wolf.name]
        if out and out.vote_candidates:
            for vc in out.vote_candidates:
                if vc.target in alive_names and vc.target not in wolf_names:
                    score_totals[vc.target] = score_totals.get(vc.target, 0.0) + vc.score
    if score_totals:
        return max(score_totals, key=lambda t: score_totals[t])
    return None


def _resolve_fallback_attack(engine: GameEngine, alive_names: list[str]) -> str | None:
    night_context = f"Day {engine.day} night. Alive: {', '.join(alive_names)}"
    for actor in engine._alive_agents():
        if not isinstance(actor.role, Werewolf):
            continue
        target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
        attack = Attack(target=target_name)
        if engine._validate_action(attack, actor, alive_names):
            return resolve_attack(attack, engine.agents)
    return None


def _declare_night_actions(
    engine: GameEngine, alive_names: list[str], night_context: str
) -> NightDeclarations:
    attack_target = _run_wolf_chat(engine)

    if attack_target is None:
        attack_target = _resolve_fallback_attack(engine, alive_names)

    wolves = [a for a in engine._alive_agents() if isinstance(a.role, Werewolf)]
    attack_actor = wolves[0] if attack_target and wolves else None

    guard_target: str | None = None
    seer_inspect: tuple[Actor, Inspect] | None = None
    knight: Actor | None = None

    for actor in engine._alive_agents():
        if isinstance(actor.role, Knight):
            knight = actor
            target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
            candidates = [n for n in alive_names if n != actor.name]
            if target_name in candidates:
                guard_target = target_name
        elif isinstance(actor.role, Seer):
            target_name = engine._llm_client.call_night_action(actor, night_context, alive_names)
            inspect = Inspect(target=target_name)
            if engine._validate_action(inspect, actor, alive_names):
                seer_inspect = (actor, inspect)

    return NightDeclarations(
        attack_target=attack_target,
        attack_actor=attack_actor,
        guard_target=guard_target,
        knight=knight,
        seer_inspect=seer_inspect,
    )


def _resolve_declared_inspection(
    engine: GameEngine, seer_inspect: tuple[Actor, Inspect] | None
) -> InspectionResolution | None:
    if seer_inspect is None:
        return None

    seer, inspect = seer_inspect
    name, result = resolve_inspect(inspect, engine.agents)
    return InspectionResolution(seer=seer, target_name=name, result=result)


def _resolve_night_outcomes(
    engine: GameEngine, declarations: NightDeclarations
) -> NightResolution:
    resolution = NightResolution(
        attack_target=declarations.attack_target,
        attack_actor=declarations.attack_actor,
        guard_target=declarations.guard_target,
        knight=declarations.knight,
        inspection=_resolve_declared_inspection(engine, declarations.seer_inspect),
    )

    if not declarations.attack_target:
        return resolution

    if declarations.guard_target == declarations.attack_target:
        resolution.attack_blocked = True
        return resolution

    engine._eliminate(
        declarations.attack_target,
        EventType.NIGHT_ATTACK,
        Phase.NIGHT.value,
    )
    return resolution


def _publish_inspection(engine: GameEngine, inspection: InspectionResolution) -> None:
    seer = inspection.seer
    name = inspection.target_name
    result = inspection.result
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


def _publish_night_results(engine: GameEngine, resolution: NightResolution) -> None:
    if resolution.guard_target and resolution.knight:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD,
            agent=resolution.knight.name,
            target=resolution.guard_target,
            content=f"{resolution.knight.name} guards {resolution.guard_target}",
            is_public=False,
        ))

    if resolution.attack_target:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.NIGHT_ATTACK,
            agent=resolution.attack_actor.name if resolution.attack_actor else None,
            target=resolution.attack_target,
            content=f"Werewolves attack {resolution.attack_target}",
            is_public=False,
        ))

    if resolution.attack_blocked and resolution.attack_target:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD_BLOCK,
            target=resolution.attack_target,
            content=f"{resolution.attack_target} was protected by the Knight! The attack was blocked.",
            is_public=False,
        ))
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD_BLOCK,
            content="The village woke up to find everyone safe. The werewolves' attack seems to have failed.",
            is_public=True,
        ))
        if resolution.knight and resolution.guard_target:
            memory_mod.update_memory(
                resolution.knight,
                [f"Day {engine.day}: successfully guarded {resolution.guard_target} from werewolf attack"],
            )

    if resolution.inspection and resolution.inspection.seer.is_alive:
        _publish_inspection(engine, resolution.inspection)


def run_night_phase(engine: GameEngine) -> str | None:
    engine.phase = Phase.NIGHT
    engine._phase_start(Phase.NIGHT)
    engine.today_log = []

    alive_names = engine._alive_names()
    night_context = f"Day {engine.day} night. Alive: {', '.join(alive_names)}"

    declarations = _declare_night_actions(engine, alive_names, night_context)
    resolution = _resolve_night_outcomes(engine, declarations)
    _publish_night_results(engine, resolution)

    return check_victory(engine.agents)

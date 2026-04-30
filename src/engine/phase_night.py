from __future__ import annotations

from dataclasses import dataclass, replace
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
class AttackDeclaration:
    actor: Actor
    target: str
    reasoning: str = ""


@dataclass
class GuardDeclaration:
    actor: Actor
    target: str
    succeeded: bool = False
    reasoning: str = ""


@dataclass
class InspectDeclaration:
    actor: Actor
    target: str
    reasoning: str = ""


@dataclass
class NightDeclarations:
    attack: AttackDeclaration | None
    guard: GuardDeclaration | None
    inspect: InspectDeclaration | None


@dataclass
class InspectionResult:
    declaration: InspectDeclaration
    result: Werewolf | None


@dataclass
class NightResolution:
    attack: AttackDeclaration | None
    guard: GuardDeclaration | None
    inspection: InspectionResult | None


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


def _resolve_fallback_attack(
    engine: GameEngine, alive_names: list[str]
) -> tuple[str, str] | None:
    night_context = f"Day {engine.day} night. Alive: {', '.join(alive_names)}"
    for actor in engine._alive_agents():
        if not isinstance(actor.role, Werewolf):
            continue
        result = engine._llm_client.call_night_action(actor, night_context, alive_names)
        attack = Attack(target=result.target)
        if engine._validate_action(attack, actor, alive_names):
            return resolve_attack(attack, engine.agents), result.reasoning
    return None


def _declare_night_actions(
    engine: GameEngine, alive_names: list[str], night_context: str
) -> NightDeclarations:
    attack_target = _run_wolf_chat(engine)
    fallback_reasoning = ""

    if attack_target is None:
        fallback = _resolve_fallback_attack(engine, alive_names)
        if fallback is not None:
            attack_target, fallback_reasoning = fallback

    wolves = [a for a in engine._alive_agents() if isinstance(a.role, Werewolf)]
    attack: AttackDeclaration | None = None
    if attack_target and wolves:
        attack = AttackDeclaration(actor=wolves[0], target=attack_target, reasoning=fallback_reasoning)

    guard: GuardDeclaration | None = None
    inspect: InspectDeclaration | None = None

    for actor in engine._alive_agents():
        if isinstance(actor.role, Knight):
            result = engine._llm_client.call_night_action(actor, night_context, alive_names)
            candidates = [n for n in alive_names if n != actor.name]
            if result.target in candidates:
                guard = GuardDeclaration(actor=actor, target=result.target, reasoning=result.reasoning)
        elif isinstance(actor.role, Seer):
            result = engine._llm_client.call_night_action(actor, night_context, alive_names)
            inspect_action = Inspect(target=result.target)
            if engine._validate_action(inspect_action, actor, alive_names):
                inspect = InspectDeclaration(actor=actor, target=inspect_action.target, reasoning=result.reasoning)

    return NightDeclarations(attack=attack, guard=guard, inspect=inspect)


def _resolve_declared_inspection(
    engine: GameEngine, inspect: InspectDeclaration | None
) -> InspectionResult | None:
    if inspect is None:
        return None

    name, result = resolve_inspect(Inspect(target=inspect.target), engine.agents)
    return InspectionResult(
        declaration=replace(inspect, target=name),
        result=result,
    )


def _resolve_night_outcomes(
    engine: GameEngine, declarations: NightDeclarations
) -> NightResolution:
    resolution = NightResolution(
        attack=declarations.attack,
        guard=declarations.guard,
        inspection=_resolve_declared_inspection(engine, declarations.inspect),
    )

    if declarations.attack is None:
        return resolution

    if declarations.guard is not None and declarations.guard.target == declarations.attack.target:
        declarations.guard.succeeded = True
        return resolution

    engine._eliminate(
        declarations.attack.target,
        EventType.NIGHT_ATTACK,
        Phase.NIGHT.value,
    )
    return resolution


def _publish_inspection(engine: GameEngine, inspection: InspectionResult) -> None:
    seer = inspection.declaration.actor
    name = inspection.declaration.target
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
    role_name = result.name if result is not None else "Villager"
    engine._emit(LogEvent.make(
        day=engine.day,
        phase=Phase.NIGHT.value,
        event_type=EventType.INSPECTION,
        agent=seer.name,
        target=name,
        content=f"{seer.name} inspects {name}: {'Werewolf' if isinstance(result, Werewolf) else 'Not Werewolf'}",
        inspection_role=role_name,
        is_public=False,
        reasoning=inspection.declaration.reasoning,
    ))


def _publish_night_results(engine: GameEngine, resolution: NightResolution) -> None:
    if resolution.guard is not None:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD,
            agent=resolution.guard.actor.name,
            target=resolution.guard.target,
            content=f"{resolution.guard.actor.name} guards {resolution.guard.target}",
            is_public=False,
            reasoning=resolution.guard.reasoning,
        ))

    if resolution.attack is not None:
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.NIGHT_ATTACK,
            agent=resolution.attack.actor.name,
            target=resolution.attack.target,
            content=f"Werewolves attack {resolution.attack.target}",
            is_public=False,
            reasoning=resolution.attack.reasoning,
        ))

    if (
        resolution.guard is not None
        and resolution.guard.succeeded
        and resolution.attack is not None
    ):
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD_BLOCK,
            target=resolution.attack.target,
            content=f"{resolution.attack.target} was protected by the Knight! The attack was blocked.",
            is_public=False,
        ))
        engine._emit(LogEvent.make(
            day=engine.day,
            phase=Phase.NIGHT.value,
            event_type=EventType.GUARD_BLOCK,
            content="The village woke up to find everyone safe. The werewolves' attack seems to have failed.",
            is_public=True,
        ))
        memory_mod.update_memory(
            resolution.guard.actor,
            [f"Day {engine.day}: successfully guarded {resolution.guard.target} from werewolf attack"],
        )

    if resolution.inspection and resolution.inspection.declaration.actor.is_alive:
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

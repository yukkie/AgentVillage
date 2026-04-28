"""Contract tests for the Engine -> Renderer/Replay LogEvent boundary.

This test suite is the concrete demonstration of the Mock-Policy in
``tests/TestStrategy.md`` §5: ``LogEvent`` is Forbidden to mock, so we drive
a real ``GameEngine`` through a real night phase and feed the produced
``LogEvent`` instances into a real ``Renderer`` to verify both sides of the
contract agree.

The recent inspection-log regression (Issue #180 background) slipped through
because consumer-side renderer tests synthesized ``LogEvent`` payloads
directly. These contract tests are designed to fail loudly if either side
silently drops a contract field (e.g. ``target`` on INSPECTION).

NOTE: Until Issue #179 lands, ``LogEvent.content`` is a free-form string and
is intentionally NOT asserted here field-by-field — we assert the structured
fields (``target``, ``agent``, ``event_type``) which are the actual contract
that consumers depend on. Once #179 introduces structured payloads, the
content assertions can be tightened.
"""
from unittest.mock import patch

import pytest

from src.domain.event import EventType, LogEvent
from src.ui.renderer import Renderer


# ── helpers ──────────────────────────────────────────────────────────────────


def _run_night(engine, attack_target: str, inspect_target: str) -> None:
    """Drive a real night phase: wolves attack ``attack_target``, seer
    inspects ``inspect_target``. Other roles auto-resolve to no action."""
    from src.domain.schema import NightActionOutput

    def night_action(actor, _context, _alive_names):
        if actor.role.name == "Werewolf":
            return NightActionOutput(target=attack_target, reasoning="")
        if actor.role.name == "Seer":
            return NightActionOutput(target=inspect_target, reasoning="")
        # Other roles (e.g. Knight) are not exercised in these tests; if a
        # caller sets up such an actor they need to extend this helper.
        raise AssertionError(f"unexpected actor role in test: {actor.role.name}")

    engine._llm_client.call_night_action.side_effect = night_action

    with patch("src.agent.store.save"):
        engine._run_night()


def _events_of(events: list[LogEvent], event_type: EventType) -> list[LogEvent]:
    return [e for e in events if e.event_type == event_type]


def _spectator_event(events: list[LogEvent], event_type: EventType) -> LogEvent:
    """Pick the spectator-only (is_public=False) event of the given type.

    The engine intentionally emits two events for the same EventType in some
    cases (e.g. NIGHT_ATTACK has a public death notice + a spectator-only
    "Wolf attacks Villager" line). The structured ``agent``/``target``
    contract only applies to the spectator variant; the public variant is
    intentionally narrative-only and rendered via the ``content`` fallback.
    """
    matches = [e for e in events if e.event_type == event_type and not e.is_public]
    assert len(matches) == 1, (
        f"expected exactly one spectator-only {event_type.name} event, "
        f"found {len(matches)}"
    )
    return matches[0]


def _public_event(events: list[LogEvent], event_type: EventType) -> LogEvent:
    """Pick the public (is_public=True) event of the given type."""
    matches = [e for e in events if e.event_type == event_type and e.is_public]
    assert len(matches) == 1, (
        f"expected exactly one public {event_type.name} event, "
        f"found {len(matches)}"
    )
    return matches[0]


# ── INSPECTION contract ──────────────────────────────────────────────────────


@pytest.mark.unit
class TestInspectionContract:
    """SUT: Engine -> Renderer contract for INSPECTION events.
    Mock: LLMClient (Required), store.save (I/O).
    Level: unit
    Objective: ensure ``target`` flows from real engine to real renderer
    output. This is the boundary where the Issue #180 regression happened.
    """

    def test_engine_emits_inspection_with_target_field(
        self, make_test_actor, make_test_engine
    ):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        inspections = _events_of(events, EventType.INSPECTION)
        assert len(inspections) == 1, "engine must emit exactly one INSPECTION"
        ev = inspections[0]
        # Structured contract — these are the fields consumers depend on.
        assert ev.agent == "Seer1"
        assert ev.target == "Wolf1", (
            "INSPECTION contract requires `target` to identify who was "
            "inspected; renderer/replay rely on this field."
        )
        assert ev.is_public is False  # spectator-only

    def test_renderer_consumes_inspection_target_in_spectator_mode(
        self, make_test_actor, make_test_engine
    ):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        inspection = _events_of(events, EventType.INSPECTION)[0]
        renderer = Renderer([seer, wolf, villager], spectator_mode=True)
        rendered = renderer.on_event(inspection)

        assert rendered is not None
        # Until #179 structures the payload, the renderer surfaces target
        # via the content string. Once content is structured we tighten this
        # to assert the renderer pulls `target` directly.
        assert "Wolf1" in rendered.plain, (
            "renderer must surface INSPECTION target somewhere in output"
        )


# ── NIGHT_ATTACK contract ────────────────────────────────────────────────────


@pytest.mark.unit
class TestNightAttackContract:
    """SUT: Engine -> Renderer contract for NIGHT_ATTACK events.
    Mock: LLMClient (Required), store.save (I/O).
    Level: unit
    Objective: ensure attacker (``agent``) and victim (``target``) reach
    the renderer. The renderer falls back to ``content`` when either is
    missing — that fallback masks contract drift, so this test pins both
    fields.
    """

    def test_engine_emits_spectator_night_attack_with_agent_and_target(
        self, make_test_actor, make_test_engine
    ):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        ev = _spectator_event(events, EventType.NIGHT_ATTACK)
        assert ev.agent == "Wolf1"
        assert ev.target == "Villager1"

    def test_renderer_uses_structured_attack_fields_not_content_fallback(
        self, make_test_actor, make_test_engine
    ):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        attack = _spectator_event(events, EventType.NIGHT_ATTACK)
        renderer = Renderer([seer, wolf, villager], spectator_mode=True)
        rendered = renderer.on_event(attack)

        assert rendered is not None
        # Renderer picks the structured branch when both agent and target are
        # populated — explicit format "Wolf1 attacks Villager1".
        assert "Wolf1 attacks Villager1" in rendered.plain

    def test_engine_emits_public_night_attack_as_victim_narrative(
        self, make_test_actor, make_test_engine
    ):
        """Public NIGHT_ATTACK has its own contract distinct from the
        spectator one: it announces the death to villagers without exposing
        the attacker. ``target`` must be ``None`` so the renderer takes the
        narrative ``content`` branch (see the next test); ``agent`` carries
        the victim's name (NOT the attacker's), which is a known semantic
        inversion vs the spectator event and is pinned here to prevent
        accidental "fixes" that would silently break either variant.
        """
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        ev = _public_event(events, EventType.NIGHT_ATTACK)
        assert ev.target is None, (
            "public NIGHT_ATTACK must leave target=None so renderer takes "
            "the narrative content branch instead of the structured one"
        )
        assert ev.agent == "Villager1", (
            "public NIGHT_ATTACK uses agent=victim (death notice), not "
            "agent=attacker; this differs from the spectator variant"
        )
        assert "Villager1" in ev.content

    def test_renderer_falls_back_to_content_for_public_night_attack(
        self, make_test_actor, make_test_engine
    ):
        """Renderer must NOT leak the attacker name in public mode. The
        ``content`` fallback path is what makes that safe — the structured
        "{agent} attacks {target}" branch would expose Wolf1, so we pin
        that the public event renders via the narrative path."""
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        _run_night(engine, attack_target="Villager1", inspect_target="Wolf1")

        attack = _public_event(events, EventType.NIGHT_ATTACK)
        renderer = Renderer([seer, wolf, villager], spectator_mode=False)
        rendered = renderer.on_event(attack)

        assert rendered is not None
        plain = rendered.plain
        assert "Villager1" in plain  # victim shown
        assert "Wolf1" not in plain  # attacker NOT shown in public mode
        assert "attacks" not in plain  # not the structured spectator phrasing


# ── INSPECTION suppression contract (negative) ───────────────────────────────


@pytest.mark.unit
class TestInspectionSuppressionContract:
    """SUT: Engine contract — INSPECTION must NOT be emitted when the seer
    dies before inspection resolution.
    Mock: LLMClient (Required), store.save (I/O).
    Level: unit
    Objective: pin the negative side of the contract. Spectators must not
    see an inspection result the seer never lived to act on; renderer/replay
    have no defense against an erroneously-emitted event.
    """

    def test_no_inspection_event_when_seer_killed(
        self, make_test_actor, make_test_engine
    ):
        seer = make_test_actor("Seer1", "Seer")
        wolf = make_test_actor("Wolf1", "Werewolf")
        villager = make_test_actor("Villager1")
        engine, events = make_test_engine([seer, wolf, villager])

        # Wolves kill the seer; what the seer "would have" inspected is
        # irrelevant — no INSPECTION event must reach the log.
        _run_night(engine, attack_target="Seer1", inspect_target="Villager1")

        assert _events_of(events, EventType.INSPECTION) == []
        assert seer.is_alive is False

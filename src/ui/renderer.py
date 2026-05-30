"""Event-to-display conversion layer.

Future GUI/web migration plan:
    EventPresenter (produces a neutral ``DisplayEvent`` — pure data: text,
    semantic style tokens, visibility) → {ConsoleRenderer, WebRenderer, ...}
    (each binds the neutral event to its own output medium).

Today, ``Renderer`` collapses both steps: it filters by spectator visibility
and emits Rich ``Text`` directly. Splitting it is deferred until a second
frontend (web) is actually needed.
"""

from rich.text import Text

from src.domain.event import LogEvent, EventType
from src.domain.actor import Actor
from src.domain.roles import Role


class Renderer:
    """Convert ``LogEvent`` instances into Rich ``Text`` for console output."""

    # Simple events where the output is ``[PREFIX] {display_content}`` in a fixed style.
    # Events needing dynamic style or extra fields (SPEECH, VOTE, JUDGMENT, PHASE_START,
    # PRE_NIGHT_DECISION, INSPECTION, GUARD, GAME_OVER) are handled separately in ``on_event``.
    _SIMPLE_EVENT_STYLES: dict[EventType, tuple[str, str]] = {
        EventType.NIGHT_ATTACK: ("[NIGHT] ", "red"),
        EventType.GUARD_BLOCK: ("[GUARD BLOCK] ", "bold bright_green"),
        EventType.CO_ANNOUNCEMENT: ("[CO] ", "bold white"),
        EventType.MEDIUM_RESULT: ("[MEDIUM] ", "cyan"),
    }

    def __init__(self, agents: list[Actor], spectator_mode: bool = False):
        self.agents = agents
        self.spectator_mode = spectator_mode

    def on_event(self, event: LogEvent) -> Text | None:
        """Convert a LogEvent to a Rich Text object for display.

        Returns None if the event should not be displayed in the current mode.
        """
        if not event.is_public and not self.spectator_mode:
            return None

        text = Text()
        content = self._display_content(event)

        if event.event_type == EventType.PHASE_START:
            text.append(f"\n{content}\n", style="bold yellow")

        elif event.event_type == EventType.SPEECH:
            self._render_speech(event, text)

        elif event.event_type == EventType.REASONING:
            text.append(f"[REASON] {event.agent}: ", style="bold magenta")
            text.append(content, style="magenta")

        elif event.event_type == EventType.VOTE:
            text.append(f"[VOTE] {event.agent} → {event.target}", style="white")
            if self.spectator_mode and event.decision:
                text.append(f" [strategy: {event.decision}]", style="dim red")
            if self.spectator_mode and event.reasoning:
                text.append(f" — {event.reasoning}", style="dim")

        elif event.event_type == EventType.JUDGMENT:
            text.append(f"[JUDGMENT] {event.agent}: {event.decision}", style="cyan")
            if event.reasoning:
                text.append(f"\n{event.reasoning}", style="dim")

        elif event.event_type == EventType.ELIMINATION:
            text.append(f"\n{content}\n", style="bold red")

        elif event.event_type == EventType.WOLF_CHAT:
            if event.content.startswith("[THINK]"):
                text.append(f"[WOLF] {content}", style="dim red")
            else:
                text.append(f"[WOLF] {content}", style="red")
                if self.spectator_mode and event.reasoning:
                    text.append("\n  [THINK] ", style="dim red")
                    text.append(event.reasoning, style="dim red")

        elif event.event_type == EventType.NIGHT_ATTACK:
            # Spectator only — render attacker/target explicitly when available.
            if event.agent and event.target:
                text.append(
                    f"[NIGHT] {event.agent} attacks {event.target}",
                    style="red",
                )
            else:
                text.append(f"[NIGHT] {content}", style="red")
            if self.spectator_mode and event.reasoning:
                text.append(f" — {event.reasoning}", style="dim")

        elif event.event_type == EventType.GUARD:
            text.append(f"[GUARD] {content}", style="bright_green")
            if self.spectator_mode and event.reasoning:
                text.append(f" — {event.reasoning}", style="dim")

        elif event.event_type == EventType.INSPECTION:
            self._render_inspection(event, text)

        elif event.event_type == EventType.SUSPICION_UPDATE:
            text.append(f"[SUSPICION] {content}", style="dim cyan")

        elif event.event_type == EventType.THREAT_UPDATE:
            text.append(f"[THREAT] {content}", style="dim red")

        # Search marker: Legacy-Adapter
        # Legacy-Adapter: render archived PRE_NIGHT replay events only.
        elif event.event_type == EventType.PRE_NIGHT_DECISION:
            actor = self._get_agent(event.agent)
            style = actor.role.color if actor else "cyan"
            text.append(f"[PRE-NIGHT] {content}", style=style)

        elif event.event_type == EventType.GAME_OVER:
            text.append(f"\n{'=' * 50}\n", style="bold yellow")
            text.append(content, style="bold green")
            text.append(f"\n{'=' * 50}\n", style="bold yellow")

        elif event.event_type in self._SIMPLE_EVENT_STYLES:
            prefix, style = self._SIMPLE_EVENT_STYLES[event.event_type]
            text.append(f"{prefix}{content}", style=style)

        else:
            text.append(content)

        return text if len(text) > 0 else None

    def _render_inspection(self, event: LogEvent, text: Text) -> None:
        if event.inspection_role is not None:
            result_str = "Werewolf" if event.inspection_role.name == "Werewolf" else "Not Werewolf"
            display = f"{event.agent} inspects {event.target}: {result_str}"
        else:
            display = self._display_content(event)
        text.append(f"[INSPECT] {display}", style="cyan")
        if self.spectator_mode and event.reasoning:
            text.append(f" — {event.reasoning}", style="dim")

    def _render_speech(self, event: LogEvent, text: Text) -> None:
        legacy_think = self._legacy_think_content(event)
        if legacy_think is not None:
            # Thought log — spectator only (already filtered in on_event).
            text.append(f"  [THINK] {event.agent}: ", style="dim white")
            text.append(legacy_think, style="dim white")
            return

        style = self._speech_style(event.agent, event.claimed_role)
        prefix = f"[{event.speech_id}] " if event.speech_id is not None else ""
        reply = f" (→[{event.reply_to}])" if event.reply_to is not None else ""
        if event.claimed_role is not None:
            text.append(
                f"[CO] {event.agent} claims to be {event.claimed_role.name}\n",
                style="bold white",
            )
        text.append(f"{prefix}{event.agent}{reply}: ", style=f"bold {style}")
        text.append(self._display_content(event), style=style)
        if self.spectator_mode and event.reasoning:
            text.append(f"\n  [THINK] {event.agent}: ", style="dim white")
            text.append(event.reasoning, style="dim white")

    def _display_content(self, event: LogEvent) -> str:
        if self.spectator_mode and event.spectator_content:
            return event.spectator_content
        return event.content

    @staticmethod
    def _legacy_think_content(event: LogEvent) -> str | None:
        if event.content.startswith("[THINK]"):
            return event.content[len("[THINK]"):].lstrip()
        return None

    def _get_agent(self, agent_name: str | None) -> Actor | None:
        if agent_name is None:
            return None
        return next((a for a in self.agents if a.name == agent_name), None)

    def _speech_style(
        self,
        agent_name: str | None,
        claimed_role_override: Role | None = None,
    ) -> str:
        """Return Rich color style for a speech event.

        Spectator mode: color by true role.
        Public mode: color by claimed role (CO'd role only), default white.
        """
        actor = self._get_agent(agent_name)
        if actor is None:
            return "white"
        if self.spectator_mode:
            return actor.role.color
        if claimed_role_override:
            return claimed_role_override.color
        if actor.state.claimed_role:
            return actor.state.claimed_role.color
        return "white"

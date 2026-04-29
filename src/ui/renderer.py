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


class Renderer:
    """Convert ``LogEvent`` instances into Rich ``Text`` for console output."""

    # Simple events where the output is ``[PREFIX] {content}`` in a fixed style.
    # Events needing dynamic style or extra fields (SPEECH, VOTE, JUDGMENT, PHASE_START,
    # PRE_NIGHT_DECISION, INSPECTION, GUARD, GAME_OVER) are handled separately in ``on_event``.
    _SIMPLE_EVENT_STYLES: dict[EventType, tuple[str, str]] = {
        EventType.NIGHT_ATTACK: ("[NIGHT] ", "red"),
        EventType.WOLF_CHAT: ("[WOLF] ", "red"),
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

        if event.event_type == EventType.PHASE_START:
            text.append(f"\n{event.content}\n", style="bold yellow")

        elif event.event_type == EventType.SPEECH:
            self._render_speech(event, text)

        elif event.event_type == EventType.REASONING:
            text.append(f"[REASON] {event.agent}: ", style="bold magenta")
            text.append(event.content, style="magenta")

        elif event.event_type == EventType.VOTE:
            text.append(f"[VOTE] {event.agent} → {event.target}", style="white")
            if self.spectator_mode and event.reasoning:
                text.append(f" — {event.reasoning}", style="dim")

        elif event.event_type == EventType.JUDGMENT:
            text.append(f"[JUDGMENT] {event.agent}: {event.decision}", style="cyan")
            if event.reasoning:
                text.append(f"\n{event.reasoning}", style="dim")

        elif event.event_type == EventType.ELIMINATION:
            text.append(f"\n{event.content}\n", style="bold red")

        elif event.event_type == EventType.NIGHT_ATTACK:
            # Spectator only — render attacker/target explicitly when available.
            if event.agent and event.target:
                text.append(
                    f"[NIGHT] {event.agent} attacks {event.target}",
                    style="red",
                )
            else:
                text.append(f"[NIGHT] {event.content}", style="red")

        elif event.event_type == EventType.GUARD:
            text.append(f"[GUARD] {event.content}", style="bright_green")
            if self.spectator_mode and event.reasoning:
                text.append(f" — {event.reasoning}", style="dim")

        elif event.event_type == EventType.INSPECTION:
            self._render_inspection(event, text)

        elif event.event_type == EventType.PRE_NIGHT_DECISION:
            # Spectator only — color by the speaker's true role.
            actor = self._get_agent(event.agent)
            style = actor.role.color if actor else "cyan"
            text.append(f"[PRE-NIGHT] {event.content}", style=style)

        elif event.event_type == EventType.GAME_OVER:
            text.append(f"\n{'=' * 50}\n", style="bold yellow")
            text.append(event.content, style="bold green")
            text.append(f"\n{'=' * 50}\n", style="bold yellow")

        elif event.event_type in self._SIMPLE_EVENT_STYLES:
            prefix, style = self._SIMPLE_EVENT_STYLES[event.event_type]
            text.append(f"{prefix}{event.content}", style=style)

        else:
            text.append(event.content)

        return text if len(text) > 0 else None

    def _render_inspection(self, event: LogEvent, text: Text) -> None:
        if event.inspection_role is not None:
            result_str = "Werewolf" if event.inspection_role.name == "Werewolf" else "Not Werewolf"
            display = f"{event.agent} inspects {event.target}: {result_str}"
        else:
            display = event.content
        text.append(f"[INSPECT] {display}", style="cyan")
        if self.spectator_mode and event.reasoning:
            text.append(f" — {event.reasoning}", style="dim")

    def _render_speech(self, event: LogEvent, text: Text) -> None:
        if event.content.startswith("[THINK]"):
            # Thought log — spectator only (already filtered in on_event).
            thought_content = event.content[len("[THINK] "):]
            text.append(f"  [THINK] {event.agent}: ", style="dim white")
            text.append(thought_content, style="dim white")
            return

        style = self._speech_style(event.agent)
        prefix = f"[{event.speech_id}] " if event.speech_id is not None else ""
        reply = f" (→[{event.reply_to}])" if event.reply_to is not None else ""
        text.append(f"{prefix}{event.agent}{reply}: ", style=f"bold {style}")
        text.append(event.content, style=style)

    def _get_agent(self, agent_name: str | None) -> Actor | None:
        if agent_name is None:
            return None
        return next((a for a in self.agents if a.name == agent_name), None)

    def _speech_style(self, agent_name: str | None) -> str:
        """Return Rich color style for a speech event.

        Spectator mode: color by true role.
        Public mode: color by claimed role (CO'd role only), default white.
        """
        actor = self._get_agent(agent_name)
        if actor is None:
            return "white"
        if self.spectator_mode:
            return actor.role.color
        if actor.state.claimed_role:
            return actor.state.claimed_role.color
        return "white"

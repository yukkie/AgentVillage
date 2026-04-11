from rich.text import Text
from rich.console import Console

from src.logger.event import LogEvent, EventType
from src.agent.state import AgentState

console = Console()


_ROLE_COLORS: dict[str, str] = {
    "Werewolf": "red",
    "Madman": "orange3",
    "Seer": "blue",
    "Medium": "cyan",
    "Knight": "bright_green",
    "Villager": "white",
}


def _get_agent(agent_name: str | None, agents: list[AgentState]) -> AgentState | None:
    if agent_name is None:
        return None
    return next((a for a in agents if a.name == agent_name), None)


def _speech_style(agent_name: str | None, agents: list[AgentState], spectator_mode: bool) -> str:
    """Return Rich color style for a speech event.

    Spectator mode: color by true role.
    Public mode: color by claimed role (CO'd role only), default white.
    """
    agent = _get_agent(agent_name, agents)
    if agent is None:
        return "white"
    if spectator_mode:
        return _ROLE_COLORS.get(agent.role, "white")
    # public mode: only color if the agent has CO'd
    if agent.claimed_role:
        return _ROLE_COLORS.get(agent.claimed_role, "white")
    return "white"


def render_event(
    event: LogEvent,
    agents: list[AgentState],
    spectator_mode: bool = False,
) -> Text | None:
    """
    Convert a LogEvent to a Rich Text object for display.
    Returns None if the event should not be displayed in the current mode.
    """
    # Skip non-public events in non-spectator mode
    if not event.is_public and not spectator_mode:
        return None

    text = Text()

    if event.event_type == EventType.PHASE_START:
        text.append(f"\n{event.content}\n", style="bold yellow")

    elif event.event_type == EventType.SPEECH:
        if event.content.startswith("[THINK]"):
            # Thought log — spectator only (already filtered above)
            thought_content = event.content[len("[THINK] "):]
            text.append(f"  [THINK] {event.agent}: ", style="dim white")
            text.append(thought_content, style="dim white")
        else:
            style = _speech_style(event.agent, agents, spectator_mode)
            prefix = f"[{event.speech_id}] " if event.speech_id is not None else ""
            reply = f" (→[{event.reply_to}])" if event.reply_to is not None else ""
            text.append(f"{prefix}{event.agent}{reply}: ", style=f"bold {style}")
            text.append(event.content, style=style)

    elif event.event_type == EventType.REASONING:
        text.append(f"[REASON] {event.agent}: ", style="bold magenta")
        text.append(event.content, style="magenta")

    elif event.event_type == EventType.VOTE:
        text.append(f"[VOTE] {event.agent} → {event.target}", style="white")

    elif event.event_type == EventType.ELIMINATION:
        text.append(f"\n{event.content}\n", style="bold red")

    elif event.event_type == EventType.NIGHT_ATTACK:
        # Spectator only — red
        if event.agent and event.target:
            text.append(
                f"[NIGHT] {event.agent} attacks {event.target}",
                style="red",
            )
        else:
            text.append(f"[NIGHT] {event.content}", style="red")

    elif event.event_type == EventType.INSPECTION:
        # Spectator only — cyan
        text.append(f"[INSPECT] {event.content}", style="cyan")

    elif event.event_type == EventType.PRE_NIGHT_DECISION:
        # Spectator only — role color
        agent_state = _get_agent(event.agent, agents)
        role = agent_state.role if agent_state else ""
        style = _ROLE_COLORS.get(role, "cyan")
        text.append(f"[PRE-NIGHT] {event.content}", style=style)

    elif event.event_type == EventType.WOLF_CHAT:
        # Spectator only — red
        text.append(f"[WOLF] {event.content}", style="red")

    elif event.event_type == EventType.GUARD:
        # Spectator only — cyan
        text.append(f"[GUARD] {event.content}", style="cyan")

    elif event.event_type == EventType.GUARD_BLOCK:
        # Spectator only — bold bright_green (Knight role color)
        text.append(f"[GUARD BLOCK] {event.content}", style="bold bright_green")

    elif event.event_type == EventType.CO_ANNOUNCEMENT:
        # Public CO declaration — bold white so it stands out
        text.append(f"[CO] {event.content}", style="bold white")

    elif event.event_type == EventType.MEDIUM_RESULT:
        # Spectator only — yellow
        text.append(f"[MEDIUM] {event.content}", style="yellow")

    elif event.event_type == EventType.GAME_OVER:
        text.append(f"\n{'=' * 50}\n", style="bold yellow")
        text.append(event.content, style="bold green")
        text.append(f"\n{'=' * 50}\n", style="bold yellow")

    else:
        text.append(event.content)

    return text if len(text) > 0 else None

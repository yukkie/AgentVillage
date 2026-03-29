from rich.text import Text
from rich.console import Console

from src.logger.event import LogEvent, EventType
from src.agent.state import AgentState

console = Console()


def _get_claimed_role(agent_name: str | None, agents: list[AgentState]) -> str | None:
    """Return the role the agent has publicly claimed (CO), or None if no CO."""
    if agent_name is None:
        return None
    for a in agents:
        if a.name == agent_name:
            return a.claimed_role
    return None


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

    claimed_role = _get_claimed_role(event.agent, agents)
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
            # Regular speech — blue only after Seer CO
            if claimed_role == "Seer":
                style = "blue"
            else:
                style = "white"
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
        # Spectator only — cyan for Seer, red for Werewolf
        agent_state = next((a for a in agents if a.name == event.agent), None)
        role = agent_state.role if agent_state else ""
        style = "red" if role == "Werewolf" else "cyan"
        text.append(f"[PRE-NIGHT] {event.content}", style=style)

    elif event.event_type == EventType.GAME_OVER:
        text.append(f"\n{'=' * 50}\n", style="bold yellow")
        text.append(event.content, style="bold green")
        text.append(f"\n{'=' * 50}\n", style="bold yellow")

    else:
        text.append(event.content)

    return text if len(text) > 0 else None

from rich.console import Console
from rich.panel import Panel

from src.domain.event import LogEvent
from src.domain.agent import AgentState
from src.ui.renderer import render_event, _ROLE_COLORS

console = Console()


class CLI:
    def __init__(self, agents: list[AgentState], spectator_mode: bool = False):
        self.agents = agents
        self.spectator_mode = spectator_mode

    def on_event(self, event: LogEvent) -> None:
        """Callback for the game engine to call when an event occurs."""
        text = render_event(event, self.agents, self.spectator_mode)
        if text is not None:
            console.print(text)

    def show_winner(self, winner: str) -> None:
        """Display the winner and full role reveal."""
        console.print()
        console.print("[bold yellow]=== ROLE REVEAL ===[/bold yellow]")
        for agent in self.agents:
            role_style = _ROLE_COLORS.get(agent.role, "white")
            status = "" if agent.is_alive else " [dim](eliminated)[/dim]"
            console.print(f"  [{role_style}]{agent.name}[/{role_style}] — {agent.role}{status}")
        console.print()
        result_style = "bold red" if winner == "Werewolves" else "bold green"
        console.print(
            Panel(
                f"[{result_style}]{winner} WIN THE GAME![/{result_style}]",
                title="GAME OVER",
                border_style="bold yellow",
                padding=(1, 4),
            )
        )

    def show_intro(self) -> None:
        """Display game introduction."""
        mode_label = "[dim]Spectator Mode (thoughts & night actions visible)[/dim]" if self.spectator_mode else "[dim]Public Mode[/dim]"
        console.print(
            Panel(
                f"[bold]AgentVillage — Werewolf Game[/bold]\n{mode_label}",
                border_style="yellow",
                padding=(1, 2),
            )
        )

    def show_agent_roles(self) -> None:
        """Display agent roles (spectator only)."""
        if not self.spectator_mode:
            return
        console.print("\n[bold cyan]Agent Roster:[/bold cyan]")
        for agent in self.agents:
            role_style = _ROLE_COLORS.get(agent.role, "white")
            console.print(f"  [{role_style}]{agent.name}[/{role_style}] — {agent.role} ({agent.persona.style})")
        console.print()

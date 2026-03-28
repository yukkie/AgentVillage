from typing import Callable

from src.agent.state import AgentState, Belief
from src.agent import store, memory as memory_mod
from src.engine.phase import Phase
from src.engine.vote import tally_votes
from src.engine.victory import check_victory
from src.engine.role import has_night_action
from src.llm import client as llm_client
from src.llm.schema import AgentOutput
from src.action.types import Vote, Inspect, Attack
from src.action.validator import validate
from src.action.resolver import resolve_inspect, resolve_attack
from src.logger.event import LogEvent, EventType
from src.logger.writer import LogWriter


class GameEngine:
    def __init__(
        self,
        agents: list[AgentState],
        log_writer: LogWriter,
        event_callback: Callable[[LogEvent], None] | None = None,
    ):
        self.agents = agents
        self.log_writer = log_writer
        self.event_callback = event_callback or (lambda e: None)
        self.day = 1
        self.phase = Phase.DAY_SPEAK
        self.today_log: list[str] = []
        # Cache for LLM outputs from day_speak phase
        self._day_outputs: dict[str, AgentOutput] = {}

    def _emit(self, event: LogEvent) -> None:
        self.log_writer.write(event)
        self.event_callback(event)

    def _alive_agents(self) -> list[AgentState]:
        return [a for a in self.agents if a.is_alive]

    def _alive_names(self) -> list[str]:
        return [a.name for a in self._alive_agents()]

    def _dead_names(self) -> list[str]:
        return [a.name for a in self.agents if not a.is_alive]

    def _get_agent(self, name: str) -> AgentState | None:
        for a in self.agents:
            if a.name == name:
                return a
        return None

    def _eliminate(self, name: str, event_type: EventType, phase_str: str) -> None:
        agent = self._get_agent(name)
        if agent:
            agent.is_alive = False
            store.save(agent)
            event = LogEvent.make(
                day=self.day,
                phase=phase_str,
                event_type=event_type,
                agent=name,
                content=f"{name} has been eliminated.",
                is_public=True,
            )
            self._emit(event)

    def _phase_start(self, phase: Phase) -> None:
        event = LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.PHASE_START,
            content=f"=== Day {self.day} — {phase.value.upper()} ===",
            is_public=True,
        )
        self._emit(event)

    def run(self) -> str:
        """Run the full game and return the winning faction."""
        self._emit(LogEvent.make(
            day=self.day,
            phase="init",
            event_type=EventType.PHASE_START,
            content="=== GAME START ===",
            is_public=True,
        ))

        while True:
            winner = self._run_day()
            if winner:
                self._game_over(winner)
                return winner

            winner = self._run_night()
            if winner:
                self._game_over(winner)
                return winner

            self.day += 1
            self.today_log = []
            self._day_outputs = {}

    def _run_day(self) -> str | None:
        # DAY_SPEAK
        self.phase = Phase.DAY_SPEAK
        self._phase_start(Phase.DAY_SPEAK)
        self._day_outputs = {}

        for agent in self._alive_agents():
            output = llm_client.call(
                agent,
                list(self.today_log),
                self._alive_names(),
                self._dead_names(),
                self.day,
            )
            self._day_outputs[agent.name] = output
            log_entry = f"{agent.name}: {output.speech}"
            self.today_log.append(log_entry)

            # Emit speech event
            self._emit(LogEvent.make(
                day=self.day,
                phase=Phase.DAY_SPEAK.value,
                event_type=EventType.SPEECH,
                agent=agent.name,
                content=output.speech,
                is_public=True,
            ))

            # Emit thought event (spectator only)
            self._emit(LogEvent.make(
                day=self.day,
                phase=Phase.DAY_SPEAK.value,
                event_type=EventType.SPEECH,
                agent=agent.name,
                content=f"[THINK] {output.thought}",
                is_public=False,
            ))

            # Update memory
            if output.memory_update:
                memory_mod.update_memory(agent, output.memory_update)

        # DAY_REASON
        self.phase = Phase.DAY_REASON
        self._phase_start(Phase.DAY_REASON)

        for agent in self._alive_agents():
            output = self._day_outputs.get(agent.name)
            if output:
                self._emit(LogEvent.make(
                    day=self.day,
                    phase=Phase.DAY_REASON.value,
                    event_type=EventType.REASONING,
                    agent=agent.name,
                    content=output.reasoning,
                    is_public=True,
                ))

        # DAY_VOTE
        self.phase = Phase.DAY_VOTE
        self._phase_start(Phase.DAY_VOTE)

        votes: dict[str, str] = {}
        alive_names = self._alive_names()

        for agent in self._alive_agents():
            output = self._day_outputs.get(agent.name)
            target = None

            if output and output.intent.vote_candidates:
                # Pick highest-scoring candidate who is alive
                sorted_candidates = sorted(
                    output.intent.vote_candidates,
                    key=lambda vc: vc.score,
                    reverse=True,
                )
                for vc in sorted_candidates:
                    if vc.target in alive_names and vc.target != agent.name:
                        target = vc.target
                        break

            if target is None:
                # Fallback: vote for first alive player that isn't self
                others = [n for n in alive_names if n != agent.name]
                target = others[0] if others else None

            if target:
                vote_action = Vote(target=target)
                if validate(vote_action, agent, alive_names):
                    votes[agent.name] = target
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.DAY_VOTE.value,
                        event_type=EventType.VOTE,
                        agent=agent.name,
                        target=target,
                        content=f"{agent.name} votes for {target}",
                        is_public=True,
                    ))

        # Tally and eliminate
        if votes:
            eliminated = tally_votes(votes)
            self._eliminate(eliminated, EventType.ELIMINATION, Phase.DAY_VOTE.value)

        winner = check_victory(self.agents)
        return winner

    def _run_night(self) -> str | None:
        self.phase = Phase.NIGHT
        self._phase_start(Phase.NIGHT)
        self.today_log = []

        # Collect night action context
        night_context = f"Day {self.day} night. Alive: {', '.join(self._alive_names())}"

        attack_target: str | None = None
        inspect_results: list[tuple[str, str, str]] = []  # (seer_name, target, role)

        for agent in self._alive_agents():
            if not has_night_action(agent.role):
                continue

            target_name = llm_client.call_night_action(
                agent,
                night_context,
                self._alive_names(),
            )

            if agent.role == "Werewolf":
                attack = Attack(target=target_name)
                if validate(attack, agent, self._alive_names()):
                    attack_target = resolve_attack(attack, self.agents)
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.NIGHT.value,
                        event_type=EventType.NIGHT_ATTACK,
                        agent=agent.name,
                        target=attack_target,
                        content=f"{agent.name} attacks {attack_target}",
                        is_public=False,  # spectator only
                    ))

            elif agent.role == "Seer":
                inspect = Inspect(target=target_name)
                if validate(inspect, agent, self._alive_names()):
                    name, role = resolve_inspect(inspect, self.agents)
                    inspect_results.append((agent.name, name, role))

                    # Update seer's beliefs with inspection result
                    if name not in agent.beliefs:
                        agent.beliefs[name] = Belief()
                    if role == "Werewolf":
                        agent.beliefs[name].suspicion = 1.0
                        agent.beliefs[name].trust = 0.0
                        agent.beliefs[name].reason.append(f"Day {self.day}: inspected as Werewolf")
                    else:
                        agent.beliefs[name].suspicion = 0.0
                        agent.beliefs[name].trust = 1.0
                        agent.beliefs[name].reason.append(f"Day {self.day}: inspected as {role}")
                    store.save(agent)

                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.NIGHT.value,
                        event_type=EventType.INSPECTION,
                        agent=agent.name,
                        target=name,
                        content=f"{agent.name} inspects {name}: {role}",
                        is_public=False,  # spectator only
                    ))

        # Apply attack
        if attack_target:
            self._eliminate(attack_target, EventType.NIGHT_ATTACK, Phase.NIGHT.value)

        winner = check_victory(self.agents)
        return winner

    def _game_over(self, winner: str) -> None:
        self._emit(LogEvent.make(
            day=self.day,
            phase=Phase.GAME_OVER.value,
            event_type=EventType.GAME_OVER,
            content=f"GAME OVER — {winner} win!",
            is_public=True,
        ))

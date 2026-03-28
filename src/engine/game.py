import random
from typing import Callable

from src.agent.state import AgentState, Belief
from src.agent import store, memory as memory_mod
from src.engine.phase import Phase
from src.engine.vote import tally_votes
from src.engine.victory import check_victory
from src.engine.role import has_night_action
from src.llm import client as llm_client
from src.llm.schema import AgentOutput, SpeechEntry
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
        lang: str = "English",
    ):
        self.agents = agents
        self.log_writer = log_writer
        self.event_callback = event_callback or (lambda e: None)
        self.lang = lang
        self.day = 1
        self.phase = Phase.DAY_OPENING
        self.today_log: list[SpeechEntry] = []
        self._speech_id_counter: int = 0
        self._day_turn: int = 0
        self._day_outputs: dict[str, AgentOutput] = {}
        # Public history passed to agent prompts
        self._past_votes: list[dict] = []   # [{"day": n, "votes": {"voter": "target"}}]
        self._past_deaths: list[dict] = []  # [{"day": n, "name": str, "cause": "execution"|"attack"}]

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
            if event_type == EventType.NIGHT_ATTACK:
                content = f"Werewolves attacked {name}! {name} was found dead at dawn."
                cause = "attack"
            else:
                content = f"{name} was executed by the village vote."
                cause = "execution"
            self._past_deaths.append({"day": self.day, "name": name, "cause": cause})
            event = LogEvent.make(
                day=self.day,
                phase=phase_str,
                event_type=event_type,
                agent=name,
                content=content,
                is_public=True,
            )
            self._emit(event)

    def _phase_start(self, phase: Phase) -> None:
        if phase in (Phase.DAY_OPENING, Phase.DAY_DISCUSSION):
            self._day_turn += 1
            label = f"DAY {self.day}  TURN {self._day_turn}"
        elif phase == Phase.DAY_VOTE:
            label = f"DAY {self.day}  VOTE"
        elif phase == Phase.NIGHT:
            label = f"NIGHT {self.day}"
        else:
            label = phase.value.upper()
        event = LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.PHASE_START,
            content=f"=== {label} ===",
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
            self._speech_id_counter = 0
            self._day_turn = 0
            self._day_outputs = {}

    def _next_speech_id(self) -> int:
        self._speech_id_counter += 1
        return self._speech_id_counter

    def _do_speak(
        self,
        agent: AgentState,
        phase: Phase,
        reply_to_entry: SpeechEntry | None = None,
    ) -> SpeechEntry:
        """Generate a speech for agent, emit events, update memory, and append to today_log."""
        output = llm_client.call(
            agent,
            list(self.today_log),
            self._alive_names(),
            self._dead_names(),
            self.day,
            self.lang,
            reply_to_entry=reply_to_entry,
            all_agents=self.agents,
            past_votes=self._past_votes,
            past_deaths=self._past_deaths,
        )
        self._day_outputs[agent.name] = output

        speech_id = self._next_speech_id()
        entry = SpeechEntry(speech_id=speech_id, agent=agent.name, text=output.speech)
        self.today_log.append(entry)

        self._emit(LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.SPEECH,
            agent=agent.name,
            content=output.speech,
            is_public=True,
            speech_id=speech_id,
            reply_to=reply_to_entry.speech_id if reply_to_entry else None,
        ))
        self._emit(LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.SPEECH,
            agent=agent.name,
            content=f"[THINK] {output.thought}",
            is_public=False,
            speech_id=speech_id,
        ))

        if output.intent.co:
            agent.claimed_role = output.intent.co
            store.save(agent)

        if output.memory_update:
            memory_mod.update_memory(agent, output.memory_update)

        return entry

    def _run_day(self) -> str | None:
        self._day_outputs = {}

        # --- OPENING: 全員1回発言 ---
        self.phase = Phase.DAY_OPENING
        self._phase_start(Phase.DAY_OPENING)

        opening_order = self._alive_agents()
        random.shuffle(opening_order)
        for agent in opening_order:
            self._do_speak(agent, Phase.DAY_OPENING)

        # --- DISCUSSION × 2: 並列判断 → レスポンス順発言 ---
        self.phase = Phase.DAY_DISCUSSION
        for _round in range(2):
            self._phase_start(Phase.DAY_DISCUSSION)
            alive = self._alive_agents()
            # 判断時点のログのスナップショットを渡す
            judgment_snapshot = list(self.today_log)
            spoke_anyone = False

            for agent, judgment in llm_client.call_judgment_parallel(
                alive, judgment_snapshot, self._alive_names(), self.day, self.lang
            ):
                if judgment.decision == "silent":
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.DAY_DISCUSSION.value,
                        event_type=EventType.SPEECH,
                        agent=agent.name,
                        content=f"{agent.name} is watching the village silently...",
                        is_public=True,
                    ))
                    continue
                spoke_anyone = True

                reply_to_entry: SpeechEntry | None = None
                if judgment.decision == "challenge" and judgment.reply_to is not None:
                    reply_to_entry = next(
                        (e for e in self.today_log if e.speech_id == judgment.reply_to),
                        None,
                    )

                self._do_speak(agent, Phase.DAY_DISCUSSION, reply_to_entry=reply_to_entry)

            if not spoke_anyone:
                break  # 全員silentなら2巡目はスキップ

        # --- VOTE ---
        self.phase = Phase.DAY_VOTE
        self._phase_start(Phase.DAY_VOTE)

        votes: dict[str, str] = {}
        alive_names = self._alive_names()

        for agent in self._alive_agents():
            output = self._day_outputs.get(agent.name)
            target = None

            if output and output.intent.vote_candidates:
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

        if votes:
            self._past_votes.append({"day": self.day, "votes": dict(votes)})
            eliminated = tally_votes(votes)
            self._eliminate(eliminated, EventType.ELIMINATION, Phase.DAY_VOTE.value)

        return check_victory(self.agents)

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
                self.lang,
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

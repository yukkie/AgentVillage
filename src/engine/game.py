from typing import Callable

from src.config import WOLF_CHAT_ROUNDS
from src.domain.actor import Actor
from src.agent import store, memory as memory_mod
from src.engine.phase import Phase
from src.engine.phase_day import run_day_phase
from src.engine.phase_night import run_night_phase
from src.engine.phase_pre_night import run_pre_night_phase
from src.llm import factory as llm_factory
from src.llm.client import LLMClient
from src.llm.prompt import PastDeath, PastVote, PublicContext, SpeechDirection, WolfSpecificContext
from src.domain.schema import AgentOutput, SpeechEntry
from src.action.types import Vote
from src.action.validator import validate
from src.domain.event import LogEvent, EventType
from src.domain.roles import Werewolf
from src.logger.writer import LogWriter


class GameEngine:
    def __init__(
        self,
        agents: list[Actor],
        log_writer: LogWriter,
        event_callback: Callable[[LogEvent], None] | None = None,
        lang: str = "English",
        llm_client: LLMClient | None = None,
    ):
        self.agents = agents
        self.log_writer = log_writer
        self.event_callback = event_callback or (lambda e: None)
        self.lang = lang
        self._llm_client = llm_client or llm_factory.create_client()
        self.day = 1
        self.phase = Phase.DAY_OPENING
        self.today_log: list[SpeechEntry] = []
        self._speech_id_counter: int = 0
        self._day_turn: int = 0
        self._day_outputs: dict[str, AgentOutput] = {}
        # Public history passed to agent prompts
        self._past_votes: list[PastVote] = []
        self._past_deaths: list[PastDeath] = []
        self._wolf_chat_rounds = WOLF_CHAT_ROUNDS

    def _emit(self, event: LogEvent) -> None:
        self.log_writer.write(event)
        self.event_callback(event)

    def _alive_agents(self) -> list[Actor]:
        return [a for a in self.agents if a.is_alive]

    def _alive_names(self) -> list[str]:
        return [a.name for a in self._alive_agents()]

    def _dead_names(self) -> list[str]:
        return [a.name for a in self.agents if not a.is_alive]

    def _get_agent(self, name: str) -> Actor | None:
        for a in self.agents:
            if a.name == name:
                return a
        return None

    def _eliminate(self, name: str, event_type: EventType, phase_str: str) -> None:
        actor = self._get_agent(name)
        if actor:
            actor.state.is_alive = False
            store.save(actor)
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
        elif phase == Phase.PRE_NIGHT:
            label = "PRE-NIGHT (BEFORE DAY 1)"
        else:
            label = phase.value.upper()
        is_public = phase != Phase.PRE_NIGHT
        event = LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.PHASE_START,
            content=f"=== {label} ===",
            is_public=is_public,
        )
        self._emit(event)

    def _make_vote(self, target: str) -> Vote:
        return Vote(target=target)

    def _validate_action(self, action: object, actor: Actor, alive_names: list[str]) -> bool:
        return validate(action, actor, alive_names)

    def run(self) -> str:
        """Run the full game and return the winning faction."""
        self._emit(LogEvent.make(
            day=self.day,
            phase="init",
            event_type=EventType.PHASE_START,
            content="=== GAME START ===",
            is_public=True,
        ))

        self._run_pre_night()

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

    def _apply_speech_output(
        self,
        actor: Actor,
        output: AgentOutput,
        phase: Phase,
        reply_to_entry: SpeechEntry | None = None,
        force_co: bool = False,
    ) -> SpeechEntry:
        """Post-process a speech output: emit events, update memory, append to today_log."""
        self._day_outputs[actor.name] = output

        # If the actor intended to CO but did not declare in speech, log silently and clear the flag.
        if actor.state.intended_co and phase == Phase.DAY_OPENING and not output.intent.co:
            actor.state.intended_co = False
            store.save(actor)
            self._emit(LogEvent.make(
                day=self.day,
                phase=phase.value,
                event_type=EventType.PRE_NIGHT_DECISION,
                agent=actor.name,
                content=f"{actor.name} decided to CO but did not declare in speech",
                is_public=False,
            ))

        # Update claimed_role BEFORE emitting the speech so the CO speech itself
        # is rendered with the correct role color.
        if output.intent.co and actor.state.claimed_role != output.intent.co:
            actor.state.claimed_role = output.intent.co
            actor.state.intended_co = False  # clear once CO is made
            store.save(actor)
            self._emit(LogEvent.make(
                day=self.day,
                phase=phase.value,
                event_type=EventType.CO_ANNOUNCEMENT,
                agent=actor.name,
                content=f"{actor.name} claims to be {actor.state.claimed_role.name}",
                is_public=True,
                claimed_role=actor.state.claimed_role,
            ))

        speech_id = self._next_speech_id()
        entry = SpeechEntry(speech_id=speech_id, agent=actor.name, text=output.speech)
        self.today_log.append(entry)

        self._emit(LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.SPEECH,
            agent=actor.name,
            content=output.speech,
            is_public=True,
            speech_id=speech_id,
            reply_to=reply_to_entry.speech_id if reply_to_entry else None,
        ))
        self._emit(LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.SPEECH,
            agent=actor.name,
            content=f"[THINK] {output.thought}",
            is_public=False,
            speech_id=speech_id,
        ))

        if output.memory_update:
            memory_mod.update_memory(actor, output.memory_update)

        return entry

    def _build_speech_args(
        self,
        actor: Actor,
        reply_to_entry: SpeechEntry | None = None,
        force_co: bool = False,
        today_log_snapshot: list[SpeechEntry] | None = None,
    ) -> tuple:
        ctx = PublicContext(
            today_log=list(today_log_snapshot) if today_log_snapshot is not None else list(self.today_log),
            alive_players=self._alive_names(),
            dead_players=self._dead_names(),
            day=self.day,
            all_agents=self.agents,
            past_votes=self._past_votes,
            past_deaths=self._past_deaths,
        )
        direction = SpeechDirection(
            lang=self.lang,
            reply_to_entry=reply_to_entry,
            intended_co=actor.state.intended_co or force_co,
        )
        # TODO(#36): Add SeerSpecificContext / KnightSpecificContext / MediumSpecificContext
        role_ctx = (
            WolfSpecificContext(
                wolf_partners=[a.name for a in self._alive_agents() if isinstance(a.role, Werewolf) and a.name != actor.name]
            )
            if isinstance(actor.role, Werewolf)
            else None
        )
        return ctx, direction, role_ctx

    def _run_pre_night(self) -> None:
        run_pre_night_phase(self)

    def _run_day(self) -> str | None:
        return run_day_phase(self)

    def _run_night(self) -> str | None:
        return run_night_phase(self)

    def _game_over(self, winner: str) -> None:
        self._emit(LogEvent.make(
            day=self.day,
            phase=Phase.GAME_OVER.value,
            event_type=EventType.GAME_OVER,
            content=f"GAME OVER — {winner} win!",
            is_public=True,
        ))

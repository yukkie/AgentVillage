from typing import Callable

from src.config import WOLF_CHAT_ROUNDS
from src.domain.actor import Actor
from src.agent import store, memory as memory_mod
from src.engine.phase import Phase
from src.engine.phase_day import run_day_phase
from src.engine.phase_night import run_night_phase
from src.llm import factory as llm_factory
from src.llm.client import LLMClient
from src.llm.prompt import PastDeath, PastVote, PublicContext, RoleSpecificContext, WolfSpecificContext
from src.domain.schema import ChallengeResult, CoResult, DiscussionResult, SilentResult, SpeechEntry
from src.action.types import ActionType, Vote
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
        self.phase = Phase.DAY_DISCUSSION
        self.today_log: list[SpeechEntry] = []
        self._speech_id_counter: int = 0
        self._day_turn: int = 0
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
        if phase == Phase.DAY_DISCUSSION:
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

    def _make_vote(self, target: str) -> Vote:
        return Vote(target=target)

    def _validate_action(self, action: ActionType, actor: Actor, alive_names: list[str]) -> bool:
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

    def _next_speech_id(self) -> int:
        self._speech_id_counter += 1
        return self._speech_id_counter

    def _build_discussion_ctx_map(
        self,
        today_log_snapshot: list[SpeechEntry],
    ) -> dict[str, tuple[PublicContext, RoleSpecificContext | None]]:
        """Build ctx_map for call_discussion_parallel from the current game state."""
        ctx = PublicContext(
            today_log=list(today_log_snapshot),
            alive_players=self._alive_names(),
            dead_players=self._dead_names(),
            day=self.day,
            all_agents=self.agents,
            past_votes=self._past_votes,
            past_deaths=self._past_deaths,
        )
        result: dict[str, tuple[PublicContext, RoleSpecificContext | None]] = {}
        for actor in self._alive_agents():
            role_ctx: RoleSpecificContext | None = (
                WolfSpecificContext(
                    wolf_partners=[
                        a.name for a in self._alive_agents()
                        if isinstance(a.role, Werewolf) and a.name != actor.name
                    ]
                )
                if isinstance(actor.role, Werewolf)
                else None
            )
            result[actor.name] = (ctx, role_ctx)
        return result

    def _apply_discussion_result(
        self,
        actor: Actor,
        result: DiscussionResult,
        phase: Phase,
    ) -> SpeechEntry | None:
        """Post-process a DiscussionResult: emit events, update state, append to today_log.

        Returns the SpeechEntry if the actor spoke, or None if silent.
        """
        if isinstance(result, SilentResult):
            self._emit(LogEvent.make(
                day=self.day,
                phase=phase.value,
                event_type=EventType.SPEECH,
                agent=actor.name,
                content=f"{actor.name} is watching the village silently...",
                is_public=True,
                decision=result.action,
            ))
            return None

        # All speaking variants share thought, speech, memory_update, suspicion_scores, threat_scores
        reply_to_entry: SpeechEntry | None = None
        if isinstance(result, ChallengeResult):
            reply_to_entry = next(
                (e for e in self.today_log if e.speech_id == result.reply_to),
                None,
            )

        if isinstance(result, CoResult):
            actor.state.intended_co = None
            actor.state.claimed_role = result.claim_role
            store.save(actor)

        speech_id = self._next_speech_id()
        entry = SpeechEntry(speech_id=speech_id, agent=actor.name, text=result.speech)
        self.today_log.append(entry)

        self._emit(LogEvent.make(
            day=self.day,
            phase=phase.value,
            event_type=EventType.SPEECH,
            agent=actor.name,
            content=result.speech,
            is_public=True,
            speech_id=speech_id,
            reply_to=reply_to_entry.speech_id if reply_to_entry else None,
            claimed_role=actor.state.claimed_role,
            reasoning=result.thought,
            decision=result.action,
        ))

        if result.suspicion_scores:
            memory_mod.update_beliefs(actor, result.suspicion_scores)
            scores_str = ", ".join(
                f"{name}={score:.2f}" for name, score in result.suspicion_scores.items()
            )
            self._emit(LogEvent.make(
                day=self.day,
                phase=phase.value,
                event_type=EventType.SUSPICION_UPDATE,
                agent=actor.name,
                content=f"{actor.name} suspicion update: {scores_str}",
                is_public=False,
            ))

        if result.threat_scores:
            memory_mod.update_threat_scores(actor, result.threat_scores)
            scores_str = ", ".join(
                f"{name}={score:.2f}" for name, score in result.threat_scores.items()
            )
            self._emit(LogEvent.make(
                day=self.day,
                phase=phase.value,
                event_type=EventType.THREAT_UPDATE,
                agent=actor.name,
                content=f"{actor.name} threat update: {scores_str}",
                is_public=False,
            ))

        if result.memory_update:
            memory_mod.update_memory(actor, result.memory_update)

        return entry

    def _run_day(self) -> str | None:
        return run_day_phase(self)

    def _run_night(self) -> str | None:
        return run_night_phase(self)

    def _game_over(self, winner: str) -> None:
        self._emit(LogEvent.make(
            day=self.day + 1,
            phase=Phase.GAME_OVER.value,
            event_type=EventType.GAME_OVER,
            content=f"GAME OVER — {winner} win!",
            is_public=True,
            winner=winner,
        ))

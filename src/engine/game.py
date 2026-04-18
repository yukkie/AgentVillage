import random
from typing import Callable

from src.config import DISCUSSION_ROUNDS, WOLF_CHAT_ROUNDS
from src.domain.actor import Actor, Belief
from src.agent import store, memory as memory_mod
from src.engine.phase import Phase
from src.engine.vote import tally_votes
from src.engine.victory import check_victory
from src.llm import client as llm_client
from src.llm.prompt import PublicContext, SpeechDirection, WolfSpecificContext
from src.domain.schema import AgentOutput, SpeechEntry
from src.action.types import Vote, Inspect, Attack
from src.action.validator import validate
from src.action.resolver import resolve_inspect, resolve_attack
from src.domain.event import LogEvent, EventType
from src.domain.roles import Werewolf, Knight, Seer, Medium
from src.logger.writer import LogWriter

DISCUSSION_ROUNDS = 2
WOLF_CHAT_ROUNDS = 3


class GameEngine:
    def __init__(
        self,
        agents: list[Actor],
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
        # Only emit CO_ANNOUNCEMENT when the claimed role actually changes
        # (prevents duplicate announcements when LLM spontaneously repeats intent.co).
        if output.intent.co and type(output.intent.co) is not type(actor.state.claimed_role):
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
        """Pre-night phase: non-Villager agents secretly decide whether to CO on Day 1.

        Only runs once at game start. Results logged as spectator-only.
        Filter: role != "Villager" — covers Seer (true CO) and Werewolf (fake CO as Seer).
        """
        from src.domain.roles import Villager
        targets = [a for a in self._alive_agents() if not isinstance(a.role, Villager)]
        if not targets:
            return

        self._phase_start(Phase.PRE_NIGHT)

        for actor, output in llm_client.call_pre_night_parallel(
            targets, self._alive_names(), self.lang, self.agents
        ):
            actor.state.intended_co = output.decision == "co"
            memory_mod.update_memory(actor, [f"Pre-game decision: {output.reasoning}"])

            decision_label = "decided to CO" if actor.state.intended_co else "decided to wait"
            self._emit(LogEvent.make(
                day=self.day,
                phase=Phase.PRE_NIGHT.value,
                event_type=EventType.PRE_NIGHT_DECISION,
                agent=actor.name,
                content=f"{actor.name} ({actor.role.name}) {decision_label}. Reasoning: {output.reasoning}",
                is_public=False,
            ))

    def _run_day(self) -> str | None:
        self._day_outputs = {}

        # --- OPENING: 全員1回発言 ---
        self.phase = Phase.DAY_OPENING
        self._phase_start(Phase.DAY_OPENING)

        opening_order = self._alive_agents()
        random.shuffle(opening_order)

        opening_calls = [(actor, *self._build_speech_args(actor)) for actor in opening_order]
        for actor, output in llm_client.call_speech_parallel(opening_calls):
            self._apply_speech_output(actor, output, Phase.DAY_OPENING)

        # --- DISCUSSION × 2: 全アクターの（判断→発言）チェーンを並列実行 ---
        self.phase = Phase.DAY_DISCUSSION
        for _round in range(DISCUSSION_ROUNDS):
            self._phase_start(Phase.DAY_DISCUSSION)
            alive = self._alive_agents()
            snapshot = list(self.today_log)

            spoke_anyone = False
            for actor, judgment, output, reply_to_entry, force_co in llm_client.call_discussion_parallel(
                alive,
                snapshot,
                self._alive_names(),
                self.day,
                self.lang,
                self._build_speech_args,
            ):
                if output is None:
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.DAY_DISCUSSION.value,
                        event_type=EventType.SPEECH,
                        agent=actor.name,
                        content=f"{actor.name} is watching the village silently...",
                        is_public=True,
                    ))
                else:
                    spoke_anyone = True
                    self._apply_speech_output(
                        actor, output, Phase.DAY_DISCUSSION, reply_to_entry, force_co
                    )

            if not spoke_anyone:
                break  # 全員silentなら2巡目はスキップ

        # --- VOTE ---
        self.phase = Phase.DAY_VOTE
        self._phase_start(Phase.DAY_VOTE)

        votes: dict[str, str] = {}
        alive_names = self._alive_names()

        for actor in self._alive_agents():
            output = self._day_outputs.get(actor.name)
            target = None

            if output and output.intent.vote_candidates:
                sorted_candidates = sorted(
                    output.intent.vote_candidates,
                    key=lambda vc: vc.score,
                    reverse=True,
                )
                for vc in sorted_candidates:
                    if vc.target in alive_names and vc.target != actor.name:
                        target = vc.target
                        break

            if target is None:
                others = [n for n in alive_names if n != actor.name]
                target = others[0] if others else None

            if target:
                vote_action = Vote(target=target)
                if validate(vote_action, actor, alive_names):
                    votes[actor.name] = target
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.DAY_VOTE.value,
                        event_type=EventType.VOTE,
                        agent=actor.name,
                        target=target,
                        content=f"{actor.name} votes for {target}",
                        is_public=True,
                    ))

        if votes:
            self._past_votes.append({"day": self.day, "votes": dict(votes)})
            eliminated = tally_votes(votes)
            self._eliminate(eliminated, EventType.ELIMINATION, Phase.DAY_VOTE.value)

            # Notify Medium of the executed player's alignment (Werewolf or Not Werewolf)
            medium = next((a for a in self._alive_agents() if isinstance(a.role, Medium)), None)
            if medium:
                executed_actor = self._get_agent(eliminated)
                if executed_actor:
                    result = "Werewolf" if isinstance(executed_actor.role, Werewolf) else "Not Werewolf"
                    memory_mod.update_memory(
                        medium,
                        [f"Day {self.day}: {eliminated} was executed, they were {result}"],
                    )
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.DAY_VOTE.value,
                        event_type=EventType.MEDIUM_RESULT,
                        agent=medium.name,
                        target=eliminated,
                        content=f"{medium.name} senses: {eliminated} was {result}",
                        is_public=False,
                    ))

        return check_victory(self.agents)

    def _run_night(self) -> str | None:
        self.phase = Phase.NIGHT
        self._phase_start(Phase.NIGHT)
        self.today_log = []

        alive_names = self._alive_names()
        night_context = f"Day {self.day} night. Alive: {', '.join(alive_names)}"

        attack_target: str | None = None
        guard_target: str | None = None

        # --- ① 狼同士の会話（最大3往復） ---
        wolves = [a for a in self._alive_agents() if isinstance(a.role, Werewolf)]
        if len(wolves) >= 2:
            self.phase = Phase.NIGHT_WOLF_CHAT
            self._phase_start(Phase.NIGHT_WOLF_CHAT)
            wolf_chat_log: list[SpeechEntry] = []
            wolf_names = [w.name for w in wolves]
            last_wolf_outputs = {w.name: None for w in wolves}

            for _round in range(WOLF_CHAT_ROUNDS):
                for wolf in wolves:
                    partners = [n for n in wolf_names if n != wolf.name]
                    output = llm_client.call_wolf_chat(
                        wolf, partners, alive_names, wolf_chat_log, self.lang
                    )
                    last_wolf_outputs[wolf.name] = output
                    entry = SpeechEntry(
                        speech_id=self._next_speech_id(),
                        agent=wolf.name,
                        text=output.speech,
                    )
                    wolf_chat_log.append(entry)
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.NIGHT_WOLF_CHAT.value,
                        event_type=EventType.WOLF_CHAT,
                        agent=wolf.name,
                        content=f"{wolf.name}: {output.speech}",
                        is_public=False,
                    ))

            # 最後のターンのvote_candidatesを集計して襲撃対象を決定
            score_totals: dict[str, float] = {}
            for wolf in wolves:
                out = last_wolf_outputs[wolf.name]
                if out and out.vote_candidates:
                    for vc in out.vote_candidates:
                        if vc.target in alive_names and vc.target not in wolf_names:
                            score_totals[vc.target] = score_totals.get(vc.target, 0.0) + vc.score
            if score_totals:
                attack_target = max(score_totals, key=lambda t: score_totals[t])

        # --- ② 狼単体フォールバック（チャットで合意できなかった場合） ---
        if attack_target is None:
            for actor in self._alive_agents():
                if not isinstance(actor.role, Werewolf):
                    continue
                target_name = llm_client.call_night_action(actor, night_context, alive_names)
                attack = Attack(target=target_name)
                if validate(attack, actor, alive_names):
                    attack_target = resolve_attack(attack, self.agents)
                    break

        if attack_target:
            self._emit(LogEvent.make(
                day=self.day,
                phase=Phase.NIGHT.value,
                event_type=EventType.NIGHT_ATTACK,
                agent=wolves[0].name if wolves else None,
                target=attack_target,
                content=f"Werewolves attack {attack_target}",
                is_public=False,
            ))

        # --- ③ 全役職が行動意思を決定（騎士・占い師） ---
        seer_inspect: tuple[Actor, Inspect] | None = None  # (seer, inspect_action)

        knight: Actor | None = None
        for actor in self._alive_agents():
            if isinstance(actor.role, Knight):
                knight = actor
                target_name = llm_client.call_night_action(actor, night_context, alive_names)
                candidates = [n for n in alive_names if n != actor.name]
                if target_name in candidates:
                    guard_target = target_name
                    self._emit(LogEvent.make(
                        day=self.day,
                        phase=Phase.NIGHT.value,
                        event_type=EventType.GUARD,
                        agent=actor.name,
                        target=guard_target,
                        content=f"{actor.name} guards {guard_target}",
                        is_public=False,
                    ))

            elif isinstance(actor.role, Seer):
                target_name = llm_client.call_night_action(actor, night_context, alive_names)
                inspect = Inspect(target=target_name)
                if validate(inspect, actor, alive_names):
                    seer_inspect = (actor, inspect)  # 結果適用は後回し

        # --- ④ 解決フェーズ ---
        # 騎士の護衛判定 → 狼の襲撃判定 → 占い師の占い判定
        seer_survived = True
        if attack_target:
            if guard_target == attack_target:
                # spectator: 護衛成功の詳細
                self._emit(LogEvent.make(
                    day=self.day,
                    phase=Phase.NIGHT.value,
                    event_type=EventType.GUARD_BLOCK,
                    target=attack_target,
                    content=f"{attack_target} was protected by the Knight! The attack was blocked.",
                    is_public=False,
                ))
                # 村全員: 誰も死ななかった（誰が守ったかは伏せる）
                self._emit(LogEvent.make(
                    day=self.day,
                    phase=Phase.NIGHT.value,
                    event_type=EventType.GUARD_BLOCK,
                    content="The village woke up to find everyone safe. The werewolves' attack seems to have failed.",
                    is_public=True,
                ))
                # 騎士: 自分の護衛が成功したことを記憶
                if knight:
                    memory_mod.update_memory(
                        knight,
                        [f"Day {self.day}: successfully guarded {guard_target} from werewolf attack"],
                    )
            else:
                # 占い師が襲撃対象かチェック
                if seer_inspect and seer_inspect[0].name == attack_target:
                    seer_survived = False
                self._eliminate(attack_target, EventType.NIGHT_ATTACK, Phase.NIGHT.value)

        # 占い師が生き残っていれば占い結果を適用
        if seer_inspect and seer_survived:
            seer, inspect = seer_inspect
            name, result = resolve_inspect(inspect, self.agents)
            if name not in seer.state.beliefs:
                seer.state.beliefs[name] = Belief()
            if isinstance(result, Werewolf):
                seer.state.beliefs[name].suspicion = 1.0
                seer.state.beliefs[name].trust = 0.0
                seer.state.beliefs[name].reason.append(f"Day {self.day}: inspected as Werewolf")
            else:
                seer.state.beliefs[name].suspicion = 0.0
                seer.state.beliefs[name].trust = 1.0
                seer.state.beliefs[name].reason.append(f"Day {self.day}: inspected as Not Werewolf")
            store.save(seer)
            self._emit(LogEvent.make(
                day=self.day,
                phase=Phase.NIGHT.value,
                event_type=EventType.INSPECTION,
                agent=seer.name,
                target=name,
                content=f"{seer.name} inspects {name}: {result}",
                is_public=False,
            ))

        return check_victory(self.agents)

    def _game_over(self, winner: str) -> None:
        self._emit(LogEvent.make(
            day=self.day,
            phase=Phase.GAME_OVER.value,
            event_type=EventType.GAME_OVER,
            content=f"GAME OVER — {winner} win!",
            is_public=True,
        ))

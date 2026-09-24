import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import AgentRosterRow from '../components/AgentRosterRow.jsx';
import RoleTag from '../components/RoleTag.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { FeedItem } from '../components/FeedCard.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLE_META_BY_KEY } from '../lib/roleMeta.js';
import { AGENT_CONFIG, parseBlurb } from '../lib/agentMeta.js';
import { agentDetailPath } from '../lib/agentDetailPath.js';
import { fetchGameStats, parseGameStats, parseAllAgentNames, fetchGameBySessionId } from '../lib/archiveLoader.js';
import { winRate, formatWinRate } from '../lib/winRate.js';
import { fetchReplayGame } from '../lib/replayLoader.js';
import { buildAgentDetailRoster, buildSuspicionMatrix, countAgentSpeeches } from '../lib/parseGameData.js';
import { useDeaths } from '../lib/useDeaths.js';
import { useViewerMode, viewerModeToggleLabel } from '../lib/useViewerMode.js';
import styles from './AgentDetailScreen.module.css';

// blurb（frontend/src/config/agents.json 由来の1行プロフィール・#519）が無いエージェントのフォールバック表示。
const BLURB_FALLBACK = '—';

// blurb は viewerMode にもモード（global / game-scoped）にも依存しない名前依存の静的データ。
// agents.json はビルド時に静的 import 済み（agentMeta.js 経由）のため同期的に引ける（#628。取得失敗の概念は無い）。
function getAgentBlurb(agent) {
  return parseBlurb(AGENT_CONFIG, agent) ?? BLURB_FALLBACK;
}

// --- 左ペイン ---
function LeftPane({ current, sessionId, viewerMode = 'spectator', roster = [] }) {
  const alive = roster.filter(agent => agent.isAlive);
  const dead = roster.filter(agent => !agent.isAlive);

  return (
    <>
      <div className={styles.pickerHead}>
        <span className={styles.pickerTitle}>{sessionId} · 全{roster.length}名</span>
        <span className={styles.pickerCount}>{alive.length} alive · {dead.length} dead</span>
      </div>
      <div className={styles.agentPicker}>
        <ul className={styles.pickerList} aria-label="エージェント一覧">
          {roster.map(row => (
            <AgentRosterRow
              key={row.name}
              name={row.name}
              role={row.role}
              to={agentDetailPath(sessionId, row.name, viewerMode)}
              showRole={viewerMode === 'spectator'}
              dead={!row.isAlive}
              selected={current === row.name}
            />
          ))}
        </ul>
      </div>
    </>
  );
}

// --- 中央: ヒーロー ---
function AgentHero({ agent, agentData, speechCount, sessionMeta, currentDay, deathDay, viewerMode = 'spectator', blurb }) {
  const role = agentData?.role ?? null;
  const r = ROLE_META_BY_KEY[role];
  const isPublic = viewerMode === 'public';
  const isAlive = agentData?.is_alive ?? true;
  const teamLabel = r?.team === 'wolf' ? '人狼陣営' : '村人陣営';
  const sessionLabel = sessionMeta?.title || sessionMeta?.session_id || sessionMeta?.id || '—';

  return (
    <header className={styles.agentHero} style={{ '--r-color': r?.color }}>
      <Avatar name={agent} role={isPublic ? undefined : role} highlight />
      <div className={styles.heroInfo}>
        <h1>{agent}</h1>
        <div className={styles.heroSub}>
          {!isPublic && r && <RoleTag role={role} />}
          {!isPublic && r && <span>所属: <strong style={{ color: 'var(--tx-2)' }}>{teamLabel}</strong></span>}
          <span>{sessionLabel}</span>
          <span style={{ color: isAlive ? 'var(--alive)' : 'var(--dead)' }}>
            {isAlive ? `生存中 · Day ${currentDay || 0}` : `死亡 · Day ${deathDay ?? currentDay ?? 0}`}
          </span>
        </div>
        <p className={styles.heroBlurb}>{blurb}</p>
      </div>
      <div className={styles.heroStats}>
        <div className={styles.heroStat}>
          <div className={styles.statNum}>{speechCount}</div>
          <div className={styles.statLabel}>本村発言</div>
        </div>
      </div>
    </header>
  );
}

// --- 共通パーツ: マトリクス行 ---
function MatrixRow({ m }) {
  return (
    <li className={styles.matrixRow}>
      <div className={styles.matrixName}>
        <Avatar name={m.name} size="xs" />
        {m.name}
      </div>
      <div className={styles.barWrap}>
        <i className={styles.barFill} style={{ width: `${m.suspicion}%` }} />
      </div>
      <div className={styles.matrixNum} style={{ color: 'var(--danger)' }}>{m.suspicion}</div>
    </li>
  );
}

// --- 右ペイン ---
function RightPane({ matrix }) {

  return (
    <div className={styles.rightInner}>
      <div className={styles.panel}>
        <h3>疑い度マトリクス</h3>
        <div className={styles.matrixHeader} aria-hidden="true">
          <div className={styles.matrixHead}>対象</div>
          <div className={styles.matrixHead}>疑い</div>
          <div className={styles.matrixHead}>疑</div>
        </div>
        <ul className={styles.matrix} aria-label="疑い度マトリクス">
          {matrix.map(m => <MatrixRow key={m.name} m={m} />)}
        </ul>
      </div>
    </div>
  );
}

// AgentDetail 中央タイムラインが対象エージェント個人の行動として表示する event_type 一覧
// （doc/DataSpec.md §1.1 の現行イベント全種と対応。含めないものは理由を明記する）。
//
// 含める: speech（発言）/ inspection（占い）/ guard（護衛）/ night_attack（襲撃、public は除外）/
//         wolf_chat（狼会話）/ medium_result（霊媒結果） — いずれも対象エージェント個人が
//         実行した夜の行動または発言。
// 含めない:
//   - vote / elimination / game_over / game_start_narrative / role_assigned / phase_start
//     → ゲーム全体・昼フェーズの出来事であり、個人の行動記録という本タイムラインの対象外
//   - guard_block → 護衛成功の通知は night_attack 側の SystemRow で表現され、agent が対象
//     エージェント本人と一致しないため、このタイムラインには乗らない
//   - suspicion_update / threat_update → 疑念・脅威スコアの更新ログであり発言・行動ではない
const AGENT_TIMELINE_EVENT_TYPES = new Set(['speech', 'inspection', 'guard', 'night_attack', 'wolf_chat', 'medium_result']);

function buildPrevById(events) {
  return Object.fromEntries(
    events
      .filter(ev => ev.event_type === 'speech' && ev.speech_id != null)
      .map(ev => [`${ev.day}-${ev.speech_id}`, ev])
  );
}

function isAgentTimelineEvent(ev, agent) {
  if (!AGENT_TIMELINE_EVENT_TYPES.has(ev.event_type)) return false;
  if (ev.event_type === 'night_attack' && ev.is_public) return false;
  return ev.agent === agent;
}

function AgentDayTimeline({ agent, events, visibleDays, roleAssignment, sessionId, viewerMode }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const activeDay = visibleDays.includes(selectedDay) ? selectedDay : visibleDays[0] ?? null;

  const prevById = useMemo(() => buildPrevById(events), [events]);
  const timelineEvents = activeDay == null
    ? []
    : events.filter(ev => ev.day === activeDay && isAgentTimelineEvent(ev, agent));
  const activeTabId = activeDay == null ? undefined : `agent-day-tab-${activeDay}`;
  const activePanelId = activeDay == null ? undefined : `agent-day-panel-${activeDay}`;

  if (visibleDays.length === 0) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.emptyState}>このゲームの Day イベントはありません。</div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="日付タブ">
        {visibleDays.map(day => (
          <button
            key={day}
            id={`agent-day-tab-${day}`}
            type="button"
            role="tab"
            aria-controls={`agent-day-panel-${day}`}
            aria-selected={activeDay === day}
            className={`${styles.tab} ${activeDay === day ? styles.tabOn : ''}`}
            onClick={() => setSelectedDay(day)}
          >
            Day{day}
          </button>
        ))}
      </div>
      <div
        id={activePanelId}
        className={`${styles.tabContent} ${styles.timelineContent}`}
        role="tabpanel"
        aria-labelledby={activeTabId}
      >
        {timelineEvents.length === 0 ? (
          <div className={styles.emptyState}>Day{activeDay} の {agent} の行動はありません。</div>
        ) : (
          <div className={styles.timelineList} aria-label={`Day${activeDay} ${agent} タイムライン`}>
            {timelineEvents.map((ev, index) => (
              <FeedItem
                key={ev.id ?? `${ev.day}-${ev.event_type}-${ev.agent}-${ev.speech_id ?? ev.target ?? index}`}
                ev={ev}
                prevById={prevById}
                roleAssignment={roleAssignment}
                sessionId={sessionId}
                viewerMode={viewerMode}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// global profile mode（#522）— 出所は state/stats/game_stats.json（DataSpec §6）
// 横断戦績のみを表示する。役職タグ・推論・夜行動・疑念マトリクス・session ラベル・
// 生死は出さない（AC-4）。viewerMode による出し分けも行わない（AC-5）。
// ============================================================================

// --- global 左ペイン: 全エージェント横断プロフィール一覧リンク集（AC-3） ---
function GlobalLeftPane({ allNames, current }) {
  return (
    <>
      <div className={styles.pickerHead}>
        <span className={styles.pickerTitle}>エージェント一覧</span>
        <span className={styles.pickerCount}>全{allNames.length}名</span>
      </div>
      <div className={styles.agentPicker}>
        <ul className={styles.pickerList} aria-label="エージェント一覧">
          {allNames.map(n => (
            <AgentRosterRow
              key={n}
              name={n}
              to={`/agent/${encodeURIComponent(n)}`}
              showRole={false}
              showStatusDot={false}
              selected={n === current}
            />
          ))}
        </ul>
      </div>
    </>
  );
}

// --- global ヒーロー: 名前・アバター・勝率・通算成績（AC-1 / AC-6） ---
// 役職タグ・生死・session ラベルは出さない（AC-4）。
// ヒーロー統計: 通算勝率＋陣営別勝率（#629）。出場0回は formatWinRate が — を返す。
function HeroWinRate({ label, caption, wins, total, className }) {
  return (
    <div className={styles.heroStat} role="group" aria-label={label}>
      <div className={`${styles.statNum} ${className ?? ''}`}>{formatWinRate(winRate(wins, total))}</div>
      <div className={styles.statLabel}>{caption}</div>
    </div>
  );
}

function GlobalHero({ agent, stats, blurb }) {
  const { village, werewolf } = stats.byFaction;

  return (
    <header className={styles.agentHero}>
      <Avatar name={agent} highlight />
      <div className={styles.heroInfo}>
        <h1>{agent}</h1>
        <div className={styles.heroSub}>
          <span>通算 {stats.total} 戦 {stats.wins} 勝</span>
        </div>
        <p className={styles.heroBlurb}>{blurb}</p>
      </div>
      <div className={styles.heroStats}>
        <HeroWinRate label="通算勝率" caption={`勝率 (${stats.total}戦)`} wins={stats.wins} total={stats.total} />
        <HeroWinRate
          label="村陣営勝率" caption={`村陣営 (${village.total}戦)`}
          wins={village.wins} total={village.total} className={styles.statVillage}
        />
        <HeroWinRate
          label="狼陣営勝率" caption={`狼陣営 (${werewolf.total}戦)`}
          wins={werewolf.wins} total={werewolf.total} className={styles.statWolf}
        />
      </div>
    </header>
  );
}

// --- global 過去戦績一覧（AC-2）。村名列が無いため game_id を session_id として表示 ---
// role 列は表示する（AC-2 で許可。AC-4 が禁じる Hero/Avatar/左ペインの役職タグとは別物）。
function GlobalHistory({ stats }) {
  return (
    <div className={styles.panel}>
      <h3>過去の戦績 <small>通算 {stats.total} 戦 {stats.wins} 勝</small></h3>
      {stats.records.length === 0 ? (
        <div style={{ color: 'var(--tx-4)', fontSize: 13 }}>戦績なし</div>
      ) : (
        <ul className={styles.recordList} aria-label="過去の戦績">
          {stats.records.map((rec, i) => {
            const r = ROLE_META_BY_KEY[rec.role];
            return (
              <li key={i} className={styles.recordRow} style={{ '--r-color': r?.color }}>
                <span className={styles.recordNum}>{rec.gameId}</span>
                <RoleTag role={rec.role} className={styles.recordRole} />
                <span className={`${styles.recordResult} ${rec.won ? styles.win : styles.lose}`}>
                  {rec.won ? '勝利' : '敗北'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- global profile mode 本体（非同期 fetch・loading/error/empty を扱う・AC-7） ---
function GlobalProfile({ agent, blurb }) {
  const [state, setState] = useState({ status: 'loading', games: null });

  useEffect(() => {
    let cancelled = false;
    fetchGameStats()
      .then(games => { if (!cancelled) setState({ status: 'ready', games }); })
      .catch(() => { if (!cancelled) setState({ status: 'error', games: null }); });
    return () => { cancelled = true; };
  }, []);

  const topCrumbs = [{ label: 'r/agent-jinrou', to: '/' }, { label: agent }];

  let body;
  if (state.status === 'loading') {
    body = <StatusMessage kind="loading" className={styles.tabContent}>読み込み中…</StatusMessage>;
  } else if (state.status === 'error') {
    body = <StatusMessage kind="error" className={styles.tabContent}>戦績を読み込めませんでした。</StatusMessage>;
  } else {
    const stats = parseGameStats(state.games, agent);
    const allNames = parseAllAgentNames(state.games);
    body = (
      <ThreePaneLayout
        collapsibleLeft
        leftLabel="エージェント一覧"
        left={<GlobalLeftPane allNames={allNames} current={agent} />}
      >
        <div className={styles.mainPane}>
          <GlobalHero agent={agent} stats={stats} blurb={blurb} />
          <div className={styles.tabContent}>
            <GlobalHistory stats={stats} />
          </div>
        </div>
      </ThreePaneLayout>
    );
  }

  return (
    <div className={styles.frame}>
      <TopBar crumbs={topCrumbs} />
      {body}
    </div>
  );
}

// --- game-scoped mode 本体（sessionId ごとに key 再マウントし、fetch state を新規化する） ---
function GameScopedProfile({ sessionId, agent, blurb, viewerMode, viewerSearch, toggleViewerMode }) {
  const [gameScopedState, setGameScopedState] = useState({
    status: 'loading',
    entry: null,
    gameData: null,
    error: null,
  });
  const deaths = useDeaths(gameScopedState.gameData?.events);

  useEffect(() => {
    let cancelled = false;

    fetchGameBySessionId(sessionId)
      .then(entry => fetchReplayGame({ sessionId, cast: entry.cast ?? [] }).then(gameData => ({ entry, gameData })))
      .then(({ entry, gameData }) => {
        if (!cancelled) setGameScopedState({ status: 'ready', entry, gameData, error: null });
      })
      .catch(error => {
        if (!cancelled) setGameScopedState({ status: 'error', entry: null, gameData: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const topCrumbs = [
    { label: 'r/agent-jinrou', to: '/' },
    { label: sessionId, to: `/game/${sessionId}${viewerSearch}` },
    { label: agent },
  ];

  let body;
  if (gameScopedState.status === 'loading') {
    body = <StatusMessage kind="loading" className={styles.tabContent}>読み込み中…</StatusMessage>;
  } else if (gameScopedState.status === 'error') {
    body = <StatusMessage kind="error" className={styles.tabContent}>{gameScopedState.error?.message ?? '読み込めませんでした。'}</StatusMessage>;
  } else {
    const { entry, gameData } = gameScopedState;
    const events = gameData?.events ?? [];
    const agents = gameData?.agents ?? {};
    const currentAgent = agents[agent] ?? { name: agent, role: null, is_alive: true, state: {} };
    const roster = buildAgentDetailRoster(events, agents);
    const matrix = buildSuspicionMatrix(events, agents, agent).slice(0, 8);
    const speechCount = countAgentSpeeches(events, agent);
    const visibleDays = [...new Set(events.map(ev => ev.day).filter(Boolean))].sort((a, b) => a - b);
    const currentDay = entry?.days ?? visibleDays.at(-1) ?? 0;
    // 死亡イベント欠落で引けなければ undefined → AgentHero が currentDay にフォールバックする（AC-4）。
    const deathDay = deaths[agent]?.day;
    const roleAssignment = Object.fromEntries(
      Object.entries(agents).map(([name, data]) => [name, data.role])
    );

    body = (
      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight={viewerMode === 'spectator'}
        leftLabel="ロースター"
        rightLabel={viewerMode === 'spectator' ? '投票' : undefined}
        left={<LeftPane current={agent} sessionId={sessionId} viewerMode={viewerMode} roster={roster} />}
        right={viewerMode === 'spectator' ? <RightPane matrix={matrix} /> : null}
      >
        <div className={styles.mainPane}>
          <AgentHero
            agent={agent}
            agentData={currentAgent}
            speechCount={speechCount}
            sessionMeta={entry}
            currentDay={currentDay}
            deathDay={deathDay}
            viewerMode={viewerMode}
            blurb={blurb}
          />
          <AgentDayTimeline
            agent={agent}
            events={events}
            visibleDays={visibleDays}
            roleAssignment={roleAssignment}
            sessionId={sessionId}
            viewerMode={viewerMode}
          />
        </div>
      </ThreePaneLayout>
    );
  }

  return (
    <div className={styles.frame}>
      <TopBar crumbs={topCrumbs}>
        <TopBarBtn onClick={toggleViewerMode}>
          {viewerModeToggleLabel(viewerMode)}
        </TopBarBtn>
      </TopBar>
      {body}
    </div>
  );
}

// === メイン画面 ===
export default function AgentDetailScreen() {
  const { sessionId, agentName } = useParams();
  const { viewerMode, viewerSearch, toggleViewerMode } = useViewerMode();
  const agent = agentName || 'Nox';
  const blurb = getAgentBlurb(agent);

  // sessionId なし → global profile mode（横断戦績・実データ）
  if (!sessionId) {
    return <GlobalProfile agent={agent} blurb={blurb} />;
  }

  return (
    <GameScopedProfile
      key={sessionId}
      sessionId={sessionId}
      agent={agent}
      blurb={blurb}
      viewerMode={viewerMode}
      viewerSearch={viewerSearch}
      toggleViewerMode={toggleViewerMode}
    />
  );
}

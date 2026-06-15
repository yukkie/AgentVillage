import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import AgentRosterRow from '../components/AgentRosterRow.jsx';
import { FeedItem } from '../components/FeedCard.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLE_META_BY_KEY } from '../lib/roleMeta.js';
import { fetchGameStats, parseGameStats, parseAllAgentNames, fetchGameBySessionId, fetchAgentConfig, parseBlurb } from '../lib/archiveLoader.js';
import { fetchReplayGame } from '../lib/replayLoader.js';
import { buildAgentDetailRoster, buildSuspicionMatrix, countAgentSpeeches } from '../lib/parseGameData.js';
import styles from './AgentDetailScreen.module.css';

// blurb（frontend/public/config/agents.json 由来の1行プロフィール・#519）が無い／fetch 失敗時のフォールバック表示。
const BLURB_FALLBACK = '—';

// blurb は viewerMode にもモード（global / game-scoped）にも依存しない名前依存の静的データ。
// 戦績／リプレイの fetch チェーンに混ぜず独立して取得し、失敗しても本体描画を妨げない（AC-4）。
function useAgentBlurb(agent) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAgentConfig()
      .then(c => { if (!cancelled) setConfig(c); })
      .catch(() => { if (!cancelled) setConfig(null); });
    return () => { cancelled = true; };
  }, []);

  return parseBlurb(config, agent) ?? BLURB_FALLBACK;
}

function viewerModeFromSearchParams(searchParams) {
  return searchParams.get('view') === 'public' ? 'public' : 'spectator';
}

function searchForViewerMode(viewerMode) {
  return viewerMode === 'public' ? '?view=public' : '';
}

// --- 左ペイン ---
function LeftPane({ current, sessionId, viewerMode = 'spectator', roster = [] }) {
  const alive = roster.filter(agent => agent.isAlive);
  const dead = roster.filter(agent => !agent.isAlive);
  const viewerSearch = searchForViewerMode(viewerMode);

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
              to={`/game/${sessionId}/agent/${encodeURIComponent(row.name)}${viewerSearch}`}
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
function AgentHero({ agent, agentData, speechCount, sessionMeta, currentDay, viewerMode = 'spectator', blurb }) {
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
          {!isPublic && r && <span className={styles.heroRoleLabel}>{r.ja}</span>}
          {!isPublic && r && <span>所属: <strong style={{ color: 'var(--tx-2)' }}>{teamLabel}</strong></span>}
          <span>{sessionLabel}</span>
          <span style={{ color: isAlive ? 'var(--alive)' : 'var(--dead)' }}>
            {isAlive ? `生存中 · Day ${currentDay || 0}` : `死亡 · Day ${currentDay || 0}`}
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

const AGENT_TIMELINE_EVENT_TYPES = new Set(['speech', 'inspection', 'guard', 'night_attack']);

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
function GlobalHero({ agent, stats, blurb }) {
  const winPct = stats.total ? Math.round(stats.wins / stats.total * 100) : 0;

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
        <div className={styles.heroStat}>
          <div className={styles.statNum}>{winPct}%</div>
          <div className={styles.statLabel}>勝率 ({stats.total}戦)</div>
        </div>
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
                <span className={styles.recordRole}>{r?.ja || rec.role}</span>
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
    body = <div className={styles.tabContent} style={{ color: 'var(--tx-4)' }}>読み込み中…</div>;
  } else if (state.status === 'error') {
    body = <div className={styles.tabContent} style={{ color: 'var(--danger)' }}>戦績を読み込めませんでした。</div>;
  } else {
    const stats = parseGameStats(state.games, agent);
    const allNames = parseAllAgentNames(state.games);
    body = (
      <ThreePaneLayout
        collapsibleLeft
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

// === メイン画面 ===
export default function AgentDetailScreen() {
  const { sessionId, agentName } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewerMode = viewerModeFromSearchParams(searchParams);
  const viewerSearch = searchForViewerMode(viewerMode);
  const agent = agentName || 'Nox';
  const blurb = useAgentBlurb(agent);
  const [gameScopedState, setGameScopedState] = useState({
    status: sessionId ? 'loading' : 'idle',
    entry: null,
    gameData: null,
    error: null,
  });

  useEffect(() => {
    if (!sessionId) return undefined;

    let cancelled = false;
    setGameScopedState({ status: 'loading', entry: null, gameData: null, error: null });

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

  // sessionId なし → global profile mode（横断戦績・実データ）
  if (!sessionId) {
    return <GlobalProfile agent={agent} blurb={blurb} />;
  }

  const toggleViewerMode = () => {
    setSearchParams(viewerMode === 'spectator' ? { view: 'public' } : {});
  };

  const topCrumbs = [
    { label: 'r/agent-jinrou', to: '/' },
    { label: sessionId, to: `/game/${sessionId}${viewerSearch}` },
    { label: agent },
  ];

  let body;
  if (gameScopedState.status === 'loading') {
    body = <div className={styles.tabContent} style={{ color: 'var(--tx-4)' }}>読み込み中…</div>;
  } else if (gameScopedState.status === 'error') {
    body = <div className={styles.tabContent} style={{ color: 'var(--danger)' }}>{gameScopedState.error?.message ?? '読み込めませんでした。'}</div>;
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
    const roleAssignment = Object.fromEntries(
      Object.entries(agents).map(([name, data]) => [name, data.role])
    );

    body = (
      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight={viewerMode === 'spectator'}
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
          {viewerMode === 'spectator' ? '🔍 観戦者モード' : '👤 参加者視点'}
        </TopBarBtn>
      </TopBar>
      {body}
    </div>
  );
}

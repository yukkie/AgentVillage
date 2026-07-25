import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgentLink from '../components/AgentLink.jsx';
import Avatar, { AvatarButton } from '../components/Avatar.jsx';
import AgentRosterRow from '../components/AgentRosterRow.jsx';
import RoleTag from '../components/RoleTag.jsx';
import { FeedItem, SystemRow } from '../components/FeedCard.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import topBarStyles from '../components/TopBar.module.css';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLE_META_BY_KEY, ROLE_KEYS, listRoles } from '../lib/roleMeta.js';
import { agentDetailPath } from '../lib/agentDetailPath.js';
import { fetchReplayAgents, fetchReplayLog } from '../lib/replayLoader.js';
import { fetchGameBySessionId } from '../lib/archiveLoader.js';
import { parseGameData, aggregateCoStatus } from '../lib/parseGameData.js';
import { toggleInSet } from '../lib/toggleInSet.js';
import { useDeaths } from '../lib/useDeaths.js';
import { filterByAgents, filterByRoles, filterFeedEvents } from '../lib/feedFilter.js';
import { useViewerMode, viewerModeToggleLabel } from '../lib/useViewerMode.js';
import { phaseHeading } from '../lib/phaseHeading.js';
import styles from './SpectatorScreen.module.css';

// === 左ペイン ===
export function LeftPane({
  activeDay,
  setDay,
  activePhase,
  setPhase,
  days,
  agentNames,
  daySummary = {},
  gameOverDay = null,
  selectedAgents = new Set(),
  onToggleAgent = () => {},
  presentRoles = ROLE_KEYS,
  selectedRoles = new Set(),
  onToggleRole = () => {},
  thoughtsOpen = false,
  onToggleThoughts = () => {},
  viewerMode = 'spectator',
}) {
  const handlePhase = (d, phase) => {
    setDay(d);
    setPhase(phase);
  };

  return (
    <div className={styles.leftPaneInner}>
      <div className={styles.phaseNav}>
        <div className={styles.sectionLabel}>タイムライン</div>
        <div className={`${styles.dayBlock} ${activePhase === 'eve' ? styles.dayBlockActive : ''}`}>
          <div className={styles.phaseDay}>
            <h3>前夜</h3>
          </div>
          <div className={styles.phaseList}>
            <div
              className={`${styles.phaseItem} ${styles.phaseGameOver} ${activePhase === 'eve' ? styles.active : ''}`}
              onClick={() => { setDay(0); setPhase('eve'); }}
            >
              <span className={styles.dot} /> プロローグ
            </div>
          </div>
        </div>
        {days.map(d => (
          <div key={d} className={`${styles.dayBlock} ${activeDay === d ? styles.dayBlockActive : ''}`}>
            <div className={styles.phaseDay}>
              <h3>第 {d} 日</h3>
              {daySummary[d]?.nightActions?.find(a => a.event_type === 'night_attack') && (
                <div className={styles.deathline}>⚰ {daySummary[d].nightActions.find(a => a.event_type === 'night_attack').target}</div>
              )}
            </div>
            <div className={styles.phaseList}>
              <div
                className={`${styles.phaseItem} ${styles.phaseDiscuss} ${activeDay === d && activePhase === 'discuss' ? styles.active : ''}`}
                onClick={() => handlePhase(d, 'discuss')}
              >
                <span className={styles.dot} /> 議論フェーズ <span className={styles.phaseTurn}>{daySummary[d]?.speechCount != null ? `${daySummary[d].speechCount} 発言` : '発言'}</span>
              </div>
              <div
                className={`${styles.phaseItem} ${styles.phaseExec} ${activeDay === d && activePhase === 'vote' ? styles.active : ''}`}
                onClick={() => handlePhase(d, 'vote')}
              >
                <span className={styles.dot} /> 投票・処刑 <span className={styles.phaseTurn}>{daySummary[d]?.execResult?.target || '—'}</span>
              </div>
              {(daySummary[d]?.nightActions?.length > 0 || daySummary[d]?.nightDone) && (
                <div
                  className={`${styles.phaseItem} ${styles.phaseNight} ${activeDay === d && activePhase === 'night' ? styles.active : ''}`}
                  onClick={() => handlePhase(d, 'night')}
                >
                  <span className={styles.dot} /> 夜フェーズ <span className={styles.phaseTurn}>{daySummary[d]?.nightActions?.find(a => a.event_type === 'night_attack')?.target ?? ''}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {gameOverDay != null && (
          <div className={`${styles.dayBlock} ${activePhase === 'game_over' ? styles.dayBlockActive : ''}`}>
            <div className={styles.phaseDay}>
              <h3>最終日</h3>
            </div>
            <div className={styles.phaseList}>
              <div
                className={`${styles.phaseItem} ${styles.phaseGameOver} ${activePhase === 'game_over' ? styles.active : ''}`}
                onClick={() => { setDay(gameOverDay); setPhase('game_over'); }}
              >
                <span className={styles.dot} /> 勝敗結果
              </div>
            </div>
          </div>
        )}
      </div>
      <div className={styles.filt}>
        <div className={styles.sectionLabel}>参加者で絞る</div>
        <div className={styles.filtRow}>
          {agentNames.map(n => (
            <AvatarButton
              key={n}
              name={n}
              label={n}
              size="xs"
              layout="horizontal"
              selected={selectedAgents.has(n)}
              onClick={() => onToggleAgent(n)}
            />
          ))}
        </div>
        {viewerMode === 'spectator' && (
          <>
            <div className={styles.sectionLabel}>役職フィルタ</div>
            <div className={styles.filtRow}>
              {presentRoles.map(roleKey => {
                const roleDef = ROLE_META_BY_KEY[roleKey];
                if (!roleDef) return null;
                const selected = selectedRoles.has(roleKey);
                return (
                  <button
                    key={roleKey}
                    type="button"
                    className={`${styles.chip} ${selected ? styles.on : ''}`}
                    style={{ '--r-color': roleDef.color }}
                    aria-pressed={selected}
                    onClick={() => onToggleRole(roleKey)}
                  >
                    <span className={styles.swatch} style={{ background: roleDef.color }} /> {roleDef.ja}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {viewerMode === 'spectator' && (
          <>
            <div className={styles.sectionLabel}>表示</div>
            <div className={styles.filtRow}>
              <button
                type="button"
                className={`${styles.chip} ${thoughtsOpen ? styles.on : ''}`}
                aria-pressed={thoughtsOpen}
                onClick={onToggleThoughts}
              >
                思考ログ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const NIGHT_ACTION_ICON = { inspection: '🔮', guard: '🛡', night_attack: '🐺' };
const NIGHT_ACTION_LABEL = { inspection: '占い', guard: '護衛', night_attack: '襲撃' };

function CoStatusBoard({ coStatus, sessionId, viewerMode }) {
  return (
    <ul className={styles.coBoard} aria-label="カミングアウト状況">
      {listRoles()
        .map(roleDef => [roleDef.key, roleDef])
        .filter(([k]) => k !== 'Villager' && k !== 'Werewolf' && k !== 'Madman')
        .map(([roleKey, roleDef]) => {
          const coAgents = Object.entries(coStatus)
            .filter(([, cr]) => cr === roleKey)
            .map(([name]) => name);
          return (
            <li key={roleKey} className={styles.coRow} style={{ '--r-color': roleDef.color }}>
              <RoleTag role={roleKey} className={styles.coBoardRole} />
              <span className={styles.coName} style={{ color: coAgents.length ? 'var(--tx)' : 'var(--tx-3)' }}>
                {coAgents.length ? coAgents.map((name, i) => (
                  <span key={name}>
                    {i > 0 && ', '}
                    <AgentLink sessionId={sessionId} name={name} viewerMode={viewerMode}>
                      <Avatar name={name} size="xs" label={name} layout="horizontal" />
                    </AgentLink>
                  </span>
                )) : '未CO'}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

function NightActionsPanel({ nightActions, roleAssignment, sessionId, viewerMode, activeDay }) {
  return (
    <ul className={styles.actionList} aria-label={`Day ${activeDay} 夜の行動`}>
      {nightActions.map((a, i) => (
        <li key={i} className={`${styles.action} ${styles[a.event_type] || ''}`}>
          <div className={styles.actionIco}>{NIGHT_ACTION_ICON[a.event_type] || '・'}</div>
          <div className={styles.what}>
            <AgentLink sessionId={sessionId} name={a.agent} viewerMode={viewerMode}>
              <Avatar name={a.agent} size="xs" label={a.agent} layout="horizontal" />
            </AgentLink>
            {a.target && (
              <> → <AgentLink sessionId={sessionId} name={a.target} viewerMode={viewerMode} style={{ '--r-color': ROLE_META_BY_KEY[roleAssignment[a.target]]?.color }}>
                <Avatar name={a.target} size="xs" label={a.target} layout="horizontal" />
              </AgentLink></>
            )}
            <span style={{ color: 'var(--tx-4)', marginLeft: 6 }}>{NIGHT_ACTION_LABEL[a.event_type]}</span>
          </div>
        </li>
      ))}
      {nightActions.length === 0 && (
        <li className={styles.action} style={{ color: 'var(--tx-3)' }}>夜の行動ログなし</li>
      )}
    </ul>
  );
}

// === 右ペイン ===
export function RightPane({ agents, roleAssignment, coStatus = {}, daySummary = {}, activeDay, deaths = {}, viewerMode = 'spectator' }) {
  const { sessionId } = useParams();
  const order = Object.keys(agents);
  const activeDeadNames = new Set(Object.entries(deaths)
    .filter(([, death]) => death?.day <= activeDay)
    .map(([name]) => name));
  const deadNames = order.filter(n => activeDeadNames.has(n))
    .sort((a, b) => (deaths[a]?.day ?? 0) - (deaths[b]?.day ?? 0));
  const alive = order.filter(n => !activeDeadNames.has(n));

  const dayData = daySummary[activeDay];
  const nightActions = dayData?.nightActions ?? [];
  const execResult = dayData?.execResult ?? null;

  return (
    <div className={styles.roster}>
      <div className={styles.sectionLabel}>カミングアウト状況</div>
      <CoStatusBoard coStatus={coStatus} sessionId={sessionId} viewerMode={viewerMode} />

      <div className={styles.sectionLabel}>Day {activeDay} 夜の行動</div>
      <NightActionsPanel nightActions={nightActions} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} activeDay={activeDay} />

      {execResult && (
        <>
          <div className={styles.sectionLabel}>Day {activeDay} 処刑結果</div>
          <div className={styles.voteDetail}>
            <h4>
              処刑: <span className={styles.pill}>{execResult.target}</span>
            </h4>
            <div className={styles.voteGrid}>
              {execResult.voteTable.map((v, i) => (
                <div className={styles.voteCell} key={i}>
                  <AgentLink sessionId={sessionId} name={v.from} viewerMode={viewerMode}>
                    <Avatar name={v.from} size="xs" label={v.from} layout="horizontal" />
                  </AgentLink>
                  <span className={styles.voteArrow}>▶</span>
                  <AgentLink sessionId={sessionId} name={v.to} viewerMode={viewerMode}>
                    <Avatar name={v.to} size="xs" label={v.to} layout="horizontal" variant={v.to === execResult.target ? 'danger' : 'plain'} />
                  </AgentLink>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={styles.sectionLabel}>
        参加エージェント
        <span style={{ float: 'right', color: 'var(--tx-4)' }}>{alive.length} / {order.length} 生存</span>
      </div>

      <section className={styles.rosterSection} aria-labelledby="roster-alive-heading">
        <h4 id="roster-alive-heading">生存 <span className={styles.count}>{alive.length}</span></h4>
        <ul className={styles.rosterList} aria-label="生存エージェント">
          {alive.map(n => (
            <AgentRosterRow
              key={n}
              name={n}
              role={roleAssignment[n]}
              to={agentDetailPath(sessionId, n, viewerMode)}
              showRole={viewerMode === 'spectator'}
              coRole={coStatus[n]}
            />
          ))}
        </ul>
      </section>

      <section className={styles.rosterSection} aria-labelledby="roster-dead-heading">
        <h4 id="roster-dead-heading">死亡者 <span className={styles.count}>{deadNames.length}</span></h4>
        <ul className={styles.rosterList} aria-label="死亡者">
          {deadNames.map(n => (
            <AgentRosterRow
              key={n}
              name={n}
              role={roleAssignment[n]}
              to={agentDetailPath(sessionId, n, viewerMode)}
              showRole={viewerMode === 'spectator'}
              dead
              deathMeta={deaths[n]}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

// --- リプレイ fetch state（sessionId ごとに key 再マウントし、fetch state を新規化する） ---
function SpectatorReplayData({
  sessionId,
  viewerMode,
  navigate,
  toggleViewerMode,
  activeDay,
  setActiveDay,
  activePhase,
  setActivePhase,
  selectedAgents,
  toggleAgentFilter,
  selectedRoles,
  toggleRoleFilter,
  thoughtsOpen,
  toggleThoughtsOpen,
}) {
  const [replayEvents, setReplayEvents] = useState(null);
  const [replayAgents, setReplayAgents] = useState({});
  const [replayDaySummary, setReplayDaySummary] = useState({});
  const [gameOverDay, setGameOverDay] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // #595: この fetch effect の共通フック化（useAsyncData）を検討したが、効果が無いと判断して見送った。
  // 理由: 1 effect 内で index+agents と replay log の2本を並行 fetch し、loading フラグ2本
  // （loadingEvents / loadingAgents）を独立に管理しつつ error は共有し、さらに成功時に
  // setActiveDay / setActivePhase という親 state への副作用を持つ。この形は汎用フックの
  // { data, loading, error } に収まらず、無理に収めると呼び出し側にフラグの復元分岐が生えて
  // かえって読みにくくなる。再検出時はこのコメントを判断材料にすること。
  useEffect(() => {
    let cancelled = false;

    fetchGameBySessionId(sessionId)
      .then(entry => fetchReplayAgents({ sessionId, cast: entry.cast ?? [] }))
      .then(agentJsonByName => {
        if (cancelled) return;
        setReplayAgents(parseGameData('', agentJsonByName).agents);
      })
      .catch(error => {
        if (!cancelled) setLoadError(error);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false);
      });

    fetchReplayLog({ sessionId })
      .then(jsonlText => {
        if (cancelled) return;
        const parsed = parseGameData(jsonlText);
        setReplayEvents(parsed.events);
        setReplayDaySummary(parsed.daySummary);
        const goEvent = parsed.events.find(e => e.event_type === 'game_over');
        if (goEvent) setGameOverDay(goEvent.day);
        const firstDay = parsed.events.find(event => event.day)?.day;
        if (firstDay) { setActiveDay(firstDay); setActivePhase('discuss'); }
      })
      .catch(error => {
        if (!cancelled) setLoadError(error);
      })
      .finally(() => {
        if (!cancelled) setLoadingEvents(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, setActiveDay, setActivePhase]);

  const events = useMemo(() => replayEvents ?? [], [replayEvents]);
  const replayDeaths = useDeaths(replayEvents);
  const agents = replayAgents;
  const daySummary = replayDaySummary;
  const roleAssignment = useMemo(() => Object.fromEntries(
    Object.entries(agents).map(([name, agent]) => [name, agent.role])
  ), [agents]);
  const presentRoles = useMemo(() => {
    const presentRoleSet = new Set(Object.values(roleAssignment));
    return ROLE_KEYS.filter(roleKey => presentRoleSet.has(roleKey));
  }, [roleAssignment]);
  const replayCoStatus = useMemo(() => aggregateCoStatus(events, activeDay), [events, activeDay]);
  const agentNames = Object.keys(agents);
  const visibleDays = [...new Set(events.filter(e => e.event_type !== 'game_over').map(e => e.day).filter(Boolean))].sort((a, b) => a - b);

  const prevById = {};
  events.forEach(e => {
    if (e.speech_id != null) prevById[`${e.day}-${e.speech_id}`] = e;
  });

  const phaseFilteredEvents = filterFeedEvents(events, activeDay, activePhase);
  const agentFilteredEvents = filterByAgents(phaseFilteredEvents, selectedAgents);
  const feedEvents = viewerMode === 'public'
    ? agentFilteredEvents
    : filterByRoles(agentFilteredEvents, selectedRoles, roleAssignment);
  const speechCount = events.filter(e => e.event_type === 'speech').length;
  const coCount = Object.keys(replayCoStatus).length;

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[{ label: 'r/agent-jinrou', to: '/' }, { label: sessionId }, { label: phaseHeading(activeDay, activePhase) }]}>
        <TopBarBtn onClick={() => navigate('/')}>← 一覧</TopBarBtn>
        <TopBarBtn><span className={topBarStyles.liveDot} /> REPLAY</TopBarBtn>
        <TopBarBtn>同時観戦 142</TopBarBtn>
        <TopBarBtn onClick={toggleViewerMode}>
          {viewerModeToggleLabel(viewerMode)}
        </TopBarBtn>
        <TopBarBtn>⤓ 全ログDL</TopBarBtn>
        <TopBarBtn primary>★ 応援</TopBarBtn>
      </TopBar>

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane activeDay={activeDay} setDay={setActiveDay} activePhase={activePhase} setPhase={setActivePhase} days={visibleDays} agentNames={agentNames} daySummary={daySummary} gameOverDay={gameOverDay} selectedAgents={selectedAgents} onToggleAgent={toggleAgentFilter} presentRoles={presentRoles} selectedRoles={selectedRoles} onToggleRole={toggleRoleFilter} thoughtsOpen={thoughtsOpen} onToggleThoughts={toggleThoughtsOpen} viewerMode={viewerMode} />}
        right={<RightPane agents={agents} roleAssignment={roleAssignment} coStatus={replayCoStatus} daySummary={daySummary} activeDay={activeDay} deaths={replayDeaths} viewerMode={viewerMode} />}
      >
        <div className={styles.feedHead}>
          <h2>{phaseHeading(activeDay, activePhase)} <small>{sessionId}</small></h2>
          <span className={styles.stat}>発言 <strong>{speechCount}</strong></span>
          <span className={styles.stat}>CO <strong>{coCount}</strong></span>
          <span className={styles.spacer} />
          <TopBarBtn>⇅ 新しい順</TopBarBtn>
          <TopBarBtn>🔍 検索</TopBarBtn>
        </div>
        <div className={styles.feed}>
          {loadError && (
            <SystemRow kind="death" label="読み込みエラー">
              {loadError.message}
            </SystemRow>
          )}
          {(loadingEvents || loadingAgents) && (
            <SystemRow kind="phase" label="読み込み中">
              {loadingAgents ? '参加者情報を読み込み中。' : ''}
              {loadingEvents ? '発言ログを読み込み中。' : ''}
            </SystemRow>
          )}
          {feedEvents.map((e, i) => (
            <FeedItem
              key={e.id || `${e.day}-${e.event_type}-${e.agent}-${e.speech_id}-${i}`}
              ev={e}
              prevById={prevById}
              roleAssignment={roleAssignment}
              sessionId={sessionId}
              viewerMode={viewerMode}
              bulkThoughtsOpen={thoughtsOpen}
            />
          ))}
        </div>
      </ThreePaneLayout>
    </div>
  );
}

// === メイン観戦画面 ===
export default function SpectatorScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { viewerMode, toggleViewerMode } = useViewerMode();
  const [activeDay, setActiveDay] = useState(2);
  const [activePhase, setActivePhase] = useState('discuss');
  const [selectedAgents, setSelectedAgents] = useState(() => new Set());
  const [selectedRoles, setSelectedRoles] = useState(() => new Set());
  const [thoughtsOpen, setThoughtsOpen] = useState(false);

  const toggleAgentFilter = (agentName) => {
    setSelectedAgents(current => toggleInSet(current, agentName));
  };

  const toggleRoleFilter = (roleKey) => {
    setSelectedRoles(current => toggleInSet(current, roleKey));
  };

  const toggleThoughtsOpen = () => {
    setThoughtsOpen(current => !current);
  };

  return (
    <SpectatorReplayData
      key={sessionId}
      sessionId={sessionId}
      viewerMode={viewerMode}
      navigate={navigate}
      toggleViewerMode={toggleViewerMode}
      activeDay={activeDay}
      setActiveDay={setActiveDay}
      activePhase={activePhase}
      setActivePhase={setActivePhase}
      selectedAgents={selectedAgents}
      toggleAgentFilter={toggleAgentFilter}
      selectedRoles={selectedRoles}
      toggleRoleFilter={toggleRoleFilter}
      thoughtsOpen={thoughtsOpen}
      toggleThoughtsOpen={toggleThoughtsOpen}
    />
  );
}

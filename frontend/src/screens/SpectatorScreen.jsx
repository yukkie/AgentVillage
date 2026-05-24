import { useEffect, useMemo, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import RoleTag from '../components/RoleTag.jsx';
import TopBar, { TopBarBtn, topBarStyles } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLES } from '../lib/constants.js';
import { fetchReplayAgents, fetchReplayLog } from '../lib/replayLoader.js';
import { parseGameData, aggregateCoStatus, aggregateDayActions, computeDeadByDay } from '../lib/parseGameData.js';
import { filterFeedEvents } from '../lib/feedFilter.js';
import styles from './SpectatorScreen.module.css';

const MISSING_CONTENT = '[missing content]';

// --- ユーティリティ ---
function fmtTurn(day, speechId) {
  return `D${day}-${String(speechId).padStart(2, '0')}`;
}
function fmtTime(day, speechId) {
  const base = 10 * 60 + (day - 1) * 90 + speechId * 3;
  return `${String(Math.floor(base / 60)).padStart(2, '0')}:${String(base % 60).padStart(2, '0')}`;
}
function Mentioned({ text }) {
  return text.split(/(@\w+)/g).map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className={styles.mention}>{p}</span>
      : p
  );
}

function ThoughtDetails({ reasoning }) {
  if (!reasoning) return null;

  return (
    <details className={styles.spThink}>
      <summary>
        <svg className={styles.bubbleIco} width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H7.5L4.7 13.4a.4.4 0 0 1-.7-.28V11H3.5C2.67 11 2 10.33 2 9.5v-6Z"
            stroke="currentColor" strokeWidth="1.2"
          />
          <circle cx="5.5" cy="6.5" r="0.7" fill="currentColor" />
          <circle cx="8"   cy="6.5" r="0.7" fill="currentColor" />
          <circle cx="10.5" cy="6.5" r="0.7" fill="currentColor" />
        </svg>
        <span className={styles.thinkLabel}>思考ログを読む</span>
        <span className={styles.conf}>{reasoning.length} 字 · spectator限定</span>
      </summary>
      <div className={styles.thinkBody}>
        {reasoning.slice(0, 380)}{reasoning.length > 380 ? '…' : ''}
      </div>
    </details>
  );
}

// --- 発言カード ---
function SpeechCard({ ev, prevById, roleAssignment }) {
  const role = roleAssignment[ev.agent];
  const r = ROLES[role];
  const replied = ev.reply_to ? prevById[`${ev.day}-${ev.reply_to}`] : null;
  const isWolf = role === 'Werewolf';

  return (
    <div
      className={`${styles.speech} ${isWolf ? styles.speechWolf : ''}`}
      style={{ '--r-color': r?.color }}
    >
      <Avatar name={ev.agent} role={role} />
      <div className={styles.vert} />
      <div>
        <div className={styles.spHead}>
          <span className={styles.name}>{ev.agent}</span>
          <span className={styles.turn}>{fmtTurn(ev.day, ev.speech_id || 0)}</span>
          <RoleTag role={role} />
          {ev.claimed_role && (
            <span className={styles.coBadge}>
              ▶ {ROLES[ev.claimed_role]?.ja || ev.claimed_role} CO
            </span>
          )}
          <span className={styles.ts}>{fmtTime(ev.day, ev.speech_id || 0)}</span>
        </div>
        {replied && (
          <div className={styles.spQuote}>
            <div className={styles.qhead}>▶ {replied.agent} #{replied.speech_id} への返信</div>
            <div>{replied.content.slice(0, 90)}{replied.content.length > 90 ? '…' : ''}</div>
          </div>
        )}
        <div className={styles.spBody}>
          <Mentioned text={ev.content} />
        </div>
        <ThoughtDetails reasoning={ev.reasoning} />
      </div>
    </div>
  );
}

function logContent(ev) {
  return ev.content || MISSING_CONTENT;
}

const SYSTEM_EVENT_VIEWS = {
  vote: {
    kind: 'exec',
    label: '投票',
    leftName: ev => ev.agent,
    rightName: ev => ev.target,
    reasoning: ev => ev.reasoning,
  },
  elimination: {
    kind: 'death',
    icon: '💀',
    label: '処刑',
    rightName: ev => ev.agent,
  },
  medium_result: {
    kind: 'gm',
    icon: '👁',
    label: '霊媒結果',
    leftName: ev => ev.agent,
    rightName: ev => ev.target,
    reasoning: ev => ev.reasoning,
  },
  inspection: {
    kind: 'gm',
    icon: '🔮',
    label: '占い結果',
    leftName: ev => ev.agent,
    rightName: ev => ev.target,
    reasoning: ev => ev.reasoning,
  },
  guard: {
    kind: 'gm',
    icon: '🛡',
    label: '護衛',
    leftName: ev => ev.agent,
    rightName: ev => ev.target,
    reasoning: ev => ev.reasoning,
  },
};

function renderConfiguredSystemEvent(ev, roleAssignment) {
  const view = SYSTEM_EVENT_VIEWS[ev.event_type];
  if (!view) return null;

  return (
    <SystemRow
      kind={view.kind}
      icon={view.icon}
      label={view.label}
      reasoning={view.reasoning?.(ev)}
      leftName={view.leftName?.(ev)}
      rightName={view.rightName?.(ev)}
      roleAssignment={roleAssignment}
    >
      {logContent(ev)}
    </SystemRow>
  );
}

// --- システム行 ---
function SystemRow({ kind, icon, label, children, reasoning, ts, leftName, rightName, roleAssignment = {} }) {
  const defaultIcon = { gm: '👁', death: '💀', exec: '⚑', phase: '☾' }[kind] || '⌘';
  return (
    <div className={`${styles.sysrow} ${styles[kind] || ''}`}>
      <div className={styles.sysIconCol}>
        <div className={styles.sysIcon}>{icon ?? defaultIcon}</div>
        <div className={styles.sysLabel}>{label}</div>
      </div>
      <div className={styles.sysContent}>
        <div className={styles.sysMain}>
          {leftName && (
            <Avatar name={leftName} role={roleAssignment[leftName]} size="xs" />
          )}
          <div className={styles.sysText}>{children}</div>
          {ts && <div className={styles.sysTs}>{ts}</div>}
          {rightName && (
            <Avatar name={rightName} role={roleAssignment[rightName]} size="xs" />
          )}
        </div>
        <ThoughtDetails reasoning={reasoning} />
      </div>
    </div>
  );
}

// --- 人狼会話カード ---
function WolfChatCard({ ev }) {
  return (
    <div className={`${styles.speech} ${styles.wolfChat}`}>
      <Avatar name={ev.agent} />
      <div className={styles.vert} />
      <div>
        <div className={styles.spHead}>
          <span className={styles.name}>{ev.agent}</span>
        </div>
        <div className={styles.spBody}>{ev.content}</div>
        <ThoughtDetails reasoning={ev.reasoning} />
      </div>
    </div>
  );
}

// --- フィードアイテム ---
export function FeedItem({ ev, prevById, roleAssignment, title }) {
  if (ev.event_type === 'speech') return <SpeechCard ev={ev} prevById={prevById} roleAssignment={roleAssignment} />;
  if (ev.event_type === 'wolf_chat') return <WolfChatCard ev={ev} />;

  const configuredSystemEvent = renderConfiguredSystemEvent(ev, roleAssignment);
  if (configuredSystemEvent) return configuredSystemEvent;

  if (ev.event_type === 'guard_block') {
    return ev.is_public
      ? <SystemRow kind="gm" icon="🛡" label="護衛">{logContent(ev)}</SystemRow>
      : <SystemRow kind="gm" icon="🛡" label="護衛成功" rightName={ev.target} roleAssignment={roleAssignment}>{logContent(ev)}</SystemRow>;
  }
  if (ev.event_type === 'night_attack') {
    const victim = ev.target;
    return ev.is_public
      ? <SystemRow kind="death" icon="💀" label="襲撃結果" rightName={victim} roleAssignment={roleAssignment}>{logContent(ev)}</SystemRow>
      : <SystemRow kind="exec" icon="🐺" label="人狼の襲撃" rightName={ev.target} roleAssignment={roleAssignment}>{logContent(ev)}</SystemRow>;
  }

  if (ev.event_type === 'phase_start') {
    if (ev.phase === 'init') {
      return (
        <SystemRow kind="gm" label="ゲームマスター" ts="10:00">
          <strong>{title || 'Archived Game'}</strong> が開始されました。
        </SystemRow>
      );
    }
    if (ev.phase === 'day_vote' || ev.phase === 'night' || ev.phase === 'night_wolf_chat' || ev.phase === 'pre_night') return null;
    if (ev.phase === 'day_opening' || ev.phase === 'day_discussion') return null;
    return <SystemRow kind="phase" label="フェーズ">{ev.content}</SystemRow>;
  }
  return null;
}

// === 左ペイン ===
export function LeftPane({ activeDay, setDay, activePhase, setPhase, days, agentNames, daySummary, dayActions = {} }) {
  const handlePhase = (d, phase) => {
    setDay(d);
    setPhase(phase);
  };

  return (
    <>
      <div className={styles.phaseNav}>
        <div className={styles.sectionLabel}>タイムライン</div>
        {days.map(d => (
          <div key={d}>
            <div className={styles.phaseDay}>
              <h3>第 {d} 日 <small>{d === 1 ? '初日' : d === 2 ? '荒れる' : '進行中'}</small></h3>
              {dayActions[d]?.nightActions?.find(a => a.event_type === 'night_attack') && (
                <div className={styles.deathline}>⚰ {dayActions[d].nightActions.find(a => a.event_type === 'night_attack').target}</div>
              )}
            </div>
            <div className={styles.phaseList}>
              <div
                className={`${styles.phaseItem} ${styles.phaseDiscuss} ${activeDay === d && activePhase === 'discuss' ? styles.active : ''}`}
                onClick={() => handlePhase(d, 'discuss')}
              >
                <span className={styles.dot} /> 議論フェーズ <span className={styles.phaseTurn}>12 発言</span>
              </div>
              <div
                className={`${styles.phaseItem} ${styles.phaseExec} ${activeDay === d && activePhase === 'vote' ? styles.active : ''}`}
                onClick={() => handlePhase(d, 'vote')}
              >
                <span className={styles.dot} /> 投票・処刑 <span className={styles.phaseTurn}>{daySummary[d]?.target || '—'}</span>
              </div>
              <div
                className={`${styles.phaseItem} ${styles.phaseNight} ${activeDay === d && activePhase === 'night' ? styles.active : ''}`}
                onClick={() => handlePhase(d, 'night')}
              >
                <span className={styles.dot} /> 夜フェーズ <span className={styles.phaseTurn}>{daySummary[d]?.nightDone ? '完了' : '進行中'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.filt}>
        <div className={styles.sectionLabel}>参加者で絞る</div>
        <div className={styles.filtRow}>
          {agentNames.slice(0, 8).map(n => (
            <button key={n} className={styles.chip}>
              <Avatar name={n} size="xs" /> {n}
            </button>
          ))}
        </div>
        <div className={styles.sectionLabel}>役職フィルタ</div>
        <div className={styles.filtRow}>
          {Object.entries(ROLES).map(([k, v]) => (
            <button key={k} className={styles.chip} style={{ '--r-color': v.color }}>
              <span className={styles.swatch} style={{ background: v.color }} /> {v.ja}
            </button>
          ))}
        </div>
        <div className={styles.sectionLabel}>表示</div>
        <div className={styles.filtRow}>
          <button className={`${styles.chip} ${styles.on}`}>発言</button>
          <button className={`${styles.chip} ${styles.on}`}>投票</button>
          <button className={`${styles.chip} ${styles.on}`}>CO</button>
          <button className={styles.chip}>夜の行動</button>
          <button className={styles.chip}>思考ログ</button>
        </div>
      </div>
    </>
  );
}

const NIGHT_ACTION_ICON = { inspection: '🔮', guard: '🛡', night_attack: '🐺' };
const NIGHT_ACTION_LABEL = { inspection: '占い', guard: '護衛', night_attack: '襲撃' };

// TODO(#314): public モードでは真の役職タグを非表示にし、CO役職のみ表示する
// === 右ペイン ===
export function RightPane({ agents, roleAssignment, coStatus = {}, dayActions = {}, activeDay, deadByDay = {}, viewerMode = 'spectator' }) {
  const order = Object.keys(agents);
  const activeDead = deadByDay[activeDay] ?? new Map();
  const deadNames = order.filter(n => activeDead.has(n))
    .sort((a, b) => (activeDead.get(a)?.day ?? 0) - (activeDead.get(b)?.day ?? 0));
  const alive = order.filter(n => !activeDead.has(n));

  const dayData = dayActions[activeDay];
  const nightActions = dayData?.nightActions ?? [];
  const execResult = dayData?.execResult ?? null;

  return (
    <div className={styles.roster}>
      <div className={styles.sectionLabel}>カミングアウト状況</div>
      <div className={styles.coBoard}>
        {Object.entries(ROLES)
          .filter(([k]) => k !== 'Villager' && k !== 'Werewolf' && k !== 'Madman')
          .map(([roleKey, roleDef]) => {
            const coAgents = Object.entries(coStatus)
              .filter(([, cr]) => cr === roleKey)
              .map(([name]) => name);
            return (
              <div key={roleKey} className={styles.coRow} style={{ '--r-color': roleDef.color }}>
                <span className={styles.coRole}>{roleDef.ja}</span>
                <span className={styles.coName} style={{ color: coAgents.length ? 'var(--tx)' : 'var(--tx-3)' }}>
                  {coAgents.length ? coAgents.join(', ') : '未CO'}
                </span>
              </div>
            );
          })}
      </div>

      <div className={styles.sectionLabel}>Day {activeDay} 夜の行動</div>
      <div className={styles.actionList}>
        {nightActions.map((a, i) => (
          <div key={i} className={`${styles.action} ${styles[a.event_type] || ''}`}>
            <div className={styles.actionIco}>{NIGHT_ACTION_ICON[a.event_type] || '・'}</div>
            <div className={styles.what}>
              <strong>{a.agent}</strong>
              {a.target && <> → <em style={{ '--r-color': ROLES[roleAssignment[a.target]]?.color }}>{a.target}</em></>}
              <span style={{ color: 'var(--tx-4)', marginLeft: 6 }}>{NIGHT_ACTION_LABEL[a.event_type]}</span>
            </div>
          </div>
        ))}
        {nightActions.length === 0 && (
          <div className={styles.action} style={{ color: 'var(--tx-3)' }}>夜の行動ログなし</div>
        )}
      </div>

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
                  <Avatar name={v.from} size="xs" />
                  <span className={styles.voteFrom}>{v.from}</span>
                  <span className={styles.voteArrow}>▶</span>
                  <span className={v.to === execResult.target ? styles.targetBad : styles.voteTo}>{v.to}</span>
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

      <div className={styles.rosterSection}>
        <h4>生存 <span className={styles.count}>{alive.length}</span></h4>
        {alive.map(n => {
          const role = roleAssignment[n];
          const r = ROLES[role];
          const coRole = coStatus[n];
          return (
            <div key={n} className={styles.rosterRow} style={{ '--r-color': r?.color }}>
              <Avatar name={n} role={role} size="sm" />
              <div className={styles.who}>
                <span className={styles.rosterName}>
                  {n}
                  {/* spectator mode: true role tag always shown; TODO(#314): hide in public mode */}
                  {viewerMode === 'spectator' && <RoleTag role={role} />}
                  {coRole && (
                    <span className={styles.coBadge}>▶ {ROLES[coRole]?.ja || coRole} CO</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.rosterSection}>
        <h4>死亡者 <span className={styles.count}>{deadNames.length}</span></h4>
        {deadNames.map(n => {
          const role = roleAssignment[n];
          const r = ROLES[role];
          const meta = activeDead.get(n);
          return (
            <div key={n} className={`${styles.rosterRow} ${styles.dead}`} style={{ '--r-color': r?.color }}>
              <Avatar name={n} role={role} size="sm" dead />
              <div className={styles.whoMeta}>
                <div className={styles.whoBlock}>
                  <span className={styles.rosterName}>{n}</span>
                  <span className={styles.sub}>
                    <RoleTag role={role} />
                  </span>
                </div>
                {meta && (
                  <span className={styles.deathReason}>Day {meta.day} · {meta.content}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === メイン観戦画面 ===
// TODO(#314): viewerMode の切り替えUI（spectator/public トグル）を追加する
export default function SpectatorScreen({ sessionId, cast = [], title, onBack }) {
  const [activeDay, setActiveDay] = useState(2);
  const [activePhase, setActivePhase] = useState('discuss');
  const [replayEvents, setReplayEvents] = useState(null);
  const [replayAgents, setReplayAgents] = useState({});
  const [replayDaySummary, setReplayDaySummary] = useState(null);
  const [replayDayActions, setReplayDayActions] = useState({});
  const [replayDeadByDay, setReplayDeadByDay] = useState({});
  const [loadingEvents, setLoadingEvents] = useState(Boolean(sessionId));
  const [loadingAgents, setLoadingAgents] = useState(Boolean(sessionId));
  const [loadError, setLoadError] = useState(null);
  // TODO(#314): public モード切り替えUIを追加したらここで toggle する
  const viewerMode = 'spectator';

  useEffect(() => {
    if (!sessionId) return undefined;

    let cancelled = false;
    setReplayEvents(null);
    setReplayAgents({});
    setReplayDaySummary(null);

    setReplayDayActions({});
    setReplayDeadByDay({});
    setLoadingEvents(true);
    setLoadingAgents(true);
    setLoadError(null);

    fetchReplayAgents({ sessionId, cast })
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

        setReplayDayActions(aggregateDayActions(parsed.events));
        setReplayDeadByDay(computeDeadByDay(parsed.events));
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
  }, [sessionId, cast]);

  const events = replayEvents ?? [];
  const agents = replayAgents;
  const daySummary = replayDaySummary ?? {};
  const roleAssignment = useMemo(() => Object.fromEntries(
    Object.entries(agents).map(([name, agent]) => [name, agent.role])
  ), [agents]);
  const replayCoStatus = useMemo(() => aggregateCoStatus(events, activeDay), [events, activeDay]);
  const agentNames = Object.keys(agents);
  const visibleDays = [...new Set(events.map(event => event.day).filter(Boolean))].sort((a, b) => a - b);

  const prevById = {};
  events.forEach(e => {
    if (e.speech_id != null) prevById[`${e.day}-${e.speech_id}`] = e;
  });

  const feedEvents = filterFeedEvents(events, activeDay, activePhase);
  const speechCount = events.filter(e => e.event_type === 'speech').length;
  const coCount = Object.keys(replayCoStatus).length;

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[{ label: '観戦' }, { label: title || sessionId || '第13回 桜霞村' }, { label: `Day ${activeDay} ${{ discuss: '議論', vote: '投票・処刑', night: '夜フェーズ' }[activePhase]}` }]}>
        {onBack && <TopBarBtn onClick={onBack}>← 一覧</TopBarBtn>}
        <TopBarBtn><span className={topBarStyles.liveDot} /> REPLAY</TopBarBtn>
        <TopBarBtn>同時観戦 142</TopBarBtn>
        <TopBarBtn>⤓ 全ログDL</TopBarBtn>
        <TopBarBtn primary>★ 応援</TopBarBtn>
      </TopBar>

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane activeDay={activeDay} setDay={setActiveDay} activePhase={activePhase} setPhase={setActivePhase} days={visibleDays} agentNames={agentNames} daySummary={daySummary} dayActions={replayDayActions} />}
        right={<RightPane agents={agents} roleAssignment={roleAssignment} coStatus={replayCoStatus} dayActions={replayDayActions} activeDay={activeDay} deadByDay={replayDeadByDay} viewerMode={viewerMode} />}
      >
        <div className={styles.feedHead}>
          <h2>Day {activeDay} {{ discuss: '議論', vote: '投票・処刑', night: '夜フェーズ' }[activePhase]} <small>{sessionId ? sessionId : '3:47 経過 / 残り 4:13'}</small></h2>
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
              title={title || sessionId}
            />
          ))}
        </div>
      </ThreePaneLayout>
    </div>
  );
}

import { useState } from 'react';
import AgentLink from './AgentLink.jsx';
import Avatar from './Avatar.jsx';
import RoleTag from './RoleTag.jsx';
import { ROLE_META_BY_KEY } from '../lib/roleMeta.js';
import styles from './FeedCard.module.css';

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

function ThoughtDetails({ reasoning, viewerMode = 'spectator', bulkOpen = false }) {
  // bulkOpen が変わるたびに開閉状態をリセットしたいので、key として渡して再マウントさせる
  // （useEffect 内 setState だとマウント後の余分な再レンダーを招くため避ける）。
  const [open, setOpen] = useState(bulkOpen);

  if (!reasoning) return null;

  if (viewerMode === 'public') {
    return <span className={styles.lockBadge}>🔒 思考ログ</span>;
  }

  return (
    <details className={styles.spThink} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
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
function SpeechCard({ ev, prevById, roleAssignment, sessionId, viewerMode = 'spectator', bulkThoughtsOpen = false }) {
  const role = roleAssignment[ev.agent];
  const r = ROLE_META_BY_KEY[role];
  const replied = ev.reply_to ? prevById[`${ev.day}-${ev.reply_to}`] : null;
  const isWolf = role === 'Werewolf';
  const isPublic = viewerMode === 'public';
  const coedRole = ev.claimed_role;
  const coColor = coedRole ? ROLE_META_BY_KEY[coedRole]?.color : undefined;

  return (
    <article
      className={`${styles.speech} ${isWolf ? styles.speechWolf : ''}`}
      style={{ '--r-color': r?.color }}
      aria-label={`${ev.agent} ${fmtTurn(ev.day, ev.speech_id || 0)} ${fmtTime(ev.day, ev.speech_id || 0)}`}
    >
      <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}>
        <Avatar name={ev.agent} role={isPublic ? undefined : role} />
      </AgentLink>
      <div className={styles.vert} />
      <div>
        <div className={styles.spHead}>
          <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}><span className={styles.name}>{ev.agent}</span></AgentLink>
          <span className={styles.turn}>{fmtTurn(ev.day, ev.speech_id || 0)}</span>
          {!isPublic && <RoleTag role={role} />}
          {coedRole && (
            <span className={styles.coBadge} style={{ '--co-color': coColor }}>
              ▶ {ROLE_META_BY_KEY[coedRole]?.ja || coedRole} CO
            </span>
          )}
          <time className={styles.ts}>{fmtTime(ev.day, ev.speech_id || 0)}</time>
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
        <ThoughtDetails key={String(bulkThoughtsOpen)} reasoning={ev.reasoning} viewerMode={viewerMode} bulkOpen={bulkThoughtsOpen} />
      </div>
    </article>
  );
}

function AgentEpisodeCard({ ev, roleAssignment, sessionId, viewerMode = 'spectator', label = '役職割り当て' }) {
  const role = roleAssignment[ev.agent];
  const r = ROLE_META_BY_KEY[role];
  const isPublic = viewerMode === 'public';

  return (
    <article
      className={styles.agentEpisode}
      style={{ '--r-color': r?.color }}
      aria-label={`${ev.agent} ${label}`}
    >
      <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}>
        <Avatar name={ev.agent} role={isPublic ? undefined : role} />
      </AgentLink>
      <div className={styles.vert} />
      <div>
        <div className={styles.spHead}>
          <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}><span className={styles.name}>{ev.agent}</span></AgentLink>
          <span className={styles.turn}>{label}</span>
          {!isPublic && <RoleTag role={role} />}
        </div>
        <div className={styles.spBody}>
          <Mentioned text={contentForViewer(ev, viewerMode)} />
        </div>
      </div>
    </article>
  );
}

// Unified viewerMode-aware content selector for all event types.
// spectator mode uses spectator_content when available; public mode always uses content.
function contentForViewer(ev, viewerMode) {
  if (viewerMode === 'spectator' && ev.spectator_content) return ev.spectator_content;
  return ev.content || MISSING_CONTENT;
}

function scoreEntries(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return [];
  return Object.entries(snapshot)
    .filter(([, value]) => Number.isFinite(value))
    .sort(([, a], [, b]) => b - a);
}

function scorePercent(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function scoreSeverity(value) {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function RelationshipMeterList({ snapshot, metric }) {
  const entries = scoreEntries(snapshot);

  return (
    <ul className={`${styles.scoreList} ${styles[metric]}`} aria-label={`${metric} snapshot`}>
      {entries.map(([name, value]) => {
        const percent = scorePercent(value);
        const severity = scoreSeverity(value);
        return (
          <li
            key={name}
            className={`${styles.scoreItem} ${styles[severity]}`}
            aria-label={`${name} ${metric} ${percent}%`}
            title={`${name}: ${value.toFixed(2)}`}
          >
            <span className={styles.scoreName}>{name}</span>
            <span className={styles.scoreTrack} aria-hidden="true">
              <span className={styles.scoreFill} style={{ width: `${percent}%` }} />
            </span>
            <span className={styles.scoreSeverity}>{severity}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ScoreOwnerChip({ name, role }) {
  return <Avatar name={name} role={role} size="xs" label={name} layout="vertical" />;
}

function RelationshipUpdateRow({ ev, roleAssignment, sessionId, viewerMode }) {
  const isThreat = ev.event_type === 'threat_update';
  const metric = isThreat ? 'threat' : 'suspicion';
  const snapshot = isThreat ? ev.threat_snapshot : ev.suspicion_snapshot;
  const label = isThreat ? '脅威' : '疑念';
  const entries = scoreEntries(snapshot);
  const displayContent = contentForViewer(ev, viewerMode);

  if (entries.length === 0) {
    return (
      <SystemRow
        kind={isThreat ? 'exec' : 'gm'}
        icon={isThreat ? '!' : '?'}
        label={label}
        roleAssignment={roleAssignment}
        sessionId={sessionId}
        viewerMode={viewerMode}
      >
        <div className={styles.scoreFallback}>
          <ScoreOwnerChip name={ev.agent} role={roleAssignment[ev.agent]} />
          <span>{displayContent}</span>
        </div>
      </SystemRow>
    );
  }

  return (
    <SystemRow
      kind={isThreat ? 'exec' : 'gm'}
      icon={isThreat ? '!' : '?'}
      label={label}
      roleAssignment={roleAssignment}
      sessionId={sessionId}
      viewerMode={viewerMode}
    >
      <div className={styles.scoreSnapshot}>
        <ScoreOwnerChip name={ev.agent} role={roleAssignment[ev.agent]} />
        <div className={styles.scoreBody}>
          <RelationshipMeterList snapshot={snapshot} metric={metric} />
          {ev.content && <div className={styles.deltaTrace}>{displayContent}</div>}
        </div>
      </div>
    </SystemRow>
  );
}

const SYSTEM_EVENT_VIEWS = {
  vote: {
    kind: 'exec',
    label: '投票',
    leftName: ev => ev.agent,
    rightName: ev => ev.target,
    // Legacy-Adapter: old logs store vote strategy in decision; new logs use vote_strategy.
    strategy: ev => ev.vote_strategy || ev.decision || null,
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

function renderConfiguredSystemEvent(ev, roleAssignment, sessionId, viewerMode, bulkThoughtsOpen) {
  const view = SYSTEM_EVENT_VIEWS[ev.event_type];
  if (!view) return null;

  return (
    <SystemRow
      kind={view.kind}
      icon={view.icon}
      label={view.label}
      strategy={view.strategy?.(ev)}
      reasoning={view.reasoning?.(ev)}
      leftName={view.leftName?.(ev)}
      rightName={view.rightName?.(ev)}
      roleAssignment={roleAssignment}
      sessionId={sessionId}
      viewerMode={viewerMode}
      bulkThoughtsOpen={bulkThoughtsOpen}
    >
      {contentForViewer(ev, viewerMode)}
    </SystemRow>
  );
}

// --- システム行 ---
export function SystemRow({ kind, icon, label, children, strategy, reasoning, ts, leftName, rightName, roleAssignment = {}, sessionId, viewerMode = 'spectator', bulkThoughtsOpen = false }) {
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
            <AgentLink sessionId={sessionId} name={leftName} viewerMode={viewerMode}>
              <Avatar name={leftName} role={roleAssignment[leftName]} size="xs" />
            </AgentLink>
          )}
          <div className={styles.sysText}>{children}</div>
          {ts && <div className={styles.sysTs}>{ts}</div>}
          {rightName && (
            <AgentLink sessionId={sessionId} name={rightName} viewerMode={viewerMode}>
              <Avatar name={rightName} role={roleAssignment[rightName]} size="xs" />
            </AgentLink>
          )}
        </div>
        {strategy && viewerMode === 'spectator' && (
          <div className={styles.strategyBadge}>[strategy: {strategy}]</div>
        )}
        <ThoughtDetails key={String(bulkThoughtsOpen)} reasoning={reasoning} viewerMode={viewerMode} bulkOpen={bulkThoughtsOpen} />
      </div>
    </div>
  );
}

// --- 人狼会話カード ---
function WolfChatCard({ ev, sessionId, viewerMode = 'spectator', bulkThoughtsOpen = false }) {
  return (
    <article className={`${styles.speech} ${styles.wolfChat}`} aria-label={`${ev.agent} wolf chat`}>
      <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}>
        <Avatar name={ev.agent} />
      </AgentLink>
      <div className={styles.vert} />
      <div>
        <div className={styles.spHead}>
          <AgentLink sessionId={sessionId} name={ev.agent} viewerMode={viewerMode}><span className={styles.name}>{ev.agent}</span></AgentLink>
        </div>
        <div className={styles.spBody}>{ev.content}</div>
        <ThoughtDetails key={String(bulkThoughtsOpen)} reasoning={ev.reasoning} viewerMode={viewerMode} bulkOpen={bulkThoughtsOpen} />
      </div>
    </article>
  );
}

// public モードで非表示にする非公開イベント種別
const SPECTATOR_ONLY_EVENTS = new Set(['wolf_chat', 'inspection', 'guard', 'medium_result']);

// --- フィードアイテム ---
export function FeedItem({ ev, prevById, roleAssignment, sessionId, viewerMode = 'spectator', bulkThoughtsOpen = false }) {
  const isPublic = viewerMode === 'public';

  if (ev.event_type === 'speech') return <SpeechCard ev={ev} prevById={prevById} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen} />;

  // public モードでは spectator 限定イベントを完全非表示
  if (isPublic && SPECTATOR_ONLY_EVENTS.has(ev.event_type)) return null;
  if (isPublic && !ev.is_public) return null;

  if (ev.event_type === 'game_start_narrative') {
    return <SystemRow kind="gm" label="ゲームマスター" bulkThoughtsOpen={bulkThoughtsOpen}>{ev.content}</SystemRow>;
  }

  if (ev.event_type === 'role_assigned') {
    if (ev.agent) {
      return <AgentEpisodeCard ev={ev} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} />;
    }
    if (!isPublic) return null;
    return <SystemRow kind="gm" label="役職構成" viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen}>{contentForViewer(ev, viewerMode)}</SystemRow>;
  }

  if (ev.event_type === 'wolf_chat') return <WolfChatCard ev={ev} sessionId={sessionId} viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen} />;

  if (ev.event_type === 'suspicion_update' || ev.event_type === 'threat_update') {
    return <RelationshipUpdateRow ev={ev} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} />;
  }

  const configuredSystemEvent = renderConfiguredSystemEvent(ev, roleAssignment, sessionId, viewerMode, bulkThoughtsOpen);
  if (configuredSystemEvent) return configuredSystemEvent;

  if (ev.event_type === 'guard_block') {
    return ev.is_public
      ? <SystemRow kind="gm" icon="🛡" label="護衛" viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen}>{contentForViewer(ev, viewerMode)}</SystemRow>
      : <SystemRow kind="gm" icon="🛡" label="護衛成功" rightName={ev.target} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen}>{contentForViewer(ev, viewerMode)}</SystemRow>;
  }
  if (ev.event_type === 'night_attack') {
    const victim = ev.target;
    return ev.is_public
      ? <SystemRow kind="death" icon="💀" label="襲撃結果" rightName={victim} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen}>{contentForViewer(ev, viewerMode)}</SystemRow>
      : <SystemRow kind="exec" icon="🐺" label="人狼の襲撃" rightName={ev.target} roleAssignment={roleAssignment} sessionId={sessionId} viewerMode={viewerMode} bulkThoughtsOpen={bulkThoughtsOpen}>{contentForViewer(ev, viewerMode)}</SystemRow>;
  }

  if (ev.event_type === 'game_over') {
    const winnerClass = ev.winner === 'Werewolves' ? styles.gameOverWolf
      : ev.winner === 'Villagers' ? styles.gameOverVillage
      : styles.gameOverUnknown;
    return (
      <SystemRow kind="phase" icon="🏁" label="勝敗結果" bulkThoughtsOpen={bulkThoughtsOpen}>
        <span className={`${styles.gameOverText} ${winnerClass}`}>{ev.content}</span>
      </SystemRow>
    );
  }

  if (ev.event_type === 'phase_start') {
    if (ev.phase === 'day_vote' || ev.phase === 'night' || ev.phase === 'night_wolf_chat' || ev.phase === 'pre_night') return null;
    if (ev.phase === 'day_opening' || ev.phase === 'day_discussion') return null;
    return <SystemRow kind="phase" label="フェーズ">{ev.content}</SystemRow>;
  }
  return null;
}

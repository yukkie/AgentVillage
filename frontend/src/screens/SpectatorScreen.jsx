import { useEffect, useMemo, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import RoleTag from '../components/RoleTag.jsx';
import TopBar, { TopBarBtn, topBarStyles } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLES, AGENT_PALETTE } from '../lib/constants.js';
import {
  ROLE_ASSIGNMENT, NIGHT_RESULTS, EXEC_RESULTS,
  VOTE_TABLE_D1, ACTIONS_TIMELINE, EVENTS,
} from '../../stub/spectator.js';
import { fetchReplayAgents, fetchReplayLog } from '../lib/replayLoader.js';
import { parseGameData } from '../lib/parseGameData.js';
import styles from './SpectatorScreen.module.css';

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
          <span className={styles.alias}>#{ev.agent.charCodeAt(0) % 99}</span>
          <RoleTag role={role} />
          {ev.claimed_role && (
            <span className={styles.coBadge}>
              ▶ {ROLES[ev.claimed_role]?.ja || ev.claimed_role} CO
            </span>
          )}
          <span className={styles.turn}>{fmtTurn(ev.day, ev.speech_id || 0)}</span>
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
        {ev.thought && (
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
              <span className={styles.conf}>{ev.thought.length} 字 · spectator限定</span>
            </summary>
            <div className={styles.thinkBody}>
              {ev.thought.slice(0, 380)}{ev.thought.length > 380 ? '…' : ''}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// --- システム行 ---
function SystemRow({ kind, label, children, ts }) {
  const iconChar = { gm: '神', death: '☩', exec: '⚑', phase: '☾' }[kind] || '⌘';
  return (
    <div className={`${styles.sysrow} ${styles[kind] || ''}`}>
      <div className={styles.sysIcon}>{iconChar}</div>
      <div>
        <div className={styles.sysLabel}>{label}</div>
        <div className={styles.sysText}>{children}</div>
      </div>
      <div className={styles.sysTs}>{ts}</div>
    </div>
  );
}

// --- 投票内訳カード ---
function VoteDetail({ day }) {
  if (day !== 1) return null;
  const exec = EXEC_RESULTS[1];
  return (
    <div className={styles.voteDetail}>
      <h4>
        Day {day} 投票結果{' '}
        <span className={styles.pill}>処刑: {exec.target}（{exec.votes}票）</span>
      </h4>
      <div className={styles.voteGrid}>
        {VOTE_TABLE_D1.map((v, i) => (
          <div className={styles.voteCell} key={i}>
            <Avatar name={v.from} size="xs" />
            <span className={styles.voteFrom}>{v.from}</span>
            <span className={styles.voteArrow}>▶</span>
            <span className={v.to === exec.target ? styles.targetBad : styles.voteTo}>{v.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- フィードアイテム ---
function FeedItem({ ev, prevById, roleAssignment, title }) {
  if (ev.event_type === 'speech') return <SpeechCard ev={ev} prevById={prevById} roleAssignment={roleAssignment} />;
  if (ev.event_type === 'phase_start') {
    if (ev.content.includes('GAME START')) {
      return (
        <SystemRow kind="gm" label="ゲームマスター" ts="10:00">
          <strong>{title || 'Archived Game'}</strong> が開始されました。
        </SystemRow>
      );
    }
    if (ev.content.match(/TURN \d+/)) return null;
    return <SystemRow kind="phase" label="フェーズ" ts="—">{ev.content}</SystemRow>;
  }
  return null;
}

// === 左ペイン ===
function LeftPane({ activeDay, setDay, days, agentNames }) {
  return (
    <>
      <div className={styles.phaseNav}>
        <div className={styles.sectionLabel}>タイムライン</div>
        {days.map(d => (
          <div key={d}>
            <div className={styles.phaseDay}>
              <h3>第 {d} 日 <small>{d === 1 ? '初日' : d === 2 ? '荒れる' : '進行中'}</small></h3>
              {NIGHT_RESULTS[d] && <div className={styles.deathline}>⚰ {NIGHT_RESULTS[d].attacked}</div>}
            </div>
            <div className={styles.phaseList}>
              <div
                className={`${styles.phaseItem} ${styles.phaseDiscuss} ${activeDay === d ? styles.active : ''}`}
                onClick={() => setDay(d)}
              >
                <span className={styles.dot} /> 議論フェーズ <span className={styles.phaseTurn}>12 発言</span>
              </div>
              <div className={`${styles.phaseItem} ${styles.phaseExec}`}>
                <span className={styles.dot} /> 投票・処刑 <span className={styles.phaseTurn}>{EXEC_RESULTS[d]?.target || '—'}</span>
              </div>
              <div className={`${styles.phaseItem} ${styles.phaseNight}`}>
                <span className={styles.dot} /> 夜フェーズ <span className={styles.phaseTurn}>{d < 3 ? '完了' : '進行中'}</span>
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

// === 右ペイン ===
function RightPane({ agents, roleAssignment }) {
  const order = Object.keys(agents).length
    ? Object.keys(agents)
    : ['Nox','Mira','Ren','Kai','Toma','Shiki','Rei','Sable','Sera','Kael','Sora'];
  const dead = order.filter(n => agents[n]?.is_alive === false);
  const fallbackDead = Object.keys(agents).length ? [] : ['Sora', 'Toma'];
  const deadNames = dead.length ? dead : fallbackDead;
  const alive = order.filter(n => !deadNames.includes(n));

  return (
    <div className={styles.roster}>
      <div className={styles.sectionLabel}>
        参加エージェント
        <span style={{ float: 'right', color: 'var(--tx-4)' }}>{alive.length} / {order.length} 生存</span>
      </div>

      <div className={styles.rosterSection}>
        <h4>生存 <span className={styles.count}>{alive.length}</span></h4>
        {alive.map(n => {
          const role = roleAssignment[n];
          const r = ROLES[role];
          const sus = (n.charCodeAt(0) * 13) % 100;
          return (
            <div key={n} className={styles.rosterRow} style={{ '--r-color': r?.color }}>
              <Avatar name={n} role={role} size="sm" />
              <div className={styles.who}>
                <span className={styles.rosterName}>{n} <RoleTag role={role} /></span>
                <span className={styles.sub}>
                  {(n === 'Ren' || n === 'Nox') && <span style={{ color: 'var(--acc)' }}>占CO</span>}
                  <span>発言 {(n.length * 3) + 4}</span>
                </span>
              </div>
              <div className={styles.meter}>
                <div className={styles.bar}><i style={{ width: `${sus}%` }} /></div>
                <small><span>容疑</span><span>{sus}</span></small>
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
          return (
            <div key={n} className={`${styles.rosterRow} ${styles.dead}`} style={{ '--r-color': r?.color }}>
              <Avatar name={n} role={role} size="sm" dead />
              <div className={styles.who}>
                <span className={styles.rosterName}>{n}</span>
                <span className={styles.sub}>
                  <RoleTag role={role} />
                  <span>{n === 'Sora' ? 'Day1 夜・襲撃' : 'Day1 昼・処刑'}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.sectionLabel}>カミングアウト状況</div>
      <div className={styles.coBoard}>
        {[
          { roleKey: 'Seer',   coName: 'Ren', meta: '→ Mira（白）' },
          { roleKey: 'Seer',   coName: 'Nox', meta: '→ Kai（黒）' },
          { roleKey: 'Medium', coName: null,   meta: '—' },
          { roleKey: 'Knight', coName: null,   meta: '—' },
        ].map(({ roleKey, coName, meta }, i) => (
          <div key={i} className={styles.coRow} style={{ '--r-color': ROLES[roleKey]?.color }}>
            <span className={styles.coRole}>{ROLES[roleKey]?.ja}</span>
            <span className={styles.coName} style={{ color: coName ? 'var(--tx)' : 'var(--tx-3)' }}>
              {coName || '未CO'}
            </span>
            <span className={styles.coMeta}>{meta}</span>
          </div>
        ))}
      </div>

      <div className={styles.sectionLabel}>夜の行動・推測</div>
      <div className={styles.actionList}>
        {ACTIONS_TIMELINE.map((a, i) => (
          <div key={i} className={`${styles.action} ${styles[a.kind] || ''}`}>
            <div className={styles.when}>D{a.day}{a.when}</div>
            <div className={styles.actionIco}>
              {a.kind === 'divine' ? '◉' : a.kind === 'guard' ? '盾' : a.kind === 'attack' ? '✕' : a.kind === 'exec' ? '⚑' : '・'}
            </div>
            <div className={styles.what}>
              <strong>{a.who}</strong> → <em style={{ '--r-color': ROLES[ROLE_ASSIGNMENT[a.target]]?.color }}>{a.target}</em>
              <span style={{ color: 'var(--tx-4)', marginLeft: 6 }}>{a.label}</span>
            </div>
            {a.result && <div className={`${styles.res} ${styles[a.result]}`}>{a.result === 'black' ? '黒' : '白'}</div>}
            {a.votes  && <div className={styles.res} style={{ color: 'var(--tx-3)' }}>{a.votes}票</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// === メイン観戦画面 ===
export default function SpectatorScreen({ sessionId, cast = [], title, onBack }) {
  const [activeDay, setActiveDay] = useState(2);
  const [replayEvents, setReplayEvents] = useState(null);
  const [replayAgents, setReplayAgents] = useState({});
  const [loadingEvents, setLoadingEvents] = useState(Boolean(sessionId));
  const [loadingAgents, setLoadingAgents] = useState(Boolean(sessionId));
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!sessionId) return undefined;

    let cancelled = false;
    setReplayEvents(null);
    setReplayAgents({});
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
        const firstDay = parsed.events.find(event => event.day)?.day;
        if (firstDay) setActiveDay(firstDay);
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

  const events = replayEvents ?? EVENTS;
  const agents = replayAgents;
  const roleAssignment = useMemo(() => {
    if (!Object.keys(agents).length) return ROLE_ASSIGNMENT;
    return Object.fromEntries(
      Object.entries(agents).map(([name, agent]) => [name, agent.role])
    );
  }, [agents]);
  const agentNames = Object.keys(agents).length ? Object.keys(agents) : Object.keys(AGENT_PALETTE);
  const days = [...new Set(events.map(event => event.day).filter(Boolean))].sort((a, b) => a - b);
  const visibleDays = days.length ? days : [1, 2, 3];

  const prevById = {};
  events.forEach(e => {
    if (e.speech_id != null) prevById[`${e.day}-${e.speech_id}`] = e;
  });

  const d1 = events.filter(e =>
    e.day === 1 && (
      e.event_type === 'speech' ||
      (e.event_type === 'phase_start' && e.content.includes('GAME START'))
    )
  );
  const d2 = events.filter(e => e.day === 2 && e.event_type === 'speech');
  const activeEvents = events.filter(e =>
    e.day === activeDay && (
      e.event_type === 'speech' ||
      e.event_type === 'phase_start'
    )
  );
  const feedEvents = sessionId
    ? activeEvents
    : [...d1, ...d2];
  const speechCount = events.filter(e => e.event_type === 'speech').length;
  const coCount = events.filter(e => e.claimed_role).length;

  const annotate = (e) => {
    if (e.day === 2 && e.agent === 'Ren' && e.speech_id === 1) return { ...e, claimed_role: 'Seer' };
    if (e.day === 2 && e.agent === 'Nox' && e.speech_id === 2) return { ...e, claimed_role: 'Seer' };
    return e;
  };

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[{ label: '観戦' }, { label: title || sessionId || '第13回 桜霞村' }, { label: `Day ${activeDay} 議論` }]}>
        {onBack && <TopBarBtn onClick={onBack}>← 一覧</TopBarBtn>}
        <TopBarBtn><span className={topBarStyles.liveDot} /> REPLAY</TopBarBtn>
        <TopBarBtn>同時観戦 142</TopBarBtn>
        <TopBarBtn>⤓ 全ログDL</TopBarBtn>
        <TopBarBtn primary>★ 応援</TopBarBtn>
      </TopBar>

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane activeDay={activeDay} setDay={setActiveDay} days={visibleDays} agentNames={agentNames} />}
        right={<RightPane agents={agents} roleAssignment={roleAssignment} />}
      >
        <div className={styles.feedHead}>
          <h2>Day {activeDay} 議論 <small>{sessionId ? sessionId : '3:47 経過 / 残り 4:13'}</small></h2>
          <span className={styles.stat}>発言 <strong>{speechCount}</strong></span>
          <span className={styles.stat}>CO <strong>{coCount}</strong></span>
          <span className={styles.stat}>投票確定 <strong>6/9</strong></span>
          <span className={styles.spacer} />
          <TopBarBtn>⇅ 新しい順</TopBarBtn>
          <TopBarBtn>🔍 検索</TopBarBtn>
        </div>
        <div className={styles.feed}>
          {loadError && (
            <SystemRow kind="death" label="読み込みエラー" ts="—">
              {loadError.message}
            </SystemRow>
          )}
          {(loadingEvents || loadingAgents) && (
            <SystemRow kind="phase" label="読み込み中" ts="—">
              {loadingAgents ? '参加者情報を読み込み中。' : ''}
              {loadingEvents ? '発言ログを読み込み中。' : ''}
            </SystemRow>
          )}
          {feedEvents.map((e, i) => (
            <FeedItem
              key={e.id || `${e.day}-${e.event_type}-${e.agent}-${e.speech_id}-${i}`}
              ev={annotate(e)}
              prevById={prevById}
              roleAssignment={roleAssignment}
              title={title || sessionId}
            />
          ))}
          {!sessionId && (
            <>
              <SystemRow kind="exec" label="処刑" ts="11:14">
                <strong>Toma</strong> が処刑された（4票）。役職は <strong style={{ color: 'var(--r-villager)' }}>村人</strong> でした。
              </SystemRow>
              <VoteDetail day={1} />
              <SystemRow kind="phase" label="夜フェーズ" ts="11:20">夜が訪れた。占い師・人狼・狩人が行動を選択中…</SystemRow>
              <SystemRow kind="death" label="襲撃" ts="08:00">
                朝、<strong>Sora</strong> が無残な姿で発見された。村は大きく動揺している。
              </SystemRow>
              <SystemRow kind="phase" label="Day 2 議論開始" ts="08:05">2日目の議論が始まりました。</SystemRow>
            </>
          )}
        </div>
      </ThreePaneLayout>
    </div>
  );
}

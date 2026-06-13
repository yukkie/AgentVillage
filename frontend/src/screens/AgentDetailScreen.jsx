import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import AgentRosterRow from '../components/AgentRosterRow.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLES } from '../lib/constants.js';
import { fetchGameStats, parseGameStats, parseAllAgentNames } from '../lib/archiveLoader.js';
import {
  ALL_AGENTS, DEAD_AGENTS, ROLE_ASSIGNMENT,
  AGENT_BLURB, AGENT_STATS, THOUGHTS,
  getSuspicionMatrix,
} from '../../stub/agentDetail.js';
import styles from './AgentDetailScreen.module.css';

const TABS = ['概要', '推論ログ', '過去の戦績'];

function viewerModeFromSearchParams(searchParams) {
  return searchParams.get('view') === 'public' ? 'public' : 'spectator';
}

function searchForViewerMode(viewerMode) {
  return viewerMode === 'public' ? '?view=public' : '';
}

// --- 左ペイン ---
function LeftPane({ current, sessionId, viewerMode = 'spectator' }) {
  const alive = ALL_AGENTS.filter(n => !DEAD_AGENTS.has(n));
  const dead  = ALL_AGENTS.filter(n =>  DEAD_AGENTS.has(n));
  const viewerSearch = searchForViewerMode(viewerMode);

  return (
    <>
      <div className={styles.pickerHead}>
        <span className={styles.pickerTitle}>第13回 桜霞 · 全{ALL_AGENTS.length}名</span>
        <span className={styles.pickerCount}>{alive.length} alive · {dead.length} dead</span>
      </div>
      <div className={styles.agentPicker}>
        <ul className={styles.pickerList} aria-label="エージェント一覧">
        {ALL_AGENTS.map(n => {
          const role  = ROLE_ASSIGNMENT[n];
          const r     = ROLES[role];
          const isDead = DEAD_AGENTS.has(n);
          const to = sessionId
            ? `/game/${sessionId}/agent/${encodeURIComponent(n)}${viewerSearch}`
            : `/agent/${encodeURIComponent(n)}`;
          return (
            <li
              key={n}
              className={`${styles.pick} ${current === n ? styles.pickOn : ''} ${isDead ? styles.pickDead : ''}`}
              style={{ '--r-color': r?.color }}
            >
              <Link to={to} className={styles.pickLink}>
                <Avatar name={n} role={role} size="sm" dead={isDead} />
                <div className={styles.who}>
                  <span className={styles.pickName}>{n}</span>
                  <span className={styles.pickRole}>{r?.ja}</span>
                </div>
                <span className={styles.statusDot} />
              </Link>
            </li>
          );
        })}
        </ul>
      </div>
    </>
  );
}

// --- 中央: ヒーロー ---
function AgentHero({ agent }) {
  const role  = ROLE_ASSIGNMENT[agent];
  const r     = ROLES[role];
  const stats = AGENT_STATS[agent] || {};
  const winPct = stats.games ? Math.round(stats.wins / stats.games * 100) : 0;

  return (
    <header className={styles.agentHero} style={{ '--r-color': r?.color }}>
      <Avatar name={agent} role={role} highlight />
      <div className={styles.heroInfo}>
        <h1>{agent}</h1>
        <div className={styles.heroSub}>
          <span className={styles.heroRoleLabel}>{r?.ja}</span>
          <span>所属: <strong style={{ color: 'var(--tx-2)' }}>{r?.team === 'wolf' ? '人狼陣営' : '村人陣営'}</strong></span>
          <span>第13回・桜霞村</span>
          <span style={{ color: DEAD_AGENTS.has(agent) ? 'var(--dead)' : 'var(--alive)' }}>
            {DEAD_AGENTS.has(agent) ? '死亡' : '生存中 · Day 2'}
          </span>
        </div>
        <div className={styles.heroBlurb}>「{AGENT_BLURB[agent] || '—'}」</div>
      </div>
      <div className={styles.heroStats}>
        <div className={styles.heroStat}>
          <div className={styles.statNum}>{winPct}%</div>
          <div className={styles.statLabel}>勝率 ({stats.games}戦)</div>
        </div>
        <div className={styles.heroStat}>
          <div className={styles.statNum}>{stats.speeches}</div>
          <div className={styles.statLabel}>本村発言</div>
        </div>
      </div>
    </header>
  );
}

// --- タブコンテンツ: 概要 ---
function TabOverview({ agent }) {
  const thoughts = (THOUGHTS[agent] || []).slice(0, 2);
  return (
    <>
      {thoughts.length > 0 && (
        <div className={styles.panel}>
          <h3>直近の推論 <small>{thoughts.length} 件 · spectator限定</small></h3>
          <ul className={styles.thoughtList} aria-label="直近の推論">
            {thoughts.map((t, i) => (
              <li className={styles.thought} key={i}>
                <div className={styles.thoughtHead}>
                  <strong>D{t.day} #{t.speechId} 発言前の思考</strong>
                </div>
                <div className={styles.thoughtBody}>{t.text.slice(0, 180)}{t.text.length > 180 ? '…' : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// --- タブコンテンツ: 推論ログ ---
function TabThoughts({ agent }) {
  const thoughts = THOUGHTS[agent] || [];
  if (thoughts.length === 0) {
    return <div style={{ color: 'var(--tx-4)', fontSize: 13 }}>推論ログなし（public モード）</div>;
  }
  return (
    <div className={styles.panel}>
      <h3>推論ログ <small>{thoughts.length} 件 · spectator限定</small></h3>
      <ul className={styles.thoughtList} aria-label="推論ログ">
        {thoughts.map((t, i) => (
          <li className={styles.thought} key={i}>
            <div className={styles.thoughtHead}>
              <strong>D{t.day} #{t.speechId} 発言前の思考</strong>
            </div>
            <div className={styles.thoughtBody}>{t.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- タブコンテンツ: 過去の戦績 ---
function TabHistory({ agent }) {
  const stats = AGENT_STATS[agent] || {};
  const records = [
    { game: 13, role: 'Seer',     result: true,  village: '桜霞' },
    { game: 12, role: 'Villager', result: false, village: '蒼霧' },
    { game: 11, role: 'Werewolf', result: true,  village: '暁閑' },
    { game: 10, role: 'Knight',   result: true,  village: '朱峰' },
    { game:  9, role: 'Medium',   result: false, village: '玄空' },
  ];
  return (
    <div className={styles.panel}>
      <h3>過去の戦績 <small>通算 {stats.games} 戦 {stats.wins} 勝</small></h3>
      <ul className={styles.recordList} aria-label="過去の戦績">
        {records.map((rec, i) => {
          const r = ROLES[rec.role];
          return (
            <li key={i} className={styles.recordRow} style={{ '--r-color': r?.color }}>
              <span className={styles.recordNum}>#{rec.game}</span>
              <span style={{ color: 'var(--tx-3)', fontSize: 11 }}>{rec.village}</span>
              <span className={styles.recordRole}>{r?.ja}</span>
              <span className={`${styles.recordResult} ${rec.result ? styles.win : styles.lose}`}>
                {rec.result ? '勝利' : '敗北'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
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
      <div className={styles.dualBar}>
        <div className={styles.barWrap}>
          <i className={styles.barFill} style={{ width: `${m.suspicion}%` }} />
        </div>
        <div className={`${styles.barWrap} ${styles.barTrust}`}>
          <i className={styles.barFill} style={{ width: `${m.trust}%` }} />
        </div>
      </div>
      <div className={styles.matrixNum} style={{ color: 'var(--danger)' }}>{m.suspicion}</div>
      <div className={styles.matrixNum} style={{ color: 'var(--info)' }}>{m.trust}</div>
    </li>
  );
}

// --- 右ペイン ---
function RightPane({ agent }) {
  const matrix  = getSuspicionMatrix(agent).slice(0, 8);

  return (
    <div className={styles.rightInner}>
      <div className={styles.panel}>
        <h3>疑い度マトリクス</h3>
        <div className={styles.matrixHeader} aria-hidden="true">
          <div className={styles.matrixHead}>対象</div>
          <div className={styles.matrixHead}>疑い ←→ 信頼</div>
          <div className={styles.matrixHead}>疑</div>
          <div className={styles.matrixHead}>信</div>
        </div>
        <ul className={styles.matrix} aria-label="疑い度マトリクス">
          {matrix.map(m => <MatrixRow key={m.name} m={m} />)}
        </ul>
      </div>
    </div>
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
function GlobalHero({ agent, stats }) {
  const winPct = stats.total ? Math.round(stats.wins / stats.total * 100) : 0;

  return (
    <header className={styles.agentHero}>
      <Avatar name={agent} highlight />
      <div className={styles.heroInfo}>
        <h1>{agent}</h1>
        <div className={styles.heroSub}>
          <span>通算 {stats.total} 戦 {stats.wins} 勝</span>
        </div>
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
            const r = ROLES[rec.role];
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
function GlobalProfile({ agent }) {
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
          <GlobalHero agent={agent} stats={stats} />
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
  const [tab, setTab] = useState(0);

  // sessionId なし → global profile mode（横断戦績・実データ）
  if (!sessionId) {
    return <GlobalProfile agent={agent} />;
  }

  // sessionId あり → game-scoped mode（現状はスタブ。実データ化は別 Issue）
  const role = ROLE_ASSIGNMENT[agent];
  const r    = ROLES[role];

  const toggleViewerMode = () => {
    setSearchParams(viewerMode === 'spectator' ? { view: 'public' } : {});
  };

  const tabContent = [
    <TabOverview     agent={agent} />,
    <TabThoughts     agent={agent} />,
    <TabHistory      agent={agent} />,
  ];

  const topCrumbs = [
    { label: 'r/agent-jinrou', to: '/' },
    { label: sessionId, to: `/game/${sessionId}${viewerSearch}` },
    { label: agent },
  ];

  return (
    <div className={styles.frame}>
      <TopBar crumbs={topCrumbs}>
        <TopBarBtn onClick={toggleViewerMode}>
          {viewerMode === 'spectator' ? '🔍 観戦者モード' : '👤 参加者視点'}
        </TopBarBtn>
      </TopBar>

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane current={agent} sessionId={sessionId} viewerMode={viewerMode} />}
        right={<RightPane agent={agent} />}
      >
        <div className={styles.mainPane}>
          <AgentHero agent={agent} />
          <div className={styles.tabs}>
            {TABS.map((t, i) => (
              <button
                key={t}
                className={`${styles.tab} ${tab === i ? styles.tabOn : ''}`}
                onClick={() => setTab(i)}
              >
                {t}{i === 1 && (THOUGHTS[agent]?.length ? ` (${THOUGHTS[agent].length})` : '')}
              </button>
            ))}
          </div>
          <div className={styles.tabContent} style={{ '--r-color': r?.color }}>
            {tabContent[tab]}
          </div>
        </div>
      </ThreePaneLayout>
    </div>
  );
}

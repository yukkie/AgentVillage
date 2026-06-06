import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import TopBar, { TopBarBtn, topBarStyles } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { ROLES } from '../lib/constants.js';
import {
  ALL_AGENTS, DEAD_AGENTS, ROLE_ASSIGNMENT,
  AGENT_BLURB, AGENT_STATS, THOUGHTS, NIGHT_ACTIONS,
  getSuspicionMatrix,
} from '../../stub/agentDetail.js';
import styles from './AgentDetailScreen.module.css';

const TABS = ['概要', '推論ログ', '疑い・信頼', '夜の行動', '過去の戦績'];

// --- 左ペイン ---
function LeftPane({ current, onPick }) {
  const alive = ALL_AGENTS.filter(n => !DEAD_AGENTS.has(n));
  const dead  = ALL_AGENTS.filter(n =>  DEAD_AGENTS.has(n));

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
          return (
            <li
              key={n}
              className={`${styles.pick} ${current === n ? styles.pickOn : ''} ${isDead ? styles.pickDead : ''}`}
              style={{ '--r-color': r?.color }}
              onClick={() => onPick(n)}
            >
              <Avatar name={n} role={role} size="sm" dead={isDead} />
              <div className={styles.who}>
                <span className={styles.pickName}>{n}</span>
                <span className={styles.pickRole}>{r?.ja}</span>
              </div>
              <span className={styles.statusDot} />
            </li>
          );
        })}
        </ul>
        <div className={styles.sectionLabel} style={{ marginTop: 12 }}>並べ替え</div>
        <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button className={styles.sortBtn}>発言数 ↓</button>
          <button className={styles.sortBtn}>容疑度 ↓</button>
          <button className={styles.sortBtn}>役職別</button>
        </div>
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
        <div className={styles.heroStat}>
          <div className={styles.statNum} style={{ color: 'var(--alive)' }}>+{stats.cheers}</div>
          <div className={styles.statLabel}>応援スコア</div>
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
      <div className={styles.panel}>
        <h3>現在の目標 <small>Day 2 議論フェーズ</small></h3>
        <div className={styles.goalLine}>
          真の占い師として認知を取りつつ、Kai を確実に処刑へ追い込む。Ren の偽占いを論理的に崩す。
        </div>
      </div>
      {thoughts.length > 0 && (
        <div className={styles.panel}>
          <h3>直近の推論 <small>{thoughts.length} 件 · spectator限定</small></h3>
          <ul className={styles.thoughtList} aria-label="直近の推論">
            {thoughts.map((t, i) => (
              <li className={styles.thought} key={i}>
                <div className={styles.thoughtHead}>
                  <strong>D{t.day} #{t.speechId} 発言前の思考</strong>
                  <time className={styles.thoughtTs}>{(8 + t.speechId * 2) % 24}:{String((t.speechId * 13) % 60).padStart(2, '0')}</time>
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
              <time className={styles.thoughtTs}>{(8 + t.speechId * 2) % 24}:{String((t.speechId * 13) % 60).padStart(2, '0')}</time>
            </div>
            <div className={styles.thoughtBody}>{t.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- タブコンテンツ: 疑い・信頼 ---
function TabSuspicion({ agent }) {
  const matrix = getSuspicionMatrix(agent).slice(0, 8);
  return (
    <div className={styles.panel}>
      <h3>疑い度マトリクス <small>{agent} 視点</small></h3>
      <div className={styles.matrixHeader} aria-hidden="true">
        <div className={styles.matrixHead}>対象</div>
        <div className={styles.matrixHead}>疑い ←→ 信頼</div>
        <div className={styles.matrixHead}>疑</div>
        <div className={styles.matrixHead}>信</div>
      </div>
      <ul className={styles.matrix} aria-label="疑い度マトリクス">
        {matrix.map(m => (
          <MatrixRow key={m.name} m={m} />
        ))}
      </ul>
    </div>
  );
}

// --- タブコンテンツ: 夜の行動 ---
function TabNightActions({ agent }) {
  const actions = NIGHT_ACTIONS[agent] || [];
  if (actions.length === 0) {
    return <div style={{ color: 'var(--tx-4)', fontSize: 13 }}>夜の行動なし（村人系役職）</div>;
  }
  return (
    <div className={styles.panel}>
      <h3>夜の行動</h3>
      <ul className={styles.nightList} aria-label="夜の行動">
        {actions.map((a, i) => <NightRow key={i} a={a} />)}
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

// --- 共通パーツ: 夜の行動行 ---
function NightRow({ a }) {
  const resultClass = a.result === 'black' ? styles.resultBlack
    : a.result === 'white' ? styles.resultWhite
    : styles.resultSafe;
  const resultLabel = a.result === 'black' ? '黒'
    : a.result === 'white' ? '白'
    : a.result === 'blocked' ? '護衛成功'
    : '—';

  return (
    <li className={styles.nightRow}>
      <div className={styles.nightDay}>D{a.day}{a.phase}</div>
      <div>
        <div className={styles.nightAction}>{a.action}</div>
        <div className={styles.nightTarget}>
          <Avatar name={a.target} size="xs" />
          <span>{a.target}</span>
        </div>
      </div>
      <div className={`${styles.nightResult} ${resultClass}`}>{resultLabel}</div>
    </li>
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
  const actions = NIGHT_ACTIONS[agent] || [];

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
      {actions.length > 0 && (
        <div className={styles.panel}>
          <h3>夜の行動</h3>
          <ul className={styles.nightList} aria-label="夜の行動">
            {actions.map((a, i) => <NightRow key={i} a={a} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

// === メイン画面 ===
export default function AgentDetailScreen() {
  const [agent, setAgent] = useState('Nox');
  const [tab, setTab]     = useState(0);

  const role = ROLE_ASSIGNMENT[agent];
  const r    = ROLES[role];

  const tabContent = [
    <TabOverview     agent={agent} />,
    <TabThoughts     agent={agent} />,
    <TabSuspicion    agent={agent} />,
    <TabNightActions agent={agent} />,
    <TabHistory      agent={agent} />,
  ];

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[
        { label: 'r/agent-jinrou' },
        { label: '第13回 桜霞' },
        { label: agent },
      ]}>
        <TopBarBtn><span className={topBarStyles.liveDot} /> LIVE観戦中</TopBarBtn>
        <TopBarBtn>⤓ プロファイルJSON</TopBarBtn>
        <TopBarBtn primary>★ ウォッチ</TopBarBtn>
      </TopBar>

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane current={agent} onPick={setAgent} />}
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

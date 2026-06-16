import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Avatar, { AvatarButton } from '../components/Avatar.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { fetchGameList, fetchGameStats, parseWinRateRanking } from '../lib/archiveLoader.js';
import { ALL_AGENT_NAMES } from '../lib/agentMeta.js';
import styles from './GameListScreen.module.css';

const TABS = ['🔴 LIVE', '完了'];
const COUNTS = [5, 8, 11];
const ALL_AGENTS = ALL_AGENT_NAMES;

function NewVillageForm() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(COUNTS[0]);
  const [selected, setSelected] = useState(new Set());

  function toggleAgent(name) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < count) {
        next.add(name);
      }
      return next;
    });
  }

  function handleCountChange(n) {
    setCount(n);
    setSelected(new Set());
  }

  const canCreate = selected.size === count;

  return (
    <div className={styles.newVillage}>
      <button
        className={`${styles.newVillageBtn} ${open ? styles.newVillageBtnOpen : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.newVillagePlus}>{open ? '✕' : '＋'}</span>
        新しい村を作る
      </button>

      {open && (
        <div className={styles.newVillageForm}>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>人数</span>
            <div className={styles.countBtns}>
              {COUNTS.map(n => (
                <button
                  key={n}
                  className={`${styles.countBtn} ${count === n ? styles.countBtnOn : ''}`}
                  onClick={() => handleCountChange(n)}
                >
                  {n}人
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.formLabel}>エージェント</span>
            <span className={styles.selectHint}>{selected.size}/{count}人選択中</span>
          </div>

          <div className={styles.agentGrid}>
            {ALL_AGENTS.map(name => (
              <AvatarButton
                key={name}
                name={name}
                size="sm"
                label={name}
                layout="vertical"
                selected={selected.has(name)}
                onClick={() => toggleAgent(name)}
              />
            ))}
          </div>

          <div className={styles.formFooter}>
            <button
              className={styles.createBtn}
              disabled={!canCreate}
              onClick={() => setOpen(false)}
            >
              村を作る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function filterGames(games, tab) {
  if (tab === '🔴 LIVE') return games.filter(g => g.live);
  return games.filter(g => !g.live); // 完了
}

function winnerClass(winner) {
  if (winner === 'wolf') return styles.winnerWolf;
  if (winner === 'village') return styles.winnerVillage;
  return '';
}

function GameCard({ g }) {
  return (
    <article
      className={styles.gcard}
      aria-label={g.id}
    >
      <Link
        to={`/game/${g.id}`}
        className={styles.cardBody}
      >
        <div className={styles.gmeta}>
          {g.live
            ? (
              <span className={styles.livePill}>
                <span className={styles.livePillDot} />
                LIVE Day{g.day}
              </span>
            )
            : <span className={styles.endedTag}>{g.tag}</span>
          }
          {g.winner && (
            <span className={`${styles.winnerBadge} ${winnerClass(g.winner)}`}>
              {g.winnerLabel}
            </span>
          )}
          <span className={styles.community}>
            r/<strong>agent-jinrou</strong>
          </span>
          <span className={styles.metaSep}>·</span>
          <span className={styles.rule}>{g.rule}</span>
        </div>

        <h3 className={styles.cardTitle}>{g.title}</h3>

        <div className={styles.rosterStrip}>
          {g.cast.slice(0, 8).map(n => <Avatar key={n} name={n} size="xs" />)}
          {g.cast.length > 8 && (
            <span className={styles.moreCount}>+{g.cast.length - 8}</span>
          )}
          <span className={styles.cardDesc}>{g.desc}</span>
        </div>

        <div className={styles.gtail}>
          <span>👁 <strong>{g.viewers || '—'}</strong> 同時観戦</span>
        </div>
      </Link>
    </article>
  );
}

// === 左サイドナビ ===
function LeftPane() {
  return (
    <nav className={styles.sideNav} aria-label="ゲーム一覧サイドナビ">
      <div className={styles.sec}>
        <h5>ルール</h5>
        <ul>
          <li><a><span className={styles.ico}>11</span> 標準11人</a></li>
          <li><a><span className={styles.ico}>15</span> 拡張15人</a></li>
          <li><a><span className={styles.ico}>妖</span> 妖狐入り</a></li>
          <li><a><span className={styles.ico}>短</span> 短期戦</a></li>
        </ul>
      </div>
    </nav>
  );
}

// === 右サイドウィジェット ===
function RightPane({ winRateRankingState }) {
  return (
    <div className={styles.sideWidgets}>
      <section className={styles.sideCard}>
        <h5>🏆 勝率ランキング</h5>
        {winRateRankingState.status === 'loading' && (
          <p className={styles.sideNote}>勝率を集計中…</p>
        )}
        {winRateRankingState.status === 'error' && (
          <p className={styles.sideNote}>勝率を読み込めませんでした</p>
        )}
        {winRateRankingState.status === 'ready' && winRateRankingState.agents.length === 0 && (
          <p className={styles.sideNote}>集計できる戦績がありません</p>
        )}
        {winRateRankingState.status === 'ready' && winRateRankingState.agents.length > 0 && (
          <ul className={styles.sideList} aria-label="勝率ランキング">
            {winRateRankingState.agents.map(({ name, winRate }, i) => (
              <li className={styles.rankRow} key={name}>
                <Link to={`/agent/${encodeURIComponent(name)}`} className={styles.rankLink}>
                  <span className={styles.rank}>{i + 1}</span>
                  <Avatar name={name} size="xs" />
                  <span className={styles.rankName}>{name}</span>
                  <span className={styles.rankNum}>{winRate}%</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// === メインゲーム一覧画面 ===
export default function GameListScreen() {
  const [activeTab, setActiveTab] = useState('完了');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [winRateRankingState, setWinRateRankingState] = useState({ status: 'loading', agents: [] });

  useEffect(() => {
    fetchGameList()
      .then(setGames)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGameStats()
      .then(stats => {
        if (!cancelled) {
          setWinRateRankingState({ status: 'ready', agents: parseWinRateRanking(stats) });
        }
      })
      .catch(() => {
        if (!cancelled) setWinRateRankingState({ status: 'error', agents: [] });
      });
    return () => { cancelled = true; };
  }, []);

  const visibleGames = filterGames(games, activeTab);
  const liveGame = games.find(g => g.live);

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[{ label: 'r/agent-jinrou' }, { label: 'Live & Recent' }]} />

      <ThreePaneLayout
        collapsibleLeft
        collapsibleRight
        left={<LeftPane />}
        right={<RightPane winRateRankingState={winRateRankingState} />}
      >
        <div className={styles.listMain}>
          <NewVillageForm />

          {loading && (
            <div className={styles.loadingMsg}>読み込み中…</div>
          )}

          <div className={styles.listTabs}>
            {TABS.map(t => (
              <button
                key={t}
                className={`${styles.tab} ${activeTab === t ? styles.on : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {liveGame && activeTab !== '完了' && (
            <div className={styles.liveBanner}>
              <span className={styles.liveDot} />
              <div className={styles.bannerBody}>
                <div className={styles.bannerTitle}>
                  第13回「桜霞」が緊迫 — Day 2 議論残り 4 分
                </div>
                <div className={styles.bannerSub}>
                  Ren と Nox の対抗占いが発生。あなたが応援した <strong>Nox</strong> が真占い候補として有力です。
                </div>
              </div>
              <TopBarBtn primary>▶ 観戦に戻る</TopBarBtn>
            </div>
          )}

          {visibleGames.map(g => <GameCard key={g.id} g={g} />)}
        </div>
      </ThreePaneLayout>
    </div>
  );
}

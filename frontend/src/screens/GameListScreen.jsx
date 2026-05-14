import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import TopBar, { TopBarBtn } from '../components/TopBar.jsx';
import ThreePaneLayout from '../components/ThreePaneLayout.jsx';
import { GAMES, TOP_AGENTS, COMMUNITY_POSTS, VILLAGE_NAME_PRESETS } from '../../stub/gameList.js';
import { AGENT_PALETTE } from '../lib/constants.js';
import styles from './GameListScreen.module.css';

const TABS = ['▶ 注目', '🔥 熱い議論', '🆕 新着', '完了'];
const COUNTS = [5, 8, 11];
const ALL_AGENTS = Object.keys(AGENT_PALETTE);

function NewVillageForm() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(COUNTS[0]);
  const [selected, setSelected] = useState(new Set());
  const [villageName] = useState(
    () => VILLAGE_NAME_PRESETS[Math.floor(Math.random() * VILLAGE_NAME_PRESETS.length)]
  );

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
            <span className={styles.formLabel}>村名</span>
            <span className={styles.villageName}>{villageName}</span>
          </div>

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
            {ALL_AGENTS.map(name => {
              const isSelected = selected.has(name);
              const color = AGENT_PALETTE[name];
              return (
                <button
                  key={name}
                  className={`${styles.agentChip} ${isSelected ? styles.agentChipOn : ''}`}
                  style={{ '--chip-c': color }}
                  onClick={() => toggleAgent(name)}
                  title={name}
                >
                  <Avatar name={name} size="sm" />
                  <span className={styles.chipName}>{name}</span>
                </button>
              );
            })}
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
  if (tab === '完了') return games.filter(g => !g.live);
  if (tab === '▶ 注目') return games.filter(g => g.hot || g.live);
  if (tab === '🔥 熱い議論') return [...games].sort((a, b) => b.comments - a.comments);
  return games; // 新着: 全件
}

function winnerClass(winner) {
  if (winner === 'wolf') return styles.winnerWolf;
  if (winner === 'village') return styles.winnerVillage;
  return '';
}

function GameCard({ g }) {
  return (
    <div className={`${styles.gcard} ${g.hot ? styles.featured : ''}`}>
      <div className={styles.vote}>
        <button className={styles.up}>▲</button>
        <span className={styles.voteNum}>{g.votes}</span>
        <button>▼</button>
      </div>
      <div className={styles.cardBody}>
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
          <span className={styles.metatRight}>
            提供: <strong>RunVillage</strong>
          </span>
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
          <span>💬 <strong>{g.comments}</strong> 観戦コメント</span>
          <span>👁 <strong>{g.viewers || '—'}</strong> 同時観戦</span>
          <span>⤓ ログDL</span>
          <span>★ 保存</span>
          <span>↗ 共有</span>
        </div>
      </div>
    </div>
  );
}

// === 左サイドナビ ===
function LeftPane() {
  return (
    <nav className={styles.sideNav}>
      <div className={styles.sec}>
        <h5>マイページ</h5>
        <a className={styles.on}><span className={styles.ico}>⌂</span> ホーム</a>
        <a><span className={styles.ico}>★</span> ウォッチ中</a>
        <a><span className={styles.ico}>↻</span> 履歴</a>
        <a><span className={styles.ico}>◎</span> 自分のbot</a>
      </div>
      <div className={styles.sec}>
        <h5>カテゴリ</h5>
        <a>
          <span className={`${styles.ico} ${styles.rCls}`}>🜲</span>
          進行中の村
          <span style={{ marginLeft: 'auto', color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11 }}>3</span>
        </a>
        <a><span className={`${styles.ico} ${styles.rV}`}>村</span> 村人陣営勝</a>
        <a><span className={`${styles.ico} ${styles.rW}`}>狼</span> 狼陣営勝</a>
        <a><span className={styles.ico}>研</span> 研究村</a>
        <a><span className={styles.ico}>講</span> 解説付き</a>
      </div>
      <div className={styles.sec}>
        <h5>ルール</h5>
        <a><span className={styles.ico}>11</span> 標準11人</a>
        <a><span className={styles.ico}>15</span> 拡張15人</a>
        <a><span className={styles.ico}>妖</span> 妖狐入り</a>
        <a><span className={styles.ico}>短</span> 短期戦</a>
      </div>
      <div className={styles.sec}>
        <h5>注目エージェント</h5>
        {TOP_AGENTS.map(({ name, winRate }) => (
          <a key={name}>
            <Avatar name={name} size="xs" />
            {name}
            <span style={{ marginLeft: 'auto', color: 'var(--tx-3)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              勝率 {winRate}%
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}

// === 右サイドウィジェット ===
function RightPane() {
  return (
    <div className={styles.sideWidgets}>
      <div className={styles.sideCard}>
        <h5>📅 次回開催</h5>
        <div className={styles.nextDate}>第14回「夜霧の灯台」</div>
        <div className={styles.nextMeta}>本日 21:00 〜 / 11人標準 / 解説付</div>
        <button className={styles.reminderBtn}>リマインダー登録</button>
      </div>

      <div className={styles.sideCard}>
        <h5>🏆 今週の勝率トップ</h5>
        {TOP_AGENTS.map(({ name, winRate }, i) => (
          <div className={styles.rankRow} key={name}>
            <span className={styles.rank}>{i + 1}</span>
            <Avatar name={name} size="xs" />
            <span className={styles.rankName}>{name}</span>
            <span className={styles.rankNum}>{winRate}%</span>
          </div>
        ))}
      </div>

      <div className={styles.sideCard}>
        <h5>📰 観戦コミュニティ</h5>
        {COMMUNITY_POSTS.map((p, i) => (
          <div className={styles.postItem} key={i}>
            <div className={styles.postTitle}>{p.title}</div>
            <div className={styles.postVotes}>r/agent-jinrou · {p.votes} upvotes</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// === メインゲーム一覧画面 ===
export default function GameListScreen() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const visibleGames = filterGames(GAMES, activeTab);
  const liveGame = GAMES.find(g => g.live);

  return (
    <div className={styles.frame}>
      <TopBar crumbs={[{ label: 'r/agent-jinrou' }, { label: 'Live & Recent' }]}>
        <input
          style={{
            width: 280, height: 28,
            background: 'var(--bg-2)',
            border: '1px solid var(--bd)',
            borderRadius: 14,
            padding: '0 12px',
            color: 'var(--tx-2)',
            fontSize: 12,
            fontFamily: 'var(--sans)',
          }}
          placeholder="エージェント・役職・村名で検索…"
        />
        <TopBarBtn>通知 3</TopBarBtn>
        <TopBarBtn primary>＋ 自分のbotを参加させる</TopBarBtn>
      </TopBar>

      <ThreePaneLayout collapsibleLeft collapsibleRight left={<LeftPane />} right={<RightPane />}>
        <div className={styles.listMain}>
          <NewVillageForm />

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
            <span className={styles.spread} />
            <span className={styles.sort}>並び: ▾ Hot</span>
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

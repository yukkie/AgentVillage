/* AI人狼観戦ビューア — メイン観戦画面 (3-pane) */

const { Avatar, RoleTag, Mentioned, ROLES, AGENT_PALETTE, fmtTurn, fmtTime } = window;

// === 静的補完データ：解析結果のフレーバー（実ログには無いがデモ用に再構築） ===
const ROLE_ASSIGNMENT = {
  Mira:  { role: 'villager' },
  Ren:   { role: 'seer' },     // 占い師CO ← 偽
  Kai:   { role: 'werewolf' }, // 真の狼1
  Toma:  { role: 'villager' },
  Shiki: { role: 'medium' },
  Rei:   { role: 'hunter' },
  Sable: { role: 'villager' },
  Sera:  { role: 'werewolf' }, // 真の狼2
  Kael:  { role: 'madman' },
  Sora:  { role: 'villager' },
  Nox:   { role: 'seer' },     // 真の占い
};

// CO（カミングアウト）一覧 — Day 2 で噴出
const CO_LIST = [
  { agent: 'Ren', role: 'seer',   day: 2, target: 'Mira', result: 'white', note: '対抗' },
  { agent: 'Nox', role: 'seer',   day: 2, target: 'Kai',  result: 'black', note: '真' },
];

// ヘッダー：処刑・襲撃のサマリ
const NIGHT_RESULTS = {
  1: { attacked: 'Sora' },
  2: { attacked: 'Rei' },
};
const EXEC_RESULTS = {
  1: { target: 'Toma', votes: 4 }, // Day 1 投票で Toma 処刑（仮）
  2: { target: 'Ren',  votes: 7 }, // Day 2 偽占いを処刑
};

// 投票内訳（Day 1）
const VOTE_TABLE_D1 = [
  { from: 'Mira', to: 'Toma' }, { from: 'Ren', to: 'Sable' },
  { from: 'Kai', to: 'Toma' }, { from: 'Toma', to: 'Mira' },
  { from: 'Shiki', to: 'Toma' }, { from: 'Rei', to: 'Sable' },
  { from: 'Sable', to: 'Toma' }, { from: 'Sera', to: 'Mira' },
  { from: 'Kael', to: 'Sable' }, { from: 'Sora', to: 'Sable' },
  { from: 'Nox', to: 'Toma' },
];

// 観測役職アクション履歴（右ペイン）
const ACTIONS_TIMELINE = [
  { day: 1, when: 'N', kind: 'attack', who: 'Kai+Sera', target: 'Sora', label: '襲撃', note: '人狼陣営' },
  { day: 1, when: 'N', kind: 'divine', who: 'Nox',  target: 'Kai',   label: '占い', result: 'black' },
  { day: 1, when: 'N', kind: 'guard',  who: 'Rei',  target: 'Nox',   label: '護衛' },
  { day: 1, when: 'D', kind: 'exec',   who: '村',   target: 'Toma',  label: '処刑', votes: 4 },
  { day: 2, when: 'N', kind: 'attack', who: 'Kai+Sera', target: 'Rei',   label: '襲撃' },
  { day: 2, when: 'N', kind: 'divine', who: 'Nox',  target: 'Sera',  label: '占い', result: 'black' },
  { day: 2, when: 'D', kind: 'exec',   who: '村',   target: 'Ren',   label: '処刑', votes: 7 },
];

// =================================================================

const SpeechCard = ({ ev, prevById }) => {
  const role = ROLE_ASSIGNMENT[ev.agent]?.role;
  const r = ROLES[role];
  const replied = ev.reply_to ? prevById[ev.reply_to] : null;
  return (
    <div className={`speech ${role === 'werewolf' ? 'role-werewolf' : ''}`} style={{ ['--r-color']: r?.color }}>
      <Avatar name={ev.agent} role={role} />
      <div className="vert" />
      <div>
        <div className="sp-head">
          <span className="name">{ev.agent}</span>
          <span className="alias">エージェント#{ev.agent.charCodeAt(0) % 99}</span>
          <RoleTag role={role} />
          {ev.claimed_role && (
            <span className="co-badge">▶ {ROLES[ev.claimed_role]?.ja || ev.claimed_role} CO</span>
          )}
          <span className="turn">{fmtTurn(ev.day, ev.speech_id || 0)}</span>
          <span className="ts">{fmtTime(ev.day, ev.speech_id || 0)}</span>
        </div>
        {replied && (
          <div className="sp-quote">
            <div className="qhead">▶ {replied.agent} #{replied.speech_id} への返信</div>
            <div>{replied.content.slice(0, 90)}{replied.content.length > 90 ? '…' : ''}</div>
          </div>
        )}
        <div className="sp-body"><Mentioned text={ev.content} /></div>
        {ev.thought && (
          <details className="sp-think">
            <summary>
              <svg className="bubble-ico" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H7.5L4.7 13.4a.4.4 0 0 1-.7-.28V11H3.5C2.67 11 2 10.33 2 9.5v-6Z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="5.5" cy="6.5" r="0.7" fill="currentColor"/>
                <circle cx="8" cy="6.5" r="0.7" fill="currentColor"/>
                <circle cx="10.5" cy="6.5" r="0.7" fill="currentColor"/>
              </svg>
              <span className="label">思考ログを読む</span>
              <span className="conf">{ev.thought.length} 字 · spectator限定</span>
            </summary>
            <div className="body">
              {ev.thought.slice(0, 380)}{ev.thought.length > 380 ? '…' : ''}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

const SystemRow = ({ kind, label, children, ts }) => (
  <div className={`sysrow ${kind}`}>
    <div className="icon">
      {kind === 'gm' ? '神' : kind === 'death' ? '☩' : kind === 'exec' ? '⚑' : kind === 'phase' ? '☾' : '⌘'}
    </div>
    <div>
      <div className="label">{label}</div>
      <div className="text">{children}</div>
    </div>
    <div className="ts">{ts}</div>
  </div>
);

const VoteDetail = ({ day }) => {
  if (day !== 1) return null;
  const tally = {};
  VOTE_TABLE_D1.forEach(v => tally[v.to] = (tally[v.to] || 0) + 1);
  return (
    <div className="vote-detail">
      <h4>Day {day} 投票結果 <span className="pill">処刑: Toma（4票）</span></h4>
      <div className="vote-grid">
        {VOTE_TABLE_D1.map((v, i) => (
          <div className="vote-cell" key={i}>
            <Avatar name={v.from} size="xs" />
            <span className="from">{v.from}</span>
            <span className="arrow">▶</span>
            <span className={`to ${v.to === 'Toma' ? 'target-bad' : ''}`}>{v.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FeedItem = ({ ev, prevById }) => {
  if (ev.event_type === 'speech') return <SpeechCard ev={ev} prevById={prevById} />;
  if (ev.event_type === 'phase_start') {
    if (ev.content.includes('GAME START')) {
      return <SystemRow kind="gm" label="ゲームマスター" ts="10:00">
        <strong>第13回 観測村「桜霞」</strong> が開始されました。村人陣営 8 / 人狼陣営 3 / 占・霊・狩・狂 各1。</SystemRow>;
    }
    if (ev.content.includes('TURN')) return null; // 内部ターン区切りはノイズ
    return <SystemRow kind="phase" label="フェーズ" ts="-">{ev.content}</SystemRow>;
  }
  return null;
};

// === 左ペイン：日付/フェーズ/フィルタ ===
const LeftPane = ({ activeDay, setDay }) => (
  <div className="col left">
    <div className="phase-nav">
      <div className="section-label">タイムライン</div>
      {[1, 2, 3].map(d => (
        <div key={d}>
          <div className="phase-day">
            <h3>第 {d} 日 <small>{d === 1 ? '初日' : d === 2 ? '荒れる' : '進行中'}</small></h3>
            {NIGHT_RESULTS[d] && <div className="deathline">⚰ {NIGHT_RESULTS[d].attacked}</div>}
          </div>
          <div className="phase-list">
            <div className={`phase-item day ${activeDay === d ? 'active' : ''}`} onClick={() => setDay(d)}>
              <span className="dot" /> 議論フェーズ <span className="turn">12 発言</span>
            </div>
            <div className="phase-item exec">
              <span className="dot" /> 投票・処刑 <span className="turn">{EXEC_RESULTS[d]?.target || '—'}</span>
            </div>
            <div className="phase-item night">
              <span className="dot" /> 夜フェーズ <span className="turn">{d < 3 ? '完了' : '進行中'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="filt">
      <div className="section-label">参加者で絞る</div>
      <div className="filt-row">
        {Object.keys(AGENT_PALETTE).slice(0, 8).map(n => (
          <button key={n} className="chip"><Avatar name={n} size="xs" /> {n}</button>
        ))}
      </div>
      <div className="section-label">役職フィルタ</div>
      <div className="filt-row">
        {Object.entries(ROLES).map(([k, v]) => (
          <button key={k} className="chip" style={{ ['--r-color']: v.color }}>
            <span className="swatch" style={{ background: v.color }} /> {v.ja}
          </button>
        ))}
      </div>
      <div className="section-label">表示</div>
      <div className="filt-row">
        <button className="chip on">発言</button>
        <button className="chip on">投票</button>
        <button className="chip on">CO</button>
        <button className="chip">夜の行動</button>
        <button className="chip">思考ログ</button>
      </div>
    </div>
  </div>
);

// === 右ペイン：ロスター + CO + アクション ===
const RightPane = () => {
  const order = ['Nox','Mira','Ren','Kai','Toma','Shiki','Rei','Sable','Sera','Kael','Sora'];
  return (
    <div className="col right">
      <div className="roster">
        <div className="section-label">参加エージェント <span style={{ float: 'right', color: 'var(--tx-4)' }}>9 / 11 生存</span></div>

        <div className="roster-section">
          <h4>生存 <span className="count">9</span></h4>
          {order.filter(n => !['Sora','Toma'].includes(n)).map(n => {
            const role = ROLE_ASSIGNMENT[n]?.role;
            const r = ROLES[role];
            const sus = (n.charCodeAt(0) * 13) % 100;
            return (
              <div key={n} className="roster-row" style={{ ['--r-color']: r?.color }}>
                <Avatar name={n} role={role} size="sm" />
                <div className="who">
                  <span className="name">{n} <RoleTag role={role} /></span>
                  <span className="sub">
                    {n === 'Ren' && <span style={{ color: 'var(--acc)' }}>占CO</span>}
                    {n === 'Nox' && <span style={{ color: 'var(--acc)' }}>占CO</span>}
                    <span>発言 {(n.length * 3) + 4}</span>
                  </span>
                </div>
                <div className="meter">
                  <div className="bar"><i style={{ width: `${sus}%` }} /></div>
                  <small><span>容疑</span><span>{sus}</span></small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="roster-section">
          <h4>死亡者 <span className="count">2</span></h4>
          {['Sora','Toma'].map(n => {
            const role = ROLE_ASSIGNMENT[n]?.role;
            const r = ROLES[role];
            return (
              <div key={n} className="roster-row dead" style={{ ['--r-color']: r?.color }}>
                <Avatar name={n} role={role} size="sm" dead />
                <div className="who">
                  <span className="name">{n}</span>
                  <span className="sub">
                    <RoleTag role={role} />
                    <span>{n === 'Sora' ? 'Day1 夜・襲撃' : 'Day1 昼・処刑'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="section-label">カミングアウト状況</div>
        <div className="co-board">
          <div className="co-row" style={{ ['--r-color']: 'var(--r-seer)' }}>
            <span className="role">占い師</span>
            <span className="name">Ren</span>
            <span className="meta">→ Mira（白）</span>
          </div>
          <div className="co-row" style={{ ['--r-color']: 'var(--r-seer)' }}>
            <span className="role">占い師</span>
            <span className="name">Nox</span>
            <span className="meta">→ Kai（黒）</span>
          </div>
          <div className="co-row" style={{ ['--r-color']: 'var(--r-medium)' }}>
            <span className="role">霊媒師</span>
            <span className="name" style={{ color: 'var(--tx-3)' }}>未CO</span>
            <span className="meta">—</span>
          </div>
          <div className="co-row" style={{ ['--r-color']: 'var(--r-hunter)' }}>
            <span className="role">狩人</span>
            <span className="name" style={{ color: 'var(--tx-3)' }}>潜伏</span>
            <span className="meta">—</span>
          </div>
        </div>

        <div className="section-label">夜の行動・推測</div>
        <div className="action-list">
          {ACTIONS_TIMELINE.map((a, i) => (
            <div key={i} className={`action ${a.kind}`}>
              <div className="when">D{a.day}{a.when}</div>
              <div className="ico">
                {a.kind === 'divine' ? '◉' : a.kind === 'guard' ? '盾' : a.kind === 'attack' ? '✕' : a.kind === 'exec' ? '⚑' : '・'}
              </div>
              <div className="what">
                <strong>{a.who}</strong> → <em style={{ ['--r-color']: ROLES[ROLE_ASSIGNMENT[a.target]?.role]?.color }}>{a.target}</em>
                <span style={{ color: 'var(--tx-4)', marginLeft: 6 }}>{a.label}</span>
              </div>
              {a.result && <div className={`res ${a.result}`}>{a.result === 'black' ? '黒' : '白'}</div>}
              {a.votes && <div className="res" style={{ color: 'var(--tx-3)' }}>{a.votes}票</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// === メイン観戦画面 ===
const SpectatorScreen = ({ density = 'card' }) => {
  const data = window.GAME_DATA;
  const events = data.events;

  // index by speech_id within day for reply lookup
  const prevById = {};
  events.forEach(e => { if (e.speech_id != null) prevById[`${e.day}-${e.speech_id}`] = e; });

  // Filter to Day 1, plus a couple of Day 2 highlights
  const d1 = events.filter(e => e.day === 1 && (e.event_type === 'speech' || (e.event_type === 'phase_start' && e.content.includes('GAME START'))));
  const d2 = events.filter(e => e.day === 2 && e.event_type === 'speech').slice(0, 6);

  // Inject claimed_role for known CO turns (demo, since real log doesn't tag it)
  const annotate = (e) => {
    if (e.day === 2 && e.agent === 'Ren' && e.speech_id === 1) return { ...e, claimed_role: 'seer' };
    if (e.day === 2 && e.agent === 'Nox' && e.speech_id === 2) return { ...e, claimed_role: 'seer' };
    return e;
  };

  return (
    <div className="frame">
      <div className="topbar">
        <div className="brand"><span className="mark">人</span>AGENT-WOLF<small>v0.13 / 観戦モード</small></div>
        <div className="crumb">
          <span className="sep">/</span>
          <a>観戦</a>
          <span className="sep">›</span>
          <a>第13回 桜霞村</a>
          <span className="sep">›</span>
          <span className="now">Day 2 議論</span>
        </div>
        <span className="spacer" />
        <button className="topbtn"><span className="live-dot" /> LIVE</button>
        <button className="topbtn">同時観戦 142</button>
        <button className="topbtn">⤓ 全ログDL</button>
        <button className="topbtn primary">★ 応援</button>
      </div>

      <div className="pane3">
        <LeftPane activeDay={2} setDay={() => {}} />

        <div className="col center">
          <div className="feed-head">
            <h2>Day 2 議論 <small>3:47 経過 / 残り 4:13</small></h2>
            <span className="stat">発言 <strong>17</strong></span>
            <span className="stat">CO <strong>2</strong></span>
            <span className="stat">投票確定 <strong>6/9</strong></span>
            <span className="spacer" />
            <button className="topbtn">⇅ 新しい順</button>
            <button className="topbtn">🔍 検索</button>
          </div>
          <div className="feed scroll-shadow">
            {d1.map((e, i) => <FeedItem key={i} ev={annotate(e)} prevById={prevById} />)}
            <SystemRow kind="exec" label="処刑" ts="11:14">
              <strong>Toma</strong> が処刑された（4票）。役職は <strong style={{ color: 'var(--r-villager)' }}>村人</strong> でした。
            </SystemRow>
            <VoteDetail day={1} />
            <SystemRow kind="phase" label="夜フェーズ" ts="11:20">夜が訪れた。占い師は対象を、人狼は襲撃先を、狩人は護衛を選択中…</SystemRow>
            <SystemRow kind="death" label="襲撃" ts="08:00">
              朝、<strong>Sora</strong> が無残な姿で発見された。村は大きく動揺している。
            </SystemRow>
            <SystemRow kind="phase" label="Day 2 議論開始" ts="08:05">2日目の議論が始まりました。</SystemRow>
            {d2.map((e, i) => <FeedItem key={`d2-${i}`} ev={annotate(e)} prevById={prevById} />)}
          </div>
        </div>

        <RightPane />
      </div>
    </div>
  );
};

window.SpectatorScreen = SpectatorScreen;

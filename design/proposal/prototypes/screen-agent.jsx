/* エージェント詳細画面 — VS Code風 collapsible panes */
const { Avatar, ROLES, AGENT_PALETTE } = window;

const AgentPicker = ({ current, onPick }) => {
  const all = ['Mira','Ren','Kai','Toma','Shiki','Rei','Sable','Sera','Kael','Sora','Nox'];
  const dead = new Set(['Sora', 'Toma']);
  return (
    <div className="agent-picker">
      <div className="section-label" style={{ paddingLeft: 6 }}>第13回 桜霞 · 全11名</div>
      {all.map(n => {
        const role = window.ROLE_ASSIGNMENT?.[n]?.role;
        const r = ROLES[role];
        const isCO = (n === 'Ren' || n === 'Nox');
        return (
          <div key={n}
               className={`pick ${current === n ? 'on' : ''} ${dead.has(n) ? 'dead' : ''}`}
               onClick={() => onPick(n)}
               style={{ ['--r-color']: r?.color }}>
            <Avatar name={n} role={role} size="sm" dead={dead.has(n)} />
            <div className="who">
              <span className="n">{n}</span>
              <span className="r">{r?.ja}{isCO && <span style={{ color: 'var(--acc)', marginLeft: 6 }}>占CO</span>}</span>
            </div>
            <span className="dot" />
          </div>
        );
      })}
      <div className="section-label" style={{ paddingLeft: 6, marginTop: 12 }}>並べ替え</div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button className="chip" style={{ width: '100%', justifyContent: 'flex-start' }}>発言数 ↓</button>
        <button className="chip" style={{ width: '100%', justifyContent: 'flex-start' }}>容疑度 ↓</button>
        <button className="chip" style={{ width: '100%', justifyContent: 'flex-start' }}>役職別</button>
      </div>
    </div>
  );
};

const AgentBody = ({ agent }) => {
  const data = window.GAME_DATA;
  const a = data.agents[agent] || {};
  const role = window.ROLE_ASSIGNMENT?.[agent]?.role || 'seer';
  const r = ROLES[role];
  const speeches = data.events.filter(e => e.event_type === 'speech' && e.agent === agent);
  const thoughts = speeches.filter(e => e.thought).slice(0, 4);

  return (
    <div className="pane-inner">
      <div className="agent-hero" style={{ ['--r-color']: r.color }}>
        <Avatar name={agent} role={role} highlight />
        <div>
          <h1>{agent}</h1>
          <div className="sub">
            <span className="role">{r.ja}</span>
            <span>所属: <strong style={{ color: 'var(--tx-2)' }}>{r.team === 'wolf' ? '人狼陣営' : '村人陣営'}</strong></span>
            <span>第13回・桜霞村</span>
            <span>生存中 · Day 2</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx-4)' }}>id: agent-{agent.toLowerCase()}-013</span>
          </div>
          <div className="blurb">「{a.persona_short || '静かな夜のように、相手の言葉のほつれを見つける。'}」</div>
        </div>
        <div className="stats">
          <div className="stat"><div className="n">68%</div><div className="l">勝率 (47戦)</div></div>
          <div className="stat"><div className="n">{speeches.length}</div><div className="l">本村発言</div></div>
          <div className="stat"><div className="n" style={{ color: 'var(--alive)' }}>+312</div><div className="l">応援スコア</div></div>
        </div>
      </div>
      <div className="agent-tabs">
        <div className="t on">概要</div>
        <div className="t">推論ログ ({thoughts.length})</div>
        <div className="t">疑い・信頼</div>
        <div className="t">夜の行動</div>
        <div className="t">プロンプト</div>
        <div className="t">過去の戦績</div>
      </div>
      <div style={{ padding: '20px 28px 60px' }}>
        <div className="panel">
          <h3>現在の目標 <small>Day 2 議論フェーズ</small></h3>
          <div className="goal-line">真の占い師として認知を取りつつ、Kai を確実に処刑へ追い込む。Ren の偽占いを論理的に崩す。</div>
        </div>

        <div className="panel">
          <h3>推論ログ <small>{thoughts.length} 件 · spectator限定</small></h3>
          {thoughts.map((t, i) => (
            <div className="thought" key={i}>
              <div className="th"><strong>D{t.day} #{t.speech_id} 発言前の思考</strong>
                <span className="ts">{(8 + (t.speech_id || 0) * 2 % 5)}:{String(((t.speech_id || 0) * 13) % 60).padStart(2, '0')}</span>
              </div>
              <div className="b">{t.thought.slice(0, 220)}{t.thought.length > 220 ? '…' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AgentRightPane = ({ agent }) => {
  const others = Object.keys(AGENT_PALETTE).filter(n => n !== agent);
  const matrix = others.map(n => {
    const seed = (agent + n).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
    return { name: n, sus: (seed * 17) % 100, trust: (seed * 13 + 30) % 100 };
  }).sort((x, y) => y.sus - x.sus);

  return (
    <div className="pane-inner" style={{ padding: '14px 14px 30px' }}>
      <div className="panel" style={{ marginBottom: 12 }}>
        <h3>疑い度マトリクス</h3>
        <div className="matrix">
          <div className="h">対象</div><div className="h">疑い ←→ 信頼</div><div className="h">疑</div><div className="h">信</div>
          {matrix.slice(0, 8).map(m => (
            <React.Fragment key={m.name}>
              <div className="name"><Avatar name={m.name} size="xs" />{m.name}</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div className="bar-wrap" style={{ flex: 1, transform: 'scaleX(-1)' }}><i style={{ width: `${m.sus}%`, background: 'var(--danger)' }} /></div>
                <div className="bar-wrap trust" style={{ flex: 1 }}><i style={{ width: `${m.trust}%` }} /></div>
              </div>
              <div className="num" style={{ color: 'var(--danger)' }}>{m.sus}</div>
              <div className="num" style={{ color: 'var(--info)' }}>{m.trust}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="panel">
        <h3>夜の行動</h3>
        {[{ d: 1, t: 'Kai' }, { d: 2, t: 'Sera' }].map((act, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, padding: '8px 0', borderBottom: '1px dashed var(--bd-soft)', fontSize: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', color: 'var(--tx-4)', fontSize: 10 }}>D{act.d} N</div>
            <div>
              <div style={{ color: 'var(--tx-2)' }}>占いを実行</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <Avatar name={act.t} size="xs" /> <span style={{ color: 'var(--tx)', fontFamily: 'var(--serif)' }}>{act.t}</span>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)', alignSelf: 'center' }}>黒</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>プロンプト構造</h3>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.7 }}>
          <div><span style={{ color: 'var(--acc)' }}>system</span>: 人狼ゲームのエージェント<span style={{ color: 'var(--tx-2)' }}>{agent}</span></div>
          <div><span style={{ color: 'var(--acc)' }}>persona</span>: 静かな観察者</div>
          <div><span style={{ color: 'var(--acc)' }}>role</span>: 占い師（真）</div>
          <div><span style={{ color: 'var(--acc)' }}>memory</span>: <span style={{ color: 'var(--tx-2)' }}>14 entries</span></div>
        </div>
      </div>
    </div>
  );
};

const Chev = ({ dir }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d={dir === 'left' ? 'M6 2 L3 5 L6 8' : 'M4 2 L7 5 L4 8'} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AgentDetailScreen = ({ agent: initial = 'Nox' }) => {
  const [agent, setAgent] = React.useState(initial);
  const [lc, setLc] = React.useState(false);
  const [rc, setRc] = React.useState(false);

  return (
    <div className="frame">
      <div className="topbar">
        <div className="brand"><span className="mark">人</span>AGENT-WOLF<small>v0.13 / Agent Profile</small></div>
        <div className="crumb">
          <span className="sep">/</span><a>r/agent-jinrou</a><span className="sep">›</span>
          <a>第13回 桜霞</a><span className="sep">›</span><span className="now">{agent}</span>
        </div>
        <span className="spacer" />
        <button className="topbtn"><span className="live-dot" /> LIVE観戦中</button>
        <button className="topbtn">⤓ プロファイルJSON</button>
        <button className="topbtn primary">★ ウォッチ</button>
      </div>

      <div className={`agent-shell ${lc ? 'l-collapsed' : ''} ${rc ? 'r-collapsed' : ''}`}>
        <div className={`pane left ${lc ? 'collapsed' : ''}`} style={{ position: 'relative' }}>
          <button className="pane-handle" onClick={() => setLc(!lc)} title={lc ? '展開' : '折りたたむ'}><Chev dir={lc ? 'right' : 'left'} /></button>
          {!lc && (
            <div className="pane-inner">
              <div style={{ padding: '14px 14px 4px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--tx-2)', letterSpacing: '0.05em' }}>エージェント</div>
                <span style={{ fontSize: 10, color: 'var(--tx-4)', fontFamily: 'var(--mono)' }}>9 alive · 2 dead</span>
              </div>
              <AgentPicker current={agent} onPick={setAgent} />
            </div>
          )}
          <div className="rail">
            <span className="ico">人</span>
            <span className="label">エージェント</span>
          </div>
        </div>

        <div className="pane main">
          <AgentBody agent={agent} />
        </div>

        <div className={`pane right ${rc ? 'collapsed' : ''}`} style={{ position: 'relative' }}>
          <button className="pane-handle" onClick={() => setRc(!rc)} title={rc ? '展開' : '折りたたむ'}><Chev dir={rc ? 'left' : 'right'} /></button>
          {!rc && <AgentRightPane agent={agent} />}
          <div className="rail">
            <span className="ico">析</span>
            <span className="label">推論・夜行動</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.AgentDetailScreen = AgentDetailScreen;

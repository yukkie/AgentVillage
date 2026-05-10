/* 観戦画面 — 高密度BBSバリアント */
const { Avatar, ROLES, Mentioned, fmtTime } = window;

const SpectatorDenseScreen = () => {
  const data = window.GAME_DATA;
  const events = data.events;
  const ROLE_ASSIGNMENT = window.ROLE_ASSIGNMENT || {};

  const items = [];
  const d1Speeches = events.filter(e => e.day === 1 && e.event_type === 'speech');
  d1Speeches.forEach(e => items.push({ kind: 'speech', e }));
  items.push({ kind: 'sys', label: '投票結果', text: '4票で Toma を処刑（村人だった）。' });
  items.push({ kind: 'sys', label: '夜', text: 'Sora が襲撃された。狩人の護衛は Nox に当たり、占い師は健在。' });
  events.filter(e => e.day === 2 && e.event_type === 'speech').slice(0, 8).forEach(e => items.push({ kind: 'speech', e }));

  return (
    <div className="frame">
      <div className="topbar">
        <div className="brand"><span className="mark">人</span>AGENT-WOLF<small>v0.13 / Compact BBS</small></div>
        <div className="crumb"><span className="sep">/</span><a>観戦</a><span className="sep">›</span><span className="now">第13回・桜霞 (高密度)</span></div>
        <span className="spacer" />
        <button className="topbtn">表示密度: <strong style={{ color: 'var(--tx)' }}>高</strong></button>
        <button className="topbtn"><span className="live-dot" /> LIVE Day2</button>
        <button className="topbtn primary">★ 応援</button>
      </div>

      <div className="pane3" style={{ gridTemplateColumns: '220px 1fr 320px' }}>
        <div className="col left">
          <div className="phase-nav">
            <div className="section-label">議事録</div>
            {[1, 2, 3].map(d => (
              <div key={d} className="phase-day">
                <h3>第{d}日 <small>{d === 1 ? '12発言' : d === 2 ? '17発言・進行中' : '未開始'}</small></h3>
              </div>
            ))}
          </div>
          <div className="filt">
            <div className="section-label">役職別ハイライト</div>
            <div className="filt-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {Object.entries(ROLES).map(([k, v]) => (
                <button key={k} className="chip" style={{ ['--r-color']: v.color, justifyContent: 'flex-start' }}>
                  <span className="swatch" style={{ background: v.color }} /> {v.ja}を強調
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col center">
          <div className="feed-head">
            <h2>議事ログ <small>第13回・桜霞 / 高密度表示</small></h2>
            <span className="stat">総発言 <strong>29</strong></span>
            <span className="stat">死亡 <strong>2</strong></span>
            <span className="spacer" />
            <button className="topbtn">⇅ 古い順</button>
            <button className="topbtn">展開</button>
          </div>

          <div className="feed bbs-feed">
            {items.map((it, i) => {
              if (it.kind === 'sys') {
                return (
                  <div key={i} className="bbs-line sys">
                    <div className="num">—</div>
                    <div className="who">[{it.label}]</div>
                    <div className="meta"><span className="role">SYS</span></div>
                    <div className="text">{it.text}</div>
                  </div>
                );
              }
              const e = it.e;
              const role = ROLE_ASSIGNMENT[e.agent]?.role;
              const r = ROLES[role];
              return (
                <div key={i} className="bbs-line" style={{ ['--r-color']: r?.color }}>
                  <div className="num">#{e.day}-{e.speech_id}</div>
                  <div className="who">
                    <Avatar name={e.agent} size="xs" />
                    <span className="name">{e.agent}</span>
                  </div>
                  <div className="meta">
                    <span className="role">{r?.ja || '—'}</span>
                    <span>{fmtTime(e.day, e.speech_id)}</span>
                    <span>D{e.day} T{e.speech_id}</span>
                  </div>
                  <div className="text">
                    {e.reply_to && (
                      <div className="reply">▶ #{e.reply_to} への返信</div>
                    )}
                    <Mentioned text={e.content} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col right">
          <div className="roster">
            <div className="section-label">陣営バランス（観戦者推測）</div>
            <div style={{ padding: '0 14px 16px' }}>
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: '60%', background: 'var(--r-villager)', color: '#0c0e12', fontSize: 11, fontWeight: 600, fontFamily: 'var(--serif)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>村 60%</div>
                  <div style={{ width: '32%', background: 'var(--r-werewolf)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'var(--serif)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>狼 32%</div>
                  <div style={{ width: '8%', background: 'var(--r-madman)', fontSize: 10, fontFamily: 'var(--serif)', color: '#1a1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>狂</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.5 }}>
                  Day2 残り議論時間で村陣営優勢。<strong style={{ color: 'var(--tx)' }}>Ren</strong> 処刑の流れが固まりつつある。
                </div>
              </div>
            </div>

            <div className="section-label">Top 容疑エージェント（投票傾向ベース）</div>
            <div className="action-list">
              {[['Ren', 78, '偽占CO疑い'], ['Kai', 72, 'Nox占い結果黒'], ['Sera', 54, 'Ren庇いすぎ'], ['Kael', 41, '投票方向不一致']].map(([n, p, why]) => {
                const role = ROLE_ASSIGNMENT[n]?.role;
                return (
                  <div key={n} className="roster-row" style={{ ['--r-color']: ROLES[role]?.color }}>
                    <Avatar name={n} role={role} size="sm" />
                    <div className="who">
                      <span className="name">{n}</span>
                      <span className="sub">{why}</span>
                    </div>
                    <div className="meter">
                      <div className="bar"><i style={{ width: `${p}%` }} /></div>
                      <small><span>{p}</span><span>容疑</span></small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="section-label">この村のキーモーメント</div>
            <div className="action-list">
              <div className="action divine">
                <div className="when">D1#7</div><div className="ico">◉</div>
                <div className="what">Mira が <em>Ren</em> の白先理由を質問</div>
              </div>
              <div className="action exec">
                <div className="when">D1終</div><div className="ico">⚑</div>
                <div className="what">Toma 処刑、村人だった</div>
              </div>
              <div className="action attack">
                <div className="when">D2朝</div><div className="ico">✕</div>
                <div className="what">Sora が襲撃される</div>
              </div>
              <div className="action divine">
                <div className="when">D2#3</div><div className="ico">◉</div>
                <div className="what">Nox が真占CO・<em>Kai</em> 黒</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.SpectatorDenseScreen = SpectatorDenseScreen;

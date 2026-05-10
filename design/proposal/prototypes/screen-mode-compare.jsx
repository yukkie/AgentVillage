/* スペクテーター vs パブリック 視点比較 */
const { Avatar, ROLES, RoleTag, Mentioned, fmtTurn, fmtTime, AGENT_PALETTE } = window;
const ROLE_ASSIGNMENT_VS = window.ROLE_ASSIGNMENT;

// 同じ場面を2列で表示。Day2 で Ren が偽占CO、Nox が対抗CO、Kai が反応する場面。
const SCENE = [
  { agent: 'Ren', day: 2, speech_id: 1, claimed_role: 'seer',
    content: '昨夜のうちに占いました。Mira は白でした。私を信じてください。霊媒師の方も早めにCOを。',
    thought: '[内心] Mira白先は安全策。Mira村側で固いから外しても影響軽微。Day1夜にKai-Sera体制で動いた以上、ここで真占いを取りに行かないと吊られる。' },
  { agent: 'Nox', day: 2, speech_id: 3, claimed_role: 'seer', reply_to: 1,
    content: '対抗します。私が真占いです。Day1夜は Kai を視ました — 黒です。',
    thought: '[内心] 確実にKaiが狼。Renは噛まれていないので狂人か狼の偽占の可能性が高い。村に強く印象づけたい。' },
  { agent: 'Kai',  day: 2, speech_id: 5, reply_to: 3,
    content: '俺が黒？冗談だろ。Nox、その占い結果はおかしい。逆にあんたが偽だと思う。',
    thought: '[内心] 詰みかけ。狂人Kaelが仕事してくれれば票が割れる。Sera(相棒)に視線を流さないこと。' },
];

// 共通スキーラ
const Stage = ({ ev, mode }) => {
  const role = ROLE_ASSIGNMENT_VS[ev.agent]?.role;
  const r = ROLES[role];
  const showActualRole = mode === 'spectator';
  const claimedRole = ev.claimed_role;
  const isFakeCO = claimedRole && role !== claimedRole && mode === 'spectator';

  // public表示用のロール: 自称CO役職（あれば）/ 死亡時に判明した役職 / それ以外は不明
  const publicRole = claimedRole || null;
  const displayRole = showActualRole ? role : publicRole;
  const displayChipColor = showActualRole ? r?.color : ROLES[publicRole]?.color;
  const replied = ev.reply_to ? SCENE.find(s => s.speech_id === ev.reply_to) : null;

  return (
    <div className={`speech ${role === 'werewolf' && mode === 'spectator' ? 'role-werewolf' : ''}`}
      style={{ ['--r-color']: displayChipColor || 'var(--bd)', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Avatar name={ev.agent} role={showActualRole ? role : null} />
        {!showActualRole && (
          // public: 役職プレースホルダーを ? に
          <div style={{
            position: 'absolute', bottom: 4, left: 4,
            fontSize: 9, fontFamily: 'var(--serif)',
            background: 'rgba(0,0,0,0.55)',
            color: 'var(--tx-3)',
            padding: '1px 4px', borderRadius: 2,
            letterSpacing: '0.05em',
          }}>?</div>
        )}
      </div>
      <div className="vert" />
      <div>
        <div className="sp-head">
          <span className="name">{ev.agent}</span>
          <span className="alias">エージェント#{ev.agent.charCodeAt(0) % 99}</span>

          {/* 役職タグの見え方が モードで変わる */}
          {showActualRole && <RoleTag role={role} />}
          {claimedRole && (
            <span className="co-badge" style={{
              background: isFakeCO
                ? 'color-mix(in oklab, var(--danger) 14%, transparent)'
                : 'color-mix(in oklab, var(--acc) 14%, transparent)',
              borderColor: isFakeCO
                ? 'color-mix(in oklab, var(--danger) 50%, transparent)'
                : 'color-mix(in oklab, var(--acc) 50%, transparent)',
              color: isFakeCO ? 'var(--danger)' : 'var(--acc)',
            }}>
              ▶ {ROLES[claimedRole].ja} CO
              {isFakeCO && <span style={{ marginLeft: 6, fontSize: 9, fontFamily: 'var(--mono)' }}>偽</span>}
            </span>
          )}
          <span className="turn">{fmtTurn(ev.day, ev.speech_id)}</span>
          <span className="ts">{fmtTime(ev.day, ev.speech_id)}</span>
        </div>

        {replied && (
          <div className="sp-quote">
            <div className="qhead">▶ {replied.agent} #{replied.day}-{replied.speech_id} への返信</div>
            <div>{replied.content.slice(0, 80)}…</div>
          </div>
        )}

        <div className="sp-body"><Mentioned text={ev.content} /></div>

        {/* 思考ログ pill: spectator のみ */}
        {showActualRole && ev.thought && (
          <details className="sp-think" open={ev.speech_id === 3}>
            <summary>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H7.5L4.7 13.4a.4.4 0 0 1-.7-.28V11H3.5C2.67 11 2 10.33 2 9.5v-6Z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="5.5" cy="6.5" r="0.7" fill="currentColor"/><circle cx="8" cy="6.5" r="0.7" fill="currentColor"/><circle cx="10.5" cy="6.5" r="0.7" fill="currentColor"/>
              </svg>
              <span className="label">思考ログを読む</span>
              <span className="conf">{ev.thought.length} 字 · spectator限定</span>
            </summary>
            <div className="body">{ev.thought}</div>
          </details>
        )}

        {/* public: 思考ログがロックされていることを薄く表示 */}
        {!showActualRole && ev.thought && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tx-4)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px dashed var(--bd)', borderRadius: 14, background: 'rgba(0,0,0,0.2)' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
            思考ログは観戦モードでのみ表示されます
          </div>
        )}
      </div>
    </div>
  );
};

const Roster = ({ mode }) => {
  const all = ['Mira','Ren','Kai','Toma','Shiki','Rei','Sable','Sera','Kael','Sora','Nox'];
  return (
    <div style={{ padding: 12 }}>
      <div className="section-label" style={{ paddingLeft: 4, paddingTop: 4 }}>
        参加者ロスター（{mode === 'spectator' ? 'spectator' : 'public'}視点）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {all.map(n => {
          const role = ROLE_ASSIGNMENT_VS[n]?.role;
          const claimed = (n === 'Ren' || n === 'Nox') ? 'seer' : null;
          const isFake = mode === 'spectator' && claimed && claimed !== role;
          const dead = n === 'Sora' || n === 'Toma';
          return (
            <div key={n} className="roster-row" style={{ ['--r-color']: ROLES[role]?.color, opacity: dead ? 0.55 : 1 }}>
              <Avatar name={n} role={mode === 'spectator' ? role : (dead ? role : null)} size="sm" dead={dead} />
              <div className="who">
                <span className="name">{n}
                  {mode === 'spectator' && <span style={{ marginLeft: 6 }}><RoleTag role={role} /></span>}
                </span>
                <span className="sub">
                  {claimed && (
                    <span style={{ color: isFake ? 'var(--danger)' : 'var(--acc)', fontFamily: 'var(--serif)', fontSize: 10 }}>
                      {isFake ? '偽占CO' : '占CO'}
                    </span>
                  )}
                  {!claimed && !dead && mode === 'public' && <span style={{ color: 'var(--tx-4)' }}>役職不明</span>}
                  {dead && <span style={{ color: 'var(--tx-4)' }}>{n === 'Sora' ? 'D1夜・襲撃' : 'D1昼・処刑'}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Column = ({ mode }) => {
  const isSpec = mode === 'spectator';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 16px',
        background: isSpec
          ? 'linear-gradient(180deg, rgba(240,199,95,0.10), var(--bg-1))'
          : 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
        borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 4,
          background: isSpec ? 'var(--acc)' : 'var(--bg-3)',
          color: isSpec ? '#1a1408' : 'var(--tx-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 700,
        }}>{isSpec ? '神' : '民'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>
            {isSpec ? '観戦モード（spectator）' : '参加者視点（public）'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>
            {isSpec ? '真の役職・思考ログ・真偽判定が見える' : 'プレイヤー側UIと等価。COのみ表示、思考は遮蔽'}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--tx-4)', fontFamily: 'var(--mono)' }}>D2 議論中 #1〜#5</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {SCENE.map((ev, i) => <Stage key={i} ev={ev} mode={mode} />)}
        <div style={{ borderTop: '1px solid var(--bd-soft)' }}>
          <Roster mode={mode} />
        </div>
      </div>
    </div>
  );
};

const ModeCompareScreen = () => (
  <div className="frame" style={{ overflow: 'auto' }}>
    <div className="topbar">
      <div className="brand"><span className="mark">人</span>AGENT-WOLF<small>v0.13 / Mode Compare</small></div>
      <div className="crumb">
        <span className="sep">/</span><a>観戦</a><span className="sep">›</span>
        <a>第13回 桜霞</a><span className="sep">›</span><span className="now">spectator vs public</span>
      </div>
      <span className="spacer" />
      <button className="topbtn">⇆ 同期スクロール</button>
    </div>

    <div style={{ padding: '20px 28px 32px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ marginBottom: 16, maxWidth: 880 }}>
        <div style={{ fontSize: 11, color: 'var(--tx-3)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>UI Study</div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: 0, fontWeight: 600 }}>
          観戦者と参加者では、同じ瞬間が <span style={{ color: 'var(--acc)' }}>こう違って見える</span>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.7, marginTop: 6 }}>
          Day 2 で偽占い <strong>Ren</strong>・真占い <strong>Nox</strong> が衝突する場面。
          <strong>spectator</strong> は神視点（真の役職・思考ログ・偽COの判定）まで見えるのに対し、
          <strong>public</strong> は『誰が何を主張したか』だけが見え、立ち絵の役職刻印も「?」になります。
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        flex: 1, minHeight: 580,
      }}>
        <Column mode="spectator" />
        <Column mode="public" />
      </div>

      <div style={{
        marginTop: 16, padding: '12px 16px',
        border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg-1)',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
        fontSize: 11.5, color: 'var(--tx-2)', lineHeight: 1.55,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', color: 'var(--tx)', fontSize: 12, marginBottom: 4 }}>① 役職タグ</div>
          spectator: 真の役職を常時表示。public: 自称COのみ、未COは「役職不明」。
        </div>
        <div>
          <div style={{ fontFamily: 'var(--serif)', color: 'var(--tx)', fontSize: 12, marginBottom: 4 }}>② 偽CO判定</div>
          spectator のみ COバッジが <span style={{ color: 'var(--danger)' }}>赤</span>＋「偽」マークに変化。
        </div>
        <div>
          <div style={{ fontFamily: 'var(--serif)', color: 'var(--tx)', fontSize: 12, marginBottom: 4 }}>③ 立ち絵の刻印</div>
          spectator: 役職名（占/狼/狂…）。public: 「?」のみ、死亡判定後にだけ確定刻印。
        </div>
        <div>
          <div style={{ fontFamily: 'var(--serif)', color: 'var(--tx)', fontSize: 12, marginBottom: 4 }}>④ 思考ログ</div>
          spectator のみ吹き出しピルから展開可。public はロック表示でその存在だけ示す。
        </div>
      </div>
    </div>
  </div>
);

window.ModeCompareScreen = ModeCompareScreen;

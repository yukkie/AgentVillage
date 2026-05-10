/* 返信 (reply-to) UI 3バリエーション比較 */
const { Avatar, ROLES, RoleTag, Mentioned, fmtTurn, fmtTime } = window;
const ROLE_ASSIGNMENT = window.ROLE_ASSIGNMENT;

// 例示用の親発言と返信ペア
const EXAMPLE_PARENT = {
  agent: 'Ren', day: 2, speech_id: 1,
  content: '昨夜のうちに占いました。Mira は白でした。村の流れを止めないために、まずは私を信じてください。霊媒師の方も早めにCO願いたい。',
};
const EXAMPLE_REPLY = {
  agent: 'Nox', day: 2, speech_id: 3,
  content: 'その占い、急ぎすぎでは。Mira白に絞った理由を聞かせてほしい。\n私は別ルートで占い師として動いていて、Day1夜は Kai を視ました。結果は黒です。Ren の白先と私の黒結果、どちらが噛み合うか、村で確かめましょう。',
};

const Card = ({ ev, role, replied, mode, dim }) => {
  const r = ROLES[role];
  return (
    <div className="speech" style={{ ['--r-color']: r?.color, opacity: dim ? 0.55 : 1, paddingLeft: mode === 'thread' ? 56 : 24 }}>
      {mode === 'thread' && replied && (
        <svg width="34" height="60" style={{ position: 'absolute', left: 28, top: -4 }}>
          <path d="M6 0 V32 Q6 44 18 44 H30" stroke="var(--bd)" strokeWidth="1.5" fill="none" />
        </svg>
      )}
      <Avatar name={ev.agent} role={role} />
      <div>
        <div className="sp-head">
          <span className="name">{ev.agent}</span>
          <span className="alias">エージェント#{ev.agent.charCodeAt(0) % 99}</span>
          <RoleTag role={role} />
          <span className="turn">{fmtTurn(ev.day, ev.speech_id)}</span>
          {mode === 'pill' && replied && (
            <span style={{
              fontSize: 10.5, fontFamily: 'var(--mono)',
              color: 'var(--tx-3)',
              background: 'var(--bg-2)',
              border: '1px solid var(--bd)',
              padding: '1px 7px', borderRadius: 10,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              ↩ @{replied.agent} #{replied.day}-{replied.speech_id}
            </span>
          )}
          <span className="ts">{fmtTime(ev.day, ev.speech_id)}</span>
        </div>

        {mode === 'quote' && replied && (
          <div className="sp-quote">
            <div className="qhead">▶ {replied.agent} #{replied.day}-{replied.speech_id} への返信</div>
            <div>{replied.content.slice(0, 90)}{replied.content.length > 90 ? '…' : ''}</div>
          </div>
        )}

        {mode === 'pill' && replied && (
          <div style={{ fontSize: 11, color: 'var(--tx-4)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--mono)' }}>┗</span>
            <span>「{replied.content.slice(0, 38)}…」を引用するには</span>
            <button style={{
              background: 'transparent', border: '1px solid var(--bd-soft)',
              color: 'var(--tx-3)', borderRadius: 10, padding: '0 6px',
              fontSize: 10, height: 18, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>＋ 展開</button>
          </div>
        )}

        <div className="sp-body"><Mentioned text={ev.content} /></div>
      </div>
    </div>
  );
};

const ReplyVariantsScreen = () => {
  const variants = [
    { id: 'A', mode: 'quote',  title: 'A. 引用ブロック型',  desc: 'メールの返信のように、対象発言の冒頭を引用ボックスで提示。発言が独立した場でも、何への反応か必ずわかる。 — 推奨' },
    { id: 'B', mode: 'thread', title: 'B. インデント＋接続線型', desc: '返信先の直下に親→子の曲線で接続。ツリー構造が直感的。スレッドが深くなると視認性が落ちるリスク。' },
    { id: 'C', mode: 'pill',   title: 'C. 参照ピル型',      desc: '冒頭にメンション風のピルだけ。テキスト密度が最も高く、Twitter的。引用本文は必要な人だけ展開。' },
  ];

  const role = ROLE_ASSIGNMENT[EXAMPLE_REPLY.agent]?.role;
  const parentRole = ROLE_ASSIGNMENT[EXAMPLE_PARENT.agent]?.role;

  return (
    <div className="frame" style={{ overflowY: 'auto' }}>
      <div className="topbar">
        <div className="brand"><span className="mark">人</span>AGENT-WOLF<small>v0.13 / Reply UI Studies</small></div>
        <div className="crumb">
          <span className="sep">/</span><a>観戦</a><span className="sep">›</span>
          <a>第13回 桜霞</a><span className="sep">›</span>
          <span className="now">返信表示の3案</span>
        </div>
        <span className="spacer" />
        <button className="topbtn">← Day 2 議論に戻る</button>
      </div>

      <div style={{ padding: '24px 32px 40px', background: 'var(--bg)', flex: 1 }}>
        <div style={{ maxWidth: 880, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>UI Study</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: 0, color: 'var(--tx)', fontWeight: 600 }}>返信が付いた発言の見え方 — 3パターン</h2>
          <p style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.7, marginTop: 8 }}>
            人狼ゲームでは『誰が誰の発言に応答したか』が読み筋に直結します。同じ発言ペア（Ren の偽占CO ↔ Nox の対抗占CO）を3通りで描きました。
          </p>
        </div>

        {variants.map(v => (
          <div key={v.id} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, paddingLeft: 4 }}>
              <span style={{
                fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600,
                color: 'var(--acc)',
                border: '1px solid color-mix(in oklab, var(--acc) 40%, transparent)',
                background: 'color-mix(in oklab, var(--acc) 10%, transparent)',
                padding: '2px 8px', borderRadius: 2, letterSpacing: '0.02em',
              }}>{v.id}</span>
              <h3 style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'var(--tx)', margin: 0 }}>{v.title}</h3>
              <span style={{ fontSize: 12, color: 'var(--tx-3)', flex: 1 }}>{v.desc}</span>
            </div>
            <div style={{
              border: '1px solid var(--bd)', borderRadius: 8,
              background: 'var(--bg-1)', overflow: 'hidden',
              maxWidth: 880,
            }}>
              <Card ev={EXAMPLE_PARENT} role={parentRole} mode={v.mode} dim={v.mode !== 'thread'} />
              <Card ev={EXAMPLE_REPLY} role={role} replied={EXAMPLE_PARENT} mode={v.mode} />
            </div>
          </div>
        ))}

        <div style={{ marginTop: 30, padding: 16, border: '1px dashed var(--bd)', borderRadius: 8, maxWidth: 880, fontSize: 12.5, color: 'var(--tx-2)', lineHeight: 1.7, background: 'rgba(240,199,95,0.03)' }}>
          <strong style={{ fontFamily: 'var(--serif)', color: 'var(--tx)', fontSize: 13 }}>所感</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li><strong>A</strong> は読みもれが少なく、観戦初心者にも親切。最有力。</li>
            <li><strong>B</strong> は『ターン内の応酬』が短いときに気持ちいいが、Day3以降スレッドが分岐すると破綻しやすい。スレッド表示モードのオプション扱いに。</li>
            <li><strong>C</strong> は議論ハイライト動画やSNS共有用の小サイズ表示で活きる。メイン画面のデフォルトには情報量不足。</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

window.ReplyVariantsScreen = ReplyVariantsScreen;

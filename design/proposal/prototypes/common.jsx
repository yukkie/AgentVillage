/* AI人狼観戦ビューア — 共通コンポーネント */

const ROLES = {
  villager: { ja: '村人', short: '村', color: 'var(--r-villager)', team: 'village' },
  seer:     { ja: '占い師', short: '占', color: 'var(--r-seer)', team: 'village' },
  medium:   { ja: '霊媒師', short: '霊', color: 'var(--r-medium)', team: 'village' },
  hunter:   { ja: '狩人', short: '狩', color: 'var(--r-hunter)', team: 'village' },
  madman:   { ja: '狂人', short: '狂', color: 'var(--r-madman)', team: 'wolf' },
  werewolf: { ja: '人狼', short: '狼', color: 'var(--r-werewolf)', team: 'wolf' },
};

// Per-agent palette (hue varies, role gets desaturated tint via Avatar)
const AGENT_PALETTE = {
  Mira:  '#7fb0e0', Ren: '#c89a5d', Kai: '#7ed1a3', Toma: '#d98a8a',
  Shiki: '#a18bd0', Rei: '#d6b978', Sable: '#9aa3b6', Sera: '#e08fb8',
  Kael: '#7ec9c2', Sora: '#cdd29a', Nox: '#b06b8c',
};

const Avatar = ({ name, role, dead, size = 'md', highlight }) => {
  const c = AGENT_PALETTE[name] || '#888';
  const r = role && ROLES[role];
  const cls = `av ${size === 'sm' ? 'sm' : size === 'xs' ? 'xs' : ''}`;
  return (
    <div className={cls} style={{ ['--av-c']: c, boxShadow: highlight ? `0 0 0 2px ${c}` : 'none' }}>
      <div className="grad" />
      <div className="mono">{(name || '?').charAt(0)}</div>
      {r && <div className="role-mark">{r.ja}</div>}
      {dead && <div className="dead-mark">死亡</div>}
    </div>
  );
};

const RoleTag = ({ role, kind = 'tag' }) => {
  const r = ROLES[role];
  if (!r) return null;
  return <span className="role-tag" style={{ ['--r-color']: r.color }}>{r.ja}</span>;
};

// Light renderer that adds @-mentions styling for known agent names
const Mentioned = ({ text }) => {
  if (!text) return null;
  const names = Object.keys(AGENT_PALETTE);
  const re = new RegExp(`(${names.join('|')})`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => names.includes(p) ? <span key={i} className="mention">@{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>);
};

const fmtTurn = (day, turn, phase = 'day') =>
  `D${day}・${phase === 'night' ? 'N' : 'T'}${String(turn).padStart(2, '0')}`;

// Synthetic timestamps (10:30 + 30s per turn within day)
const fmtTime = (day, turn) => {
  const base = new Date(2026, 4, 10, 10, 0);
  base.setMinutes(base.getMinutes() + (day - 1) * 38 + (turn || 0) * 2);
  return base.toTimeString().slice(0, 5);
};

Object.assign(window, { ROLES, AGENT_PALETTE, Avatar, RoleTag, Mentioned, fmtTurn, fmtTime });

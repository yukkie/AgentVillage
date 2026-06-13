import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import RoleTag from './RoleTag.jsx';
import { ROLES } from '../lib/constants.js';
import styles from './AgentRosterRow.module.css';

/**
 * ロスター（SpectatorScreen 右ペイン）と参加者ピッカー（AgentDetailScreen 左ペイン）で
 * 共有する統一エージェント行。レイアウトは AgentDetail picker 式（アイコン左・名前/役職を
 * 縦2行で右・statusDot 右端）、表示情報は SpectatorScreen 式（役職タグ・CO バッジ・死因メタ）。
 *
 * 特定 screen の state（useParams 等）に依存しない props ベースのコンポーネント。
 * 遷移先 `to` と役職表示可否 `showRole` は呼び出し側で計算して渡す。
 */
export default function AgentRosterRow({ name, role, to, showRole = false, coRole, dead = false, deathMeta, showStatusDot = true, selected = false }) {
  const r = ROLES[role];
  return (
    <li className={`${styles.row} ${dead ? styles.dead : ''} ${showStatusDot ? '' : styles.noDot} ${selected ? styles.selected : ''}`} style={{ '--r-color': r?.color }}>
      <Link to={to} className={styles.link}>
        <Avatar name={name} role={showRole ? role : undefined} size="sm" dead={dead} />
        <div className={styles.who}>
          <span className={styles.name}>{name}</span>
          <span className={styles.meta}>
            {showRole && <RoleTag role={role} />}
            {coRole && (
              <span className={styles.coBadge} style={{ '--co-color': ROLES[coRole]?.color }}>
                ▶ {ROLES[coRole]?.ja || coRole} CO
              </span>
            )}
            {deathMeta && (
              <span className={styles.deathReason}>Day {deathMeta.day} · {deathMeta.content}</span>
            )}
          </span>
        </div>
        {showStatusDot && <span className={styles.statusDot} />}
      </Link>
    </li>
  );
}

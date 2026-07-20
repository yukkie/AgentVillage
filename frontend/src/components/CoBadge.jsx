import { ROLE_META_BY_KEY } from '../lib/roleMeta.js';
import styles from './CoBadge.module.css';

/**
 * CO（カミングアウト）役職バッジ。「▶ {役職 日本語名} CO」を表示する。
 * `FeedCard.jsx`（SpeechCard）・`AgentRosterRow.jsx` の重複 JSX を共通化（#596）。
 * ROLE_META_BY_KEY にない role キーでも生キーをそのまま表示する（防御フォールバック。既存挙動保存）。
 */
export default function CoBadge({ role }) {
  if (!role) return null;
  const meta = ROLE_META_BY_KEY[role];
  return (
    <span className={styles.coBadge} style={{ '--co-color': meta?.color }}>
      ▶ {meta?.ja || role} CO
    </span>
  );
}

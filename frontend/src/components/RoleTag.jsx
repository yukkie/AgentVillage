import { ROLES } from '../lib/constants.js';
import styles from './RoleTag.module.css';

/**
 * 役職バッジ。役職名と役職カラーを表示する。
 * @param {string} role - 役職キー（例: "Werewolf"）
 */
export default function RoleTag({ role }) {
  const info = ROLES[role];
  if (!info) return null;
  return (
    <span className={styles.tag} style={{ '--r-color': info.color }}>
      {info.ja}
    </span>
  );
}

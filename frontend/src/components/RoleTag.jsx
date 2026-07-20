import { ROLE_META_BY_KEY } from '../lib/roleMeta.js';
import styles from './RoleTag.module.css';

/**
 * 役職バッジ。役職名と役職カラーを表示する。
 * ROLE_META_BY_KEY にない未知キーでも生キーをフォールバック表示する（防御フォールバック、#599 判断1 A案）。
 * @param {string} role - 役職キー（例: "Werewolf"）
 * @param {string} [className] - 呼び出し側のレイアウト制約クラス（styles.tag と結合。#599 AC-4）
 */
export default function RoleTag({ role, className }) {
  if (!role) return null;
  const info = ROLE_META_BY_KEY[role];
  return (
    <span className={`${styles.tag} ${className ?? ''}`.trim()} style={{ '--r-color': info?.color }}>
      {info?.ja ?? role}
    </span>
  );
}

import styles from './StatusMessage.module.css';

/**
 * 非同期取得の loading / error を表示する共通ステータス行（#595）。
 * 文言は呼び出し側が children で渡す（画面ごとに文言が異なるため部品側では固定しない）。
 * kind が色トークン（loading→--tx-4 / error→--danger）を決める。
 * レイアウト（padding 等）は呼び出し側の className で与える（RoleTag #599 AC-4 と同方針）。
 *
 * @param {'loading'|'error'} [kind] - ステータス種別。色トークンを決定する（デフォルト 'loading'）
 * @param {string} [className] - 呼び出し側のレイアウト制約クラス（styles.status と結合）
 * @param {import('react').ReactNode} children - 表示する文言
 */
export default function StatusMessage({ kind = 'loading', className = '', children }) {
  return (
    <div className={`${styles.status} ${styles[kind]} ${className}`.trim()} data-status={kind}>
      {children}
    </div>
  );
}

import styles from './ThreePaneLayout.module.css';

/**
 * 共通3カラムレイアウト（左256px・中央flex・右360px）
 */
export default function ThreePaneLayout({ left, right, children }) {
  return (
    <div className={styles.shell}>
      <div className={styles.colLeft}>{left}</div>
      <div className={styles.colCenter}>{children}</div>
      <div className={styles.colRight}>{right}</div>
    </div>
  );
}

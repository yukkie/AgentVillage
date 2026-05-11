import styles from './TopBar.module.css';

/**
 * 共通トップバー。children に右側ボタン群を渡す。
 * @param {{ label: string, onClick?: () => void }[]} crumbs  - パンくずリスト（最後の要素が現在地）
 * @param {React.ReactNode} children - 右端に表示するボタン群
 */
export default function TopBar({ crumbs = [], children }) {
  return (
    <div className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.mark}>人</span>
        AGENT-WOLF
        <small>v0.13 / Spectator Hub</small>
      </div>
      <div className={styles.crumb}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className={styles.sep}>/</span>
            {i < crumbs.length - 1
              ? <a onClick={c.onClick}>{c.label}</a>
              : <span className={styles.now}>{c.label}</span>
            }
          </span>
        ))}
      </div>
      <span className={styles.spacer} />
      {children}
    </div>
  );
}

/**
 * TopBar 内で使う共通ボタン
 */
export function TopBarBtn({ primary, children, ...props }) {
  return (
    <button
      className={`${styles.btn} ${primary ? styles.primary : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

export { styles as topBarStyles };

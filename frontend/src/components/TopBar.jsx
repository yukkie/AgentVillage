import { Link } from 'react-router-dom';
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
      <nav className={styles.crumb} aria-label="パンくず">
        <ol className={styles.crumbList}>
          {crumbs.map((c, i) => {
            const isCurrent = i === crumbs.length - 1;
            return (
              <li key={i} className={styles.crumbItem}>
                {i > 0 && <span className={styles.sep} aria-hidden="true">/</span>}
                {isCurrent
                  ? <span className={styles.now} aria-current="page">{c.label}</span>
                  : c.to
                    ? <Link to={c.to}>{c.label}</Link>
                    : c.onClick
                      ? <a href="#" onClick={(e) => { e.preventDefault(); c.onClick(); }}>{c.label}</a>
                      : <span>{c.label}</span>
                }
              </li>
            );
          })}
        </ol>
      </nav>
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

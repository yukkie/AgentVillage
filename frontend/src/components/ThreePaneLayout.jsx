import { useState } from 'react';
import styles from './ThreePaneLayout.module.css';

export default function ThreePaneLayout({
  left, right, children,
  collapsibleLeft = false,
  collapsibleRight = false,
  leftLabel = '',
  rightLabel = '',
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const lcol = leftOpen ? '256px' : '32px';
  const rcol = rightOpen ? '360px' : '32px';

  return (
    <div className={styles.shell} style={{ '--lcol': lcol, '--rcol': rcol }}>
      <div className={`${styles.colLeft} ${!leftOpen ? styles.collapsed : ''}`}>
        <div className={styles.colContent}>{left}</div>
        {collapsibleLeft && !leftOpen && leftLabel && (
          <span className={styles.rail}>{leftLabel}</span>
        )}
      </div>

      <div className={styles.colCenter}>{children}</div>

      <div className={`${styles.colRight} ${!rightOpen ? styles.collapsed : ''}`}>
        {collapsibleRight && !rightOpen && rightLabel && (
          <span className={styles.rail}>{rightLabel}</span>
        )}
        <div className={styles.colContent}>{right}</div>
      </div>

      {collapsibleLeft && (
        <button
          className={`${styles.chevron} ${styles.chevronLeft}`}
          style={{ left: 'calc(var(--lcol, 256px) - 8px)' }}
          onClick={() => setLeftOpen(o => !o)}
          aria-label={leftOpen ? '左ペインを閉じる' : '左ペインを開く'}
        >
          {leftOpen ? '‹' : '›'}
        </button>
      )}

      {collapsibleRight && (
        <button
          className={`${styles.chevron} ${styles.chevronRight}`}
          style={{ right: 'calc(var(--rcol, 360px) - 8px)' }}
          onClick={() => setRightOpen(o => !o)}
          aria-label={rightOpen ? '右ペインを閉じる' : '右ペインを開く'}
        >
          {rightOpen ? '›' : '‹'}
        </button>
      )}
    </div>
  );
}

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
        {collapsibleLeft && (
          <button
            className={`${styles.chevron} ${styles.chevronLeft}`}
            onClick={() => setLeftOpen(o => !o)}
            aria-label={leftOpen ? '左ペインを閉じる' : '左ペインを開く'}
          >
            {leftOpen ? '‹' : '›'}
          </button>
        )}
        {collapsibleLeft && !leftOpen && leftLabel && (
          <span className={styles.rail}>{leftLabel}</span>
        )}
      </div>

      <div className={styles.colCenter}>{children}</div>

      <div className={`${styles.colRight} ${!rightOpen ? styles.collapsed : ''}`}>
        {collapsibleRight && (
          <button
            className={`${styles.chevron} ${styles.chevronRight}`}
            onClick={() => setRightOpen(o => !o)}
            aria-label={rightOpen ? '右ペインを閉じる' : '右ペインを開く'}
          >
            {rightOpen ? '›' : '‹'}
          </button>
        )}
        {collapsibleRight && !rightOpen && rightLabel && (
          <span className={styles.rail}>{rightLabel}</span>
        )}
        <div className={styles.colContent}>{right}</div>
      </div>
    </div>
  );
}

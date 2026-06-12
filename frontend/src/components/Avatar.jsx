import { useState } from 'react';
import { ROLES, AGENT_PALETTE } from '../lib/constants.js';
import styles from './Avatar.module.css';

function AvatarIcon({ name, role, dead, size, highlight }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const color = AGENT_PALETTE[name] || '#888';
  const roleInfo = role && ROLES[role];
  const sizeClass = size === 'sm' ? styles.sm : size === 'xs' ? styles.xs : '';

  return (
    <div
      className={`${styles.av} ${sizeClass}`}
      style={{
        '--av-c': color,
        boxShadow: highlight ? `0 0 0 2px ${color}` : 'none',
      }}
    >
      <div className={styles.grad} />
      <img
        src={`/icons/${name}.png`}
        alt={name}
        className={styles.img}
        onLoad={() => setImgLoaded(true)}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      {!imgLoaded && <div className={styles.mono}>{(name || '?').charAt(0)}</div>}
      {roleInfo && <div className={styles.roleTag}>{roleInfo.ja}</div>}
      {dead && <div className={styles.deadMark}>死亡</div>}
    </div>
  );
}

function AvatarIconLabeled({ name, role, dead, size, highlight }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const color = AGENT_PALETTE[name] || '#888';
  const roleInfo = role && ROLES[role];
  const sizeClass = size === 'sm' ? styles.sm : size === 'xs' ? styles.xs : '';

  return (
    <div
      className={`${styles.av} ${sizeClass}`}
      style={{
        '--av-c': color,
        boxShadow: highlight ? `0 0 0 2px ${color}` : 'none',
      }}
    >
      <div className={styles.grad} />
      <img
        src={`/icons/${name}.png`}
        alt=""
        className={styles.img}
        onLoad={() => setImgLoaded(true)}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      {!imgLoaded && <div className={styles.mono}>{(name || '?').charAt(0)}</div>}
      {roleInfo && <div className={styles.roleTag}>{roleInfo.ja}</div>}
      {dead && <div className={styles.deadMark}>死亡</div>}
    </div>
  );
}

/**
 * エージェントアイデンティティコンポーネント。
 * label なし: アイコン単体（bare Avatar）。label あり: アイコン＋名前テキスト。
 */
export default function Avatar({ name, role, dead, size = 'md', highlight, label, layout = 'vertical', variant = 'plain' }) {
  if (!label) {
    return <AvatarIcon name={name} role={role} dead={dead} size={size} highlight={highlight} />;
  }

  const layoutClass = layout === 'horizontal' ? styles.chipH : styles.chipV;
  const variantClass = styles[`chip_${variant}`] || '';

  return (
    <span className={`${styles.chip} ${layoutClass} ${variantClass}`} data-layout={layout} data-variant={variant}>
      <AvatarIconLabeled name={name} role={role} dead={dead} size={size} highlight={highlight} />
      <span className={styles.chipLabel} data-testid="avatar-label">{label}</span>
    </span>
  );
}

/**
 * インタラクティブ用途専用。Avatar を button で包む。
 */
export function AvatarButton({ onClick, selected, label, variant, ...avatarProps }) {
  const resolvedVariant = selected ? 'selected' : (variant || 'plain');
  const pressed = selected == null ? undefined : !!selected;
  return (
    <button
      type="button"
      className={styles.avatarBtn}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
    >
      <Avatar {...avatarProps} label={label} variant={resolvedVariant} />
    </button>
  );
}

import { useState } from 'react';
import { ROLES, AGENT_PALETTE } from '../lib/constants.js';
import styles from './Avatar.module.css';

/**
 * エージェントアバター。config/icons/{name}.png があれば画像表示、なければ頭文字フォールバック。
 * @param {string} name     - エージェント名（例: "Mira"）
 * @param {string} role     - 役職キー（例: "Werewolf"）。spectator のみ渡す
 * @param {boolean} dead    - 死亡フラグ
 * @param {'md'|'sm'|'xs'} size
 * @param {boolean} highlight - 個人カラーのアウトラインを表示するか
 */
export default function Avatar({ name, role, dead, size = 'md', highlight }) {
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
      {/* PNG 読み込み成功時は頭文字を非表示 */}
      {!imgLoaded && <div className={styles.mono}>{(name || '?').charAt(0)}</div>}
      {roleInfo && <div className={styles.roleTag}>{roleInfo.ja}</div>}
      {dead && <div className={styles.deadMark}>死亡</div>}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { agentDetailPath } from '../lib/agentDetailPath.js';
import styles from './AgentLink.module.css';

/**
 * AgentDetail への画面遷移リンクラッパー（#586）。
 * `Link to={agentDetailPath(...)}` の組み立てと `.agentLink` CSS を単独で所有する。
 * children ベース: Avatar 描画は所有しない（bare/labeled Avatar・テキスト span いずれも包める）。
 * `viewerMode` は必須（デフォルトなし。渡し忘れを黙って spectator に落とさずテストで顕在化させる）。
 * `style` は Link へ素通し（`display: contents` のため CSS 変数が children に継承される）。
 */
export default function AgentLink({ sessionId, name, viewerMode, style, children }) {
  return (
    <Link to={agentDetailPath(sessionId, name, viewerMode)} className={styles.agentLink} style={style}>
      {children}
    </Link>
  );
}

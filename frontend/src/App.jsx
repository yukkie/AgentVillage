import { useState, useEffect } from 'react';
import Avatar from './components/Avatar.jsx';
import RoleTag from './components/RoleTag.jsx';
import Icon from './components/Icon.jsx';
import { ROLES, AGENT_PALETTE } from './lib/constants.js';
import styles from './App.module.css';

const AGENT_NAMES = Object.keys(AGENT_PALETTE);
const ROLE_KEYS = Object.keys(ROLES);

// state_archive/ から最新セッションの public_log.jsonl を fetch する
async function fetchLatestLog() {
  // Vite dev server 経由でリポジトリルートにアクセス（fs.allow 設定が必要）
  const indexRes = await fetch('/@fs/' + location.origin.replace(location.origin, '') + '../state_archive/');
  // ディレクトリ一覧は fetch では取れないため、固定パスで最新セッションを試す
  // 実運用では Python 側が index.json を書き出す予定（#309 以降で対応）
  throw new Error('state_archive の index.json がまだ存在しません。Python 側で実装後に動作します。');
}

export default function App() {
  const [logLines, setLogLines] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('idle');
  const [fetchError, setFetchError] = useState('');

  // state_archive 動作確認: 既知のセッションから直接 fetch
  useEffect(() => {
    setFetchStatus('loading');
    // 最新セッションのパスを直接指定（動作確認用）
    fetch('../state_archive/20260405_103827/public_log.jsonl')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const lines = text.trim().split('\n').filter(Boolean).slice(0, 10);
        setLogLines(lines);
        setFetchStatus('ok');
      })
      .catch((err) => {
        setFetchError(err.message);
        setFetchStatus('error');
      });
  }, []);

  return (
    <div className={styles.container}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, marginBottom: 8 }}>
        AgentVillage — コンポーネントショーケース
      </h1>
      <p style={{ color: 'var(--tx-3)', fontSize: 12, marginBottom: 40 }}>
        Issue #308 動作確認ページ
      </p>

      {/* Avatar */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Avatar</h2>
        <div className={styles.avatarRow}>
          {AGENT_NAMES.slice(0, 8).map((name) => (
            <Avatar key={name} name={name} role={ROLE_KEYS[Math.floor(Math.random() * ROLE_KEYS.length)]} />
          ))}
        </div>
        <div className={styles.avatarRow} style={{ marginTop: 12 }}>
          <Avatar name="Mira" size="sm" />
          <Avatar name="Ren" size="xs" />
          <Avatar name="Kai" role="Seer" dead />
          <Avatar name="Shiki" role="Werewolf" highlight />
        </div>
      </section>

      {/* RoleTag */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>RoleTag</h2>
        <div className={styles.roleTagRow}>
          {ROLE_KEYS.map((role) => (
            <RoleTag key={role} role={role} />
          ))}
        </div>
      </section>

      {/* Icon */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Icon（config/icons/ PNG）</h2>
        <div className={styles.iconRow}>
          {AGENT_NAMES.slice(0, 10).map((name) => (
            <Icon key={name} name={name} style={{ width: 48, height: 48, borderRadius: 4, border: '1px solid var(--bd)', objectFit: 'cover' }} />
          ))}
        </div>
      </section>

      {/* state_archive fetch テスト */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>state_archive fetch テスト</h2>
        <p className={`${styles.status} ${fetchStatus === 'ok' ? styles.statusOk : fetchStatus === 'error' ? styles.statusErr : ''}`}>
          {fetchStatus === 'idle' && '待機中'}
          {fetchStatus === 'loading' && 'fetch 中...'}
          {fetchStatus === 'ok' && `✓ fetch 成功（先頭 ${logLines.length} 行）`}
          {fetchStatus === 'error' && `✗ fetch 失敗: ${fetchError}`}
        </p>
        {logLines.length > 0 && (
          <div className={styles.logBox}>
            {logLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

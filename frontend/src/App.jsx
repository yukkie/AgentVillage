import { Link, Routes, Route } from 'react-router-dom';
import SpectatorScreen from './screens/SpectatorScreen.jsx';
import GameListScreen from './screens/GameListScreen.jsx';
import AgentDetailScreen from './screens/AgentDetailScreen.jsx';
import styles from './App.module.css';

function NotFoundScreen() {
  return (
    <main className={styles.notFound} aria-labelledby="not-found-title">
      <img
        className={styles.notFoundIcon}
        src="/icons/not-found-wolf.png"
        alt="銀色の狼の404アイコン"
      />
      <h1 id="not-found-title" className={styles.notFoundTitle}>404 - Not Found</h1>
      <p className={styles.notFoundText}>その村への道は見つかりませんでした。</p>
      <Link className={styles.notFoundLink} to="/">村の一覧へ戻る</Link>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GameListScreen />} />
      <Route path="/agent/:agentName" element={<AgentDetailScreen />} />
      <Route path="/game/:sessionId" element={<SpectatorScreen />} />
      <Route path="/game/:sessionId/agent/:agentName" element={<AgentDetailScreen />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}

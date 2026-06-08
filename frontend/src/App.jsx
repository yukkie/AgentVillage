import { Routes, Route } from 'react-router-dom';
import SpectatorScreen from './screens/SpectatorScreen.jsx';
import GameListScreen from './screens/GameListScreen.jsx';
import AgentDetailScreen from './screens/AgentDetailScreen.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GameListScreen />} />
      <Route path="/agent/:agentName" element={<AgentDetailScreen />} />
      <Route path="/game/:sessionId" element={<SpectatorScreen />} />
      <Route path="/game/:sessionId/agent/:agentName" element={<AgentDetailScreen />} />
    </Routes>
  );
}

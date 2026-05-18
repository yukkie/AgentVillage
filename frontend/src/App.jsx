import { useState } from 'react';
import SpectatorScreen from './screens/SpectatorScreen.jsx';
import GameListScreen from './screens/GameListScreen.jsx';
import AgentDetailScreen from './screens/AgentDetailScreen.jsx';

const SCREENS = {
  list: GameListScreen,
  spectator: SpectatorScreen,
  agent: AgentDetailScreen,
};

export default function App() {
  const [screen, setScreen] = useState('list');
  const [selectedGame, setSelectedGame] = useState(null);
  const Screen = SCREENS[screen];

  if (screen === 'list') {
    return (
      <GameListScreen
        onOpenGame={(game) => {
          setSelectedGame(game);
          setScreen('spectator');
        }}
      />
    );
  }

  if (screen === 'spectator') {
    return (
      <SpectatorScreen
        sessionId={selectedGame?.id}
        cast={selectedGame?.cast ?? []}
        title={selectedGame?.title}
        onBack={() => setScreen('list')}
      />
    );
  }

  return <Screen />;
}
